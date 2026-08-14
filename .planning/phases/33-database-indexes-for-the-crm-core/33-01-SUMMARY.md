---
phase: 33-database-indexes-for-the-crm-core
plan: 01
subsystem: database
tags: [postgres, explain-analyze, pg_indexes, drizzle, performance, verification]

requires:
  - phase: 32-test-infrastructure-and-ci
    provides: the three green gates (npm test / typecheck / lint) this phase must not regress
provides:
  - "verify-plans.sql — a reusable, read-only, four-statement capture script run byte-identically before and after the migration"
  - "33-PLANS.md with its BEFORE half filled in verbatim: both named queries proven sequential-scanning, catalog assertion proven empty"
  - "The pre-stated D-01 bitmap acceptance and the D-02/D-04/D-05/D-08 caveats, recorded ahead of any evidence"
affects: [33-02, 33-03, verify-work, phase-37-trash-and-restore]

tech-stack:
  added: []
  patterns:
    - "Read-only SQL capture script committed alongside the phase, executed identically for BEFORE and AFTER"
    - "Catalog (pg_indexes) assertion as the proof path for index-backing that EXPLAIN cannot demonstrate"

key-files:
  created:
    - .planning/phases/33-database-indexes-for-the-crm-core/verify-plans.sql
    - .planning/phases/33-database-indexes-for-the-crm-core/33-PLANS.md
  modified: []

key-decisions:
  - "BEFORE capture committed strictly before any index DDL exists (D-07) — the commit ordering is the evidence, not a convention"
  - "Bitmap Heap Scan fed by Bitmap Index Scan on deals_stage_id_idx pre-accepted as satisfying SC-1 (D-01)"
  - "deals.owner_id verified by pg_indexes catalog only, never by EXPLAIN (D-05, n_distinct = 1)"
  - "No planner toggle and no standalone ANALYZE in the capture script — costs stay comparable to the RESEARCH.md baseline"

patterns-established:
  - "Phase evidence artifacts under .planning/ must be staged with git add -f (.planning is gitignored, contents are tracked)"
  - "All counts and file assertions taken via node -e, never grep -c / wc -l (the rtk hook mangles both)"

requirements-completed: [PERF-02]

duration: 12min
completed: 2026-08-14
---

# Phase 33 Plan 01: BEFORE Plan Capture Summary

**Both named queries are now on the permanent record as genuine sequential scans — kanban `Seq Scan on deals` (cost 2729.07, 2414 buffers) and reminder cron `Seq Scan on activities` (cost 5072.02, 3294 buffers, 79,023 rows removed) — captured and committed before a single line of index DDL existed anywhere.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-14T15:40:00Z
- **Completed:** 2026-08-14T15:52:00Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments

- Authored `verify-plans.sql`: a four-statement, read-only, idempotent capture script containing no DDL, no DML, no transaction control, no `ANALYZE`, no planner toggle and no credentials. Plan 33-03 re-runs it byte-identically, which makes the BEFORE/AFTER comparison sound by construction rather than by narration.
- Executed it against the live database (`psql -f` exit 0) and captured all four statements verbatim into `33-PLANS.md`.
- **D-07 satisfied.** At capture time the four tables carried zero non-pkey indexes; Q4 returned eleven `index_backed = f` rows, exercising the catalog path that is the only admissible proof for `deals.owner_id`.
- Pre-stated the acceptance criteria and the three "correct planner behaviour that is not a failure" caveats *ahead* of the evidence, so downstream verification cannot false-fail on bitmap node naming, on the `Closer` pipeline, or on `deals.owner_id`.

## Measured BEFORE results

| Statement | Plan node | Est. cost | Buffers | Notes |
|-----------|-----------|-----------|---------|-------|
| Q1 kanban, BDR - Base Fria (14.9%) | `Seq Scan on deals` | 2729.07 | 2414 on the deals node | `Rows Removed by Filter: 21453`; `stage_id = ANY (...)` confirms the literal form, no `Hash Cond` |
| Q2 kanban, single stage (~1.3%) | `Seq Scan on deals` | 2729.07 | 2414 | `Rows Removed by Filter: 21741` |
| Q3 reminder cron | `Seq Scan on activities` | 5072.02 | 3294 | `Rows Removed by Filter: 79023`, rows=0 (mid-day window, expected) |
| Q4 catalog | — | — | — | eleven rows, every `index_backed` = `f` |

Q1/Q2 contain neither `Bitmap Index Scan` nor any index access path on `deals`. Execution times (13.2 ms / 11.8 ms / 15.2 ms) are recorded for interest only and are not graded.

## Task Commits

1. **Task 1: Author the reusable read-only verification script** — `14cb80a` (chore)
2. **Task 2: Run the script against the live DB and commit the BEFORE capture** — `48dc3d3` (docs)

