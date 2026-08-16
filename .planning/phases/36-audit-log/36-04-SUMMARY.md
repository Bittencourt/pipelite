---
phase: 36-audit-log
plan: 04
subsystem: ui
tags: [i18n, next-intl, icu-messageformat, vitest, locale-parity]

# Dependency graph
requires:
  - phase: 35-notes-record-timeline
    provides: "src/messages/locale-parity.test.ts — the whole-file + namespace parity gate and the REQUIRED_NOTE_KEYS checked-in-contract pattern this plan extends"
provides:
  - "77 keys under a new top-level `audit` namespace in all three shipped locales"
  - "2 dashboard-tile keys (auditLog, auditLogDescription) in the existing admin.dashboard namespace"
  - "REQUIRED_AUDIT_KEYS — the checked-in audit copy contract, driving all five parity assertions"
  - "Shared assertion helpers (missingIn, blankIn, untranslatedInBoth, placeholderDrift, expectIdenticalKeySets) so a future namespace is gated by five calls, not five copied it-blocks"
affects: [36-13 timeline entry, 36-14 retention page, 36-16 workflow run section, 36-19 filter toggle, any future namespace needing a parity contract]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Checked-in copy contract per namespace: a dot-path list in the test file is the gate's source of truth"
    - "Contract lists are passed to assertion helpers separately, never concatenated, so a failure diff names the broken contract"
    - "Namespace key-set assertion pinned to the contract, not just cross-locale identity — an unlisted key fails the build"

key-files:
  created: []
  modified:
    - src/messages/en-US.json
    - src/messages/es-ES.json
    - src/messages/pt-BR.json
    - src/messages/locale-parity.test.ts

key-decisions:
  - "The 12 entry predicates carry the gendered demonstrative per locale (es: este trato / esta empresa / esta persona / esta actividad; pt: este negócio / esta empresa / esta pessoa / esta atividade), not a shared placeholder"
  - "es-ES timeline prose says 'trato' for deal, matching Phase 35's notes.entry.stageChanged rendered two rows away in the same timeline; audit.field.deal says 'Oferta', matching the form label the user actually edited"
  - "audit.filter.emptyHidden.body quotes each locale's own audit.filter.label verbatim, so the instruction names a control visible on that locale's screen"
  - "The audit namespace key-set assertion pins to REQUIRED_AUDIT_KEYS exactly (set equality), which is strictly stronger than the cross-locale identity the notes contract gets"
  - "The five assertion bodies were lifted into named helpers rather than duplicated; both contracts call them, so no assertion logic exists twice"

patterns-established:
  - "Per-namespace copy contract: add the dot-path to REQUIRED_*_KEYS before the string reaches a component, or the namespace key-set assertion goes red"
  - "Placeholder-survival is scoped to simple {token} interpolation; ICU plural bodies are validated by compiling every message, not by token diffing"

requirements-completed: [AUDIT-03, AUDIT-04]

# Metrics
duration: 21min
completed: 2026-08-15
---

# Phase 36 Plan 04: Audit Copy and Locale Gate Summary

**79 audit strings landed in en-US, es-ES and pt-BR as real translations — including 12 separately-inflected entry predicates — with the Phase 35 parity gate refactored into shared helpers so both the notes and audit contracts run through all five assertions.**

## Performance

- **Duration:** 21 min
- **Started:** 2026-08-15T23:05:00Z
- **Completed:** 2026-08-15T23:26:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- A new top-level `audit` namespace with exactly 77 keys in each of the three locale files: 4 actor kinds, 12 entry predicates, 10 values/disclosure, 20 field labels, 5 filter, 8 workflow-run, 18 retention. Verified by leaf count, not by eye.
- 2 keys added to the pre-existing `admin.dashboard` namespace for the audit tile.
- es-ES and pt-BR are genuine translations. The untranslated-in-both assertion covers all 79 keys and is green with an empty allow-list.
- All 4 ICU plural strings (`audit.value.files`, `audit.showMoreFields`, `audit.run.fieldCount`, `audit.filter.emptyHidden.body`) keep `{count, plural, …}` and `#` in every locale, with translated arms.
- Every one of the 231 audit messages (77 keys × 3 locales) was compiled with `IntlMessageFormat` under its own locale — 0 parse errors — so no message can throw at render time.
- `REQUIRED_AUDIT_KEYS` is checked in and drives all five parity assertions, proven by a deliberate deletion going red.

## Task Commits

1. **Task 1: Add the audit namespace to all three locale files** — `9a5b7b4` (feat)
2. **Task 2: Wire REQUIRED_AUDIT_KEYS into the five existing parity assertions** — `fb0136d` (test)

