---
phase: 40-saved-views-shared-filters
plan: 16
subsystem: testing
tags: [playwright, e2e, visibility, criterion-2, degraded-read, anti-vacuity, negative-probe, saved-views, harness]

# Dependency graph
requires:
  - phase: 40-04
    provides: "the seeded MEMBER account, `e2e/.auth/member.json`, the `chromium-member` project, and the prefix-scoped fixture helpers"
  - phase: 40-05
    provides: "visibleViewsPredicate (ownerId = viewer OR isShared, no admin branch), validateStoredFilters, and droppedFilterKeys on the SELECTED view only"
  - phase: 40-09
    provides: "ManageViewsDialog — the second disclosure surface, its readOnly sentence and its always-live default switch"
  - phase: 40-10
    provides: "SavedViewsBar — the picker, the groupMine/groupShared partition and the `views.degraded` line"
  - phase: 40-12
    provides: "the Decision-4 pipeline fallback and deals/page.tsx's pipelineWasDropped merge"
  - phase: 40-15
    provides: "the fixture-purge discipline, the click-swallow retry idiom, and the deferred-items log this plan extends"
  - phase: 40-18
    provides: "resolveDefaultViewRedirect naming its view, which is what makes the G-7 landing assertion two facts instead of one"
provides:
  - "e2e/saved-views-visibility-member.spec.ts — V-40-8, the member direction, both disclosure surfaces, plus G-7 across an ownership boundary"
  - "e2e/saved-views-visibility-admin.spec.ts — V-40-8, the DEPARTING direction: a member's private view is invisible to an admin"
  - "e2e/saved-views-degraded.spec.ts — V-40-9, three degradation kinds, the bookmarked-URL branch, and the M-14 no-error.tsx check"
  - "four absence assertions each proven non-vacuous by a probe that was RUN, verbatim below"
  - "two harness defects found and fixed in playwright.config.ts, one of which was silently running member specs as an admin"
  - "two product defects found, measured and logged: D-40-3 (88s deals board) and D-40-4 (pre-existing deals-drag failure)"
affects: [40-17, 40-VERIFICATION]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "An absence assertion always ships with a POSITIVE COMPANION read from the same container in the same open state — listVisibleViews catches its own errors and returns [], so an empty picker satisfies every privacy claim"
    - "The session under test asserts its own identity in beforeEach, not beforeAll: beforeAll gets a `browser`, and a context minted from it does NOT inherit the project storageState, so the check would run anonymously"
    - "Fixture-flip negative probes (E2E_VIEWS_PROBE) instead of source-edit probes: the container has no volume mount, so probing the app costs a rebuild while probing the fixture costs an env var and asks the same question"
    - "Assert the SUBJECT first and its preconditions after, so a negative probe reaches the line it is aimed at instead of being caught by a precondition"
    - "Prove a negative locator before trusting it — inject the thing it claims to never find and watch it go 0 -> 1 -> 0"
    - "Choose fixture VALUES that make the assertion able to fail: an owner filter naming a user who owns nothing renders an empty list, and every claim about that list is then free"
    - "Wait for THIS view's id in waitForURL, never for `has('view')` — every test enters from ?view=none, which already has one"

key-files:
  created:
    - e2e/saved-views-visibility-member.spec.ts
    - e2e/saved-views-visibility-admin.spec.ts
    - e2e/saved-views-degraded.spec.ts
  modified:
    - e2e/views-fixtures.ts
    - playwright.config.ts
    - .planning/phases/40-saved-views-shared-filters/deferred-items.md

key-decisions:
  - "The shared visibility triad lives in e2e/views-fixtures.ts, NOT exported from the member spec: a Playwright spec that imports another spec registers that file's tests into itself, which would have run every member assertion under the admin storageState"
  - "playwright.config.ts gains `workers: 1` — `fullyParallel: false` serialises tests within a file and says nothing about files, and this phase ends with four spec files sharing one purge prefix"
  - "playwright.config.ts gains `testIgnore: /.*-member\\.spec\\.ts/` on the chromium project — it had no testMatch, so it also ran member specs under the ADMIN session"
  - "`[data-slot=\"alert\"]` from the plan was replaced with `[role=\"alert\"]:not(#__next-route-announcer__)` — the specified selector matches nothing in this repo and was unfalsifiable"
  - "The DEAD_STAGE board is the SMALLEST non-empty pipeline, not the largest: the largest takes 88 seconds to render and nothing in the file asserts a card"
  - "The session assertion is beforeEach rather than the plan's beforeAll — beforeAll cannot see the project storageState, and beforeEach is strictly stronger"

