---
phase: 40-saved-views-shared-filters
plan: 13
subsystem: ui
tags: [saved-views, activities, drizzle, sql-predicates, view-escape, source-gate, vitest, tabs, defaultValue-remount]

# Dependency graph
requires:
  - phase: 40-01
    provides: "withViewEscape and pickFilterParams — the one definition of what a navigation that clears a filter must carry"
  - phase: 40-05
    provides: "resolveSavedViewsBarProps and resolveDefaultViewRedirect, plus validateStoredFilters bounding the date strings before they reach a gte()"
  - phase: 40-07
    provides: "fetchActivities' status/date predicates in src/lib/export/formatters.ts — the shape this plan mirrors so the list and the export agree"
  - phase: 40-10
    provides: "SavedViewsBar itself, the component mounted here"
  - phase: 40-18
    provides: "the ?view=<id> carrier, which is why no call site in these two files needed a selectedViewId prop"
provides:
  - "/activities is the third of four surfaces with the bar mounted, in the list tab only"
  - "getActivities honours status, dateFrom and dateTo as SQL predicates — closing the hole formatters.ts annotated as 'Plan 40-13 closes the list side'"
  - "Five withViewEscape call sites on this surface, one of them absent from UI-SPEC's escape-param table"
  - "The seventh escape call site repo-wide, so plan 40-14's gate is written against a count of 7 rather than the spec's 6"
affects: [40-14, 40-15, activities]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A `status` string collapsing an older boolean spelling: `filters.completed` maps onto the same three-way predicate rather than living beside it as a second control"
    - "Extract a top-level function body by slicing to the next `\\nexport ` and then ASSERT the boundary held, instead of writing a fourth brace matcher"
    - "An allow-list over comma-split import specifiers, never `source.includes(\"lt\")` — `lt` is a substring of `result`, `filteredResults` and `default`"
    - "Escape a navigation that cannot currently produce a bare URL anyway, so the file has one rule instead of two and the repo-wide gate needs no exemption"

key-files:
  created:
    - src/app/activities/__tests__/get-activities-filters.test.ts
  modified:
    - src/app/activities/actions.ts
    - src/app/activities/page.tsx
    - src/app/activities/activities-client.tsx
    - src/app/activities/activity-filters.tsx

key-decisions:
  - "The db.test.ts harness was NOT run: `npm run test:db` shells scripts/dedup-db-test-setup.sh, which DROPS and recreates a database, and this plan executed in a three-agent parallel wave sharing one Postgres. Read-only psql counts were recorded instead and the parsed gate was not weakened to compensate."
  - "page.tsx's three post-fetch JavaScript narrowing passes were DELETED, not merely supplemented — leaving them would have double-filtered harmlessly but kept hasMore describing a different result set than the rows below it."
  - "The date predicates mirror fetchActivities EXACTLY (`new Date(filters.dateTo)`, UTC midnight) rather than reproducing the deleted JS filter's local end-of-day. Consistency with the already-merged export layer was the mandate; every due_date in this deployment is midnight, so the two agree on live data."
  - "`completed?: boolean` kept in the getActivities signature and mapped to the same predicate, even though its only caller now passes `status`."
  - "activity-filters.tsx was DECLINED as the bar's host despite 40-CONTEXT nominating it, on the two measurements recorded in amendment A3 — and the refusal is written into the file so the next reader does not re-litigate it."

patterns-established:
  - "Record the before-state as a measurement, not an inference: the psql page-1 simulation showed 0 of 4,151 overdue rows rendering, which is a far stronger claim than 'the predicate is missing'"
  - "When a spec's enumerated call-site table is an undercount, name the discrepancy in a code comment at the omitted site rather than silently fixing it"

requirements-completed: [VIEW-01, VIEW-02, VIEW-03]

# Metrics
duration: 34min
completed: 2026-08-21
---

# Phase 40 Plan 13: Mount the Bar on /activities Summary

`/activities` now has the saved-views bar in its list tab, five escaped navigations, a search input
that resyncs — and, for the first time, a `status` filter and a due-date range that actually reach
the `WHERE` clause. On live data the last of those changed `?status=overdue` from **0 rows rendered**
to a full page of 50 with `hasMore`, against 4,151 that match.

