/**
 * OBS-03 — `GET /api/health`, the endpoint whose entire job is to answer a question no log line
 * can: is THIS process's `register()` actually alive right now.
 *
 * WHAT THIS SUITE PROVES
 *
 *   1. THE ROSTER IS THE RESPONSE (amendment A1, RESEARCH Pitfall 4). With the registry cleared,
 *      the endpoint must return 503 with all ten workers PRESENT and `alive:false`. This is the
 *      phase's central assertion. A route that built `processors` by iterating the live registry
 *      instead of calling `snapshot()` would serialize a totally dead `register()` as
 *      `processors: {}`, and `Object.values({}).every(p => p.alive)` is `true` — so it would
 *      answer 200 ok on precisely the 2026-08-08 failure the endpoint exists to detect. The
 *      key-COUNT assertion is load-bearing: a `processors` object with fewer than ten keys is the
 *      failure signature, and asserting only "some worker is dead" would not catch it.
 *   2. THE DB PROBE IS BOUNDED AND LEAKS NO TIMER. A hung pool must read `ok:false` at 2 s rather
 *      than turn an uptime check into a hanging request, and a FAST success must leave
 *      `vi.getTimerCount()` at 0 — the timeout timer has to be cleared in a `finally`, not left
 *      live for two seconds on every single poll.
 *   3. THE PAYLOAD IS MINIMAL AND CLOSED (T-42-01, T-42-21, ASVS V4). The endpoint is
 *      unauthenticated by construction, so the body's exact key sets are asserted — not just the
 *      absence of today's leaks — and a DB rejection must not carry a driver message, a stack or
 *      a connection string into it.
 *   4. THE VERB SURFACE IS CLOSED (T-42-22, ASVS V5). `GET` is the only export and it takes no
 *      parameters, so the handler reads no query, no body and no header: the strongest
 *      input-validation posture available is that there is no input.
 *
 * WHAT THIS SUITE DOES NOT PROVE — read this before trusting a green run.
 *
 * It proves the HANDLER'S LOGIC and nothing about the module-graph bridge. The heartbeat registry
 * lives on `globalThis` because Turbopack instantiates a shared module once per module graph, and
 * this repo's own build contains four independent instances of `src/lib/events/bus.ts` (module IDs
 * `587400`, `117126`, `930245`, `947362`), two of them inside the graph of a single `register()`
 * call. Vitest has a SINGLE module registry and structurally cannot reproduce that split, so
 * "the route reads the same registry the processors write to" is UNPROVEN here no matter how many
 * of these tests pass. `heartbeat.test.ts` labels its own `globalThis` cases a PROXY for the same
 * reason. The real verification is the container check in plan 42-18. That is not a caveat to
 * skim: `src/lib/audit/actor-context.ts`'s identical hazard shipped green.
 *
 * `@/db` is mocked down to exactly `execute`. Any other query the route grows surfaces here as a
 * TypeError instead of being absorbed by a permissive mock — the argument `src/lib/audit/prune.test.ts`
 * lines 28-29 makes explicitly.
 *
 * THE ROUTE IS IMPORTED STATICALLY, AT MODULE SCOPE, AND THAT IS LOAD-BEARING.
 *
 * It used to be reached through a two-level dynamic chain — each test called `callGet()`, which
 * called `loadRoute()`, which performed `await import("@/app/api/health/route")`. The stated reason
 * was diagnostic: a missing route would then report "N tests, N failed" instead of collapsing into
 * one collection error. 47-14 reversed that trade, because the cost turned out to be the worst
 * timing margin in the entire repository.
 *
 * 47-06 measured this file's first importing test at **9339 ms against a 5000 ms `testTimeout` —
 * 186.8% of budget, a 0.54x margin** — at a sampled 2.50x-9.00x CPU oversubscription, and watched
 * it FAIL in 2 of 6 full-suite runs. The whole cost is module-graph import work, paid inside a test
 * body where the budget is HALF the 10 000 ms `hookTimeout` that the equivalent hook defect
 * (`toggle.test.ts`, 47-03) was billed against. `vi.mock("@/db")` is hoisted above imports by
 * vitest's transform, so the static form sees the mock exactly as the dynamic form did; nothing
 * about what these tests prove changes. The diagnostic that was traded away is worth little in
 * practice — a collection error names the file, and every one of these assertions fails either way.
 *
 * `src/lib/__tests__/suite-hook-hygiene.test.ts` is the suite-wide gate that keeps this true, and
 * it follows helper calls transitively precisely because this file's import hid two calls deep
 * where a lexical scan could not see it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("@/db", () => ({ db: { execute: vi.fn() } }))

// A NAMESPACE import, not a named one: the closed-verb-surface test below asserts that `POST`,
// `PUT`, `PATCH` and `DELETE` are absent from the module, which needs the whole namespace object.
import * as healthRoute from "@/app/api/health/route"
import { db } from "@/db"
import {
  EXPECTED_WORKERS,
  registerProcessor,
  registerSubscriber,
  recordTick,
  _resetForTesting,
} from "@/lib/observability/heartbeat"

const mockExecute = (db as unknown as { execute: ReturnType<typeof vi.fn> }).execute

const DB_PROBE_TIMEOUT_MS = 2_000

/**
 * The route's handler, from the STATIC namespace import above. See the header for why the two-level
 * `callGet()` -> `loadRoute()` -> `await import(...)` chain this replaced had to go.
 */
