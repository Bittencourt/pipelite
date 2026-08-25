---
phase: 47-suite-trust-supply-chain
plan: 10
subsystem: supply-chain
tags: [audit-policy, allowlist, negative-controls, anti-vacuity, offline-gate, cross-gate, SEC-05]

# Dependency graph
requires:
  - phase: 47-suite-trust-supply-chain
    plan: 09
    provides: "scripts/audit-policy.mjs's pure exported surface (evaluatePolicy with an injectable clock, FORBIDDEN_REASONS, MIN_REASON_LENGTH, GHSA_PATTERN, EXPIRES_PATTERN, REQUIRED_FAIL_ON, VALID_REACH, assertAuditDocument, collectAdvisories), audit-policy.json with 39 entries, AUDIT-POLICY.md at 27,542 chars, and src/lib/__tests__/audit-policy.test.ts already carrying 52 tests including NC-1/NC-2/NC-3"
  - phase: 47-suite-trust-supply-chain
    plan: 05
    provides: "suite-timing-hygiene.test.ts's SC-1b taint rule, holding `expect(new Date(entry.expires).getTime()).toBeGreaterThan(Date.now())` as KNOWN_NEGATIVE fixture (c) and asserting its own exclusion list is empty — the other half of this plan's cross-gate pairing"
provides:
  - "src/lib/__tests__/audit-policy.test.ts EXTENDED from 52 to 280 offline tests: every honesty property of the allowlist is now an assertion that runs on every commit"
  - "FORBIDDEN_REASONS asserted BY VALUE (sorted array equality) — the assertion 47-09's file did not have, and the one that makes removing `dev-only` as loud as deleting the check"
  - "the failOn equality anchor asserted FROM THIS FILE'S OWN SOURCE: no line may apply a containment matcher to it, with a positive floor so a rename cannot satisfy the negative vacuously"
  - "the gate's offline property asserted STRUCTURALLY: its import set is pinned by value, so adding node:child_process, node:net, undici or a fetch polyfill is red in vitest"
  - "NC-D: 47-VALIDATION row D's three breakages as one permanent payload table plus the fourth axis they were missing (a malformed ghsa through evaluatePolicy), with three complements and a floor on the table itself"
  - "prose/JSON drift closed in BOTH directions: reverse cross-reference with REMEDIATED_IN_DOC as a live control, reach and expiry parsed from the § headings and compared, and the ZERO-dev-reach claim asserted against the data"
  - "the SC-1b pairing verified from this side: 131 expect() calls and 2 Date.now calls parsed in this file, ZERO hits"
