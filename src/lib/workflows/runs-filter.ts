/**
 * THE WORKFLOW-RUNS LIST URL VOCABULARY — the one definition of what `?status=`, `?page=` and
 * `?dryRun=` may be.
 *
 * WHY A SIBLING MODULE AND NOT `page.tsx`. Two ends have to agree, byte for byte, on this
 * vocabulary: `src/app/workflows/[id]/runs/page.tsx` (an async server component) READS these
 * params, and `src/app/workflows/[id]/runs/components/status-filter.tsx` WRITES them. Two copies of
 * the whitelist is the T-37-03 defect class in its runs-list form — a filter chip that writes a
 * status the reader drops, or a dry-run toggle that sets a param the query ignores.
 * `src/lib/views/url-params.ts` and `src/app/duplicates/url-params.ts` are the shape this file
 * copies; `parseShowDismissed` in the latter is the exact precedent for `showDryRuns`.
 *
 * NO RUNTIME DATABASE IMPORT, AND THAT IS A CONSTRAINT RATHER THAN A COINCIDENCE. `status-filter.tsx`
 * is a `"use client"` module, so anything imported here at runtime enters the browser bundle and
 * drags drizzle and `pg` with it. The only import in this file is a TYPE, which is erased at compile
 * time. Never import `@/db`, a `queries.ts`, or anything that reaches one, from here.
 *
 * EVERY FUNCTION IS TOTAL: it returns a valid value for any input and NEVER throws. The input is a
 * crafted URL — every byte of it attacker-authored — and there is no `error.tsx` above
 * `/workflows/[id]/runs`, so a throw here is a blank page rather than a degraded one.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO: build the drizzle `where` accumulator. `and(eq(...))`
 * needs the `workflowRuns` table, which is a runtime `@/db` value — importing it would cost this
 * module every property above. This module returns the DECISION; the server component turns it into
 * SQL. That separation is the whole reason the decision is testable.
 */
import type { WorkflowStatus } from "@/db/schema/workflows"

/**
 * The dry-run reveal param and its ONE truthy value.
 *
 * Exported as constants rather than restated as literals on each side because plan 41-10's client
 * toggle must set exactly what the server component reads. A re-typed `"dryRun"` on one side is a
 * toggle that silently does nothing.
 */
export const SHOW_DRY_RUNS_PARAM = "dryRun"
export const SHOW_DRY_RUNS_VALUE = "1"

/** The first page, and the value every malformed `?page=` collapses to. */
export const MIN_RUNS_PAGE = 1

/**
 * A `?page=` of more digits than this is treated as absent.
 *
 * Nine digits, matching `parseDuplicatePage`'s cap for the same reason and no other: it stops a
 * megabyte of digits being carried into `Number()`, into an `OFFSET` and into a log line (T-41-09).
 * It is NOT a product ceiling on how many pages of runs exist — the query's own `count()` decides
 * that, and a second copy of a real bound is a second thing to keep in sync.
 */
export const MAX_PAGE_DIGITS = 9

/**
 * The five run statuses, as `runs/page.tsx:12` listed them.
 *
 * The union itself is IMPORTED, never re-declared — `satisfies` below makes this array a compile
 * error if `WorkflowStatus` gains a member that is not listed, and a second hand-written copy of
 * the union would let the filter offer a status the engine never writes.
 *
 * Note there is no `cancelled` member: 41-CONTEXT says "Cancelled and completed runs get no replay
 * control", but `cancelled` is not a status this schema has at all. See `replay.ts`.
 *
 * Membership has to be an ARRAY SCAN and not a property lookup on an object map: a lookup keyed by
 * `"__proto__"` returns `Object.prototype`, which would turn a crafted URL into a truthy non-member
 * (T-41-08). The `parseDuplicateTab` precedent.
 */
export const VALID_RUN_STATUSES = Object.freeze([
  "pending",
  "running",
  "completed",
  "failed",
  "waiting",
] as const) satisfies readonly WorkflowStatus[]