const { GET } = healthRoute

async function callGet(): Promise<Response> {
  return (await GET()) as unknown as Response
}

type HealthBody = {
  status: string
  db: { ok: boolean; latencyMs: number | null }
  processors: Record<string, { alive: boolean; lastTickAt: string | null }>
}

/**
 * Mirrors the six processors' REAL cadences (`execution-processor.ts:44` is 5 s; both pruners are
 * 24 h from `audit/prune.ts:26` and `trash/prune.ts:38`), so the staleness math exercised here is
 * the production math. The ROUTE imports none of these — the processors pass their own constants
 * into `registerProcessor`, which is what keeps the health check's expectation from drifting.
 */
const PROCESSORS: ReadonlyArray<readonly [name: string, intervalMs: number, initialDelayMs: number]> = [
  ["webhook-processor", 10_000, 5_000],
  ["email-processor", 30_000, 5_000],
  ["schedule-processor", 60_000, 5_000],
  ["execution-processor", 5_000, 1_000],
  ["audit-prune", 24 * 60 * 60 * 1000, 60_000],
  ["trash-prune", 24 * 60 * 60 * 1000, 60_000],
]

const SUBSCRIBERS = [
  "webhook-subscriber",
  "workflow-trigger-subscriber",
  "stage-history-subscriber",
  "audit-subscriber",
] as const

/** A fully live process: all six processors registered AND ticked, all four subscribers attached. */
function registerEverything(options: { skipTickFor?: string[] } = {}) {
  const skip = new Set(options.skipTickFor ?? [])
  for (const [name, interval, initialDelay] of PROCESSORS) {
    registerProcessor(name, interval, initialDelay)
  }
  for (const name of SUBSCRIBERS) registerSubscriber(name)
  for (const [name] of PROCESSORS) {
    if (!skip.has(name)) recordTick(name)
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  _resetForTesting()
  mockExecute.mockResolvedValue([{ "?column?": 1 }])
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  _resetForTesting()
})

describe("fixture integrity", () => {
  it("covers exactly the ten-name roster, so a roster change breaks this file first", () => {
    const fixtureNames = [...PROCESSORS.map(([name]) => name), ...SUBSCRIBERS].sort()
    expect([...EXPECTED_WORKERS].sort()).toEqual(fixtureNames)
    expect(EXPECTED_WORKERS).toHaveLength(10)
  })
})

describe("GET /api/health — the empty-registry proof (amendment A1)", () => {
  it("empty registry returns 503 with all ten workers present and dead — a dead register() must never read as healthy", async () => {
    // The registry is cleared in beforeEach: nothing registered, which is what a build whose
    // `instrumentation.js` was silently dropped looks like from inside the route.
    const response = await callGet()
    const body = (await response.json()) as HealthBody

    expect(response.status).toBe(503)
    expect(body.status).toBe("degraded")

    // THE assertion. Fewer than ten keys is the failure signature, so the COUNT is checked and
    // not merely "at least one worker is dead".
    expect(Object.keys(body.processors)).toHaveLength(10)
    expect(Object.keys(body.processors).sort()).toEqual([...EXPECTED_WORKERS].sort())
    for (const name of EXPECTED_WORKERS) {
      expect(body.processors[name]).toEqual({ alive: false, lastTickAt: null })
    }
  })

  it("returns 503 on an empty registry even though the database probe succeeded", async () => {
    const response = await callGet()
    const body = (await response.json()) as HealthBody

    // A working DB must not be able to mask ten dead workers: `healthy` is a conjunction.
    expect(body.db.ok).toBe(true)
    expect(response.status).toBe(503)
  })
})

