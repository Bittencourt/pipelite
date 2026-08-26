import { db } from "@/db"
import { workflows } from "@/db/schema/workflows"
import { activities, deals, organizations, people } from "@/db/schema"
import { and, eq, type SQL } from "drizzle-orm"
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core"
import type {
  CrmEntityType,
  CrmEventName,
  CrmEventPayload,
  DealStageChangedPayload,
} from "@/lib/events/types"
import type { CrmEventTriggerConfig } from "./types"
import { createWorkflowRun } from "./create-run"
import type { TriggerEnvelope } from "./types"
import { unwrapFormulaValue } from "@/lib/formula-helpers"
import { requireScopedPredicate } from "@/lib/api/stage-scope"
import { log } from "@/lib/log"

/** Both key spellings a CRM event payload can carry its custom fields under. */
const CUSTOM_FIELD_KEYS = ["customFields", "custom_fields"] as const

/**
 * Return a copy of the payload data in which every custom field value is reduced to its
 * scalar.
 *
 * A recalculated formula is persisted as `{ formula: true, value, error }` (D-05).
 * `resolveFieldPath` walks dot paths over this envelope, so without normalisation a condition
 * on `trigger.data.customFields.Margin` receives the wrapper object, `Number({...})` yields
 * `NaN`, and `greater_than` returns `false` forever — a workflow that silently never fires
 * and reports no error. SC-3 requires the condition to branch on the current value.
 *
 * `unwrapFormulaValue` (raw scalar, or `null` for an errored formula) is used rather than
 * `formatFormulaValueForText`: a condition must compare against the real value, and turning
 * an error into the string `#ERROR: ...` would make numeric comparisons behave
 * unpredictably. `null` is already handled by the existing operators.
 *
 * Both `customFields` (camelCase, emitted by the mutation layer) and `custom_fields`
 * (snake_case, emitted by the v1 routes via `serialize*`) are handled, because the correct
 * condition path otherwise depends on which write path fired the event.
 *
 * The payload object is NEVER mutated. It is shared across `crmBus` subscribers, and the
 * webhook subscriber (`events/subscribers/webhook.ts`) forwards `payload.data` verbatim.
 * The webhook body deliberately keeps the full wrapper (D-17): it is structured JSON and
 * unwrapping would discard the error signal. SC-2's webhook half is satisfied by
 * recalc-before-emit ordering, not by a reader change.
 */
function normalizeFormulaValues(
  data: Record<string, unknown>
): Record<string, unknown> {
  let normalized: Record<string, unknown> | null = null

  for (const key of CUSTOM_FIELD_KEYS) {
    const fields = data[key]
    if (
      typeof fields !== "object" ||
      fields === null ||
      Array.isArray(fields)
    ) {
      continue
    }

    const unwrapped: Record<string, unknown> = {}
    for (const [name, value] of Object.entries(
      fields as Record<string, unknown>
    )) {
      unwrapped[name] = unwrapFormulaValue(value)
    }

    normalized ??= { ...data }
    normalized[key] = unwrapped
  }

  return normalized ?? data
}

/**
 * Check whether a single CRM event trigger config matches a given event.
 * Pure function -- no side effects, no DB access.
 */
export function matchesTrigger(
  trigger: CrmEventTriggerConfig,
  eventName: CrmEventName,
  payload: CrmEventPayload
): boolean {
  // Parse event name -> entity + action
  const [eventEntity, eventAction] = eventName.split(".") as [string, string]

  // Entity + action must match
  if (trigger.entity !== eventEntity || trigger.action !== eventAction) {
    return false
  }

  // Field filter check
  if (trigger.fieldFilters && trigger.fieldFilters.length > 0) {
    if (!payload.changedFields) return false
    const hasOverlap = trigger.fieldFilters.some((f) =>
      payload.changedFields!.includes(f)
    )
    if (!hasOverlap) return false
  }

  // Stage filter checks apply only to stage_changed triggers. A residual
  // from/to stage filter left on e.g. an "updated" trigger must not silently
  // prevent it from ever matching.
  if (trigger.action === "stage_changed") {
    if (trigger.fromStageId) {
      const stagePayload = payload as DealStageChangedPayload
      if (stagePayload.oldStageId !== trigger.fromStageId) return false
    }

    if (trigger.toStageId) {
      const stagePayload = payload as DealStageChangedPayload
      if (stagePayload.newStageId !== trigger.toStageId) return false
    }
  }

  return true
}

