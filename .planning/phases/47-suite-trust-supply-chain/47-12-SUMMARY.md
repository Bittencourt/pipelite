---
phase: 47-suite-trust-supply-chain
plan: 12
subsystem: supply-chain
tags: [npm-audit, negative-control, audit-policy, minimist, GHSA-xvch-5gv4-984h, SEC-05, not-proved]

# Dependency graph
requires:
  - phase: 47-suite-trust-supply-chain
    plan: 09
    provides: "scripts/audit-policy.mjs, audit-policy.json (failOn [critical,high], 39 allowlist entries), AUDIT-POLICY.md and the `security:audit` npm script — the gate this plan tries to break"
  - phase: 47-suite-trust-supply-chain
    plan: 10
    provides: "the offline policy test that pins failOn and the vite override, so a green reached by narrowing the policy would itself go red"
  - phase: 47-suite-trust-supply-chain
    plan: 11
    provides: "`Security audit policy` as step 8 of 9 on the REQUIRED `ci` job, and the measured fail-closed behaviour that this plan had to rule out as the cause of its red"
provides:
  - "Control E's LOCAL half, delivered in full: green (exit 0) -> red (exit 1, one FATAL naming GHSA-xvch-5gv4-984h) -> green (exit 0), on the real working tree"
  - "Attribution evidence that the red is the advisory and not the fail-closed path: the audit document parsed, 47->48 advisories, 14->15 vulnerable packages, `1 problem(s)`"
  - "Attribution evidence that the red is isolated to ONE CI step: `npm audit signatures` and `npm run typecheck` both exit 0 while the control is installed"
  - "Byte-identity proof that the control left nothing behind (sha256 of both manifests before and after)"
  - "D-47-12-A — the operator's four-part push-and-observe reproduction for the runner half"