patterns-established:
  - "Before blaming your own change for a red pre-existing test, restore the base file with `git checkout <base> -- <file>` and re-measure. D-40-4 was proven pre-existing that way in 23 seconds."
  - "A harness fix is worth more than the guard that caught it, but ship both: the member spec's own session check is what turned the config defect red, and it stays."

requirements-completed: [VIEW-02]

# Metrics
duration: 100min
completed: 2026-08-22
---

# Phase 40 Plan 16: Private Visibility, Both Directions, and the Degraded-Read Gate Summary

**Criterion 2 is now proved on a screen and not only in a `WHERE` clause — in both directions, on
both disclosure surfaces, with a positive companion beside every absence — and all four absence
assertions were turned RED by probes that were actually run. The work also found two harness defects
that had been silently running the member specs as an admin, and two product defects it did not own.**

## Performance

- **Duration:** ~100 min
- **Tasks:** 2 of 2
- **Docker rebuilds spent:** **0** — nothing in `src/` was changed, and the container served the same
  image throughout. Every negative probe is a fixture flip, which is why none was needed.
- **Files created:** 3 specs. **Modified:** `e2e/views-fixtures.ts`, `playwright.config.ts`,
  `deferred-items.md`.

## The headline numbers

| | |
|---|---|
| Full Playwright suite, run 1 | **68 passed, 1 failed** (5.1m) |
| Full Playwright suite, run 2 | **68 passed, 1 failed** (5.1m) — identical |
| The 1 failure | `deals-drag.spec.ts` SC-5, **pre-existing**, proven so against the base config (D-40-4) |
| `saved-views-320.spec.ts` alone | **24 passed** — 40-15's file byte-unchanged |
| `npx vitest run` | **3791 passed / 28 skipped / 3819 total** — unchanged |
| `npx tsc --noEmit` | clean |
| `npx eslint .` | **0 errors**, 125 pre-existing warnings |
| Production counts after | **46054 / 38348 / 25195 / 79022** — unchanged |
| `saved_views` after | **0 rows** (`[e2e]%` and total) · `saved_view_defaults` **0 rows** |

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | V-40-8 — private visibility in both directions | `4cf8f52` | `e2e/saved-views-visibility-member.spec.ts`, `e2e/saved-views-visibility-admin.spec.ts`, `e2e/views-fixtures.ts`, `playwright.config.ts` |
| 2 | V-40-9 — the degraded-read gate | `e13eab1` | `e2e/saved-views-degraded.spec.ts`, `deferred-items.md` |

---

## THE TWO HARNESS DEFECTS, AND THE ONE THAT MATTERED

### H-1. The `chromium` project was running the member specs under the ADMIN session

`playwright.config.ts` narrowed `chromium-member` to `*-member.spec.ts`, and its comment explains
why at length. It never narrowed the DEFAULT project, which declares no `testMatch` and therefore
inherits the whole of `testDir`. So the moment a `*-member.spec.ts` file existed it matched **both**
projects and ran twice — once as the member and once as the admin.

Caught the first time both visibility specs ran together, **by the spec's own session guard**:

```
  2) [chromium] › e2e/saved-views-visibility-member.spec.ts:251:5 › the session under test is the
     seeded MEMBER and is refused at /admin/audit for being one

    at e2e/saved-views-visibility-member.spec.ts:149:9
```

This is T-40-76 firing for real, and it is the single most important result in this plan. Under the
admin storageState, "the admin's private view is absent from a MEMBER's picker" would have been
asserted by the admin who owns it. It did not go silently green because the file asserts its own
session identity before it asserts anything else.

**Fixed:** `testIgnore: /.*-member\.spec\.ts/` on the `chromium` project. The guard stays anyway —
the harness is fixed so the guard does not have to be the only thing standing between this phase and
a fraudulent proof.

### H-2. `fullyParallel: false` does not serialise FILES

