/**
 * DEDUP-01 — the read layer for `/duplicates` and `/duplicates/[pairId]`.
 *
 * Everything the review surfaces know about the database lives here, and four rules hold across
 * every function in the file. They are `src/lib/trash/queries.ts`'s rules, adapted: that module is
 * the exact analog for a server-rendered, tabbed, paged, fail-closed read surface, and this one
 * follows it deliberately rather than reinventing the shape.
 *
 *   1. THE SCOPE PREDICATE IS PART OF THE QUERY, AND IT IS ONE PREDICATE. `pairScope` returns a
 *      composed `SQL` that the tab counts and the row page both pass to the database. Returning a
 *      composed condition rather than re-deriving the scope at each call site is what makes it
 *      impossible for a count and a list to drift: `Organizations (12)` above three cards is a
 *      defect the user can see and cannot explain (39-UI-SPEC L-2).
 *   2. THE STATUS MAPPING IS WRITTEN OUT ONCE, in `pairStatusFor`. `duplicate_pairs.status` has
 *      four values and the review list shows exactly two of them; `merged` and `superseded` are
 *      never rendered anywhere, and the only thing that guarantees it is that no read in this file
 *      builds a status predicate by hand.
 *   3. NOTHING HERE RAISES. `/duplicates` has no `error.tsx` above it, exactly like `/trash`, so an
 *      unguarded rejection takes the whole page down. Every function fails into a value the page
 *      can render: `null`, or `{ ok: false }`. The plan's acceptance criteria GREP THIS FILE for
 *      the absence of the raising keyword, so phrase any future comment about it the way this one
 *      is phrased — a grep cannot tell code from prose (39-06 recorded the same lesson the hard
 *      way).
 *   4. `{ ok: false }` RATHER THAN AN EMPTY SUCCESS. 39-UI-SPEC's empty-state contract has THREE
 *      distinct emptinesses — never scanned, scanned with zero pairs, and every pair dismissed —
 *      and a failed read is a fourth thing that must not be reported as any of them. An empty
 *      success would tell a user "no duplicates found" on the strength of a broken query.
 *
 * Logs carry identifiers, counts and bounds only, never a record's contents (T-39-10).
 */

import { and, asc, count, desc, eq, isNull, type SQL } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { db } from "@/db"
import { deals, duplicatePairs, notes, organizations, people } from "@/db/schema"

import { PAIR_PAGE_SIZE } from "./constants"
import type {
  DedupReason,
  DedupTier,
  DuplicatePairStatus,
  MergeableEntityType,
} from "./types"

const LOG_PREFIX = "[dedup-queries]"

/**
 * How deep a caller may page.
 *
 * The read is CUMULATIVE (see `listPairs`), so `page` multiplies the row count fetched in a single
 * query and it arrives from the URL — 39-UI-SPEC L-1 puts all state there. Without a cap,
 * `?page=100000` is a 2.5-million-row fetch from any authenticated browser, which is the same
 * shape of defect `MAX_TRASH_PAGE` exists to bound on `/trash`. Forty pages is 1,000 pairs, well
 * past the point where a human is still triaging rather than scrolling.
 */
export const MAX_PAIR_PAGE = 40

// ---------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------

/** One side of a pair, as a review card renders it. */
export interface PairSideSummary {
  id: string
  /**
   * `null` WHEN THE RECORD HAS BEEN DELETED SINCE THE SCAN, not when it has no name.
   *
   * The join carries the visibility predicate, so a record that went to Trash between the scan and
   * this read matches nothing and every projected column arrives null. The pair still renders —
   * the card can say the record is gone, which is honest — rather than vanishing from a list whose
   * count came from a query that did not join at all.
   */
  name: string | null
  /** The normalized name both sides were compared on. */
  normName: string | null
  /** People only. */
  email: string | null
  /** People only, digits as stored. */
  phone: string | null
  /** Organizations only: the blob the configured identity field is read out of. */
  customFields: Record<string, unknown> | null
}

/** One row of the review list. */
export interface PairListRow {
  id: string
  entityType: MergeableEntityType
  tier: DedupTier
  reason: DedupReason
  score: number | null
  status: DuplicatePairStatus
  createdAt: Date
  recordA: PairSideSummary
  recordB: PairSideSummary
}

/** The tab labels' numbers: one cell per (entity type, tab). */
export type PairCounts = Record<MergeableEntityType, { open: number; dismissed: number }>

/**
 * What 39-UI-SPEC M-6's "what moves" list promises, per record.
 *
 * `people` is `null` rather than `0` for a person pair. Zero is a number the UI would render as a
 * line saying "0 people move"; `null` is the absence of the concept, and a person has no people.
 */
