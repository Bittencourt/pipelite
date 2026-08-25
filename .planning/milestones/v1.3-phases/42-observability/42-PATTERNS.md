# Phase 42: Observability - Pattern Map

**Mapped:** 2026-08-23
**Files analyzed:** 8 new + 6 modified config/root files + 96 migration files (273 sites) + 10 heartbeat-writer files
**Analogs found:** 13 / 14 distinct shapes (one genuine gap: no bounded-DB-probe precedent — see §No Analog Found)

> Read this alongside `42-RESEARCH.md`. RESEARCH says *what to build* (it contains full proposed
> source for every new file). This document says *which existing file the executor copies the shape
> from*, with the excerpt quoted so no second read is needed.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/log.ts` | utility (zero-dep, all four module graphs) | transform (fan-in → stdout) | `src/lib/audit/actor-context.ts` (zero-dep contract + header discipline) | role-match |
| `src/lib/log.test.ts` | test | transform | `src/lib/dedup/scan-cleanup.test.ts` (console-spy + swallow assertions) | role-match |
| `src/lib/observability/heartbeat.ts` | store (in-process registry) | event-driven (write) / request-response (read) | **`src/lib/audit/actor-context.ts:30-50`** — same `globalThis` bridge, same zero-dep rule, same private-state/public-verbs shape | **exact** |
| `src/lib/observability/heartbeat.test.ts` | test | event-driven | `src/lib/audit/prune.test.ts:70-125` (fake-timer + exported-constant idiom) | exact |
| `src/lib/observability/sentry.ts` | service (optional integration) | request-response (egress) | **`src/app/api/upload/route.ts:6,14-30`** — env-gated `await import()` behind a type-only top-level import | **exact** |
| `src/lib/observability/sentry.test.ts` | test | request-response | `src/lib/email/send.test.ts:1-45` (`vi.resetModules()` + `delete process.env.X` + dynamic re-import) | exact |
| `src/app/api/health/route.ts` | route | request-response | **`src/app/api/v1/docs/route.ts`** (public, zero-input GET) for the auth posture; `src/app/api/v1/audit/route.ts` for conventions | role-match ×2 |
| `src/app/api/health/__tests__/route.test.ts` | test | request-response | `src/app/api/v1/audit/__tests__/route.test.ts` (`vi.mock("@/db")`, closed-verb assertions) | exact |
| `instrumentation.ts` (repo ROOT) | config / bootstrap | event-driven | itself — the twelve existing `await import()` blocks are the pattern | self |
| `eslint.config.mjs` | config | — | itself — `defineConfig([...])` flat array | self |
| `docker-compose.yml` | config | — | itself — `environment:` list lines 7-17 | self |
| `package.json` | config | — | itself | self |
| 6 processors (heartbeat calls) | service | batch (setTimeout chain) | `src/lib/webhook-processor.ts:17-49` — one shape, all six | exact |
| 4 subscribers (heartbeat calls) | service | pub-sub | `src/lib/events/subscribers/audit.ts:44-91` | exact |
| 96 migration files / 273 sites | mixed | mixed | five canonical shapes, §5 below | exact |

---

## 1. The `globalThis` singleton — both precedents, quoted in full

**This is the phase's highest risk (CONTEXT A2: four Turbopack module IDs).** Two working
precedents exist. They use the *identical* idiom and differ only in packaging.

### Precedent A — `src/lib/events/bus.ts:24-27` (terse, exports the state)

```typescript
// Singleton - must survive across module boundaries in all environments
const globalForBus = globalThis as typeof globalThis & { crmBus?: CrmEventBus }
export const crmBus = globalForBus.crmBus ?? new CrmEventBus()
globalForBus.crmBus = crmBus
```

### Precedent B — `src/lib/audit/actor-context.ts:30-50` (documented, hides the state)

```typescript
// Singleton - must survive across module boundaries in all environments.
//
// This is NOT defensive boilerplate. Next.js bundles `instrumentation.ts` into a different
// module graph from the app's server actions, so this file is instantiated TWICE in a
// production build: once in the graph that registers the audit subscriber (the READER) and
// once in the graph that runs the wrapped server actions (the WRITER). With a plain
// module-level `const`, the writer stores the actor on one AsyncLocalStorage instance and the
// reader calls `getStore()` on a different one, always gets `undefined`, and every audit row
// is written as `system` with a null user — silently defeating AUDIT-01, while every unit
// test passes because vitest has a single module registry.
//
// Observed in the running container on 2026-08-16: a deal created by a logged-in user in the
// browser produced `actor_kind = system`. `crmBus` (src/lib/events/bus.ts:25) already carries
// this same pattern for the same reason, which is why the EVENT reached the subscriber at all
// while the ACTOR did not.
const globalForActor = globalThis as typeof globalThis & {
  auditActorStorage?: AsyncLocalStorage<AuditActor>
}
const actorStorage =
  globalForActor.auditActorStorage ?? new AsyncLocalStorage<AuditActor>()
globalForActor.auditActorStorage = actorStorage
```

And its zero-dependency contract, `actor-context.ts:6-9` — copy this paragraph's *form* into
`heartbeat.ts` and `log.ts`:

```typescript
/**
 * This module is deliberately dependency-free: it imports nothing but the Node runtime.
 * All four entry boundaries establish the actor here (the API auth wrapper, the workflow
 * execution engine, the audited server actions and the two importers), so any dependency
 * added to this file is pulled into every one of them. Keep it that way.
 */
