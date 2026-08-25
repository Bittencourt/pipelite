---
phase: 47-suite-trust-supply-chain
plan: 04
subsystem: testing
tags: [vitest, typescript-compiler-api, ast, proxy, redos, operation-counting, anti-vacuity]

# Dependency graph
requires:
  - phase: 47-01
    provides: vitest 4.1.11 (the SEC-05 bump this file now runs under)
  - phase: 47-02
    provides: "the BEFORE margin for QG-01 — the elapsed quotient at 52.5 against its 80 threshold, 79.9% of budget, at 3x oversubscription with a CORRECT implementation"
provides:
  - "`tokenizeFieldPath` exported from `src/lib/execution/condition-evaluator.ts` (one word plus a doc-comment; no guard weakened)"
  - "a counting string facade (Proxy over a boxed String) that measures the field-path parser in deterministic integers"
  - "the field-path linearity gate as counted operations: aggregate FLOOR + CEILING + FLATNESS + early-rejection bound + 20-repeat determinism + coercion visibility"
  - "the repository's FIRST TypeScript-AST gate: delegation, no-regex and no-bulk-scanner assertions over two named functions, with four anti-vacuity floors, a matcher self-test over source STRINGS and a LIVE `new RegExp` positive control"
  - "negative controls A (regex) and B (restart-on-failure) observed red, verbatim, each on the assertion it is supposed to trip"
  - "the removal of the last two `performance.now()` call sites in any TEST file (with the correction that two remain in non-test src)"
affects: [47-05, 47-03, 47-09, quality-gates, suite-timing-hygiene]

# Tech tracking
tech-stack:
  added: []  # nothing installed; `typescript` was already a direct devDependency at 5.9.3
  patterns:
    - "counting string facade: a Proxy over a boxed String whose index reads and re-implemented scan methods are counted, and whose primitive coercions are counted SEPARATELY"
    - "FLOOR-as-well-as-CEILING for cost assertions: a ceiling alone passes the worst case when the work moves inside a native call"
    - "TypeScript-AST structural gate via `ts.createSourceFile`, taking a source STRING so fixtures and the real file share one code path"
    - "a LIVE positive control: prove a detector against real code in the same file that legitimately trips it, where tripping is not a defect"

key-files:
  created: []
  modified:
    - src/lib/execution/condition-evaluator.ts
    - src/lib/execution/condition-evaluator.test.ts

key-decisions:
  - "K (the counted CEILING) pinned at 6 against a freshly measured 1.518 ops/char — 4.0x headroom, two orders of magnitude below control B's 153"
  - "the FLOOR is applied to the AGGREGATE of four traversal-requiring paths; the quote storm is held out and bounded separately, because it is CORRECTLY rejected in 43 operations and a per-path floor would demand the parser waste work"
  - "the old assertion's exact tokens (the clock call, the matcher, the quotient) are described but never spelled, so 47-05's clock-call floor counts call sites rather than prose"
  - "the AST gate governs exactly two named functions, not the file: `evaluateOperator` builds a RegExp on purpose, and gating the file would have forced the forbidden list to be emptied"
  - "control B was written with NO regex and NO bulk scanner on purpose, so the AST half passes it — the two halves are shown to be non-overlapping, not merely both present"

patterns-established:
  - "Pattern: assert cost as an integer with a floor, a ceiling AND a flatness bound across a >=16x input span, plus a determinism assertion that the integer is the same one every time"
  - "Pattern: hold out inputs the subject is supposed to reject early, and bound them separately rather than averaging them into a floor"
  - "Pattern: a checker that takes a source STRING, so its KNOWN_POSITIVE/KNOWN_NEGATIVE fixtures and its real subject go through one code path — and the file never has to scan or exempt itself"

requirements-completed: [QG-01]

# Metrics
duration: 31min
completed: 2026-08-25
---

# Phase 47 Plan 04: Field-Path Linearity Gate Summary

**The field-path parser's linearity is now defended by deterministic integers and a parsed AST instead of a quotient of two clock readings — a counted FLOOR/CEILING/FLATNESS gate measured at 1.518 counted characters per input character, paired with the repository's first TypeScript-AST structural assertion, and both halves observed red against parsers written to be vulnerable on purpose.**

## Performance

- **Duration:** 31 min
- **Started:** 2026-08-25T08:55:00Z
- **Completed:** 2026-08-25T09:26:00Z
- **Tasks:** 3 (2 committed; task 3 is a recorded-evidence task with nothing to commit by design)
- **Files modified:** 2

## Accomplishments

- **The elapsed quotient is gone, and so is the essay arguing for it.** `condition-evaluator.test.ts:590-637` — a 23-line rationale block plus the assertion that divided two best-of-5 clock windows and compared the result to 80 — is replaced by six assertions over integers that do not move when the machine is busy.
- **The FLOOR is the half that matters, and it is now proven so.** Control A (a regex-backtracking parser) reads **0** counted characters and therefore **PASSES the CEILING**. A ceiling-only gate would have shipped green over the worse of the two vulnerable implementations. The floor caught it, and the AST half caught it a second way.
- **The AST half is the repository's first `from "typescript"` gate** and it is not redundant: control B is quadratic with no regex and no bulk scanner, so the AST half passes it cleanly and only the counter sees it. The two halves are demonstrated to be non-overlapping.
- **Nothing was weakened to make any of this work.** `resolveFieldPath`'s `typeof path !== "string"` guard and `tokenizeFieldPath`'s `FORBIDDEN_SEGMENTS` check are byte-identical, and the two preserved test ranges are byte-identical (proof below).

