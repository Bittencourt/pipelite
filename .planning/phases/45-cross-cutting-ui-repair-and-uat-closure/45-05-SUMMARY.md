---
phase: 45-cross-cutting-ui-repair-and-uat-closure
plan: 05
subsystem: bulk-operations
tags: [react, next-intl, icu-plural, source-gate, copy-contract, tanstack-table]

# Dependency graph
requires:
  - phase: 45-cross-cutting-ui-repair-and-uat-closure
    plan: "01"
    provides: bulk.failures.retryHintPartial (ICU plural) and bulk.failures.prunedHint in all three locales
  - phase: 38-bulk-operations
    provides: BulkFailureReport, the four caller surfaces, their defensive selection prune, and bulk-failure-report-wiring.test.ts
provides:
  - "BulkFailureReport.stillSelected — a caller-computed count of failures still on screen"
  - "three mutually exclusive hint branches, jointly exhaustive over that count"
  - "src/components/bulk/__tests__/bulk-caller-wiring.test.ts — a four-caller element-scoped gate"
affects: [45-11, bulk-failure-report, organizations-data-table, people-data-table, activities-client, deals-kanban]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "element-scoped source gate: extract the JSX opening element brace- and string-aware, then assert inside it"
    - "per-caller expectation table with each caller's own identifier baked into the assertion, so a copy-paste of the wrong set fails"
    - "expect.soft on looped copy-key coverage so a run names every missing key, not only the earliest"

key-files:
  created:
    - src/components/bulk/__tests__/bulk-caller-wiring.test.ts
  modified:
    - src/components/bulk/__tests__/bulk-failure-report-wiring.test.ts
    - src/components/bulk/bulk-failure-report.tsx
    - src/app/organizations/data-table.tsx
    - src/app/people/data-table.tsx
    - src/app/activities/activities-client.tsx
    - src/app/deals/kanban-board.tsx

key-decisions:
  - "The fix is conditional COPY, never a retained selection — re-selecting vanished ids would reintroduce ids the table cannot render, which is exactly what the caller's prune exists to prevent"
  - "The intersection is against loadedIds/renderedIds and never against rowSelection, because handleOutcome re-asserts every failed id into rowSelection unconditionally, so rowSelection[failedId] is always true and an intersection with it would report the old false number while looking like a fix"
  - "The caller-gate assertions are scoped to the extracted <BulkFailureReport> element rather than the file, because kanban-board.tsx already contains selectedDealIds.has(deal.id) on a card and all four contain their selection setter somewhere — a file-wide check would be answered by unrelated code hundreds of lines away"
  - "The zero-survivor branch is tested explicitly (stillSelected === 0) rather than left as the trailing default, so it reads as a decision instead of a leftover"
  - "The looped copy-key assertions became expect.soft — Phase 38 lost a criterion to a loop that aborted before naming the missing key"

patterns-established:
  - "Element-scoped JSX source gate: a helper walks from the opening tag to its self-closing /> with brace and quote awareness, so prop assertions cannot be satisfied by code elsewhere in the file"
  - "A copy branch whose truth condition lives in the caller takes a NUMBER, never the data — the component renders a truth it is told"

requirements-completed: [SC-4]

# Metrics
duration: 12min
completed: 2026-08-18
---

# Phase 45 Plan 05: Conditional Bulk-Failure Copy Summary

**The bulk failure panel no longer claims records are still selected when they have left the table — it is handed a surviving count and renders one of three mutually exclusive sentences, with the zero-survivor branch carrying no retry advice at all.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-18T10:13:00Z
- **Completed:** 2026-08-18T10:25:00Z
- **Tasks:** 3
- **Files modified:** 6 (1 created, 5 modified)

## Accomplishments

