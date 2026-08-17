---
phase: 38-bulk-operations
plan: 01
subsystem: ui
tags: [next-intl, i18n, icu-messageformat, vitest, locale-parity]

# Dependency graph
requires:
  - phase: 35-notes-timeline
    provides: "locale-parity.test.ts and the REQUIRED_NOTE_KEYS checked-in-contract pattern this plan is the fourth instance of"
  - phase: 36-audit-log
    provides: "REQUIRED_AUDIT_KEYS plus the exact-contract assertion that catches an ungated extra key"
  - phase: 37-trash-restore
    provides: "REQUIRED_TRASH_KEYS, the fail-closed retention copy pattern (bodyNoRetention) that bulk.deleteDialog.descriptionNoRetention mirrors, and audit.field.owner terminology"
provides:
  - "44 bulk.* copy keys in en-US, es-ES and pt-BR — the entire phase 38 copy contract, landed before any consumer exists"
  - "REQUIRED_BULK_KEYS exported from src/messages/locale-parity.test.ts"
  - "BULK_NAMESPACE + bulkKeys selector wired into all five shared assertion bodies plus a per-locale exact-contract assertion"
  - "the four-code closed set bulk.reason.{notFound,notPermitted,alreadyDeleted,unknown} that plans 38-11..38-14 must return codes against"
affects: [38-02, 38-03, 38-04, 38-05, 38-06, 38-07, 38-08, 38-09, 38-10, 38-11, 38-12, 38-13, 38-14, 38-15, 38-16, 38-17, 38-18, 38-19, 38-20]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "fourth checked-in copy contract in locale-parity.test.ts, passed separately to every assertion body"
    - "namespace-total exact-contract assertion (no EXTRA_KEYS sibling) for a namespace with zero out-of-namespace strings"

key-files:
  created: []
  modified:
    - src/messages/en-US.json
    - src/messages/es-ES.json
    - src/messages/pt-BR.json
    - src/messages/locale-parity.test.ts

key-decisions:
  - "The bulk namespace is placed between trash and settings in all three locale files, keeping the feature namespaces contiguous in the order they were added"
  - "pt-BR renders Owner as Proprietario, matching audit.field.owner / deals.owner, NOT Responsavel — that word is already Assignee in this app and reusing it would collide on the Activities surface"
  - "es-ES uses oferta / ofertas for Deal in selectAllInStage and selectAllInStageCapped, matching the existing deals namespace rather than negocio"
  - "bulkKeys deliberately has no *_EXTRA_KEYS sibling, which makes the exact-contract assertion total over the namespace"
  - "The ungated-extra-key negative proof used DISTINCT values per locale (x/y/z) rather than the plan's identical x, so that only the exact-contract assertion could possibly fail — a stronger proof that the new gate is the one doing the work"

patterns-established:
  - "Copy-first plan ordering: the whole namespace lands in one commit because locale-parity.test.ts's whole-file parity gate is unscoped, making every downstream plan additively green"
  - "A capped select-all variant is a plain-placeholder string, not an ICU plural, when its {max} is a constant and therefore never singular"

requirements-completed: [BULK-01, BULK-02, BULK-03, BULK-04]

# Metrics
duration: 17min
completed: 2026-08-17
---

# Phase 38 Plan 01: Bulk Copy Contract Summary