```

### Differences, and which one to copy

| | `bus.ts` | `actor-context.ts` |
|---|---|---|
| Idiom (`as typeof globalThis & {…}`, `?? new`, write-back) | identical | identical |
| Exports | **the singleton itself** (`export const crmBus`) | **module-private `const`**, only verbs exported (`getCurrentActor`, `runWithActor`) |
| Comment | one line | 15 lines: mechanism + incident + the vitest caveat |
| Key name | `crmBus` (unnamespaced) | `auditActorStorage` (unnamespaced) |
| Deps | imports `node:events` | zero |

**Copy `actor-context.ts`.** Three reasons the executor should be told explicitly:

1. **Private state + public verbs is exactly `heartbeat.ts`'s shape.** The registry exposes
   `registerProcessor` / `registerSubscriber` / `recordTick` / `snapshot` / `_resetForTesting`
   and must NOT export the `Map` — an exported map invites a caller to iterate it, which is
   precisely the A1 vacuous-truth bug (`snapshot()` must iterate `EXPECTED_WORKERS`, never the
   map's keys).
2. **Its header already contains the paragraph this phase needs**, including the sentence
   `42-VALIDATION.md` quotes as the reason the container check is manual-only: *"every unit test
   passes because vitest has a single module registry."* Write the equivalent paragraph in
   `heartbeat.ts` naming the 2026-08-08 and 2026-08-16 incidents.
3. **Its zero-dep header is the same rule** both `heartbeat.ts` and `log.ts` need, for the same
   bundling reason.

**One deliberate improvement over both precedents:** namespace the key. Both existing keys are
bare (`crmBus`, `auditActorStorage`); RESEARCH proposes `__pipeliteHeartbeats`. Keep the
namespaced form and say in the header that it is intentional, so a reviewer does not "fix" it
back to the analog's bare name.

**Do NOT copy from the subscribers:** all four guard with a module-level `let registered = false`
(`webhook.ts:12`, `workflow-trigger.ts:12`, `stage-history.ts:6`, `audit.ts:34`). Those flags are
per-instance and unreadable from the route graph. `/api/health` must never consult them.

**`_resetForTesting` convention to mirror — `src/lib/events/subscribers/audit.ts:105-112`:**

```typescript
export function _resetForTesting(): void {
  if (registered) {
    for (const event of AUDITED_EVENTS) {
      crmBus.removeAllListeners(event)
    }
  }
  registered = false
}
```
Heartbeat's version is one line (`workers.clear()`), but keep the name, the `export`, and the
"Test-only" doc comment — four modules already use this exact name.

---

## 2. An unauthenticated API route — an analog DOES exist

**Good news for the plan's risk profile: there are three, and one is documented as public in
prose.** The reviewer's "missing auth is a defect" objection is pre-empted by pointing at it.

### Primary analog — `src/app/api/v1/docs/route.ts:1-34` (public, zero input, GET + OPTIONS only)

```typescript
import { NextResponse } from "next/server"
import { readFile } from "fs/promises"
import { join } from "path"
import { parse } from "yaml"

/**
 * GET /api/v1/docs - OpenAPI specification
 *
 * Serves the OpenAPI 3.1 specification as JSON.
 * This endpoint is public (no authentication required) to enable
 * external tools to discover and integrate with the API.
 */
export async function GET() {
  try {
    const specPath = join(process.cwd(), "public", "openapi.yaml")
    const yamlContent = await readFile(specPath, "utf-8")
    const openapiSpec = parse(yamlContent)

    return NextResponse.json(openapiSpec, { headers: { /* … */ } })
  } catch (error) {
    console.error("Failed to load OpenAPI spec:", error)   // ← also a migration site
    return NextResponse.json(
      { error: "OpenAPI specification not available" },
      { status: 500 }
    )
  }
}
```

Four things `/api/health` copies verbatim from this file:
- **`export async function GET()` with no `request` parameter.** Reads no input at all — the ASVS
  V5 posture RESEARCH asks to assert. `docs` is the only other route in the tree with this signature.
- **A prose comment stating the endpoint is public and why.** Do the same, and additionally cite
  `src/middleware.ts:8` (below) so the openness is shown to be structural, not an omission.
- **No `withApiAuth`, no `auth()`.** Consequence to state in the plan: no rate limiting either,
  which is correct for a poll endpoint (RESEARCH Pitfall 10).
- **No `export const dynamic`.** Neither route declares one.

**One thing NOT to copy:** `docs` sets `Cache-Control: public, max-age=3600` and CORS `*`.
`/api/health` must set neither — a cached health response is a lie, and there is no cross-origin
consumer.

### Secondary analogs (weaker, listed so the planner can cite breadth)

| File | Why it is unauthenticated |
|---|---|
| `src/app/api/invite/validate/route.ts:7` | Unauth `GET`, reads a `token` search param; pre-login surface |
| `src/app/api/webhooks/in/[workflowId]/[secret]/route.ts:~20` | Header comment: *"Public inbound webhook endpoint. No auth middleware -- the secret in the URL IS the authentication."* |
| `src/app/api/{signup,forgot-password,reset-password,verify-email}/route.ts` | Pre-auth flows, all unauthenticated `POST`/`GET` |

### The structural proof to quote in the route header — `src/middleware.ts:7-9`

```typescript
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
```
`/api/*` is excluded from next-auth middleware entirely. `/api/health` is unauthenticated **by
construction, not by omission** — there is no opt-out to write and nothing to remove.

### Conventions to take from `src/app/api/v1/audit/route.ts` instead

That file is the recent, well-documented route; take its *discipline*, not its auth.

**Closed-surface header — `route.ts:18-28`:**
```typescript
/**
 * GET /api/v1/audit — the ONLY handler this module will ever export.
 *
 * READ-ONLY, PERMANENTLY. There is no create, update, amend or delete verb here and none may be
 * added. … The sibling test imports this module and asserts the mutating verbs are `undefined`,
 * so adding one fails the suite rather than shipping quietly.
 */
