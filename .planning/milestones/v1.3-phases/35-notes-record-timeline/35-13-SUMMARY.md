---
phase: 35-notes-record-timeline
plan: 13
subsystem: ui-components
tags: [react, rsc, client-components, next-intl, keyset-pagination, optimistic-ui, accessibility, cfui-01, notes, timeline]

# Dependency graph
requires: ["35-05", "35-08", "35-09", "35-11", "35-12"]
provides:
  - "`TimelineList({ entityType, entityId, initialEntries, initialCursor, hasMore, currentUserId, isAdmin })` — client entry state, in-place note mutations, four-state Load more"
  - "`RecordTimeline({ entityType, entityId })` — async server Card shell that fetches page one during the detail page's own render"
  - "The first appending, non-navigating paginated feed in this repo"
affects: [35-14, 35-15, 36]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Append-on-click keyset pagination in client state: `entries` / `cursor` / `more` / `loading` as four separate pieces of state, with the failure branch mutating only `loading` so a retry refetches the page that failed rather than skipping it"
    - "The dedupe key and the React `key` are deliberately the same expression, so 'we filtered a duplicate' and 'React saw a unique key' cannot drift apart"
    - "Server-seeded client state that is never re-seeded from later props: a `revalidatePath` re-render must not drop appended pages or double an optimistic prepend"
    - "Purely decorative rail connector positioned off the row geometry (`top-8` = icon height, `-bottom-4` = the `space-y-4` gap), omitted on the last item, `aria-hidden`"

key-files:
  created:
    - src/components/timeline/timeline-list.tsx
    - src/components/timeline/record-timeline.tsx
  modified: []

key-decisions:
  - "The Load more button is rendered on `more && cursor !== null` rather than on `more` alone: a null cursor means there is no next page, so gating on both makes the 'dead button that silently does nothing' state unreachable by construction instead of by a runtime guard"
  - "Entries dedupe and key on `entry.id` alone, not on a `kind:id` composite like the assembler's hydration map, because the React key is what a duplicate actually breaks and keying both on the same value is the tighter invariant"
  - "The words `router.push` and the React optimistic hook's name were kept out of `timeline-list.tsx` ENTIRELY, including out of the prose explaining why neither is used, because the plan gates their absence with a raw `grep -c`"
  - "`RecordTimeline` returns `null` on a null session rather than asserting non-null: an assertion that turned out to be wrong would throw inside the RSC render and take the whole record page down over one optional section"
  - "State is seeded from props exactly once and never re-synced, which is what makes the post-`revalidatePath` server re-render harmless"

patterns-established:
  - "Every failure path in this phase now handles a `success: false` result and a thrown action identically, in `timeline-list.tsx` as in the three 35-11 components"
  - "The `<ol>`/`<li>` structure the Accessibility Contract requires lives in the list, and the three entry renderers stay plain `<div>`s"

requirements-completed: [NOTE-01, NOTE-02]

# Metrics
duration: 24min
completed: 2026-08-15
---

# Phase 35 Plan 13: Timeline List and Server Card Shell Summary

**The record timeline is now a single drop-in server component that arrives with page one already painted, wrapped around the first appending — rather than navigating — paginated feed in this codebase, whose Load more implements all four states including the failure path the existing "Load More" analog does not have at all.**

## Performance

- **Duration:** ~24 min
- **Tasks:** 2
- **Files created:** 2
- **Tests:** no new tests; the suite stays at 1016 passed / 4 skipped plus 8 RSC, and the CFUI-01 gate passes 14/14 after each task

## Accomplishments

### Task 1 — `timeline-list.tsx` (`4fd14b1`)

The client component that owns everything below the card header.

**The Load-more state machine.** `src/app/activities/activities-client.tsx` was read as instructed and deliberately not copied. Its "Load More" pushes a `?page=N+1` query onto the router and lets the RSC re-render a longer list — which cannot work here, because this is one section of a detail page (a navigation would discard the composer draft and any in-progress inline edit) and because the assembler pages by keyset, not by page number. It also has no in-flight state, no failure path and a hardcoded English label. All four states are implemented here:

| State | Rendering |
|-------|-----------|
| idle | button enabled, `notes.loadMore` |
| in flight | the SAME button, `disabled`, `Loader2 animate-spin` + `notes.loadingMore` |
| failed | button back to idle, `toast.error(notes.error.loadMoreFailed)` |
| exhausted | button not rendered — no terminal text |

The failure branch is the one that matters (T-35-33): a silent no-op tells the user the record has no more history, which is a lie about an audit surface. It touches `loading` and nothing else — `entries`, `cursor` and `more` are all left alone — so pressing the button again retries **the page that failed** rather than skipping it. A `success: false` result and a thrown action route to the identical handler.

**Exhaustion is structural.** The button renders on `more && cursor !== null`, not on `more` alone. `nextCursor` is null exactly when `hasMore` is false (35-08), so a null cursor cannot coexist with a renderable button, and the "enabled button whose handler early-returns" state — the very thing the spec forbids — is unreachable rather than merely guarded.

