import { crmBus } from "@/lib/events"
import type { CrmEventName, CrmEventPayload } from "@/lib/events/types"
import { db } from "@/db"
import { auditLog } from "@/db/schema"
import { getCurrentActor } from "@/lib/audit/actor-context"
import { buildChanges } from "@/lib/audit/diff"

/**
 * The twelve create/update/delete events across the four CRM entities.
 *
 * NOTE: "deal.stage_changed" is deliberately ABSENT, and its absence is a decision rather
 * than an oversight. It is emitted ALONGSIDE "deal.updated" at all four stage-change sites
 * (src/lib/mutations/deals.ts:406+428, 540+561, 664+684 and
 * src/app/api/v1/deals/[id]/route.ts:352+356), so subscribing to both would write two audit
 * rows for every single drag of a card between columns. The stage change is already recorded
 * by the co-emitted "deal.updated" diff (`stageId: { from, to }`) and, separately, by
 * `stage-history.ts`.
 */
export const AUDITED_EVENTS: CrmEventName[] = [
  "deal.created",
  "deal.updated",
  "deal.deleted",
  "person.created",
  "person.updated",
  "person.deleted",
  "organization.created",
  "organization.updated",
  "organization.deleted",
  "activity.created",
  "activity.updated",
  "activity.deleted",
]

let registered = false

/**
 * Persists one `audit_log` row per audited CRM event.
 *
 * This IS AUDIT-02: a single bus subscriber captures every `crmBus`-emitting write without a
 * line of audit code in any mutation function or API route — the same argument that
 * `stage-history.ts` makes for one event, made for twelve.
 */
export function registerAuditSubscriber(): void {
  if (registered) return

  for (const event of AUDITED_EVENTS) {
    crmBus.on(event, (payload: CrmEventPayload) => {
      // READ THE STORE SYNCHRONOUSLY, HERE, AT HANDLER ENTRY.
      //
      // `EventEmitter.emit` runs handlers inline in the emitter's own stack, so the ALS
      // context here is still the mutation's. Capturing it into a local BEFORE the insert
      // promise is created is what makes the fire-and-forget insert safe. Reading it inside
      // the promise continuation happens to work (probed on Node 20.20.2), but that depends
      // on ALS continuation semantics staying the same across Node upgrades; capturing first
      // is unconditionally correct and costs nothing.
      const actor = getCurrentActor()

      const changes = buildChanges(payload)

      // A save that changed nothing writes no row at all. Creates and deletes are exempt: a
      // create records the initial state and a delete records a tombstone, and an empty
      // change map is legitimate for both.
      if (payload.action === "updated" && Object.keys(changes).length === 0) return

      // Fire-and-forget: crmBus wraps a synchronous EventEmitter, so `emit` cannot await. The
      // handler must NOT be async and must NOT await the insert — an async handler returns a
      // floating promise with no `.catch`, which is an unhandled rejection and a silently
      // lost row. The `.catch` is mandatory, and it is also the accepted limitation: a
      // database failure loses the audit row and logs it to stderr, because the alternative
      // (awaiting inside the mutation) would make an audit failure break the user's write.
      db
        .insert(auditLog)
        .values({
          entityType: payload.entity,
          entityId: payload.entityId,
          action: payload.action,
          changes,
          // NEVER the event payload's own user id. That field describes the record being
          // written, not the identity that wrote it; borrowing it would stamp an unverified name
          // onto an audit row, which is worse than an honest "unknown" because it is
          // believed. Absence of an actor is recorded honestly as `system`.
          actorKind: actor?.kind ?? "system",
          actorUserId: actor?.userId ?? null,
          workflowRunId: actor?.workflowRunId ?? null,
          importSessionId: actor?.importSessionId ?? null,
        })
        .catch((err) => console.error("[audit]", err))
    })
  }

  registered = true
}

/**
 * Reset registration state for testing only.
 *
 * NOTE: this removes ALL listeners for each of the twelve audited events from the shared bus
 * singleton — including the webhook and workflow-trigger listeners for every one of them, not
 * just this subscriber's. The three existing `_resetForTesting` helpers behave the same way,
 * so the mechanism is consistent rather than novel, but the blast radius here is twelve times
 * the stage-history one: a test that resets this subscriber and then asserts on webhook
 * delivery or workflow triggering for ANY create/update/delete event will get a confusing
 * (silently empty) result rather than a failure that names the cause.
 */
export function _resetForTesting(): void {
  if (registered) {
    for (const event of AUDITED_EVENTS) {
      crmBus.removeAllListeners(event)
    }
  }
  registered = false
}
