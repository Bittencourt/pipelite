---
phase: 40-saved-views-shared-filters
plan: 07
subsystem: lib
tags: [export, csv, guard, row-cap, sql-predicates, drizzle, vitest, tdd, server-action]

# Dependency graph
requires:
  - phase: 40-saved-views-shared-filters
    plan: 01
    provides: "EXPORTABLE_FILTER_KEYS / hasExportableFilter / pickFilterParams — the two independent predicate tables this plan's guard applies and whose narrowing claim it now enforces"
  - phase: 38-bulk-actions-export
    provides: "fetchFilteredData, the filters?.ids presence-not-length guards (T-38-01), formatters-live.test.ts as the live-SQL detector, and 38-CONTEXT.md:110-116 — the unbounded-export prohibition this plan replaces with a guard"
  - phase: 35-notes
    provides: "src/lib/notes/errors.ts — the precedent for splitting constants out of a \"use server\" module, which a \"use server\" module cannot export"
provides:
  - "ExportFilters extended with search/type/status/assignee/pipeline — a saved view can now be expressed as an export"
  - "ExportOptions.maxRows — cap-and-refuse, applied before formatting; undefined preserves the admin full export exactly"
  - "fetchOrganizations/fetchPeople search predicates mirroring the list pages' or(ilike()) column sets"
  - "fetchDeals pipeline (stage-id subquery) and assignee (deal_assignees subquery) predicates, both bound-parameterised"
  - "fetchActivities type/assignee/search predicates and the three-branch status predicate over completedAt/dueDate — the A8 hole, closed on the export side"
  - "EXPORT_ROW_CAP = 50_000 and guardExportInput — the control that replaced Phase 38's admin gate"
  - "toExportFilters + VIEW_KEY_TO_EXPORT_KEY — the declared ViewFilters -> ExportFilters bridge, gated so no whitelist key can authorize and then narrow nothing"
  - "exportViewResults — the guarded, capped, non-admin-gated view export server action"
  - "the exportable-key <-> SQL-predicate invariant gate (T-40-30), parsed per fetcher from comment-stripped source"
affects: [40-08 export UI wiring, 40-10 saved-views-bar canExport, 40-13 the activities list side, the locale plan owning views.export.*]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A structural gate over parsed per-function bodies, PLUS a rendered-SQL gate over the same predicate: the first proves a key is referenced, the second proves the predicate is the right one. Probe E shows the first alone cannot catch a no-op duplicate"
    - "A declared key-mapping table with `satisfies` instead of a blanket `as` cast, so a new whitelist key is either mapped or caught — the cast would drop it silently while the guard authorized on it"
    - "Cap-and-refuse before formatting: select cap+1, compare, return before serialising. A truncated file that looks complete is worse than a refusal"
    - "Constants and sync helpers live in a plain sibling module when the action carries \"use server\" — Next 16's SWC rejects any non-async export from such a file"

key-files:
  created:
    - src/lib/export/__tests__/view-filters.test.ts
    - src/lib/export/view-export-guard.ts
    - src/lib/views/export-action.ts
  modified:
    - src/lib/export/types.ts
    - src/lib/export/formatters.ts
    - src/lib/export/formatters-live.test.ts

key-decisions:
  - "EXPORT_ROW_CAP = 50_000, chosen so the branch really fires on this data: activities (79,022) exceed it and organizations (46,054) do not. Asserted from both sides so a cap nothing can reach would fail"
  - "EXPORT_ROW_CAP and guardExportInput live in src/lib/export/view-export-guard.ts rather than in export-action.ts. A \"use server\" module may export nothing but async functions, and guardExportInput must be a sync pure function to be unit-testable as the plan's tests require. Verified in the compiler binary, not assumed"
  - "The invariant gate reads src/lib/export/formatters.ts ONLY, deliberately. Scoping it to the fetchers this plan owns is what lets it be at full strength in wave 2; widening it to activities/page.tsx would make it fail on 40-13's work"
  - "fetchActivities gained the status predicate in TASK 1 rather than task 2, because the task-1 invariant gate demands it and every commit must be green. Task 2 became the semantics half — rendered SQL per literal plus the live partition proof — which is strictly stronger than the plan's body-contains check"
  - "An unrecognised status adds NO predicate rather than falling through to `completed`. Falling through would export 74,857 rows for a typo; adding nothing exports what an unfiltered call exports, and the GUARD is what refuses an unfiltered call"
  - "toExportFilters is a declared table, not a cast: ViewFilters is Record<string,string> and ExportFilters.ids is a string[], so the two are genuinely not assignable and something has to bridge them visibly"

