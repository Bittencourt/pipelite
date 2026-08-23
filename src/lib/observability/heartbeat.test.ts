/**
 * OBS-03 — the worker heartbeat registry.
 *
 * This suite pins down four properties that are invisible in a code read, and it is explicit
 * about the one property it structurally CANNOT prove.
 *
 *   1. THE ROSTER IS THE RESPONSE. `snapshot()` iterates the hard-coded `EXPECTED_WORKERS`
 *      list, never the live map. A worker whose `register()` never ran must be reported
 *      `{alive:false, lastTickAt:null}` — PRESENT in the output and false — rather than absent
 *      from it. This is not stylistic: `Object.values({}).every(p => p.alive)` is `true`, so a
 *      response built from the map's own keys makes a totally dead `register()` read as healthy
 *      and the endpoint returns 200 on exactly the failure it exists to detect (amendment A1,
 *      RESEARCH Pitfall 4). The key-COUNT assertions below are the phase's central proof; a
 *      `processors` object with fewer than ten keys is the failure signature.
 *
 *   2. STALENESS IS PER-WORKER. The six processors' intervals span a factor of 17,280 — 5 s
 *      (`execution-processor`) to 24 h (`audit-prune`, `trash-prune`). A single global
 *      "stale after 5 minutes" rule reports the two daily pruners permanently dead on a
 *      perfectly healthy container, so the endpoint cries wolf from the moment it ships and
 *      then gets ignored, which is worse than not having it (RESEARCH Pitfall 3). The
 *      `audit-prune`-alive-after-24-hours case is what forbids that rule.
 *
 *   3. A SUBSCRIBER'S LIVENESS COMES FROM REGISTRATION. The four crmBus subscribers are
 *      event-driven and may legitimately never fire — a quiet CRM emits nothing. Deriving
 *      `alive` from `lastTickAt` would conflate IDLE with DEAD. `lastTickAt` is diagnostic
 *      only, and the assertions below fix that so a later "simplification" cannot merge the two.
 *
 *   4. `recordTick` NEVER THROWS. It is called from processor tick tails that deliberately sit
 *      outside the try/catch; a throw there would break the reschedule chain and kill the
 *      processor the heartbeat exists to watch.
 *
 * WHAT THIS SUITE DOES NOT PROVE — read before trusting the globalThis cases.
 *
 * The registry exists on `globalThis` because Next.js/Turbopack instantiates a shared module
 * once per module graph. `src/lib/events/bus.ts` exists as FOUR independent instances in this
 * repo's own build (module IDs `587400`, `117126`, `930245`, `947362`) — two of them inside the
 * graph of a single `register()` call. Vitest cannot reproduce that: it has a SINGLE module
 * registry, so `heartbeat.ts` is instantiated exactly once here no matter what this file
 * asserts. `src/lib/audit/actor-context.ts:38-39` says the same thing about the same hazard —
 * "every unit test passes because vitest has a single module registry" — and it says it because
 * the defect it describes shipped green.
 *
 * The globalThis cases below are therefore a PROXY. They prove the module uses the bridge and
 * uses the correctly namespaced key; they do NOT prove the bridge works across graphs. The real
 * verification is the running-container check in plan 18. Treat a green run here as "the
 * mechanism is present", never as "the mechanism works".
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  EXPECTED_WORKERS,
  registerProcessor,
  registerSubscriber,
  recordTick,
  snapshot,
  _resetForTesting,
} from "./heartbeat"
import * as heartbeatModule from "./heartbeat"

/** A fixed wall clock, so `registeredAt` is a known number and boundary math is exact. */
const BASE = Date.UTC(2026, 7, 22, 12, 0, 0)

const SECOND = 1_000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * The bridge, typed without `any`. Read through this rather than through the module so the
 * assertions are about the shared slot itself, not about the module's view of it.
 */
const bridge = globalThis as typeof globalThis & {
  __pipeliteHeartbeats?: Map<string, unknown>
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(BASE)
  _resetForTesting()
})

afterEach(() => {
  _resetForTesting()
  vi.useRealTimers()
})