**Plan metadata:** this SUMMARY (docs)

## Files Created/Modified

- `src/messages/en-US.json` — the `audit` namespace verbatim from 36-UI-SPEC.md § Full key inventory, plus 2 `admin.dashboard` keys. 576 → 655 leaves.
- `src/messages/es-ES.json` — Spanish translation of the same 79 keys.
- `src/messages/pt-BR.json` — Brazilian Portuguese translation of the same 79 keys.
- `src/messages/locale-parity.test.ts` — `REQUIRED_AUDIT_KEYS` contract, five shared assertion helpers, both contracts wired through all five assertions.

## Verification Performed

| Check | Result |
|-------|--------|
| `audit` leaf count per locale | 77 / 77 / 77 |
| Whole-file leaf count per locale | 655 / 655 / 655, key sets byte-identical |
| `admin.dashboard.auditLog` + `auditLogDescription` present in all three | yes |
| `grep -c "plural"` in es-ES / pt-BR | +4 each vs. before the task |
| `grep -c "REQUIRED_AUDIT_KEYS"` in the gate | 8 (≥ 6 required: declaration + 5 consumers + 2 explanatory comments) |
| `grep -c '"audit\.'` in the gate | 77, exactly the audit dot-paths and nothing else |
| ICU compile of all 231 audit messages under their own locale | 0 errors |
| `npx vitest run src/messages/locale-parity.test.ts` | 6 passed, 0 failed |
| `npm run typecheck` | clean |
| `npx eslint src/messages/locale-parity.test.ts` | no issues |
| `npm test` | 66 files, 1128 passed, 4 skipped, 0 failed — no regression |
| No NUL bytes or raw control characters in any of the 4 files | confirmed |

### Negative check (required by the plan)

`audit.value.empty` was deleted from `es-ES.json` and the suite re-run. **4 of the 6 tests went red:**

1. `every required notes and audit key exists in every locale` — named `es-ES` and the exact missing key
2. `the notes and audit namespaces have identical key sets across all three locales` — 77 vs. 78
3. `every required notes and audit value is a non-empty string`
4. `all three locales have identical whole-file key sets` (the pre-existing Phase 35 assertion)

The key was then restored and `git status` confirmed `es-ES.json` byte-identical to its committed state before the parity test was re-run green. The deletion never entered a commit.

## Decisions Made

**1. Gendered demonstratives, not a shared placeholder.** The 12 `audit.entry.{action}.{entityType}` keys exist because Spanish and Portuguese inflect the demonstrative with the noun's gender. Each was translated independently: es `creó esta empresa` / `creó esta persona` / `creó este trato` / `creó esta actividad`; pt `criou esta empresa` / `criou esta pessoa` / `criou este negócio` / `criou esta atividade`.

**2. Two vocabularies for "deal" in es-ES, deliberately.** The repo is already split: `nav.deals` and `deals.organization` say *Oferta*, while Phase 35's timeline prose (`notes.entry.stageChanged`) says *trato*. Rather than pick one and break the other, the split was kept along the line that determines what the user sees next to the string:
- **Timeline prose** (`audit.entry.*.deal`) → *trato*, because it renders in the same `<ol>` as `notes.entry.stageChanged` — "movió este trato…" and "actualizó este trato" two rows apart.
- **Field label** (`audit.field.deal`) → *Oferta*, because it labels `activities.deal_id` in a diff list, and the form field the user just edited is labeled *Oferta*.

