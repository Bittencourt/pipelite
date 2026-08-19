import { and, eq, exists, getTableColumns, isNull, sql } from "drizzle-orm"
import { QueryBuilder, alias } from "drizzle-orm/pg-core"

import { db } from "@/db"
import { auditLog, deals, duplicatePairs, notes, organizations, people } from "@/db/schema"
import type { CustomFieldDefinition, EntityType } from "@/db/schema"
import { getCurrentActor } from "@/lib/audit/actor-context"
import type { AuditActor } from "@/lib/audit/actor-context"
import type { AuditChanges } from "@/db/schema/audit-log"
import { getActiveFieldDefinitions } from "@/lib/custom-fields"
import { buildMergeFieldGroups } from "@/lib/dedup/field-groups"
import { applyMergeChoices } from "@/lib/dedup/merge-defaults"
import type { MergeChoiceMap } from "@/lib/dedup/merge-defaults"
import type { MergeableEntityType } from "@/lib/dedup/types"
import { crmBus } from "@/lib/events"
import type { CrmEventPayload } from "@/lib/events"
import {
  buildRelatedEntities,
  recalculateFormulas,
  CASCADE_CHILD_RELATIONS,
  ENTITY_NATIVE_ATTRIBUTES,
  FORMULA_EVALUATION_BUDGET,
} from "@/lib/formula-recalc"

/* -----------------------------------------------------------------------------------------
 * THE MOST DESTRUCTIVE OPERATION IN THE APPLICATION (DEDUP-03, SC-4, SC-5).
 *
 * `purgeOrganizationMutation` (./organizations.ts) is the line-for-line template and its six
 * load-bearing properties are carried across deliberately: the actor is captured synchronously
 * at entry; the existence read happens OUTSIDE the transaction and returns a discriminated
 * CODE; the polymorphic `notes` table is handled explicitly; every child UPDATE carries
 * `.returning({ id })`; every audit row is written with `tx.insert`; and the `catch` returns a
 * FIXED sentinel while logging the real error.
 *
 * "Nothing is orphaned" is only checkable if the whole thing is atomic, which is why every
 * write below - children, both audit sides and the pair table - is inside ONE transaction.
 * 39-RESEARCH measured the heaviest organization in the live database at 114 child rows in
 * total, so the transaction is smaller than several the application already runs (T-39-25,
 * recorded as accepted rather than hedged).
 *
 * WHAT IS DELIBERATELY *NOT* IN THE TRANSACTION, and why, in both cases because the machinery
 * involved uses the module-level `db` and cannot be handed a `tx`: the formula recalculation
 * and the bus emit. Both run after the commit, both are best-effort, and both are commented at
 * their call sites so a reader does not "fix" them by moving them inside.
 * ----------------------------------------------------------------------------------------- */

/**
 * The four actor columns of an `audit_log` row, from an actor captured SYNCHRONOUSLY at the
 * calling function's entry.
 *
 * THIS IS THE THIRD LOCAL COPY. The other two are `./organizations.ts:176` and
 * `./people.ts:172`, byte-identical. A shared extraction was considered and REJECTED for this
 * phase: it would mean editing two shipped mutation files inside a phase that is already paying
 * a four-file `AuditAction` compile cascade, and the risk of that edit is carried by every
 * organization and person write in the product rather than by the merge. The duplication is a
 * recorded decision, not an oversight; the extraction is a good first task for whichever phase
 * next has a reason to open both of those files anyway.
 *
 * The analog's rule carries verbatim: NEVER borrow a user id from a payload - that field
 * describes the record being written, not the identity that wrote it, and borrowing it would
 * stamp an unverified name onto an audit row, which is worse than an honest "unknown" because
 * it is believed. Absence of an actor is recorded honestly as `system`.
 */
function auditActorColumns(actor: AuditActor | undefined) {
  return {
    actorKind: actor?.kind ?? "system",
    actorUserId: actor?.userId ?? null,
    workflowRunId: actor?.workflowRunId ?? null,
    importSessionId: actor?.importSessionId ?? null,
  }
}

/**
 * The reserved keys the merge writes into an `audit_log.changes` map alongside the ordinary
 * per-field diff.
 *
 * The `__` prefix convention originates at `PURGE_MARKER` (`./organizations.ts:186`), which
 * distinguishes a purge from a soft delete with `__purge`. Same idea here: a marker is a fact
 * about the OPERATION, not a field of the record, and it shares the map with real fields so the
 * survivor's entry renders its diff through the ordinary `AuditFieldRow` path (39-UI-SPEC A-4)
 * with no new renderer.
 *
 * Exported because plan 39-12 makes `buildAuditFieldChanges` SKIP `__`-prefixed keys, so they
 * never render as unlabelled field rows, and because 39-12's presentation reads the values back
 * out to compose the sentence. Until 39-12 lands, a `merged` entry renders these keys as
 * unlabelled rows - a known, ordered dependency, not a defect of this plan.
 */
