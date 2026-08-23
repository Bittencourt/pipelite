# Phase 42: Observability - Context

**Gathered:** 2026-08-23
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — 12 decisions across 3 areas plus a scope correction, all accepted

<domain>
## Phase Boundary

A production failure becomes detectable from an endpoint and a log stream, instead of from grepping
container stdout months later.

Three deliverables, and nothing else:

1. **A structured, level-controlled logger**, and every bare `console.*` in non-test source migrated
   to it, with a lint rule that keeps them gone (OBS-01)
2. **Opt-in error tracking** — nothing leaves the deployment unless an env var is set (OBS-02)
3. **`/api/health`** reporting database connectivity plus the liveness of every background worker
   (OBS-03)

**Explicitly OUT of scope:** request-correlation ids, client-side error capture, log shipping or
aggregation infrastructure, tracing/OpenTelemetry, and any dashboard or UI. **This phase has no UI
surface at all** — the health endpoint returns JSON.

</domain>

<scope_correction>
## Three numbers in REQUIREMENTS.md are stale — measured 2026-08-23

The user chose **full corrected scope**: honour the success criteria as written, not the stale counts.

| REQUIREMENTS.md says | Measured reality |
|---|---|
| OBS-01: "the 108 bare `console.*` calls in non-test source" | **278** — 30 `log`, 231 `error`, 15 `warn`, 2 `info`, 0 `debug` |
| OBS-03: "all four background processors" | **six** long-running processors, plus **four** `crmBus` event subscribers |
| Criterion 3 reads as though `/api/health` exists | **It does not exist.** There is no health route anywhere under `src/app/api/`. This phase creates it. |

There is also **no logger module** in the repo today (`src/lib/log*` does not exist).

The counts drifted because phases 35-45 added a great deal of code. Criterion 1 says "no bare
`console.*` calls remain in non-test source" — that sentence, not the number 108, is the contract.

**The six long-running processors** (from `instrumentation.ts`, which is at the REPOSITORY ROOT, not
`src/`): `startWebhookProcessor`, `startEmailProcessor`, `startScheduleProcessor`,
`startExecutionProcessor`, `startAuditPruner`, `startTrashPruner`.

**The four event subscribers:** `registerWebhookSubscriber`, `registerWorkflowTriggerSubscriber`,
`registerStageHistorySubscriber`, `registerAuditSubscriber`.

Plus two one-shot boot cleanups that are NOT liveness-relevant and must not be reported as processors:
`cleanupStaleImportSessions`, `cleanupStaleDedupScans`.

</scope_correction>

<why_criterion_3_exists>
## The failure this endpoint is built to catch — quoted, because it has happened twice

`instrumentation.ts` carries this comment above `startTrashPruner`:

> REGISTRATION HERE IS NOT EVIDENCE OF EXECUTION. `Dockerfile:24` copies the built
> `instrumentation.js` into `.next/standalone/` with a step that ends in `2>/dev/null || true`, so a
> build whose chunk layout changes fails silently and this whole function never runs. That exact
> breakage killed all four processors in production on 2026-08-08 while every test passed.

And it recurred from a different angle during Phase 41 (2026-08-22): `docker compose restart` re-ran a
stale image, so the schema advanced while the code did not, and a dry run performed a real CRM write.
The check that was supposed to catch it — grepping the logs for `[execution-processor] Starting` — is
**vacuous**, because that line is emitted by every build including a months-old one.

**So the endpoint's job is to answer a question a log line cannot: is this process's `register()`
actually alive right now.** Any design that could report healthy on a build where `register()` never
ran has missed the point of the phase.

</why_criterion_3_exists>

<decisions>
## Implementation Decisions

### The logger (OBS-01)

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

### Error tracking (OBS-02)

- **Sentry SDK, opt-in via `SENTRY_DSN`.** Unset means the SDK is never initialized — not initialized
  and silent, but never initialized at all.
- **The negative is ASSERTED, not assumed.** Criterion 2's first half ("with the env var unset nothing
  leaves the deployment") is a claim about absence, so it needs a real test: init must be provably not
  called without the DSN. An absence of observed traffic is not evidence.
- **Server-side unhandled errors only** — that is what the criterion says. No browser bundle.
- **PII scrubbed by default:** request bodies and user emails stripped before send. This is a CRM;
  the safe default is not optional, and relying on Sentry-side scrubbing puts the data on the wire
  first.

### `/api/health` (OBS-03)

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

### Amendments — post-research, 2026-08-23

