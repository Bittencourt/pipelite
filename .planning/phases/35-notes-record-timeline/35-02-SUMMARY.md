---
phase: 35-notes-record-timeline
plan: 02
subsystem: i18n
tags: [next-intl, i18n, locale, vitest, copy-contract, drift-gate]

# Dependency graph
requires: []
provides:
  - "`notes` copy namespace (30 keys) in en-US, es-ES and pt-BR"
  - "`src/messages/locale-parity.test.ts` — the repo's first locale drift gate"
  - "A checked-in `REQUIRED_NOTE_KEYS` contract every downstream notes/timeline UI plan can call `t('...')` against without adding a key"
affects: [35-03, 35-04, 35-05, 35-06, 35-07, 35-08, 35-09, 35-10, 35-11, 35-12, 35-13, 35-14, 35-15]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Locale parity asserted by a checked-in vitest test that reads the JSON files from disk"
    - "Copy contract encoded as an exported key list, not as scattered `t()` call sites"

key-files:
  created:
    - src/messages/locale-parity.test.ts
  modified:
    - src/messages/en-US.json
    - src/messages/es-ES.json
    - src/messages/pt-BR.json

key-decisions:
  - "Whole-file locale parity is asserted, not just the notes namespace — measured pre-existing global drift was 0, so the stricter gate was affordable"
  - "The gate also fails on untranslated English copied into BOTH es-ES and pt-BR, backed by an explicit (currently empty) allow-list for legitimate identical strings"
  - "The gate also fails on {placeholder} loss in translation, which next-intl would otherwise surface as a render-time throw in one locale only"
  - "The notes namespace sits between `activities` and `settings` rather than at end-of-file, grouping it with the entity namespaces"

patterns-established:
  - "Locale drift gate: adding a user-facing string means adding its dot-path to REQUIRED_NOTE_KEYS-style contract lists, then all three locales, or CI fails"
  - "Nested copy groups (empty, emptyNotes, error, entry, deleteDialog) under a top-level namespace, matching the existing admin.webhooks.* convention (D-16)"

requirements-completed: [NOTE-01, NOTE-02]

# Metrics
duration: 12min
completed: 2026-08-15
---

# Phase 35 Plan 02: Notes Copy Namespace & Locale Drift Gate Summary

**30-key `notes` copy namespace shipped to all three locales behind a new vitest gate that fails the build on locale key drift, untranslated English, or a lost `{placeholder}` — a guard this repo has never had.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-15T18:43:00Z
- **Completed:** 2026-08-15T18:55:44Z
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- Built the repo's first i18n drift gate. Before this plan, a namespace landing in `en-US.json` only would ship as a raw `notes.addNote` string in the Spanish and Portuguese UI, and neither `tsc`, `eslint`, nor the test suite would notice.
- Added all 30 `notes.*` keys to `en-US.json`, `es-ES.json` and `pt-BR.json`, with the en-US copy verified byte-identical to the 35-UI-SPEC copywriting contract by an automated diff (30 rows × 3 locales, 0 mismatches).
- Proved the gate discriminates, not just that it is green: with the namespace absent it named 30 missing keys per locale; with a single key (`notes.saveEdit`) removed from `es-ES.json` alone it failed 4/6 tests and named that exact key and file.
- Measured pre-existing global locale drift as **0 keys** (identical 544-leaf key sets across all three files), which let the gate assert whole-file parity rather than being scoped to `notes` alone. That is the part that protects the *next* namespace, not just this one.

## Task Commits

1. **Task 1: RED — locale parity gate written before any key exists** — `f881d64` (test)
2. **Task 2: GREEN — notes namespace added to all three locale files** — `0b4e754` (feat)

TDD gate sequence verified in git log: `test(35-02):` precedes `feat(35-02):`. No REFACTOR commit — the gate needed no cleanup after going green.

## Files Created/Modified

- `src/messages/locale-parity.test.ts` (created) — the drift gate. Exports `REQUIRED_NOTE_KEYS` (30 dot-paths, the 35-UI-SPEC copy contract) and asserts six properties across the three locale files, read from disk with `readFileSync`.
- `src/messages/en-US.json` (modified) — `notes` namespace, 42 lines inserted between the `activities` and `settings` namespaces.
- `src/messages/es-ES.json` (modified) — same, real Spanish translations.
- `src/messages/pt-BR.json` (modified) — same, real Portuguese translations.

Diff is purely additive: 126 insertions, 0 deletions, no existing namespace touched, no reformatting.

## What the gate asserts

| # | Test | Fails when |
|---|------|-----------|
| 1 | every required `notes.*` key exists in every locale | a key from the contract is missing anywhere; the diff is keyed by locale so it names the file and the keys |
| 2 | the `notes` namespace has identical key sets across all three locales | one locale gains or loses a `notes.*` key the others do not have |
| 3 | every `notes.*` value is a non-empty string | a key resolves to `""`, whitespace, or a nested object |
| 4 | no `notes.*` string left untranslated in both es-ES and pt-BR | an English string was copy-pasted into both non-English locales (an `IDENTICAL_TRANSLATION_ALLOWED` list, currently empty, exists for legitimate proper nouns) |
| 5 | interpolation placeholders survive translation | a translator drops `{from}`, `{to}` or `{date}`, which next-intl turns into a render-time throw in that locale only |
| 6 | all three locales have identical whole-file key sets | **any** namespace drifts, not just `notes` |

