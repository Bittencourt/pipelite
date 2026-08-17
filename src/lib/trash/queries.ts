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
import { and, count, desc, eq, isNotNull, sql, type SQL } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"

import { db } from "@/db"
import { activities, auditLog, deals, organizations, people, users } from "@/db/schema"
import { workflowRuns, workflows } from "@/db/schema/workflows"
import type { EntityType } from "@/db/schema/custom-fields"
import type { AuditActorKind } from "@/lib/audit/actor-context"

import { TRASH_PARENTS, TRASH_TAB_TO_ENTITY, type TrashTab } from "./entity-types"
import { presentDeletedBy, type DeletedByPresentation, type DeletedByRow } from "./present"

const LOG_PREFIX = "[trash-queries]"

/** Matches the four existing list tables (37-UI-SPEC § Route and tab mechanics). */
export const TRASH_PAGE_SIZE = 50

/** Who is looking. `role` is whatever the session carries, which may be absent entirely. */
export interface TrashViewer {
  userId: string
  role: string | null | undefined
}

/**
 * One rendered trash row.
 *
 * `secondary` is a STRING OR NULL on every tab, including Activities: the due date is serialised
 * to an ISO-8601 instant here and formatted at the component layer, so the row type stays uniform
 * across the four tabs and no `Date` other than `deletedAt` crosses into a client component.
 */
export interface TrashRow {
  id: string
  name: string
  secondary: string | null
  deletedAt: Date
  /** The names of this record's parents that are ALSO in trash. Always empty for organizations. */
  linkedParents: string[]
  deletedBy: DeletedByPresentation
}

/** What the ownership guards and the restore/purge toasts need about a single trashed record. */
export interface TrashedRecordRef {
  id: string
  ownerId: string
  name: string
}

/**
 * THE PREDICATE EVERY READ IN THIS MODULE SHARES.
 *
 * Both halves are composed into ONE where clause so the database applies them together. Returning
 * a composed `SQL` rather than re-deriving the scope at each call site is what makes it impossible
 * for the counts and the rows to drift apart: they call this with the same viewer and therefore
 * get the same scope, which is the whole of "a count a user cannot explain never appears".
 */
function trashScope(deletedAt: PgColumn, ownerId: PgColumn, viewer: TrashViewer): SQL {
  // An admin sees every trashed record; everyone else sees only their own. `undefined` is
  // drizzle's "omit this condition", so an admin's clause is `deleted_at IS NOT NULL` alone.
  const scope = viewer.role === "admin" ? undefined : eq(ownerId, viewer.userId)

  // `and()` is only `undefined` when every argument is, and the first one here never is.
  return and(isNotNull(deletedAt), scope) as SQL
}

/**
 * IS THIS PARENT IN TRASH, AS FAR AS THIS VIEWER IS ENTITLED TO KNOW.
 *
 * Rule 1 above is about the parent joins too, and it was not being applied to them. `trashScope`
 * guards the BASE table, but the parent `LEFT JOIN`s carried no owner predicate, so a bare
 * `IS NOT NULL` on the parent's `deleted_at` projected the trashed state of records outside the
 * viewer's scope. A member owning deal *D* under a colleague's organization *O* therefore learned
 * that *O* is in trash — a record they cannot see on any tab, and one `restoreWithLinked` correctly
 * REFUSES to restore for them (src/app/trash/actions.ts). The read side was disclosing precisely
 * what the write side takes care to protect, and it disclosed the parent's NAME with it: this
 * boolean is what `collectTrashedParents` gates the badge's label on.
 *
 * Composed from the SAME `trashScope` the rows and the counts use, deliberately — a second
 * hand-written owner comparison is the drift Phase 35 recorded and this module's rule 1 exists to
 * prevent. Under a `LEFT JOIN` with no matched parent every term is `NULL`, `IS NOT NULL` is
 * `false`, and `false AND NULL` is `false` in SQL's three-valued logic, so an absent parent, a live
 * parent and an out-of-scope trashed parent all collapse to the same answer: nothing to flag.
 *
 * IT DEGRADES, IT DOES NOT REFUSE. The row itself still renders, and the linked-in-trash badge and
 * the *Restore with linked records* button both simply do not appear — which is honest, because the
 * button would have been offered only to silently skip that parent.
 *
 * WHAT THIS DELIBERATELY DOES NOT HIDE: the parent's name where it is a record's own SECONDARY
 * COLUMN (a deal's organization, an activity's deal). That column is locked in 37-CONTEXT and the
 * same name is already on the live list the viewer reads their own deals from, so it discloses
 * nothing new. The leak was never the name — it was the TRASHED STATE, and the badge that pairs
 * the two.
 */
