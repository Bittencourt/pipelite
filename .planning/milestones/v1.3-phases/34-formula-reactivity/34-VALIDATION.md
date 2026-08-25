---
phase: 34
slug: formula-reactivity
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-14
---

# Phase 34 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Materialized from `34-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.0.18 |
| **Config file** | `vitest.config.ts` — `environment: node`, `include: src/**/*.{test,spec}.*`, `exclude: [...configDefaults.exclude, '**/.next/**']`, alias `@ -> ./src` |
| **Quick run command** | `npx vitest run src/lib/formula-recalc.test.ts` (~0.87 s, measured against the comparable 63-test formula-engine file) |
| **Full suite command** | `npm test` — baseline **41 files / 461 passed / 4 skipped, exit 0** |
| **Other gates** | `npx tsc --noEmit` exit 0; `npx eslint` 0 errors (128 warnings, non-gating) |
| **No DB needed** | Suite passes under `env -i` with no `DATABASE_URL`. Keep new tests DB-free by mocking `@/db`. |

**Reporter caveat:** `--reporter=basic` **does not exist** in vitest 4 and hard-fails with `ERR_LOAD_URL`. Use the default reporter. The `rtk` shell hook collapses vitest output to `PASS (n) FAIL (0)` — wrap in `rtk proxy` when raw output matters, or redirect to a file and read it with `node -e`.

---

## Sampling Rate

- **Per task commit:** `npx vitest run src/lib/formula-recalc.test.ts` plus the specific file touched (sub-second each)
- **Per wave merge:** `npm test && npx tsc --noEmit && npx eslint` — the three gates CI already enforces
- **Phase gate:** full suite green (≥461 passing, no regressions) before verification, plus the Docker runtime checkpoint signed off
- **Max feedback latency:** ~1 s per task; ~61 s for the full three-gate wave run

---

## Phase Requirements → Test Map

| Req / Decision | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| FORMULA-01 | `recalculateFormulas` writes the recomputed wrapper into the entity's `customFields` JSONB | unit | `npx vitest run src/lib/formula-recalc.test.ts` | ❌ Wave 0 |
| FORMULA-01 / D-17 | Every mutation calls the helper **before** `crmBus.emit`; the emitted payload carries the recomputed value | unit | `npx vitest run src/lib/mutations/{deals,people,organizations,activities}.test.ts` | ✅ extend |
| FORMULA-01 | UI path (`saveFieldValues`) recalcs and strips client-supplied formula keys | unit | `npx vitest run src/lib/custom-fields.test.ts` | ❌ Wave 0 |
| FORMULA-01 / D-02 | v1 route write paths recalc (deals/people/orgs/activities: collection + `[id]` + batch) | unit | `npx vitest run "src/app/api/v1/**/__tests__/*.test.ts"` | ❌ Wave 0 |
| FORMULA-01 / SC-2 / D-16 | `flattenCustomFields` unwraps the wrapper so CSV carries the scalar, never `[object Object]` | unit | `npx vitest run src/lib/export/formatters.test.ts` | ❌ Wave 0 |
| FORMULA-01 / SC-3 | A workflow condition over a formula field branches on the current value | unit | `npx vitest run src/lib/execution/condition-evaluator.test.ts src/lib/triggers/matcher.test.ts` | ✅ extend |
| **FORMULA-02 / SC-4** | **Zero evaluations when no formula references any changed field** (incl. a 10-field bulk change) | unit — **spy on call count** | `npx vitest run src/lib/formula-recalc.test.ts` | ❌ Wave 0 |
| FORMULA-02 | Cross-entity cascade fires only when a dot-ref matches a changed parent field, and issues no child query otherwise | unit | `npx vitest run src/lib/formula-recalc.test.ts` | ❌ Wave 0 |
| FORMULA-02 / D-13 | The 500-evaluation budget caps the cascade and logs exactly one warning naming the parent and skipped count | unit — `vi.spyOn(console,'warn')` | `npx vitest run src/lib/formula-recalc.test.ts` | ❌ Wave 0 |
| D-05 / D-06 | An erroring formula persists `{formula:true, value:null, error}`, **replaces** any prior value, and the save still succeeds | unit | `npx vitest run src/lib/formula-recalc.test.ts` | ❌ Wave 0 |
| D-12 | Mutations persist `customFields` on create and update (the silent-drop fix) | unit | `npx vitest run src/lib/mutations/*.test.ts` | ✅ extend |
| D-14 | `fieldValues` seeded with every definition name defaulting to `null` — no fabricated `Unknown field` errors | unit | `npx vitest run src/lib/formula-recalc.test.ts` | ❌ Wave 0 |
| **Regression** | Phase 32's per-reference null carve-out (H-01) still holds | unit | `npx vitest run src/lib/formula-engine.test.ts` — **must stay green, 63 tests** | ✅ must not regress |
| D-11 / Runtime | `getQuickJS()` succeeds inside the Docker standalone build and a real save persists the value | **manual-only** | See Manual-Only Verifications below | ❌ `checkpoint:human-verify` |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**SC-4 is a negative assertion.** It must be proven by asserting `evaluateFormula` **call count is 0** (`toHaveBeenCalledTimes(0)`), never by comparing final values — asserting values alone cannot detect over-triggering.

---

## Wave 0 Requirements

New test files that must be created before or alongside the implementation they cover:

- [ ] `src/lib/formula-recalc.test.ts` — FORMULA-01, FORMULA-02, D-04, D-05, D-06, D-13, D-14 (the primary D-07 TDD target)
- [ ] `src/lib/custom-fields.test.ts` — the UI write path (`saveFieldValues`), which has **no test file at all** today
- [ ] `src/lib/export/formatters.test.ts` — SC-2's CSV half; **no test file at all** today
- [ ] `src/app/api/v1/{deals,people,organizations,activities}/__tests__/*.test.ts` — D-02's API half. Only `v1/workflows/__tests__/runs-routes.test.ts` exists today, as a mocking precedent to copy
- [ ] Extend `src/lib/mutations/{deals,people,organizations,activities}.test.ts` with recalc-before-emit assertions
- [ ] Extend `src/lib/triggers/matcher.test.ts` and `src/lib/execution/condition-evaluator.test.ts` for SC-3
- [x] No framework install needed — vitest 4.0.18 is configured and green

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `getQuickJS()` initializes in the Docker standalone build, and a real save persists a recomputed value | D-11 | vitest resolves modules through vite, **not** through the Next.js server bundler — a green unit test says nothing about whether WASM is traced into the standalone output. Also needs privileged `docker`. | 1. `sudo docker compose up -d --build`. 2. Create a formula custom field via the admin UI. 3. Save a deal that exercises it. 4. Verify the stored JSONB with `psql -U pipelite -d pipelite`. |

**This is the phase's highest-risk unknown (D-11).** If `getQuickJS()` does not work in the standalone build, server-side evaluation is unshippable and the entire phase mechanism collapses. It is gated first, in Wave 1, deliberately.

---

## Validation Sign-Off

- [x] All tasks have an automated verify command, except the one justified `checkpoint:human-verify` (D-11) documented above
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 test files are created by the TDD RED tasks that need them
- [x] SC-4 asserts evaluation **call count**, not final values
- [x] Phase 32's 63 formula-engine regression tests are an explicit non-regression gate
- [x] No watch-mode flags; no `--reporter=basic` (does not exist in vitest 4)
- [x] New tests are DB-free (`vi.mock("@/db")`) — no database mutation
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-08-14 (materialized from RESEARCH.md § Validation Architecture after gsd-plan-checker flagged its absence as a blocker)