requirements-completed: [VIEW-03]

# Metrics
duration: 78min
completed: 2026-08-21
---

# Phase 40 Plan 07: The Guarded View Export Summary

**`ExportFilters` can now express any of the four saved views, every key that may AUTHORIZE an export is provably a SQL predicate in its own fetcher, and `exportViewResults` refuses an unfiltered request — including a pipeline-only deals view — before it reads a single row.**

## Performance

- **Duration:** ~78 min
- **Tasks:** 3 of 3
- **Assertions:** 43 in the new gate; 60 across `src/lib/export/`; 536 across `src/lib/export/` + `src/lib/views/`; 24 live
- **Full suite:** 3266 passed, 28 skipped, **0 failed** (132 files) + 8 in the `rsc` project

## What Shipped

| Task | Commit | Content |
|------|--------|---------|
| 1 | `9a2f3a7` | `ExportFilters` +5 keys, `ExportOptions.maxRows`, all six new fetcher predicates, the cap refusal, the invariant gate, live cap/admin/bulk probes |
| 2 | `69e4b2f` | Rendered-SQL assertions for the three `status` branches, the T-38-15/T-40-32 bound-parameter proofs, and the live partition proof |
| 3 | `5f00124` | `view-export-guard.ts` (`EXPORT_ROW_CAP`, `guardExportInput`, `toExportFilters`) and `export-action.ts` (`exportViewResults`) |

### The guard, stated plainly

`guardExportInput` re-derives the submitted map with `pickFilterParams` and requires
`hasExportableFilter` on the result. **No fresh non-empty test anywhere**, and `hasSaveableFilter` is
not imported. Refused, each with its own assertion: `{}`, `undefined`, `null`, a map of only
non-whitelisted keys, `{ search: "" | "   " | "\t\n" }`, an over-length value, a crafted
`entityType`, and `{ pipeline: "p1" }` on `deal`. Allowed and asserted non-vacuously: one real key on
each of the four surfaces.

`{ pipeline: "p1", owner: "u1" }` is allowed **and the returned filters still contain `pipeline`** —
narrowing preserved even though it did not authorize. That pair is the whole of E-2 in two
assertions, and probes F and G below prove it is the pair that discriminates.

### Live measurements

| Measure | Value |
|---|---|
| `status: "completed"` | **74,857** |
| `status: "pending"` | **4,165** |
| `status: "overdue"` | **4,151** |
| activities total | **79,022** |

`completed + pending === 79,022` exactly — a partition proof, so a predicate matching everything or
nothing is excluded from both sides at once. `overdue < pending`, as it must be. `pending`/`overdue`
match 40-CONTEXT's figures precisely.

`EXPORT_ROW_CAP = 50_000`, sitting between organizations (46,054) and activities (79,022), asserted
from both sides so a cap no request could reach would fail.

**Dev row counts on completion, unchanged:** organizations 46,054 · people 38,348 · deals 25,195 ·
notes 75,236 · activities 79,022 · audit_log 213 · saved_views 0 · saved_view_defaults 0.

## The structural gate and 40-13 — REPORTED, not worked around

The prompt warned the gate would fail on three `/activities` keys and that resequencing, not
relaxation, would be the answer. **It did not fail, and no relaxation was needed, because the gate is
scoped to the fetchers this plan owns.**

The plan specifies the gate as a parsed read of `src/lib/export/formatters.ts` and nothing else. That
scoping is correct rather than convenient: the claim written above `EXPORTABLE_FILTER_KEYS` is that
every key there is a predicate **in the matching `fetch*`**, and the export path is the path the
guard authorizes. All three keys hold there:

- `dateFrom` / `dateTo` were **already** real predicates in `fetchActivities` (on `dueDate`) before
  this plan — they passed in the task-1 RED run, before any implementation.
