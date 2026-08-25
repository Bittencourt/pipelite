---
phase: 32-test-infrastructure-ci
plan: 05
subsystem: infra
tags: [ci, github-actions, branch-protection, merge-gate, contributing-docs]

# Dependency graph
requires:
  - phase: 32-test-infrastructure-ci
    provides: "The `typecheck`/`lint`/`test` npm scripts and scoped vitest config from 32-01"
  - phase: 32-test-infrastructure-ci
    provides: "A green test suite from 32-02 (formula-engine source fix + deleteWorkflow mock repair and cascade test)"
  - phase: 32-test-infrastructure-ci
    provides: "Zero eslint errors from 32-03 (no-explicit-any, no-unsafe-function-type, prefer-const) and 32-04 (JSX quotes, React Compiler suppressions)"
provides:
  - "`.github/workflows/ci.yml` — one `ci` job running typecheck, lint, and test on every push and pull request to master"
  - "Empirical proof that all three gates exit 0 from a clean checkout with a fresh `npm ci`, so the workflow's first GitHub run should be green"
  - "The exact `master` ruleset configuration (D-07 option B, admin bypass stated plainly) documented in CONTRIBUTING.md for plan 32-06 to apply"
  - "A drafted ROADMAP backlog entry set (999.13-999.16) for the orchestrator to apply"
affects: [32-06-merge-gate, future UI-focused phase that owns the React Compiler refactors]

# Tech tracking
tech-stack:
  added:
    - "actions/checkout@v7 (GitHub Actions, first-party)"
    - "actions/setup-node@v7 (GitHub Actions, first-party)"
  patterns:
    - "Single-job multi-gate CI: one `npm ci`, three gate steps, `if: ${{ !cancelled() }}` on the trailing gates so every failure reports in one run"
    - "Least-privilege workflow: explicit `permissions: contents: read`, zero secrets, zero service containers"
    - "No workflow-level path filter on any required-check workflow"

key-files:
  created:
    - .github/workflows/ci.yml
  modified:
    - CONTRIBUTING.md

key-decisions:
  - "Node 24 in CI, not the Dockerfile's node:20-alpine — the binding floor is vite 7's `engines: ^20.19.0 || >=22.12.0`, reached transitively via vitest"
  - "One job with three steps rather than three parallel jobs — one `npm ci`, and one check name for plan 32-06 to require"
  - "No `paths:` filter, so the required check can never sit permanently pending on a docs-only PR"
  - "CONTRIBUTING.md states the admin bypass explicitly rather than describing the gate as absolute (D-07 option B, threat T-32-30)"
  - "ROADMAP.md was NOT edited — the orchestrator owns that file in parallel execution; the backlog entries are drafted verbatim below instead"

patterns-established:
  - "Prove every CI gate on a disposable `git worktree` + real `npm ci` before the workflow file lands, so the first remote run cannot be red for a locally knowable reason"

requirements-completed: [CI-04]

# Metrics
duration: 12min
completed: 2026-08-14
---

# Phase 32 Plan 05: CI Workflow & Merge-Gate Docs Summary

**A single-job `ci` GitHub Actions workflow runs typecheck, lint, and test on every push and pull request to `master` — committed only after all three gates were proven to exit 0 on a disposable clean checkout with a real `npm ci` (41 test files, 455 tests, 0 lint errors).**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-14T13:24Z
- **Completed:** 2026-08-14T13:36Z
- **Tasks:** 3 (2 producing commits; task 1 is a pre-flight gate with no files)
- **Files created:** 1 · **Files modified:** 1

## Accomplishments

