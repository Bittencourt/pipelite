/**
 * MAPPING A POSTGRES ERROR TO AN RFC 7807 PROBLEM, INSTEAD OF LETTING IT BECOME A 500.
 *
 * WHY THIS EXISTS.
 *
 * `withApiAuth` has no `try`/`catch` (`src/lib/api/auth.ts`), and until WR-01 none of the four
 * `/api/v1` routes this phase edited wrapped its write either. Every database error therefore
 * propagated out of the handler as a rejected promise, which Next.js turns into a 500 — and several
 * were reachable with a body that passes zod:
 *
 *   - `PUT /api/v1/activities/:id` with `{"due_at": null}` — `activities.due_date` is `.notNull()`
 *     while the API schema declared the field nullable, so the update executed
 *     `due_date = null` and PostgreSQL answered
 *     `23502 null value in column "due_date" violates not-null constraint`.
 *   - the same route with `{"type_id": "does-not-exist"}` — `23503`, where the POST path already
 *     returned a clean 422 for the identical input. Two verbs disagreeing on one error.
 *   - `POST /api/v1/stages` with a `name` that already exists in the caller's OWN pipeline —
 *     `23505` on the unique `(pipeline_id, name)` index, where 409 is the answer.
 *   - `DELETE /api/v1/stages/:id` for a stage that still has deals — `23503` the other way round,
 *     a child row blocking a hard delete, which is also a 409.
 *
 * A 500 is not a harmless mislabelling. It tells the caller "this failed for a reason on our side,
 * retry it", when in fact the request will fail identically forever — the same reasoning the OpenAPI
 * coverage gate applies to an undeclared 403.
 *
 * ── WHERE THE REAL FIX IS, AND WHERE THIS IS ────────────────────────────────────────────────────
 *
 * PREFER MAKING THE STATE UNREPRESENTABLE. `due_at` is now `z.string().datetime()` and non-nullable
 * on PUT, matching the column; `position` is now `z.number().int()` bounded to the `int4` range. Those
 * two cases never reach PostgreSQL at all any more, and that is strictly better than catching them:
 * the caller gets a field name and a code rather than a mapped database error.
 *
 * This module is the BACKSTOP for what a schema cannot express — a unique index over two columns, a
 * foreign key to a row that may vanish between the check and the write, a child row blocking a
 * delete — plus the last-resort branch that converts anything unforeseen into a LOGGED, well-formed
 * 500 rather than an unhandled rejection with whatever Next.js decides to render.
 *
 * ── THE CHECK-THEN-WRITE RACE IS WHY THE FK BRANCHES ARE NOT DEAD CODE ──────────────────────────
 *
 * `activities/[id]/route.ts` validates `deal_id` and `type_id` before the update, and
 * `stages/route.ts` validates `pipeline_id` before the insert. Those are separate statements from
 * the write, so a concurrent delete between them still produces `23503`. Validate AND catch.
 */
import type { NextResponse } from "next/server"

import { log } from "@/lib/log"

import { Problems } from "./errors"

/** `23505 unique_violation` — a value collides with an existing row on a unique index. */
const UNIQUE_VIOLATION = "23505"
/** `23503 foreign_key_violation` — a referenced row is missing, or a referencing row still exists. */
const FOREIGN_KEY_VIOLATION = "23503"
/** `23502 not_null_violation` — a `NOT NULL` column was handed `null`. */
const NOT_NULL_VIOLATION = "23502"
/** `22003 numeric_value_out_of_range` — e.g. `1e12` into an `integer` column. */
const NUMERIC_VALUE_OUT_OF_RANGE = "22003"
/** `22P02 invalid_text_representation` — a value that cannot be cast to the column's type. */
const INVALID_TEXT_REPRESENTATION = "22P02"
/** `22007`/`22008` — an unparseable or out-of-range datetime. */
const INVALID_DATETIME_FORMAT = "22007"
const DATETIME_FIELD_OVERFLOW = "22008"

/**
 * The codes that mean "the VALUES in this request are not acceptable", i.e. a 422 rather than a 500.
 * `23505` is deliberately absent: a collision is a state conflict, not a malformed value.
 */
