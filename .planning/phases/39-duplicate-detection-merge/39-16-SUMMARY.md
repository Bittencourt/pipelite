---
phase: 39-duplicate-detection-merge
plan: 16
subsystem: import
tags: [dedup, import, csv, pipedrive, i18n, next-intl, responsive, vitest]

# Dependency graph
requires:
  - phase: 39-08
    provides: "`findCertainMatches` — the query shapes and the fail-closed / no-query-on-degraded-path posture this module copies; `readOrgIdentityFields`, whose `null` means there is no certain tier at all"
  - phase: 39-01
    provides: "`classifyOrganizationMatch`, `classifyPersonMatch`, `isValidMatchEmail`, `isComparableOrgName`, `MergeableEntityType`"
  - phase: 39-04
    provides: "the `dedup.import.flagged` / `flaggedBody` / `review` and `dedup.findDuplicates` message keys in all three locales"
  - phase: 39-05
    provides: "the `norm_name` / `norm_email` generated columns and their btree indexes, which both candidate queries narrow on"
provides:
  - "`countFlaggedImportedRecords` — the flagged-row count for a finished import, batched, self-exclusion-correct, fail-closed"
  - "`IMPORT_FLAG_BATCH_SIZE` / `IMPORT_FLAG_CANDIDATE_LIMIT` / `IMPORT_FLAG_MAX_RECORDS` — the bound, exported so the tests can assert it rather than restate it"
  - "`ImportDuplicateNotice` — the ONE flagged-rows notice, rendered on both completion summaries (I-1 … I-5)"
  - "a real `flaggedDuplicates` producer on BOTH importers: the CSV action's return shape and the Pipedrive session progress"
  - "the admin-only `Find duplicates` entry point on the `/organizations` and `/people` toolbars, and both toolbars now wrap"
