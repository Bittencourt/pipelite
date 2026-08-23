# Phase 42: Observability - Research

**Researched:** 2026-08-23
**Domain:** Structured logging, opt-in error tracking, in-process liveness reporting — Next.js 16.1.6 standalone / Docker
**Confidence:** HIGH (the load-bearing findings are tool-verified against this repo's own production build output and installed packages)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**The logger (OBS-01)**

- **Hand-rolled `src/lib/log.ts`, no new dependency.** Single-line JSON to stdout, level from a
  `LOG_LEVEL` env var. pino was considered and declined: "structured and level-controlled" is roughly
  40 lines, and pino brings Next.js edge/node bundling care for no gain this phase needs. If log
  shipping is wanted later, JSON-on-stdout is already the right substrate.
- **Migrate all 278 call sites FIRST, then flip ESLint `no-console` to `error`** with only the logger
  module exempted. The lint rule is what makes criterion 1 durable rather than momentary — without it
  the 279th call arrives next phase. Flipping the rule first would red the build for the phase's whole
  duration or scatter ~50 disable comments; migrating first and flipping last makes the flip a
  single-commit gate that either passes or names every straggler.
- **Line shape `{level, scope, msg, ts, ...ctx}`.** `scope` is HARVESTED from the existing
  `[execution-processor]`-style prefixes the code already uses in most of its 278 calls — a convention
  already in the source becomes queryable data instead of being thrown away.
- **No request-correlation ids.** They touch every entry point and belong to their own phase.

**Error tracking (OBS-02)**

- **Sentry SDK, opt-in via `SENTRY_DSN`.** Unset means the SDK is never initialized — not initialized
  and silent, but never initialized at all.
- **The negative is ASSERTED, not assumed.** Criterion 2's first half ("with the env var unset nothing
  leaves the deployment") is a claim about absence, so it needs a real test: init must be provably not
  called without the DSN. An absence of observed traffic is not evidence.
- **Server-side unhandled errors only** — that is what the criterion says. No browser bundle.
- **PII scrubbed by default:** request bodies and user emails stripped before send. This is a CRM;
  the safe default is not optional, and relying on Sentry-side scrubbing puts the data on the wire
  first.

**`/api/health` (OBS-03)**

- **Shape:** `{ status, db: { ok, latencyMs }, processors: { <name>: { alive, lastTickAt } } }`, with
  **HTTP 200 when healthy and 503 when degraded**, so a load balancer or uptime check can act on the
  status code without parsing the body.
- **Liveness via in-memory heartbeats.** Each processor records its last tick in a shared in-process
  registry; the route compares that timestamp against the processor's expected interval. Chosen over a
  DB-backed heartbeat table specifically because the question being asked is *"did `register()` run in
  THIS process"* — an in-memory heartbeat cannot be faked by a healthy sibling replica or by a stale
  row. Accepted limitation, stated so nobody reads it as an oversight: the answer is per-instance and
  does not survive a restart, which is correct for this question and consistent with the
  single-instance constraint Phase 41 documented.
- **Unauthenticated, with a minimal payload.** Load balancers and uptime checks need it open. No
  version strings, no connection details, no counts that would leak business data — just the shape
  above.
- **Covers all six processors AND all four event subscribers.** A dead `registerAuditSubscriber` is
  exactly the 2026-08-16 defect where every audit row was written with `actor_kind = system`; it is
  invisible to a processor-only health check. The two one-shot boot cleanups are NOT reported.

### Claude's Discretion

- The heartbeat registry's API shape and where it lives.
- Batching strategy for the 278 migrations across waves (must respect: two plans in one wave may not
  touch the same file).
- The exact `LOG_LEVEL` values and default.
- Whether `latencyMs` uses a trivial `SELECT 1` or something more representative.
- Sentry SDK package choice (`@sentry/node` vs `@sentry/nextjs`) — judge on which avoids more
  bundling friction, and record the reason.

### Deferred Ideas (OUT OF SCOPE)

- **Request-correlation ids** through server actions and API routes. Declined above; touches every
  entry point.
- **Client-side error capture.** Criterion 2 is server-side; adding the browser SDK is a separate
  decision with its own PII surface.
- **Log shipping / aggregation** (Loki, CloudWatch, ELK). JSON-on-stdout is deliberately the substrate
  that makes this a later, purely operational choice.
- **Tracing / OpenTelemetry spans.** Much larger, and not what any criterion asks for.
- **A status dashboard.** The endpoint is machine-facing; a human-facing page is a different phase.
- **DB-backed heartbeats for multi-instance liveness.** Correct answer to a different question — worth
  revisiting only if this deployment ever genuinely runs replicas, which Phase 41's WFOPS-04 matrix
  documents it currently should not for some paths.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description (REQUIREMENTS.md:76-78) | Research Support |
|----|-------------|------------------|
| OBS-01 | "Application logs are structured and level-controlled, replacing the 108 bare `console.*` calls in non-test source" | §Migration Surface gives the **tool-verified 273 call sites in 96 files** (the "108" is stale; see §Corrections). §Pitfall 4 (error serialization) and §Pitfall 5 (console-spy blast radius) are the two things that will break the migration if missed. §Logger Design gives the exact 40-line module and the console-delegation rule that preserves 86 of 89 existing spies. |
| OBS-02 | "Unhandled server errors are reported to an error tracker, opt-in via env var so the self-hosted default stays no-phone-home" | §Sentry recommends **`@sentry/nextjs` 10.70.0 with NO `withSentryConfig`**, wired at `instrumentation.ts`'s `onRequestError` (VERIFIED present in installed Next 16.1.6 types). §Pitfall 1 (edge double-compile) dictates that both the Sentry import and the logger import in `instrumentation.ts` must be dynamic. §Asserting the Negative gives the three-layer test design. |
| OBS-03 | "`/api/health` reports database connectivity and the liveness of all four background processors, so a dead instrumentation register() is detectable without reading container logs" | §The Module-Graph Hazard proves with build artifacts that `bus.ts` is instantiated **four separate times** and that the health route is in a *different* graph from every heartbeat writer — so the registry MUST be a `globalThis` singleton. §Heartbeat Registry gives the API, the per-worker intervals (which differ by a factor of 17,280), and the **expected-roster rule** without which a never-registered processor would silently vanish from the response instead of reporting dead. §Standalone Build Path proves the route survives standalone tracing while all 21 instrumentation chunks do not — which is precisely what makes the endpoint a valid detector. |
</phase_requirements>

---

## Summary

Three deliverables, three completely different risk profiles.

**The logger is a large, mechanical, low-novelty change with two non-obvious traps.** The real count is
**273 lint-flagged `console.*` call sites across 96 files** (CONTEXT's 278 is a raw grep that includes
five non-code occurrences — reconciled exactly in §Corrections). Trap one: `JSON.stringify(new Error())`
returns `{}`, so a naive JSON logger silently destroys every stack trace in all 231 `console.error(msg, err)`
migrations — the single largest regression risk in the phase. Trap two: 40 test files hold 89
`vi.spyOn(console, …)` calls; if the logger writes with `process.stdout.write` instead of delegating to
the matching `console` method, all 89 break at once. Delegating (`error`→`console.error`, `warn`→`console.warn`,
`info`→`console.log`, `debug`→`console.debug`) reduces the fallout to **exactly 3 assertions** that check
argument shape.

**The health endpoint's whole correctness rests on one bundling fact, and that fact is now proven rather
than assumed.** I extracted the Turbopack module IDs for `src/lib/events/bus.ts` from this repo's own
production build: it exists as **four independent module instances** (`587400` in the instrumentation
graph, `117126` in the execution-processor's sub-chunk *of that same graph*, `930245` in the
route/server-action graph, `947362` in the SSR/RSC graph), physically duplicated across 9 chunk files.
So the hazard is worse than CONTEXT describes — a module-level `const` is duplicated even between two
processors started by the same `register()` call. The heartbeat registry must be a `globalThis` singleton,
and separately the response must be built from a **hard-coded expected roster**, not from whatever
happens to be in the registry, or a never-registered processor disappears from the JSON instead of
reporting `alive: false`. Also proven: the health route and all its chunks survive standalone tracing,
while **all 21 instrumentation-graph chunks are dropped by it** and restored only by `Dockerfile:24-41`.
Detector and detected sit on opposite sides of the exact fragility the endpoint exists to catch. That is
the design working.

**Sentry is the smallest change and the one with the sharpest bundling constraint.** `instrumentation.ts`
is compiled **twice** — once for Node (`.next/server/chunks/_a6d16577._.js`) and once for the **edge
runtime** (`.next/server/edge/chunks/_52aa5b93._.js`, verified: `async function t(){}`, an empty
function). The edge copy is empty *only* because every dependency sits behind `await import()` inside the
`NEXT_RUNTIME === "nodejs"` guard. A top-level `import * as Sentry from "@sentry/nextjs"` — which is
exactly what Sentry's documented one-liner `export const onRequestError = Sentry.captureRequestError`
requires — would drag the SDK into the edge bundle and violate the locked "server-side only, no browser
bundle" decision from the other direction. Use a wrapper with a runtime guard and a dynamic import
instead.

**Primary recommendation:** Build `src/lib/log.ts` as a ~45-line environment-agnostic module that
delegates to `console.*` and carries a dedicated `Error` serializer; put the heartbeat registry in
`src/lib/observability/heartbeat.ts` behind a `globalThis` singleton with a hard-coded 10-name expected
roster; install `@sentry/nextjs` **without** `withSentryConfig` and reach it only through dynamic imports
guarded by `NEXT_RUNTIME === "nodejs"`.

---

## Corrections to CONTEXT.md's Measured Numbers

CONTEXT.md is approved and locked; these are refinements of its measurements, not challenges to its decisions.

| CONTEXT.md says | Tool-verified reality | Method |
|---|---|---|
| 278 `console.*` call sites | **273 real call sites in 96 files**; 278 is a raw grep including 5 non-code hits | `eslint --rule no-console:error`, JSON reporter, test files excluded |
| "`scope` is harvested from the existing `[…]` prefixes … in **most** of its 278 calls" | **Only 73 of 278 (26%) carry a bracket prefix**, across 22 distinct scope names. The other ~200 have no prefix and need a scope derived from the module path. | `grep -cE 'console\.[a-z]+\(\s*(\`\|")\['` |

**The 5 non-code hits** (present in a grep, invisible to `no-console`, must NOT be "migrated"):

| File:line | What it is |
|---|---|
| `src/lib/execution/actions/transform.ts:73` | comment — "console.log capture" |
| `src/lib/execution/actions/transform.ts:112` | comment — "Inject console.log capture" |
| `src/lib/views/write-guards.ts:321` | doc comment — "What is safe to \`console.error\` about…" |
| `src/app/workflows/[id]/edit/components/config-forms/transform-config.tsx:45` | **JSX text** inside `<code>` — user-facing UI copy, do not touch |
| (one further comment occurrence in the same two files) | 278 − 273 = 5, reconciled exactly |

**Existing bracket-prefix scopes** (22 names, 73 sites) — these are the `scope` values to preserve verbatim:
`formula-recalc` (15), `trash-prune` (6), `audit` (5), `email` (4), `audit-prune` (4), `audit-import` (4),
`trash-settings` (3), `schedule-processor` (3), `failure-alert` (3), `execution-processor` (3),
`email-process` (3), `dedup-merge` (3), `audit-settings` (3), `webhook-processor` (2), `execution-engine` (2),
`email-processor` (2), `duplicates-page` (2), `dedup` (2), `workflow-trigger` (1), `stage-history` (1),
`import-cleanup` (1), `audit-export` (1).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Structured log emission | API / Backend (Node runtime) | Browser / Client | 265 of 273 sites are server-side. 8 sites are in `"use client"` components where `console` is the browser's — see §Client Components. A single environment-agnostic module serves both. |
| Log level gating | API / Backend | — | `process.env.LOG_LEVEL`, read at runtime in the Node server. Absent in the browser, where the default applies. |
| Heartbeat **writes** | API / Backend — **instrumentation module graph** | — | The six processors' tick loops and the four subscribers' handlers all execute in the graph loaded by `register()`. |
| Heartbeat **reads** | API / Backend — **route module graph** | — | `/api/health` is a route handler, a provably different module graph (see §The Module-Graph Hazard). The bridge between them is `globalThis`, not module scope. |
| DB connectivity probe | Database / Storage | API / Backend | Must exercise the same `postgres.js` pool the app uses, or it proves nothing about the app. |
| Unhandled-error capture | API / Backend — `instrumentation.ts` `onRequestError` | — | The only seam Next.js offers that sees render, route, action and proxy errors uniformly. |
| Sentry transport | API / Backend (Node only) | — | Locked: server-side only. Must be excluded from both the edge bundle and the client bundle. |
| Health response / status code | API / Backend | CDN / Static — **none** | Unauthenticated, uncached. Route handlers are not cached by default in Next 15+ (VERIFIED), so no `dynamic` export is required. |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| *(none — hand-rolled)* `src/lib/log.ts` | — | Structured, level-controlled JSON logging | Locked by CONTEXT. §Logger Design shows it is ~45 lines and that a dependency would have to be edge/client/Node-safe anyway. |
| `@sentry/nextjs` | **10.70.0** (published 2026-08-12) `[VERIFIED: npm registry]` `[CITED: docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup]` | Opt-in server error tracking | Sentry's own Next.js guide; ships `captureRequestError`, the purpose-built adapter for Next's `onRequestError` signature. Requires `@sentry/nextjs` ≥ 8.28.0 and Next ≥ 15 — both satisfied. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `drizzle-orm` `sql` + `db.execute` | 0.45.1 (installed) | `select 1` liveness probe | Already the repo's raw-SQL pattern — `src/lib/audit/prune.ts:121`, `src/lib/trash/prune.ts:227`, `src/lib/timeline/assemble.ts:134`. |
| `next` `Instrumentation` type | 16.1.6 (installed) | Type the `onRequestError` export | `import type { Instrumentation } from "next"` — VERIFIED re-exported via `node_modules/next/dist/types.d.ts:18`. |
| `vitest` | 4.0.18 (installed) | All three deliverables' tests | No new test infra needed. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@sentry/nextjs` | **`@sentry/node`** | Rejected. The footprint argument is a **wash**: `@sentry/nextjs` depends on `@sentry/node`, so both drag in `@opentelemetry` (22 MB measured) and `import-in-the-middle`. `@sentry/nextjs`'s only extra weight is `@sentry/react` (1.2 MB), `browser-utils` (1.9 MB), `vercel-edge` (1.9 MB) and the build plugins (`rollup` 2.9 MB) — **none of which are loaded at runtime unless imported**. What `@sentry/node` costs instead is real: you must hand-write the `onRequestError`→`captureException` mapping (route path, route type, headers, `digest` extraction) and own its drift across Next minor versions. `captureRequestError` is that mapping, maintained upstream. |
| `@sentry/nextjs` **with** `withSentryConfig` | — | Rejected for this phase. `withSentryConfig` exists for source-map upload, `tunnelRoute`, and client-bundle wiring `[CITED: docs.sentry.io/platforms/javascript/guides/nextjs]` — all three are out of scope (source maps need an org/project/auth token, i.e. a Sentry account, which contradicts "opt-in, self-hosted default"). Skipping it also leaves `next.config.ts` untouched, avoiding a second wrapper around the existing `withNextIntl(...)`. **Accepted limitation:** Sentry stack traces will reference minified Turbopack chunk names. |
| Hand-rolled logger | `pino` | Already declined in CONTEXT. Independent confirmation that the decision is sound: the logger must be importable from client components (8 sites), from the instrumentation graph, and potentially from edge code later. `pino`'s Node transports make all three of those a configuration exercise. |
| In-memory heartbeats | DB-backed heartbeat table | Already declined in CONTEXT, and §Standalone Build Path independently confirms it: a DB row cannot distinguish "this process's `register()` ran" from "some earlier process wrote a row", which is the exact 2026-08-08 failure. |

**Installation:**

```bash
npm install --legacy-peer-deps @sentry/nextjs
```

`--legacy-peer-deps` is mandatory — it is what `Dockerfile:7` uses, and the repo already carries a
pre-existing `nodemailer` peer conflict between `@auth/core@0.41.0` (via `next-auth@5.0.0-beta.30`) and
`@auth/core@0.41.1` (via `@auth/drizzle-adapter`). Installing without the flag will surface that unrelated
conflict as a failure.

**Measured install impact** (observed during this research, then fully reverted): **104 packages added**,
`node_modules` grows by ~97 MB (`@sentry/*` 75 MB + `@opentelemetry/*` 22 MB). This lands in the Docker
image because `Dockerfile:64` copies `node_modules` **wholesale** (`COPY --from=builder /app/node_modules ./node_modules`),
not the standalone-traced subset. That is worth stating in the plan as an accepted cost, and it is also a
**de-risk**: Sentry's runtime files cannot be dropped by standalone file tracing, because tracing is not
what puts them in the image.

---

## Package Legitimacy Audit

| Package | Registry | Age | Source Repo | postinstall | slopcheck | Disposition |
|---------|----------|-----|-------------|-------------|-----------|-------------|
| `@sentry/nextjs` | npm | first published **2021-03-03**, latest 10.70.0 on **2026-08-12** | `github.com/getsentry/sentry-javascript` | none | **[OK]** | **Approved** |
| `@sentry/node` | npm | first published **2018-02-23**, latest 10.70.0 on **2026-08-12** | `github.com/getsentry/sentry-javascript` | none | **[OK]** | Verified but **not selected** (see Alternatives) |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

**Method:** `slopcheck install @sentry/nextjs @sentry/node` (slopcheck present at `/home/pedro/.local/bin/slopcheck`)
→ `2 OK`. `npm view <pkg> version time.created time.modified repository.url` and
`npm view <pkg> scripts.postinstall` (empty for both). Both packages are the canonical Sentry SDKs named
in Sentry's own official Next.js documentation, so they satisfy the authoritative-source requirement in
addition to passing slopcheck.

> ⚠️ **OPERATIONAL NOTE FOR THE PLANNER — slopcheck has a side effect.** `slopcheck install <pkgs>`
> does not merely check; it **runs `npm install` and mutates `package.json` and `package-lock.json`**.
> During this research it added both Sentry packages to `package.json`. I reverted with
> `git checkout -- package.json package-lock.json && npm install --legacy-peer-deps`, then re-reverted
> the lockfile, and re-verified the full baseline (below). **A plan task that runs `slopcheck install`
> must expect a dirty tree afterwards.** Prefer `slopcheck scan` for a check-only pass, or budget an
> explicit revert step.

**Baseline re-verified after the revert — repo is clean and unchanged:**

| Gate | Result |
|---|---|
| `git status --porcelain` | empty |
| `npx tsc --noEmit` | **0 errors** |
| `npx eslint` | **0 errors, 124 warnings** |
| `npx vitest run` | **925/925 suites, 4406 passed, 32 skipped, 0 failed** |

(Lint reads 124 here vs. the 123–125 band the brief describes — untracked-file variance, not to be chased.)

---

## Architecture Patterns

### System Architecture Diagram

```
                    ┌──────────────────────── ONE node process (PID 1, `next-server`) ─────────────────────────┐
                    │                                                                                          │
  container boot    │   ┌─ INSTRUMENTATION MODULE GRAPH ──────────────────────────────────┐                    │
  `node server.js`  │   │  instrumentation.ts  register()   [bus.ts instance 587400/117126]│                    │
        │           │   │     │                                                            │                   │
        ├───────────────▶│     ├─ await import → startWebhookProcessor    tick 60s ──┐      │                   │
        │           │   │     ├─ await import → startEmailProcessor      tick 300s ──┤      │                   │
        │           │   │     ├─ await import → startScheduleProcessor   tick 30s ───┤      │                   │
        │           │   │     ├─ await import → startExecutionProcessor  tick 5s ────┤      │                   │
        │           │   │     ├─ await import → startAuditPruner         tick 24h ───┤ recordTick(name)          │
        │           │   │     ├─ await import → startTrashPruner         tick 24h ───┤                   │      │
        │           │   │     ├─ await import → register{Webhook,WorkflowTrigger,     │                   │      │
        │           │   │     │                  StageHistory,Audit}Subscriber ───────┤ registerSubscriber│      │
        │           │   │     │                        ▲  (event-driven, may never fire)                  │      │
        │           │   │     └─ await import → initSentry()  ◀── SENTRY_DSN set?  no → never imported    │      │
        │           │   └──────────────────────────────┼──────────────────────────────────┘         │      │    │
        │           │                                  │                                            ▼      │    │
        │           │                        ┌─────────┴──────────── globalThis.__pipeliteHeartbeats ───┐  │    │
        │           │                        │  Map<name, {kind, registeredAt, lastTickAt, interval}>   │  │    │
        │           │                        └─────────┬────────────────────────────────────────────────┘  │    │
        │           │                                  │  read                                            │    │
        │           │   ┌─ ROUTE / SERVER-ACTION GRAPH ─┼──────────────────────────────┐                   │    │
 HTTP ──┼──────────────▶│  GET /api/health   [bus.ts instance 930245]                 │                    │    │
 GET    │           │   │     ├─ snapshot(EXPECTED_WORKERS)  ◀── hard-coded 10 names ──┘                    │    │
/api/   │           │   │     ├─ db.execute(sql`select 1`) ──▶ postgres.js pool ──▶ PostgreSQL             │    │
health  │           │   │     └─ status = db.ok && all alive ? 200 "ok" : 503 "degraded"                    │    │
        │           │   │                                                                                  │    │
 HTTP ──┼──────────────▶│  every other route / server action / RSC render                                   │    │
 other  │           │   │     └─ throws ──▶ Next captures ──▶ instrumentation.onRequestError ──┐            │    │
        │           │   └──────────────────────────────────────────────────────────────────────┼────────────┘    │
        │           │                                                                          ▼                 │
        │           │   ┌─ EDGE RUNTIME GRAPH (middleware only) ─┐        log.error(...) ──▶ stdout JSON line     │
        │           │   │  instrumentation.ts compiled to        │        sentryEnabled? ──▶ captureRequestError  │
        │           │   │  `async function t(){}`  (EMPTY)       │                              │                │
        │           │   │  src/middleware.ts → next-auth         │                              ▼                │
        │           │   │  matcher EXCLUDES /api/*               │                    sentry.io  (only if DSN)   │
        │           │   └────────────────────────────────────────┘                                               │
                    └──────────────────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── lib/
│   ├── log.ts                          # NEW. ~45 lines. Zero imports. Env-agnostic.
│   ├── log.test.ts                     # NEW. Line shape, level gating, Error serialization, throw-safety.
│   └── observability/                  # NEW directory
│       ├── heartbeat.ts                # NEW. globalThis registry + EXPECTED_WORKERS roster + snapshot().
│       ├── heartbeat.test.ts           # NEW. alive/stale math per worker, never-registered ⇒ alive:false.
│       ├── sentry.ts                   # NEW. initSentry() / reportRequestError(). Node-only, dynamic-imported.
│       └── sentry.test.ts              # NEW. Asserts the NEGATIVE (three layers, see below).
└── app/api/health/
    ├── route.ts                        # NEW. GET only. Unauthenticated. No caching directives needed.
    └── __tests__/route.test.ts         # NEW. 200/503, shape, db-failure path, degraded-on-dead-worker.
instrumentation.ts                      # MODIFIED (repo ROOT). +onRequestError, +Sentry init, +heartbeat wiring.
eslint.config.mjs                       # MODIFIED. no-console: error + exactly two overrides.
.env.example                            # MODIFIED. +LOG_LEVEL, +SENTRY_DSN.
docker-compose.yml                      # MODIFIED. app service `environment:` +LOG_LEVEL, +SENTRY_DSN.
Dockerfile                              # MODIFIED (recommended). Assert the postcondition on line 24.
```

---

### Pattern 1: The `globalThis` singleton — mandatory, and proven necessary

**What:** Any state written in one module graph and read in another must live on `globalThis`, not in
module scope.

**Why this is not defensive boilerplate — hard evidence from this repo's own build** (`.next/BUILD_ID`
dated 2026-08-21, Turbopack):

