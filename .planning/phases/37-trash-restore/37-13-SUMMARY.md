---
phase: 37-trash-restore
plan: 13
subsystem: trash-ui
tags: [trash, client-component, tanstack-table, alert-dialog, source-gate, a11y, i18n]

requires:
  - phase: 37-trash-restore
    provides: "37-02 — TrashTab, DeletedByPresentation, presentDeletedBy"
  - phase: 37-trash-restore
    provides: "37-03 — the 61 trash.* / nav.trash / admin.dashboard.* message keys"
  - phase: 37-trash-restore
    provides: "37-07 — TrashRow and its ISO-serialised activity due date"
  - phase: 37-trash-restore
    provides: "37-10 — restoreRecord, restoreWithLinked, purgeRecord and TrashErrorCode"
  - phase: 36-audit-log
    provides: "audit.actorKind.* and audit.unknownActor, and the actor icon vocabulary"
provides:
  - "src/app/trash/trash-columns.tsx — useTrashColumns(tab), TrashTableMeta"
  - "src/app/trash/trash-table.tsx — TrashTable"
  - "src/app/trash/__tests__/trash-client-wiring.test.ts — the comment-stripped wiring gate"
affects:
  - "the /trash page shell (later in wave 4), which renders <TrashTable> inside its active tab"

tech-stack:
  added: []
  patterns:
    - "row actions handed to a column through an exported, typed `table.options.meta` contract instead of the repo's `@ts-expect-error` meta idiom"
    - "one useTransition for every write on a surface whose writes are mutually exclusive by construction"
    - "a client component's wiring gated by comment-stripped SOURCE assertions, because this repo renders no client component in tests"
    - "exhaustive switch over a presentation union with a `const unhandled: never` guard, in the render layer"

key-files:
  created:
    - src/app/trash/trash-columns.tsx
    - src/app/trash/trash-table.tsx
    - src/app/trash/__tests__/trash-client-wiring.test.ts
  modified: []

key-decisions:
  - "One `startTransition` rather than two: the purge dialog is modal, so no row action is reachable while it is open, and the purge path never sets pendingRowId — the two transitions could not overlap"
  - "The actions column reads an exported `TrashTableMeta` through a cast rather than the analog's `@ts-expect-error`, so a renamed callback is a compile error instead of a silently absent button"
  - "The workflow_run link renders only when runId, workflowId AND workflowName are all present — an anchor with no text is not a better outcome than the badge alone"
  - "The activities secondary cell formats the ISO instant 37-07 deliberately deferred; rendering it raw would put 2026-08-16T00:00:00.000Z in front of a user"
  - "The comment explaining why the shared list-table keyboard hook is absent does not NAME that hook, because the acceptance gate greps the raw file for zero occurrences"

requirements-completed: [TRASH-01, TRASH-02, TRASH-03]

duration: ~45min
completed: 2026-08-16
tasks_completed: 3
tests_added: 19
files_created: 3
---

# Phase 37 Plan 13: Trash Columns and Table Summary

**The two client leaves of `/trash`: five columns that say what a record was, when it went, who
sent it there and whether its parent went too, and a table whose three row actions call the wave-3
server actions, branch on their five codes instead of their prose, and hide the purge control from
anyone who is not an admin — all of it gated by comment-stripped source reads, because this repo
renders no client component in a test.**

## Performance

