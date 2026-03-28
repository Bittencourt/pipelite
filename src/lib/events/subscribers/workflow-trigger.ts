import { crmBus } from "@/lib/events"
import type { CrmEventName, CrmEventPayload } from "@/lib/events/types"
import { matchAndFireTriggers } from "@/lib/triggers/matcher"

const ALL_EVENTS: CrmEventName[] = [
  "deal.created", "deal.updated", "deal.deleted", "deal.stage_changed",
  "person.created", "person.updated", "person.deleted",
  "organization.created", "organization.updated", "organization.deleted",
  "activity.created", "activity.updated", "activity.deleted",
]

let registered = false

export function registerWorkflowTriggerSubscriber(): void {
  if (registered) return

  for (const event of ALL_EVENTS) {
    crmBus.on(event, (payload: CrmEventPayload) => {
      matchAndFireTriggers(event, payload).catch((err) =>
        console.error("[workflow-trigger]", err)
      )
    })
  }

  registered = true
}

/** Reset registration state for testing only */
export function _resetForTesting(): void {
  if (registered) {
    for (const event of ALL_EVENTS) {
      crmBus.removeAllListeners(event)
    }
  }
  registered = false
}