affects: [47-11, 47-12, 47-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "assert a gate's OWN properties from its own source text, with the searched tokens assembled at runtime (S1(e)) — this file scans itself for `failOn` beside a containment matcher, and it is a file full of both"
    - "prove an offline property STRUCTURALLY (an import set pinned by value) rather than TEXTUALLY: the header has to name `child_process` and `npm audit` to explain why the code does not, so a raw scan would fail on its own documentation or be reworded into uselessness"
    - "it.each over the shipped data, one block per AXIS: a for loop reports the first offender and the axis; it.each reports every offender by name, which on the day 33 entries share an expiry is the difference between one failure and thirty-three"
    - "an exclusion list from a cross-reference is a live control in three directions at once — still present in the source it exempts, still absent from the set it is exempt from, and still marked with the reason it was exempted"
    - "falsify a checker in BOTH directions (never-report and always-report) to prove a control block is real: 22 red on the first, 31 red on the second, and the two sets are not the same set"

key-files:
  created: []
  modified:
    - src/lib/__tests__/audit-policy.test.ts

key-decisions:
  - "EXTENDED 47-09's file rather than recreating it, and converted its five per-entry `for` loops into `it.each` blocks over the shipped allowlist. Every assertion and every failure message was preserved; the change is strictly stronger (all offenders reported, each named in the test name) and it is what the plan's action text asks for. Nothing was removed or relaxed"
  - "Asserted the offline property as an IMPORT SET BY VALUE instead of a text scan for `child_process` / `npm audit` / `.env`. The plan's acceptance criteria asked for a `node -e` text scan; a text scan of THIS file cannot work, because its header must name all three to explain their absence. The structural form is stronger and cannot be talked around; the text scan is reported below as a measurement with the three surviving `npm audit` occurrences shown to be string literals in the required-doc-token register"
  - "Kept the failOn/containment self-scan on RAW lines rather than comment-blind lines, and worded the header to avoid the collision (S6: reword the prose, never weaken the assertion). A comment that mentioned both would be a real signal, not a false positive"
  - "Used a line-level comment filter for the read-call-site scan, and PROVED it in both directions (keeps the read helper, drops doc-comment lines) rather than assuming it. A stripper that blanked everything would make the count 0 and `toBe(1)` would fail loudly; one that kept everything would make it 2 and be 'fixed' by relaxing the number"
  - "Did NOT duplicate 47-09's NC-1/NC-2/NC-3. NC-D is the single named table 47-VALIDATION row D asks for, its doc-comment says explicitly that it does not replace them, and its only genuinely new case is (d) the malformed ghsa — which was pattern-tested but had never been run through evaluatePolicy"
  - "Kept MIN_ADVISORIES_PARSED at 3 and did not touch any floor in scripts/audit-policy.mjs. 47-09's reasoning stands: the fully-remediated residual is 8, so a floor above 8 fatals on SUCCESS. Empty-document detection is carried by MIN_PACKAGES_AUDITED and the histogram reconciliation, both re-verified green here"
  - "Recorded the SC-1b cross-check with a throwaway harness that imported the gate's exported `scanSource` and scanned this file directly, then deleted it. 'The sweep is green with an empty exclusion list' is a valid inference but a weaker one; the direct scan shows the scanner parsed 131 expect() calls and 2 Date.now calls in this file and still produced zero hits, which is a non-vacuous zero"

patterns-established:
  - "A negative-control block is proved real by breaking the thing it tests in both directions, not by reading it: never-report turns the controls red and leaves the complements green, always-report turns the complements red and the controls red for the wrong reason, and the two failure sets differ"
  - "When a prose document and a machine-readable file both state a fact, parse the fact out of BOTH and compare (S5) — do not type it into the test twice. The § heading parse closed reach and expiry drift for four packages with one matcher and one token floor"

requirements-completed: []
requirements-advanced: [SEC-05]
requirements-note: "SEC-05 stays incomplete for the reason 47-07 and 47-09 both recorded. Its decision half is discharged and now GATED offline on every commit; its CI half is not — .github/workflows/ci.yml still has no audit step (47-11) and the required GitHub check has never been observed red for an advisory (47-12). This plan did not touch REQUIREMENTS.md, STATE.md or ROADMAP.md: the orchestrator owns them after the wave."

# Metrics
duration: 22min
completed: 2026-08-25
---

# Phase 47 Plan 10: The Allowlist's Honesty, Asserted Offline — Summary

**Every property that makes a security-signal suppression list trustworthy is now an assertion that runs on every commit: `failOn` anchored by equality and that anchoring asserted from the file's own source, `FORBIDDEN_REASONS` pinned by value, 39 entries checked per axis with the offending GHSA in the test name, prose and JSON unable to drift on reach or expiry in either direction, and a control block proved capable of producing a red by breaking its checker both ways — 52 tests to 280, and the SC-1b timing gate proved not to flag any of it.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-08-25T15:04:55Z (base correction) — first measurement 12:09 local
- **Completed:** 2026-08-25T15:26:54Z
- **Tasks:** 2
- **Files created:** 0 · **modified:** 1

## Task Commits

| # | Task | Commit | Artefact |
|---|---|---|---|
| 1 | The offline policy-shape gate and its anti-vacuity positives | `7ac51e2` | `src/lib/__tests__/audit-policy.test.ts` (+585/−31 → 271 tests) |
| 2 | NEGATIVE CONTROL D made permanent, and the SC-1b cross-check | `f182b7d` | same file (+146 → 280 tests, 1413 lines) |

Neither commit deleted a tracked file (`git diff --diff-filter=D HEAD~1 HEAD` empty on both).

---

## First: what 47-09 had already delivered, and what it had not

47-09's handoff was accurate. `src/lib/__tests__/audit-policy.test.ts` existed with **52 passing
tests**, and it was **extended, never recreated**. Verified against the plan's `<behavior>` list
before writing anything:

| Plan 47-10 requires | 47-09 already had it? |
|---|---|
| `evaluatePolicy` returns `[]` for a well-formed synthetic triple | **YES** — NC-1's complement |
| `GHSA_PATTERN` rejects a CVE id | **YES** — but anchored on a hard-coded literal, not on shipped data |
| `GHSA_PATTERN` accepts a real id **from the shipped allowlist** | **NO** — added |
| `FORBIDDEN_REASONS` sorted, equal to its value list | **NO** — added. This is `must_haves` truth #3 and it was the single most load-bearing gap |
| shipped `failOn` by `toEqual`, never `toContain` | **YES** — and now also asserted from this file's own source |
| empty-allowlist handled explicitly | **PARTIAL** — a `MIN_ALLOWLIST_ENTRIES` floor existed; the *both-empty* register for the cross-references did not |
| per-entry assertions **via `it.each`**, failure naming the GHSA | **NO** — five `for` loops; converted |
| cross-reference JSON → prose | **YES** |
| cross-reference prose → JSON | **NO** — added, with a live exclusion register |
| doc size floor + required-token register + known-negative floor | **YES** |
| the three dispositions / expiry rule / required-job / `npm audit fix` prohibition / three-trees | **YES** |
| the runtime-vs-build/dev **rule** as a required token | **NO** — added (three tokens) |
| cross-file control: `evaluatePolicy` over the SHIPPED file with a **synthetic audit document** | **PARTIAL** — it ran against `{vulnerabilities:{}}`; a document *covering all 39 entries* did not exist |
| `package.json` `security:audit` read from the file | **YES** |
| NC-D as one named table, and a **malformed `ghsa` through `evaluatePolicy`** | **NO** — added |
| the gate's own offline property asserted from source | **NO** — added |

**Nothing pre-existing was weakened.** The five `for` loops became five `it.each` blocks carrying
the same assertions and the same messages; the change is strictly stronger, because a loop stops at
the first offender while `it.each` names every one of them. That matters concretely: 33 of the 39
entries expire on **2026-09-24**, so on that day this file now reports thirty-three named decisions
to revisit instead of one.

---

## NEGATIVE CONTROL D — the permanent cases, passing (verbatim)

```
 ✓ src/lib/__tests__/audit-policy.test.ts > NC-D: the policy checker can produce a red > rejects '(a) a forbidden bare reason — the exa…' 0ms
 ✓ src/lib/__tests__/audit-policy.test.ts > NC-D: the policy checker can produce a red > rejects '(b) a reason of `n/a` — forbidden, an…' 0ms
 ✓ src/lib/__tests__/audit-policy.test.ts > NC-D: the policy checker can produce a red > rejects '(c) a back-dated expiry, decided by t…' 0ms
 ✓ src/lib/__tests__/audit-policy.test.ts > NC-D: the policy checker can produce a red > rejects '(d) a malformed GHSA id — an entry ke…' 1ms
 ✓ src/lib/__tests__/audit-policy.test.ts > NC-D: the policy checker can produce a red > rejects '(e) an emptied failOn — the gate\'s o…' 0ms
 ✓ src/lib/__tests__/audit-policy.test.ts > NC-D: the policy checker can produce a red > still carries all five cases, in order — deleting one is a red-going act 0ms
 ✓ src/lib/__tests__/audit-policy.test.ts > NC-D: the policy checker can produce a red > THE COMPLEMENT: accepts the VALID fixture unchanged 0ms
 ✓ src/lib/__tests__/audit-policy.test.ts > NC-D: the policy checker can produce a red > THE EXPIRY COMPLEMENT: accepts the same entry expiring one day AFTER the clock 0ms
 ✓ src/lib/__tests__/audit-policy.test.ts > NC-D: the policy checker can produce a red > THE CROSS-FILE COMPLEMENT: accepts the SHIPPED policy against a clean audit document 1ms
```

Every case runs through the same `evaluatePolicy` the script calls, with the injected clock
(`NOW = 2026-08-25T12:00:00Z`), and each asserts an **exact problem count** plus its message
fragments — so a checker that started reporting a *different* problem for the same input goes red
rather than passing on a technicality. Case **(d)** asserts **2** problems on purpose: a malformed
id is two failures, not one — the entry is unusable **and** the advisory it was meant to cover now
has no disposition at all.

47-09's NC-1 / NC-2 / NC-3 were **confirmed present and left intact** rather than duplicated. NC-D's
doc-comment says so explicitly. Its only genuinely new axis is (d).

### Proof that the whole control block can actually fire — falsified in BOTH directions

A block of `toHaveLength(1)` assertions proves nothing on its own: a checker that always reported
would satisfy all five, and one that never reported would be caught only if something asserted the
complement. Both were broken on purpose, in `scripts/audit-policy.mjs`, and reverted.

**NEVER-REPORT** (`evaluatePolicy` returns `[]` unconditionally) — **22 red**, and note that every
one of NC-1, NC-2, NC-3 and NC-D is in the list, while the complements stayed green:

```
 ❯ src/lib/__tests__/audit-policy.test.ts (280 tests | 22 failed) 158ms
 FAIL  … > NC-1: a reason that is not a reason is a failure > rejects the reason dev-only
 FAIL  … > NC-1: … > rejects the reason n/a
 FAIL  … > NC-1: … > rejects the reason wontfix
 FAIL  … > NC-1: … > rejects the reason see above
 FAIL  … > NC-1: … > rejects a reason that is merely short, not on the list
 FAIL  … > NC-1: … > rejects a reason of whitespace, which has length but says nothing
 FAIL  … > NC-2: an expiry that has passed is a failure > reports a problem for a back-dated expiry
 FAIL  … > NC-2: … > treats an entry expiring TODAY as already expired
 FAIL  … > NC-2: … > the injected clock is what decides, not the wall clock
 FAIL  … > NC-3: an emptied or narrowed failOn is a failure > reports a problem for an EMPTY failOn
 FAIL  … > NC-3: … > reports a problem when critical dropped
 FAIL  … > NC-3: … > reports a problem when high dropped
 FAIL  … > NC-3: … > reports a problem for a WIDENED failOn too, so the policy cannot drift either way
 FAIL  … > NC-D: the policy checker can produce a red > rejects '(a) a forbidden bare reason — the exa…'
 FAIL  … > NC-D: … > rejects '(b) a reason of `n/a` — forbidden, an…'
 FAIL  … > NC-D: … > rejects '(c) a back-dated expiry, decided by t…'
 FAIL  … > NC-D: … > rejects '(e) an emptied failOn — the gate\'s o…'
 FAIL  … > NC-D: … > rejects '(d) a malformed GHSA id — an entry ke…'
 FAIL  … > an advisory with no recorded disposition is a failure > reports the unallowlisted advisory, and names it
 FAIL  … > an advisory with no recorded disposition is a failure > a duplicate entry for one advisory is a failure
 FAIL  … > an advisory with no recorded disposition is a failure > an advisory whose via[].url no longer yields an id is reported, not skipped
 FAIL  … > the evaluator applied to the SHIPPED policy file, not to a fixture of it > reports the uncovered advisory when one shipped entry is removed
      Tests  22 failed | 258 passed (280)
```

**ALWAYS-REPORT** (`evaluatePolicy` returns one problem unconditionally) — **31 red**, a *different*
set: now every complement fails too, which is the half that stops a reject-everything validator
passing.

```
 FAIL  … > the policy files exist and have contents (anti-vacuity) > the shipped policy satisfies its own evaluator against an empty advisory set
 FAIL  … > NC-1: … > reports nothing for the same fixture with a substantive reason
 FAIL  … > NC-2: … > reports nothing while the entry is still in date
 FAIL  … > NC-3: … > reports nothing for the required failOn
 FAIL  … > NC-3: … > order is not semantic — the comparison is on the set
 FAIL  … > NC-D: … > THE COMPLEMENT: accepts the VALID fixture unchanged
 FAIL  … > NC-D: … > THE EXPIRY COMPLEMENT: accepts the same entry expiring one day AFTER the clock
 FAIL  … > NC-D: … > THE CROSS-FILE COMPLEMENT: accepts the SHIPPED policy against a clean audit document
 FAIL  … > the evaluator applied to the SHIPPED policy file, not to a fixture of it > reports nothing when every shipped entry's advisory is reported
      Tests  31 failed | 249 passed (280)
```

`git checkout -- scripts/audit-policy.mjs` after each; **280 passed (280)** restored both times.

---

## The three one-off falsifications against the SHIPPED `audit-policy.json` (verbatim)

Synthetic fixtures prove the rules; only these prove the gate reads the real file.

### D-1 — one shipped `reason` set to `"dev-only"`

```
target entry: GHSA-ggv3-7p47-pfv8 next
patched reason -> dev-only
```
```
 ❯ src/lib/__tests__/audit-policy.test.ts (280 tests | 4 failed) 228ms
 FAIL  … > the policy files exist and have contents (anti-vacuity) > the shipped policy satisfies its own evaluator against an empty advisory set
 FAIL  … > NC-D: the policy checker can produce a red > THE CROSS-FILE COMPLEMENT: accepts the SHIPPED policy against a clean audit document
 FAIL  … > every shipped allowlist entry, named > 'GHSA-ggv3-7p47-pfv8 (next)' gives a substantive, non-forbidden reason
 FAIL  … > the evaluator applied to the SHIPPED policy file, not to a fixture of it > reports nothing when every shipped entry's advisory is reported
      Tests  4 failed | 276 passed (280)
```
```
AssertionError: GHSA-ggv3-7p47-pfv8 (next)'s reason is 8 characters; the floor is 80. A reason that
would be true of any project is not a reason — name the call site, the measurement, and the
alternative that was rejected.: expected 8 to be greater than or equal to 80

AssertionError: the shipped audit-policy.json does not satisfy its own evaluator against a document
in which every one of its entries is reported. …
+ [
+   "audit-policy.json allowlist[0] (GHSA-ggv3-7p47-pfv8) gives \"dev-only\" as its reason, which is on FORBIDDEN_REASONS. A reason must say why the advisory does not apply to THIS project's usage — name the call site, the measurement, and the alternative that was rejected.",
+ ]
```
Reverted → `git status --porcelain audit-policy.json` empty → **280 passed (280)**.

Note the offending entry is named in the **test name**, which is what the `it.each` conversion bought.

### D-2 — one shipped `expires` back-dated to `2020-01-01`

```
target: GHSA-c7w3-x93f-qmm8 nodemailer expires 2026-11-23
back-dated
```
```
 ❯ src/lib/__tests__/audit-policy.test.ts (280 tests | 6 failed) 174ms
 FAIL  … > the policy files exist and have contents (anti-vacuity) > the shipped policy satisfies its own evaluator against an empty advisory set
 FAIL  … > NC-D: the policy checker can produce a red > THE CROSS-FILE COMPLEMENT: accepts the SHIPPED policy against a clean audit document
 FAIL  … > every shipped allowlist entry, named > 'GHSA-c7w3-x93f-qmm8 (nodemailer)' has an expiry that is a bare date and has not passed
 FAIL  … > the prose policy and the machine-readable policy cannot drift apart > nodemailer's prose section states the same reach and the same expiry as the JSON
 FAIL  … > the evaluator applied to the SHIPPED policy file, not to a fixture of it > reports nothing when every shipped entry's advisory is reported
 FAIL  … > the evaluator applied to the SHIPPED policy file, not to a fixture of it > reports the uncovered advisory when one shipped entry is removed
      Tests  6 failed | 274 passed (280)
```
```
AssertionError: GHSA-c7w3-x93f-qmm8 (nodemailer) expired on 2020-01-01. Take the fix, or re-state
the reason against today's code and set a new date — see AUDIT-POLICY.md. Extending the date without
re-reading the evidence is the failure this field exists to prevent.: expected 1577836800000 to be
greater than 1787671408706
 ❯ src/lib/__tests__/audit-policy.test.ts:885:7
    885|     ).toBeGreaterThan(Date.now())
       |       ^
    886|     expect(new Date(entry.expires).getTime()).toBeGreaterThan(Date.now…
```
The **prose** cross-check went red too, unprompted: back-dating the JSON alone makes it disagree with
`AUDIT-POLICY.md`'s `nodemailer` heading. Reverted → clean → **280 passed (280)**.

### D-3 — the shipped `failOn` emptied

```
failOn was ["critical","high"]
failOn emptied
```
```
 ❯ src/lib/__tests__/audit-policy.test.ts (280 tests | 5 failed) 168ms
 FAIL  … > the policy files exist and have contents (anti-vacuity) > the shipped policy satisfies its own evaluator against an empty advisory set
 FAIL  … > NC-D: the policy checker can produce a red > THE CROSS-FILE COMPLEMENT: accepts the SHIPPED policy against a clean audit document
 FAIL  … > the shipped audit-policy.json > declares failOn exactly ["critical","high"], in that order
 FAIL  … > the evaluator applied to the SHIPPED policy file, not to a fixture of it > reports nothing when every shipped entry's advisory is reported
 FAIL  … > the evaluator applied to the SHIPPED policy file, not to a fixture of it > reports the uncovered advisory when one shipped entry is removed
      Tests  5 failed | 275 passed (280)
```
```
declares failOn exactly ["critical","high"], in that order
AssertionError: expected [] to deeply equal [ 'critical', 'high' ]

- Expected
+ Received

- [
-   "critical",
-   "high",
- ]
+ []
```

Reverted. **Three reds, three reverts.** Final state:

```
$ git status --porcelain audit-policy.json
(empty)
$ git status --porcelain
 M src/lib/__tests__/audit-policy.test.ts     ← at the time; now committed
```

### Two further falsifications of the NEW anchors (Task 1's own deliverables)

**`FORBIDDEN_REASONS` by value** — `"dev-only"` removed from the frozen list in
`scripts/audit-policy.mjs`:

```
  [
-   "dev-only",
    "n/a",
    "see above",
    "wontfix",
  ]
 ❯ src/lib/__tests__/audit-policy.test.ts:310:43
    310|     expect([...FORBIDDEN_REASONS].sort()).toEqual(["dev-only", "n/a", …
      Tests  1 failed | 269 passed (270)
```

The test count fell from 271 to **270** — because NC-1's `it.each` is driven by the same list, so
removing the entry silently *deleted a control case*. That is precisely the failure the by-value
assertion exists to make loud, and it is now demonstrated rather than argued.

**The containment anchor** — the shipped-`failOn` assertion rewritten to use a containment matcher:

```
 FAIL  … > this gate is offline, and its anchors are anchored > anchors failOn with an array equality and never with toContain
AssertionError: a line applies a containment matcher to failOn. Use an array equality: containment
lets a WIDENED severity list pass, and the claim about what the gate catches lives in
AUDIT-POLICY.md.: expected [ Array(1) ] to deeply equal []

+ [
+   "src/lib/__tests__/audit-policy.test.ts:660",
+ ]
```

Reported with `file:line`. Both reverted; green restored.

**The reverse cross-reference** — an unclassified id appended to `AUDIT-POLICY.md`:

```
+ [
+   "GHSA-zzzz-yyyy-xxxx",
+ ]
```

**The prose/JSON reach agreement** — `postcss`'s prose heading flipped from `build` to `runtime`:

```
  [
-   "runtime",
+   "build",
  ]
 ❯ src/lib/__tests__/audit-policy.test.ts:835:65
```

Both reverted with `git checkout --`; `AUDIT-POLICY.md` is byte-unchanged by this plan.

---

## The SC-1b cross-check: the two gates this phase added do not fight

`suite-timing-hygiene.test.ts` is **green** after this file landed:

```
 ✓ src/lib/__tests__/audit-policy.test.ts (280 tests) 158ms
 ✓ src/lib/__tests__/suite-timing-hygiene.test.ts (46 tests) 54ms
 Test Files  2 passed (2)
      Tests  326 passed (326)
```

That gate's sweep asserts `offenders` `toEqual([])` over `walkTestFiles("src")` with
`EXCLUDED_PATHS` asserted **empty** (`:1158-1169`), so a green run already implies zero hits on this
file. But "green because it found nothing" and "green because it looked and found nothing" are
different claims, so the scan was run **directly** against this file through the gate's exported
`scanSource`, in a throwaway harness that was then deleted:

```
[crosscheck] file            : src/lib/__tests__/audit-policy.test.ts
[crosscheck] chars parsed    : 70965
[crosscheck] expect() calls  : 131
[crosscheck] Date.now calls  : 2
[crosscheck] perf.now calls  : 0
[crosscheck] tainted names   : []
[crosscheck] HITS            : []
 ✓ src/lib/__tests__/zz-sc1b-crosscheck.temp.test.ts (47 tests) 122ms
```

**A non-vacuous zero.** The scanner parsed 131 `expect()` calls and found the 2 `Date.now` calls it
would have to taint — and still produced an empty hit list. The pairing is now verified from both
sides: 47-05 holds `expect(new Date(entry.expires).getTime()).toBeGreaterThan(Date.now())` as
KNOWN_NEGATIVE fixture (c), and this file ships that exact expression at
`audit-policy.test.ts:886`, deliberately, with the reasoning in its header.

The harness (`zz-sc1b-crosscheck.temp.test.ts`) was **deleted** before committing — it imports
47-05's gate module, which re-registers that gate's 46 tests in the importing file's context (hence
`47 tests` above). `git status --porcelain` confirmed clean afterwards.

