---
phase: 40-saved-views-shared-filters
reviewed: 2026-08-22T14:10:00Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - src/lib/views/queries.ts
  - src/lib/views/actions.ts
  - src/lib/views/write-guards.ts
  - src/lib/views/validate.ts
  - src/lib/views/resolve.ts
  - src/lib/views/export-action.ts
  - src/lib/views/types.ts
  - src/lib/views/url-params.ts
  - src/lib/export/view-export-guard.ts
  - src/lib/export/types.ts
  - src/lib/export/formatters.ts
  - src/db/schema/saved-views.ts
  - src/db/schema/index.ts
  - src/db/schema/_relations.ts
  - drizzle/0018_adorable_smasher.sql
  - drizzle/meta/_journal.json
  - src/components/views/saved-views-bar.tsx
  - src/components/views/save-view-dialog.tsx
  - src/components/views/manage-views-dialog.tsx
  - src/app/organizations/page.tsx
  - src/app/organizations/data-table.tsx
  - src/app/people/page.tsx
  - src/app/people/data-table.tsx
  - src/app/deals/page.tsx
  - src/app/deals/kanban-board.tsx
  - src/app/deals/deal-filters.tsx
  - src/app/activities/page.tsx
  - src/app/activities/activities-client.tsx
  - src/app/activities/activity-filters.tsx
  - src/app/activities/actions.ts
  - playwright.config.ts
  - e2e/member.setup.ts
  - e2e/seed-member.ts
  - e2e/views-fixtures.ts
  - src/components/custom-fields/__tests__/source-scan.ts
  - src/messages/en-US.json
  - src/messages/pt-BR.json
  - src/messages/es-ES.json
findings:
  critical: 1
  warning: 6
  info: 6
  total: 13
fixed:
  critical: 1
  warning: 5
  info: 0
  total: 6
open:
  critical: 0
  warning: 1
  info: 6
  total: 7
fixed_at: 2026-08-22T14:40:00Z
fixed_ids: [CR-01, WR-01, WR-02, WR-03, WR-05, WR-06]
open_ids: [WR-04, IN-01, IN-02, IN-03, IN-04, IN-05, IN-06]
status: fixes_applied
---

# Phase 40: Code Review Report

**Reviewed:** 2026-08-22T14:10:00Z
**Depth:** standard
**Files Reviewed:** 27 source files (+ 11 harness / catalog / migration files)
**Status:** issues_found

## Summary

The security spine of this phase holds up under attack. I tried to break the four invariants the
brief named and three of them survived intact:

- The visibility predicate really is in SQL, really is defined once, and really has no admin branch
  (`queries.ts:124-126`, applied at `:152` and inside the join condition at `:241`). A post-fetch
  `.filter()` would have been the obvious defect here; it is not present.
- `setViewDefault` authorizes on `canSeeView` and additionally refuses a cross-entity view
  (`actions.ts:437,442`). A member cannot point their default at an admin's private view.
- `validateStoredFilters` is genuinely total — every catalog read, every set membership test and
  every source walk is wrapped, and the two failure directions (drop the key, keep the list) are the
  narrowing ones.
- Every filter value that reaches SQL crosses as a bound parameter, including the two raw `sql`
  fragments in `fetchDeals` (`formatters.ts:390,397`). No injection.

What did not survive:

1. **One correctness regression that produces silently wrong data** — the `dateTo` boundary. The
   phase deleted an explicit `setHours(23,59,59,999)` from `activities/page.tsx` and replaced it with
   a bare `lte(dueDate, new Date(dateTo))`, which is midnight. The current dataset masks it (measured:
   0 of 79,022 live activities have a non-midnight `due_date`), but every activity created through
   the app carries a time — the dialog defaults to `09:00`.
2. **The mutation guards are not composed with the visibility guard.** `canMutateView` is checked
   alone in three actions, so the header's claim at `queries.ts:38-41` ("an admin can only mutate a
   view they can already see") is false, and `views.save.sharedHelp` tells the user something the
   server does not enforce.