**44 `bulk.*` keys landed in all three locale files with `REQUIRED_BULK_KEYS` enforcing them through five assertion bodies plus a namespace-total exact-contract assertion, both gate directions proven red by temporary mutation.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-08-17T10:42:00Z
- **Completed:** 2026-08-17T10:59:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- The phase's entire copy contract is checked in: 44 keys × 3 locales = 132 strings, all ICU-parse-verified, landed before any component calls `useTranslations("bulk")`.
- `locale-parity.test.ts` gained a fourth contract that is mechanically total over its namespace: a 45th `bulk.*` string that skips `REQUIRED_BULK_KEYS` now fails the suite, which is the direction a missing-key check structurally cannot see.
- Both gate directions were proven red-then-green by temporary mutation, not asserted on faith (see Verification Evidence below).
- Terminology was reconciled against the existing app rather than translated in isolation — `Owner` resolves to `Propietario`/`Proprietário` (matching `audit.field.owner`) and `Deal` to `oferta`/`negócio` (matching the `deals` namespace).

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the 44 bulk.* keys to all three locale files** - `4038425` (feat)
2. **Task 2: Wire REQUIRED_BULK_KEYS into locale-parity.test.ts** - `c1af024` (test)

## Files Created/Modified

- `src/messages/en-US.json` - new top-level `bulk` namespace, 44 keys, placed between `trash` and `settings`
- `src/messages/es-ES.json` - the same 44 keys, translated (tú register, matching the existing `trash` namespace)
- `src/messages/pt-BR.json` - the same 44 keys, translated (você register, same)
- `src/messages/locale-parity.test.ts` - `REQUIRED_BULK_KEYS`, `BULK_NAMESPACE`, `bulkKeys`, five extra assertion calls, one extra exact-contract block

## Key Inventory Landed

| Group | Count | Notes |
|-------|-------|-------|
| Selection | 4 | includes the 44th key `selectAllInStageCapped` (D-07) |
| Action bar | 7 | |
| Delete dialog | 6 | includes the fail-closed `descriptionNoRetention` (T-38-10) |
| Reassign dialog | 8 | includes the required `noEmailNotice` (T-38-11) |
| Results | 6 | |
| Failure report | 4 | |
| Errors | 5 | |
| Per-record reasons | 4 | a CLOSED set, keyed by code (T-38-07) |
| **Total** | **44** | identical key sets across all three locales |

Zero keys were added outside the `bulk` namespace. Zero existing keys changed — `git diff --stat` on Task 1 reports exactly `3 files changed, 168 insertions(+)`, no deletions.

## Verification Evidence

**Task 1 acceptance criteria — all met:**

- Flattened `bulk` leaf count: `en-US 44`, `es-ES 44`, `pt-BR 44`
- Sorted key-set identity across the three locales: `true`
- `grep -c selectAllInStageCapped`: `1` in each of the three files
- `git diff --stat src/messages/`: exactly the three JSON files, `168 insertions(+)`, 0 deletions
- All 132 messages parse under `@formatjs/icu-messageformat-parser` (an extra check, not in the plan — a malformed ICU plural would otherwise only surface at render time on the locale nobody is testing in)

**Task 2 acceptance criteria — all met:**

- `grep -v '^\s*[*/]' … | grep -c REQUIRED_BULK_KEYS` → **6** (required: ≥6). Declaration + `missingIn` + `blankIn` + `untranslatedInBoth` + `placeholderDrift` + `bulkContract`. The fifth assertion site, `expectIdenticalKeySets(bulkKeys, BULK_NAMESPACE)`, takes the selector rather than the list, which is why the count is 6 and not 7.
- `grep -v '^\s*[*/]' … | grep -c BULK_NAMESPACE` → **4** (required: ≥3)
- `npm run typecheck` → 0 errors
- `npm run lint` → 0 errors, 0 findings of any severity in `src/messages/`

**Negative proof 1 — the ungated 45th key (the exact-contract gate):**

Added `bulk.zzUngated` to all three locale files with **distinct** values (`x` / `y` / `z`) rather than the plan's identical `x`, deliberately, so that no other gate could claim the failure. Result: **1 of 6 tests failed** — only the exact-contract assertion:

```
AssertionError: bulk key set in en-US.json diverges from the checked-in contract:
  expected [ 'bulk.actionBarLabel', …(44) ] to deeply equal [ 'bulk.actionBarLabel', …(43) ]
FAIL  locale parity > the notes, audit, trash and bulk namespaces have identical key sets across all three locales
Tests  1 failed | 5 passed (6)
```

