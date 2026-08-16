---
phase: 36-audit-log
plan: 19
subsystem: ui
tags: [react, nextjs, rsc, radix, next-intl, timeline, audit, url-state, accessibility]

# Dependency graph
requires:
  - phase: 36-04
    provides: the `audit.filter.*` message keys (label, announceShown, announceHidden, emptyHidden.heading/body) in all three locales
  - phase: 36-13
    provides: the audit timeline entry renderer the toggle reveals
  - phase: 36-17
    provides: "`includeAudit` on assembleTimeline / buildTimelineQuery / countTimeline, and countTimeline's `{ total, auditTotal }` single-pass return"
provides:
  - the audit filter toggle (Switch + visible Label) in the timeline CardHeader's CardAction slot
  - "`?changes=1` URL-scoped audit visibility, OFF by default, shareable and back/forward-safe"
  - a flag-scoped `Timeline (N)` header count that always matches what the list can show
  - the third EmptyTimeline variant (`hiddenHistory`) naming the hidden count and the control
  - "`loadMoreTimeline`'s fourth `includeAudit` parameter so page 2 comes from page 1's source set"
  - "`readAuditScope`, the single exported derivation of the flag shared by all four detail pages"
affects: [audit-timeline-consumers, record-detail-pages, future-timeline-filters]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Filter scope in the URL, not in React: one server render computes count, entries, cursor and control state from one flag"
    - "Scope-keyed remount (`key={includeAudit ? ...}`) as the cursor-trap mitigation, leaving the general no-re-seed rule intact"
    - "A client control owning its own aria-live region rather than borrowing a sibling's"

key-files:
  created:
    - src/components/timeline/audit-filter-toggle.tsx
  modified:
    - src/components/timeline/empty-timeline.tsx
    - src/components/timeline/record-timeline.tsx
    - src/components/timeline/timeline-list.tsx
    - src/app/notes/actions.ts
    - src/app/notes/actions.test.ts
    - src/app/deals/[id]/page.tsx
    - src/app/people/[id]/page.tsx
    - src/app/organizations/[id]/page.tsx
    - src/app/activities/[id]/page.tsx

key-decisions:
  - "The toggle owns its own aria-live region instead of the UI-SPEC's 'extend the existing one' — the existing region lives inside the subtree the toggle remounts, so a message routed there would be destroyed by the navigation that caused it"
  - "The scope reset is `key={includeAudit ? 'audit' : 'default'}` on <TimelineList> in record-timeline.tsx, not a scope-keyed useState reset inside timeline-list.tsx — a remount is exactly the wanted semantics and leaves the no-re-seed rule for note mutations untouched"
  - "`readAuditScope` is exported from record-timeline.tsx rather than from a new lib module, keeping the change inside the plan's declared file set while still giving the four pages one shared derivation"
  - "EmptyTimeline's props became a discriminated union so `hiddenCount` is required by the `hiddenHistory` variant and forbidden on the other two — the count cannot be forgotten"
  - "`loadMoreTimeline`'s new parameter defaults to false, matching assemble.ts's default-off posture at every level"

patterns-established:
  - "URL-param view scope: derive once server-side, pass as a boolean, never duplicate in client state"
  - "Cursor scope safety: a keyset cursor is scope-specific and is discarded by remount on a scope change, never replayed across scopes"

requirements-completed: [AUDIT-03]

# Metrics
duration: 34min
completed: 2026-08-16
---

# Phase 36 Plan 19: The Audit Filter Toggle Summary

**Audit entries are hidden by default and revealed by a `?changes=1` URL-scoped Radix Switch in the timeline card header, with the header count, the list, the cursor, the Load-more scope and the empty state all computed by one server render from that one flag.**

## Performance

- **Duration:** ~34 min
- **Started:** 2026-08-16T00:25Z
- **Completed:** 2026-08-16T00:59Z
- **Tasks:** 3 (committed as 3 commits, split differently from the task boundaries — see Deviations)
- **Files modified:** 10 (1 created, 9 modified)

