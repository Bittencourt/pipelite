# Phase 36 UAT residual 2 — closed by measurement

**Date:** 2026-08-24
**Residual:** `36-VERIFICATION.md` `human_verification[0]` / `36-HUMAN-UAT.md` test 2 —
"Workflow run 'Records changed' list: dark mode, 320px viewport, es-ES and pt-BR", carried as
STILL OPEN since the 2026-08-18 re-run "did not locate this one in the workflow UI".
**Closed by:** `e2e/workflow-run-320.spec.ts` (new). 3 tests, one per locale, each measuring the
surface in light AND dark. `./node_modules/.bin/playwright test e2e/workflow-run-320.spec.ts`
→ 5 passed (2 setup + 3).

## Why it was never located by hand

The section only renders inside a run that EXISTS (`page.tsx` `notFound()`s when no row matches both
`runId` and `workflowId`), so reaching it manually means provoking a workflow run first. The spec
creates the run it measures instead — a failed, dry run with a lineage link, which is the WIDEST
header this page produces (`ReplayRunButton` + `DryRunBadge` + a third metadata item), plus two
`audit_log` rows so the LIST renders rather than the empty box.

## What is asserted, per locale

| Dimension | Assertion |
|---|---|
| 320px | `documentElement.scrollWidth <= clientWidth`, measured in BOTH themes. No hardcoded width; both numbers are reported. clientWidth is 305, not 320 — `ignoreDefaultArgs: ["--hide-scrollbars"]` |
| es-ES / pt-BR / en-US | `<h2>` from `audit.run.heading`, READ FROM `src/messages/*.json`. NOT the `<h1>`, which is `Run #{id}` — a hardcoded English literal that would let all three locales pass while measuring en-US. Second locale-dependent anchor: `audit.run.untitledRecord` on the unlinkable row |
| dark mode | body background near-black; the list's border resolves to the TRANSLUCENT `.dark --border` token (alpha ≈ 26, not 255); the record title INVERTS to light-on-dark. Colours resolved through a 1x1 canvas fill, because Chromium serialises these computed values as `lab(...)` |

`36-VERIFICATION.md`'s `dark_mode_premise_invalidated` no longer holds: a `ThemeProvider` IS mounted
(`src/app/layout.tsx:73`) and `e2e/theme.spec.ts` covers the toggle, so dark mode is a reachable user
state and this is a measurement rather than a forced class.

## Observed red runs (the spec was proven able to fail, then restored)

1. Route pointed at a random run id → all 3 tests: `getByRole('heading', { name: 'Records changed', level: 2 })` / `'Registros alterados'` / `'Registros modificados'` — `element(s) not found`. Not measuring a 404 or a `/login` redirect.
2. Locale cookie renamed to `locale-broken` → en-US PASSES (it is the fallback) and es-ES + pt-BR FAIL on their own catalog strings. The two non-default locales are genuinely locale-dependent.
3. A 900px unwrapped `<div>` injected into the list → `scrollWidth 933 > clientWidth 305 (overflow 628px)`. The instrument works, and 305 confirms the scrollbar flag is live.
4. List border forced to `rgb(229, 231, 235)` in dark (the `border-gray-200` island) → `Expected: < 60 / Received: 255`.
5. Record title forced to `rgb(39, 39, 39)` in dark → `Expected: > 128 / Received: 39`.

## Honest limits

- The dark-mode assertion reads three COMPUTED COLOURS, not pixels. An island whose text and border
  are tokenised while some background deeper in the subtree is hardcoded would still pass. Catching
  that needs screenshot comparison, which needs a PNG decoder this repo does not depend on.
- Only the empty/loaded distinction is exercised on the loaded path. The `failed`
  ("unavailable") branch of `run-changed-records.tsx` is not measured — it is a centred one-line box
  that cannot overflow, and provoking it requires making the read throw.
- `36-VERIFICATION.md` and `36-HUMAN-UAT.md` are LEFT AS WRITTEN. They record what was true on
  2026-08-18 and rewriting a verification report is not this note's job. An archival pass that wants
  the tracker to read closed should update `36-HUMAN-UAT.md` test 2 (`result: [pending]`, line 40) and
  the `human_verification` entry in `36-VERIFICATION.md` (line 11-13), citing this note.
