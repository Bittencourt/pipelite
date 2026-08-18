---
phase: 45-cross-cutting-ui-repair-and-uat-closure
plan: 01
subsystem: i18n
tags: [next-intl, icu-messageformat, locale-parity, vitest, message-catalog]

# Dependency graph
requires:
  - phase: 36-audit-log
    provides: REQUIRED_AUDIT_KEYS and the shared assertion bodies in locale-parity.test.ts
  - phase: 37-trash-and-restore
    provides: the TRASH_EXTRA_KEYS cross-namespace contract idiom this plan copies
  - phase: 38-bulk-operations
    provides: REQUIRED_BULK_KEYS and the bulk.failures.* namespace the two new hint branches join
provides:
  - "admin.nav.* (12 keys) in en-US, pt-BR and es-ES — the 11 admin sidebar entries plus openMenu"
  - "theme.* (4 keys) as a new top-level namespace — label, light, dark, system"
  - "nav.workflows and nav.searchDescription"
  - "bulk.failures.retryHintPartial (ICU plural) and bulk.failures.prunedHint"
  - "audit.field.movedToTrash and audit.field.restoredFromTrash as flat siblings"
  - "REQUIRED_SHELL_KEYS + SHELL_EXTRA_KEYS contract, gated by all five shared assertion bodies"
  - "IDENTICAL_TRANSLATION_ALLOWED populated with the three product nouns"
  - "an explicit ICU-plural structure assertion, closing the placeholderDrift blind spot"
