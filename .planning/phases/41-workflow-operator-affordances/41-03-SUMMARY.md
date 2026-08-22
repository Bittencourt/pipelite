---
phase: 41-workflow-operator-affordances
plan: 03
subsystem: ui
tags: [i18n, next-intl, locale-parity, vitest, copywriting]

# Dependency graph
requires:
  - phase: 40-saved-views
    provides: "the `views` locale contract this one copies — REQUIRED_VIEWS_KEYS, the total-namespace exact-contract assertion, and the standing warning that every key count quoted in a planning doc is wrong"
provides:
  - "the `workflows` message namespace (23 keys: replay 8, dryRun 15) in en-US, pt-BR and es-ES"
  - "settings.notifications.workflowFailed + workflowFailedDescription in all three locales"
  - "emails.workflowFailed.* (subject, heading, body, errorLabel, buttonText) in all three locales, per amendment A5 / D-A5"
  - "REQUIRED_WORKFLOWS_KEYS — a TOTAL, count-free exact-contract gate for the `workflows` namespace"
  - "gate G-5: no phase-41 message value may assert that nothing changed (F-41-1)"
  - "gate G-9: no literal brace outside a recognised placeholder in any phase-41 value (T-41-13)"
  - "gate T-41-15: emails.workflowFailed.* interpolates the workflow name and never the run error"
  - "gate T-41-17: workflows.dryRun.action and .badge must be distinct strings in every non-reference locale"