The config's own comment says "One app instance and one shared database, so specs must not race each
other." `fullyParallel: false` does not deliver that: it serialises tests *within* a file. On this
4-core machine Playwright reports `Running 6 tests using 2 workers`, and files are distributed across
them. Harmless while exactly one spec file wrote `saved_views`; this phase ends with four, all
purging by the same `[e2e] View%` prefix.

**Measured**, running the two visibility specs together before the fix:

```
  3) [chromium-member] › e2e/saved-views-visibility-member.spec.ts:298:5 › the MANAGE DIALOG hides it
     too — a view absent from the picker but listed in Manage is still disclosed

    Error: MANAGE DIALOG: ANTI-VACUITY COMPANION — the admin's SHARED view must be visible to the
    member here. If it is not, this surface is empty and the absence assertion below proves nothing
    (listVisibleViews catches its own errors and returns []).

    Locator: getByRole('dialog').getByText('[e2e] View visibility ADMIN_SHARED', { exact: true })
    Expected: visible
    Error: element(s) not found
```

The sibling file's `afterAll` purge, arriving between this file's seed and its assertion. Note that
the assertion which caught it is the **anti-vacuity companion**, not the absence assertion — without
the companion this race would have made the privacy claim pass.

**Fixed:** `workers: 1`. Cost: the full suite goes from ~2.5m to 5.1m. What it buys is that a red run
means a defect.

---

## V-40-8 — CRITERION 2, BOTH DIRECTIONS

### The fixtures

Three views on `entityType: "organization"` (the only surface with nothing droppable, so a
degradation notice cannot be mistaken for a visibility result), declared once in
`e2e/views-fixtures.ts` and shared by both specs:

| Fixture | owner | shared | filters |
|---|---|---|---|
| `[e2e] View visibility ADMIN_PRIVATE` | `pipelite-e2e@local.test` (admin) | no | `{search: "adminprivate"}` |
| `[e2e] View visibility ADMIN_SHARED` | `pipelite-e2e@local.test` (admin) | **yes** | `{search: "adminshared"}` |
| `[e2e] View visibility MEMBER_PRIVATE` | `pipelite-e2e-member@local.test` (member) | no | `{search: "memberprivate"}` |

**Why the triad is in `views-fixtures.ts` and not exported from the member spec** — the plan asked
for the choice to be made explicitly. A Playwright spec that imports another spec **registers that
file's tests into itself**, so importing the member spec from the admin spec would have run every
member assertion under the admin project's storageState: the same failure H-1 turned out to be, this
time introduced through the import graph. `views-fixtures.ts` is deliberately not a spec and cannot
be collected by any project.

### The member direction — 6 tests green

```
[40-16 member] session confirmed: pipelite-e2e-member@local.test, role=member, refused at /admin
[40-16 member] PICKER | ADMIN_SHARED visible, MEMBER_PRIVATE visible, ADMIN_PRIVATE absent
[40-16 member] MANAGE DIALOG | ADMIN_SHARED visible, MEMBER_PRIVATE visible, ADMIN_PRIVATE absent
[40-16 member] MANAGE ROWS | ADMIN_SHARED: readOnly, no share switch, no delete, default switch live | MEMBER_PRIVATE: share switch + delete present
[40-16 member] G-7 | landed on http://localhost:3001/organizations?search=adminshared&view=20ce7f7b-8a62-45ed-96cb-0321cb01383f with the picker reading "[e2e] View visibility ADMIN_SHARED" — a member's default is a colleague's shared view
[40-16 member] afterAll purge removed 3 views / 1 defaults; 0 prefixed rows remain
```

### The admin direction — 5 tests green, and this is the half that departs

```
[40-16 admin] session confirmed: pipelite-e2e@local.test role=admin, /admin/audit renders; pipelite-e2e-member@local.test role=member
[40-16 admin] PICKER | ADMIN_PRIVATE visible, ADMIN_SHARED visible, MEMBER_PRIVATE absent
[40-16 admin] MANAGE DIALOG | ADMIN_PRIVATE visible, ADMIN_SHARED visible, MEMBER_PRIVATE absent
[40-16 admin] MANAGE ROWS | the admin's own rows are editable; no control exists for MEMBER_PRIVATE's id
[40-16 admin] afterAll purge removed 3 views / 0 defaults; 0 prefixed rows remain
```

