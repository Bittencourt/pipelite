---
phase: 47-suite-trust-supply-chain
reviewed: 2026-08-25T00:00:00Z
depth: deep
files_reviewed: 25
files_reviewed_list:
  - .github/workflows/ci.yml
  - AUDIT-POLICY.md
  - CONTRIBUTING.md
  - audit-policy.json
  - package.json
  - scripts/audit-policy.mjs
  - scripts/diff-pass-sets.mjs
  - scripts/suite-repeatability.sh
  - src/app/api/health/__tests__/route.test.ts
  - src/app/workflows/__tests__/replay-carries-dry-run.test.ts
  - src/components/custom-fields/__tests__/client-formula-bounds.test.ts
  - src/lib/__tests__/audit-policy.test.ts
  - src/lib/__tests__/suite-hook-hygiene.test.ts
  - src/lib/__tests__/suite-timing-hygiene.test.ts
  - src/lib/execution/condition-evaluator.test.ts
  - src/lib/execution/condition-evaluator.ts
  - src/lib/execution/engine.test.ts
  - src/lib/execution/execution-processor.test.ts
  - src/lib/execution/failure-alert.test.ts
  - src/lib/execution/recursion.test.ts
  - src/lib/execution/toggle.test.ts
  - src/lib/formula-engine.test.ts
  - src/lib/import/formula-recalc-batch.test.ts
  - src/lib/log.test.ts
  - src/lib/mutations/__tests__/db-test-isolation.test.ts
findings:
  critical: 2
  warning: 12
  info: 3
  total: 17
status: fixed
fixed: 2026-08-25
fix_commits: 887af25..a6fa495
fixed_findings: [CR-01, CR-02, WR-01, WR-02, WR-03, WR-04, WR-05, WR-06, WR-07, WR-08, WR-10, WR-11, WR-12, IN-01, IN-02, IN-03]
declined_findings: [WR-09]
---

# Phase 47: Code Review Report

**Reviewed:** 2026-08-25
**Depth:** deep (cross-file, with the two AST gates and the policy evaluator executed against
adversarial inputs)
**Files Reviewed:** 25
**Status:** findings

## Summary

Phase 47 ships a lot of genuinely good defensive engineering: `evaluatePolicy` is pure with an
injectable clock, `assertAuditDocument` is a real four-stage document validator, the two AST gates
stringify their own fixtures rather than path-excluding themselves, every carve-out list in
`suite-hook-hygiene.test.ts` carries a live control, and the counted-operations replacement in
`condition-evaluator.test.ts` has both a floor and a ceiling with the negative controls recorded.
The CI wiring is correct: both new steps sit on the required `ci` job, carry `if: ${{ !cancelled() }}`,
expose no secret, and a failure in either fails the job.

That said, this review found **a ninth vacuity and it is in the newest gate**, plus an unenforced
control in the suppression mechanism. Both were proven by execution, not by reading:

- **CR-01** — `suite-timing-hygiene.test.ts`'s sweep never asks whether the `expect()` argument
  *itself* is tainted. It only inspects arguments that are syntactically a subtraction or a
  division. Running the shipped `scanSource` over eight shapes shows it MISSES the most idiomatic
  form of the defect it forbids (`const elapsed = Date.now() - start; expect(elapsed).toBeLessThan(N)`),
  the bound ratio, the helper-returned delta, `Math.round(delta)`, and the reversed-operand form.
  The taint fixpoint — the whole reason this gate exists in v2 — is applied to the *operands* of a
  binary expression that the gate has already decided to look at, and never to the argument.
  Worse: the natural way a developer makes this gate green is to bind the delta to a name, which is
  exactly the evasion.
- **CR-02** — the allowlist's central guarantee ("acceptance is a decision that comes back") is
  unenforced. `AUDIT-POLICY.md:76-82` states a 30-day and a 90-day maximum horizon; nothing in
  `scripts/audit-policy.mjs` or `src/lib/__tests__/audit-policy.test.ts` checks any upper bound.
  `expires: "9999-12-31"` was verified to return `[]` from `evaluatePolicy`.

Beyond those, the recurring theme in the warnings is **claims that are stated more strongly than
they are checked**: the script header misattributes which floor catches an empty advisory set
(WR-02); `FORBIDDEN_BULK_SCANNERS` is not pinned by value even though its sibling `FORBIDDEN_REASONS`
was pinned in this same phase for exactly that reason (WR-04); the FLATNESS assertion is ceiling-only
in a gate whose own header argues at length that ceiling-only gates ship green over the worst case
(WR-03); "walks the corpus exactly once" is asserted with a one-line grep while the file re-parses
~13 files (WR-11); and `AUDIT-POLICY.md` presents an end-to-end control that 47-12 explicitly records
as NOT DELIVERED (WR-07).

The 7 hoisted test files were checked individually. **No hoist changes behaviour.** In every file the
pattern is `vi.hoisted()` → `vi.mock()` factories closing over it → static import of the subject,
which is safe under vitest's transform ordering. `log.ts` resolves `LOG_LEVEL` per call
(`src/lib/log.ts:43-47`), so hoisting `./log` to module scope cannot snapshot the wrong level.
`src/app/api/health/route.ts` has no module-scope side effects beyond one `const`. None of the seven
calls `vi.resetModules()`, so the module was already cached after the first test in each file — the
hoist relocates cost, not semantics.

`condition-evaluator.ts`'s only production change is widening `tokenizeFieldPath` from private to
exported, which the sibling test file pays for with an explicit delegation assertion. The pre-existing
`matches_regex` operator on that same request path is unbounded (WR-09).

---

## Critical Issues

### CR-01: The timing-hygiene gate misses the bound-delta form of the exact defect it forbids