affects: [41-04, 41-05, 41-08, 41-13, 41-14, "every later phase-41 UI plan that calls useTranslations / getTranslations"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "count-free contract pinning: `new Set(arr).size === arr.length` instead of `toHaveLength(n)`"
    - "sibling key lists (WORKFLOW_SETTINGS_KEYS / WORKFLOW_EMAIL_KEYS) instead of widening the namespaced contract, so the namespace comparison stays exact in both directions"
    - "scan helpers that return `{ offenders, scanned }` so the caller can assert the scan was not vacuous"

key-files:
  created: []
  modified:
    - src/messages/locale-parity.test.ts
    - src/messages/en-US.json
    - src/messages/pt-BR.json
    - src/messages/es-ES.json

key-decisions:
  - "No key count is pinned anywhere for the workflows contract — 41-UI-SPEC says 25, 41-VALIDATION says 23, and the array is normative while both documents are descriptive. The duplicate guard is `Set.size` vs the array's own length, so it cannot be wrong."
  - "emails.workflowFailed.* IS localised (D-A5 / amendment A5) and is an APPROVED addition to 41-UI-SPEC's published manifest, not scope creep. A failure alert is the app's own voice, its recipient is a real `users` row, and `users.locale` exists."
  - "The two settings.notifications keys and the five emails.workflowFailed keys are held in sibling arrays (WORKFLOW_SETTINGS_KEYS / WORKFLOW_EMAIL_KEYS) rather than added to REQUIRED_WORKFLOWS_KEYS, per L-41-2 — widening the array to reach into other namespaces is what would make the 'total' claim false."
  - "The G-5 and G-9 scans return a `scanned` count and their `it` blocks assert it hard against `PHASE_41_AUTHORED_KEYS.length * LOCALES.length`, so an offender map of {} can never be the result of a scan that examined nothing."
  - "`workflows` was placed immediately after `views` in all three files rather than alphabetically: the files are in insertion order, not alphabetical order, and the local convention is that each phase's namespace is appended after the previous phase's."
  - "New pt-BR and es-ES values use full diacritics, matching the recent `views` / `dedup` namespaces rather than the older unaccented `settings.notifications` siblings."

patterns-established:
  - "Total namespace contract with no extras sibling: REQUIRED_WORKFLOWS_KEYS is compared with `toEqual` against the shipped sorted key set per locale, so a key added without entering the array fails."
  - "Hard anti-vacuity assertion on a namespace scope before any soft assertion scoped to it, because downstream scans reuse the same scope."
  - "Availability-framed brace gate: strip `/\\{[a-zA-Z0-9_]+\\}/g`, then refuse either remaining brace, because next-intl throws at render on a literal brace in a message it parses."

requirements-completed: [WFOPS-01, WFOPS-02, WFOPS-03]

# Metrics
duration: 12min
completed: 2026-08-22
---

# Phase 41 Plan 03: Locale Contract and Copy Summary

**The `workflows` message namespace (23 keys), two `settings.notifications` keys and the localised `emails.workflowFailed` template land in en-US, pt-BR and es-ES behind a TOTAL, count-free parity contract plus three new phase gates (G-5 absence-assertion, G-9 literal-brace, T-41-15 no-run-error-placeholder).**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-22T23:27:00Z (approx — capture of PLAN_START_TIME was skipped)
- **Completed:** 2026-08-22T23:39:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `REQUIRED_WORKFLOWS_KEYS` checked in as a **total** contract: the exact-contract `toEqual` per locale
  fails both on a missing key and on a 24th `workflows.*` key that never entered the array. No
  `*_EXTRA_KEYS` sibling exists, because 41-UI-SPEC declares no `workflows.*` string outside the
  namespace.
- **Zero counts pinned.** No `toHaveLength` on `REQUIRED_WORKFLOWS_KEYS`, and no `WORKFLOWS:` row added
  to the pre-existing pinned-length test. What the pinned length was buying — catching a list that
  repeats one dot-path and drops another — is bought by
  `new Set(REQUIRED_WORKFLOWS_KEYS).size === REQUIRED_WORKFLOWS_KEYS.length`, which is self-referential.
- All 30 leaves × 3 locales written, translated, in one commit. All three files now carry **968
  identical leaves** (was 938).
- Three new phase-specific gates, each with a hard anti-vacuity assertion: G-5 (no value asserts an
  absence), G-9 (no literal brace outside a placeholder), T-41-15 (the failure template names the
  workflow and never interpolates the run error).
- One extra gate beyond the plan (T-41-17 hardening): `workflows.dryRun.action` and
  `workflows.dryRun.badge` must be **distinct from each other** in every non-reference locale — the one
  assertion `untranslatedInBoth` structurally cannot make, since both are "Test run" in en-US and a
  translator who collapses them still produces values that differ from en-US.

## Task Commits

Each task was committed atomically:

1. **Task 1: REQUIRED_WORKFLOWS_KEYS and the total contract, test-first and RED** — `c4cd650` (test)
2. **Task 2: Write all 30 leaves into the three locale files, translated** — `a3b5924` (feat)

_TDD gate sequence: `test(41-03)` → `feat(41-03)`. No REFACTOR commit — nothing needed cleaning up._

## TDD Gate Compliance

- **RED** (`c4cd650`, before any locale edit): **7 failed / 15 passed of 22 tests, 17 assertion
  failures.** The failing tests were:
  1. `every required … key exists in every locale` — 23 workflows keys + 2 settings + 5 email keys missing per locale
  2. `the notes, audit, trash, bulk, shell, dedup, views and workflows namespaces have identical key sets …` — aborted on the **hard** anti-vacuity assertion (`workflows` scope empty in en-US), before the soft exact-contract `toEqual` could run
  3. `every required … value is a non-empty string`
  4. `the dryRun control and the dryRun badge stay two distinct strings in every locale`
  5. `no string phase 41 authors asserts that nothing changed (G-5 / F-41-1)` — failed on the `scanned` count, not on offenders
  6. `no string phase 41 authors contains a literal brace outside a placeholder (G-9 / L-41-1)` — same
  7. `the failure-alert template interpolates the workflow name and never the run error (T-41-15)`
- **GREEN** (`a3b5924`): `locale-parity.test.ts` **22/22 passed**.

## Observations (NOT gates)

Recorded here because the plan asked for them explicitly, and framed as observations so nobody turns
them into a pinned number later:

- `REQUIRED_WORKFLOWS_KEYS` **evaluates to 23 entries** (replay 8 + dryRun 15). This figure was read by
  evaluating the shipped JSON, not counted from a document. 41-UI-SPEC.md says "25 keys" in its section
  heading because it counts the two `settings.notifications` keys in the same total; 41-VALIDATION.md
  says 23 because it does not. **Both are descriptive. Do not add an assertion for either number.**
- Phase 41 authors **30 leaves per locale**: 23 `workflows.*` + 2 `settings.notifications.*` +
  5 `emails.workflowFailed.*`. Whole-file leaf count went 938 → 968 in each of the three files.
- Test count moved 3860 → 3865 (five new `it` blocks). RSC suite unchanged at 8/8.

## The `dryRun.action` vs `dryRun.badge` divergence

Both are `"Test run"` in en-US and must diverge in translation — the imperative control vs the noun row
label. As shipped:

| Key | en-US | pt-BR | es-ES |
|-----|-------|-------|-------|
| `workflows.dryRun.action` | Test run | **Executar teste** | **Ejecutar prueba** |
| `workflows.dryRun.badge` | Test run | **Teste** | **Prueba** |

pt-BR reproduces the divergence 41-UI-SPEC specifies verbatim; es-ES reproduces the same distinction.
Verified three ways: each differs from en-US, and `action !== badge` within each locale.

## `emails.workflowFailed.*` is an APPROVED addition, not scope creep

Stated here so the UI checker does not read it as a manifest violation. 41-UI-SPEC's § New message keys
lists only `workflows.*` and the two `settings.notifications.*` keys. The five `emails.workflowFailed.*`
keys come from **41-CONTEXT amendment A5 / decision D-A5**, which 41-RESEARCH C-4 left open and required
be recorded: the failure alert is the app's own voice (unlike `workflow-email.ts` and
`workflow-notification.ts`, which carry user-authored content), its recipient is a real `users` row, and
`users.locale` exists at `src/db/schema/users.ts:20`. Option A — localise — was taken. Per L-41-2 these
keys stay OUT of `REQUIRED_WORKFLOWS_KEYS` so the `workflows` contract stays total; they are gated by
`WORKFLOW_EMAIL_KEYS` and by the whole-file parity assertion.