3. **The export guard that replaced Phase 38's admin gate is satisfiable by a one-character search.**
   Measured against the live database: `?search=a` authorizes an export of 44,254 of 46,054
   organizations, under the 50,000 cap, for any authenticated non-admin, with `notes` and every
   custom field included.

Everything below was checked against the running container and the live database where a number is
quoted. Unit suites for the phase are green (889 tests across 6 files); none of the findings below is
caught by them, which is itself worth noting — three of them are the kind a structural gate cannot
see.

---

## Critical Issues

### CR-01: `dateTo` now excludes the entire end day on `/activities` and in every view export

**File:** `src/app/activities/actions.ts:589`
**Also:** `src/lib/export/formatters.ts:480` (activities export), `src/lib/export/formatters.ts:404` (deals export)

**Issue:**
Plan 40-13 moved the activities date range from a post-`limit` JavaScript pass into SQL. The
JavaScript it deleted was explicitly end-of-day inclusive:

```js
// deleted from src/app/activities/page.tsx by this phase
const toDate = new Date(params.dateTo)
toDate.setHours(23, 59, 59, 999)
allActivities = allActivities.filter((a) => new Date(a.dueDate) <= toDate)
```

The SQL that replaced it is not:

```ts
conditions.push(lte(activities.dueDate, new Date(filters.dateTo)))   // actions.ts:589
```

`new Date("2025-03-31")` is `2025-03-31T00:00:00.000Z`. `due_date` is
`timestamp('due_date', { mode: 'date' })` and the create dialog composes it as
`` `${data.dueDate}T${data.dueTime || "09:00"}:00` `` (`activity-dialog.tsx:227`), so a normal
app-created activity due on the range's last day sits at 09:00 and is **excluded**. The end of the
range is now exclusive of the whole day rather than inclusive of it.

`formatters.ts:480` is a line-for-line copy of the same expression, so the CSV a user downloads from
a saved view omits the same rows — silently, because the row count in the success toast comes from
the same query. `formatters.ts:404` repeats the shape for `deals.expectedCloseDate`.

Why this is not visible today, and why that is not a defence: I measured the live table and **all**
79,022 live activities and all 324 deals with an `expected_close_date` are stored at exactly
`00:00:00`, because they were imported. `dateTo=2025-03-31` therefore currently returns the 144 rows
due that day. The first activity a user creates through the UI breaks it, and the failure is
invisible — a narrower result set with no notice.

The `dateFrom` side is correct only by coincidence: the container runs `TZ=UTC` (verified), so UTC
midnight and local midnight agree. Under any non-UTC deployment `new Date("2025-01-01")` would also
shift the start boundary, which the deleted `setHours(0,0,0,0)` handled.

**Fix:** make the upper bound exclusive of the *next* day, at all three sites, so no time-of-day
arithmetic or timezone assumption is needed:

```ts
// src/app/activities/actions.ts and src/lib/export/formatters.ts
function endOfDayExclusive(isoDate: string): Date {
  const d = new Date(isoDate)
  d.setUTCDate(d.getUTCDate() + 1)
  return d
}

if (filters?.dateTo) {
  conditions.push(lt(activities.dueDate, endOfDayExclusive(filters.dateTo)))
}
```

The helper belongs in one module imported by both, because `formatters.ts:280` already claims each
predicate "MIRRORS the list page it must match" — two copies of a boundary rule is how they stop
mirroring. Add a fixture activity with a non-midnight `due_date` to
`__tests__/get-activities-filters.test.ts`; the current dataset cannot fail this assertion.

---

## Warnings

### WR-01: `canMutateView` is never composed with `canSeeView`, so an admin can mutate — and read back — a private view

**File:** `src/lib/views/actions.ts:259` (`updateView`), `:355` (`setViewShared`), `:490` (`deleteView`)

**Issue:**
`queries.ts:38-41` states the invariant plainly:

> `canEdit` KEEPS THE ADMIN BRANCH, and that is not a contradiction. […] an admin can only mutate a
> view they can already see.

That is not what the code does. All three mutating actions fetch the row by primary key with no
visibility predicate —

