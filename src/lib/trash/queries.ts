/**
 * TRASH-01 — the read layer for `/trash`.
 *
 * Everything the trash surface knows about the database lives here, and three rules hold across
 * every function in the file:
 *
 *   1. THE OWNER PREDICATE IS PART OF THE QUERY. A non-admin sees a trashed record only if they
 *      could have seen it live. That is enforced inside the WHERE clause — never by filtering a
 *      result set afterwards, and never on the rows without also being on the counts. A tab that
 *      reads `Deals (12)` above three rows is a defect the user can see and cannot explain
 *      (T-37-02, 37-UI-SPEC § Surface 1).
 *   2. `isNotNull(table.deletedAt)` IS WRITTEN OUT, EVERY TIME. This is the only surface in the
 *      codebase that inverts the live predicate, and Phase 35 recorded that an index predicate
 *      does not enforce itself. There is no `isNull` in this module by construction — reading a
 *      live record from here would be a bug, not a feature.
 *   3. NOTHING THROWS. `/trash` has no `error.tsx` above it, so an unguarded rejection takes the
 *      whole page down (T-37-20). Every function fails into a value the page can render: an empty
 *      `Map`, a `null`. Logs carry identifiers and counts only, never record contents.
 */
import { and, eq, isNotNull, sql } from "drizzle-orm"

import { db } from "@/db"
import { activities, auditLog, deals, organizations, people, users } from "@/db/schema"
import { workflowRuns, workflows } from "@/db/schema/workflows"
import type { EntityType } from "@/db/schema/custom-fields"
import type { AuditActorKind } from "@/lib/audit/actor-context"

import type { DeletedByRow } from "./present"

const LOG_PREFIX = "[trash-queries]"

/** What the ownership guards and the restore/purge toasts need about a single trashed record. */
export interface TrashedRecordRef {
  id: string
  ownerId: string
  name: string
}

/** `people` has no single title column (src/lib/audit/linked-records.ts:124-125). */
function personName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim()
}

function asString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

/**
 * WHO DELETED A WHOLE PAGE OF RECORDS — in ONE query.
 *
 * The N+1 this replaces is the risk 37-CONTEXT flags: a fifty-row page resolving its actors one
 * lookup at a time is fifty round trips for a table the user will scroll past in a second.
 *
 * `DISTINCT ON (entity_id)` with `ORDER BY entity_id, created_at DESC` takes the LATEST delete
 * per record. That ordering is required by `DISTINCT ON` and is also exactly
 * `audit_log_entity_idx`'s column order once `entity_type` is fixed, so the planner serves it
 * from an index scan feeding at most an incremental sort with `Presorted Key: entity_id`. A
 * `LATERAL` join would also be one round trip but costs one index descent per row.
 *
 * This is the only hand-composed SQL this phase writes, so it follows the discipline
 * `src/lib/timeline/assemble.ts` documents for the repo's only other one: EVERY VALUE BINDS. The
 * entity type is typed as the closed `EntityType` union and passed as a parameter, and the id
 * list binds as a SINGLE array parameter via `sql.param` — a bare `${ids}` would expand into a
 * parenthesised chunk list (`sql.js:93-103`), which is not what `= ANY(...)` takes.
 *
 * An id absent from the returned map means NO AUDIT ROW EXISTS, which `presentDeletedBy` turns
 * into "not recorded" rather than "unknown user" (T-37-REP2).
 */
