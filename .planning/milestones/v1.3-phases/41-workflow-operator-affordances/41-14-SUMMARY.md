---
phase: 41-workflow-operator-affordances
plan: 14
subsystem: workflows
tags: [dry-run, editor-toolbar, responsive, poll, i18n, source-gate]
requires:
  - "startDryRun / getWorkflowRunStatus (plan 41-11, src/app/workflows/actions.ts)"
  - "workflows.dryRun.* — 15 keys × 3 locales (plan 41-03)"
  - "workflow_runs.dry_run column, NOT NULL DEFAULT false (migration 0019)"
provides:
  - "DryRunDialog — the editor's Test run affordance: trigger, JSON editor, submit-time validation, bounded poll, navigate-to-finished-run"
  - "R-3a/R-3b/R-3c — the editor toolbar row wraps at 320px and its name Input can shrink"
  - "Toolbar now takes a latestTriggerData prop (was prop-less)"
  - "WorkflowEditor now takes a latestTriggerData prop"
affects:
  - "src/app/workflows/[id]/edit/page.tsx — second query, most recent non-test run"
  - "any future consumer of <Toolbar /> must pass latestTriggerData"
tech-stack:
  added: []
  patterns:
    - "scan-panel.tsx's two-stop poll, plus a third stop on status === null and a wall-clock deadline held as an absolute timestamp in state"
    - "source-scan wiring gate (41-RESEARCH C-1 — no DOM test environment in this repo)"
key-files:
  created:
    - "src/app/workflows/[id]/edit/components/dry-run-dialog.tsx"
    - "src/app/workflows/[id]/edit/__tests__/dry-run-dialog-wiring.test.ts"
  modified:
    - "src/app/workflows/[id]/edit/components/toolbar.tsx"
    - "src/app/workflows/[id]/edit/workflow-editor.tsx"
    - "src/app/workflows/[id]/edit/page.tsx"
decisions:
  - "latestTriggerData is THREADED as a prop from page.tsx through WorkflowEditor to Toolbar — the editor store carries the definition, not the run history"
  - "the prefill is the envelope's .data payload of the most recent NON-test run, not the whole envelope and not a previous test run"
  - "the 30 s budget is an absolute deadline captured at launch and held in state, not a Date.now() recorded inside the effect"
  - "an absent run row (status === null) shares dryRun.timeout with the elapsed deadline — one outcome for 'stopped waiting without a verdict'"
  - "the disabled-trigger hint lives in DryRunDialog, not in toolbar.tsx (the plan's two behaviour blocks conflicted)"
metrics:
  duration: "~14 min"
  completed: 2026-08-22
---

# Phase 41 Plan 14: The Editor's Test Run Affordance Summary

An operator can now test a saved workflow from the editor toolbar against trigger data prefilled
from its most recent real run, and lands on the finished run's detail page — with a three-stop
bounded poll owning the wait and the toolbar row finally wrapping at 320px.

## What Was Built

**`DryRunDialog`** (`dry-run-dialog.tsx`, 396 lines incl. docs) — a `"use client"` component rendered
in the editor toolbar:

- an outline `FlaskConical` `size="sm"` trigger, `disabled={dirty}`, with `title` AND a visible
  `text-xs text-muted-foreground` hint the trigger points at via `aria-describedby`
- a `Dialog` (not a side-panel mode) holding `DialogTitle className="leading-tight"`, the
  description, a labelled `Textarea` at `font-mono min-h-[160px] max-h-[320px] overflow-y-auto` with
  no font-size class and no `wrap`, exactly one of the two prefill hints, and a text-only
  `role="alert"` error
- submit-time validation with two distinct messages; the server's own `invalidJson` / `notAnObject`
  refusals are mapped back onto the same two messages
- a bounded poll: `startDryRun` → `getWorkflowRunStatus` every 1000 ms → navigate to
  `/workflows/{id}/runs/{runId}` on `completed`/`failed`
- `readOnly` (never `disabled`) on the Textarea while the run is in flight; `Loader2` +
  `dryRun.running` on the confirm

**The toolbar** — R-3a (`flex-wrap` on the outer row), R-3b (`min-w-0` on the name `Input`), R-3c
(`flex-wrap` on the right cluster), and the trigger rendered with the other outline controls, left
of Save.

**The wiring gate** — 35 source-scan assertions over both files.