- **The false sentence is gone.** `BulkFailureReport` took `stillSelected: number` and replaced its single unconditional hint with three branches keyed on that count: `failures.retryHint` when every named record survived (text unchanged), `failures.retryHintPartial` with `{ count: stillSelected }` when some did, and `failures.prunedHint` when none did. The third branch contains no "fix the problem and try again" in any form, because the records are gone and there is nothing to retry against. This is the concurrent-deletion case, not a forced-test artefact: for the `no longer exists` reason code the failed rows leave `data`, the effective selection empties, the bulk bar unmounts, and the panel was still instructing a retry.
- **All four callers compute the count against their own rendered set.** Organizations, people and activities use `outcome.failed.filter((f) => loadedIds.has(f.id)).length`; the deals kanban uses the same expression against `renderedIds`, which covers the OPEN stages only because the won and lost stages render summary tiles and no cards. Every caller already had its set in scope at the render site, so the change is **exactly one added line per file** — no new `useMemo`, no derived set, no normalising of the three `{cond && (…)}` forms against people's `{cond ? (…) : null}`.
- **Nothing re-selects a pruned id.** `handleOutcome` is byte-identical in all four callers and no `setRowSelection` / `setSelectedDealIds` call was added. `git diff -- src/app/` matches zero occurrences of `handleOutcome`, `setRowSelection`, `setSelectedDealIds` or `useMemo` across the four files, and the whole caller diff is 4 insertions and 0 deletions.
- **A new four-caller gate makes the seam testable.** `bulk-caller-wiring.test.ts` reads all four callers comment-blind, extracts the `<BulkFailureReport … />` opening element with a brace- and string-aware walker, and asserts inside it: `stillSelected=` present, `<set>.has(` present with the caller's OWN set name in the assertion message, `.filter(` present, `rowSelection[` absent, and the caller's selection setter absent. Two anti-vacuity blocks run first (all four sources non-empty; all four actually mount the report), plus an arity tripwire at four callers.
- **The report gate grew from four gated copy keys to six** and gained a branch describe asserting `stillSelected: number`, both comparison boundaries (`stillSelected === failures.length`, `stillSelected === 0`), the ICU argument `{ count: stillSelected }`, all three branch keys, and that the hint stays in its `text-muted-foreground mt-2 text-xs` paragraph. `RECOGNISED` and `LEFT_ALONE` were left exactly as they were and both still hold.

## Task Commits

| Task | Name | Commit |
|------|------|--------|
| 1 | Extend the report gate and add the caller gate (RED) | `baef050` |
| 2 | Three branches in BulkFailureReport (GREEN part 1) | `bfa38fd` |
| 3 | Pass the surviving count from all four callers (GREEN part 2) | `124b16c` |

## TDD Gate Compliance

- **RED:** `baef050` (`test(45-05)`) — 7 failed / 30 passed across the two gate files. Failure output named `stillSelected` (10 occurrences) and, after the soft-assert change, `failures.prunedHint` (4 occurrences).
- **GREEN:** `bfa38fd` and `124b16c` (`feat(45-05)`). After `bfa38fd`, `npm run typecheck` reported **exactly 4 errors**, one TS2741 per caller at `activities-client.tsx:292`, `kanban-board.tsx:515`, `organizations/data-table.tsx:324`, `people/data-table.tsx:282` — the four sites the plan predicted, and nothing else. `124b16c` returned it to 0.
- **REFACTOR:** none needed; no commit.

## Key Implementation Details

### The intersection is against the rendered set, not the selection map

`handleOutcome` re-asserts **every** failed id into `rowSelection` unconditionally
(`organizations/data-table.tsx:232-247` and its three twins), so `rowSelection[failedId]` is always
true. The only thing that can drop a failed row from the effective selection is it leaving `data`.
`failed ∩ loadedIds` is therefore exactly the "still selected" set, and an intersection with
`rowSelection` would reproduce the original false number while looking like a fix in a diff. The
caller gate asserts `rowSelection[` is absent from the report's render expression for this reason.

### Element scoping is what makes the caller gate mean anything

A file-wide `.has(` assertion on `kanban-board.tsx` is satisfied by `selectedDealIds.has(deal.id)` at
line 561, and a file-wide "no `setSelectedDealIds`" assertion is impossible — the file calls it five
times legitimately. The gate therefore extracts the report's opening element (walking from
`<BulkFailureReport` to its `/>` at brace depth 0, skipping string and template literals) and asserts
only within it.

### The header comment was rewritten, not left contradicting the code

`bulk-failure-report.tsx`'s header block gained three paragraphs: what the sentence used to be and
why it was sometimes false, the three branches and their exhaustiveness, and why re-selecting the
vanished ids stays rejected. The one surviving occurrence of "UNCONDITIONAL" is at line 28 and is
explicitly historical ("USED TO BE ONE UNCONDITIONAL SENTENCE, AND IT WAS SOMETIMES FALSE"); the
other match at line 105 is pre-existing and is about mounting, not about the hint. The
no-timer paragraph is untouched: a list of failed records is still the one thing a user may need to
write down.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] The looped copy-key assertions aborted before naming the key the acceptance criterion demanded**