/**
 * WHAT THE RUNS LIST IS SHOWING, in three independent decisions.
 *
 * `status: null` means "no status filter", not "an unknown status" — a crafted `?status=cancelled`
 * shows the unfiltered list rather than an empty one, because this surface's posture is that a
 * strange URL renders a page.
 */
export interface RunsFilter {
  page: number
  status: WorkflowStatus | null
  showDryRuns: boolean
}

/**
 * Anything the runs-list params can arrive as.
 *
 * `URLSearchParams` covers the client end (`useSearchParams()` returns a read-only subclass); the
 * record form covers Next.js's `await searchParams`, where a repeated param is an array. Values are
 * `unknown` rather than `string` deliberately — nothing has type-checked the contents of a URL.
 */
export type RunsSearchParamSource =
  | URLSearchParams
  | Readonly<Record<string, unknown>>
  | null
  | undefined

/**
 * The first value of a param.
 *
 * `?status=failed&status=running` arrives as an array from `await searchParams`. Taking the first
 * entry rather than rejecting the pair keeps this surface's posture: a strange URL renders a page.
 */
function firstParam(raw: unknown): unknown {
  return Array.isArray(raw) ? raw[0] : raw
}

/**
 * Read one named key out of any source shape, without ever reaching a prototype and without ever
 * throwing.
 *
 * The `hasOwnProperty` guard stops an INHERITED member being read as a value, so `?toString` is
 * absent rather than function-valued. The `try` covers a source carrying a hostile accessor: a
 * getter that throws is a bizarre input, and a bizarre input must still produce a page.
 */
function readRawValue(source: RunsSearchParamSource, key: string): unknown {
  if (source === null || source === undefined) return undefined
  if (typeof source !== "object") return undefined

  try {
    if (source instanceof URLSearchParams) return source.get(key) ?? undefined
    if (!Object.prototype.hasOwnProperty.call(source, key)) return undefined

    return (source as Record<string, unknown>)[key]
  } catch {
    return undefined
  }
}

/**
 * ARE TEST RUNS VISIBLE? Only when the param is EXACTLY the string `"1"`.
 *
 * 41-CONTEXT locks dry runs as "filtered out of the runs list by default", which makes the DEFAULT
 * branch the one that has to be unmistakable. So this is a strict equality against
 * `SHOW_DRY_RUNS_VALUE` — never `Boolean(raw)`, never `raw !== undefined`, never a `parseInt`. Each
 * of those looser tests passes on `?dryRun=1` and then also reveals rows on `?dryRun=2`,
 * `?dryRun=true` and a bare `?dryRun`, which turns a crafted URL into a way to see runs the default
 * hides (T-41-07). `parseShowDismissed` in `src/app/duplicates/url-params.ts` is the same decision.
 *
 * Not trimmed, for the `narrowFilterValue` reason: a parser that repairs its input is a parser that
 * can be steered, and `status-filter.tsx` writes the literal.
 */
function parseShowDryRuns(source: RunsSearchParamSource): boolean {
  return firstParam(readRawValue(source, SHOW_DRY_RUNS_PARAM)) === SHOW_DRY_RUNS_VALUE
}

/**
 * Narrow `?status=` to one of the five members, or `null`.
 *
 * A frozen-array `find`, so `__proto__`, `constructor` and `toString` are ordinary non-members
 * rather than special cases (T-41-08). No case folding and no trimming: `"FAILED"` and `" failed"`
 * are not statuses, and widening them would be this parser repairing input — with the consequence
 * that the chip's highlighted value and the query's applied value could disagree.
 */
function parseRunStatus(source: RunsSearchParamSource): WorkflowStatus | null {
  const value = firstParam(readRawValue(source, "status"))

  return VALID_RUN_STATUSES.find((candidate) => candidate === value) ?? null
}

