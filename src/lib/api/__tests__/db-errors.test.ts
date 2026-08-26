/**
 * `src/lib/api/db-errors.ts` — the mapper that stops a reachable database error becoming a 500.
 *
 * WHAT THIS FILE IS FOR, AND WHAT IT IS NOT.
 *
 * It asserts the MAPPING: given a `postgres.js`-shaped error carrying a SQLSTATE, which status and
 * which body come back. It does NOT assert that any particular route reaches any particular code —
 * that is the routes' own suites, and for the two cases that were genuinely 500 in production it is
 * `activities-scope.db.test.ts` and `stages-scope.db.test.ts` against real PostgreSQL.
 *
 * The SQLSTATEs below are not invented. Each was produced by this repository's own schema and is
 * quoted with the statement that produced it in `db-errors.ts`'s header.
 *
 * ⚠ THE VACUITY TRAP THIS FILE AVOIDS. A mapper that returned 500 for everything satisfies "unknown
 * errors become 500", and a mapper that returned 422 for everything satisfies each value-domain
 * case. So every assertion here is a STATUS PLUS A BODY, the two directions are asserted against
 * each other, and there is an explicit "these codes must NOT be mapped to 422" cell.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

vi.mock("@/lib/log", () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { log } from "@/lib/log"
import { mapDeleteError, mapWriteError, postgresErrorCode } from "@/lib/api/db-errors"

const mockLogError = vi.mocked(log.error)

/** A `postgres.js` error carries its SQLSTATE on `.code`. Nothing else here matters to the mapper. */
function pgError(code: string, message = "database said no"): Error & { code: string } {
  return Object.assign(new Error(message), { code })
}

/**
 * WHAT A DRIZZLE WRITE ACTUALLY THROWS, and the shape this file originally got wrong.
 *
 * Drizzle wraps: the outer value is a plain `Error` whose message is `Failed query: ...` and whose
 * `cause` is the `postgres.js` error carrying the SQLSTATE. Captured verbatim from a real
 * `POST /api/v1/stages` duplicate-name insert against PostgreSQL 16.
 */
function drizzleWrapped(code: string, detail: string): Error {
  return Object.assign(
    new Error(`Failed query: insert into "stages" (...) values (...)\nparams: ...`),
    { cause: Object.assign(new Error(detail), { code, name: "PostgresError" }) }
  )
}

interface ProblemBody {
  type: string
  status: number
  detail: string
  errors?: { field: string; code: string; message: string }[]
}

async function problemOf(response: { status: number; json: () => Promise<unknown> }) {
  return { status: response.status, body: (await response.json()) as ProblemBody }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("postgresErrorCode — reading `.code` out of an unknown, without throwing a second error", () => {
  it("returns the SQLSTATE from a postgres.js error", () => {
    expect(postgresErrorCode(pgError("23505"))).toBe("23505")
  })

  it("finds the SQLSTATE on `cause` — WHICH IS WHERE DRIZZLE PUTS IT", () => {
    // ⚠ THE CELL THIS FILE WAS MISSING, and the reason it matters more than any other here.
    //
    // The first version of `postgresErrorCode` read `.code` off the top-level value only. Every
    // assertion in this file was GREEN, and `stages-scope.db.test.ts` — the same code driven against
    // real PostgreSQL — answered 500 where 409 was expected, because a drizzle write throws
    // `Error: Failed query: ...` with the `PostgresError` on `cause`. A mapper that never fires is
    // worse than no mapper: it looks like coverage.
    const wrapped = drizzleWrapped(
      "23505",
      'duplicate key value violates unique constraint "pipeline_name_unique"'
    )

    // FLOOR: the top level really does NOT carry a code, so the assertion below is about the walk.
    expect((wrapped as { code?: unknown }).code).toBeUndefined()
    expect(postgresErrorCode(wrapped)).toBe("23505")
  })

  it("walks more than one level of `cause`", () => {
    const inner = pgError("23503")
    const middle = Object.assign(new Error("wrapper"), { cause: inner })
    const outer = Object.assign(new Error("outer wrapper"), { cause: middle })

    expect(postgresErrorCode(outer)).toBe("23503")
  })

  it("terminates on a CYCLIC cause instead of spinning in the error path", () => {
    // A cyclic `cause` is constructible, and a hang here is indistinguishable to a caller from the
    // request having stalled — strictly worse than the 500 this module replaces.
    const a: { cause?: unknown } = {}
    const b: { cause?: unknown } = { cause: a }
    a.cause = b

    expect(postgresErrorCode(a)).toBeUndefined()
  })

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "23505"],
    ["a number", 23505],
    ["a plain Error with no code", new Error("boom")],
    ["an object whose code is not a string", { code: 23505 }],
  ])("returns undefined for %s", (_label, value) => {
    // This runs inside a `catch`, where the value is `unknown` by language rule. A `RangeError` from
    // `Date.prototype.toISOString` and a rejected string both land here, and reading `.code` off
    // either must not throw a second error out of the error path.
    expect(postgresErrorCode(value)).toBeUndefined()
  })
})

