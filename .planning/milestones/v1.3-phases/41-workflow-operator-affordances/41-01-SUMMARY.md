---
phase: 41-workflow-operator-affordances
plan: 01
subsystem: database
tags: [drizzle, postgres, migration, workflows, notifications, dry-run, vitest]

# Dependency graph
requires:
  - phase: 39-saved-views
    provides: "src/db/schema/saved-views.test.ts — the getTableConfig parsed-schema gate idiom this plan's gate copies"
  - phase: 24-31-workflow-engine
    provides: "workflow_runs / workflows tables, ExecutionContext, the four background processors in instrumentation.ts"
provides:
  - "workflowRuns.dryRun — boolean NOT NULL DEFAULT false (WFOPS-02 storage)"
  - "workflowRuns.replayedFromRunId — nullable text, no FK (WFOPS-02 replay provenance)"
  - "workflows.failureAlertSentAt — nullable timestamp, NULL = never alerted (WFOPS-03 throttle)"
  - "notificationPreferences.emailWorkflowFailed — boolean DEFAULT true NOT NULL (WFOPS-03 opt-out)"
  - "ExecutionContext._dryRun?: boolean — the interface field six wave-2 plans compile against"
  - "src/db/schema/workflow-runs-columns.test.ts — the colocated parsed-schema gate for all four columns"
  - "drizzle/0019_concerned_runaways.sql — applied to the live Postgres 16"
