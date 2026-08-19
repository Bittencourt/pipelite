import { eq, inArray } from "drizzle-orm"

import { db } from "@/db"
import { activities, auditLog, deals, organizations, people } from "@/db/schema"
import type { AuditAction } from "@/db/schema/audit-log"
import type { EntityType } from "@/db/schema/custom-fields"

/**
 * "Which CRM records did this workflow run change?" — the second half of SC-2.
 *
 * This is the ONLY reader of `audit_log.workflow_run_id`. The answer is not inferred from a
 * timestamp window around the run: a timestamp correlation would be a guess, and on an audit
 * surface a guess presented as a fact is the failure mode that matters. The audit row carries a
 * real foreign key to `workflow_runs`, and the partial index `audit_log_workflow_run_idx`
 * (audit-log.ts:73) exists precisely to serve the query below.
 */

/** One distinct record a run mutated. Exactly the UI-SPEC § Surface 2 data contract. */
export interface RunChangedRecord {
  entityType: EntityType
  entityId: string
  /** Best-known title at read time; null when the row is gone or has no title column value. */
  title: string | null
  /** The most significant action this run took on this record: deleted > merged > created > updated. */
  action: AuditAction
  /** Distinct fields this run changed on this record, unioned across every row for it. */
  fieldCount: number
  /** The latest audit instant for this record within this run. */
  occurredAt: Date
  /** Currently soft-deleted (or gone entirely) → not linkable. */
  deleted: boolean
}

/**
 * The precedence the contract names: `deleted > merged > created > updated`. A run that creates a
 * deal and then deletes it in a later step reports `deleted` — the record's fate is the significant
 * fact, and reporting `created` for something that no longer exists would send the operator to
 * a page that 404s.
 *
 * `merged` (Phase 39) sits BETWEEN `created` and `deleted`: a `merged` row is written on the
 * SURVIVOR of a duplicate merge, which is still alive, so it must never outrank a deletion — but
 * absorbing another record is a more significant fate than being created.
 *
 * This map is exhaustive by type and must stay that way. NEVER weaken it to a `Partial<…>` of its
 * `Record`: the compile error a new action produces here is the mechanism that forces the action to
 * be given a precedence instead of silently ranking `undefined`. That relaxation is grep-gated at
 * zero occurrences, which is why this comment does not spell the pattern out.
 */
const ACTION_RANK: Record<AuditAction, number> = {
  updated: 0,
  created: 1,
  merged: 2,
  deleted: 3,
}

const CRM_ENTITY_TYPES: readonly EntityType[] = ["organization", "person", "deal", "activity"]

/**
 * `AuditEntityType` is `EntityType | "import_session"`. An import summary row carries a SESSION
 * id in `entity_id`, so it has no record page and no title column — it is not a CRM record and
 * must not enter this list. Such a row cannot carry a run id in practice (the importer writes
 * `import_session_id`), but the column type permits it, so the narrowing is explicit rather than
 * assumed.
 */
function isCrmEntityType(value: string): value is EntityType {
  return (CRM_ENTITY_TYPES as readonly string[]).includes(value)
}

/** What a title read yields for one record. */
interface ResolvedTitle {
  title: string | null
  deleted: boolean
}

/** The running fold state for one distinct `(entityType, entityId)` within the run. */
interface RecordAccumulator {
  entityType: EntityType
  entityId: string
  fields: Set<string>
  action: AuditAction
  occurredAt: Date
}

const recordKey = (entityType: EntityType, entityId: string) => `${entityType}:${entityId}`

