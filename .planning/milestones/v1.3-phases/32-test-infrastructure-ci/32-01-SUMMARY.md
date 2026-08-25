---
phase: 32-test-infrastructure-ci
plan: 01
subsystem: testing
tags: [vitest, npm-scripts, typescript, tsc, test-collection]

# Dependency graph
requires:
  - phase: 23
    provides: "vitest.config.ts at repo root with resolve.alias for @/ (commit 1eeae14)"
provides:
  - "`npm test` — one-shot full-suite run (`vitest run`) with non-zero exit on failure"
  - "`npm run test:watch` — watch-mode entry point, isolated from `npm test`"
  - "`npm run typecheck` — named `tsc --noEmit` entry point for the CI workflow step"
  - "Test collection scoped to src/ only: 41 files, zero from .next/ or node_modules/"
affects: [32-02, 32-03, 32-04, 32-05, 32-06, ci-workflow, contributing-docs]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "vitest test.exclude always spreads configDefaults.exclude (override, not append)"
    - "test.include anchored at src/ so gitignored build output cannot be collected"

key-files:
  created: []
  modified:
    - vitest.config.ts
    - package.json

key-decisions:
  - "Kept both `include` (anchored at src/) and `exclude` (**/.next/**) even though they are redundant — CI-02 names both surfaces and they fail in different directions"
  - "Excluded the stale .next/standalone test copy via config rather than deleting it — .next/ is gitignored build output that regenerates on every build"
  - "No --max-warnings gate and no pretest hook, per plan constraints"

patterns-established:
  - "Pattern: spread `...configDefaults.exclude` in any vitest exclude array — a bare array silently re-enables node_modules collection"
  - "Pattern: `\"test\": \"vitest run\"` never bare `vitest` — watch mode never returns an exit code to CI"

requirements-completed: [CI-01, CI-02]

# Metrics
duration: 12min
completed: 2026-08-14
---

# Phase 32 Plan 01: Test Entry Points & Collection Scoping Summary

**`npm test`/`npm run typecheck` now exist as one-shot entry points, and vitest collects exactly the 41 source test files under `src/` — the stale `.next/standalone/src/lib/formula-engine.test.ts` copy no longer runs as a second suite.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-14T11:54:00Z
- **Completed:** 2026-08-14T12:06:01Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `vitest.config.ts` gained an `include` anchored at `src/` and an `exclude` that **spreads** `configDefaults.exclude` before adding `**/.next/**`, so `node_modules/**` and `.git/**` stay excluded (T-32-01, T-32-03).
- Collected file count dropped 42 → 41 with zero paths under `.next/` or `node_modules/`, verified against a faithfully reproduced baseline.
- `package.json` gained `test`, `test:watch`, and `typecheck`; all nine pre-existing scripts preserved verbatim.
- `npm run typecheck` exits 0 on a checkout with no `.next/`, no `next-env.d.ts`, and no `tsconfig.tsbuildinfo` — confirming Research Pitfall 5 (no Next.js build step needed before `tsc`).
- `npm test` runs the suite in one shot and exits **1** on the two known CI-03 failures — the "fails loudly" half of CI-01.

## Task Commits

1. **Task 1: Scope vitest collection to src/ and exclude .next** — `ecb4ca8` (chore)
2. **Task 2: Add test, test:watch, and typecheck npm scripts** — `6c461e9` (chore)

## Files Created/Modified

- `vitest.config.ts` — added `test.include` (`src/**/*.{test,spec}.?(c|m)[jt]s?(x)`) and `test.exclude` (`[...configDefaults.exclude, '**/.next/**']`); `globals`, `environment`, and `resolve.alias` untouched.
- `package.json` — added `typecheck: "tsc --noEmit"`, `test: "vitest run"`, `test:watch: "vitest"` adjacent to the existing `lint` script.

## Verification Results