---

## The `node -e` source assertions

`grep` is unusable on this repository's files under the active shell wrapper — a bare
`grep -n "export" scripts/audit-policy.mjs` returned **`0 matches`** for a file with **15** export
lines, confirmed by `node -e`. Every source assertion below is therefore `node -e`.

```
file                        : src/lib/__tests__/audit-policy.test.ts
total lines                 : 1413
code lines (comment-blind)  : 977

-- the failOn anchor --
lines mentioning failOn      : 24
failOn + toEqual lines       : 3
failOn + toContain lines    : 0   <-- MUST be 0
literal toEqual(["critical", "high"]) present: true

-- FORBIDDEN_REASONS by value, not by length --
sorted-array-equality line  : 1   <-- MUST be >= 1
FORBIDDEN_REASONS .length   : 0   <-- MUST be 0

-- offline --
import specifiers           : ["../../../scripts/audit-policy.mjs","node:fs","node:path","semver","vitest"]
relative .mjs import present: true
code lines with child_process: 0
code lines with execSync    : 0
code lines with spawnSync   : 0
code lines with spawn(      : 0
code lines with fetch(      : 0
code lines with process.env : 0
code lines with node:net    : 0
code lines with node:https  : 0
code lines with undici      : 0
code lines with "npm audit" : 3   (prose mentions it 6x; code 0)
prose lines with "npm audit": 11
code lines with ".env"      : 0
read call sites (code only) : 1
```