```

**And the assertion that enforces it — `src/app/api/v1/audit/__tests__/route.test.ts:201-212`:**
```typescript
describe("GET /api/v1/audit — read-only method surface (T-36-33)", () => {
  it("is read-only: the module exports GET and no mutating handler", async () => {
    const handlers = auditRoute as unknown as Record<string, unknown>

    expect(typeof handlers.GET).toBe("function")
    expect(handlers.POST).toBeUndefined()
    expect(handlers.PUT).toBeUndefined()
    expect(handlers.PATCH).toBeUndefined()
    expect(handlers.DELETE).toBeUndefined()
  })
})
```
This is the exact code for VALIDATION row *"Only `GET` is exported (other verbs `undefined`)"* —
`import * as healthRoute from "@/app/api/health/route"` and change four names.

**Route-test mocking preamble — `audit/__tests__/route.test.ts:25-33, 53-57`:**
```typescript
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    query: { users: { findFirst: vi.fn() } },
  },
}))

import { db } from "@/db"
import * as auditRoute from "@/app/api/v1/audit/route"
import { GET } from "@/app/api/v1/audit/route"
```
For health, the mock is smaller and the shape matters: `vi.mock("@/db", () => ({ db: { execute: vi.fn() } }))`
— the same "mock down to exactly one method so an unexpected query surfaces as a TypeError"
argument `src/lib/audit/prune.test.ts:31-32` makes explicitly.

---

## 3. Bounded / timeout-guarded async — two precedents, neither on a DB call

`/api/health`'s 2 s DB bound has **no exact analog**: nothing in this repo bounds a `db.*` call
today. Two adjacent precedents exist, both on `fetch`.

### Precedent A — `Promise.race` — `src/app/api/webhooks/in/[workflowId]/[secret]/route.ts:114-141`

Closest in *shape* to what RESEARCH prescribes (a race, inside a route, whose loss is converted
into a benign response rather than an error):

```typescript
// Register pending response BEFORE executing so the handler can resolve it
const responsePromise = waitForWebhookResponse(run.id, 30_000)

// Execute run synchronously (not via processor queue)
const executePromise = executeRun(run.id)

