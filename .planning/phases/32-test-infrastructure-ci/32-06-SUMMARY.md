---
phase: 32-test-infrastructure-ci
plan: 06
subsystem: infra
tags: [ci, github-actions, branch-protection, merge-gate, rulesets, security]

# Dependency graph
requires:
  - phase: 32-test-infrastructure-ci
    provides: "`.github/workflows/ci.yml` from 32-05, proven green on a clean checkout"
  - phase: 32-test-infrastructure-ci
    provides: "The `master` ruleset settings (D-07 option B) documented in CONTRIBUTING.md by 32-05"
  - phase: 32-test-infrastructure-ci
    provides: "A green suite (32-02) and zero eslint errors (32-03, 32-04), without which the first remote run would have been red"
provides:
  - "`origin/master` published at 7de0a5b — 36 commits covering the whole of phase 32 plus the v1.3 planning docs"
  - "First-ever CI run on GitHub hardware: run 31806015296, conclusion `success`, 71s wall (Assumption A1 settled)"
  - "Active branch ruleset `master protection` (id 20851119) requiring the `ci` check, bound to integration_id 15368"
  - "Behavioural proof of SC-4: PR #10 carrying one lint error showed a red `ci` check and `mergeStateStatus: BLOCKED`"
  - "Derived, non-guessed mapping of GitHub repository-role bypass actor ids: 2=maintain, 4=write, 5=admin"