The three `npm audit` occurrences on code lines are **string literals in the required-doc-token
register**, not invocations:

```
1024:       "`npm audit --omit=dev` is not this policy", // reach is a judgement, not a flag
1027:       "`npm audit fix` is forbidden", // the prohibition
1044:     expect(document.includes("run `npm audit fix` to remediate")).toBe(false)
```

They are why the offline property is asserted **structurally** in the file itself — as an import set
pinned by value — rather than as the text scan the plan's acceptance criteria described. A text scan
of this file cannot work: the header *must* name `child_process`, `npm audit` and `.env` to explain
why the code contains none of them, so the scan would either report its own documentation as a
defect or be reworded until it matched nothing. The import-set equality cannot be talked around:
adding `node:child_process`, `node:net`, `undici` or a fetch polyfill is red.

---

## What the extended gate now asserts (the shape of the 280)

| Block | Tests | What a red means |
|---|---|---|
| anti-vacuity: files parse, floors, matcher self-tests, `FORBIDDEN_REASONS` by value, GHSA validator vs shipped data, scanner/validator agreement, both-sides-non-empty | 9 | the gate has no input, or a matcher stopped matching |
| NC-1 / NC-2 / NC-3 (47-09, intact) | 15 | the checker's reason / expiry / `failOn` rules changed |
| **NC-D** (new) | 9 | the checker can no longer produce a red, or produces a different one |
| unallowlisted / duplicate / unresolvable-id advisories | 3 | an advisory could pass with no disposition |
| document-shape floors (`assertAuditDocument`, 7 controls + complement) | 8 | an emptied or doctored `npm audit` document would certify as clean |
| the shipped file: `failOn` equality, no duplicate id | 2 | the policy's anchor moved |
| **every shipped entry, named** (5 axes × 39 entries) | 195 | that entry's id / reach / reason / expiry / package is wrong — by name |
| prose ↔ JSON: forward, **reverse**, remediated register, **reach+expiry headings**, **ZERO-dev-reach**, token register, known-negative, disclosure | 14 | the two halves of the policy drifted |
| CI wiring (`security:audit`, not chained into `npm test`, script imports, guard, exit-code note) | 6 | the gate is not reachable the way CI reaches it, or stopped being offline-safe |
| **this gate itself**: self-read floor, import set by value, relative import, one read site, comment-filter proof, the `failOn`/containment anchor | 6 | the gate's own guarantees were edited away |
| **allowlisted packages installed / rejected tooling absent** | 8 | an entry suppresses nothing, or a supply-chain tool got installed |
| **cross-file control** over the SHIPPED file + drop-one complement + document floor | 3 | the evaluator and the real file disagree |
| D-47-01-A (`overrides.vite`, 47-09) | 3 | vite 8 can enter |
| `collectAdvisories` package-severity granularity (47-09) | 2 | the 39-entry decision silently became a 16-entry one |