/**
 * =============================================================================
 * CR-05 — THE PER-RECORD AUTHORIZATION BOUNDARY FOR THE CRM EVENT STREAM
 * =============================================================================
 *
 * WHAT WAS OPEN. This function selected `from(workflows).where(eq(workflows.active, true))` with
 * NO owner predicate of any kind, so EVERY active workflow in the deployment fired on EVERY
 * user's CRM write. Two `/api/v1` requests and then waiting was the whole exploit:
 * `POST /api/v1/workflows` with `{"triggers":[{"type":"crm_event","entity":"deal",
 * "action":"updated"}],"nodes":[]}`, then `PUT .../{id}` `{"active":true}`. `matchesTrigger`
 * compares only entity and action, and `fieldFilters` defaults to `[]` so the field check is
 * skipped entirely. `payload.data` is the victim's FULL row — every `crmBus.emit` in the mutation
 * layer passes the post-write row, and for a delete `previous` carries it — and `createWorkflowRun`
 * persists that envelope as `workflow_runs.trigger_data`, which `serializeRun` returns VERBATIM
 * from `GET /api/v1/workflows/{id}/runs`. `nodes: []` sufficed: the run row is stored before any
 * node runs.
 *
 * This never resolves a target id, so the CR-02 guard in `src/lib/execution/actions/crm.ts` was
 * not on this path — that guard scopes the record a node RESOLVES.
 *
 * WHY THE PREDICATE COMPARES AGAINST THE RECORD'S OWNER AND NOT AGAINST `payload.userId`.
 *
 * The iteration-3 review suggested `eq(workflows.createdBy, payload.userId)`, which is the ACTING
 * user. That was rejected here for two reasons, both measured rather than argued:
 *
 *   - `payload.userId` IS NOT ALWAYS A USER ID. `src/lib/mutations/dedup.ts:672-685` emits
 *     `<entity>.deleted` with `userId: actor?.userId ?? ""`. Scoping on it would silently stop
 *     every merge from firing any trigger for anybody — a legitimate feature lost to a security
 *     fix, with no error raised anywhere.
 *   - ACTOR AND OWNER GENUINELY DIVERGE. `src/app/deals/actions.ts:89,161,254,347,445,482` grant
 *     admins a documented bypass, so an admin editing another member's deal emits with the ADMIN's
 *     id — scoping on the actor would stop the OWNER's own automation from firing on the owner's
 *     own record, which is a regression rather than a fix. `pipedrive-api-import-actions.ts`
 *     writes rows owned by MAPPED users while the actor is the importer, and diverges the same way.
 *
 * So `workflows.createdBy` is compared to the OWNER of the record the event describes, read from
 * that record's own `owner_id`. All four entities carry `owner_id text NOT NULL REFERENCES users.id`
 * (verified in `src/db/schema/{deals,people,organizations,activities}.ts`), and every delete in
 * this product is a SOFT delete — the merge loser included (`dedup.ts:485-488`) — so the column is
 * readable at match time for every event, tombstones included.
 *
 * IT FAILS CLOSED. An entity whose owner cannot be resolved fires NOTHING and logs at error level.
 * The alternative — falling back to the unscoped select — is the defect.
 *
 * NOTE ON THE SIBLING SUBSCRIBERS ON THIS SAME EVENT STREAM, checked rather than assumed:
 *   - `events/subscribers/webhook.ts:32-39` already scopes delivery by `payload.userId`
 *     (`deliver.ts:49-51` — `eq(webhooks.userId, userId)`), so it is scoped, if by the actor
 *     rather than by the owner. That is not a cross-owner read: outside the deals admin bypass, no
 *     write path in this product lets a principal write a record they cannot read.
 *   - `events/subscribers/audit.ts` writes `audit_log`, and `GET /api/v1/audit` is admin-only
 *     (`authorizeAuditRead`), so those rows are not readable across the boundary.
 *   - `events/subscribers/stage-history.ts` writes one `deal_stage_history` row about the deal that
 *     moved, carrying no other owner's data.
 *   - `triggers/schedule-processor.ts` also selects every active workflow, but its envelope is
 *     `{ scheduledAt }` and carries no record at all.
 * =============================================================================
 */

/** The `owner_id` column of each entity a CRM event can describe, plus the table to read it from. */
const EVENT_OWNER_COLUMNS: Record<
  CrmEntityType,
  { table: PgTable; idColumn: AnyPgColumn; ownerColumn: AnyPgColumn }
> = {
  deal: { table: deals, idColumn: deals.id, ownerColumn: deals.ownerId },
  person: { table: people, idColumn: people.id, ownerColumn: people.ownerId },
  organization: {
    table: organizations,
    idColumn: organizations.id,
    ownerColumn: organizations.ownerId,
  },
  activity: { table: activities, idColumn: activities.id, ownerColumn: activities.ownerId },
}