affects: [45-02, 45-03, 45-04, 45-05, admin-sidebar, theme-toggle, nav-header, bulk-failure-report, audit-presentation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "REQUIRED_<NS>_KEYS + <NS>_EXTRA_KEYS for a copy contract that spans namespaces"
    - "expect.soft for per-contract assertions so every broken contract names itself in one run"
    - "a dedicated ICU-marker assertion where the generic placeholder regex provably cannot reach"

key-files:
  created: []
  modified:
    - src/messages/locale-parity.test.ts
    - src/messages/en-US.json
    - src/messages/pt-BR.json
    - src/messages/es-ES.json

key-decisions:
  - "Shell contract scoped to admin.nav.* + theme.* with nav.workflows/nav.searchDescription as SHELL_EXTRA_KEYS, so the 12 pre-existing nav keys are not dragged into an exact-set contract"
  - "IDENTICAL_TRANSLATION_ALLOWED holds exactly admin.nav.pipelines, admin.nav.webhooks and nav.workflows, each with a recorded reason rather than a blanket exemption"
  - "ICU plural structure gated by a dedicated assertion, not by placeholderDrift — its /\\{[a-zA-Z0-9_]+\\}/g regex cannot match {count, plural, ...} and silently checks nothing"
  - "Per-contract assertions converted to expect.soft so all five contracts report in one run instead of only the earliest-listed broken one"
  - "22 keys asserted, not the 23 in 45-UI-SPEC's section heading — its own five tables enumerate 22 and are authoritative"

patterns-established:
  - "Cross-namespace copy contract: REQUIRED_<NS>_KEYS for the namespaces a phase owns, <NS>_EXTRA_KEYS for strays in pre-existing namespaces, one <NS>_CONTRACT_KEYS concatenation to gate"
  - "Soft per-contract assertions: a block gating N contracts uses expect.soft so a failure diff names every broken contract, which is the whole point of passing them separately"
  - "Where a generic gate provably cannot reach a syntax, add a dedicated assertion and say so in the comment rather than over-claiming coverage"

requirements-completed: [SC-3, SC-4]

# Metrics
duration: 10min
completed: 2026-08-18
---

# Phase 45 Plan 01: Message Key Catalog and Locale Contract Summary

**22 new shell, bulk and audit message keys landed in all three locales behind a `REQUIRED_SHELL_KEYS` contract and an explicit ICU-plural assertion, so an untranslated or structurally-broken string is now a red suite rather than a shipping defect.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-08-18T09:04:00Z
- **Completed:** 2026-08-18T09:14:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- **The 22 keys exist in `en-US`, `pt-BR` and `es-ES`.** All three files went from 770 to 792 leaves and carry an identical key set. Every other plan in this phase consumes these keys; next-intl resolves a missing key at render time, so landing them in Wave 1 is what stops a later UI plan from shipping a broken page no source gate catches.
- **`REQUIRED_SHELL_KEYS` (16) + `SHELL_EXTRA_KEYS` (2) is now gated by all five shared assertion bodies** — `missingIn`, `blankIn`, `untranslatedInBoth`, `placeholderDrift`, plus an exact-set assertion against the shipped `admin.nav.*` / `theme.*` key sets. The whole-file parity check already caught a *missing* key; this is the first gate that catches an English string pasted into `pt-BR.json`.
- **`IDENTICAL_TRANSLATION_ALLOWED` moved from `[]` to exactly three entries**, each with a recorded reason in the doc block. Without them the `untranslatedInBoth(SHELL_CONTRACT_KEYS)` assertion would fail on copy that is correct.
- **Closed Pitfall 5 (the ICU blind spot).** `placeholderDrift()` computes an empty expected set for `{count, plural, one {# …} other {# …}}` and skips the key entirely, so it was defending nothing. A dedicated `it()` block now asserts the `{count,` and `plural,` markers per locale and its comment states plainly that the generic gate does not cover ICU syntax.
- **`REQUIRED_BULK_KEYS` 44 → 46 and `REQUIRED_AUDIT_KEYS` 79 → 81**, which the exact-set assertions made mandatory rather than optional.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend the locale contract lists and prove them RED** — `650b676` (test)
2. **Task 2: Write the 22 keys into all three locale files** — `f472bec` (feat)

_TDD gate sequence: `test(45-01)` (RED) → `feat(45-01)` (GREEN). No refactor commit was needed._

## Files Created/Modified

- `src/messages/locale-parity.test.ts` — added `REQUIRED_SHELL_KEYS`, `SHELL_EXTRA_KEYS`, `SHELL_CONTRACT_KEYS`, `SHELL_NAMESPACES`, `shellKeys`, `ICU_PLURAL_MARKERS`, `icuPluralReport()`; extended `REQUIRED_BULK_KEYS` and `REQUIRED_AUDIT_KEYS`; populated `IDENTICAL_TRANSLATION_ALLOWED`; added one `expect` per shared assertion block plus a shell exact-set assertion and a standalone ICU `it()` block. 7 tests, was 6.
- `src/messages/en-US.json` — +22 keys (`admin.nav` object, top-level `theme` object, 2 `nav`, 2 `bulk.failures`, 2 `audit.field`)
- `src/messages/pt-BR.json` — the same 22 keys, translated
- `src/messages/es-ES.json` — the same 22 keys, translated

## Decisions Made

- **22 keys, not 23.** 45-UI-SPEC's section heading says "23 keys × 3 locales" but its own five tables enumerate 22. The plan already flagged this; the tables were treated as authoritative and 22 is what the contract lists assert.
- **Shell contract scoped to `admin.nav.*` + `theme.*`, with the two `nav` additions carried as `SHELL_EXTRA_KEYS`.** Scoping the contract to the whole `nav` namespace would have pulled its 12 pre-existing keys into an exact-set assertion, turning a two-string addition into a namespace rewrite. `TRASH_EXTRA_KEYS` was the precedent.
- **V-1 verified before writing, not assumed.** All eight `admin.nav.*` strings with an existing `admin.dashboard.*` / `admin.webhooks.title` twin were read out of the shipped catalogs and confirmed byte-identical to the UI-SPEC values, so the sidebar and the dashboard tile for the same route cannot disagree. `admin.nav.title` is the one deliberate divergence (pt-BR "Painel de Administração" vs `admin.dashboard.title`'s "Painel Administrativo"), per the UI-SPEC.
- **`admin.nav` appended at the tail of `admin`, `theme` at the tail of the root object.** Insertion order does not affect any assertion (all comparisons sort), and appending keeps each locale diff purely additive: +29 / −3 lines per file, with the three deletions being the trailing commas.
- **Keys written via a script that round-trips `JSON.stringify(obj, null, 2) + "\n"`**, after verifying that transform reproduces all three files byte-for-byte. That is what guarantees "do not reformat, re-sort or re-indent any existing key" rather than hoping a hand edit did not drift.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Converted the per-contract assertions to `expect.soft`**

- **Found during:** Task 1 (RED verification)
- **Issue:** The plan's acceptance criteria require the RED output to name both `bulk.failures.retryHintPartial` and `admin.nav.openMenu`. It named neither pair reliably: plain `expect` throws on the first failure, so with five contracts in one `it()` block only `REQUIRED_AUDIT_KEYS` — the earliest-listed broken contract — was ever reported, and the bulk and shell contracts were invisible behind it. This also silently defeated the rule the file's own header states at lines 469-474: contracts are passed separately "so a failure diff names which contract broke".
- **Fix:** The per-contract calls in the four shared assertion blocks, the four exact-set loops and `expectIdenticalKeySets()` now use `expect.soft`. Soft assertions still fail the test on exactly the same conditions; they only let every broken contract name itself in one run. The standalone ICU assertion stays hard (`expect`) — it gates one key and has nothing to run alongside it. The header comment was rewritten to record why.
- **Files modified:** `src/messages/locale-parity.test.ts`
- **Verification:** After the change the RED run exits non-zero and names `bulk.failures.retryHintPartial` (13 occurrences), `admin.nav.openMenu` (9) and `nav.searchDescription` (9). After Task 2 all 7 tests pass. Pass/fail behaviour of every pre-existing assertion is unchanged — only the reporting breadth differs.
- **Committed in:** `650b676` (Task 1 commit)

**2. [Rule 2 - Missing Critical] Verified the new ICU messages actually parse and render**

- **Found during:** Task 2
- **Issue:** Every gate in the plan checks the ICU wrapper by *substring* (`{count,`, `plural,`). None of them parses the message. An unparseable ICU string — or an apostrophe read as an ICU escape, which `what's there now` is a live candidate for, since `'` is ICU's quoting character — would pass all four contract assertions and then throw at render time in the exact locale nobody tests by hand.
- **Fix:** Ran all three locales' `retryHintPartial`, `prunedHint` and the unchanged `retryHint` through `intl-messageformat` (the parser next-intl uses) at `count` 1 and 3. All twelve renders are correct: plural categories select properly, `#` substitutes, and the apostrophes render literally — ICU only treats `'` as an escape before `{`, `}` or `#`, and `'s` is none of those. No source change was required; this is a verification gap that was closed, not a defect.
- **Files modified:** none
- **Verification:** 12/12 renders correct, output inspected per locale.
- **Committed in:** n/a (verification only, no code change)

---

**Total deviations:** 2 (1 blocking auto-fix, 1 missing-critical verification)
**Impact on plan:** The soft-assertion change was required to satisfy the plan's own RED acceptance criteria and makes the file honour the rule its header already stated. Neither deviation added scope: no new key, no new contract, no dependency.

## Issues Encountered

None. Both tasks ran clean; the only surprise was vitest's fail-fast masking the shell contract, handled as deviation 1.

## Verification Results

| Check | Result |
|---|---|
| `vitest run src/messages/locale-parity.test.ts` (RED, before Task 2) | exit 1, 4 of 7 failed, naming `admin.nav.openMenu`, `nav.searchDescription`, `bulk.failures.retryHintPartial`, `audit.field.movedToTrash` |
| `vitest run src/messages/locale-parity.test.ts` (after Task 2) | 7/7 passed |
| `npm run test` (both vitest projects) | exit 0 — 2091 passed / 21 skipped, plus 8 passed |
| `npm run typecheck` | exit 0 |
| `npm run lint` | 0 errors (127 pre-existing warnings, none in the touched files) |
| Identical whole-file key sets | 792 leaves in all three locales |
| `admin.nav.title` pt-BR / `theme.dark` pt-BR / `nav.workflows` | "Painel de Administração" / "Escuro" / "Workflows" |
| ICU markers in `retryHintPartial` | `{count,` and `plural,` present in all three locales |
| ICU render (`intl-messageformat`, count 1 and 3) | 12/12 correct across three locales |

## Known Stubs

None. This plan ships data, not behaviour: every key it adds is a final translated string. The consuming components land in later plans of this phase, which is the intended wave ordering — the keys exist *before* the UI that renders them, not after.

## Threat Flags

None. No new network endpoint, auth path, file access pattern or schema change. `bulk.failures.retryHintPartial` interpolates a single numeric `{count}` and no server prose, id or entity name (T-45-02, disposition `accept`). No package-manager operation occurred (T-45-SC).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Wave 2 is unblocked.** Every message key the remaining Phase 45 plans render now exists in all three locales, so `admin-sidebar.tsx`, the `UserMenu` theme toggle, `nav-header.tsx` and `bulk-failure-report.tsx` can call `t()` immediately.
- **The contract lists are the interface.** A plan adding a 13th `admin.nav.*` string must add its dot-path to `REQUIRED_SHELL_KEYS` in the same change or the exact-set assertion fails — which is the point.
- **No Docker rebuild was needed or performed here.** Any later plan whose verification is a browser assertion still owes `docker compose up -d --build`; the image is a stale production build with no volume mount.
- **One upstream inconsistency remains unfixed by design:** 45-UI-SPEC § New message keys still says "23 keys" in its heading against 22 rows in its tables. The code asserts 22. A future editor of that document should correct the heading, not the tables.

---
*Phase: 45-cross-cutting-ui-repair-and-uat-closure*
*Completed: 2026-08-18*

## Self-Check: PASSED

All 4 modified files verified present on disk; both task commits (`650b676`, `f472bec`) verified in git history.