The **empty-allowlist** case is handled explicitly in two places: the `MIN_ALLOWLIST_ENTRIES` floor
in its own `it` (an `it.each` over an emptied table registers **zero** tests and vanishes silently —
the floor is what notices), and the both-sides-non-empty register that guards every set-difference
cross-reference.

---

## The three gates

| Gate | Baseline (`e6a8a3e`, from 47-09) | AFTER this plan | Verdict |
|---|---|---|---|
| base test files | `172 passed \| 2 skipped (174)` | `172 passed \| 2 skipped (174)` | identical — no new file |
| base tests | `4897 passed \| 32 skipped (4929)` | `5125 passed \| 32 skipped (5157)` | **+228**, exactly this file's 52 → 280 |
| rsc project | `2 files / 8 passed (8)` | `2 files / 8 passed (8)` | identical |
| `tsc --noEmit` | exit 0 | exit 0 | identical |
| `eslint` | exit 0 — 0 errors | exit 0 — `122 problems (0 errors, 122 warnings)` | **0 errors** |
| `suite-timing-hygiene.test.ts` | 46 passed | 46 passed | identical, empty hit list |

Lint is gated on **errors (0)**. The 122-warning total is the worktree figure (master reports 124 —
`.planning`'s untracked files); it is context, never a gate.

Two `tsc` errors were introduced and fixed during Task 1, both from `noUncheckedIndexedAccess` /
`as const` narrowing (`extracted[0]` possibly `undefined`; a `Set<"GHSA-…">` literal type from the
`REMEDIATED_IN_DOC` register). Fixed with `?? ""` — chosen over a cast because a broken extraction
then yields `""`, which the pattern rejects, so the test still fails — and `new Set<string>(…)`.

---

## Deviations from Plan

### 1. [Adapted] The offline property is asserted structurally, not as the text scan the acceptance criteria described

The plan's acceptance criteria: *"the file … contains no `child_process`, no `npm audit`, and no
`.env` read — asserted with `node -e` over the file text."* Run literally over this file's text, that
assertion **fails on its own documentation**: the header has to name all three to explain why the
code uses none of them, and `npm audit` additionally appears three times as a *required doc token*
being searched for in `AUDIT-POLICY.md`.

Two things were done instead of one: (a) the `node -e` scan is reported above, comment-blind, with
the three surviving occurrences shown to be string literals; (b) the durable, permanent form is an
**import set asserted by value** inside the file, which is strictly stronger — it cannot be satisfied
by rewording, and it catches `node:net` / `undici` / a fetch polyfill, none of which a
`child_process` scan would see.

### 2. [Rule 2 — missing critical functionality] Five `for` loops converted to `it.each`, and four assertions added the plan did not ask for by name

The conversion is the plan's own action text (*"the per-entry assertions with `it.each` over the
shipped allowlist so a failure names the offending GHSA"*). Recorded as a deviation anyway, because
it **modified pre-existing tests** and the phase hard rules require that to be visible: every
assertion and every failure message was preserved, and the five axes remained five separate blocks
so a broken `reach` and an expired `expires` on the same entry are two reports rather than one
short-circuit.

Four assertions were added under Rule 2 (they close real drift, and the plan's `<behavior>` implies
them without naming the mechanism):

- **the prose/JSON `reach` + `expires` agreement**, parsed from the four `### \`pkg\` … reach \`x\` …
  expires **date**` headings. The plan asked for cross-references *"in BOTH directions"*; ids were
  cross-referenced but the two most gameable *fields* were not. Observed red by flipping `postcss`'s
  prose reach.
- **`REMEDIATED_IN_DOC`** as a live control. The reverse cross-reference cannot be a plain set
  difference: `AUDIT-POLICY.md` legitimately names `GHSA-5xrq-8626-4rwp` (the `vitest` critical
  47-01 *fixed*) as evidence. An exclusion is a control, not a comment — so the register asserts the
  id is still in the prose, still absent from the allowlist, and still on a line that says
  `cleared`.
- **the ZERO-dev-reach claim** asserted against the data. 47-09 wrote *"There are currently ZERO
  dev-reach acceptances"* into the prose; nothing checked it, and `dev` is the reach a reader
  discounts fastest.
- **allowlisted packages must still be in `package-lock.json`**, with `audit-ci`,
  `better-npm-audit` and `event-stream` asserted absent as the known-negative half. This is the
  offline shadow of `staleAllowlistProblems`: an entry for a package that is no longer installed
  suppresses nothing while reading as a live acceptance.

### 3. [Recorded] `grep` cannot be trusted in this environment, and it was caught silently under-reporting by 15 lines

`grep -n "export" scripts/audit-policy.mjs` → **`0 matches`**. `node -e` over the same file → **15
export lines**. This is the documented `wc -l` hazard in a worse form: not a wrong count, a
confidently empty result. Every source measurement in this plan uses `node -e`, and the earlier
`grep`-based reads were discarded rather than reconciled.

### 4. [Not a deviation — honoured as written]

- **`MIN_ADVISORIES_PARSED` left at 3.** 47-09's ceiling reasoning stands: the fully-remediated
  residual is 8, so any floor above 8 fatals on *success*. The empty/wrong-shaped document
  detection was re-verified green through `assertAuditDocument`'s seven controls (including the two
  shapes 47-01 measured: `vulnerabilities` emptied with metadata intact →
  `/does not reconcile/`; `metadata.vulnerabilities.total` deleted → `/`metadata.vulnerabilities.total` is/`).
