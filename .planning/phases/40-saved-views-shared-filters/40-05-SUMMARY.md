---
phase: 40-saved-views-shared-filters
plan: 05
subsystem: lib
tags: [saved-views, visibility, authorization, degraded-read, input-validation, pure-functions, vitest, tdd, drizzle, postgres]

# Dependency graph
requires:
  - phase: 40-saved-views-shared-filters
    plan: 01
    provides: "src/lib/views/url-params.ts — pickFilterParams, filtersToSearchParams (canonical whitelist ORDER, which is what makes the URL-vs-blob comparison a string comparison), hasSaveableFilter/hasExportableFilter, VIEW_ESCAPE_KEY/VALUE; and src/lib/views/types.ts with the eight-prop SavedViewsBarProps contract"
  - phase: 40-saved-views-shared-filters
    plan: 02
    provides: "saved_views / saved_view_defaults tables, and the _relations.ts `owner` relation registered specifically so attribution is not one query per view"
  - phase: 39-duplicate-detection-merge
    provides: "vitest.db.config.ts + scripts/dedup-db-test-setup.sh — the isolated pipelite_dedup_test project, which is what let the visibility property be proved against real SQL instead of a mock"
  - phase: 37-trash-soft-delete
    provides: "37-CONTEXT.md:31 — the locked `owner || role === \"admin\"` idiom that this plan deliberately departs from"
provides:
  - "validateStoredFilters — the non-throwing read-side validator; drops owner/assignee/pipeline/stage/type/status/date keys whose target no longer exists, reports them, never throws"
  - "listVisibleViews / readDefaultViewForUser — visibility scoping with NO admin branch, enforced as a SQL predicate"
  - "visibleViewsPredicate — the visibility rule as ONE exported expression, compiled-SQL assertable"
  - "validateVisibleViews / selectViewForParams / computeIsModified / redirectTargetFor — the four pure decisions behind the eight bar props"
  - "resolveSavedViewsBarProps / resolveDefaultViewRedirect — the async wrappers the four host pages will call"
  - "queries.db.test.ts — the both-directions private-view proof against real PostgreSQL (28 assertions)"
affects: [40-06, 40-07, 40-08, 40-09, 40-13, 40-14]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Catalog-as-value-object: the validator takes an already-fetched ViewFilterCatalog instead of a db handle, which is what makes it pure, unit-testable with no mock, and one catalog read per request rather than N"
    - "Compiled-SQL assertion (.toSQL()) as the gate for 'the predicate is in the WHERE': survives comment rewrites, unlike a source grep, and catches a post-fetch filter that a behavioural test cannot see"
    - "Lazy `await import(\"@/db\")` inside async wrappers so the pure half of a module stays importable in the base vitest project (which runs in CI with no database)"
    - "Making the wrong thing unrepresentable: ValidatedView carries only the validated filter set, so comparing against the raw blob is a type error rather than a discipline"

key-files:
  created:
    - src/lib/views/validate.ts
    - src/lib/views/queries.ts
    - src/lib/views/resolve.ts
    - src/lib/views/__tests__/validate.test.ts
    - src/lib/views/__tests__/resolve.test.ts
    - src/lib/views/queries.db.test.ts
  modified: []

key-decisions:
  - "The visibility predicate has no admin branch, and it is defined exactly ONCE (visibleViewsPredicate) so both reads share it and it is reachable by a compiled-SQL test"
  - "droppedKeys reports a key that is in THIS entity's whitelist, was present in the blob, and is absent from the result — so `page` and a stale `industry` are never reported, and views.degraded cannot fire on an intact view"
  - "computeIsModified takes entityType EXPLICITLY, deviating from the plan's signature; deriving it from the selected row fails silently when the discriminator disagrees"
  - "validateVisibleViews is exported as the testable seam, which is what makes 'the comparison uses the validated set' assertable with no database"
  - "A stage is validated against its SURVIVING pipeline's stages; only when no pipeline survives is the union used. The catalog's stage query joins pipelines, so an orphaned stage cannot pass the union check either"
  - "Active users are `deletedAt IS NULL` WITHOUT the `status = 'approved'` predicate the bulk-owner picker uses: that picker chooses a write target, this is a read filter"

