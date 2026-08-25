---
phase: 34-formula-reactivity
plan: 05
subsystem: api
tags: [papaparse, csv, export, workflows, triggers, formula, jsonb]

# Dependency graph
requires:
  - phase: 34-formula-reactivity (plan 03)
    provides: "DB-free wrapper primitives in src/lib/formula-helpers.ts (isFormulaWrapper, unwrapFormulaValue, formatFormulaValueForText)"
provides:
  - "CSV / JSON / Pipedrive exports emit the formula scalar (or #ERROR: msg), never [object Object]"
  - "Workflow trigger envelope normalises formula wrappers to scalars under both customFields and custom_fields"
  - "First test file for the src/lib/export module, pinning the measured papaparse 5.5.3 regression"
affects: [34-06, 34-07, 34-08, 34-09, 34-10, 34-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reader-side unwrapping: the stored JSONB wrapper is never flattened at the write side; each reader reduces it at its own boundary"
    - "Copy-on-normalise for shared crmBus payloads — never mutate an object other subscribers observe"

key-files:
  created:
    - src/lib/export/formatters.test.ts
  modified:
    - src/lib/export/formatters.ts
    - src/lib/export/pipedrive.ts
    - src/lib/triggers/matcher.ts
    - src/lib/triggers/matcher.test.ts
    - src/lib/execution/condition-evaluator.test.ts

key-decisions:
  - "Text readers (CSV/JSON/Pipedrive) use formatFormulaValueForText so an errored formula shows #ERROR: msg instead of an empty-looking cell"
  - "The workflow trigger envelope uses unwrapFormulaValue (raw scalar / null), NOT formatFormulaValueForText — a condition must compare against the real value, and #ERROR: msg would make numeric comparisons behave unpredictably"
  - "The webhook payload deliberately keeps the full wrapper (D-17): it is structured JSON and unwrapping would discard the error signal; the normaliser therefore returns a copy and never mutates payload.data"
  - "pipedrive.ts unwraps only its custom_ branch; formatDateForPipedrive's String() is native-field formatting and was left untouched"
  - "condition-evaluator.ts was deliberately not changed — RESEARCH option (b), normalise at the envelope, over option (a), require a .value path hop"

patterns-established:
  - "Wrapper-aware reader boundary: import from @/lib/formula-helpers rather than re-implementing 'formula' in value"
  - "Regression tests assert on the real Papa.unparse output string, not on the intermediate flattened object"

requirements-completed: [FORMULA-01]

# Metrics
duration: 18min
completed: 2026-08-14
---

# Phase 34 Plan 05: Formula Reader Fixes Summary

**CSV/JSON/Pipedrive exports and the workflow trigger envelope now unwrap the `{formula:true,value,error}` JSONB wrapper, eliminating the measured `[object Object]` cell and the silently-never-firing workflow condition.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-08-14T18:20:00Z
- **Completed:** 2026-08-14T18:38:00Z
- **Tasks:** 2 (4 commits — RED/GREEN per task)
- **Files modified:** 6 (1 created, 5 modified)

## Accomplishments

- **SC-2 / D-16 closed.** `flattenCustomFields` routes every custom field value through `formatFormulaValueForText`. A CSV built from a wrapper-valued row now carries `1035` and `#ERROR: Unknown field: Nope` instead of three identical `[object Object]` cells. Proven end-to-end against the real `Papa.unparse` output string and re-parsed with `Papa.parse` so the assertion is on the actual cell, not a substring coincidence.
- **The Pipedrive path got the same treatment** at its `custom_` pass-through in `toPipedriveFormat`, keeping it correct for any caller handing it raw JSONB rather than pre-flattened rows.
- **SC-3 closed.** `matcher.ts` gained `normalizeFormulaValues`, which reduces every value under `customFields` *and* `custom_fields` to its scalar before the spread into `envelope.data`. A `greater_than` condition on `trigger.data.customFields.Margin` now evaluates `true` for 1035; before, `Number({...})` produced `NaN` and the workflow silently never fired.
- **The export module gained its first test file** — 9 tests, including the CSV-quoting guard for a key containing a comma, a quote and a newline.
- Full suite: **555 passed / 4 skipped across 44 files**, up from the 536/4 across 43 baseline. The delta is exactly the 19 tests added (9 new file + 7 matcher + 3 evaluator); no existing test changed behaviour.

## Task Commits

1. **Task 1 RED: failing export suite** — `df15af3` (test) — 6 of 9 failing, every failure a wrapper reaching the output
2. **Task 1 GREEN: unwrap in CSV and Pipedrive exports** — `2a6709d` (fix)
3. **Task 2 RED: failing trigger envelope suite** — `7f255aa` (test) — 4 failing, all "wrapper reached the envelope"
4. **Task 2 GREEN: normalise the trigger envelope** — `32e4b85` (fix)

## Files Created/Modified

- `src/lib/export/formatters.test.ts` — **created.** 9 tests: wrapper unwrapping, errored wrapper, plain scalar, `multi_select` array, `include:false`/`null` guards, end-to-end CSV regression, JSON inheritance, Pipedrive CSV, punctuated-key quoting.
- `src/lib/export/formatters.ts` — `flattenCustomFields` applies `formatFormulaValueForText` per value; doc comment records that `exportToJSON` shares these flattened rows and therefore inherits the unwrapping.
- `src/lib/export/pipedrive.ts` — `toPipedriveFormat`'s `custom_` branch unwraps; a comment on `formatDateForPipedrive` records why its `String()` is deliberately left alone.
- `src/lib/triggers/matcher.ts` — added `normalizeFormulaValues` + `CUSTOM_FIELD_KEYS`; `envelope.data` spreads the normalised copy.
- `src/lib/triggers/matcher.test.ts` — **append-only**, 7 tests in a new `describe`.
- `src/lib/execution/condition-evaluator.test.ts` — **append-only**, 3 tests documenting why the normalisation exists.

## Decisions Made

- **`unwrapFormulaValue` for the envelope, `formatFormulaValueForText` for text readers.** A condition needs the comparable value; an export needs a visible error. Using the text formatter in the envelope would turn an errored formula into a non-empty string, making `is_not_empty` true and `greater_than` unpredictable. An errored formula therefore reaches a condition as `null`, which the existing operators already handle (`is_empty` → true, comparisons → false).
- **D-17 honoured explicitly: the webhook payload keeps the full wrapper.** `normalizeFormulaValues` returns a copy and only allocates one when a custom-field key is actually present, so the `crmBus` payload that `events/subscribers/webhook.ts` forwards verbatim is untouched. This is asserted by a dedicated test (identity check on the wrapper object) and by the full-envelope deep-equal test.
- **`condition-evaluator.ts` was not modified**, per RESEARCH's option (b). Verified: `git diff` against the base commit for that file and for `events/subscribers/webhook.ts` is empty.
- **`pipedrive.ts` unwraps defensively even though `flattenCustomFields` already did.** `toPipedriveFormat` is exported and reachable independently; the second pass is a no-op on already-unwrapped scalars.
- **The `!Array.isArray` guard inside `isFormulaWrapper` is load-bearing here too** — every `multi_select` in this database is an array, and Test 4 pins that arrays pass through untouched.

## Deviations from Plan

None — plan executed as written.

Two small judgement calls within the plan's stated bounds, neither a scope change:

1. The plan's action text named both `pipedrive.ts:69` (`String(value)` inside `formatDateForPipedrive`) and the `custom_` pass-through at `:111-113`, while also instructing "only touch the custom-field branch; leave the native-field formatting untouched." `formatDateForPipedrive` is only ever called for `expectedCloseDate`/`dueDate`/`completedAt`, which are native columns that can never hold a wrapper. The narrower instruction won: the custom-field branch was changed and a comment at `:69` records why that `String()` is deliberately unchanged.
2. The `resolveFieldPath` punctuation limitation (below) was recorded here rather than appended to `deferred-items.md`, because that file sits outside this plan's `files_modified` and is shared with a concurrently-running plan.

## Issues Encountered

None. Both RED phases failed for the intended reason on the first run (wrapper objects reaching the output/envelope), and both GREEN phases passed on the first run.

## Known Limitations (for plan 34-11 to document)

- **`resolveFieldPath` cannot address field names containing spaces, dots or punctuation.** It splits the configured path on `.`, so real names in this dataset — `"E-mail de Contato 1"`, `"Consumo Médio em MWh"`, `"CNPJ / CPF"`, `"Tem solução de solar?"` — are unreachable from a workflow condition. This is **pre-existing and affects all custom fields, not just formulas**; RESEARCH flagged it as out of scope for this phase and it was deliberately not fixed here. A formula field whose name contains punctuation will still be unreachable by a condition despite the normalisation landing.
- **CSV formula injection (T-34-14, accepted).** A value starting with `=`, `+`, `-` or `@` can be interpreted as a spreadsheet formula on open. Pre-existing and identical for every text custom field in the export; papaparse's quoting is unchanged by this plan. Backlog candidate for a dedicated CSV-injection pass across all export columns.

## Known Stubs

None. Both readers are fully wired to the real primitives; no placeholder or hardcoded value was introduced.

## Threat Flags

None. No new network endpoint, auth path, file access pattern or schema change. The two boundaries this plan touches were already enumerated in the plan's threat register (T-34-06, T-34-14, T-34-15, T-34-16), and T-34-16 (shared payload mutation) is now positively asserted by test rather than only by review.

## Verification

| Gate | Result |
|---|---|
| `npx vitest run src/lib/export/formatters.test.ts` | exit 0 — 9 passed |
| `npx vitest run src/lib/triggers/matcher.test.ts src/lib/execution/condition-evaluator.test.ts` | exit 0 — 58 passed |
| `npm test` | exit 0 — **44 files, 555 passed / 4 skipped** (baseline 43 / 536 / 4) |
| `npx tsc --noEmit` | exit 0 |
| `npx eslint src/lib/export src/lib/triggers src/lib/execution` | 0 errors (warnings are pre-existing `no-unused-vars`, unchanged in count) |
| `git diff` on `condition-evaluator.ts`, `events/subscribers/webhook.ts` | empty — both unmodified |
| Test-file edits append-only | verified: 0 removed lines in `git diff -U0` |

## User Setup Required

None — no external service configuration, no new dependency, no migration. `papaparse` 5.5.3 was already a direct dependency.

## Next Phase Readiness

- Both reader-side halves of SC-2 and SC-3 are now in place. What remains for those criteria is the **D-17 ordering guarantee** — recalc must complete before `crmBus.emit` — which belongs to the write-path plans (34-06 through 34-10). A correct stored value will now survive the trip to a CSV cell and to a workflow condition; nothing further is needed on the reader side.
- Plan 34-11 should document the two limitations recorded above.
- No blockers.

## Self-Check: PASSED

All 6 plan files present on disk; all 4 task commits (`df15af3`, `2a6709d`, `7f255aa`, `32e4b85`) resolve in `git log`; `git status` clean; `git diff --name-only` against the base commit lists exactly this plan's `files_modified` and nothing else.

---
*Phase: 34-formula-reactivity*
*Completed: 2026-08-14*