- **Clean-checkout proof, run for real.** A throwaway `git worktree` (detached at the phase-merge commit `80fdda6`, no `.next/`, no `next-env.d.ts`, no `tsconfig.tsbuildinfo`, no `node_modules`) took a genuine `npm ci` and then ran the three gates in the workflow's order. All four exit codes were 0.
- **`.github/workflows/ci.yml` is the only workflow file** — one job keyed `ci`, so plan 32-06 has exactly one check name to require.
- **All three gates report in a single run.** `if: ${{ !cancelled() }}` sits on the lint and test steps only, so a PR with both a type error and a failing test surfaces both instead of costing three round trips.
- **Nothing was pushed and no GitHub setting was touched.** The workflow has never executed on a runner; that is plan 32-06's job, and it is also the ordering constraint GitHub imposes on the required-check picker.
- **CONTRIBUTING.md now documents the gate honestly**, including that a repository-admin bypass exists, plus two `gh api` audit commands so the setting is verifiable rather than folklore.

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Prove all three gates green from a clean checkout | *(no commit — pre-flight gate, no files modified)* | — |
| 2 | Create the CI workflow (CI-04) | `a675792` | `.github/workflows/ci.yml` |
| 3 | Document the merge gate and backlog the deferred fixes | `5fcf087` | `CONTRIBUTING.md` |

## Task 1 — Clean-checkout gate measurements

Disposable worktree at `$SCRATCH/clean-checkout`, detached at `80fdda6`. CI-like preconditions confirmed before installing: `has_next_dir=no`, `has_next_env=no`, `has_tsbuildinfo=no`, `has_node_modules=no`.