- `status` was the genuine hole, and task 1 closed it inside `fetchActivities`.

`src/app/activities/page.tsx` was **not read by the gate, not edited, and remains 40-13's work.** The
consequence, stated in the source: until 40-13 lands, the export is NARROWER than the list it claims
to match — the safe direction. No exemption was added, no assertion was loosened, and the "loosen the
table instead" escape is blocked by an exact `toHaveLength(14)` assertion on the derived pair list.

## Deviations from Plan

### 1. [Rule 3 — build-breaking constraint] `EXPORT_ROW_CAP` and `guardExportInput` cannot live in a `"use server"` file

- **Found during:** Task 3, before writing any code.
- **The plan says:** create `src/lib/views/export-action.ts` with `"use server"`, exporting
  `exportViewResults`, `EXPORT_ROW_CAP` (a number) and `guardExportInput` (a sync function).
- **Why that cannot ship:** Next.js rejects any non-async export from a `"use server"` module.
  **Verified rather than assumed** — the error string lives in the compiler binary:
  `grep -a "Only async functions are allowed to be exported" node_modules/@next/swc-linux-x64-gnu/next-swc.linux-x64-gnu.node`
  returns `Only async functions are allowed to be exported in a  file.` It would have been a build
  failure, and `npm run build` is not in this plan's verification, so it would have shipped.
- **The repo already solves this.** `src/lib/notes/errors.ts:20` exists for precisely this reason and
  says so: *"This lives outside `src/app/notes/actions.ts` because that module carries `"use server"`
  and may therefore export nothing but async functions."*
