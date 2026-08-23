/**
 * OBS-03 — whether the ten background workers are actually running in THIS process.
 *
 * This module is deliberately dependency-free: it imports nothing at all, not even from the Node
 * runtime. It is pulled into three separate module graphs — the `instrumentation.ts` graph that
 * starts the six processors and attaches the four subscribers, the route/server-action graph that
 * serves `/api/health`, and the RSC render graph — so any import added here is pulled into every
 * one of them, and in particular would drag `db`, `fetch` and `zod` into the health route's
 * bundle. That is why the processors PASS their interval constants in rather than this file
 * importing them. Keep it that way.
 *
 * ── The failure this exists to catch ─────────────────────────────────────────────────────────
 *
 * On 2026-08-08 a `RUN cp … 2>/dev/null || true` in `Dockerfile:24` failed silently: shell
 * precedence made the whole step succeed unconditionally, `instrumentation.js` was absent from
 * the standalone output, and ALL FOUR processors never started in production. Nothing logged,
 * nothing alerted, and every single test passed — there was no signal anywhere that distinguished
 * "the workers are running" from "the workers do not exist". This registry is that signal.
 *
 * On 2026-08-16 a related defect: every audit row was written with `actor_kind = system` and a
 * null user, including a deal created by a logged-in user in the browser, because
 * `src/lib/audit/actor-context.ts` was instantiated twice — the writer stored the actor on one
 * AsyncLocalStorage and the reader called `getStore()` on a different one. Read that file's
 * header; it is the same hazard as the one below, and it shipped green.
 *
 * Both defects passed the entire test suite. Vitest has a SINGLE module registry, so it cannot
 * reproduce either the missing-instrumentation case or the split-module case. `heartbeat.test.ts`
 * says so in its own header and labels its `globalThis` assertions a PROXY. The real verification
 * of this module is a check against the running container.
 *
 * ── Why the registry lives on globalThis (mandatory, not stylistic) ──────────────────────────
 *
 * Turbopack instantiates a shared module once per module GRAPH and its runtime cache cannot dedupe
 * them, because the cache is keyed by module ID. Module IDs extracted from this repo's own
 * `.next/` output show `src/lib/events/bus.ts` existing as FOUR independent instances physically
 * duplicated across nine chunk files: `587400` (instrumentation graph), `117126` (the
 * execution-processor's sub-chunk OF THAT SAME GRAPH), `930245` (route + server-action graph) and
 * `947362` (SSR/RSC graph).
 *
 * Two consequences. First, a plain module-level `const workers = new Map()` would be duplicated
 * even between two processors started by the same `register()` call — `117126` and `587400` are
 * both inside it. Second, there are three graphs to bridge, not two; a route handler shares a
 * graph with server actions, but the RSC render graph is separate. `globalThis` is the only slot
 * all of them share.
 *
 * THE KEY IS NAMESPACED ON PURPOSE. The two existing precedents use bare keys — `crmBus`
 * (`src/lib/events/bus.ts:25`) and `auditActorStorage` (`src/lib/audit/actor-context.ts:47`) — and
 * a reviewer may reasonably try to make this one match them. Do not. `__pipeliteHeartbeats`
 * cannot collide with a dependency's or a future Next internal's global, and `heartbeat.test.ts`
 * asserts the literal key string to stop the change from landing quietly.
 *
 * Dev-mode caveat: `next dev` forks render workers, so `globalThis` would NOT bridge them. It does
 * not matter here — this project is Docker-only, and the standalone container is a single process
 * (PID 1 is `next-server`, and `server.js` uses neither `cluster` nor `fork`). One process, one
 * `globalThis`.
 *
 * ── What a subscriber's `alive` proves, and what it cannot ───────────────────────────────────
 *
 * It proves `registerXSubscriber()` EXECUTED IN THIS PROCESS — which is the whole 2026-08-08
 * failure class, and today the only evidence of it, since the four subscribers emit no boot log at
 * all. It does NOT prove the handler will ever be invoked: a subscriber is event-driven and a
 * quiet CRM emits nothing, so `lastTickAt` is reported as DIAGNOSTIC and never feeds `alive`.
 * Deriving a subscriber's `alive` from `lastTickAt` would report idle as dead.
 *
 * The diagnostic is sharp, though: `alive: true` with `lastTickAt` still `null` AFTER known CRM
 * writes is the fingerprint of a module-graph split — the subscriber attached to a different
 * `crmBus` instance than the emitters use. That is exactly the 2026-08-16 defect, and this is how
 * you would now see it.
 */

export type WorkerKind = "processor" | "subscriber"

interface WorkerState {
  kind: WorkerKind
  /** ms between ticks. `null` for event-driven subscribers, which have no cadence. */
  expectedIntervalMs: number | null
  /** ms allowed to elapse before the FIRST tick. `null` for subscribers. */
  firstTickBudgetMs: number | null
  registeredAt: number
  lastTickAt: number | null
}

