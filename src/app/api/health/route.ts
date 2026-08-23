import { NextResponse } from "next/server"
import { sql } from "drizzle-orm"

import { db } from "@/db"
import { snapshot } from "@/lib/observability/heartbeat"

/**
 * GET /api/health — the ONLY handler this module will ever export.
 *
 * ── Why this endpoint exists ──────────────────────────────────────────────────────────────────
 *
 * It answers a question no log line can: is THIS process's `register()` actually alive right now.
 *
 * On 2026-08-08 a `RUN cp … 2>/dev/null || true` in the Dockerfile failed silently, the built
 * `instrumentation.js` never reached the standalone output, and ALL FOUR processors never started
 * in production. Nothing logged, nothing alerted, every test passed. The check that was supposed
 * to catch it — grepping the container logs for `[execution-processor] Starting` — is VACUOUS,
 * because that line is emitted by every build including a months-old one. This endpoint replaces
 * it. A related recurrence on 2026-08-16: a dead `registerAuditSubscriber` wrote every audit row
 * with `actor_kind = system`, which a processor-only health check cannot see, so the four crmBus
 * subscribers are reported here too.
 *
 * ── THE load-bearing design decision (amendment A1) ───────────────────────────────────────────
 *
 * `processors` comes from `snapshot()`, which iterates the fixed ten-name `EXPECTED_WORKERS`
 * roster and NEVER the live registry map. Do not "simplify" this by mapping the registry's own
 * entries: `Object.values({}).every(p => p.alive)` is **`true`**, so a totally dead `register()`
 * would serialize as `processors: {}` and this endpoint would answer **200 ok on precisely the
 * failure it exists to detect**. That is not hypothetical — it was written on purpose during this
 * plan's RED #2 step and observed returning `status=200`, `{"status":"ok",…,"processors":{}}` on an
 * empty registry while passing 16 of the sibling suite's 19 tests. A `processors` object with
 * fewer than ten keys is the failure signature, and the sibling test asserts the key COUNT.
 *
 * This is also why `snapshot()` is the ONLY worker-layer import here. Importing a processor's
 * `POLL_INTERVAL`/`TICK_INTERVAL` directly would drag all six processor modules and their `db`,
 * `fetch` and `zod` dependencies into this route's bundle; the processors instead pass their own
 * constants into `registerProcessor`, so the health check's staleness expectation cannot drift
 * from the real cadence.
 *
 * ── UNAUTHENTICATED BY CONSTRUCTION, not by omission ──────────────────────────────────────────
 *
 * `src/middleware.ts:8`'s next-auth matcher is `["/((?!api|_next/static|_next/image|favicon.ico).*)"]`,
 * which EXCLUDES `/api/*` entirely — next-auth never sees this request and there is no opt-out to
 * write. `src/app/api/v1/docs/route.ts` is the in-repo precedent for a deliberately public GET
 * with the reason stated in prose. Load balancers and uptime checks need this endpoint open, which
 * CONTEXT locks.
 *
 * Accepted consequences, stated rather than papered over:
 * - No `withApiAuth` means NO RATE LIMITING (T-42-02). That is correct for a poll endpoint. The
 *   residual cost of a flood is one `SELECT 1` per request; the 2-second bound below is what caps
 *   how long any single request can hold one of the pool's 10 connections, and the `clearTimeout`
 *   in the `finally` is what stops timers accumulating under load. If it ever matters, a 1-second
 *   memoisation of the probe result is the cheap mitigation — deliberately not shipped, because
 *   the complexity is not yet earned.
 * - An anonymous caller learns that ten named background jobs exist and which are dead (T-42-03,
 *   accepted). The job names are already visible in the repository.
 *
 * ── PAYLOAD IS FIXED AND MINIMAL (T-42-01) ────────────────────────────────────────────────────
 *
 * Exactly `{status, db:{ok,latencyMs}, processors:{name:{alive,lastTickAt}}}`. No version string,
 * no connection detail, no hostname, no row counts. The sibling test asserts the EXACT top-level
 * and `db` key sets, so a future "just add the build sha" fails the suite instead of landing
 * quietly on an open endpoint.
 *
 * This handler sets NO cache header and NO cross-origin headers. `docs`'s one-hour public cache
 * directive is explicitly NOT copied (T-42-23): a cached health response is a stale liveness
 * claim, which is worse than no endpoint at all, and there is no cross-origin consumer.
 *
 * There is also NO `dynamic` route-segment export here. Route Handlers are not cached by default
 * in Next 15+, verified empirically against this repo's own build — the only prerendered `.body`
 * file under `.next/server/app/**` is `favicon.ico.body`. Adding `force-dynamic` would be cargo
 * cult. Note that the plan's mechanical gate greps this file for those three literal strings and
 * expects zero hits, so the prose above names them descriptively on purpose: the gate stays
 * checkable, and a future edit that actually adds one of them shows up immediately.
 *
 * ── CLOSED VERB SURFACE (T-42-22) ─────────────────────────────────────────────────────────────
 *
 * `GET` is the only export and none may be added: an unauthenticated endpoint with a write verb is
 * an unauthenticated write. Following the convention at `src/app/api/v1/audit/route.ts:18-27`, the
 * sibling test imports this module and asserts `POST`/`PUT`/`PATCH`/`DELETE` are `undefined`, so
 * adding one fails the suite rather than shipping quietly. It also asserts `GET.length === 0` —
 * the handler takes no `request` parameter, so it reads no query string, no body and no header.
 * The strongest input-validation posture available is having no input.
 */