**File:** `src/lib/__tests__/suite-timing-hygiene.test.ts:591-608` (the hit loop; the bail is at `:596`)

**Issue:** The sweep's hit loop is:

```ts
const expression = unwrapWrappers(argument)
if (!ts.isBinaryExpression(expression)) continue     // <- line 596
```

Everything after that line reasons about `expression.left` / `expression.right`. The taint state
(`taintedNames`, `taintedFunctions`) — built by the fixpoint loop at `:549-575` specifically so the
gate can "see through a variable binding" — is **never consulted on the argument itself**. So the
gate flags `expect(Date.now() - start)` and misses `expect(elapsed)`, where `elapsed` is the same
value one binding away.

I ran the shipped `scanSource` (extracted verbatim, no re-implementation) over nine shapes:

```
MISSED   A. const elapsed = Date.now() - start; expect(elapsed).toBeLessThan(5000)
FLAGGED  B. expect(Date.now() - start).toBeLessThan(5000)          <- the only form caught
MISSED   C. const ratio = b / a; expect(ratio).toBeLessThan(80)
MISSED   D. expect(elapsedHelper()).toBeLessThan(5000)
MISSED   E. expect(Math.round(Date.now() - start)).toBeLessThan(5000)
MISSED   F. expect((Date.now() - start) / 1000).toBeLessThan(5)     (documented out of scope)
MISSED   G. expect(5000).toBeGreaterThan(Date.now() - start)
FLAGGED  H. expect(end - t0).toBeLessThan(5000)
MISSED   I. const q = time(128000) / Math.max(time(8000), 0.05); expect(q).toBeLessThan(80)
```

Case I is the *original `condition-evaluator.test.ts:636` defect* with the quotient bound to a name —
i.e. the gate would still miss the assertion QG-01 was written to delete if it had been written one
binding differently. The file's own header says: *"A gate that cannot see the defect it was written
for is a vacuous gate, and this repository has shipped seven of those."* (`:56-57`).

This is worse than an ordinary false negative because of the feedback loop: when this gate goes red,
the message at `:1143-1155` tells the author to delete the assertion — but the cheapest edit that
turns it green is `const elapsed = …; expect(elapsed)…`, which leaves the defect in place and the
gate silent forever. Cases A, C, E and G are not listed in the header's
"WHAT PARSING DELIBERATELY DOES NOT CATCH" section (`:81-96`), so they are gaps, not decisions.

**Fix:** Consult the taint state on the argument, guarded by matcher class so the four KNOWN_NEGATIVE
future-timestamp shapes stay green. Insert before the `isBinaryExpression` bail:

```ts
    const expression = unwrapWrappers(argument)

    // A delta or ratio bound to a name is the SAME assertion one binding away. The taint
    // fixpoint already knows `elapsed` carries a clock reading; ask it. Restricted to
    // threshold matchers so KNOWN_NEGATIVE (b)-(e) — future timestamps, which the PlusToken
    // rule already de-taints — stay green.
    if (!ts.isBinaryExpression(expression)) {
      const matcher = matcherOf(node)
      if (classifyMatcher(matcher) === "threshold" && isTainted(expression) && !fakeClock) {
        hits.push({
          file: fileName,
          line: lineOf(node),
          kind: "delta",
          matcher,
          matcherClass: "threshold",
          text: node.getText(src).replace(/\s+/g, " "),
        })
      }
      continue
    }
```

Then add KNOWN_POSITIVE fixtures for cases A, C, D, E and G (each asserting the extracted
`line:kind:matcherClass`, as the existing positives do), and re-run the full corpus sweep — if the
widened rule produces a hit in the tree today, fix the RULE and add a KNOWN_NEGATIVE, per this file's
own `EXCLUDED_PATHS` doctrine at `:312-325`. Verified against the four future-timestamp negatives:
`insertValues`, `expiresAt` and `new Date(entry.expires)` are all de-tainted by the existing
`PlusToken` rule at `:510-512`, so none of them becomes a hit.

---

### CR-02: No maximum expiry horizon is enforced, so a suppression can be made permanent in one JSON edit

**File:** `scripts/audit-policy.mjs:552-570`; `src/lib/__tests__/audit-policy.test.ts:867-887`;
`AUDIT-POLICY.md:76-82`

**Issue:** `AUDIT-POLICY.md` states the rule as a policy:

> Two horizons, both measured from the decision date:
> - **30 days** where a non-breaking fix is *measured available* …
> - **90 days** where the only fix is a breaking major upgrade …

Nothing enforces it. `evaluatePolicy` checks only `expiresMs <= nowMs` (`:562`), and the offline gate
checks only `Date.parse(expires) > Date.now()` (`:881-886`). Grepping the offline gate for `90`,
`horizon`, `MAX_`, `days` returns zero relevant hits.

Verified against the shipped evaluator:

```
expires 9999-12-31 -> []      (no problem reported; every other control satisfied)
```