## Accomplishments

- **The toggle ships.** `AuditFilterToggle` renders a visible `<Label htmlFor>` plus a `role="switch"` Radix control in `CardHeader`'s previously-empty `CardAction` slot — no new layout CSS, no new dependency, no new token.
- **One flag, one render, four consumers.** `RecordTimeline` derives nothing itself: it takes `includeAudit` and hands it to `assembleTimeline`, to `countTimeline`, to the toggle and to `TimelineList`. `Timeline (N)` is flag-scoped, so the header number can never disagree with the list beneath it.
- **The cursor trap is closed.** `loadMoreTimeline` gained a fourth `includeAudit` parameter and `TimelineList` sends it with every request, so page 2 is drawn from page 1's source set. Toggling remounts the list, discarding pages minted under the other scope.
- **The empty state cannot lie.** A record whose only history is audit entries now renders the new `hiddenHistory` variant, which names the count and names the control. Phase 35's "nothing has happened yet" copy is never shown over hidden history.
- **`record-timeline.tsx` is still a server component.** The CFUI-01 class-wide gate is green; only booleans and numbers cross into the client module.

## Task Commits

1. **Task 1: the toggle component and the third empty-state variant** — `3a64b9c` (feat)
2. **Task 3a: `loadMoreTimeline` carries the audit scope** — `67c00a4` (feat)
3. **Tasks 2 + 3b: thread the flag through the render, the list and the four pages** — `41b889b` (feat)

## Files Created/Modified

- `src/components/timeline/audit-filter-toggle.tsx` — **created.** The `'use client'` toggle: visible Label + `({auditTotal})`, `size="sm"` Switch with `aria-controls="record-timeline-list"`, `router.replace` writing `?changes=1` while preserving every other param, and its own `aria-live="polite" sr-only` region.
- `src/components/timeline/empty-timeline.tsx` — third variant `hiddenHistory` with a required `hiddenCount`, as a discriminated union. `full` and `notesOnly` untouched and still reachable.
- `src/components/timeline/record-timeline.tsx` — `includeAudit` prop; passes it to the assembler and the counter; renders the toggle in `CardAction`; keys `<TimelineList>` on the scope; exports `readAuditScope`.
- `src/components/timeline/timeline-list.tsx` — `includeAudit` / `auditTotal` props, the flag on every `loadMoreTimeline` call, `id="record-timeline-list"` on the `<ol>`, and the three-way empty-state selection.
- `src/app/notes/actions.ts` — `loadMoreTimeline(entityType, entityId, cursor, includeAudit = false)`, forwarded to `assembleTimeline`. The cursor's opacity contract is unchanged.
- `src/app/notes/actions.test.ts` — the existing assertion now expects `includeAudit: false`; a new test asserts the `true` forwarding (T-36-37).
- `src/app/{deals,people,organizations,activities}/[id]/page.tsx` — `searchParams` added to `PageProps` (awaited, per Next 16) and `includeAudit={readAuditScope(search)}` passed down.

## Decisions Made

See `key-decisions` in the frontmatter. The two that a later reader is most likely to question:

**Why the toggle owns its own live region.** The UI-SPEC's § Accessibility Contract says the existing live region gains two messages. That region lives in `note-composer.tsx`, is bound to note-add state, and — decisively — sits *inside* the `TimelineList` subtree that a scope change remounts. A message put there would be destroyed by the very navigation that caused it. Owning the region in the toggle keeps the announcement adjacent to the control and outside the remounted subtree, so it survives. Recorded as a declared deviation below.

**Why `key=` rather than a scope-keyed `useState` reset.** `timeline-list.tsx` deliberately does not re-seed from later props, so a `revalidatePath` after a note mutation cannot drop appended pages. That rule must stay on. A `key` on the component resets *only* on a scope change and leaves the rule intact, whereas a `useEffect`-style re-seed inside the component would have had to distinguish "new scope" from "same scope, revalidated props" at runtime. The plan named `key=` as the smallest correct change and it is.