## Decisions Made

- **Whole-file parity enabled (test 6).** The plan made this conditional on measured pre-existing drift. Measured drift was 0, so the stricter assertion was taken. Had it been non-zero, the gate would have been scoped to `notes` with the count recorded in a header comment.
- **Namespace placement between `activities` and `settings`.** The locale files are not alphabetically ordered; grouping `notes` with the entity namespaces reads better than appending at EOF and produces an identical-size diff.
- **Nesting depth.** `empty`, `emptyNotes`, `error`, `entry` and `deleteDialog` are nested objects; the other 15 keys are flat. One level deeper than most namespaces, but in-convention with `admin.webhooks.*` (D-16).
- **Straight ASCII apostrophes, U+2026 ellipsis.** Verified against the UI-SPEC byte-for-byte — it contains no U+2019. ICU MessageFormat treats a lone apostrophe as a literal, so `wasn't` needs no escaping.

## Deviations from Plan

The plan specified tests 1–3 plus a conditional test 4. Two additional assertions were added:

**1. [Rule 2 - Missing Critical] Placeholder-preservation assertion (test 5)**
- **Found during:** Task 1 (writing the gate)
- **Issue:** The plan's Task 2 acceptance criteria required `{from}`/`{to}`/`{date}` to survive translation, but only as one-off bash checks that would run once during this plan and never again. A translator dropping `{from}` from `es-ES` later is a runtime throw in the Spanish UI that nothing would catch.
- **Fix:** Encoded the criterion as a checked-in assertion comparing the placeholder set of each locale's string against en-US.
- **Files modified:** `src/messages/locale-parity.test.ts`
- **Verification:** Passes green; the temporary key-removal experiment confirmed the surrounding tests fail loudly rather than silently.
- **Committed in:** `f881d64` (Task 1 commit)

**2. [Rule 2 - Missing Critical] Untranslated-English assertion (test 4 in file order)**
- **Found during:** Task 1
- **Issue:** The plan offered this clause as optional ("skip if it produces false positives on proper nouns"). The execution constraints require es-ES and pt-BR to be real translations, not English placeholders, and nothing enforced that.
- **Fix:** Implemented with an explicit `IDENTICAL_TRANSLATION_ALLOWED` escape hatch (currently empty) so a future legitimate proper noun is a deliberate one-line addition rather than a reason to delete the test. Zero false positives against the current 30 keys.
- **Files modified:** `src/messages/locale-parity.test.ts`
- **Verification:** Green with the shipped copy; no key in the contract is byte-identical to en-US in both other locales.
- **Committed in:** `f881d64` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 2 — missing critical correctness gates)
**Impact on plan:** Both convert a one-shot acceptance check into a permanent regression gate, which is the stated purpose of the plan. No new files, no new dependencies, no scope creep beyond the one test file the plan already called for.

## Threat Model Compliance

- **T-35-10 (information disclosure via error copy):** all five `notes.error.*` strings name the failed action and the next step, and carry no server, database or stack detail. Verified by reading the shipped values.
- **T-35-13 (copy over-promising a capability):** `notes.deleteDialog.description` reads "You can't undo this here" in en-US, with matching non-promising phrasing in es-ES and pt-BR. No restore is promised; trash/restore is Phase 37.
- **T-35-SC (npm installs):** zero packages installed. `package.json` and `package-lock.json` untouched.

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run src/messages/locale-parity.test.ts` | PASS 6/6 |
| RED run before Task 2 | exit 1, named 30 missing keys per locale (not a syntax/import error) |
| Single-key mutation (`notes.saveEdit` removed from es-ES only) | exit 1, named `notes.saveEdit` and `es-ES.json`; restored afterwards |
| en-US/es-ES/pt-BR values vs. plan copy table | 30 rows compared, 0 mismatches |
| `{from}` `{to}` `{date}` present in all locales | PASS |
| en-US `deleteDialog.cancel` === `Keep note`, `addNote` === `Add note` | PASS |
| No exclamation mark in any `notes.*` value, any locale | PASS |
| `notes` leaf count === 30 per locale | PASS |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 (128 pre-existing warnings, 0 errors, none in changed files) |
| `npm test` (full suite) | 874 passed, 4 skipped, 0 failed; RSC project 8 passed |

## Issues Encountered

The worktree spawned with HEAD at `cbf3229` (phase 34 tip) rather than the expected base `59e1001`. Corrected with the sanctioned `git reset --hard` in the executor's worktree branch check before any work began; working tree was clean, so nothing was lost.

## Known Stubs

None. Every key ships with real copy in all three locales; nothing is a placeholder awaiting a later plan.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Every downstream plan in phase 35 (03 through 15) can now call `useTranslations('notes')` / `getTranslations('notes')` and reference any of the 30 keys without touching a locale file. If a UI plan discovers it needs a string that is not in `REQUIRED_NOTE_KEYS`, that is a signal the 35-UI-SPEC copy contract needs amending — add the dot-path to the contract list and all three locales together, and the gate will hold the line.

No blockers.

---
*Phase: 35-notes-record-timeline*
*Completed: 2026-08-15*