patterns-established:
  - "Named-defect tests: four assertions carry the name of the regression they exclude, so a green run is a claim about specific defects rather than a mood"
  - "Every negative probe is RUN, must fail BY NAME, and is then restored — nine probes, recorded below with their exact failing test names"
  - "Replacing a plan's raw-token grep criterion with a parsed/compiled-structure assertion, and saying so"

requirements-completed: [VIEW-01, VIEW-02]

# Metrics
duration: 78min
completed: 2026-08-21
---

# Phase 40 Plan 05: The Read Layer Summary

**Visibility scoping with no admin branch (proved from both directions against real PostgreSQL), a validator that drops dead stage/owner/assignee/pipeline ids without ever throwing, and all eight `SavedViewsBar` props computed server-side from four pure functions.**

## Performance

- **Duration:** ~78 min
- **Tasks:** 3 of 3, plus one added verification artifact
- **Files created:** 6 (3 source, 3 test)
- **Assertions:** 540 unit (48 validate + 32 resolve + 460 pre-existing url-params) and 28 database-backed
- **Full suite:** 3303 passed / 21 skipped, plus 8 RSC — green
- **typecheck:** 0 errors · **lint:** 0 errors (125 pre-existing warnings, none in these files)

## Accomplishments

### Task 1 — `validateStoredFilters` (RED → GREEN)

RED recorded first: the suite failed to collect (`Cannot find module '../validate'`), 1 failed suite / 0 tests.
GREEN: 48 assertions.

`validateStoredFilters(entityType, filters, catalog)` runs `pickFilterParams` first, then existence-checks
what survives: `owner`/`assignee` against active users, `pipeline` against live pipelines, `stage` against
its surviving pipeline's stages, `type` against activity types, `status` against the three frozen literals
`activity-filters.tsx:184-186` writes, and the dates against `/^\d{4}-\d{2}-\d{2}$/` **plus** `Date.parse`.
`search` is never dropped.

Both halves of the date gate are load-bearing and each alone is insufficient — measured:
`Date.parse("1")` is `978314400000` (the year 2001), so a finiteness check alone carries `?dateFrom=1`
into a `gte()`; and the regex alone accepts `"2026-13-01"`, which `Date.parse` reports as `NaN` and which
becomes the `Invalid Date` that is a 500 on a route with no `error.tsx`. `"2026-02-30"` is deliberately
accepted (V8 rolls it to March 2 — a real instant; the gate exists to stop `Invalid Date`, not arithmetic).

The header states, in the file, that this validates **shape and existence, never effectiveness** — so
`status=overdue` and the activity dates survive even though they narrow nothing in SQL today (A8; plan
40-13 owns the list side). Dropping them here would silently delete a filter the user set and the chip
row still displays.

### Task 2 — `listVisibleViews` / `readDefaultViewForUser`

Visibility is `and(entityType, or(ownerId = viewer, isShared))` **in SQL**, with no admin branch, and the
file says at length why: it departs from `src/app/deals/actions.ts:88`'s `owner || role === "admin"` idiom
(locked for Trash at 37-CONTEXT.md:31), because a private view an admin can read is not private. The
accepted A6 consequence — a soft-deleted user's private views are unreachable by anyone, forever — is
recorded in the source with "do NOT add a special case to expose them".

The one admin branch in the file is `canEdit`, which is mutation and not visibility.

`readDefaultViewForUser` carries the same predicate in an `innerJoin` **condition** (not a `with:` on the
relational builder, whose `with` predicate is applied after the parent row is fetched), so an unshared
view stops being reachable through a stale defaults row.

Attribution uses the 40-02 `owner` relation: `name || email`, `null` when soft-deleted.

### Task 3 — `resolve.ts` (RED → GREEN)