**Deduplication.** Appends filter incoming entries whose id is already in state. Keyset paging makes this structurally unlikely, but an optimistically prepended note interleaved with an in-flight page fetch is real, and a repeated React key is a visible bug. The dedupe key and the `key=` prop are the same expression on purpose.

**Mutations in place.** `onAdded` prepends (with the same id filter), `onDeleted` filters by id, and `onUpdated` replaces by id — the last of which is load-bearing rather than optional: `NoteEntry` clears its optimistic override the instant it calls `onUpdated` (35-11), so ignoring the callback would make a *successful* edit visibly snap back to the pre-edit text.

**Structure.** `NoteComposer` is pinned at the top and rendered **always**, including over an empty list, because both `EmptyTimeline` bodies end with "Write the first note above". Then a `mt-4 border-t pt-4` separator, then either the empty state (`full` for a deal, `notesOnly` for the other three, matching `appliesTo` in `sources.ts`) or an `<ol className="space-y-4">` with one `<li>` per entry, newest first — the ordered-list structure the Accessibility Contract requires, which the three renderers deliberately do not provide. `canManage` is `entry.kind === "note" && (isAdmin || entry.author?.id === currentUserId)`, and TypeScript narrows the entry to `NoteTimelineEntry` inside that conjunction for free.

**The connector** is a `w-px bg-border` absolute element positioned off the row geometry rather than off invented numbers: `top-8` is the bottom of the 32px rail icon, `-bottom-4` reaches through the 16px `space-y-4` gap to the top of the next icon. It is omitted after the last loaded entry so the rail never dangles into empty space, and it carries `aria-hidden="true"`.

### Task 2 — `record-timeline.tsx` (`d2104bd`)

An async **server** component taking only `entityType` and `entityId` — the whole card, ready to drop onto four detail pages in 35-14.

`getTranslations` and `auth()` resolve concurrently, then `assembleTimeline` and `countTimeline` do. Page one therefore arrives with the RSC detail page: no skeleton, no spinner, no client fetch on first paint. A null session returns `null` rather than rendering a broken card or throwing.

The card is `mt-6` (matching the gap `CustomFieldsSection` already uses), the `CardTitle` carries `text-base font-semibold leading-tight` with `CardTitle`'s built-in `leading-none` overridden at the call site per the UI-SPEC typography table, and the count renders as `({total})` in `text-muted-foreground text-sm` — the same treatment `CustomFieldsSection` uses for its own field count.

`CardContent` renders exactly one child, `TimelineList`, and the module imports exactly one thing from `src/components/timeline/`. Every prop crossing the Flight boundary is a plain serializable value; the file contains zero arrow functions and passes zero JSX elements as props, which was grep-verified rather than eyeballed. That is what keeps T-35-30 shut: the CFUI-01 failure mode is a control that renders nothing with no error anywhere, so the gate is the only detector and this module stays trivially on the right side of it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `node_modules` absent from the worktree**

- **Found during:** Task 1 setup
- **Issue:** The worktree ships without `node_modules`, so `npm run typecheck`, `npx vitest` and `npm run lint` — every verification gate in this plan — could not run. Same blocker 35-12 hit.
- **Fix:** Symlinked `node_modules` to the main checkout's. No package was installed, added or resolved; the symlink is gitignored and untracked.
- **Files modified:** none (untracked symlink)

**2. [Rule 1 - Bug] The module comment tripped this plan's own grep gates**

- **Found during:** Task 1
- **Issue:** The header explaining *why* the file neither navigates nor uses React's optimistic hook named both — and the plan's verification is `grep -c "router.push"` and `grep -c "useOptimistic"`, each asserted `-eq 0`. The file would have failed its own gates while being exactly as correct as the gates were written to enforce. This is the third occurrence of the "prose trips a raw grep" failure in this phase (35-11's `dangerouslySetInnerHTML`, 35-12's NUL bytes).
- **Fix:** Reworded to "it pushes a `?page=N+1` query onto the Next.js router" and "WHY PLAIN STATE RATHER THAN REACT'S OPTIMISTIC HOOK", with an explicit note in the file that the hook's name is kept out because its absence is grep-gated. The warnings survive; the tokens do not.
- **Files modified:** `src/components/timeline/timeline-list.tsx`
- **Commit:** `4fd14b1`

### Intentional Interpretations

- **Dedupe and React key are `entry.id`, not a `kind:id` composite.** The assembler keys its hydration map by `kind:id` and calls a collision impossible; here the thing a duplicate actually breaks is the React key, so keying and deduping on the same single value is the tighter invariant. Two UUIDs colliding across different tables is not a real risk, and if it were, the composite would hide it rather than fix it.
- **The Load more button is gated on `more && cursor !== null`.** The plan says "rendered only when `more` is true". Gating on both is strictly stronger and makes the forbidden dead-button state unreachable by construction.
- **The load handler is a plain `async` function with a `loading` boolean, not `useTransition`.** The plan permits either. A `finally` that always clears one explicit flag is easier to prove correct than reasoning about `isPending` across a transition, and it removes any question of two sources of truth for "in flight".