## Task 1 RED counts (recorded before tasks 2 and 3)

`npx vitest run ".../dry-run-dialog-wiring.test.ts"` → **35 total, 9 passed, 26 failed.**

| # | Group | Assertion | RED |
|---|-------|-----------|-----|
| 1 | anti-vacuity | the dialog exists and names its component | FAIL |
| 2 | anti-vacuity | the toolbar exists and still names its component | pass |
| 3 | anti-vacuity | the tag walker sees every className in the toolbar | pass |
| 4 | Textarea | is labelled — the id and the htmlFor agree | FAIL |
| 5 | Textarea | carries the declared dimensions and the editor attributes | FAIL |
| 6 | Textarea | sets NO font size of its own | pass¹ |
| 7 | Textarea | never sets wrap='off' (R-5) | pass¹ |
| 8 | Textarea | goes readOnly while the run is in flight, never disabled | FAIL |
| 9 | validation | keeps the two failures distinct | FAIL |
| 10 | validation | announces the error and marks the field invalid | FAIL |
| 11 | validation | expresses the error as text, no fill, no border change | FAIL |
| 12 | hints | renders both strings | FAIL |
| 13 | hints | puts them in different conditionals | FAIL |
| 14 | wait | calls the two actions plan 41-11 built | FAIL |
| 15 | wait | has at least TWO clearInterval stops | FAIL |
| 16 | wait | stops on an ABSENT run, not just on a terminal status | FAIL |
| 17 | wait | bounds the wait with module-level named constants | FAIL |
| 18 | wait | keeps the timeout and the creation failure separate | FAIL |
| 19 | wait | sets no state in the effect body outside the poll callback | FAIL |
| 20 | chrome | overrides the title's leading | FAIL |
| 21 | chrome | is not dressed as a destructive confirmation | pass¹ |
| 22 | chrome | weights its two footer buttons | FAIL |
| 23 | F-41-1 | contains none of the forbidden reassurances | pass¹ |
| 24 | F-41-1 | routes every rendered string through the catalog | FAIL |
| 25 | F-41-1 | adds no palette utility | pass¹ |
| 26 | R-3a | the outer row wraps | FAIL |
| 27 | R-3b | the name Input can shrink | FAIL |
| 28 | R-3c | the right cluster wraps too | FAIL |
| 29 | R-3 | adds no palette utility (toolbar) | pass |
| 30 | trigger | renders DryRunDialog to the LEFT of Save (V-41-1) | FAIL |
| 31 | trigger | passes dirty through | FAIL |
| 32 | trigger | keeps the existing Unsaved changes marker | pass |
| 33 | hint | renders dryRun.dirtyHint next to the disabled control | FAIL |
| 34 | hint | gives the hint to assistive technology, not only a tooltip | FAIL |
| 35 | trigger | renders as a secondary control, not a Play button | FAIL |

¹ These five are NEGATIVE assertions and passed vacuously against the absent file — which is exactly
what assertion 1 exists to expose, and it failed loudly with that message. All five became
substantive once the file existed.

After task 2: **30 passed / 5 failed** (the five remaining failures all toolbar assertions).
After task 3: **35 passed / 0 failed.**

## Answers to the plan's four recorded questions

**1. How `latestTriggerData` reaches the dialog — a THREADED PROP, not a store selector.**
`editor-store.ts` carries the workflow DEFINITION (`workflowId`, `workflowName`, `triggers`,
`workflowNodes`, plus UI state) and nothing at all about run history, so there was no selector to
read. The route taken is `page.tsx` → `WorkflowEditor` → `Toolbar` → `DryRunDialog`. This expanded
the plan's `files_modified` from 3 to 5 — see Deviations.

The prefill is the `data` payload of the stored `TriggerEnvelope`, not the envelope. `create-run.ts:71`
writes the whole envelope into `workflow_runs.trigger_data`, and `startDryRun` builds a *fresh*
envelope around whatever the operator submits — so prefilling with the envelope would have put
`trigger_type` and `timestamp` in front of the operator as if they were editable, and nested the real
payload one level deeper than the workflow's own templates read it (`engine.ts:157-158` resolves
`?.data`). The extractor `triggerPayloadOf` in `page.tsx` is total: a null column or an
unrecognisable blob prefills `{}` rather than throwing on an edit page.

