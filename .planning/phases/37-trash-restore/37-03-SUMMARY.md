---
phase: 37-trash-restore
plan: 03
subsystem: i18n
tags: [i18n, next-intl, locale-parity, copy, vitest, contract-test]

# Dependency graph
requires:
  - phase: 36-audit-log
    provides: "REQUIRED_AUDIT_KEYS + the AUDIT_DASHBOARD_KEYS/auditKeys scoper in src/messages/locale-parity.test.ts — the exact machinery this plan mirrors a third time"
  - phase: 35-notes-timeline
    provides: "src/messages/locale-parity.test.ts itself, and its five shared assertion bodies (missingIn, blankIn, untranslatedInBoth, placeholderDrift, expectIdenticalKeySets)"
provides:
  - "The `trash` namespace — 58 keys in en-US.json, es-ES.json and pt-BR.json"
  - "nav.trash — the sidebar entry label"
  - "admin.dashboard.trash / admin.dashboard.trashDescription — the admin dashboard tile"
  - "REQUIRED_TRASH_KEYS (exported) — the checked-in 61-key contract"
  - "TRASH_NAMESPACE / TRASH_EXTRA_KEYS / trashKeys — the scoper the exact-contract assertion runs against"
affects:
  [
    37-04-trash-page,
    37-05-trash-table,
    37-06-restore-action,
    37-07-purge-dialog,
    37-08-retention-admin,
    37-09-nav-entry,
    37-10-dashboard-tile,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Third instance of the checked-in copy-contract pattern: an exported REQUIRED_*_KEYS list + a namespace scoper + a third expectation added to each of the five existing `it` blocks (never a new `it`, never a concatenated key list)"
    - "Exact-contract assertion: shipped namespace key set must equal [...REQUIRED_*_KEYS].sort(), so an unlisted string fails the suite instead of shipping ungated"

key-files:
  created: []
  modified:
    - src/messages/en-US.json
    - src/messages/es-ES.json
    - src/messages/pt-BR.json
    - src/messages/locale-parity.test.ts

key-decisions:
  - "`trash` placed directly after `audit` in all three files, not alphabetically — none of the three catalogues is alphabetical, and `audit`/`trash` are the two retention-shaped namespaces"
  - "`nav.trash` appended after `nav.analytics` rather than inserted next to the four entity entries — keeps the diff to one line per file and does not reorder a namespace six other surfaces read"
  - "audit.actorKind.* / audit.unknownActor / common.actions / nav.{deals,people,organizations,activities} reused, never duplicated under trash.* — verified by an unchanged `grep -c actorKind` on en-US.json"
  - "The exact-contract check was proven twice: once with the probe key in en-US only (cross-locale identity fires) and once with it in all three (the contract loop fires) — the second is the case the loop exists for"
  - "The five `it` titles were renamed to name all three contracts, so the reporter says which of notes/audit/trash broke"

patterns-established:
  - "Gendered-noun rule carried forward: four singular entity nouns (trash.column.{deal,person,organization,activity}) rather than one `Record` header, because es-ES and pt-BR inflect with the noun's gender and the four strings are reused inside the purge dialog"
  - "Fail-closed copy variant: trash.empty.bodyNoRetention exists so the empty state never promises a {days} window the system will not honour when the setting is unset"

requirements-completed: [TRASH-01]

# Metrics
duration: 21min
completed: 2026-08-16
---

# Phase 37 Plan 03: Trash Message Catalogue Summary

**61 new message keys — a 58-key `trash` namespace plus `nav.trash` and two `admin.dashboard.*` keys — written in en-US, es-ES and pt-BR, and gated by a `REQUIRED_TRASH_KEYS` contract whose exact-set assertion was proven to fire.**

## Performance

- **Duration:** ~21 min
- **Started:** 2026-08-16T14:16Z (approx, worktree spawn)
- **Completed:** 2026-08-16T17:37:38Z
- **Tasks:** 2
- **Files modified:** 4 (0 created, 4 modified)

## Accomplishments

- The `trash` namespace exists, translated, in all three catalogues: 58 keys across page shell (2), column headers (9), actor (2), linked records (2), row actions (5), results (4), errors (5), empty states (6), purge dialog (4), pagination (1) and the retention page (18).
- `nav.trash`, `admin.dashboard.trash` and `admin.dashboard.trashDescription` land in their pre-existing namespaces — 61 keys total per file, identical key sets across the three.
- `REQUIRED_TRASH_KEYS` is exported from `src/messages/locale-parity.test.ts` alongside `REQUIRED_NOTE_KEYS` and `REQUIRED_AUDIT_KEYS`, grouped with per-group counts in comments so a group that loses a key is visible at a glance.
- All five existing assertions now cover trash as a **third, separate** argument — existence, key-set identity (plus the exact contract), non-empty, not-untranslated-in-both, and placeholder survival.
- The gate was demonstrated red and then green again, twice, in the two distinct ways it can fire (see Verification).

## Task Commits

1. **Task 1: Add the 61 trash keys to all three locale catalogues** — `77a0781` (feat)
2. **Task 2: Extend locale-parity.test.ts with REQUIRED_TRASH_KEYS** — `078920b` (test)

## Files Created/Modified

- `src/messages/en-US.json` — `trash` namespace (58 keys) after `audit`; `nav.trash`; `admin.dashboard.trash` + `.trashDescription`. Copy is verbatim from `37-UI-SPEC.md § New key inventory`.
- `src/messages/es-ES.json` — same 61 keys, translated into the register the existing `audit` namespace uses (Papelera; "Introduce un número entero de días…" mirroring `audit.retention.windowHelp`).
- `src/messages/pt-BR.json` — same 61 keys (Lixeira; "Digite um número inteiro de dias…" mirroring the pt-BR audit retention copy).
- `src/messages/locale-parity.test.ts` — `REQUIRED_TRASH_KEYS`, `TRASH_NAMESPACE`, `TRASH_EXTRA_KEYS`, the `trashKeys` scoper, a third expectation in each of the five `it` blocks, and the exact-contract loop. The `auditContract` local was renamed from `contract` because a second contract now lives in the same block.

## Decisions Made

- **`trash` sits after `audit`, before `settings`.** None of the three files is alphabetical (`notes` → `audit` → `settings` → `admin`), so the plan's "beside `audit`" branch applies. It also puts the two retention-shaped namespaces adjacent, which is how a reader finds `trash.retention.*` by analogy with `audit.retention.*`.
- **`nav.trash` appended last in `nav`.** Inserting it beside `nav.activities` would have been more semantic but reorders a namespace that six surfaces read and that `REQUIRED_*` lists elsewhere index by name only. Appending keeps the diff at one line per file with identical semantics.
- **`trash.column.website` is `Website` in both en-US and pt-BR.** That is deliberate and safe: `untranslatedInBoth` only fails when **both** other locales match en-US byte-for-byte, and es-ES is `Sitio web`. It also matches the pre-existing `audit.field.website` in pt-BR, so the two surfaces do not disagree about the same word.
- **`trash.retention.windowHelp` states 1–365 in every locale** (`between 1 and 365` / `entre 1 y 365` / `entre 1 e 365`), mitigating **T-37-12**. The same two numbers must appear in `RETENTION_MIN`/`RETENTION_MAX` in `src/lib/trash/settings.ts` and on the number `Input` — a later plan owns those; this plan owns the claim.
- **`trash.empty.bodyNoRetention` is a separate key, not a `{days}` default** — mitigating **T-37-13**. `trash.empty.body` carries `{days}`; the no-retention variant deliberately carries no placeholder so it cannot be rendered with a fabricated number.
- **`trash.purgeDialog.description` states what survives** ("Its change history is kept." / "Su historial de cambios se conserva." / "O histórico de alterações é mantido.") — mitigating **T-37-14**.
- **Copy rules held:** no bare Save/Cancel/Confirm/OK/Yes/Apply anywhere (the two dialogs use `Keep in trash` / `Delete permanently` and `Keep current window` / `Shorten retention window`), no exclamation marks, every error names the failed action and the next step.

## Deviations from Plan

None — the plan executed exactly as written. Both tasks' actions, verifications and acceptance criteria were carried out as specified.

One clarification worth recording rather than a deviation: the plan's acceptance criterion for the deliberate break says "temporarily add `trash.zzz` to `src/messages/en-US.json` … observe a failure naming the trash key set". That does fail, but it fails on the **cross-locale identity** assertion first, which would have happened with or without `REQUIRED_TRASH_KEYS`. So the probe was run a second time with the key added to **all three** locales, which is the only configuration that isolates the exact-contract loop this plan adds. Both runs are recorded under Verification; all three probe keys were removed and `git status` confirmed the locale files were byte-identical to their commit before Task 2 was committed.

## Issues Encountered

- `npm test` (full suite, 76 files) reported **1 failure**: `src/lib/execution/condition-evaluator.test.ts > resolveFieldPath — parsing is linear, not backtracking (T-34-20) > scales linearly, not quadratically, with path length`, asserting `large / small < 10` and measuring `12.05`. This is a wall-clock ratio assertion in a Phase 34 file this plan does not touch, and it **passes in isolation** (`npx vitest run src/lib/execution/condition-evaluator.test.ts` → 70/70). It is timing jitter from running the suite on a machine loaded with parallel wave-1 worktree agents, not a regression. Out of scope per the executor scope boundary — logged here rather than fixed, and rather than written to a shared `deferred-items.md` that concurrent worktrees in this wave would conflict on.

## Verification

| Check                                                                            | Result                                       |
| -------------------------------------------------------------------------------- | -------------------------------------------- |
| Task 1 automated verify (61 keys, identical across 3 locales)                     | `61 keys, identical across 3 locales`         |
| `windowHelp` states the 1–365 range (en-US)                                       | exit 0                                        |
| All three files parse as JSON                                                     | exit 0                                        |
| No `trash.*` value is an empty string, any locale                                 | `no blank trash values`                       |
| `grep -c actorKind src/messages/en-US.json`                                       | 1 — unchanged; keys reused, not duplicated    |
| `npx vitest run src/messages/locale-parity.test.ts`                               | 6 passed, 0 failed                            |
| Break probe A — `trash.zzz` in en-US only                                          | 2 failed: cross-locale identity + whole-file  |
| Break probe B — `trash.zzz` in **all three** locales                               | 1 failed: `trash key set in en-US.json diverges from the checked-in contract` |
| Probes removed → suite green again                                                | 6 passed, 0 failed; `git status` clean for the 3 JSON files |
| `grep -c '"trash\.' src/messages/locale-parity.test.ts`                           | 58 (≥ 58 required)                            |
| `npm run typecheck`                                                                | exit 0                                        |
| `npm run lint`                                                                     | 0 errors, 125 pre-existing warnings; **0 findings in `src/messages`** |
| `npm test` (full suite)                                                            | 1337 passed, 4 skipped, 1 failed — the unrelated T-34-20 timing flake above |

## Threat Flags

None. This plan adds no network endpoint, auth path, file access pattern or schema change; it modifies four files under `src/messages/`. `T-37-SC` holds — zero packages installed.

## Known Stubs

None. Every one of the 61 keys carries real, non-empty copy in all three locales; no placeholder or TODO strings were introduced. The keys are intentionally unreferenced by any component today — the UI plans that render them are 37-04 through 37-10 — which is the sequencing this plan exists to enable, not a stub.

## User Setup Required

None.

## Next Phase Readiness

- **Every UI plan in this phase can now render through `useTranslations("trash")` / `getTranslations("trash")`** without inventing copy. The dot paths are exactly those listed in `REQUIRED_TRASH_KEYS`.
- **Any UI plan that needs a string not in the 61 must add it to `REQUIRED_TRASH_KEYS` in the same commit** — the exact-contract loop will otherwise fail the suite naming `trash key set in {locale}.json diverges from the checked-in contract`. This is the intended cost.
- **Reuse, do not duplicate:** `nav.deals` / `nav.people` / `nav.organizations` / `nav.activities` for tab labels and the `{list}` placeholder; `audit.actorKind.{workflowRun,apiKey,import,system}` and `audit.unknownActor` for the Deleted-by column; `common.actions` for the actions column's `sr-only` header.
- **Contract note for the retention plan (`src/lib/trash/settings.ts`):** `RETENTION_MIN` must be `1` and `RETENTION_MAX` must be `365`, and the number `Input`'s `min`/`max` must match. `trash.retention.windowHelp` advertises that range in all three locales; a validator that disagrees makes the UI lie about its own configuration (T-37-12).
- **Contract note for the empty state:** render `trash.empty.body` only when a retention window is parseable; otherwise render `trash.empty.bodyNoRetention`, which takes no `{days}` argument (T-37-13).
- No blockers.

## Self-Check: PASSED

- Files verified present: `src/messages/en-US.json`, `src/messages/es-ES.json`, `src/messages/pt-BR.json`, `src/messages/locale-parity.test.ts`
- Commits verified in `git log`: `77a0781`, `078920b`
- No shared orchestrator artifact touched: `.planning/STATE.md` and `.planning/ROADMAP.md` are unmodified in this worktree.

---

_Phase: 37-trash-restore_
_Completed: 2026-08-16_