RED recorded: suite failed to collect (`Cannot find module '../resolve'`).
GREEN: 32 assertions.

Four pure exported decisions plus two thin async wrappers. `organization` and `person` issue **zero**
catalog queries (they carry one `search` param, which references nothing deletable). The deal catalog's
stage query joins `pipelines`, so a stage orphaned by a deleted pipeline cannot pass the union check.

`redirectTargetFor` returns `null` for an empty validated set — which is how U-2's promise is kept rather
than asserted: a bare-path redirect would land on the same "no params at all" guard that just fired.

## Deviations from Plan

### 1. [Rule 2 — missing critical verification] Added `queries.db.test.ts`

**Found during:** Task 2.
**Issue:** The plan's gate for the phase's load-bearing security property was
`grep`-shaped ("`listVisibleViews`'s where clause contains no `admin`"), and the plan scoped unit tests to
"the two that are testable without a database". That leaves criterion 2 — a negative property — with no
behavioural assertion at all. A mocked `@/db` cannot prove it: delete the `or(...)` and the mock still
never returns the private row.
**Fix:** A 28-assertion suite in the **isolated** `pipelite_dedup_test` database (never the dev one),
asserting from **both** directions: the owner sees their private view; a different member does not; **an
admin does not**. Every negative carries a positive on the same read, so an empty result cannot satisfy it.
**Commit:** `f097b5b`

### 2. [Rule 1 — the plan's own criterion was the trap it warned about] `grep -c "@/db" validate.ts` reads 1, not 0

**Found during:** Task 1.
**Issue:** The plan's done criterion is a raw-token grep. It returns **1** against a correct implementation,
because the module header contains the sentence *forbidding* that import. This is the Phase 39 trap class
exactly: the comment explaining a rule trips its own gate, and the edit that satisfies the grep is
**deleting the explanation**.
**Fix:** Replaced with a parsed-import assertion over the module's import specifiers (comments stripped).
Proved it fires: probe 4 added a real `import { db } from "@/db"` and both assertions failed, while the
prose mentioning `@/db` does not trip it. The gate also carries a self-test that its own detector works on
a synthetic source.
**Commit:** `9a06a94`

### 3. [Rule 1 — silent-failure API] `computeIsModified` takes `entityType` explicitly

**Found during:** Task 3, by two red tests.
**Issue:** The plan's signature is `computeIsModified(selectedViewId, urlFilters, validatedViews)`, which
means reading the whitelist off `selected.summary.entityType`. When that discriminator disagrees with the
list being rendered, the wrong whitelist picks **both** sides down to `{}`, the two compare equal, and the
function returns a confident `false`. Found in fixtures, which is the cheap place.
**Fix:** `entityType` is the first parameter, matching `selectViewForParams` and `redirectTargetFor`.
**Commit:** `d90ed4c`

### 4. [Rule 3 — blocking] `@/db` and `./queries` are imported lazily in `resolve.ts`

**Found during:** Task 3. `@/db` throws at module evaluation when `DATABASE_URL` is unset, which is the
state of the base vitest project (it runs in CI with no database). A top-level import made the four **pure**
functions unimportable, so `resolve.test.ts` could not collect — defeating B-2 reason 3 ("it is gateable").
**Fix:** `await import("@/db")` / `await import("./queries")` inside the wrappers, the pattern
`src/db/schema/saved-views.test.ts` already uses. The `organization`/`person` early return happens *before*
the import, so those two surfaces never evaluate `@/db` at all.

### 5. [Design improvement] One `visibleViewsPredicate`, shared by both reads

Both reads apply the same rule; two copies of a security control is the defect class `url-params.ts` exists
to avoid one layer up. One definition also makes the rule reachable by a compiled-SQL test (see Finding 1).

## Findings for later plans

### FINDING 1 (important) — `isModified` is unreachable through the wired path