Research (`42-RESEARCH.md`, commit `24a5414`, HIGH confidence) proved two traps that would each have
shipped a broken phase, and corrected a premise of the decisions above. These override the earlier text
where they conflict.

**A1 — `EXPECTED_WORKERS` is MANDATORY, and it is the phase's central proof.**
*(adds a hard requirement to the health-endpoint decision)*
If the route builds its response by iterating the heartbeat registry, then a completely dead
`register()` serializes as `processors: {}` — and `Object.values({}).every(...)` is **`true`**. The
endpoint would return **200 ok on precisely the failure it exists to detect.** Vacuous truth on an
empty collection.

So the response MUST be built from a hard-coded roster of all ten workers, with any worker absent from
the registry reported `alive: false`. **The single test "empty registry ⇒ 503 with all ten workers
`alive:false`" is this phase's most important assertion** — without it the endpoint is decoration that
passes its own tests.

**A2 — the module-graph hazard is FOUR instances, including two inside one `register()`.**
*(strengthens the `globalThis` requirement; it is not merely advisable)*
Module IDs extracted from `.next/` (BUILD_ID 2026-08-21) show `src/lib/events/bus.ts` existing as four
independent instances physically duplicated across nine chunks: `587400` (instrumentation graph),
`117126` (execution-processor's sub-chunk **of that same graph**), `930245` (route + server-action
graph), `947362` (SSR/RSC graph). Turbopack's runtime module cache cannot dedupe them — it is keyed by
module ID.

Two consequences the earlier text did not anticipate: a module-level `const` is duplicated **even
between two processors started by the same `register()` call**, and there are three graphs to bridge,
not two. A route handler IS in the same graph as a server action (both `930245`); the RSC render graph
is separate. The `globalThis` singleton pattern from `crmBus` and `actor-context.ts` is therefore
mandatory, not stylistic.

**A3 — the logger must delegate to `console` methods and must serialise `Error` explicitly.**
*(constrains the logger decision)*
Two traps that pass every test while destroying value:
- **`JSON.stringify(new Error())` is `{}`.** A naive JSON logger silently annihilates the stack trace
  on all 231 `console.error(msg, err)` migrations — the single most valuable field in the file. The
  logger must serialise `Error` explicitly (message, stack, cause).
- **40 test files hold 89 `vi.spyOn(console, …)` calls.** Delegating to the matching `console` method
  rather than `process.stdout.write` reduces the blast radius to **exactly 3** argument-shape
  assertions (named with file:line in RESEARCH). Writing to stdout directly would break 89.

