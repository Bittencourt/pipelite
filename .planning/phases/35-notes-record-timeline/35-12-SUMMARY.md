---
phase: 35-notes-record-timeline
plan: 12
subsystem: ui-components
tags: [react, client-components, next-intl, discriminated-union, exhaustiveness, cfui-01, notes, timeline, i18n]

# Dependency graph
requires: ["35-02", "35-05", "35-11"]
provides:
  - "`ActivityEntry({ entry })` — activity row with type icon rail, title link and due/completed line"
  - "`StageChangeEntry({ entry })` — stage-change row with actor, and from/to stages as inherited pastel badges"
  - "`TimelineEntryRow({ entry, canManage, onUpdated, onDeleted })` — the exhaustive, compile-checked dispatcher over `TimelineEntry`"
  - "`EmptyTimeline({ variant })` — 'full' (deal) vs 'notesOnly' (org/person/activity) empty copy"
affects: [35-13, 35-14, 35-15, 36]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sentinel-slot rich interpolation: next-intl placeholders accept only string/number/Date, so a message whose placeholders must render as React elements is formatted with NUL-delimited sentinels and split back apart — the localized WORD ORDER stays authoritative instead of being hardcoded in JSX"
    - "Sentinels written as source escapes (`\\u0000`), never as raw bytes, so the file stays plain text and grep-based verification gates keep working"
    - "`const unhandled: never = entry` in the switch default, proven to fire by temporarily widening the union"

key-files:
  created:
    - src/components/timeline/activity-entry.tsx
    - src/components/timeline/stage-change-entry.tsx
    - src/components/timeline/timeline-entry.tsx
    - src/components/timeline/empty-timeline.tsx
  modified: []

key-decisions:
  - "The stage-change sentence is assembled by formatting `notes.entry.stageChanged` with NUL sentinels and splitting on them, because next-intl's `RichTranslationValues` admits React elements only for TAG functions and this message has none — the alternative was rendering each stage name twice (once in prose, once in a badge)"
  - "A null `fromStageName` renders the destination badge ALONE rather than a mutilated sentence: `stageChanged` has no one-stage variant, and dropping a clause out of a translated string does not survive contact with es-ES or pt-BR word order"
  - "`ActivityEntry` keys its icon map on the type NAME, not on the type's stored `icon` column, because `ActivityTimelineEntry` (35-05) carries `typeName` and not `icon` — the resulting pairing is identical to what `activity-list.tsx` produces"
  - "`timeline-entry.tsx` carries zero Tailwind classes, enforced by construction: it is a dispatcher, and a class appearing there means a layout decision leaked out of the renderer that owns it"
  - "The exhaustiveness gate was empirically verified, not asserted: adding an `'audit'` kind to `TimelineEntryKind` produced exactly one tsc error, in this file"

patterns-established:
  - "All three entry kinds now share one row skeleton verbatim (`w-8 shrink-0` rail, `gap-2`, `min-w-0 flex-1` column, `flex flex-wrap items-center gap-2` line 1), documented as a contract in each file's header rather than left as a coincidence"
  - "Inherited colour maps are reproduced verbatim with their original fallbacks and a comment naming the source line range, so a future reader can tell 'copied on purpose' from 'invented here'"

requirements-completed: [NOTE-02]

# Metrics
duration: 18min
completed: 2026-08-15
---

# Phase 35 Plan 12: Activity and Stage-Change Renderers, Entry Switch and Empty State Summary

**The timeline now renders all three entry kinds through one dispatcher whose default branch is a `never` assignment — verified by widening the union and watching tsc fail in exactly one file — with activities and stage changes drawn on the same row skeleton as notes and coloured entirely by the two colour maps that already existed.**

## Performance

- **Duration:** ~18 min
- **Tasks:** 2
- **Files created:** 4
- **Tests:** no new tests; the suite stays at 1016 passed / 4 skipped plus 8 RSC, and the CFUI-01 gate passes 14/14 after each task

## Accomplishments

### Task 1 — `activity-entry.tsx` and `stage-change-entry.tsx` (`2e82399`)

Both files reproduce the `note-entry.tsx` skeleton exactly — a `w-8 shrink-0` rail, `gap-2`, and a `min-w-0 flex-1` content column whose first line is `flex flex-wrap items-center gap-2`. Each file's header states that this is a contract and not a coincidence, because SC-2's "one chronological feed" only reads as one feed if the three kinds line up on the same grid.

**ActivityEntry.** A `size-8 rounded-full bg-muted` circle holds the lucide icon at `h-4 w-4 text-muted-foreground` with `aria-hidden`. The title is a `Link` to `/activities/{id}` at `text-primary hover:underline` — one of the three sanctioned uses of `--primary` in this card. Line 2 renders `notes.entry.activityCompleted` when `completedAt` is set and `notes.entry.activityDue` with the formatted due date otherwise; the branch is a single ternary, so the two can never both appear. The type badge reuses `colorMap` from `activity-list.tsx:99-104` verbatim, including its `bg-gray-100 text-gray-800` fallback for an unrecognised type name.

