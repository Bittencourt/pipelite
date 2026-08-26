import { crmBus } from "@/lib/events"
import type { CrmEventName, CrmEventPayload } from "@/lib/events/types"
import { matchAndFireTriggers } from "@/lib/triggers/matcher"
import { recordTick, registerSubscriber } from "@/lib/observability/heartbeat"
import { log } from "@/lib/log"

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
