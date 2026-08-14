import { db } from "@/db"
import { workflows } from "@/db/schema/workflows"
import { eq } from "drizzle-orm"
import type { CrmEventName, CrmEventPayload, DealStageChangedPayload } from "@/lib/events/types"
import type { CrmEventTriggerConfig } from "./types"
import { createWorkflowRun } from "./create-run"
import type { TriggerEnvelope } from "./types"
import { unwrapFormulaValue } from "@/lib/formula-helpers"

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
 * Query all active workflows, find matching CRM event triggers, and create
 * a workflow run for each match. Errors in individual run creation are caught
 * to avoid blocking other matches.
 */
export async function matchAndFireTriggers(
  eventName: CrmEventName,
  payload: CrmEventPayload
): Promise<void> {
  const activeWorkflows = await db
    .select()
    .from(workflows)
    .where(eq(workflows.active, true))

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
        console.log(
          `[workflow-trigger] Workflow ${workflow.id} triggered by ${eventName}`
        )
      } catch (err) {
        console.error(
          `[workflow-trigger] Failed to create run for workflow ${workflow.id}:`,
          err
        )
      }
    }
  }
}