## Task Commits

1. **Task 1: export the parser, delete the elapsed quotient with its rationale, assert counted FLOOR / CEILING / FLATNESS** — `e003ee6` (test)
2. **Task 2: the AST structural half — delegation, no regex, no bulk scanner, four anti-vacuity floors** — `950bbb6` (test)
3. **Task 3: negative controls A and B** — no commit by design. Both vulnerable parsers were installed, observed red, and reverted with `git checkout`; the deliverable is the verbatim evidence in this file, and `T-47-04-05` in the plan's threat register requires that neither body is ever committed.

## Files Created/Modified

- `src/lib/execution/condition-evaluator.ts` — `tokenizeFieldPath` gains `export` and a doc-comment saying why. 7 insertions, 1 deletion, and the deletion is the word `function` becoming `export function`.
- `src/lib/execution/condition-evaluator.test.ts` — 638 → 1460 lines. The counted half (nested inside the existing T-34-20 describe, so it shares the `pathologicalPaths` generator with the behavioural assertion above it) and the structural half (a new top-level describe).

---

## MEASURED VALUES — observed in THIS session, not copied from research

All figures below were produced by the committed test file on this tree on 2026-08-25. Where they differ from `47-RESEARCH.md`, the difference is stated.

### The counted half

| Measurement | Observed |
|---|---|
| Aggregate at n=2000, input characters | **62 073** |
| Aggregate at n=2000, counted characters | **94 230** |
| Aggregate at n=2000, **ops/char** | **1.518** |
| Aggregate at n=2000, re-implemented method calls | 10 011 |
| Aggregate at n=2000, **coercions** | **0** |
| Flatness span, small (n=500) | 15 573 input chars, ops/char **1.5238** |
| Flatness span, large (n=8000) | 248 073 input chars, ops/char **1.5166** |
| Flatness **growth** across that 15.93x span | **0.9953 — it decreases** |
| Quote storm (early rejection), n=2000 | 2 016 input chars, **43** counted |
| Quote storm (early rejection), n=64000 | 64 016 input chars, **43** counted (identical across a 31.8x input span) |
| Determinism, n=500 x 20 repeats | **1 distinct integer: 23 730** |

Per-path at n=2000, which is why the floor is an aggregate:

| Path | len | counted | ops/char |
|---|---|---|---|
| `trigger.data["a"]` x n | 10 012 | 12 040 | 1.203 |
| unterminated bracket + long tail | 20 027 | 20 082 | 1.003 |
| long dot chain | 4 009 | 14 028 | 3.499 |
| well-formed `["Código Mãe"]` x n | 28 025 | 48 080 | 1.716 |
| **AGGREGATE (the four above)** | **62 073** | **94 230** | **1.518** |
| quote storm — HELD OUT, bounded separately | 2 016 | 43 | **0.021** |

Constants pinned from these numbers: `MIN_COUNTED_PER_CHAR = 1`, `MAX_COUNTED_PER_CHAR = 6` (4.0x headroom over 1.518), `MAX_FLATNESS_GROWTH = 1.25`, `MAX_EARLY_REJECTION_COUNTED = 200`. Each carries its measurement in its doc-comment together with the instruction to re-measure and record rather than lower.

**Divergence from research:** research measured the aggregate at 1.639 ops/char over a five-path set including a different well-formed path. The traversal set here is the three traversal-requiring members of the file's own `pathologicalPaths` generator plus a `["Código Mãe"]` repeat, which is why the aggregate is 1.518 rather than 1.639 and why input length at n=2000 is 62 073 rather than 44 082. Binding the counted set to the generator the behavioural assertion already uses was preferred to a second, independent literal that could drift from it.

### The structural half

| Measurement | Observed | Research reported |
|---|---|---|
| `resolveFieldPath` body AST nodes | **73** | 89 |
| `tokenizeFieldPath` body AST nodes | **226** | 237 |
| `resolveFieldPath` extracted call set | `[.trim, tokenizeFieldPath]` | same |
| `tokenizeFieldPath` extracted call set | `[.has, .indexOf, .push, .slice]` | same |
| `resolveFieldPath` regex list | `[]` | same |
| `tokenizeFieldPath` regex list | `[]` | same |
| `evaluateOperator` regex list (the LIVE positive control) | `[condition-evaluator.ts:166: new RegExp(String(compareValue))]` | not measured |

**Divergence from research:** the node counts differ because the walks differ — research's prototype counted the body block itself and descended slightly differently. 73 and 226 are this walk's numbers and are the ones recorded in the file. The floors are 20 and 50, so both sit far below; they exist to fail when the parse stops finding a body at all, not to police size. This divergence is exactly the reason the plan said to record what this run observes rather than copy the prototype's figures — a floor whose recorded measurement is wrong is a floor nobody can re-derive.

### Cost of the file

| | Before | After |
|---|---|---|
| Tests in the file | 70 | 91 |
| `tests` time | 130 ms | 175 ms |
| `import` time | 116 ms | 764 ms |
| Total run duration | 420 ms | 1.15 s |