- **Duration:** ~45 min
- **Tasks:** 3 (4 commits — the third task's contract forced one small refactor of the second)
- **Files created:** 3, modified 0
- **Tests added:** 19

## What Was Built

### `trash-columns.tsx` — `useTrashColumns(tab)` (Task 1)

Five columns for all four tabs. The interesting one is the fourth.

**The deleted-by cell switches over all seven presentations behind a `const unhandled: never`
guard.** Six of the seven are cheap; the value is in the two that are not:

- **`notRecorded` and `unknownUser` render different strings**, in different styles, from
  different namespaces. "Unknown user" (`audit.unknownActor`) means *a user did this and that
  user row is gone*. "Not recorded" (`trash.actor.notRecorded`, italic muted, with its
  explanation in a native `title`) means *nobody wrote it down*. On the current live data the
  second is 100% of trash, and collapsing them is T-37-REP2 exactly.
- **The `api_key` badge carries the kind label and nothing else.** 37-UI-SPEC asks for "the key
  name beside it when known"; `audit_log` has no api-key reference, and the only user id on that
  row is the key's *owner*. Resolving a name through it would pick an arbitrary one of that
  user's keys and print it as fact (T-37-09). 37-02 made the same refusal in the presenter; this
  file does not undo it in the renderer.

Every actor kind is carried by **text**. The four icons inside the badges are `aria-hidden`, so
the actor is available to a screen reader — which is half of SC-1.

The record name is Label 14/600, **not a link** (a trashed record's detail page either 404s or
renders a live view of a deleted record, and a dead link is worse than an honest dead end), and it
overrides `TableCell`'s default `whitespace-nowrap` so the linked-in-trash badge can sit under a
long title rather than pushing it off the row. That badge is `variant="secondary"` with a muted
`Trash2` — no warning icon, no warning colour, because a trashed parent is a fact about the data.

Phase 36's `audit.actorKind.*` and `audit.unknownActor` are reused, not duplicated: the same
delete rendered in a record's timeline and in this table must read identically.

No checkbox column, no sort control, no search input. Each is a deliberate omission with a
comment, and each would have to be undone by Phase 38 or by the ordering contract.

### `trash-table.tsx` — `TrashTable` (Task 2)

The TanStack body copied from `organizations/data-table.tsx`, minus four things, plus the three
row actions and the purge confirmation.

**Failures branch on the code, never on prose.** `NOT_IN_TRASH` becomes "this record was
permanently deleted and can't be restored" **plus a `router.refresh()`** so the stale row leaves —
the difference between that and the generic sentence is the difference between an accurate
statement and telling a user to retry a record that no longer exists, forever (T-37-34). A
`NOT_ADMIN` purge result becomes "only an admin can permanently delete records", which is a
reachable path precisely because the control is hidden rather than gated.

**The purge control is hidden for non-admins, not disabled**, and the server action re-checks the
role on every call regardless. A permanently disabled destructive button is furniture and invites
"how do I enable this?"; the client visibility is a courtesy and never the gate (T-37-01).

**The `AlertDialog` is controlled, with no trigger component of its own**, and lives entirely
inside this `'use client'` module. `onOpenChange` refuses to close while the request is in flight,
so ESC and an overlay click cannot abandon a running purge, and the confirm's `onClick` calls
`event.preventDefault()` before starting the transition so Radix does not close the dialog out
from under the spinner. Its description names what **survives** — the record's change history is
kept — as well as what dies (T-37-14).

**A success toast is required here and is not a violation of the "no success toast where the
result is visible" rule** — it is the case that rule was written to exclude. A row vanishing from
trash is ambiguous between restored and destroyed, so the toast names the destination list and
carries an **Open** action. The linked variant reports the server's `count`, not the length of the
badge's parent list, because a parent the caller may not touch is skipped by design and the two
can legitimately differ.

Only the clicked row goes busy; every other row stays interactive. After any successful restore or
purge, focus moves to the table wrapper (`tabIndex={-1}`) rather than being dropped to `<body>`,
and the announcement rides Sonner's own live region — no second `aria-live` region was added.

Ghost and outline only. Zero accent-filled controls on this surface.

### `trash-client-wiring.test.ts` (Task 3)

19 assertions against `readStrippedSource(...)` of both components. Every failure message names
what the component must **do**, not which string was missing — e.g. a missing `AlertDialogTrigger`
check reads *"the dialog must be controlled through open/onOpenChange; an AlertDialogTrigger
reintroduces the asChild slot this phase is required to keep off the RSC boundary"*.

The shared helper is used rather than a local `readFileSync`, for the reason Phase 35 recorded:
most of these are negative assertions, and a negative source assertion is trivially satisfied — or
trivially broken — by prose in a comment.

## Task Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | `7bd0dc5` | feat(37-13): add the trash column definitions and the deleted-by cell |
| 2 | `60e6607` | feat(37-13): add the trash table with row actions and the purge dialog |
| 2→3 | `5c5133e` | refactor(37-13): use one named transition for all three trash writes |
| 3 | `e6e735e` | test(37-13): gate the trash client wiring with comment-stripped source reads |

## Verification

| Check | Required | Result |
|-------|----------|--------|
| `npx vitest run src/app/trash/__tests__/trash-client-wiring.test.ts` | ≥14 assertions | **19 passed** |
| Gate proven to fire | required | injected `text-red-500` into a `className` in `trash-table.tsx` → **18 passed / 1 failed**, naming the token; reverted → **19 passed / 0 failed** |
| `npm run typecheck` | exit 0 | **exit 0** |
| `npm run lint` | 0 errors | **0 errors, 125 warnings** (baseline unchanged; none in the three new files) |
| `npx vitest run --config vitest.rsc.config.ts` | green | **8 passed** |
| Repo-wide CFUI-01 scan (`rsc-boundary.test.tsx`) | green | **14 passed** |
| `npm test` | green across both projects | **1682 passed / 4 skipped**, plus **8 rsc** (baseline 1663 + 19 new) |
| `grep -c 'never' trash-columns.tsx` | ≥1 | **4** (includes the exhaustiveness guard) |
| `grep -c 'notRecorded'` / `'unknownActor'` in trash-columns.tsx | ≥2 / ≥1 | **4 / 1** |
| `grep -c 'whitespace-normal' trash-columns.tsx` | ≥1 | **1** |
| `grep -cE '<forbidden colours>'` on both files | 0 | **0 / 0** |
| `grep -c 'AlertDialogTrigger' trash-table.tsx` | 0 | **0** |
| `grep -c 'event.preventDefault()' trash-table.tsx` | ≥1 | **1** |
| `grep -c 'useDataTableKeyboard' trash-table.tsx` | 0 | **0** |
| `grep -c 'isAdmin' trash-table.tsx` | ≥2 | **3** |
| `grep -cE '>(Save\|Cancel\|Confirm\|OK\|Yes\|Apply)<' trash-table.tsx` | 0 | **0** |
| `grep -ci 'load more' trash-table.tsx` | 0 | **0** (the string is `t('loadMore')`) |
| `grep -c 'readFileSync'` in the test | 0 | **0** |
| Purge control has no `disabled` on its render condition | verified by read | **confirmed** — it is `{isAdmin ? <Button …/> : null}` with no `disabled` prop |

No flakes. `condition-evaluator.test.ts` and `toggle.test.ts` both passed in the full run.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The worktree had no `node_modules`**

- **Found during:** Task 1 verification
- **Issue:** the agent worktree was created without dependencies, so `npx vitest`, `npm run
  typecheck` and `npm run lint` could resolve nothing.
- **Fix:** symlinked the main checkout's `node_modules` into the worktree. `/node_modules` is
  gitignored, nothing was staged, no lockfile changed, and **no package was installed** — this
  phase installs nothing (T-37-SC).
- **Files modified:** none tracked
- **Commit:** n/a

**2. [Rule 2 - Missing critical functionality] The activities secondary cell formats its ISO instant**

- **Found during:** Task 1
- **Issue:** the plan specifies the secondary column as "due date (`column.dueDate`) for
  activities" and says nothing about formatting. `TrashRow.secondary` is a **string on every
  tab**, and 37-07 serialises the activity due date to ISO-8601 there specifically so the row type
  stays uniform and no `Date` other than `deletedAt` crosses into a client component — with the
  formatting explicitly deferred "to the component layer" (`queries.ts:43-48`). Written literally,
  the plan renders `2026-08-16T00:00:00.000Z` in the cell.
- **Fix:** the cell branches on `tab === "activities"` and runs `format.dateTime(new
  Date(secondary), { year, month: "short", day })`. Every other tab renders the string as-is.
- **Files modified:** `src/app/trash/trash-columns.tsx`
- **Commit:** `7bd0dc5`

### Adapted, not auto-fixed

**3. One `startTransition`, not two**

Task 2 was first written with two `useTransition` calls (`startRestore`, `startPurge`). Task 3's
contract requires the source to contain the literal `startTransition`, and rather than rename one
starter asymmetrically to satisfy a grep, the two were collapsed into one — which is what the
`retention-form.tsx` analog does anyway. The two could never overlap: the purge dialog is modal,
so no row action is reachable while it is open, and the purge path never sets `pendingRowId`.
`isPurging` is now `isPending && purgeTarget !== null`. Committed separately as `5c5133e` so the
change is legible as a refactor rather than buried in a test commit.

**4. The keyboard-hook comment does not name the hook**

The plan asks for a comment on each of the four omissions from the `data-table.tsx` analog, and an
acceptance criterion greps the raw file for **zero** occurrences of `useDataTableKeyboard`. Those
two instructions are in direct tension — this is the sixth time in this phase an explanatory
comment containing a token has tripped a gate that reads raw file text. Per the phase convention
the **comment was reworded** ("the shared data-table keyboard hook … its open/edit/create
contract"), not the gate weakened. The reasoning survives in full; only the identifier is absent.

**5. The actions column uses a typed `meta` contract instead of `@ts-expect-error`**

`organizations/columns.tsx:102-105` reaches into `table.options.meta` behind two
`@ts-expect-error` comments. This file exports a `TrashTableMeta` interface and casts once, so a
renamed or dropped `renderActions` is a compile error rather than three silently absent buttons.
No global `TableMeta` module augmentation was added — that would be a repo-wide change made for
one route's convenience.

**6. The `workflow_run` link requires the workflow NAME as well as the two ids**

The plan says to link "when `workflowId` and `runId` are both non-null". `workflowName` is
independently nullable on the presentation, and an anchor with no text is not a better outcome
than the badge alone — it is an invisible link. All three must be present; otherwise the kind
label renders by itself, which is the degradation `audit-entry.tsx:289-303` already ships.

**7. The plan's automated verify points at the wrong project for the repo-wide RSC scan**

Tasks 1 and 2 name `npx vitest run --config vitest.rsc.config.ts` as the command that runs "the
repo-wide RSC boundary scan". It does not: `rsc-boundary.test.tsx` is **deliberately not** named
`*.rsc.test.tsx` (it needs `react-dom/server`, which cannot load under the `react-server`
condition) and runs in the **base** project. Both were run at every checkpoint — 8 rsc tests and
the 14-test boundary file — so the intended coverage happened; the command in the plan alone would
not have produced it. Worth correcting in whichever plan inherits this verify block.

---

**Total deviations:** 1 auto-fixed blocking, 1 auto-fixed missing functionality, 5 adaptations.
**Impact on plan:** none on scope. Nothing installed, no dependency added, no shadcn registry
fetch, no new icon symbol, no new message key.

## Issues Encountered

None that reached the implementation. One thing worth recording for the page shell: `TrashRow`
and `TrashTab` are imported into both client modules with `import type`, which is fully erased —
so `@/lib/trash/queries` (which pulls `@/db` and `pg`) never reaches the browser bundle. A later
edit that drops the `type` keyword on either import would pull a database driver into a client
component, and nothing in the type system would object.

## Known Stubs

None. Both components are complete and call the real server actions. Nothing renders
`<TrashTable>` yet — the `/trash` page shell is a later plan in this same wave, and the plan
states this file is built first specifically so the shell has a real component to render. That is
plan ordering, not a stub.

## Threat Coverage

| Threat | Disposition | Where it lands |
|--------|-------------|----------------|
| T-37-01 (EoP, purge) | mitigate | The control renders only under `isAdmin`; `purgeRecord`'s own admin gate (37-10) and the REST route (37-12) are the actual controls. A source assertion pins the conditional render, and a `NOT_ADMIN` result maps to `trash.error.purgeNotPermitted` — a reachable path, because the control is hidden rather than gated |
| T-37-REP2 (repudiation, deleted-by) | mitigate | Seven exhaustive branches behind a `const unhandled: never` guard; `notRecorded` and `unknownActor` render different strings from different namespaces and a source assertion proves both are present |
| T-37-09 (info disclosure, api_key) | mitigate | The kind label only, with no key name; a source assertion keeps any key-name identifier out of the file |
| T-37-23 (tampering, CFUI-01) | mitigate | The `AlertDialog` lives inside the `'use client'` module, controlled, with no trigger of its own; zero `AlertDialogTrigger` occurrences, gated. The repo-wide scan passes (14 tests) |
| T-37-33 (tampering, destructive affordance) | mitigate | Colour is never the sole carrier: `Delete permanently` is `text-destructive` **and** says so; `Restore` is neutral **and** says so. Every row action carries a visible text label |
| T-37-14 (repudiation, purge copy) | mitigate | `trash.purgeDialog.description` names what survives ("Its change history is kept") as well as what dies |
| T-37-34 (tampering, stale row) | mitigate | `NOT_IN_TRASH` → `trash.error.alreadyPurged` **plus** `router.refresh()`; both gated by source assertions |
| T-37-SC (package installs) | accept | Nothing installed. Zero `shadcn add`. Every icon used (`Trash2`, `RotateCcw`, `Loader2`, `Workflow`, `Key`, `Download`, `Cog`) was already in `lucide-react` |

## Threat Flags

None. No new network endpoint, no file access, no schema change, and no new trust boundary — both
files are renderers over data and actions that already exist.

## Notes for Later Plans

- **`<TrashTable>` takes plain serializable props only** — `tab`, `rows`, `hasMore`, `page`,
  `isAdmin`, `retentionDays`. The page shell must pass `retentionDays: null` when
  `trash.retention_days` is unset or unparseable; that is what selects `trash.empty.bodyNoRetention`
  and stops the empty state promising a window the pruner is not enforcing.
- **The shell must not wrap `<TrashTable>` in anything that forwards children into an `asChild`
  slot from a server module.** The repo-wide scan will fail the build if it does.
- **`useTrashColumns` is a hook**, so the actions column is only usable from a client module. The
  shell renders `<TrashTable>`; it does not build columns itself.
- **`import type` on `TrashRow` / `TrashTab` is load-bearing** in any client module — see Issues
  Encountered.
- **The `Open` toast action navigates to `/{tab}/{id}`**, which is a real detail route for all
  four entity types. If a fifth tab is ever added, check that route exists before extending
  `TRASH_TABS`.
- **`empty.{tab}` is looked up with a template literal**, so a renamed tab value silently produces
  a missing-message error rather than a compile error. `TRASH_TABS` and the six `trash.empty.*`
  keys move together.

## Self-Check: PASSED

Files:
- FOUND: `src/app/trash/trash-columns.tsx`
- FOUND: `src/app/trash/trash-table.tsx`
- FOUND: `src/app/trash/__tests__/trash-client-wiring.test.ts`

Commits:
- FOUND: `7bd0dc5` feat(37-13): add the trash column definitions and the deleted-by cell
- FOUND: `60e6607` feat(37-13): add the trash table with row actions and the purge dialog
- FOUND: `5c5133e` refactor(37-13): use one named transition for all three trash writes
- FOUND: `e6e735e` test(37-13): gate the trash client wiring with comment-stripped source reads

Working tree clean; no tracked file was deleted by any of the four commits.

---
*Phase: 37-trash-restore*
*Completed: 2026-08-16*
