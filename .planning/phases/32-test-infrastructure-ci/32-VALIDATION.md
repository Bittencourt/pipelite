---
phase: 32
slug: test-infrastructure-ci
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-13
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.0.18 (already installed) |
| **Config file** | `vitest.config.ts` (exists since Phase 23 — lacks `include`/`exclude`, this phase adds them) |
| **Quick run command** | `npx vitest run <changed-file-path>` |
| **Full suite command** | `npm test` (to be created — wraps `vitest run`) |
| **Estimated runtime** | ~14 seconds full suite; `tsc --noEmit` ~23s; `eslint` ~24s |

**Notable:** no database is required. All 27 DB-touching test files `vi.mock("@/db")`; the suite produces byte-identical results with `DATABASE_URL` unset. CI needs no Postgres service container.

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <affected test files>`
- **After every plan wave:** Run `npm test` (full suite)
- **Before `/gsd:verify-work`:** `npm test` green AND `npx tsc --noEmit` exit 0 AND `npx eslint` exit 0
- **Max feedback latency:** 25 seconds (single-file vitest run is ~2s; full suite 14s)

---

## Per-Task Verification Map

Task IDs are assigned by the planner; this map defines the verification contract each task must satisfy. Every requirement below has an automated command — there are no untestable requirements in this phase.

| Requirement | Verifies | Test Type | Automated Command | Status |
|-------------|----------|-----------|-------------------|--------|
| CI-01 | `npm test` script exists and runs the full suite | CLI | `npm test` exits 0; `npm test` after intentionally breaking a test exits non-zero | ⬜ pending |
| CI-02 | Collection excludes `.next/**` and `node_modules/**` | CLI | `npx vitest list` (or `vitest run --reporter=verbose`) output contains no path starting with `.next/`; collected file count is 41, not 42+ | ⬜ pending |
| CI-03a | `formula-engine.test.ts > LOGIC.isBlank` passes | unit | `npx vitest run src/lib/formula-engine.test.ts` — 57/57 pass, including the existing `propagates null values` guard | ⬜ pending |
| CI-03b | `mutations/workflows.test.ts > deleteWorkflow` passes | unit | `npx vitest run src/lib/mutations/workflows.test.ts` — all pass | ⬜ pending |
| CI-03c | Cascade-delete branch is covered (D-06) | unit | New test in `workflows.test.ts` asserts 3 delete calls; file total becomes 23 tests | ⬜ pending |
| CI-03d | Whole suite green | CLI | `npm test` → 41 files, 454 passed / 4 skipped, exit 0 | ⬜ pending |
| CI-04a | Typecheck gate | CLI | `npx tsc --noEmit` exits 0 | ⬜ pending |
| CI-04b | Lint gate green (D-01, D-02, D-03) | CLI | `npx eslint` exits 0 — 0 errors. Warnings are permitted. | ⬜ pending |
| CI-04c | CI workflow runs all three gates on PR | file + CI | `.github/workflows/ci.yml` exists; a pushed branch produces a run whose conclusion is `success`; `gh run list` shows the workflow triggered on `pull_request` | ⬜ pending |
| CI-04d | Required check blocks merge | manual + API | Branch ruleset on `master` lists the CI check as required — verify with `gh api repos/Bittencourt/pipelite/rulesets` | ⬜ pending (see Manual-Only) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — vitest is installed and `vitest.config.ts` exists. No framework install is needed.

- [ ] `vitest.config.ts` gains `include` + `exclude` (spreading `configDefaults.exclude`, since setting `exclude` **replaces** rather than extends the defaults in vitest 4)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| A PR with a failing gate cannot be merged | CI-04 | Branch protection is a GitHub repo setting, not a file in the repo. It cannot be created by committing code, and the check name only becomes selectable after the workflow has run at least once. | 1. Merge `ci.yml` to `master`. 2. Let the workflow run once. 3. Create a ruleset on `master` requiring the CI check. 4. Verify with `gh api repos/Bittencourt/pipelite/rulesets`. 5. Optionally open a throwaway PR with a deliberate type error and confirm the check goes red and merge is blocked. |

**Ordering constraint:** the ruleset step must come *after* the workflow has executed once — GitHub's required-check picker only surfaces checks it has recently observed.

---

## Validation Sign-Off

- [ ] All tasks have an automated verify command (except CI-04d, which is manual by nature — documented above)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers the vitest config change that all other verification depends on
- [ ] No watch-mode flags — `vitest run`, never bare `vitest`
- [ ] Feedback latency < 25s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