| Check | Expected | Actual |
|-------|----------|--------|
| Baseline `vitest list --filesOnly` count | 42 | 42 |
| Baseline paths under `.next/` | 1 | 1 (`.next/standalone/src/lib/formula-engine.test.ts`) |
| Post-change collected count | 41 | 41 |
| Post-change paths under `.next/` | 0 | 0 |
| Post-change paths under `node_modules/` | 0 | 0 |
| `vitest run` result | `2 failed \| 39 passed (41)` | `2 failed \| 39 passed (41)` |
| `npm run typecheck` exit | 0 | 0 |
| `npm test` exit | non-zero | 1 |
| `grep -c max-warnings package.json` | 0 | 0 |
| Pre-existing scripts preserved | all 9 | all 9 |

The two remaining failures are exactly the known CI-03 pair, unchanged by this plan:
- `src/lib/formula-engine.test.ts > evaluateFormula > handles LOGIC.isBlank function`
- `src/lib/mutations/workflows.test.ts > deleteWorkflow > deletes existing workflow`

Plan 32-02 closes them.

## Decisions Made

None beyond the plan — followed it as specified, including the deliberate `include`/`exclude` redundancy and the prohibition on deleting the `.next` copy.

## Deviations from Plan

None — plan executed exactly as written. No source-code deviation rules fired.

## Issues Encountered

**Worktree lacked the artifacts needed to verify the fix.** This parallel-execution worktree had no `node_modules/` (so vitest could not run) and no `.next/` (so the 42-file baseline the plan's acceptance criteria are written against could not be reproduced — collection would have measured 41 both before and after, proving nothing).

Resolved with environment setup only, no repo changes:
- Symlinked `node_modules` to the main checkout's tree. **No package was installed** — zero registry access, `package-lock.json` untouched, consistent with threat T-32-SC (`accept`, "this plan installs zero packages").
- Copied the single file `.next/standalone/src/lib/formula-engine.test.ts` from the main checkout to reproduce the exact 42-file baseline.

Both paths are gitignored (`.gitignore:17` covers `/.next/`); `git status` stayed clean throughout and neither appears in either commit.

**Tooling note for later plans in this phase:** the shell's `rtk` hook mangles the output of `grep -c` and `wc -l` (a real 42-line file reported `0` from `wc -l`). Every count in the table above was taken via `node -e` reading a redirected output file. Plans 32-02 through 32-06 should do the same rather than trusting inline pipe counts.

## Threat Model Compliance

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-32-01 (exclude replacement → node_modules execution) | mitigate | Applied — `...configDefaults.exclude` spread present; verified 0 collected paths contain `node_modules` |
| T-32-02 (unreviewed .next test influences merge gate) | mitigate | Applied — `include` anchored at `src/`, plus redundant `**/.next/**` exclude; verified 0 collected paths start with `.next` |
| T-32-03 (unbounded node_modules walk → CI timeout) | mitigate | Applied — same fix; suite runs in ~13-19 s, well under the 15-min cap planned for 32-05 |
| T-32-04 (watch mode hangs CI) | mitigate | Applied — `"test": "vitest run"`; watch mode isolated to `test:watch` |
| T-32-SC (package install) | accept | Nothing to audit — zero packages installed, `package-lock.json` unmodified |

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- CI-01 and CI-02 are satisfied. Every downstream gate in this phase can now verify through `npm test`.
- Plan 32-02 has a stable 41-file suite to work against and must drive `npm test` to exit 0 by repairing the two named failures.
- Plan 32-05's workflow can call `npm run typecheck` and `npm test` directly; both were exercised end-to-end here.
- No blockers.

## Self-Check: PASSED

- `vitest.config.ts` — FOUND (modified)
- `package.json` — FOUND (modified)
- `.planning/phases/32-test-infrastructure-ci/32-01-SUMMARY.md` — FOUND
- Commit `ecb4ca8` — FOUND
- Commit `6c461e9` — FOUND

---
*Phase: 32-test-infrastructure-ci*
*Completed: 2026-08-14*