function parentTrashedForViewer(
  deletedAt: PgColumn,
  ownerId: PgColumn,
  viewer: TrashViewer
): SQL<boolean> {
  return trashScope(deletedAt, ownerId, viewer).mapWith(Boolean)
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

/**
 * HOW MANY LINKED RECORDS A PURGE WOULD UNLINK — the number the confirmation dialog needs.
 *
 * The purge confirmation enumerates what is DESTROYED ("{name} and its notes") and what is
 * PRESERVED ("its change history is kept") and said nothing at all about what is MODIFIED. It is
 * modified: purging one deal nulls `deal_id` on up to 117 linked activities, and purging an
 * organization detaches every deal and person under it — records the admin never selected. UAT G1
 * observed a live person silently losing its organization through a dialog that gave no hint it
 * would happen. A consent screen that lists two of the three categories of consequence is not
 * consent for the third.
 *
 * COUNTS EXACTLY WHAT THE PURGE DETACHES, statement for statement — the same tables, the same
 * foreign keys, and the same ABSENCE of a `deleted_at` filter that the teardown in
 * `src/lib/mutations/*.ts` uses. That is deliberate on both halves:
 *
 *   - matching the teardown means the number in the dialog and the `detached` count in the purge's
 *     audit row are the same number, so the record of what happened cannot contradict what the
 *     admin agreed to;
 *   - and it is why this function needs no `deleted_at` predicate, which keeps rule 2 of this
 *     module intact (there is no `isNull` here, by construction).
 *
 * An activity detaches nothing and issues NO QUERY, the same posture `findTrashedParents` takes for
 * an organization: the emptiness is expressed as a control, not as a comment.
 *
 * Returns `null` — not `0` — when the count cannot be taken. Zero means "nothing will be unlinked",
 * which the dialog states as a fact; the caller must be able to tell that apart from "unknown" and
 * fall back to wording that promises nothing (rule 3: nothing here throws).
 */
export async function countPurgeImpact(
  entityType: EntityType,
  id: string
): Promise<number | null> {
  try {
    switch (entityType) {
      case "deal": {
        const rows = await db
          .select({ value: count() })
          .from(activities)
          .where(eq(activities.dealId, id))

        return rows[0]?.value ?? 0
      }

      case "person": {
        const rows = await db
          .select({ value: count() })
          .from(deals)
          .where(eq(deals.personId, id))

        return rows[0]?.value ?? 0
      }

      case "organization": {
        // Two child tables — the widest teardown, and the only one that needs two counts.
        const [dealRows, personRows] = await Promise.all([
          db.select({ value: count() }).from(deals).where(eq(deals.organizationId, id)),
          db.select({ value: count() }).from(people).where(eq(people.organizationId, id)),
        ])

        return (dealRows[0]?.value ?? 0) + (personRows[0]?.value ?? 0)
      }

      case "activity":
        // A leaf. Nothing points at it, so nothing is detached and nothing is asked.
        return 0

      default: {
        const unhandled: never = entityType
        void unhandled
        return null
      }
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} countPurgeImpact failed for ${entityType} ${id}:`, error)
    return null
  }
}

/** One trashed ancestor of a record, with everything the linked-restore path needs about it. */
export interface TrashedParentRef extends TrashedRecordRef {
  entityType: EntityType
}

/**
 * The parent foreign keys of one record, keyed by the PARENT's entity type.
 *
 * Read WITHOUT a `deleted_at` predicate: the child may be trashed (the linked-restore path) or
 * live (a detail page asking what of its context is missing), and neither answer changes which
 * parents it points at.
 */
async function readParentIds(
  entityType: EntityType,
  id: string
): Promise<Partial<Record<EntityType, string | null>> | null> {
  switch (entityType) {
    case "deal": {
      const rows = await db
        .select({ organizationId: deals.organizationId, personId: deals.personId })
        .from(deals)
        .where(eq(deals.id, id))
        .limit(1)

      const row = rows[0]
      return row ? { organization: row.organizationId, person: row.personId } : null
    }

    case "person": {
      const rows = await db
        .select({ organizationId: people.organizationId })
        .from(people)
        .where(eq(people.id, id))
        .limit(1)

      const row = rows[0]
      return row ? { organization: row.organizationId } : null
    }

    case "activity": {
      const rows = await db
        .select({ dealId: activities.dealId })
        .from(activities)
        .where(eq(activities.id, id))
        .limit(1)

      const row = rows[0]
      return row ? { deal: row.dealId } : null
    }

    case "organization":
      // Unreachable: `findTrashedParents` returns before calling this for an organization.
      return null

    default: {
      const unhandled: never = entityType
      void unhandled
      return null
    }
  }
}

/**
 * WHICH OF A RECORD'S PARENTS ARE THEMSELVES IN TRASH — derived on the server, from an id alone.
 *
 * This is what the "Restore with linked records" affordance is resolved against, and the reason it
 * takes an id rather than a list is a security property, not an ergonomic one: a client-supplied
 * list of records to restore is a client-supplied list of records to WRITE, and no re-check of the
 * clicked record would say anything about the other ids in it. The caller re-checks owner-or-admin
 * against each returned `ownerId` independently (T-37-02).
 *
 * Two round trips at most for the widest case (a deal with both parents trashed): one for the
 * child's foreign keys, then the parents concurrently. The parent lookup IS `findTrashedRecord` —
 * the same `isNotNull(deletedAt)` predicate and the same name/owner projection the ownership
 * guards already run against, so there is one place in this module where "a record that is in
 * trash" is expressed and this function does not become a second one.
 *
 * A LIVE parent is never returned. Nothing about it needs restoring, and a restore that reached it
 * would clear a `deleted_at` that was never set and write an audit row for an event that did not
 * happen.
 *
 * The parent SET comes from `TRASH_PARENTS`, never from a second list typed out here, which is what
 * keeps `TRASH_PARENTS.organization` being empty the single place that says an organization has no
 * linked-restore affordance — expressed here as an early return that issues NO QUERY AT ALL, so the
 * emptiness of that list is a control rather than a comment.
 */
export async function findTrashedParents(
  entityType: EntityType,
  id: string
): Promise<TrashedParentRef[]> {
  const parentTypes = TRASH_PARENTS[entityType]

  // Nothing to look up, so nothing is looked up.
  if (parentTypes.length === 0) return []

  try {
    const parentIds = await readParentIds(entityType, id)

    // No such record. From the caller's position that is the same answer as "no trashed parents".
    if (parentIds === null) return []

    const resolved = await Promise.all(
      parentTypes.map(async (parentType) => {
        const parentId = parentIds[parentType]

        // A null foreign key is not a query. A deal with no organization has nothing to restore
        // alongside it, and asking the database to confirm that costs a round trip per parent.
        if (parentId === null || parentId === undefined) return null

        const parent = await findTrashedRecord(parentType, parentId)

        return parent ? { entityType: parentType, ...parent } : null
      })
    )

    // Order is `TRASH_PARENTS` order — outermost first — because that is the order the caller
    // must restore them in: a parent restored AFTER its child means the child's formula cascade
    // ran while the parent was still trashed.
    return resolved.filter((parent): parent is TrashedParentRef => parent !== null)
  } catch (error) {
    console.error(`${LOG_PREFIX} findTrashedParents failed for ${entityType} ${id}:`, error)
    return []
  }
}

/**
 * THE FOUR TAB COUNTS, SCOPED EXACTLY AS THE ROWS ARE.
 *
 * Four aggregates, issued together. Each one carries the SAME `trashScope` the row query for that
 * tab carries, which is the property 37-UI-SPEC § Surface 1 requires: `Deals (12)` above a table
 * a non-admin can only see three rows of is a defect the user can see and cannot explain.
 *
 * Returns `null` — NOT a record of zeros — when any of the four rejects. Zeros are a number, and
 * a wrong number rendered confidently is worse than no number; the tabs omit their counts instead.
 */
export async function countTrashed(viewer: TrashViewer): Promise<Record<TrashTab, number> | null> {
  try {
    const [dealRows, personRows, organizationRows, activityRows] = await Promise.all([
      db
        .select({ value: count() })
        .from(deals)
        .where(trashScope(deals.deletedAt, deals.ownerId, viewer)),
      db
        .select({ value: count() })
        .from(people)
        .where(trashScope(people.deletedAt, people.ownerId, viewer)),
      db
        .select({ value: count() })
        .from(organizations)
        .where(trashScope(organizations.deletedAt, organizations.ownerId, viewer)),
      db
        .select({ value: count() })
        .from(activities)
        .where(trashScope(activities.deletedAt, activities.ownerId, viewer)),
    ])

    return {
      deals: dealRows[0]?.value ?? 0,
      people: personRows[0]?.value ?? 0,
      organizations: organizationRows[0]?.value ?? 0,
      activities: activityRows[0]?.value ?? 0,
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} countTrashed failed for viewer ${viewer.userId}:`, error)
    return null
  }
}