The `tests` figure is well inside the 40–200 ms the plan estimated and below the 196 ms the removed assertion cost. The **import** figure is the real change: `import ts from "typescript"` costs roughly 650 ms of module load. That is the price of the structural half the plan mandates. Against the base project's 88 s of total import time across 169 files it is under 1%, and full-suite wall time did not move (52.8 s after, 55.8 s before — inside run-to-run noise).

Suite totals: **4 760 passed / 32 skipped** (from 4 739 / 32; +21 tests, all in this file), 169 files passed / 2 skipped, RSC **8/8**, `npm run typecheck` exit 0, `npm run lint` **0 errors** / 122 warnings (the worktree baseline; none from this file).

---

## NEGATIVE CONTROL A — the regex shape

**Broken by:** replacing `tokenizeFieldPath`'s body with the nested-quantifier regex from 47-RESEARCH §1 Shape A — the bracket grammar as nested quantifiers, `String(path).split(".")`, one `RegExp.prototype.exec` per chunk, the regex literal inline in the body.

### (0) GREEN before — verbatim

```
 RUN  v4.1.11 /home/pedro/programming/pipelite/.claude/worktrees/agent-a3df8c4ea4ecda21f

 ✓ src/lib/execution/condition-evaluator.test.ts (91 tests) 173ms

 Test Files  1 passed (1)
      Tests  91 passed (91)
   Start at  06:16:46
   Duration  1.19s (transform 241ms, setup 0ms, import 809ms, tests 173ms, environment 0ms)
```

### (1) RED — verbatim

```
 ❯ src/lib/execution/condition-evaluator.test.ts (91 tests | 25 failed) 103ms
...
     × does not throw and resolves undefined on pathological paths 2ms
       ✓ the facade counts reads, spans and coercions — proven on a known input FIRST 1ms
       × the counted set is the pathological set, minus the input that is correctly rejected 1ms
       × FLOOR: reads at least 1 counted character per input character 2ms
       ✓ CEILING: reads at most 6 counted characters per input character 2ms
       × FLATNESS: ops per character does not grow across a 16x input span 7ms
       × EARLY REJECTION: the quote storm costs a constant, independent of n 1ms
       ✓ DETERMINISM: 20 repeats give exactly ONE integer 3ms
       × COERCIONS: the parser never coerces the path to a primitive 2ms
     ✓ reports the EXTRACTED call set and regex list for the inline-regex rewrite, not a boolean 4ms
     ✓ calls the inline-regex rewrite violating — on the regex, the scanners AND the lost delegation 2ms
     ✓ catches the hoisted-regex rewrite through the SCANNER list, which is why both checks exist 4ms
     ✓ calls a forward-scan shape CLEAN — the complement, without which nothing above is evidence 4ms
     ✓ detects `new RegExp` too — proven on this very file's `matches_regex` operator 9ms
     ✓ read a non-trivial amount of real source out of the subject file 0ms
     ✓ the parse finds a function declaration named resolveFieldPath 0ms
     ✓ the parse finds a function declaration named tokenizeFieldPath 0ms
     ✓ resolveFieldPath's body holds more than 20 AST nodes 0ms
     ✓ tokenizeFieldPath's body holds more than 50 AST nodes 0ms
     × the call extractor still extracts calls — the WR-11 permitted-token floor 1ms
     ✓ resolveFieldPath still delegates to tokenizeFieldPath 0ms
     × neither gated function constructs a regular expression 1ms
     × neither gated function calls a whole-string scanner 8ms
```

The FLOOR, verbatim:

```
 FAIL  src/lib/execution/condition-evaluator.test.ts > resolveFieldPath — parsing is linear, not backtracking (T-34-20) > cost is asserted as counted operations, never as elapsed time > FLOOR: reads at least 1 counted character per input character
AssertionError: read 0 counted characters over 62073 input characters (0.000/char). A count at or near ZERO means the parse moved inside a native call the facade cannot see — a regex or a bulk scanner — which is the ReDoS shape this gate exists to catch. Re-measure and record the number in MIN_COUNTED_PER_CHAR's comment; never lower the floor to go green.: expected 0 to be greater than or equal to 62073
 ❯ src/lib/execution/condition-evaluator.test.ts:934:9
```

The coercion counter, verbatim — the non-zero half of the regex signature:

```
 FAIL  ... > COERCIONS: the parser never coerces the path to a primitive
AssertionError: the path was coerced to a primitive 4 times while 0 characters were counted. A coercion hands the whole string to a native call in one step, and everything that call does is invisible to this gate.: expected 4 to be +0 // Object.is equality

- Expected
+ Received

- 0
+ 4
```

The AST regex assertion, verbatim:

```
 FAIL  src/lib/execution/condition-evaluator.test.ts > resolveFieldPath — the parser's SHAPE is asserted, not only its cost (T-34-20) > neither gated function constructs a regular expression
AssertionError: a regex in the field-path parser is a ReDoS surface NO operation counter can see: backtracking happens inside one native call, and a regex rewrite was measured reading ZERO counted characters at every input size. Keep the forward scan.: expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "src/lib/execution/condition-evaluator.ts:50: /^([^.[]*)((?:\\[(?:\"(?:[^\"]|\"\")*\"|'(?:[^']|'')*')\\])*)$/",
+ ]
```