export interface PairChildCounts {
  deals: number
  people: number | null
  notes: number
}

export interface PairRecordDetail {
  id: string
  /** The whole row, so `buildMergeFieldGroups` can compare every column (plan 39-15). */
  row: Record<string, unknown>
  childCounts: PairChildCounts
}

export interface PairDetail {
  pair: {
    id: string
    entityType: MergeableEntityType
    recordAId: string
    recordBId: string
    tier: DedupTier
    reason: DedupReason
    score: number | null
    status: DuplicatePairStatus
  }
  recordA: PairRecordDetail
  recordB: PairRecordDetail
}

export interface ListPairsInput {
  entityType: MergeableEntityType
  /** 1-based, from the URL. Clamped to `[1, MAX_PAIR_PAGE]`. */
  page: number
  dismissed: boolean
}

// ---------------------------------------------------------------------------------------
// The shared scope
// ---------------------------------------------------------------------------------------

/**
 * WHICH STATUS A TAB SHOWS. The single definition, exported so a test can run it over a fixture.
 *
 * `duplicate_pairs.status` has four values. The review list shows `open`, the dismissed view shows
 * `dismissed`, and `merged` and `superseded` ARE NEVER SHOWN ANYWHERE — a pair whose records were
 * merged is history, and a `superseded` pair is one a rescan retired without destroying the record
 * of a human having already looked at it. Neither belongs in a queue of decisions still to make.
 */
export function pairStatusFor(dismissed: boolean): DuplicatePairStatus {
  return dismissed ? "dismissed" : "open"
}

/**
 * THE PREDICATE EVERY READ IN THIS MODULE SHARES.
 *
 * Both halves are composed into ONE condition so the database applies them together, and the
 * counts and the rows call this with the same arguments and therefore get the same scope. That is
 * the whole of rule 1: a count a user cannot explain never appears.
 *
 * The column order matches `duplicate_pairs_list_idx` on
 * `(entity_type, status, created_at)`, so the page is an index scan rather than a filter.
 */