The admin spec also asserts the OTHER account's role is `member`, so "a member's private view" cannot
quietly become "a second admin's private view", and it asserts that the admin's own rows DO carry a
share switch — `canEdit: isOwnedByViewer || isAdmin` is a real admin branch about mutation, and the
absence result must not be read as "admins have no powers over views". Visibility and mutation are
separate questions and only visibility departs from the idiom.

### G-7 — criterion 3 across an ownership boundary

The member toggles the default switch on the ADMIN's shared row, gets `views.manage.saved`, then
loads a bare `/organizations` and is redirected. Asserted by **parsing** the URL, never by comparing
it — plan 40-18 made `resolveDefaultViewRedirect` name its view, so the landing carries two facts:

- `search=adminshared` — the view's stored filters
- `view=20ce7f7b-…` — the selection

and then the half that `view=<id>` actually buys, read off the screen rather than off the URL: the
picker trigger reads `[e2e] View visibility ADMIN_SHARED` and **not** `All records`. A
filters-only assertion would have missed exactly that.

### THE FOUR ANTI-VACUITY PROBES — RUN, WITH VERBATIM FAILURES

`E2E_VIEWS_PROBE=share-private` flips both private fixtures to `isShared: true`. Every absence
assertion must then go red. All four did.

**1. Member direction, PICKER:**

```
  1) [chromium-member] › e2e/saved-views-visibility-member.spec.ts:276:5 › the PICKER hides the
     admin's private view from a member — with both companions present in the same open menu

    Error: PICKER: THE ADMIN'S PRIVATE VIEW IS DISCLOSED TO A MEMBER. Criterion 2 is broken —
    visibleViewsPredicate() is "ownerId = viewer OR isShared" and this row satisfies neither. Two
    other fixture views are visible in this same container, so this is a real absence failure and
    not an empty surface.

    expect(locator).toHaveCount(expected) failed

    Locator:  getByRole('menu').getByText('[e2e] View visibility ADMIN_PRIVATE', { exact: true })
    Expected: 0
    Received: 1
    Timeout:  5000ms
```

**2. Member direction, MANAGE DIALOG:**

```
    Error: MANAGE DIALOG: THE ADMIN'S PRIVATE VIEW IS DISCLOSED TO A MEMBER. …

    Locator:  getByRole('dialog').getByText('[e2e] View visibility ADMIN_PRIVATE', { exact: true })
    Expected: 0
    Received: 1
```

**3. Admin direction, PICKER — the departing one:**

```
  1) [chromium] › e2e/saved-views-visibility-admin.spec.ts:226:5 › the PICKER hides a member's
     private view from an ADMIN — the departure from `owner || role === admin`

    Error: PICKER: A MEMBER'S PRIVATE VIEW IS VISIBLE TO AN ADMIN. listVisibleViews() has grown an
    admin branch. This app's idiom is `owner || role === "admin"` (src/app/deals/actions.ts:83,
    locked for Trash in 37-CONTEXT.md:31) and Decision 3 DELIBERATELY BREAKS IT HERE, because
    "private" that an admin can read is not private. Two admin-owned fixture views are visible in
    this same container, so this is a real disclosure and not an empty surface.

    Locator:  getByRole('menu').getByText('[e2e] View visibility MEMBER_PRIVATE', { exact: true })
    Expected: 0
    Received: 1
```

**4. Admin direction, MANAGE DIALOG:**

```
    Error: MANAGE DIALOG: A MEMBER'S PRIVATE VIEW IS VISIBLE TO AN ADMIN. …

    Locator:  getByRole('dialog').getByText('[e2e] View visibility MEMBER_PRIVATE', { exact: true })
    Expected: 0
    Received: 1
```

**Every one of these is the locator the passing run uses, unchanged, on the same surface.** The only
difference between green and red is one boolean in one fixture row, which is the strongest available
statement that the gate measures visibility and not something else.

---

## V-40-9 — THE DEGRADED-READ GATE

### `find src/app -name error.tsx` — the M-14 claim, checked

```
$ find src/app -name error.tsx | wc -l
0
$ find src/app -name error.tsx
(no output)
```