The AST bulk-scanner assertion, verbatim, with the full `file:line` violation list:

```
 FAIL  ... > neither gated function calls a whole-string scanner
AssertionError: the field-path parser must stay a single forward pass. `.trim` is permitted (once, O(len), and the counting facade counts its span); the list in FORBIDDEN_BULK_SCANNERS is not. If a scanner is genuinely needed, the counted CEILING is the assertion that has to be re-argued, not this list that has to be shortened.: expected [ …(3) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "src/lib/execution/condition-evaluator.ts:50: /^([^.[]*)((?:\\[(?:\"(?:[^\"]|\"\")*\"|'(?:[^']|'')*')\\])*)$/  <- regex constructed inside tokenizeFieldPath",
+   "src/lib/execution/condition-evaluator.ts: tokenizeFieldPath calls .split — a whole-string scanner",
+   "src/lib/execution/condition-evaluator.ts: tokenizeFieldPath calls .exec — a whole-string scanner",
+ ]
```

### THE CEILING PASSED CONTROL A. IN AS MANY WORDS.

Isolated, to remove all doubt:

```
$ ./node_modules/.bin/vitest run src/lib/execution/condition-evaluator.test.ts -t "CEILING"
 Test Files  1 passed (1)
      Tests  1 passed | 90 skipped (91)
```

**A ceiling-only gate would have shipped green over the worst of the two vulnerable parsers.** The regex reads zero counted characters at every input size, so `0 <= 6 * 62073` is trivially satisfied while the parse burns unbounded time inside one native `exec` call. This is the Phase 46 WR-11 lesson made concrete: an assertion that only bounds a quantity from above is satisfied perfectly by a subject that stopped producing the quantity. The floor is what turns "no work observed" from a pass into a failure, and the AST half is what names the reason.

### What else control A revealed

Twenty-five tests failed, not eight. Twelve of them are pre-existing behavioural tests, and two groups of them are worth recording:

- **The T-34-21 prototype-key describe went RED** under control A (`trigger.data["__proto__"]`, `trigger.data["constructor"]`, `trigger.data.customFields["__proto__"]`, and the inherited-property case). The regex rewrite loses the bracket keys entirely, so `FORBIDDEN_SEGMENTS` never sees them. That block is a live, falsifiable assertion of the prototype-pollution property, not a decorative one — which is worth knowing, because this plan's contract was to leave it untouched and untouched assertions are easy to assume vacuous.
- **The bracket-notation describe went RED** (all eleven cases). The regex rewrite is not merely slow, it is wrong.

Both are additional evidence, not part of the gate. The gate's own verdicts are the eight nested `it`s and the AST describe.

### (2) GREEN after reverting — verbatim

```
$ git checkout -- src/lib/execution/condition-evaluator.ts
$ git status --porcelain src/lib/execution/condition-evaluator.ts
(empty)

 RUN  v4.1.11 /home/pedro/programming/pipelite/.claude/worktrees/agent-a3df8c4ea4ecda21f

 ✓ src/lib/execution/condition-evaluator.test.ts (91 tests) 218ms

 Test Files  1 passed (1)
      Tests  91 passed (91)
   Start at  06:18:20
   Duration  1.18s (transform 215ms, setup 0ms, import 772ms, tests 218ms, environment 0ms)
```

---

## NEGATIVE CONTROL B — the restart-on-failure shape

**Broken by:** replacing the name scan with the longest-first re-scanning loop from 47-RESEARCH §1 Shape B — `for (let end = len; end >= i; end--)` re-scanning `[i, end)` from scratch on every failure. **Deliberately no regex and no bulk scanner**, so the AST half cannot see it. That is the point of this control.

### (3) RED — verbatim

```
 ❯ src/lib/execution/condition-evaluator.test.ts (91 tests | 4 failed) 52923ms
...
     × does not throw and resolves undefined on pathological paths 7661ms
       ✓ the facade counts reads, spans and coercions — proven on a known input FIRST 2ms
       ✓ the counted set is the pathological set, minus the input that is correctly rejected 2ms
       ✓ FLOOR: reads at least 1 counted character per input character  2421ms
       × CEILING: reads at most 6 counted characters per input character 2453ms
       × FLATNESS: ops per character does not grow across a 16x input span 33583ms
       × EARLY REJECTION: the quote storm costs a constant, independent of n 225ms
       ✓ DETERMINISM: 20 repeats give exactly ONE integer  4168ms
       ✓ COERCIONS: the parser never coerces the path to a primitive  2351ms
     ✓ reports the EXTRACTED call set and regex list for the inline-regex rewrite, not a boolean 4ms
     ✓ calls the inline-regex rewrite violating — on the regex, the scanners AND the lost delegation 2ms
     ✓ catches the hoisted-regex rewrite through the SCANNER list, which is why both checks exist 3ms
     ✓ calls a forward-scan shape CLEAN — the complement, without which nothing above is evidence 4ms
     ✓ detects `new RegExp` too — proven on this very file's `matches_regex` operator 7ms
     ✓ read a non-trivial amount of real source out of the subject file 0ms
     ✓ the parse finds a function declaration named resolveFieldPath 0ms
     ✓ the parse finds a function declaration named tokenizeFieldPath 0ms
     ✓ resolveFieldPath's body holds more than 20 AST nodes 0ms
     ✓ tokenizeFieldPath's body holds more than 50 AST nodes 0ms
     ✓ the call extractor still extracts calls — the WR-11 permitted-token floor 1ms
     ✓ resolveFieldPath still delegates to tokenizeFieldPath 0ms
     ✓ neither gated function constructs a regular expression 0ms
     ✓ neither gated function calls a whole-string scanner 7ms
```