So the single cheapest way to silence a critical advisory forever is a one-field data edit that
requires no code change, breaks no test, and turns no gate red — while still reading, to any human,
as a reasoned 30-day acceptance. That defeats the mechanism the whole design rests on
(`scripts/audit-policy.mjs:14-16`: *"a per-advisory recorded disposition … with a stated reason and
an EXPIRY — so the gate … stays quiet about the ones somebody has"*), and it is the same shape as
threat T-47-09-02 that `REQUIRED_FAIL_ON` was pinned to defend against.

This repository has already established the correct pattern for exactly this: `audit-policy.test.ts:986-1002`
asserts the prose claim *"There are currently ZERO dev-reach acceptances"* against the JSON,
with the comment *"A claim in a policy document is a liability unless something checks it."* The
30/90-day horizon is a strictly more load-bearing claim and has no such check.

**Fix:** Add the horizon as an enforced value in `scripts/audit-policy.mjs`, so the script and the
vitest gate share one definition:

```js
/**
 * The longest an acceptance may run from the day it is written. AUDIT-POLICY.md § "The expiry
 * rule" states 30 days (fix available, blocked internally) and 90 days (breaking major, reach
 * evidence). 90 is the outer bound, and it is enforced here rather than left to prose: an
 * unbounded `expires` satisfies every other control in this file while converting acceptance
 * back into the permanent silence the field exists to prevent.
 */
export const MAX_EXPIRY_DAYS = 90
```

and in the per-entry block after the `expiresMs <= nowMs` branch:

```js
      } else if (expiresMs - nowMs > MAX_EXPIRY_DAYS * 86_400_000) {
        problems.push(
          `${where} expires on ${expires}, which is more than ${MAX_EXPIRY_DAYS} days away. ` +
            `${POLICY_DOC} § "The expiry rule" caps an acceptance at 30 days (fix available) or ` +
            `90 days (breaking major with reach evidence). A distant expiry is a permanent ` +
            `silence wearing a decision's clothes.`
        )
      }