/**
 * A `Map`, not the object literal above, and the conversion is the point.
 *
 * `EVENT_OWNER_COLUMNS[entity]` walks `Object.prototype`, so `entity: "constructor"` would return
 * the `Object` constructor — truthy, so a `if (!def)` guard does not fire, and `def.table` is then
 * `undefined` inside a drizzle builder. `Map.get` has no prototype chain. The `Record` keyed by the
 * closed `CrmEntityType` union is kept as the SOURCE so that adding a fifth entity to
 * `CrmEventMap` without adding it here is a compile error (TS2741) rather than a runtime `null`.
 */
const EVENT_OWNER_LOOKUP = new Map(Object.entries(EVENT_OWNER_COLUMNS))

/**
 * The `owner_id` of the record this event describes, or `null` if it cannot be established.
 *
 * `null` means FIRE NOTHING. It is returned for an unregistered entity, a row that is no longer
 * there, and an empty owner alike: none of the three may be treated as "match everything", which
 * is what the absent predicate used to do.
 */
async function resolveEventRecordOwner(payload: CrmEventPayload): Promise<string | null> {
  const def = EVENT_OWNER_LOOKUP.get(payload.entity)
  if (!def) return null

  const rows = await db
    .select({ ownerId: def.ownerColumn })
    .from(def.table)
    .where(eq(def.idColumn, payload.entityId))
    .limit(1)

  const ownerId = rows[0]?.ownerId

  return typeof ownerId === "string" && ownerId.length > 0 ? ownerId : null
}

/**
 * Query the active workflows OWNED BY THE EVENT RECORD'S OWNER, find matching CRM event triggers,
 * and create a workflow run for each match. Errors in individual run creation are caught to avoid
 * blocking other matches. See the CR-05 block above for why the scope is the owner and not the
 * acting user.
 */
export async function matchAndFireTriggers(
  eventName: CrmEventName,
  payload: CrmEventPayload
): Promise<void> {
  const ownerId = await resolveEventRecordOwner(payload)

  if (!ownerId) {
    // FAIL CLOSED, LOUDLY. Firing nothing loses an automation; falling back to the unscoped
    // select hands every other user's row to every active workflow, which is what CR-05 was.
    log.error("workflow-trigger", "no owner resolved for CRM event; firing no triggers", {
      eventName,
      entity: payload.entity,
      entityId: payload.entityId,
    })
    return
  }

  // Declared `SQL[]` so `terms.length` counts real terms by TYPE rather than by inspection, and
  // routed through `requireScopedPredicate` so a future edit that makes the owner equality
  // conditional throws instead of rendering an unfiltered query. `and(...)` is typed
  // `SQL | undefined` and silently drops `undefined` arguments — that is the documented calling
  // convention, NOT a type error.
  const terms: SQL[] = [eq(workflows.active, true), eq(workflows.createdBy, ownerId)]
  const activeWorkflows = await db
    .select()
    .from(workflows)
    .where(requireScopedPredicate(and(...terms), terms.length, "matchAndFireTriggers' owner scope"))

  for (const workflow of activeWorkflows) {
    const triggers = (workflow.triggers ?? []) as Array<Record<string, unknown>>

    for (const triggerRaw of triggers) {
      if (triggerRaw.type !== "crm_event") continue

      const trigger = triggerRaw as unknown as CrmEventTriggerConfig

      if (!matchesTrigger(trigger, eventName, payload)) continue

      // Entity record fields are spread first; event metadata is written
      // after the spread so it can never be clobbered by record fields.
      // Stage-change metadata (oldStageId/newStageId) lives at the top level
      // of the payload, not in payload.data, so it must be copied explicitly
      // for stage_changed workflows to reference from/to stages.
      const stagePayload = payload as Partial<DealStageChangedPayload>
      const envelope: TriggerEnvelope = {
        trigger_type: "crm_event",
        trigger_id: `${eventName}-${Date.now()}`,
        timestamp: payload.timestamp,
        data: {
          ...normalizeFormulaValues(payload.data),
          entity: payload.entity,
          entityId: payload.entityId,
          action: payload.action,
          changedFields: payload.changedFields,
          userId: payload.userId,
          ...(stagePayload.oldStageId !== undefined
            ? { oldStageId: stagePayload.oldStageId }
            : {}),
          ...(stagePayload.newStageId !== undefined
            ? { newStageId: stagePayload.newStageId }
            : {}),
        },
      }

      try {
        await createWorkflowRun(workflow.id, envelope)
        log.info("workflow-trigger", "Workflow triggered", {
          workflowId: workflow.id,
          eventName,
        })
      } catch (err) {
        log.error("workflow-trigger", "Failed to create run", {
          workflowId: workflow.id,
          err,
        })
      }
    }
  }
}
