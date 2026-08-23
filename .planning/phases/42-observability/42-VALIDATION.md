---
phase: 42
slug: observability
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-23
---

# Phase 42 — Validation Strategy

> Per-phase validation contract. Derived from `42-RESEARCH.md` § Validation Architecture with the
> eight CONTEXT amendments applied.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.0.18 — three projects |
| **Config files** | `vitest.config.ts` (base, `environment: node`, `globals: false`), `vitest.rsc.config.ts`, `vitest.db.config.ts` (real Postgres, **not run by `npm test`**) |
| **Quick run** | `npx vitest run <path>` |
| **Full suite** | `npm test` (= base + rsc projects) |
| **Estimated runtime** | ~40s quick · ~130s full |
| **Setup files** | **none** — `globals: false`, so every test imports `describe/it/expect/vi` explicitly |
| **Route-test model** | Import the route module, `vi.mock("@/db")`, call the handler with a `NextRequest`. Copy `src/app/api/v1/audit/__tests__/route.test.ts` |
| **Baseline to preserve** | **4406 passed / 32 skipped / 0 failed** across 925 suites · `tsc --noEmit` 0 errors · `eslint` 0 errors / 124 warnings |
| **CI** | `.github/workflows/ci.yml` — typecheck, lint, test, each `if: ${{ !cancelled() }}` |

**`vitest.config.ts:9` anchors `include` at `src/**`.** A root-level `instrumentation.test.ts` is
never collected. Preferred resolution (no config change): keep `instrumentation.ts` a thin delegator
and test the guard logic in `src/lib/observability/sentry.test.ts`.

---

## Sampling Rate

- **Per task commit:** `npx vitest run <touched test files>` + `npx tsc --noEmit`
- **Per wave merge:** `npm test` (both projects) + `npm run lint`, asserting the `no-console` count is
  **monotonically decreasing toward zero**
- **Phase gate:** typecheck 0 · lint **0 errors with `no-console: "error"`** · `npm test` ≥ 4406 passed,
  0 failed · a fresh `docker compose build && up -d` with `/api/health` returning 200 and ten live workers
- **Max feedback latency:** 40 seconds

---

## Per-Requirement Verification Map

| Req | Behavior | Type | Command | File |
|-----|----------|------|---------|------|
| OBS-01 | Line shape `{level,scope,msg,ts,...ctx}`, single-line, valid JSON | unit | `npx vitest run src/lib/log.test.ts` | ❌ W0 |
| OBS-01 | `LOG_LEVEL` gates emission; default `info`; unknown value falls back to `info`; `silent` mutes all | unit | same | ❌ W0 |
| OBS-01 | **An `Error` in `ctx` round-trips `name`, `message` AND `stack`** — amendment A3 | unit | same | ❌ W0 |
| OBS-01 | A `cause` chain serialises; a circular ref does not throw; an oversized line truncates | unit | same | ❌ W0 |
| OBS-01 | **Each level delegates to the matching `console` method** — A3, keeps test fallout at 3 not 89 | unit | same | ❌ W0 |
| OBS-01 | Swallow-and-log catches STILL swallow after migration | unit | existing suites unchanged: `npx vitest run src/lib/events/subscribers src/lib/mutations` | ✅ exists |
| OBS-01 | ~200 sites get a path-derived scope (only 73 had a prefix) — A4 | unit | `npx vitest run src/lib/log.test.ts` | ❌ W0 |
| OBS-01 | **Zero bare `console.*` in non-test source — the phase's final gate** | lint | `npm run lint` with `no-console: "error"` | ✅ config exists, rule to add |
| OBS-02 | DSN unset → `initSentry()` returns false, `init` never called | unit | `npx vitest run src/lib/observability/sentry.test.ts` | ❌ W0 |
| OBS-02 | **DSN unset → `@sentry/nextjs` is never even imported** (mock factory throws if it is) | unit | same | ❌ W0 |
| OBS-02 | DSN unset → `reportRequestError` performs no outbound `fetch` | unit | same | ❌ W0 |
| OBS-02 | DSN set → `captureRequestError` called once with the original error | unit | same | ❌ W0 |
| OBS-02 | `beforeSend` strips `event.user`, `request.data`, `request.cookies`, `request.headers` | unit | same | ❌ W0 |
| OBS-02 | `onRequestError` returns early when `NEXT_RUNTIME !== "nodejs"` — A6 (edge double-compile) | unit | same file, per the note above | ❌ W0 |
| OBS-03 | Healthy: 200, `status:"ok"`, all ten workers `alive:true` | unit | `npx vitest run "src/app/api/health/__tests__/route.test.ts"` | ❌ W0 |
| OBS-03 | **Empty registry → 503 with all ten workers present and `alive:false`** — amendment A1, **THE central proof** | unit | same | ❌ W0 |
| OBS-03 | DB probe rejects → `db.ok:false`, `latencyMs:null`, 503 | unit | same | ❌ W0 |
| OBS-03 | DB probe hangs → bounded at 2s, `ok:false` (fake timers) | unit | same | ❌ W0 |
| OBS-03 | One dead worker → 503 while the other nine stay `alive:true` | unit | same | ❌ W0 |
| OBS-03 | Body carries no version string, connection detail or count | unit | same | ❌ W0 |
| OBS-03 | Only `GET` is exported (other verbs `undefined`) | unit | same | ❌ W0 |
| OBS-03 | Per-worker staleness: daily pruners stay alive across 24h; execution-processor dies after 70s | unit | `npx vitest run src/lib/observability/heartbeat.test.ts` | ❌ W0 |
| OBS-03 | Subscriber `alive` derives from REGISTRATION, not `lastTickAt` (event-driven workers may never fire) | unit | same | ❌ W0 |
| OBS-03 | Registry survives a simulated second instantiation — **a PROXY, see below** | unit | same | ❌ W0 |
| A5 | `LOG_LEVEL` and `SENTRY_DSN` reach the container | manual | `docker compose exec -T app env \| grep -E 'LOG_LEVEL\|SENTRY_DSN'` | ❌ W0 |
| A7 | The three log-grep gates updated to the new string | unit/source | the three sites named in RESEARCH Pitfall 7 | ✅ exists |