affects: [39-17, "/duplicates route", "the duplicates scan the notice links to"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "batch-then-classify: one query per batch of ids plus one per candidate set, with the self-exclusion applied IN MEMORY per row because the exclusion is per-row and the query is per-batch"
    - "a shared notice component owned by neither importer, so a flagged-rows report cannot say two different things depending on which importer produced it"
    - "per-test source extraction in a source-read gate, so a regression fails by NAME naming the file that broke instead of erroring at collection"
    - "grep-gated absences documented WITHOUT naming the forbidden token, because naming it in prose defeats the gate"

key-files:
  created:
    - src/lib/dedup/import-flags.ts
    - src/lib/dedup/import-flags.test.ts
    - src/components/dedup/import-duplicate-notice.tsx
    - src/app/organizations/__tests__/toolbar-wiring.test.ts
  modified:
    - src/app/import/steps/confirm-step.tsx
    - src/app/admin/import/pipedrive-api/steps/progress-step.tsx
    - src/app/organizations/data-table.tsx
    - src/app/people/data-table.tsx
    - src/app/organizations/page.tsx
    - src/app/people/page.tsx
    - src/app/import/actions.ts
    - src/lib/import/pipedrive-api-import-actions.ts
    - src/lib/import/pipedrive-import-state.ts

key-decisions:
  - "BOTH importers use the `{ recordIds }` shape, not `{ importSessionId }` — neither writes per-record audit rows, so the session path resolves zero created records on real data. Recorded with file:line evidence below."
  - "The producers were added rather than the notice being wired to a permanent zero. Reporting matched rows IS the importer's scope per 39-CONTEXT; what the plan forbids is inventing PROVENANCE tracking, and no provenance was invented — both importers already had the ids from `.returning()`."
  - "The count is of RECORDS, not of pairs: a record with three certain matches counts once, because the notice's sentence is 'N imported records look like duplicates'."
  - "Only rows an import CREATED are counted. A Pipedrive organization matched to an existing one was never inserted, and an auto-created stub organization is a row the user never asked to import."
  - "The `Find duplicates` button carries no icon: the label alone is the narrowest the control can be and it shares a row with two others at a 305px client width."
  - "The 320px measurement of both toolbars is explicitly NOT claimed here — it is plan 39-17's. This plan asserts only that the classes which make fitting possible are present."

requirements-completed: []

# Metrics
duration: 32min
completed: 2026-08-19
---

# Phase 39 Plan 16: Importer Flagged-Rows Report & List-Page Entry Points Summary

**A bounded, self-exclusion-correct, fail-closed flagged-row count wired to a real producer on both importers, one shared notice on both completion summaries, and an admin-only `Find duplicates` button on two toolbars that now wrap.**

## Performance

- **Duration:** 32 min
- **Started:** 2026-08-19T10:28Z
- **Completed:** 2026-08-19T11:00Z
- **Tasks:** 3 (task 1 TDD, RED → GREEN)
- **Files:** 4 created, 9 modified

## Task Commits

1. **Task 1: The flagged-row count**
   - `a4abdf2` (test) — RED: 21 failing cases, module absent
   - `ee6a44e` (feat) — GREEN: `src/lib/dedup/import-flags.ts`
2. **Task 2: The shared notice, on both completion summaries** — `f78e03e`
3. **Task 3: The two list-page entry points, and the wrapping toolbars** — `70ca742`

No REFACTOR commit — the implementation needed no cleanup after going green.
**TDD gate sequence verified in `git log`:** `test(39-16)` precedes `feat(39-16)`.

## THE FINDING THE PLAN ASKED FOR: which identifier each importer can supply

The plan told me to read both importers first and record the answer. **Neither importer can supply
an `importSessionId` that resolves to created records**, and the reason is different in each case.
Both, however, have the record ids in hand.

| Importer | Session id? | Per-record audit rows? | Ids in hand? | Shape used |
|---|---|---|---|---|
| CSV, `src/app/import/actions.ts` | **No** | No | **Yes** | `{ recordIds }` |
| Pipedrive, `src/lib/import/pipedrive-api-import-actions.ts` | Yes | **No** | **Yes** | `{ recordIds }` |

**CSV — no session row exists at all.** `src/app/import/actions.ts:257` and `:304` pass
`importSessionId: null`, and the comment at `:253-256` states why: the audit column is a real
foreign key into `import_sessions`, the CSV importer creates no row there, and storing an id with
no parent would fail the constraint. But `batchInsert` at `:64-77` inserts with `.returning()`
specifically so formula recalculation can have the generated ids, so `importOrganizations` (`:280`)
and `importPeople` (`:413`) both hold a full id list.

**Pipedrive — the session id is real, but it appears on exactly ONE audit row, and that row is not
about a record.** `importFromPipedrive` runs inside
`runWithActor({ …, importSessionId: importId })` at `:311`, and `writeImportSummary` at `:357-376`
writes `entityType: "import_session"` with `entityId: importId`. The comment at `:336-351` records
that per-record rows were rejected on measured cost — a 25,206-deal import would publish 25,206 CRM
events, and the trigger evaluator subscribes to all thirteen of them, so the import would become
25,206 trigger evaluations and up to that many webhook deliveries. Its own inserts use
`.returning()` (`:746` for organizations, `:862` for people), so it too holds the ids.

**Consequence, stated plainly:** `countFlaggedImportedRecords({ importSessionId })` is implemented,
tested and correct, and it returns **0 with no per-record query** for every real session today,
because no producer writes the rows it reads. It is kept because it is the right contract the day
per-record provenance lands. The file header says so in capitals and tells a future reader not to
wire a summary to it expecting a non-zero number. Both live call sites use `{ recordIds }`.

## Accomplishments

- **`src/lib/dedup/import-flags.ts`** — `countFlaggedImportedRecords`, both input shapes.
  Organizations: equal `norm_name` **and** an equal admin-configured identity value. People: an
  exact, syntactically valid, non-sentinel address. The tier decision stays in `scoring.ts` for both
  branches, exactly as in `matching.ts`, so the importer's notion of a duplicate cannot drift from
  the background scan's.
- **The bound is real and asserted, not commented.** Ids are chunked at `IMPORT_FLAG_BATCH_SIZE`
  (100); each batch costs at most two queries; the candidate fetch is capped **on the query** at
  `IMPORT_FLAG_CANDIDATE_LIMIT` (2000); the id total is capped at `IMPORT_FLAG_MAX_RECORDS` (5000).
  Worst case is 100 queries whatever the size of the import. Test 4 asserts the call count is the
  batch count and is `toBeLessThan(recordIds.length)`.
- **`src/components/dedup/import-duplicate-notice.tsx`** — one component, both summaries,
  `Alert variant="default"` with a `Copy` icon, ICU-plural title, and a `variant="outline"` link.
  Returns `null` at `count <= 0`. It never lists rows and is never `destructive`, and each of those
  carries a one-line comment naming the reason, because both are exactly what a later reader
  "improves".
- **Both summaries report a REAL number.** The notice is not wired to a permanent zero on either
  side — see the deviation below for why producers were added and why that is not the tracking
  mechanism the plan forbids.
- **Both toolbars wrap, and the button is admin-only.** `flex flex-wrap items-center
  justify-between gap-2` with `min-w-0 flex-1` on the search cluster, each carrying the Phase 45
  measurement that motivates it so a later reader does not tidy the classes away.
- **35 new tests** (21 + 14), all green, with **three negative proofs RUN** and recorded below.

## Verification Evidence

**Test runs**

- `./node_modules/.bin/vitest run src/lib/dedup/import-flags.test.ts` — **21 passed**.
- `./node_modules/.bin/vitest run src/app/organizations/__tests__/toolbar-wiring.test.ts` — **14 passed**.
- `./node_modules/.bin/vitest run src/lib/dedup src/app/organizations` — 10 files, **188 passed**.
- `npm run test` — **2453 passed | 21 skipped** (main) and **8 passed** (rsc), 0 failures.
  Baseline before this plan was 2439 + 8, so the delta is exactly the 14 toolbar cases plus the 21
  import-flag cases minus nothing — the locale-parity test passed unchanged.
- `npm run typecheck` — **0 errors**.
- `npm run lint` — **0 errors**, 125 warnings, **all pre-existing** and none in
  `src/lib/dedup/`, `src/components/dedup/` or either data table (verified: a `dedup` grep over the
  lint output returns 0).

**Three negative proofs, RUN**

| # | Mutation | Result |
|---|---|---|
| 1 | removed the `candidate.id === row.id` self-exclusion from **both** branches | `× Test 3 — a record whose ONLY candidate is itself is not counted`, `× Test 3b — a person whose only candidate is itself is not counted`, `× Test 7b` — 3 failed, 18 passed. Restored, re-run **21 passed**. |
| 2 | removed `flex-wrap` from the **people** toolbar only | all 7 `people/data-table.tsx: …` tests failed **by name naming that file**; all 7 `organizations/data-table.tsx: …` tests still passed, proving the assertions are scoped per file. Restored, re-run **14 passed**. |
| 3 | added a second `dedup.findDuplicates` button to the **people** toolbar | `× people/data-table.tsx: dedup.findDuplicates appears EXACTLY once` and `× people/data-table.tsx: the /duplicates href appears exactly once, with type=people` — 2 failed, 12 passed. Removed, re-run **14 passed**. |

Negative proof 2 is also what caused the test file to be **restructured mid-task**: at first the
source read happened at suite scope, so a missing `flex-wrap` threw during collection and reported
as a whole-file error with **no test name and no indication of which toolbar regressed**. The read
and extraction were moved inside each `it`, which is what makes the failure name the file. That is
recorded here because a gate that cannot say what you broke is a worse gate than a failing
assertion, and the plan's acceptance criterion asked for "by name naming that file" specifically.

**Grep gates**

| Gate | Required | Result |
|---|---|---|
| `grep -c "throw" src/lib/dedup/import-flags.ts` | 0 | **0** |
| `grep -c "text-green-600\|text-orange-500" src/components/dedup/import-duplicate-notice.tsx` | 0 | **0** |
| `grep -c 'variant="destructive"' src/components/dedup/import-duplicate-notice.tsx` | 0 | **0** |
| `grep -c "count <= 0" src/components/dedup/import-duplicate-notice.tsx` | ≥ 1 | **1** |
| `dedup.import.flagged` / `flaggedBody` / `review` present, none hardcoded | 3 | **3**, all via `t(…)` |
| `grep -c "auth()" src/app/organizations/data-table.tsx src/app/people/data-table.tsx` | 0 | **0** |

Two of those gates were tripped by my own **comments** on the first pass and are worth recording,
because the fix is a pattern rather than a one-off: the notice's header originally named
`text-green-600` / `text-orange-500` when explaining which pre-existing classes it was *not*
copying, and both data-table prop docs named `auth()` when explaining why the flag arrives as a
prop. In both cases prose naming the forbidden token defeats the gate that forbids it. Both were
reworded to state the absence and note that it is grep-gated at zero, **without naming the token** —
which is strictly better documentation, since a reader can no longer copy the thing out of the
comment.

**Diff discipline on the two completion branches** (the plan asked for the numbers to be quoted):

```
src/app/admin/import/pipedrive-api/steps/progress-step.tsx | 11 +++++++++++
src/app/import/steps/confirm-step.tsx                      | 14 ++++++++++++
2 files changed, 25 insertions(+)
```

**Zero deletions in both**, as required. Neither importer's pre-existing presentation, colour
classes or English literals moved. Whole-plan diff: **1319 insertions, 5 deletions**, and the 5 are
the two toolbar `<div>` opening tags plus the two `DataTable(` signatures being widened —
`git diff --diff-filter=D` over the plan returns **nothing**, so no file was deleted.

## Deviations from Plan

### 1. [Rule 2 — Missing critical functionality] Producers were added on both importers

- **Found during:** Task 1's `read_first`, before any code was written.
- **Issue:** The plan's must-have truth is *"After an import finishes, the summary says how many
  imported records look like duplicates and links to the review page."* With no producer, both
  summaries would render `count={0}` forever and the notice would be unreachable dead code — the
  outcome the plan explicitly forbids ("rather than shipping a notice whose count is always zero").
  The plan's contingency assumed the gap was CSV-only; the evidence above shows it applies to both,
  which makes "render on the Pipedrive summary only" resolve to rendering nowhere.
- **Fix:** three files outside `files_modified`, **all purely additive**:
  - `src/app/import/actions.ts` (+28): `flaggedDuplicates: number` on the `importOrganizations` and
    `importPeople` success shapes, computed after the write from `batchInsert`'s returned ids.
  - `src/lib/import/pipedrive-import-state.ts` (+13): an optional
    `flaggedDuplicates: { organizations, people }` on `ImportProgressState` and on the JSONB shape,
    threaded through `toProgressState` and `updateImportState`. Optional because sessions written
    before this field existed have no key for it.
  - `src/lib/import/pipedrive-api-import-actions.ts` (+30): a run-scope accumulator set after the
    organization and people blocks, persisted so the progress poller can read it.
- **Why this is not the forbidden thing.** The plan says *"Do not invent a tracking mechanism inside
  the importer — 39-CONTEXT scopes the importer to 'reporting matched rows'."* No tracking mechanism
  was invented: no provenance table, no new column linking a record to a session, no per-record
  audit row. Both importers **already had** the ids from `.returning()`; what was added is the
  *reporting*, which 39-CONTEXT names as the importer's scope. The importer remains
  non-interactive — nothing prompts, nothing rejects a row, and the count runs strictly after the
  write and cannot fail it (`countFlaggedImportedRecords` swallows its own errors and answers 0).
- **Files modified:** the three above.
- **Committed in:** `f78e03e`.

### 2. [Rule 2 — Missing critical] The notice is guarded by entity type on the CSV summary

- **Issue:** `confirm-step.tsx` handles four entity types, but only organizations and people have a
  duplicate concept (`MergeableEntityType` excludes deals and activities). An unguarded
  `entityType` would not typecheck against the notice's prop.
- **Fix:** `{(entityType === "organization" || entityType === "person") && …}`, with a comment that
  `0` means both "no duplicates" and "not applicable".
- **Committed in:** `f78e03e`.

### 3. [Scope] `src/app/organizations/page.tsx` and `src/app/people/page.tsx` were edited

Not in `files_modified`, but required by the task's own instruction to *"pass the admin flag down as
a prop from the server component that renders the table rather than calling `auth()` in a client
file"*. +9 lines each: the `isAdmin` derivation with the VISIBILITY-ONLY comment, and the prop.

### 4. [Scope] Shared planning artifacts deliberately not written

Executed as a parallel worktree agent: `STATE.md`, `ROADMAP.md` and `REQUIREMENTS.md` were **not**
modified. `requirements-completed` is left **empty** above rather than claiming `DEDUP-01` — see
Next Phase Readiness for what is still outstanding on it.

### 5. [Documentation] `?type=` cannot be `${entityType}s`

Task 2 spells the href as `/duplicates?type=<entityType>s`, which yields `persons`; Task 3 and
UI-SPEC L-10 both spell it `people`. Resolved with an explicit `TYPE_PARAM` map and a comment naming
the reason, so the two call sites cannot disagree.

---

**Total deviations:** 5 (2 Rule 2 additions, 2 scope notes, 1 documentation reconciliation).
**Impact:** No scope creep. Deviation 1 is the difference between a working feature and dead code;
everything else is additive or a note. Nothing was removed or weakened.

## Known Stubs

**None in this plan's own files.** One forward reference is worth stating explicitly rather than
leaving to be discovered:

- **`/duplicates` does not exist yet.** Neither `src/app/duplicates/` nor
  `src/app/duplicates/layout.tsx` is present at this commit. Every link this plan adds — the two
  toolbar buttons and the notice's `Review duplicates` — therefore 404s until the plan that builds
  the route lands. That is expected mid-phase build-out, but it also means **the T-39-01
  authorization gate this plan's comments name as "the authority" does not exist yet either.** The
  admin-only visibility is currently the *only* thing in front of the link. It is still correct to
  call the visibility cosmetic — it must not be relied on — but whoever builds
  `src/app/duplicates/layout.tsx` must not treat the role check there as optional on the grounds
  that the button is already hidden.

## Deferred Issues

- **The 320px measurement of both toolbars is NOT done here, and this plan does not claim it.** The
  test file says so in its header, in prose, deliberately. It asserts that `flex-wrap`, `gap-2` and
  `min-w-0` are present on the right elements — the classes that make fitting *possible* — and
  nothing about whether either toolbar actually fits. **That measurement is plan 39-17's.** No
  Docker rebuild was paid here.
- **45-11's Radix Checkbox note was read and is not addressed, because it does not apply to what
  changed.** The bubble input escapes an `overflow-x-auto` row whose container is not `relative`;
  the toolbar row this plan edited has neither `overflow-x-auto` nor a checkbox, and the table below
  it already carries `relative w-full overflow-x-auto` from `src/components/ui/table.tsx:11`.
  Flagged for 39-17 to confirm under measurement rather than asserted here.
- **The `scope()` helper is duplicated** between `import-flags.ts` and 39-08's `matching.ts` (three
  lines each). Deliberate: `matching.ts` belongs to another plan and this plan does not edit another
  plan's files. Both carry the binding comment that the soft-delete predicate and the list pages'
  owner-scoping must change together. A later consolidation should export `scope` from one module.