```

Then add the pair of controls this file's own convention demands: an NC case with
`expires: "9999-12-31"` asserting exactly one problem containing `more than 90 days`, plus the
complement asserting an 89-day expiry is clean. Note the shipped file is already compliant — both
live expiries (`2026-09-24`, `2026-11-23`) are within 90 days of 2026-08-25 — so this lands green.

---

## Warnings

### WR-01: `severity in counted` consults the prototype chain, bypassing the schema-change fatal

**File:** `scripts/audit-policy.mjs:352-362`

**Issue:** `counted` is built with `Object.fromEntries(...)`, so it inherits `Object.prototype`, and
`severity in counted` is `true` for any `Object.prototype` member name. The "the schema changed"
fatal at `:355-359` — whose stated job is to stop the run when npm emits a severity this gate does not
understand — does not fire, and the offending package is silently excluded from both the per-severity
reconciliation and `totalCounted`. Verified:

```
catastrophic    fatal -> a package in `vulnerabilities` reports severity "catastrophic", which …
toString        PASSED  vulnPkgs= 3
constructor     PASSED  vulnPkgs= 3
__proto__       PASSED  vulnPkgs= 3
valueOf         PASSED  vulnPkgs= 3
hasOwnProperty  PASSED  vulnPkgs= 3
```

`counted["__proto__"] += 1` is additionally a silent no-op (assigning a string to `__proto__` is
ignored), so the document reconciles cleanly. Such a package's advisories are then never tested
against `failOn` either, since `failOnSet.has("toString")` is false — they get no disposition
requirement at all. The severity values npm emits today are fixed, so this is not currently
exploitable, but this is precisely the *schema-drift detector*, and it does not detect drift into
this name space.

**Fix:** Use own-property lookup, and use it consistently with the histogram loop at `:330-338`:

```js
    if (!Object.hasOwn(counted, severity)) {
```

The same substitution is worth applying to `histogram[key]` reads — `Number.isFinite` happens to
reject the inherited function values there, so that loop is safe today, but only by accident.

### WR-02: The header misidentifies which floor catches an empty advisory set, and argues for lowering the one that does

**File:** `scripts/audit-policy.mjs:90-97`; echoed in `AUDIT-POLICY.md:392-397`

**Issue:** The comment on `MIN_ADVISORIES_PARSED` says:

> The load-bearing empty-document detector here is NOT this number: it is `MIN_PACKAGES_AUDITED`
> plus the histogram reconciliation in `assertAuditDocument` …

That is false for the case that matters most — a resolved tree where the registry (or an intercepting
proxy, or a mirror with no advisory database) returns zero advisories. Verified:

```
A. vulnerabilities {}, histogram all-zero, dependencies.total 1285
   -> fatal: "only 0 distinct advisory id(s) were parsed … the floor is 3"
```

Reconciliation passes (0 === 0) and `MIN_PACKAGES_AUDITED` passes (1285 ≥ 500). `MIN_ADVISORIES_PARSED`
is the *only* control that fires. The offline test at `audit-policy.test.ts:772-782` already knows
this (it asserts `/distinct advisory id/`), and `AUDIT-POLICY.md:392-395` restates the same
misattribution ("a self-consistent but tiny document must **fatal on `MIN_PACKAGES_AUDITED`**").

The danger is compounded because the same comment block argues the floor should be kept low and
implies it may need lowering further after remediation (`:90-95`). A future reader who lowers
`MIN_ADVISORIES_PARSED` to 0 or 1 on the strength of "it is not the load-bearing detector" removes
the only guard for this case. (`staleAllowlistProblems` currently backstops it by reporting all 39
entries as stale — but only while the allowlist is non-empty, which is explicitly the state the
project is working toward.)

**Fix:** Correct the attribution in both places:

```js
 * MIN_PACKAGES_AUDITED and the histogram reconciliation catch a TRUNCATED or DOCTORED document.
 * They do NOT catch a resolved tree for which the registry returned no advisories at all — that
 * document reconciles (0 === 0) and clears MIN_PACKAGES_AUDITED, and THIS floor is the only
 * control that fires on it (verified: fatal at "only 0 distinct advisory id(s)"). Do not lower
 * it below 3 without replacing that guard; `staleAllowlistProblems` only backstops it while the
 * allowlist is non-empty, which is the state this project is trying to leave.
```

and change `AUDIT-POLICY.md:392-395`'s second bullet to name `MIN_ADVISORIES_PARSED` for the
self-consistent-but-empty case.

### WR-03: The FLATNESS assertion is ceiling-only, in the one gate whose header forbids ceiling-only gates

**File:** `src/lib/execution/condition-evaluator.test.ts:948-959`

**Issue:** `growth = large.opsPerChar / small.opsPerChar`, asserted `toBeLessThanOrEqual(1.25)`. A
collapse on the large side passes: if a future parser switched to a native scan above some input
size, `large.opsPerChar` would be ~0, `growth` would be ~0, and the assertion passes. The counted
FLOOR (`:925-935`) only runs at `AGGREGATE_N = 2000`, which sits *between* `FLATNESS_SMALL_N = 500`
and `FLATNESS_LARGE_N = 8000`, so there is no counted floor anywhere at the large end of the span.

This is the exact failure mode the block's own header names at `:634-643`: *"a regex-backtracking
`tokenizeFieldPath` reads ZERO counted characters at every input size and therefore PASSES any
ceiling … A ceiling-only gate would have shipped green over the worse of the two."* The AST half
mitigates it (a `RegExp` construction or a `.exec` call would be flagged) but that is a different
check with different blind spots — see WR-04.

**Fix:** One line, beside the growth assertion:

```ts
      // The floor at the LARGE end. Growth alone is ceiling-only: a parser that collapsed to a
      // native scan above some input size gives growth ~= 0 and passes. AGGREGATE_N sits between
      // the two spans, so without this there is no counted floor at n = FLATNESS_LARGE_N at all.
      expect(
        large.opsPerChar,
        `ops/char collapsed to ${large.opsPerChar.toFixed(3)} at the large end of the span. ` +
          `A count at or near ZERO means the parse moved inside a native call — the ReDoS shape.`
      ).toBeGreaterThanOrEqual(MIN_COUNTED_PER_CHAR)
```

### WR-04: `FORBIDDEN_BULK_SCANNERS` is not asserted by value — 5 of its 8 entries can be deleted silently

**File:** `src/lib/execution/condition-evaluator.test.ts:1089-1098`

**Issue:** The list's own doc-comment at `:1071` says *"an emptied forbidden list is a gate that
cannot fail"*, yet nothing pins the list's contents. Tracing which entries are guarded by a fixture:

| entry | guarded by |
|---|---|
| `.exec` | `KNOWN_POSITIVE_HOISTED_REGEX` assertion at `:1331` |
| `.split` | `KNOWN_POSITIVE_INLINE_REGEX` assertions at `:1316-1317` |
| `.test` | nothing |
| `.match` | nothing |
| `.matchAll` | nothing |
| `.replace` | nothing |
| `.replaceAll` | nothing |
| `.search` | nothing |

Deleting `.match`, `.matchAll`, `.replace`, `.replaceAll` or `.search` from the array turns no test
red while removing real coverage. This is the identical self-weakening shape 47-10 found and fixed
for `FORBIDDEN_REASONS` in this same phase — `audit-policy.test.ts:323-331` asserts that list **by
value**, with the comment *"a RENAME is as loud as a DELETION"*. That lesson was not carried across
to its sibling gate.

**Fix:** Add the by-value anchor, next to the existing anti-vacuity block:

```ts
  it("names every whole-string scanner the check was written for, BY VALUE", () => {
    // Asserted by value rather than by length, so a DELETION is as loud as a RENAME. Only `.exec`
    // and `.split` are held by a KNOWN_POSITIVE fixture; the other six could be dropped silently
    // and this gate would keep reporting a clean pass over a shorter list. Same reasoning, and
    // same shape, as audit-policy.test.ts's FORBIDDEN_REASONS anchor.
    expect([...FORBIDDEN_BULK_SCANNERS].sort()).toEqual([
      ".exec", ".match", ".matchAll", ".replace", ".replaceAll", ".search", ".split", ".test",
    ])
  })
```

`GATED_FUNCTIONS` is already adequately guarded (emptying it takes the KNOWN_POSITIVE fixture
assertions red), so it needs no equivalent.

### WR-05: An allowlist entry's `package` is never reconciled against the advisory it silences

**File:** `scripts/audit-policy.mjs:523-525, 592-599`; `src/lib/__tests__/audit-policy.test.ts:954-984`

**Issue:** `evaluatePolicy` checks only that `entry.package` is a non-empty string. Matching is done
purely on `ghsa`. Verified:

```
D. audit reports GHSA-aaaa-bbbb-cccc under package "next" (critical);
   allowlist entry keys the same GHSA but names package "totally-unrelated"
   -> evaluatePolicy returns []
```

Two consequences. First, `staleAllowlistProblems` and every failure message report `entry.package`,
so a diagnosis can name the wrong package. Second — and this is the load-bearing one — the
prose/JSON cross-check at `audit-policy.test.ts:954-984`, which compares the `reach` and `expires` in
the `### \`pkg\`` heading against the JSON, is keyed on that same **self-declared, unverified**
field. An entry whose `package` says `postcss` (reach `build`, the reach a reader discounts fastest)
while its GHSA actually belongs to `next` (reach `runtime`) satisfies the cross-check perfectly and
misrepresents the risk to every human reader.

**Fix:** Reconcile the field against the document in the offender loop:

```js
    const entry = allowed.get(row.ghsa)
    if (entry && entry.package !== row.package) {
      problems.push(
        `${POLICY_FILE} allowlists ${row.ghsa} under package ${JSON.stringify(entry.package)}, ` +
          `but npm reports it against ${JSON.stringify(row.package)}. The prose cross-reference ` +
          `in ${POLICY_DOC} keys reach and expiry on the entry's package name, so a mismatch ` +
          `means the document describes a different risk from the one being suppressed.`
      )
    }