const INVALID_VALUE_CODES = new Set([
  FOREIGN_KEY_VIOLATION,
  NOT_NULL_VIOLATION,
  NUMERIC_VALUE_OUT_OF_RANGE,
  INVALID_TEXT_REPRESENTATION,
  INVALID_DATETIME_FORMAT,
  DATETIME_FIELD_OVERFLOW,
])

/**
 * How far down the `cause` chain to look. Two is enough for drizzle today; the bound exists so a
 * cyclic `cause` — which is constructible — cannot spin here, in the error path, where a hang is
 * indistinguishable from the request having stalled.
 */
const MAX_CAUSE_DEPTH = 5

/**
 * The five-character SQLSTATE for `error`, or `undefined` for anything that does not carry one.
 *
 * ⚠ IT WALKS `cause`, AND THAT IS THE WHOLE FUNCTION. DRIZZLE WRAPS.
 *
 * A mapper reading `.code` off the top-level value looks correct, passes every unit test written
 * with a synthetic `postgres.js` error, and NEVER FIRES IN PRODUCTION — because what actually
 * arrives from a drizzle write is:
 *
 *     Error: Failed query: insert into "stages" (...) values (...)
 *       params: ...
 *     cause: PostgresError: duplicate key value violates unique constraint "pipeline_name_unique"
 *            code: '23505'
 *
 * The SQLSTATE is on `cause`. That is measured, not inferred: the first version of this module read
 * only the top level, its 24 unit assertions were green, and `stages-scope.db.test.ts` — driving the
 * real route against real PostgreSQL — answered **500 where 409 was expected**. Both layers of test
 * were necessary to find it, and that is why the behavioural cells exist.
 *
 * Read defensively rather than by casting at every step: this runs in a `catch`, where the value is
 * `unknown` by language rule and can be a string, a `RangeError` from `Date.prototype.toISOString`,
 * or `null`. Reading `.code` off any of those must not throw a SECOND error out of the error path.
 */
export function postgresErrorCode(error: unknown): string | undefined {
  let current: unknown = error

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== "object" || current === null) return undefined

    const code = (current as { code?: unknown }).code
    if (typeof code === "string") return code

    current = (current as { cause?: unknown }).cause
  }

  return undefined
}

/** What to say when a mapped code is hit. Every message is caller-supplied, so it names the entity. */
export interface WriteErrorMessages {
  /**
   * Detail for `23505`, answered as 409. Omit only if the table has no unique index the caller can
   * collide with — a wrong omission turns a conflict into a 500.
   */
  conflict?: string
  /** The `field` a 422 is attributed to. Defaults to `"body"`, which is what zod failures use. */
  field?: string
}

/**
 * Map an error thrown by an INSERT or UPDATE.
 *
 * `23505` becomes 409 when the caller supplied a `conflict` message; the value-domain codes become a
 * 422 naming `field`; everything else is logged and becomes a well-formed 500.
 */
export function mapWriteError(
  scope: string,
  error: unknown,
  messages: WriteErrorMessages = {}
): NextResponse {
  const code = postgresErrorCode(error)

  if (code === UNIQUE_VIOLATION && messages.conflict !== undefined) {
    return Problems.conflict(messages.conflict)
  }

  if (code !== undefined && INVALID_VALUE_CODES.has(code)) {
    return Problems.validation([
      {
        field: messages.field ?? "body",
        code: "invalid_value",
        message: `The request could not be applied (database error ${code}).`,
      },
    ])
  }

  // Unforeseen. Logged with the original error so it is diagnosable, and answered as a PROBLEM
  // DOCUMENT rather than as an unhandled rejection — the caller gets the same shape as every other
  // error from this API instead of whatever the framework renders.
  log.error(scope, "unmapped database error on write", { err: error, code })
  return Problems.internalError()
}

/**
 * Map an error thrown by a DELETE.
 *
 * `23503` here means the OPPOSITE of what it means on a write: a child row still references this one,
 * so the delete is refused. That is a 409, not a 422 — nothing about the request was malformed.
 */
export function mapDeleteError(
  scope: string,
  error: unknown,
  messages: { referenced: string }
): NextResponse {
  const code = postgresErrorCode(error)

  if (code === FOREIGN_KEY_VIOLATION) {
    return Problems.conflict(messages.referenced)
  }

  log.error(scope, "unmapped database error on delete", { err: error, code })
  return Problems.internalError()
}