`src/lib/events/bus.ts` compiles to **four distinct Turbopack module IDs**, physically duplicated across
**9 chunk files**:

| Module ID | Graph | Evidence (chunk → consumer) |
|---|---|---|
| **587400** | instrumentation graph | `[root-of-the-server]__0946962d._.js` → `registerWebhookSubscriber`; `__ae00de5f` → `registerWorkflowTriggerSubscriber`; `__67f29cf5` → `registerStageHistorySubscriber`; `__d3f92449` → `registerAuditSubscriber`; `__546af60e` → `startTrashPruner` |
| **117126** | instrumentation graph — **a second instance inside the same `register()`** | `[root-of-the-server]__6058fe74._.js` → `startExecutionProcessor` |
| **930245** | route + server-action graph | `src_lib_ada943e9._.js` → `/api/v1/deals/[id]/route.js`, `/api/v1/people/route.js`; `src_lib_mutations_648dda9b._.js` → the mutation modules |
| **947362** | SSR / RSC render graph | `ssr/src_lib_c4c62563._.js` → `app/deals/page.js`; `ssr/src_lib_mutations_7fc74662._.js` |

Three consequences the planner must internalise:

1. **The hazard is worse than CONTEXT states.** It is not "instrumentation vs. server actions" — it is
   *four* instances, and two of them (`587400`, `117126`) are both inside `register()`'s own graph. Each
   `await import()` in `instrumentation.ts` gets its own chunk group with its own copy of shared library
   modules. A module-level registry would be duplicated even between `startTrashPruner` and
   `startExecutionProcessor`.
2. **Turbopack's runtime module cache cannot save you.** It is keyed by module ID; four different IDs
   means four independent instantiations, by construction.
3. **A route handler *is* in the same graph as a server action** (both `930245`) — that sub-question is
   answered — but **the RSC/SSR render graph is a third, separate instance** (`947362`). So even
   "everything in `src/app` shares one instance" is false. Only `globalThis` is reliable.

Method, reproducible:
```bash
grep -oE '[0-9]{5,8},[a-z]=>\{"use strict";[^@]{0,600}crmBus\?\?' \
  '.next/server/chunks/[root-of-the-server]__0946962d._.js' | grep -oE '^[0-9]+'
```

**Working pattern to copy — `src/lib/events/bus.ts:24-27`:**
```typescript
// Singleton - must survive across module boundaries in all environments
const globalForBus = globalThis as typeof globalThis & { crmBus?: CrmEventBus }
export const crmBus = globalForBus.crmBus ?? new CrmEventBus()
globalForBus.crmBus = crmBus
```

**The fuller precedent, with the incident write-up — `src/lib/audit/actor-context.ts:30-50`:**
```typescript
// Singleton - must survive across module boundaries in all environments.
//
// This is NOT defensive boilerplate. Next.js bundles `instrumentation.ts` into a different
// module graph from the app's server actions, so this file is instantiated TWICE in a
// production build ... every unit test passes because vitest has a single module registry.
//
// Observed in the running container on 2026-08-16: a deal created by a logged-in user in the
// browser produced `actor_kind = system`.
const globalForActor = globalThis as typeof globalThis & {
  auditActorStorage?: AsyncLocalStorage<AuditActor>
}
const actorStorage = globalForActor.auditActorStorage ?? new AsyncLocalStorage<AuditActor>()
globalForActor.auditActorStorage = actorStorage
```

**Corroborating detail:** all four subscribers guard re-registration with a **module-level
`let registered = false`** (`webhook.ts:12`, `workflow-trigger.ts:12`, `stage-history.ts:6`,
`audit.ts:34`). Those flags are per-instance and therefore **unreadable from the route graph** — the
health check must never consult them.