/** A row before its actor is resolved — the shape every per-tab query normalises to. */
type UnattributedRow = Omit<TrashRow, "deletedBy">

/** One possible parent of a record: is it in trash, and what is it called. */
interface ParentCandidate {
  trashed: boolean
  name: string | null
}

/**
 * The names of the record's parents that are also in trash.
 *
 * The parent SET comes from `TRASH_PARENTS`, never from a second list typed out at the call site.
 * That is what makes `TRASH_PARENTS.organization` being empty the single place that says the
 * linked-in-trash badge never renders on the Organizations tab — a component-level special case
 * would be a second place to keep current.
 */
function collectTrashedParents(
  entityType: EntityType,
  candidates: Partial<Record<EntityType, ParentCandidate>>
): string[] {
  const names: string[] = []

  for (const parent of TRASH_PARENTS[entityType]) {
    const candidate = candidates[parent]
    // A LEFT-joined parent that does not exist has `trashed === false`, so an absent parent and
    // a live one collapse to the same (correct) answer: nothing to flag.
    if (candidate?.trashed === true && candidate.name !== null && candidate.name !== "") {
      names.push(candidate.name)
    }
  }

  return names
}

async function listTrashedDeals(
  limit: number,
  offset: number,
  viewer: TrashViewer
): Promise<UnattributedRow[]> {
  const rows = await db
    .select({
      id: deals.id,
      name: deals.title,
      deletedAt: deals.deletedAt,
      organizationName: organizations.name,
      // Computed SERVER-SIDE in the same query — 37-UI-SPEC Assumption 2. Two extra boolean
      // columns on an already-joined row, not two extra round trips. Each one carries the
      // PARENT's OWN owner predicate; see `parentTrashedForViewer`.
      organizationTrashed: parentTrashedForViewer(
        organizations.deletedAt,
        organizations.ownerId,
        viewer
      ),
      personFirstName: people.firstName,
      personLastName: people.lastName,
      personTrashed: parentTrashedForViewer(people.deletedAt, people.ownerId, viewer),
    })
    .from(deals)
    // LEFT, because both parent references are nullable and a deal with no organization is not
    // a deal to hide from its owner.
    .leftJoin(organizations, eq(organizations.id, deals.organizationId))
    .leftJoin(people, eq(people.id, deals.personId))
    .where(trashScope(deals.deletedAt, deals.ownerId, viewer))
    .orderBy(desc(deals.deletedAt))
    .limit(limit)
    .offset(offset)

  const built: UnattributedRow[] = []

  for (const row of rows) {
    // Unreachable under `IS NOT NULL`; narrowing rather than asserting keeps the row type honest.
    if (row.deletedAt === null) continue

    built.push({
      id: row.id,
      name: row.name,
      secondary: row.organizationName,
      deletedAt: row.deletedAt,
      linkedParents: collectTrashedParents("deal", {
        organization: { trashed: row.organizationTrashed, name: row.organizationName },
        person: {
          trashed: row.personTrashed,
          name:
            row.personFirstName === null || row.personLastName === null
              ? null
              : personName(row.personFirstName, row.personLastName),
        },
      }),
    })
  }

  return built
}