The query filters `dryRun = false` — the most recent REAL run. A previous test run must not become
the next test's input, or a mistyped payload propagates forward silently.

**2. The `setState`-position scan WAS implementable, without a fourth brace matcher.**
`callArguments(source, "useEffect")` bounds the effect (it is a call, so an argument-list matcher
suffices); the inner async callback is then bounded by two *structural markers* —
`const poll = async` and `const interval = setInterval(` — both of which are separately asserted
present and ordered, and both resulting regions asserted non-empty. This sidesteps the
41-WAVE2-HANDOFF limit that neither `elementRegion` (JSX-only) nor `callArguments` (argument lists)
can bound a TypeScript function body. `setInterval(` / `setTimeout(` are filtered out of the
`/\bset[A-Z]\w*\(/` match so the DOM globals do not read as React setters. `npm run lint` → 0 errors
remains the authoritative check.

**3. The constants.**

| Name | Value | Notes |
|------|-------|-------|
| `DRY_RUN_POLL_INTERVAL_MS` | `1000` | same cadence as `scan-panel.tsx` and the importer's poll |
| `DRY_RUN_POLL_BUDGET_MS` | `30_000` | reachable in normal operation, not an error budget |
| `TERMINAL_STATUSES` | `["completed", "failed"]` | `cancelled` is not a `WorkflowStatus`; `waiting` is not terminal |

**4. The three stops, and a fourth guard the plan did not ask for.**
(a) a refusal inside the poll callback — a refusal will be refused again a second later;
(b) `result.status === null`, the absent-row answer, which `getWorkflowRunStatus` deliberately
reports as a *success* because a run can be pruned (T-41-67, and the item 41-WAVE2-HANDOFF called the
single most likely way this plan ships a bug);
(c) the derived-dependency cleanup — `pollRunId` turns `null`, the effect re-runs and clears;
(d) the 30 s wall-clock deadline, held as an **absolute timestamp captured at launch and stored in
state** rather than a `Date.now()` recorded inside the effect. That is a deliberate strengthening: a
`startedAt` in the effect body would be reset by *any* effect re-run, and the budget would then never
elapse.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `Toolbar` was prop-less, so `latestTriggerData` needed two more files**
- **Found during:** Task 3
- **Issue:** the plan listed 3 `files_modified`, but `Toolbar` takes no props, `WorkflowEditor`
  renders it as `<Toolbar />`, and the editor store carries no run history. There was no way to get
  the prefill into the dialog without touching the two files above it.
- **Fix:** threaded `latestTriggerData: Record<string, unknown> | null` through
  `page.tsx` → `WorkflowEditor` → `Toolbar`, exactly as the plan's task-3 action instructs ("thread
  it from the editor page as a prop on `Toolbar` rather than fetching it in a client component").
  The page's two reads run in one `Promise.all`.
- **Files modified:** `workflow-editor.tsx`, `page.tsx`
- **Commit:** 5295c7c

**2. [Rule 1 - Bug] the task-1 gate's bare-English-literal scanner matched the GAPS between literals**
- **Found during:** Task 2
- **Issue:** `/"([^"\n]*\s[^"\n]*)"/g` reads `["completed", "failed"]` and reports `, ` as a string
  literal. On the finished dialog it produced 35 offenders, every one of them a gap between two
  adjacent literals, an import-statement punctuation run, or the `"use client"` directive. A scan
  that cannot be satisfied by correct code is not a gate.
- **Fix:** replaced it with an alternation that CONSUMES double-quoted, single-quoted and template
  literals in one left-to-right pass, so a gap can never be re-read as a literal; then filtered to
  multi-word literals only, exempted the `"use client"` directive, and kept the
  Tailwind-token discriminator (every real class token here carries a `-`, a `:` or a `[`; an English
  word carries none).
- **Files modified:** `dry-run-dialog-wiring.test.ts`
- **Commit:** 8ba8bb4
- **No assertion was loosened to get the dialog green** — this one was made *correct*. The
  Tailwind-token discriminator is documented in the test as a heuristic that cannot see a
  single-word English literal, which is why the per-key `t(...)` assertions carry the real weight.

**3. [Documented divergence] the disabled-trigger hint lives in the dialog, not the toolbar**
- **Found during:** Task 1
- **Issue:** the plan's task-1 behaviour block asks `toolbar.tsx` to contain `dryRun.dirtyHint` and
  `aria-describedby`, while the same plan's task-2 action places the trigger, its `title` and its
  `aria-describedby` **inside** `DryRunDialog`. Both cannot hold, and the toolbar item is listed
  under the R-3 heading, which is purely about class tokens.
