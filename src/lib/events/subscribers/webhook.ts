import { crmBus } from "@/lib/events"
import type { CrmEventName, CrmEventPayload } from "@/lib/events"
import { triggerWebhook } from "@/lib/api/webhooks/deliver"
import { recordTick, registerSubscriber } from "@/lib/observability/heartbeat"

const ALL_EVENTS: CrmEventName[] = [
  "deal.created", "deal.updated", "deal.deleted", "deal.stage_changed",
  "person.created", "person.updated", "person.deleted",
  "organization.created", "organization.updated", "organization.deleted",
  "activity.created", "activity.updated", "activity.deleted",
]

// PER-INSTANCE AND UNREADABLE FROM ANYWHERE ELSE. Module-scoped, and this module is duplicated once
// per Turbopack module graph, so `/api/health` would read its own always-`false` copy. It exists only
// to stop a repeat call attaching thirteen more listeners. The health route reads the `globalThis`
// heartbeat registry instead; do not "simplify" it to consult this.
let registered = false

export function registerWebhookSubscriber(): void {
  if (registered) return

  // OBS-03. Registration IS this subscriber's liveness claim. A deployment with no webhooks
  // configured, or simply an idle CRM, fires this handler never — and is healthy.
  registerSubscriber("webhook-subscriber")

  for (const event of ALL_EVENTS) {
    crmBus.on(event, (payload: CrmEventPayload) => {
      // Handler entry, before anything that could return. Diagnostic only: `alive` never derives
      // from it. `recordTick` never throws, so it cannot break delivery below.
      recordTick("webhook-subscriber")

      triggerWebhook(
        payload.userId,
        event,
        payload.entity,
        payload.entityId,
        payload.action,
        payload.data
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
