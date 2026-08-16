---
phase: 36-audit-log
plan: 16
subsystem: ui
tags: [next-intl, rsc, workflows, audit-log, lucide-react, drizzle]

# Dependency graph
requires:
  - phase: 36-04
    provides: the `audit` next-intl namespace across all three locale files, including every `audit.run.*` key this section renders
  - phase: 36-09
    provides: "`readRunChangedRecords` and the `RunChangedRecord` contract in `src/lib/audit/linked-records.ts`"
provides:
  - "`RunChangedRecords` — the records-changed panel on the workflow run detail page, with its empty and degraded states"
  - "the only call site of `readRunChangedRecords`, wrapped in a try/catch that degrades instead of taking the run page down"
  - "closes the second half of SC-2: from a run, see every record that run mutated"
affects: [audit-log verification, future workflows-tree i18n migration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "read-in-the-page, render-in-the-component: the reader throws honestly, the page catches, and the failure arrives as a prop so an empty list always means empty"
    - "linkability is governed by existence, not by title: deleted and hard-deleted records render as plain muted text"

key-files:
  created:
    - "src/app/workflows/[id]/runs/[runId]/components/run-changed-records.tsx"
  modified:
    - "src/app/workflows/[id]/runs/[runId]/page.tsx"

key-decisions:
  - "Panel props are flat `{ records, failed }` with a single call site, rather than a discriminated union with two JSX branches — the plan's own grep gate wanted one usage, and `failed` is checked before `records.length` so a degraded render can never be mistaken for an empty one"
  - "A live record with no title still links (muted label 'Untitled record'); only `deleted` suppresses the link, because the detail page works whenever the row exists"
  - "`ENTITY_PATHS` is duplicated locally rather than extracted to a shared helper — `person → /people` already appears as a local const in two import wizards, and a cross-cutting route helper is not this plan's scope"
  - "The bordered-panel class string is written out twice verbatim instead of hoisted to a const, matching `RunStepList` and the plan's acceptance gate"

patterns-established:
  - "Degraded-state guard for optional RSC sections: log server-side, set a flag, pass it down — the same shape `record-timeline.tsx` uses, and the only thing between a connection blip and Next.js's default full-page error (there is still no error.tsx under src/app/)"

requirements-completed: [AUDIT-03]

# Metrics
duration: 22min
completed: 2026-08-16
---

# Phase 36 Plan 16: Workflow Run → Records Changed Summary

**The workflow run detail page now ends with a translated panel listing every distinct CRM record that run mutated — live records linked, deleted ones honestly dead-ended, and a query failure degraded to a message instead of a blank page.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-08-16T00:00Z (approx.)
- **Completed:** 2026-08-16T00:22Z (approx.)
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- `RunChangedRecords` server component: one row per distinct record, newest first, with the entity icon on the left and the action badge / field count / relative timestamp subordinate on the right.
- Three states, all in the page's existing visual vocabulary: the list, the `audit.run.empty` bordered panel, and the `audit.run.unavailable` bordered panel.
- The run detail page calls `readRunChangedRecords(runId)` inside a `try`/`catch`, logs the error server-side, and hands the section a `failed` flag — closing T-36-35.
- Deleted and hard-deleted records are listed but not linked (T-36-36). The row never disappears: the run did mutate that record, and dropping it would make the list a lie.
- Zero new packages, zero new locale keys (36-04 already shipped every `audit.run.*` key in all three locales), zero new icon symbols.

## Task Commits

1. **Task 1: Build the records-changed panel** — `869f9f7` (feat)
2. **Task 2: Insert the section into the run detail page with a degraded-state guard** — `778c96f` (feat)

## Files Created/Modified

- `src/app/workflows/[id]/runs/[runId]/components/run-changed-records.tsx` — the panel. Server component; renders only `Link`, `Badge` (no children-forwarding slot prop), plain DOM and lucide icons. Holds `ENTITY_PATHS`, `ENTITY_ICONS` (the nav-header vocabulary) and `ACTION_BADGE_VARIANT` (`outline` for created/updated, `secondary` for deleted — never `destructive`).
- `src/app/workflows/[id]/runs/[runId]/page.tsx` — imports the panel and `readRunChangedRecords`, performs the guarded read, and renders the section as the last block in the `space-y-6` stack, after `<RunStepList />`.

## Decisions Made

- **Flat props over a discriminated union.** The first draft used `{ failed: true } | { records: [...] }`, which made "failed but has records" unrepresentable — but it forced two JSX branches at the call site and pushed the plan's `RunChangedRecords` count to four. Switched to `{ records, failed }` with `failed` checked first, which is the plan's own primary suggestion and reads better at the call site. The invariant is preserved locally: `changedRecords` stays `[]` whenever `changedRecordsFailed` is true.
- **A live untitled record still links.** The UI-SPEC's "unknown title → muted" row describes the *label*, not the element. `success_criteria` says "Live records link; deleted and missing records do not", so linkability keys off `deleted` alone; the label goes muted when `title === null`.
- **`flex-wrap` added to the `<li>`.** The plan's literal row class was `flex items-center justify-between gap-2 px-4 py-3`, but the UI-SPEC also requires that below `sm` the metadata wraps *under* the title with nothing truncating at 320px. That only happens if the row itself can wrap, so `flex-wrap` was added to the `<li>` (and `min-w-0` / `break-words` on the title cluster). All the plan's specified tokens are still present.
- **`getFormatter()` for the `title` attribute.** `<time dateTime>` carries the ISO instant and `title` carries a localised medium/short datetime, matching `note-entry.tsx`'s treatment rather than dumping an ISO string into the tooltip.

## Deviations from Plan

None — no deviation rules fired. No bugs found, nothing blocked, no architectural question raised. The prop-shape and `flex-wrap` choices above are decisions within the plan's stated latitude ("or a discriminated prop"; "Responsive: … the metadata wraps under the title"), not deviations from it.

## Issues Encountered

### Two acceptance greps are unsatisfiable as literally written

Both are instances of the known `grep -c` counts-lines defect. Neither was worked around by contorting the code; the disambiguated numbers are reported instead.

**1. `grep -c "getTranslations" run-changed-records.tsx` expected `1`, actual `2`.**
The `import { getFormatter, getTranslations } from "next-intl/server"` line matches alongside the `await getTranslations("audit")` call. Call sites verified with `grep -c "getTranslations("` → **1**, as intended. There is exactly one namespace acquisition in the file.

**2. `grep -c "RunChangedRecords" page.tsx` expected `2` (import + usage), actual `5`.**
`readRunChangedRecords` *contains* the substring `RunChangedRecords`, so the reader's import line, the call line, and one doc-comment mention of the reader all match the component's name. Disambiguated:
- `grep -cE '(^|[^A-Za-z])RunChangedRecords' page.tsx` → **2** (the component import + the single JSX usage) ✅
- `grep -c '<RunChangedRecords' page.tsx` → **1** (one call site) ✅
- `grep -c 'readRunChangedRecords(' page.tsx` → **1** (one call site) ✅ — the plan's `readRunChangedRecords` gate expected `1` and the raw line count is `3` (import + call + one doc-comment mention).

### All other acceptance criteria pass literally

| Gate | Expected | Actual |
|------|----------|--------|
| `grep -c '"use client"'` (panel) | 0 | 0 ✅ |
| `grep -c 'asChild'` (panel) | 0 | 0 ✅ |
| `grep -c 'variant="destructive"'` (panel) | 0 | 0 ✅ |
| `grep -c 'rounded-md border p-6 text-center text-sm text-muted-foreground'` (panel) | 2 | 2 ✅ |
| `grep -cE 'Building2\|Users\|Kanban\|CheckCircle2'` (panel) | ≥4 | 5 ✅ |
| panel line count | ≥60 | 168 ✅ |
| `grep -c 'try {'` (page) | +1 | 0 → 1 ✅ |
| `grep -c 'session.user.id ===\|ownerId'` (page) | 0 | 0 ✅ |
| `<RunChangedRecords` after `<RunStepList` | yes | line 174 vs line 169 ✅ |

## Verification

- `npm run typecheck` → clean (`tsc --noEmit`, no output).
- `npx vitest run "src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx"` → **14 passed, 0 failed**. The repo-wide CFUI-01 gate stays green; `Badge` is not a definer (it uses `asChild ? Slot.Root : "span"`, not the `asChild>{children}` forwarding pattern), so a server component may render it.
- `npm test` → **74 files / 1287 passed, 4 skipped**, plus the `rsc` project's **2 files / 8 passed**. `locale-parity.test.ts` still green — all `audit.run.*` keys were already shipped by 36-04 in en-US, es-ES and pt-BR, so this plan added no locale files.
- `npm run lint` → 0 errors, 125 warnings, **none in either file this plan touched** (all pre-existing `no-unused-vars` warnings elsewhere in the repo).

## Threat Model Coverage

| Threat ID | Disposition | How it landed |
|-----------|-------------|---------------|
| T-36-04 | accept | No auth code added. The page keeps its session-only posture; `grep -c 'session.user.id ===\|ownerId'` → 0. |
| T-36-35 | mitigate | `readRunChangedRecords` is called inside `try`/`catch` in `page.tsx`; the catch logs server-side and sets `changedRecordsFailed`, which renders `audit.run.unavailable` in the bordered panel. |
| T-36-36 | mitigate | `record.deleted` renders a plain `<span>`, never a `<Link>`. |
| T-36-32 | mitigate | Panel is a server component with zero `asChild`; CFUI-01 class-wide gate passes. |
| T-36-SC | accept | Zero packages added. |

## Threat Flags

None. This plan adds no network endpoint, no auth path, no file access and no schema change. It is a read-only render of data a merged plan already exposes.

## Known Stubs

None. Every element in the panel is wired to real `RunChangedRecord` data from `readRunChangedRecords`; there is no placeholder copy, no hardcoded empty array flowing to the UI, and no component receiving mock props.

## Out-of-scope discoveries

(Recorded here rather than in `deferred-items.md`, per the executor brief.)

- **The `/workflows` tree is still un-internationalised.** "Back to Runs", "Duration:", "Run #", "Not started", "Failed at:" and every `RunStepList` string on this same page remain English literals. This section is now the only translated block on the page — a visible seam for es-ES and pt-BR users. This is the declared, deliberate trade from 36-UI-SPEC § Surface 2, not an oversight. Migrating the rest of the run page is a future, separate piece of work.
- **`ENTITY_PATHS` now exists in three places** (`import-wizard.tsx:32`, `pipedrive-wizard.tsx:48`, and this panel). A shared `entityPath(entityType, id)` helper would be a reasonable small cleanup, but touching two import wizards is unrelated scope for an audit-log phase.

## User Setup Required

None — no external service configuration, no environment variables, no migrations.

## Next Phase Readiness

- SC-2 is now closed on both halves: the record timeline shows what changed a record, and the run detail page shows what a run changed.
- `readRunChangedRecords` has exactly one consumer, as designed. Any future consumer must supply its own `try`/`catch` — the reader still deliberately has none, and there is still no `error.tsx` anywhere under `src/app/`.
- Nothing blocks the remaining wave-3 plans.

## Self-Check: PASSED

All claimed files exist on disk and all claimed commits exist in this worktree's history:

- `src/app/workflows/[id]/runs/[runId]/components/run-changed-records.tsx` — FOUND
- `src/app/workflows/[id]/runs/[runId]/page.tsx` — FOUND
- `.planning/phases/36-audit-log/36-16-SUMMARY.md` — FOUND
- `869f9f7` — FOUND (168 insertions, panel created)
- `778c96f` — FOUND (2 files, page wiring + prop-shape change)
- `b8b6587` — FOUND (this summary)

No unexpected deletions in any commit (`git diff --diff-filter=D HEAD~1 HEAD` empty for both task commits).

---
*Phase: 36-audit-log*
*Completed: 2026-08-16*