The CEILING, verbatim — **the assertion this control exists to trip**:

```
 FAIL  src/lib/execution/condition-evaluator.test.ts > resolveFieldPath — parsing is linear, not backtracking (T-34-20) > cost is asserted as counted operations, never as elapsed time > CEILING: reads at most 6 counted characters per input character
AssertionError: read 153.121 counted characters per input character over 62073 input characters. The parser started re-scanning: find the loop whose cursor no longer advances monotonically. Raise MAX_COUNTED_PER_CHAR only with a fresh measurement recorded beside it and a reason the extra work is necessary.: expected 153.12098658031672 to be less than or equal to 6
 ❯ src/lib/execution/condition-evaluator.test.ts:945:9
```

**Observed ops/char: 153.121, against a ceiling of 6.** (Research measured 178.9 at n=200 and 1306.9 at n=1600 for its variant of Shape B; the number here is lower because this variant restarts only the name scan and keeps `indexOf` for the closing quote. It is 25x over the ceiling and 101x over the correct implementation's 1.518, which is separation enough — any K in the plan's [3, 20] window separates them.)

**FLATNESS also fired**, as the plan asked to be checked:

```
 FAIL  ... > FLATNESS: ops per character does not grow across a 16x input span
AssertionError: ops/char went 56.295 -> 540.231 (9.596x) as the input went 15573 -> 248073 characters. Linear cost keeps this near 1.0; quadratic cost makes it grow with n. A restart-on-failure parser measured 7.3x across an 8x span.: expected 9.59645946111402 to be less than or equal to 1.25
```

**EARLY REJECTION also fired**, and its message is the interesting one — the constant became a function of n:

```
 FAIL  ... > EARLY REJECTION: the quote storm costs a constant, independent of n
AssertionError: the quote storm cost 26121 then 832121 counted characters at n=2000 and n=64000. These must be equal AND bounded: a cost that tracks n means the parser is walking the quotes before rejecting the empty key.: expected [ 26121, 832121 ] to deeply equal [ 26121, 26121 ]
```

**The FLOOR passed** (2 421 ms — the parser does read every character, it just reads them 153 times each), and **the DETERMINISM and COERCION assertions passed** (a quadratic parser is still deterministic and still never coerces). Both correct verdicts.

**THE ENTIRE AST HALF PASSED CONTROL B.** All fourteen structural `it`s green. Control B has no regex, calls no forbidden scanner, still delegates, and its body still holds enough AST nodes to clear both floors. This is the mirror image of control A and the reason the plan required both halves: **the counter catches what the shape check cannot, and the shape check catches what the counter cannot.** Neither is redundant, and a phase that shipped only one of them would have shipped a gate with a hole in exactly the shape of the other's control.

**Growth of control B, measured standalone** through an identical facade at input sizes the 5 000 ms `testTimeout` cannot reach in-suite, alongside the correct parser as the complement:

```
CURRENT (forward scan)       n=  100  input=   3173  counted=        4930  ops/char=     1.55  coerce=0  wall=2ms
CONTROL B (restart-on-fail)  n=  100  input=   3173  counted=       95879  ops/char=    30.22  coerce=0  wall=27ms
CURRENT (forward scan)       n=  200  input=   6273  counted=        9630  ops/char=     1.54  coerce=0  wall=1ms
CONTROL B (restart-on-fail)  n=  200  input=   6273  counted=      231079  ops/char=    36.84  coerce=0  wall=74ms
CURRENT (forward scan)       n=  400  input=  12473  counted=       19030  ops/char=     1.53  coerce=0  wall=2ms
CONTROL B (restart-on-fail)  n=  400  input=  12473  counted=      621479  ops/char=    49.83  coerce=0  wall=144ms
CURRENT (forward scan)       n=  800  input=  24873  counted=       37830  ops/char=     1.52  coerce=0  wall=4ms
CONTROL B (restart-on-fail)  n=  800  input=  24873  counted=     1882279  ops/char=    75.68  coerce=0  wall=431ms
CURRENT (forward scan)       n= 1600  input=  49673  counted=       75430  ops/char=     1.52  coerce=0  wall=7ms
CONTROL B (restart-on-fail)  n= 1600  input=  49673  counted=     6323879  ops/char=   127.31  coerce=0  wall=1535ms
```

The correct parser holds 1.55 → 1.52 across a 16x span; control B goes 30.22 → 127.31. Note the wall-clock column, included precisely to make the point this plan exists to make: control B is 219x slower at n=1600, and **the assertion that used to live here would still have had to distinguish that from scheduler noise**. The counted column does not.

### (4) GREEN after reverting — verbatim

```
$ git checkout -- src/lib/execution/condition-evaluator.ts
$ git status --porcelain src/lib/execution/condition-evaluator.ts
(empty)
$ git status --porcelain
(empty)

 RUN  v4.1.11 /home/pedro/programming/pipelite/.claude/worktrees/agent-a3df8c4ea4ecda21f

 ✓ src/lib/execution/condition-evaluator.test.ts (91 tests) 175ms

 Test Files  1 passed (1)
      Tests  91 passed (91)
   Start at  06:22:53
   Duration  1.15s (transform 206ms, setup 0ms, import 764ms, tests 175ms, environment 0ms)
```

