---
phase: 32-test-infrastructure-ci
verified: 2026-08-14T14:03:40Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
---

# Phase 32: Test Infrastructure & CI Verification Report

**Phase Goal:** A regression cannot reach master unnoticed — one command runs the whole suite, the suite is green, and CI blocks merges that break it
**Verified:** 2026-08-14T14:03:40Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Developer runs `npm test` from a clean checkout, gets the full suite, gets non-zero exit on failure | ✓ VERIFIED | `npm test` (→ `vitest run`) executed directly: exit 0, `41 passed (41)` files, `455 passed \| 4 skipped (459)` tests, 32.47s. `package.json` has `"test": "vitest run"` (not watch mode). |
| 2 | Collection excludes `.next/**` and `node_modules/**` — stale `.next/standalone` copy stops running as a second suite | ✓ VERIFIED (empirically, not just inspected) | `.next/` **does exist** in the working tree right now, and it contains the stale copy: `.next/standalone/src/lib/formula-engine.test.ts`. Ran `vitest list --run` against the live config: 455 collected test IDs, 0 lines fail to start with `src/`, exactly 41 unique files, zero occurrences of `.next` anywhere in the collected list or the `npm test` output. `vitest.config.ts` uses `include: ['src/**/*...']` (anchored, `.next` can never match) and `exclude: [...configDefaults.exclude, '**/.next/**']` — confirmed the exclude **spreads** `configDefaults.exclude` rather than replacing it, so the vitest-4 "exclude replaces defaults" trap (which would silently drop the `node_modules` protection) is avoided. |
| 3 | Full suite passes with zero failures, including `deleteWorkflow` cascade path and `LOGIC.isBlank` | ✓ VERIFIED | Targeted run of both files: exit 0. `formula-engine.test.ts > ... > handles LOGIC.isBlank function` passes; the pre-existing `propagates null values` regression guard (D-04) also passes in the same file. `workflows.test.ts > deleteWorkflow > cascades to run steps and runs before deleting the workflow` passes and asserts `expect(mockDb.delete).toHaveBeenCalledTimes(3)` — the D-06-required 3-call cascade assertion (steps → runs → workflow) is present, not just a repaired mock. |
| 4 | A PR with a type error, lint error, or failing test shows a red required check and cannot be merged | ✓ VERIFIED | Config-level: `master protection` ruleset (id 20851119, `enforcement: active`) has a `required_status_checks` rule requiring context `ci` with `integration_id: 15368`, and a separate `pull_request` rule (`required_approving_review_count: 0`), with exactly one bypass actor (`RepositoryRole`, `bypass_mode: always`) — matches D-07 option B. Behavioral: PR #10 ("DO NOT MERGE — throwaway merge-gate verification") carried a deliberate lint error; `gh pr view 10` shows `state: CLOSED`, `mergeStateStatus: BLOCKED`, `statusCheckRollup` with the `ci` check `conclusion: FAILURE`. PR was closed unmerged. Since typecheck/lint/test are three steps of the *same* single-job check (`ci`), any one step failing produces the identical red check + BLOCKED state observed — the lint-error case is representative of all three failure modes described in the truth. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vitest.config.ts` | Scoped `include`/`exclude`, spreads `configDefaults.exclude` | ✓ VERIFIED | Lines 9, 12 as described above. |
| `package.json` | `test` and `typecheck` scripts | ✓ VERIFIED | `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`, `"lint": "eslint"` all present. |
| `src/lib/formula-engine.ts` | Source fix for `LOGIC.isBlank` (D-04) | ✓ VERIFIED | Test passes; regression guard `propagates null values` still passes. |
| `src/lib/mutations/workflows.test.ts` | Repaired mock + cascade test (D-05, D-06) | ✓ VERIFIED | `mockDb.select` stubbed; new cascade test asserts 3 delete calls. |
| `.github/workflows/ci.yml` | Single-job CI: typecheck, lint, test on push+PR to master | ✓ VERIFIED | Single job `ci`; `permissions: contents: read`; no `paths:` filter (explicit comment explaining why); uses `pull_request` (not `pull_request_target`); `if: ${{ !cancelled() }}` on lint/test steps so all three gates report in one run; no secrets referenced. |
| `CONTRIBUTING.md` | Documents the gate, including the admin-bypass caveat | ✓ VERIFIED | Explicit "This gate is not absolute, by design" section stating an admin can land untested code on master — does not overstate the gate as absolute (T-32-30 addressed). |
| `.github/` branch ruleset (repo setting, no file) | Requires `ci` check on master | ✓ VERIFIED | `gh api repos/Bittencourt/pipelite/rulesets/20851119` — active, correct rules, single bypass actor. |
| `eslint.config.mjs` | Not weakened; React Compiler rules stay at error severity | ✓ VERIFIED | `eslint --print-config` on a suppressed file shows `react-hooks/set-state-in-effect: [2]`, `react-hooks/preserve-manual-memoization: [2]`, `react-hooks/immutability: [2]` — still `error` project-wide. No rule-level override present in `eslint.config.mjs` (file re-read; only imports next configs + adjusts globalIgnores). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `vitest.config.ts` | `vitest/config configDefaults` | spread into `test.exclude` | ✓ WIRED | `exclude: [...configDefaults.exclude, '**/.next/**']` — confirmed by reading file directly, not by grep pattern alone. |
| `.github/workflows/ci.yml` `ci` job | GitHub branch ruleset required check | check-run name `ci` observed after first run | ✓ WIRED | `gh run list` shows multiple successful `ci` runs on master; ruleset's `required_status_checks[0].context == "ci"` with populated `integration_id`, proving GitHub has actually observed and bound the check (not just a typed-in guess). |
| `deleteWorkflow` source (`workflows.ts`) | `workflows.test.ts` cascade test | `mockDb.delete` call-count assertion | ✓ WIRED | Test exercises the real cascade branch (`runs.length > 0`) via `mockDb.query.workflows.findFirst` + `mockDb.select` stubs, then asserts on the mock, not a static value. |