/** An empty or whitespace-only display value is missing data, not a title. */
const titleOrNull = (value: string | null) => {
  const trimmed = (value ?? "").trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * ONE batched read per entity type present — at most four queries, typically one.
 *
 * NO SOFT-DELETE PREDICATE, DELIBERATELY. A `deletedAt is null` filter here would drop the
 * record's title and flip `deleted` on by accident, which is the same outcome as hiding it: the
 * run DID mutate that record, and omitting it makes the list incomplete. The consumer renders a
 * deleted record unlinked (its detail page 404s) rather than dropping the row. This is the same
 * posture `audit_log.entity_id` takes by carrying no foreign key — a referential guard would
 * erase exactly the evidence the log exists to keep.
 */
async function readTitles(
  entityType: EntityType,
  ids: string[]
): Promise<Map<string, ResolvedTitle>> {
  const resolved = new Map<string, ResolvedTitle>()

  switch (entityType) {
    case "deal": {
      const rows = await db
        .select({ id: deals.id, title: deals.title, deletedAt: deals.deletedAt })
        .from(deals)
        .where(inArray(deals.id, ids))
      for (const row of rows) {
        resolved.set(row.id, { title: titleOrNull(row.title), deleted: row.deletedAt !== null })
      }
      break
    }
    case "organization": {
      const rows = await db
        .select({
          id: organizations.id,
          name: organizations.name,
          deletedAt: organizations.deletedAt,
        })
        .from(organizations)
        .where(inArray(organizations.id, ids))
      for (const row of rows) {
        resolved.set(row.id, { title: titleOrNull(row.name), deleted: row.deletedAt !== null })
      }
      break
    }
    case "person": {
      // A person has no single title column. `${firstName} ${lastName}`.trim() is the display
      // name the rest of the product uses (fetch-entities.ts:48-52) — this is not a new rule.
      const rows = await db
        .select({
          id: people.id,
          firstName: people.firstName,
          lastName: people.lastName,
          deletedAt: people.deletedAt,
        })
        .from(people)
        .where(inArray(people.id, ids))
      for (const row of rows) {
        resolved.set(row.id, {
          title: titleOrNull(`${row.firstName} ${row.lastName}`),
          deleted: row.deletedAt !== null,
        })
      }
      break
    }
    case "activity": {
      const rows = await db
        .select({ id: activities.id, title: activities.title, deletedAt: activities.deletedAt })
        .from(activities)
        .where(inArray(activities.id, ids))
      for (const row of rows) {
        resolved.set(row.id, { title: titleOrNull(row.title), deleted: row.deletedAt !== null })
      }
      break
    }
  }

  return resolved
}

/**
 * Every distinct record the given workflow run mutated, newest first.
 *
 * NOT WRAPPED IN A TRY/CATCH, DELIBERATELY. A swallow here would return `[]`, and `[]` renders
 * "This run didn't change any records" — a statement the operator cannot tell apart from the
 * truth. The empty array must mean EMPTY. The consumer (the run detail section) catches and
 * renders the degraded "unavailable" panel instead, exactly as `record-timeline.tsx` does.
 *
 * There is no cap and no pagination: the list length is the number of records the run touched,
 * which is the number the operator is asking about.
 */
export async function readRunChangedRecords(runId: string): Promise<RunChangedRecord[]> {
  // `runId` is a bind parameter through the drizzle builder — no raw fragment composes it
  // (T-36-06). This is the read `audit_log_workflow_run_idx` was declared for.
  const rows = await db
    .select({
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      action: auditLog.action,
      changes: auditLog.changes,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .where(eq(auditLog.workflowRunId, runId))
    .orderBy(auditLog.createdAt)

  if (rows.length === 0) return []

  // THE FOLD IS IN JAVASCRIPT, NOT SQL, and that is a choice rather than an omission: unioning
  // the KEYS of a jsonb object across rows is awkward and slow in SQL, the row count per run is
  // small and bounded by the run's own step count, and a JS fold is the part a mocked driver can
  // actually test.
  const byRecord = new Map<string, RecordAccumulator>()

  for (const row of rows) {
    if (!isCrmEntityType(row.entityType)) continue

    const key = recordKey(row.entityType, row.entityId)
    const changedFields = Object.keys(row.changes ?? {})
    const existing = byRecord.get(key)

    if (existing === undefined) {
      byRecord.set(key, {
        entityType: row.entityType,
        entityId: row.entityId,
        fields: new Set(changedFields),
        action: row.action,
        occurredAt: row.createdAt,
      })
      continue
    }

    // Union, not sum: a field touched by three steps is still one field changed.
    for (const field of changedFields) existing.fields.add(field)
    if (ACTION_RANK[row.action] > ACTION_RANK[existing.action]) existing.action = row.action
    // MAX, not last-seen. The query orders ascending, but the fold must not depend on that.
    if (row.createdAt > existing.occurredAt) existing.occurredAt = row.createdAt
  }

  const idsByType = new Map<EntityType, string[]>()
  for (const accumulator of byRecord.values()) {
    const ids = idsByType.get(accumulator.entityType)
    if (ids === undefined) idsByType.set(accumulator.entityType, [accumulator.entityId])
    else ids.push(accumulator.entityId)
  }

  const titles = new Map<string, ResolvedTitle>()
  for (const [entityType, ids] of idsByType) {
    const resolved = await readTitles(entityType, ids)
    for (const [id, info] of resolved) titles.set(recordKey(entityType, id), info)
  }

  return [...byRecord.values()]
    .map((accumulator): RunChangedRecord => {
      const resolved = titles.get(recordKey(accumulator.entityType, accumulator.entityId))
      return {
        entityType: accumulator.entityType,
        entityId: accumulator.entityId,
        title: resolved?.title ?? null,
        action: accumulator.action,
        fieldCount: accumulator.fields.size,
        occurredAt: accumulator.occurredAt,
        // No row at all → the record was hard-deleted since the run. The entry STAYS: the audit
        // row is the fact that it was mutated. It is simply not linkable.
        deleted: resolved === undefined ? true : resolved.deleted,
      }
    })
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
}