```ts
const row = await db.query.savedViews.findFirst({ where: eq(savedViews.id, id), … })
if (!row) return { success: false, error: "failed" }
if (!canMutateView(row, viewer)) return { success: false, error: "forbidden" }
```

— and `canMutateView` is `row.ownerId === viewer.id || viewer.role === "admin"` (`write-guards.ts:235`).
Nothing consults `canSeeView`. For an admin the second clause is unconditionally true, for a private
view they do not own, so an admin holding the id can:

- `setViewShared({ id, isShared: true })` — flip a private view to shared, after which its **name and
  full filter set** appear in their own picker. This defeats Decision 3 outright, not partially.
- `deleteView({ id })` — destroy it, and the action **returns `row.name`** on success
  (`actions.ts:496`), which is a direct disclosure of a private view's name.
- `updateView({ … })` — rename it and overwrite its filters.

The mitigating fact, stated honestly so the severity is not overstated: ids are
`crypto.randomUUID()` v4 and no code path exposes a private view's id to a non-owner (I checked the
resolver, the bar, the manage dialog and both defaults reads). So this is not remotely exploitable by
enumeration, which is why it is a Warning and not a Critical. But the invariant the file claims to
hold does not hold, there is no defence in depth behind the unguessable id, and `actions.test.ts:743`
asserts the *absence* of `canMutateView` in `setViewDefault` while nothing asserts the *presence* of
`canSeeView` in the three mutators — so the gap is unmeasured as well as unenforced.

**Fix:** compose the two predicates at all three sites. Visibility first, so the refusal reason for a
row the caller cannot see is identical to the one for a row that does not exist:

```ts
if (!row) return { success: false, error: "failed" }
// A view this caller cannot SEE is answered exactly as a missing one: an admin must not be able
// to distinguish "no such view" from "someone's private view" (Decision 3).
if (!canSeeView(row, viewer)) return { success: false, error: "failed" }
if (!canMutateView(row, viewer)) return { success: false, error: "forbidden" }
```

Then extend `__tests__/actions.test.ts`'s G-7 block with the mirror of the assertion it already makes
for `setViewDefault`: each of `updateView`, `setViewShared` and `deleteView` must contain
`canSeeView` ahead of its write marker.

### WR-02: `views.save.sharedHelp` promises the user something the server does not enforce

**File:** `src/messages/en-US.json:683`, `src/messages/pt-BR.json:683`, `src/messages/es-ES.json:683`

**Issue:**
The helper text shown under the "Share with the team" checkbox reads:

> "Teammates can select this view and set it as their default. **Only you can edit or delete it.**"

The second sentence is false. `canMutateView` grants edit and delete to `role === "admin"` on any
view, which is the app's documented intent (40-CONTEXT: "only the owner (or an admin) may edit or
delete a view"). The user is being told a stronger guarantee than the one that exists, on the exact
surface where they decide whether to share.

This is not a copy nit: it is the same class of defect as the sibling string `save.privateHelp`
("Only you can see this view. Nobody else, including admins."), which the code goes to considerable
length to make true — the whole of `queries.ts`'s header exists to keep that one honest. One of the
two promises is enforced and the other is not, and they sit two lines apart in the catalog.

**Fix:** make the sentence match `canMutateView`, in all three locales:

```json
"sharedHelp": "Teammates can select this view and set it as their default. Only you and admins can edit or delete it."
```

(Note the interaction with WR-01: if WR-01 is fixed the private-view case is closed, but this
sentence still needs correcting, because it is about a *shared* view.)

### WR-03: unsharing through `updateView` skips the stale-defaults cleanup that `setViewShared` performs

**File:** `src/lib/views/actions.ts:273-303` (`updateView`), compare `:357-368` (`setViewShared`)

**Issue:**
`setViewShared` documents a consequence at length (`actions.ts:320-332`) and implements it: making a
view private also deletes every *other* user's default row pointing at it, so nobody is left holding
a default they can no longer resolve.

`updateView` can perform the same state change — the save dialog's "Share with the team" checkbox is
sent as `isShared` and written unconditionally at `actions.ts:279`:

```ts
.set({ name: guarded.name, filters: guarded.filters, isShared: input.isShared === true, … })
```

— and it does **not** delete the other users' defaults. Its only `savedViewDefaults` delete is scoped
to `viewer.id` (`:293-301`), which is the *opposite* row set.

Reachable in three clicks: A shares view V; B sets V as their default; A opens the save dialog with V
selected, unticks "Share with the team", saves. B's `saved_view_defaults` row survives.

The immediate consequence is benign — `readDefaultViewForUser` carries the visibility predicate in
the join (`queries.ts:236-243`), so B degrades to the unfiltered list. The non-benign one is the
re-share: if A ever re-shares V, B is silently redirected into a view they last chose weeks ago and
have no memory of choosing. It also leaves the database in exactly the state `setViewShared`'s header
says it has eliminated, so the next reader of that header will believe a guarantee that only one of
the two code paths provides.

**Fix:** extract the cleanup and call it from both. In `updateView`'s transaction, when the write
takes the view private:

```ts
if (row.isShared && input.isShared !== true) {
  await tx
    .delete(savedViewDefaults)
    .where(and(eq(savedViewDefaults.viewId, id), ne(savedViewDefaults.userId, row.ownerId)))
}
```

`row.isShared` is already selected at `actions.ts:253`, so no extra read is needed.

### WR-04: the export guard is satisfiable by a one-character search, so it is not a bound

**File:** `src/lib/export/view-export-guard.ts:128-139`, `src/lib/views/url-params.ts:177-192`

**Issue:**
`view-export-guard.ts:6-9` sets the standard the control must meet:

> **So the guard must be IMPOSSIBLE to satisfy with no filter, not merely discouraged.**

It meets that letter and misses the point. `EXPORTABLE_FILTER_KEYS.organization` is `["search"]`, and
`hasExportableFilter` only asks whether a whitelisted key is *present* — never whether it narrows
anything. Measured against the live database just now:

| request | rows authorized | table size |
| --- | --- | --- |
| `/organizations` view with `search=a` | **44,254** | 46,054 (96.1%) |
| `/people` view with `search=a` | **36,893** | 38,348 (96.2%) |

Both are under `EXPORT_ROW_CAP` (50,000), so the second control does not fire either. Any
authenticated user — the phase deliberately removed the admin gate (E-9) — gets a CSV of essentially
the whole organizations table in one action call, with `notes` and every custom field included
(`export-action.ts:70` hard-codes `includeCustomFields: true`).

38-CONTEXT's prohibition is quoted in this file as being about "an action handed `{}`". The empty map
was the *example*; the property was bounded export. Replacing an admin gate with a presence test
preserves the example and drops the property. Worth saying plainly: this is a consequence of a
recorded decision, not a slip — but the decision was recorded on the premise that
`guardExportInput` preserves 38-CONTEXT's intent, and measurably it does not.

**Fix:** the cheapest honest option is to make the cap the real control rather than a backstop, by
lowering it to something a human actually consumes from a filtered view (a few thousand), so the
one-character search is refused by row count rather than by guesswork about selectivity. If the
50,000 cap must stay for a genuine use case, gate *that* magnitude:

```ts
// view-export-guard.ts
export const EXPORT_ROW_CAP = 50_000
/** Above this, an export stops being "the view I am looking at" and becomes a table dump. */
export const NON_ADMIN_EXPORT_ROW_CAP = 5_000
```

and have `exportViewResults` pass `session.user.role === "admin" ? EXPORT_ROW_CAP : NON_ADMIN_EXPORT_ROW_CAP`.
That keeps E-9 (every user may export) while restoring the bound. Whichever is chosen, record the
measurement above beside the constant — the current comment cites table sizes but never checks what a
one-character search matches.

### WR-05: `status=pending` now returns the overdue activities too, so two of the three status options overlap 99.7%

**File:** `src/app/activities/actions.ts:578-579`, mirrored at `src/lib/export/formatters.ts:467-468`