### Anti-Patterns Found

None. Scanned all files touched by this phase (`vitest.config.ts`, `package.json`, `.github/workflows/ci.yml`, `CONTRIBUTING.md`, `formula-engine.ts`, `workflows.test.ts`, and the 5 D-02-suppressed UI files) for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` — zero matches. The 5 D-02 `eslint-disable-next-line` suppressions each carry a full written justification (verified inline, quoted below) and are traced to backlog item 999.13 in `.planning/ROADMAP.md`, satisfying the "not attempted here, tracked" requirement rather than being silent debt:
- `src/components/ui/relative-time.tsx:17` — `react-hooks/set-state-in-effect`
- `src/app/import/import-wizard.tsx:91` — `react-hooks/preserve-manual-memoization`
- `src/app/settings/profile/profile-settings-form.tsx:38` — `react-hooks/set-state-in-effect`
- `src/app/(auth)/reset-password/page.tsx:42` — `react-hooks/set-state-in-effect`
- `src/app/(auth)/verify-email/page.tsx:20` — `react-hooks/immutability`

Exactly 5, matching D-02 (3× `set-state-in-effect`, 1× `preserve-manual-memoization`, 1× `immutability`). Two pre-existing, unrelated `react-hooks/exhaustive-deps` disables (in `entity-combobox.tsx` and `webhook-response-config.tsx`) predate this phase and are a different rule outside D-02's scope — not counted against it.

130 `no-unused-vars` eslint *warnings* remain (permitted per D-03 — only errors gate CI) and are documented as non-gating in `CONTRIBUTING.md`.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite runs and is green | `npm test` | exit 0, 41 files / 455 passed / 4 skipped, 32.47s | ✓ PASS |
| Collection scoped to `src/`, `.next/` present but not collected | `./node_modules/.bin/vitest list --run` | 455 test IDs, 41 unique files, all under `src/`, zero `.next` matches | ✓ PASS |
| Named regression tests pass | `vitest run src/lib/formula-engine.test.ts src/lib/mutations/workflows.test.ts` | exit 0; `LOGIC.isBlank`, `propagates null values`, `deleteWorkflow` cascade (3 delete calls) all pass | ✓ PASS |
| Typecheck gate | `./node_modules/.bin/tsc --noEmit` | exit 0, no output | ✓ PASS |
| Lint gate | `./node_modules/.bin/eslint .` | exit 0, `0 errors, 130 warnings` | ✓ PASS |
| React Compiler rules not downgraded | `eslint --print-config` on a suppressed file | all 5 relevant rules at severity `2` (error) | ✓ PASS |
| Latest CI run on master is green | `gh run list --workflow=ci.yml --branch master --limit 3` | 3/3 most recent runs `completed`/`success` | ✓ PASS |
| Merge gate blocks a broken PR | `gh pr view 10 --json state,mergeStateStatus,statusCheckRollup` | `CLOSED`, `mergeStateStatus: BLOCKED`, `ci` check `conclusion: FAILURE` | ✓ PASS |
| Branch ruleset config | `gh api repos/Bittencourt/pipelite/rulesets/20851119` | active, `required_status_checks` context `ci` w/ `integration_id`, `pull_request` rule, 1 bypass actor | ✓ PASS |

### Probe Execution

Not applicable — this phase has no `scripts/*/tests/probe-*.sh` files; the automated commands above (npm test, tsc, eslint, vitest list, gh CLI) are the phase's own verification contract per `32-VALIDATION.md` and were executed directly rather than through a probe wrapper.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| CI-01 | 32-01 | `npm test` runs the full suite, non-zero exit on failure | ✓ SATISFIED | `npm test` script exists, exits 0 on green suite; runner is `vitest run` (not watch mode). |
| CI-02 | 32-01 | Collection excludes `.next/**` and `node_modules/**` | ✓ SATISFIED | Empirically confirmed with `.next/` present in the tree — 0 of 455 collected tests come from `.next`; config spreads `configDefaults.exclude`. |
| CI-03 | 32-02 | Suite passes clean, including the two named regressions | ✓ SATISFIED | Both named tests pass; cascade-delete test added per D-06; null-propagation guard (D-04) intact. |
| CI-04 | 32-03, 32-04, 32-05, 32-06 | CI runs typecheck+lint+test on every push/PR; failing check blocks merge | ✓ SATISFIED | `ci.yml` runs all three gates in one job; `tsc`/`eslint` both exit 0 locally and in the last 3 master runs; ruleset requires the `ci` check; PR #10 proves behaviorally that a red check blocks merge. |

No orphaned requirements — CI-01 through CI-04 all map to a plan in this phase per `REQUIREMENTS.md` line range 12-17.

### Human Verification Required

None. All four success criteria were verified programmatically, including the "merge gate blocks a broken PR" criterion, which was proven behaviorally via the retained PR #10 evidence (`gh pr view 10`) rather than deferred to a human, per the verification instructions. The admin-bypass caveat is a documented, accepted design trade-off (D-07), not an unverified gap.

### Gaps Summary

None. All 4 ROADMAP success criteria for Phase 32, and all 4 requirements (CI-01–CI-04), are verified against live command output and live GitHub API state — not against SUMMARY.md narrative. Two points worth flagging as non-blocking notes for future phases, not gaps in this one:

- `.next/` currently exists in the working tree with the stale `formula-engine.test.ts` copy still physically present (per D-07/context, `.next/` is build output that regenerates and is correctly *excluded*, not deleted — this is exactly the designed behavior, not a leftover from an incomplete phase).
- Criterion 4's behavioral proof (PR #10) exercised the lint-error failure mode only, not a type error or failing test in isolation. This is judged sufficient because all three gates report through the single `ci` check-run, so a lint failure and a type/test failure produce structurally identical (red check, `mergeStateStatus: BLOCKED`) outcomes — confirmed by re-reading `ci.yml`'s `if: ${{ !cancelled() }}` wiring rather than assumed.

---

*Verified: 2026-08-14T14:03:40Z*
*Verifier: Claude (gsd-verifier)*
