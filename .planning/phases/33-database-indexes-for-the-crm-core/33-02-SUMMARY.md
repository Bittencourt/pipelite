---
phase: 33-database-indexes-for-the-crm-core
plan: 02
subsystem: database
tags: [drizzle, drizzle-orm, postgres, schema, indexes, btree]

requires:
  - phase: 33-01
    provides: the committed BEFORE plan capture that D-07 requires to precede any index DDL
provides:
  - "Eleven plain single-column btree indexes declared in the Drizzle schema (5 deals / 3 activities / 2 people / 1 organizations)"
  - "The schema-as-source-of-truth guarantee (D-06) that prevents a future drizzle-kit generate from dropping them"
affects: [33-03, phase-37-trash-and-restore]

tech-stack:
  added: []
  patterns:
    - "pgTable third argument, object-return form: (table) => ({ camelKey: index('table_column_idx').on(table.col) })"
    - "Index naming convention {table}_{column}_idx, matching workflows.ts / webhooks.ts / webhook-deliveries.ts"

key-files:
  created: []
  modified:
    - src/db/schema/deals.ts
    - src/db/schema/activities.ts
    - src/db/schema/people.ts
    - src/db/schema/organizations.ts

key-decisions:
  - "All eleven declared via the index() builder in schema files, never hand-written into migration SQL (D-06 — workflows_next_run_at_idx was hand-written into 0009 and silently dropped by 0010)"
  - "Plain indexes only, zero .where() predicates (D-02) — a partial (stage_id) WHERE deleted_at IS NULL is identical in size and cost here and would break the stage-delete guard"
  - "No .concurrently() (D-03) — drizzle-kit migrate wraps migrations in a transaction and Postgres rejects CONCURRENTLY there"
  - "No composite (stage_id, position) (D-04) — measured to grow the index 200 kB to 1696 kB and push the planner back to Seq Scan, actively failing SC-1"
  - "deals_owner_id_idx declared despite being permanently un-demonstrable by EXPLAIN (D-05) — SC-3 requires index-backing, not planner preference"

patterns-established:
  - "Test-outcome assertions must read vitest's summary lines, not arbitrary output text — passing tests legitimately log the word 'failed'"

requirements-completed: [PERF-01]

duration: 9min
completed: 2026-08-14
---

# Phase 33 Plan 02: Schema Index Declarations Summary

**All eleven PERF-01 columns now carry a plain single-column btree index declared through Drizzle's `index()` builder in `src/db/schema/`, so the migration generator — not a hand-written SQL file — owns the DDL.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-08-14T15:53:00Z
- **Completed:** 2026-08-14T16:02:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `index` to the `drizzle-orm/pg-core` named import in all four schema files and converted each two-argument `pgTable(...)` call into the three-argument object-return form.
- Declared exactly eleven indexes, split 5 / 3 / 2 / 1:

| File | Index | Column |
|------|-------|--------|
| deals.ts | `deals_stage_id_idx` | `stageId` |
| deals.ts | `deals_organization_id_idx` | `organizationId` |
| deals.ts | `deals_person_id_idx` | `personId` |
| deals.ts | `deals_owner_id_idx` | `ownerId` |
| deals.ts | `deals_deleted_at_idx` | `deletedAt` |
| activities.ts | `activities_due_date_idx` | `dueDate` |
| activities.ts | `activities_deal_id_idx` | `dealId` |
| activities.ts | `activities_deleted_at_idx` | `deletedAt` |
| people.ts | `people_organization_id_idx` | `organizationId` |
| people.ts | `people_deleted_at_idx` | `deletedAt` |
| organizations.ts | `organizations_deleted_at_idx` | `deletedAt` |

- Zero `.where(` (D-02), zero `.concurrently(` (D-03), zero multi-column `.on(` (D-04) across all four files — each enforced by an automated assertion rather than by review.
- `_relations.ts` untouched; nothing under `src/app/`, `src/lib/` or any `*.test.ts` touched.
- All three Phase 32 gates green: `npm run typecheck` exit 0, `npm run lint` exit 0, `npm test` exit 0 at exactly the baseline — **41 files passed, 461 passed / 4 skipped (465)**.
- `drizzle/` deliberately untouched: no migration was generated or hand-written in this plan.

## Task Commits