export const MERGE_MARKER_KEYS = {
  /** The losing record's id. `to: null` — the loser did not become anything. */
  mergedFrom: "__mergedFrom",
  /** The losing record's display name, captured before the soft delete. */
  mergedFromName: "__mergedFromName",
  /** Total child rows reparented onto the survivor. `from: null` — nothing became a count. */
  mergedChildren: "__mergedChildren",
  /** Present ONLY when the loser's migration note had to be demoted. See B4 below. */
  mergedNoteReclassified: "__mergedNoteReclassified",
  /** On the LOSER's row: which record it was merged into. */
  mergedInto: "__mergedInto",
  /** On the LOSER's row: the survivor's display name. */
  mergedIntoName: "__mergedIntoName",
} as const

/**
 * Every way a merge can refuse, as a CODE.
 *
 * Codes rather than prose so the calling server action switches on the code and string-matches
 * nothing (S-1). `FAILED` is a FIXED sentinel: a 23505 from `notes_migration_uniq` names the
 * index, and an index name is schema disclosure (T-39-03).
 */
export type MergeErrorCode = "NOT_FOUND" | "SAME_RECORD" | "NOT_IN_PAIR" | "FAILED"

export interface MergeRecordsInput {
  entityType: MergeableEntityType
  /**
   * The `duplicate_pairs` row this merge came from, or `null` for a merge initiated outside the
   * pair review list. Non-null turns on the V-9 membership control below.
   */
  pairId: string | null
  survivorId: string
  loserId: string
  /**
   * Straight from the browser, hence `MergeChoiceMap`'s `string` values rather than the narrow
   * union - `applyMergeChoices` narrows at runtime and intersects the keys with the ones the
   * server computed, so a crafted key writes nothing (T-39-04).
   */
  choices: MergeChoiceMap
}

export type MergeRecordsResult =
  | { success: true; movedChildren: number; loserName: string }
  | { success: false; error: MergeErrorCode }

/** The two mergeable tables, so nothing below branches on a string more than once. */
const MERGE_TABLES = {
  organization: organizations,
  person: people,
} as const

/** Thrown inside the transaction to mean "map this to NOT_FOUND", never surfaced to a caller. */
const GONE_INSIDE_TRANSACTION = "__dedup_merge_gone__"

/** A record's display name, for the audit markers and the result. */
function displayName(entityType: MergeableEntityType, row: Record<string, unknown>): string {
  if (entityType === "organization") return String(row.name ?? "")
  // The display name the rest of the product uses (fetch-entities.ts:48-52).
  return `${String(row.firstName ?? "")} ${String(row.lastName ?? "")}`.trim()
}

/**
 * The merged native values, minus anything the database will not let us write.
 *
 * LOAD-BEARING, not defensive. `organizations.normName`, `people.normName`, `people.normEmail`
 * and `people.normPhone` are GENERATED ALWAYS columns (migration 0017): PostgreSQL rejects
 * `SET norm_name = …` with SQLSTATE 428C9, so a SET clause carrying one fails the whole merge.
 * `MERGE_EXCLUDED_COLUMNS` already drops all four by name, which is what fixes the merge SCREEN
 * too - but that list is a hand-maintained literal in a database-free module, and this filter is
 * derived from the table itself. A fifth generated column therefore costs a redundant filter
 * pass here rather than every merge of that entity type.
 *
 * A key that is not a column of the table at all is dropped for the same reason: `native` is
 * built from the survivor row's own keys, so this cannot normally fire, and if it ever does the
 * alternative is a driver error naming a column.
 */
function writableNativeValues(
  entityType: MergeableEntityType,
  native: Record<string, unknown>
): Record<string, unknown> {
  const columns = getTableColumns(MERGE_TABLES[entityType])
  const writable: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(native)) {
    const column = columns[key as keyof typeof columns]
    if (column === undefined) continue
    if (column.generated !== undefined) continue
    writable[key] = value
  }

  return writable
}

