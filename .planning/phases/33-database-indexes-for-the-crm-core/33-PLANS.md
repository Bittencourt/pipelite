# Phase 33 — BEFORE / AFTER Query Plan Evidence

**Database:** PostgreSQL 16.13 in `pipelite-postgres-1`, holding real imported CRM data
(25,206 deals / 79,023 activities / 46,055 organizations / 38,345 people).
**Capture script:** `.planning/phases/33-database-indexes-for-the-crm-core/verify-plans.sql`,
executed byte-identically for both halves of this document.
**BEFORE captured:** 2026-08-14, plan 33-01, with **zero non-pkey indexes** on the four tables.

This artifact is the evidence for SC-1 and SC-2, both of which are worded as *transitions*
("where it previously showed a sequential scan"). Per **D-07** the BEFORE half was captured and
committed before a single line of index DDL existed anywhere in the repo or the database. Once
indexes exist that clause is unprovable without a second schema mutation, so the ordering is not
a convention — it is the proof.

Nothing in this phase inserts, alters, removes or truncates a row, and no standalone `ANALYZE`
is run, so the costs below stay directly comparable to the `33-RESEARCH.md` baseline.

---

## Acceptance Criteria (pre-stated, per D-01/D-05/D-08)

These are recorded **before** any evidence is shown, so that downstream verification cannot
mistake correct planner behaviour for a phase failure.

**D-01 — the bitmap node form satisfies SC-1.**
For Q1, a `Bitmap Heap Scan on deals` fed by a `Bitmap Index Scan on deals_stage_id_idx`
**SATISFIES SC-1**. A literal plain `Index Scan` node naming `deals_stage_id_idx` is physically
unachievable for a ~3,753-row scattered fetch at any selectivity where the index beats a
sequential scan — Postgres will always prefer the bitmap path there. Its absence is **NOT** a
failure and must not be graded as one. A `Parallel Bitmap Heap Scan on deals` parent node is
equally acceptable. SC-2 is unaffected and does yield a literal `Index Scan`.

**Pitfall 1 — the `Closer` pipeline keeps its sequential scan, correctly.**
The measured selectivity crossover on `deals` sits between ~15% and ~19% of the table. The
`Closer` pipeline covers 61% of the deals table and therefore correctly keeps a sequential scan
even with a perfect index present. That is the cost model being right, not a gap. It is
deliberately not measured here and must not be treated as a missing result. The app's actual
default pipeline (`BDR - Base Fria`, 14.9%) is what Q1 pins, and it sits inside the
index-winning region with only a 4% cost margin.

**D-05 — `deals.owner_id` is catalog-proven only.**
`deals.owner_id` has `n_distinct = 1` in this dataset (every deal shares one owner), so the
planner correctly ignores its index forever. Q4's catalog row is the only proof available and no
plan-capture proof will be attempted. SC-3 asks that the column be *index-backed*, which is a
catalog fact, not a plan-choice fact.

**D-02 / D-04 — all eleven indexes are plain single-column btrees.**
No partial indexes: a partial `(stage_id) WHERE deleted_at IS NULL` is byte-identical in size
(200 kB) and cost (2613.98) to the plain form on this data — only 12 of 25,206 deals are
soft-deleted — **and** it would break the stage-delete guard at
`src/app/admin/pipelines/actions.ts:483-489`, which queries `stage_id` with no `deleted_at`
filter. No composite indexes: a `(stage_id, position)` composite was measured to grow the index
from 200 kB to 1696 kB (because `position` defeats btree deduplication), pushing bitmap cost
above sequential-scan cost so the planner reverts to `Seq Scan` — it would actively **fail**
SC-1.

**D-08 — `random_page_cost` stays at 4.**
It is the Postgres default, calibrated for spinning disks, and it is the reason the selectivity
crossover sits as low as 15–19%. Lowering it to ~1.1 (SSD-appropriate) would widen every index
win, but it is server configuration rather than an index and is explicitly out of this phase's
scope.

**Honest disclosure — what the `deleted_at` indexes do and do not buy.**
The four plain `deleted_at` indexes will **not** speed up the `deleted_at IS NULL` read path.
Measured: `organizations WHERE deleted_at IS NULL ORDER BY name LIMIT 50` still correctly chooses
a `Seq Scan` with the index present, because `deleted_at IS NULL` matches ~100% of rows. They
serve the `IS NOT NULL` direction (`deals WHERE deleted_at IS NOT NULL` → `Index Scan using
deals_deleted_at_idx`, cost 8.30), which is what Phase 37 Trash & Restore needs. SC-3 asks only
that the columns be index-backed.

**No planner toggle.** `SET enable_seqscan = off` is prohibited and appears nowhere: it only
applies a cost penalty, so it would prove an index *usable*, never *preferred*.

---

## BEFORE (no indexes)