/**
 * THE EXPECTED ROSTER. This is the load-bearing constant of OBS-03.
 *
 * `snapshot()` iterates THIS list and never the live map. A worker whose `register()` never ran is
 * therefore reported `{ alive: false, lastTickAt: null }` — present in the JSON and false — rather
 * than silently absent from it.
 *
 * That is not a stylistic preference. `Object.values({}).every(p => p.alive)` is **`true`**, so a
 * response built from the map's own keys makes a totally dead `register()` serialize as
 * `processors: {}` and the endpoint returns **200 ok on precisely the failure it exists to
 * detect** — vacuous truth on an empty collection. A `processors` object with fewer than ten keys
 * is the failure signature, which is why `heartbeat.test.ts` asserts the KEY COUNT rather than
 * only the values.
 *
 * Immutable data, so duplication across module graphs is harmless — this constant, unlike the map
 * below, does not need the `globalThis` bridge.
 */
export const EXPECTED_WORKERS = [
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
] as const

// Singleton — must survive across module boundaries in all environments. See the header: this is
// not defensive boilerplate, it is the difference between a working health check and one that
// reports a live container as dead because the reader holds a different Map than the writer.
//
// Deliberately NOT exported. `src/lib/events/bus.ts` exports its singleton; this module exports
// only verbs, following `src/lib/audit/actor-context.ts`. An exported `Map` is what invites a
// caller to build the health response by iterating it, which IS the vacuous-truth bug described on
// `EXPECTED_WORKERS` above. `snapshot()` is the only read path.
const g = globalThis as typeof globalThis & {
  __pipeliteHeartbeats?: Map<string, WorkerState>
}
const workers = g.__pipeliteHeartbeats ?? new Map<string, WorkerState>()
g.__pipeliteHeartbeats = workers

/**
 * Declare a polling worker, at the point its timer chain starts.
 *
 * Pass the SAME constants the worker's own timer uses — e.g.
 * `registerProcessor("audit-prune", TICK_INTERVAL, INITIAL_DELAY)` — so the health check's
 * expectation cannot drift from the real cadence. The six intervals span a factor of 17,280
 * (5 s for `execution-processor`, 24 h for the two pruners), which is why there is no global
 * staleness threshold anywhere in this file: one would report the daily pruners permanently dead
 * on a perfectly healthy container.
 */
export function registerProcessor(
  name: string,
  expectedIntervalMs: number,
  initialDelayMs: number,
): void {
  workers.set(name, {
    kind: "processor",
    expectedIntervalMs,
    // The first tick must arrive within its own delay, plus one whole interval, plus a minute of
    // slack for a slow boot. Until then the worker is alive on the strength of having registered.
    firstTickBudgetMs: initialDelayMs + expectedIntervalMs + 60_000,
    registeredAt: Date.now(),
    lastTickAt: null,
  })
}

/**
 * Declare an event-driven subscriber, at the point it attaches to `crmBus`.
 *
 * No cadence: registration IS the liveness claim. See the header for what that proves and what it
 * deliberately does not.
 */
export function registerSubscriber(name: string): void {
  workers.set(name, {
    kind: "subscriber",
    expectedIntervalMs: null,
    firstTickBudgetMs: null,
    registeredAt: Date.now(),
    lastTickAt: null,
  })
}

/**
 * Record that a worker ran: on tick COMPLETION for processors, on handler ENTRY for subscribers.
 *
 * A no-op for an unknown name, and it NEVER throws (T-42-11). Processors call this from the tick
 * tail, which several of them keep deliberately OUTSIDE their try/catch so that a tick which
 * errored still counts as having run — liveness is "the tick body completed", not "the tick
 * succeeded"; a processor whose every tick throws is alive and broken, and the log stream reports
 * the breakage. A throw from here would break the reschedule chain and kill the very processor
 * this registry exists to watch.
 */
export function recordTick(name: string): void {
  const w = workers.get(name)
  if (w) w.lastTickAt = Date.now()
}

export interface WorkerReport {
  alive: boolean
  lastTickAt: string | null
}

/**
 * Build the health report: exactly `EXPECTED_WORKERS.length` entries, always, whatever the
 * registry happens to contain.
 *
 * Returns a freshly built plain object rather than any reference into the registry, so a caller
 * cannot flip a worker to alive (T-42-13). The report carries exactly two fields — no interval, no
 * `registeredAt`, no error text, no counts — because it is serialized into an UNAUTHENTICATED
 * response body (T-42-14).
 *
 * `now` is a parameter so the staleness math is testable without timer control.
 */
export function snapshot(now = Date.now()): Record<string, WorkerReport> {
  const out: Record<string, WorkerReport> = {}
  for (const name of EXPECTED_WORKERS) {
    const w = workers.get(name)
    if (!w) {
      // Never registered — present and false, never absent. This branch is the whole point.
      out[name] = { alive: false, lastTickAt: null }
      continue
    }
    let alive: boolean
    if (w.kind === "subscriber") {
      alive = true
    } else if (w.lastTickAt === null) {
      alive = now - w.registeredAt <= w.firstTickBudgetMs!
    } else {
      // Per-worker, from the interval the worker's own timer uses: two missed ticks plus a minute.
      alive = now - w.lastTickAt <= w.expectedIntervalMs! * 2 + 60_000
    }
    out[name] = {
      alive,
      lastTickAt: w.lastTickAt === null ? null : new Date(w.lastTickAt).toISOString(),
    }
  }
  return out
}

/**
 * Test-only. Mirrors the `_resetForTesting` convention of the four `crmBus` subscribers.
 *
 * Clears the map in place rather than replacing it, so any reference already handed out through
 * the `globalThis` slot stays valid.
 */
export function _resetForTesting(): void {
  workers.clear()
}