The icon map here keys on the type **name** rather than on the type's stored `icon` column, because `ActivityTimelineEntry` carries `typeName` and not `icon`. The pairing it produces (Call → Phone, Meeting → Users, Task → CheckSquare, Email → Mail) is the same one `activity-list.tsx` produces from the icon field, and an unknown custom type falls back to `CheckSquare` — an icon already in the UI-SPEC's sanctioned set, so no new icon enters the phase.

**StageChangeEntry.** The same `bg-muted` circle holding `ArrowRight`, `aria-hidden`. Line 1 is the actor name falling back to `notes.unknownAuthor`, then the `<time>` element wrapping `RelativeTime`. Line 2 renders `notes.entry.stageChanged` with both stage names as badges coloured through the `stageColors` map copied verbatim from `src/app/deals/[id]/page.tsx:80-89`, including its `slate` fallback.

Neither file renders an Edit or Delete control. Neither introduces a hue, a hex, or a token.

### Task 2 — `timeline-entry.tsx` and `empty-timeline.tsx` (`d60aabf`)

`TimelineEntryRow` switches on `entry.kind` and forwards `canManage` / `onUpdated` / `onDeleted` only to `NoteEntry`, since only notes are manageable. It contains **zero Tailwind classes** — every visual decision stays in the renderer that owns it, which is what keeps the three skeletons from drifting.

The default branch assigns the narrowed entry to a `never`-typed local. This was verified empirically rather than assumed: temporarily appending `'audit'` to `TimelineEntryKind` and adding an `AuditTimelineEntry` to the union produced exactly one error —

```
src/components/timeline/timeline-entry.tsx(59,13): error TS2322: Type 'AuditTimelineEntry' is not assignable to type 'never'.
```

— and nothing else in the repo broke. That is precisely the Phase 36 hand-off T-35-32 asks for: a new kind is a compile error here, not a row that silently disappears from a history surface. `types.ts` was restored byte-for-byte afterwards and typecheck re-run clean.

`EmptyTimeline` takes `variant: 'full' | 'notesOnly'`. The `full` copy promises notes, activities and stage changes, which is honest only for deals; organizations, people and activities get `notesOnly`, because `appliesTo` in `sources.ts` gives them the notes source alone. Both bodies end by pointing at the composer, and the header records the coupling that makes that copy true: the card must keep `NoteComposer` rendered above the empty state rather than swapping the whole content out.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `node_modules` absent from the worktree**

- **Found during:** Task 1 setup
- **Issue:** The worktree has no `node_modules`, so `npm run typecheck`, `npx vitest` and `npm run lint` — every verification gate in this plan — could not run at all.
- **Fix:** Symlinked `node_modules` to the main checkout's. No package was installed, added, or resolved; the symlink is gitignored and untracked, and `git status` stayed clean apart from the four new source files.
- **Files modified:** none (untracked symlink)

**2. [Rule 1 - Bug] NUL sentinels landed as raw bytes and made the file binary to grep**

- **Found during:** Task 1
- **Issue:** The stage-change sentinels were written as literal NUL **bytes** in the source rather than as `\u0000` escape sequences. The code worked, but `grep` classifies a file containing NUL as binary and reports `Binary file matches` instead of a count — which would have silently broken this plan's own `grep -cE '#[0-9a-fA-F]{6}|bg-white|text-black'` gate and every future grep-based check against this file, including the T-35-05 raw-HTML gate.
- **Fix:** Rewrote both constants as source-level `"\u0000from\u0000"` / `"\u0000to\u0000"` escapes. The runtime value is unchanged — still NUL-delimited and still impossible to collide with translated prose — but the file is now plain ASCII.
- **Files modified:** `src/components/timeline/stage-change-entry.tsx`
- **Commit:** `2e82399`

### Intentional Interpretations

