---
phase: 40-saved-views-shared-filters
plan: 03
subsystem: ui
tags: [i18n, next-intl, icu-messageformat, locale-parity, vitest, copy-contract]

# Dependency graph
requires:
  - phase: 39-duplicate-detection-merge
    provides: "locale-parity.test.ts with six exact-set copy contracts and the shared missingIn/blankIn/untranslatedInBoth/placeholderDrift assertion bodies to extend"
  - phase: 45-shell-localisation
    provides: "IDENTICAL_TRANSLATION_ALLOWED allowlist and the finding that a key which does not exist renders its own dot-path to the user"
provides:
  - "61 views.* message keys in en-US, pt-BR and es-ES — the entire copy surface of phase 40"
  - "REQUIRED_VIEWS_KEYS: a seventh exact-set copy contract, total over the views namespace"
  - "ICU_PLURAL_KEYS at 12, gating views.manage.filterCount's plural wrapper"
  - "A regression test pinning REQUIRED_AUDIT/TRASH/BULK/DEDUP at 86/63/46/80 against document-driven miscorrection"
affects: [40-04, 40-05, 40-06, 40-07, 40-08, 40-09, 40-10, 40-11, 40-12, 40-13, 40-14, 40-15, 40-16, 40-17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Total exact-set copy contract: a namespace with zero out-of-namespace strings needs no *_EXTRA_KEYS sibling, making the key-set comparison total rather than one-directional"
    - "Pinning a sibling contract's length inside the consuming phase, with the reuse rule stated in the assertion's own failure message"

key-files:
  created: []
  modified:
    - src/messages/locale-parity.test.ts
    - src/messages/en-US.json
    - src/messages/pt-BR.json
    - src/messages/es-ES.json

key-decisions:
  - "The FILE is authoritative over every planning document for key counts: REQUIRED_DEDUP/AUDIT/BULK/TRASH measured at 80/86/46/63 by evaluating the module, not by grepping the array literal"
  - "views placed after dedup and before settings in all three catalogs — the files are phase-ordered, not alphabetical, so this is the same relative position in each and the three diffs review side by side"
  - "IDENTICAL_TRANSLATION_ALLOWED left at 3; the three near-misses were proven harmless by RUNNING untranslatedInBoth, not by reasoning about it"
  - "No placeholder-occurrence-count assertion for views: no views.* key repeats a placeholder, so the dedup.merge.confirmBody analogue would be vacuous, and a comment says so where a checker would look"

patterns-established:
  - "Total-scope contract: state in a comment WHY a namespace needs no extras array, and contrast it with the contracts that do"
  - "Discriminating negative proof: mutate all three locales at once so the pre-existing parity gates stay green and only the new contract fires"

requirements-completed: [VIEW-01, VIEW-02, VIEW-03]

# Metrics
duration: 14min
completed: 2026-08-21
---

# Phase 40 Plan 03: Message Keys and the Views Copy Contract Summary

**61 `views.*` keys transcribed into all three locales behind a new total exact-set contract, with `ICU_PLURAL_KEYS` at 12 and a regression test that pins the four sibling contracts at the lengths measured from the file rather than the wrong ones printed in three planning documents.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-08-21T06:03:00Z
- **Completed:** 2026-08-21T06:17:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- All 61 `views.*` keys exist, non-blank and genuinely translated, in `en-US`, `pt-BR` and `es-ES`. Every UI plan in waves 3-5 now has a catalog entry to call and no reason to inline an English literal.
- `REQUIRED_VIEWS_KEYS` is a **total** exact-set contract: a 62nd `views` string added to all three locales without a dot-path in the array fails the suite, which is the half a missing-key check structurally cannot see. Proven by running it.
- `ICU_PLURAL_KEYS` 11 → 12. Proven that this is the *only* defence for `views.manage.filterCount`: flattening its wrapper in pt-BR fails the ICU gate and `placeholderDrift` stays silent, exactly as T-40-12 predicted.
- A new test pins `REQUIRED_AUDIT_KEYS`/`TRASH`/`BULK`/`DEDUP` at 86/63/46/80 — the lengths **measured from the file** — and states the reuse rule in its own failure message, so the next reader who tries to "correct" bulk to the 47 that three documents claim gets told why they are wrong.
- The three locale diffs are 73 insertions and **zero deletions** each: one contiguous block, no pre-existing key touched.

## Task Commits

1. **Task 1: The contract, written before the keys exist** — `74ee5f9` (test — TDD RED)
2. **Task 2: Transcribe the 61 keys into all three locales** — `01406e6` (feat — TDD GREEN)

No REFACTOR commit: the transcription needed no cleanup pass.

## Files Created/Modified

- `src/messages/locale-parity.test.ts` — `REQUIRED_VIEWS_KEYS` (61 dot-paths, grouped 18/22/13/5/3 with per-group counts), `VIEWS_NAMESPACE`/`viewsKeys`, the exact-set comparison loop, four shared-assertion wirings, `ICU_PLURAL_KEYS` +1, and two new `it` blocks (the 61-key/duplicate guard, and the four-pinned-sets regression).
- `src/messages/en-US.json`, `pt-BR.json`, `es-ES.json` — a `views` object of 61 leaves, inserted after `dedup` and before `settings` in all three.

## The key counts, as measured

**This is the headline finding, and it confirms 40-CONTEXT.md A7 against 40-UI-SPEC.md M-13 and A5.**

Measured by writing a throwaway vitest probe that **imported the exported arrays and printed `.length`** — i.e. by evaluating the module, which is the only way to get this right. The probe was deleted before the first commit and is not in the history.

| Constant | UI-SPEC M-13 / CONTEXT A5 claim | Measured from the file | Used |
|---|---|---|---|
| `REQUIRED_DEDUP_KEYS` | 83 | **80** | 80 |
| `REQUIRED_AUDIT_KEYS` | 88 | **86** | 86 |
| `REQUIRED_BULK_KEYS` | 47 | **46** | 46 |
| `REQUIRED_TRASH_KEYS` | 66 | **63** | 63 |
| `REQUIRED_NOTE_KEYS` | — | 32 | — |
| `REQUIRED_SHELL_KEYS` | — | 16 | — |
| `ICU_PLURAL_KEYS` | 11 | 11 | → 12 |
| `IDENTICAL_TRANSLATION_ALLOWED` | 3 | 3 | 3 (unchanged) |

**The discrepancy was recorded, not "fixed".** A7's diagnosis is confirmed: `locale-parity.test.ts` already carried a hard `expect(REQUIRED_DEDUP_KEYS).toHaveLength(80)`, so editing the array up to 83 to match the document would have broken a test that has been green since phase 39. Every count in every document for these four arrays is wrong in the same direction — inflated — which is consistent with a naive count over the array literal also counting the quoted dot-paths inside the explanatory comments.

The new regression test carries the measured numbers **and** the reason, so this cannot be re-litigated from a document next phase.

## Negative proofs — all five RUN, each failing by name, then restored

Every probe was applied, the suite run, the failure read, and the file restored with `git checkout -- <specific file>`. Working tree verified clean and 11/11 green after each.

**1. A 62nd `views` string, added to all three locales** (the plan's stated success criterion, in its discriminating form).
Result: **exactly one failing test, three assertions**, all named `views key set in {locale}.json diverges from the checked-in contract`. Every other gate passed — including `missingIn`, the cross-locale identity check and the whole-file key-set check. Adding it to all three locales rather than just `en-US` is what makes this proof discriminating: the pre-existing gates cannot see a key that is present and translated everywhere but ungated, and this is precisely the gap `REQUIRED_VIEWS_KEYS` closes.

**2. `views.manage.filterCount` flattened to `{count} filtros` in pt-BR** (T-40-12).
Result: one failing test, `views.manage.filterCount must keep its {count, plural, …} wrapper in every locale`, reporting `pt-BR: lost {count, and plural,`. **`placeholderDrift` passed** — the flattened message has placeholder set `{count}` while the en-US plural wrapper yields an *empty* expected set and is skipped by `continue`. T-40-12's claim is now demonstrated rather than asserted: the `ICU_PLURAL_KEYS` entry is the only thing standing between a translator and a silently unpluralised count.

**3. `{name}` dropped from `views.delete.body` in es-ES.**
Result: one failing test, naming `views.delete.body` with `es-ES: []` against `expected: ["{name}"]`.

**4. `views.badgeShared` set to the en-US "Shared" in BOTH pt-BR and es-ES.**
Result: one failing test, `untranslatedInBoth` returning `["views.badgeShared"]`. This also validates the decision not to touch the allowlist: the gate discriminates a genuinely skipped translation, and none of the 61 keys tripped it as shipped.

**5. `bulk.viewsExported` appended to `REQUIRED_BULK_KEYS`, taking it to the 47 the documents claim.**
Result: the new pin fires with its own sentence — `phase 40 REUSES bulk.exported and bulk.error.exportFailed: expected [...] to have a length of 46 but got 47`. The failure message names the mistake rather than just the number.

## Decisions Made

- **The file wins over every document.** Counts were obtained by evaluating the module, not by grepping. See the table above.
- **Placement after `dedup`, before `settings`.** The catalogs are not alphabetical — they are phase-ordered (`notes` 35, `audit` 36, `trash` 37, `bulk` 38, `dedup` 39), so `views` for phase 40 belongs at index 15 in all three. Verified identical position in each file.
- **`IDENTICAL_TRANSLATION_ALLOWED` untouched at 3.** L-5 was honoured by running the gate. The three near-misses (`views.modified` = "Modificada" in both, `views.manage.filterCount`, `views.export.disabledReason`) are identical *to each other*, which `untranslatedInBoth` does not test, and all differ from en-US.
- **No occurrence-count assertion for `views`.** No `views.*` key repeats a placeholder (the ten interpolating keys use each token once), so a `dedup.merge.confirmBody` analogue would be vacuous. Stated in a comment on that test so a checker does not ask for it.
- **Edits anchored, never substituted.** `Edit` on unique anchors throughout; no `sed`. The 39-20 near-miss is avoided by construction — `"notes"` is a leaf name in `organizations`, `people` and `audit.field`, and the diffs confirm all three are untouched.

## Copy notes

- `views.ownedBy` is `"by {owner}"` / `"de {owner}"` — a bare interpolation with no surrounding grammar, so it reads correctly whether the caller passes a name or falls back to an email. Two of three live users have `name = NULL`.
- `views.ownerUnavailable` covers the soft-deleted owner (six such users exist), so attribution never renders an empty string or a raw id.
- `badgeShared`/`badgePrivate`/`badgeDefault` are words, honouring phase 39's convention that state must never be carried by colour alone: a shared view is distinguishable from a private one in text.
- `views.export.disabledReason` and `views.save.targetNewOnly` are advisories that explain a refusal rather than leaving a control dead and silent (C-1). Neither is phrased as an error.
- `views.save.privateHelp` is the T-40-11 string — the only place the user learns that a private view is hidden from admins too. Transcribed verbatim in all three locales; a softened translation here would be a false security promise.

## Deviations from Plan

None — plan executed exactly as written. No deviation rule was invoked.

The plan's own RED prediction was accurate: it said "roughly 6 failing assertions" and the RED run produced **6 soft-assertion failures across 4 failing tests** — `missingIn` (1), the exact-set loop (3, one per locale), `blankIn` (1), and the ICU wrapper (1).

Worth recording for the next executor, in the spirit of 39-20's corrected prediction: `untranslatedInBoth` and `placeholderDrift` **passed during RED**, which initially looks like the wiring failed. It is correct. Both functions resolve the en-US value first and bail (`return false` / `continue`) when it is `undefined`, so a contract key that exists in no locale is invisible to them. They only begin to gate once the keys are present — which is exactly when they matter, and which the negative proofs above confirm they then do.

## Issues Encountered

**Stale worktree base, as forecast.** HEAD was at `cbf3229`, an *ancestor* of the expected base `86c9002` — the worktree was created from an older commit. Corrected with the sanctioned `git reset --hard 86c9002` from the branch-check step, verified, then bootstrapped the three symlinks. `git status` clean afterwards. This is the same failure mode reported by 13 of 13 executors in phase 39.

**Test output filtered by the `rtk` hook.** `console.log` from the measurement probe was stripped from normal `npx vitest` output, and `grep -n` output was reshaped. Worked around with `rtk proxy <cmd>`, which is the documented escape hatch. Not a project defect, but the next executor who needs to read raw test output should know.

## Deferred Issues

**`bulk.exported` is an ICU plural that is NOT in `ICU_PLURAL_KEYS`.** Discovered while verifying the reused keys: `bulk.exported` is `{count, plural, one {# record exported.} other {# records exported.}}` in en-US and correctly pluralised in both other locales — so there is **no live defect** — but its wrapper is ungated. `placeholderDrift` cannot see it (empty expected set) and it is absent from the ICU list, so a future translator could flatten it silently.

**Not fixed here, deliberately.** It is pre-existing (phase 38), outside this plan's declared files in spirit, and this plan's verification pins `ICU_PLURAL_KEYS` at exactly 12 — adding a thirteenth entry would fail the criterion this plan was given. It is also worth checking as a class rather than one key: `deals.kanban.dealsCount` is another plural in the catalog that is not in the list. Recommend a dedicated sweep that derives the ICU list's *completeness* — i.e. asserts that every en-US message containing `plural,` appears in `ICU_PLURAL_KEYS` — which would close the whole class instead of one instance.

## User Setup Required

None — no external service configuration, no dependency change, no migration. Nothing was installed (T-40-SC).

## Next Phase Readiness

- Every `views.*` key the phase needs exists in all three locales. Waves 3-5 can call `useTranslations("views")` immediately; no UI plan has an excuse for a hardcoded literal.
- The contract is enforcing: any UI plan that invents a 62nd string gets a red suite naming the divergence, in the same run as every other broken contract (`expect.soft` throughout).
- `bulk.exported` and `bulk.error.exportFailed` are confirmed present and reused verbatim; the export plans need add nothing to `bulk`.
- Sibling isolation held: only `src/messages/**` touched. Nothing in `src/lib/views/**` (40-01), `src/db/schema/**` or `drizzle/**` (40-02).
- Suite state: `npx vitest run src/messages/` 11/11 green, `npm run typecheck` clean.

## Self-Check: PASSED

- `src/messages/locale-parity.test.ts` — FOUND, `REQUIRED_VIEWS_KEYS` present, 61 entries asserted
- `src/messages/en-US.json` / `pt-BR.json` / `es-ES.json` — FOUND, 61 `views.*` leaves each (counted with a JSON flattener, 938 total leaves per file, `views` at index 15 in all three)
- Commit `74ee5f9` — FOUND
- Commit `01406e6` — FOUND
- `npx vitest run src/messages/` — 11/11 passed
- `npm run typecheck` — clean
- `git status` — clean; all five negative-proof mutations restored
- Sibling boundaries — only `src/messages/**` in the diff; no `src/lib/views/**`, `src/db/schema/**` or `drizzle/**`
- Locale JSON diffs — 73 insertions, 0 deletions each; no pre-existing key modified

---
*Phase: 40-saved-views-shared-filters*
*Completed: 2026-08-21*