## Deviations from Plan

### 1. [Declared in the plan — UI-SPEC deviation] The toggle owns its own `aria-live` region

- **Found during:** Task 1
- **Issue:** 36-UI-SPEC § Accessibility Contract routes the shown/hidden announcement through the existing live region in `note-composer.tsx`.
- **Fix:** `AuditFilterToggle` renders its own `<p aria-live="polite" className="sr-only">`. Reasoning above and in the file's module header.
- **Committed in:** `3a64b9c`
- **Note:** The plan itself instructed this deviation and asked for it to be recorded here. It is not an unplanned change.

### 2. [Rule 3 — Blocking] Commit boundaries redrawn: Task 3 split, Task 2 merged with its second half

- **Found during:** planning the commit sequence for Tasks 2 and 3
- **Issue:** Both tasks carry a `npm run typecheck` gate that is unsatisfiable at their own boundaries as written. Task 2 makes `record-timeline.tsx` pass `includeAudit` / `auditTotal` / `key` to `<TimelineList>`, but the props that accept them are Task 3's work; Task 3 makes those props required, but the only call site is Task 2's work. Neither task compiles alone in either order.
- **Fix:** Three commits instead of three task-shaped commits: Task 1 unchanged (`3a64b9c`); Task 3's `actions.ts` half alone, which does compile and does pass tests (`67c00a4`); then Task 2 plus Task 3's `timeline-list.tsx` half together (`41b889b`). Every commit typechecks, lints and passes the full suite.
- **Files modified:** no extra files — only the grouping changed.
- **Verification:** `npm run typecheck`, `npm test`, `npm run lint` run at each of the three boundaries.

### 3. [Rule 1 — Test contract] `actions.test.ts` updated for the new assembler argument

- **Found during:** Task 3a
- **Issue:** `loadMoreTimeline` now passes `includeAudit` to `assembleTimeline`, which falsified the existing `toHaveBeenCalledWith({ entityType, entityId, cursor })` assertion.
- **Fix:** Assertion now expects `includeAudit: false` (proving the default-off path), plus a new test asserting the `true` forwarding — which is the T-36-37 control expressed as a test rather than only as a comment.
- **Committed in:** `67c00a4`

---

**Total deviations:** 3 (1 plan-declared, 1 blocking, 1 test-contract). No scope creep; no file touched outside the plan's declared set except `src/app/notes/actions.test.ts`, which the change to `actions.ts` required.

## Acceptance Criteria — reported honestly

Every gate passes, with two grep counts reported with their breakdown because the raw count includes documentation lines (the known plan-defect class in this phase). Nothing was contorted to satisfy a grep.

| Gate | Expected | Actual | Note |
|------|----------|--------|------|
| `grep -c '"use client"' audit-filter-toggle.tsx` | 1 | **1** | |
| `grep -c "router.push" audit-filter-toggle.tsx` | 0 | **0** | |
| `grep -c "router.replace" audit-filter-toggle.tsx` | 1 | **1** | |
| `grep -c "htmlFor=" audit-filter-toggle.tsx` | 1 | **1** | The label is visible, not `sr-only` |
| `grep -c 'aria-live="polite"' audit-filter-toggle.tsx` | 1 | **1** | |
| `grep -c "hiddenHistory" empty-timeline.tsx` | ≥2 | **4** | |
| `grep -c '"full"\|"notesOnly"' empty-timeline.tsx` | both present | **3 lines** | Both original variants intact |
| `grep -c "includeAudit" record-timeline.tsx` | ≥4 | **8** | |
| `grep -c "auditTotal" record-timeline.tsx` | ≥2 | **3** | |
| `grep -c "AuditFilterToggle" record-timeline.tsx` | 2 | **3** | ⚠️ See below |
| `grep -c '"use client"' record-timeline.tsx` | 0 | **0** | Still a server component |
| `grep -c "includeAudit"` in each of the 4 pages | 1 each | **1, 1, 1, 1** | |
| `grep -c "searchParams"` in each of the 4 pages | ≥1 | **3 each** | |
| `grep -c "includeAudit" notes/actions.ts` | ≥2 | **3** | |
| `grep -c "includeAudit" timeline-list.tsx` | ≥2 | **5** | |
| `grep -c "hiddenHistory" timeline-list.tsx` | 1 | **1** | `hasHiddenHistory` does not match — different case |
| `grep -c 'id="record-timeline-list"' timeline-list.tsx` | 1 | **1** | |
| `grep -c "decodeCursor" notes/actions.ts` | 0 | **1** | ⚠️ See below |
| `grep -c "TIMELINE_PAGE_SIZE" timeline-list.tsx` | unchanged | **0 → 0** | |

