import { pgTable, text, timestamp, real, index, uniqueIndex } from "drizzle-orm/pg-core"
import type { InferSelectModel } from "drizzle-orm"
import { users } from "./users"
import { dedupScans } from "./dedup-scans"
import type {
  DedupReason,
  DedupTier,
  DuplicatePairStatus,
  MergeableEntityType,
} from "../../lib/dedup/types"

/**
 * A candidate duplicate pair, persisted.
 *
 * Persisted rather than recomputed per page view because a scan is expensive (46,054
 * organizations) and — decisively — because a dismissal has to survive it. "A pair dismissed as
 * not-a-duplicate stays dismissed across future scans" is a locked functional requirement
 * (39-CONTEXT), and there is nowhere to record that fact if the pair list is derived.
 *
 * Every vocabulary type here (`MergeableEntityType`, `DedupTier`, `DedupReason`,
 * `DuplicatePairStatus`) is IMPORTED from `src/lib/dedup/types.ts` and never restated (S-8 /
 * Phase 35 D-01: the repo keeps exactly one definition of each union, and a second copy drifts).
 */
export const duplicatePairs = pgTable('duplicate_pairs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  entityType: text('entity_type').notNull().$type<MergeableEntityType>(),

  // ---------------------------------------------------------------------------------------
  // RULE 1 — CANONICAL ORDERING. NOTHING ENFORCES THIS BUT EVERY WRITER MUST OBEY IT.
  //
  // `recordAId` is ALWAYS the lexicographically smaller of the two ids and `recordBId` always
  // the larger. That convention is the only thing that makes `(A,B)` and `(B,A)` the same row,
  // and it is therefore the mechanism by which `duplicate_pairs_uniq` below turns a rescan into
  // an upsert that leaves an already-dismissed pair untouched. Insert a pair the other way
  // round and the unique index sees a different key: the dismissal is bypassed, the pair
  // reappears, and the feature loses the property it was built for. Canonicalize BEFORE every
  // insert, not after.
  //
  // RULE 2 — NO FOREIGN KEY on either id, exactly like `notes.entityId`: one column would have
  // to point at two different tables. THE DATABASE THEREFORE CANNOT CATCH A DANGLING REFERENCE.
  // Cleanup is explicit and belongs to the writers: the merge marks every other pair
  // referencing the losing record as `superseded` inside its own transaction, and the pair
  // detail page fails closed when a referenced record has gone (UI-SPEC M-8).
  // ---------------------------------------------------------------------------------------
  recordAId: text('record_a_id').notNull(),
  recordBId: text('record_b_id').notNull(),

  tier: text('tier').notNull().$type<DedupTier>(),
  reason: text('reason').notNull().$type<DedupReason>(),
  // Nullable on purpose: a `certain`-tier pair is an exact identity match, not a similarity
  // measurement, and storing 1.0 there would claim a trigram score that was never computed.
  score: real('score'),
  status: text('status').notNull().$type<DuplicatePairStatus>().default('open'),

  // Which scan produced the row. Nullable because the create-time check can record a pair
  // outside any scan.
  scanId: text('scan_id').references(() => dedupScans.id),
  dismissedByUserId: text('dismissed_by_user_id').references(() => users.id),
  dismissedAt: timestamp('dismissed_at'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  // The dismissal-survives-a-rescan mechanism. See RULE 1 above — this index is only as good as
  // the canonical ordering the writers apply.
  pairUniq: uniqueIndex('duplicate_pairs_uniq')
    .on(table.entityType, table.recordAId, table.recordBId),
  // The paged review list on /duplicates: filtered by type and status, ordered by createdAt.
  listIdx: index('duplicate_pairs_list_idx')
    .on(table.entityType, table.status, table.createdAt),
  // The merge marks every OTHER pair referencing the losing record as `superseded`, and the
  // loser may sit on either side of the canonical ordering — so both columns need their own
  // index. Neither is served by `duplicate_pairs_uniq`, whose leading column is `entity_type`.
  recordAIdx: index('duplicate_pairs_record_a_idx').on(table.recordAId),
  recordBIdx: index('duplicate_pairs_record_b_idx').on(table.recordBId),
}))

export type DuplicatePair = InferSelectModel<typeof duplicatePairs>
export type NewDuplicatePair = typeof duplicatePairs.$inferInsert