**A4 — the scope-harvest premise was WRONG: only 26% of sites carry a prefix.**
*(corrects the logger decision's line-shape claim)*
Measured: **73 of 278** call sites carry a `[scope]`-style prefix, not "most" as the decision above
asserts. So roughly 200 sites need a **path-derived** scope (e.g. from the module path), and the plan
must cover that rather than assuming a harvest.

Also corrected: the real count is **273 call sites in 96 files**, tool-verified with
`eslint --rule no-console:error`. The raw grep's 278 includes five non-code hits — four comments and
**one JSX string at `src/app/workflows/[id]/edit/components/config-forms/transform-config.tsx:45`
which is user-facing UI copy and must NOT be migrated.**

**A5 — `LOG_LEVEL` and `SENTRY_DSN` must be added to `docker-compose.yml`, or BOTH features silently
no-op.** `docker-compose.yml:6-17` enumerates its nine env vars explicitly with **no `env_file:`**, so
a variable that is not listed simply never reaches the container. Everything would appear to work while
neither feature functioned. This is a required task, not a note.

**A6 — Sentry: `@sentry/nextjs` 10.70.0, WITHOUT `withSentryConfig`, reached only via guarded dynamic
imports.** `instrumentation.ts` is compiled for the **edge runtime as well** (verified in
`.next/server/edge/chunks/_52aa5b93._.js`, which contains `async function t(){}` — empty *only* because
every dependency sits behind `await import()` inside the `NEXT_RUNTIME` guard). This rules out Sentry's
own documented one-liner `export const onRequestError = Sentry.captureRequestError`, which needs a
top-level import. The `@sentry/node`-vs-`nextjs` OTel-footprint argument is a wash (nextjs depends on
node); what nextjs buys is `captureRequestError`, the maintained Next→Sentry adapter. Next is
`16.1.6`; `onRequestError` is the real seam.

**A7 — this phase BREAKS the two one-shot cleanups' only verification, and must repair it.** Their
liveness is currently proven by three `grep -F '[scope] Starting'` sites (`instrumentation.ts:40`,
`scan-cleanup.ts:31`, `scan-cleanup.test.ts:17`). Migrating those log lines changes the string. The
cleanups stay OUT of `processors` per the decision above, but the three comments/assertions must be
updated to the new grep string in the same phase.

**A8 — NO `app` healthcheck in `docker-compose.yml` this phase.** Combined with
`restart: unless-stopped`, a healthcheck on an endpoint that legitimately returns 503 when degraded
could restart-loop the container — turning the observability feature into an outage. Recommended
against by research and accepted.

**Operational warning for the planner:** `slopcheck install` mutates the repo (it runs `npm install`
and added both Sentry packages to `package.json`). Research reverted it and re-verified the baseline.
Prefer `slopcheck scan`, or budget an explicit revert step.

### Claude's Discretion

- The heartbeat registry's API shape and where it lives.
- Batching strategy for the 278 migrations across waves (must respect: two plans in one wave may not
  touch the same file).
- The exact `LOG_LEVEL` values and default.
- Whether `latencyMs` uses a trivial `SELECT 1` or something more representative.
- Sentry SDK package choice (`@sentry/node` vs `@sentry/nextjs`) — judge on which avoids more
  bundling friction, and record the reason.

</decisions>

<code_context>
## Existing Code Insights

### The migration surface — 278 calls, non-test source

Highest-density files, which is where wave batching should start:

| File | calls |
|---|---|
| `src/lib/mutations/deals.ts` | 11 |
| `src/lib/mutations/people.ts` | 10 |
| `src/lib/mutations/organizations.ts` | 10 |
| `src/lib/mutations/activities.ts` | 10 |
| `src/lib/trash/prune.ts` | 8 |
| `src/lib/execution/execution-processor.ts` | 8 |
| `src/app/import/actions.ts` | 8 |
| `src/app/admin/pipelines/actions.ts` | 8 |
| `src/lib/trash/queries.ts` | 7 |
| `src/lib/dedup/scan-state.ts` | 7 |
| `src/lib/dedup/scan-engine.ts` | 6 |
| `src/lib/views/actions.ts` | 5 |

Note the shape of the remainder: 231 of 278 are `console.error`, most in catch blocks that deliberately
swallow-and-log (the audit subscriber, the export audit row, the import summary). Those are not
defects; the pattern is intentional and documented in several file headers. **Migrating them must not
change control flow** — a swallowed error stays swallowed.

### Reusable assets and patterns

- `instrumentation.ts` (repository ROOT) — the single `register()` where all workers start. The
  heartbeat registry must be reachable from every one of them.
- `src/lib/events/bus.ts` — `crmBus`. Its header documents the double-instantiation hazard:
  `instrumentation.ts` is bundled into a DIFFERENT module graph from server actions, so a plain
  module-level `const` is created TWICE. `crmBus` and `src/lib/audit/actor-context.ts` both solve this
  with a `globalThis` singleton. **The heartbeat registry has exactly this problem and must use the
  same pattern**, or the route reads a different registry than the processors write to and every
  processor reports dead.
- `src/app/api/v1/audit/route.ts` — a recent route with auth, closed-set validation and error shaping;
  the closest analog for a new route's conventions (though health is unauthenticated).
- `eslint.config.mjs` — where the `no-console` rule lands. Current baseline is **0 errors** and ~123
  warnings, so the flip must land with every call migrated.
- Existing scope-prefix convention: `[execution-processor]`, `[trash-prune]`, `[audit-export]`,
  `[dedup-scan-cleanup]`, `[email]`. These become the `scope` field.

### Integration points

- `instrumentation.ts` — heartbeat registration for six processors and four subscribers.
- `src/app/api/health/route.ts` — new file, the phase's only new endpoint.
- `next.config.ts` / `Dockerfile` — only if the Sentry SDK requires build wiring. Note `Dockerfile:24`
  is the `2>/dev/null || true` line that silently drops `instrumentation.js`; do not make it worse.

</code_context>

<specifics>
## Specific Ideas

- The health endpoint must be capable of reporting **unhealthy on a build where `register()` never
  ran**. That is the whole reason it is being built. A design that returns 200 because the route
  itself works has failed even if every test passes.
- Migrating a `console.error` inside a swallow-and-log catch must not change whether the error is
  swallowed. Several of those catches have headers explaining precisely why they swallow.
- The `no-console` flip is the phase's real gate on criterion 1. It should be its own final task, so
  its diff is the proof.

</specifics>

<deferred>
## Deferred Ideas

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

</deferred>
