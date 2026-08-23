// AUDIT-02 subscriber coverage. Mirrors stage-history.test.ts case for case.
//
// CAVEAT: `_resetForTesting()` here calls `crmBus.removeAllListeners(event)` for all TWELVE
// audited events, which ALSO detaches the webhook and workflow-trigger listeners for every one
// of them — the bus is a globalThis-pinned singleton shared across every subscriber module.
// The three existing `_resetForTesting` helpers behave identically, so this is consistent
// rather than novel, but the blast radius is twelve times the stage-history one: a test that
// resets this subscriber and then asserts on webhook delivery or workflow triggering for ANY
// create/update/delete event will get a confusing (silently empty) result.
import { describe, it, expect, vi, beforeEach } from "vitest"
import { crmBus } from "../bus"
import type { CrmEventPayload, DealStageChangedPayload } from "../types"

// Mock @/db BEFORE importing the subscriber (vi.mock factories are hoisted above imports).
// NOTE: `@/lib/audit/actor-context` is deliberately NOT mocked — the ALS behaviour under test
// IS the thing that must be proven, and a mocked store would prove nothing about it.
vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(),
  },
}))

import { registerAuditSubscriber, _resetForTesting, AUDITED_EVENTS } from "./audit"
import { db } from "@/db"
import { auditLog } from "@/db/schema"
import { runWithActor } from "@/lib/audit/actor-context"
import { snapshot, _resetForTesting as _resetHeartbeat } from "@/lib/observability/heartbeat"

const mockDb = db as unknown as { insert: ReturnType<typeof vi.fn> }

/** Wire `db.insert(...).values(...)` to a thenable so the subscriber's `.catch` has something to attach to. */
function stubInsert(result: Promise<unknown> = Promise.resolve(undefined)) {
  const valuesFn = vi.fn().mockReturnValue(result)
  mockDb.insert.mockReturnValue({ values: valuesFn })
  return valuesFn
}

function dealPayload(overrides: Partial<CrmEventPayload> = {}): CrmEventPayload {
  return {
    entity: "deal",
    entityId: "deal-1",
    action: "updated",
    previous: { title: "Old title", value: "100" },
    data: { title: "New title", value: "100" },
    changedFields: ["title"],
    userId: "user-1",
    timestamp: "2026-08-15T12:00:00Z",
    ...overrides,
  }
}

function stagePayload(overrides: Partial<DealStageChangedPayload> = {}): DealStageChangedPayload {
  return {
    ...dealPayload(),
    entity: "deal",
    oldStageId: "stage-a",
    newStageId: "stage-b",
    previous: { stageId: "stage-a" },
    data: { stageId: "stage-b" },
    changedFields: ["stageId"],
    ...overrides,
  }
}

/** Let the fire-and-forget insert's promise callbacks run. */
const flush = () => new Promise((resolve) => setImmediate(resolve))