`global-error.tsx` and `not-found.tsx` are absent too. **Recorded, and also asserted in-suite** —
the first test in `saved-views-degraded.spec.ts` walks `src/app` for `error.tsx`/`global-error.tsx`
and fails if one appears, because every "renders 200 with the list intact" assertion in the file was
written knowing a throw there has nowhere to be caught:

```
[40-16 degraded] error boundaries under src/app: 0 (none — M-14 holds)
```

### The fixtures — dead ids, never a deletion

**The soft-deleted user id used: `fc27b469-0a33-4ce5-9332-c165c213107c`**
(`sarah.johnson@pipelite.local`, `deleted_at = 2026-03-23 08:46:38.733`, the earliest of the six).
Read from the database at seed time, not hardcoded, so it cannot silently stop exercising its branch.

| Fixture | entity | stored filters | dropped |
|---|---|---|---|
| `DEAD_OWNER` | activity | `{owner: fc27b469-… (soft-deleted), type: "call"}` | `["owner"]` |
| `DEAD_PIPELINE` | deal | `{pipeline: 00000000-0000-4000-8000-000000000000, owner: <live>}` | `["pipeline"]` |
| `DEAD_STAGE` | deal | `{pipeline: f40cffbf-… , stage: 251ad8b5-… (a REAL stage on ANOTHER board)}` | `["stage"]` |
| `VALID_ACTIVITY` | activity | `{owner: <live>, type: "call"}` | none |
| `VALID_DEAL` | deal | `{pipeline: f40cffbf-…, stage: <that pipeline's own>}` | none |

No live pipeline, stage or user was deleted (T-40-80). The dead pipeline is an all-zero v4 uuid; the
dead stage is a real row on the wrong board, which is the cross-pipeline case a random uuid would not
exercise.

### The results — 8 tests green

```
[40-16 degraded] seeded | soft-deleted owner=fc27b469-0a33-4ce5-9332-c165c213107c | dead pipeline=00000000-0000-4000-8000-000000000000 | home pipeline=f40cffbf-a7be-409c-ab76-5877bf01f54b (SaaS kill list) | foreign stage=251ad8b5-91fe-4fd4-84f3-333f24a264c1 | fallback board="BDR - Base Fria"
[40-16 degraded] error boundaries under src/app: 0 (none — M-14 holds)
[40-16 degraded] no-Alert locator PROVED: 0 -> 1 -> 0 around an injected Alert; bare [role=alert] nodes present: []
[40-16 degraded] DEAD_OWNER | activities list rendered 50 rows
[40-16 degraded] DEAD_OWNER | 200 at http://localhost:3001/activities?type=call&view=d88aa3c0-… | notice shown | no Alert
[40-16 degraded] DEAD_PIPELINE (via picker) | board "BDR - Base Fria" rendered
[40-16 degraded] DEAD_PIPELINE (bookmarked URL) | board "BDR - Base Fria" rendered
[40-16 degraded] DEAD_PIPELINE | 200 via picker AND via /deals?pipeline=00000000-0000-4000-8000-000000000000 | board "BDR - Base Fria" | notice on both | pipelineNotFound never rendered
[40-16 degraded] DEAD_STAGE | board "SaaS kill list" rendered
[40-16 degraded] DEAD_STAGE | 200 at http://localhost:3001/deals?pipeline=f40cffbf-…&view=35946de9-… | board "SaaS kill list" | notice shown | no Alert
[40-16 degraded] VALID_ACTIVITY | activities list rendered 50 rows
[40-16 degraded] VALID_DEAL | board "SaaS kill list" rendered
[40-16 degraded] ANTI-VACUITY | valid views on /activities and /deals: notice count 0, every stored key survived
[40-16 degraded] afterAll purge removed 5 views / 0 defaults; 0 prefixed rows remain
```

**"The list rendered", named rather than inferred.** On `/activities` it is **50 rows** with
`activities.noActivitiesFound` explicitly asserted absent — not "the page did not crash". On `/deals`
it is the board: the pipeline `<Select>` names a real pipeline, which the page's `pipelineNotFound`
early-return branch structurally cannot produce because it renders no `KanbanBoard` at all.