**Issue:**
The filter is a single-select offering three values — `pending`, `completed`, `overdue`
(`activity-filters.tsx:170-181`) — which presents them as mutually exclusive states. The JavaScript
this phase deleted treated them that way:

```js
// deleted from activities/page.tsx
if (params.status === "pending") {
  allActivities = allActivities.filter((a) => !a.completedAt && new Date(a.dueDate) >= new Date())
}
```

The SQL that replaced it does not:

```ts
} else if (status === "pending") {
  conditions.push(isNull(activities.completedAt))
}
```

Measured on the live table: `completed_at IS NULL` → **4,165** rows; `completed_at IS NULL AND
due_date < now()` → **4,151**. So "Pending" is now a superset of "Overdue" that adds exactly 14 rows.
A user picking "Pending" to see what is not yet due gets 4,151 overdue rows and 14 relevant ones.
The export mirrors the same predicate, so the CSV agrees with the list — it is consistently wrong
rather than inconsistent.

The redefinition was not called out anywhere in the diff or in `deferred-items.md`; the plan's own
measurement block quotes `?status=pending — 4,165 rows match` as if that were the pre-existing
meaning, when the pre-existing (unreachable) meaning was 14.

There is a real argument for the new semantics — `activities-client.tsx:253` computes its stats
`pendingCount` as `!a.completedAt`, so the SQL now matches the stats row. That argument makes this a
choice, not an accident, but the choice needs to be made once and made visible: either the stats row
is wrong, or the "Overdue" option is redundant.

**Fix:** pick one and state it. If the three options are exclusive (which the single-select implies):

```ts
} else if (status === "pending") {
  // Not completed AND not yet due — "Overdue" is the other half, and the two must not overlap,
  // because the control that produces them is a single select.
  conditions.push(and(isNull(activities.completedAt), gte(activities.dueDate, new Date()))!)
}
```

and change `activities-client.tsx:253` to match, or relabel that stat "Open". Apply the identical
edit to `formatters.ts:467` in the same commit — the two files claim to mirror each other line for
line.

### WR-06: the manage dialog's optimistic overrides are never reconciled with the authoritative prop

**File:** `src/components/views/manage-views-dialog.tsx:110-111`, read at `:125` and `:198`

**Issue:**
The header states the model correctly:

> The truth is the `views` prop, which the server rebuilds after every action's `revalidatePath`.
> Between the click and that rebuild the switch has to show the position the user just chose […]

The implementation never returns to that truth. `sharedOverride[view.id]` is written on toggle and
cleared only on *failure* (`:291`); on success it is left in place, and `:198` reads
`sharedOverride[view.id] ?? view.isShared` — so from the first successful toggle onward, the prop is
permanently shadowed for that view for the lifetime of the client tree. `defaultOverride` has the
same shape at `:125`, and neither is reset when the dialog closes (the component is always mounted;
only `open` changes).

Concretely: unshare view A in the manage dialog (override `{A: false}`), close it, re-share A through
the save dialog's checkbox, reopen the manage dialog. The switch reads "off" and the state words say
"Private" while the row is shared. Clicking the switch then sends `setViewShared({ isShared: true })`
— a no-op that happens to repair the display, which is how this will be misdiagnosed as a rendering
glitch. Same story for a change made in a second tab, or for a shared view a colleague unshares.

**Fix:** discard the override once the authoritative value has caught up. The cheapest correct form
is to key the override by the value it was covering and drop it on match, during render:

```ts
const isSharedNow = sharedOverride[view.id] ?? view.isShared
// …after a successful write, in the transition:
if (result.success) {
  setSharedOverride((current) => {
    const next = { ...current }
    delete next[view.id]      // the prop is about to arrive; stop shadowing it
    return next
  })
  toast.success(t("manage.saved"))
  return
}
```

and mirror it for `defaultOverride` (`setDefaultOverride(null)` on success). The revalidation has
already been awaited by the time the action resolves, so there is no flash back to the old position.

---

## Info

### IN-01: `views.save.noFilters` is defined in all three locales and never rendered

**File:** `src/messages/en-US.json:692`, `pt-BR.json:692`, `es-ES.json:692`