Followed by `npm run typecheck` exit 0, `npm run lint` 0 errors / 122 warnings, and `npm test` at 4 760 passed / 32 skipped plus RSC 8/8.

### The complement, stated explicitly

The GREEN runs at (0), (2) and (4) are the positive controls for both negative controls. Without them, a checker that reported a violation unconditionally — or a floor that failed unconditionally — would have passed every RED above while proving nothing. This is the `node-engines-floor.test.ts:332-336` requirement, and it is also enforced permanently *inside* the file: the AST half's `KNOWN_NEGATIVE_FORWARD_SCAN` fixture must come back with an empty violation list, and the counted half's facade self-test must show the coercion counter both incrementing (on `String(facade)`) and staying at zero (on index reads), so `coercions === 0` cannot be satisfied by a counter that stopped counting.

---

## `git diff` EVIDENCE — the preserved ranges are untouched

### `condition-evaluator.ts`: one word and a doc-comment

```
 src/lib/execution/condition-evaluator.ts | 8 +++++++-
 1 file changed, 7 insertions(+), 1 deletion(-)
```

```diff
@@ -36,8 +36,14 @@ const FORBIDDEN_SEGMENTS = new Set(["__proto__", "constructor", "prototype"])
  *
  * Implemented as a single forward scan with no backtracking and no regex, so
  * cost is linear in path length even for adversarial input (T-34-20).
+ *
+ * Exported ONLY so the counted-ops gate in the sibling test file can measure this
+ * scan directly through a counting string facade — `resolveFieldPath` rejects a
+ * boxed-String proxy at its `typeof path !== "string"` guard, correctly, and that
+ * guard must not be weakened. `resolveFieldPath` remains the only production
+ * caller; the AST half of that gate asserts the delegation still exists.
  */
-function tokenizeFieldPath(path: string): string[] | null {
+export function tokenizeFieldPath(path: string): string[] | null {
   const segments: string[] = []
   const len = path.length
   let i = 0
```

That is the whole diff. `:78`'s `FORBIDDEN_SEGMENTS.has(segment)` check and `:100`'s `typeof path !== "string"` guard have no hunk touching them, and there is exactly one occurrence of `export function tokenizeFieldPath` in the file.

### `condition-evaluator.test.ts`: no hunk inside either preserved range

Hunk headers against the plan's base commit `c1fe056`:

```
@@ -0,0 +1,7 @@
@@ -1,0 +9 @@
@@ -3,0 +12 @@
@@ -590,33 +599,586 @@
@@ -624 +1185,0 @@
@@ -625,0 +1187 @@
@@ -627,8 +1189,148 @@
@@ -636 +1338,123 @@
```

The first three touch the import block only. **Every remaining hunk starts at or after old line 590.** The preserved ranges are old `552-572` (the T-34-21 prototype-keys describe) and old `582-588` (the pathological-inputs `it`), both entirely before 590.

Line numbers alone are weak evidence, so the two blocks were also compared byte-for-byte against `git show c1fe056:<file>`:

```
T-34-21 prototype-keys describe    old 552-572 (21 lines) -> byte-identical, now at line 561
pathological-inputs it             old 582-588 (7 lines) -> byte-identical, now at line 591
```

The `pathologicalPaths` generator at old `575-580` is also unmoved and unmodified — the counted half was nested *inside* the existing describe specifically so it could reuse that generator rather than declare a second, drift-prone copy of the same four inputs.

### Token counts, computed with `node -e` (never `wc -l`, which miscounts under `rtk`)

| Token, in `condition-evaluator.test.ts` | Count |
|---|---|
| `performance.now` | **0** |
| `Date.now` | **0** |
| `toBeLessThan(80)` | **0** |
| `large / small` | **0** |
| `hrtime` | **0** |
| `new Date(` | **0** |

---

## FOR PLAN 47-05: the `performance.now()` claim needs correcting

The plan, `47-PATTERNS.md:544-548`, `47-VALIDATION.md:86-88` and `47-RESEARCH.md §4` all state that deleting `condition-evaluator.test.ts:613-637` removes **the repository's only two `performance.now()` call sites**. It removes the only two in any **test** file. It does not remove the only two in the repository.

Measured on this tree after the deletion, over `git ls-files`:

```
src/**/*.test.ts performance.now occurrences: 0
src non-test performance.now occurrences: 2  files: src/app/api/health/route.ts
```

`src/app/api/health/route.ts:111` and `:121` are the DB-probe latency measurement, and `git blame` puts both in commit `2710f73` — **Phase 42, 2026-08-23**, well before this phase. They were never in scope and are not affected by anything here. Three further occurrences live in `.planning/phases/47-suite-trust-supply-chain/measure/ratio-under-load.mjs`, which is 47-02's measurement harness.

**Consequences for 47-05's clock-call floor:**