- **Found during:** Task 1, while confirming RED
- **Issue:** The plan's acceptance criteria required the failure output to name `failures.prunedHint`. Both `FAILURE_KEYS` and the new `HINT_BRANCH_KEYS` loops used a hard `expect`, so vitest stopped at the first missing key (`failures.retryHintPartial`) and `prunedHint` was never printed — measured at 0 occurrences in the run output. This is verbatim the Phase 38 lesson: "a single `it` that asserted arity then looped the copy-key check, so vitest aborted before naming the missing key the criterion demanded."
- **Fix:** Both loops converted to `expect.soft`, matching the pattern 45-01 established for per-contract assertions. This strengthens reporting without weakening any assertion — every key is still required.
- **Files modified:** `src/components/bulk/__tests__/bulk-failure-report-wiring.test.ts`
- **Commit:** `baef050`
- **Result:** `failures.prunedHint` now appears 4 times in the RED output.

No other deviations. All three tasks executed as written; no architectural change, no package install, no checkpoint.

## Verification Evidence

| Check | Result |
|-------|--------|
| `vitest run src/components/bulk/__tests__/` | 5 files / **123 passed** |
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **0 errors**, 127 warnings (all pre-existing) |
| `npm run test` | **2154 passed / 21 skipped** (99 files + 1 skipped) plus the RSC project **8 passed** |
| `grep -c "stillSelected=" ×4 callers` | 1, 1, 1, 1 |
| `git diff -- src/app/` vs `handleOutcome\|setRowSelection\|setSelectedDealIds\|useMemo` | 0 |
| caller diff size | 4 insertions, 0 deletions |
| `renderedIds.has(` in kanban / `loadedIds` in kanban | 2 / **0** |
| every `expect(` in both gate files carries a prose message | 0 missing (AST-ish scan) |

Success criteria from the plan, all met:

- [x] `BulkFailureReport` takes `stillSelected: number` and renders exactly one of three sentences
- [x] The zero-survivor branch contains no retry advice in any form
- [x] All four callers compute the count against their own rendered set
- [x] `FAILURE_KEYS` gates six keys; a new multi-source gate covers all four callers
- [x] No caller re-selects a pruned id

## Threat Model Dispositions

- **T-38-07 (carried, mitigate):** upheld. The reason is still `t(\`reason.${failure.reason}\`)` over the closed four-member union with no fallback branch; the new branching added no path along which a server sentence could render. The gate's `RECOGNISED` entry `reason.${` and the arity tripwire at four union members both still pass.
- **T-45-17 (mitigate):** this was the defect. Three mutually exclusive branches keyed on a computed count replace one unconditional claim, and the zero branch is forbidden retry advice by both the copy and the gate.
- **T-45-18 (accept):** `stillSelected` is a `number` computed in the caller from its own rendered set. Not user input, not persisted, drives only which of three static sentences renders.
- **T-45-19 (accept):** the failure list still renders `labelById` captured at submit time. Unchanged.
- **T-45-SC (mitigate):** nothing was installed. `package.json` and `package-lock.json` are untouched.

No new threat surface: no endpoint, no auth path, no file access, no schema change.

## Known Stubs

None. Both new copy branches are wired to real, locale-complete keys and all four callers pass a real computed count.

## Notes for Future Plans

- **45-11 still owns the phase's single Docker rebuild (V-7).** Nothing in this plan was rebuilt or
  browser-verified; the three branches are proven at the source and unit level only. The partial
  branch in particular is worth a live look, since it is the only one carrying an ICU plural.
- The `reportElement` walker in `bulk-caller-wiring.test.ts` is generic over any self-closing JSX
  element and is the first element-scoped gate in this repo. If another phase needs one, lift it
  into `source-scan.ts` rather than copying it — a second copy is how the two would drift.

## Self-Check: PASSED

All 8 claimed files exist on disk; all 3 claimed commits (`baef050`, `bfa38fd`, `124b16c`) exist in
`git log --all`.