The `no_filters` code returned by `guardSaveInput` is collapsed into the generic `t("save.failed")`
toast by `save-view-dialog.tsx:215`, and the comment there says so explicitly. So the sentence
"This list has no filters applied, so there is nothing to save." — written three times, reviewed
three times — reaches no user. Either wire it up (`if (result.error === "no_filters") toast.error(t("save.noFilters"))`)
or delete all three entries. S-15 argues for wiring it up: the server-side refusal exists precisely
because the hidden button is not a control, and answering it with "try again" invites a retry that
cannot succeed.

### IN-02: `EXCLUDED_URL_KEYS` is exported but referenced only by its own test

**File:** `src/lib/views/url-params.ts:87`

`pickFilterParams` works from a positive whitelist, so the exclusion list is never consulted by
production code — the only reader is `__tests__/url-params.test.ts:156`, which asserts the constant
equals the literal it was initialised with. A constant whose sole test is its own definition is
documentation wearing a test's clothes. Either delete it, or use it: `withViewEscape` currently
hard-codes `VIEW_ESCAPE_KEY` where the list would read more honestly.

### IN-03: duplicate import statement from the same module

**File:** `src/db/schema/_relations.ts:28-29`

```ts
import { savedViews } from "./saved-views"
import { savedViewDefaults } from "./saved-views"
```

One line: `import { savedViewDefaults, savedViews } from "./saved-views"`.

### IN-04: date params reach `new Date()` on the request path without the validator that already exists

**File:** `src/app/activities/actions.ts:586,589`; `src/lib/export/formatters.ts:401,404,477,480`

`validate.ts:160` already owns `isValidDate` (regex + `Date.parse` finiteness, with a careful comment
about why both are needed), but it only guards the *stored blob* path. A hand-typed
`/activities?dateFrom=notadate` produces an `Invalid Date`, which drizzle's timestamp mapper turns
into a driver-level throw; `getActivities` catches it and the page renders the generic
`t('errorLoading')` panel instead of the list. The export path degrades the same way, into
`bulk.error.exportFailed`.

Both degrade rather than crash, and neither is reachable from the UI (`<input type="date">`), so this
is Info. But the fix is one import: drop the key when `!isValidDate(value)`, matching what the view
path already does, instead of letting a malformed value reach the driver. That also removes the one
asymmetry where the same filter value behaves differently depending on whether it arrived from a
saved view or from the address bar.

### IN-05: a pasted search longer than 256 characters is silently discarded and the input clears itself

**File:** `src/lib/views/url-params.ts:277`, consumed by `src/app/organizations/data-table.tsx` and `src/app/people/data-table.tsx`

`narrowFilterValue` rejects values over `MAX_FILTER_VALUE_LENGTH`. When the search writer routes a
297-character paste through `withViewEscape`, `pickFilterParams` returns `{}`, the key is deleted and
not re-added, and the helper appends `view=none`. The server then reads `search === ""`, the
`prevSearch` resync at `data-table.tsx:181` fires, and the input the user just pasted into empties
itself 300ms later with no message. Traced, not hypothesised.

A cap is right; a silent one on a control the user is looking at is not. Either clamp with a
`maxLength` on the `<Input>` so the paste is visibly truncated, or keep the local `searchInput` when
the URL round-trip drops the value.

### IN-06: CSV formula injection in the exported file (pre-existing, audience widened by this phase)

**File:** `src/lib/export/formatters.ts:219-227`

`Papa.unparse` quotes and escapes for CSV but does nothing about a cell whose first character is
`=`, `+`, `-`, `@`, tab or CR — Excel and LibreOffice evaluate those as formulas on open. An
organization `notes` field or any text custom field is attacker-controlled by anyone who can create a
record.

This is pre-existing Phase 38 code and I am not scoring it against this phase's work. It is listed
because Phase 40 changes who can trigger it: before, a filters-taking export required an admin;
after Decision 2 (E-9) any authenticated user can produce one, and WR-04 shows the resulting file can
contain most of the table. Prefix at-risk cells with `'` in `exportToCSV`, at the single choke point
all four entity exports already funnel through.

