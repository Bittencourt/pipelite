---
phase: 37-trash-restore
plan: 07
subsystem: database
tags: [trash, drizzle, postgres, distinct-on, authorization, soft-delete, audit]

requires:
  - phase: 37-trash-restore
    provides: "37-02 — TRASH_TABS/TrashTab/TRASH_TAB_TO_ENTITY/TRASH_PARENTS and presentDeletedBy"
  - phase: 36-audit-log
    provides: "audit_log with actor columns and audit_log_entity_idx"
  - phase: 33
    provides: "migration 0012 — the plain btree on deleted_at for all four CRM tables"
provides:
  - "src/lib/trash/queries.ts — TRASH_PAGE_SIZE, TrashViewer, TrashRow, TrashedRecordRef, countTrashed, listTrashed, resolveDeletedBy, findTrashedRecord"
affects:
  - "37-10 (findTrashedParents extends this module)"
  - "every 37-* plan that renders /trash or guards a restore/purge by ownership"

tech-stack:
  added: []
  patterns:
    - "one composed `trashScope(deletedAt, ownerId, viewer)` SQL shared by the counts and the rows, so a count can never be scoped differently from the table under it"
    - "DISTINCT ON (entity_id) ORDER BY entity_id, created_at DESC as the batched latest-per-entity lookup over audit_log_entity_idx"
    - "`sql.param(array)` for `= ANY($n::text[])` — a bare `${array}` expands into a parenthesised chunk list, not one bind"
    - "parent-trashed booleans computed as extra select columns on an already-joined row, never as a second query"
    - "the `limit(PAGE_SIZE * page + 1)` probe-row hasMore idiom, unchanged from the four live list tables"
    - "predicates asserted by compiling them with PgDialect.sqlToQuery instead of by inspecting results"

key-files:
  created:
    - src/lib/trash/queries.ts
    - src/lib/trash/queries.test.ts
  modified: []

key-decisions:
  - "A person's display name is `${firstName} ${lastName}`.trim() — the plan's column facts listed a `name` column that people does not have; this follows linked-records.ts:124-125 rather than inventing a new rule"
  - "The activities secondary column is serialised to an ISO-8601 string in the query layer, so TrashRow.secondary is `string | null` on all four tabs and only deletedAt crosses as a Date"
  - "The id list binds through `sql.param` as ONE array parameter rather than as `inArray`'s N placeholders — page size does not change the statement"
  - "countTrashed returns null on any rejection rather than a partial record: three real counts and one silent zero is a wrong number rendered confidently"
  - "listTrashedOrganizations issues no parent join at all, rather than joining and discarding — TRASH_PARENTS.organization being empty is enforced by the absence of the join, not by a filter"

patterns-established:
  - "Pattern: the authorization predicate is composed once and passed to every read, so counts and rows are scoped by construction rather than by review"
  - "Pattern: functions reachable from a page render with no error.tsx above them return a renderable failure value (null / { ok: false } / empty Map) and log with a module prefix"

requirements-completed: [TRASH-01]

duration: ~50min
completed: 2026-08-16
---

# Phase 37 Plan 07: Trash Read Layer Summary

**Owner-scoped tab counts and rows for all four CRM tables, with a single `DISTINCT ON` query resolving a whole page's "deleted by" and the parent-trashed flags computed in the same join — every read degrading to a renderable value instead of throwing.**

## Performance

- **Duration:** ~50 min
- **Tasks:** 2 (both TDD, 4 commits)
- **Files created:** 2
- **Tests added:** 36

## What Was Built

`src/lib/trash/queries.ts` is the whole data side of TRASH-01. Four exported functions, and three
invariants that hold across all of them.

### The owner predicate is part of the query

`trashScope(deletedAt, ownerId, viewer)` returns one composed `SQL`:
`and(isNotNull(deletedAt), role === "admin" ? undefined : eq(ownerId, userId))`. Every one of the
nine reads in the module calls it — the four counts and the four per-tab row queries with the same
viewer, so they cannot be scoped differently. That is the point: `Deals (12)` above a table a
non-admin can see three rows of is a defect the user can see and cannot explain, and the only way
to prevent it structurally is to make the counts and the rows share one scope expression rather
than two hand-written clauses that happen to agree today.

The tests do not check this by counting returned rows — a post-filter would pass that. They compile
each where clause with `PgDialect.sqlToQuery` and assert the owner equality is present in the SQL
text for a `member` and absent for an `admin`, on all four tabs (T-37-02).

### One query per page, not one per row

`resolveDeletedBy(entityType, ids)` is the only hand-composed SQL this phase writes:
`DISTINCT ON (al.entity_id)` with the three LEFT JOINs `auditSource.hydrate` already uses, ordered
`entity_id, created_at DESC` — required by `DISTINCT ON` and also exactly `audit_log_entity_idx`'s
column order once `entity_type` is fixed. `LATERAL` would also have been one round trip but costs
one index descent per row.