/**
 * Every parent ref name a reparented child might read, DERIVED rather than invented.
 *
 * `parentChangedRefNames` (`@/lib/formula-recalc` around line 763) is private, so its behaviour
 * is reproduced here from its source, which folds three things into the changed set:
 *
 *   1. `changed.add(field)` for every entry of `changedFields` — the COLUMN names.
 *   2. `changed.add(attribute)` for the attribute spelling of each of those columns, looked up
 *      through `ENTITY_NATIVE_ATTRIBUTES[parentType]`.
 *   3. the name of every non-formula definition, when `changedFields` carries the
 *      `customFields` sentinel.
 *
 * A reparenting changes the child's parent WHOLESALE, so the correct `changedFields` for this
 * call is "every native column plus the sentinel", and the derived set is therefore the union of
 * `Object.values(ENTITY_NATIVE_ATTRIBUTES[parentType])` (the columns), its `Object.keys` (the
 * attributes) and every parent definition name.
 *
 * `scopeFormulasToChangedFields` matches a dotted ref by the text AFTER the dot, which is the
 * attribute name (`Organization.Name`) or a custom field name (`Organization.CNPJ / CPF`) —
 * never a column name. The column names are folded in anyway, exactly as the private function
 * does, so a reader diffing the two lists finds them identical rather than wondering which is
 * right; they simply cannot match a ref.
 *
 * Formula definitions are included here where `parentChangedRefNames` includes only the formulas
 * it actually recomputed. It knows which those were and this does not, so the choice is between
 * a superset and a possible miss. A superset over-evaluates against a bounded budget; a miss
 * leaves a reparented child holding a value derived from the record now in Trash.
 */
function parentRefNamesForReparent(
  parentType: MergeableEntityType,
  parentDefinitions: CustomFieldDefinition[]
): string[] {
  const attributes = ENTITY_NATIVE_ATTRIBUTES[parentType]
  return [
    ...new Set([
      ...Object.keys(attributes),
      ...Object.values(attributes),
      ...parentDefinitions.map((definition) => definition.name),
    ]),
  ]
}

/**
 * Collapse two duplicate records into one (DEDUP-03).
 *
 * Every deal, every person and every note of the loser lands on the survivor, the survivor takes
 * the chosen field values, the loser goes to Trash attributed to the acting user, and both audit
 * sides plus the pair table settle — all in ONE transaction, so a failure anywhere leaves both
 * records exactly as they were and leaves no audit row claiming a merge happened (T-39-09).
 */
