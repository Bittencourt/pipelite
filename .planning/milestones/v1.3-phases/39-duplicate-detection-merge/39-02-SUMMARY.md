---
phase: 39-duplicate-detection-merge
plan: 02
subsystem: dedup
tags: [merge, audit, pure-functions, vitest, tdd, custom-fields]

# Dependency graph
requires:
  - phase: 36-audit-log
    provides: "`src/lib/audit/present.ts` — `describeField`, the single field-label map and the native-column ranking"
  - phase: 38-ownership
    provides: "the narrow `update{Entity}OwnerMutation` write path that makes `ownerId` an excluded merge column"
provides:
  - "`buildMergeFieldGroups` — the M-3 partition of two records into conflicts / filledOnly / identical"
  - "`isEmptyMergeValue` — the one emptiness predicate the whole merge path reads"
  - "`MERGE_EXCLUDED_COLUMNS` — the columns the merge picker never offers and never writes"
  - "`resolveMergeDefaults` — the locked default-selection rule, as one pure function"
  - "`applyMergeChoices` — the write-side companion, hardened against a crafted choice map"
  - "`describeField` and `FieldDescriptor`, now exported from the audit presentation layer"
affects: [39-merge-screen, 39-merge-mutation, 39-merged-audit-entry]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Merge display logic lives in `src/lib/` as pure functions taking an `AuditResolution`, because the repo has no jsdom (39-VALIDATION V-7)"
    - "One label map for the whole app: the merge picker resolves labels through the audit layer's `describeField` (39-UI-SPEC M-4)"
    - "Boundary maps arriving from a browser are typed `Record<string, string>` and narrowed at runtime, never typed as the narrow union"

key-files:
  created:
    - src/lib/dedup/field-groups.ts
    - src/lib/dedup/field-groups.test.ts
    - src/lib/dedup/merge-defaults.ts
    - src/lib/dedup/merge-defaults.test.ts
  modified:
    - src/lib/audit/present.ts

key-decisions:
  - "A field the survivor populates and the loser leaves empty lands in `identical`, not `conflicts` — the survivor already holds the only value and the alternative on offer would be 'delete this value'"
  - "`applyMergeChoices` returns an asymmetric result: `native` holds ONLY the compared columns (it is an UPDATE SET clause), while `customFields` is the COMPLETE blob (JSONB is written wholesale, so a partial blob would clear uncompared fields)"
  - "`applyMergeChoices` deliberately does not read the loser record — every loser value that can be written is one `MergeField` already carries, i.e. one the picker displayed"
  - "String comparison is strict: `\"Acme\"` vs `\"Acme \"` is a conflict, not a match, because silently picking one spelling is an editorial decision the user never saw"
  - "`MergeEntityType` is declared locally in `field-groups.ts` rather than imported from plan 39-01's `types.ts`, because both plans are in wave 1 and cannot see each other's files"

patterns-established:
  - "Negative proof per behavioural rule: mutate the branch, confirm the named test fails, restore — recorded in the summary"
  - "Anti-vacuity on every exclusion assertion: assert a surfaced key alongside the absent ones so an empty result cannot answer the test"

requirements-completed: [DEDUP-02]

# Metrics
duration: 22min
completed: 2026-08-19
---

# Phase 39 Plan 02: Merge Field Partitioning and Defaults Summary

**The merge screen's two silent decisions — how compared fields split into three sections and which record wins each one — are now pure, unit-tested functions in `src/lib/dedup/`, with the locked default rule transcribed verbatim and proved in both directions.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-08-19T08:24:00Z
- **Completed:** 2026-08-19T08:46:00Z
- **Tasks:** 3
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments

- `buildMergeFieldGroups` produces 39-UI-SPEC M-3's three groups deterministically, ordered by the
  audit layer's own `(group, rank, label, key)` ranking, so the merge picker asks its questions in
  the same order the record timeline later reports the answers.