**Why `globalThis` is sufficient here:** the standalone container runs a **single Node process**
(verified: `docker compose exec app ps` shows PID 1 `next-server` and no forks; `server.js` contains no
`cluster`/`fork`). One process ⇒ one `globalThis`.

---

### Pattern 2: The heartbeat registry

**What:** One `globalThis`-backed map, ten known workers, two write verbs, one read verb.

```typescript
// src/lib/observability/heartbeat.ts
// Zero imports. Must stay dependency-free for the same reason src/lib/audit/actor-context.ts is:
// it is pulled into every module graph that touches a processor, a subscriber or the health route.

export type WorkerKind = "processor" | "subscriber"

interface WorkerState {
  kind: WorkerKind
  /** ms between ticks. null for event-driven subscribers. */
  expectedIntervalMs: number | null
  /** ms allowed to elapse before the FIRST tick. null for subscribers. */
  firstTickBudgetMs: number | null
  registeredAt: number
  lastTickAt: number | null
}

/**
 * THE EXPECTED ROSTER. This is the load-bearing constant of OBS-03.
 *
 * `snapshot()` iterates THIS list, never the live map. A worker whose `register()` never ran is
 * therefore reported as `{ alive: false, lastTickAt: null }` — present in the JSON and false —
 * rather than silently absent from it. Building the response from the map's own keys would make
 * a totally dead `register()` serialize as `processors: {}`, which a naive `every()` treats as
 * healthy. That is precisely the 2026-08-08 failure the endpoint exists to catch.
 *
 * Immutable data, so duplication across module graphs is harmless.
 */
export const EXPECTED_WORKERS = [
  "webhook-processor", "email-processor", "schedule-processor", "execution-processor",
  "audit-prune", "trash-prune",
  "webhook-subscriber", "workflow-trigger-subscriber", "stage-history-subscriber", "audit-subscriber",
] as const

const g = globalThis as typeof globalThis & {
  __pipeliteHeartbeats?: Map<string, WorkerState>
}
const workers = g.__pipeliteHeartbeats ?? new Map<string, WorkerState>()
g.__pipeliteHeartbeats = workers

export function registerProcessor(
  name: string, expectedIntervalMs: number, initialDelayMs: number
): void {
  workers.set(name, {
    kind: "processor",
    expectedIntervalMs,
    // First tick must arrive within its own delay plus one whole interval plus a minute of slack.
    firstTickBudgetMs: initialDelayMs + expectedIntervalMs + 60_000,
    registeredAt: Date.now(),
    lastTickAt: null,
  })
}

export function registerSubscriber(name: string): void {
  workers.set(name, {
    kind: "subscriber",
    expectedIntervalMs: null,
    firstTickBudgetMs: null,
    registeredAt: Date.now(),
    lastTickAt: null,
  })
}

/** Call on tick COMPLETION (processors) or on handler entry (subscribers). Never throws. */
export function recordTick(name: string): void {
  const w = workers.get(name)
  if (w) w.lastTickAt = Date.now()
}

export interface WorkerReport { alive: boolean; lastTickAt: string | null }

export function snapshot(now = Date.now()): Record<string, WorkerReport> {
  const out: Record<string, WorkerReport> = {}
  for (const name of EXPECTED_WORKERS) {
    const w = workers.get(name)
    if (!w) { out[name] = { alive: false, lastTickAt: null }; continue }
    let alive: boolean
    if (w.kind === "subscriber") {
      // Registration IS the liveness claim — see the note below on what this proves.
      alive = true
    } else if (w.lastTickAt === null) {
      alive = now - w.registeredAt <= w.firstTickBudgetMs!
    } else {
      alive = now - w.lastTickAt <= w.expectedIntervalMs! * 2 + 60_000
    }
    out[name] = { alive, lastTickAt: w.lastTickAt ? new Date(w.lastTickAt).toISOString() : null }
  }
  return out
}

/** Test-only. Mirrors the `_resetForTesting` convention of the four crmBus subscribers. */
export function _resetForTesting(): void { workers.clear() }
```

**Per-worker constants — verified by reading every processor.** The spread is a factor of **17,280**,
so one global staleness rule is impossible:

| Worker | File | Initial delay | Interval | `staleAfter` (2×interval + 60s) | `firstTickBudget` |
|---|---|---|---|---|---|
| `webhook-processor` | `src/lib/webhook-processor.ts:1-2` | 5 s | **60 s** | 180 s | 125 s |
| `email-processor` | `src/lib/email-processor.ts:2` | 15 s | **300 s** | 660 s | 375 s |
| `schedule-processor` | `src/lib/triggers/schedule-processor.ts:9` | 10 s | **30 s** | 120 s | 100 s |
| `execution-processor` | `src/lib/execution/execution-processor.ts:41-44` | 5 s | **5 s** | 70 s | 70 s |
| `audit-prune` | `src/lib/audit/prune.ts:26` (`export const TICK_INTERVAL`) | 60 s | **24 h** | 48 h + 60 s | 24 h + 120 s |
| `trash-prune` | `src/lib/trash/prune.ts:38` (`export const TICK_INTERVAL`) | 60 s | **24 h** | 48 h + 60 s | 24 h + 120 s |

**Pass the interval in, do not import it out.** The processor calls
`registerProcessor("audit-prune", TICK_INTERVAL, INITIAL_DELAY)` using the *same constants its own timer
uses*, so the health check's expectation cannot drift from the real cadence. The alternative — exporting
`POLL_INTERVAL` from each processor and having the route import it — would drag all six processor modules
(and their `db`, `fetch` and `zod` dependencies) into the route bundle. **`/api/health` must import
`heartbeat.ts` and nothing else from the worker layer.**

**Where to write the tick.** All six processors share one shape. Insert `recordTick(...)` immediately
before the existing `scheduleTick(POLL_INTERVAL)` line — **outside** the `try/catch`:

```typescript
function scheduleTick(delay: number): void {
  setTimeout(async () => {
    try { /* … existing body … */ }
    catch (error) { log.error("webhook-processor", "Tick error", { err: error }) }

    recordTick("webhook-processor")   // ← outside the try: a tick that ERRORED still ran.
    scheduleTick(POLL_INTERVAL)       // ← existing line
  }, delay)
}
```
Rationale: liveness is "did the tick body complete", not "did it succeed". A processor whose every tick
throws is *alive and broken* — the log stream and Sentry report the breakage; the health check reports
the aliveness. Putting `recordTick` inside the `try` would conflate the two and make a persistently
failing processor read as dead.

**What a subscriber's liveness actually proves — the honest answer.** A subscriber is event-driven and
may legitimately never fire (a quiet CRM emits nothing). So:

| Signal | What it proves | What it CANNOT prove |
|---|---|---|
| `registeredAt` set | `registerXSubscriber()` **executed in this process**. This is the whole 2026-08-08 failure class and the reason the four subscribers currently emit *no boot log at all* — today there is literally no way to tell whether they ran. | That the handler will ever be invoked. |
| `lastTickAt` (= last event handled) | The handler ran at least once, so the subscriber is attached to the **same** `crmBus` instance the emitters use. | Liveness. Absence is not failure. |

Therefore `alive` for a subscriber is `registeredAt !== null`, and `lastTickAt` is reported as
**diagnostic, never as a liveness input**. The diagnostic is sharp: `registeredAt` set **and**
`lastTickAt` still `null` after known CRM writes is the fingerprint of a module-graph split — exactly the
2026-08-16 `actor_kind = system` defect. Say so in the module header so the next reader can use it.

For the audit subscriber, `recordTick("audit-subscriber")` belongs at **handler entry**, next to the
existing `const actor = getCurrentActor()` (`src/lib/events/subscribers/audit.ts:56`) — before the
early return on `Object.keys(changes).length === 0` (`:63`), so a no-op update still counts as the
handler having fired.

---

### Pattern 3: `/api/health` — the route

```typescript
// src/app/api/health/route.ts
import { NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { snapshot } from "@/lib/observability/heartbeat"

// NO `export const dynamic`. Route Handlers are not cached by default in Next 15+
// (https://nextjs.org/docs/app/getting-started/route-handlers), verified empirically against this
// repo's build: `.next/server/app/**` contains exactly one prerendered `.body` file and it is
// `favicon.ico.body`. Adding force-dynamic would be cargo cult.

const DB_PROBE_TIMEOUT_MS = 2_000

async function probeDb(): Promise<{ ok: boolean; latencyMs: number | null }> {
  const t0 = performance.now()
  try {
    // Bounded: an uptime check must get an answer, and a hung pool must read as `ok: false`
    // rather than as a request that never returns.
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, rej) => setTimeout(() => rej(new Error("db probe timeout")), DB_PROBE_TIMEOUT_MS)),
    ])
    return { ok: true, latencyMs: Math.round(performance.now() - t0) }
  } catch {
    // Deliberately NOT logged at error level on every poll — an uptime check hitting a down
    // database would otherwise generate one error line per poll interval forever.
    return { ok: false, latencyMs: null }
  }
}

export async function GET() {
  const dbResult = await probeDb()
  const processors = snapshot()
  const healthy = dbResult.ok && Object.values(processors).every((p) => p.alive)
  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", db: dbResult, processors },
    { status: healthy ? 200 : 503 }
  )
}
```

Three facts that make this safe:

- **`GET` only.** No other verb is exported. Follow the closed-surface convention documented at
  `src/app/api/v1/audit/route.ts:18-27`, whose sibling test asserts the mutating verbs are `undefined`.
- **Unauthenticated by construction.** `src/middleware.ts:8` matcher is
  `["/((?!api|_next/static|_next/image|favicon.ico).*)"]` — it **excludes `/api/*` entirely**, so
  `/api/health` bypasses next-auth without any opt-out. No `withApiAuth` wrapper, so no rate limiting
  either (correct for a poll endpoint).
- **`SELECT 1` is the right probe** (resolving the Claude's-discretion item). It exercises the real
  `postgres.js` pool from `src/db/index.ts:11` — which is what "database connectivity" means for this
  app — and costs ~1 ms. A "more representative" query would count rows, and a count is business data
  on an unauthenticated endpoint (see §Security Domain).

---

### Pattern 4: `instrumentation.ts` — dynamic imports only, and here is why

**Verified:** `instrumentation.ts` is compiled **twice**. `.next/server/instrumentation/middleware-manifest.json`
declares an `instrumentation` entry pointing at `server/edge/chunks/_52aa5b93._.js`, and that edge chunk's
entire `register` is:

```javascript
(globalThis.TURBOPACK||…).push(["chunks/_52aa5b93._.js",210977,e=>{
  "use strict";async function t(){}e.s(["register",()=>t])
}, …]);
```

`async function t(){}` — **empty**. Turbopack statically evaluated `process.env.NEXT_RUNTIME === "nodejs"`
to `false` for the edge build and eliminated the whole body. That only worked because every dependency is
behind `await import()` **inside** the guard. A top-level `import` would be in the edge bundle regardless
of the guard.

```typescript
// instrumentation.ts  (repository ROOT)
//
// NO TOP-LEVEL VALUE IMPORTS IN THIS FILE, EVER.
//
// Next compiles this module for BOTH runtimes. The edge copy is currently
// `async function t(){}` (verified in .next/server/edge/chunks/_52aa5b93._.js) purely because
// every dependency sits behind `await import()` inside the NEXT_RUNTIME guard. A top-level
// `import * as Sentry from "@sentry/nextjs"` — which Sentry's own documented one-liner
// `export const onRequestError = Sentry.captureRequestError` requires — would pull the SDK into
// the EDGE bundle, contradicting the server-only decision from the opposite direction. Type-only
// imports are fine: they are erased.
import type { Instrumentation } from "next"

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // FIRST, before any worker: so a throw during processor startup is captured.
    const { initSentry } = await import("@/lib/observability/sentry")
    initSentry()

    const { startWebhookProcessor } = await import("@/lib/webhook-processor")
    startWebhookProcessor()
    // … the remaining eleven await-import blocks, unchanged in order …
  }
}

/**
 * The ONLY seam in Next.js that sees render, route, action and proxy errors uniformly.
 * `RequestErrorContext.routeType` is 'render' | 'route' | 'action' | 'proxy'
 * (node_modules/next/dist/server/instrumentation/types.d.ts:2-6), so server-action throws and
 * route-handler throws both arrive here — no per-call-site wrapping needed.
 *
 * Guarded and dynamic for the edge reason above. Consequence, stated rather than discovered later:
 * errors thrown INSIDE edge middleware are not captured. Middleware here is only next-auth's
 * `authorized` callback (src/middleware.ts:4, src/auth.config.ts:27-52).
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const { reportRequestError } = await import("@/lib/observability/sentry")
  await reportRequestError(err, request, context)
}
```

`import type { Instrumentation } from "next"` is **VERIFIED** against the installed package:
`node_modules/next/dist/types.d.ts:18` → `export type { Instrumentation } from './server/instrumentation/types'`,
and `node_modules/next/dist/server/instrumentation/types.d.ts:17-19` declares
`namespace Instrumentation { type onRequestError = InstrumentationOnRequestError }`.

> One difference from the published docs worth knowing: the docs' `RequestErrorContext` includes
> `renderType: 'dynamic' | 'dynamic-resume'`; the **installed 16.1.6 types do not**. Type against the
> installed types, not the docs page.

---

### Pattern 5: Sentry — opt-in, and the negative is structurally assertable

```typescript
// src/lib/observability/sentry.ts
//
// Deliberately NOT at the repo root as `sentry.server.config.ts` (Sentry's documented layout).
// Everything in this codebase lives under src/, and the file is reached only by a dynamic import
// from instrumentation.ts, so its location is functionally irrelevant.
import { log } from "@/lib/log"

let enabled = false

/**
 * Returns whether Sentry was initialized. `false` when SENTRY_DSN is unset.
 *
 * The `await import` inside the guard is the point: with no DSN, `@sentry/nextjs` is never even
 * EVALUATED — not initialized-and-quiet, never loaded. That is the strongest form of criterion 2's
 * negative that code can express, and it is directly assertable (see sentry.test.ts).
 */