### Deferred Items

- **`countTimeline` is called even though `assembleTimeline` already returns `total`.** The plan's action and acceptance criteria both require the explicit call, and it keeps the header independent of the assembler's page shape, but the two resolve to the same number — the badge could be read off `page.total` and one index-only `count(*)` per applicable source dropped. Measured at 0.480 ms in 35-08 and issued concurrently with the page read, so the cost is negligible; noted here so a later plan can collapse it deliberately rather than discover it as a surprise.

### Notes for Downstream Plans

- **35-14 mounts `RecordTimeline` with two props and nothing else.** It needs no session, no field definitions and no prefetch at the call site — the component resolves its own session and its own page one. The insertion point on each detail page is directly after `CustomFieldsSection`.
- **`TimelineList` state is seeded once and never re-synced from props.** That is deliberate, and it is why the `revalidatePath` in the note actions does not drop appended pages or double an optimistic prepend. Do not "fix" it with a `useEffect` that re-seeds from `initialEntries`.
- **The empty state does not replace the card content.** `NoteComposer` stays mounted above it; swapping the whole content for `EmptyTimeline` would make its "Write the first note above" copy false.

## Known Stubs

None. Both components are fully wired: `RecordTimeline` reads real data through the 35-08 assembler, and `TimelineList` calls the real 35-09 server action.

## Threat Flags

None. No new network endpoint, auth path, file access pattern or schema change was introduced. `record-timeline.tsx` reads the existing session and the existing assembler; `timeline-list.tsx` calls an existing, already-authorized server action.

## Threat Model Coverage

| Threat ID | Disposition | How it is met here |
|-----------|-------------|--------------------|
| T-35-30 | mitigate | `record-timeline.tsx` imports exactly one component from `src/components/timeline/` and passes zero functions and zero JSX elements as props; the class-wide `asChild` gate was re-run after each task, 14/14 both times |
| T-35-02 | mitigate | The cursor is opaque here — stored, sent back verbatim, never decoded or inspected. `assembleTimeline` zod-validates it and degrades a hostile value to page one |
| T-35-33 | mitigate | The failure branch toasts `notes.error.loadMoreFailed`, returns the button to idle, and leaves `cursor` and `more` untouched so the retry refetches the failed page |
| T-35-34 | mitigate | `canManage` is computed from the server-supplied `currentUserId` / `isAdmin` and is cosmetic only; `editNote` / `deleteNote` and the v1 routes re-check with `isAuthorOrAdmin` |
| T-35-SC | accept | Zero packages installed |

## Verification

| Gate | Result |
|------|--------|
| `npm run typecheck` | clean after each task |
| `npx eslint <each new file>` | no issues found, on both |
| `npm run lint` (repo) | 0 errors, 128 warnings — the same 128 pre-existing warnings 35-11 and 35-12 recorded, none in the new files |
| CFUI-01 `rsc-boundary.test.tsx` | 14 passed / 0 failed, after each task |
| `npm test` (both vitest projects) | 1016 passed / 4 skipped, plus 8 RSC — no regressions |
| `LOAD_MORE_STATES_PRESENT` (`use client` first line + `loadMoreTimeline` + `loadMoreFailed` + `loadingMore`) | true |
| `NO_NAVIGATION_NO_NEW_IDIOM` (`router.push` = 0, optimistic hook = 0) | true |
| `CONNECTOR_HIDDEN` (`aria-hidden` present) | true |
| `<ol>` / `<li>` present in the list | 1 each (2 grep hits, open + close) |
| `SERVER_SHELL_OK` (no `use client` in the first 3 lines + `assembleTimeline` + `TimelineList`) | true; `use client` is in fact absent from the whole file |
| `SERVER_I18N_OK` (`getTranslations` ≥ 1, `useTranslations` = 0) | true |
| Arrow functions / JSX passed as props in the server shell | 0 and 0 |
| Imports from `src/components/timeline/` in the server shell | exactly 1 (`timeline-list`) |
| Raw NUL / control bytes in either file | 0 — both files are plain text, so every grep gate above is a real count |

## UI-SPEC States Covered

| State | Where |
|-------|-------|
| Empty (deal) | `variant="full"` selected by `entityType === "deal"` |
| Empty (org / person / activity) | `variant="notesOnly"` |
| Populated | `<ol>` of ≤20 entries, newest first |
| Has more | Load more rendered, `variant="outline" size="sm"` full width |
| Loading more | same button disabled, `Loader2 animate-spin` + `notes.loadingMore` |
| Load more failed | idle button + `toast.error(loadMoreFailed)`, cursor unchanged |
| Exhausted | button absent, no terminal text |
| Not permitted | `canManage` false → 35-11 renders no Edit/Delete |
| First paint | server-rendered, no skeleton and no spinner |

Dark mode and the long-content / browser checks belong to 35-15.

## Self-Check: PASSED

- `src/components/timeline/timeline-list.tsx` — FOUND
- `src/components/timeline/record-timeline.tsx` — FOUND
- Commit `4fd14b1` — FOUND
- Commit `d2104bd` — FOUND