- The two rules a reader gets wrong by default are now nailed down by name in the test file:
  **survivor-populated + loser-empty is `identical`**, not a conflict, and **both-empty is
  `identical`**, not a conflict.
- `resolveMergeDefaults` transcribes the locked sentence from 39-CONTEXT § Merge Semantics into one
  function, with the sentence quoted in the doc comment and its source named.
- `applyMergeChoices` is hardened against the browser-authored choice map: a forged key writes
  nothing, a forged value narrows back to the computed default, an excluded column is dropped a
  second time on the way out, and nothing throws (T-39-04, T-39-13).
- `describeField` and `FieldDescriptor` are exported from `src/lib/audit/present.ts` with
  `AUDIT_FIELD_LABELS`, `NATIVE_ORDER` and every behaviour byte-identical — the A-8 guard holds.

## Task Commits

1. **Task 1: Export `describeField` from the audit presentation layer** — `f5d1a83` (refactor)
2. **Task 2: Field partitioning into the three merge groups** — `6f98aa2` (test, RED) → `f237a21` (feat, GREEN)
3. **Task 3: The default-selection rule and choice application** — `04771f1` (test, RED) → `04937c2` (feat, GREEN)

No REFACTOR commit was needed on either TDD task: both modules were written once and neither needed
cleaning after going green.

## Files Created/Modified

- `src/lib/audit/present.ts` — **modified.** `describeField` and `FieldDescriptor` exported, with a
  doc comment stating the M-4 constraint (one label map, never two) and naming what stays private
  and why. 17 insertions, 2 deletions — both deletions are the two modified declaration lines.
- `src/lib/dedup/field-groups.ts` — **created.** `MERGE_EXCLUDED_COLUMNS` (frozen, with a one-line
  reason per column), `isEmptyMergeValue`, `MergeEntityType`, `MergeField`, `MergeFieldGroups` and
  `buildMergeFieldGroups`.
- `src/lib/dedup/field-groups.test.ts` — **created.** 14 tests, mocking nothing.
- `src/lib/dedup/merge-defaults.ts` — **created.** `MergeChoice`, `MergeChoiceMap`, `MergedValues`,
  `resolveMergeDefaults`, `applyMergeChoices`.
- `src/lib/dedup/merge-defaults.test.ts` — **created.** 11 tests, including three hostile-input cases.

## Verification

| Check | Result |
|---|---|
| `vitest run src/lib/dedup/` | 2 files, **25 tests passed** |
| `vitest run src/lib/audit` | 7 files, **163 tests passed** (unchanged by the export) |
| `npm run test` (both projects) | **2249 + 8 passed**, 21 skipped — exactly +25 over the 2224 + 8 phase-start baseline |
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **0 errors**, 125 warnings (all pre-existing; count unchanged) |
| `grep -c "AUDIT_FIELD_LABELS\|audit.field." src/lib/dedup/field-groups.ts` | **0** — labels come only from `describeField` (M-4) |
| `grep -c "^export function describeField" src/lib/audit/present.ts` | **1** |
| `grep -c "^const NATIVE_ORDER" src/lib/audit/present.ts` | **1** — still NOT exported (A-8 guard) |

### Negative proofs — all three RUN

The plan required three. Each mutation was applied to the source, the suite was re-run, the named
test was confirmed failing, and the source was restored from a byte-identical backup.

1. **Task 2 — survivor-populated / loser-empty returns `conflicts`.**
   → `× Test 3: puts a field the survivor populates and the loser is empty on into 'identical',
   never 'conflicts'`. 1 failed / 13 passed. Restored, 14 passed.
2. **Task 3 — `filledOnly` default inverted to `"survivor"`.**
   → `× Test 2: defaults every filled-only field to the LOSER — the locked exception`.
   Also took down Test 5 and Test 8, which read the same default through `applyMergeChoices` — the
   rule is genuinely load-bearing in three places, not asserted once. 3 failed / 8 passed. Restored,
   11 passed.