## Files Created/Modified

- `.planning/phases/33-database-indexes-for-the-crm-core/verify-plans.sql` — the four reusable statements (Q1 kanban SC-1, Q2 single-stage corroboration, Q3 reminder cron SC-2, Q4 eleven-column `pg_indexes` CTE assertion)
- `.planning/phases/33-database-indexes-for-the-crm-core/33-PLANS.md` — pre-stated acceptance block, verbatim BEFORE output for all four statements, and an `## AFTER (11 indexes)` placeholder for plan 33-03

## Decisions Made

- Wrote the "no planner toggle" rationale in prose rather than naming the GUC literally (see Deviations) — the meaning is preserved verbatim in both `verify-plans.sql` and `33-PLANS.md`.
- Committed the two artifacts in two atomic task commits rather than one, per the executor's per-task commit mandate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan-internal contradiction: the `enable_seqscan` string**

- **Found during:** Task 1
- **Issue:** The task action instructed the header comment to state that `SET enable_seqscan = off` is deliberately absent, while the task's own automated acceptance assertion rejects the file case-insensitively if the string `enable_seqscan` appears anywhere in it. Following the action literally would hard-fail the gate.
- **Fix:** The rationale is stated in full ("the well-known trick of switching the sequential-scan planner toggle off is NOT used here — that toggle does not forbid sequential scans, it merely applies a large cost penalty, so a plan produced under it proves only that an index is USABLE, never that the planner genuinely PREFERS it") without emitting the literal token. Intent fully preserved; the prohibition is honoured and documented.
- **Files modified:** `verify-plans.sql`
- **Verification:** Task 1's node assertion prints PASS and exits 0.
- **Committed in:** `14cb80a`

**2. [Rule 3 - Blocking] Same contradiction on `Index Scan using deals_stage_id_idx` in `33-PLANS.md`**

- **Found during:** Task 2
- **Issue:** The action asked the D-01 acceptance sentence to say a literal `Index Scan using deals_stage_id_idx` node is unachievable, but the acceptance criteria fail the task if that exact string appears anywhere before the `## AFTER` heading (it would suggest the BEFORE capture happened after the DDL).
- **Fix:** Phrased as "a literal plain `Index Scan` node naming `deals_stage_id_idx`", and used `Bitmap Index Scan on deals_stage_id_idx` (not `using`) for the accepted form — matching plan 33-03's own expected string. Meaning identical, guard intact.
- **Files modified:** `33-PLANS.md`
- **Verification:** Task 2's node assertion prints PASS and exits 0.
- **Committed in:** `48dc3d3`

**3. [Rule 3 - Blocking] `git log --name-only -1` check widened to the phase commit range**

- **Found during:** Task 2
- **Issue:** The verify asserted both new files appear in the single most recent commit, which presumes both were committed together. The executor commits each task atomically, so `verify-plans.sql` landed in the Task 1 commit and `33-PLANS.md` in the Task 2 commit.
- **Fix:** Ran the same check over `4145581..HEAD` (the phase's commit range). The guarantee being tested — that `git add -f` actually worked despite `.planning` being gitignored and that the artifacts have commit provenance — is fully preserved, and D-07's ordering is strengthened rather than weakened by the finer granularity.
- **Files modified:** none
- **Verification:** Both paths found in the phase range; assertion prints PASS.
- **Committed in:** n/a (verification-only change)

---

**Total deviations:** 3 auto-fixed (all Rule 3 — plan-internal assertion contradictions, no functional change)
**Impact on plan:** None. Every stated intent is preserved; only the literal wording of three strings changed so the plan's own automated gates could pass. No scope creep.

## Issues Encountered

- `sudo -S` collides with stdin redirection when copying the script into the container. Resolved exactly as RESEARCH.md prescribed: cache credentials once with `echo "…" | sudo -S -v`, then use `sudo -n` for the redirected invocation.

## Database Integrity

Verified after the capture: deals **25206**, activities **79023**, non-pkey indexes across the four tables **0**. Zero rows inserted, altered, removed or truncated. No `ANALYZE` run. No schema file, migration file or test file touched.

## Self-Check: PASSED

- `.planning/phases/33-database-indexes-for-the-crm-core/verify-plans.sql` — FOUND
- `.planning/phases/33-database-indexes-for-the-crm-core/33-PLANS.md` — FOUND
- Commit `14cb80a` — FOUND
- Commit `48dc3d3` — FOUND

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- D-07's ordering constraint is discharged. Plan 33-02 may now edit the four schema files.
- `verify-plans.sql` must NOT be edited by 33-02 or 33-03; byte-identity with this run is what makes the AFTER comparison valid.

---
*Phase: 33-database-indexes-for-the-crm-core*
*Completed: 2026-08-14*