The same rule produced `audit.field.organization` → *Empresa* (matching `deals.organization`) rather than a literal "Organización", and `audit.field.person` → *Contacto* / *Contato* (the spec's en copy is "Contact", not "Person").

**3. Field labels reuse the repo's existing form labels** wherever one exists (`Etapa`, `Valor`, `Teléfono`, `Sobrenome`, `Responsável`, `Concluída`), so an audit diff and the form that produced it name the same field with the same word. Casing follows the UI-SPEC's sentence case (`Fecha esperada de cierre`), not the repo's older Title Case, because the spec's en column is sentence case.

**4. The filter's empty-state body quotes its own locale's label.** `audit.filter.emptyHidden.body` ends with "Turn on Show field changes to see them"; es ends "Activa **Mostrar cambios de campo** para verlos" and pt "Ative **Mostrar alterações de campo** para vê-las" — each matching that locale's `audit.filter.label` character for character.

**5. The gate was refactored, not duplicated.** The plan allowed either parameterising or concatenating. Concatenation was rejected: a failure diff would then list notes and audit keys together with no indication which contract broke. Instead the five assertion bodies became named helpers (`missingIn`, `blankIn`, `untranslatedInBoth`, `placeholderDrift`, `expectIdenticalKeySets`) and each `it` calls its helper twice — once per contract. Assertion logic exists exactly once; failures stay attributable.

**6. The audit key-set assertion is stronger than the notes one.** For notes, the assertion is cross-locale identity. For audit it is additionally set-equality with `REQUIRED_AUDIT_KEYS`, so adding an `audit` string to the locale files without adding its dot-path to the contract fails the build. That is the plan's must-have truth #2, and it would not have held under cross-locale identity alone (a key added to all three locales would have passed). No existing notes assertion was relaxed to make room for this.

## Deviations from Plan

None — plan executed exactly as written.

Two acceptance criteria were read literally and shaped the implementation rather than causing a deviation:
- `grep -c '"audit\.'` must return exactly 77. The namespace-matching helper therefore builds its prefix from a `AUDIT_NAMESPACE` constant via a template literal rather than writing the string `"audit."` inline, which would have made the count 78.
- `grep -c "REQUIRED_AUDIT_KEYS"` must be ≥ 6. A fully data-driven `describe.each` would have referenced the constant once and failed this. The helper-plus-explicit-call shape satisfies both the letter of the criterion and its intent (five real consumers).

## Issues Encountered

**Stale comment in the inherited gate header, left alone.** `locale-parity.test.ts` opens with "All three files carried an identical 544-leaf key set, measured 2026-08-15 while writing this gate." The actual pre-plan count was 576 (655 after this plan). The statement is explicitly timestamped as a historical measurement, so it was not edited — rewriting a dated observation to a number that was never true at that date would be worse than leaving it. Flagged here rather than silently touched.

**ICU plural strings are invisible to the placeholder assertion.** `placeholders()` matches `/\{[a-zA-Z0-9_]+\}/g`, which does not match `{count, plural, …}` (the comma breaks the character class) or `{# file}` (`#` is not in the class). So the four plural strings pass the placeholder assertion vacuously. This is not a hole introduced here — it is how the Phase 35 gate has always behaved — but it means the plural syntax is not gated by that assertion. It was verified out-of-band instead by compiling all 231 audit messages with `IntlMessageFormat` under their own locale (0 errors). `audit.retention.shortenDialog.description`'s `{days}` is a simple token and *is* covered by the assertion in all three locales.

## Known Stubs

None. Every key added is final copy from the UI-SPEC; nothing is a placeholder awaiting a later plan. No component was touched, so there is no unwired data path.

## Threat Flags

None. No network endpoint, auth path, file access, or schema change. The one threat this plan owns, **T-36-15 (ICU placeholder loss in translation)**, is mitigated: the placeholder-survival assertion now covers all 79 keys, and ICU-body integrity was additionally proven by compiling every message. **T-36-SC** holds — zero packages added.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Every key the four audit surfaces render now exists in all three locales, so the downstream UI plans are unblocked:

- **36-13** (timeline entry) → `audit.actorKind.*`, `audit.entry.*`, `audit.value.*`, `audit.field.*`, `audit.showMoreFields`, `audit.showFewerFields`, `audit.unknownActor`
- **36-14** (retention page) → `audit.retention.*` (18) and `admin.dashboard.auditLog{,Description}`
- **36-16** (workflow run section) → `audit.run.*` (8)
- **36-19** (filter toggle) → `audit.filter.*` (5)

One thing those plans must know: **a new audit string requires a `REQUIRED_AUDIT_KEYS` entry in the same commit.** The namespace key-set assertion is pinned to the contract, so a key added to the locale files alone fails the build even when all three locales agree. That is the gate working, not a bug.

`audit.field.*` covers native columns only. Custom fields render `customFieldDefinitions.name` verbatim and are never translated — 36-13 owns that path, and the unmapped-column camelCase fallback should be unreachable.

## Self-Check: PASSED

- `src/messages/en-US.json` — FOUND, 77 `audit` leaves
- `src/messages/es-ES.json` — FOUND, 77 `audit` leaves
- `src/messages/pt-BR.json` — FOUND, 77 `audit` leaves
- `src/messages/locale-parity.test.ts` — FOUND, `REQUIRED_AUDIT_KEYS` present
- Commit `9a5b7b4` — FOUND in git log
- Commit `fb0136d` — FOUND in git log

---
*Phase: 36-audit-log*
*Completed: 2026-08-15*