⚠️ **`AuditFilterToggle` counts 3, not 2.** The three lines are: the `import`, the single JSX call site, and the module-header line — which the plan's own action text instructed me to write ("Add it to the module header's list of what this file may render"). The two gates are mutually unsatisfiable as written. Call sites: `grep -c "AuditFilterToggle "` in JSX = **1**; import = **1**. I kept the documentation the plan asked for rather than deleting it to make a number.

⚠️ **`decodeCursor` counts 1, not 0.** The one match is a pre-existing Phase 35 documentation line (`actions.ts:229`, "`decodeCursor` degrades a hostile value to page 1 rather than to a 500 (T-35-02)"), untouched by this plan. The gate's intent — no decode call site — holds: `grep -c "decodeCursor("` = **0**. I did not delete an accurate Phase 35 comment to satisfy a grep.

## Verification

- `npm run typecheck` — clean (run at all three commit boundaries)
- `npm test` — **1311 passed, 4 skipped, 75 files**, plus the 8 RSC-project tests. No pre-existing failure, no new one.
- `npm run lint` — 0 errors, 125 warnings; the warning count is **identical to the pre-change baseline** (all pre-existing, all in unrelated import/export modules)
- `npx vitest run "src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx"` — 14 passed. The CFUI-01 class-wide gate is green.
- `assemble.test.ts`'s `includeAudit: false` block still passes, proving the default path is unchanged.

## Issues Encountered

- **The `AuditFilterToggle` and `decodeCursor` grep gates are unsatisfiable as written.** Both are the known phase-wide defect: `grep -c` counts lines, and documentation lines match the same string as code. Resolved by reporting both the raw count and the call-site count rather than editing prose to fit. Neither indicates a code problem.
- **Neither Task 2 nor Task 3 compiles alone.** Resolved by redrawing the commit boundaries (deviation 2). No code was stubbed and no task was silently reordered.
- **`useSearchParams` needs a dynamic page.** All four detail pages already call `auth()` (cookies), so they are dynamic and no Suspense boundary is required. Verified against the established `status-filter.tsx` / `deal-filters.tsx` pattern, which does the same thing.

## Known Stubs

None. Every prop added is wired to real data on the same render: the flag comes from the URL, both counts come from `countTimeline`'s single pass, and the toggle's state is the same boolean the assembler used.

## Threat Flags

None. This plan introduces no new network endpoint, no new auth path, no file access and no schema change. The one new trust boundary — the `?changes=` search param — is in the plan's threat register (T-36-41) and is mitigated: `readAuditScope` compares to the literal `"1"` and yields a boolean, so an array (Next's shape for a repeated param) or any other value is `false`, and nothing from the URL is ever composed into SQL — the flag selects from a closed set of registered sources.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- AUDIT-03 is complete: audit entries are OFF by default, on via `?changes=1`, and the choice survives reload and back/forward.
- `readAuditScope` is exported and is the single derivation point should a fifth surface ever need the same scope.
- No blockers. The one thing a later phase should not do is add a second place where the audit scope is derived or stored — the whole correctness argument here rests on there being exactly one.

---
*Phase: 36-audit-log*
*Completed: 2026-08-16*