export async function mergeRecordsMutation(input: MergeRecordsInput): Promise<MergeRecordsResult> {
  const { entityType, pairId, survivorId, loserId, choices } = input

  // Captured synchronously at entry, BEFORE any promise exists. The actor lives in an
  // AsyncLocalStorage store; reading it from inside a promise continuation happens to work but
  // depends on continuation semantics that are not ours to rely on. The reason is documented at
  // src/lib/events/subscribers/audit.ts:48-56.
  const actor = getCurrentActor()

  // Cheapest guard first, and a real one: a self-merge would soft-delete the record it just
  // updated and reparent its children onto themselves.
  if (survivorId === loserId) {
    return { success: false, error: "SAME_RECORD" }
  }

  const table = MERGE_TABLES[entityType]

  try {
    // ---- Reads OUTSIDE the transaction -------------------------------------------------
    //
    // The template's property 2: existence is checked before the transaction opens and a miss
    // returns a CODE. 39-UI-SPEC M-8's "one record already gone" is a real state - a pair can
    // sit in the review list while someone deletes one of its records - and the UI needs to tell
    // it apart from a failure it should offer to retry.
    const [survivorRow] = await db
      .select()
      .from(table)
      .where(and(eq(table.id, survivorId), isNull(table.deletedAt)))
      .limit(1)

    const [loserRow] = await db
      .select()
      .from(table)
      .where(and(eq(table.id, loserId), isNull(table.deletedAt)))
      .limit(1)

    if (!survivorRow || !loserRow) {
      return { success: false, error: "NOT_FOUND" }
    }

    // 39-VALIDATION V-9 / T-39-02. `survivorId` and `loserId` arrive from a browser, and without
    // this a crafted request could name the pair of one row and the ids of two unrelated records
    // - merging anything into anything. The calling server action (plan 39-15) re-checks this
    // independently; TWO controls, deliberately, because this is the one tampering path whose
    // success is unrecoverable by the user.
    if (pairId !== null) {
      const [pairRow] = await db
        .select({ recordAId: duplicatePairs.recordAId, recordBId: duplicatePairs.recordBId })
        .from(duplicatePairs)
        .where(and(eq(duplicatePairs.id, pairId), eq(duplicatePairs.entityType, entityType)))
        .limit(1)

      const members = pairRow ? [pairRow.recordAId, pairRow.recordBId] : []
      if (!members.includes(survivorId) || !members.includes(loserId)) {
        return { success: false, error: "NOT_IN_PAIR" }
      }
    }

    const survivor = survivorRow as Record<string, unknown>
    const loser = loserRow as Record<string, unknown>
    const loserName = displayName(entityType, loser)
    const survivorName = displayName(entityType, survivor)

    // The compared field set, the defaults and the merged values, all computed by the SERVER
    // from the two rows it just read. `choices` is only ever consulted for the ANSWER to a
    // question this computation already asked, which is what makes a crafted choice key inert
    // (T-39-04).
    //
    // An EMPTY `AuditResolution` is passed deliberately. `describeField` uses it for the LABEL,
    // the display GROUP and the ORDER - none of which this mutation reads: it needs the key set,
    // the two values per key and which of the three sections each key fell into, and all three
    // are resolution-independent. The merge SCREEN builds the real resolution, because that is
    // where labels are shown; building one here would be a definition read whose result is
    // discarded.
    const groups = buildMergeFieldGroups({
      entityType,
      survivor,
      loser,
      resolution: {
        references: new Map(),
        customFieldNames: new Map(),
        customFieldTypes: new Map(),
        customFieldPositions: new Map(),
      },
    })

    const merged = applyMergeChoices(survivor, loser, groups, choices)
    const nativeValues = writableNativeValues(entityType, merged.native)

    // The per-field diff, in the shape every `updated` entry uses so `AuditFieldRow` renders it
    // with no new code (39-UI-SPEC A-4). Only fields that actually moved: a merge where the
    // survivor won everything should not report thirty unchanged rows.
    const fieldChanges: AuditChanges = {}
    for (const [key, value] of Object.entries(nativeValues)) {
      if (Object.is(survivor[key], value)) continue
      fieldChanges[key] = { from: survivor[key], to: value }
    }
    const survivorBlob = (survivor.customFields ?? {}) as Record<string, unknown>
    for (const [key, value] of Object.entries(merged.customFields)) {
      if (Object.is(survivorBlob[key], value)) continue
      fieldChanges[`customFields.${key}`] = { from: survivorBlob[key], to: value }
    }

    const deletedAt = new Date()

    // ---- The transaction ---------------------------------------------------------------
    const outcome = await db.transaction(async (tx) => {
      // a. Re-read both rows FOR UPDATE. The reads above are not a guard on their own: between
      //    them and this point another request can soft-delete either record, and a merge whose
      //    loser is already in Trash would reparent children onto a survivor while writing a
      //    second tombstone. The row lock also serialises two concurrent merges of the same
      //    pair, which is otherwise reachable from two browser tabs.
      const locked = await tx
        .select({ id: table.id, deletedAt: table.deletedAt })
        .from(table)
        .where(and(eq(table.id, survivorId), isNull(table.deletedAt)))
        .for("update")

      const lockedLoser = await tx
        .select({ id: table.id, deletedAt: table.deletedAt })
        .from(table)
        .where(and(eq(table.id, loserId), isNull(table.deletedAt)))
        .for("update")

      if (locked.length === 0 || lockedLoser.length === 0) {
        throw new Error(GONE_INSIDE_TRANSACTION)
      }

      // b. Reparent the children. THE INVENTORY IS EXHAUSTIVE AND IT IS THREE FOREIGN KEYS:
      //    `deals.organization_id`, `people.organization_id` and `deals.person_id`. Nothing else
      //    in the 32-table schema can hold an organization or a person id (verified against
      //    `pg_constraint` and a full `information_schema.columns` scan), plus the polymorphic
      //    `notes` handled at step c.
      //
      //    `.returning({ id })` on every one of them, for two reasons at once: each reparenting
      //    needs its own `audit_log` row, and the post-commit recalculation has to iterate the
      //    exact rows that moved.
      //
      //    ACTIVITIES ARE NOT REASSIGNED AND THAT IS NOT AN OMISSION. `activities` has a
      //    `deal_id` and NOTHING else - no organization column and no person column - so an
      //    activity follows its deal transitively and is already on the survivor's side the
      //    moment its deal is. SC-4's "every activity" is satisfied by that, not by a statement.
      //    A no-op `UPDATE activities` here would be a lie about the schema; this comment sits
      //    where a reader looks for the statement and does not find it.
      const movedDeals =
        entityType === "organization"
          ? await tx
              .update(deals)
              .set({ organizationId: survivorId, updatedAt: new Date() })
              .where(eq(deals.organizationId, loserId))
              .returning({ id: deals.id })
          : await tx
              .update(deals)
              .set({ personId: survivorId, updatedAt: new Date() })
              .where(eq(deals.personId, loserId))
              .returning({ id: deals.id })

      // The second child table exists only for an organization: a person has no people.
      const movedPeople =
        entityType === "organization"
          ? await tx
              .update(people)
              .set({ organizationId: survivorId, updatedAt: new Date() })
              .where(eq(people.organizationId, loserId))
              .returning({ id: people.id })
          : []

      // c. NOTES, IN TWO STATEMENTS AND IN THIS ORDER. B4, the single most likely thing in this
      //    phase to ship broken.
      //
      //    `notes_migration_uniq` is `uniqueIndex ON (entity_type, entity_id) WHERE source =
      //    'migration'`, and its own comment in src/db/schema/notes.ts calls it "a permanent
      //    database invariant, not a one-shot script guard" - IT MAY NOT BE DROPPED OR RELAXED.
      //    Measured on the live data: 29,037 of 46,054 organizations (63%) carry a
      //    `source='migration'` note, so a bare `UPDATE notes SET entity_id = survivor` raises
      //    SQLSTATE 23505 and rolls back roughly 40% of organization merges - likely more, since
      //    both members of a duplicate pair usually come from the same import and therefore both
      //    have one.
      //
      //    The resolution is to DEMOTE, never to delete: a migration note is import provenance,
      //    and a merge must not destroy the record of where a row came from. The demotion is
      //    scoped by an EXISTS on the survivor so a loser whose survivor has no migration note
      //    keeps its own `source='migration'` intact - only a genuine collision is reclassified,
      //    and the reclassification is recorded in the merge's audit `changes`.
      //
      //    NOTE THE ABSENCE OF A `deletedAt` PREDICATE ON BOTH STATEMENTS, in both directions.
      //    The unique index carries no `deleted_at is null` clause, so a SOFT-DELETED migration
      //    note still occupies the slot; filtering by `deletedAt` here would skip the demotion
      //    and hand the reassignment a 23505 anyway.
      //
      //    And note what the database does NOT do for us: `notes.entityId` has NO foreign key,
      //    because one column would have to point at four tables. NOTHING AT THE DATABASE LEVEL
      //    CATCHES A MISSED REASSIGNMENT - there is no referential integrity to violate, the
      //    rows simply dangle, forever, silently. That is why both statements below carry
      //    `.returning({ id })` and why plan 39-10 re-proves this against a real Postgres: a
      //    mocked write cannot raise a constraint.
      const survivorNote = alias(notes, "survivor_migration_note")
      const subquery = new QueryBuilder()

      const demotedNotes = await tx
        .update(notes)
        .set({ source: "user", updatedAt: new Date() })
        .where(
          and(
            eq(notes.entityType, entityType),
            eq(notes.entityId, loserId),
            eq(notes.source, "migration"),
            exists(
              subquery
                .select({ present: sql`1` })
                .from(survivorNote)
                .where(
                  and(
                    eq(survivorNote.entityType, entityType),
                    eq(survivorNote.entityId, survivorId),
                    eq(survivorNote.source, "migration")
                  )
                )
            )
          )
        )
        .returning({ id: notes.id })

      const movedNotes = await tx
        .update(notes)
        .set({ entityId: survivorId, updatedAt: new Date() })
        .where(and(eq(notes.entityType, entityType), eq(notes.entityId, loserId)))
        .returning({ id: notes.id })

      // d. The survivor takes the merged values. `customFields` is written WHOLESALE because
      //    `applyMergeChoices` returns the complete blob - a partial one would silently clear
      //    every custom field nobody was asked about.
      const [updatedSurvivor] = await tx
        .update(table)
        .set({ ...nativeValues, customFields: merged.customFields, updatedAt: new Date() })
        .where(and(eq(table.id, survivorId), isNull(table.deletedAt)))
        .returning()

      // e. The loser goes to Trash, INLINE.
      //
      //    THE PER-ENTITY SOFT-DELETE MUTATIONS ARE DELIBERATELY NOT REUSED (./organizations.ts
      //    line 409 and its counterpart in ./people.ts), and the reason is two defects visible in
      //    five lines of the former: its `UPDATE` runs on the module-level client with NO
      //    transaction, so it would commit independently of everything above and survive a
      //    rollback; and it emits on the bus UNCONDITIONALLY, before any later step could fail,
      //    so a merge that failed at step g would still have told every webhook the record was
      //    deleted. T-39-24 grep-gates both of those function names at zero occurrences in this
      //    file, which is why this comment cites them by file and line rather than by name.
      //
      //    The `isNull(deletedAt)` predicate is carried on the statement itself, so a loser that
      //    somehow slipped past the lock cannot be "deleted" a second time with a fresh instant.
      await tx
        .update(table)
        .set({ deletedAt, updatedAt: new Date() })
        .where(and(eq(table.id, loserId), isNull(table.deletedAt)))

      const movedChildren = movedDeals.length + movedPeople.length + movedNotes.length

      // f. The audit rows. `tx.insert(auditLog)` and NEVER the module-level client: the bus
      //    subscriber (src/lib/events/subscribers/audit.ts:70) inserts through that client,
      //    fire-and-forget, deliberately - so a row written that way survives a rollback and the
      //    timeline would show a merge that never happened (T-39-09). `merged` is also not one
      //    of the twelve `AUDITED_EVENTS` and no `organization.merged` event exists, so the bus
      //    could not carry it even if the ordering were safe.
      //
      //    Every write in this transaction goes through `tx`. That is grep-gated at zero
      //    occurrences of a module-level write call in this file, which is why this comment says
      //    "the module-level client" instead of spelling the call out.
      //
      //    f1. The survivor's `merged` row: the ordinary per-field diff PLUS the markers.
      const survivorChanges: AuditChanges = {
        ...fieldChanges,
        [MERGE_MARKER_KEYS.mergedFrom]: { from: loserId, to: null },
        [MERGE_MARKER_KEYS.mergedFromName]: { from: loserName, to: null },
        [MERGE_MARKER_KEYS.mergedChildren]: { from: null, to: movedChildren },
      }
      if (demotedNotes.length > 0) {
        survivorChanges[MERGE_MARKER_KEYS.mergedNoteReclassified] = {
          from: "migration",
          to: "user",
        }
      }

      await tx.insert(auditLog).values({
        entityType: entityType satisfies EntityType,
        entityId: survivorId,
        action: "merged",
        changes: survivorChanges,
        ...auditActorColumns(actor),
      })

      //    f2. The loser's row, and it is `merged` rather than `deleted` ON PURPOSE.
      //
      //    THE `deleted` TOMBSTONE FOR THE LOSER COMES FROM THE BUS, at the emit below, exactly
      //    as it does for every other soft delete in the product. Writing a `deleted` row here
      //    AS WELL as emitting `<entity>.deleted` would produce TWO `deleted` rows for one
      //    deletion, because `organization.deleted` and `person.deleted` ARE members of
      //    `AUDITED_EVENTS` (src/lib/events/subscribers/audit.ts:19) - the loser's timeline would
      //    carry the same "deleted this organization" line twice. Verified rather than assumed:
      //    `buildAuditFieldChanges` (src/lib/audit/present.ts:488) returns `[]` for `deleted`
      //    whatever the map holds, so a hand-written `{ deletedAt: { from, to } }` would not even
      //    be the thing that renders - `deletedAtDirectionKey` in
      //    src/components/timeline/audit-entry.tsx:142 reads that shape only off an `updated`
      //    row, which is the restore's shape, not a delete's.
      //
      //    So the split is: the ATOMIC statement about the merge is written here, inside the
      //    transaction, on both sides ("both audit sides", and both survive a rollback by not
      //    existing); the tombstone is written by the same path that writes every other one.
      //    This row is also strictly more informative than a duplicate tombstone would be - the
      //    loser's timeline says which record absorbed it.
      await tx.insert(auditLog).values({
        entityType: entityType satisfies EntityType,
        entityId: loserId,
        action: "merged",
        changes: {
          [MERGE_MARKER_KEYS.mergedInto]: { from: null, to: survivorId },
          [MERGE_MARKER_KEYS.mergedIntoName]: { from: null, to: survivorName },
          [MERGE_MARKER_KEYS.mergedChildren]: { from: null, to: movedChildren },
        },
        ...auditActorColumns(actor),
      })

      //    f3. One `updated` row per reparented child, following the purge precedent exactly.
      //    `organizationId` and `personId` are already in `AUDIT_FIELD_LABELS`, so both
      //    timelines render these with no new code. The insert is SKIPPED ENTIRELY when the list
      //    is empty - an `insert().values([])` is a driver error, not a no-op.
      if (movedDeals.length > 0) {
        const column = entityType === "organization" ? "organizationId" : "personId"
        await tx.insert(auditLog).values(
          movedDeals.map((deal) => ({
            entityType: "deal" as EntityType,
            entityId: deal.id,
            action: "updated" as const,
            changes: { [column]: { from: loserId, to: survivorId } },
            ...auditActorColumns(actor),
          }))
        )
      }

      if (movedPeople.length > 0) {
        await tx.insert(auditLog).values(
          movedPeople.map((person) => ({
            entityType: "person" as EntityType,
            entityId: person.id,
            action: "updated" as const,
            changes: { organizationId: { from: loserId, to: survivorId } },
            ...auditActorColumns(actor),
          }))
        )
      }

      // g. The pair table, inside the transaction so a rolled-back merge does not leave a pair
      //    marked `merged`.
      if (pairId !== null) {
        await tx
          .update(duplicatePairs)
          .set({ status: "merged", updatedAt: new Date() })
          .where(eq(duplicatePairs.id, pairId))
      }

      //    Every OTHER still-open pair referencing the LOSER becomes `superseded`. This is not
      //    tidying: after merging A and B, a pair (B, C) is a question about a record that is
      //    now in Trash. Leaving it open sends the next user into a merge screen whose loser is
      //    already deleted (39-UI-SPEC M-8's dead end), and the right comparison - C against A -
      //    is the one the next scan will produce, because C's rival is now A's data.
      //
      //    Both id columns are matched: `duplicate_pairs` canonicalises `(recordAId, recordBId)`
      //    by lexicographic order, so the loser sits on whichever side its id sorts to. Each
      //    column has its own index for exactly this statement
      //    (`duplicate_pairs_record_a_idx` / `_record_b_idx`).
      //
      //    `pairId` itself is excluded by the `status = 'open'` predicate: step g already moved
      //    it to `merged`, within this same transaction, so it cannot be caught here and
      //    downgraded.
      await tx
        .update(duplicatePairs)
        .set({ status: "superseded", updatedAt: new Date() })
        .where(
          and(
            eq(duplicatePairs.entityType, entityType),
            eq(duplicatePairs.status, "open"),
            sql`(${duplicatePairs.recordAId} = ${loserId} or ${duplicatePairs.recordBId} = ${loserId})`
          )
        )

      return {
        movedChildren,
        movedDeals,
        movedPeople,
        survivorRow: (updatedSurvivor ?? survivor) as Record<string, unknown>,
      }
    })

    // ---- AFTER THE COMMIT. Both blocks are best-effort and neither rethrows. -------------

    // 1. Formula recalculation for the rows that moved.
    //
    //    IT CANNOT RUN INSIDE THE TRANSACTION: `recalculateFormulas` and its whole cascade use
    //    the module-level `db` and have no `tx` parameter, so calling it above would read a
    //    snapshot that does not include the uncommitted reparenting and write outside the
    //    transaction's atomicity. Running it after the commit is the only correct placement.
    //
    //    AND IT CANNOT BE LEFT TO A SURVIVOR-ROOTED CASCADE. `cascadeToChildren` short-circuits
    //    on `if (changed.size === 0) return 0`, so a merge where the survivor won every field
    //    recomputes NOTHING and every reparented child keeps an `Organization.*` value derived
    //    from the record now in Trash. The children are therefore iterated explicitly.
    try {
      await recalcReparentedChildren({
        entityType,
        survivorId,
        survivorRow: outcome.survivorRow,
        movedDeals: outcome.movedDeals,
        movedPeople: outcome.movedPeople,
      })
    } catch (error) {
      // D-05: formula machinery never blocks a write, and the merge has already committed.
      console.error("[dedup-merge] post-merge formula recalculation failed:", error)
    }

    // 2. The bus emit for the loser's deletion.
    //
    //    OUTSIDE AND AFTER THE TRANSACTION, ON PURPOSE, and a reader will otherwise assume it
    //    belongs inside. Two reasons, and only the first is about correctness: `crmBus` wraps a
    //    synchronous EventEmitter whose subscribers write with the module-level `db`, so an emit
    //    inside the transaction would have webhooks, workflow triggers and the audit subscriber
    //    all acting on a state that a later statement could still roll back. Placing it after
    //    the commit means every subscriber sees a deletion that actually happened.
    //
    //    The second reason is what it BUYS: webhooks and workflow triggers still observe the
    //    loser going to Trash, so a merge is not a blind spot for an integration. The audit
    //    subscriber writes the loser's `deleted` tombstone off this same event - see f2 for why
    //    that row is deliberately not written twice.
    //
    //    NOTHING IS EMITTED FOR THE SURVIVOR, and that is also deliberate: `organization.updated`
    //    is an audited event, so emitting it would write a SECOND audit row on the survivor
    //    duplicating the diff the `merged` row already carries. The survivor's change is reported
    //    once, by the row that says what actually happened to it.
    try {
      crmBus.emit(`${entityType}.deleted`, {
        entity: entityType,
        entityId: loserId,
        action: "deleted",
        // Every delete emit site in the product passes `data === { id }`, which makes `previous`
        // the ONLY source of state a subscriber can build a tombstone from.
        data: { id: loserId },
        previous: loser,
        changedFields: null,
        // The payload's own `userId` describes the record, never the writer - `auditActorColumns`
        // above is where the identity that performed the merge is recorded. This field exists on
        // the shared payload type and the honest value for it here is the acting user when there
        // is one.
        userId: actor?.userId ?? "",
        timestamp: new Date().toISOString(),
      } satisfies CrmEventPayload)
    } catch (error) {
      console.error("[dedup-merge] post-merge event emit failed:", error)
    }

    return { success: true, movedChildren: outcome.movedChildren, loserName }
  } catch (error) {
    if (error instanceof Error && error.message === GONE_INSIDE_TRANSACTION) {
      return { success: false, error: "NOT_FOUND" }
    }

    // A FIXED SENTINEL, NEVER THE DRIVER MESSAGE (T-39-03). A 23505 raised by the notes step
    // reads `duplicate key value violates unique constraint "notes_migration_uniq"` - an index
    // name, a table name and a column set, handed to whoever crafted the request. The real error
    // goes to the server log, where it belongs.
    console.error("[dedup-merge] merge failed:", error)
    return { success: false, error: "FAILED" }
  }
}

