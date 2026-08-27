/**
 * THE COUNT HALF OF THE SELECTIVITY DECISION (SEC-03). The only half that touches the database.
 *
 * `decideSelectivity` (`./export-selectivity.ts`) answers "may this many rows leave, out of this
 * many?". This module answers "how many, out of how many?" — and nothing else. No verdict, no
 * session, no call site.
 *
 * ── 1. WHY THIS IS A THIRD FILE AND NOT PART OF `export-selectivity.ts` ──────────────────────────
 *
 * `export-selectivity.ts` is PURE and imports no database, and that is not tidiness — it is what
 * makes its floor provable at all. `MIN_EXPORT_ROWS = 1_000` guards a branch NO DATABASE IN THIS
 * REPOSITORY CAN REACH: the fraction only exceeds the floor above 2,500 rows, every live table is at
 * least 25,195 rows (organizations 46,054 · people 38,348 · deals 25,195 · activities 79,022), and
 * `pipelite_dedup_test` is provisioned `--schema-only` and starts EMPTY. A pure function with
 * injected values is the ONLY instrument that reaches that branch.
 *
 * `countExportMatches` must import `@/db`, and `src/db/index.ts` THROWS at module load when
 * `DATABASE_URL` is unset. Put the two in one file and
 * `__tests__/export-selectivity.test.ts` stops loading in the base project, so the small-N cells —
 * the only proof the floor will ever have — become unrunnable. Hence: arithmetic there, I/O here,
 * and `view-export-guard.ts` untouched, synchronous and database-free as its own header promises.
 *
 * ── 2. TWO COUNTS, AND THE PERFORMANCE ARGUMENT FOR THEM DOES **NOT** HOLD ───────────────────────
 *
 * This section says the opposite of what plan 50-04 predicted, because the prediction was measured
 * and did not reproduce. It is written this way deliberately: a source comment asserting a
 * measurement nobody re-took is how `BATCH_SIZE = 200` became a "finding" (see the note in
 * `export-selectivity.ts` on exactly that comment shape).
 *
 * MEASURED at execution time, `EXPLAIN (ANALYZE)` against the live `pipelite` database, three runs
 * each, organizations (46,054 rows) with the three-column `search=a` predicate:
 *
 *   COUNT(*) filtered      44.5 / 46.4 / 50.6 ms     ~47 ms
 *   COUNT(*) unfiltered    12.9 / 12.8 / 13.0 ms     ~12.9 ms
 *   ── the two statements this module issues: ~60 ms ──
 *   ONE `count(*) FILTER (WHERE …) , count(*)`        45.6 / 46.1 / 49.1 ms     ~47 ms
 *
 * PLAN 50-04 STATED THE COMBINED FORM AT **93.5 ms** AND CONCLUDED IT WAS SLOWER. It is not. It
 * costs the same as the filtered count ALONE, which is what one would expect — both forms scan all
 * 46,054 rows and evaluate the ILIKE on each, and the filtered count has no index to short-circuit
 * against, so the plan's stated mechanism ("the FILTER form evaluates the ILIKE inside the aggregate
 * on every row instead of short-circuiting in the scan filter") does not describe either plan.
 *
 * SO THE HONEST POSITION: the combined aggregate is **~13 ms FASTER** per export attempt — precisely
 * the cost of the second statement it eliminates. Two counts are kept here because 50-04 locks them
 * as a design constraint and because they keep this module composable (`total` is one call over a
 * base predicate, `matched` one call over the shared builder, with no aggregate to keep in step).
 * But that is a STRUCTURAL preference costing ~13 ms, not the performance win the plan described.
 *
 * **AND NO ASSERTION ANYWHERE DEFENDS THE CHOICE EITHER WAY.** Driven as ablation 4 of plan 50-04:
 * replacing the two counts with a single combined `FILTER` aggregate leaves every cell in
 * `export-selectivity-live.test.ts` GREEN, because the NUMBERS are identical. A future reader must
 * not mistake the green suite for protection of this decision. Re-measure before changing it — and
 * do not cite the 93.5 ms figure, which does not reproduce on this data.
 *
 * ── 3. WHY NOTHING IS CACHED ─────────────────────────────────────────────────────────────────────
 *
 * A cached `total` is a staleness bug in a SECURITY CONTROL: the denominator drifts, the allowance
 * drifts with it, and exports get admitted against a table size that no longer exists. An export is
 * a rare, user-initiated action — there is nothing to amortise. Two counts, per attempt, always.
 *
 * ── 4. THE HAZARD THIS MODULE EXISTS TO AVOID ────────────────────────────────────────────────────
 *
 * A `matched` counted from a HAND-COPIED condition list authorizes on a number the export does not
 * honour. Both halves keep "working"; they simply stop agreeing, silently, the first time one side
 * is edited — and the direction of the disagreement is permissive, because a count that is smaller
 * than the export admits more than the rule intends.
 *
 * The four condition arrays were PRIVATE LOCALS inside the four `fetch*` functions until plan 50-04
 * pulled them out. So this module does not build a predicate at all: it calls
 * `buildExportConditions`, the same function `fetchFilteredData` calls, and there is exactly one
 * `buildExportConditions(` in this file.
 *
 * `__tests__/view-filters.test.ts` is what keeps it that way, from both sides: its no-local-push
 * cell asserts every `fetch*` body contains no `conditions.push`, and its counter cell asserts this
 * file contains no `conditions.push` and calls the shared builder exactly once. If you find yourself
 * writing `conditions.push` here, the design has been abandoned.
 */