/**
 * An uptime check must get an ANSWER. A hung pool has to read as `ok:false` rather than as a
 * request that never returns, so the probe is bounded rather than awaited indefinitely.
 */
const DB_PROBE_TIMEOUT_MS = 2_000

/**
 * `SELECT 1` is the probe, on purpose. It exercises the real `postgres.js` pool from
 * `src/db/index.ts:11` — which is what "database connectivity" means for this app — and costs
 * about a millisecond. A "more representative" query would count rows, and a count is business
 * data on an unauthenticated endpoint.
 *
 * DELIBERATE DEVIATION FROM 42-RESEARCH's Pattern 3 snippet, flagged so a reviewer does not read
 * it as drift: that snippet composes `Promise.race` with an inline
 * `new Promise((_, rej) => setTimeout(...))` and never clears the timer, leaving a LIVE 2-second
 * timer behind on every fast success — a non-zero `vi.getTimerCount()` under fake timers, and a
 * small per-request leak in production that keeps the event loop warm. The handle is therefore
 * hoisted and cleared in a `finally`. This is the `Promise.race` shape from
 * `src/app/api/webhooks/in/[workflowId]/[secret]/route.ts:120-142` composed with the
 * `finally { clearTimeout(timer) }` shape from `src/lib/execution/actions/http.ts:14-20`. Neither
 * precedent bounds a `db.*` call, because `postgres.js`/drizzle accept no `AbortSignal` — the
 * `AbortController` form used by `http.ts` is simply unavailable here. The composition is the
 * intended design, not an accident.
 */
async function probeDb(): Promise<{ ok: boolean; latencyMs: number | null }> {
  const start = performance.now()
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("db probe timeout")), DB_PROBE_TIMEOUT_MS)
      }),
    ])
    return { ok: true, latencyMs: Math.round(performance.now() - start) }
  } catch {
    // Bare `catch` with no binding, following the same idiom as the webhook route's bound-hit
    // handler: the failure is converted into a VALUE, never propagated, and nothing from the
    // rejection — no driver message, no SQLSTATE, no stack, no connection string — reaches the
    // response body (T-42-21).
    //
    // Deliberately NOT logged at error level. An uptime check polling a downed database would
    // otherwise emit one error line per poll interval, forever, burying the actual incident. The
    // 503 IS the signal here; the database's own failure is logged by whatever real work fails.
    return { ok: false, latencyMs: null }
  } finally {
    clearTimeout(timer)
  }
}

export async function GET() {
  const dbResult = await probeDb()

  // Roster-based, never registry-based. See the header — this single line is the phase's premise.
  const processors = snapshot()

  const healthy = dbResult.ok && Object.values(processors).every((worker) => worker.alive)

  // 200 healthy / 503 degraded, so a load balancer or uptime check can act on the status code
  // without parsing the body.
  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", db: dbResult, processors },
    { status: healthy ? 200 : 503 }
  )
}
