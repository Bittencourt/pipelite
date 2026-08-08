import { db } from "@/db"
import { workflows } from "@/db/schema/workflows"
import { eq } from "drizzle-orm"
import type { CrmEventName, CrmEventPayload, DealStageChangedPayload } from "@/lib/events/types"
import type { CrmEventTriggerConfig } from "./types"
import { createWorkflowRun } from "./create-run"
import type { TriggerEnvelope } from "./types"

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
          ...payload.data,
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