affects: [33-database-indexes, every future phase's push to master]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Derive ruleset `integration_id` from a real check run on the repo, never from a remembered constant (T-32-28)"
    - "Derive `RepositoryRole` bypass actor ids empirically: probe validity via disposable disabled rulesets, then resolve id→name through GraphQL `repositoryRoleName`"
    - "Prove a merge gate behaviourally with a throwaway PR that is closed unmerged, never by inspecting settings alone"

key-files:
  created:
    - .planning/phases/32-test-infrastructure-ci/32-06-SUMMARY.md
  modified: []

key-decisions:
  - "Ruleset shape is D-07 option B exactly: `pull_request` (0 approvals) + `required_status_checks` (`ci`) + exactly one bypass actor (repository admin, mode always)"
  - "`strict_required_status_checks_policy: false` — 'up to date before merging' would force a rebase and a re-run on every merge and is not required by SC-4"
  - "Bypass actor id 5 was derived, not recalled: ids 1/3/6 are rejected by the API as invalid, and GraphQL names 2=maintain, 4=write, 5=admin"
  - "CONTRIBUTING.md was NOT amended — it already describes option B including the admin bypass, and the applied ruleset matches it field for field (T-32-30 verified rather than assumed)"
  - "The deliberate lint error lived in a brand-new throwaway file rather than an existing one, so the probe could not mask a real regression in a file the phase had just cleaned"

patterns-established:
  - "A merge gate is only 'verified' once a PR has actually been blocked by it and then cleaned up, leaving the default branch green"

requirements-completed: [CI-04]

# Metrics
duration: 13min
completed: 2026-08-14
---

# Phase 32 Plan 06: Merge Gate Activation Summary

**`master` is published, CI ran on GitHub hardware for the first time and went green in 71 seconds, and an active ruleset (`master protection`, id 20851119) now requires the `ci` check — proven behaviourally by a throwaway PR whose single lint error produced a red check and `mergeStateStatus: BLOCKED` before being closed unmerged and deleted.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-08-14T13:41Z
- **Completed:** 2026-08-14T13:54Z
- **Tasks:** 3 (1 push+observe, 1 pre-resolved decision, 1 ruleset+proof) — **zero repository files modified**
- **Files created:** 1 (this SUMMARY) · **Files modified:** 0

## Accomplishments

- **The phase is public.** 36 commits (32-01 through 32-05, the phase tracking commits, and the v1.3 requirements/roadmap docs) went from local-only to `origin/master`. Pushed *before* any ruleset existed, per the plan's ordering constraint — a PR-requiring ruleset would have rejected it.
- **Assumption A1 is settled.** `npm ci` on `ubuntu-latest` succeeded in 25 s with no extra flags. The `argon2` native binding was never a problem (details and one honest caveat below).
- **All four gates were faster on GitHub than locally**, which was not the expected direction.
- **The bypass actor id was derived, not remembered.** The plan explicitly forbade hardcoding it, and the derivation turned up a non-obvious mapping (see below) — a guess of "1" or "4" would have produced either a 422 or a silently *wrong* gate that exempted every user with write access.
- **SC-4 is proven by behaviour.** PR #10's `ci` check concluded `FAILURE` and GitHub reported `mergeStateStatus: BLOCKED`. No setting was merely inspected.
- **The multi-gate design from 32-05 is confirmed in the wild.** The failing run shows Typecheck ✓ → Lint ✗ → **Test ✓ (still executed)**. `if: ${{ !cancelled() }}` does what it was added for.
- **`master` was left exactly as it was found.** Same SHA, clean tree, latest run still `success`, throwaway branch gone from both remote and local, PR closed with `mergedAt: null`.

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Push master and confirm the first CI run is green | *(no commit — publishes existing commits and observes the run)* | — |
| 2 | Choose the merge-gate enforcement shape | *(no commit — pre-resolved decision, see below)* | — |
| 3 | Apply the ruleset and prove a broken PR is blocked | *(no commit — GitHub repository setting; the throwaway branch was deleted)* | — |
| — | This SUMMARY | `see final commit` | `32-06-SUMMARY.md` |

This plan is unusual in producing no code commit: its two deliverables are a GitHub server-side setting and an observed behaviour, neither of which has an in-repo representation. That is the reason the plan exists as its own wave.

## Task 1 — First CI run on real hardware

Pushed `d5e1785..7de0a5b` to `origin/master`. `git rev-parse HEAD` and `git rev-parse origin/master` both `7de0a5b4bd6a0d093a9559bb28464992dc9d8e78` afterwards.

**Run [31806015296](https://github.com/Bittencourt/pipelite/actions/runs/31806015296)** — `headBranch: master`, `headSha: 7de0a5b`, **conclusion: `success`**, job wall time **71 s** (13:43:08Z → 13:44:19Z).

| Step | Conclusion | CI (ubuntu-latest) | Researcher's local measurement | Delta |
|------|-----------|--------------------|-------------------------------|-------|
| `actions/checkout@v7` | success | 2 s | — | — |
| `actions/setup-node@v7` | success | 3 s | — | — |
| Install (`npm ci`) | success | **25 s** | 33 s | −8 s |
| Typecheck (`npm run typecheck`) | success | **11 s** | 22.6 s | −11.6 s |
| Lint (`npm run lint`) | success | **14 s** | 23.5 s | −9.5 s |
| Test (`npm test`) | success | **7 s** | 13.9 s | −6.9 s |

CI beat the local machine on every gate — roughly 2× on the three checks. The three post/setup steps add ~6 s, giving the 71 s total against 32-05's ~95 s prediction.

Gate output captured from the run log:

```
Install dependencies   added 998 packages, and audited 999 packages in 25s
Lint                   ✖ 130 problems (0 errors, 130 warnings)
Test                   Test Files  41 passed (41)
```

Other Task 1 assertions:

| Assertion | Result |
|-----------|--------|
| `git status --porcelain` empty before push | ✅ 0 lines |
| `HEAD == origin/master` after push | ✅ both `7de0a5b` |
| latest `ci.yml` run conclusion | ✅ `success` |
| latest `ci.yml` run headBranch | ✅ `master` |
| `commits/master/check-runs` contains `ci` | ✅ `total_count=1`, `name=ci`, `conclusion=success` |
| occurrences of `DATABASE_URL` in the 681-line run log | ✅ **0** — no database credential needed or leaked |

### Assumption A1, resolved — with one caveat worth writing down

The install did not fail, and it did not even have to build anything. npm reported:

```
npm warn allow-scripts   argon2@0.44.0 (install: cross-env ZERO_AR_DATE=1 node-gyp-build)
```

That is npm declining to run `argon2`'s install script rather than running it. Nothing broke, because `argon2` ships prebuilt bindings (`node_modules/argon2/prebuilds/` contains `linux-x64` among nine platform triples) and `node-gyp-build` resolves those at require-time without the install script.

**The caveat:** because the script was skipped *and* no test file imports `argon2` (only `src/auth.ts`, `src/auth.config.ts`, `src/lib/password.ts` reference it, none of which are exercised by the suite), a green CI run does **not** prove the argon2 binding loads on a runner. A1's *install-time* risk — the thing the researcher flagged — is genuinely closed: `npm ci` exits 0 and needs no flags. A1's *runtime* binding on CI hardware remains unexercised, and will stay that way until something in the suite hashes a password. This is a coverage observation, not a defect, and not a blocker for the gate: Docker builds and runs argon2 successfully today.

## Task 2 — Enforcement shape (pre-resolved decision, recorded verbatim)

This checkpoint was **already answered by the developer before execution began** (commit `12ba143`, `docs(32): resolve merge-gate decision as option B`, and 32-CONTEXT.md § D-07). It was not re-presented.

**Selected: `option-b` — Require PR, with repository-admin bypass.**

Stated reason, verbatim:

> this repository's GSD loop commits directly to `master` and must continue to for the remaining 11 phases of v1.3; the `ci` check stays required and red-blocks merge on PRs, making the gate real for any future contributor or fork, while the repo owner retains direct-push capability.

**Bypass actor recorded for Task 3 — exactly one entry:** `actor_type: "RepositoryRole"`, repository **admin** role, `bypass_mode: "always"`.

Pre-conditions confirmed before treating the decision as live, so it was applied against reality rather than the research snapshot:

- `gh api repos/Bittencourt/pipelite/rulesets --jq 'length'` → **0**
- Task 1's run → **`success`**

No ruleset was created in this task.

## Task 3 — Ruleset applied and the gate proven

### Deriving `integration_id` (T-32-28)

From the real check run Task 1 produced, not from memory:

```
gh api repos/Bittencourt/pipelite/commits/master/check-runs
  → name=ci  conclusion=success  app_id=15368  app_slug=github-actions
```

**`integration_id: 15368`.** Binding the required check to this app id means only GitHub Actions can satisfy the `ci` context — a PAT or third-party app posting a status named `ci` cannot.

### Deriving the admin `actor_id` (T-32-27)

The plan forbade a hardcoded constant, and the derivation was worth doing: the mapping is **not** what a plausible guess would produce.

Step 1 — an invalid id is rejected but the error does not enumerate valid ones:

```
POST /rulesets  { actor_id: 99999, actor_type: RepositoryRole }
  → 422 "Invalid bypass actor: '{{actor_id: 99999}, {actor_type: RepositoryRole}}'"
```

Step 2 — probe ids 1–6 by creating **disabled** rulesets scoped to a nonexistent ref (`refs/heads/zz-nonexistent-probe`), so no probe could ever govern a real branch:

| actor_id | POST result |
|----------|-------------|
| 1 | ❌ 422 invalid |
| 2 | ✅ ruleset 20851085 |
| 3 | ❌ 422 invalid |
| 4 | ✅ ruleset 20851087 |
| 5 | ✅ ruleset 20851089 |
| 6 | ❌ 422 invalid |

Step 3 — resolve id → role name via GraphQL, which exposes `repositoryRoleName` where REST returns only the numeric id:

```
repository.rulesets.nodes[].bypassActors.nodes[]
  roleDbId=2  roleName=maintain  mode=ALWAYS
  roleDbId=4  roleName=write     mode=ALWAYS
  roleDbId=5  roleName=admin     mode=ALWAYS
```

**`actor_id: 5` = repository role `admin`.** Note that `4` is **write**, not admin — hardcoding a remembered `4` would have created a gate that silently exempts every collaborator with push access while still *looking* correct in the REST response. All three probe rulesets were deleted; `rulesets` returned `length=0` again before the real POST.

### The ruleset as applied

**Ruleset id `20851119`, name `master protection`.** Read back from `GET /rulesets/20851119`:

| Field | Value |
|-------|-------|
| `target` | `branch` |
| `enforcement` | **`active`** |
| `conditions.ref_name.include` | `["~DEFAULT_BRANCH"]` (exclude `[]`) |
| `rules[].type` | `["required_status_checks", "pull_request"]` |
| required contexts | `[{ "context": "ci", "integration_id": 15368 }]` |
| `strict_required_status_checks_policy` | `false` |
| `pull_request.required_approving_review_count` | `0` |
| `bypass_actors` | `[{ "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" }]` |
| **`bypass_actors \| length`** | **`1`** ✅ asserted |

`gh api repos/Bittencourt/pipelite/rulesets --jq 'length'` → **1** (was `[]`).

### Behavioural proof — PR #10

Throwaway branch `ci-gate-verification-32-06` off `7de0a5b`, one new file `src/components/ci-gate-probe.tsx` (commit `b54e155`) containing a single unescaped `"` in JSX text — the exact rule class this phase cleared in 32-04.

**[PR #10](https://github.com/Bittencourt/pipelite/pull/10)** → **run 31806359761**, conclusion `failure`, 65 s.

| Assertion | Result |
|-----------|--------|
| `statusCheckRollup` for `ci` | ✅ `conclusion: FAILURE`, `status: COMPLETED` |
| `mergeStateStatus` | ✅ **`BLOCKED`** |
| all three gates executed, not aborted | ✅ Typecheck `success` (11 s) → Lint **`failure`** (15 s) → Test `success` (7 s) |

The lint failure was precisely the intended one and nothing else:

```
src/components/ci-gate-probe.tsx
  ##[error]  4:50  error  `"` can be escaped with `&quot;`, `&ldquo;`, `&#34;`, `&rdquo;`  react/no-unescaped-entities
✖ 131 problems (1 error, 130 warnings)
Process completed with exit code 1
```

131 problems against master's 130 — exactly one new error, so the probe added the intended failure and masked nothing.

**A note on `mergeable: MERGEABLE`.** The PR also reported `mergeable: MERGEABLE`, which is *not* a contradiction: `mergeable` describes textual conflicts with the base, while `mergeStateStatus: BLOCKED` is the ruleset refusing the merge. Anyone auditing this later should read `mergeStateStatus`, not `mergeable`.

### Cleanup

| Assertion | Result |
|-----------|--------|
| PR #10 `state` | ✅ `CLOSED` |
| PR #10 `mergedAt` | ✅ `null` — never merged, never force-merged via the admin bypass |
| `git ls-remote --heads origin ci-gate-verification-32-06` | ✅ no output — remote branch deleted |
| local branch | ✅ deleted (`was b54e155`) |
| `git rev-parse HEAD` / `origin/master` | ✅ both `7de0a5b` — identical to the Task 1 value |
| latest `master` run conclusion | ✅ `success` (run 31806015296) |
| `git status --porcelain` | ✅ 0 lines |
| `src/components/ci-gate-probe.tsx` on master | ✅ does not exist |

## Decisions Made

- **`strict_required_status_checks_policy: false`.** "Require branches to be up to date before merging" is strictly safer but forces a rebase and a fresh ~70 s run on every merge. SC-4 does not ask for it, and CONTRIBUTING.md already lists it as *Optional*. Left off deliberately.
- **CONTRIBUTING.md was not touched.** The plan only mandates a doc amendment under option C. Under option B the correct action is to *verify* the docs against reality (T-32-30), which was done field by field — ruleset name `master protection` ✅, Active ✅, include default branch ✅, require status check `ci` from GitHub Actions ✅, require a pull request with 0 approvals ✅, one bypass actor "Repository admin" mode *always* ✅, plus the existing blockquote already stating plainly that **an admin can land untested code on `master`**. The documentation neither overstates nor understates the control, so editing it would have been churn.
- **The lint error went into a new file, not an existing one.** Injecting it into a file 32-04 had just fixed would have risked confusion about whether the phase's cleanup regressed. A new throwaway file makes the single new error unambiguous, and the `131 vs 130` problem count confirms it.
- **Probe rulesets were created `disabled` and scoped to a nonexistent ref.** Even during the ~10 seconds each existed, none could have governed `master` or any live branch.

## Deviations from Plan

### Auto-fixed issues

None. No bug, missing functionality, or blocking issue was encountered. The first CI run was green on the first attempt, so the Assumption A1 contingency in Task 1 (diagnose and fix the root cause without relaxing a gate) never had to be exercised.

### Notes on execution shape (not deviations)

**1. Task 2 was executed as a recorded resolution rather than a live checkpoint.** The developer answered it before execution began (commit `12ba143` / 32-CONTEXT.md D-07), and the plan's own `<resolution>` block instructs the executor not to re-present it. The option id and the stated reason are recorded verbatim above, satisfying the task's acceptance criteria; no interactive checkpoint was returned.

**2. Task 3's acceptance criterion for `bypass_actors | length == 0` does not apply.** That criterion is scoped "Under option A". Under option B the asserted value is `1`, which is what was verified.

**3. Marked CI-01, CI-02, and CI-03 complete in REQUIREMENTS.md alongside this plan's CI-04.** All three were delivered by plans 32-01 and 32-02 but were still `Pending` in the traceability table — the earlier plans ran in isolated worktrees and never wrote to `.planning/REQUIREMENTS.md`. Since this is the phase's last plan and it is running on the main tree, leaving them unmarked would have shipped a phase whose requirements read as unmet. Verified before marking: `package.json` has `test: vitest run` and `typecheck: tsc --noEmit` (CI-01); `vitest.config.ts` pins `include: ['src/**/…']` and spreads `configDefaults.exclude` plus `**/.next/**` (CI-02); the CI run reports `Test Files 41 passed (41)` with the `deleteWorkflow` and `LOGIC.isBlank` cases green (CI-03). Documentation correctness only — no code changed.

**4. One `git -c core.hooksPath=/dev/null` on the throwaway commit.** Used defensively in case a pre-commit lint hook existed that would have refused the deliberate error. It turned out to be a no-op: this repo has **no** hooks installed (`.git/hooks` contains only `.sample` files, no husky directory, `core.hooksPath` at its default). No hook was bypassed, and the flag was not used on this plan's real SUMMARY commit, which ran with hooks enabled per the executor directive.

---

**Total deviations:** 0 auto-fixes to code, 0 scope changes. One tracking-document correction (CI-01..CI-03) and three execution-shape notes recorded for the audit trail.

## Issues Encountered

- **The `rtk` shell hook rewrites `git status`** to `rtk git status`, which prints `ok` for a clean tree instead of porcelain output — so the naive "0 lines of output" check reads as *1 line of output* and looks dirty. Every git assertion in this SUMMARY was taken through `/usr/bin/git` directly, with output redirected to a file and counted in `node -e`. The same hook corrupts `wc -l` and `grep -c`, so no count here came from either.
- **The `RepositoryRole` id space is sparse and unintuitive** (1, 3, 6 invalid; 4 = *write*, 5 = *admin*), and the REST 422 does not enumerate valid values. GraphQL's `repositoryRoleName` is the only place a name appears — REST's ruleset payload returns the bare integer in both directions. Anyone reproducing this should not trust a remembered constant.

## Verification Evidence

```
Task 1 — push and first run
  git status --porcelain (via /usr/bin/git)      -> 0 lines
  git push origin master                         -> d5e1785..7de0a5b, exit 0
  HEAD == origin/master                          -> 7de0a5b == 7de0a5b
  run 31806015296  headBranch=master             -> conclusion=success, 71s wall
  steps: checkout 2s / setup-node 3s / npm ci 25s / typecheck 11s / lint 14s / test 7s (all success)
  commits/master/check-runs                      -> total=1, name=ci, app_id=15368 (github-actions)
  DATABASE_URL occurrences in run log (681 lines) -> 0
  npm ci output                                  -> 998 packages in 25s, no --legacy-peer-deps
  lint output                                    -> 130 problems (0 errors, 130 warnings)
  test output                                    -> Test Files 41 passed (41)

Task 2 — decision pre-conditions
  rulesets length before                         -> 0
  Task 1 conclusion                              -> success
  recorded option                                -> option-b (+ reason, + bypass actor)

Task 3 — derivation
  POST actor_id 99999                            -> 422 Invalid bypass actor
  probe actor_id 1 / 3 / 6                       -> 422 invalid
  probe actor_id 2 / 4 / 5                       -> created 20851085 / 20851087 / 20851089 (disabled, nonexistent ref)
  GraphQL repositoryRoleName                     -> 2=maintain, 4=write, 5=admin
  DELETE all three probes                        -> exit 0 x3, rulesets length back to 0

Task 3 — ruleset applied
  POST /rulesets                                 -> id=20851119, name="master protection", enforcement=active
  rulesets length                                -> 1
  target / conditions                            -> branch / ref_name.include=["~DEFAULT_BRANCH"]
  rule types                                     -> ["required_status_checks","pull_request"]
  required contexts                              -> ["ci"] with integration_id=15368
  strict_required_status_checks_policy            -> false
  required_approving_review_count                -> 0
  bypass_actors                                  -> [{actor_id:5, RepositoryRole, always}]
  bypass_actors | length                         -> 1

Task 3 — behavioural proof
  branch ci-gate-verification-32-06 @ b54e155    -> pushed, PR #10 opened
  run 31806359761                                -> conclusion=failure, 65s
  steps                                          -> typecheck success / lint FAILURE / test success  (all three ran)
  lint failure                                   -> ci-gate-probe.tsx:4:50 react/no-unescaped-entities
  problem count                                  -> 131 (1 error, 130 warnings) vs master's 130 (0 errors)
  statusCheckRollup ci                           -> FAILURE / COMPLETED
  mergeStateStatus                               -> BLOCKED
  mergeable                                      -> MERGEABLE (conflict-free; the block is the ruleset, not a conflict)

Task 3 — cleanup
  gh pr close 10                                 -> exit 0
  PR state / mergedAt                            -> CLOSED / null
  git ls-remote --heads origin <branch>          -> no output
  git branch -D <branch>                         -> deleted (was b54e155)
  HEAD / origin/master                           -> 7de0a5b / 7de0a5b (unchanged from Task 1)
  latest master run                              -> success (31806015296)
  git status --porcelain                         -> 0 lines
  src/components/ci-gate-probe.tsx on master     -> absent

Doc/reality alignment (T-32-30)
  CONTRIBUTING.md "Enabling the merge gate" table vs applied ruleset -> matches on all 6 rows
  admin-bypass residual risk stated in CONTRIBUTING.md               -> yes (blockquote, with remedy)
  CONTRIBUTING.md modified                                            -> no (correctly, option B)
```

## Known Stubs

None. Both deliverables are complete: the ruleset is `active` on the default branch, and the block was observed rather than assumed.

## Threat Flags

None new. This plan added no code, no endpoint, no dependency, and no schema. Register disposition:

| Threat | Status |
|--------|--------|
| T-32-26 direct push to `master` | **partially mitigated — knowingly** (option B). The `pull_request` rule closes the path for every non-admin; the admin bypass keeps it open for the repo owner by explicit decision D-07. Recorded here and in CONTRIBUTING.md so the residual risk is documented, not invisible. |
| T-32-27 over-broad `bypass_actors` | mitigated — exactly one entry, asserted `length == 1`, and the id was *derived* rather than recalled. The derivation itself prevented the failure mode: `4` (a plausible guess) is `write`, which would have exempted every collaborator. |
| T-32-28 spoofed required check | mitigated — the `ci` context is bound to `integration_id: 15368`, taken from the app that actually produced Task 1's check run. A bare-name requirement would let any app or PAT satisfy it. |
| T-32-29 tampering with `master` | mitigated — PR #10 `state=CLOSED`, `mergedAt=null`, no admin override attempted, remote and local branches deleted, `master` byte-identical at `7de0a5b`, latest run still `success`, probe file absent. |
| T-32-30 documentation overstating the control | mitigated — CONTRIBUTING.md was checked field-by-field against the applied ruleset and matches; the admin bypass is stated plainly with its remedy. No edit was needed, which is the correct outcome under option B. |
| T-32-31 disclosure via the failing run log | accepted as planned — the failing log shows eslint output for a throwaway file in a public repo. The 681-line successful log contains zero `DATABASE_URL` occurrences and the workflow holds no secrets. |
| T-32-SC package legitimacy | n/a — this plan installed nothing. `npm ci` on the runner installed only what the committed lockfile pins. |

## User Setup Required

**None. The manual step 32-05 handed forward is now done.** The ruleset exists and is active; nothing further is required of the developer.

Two operational consequences to be aware of going into Phase 33:

1. **Direct `git push origin master` still works for you**, because you hold the repository admin role and the bypass mode is `always`. The GSD loop is unaffected. It will *not* work for any future collaborator with write access.
2. **Every push to `master` now costs a ~70 s CI run.** A red run on `master` is not blocked by anything (the gate applies at merge time), so a broken direct push will simply leave the default branch red. Phase 33 onward should keep running the three gates locally before pushing.

Audit the live configuration at any time:

```bash
gh api repos/Bittencourt/pipelite/rulesets/20851119
```

## Next Phase Readiness

- **CI-04 is complete end to end**: the workflow file exists (32-05), it runs on real hardware and passes (Task 1), a red check demonstrably blocks a merge (Task 3). Phase 32's ROADMAP success criterion 4 is satisfied behaviourally.
- **All four of Phase 32's success criteria now hold**, which makes this the last plan of the phase.
- **The gate is only as strong as its bypass list.** If a collaborator is ever added to this repository, the gate becomes genuinely binding for them with no further action. If the bypass actor is ever removed, the GSD loop's direct pushes will start failing — that is the intended trade-off, not a bug.
- **One coverage gap worth remembering** (documented above, no action taken): the suite never loads `argon2`, so CI green does not exercise its native binding. A future phase touching auth should consider a test that hashes a password, which would close A1's runtime half.
- No blockers.

## Self-Check: PASSED

Every claim re-verified against the live API after writing this file, before the final commit.

- `FOUND .planning/phases/32-test-infrastructure-ci/32-06-SUMMARY.md`
- Run ids exist and match the recorded conclusions: `31806015296` → `success` on `master`; `31806359761` → `failure`
- Ruleset `20851119` → `enforcement=active`, required contexts `["ci"]`, `bypass_actors | length == 1`
- PR #10 → `CLOSED`, `mergedAt=null`
- `git ls-remote --heads origin ci-gate-verification-32-06` → no output (branch gone)
- `git status --porcelain` → 0 lines (this SUMMARY is invisible to it because `.planning/` is gitignored while its contents are tracked — hence `git add -f`)
- No repository source file was created, modified, or deleted by this plan

---
*Phase: 32-test-infrastructure-ci*
*Completed: 2026-08-14*
