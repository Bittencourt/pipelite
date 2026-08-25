---
phase: 47-suite-trust-supply-chain
plan: 11
subsystem: infra
tags: [ci, github-actions, npm-audit, supply-chain, sigstore, yaml, vitest]

# Dependency graph
requires:
  - phase: 47-suite-trust-supply-chain
    provides: "47-09's scripts/audit-policy.mjs, audit-policy.json, AUDIT-POLICY.md and the package.json `security:audit` script"
  - phase: 46-migration-chain-toolchain-floor
    provides: "46-05's Route A precedent — a gate on the existing required `ci` job, with MIN_CI_STEPS raised in the same commit; and the parsed-YAML ciJob()/ciSteps()/stepLabel() readers in db-test-isolation.test.ts"
provides:
  - "`Security audit policy` step (npm run security:audit) on the REQUIRED `ci` job"
  - "`Registry signature verification` step (npm audit signatures) on the same job"
  - "MIN_CI_STEPS raised 6 -> 8 with its measured enumeration corrected 7 -> 9, in the same commit"
  - "Parsed per-step assertions for both new steps, with the npm script name read relationally from package.json"
  - "Measured proof that BOTH gates fail closed when their data source is unreachable"
affects: [47-12, 47-13, MIG-02, "Dockerfile npm ci conversion (BACKLOG)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A supply-chain gate lands on the existing required check-run name, never in a new workflow (Route A, second application)"
    - "Fail-closed is PROVEN by pointing the gate at an unreachable registry, not asserted in prose"
    - "A workflow step's command is derived from package.json rather than typed as a joined literal in the test that asserts it"

key-files:
  created: []
  modified:
    - .github/workflows/ci.yml
    - src/lib/mutations/__tests__/db-test-isolation.test.ts

key-decisions:
  - "Both steps on job `ci` — its `name: ci` IS the required check-run name in the master ruleset; a new workflow file publishes a name the ruleset does not know"
  - "`npm audit signatures` kept as its own step despite the cost, per 47-CONTEXT; it is not flaky on this tree and needs no re-decision"
  - "ci.yml comment corrected away from RESEARCH's 1104/1104-in-102s toward a measured range, because the cost is dominated by npm cache state rather than by tree size"
  - "scripts/audit-policy.mjs deliberately NOT added to DESTRUCTIVE_SCAN_SUBJECTS — that list is scoped to scripts that create and drop databases, and the audit script issues no DDL"
  - "SEC-05's assertions live in db-test-isolation.test.ts because MIN_CI_STEPS lives there; a per-step assertion whose anti-vacuity floor sits in another file is a floor that will be moved without its assertions"

patterns-established:
  - "npmRunCommand(scriptName): joins `npm run <name>` only after asserting package.json declares it, throwing with every script it parsed — so the joined literal appears in zero test files"
  - "soleStepRunning(command): the migration-check assertion's shape extracted, with the parsed step-label list preserved in the failure message"

requirements-completed: [SEC-05]

# Metrics
duration: 22min
completed: 2026-08-25
---

# Phase 47 Plan 11: Audit Policy On The Required Check Summary

**Both halves of SEC-05 — the advisory policy gate and Sigstore registry-signature verification — now run as steps 8 and 9 of the required `ci` job with `if: ${{ !cancelled() }}`, with `MIN_CI_STEPS` raised 6 -> 8 in the same commit and both gates measured failing closed when their data source is unreachable.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-08-25T15:08Z
- **Completed:** 2026-08-25T15:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Two steps added to the job whose `name: ci` is the required check-run name — not a new workflow, which would publish a name the master ruleset does not know and could go red for weeks without blocking a merge.
- `ci.yml` is **+86 / -0**. Zero deletions is itself the proof that nothing Phase 46 established was touched.
- `MIN_CI_STEPS` raised 6 -> 8 and its measured enumeration corrected 7 -> 9, in the **same commit** as the step additions.
- Both gates **measured** failing closed, not merely claimed to.
- Five green -> red -> green falsifications, each red for the right reason, all reverted.

## Task Commits

1. **Task 1: Add both CI steps and raise MIN_CI_STEPS with its enumeration in the same commit** — `c1f677d` (ci)
2. **Task 2: Falsify the new CI assertions locally** — no code artifact by design; evidence recorded below. `ci.yml` was reverted to `c1f677d` after each control.

**Plan metadata:** this SUMMARY.

## Files Created/Modified

- `.github/workflows/ci.yml` — steps `Security audit policy` and `Registry signature verification` appended after `Migration chain check`, each with a `PROVED HERE / NOT PROVED HERE` register in the house style. +86 / -0.
- `src/lib/mutations/__tests__/db-test-isolation.test.ts` — `MIN_CI_STEPS` 6 -> 8 with a re-enumerated doc-comment; `AUDIT_SCRIPT_NAME` / `SIGNATURE_CHECK_COMMAND` constants; `npmRunCommand()` and `soleStepRunning()` helpers; a new `describe` with three assertions; a header paragraph explaining why SEC-05 assertions live in this file. +241 / -4 across both files, of which -4 are the old floor and its three-line comment.

## The parsed job graph, after

`yaml.parse` of `.github/workflows/ci.yml`:

```
jobs: ["ci"]
job name: "ci"
services: ["postgres"] image: postgres:16-alpine
step count: 9
  [0] "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1" run=null if=null
  [1] "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020" run=null if=null
  [2] "Install dependencies" run="npm ci" if=null
  [3] "Typecheck" run="npm run typecheck" if=null
  [4] "Lint" run="npm run lint" if="${{ !cancelled() }}"
  [5] "Test" run="npm test" if="${{ !cancelled() }}"
  [6] "Migration chain check" run="npm run db:check-migrations" if="${{ !cancelled() }}"
  [7] "Security audit policy" run="npm run security:audit" if="${{ !cancelled() }}"
  [8] "Registry signature verification" run="npm audit signatures" if="${{ !cancelled() }}"
raw occurrences test:db = 0
raw occurrences db.config = 0
contains npm test: true
contains name: ci: true
contains npm run typecheck: true
```

One job, named `ci`. Exactly one service, on the tag `docker-compose.yml` pins. Nine steps. Exactly one step runs `npm run security:audit` and exactly one runs `npm audit signatures`; both carry the literal `${{ !cancelled() }}`.

### Raw-token counts (comments included)

Counted with `node -e` over the raw file, never `grep | wc -l` (which is unreliable under the `rtk` hook — see "rtk hazards" below):

| Token | Occurrences in `ci.yml` |
|---|---|
| `test:db` | **0** |
| `db.config` | **0** |

Neither new comment block contains either string. No prose had to be reworded to achieve it — `security:audit` and `audit-policy.json` are both safe — so no assertion was weakened (S6).

### Phase 46's invariants, verified unchanged

| Invariant | Verified |
|---|---|
| `name: ci` (job name = required check-run name) | present, unchanged |
| `node-version: 24` | present, unchanged |
| `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1` | byte-identical |
| `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0` | byte-identical |
| `postgres:16-alpine` service (exactly one) | present, unchanged |
| `Migration chain check` step + its `DATABASE_URL` env | present, unchanged |
| new `env:` blocks added | **0** (the file's two `env:` blocks are the service's and the migration step's, both pre-existing) |
| new action SHA pins required | **0** — neither step uses an action |

The strongest evidence is the numstat: `.github/workflows/ci.yml  86  0`. Nothing was deleted, so nothing pre-existing could have been altered.

### The four pre-existing `db-test-isolation.test.ts` constraints

All four pass, and none was weakened, relaxed, or commented out. Verified line numbers on the committed file (they had shifted from 47-PATTERNS' numbers, as the brief warned):

| Constraint | Line (post-change) | Status |
|---|---|---|
| Raw scan: zero `test:db`, zero `db.config` | `:441-444` (was `:356-363`) | pass |
| Anchor: `npm test`, `name: ci`, `npm run typecheck` still present | `:446-453` (was `:365-372`) | pass |
| Exactly one service, image equal to `docker-compose.yml`'s | `:469-490` (was `:388-409`) | pass |
| Per-step `run:` scan + `steps.length >= MIN_CI_STEPS` | `:516-536` (was `:434-455`) | pass (floor raised, not relaxed) |
| `MIN_CI_STEPS` and its enumeration | `:91-106` (was `:65-75`) | raised 6 -> 8, enumeration 7 -> 9 |

## Fail-closed, measured rather than asserted

Hard rule 9 asked whether the gate fails closed when advisory data cannot be fetched. Both gates were run against a broken data source. Neither passes vacuously.

### The policy gate, against an unreachable registry

```
$ npm_config_registry=http://127.0.0.1:9/ node scripts/audit-policy.mjs
-> npm audit --json (tree from package-lock.json; advisory data from the npm registry — this step needs network)
npm warn audit request to http://127.0.0.1:9/-/npm/v1/security/advisories/bulk failed, reason: connect ECONNREFUSED 127.0.0.1:9
npm error audit endpoint returned an error
-> npm audit exited 1 — RECORDED, and deliberately NOT the verdict: npm audit exits 1 whenever any advisory exists at any severity
FATAL: the audit document has no `vulnerabilities` object. `npm audit --json` always emits one, even on
a clean tree, so its absence means the output is an error document or a different schema — not a clean
tree. This is a tripwire for an audit document that yielded nothing — a network failure, a proxy
interception or an `npm audit --json` schema change all produce zero offenders and exit 0. ...
EXIT=1
```

Against the real registry the same day:

```
$ node scripts/audit-policy.mjs
-> parsed 47 distinct advisories across 14 vulnerable package(s); npm audited 1285 dependencies
-> applying audit-policy.json: failOn ["critical","high"], 39 allowlist entries
OK: 47 advisories evaluated across 14 vulnerable packages (39 at critical/high), 39 of 39 allowlist
entries applied, 1285 dependencies audited. ...
EXIT=0
```

There is **no offline mode** and the step comment says so: advisory data lives at the registry's bulk endpoint, and `--package-lock-only` changes the TREE source, not the ADVISORY source. In CI the runner has network, so the step will reach it; if it ever cannot, the run goes **red**, not green.

### The signatures gate, with no installed tree

An unexpected and load-bearing finding, not in the plan: **`npm audit signatures` reads the INSTALLED tree, not `package-lock.json`, and `--package-lock-only` does not change that.** Against a directory holding only `package.json` + `package-lock.json`:

```
$ npm --prefix /tmp/sigprobe-a3b audit signatures
npm error found no dependencies to audit that were installed from a supported registry
EXIT=1
```

So it also fails closed rather than reporting "0 packages verified, no failures" — **but only because a real `npm ci` precedes it.** The step is ordered 8th of 9, after `Install dependencies`, and the comment now states that if the steps are ever reordered ahead of `npm ci` this one stops being a gate and becomes an error. That ordering dependency was not in the plan and is now documented in the workflow itself.

## A measurement correction, and why the comment does not say 1104/1104

47-RESEARCH measured `npm audit signatures` at 1104/1104 verified signatures + 169 attestations in 102 s, and the plan's `<interfaces>` instructed that those numbers go in the step comment. Run in this worktree it reported something quite different:

```
$ npm audit signatures
audited 166 packages in 10s
166 packages have verified registry signatures
28 packages have verified attestations
```

166, not 1104 — against a `package-lock.json` with **1285** registry-resolved entries. `--package-lock-only`, `--include=dev --include=optional --include=peer`, and `--loglevel=verbose` (no errors, all cache hits) all gave the same 166. The cause is the worktree bootstrap: `node_modules` here is a **symlink** to the main checkout's tree, and this subcommand walks the actual installed tree. Against a real installed tree the same day:

```
$ npm --prefix /home/pedro/programming/pipelite audit signatures
audited 1100 packages in 20s
1100 packages have verified registry signatures
175 packages have verified attestations
```

So the comment records **1100/1100 + 175 attestations in 20 s warm-cache**, alongside RESEARCH's 1104/1104 + 169 in 102 s cold, and states plainly that the spread is the useful number because **cost is dominated by npm cache state, not by tree size**. Writing "1104/1104 in 102 s" as if it were this tree's number would have been an unverified claim, and the ~5x time spread would have misled the next person weighing the cost.

**Is the step flaky on network? No — on the evidence available.** Four consecutive runs, zero failures, zero verification errors, exit 0 every time. 47-CONTEXT's re-decide condition is **not** triggered and the step stays.

## The five falsifications, verbatim

All five ran against the committed `c1f677d` tree, reverting with `git checkout -- .github/workflows/ci.yml` (never `git clean`, never a blanket reset) between controls.

### Control 1 — baseline GREEN

```
 ✓ src/lib/mutations/__tests__/db-test-isolation.test.ts (26 tests) 110ms

 Test Files  1 passed (1)
      Tests  26 passed (26)
```

### Control 2 — `Security audit policy` step deleted -> RED

```
 FAIL  src/lib/mutations/__tests__/db-test-isolation.test.ts > the required CI check carries the supply-chain gates (SEC-05) > gates the audit policy on the check that can actually block a merge
AssertionError: job `ci` must run `npm run security:audit` in exactly one step. Steps parsed: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1, actions/setup-node@820762786026740c76f36085b0efc47a31fe5020, Install dependencies, Typecheck, Lint, Test, Migration chain check, Registry signature verification: expected [] to have a length of 1 but got +0

- Expected
+ Received

- 1
+ 0

 ❯ soleStepRunning src/lib/mutations/__tests__/db-test-isolation.test.ts:252:5

 FAIL  src/lib/mutations/__tests__/db-test-isolation.test.ts > the required CI check carries the supply-chain gates (SEC-05) > keeps both supply-chain gates on the SAME job as the incumbent gates
AssertionError: job `ci` must run `npm run security:audit`. Runs parsed: ["","","npm ci","npm run typecheck","npm run lint","npm test","npm run db:check-migrations","npm audit signatures"]: expected +0 to be 1 // Object.is equality

 Test Files  1 failed (1)
      Tests  2 failed | 24 passed (26)
```

**This is the message the acceptance criteria asked to be quoted in full.** `Steps parsed: actions/checkout@3d3c…, actions/setup-node@8207…, Install dependencies, Typecheck, Lint, Test, Migration chain check, Registry signature verification` — eight labels, correctly listed, with the ninth genuinely gone. That is what distinguishes **"the step is absent"** from **"the reader is broken"**: a broken reader would have listed nothing, or thrown from `ciSteps()`. The second failure independently confirms it from the `run:` values, which came out as an eight-element array with `npm run security:audit` missing and everything else intact.

Restored -> GREEN:

```
 ✓ src/lib/mutations/__tests__/db-test-isolation.test.ts (26 tests) 120ms
      Tests  26 passed (26)
```

### Control 3 — audit step's `if` changed to `${{ always() }}` -> RED

```
 FAIL  src/lib/mutations/__tests__/db-test-isolation.test.ts > the required CI check carries the supply-chain gates (SEC-05) > gates the audit policy on the check that can actually block a merge
AssertionError: the `npm run security:audit` step must carry the same `!cancelled()` condition as Lint and Test, so a security finding never hides a type error and a type error never hides a security finding — all gates report in one run: expected '${{ always() }}' to be '${{ !cancelled() }}' // Object.is equality

Expected: "${{ !cancelled() }}"
Received: "${{ always() }}"

 ❯ src/lib/mutations/__tests__/db-test-isolation.test.ts:574:7

 Test Files  1 failed (1)
      Tests  1 failed | 25 passed (26)
```

Exactly one test failed, and the step was still FOUND — so the assertion discriminates the condition specifically, rather than collapsing into the presence check.

Restored -> GREEN: `Tests  26 passed (26)`.

### Control 4 — `Registry signature verification` step deleted -> RED

```
 FAIL  src/lib/mutations/__tests__/db-test-isolation.test.ts > the required CI check carries the supply-chain gates (SEC-05) > verifies registry signatures — the tamper half of SEC-05, and its own step
AssertionError: job `ci` must run `npm audit signatures` in exactly one step. Steps parsed: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1, actions/setup-node@820762786026740c76f36085b0efc47a31fe5020, Install dependencies, Typecheck, Lint, Test, Migration chain check, Security audit policy: expected [] to have a length of 1 but got +0

 FAIL  src/lib/mutations/__tests__/db-test-isolation.test.ts > the required CI check carries the supply-chain gates (SEC-05) > keeps both supply-chain gates on the SAME job as the incumbent gates
AssertionError: job `ci` must run `npm audit signatures`. Runs parsed: ["","","npm ci","npm run typecheck","npm run lint","npm test","npm run db:check-migrations","npm run security:audit"]: expected +0 to be 1 // Object.is equality

 Test Files  1 failed (1)
      Tests  2 failed | 24 passed (26)
```

Note the complement of Control 2: the parsed labels now end in `Security audit policy` and the missing entry is the other one. The two controls therefore also prove the assertions are not aliased to each other.

Restored -> GREEN: `Tests  26 passed (26)`.

### Control 5 — four steps removed, below the raised floor -> RED

Typecheck, Lint, Test and Migration chain check removed, leaving 5 steps:

```
steps now 5 -> ["actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1","actions/setup-node@820762786026740c76f36085b0efc47a31fe5020","Install dependencies","Security audit policy","Registry signature verification"]
```

```
 FAIL  src/lib/mutations/__tests__/db-test-isolation.test.ts > the required CI check never mentions the db project > has NO step that reaches the database-backed vitest project — asserted step by step
AssertionError: only 5 steps parsed out of job `ci` — below the floor of 8. A per-step gate over an empty list passes because it is broken.: expected 5 to be greater than or equal to 8
 ❯ src/lib/mutations/__tests__/db-test-isolation.test.ts:526:7

 Test Files  1 failed (1)
      Tests  4 failed | 22 passed (26)
```

**The raised floor still bites** — it was not raised past usefulness. Note it says `the floor of 8`, i.e. the new value, and that the anchor assertions for `npm test` / `npm run typecheck` went red alongside it.

Restored -> GREEN: `Tests  26 passed (26)`.

### Extra evidence: the floor was RED before the steps existed

Task 1 was executed **assertions first**, so the RED was observed before the workflow was touched rather than reconstructed afterwards. With `MIN_CI_STEPS = 8` and the new `describe` in place but `ci.yml` still at 7 steps:

```
 FAIL ... > has NO step that reaches the database-backed vitest project — asserted step by step
AssertionError: only 7 steps parsed out of job `ci` — below the floor of 8. A per-step gate over an
empty list passes because it is broken.: expected 7 to be greater than or equal to 8

 FAIL ... > gates the audit policy on the check that can actually block a merge
AssertionError: job `ci` must run `npm run security:audit` in exactly one step. Steps parsed:
actions/checkout@3d3c…, actions/setup-node@8207…, Install dependencies, Typecheck, Lint, Test,
Migration chain check: expected [] to have a length of 1 but got +0

 Test Files  1 failed (1)
      Tests  4 failed | 22 passed (26)
```

No test was edited to chase green afterwards. `git diff` of the commit shows exactly **4 deleted lines** in the test file, and they are the old floor and its three comment lines:

```
- * The workflow declares at least this many steps today. Measured: 7 — checkout, setup-node,
- * install, typecheck, lint, test, migration check. The floor sits one below the measurement,
- * so removing a step is loud while adding one is free.
-const MIN_CI_STEPS = 6
```

### `ci.yml` restored, tree clean

```
$ git status --porcelain .github/workflows/ci.yml
(empty)
$ git status --porcelain
(empty)
```

## One commit, both files

```
$ git show --name-only --format="%h %s" HEAD
c1f677d ci(47-11): gate the audit policy and registry signatures on the required check

.github/workflows/ci.yml
src/lib/mutations/__tests__/db-test-isolation.test.ts
```

```
$ git diff --numstat HEAD~1 HEAD
86  0   .github/workflows/ci.yml
155 4   src/lib/mutations/__tests__/db-test-isolation.test.ts
```

`git diff --diff-filter=D --name-only HEAD~1 HEAD` is empty — no file was deleted.

## WHAT GITHUB HAS STILL NEVER DONE

**GitHub has never executed either of these steps, and nothing in this plan proves it will.**

Everything above is local evidence about **file content and command behaviour**: the YAML parses, the job graph is one job named `ci` with one service and nine steps, the two `run:` values are what the assertions require, the two commands exit 0 on this machine and exit 1 when their data source is broken. None of that is evidence about GitHub's runner.

Specifically **unproven** until a real run:

- that GitHub's runner schedules steps 8 and 9 at all;
- that `if: ${{ !cancelled() }}` behaves on the runner as it does in the two incumbent steps that already use it;
- that the runner's network reaches `registry.npmjs.org`'s advisory bulk endpoint and the Sigstore attestation endpoints from a `contents: read` job;
- the real cost, since ~102 s cold / ~20 s warm was measured on this machine and the runner's npm cache is restored by `actions/setup-node`, which is a third cache state neither number describes;
- that `timeout-minutes: 15` is in fact ample at ~200 s;
- that `npm audit signatures` finds a complete tree after the runner's `npm ci` (it must — but this worktree's 166-vs-1100 discrepancy is a reminder that this subcommand's count is a function of the installed tree, and the runner's tree has never been measured).

**Phase 46's open item is still open and is now compounded:** `git rev-list --count origin/master..HEAD` is **100**. Every commit from Phase 46 and Phase 47 is unpushed, so `Migration chain check` — added by 46-05 — has also never run on GitHub, and now neither have these two. Three steps of the required check exist only as text.

**That is 47-12's job**, explicitly: negative control E against the real runner, which closes Phase 46's open item and this one in the same push. This plan did not push, by instruction. Do not read any green above as evidence that CI is green.

## Decisions Made

1. **Both steps on job `ci`, not a new workflow.** `name: ci` is the required check-run name. Second application of Phase 46's Route A; the `services:` header already argues it at length and the new steps sit under that argument.
2. **`npm audit signatures` stays.** 47-CONTEXT accepted the cost and set a re-decide condition on flakiness. Four runs, zero failures — the condition is not met, so no re-decision. The measured numbers and the re-decide condition itself are both written into the step comment so a future reader inherits the argument, not just the outcome.
3. **The step comment carries measured numbers, not RESEARCH's.** See the measurement-correction section. Both figures are recorded, with the reason they differ.
4. **`scripts/audit-policy.mjs` was NOT added to `DESTRUCTIVE_SCAN_SUBJECTS`.** This is a decision, not an oversight, and 47-PATTERNS reaches the same conclusion. That list is scoped to scripts that create and drop databases on a cluster also hosting real records; `audit-policy.mjs` issues no DDL, opens no connection and names no database. Adding it would put a subject in the scan with no destructive statement to find, which would fail the scan's own anti-vacuity floor (`really contains destructive statements outside its comments`) — the list is self-policing about this.
5. **SEC-05's assertions live in `db-test-isolation.test.ts`, and the file now says why.** They are not about database isolation. They are there because `MIN_CI_STEPS` is there, and that floor is the anti-vacuity guard for every per-step assertion about this workflow. A floor in one file protecting assertions in another is a floor that gets raised without them. The new `describe` opens with a comment stating this plainly rather than letting a reader assume a thematic fit that does not exist.
6. **A third assertion was added beyond the plan's two-per-step.** `keeps both supply-chain gates on the SAME job as the incumbent gates` asserts the audit steps and `npm test` share one step list. The two per-step assertions are each satisfied by a step in whatever job the readers resolve as `ci`; neither says the gates share a job with the checks a maintainer already trusts. A future refactor lifting the security steps into a job of their own — and out of the required check — would pass both original assertions while silently un-gating SEC-05. This closes T-47-11-01 mechanically instead of by comment.

## Deviations from Plan

### Auto-fixed / adjusted

**1. [Rule 2 - Missing Critical] The measured signature numbers in the step comment were corrected, and the finding behind them documented**
- **Found during:** Task 1, while verifying the step command actually runs (hard rule 8)
- **Issue:** The plan instructed writing "1104 packages audited, 1104 verified registry signatures, 169 verified attestations, 102 s" into the comment as a measurement of "this tree". Run here it reported 166/166 + 28 in 10 s. Shipping the plan's number verbatim would have put an unverified claim in the workflow, and the ~5x time spread would mislead the next person weighing the cost.
- **Fix:** Measured against a real installed tree (1100/1100 + 175 in 20 s warm), diagnosed the 166 as a worktree `node_modules`-symlink artifact, and recorded BOTH figures with the reason they differ. Also recorded the newly-discovered ordering dependency (see next item).
- **Files modified:** `.github/workflows/ci.yml`
- **Verification:** Four independent `npm audit signatures` runs; a no-`node_modules` probe; lockfile entry count (1285 registry-resolved) as the control.
- **Committed in:** `c1f677d`

**2. [Rule 2 - Missing Critical] Documented that `npm audit signatures` depends on step ordering**
- **Found during:** Task 1, probing fail-closed behaviour
- **Issue:** Neither the plan nor RESEARCH noted that this subcommand reads the INSTALLED tree and ignores `--package-lock-only`. Reordered ahead of `npm ci` it does not report "0 verified, no failures" — it errors — but nothing in the file recorded the dependency, so a future reorder would look harmless.
- **Fix:** The measured error and exit code are in the step comment, with an explicit warning about reordering.
- **Files modified:** `.github/workflows/ci.yml`
- **Verification:** `npm --prefix /tmp/sigprobe-a3b audit signatures` -> `found no dependencies to audit that were installed from a supported registry`, `EXIT=1`.
- **Committed in:** `c1f677d`

**3. [Rule 2 - Missing Critical] Proved the fail-closed claim instead of asserting it**
- **Found during:** Task 1, applying hard rule 9
- **Issue:** The plan asked the comment to *state* that the gate needs network. A stated claim about failure behaviour that nobody exercised is the shape this whole phase exists to eliminate.
- **Fix:** Ran the gate against an unreachable registry; the ECONNREFUSED -> FATAL -> exit 1 path is now recorded in the comment as a measurement with its date.
- **Files modified:** `.github/workflows/ci.yml`
- **Verification:** `npm_config_registry=http://127.0.0.1:9/ node scripts/audit-policy.mjs` -> `EXIT=1`.
- **Committed in:** `c1f677d`

**4. [Rule 2 - Missing Critical] Third assertion added — same job, not merely a job named `ci`**
- **Found during:** Task 1
- **Issue:** See Decision 6. The plan's two-assertions-per-step shape leaves the un-gating refactor undetected.
- **Fix:** `keeps both supply-chain gates on the SAME job as the incumbent gates`, asserting the audit steps and `npm test` share one parsed step list.
- **Files modified:** `src/lib/mutations/__tests__/db-test-isolation.test.ts`
- **Verification:** Went red in Controls 2 and 4 for the right reason, listing the parsed `run:` array both times.
- **Committed in:** `c1f677d`

**5. [Cosmetic, S6] Two comment sentences reworded so the joined command literal appears nowhere in the test file**
- **Found during:** Task 1 verification
- **Issue:** The acceptance criterion is the absence of a second literal `npm run security:audit` in the test file. The CODE never contained it — `npmRunCommand()` joins it at runtime — but two doc-comments spelled it out in prose, so a naive count returned 2.
- **Fix:** Reworded both to "the `security:audit` npm script" and "the audit script". Count is now 0. Per S6 the prose was reworded; no assertion was touched.
- **Files modified:** `src/lib/mutations/__tests__/db-test-isolation.test.ts`
- **Verification:** `node -e` count of the joined string in the test file: **0**.
- **Committed in:** `c1f677d`

---

**Total deviations:** 5 (4 Rule 2 additions of missing critical information/coverage, 1 cosmetic rewording).
**Impact on plan:** No scope creep — every item is inside the two files the plan names, and each either corrects an unverified claim the plan would have shipped or closes a hole in the coverage the plan specified. Nothing was dropped.

## Issues Encountered

- **The worktree started 100 commits behind** (`merge-base` a58b9e1 vs the expected e6a8a3e), as the environment brief predicted for the 29th consecutive time. Resolved with `git merge --ff-only e6a8a3e`, never `reset --hard`.
- **`npm audit signatures` reported 166 instead of 1104.** Diagnosed as the worktree `node_modules` symlink; see the measurement-correction section. Resolved, and turned into two comment improvements.
- **rtk hazards, both reconfirmed:** `git log … | wc -l` returned **50** where `git rev-list --count` returned **100** — a 2x undercount, so every count in this SUMMARY was computed with `node -e` or a native `--count` flag. And `grep -n "exit" scripts/audit-policy.mjs` returned **"0 matches"** for a file containing 20 such lines; the same search via `node -e` found them all. Do not trust `grep` counts or `grep` negatives in this environment.
- **Known-open D-47-06-A did not bite.** The full base suite ran twice, 172 files / 4900 passed / 32 skipped both times, in 64 s and 79 s. No red on `route.test.ts`, `replay-carries-dry-run.test.ts` or `engine.test.ts`.

## Verification

| Gate | Result |
|---|---|
| `vitest run src/lib/mutations/__tests__/db-test-isolation.test.ts src/lib/__tests__/audit-policy.test.ts` | **78 passed** (26 + 52) |
| `vitest run` (base project) | **172 files passed, 2 skipped; 4900 passed, 32 skipped** |
| `vitest run --config vitest.rsc.config.ts` | **2 files, 8 passed** |
| `tsc --noEmit` | **exit 0, no output** |
| `eslint` | **0 errors, 122 warnings** (the known worktree baseline; 124 on master, the delta being `.planning`'s untracked files) |
| `node scripts/audit-policy.mjs` | **exit 0** — 47 advisories, 39 at critical/high, all dispositioned, 1285 deps audited |
| `npm audit signatures` (real tree) | **exit 0** — 1100/1100 signatures, 175 attestations |
| `git status --porcelain` | clean |

Plan 47-10 owns `src/lib/__tests__/audit-policy.test.ts` and plan 47-14 owns `suite-hook-hygiene.test.ts` and nine others. **Neither was touched** — the commit contains exactly two files.

## Next Phase Readiness

- **SEC-05's CI wiring is complete as text and unproven as behaviour.** 47-12 must run negative control E against the real runner; it is the only thing that can close this, and it needs a push the orchestrator is holding for the operator.
- **47-12 should carry two extra observations** from this plan: the runner's actual `npm audit signatures` package count (expected ~1100, and a number far below that means the runner's tree is not what `npm ci` should have produced), and the real added job time against the ~102 s cold / ~20 s warm bracket.
- **Two BACKLOG items are now argued in-file:** converting `Dockerfile:24` to `npm ci --legacy-peer-deps` (which would collapse trees #1 and #2 and retire the `NOT PROVED HERE` caveat), and MIG-02.
- No blockers.

## Self-Check: PASSED

- `.planning/phases/47-suite-trust-supply-chain/47-11-SUMMARY.md` — FOUND
- `.github/workflows/ci.yml` — FOUND
- commit `c1f677d` — FOUND
- commit `951db4a` — FOUND
- `git status --porcelain` — clean
- `STATE.md` / `ROADMAP.md` — untouched, as instructed (orchestrator owns them)

---
*Phase: 47-suite-trust-supply-chain*
*Completed: 2026-08-25*
</content>
</invoke>