---

## What I checked and found clean

Recorded so a later reader knows these were attacked rather than skipped:

- `visibleViewsPredicate` is in the `WHERE` and in the `INNER JOIN` condition, never post-fetch
  (`queries.ts:152`, `:241`). The RSC-payload leak the header warns about does not exist.
- `setViewDefault` refuses a view the caller cannot see (`actions.ts:437`) *and* a view of a different
  entity type (`:442`). The T-40-24 disclosure is closed.
- Every filter value reaching SQL is a bound parameter, including the two raw `sql` fragments
  (`formatters.ts:390`, `:397`) and both list-page equivalents. No string interpolation of user data
  into SQL anywhere in the diff.
- `pickFilterParams` / `keysFor` / `narrowEntityType` all use membership scans over frozen arrays, so
  `__proto__` and friends are ordinary non-members at every whitelist site I traced.
- Redirect-loop analysis: `redirectTargetFor` returns `null` on an empty validated set
  (`resolve.ts:302`), and all seven filter-clearing writers route through `withViewEscape`, which
  appends `view=none`. I could not construct a URL that re-enters the `Object.keys(params).length === 0`
  branch after a redirect.
- The `saved_views` / `saved_view_defaults` migration matches the schema module exactly (both FKs,
  both cascade choices, the composite PK, all four indexes), and journal entry 18 is well-formed.
- `filters` blob size is bounded by construction: ≤7 whitelisted keys × ≤256 chars.
- i18n: all 61 `views.*` keys present in all three locales with identical placeholder sets; no key
  referenced by the three components is missing from the catalog.
- e2e fixtures: every delete is prefix-scoped or e2e-account-scoped, the loopback guard is repeated at
  all three write sites, and `E2E_MEMBER_PASSWORD` has no fallback. `.env` is untracked. No credential
  in the diff.
- Unit suites for the phase: 889 tests, 6 files, green.

---

_Reviewed: 2026-08-22T14:10:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

---

# Fixes applied

Six of the seven Critical/Warning findings are fixed, one atomic commit each. **The reviewer's
findings above are unchanged** — nothing was edited, softened or deleted. This section is appended.

Every fix has a regression test that FAILED against the unfixed code and PASSES after it. The RED
run was executed before each fix, not reconstructed afterwards, and the failure counts below are the
observed ones.

| id | commit | what changed | regression test | RED |
| --- | --- | --- | --- | --- |
| CR-01 | `26f6f2e` | `src/lib/filters/date-range.ts` (new, shared) + all three call sites: `activities/actions.ts`, `formatters.ts` × 2 | `src/app/activities/__tests__/get-activities-where.test.ts` (new), `src/lib/export/__tests__/view-filters.test.ts`, `src/lib/filters/__tests__/date-range.test.ts` (new) | 8 failing |
| WR-05 | `7f8982e` | `getActivities` + `fetchActivities` pending predicate; `activities-client.tsx` stats row | `get-activities-where.test.ts`, `view-filters.test.ts`, `get-activities-filters.test.ts` | 3 failing |
| WR-01 | `cb6526c` | `canSeeView` composed into `updateView`, `setViewShared`, `deleteView`; `queries.ts` header names its enforcement site | `src/lib/views/__tests__/actions.test.ts` | 7 failing |
| WR-02 | `636d9b8` | `views.save.sharedHelp` corrected in en-US, pt-BR, es-ES | `src/messages/locale-parity.test.ts` | 4 failing |
| WR-03 | `8db5ed3` | `clearOtherUsersDefaults` extracted; called by `setViewShared` AND `updateView` | `src/lib/views/__tests__/actions.test.ts` | 7 failing |
| WR-06 | `a9af8bc` | both optimistic overrides discarded in the success branch | `src/components/views/__tests__/manage-views-dialog-wiring.test.ts` | 1 failing |

## WR-04 is deliberately NOT fixed

Recorded above exactly as written. The decision taken separately: tightening `hasExportableFilter`
or lowering the row cap is a **change to Decision 2**, not a bug fix, and belongs to whoever owns
that decision. `view-export-guard.ts` is untouched by every commit in this section — no
minimum-selectivity rule, no second cap, no policy change. The finding stands open with its
measurements intact.