Note what stayed green: the missing-key check, the blank check, the untranslated check, the placeholder check, **and the whole-file parity gate** — because the key was present and consistent in all three files. This is exactly the hole the exact-contract assertion exists to close. Reverted with `git checkout --` on the three JSON files.

**Negative proof 2 — a missing key:**

Deleted `bulk.reason.unknown` from `pt-BR.json`. Result: **4 of 6 tests failed**:

```
AssertionError: bulk key set differs in pt-BR.json:
  expected [ 'bulk.actionBarLabel', …(42) ] to deeply equal [ 'bulk.actionBarLabel', …(43) ]
AssertionError: pt-BR.json key set diverges from en-US.json:
  expected { …(2) } to deeply equal { missing: [], extra: [] }
Tests  4 failed | 2 passed (6)
```

Reverted; suite back to `6 passed (6)`.

**Full suite:** `npm test` → `1702 passed | 4 skipped`, all 84 files green.

## Decisions Made

- **`bulk` sits between `trash` and `settings`** in all three files. The locale files order namespaces by when the feature was added; appending after `trash` keeps that convention and makes the diff a single contiguous block per file.
- **pt-BR: `Owner` → `Proprietário`, not `Responsável`.** `activities.assignee` and `audit.field.assignee` are already `Responsável` in pt-BR. Translating "owner" as "responsável" would make the bulk reassign dialog say "Reatribuir responsável" on a surface (Activities) where `assigneeId` is explicitly out of scope for this phase — the copy would name the field the action does not touch.
- **es-ES: `Deal` → `oferta`.** The existing `deals` namespace uses `Oferta`/`ofertas` in es-ES, so `selectAllInStage` and `selectAllInStageCapped` follow it.
- **`bulkKeys` has no `*_EXTRA_KEYS` sibling,** per the plan. The consequence worth naming: because every bulk string lives inside the namespace, `bulkKeys[locale]` is the complete shipped set, so the exact-contract comparison is total rather than partial. `trash` could not have this property.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Symlinked `node_modules` into the worktree**

- **Found during:** Task 1 (verification step)
- **Issue:** `./node_modules/.bin/vitest` did not exist — the git worktree was created without `node_modules` (it is gitignored, so it is not materialised by `git worktree add`). Every automated verification command in both tasks was unrunnable.
- **Fix:** `ln -s /home/pedro/programming/pipelite/node_modules <worktree>/node_modules`. This is **not** a package install: no registry fetch, no `npm install`, no new package, no lockfile change. It points at the already-installed, already-audited tree in the main checkout, so the package-legitimacy checkpoint in Rule 3's exclusion does not apply.
- **Files modified:** none tracked. `/node_modules` is line 4 of `.gitignore`, confirmed, and `git status --short` shows the symlink is not picked up.
- **Verification:** `./node_modules/.bin/vitest run`, `npm run typecheck`, `npm run lint` and `npm test` all execute. `git status --short` after the symlink lists only the three intended JSON files.
- **Committed in:** nothing — untracked and correctly ignored.

**2. [Rule 2 - Missing Critical] Added an ICU parse check over all 132 messages**

- **Found during:** Task 1 (before committing)
- **Issue:** The plan's gates cover key presence, non-emptiness, translation, and simple-placeholder drift. None of them parse the ICU plural skeleton. `placeholderDrift` explicitly does not — the plan and 38-PATTERNS § 15 both note that `/\{[a-zA-Z0-9_]+\}/g` yields no match for `{count, plural, …}`. A malformed plural in es-ES would therefore pass all six tests and throw at render time, on the one locale nobody is clicking through.
- **Fix:** Ran every one of the 132 shipped strings through `@formatjs/icu-messageformat-parser` (already a transitive dependency of `next-intl`; nothing installed). All 132 parse.
- **Files modified:** none — this was a verification step, not a code change. No new test file was added, since adding an ICU-validity assertion to `locale-parity.test.ts` for the `bulk` contract alone would leave `notes`/`audit`/`trash` ungated and is a whole-file change this plan does not own. See Next Phase Readiness.
- **Verification:** `all 132 messages parse`
- **Committed in:** n/a

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical verification)
**Impact on plan:** Neither changed the plan's output. The symlink was required to run any verification at all; the ICU check closed a real blind spot in the gate set before 132 strings were committed. No scope creep — no file outside the plan's four `files_modified` was touched.