affects: [47-13, SEC-05, "ROADMAP SC-4 (runner half)", "Phase 46 GAP 1"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A negative control must rule out the OTHER ways its gate can go red before the red counts as evidence"
    - "A deliberately vulnerable pin is restored by sha256 comparison of both manifests, never by eyeball"
    - "An undeliverable half of a control is recorded as NOT DELIVERED with an executable reproduction, never substituted by the half that was deliverable"

key-files:
  created:
    - .planning/phases/47-suite-trust-supply-chain/47-12-SUMMARY.md
  modified:
    - .planning/phases/47-suite-trust-supply-chain/deferred-items.md

key-decisions:
  - "The runner half was NOT delivered and NOT simulated. Pushing is outward-facing and unauthorised; the plan's Task 1 is a blocking human-action checkpoint for exactly that reason"
  - "The control was installed into the REAL working tree, not a scratch directory — a scratch lockfile does not exercise `npm run security:audit` against this project's policy file and allowlist"
  - "`npm install --save-dev minimist@1.2.5` chosen over `--package-lock-only` so the installed tree and the lockfile agree, which is what the CI step's ordering (after `npm ci`) actually reproduces"
  - "No throwaway branch was created, even locally — an unpushed branch would be an artifact whose only purpose is a push that is not happening, and containment is stronger with zero commits"

requirements-completed: []
requirements-partial: [SEC-05]

# Metrics
duration: 12min
completed: 2026-08-25
---

# Phase 47 Plan 12: Negative Control E — The Local Half Summary

**The audit policy was made to fail on purpose and for exactly the right reason — `npm run security:audit` went exit 0 -> exit 1 -> exit 0 as `minimist@1.2.5` was installed and reverted, with a single `FATAL` naming `GHSA-xvch-5gv4-984h` — but this happened on this machine, and GitHub has still never executed the step, so SEC-05's "the policy can fail" claim is proven LOCALLY and NOT PROVED on the runner.**

## THE HEADLINE GAP — read this before anything else

**Control E's real-runner half is NOT DELIVERED.**

The plan's own objective says the venue is not negotiable: *"Prove the policy can fail where it matters: on GitHub's own runner, on the check that blocks a merge."* 47-VALIDATION makes control **E** explicitly *"verified against the real runner, not locally."*

That did not happen. Nothing was pushed. No branch, no pull request, no GitHub object of any kind was created. Measured now, on the tree this SUMMARY was written against:

```
$ git log --oneline -1 origin/master
a58b9e1 chore: archive v1.3 phase directories

$ git rev-list --count origin/master..HEAD
111
```

`origin/master` is still at a commit that **predates Phase 46**. Every commit from Phases 46 and 47 is local. So all three of the steps those phases added to the required `ci` job — `Migration chain check` (46-05), `Security audit policy` and `Registry signature verification` (47-11) — exist only as text in a file GitHub has never run. Phase 46's GAP 1 is **still open**, and this plan did not close it.

**Therefore:**

| Claim | Status |
|---|---|
| The audit policy exists, is stated in prose, and is machine-enforced | PROVED (47-09) |
| The policy cannot be silently narrowed to reach green | PROVED (47-10) |
| The policy runs as a step on the job whose name is the required check-run | PROVED **as file content** (47-11) |
| The policy **can fail**, and fails on an unallowlisted critical rather than vacuously | **PROVED — locally, here, this plan** |
| The policy fails **on GitHub's runner** | **NOT PROVED** |
| A failing policy **blocks a merge** (`mergeStateStatus: BLOCKED`) | **NOT PROVED** |
| ROADMAP SC-4's runner half | **NOT PROVED** |
| Phase 46 GAP 1 (`Migration chain check` has never run on GitHub) | **STILL OPEN** |

Pushing is an outward-facing action the operator has not authorised. 46-06 set the standard for this situation — record the gap rather than manufacture a green run — and this plan follows it. The full reproduction the operator runs when they choose to push is written into `deferred-items.md` as **D-47-12-A** and repeated at the end of this document.

**Do not read anything below as CI evidence. Every exit code in this SUMMARY was produced on this machine.**

---

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-25T16:00Z
- **Completed:** 2026-08-25T16:12Z
- **Tasks:** 1 of 3 delivered (Task 3's local half); Tasks 1 and 2 are checkpoints the operator owns
- **Files modified:** 1 (`deferred-items.md`) + this SUMMARY. **Zero source files. Zero manifest changes.**

## Task Commits

1. **D-47-12-A — the operator's push-and-observe reproduction** — `65674d1` (docs), 203 insertions, 0 deletions
2. **The control itself** — **no code artifact by design.** The whole point is that it leaves nothing behind. Evidence is below; `package.json` and `package-lock.json` are byte-identical to their pre-control bytes.

**Plan metadata:** this SUMMARY.

---

## The pin, re-verified before use (assumption A7)

47-RESEARCH's A7 warns that advisory data can change, so the pin was re-verified **in a scratch directory outside the repository**, exactly as the plan's Task 2 instructs. It has not changed.

```
$ SCRATCH=$(mktemp -d /tmp/minimist-probe-XXXXXX)   # /tmp/minimist-probe-y6htfm
$ cd "$SCRATCH" && npm install --package-lock-only minimist@1.2.5
up to date, audited 2 packages in 810ms
1 critical severity vulnerability
INSTALL_EXIT=0

$ npm audit --json
metadata.vulnerabilities = {"info":0,"low":0,"moderate":0,"high":0,"critical":1,"total":1}
vulnerable packages = [ 'minimist' ]
--- minimist severity=critical
   via: Prototype Pollution in minimist | https://github.com/advisories/GHSA-xvch-5gv4-984h | severity=critical | range=>=1.0.0 <1.2.6

$ npm audit --audit-level=high
minimist  1.0.0 - 1.2.5
Severity: critical
Prototype Pollution in minimist - https://github.com/advisories/GHSA-xvch-5gv4-984h
1 critical severity vulnerability
AUDIT_LEVEL_HIGH_EXIT=1
```

**Exactly one critical, exactly the expected GHSA.** No substitution was needed and none was made.

Package legitimacy, independently checked with `slopcheck scan` (**`scan` only — `slopcheck install` actually installs, and has rewritten the manifests mid-session twice this milestone**):

```
$ slopcheck scan /tmp/minimist-probe-y6htfm
  found 1 dependencies
  [OK] minimist (npm)
  scanned 1 packages
  1 OK
```

And the control advisory is confirmed **absent** from the policy — without this the red would be impossible rather than meaningful:

```
allowlist entries matching GHSA-xvch-5gv4-984h: 0
any allowlist entry naming package minimist: 0
failOn includes critical: true
```

---

## Control E, local half: GREEN -> RED -> GREEN, verbatim

### Pre-control state, hashed rather than eyeballed

```
package.json      2700 bytes  sha256=1df072046fb4980c0b2d068bb523dc337a1effd40d931aed5cfca798955555a0
package-lock.json 690757 bytes sha256=1a886a6ffc2ee9d020d631e28774c1dbf0619ff69f9f2d89c0527beeb8fc8f86
overrides = {"vite":"^7.0.0"}
```

Both files were also copied to `/tmp/47-12-manifest-backup/` so the restore could be proved by `Buffer.equals`, not only by hash.

### (1) GREEN — the baseline, without which the red proves nothing

47-RESEARCH § *"A trap to design around"* is explicit that this step comes first: a red observed without a preceding green shows only that the gate was already red.

```
$ npm run security:audit
> node scripts/audit-policy.mjs
-> npm audit --json (tree from package-lock.json; advisory data from the npm registry — this step needs network)
-> npm audit exited 1 — RECORDED, and deliberately NOT the verdict: npm audit exits 1 whenever any advisory exists at any severity
-> parsed 47 distinct advisories across 14 vulnerable package(s); npm audited 1285 dependencies
-> applying audit-policy.json: failOn ["critical","high"], 39 allowlist entries
OK: 47 advisories evaluated across 14 vulnerable packages (39 at critical/high), 39 of 39 allowlist entries applied, 1285 dependencies audited. Every critical/high advisory is either fixed or carries an unexpired, reasoned disposition in audit-policy.json.
EXIT=0
```

### (2) Install the control

```
$ npm install --save-dev minimist@1.2.5
added 2 packages, changed 1 package, and audited 1104 packages in 6s
15 vulnerabilities (3 low, 7 moderate, 4 high, 1 critical)
NPM_INSTALL_EXIT=0
```

`15 (… 1 critical)` where the tree carries `14 (3 low, 7 moderate, 4 high)` — the histogram moved by exactly the control's one critical and nothing else.

**What the install did to the manifests, enumerated key by key rather than trusted:**

```
$ git diff --numstat -- package.json package-lock.json
25      7       package-lock.json
1       0       package.json

$ git diff -- package.json
@@ -79,6 +79,7 @@
     "eslint-config-next": "16.1.6",
+    "minimist": "^1.2.5",
     "semver": "^7.8.5",

lockfile packages added:   ["node_modules/shadcn/node_modules/minimist","node_modules/tsconfig-paths/node_modules/minimist"]
lockfile packages removed: []
lockfile packages changed: ["", "node_modules/minimist"]
   node_modules/minimist  version   : "1.2.8" -> "1.2.5"
   node_modules/minimist  resolved  : .../minimist-1.2.8.tgz -> .../minimist-1.2.5.tgz
   node_modules/minimist  integrity : sha512-2yyAR8qB... -> sha512-FM9nNUYr...
   node_modules/minimist  funding   : {"url":"https://github.com/sponsors/ljharb"} -> undefined
lockfileVersion before/after: 3 3
```

**A finding worth keeping.** `minimist` was *already* in the tree at a **safe** 1.2.8, hoisted. Installing the control **downgraded the hoisted copy to 1.2.5** and pushed 1.2.8 down into nested `node_modules` under `shadcn` and `tsconfig-paths`, whose declared ranges the control does not satisfy. So the control is not a naive addition — it is a downgrade of an existing hoisted node, which is a closer analogue of how a real vulnerable dependency actually arrives.

**Hard rules 1 and 2 honoured, measured:** `overrides` is still `{"vite":"^7.0.0"}` during the control; `vite` did not move; `removed: []`; no `rolldown`, `tsx` or `esbuild` entry appears anywhere in `added`. `npm audit fix` was never run.

### (3) RED — one FATAL, naming the advisory

```
$ npm run security:audit
> pipelite@0.1.0 security:audit
> node scripts/audit-policy.mjs

-> npm audit --json (tree from package-lock.json; advisory data from the npm registry — this step needs network)
-> npm audit exited 1 — RECORDED, and deliberately NOT the verdict: npm audit exits 1 whenever any advisory exists at any severity
-> parsed 48 distinct advisories across 15 vulnerable package(s); npm audited 1287 dependencies
-> applying audit-policy.json: failOn ["critical","high"], 39 allowlist entries

FATAL: minimist critical GHSA-xvch-5gv4-984h has NO recorded disposition — "Prototype Pollution in minimist" (advisory severity critical). Either take the fix, or add an entry to audit-policy.json with a reason, a reach and an expiry, and record it in AUDIT-POLICY.md.

FATAL: the advisories in package-lock.json do not satisfy audit-policy.json (1 problem(s) above). Note that npm audit's own exit code was 1, which is reported above and is deliberately NOT what this verdict is based on — it is 1 whenever any advisory exists at any severity, so it cannot distinguish a fully-disposed tree from an unallowlisted critical. Do NOT reach green by narrowing failOn, extending an expiry, or adding an entry whose reason would be true of any project; see AUDIT-POLICY.md.
EXIT=1
```

### (4) GREEN again — the complement

Reverted with `git checkout -- package.json package-lock.json` (never `git clean`, never a blanket reset), then `npm ci`:

```
$ npm ci
added 1101 packages, and audited 1102 packages in 33s
14 vulnerabilities (3 low, 7 moderate, 4 high)
NPM_CI_EXIT=0

$ node -e "console.log(require('./node_modules/minimist/package.json').version)"
1.2.8

$ npm run security:audit
-> parsed 47 distinct advisories across 14 vulnerable package(s); npm audited 1285 dependencies
-> applying audit-policy.json: failOn ["critical","high"], 39 allowlist entries
OK: 47 advisories evaluated across 14 vulnerable packages (39 at critical/high), 39 of 39 allowlist entries applied, 1285 dependencies audited. Every critical/high advisory is either fixed or carries an unexpired, reasoned disposition in audit-policy.json.
EXIT=0
```

The histogram is back to `14 (3 low, 7 moderate, 4 high)` with **zero critical**, and the hoisted `minimist` is back at 1.2.8.

---

## ATTRIBUTION — why this red is the advisory and not one of the other four things that turn this gate red

Hard rule 5 is the whole reason this section exists: *"If your control's red comes from the wrong cause, that is not the control passing — attribute the failure."* 47-11 measured **two** other ways this gate goes red, and 47-09 built **two** more tripwires into it. All four are ruled out.

| Other way this gate can go red | Ruled out by |
|---|---|
| **Unreachable registry / network failure** (47-11 measured `ECONNREFUSED` -> `FATAL: the audit document has no vulnerabilities object` -> exit 1) | The document **parsed**: `parsed 48 distinct advisories across 15 vulnerable package(s); npm audited 1287 dependencies`. That line cannot print unless `assertAuditDocument` accepted a real `vulnerabilities` map. The fail-closed FATAL has entirely different text and did not appear. |
| **No `node_modules` / broken install** (47-11 measured `npm audit signatures` -> `found no dependencies to audit` -> exit 1) | Different command, and it exited **0** during the control (below). `npm ci` had never been skipped; `audited 1287 dependencies`. |
| **A stale allowlist entry** (`staleAllowlistProblems` — an entry whose advisory is fixed) | The verdict says **`1 problem(s)`**. A stale entry would be a second problem. `39 of 39 allowlist entries applied` on both greens. |
| **A narrowed or malformed policy file** (47-10's gate, and `REQUIRED_FAIL_ON`) | `audit-policy.json` was never opened, let alone edited: `git diff` over the whole tree was empty apart from the two manifests, and both greens print `failOn ["critical","high"], 39 allowlist entries`. |

**The positive attribution is numeric and complementary in both directions:**

| Measurement | Green (before) | Red (control) | Green (after) |
|---|---|---|---|
| distinct advisories | 47 | **48** | 47 |
| vulnerable packages | 14 | **15** | 14 |
| dependencies audited | 1285 | **1287** | 1285 |
| npm histogram | 14, 0 critical | **15, 1 critical** | 14, 0 critical |
| FATAL count | 0 | **1** | 0 |
| exit code | 0 | **1** | 0 |

`+1` advisory, `+1` vulnerable package, `+1` critical, `+1` FATAL, and the FATAL names that one advisory by id. Nothing else moved, and everything moved back.

### And the red is isolated to ONE step of the nine

The plan wanted a per-step conclusion listing from `gh` to show `Security audit policy` failing while its neighbours pass. That is unavailable without a push, so the neighbouring steps were run **locally, with the control still installed** — the closest available substitute, and it is a real one because these are the same commands the workflow runs:

```
$ npm audit signatures            # CI step 9, `Registry signature verification`
audited 1102 packages in 20s
1102 packages have verified registry signatures
175 packages have verified attestations
EXIT=0

$ npm run typecheck               # CI step 4, `Typecheck`
> tsc --noEmit
EXIT=0
```

So with the vulnerable pin in place, `Registry signature verification` and `Typecheck` both pass and only `Security audit policy` fails. `1102` verified signatures against 47-11's measured `1100` on a clean tree — `+2`, matching `npm install`'s own `added 2 packages`. The gate is discriminating, not blanket.

**This is still not the per-step listing the plan asked for.** It is nine local commands' worth of confidence about a runner that has executed none of them.

---

## CONTAINMENT — proved, not asserted

Hard rule 4 requires hashes rather than eyeballs.

**1. Byte identity of both manifests**

```
package.json      2700 bytes  sha256=1df072046fb4980c0b2d068bb523dc337a1effd40d931aed5cfca798955555a0  IDENTICAL
package-lock.json 690757 bytes sha256=1a886a6ffc2ee9d020d631e28774c1dbf0619ff69f9f2d89c0527beeb8fc8f86  IDENTICAL
Buffer.equals vs backup package.json: true
Buffer.equals vs backup package-lock.json: true
RESTORE_OK=true

$ git diff --exit-code -- package.json package-lock.json
MANIFEST_DIFF_EXIT=0
```

Both hashes match the pre-control values at the top of this document, and a raw `Buffer.equals` against the `/tmp` copies agrees.

**2. `minimist` is not a declared dependency**

```
$ node -e "... if('minimist' in all) throw new Error('containment failed') ..."
containment ok: minimist is not a declared dependency
declared dep count: 59
```

**3. The working tree is clean, staged and unstaged**

```
$ git status --porcelain      # (via `rtk proxy`, raw)
(empty)
$ git diff --exit-code;        DIFF_EXIT=0
$ git diff --cached --exit-code; CACHED_DIFF_EXIT=0
```

**4. No commit anywhere in the repository declares `minimist`**

`git log --all --oneline -- package.json | grep minimist` is **not** a valid check — it greps subject lines rather than content, and `grep` is unreliable under the `rtk` hook here. The content of every version of the file was parsed instead:

```
commits touching package.json across --all: 32
commits whose package.json declares minimist: 0
```

**5. Nothing was created**

```
local branches: 4 ["refs/heads/feat-pipedrive_api_importer","refs/heads/feat/workflows","refs/heads/master","refs/heads/phase-12-localization"]
```

The same four branches that existed before. No `throwaway/*` branch was created even locally — an unpushed throwaway branch would be an artifact whose only purpose is a push that is not happening, and containment is strictly stronger with zero commits than with a commit that must be remembered not to merge. **No `gh` command that creates anything was run. No push, no branch, no PR, no GitHub object.**

**6. The gate is green on the restored tree** — `npm run security:audit` -> `EXIT=0`, shown in full above.

---

## Verification

| Gate | Result |
|---|---|
| `npm test` (base + RSC) | **172 files passed, 2 skipped; 5164 passed, 32 skipped** / **2 files, 8 passed** — exactly the stated baseline. 58.1 s. vitest 4.1.11 |
| `npm run typecheck` | **exit 0**, no output |
| `npm run lint` | **0 errors**, 124 warnings (the master baseline; gated on errors, never the warning total) |
| `npm run security:audit` | **exit 0** — 47 advisories, 39 at critical/high, all dispositioned, 1285 deps |
| `npm audit signatures` | **exit 0** — 1102/1102 signatures, 175 attestations |
| `git status --porcelain` | clean |
| `git diff --exit-code` / `--cached` | 0 / 0 |
| manifest sha256 vs pre-control | identical, both files |
| compose stack | UP — `pipelite-app-1` running, `pipelite-postgres-1` healthy, `pipelite-mailhog-1` running |
| Toolchain | node v24.13.1, npm 11.10.0 |

The required `ci` job on the merged tree, re-parsed to confirm the step under test is where 47-11 left it:

```
jobs: ["ci"]   job name: "ci"   services: ["postgres"]   step count: 9
  [7] "Security audit policy"           run="npm run security:audit"
  [8] "Registry signature verification" run="npm audit signatures"
```

Step **8 of 9** on the job whose `name: ci` is the required check-run name. That is the step this plan proved can fail, and the step GitHub has never run.

---

## Decisions Made

1. **The runner half was not delivered and not simulated.** The plan's Task 1 is a blocking human-action checkpoint precisely because pushing is outward-facing. A claimed green — or a local red presented as a runner red — would be the exact defect this milestone exists to remove. The gap is recorded instead, with an executable reproduction.
2. **The control was installed into the real working tree, not a scratch lockfile.** A scratch directory re-verifies the *advisory* (and that was done, separately, for A7), but it does not exercise `npm run security:audit` against **this** project's `audit-policy.json`, its 39 allowlist entries, its `failOn`, or its stale-entry detector. Only the real tree tests the gate.
3. **`npm install --save-dev` rather than `--package-lock-only`.** The CI step runs after `npm ci`, so the installed tree and the lockfile agree there; `--package-lock-only` would have left `node_modules` disagreeing with the lockfile and would not have allowed the `npm audit signatures` isolation check, which reads the installed tree (47-11's finding).
4. **No throwaway branch, not even locally.** The plan's containment shape (branch, PR, close unmerged) exists to protect a push. With no push, the strongest containment is zero commits and zero branches — which is what was delivered and proved.
5. **The neighbouring CI steps were run under the control.** Not in the plan. Without them "the audit step went red" and "something went red" are indistinguishable locally, and the `gh` per-step listing that would have separated them is unavailable. See deviation 1.

## Deviations from Plan

### Scope, imposed rather than discovered

**0. [Scope restriction — orchestrator] The remote half of every task was withheld**

- **Tasks 1 and 2** are human checkpoints (push approval; package-legitimacy approval). Task 2's *re-verification* work was performed and is recorded above; its approval remains the operator's.
- **Task 3** was delivered as its local half only: steps (2) minus the branch/commit, the local pre-flight in full, and (5)'s containment proofs in full. Its steps (1)'s GitHub green baseline, (3)'s remote red, `mergeStateStatus: BLOCKED`, the `--log-failed` excerpt, and (4)'s remote green **were not delivered**.
- **Not a Rule 1-4 deviation** — the plan's own text anticipates it: *"If any step cannot be completed — the operator declined the push … record exactly how far it got and mark SC-4's runner half NOT PROVED."* That is what this SUMMARY does.

### Auto-fixed / added

**1. [Rule 2 - Missing Critical] The neighbouring CI steps were run under the control, to isolate the red to one step**

- **Found during:** the control, applying hard rule 5 (attribute the failure)
- **Issue:** The plan obtains "`Security audit policy` is the failing step and the others are not" from `gh run view --json jobs`. Without a push there is no such listing, and the plan offered no local substitute. A red with no isolation evidence is weaker than the plan intends — it cannot distinguish "the audit gate fired" from "installing a package broke something".
- **Fix:** Ran `npm audit signatures` (CI step 9) and `npm run typecheck` (CI step 4) with the control still installed. Both exit 0. The signature count moved 1100 -> 1102, matching `npm install`'s own `added 2 packages`, which additionally confirms the installed tree is the one being audited.
- **Files modified:** none
- **Verification:** `npm audit signatures` -> `EXIT=0`, `1102 packages have verified registry signatures`; `npm run typecheck` -> `EXIT=0`.
- **Committed in:** no code artifact; recorded here.

**2. [Rule 2 - Missing Critical] The four OTHER causes of a red were each ruled out explicitly**

- **Found during:** the control, applying hard rule 5
- **Issue:** 47-11 measured two independent ways this gate exits 1 without any policy violation (unreachable registry; no installed tree), and 47-09 built two more tripwires (stale allowlist entries; a narrowed policy). The plan's acceptance criteria ask only that the FATAL names the GHSA. Naming the GHSA is necessary but not sufficient — the fail-closed path also prints a `FATAL:` and also exits 1.
- **Fix:** Added the ATTRIBUTION section: a table ruling out each of the four, plus the numeric complement table showing 47/14/1285 -> 48/15/1287 -> 47/14/1285 and `1 problem(s)`. The `parsed 48 distinct advisories` line is the specific discriminator against the network path, because it cannot print unless the audit document passed `assertAuditDocument`.
- **Files modified:** none
- **Verification:** the three verbatim runs above.
- **Committed in:** no code artifact; recorded here.

**3. [Rule 2 - Missing Critical] The lockfile diff was enumerated key-by-key, and the control turned out to be a DOWNGRADE**

- **Found during:** the control, applying hard rules 1, 2 and 4
- **Issue:** `npm install` reported *"added 2 packages, changed 1 package"* — the "changed 1" was unexplained, and hard rule 2 forbids disturbing `overrides.vite`, which a re-resolution could have done silently. `git diff --numstat` (25/7 lines on a 690 KB file) is far too coarse to see this.
- **Fix:** Parsed both lockfiles and diffed `packages` key by key. The result is a real finding: `minimist@1.2.8` was **already** hoisted in the tree, and the control **downgraded** it to 1.2.5 while pushing 1.2.8 into nested copies under `shadcn` and `tsconfig-paths`. Confirmed `removed: []`, `overrides` unchanged, `lockfileVersion` 3 -> 3, and no `rolldown`/`tsx`/`esbuild` among `added`.
- **Files modified:** none (the diff was inspected, then reverted)
- **Verification:** the enumeration above; `overrides = {"vite":"^7.0.0"}` read during the control.
- **Committed in:** no code artifact; recorded here.

**4. [Rule 2 - Missing Critical] Containment proved by sha256 + `Buffer.equals`, and by parsing every historical `package.json`**

- **Found during:** teardown
- **Issue:** The plan's containment check is `git log --all --oneline -- package.json` inspected for `minimist`. That greps **subject lines**, not file content, so a commit titled anything else would pass it — and this repository has measured `grep` returning "0 matches" for a file with 15 matching lines under the `rtk` hook.
- **Fix:** Hashed both manifests before the control, compared hashes **and** raw bytes after; and parsed the `dependencies`/`devDependencies` of `package.json` at **all 32** commits that touch it, rather than grepping messages. Also enumerated local branches to prove none was created.
- **Files modified:** none
- **Verification:** `RESTORE_OK=true`; `commits whose package.json declares minimist: 0`; `local branches: 4`.
- **Committed in:** no code artifact; recorded here.

---

**Total deviations:** 1 imposed scope restriction + 4 Rule 2 additions. **Zero scope creep** — no source file was touched, no dependency was left installed, and every addition is evidence about the control the plan already specified.

## Issues Encountered

- **The working tree advanced under this plan, mid-execution.** `git log --oneline -1` read `cdc5c88` at start; it is now `9e3fd2f chore: merge executor worktree (worktree-agent-aae2e5a7b67616259)`. The reflog dates three worktree merges at `2026-08-25 13:01:30 -0300` (16:01:30Z), i.e. concurrent with this plan's first commands. **The control is unaffected, and this was checked rather than assumed:** `git diff --numstat cdc5c88 HEAD -- package.json package-lock.json` is **empty**, so the merges did not touch either manifest, and both greens were measured against the same manifest bytes. The merge range touched five files — `ci.yml`, `47-10-SUMMARY.md`, `47-11-SUMMARY.md`, `audit-policy.test.ts`, `db-test-isolation.test.ts` — which is how 47-10's and 47-11's work reached this tree. The full suite was run **after** the merge and is green at the stated baseline.
- **`rtk` hazards, both reconfirmed.** `git status --porcelain` through the hook rendered as the single token `ok` rather than as empty output; every cleanliness claim in this SUMMARY was therefore re-measured with `rtk proxy git status --porcelain` and `git diff --exit-code`. And `git add .planning/…/deferred-items.md` failed with *"The following paths are ignored by one of your .gitignore files: .planning"* even though `git check-ignore` exits 1 for that path and `git ls-files` lists it as tracked; the commit nevertheless captured the file correctly (`1 file changed, 203 insertions(+)`), verified afterwards by reading `git show HEAD:<path>` back and confirming 30288 bytes containing `D-47-12-A`. **Do not trust a bare `git status` rendering, and verify the commit content rather than the `git add` exit code.**
- **`npm audit` exits 1 on every run of this tree**, green or red, because advisories exist at some severity. Every exit code in this SUMMARY is the **evaluator's**, never `npm audit`'s. The evaluator prints npm's code and says in the same breath that it is not the verdict.
- **`npm audit fix` was never run**, per hard rule 1. It is also not needed: the fix for the control is `git checkout`.
- **D-47-06-A did not bite.** The full suite ran once, clean, at the stated 5164/32.

## What a future reader must not conclude from this document

- **Not** that CI is green. `origin/master` is 111 commits behind and its last `ci` run predates Phase 46.
- **Not** that the audit gate blocks merges. No merge has ever been blocked by it; `mergeStateStatus` has never been read for this policy.
- **Not** that Phase 46's `Migration chain check` works. It has never executed anywhere except locally.
- **Not** that the runner can reach the registry's advisory bulk endpoint from a `contents: read` job. Untested. If it cannot, the gate goes **red**, not green (47-11 measured that) — which is the correct failure mode, but it will still be a red first run.
- **Only** this: on this machine, with this tree, this policy detects an unallowlisted critical advisory, names it, exits non-zero for that reason and no other, and returns to zero when the advisory leaves.

## Next Phase Readiness

- **The single blocking item is a push**, and it is the operator's. **D-47-12-A** in `deferred-items.md` carries the four-part reproduction: (A) push master and get the green baseline, asserting `headSha` equals the pushed HEAD — this also closes Phase 46's GAP 1; (B) throwaway branch + PR with the control, expecting `mergeStateStatus: BLOCKED` and `Security audit policy` as the sole failing step; (C) revert on the same branch, expecting green; (D) close the PR unmerged, delete the branch, re-prove containment. **Part A is not optional** — it is the 46-06 trap.
- **Two numbers to read off the first real run**, per 47-11: `Registry signature verification`'s package count (expect ~1100; far below means the runner's tree is not what `npm ci` should produce) and the added job time against the ~102 s cold / ~20 s warm bracket.
- **47-13 must not treat SEC-05 as complete.** Its CI wiring is complete, its policy is complete and enforceable, and its failure mode is now demonstrated — locally. The requirement is marked **partial**, not done.
- **Expect the first real `ci` run to be red, and treat that as information.** It is GitHub's first execution of a Postgres service container, of `npm run db:check-migrations`, and of two network audit steps (T-47-12-06, disposition `accept`). Fix the step; never delete the assertion.
- No blockers other than the push.

## Self-Check: PASSED

Re-run **after** the two doc commits landed, so these are the figures a reader will reproduce:

```
FOUND: .planning/phases/47-suite-trust-supply-chain/47-12-SUMMARY.md
FOUND: .planning/phases/47-suite-trust-supply-chain/deferred-items.md
FOUND: 65674d1        (docs — D-47-12-A, the operator's reproduction)
FOUND: 224ed23        (docs — this SUMMARY + STATE/ROADMAP/REQUIREMENTS)
git status --porcelain            -> (empty)
git rev-list --count origin/master..HEAD -> 113
git log --oneline -1 origin/master       -> a58b9e1 chore: archive v1.3 phase directories
refs (heads + remotes)            -> 8, none matching /throwaway/
git diff --exit-code -- package.json package-lock.json -> MANIFESTS PRISTINE
npm run security:audit            -> EXIT=0
docker compose ps                 -> pipelite-app-1 / mailhog / postgres all running
```

**113, not 111.** The `111` quoted throughout this document is the count measured *before* this plan's
own two documentation commits. The plan's substantive count — commits carrying Phase 46 and Phase 47
*work* — is 111; adding this SUMMARY and `D-47-12-A` made it 113. Neither number has been pushed, and
`origin/master` is unchanged at `a58b9e1`.

- `.planning/phases/47-suite-trust-supply-chain/47-12-SUMMARY.md` — FOUND
- `.planning/phases/47-suite-trust-supply-chain/deferred-items.md` — FOUND, contains `D-47-12-A`
- commit `65674d1` — FOUND
- `package.json` / `package-lock.json` — byte-identical to pre-control (sha256 + `Buffer.equals`)
- `minimist` — not a declared dependency; declared in 0 of 32 historical `package.json` versions
- `git status --porcelain` — clean
- local branches — 4, unchanged; **no `throwaway/*` branch created**
- pushed / GitHub objects created — **NONE**
- compose stack — UP

---
*Phase: 47-suite-trust-supply-chain*
*Completed: 2026-08-25*