describe("mapWriteError — INSERT and UPDATE", () => {
  it("maps 23505 to 409 with the caller's conflict detail", async () => {
    const { status, body } = await problemOf(
      mapWriteError("test", pgError("23505"), { conflict: "A stage with that name already exists" })
    )

    expect(status).toBe(409)
    expect(body.type).toMatch(/\/CONFLICT$/)
    expect(body.detail).toBe("A stage with that name already exists")
    // A conflict is an expected outcome, not an incident.
    expect(mockLogError).not.toHaveBeenCalled()
  })

  it("maps a DRIZZLE-WRAPPED 23505 to 409 — the shape a real route actually throws", async () => {
    const { status, body } = await problemOf(
      mapWriteError(
        "test",
        drizzleWrapped("23505", 'duplicate key value violates unique constraint "pipeline_name_unique"'),
        { conflict: "A stage with that name already exists in this pipeline" }
      )
    )

    expect(status).toBe(409)
    expect(body.detail).toBe("A stage with that name already exists in this pipeline")
  })

  it("falls through 23505 to a LOGGED 500 when the caller named no conflict message", async () => {
    // Deliberate: a route that can collide but did not say so has a gap, and a silent 409 with an
    // empty detail would hide it. The 500 is logged so it is findable.
    const { status } = await problemOf(mapWriteError("test", pgError("23505")))

    expect(status).toBe(500)
    expect(mockLogError).toHaveBeenCalledTimes(1)
  })

  it.each([
    ["23503", "foreign key violation — a referenced row is missing"],
    ["23502", "not-null violation — the `due_at: null` case"],
    ["22003", "numeric out of range — the `position: 1e12` case"],
    ["22P02", "invalid text representation"],
    ["22007", "invalid datetime format"],
    ["22008", "datetime field overflow"],
  ])("maps %s to 422 (%s)", async (code) => {
    const { status, body } = await problemOf(
      mapWriteError("test", pgError(code), { field: "due_at" })
    )

    expect(status).toBe(422)
    expect(body.type).toMatch(/\/VALIDATION_ERROR$/)
    expect(body.errors).toEqual([
      { field: "due_at", code: "invalid_value", message: expect.stringContaining(code) },
    ])
    // A rejected request is not an incident either.
    expect(mockLogError).not.toHaveBeenCalled()
  })

  it("attributes an unnamed field to `body`, matching what zod failures use", async () => {
    const { body } = await problemOf(mapWriteError("test", pgError("23503")))

    expect(body.errors?.[0].field).toBe("body")
  })

  it.each([
    ["42601", "syntax error — our bug, not the caller's"],
    ["42703", "undefined column — our bug"],
    ["40001", "serialization failure — genuinely transient"],
    ["57014", "query cancelled"],
  ])("does NOT map %s to 422; it is a LOGGED 500 (%s)", async (code) => {
    // The inverted-polarity cell. Without it, a mapper that answered 422 for every SQLSTATE would
    // satisfy every assertion above — and would then tell a caller that OUR syntax error was their
    // malformed request, which is worse than the 500 this module replaces.
    const { status, body } = await problemOf(mapWriteError("test", pgError(code)))

    expect(status).toBe(500)
    expect(body.type).toMatch(/\/INTERNAL_ERROR$/)
    expect(body.errors).toBeUndefined()
    expect(mockLogError).toHaveBeenCalledTimes(1)
    expect(mockLogError.mock.calls[0][2]).toMatchObject({ code })
  })

  it("logs and 500s a non-postgres throw, without letting it escape", async () => {
    // `new Date("not-a-date").toISOString()` throws `RangeError: Invalid time value` inside
    // postgres.js's serializer, which carries no SQLSTATE at all.
    const { status } = await problemOf(
      mapWriteError("test", new RangeError("Invalid time value"))
    )

    expect(status).toBe(500)
    expect(mockLogError).toHaveBeenCalledTimes(1)
  })
})

describe("mapDeleteError — DELETE, where 23503 means the opposite thing", () => {
  it("maps 23503 to 409, because a child row is blocking the delete", async () => {
    // On a write, 23503 means "the row you referenced is gone" — a 422. On a delete it means "a row
    // still references THIS one" — nothing about the request was malformed, so 409.
    const { status, body } = await problemOf(
      mapDeleteError("test", pgError("23503"), { referenced: "Stage still has deals" })
    )

    expect(status).toBe(409)
    expect(body.type).toMatch(/\/CONFLICT$/)
    expect(body.detail).toBe("Stage still has deals")
    expect(mockLogError).not.toHaveBeenCalled()
  })

  it("does not answer 409 for any other code — those are LOGGED 500s", async () => {
    for (const code of ["23505", "23502", "22003", "42601"]) {
      vi.clearAllMocks()
      const { status } = await problemOf(
        mapDeleteError("test", pgError(code), { referenced: "should not be used" })
      )

      expect(status, `SQLSTATE ${code} must not be reported as a conflict`).toBe(500)
      expect(mockLogError).toHaveBeenCalledTimes(1)
    }
  })

  it("the two mappers disagree about 23503, and that disagreement is the point", async () => {
    // Asserted side by side rather than left to two separate cells, because "same code, two
    // meanings, decided by the statement that threw it" is the whole design and a future
    // consolidation into one mapper would silently lose it.
    const onWrite = await problemOf(mapWriteError("test", pgError("23503")))
    const onDelete = await problemOf(
      mapDeleteError("test", pgError("23503"), { referenced: "still referenced" })
    )

    expect(onWrite.status).toBe(422)
    expect(onDelete.status).toBe(409)
  })
})