import { count, and, isNull } from "drizzle-orm"
import type { SQL } from "drizzle-orm"
import type { PgTable } from "drizzle-orm/pg-core"
import { db } from "@/db"
import { organizations, people, deals, activities } from "@/db/schema"
import { buildExportConditions } from "./formatters"
import type { ExportEntityType, ExportFilters } from "./types"

/**
 * The two numbers `decideSelectivity` consumes.
 *
 * `matched` — rows the export WOULD return for these filters, over the shared predicate.
 * `total` — rows in the table, under the fetchers' own BASE predicate and nothing else.
 */
export interface ExportCounts {
  matched: number
  total: number
}

/**
 * Table and base predicate per entity type, as a TOTAL `Record`, so a fifth entity type is a
 * COMPILE error here rather than an entity type with a silently missing denominator.
 *
 * THE BASE PREDICATE IS `isNull(deletedAt)` AND NOTHING ELSE, matching the first element every
 * builder in `formatters.ts` starts its array with. Deliberately NOT viewer-scoped: there is no
 * viewer scoping anywhere in the export read path, and that absence is the exposure SEC-03 is
 * bounding — not something to encode into the denominator, where it would INFLATE `total`, raise the
 * allowance, and admit broader exports than the rule intends.
 */
const BASE_BY_ENTITY: Record<ExportEntityType, { table: PgTable; base: () => SQL[] }> = {
  organization: { table: organizations, base: () => [isNull(organizations.deletedAt)] },
  person: { table: people, base: () => [isNull(people.deletedAt)] },
  deal: { table: deals, base: () => [isNull(deals.deletedAt)] },
  activity: { table: activities, base: () => [isNull(activities.deletedAt)] },
}

/** One `select count(*)` over a condition array, in the shape `organizations/route.ts:35-38` uses. */
async function countOver(entityType: ExportEntityType, conditions: SQL[]): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(BASE_BY_ENTITY[entityType].table)
    .where(and(...conditions))

  // `count()` maps to a bigint in postgres, which postgres-js hands back as a string on some
  // column shapes. `Number()` rather than a cast, so a string 13355 does not compare unequal to
  // the number 13355 in the equality proof.
  return Number(row.n)
}

/**
 * HOW MANY ROWS WOULD THIS EXPORT RETURN, AND OUT OF HOW MANY?
 *
 * `matched` is counted over `buildExportConditions(entityType, filters)` — the SAME array the
 * fetcher for that entity type composes into its `findMany`. Not a copy of it, not an equivalent
 * spelling of it: the same function call. That is the whole point of the module, and
 * `export-selectivity-live.test.ts` proves the equality against real data on three filters across
 * three entity types plus a zero-match case.
 *
 * `total` is counted over the base predicate alone. With `filters` undefined the two are EQUAL, and
 * that is not a degenerate case to be special-cased — it is the exposure, stated as arithmetic: an
 * unfiltered export is the whole live table.
 *
 * TWO ROUND TRIPS, uncached, per attempt. See sections 2 and 3 of the header.
 */
export async function countExportMatches(
  entityType: ExportEntityType,
  filters: ExportFilters | undefined
): Promise<ExportCounts> {
  const matched = await countOver(entityType, buildExportConditions(entityType, filters))
  const total = await countOver(entityType, BASE_BY_ENTITY[entityType].base())

  return { matched, total }
}
