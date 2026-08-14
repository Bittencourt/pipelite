---
phase: 34-formula-reactivity
plan: 12
subsystem: workflows
tags: [workflows, conditions, field-path, custom-fields, parser, security]

# Dependency graph
requires:
  - phase: 34-formula-reactivity (plan 05)
    provides: "normalizeFormulaValues — the trigger envelope hands conditions a scalar under customFields / custom_fields"
provides:
  - "resolveFieldPath accepts bracket-quoted segments, so a workflow condition can address any custom field name"
  - "Prototype-chain keys (__proto__, constructor, prototype) are unreachable through any field path"
  - "Malformed bracket syntax returns undefined rather than throwing, extending the existing contract"
affects: [34-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single forward scan with indexOf for quoted content — no regex over an admin-authored path string (ReDoS-free by construction)"
    - "Denylist applied at tokenisation, keeping the object walk byte-identical to the reviewed original"

key-files:
  created: []
  modified:
    - src/lib/execution/condition-evaluator.ts
    - src/lib/execution/condition-evaluator.test.ts

key-decisions:
  - "Grammar `path := chunk (\".\" chunk)*`, `chunk := name? bracket*` — a bracket-free chunk emits its name verbatim even when empty, which makes dot-path tokenisation bit-for-bit identical to the previous split(\".\")"
  - "Prototype keys are rejected during tokenisation rather than by adding a hasOwnProperty check to the walk — this satisfies T-34-21 while keeping the shared walk loop untouched for interpolate.ts and delay-resolver.ts"
  - "An empty quoted name (customFields[\"\"]) is treated as malformed, like the empty bracket customFields[]"
  - "Bracket parsing uses indexOf for the closing quote instead of a character-accumulation loop — linear and allocation-light on adversarial input"

requirements-completed: [FORMULA-01]

# Metrics
duration: 4min
completed: 2026-08-14
---

# Phase 34 Plan 12: Workflow Field-Path Addressability Summary

**`resolveFieldPath` now accepts bracket-quoted segments, so a workflow condition can name the 90% of custom fields whose names contain spaces or punctuation — closing the gap that left SC-3 mechanically passing but unusable on the real dataset.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-08-14T22:43:52Z
- **Completed:** 2026-08-14T22:48:01Z
- **Tasks:** 2 (2 commits — RED then GREEN)
- **Files modified:** 2 (0 created, 2 modified)

## Accomplishments

- **The addressability gap is closed.** `trigger.data.customFields["Código Mãe"]` resolves. So do `['CNPJ / CPF']` (single quotes), `["UUID UC (TYR Core)"]` (parentheses), `["Tem solução de solar?"]` (question mark plus non-ASCII), and `["E-mail de Contato 1"]`. Measured against the live database, 152 of 169 active definitions have names a dot-only path could not express; every one of them is now reachable.
- **A literal dot inside a name resolves correctly.** `customFields["Índice T.U.S.D."]` returns `0.42`, where the dot path `customFields.Índice T.U.S.D.` mis-splits into four segments and yields `undefined`. Both halves are asserted in the same test so the contrast is pinned, not implied.
- **Mixed and consecutive notation work in either order** — `customFields["Dados Extras"].id`, `trigger["data"]["customFields"]["Consumo Médio em MWh"]`, and a bracket segment at the very root (`["trigger"]["type"]`).
- **Non-regression is asserted, not assumed.** `resolveFieldPath` is imported by three consumers; a regression would break all three. Every pre-existing dot-path shape (nested, node output, whole-object, missing key, null intermediate, primitive traversal, empty/non-string path, and the empty-segment cases `trigger..type` and `trigger.type.`) has an explicit assertion. `delay-resolver.test.ts` (12 tests) and `interpolate.test.ts` (10 tests) pass unchanged.
- **T-34-21 mitigated with a test.** `__proto__`, `constructor` and `prototype` are rejected during tokenisation, in both dot and bracket spelling. This is a genuine tightening: before this plan, `trigger.data.__proto__` returned `Object.prototype` and `trigger.data.constructor` returned the `Object` function.
- **T-34-20 mitigated by construction and by measurement.** The parser is a single forward scan with `indexOf` for the closing quote — no regex touches the path string at all. A test drives four pathological inputs (20,000 chained brackets, a 200,000-character unterminated bracket, 50,000 chained dot segments, 50,000 consecutive quotes) and asserts the whole battery completes in under 100 ms.
- Full suite: **44 files, 618 passed / 4 skipped**, up from the 582/4 baseline. The delta is exactly the 36 tests added; no existing test changed behaviour.

## Task Commits

1. **Task 1 RED — pin the gap and the contract** — `5ba9ef8` (test) — 12 failing of 69, every failure a value/undefined mismatch
2. **Task 2 GREEN — parse bracket segments** — `22f7b83` (feat) — 69 passing

## Files Created/Modified

- `src/lib/execution/condition-evaluator.ts` — added `FORBIDDEN_SEGMENTS` and `tokenizeFieldPath`; `resolveFieldPath` calls the tokeniser instead of `path.split(".")` and returns `undefined` when it reports malformed input. The diff removes exactly 6 lines: 5 doc-comment lines and the `split(".")` call. The walk loop and its `current == null || typeof current !== "object"` guard are byte-identical; `evaluateOperator`, `evaluateGroup` and `evaluateCondition` are untouched.
- `src/lib/execution/condition-evaluator.test.ts` — **append-only** (`git diff -U0` shows 0 removed lines), 36 tests across 5 new `describe` blocks: bracket notation, dot-notation non-regression, malformed paths, prototype keys, and linear-parse timing.

## Decisions Made

- **The grammar guarantees dot-path identity rather than merely testing for it.** `chunk := name? bracket*`, and a chunk that produced no bracket segment pushes its name *verbatim, including the empty string*. That single rule is what makes `"a."` → `["a", ""]` and `"a..b"` → `["a", "", "b"]` come out exactly as `split(".")` produced them. The obvious alternative — skipping empty names — would have silently changed `resolveFieldPath(ctx, "trigger.type.")` from `undefined` to `"crm_event"`, a behaviour change in a shared primitive that no test would have caught. Both cases are now pinned explicitly.
- **Prototype keys are blocked in the tokeniser, not in the walk.** The plan instructed keeping the walk byte-identical, and the threat register required prototype keys to be unresolvable. A denylist over the produced segments satisfies both. The alternative — an `Object.prototype.hasOwnProperty.call` guard in the walk — would have been a broader change to a loop shared by `interpolate.ts` and `delay-resolver.ts`, with a real chance of altering array (`length`, index) or inherited-property resolution for those callers.
- **No regex anywhere in the parser.** `evaluateOperator`'s `new RegExp` (the `matches_regex` operator) is pre-existing and operates on the comparison value, not the path. The tokeniser uses only character comparison, `indexOf` and `slice`.
- **`customFields[""]` is malformed, not a lookup of the empty-string key.** An empty field name cannot exist in the definitions table, and the previous behaviour for an unexpressible name was `undefined`, so this keeps the failure mode uniform with `customFields[]`.
- **Trailing junk after a closing bracket is rejected** (`customFields["a"]junk` → `undefined`) rather than silently ignored, so a typo in an admin-authored path surfaces as a non-matching condition instead of a partially-honoured path.

## Deviations from Plan

None — plan executed as written.

One judgement call inside the plan's stated bounds: the plan listed the required test cases but not the pathological-input timing test. It was added because T-34-20's acceptance criterion ("no regex with nested quantifiers") is a code-review assertion that nothing enforces at runtime; the timing test converts it into an executable guard that would fail if someone later swapped the scanner for a regex.

## Behaviour Change Operators Must Know (T-34-23)

**Making previously-unreachable fields reachable is a behaviour change, not purely an addition.** Two specific effects:

1. **A dormant condition may start firing.** Any existing workflow whose condition names a punctuated custom field resolved `undefined` before this change, so `equals`/`contains`/`greater_than` were always false and `is_empty` was always true — the workflow silently took the false branch on every run. Such a condition written in bracket form now resolves the real value and may take the true branch, sending emails, calling webhooks or writing CRM records that previously never happened. **Note the practical bound:** this only affects paths already written in bracket syntax; a path written in dot syntax against a punctuated name still resolves `undefined` and is unchanged. Live risk is minimal today — 0 of 169 definitions are type `formula`, and bracket syntax was previously non-functional so no operator had reason to author it.
2. **`__proto__` and `constructor` no longer resolve.** A dot path ending in either previously returned a live JavaScript object; it now returns `undefined`. That flips `is_empty` from false to true and `is_not_empty` from true to false for such a path. No legitimate workflow can depend on this — the resolved value was `[object Object]` / `[Function Object]` under any comparison — but it is recorded here for completeness.

The same two effects apply to `{{...}}` interpolation in action nodes and to `field`-mode delay resolution, which share this primitive. For delays specifically, a `field` path that previously resolved `undefined` threw `Delay field path '...' not found in execution context`; if written in bracket form it may now resolve a real date and schedule a resume instead.

## Known Limitations

- **Bracket syntax must be typed by hand.** The workflow condition builder UI offers no field picker that emits bracket paths, so an operator has to know the syntax and the exact field name, including accents. Making the UI generate the correct path for a selected definition is a natural follow-up and is not in this plan's scope (its `files_modified` is the evaluator and its test only).
- **Escaping is not supported inside brackets.** A field name containing the same quote character used to delimit it (`Field "X"` with double quotes) cannot be expressed — the parser stops at the first matching quote. The other quote style is a workaround (`['Field "X"']`); a name containing *both* quote characters remains unaddressable. No such name exists among the 169 live definitions.

## Known Stubs

None. The parser is fully implemented and wired; no placeholder, mock or hardcoded value was introduced.

## Threat Flags

None. No new network endpoint, auth path, file access pattern or schema change. The two threats this plan was required to mitigate (T-34-20 ReDoS, T-34-21 prototype pollution) are both now asserted by test rather than only by review, and T-34-23 is documented above as the register required.

## TDD Gate Compliance

Both gates present and correctly ordered: `test(34-12)` at `5ba9ef8` (12 failing, all value/undefined mismatches — no `TypeError`, no module-resolution error, confirming the tests fail because the path mis-splits rather than because of a wiring fault), then `feat(34-12)` at `22f7b83`. No REFACTOR commit — the implementation needed no cleanup pass.

## Verification

| Gate | Result |
|---|---|
| `npx vitest run src/lib/execution/condition-evaluator.test.ts` | exit 0 — 69 passed (was 33) |
| `npx vitest run src/lib/execution/delay-resolver.test.ts src/lib/execution/actions/__tests__/interpolate.test.ts` | exit 0 — 22 passed, siblings unaffected |
| `npm test` | exit 0 — **44 files, 618 passed / 4 skipped** (baseline 44 / 582 / 4; delta exactly the 36 added) |
| `npx tsc --noEmit` | exit 0 |
| `npx eslint` | 0 errors, 128 warnings — identical to baseline |
| `git diff -U0` on the test file | 0 removed lines — append-only |
| `git diff -U0` on the implementation | 6 removed lines: 5 doc-comment, 1 `split(".")`; `evaluateOperator` untouched |
| `git diff --name-only` vs base | exactly the two `files_modified`, nothing else |
| Regex over the path string | none — parser uses character comparison, `indexOf` and `slice` only |

## User Setup Required

None — no dependency, no migration, no environment variable, no external service. Zero packages installed.

## Next Phase Readiness

- SC-3 is now genuinely usable rather than only mechanically satisfied: plan 34-05 made the formula *value* arrive as a scalar, and this plan makes the field *nameable*. Together they close the reader half of SC-3 for real field names.
- Plan 34-11 should document the bracket syntax in operator-facing terms and carry forward the T-34-23 behaviour-change note above.
- A field-picker that emits bracket paths in the condition builder UI is the natural follow-up; worth a backlog item.
- No blockers.

## Self-Check: PASSED

Both `files_modified` present on disk and modified; both task commits (`5ba9ef8`, `22f7b83`) resolve in `git log`; `git status` clean; `git diff --name-only` against base commit `0682ca5` lists exactly the two planned files.

---
*Phase: 34-formula-reactivity*
*Completed: 2026-08-14*