export async function initSentry(): Promise<boolean> {
  const dsn = process.env["SENTRY_DSN"]
  if (!dsn) {
    log.info("sentry", "SENTRY_DSN unset — error tracking disabled, SDK not loaded")
    return false
  }
  const Sentry = await import("@sentry/nextjs")
  Sentry.init({
    dsn,
    // Tracing is OFF unless tracesSampleRate or tracesSampler is defined
    // [CITED: docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options].
    // Both are omitted on purpose — OpenTelemetry spans are a deferred idea.

    // PII. `sendDefaultPii` defaults to false AND is deprecated (removed in v11); `dataCollection`
    // is the current option and takes precedence. Set explicitly rather than relying on defaults,
    // because "the safe default is not optional" for a CRM.
    dataCollection: {
      userInfo: false,
      httpBodies: [],
      httpHeaders: { deny: ["cookie", "authorization", "forwarded", "-ip", "remote-", "via", "-user"] },
      cookies: { deny: ["*"] },
      urlQueryParams: { deny: ["forwarded", "-ip", "remote-", "via", "-user", "email", "token"] },
    },

    // Defence in depth: dataCollection is Sentry's own filter; beforeSend is ours, and it runs last.
    // Relying on Sentry-side scrubbing would put the data on the wire first.
    beforeSend(event) {
      delete event.user
      if (event.request) {
        delete event.request.data
        delete event.request.cookies
        delete event.request.headers
        if (event.request.url) event.request.url = stripEmails(event.request.url)
      }
      return event
    },
  })
  enabled = true
  return true
}

export async function reportRequestError(
  err: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: { routePath: string; routeType: string }
): Promise<void> {
  // ALWAYS logged, DSN or not. The log stream is the guaranteed channel; Sentry is the optional one.
  log.error("request", "Unhandled server error", {
    err, path: request.path, method: request.method,
    routePath: context.routePath, routeType: context.routeType,
  })
  if (!enabled) return
  const { captureRequestError } = await import("@sentry/nextjs")
  await captureRequestError(err, request, context)
}
```

**Asserting the negative — three layers, each independently meaningful:**

| Layer | Assertion | Why it is not circular |
|---|---|---|
| 1. Init not called | `vi.mock("@sentry/nextjs", () => ({ init: vi.fn(), captureRequestError: vi.fn() }))`; with `SENTRY_DSN` unset, `await initSentry()` returns `false` and `init` has not been called. | Direct test of the guard. |
| 2. Module never loaded | `vi.mock("@sentry/nextjs", () => { throw new Error("must not be imported") })`; `await initSentry()` still resolves `false`. | Proves the `await import()` is genuinely inside the branch — the strongest structural form of "nothing leaves". |
| 3. Nothing on the wire | Stub `globalThis.fetch`; run `reportRequestError(new Error("boom"), …)` with the DSN unset; assert `fetch` was never called with a `sentry.io` host. | This is the criterion's literal claim ("nothing leaves the deployment"), tested at the transport boundary rather than at the API boundary. |

And the positive half of criterion 2: with `SENTRY_DSN` set and the SDK mocked, `reportRequestError`
calls `captureRequestError` exactly once with the original error. Note that `onRequestError` is *only*
reached for genuinely unhandled errors — see §Pitfall 8 on why most of this repo's errors will never
appear in Sentry, by design.

**Wiring points, complete:**

| File | Change |
|---|---|
| `instrumentation.ts` | `await import("@/lib/observability/sentry")` + `initSentry()` as the first statement in the `nodejs` branch; `export const onRequestError` |
| `src/lib/observability/sentry.ts` | new |
| `.env.example` | `SENTRY_DSN=""` with a comment that unset means the SDK never loads |
| `docker-compose.yml` | `- SENTRY_DSN=${SENTRY_DSN}` in the app service's `environment:` list — **mandatory**, see §Pitfall 6 |
| `next.config.ts` | **NO CHANGE.** `withSentryConfig` is deliberately skipped. |
| `Dockerfile` | No Sentry-specific change (`node_modules` is copied wholesale at line 64) |

---

### Pattern 6: The logger

```typescript
// src/lib/log.ts
//
// Zero imports, by design and permanently. This module is reachable from the instrumentation
// module graph, the route graph, the RSC graph and (for eight call sites) the CLIENT bundle. Any
// dependency added here is pulled into all four. The same rule and the same reason as
// src/lib/audit/actor-context.ts:6-9.
//
// It is also the ONLY module exempted from `no-console` in eslint.config.mjs.

type Level = "debug" | "info" | "warn" | "error"
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }

/**
 * Bracket notation, not `process.env.LOG_LEVEL`, so no bundler can statically inline it. Read on
 * every call rather than memoised at module load: tests need `vi.stubEnv("LOG_LEVEL", …)` to take
 * effect, and a property read costs nothing next to JSON.stringify.
 *
 * Default is "info" and that matters for the migration: the existing suite holds 89 console spies,
 * and 11 of them assert on console.log. A default of "warn" would silence every migrated
 * `console.log` → `log.info` and break them all.
 */
function threshold(): number {
  const raw = typeof process !== "undefined" ? process.env["LOG_LEVEL"] : undefined
  if (raw === "silent") return Number.POSITIVE_INFINITY
  return ORDER[(raw as Level) in ORDER ? (raw as Level) : "info"]
}

/**
 * JSON.stringify(new Error("x")) is "{}" — name, message and stack are all non-enumerable. Without
 * this function, migrating the 231 `console.error(msg, err)` call sites silently DESTROYS every
 * stack trace in the codebase while every test still passes. This is the single largest regression
 * risk in Phase 42.
 */
function serialize(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...(value.cause !== undefined && depth < 3 ? { cause: serialize(value.cause, depth + 1) } : {}),
    }
  }
  return value
}

const MAX_LINE = 8_000 // Docker's json-file driver splits log lines at 16 KB; stay well under.

function emit(level: Level, scope: string, msg: string, ctx?: Record<string, unknown>): void {
  if (ORDER[level] < threshold()) return

  let line: string
  try {
    const fields: Record<string, unknown> = { level, scope, msg, ts: new Date().toISOString() }
    for (const [k, v] of Object.entries(ctx ?? {})) fields[k] = serialize(v)
    line = JSON.stringify(fields)
    if (line.length > MAX_LINE) {
      line = JSON.stringify({ level, scope, msg, ts: fields.ts, truncated: true })
    }
  } catch {
    // A logger must never throw. Circular references and BigInt both make JSON.stringify throw,
    // and postgres.js / drizzle error objects are a realistic source of both.
    line = JSON.stringify({ level, scope, msg, ts: new Date().toISOString(), ctxUnserializable: true })
  }

  // DELEGATE TO THE MATCHING CONSOLE METHOD. Not process.stdout.write.
  //
  // Two reasons, both load-bearing. (1) 40 test files hold 89 `vi.spyOn(console, …)` calls
  // (71 error, 11 log, 7 warn); delegating keeps every silencing spy and 86 of 89 assertions
  // working untouched, and reduces the breakage to exactly 3 argument-shape assertions.
  // (2) process.stdout does not exist in the edge runtime or the browser, and this module must
  // stay importable from both.
  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else if (level === "debug") console.debug(line)
  else console.log(line)
}