```

Note this is a live-audit check (like `staleAllowlistProblems`), so it belongs in the script half of
the split, not in the offline gate.

### WR-06: An `import()` inside an object-literal or class method is invisible to both the hit list and the boundary reporter

**File:** `src/lib/__tests__/suite-hook-hygiene.test.ts:534-546, 624-626, 683-692`

**Issue:** `declaredFunctionName` recognises only `function name(…)` and
`const name = (…) => …` / `= function …`. An `import()` inside an object-literal method or a class
method at module scope therefore has `ctx === undefined` when it is visited, so the guard at `:643`
(`isDynamicImportCall(node) && ctx !== undefined`) drops it entirely — it does not become a hit, and
it does not appear in `unreachableHelperImports` either. Verified with the shipped `scanSource`:

```
MISSED  1. object-literal method a test calls   | unreachable: 0
MISSED  2. class method a test calls            | unreachable: 0
MISSED  3. helper aliased through a const       | unreachable: 1   (visible, at least)
FLAGGED 4-7. optional call, Promise.all, nested arrow, hook-via-helper
```

Not *following* `obj.method()` calls is documented at `:70-71`. What is not documented, and what
breaks a stated control, is that these imports never appear in the `ScanResult` at all. Section 5
(`:1459-1477`) exists specifically to prove *"the stated boundary must be OBSERVABLE, not merely
absent from the hit list — otherwise 'no hits' cannot be told apart from 'the helper pass broke'"*.
For this shape it is neither a hit nor observable, so the boundary control does not cover it, and the
shape is a free evasion of the gate for anyone who hits a red.

**Fix:** Record method-shaped functions as helpers too, so they at least land in
`unreachableHelperImports`:

```ts
function declaredFunctionName(node: ts.Node): string | null {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text
  // Object-literal and class methods, so an import() inside one is REPORTED (as unreachable, if
  // the bare-identifier call graph cannot reach it) rather than dropped from the ScanResult
  // entirely. Not following `obj.method()` CALLS is the stated boundary; making the import
  // invisible is not, and it defeats section 5's observability control.
  if ((ts.isMethodDeclaration(node) || ts.isPropertyAssignment(node)) && ts.isIdentifier(node.name)) {
    const value = ts.isMethodDeclaration(node) ? node : node.initializer
    if (value && (ts.isMethodDeclaration(node) || ts.isArrowFunction(value) || ts.isFunctionExpression(value))) {
      return node.name.text
    }
  }
  …
```

and extend the header's stated-limits list at `:70-71` to say so explicitly. Note this may add
entries to `unreachableHelperImports` for existing files; if so, the section-5 assertion at `:1474`
needs re-anchoring in the same commit — deliberately, with the new list written down.

### WR-07: AUDIT-POLICY.md presents an end-to-end control as delivered that 47-12 records as NOT DELIVERED

**File:** `AUDIT-POLICY.md:383-403`

**Issue:** The section opens *"A gate nobody has watched go red is a stated intention, not a policy.
Both halves have been broken on purpose, and the verbatim output is recorded in … 47-09-SUMMARY.md"*
and then lists three bullets, the third of which is:

> **The end-to-end control**, which belongs to CI rather than to this file: add a knowingly
> vulnerable dependency (`minimist@1.2.5` …), watch the required `ci` check go red, revert, watch it
> go green.

`47-12-SUMMARY.md:60` states plainly: **"Control E's real-runner half is NOT DELIVERED."** and
`:398` explains why (pushing is outward-facing and unauthorised). The planning artifact is honest;
the shipped, human-facing policy document is not. A reader of `AUDIT-POLICY.md` will conclude the
required `ci` check has been observed going red on a real advisory. It has not — only the local
`green → red → green` on the working tree has (`47-12-SUMMARY.md:159`).

By this repository's own standard (`audit-policy.test.ts:986-995`: *"A claim in a policy document is
a liability unless something checks it"*), an unverified proof claim in a security policy is the
worst kind of stale prose.

**Fix:** Mark the bullet, and narrow the section preamble:

```markdown
- **The end-to-end control — LOCAL HALF ONLY, the runner half is NOT DELIVERED.** On the working
  tree the evaluator was driven green (exit 0) -> red (exit 1, one FATAL naming
  GHSA-xvch-5gv4-984h) -> green, recorded verbatim in 47-12-SUMMARY.md § "Control E, local half".
  The runner half — add `minimist@1.2.5`, push, watch the required `ci` check go red and the merge
  block engage, revert, watch it go green — requires an outward-facing push and has NOT been run.
  Until it is, this document does not claim the required check has been observed red.
```

and change the preamble's "Both halves have been broken on purpose" to name which halves.

### WR-08: `MIN_NON_TEST_PERFORMANCE_NOW = 2` sits at its measurement and couples a suite gate to an unrelated production file

**File:** `src/lib/__tests__/suite-timing-hygiene.test.ts:298-303, 1113-1123`

**Issue:** The floor equals the measurement exactly (2), so any change to
`src/app/api/health/route.ts` that reduces the number of `performance.now()` call sites — extracting
`probeDb` to a helper module, computing latency from a single reading plus a monotonic source, or
dropping the latency field — turns this gate red. The failure message leads with *"the detector's
performance.now branch broke"*, which is the wrong diagnosis in every one of those cases.

47-13 calls this false-RED brittleness rather than vacuity. **I agree with that judgement** — the
control does test something real, and it is not satisfiable by an empty parse. But two things make it
weaker than it looks:

1. It is the *second* proof of the `performance.now` branch. KNOWN_POSITIVE fixture (iv) at `:758-775`
   already proves that branch, deterministically, with no external coupling. So the marginal
   information here is "a real file still happens to use this API", which is not a property of the
   suite-hygiene gate.
2. Its message will be read, under time pressure, by someone whose actual change was to the health
   route — and the cheapest way to make it green is to lower the constant, which is exactly the
   "fixed by lowering a number whose purpose they cannot re-derive" failure the file warns about at
   `:253-255` for `MIN_TEST_FILES`.

**Recommendation: keep the control, but re-shape it so it floors the DETECTOR rather than one file's
implementation.** Concretely, discover the subject instead of hard-coding it:

```ts
/**
 * At least this many NON-TEST source files under src/ must still read `performance.now`, and the
 * detector must still find at least one call site in each. Floored at ONE FILE rather than at two
 * call sites in one named file: the property being proved is "the performance.now branch works
 * against real source", which does not depend on `src/app/api/health/route.ts` keeping exactly two
 * probes. Measured 2026-08-25: 1 file (the health route), 2 call sites.
 */
const MIN_NON_TEST_PERFORMANCE_NOW_FILES = 1
```

If the discovery walk is judged too expensive, the minimum acceptable change is to lower the constant
to 1 and rewrite the message to lead with *"the health route changed"* rather than *"the detector
broke"*. Leaving it at 2 with the current message is the option I would not take.

### WR-09: `matches_regex` compiles and runs a user-supplied regex unbounded, on a real request path

**File:** `src/lib/execution/condition-evaluator.ts:164-171`

**Issue:**

```ts
    case "matches_regex": {
      try {
        const regex = new RegExp(String(compareValue))
        return regex.test(String(fieldValue))
      } catch {
        return false
      }
    }
```

`compareValue` is workflow-condition configuration and `fieldValue` is trigger data. There is no
length bound on either, no step/timeout bound on the match, and Node has no regex interrupt — a
pattern such as `(a+)+$` against a long non-matching subject wedges the event loop for the entire
process, taking every other request with it. The `catch` covers only a malformed pattern, not a
catastrophic one.

This is pre-existing (Phase 47 did not touch these lines) but it is squarely in scope for this review
for two reasons. First, `condition-evaluator.ts` is the one file in this phase's diff on a real
request path and the review brief asks about it specifically. Second, it is a direct contradiction
of the doc-comment 120 lines above it (`:36-38`): *"Implemented as a single forward scan with no
backtracking and no regex, so cost is linear in path length even for adversarial input (T-34-20)"* —
the field-path parser was hardened against exactly this class while the operator immediately below it
was left with an unbounded engine. `condition-evaluator.test.ts:1348-1359` even uses this call site
as a *live positive control* for its regex detector, which means the phase looked directly at it.

**Fix:** Bound both inputs and cap the pattern's complexity, or move the match off the request path:

```ts
    case "matches_regex": {
      // T-34-20's sibling. Node cannot interrupt a running RegExp, so the only defences are
      // bounding the inputs and refusing a pattern shaped like a backtracking bomb. `u` also
      // rejects a number of legacy escapes that widen the search space.
      const pattern = String(compareValue)
      const subject = String(fieldValue)
      if (pattern.length > MAX_REGEX_PATTERN_LENGTH) return false
      if (subject.length > MAX_REGEX_SUBJECT_LENGTH) return false
      try {
        return new RegExp(pattern, "u").test(subject)
      } catch {
        return false
      }
    }
```

with both constants declared beside `FORBIDDEN_SEGMENTS` and a written measurement. If unbounded
patterns are a required product capability, the correct answer is the same one this codebase already
uses for formulas: run the match inside the QuickJS sandbox under its `timeoutMs`. Either way, this
should be logged as a backlog item rather than silently carried; it is the only remaining unbounded
engine on the execution path.

### WR-10: The counting facade's `indexOf` re-implementation only handles single-character needles

**File:** `src/lib/execution/condition-evaluator.test.ts:695-704`

**Issue:**

```ts
            if (key === "indexOf") {
              return (needle: string, from = 0) => {
                ops.calls++
                for (let k = Math.max(0, from); k < raw.length; k++) {
                  ops.chars++
                  if (raw[k] === needle) return k
                }
                return -1
              }
            }
```

`raw[k] === needle` compares one character. A multi-character needle always returns `-1`. It also
diverges from the standard contract for `from > raw.length` (returns `-1` where the spec returns
`raw.length` for an empty needle) and for a negative `from` handled by clamping rather than the
spec's coercion.

Today `tokenizeFieldPath` only searches for a single quote character, so the facade is correct in
practice. But this is a silent trapdoor: if a future parser change searched for `"]"` preceded by a
quote, or any two-character token, the facade would return `-1`, every parse through the counted seam
would return `null` early, and the counted character total would collapse — surfacing as a red on the
FLOOR with a message that blames the parser rather than the instrument. The facade is unit-tested at
`:877-880`, but only with a one-character needle.

**Fix:** Implement the span honestly and add the missing self-test case:

```ts
            if (key === "indexOf") {
              return (needle: string, from = 0) => {
                ops.calls++
                const start = Math.min(Math.max(0, from), raw.length)
                for (let k = start; k + needle.length <= raw.length; k++) {
                  ops.chars += needle.length
                  if (raw.startsWith(needle, k)) return k
                }
                return -1
              }
            }
```

and in the facade self-test: `expect(makeCountingPath("abcdefghij").path.indexOf("hij")).toBe(7)`.

### WR-11: "walks the corpus exactly once" is asserted by grepping one source line, while the file re-parses ~13 files

**File:** `src/lib/__tests__/suite-hook-hygiene.test.ts:1544-1558`

**Issue:** The test's name and its doc-comment claim a cost property — *"a second corpus walk costs
~850 ms per gate over ~320 000 AST nodes. This keeps a future fifth scope sharing the one parse
instead of starting a second sweep."* What it actually asserts is that three specific source lines
each occur exactly once, matched with anchored regexes:

```ts
    const corpusWalks = raw.split("\n").filter((line) => /^const CORPUS = TEST_FILES\.map\(/.test(line))
    expect(corpusWalks.length, "exactly one corpus walk is expected").toBe(1)
```

Meanwhile the file calls `scanFile(...)` a further ~13 times outside `CORPUS` — at `:1285`, `:1307`,
`:1318`, `:1342`, `:1357`, `:1379`, `:1387`, `:1442` and `:1513`, several inside `it.each` blocks. A
new gate could add an arbitrary number of those and this assertion would stay green; conversely a
`prettier` change that put a semicolon on that line, or renamed `CORPUS`, takes it red for no reason.
It is a text-shaped proxy standing in for a structural claim — the same substitution this file
rejects, at length, in its own "WHY THIS GATE PARSES AND NEVER GREPS" section (`:76-95`).

**Fix:** Either measure the thing (count `scanSource` invocations with a module-scope counter and
assert a bound), or — cheaper and honest — rename the test and narrow the claim:

```ts
  it("declares exactly one CORPUS constant and one file-system walk", () => {
    // NOT a cost assertion: the carve-out controls below re-parse ~13 individual files by design,
    // which is cheap. What this pins is that there is ONE shared corpus constant and ONE walk, so
    // a fifth scope extends them rather than declaring a second pair.
```

### WR-12: `Date.parse` silently rolls over impossible calendar dates in `expires`

**File:** `scripts/audit-policy.mjs:553-561`

**Issue:** `EXPIRES_PATTERN` accepts any `\d{4}-\d{2}-\d{2}`, and `Date.parse` is then trusted to
reject the impossible ones. It rejects month `00` and `13` but rolls over an out-of-range day:

```
expires 2026-02-31 -> EXPIRED on 2026-02-31   (parsed as 2026-03-03)
expires 2026-13-01 -> unparseable
expires 2026-00-10 -> unparseable
```

So `2027-02-31` is silently a 2027-03-03 expiry — three days beyond what any reader believes it
says, and the failure message quotes the impossible date back verbatim. The comment at `:171-174`
claims each malformed shape *"would each parse or fail in a different way"*, which does not describe
the rollover.

Low impact on its own; it matters because `expires` is the one field CR-02 shows is already
under-defended, and because a policy field a reader cannot trust at a glance is the failure `expires`
exists to prevent.

**Fix:** Round-trip the parse:

```js
      const expiresMs = Date.parse(`${expires}T00:00:00Z`)
      if (!Number.isFinite(expiresMs) || new Date(expiresMs).toISOString().slice(0, 10) !== expires) {
        problems.push(
          `${where} has an impossible or unparseable \`expires\`: ${JSON.stringify(expires)}. ` +
            `Date.parse ROLLS OVER an out-of-range day (2026-02-31 becomes 2026-03-03), so the ` +
            `parse is round-tripped rather than trusted.`
        )
      } else if (expiresMs <= nowMs) {
```

and add the case to `audit-policy.test.ts`'s NC-D table.

---

## Info

### IN-01: `MIN_ALLOWLIST_ENTRIES = 1` is two orders below its measurement of 39

**File:** `src/lib/__tests__/audit-policy.test.ts:116-129`

The comment records a measurement of 39 and every other floor in this phase is set "below the
measurement" by a small factor; this one is set at 1. Deleting 38 of the 39 entries would shrink
every per-entry `it.each` block from 39 registered tests to 1 and trip nothing. The direction is
safe — deleting entries makes CI stricter, not laxer, because the advisories become undispositioned —
so this is a reporting-fidelity issue rather than a hole. If it stays at 1, the comment should say
that the low floor is deliberate *because the failure direction is safe*, rather than quoting a
measurement it is nowhere near.

### IN-02: `date +%s%N` in the repeatability harness is GNU-only

**File:** `scripts/suite-repeatability.sh:120, 123`

BSD/macOS `date` does not implement `%N`; the value becomes a literal `N` and the arithmetic at
`:125` fails under `set -e`. Everything else in the script is portable and correctly quoted (no
unquoted expansions, no `eval`, `set -euo pipefail` present, `FAILED_RUNS` mutated in the parent
shell not a subshell). Worth one line in the header stating the Linux-runner assumption, or a
`command -v gdate` fallback.

### IN-03: `src/lib/log.ts:45` has the same prototype-chain `in` defect as WR-01

**File:** `src/lib/log.ts:43-47`

```ts
  return ORDER[(raw as Level) in ORDER ? (raw as Level) : "info"]
```

`LOG_LEVEL=toString` (or `constructor`, `valueOf`, `hasOwnProperty`) makes `threshold()` return a
Function; `ORDER[level] < threshold()` is then always `false`, so **every** level including `debug`
is emitted — the opposite of the documented *"An unrecognised value falls back to `info`"*. Fails
open (verbose) rather than silent, so impact is low, and the file is outside Phase 47's diff. Noted
because it is the same one-token root cause as WR-01 and the fix is identical:
`Object.hasOwn(ORDER, raw)`.

---

## Verification notes

- All executable claims above were produced by importing or extracting the **shipped** code, never a
  re-implementation: `scripts/audit-policy.mjs` was imported directly; `scanSource` from both AST
  gates was extracted verbatim (module prologue only, up to the first `describe(`) into `/tmp`.
- No repository file was modified. `git diff --exit-code` and `git diff --cached --exit-code` both
  report clean; the `/tmp/probe` scratch directory was removed.
- No dependency was installed, no network call was made beyond what already-installed modules do,
  nothing was pushed, and no GitHub object was created.

---

## Review-fix disposition — 2026-08-25

16 of the 17 findings fixed, one declined. `887af25..a6fa495`, one atomic commit per finding, every
gate touched observed RED on purpose with the verbatim output in its commit message. Nothing pushed;
no GitHub object created. `overrides: { "vite": "^7.0.0" }` untouched.

| Finding | Disposition | Commit |
|---|---|---|
| **CR-01** | **FIXED.** All seven missed shapes now flagged; each a KNOWN_POSITIVE fixture (vii)-(xiii). Corpus re-sweep clean at 178 files / 8348 `expect()` calls / 36 `Date.now` sites / 0 hits. The re-triage surfaced two live assertions (`get-activities-where.test.ts:223`, `view-filters.test.ts:367`); both read, both genuine false positives (`before - 1_000` is a PAST timestamp, the mirror of the existing addition rule, and both bounds get LOOSER under load), so the RULE was corrected and pinned as KNOWN_NEGATIVE (g)/(h) with a complement proving a named right operand is still a delta. No path exclusion added. | `887af25` |
| **CR-02** | **FIXED.** `MAX_EXPIRY_DAYS = 90` enforced in `evaluatePolicy` and asserted per shipped entry offline, plus a boundary walk (89.5 d accepted / 90.5 d rejected) so a rule keyed on one magic date fails. No shipped entry violates it (furthest: `GHSA-c7w3-x93f-qmm8` at 89.28 days). Real signal surfaced: `fixtureEntry`'s own default expiry was 128 days out — the VALID fixture every negative control breaks in one field was itself over the documented bound. | `71e5c7b` |
| **WR-01** | **FIXED.** Null-prototype map + `Object.hasOwn`; all five inherited names now fatal. Pinned by an `it.each`. | `4792d65` |
| **WR-02** | **FIXED.** Attribution corrected in `audit-policy.mjs` and `AUDIT-POLICY.md`; `staleAllowlistProblems`'s backstop named along with its limit. | `38bda6b` |
| **WR-03** | **FIXED.** Floor added at the large end. Falsified by inducing the collapse: growth was 0.148 and PASSED the ceiling in the same run the floor caught it. | `228ce26` |
| **WR-04** | **FIXED.** By-value anchor. Pre-fix state measured: deleting two entries turned NO test red and left the count at 91/91. | `43c6605` |
| **WR-05** | **FIXED.** Package reconciled against the live audit row in the offender loop, with a complement. Shipped file clean: 39 of 39 entries applied. | `a79c148` |
| **WR-06** | **FIXED.** Method and property-function forms recognised, so the import lands in `unreachableHelperImports` instead of vanishing. Corpus unchanged (still exactly one unreachable import), so section 5 needed no re-anchoring. The stated boundary — `obj.method()` calls are not edges — is unchanged and now asserted alongside. | `c543097` |
| **WR-07** | **FIXED.** Preamble names which halves were broken; the bullet is marked LOCAL HALF ONLY with `origin/master` quoted. **Re-verified at fix time: `origin/master` is still `a58b9e1`, 121 commits unpushed — the runner control is still NOT DELIVERED.** Backed by a required token so the claim is checked, deletable only in the commit that records the runner observation. | `70fc283` |
| **WR-08** | **FIXED**, by the reviewer's preferred form rather than the minimum: the subject is DISCOVERED (525 non-test files read in 24 ms) and floored at ONE FILE. Falsified in three directions — the health-route refactor that used to false-RED now stays green, "no source reads that clock" and "the detector broke" produce different messages, and each is accurate. | `442ba44` |
| **WR-09** | **DECLINED — recorded as `SEC-47-B` in `.planning/BACKLOG.md` with the full reasoning.** Every remedy the review offers is a silent product behaviour change on a user-facing feature: a length bound turns a match into `false` above the bound and changes workflow ROUTING with no symptom but the other branch being taken; the `u` flag rejects legacy escapes and would break whatever patterns are configured in the live database today. The right answer is almost certainly the QuickJS sandbox under its `timeoutMs`, which bounds cost without changing meaning — a plan with its own verification, not a review-fix edit. The backlog entry names the measurement a follow-up must take first. | `a6fa495` |
| **WR-10** | **FIXED.** Honest span; facade self-test extended to the multi-character hit (24 counted), the miss, an offset hit, and a `from` past the last start. | `7963073` |
| **WR-11** | **FIXED** by the cheaper of the two options the review offered: the test is renamed and the claim narrowed to what the three regexes carry. Measured 12 `scanFile(` call sites against 1 `CORPUS` declaration; the cost model stays recorded as the reason, not as the thing measured. | `fdf3c21` |
| **WR-12** | **FIXED.** Parse round-tripped; all four impossible forms reported. NC-D case (g), table floor moved to seven. | `fdf2f11` |
| **IN-01** | **FIXED** as the review suggested: the comment now says the low floor is deliberate *because the failure direction is safe*, and names what the floor actually defends (the zero case). | `cbb318b` |
| **IN-02** | **FIXED.** The GNU-coreutils assumption is stated in the header, with the `gdate` route and a warning against dropping the nanosecond precision. | `cbb318b` |
| **IN-03** | **FIXED.** Same one-token fix as WR-01, in production code, pinned by an `it.each` over the five names. | `746e83a` |

### Post-fix gate state

```
npm test              5237 passed | 32 skipped (5269), 172 files    (baseline 5164/32; +73, reconciled exactly)
npm test (rsc)        8 passed (8)
npm run typecheck     exit 0
npm run lint          0 errors, 124 warnings
npm run security:audit         exit 0 — 39 of 39 allowlist entries applied
npm run db:check-migrations    exit 0
git diff --exit-code  clean; compose stack up (app / postgres / mailhog running)
```

The +73 reconciles per file: audit-policy 280 → 331, suite-timing-hygiene 46 → 59,
suite-hook-hygiene 76 → 78, condition-evaluator 90 → 92, log 24 → 29.

---

_Reviewed: 2026-08-25_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