try {
  // Wait for either the webhook response or the execution to complete
  const response = await Promise.race([
    responsePromise,
    executePromise.then(() => null),
  ])

  if (response) {
    return NextResponse.json(response.body as Record<string, unknown>, {
      status: response.statusCode,
    })
  }
  return NextResponse.json({ ok: true, run_id: run.id }, { status: 200 })
} catch {
  // Timeout or execution error: fall back to default response
  return NextResponse.json({ ok: true, run_id: run.id }, { status: 200 })
}
```
Note the idiom to copy: **a bare `catch {}` with no binding**, converting "the bound was hit" into
a value rather than propagating. `probeDb()` does the same, returning `{ ok: false, latencyMs: null }`.

### Precedent B — `AbortController` + `finally clearTimeout` — `src/lib/execution/actions/http.ts:6-21`

```typescript
/**
 * Fetch with an AbortController timeout.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs * 1000)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}
```

Also present: `src/app/api/internal/webhooks/process/route.ts:37` uses the one-liner
`signal: AbortSignal.timeout(10_000)`.

### Which to use for `probeDb()`, and the one thing to add

**Use `Promise.race` (Precedent A) — `postgres.js`/drizzle accept no `AbortSignal`, so
Precedent B is not available on this call.** But copy **`finally { clearTimeout(timer) }`** from
Precedent B, because RESEARCH's proposed snippet does not:

```typescript
new Promise((_, rej) => setTimeout(() => rej(new Error("db probe timeout")), DB_PROBE_TIMEOUT_MS))
```
leaves a live 2 s timer on every fast success. Under a `vi.useFakeTimers()` test that shows up as
a non-zero `vi.getTimerCount()`; in production it is a small per-request leak that keeps the event
loop warm. Hoist the timer handle and clear it in a `finally`. Flag this as an intentional
deviation from RESEARCH's snippet so a reviewer does not read it as drift.

**Bound-hit test idiom — `src/lib/audit/prune.test.ts:75-88, 91-102`:**
```typescript
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it("schedules the first tick at INITIAL_DELAY rather than running immediately", async () => {
  startAuditPruner()

  expect(vi.getTimerCount()).toBe(1)
  await vi.advanceTimersByTimeAsync(INITIAL_DELAY - 1)
  expect(mockReadRetentionDays).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(mockReadRetentionDays).toHaveBeenCalledTimes(1)
})
```
`await vi.advanceTimersByTimeAsync(n)` (never the sync form) is this repo's only fake-timer idiom —
19 uses in `prune.test.ts` alone. For the "DB probe hangs" row: mock `db.execute` to return a
never-settling promise, `await vi.advanceTimersByTimeAsync(2_000)`, assert `db.ok === false` and
status 503. Note `src/lib/execution/actions/__tests__/http.test.ts:81` uses
`vi.useFakeTimers({ shouldAdvanceTime: true })` when real `await`s are interleaved — reach for
that option only if the plain form stalls.

**The DB probe's SQL — copy the raw-`sql` form from `src/lib/audit/prune.ts:120-129`:**
```typescript
const result = await db.execute(sql`
  DELETE FROM audit_log
  WHERE ctid IN ( … )
`)
```
i.e. `import { sql } from "drizzle-orm"` + `db.execute(sql\`select 1\`)`. And note
`src/db/index.ts:11` — `postgres(connectionString)` with default `max: 10`; that is the pool the
probe must exercise and the one Pitfall 10 is about.

---

## 4. Env-gated optional feature that is inert when unset — the exact analog exists

### Primary analog — `src/app/api/upload/route.ts:6, 14-30`

This is the pattern OBS-02 needs, already in the repo: **a type-only top-level import plus a
dynamic `await import()` inside an env guard**, so the heavy SDK is never evaluated when the var
is unset.

```typescript
import type { S3Client } from '@aws-sdk/client-s3'      // line 6 — TYPE ONLY, erased

// Storage configuration from environment
const STORAGE_TYPE = process.env.FILE_STORAGE || 'local' // 'local' | 's3'

// S3 client (lazy init for when S3 is configured)
let s3Client: S3Client | null = null

async function getS3Client() {
  if (!s3Client && process.env.S3_ENDPOINT) {
    const { S3Client: S3ClientClass } = await import('@aws-sdk/client-s3')
    s3Client = new S3ClientClass({ /* … */ })
  }
  return s3Client
}
```
and at the use site, `route.ts:77`: `const { PutObjectCommand } = await import('@aws-sdk/client-s3')`.

**Map it onto `sentry.ts` / `instrumentation.ts` one-to-one:**

| upload route | Phase 42 |
|---|---|
| `import type { S3Client }` at top | `import type { Instrumentation } from "next"` in `instrumentation.ts` |
| `process.env.S3_ENDPOINT` guard | `process.env["SENTRY_DSN"]` guard in `initSentry()` |
| `await import('@aws-sdk/client-s3')` inside the guard | `await import("@sentry/nextjs")` inside the guard |
| `let s3Client: … \| null` module state | `let enabled = false` module state |
| Second dynamic import at the use site | `await import("@sentry/nextjs")` in `reportRequestError` |

The upload route proves the idiom type-checks and builds under this repo's Turbopack config, which
is the load-bearing question for A6 (`instrumentation.ts` must have **zero** top-level value
imports so the edge copy stays `async function t(){}`).

### Secondary analog — `src/lib/redis.ts:9-36` (the inert-when-unset *behaviour*)

```typescript
export function getRedisClient(): Redis | null {
  if (redis) return redis

  if (!process.env.REDIS_URL) {
    console.info("REDIS_URL not configured - using database sessions only")
    return null
  }
  try {
    redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: true })
    // …
    return redis
  } catch (error) {
    console.error("Failed to initialize Redis:", error)
    return null
  }
}
```
Copy: the announce-and-return shape, and that the disabled path is **logged, not silent** (matches
RESEARCH's `log.info("sentry", "SENTRY_DSN unset — error tracking disabled, SDK not loaded")`).
**Do not copy:** `import Redis from "ioredis"` at line 1 — a top-level value import. That is the
anti-pattern for `sentry.ts`. Also note `redis.ts:13` is itself one of the two `console.info`
migration sites.

### How this repo PROVES the inert path — `src/lib/email/send.ts:16-23` + `send.test.ts:9-38`

The guard:
```typescript
export async function safeSend(to, template): Promise<void> {
  if (!process.env.SMTP_HOST) {
    console.warn("[email] No SMTP_HOST configured, skipping email to:", to)
    return
  }
  const transporter = getEmailTransporter()
  // …
}
```

The proof — this is the test skeleton `sentry.test.ts` should copy:
```typescript
describe('safeSend', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    mockSendMail.mockClear()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('logs warning and returns when SMTP_HOST is not configured', async () => {
    delete process.env.SMTP_HOST
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { safeSend } = await import('./send')          // ← import AFTER mutating env
    await safeSend('test@example.com', { subject: 'Test', html: '<p>Test</p>', text: 'Test' })

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('No SMTP_HOST configured'),
      expect.any(String)
    )
    expect(mockSendMail).not.toHaveBeenCalled()          // ← the NEGATIVE, asserted
    warnSpy.mockRestore()
  })
})
```

Four transferable elements, all needed by OBS-02:
1. `vi.resetModules()` in `beforeEach` + **dynamic `await import()` after mutating env** — module
   state (`let enabled`) must not leak between the DSN-set and DSN-unset cases.
2. `process.env = { ...originalEnv }` / restore in `afterEach`. (`vi.stubEnv` appears exactly once
   in the tree, `trigger-child-guard.test.ts:84`; the spread-and-restore form is the majority
   convention.)
3. **The negative asserted as `not.toHaveBeenCalled()` on the transport**, not as an absence of
   observed output. That is OBS-02 layer 1.
4. `expect.stringContaining(...)` for the log line.

**No precedent exists for OBS-02 layer 2** (`vi.mock` factory that *throws* to prove a module was
never imported). Grep found none in the tree. Flag it as novel in the plan so a reviewer does not
look for the convention.

`src/lib/email/send.test.ts:33` is one of the three argument-shape assertions Pitfall 5 names — the
same file is both an analog and a migration-fallout site.

---

## 5. The 273 migration sites — six canonical shapes with before/after

The mechanical rule, from RESEARCH: keep the 22 existing bracket names verbatim as `scope`
(73 sites); for the ~200 unprefixed sites derive `scope` from the module path with `src/` and the
extension stripped and `/` kept (`src/lib/mutations/deals.ts` → `mutations/deals`).

Signature: `log.<level>(scope, msg, ctx?)` — **three arguments, the error always under `ctx.err`.**
Level map: `console.error`→`log.error`, `console.warn`→`log.warn`, `console.log`→`log.info`,
`console.info`→`log.info`, (`console.debug`→`log.debug`; zero sites).

### Shape (a) — prefixed `console.error(msg, err)` in a swallow-and-log catch

231 of 273 are `console.error`, and this is the dominant sub-shape.

`src/lib/webhook-processor.ts:42-44`:
```typescript
    } catch (error) {
      console.error("[webhook-processor] Tick error:", error)
    }