---

## Wave 0 Requirements

- [ ] `src/lib/log.test.ts` — OBS-01: shape, levels, **Error serialization**, console delegation, throw-safety
- [ ] `src/lib/observability/heartbeat.test.ts` — OBS-03: per-worker staleness, subscriber semantics, `globalThis` survival, `_resetForTesting`
- [ ] `src/lib/observability/sentry.test.ts` — OBS-02: all three negative layers plus the positive, and the `onRequestError` runtime guard
- [ ] `src/app/api/health/__tests__/route.test.ts` — OBS-03: 200/503, shape, **empty-registry ⇒ 503**, bounded probe, closed verb surface
- [ ] Update the **3 argument-shape assertions** named in RESEARCH Pitfall 5
- [ ] Update the **3 documented log-grep gates** named in RESEARCH Pitfall 7
- [ ] Add `LOG_LEVEL` and `SENTRY_DSN` to `docker-compose.yml` (A5)
- [ ] No framework install — vitest 4.0.18 already covers everything

---

## Manual-Only Verifications

| Behavior | Req | Why Manual | Instructions |
|----------|-----|------------|--------------|
| The whole phase, in the container | OBS-01/02/03 | **vitest has a SINGLE module registry and structurally cannot reproduce the four-instance module-graph split this phase's central risk depends on.** `actor-context.ts:38-39` says exactly this: *"every unit test passes because vitest has a single module registry."* The container is the only place the real thing is observable — the `globalThis`-key unit test is a **proxy**, and is labelled as one. | `docker compose build && docker compose up -d`, then `curl -sS -o /dev/null -w '%{http_code}' localhost:3001/api/health` → **200**; `curl -s localhost:3001/api/health \| python3 -m json.tool` → ten workers, all `alive:true`; `docker compose logs app \| tail -30` → every line valid JSON carrying a `scope` |
| Sentry actually receives an event | OBS-02 | Requires a real DSN and a third-party account; the negative half is fully automated, only the positive delivery is not | With `SENTRY_DSN` set, trigger a server error and confirm it appears in the tracker |
| `withSentryConfig` is genuinely unnecessary | A6 | The docs do not state it either way; only a real build settles it | Make the first Sentry task's verification a real `docker compose build` and read the log |

---

## Explicitly NOT valid verification

- **`docker compose logs app \| grep -F '[trash-prune] Starting'`** — vacuous by CONTEXT's own argument
  (any build, including a months-old one, emits it), and after this phase the string does not exist.
  `/api/health` is its replacement.
- **`docker compose restart`** — re-runs the STALE image. Use `build` + `up -d`. This is the
  2026-08-22 Phase 41 incident, where the schema advanced while the code did not.
- **Iterating the heartbeat registry to build the health response** — `Object.values({}).every(...)`
  is `true`, so a dead `register()` would report 200. Use the `EXPECTED_WORKERS` roster (A1).

---

## Validation Sign-Off

- [ ] Every requirement has an automated command or a declared manual path
- [ ] Wave 0 covers all ❌ W0 references
- [ ] No watch-mode flags
- [ ] Feedback latency < 40s
- [ ] `no-console` flip lands with zero errors
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