- **Resolution:** `src/lib/export/view-export-guard.ts` (a plain module inside this plan's ownership)
  holds `EXPORT_ROW_CAP`, `guardExportInput` and `toExportFilters`; `export-action.ts` carries
  `"use server"` and exports only `exportViewResults` and its result type. Every assertion the plan
  asked for still lands, including `EXPORT_ROW_CAP` being passed as `maxRows` at the one call site.
- **Deviation from `must_haves`:** the artifact row expecting `exports: ["exportViewResults",
  "EXPORT_ROW_CAP"]` from `export-action.ts` is met only for the first. The alternative — an inline
  function-level `"use server"` directive — would have kept both in one file but has no precedent in
  this repo, and `guardExportInput` must be sync to be unit-testable either way.

### 2. [Rule 1 — plan's negative proof does not discriminate] The prescribed probe was `fetchPeople`/`owner`, but `owner` is not exportable for `person`

- **Found during:** Task 1, running the probe the plan specifies.
- **The plan says:** delete `if (filters?.owner)` from `fetchPeople`, "confirm exactly one failure
  naming `person`/`owner`/`fetchPeople`".
- **What actually happened — RUN, recorded:** the invariant gate stayed **fully green, 19/19**.
  `EXPORTABLE_FILTER_KEYS.person` is `["search"]` only — Decision 1 gives `/people` exactly one
  filter — so `owner` has no row in the gate and its removal is invisible to it. (The defect was not
  invisible repo-wide: the pre-existing `formatters.test.ts` case *"person composes an id list with
  the existing owner filter"* failed. But the gate under test did not discriminate.)
- **Resolution:** ran the correct probe instead — deleting the `filters?.search` block from
  `fetchPeople` — and it discriminated exactly as intended. Both are recorded below.
- **This is the 40-01 probe-5 lesson repeating:** a probe named for a key the gate does not cover is
  a probe that proves nothing.

### 3. [Rule 1 — plan-implied assertion is wrong] `params.some(p => p instanceof Date)` fails against a correct implementation

- **Found during:** Task 2 — the assertion failed, and the implementation was right.
- **Measured:** `activities.dueDate` is `timestamp('due_date', { mode: 'date' })`, and drizzle
  0.45.1's mapper stringifies the Date to ISO **at bind time**. The rendered predicate is
  `"activities"."due_date" < $1` with `params === ["2026-08-21T11:27:11.340Z"]` — `typeof "string"`.
- **Resolution:** assert the property that actually matters — the cutoff is a **bound parameter**
  (`< $1`), there is **exactly one** of them (which is what "computes `new Date()` once" means
  observably; two calls would render two placeholders), and it parses to a timestamp within a second
  of the call. A hard-coded or epoch-zero cutoff would match every row and make `overdue` a filter
  that narrows nothing — the exact defect class, so it is asserted rather than assumed.
- **Written into the test** so the next reader does not "fix" it back.

### 4. [Rule 2 — keep every commit green] `status` implemented in task 1, task 2 became the semantics half

- The plan's task 1 `<done>` requires "the invariant gate is green", and the gate demands a
  `filters?.status` guard; the plan's task 2 was to add that guard. Both cannot hold with atomic green
  commits, so `status` landed in task 1 (the gate is the spec) and task 2 delivers what the gate
  structurally cannot see: rendered SQL per literal, the fall-through branch, the three-way
  distinctness anti-vacuity check, and the live partition proof.
- **Probe E vindicates the split.** Replacing the whole status block with the list side's own defect —
  `conditions.push(isNull(activities.deletedAt))`, a no-op duplicate — leaves the structural row
  *`activity/status is applied as a predicate by its fetcher`* **GREEN** while failing all five
  semantics tests. The structural gate alone would not have caught it.
- Task 2's RED is therefore the one observed in task 1's run
  (`activity/status is applied as a predicate by its fetcher` failing by name) plus probes D and E;
  it is not a fresh RED-then-GREEN, and that is recorded rather than implied.

### 5. [Rule 2 — coverage the plan's threat model required but did not test] Four additions

1. **T-40-32 has a test.** The register dispositions the two `sql` fragments `mitigate`; nothing
   asserted it. Added: `pipeline` and `assignee` cross as `params === ["pipe-1", "user-1"]` with
   neither value in the statement text.
2. **A crafted `entityType` is refused by the guard**, not merely by `fetchFilteredData`'s switch
   default — asserted over `__proto__`, `constructor`, `organizations`, `""`, which must also not
   throw.
3. **`ids` cannot be smuggled into a view export.** It is on no whitelist row, so
   `{ search: "acme", ids: [...] }` yields `{ search: "acme" }`.
4. **Every saveable key maps into the export vocabulary.** A key added to `SAVEABLE_FILTER_KEYS`
   with no `ExportFilters` home would be authorized by `hasExportableFilter` and then never reach the
   query — T-40-30 one layer down, where the structural gate cannot see it. Gated with the fix named
   in the failure message.

### 6. [Finding, no code change] The plan's "pick then ask about the PICKED map" is defence in depth, not an independent control

Probe H swapped `hasExportableFilter(entityType, picked)` for
`hasExportableFilter(entityType, input.filters)` — the raw submitted map. **All 43 assertions stayed
green.** `hasExportableFilter` calls `pickFilterParams` on whatever source it is handed
(`url-params.ts`), and `pickFilterParams` is idempotent, so the two forms are behaviourally
identical. The blank-search and length-cap refusals are guaranteed by 40-01's module, not by this
plan's call ordering.

The code keeps the explicit pick — it is clearer, and it guarantees the authorization decision and
`guarded.filters` derive from the same object — but it is documented as redundant rather than
presented as the control. **No test was contrived to make probe H fail:** the only way to detect the
difference is to grep the implementation's argument text, which is the raw-token trap the phase was
warned about, on an implementation detail with no behavioural consequence.

## Negative Probes — all eight RUN against committed code, then restored

Applied to the committed implementation, run, and reverted; the working tree was clean after each.
Two of the eight did **not** discriminate, and both are reported as findings rather than papered over.

| # | Defect introduced | Result | Test titles that turned RED |
|---|---|---|---|
| A | `filters?.owner` block deleted from `fetchPeople` — **the plan's own prescribed probe** | **0 failed in the gate** (19/19 green) | none — `owner` is not in `EXPORTABLE_FILTER_KEYS.person`. Deviation 2 |
| B | `filters?.search` block deleted from `fetchPeople` — the correct probe | **1 failed** | `person/search is applied as a predicate by its fetcher` |
| C | `filters?.pipeline` block deleted from `fetchDeals` | **1 failed** | `pipeline narrows a deals export but never authorizes one` |
| D | `overdue` lost its `lt(dueDate)` half, so `overdue === pending` | **2 failed** | `overdue is incomplete AND past due, with the cutoff bound as a parameter`; `the three literals render three DIFFERENT predicates, all narrower than none` |
| E | whole `status` block → `conditions.push(isNull(activities.deletedAt))` — **the list side's exact defect** | **5 failed**, structural row still GREEN | `completed selects rows that HAVE a completion timestamp`; `pending selects rows that have NO completion timestamp…`; `overdue is incomplete AND past due…`; `an UNRECOGNISED status adds no predicate at all…`; `the three literals render three DIFFERENT predicates…` |
| F | `hasExportableFilter` → `hasSaveableFilter` in the guard — **the A2 "simplification"** | **1 failed** | **`refuses a deals export scoped only by pipeline — 25,195 deals is the unbounded export 38-CONTEXT forbids`** |
| G | the predicate → a fresh `Object.keys(picked).length === 0` non-empty test | **1 failed** | **`refuses a deals export scoped only by pipeline — 25,195 deals is the unbounded export 38-CONTEXT forbids`** |
| H | predicate asked about the RAW map instead of the picked one | **0 failed** (43/43 green) | none — behaviourally identical. Deviation 6 |
| I | `maxRows: EXPORT_ROW_CAP` deleted from the call site | **1 failed** | `passes EXPORT_ROW_CAP as maxRows at the single fetchFilteredData call site` |
| J | a Phase-38-style admin gate re-added to the action | **1 failed** | `contains NO admin gate — E-9 is a deliberate, visible widening of a Phase 38 restriction` |
| K | `guardExportInput` moved to AFTER `fetchFilteredData` | **1 failed** | `authenticates, then guards, then queries — in that order` |

Probes **F and G are the ones that matter most**: each is a plausible, tidier-looking guard, and each
fails on exactly the one named test that encodes E-2. That is the line the phase's whole export
posture rests on, and it discriminates.

Full failure text of probe B, recorded verbatim as the plan asks:

> `AssertionError: fetchPeople has no `filters?.search` guard, but hasExportableFilter("person",`
> `{ search: … }) returns true — so that key would AUTHORIZE an export while narrowing nothing. That`
> `is the unbounded export 38-CONTEXT.md:110-116 forbids. Add the predicate to fetchPeople; do NOT`
> `remove search from EXPORTABLE_FILTER_KEYS.person to make this green.: expected false to be true`

## TDD Gate Compliance

- **Task 1 RED — RUN and recorded.** 19 tests, **10 passed / 9 failed**. The nine: `organization/search`,
  `person/search`, `deal/assignee`, `activity/type`, `activity/assignee`, `activity/status`,
  `activity/search`, `extracts PER FUNCTION…`, `pipeline narrows a deals export…`. The seven
  already-implemented pairs (`deal/stage`, `deal/owner`, `deal/dateFrom`, `deal/dateTo`,
  `activity/owner`, `activity/dateFrom`, `activity/dateTo`) **passed** — which is what confirmed the
  extraction discriminated rather than failing everything. GREEN: 52.
- **Task 2** — semantics validated by probes D and E rather than a fresh RED; see deviation 4.
- **Task 3 GREEN:** 43 in the gate, 536 across both directories; validated by probes F, G, I, J, K.

Commits are `feat` / `test` / `feat`. The task-2 gate commit is a genuine `test(...)`.

## Verification

| Check | Result |
|---|---|
| `npx vitest run src/lib/export/ src/lib/views/` | **536 pass, 0 fail** |
| `npx vitest run src/lib/export/__tests__/view-filters.test.ts` | **43 pass, 0 fail** |
| `DATABASE_URL=… npx vitest run src/lib/export/formatters-live.test.ts` | **24 pass, 0 fail** |
| `npm test` (full suite) | **3266 pass, 28 skip, 0 fail** (132 files) + 8 `rsc` |
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **0 errors**, 125 warnings (repo baseline) |
| `npx eslint src/lib/export src/lib/views` | **0 errors**, 4 warnings — all pre-existing unused imports in `formatters.ts` / `pipedrive.ts`, untouched by this plan |
| `filters?.ids` comment block + all four guards | **byte-identical** — `git diff` versus base matches nothing in that block |
| `git diff src/lib/bulk/limits.ts` | **empty** — no import acquired |
| Files touched outside this plan's ownership | **none.** `git diff --name-only` versus base over `activities/page.tsx`, `e2e/**`, `playwright.config.ts`, `url-params.ts`, `queries.ts`, `validate.ts`, `resolve.ts`, `actions.ts`, `src/messages/**`, `drizzle/**`, `package*.json` is **empty** |
| Migration journal | **still `idx: 18`** — no migration generated |
| Locale keys | **none added.** `bulk.exported` and `bulk.error.exportFailed` reused verbatim; `REQUIRED_BULK_KEYS` unedited; `views.export.*` is the locale plan's to add |
| Dependencies | **unchanged** — no install, no `shadcn add`, no Docker rebuild |
| Dev row counts | **unchanged** (table above); every live test is read-only and re-asserts it |

## Notes for Later Plans

**For 40-13 — nothing here needs to change when you land.** `fetchActivities` already applies
`status`, `dateFrom` and `dateTo` as real SQL. Making the LIST side match will make the export and
the list agree; it will not make either disagree with the invariant gate, which reads only
`formatters.ts`. If you want the gate to cover the list side too, that is a NEW gate in your plan's
file, not a widening of this one.

**For the plan wiring the export UI (E-1…E-8).** `exportViewResults({ entityType, filters })` returns
a discriminated union: `{ success: true, data, filename, count }`, or `{ success: false, error:
"unauthenticated" | "refused" | "failed" }`, or `{ success: false, error: "too_many", max }`. Map
`count` to `bulk.exported`, `"failed"` to `bulk.error.exportFailed`, `"too_many"` to
`views.export.tooMany` with `{max}`, `"refused"` to `views.export.refused`. **`filename` is
server-generated — render it, never translate it.** Import `EXPORT_ROW_CAP` from
`@/lib/export/view-export-guard` if you need the number client-side; do not re-declare it.

**Do not import `guardExportInput` into a client component to pre-check `canExport`.** Use
`hasExportableFilter` from `url-params.ts` for the disabled state (E-3) — that is the db-free module
built for it. The guard is the server-side control and duplicating it client-side would create the
two-copies-of-the-whitelist defect 40-01's header warns about.

**The `"use server"` non-async-export rule bit this plan and will bite others.** Any constant, type
guard or sync helper a server action needs must live in a plain sibling module. Two precedents now:
`src/lib/notes/errors.ts` and `src/lib/export/view-export-guard.ts`.

**`ExportFilters.maxRows` is opt-in and must stay so.** The admin full export
(`src/app/admin/export/actions.ts`) and all four `exportSelected*` actions pass no cap and are
byte-for-byte unaffected; the live suite asserts the admin path still reads all 46,054 organizations
and that an empty id list still yields zero rows with a cap in play.

## Self-Check: PASSED

- `src/lib/export/__tests__/view-filters.test.ts` — FOUND
- `src/lib/export/view-export-guard.ts` — FOUND
- `src/lib/views/export-action.ts` — FOUND
- `src/lib/export/types.ts` — FOUND (modified)
- `src/lib/export/formatters.ts` — FOUND (modified)
- `src/lib/export/formatters-live.test.ts` — FOUND (modified)
- commit `9a2f3a7` — FOUND
- commit `69e4b2f` — FOUND
- commit `5f00124` — FOUND
- working tree clean after all eleven probe applications — CONFIRMED
- dev row counts re-measured and unchanged — CONFIRMED

## Known Stubs

None. Every exported function is implemented and asserted. `exportViewResults` returns real data from
a real query; nothing in this plan returns a placeholder or is wired to mock data. The one UI-facing
gap is deliberate and belongs to another plan: no component calls `exportViewResults` yet, because
the export affordance (E-1…E-8) is not this plan's scope.

## Threat Flags

None. Every surface this plan adds is in the plan's own `<threat_model>`: the action is the single new
entry point (T-40-29), it reads through the existing `fetchFilteredData` path, and it adds no route,
no schema change and no dependency. `guardExportInput` and `EXPORT_ROW_CAP` moving to a sibling
module changes no trust boundary — the module is imported only by the action and by tests, and it has
no database import.