Two binding details are load-bearing and both are asserted on the rendered statement:

- The entity type is typed as the closed `EntityType` union and passed as a parameter. The test
  asserts the literal never appears in the SQL text and does appear in `params` (T-37-03).
- The id list binds via **`sql.param(entityIds)`**. A bare `${entityIds}` would have been expanded
  by drizzle into a parenthesised chunk list (`sql.js:93-103`) — `= ANY(($1, $2, $3))`, which is
  not valid for `ANY`. One array parameter means the statement text is identical whether the page
  holds one row or fifty.

No `Date` is ever bound, asserted directly as `params.some(p => p instanceof Date) === false`
(T-37-18). An id absent from the returned map stays absent, which is what lets `presentDeletedBy`
say "not recorded" rather than inventing an unknown user (T-37-REP2).

### The parent-trashed flag is a column, not a query

Each tab's row query left-joins its parents and selects `isNotNull(parent.deletedAt)` as an extra
boolean column, so the badge costs no additional round trip. The parent **set** is read from
`TRASH_PARENTS`, never from a second list typed at the call site — which is what makes
`TRASH_PARENTS.organization` being empty the single place that says the badge never renders on the
Organizations tab. The organizations query issues no parent join at all rather than joining and
discarding, and the test asserts `joins` is empty there.

### Nothing throws