describe("EXPECTED_WORKERS — the roster", () => {
  it("has exactly ten entries", () => {
    expect(EXPECTED_WORKERS).toHaveLength(10)
  })

  it("names the six processors then the four subscribers, in that order", () => {
    expect([...EXPECTED_WORKERS]).toEqual([
      "webhook-processor",
      "email-processor",
      "schedule-processor",
      "execution-processor",
      "audit-prune",
      "trash-prune",
      "webhook-subscriber",
      "workflow-trigger-subscriber",
      "stage-history-subscriber",
      "audit-subscriber",
    ])
  })
})

describe("snapshot() — roster completeness (amendment A1)", () => {
  it("returns exactly ten keys against a cleared registry, every one dead", () => {
    const report = snapshot(BASE)

    // The key COUNT is the assertion. Fewer than ten keys is the failure signature: the
    // route's `every()` would read the shortfall as health.
    expect(Object.keys(report)).toHaveLength(10)
    expect(Object.keys(report).sort()).toEqual([...EXPECTED_WORKERS].sort())
    for (const name of EXPECTED_WORKERS) {
      expect(report[name]).toEqual({ alive: false, lastTickAt: null })
    }
  })

  it("still returns ten keys when only one worker registered, with the other nine dead", () => {
    registerProcessor("webhook-processor", 60 * SECOND, 5 * SECOND)

    const report = snapshot(BASE)

    expect(Object.keys(report)).toHaveLength(10)
    expect(report["webhook-processor"].alive).toBe(true)
    const others = EXPECTED_WORKERS.filter((n) => n !== "webhook-processor")
    expect(others).toHaveLength(9)
    for (const name of others) {
      expect(report[name]).toEqual({ alive: false, lastTickAt: null })
    }
  })

  it("reports a never-registered worker as present-and-false, never as absent", () => {
    registerProcessor("execution-processor", 5 * SECOND, 5 * SECOND)

    const report = snapshot(BASE)

    expect("audit-prune" in report).toBe(true)
    expect(report["audit-prune"]).toEqual({ alive: false, lastTickAt: null })
  })
})