There is deliberately **no `{errorMessage}` placeholder** anywhere (T-41-15, verified by scanning all
three whole files). `workflow_runs.error` can carry 200 characters of an HTTP response body
(`src/lib/execution/actions/http.ts:109-111`); a `{` inside a message next-intl is *parsing* throws at
send time. Hence `errorLabel` plus a separately escaped block rendered outside the translator by plan
41-08.

## Files Created/Modified

- `src/messages/locale-parity.test.ts` — +378/−5. `REQUIRED_WORKFLOWS_KEYS`, `WORKFLOW_SETTINGS_KEYS`,
  `WORKFLOW_EMAIL_KEYS`, `PHASE_41_AUTHORED_KEYS`, `WORKFLOWS_NAMESPACE`, `workflowsKeys`, the
  `absenceAssertionsIn` / `literalBracesIn` scans, five additions to the shared `it` blocks, and four
  new `it` blocks.
- `src/messages/en-US.json` — +38. The `workflows` namespace (after `views`), two
  `settings.notifications` keys (after `weeklyDigestDescription`), `emails.workflowFailed` (after
  `emails.activityReminder`).
- `src/messages/pt-BR.json` — +38. Same key set, translated.
- `src/messages/es-ES.json` — +38. Same key set, translated.

## Decisions Made