export function pairScope(entityType: MergeableEntityType, dismissed: boolean): SQL {
  return and(
    eq(duplicatePairs.entityType, entityType),
    eq(duplicatePairs.status, pairStatusFor(dismissed))
  ) as SQL
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

// ---------------------------------------------------------------------------------------
// The tab counts
// ---------------------------------------------------------------------------------------

/**
 * THE FOUR TAB NUMBERS, SCOPED EXACTLY AS THE ROWS ARE.
 *
 * Both entity types and both tabs, issued together, each carrying the SAME `pairScope` its row
 * query carries.
 *
 * Returns `null` — NOT a record of zeros — when any of the four rejects. Zeros are a number, and a
 * wrong number rendered confidently is worse than no number; the tabs omit their counts instead,
 * which is the `trash-tabs.tsx` `counts === null` precedent.
 */
export async function countPairs(): Promise<PairCounts | null> {
  const cells: { entityType: MergeableEntityType; dismissed: boolean }[] = [
    { entityType: "organization", dismissed: false },
    { entityType: "organization", dismissed: true },
    { entityType: "person", dismissed: false },
    { entityType: "person", dismissed: true },
  ]

  try {
    const results = await Promise.all(
      cells.map((cell) =>
        db
          .select({ value: count() })
          .from(duplicatePairs)
          .where(pairScope(cell.entityType, cell.dismissed))
      )
    )

    const value = (index: number) => results[index]?.[0]?.value ?? 0

    return {
      organization: { open: value(0), dismissed: value(1) },
      person: { open: value(2), dismissed: value(3) },
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} countPairs failed:`, error)
    return null
  }
}

// ---------------------------------------------------------------------------------------
// The page of pairs
// ---------------------------------------------------------------------------------------

/**
 * ONE PAGE OF THE ACTIVE TAB, WITH BOTH RECORDS ALREADY RESOLVED.
 *
 * The pagination is `listTrashed`'s idiom verbatim: ask for `PAIR_PAGE_SIZE * page + 1` rows from
 * offset 0 and let the presence of the probe row answer `hasMore`, so no second `COUNT(*)` is
 * issued to decide whether to render "Load more". The read is CUMULATIVE because "Load more"
 * appends to a list the user is already looking at (39-UI-SPEC L-9), and `MAX_PAIR_PAGE` is what
 * bounds the resulting cost.
 *
 * BOTH RECORDS ARE JOINED, NOT FETCHED PER ROW. A full page of cards resolving two records each is
 * two round trips per card for something the user scrolls past in a second — the same N+1
 * `resolveDeletedBy` exists to avoid on `/trash`. (The page size is `PAIR_PAGE_SIZE` and is never
 * spelled as a number anywhere in this file, including here: the plan's acceptance criteria grep
 * for the literal, and a grep cannot tell code from prose.)
 * The joins are LEFT and carry the visibility predicate, so a record
 * soft-deleted since the scan yields a null name instead of dropping the pair out of a list whose
 * tab count still includes it.
 *
 * THE ORDER HAS A TIEBREAKER AND IT IS NOT COSMETIC. Every pair a scan writes takes `now()` from
 * the SAME transaction, so thousands of rows share a `created_at` to the microsecond. Ordering on
 * it alone leaves the page boundary undefined, and a cumulative read across two requests then
 * shows a pair twice or never. `id` ascending makes the order total.
 *
 * `{ ok: false }` rather than an empty success on failure — rule 4.
 */
export async function listPairs(
  input: ListPairsInput
): Promise<{ ok: true; rows: PairListRow[]; hasMore: boolean } | { ok: false }> {
  const { entityType, dismissed } = input
  const page = Math.min(Math.max(Math.trunc(input.page) || 1, 1), MAX_PAIR_PAGE)
  const pageRows = PAIR_PAGE_SIZE * page

  const table = entityType === "organization" ? organizations : people
  const sideA = alias(table, "dedup_record_a")
  const sideB = alias(table, "dedup_record_b")

  try {
    const fetched = await db
      .select({
        id: duplicatePairs.id,
        entityType: duplicatePairs.entityType,
        tier: duplicatePairs.tier,
        reason: duplicatePairs.reason,
        score: duplicatePairs.score,
        status: duplicatePairs.status,
        createdAt: duplicatePairs.createdAt,
        aId: sideA.id,
        aRow: sideA,
        bId: sideB.id,
        bRow: sideB,
      })
      .from(duplicatePairs)
      // The predicate lives in the ON clause rather than the WHERE, which is what keeps the join
      // LEFT: a WHERE on a null-extended column would silently turn it into an inner join and
      // drop exactly the pairs UI-SPEC M-8 wants rendered as "one record already gone".
      .leftJoin(
        sideA,
        and(eq(sideA.id, duplicatePairs.recordAId), isNull(sideA.deletedAt))
      )
      .leftJoin(
        sideB,
        and(eq(sideB.id, duplicatePairs.recordBId), isNull(sideB.deletedAt))
      )
      .where(pairScope(entityType, dismissed))
      .orderBy(desc(duplicatePairs.createdAt), asc(duplicatePairs.id))
      .limit(pageRows + 1)
      .offset(0)

    const hasMore = fetched.length > pageRows
    const kept = hasMore ? fetched.slice(0, pageRows) : fetched

    return {
      ok: true,
      hasMore,
      rows: kept.map((row) => ({
        id: row.id,
        entityType: row.entityType,
        tier: row.tier,
        reason: row.reason,
        score: row.score,
        status: row.status,
        createdAt: row.createdAt,
        recordA: toSideSummary(entityType, row.aId, row.aRow),
        recordB: toSideSummary(entityType, row.bId, row.bRow),
      })),
    }
  } catch (error) {
    console.error(
      `${LOG_PREFIX} listPairs failed for ${entityType} page ${page} (dismissed=${dismissed}):`,
      error
    )
    return { ok: false }
  }
}

/**
 * Normalise a null-extended join row into a card's view of one side.
 *
 * `people` has no single title column (the `src/lib/audit/linked-records.ts` precedent), so the
 * name is composed here rather than at the component layer — the row type stays uniform across
 * both tabs and no per-tab special case reaches the card.
 */
function toSideSummary(
  entityType: MergeableEntityType,
  id: string | null,
  raw: unknown
): PairSideSummary {
  const row = asRecord(raw)

  if (row === null || id === null) {
    return { id: id ?? "", name: null, normName: null, email: null, phone: null, customFields: null }
  }

  const name =
    entityType === "organization"
      ? asString(row.name)
      : `${asString(row.firstName) ?? ""} ${asString(row.lastName) ?? ""}`.trim() || null

  return {
    id,
    name,
    normName: asString(row.normName),
    email: entityType === "person" ? asString(row.email) : null,
    phone: entityType === "person" ? asString(row.phone) : null,
    customFields: entityType === "organization" ? asRecord(row.customFields) : null,
  }
}

// ---------------------------------------------------------------------------------------
// The merge screen's read
// ---------------------------------------------------------------------------------------

/**
 * THE PAIR, BOTH RECORDS IN FULL, AND WHAT A MERGE WOULD MOVE.
 *
 * `null` for a missing pair, for a pair either of whose records has been soft-deleted since the
 * scan, and for a failed query alike. From the caller's position those are one answer — there is
 * no merge to offer — and 39-UI-SPEC M-8 renders it as a destructive `Alert` with the form
 * disabled, which is reachable in normal use: another user can merge or delete the same pair while
 * this screen is open.
 *
 * THE CHILD COUNTS ARE COMPUTED FROM THE SAME COLUMN PREDICATES `mergeRecordsMutation` REPARENTS
 * ON, statement for statement, and that binding is the entire reason this function exists rather
 * than the merge form counting for itself. 39-UI-SPEC M-6 is how success criterion 4 ("nothing is
 * orphaned") becomes checkable by a human BEFORE the merge instead of only afterwards, so a count
 * that disagrees with what the merge delivers is worse than no count at all.
 *
 * NOTE THE ABSENCE OF A `deleted_at` PREDICATE ON EVERY ONE OF THE FIVE COUNTS. That is not an
 * oversight, it is the parity: `mergeRecordsMutation`'s reparenting statements carry none either.
 * For notes that is load-bearing — `notes_migration_uniq` has no `deleted_at` clause, so a
 * soft-deleted migration note still occupies the slot and still gets demoted and reassigned. The
 * same reasoning `countPurgeImpact` applies on `/trash`: match the teardown statement for
 * statement, and the number in front of the human is the number that happens.
 *
 * ACTIVITIES ARE NOT COUNTED, AND THAT IS NOT AN OMISSION. `activities` has a `deal_id` and
 * nothing else — no organization column and no person column — so an activity follows its deal
 * transitively and is already on the survivor's side the moment its deal is. M-6 states that in
 * prose (`dedup.merge.activitiesFollowDeals`); a count here would imply a statement the merge does
 * not issue.
 */
export async function getPairDetail(pairId: string): Promise<PairDetail | null> {
  try {
    const pairRows = await db
      .select({
        id: duplicatePairs.id,
        entityType: duplicatePairs.entityType,
        recordAId: duplicatePairs.recordAId,
        recordBId: duplicatePairs.recordBId,
        tier: duplicatePairs.tier,
        reason: duplicatePairs.reason,
        score: duplicatePairs.score,
        status: duplicatePairs.status,
      })
      .from(duplicatePairs)
      .where(eq(duplicatePairs.id, pairId))
      .limit(1)

    const pair = pairRows[0]
    if (!pair) return null

    const entityType = pair.entityType
    const table = entityType === "organization" ? organizations : people

    // Sequential rather than parallel, and read A before B: the harness that proves the child
    // predicates identifies a record read by its position, and more importantly a missing A makes
    // B's read pure cost.
    const recordA = await readRecord(table, pair.recordAId)
    if (recordA === null) return null

    const recordB = await readRecord(table, pair.recordBId)
    if (recordB === null) return null

    const countsA = await countChildren(entityType, pair.recordAId)
    const countsB = await countChildren(entityType, pair.recordBId)

    return {
      pair,
      recordA: { id: pair.recordAId, row: recordA, childCounts: countsA },
      recordB: { id: pair.recordBId, row: recordB, childCounts: countsB },
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} getPairDetail failed for pair ${pairId}:`, error)
    return null
  }
}