`selectedViewId` is produced by exact equality between the URL and a view's validated filters;
`computeIsModified` then compares those same two sets. So **`isModified` is structurally always `false`**
once the two are composed. Verified empirically, not reasoned: a probe over 10 URLs × 3 stored views
(including a degraded one) produced 2 selections and **zero** cases of `selected && modified`.

Consequence: UI-SPEC's state-matrix rows "A view selected, modified, editable" and "…not editable" — and
therefore slot 2's `views.saveChanges` resolution (B-5) and the save dialog's target `RadioGroup` (S-3/S-4) —
are **not reachable**. A user who opens a view and tweaks a filter sees "All records" and can only save a
NEW view.

This is a phase-level gap, not a defect in these three files: reaching that state needs the URL to carry the
selected view's identity (e.g. `?view=<id>` alongside the escape's `?view=none`), which is a change to the
**merged, shared** `url-params.ts` URL contract, to V-9, and to six gated call sites. I deliberately did not
make it — 40-01 is merged and three siblings are running. `computeIsModified` is implemented, correct and
tested against both outcomes, so it is ready the moment a selection carrier exists. **Owner: whichever of
40-08 / 40-14 owns the URL contract.**

### FINDING 2 — the behavioural suite cannot see a post-fetch filter

Measured (probe 7): moving the visibility predicate out of the `where` into `rows.filter(...)` leaves **all
25** behavioural assertions green, because the caller receives the same list either way. T-40-17's actual
claim is about what was *fetched*, so it now has a `.toSQL()` gate; re-run as probe 7b, that gate failed.
Residual gap, stated plainly: the compiled-SQL gate proves the predicate is a `WHERE`, and the call-site
usage rests on there being exactly one definition of it, not on an assertion.

### FINDING 3 — the user table has drifted from every document in this phase

Measured this session: **10 users, 4 live and 6 soft-deleted** — not the 9 (3 live) that 40-CONTEXT A5, the
UI-SPEC and this plan's own interfaces table all state. The extra live account is
`pipelite-e2e-member@local.test`. Live users with `name = NULL` is therefore **2 of 4**, not 2 of 3. The
`name || email` fallback is still the common path, so nothing in this plan changes; later plans quoting "3
live users" should re-measure.

### FINDING 4 — `activities/page.tsx` does handle `pending`/`overdue`

This plan's interfaces table says only `completed` is applied. In fact `page.tsx:181-183` handles `pending`
and `overdue` too — in JavaScript, after the `limit` slice, which is amendment A8's finding and the reason
they narrow nothing. The table's "filters nothing today" conclusion is right; its stated mechanism is not.

## Negative Proofs — all nine RUN, each failing BY NAME, then restored

| # | Defect injected | Failed by name | Discrimination |
|---|---|---|---|
| 1 | `owner`/`assignee` no longer checked against `userIds` | "fails if `owner` stops being checked against `catalog.userIds`" | 7 failed / 41 passed |
| 2 | `status` accepts an arbitrary string | "fails if `status` accepts an arbitrary string" | **1 failed only** — exact |
| 3 | `isValidDate` keeps only the `Date.parse` half | "fails if `dateFrom` accepts a value `Date.parse` likes but the regex does not" | **1 failed only** — exact |
| 4 | a real `import { db } from "@/db"` added | both import-gate assertions | 2 failed; the prose mentioning `@/db` does **not** trip it |
| 5 | validator drops every key unconditionally | all three anti-vacuity tests | 17 failed / 31 passed |
| 6 | `owner \|\| role === "admin"` restored in the `where` | "an ADMIN does not see it either — Decision 3…" (+2 admin tests) | 3 failed / 22 passed |
| 7 | predicate moved from `WHERE` to a post-fetch `.filter()` | **nothing — 25/25 passed** | see Finding 2 |
| 7b | same, against the added compiled-SQL gate | "compiles to a WHERE naming owner_id and is_shared" (+2) | 3 failed / 25 passed |
| 8 | `redirectTargetFor` no longer refuses an empty set | "returns null for a default whose every filter was dropped, so a bare URL cannot loop" | 4 failed / 28 passed |
| 9 | `validateVisibleViews` keeps the RAW stored filters | "fails if the comparison uses the raw stored blob instead of the validated set" | 5 failed / 27 passed |
| 10 | `?view=none` ignored + tiebreak replaced by array order | the `view=none` test + all three tiebreak tests | 4 failed / 28 passed |
| 11+12 | `selectViewForParams` always `null`; `computeIsModified` always `false` | both anti-vacuity tests | 9 failed / 23 passed |