3. **Task 3 — unknown-key filter removed** (replaced with the naive loop that trusts the choice
   map's own key set).
   → `× Test 7: ignores a choice key that is not in any group`. 1 failed / 10 passed. Restored,
   11 passed.

## Decisions Made

- **Survivor-populated + loser-empty is `identical`.** The plan mandates it; the reason is worth
  recording. The only alternative the picker could offer is "clear this value", which is not what
  merging two records means and not a question a user came to the screen to answer.
- **`applyMergeChoices` returns an asymmetric result.** `native` holds only the compared columns,
  because it is the SET clause of an update and a column absent from it is a column the merge does
  not touch. `customFields` holds the COMPLETE blob, starting from the survivor's own, because JSONB
  is written wholesale — returning only the compared keys would silently clear every custom field
  nobody was asked about (this is exactly what Test 9 pins down).
- **The `loser` record is not read by `applyMergeChoices`.** Every loser value that can reach the
  output is already on `MergeField`, i.e. one the picker displayed. Reading the record again would
  open a route to writing a value that was never on screen. The parameter stays in the signature per
  the plan, with `void loser` and the rationale in the doc comment.
- **String equality is strict.** `"Acme"` and `"Acme "` are reported as a conflict. An importer
  introducing trailing whitespace on one side only is a real case, and silently picking a spelling
  is an editorial decision the user never saw.
- **`MergeChoiceMap` is typed `Readonly<Record<string, string>>`, not `Record<string, MergeChoice>`.**
  It is a boundary type; declaring the narrow union would only mean the compiler believed a claim
  the client made about itself.
- **Arrays and plain objects compare structurally,** key order excluded, because multi-select and
  file custom fields store them and reference equality would report every such field as a conflict.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The worktree was checked out at a stale commit**

- **Found during:** bootstrap, before Task 1
- **Issue:** The agent worktree's HEAD was `cbf3229` ("docs(34): mark phase 34 complete"), many
  commits behind `master` (`c09a1cf`). At that commit `src/lib/audit/` does not exist at all, none of
  the phase-39 planning documents are present, and every file this plan reads or modifies is absent.
  Task 1 was unexecutable.
- **Fix:** Confirmed the branch carried zero unique commits (`git log master..HEAD` empty), then
  `git reset --hard master` onto `c09a1cf`. Nothing was discarded and no protected ref was touched.
- **Files modified:** none (branch pointer only)
- **Verification:** `src/lib/audit/present.ts` present at 497 lines; the 22 phase-39 planning files
  present; `npm run test` green on the untouched tree before any edit.
- **Committed in:** n/a (pre-work recovery)

**2. [Rule 3 - Blocking] `src/lib/dedup/types.ts` does not exist and could not be created**

- **Found during:** Task 2
- **Issue:** The plan's `read_first` points at `src/lib/dedup/types.ts` for `MergeableEntityType`.
  That file is produced by plan **39-01, which is in the same wave (wave 1)** and runs in a separate
  worktree, so it is invisible here and importing it would fail typecheck. Creating it myself would
  produce a file-level merge conflict when both wave-1 branches land.
- **Fix:** Declared `export type MergeEntityType = Extract<EntityType, "organization" | "person">`
  locally in `field-groups.ts` — the identical derivation 39-01 specifies, under a non-colliding
  name — with a doc comment naming 39-01's canonical `MergeableEntityType` and instructing a future
  reader to re-point at `./types` once both plans are merged.
- **Files modified:** `src/lib/dedup/field-groups.ts`
- **Verification:** `npm run typecheck` = 0 errors; no file created that 39-01 also creates.
- **Committed in:** `f237a21` (Task 2 GREEN commit)

**3. [Rule 3 - Blocking] Task 1's diff touches two declaration lines, not one**

- **Found during:** Task 1
- **Issue:** The acceptance criterion says the diff should show "zero lines removed other than the
  modified declaration" (singular), but the task's own action text also requires exporting
  `FieldDescriptor`. `describeField` returns it, so leaving it private would export a function whose
  return type no consumer can name.
- **Fix:** Exported both. The diff is 17 insertions / **2** deletions, and both deletions are the two
  modified declaration lines (`function describeField` and `interface FieldDescriptor`). No other
  line in the file changed.
- **Files modified:** `src/lib/audit/present.ts`
- **Verification:** `git diff --numstat` = `17 2`; all 163 audit tests pass unchanged; the A-8 greps
  hold (`NATIVE_ORDER` still not exported).
- **Committed in:** `f5d1a83`

---

**Total deviations:** 3 auto-fixed (3 blocking)
**Impact on plan:** No scope change. Two were environment recovery, one was a literal-reading
conflict inside the plan's own Task 1 resolved in favour of the action text. Every stated
acceptance criterion still holds.

## Issues Encountered

None beyond the deviations above. Both TDD tasks went RED → GREEN on the first attempt; no auto-fix
attempts were spent on failing implementations.

## Known Stubs

None. Both modules are complete implementations with no placeholder values, no hardcoded empties and
no TODOs. Nothing here renders, so there is no UI surface to stub.

## Threat Flags

None. This plan adds no network endpoint, no auth path, no file access and no schema change. It
mitigates two registered threats and introduces no new surface:

- **T-39-04 (Tampering, `applyMergeChoices(choices)`)** — mitigated. The output key set is the
  server-built group key set; a forged key is never iterated, a forged value narrows to the computed
  default. Asserted by Tests 7, 8 and 10 and by negative proof 3.
- **T-39-13 (Tampering, `MERGE_EXCLUDED_COLUMNS`)** — mitigated. `id`, `createdAt`, `updatedAt`,
  `deletedAt`, `customFields` and `ownerId` are excluded at partition time AND dropped again in
  `applyMergeChoices`, so even a forged `MergeFieldGroups` cannot write them. Test 10 constructs
  exactly that forged group to prove the second guard is not dead code.
- **T-39-SC (package legitimacy)** — no package was installed. `node_modules` was treated as
  read-only, as the parallel-execution contract requires.

## User Setup Required

None — no external service configuration, no migration, no Docker rebuild. This plan is pure logic.

## Next Phase Readiness

Ready. The merge screen plans can now build the picker against a settled contract:

- `buildMergeFieldGroups({ entityType, survivor, loser, resolution })` → the three M-3 sections,
  each already sorted.
- `resolveMergeDefaults(groups)` → the initial `RadioGroup` state, one entry per compared field
  including the identical ones.
- `applyMergeChoices(survivor, loser, groups, choices)` → `{ native, customFields }`, safe to hand
  to the merge mutation as-is.

Two things the next plans must not miss:

1. **`MergeField.label` is a MESSAGE KEY for mapped native columns and VERBATIM user text for custom
   fields.** They are told apart structurally, by whether `key` starts with `customFields.` — never
   by inspecting the label's content. This is the same two-kinds-of-string contract
   `AuditFieldChange.label` already carries.
2. **`MergeField` carries raw stored values, not `AuditValue`s.** The renderer owes M-5's
   "an empty side renders `audit.value.empty`, never a blank" — `isEmptyMergeValue` is exported for
   exactly that check, and it is the same predicate the partition used, so the picker cannot disagree
   with the section a field was placed in.

One follow-up for whoever merges wave 1: `MergeEntityType` in `field-groups.ts` should be re-pointed
at 39-01's `MergeableEntityType` in `src/lib/dedup/types.ts`. It is a one-line change and the comment
in the file says so.

---
*Phase: 39-duplicate-detection-merge*
*Completed: 2026-08-19*

## Self-Check: PASSED

All five source files and this summary exist on disk. All five task commits
(`f5d1a83`, `6f98aa2`, `f237a21`, `04771f1`, `04937c2`) are present in `git log`.

## TDD Gate Compliance

Both TDD tasks show the full gate sequence in git history: a `test(...)` commit (RED) followed by a
`feat(...)` commit (GREEN). No `refactor(...)` gate — neither module needed cleaning after going
green, which is a legitimate skip rather than a missing gate.