```
becomes
```typescript
    } catch (error) {
      log.error("webhook-processor", "Tick error", { err: error })
    }
```
Rules: the trailing `:` moves out of the message; the `catch` body keeps exactly one statement and
**stays swallowing**. Several of these catches have headers explaining why they swallow
(`audit.ts:65-70`, `stage-history.ts:19-21`, `trash/prune.ts:60-70`) — read the header, change
nothing but the call.

Second instance, same shape, with a template literal and **no error argument** —
`src/lib/webhook-processor.ts:38-40`:
```typescript
        console.error(
          `[webhook-processor] Process route returned ${response.status}`
        )
```
becomes
```typescript
        log.error("webhook-processor", "Process route returned non-OK", { status: response.status })
```
Interpolated values move out of the string into `ctx`. This is the single highest-value part of the
migration (the field becomes queryable) and the single easiest place to accidentally widen what is
logged — **never add a value that was not already in the string** (V8 / `scan-cleanup.ts:36`:
*"Logs carry counts only, never row contents (T-37-09)"*).

### Shape (b) — unprefixed `console.error(msg, err)`, scope from the path

`src/lib/mutations/deals.ts` has 11 sites of which 8 are this exact form
(lines 266, 468, 507, 583, 755, 827, …):
```typescript
  } catch (error) {
    console.error("Failed to create deal:", error)
```
becomes
```typescript
  } catch (error) {
    log.error("mutations/deals", "Failed to create deal", { err: error })
```
The same file also holds **prefixed** sites that keep their harvested scope — `deals.ts:121` and
`:580` are `[formula-recalc]`, `:605` is `[audit]`. **So one file mixes both shapes:** the executor
must not blanket-apply the path-derived scope. Rule: bracket present ⇒ use it; bracket absent ⇒
path-derived.

### Shape (c) — `console.log` boot line in a processor (also a heartbeat-wiring site)

`src/lib/webhook-processor.ts:12-15`:
```typescript
export function startWebhookProcessor(): void {
  console.log("[webhook-processor] Starting with initial delay of 5s")
  scheduleTick(INITIAL_DELAY)
}
```
becomes, with the A1 heartbeat registration folded into the same edit:
```typescript
export function startWebhookProcessor(): void {
  log.info("webhook-processor", "Starting", { initialDelayMs: INITIAL_DELAY })
  registerProcessor("webhook-processor", POLL_INTERVAL, INITIAL_DELAY)
  scheduleTick(INITIAL_DELAY)
}
```
`"initial delay of 5s"` becomes a field rather than prose — and it stops being able to lie when
`INITIAL_DELAY` changes. All six processors share this shape:
`audit/prune.ts:45-47` and `trash/prune.ts:116-117` are literally the same two lines with
`[audit-prune]` / `[trash-prune]` and exported `INITIAL_DELAY` / `TICK_INTERVAL` constants
(`audit/prune.ts:23,26`; `trash/prune.ts:31,38`) — pass those same constants to
`registerProcessor`, per RESEARCH's "pass the interval in, do not import it out".

And the tick-completion write, `webhook-processor.ts:42-48` — `recordTick` goes **outside** the
`try`, immediately before the existing reschedule:
```typescript
    } catch (error) {
      log.error("webhook-processor", "Tick error", { err: error })
    }

    recordTick("webhook-processor")   // ← outside the try: a tick that ERRORED still ran
    // Always schedule the next tick
    scheduleTick(POLL_INTERVAL)       // ← existing line, unchanged
```
`audit/prune.ts:87-91` has the identical `catch` + reschedule tail; `prune.test.ts:31` already
asserts *"ALWAYS RESCHEDULES. The tail `scheduleTick` sits OUTSIDE the `try`."* — the same
structural argument, now applied to `recordTick`.

### Shape (d) — client component (`"use client"`) — 8 sites in 5 files

`src/components/custom-fields/lookup-field.tsx:88-91` (and `:131`, `:143`):
```typescript
      } catch (error) {
        console.error('Search failed:', error)
        setResults([])
      } finally {
```
becomes
```typescript
      } catch (error) {
        log.error("custom-fields/lookup-field", "Search failed", { err: error })
        setResults([])
      } finally {
```
Notes for the executor:
- **Same code path as the server.** No `typeof window` branch (RESEARCH A5).
- `import { log } from "@/lib/log"` in a `"use client"` file is fine *only because* `log.ts` has
  zero imports. This is the reason its zero-dep header is a hard rule.
- Single quotes: these files use `'…'`; the repo is mixed. Match the surrounding file, do not
  reformat.
- The other four: `custom-fields-section.tsx:75,80`, `file-field.tsx:138`,
  `global-search.tsx:49`, `pipedrive-api-wizard.tsx:76`.
- **Two near-misses, both already resolved by RESEARCH — restate them in the plan:**
  `transform-config.tsx:45` is JSX copy inside `<code>`, **do not touch** (it is not among the 96
  files); `components/timeline/record-timeline.tsx:111` is a **server** component despite being
  `.tsx` — migrate normally, add no client directive.

### Shape (e) — unusual arguments: bare method reference, and >2 args

**A bare reference — `src/lib/api-keys.ts:72-77`.** The only site where a naive substitution
compiles and is wrong:
```typescript
  // Update last used timestamp (fire-and-forget, don't block validation)
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, apiKey.id))
    .execute()
    .catch(console.error)