| Gate | Command | Exit code | Wall time | Result |
|------|---------|-----------|-----------|--------|
| Install | `npm ci` (no extra flags) | **0** | 41 s | `added 1003 packages, and audited 1004 packages` |
| Typecheck | `npm run typecheck` | **0** | 22 s | zero diagnostics (output is only npm's script banner) |
| Lint | `node ./node_modules/eslint/bin/eslint.js` | **0** | 24 s | `130 problems (0 errors, 130 warnings)` across 433 linted files, 73 files carrying messages |
| Test | `npm test` | **0** | 15 s | `Test Files 41 passed (41)` · `Tests 455 passed \| 4 skipped (459)` |

Notes on these numbers:

- **No `--legacy-peer-deps`** was needed, confirming the research finding that the Dockerfile's flag is a fresh-resolution artifact and must not be copied into CI. The `next-auth`/`nodemailer` peer conflict appears only as `npm warn`.
- **The measured figures beat the plan's predictions**, which were written before the wave-1/wave-2 merges: the plan anticipated "13 remaining eslint errors" and a 454-test suite. Actual repo-wide state is **0 eslint errors** and **455 passing tests**. The 130 warnings are the non-gating `no-unused-vars` class.
- `npm ci` reported **39 vulnerabilities (3 low, 9 moderate, 23 high, 4 critical)** in the current lockfile. Deliberately **not** acted on and deliberately **not** added as an `npm audit` step — doing so would make the required check red on day one. Drafted as backlog item 999.16 below.
- `npm run typecheck` passed with **no `npm run build` step**, re-confirming that a missing `.next/types` glob is tolerated by `tsc` and that no dummy `DATABASE_URL` is required.
- The worktree was removed with `git worktree remove --force`; the directory is gone and `git worktree list` no longer lists it.

## Files Created/Modified

### `.github/workflows/ci.yml` (new, 68 lines)

| Property | Value | Why |
|----------|-------|-----|
| Triggers | `push` → `[master]`, `pull_request` → `[master]` | `pull_request`, never the `_target` variant — fork PRs get a read-only token and no secrets |
| Path filters | **none** | A workflow skipped by a path filter never reports, and a required check that never reports leaves docs-only PRs permanently unmergeable (T-32-24) |
| `permissions` | `contents: read` and nothing else | The job only clones and runs three commands (T-32-18) |
| `concurrency` | `ci-${{ github.ref }}`, `cancel-in-progress: true` | Rapid pushes supersede in-flight runs |
| Job | key `ci`, `name: ci`, `ubuntu-latest`, `timeout-minutes: 15` | The check-run name plan 32-06 requires; the timeout bounds runaway runs |
| Steps | `actions/checkout@v7` → `actions/setup-node@v7` (`node-version: 24`, `cache: npm`) → `npm ci` → `npm run typecheck` → `npm run lint` → `npm test` | Same commands a developer runs locally |
| `if: ${{ !cancelled() }}` | on **lint** and **test** only | All three gates report in one run (Pitfall 4) |

Absent by design and each individually asserted: no `services:` block, no `DATABASE_URL`, no `secrets.*`, no `npm run build`, no `--max-warnings`, no reporter flag, no `npm audit` step, no Node matrix, no `--legacy-peer-deps`.

### `CONTRIBUTING.md` (+81 / −3)

1. **New "Continuous Integration" subsection**, placed directly after the existing "Testing Requirements" / "All tests must pass before merge" material: the `ci` check name, a table of the three gates and what makes each fail, the explanation that all three run even after an earlier failure, that lint **warnings** do not gate while lint **errors** do, that the job needs no secrets/database/build, and a four-line local reproduction block.
2. **New "Enabling the merge gate (maintainers)" subsection**: the full Settings → Rules → Rulesets → New branch ruleset path, a settings table (`master protection`, Active, Include default branch, require status check `ci`, require a pull request with **0** approvals, bypass actor **Repository admin**), the after-first-run ordering constraint, and the two `gh api` audit commands. It states in a blockquote that **an admin can land untested code on `master`** and how to make the gate absolute (remove the bypass actor).
3. **Two stale lines corrected:** `Node.js 18+` → `Node.js 20.19+ or 22.12+` naming vite 7's real `engines` range and Node 24 LTS as CI's version; the ESLint reference now points at `eslint.config.mjs` (ESLint 9 flat config) instead of the pre-migration filename.
4. Footer `Last updated` stamp refreshed to 2026-08-14. No section was restructured, no existing testing guidance removed, and **no badge added** (the workflow has not run, so a badge would render broken).

## Decisions Made

- **Documented the bypass rather than the ideal.** D-07 chose option B, which includes a repository-admin bypass actor. Describing the gate as an absolute block would have been a more flattering doc and a less accurate one; T-32-30 is precisely the risk of overstating a control. The residual risk is now written down where a maintainer will read it.
- **Comment hygiene inside `ci.yml` is load-bearing.** The plan asserts several `grep -c … == 0` criteria (`legacy-peer-deps`, `DATABASE_URL`, `services:`, `max-warnings`, `reporter`) and `!cancelled() == 2`. The research's example YAML has explanatory comments containing some of those literal strings, so the comments here were rewritten to convey the same reasoning without tripping the assertions — the prose explains *why* each thing is absent without naming the forbidden token.
- **Did not symlink `node_modules` into this worktree.** Earlier plans in this phase did so to run their verification commands; here the whole point of task 1 is a genuine install, so `npm ci` ran for real inside the disposable checkout instead.

## Deviations from Plan

### Deliberate scope change (orchestrator directive)

**1. `.planning/ROADMAP.md` was NOT modified**
- **Found during:** Task 3
- **Conflict:** The plan's `files_modified` and task 3 both call for adding backlog entry `999.13` to `ROADMAP.md`, and one must-have asserts `grep -c '999.13' .planning/ROADMAP.md >= 1`. The spawning orchestrator's instructions state twice, emphatically, that this executor must not modify `STATE.md` or `ROADMAP.md` because the orchestrator owns those writes during parallel worktree execution.
- **Resolution:** The orchestrator directive wins — a worktree edit to `ROADMAP.md` is a predictable merge conflict against the tracking commits the orchestrator makes on the same file. The backlog entries are instead drafted verbatim below, ready to paste.
- **Files modified:** none. `git diff --name-only` for task 3 lists only `CONTRIBUTING.md`.
- **Consequence:** the plan's `999.13` must-have is **not satisfied in-tree** and remains open until the orchestrator applies the block below. This is the one success criterion of plan 32-05 that this executor could not close.

### Adjusted acceptance criterion

**2. `git worktree list` shows two entries, not one**
- **Found during:** Task 1
- **Issue:** The criterion "`git worktree list` afterwards shows exactly one entry (the main checkout)" was written for serial execution. This plan runs inside a parallel-execution agent worktree, which is itself a second (locked) entry.
- **What was actually asserted:** the *disposable* clean-checkout worktree is gone. After removal, `git worktree list` shows exactly two entries — the main checkout at `~/programming/pipelite` and this locked agent worktree — with no third entry, and the scratch directory no longer exists on disk.

### Auto-fixed issues

None. No bug, missing-functionality, or blocking issue was encountered; both files were created and verified on the first pass apart from the comment-wording adjustment noted under Decisions.

---

**Total deviations:** 1 deliberate scope reduction (ROADMAP handed to the orchestrator), 1 criterion re-interpretation for the parallel-execution environment.

## ROADMAP.md backlog entries to apply (orchestrator action)

Replace the `_Empty._` sentence in `.planning/ROADMAP.md` § Backlog (line ~298) with the block below, keeping the promoted-items table beneath it intact. Item **999.13** is the one plan 32-05 explicitly requires; 999.14-999.16 were surfaced by this phase's work and are included so nothing is lost.

```markdown
**999.13 — Proper fix for the five React Compiler lint findings** (captured 2026-08-14, Phase 32)
Phase 32 suppressed five `react-hooks/*` errors with scoped `// eslint-disable-next-line <rule> -- <reason>`
comments per D-02. The rules remain at `error` severity project-wide, so a sixth occurrence still fails CI —
but these five need a real refactor in a UI-focused phase that has UI test coverage (per 32-CONTEXT.md
§ Deferred Ideas). The sites, with the full written justification for each in `32-04-SUMMARY.md`
§ Suppression Register:

| # | File:Line | Rule |
|---|-----------|------|
| 1 | `src/app/(auth)/reset-password/page.tsx:42` | `react-hooks/set-state-in-effect` |
| 2 | `src/app/(auth)/verify-email/page.tsx:20` | `react-hooks/immutability` |
| 3 | `src/app/settings/profile/profile-settings-form.tsx:38` | `react-hooks/set-state-in-effect` |
| 4 | `src/components/ui/relative-time.tsx:17` | `react-hooks/set-state-in-effect` |
| 5 | `src/app/import/import-wizard.tsx:91` | `react-hooks/preserve-manual-memoization` |

Each is behaviour-adjacent (auth error UX, single-use token fetch, hydration guard, wizard step
transitions), which is why none was mechanically "fixed" inside an infrastructure phase.
Grep the live set with `grep -rn 'eslint-disable-next-line react-hooks/' src/`.

**999.14 — Dockerfile pins `node:20-alpine`, below vite 7's engines floor** (captured 2026-08-14, Phase 32)
`vite@7.3.1` declares `engines: ^20.19.0 || >=22.12.0`, reached transitively via vitest. The image tag
currently resolves to something >= 20.19 (the container builds today), so this is latent rather than broken.
CI pins Node 24 and does not inherit the Dockerfile's tag. Resolution: raise the base image, or pin the
patch explicitly so a future `node:20-alpine` rebuild cannot drift below the floor.
Source: `32-RESEARCH.md` Open Question 4 / Pitfall 6.

**999.15 — `GET /api/v1/stages/:id` returns 403 to the legitimate owner** (captured 2026-08-14, Phase 32)
The ownership check reads `stage.pipeline`, which is only loaded when `?expand=pipeline` is passed, so a
request without that query parameter fails authorization for the resource owner. Found by plan 32-03 and
deliberately left unchanged there because T-32-10 required that plan's typing work to be behaviour-neutral.
This is a real pre-existing auth bug, not a typing artifact — fixing it changes runtime behaviour and needs
its own test. See `32-03-SUMMARY.md` § Decisions Made.

**999.16 — 39 npm advisories in the committed lockfile** (captured 2026-08-14, Phase 32)
`npm ci` reports 39 vulnerabilities (3 low, 9 moderate, 23 high, 4 critical). CI-04 does not ask for an
audit gate, and adding `npm audit --audit-level=high` to `ci.yml` would make the required check red on day
one, so it was deliberately not bolted on. Resolution: triage the criticals/highs, then decide whether an
audit step or a `.npmrc` audit policy belongs in CI.
```

## Issues Encountered

- **The `rtk` shell hook corrupts `wc -l` and `grep -c`** (it prints a match summary instead of a count). Every count in this SUMMARY was taken via `node -e`/`node <script>` reading a redirected output file — including the eslint error/warning split, which came from `--format json` and a `severity === 2` tally rather than from parsing the human-readable summary line. Vitest's ANSI escapes also had to be stripped in JS before the `Test Files` / `Tests` lines were legible.
- **Worktree base correction.** The agent worktree started at `04fc549`, an ancestor of the assigned base `80fdda6`. `git merge-base --is-ancestor` confirmed the reset was a fast-forward (no commit was discarded) before `git reset --hard 80fdda6` ran, per the startup protocol.

## Verification Evidence

```
Clean disposable worktree (detached @ 80fdda6, no .next/next-env.d.ts/tsbuildinfo/node_modules)
  npm ci                                  -> exit 0   41s   1003 packages, no --legacy-peer-deps
  npm run typecheck                       -> exit 0   22s   zero diagnostics
  eslint (direct bin invocation)          -> exit 0   24s   0 errors / 130 warnings / 433 files
  npm test                                -> exit 0   15s   41 files passed, 455 passed | 4 skipped
  git worktree remove --force             -> exit 0, directory gone, no third worktree entry

.github/workflows/ci.yml  (25 assertions + permissions block, all PASS)
  YAML parses                             -> jobs=[ci], triggers=[push, pull_request], steps=6
  workflow files in .github/workflows     -> 1
  ^name: CI                               -> 1
  pull_request_target                     -> 0
  ^\s*(paths|paths-ignore):               -> 0
  permissions block contents              -> ["contents: read"]  (exactly one entry)
  node-version: 24                        -> 1
  cache: npm                              -> 1
  actions/checkout@v7 / setup-node@v7     -> 1 / 1
  run: npm ci                             -> 1
  npm run typecheck / npm run lint / npm test -> 1 / 1 / 1
  !cancelled()                            -> 2   (lint + test only)
  cancel-in-progress: true                -> 1
  timeout-minutes                         -> 1
  ^  ci:                                  -> 1
  services: / DATABASE_URL / secrets.     -> 0 / 0 / 0
  legacy-peer-deps / max-warnings         -> 0 / 0
  npm run build / reporter / npm audit    -> 0 / 0 / 0

CONTRIBUTING.md
  ci.yml                                  -> 2
  Require status checks                   -> 2
  Require a pull request before merging   -> 2
  gh api repos/Bittencourt/pipelite/rulesets -> 1
  Node.js 18+                             -> 0
  eslintrc                                -> 0
  bypass (admin residual risk stated)     -> 3 lines

Scope
  git diff --name-only (task 2)           -> .github/workflows/ci.yml
  git diff --name-only (task 3)           -> CONTRIBUTING.md
  STATE.md / ROADMAP.md in any commit     -> 0
  file deletions in either commit         -> 0
  git status --short after both commits    -> clean
  git push / gh api mutations run          -> none
```

Neither new file can affect a gate: `eslint.config.mjs` loads only the two `eslint-config-next` presets (no YAML or Markdown plugin), `tsconfig.json` collects only TS sources, and `vitest.config.ts` collects only `src/**`. The clean-checkout proof therefore remains valid for the tree as committed.

## Known Stubs

None. Both artifacts are complete and self-contained.

The one piece of *external* incompleteness is intentional and belongs to the next plan: `ci.yml` has never run on a GitHub runner, and no ruleset exists (`gh api …/rulesets` returned `[]` during research). Plan 32-06 owns pushing, the first run, creating the `master` ruleset, and the throwaway-PR verification. GitHub's required-check picker only offers checks it has recently observed, so that ordering is forced, not chosen.

## Threat Flags

None new. The plan's register is fully addressed in-tree:

| Threat | Status |
|--------|--------|
| T-32-18 over-privileged `GITHUB_TOKEN` | mitigated — `permissions: contents: read`, verified as the only entry in the block |
| T-32-19 fork-code privilege escalation | mitigated — `pull_request`; the `_target` variant appears nowhere in the file |
| T-32-20 secret leakage into logs | mitigated — no `secrets.*`, no `DATABASE_URL`, nothing to leak |
| T-32-21 third-party action tampering | mitigated — two first-party actions on major tags (`sha_pinning_required: false` on this repo); full-SHA pinning remains an available hardening step |
| T-32-22 dependency re-resolution | mitigated — `npm ci`, proven exit 0 |
| T-32-23 npm cache | accepted — `cache: npm` caches the global npm cache only, and this job holds no npm token |
| T-32-24 required check that never reports | mitigated — no path filter, plus `timeout-minutes: 15` and `cancel-in-progress: true` |
| T-32-25 undocumented merge gate | mitigated — full ruleset settings and two `gh api` audit commands in `CONTRIBUTING.md` |
| T-32-30 overstating the control | mitigated — the admin bypass is stated plainly as residual risk, with the remedy named |
| T-32-SC package legitimacy | n/a — zero packages installed by this plan; the only third-party code is the two actions above |

One item is knowingly **accepted, not mitigated**: the 39 lockfile advisories (drafted as 999.16). Adding an audit gate now would make the required check red on its first run, which teaches contributors to ignore CI.

## User Setup Required

**One manual step remains, and it is plan 32-06's, not the user's to do blind.** Branch protection has no in-repo representation, so after `ci.yml` has run at least once on `master`, a maintainer must create the ruleset documented in `CONTRIBUTING.md` § "Enabling the merge gate (maintainers)". Verify with:

```bash
gh api repos/Bittencourt/pipelite/rulesets
```

## Next Phase Readiness

- CI-04's file deliverable is complete and its gates are proven green from a genuine clean install, so plan 32-06 can push and expect a green first run. The one unproven assumption is research A1: `argon2`'s native binding on a GitHub-hosted runner. It built clean on linux-x64 here in the disposable checkout, and the first CI run settles it in about a minute.
- **Handoff to the orchestrator:** apply the backlog block above to `.planning/ROADMAP.md` (999.13 is required by this plan's must-haves).
- **Handoff to plan 32-06:** the required check name is exactly `ci`; the ruleset settings are already written down; nothing has been pushed and no GitHub setting has been touched.
- No blockers.

## Self-Check: PASSED

- `FOUND .github/workflows/ci.yml`, `FOUND CONTRIBUTING.md`, `FOUND .planning/phases/32-test-infrastructure-ci/32-05-SUMMARY.md`
- All three commits exist: `a675792`, `5fcf087`, `eb06eb8` (this SUMMARY commit).
- `git diff --name-only 80fdda6..HEAD` lists exactly three paths: `.github/workflows/ci.yml`, `.planning/phases/32-test-infrastructure-ci/32-05-SUMMARY.md`, `CONTRIBUTING.md`. **`STATE.md` and `ROADMAP.md` are absent from the range.**
- The SUMMARY is tracked (`git ls-files` returns it) — added with `git add -f` because `.planning/` is gitignored while its contents are tracked.
- Working tree clean; `git worktree list` shows the main checkout plus this locked agent worktree, and no disposable third entry.
- No `git push`, no PR, no `gh api` mutation was executed.

---
*Phase: 32-test-infrastructure-ci*
*Completed: 2026-08-14*