Captured 2026-08-14 with `psql -f /tmp/33-verify-plans.sql` (exit 0). Verified at capture time:
zero non-pkey indexes existed across `deals`, `activities`, `people`, `organizations`; row counts
25,206 / 79,023 / 46,055 / 38,345.

### Q1 — SC-1, kanban board, `BDR - Base Fria` default pipeline (14.9% selectivity)

Purpose: the kanban query exactly as `src/app/deals/page.tsx:104-145` issues it, with the literal
stage-ID list Drizzle emits. Must show a sequential scan on `deals` and no index access path.

```
                                                                     QUERY PLAN                                                                      
-----------------------------------------------------------------------------------------------------------------------------------------------------
 Sort  (cost=2952.02..2961.41 rows=3755 width=73) (actual time=12.819..12.981 rows=3753 loops=1)
   Sort Key: "position"
   Sort Method: quicksort  Memory: 474kB
   Buffers: shared hit=2417
   ->  Seq Scan on deals  (cost=0.00..2729.07 rows=3755 width=73) (actual time=0.015..10.883 rows=3753 loops=1)
         Filter: ((deleted_at IS NULL) AND (stage_id = ANY ('{ad4d9fb5-92c7-4170-8e93-2163153a99d9,01374f39-b838-4977-a48e-8fd126aa83f5}'::text[])))
         Rows Removed by Filter: 21453
         Buffers: shared hit=2414
 Planning:
   Buffers: shared hit=172
 Planning Time: 1.765 ms
 Execution Time: 13.243 ms
(12 rows)
```

`stage_id = ANY (...)` confirms the literal value-list form (Pitfall 4): there is no
`Hash Cond: (deals.stage_id = stages.id)`, so the subquery form did not leak in.

### Q2 — SC-1 wide-margin corroboration, single stage (~1.3% selectivity)

Purpose: the same query at strictly lower selectivity than Q1, where the index margin is far
wider. No specific row count is asserted for it.

```
                                                  QUERY PLAN                                                   
---------------------------------------------------------------------------------------------------------------
 Sort  (cost=2932.93..2941.59 rows=3467 width=73) (actual time=11.362..11.515 rows=3465 loops=1)
   Sort Key: "position"
   Sort Method: quicksort  Memory: 447kB
   Buffers: shared hit=2414
   ->  Seq Scan on deals  (cost=0.00..2729.07 rows=3467 width=73) (actual time=0.013..8.719 rows=3465 loops=1)
         Filter: ((deleted_at IS NULL) AND (stage_id = 'ad4d9fb5-92c7-4170-8e93-2163153a99d9'::text))
         Rows Removed by Filter: 21741
         Buffers: shared hit=2414
 Planning Time: 0.078 ms
 Execution Time: 11.789 ms
(10 rows)
```

### Q3 — SC-2, activity-reminder cron query

Purpose: the exact SQL Drizzle emits from `src/app/api/internal/email/process/route.ts:32-49`.
`due_date` is stored at `00:00:00` for every row, so a mid-day 1-hour window legitimately matches
zero rows; a midnight-boundary run matches one. Both are valid and both yield the same plan shape.

```
                                                                             QUERY PLAN                                                                              
---------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Seq Scan on activities  (cost=0.00..5072.02 rows=1 width=130) (actual time=15.180..15.181 rows=0 loops=1)
   Filter: ((completed_at IS NULL) AND (deleted_at IS NULL) AND (reminder_sent_at IS NULL) AND (due_date >= now()) AND (due_date <= (now() + '01:00:00'::interval)))
   Rows Removed by Filter: 79023
   Buffers: shared hit=3294
 Planning:
   Buffers: shared hit=53
 Planning Time: 0.760 ms
 Execution Time: 15.197 ms
(8 rows)
```

### Q4 — SC-3, catalog assertion

Purpose: does every one of the eleven PERF-01 target columns have an index whose **leading**
column is that column? **Eleven `f` rows is the expected and required BEFORE result** — it
establishes that zero of the eleven is incidentally covered (Postgres indexes PRIMARY KEY and
UNIQUE constraints but has never auto-indexed FOREIGN KEY columns), and it exercises the catalog
proof path that is the only admissible evidence for `deals.owner_id` (D-05).

```
      tbl      |       col       | index_backed 
---------------+-----------------+--------------
 activities    | deal_id         | f
 activities    | deleted_at      | f
 activities    | due_date        | f
 deals         | deleted_at      | f
 deals         | organization_id | f
 deals         | owner_id        | f
 deals         | person_id       | f
 deals         | stage_id        | f
 organizations | deleted_at      | f
 people        | deleted_at      | f
 people        | organization_id | f
(11 rows)
```

---

## AFTER (11 indexes)

_Pending — filled in by plan 33-03 after the migration is applied._