## What Was Built

### 1. `status`, `dateFrom` and `dateTo` become SQL predicates

`getActivities` in `src/app/activities/actions.ts` gained three filter keys, each mirroring
`fetchActivities` in `src/lib/export/formatters.ts` line for line:

| Filter | Predicate |
|--------|-----------|
| `status: "completed"` | `isNotNull(activities.completedAt)` |
| `status: "pending"` | `isNull(activities.completedAt)` |
| `status: "overdue"` | `and(isNull(activities.completedAt), lt(activities.dueDate, new Date()))` |
| `status: <anything else>` | no predicate — an unknown value must not silently mean "completed" |
| `dateFrom` | `gte(activities.dueDate, new Date(filters.dateFrom))` |
| `dateTo` | `lte(activities.dueDate, new Date(filters.dateTo))` |

Two things were deleted rather than added to:

- `if (filters?.completed === true) conditions.push(isNull(activities.deletedAt))` — a no-op
  duplicate of the condition the array already opens with, carrying a comment that admitted it
  needed "a different approach".
- the post-fetch `filteredResults` block, which ran a JavaScript completion filter **after** the
  `limit` had already been applied by Postgres.

`page.tsx` lost three more post-fetch passes for the same reason (a date range and a pending/overdue
status, applied to the already-`slice`d page, **after** `hasMore` had been computed).

### 2. The default-view redirect and the bar props

`page.tsx` now runs `resolveDefaultViewRedirect("activity", session.user)` when
`Object.keys(params).length === 0`, after the `auth()` gate and before the `Promise.all`, outside any
try/catch. `resolveSavedViewsBarProps` rides in the existing `Promise.all` as a seventh read and is
handed to `<ActivitiesClient>` as one `viewsBar` prop rather than eight.

Untouched exactly as the plan required: both `users` queries and the comment explaining why they are
separate, `retentionDays`'s un-defaulted pass-through, and `activeFilters`.

### 3. The mount, the escapes, and the input

`<SavedViewsBar {...viewsBar} />` sits **inside `<TabsContent value="list">`**, as the first child of
its `space-y-4` div, above `<ActivityFilters>`. Three reasons are written into the file: rule P-1
(the calendar tab reads no filter params, and mounting outside `TabsContent` would put the bar in
both tabs), the declined host (below), and K-8 (`bulk-action-bar.tsx` already owns the one fixed bar
on this page).

`key={search}` was added to the search `<Input>`, `defaultValue` kept. A controlled `value={search}`
would also resync it and would break typing — this is a 300ms-debounced writer, so between keystroke
and navigation the URL still holds the previous term.

## The Five Escaped Navigations

Final line numbers, for plan 40-14's gate:

| File | Line | Site | Was |
|------|------|------|-----|
| `activity-filters.tsx` | 90 | `setFilter` | `${pathname}?${params.toString()}` — bare `?` when the last chip is removed |
| `activity-filters.tsx` | 96 | `clearAll` | `router.push(pathname)` — the bare path, no query string at all |
| `activity-filters.tsx` | 124 | `handleSearchChange` | `${pathname}?${params.toString()}` — bare `?` when search was the only filter |
| `activities-client.tsx` | 206 | `handleLoadMore` | `/activities?${sp.toString()}` — non-bare, escaped anyway |
| `activities-client.tsx` | 389 | no-results "Clear filters" | `router.push("/activities")` — bare |

`grep -c "withViewEscape("` = **3** in `activity-filters.tsx`, **2** in `activities-client.tsx`, and
every `router.push` in both files is now routed through the helper.

### Site 3 is not in UI-SPEC's escape-param table, and it is the same defect

Emptying the search box deletes `search` and `page`. When `search` was the only filter, `params` is
left empty and `` `${pathname}?${params.toString()}` `` is `/activities?` — a zero-length query
string, which Next parses into an empty `searchParams` object, which is byte-for-byte the condition
the new redirect guard tests. A user backspacing their last search term would be dropped into their
default view. **The spec's "six call sites" is an undercount by one; there are seven across the four
surfaces.** The discrepancy is named in a comment at the omitted site rather than quietly fixed.

