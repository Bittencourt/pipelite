import { crmBus } from "@/lib/events"
import type { DealStageChangedPayload } from "@/lib/events/types"
import { db } from "@/db"
import { dealStageHistory } from "@/db/schema"
import { recordTick, registerSubscriber } from "@/lib/observability/heartbeat"

// PER-INSTANCE AND UNREADABLE FROM ANYWHERE ELSE. Module-scoped, and this module is duplicated once
// per Turbopack module graph, so `/api/health` would read its own always-`false` copy. It exists only
// to stop a repeat call attaching a second listener. The health route reads the `globalThis`
// heartbeat registry instead; do not "simplify" it to consult this.
let registered = false

/**
 * Persists one `deal_stage_history` row per `deal.stage_changed` event.
 *
 * A single bus subscriber captures all four emit sites (three in
 * `src/lib/mutations/deals.ts`, one in `src/app/api/v1/deals/[id]/route.ts`) without any of
 * them being modified — that is the entire argument for the bus over an inline insert.
 */
export function registerStageHistorySubscriber(): void {
  if (registered) return

  // OBS-03. Registration IS this subscriber's liveness claim: it says this function executed in
  // THIS process. It says nothing about a card ever moving between columns, and it must not — a
  // pipeline nobody touched this week is quiet, not broken.
  registerSubscriber("stage-history-subscriber")

  crmBus.on("deal.stage_changed", (payload: DealStageChangedPayload) => {
    // Handler entry, before anything that could return. Diagnostic only: `alive` never derives from
    // it. `recordTick` never throws, so it cannot break the insert below.
    recordTick("stage-history-subscriber")

    // Fire-and-forget: crmBus wraps a synchronous EventEmitter, so `emit` cannot await. The
    // handler must NOT be async and must NOT await the insert. The `.catch` is mandatory —
    // without it a rejection becomes an unhandled promise and the row is lost with no trace.
    db
      .insert(dealStageHistory)
      .values({
        dealId: payload.entityId,
        fromStageId: payload.oldStageId ?? null,
        toStageId: payload.newStageId,
        changedBy: payload.userId ?? null,
      })
      .catch((err) => console.error("[stage-history]", err))
  })

  registered = true
}

/**
 * Reset registration state for testing only.
 *
 * NOTE: this removes ALL `deal.stage_changed` listeners from the shared bus singleton,
 * including the webhook and workflow-trigger ones. The two existing `_resetForTesting`
 * helpers behave the same way.
 */
export function _resetForTesting(): void {
  if (registered) {
    crmBus.removeAllListeners("deal.stage_changed")
  }
  registered = false
}