- **No expiry was back-dated in the shipped file permanently.** All three shipped-file
  falsifications were reverted with `git checkout --`; `audit-policy.json` and `AUDIT-POLICY.md` are
  byte-unchanged by this plan.
- **No `npm install` / `npm audit fix` / `npm audit` of any kind.** `package-lock.json` untouched.
  `node_modules` treated as shared and read-only.
- **The file is `*.test.ts`** — in the base vitest project, so it runs in CI.
- **`suite-timing-hygiene.test.ts`, `suite-hook-hygiene.test.ts`, `ci.yml` and
  `db-test-isolation.test.ts` were not modified** — 47-05's, 47-14's and 47-11's files. The timing
  gate was *read* and *imported by a throwaway harness*, never edited.
- **D-47-06-A left alone.** No test file with a dynamic import in its body was touched, and no
  loaded run was attempted.
- **`slopcheck` not run** — no package was added, removed or version-changed.

## Deferred Issues

- **The stale-entry check stays on the network side** (`staleAllowlistProblems` in
  `scripts/audit-policy.mjs`), by design, and the split is stated in both headers. The offline
  shadow added here catches the coarser case only (package gone from the lockfile), not "advisory
  fixed upstream, entry left behind".
- **`REMEDIATED_IN_DOC` has one entry.** It is a live control in three directions, but a register
  with one row is a register whose *shape* has been exercised once. Anyone adding a second should
  expect the three assertions to be the useful part.
