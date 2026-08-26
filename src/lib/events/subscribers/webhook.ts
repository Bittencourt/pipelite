import { crmBus } from "@/lib/events"
import type { CrmEventName, CrmEventPayload } from "@/lib/events"
import { triggerWebhook } from "@/lib/api/webhooks/deliver"
import { recordTick, registerSubscriber } from "@/lib/observability/heartbeat"

/**
 * Every name in `CrmEventMap`, ENFORCED BY THE COMPILER rather than by the list being right today
 * (WR-14).
 *
 * This was `const ALL_EVENTS: CrmEventName[] = [ … 13 names … ]`. That type permits a SHORT list,
 * so a fourteenth event added to `CrmEventMap` and emitted from the mutation layer would simply
 * not be subscribed here — no compile error, no lint error, and no test in this repository counts
 * the entries. A subscriber that silently stops covering an event is a production defect, not a
 * test one: for this file it means a CRM write that reaches no webhook and no workflow trigger.
 *
 * `Record<CrmEventName, true>` makes a missing key TS2741 and a stale key TS2353. The array is
 * derived from its keys, so the list and the map cannot drift apart. `_resetForTesting` iterates
 * the same array, so a name that is subscribed is a name that is torn down.
 *
 * MEASURED in both directions, verbatim from `tsc --noEmit`:
 *
 *   error TS2741: Property '"deal.stage_changed"' is missing in type '{ "deal.created": true; … }'
 *   but required in type 'Record<keyof CrmEventMap, true>'.
 *
 *   error TS2353: Object literal may only specify known properties, and '"deal.archived"' does not
 *   exist in type 'Record<keyof CrmEventMap, true>'.
 *
 * Both edits restored. A compile error is invisible in a test report, which is why the measurement
 * is recorded here rather than left to be trusted.
 */
const ALL_EVENT_FLAGS: Record<CrmEventName, true> = {
  "deal.created": true,
  "deal.updated": true,
  "deal.deleted": true,
  "deal.stage_changed": true,
  "person.created": true,
  "person.updated": true,
  "person.deleted": true,
  "organization.created": true,
  "organization.updated": true,
  "organization.deleted": true,
  "activity.created": true,
  "activity.updated": true,
  "activity.deleted": true,
}

export const ALL_EVENTS = Object.keys(ALL_EVENT_FLAGS) as CrmEventName[]

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