async function listTrashedPeople(
  limit: number,
  offset: number,
  viewer: TrashViewer
): Promise<UnattributedRow[]> {
  const rows = await db
    .select({
      id: people.id,
      firstName: people.firstName,
      lastName: people.lastName,
      email: people.email,
      deletedAt: people.deletedAt,
      organizationName: organizations.name,
      // The PARENT's own owner predicate rides on this boolean — see `parentTrashedForViewer`.
      organizationTrashed: parentTrashedForViewer(
        organizations.deletedAt,
        organizations.ownerId,
        viewer
      ),
    })
    .from(people)
    .leftJoin(organizations, eq(organizations.id, people.organizationId))
    .where(trashScope(people.deletedAt, people.ownerId, viewer))
    .orderBy(desc(people.deletedAt))
    .limit(limit)
    .offset(offset)

  const built: UnattributedRow[] = []

  for (const row of rows) {
    if (row.deletedAt === null) continue

    built.push({
      id: row.id,
      name: personName(row.firstName, row.lastName),
      // The disambiguator between two people with the same name (37-UI-SPEC § Columns).
      secondary: row.email,
      deletedAt: row.deletedAt,
      linkedParents: collectTrashedParents("person", {
        organization: { trashed: row.organizationTrashed, name: row.organizationName },
      }),
    })
  }

  return built
}