The six Info findings are also untouched and remain open.

## Notes on the fixes that go slightly beyond the finding's own line numbers

Recorded because each one is a decision a later reader could otherwise mistake for scope creep.

**CR-01 — the boundary rule became a module.** The review asked for one: "The helper belongs in one
module imported by both, because `formatters.ts:280` already claims each predicate 'MIRRORS the list
page it must match' — two copies of a boundary rule is how they stop mirroring." So
`src/lib/filters/date-range.ts` owns `startOfDayInclusive` / `endOfDayExclusive` and all three sites
import it. The bound is **half-open** (`dueDate < dateTo + 1 day`) rather than the deleted
`setHours(23,59,59,999)`: Postgres `timestamp` keeps microseconds and `Date` does not, so the
`.999` form is wrong at the precision the column actually stores. Both helpers are **UTC-only** and
the module says so, along with what changes under a non-UTC deployment — the container runs `TZ=UTC`,
verified.

**WR-05 — the stats row followed the query.** The review noted that `activities-client.tsx:253`
computing `pendingCount` as `!a.completedAt` was the argument offered FOR the broken predicate, and
that "the choice needs to be made once and made visible: either the stats row is wrong, or the
'Overdue' option is redundant." With the predicate fixed, leaving the stats row would have put ONE
WORD on the screen meaning two different sets — read "Pending: 50", select Pending, get a different
number. `pendingCount` now matches the filter and `overdueCount` is shown beside it, using
`t('overdue')`, the same catalog key the filter's third option already renders, so **no string was
added in any locale**. The three numbers still account for every row on the page.

**WR-03 — the cleanup was extracted rather than copied.** The review's prose asked for exactly this
("extract the cleanup and call it from both"); its code sketch showed an inline block.
`clearOtherUsersDefaults` is module-private — Next.js refuses a `"use server"` module that exports a
non-async-function, and exporting it would make it a public endpoint that deletes defaults. Two
inline copies of one rule is the shape that produced WR-03, so the gate now FAILS on a second copy
rather than tolerating it.

## One existing assertion was changed, and it was strengthened

`src/app/activities/__tests__/get-activities-filters.test.ts` required
`expect(getActivitiesBody).toContain("lte(activities.dueDate")`. That assertion was **pinning CR-01
in place** — it demanded the inclusive upper bound that drops the end day. It now requires
`lt(...)`, names the shared helper, and forbids the `lte` spelling outright, which is strictly
stronger than the "some upper bound exists" claim it replaced. Flagged here rather than left in a
diff, because a gate that encodes a defect is itself a finding.

Two other existing tests were **extended, not relaxed**:

- `view-filters.test.ts`'s "pending" test keeps its `not.toContain('"activities"."due_date" <')`
  assertion byte-for-byte — it still guards what it was written for, that a future-dated incomplete
  row stays pending — and gains the `>=` requirement WR-05 needs.
- `actions.test.ts`'s "setViewShared clears OTHER users' defaults" test: its four assertions
  (`savedViewDefaults`, `.delete(`, `ne(`, `ownerId`) moved onto the shared helper, where they now
  cover BOTH unshare paths instead of one. setViewShared keeps a stronger claim of its own — it
  calls the helper, inside its transaction, only under `if (!isShared)`.

## Suite state

- `npx tsc --noEmit` — clean.
- `npx eslint` — 0 errors, 125 warnings (the review-time baseline was 127; nothing was suppressed).
- `npm test` — **3842 passed / 28 skipped** in the base project plus **8 passed** in the rsc project,
  0 failures. The baseline was 3791 passed; the 51 new tests are the regression gates listed above.

`npm run test:db` was NOT run — it drops and recreates a database. `formatters-live.test.ts`
self-skips without `DATABASE_URL` and was not relied on as a gate; every assertion above runs in the
base project, in CI.

_Fixes applied: 2026-08-22_
_Fixer: Claude (gsd-code-fixer)_
