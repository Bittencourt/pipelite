---
status: partial
phase: 36-audit-log
source: [36-VERIFICATION.md]
started: 2026-08-16
updated: 2026-08-18T02:11:06Z
---

## Current Test

Test 2 (workflow run "Records changed" list) — not yet located/checked. Tests 1 and 3 are resolved.

## Tests

<!-- 2026-08-18: the original single test bundled THREE surfaces x THREE dimensions behind one
     [pending]. Split into one test per surface so partial coverage cannot read as full coverage.
     Re-run with Playwright-MCP, whose browser_resize sets a genuine window.innerWidth (the tool
     used in 36-20 reported success without taking effect). -->

### 1. Audit timeline entry — dark mode, 320px, es-ES + pt-BR
expected: Renders correctly in dark mode, at 320px with no horizontal page scroll or clipping, and in both locales with no missing keys and no layout breakage from longer strings
result: issue
reported: "Locales are clean, but the page horizontally scrolls at 320px, and one field label is untranslated."
severity: minor
detail: |
  LOCALES PASS. On an organization detail page the timeline renders fully translated in both:
  pt-BR "Linha do tempo (4) / Mostrar alterações de campo / prbitt@gmail.com excluiu esta empresa /
  Proprietário ... alterado para", and es-ES "Cronología (4) / Mostrar cambios de campo /
  eliminó esta empresa / Propietario ... cambió a". No raw message keys rendered in either locale.
  320px FAILS: document.scrollWidth 416 against clientWidth 305. Cause is NOT this phase's markup —
  it is the app-wide global header (37-UAT.md G5), whose w-64 256px search input plus a 40px avatar
  and a 16px gap cannot fit 305px. Reproduces identically on /organizations and /trash.
  DARK MODE: renders correctly only when the .dark class is forced by hand; no user can reach it
  (37-UAT.md G6 — no ThemeProvider, no toggle anywhere in the app).
  SEPARATE i18n DEFECT found here: the timeline renders the raw English DB column name
  "Deleted at" as a field label, in BOTH locales, alongside a raw ISO timestamp.

### 2. Workflow run "Records changed" list — dark mode, 320px, es-ES + pt-BR
expected: Same three dimensions as above
result: [pending]
reason: "NOT CHECKED. This surface was not located in the workflow UI during the 2026-08-18 re-run and no attempt is recorded as a pass. It is the only one of the three surfaces still genuinely unverified — recorded as pending rather than folded into the two that were checked."

### 3. /admin/audit retention form — dark mode, 320px, es-ES + pt-BR
expected: Same three dimensions as above
result: issue
reported: "Locales are clean, but this is the worst 320px offender in the app, and the whole admin sidebar is untranslated."
severity: major
detail: |
  LOCALES PASS for the form itself. pt-BR: "Registro de auditoria / Por quanto tempo o histórico de
  alterações de um registro é mantido antes de ser excluído permanentemente." es-ES: "Registro de
  auditoría / Cuánto tiempo se conserva el historial de cambios de un registro antes de eliminarse
  permanentemente / Período de retención / Días de historial que se conservan / Introduce un número
  entero de días entre 1 y 3650 / Guardar período de retención / Entradas de auditoría almacenadas /
  Entrada más antigua". No missing keys, no raw key paths.
  320px FAILS, and worse than anywhere else measured: document.scrollWidth 508 in pt-BR and 526 in
  es-ES against clientWidth 305 — the overflow GROWS with translated string length, which is exactly
  the "layout breakage from longer strings" this item was written to catch. Two independent causes:
  the global header (G5) and, specific to this surface, the admin sidebar rail never collapsing at
  mobile, so <main> itself starts at x~206px and its right edge lands at 508px.
  DARK MODE: same as test 1 — correct when forced, unreachable by a user (G6).
  SEPARATE i18n DEFECT owned by this surface's shell: the entire admin sidebar is hardcoded English
  in both locales — "Admin Panel, Dashboard, User Management, Pipelines, Custom Fields, Webhooks,
  Audit Log, Trash, Export Data, Pipedrive Import, Back to App".

## Summary

total: 3
passed: 0
issues: 2
pending: 1
skipped: 0
blocked: 0

## Gaps

```yaml
- truth: "The audit surfaces render at a 320px viewport without horizontal page scroll"
  status: failed
  reason: "Both surfaces checked overflow. /admin/audit is the worst in the app at 508px (pt-BR) and 526px (es-ES) against a 305px client width, growing with string length; the timeline page overflows at 416px. Neither is caused by Phase 36 markup: the shared cause is the global header (tracked as 37-UAT.md G5, root-caused there), and the admin-specific second cause is the sidebar rail not collapsing at mobile, which IS this surface's shell."
  severity: major
  test: [1, 3]
  artifacts:
    - path: "src/components/nav-header.tsx"
      issue: "w-64 (256px) search input + 40px avatar + 16px gap = 312px of non-shrinkable content in a 305px client width; app-wide, see G5"
    - path: "src/app/admin/layout.tsx"
      issue: "Admin sidebar rail does not collapse below sm, pushing <main> to start at x~206px and overflow to 508px+"
  missing:
    - "Let the header search shrink (w-full max-w-64 min-w-0, wrapper min-w-0 flex-1) or hide it behind an icon below sm"
    - "Collapse or drawer the admin sidebar below sm"

- truth: "Every user-visible string on the audit surfaces is translated"
  status: failed
  reason: "Two untranslated surfaces found while the audit copy itself passed. (1) The record timeline renders the raw English DB column name 'Deleted at' as a field label in both locales, next to a raw ISO timestamp. (2) The entire admin sidebar is hardcoded English in both locales."
  severity: minor
  test: [1, 3]
  artifacts:
    - path: "src/app/admin/layout.tsx"
      issue: "Sidebar nav labels hardcoded English"
  missing:
    - "Route the admin sidebar labels and the timeline field-label map through next-intl"

- truth: "All three audit surfaces were checked"
  status: partial
  reason: "The workflow run 'Records changed' list was not located during the 2026-08-18 re-run and remains unverified. Two of three surfaces are covered."
  severity: low
  test: 2
  missing:
    - "Drive a workflow run that changes records and check its 'Records changed' list at 320px and in both locales"
```

### Dark-mode clause — premise invalidated

All three surfaces in this item were to be checked "in dark mode". That is not a reachable user state:
no `ThemeProvider` is mounted and no toggle exists, so `<html>` never receives `.dark`. Forcing the
class shows the tokens render correctly, which is worth recording but is a weaker claim than this
item intended. Tracked app-wide as 37-UAT.md G6; not Phase 36 code.