- A floor scoped to `src/**/*.test.ts` and counting `performance.now` now has **zero** instances and will fail. The plan's mitigation — floor on `Date.now` (13+ sites remain) and prove `performance.now` detection with a fixture — is still the right call and is still necessary.
- A floor scoped to **all of `src/**`** finds **2** real `performance.now` call sites, both in `src/app/api/health/route.ts`. If 47-05 chooses that scope, its floor is `>= 2` and its exemption list needs the health route in it, since a latency field in a health payload is a legitimate clock reading and not an elapsed-time *assertion*.
- 47-05's SC-1b gate is about `expect()` over a clock-derived delta or ratio. The health route contains no `expect()`. The distinction between "reads a clock" and "asserts on a clock delta" is load-bearing for that gate and this is the concrete case that shows why.

Also for 47-05: this file now contains a long doc-comment *describing* the deleted assertion, and it deliberately does not spell `performance.now`, the matcher, or the quotient expression anywhere. Any suite-wide scanner will therefore read a true zero from this file rather than a prose echo. That convention follows `src/types/__tests__/no-standing-suppressions.test.ts` note (b), and the reason is written into the comment so nobody "improves" it by naming the thing again.

---

## Decisions Made

1. **K = 6 for the CEILING**, from a freshly measured 1.518 ops/char (4.0x headroom). Research recommended 6; the plan allowed [3, 20]; control B lands at 153, so the separation is 25x on the failing side and 4x on the passing side.
2. **The counted half is nested inside the existing T-34-20 describe**, not a sibling. That lets it share the `pathologicalPaths` generator with the behavioural `it` above it, which means the counted gate provably measures the same inputs the behavioural assertion exercises — and it kept the diff confined to the deleted range, so the preserved blocks did not have to move.
3. **A well-formed path was added to the traversal set** rather than floor over three malformed inputs only. The aggregate now contains one fully valid path, so the floor is not exclusively a property of rejection paths.
4. **The AST gate governs two named functions, not the file.** `evaluateOperator` legitimately builds a `RegExp` and calls `.test`. Gating the file would have forced the forbidden lists to be emptied — and an emptied forbidden list is precisely the vacuous gate this phase exists to delete. That same function is then used as a **live positive control** for the regex detector.
5. **`node:path` is imported aliased** as `{ join as joinPath }`. This file's subject is field *paths* and `path` is a parameter name in a dozen places; a module binding of that name would be shadowed everywhere it is used and visible only where it is not.
6. **Control B was written with no regex and no bulk scanner on purpose**, so that the AST half passes it. Writing a control that both halves catch would have proved less: it would not have shown that the two halves are non-overlapping.
7. **`n` for the determinism assertion is 500, not 10 000.** The claim is about variance, not scale, and the whole block had to stay in the same time order as the assertion it replaced. 20 repeats at n=500 cost ~20 ms and still produce one integer.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] My own doc-comment prose contained the three tokens the plan requires to count ZERO**

- **Found during:** Task 1, at the acceptance check
- **Issue:** the replacement essay explaining what was deleted quoted the deleted assertion literally — `performance.now()`, `toBeLessThan(80)` and `large / small`. `node -e` counted 1 of each. That is a double defect: it fails this plan's own acceptance criterion, and it would have left 47-05's clock-call floor counting a comment. It is also the exact Pitfall-9 self-collision shape that `eslint.config.mjs` records firing 15+ times across phases 37-38 and that `no-standing-suppressions.test.ts` note (b) exists to prevent.
- **Fix:** rewrote the essay to describe the deleted assertion without spelling any of its tokens, and added a paragraph stating that the omission is deliberate, why, and which two gates depend on it. Counts re-verified at 0/0/0/0.
- **Files modified:** `src/lib/execution/condition-evaluator.test.ts`
- **Verification:** `node -e` over the file text; six tokens, all zero (table above)
- **Committed in:** `e003ee6`

**2. [Rule 2 - Missing Critical] Added an input-shape floor the plan did not list**

- **Found during:** Task 1
- **Issue:** the quote storm is held out of the aggregate **by index** (`pathologicalPaths(n)[3]`). Nothing asserted that index 3 is still the quote storm. A reordering of the generator would silently drag the early-rejection path into the aggregate floor, and the floor would start demanding that the parser waste work on an input it is supposed to reject in 43 operations — a gate quietly inverted into an anti-requirement.
- **Fix:** added `it("the counted set is the pathological set, minus the input that is correctly rejected")`, which pins `quoteStormPath(4)` to its exact literal, asserts it still tokenises to `null`, asserts the other three contain no `""`, and asserts the flatness span really is >= 15x. Anti-vacuity is a correctness requirement for a gate, so this is Rule 2 rather than scope creep.
- **Files modified:** `src/lib/execution/condition-evaluator.test.ts`
- **Verification:** the assertion is one of the eight that went red under control A
- **Committed in:** `e003ee6`

**3. [Rule 2 - Missing Critical] Added a third AST fixture and a live positive control beyond the plan's list**