```
`.catch(log.error)` would pass the `Error` as `scope`. Must become:
```typescript
    .catch((err) => log.error("api-keys", "lastUsedAt update failed", { err }))
```

**Prefix-as-whole-message, inside a mandatory `.catch` — `src/lib/events/subscribers/audit.ts:87`
and `stage-history.ts:30`:**
```typescript
        .catch((err) => console.error("[audit]", err))            // audit.ts:87
        .catch((err) => console.error("[stage-history]", err))    // stage-history.ts:30
```
become
```typescript
        .catch((err) => log.error("audit", "insert failed", { err }))
        .catch((err) => log.error("stage-history", "insert failed", { err }))
```
There is no message today, so one must be invented — keep it factual and short. **The `.catch`
itself is mandatory** (`audit.ts:70-75` and `stage-history.ts:19-21` both explain that dropping it
turns a lost row into an unhandled rejection). These two are also **2 of the 3 argument-shape test
assertions** (Pitfall 5) — `audit.test.ts:284` and `stage-history.test.ts:150` currently read
`expect(errorSpy).toHaveBeenCalledWith("[audit]", boom)` / `("[stage-history]", boom)` and become a
single-argument JSON-string assertion. Their surrounding tests must keep asserting
`expect(() => crmBus.emit(...)).not.toThrow()` and `expect(unhandled).toHaveLength(0)` unchanged —
that is the "still swallows" proof.

**Four arguments — `src/lib/email/send.ts:32`:**
```typescript
    console.log("[email] Email sent to:", to, "messageId:", info.messageId)
```
becomes
```typescript
    log.info("email", "Email sent", { to, messageId: info.messageId })