interface RecalcReparentedInput {
  entityType: MergeableEntityType
  survivorId: string
  survivorRow: Record<string, unknown>
  movedDeals: { id: string }[]
  movedPeople: { id: string }[]
}

/**
 * Refresh the formula values of every row that changed parent — one hop, budget-capped.
 *
 * THIS IS ONE HOP AND THE LIMITATION IS STATED RATHER THAN IMPLIED. A reparented deal's own
 * formula values feed `Deal.*` into its activities, and a reparented person's feed `Person.*`
 * into that person's deals; those second-hop rows keep their stale values. It is the same class
 * of staleness recorded for `purgeOrganizationMutation` in STATE.md — but unlike a purge, the
 * first hop IS repairable here, because the parent row still exists and holds the merged values.
 * A second hop would mean re-entering the cascade per child, which is exactly the fan-out
 * `CASCADE_DEPTH = 1` exists to forbid.
 *
 * ONE SHARED BUDGET across every child, not one per child. `recalculateFormulas` takes a
 * `budget` and returns the `evaluations` it spent, so the allowance is decremented across the
 * loop by hand. Without this the loop would hand each of up to 114 children its own
 * 500-evaluation allowance — 57,000 evaluations from one request, which is the
 * request-amplification shape T-34-03 names.
 *
 * Never rethrows past its own caller's try/catch; a failed refresh must not turn a committed
 * merge into an error.
 */