describe("processor staleness — per-worker, never global (Pitfall 3)", () => {
  it("execution-processor with no tick yet is alive inside its first-tick budget and dead past it", () => {
    // firstTickBudget = initialDelay 5 s + interval 5 s + 60 s slack = 70 s.
    registerProcessor("execution-processor", 5 * SECOND, 5 * SECOND)

    expect(snapshot(BASE + 70 * SECOND)["execution-processor"].alive).toBe(true)
    expect(snapshot(BASE + 70 * SECOND + 1)["execution-processor"].alive).toBe(false)
  })

  it("execution-processor that has ticked is alive at +60 s and dead at +71 s", () => {
    // staleAfter = 2 x 5 s + 60 s = 70 s.
    registerProcessor("execution-processor", 5 * SECOND, 5 * SECOND)
    recordTick("execution-processor")

    expect(snapshot(BASE + 60 * SECOND)["execution-processor"].alive).toBe(true)
    expect(snapshot(BASE + 71 * SECOND)["execution-processor"].alive).toBe(false)
  })

  it("audit-prune is STILL ALIVE twenty-four hours after its tick", () => {
    // This is the case a global "stale after 5 minutes" rule gets catastrophically wrong: the
    // daily pruners would read dead forever on a healthy container. staleAfter = 48 h + 60 s.
    registerProcessor("audit-prune", 24 * HOUR, 60 * SECOND)
    recordTick("audit-prune")

    expect(snapshot(BASE + 24 * HOUR)["audit-prune"].alive).toBe(true)
    expect(snapshot(BASE + 5 * MINUTE)["audit-prune"].alive).toBe(true)
    expect(snapshot(BASE + 47 * HOUR)["audit-prune"].alive).toBe(true)
  })

  it("audit-prune is dead past 48 h + 60 s", () => {
    registerProcessor("audit-prune", 24 * HOUR, 60 * SECOND)
    recordTick("audit-prune")

    expect(snapshot(BASE + 48 * HOUR + 60 * SECOND)["audit-prune"].alive).toBe(true)
    expect(snapshot(BASE + 48 * HOUR + 60 * SECOND + 1)["audit-prune"].alive).toBe(false)
  })

  it("trash-prune, the other daily worker, survives 24 hours the same way", () => {
    registerProcessor("trash-prune", 24 * HOUR, 60 * SECOND)
    recordTick("trash-prune")

    expect(snapshot(BASE + DAY)["trash-prune"].alive).toBe(true)
  })

  it("keeps two workers on different cadences independent of one another", () => {
    // The proof that staleness is read per-worker rather than from one shared threshold: at
    // the same instant the 5-second worker is dead and the daily worker is alive.
    registerProcessor("execution-processor", 5 * SECOND, 5 * SECOND)
    registerProcessor("audit-prune", 24 * HOUR, 60 * SECOND)
    recordTick("execution-processor")
    recordTick("audit-prune")

    const report = snapshot(BASE + 6 * HOUR)

    expect(report["execution-processor"].alive).toBe(false)
    expect(report["audit-prune"].alive).toBe(true)
  })

  it("advances the tick clock so lastTickAt tracks the real tick, not registration", async () => {
    registerProcessor("schedule-processor", 30 * SECOND, 10 * SECOND)
    expect(snapshot(BASE)["schedule-processor"].lastTickAt).toBeNull()

    await vi.advanceTimersByTimeAsync(40 * SECOND)
    recordTick("schedule-processor")

    expect(snapshot(BASE + 40 * SECOND)["schedule-processor"].lastTickAt).toBe(
      new Date(BASE + 40 * SECOND).toISOString(),
    )
    // Alive window is measured from the TICK (staleAfter = 2 x 30 s + 60 s = 120 s), so a
    // worker that registered 40 s ago and ticked just now is alive well past its first budget.
    expect(snapshot(BASE + 40 * SECOND + 120 * SECOND)["schedule-processor"].alive).toBe(true)
    expect(snapshot(BASE + 40 * SECOND + 121 * SECOND)["schedule-processor"].alive).toBe(false)
  })
})

describe("recordTick() — never throws, never invents a worker (T-42-11)", () => {
  it("is a no-op for a name that was never registered", () => {
    expect(() => recordTick("audit-prune")).not.toThrow()

    expect(snapshot(BASE)["audit-prune"]).toEqual({ alive: false, lastTickAt: null })
  })

  it("does not create an entry for an unknown name", () => {
    expect(() => recordTick("not-a-real-worker")).not.toThrow()

    expect(bridge.__pipeliteHeartbeats?.has("not-a-real-worker")).toBe(false)
    expect(Object.keys(snapshot(BASE))).toHaveLength(10)
    expect("not-a-real-worker" in snapshot(BASE)).toBe(false)
  })
})

describe("subscriber liveness — registration, not lastTickAt", () => {
  it("is alive thirty days after registration with no event ever handled", () => {
    // A subscriber is event-driven and may legitimately never fire. Registration IS the
    // liveness claim; absence of events is not failure.
    registerSubscriber("audit-subscriber")

    const report = snapshot(BASE + 30 * DAY)

    expect(report["audit-subscriber"].alive).toBe(true)
    expect(report["audit-subscriber"].lastTickAt).toBeNull()
  })

  it("reports a null lastTickAt as alive:true — idle is not dead", () => {
    registerSubscriber("webhook-subscriber")

    const report = snapshot(BASE)

    expect(report["webhook-subscriber"]).toEqual({ alive: true, lastTickAt: null })
  })

  it("emits lastTickAt as an ISO string once the handler has fired, still alive:true", () => {
    registerSubscriber("stage-history-subscriber")
    recordTick("stage-history-subscriber")

    const report = snapshot(BASE + 30 * DAY)

    expect(report["stage-history-subscriber"].lastTickAt).toBe(new Date(BASE).toISOString())
    expect(report["stage-history-subscriber"].alive).toBe(true)
  })

  it("does not let a stale lastTickAt drag a subscriber to dead", () => {
    // The sharp inversion of the processor rule: for `workflow-trigger-subscriber` a tick that
    // is a year old must NOT flip alive to false, or the endpoint reports every quiet CRM as
    // broken.
    registerSubscriber("workflow-trigger-subscriber")
    recordTick("workflow-trigger-subscriber")

    expect(snapshot(BASE + 365 * DAY)["workflow-trigger-subscriber"].alive).toBe(true)
  })
})

