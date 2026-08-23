import { crmBus } from "@/lib/events"
import type { CrmEventName, CrmEventPayload } from "@/lib/events/types"
import { matchAndFireTriggers } from "@/lib/triggers/matcher"
import { recordTick, registerSubscriber } from "@/lib/observability/heartbeat"
import { log } from "@/lib/log"

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
//
// This file has no test suite, so its wiring below is covered by a source gate only — there is no
// behavioural proof here that registration and ticking happen. See 42-07-SUMMARY.md.
let registered = false

export function registerWorkflowTriggerSubscriber(): void {
  if (registered) return

  // OBS-03. Registration IS this subscriber's liveness claim. A deployment with no workflow
  // triggers configured fires this handler on every CRM event and matches nothing — and a
  // deployment with no CRM activity fires it never. Both are healthy.
  registerSubscriber("workflow-trigger-subscriber")

  for (const event of ALL_EVENTS) {
    crmBus.on(event, (payload: CrmEventPayload) => {
      // Handler entry, before anything that could return. Diagnostic only: `alive` never derives
      // from it. `recordTick` never throws, so it cannot break matching below.
      recordTick("workflow-trigger-subscriber")

      // Stays swallowing: a trigger that failed to match must not take down the CRM write that
      // emitted the event. The arrow is required — handing `log.error` to `.catch` as a bare method
      // reference would pass the `Error` into its `scope` parameter, which compiles and is wrong.
      matchAndFireTriggers(event, payload).catch((err) =>
        log.error("workflow-trigger", "handler failed", { err })
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