async function listTrashedOrganizations(
  limit: number,
  offset: number,
  viewer: TrashViewer
): Promise<UnattributedRow[]> {
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      website: organizations.website,
      deletedAt: organizations.deletedAt,
    })
    .from(organizations)
    // NO parent join, and none is possible: `TRASH_PARENTS.organization` is empty, so a join
    // here would fetch columns nothing could ever read.
    .where(trashScope(organizations.deletedAt, organizations.ownerId, viewer))
    .orderBy(desc(organizations.deletedAt))
    .limit(limit)
    .offset(offset)

  const built: UnattributedRow[] = []

  for (const row of rows) {
    if (row.deletedAt === null) continue

    built.push({
      id: row.id,
      name: row.name,
      secondary: row.website,
      deletedAt: row.deletedAt,
      linkedParents: collectTrashedParents("organization", {}),
    })
  }

  return built
}

async function listTrashedActivities(
  limit: number,
  offset: number,
  viewer: TrashViewer
): Promise<UnattributedRow[]> {
  const rows = await db
    .select({
      id: activities.id,
      name: activities.title,
      dueDate: activities.dueDate,
      deletedAt: activities.deletedAt,
      dealTitle: deals.title,
      // The PARENT's own owner predicate rides on this boolean — see `parentTrashedForViewer`.
      dealTrashed: parentTrashedForViewer(deals.deletedAt, deals.ownerId, viewer),
    })
    .from(activities)
    .leftJoin(deals, eq(deals.id, activities.dealId))
    .where(trashScope(activities.deletedAt, activities.ownerId, viewer))
    .orderBy(desc(activities.deletedAt))
    .limit(limit)
    .offset(offset)

  const built: UnattributedRow[] = []

  for (const row of rows) {
    if (row.deletedAt === null) continue

    built.push({
      id: row.id,
      name: row.name,
      // Serialised HERE rather than passed on as a `Date`: activity titles are frequently
      // generic ("Call", "Follow up") so the date is the identity, and a string keeps the row
      // type uniform across the four tabs and safe to hand to a client component.
      secondary: row.dueDate.toISOString(),
      deletedAt: row.deletedAt,
      linkedParents: collectTrashedParents("activity", {
        deal: { trashed: row.dealTrashed, name: row.dealTitle },
      }),
    })
  }

  return built
}

function listRowsForTab(
  tab: TrashTab,
  limit: number,
  offset: number,
  viewer: TrashViewer
): Promise<UnattributedRow[]> {
  switch (tab) {
    case "deals":
      return listTrashedDeals(limit, offset, viewer)
    case "people":
      return listTrashedPeople(limit, offset, viewer)
    case "organizations":
      return listTrashedOrganizations(limit, offset, viewer)
    case "activities":
      return listTrashedActivities(limit, offset, viewer)
    default: {
      // A fifth tab is a compile error here rather than an empty table at runtime.
      const unhandled: never = tab
      void unhandled
      return Promise.resolve([])
    }
  }
}