```
Interleaved label/value pairs collapse into `ctx` keys. `send.ts:20` (`console.warn("[email] No
SMTP_HOST configured, skipping email to:", to)`) is the third shape assertion —
`send.test.ts:33-36` currently expects two arguments (`stringContaining` + `any(String)`) and must
become a one-argument assertion.

**Concatenated multi-line template — `src/lib/dedup/scan-cleanup.ts:76-79`:**
```typescript
const LOG = "[dedup-scan-cleanup]"          // :45 — a module-level prefix constant

    console.log(
      `${LOG} Done: ${staleRunning.length} stranded scan(s) marked error, ` +
        `${staleIdle.length} idle deleted, ${old.length} expired deleted`
    )
```
becomes
```typescript
    log.info("dedup-scan-cleanup", "Done", {
      strandedMarkedError: staleRunning.length,
      idleDeleted: staleIdle.length,
      expiredDeleted: old.length,
    })
```
**Delete the now-unused `LOG` const** or eslint's `no-unused-vars` will flag it. The same file's
`:47` (`console.log(\`${LOG} Starting\`)`) and `:80` (`console.error(\`${LOG} Failed …\`, error)`)
use the same const.

### Shape (f) — the A7 log-grep gates: comments, not calls

Three places document a verification that this migration breaks. They are prose and are invisible
to `no-console`, so nothing forces the update — the plan must name all three.

`instrumentation.ts:36-40`:
```typescript
    // REGISTRATION HERE IS NOT EVIDENCE OF EXECUTION. `Dockerfile:24` copies the built
    // `instrumentation.js` into `.next/standalone/` with a step that ends in `2>/dev/null || true`,
    // so a build whose chunk layout changes fails silently and this whole function never runs. That
    // exact breakage killed all four processors in production on 2026-08-08 while every test passed.
    // The gate is behavioural: `docker compose logs app | grep -F '[trash-prune] Starting'`.
```
→ replace the last line with `/api/health` (the six processors now have a real detector), keeping
the first four lines verbatim.

`src/lib/dedup/scan-cleanup.ts:18-36` (a 19-line comment arguing for the gate) and
`src/lib/dedup/scan-cleanup.test.ts:16-19`:
```
 *   docker compose up -d --build app
 *   rtk proxy docker compose logs app --tail 300 | grep -F '[dedup-scan-cleanup] Starting'
```
→ `... | grep -F '"scope":"dedup-scan-cleanup"'`. These two are the **only** verification the two
one-shot cleanups have (they are correctly excluded from `processors`), so the string must be
updated, not dropped. `scan-cleanup.ts:33-36` also carries the two constraints the migration must
preserve: *"The startup line is OUTSIDE the try/catch on purpose"* and *"Logs carry counts only,
never row contents (T-37-09)."*

---

## 6. `eslint.config.mjs` in this repo's flat-config style

**Current file, complete (22 lines):**
```javascript
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Agent git worktrees contain a full second copy of src/, which otherwise
    // doubles the reported problem count and — worse — lets a transient copy
    // fail the repo's lint gate for reasons unrelated to the real tree.
    ".claude/**",
  ]),
]);

export default eslintConfig;
```

Observed conventions the flip must follow:
- **`defineConfig([...])` with a flat array**; spread presets first, then local entries.
- **There are currently ZERO `rules:` blocks and ZERO `files:` overrides.** The Phase 42 change
  introduces the first of each — say so, so a reviewer knows there was no prior shape to match.
- **Semicolons** in this file (unlike most of `src/`, which omits them). Keep them.
- **Every non-obvious entry carries a comment explaining why**, including the incident that
  motivated it (see `.claude/**`). The `no-console` block and both overrides must each carry one.

The change, in that style (from RESEARCH §Code Examples, adjusted to preserve the existing
`globalIgnores` comments):
```javascript
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([ /* … unchanged, comments intact … */ ]),
  {
    // OBS-01's durable half. Criterion 1 is "no bare console.* remains in non-test source";
    // this rule is what keeps it true after this phase. Empirically: 273 violations across 96
    // non-test files before the migration, 0 after — so this entry lands LAST in the phase and
    // its clean run is the proof.
    rules: { "no-console": "error" },
  },
  {
    // Exemption 1 of 2: the logger IS the console wrapper. src/lib/log.ts delegates to
    // console.error/warn/debug/log deliberately — writing to process.stdout instead would
    // break 89 vi.spyOn(console, …) calls across 40 test files and make the module unusable
    // from the edge runtime and the browser.
    files: ["src/lib/log.ts"],
    rules: { "no-console": "off" },
  },
  {
    // Exemption 2 of 2: 21 legitimate console calls across 12 test files (measured). Tests are
    // not the durability surface criterion 1 is about.
    files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "**/__tests__/**"],
    rules: { "no-console": "off" },
  },
]);
```

**Gate arithmetic to put in the task:** baseline is `eslint` → **0 errors / 124 warnings**
(`npm run lint` = bare `eslint`, per `package.json:9`). After the flip it must still be **0 errors**.
The warning count is a 123-125 band (untracked-file variance) and must not be chased.

---

## Shared Patterns

### Zero-dependency module contract
**Source:** `src/lib/audit/actor-context.ts:3-10`
**Apply to:** `src/lib/log.ts`, `src/lib/observability/heartbeat.ts`
Both are pulled into all four module graphs (instrumentation, route/server-action, RSC, and — for
`log.ts` — the client bundle). Write the "imports nothing, keep it that way, here is who depends on
that" paragraph in each header. `actor-context.ts` is the template and the precedent.

### `globalThis` singleton
**Source:** `src/lib/audit/actor-context.ts:30-50` (preferred), `src/lib/events/bus.ts:24-27`
**Apply to:** `src/lib/observability/heartbeat.ts` only. See §1.

### Env-gated dynamic import
**Source:** `src/app/api/upload/route.ts:6, 14-30`
**Apply to:** `src/lib/observability/sentry.ts`, `instrumentation.ts` (both `register()` and
`onRequestError`). Type-only import at the top; every value import inside the guard. See §4.

### Swallow-and-log catch — preserve exactly
**Source:** `src/lib/events/subscribers/audit.ts:70-91`, `stage-history.ts:19-31`,
`src/lib/trash/prune.ts:60-70`
**Apply to:** all 231 `console.error` migrations.
The catch keeps swallowing; the `.catch(…)` stays attached; control flow is byte-for-byte
equivalent. The existing tests that prove it (`expect(() => crmBus.emit(...)).not.toThrow()`,
`expect(unhandled).toHaveLength(0)`) must keep passing untouched.

### Test conventions (all three vitest projects)
**Source:** `vitest.config.ts:6-9`, `src/lib/audit/prune.test.ts:33-45`,
`src/app/api/v1/audit/__tests__/route.test.ts:1-6`
- `globals: false` — every test file explicitly imports
  `{ describe, it, expect, vi, beforeEach, afterEach } from "vitest"`. No setup file exists.
- `include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)']` — **a root-level `instrumentation.test.ts`
  is never collected.** Do not widen this config (its header explains its choices at length);
  test the guard logic in `src/lib/observability/sentry.test.ts` instead.
- Mock `@/db` down to exactly the methods used, so an unexpected query is a TypeError rather than
  an absorbed call: `vi.mock("@/db", () => ({ db: { execute: vi.fn() } }))`.
- Type-only imports of mocked modules are safe and used deliberately —
  `audit/__tests__/route.test.ts:4`: *"Type-only import: erased at runtime, so it does not
  resurrect the mocked module below."*

### Test-file headers that state what the test does NOT prove
**Source:** `src/lib/dedup/scan-cleanup.test.ts:3-20`, `src/lib/audit/prune.test.ts:1-32`
**Apply to:** `heartbeat.test.ts` above all.
```
 * THIS TEST PROVES THE FUNCTION. IT DOES NOT PROVE THE FUNCTION RUNS.
 * … conflating "the unit test is green" with "the reaper runs" IS the 2026-08-08 failure mode.
```
`42-VALIDATION.md` labels the `globalThis`-key test a **proxy** for exactly this reason (vitest has
one module registry). Copy this header form and say so in the file.

### Boot-line-as-detector assertion
**Source:** `src/lib/audit/prune.test.ts:70-73, 105-109`
```typescript
function logLines(): string[] {
  const spy = console.log as unknown as ReturnType<typeof vi.fn>
  return spy.mock.calls.map((call: unknown[]) => call.join(" "))
}

it("announces itself on start — the container log line is how a dead instrumentation module is detected", () => {
  startAuditPruner()
  expect(logLines().some((line) => line.includes("[audit-prune]"))).toBe(true)
})
```
**This assertion breaks on migration** — `"[audit-prune]"` no longer appears; the line becomes
`{"level":"info","scope":"audit-prune",…}`. It is not in Pitfall 5's list of three (it uses
`.includes`, not `toHaveBeenCalledWith`), so **add it to the plan's expected-churn list**:
`.includes('"scope":"audit-prune"')`. Grep for the same `logLines()`/`.includes("[` idiom across
the other processor suites before the wave lands.