/** The whole row, or `null` for a missing or soft-deleted record. */
async function readRecord(
  table: typeof organizations | typeof people,
  id: string
): Promise<Record<string, unknown> | null> {
  const rows = await db
    .select()
    .from(table)
    .where(and(eq(table.id, id), isNull(table.deletedAt)))
    .limit(1)

  return asRecord(rows[0]) ?? null
}

/** What a merge would move off this record. See `getPairDetail`'s note on the predicates. */
async function countChildren(
  entityType: MergeableEntityType,
  recordId: string
): Promise<PairChildCounts> {
  // `deals.organization_id` for an organization, `deals.person_id` for a person — the two halves
  // of the merge's first reparenting statement.
  const dealRows = await db
    .select({ value: count() })
    .from(deals)
    .where(
      entityType === "organization"
        ? eq(deals.organizationId, recordId)
        : eq(deals.personId, recordId)
    )

  // The merge's second reparenting statement exists only for an organization. No query is issued
  // for a person, so the emptiness is expressed as a control rather than as a comment.
  const peopleRows =
    entityType === "organization"
      ? await db
          .select({ value: count() })
          .from(people)
          .where(eq(people.organizationId, recordId))
      : null

  // Polymorphic: `notes.entityId` carries no foreign key because one column would have to point
  // at four tables, so the type is half the key and the database catches nothing here.
  const noteRows = await db
    .select({ value: count() })
    .from(notes)
    .where(and(eq(notes.entityType, entityType), eq(notes.entityId, recordId)))

  return {
    deals: dealRows[0]?.value ?? 0,
    people: peopleRows === null ? null : peopleRows[0]?.value ?? 0,
    notes: noteRows[0]?.value ?? 0,
  }
}