export const log = {
  debug: (scope: string, msg: string, ctx?: Record<string, unknown>) => emit("debug", scope, msg, ctx),
  info:  (scope: string, msg: string, ctx?: Record<string, unknown>) => emit("info",  scope, msg, ctx),
  warn:  (scope: string, msg: string, ctx?: Record<string, unknown>) => emit("warn",  scope, msg, ctx),
  error: (scope: string, msg: string, ctx?: Record<string, unknown>) => emit("error", scope, msg, ctx),
}
```

**`LOG_LEVEL` values and default** (resolving the Claude's-discretion item): `debug | info | warn | error | silent`,
**default `info`**. An unrecognised value falls back to `info` rather than throwing — a typo in an
operator's `.env` must not take the app down. `silent` exists so a test or a noisy environment can mute
the stream without code changes.

**Runtime, not build-time, env reads — proven.** `Dockerfile:18` sets
`ENV DATABASE_URL="postgresql://dummy@localhost/dummy"` at build time, and the running container
connects to the real database. So server-side `process.env` is not inlined in this build. Bracket
notation is belt-and-braces for the client bundle.

**Migration shape.** Existing:
```typescript
console.error("[trash-prune] Tick error:", error)              // prune.ts:157
```
Becomes:
```typescript
log.error("trash-prune", "Tick error", { err: error })
```
Producing:
```json
{"level":"error","scope":"trash-prune","msg":"Tick error","ts":"2026-08-23T12:00:00.000Z","err":{"name":"Error","message":"…","stack":"…"}}
```

**Scope naming for the ~200 unprefixed sites.** Keep the 22 existing bracket names verbatim (they are
referenced by name in file headers and runbooks). For the rest, derive from the module path with the
`src/` and extension stripped and `/` kept: `src/lib/mutations/deals.ts` → `mutations/deals`,
`src/app/api/v1/deals/[id]/route.ts` → `api/v1/deals`. Mechanical, reviewable, and greppable.

---

### Anti-Patterns to Avoid

- **A module-level `const` registry.** Proven fatal: four `bus.ts` instances in one build. `globalThis` or nothing.
- **Building the health response from the registry's live keys.** A dead `register()` then serialises as `processors: {}`, and `Object.values({}).every(…)` is `true`. Iterate `EXPECTED_WORKERS`.
- **`process.stdout.write` in the logger.** Breaks 89 console spies at once and makes the module non-portable to edge/browser.
- **A top-level `import` of anything in `instrumentation.ts`.** Lands in the edge bundle. Verified: the edge copy is currently empty *only* because there are none.
- **`export const onRequestError = Sentry.captureRequestError`** (Sentry's documented one-liner). Requires the top-level import above. Wrap it instead.
- **`export const dynamic = "force-dynamic"` on the health route.** Route Handlers are uncached by default in Next 15+ (VERIFIED, and confirmed empirically: the only `.body` file in the build is `favicon.ico.body`). Cargo cult.
- **`.catch(log.error)`** as a drop-in for `.catch(console.error)` at `src/lib/api-keys.ts:77`. `log.error(scope, msg, ctx)` would receive the error as `scope`. Must become `.catch((err) => log.error("api-keys", "lastUsedAt update failed", { err }))`.
- **Turning a swallow-and-log catch into a rethrow.** Several have headers explaining why they swallow — `audit.ts:65-70`, `stage-history.ts:19-21`.
- **Reading a subscriber's `let registered` flag from the route.** Per-instance and unreadable across graphs.
- **`recordTick()` inside the `try`.** A persistently failing processor is alive-and-broken, not dead.
- **Logging the DB probe failure at `error` on every poll.** An uptime check against a down database would emit one error line per poll forever.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Mapping a Next.js request error to a Sentry event | A hand-written `onRequestError` → `captureException` adapter (the `@sentry/node` path) | `Sentry.captureRequestError` from `@sentry/nextjs` | Owns `routePath`, `routeType`, header handling and `digest` extraction, and tracks Next's signature across versions. Hand-rolling it means owning that drift. |
| Cross-module-graph singletons | A new mechanism | The `globalThis` pattern at `src/lib/events/bus.ts:24-27` and `src/lib/audit/actor-context.ts:45-50` | Two working precedents in this repo, one with the incident write-up. A third variant is a third thing to get wrong. |
| Error → JSON | `JSON.stringify(err)` | The `serialize()` function above | `JSON.stringify(new Error())` is `{}`. Non-negotiable. |
| Idempotent re-registration guards | A new flag scheme | `_resetForTesting()` + `?? new` on `globalThis`, as the four subscribers do | Established convention; the tests already know the shape. |
| Level filtering | A per-module level map | One `LOG_LEVEL` + `scope` as a queryable JSON field | `scope` in the payload already gives per-subsystem filtering downstream. Per-module config is inventory with no reader. |

**Key insight:** every genuinely hard problem in this phase is a *bundling* problem, not an algorithmic
one. There is no library that solves "my module was instantiated four times by Turbopack" — the fix is
`globalThis`, and it is already in this codebase twice. What a library *would* buy is the Next→Sentry
error adapter, which is exactly why `@sentry/nextjs` beats `@sentry/node` here.

---

## Common Pitfalls

### Pitfall 1: `instrumentation.ts` is compiled for the edge runtime too — HIGH severity
**What goes wrong:** A top-level `import` in `instrumentation.ts` (the logger, or `@sentry/nextjs`) enters the **edge** bundle. Best case the build grows; worst case it fails, because edge has no `node:` builtins.
**Why it happens:** Nothing in the file signals dual compilation. `.next/server/instrumentation/middleware-manifest.json` declares the edge entry, and `.next/server/edge/chunks/_52aa5b93._.js` shows `register` as `async function t(){}` — empty *only* because everything sits behind `await import()` inside `process.env.NEXT_RUNTIME === "nodejs"`.
**How to avoid:** Type-only imports at the top; every value import dynamic and inside the guard, including inside `onRequestError`.
**Warning signs:** `.next/server/edge/chunks/*` grows; a build error naming a Node builtin; `_52aa5b93`-equivalent no longer compiling to an empty function.

### Pitfall 2: `JSON.stringify(new Error())` is `{}` — HIGHEST severity for OBS-01
**What goes wrong:** 231 of 273 sites are `console.error`, and most pass an `Error` as the second argument. A naive JSON logger emits `{"err":{}}` and every stack trace in the codebase disappears. **Every test still passes.**
**Why it happens:** `name`, `message` and `stack` are non-enumerable.
**How to avoid:** The `serialize()` function, plus a `log.test.ts` case asserting a real `Error` round-trips `name`/`message`/`stack`, plus a case for a nested `cause`.
**Warning signs:** `docker compose logs app | grep '"err":{}'` returns anything.

### Pitfall 3: One staleness rule cannot fit a 5-second and a 24-hour worker — HIGH severity
**What goes wrong:** A "stale after 5 minutes" rule marks `audit-prune` and `trash-prune` **permanently dead** — they tick every 24 h (`prune.ts:26`, `prune.ts:38`). The endpoint then reads 503 forever and gets ignored, which is worse than not having it.
**Why it happens:** Four processors tick in 5–300 s; two tick daily. A 17,280× spread.
**How to avoid:** Per-worker `expectedIntervalMs`, passed in by the processor from the same constant its timer uses. `staleAfter = 2 × interval + 60 s`.
**Warning signs:** `audit-prune` or `trash-prune` reporting `alive: false` on a freshly booted, healthy container.

### Pitfall 4: A never-registered worker vanishes instead of reporting dead — HIGHEST severity for OBS-03
**What goes wrong:** If `snapshot()` iterates the registry map, a totally dead `register()` produces `processors: {}`, and `Object.values({}).every(p => p.alive)` is **`true`**. The endpoint returns **200 ok** on exactly the failure it was built for.
**Why it happens:** `Array.prototype.every` on an empty collection is vacuously true.
**How to avoid:** Iterate the hard-coded `EXPECTED_WORKERS` roster. **Write the test that asserts this first**: with a cleared registry, `GET /api/health` must return **503** with all ten workers present and `alive: false`. That single test is the phase's central proof.
**Warning signs:** A `processors` object with fewer than ten keys, ever.

### Pitfall 5: 89 console spies across 40 test files — MEDIUM severity, HIGH blast radius
**What goes wrong:** `process.stdout.write` in the logger breaks all 89 at once (71 `console.error`, 11 `console.log`, 7 `console.warn`). A `LOG_LEVEL` default above `info` breaks the 11 log-spies.
**Why it happens:** The suite silences and asserts on console throughout.
**How to avoid:** Delegate to the matching console method; default `LOG_LEVEL=info`. **Only 3 assertions then need updating**, all of them argument-shape checks:

| File:line | Current assertion |
|---|---|
| `src/lib/events/subscribers/audit.test.ts:284` | `expect(errorSpy).toHaveBeenCalledWith("[audit]", boom)` |
| `src/lib/events/subscribers/stage-history.test.ts:150` | `expect(errorSpy).toHaveBeenCalledWith("[stage-history]", boom)` |
| `src/lib/email/send.test.ts:33` | `expect(warnSpy).toHaveBeenCalledWith(…)` |

The other ~140 assertions are `toHaveBeenCalled` / `toHaveBeenCalledTimes` / `not.toHaveBeenCalled` and survive untouched.
**Warning signs:** A wave that migrates one source file reddening tests in an unrelated directory.

### Pitfall 6: `docker-compose.yml` enumerates env vars explicitly — HIGH severity, trivially missed
**What goes wrong:** `LOG_LEVEL` and `SENTRY_DSN` are set in `.env`, and neither reaches the container. The logger silently uses its default and Sentry silently never initialises. Everything "works"; nothing is configurable.
**Why it happens:** `docker-compose.yml:6-17` lists nine variables one by one. There is no `env_file:` and no pass-through.
**How to avoid:** Add `- LOG_LEVEL=${LOG_LEVEL}` and `- SENTRY_DSN=${SENTRY_DSN}` to the app service, and both to `.env.example`. Verify with `docker compose exec app printenv LOG_LEVEL`.
**Warning signs:** `LOG_LEVEL=debug` in `.env` changing nothing in `docker compose logs app`.

### Pitfall 7: JSON logs break the repo's documented `grep -F '[scope] Starting'` gates — MEDIUM severity
**What goes wrong:** Three places in the source document a verification gate of the form
`docker compose logs app | grep -F '[trash-prune] Starting'`. After migration the line is
`{"level":"info","scope":"trash-prune","msg":"Starting …"}` and **`grep -F '[trash-prune] Starting'` no longer matches.** A verifier following the written instruction concludes the processor is dead.
**Where:**

| File:line | Documented gate |
|---|---|
| `instrumentation.ts:40` | `` `docker compose logs app \| grep -F '[trash-prune] Starting'` `` |
| `src/lib/dedup/scan-cleanup.ts:31` | `` `… \| grep -F '[dedup-scan-cleanup] Starting'` `` |
| `src/lib/dedup/scan-cleanup.test.ts:17` | same string, in the test's header |

**How to avoid:** Update all three comments in the same phase, to `grep -F '"scope":"trash-prune"'` etc.
**This matters most for the two one-shot boot cleanups.** `cleanupStaleImportSessions` and
`cleanupStaleDedupScans` are correctly excluded from `/api/health` (CONTEXT), which means the log-grep
gate is their **only** verification — and `scan-cleanup.ts:18-32` spends fifteen lines arguing for
exactly that gate. Breaking it without replacing it silently removes their only check.
**Warning signs:** A verification step whose grep returns nothing against a container that is provably healthy.

### Pitfall 8: `onRequestError` sees only genuinely unhandled errors — MEDIUM severity, expectation-setting
**What goes wrong:** Someone expects Sentry to surface "the errors we see in the logs". It will not. 231 of 273 call sites are `console.error` inside deliberate swallow-and-log catches, and the repo's server actions return `{ success: false, error }` rather than throwing. None of that reaches `onRequestError`.
**How to avoid:** State the split plainly in the plan: **the logger** is the channel for handled errors; **Sentry** catches the residue that escapes every handler. Criterion 2's test must therefore provoke a *genuinely thrown* error, not a `{ success: false }` return. Do **not** wire `log.error` into `Sentry.captureException` — CONTEXT locks "unhandled server errors only", and coupling them would put the CRM's entire swallowed-error volume on the wire.
**Warning signs:** A test that asserts Sentry capture by calling a server action that returns an error result.

### Pitfall 9: `next dev` forks render workers; `globalThis` heartbeats will not work there — LOW severity
**What goes wrong:** In dev mode Next runs render workers in separate processes, so a heartbeat written by `register()` may be invisible to the route.
**Why it does not bite here:** This project is **Docker-only** and never runs a local dev server (project memory). The standalone container is a single process — verified: `docker compose exec app ps` shows only PID 1 `next-server`.
**How to avoid:** Verify behaviourally in the container, not against `next dev`. Note the dev-mode caveat in the module header.

### Pitfall 10: An unauthenticated endpoint that hits the DB on every request — LOW-MEDIUM severity
**What goes wrong:** An unauthenticated flood forces one `postgres.js` round trip per request and can exhaust the pool (`src/db/index.ts:11` uses `postgres(connectionString)` with default `max: 10`), starving real traffic.
**How to avoid:** The 2 s bounded probe above caps how long a request can hold a connection. Accept and document the surface; the endpoint is behind the operator's own reverse proxy and CONTEXT requires it open. **If a cheap mitigation is wanted:** memoise the probe result for ~1 s — it collapses a flood to one query per second at the cost of up to 1 s of staleness on a genuine DB failure. Recommendation: **ship without the memo**, note the tradeoff, add it if it ever matters. `SELECT 1` is ~1 ms; the complexity is not yet earned.

---

## Code Examples

### The migration, all four level mappings

```typescript
// src/lib/webhook-processor.ts:13  (before)
console.log("[webhook-processor] Starting with initial delay of 5s")
// after
log.info("webhook-processor", "Starting", { initialDelayMs: INITIAL_DELAY })

// src/lib/webhook-processor.ts:43  (before)
console.error("[webhook-processor] Tick error:", error)
// after
log.error("webhook-processor", "Tick error", { err: error })

// src/lib/execution/execution-processor.ts:298  (before)
console.warn(/* … */)
// after
log.warn("execution-processor", "…", { /* … */ })

// src/lib/redis.ts:13  (before)  — one of only two console.info sites
console.info("REDIS_URL not configured - using database sessions only")
// after
log.info("redis", "REDIS_URL not configured — using database sessions only")
```

### The three expression-position call sites (control-flow risk)

Only three of the 273 use `console` outside statement position. Each must keep its arity and its
swallow-ness:

```typescript
// src/lib/api-keys.ts:77 — bare method reference. A drop-in `.catch(log.error)` would pass the
// error as `scope`. Must become an arrow.
db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, apiKey.id)).execute()
  .catch((err) => log.error("api-keys", "lastUsedAt update failed", { err }))

// src/lib/events/subscribers/stage-history.ts:30 — the `.catch` is MANDATORY (see :19-21).
  .catch((err) => log.error("stage-history", "insert failed", { err }))

// src/lib/events/subscribers/audit.ts:87 — likewise (see :65-70).
  .catch((err) => log.error("audit", "insert failed", { err }))