- **Resolution:** the dialog owns the trigger, so both assertions are made against the dialog
  source; the toolbar is instead asserted to pass `dirty` through, which is the wiring that makes
  the disabled-while-dirty state reachable at all. The rendered pixels are identical either way —
  `DryRunDialog`'s trigger and its hint render inside the toolbar row. The divergence is recorded in
  the gate file's own header so a verifier reads it as a decision rather than an omission.
- **Files modified:** none beyond the gate
- **Commit:** 74637db

### Not deviations, recorded because they look like ones

- **No second dirty indicator was added.** The existing `{dirty && (` "Unsaved changes" marker is
  untouched and verbatim. The `dryRun.dirtyHint` node is the `aria-describedby` target the recorded
  decision requires ("a `title` alone is invisible to touch and to screen readers"), styled in the
  same `text-xs text-muted-foreground` as the marker so it reads as a note on it.
- **`DryRunDialog` is rendered inside `{workflowId !== null && ( … )}`.** The store's `workflowId`
  is `string | null` and is populated by an effect on mount; the engine loads by that id, so before
  it exists there is no persisted definition to test.
- **The absent-row stop and the elapsed-deadline stop share `dryRun.timeout`.** No new key was
  added. Both mean "this dialog stopped waiting without a verdict" and both leave the operator with
  the same one useful next step, which that string states. A pruned-within-30-seconds run is
  essentially unreachable in practice.
- **`side-panel.tsx` is untouched.** Its `w-[400px]` 320px overflow is pre-existing and explicitly
  out of scope; `git status` confirms.
- **The existing English literals in `toolbar.tsx`** (*Export JSON*, *Import JSON*, *Save*,
  *Unsaved changes*) were not translated — UI-SPEC § i18n Scope declares that seam.

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run ".../dry-run-dialog-wiring.test.ts"` | **35/35 green** |
| `npx vitest run src/messages/locale-parity.test.ts` | **22/22 green** (no message file touched) |
| `npm test` | **4224 passed / 32 skipped** (154 files) + RSC **8/8** — baseline 4189 + the 35 new |
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **0 errors, 123 warnings** (baseline ≤127; nothing restored) |
| `git diff --name-only src/components/ui/` | **empty** — no primitive edited, no shadcn component added |
| `side-panel.tsx` / `step-detail` / `json-viewer` / `run-step-list` | **unmodified** |
| `--diff-filter=D` on all three commits | **no deletions** |

## Threat mitigations applied

| Threat | Where |
|--------|-------|
| T-41-81 tampering — operator trigger data | `validateTriggerData` on submit for feedback, with an explicit comment that `startDryRun` re-validates and that this parse is **not** the boundary |
| T-41-82 DoS — the poll loop | four stops (refusal, `status === null`, derived-dependency cleanup, absolute-timestamp deadline) |
| T-41-83 DoS — testing the wrong definition | `disabled={dirty}` + `title` + visible `aria-describedby` hint |
| T-41-84 — a dry run parked behind a delay | accepted; `dryRun.timeout` documented in the budget constant's doc comment as normal behaviour, not a failure |
| T-41-85 repudiation — copy asserting non-mutation | forbidden-phrase scan green; no such string written |
| T-41-86 info disclosure — the textarea at 320px | `max-h-[320px] overflow-y-auto`, no `wrap`, no font-size override, all gated on the tag |
| T-41-87 — `set-state-in-effect` | every setter inside the async callback; gated twice (scan + lint 0 errors) |
| T-41-SC — installs | **nothing installed, no shadcn component added**, `src/components/ui/` diff empty |

## Known Stubs

None. Every rendered value has a data source: the prefill comes from the page's query, the status
from `getWorkflowRunStatus`, and all fifteen strings from the catalog wave 1 wrote.

## Self-Check: PASSED

- `src/app/workflows/[id]/edit/components/dry-run-dialog.tsx` — FOUND
- `src/app/workflows/[id]/edit/__tests__/dry-run-dialog-wiring.test.ts` — FOUND
- `74637db` — FOUND
- `8ba8bb4` — FOUND
- `5295c7c` — FOUND
