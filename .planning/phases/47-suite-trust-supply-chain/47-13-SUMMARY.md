---
phase: 47-suite-trust-supply-chain
plan: 13
subsystem: testing
tags: [vitest, negative-controls, npm-audit, supply-chain, ast-gates, phase-signoff]

# Dependency graph
requires:
  - phase: 47-suite-trust-supply-chain
    provides: "the thirteen executed plans (01-12, 14) whose recorded controls this plan audits"
  - phase: 46-migration-chain-toolchain-floor
    provides: "46-06's sign-off register shape, and the `Migration chain check` gate this plan confirms unbroken"
provides:
  - "the nine-row negative-control register, each row judged for REAL output with its decisive line quoted"
  - "three of the five A-E controls independently re-falsified in this session rather than accepted on the record"
  - "a one-line verdict per ROADMAP success criterion, with two labelled PARTIALLY PROVED / NOT PROVED"
  - "the WR-11 rename question answered per gate, rather than assumed"
  - "the phase gate recorded with literal numbers and the +425 suite delta reconciled plan by plan to an exact match"
  - "the phase's corrections to its own planning documents, collected"
  - "the carry-forward register: D-47-08-A, D-47-08-B, D-47-12-A, SEC-47-A"
affects: [phase-48, phase-49, verify-phase-46, verify-phase-47, milestone-v1.4-signoff]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "sign-off by auditing recorded evidence, not by re-asserting intent (46-06's register, reproduced)"
    - "a gate with no recorded red observation is treated as NOT DELIVERED, and saying so beats a tick"
    - "re-falsify a sample of another agent's controls in the sign-off plan rather than quoting them"

key-files:
  created:
    - .planning/phases/47-suite-trust-supply-chain/47-13-SUMMARY.md
  modified: []

key-decisions:
  - "No eighth vacuous gate found — the four vacuity tests were applied to every new gate and all nine controls carry a recorded green-before-red"
  - "SEC-05 stays `[ ]` PARTIAL: SC-4's runner half is NOT PROVED, and `requirements mark-complete` was NOT invoked for SEC-05"
  - "The ten-run pass-set diff is recorded as a regression guard and is presented as evidence for nothing"
  - "MIN_NON_TEST_PERFORMANCE_NOW = 2 is a floor set AT its measurement — recorded as a false-RED brittleness, explicitly NOT called vacuous"

patterns-established:
  - "Verdict vocabulary: PROVED / PROVED BY A SUBSTITUTED MECHANISM / PARTIALLY PROVED / NOT PROVED, each with named evidence"
  - "Suite-count reconciliation as a per-plan delta ledger whose sum must land exactly on the measured total"

requirements-completed: [QG-01]

# Metrics
duration: 21min
completed: 2026-08-25
---

# Phase 47 Plan 13: Phase Close-Out — The Evidence Audit Summary

**Nine negative controls audited against the phase's own standard: eight DELIVERED with verbatim tool
output, one (control E) DELIVERED LOCALLY and NOT DELIVERED on the real runner; three re-falsified
fresh in this session; no eighth vacuous gate found; QG-01 closed, SEC-05 left PARTIAL.**

## Performance

- **Duration:** ~21 min
- **Started:** 2026-08-25T16:19:00Z
- **Completed:** 2026-08-25T16:40:00Z
- **Tasks:** 2 of 2
- **Files modified:** 0 source files (this plan's `files_modified` is empty, and the tree is clean —
  `git diff --exit-code` exit 0 before and after every control)

## Task Commits

This plan changes no source file. Its only artefact is this document.

**Plan metadata:** see the `docs(47-13)` commit at the foot of this file.

Three files were temporarily patched to re-falsify controls and each was reverted with
`git checkout -- <path>` (never `git clean`, never a blanket reset):
`src/lib/execution/toggle.test.ts`, `src/lib/execution/condition-evaluator.ts`, `audit-policy.json`.
All three reverts verified with `git diff --exit-code`, exit 0.

---

# PART 1 — THE NEGATIVE-CONTROL REGISTER

Nine controls: the five A-E from `47-VALIDATION.md`, plus the four this phase added beyond them. Each
was judged on the 46-06 standard — **does the SUMMARY carry verbatim tool output (an assertion diff,
an exit code, a `FATAL:` line, a `gh` payload) rather than a description of what was expected** — with
the decisive line quoted and the complement checked.

| NC | Gate | Owning plan | Carries REAL output? | The decisive line | Complement recorded? | Verdict |
|---|---|---|---|---|---|---|
| **A** | counted ops FLOOR + AST structural | 47-04 | **YES** — assertion diff with a measured integer | `AssertionError: read 0 counted characters over 62073 input characters (0.000/char)` … `expected 0 to be greater than or equal to 62073` | YES — GREEN before (§0) and after revert (§2), plus in-file `KNOWN_NEGATIVE_FORWARD_SCAN` | **DELIVERED** |
| **B** | counted ops CEILING | 47-04 | **YES** — assertion diff with a measured ratio | `AssertionError: read 153.121 counted characters per input character over 62073 input characters` … `expected 153.12098658031672 to be less than or equal to 6` | YES — GREEN after revert (§4), and the full AST half passed, which is the control's point | **DELIVERED** |
| **C** (hook half) | `suite-hook-hygiene` | 47-03 (extended 47-14) | **YES** — offender list with `file:line` | `src/lib/execution/toggle.test.ts:106: beforeEach (opened at :105) contains import("@/app/workflows/actions")` | YES — GREEN → RED → GREEN, and separately the **carve-out complement** (delete `vi.resetModules()` from `crm.test.ts:95`) went red on two assertions | **DELIVERED** |
| **C** (timing half, shape 1: inline delta) | `suite-timing-hygiene` | 47-05 | **YES** — offender list with `file:line` and a classification | `src/lib/formula-engine.test.ts:409: [delta/threshold] expect(Date.now() - t).toBeLessThan(5000)` | YES — GREEN at (0), (2) and (4); six in-file `KNOWN_NEGATIVE` fixtures each paired with a parse floor | **DELIVERED** |
| **C** (timing half, shape 2: bound-variable ratio) | `suite-timing-hygiene` | 47-05 | **YES** — plus a measured **ablation** of the weaker matcher | `src/lib/formula-engine.test.ts:413: [ratio/threshold] expect(b / a).toBeLessThan(80)` — and `V1 ABLATION … clock calls appearing INLINE inside expect(...): 0` on the same live red | YES — same GREENs, plus a permanent in-file ablation test | **DELIVERED** |
| **D** | `audit-policy` shape gate | 47-10 (built 47-09) | **YES** — three reds against the **shipped** file, plus a bidirectional falsification of the control block itself | `AssertionError: GHSA-ggv3-7p47-pfv8 (next)'s reason is 8 characters; the floor is 80` and `AssertionError: expected [] to deeply equal [ 'critical', 'high' ]` | YES — and unusually strongly: `evaluatePolicy` was stubbed **never-report** (22 red) *and* **always-report** (31 red, a *different* set including every complement) | **DELIVERED** |
| **E** | the REQUIRED GitHub `ci` check | 47-12 | **LOCAL HALF: YES.** **RUNNER HALF: NO OUTPUT EXISTS** | local: `FATAL: minimist critical GHSA-xvch-5gv4-984h has NO recorded disposition` … `EXIT=1`. Runner: `$ git log --oneline -1 origin/master` → `a58b9e1 chore: archive v1.3 phase directories` | Local: YES — exit 0 → 1 → 0, manifests byte-identical by sha256 after revert. Runner: no green baseline exists either | **LOCAL HALF DELIVERED. RUNNER HALF NOT DELIVERED.** |
| **extra 1** | the pass-set differ's truncated-reference floor | 47-02, re-proved 47-06 | **YES** — the decisive control is the one where the *diff itself* stays clean | `run 02: IDENTICAL (57 tests)` … `reference pass set = 57 (floor 4000) FAIL` … `EXIT=1`, and for the empty pair `IDENTICAL (both empty — proves nothing)` | YES — "Restored — the same directory, untouched, green"; plus three further guards red (single iteration, half-written iteration) | **DELIVERED** |
| **extra 2** | the carve-out complement (`vi.resetModules()` deleted from a carved-out file) | 47-03 | **YES**, and it is the most instructive row in this table | `crm.test.ts is exempted because its hook calls vi.resetModules() … That reset is gone, so the reason for the exemption is gone` — **while the sweep itself stayed GREEN** | YES — the other three carved-out files stayed green in the same run, so the failure is the file that changed and not a broken detector | **DELIVERED** |
| **extra 3** | the audit evaluator's data floors | 47-09 | **YES** — seven doctored documents, each with its own `FATAL:` | `FATAL: the audit document does not reconcile: vulnerabilities contains 0 package(s) at high while metadata.vulnerabilities.high says 4` | YES — `POSITIVE the real document, unmodified → PASSED (advisories=47, packages=14, deps=1285)` | **DELIVERED** |
| **extra 4** | the five workflow-assertion falsifications, incl. the below-floor step count | 47-11 | **YES** — and the parsed step labels are printed, which is what separates "absent" from "reader broken" | `AssertionError: only 5 steps parsed out of job \`ci\` — below the floor of 8. A per-step gate over an empty list passes because it is broken.: expected 5 to be greater than or equal to 8` | YES — Control 1 baseline GREEN, restore-to-GREEN after each of the five, **plus the floor observed RED before the steps existed** (assertions-first execution) | **DELIVERED** |

## Where the register is stronger than the plan asked for

Three rows carry evidence the plan did not require, and they are the rows worth reading:

1. **Control A's CEILING PASSED.** 47-04 stated it in as many words, and I re-measured it (§ below).
   A ceiling-only gate would have shipped green over the *worse* of the two vulnerable parsers, because
   a regex reads zero counted characters at every input size and `0 <= 6 × 62073` is trivially
   satisfied. Control B is the mirror image: **the entire AST half passed control B.** Neither half is
   redundant, and a phase that shipped one of them would have shipped a hole in exactly the shape of
   the other's control.
2. **Control D was falsified in BOTH directions.** A block of `toHaveLength(1)` assertions proves
   nothing on its own — a never-reporting checker and an always-reporting checker are both consistent
   with a green block. 47-10 stubbed `evaluatePolicy` both ways and got two *different* red sets
   (22 and 31), the second of which catches every complement. That is the
   `node-engines-floor.test.ts:332-336` lesson applied rather than cited.
3. **Extra 2 is the phase's best single argument against exclusion lists.** Deleting
   `vi.resetModules()` from a carved-out file left the **sweep green** — the file was still
   path-excluded — and only the per-file live control noticed that the exemption now covered a file
   that no longer qualified for it. That is exactly how an exclusion list rots into a silent hole, and
   it was caught by design rather than by luck.

## Independent re-measurement — not quoted from any SUMMARY

Run in this session, on the merged tree at `5cda23c`, `vitest 4.1.11`:

```
$ ./node_modules/.bin/vitest run src/lib/__tests__/suite-timing-hygiene.test.ts \
    src/lib/__tests__/suite-hook-hygiene.test.ts src/lib/__tests__/audit-policy.test.ts \
    src/lib/execution/condition-evaluator.test.ts \
    src/lib/mutations/__tests__/db-test-isolation.test.ts --reporter=default

 RUN  v4.1.11 /home/pedro/programming/pipelite

 ✓ src/lib/__tests__/audit-policy.test.ts (280 tests) 232ms
 ✓ src/lib/mutations/__tests__/db-test-isolation.test.ts (26 tests) 186ms
 ✓ src/lib/execution/condition-evaluator.test.ts (91 tests) 441ms
 ✓ src/lib/__tests__/suite-hook-hygiene.test.ts (75 tests) 563ms
 ✓ src/lib/__tests__/suite-timing-hygiene.test.ts (46 tests) 73ms

 Test Files  5 passed (5)
      Tests  518 passed (518)
```

## THREE controls re-falsified FRESH in this session

The plan asked for one. Three were done, because re-measuring another agent's measurement is a
standing lesson of this project and because three is the number that covers all three *mechanisms*
(an AST/counted gate over source, a sweep over the test corpus, and a policy gate over a shipped data
file).

### Fresh red 1 — Control A, re-falsified: the regex `tokenizeFieldPath`

`tokenizeFieldPath`'s body was replaced with a nested-quantifier regex grammar
(`String(path).split(".")`, one `CHUNK.exec` per chunk, one global `KEY.exec` loop). **9 of 91 tests
went red**, and the decisive line reproduced 47-04's number to the character:

```
 FAIL  src/lib/execution/condition-evaluator.test.ts > … > FLOOR: reads at least 1 counted character per input character
AssertionError: read 0 counted characters over 62073 input characters (0.000/char). A count at or near
ZERO means the parse moved inside a native call the facade cannot see — a regex or a bulk scanner —
which is the ReDoS shape this gate exists to catch. Re-measure and record the number in
MIN_COUNTED_PER_CHAR's comment; never lower the floor to go green.: expected 0 to be greater than or
equal to 62073
 ❯ src/lib/execution/condition-evaluator.test.ts:934:9
```

The AST half named both regex literals with `file:line`:

```
+ [
+   "src/lib/execution/condition-evaluator.ts:47: /^([^.[]*)((?:\\[(?:\"(?:[^\"]|\"\")*\"|'(?:[^']|'')*')\\])*)$/",
+   "src/lib/execution/condition-evaluator.ts:48: /\\[(?:\"((?:[^\"]|\"\")*)\"|'((?:[^']|'')*)')\\]/g",
+ ]
```

and the bulk-scanner assertion added `tokenizeFieldPath calls .split` and `… calls .exec`.

**AND THE CEILING PASSED, RE-MEASURED HERE:**

```
$ ./node_modules/.bin/vitest run src/lib/execution/condition-evaluator.test.ts -t "CEILING"
 Test Files  1 passed (1)
      Tests  1 passed | 90 skipped (91)
```

```
       × FLOOR: reads at least 1 counted character per input character 2ms
       ✓ CEILING: reads at most 6 counted characters per input character 1ms
```

47-04's central claim is therefore independently confirmed, not accepted. Revert →
`git diff --exit-code` exit 0 → `91 passed (91)`.

**One extra observation from this re-run, which 47-04 did not record.** The WR-11 permitted-token
floor also went red under the regex shape, for the *right* reason:

```
 FAIL  … > the call extractor still extracts calls — the WR-11 permitted-token floor
AssertionError: the forward scan finds each closing quote with indexOf: expected [ '.exec', '.has', '.push', …(2) ] to include '.indexOf'
```

The floor's own search token (`.indexOf`) vanished because the implementation changed, and the floor
said so instead of going quiet. That is the WR-11 property working in the direction it was built for.

### Fresh red 2 — Control C (hook half), re-falsified on the extended gate

`toggle.test.ts`'s synchronous `beforeEach` was made `async` with
`await import("@/app/workflows/actions")` appended — deliberately in a file the sweep enumerates, not
a scratch fixture.

```
 FAIL  src/lib/__tests__/suite-hook-hygiene.test.ts > no lifecycle hook performs or reaches a dynamic import() > finds no hook-budget import() outside the documented carve-outs
AssertionError: a lifecycle hook performs a dynamic import(), or calls a helper that does. … Offenders:
src/lib/execution/toggle.test.ts:103: hook beforeEach (opened at :101) contains
import("@/app/workflows/actions"): expected [ Array(1) ] to deeply equal []

 Test Files  1 failed (1)
      Tests  1 failed | 74 passed (75)
VITEST_EXIT=1
```

Note the gate is now **75 tests**, not 47-03's 39 — 47-14 extended its corpus from hooks to test
bodies and helpers, and the describe name changed from `performs a dynamic import()` to `performs or
reaches a dynamic import()`. **The extension did not weaken the original control:** the same
falsification still produces the same single red naming the same `file:line`. Revert →
`git diff --exit-code` exit 0 → `75 passed (75)`.

### Fresh red 3 — Control D, re-falsified against the shipped `audit-policy.json`

`allowlist[0]`'s reason (898 chars) replaced with `"dev-only"`. **Four red, exactly reproducing
47-10's D-1 record (4 failed | 276 passed):**

```
 ❯ src/lib/__tests__/audit-policy.test.ts (280 tests | 4 failed) 181ms
 FAIL  … > the policy files exist and have contents (anti-vacuity) > the shipped policy satisfies its own evaluator against an empty advisory set
 FAIL  … > NC-D: the policy checker can produce a red > THE CROSS-FILE COMPLEMENT: accepts the SHIPPED policy against a clean audit document
 FAIL  … > every shipped allowlist entry, named > 'GHSA-ggv3-7p47-pfv8 (next)' gives a substantive, non-forbidden reason
 FAIL  … > the evaluator applied to the SHIPPED policy file, not to a fixture of it > reports nothing when every shipped entry's advisory is reported
AssertionError: GHSA-ggv3-7p47-pfv8 (next)'s reason is 8 characters; the floor is 80. A reason that
would be true of any project is not a reason — name the call site, the measurement, and the
alternative that was rejected.: expected 8 to be greater than or equal to 80
      Tests  4 failed | 276 passed (280)
```

**And, going beyond the plan, the SHIPPED gate on the SHIPPED file over the SHIPPED network path:**

```
$ npm run security:audit
-> parsed 47 distinct advisories across 14 vulnerable package(s); npm audited 1285 dependencies
-> applying audit-policy.json: failOn ["critical","high"], 39 allowlist entries

FATAL: audit-policy.json allowlist[0] (GHSA-ggv3-7p47-pfv8) gives "dev-only" as its reason, which is
on FORBIDDEN_REASONS. A reason must say why the advisory does not apply to THIS project's usage —
name the call site, the measurement, and the alternative that was rejected.

FATAL: the advisories in package-lock.json do not satisfy audit-policy.json (1 problem(s) above). …
AUDIT_EXIT=1
```

**This is a SECOND, independent local demonstration that the audit gate can fail, by a different
mechanism from 47-12's.** 47-12 broke the *tree* (an unallowlisted critical); this breaks the
*policy* (a forbidden reason). Both reach exit 1 from exit 0 and return to exit 0 on revert. It does
not move SC-4's runner half one inch, and it is not offered as if it did.

Revert → `git diff --exit-code` exit 0 → reason back to 898 chars → `280 passed (280)` → `npm run
security:audit` exit 0.

### Which controls I ACCEPTED on the record, and why that is reasonable

| NC | Accepted because |
|---|---|
| **B** | The SUMMARY carries a measured number inside an assertion diff (`153.121` against a ceiling of `6`), a second independent red (FLATNESS `9.596x` against `1.25`), a third whose message shows the constant became a function of n (`[26121, 832121]` vs `[26121, 26121]`), and a standalone growth table (1.55 → 1.52 for the correct parser, 30.22 → 127.31 for the control) across a 16x span. Fabricating that set is harder than producing it. The re-falsification of A already exercised the same file, the same facade and the same AST extractor. |
| **C** (timing half) | Two shapes, two `file:line` offender lists with distinct classifications (`delta/threshold`, `ratio/threshold`), plus an **ablation** measured on the live red (`V1 ABLATION … 0` where the fixpoint reports 1) and a permanent in-file test that re-runs that ablation. I did independently confirm the gate's *current* verdict: hit list empty, and all three original offenders now carry `performance.now: 0, Date.now: 0, toBeLessThan(80): 0`. |
| **E** (local half) | Byte-level containment (`sha256` before, `Buffer.equals` after), a key-by-key lockfile diff, and the finding that the control was a *downgrade of an already-hoisted safe 1.2.8*, not a naive addition. I reached the same exit-0 → 1 → 0 conclusion by a different route today (fresh red 3). |
| **extras 1, 3, 4** | All three print their own verdicts as tool output with exit codes, and extra 4's parsed-step-label lists are self-authenticating: a broken reader would have printed nothing, not eight correct labels with the ninth genuinely absent. |