## Issues Encountered

- **One flaky test in the full suite, unrelated to this plan.** The first `npm test` run reported `1 failed | 1702 passed`: `src/lib/execution/condition-evaluator.test.ts:616`, `expect(large / small).toBeLessThan(10)` — a wall-clock ratio assertion whose own comment acknowledges it is tolerating timing jitter. It passed on re-run. This plan touches only locale JSON and one test file, so it cannot affect condition-evaluation timing. Out of scope per the executor scope boundary; recorded here rather than fixed, and worth noting for whichever phase next sees a spurious red suite.

## Threat Model Coverage

| Threat ID | Disposition | Status after this plan |
|-----------|-------------|------------------------|
| T-38-07 (info disclosure via error prose) | mitigate | The closed four-code reason set is now DEFINED and gated. `REQUIRED_BULK_KEYS` is the enforcement point: a fifth reason requires a fifth key here first, so plans 38-11..38-14 cannot quietly widen the set. |
| T-38-10 (copy lies about retention) | mitigate | Both `description` and `descriptionNoRetention` shipped as separate strings in all three locales. No `{days}` default exists anywhere in the copy — a consumer that wants a number must have read one. |
| T-38-11 (copy promises an unbuilt notification) | mitigate | `reassignDialog.noEmailNotice` shipped in all three locales and is in the contract, so it cannot be dropped from a dialog later without a red suite. |
| T-38-SC (package tampering) | accept | Zero packages installed. Zero registry fetches. The `node_modules` symlink points at the pre-existing main-checkout tree; `package.json` and the lockfile are untouched. |

## Known Stubs

None. This plan ships data (copy strings) and a gate, not components — there is no rendering path to stub. The 44 keys have no consumer yet **by design**: the plan's whole purpose is to land the contract first so every downstream plan in the phase is additively green. That is a documented sequencing decision, not an unwired stub.

## Threat Flags

None. This plan introduces no network endpoint, no auth path, no file access and no schema change. Its entire surface is three JSON data files and one test file.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Every downstream plan in phase 38 can now call `useTranslations("bulk")` for any of the 44 dot-paths** and the parity suite stays green with no locale work. This was the plan's whole point.
- **The gate is now closed in both directions**, so a plan that invents a 45th string fails immediately rather than shipping copy nothing translates.
- **Note for consumers of the reason codes (38-11..38-14):** the four `bulk.reason.*` codes are the complete permitted vocabulary. Returning a fifth code from a server action will render as a missing-key error, and adding the fifth key without adding it to `REQUIRED_BULK_KEYS` will fail the exact-contract assertion. Both directions are intentional.
- **One deferred hardening, out of scope here:** `locale-parity.test.ts` has no ICU-validity assertion for any of its four contracts. This plan verified the 132 new strings parse, out-of-band, but did not add a permanent gate — doing so properly means covering `notes`, `audit` and `trash` too, which is a whole-file change this plan does not own. Worth a small dedicated plan; a malformed plural currently ships green.

---
*Phase: 38-bulk-operations*
*Completed: 2026-08-17*

## Self-Check: PASSED

All four claimed files exist on disk (`src/messages/{en-US,es-ES,pt-BR}.json`, `src/messages/locale-parity.test.ts`). Both claimed commits exist in `git log --all`: `4038425`, `c1af024`. Working tree clean after both task commits; neither commit deleted a tracked file.