- **The test harness is duplicated** between `import-flags.test.ts` and `matching.test.ts`, for the
  same reason. Noted for the same later cleanup.

## Threat Flags

None. No new network endpoint, auth path or schema change at a trust boundary. The one new client
surface is the toolbar link, which is T-39-01 and already in the plan's register — and its
disposition is unchanged: visibility is cosmetic, the route layout is the authority. No package was
installed (T-39-SC).

The one register item worth an explicit note: **T-39-38 (denial of service on counting matches for a
large import) is mitigated as specified and asserted.** Ids are resolved once and evaluated in
batches, never one query per record (Test 4); a session with zero created records issues no
per-record query (Test 4c); an empty id list issues no query at all (Test 4b); and a rejection
returns 0 rather than failing the import summary (Tests 5, 5b). **T-39-10** is asserted too:
Test 5c proves the log line contains neither the record's normalized name nor its identity value.

## Next Phase Readiness

**Ready to consume:**

- `countFlaggedImportedRecords` is stable, bounded and never throws. Any future importer can call it
  with `{ recordIds }` after its write.
- `ImportDuplicateNotice` takes `{ count, entityType }` and needs nothing else.
- The `?type=organizations` / `?type=people` query parameter is now produced by three call sites
  (two toolbars, one notice). **Whoever builds `/duplicates` must accept exactly those two values.**