export async function resolveDeletedBy(
  entityType: EntityType,
  entityIds: string[]
): Promise<Map<string, DeletedByRow>> {
  const resolved = new Map<string, DeletedByRow>()

  // An empty page is not a query. `= ANY('{}')` is a guaranteed-empty round trip.
  if (entityIds.length === 0) return resolved

  try {
    const rows = await db.execute(sql`
      SELECT DISTINCT ON (al.entity_id)
             al.entity_id  AS entity_id,
             al.actor_kind AS actor_kind,
             al.created_at AS created_at,
             u.id          AS actor_id,
             u.name        AS actor_name,
             u.email       AS actor_email,
             wr.id         AS run_id,
             w.id          AS workflow_id,
             w.name        AS workflow_name
      FROM ${auditLog} al
      -- Every join is LEFT and at most one of the three actor references is set on any row,
      -- the same shape src/lib/timeline/sources.ts:723-731 uses.
      LEFT JOIN ${users} u ON u.id = al.actor_user_id
      LEFT JOIN ${workflowRuns} wr ON wr.id = al.workflow_run_id
      -- One hop past the run: the workflow NAME lives on the workflow, not the run.
      LEFT JOIN ${workflows} w ON w.id = wr.workflow_id
      WHERE al.entity_type = ${entityType}
        AND al.action = 'deleted'
        AND al.entity_id = ANY(${sql.param(entityIds)}::text[])
      ORDER BY al.entity_id, al.created_at DESC
    `)

    for (const raw of rows as unknown as Record<string, unknown>[]) {
      const entityId = asString(raw.entity_id)
      if (entityId === null) continue

      const createdAt = raw.created_at

      resolved.set(entityId, {
        entityId,
        actorKind: raw.actor_kind as AuditActorKind,
        actorId: asString(raw.actor_id),
        actorName: asString(raw.actor_name),
        actorEmail: asString(raw.actor_email),
        runId: asString(raw.run_id),
        workflowId: asString(raw.workflow_id),
        workflowName: asString(raw.workflow_name),
        createdAt: createdAt instanceof Date ? createdAt : new Date(String(createdAt)),
      })
    }
  } catch (error) {
    // Identifiers and counts only. The page degrades to "Not recorded", which is honest.
    console.error(
      `${LOG_PREFIX} resolveDeletedBy failed for ${entityType} (${entityIds.length} id(s)):`,
      error
    )
    return new Map()
  }

  return resolved
}

/**
 * The single-record lookup every restore and purge path runs its guard against.
 *
 * Returns the OWNER, because the server actions and the REST routes compare it to the session
 * before mutating anything, and the NAME, because the confirmation dialogs and toasts print it.
 * Returns `null` for a live record, a missing record and a failed query alike — from the caller's
 * position "there is no trashed record with this id" is one answer, and none of the three is a
 * reason to throw.
 */
export async function findTrashedRecord(
  entityType: EntityType,
  id: string
): Promise<TrashedRecordRef | null> {
  try {
    switch (entityType) {
      case "deal": {
        const rows = await db
          .select({ id: deals.id, ownerId: deals.ownerId, name: deals.title })
          .from(deals)
          .where(and(eq(deals.id, id), isNotNull(deals.deletedAt)))
          .limit(1)

        const row = rows[0]
        return row ? { id: row.id, ownerId: row.ownerId, name: row.name } : null
      }

      case "person": {
        const rows = await db
          .select({
            id: people.id,
            ownerId: people.ownerId,
            firstName: people.firstName,
            lastName: people.lastName,
          })
          .from(people)
          .where(and(eq(people.id, id), isNotNull(people.deletedAt)))
          .limit(1)

        const row = rows[0]
        return row
          ? { id: row.id, ownerId: row.ownerId, name: personName(row.firstName, row.lastName) }
          : null
      }

      case "organization": {
        const rows = await db
          .select({
            id: organizations.id,
            ownerId: organizations.ownerId,
            name: organizations.name,
          })
          .from(organizations)
          .where(and(eq(organizations.id, id), isNotNull(organizations.deletedAt)))
          .limit(1)

        const row = rows[0]
        return row ? { id: row.id, ownerId: row.ownerId, name: row.name } : null
      }

      case "activity": {
        const rows = await db
          .select({ id: activities.id, ownerId: activities.ownerId, name: activities.title })
          .from(activities)
          .where(and(eq(activities.id, id), isNotNull(activities.deletedAt)))
          .limit(1)

        const row = rows[0]
        return row ? { id: row.id, ownerId: row.ownerId, name: row.name } : null
      }

      default: {
        // A fifth entity type is a compile error here, not a silent null at runtime.
        const unhandled: never = entityType
        void unhandled
        return null
      }
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} findTrashedRecord failed for ${entityType} ${id}:`, error)
    return null
  }
}