- **The stage sentence is sentinel-split, not duplicated.** The plan asks for `notes.entry.stageChanged` "interpolating from and to" *and* for the stage names to render as badges. next-intl cannot do both directly: `RichTranslationValues` accepts React elements only for tag functions, and this message has no tags — its placeholders take `string | number | Date` only. Formatting the message with NUL sentinels and splitting on them satisfies both halves and keeps the **localized word order** authoritative, which matters concretely: es-ES is "movió este trato de {from} a {to}" and pt-BR is "moveu este negócio de {from} para {to}". The rejected alternative — a hardcoded `from … to …` JSX shape, or printing each stage name once in prose and again in a badge — would have baked English structure into the layout.
- **A null `fromStageName` renders the destination badge alone.** The plan asks to "render only the destination badge and keep the sentence grammatical". There is no one-stage variant of `stageChanged`, and cutting a clause out of an already-translated string is not something that survives another locale's word order. Adding a new key was rejected because it would have required edits to all three locale files, which are outside this plan's `files_modified`. Line 1 still carries the actor and the timestamp, so nothing is lost but the redundant origin clause.
- **`EmptyTimeline` is a client component.** The UI-SPEC's inventory table calls its boundary "shared"; the plan's `<interfaces>` block specifies `'use client'` first. The plan wins, and `useTranslations` (rather than `getTranslations`) follows from it.
- **The unknown-activity-type fallback is `CheckSquare`.** The plan asks for "a sensible fallback" without naming one. `CheckSquare` is already in the UI-SPEC's sanctioned lucide set, so a custom activity type gets a rail icon instead of an empty circle without pulling a new icon into the phase.

### Notes for Downstream Plans

- **35-13 owns the `<ol>`/`<li>`.** All four components here render plain `<div>`s. The Accessibility Contract's ordered-list structure, the decorative `bg-border` vertical connector, and the `aria-live` region belong to the list component.
- **`TimelineEntryRow`'s `onUpdated` must be honoured.** `NoteEntry` clears its optimistic override immediately after calling `onUpdated` (35-11), so 35-13's list must replace the entry by id or a successful edit visibly snaps back to the old text. The dispatcher forwards the callback untouched.
- **`EmptyTimeline` does not render the composer.** Its copy says "Write the first note above", which is only true if the card keeps `NoteComposer` mounted above the empty state. Do not swap the entire card content for `EmptyTimeline`.
- **Phase 36's `'audit'` kind lands here first.** Appending it to `TimelineEntryKind` will fail `tsc` at `timeline-entry.tsx` until a branch and a renderer exist. That is the intended workflow, not an obstacle.

## Known Stubs

None. All four components render real data from the 35-05 types; nothing is placeholder-fed.

## Threat Flags

None. No network endpoint, auth path, file access pattern or schema change was introduced. All four files are presentational client modules over already-authorized data.

## Threat Model Coverage

| Threat ID | Disposition | How it is met here |
|-----------|-------------|--------------------|
| T-35-05 | mitigate | Activity titles and stage names render as React text children; the raw-HTML injection prop is grep-verified absent from both renderers, and no markdown or HTML parser is imported |
| T-35-32 | mitigate | The `never` assignment was proven to fire by widening the union — a new kind is a compile error, not a dropped row |
| T-35-30 | mitigate | `rsc-boundary.test.tsx` re-run after each task, 14/14 both times |
| T-35-SC | accept | Zero packages installed; every icon and both colour maps already existed in the repo |

## Verification

| Gate | Result |
|------|--------|
| `npm run typecheck` | clean after each task |
| `npx eslint <each new file>` | no issues found, on all four |
| `npm run lint` (repo) | 0 errors, 128 warnings — the same 128 pre-existing warnings 35-11 recorded, none in the new files |
| CFUI-01 `rsc-boundary.test.tsx` | 14 passed / 0 failed, after each task |
| `npm test` (both vitest projects) | 1016 passed / 4 skipped, plus 8 RSC — no regressions |
| Exhaustiveness gate, negative test | adding `'audit'` to the union → exactly 1 tsc error, in `timeline-entry.tsx` |
| `use client` first line | all four files |
| Hardcoded colour grep (`#hex`, `bg-white`, `text-black`) | 0 in both renderers |
| Raw-HTML injection prop | 0 occurrences in all four files, including in prose |
| `SWITCH_COMPLETE` (`never` + all three renderers referenced) | true |
| `BOTH_EMPTY_VARIANTS` (`emptyNotes` + `empty.heading`) | true |
| Tailwind classes in the dispatcher | 0 |

## UI-SPEC States Covered

| State | Where |
|-------|-------|
| Empty (deal) | `EmptyTimeline variant="full"` — `notes.empty.*` |
| Empty (org / person / activity) | `EmptyTimeline variant="notesOnly"` — `notes.emptyNotes.*` |
| Activity, open | due date rendered via `notes.entry.activityDue` |
| Activity, done | `notes.entry.activityCompleted`, due date suppressed |
| Stage change, normal | both stage badges inside the localized sentence |
| Stage change, created into a stage | destination badge alone |
| Unknown actor | `notes.unknownAuthor` on the stage-change row |

Populated, has-more, loading-more and dark-mode verification belong to 35-13 / 35-15.

## Self-Check: PASSED

- `src/components/timeline/activity-entry.tsx` — FOUND
- `src/components/timeline/stage-change-entry.tsx` — FOUND
- `src/components/timeline/timeline-entry.tsx` — FOUND
- `src/components/timeline/empty-timeline.tsx` — FOUND
- Commit `2e82399` — FOUND
- Commit `d60aabf` — FOUND