async function recalcReparentedChildren({
  entityType,
  survivorId,
  survivorRow,
  movedDeals,
  movedPeople,
}: RecalcReparentedInput): Promise<void> {
  const children: { type: EntityType; id: string }[] = [
    ...movedDeals.map((deal) => ({ type: "deal" as EntityType, id: deal.id })),
    ...movedPeople.map((person) => ({ type: "person" as EntityType, id: person.id })),
  ]

  if (children.length === 0) return

  const definitionsCache = new Map<EntityType, CustomFieldDefinition[]>()
  const parentDefinitions = await getActiveFieldDefinitions(entityType)
  definitionsCache.set(entityType, parentDefinitions)

  // The prefix a child formula spells a parent reference with (`{{Organization.Name}}`).
  // `buildRelatedEntities` KEYS ITS RESULT BY THAT PREFIX, so reading it back off the object is
  // what makes the two impossible to disagree — `prefixForEntityType` is private, and a
  // hand-written "Organization" would be a second spelling that could drift.
  const relatedEntities = buildRelatedEntities({
    parentType: entityType,
    parentRow: survivorRow,
    parentDefinitions,
  })
  const [prefix] = Object.keys(relatedEntities)
  if (prefix === undefined) return

  const changedList = parentRefNamesForReparent(entityType, parentDefinitions)

  // Only the directions the cascade itself recognises; a child type with no relation to this
  // parent has nothing to refresh and would be a wasted definition read.
  const cascadeChildren = new Set(
    CASCADE_CHILD_RELATIONS.filter((relation) => relation.parent === entityType).map(
      (relation) => relation.child
    )
  )

  let remaining = FORMULA_EVALUATION_BUDGET

  for (const child of children) {
    if (remaining <= 0) {
      // Identifiers and counts only, never row contents or field values (T-34-06).
      console.warn(
        `[dedup-merge] formula budget exhausted, refresh truncated: parent=${entityType} ` +
          `parentId=${survivorId} childrenTotal=${children.length}`
      )
      break
    }
    if (!cascadeChildren.has(child.type)) continue

    const result = await recalculateFormulas({
      entityType: child.type,
      entityId: child.id,
      // The child's OWN fields did not change; only its parent did. This mirrors the argument
      // shape `cascadeToChildren` passes at formula-recalc.ts:905-912.
      changedFields: [],
      changedRelatedFields: { [prefix]: changedList },
      relatedEntities,
      definitionsCache,
      // The children ARE the cascade here. Leaving this at its default `true` would fan out one
      // further hop per child and re-read every grandchild.
      cascade: false,
      budget: remaining,
    })

    remaining -= result.evaluations
  }
}