```

### `eslint.config.mjs` — the final gate, exactly two overrides

```javascript
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", ".claude/**"]),
  {
    // Criterion 1's durable half. Empirically: 273 violations in 96 non-test files before
    // migration, 0 after.
    rules: { "no-console": "error" },
  },
  {
    // Exemption 1 of 2: the logger IS the console wrapper.
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

**Verified counts** — `eslint --rule no-console:error` with a temporary flat config, JSON reporter:
**273 errors in 96 non-test files, 21 errors in 12 test files.**

### Reproducing the migration inventory

```bash
# The authoritative per-file worklist (the same command the final gate runs).
npx eslint -f json 2>/dev/null | python3 -c "
import json,sys,re,collections
c=collections.Counter()
for r in json.load(sys.stdin):
    f=r['filePath']
    n=sum(1 for m in r['messages'] if m.get('ruleId')=='no-console')
    if n and not (re.search(r'\.(test|spec)\.(ts|tsx)\$',f) or '/__tests__/' in f): c[f]+=n
print(sum(c.values()),'sites in',len(c),'files')
for f,k in sorted(c.items(), key=lambda x:(-x[1],x[0])): print(k,f)"
```

---

## Migration Surface — the wave-batching worklist

**273 sites / 96 files.** Constraint from CONTEXT: two plans in one wave may not touch the same file.
Every file below appears exactly once, so any partition of these groups parallelises safely.

### By subsystem (natural wave boundaries)

| Sites | Subsystem | Files | Note for the planner |
|---|---|---|---|
| 50 | `src/lib/mutations` | 6 | The densest and the highest-value group — `deals/people/organizations/activities` are 41 of the 50 and all four have `spyOn(console,'error')` suites. Best as its own wave. |
| 43 | `src/app/api` | 24 | 24 small files, mostly 1–2 sites. Highly parallelisable. |
| 28 | `src/lib/dedup` | 9 | 8 dedup test files hold console spies — expect assertion churn. |
| 19 | `src/lib/trash` | 3 | `prune.ts` (8) is also a **heartbeat-writer** file — sequence after the heartbeat wave or accept the overlap. |
| 17 | `src/lib` (top level) | 7 | Includes `webhook-processor.ts` (4) and `email-processor.ts` (4) — **also heartbeat writers**. |
| 14 | `src/lib/execution` | 4 | `execution-processor.ts` (8) — **also a heartbeat writer**. |
| 12 | `src/app/admin` | 4 | |
| 12 | `src/app/duplicates` | 4 | |
| 10 | `src/lib/views` | 4 | |
| 9 | `src/lib/audit` | 4 | `prune.ts` (4) — **also a heartbeat writer**. |
| 8 | `src/app/import` | 1 | Single file, 8 sites. |
| 7 | `src/lib/import` | 4 | |
| 7 | `src/lib/triggers` | 3 | `schedule-processor.ts` (5) — **also a heartbeat writer**. |
| 6 | `src/components/custom-fields` | 3 | **All three are `"use client"`** — see §Client Components. |
| 6 | `src/lib/api` | 4 | |
| 4 | `src/app/notes` | 1 | |
| 4 | `src/lib/email` | 3 | `send.test.ts:33` holds one of the 3 shape assertions. |
| 3 | `src/app/activities` | 1 | |
| 3 | `src/lib/events` | 3 | All three subscribers — **also heartbeat writers**, and 2 of the 3 shape assertions live here. |
| 2 | `src/actions` | 1 | |
| 8 | 8 singleton files | 8 | `app/{deals,organizations,people,trash}/actions.ts`, `app/workflows/[id]/runs/[runId]/page.tsx`, `components/global-search`, `components/timeline`, `lib/{export,notes}` |

**File-collision warning for the planner:** ten files are *both* migration targets *and* heartbeat-wiring
targets — `webhook-processor.ts`, `email-processor.ts`, `triggers/schedule-processor.ts`,
`execution/execution-processor.ts`, `audit/prune.ts`, `trash/prune.ts`, and the four
`events/subscribers/*.ts`. Under the "no two plans in a wave touch the same file" rule, the cleanest
sequencing is: **one wave that does the heartbeat wiring and the log migration for those ten files
together** (they are small edits in the same functions), with the other 86 files batched freely around it.

### Top 12 files by density

| Sites | File |
|---|---|
| 11 | `src/lib/mutations/deals.ts` |
| 10 | `src/lib/mutations/activities.ts` |
| 10 | `src/lib/mutations/organizations.ts` |
| 10 | `src/lib/mutations/people.ts` |
| 8 | `src/app/admin/pipelines/actions.ts` |
| 8 | `src/app/import/actions.ts` |
| 8 | `src/lib/execution/execution-processor.ts` |
| 8 | `src/lib/trash/prune.ts` |
| 7 | `src/lib/dedup/scan-state.ts` |
| 7 | `src/lib/trash/queries.ts` |
| 6 | `src/lib/dedup/scan-engine.ts` |
| 5 | `src/app/api/v1/deals/[id]/route.ts`, `src/app/duplicates/actions.ts`, `src/lib/dedup/identity-settings.ts`, `src/lib/mutations/notes.ts`, `src/lib/triggers/schedule-processor.ts`, `src/lib/views/actions.ts` |

### Files where migration risks changing control flow

**Three, and only three** — all identified above (`api-keys.ts:77`, `stage-history.ts:30`,
`audit.ts:87`). Every other site is a plain expression statement. Verified by grepping for `console` in
arrow-body, `||`, `&&`, `return`, ternary and bare-callback positions:

```bash
grep -rnE 'console\.[a-z]+' src/ --include=*.ts --include=*.tsx \
  | grep -vE '\.(test|spec)\.|/__tests__/' \
  | grep -E '(=>\s*console\.|\|\|\s*console\.|&&\s*console\.|return console\.|\(console\.[a-z]+\)|\?\s*console\.)'
```

Separately, the 231 `console.error` sites in swallow-and-log catches must keep their `catch` bodies
swallowing. Several carry headers explaining why — `audit.ts:65-70`, `stage-history.ts:19-21`,
`prune.ts:60-70` — read the header before touching the catch.

### Edge-runtime and middleware call sites: **NONE**

Answering research question 3 directly, with negative claims verified rather than assumed:

| Check | Result | Method |
|---|---|---|
| Root `middleware.ts` | **absent** | `test -f middleware.ts` |
| `src/middleware.ts` | **exists, 9 lines, ZERO `console.*`** | full file read |
| `src/auth.config.ts` (the only module middleware imports) | **ZERO `console.*`** | full file read; header already says "Must NOT import argon2 or any native Node.js module" |
| `export const runtime = "edge"` anywhere in `src/` | **zero occurrences** | `grep -rn 'export const runtime' src/` → empty |
| Edge route handlers in the build | **zero** | `.next/server/middleware-manifest.json` → `"functions": {}` |
| What is in the edge graph | **middleware + an empty `instrumentation.register`, nothing else** | `.next/server/edge/chunks/` |

**What the logger must avoid, and it is a short list:** no `node:` imports, no `process.stdout`, no
`fs`, no `Buffer`. `console.*`, `JSON.stringify`, `Date` and a guarded `process.env` read are available
in every runtime this app has. The design above already satisfies all of it — which is also why
`src/lib/log.ts` can safely be imported from `src/middleware.ts` in some future phase without a rewrite.

### Client components: **8 sites in 5 files**

Answering research question 4. Client-directive check (`grep -qE '^\s*["'\'']use client'`) across all 96 files:

| Sites | File | What it logs |
|---|---|---|
| 3 | `src/components/custom-fields/lookup-field.tsx:90,131,143` | `console.error('Search failed:' / 'Failed to save:' / 'Failed to clear:', error)` |
| 2 | `src/components/custom-fields/custom-fields-section.tsx:75,80` | `console.error('Failed to save field:', …)` |
| 1 | `src/components/custom-fields/file-field.tsx:138` | `console.error('Upload error:', error)` |
| 1 | `src/components/global-search/global-search.tsx:49` | `console.error("Search failed:", error)` |
| 1 | `src/app/admin/import/pipedrive-api/pipedrive-api-wizard.tsx:76` | `console.error("Failed to fetch counts:", result.error)` |

Two near-misses worth stating so nobody mis-sorts them:

- `src/app/workflows/[id]/edit/components/config-forms/transform-config.tsx:45` is a `"use client"` file, but its `console.log(...)` is **JSX text inside a `<code>` element** — user-facing UI copy. `no-console` does not flag it (confirmed: the file is absent from the 96). **Do not touch.**
- `src/components/timeline/record-timeline.tsx:111` is a `.tsx` with a `console.error`, but its header states in capitals that it **IS A SERVER COMPONENT** and must not gain a client directive. Migrate normally.

**Recommendation for criterion 1 (this is a judgment call; recording it as a recommendation with rationale per the autonomous-run instruction):**

**Migrate all 8, do not exempt them.** The logger above is genuinely environment-agnostic — `console.*` + `JSON.stringify` + `Date`, zero imports — so `log.error("custom-fields/lookup", "Search failed", { err })` works identically in the browser. Emit **JSON in both environments, one code path, no `typeof window` branch.**

Why this over the alternatives:

| Option | Verdict |
|---|---|
| **(chosen)** Migrate all 8; single JSON code path | Criterion 1 is satisfied *literally*, with exactly **two** eslint overrides (`log.ts` and test globs). The flip's diff is then the clean, auditable proof CONTEXT asks for. `log.ts` adds ~1 KB to the client bundle for 5 components and no dependencies. All 8 sites are developer-diagnostic `console.error` in catch blocks — a JSON blob there is acceptable, and it stays greppable. |
| An eslint override listing the 5 client paths | Rejected. It satisfies criterion 1 by carving a hole in it, and the 6th client component next phase reopens the hole. Also inconsistent with the repo's convention of only 10 `eslint-disable` comments in the entire tree. |
| An override on `**/*.tsx` | Rejected outright — it would exempt server components too, including `record-timeline.tsx`. |
| An isomorphic logger with a `typeof window` branch emitting human-readable output in the browser | Rejected as unearned complexity: two output contracts, two code paths, two sets of tests, for 8 diagnostic call sites. |

---

## Standalone Build Path — answering research question 6 with build artifacts

**The question:** does the health endpoint's own code survive `Dockerfile:24`'s `2>/dev/null || true` build path, and does anything it depends on risk being dropped the same way?

**Answer: the route is safe; every heartbeat *writer* is in the fragile set. That asymmetry is what makes the endpoint a valid detector.**

| Check | Result |
|---|---|
| API route handlers in `.next/server/app/api/**/route.js` | **51** |
| Same, in `.next/standalone/.next/server/app/api/**/route.js` | **51** — every route survives standalone tracing |
| Chunks in `.next/server/chunks/*.js` | 155 |
| Chunks in `.next/standalone/.next/server/chunks/*.js` | **134** |
| **Missing from standalone** | **21 chunks — and they are exactly the instrumentation graph** |
| `.next/standalone/.next/server/instrumentation.js` | **ABSENT** (this local build had no Dockerfile step) — the bug, reproduced |
| Route chunks spot-checked in standalone (`src_lib_ada943e9._.js`, `_8a10d29f._.js`) | **PRESENT** |
| `instrumentation.js.nft.json` | 61 files, 25 of them chunks — the Dockerfile's `node -e` walk (lines 26-41) copies them |
| The 21 missing chunks vs. the nft chunk list | **exact match** (25 nft chunks − `[turbopack]_runtime.js` − 3 `src_messages_*` chunks that pages also need = 21) |

So:

- **The health route cannot be the silently-dropped thing.** Next's standalone tracing handles `app/api/**` correctly; all 51 routes and their chunks are present without any Dockerfile help.
- **All ten heartbeat writers live in the 21 dropped chunks** — `[root-of-the-server]__0946962d` (webhook subscriber), `__ae00de5f` (workflow-trigger), `__67f29cf5` (stage-history), `__d3f92449` (audit subscriber), `__6058fe74` (execution-processor), `__546af60e` (trash-prune), `__95145359` (audit-prune), `src_lib_webhook-processor_ts_cbd13318`, `src_lib_email-processor_ts_aef1a19b`, `__cf3cd726` (schedule-processor).
- **Therefore, if `Dockerfile:24-41` silently fails, the route is present and every writer is absent, and the endpoint returns 503 with ten dead workers.** Detector and detected are on opposite sides of the fragility. Design confirmed correct.
- **Adding `src/lib/observability/heartbeat.ts` and `src/lib/log.ts` does not change the risk.** Both get chunks in the instrumentation graph, both are enumerated in the regenerated `instrumentation.js.nft.json`, and the node walk copies them. The route reads its own copy of `heartbeat.ts` from standalone tracing. Both copies address the same `globalThis` key.
- **`@sentry/nextjs` is immune to this class entirely**, because `Dockerfile:64` copies `node_modules` wholesale rather than relying on traced output.

### Recommended Dockerfile hardening — assert the postcondition, not the copy

`Dockerfile:24-25` currently reads:
```dockerfile
RUN cp .next/server/instrumentation.js .next/standalone/.next/server/instrumentation.js 2>/dev/null || true && \
    cp .next/server/instrumentation.js.map … 2>/dev/null || true && \
    if [ -f .next/server/instrumentation.js.nft.json ]; then … fi
```
Shell precedence makes the whole `RUN` succeed unconditionally. That is the silent-drop mechanism.

CONTEXT says "do not make it worse". It does not forbid making it better, and the fix is small and cannot break a currently-working build:

```dockerfile
# Copy if missing, then ASSERT THE POSTCONDITION. The old form's `|| true` made a failed copy
# indistinguishable from a successful one — the exact mechanism that killed all four processors in
# production on 2026-08-08 while every test passed. Asserting the file's presence (rather than the
# copy's exit status) also stays correct if a future Next version fixes standalone tracing and
# emits the file into .next/standalone itself.
RUN test -f .next/standalone/.next/server/instrumentation.js \
      || cp .next/server/instrumentation.js .next/standalone/.next/server/instrumentation.js; \
    test -f .next/standalone/.next/server/instrumentation.js \
      || (echo "FATAL: instrumentation.js missing from standalone output" >&2; exit 1)
```
Keep `|| true` on the `.map` copy — source maps are genuinely optional. **Recommendation: include this as
a task, flagged as touching the build so it gets a build-and-boot verification.** It converts the phase's
motivating failure from silent to loud at build time, complementing (not replacing) the runtime detection
the endpoint provides.

---

## Runtime State Inventory

Included because the `console.*` migration is a 273-site mechanical refactor whose blast radius extends past the source tree.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | **None.** No database table, column, or JSONB payload stores a log line, a log level, a processor name, or a health status. Verified: no `LOG_LEVEL` / `SENTRY` string anywhere in the repo outside `node_modules`; `src/db/schema/` has no logging or heartbeat table; heartbeats are in-memory by locked decision. | none |
| **Live service config** | **None.** No external observability service is configured today (no Sentry project, no log shipper, no APM). Sentry is opt-in and inert until an operator supplies `SENTRY_DSN`. The postgres container's own `healthcheck` (`docker-compose.yml:33-37`) is `pg_isready` and is unrelated to `/api/health`. **The `app` service has NO healthcheck** — adding one is optional and out of scope, but note that if it were added it must not be so aggressive that it restart-loops on a legitimately degraded 503. | none required; note the app-healthcheck absence |
| **OS-registered state** | **None.** No cron, systemd unit, launchd plist, pm2 process or Task Scheduler entry. Every recurring job is an in-process `setTimeout` chain started by `register()` (all six verified by reading the files). Nothing outside the container knows a processor's name. | none |
| **Secrets and env vars** | **Two NEW variables, both additive: `LOG_LEVEL` and `SENTRY_DSN`.** Neither exists today (`grep -rn "LOG_LEVEL\|SENTRY"` → zero hits outside `node_modules`). No existing variable is renamed, so no code that reads env breaks. **`docker-compose.yml:6-17` enumerates its nine variables explicitly with no `env_file:`, so both new names MUST be added there or they never reach the container** (Pitfall 6). `.env.example` also needs both. `.env` / `.env.local` are gitignored — the operator adds them by hand. | **code edit** (docker-compose.yml, .env.example) |
| **Build artifacts / installed packages** | **The local `.next/` (built 2026-08-21) and the running container image (built 2026-08-22, Phase 41 code) both go stale** the moment `instrumentation.ts` changes. Turbopack chunk hashes change, `instrumentation.js.nft.json` is regenerated, and the 21-chunk copy set shifts. **The verification MUST be a fresh `docker compose build` + `up -d`, never a `docker compose restart`** — a restart re-runs the stale image, which is exactly the 2026-08-22 Phase 41 incident where "the schema advanced while the code did not". Also: `npm install @sentry/nextjs` adds 104 packages and mutates `package-lock.json`, so the Docker build must run after the lockfile is committed (`Dockerfile:7` uses `npm install --legacy-peer-deps`; CI uses `npm ci`, which fails on a lockfile/manifest mismatch). | **rebuild required**; commit the lockfile before the image build |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker + compose | All verification (project mandates Docker-only, no local dev server) | ✓ | app up 12 h, postgres up 2 w (healthy) | none needed |
| `docker` without sudo | Every verification command | ✓ | user in `docker` group; `docker compose ps` works bare | — |
| App container | Behavioural verification of `/api/health` and the log stream | ✓ | `localhost:3001` → HTTP 200; PID 1 `next-server`; **Next.js 16.1.6**; `register()` confirmed running (7 processor boot lines in `docker compose logs`) | — |
| PostgreSQL | `SELECT 1` probe | ✓ | `postgres:16-alpine`, `localhost:5433`, healthcheck passing | — |
| Node.js | Build, tests | ✓ | host v24.13.1; **container `node:20-alpine`**; CI node 24 | — |
| npm | `@sentry/nextjs` install | ✓ | 11.10.0 host (container 10.8.2) | — |
| `slopcheck` | Package legitimacy gate | ✓ | `/home/pedro/.local/bin/slopcheck` — **but `install` mutates package.json**, see audit note | `slopcheck scan` for check-only |
| `ctx7` | Documentation lookup | ✓ | `~/.nvm/versions/node/v24.13.1/bin/ctx7` | WebFetch |
| Sentry account / DSN | Criterion 2's **positive** half ("with it set, an unhandled server error appears in the tracker") | ✗ | — | **See below.** |
| `SENTRY_AUTH_TOKEN` + org/project | Source-map upload | ✗ | — | Not needed — `withSentryConfig` is deliberately skipped. |

**Missing dependencies with no fallback:** none that block execution.

**Missing dependency with a fallback — the one that needs the planner's attention:** there is **no Sentry
DSN available in this environment**, so criterion 2's positive half cannot be verified end-to-end against
the real sentry.io. The fallback, which is the right approach anyway:

1. **Unit level (fully automatable, no account):** with the SDK mocked and `SENTRY_DSN` set, assert `captureRequestError` is called exactly once with the original error. This proves the *wiring*.
2. **Transport level (fully automatable, no account):** set `SENTRY_DSN` to a syntactically valid DSN pointing at `http://localhost:9999/1`, stub or observe `fetch`, and assert an outbound envelope request is attempted. This proves the SDK *initialised and tried to send* — the strongest claim obtainable without an account, and the exact mirror of the negative test.
3. **Real-DSN verification:** a `checkpoint:human-verify` task. Only an operator with a Sentry project can complete it.

Recommend the plan carry all three, with (3) explicitly a human checkpoint rather than an automated step.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | **vitest 4.0.18** — three separate projects |
| Config files | `vitest.config.ts` (base, `environment: 'node'`, `globals: false`), `vitest.rsc.config.ts` (`react-server` condition), `vitest.db.config.ts` (real PostgreSQL, **not run by `npm test`**) |
| Quick run command | `npx vitest run <path>` (e.g. `npx vitest run src/lib/log.test.ts`) |
| Full suite command | `npm test` → `vitest run && vitest run --config vitest.rsc.config.ts` |
| Measured baseline (2026-08-23) | **925/925 suites, 4406 passed, 32 skipped, 0 failed**; `tsc --noEmit` 0 errors; `eslint` 0 errors / 124 warnings |
| Setup files | **none** — `globals: false`, so every test imports `describe/it/expect/vi` explicitly |
| Route-test pattern | Import the route module, `vi.mock("@/db")`, call the handler with a `NextRequest`. Model: `src/app/api/v1/audit/__tests__/route.test.ts` |
| CI | `.github/workflows/ci.yml` — `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, each with `if: ${{ !cancelled() }}` so all three gates report |

### Phase Requirements → Test Map

| Req | Behavior | Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OBS-01 | Line shape is `{level,scope,msg,ts,...ctx}`, single-line, valid JSON | unit | `npx vitest run src/lib/log.test.ts` | ❌ Wave 0 |
| OBS-01 | `LOG_LEVEL` gates emission; default is `info`; unknown value falls back to `info`; `silent` mutes all | unit | same | ❌ Wave 0 |
| OBS-01 | **An `Error` in `ctx` round-trips `name`, `message` and `stack`** (Pitfall 2) | unit | same | ❌ Wave 0 |
| OBS-01 | A `cause` chain serialises; a circular ref does not throw; an oversized line truncates | unit | same | ❌ Wave 0 |
| OBS-01 | Each level delegates to the matching `console` method (Pitfall 5) | unit | same | ❌ Wave 0 |
| OBS-01 | Swallow-and-log catches still swallow after migration | unit | existing suites, unchanged — `npx vitest run src/lib/events/subscribers src/lib/mutations` | ✅ exists |
| OBS-01 | **Zero bare `console.*` in non-test source** — the phase's final gate | lint | `npm run lint` (0 errors, with `no-console: "error"`) | ✅ config exists, rule to add |
| OBS-02 | DSN unset → `initSentry()` returns `false` and `init` is never called | unit | `npx vitest run src/lib/observability/sentry.test.ts` | ❌ Wave 0 |
| OBS-02 | **DSN unset → `@sentry/nextjs` is never even imported** (mock factory throws) | unit | same | ❌ Wave 0 |
| OBS-02 | DSN unset → `reportRequestError` performs no outbound `fetch` | unit | same | ❌ Wave 0 |
| OBS-02 | DSN set → `captureRequestError` called once with the original error | unit | same | ❌ Wave 0 |
| OBS-02 | `beforeSend` strips `event.user`, `request.data`, `request.cookies`, `request.headers` | unit | same | ❌ Wave 0 |
| OBS-02 | `onRequestError` returns early when `NEXT_RUNTIME !== "nodejs"` | unit | `npx vitest run instrumentation.test.ts` *(new; note `vitest.config.ts` `include` is anchored at `src/**` — a root-level test file needs the include widened or the test placed under `src/`)* | ❌ Wave 0 |
| OBS-03 | Healthy: 200, `status:"ok"`, all ten workers `alive:true` | unit | `npx vitest run "src/app/api/health/__tests__/route.test.ts"` | ❌ Wave 0 |
| OBS-03 | **Empty registry → 503 with all ten workers present and `alive:false`** (Pitfall 4 — the phase's central proof) | unit | same | ❌ Wave 0 |
| OBS-03 | DB probe rejects → `db.ok:false`, `latencyMs:null`, 503 | unit | same | ❌ Wave 0 |
| OBS-03 | DB probe hangs → bounded at 2 s, `ok:false` (fake timers) | unit | same | ❌ Wave 0 |
| OBS-03 | One dead worker → 503 while the other nine stay `alive:true` | unit | same | ❌ Wave 0 |
| OBS-03 | Response body carries no version string, connection detail or count | unit | same | ❌ Wave 0 |
| OBS-03 | Only `GET` is exported (`POST`/`PUT`/`PATCH`/`DELETE` are `undefined`) | unit | same | ❌ Wave 0 |
| OBS-03 | Per-worker staleness math: daily pruners stay alive across 24 h; execution-processor dies after 70 s | unit | `npx vitest run src/lib/observability/heartbeat.test.ts` | ❌ Wave 0 |
| OBS-03 | Subscriber `alive` derives from registration, not from `lastTickAt` | unit | same | ❌ Wave 0 |
| OBS-03 | Registry survives a simulated second module instantiation (write via one import, read via another; assert the `globalThis` key) | unit | same | ❌ Wave 0 |
| OBS-01/02/03 | Whole phase, in the container | **manual-only** | `docker compose build && docker compose up -d`, then `curl -sS -o /dev/null -w '%{http_code}' localhost:3001/api/health` → **200**; `curl -s localhost:3001/api/health \| python3 -m json.tool` → ten workers, all `alive:true`; `docker compose logs app \| tail -30` → every line valid JSON with a `scope` | ❌ Wave 0 |

**Justification for the one manual-only item:** vitest has a **single module registry**, so it structurally
cannot reproduce the four-instance module-graph split that this phase's central risk depends on. The
`actor-context.ts:38-39` header says exactly this: *"every unit test passes because vitest has a single
module registry."* The container is the only place the real thing is observable. The unit test asserting
the `globalThis` key is a proxy, and the honest thing is to label it as one.

**Explicitly NOT a valid verification:** `docker compose logs app | grep -F '[trash-prune] Starting'`.
It is vacuous by CONTEXT's own argument (any build, including a months-old one, emits it), and after this
phase the string does not exist. `/api/health` replaces it.

**Also not valid:** `docker compose restart`. Use `build` + `up -d` — a restart re-runs the stale image
(the 2026-08-22 Phase 41 incident).

### Sampling Rate

- **Per task commit:** `npx vitest run <the touched test files>` + `npx tsc --noEmit`
- **Per wave merge:** `npm test` (both projects) + `npm run lint`; assert `no-console` error count is monotonically decreasing toward zero
- **Phase gate:** `npm run typecheck` (0) + `npm run lint` (**0 errors** with `no-console: "error"`) + `npm test` (**≥ 4406 passed, 0 failed**) + a fresh `docker compose build && up -d` with `/api/health` returning 200 and ten live workers

### Wave 0 Gaps

- [ ] `src/lib/log.test.ts` — covers OBS-01 (shape, levels, **Error serialization**, console delegation, throw-safety)
- [ ] `src/lib/observability/heartbeat.test.ts` — covers OBS-03 (per-worker staleness, subscriber semantics, `globalThis` survival, `_resetForTesting`)
- [ ] `src/lib/observability/sentry.test.ts` — covers OBS-02 (all three negative layers + the positive)
- [ ] `src/app/api/health/__tests__/route.test.ts` — covers OBS-03 (200/503, shape, **empty-registry ⇒ 503**, bounded probe, closed verb surface)
- [ ] A test for `onRequestError`'s runtime guard — **decide its location first**: `vitest.config.ts:9` anchors `include` at `src/**`, so a root-level `instrumentation.test.ts` will not be collected. Either widen the include or (preferred, no config change) test the guard's logic inside `src/lib/observability/sentry.test.ts` and keep `instrumentation.ts` a thin delegator.
- [ ] Update the **3 argument-shape assertions** listed in Pitfall 5
- [ ] Update the **3 documented log-grep gates** listed in Pitfall 7
- [ ] Framework install: **none** — vitest 4.0.18 already covers everything

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | **no** | `/api/health` is unauthenticated by locked decision, and by construction: `src/middleware.ts:8`'s matcher excludes `/api/*`. No credential is read, issued or verified. |
| V3 Session Management | **no** | No session is created or read. No cookie is set. |
| V4 Access Control | **yes** | The control is *payload minimisation*, not authorization. The response contains only `status`, `db.ok`, `db.latencyMs`, and ten `{alive, lastTickAt}` pairs — no version string, no connection string, no hostname, no row counts. This is why `SELECT 1` beats a "more representative" query: a count is business data on an open endpoint. Verified by test ("carries no version string, connection detail or count"). |
| V5 Input Validation | **yes** | `/api/health` **accepts no input at all** — no query params, no body, no headers read. The strongest possible validation posture, and it should be asserted (the handler signature takes no `request`). |
| V6 Cryptography | **no** | No crypto in scope. `SENTRY_DSN` is a credential but is only read from env and handed to the SDK; it must never be logged or echoed in the health response. |
| V7 Error Handling & Logging | **yes — the core of this phase** | Structured logging with explicit level control (`log.ts`); errors serialized as `{name, message, stack}`; **the logger must never throw** (try/catch fallback); log lines capped at 8 KB so Docker's 16 KB split cannot corrupt downstream JSON parsing. |
| V8 Data Protection / Privacy | **yes — this is a CRM** | Sentry PII scrubbing is defence-in-depth: `dataCollection: { userInfo: false, httpBodies: [], httpHeaders: {deny}, cookies: {deny} }` (Sentry's filter) **plus** a `beforeSend` that deletes `event.user`, `request.data`, `request.cookies`, `request.headers` (ours, running last). `sendDefaultPii` already defaults to `false` and is deprecated (removed in v11) — do not rely on it. Independently: **the log stream itself is a PII surface.** Migrating a `console.error(msg, err)` that today prints a truncated `util.inspect` view to a JSON logger that serializes the whole `ctx` object can *newly* expose row contents. Two precedents in the source already require counts-only logging: `src/lib/dedup/scan-cleanup.ts:36` ("Logs carry counts only, never row contents (T-37-09)"). **The migration must not widen what is logged** — pass the same values, restructured, never "while I'm here, add the record". |
| V14 Configuration | **yes** | `SENTRY_DSN` unset ⇒ SDK never loaded (asserted three ways). Both new env vars documented in `.env.example`. `LOG_LEVEL` fails safe: an unknown value falls back to `info` rather than throwing at boot. |

### Known Threat Patterns for Next.js 16 / self-hosted Docker CRM

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Information disclosure via an open health endpoint (version strings, connection details, business counts) | **Information disclosure** | Minimal fixed payload; `SELECT 1` not a count; asserted by test |
| DB-pool exhaustion by flooding an unauthenticated DB-touching endpoint | **Denial of service** | 2 s bounded probe caps connection hold time; documented residual risk; optional 1 s memo (§Pitfall 10) |
| Secret leakage into logs (`DATABASE_URL`, `AUTH_SECRET`, `INTERNAL_SECRET`, `SENTRY_DSN`) | **Information disclosure** | Never log `process.env` wholesale; never put a raw `Request` in `ctx`; `ctx` values are chosen explicitly, one at a time |
| PII exfiltration to a third party via the error tracker | **Information disclosure** | Opt-in by env var; scrub client-side *before* send; `beforeSend` runs last; unset ⇒ SDK never loaded |
| Log injection / forged log lines via newline-bearing user input | **Tampering / Repudiation** | Inherently mitigated: `JSON.stringify` escapes `\n`, so a newline in user data cannot forge a line boundary. **This is a real improvement over today's `console.error(msg, userInput)`.** Worth a test. |
| Log-line corruption breaking downstream parsing | **Tampering** | 8 KB cap, under Docker's 16 KB json-file split threshold |
| Health endpoint used as an unauthenticated liveness oracle for reconnaissance | **Information disclosure** | Accepted: the response reveals only that ten named background jobs exist. No mitigation warranted; CONTEXT requires the endpoint open. |
| Silent build regression dropping `instrumentation.js` | **Denial of service** (of the background jobs) | `/api/health` is the runtime detector; the recommended `Dockerfile` postcondition assertion is the build-time one |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact on this phase |
|--------------|------------------|--------------|--------|
| `experimental.instrumentationHook` in `next.config` | `instrumentation.ts` is stable, no flag needed | Next 15 | `next.config.ts` needs no instrumentation flag — confirmed absent and correct |
| Route Handler `GET` cached by default | **Not cached by default** `[CITED: nextjs.org/docs/app/getting-started/route-handlers]` | Next 15 | No `export const dynamic` on `/api/health`. Confirmed empirically: the only `.body` in the build is `favicon.ico.body` |
| No hook for server errors; per-route try/catch | **`onRequestError`** in `instrumentation.ts`, covering `routeType: 'render' \| 'route' \| 'action' \| 'proxy'` | Next 15 (Sentry support ≥ 8.28.0) | The single seam for criterion 2. VERIFIED in installed 16.1.6 types |
| Webpack builds; Sentry injects at build time | **Turbopack** is the Next 16 build default; Sentry relies on Next's own instrumentation plumbing instead of build-time injection, and `excludeServerRoutes` / `unstable_sentryWebpackPluginOptions` are unsupported `[CITED: docs.sentry.io/…/manual-setup/webpack-setup]` | Next 16 | This repo **is** on Turbopack (`.next/server/chunks/[turbopack]_runtime.js`). We use neither unsupported option. Source-map upload would need a post-build step, which is why `withSentryConfig` is skipped. |
| `sendDefaultPii: boolean` | **`dataCollection: {…}`**; `sendDefaultPii` deprecated, removed in v11 `[CITED: docs.sentry.io/…/configuration/options]` | `@sentry/*` v10 | Use `dataCollection`. Writing `sendDefaultPii: false` would be both redundant (it is the default) and on a removal path. |
| `@sentry/node` standalone SDK | v10 `@sentry/node` is **built on OpenTelemetry** and pulls `@opentelemetry/*` (22 MB measured) plus `import-in-the-middle` | `@sentry/*` v8 | Neutralises the "avoid OTel" argument for `@sentry/node`, because `@sentry/nextjs` depends on `@sentry/node` anyway. Note Next 16 already externalises `import-in-the-middle` and `require-in-the-middle` by default (`node_modules/next/dist/lib/server-external-packages.jsonc`). |
| Tracing on by default | Tracing requires `tracesSampleRate` **or** `tracesSampler` to be defined `[CITED: docs.sentry.io/…/configuration/options]` | `@sentry/*` v8 | Omitting both is sufficient to honour the "no tracing / no OTel spans" deferral. No extra config needed. |

**Deprecated / outdated:**
- `sendDefaultPii` — use `dataCollection`.
- `excludeServerRoutes`, `unstable_sentryWebpackPluginOptions` — unsupported under Turbopack.
- The repo's own `grep -F '[scope] Starting'` gates — vacuous by CONTEXT's argument, and broken by this phase. `/api/health` supersedes them for the six processors; the two one-shot cleanups need their gate string updated (Pitfall 7).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@sentry/nextjs` server-side error capture works **without** `withSentryConfig` wrapping `next.config.ts`. Sentry's docs consistently describe `withSentryConfig` as enabling source-map upload, `tunnelRoute` and client bundling — and never state it is required — but they also never state it is optional. | Standard Stack / Alternatives | MEDIUM. If a build warning or a non-functional SDK appears, the fix is to wrap: `export default withSentryConfig(withNextIntl(nextConfig), { silent: true })` with no org/project/authToken. **Mitigation: make the first Sentry task's verification a real `docker compose build` and check the build output for Sentry warnings.** |
| A2 | Sentry's "Turbopack relies on Next.js telemetry for auto-instrumentation" does **not** mean the anonymous-usage telemetry that `Dockerfile:16,48` disables via `NEXT_TELEMETRY_DISABLED=1`. | State of the Art | LOW. Our capture path is the **explicit** `export const onRequestError` in `instrumentation.ts`, which depends on no auto-instrumentation whatsoever. Even if the reading is wrong, criterion 2 is unaffected. |
| A3 | Docker's `json-file` log driver splits lines at 16 KB, so an 8 KB cap is safe. | Logger design | LOW. Corroborated by Docker's own docs and multiple moby issues, but not measured in this container. If wrong in either direction, the 8 KB cap is still a reasonable hygiene limit. |
| A4 | `staleAfter = 2 × interval + 60 s` is the right liveness tolerance. | Heartbeat Registry | LOW. A judgment call, not a discovered fact. Too tight ⇒ false 503s on a loaded host; too loose ⇒ slow detection. Two missed ticks plus a minute is conventional. Easy to tune later; the constants are in one place. |
| A5 | Migrating all 8 client-component sites (rather than exempting them) is the right reading of criterion 1. | Client Components | LOW-MEDIUM. Reversible in one commit either way. The recommendation and both alternatives are documented; the planner or a human can pick differently without any rework of the logger. |
| A6 | The health endpoint should not memoise its DB probe. | Pitfall 10 | LOW. Purely operational. If polling ever becomes a problem, a 1 s memo is a three-line addition. |
| A7 | Deriving `scope` from the module path for the ~200 unprefixed sites (`src/lib/mutations/deals.ts` → `mutations/deals`) is the right convention. | Logger / Migration | LOW. Mechanical and consistent; CONTEXT left the derivation unspecified because it assumed most sites already had prefixes (only 26% do). |
| A8 | Recommending a `Dockerfile:24` hardening does not violate CONTEXT's "do not make it worse". | Standalone Build Path | LOW. It is strictly an improvement (assert the postcondition, cannot break a working build), but it does touch the build, so it is flagged for a build-and-boot verification and can be dropped without affecting any criterion. |

---

## Open Questions (ALL RESOLVED — see 42-CONTEXT.md amendments)

> All five were resolved after this document was written, by CONTEXT amendments A1/A5/A6/A7/A8 and by
> plan verification. The reasoning below is preserved as the input to those decisions, **not as live
> advice.** Two specific corrections to this document, so nobody acts on the superseded text:
>
> - **This document's `probeDb()` sketch LEAKS a 2s timer on every fast success.** Pattern mapping
>   caught it; plan 42-05 composes `Promise.race` with `finally { clearTimeout(timer) }` instead.
> - **Pitfall 5's "exactly 3" breaking assertions is an UNDERCOUNT.** It grepped only
>   `toHaveBeenCalledWith` two-arg shapes and missed `.toContain`/`.includes` substring assertions; the
>   real figure is ~40 across 17 files. Pitfall 7's three log-grep gates are likewise incomplete.


1. **Does `@sentry/nextjs` need `withSentryConfig` for server-only capture?** (A1)
   - *Known:* Sentry's docs present it purely as build-time (source maps, tunnel, client wiring); the server SDK is initialised from `instrumentation.ts`.
   - *Unclear:* whether the SDK emits a warning, or misbehaves, when unwrapped under Turbopack.
   - *Recommendation:* proceed unwrapped. Make the first Sentry task's verification a real `docker compose build`, and read the build log. If Sentry complains, wrap with `withSentryConfig(withNextIntl(nextConfig), { silent: true })` — no org, project or auth token, so no account is required.

2. **Where should the `onRequestError` runtime-guard test live?** `vitest.config.ts:9` anchors `include` at `src/**`, so a root-level `instrumentation.test.ts` is never collected.
   - *Recommendation:* keep `instrumentation.ts` a thin delegator with no logic worth testing, and test `initSentry` / `reportRequestError` in `src/lib/observability/sentry.test.ts`. Avoids touching a config file whose header explains its `include`/`exclude` choices at length.

3. **Should the two one-shot boot cleanups get a replacement verification gate?** They are correctly excluded from `/api/health`, and this phase breaks their only existing check (Pitfall 7). `scan-cleanup.ts:18-32` argues at length for that gate's necessity.
   - *Recommendation:* keep them out of `processors` as CONTEXT requires, and update the three comments to the new grep (`grep -F '"scope":"dedup-scan-cleanup"'`). A `bootTasks` key in the health response would be a scope expansion CONTEXT did not authorise; note it as a candidate for a later phase.

4. **Should `docker-compose.yml` gain a healthcheck for the `app` service now that `/api/health` exists?**
   - *Recommendation:* **no, not this phase.** It is not in any criterion, and a naive `restart: unless-stopped` + healthcheck combination could restart-loop on a legitimately degraded 503 (e.g. a daily pruner reported stale), turning an observability feature into an outage. Worth its own decision. Adding `LOG_LEVEL` and `SENTRY_DSN` to `environment:` **is** required (Pitfall 6) and is a different change.

5. **Is 4406 the right post-phase test floor?** The phase adds ~30 tests and modifies 3 assertions.
   - *Recommendation:* the gate should be "≥ 4406 passed, 0 failed", not an exact equality, and the 3 modified assertions in Pitfall 5 should be named in the plan so a reviewer can tell an intended change from a regression.

---

## Sources

### Primary (HIGH confidence — this repo's own artifacts and installed packages)

- **This repo's production build** `.next/` (BUILD_ID 2026-08-21, Turbopack) — four distinct `bus.ts` module IDs across 9 chunks; `instrumentation.js` stub and its chunk graph; the 21-chunk standalone gap; the empty edge `register`; `middleware-manifest.json` `"functions": {}`; only one prerendered `.body`
- **The running container** — `docker compose ps`, `docker compose logs app` (Next.js 16.1.6, seven processor boot lines), `docker compose exec app ps` (single process, PID 1)
- `instrumentation.ts` (root), `src/lib/events/bus.ts`, `src/lib/audit/actor-context.ts`, all six processors, all four subscribers, both one-shot cleanups, `src/middleware.ts`, `src/auth.config.ts`, `src/db/index.ts`, `src/app/api/v1/audit/route.ts` + its test, `Dockerfile`, `docker-compose.yml`, `next.config.ts`, `eslint.config.mjs`, `package.json`, all three vitest configs, `.github/workflows/ci.yml`, `.env.example`, `.dockerignore`
- `npx eslint --rule no-console:error -f json` — **273 / 96 non-test, 21 / 12 test**, reconciled exactly against a 278-hit raw grep
- `npx vitest run` — 925/925 suites, 4406/32/0; `npx tsc --noEmit` — 0; `npx eslint` — 0 errors / 124 warnings
- `node_modules/next/dist/server/instrumentation/types.d.ts`, `node_modules/next/dist/types.d.ts:18`, `node_modules/next/dist/lib/server-external-packages.jsonc`
- `npm view @sentry/nextjs @sentry/node` (version, created, modified, repository, `scripts.postinstall`); `slopcheck install` → 2 OK; installed `package.json` dependency graphs and `du -sh` footprints
- **Context7 `/websites/nextjs`** — `instrumentation.js` / `onRequestError` signature; Route Handler caching (Next 15 change)
- **Context7 `/websites/sentry_io_platforms_javascript_guides_nextjs`** — `captureRequestError` manual setup; `withSentryConfig` purpose; `sendDefaultPii` deprecation and `dataCollection`; `tracesSampleRate` gating; Turbopack vs Webpack differences; `beforeSend`

### Secondary (MEDIUM confidence)

- Docker `json-file` 16 KB line splitting — [Docker docs: JSON File logging driver](https://docs.docker.com/engine/logging/drivers/json-file/), [moby/moby#36777](https://github.com/moby/moby/issues/36777), [moby/moby#32923](https://github.com/moby/moby/issues/32923), [grafana/loki#2920](https://github.com/grafana/loki/issues/2920)

### Tertiary (LOW confidence — flagged in the Assumptions Log)

- A1: `withSentryConfig` optionality — inferred from consistent doc framing, never stated either way
- A2: whether Sentry's "Next.js telemetry" for Turbopack auto-instrumentation is affected by `NEXT_TELEMETRY_DISABLED=1` — not resolved; mitigated by using the explicit hook

---

## Project Constraints (from project instructions / memory)

There is no `./CLAUDE.md` in this repository (verified). These directives come from the user's global
instructions and the project auto-memory, and carry the same authority as locked decisions:

| Constraint | Consequence for this phase |
|---|---|
| **Docker only — never `npm run dev` / `next dev` / `pnpm dev`** | Every behavioural verification is `docker compose build && docker compose up -d` + `curl localhost:3001/…`. Also removes the dev-mode render-worker concern (Pitfall 9). |
| App at `localhost:3001` (host) → 3000 (container); Postgres `localhost:5433` | Health verification URL is `http://localhost:3001/api/health`. |
| **`docker` needs NO `sudo`** | No `sudo` in any plan command. |
| **NEVER embed or echo a password** | No `echo "<pw>" \| sudo -S …` anywhere. If a `sudo` prompt ever appears, ask the user to run it via `! <command>`. |
| `.planning` is gitignored but tracked — the GSD commit helper fails on it | Commit `42-RESEARCH.md` by force-adding the individual file, never the directory. |
| **rtk hook elides redirected output** — `sed`/`head` into a file writes an `ELIDED` file with exit 0 | Plan tasks must use Write/Edit for file creation, never shell redirection. This applies to the eleven new/modified files. |
| Server-action return shape is `{ success: true/false, error/id }` | Reinforces Pitfall 8: most errors here never throw, so they never reach Sentry — by design. |
| Migrations: `npx drizzle-kit migrate` | **Not needed.** This phase adds no schema (heartbeats are in-memory by locked decision). |

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| The module-graph hazard and the `globalThis` requirement | **HIGH** | Four distinct Turbopack module IDs extracted from this repo's own build output, cross-referenced to specific chunks and specific consumers. Not inferred. |
| Migration surface (273 / 96 files, per-directory, client/server split, control-flow risks) | **HIGH** | Produced by the same linter that will gate the phase, reconciled line-by-line against a raw grep. |
| Console-spy blast radius (89 spies / 40 files, exactly 3 shape assertions) | **HIGH** | Enumerated by grep across the test tree. |
| Standalone build path (route survives, 21 instrumentation chunks do not) | **HIGH** | Set-differenced the two chunk directories and matched the result to `instrumentation.js.nft.json` exactly. |
| Edge double-compile of `instrumentation.ts` | **HIGH** | Read the compiled edge chunk; `register` is `async function t(){}`. |
| `onRequestError` availability and signature | **HIGH** | Verified in installed `next@16.1.6` type declarations *and* Context7 docs; the two differ slightly (`renderType`) and the installed types win. |
| Route Handler caching default | **HIGH** | Next 15 upgrade docs + empirical `.body` check. |
| Sentry package choice, PII config, tracing-off default | **MEDIUM-HIGH** | Official Sentry docs via Context7 for every config claim; the one gap is `withSentryConfig` optionality (A1), which has a named mitigation. |
| Logger design details (level default, error serialization, truncation) | **HIGH** for the mechanics (`JSON.stringify(new Error())` is `{}`; console delegation preserves the spies), **MEDIUM** for the tuning choices (8 KB cap, `info` default) |
| Per-worker heartbeat intervals | **HIGH** | Read every constant from every processor file with line numbers. |
| Staleness tolerance formula | **MEDIUM** | A judgment call (A4), documented as such. |

**Research date:** 2026-08-23
**Valid until:** ~2026-09-22 (30 days). The repo-derived findings (module graphs, call-site counts, chunk
sets) are invalidated by the **next production build**, not by the calendar — re-run the two commands in
§Code Examples and §The Module-Graph Hazard after any build. `@sentry/nextjs` moves fast (10.70.0 published
2026-08-12); re-check its version before install.