**The bookmarked-URL arrival is a second branch, and the plan's picker-only path could not reach it.**
Selecting through the picker strips `pipeline` client-side (the bar carries the VALIDATED filters),
so `params.pipeline` is never set and `deals/page.tsx`'s own
`pipelineWasDropped && !droppedFilterKeys.includes("pipeline")` merge never runs. A bookmark or a
shared link still carries the dead id. Both arrivals are now asserted: 200, default board, notice
shown, `Pipeline not found.` never on screen.

`Pipeline not found.` is checked with `body.innerText()` and not `getByText` — 40-15 measured that
string appearing once inside the next-intl catalog blob on a page that renders no such text, so a
DOM-wide query can match a string that is not on screen.

### THE TWO DEGRADED PROBES — RUN, WITH VERBATIM FAILURES

**`E2E_VIEWS_PROBE=heal-degraded`** — DEAD_OWNER's owner becomes a LIVE user, so nothing drops:

```
  1) [chromium] › e2e/saved-views-degraded.spec.ts:603:5 › DEAD_OWNER — a view whose owner filter
     names a soft-deleted user renders 200, a list, and the notice

    Error: DEAD_OWNER: no `views.degraded` notice. The owner filter was silently dropped and the
    user is looking at a wider list than the one they saved, with nothing on screen saying so.

    expect(locator).toBeVisible() failed

    Locator: getByText('Part of this view no longer exists and was ignored.', { exact: true })
    Expected: visible
    Timeout: 5000ms
    Error: element(s) not found
```

**`E2E_VIEWS_PROBE=break-valid`** — VALID_ACTIVITY's owner becomes the soft-deleted one:

```
  1) [chromium] › e2e/saved-views-degraded.spec.ts:729:5 › ANTI-VACUITY — a fully VALID view prints
     NO notice, on both surfaces

    Error: /activities: `views.degraded` is showing over a view whose every stored key still
    resolves. A notice that never turns off is a permanent false alarm, and it would make all three
    degradation assertions above pass for free.

    expect(locator).toHaveCount(expected) failed

    Locator:  getByText('Part of this view no longer exists and was ignored.', { exact: true })
    Expected: 0
    Received: 1
```

**The same locator, both directions, one fixture field apart.** `views.degraded` is shown to appear
exactly when a key was dropped and to be absent exactly when none was.

Both probes reach the assertion they are aimed at because the tests were **reordered to assert the
subject first** and the URL preconditions after. In the first version the URL checks came first and
each probe was caught by a precondition instead — a red run, but not the red run that establishes
anything.

### The no-Alert locator: TWO vacuity traps, both closed

**Trap 1 — the plan's selector matches nothing in this repo.** The plan specified
`page.locator('[data-slot="alert"]')`. `src/components/ui/alert.tsx` is the older `forwardRef`
shadcn build: it emits `role="alert"` and **no `data-slot` at all**. `grep -rn 'data-slot="alert"' src/`
returns zero matches. That assertion could never have matched anything, on any page, ever — it would
have passed with a full-width destructive Alert sitting over the list.

**Trap 2 — a bare `[role="alert"]` matches a Next.js internal.** Probed directly:

```json
{
 "before": 0,
 "during": 1,
 "after": 1,
 "html": ["<div aria-live=\"assertive\" id=\"__next-route-announcer__\" role=\"alert\" style=\"position: absolute; …\"></div>"]
}
```

Next injects `#__next-route-announcer__` — a visually-hidden 1x1 live region — **after the first
client-side navigation**, which is what every test in this file does. A bare `[role="alert"]`
count-0 assertion therefore fails on every degraded page for a reason unrelated to Alerts, and the
dangerous outcome is not the red run but the "fix" it invites.

**Resolved to `[role="alert"]:not(#__next-route-announcer__)`, then PROVED.** The first test injects a
node carrying exactly what the Alert primitive renders for `variant="destructive"` and requires both
locators to find it:

```
[40-16 degraded] no-Alert locator PROVED: 0 -> 1 -> 0 around an injected Alert; bare [role=alert] nodes present: ["__next-route-announcer__"]
```

The exclusion is also **audited**: whatever the bare selector still sees must be the route announcer
and nothing else, so `:not(...)` cannot quietly grow to cover a real Alert.