/**
 * ONE PAGE OF THE ACTIVE TAB.
 *
 * Only the active tab is queried for rows; the other three contribute counts only. The pagination
 * is the four existing list tables' idiom verbatim (`src/app/organizations/page.tsx:18-58`): ask
 * for `TRASH_PAGE_SIZE * page + 1` rows and let the presence of the probe row answer `hasMore`,
 * so no second `COUNT(*)` is issued to decide whether to show "Load more".
 *
 * The actors are then resolved for the WHOLE page in one call. `presentDeletedBy` runs for real
 * on every row, including the `undefined` case, so a record with no audit row says "not recorded"
 * rather than being collapsed into an unknown user (T-37-REP2) — which today is every record in
 * trash, because `audit_log` holds no `action = 'deleted'` rows from before Phase 36 shipped.
 *
 * `{ ok: false }` rather than an empty success on failure: the page must be able to tell "nothing
 * in trash" from "the query broke", and it has no `error.tsx` above it to catch a throw (T-37-20).
 */
export async function listTrashed(
  tab: TrashTab,
  page: number,
  viewer: TrashViewer
): Promise<{ ok: true; rows: TrashRow[]; hasMore: boolean } | { ok: false }> {
  const pageRows = TRASH_PAGE_SIZE * page

  try {
    // Offset 0 — this read is CUMULATIVE by design, because "Load more" appends to a list the user
    // is already looking at. `MAX_TRASH_PAGE` in entity-types.ts is what bounds the resulting cost.
    const fetched = await listRowsForTab(tab, pageRows + 1, 0, viewer)

    const hasMore = fetched.length > pageRows
    const kept = hasMore ? fetched.slice(0, pageRows) : fetched

    return { ok: true, rows: await attribute(tab, kept), hasMore }
  } catch (error) {
    console.error(`${LOG_PREFIX} listTrashed failed for ${tab} page ${page}:`, error)
    return { ok: false }
  }
}

/**
 * ONE OFFSET WINDOW OF A TAB — the non-cumulative read, for a caller that pages by offset.
 *
 * `/api/v1/trash` used to convert its `offset`/`limit` into a `listTrashed` PAGE and slice the
 * window back out of it, which meant serving `?offset=9950` fetched 10,000 rows, bound 10,000 ids
 * into one array parameter and threw 9,950 of them away — per request, from any authenticated
 * caller, reachable by editing a URL (WR-03). It also made the response silently short in the band
 * where the page cap truncated the fetched window while `meta.total` still reported the full count
 * (IN-04). Both were artefacts of borrowing a cumulative read for an offset-based contract.
 *
 * So the REST surface gets the primitive it actually wants: `LIMIT`/`OFFSET` straight through to
 * the same scoped, ordered query. The cost is CONSTANT in `limit` and independent of `offset`, and
 * the row set needs no slicing afterwards, so there is no arithmetic left to disagree with itself.
 *
 * The offset is NOT clamped here, deliberately — bounding how deep a caller may page is the route's
 * decision and it is made there, where the `limit` is also bounded. What this function guarantees is
 * that a large offset costs an index skip rather than a large result set.
 *
 * Same failure posture as `listTrashed`: `{ ok: false }`, never an empty success, so the caller can
 * tell "nothing in trash" from "the query broke".
 */
export async function listTrashedWindow(
  tab: TrashTab,
  limit: number,
  offset: number,
  viewer: TrashViewer
): Promise<{ ok: true; rows: TrashRow[] } | { ok: false }> {
  try {
    const fetched = await listRowsForTab(tab, limit, offset, viewer)

    return { ok: true, rows: await attribute(tab, fetched) }
  } catch (error) {
    console.error(
      `${LOG_PREFIX} listTrashedWindow failed for ${tab} limit ${limit} offset ${offset}:`,
      error
    )
    return { ok: false }
  }
}

/**
 * Resolve "deleted by" for a whole window in ONE query and attach it.
 *
 * Shared by both readers above so the N+1 that `resolveDeletedBy` exists to prevent cannot come
 * back through whichever of the two a later change happens to touch. `presentDeletedBy` runs for
 * every row including the absent case, so a record with no audit row says "not recorded" rather
 * than being collapsed into an unknown user (T-37-REP2).
 */
async function attribute(tab: TrashTab, rows: UnattributedRow[]): Promise<TrashRow[]> {
  const attribution = await resolveDeletedBy(
    TRASH_TAB_TO_ENTITY[tab],
    rows.map((row) => row.id)
  )

  return rows.map((row) => ({ ...row, deletedBy: presentDeletedBy(attribution.get(row.id)) }))
}