---

## THE WR-11 RENAME QUESTION, ANSWERED PER GATE

*"What would a rename of the token or identifier this gate keys off do to it?"* — answered from the
source, not assumed. Floors read out of the files in this session.

| Gate | Keys off | A rename does what? | The floor that says so |
|---|---|---|---|
| `condition-evaluator.test.ts` AST half | the identifiers `resolveFieldPath` / `tokenizeFieldPath`, and the method names `.indexOf` / `.slice` / `.trim` | **RED, loudly.** Renaming either function fails `the parse finds a function declaration named tokenizeFieldPath` (`:1391`). Changing the scan's method vocabulary fails the permitted-token floor (`:1413-1423`) — **observed live in fresh red 1**, where `.indexOf` vanished and the floor fired. | `MIN_RESOLVE_BODY_NODES`, `MIN_TOKENIZE_BODY_NODES`, and the `toContain(".indexOf" / ".slice" / ".trim")` triple |
| `condition-evaluator.test.ts` counted half | nothing renameable — it calls the exported function through a counting facade | **N/A.** There is no search token. If the export is renamed the file does not compile, and `npm run typecheck` (exit 0 today) is the gate. | `MIN_COUNTED_PER_CHAR = 1` catches a count that fell to zero |
| `suite-hook-hygiene.test.ts` | vitest's lifecycle-hook names and the `import(` **syntax node** (an `ImportKeyword` call, not a text match) | **RED.** A developer cannot rename `beforeEach` or the `import()` syntax without breaking the suite itself. If the hook-name list ever stopped matching, `hooksSeen` drops below the floor and the gate fails. | `MIN_TEST_FILES = 150` (178 today), `MIN_HOOKS_PARSED = 140` (151), `MIN_TEST_CALLBACKS_PARSED = 3000` (3735), `MIN_CARVED_OUT_HOOK_IMPORTS = 4`, `MIN_CARVED_OUT_TEST_IMPORTS = 17`, `MIN_UNTYPED_COMPILED_IMPORTS = 2` |
| `suite-timing-hygiene.test.ts` | `Date.now` / `performance.now` (JS builtins) and `expect` (vitest) | **RED.** None is renameable by this project. The floors exist so a *matcher* regression is caught, not a rename: if the clock-call matcher broke, the counts collapse and three floors fire. | `MIN_EXPECT_CALLS = 7000`, `MIN_DATE_NOW_CALLS = 25` (66 today), `MIN_NON_TEST_PERFORMANCE_NOW = 2` (2 today — see the caveat below), `MIN_FIXPOINT_ITERATIONS = 2` |
| `audit-policy.test.ts` / `scripts/audit-policy.mjs` | `failOn`, `FORBIDDEN_REASONS`, the `GHSA-xxxx-xxxx-xxxx` token, `AUDIT-POLICY.md`'s heading format, and the JSON keys `ghsa`/`reason`/`reach`/`expires` | **RED.** `FORBIDDEN_REASONS` is asserted **by value** with `toEqual` (`:310`) — 47-10 proved that removing `"dev-only"` from it *silently deleted an NC-1 control case* (271 → 270 tests) and the by-value assertion is what made that loud. `failOn` is asserted with array equality and a separate anchor test **forbids `toContain` on it**, because containment lets a widened list pass. A prose heading-format change fires the heading token floor (`:968`). | `MIN_ALLOWLIST_ENTRIES = 1`, `MIN_DOC_GHSA_IDS = 4`, `MIN_POLICY_DOC_CHARS = 3000`, `MIN_LOCKFILE_PACKAGES = 500`, `MIN_REASON_LENGTH = 80` |
| `db-test-isolation.test.ts`'s CI assertions (47-11) | the literal run strings `npm run security:audit` and `npm audit signatures`, and the job name `ci` | **RED.** Each is asserted present in *exactly one* step, so renaming the npm script fails the presence check. Controls 2 and 4 proved the reader is not the thing failing: the parsed label list came back with eight correct labels and the ninth genuinely gone, and the two controls produced *complementary* lists, which also proves the two assertions are not aliased. | `MIN_CI_STEPS = 8` against 9 steps — observed red at 5 (Control 5) **and** at 7 (before the steps existed) |

**No gate in this phase can go green because a token it searches for was renamed.** That was the
seventh vacuous gate's mechanism (Phase 46 WR-11) and it is closed in all six rows above.

## The self-collision mitigation — exactly ONE per gate file, confirmed from source

Both self-sweeping gate files take **fixtures-as-source-strings** and **not** path exclusion, and each
asserts that it is not excluded from its own sweep:

```
suite-timing-hygiene.test.ts:159  THE SELF-COLLISION MITIGATION — THERE IS EXACTLY ONE, AND THIS IS IT
suite-timing-hygiene.test.ts:172  THIS FILE IS NOT PATH-EXCLUDED FROM ITS OWN SWEEP. EXCLUDED_PATHS is empty, asserted empty
suite-timing-hygiene.test.ts:325  const EXCLUDED_PATHS: readonly string[] = []
suite-timing-hygiene.test.ts:1267 it("is enumerated by its own walk", …)
suite-timing-hygiene.test.ts:1271 it("is NOT path-excluded from its own sweep", …)

suite-hook-hygiene.test.ts:117    THE SELF-COLLISION MITIGATION — THERE IS EXACTLY ONE, AND THIS IS IT
suite-hook-hygiene.test.ts:135    Taking BOTH mitigations was considered and rejected.
suite-hook-hygiene.test.ts:1484   it("is enumerated by its own walk", …)
suite-hook-hygiene.test.ts:1488   it("is NOT path-excluded from its own sweep", …)
```

`suite-hook-hygiene.test.ts` does carry an `EXCLUDED_PATHS` list — the four `vi.resetModules()`
carve-outs, the skipped `*-live` files and the test-scope carve-outs — but **it does not contain the
gate's own path**, and each carve-out has a per-file **live control** asserting the reason for the
exemption still holds. Extra 2 is the proof that those live controls are load-bearing: the sweep
stayed green when a carve-out's justification disappeared, and only the live control caught it.
`suite-hook-hygiene.test.ts:152` records the reasoning in the file.

The live controls that prove each gate file is enumerated by its own sweep passed in this session's
re-run (`is enumerated by its own walk`, `is NOT path-excluded from its own sweep`, `parses to zero
lifecycle hooks and MANY test callbacks, which proves the fixtures are strings`, `still physically
contains the fixture source the parse cannot see`).

## IS THERE AN EIGHTH VACUOUS GATE? — NO. Here is the audit that says so.

The standing assumption going in was that this phase produced one. Four tests were applied to every
new gate.

| Vacuity test | Result |
|---|---|
| **Green-before-red recorded?** — a red without a preceding green shows only that the gate was already red | **All nine controls carry one.** A/B: 47-04 §(0). C hook: 47-03 (1). C timing: 47-05 (0). D: 47-10 baseline `280 passed (280)`. E: 47-12 (1) `EXIT=0`. Extra 1: "Restored — the same directory, untouched, green". Extra 3: `POSITIVE the real document, unmodified → PASSED`. Extra 4: Control 1 baseline `26 passed (26)`. |
| **A floor raised past usefulness, or set AT its measurement?** | Twelve of thirteen floors sit well below their measurement and were observed firing: `MIN_CI_STEPS` 8/9 fired at 5 and at 7; `MIN_REFERENCE_PASS_SET` 4000/4747 fired at 57 and 0; `MIN_HOOKS_PARSED` 140/151; `MIN_EXPECT_CALLS` 7000; `MIN_TEST_FILES` 150/178; `MAX_COUNTED_PER_CHAR` 6 against a measured 1.52-1.71 and a control at 153.121 (a 25x separation). `MIN_ADVISORIES_PARSED = 3` against 47 looks wrong and 47-09 argued it out explicitly: full remediation would legitimately leave 8, so any floor above 8 would fatal on **success** and be "fixed" by lowering it. **One exception, recorded below.** |
| **Would a rename turn it green?** | No, in all six rows of the table above. |
| **Satisfied by two empty sets?** | No. 47-02's differ prints `IDENTICAL (both empty — proves nothing)` and exits 1. Both hygiene gates' `toEqual([])` are guarded by parse floors plus `KNOWN_POSITIVE`/`KNOWN_NEGATIVE` self-tests. `audit-policy` has `MIN_ALLOWLIST_ENTRIES = 1` guarding every `for (const entry of allowlist)` and `assertAuditDocument` refusing seven shapes of empty document. The condition evaluator's AST half floors its own call set: `expect(calls, "an empty call set makes the forbidden-scanner check vacuous")`. |
| **A self-sweeping gate with BOTH fixture-stringification AND path exclusion?** (two independent reasons to be green) | No — exactly one mitigation per gate file, asserted, with a live control. Both files say in a header comment that taking both was **considered and rejected**. |

### The one thing I will name, and it is NOT a vacuous gate

**`MIN_NON_TEST_PERFORMANCE_NOW = 2` (`suite-timing-hygiene.test.ts:303`) is a floor set exactly AT
its measurement, over a file this phase does not own.** Measured independently here:

```
performance.now( in NON-TEST src: 2  src/app/api/health/route.ts
performance.now( in TEST corpus:  5  src/lib/__tests__/suite-timing-hygiene.test.ts:5  (all string fixtures)
```

Both real sites are the DB-latency probe at `src/app/api/health/route.ts:111` and `:121`, landed in
Phase 42 (`2710f73`). If that instrumentation is ever refactored to `Date.now()` or moved, the floor
goes **red for a reason that says nothing about the gate's subject**, and the tempting "fix" is to
lower it to 0 — which is the floor mechanism's own failure mode arriving through the floor mechanism,
the exact hazard 47-09 reasoned about for `MIN_ADVISORIES_PARSED` and did not apply here.

**Why this is brittleness, not vacuity:** the risk direction is a **false RED**, not a false green — a
gate that fails too easily is a nuisance, not a lie. And the matcher this floor protects is
independently proven by an in-file fixture (`(iv) performance.now variant of (i)`, in the
`KNOWN_POSITIVE` set), so lowering the floor to 0 would not leave the `performance.now` matcher
unverified. Recorded here rather than patched, per this plan's own rule: a finding recorded at
sign-off is worth more than a finding quietly fixed at sign-off, and if anyone wants the floor
softened it needs its own plan and its own red.

**Nothing was fixed, weakened, skipped or tidied in this plan.** `files_modified` is empty, three
temporary control patches were each reverted, and `git diff --exit-code` returns 0.

---

# PART 2 — THE PHASE GATE

Every number below was produced in this session on `master` at `5cda23c`, in the main working tree —
no worktree, hooks on, no `--no-verify`.