---

## Fixture hygiene

Every fixture row carried `VIEWS_FIXTURE_PREFIX` (enforced by `insertViewFixture`, which throws
otherwise) and every spec purged by that prefix in `beforeAll` **and** `afterAll`, asserting the
remaining count AFTER the mutation (39-19's teardown-ordering rule). Both full-suite runs ended with
every file reporting `0 prefixed rows remain`.

Database after the final run:

```
orgs|people|deals|acts|e2e_views|all_views|defaults|users|pipelines|stages
46054|38348|25195|79022|0|0|0|10|12|73
```

**46054 / 38348 / 25195 / 79022 — unchanged.** `saved_views` is empty in total, not merely free of
prefixed rows. `saved_view_defaults` is empty. Users, pipelines and stages are untouched; nothing was
deleted, soft-deleted or restored.

`npm run test:db` was **not** run. It shells `scripts/dedup-db-test-setup.sh`, which drops and
recreates a database, and nothing in this plan needed it.

---

## Deviations from Plan

### 1. [Rule 3 — Blocking] `playwright.config.ts` ran member specs under the admin session

- **Found during:** Task 1, the first run of both visibility specs together.
- **Issue:** the `chromium` project declares no `testMatch` and inherits all of `testDir`, so
  `*-member.spec.ts` matched both projects. Full text in **H-1** above.
- **Fix:** `testIgnore: /.*-member\.spec\.ts/`.
- **Commit:** `4cf8f52`.

### 2. [Rule 3 — Blocking] `fullyParallel: false` does not serialise files

- **Found during:** Task 1, same run.
- **Issue:** two workers, one shared purge prefix, four spec files. One file's `afterAll` deleted a
  sibling's fixtures mid-test. Verbatim failure in **H-2**.
- **Fix:** `workers: 1`, with the measurement recorded in the config beside it.
- **Commit:** `4cf8f52`.

### 3. [Rule 1 — Bug, in the plan's own assertion] `[data-slot="alert"]` is unfalsifiable here

- **Found during:** Task 2, before writing the assertion.
- **Issue:** no `data-slot` exists anywhere in `src/`; the repo's Alert is the older forwardRef
  build.
- **Fix:** `[role="alert"]:not(#__next-route-announcer__)`, plus an injection probe that proves the
  locator works and an audit that the exclusion covers only the Next internal.
- **Commit:** `e13eab1`.

### 4. [Rule 1 — Bug, in my own gate] `waitForURL(url => url.searchParams.has("view"))` resolved instantly

- **Found during:** Task 2, first run of the degraded spec.
- **Issue:** every test enters from `?view=none`, which HAS a `view` key, so the predicate was
  already true and `page.url()` returned the pre-click address. It surfaced as
  `expect(searchParams.get("type")).toBe("call")` receiving `null` — which reads like a validator
  bug and was a harness bug.
- **Fix:** wait for `searchParams.get("view") === <this fixture's id>`. `none` is reserved by
  `parseViewSelection`, so no fixture can collide with it.
- **Commit:** `e13eab1`.

### 5. [Rule 1 — Bug, in my own gate] The DEAD_PIPELINE board was measured mid-hydration

- **Found during:** Task 2.
- **Issue:** Radix's `SelectValue` reads its label from a context only its `SelectItem`s populate,
  and those live in a `SelectContent` that is not server-rendered — so the SSR'd trigger is empty and
  fills in on hydration. Playwright's default 5s caught it empty
  (`7 × locator resolved to <button … data-slot="select-trigger"> - unexpected value ""`) while a
  direct probe of the same URL read `BDR - Base Fria` after 2.5s.
- **Fix:** a SETTLE (`not.toHaveText("")` with a 30s budget) and then the assertion, so "empty
  trigger" and "wrong board" are two different failure messages rather than one.
- **Commit:** `e13eab1`.

### 6. [Rule 1 — Bug, in my own gate] The VALID_ACTIVITY fixture made its own companion vacuous

- **Found during:** Task 2. 40-15's deviation 4, rediscovered on a different key.
- **Issue:** the surviving `owner` value was the seeded e2e admin, who owns **zero** of the 79,022
  activities. The list came back empty and "no degraded notice" was being asserted over a page with
  nothing on it.
- **Fix:** the surviving owner is read as the active user who owns the most activities (measured: all
  79,022 belong to one). Read-only use of a real row — a filter value, never a write target.
- **Commit:** `e13eab1`.

### 7. [Rule 4 — Reported, NOT acted on] The biggest deals board takes 88 seconds to render

Logged as **D-40-3**. Found while choosing a fixture pipeline; the original choice (the LARGEST
board, 15,415 deals) consumed the whole 180s test budget on one page load. Measured:

```
/deals?pipeline=8e3b92d1-… (Closer, 15,415 deals)   -> 200, h1 in 88,338 ms
/deals?view=none          (BDR, 3,754 deals)        -> 200, h1 in  5,255 ms
/deals?pipeline=f40cffbf-… (SaaS kill list, 2)      -> 200, h1 in    328 ms
```

Out of scope: it is a kanban data-loading redesign, this plan's `files_modified` is three spec files,
and nothing about it is caused by saved views. The gate renders the smallest non-empty board instead
— nothing in the file asserts a card, so a 2-deal board proves the same thing 270x faster.

### 8. [Rule 4 — Reported, NOT acted on] `deals-drag.spec.ts` SC-5 fails, and it is pre-existing

Logged as **D-40-4**, and it is the one failure in both full-suite runs. **Proven not to be ours**
rather than assumed: the base `playwright.config.ts` was restored with
`git checkout c28ac6e -- playwright.config.ts` and the spec re-run in isolation, producing a
byte-identical failure (`1 failed, 3 passed (23.1s)`). The committed config was then restored. The
file is also alphabetically first in `testDir`, so it runs before every Phase 40 spec and nothing
this phase seeds can reach it.

### 9. [Deliberate departure from the plan's wording] The session check is `beforeEach`, not `beforeAll`

The plan asked for the session assertion in `beforeAll`. `beforeAll` cannot make it: Playwright hands
it a `browser`, not a `page`, and a context minted from that browser does **not** inherit the
project's `storageState` — the check would run anonymously and prove nothing about the session the
tests use. `beforeEach` receives the real, project-configured page and verifies every test in the
file rather than one test's worth at file start. This is the guard that caught H-1.

### 10. [Deliberate scope addition] The bookmarked dead-pipeline URL

The plan's degraded cases all arrive through the picker. That path can never reach
`deals/page.tsx`'s `pipelineWasDropped` merge, because the picker strips the dead key client-side. A
second navigation to `/deals?pipeline=<dead uuid>` was added so Decision 4 is proved on the input it
was written for. (Rule 2 — the branch would otherwise have been untested while looking tested.)

---

## What plan 40-17 inherits

- Criterion 2 is closed in both directions on both surfaces, with running non-vacuity proofs.
- Criterion 3's degraded landing is closed on three degradation kinds and two arrival paths.
- The suite is now serialised (`workers: 1`) and the member project is exclusive. A full run is
  ~5.1 minutes and ends **68 passed, 1 failed** — the failure being D-40-4, which 40-17 should
  either fix or hand on rather than rediscover.
- The dark-mode pass, the backlog entry and the human checkpoint remain 40-17's, untouched here.

## Self-Check: PASSED

Files:

```
FOUND: e2e/saved-views-visibility-member.spec.ts
FOUND: e2e/saved-views-visibility-admin.spec.ts
FOUND: e2e/saved-views-degraded.spec.ts
FOUND: e2e/views-fixtures.ts
FOUND: playwright.config.ts
FOUND: .planning/phases/40-saved-views-shared-filters/deferred-items.md
```

Commits:

```
FOUND: 4cf8f52  test(40-16): V-40-8 — private visibility proven in both directions, live
FOUND: e13eab1  test(40-16): V-40-9 — the degraded-read gate, three degradations plus its companion
```

## Known Stubs

None. This plan adds no product code and no component; all three artifacts are executable gates that
run against the live application and the live database.

## Threat Flags

None. No new network endpoint, auth path, file access pattern or schema change. The only mutations
this plan makes are prefix-scoped `saved_views` / `saved_view_defaults` fixture rows, all reclaimed
(verified: `saved_views` totals 0 rows after the final run).