/**
 * Narrow `?page=` to a whole page at or above 1.
 *
 * The digits-only test is what rejects `1.5`, `1e9`, `0x10`, `-1`, `Infinity`, `NaN`, `"3px"` and
 * the empty string — all of which `Number()` or `parseInt` would either accept or silently turn
 * into something. The digit CAP is the separate concern (T-41-09): it bounds the value before
 * `Number()` ever sees it.
 */
function parseRunsPage(source: RunsSearchParamSource): number {
  const value = firstParam(readRawValue(source, "page"))

  if (typeof value !== "string") return MIN_RUNS_PAGE
  if (!/^\d+$/.test(value)) return MIN_RUNS_PAGE
  if (value.length > MAX_PAGE_DIGITS) return MIN_RUNS_PAGE

  const parsed = Number(value)

  if (!Number.isSafeInteger(parsed) || parsed < MIN_RUNS_PAGE) return MIN_RUNS_PAGE

  return parsed
}

/**
 * THE INPUT-VALIDATION CONTROL FOR THE RUNS LIST (T-41-07, T-41-08, T-41-09).
 *
 * Whatever comes in — a crafted URL, a repeated param, a `URLSearchParams`, `undefined` — what
 * comes out is a plain object on `Object.prototype` with exactly three fields: a safe integer page
 * at or above 1, a status that is a `WorkflowStatus` member or `null`, and a boolean that is `true`
 * only for the literal `"1"`.
 *
 * The object literal is built from the three parsers' returns and never from the source's keys, so
 * there is no assignment path a crafted key could travel: `?__proto__=…` is not looked up, and the
 * result cannot be polluted.
 */
export function parseRunsSearchParams(source: RunsSearchParamSource): RunsFilter {
  return {
    page: parseRunsPage(source),
    status: parseRunStatus(source),
    showDryRuns: parseShowDryRuns(source),
  }
}

/**
 * THE INVERSE OF `parseRunsSearchParams` — a runs-list URL that carries the WHOLE filter (WR-05).
 *
 * WHY THIS LIVES HERE AND NOT IN `runs-table.tsx`. The pagination links were written
 * `` `/workflows/${workflowId}/runs?page=${page ± 1}` ``, which silently discarded `?status=` and
 * `?dryRun=`: an operator who ticked *Show test runs* on a workflow with 25 runs of which 8 are
 * tests saw "Page 1 of 2", clicked Next, and landed on `?page=2` with test runs hidden again — where
 * the filtered set has 17 rows and ONE page, so the table rendered EMPTY with no pagination row at
 * all and nothing to say the toggle had been dropped. This module already exists because two ends
 * have to agree on this vocabulary byte for byte; a third end that WRITES it belongs here rather
 * than in a component that would restate the literals.
 *
 * ROUND-TRIP, BY CONSTRUCTION: `parseRunsSearchParams(new URLSearchParams(new URL(href, base).search))`
 * returns the filter that was handed in. That property is what the unit gate asserts, and it is the
 * reason `page` is OMITTED at `MIN_RUNS_PAGE` — an absent `?page=` parses back to 1, so emitting it
 * would be noise in the URL rather than information. `status-filter.tsx` deletes the param for the
 * same reason on a filter change.
 *
 * Only the two truthy filters are emitted, so a default view is a clean `/workflows/{id}/runs`.
 * `workflowId` is interpolated as-is: it is a route param this page was already reached through, and
 * every other href in the tree treats it the same way.
 */
export function buildRunsListHref(workflowId: string, filter: RunsFilter): string {
  const params = new URLSearchParams()

  if (filter.status !== null) params.set("status", filter.status)
  if (filter.showDryRuns) params.set(SHOW_DRY_RUNS_PARAM, SHOW_DRY_RUNS_VALUE)
  if (filter.page > MIN_RUNS_PAGE) params.set("page", String(filter.page))

  const query = params.toString()

  return `/workflows/${workflowId}/runs${query ? `?${query}` : ""}`
}