| Gate | Command | Result |
|---|---|---|
| Full suite, base | `npm test` | **5164 passed / 32 skipped**, **172 files passed / 2 skipped (174)**, 57.13 s |
| Full suite, RSC | (same command, second project) | **8 passed (8)**, 2 files, 472 ms |
| `npm test` exit | | **0** |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | **exit 0**, no output |
| Lint | `npm run lint` | **exit 0** — `✖ 124 problems (0 errors, 124 warnings)`. **Gated on ERRORS = 0.** The warning total is recorded and NOT gated |
| Advisory policy | `npm run security:audit` | **exit 0** — `OK: 47 advisories evaluated across 14 vulnerable packages (39 at critical/high), 39 of 39 allowlist entries applied, 1285 dependencies audited.` |
| Migration chain (Phase 46's gate) | `npm run db:check-migrations` | **exit 0** — `OK: the migration chain builds a complete schema from zero`. 36/36 tables, 293/293 columns, 81/81 indexes, 83/83 constraints, 9/9 enums, 38/38 functions, 3/3 extensions IDENTICAL. Three dimensions honestly reported `IDENTICAL (both empty — proves nothing)` |
| Container | `docker compose ps` | 3 services — `pipelite-app-1` Up 6 h, `pipelite-postgres-1` Up 2 weeks **(healthy)**, `pipelite-mailhog-1` Up 2 weeks |
| Image identity | `docker compose images` | `pipelite-app:latest` = **`8f07a18eddad`**, 370 MB — the single image 47-08 built. No rebuild was needed or performed |
| In-container versions | `docker compose exec app node -e …` | `next 16.1.6 | node v24.19.0` — consistent with 47-08's revert of `16.3.2` |
| Health | `curl http://localhost:3001/api/health` | **HTTP 200**, `status: ok`, `db.ok: true`, `db.latencyMs: 7`, **processors 10 total / 10 alive** |
| Working tree | `git diff --exit-code` / `git diff --cached --exit-code` | **exit 0 / exit 0**. Untracked outside `.planning/`: none |
| HEAD | `git log --oneline -1` | `5cda23c docs(47-12): record the post-commit self-check and reconcile 111 vs 113 unpushed`, branch `master` |
| Host versions | | `vitest 4.1.11`, `vite 7.3.6`, `next 16.1.6` |

The ten processors, individually: `webhook-processor`, `email-processor`, `schedule-processor`,
`execution-processor`, `audit-prune`, `trash-prune`, `webhook-subscriber`,
`workflow-trigger-subscriber`, `stage-history-subscriber`, `audit-subscriber` — all `alive: true`.

**`git status --porcelain` was not used as the cleanliness oracle.** Under `rtk` it renders as the
token `ok` rather than as empty output — reproduced in this session — so cleanliness was asserted with
`git diff --exit-code`, which returns a real exit code.

## The suite count, reconciled plan by plan to an EXACT match

Phase opening (`47-RESEARCH`, tree `5331d96`): **4739 passed / 32 skipped, 169 files passed / 2
skipped.** Final: **5164 / 32, 172 files passed / 2 skipped.** Delta **+425 tests, +3 files**.

Only 3 test files were added and 13 modified across the whole phase
(`git diff --name-status 5331d96 HEAD -- 'src/**/*.test.ts'`), and 169 + 3 = **172** accounts for the
file delta exactly. The 2 skipped files are the pre-existing `*-live` pair, unchanged.

| Plan | Δ tests | What moved | Corroborating number, quoted from that plan's SUMMARY |
|---|---|---|---|
| 47-01 | 0 | `package.json` / lockfile only | `4739 passed / 32 skipped` |
| 47-02 | 0 | `scripts/` + `measure/` harness, no test file | `4739 passed / 32 skipped` |
| 47-03 | **+39** | `suite-hook-hygiene.test.ts` created (39 tests) | `4739 + 39 new gate tests = 4778 exactly, and 169 + 1 file = 170` |
| 47-04 | **+21** | `condition-evaluator.test.ts` 70 → **91** (elapsed ratio replaced by 8 counted + 14 structural `it`s) | `4 760 passed / 32 skipped (from 4 739 / 32; +21 tests, all in this file), 169 files passed / 2 skipped` |
| 47-05 | **+46** | `suite-timing-hygiene.test.ts` created (46 tests). Two elapsed **assertions** deleted, **zero tests**: `formula-engine` 70 → 70, `client-formula-bounds` 9 → 9 | `4845 passed / 32 skipped` |
| 47-06 | 0 | measurement only, `files_modified: []` | `4845 passed / 32 skipped` |
| 47-07 | 0 | dependency bumps only | `4799` = 4739 + 39 + 21 (its worktree predated 47-05) |
| 47-08 | 0 | `next` bump reverted; Docker rebuild | `4845 passed / 32 skipped` |
| 47-09 | **+52** | `audit-policy.test.ts` created (52 tests) | `4845 → 4897 passed | 32 skipped` |
| 47-10 | **+228** | `audit-policy.test.ts` 52 → **280** (`it.each` conversion + the permanent NC-D block) | `4897 → 5125 passed | 32 skipped` |
| 47-11 | **+3** | `db-test-isolation.test.ts` 23 → **26** (two supply-chain step assertions + the raised floor) | `4900 passed / 32 skipped`, and `db-test-isolation.test.ts (26 tests)` |
| 47-12 | 0 | control E, manifests reverted byte-identical | (no suite count recorded; nothing changed) |
| 47-14 | **+36** | `suite-hook-hygiene.test.ts` 39 → **75** (corpus extended to test bodies + helpers). The 106-site hoist added **0** tests: 7 files, `TOTAL 176 → 176, Δ 0` | `4933` = 4845 + 52 + 36 (its worktree carried 47-09 but not 47-10 or 47-11) |

```
4739 +39 = 4778  +21 = 4799  +46 = 4845  +52 = 4897  +228 = 5125  +3 = 5128  +36 = 5164
```

**5164 is the measured total. The ledger lands on it exactly, and every intermediate figure appears
verbatim in a plan SUMMARY.** No unexplained rise (which would be a measurement error) and no
unexplained drop (which would be a regression). Against 46-06's `4687 / 32`, the suite has grown
**+477** across two phases.

Per-file counts today, from `--reporter=json` `assertionResults[]` (never a line scan — 47-14's
population table was wrong in three places for exactly that reason):

```
  280  src/lib/__tests__/audit-policy.test.ts          NEW (47-09 + 47-10)
   75  src/lib/__tests__/suite-hook-hygiene.test.ts    NEW (47-03 + 47-14)
   46  src/lib/__tests__/suite-timing-hygiene.test.ts  NEW (47-05)
   91  src/lib/execution/condition-evaluator.test.ts   70 -> 91  (47-04)
   26  src/lib/mutations/__tests__/db-test-isolation.test.ts  23 -> 26  (47-11)
   70  src/lib/formula-engine.test.ts                  unchanged count, 2 assertions removed (47-05)
    9  src/components/.../client-formula-bounds.test.ts unchanged count, 1 assertion removed (47-05)
   37  engine.test.ts   37  execution-processor.test.ts   38  failure-alert.test.ts
   19  route.test.ts     5  replay-carries-dry-run.test.ts  24  log.test.ts
   16  formula-recalc-batch.test.ts  13  recursion.test.ts   5  toggle.test.ts
                                                     (the last 10: hoisted by 47-14, Δ 0 tests)
```

---

# PART 3 — THE FIVE ROADMAP SUCCESS CRITERIA, ONE VERDICT EACH

| SC | Verdict | Named evidence |
|---|---|---|
| **SC-1** (AMENDED — margin under >=3x load, per assertion) | **PROVED** | 47-06's margin table + 47-14's re-measurement on the same committed instrument (`measure/extract-margins.mjs`) |
| **SC-1b** (no elapsed-time delta or ratio anywhere) | **PROVED** | `suite-timing-hygiene.test.ts`'s empty hit list, re-run and re-measured here |
| **SC-2** (reintroduce a backtracking parser, watch it go red) | **PROVED** | Controls A and B — A **re-falsified in this plan** |
| **SC-3** (a recorded disposition per critical/high advisory) | **PROVED** | 47-09's disposition table, 39 of 39, two-way set difference empty; re-run green here |
| **SC-4** (CI states a policy and that policy can fail) | **PARTIALLY PROVED** | 47-12's local half + fresh red 3 here. **The runner half is NOT PROVED.** |

## SC-1 — PROVED, with the caveats stated rather than smoothed

**The evidence is margin under induced load. The ten-run pass-set diff is NOT presented as evidence
for anything** — the original criterion ("ten consecutive runs produce the same pass set") measured
**16/16 identical, 4739 / 32, zero failures, on the UNFIXED tree** and was replaced for that reason.
It is retained only as a cheap regression guard, and 47-06 supplied the sharpest possible
demonstration of why: it was **10/10 IDENTICAL on the very tree that went RED at 3x**.

The measured pairs, same instrument on both sides:

| assertion | budget | BEFORE, at a measured >=3x | AFTER, same instrument | margin |
|---|---|---|---|---|
| `toggle.test.ts` `beforeEach` | hookTimeout 10 000 ms | **4958 ms = 49.6%** | **74.7 ms = 0.7%** | 2.02x → **133.84x** |
| `recursion.test.ts` `beforeEach` | hookTimeout 10 000 ms | **3530 ms = 35.3%** | **37.2 ms = 0.4%** | 2.83x → **268.94x** |
| `route.test.ts:67` (health, empty registry) | testTimeout 5 000 ms | **9339 ms = 186.8%** | **116.97 ms = 2.3%** | 0.54x → **42.74x** |
| `replay-carries-dry-run.test.ts:97` | testTimeout 5 000 ms | **5934 ms = 118.7%** | **22.32 ms = 0.4%** | 0.84x → **223.99x** |
| `engine.test.ts:215` | testTimeout 5 000 ms | **5782 ms = 115.6%** | **73.27 ms = 1.5%** | 0.86x → **68.24x** |
| assertions over an elapsed-time expression, suite-wide | — | **3 live** | **0**, hit list `[]` | category change |
| the linearity ratio | 80 | **11.44-55.85, a 4.88x spread** | **the assertion no longer exists**; its counted replacement gives **ONE distinct integer, 23 730, across 400 repeats** | category change |

**The phase's strongest single result, and it is a pair.** 47-06 measured **3 of 6** loaded base runs
**RED** — four distinct timed-out assertions, none of them the two the phase had fixed, all in a
population its gate did not cover (test bodies, billed against *half* the hook budget). 47-14 closed
that population — 106 sites in 7 files hoisted, the gate's corpus extended from hooks to bodies and
helpers — and measured **6 of 6 GREEN** at a sampled runnable median of **3.50x**, with all 18
observations of the three named assertions below **2.3%** of budget. **The suite no longer cries
wolf.** That is what QG-01 asks for, stated as a before/after on the same instrument.

**Caveats, stated:**

1. **No BEFORE timeout was observed to stop happening.** 47-02 got zero timeouts in 16 runs on the
   unfixed tree, so there was never a reproducible red for the fix to eliminate. The claim is about
   **margin** (49.6% → 0.7%) and about **category** (a drifting ratio → a fixed integer), never about
   a red turning green. The Phase 44/45 failures remain historical reports, not reproductions.
2. **~7x WAS reached — correcting the limitation the plan predicted.** 47-13's own plan expected this
   SUMMARY to say ~7x was unreproducible on this machine. It is not true and restating it would be
   false: 47-06 sampled runnable **peaks of 9.00x (run A) and 7.75x (run B)**, and real timeouts
   occurred at that level while `toggle` sat at 0.7%. **But 47-14's post-fix batches peaked at
   6.25x, not 9.00x.** So the strongest load condition has not been re-run *after* the test-body fix.
   The 6/6 GREEN is at median 3.50x / peak 6.25x, and it should be cited that way.
3. **n = 6 loaded base runs**, 3 per batch. Adequate for a two-orders-of-magnitude effect; not
   adequate for anything subtle.
4. **The load was not held constant within a run** (2.50x-6.25x in 47-14, 2.50x-9.00x in 47-06), so
   min/median/max mix load levels. That inflates the *max* column — the conservative direction — which
   is why every figure is published beside its sampled distribution and sample count.
5. **The multiplier is `/proc/loadavg` field 4 (runnable) / cores, sampled every 10 s** — not
   `spinners / availableParallelism`, which reads 2.00x and is the wrong number because vitest brings
   its own workers. Corroborated independently by wall-time inflation (52.4-58.6 s idle → 171-178 s
   loaded ≈ 3.0-3.4x).

## SC-1b — PROVED

The gate's hit list is empty, and I re-ran it in isolation rather than quoting it:

```
$ ./node_modules/.bin/vitest run src/lib/__tests__/suite-timing-hygiene.test.ts \
    -t "finds no elapsed-time assertion anywhere in the corpus"
 Test Files  1 passed (1)
      Tests  1 passed | 45 skipped (46)
```

Corpus counts, computed with `node -e` over an independent walk of `src/` (never `grep | wc -l`):

```
test corpus files:                              178
performance.now( in TEST corpus:                  5   ALL in suite-timing-hygiene.test.ts (string fixtures)
Date.now(  in TEST corpus:                       66   (the floor is 25 — the matcher still has work to do)
performance.now( in NON-TEST src:                 2   src/app/api/health/route.ts (Phase 42, out of scope)
```

And the three assertions that were live at the phase's start are gone from all three files:

```
src/lib/execution/condition-evaluator.test.ts        {"performance.now":0,"Date.now":0,"toBeLessThan(80)":0}
src/lib/formula-engine.test.ts                       {"performance.now":0,"Date.now":0,"toBeLessThan(80)":0}
src/components/.../client-formula-bounds.test.ts     {"performance.now":0,"Date.now":0,"toBeLessThan(80)":0}
```

`performance.now(` is **0** in the test corpus once the gate's own string fixtures are excluded — and
**2 in non-test source**, which is 47-04's correction to `47-RESEARCH §4`, `47-PATTERNS.md:544-548`
and `47-VALIDATION.md:86-88`, all three of which claimed the repository would reach zero.

## SC-2 — PROVED

Controls A and B. Control A **re-falsified in this session** (§ fresh red 1), control B accepted on
47-04's record.

**Stated explicitly, as the criterion's own note requires: THE CEILING ALONE WOULD HAVE PASSED
CONTROL A.** I measured this myself with the regex parser installed —
`Tests 1 passed | 90 skipped (91)` for `-t "CEILING"`, while the FLOOR read `0 counted characters
over 62073 input characters`. A regex backtracker reads **zero** counted characters at every input
size, so `0 <= 6 × 62073` is trivially satisfied while the parse burns unbounded time inside one
native `exec`. The **floor** turns "no work observed" from a pass into a failure; the **AST half**
names the reason. And control B is the mirror: a restart-on-failure parser has no regex, calls no
forbidden scanner, still delegates, still clears both AST body-node floors — **the whole AST half
passed it** — and only the ceiling caught it, at `153.121` against `6`.

Two further pieces of evidence worth keeping: under control A the **T-34-21 prototype-key describe**
and the **entire bracket-notation describe** also went red, which means those pre-existing assertions
are live and falsifiable rather than decorative — useful to know about assertions this phase
contracted not to touch. And 47-04's standalone growth table shows the correct parser holding
**1.55 → 1.52 ops/char across a 16x span** while control B goes **30.22 → 127.31**, with control B
**219x slower in wall-clock at n=1600** — a separation the deleted elapsed assertion would still have
had to distinguish from scheduler noise. The counted column does not.

**Note on SC-2's wording:** the criterion says "reintroduce a backtracking `resolveFieldPath`". 47-01
established through git archaeology that **no backtracking implementation ever existed** — both prior
versions are `split(".")`. So SC-2 was discharged by *writing* two, not restoring one. That is a
substituted mechanism at the level of provenance only; the assertion tested is exactly the one the
criterion names.

## SC-3 — PROVED

**Every critical and high advisory carries exactly one recorded disposition, re-measured at execution
time.** Re-measured *again* here, and the numbers are unmoved:

```
-> parsed 47 distinct advisories across 14 vulnerable package(s); npm audited 1285 dependencies
-> applying audit-policy.json: failOn ["critical","high"], 39 allowlist entries
OK: 47 advisories evaluated across 14 vulnerable packages (39 at critical/high),
    39 of 39 allowlist entries applied, 1285 dependencies audited.
```

- The plan's inherited `4 critical / 22 high / 1289 deps` figure is the **pre-47-01** number and is
  context, not the requirement. Today: `{"low":3,"moderate":7,"high":4,"critical":0,"total":14}`,
  **zero criticals**, 4 vulnerable packages at critical/high (`next`, `nodemailer`, `postcss`,
  `sharp`).
- **Upgraded: 22 packages**, including `vitest` 4.1.11 (clearing `GHSA-5xrq-8626-4rwp`, **CVSS 9.8**),
  the Auth.js trio (**all three criticals**), `drizzle-orm` 0.45.2 (SQL identifier injection), and
  `vite` 7.3.6 (five advisories).
- **Replaced: 1** — `fast-xml-parser` removed from the lockfile entirely and confirmed absent from the
  running container.
- **Accepted with a reason and an expiry: 39 advisories across 4 packages.** Each reason clears an
  80-character floor and each entry carries an expiry (`next`/`postcss`/`sharp` 2026-09-24,
  `nodemailer` 2026-11-23). Reach is recorded per entry (`postcss` × 4 = **build**, the rest runtime),
  which is the CONTEXT rule that a bare "dev-only" is not a reason.
- **Coverage is 1:1, computed as a two-way set difference rather than by counting:**
  `gated but NOT listed: []`, `listed but NOT gated: []`.
- **The granularity decision is stated and defensible.** `npm audit` reports a package-level and a
  per-advisory severity, and they differ. Filtering on per-advisory severity would need 16
  dispositions and would leave 5 of `nodemailer`'s 6 and 16 of `next`'s 28 with **no recorded
  disposition at all while the gate stayed green** — the exact failure this phase exists to delete.
  The policy uses the **package** severity, matching `npm audit --audit-level=high`, hence 39.
- **The count is context; the decision is the requirement.** Stated as the criterion demands.

## SC-4 — PARTIALLY PROVED. The runner half is NOT PROVED.

| Claim | Status | Evidence |
|---|---|---|
| The audit policy exists, is stated in prose, and is machine-enforced | **PROVED** | `AUDIT-POLICY.md` at repo root, `audit-policy.json`, `scripts/audit-policy.mjs` — **zero new dependencies** (`audit-ci` depends on `event-stream@4.0.1`, the 2018 backdoor package; `better-npm-audit` is 23 months stale) |
| The policy cannot be silently narrowed to reach green | **PROVED** | 47-10: `failOn` asserted by array equality with `toContain` **forbidden** by its own anchor test; `FORBIDDEN_REASONS` asserted by value; expiries asserted against an injected clock |
| The policy runs as a step on the job whose name is the required check-run | **PROVED AS FILE CONTENT** | 47-11: `Security audit policy` and `Registry signature verification` are steps 8 and 9 of the job `name: ci`, with `MIN_CI_STEPS` raised 6 → 8 **in the same commit**, and five falsifications |
| The policy **can fail**, for the right reason, not vacuously | **PROVED — LOCALLY, TWICE, BY TWO DIFFERENT MECHANISMS** | 47-12 broke the *tree*: `npm i -D minimist@1.2.5` → `FATAL: minimist critical GHSA-xvch-5gv4-984h has NO recorded disposition`, exit 0 → **1** → 0. This plan broke the *policy*: a shipped `reason` → `"dev-only"` → `FATAL: audit-policy.json allowlist[0] (GHSA-ggv3-7p47-pfv8) gives "dev-only" as its reason`, exit 0 → **1** → 0 |
| The policy fails **on GitHub's runner** | **NOT PROVED** | `origin/master` is `a58b9e1` (*chore: archive v1.3 phase directories*, **pre-Phase-46**). Measured now: `git rev-list --count origin/master..HEAD` = **114** |
| A failing policy **blocks a merge** (`mergeStateStatus: BLOCKED`) | **NOT PROVED** | No branch, no PR, no GitHub object of any kind was created by any plan in this phase |
| Phase 46 GAP 1 (`Migration chain check` has never run on GitHub) | **STILL OPEN** | Same root cause: the commits are unpushed |

**Say it this way and no other way:** the audit policy has been observed failing *for the right reason
on this machine*, twice, by two independent mechanisms. It has **never** been observed failing — or
passing — on GitHub's own runner, and it has **never** blocked a merge. The `Security audit policy`
step, the `Registry signature verification` step and Phase 46's `Migration chain check` step all exist
only as text in a file GitHub has never executed.

47-CONTEXT § "CI audit policy (SC-4)" is the standard being applied: *"a policy whose gate has never
been observed failing is a stated intention, not a policy."* Half of that clause is discharged. The
half that says *"verified against the real runner, not locally"* (`47-VALIDATION` control E) is not.

Pushing is an outward-facing action the operator has not authorised. 46-06 set the standard —
**record the gap rather than manufacture a green run** — and this plan follows it. The full
four-part reproduction, including the non-optional Part A green baseline, is in
`deferred-items.md` § **D-47-12-A**.

---

# PART 4 — REQUIREMENT VERDICTS

## QG-01 — SATISFIED

> *No test asserts on wall-clock time in a way that fails under parallel workers.*

Carried by **SC-1 (PROVED)**, **SC-1b (PROVED)** and **SC-2 (PROVED)**. `999.28` and `D-45-01` were
treated as one item with one shared proof, as Phase 45 instructed. The suite contains **zero**
assertions over an elapsed-time delta or ratio, enforced by an AST + taint-propagation gate with a
fixpoint (proven necessary: a single-pass scanner reports 0 on a file that provably contains a live
elapsed ratio). QG-01's checkbox is already `[x]` in `REQUIREMENTS.md`.

**Explicitly NOT closed on any forbidden mechanism:** no `retries: 1`, no raised `hookTimeout` or
`testTimeout`, no serial-only marking, no path exclusion, no threshold raised. Every one of those was
rejected in 47-CONTEXT and none was used.

## SEC-05 — PARTIAL. The box stays `[ ]`.

> *The committed lockfile's advisories are triaged, and CI has a stated audit policy.*

| Half | Verdict |
|---|---|
| "the advisories are triaged" | **DISCHARGED** — SC-3 PROVED, 39/39 |
| "CI has a stated audit policy **that can fail**" | **PARTIAL** — proven locally twice, never on the required check |

**`requirements mark-complete SEC-05` was NOT invoked by this plan, and the checkbox was verified
still `[ ]` after the state updates.** 47-07, 47-09 and 47-12 each had to revert an auto-tick of this
box; this plan did not create a fourth occasion for it. The traceability table row stays
`SEC-05 | Phase 47 | In Progress`.

The single thing standing between SEC-05 and complete is **D-47-12-A**: push, observe the required
check green against a recorded `headSha`, assert all three new step names are present, then add
`minimist@1.2.5` on a throwaway branch, observe the required check red with
`mergeStateStatus: BLOCKED`, revert, observe green, close the PR **unmerged**.

---

# PART 5 — WHAT THIS PHASE DOES NOT PROVE

Named so that nobody has to infer them, in the 46-06 style.

1. **The audit policy is evaluated against `package-lock.json`, NOT the production image.**
   `Dockerfile:24` uses `npm install --legacy-peer-deps`, which is not lockfile-exact by contract.
   Measured 2026-08-25, it produces a **strict 41-package subset** of the lockfile tree at identical
   versions, none of the 41 carrying a critical or high advisory; the runtime image narrows that again
   to Next's standalone trace. So the gate is a **conservative over-approximation** of the image's
   advisory surface — it can report an advisory in a package the image does not ship, and it cannot by
   itself prove which version the image resolved. `AUDIT-POLICY.md` § "What tree this policy
   evaluates" states this in a three-row table. The `npm ci --legacy-peer-deps` conversion is
   deferred (from Phase 46) and out of this phase's scope. **Do not read a green
   `npm run security:audit` as a statement about production.** The way to know what the image ships
   is to ask the running container, as 47-08 did.

2. **The margin condition that could not be re-run post-fix: >6.25x.** 47-06 sampled runnable peaks of
   **9.00x / 7.75x** and observed real timeouts there. 47-14's post-fix batches peaked at **6.25x**
   (median 3.50x). So *"6/6 GREEN under load"* is a claim about median 3.50x / peak 6.25x, not about
   9x. The margin figures at 6.25x are two orders of magnitude clear of budget, which is strong
   evidence but is not the same as a re-run at the harshest observed load.

3. **No control was judged NOT DELIVERED — except control E's runner half.** Eight of nine controls
   are DELIVERED with verbatim output. Control E is DELIVERED locally and **NOT DELIVERED** on the
   real runner. That is the phase's one unfilled cell, and it is not a gate that *cannot* fail — it is
   a gate that has never been *asked* to fail in the venue that matters.

4. **The out-of-scope `auth.setup.ts` Playwright flake** (30.1 s cold vs 1.9 s on retry) is a **second,
   independent** flake source. `npm test` never invokes Playwright (`npm run test:e2e` does), so it
   cannot explain any anomaly in any report in this phase, and it is explicitly **not v1.4 scope**.
   It must not be mistaken for QG-01, and its existence does not weaken any criterion here.

5. **`src/lib/email/client.ts:20` sets `tls: { rejectUnauthorized: false }` unconditionally** — see
   the carry-forward register below. Recorded in `BACKLOG.md` by 47-09 and deliberately **not fixed
   here**.

6. **The ten-run pass-set diff proves nothing about SC-1** and is not offered as if it did. It was
   `16/16 IDENTICAL` on the unfixed tree, and `10/10 IDENTICAL` on the very tree that went RED at 3x.
   It is retained as a regression guard whose own floors (`MIN_ITERATIONS`,
   `MIN_REFERENCE_PASS_SET = 4000`) have been observed firing.

7. **The stage-change write path was never exercised through a real pointer gesture** — see
   D-47-08-B below. `drizzle-orm@0.45.2`'s write path is suite-covered, not gesture-covered.

8. **`npm audit signatures` was not run in this plan.** 47-11 measured it (and corrected its own
   `1104/1104` figure) and wired it as CI step 9; it needs network and ~102 s, and confirming a
   command 47-11 already recorded is not what a sign-off adds. It has, like every other CI step here,
   never run on GitHub.

---

# PART 6 — THE PHASE'S CORRECTIONS TO ITS OWN PLANNING DOCUMENTS

**This is the phase's second-most-valuable output after the fixes.** A milestone about not trusting
unverified assertions should record where its own assertions were wrong.

| # | The document's claim | What was measured | Correcting plan |
|---|---|---|---|
| 1 | `47-RESEARCH §5` row 6: *"`vite` high → stays on 7.x; no need for vite 8"* | **Every `vitest@4.1.x` widens `vite` to `^6 \|\| ^7 \|\| ^8`** — verified against the registry for 4.1.0, 4.1.2, 4.1.4, 4.1.6, 4.1.8, 4.1.9, 4.1.10, 4.1.11, i.e. including 4.1.0, the *minimum* version that fixes the CVSS 9.8. **No vitest at the required floor avoids vite 8.** npm nests `vite@8.2.2`, dragging in 32 new lockfile keys. Fixed with `overrides: { "vite": "^7.0.0" }`, 3 lines, zero new deps | **47-01** |
| 2 | The same research attributed `rolldown` + `lightningcss` to `npm audit fix`, making them an independent signature of an untargeted install | **The causality runs the other way.** `vite@8.2.2` declares `rolldown` and `lightningcss` as direct dependencies, so they are in substantial part just what pulling vite 8 does. A future plan seeing them must check the resolved `vite` major **first** | **47-01** |
| 3 | `toggle.test.ts:61`'s `beforeEach` cost is DB I/O / fake timers / a sleep / a poll interval | **It is module import cost.** 521 ms of 778 ms (67%) is `drizzle-orm/pg-core` alone, reached through a deliberately unmocked schema module. `vi.mock` hoists above imports, so a static top-level import is semantically identical and drops the first test **1365.99 ms → 3.87 ms** | 47-CONTEXT (amended by research), applied by **47-03** |
| 4 | `toggle.test.ts:61` times out in 2 of 5 runs | **0 of 16 today**, at up to 3x. The failure does not reproduce on the current tree; only the margin moves. This is precisely why SC-1 had to be re-based on margin | 47-CONTEXT amendment |
| 5 | SC-2: *"reintroduce a backtracking `resolveFieldPath`"* | **No backtracking implementation ever existed.** Both prior git versions are `split(".")`. SC-2 means *write* one, not restore one | 47-CONTEXT amendment |
| 6 | A ceiling on operation count is sufficient to catch backtracking | **A regex backtracker reports ZERO ops** — catastrophic backtracking is invisible to any JS-level counter, so a ceiling-only gate passes the worst case. Hence a FLOOR **and** a TypeScript-AST structural half. Re-confirmed in this plan | research → **47-04** |
| 7 | `47-RESEARCH §4`, `47-PATTERNS.md:544-548`, `47-VALIDATION.md:86-88`: deleting `condition-evaluator.test.ts:613-637` removes *the repository's only two `performance.now()` call sites* | It removes the only two in any **test** file. **2 remain in non-test source** (`src/app/api/health/route.ts:111`, `:121`, from Phase 42 `2710f73`). A floor scoped to `src/**` therefore needs `>= 2` and an exemption for the health route — which is what shipped. Independently re-measured in this plan: **2** | **47-04** |
| 8 | `47-RESEARCH`'s v1 elapsed-assertion scanner design (clock calls appearing inline inside `expect(...)`) | **A single pass reports 0 on a file that provably contains a live elapsed ratio.** Measured as an ablation on the live red. A taint fixpoint is required, and its necessity is now a permanent in-file test | **47-05** |
| 9 | ROADMAP SC-1: *"ten consecutive full-suite runs produce the same pass set"* | **16/16 identical on the UNFIXED tree, 4739 / 32, zero failures.** Green before any work; it discriminates nothing. Amended to a MARGIN criterion before execution began — this phase's own eighth-vacuous-gate near-miss, caught at research time | research → ROADMAP amendment |
| 10 | 47-13's own plan required this SUMMARY to state that ~7x load was not reproducible | **It was reproduced** — sampled runnable peaks 9.00x and 7.75x, with real timeouts at that level. Restating the plan's prediction would have been false | **47-06** |
| 11 | 47-06's plan expected the AFTER measurement to close the defect class | **It did not.** 3 of 6 loaded runs RED, from a population the gate did not cover. Recorded as `D-47-06-A`, the highest-severity item in the file, and closed by a **14th plan added to the phase** | **47-06** → **47-14** |
| 12 | 47-14's plan's own population table (112 hoistable / 9 files; `no-mutation-coupling.test.ts` 2 sites; `log.test.ts` 2 sites; `formula-recalc-batch.test.ts` at `:28`) | **Wrong in three places, because it came from a line scan.** AST truth: **106 hoistable / 7 files**; `no-mutation-coupling.test.ts` **0 real sites** (`:126` is prose, `:556` is a string literal in that gate's own fixture table); `log.test.ts` **1** (`:36` is prose in the header); `formula-recalc-batch.test.ts`'s real site is at `:283`, because `:28` is `typeof import(...)`, an `ImportTypeNode` erased at runtime | **47-14** |
| 13 | 47-08's plan expected `next@16.3.2` to land | **Blocked by a platform-blind gate**, not by the framework. `next@16.3.2` → `sharp` 0.35.3 → `@img/sharp-win32-ia32@0.35.3` declares `engines.node "^20.9.0"`, which Node 24.12.0 fails. The entry is `os: ["win32"], cpu: ["ia32"], optional: true` — a binary npm will never install here. **The gate's scope is what is wrong.** Reverted, split recommended (D-47-08-A) | **47-08** |
| 14 | 47-07's plan's reach classifications | **Two were FALSIFIED** by the `--omit=dev` reconciliation, and corrected | **47-07** |
| 15 | 47-08 orchestrator's own report of a "frozen renderer" on `/deals` and `/admin/audit`, called a live PERF-01 symptom | **False, and self-corrected.** `get_page_text` returned full content from pages whose `Page.captureScreenshot` had timed out — the pages were alive and the screenshot transport is what failed. One flaky screenshot is not a reproduction | orchestrator, in `deferred-items.md` |

**Also worth recording as environment corrections, all measured in this phase and all working around
`rtk`:** `grep … | wc -l` returns a WRONG count (36 → 19; 47-10 caught it silently under-reporting by
15 lines); `git log | wc -l` reported 50 where `git rev-list --count` reported 100;
`grep -n "export"` returned "0 matches" on a file with 15 export lines; **`git status --porcelain`
renders as the token `ok` rather than as empty output** — reproduced again in this session, which is
why every cleanliness claim here rests on `git diff --exit-code`. `npx <tool>` is rewritten into a
nonexistent npm script (use `./node_modules/.bin/<bin>`), and `npm run` reorders a child's
stdout/stderr. Every count in this document was computed with `node -e` or a native `--count`.

---

# PART 7 — OPEN ITEMS CARRIED FORWARD

## Closed by this phase

| Item | Closed by | How |
|---|---|---|
| **D-47-01-A** — `overrides.vite` had no in-repo gate | **47-09** | `audit-policy.test.ts:1320-1360` asserts `package.json` still declares `overrides.vite` and that the range admits nothing `>= 8`. Verified present in this session; `overrides` reads `{"vite":"^7.0.0"}` and `vite` resolves 7.3.6. Falsified two ways by 47-09 (RED-4 delete, RED-4b widen to `^8.0.0`) |
| **D-47-06-A** — the import-cost defect live in ~146 test bodies, against half the budget | **47-14** | 106 sites in 7 files hoisted to module-scope statics (`vi.hoisted` needed in three), the gate's corpus extended from hooks to bodies **and helpers**, four carve-outs added with reasons, and **3/6 RED → 6/6 GREEN** re-measured on the same instrument |
| **D-47-01-C** — `@auth/core` ↔ `nodemailer` peer mismatch | 47-07 | `next-auth` → `5.0.0-beta.32` removed the nested `@auth/core@0.41.0`. Zero peer warnings on `npm ci`. **Consequence:** bumping `nodemailer` to 9.x would re-open it, which is a freshly measured argument *for* accept-with-reason |

`deferred-items.md` still carries D-47-01-A under *"From 47-07: STILL OPEN"* and D-47-06-A without a
closure marker; both are in fact closed, and the closures are recorded in `47-09-SUMMARY.md`
§ "D-47-01-A: CLOSED" and throughout `47-14-SUMMARY.md`. Whoever verifies this phase should reconcile
those two headings rather than re-opening the work.

## Open, with owners

| ID | What | Owner | State |
|---|---|---|---|
| **D-47-12-A** | **Control E on the real runner.** `origin/master` = `a58b9e1` (pre-Phase-46), **114 commits unpushed** (measured with `git rev-list --count`, not `wc -l`). The `Security audit policy`, `Registry signature verification` and Phase 46's `Migration chain check` steps have **never executed on GitHub**. Also Phase 46's GAP 1 | **the operator** — pushing is an outward-facing action not authorised to any agent | **OPEN. The only thing standing between SEC-05 and complete.** Four-part reproduction in `deferred-items.md`; **Part A (the green baseline against a recorded `headSha`) is not optional** — without it a red might only show the check was already red, from the Postgres service container, from `drizzle-kit` not being invocable after `npm ci`, or from a hosted runner failing to reach the registry's advisory endpoint. None of those has ever run on GitHub |
| **D-47-08-A** | **The `sharp` / `win32-ia32` platform-blind `engines` gate blocks `next` 16.3.2.** `node-engines-floor.test.ts` walks every `engines.node` range in the lockfile **regardless of `os`/`cpu`**, so a Windows 32-bit optional binary's correct `^20.9.0` cap reads as a violation on linux/x64. **Structural, not incidental:** every `sharp` 0.35.x caps that binary, and `sharp >= 0.35.0` is required to clear the advisory — no version both fixes it and keeps an uncapped range | a Phase 47 follow-up or Phase 48+ | **OPEN, and DE-RISKED.** A platform-aware filter takes violations to **0 on both trees** while **NC-3 still fires**, so the fix does not create a new vacuity. **Cost of leaving it:** the bump clears `[next, postcss, sharp]` from the crit+high set with **nothing joining at any severity** (`high 4 → 1`, leaving only `nodemailer`), including **28 GHSAs on `next`** — among them GHSA-c4j6-fc7j-m34r (CVSS 8.6, SSRF via WebSocket upgrades) and GHSA-492v-c6pp-mqqv (CVSS 8.1, middleware bypass via dynamic route parameter injection) |
| **D-47-08-B** | **The stage-change write path is suite-covered but not gesture-covered.** The orchestrator verified, in a real browser against image `8f07a18e`: a live authenticated session, `/deals` rendering real pipeline data, `/organizations` against the ~46k-org table, `/admin/audit` with 214 entries and authorization unchanged, and a **clean console** (only MetaMask extension noise). But `left_click_drag` did **not** start the drag — `deals.position` stayed 5000 and `updated_at` stayed `2026-08-08 19:48:13.615` — because `@dnd-kit`'s `PointerSensor` activation constraint correctly refuses a synthetic move-and-release (47-08 predicted exactly this), and the card chevron opened no stage menu | anyone with a mouse | **OPEN, ten seconds of work.** Drag a card between columns on `/deals`, reload, confirm it stayed. Side-effect check already done: 0 active workflows; the single outbound webhook subscribes only to `deal.deleted` and `person.created`, so a stage move fires nothing external |
| **SEC-47-A** | **`src/lib/email/client.ts:20` sets `tls: { rejectUnauthorized: false }` unconditionally** — not gated on `NODE_ENV`, not on the SMTP host, not on a flag — on the one and only transport this application ever builds (`createTransport` at `:36`, the sole call site). Every outbound message, including password-reset and invite mail, is delivered over a TLS session whose server certificate is never validated. Any party between the app and `SMTP_HOST` can present an arbitrary certificate, read the message, and where `SMTP_USER`/`SMTP_PASSWORD` are set, harvest the SMTP credentials on the first `AUTH` exchange | a security phase; recorded in `BACKLOG.md` § "Found in Phase 47" | **OPEN. Verified present at line 20 in this session.** **This is a larger exposure than any advisory formally accepted in this phase** — `AUDIT-POLICY.md` accepts `GHSA-r7g4-qg5f-qqm2` (*Improper TLS Certificate Validation in OAuth2 Token Fetch*, CVSS 6.5) precisely on the measured grounds that this project never uses OAuth2, while this line disables certificate validation for the transport it *does* use. Not fixed here because Phase 47's scope is the advisory position, and the fix needs its own verification: local Mailhog presents a self-signed certificate, so flipping the flag naively breaks the documented local workflow. The fix is an env-gated `rejectUnauthorized` defaulting to **true** |
| **D-47-01-B** | `esbuild`'s surviving moderate is unfixable in range — its parents `@esbuild-kit/core-utils` and `@esbuild-kit/esm-loader` are **deprecated and unmaintained**, and their only parent is `drizzle-kit@^0.31.9` | noted in `AUDIT-POLICY.md` as a known below-floor item | **OPEN, below the `failOn` floor.** Context, not a gate failure |
| **`Dockerfile:24`** | `npm install --legacy-peer-deps` → `npm ci --legacy-peer-deps`. It weakens every lockfile-derived guarantee including this phase's audit gate, and collapsing the two trees would make § "What tree this policy evaluates" unnecessary | deferred from Phase 46, explicitly out of Phase 47 by 47-CONTEXT § Deferred Ideas | **OPEN** |
| **`auth.setup.ts` cold flake** | 30.1 s vs 1.9 s on retry. A second, independent flake source in Playwright | not v1.4 scope | **OPEN, and explicitly not QG-01** |
| **PERF-01 observation** | `get_page_text` on `/deals` returned **51,936 bytes / 2,523 lines with 832 card price markers** against ~8 cards in the viewport, while `/api/health` answered 200 in 5.5 ms and the pipeline holds 3,754 deals. Consistent with the board materialising far more of the column than it displays; the server is not the bottleneck | **Phase 51** | A measurement, not a conclusion. Phase 51 owns the real one |

---

## Deviations from Plan

None. `files_modified` is empty and stayed empty; no assertion was weakened, deleted or tidied; the
three temporary control patches were each reverted and verified with `git diff --exit-code`.

Two things exceed the plan rather than deviating from it, and both are in the direction the plan
argues for:

1. **Three controls were re-falsified where the plan asked for one** (A, C-hook, D), covering all
   three gate mechanisms rather than one.
2. **A second, independent local demonstration that the audit gate can fail** was produced by a
   different mechanism from 47-12's (breaking the *policy* rather than the *tree*), which strengthens
   the "can fail" half of SC-4 without touching the runner half.

One judgement call worth recording: the plan's `<interfaces>` says NC-C's timing half covers
*"a BOUND-VARIABLE ratio"* and asks whether the phase's evidence covers *"the one a single-pass
scanner cannot see"*. It does, and better than asked — 47-05 measured a **v1 ablation on the live
red** rather than arguing the point from a fixture, and made that ablation a permanent in-file test
with a `needsFixpoint: true` marker on the fixture so the control cannot silently start testing a
different one.

## Known Stubs

None. This plan created no code.

## Threat Flags

None. This plan added no network endpoint, no auth path, no file access pattern and no schema change.
Only test names, counts, exit codes, package names, GHSA ids, image ids and commit hashes were
recorded. No `.env` value, no secret, no connection string, no password appears in any command run or
in this document.

`T-47-13-04` (*a green sign-off reached by weakening something*) is discharged by construction:
`files_modified` is empty and `git diff --exit-code` returns 0, so the sign-off cannot have moved a
goalpost. `T-47-13-SC` is discharged: **this plan installed nothing.**

## Success Criteria

- [x] All nine controls judged with the decisive line quoted and a DELIVERED / NOT DELIVERED verdict
- [x] The rename (WR-11) question answered per gate, from source, rather than assumed
- [x] The self-collision mitigation confirmed to be exactly ONE per gate file, with its live control
- [x] The automated re-run green, recorded as an independent re-measurement (518 passed)
- [x] **Three** controls from A-E re-falsified in this plan with fresh reds recorded, where one was asked
- [x] Every ROADMAP criterion has a one-line verdict backed by named evidence, with caveats stated
- [x] The phase gate recorded green with literal numbers, the suite count reconciled to an exact match
- [x] A "what this phase does NOT prove" section naming every known gap
- [x] QG-01 and SEC-05 verdicts stated; SEC-05 left PARTIAL and not auto-ticked
- [x] All open items carried forward with owners, including SEC-47-A
- [x] Nothing weakened, skipped or tidied; the repo is clean and the compose stack is UP

## Verdict on Phase 47

**Both requirements' technical work is complete; one requirement's *venue* is not.**

QG-01 is satisfied. The two assertions that started this phase went from 49.6% and 35.3% of budget to
0.7% and 0.4%; the linearity ratio became one integer across 400 repeats; three elapsed-time
assertions became zero, enforced by a gate whose fixpoint is proven necessary; and a defect class the
phase discovered *inside itself* — 3 of 6 loaded runs red from a population its own gate did not
cover — was found, recorded honestly as the highest-severity item in the file, given a 14th plan, and
closed at 6/6 green.

SEC-05's triage half is complete and its policy half is enforced, stated in prose, gated on the
required job, and observed failing twice for the right reason — on this machine. It has never run on
GitHub. That is one `git push` and one throwaway PR away, and it is the operator's call.

**And the thing this phase was really built to test:** it was told to assume it would ship an eighth
vacuous gate. It did not. But it did find that its **own SC-1 was one** (16/16 green before any work,
caught at research time and amended), that a **ceiling-only ops gate would have shipped green over
the worse of two vulnerable parsers**, that a **single-pass elapsed-assertion scanner reads 0 on a
live violation**, that a **path-excluded carve-out went stale while its sweep stayed green**, and
that **its own 14th plan's population table was wrong in three places because it came from a line
scan.** Five near-misses caught by deliberate falsification, and one floor
(`MIN_NON_TEST_PERFORMANCE_NOW = 2`) named as brittle rather than quietly softened. That is the
process working.

---

## Self-Check

Claims verified before this document was committed.

**Files:**

```
FOUND: .planning/phases/47-suite-trust-supply-chain/47-13-SUMMARY.md
FOUND: src/lib/__tests__/suite-hook-hygiene.test.ts        (75 tests, re-run green)
FOUND: src/lib/__tests__/suite-timing-hygiene.test.ts      (46 tests, re-run green)
FOUND: src/lib/__tests__/audit-policy.test.ts              (280 tests, re-run green)
FOUND: src/lib/execution/condition-evaluator.test.ts       (91 tests, re-run green)
FOUND: src/lib/mutations/__tests__/db-test-isolation.test.ts (26 tests, re-run green)
FOUND: scripts/audit-policy.mjs · audit-policy.json · AUDIT-POLICY.md
FOUND: scripts/diff-pass-sets.mjs · scripts/suite-repeatability.sh
FOUND: src/lib/email/client.ts:20  tls: { rejectUnauthorized: false }   (SEC-47-A, still present)
```

**Numbers:** every figure in Part 2 was produced in this session and is quoted from the command's own
output. Every figure in Part 3's BEFORE/AFTER table is quoted from `47-06-SUMMARY.md` or
`47-14-SUMMARY.md`, both of which name `measure/extract-margins.mjs` as the instrument on both sides.
The `+425` ledger sums to the measured 5164 exactly.

**Requirement boxes, re-read after the state updates:** `QG-01` is `[x]`; **`SEC-05` is `[ ]`**;
the traceability row reads `SEC-05 | Phase 47 | In Progress`.

**Working tree:** `git diff --exit-code` exit 0, `git diff --cached --exit-code` exit 0, no untracked
files outside `.planning/`. Compose stack UP, `/api/health` 200, 10/10 processors alive.

## Self-Check: PASSED