describe("registerAuditSubscriber", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetForTesting()
  })

  it("inserts one audit_log row on deal.updated", () => {
    const valuesFn = stubInsert()
    registerAuditSubscriber()

    crmBus.emit("deal.updated", dealPayload())

    expect(mockDb.insert).toHaveBeenCalledOnce()
    expect(mockDb.insert).toHaveBeenCalledWith(auditLog)
    expect(valuesFn).toHaveBeenCalledOnce()

    const row = valuesFn.mock.calls[0][0]
    expect(row.entityType).toBe("deal")
    expect(row.entityId).toBe("deal-1")
    expect(row.action).toBe("updated")
    expect(Object.keys(row.changes)).toEqual(["title"])
    expect(row.changes.title).toEqual({ from: "Old title", to: "New title" })
  })

  it("attaches a listener for every one of the twelve audited events", () => {
    stubInsert()
    registerAuditSubscriber()

    expect(AUDITED_EVENTS).toHaveLength(12)
    expect(AUDITED_EVENTS).not.toContain("deal.stage_changed")

    for (const event of AUDITED_EVENTS) {
      const entity = event.split(".")[0] as CrmEventPayload["entity"]
      crmBus.emit(event, dealPayload({ entity, action: "created", previous: undefined }))
    }

    expect(mockDb.insert).toHaveBeenCalledTimes(12)
  })

  it("does not double-register on repeated calls", () => {
    stubInsert()
    registerAuditSubscriber()
    registerAuditSubscriber()

    crmBus.emit("deal.updated", dealPayload())

    expect(mockDb.insert).toHaveBeenCalledOnce()
  })

  it("stops capturing after _resetForTesting removes the listeners", () => {
    stubInsert()
    registerAuditSubscriber()
    _resetForTesting()

    crmBus.emit("deal.updated", dealPayload())

    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("writes no row at all for a no-op update", () => {
    stubInsert()
    registerAuditSubscriber()

    const identical = { title: "Same title", value: "100" }
    crmBus.emit(
      "deal.updated",
      dealPayload({ previous: { ...identical }, data: { ...identical }, changedFields: [] })
    )

    // Not "inserted an empty row" — did not touch the database at all.
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("still inserts a create whose change map is empty", () => {
    const valuesFn = stubInsert()
    registerAuditSubscriber()

    crmBus.emit(
      "deal.created",
      dealPayload({ action: "created", previous: undefined, data: {}, changedFields: null })
    )

    expect(mockDb.insert).toHaveBeenCalledOnce()
    const row = valuesFn.mock.calls[0][0]
    expect(row.action).toBe("created")
    expect(row.changes).toEqual({})
  })

  it("still inserts a delete whose change map is empty", () => {
    const valuesFn = stubInsert()
    registerAuditSubscriber()

    // A delete emits `data === { id }` at all seven delete sites; with no `previous` state the
    // tombstone carries no fields — but the row itself must exist, or "who deleted this" has
    // no answer.
    crmBus.emit(
      "deal.deleted",
      dealPayload({ action: "deleted", previous: {}, data: { id: "deal-1" }, changedFields: null })
    )

    expect(mockDb.insert).toHaveBeenCalledOnce()
    const row = valuesFn.mock.calls[0][0]
    expect(row.action).toBe("deleted")
    expect(row.changes).toEqual({})
  })

  it("records the ALS actor kind and user id", () => {
    const valuesFn = stubInsert()
    registerAuditSubscriber()

    runWithActor({ kind: "api_key", userId: "u9" }, () => {
      crmBus.emit("deal.updated", dealPayload())
    })

    const row = valuesFn.mock.calls[0][0]
    expect(row.actorKind).toBe("api_key")
    expect(row.actorUserId).toBe("u9")
  })

  it("records system with a null user id when no actor context exists", () => {
    const valuesFn = stubInsert()
    registerAuditSubscriber()

    // ATTRIBUTION LAUNDERING. `payload.userId` describes the record's owner, not the identity
    // that performed the write. Borrowing it would stamp a plausible but unverified name onto
    // an audit row — worse than an honest "unknown", because it is believed.
    crmBus.emit("deal.updated", dealPayload({ userId: "victim-user" }))

    const row = valuesFn.mock.calls[0][0]
    expect(row.actorKind).toBe("system")
    expect(row.actorUserId).toBeNull()
    expect(JSON.stringify(row)).not.toContain("victim-user")
  })

  it("carries the workflowRunId from the actor", () => {
    const valuesFn = stubInsert()
    registerAuditSubscriber()

    runWithActor({ kind: "workflow_run", userId: null, workflowRunId: "run-7" }, () => {
      crmBus.emit("deal.updated", dealPayload())
    })

    const row = valuesFn.mock.calls[0][0]
    expect(row.actorKind).toBe("workflow_run")
    expect(row.actorUserId).toBeNull()
    expect(row.workflowRunId).toBe("run-7")
    expect(row.importSessionId).toBeNull()
  })

  it("carries the importSessionId from the actor", () => {
    const valuesFn = stubInsert()
    registerAuditSubscriber()

    runWithActor({ kind: "import", userId: "u3", importSessionId: "sess-4" }, () => {
      crmBus.emit("person.updated", dealPayload({ entity: "person", entityId: "person-1" }))
    })

    const row = valuesFn.mock.calls[0][0]
    expect(row.entityType).toBe("person")
    expect(row.actorKind).toBe("import")
    expect(row.importSessionId).toBe("sess-4")
    expect(row.workflowRunId).toBeNull()
  })

  it("nulls workflowRunId and importSessionId when the actor carries neither", () => {
    const valuesFn = stubInsert()
    registerAuditSubscriber()

    runWithActor({ kind: "user", userId: "u1" }, () => {
      crmBus.emit("organization.updated", dealPayload({ entity: "organization", entityId: "org-1" }))
    })

    const row = valuesFn.mock.calls[0][0]
    expect(row.workflowRunId).toBeNull()
    expect(row.workflowRunId).not.toBeUndefined()
    expect(row.importSessionId).toBeNull()
    expect(row.importSessionId).not.toBeUndefined()
  })

  it("writes nothing for a lone deal.stage_changed event", () => {
    stubInsert()
    registerAuditSubscriber()

    crmBus.emit("deal.stage_changed", stagePayload())

    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("writes exactly one row when deal.stage_changed and deal.updated are co-emitted", () => {
    stubInsert()
    registerAuditSubscriber()

    // What all four real stage-change sites do (deals.ts:406+428, 540+561, 664+684 and
    // v1/deals/[id]:352+356): both events for one drag. Subscribing to both would double-write.
    crmBus.emit("deal.stage_changed", stagePayload())
    crmBus.emit("deal.updated", dealPayload({ previous: { stageId: "stage-a" }, data: { stageId: "stage-b" } }))

    expect(mockDb.insert).toHaveBeenCalledOnce()
  })

  it("is fire-and-forget: a rejected insert logs and never becomes an unhandled rejection", async () => {
    const boom = new Error("insert exploded")
    stubInsert(Promise.reject(boom))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on("unhandledRejection", onUnhandled)

    try {
      registerAuditSubscriber()

      // emit() is synchronous — it must not throw even though the insert rejects. This is the
      // assertion that proves a database failure cannot break a user's write.
      expect(() => crmBus.emit("deal.updated", dealPayload())).not.toThrow()

      await flush()

      expect(errorSpy).toHaveBeenCalledWith("[audit]", boom)
      expect(unhandled).toHaveLength(0)
    } finally {
      process.off("unhandledRejection", onUnhandled)
      errorSpy.mockRestore()
    }
  })
})

// ── OBS-03 heartbeat wiring ──────────────────────────────────────────────────────────────────
//
// A subscriber's `alive` derives from REGISTRATION, never from `lastTickAt`. An event-driven
// subscriber on a quiet CRM legitimately never fires, so reporting idle as dead would make
// `/api/health` noise that gets ignored — which is worse than not having it.
//
// `lastTickAt` is a DIAGNOSTIC only, and a sharp one: registered with `lastTickAt` still null
// AFTER known CRM writes is the fingerprint of a module-graph split — the subscriber attached to a
// different `crmBus` instance than the emitters use. That is exactly the 2026-08-16 defect where
// every audit row was written with `actor_kind = system`.
//
// CAVEAT — these assertions are a PROXY. Vitest has a single module registry and structurally
// cannot reproduce the four-instance Turbopack split, so they prove the registry works within ONE
// module graph and nothing about the bridge between graphs. The container check against
// `/api/health` is the only real verification, exactly as `heartbeat.test.ts` says of its own
// `globalThis` assertions.
describe("registerAuditSubscriber heartbeat wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetForTesting()
    _resetHeartbeat()
  })

  it("registers audit-subscriber in the heartbeat registry", () => {
    // Present-and-false before registration, never absent — that is `EXPECTED_WORKERS` doing its
    // job, and it is what makes a dead `register()` visible instead of vacuously healthy.
    expect(snapshot()["audit-subscriber"]).toEqual({ alive: false, lastTickAt: null })

    registerAuditSubscriber()

    expect(snapshot()["audit-subscriber"]).toEqual({ alive: true, lastTickAt: null })
  })

  it("is still alive a year later with lastTickAt null, because registration is the claim", () => {
    registerAuditSubscriber()

    const inAYear = Date.now() + 365 * 24 * 60 * 60 * 1000
    expect(snapshot(inAYear)["audit-subscriber"]).toEqual({ alive: true, lastTickAt: null })
  })

  it("advances lastTickAt to an ISO string when the handler runs", () => {
    stubInsert()
    registerAuditSubscriber()

    crmBus.emit("deal.updated", dealPayload())

    const report = snapshot()["audit-subscriber"]
    expect(report.alive).toBe(true)
    expect(report.lastTickAt).not.toBeNull()
    expect(new Date(report.lastTickAt!).toISOString()).toBe(report.lastTickAt)
  })

  it("advances lastTickAt on a no-op update that writes no row at all", () => {
    stubInsert()
    registerAuditSubscriber()

    const identical = { title: "Same title", value: "100" }
    crmBus.emit(
      "deal.updated",
      dealPayload({ previous: { ...identical }, data: { ...identical }, changedFields: [] })
    )

    // `recordTick` belongs at handler ENTRY, above the empty-change-set early return. A save that
    // changed nothing is a handler that FIRED — the bus reached it — so it must count as a tick.
    // Placing the call after the return would make a quiet-but-attached subscriber indistinguishable
    // from a detached one, which is the whole diagnostic this field exists for.
    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(snapshot()["audit-subscriber"].lastTickAt).not.toBeNull()
  })
})