1. **Task 1: Declare the five deals indexes** — `e9daec9` (feat)
2. **Task 2: Declare the six activities, people and organizations indexes** — `9509385` (feat)

Housekeeping commit `13f015f` (chore) landed the pre-existing STATE.md execution marker — see Deviations.

## Files Created/Modified

- `src/db/schema/deals.ts` — `index` import + 5 declarations
- `src/db/schema/activities.ts` — `index` import + 3 declarations
- `src/db/schema/people.ts` — `index` import + 2 declarations
- `src/db/schema/organizations.ts` — `index` import + 1 declaration

Each file keeps its own single-quote style for string literals, so the diff is index declarations only.

## Decisions Made

- Followed the plan exactly on index set, naming, form and prohibitions. No discretionary choices remained after D-02/D-03/D-04/D-06 locked the design.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Corrected a false-positive test-failure predicate**

- **Found during:** Task 2
- **Issue:** The task's automated verify flagged `FAIL test failures` while `npm test` had exited **0** with 41 files passed and 461 passed / 4 skipped. The predicate `/[1-9][0-9]* failed/` was matching an ordinary `console.error` line emitted *by a passing test*: `[execution-engine] Run run-6 failed: Node 'n2' (Bad Node) failed: DB connec…`. It scanned all captured output rather than vitest's result summary.
- **Fix:** Replaced it with a strictly stronger check — strip ANSI codes, then require `npm test` exit code 0, require that neither the `Test Files` nor the `Tests` summary line contains `failed`, and additionally pin the exact baseline (`Test Files 41 passed (41)` and `Tests 461 passed | 4 skipped (465)`). The `_relations.ts` byte-identity check was also made explicit via `git diff --name-only HEAD -- src/db/schema/_relations.ts`.
- **Files modified:** none in the repo (verification logic only)
- **Verification:** Corrected assertion prints PASS and exits 0 with `TEST_EXIT=0`.
- **Committed in:** n/a (verification-only change)

**2. [Rule 3 - Blocking] Pre-existing dirty `.planning/STATE.md` broke the scope allowlist**

- **Found during:** Task 1
- **Issue:** `.planning/STATE.md` was already modified in the working tree before this plan began (an orchestrator-written marker flipping Phase 33 to `executing` and `total_plans` 6 → 9). The task's scope assertion allowlists only the four schema files, so it reported `out-of-scope change: .planning/STATE.md` even though the schema edit itself was clean.
- **Fix:** Inspected the diff — it is planning metadata only, no source or test content — and landed it in its own `chore(state)` commit (`13f015f`) so the working tree was clean before the Task 1 scope check ran. Staged with `git add -f`, since `.planning` is gitignored.
- **Files modified:** `.planning/STATE.md`
- **Verification:** Task 1's assertion re-run on the clean tree prints PASS.
- **Committed in:** `13f015f`

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking verification/tree issues, zero functional change)
**Impact on plan:** None. The index set, names, form and prohibitions are exactly as specified. The corrected test predicate is strictly stricter than the original.

## Issues Encountered

- The `rtk` hook colours and reshapes `npm` output; every gate was run as `rtk proxy "<cmd>" > /tmp/<file> 2>&1` and asserted from the file with `node -e`, per the plan's environment notes. ANSI stripping was needed before the summary lines would match.

## Database Integrity

Not applicable — this plan touched no database. No DDL was generated or applied; `drizzle/` is unmodified.

## Self-Check: PASSED

- `src/db/schema/deals.ts` — FOUND (5 × `index(`)
- `src/db/schema/activities.ts` — FOUND (3 × `index(`)
- `src/db/schema/people.ts` — FOUND (2 × `index(`)
- `src/db/schema/organizations.ts` — FOUND (1 × `index(`)
- Commit `e9daec9` — FOUND
- Commit `9509385` — FOUND

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The schema now diverges from `drizzle/meta/0011_snapshot.json` by exactly eleven `CREATE INDEX` statements, which is what plan 33-03's `db:generate` must emit and nothing more.
- Plan 33-03's Task 1 gate should reject the generated file if any `ALTER`, `DROP`, `CREATE TABLE`, `WHERE` or `CONCURRENTLY` appears — that would indicate drift this plan did not introduce.

---
*Phase: 33-database-indexes-for-the-crm-core*
*Completed: 2026-08-14*