No `view=` writer was added anywhere in this plan, and no `selectedViewId` prop. All five sites build
their `URLSearchParams` from a source that already carries the `view` key (`searchParams.toString()`
or `window.location.search`), and `withViewEscape` preserves a live selection whenever a saveable
filter survives — which is exactly why plan 40-18 put the rule inside the helper.

## Live Measurements

Read-only `psql` against the production-shaped database (79,022 live activities, 4,165 pending,
4,151 overdue, 74,857 completed — all four figures reproduce plan 40-07's).

`BEFORE` simulates what page 1 actually rendered: `LIMIT 51` over the unnarrowed set ordered by
`due_date ASC`, trimmed to 50, then narrowed in JavaScript.

| URL | Rows that match | Rendered BEFORE | Fetched AFTER |
|-----|-----------------|-----------------|---------------|
| `?status=overdue` | 4,151 | **0** (and the "no results" branch fired) | 51 → 50 shown, `hasMore` true |
| `?status=pending` | 4,165 | **0** | 51 → 50 shown |
| `?dateFrom=2025-01-01&dateTo=2025-03-31` | 7,933 | **0** | 51 → 50 shown |
| `?status=completed` | 74,857 | 50 — accidentally correct, because the 51 oldest rows happen to all be completed | 51 → 50 shown |

The mechanism behind every `0`: Postgres applied `LIMIT 51` to all 79,022 rows ordered by `dueDate`
ascending, returning the fifty oldest — all completed, none overdue, none inside a 2025 Q1 window —
and the JavaScript filter then had nothing left to keep. **A post-fetch filter beneath a `limit`
cannot return the rows it is filtering for.** This is also the `hasMore` bug: the button was computed
from the unnarrowed page.

Two supporting reads: every live `due_date` has a zero time component
(`count(*) WHERE due_date::time <> '00:00:00'` = **0**), which is why mirroring the export's
`new Date("YYYY-MM-DD")` UTC-midnight bound rather than the deleted JS filter's local end-of-day
changes nothing on this data; and the due-date distribution is 2022:20,619 / 2023:14,682 /
2024:10,350 / 2025:30,831 / 2026:2,527 / 2027-2030:13.

## The Negative Proof — RUN, verbatim

Deleted the `filters?.dateFrom` guard from `getActivities`, re-ran the gate. **Exactly one** failure,
naming `dateFrom`:

```
PASS (8) FAIL (1)

1. the due-date range is a SQL predicate guards on filters?.dateFrom against dueDate
   AssertionError: no filters?.dateFrom guard: the date-range control writes the URL, renders two
   removable chips and never reaches the WHERE clause — measured 7,933 matching rows displayed as 0:
   expected 'export async function getActivities(f…' to contain 'filters?.dateFrom'
```

Restored; back to 9 passed / 0 failed.

The RED run before any implementation was **1 passed / 8 failed** — the one pass being the
extraction-scoping assertion, which is supposed to hold in both states and would indicate a broken
gate if it did not.

## Every `getActivities(` Caller, Enumerated

`grep -rn "getActivities" src/ --include=*.ts --include=*.tsx`:

| Hit | Verdict |
|-----|---------|
| `src/app/activities/page.tsx:8` (import), `:73` (comment), `:111` (call) | **The only real caller.** Updated. |
| `src/app/activities/bulk-actions.test.ts:606` | A comment about a negative assertion. Not a call. |
| `src/lib/export/__tests__/view-filters.test.ts:261` | A comment describing the very defect this plan closed. Not a call. |
| `src/lib/export/formatters.ts:282, 441, 457, 460` | Comments, including the "Plan 40-13 closes the list side" note. Not calls. |
| `src/lib/import/pipedrive-api-client.ts:365, 584` | `this.activitiesApi.getActivities(` — the **Pipedrive SDK's** unrelated method. Not this function. |

Nothing broke, and `completed?: boolean` was kept anyway.

## Declined: `activity-filters.tsx` as the Host

40-CONTEXT nominated it as "the richest filter toolbar and the natural host". Declined on the two
measurements in amendment A3, both re-stated in the mount comment so this is not re-litigated:

- **M-2** — the filter row is EXACTLY full at 241px (search input 147 + 8px gap + Filters button 86),
  zero slack in en-US.
- **M-5** — its `PopoverContent` renders 388px tall at `top: -41` in a 640px viewport, clipping 41px
  off the top of the screen, because `popover.tsx` never consumes Radix's computed
  `--radix-popover-content-available-height` (347px). Pre-existing, in BACKLOG.md, **out of scope** —
  fixing `popover.tsx` touches every popover in the app. This plan's only obligation toward it is to
  not add to it, discharged by putting nothing inside a `Popover`.

## Threat Model Dispositions

| Threat | Disposition | How |
|--------|-------------|-----|
| T-40-58 (EoP — `hasExportableFilter("activity", …)` satisfied by a filter that narrows nothing) | mitigated | `status` and the date range are real predicates; the list and the export now apply the identical set |
| T-40-59 (Tampering — `new Date(filters.dateFrom)`) | mitigated upstream | 40-05's `validateStoredFilters` (`/^\d{4}-\d{2}-\d{2}$/` + `Date.parse`) bounds the view path and `pickFilterParams` bounds the length; nothing was re-validated here, which would have been a second cleaner to keep correct |
| T-40-60 (Tampering — the three `activity-filters.tsx` pushes) | mitigated | all three escaped, including the one the spec's table omits |
| T-40-61 (Info disclosure — the no-results "Clear filters" button) | mitigated | escaped to `?view=none` |
| T-40-62 (functional DoS — the filter `Popover`) | accepted | pre-existing, backlogged, nothing added to it |
| T-40-63 (Repudiation — the removed post-fetch completion filter) | mitigated | the silent under-count is gone; `limit` now bounds an already-narrowed set, so `hasMore` is correct |
| T-40-SC (npm installs) | mitigated | this plan installed nothing |

## Deviations from Plan

### Auto-fixed / adjusted

**1. [Rule 1 — Bug] `page.tsx` held THREE post-fetch narrowing passes the plan's `<interfaces>` did not record**

- **Found during:** Task 1
- **Issue:** the plan stated `dateFrom`/`dateTo` are "NEVER passed" and that `pending`/`overdue`
  "narrow nothing at all". Both are true of `getActivities`, but `page.tsx:168-185` did apply a date
  range and a pending/overdue status **in JavaScript, over the already-trimmed page, after `hasMore`
  was computed**. So the defect was worse than recorded, not milder: the controls appeared to work
  on a lucky page and produced a `hasMore` describing a different result set than the rows beneath
  it.
- **Fix:** deleted all three passes; the SQL predicates replace them. Leaving them alongside the new
  predicates would have double-filtered harmlessly but kept `hasMore` wrong.
- **Files:** `src/app/activities/page.tsx`
- **Commit:** `b0bc14d`

**2. [Rule 2 — Correctness] `page.tsx`'s `params.status === "completed"` branch removed**

- **Found during:** Task 1
- **Issue:** with `status` threaded through, keeping `filters.completed = true` would have pushed
  two equivalent predicates for the same URL.
- **Fix:** the branch is now `if (params.status) filters.status = params.status`. `completed?:
  boolean` stays in the action's signature and maps onto the same three-way predicate.
- **Commit:** `b0bc14d`

**3. Task 2 touched `activities-client.tsx`, which its `<files>` list did not name**

Task 2's `<action>` explicitly says "pass the result to `<ActivitiesClient>` as one `viewsBar` prop.
Extend that component's props interface" — which cannot be done in `page.tsx` alone. The file is one
of the plan's five declared `files_modified`, so nothing outside the plan's surface was touched.

### Blocked / not done

**The `*.db.test.ts` live assertion was not added.** Not a capability gap — a parallel-wave safety
refusal. `npm run test:db` shells `scripts/dedup-db-test-setup.sh`, which **drops and recreates**
`pipelite_dedup_test`, and this plan executed as one of three agents sharing a single Postgres
instance under an explicit "do NOT write to the database" constraint. The plan's own escape hatch
covers this: "if it is not usable within a reasonable effort, say so in the summary and record a
manual `psql` count instead — do NOT weaken the parsed gate to compensate." The counts are in
**Live Measurements** above, taken read-only, and the parsed gate is nine assertions rather than
fewer. A future plan running alone can add `get-activities-filters.db.test.ts` asserting
`status: "overdue"` returns strictly between 0 and the total; the predicate it would test is the one
40-07 already proved discriminates in rendered SQL.

**Nothing was reported as needing a shared-file change.** No edit to `src/components/views/*`,
`src/lib/views/*`, `src/lib/export/*`, `src/messages/*`, `src/components/ui/*` or `source-scan.ts`
was required or made.

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run src/app/activities/` | 54 passed / 0 failed |
| `npm test` (base + rsc projects) | 3670 passed / 28 skipped / 3698 — baseline 3661 + the 9 tests this plan added |
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors, 125 warnings — **exactly** the pre-existing baseline |
| `withViewEscape(` call sites | 3 in `activity-filters.tsx`, 2 in `activities-client.tsx` |
| unescaped `router.push` on the list route | none in either file |
| `bg-green-500` / `bg-amber-500` / `placeholder="Search activities..."` | present and unmodified — `git diff` shows zero removed lines containing them |
| files touched vs. `c59575c` | exactly the five declared, no more |
| new English literals | none |
| commits with file deletions | none |

## The Gate

`src/app/activities/__tests__/get-activities-filters.test.ts` — 9 assertions over
`readStrippedSource`, every one scoped to an extracted region.

- **The extraction is asserted, not assumed.** `getActivityById` sits directly below `getActivities`
  and searches the same table, so an unscoped grep for `isNull(activities.deletedAt)` would count
  that function's copy and the "exactly one" gate would pass for the wrong reason. The first test
  asserts the slice does not contain `getActivityById`, starts with the signature, and contains the
  `findMany`.
- **No fourth brace matcher was written.** `source-scan.ts` owns a paren matcher and three tag
  matchers; none extracts a function body. The slice runs from the declaration to the next
  `\nexport ` — every declaration in `actions.ts` starts at column 0 — and the boundary is then
  tested rather than trusted. The rule is "do not write a second matcher for a job one already
  does", not "never slice a source file".
- **Import membership is an allow-list over comma-split specifiers.** `source.includes("lt")` would
  pass on `result`, `filteredResults` or `default`, all of which appear in this file — the same
  substring-collision class that broke 40-09's first attempt on `Check` inside `onCheckedChange`.
- **The failure messages carry the measurement.** The `.filter(` assertion's message states that
  4,151 overdue rows rendered as 0 and why, so a future reader who trips it learns the mechanism
  rather than just the rule.

## Known Stubs

None. Every control this plan touched is wired to a real data source, and the three filters it
made real were the stubs.

## Self-Check: PASSED

- All five files exist on disk.
- All four commits exist in `git log --all`: `9c62816`, `b0bc14d`, `caa8322`, `8130447`.
- `git diff --name-only c59575c HEAD` returns exactly the five declared files.
- Working tree clean.

## Commits

| Hash | Message |
|------|---------|
| `9c62816` | `test(40-13): the activities list filter gate — RED` (1 passed / 8 failed) |
| `b0bc14d` | `feat(40-13): status and the due-date range become real SQL predicates` |
| `caa8322` | `feat(40-13): the default-view redirect and the bar props on /activities` |
| `8130447` | `feat(40-13): mount the bar in the list tab, escape five navigations, resync the search input` |

## For Plan 40-14

The gate should be written against **seven** escape call sites repo-wide, not the UI-SPEC table's
six. This surface contributes five, at `activity-filters.tsx:90, 96, 124` and
`activities-client.tsx:206, 389`. Line 124 (`handleSearchChange`) is the one the table omits.