`/trash` has no `error.tsx` above it, so every function fails into something the page can render:
`resolveDeletedBy` → empty map, `findTrashedRecord` → `null`, `countTrashed` → `null` (not a record
of zeros — three real counts and one silent zero is a wrong number rendered confidently),
`listTrashed` → `{ ok: false }` (not an empty success — the page must be able to tell "nothing in
trash" from "the query broke"). All log with a `[trash-queries]` prefix carrying identifiers and
counts only, never record contents (T-37-20).

## Task Commits

| Task | Gate | Commit | Message |
|------|------|--------|---------|
| 1 | RED | `0caf046` | test(37-07): add failing tests for batched deleted-by resolution |
| 1 | GREEN | `b829b89` | feat(37-07): add resolveDeletedBy and findTrashedRecord |
| 2 | RED | `6eb5008` | test(37-07): add failing tests for owner-scoped trash counts and rows |
| 2 | GREEN | `abbf740` | feat(37-07): add countTrashed and listTrashed |

## TDD Gate Compliance

Both tasks ran a real RED gate. Task 1's RED failed with `Cannot find module './queries'` — the
module did not exist when the test was committed. Task 2's RED failed 19 of 36 tests on the missing
`countTrashed` / `listTrashed` exports while the 17 from task 1 stayed green. `test(...)` precedes
`feat(...)` for both tasks in `git log`. No REFACTOR gate was needed.

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run src/lib/trash/queries.test.ts` | 36 passed (plan required ≥16) |
| `npm run typecheck` | exit 0 |
| `npm run lint` | 0 errors, 125 warnings (baseline unchanged; none in `src/lib/trash`) |
| `npx vitest run` (default project) | 1585 passed, 4 skipped (baseline 1549 + 36 new) |
| `npx vitest run --config vitest.rsc.config.ts` | 8 passed |
| `grep -ci 'distinct on' queries.ts` | 3 (plan required ≥1) |
| `grep -c 'isNotNull' queries.ts` | 11 (plan required ≥8) |
| `grep -c 'isNull(' queries.ts` | 0 |
| New index declared or migration generated | none — latest migration is still wave 1's `0015_trash_retention_seed.sql` |

### Live-database check (beyond the plan's automated verification)

The mocked suite proves the statement's *shape* but cannot prove postgres.js accepts the array
bind or that the unaliased boolean columns come back correctly. Both were verified against the
running Docker database with a throwaway probe (deleted before commit, never staged), asserting the
**absence** of any `[trash-queries]` degrade log — the functions swallow failures by design, so a
green call proves nothing on its own:

- `resolveDeletedBy("deal", ["a","b","c"])` executed with no error; `EXPLAIN` in `psql` confirms
  `entity_id = ANY('{a,b,c}'::text[])` as an index condition candidate (currently a Seq Scan because
  `audit_log` holds no `action = 'deleted'` rows yet — the planner's correct choice at zero rows).
- `countTrashed` returned `{ deals: 12, people: 1, organizations: 1, activities: 1 }`, matching a
  direct `SELECT count(*) … WHERE deleted_at IS NOT NULL` in `psql`.
- All four tabs returned `ok: true`. The trashed activity's `linkedParents` came back as
  `["Activity Test Deal"]` — the parent-trashed join working on real data, not a fixture.
- Every row's `deletedBy` is `{ kind: "notRecorded" }`, which is 100% of live trash exactly as
  37-RESEARCH § Pitfall 4 predicted.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The plan's column facts claim `people.name`; the table has `first_name` / `last_name`**

- **Found during:** Task 1 GREEN
- **Issue:** The plan's `<interfaces>` block lists `people: id, name, email, …` and instructs
  "`name` for person and organization". `src/db/schema/people.ts:7-8` has `firstName` and
  `lastName` and no `name` column, so the projection as written would not compile.
- **Fix:** Both `findTrashedRecord("person", …)` and the People tab's row query select
  `firstName` and `lastName` and compose the display name as `` `${firstName} ${lastName}`.trim() ``
  through a shared `personName` helper. This is not a new rule — `src/lib/audit/linked-records.ts:124-125`
  documents it as the display name the rest of the product uses.
- **Files modified:** `src/lib/trash/queries.ts`
- **Verification:** Two tests pin it (`findTrashedRecord` for a person, and the People tab's
  record column); `npm run typecheck` exits 0.
- **Committed in:** `b829b89` (task 1) and `abbf740` (task 2)

**2. [Rule 3 - Blocking] The worktree had no `node_modules`**

- **Found during:** Task 1 RED
- **Issue:** The agent worktree was created without dependencies, so `npx vitest` and
  `npm run typecheck` could not resolve anything.
- **Fix:** Symlinked the main checkout's `node_modules` into the worktree. `/node_modules` is in
  `.gitignore`, so nothing was staged and no lockfile changed. **No package was installed** —
  this phase installs nothing (37-RESEARCH § Package Legitimacy Audit, T-37-SC).
- **Files modified:** none tracked
- **Verification:** `git status --short` shows no untracked `node_modules`
- **Committed in:** n/a

### Documented choices the plan left open

**`sql.param` for the id array.** The plan says "Bind the id array so Postgres receives it as a
parameter for `= ANY(...)`" without specifying how. A bare `${entityIds}` does **not** do this:
drizzle expands an array chunk into `(p1, p2, p3)`. `sql.param(entityIds)` with an explicit
`::text[]` cast is what produces a single bind, and it is why the test asserts
`params).toContainEqual(["a","b","c"])` rather than three separate params.

**The activities secondary column.** The plan said "pick one and state it in the row type". Picked:
serialised to an ISO-8601 string inside the query layer. `TrashRow.secondary` is therefore
`string | null` on every tab, and `deletedAt` is the only `Date` on the row — one fewer value that
has to survive a server/client boundary intact.

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both were necessary to make the plan's own stated behaviour compile and run.
No scope creep: no index was added, no package installed, no sort or search control introduced,
and `findTrashedParents` was deliberately left for 37-10 with the module's per-tab helpers already
factored so it can be added without touching the exported surface.

## Issues Encountered

One test assertion, not one implementation bug: the initial `ORDER BY` assertion expected
`deleted_at desc` but drizzle quotes identifiers, so the rendered text is `"deleted_at" desc`. The
assertion was corrected to match what the driver actually receives — the implementation was right.

## Known Stubs

None. Every exported function issues a real query and returns real data; verified against the live
database above.

## Threat Flags

None. No new network endpoint, auth path, file access or schema change — this plan is read-only
against four existing tables and one existing index, and the trust boundaries it touches
(`?type=` / `?page=` → SQL, session → other users' records, the hand-composed fragment → database)
are all already in the plan's threat register and all mitigated with a test each.

## Notes for Later Plans

- **`findTrashedParents` (37-10) belongs next to `collectTrashedParents`.** The per-tab list
  helpers already resolve each parent's name and trashed flag from the row's own join, so the
  restore-the-parent-too affordance needs the parent **ids**, which are not currently projected.
  Adding `organizationId` / `personId` / `dealId` to the existing selects is cheaper than a second
  query and keeps the "one query per page" property.
- **Do not add `isNull` to this module.** A grep for `isNull(` returning 0 is an acceptance
  criterion of this plan and a useful invariant: nothing here reads a live record.
- **`countTrashed` returning `null` is a rendering instruction, not an error.** The tabs omit their
  counts; they must not print `(0)`.
- **`listTrashed` returns `{ ok: false }`, never an empty success.** The empty-state copy and the
  `trash.error.unavailable` panel are different surfaces and the discriminator is `ok`.
- **`deletedBy` is data, not JSX.** Every row currently carries `{ kind: "notRecorded" }` on live
  data, so the cell that renders it will be exercised almost entirely through that branch — build
  the other five from the unit tests, not from the browser.

## Next Phase Readiness

The `/trash` page component (its wave-3 sibling) has everything it needs: four counts, one page of
rows with parent flags and attribution, and a `TrashRow` shape that is JSON-safe apart from
`deletedAt`. The restore and purge server actions have `findTrashedRecord` for their owner-or-admin
guard and for the `{name}` in their toasts.

---
*Phase: 37-trash-restore*
*Completed: 2026-08-16*