1. **`workflows` placed after `views`, not alphabetically.** The plan said "alphabetically among the
   existing top-level keys", but the files are in **insertion order** (`shortcuts home dashboard common
   nav … dedup views settings admin … emails theme`), so alphabetical placement is not a property these
   files have. The local convention is that each phase appends its namespace after the previous
   phase's, which puts `workflows` directly after `views` — and that also happens to be alphabetically
   after it. Key order is irrelevant to every assertion (`flattenKeys` sorts).
2. **Full diacritics in the new pt-BR / es-ES values.** The `settings.notifications` namespace they join
   is unaccented ("Preferencias de Notificacao") but that is legacy: `views` and `dedup` use proper
   accents throughout. New copy follows the newer convention.
3. **Translations rewritten around the G-5 phrase list rather than the list being softened.** The
   natural pt-BR for `replay.error` is *"…então nada foi executado de novo"*, which contains the
   forbidden `"nada foi"`. It ships as *"A repetição não começou, portanto a execução não foi repetida"*
   instead. Same for es-ES `dryRun.error` → *"…ningún paso se ejecutó"* (the forbidden phrase is
   `"ningún registro"`, and this sentence reports a failed start, not an absence of mutation).
4. **`dryRun.description` states what is simulated, in every locale** — *"…are simulated, so nothing
   leaves this app"* / *"…portanto não saem deste aplicativo"* / *"…por lo que no salen de esta
   aplicación"*. A factual property of the execution, never a conclusion about mutation. The proof of
   non-mutation stays the changed-records panel reading empty.

## Deviations from Plan

### Auto-fixed / hardened

**1. [Rule 2 — Missing critical] The G-5 and G-9 scans were vacuous as specified**

- **Found during:** Task 1
- **Issue:** As written, both gates iterate a key list and `continue` past any key that does not
  resolve, so an empty offender map is indistinguishable from "the scan examined nothing". The plan
  explicitly anticipated this ("the two phase gates pass vacuously until task 2 adds values") and
  placed the only anti-vacuity check on `workflowsKeys[locale].length`. That check does not cover the
  `settings` and `emails` keys, which are outside the `workflows` scope, and it does not cover the case
  where a value is deleted from one locale later.
- **Fix:** Both scan helpers now return `{ offenders, scanned }`, and each `it` block asserts
  `scanned === PHASE_41_AUTHORED_KEYS.length * LOCALES.length` **hard**, before the offender
  assertion. G-9 is an availability control (T-41-13); a gate that can silently examine nothing is not
  one.
- **Consequence for the recorded RED shape:** the plan predicted the two gates would pass vacuously in
  RED. They fail instead, on the `scanned` count. RED is therefore 7 failed rather than the 5 the plan
  sketched. This is the intended reading, not a defect.
- **Verification:** RED failure messages name the count; GREEN passes with `scanned === 90`.
- **Committed in:** `c4cd650`

**2. [Rule 2 — Missing critical] Presence gating for the two sibling key lists**

- **Found during:** Task 1
- **Issue:** L-41-2 leaves the `settings.notifications` and `emails.workflowFailed` keys covered by the
  whole-file parity assertion only. That assertion catches *drift between locales* but not *absence
  from all three* — the exact failure mode of the Phase 45 finding at `locale-parity.test.ts:419`, and
  the one that matters most for `emails.workflowFailed.*`, which renders into an email where a raw
  dot-path cannot be corrected after the fact.
- **Fix:** `WORKFLOW_SETTINGS_KEYS` and `WORKFLOW_EMAIL_KEYS` are passed to `missingIn`, `blankIn`,
  `untranslatedInBoth` and `placeholderDrift` alongside `REQUIRED_WORKFLOWS_KEYS`. They are **not**
  merged into `REQUIRED_WORKFLOWS_KEYS`, so the `workflows` namespace comparison stays total.
- **Verification:** an assertion in the no-duplicates test proves the three lists do not overlap and
  that no `workflows.*` dot-path was smuggled into a sibling list (which would exempt it from the total
  contract).
- **Committed in:** `c4cd650`

**3. [Rule 2 — Missing critical] `dryRun.action` vs `dryRun.badge` needed its own gate**

- **Found during:** Task 1
- **Issue:** `untranslatedInBoth` fails only when a value is identical to en-US in **both** other
  locales. Since `action` and `badge` are both `"Test run"` in en-US, a translator who renders them as
  one string in pt-BR produces two values that differ from en-US and passes every existing assertion,
  while collapsing the very distinction the two keys exist for.
- **Fix:** a dedicated `it` asserting `action !== badge` in every non-reference locale.
- **Verification:** RED (both absent → both `undefined` → equal → fails); GREEN with the values in the
  table above.
- **Committed in:** `c4cd650`

**4. [Cosmetic] Four shared `it` titles renamed**

- `"… notes, audit, trash, bulk, shell, dedup and views …"` → `"… dedup, views and workflows …"` (and
  the `or` variant). A title that omits the contract it now gates misleads the next reader. No
  assertion changed; RED count identical before and after.

### NOT done, deliberately

- No `toHaveLength` on `REQUIRED_WORKFLOWS_KEYS`, and no `WORKFLOWS:` row in the pinned-length test at
  the phase-40 block. `grep toHaveLength` shows only pre-existing phase-38/39/40 assertions plus one
  comment mentioning the word.
- `ICU_PLURAL_KEYS` untouched — this phase adds no plural (L-41-1). Confirmed by
  `git diff | grep ICU_PLURAL` returning nothing.
- No pre-existing contract array or pinned length modified. The phase-40 pinned-length test still
  passes unchanged.
- Nothing installed. No package manager was invoked (T-41-SC).

---

**Total deviations:** 4 (3 × Rule 2 gate-hardening, 1 cosmetic)
**Impact on plan:** All three Rule 2 additions strengthen gates the plan itself specified; none widen
scope, and none touch a file outside `files_modified`. The only observable difference is a larger RED
count than the plan sketched, documented above.

## Issues Encountered

- **The worktree branched from a stale base.** `git merge-base HEAD dc377c5` returned `aa01de2` (an
  ancestor), so the worktree was reset to `dc377c5` per the startup protocol before any edit. This is
  the known `worktree-stale-base` failure mode.
- **`grep -n '^  "' file.json` returned mangled output** through the rtk hook (24 identical `{` lines
  with scrambled line numbers). Every subsequent structural read of the JSON files used
  `node -e "…require(…)…"` instead, which is exact.

## Verification

| Check | Result |
|-------|--------|
| `vitest run src/messages/locale-parity.test.ts` | **22/22 passed**, 0 soft failures |
| `npm test` (full) | **3865 passed / 32 skipped** (148 files passed, 2 skipped) — baseline 3860 + 5 new tests |
| `npm test` RSC config | **8/8 passed** |
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **0 errors, 125 warnings** (baseline ≤127) |
| workflows leaf count per locale | `23 23 23` |
| whole-file leaf count per locale | `968 968 968` |
| `{runId}` in `workflows.replay.lineage` | present in all three |
| `emails.workflowFailed` key set | `subject\|heading\|body\|errorLabel\|buttonText` in all three |
| `{errorMessage}` anywhere in the catalog | **false** |
| literal-brace offenders across the 30 authored keys × 3 locales | **0** |
| `REQUIRED_WORKFLOWS_KEYS` length assertions | **none** |
| `WORKFLOWS:` row in the pinned-length test | **none** |
| `ICU_PLURAL_KEYS` | unchanged |
| files deleted by either commit | **none** |

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Every phase-41 UI plan (41-04, 41-05, 41-13, 41-14) can now call `useTranslations("workflows")` /
  `getTranslations("workflows")` and will get translated copy in all three locales rather than a raw
  dot-path.
- Plan 41-08 (the failure-alert email) has `emails.workflowFailed.*` available, including `errorLabel`.
  **It must render the run error outside the translator, escaped**, beside that label — there is no
  `{errorMessage}` placeholder by design, and the T-41-15 gate will fail if one is added.
- Plans 41-13/41-14 own the `leading-tight` wrap fix for `DialogTitle`. The es-ES
  *"¿Repetir esta ejecución?"* and pt-BR *"Executar este fluxo como teste"* strings are shipped at full
  length and DO wrap to two lines in 240px of dialog content, as 41-UI-SPEC records. They were not
  shortened to avoid the wrap.
- **Rule for later plans:** if a UI plan needs a `workflows.*` string this manifest does not have, that
  plan adds the dot-path to `REQUIRED_WORKFLOWS_KEYS` **and** the value to all three files in ONE
  commit. The contract is total: a `workflows` key that is not in the array fails the exact-contract
  assertion, and hardcoding English instead is what the gate exists to prevent.
- STATE.md and ROADMAP.md deliberately untouched — the orchestrator owns those writes after the wave.

---
*Phase: 41-workflow-operator-affordances*
*Completed: 2026-08-22*