### `docker-compose.yml` env pass-through (A5 — mandatory)
**Source:** `docker-compose.yml:6-17`
```yaml
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - AUTH_SECRET=${AUTH_SECRET}
      - NEXTAUTH_URL=${NEXTAUTH_URL}
      - AUTH_TRUST_HOST=true
      - SMTP_HOST=${SMTP_HOST}
      # … through INTERNAL_SECRET
```
Eleven entries, `- NAME=${NAME}` form, **no `env_file:`**. Append `- LOG_LEVEL=${LOG_LEVEL}` and
`- SENTRY_DSN=${SENTRY_DSN}`. Mirror in `.env.example` following its commented-section style
(`# Redis (optional, for session caching)` at line 16 is the closest precedent for an
optional-integration var). **A8: add no `app` healthcheck** — the only healthcheck in the file is
postgres's `pg_isready` at lines 33-37, and `restart: unless-stopped` (line 21) plus a 503-capable
endpoint is a restart loop.

---

## No Analog Found

| File / concern | Role | Data Flow | Reason |
|---|---|---|---|
| Bounded **database** call | route | request-response | Nothing in the repo bounds a `db.*` call. The two timeout precedents are both on `fetch` (§3). Compose them: `Promise.race` from the webhook route + `finally { clearTimeout }` from `http.ts`. |
| `EXPECTED_WORKERS` hard-coded roster | store | — | No precedent for "iterate a fixed roster, not the live collection". The closest *posture* analog is the closed-literal-set pattern at `src/app/api/v1/audit/route.ts:44-64` (`as const satisfies readonly AuditEntityType[]`, checked against a closed set before any use) — copy the `as const` + comment-the-reason style, but there is no type to `satisfies` against here. This is A1, the phase's central proof; treat as novel. |
| A `vi.mock` factory that throws to prove a module was never imported | test | — | Zero occurrences in the tree. OBS-02 layer 2 is a new idiom. |
| `onRequestError` export | config | request-response | The hook does not exist in the repo today; `instrumentation.ts` exports only `register`. Use RESEARCH Pattern 4 verbatim (it is verified against the installed `next@16.1.6` types). |
| Structured JSON log emission | utility | transform | No logger module exists (`src/lib/log*` absent). Use RESEARCH Pattern 6 verbatim. |
| A `@sentry/*` dependency | config | — | `package.json:21-62` has no Sentry package. `npm install --legacy-peer-deps @sentry/nextjs` (the flag matches `Dockerfile:7` and is required by the pre-existing `nodemailer`/`@auth/core` peer conflict). Commit the lockfile **before** the Docker build — CI uses `npm ci`. |

---

## Executor Warnings Derived From This Mapping

1. **`src/lib/mutations/deals.ts` mixes shape (b) and shape (a) in one file** — 8 unprefixed, 3
   prefixed (`[formula-recalc]` ×2, `[audit]` ×1). No blanket scope per file. Assume the same of
   the other three high-density mutation files.
2. **`src/lib/audit/prune.test.ts:105-109` is a fourth breaking assertion**, beyond Pitfall 5's
   three. It matches on `"[audit-prune]"` via `.includes`, so grep the processor suites for
   `logLines()` / `.includes("[` before the migration wave lands.
3. **`RESEARCH`'s `probeDb()` snippet leaks a timer.** Add `finally { clearTimeout(timer) }` per
   `http.ts:18-20`, and flag it as an intentional deviation.
4. **Delete `const LOG = "[dedup-scan-cleanup]"` (`scan-cleanup.ts:45`)** when its three uses are
   migrated, or `no-unused-vars` flags it.
5. **`docker-compose.yml` has eleven env entries, not nine** (lines 7-17; CONTEXT A5 says nine).
   The substance — no `env_file:`, so an unlisted var never reaches the container — is unaffected.
6. **`redis.ts:13` and `redis.ts:23,28,33` are migration sites in the very file used as an
   inert-when-unset analog.** Migrating them does not change the gating logic; do not "improve"
   `getRedisClient` while there.
7. **Ten files are both migration targets and heartbeat-wiring targets** (6 processors + 4
   subscribers). Under "no two plans in a wave touch the same file", do both edits in one wave —
   they are adjacent lines in the same functions (§5 shape (c) shows the combined edit).

---

## Metadata

**Analog search scope:** `src/app/api/**` (51 route files enumerated, all grepped for auth
wrappers), `src/lib/{events,audit,trash,execution,dedup,email,mutations,triggers}`,
`src/components/custom-fields`, `src/middleware.ts`, `src/db/index.ts`, repo root
(`instrumentation.ts`, `eslint.config.mjs`, `docker-compose.yml`, `package.json`, `.env.example`,
`vitest.config.ts`)

**Files read in full or in targeted ranges:** 28
**Project instructions:** no `./CLAUDE.md`, no `.claude/skills/`, no `.agents/skills/` — constraints
come from the user's global instructions and project memory (Docker-only, no `sudo` for docker,
never a password, `.planning` force-add individual files, rtk elides redirected output ⇒ use
Write/Edit not shell redirection)
**Pattern extraction date:** 2026-08-23
**Read-only run:** no source file was modified; `42-PATTERNS.md` is the only file written.