Probe 7 is reported as a **failure of the gate, not of the code** — that is why 7b exists.

## Tiebreak rule implemented

When several views match the URL: **owned before shared**, then **`name` ascending**, then **`id` ascending**.
Asserted in both input orders at each level, so the result is the rule and not the array order. The `id`
level is a determinism backstop only — `(ownerId, entityType, name)` is unique in the database, so two of a
viewer's own views cannot share a name.

## Database

Isolated `pipelite_dedup_test` only; fixtures prefixed `viewsdbt-`, hard-deleted in FK order, with an
`afterAll` count-parity check.

**Dev row counts, before and after — identical:**
`organizations=46054 · people=38348 · deals=25195 · notes=75236 · activities=79022 · audit_log=213 ·
saved_views=0 · saved_view_defaults=0 · users=10`

Zero `viewsdbt-%` rows in `pipelite`. No migration generated — journal still ends at **idx: 18**
(`0018_adorable_smasher`). No dependency change, no Docker rebuild, no `sudo`.

## Ownership boundaries respected

Files changed: only `src/lib/views/{validate,queries,resolve}.ts`, their two `__tests__/` files, and
`queries.db.test.ts`. No edit to `e2e/**`, `playwright.config.ts`, `url-params.ts`, `actions.ts`, or
`src/lib/export/**`. `pickFilterParams`, `filtersToSearchParams`, `hasSaveableFilter`,
`hasExportableFilter`, `VIEW_ESCAPE_KEY` and `VIEW_ESCAPE_VALUE` are all consumed from the merged module —
nothing reimplemented.

## Known Stubs

None. Every exported function is fully implemented. `isModified` always resolving to `false` is not a stub
— the function is complete and tested; what is missing is a URL-level selection carrier owned by another
plan (Finding 1).

## Threat Flags

None. No new network endpoint, no new auth path, no file access and no schema change. `resolve.ts`
deliberately carries no `"use server"`, so nothing here is a POST endpoint.

## Next Steps

1. **Decide Finding 1** before 40-08/40-14 wire the pages, or `views.saveChanges` ships unreachable.
2. Wiring plans call `resolveSavedViewsBarProps({ entityType, viewer, rawSearchParams })` for the props and
   `resolveDefaultViewRedirect(entityType, viewer)` for the bare-URL redirect; a `null` from the latter means
   "do not redirect".
3. `/deals` gets its Decision 4 fallback for free — a dead `pipeline` key is dropped, which puts
   `deals/page.tsx:76-91` on its default-board branch instead of `pipelineNotFound`.

## Commits

| Commit | What |
|---|---|
| `db8a51b` | `test(40-05)` RED — validate gate, suite does not collect |
| `9a06a94` | `feat(40-05)` GREEN — `validateStoredFilters` |
| `3fd5d74` | `feat(40-05)` — `listVisibleViews` / `readDefaultViewForUser` |
| `f097b5b` | `test(40-05)` — the both-directions visibility proof + `visibleViewsPredicate` |
| `ebe069e` | `test(40-05)` RED — resolver gate, suite does not collect |
| `d90ed4c` | `feat(40-05)` GREEN — `resolve.ts` |

## Self-Check: PASSED

All 7 files verified present on disk (`src/lib/views/{validate,queries,resolve}.ts`,
`src/lib/views/__tests__/{validate,resolve}.test.ts`, `src/lib/views/queries.db.test.ts`, this SUMMARY).
All 6 commits verified in `git log`. Working tree clean. Journal at idx 18. Dev row counts unchanged.