**Concerns for whoever comes next:**

- **`DEDUP-01` is not complete.** This plan delivers its importer third. 39-08 delivered the
  create-time server half and its summary notes the create-time *UI* is a separate plan. Mark
  `DEDUP-01` complete only once the `/duplicates` route, the scan, and the create-time warning all
  land.
- **The similarity threshold still has no writer** — it is a one-row operator `UPDATE` on
  `app_settings` (39-08 decision 4). Nothing in this plan changed that, and the notice does not
  depend on it: the *certain* tier is btree equality and uses no threshold.
- **Organizations report 0 until an admin configures the identity field.** That is inherited from
  `readOrgIdentityFields` returning `null`, and it is a no-query path here as well — an unconfigured
  install pays nothing per import and sees no organization notice. People work out of the box
  because `people.email` is a real column.

## Self-Check: PASSED

Files:

- `src/lib/dedup/import-flags.ts` — FOUND
- `src/lib/dedup/import-flags.test.ts` — FOUND
- `src/components/dedup/import-duplicate-notice.tsx` — FOUND
- `src/app/organizations/__tests__/toolbar-wiring.test.ts` — FOUND

Commits (verified in `git log --oneline`):

- `a4abdf2` test(39-16) — FOUND
- `ee6a44e` feat(39-16) — FOUND
- `f78e03e` feat(39-16) — FOUND
- `70ca742` feat(39-16) — FOUND

Constraints:

- `STATE.md`, `ROADMAP.md`, `REQUIREMENTS.md` — NOT modified (verified by `git diff --name-only`)
- 39-14's files (`src/app/organizations/actions.ts`, `src/app/people/actions.ts`,
  `src/components/dedup/duplicate-warning.tsx`) — NOT touched (verified by `git diff --name-only`)
- no file deleted anywhere in the plan (`git diff --diff-filter=D` returns nothing)

---
*Phase: 39-duplicate-detection-merge*
*Completed: 2026-08-19*