affects: [41-05, 41-06, 41-07, 41-08, 41-09, 41-10, 41-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "columnDefault() helper — asserts the drizzle DEFAULT VALUE, not merely hasDefault, because hasDefault cannot distinguish DEFAULT false from DEFAULT true"
    - "count-free completeness check — assert every column name a test file claims about exists on the table, instead of pinning a total column map on a table other phases edit"

key-files:
  created:
    - src/db/schema/workflow-runs-columns.test.ts
    - drizzle/0019_concerned_runaways.sql
    - drizzle/meta/0019_snapshot.json
  modified:
    - src/db/schema/workflows.ts
    - src/db/schema/notification-preferences.ts
    - src/lib/execution/types.ts
    - src/lib/api/__tests__/serialize-run.test.ts
    - drizzle/meta/_journal.json

key-decisions:
  - "Four columns, not three — CONTEXT amendment A5 overrides the discretion item; digest_log is the weekly digest's private state and an extra row there makes the digest silently return 0"
  - "The gate is colocated at src/db/schema/workflow-runs-columns.test.ts, NOT 41-VALIDATION.md's src/db/schema/__tests__/ path — src/db/schema/ has a colocated convention and no __tests__/ dir"
  - "The migration was applied from the HOST against mapped port 5433, not via docker compose exec app — the app service is build: . with no bind mount, so the running container cannot see a migration generated in this worktree"
  - "replayed_from_run_id gets no foreign key: runs are prunable by two daily pruners, so an FK would either block pruning the origin or cascade-delete the replay"
  - "ExecutionContext._dryRun is declared optional and documented as authoritative from the dry_run COLUMN only, never re-read from the mutable workflow_runs.context blob (T-41-02)"

patterns-established:
  - "Pattern: assert a boolean column's literal default via getTableConfig(...).columns.find(...).default, since hasDefault: true is satisfied by the wrong default"
  - "Pattern: a phase-scoped schema gate asserts its own named columns exactly plus a completeness check, and deliberately does NOT pin a whole-table map on a shared pre-existing table"

requirements-completed: [WFOPS-01, WFOPS-02, WFOPS-03]

# Metrics
duration: 16min
completed: 2026-08-22
---

# Phase 41 Plan 01: Schema Foundation Summary

**Four columns across three tables in one generated `0019_concerned_runaways` migration applied to the live Postgres 16, `ExecutionContext._dryRun` declared for wave 2, and an 11-case parsed-schema gate that makes a nullable `dry_run` impossible.**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-08-22T23:23:40Z
- **Completed:** 2026-08-22T23:39:56Z
- **Tasks:** 3 of 3
- **Files modified:** 8 (3 created, 5 modified)

## Accomplishments

- `workflow_runs.dry_run` landed `NOT NULL DEFAULT false`, proven twice — against the parsed drizzle column and against `information_schema` — so the runs list cannot empty out. Both pre-existing run rows in the live database still match `dry_run = false`.
- One migration, `drizzle/0019_concerned_runaways.sql`, containing exactly four `ALTER TABLE … ADD COLUMN` statements and nothing else. Journal `idx: 19`. No `drizzle-kit push` was run at any point.
- `ExecutionContext._dryRun?: boolean` is declared once, in wave 1, so plans 41-05/06/07 do not each invent it.
- The app container was restarted against the migrated schema and **all six** background boot lines were confirmed present — the false-green this task exists to close.

## Task Commits

1. **Task 1 (RED): the parsed-schema gate, failing** — `0757930` (test)
2. **Task 1 (GREEN): four columns + `ExecutionContext._dryRun`** — `9504aa9` (feat)
3. **Task 2: generate + apply migration 0019** — `68c621a` (feat)
4. **Task 3: container restart verification** — no source files; evidence recorded below (a deployment verification task, nothing to commit)

## TDD: the RED counts, as actually measured

The test file was written and run **before** any schema edit.

| Gate | RED (before) | GREEN (after) |
|------|--------------|---------------|
| `npx vitest run src/db/schema/workflow-runs-columns.test.ts` | **9 failed / 2 passed** (11 cases, 1 file failed) | 11 passed |
| `npm run typecheck` | **1 error** — `src/db/schema/workflow-runs-columns.test.ts(198,58): error TS2339: Property '_dryRun' does not exist on type 'ExecutionContext'.` | 0 errors |

The two cases that passed in RED are recorded honestly rather than counted as coverage:

1. *"carries NO foreign key … while workflow_id still does"* — passed vacuously, because `replayed_from_run_id` did not yet exist so it could not appear in the FK list. Its `workflow_id` half was the substantive assertion at that point.
2. *"holds the ExecutionContext._dryRun contract"* — passed because vitest's esbuild transform strips types without checking them, so the `Exact<>` line is inert at runtime. That contract's RED signal is the `tsc` error in the row above, which is why both axes are recorded.

## Files Created/Modified

- `src/db/schema/workflow-runs-columns.test.ts` — **created.** 11 cases against `getTableConfig`-parsed tables. Contains `getTableConfig`, contains no `readFileSync` and reads no schema file as text.
- `src/db/schema/workflows.ts` — `workflowRuns.dryRun`, `workflowRuns.replayedFromRunId` (beside the existing `depth`/`currentNodeId` block, `.notNull().default()` clause order to match the file), `workflows.failureAlertSentAt`. No index added, no `.references()` on `replayedFromRunId`.
- `src/db/schema/notification-preferences.ts` — `emailWorkflowFailed` after `emailWeeklyDigest`, `.default(true).notNull()` clause order to match *that* file.
- `src/lib/execution/types.ts` — `_dryRun?: boolean` immediately after `_workflowUserId`.
- `src/lib/api/__tests__/serialize-run.test.ts` — two fixtures gained the two new run columns (Rule 3, below).
- `drizzle/0019_concerned_runaways.sql`, `drizzle/meta/0019_snapshot.json`, `drizzle/meta/_journal.json` — generated, never hand-written.

## The migration: exact commands and exact evidence

**Generated** (host, no database connection needed):

```
npx drizzle-kit generate     →  drizzle/0019_concerned_runaways.sql
```

Journal max `idx` was confirmed to be `18` immediately before generating, and again after the worktree base was corrected (see Issues). The new entry is `{"idx": 19, "tag": "0019_concerned_runaways"}`.

**Inspected** before applying. The whole file, four statements, nothing else:

```sql
ALTER TABLE "notification_preferences" ADD COLUMN "email_workflow_failed" boolean DEFAULT true NOT NULL;
ALTER TABLE "workflow_runs" ADD COLUMN "dry_run" boolean DEFAULT false NOT NULL;
ALTER TABLE "workflow_runs" ADD COLUMN "replayed_from_run_id" text;
ALTER TABLE "workflows" ADD COLUMN "failure_alert_sent_at" timestamp;
```

No `DROP INDEX`, no statement touching a fourth table.

**Applied.** `drizzle-kit migrate` was run from the host with `DATABASE_URL`'s host:port rewritten in memory from the in-Docker-network `postgres:5432` to the mapped `localhost:5433`, by sourcing `.env` in a throwaway script that was deleted immediately after. **No credential was echoed, passed on a command line, or written to a file.** No `sudo` anywhere. No `drizzle-kit push`.

The plan's preferred `docker compose exec app npx drizzle-kit migrate` was **deliberately not used** — see Deviations.

**Verified** via `docker compose exec -T postgres psql -U pipelite -d pipelite`:

| `column_name:is_nullable:column_default` |
|---|
| `dry_run:NO:false` |
| `email_workflow_failed:NO:true` |
| `failure_alert_sent_at:YES:-` |
| `replayed_from_run_id:YES:-` |

- `SELECT count(*) FROM workflow_runs WHERE dry_run IS NULL` → **0**
- `SELECT count(*), count(*) FILTER (WHERE dry_run = false) FROM workflow_runs` → **2 | 2**. Every pre-existing run is still visible to `eq(dryRun, false)`. This is the direct proof of must-have truth #1, beyond the NULL count.
- `SELECT count(*) FROM drizzle.__drizzle_migrations` → 12, with exactly **one** new row (`id 12`, `2026-08-22 23:30:40+00`). Only 0019 was applied; nothing else was replayed.

## Container restart: every boot line observed

`docker compose restart app`, then `docker compose logs app --since 3m`. All six registrations in `instrumentation.ts` announced:

```
[webhook-processor]   Starting with initial delay of 5s
[email-processor]     Starting with initial delay of 15s
[schedule-processor]  Starting with initial delay of 10s
[execution-processor] Starting with initial delay of 5s
[audit-prune]         Starting with initial delay of 60s, ticking daily
[trash-prune]         Starting with initial delay of 60s, ticking daily
```

`grep -cF '[execution-processor] Starting'` → `1`. `curl -sf -o /dev/null -w '%{http_code}' http://localhost:3001` → **200**.

Worth recording for the phase: the container's own entrypoint runs `drizzle-kit migrate` on boot, and its log shows "migrations applied successfully" with nothing new applied — consistent with the image predating 0019 and the host having already applied it.

## Verification results

| Gate | Result |
|------|--------|
| `npx vitest run src/db/schema/` | 29 passed (11 new + 18 saved-views) |
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **0 errors, 125 warnings** (baseline ≤127) |
| `npm test` | **3871 passed / 32 skipped** + RSC **8/8**. Baseline was 3860/32; delta is exactly +11, the new gate's cases. No regression. |

## Decisions Made

- **Four columns, not three** (D-A5). Recorded in the plan; restated here so no reviewer "fixes" it back to three.
- **Gate path is `src/db/schema/workflow-runs-columns.test.ts`, colocated.** 41-VALIDATION.md names `src/db/schema/__tests__/workflow-runs-columns.test.ts`; that directory has no `__tests__/` dir and its only existing test is colocated, and CONTEXT's placement rule says not to create a new convention where one exists. **The verifier must use the colocated path.**
- **`replayed_from_run_id` has no FK**, by design (T-41-04, accepted). It is diagnostic only; nothing reads it for an authorization decision.
- **The gate asserts default *values*, not just `hasDefault`.** For both booleans in this phase the wrong default is a silent outage rather than an error — `DEFAULT true` on `dry_run` would hide every existing run, and `DEFAULT false` on `email_workflow_failed` would disable WFOPS-03 for every user who has never opened the settings page.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `serialize-run.test.ts` fixtures had to gain the two new run columns**
- **Found during:** Task 1 (GREEN typecheck)
- **Issue:** `npm run typecheck` reported 2 × TS2345 at `src/lib/api/__tests__/serialize-run.test.ts:20` and `:51`. Both fixtures build a full `workflowRuns.$inferSelect` row inline, so adding two columns to the table made them structurally incomplete. Directly caused by this task's change.
- **Fix:** Added `dryRun: false, replayedFromRunId: null` to both fixtures, with a comment noting that `serializeRun` is an explicit field-by-field mapping and does **not** emit them, so the exact-object `toEqual` expectations remain correct. Confirmed by reading `src/lib/api/serialize.ts`.
- **Verification:** `npm run typecheck` 0 errors; `serialize-run.test.ts` 5/5 pass with its unchanged expectations.
- **Committed in:** `9504aa9`

### Method deviations (not auto-fixes)

**2. The migration was applied from the host, not with `docker compose exec app`**
- The plan's step 3 prefers `docker compose exec app npx drizzle-kit migrate`, with the host form as fallback. The **host form was required here**, not merely preferred: `docker-compose.yml`'s `app` service is `build: .` with **no volumes**, so the running container holds a baked image that cannot see a migration file generated in this worktree. The in-container form would have reported success while applying nothing new. The plan's documented fallback was used exactly as written, including reading credentials from `.env` rather than retyping them.

**3. `instrumentation.ts` is at the repository root, not `src/instrumentation.ts`**
- Task 3's `read_first` and CONTEXT both cite `src/instrumentation.ts`. The file is `./instrumentation.ts` (Next.js 16 accepts either). Same content, same four-processors-plus-two-pruners registration, same `Dockerfile:24 … 2>/dev/null || true` warning comment. No code change; recorded so downstream plans and the verifier look in the right place.

---

**Total deviations:** 1 auto-fixed (1 blocking) + 2 documented method/path corrections.
**Impact on plan:** The auto-fix was mechanically forced by the schema change and touched test fixtures only. No scope creep; no source behaviour changed outside the four columns and the one interface field.

## Issues Encountered

**The worktree was created from a stale base — caught by the startup check.** `git merge-base HEAD dc377c5` returned `aa01de2`, i.e. HEAD was an *ancestor* of the intended base. The sanctioned `<worktree_branch_check>` `git reset --hard dc377c5…` corrected it before anything else ran. This mattered specifically because of the migration: `drizzle/meta/_journal.json` max `idx` was re-confirmed to be `18` **after** the reset and immediately **before** `drizzle-kit generate`, so the generated file is `0019_*` and collides with nothing. Generating from the stale base is the failure mode that produces a silently duplicated migration number.

No other issues. Nothing was installed (`npm install` never run — T-41-SC is vacuous for this plan, as 41-RESEARCH predicted).

## Known Stubs

None. All four columns are real, applied and asserted; `_dryRun` is a declaration consumed by wave 2 by design, not a stub.

## Threat Flags

None. No new endpoint, auth path, file-access pattern or trust-boundary surface beyond the four columns already enumerated in the plan's threat register.

## Notes for wave 2 and the verifier

- The schema gate is `src/db/schema/workflow-runs-columns.test.ts` — **colocated**, not under `__tests__/`. `npx vitest run src/db/schema/__tests__/workflow-runs-columns.test.ts` will find nothing.
- `ExecutionContext._dryRun` is optional. Plan 41-05 must set it from the `workflow_runs.dryRun` **column** on every engine entry including delay resume, and must never read it back out of `run.context` (T-41-02). The gate's type-level contract pins the shape; it cannot pin the source.
- The live database now has 2 workflow runs, both non-dry. Any wave-2 manual verification of the dry-run filter starts from that.

## Next Phase Readiness

Wave 1's serialization point is closed: the four columns exist in the schema **and** in the live database, the migration is committed, and the running container has been restarted against it with all six background boot lines confirmed. All seven wave-2 plans that read `dryRun`, `replayedFromRunId`, `failureAlertSentAt`, `emailWorkflowFailed` or `_dryRun` are unblocked.

## Self-Check: PASSED

- All 6 claimed files verified present on disk (`src/db/schema/workflow-runs-columns.test.ts`, `drizzle/0019_concerned_runaways.sql`, `drizzle/meta/0019_snapshot.json`, `src/db/schema/workflows.ts`, `src/db/schema/notification-preferences.ts`, `src/lib/execution/types.ts`).
- All 3 claimed commits verified present in `git log --all`: `0757930`, `9504aa9`, `68c621a`.
- No file deletions in any commit (`git diff --diff-filter=D` empty across the range).
- `STATE.md` and `ROADMAP.md` were **not** modified — the orchestrator owns those writes.

---
*Phase: 41-workflow-operator-affordances*
*Completed: 2026-08-22*