- **Found during:** Task 2
- **Issue:** the plan specified one KNOWN_POSITIVE (a regex-based `tokenizeFieldPath`) and one KNOWN_NEGATIVE. Writing the checker exposed a gap: research's own negative-control output shows the regex *inside* the function body, but the realistic rewrite — and the one `47-RESEARCH.md §1 Shape A` actually prints — hoists `BACKTRACK_RE` to module scope, where the body contains **no regex literal at all** and only `.exec` betrays it. With one fixture, the reader has no way to know which of the two checks is carrying the weight in which case. Separately, the regex detector's `new RegExp` branch was untested by any fixture.
- **Fix:** added `KNOWN_POSITIVE_HOISTED_REGEX` (asserts the regex list is EMPTY for the function and that `.exec` is what catches it, plus that the delegation check stays quiet — the constant-non-empty-array complement), and added a live positive control that runs the detector over the real file and asserts it reports `condition-evaluator.ts:166: new RegExp(String(compareValue))` inside `evaluateOperator`.
- **Files modified:** `src/lib/execution/condition-evaluator.test.ts`
- **Verification:** all five self-test `it`s pass on the clean tree and stay green under both controls, which is what makes them complements rather than duplicates
- **Committed in:** `950bbb6`

**4. [Rule 1 - Bug] Corrected the AST node counts the plan told me to record**

- **Found during:** Task 2
- **Issue:** the plan and research supply 89 and 237 as the measured body node counts. This walk measures 73 and 226. The floors (20 and 50) pass either way, so a wrong recorded number would never have gone red — a comment nobody can re-derive, sitting on a floor whose whole job is to be re-derivable.
- **Fix:** measured both with the committed walk, recorded 73 and 226 in the constant's doc-comment and in both failure messages, and recorded *why* the numbers differ from the prototype's.
- **Files modified:** `src/lib/execution/condition-evaluator.test.ts`
- **Verification:** independent `node -e` run over `ts.createSourceFile`, reproduced in the table above
- **Committed in:** `950bbb6`

---

**Total deviations:** 4 auto-fixed (2 bugs, 2 missing-critical anti-vacuity additions)
**Impact on plan:** all four exist to stop this plan from shipping the eighth gate that cannot fail. No scope creep — nothing was added outside the two files the plan names, and nothing was installed.

## Issues Encountered

- **Control B is slow enough to fight the test timeout.** The full file took 52.9 s under control B, and `FLATNESS` alone took 33.6 s against a 5 000 ms `testTimeout`. It still produced its assertion failure rather than a timeout, because vitest cannot preempt a synchronous test — but the preserved behavioural `it` at n=20000 *did* time out (7 661 ms) rather than assert. Resolved by additionally measuring control B standalone at n=100..1600 through an identical facade, so the ops/char growth curve is recorded from a run with no timeout in it. Both the in-suite assertion output and the standalone curve are above.
- **The `rtk` hazards were both real.** `npm run typecheck` and `npm run lint` with a trailing `${PIPESTATUS[0]}` echo were refused as too complex to verify inside the worktree, and heredoc-based file appends were refused too; the sandbox required plain single-purpose commands and the `Edit`/`Write` tools. No count in this summary came from `wc -l`.
- **The worktree was stale, as always.** Branched from `a58b9e1` instead of `c1fe056`; corrected with `git merge --ff-only`, never `reset --hard`. The three bootstrap symlinks (`node_modules`, `.env`, `e2e/.auth/admin.json` inside a *real* `e2e/.auth` directory) were created before any verification ran.

## User Setup Required

None.

## Next Phase Readiness

- **QG-01 SC-2 is closed and provable.** Four of the five `47-VALIDATION.md` "Requirements → Test Map" rows for SC-2 are now green and falsifiable: the aggregate floor/ceiling, the flatness bound, the quote-storm early-rejection bound, and the AST delegation/no-regex/no-scanner gate with its anti-vacuity floors.
- **Negative controls A and B are delivered**, with verbatim red output, the failing assertion named for each, and the ceiling-passes-A fact stated in as many words. Controls C, D and E belong to other plans.
- **47-05 must read the `performance.now()` section above before writing its clock-call floor.** The "only two call sites in the repository" premise is false; the true statement is "only two in any test file", and two non-test sites remain in `src/app/api/health/route.ts`.
- **47-03 is unaffected.** It owns `suite-hook-hygiene.test.ts`, `toggle.test.ts` and `recursion.test.ts`; none was read or written here. The two `recursion.test.ts` hoisting warnings in the full-suite output are pre-existing and are 47-03's subject.
- **One thing to watch:** this file now imports `typescript`, which costs ~650 ms of module load. If 47-05's `suite-timing-hygiene.test.ts` also imports it, that is a second ~650 ms in the base project. Full-suite wall time did not move measurably here, but a third and fourth AST gate would be worth measuring rather than assuming.

## Self-Check: PASSED

- `src/lib/execution/condition-evaluator.ts` — FOUND (7.1K)
- `src/lib/execution/condition-evaluator.test.ts` — FOUND (60.3K, 1460 lines, above the plan's `min_lines: 600`)
- `.planning/phases/47-suite-trust-supply-chain/47-04-SUMMARY.md` — FOUND
- commit `e003ee6` — FOUND in `git log --oneline --all`
- commit `950bbb6` — FOUND in `git log --oneline --all`
- `git status --porcelain` — empty before the summary commit; no negative-control body committed

Artifact contract from the plan's frontmatter, verified: `export function tokenizeFieldPath` present exactly once in the source; `new Proxy` present in the test file; `from "typescript"` present in the test file; `ts.createSourceFile` called.

**STATE.md and ROADMAP.md were deliberately NOT touched** — the orchestrator owns those after the wave completes.

---
*Phase: 47-suite-trust-supply-chain*
*Completed: 2026-08-25*