describe("GET /api/health — healthy process", () => {
  it("returns 200 with status ok and all ten workers alive", async () => {
    registerEverything()

    const response = await callGet()
    const body = (await response.json()) as HealthBody

    expect(response.status).toBe(200)
    expect(body.status).toBe("ok")
    expect(Object.keys(body.processors)).toHaveLength(10)
    for (const name of EXPECTED_WORKERS) {
      expect(body.processors[name].alive).toBe(true)
    }
  })

  it("reports db.ok true with a numeric latencyMs", async () => {
    registerEverything()

    const body = (await (await callGet()).json()) as HealthBody

    expect(body.db.ok).toBe(true)
    expect(typeof body.db.latencyMs).toBe("number")
    expect(body.db.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it("probes with a single `select 1` and issues no other query", async () => {
    registerEverything()

    await callGet()

    // `SELECT 1` exercises the real postgres.js pool and costs ~1 ms. A "more representative"
    // query would count rows, and a count is business data on an unauthenticated endpoint.
    expect(mockExecute).toHaveBeenCalledTimes(1)
    const [statement] = mockExecute.mock.calls[0] as [{ queryChunks?: unknown[] }]
    expect(JSON.stringify(statement)).toContain("select 1")
  })

  it("leaves no live timer behind after a fast successful probe", async () => {
    registerEverything()

    await callGet()

    // RESEARCH's proposed `probeDb()` composes `Promise.race` with an inline
    // `new Promise((_, rej) => setTimeout(...))` and never clears it, leaking a live 2-second
    // timer on EVERY fast success — a per-request leak that keeps the event loop warm in
    // production. This assertion is what forces the `finally { clearTimeout(timer) }` fix.
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe("GET /api/health — one dead worker", () => {
  it("returns 503 for a stale execution-processor while the other nine stay alive", async () => {
    // Everything registers and ticks except `execution-processor`, which then sits past its own
    // first-tick budget (1 s delay + 5 s interval + 60 s slack = 66 s).
    registerEverything({ skipTickFor: ["execution-processor"] })
    await vi.advanceTimersByTimeAsync(90_000)
    for (const [name] of PROCESSORS) {
      if (name !== "execution-processor") recordTick(name)
    }

    const response = await callGet()
    const body = (await response.json()) as HealthBody

    expect(response.status).toBe(503)
    expect(body.status).toBe("degraded")
    expect(body.processors["execution-processor"]).toEqual({ alive: false, lastTickAt: null })

    // A degraded response that flipped everything to dead would be useless for diagnosis, so the
    // nine survivors are asserted explicitly.
    for (const name of EXPECTED_WORKERS) {
      if (name === "execution-processor") continue
      expect(body.processors[name].alive).toBe(true)
    }
  })

  it("returns 503 when a single subscriber never registered, and names it", async () => {
    for (const [name, interval, initialDelay] of PROCESSORS) {
      registerProcessor(name, interval, initialDelay)
      recordTick(name)
    }
    for (const name of SUBSCRIBERS) {
      if (name !== "audit-subscriber") registerSubscriber(name)
    }

    const response = await callGet()
    const body = (await response.json()) as HealthBody

    // A dead `registerAuditSubscriber` IS the 2026-08-16 defect where every audit row was written
    // with `actor_kind = system`, and it is invisible to a processor-only health check.
    expect(response.status).toBe(503)
    expect(body.processors["audit-subscriber"]).toEqual({ alive: false, lastTickAt: null })
    expect(body.processors["webhook-subscriber"].alive).toBe(true)
  })
})

describe("GET /api/health — database failure", () => {
  it("reports db.ok false with a null latencyMs and a 503, without blanking the worker report", async () => {
    registerEverything()
    mockExecute.mockRejectedValue(
      new Error('connection to server at "db.internal" (10.0.0.7), port 5432 failed: password authentication failed for user "pipelite"')
    )

    const response = await callGet()
    const body = (await response.json()) as HealthBody

    expect(response.status).toBe(503)
    expect(body.status).toBe("degraded")
    expect(body.db).toEqual({ ok: false, latencyMs: null })

    // A DB failure must not blank the worker report — that is the half of the response an
    // operator needs most while the database is down.
    expect(Object.keys(body.processors)).toHaveLength(10)
    for (const name of EXPECTED_WORKERS) {
      expect(body.processors[name].alive).toBe(true)
    }
  })

  it("leaks no driver message, stack or connection string from the rejection (T-42-21)", async () => {
    registerEverything()
    mockExecute.mockRejectedValue(
      new Error('connection to server at "db.internal" (10.0.0.7), port 5432 failed: password authentication failed for user "pipelite"')
    )

    const serialized = JSON.stringify(await (await callGet()).json())

    expect(serialized).not.toContain("db.internal")
    expect(serialized).not.toContain("10.0.0.7")
    expect(serialized).not.toContain("password")
    expect(serialized).not.toContain("authentication")
    expect(serialized).not.toContain("Error")
    expect(serialized).not.toContain("stack")
  })

  it("does not log the probe failure at error level, so a downed database cannot flood the log", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    registerEverything()
    mockExecute.mockRejectedValue(new Error("db down"))

    await callGet()

    // An uptime check polling a downed database would otherwise emit one error line per poll
    // interval, forever.
    expect(errorSpy).not.toHaveBeenCalled()
  })
})

describe("GET /api/health — the bounded probe", () => {
  it("resolves at the 2s bound with db.ok false when the probe never settles", async () => {
    registerEverything()
    // Never settles: a hung pool, which is what a saturated `postgres.js` connection pool looks
    // like from the caller's side.
    mockExecute.mockReturnValue(new Promise<never>(() => {}))

    const pending = callGet()
    await vi.advanceTimersByTimeAsync(DB_PROBE_TIMEOUT_MS)
    const response = await pending
    const body = (await response.json()) as HealthBody

    expect(response.status).toBe(503)
    expect(body.db).toEqual({ ok: false, latencyMs: null })
    // The worker report survives a hung database.
    expect(Object.keys(body.processors)).toHaveLength(10)
  })

  it("has not resolved before the bound is reached", async () => {
    registerEverything()
    mockExecute.mockReturnValue(new Promise<never>(() => {}))

    let settled = false
    const pending = callGet().then((r) => {
      settled = true
      return r
    })

    await vi.advanceTimersByTimeAsync(DB_PROBE_TIMEOUT_MS - 1)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    await pending
    expect(settled).toBe(true)
  })
})

describe("GET /api/health — payload minimisation (T-42-01, ASVS V4)", () => {
  it("exposes exactly {status, db, processors} and exactly {ok, latencyMs}", async () => {
    registerEverything()

    const body = (await (await callGet()).json()) as HealthBody

    // Asserting the exact key sets, rather than only the absence of today's known leaks, is what
    // stops a future "just add the build sha" from landing silently on an open endpoint.
    expect(Object.keys(body).sort()).toEqual(["db", "processors", "status"])
    expect(Object.keys(body.db).sort()).toEqual(["latencyMs", "ok"])
    for (const name of EXPECTED_WORKERS) {
      expect(Object.keys(body.processors[name]).sort()).toEqual(["alive", "lastTickAt"])
    }
  })

  it("carries no version string, connection detail, hostname or count field", async () => {
    registerEverything()

    const body = (await (await callGet()).json()) as HealthBody
    const serialized = JSON.stringify(body)

    expect(serialized).not.toMatch(/\d+\.\d+\.\d+/) // no semver / build version
    expect(serialized.toLowerCase()).not.toContain("version")
    expect(serialized.toLowerCase()).not.toContain("postgres")
    expect(serialized.toLowerCase()).not.toContain("password")
    expect(serialized.toLowerCase()).not.toContain("localhost")
    expect(serialized.toLowerCase()).not.toContain("count")
    expect(serialized).not.toMatch(/\bnode\b|\bnext\b/i)

    // The real deployment target, when the test process happens to have it.
    const dbUrl = process.env.DATABASE_URL
    if (dbUrl) {
      const host = new URL(dbUrl).hostname
      if (host) expect(serialized).not.toContain(host)
    }

    // No numeric aggregate anywhere: every number in the body is a latency, and every worker
    // value is a boolean plus a timestamp-or-null.
    expect(typeof body.db.latencyMs === "number" || body.db.latencyMs === null).toBe(true)
    for (const name of EXPECTED_WORKERS) {
      expect(typeof body.processors[name].alive).toBe("boolean")
      const tick = body.processors[name].lastTickAt
      expect(tick === null || typeof tick === "string").toBe(true)
    }
  })
})

describe("GET /api/health — closed verb surface (T-42-22, ASVS V5)", () => {
  it("is read-only: the module exports GET and no mutating handler", () => {
    const handlers = healthRoute as unknown as Record<string, unknown>

    expect(typeof handlers.GET).toBe("function")
    // A route file that later grows a mutating handler breaks here. An unauthenticated endpoint
    // with a write verb is an unauthenticated write.
    expect(handlers.POST).toBeUndefined()
    expect(handlers.PUT).toBeUndefined()
    expect(handlers.PATCH).toBeUndefined()
    expect(handlers.DELETE).toBeUndefined()
  })

  it("takes no parameters, so the handler reads no input at all", () => {
    // No `request` parameter means no query string, no body and no header is read — the strongest
    // input-validation posture available is having no input.
    expect(GET.length).toBe(0)
  })

  it("sets no Cache-Control and no CORS headers", async () => {
    registerEverything()

    const response = await callGet()

    // `src/app/api/v1/docs/route.ts` sends `public, max-age=3600` and `Access-Control-Allow-Origin: *`.
    // Neither is copied: a cached health response is a stale liveness claim, which is worse than
    // no endpoint, and there is no cross-origin consumer.
    expect(response.headers.get("cache-control")).toBeNull()
    expect(response.headers.get("access-control-allow-origin")).toBeNull()
  })
})