- Everything 47-09 deferred is unchanged and untouched: **SEC-47-A**
  (`src/lib/email/client.ts:20`'s unconditional `tls.rejectUnauthorized: false`), **D-47-01-B**
  (`esbuild`, below the floor), **D-47-08-A** (the platform-blind `engines.node` walk, cited by name
  in 33 of the 39 reasons), and the `Dockerfile:24` → `npm ci --legacy-peer-deps` conversion.

## Known Stubs

None. Nothing in this plan renders UI or wires data. Every assertion added was observed capable of
failing, either through one of the seven falsifications recorded above or through the two-direction
break of `evaluatePolicy` itself.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern or schema change. The one file changed
is a test that reads four repository files through a single read call site and imports nothing
outside `node:fs`, `node:path`, `vitest`, `semver` and the evaluator's pure surface.

### Threat register dispositions

| Threat ID | Disposition | Outcome |
|---|---|---|
| T-47-10-01 | mitigate | **Mitigated.** `FORBIDDEN_REASONS` asserted BY VALUE (added — 47-09's file used the list but never pinned it), `MIN_REASON_LENGTH` floor per entry with the entry named, `"dev-only"` and `"n/a"` permanent in NC-1 and NC-D, and D-1 falsified against the shipped file. Removing `"dev-only"` from the list was observed to *delete a control case* (271 → 270 tests) as well as go red |
| T-47-10-02 | mitigate | **Mitigated.** `toEqual(["critical", "high"])`, never containment — and the *absence of containment* is now asserted from this file's own source with a positive floor against a rename, observed red at `audit-policy.test.ts:660`. NC-D case (e) is permanent; D-3 falsified the shipped file |
| T-47-10-03 | mitigate | **Mitigated.** Every one of the 39 entries is asserted future against the real clock in its own named test, in the KNOWN_NEGATIVE-compatible shape; the deterministic half uses the injected clock with a future-dated complement so the control distinguishes both dates. D-2 falsified the shipped file, and the prose heading check went red with it |
| T-47-10-04 | mitigate | **Mitigated, and proved.** Nine anti-vacuity positives precede the negatives, NC-D carries three explicit complements, and `evaluatePolicy` was broken in *both* directions: never-report → 22 red (controls), always-report → 31 red (complements included). A validator that rejects everything cannot pass this file |
| T-47-10-05 | mitigate | **Mitigated, structurally.** The import set is pinned by value; no `child_process`, `execSync`, `spawn`, `fetch`, `process.env`, `node:net`, `node:https` or `undici` on any code line; one read call site, proved by a comment filter that is itself proved in both directions. The `import.meta.main` guard's presence is still asserted (47-09), which is what keeps the import inert |
| T-47-10-06 | mitigate | **Mitigated, verified from both sides.** `suite-timing-hygiene.test.ts` green, its exclusion list asserted empty, and its exported `scanSource` run directly over this file: 131 `expect()` calls parsed, 2 `Date.now()` calls found, **zero hits** |
| T-47-10-SC | mitigate | **Mitigated.** Nothing installed. No `npm install`, no `npm audit fix`, no `npm audit`. `package-lock.json` byte-unchanged; `node_modules` treated as shared read-only |

## Success Criteria

| Criterion | Status |
|---|---|
| The policy file's shape is gated offline every commit, positives before every negative, failures naming the offending GHSA | **MET** — 280 tests; 195 of them name their entry in the test name |
| `failOn` anchored by exact array equality; `FORBIDDEN_REASONS` anchored by value | **MET** — and both anchorings are themselves asserted from source, each observed red |
| Control D permanent in-file (five cases), complemented both directions, falsified once against the shipped file, verbatim | **MET** — five cases + three complements + a floor on the table; three shipped-file reds verbatim above, plus four more |
| The gate fails on an empty and on a wrong-shaped audit document | **MET** — `assertAuditDocument`'s seven controls green, including both 47-01 shapes; floors and reasoning unchanged |
| The SC-1b timing gate proved not to flag this file | **MET** — green, empty hit list, and a non-vacuous direct scan (131 expects / 2 clock calls / 0 hits) |
| `npm test`, `npm run typecheck`, `npm run lint` (0 errors) | **MET** — 5125/32, RSC 8/8, tsc 0, 0 lint errors |
| `git status --porcelain audit-policy.json` empty | **MET** |
| STATE.md / ROADMAP.md untouched | **MET** — not staged, not modified |

## Handoff

**To 47-11:** `package.json`'s `security:audit` is `node scripts/audit-policy.mjs`, asserted from the
file rather than typed twice, so the value your `ci.yml` step must invoke is already pinned by a test
that will go red if you write a different one. This file does **not** touch `ci.yml`.

**To 47-12:** the gate is green on the fixed tree and its **offline** half now has 280 assertions
behind it, so a red on the required check after `npm i -D minimist@1.2.5` will be attributable to the
network half (`staleAllowlistProblems` / the unallowlisted-advisory path) rather than to policy-shape
noise. Note the `it.each` conversion: the failing entry appears in the test *name*, which reads well
in a GitHub check annotation.

**To 47-13 / whoever reviews the phase:** the negative-control evidence for row **D** is in this
SUMMARY in three forms — the permanent cases passing, three falsifications of the shipped file, and
a two-direction break of the checker itself. The last of those is the one worth copying: a block of
"the checker rejects X" assertions is only a control if breaking the checker to never report *and* to
always report produce two **different** failure sets. Here: 22 and 31.

**To whoever owns the `next` follow-up:** unchanged, and now louder. 33 acceptances expire
**2026-09-24**; on that day this file reports **33 separately named failures**, each with its GHSA,
its package, and the instruction not to extend the date. That is intended.

## Self-Check: PASSED

```
FOUND: src/lib/__tests__/audit-policy.test.ts     (1413 lines, 280 tests, all passing)
FOUND commit: 7ac51e2   test(47-10): gate the audit policy file shape offline
FOUND commit: f182b7d   test(47-10): make the audit-policy negative controls permanent

PASS: must_haves artifact — src/lib/__tests__/audit-policy.test.ts >= 200 lines (1413)
PASS: must_haves key_link — file matches /\.\.\/\.\.\/\.\.\/scripts\/audit-policy\.mjs/
PASS: must_haves key_link — file references audit-policy.json (named constant POLICY_JSON)
PASS: truth 1 — the policy file's properties are asserted offline on every commit
PASS: truth 2 — failOn asserted with toEqual; 0 lines apply a containment matcher to it
PASS: truth 3 — FORBIDDEN_REASONS asserted by sorted array equality; 0 lines use its .length
PASS: truth 4 — NC-D's five cases permanent in-file, each paired with a complement
PASS: truth 5 — SC-1b scan over this file: 131 expects, 2 clock calls, 0 hits
PASS: git diff --diff-filter=D HEAD~2 HEAD — empty, no file deleted by either commit
PASS: audit-policy.json, AUDIT-POLICY.md, scripts/audit-policy.mjs byte-unchanged (all falsifications reverted)
PASS: package-lock.json untouched; no install of any kind was run
PASS: zz-sc1b-crosscheck.temp.test.ts deleted; git status --porcelain clean before each commit
PASS: STATE.md, ROADMAP.md, REQUIREMENTS.md not modified and not staged
PASS: 47-11's and 47-14's files (ci.yml, db-test-isolation.test.ts, suite-hook-hygiene.test.ts,
      suite-timing-hygiene.test.ts) not modified
```