describe("the globalThis bridge — a PROXY for the module-graph split, not proof of it", () => {
  /**
   * Reminder, because a green result here is easy to over-read: vitest has ONE module registry,
   * so these cases cannot reproduce the four-instance Turbopack split they stand in for. They
   * assert the mechanism is present and the key is right. Plan 18's container check is the
   * actual verification.
   */
  it("stores registrations on globalThis.__pipeliteHeartbeats", () => {
    registerProcessor("email-processor", 300 * SECOND, 15 * SECOND)

    expect(bridge.__pipeliteHeartbeats).toBeInstanceOf(Map)
    expect(bridge.__pipeliteHeartbeats?.has("email-processor")).toBe(true)
  })

  it("uses the NAMESPACED key, not a bare one", () => {
    // Both existing precedents use bare keys (`crmBus` in src/lib/events/bus.ts:25,
    // `auditActorStorage` in src/lib/audit/actor-context.ts:47). A reviewer may well try to
    // make this one match. The namespacing is deliberate; this assertion is the tripwire.
    expect(Object.prototype.hasOwnProperty.call(globalThis, "__pipeliteHeartbeats")).toBe(true)

    for (const bareKey of ["heartbeats", "workers", "pipeliteHeartbeats"]) {
      expect(Object.prototype.hasOwnProperty.call(globalThis, bareKey)).toBe(false)
    }
  })

  it("lets an independently captured reference to the slot see writes made through the verbs", () => {
    // Stands in for a second module instance reading the registry the first one wrote.
    const captured = bridge.__pipeliteHeartbeats
    expect(captured).toBeInstanceOf(Map)

    registerProcessor("webhook-processor", 60 * SECOND, 5 * SECOND)
    recordTick("webhook-processor")

    expect(captured?.has("webhook-processor")).toBe(true)
  })

  it("keeps the same slot identity across _resetForTesting, so the bridge is cleared not replaced", () => {
    const before = bridge.__pipeliteHeartbeats
    _resetForTesting()

    expect(bridge.__pipeliteHeartbeats).toBe(before)
    expect(bridge.__pipeliteHeartbeats?.size).toBe(0)
  })
})

describe("the registry map is never exported (T-42-13)", () => {
  it("exports no Map, so no caller can iterate or mutate the registry directly", () => {
    // Exporting the map is what invites a caller to build the health response from its keys,
    // which IS the amendment A1 vacuous-truth bug. `src/lib/events/bus.ts` exports its
    // singleton; this module deliberately does not.
    const exportedMaps = Object.entries(heartbeatModule).filter(
      ([, value]) => value instanceof Map,
    )

    expect(exportedMaps).toEqual([])
    expect(heartbeatModule).not.toHaveProperty("workers")
  })

  it("returns a fresh plain object from snapshot(), not a reference into the registry", () => {
    registerProcessor("webhook-processor", 60 * SECOND, 5 * SECOND)

    const first = snapshot(BASE)
    first["webhook-processor"].alive = false

    expect(snapshot(BASE)["webhook-processor"].alive).toBe(true)
    expect(snapshot(BASE)).not.toBe(first)
  })
})

describe("_resetForTesting()", () => {
  it("empties the registry, returning snapshot() to the all-dead ten-key object", () => {
    registerProcessor("webhook-processor", 60 * SECOND, 5 * SECOND)
    registerSubscriber("audit-subscriber")
    expect(snapshot(BASE)["webhook-processor"].alive).toBe(true)

    _resetForTesting()

    const report = snapshot(BASE)
    expect(Object.keys(report)).toHaveLength(10)
    for (const name of EXPECTED_WORKERS) {
      expect(report[name]).toEqual({ alive: false, lastTickAt: null })
    }
  })
})
