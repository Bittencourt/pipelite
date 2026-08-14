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

Captured 2026-08-14, plan 33-03, immediately after `drizzle/0012_typical_radioactive_man.sql`
was applied. Produced by re-running `verify-plans.sql` **byte-identically** — the file was not
edited between the two halves (`git diff --name-only HEAD -- verify-plans.sql` is empty), which is
what makes the comparison sound. `psql -f` exit 0. Verified at capture time: exactly 11 non-pkey
indexes across the four tables, row counts still 25,206 / 79,023 / 46,055 / 38,345,
`drizzle.__drizzle_migrations` at 5 rows, `random_page_cost` still 4.

### Q1 — SC-1, kanban board, `BDR - Base Fria` default pipeline (14.9% selectivity)

Purpose: identical statement to the BEFORE Q1. Must now reach `deals` through the index.

```
                                                               QUERY PLAN                                                               
----------------------------------------------------------------------------------------------------------------------------------------
 Sort  (cost=2836.92..2846.31 rows=3755 width=73) (actual time=3.643..3.800 rows=3753 loops=1)
   Sort Key: "position"
   Sort Method: quicksort  Memory: 474kB
   Buffers: shared hit=423 read=6
   ->  Bitmap Heap Scan on deals  (cost=45.68..2613.98 rows=3755 width=73) (actual time=0.301..1.893 rows=3753 loops=1)
         Recheck Cond: (stage_id = ANY ('{ad4d9fb5-92c7-4170-8e93-2163153a99d9,01374f39-b838-4977-a48e-8fd126aa83f5}'::text[]))
         Filter: (deleted_at IS NULL)
         Heap Blocks: exact=419
         Buffers: shared hit=420 read=6
         ->  Bitmap Index Scan on deals_stage_id_idx  (cost=0.00..44.75 rows=3755 width=0) (actual time=0.240..0.240 rows=3753 loops=1)
               Index Cond: (stage_id = ANY ('{ad4d9fb5-92c7-4170-8e93-2163153a99d9,01374f39-b838-4977-a48e-8fd126aa83f5}'::text[]))
               Buffers: shared hit=1 read=6
 Planning:
   Buffers: shared hit=255
 Planning Time: 3.810 ms
 Execution Time: 4.103 ms
(16 rows)
```

`Bitmap Heap Scan on deals` fed by `Bitmap Index Scan on deals_stage_id_idx`, exactly the plan
D-01 pre-accepted. The plan carries no hash-join condition against the `stages` table, so the
literal value-list form held across both runs (Pitfall 4) rather than the subquery form leaking in.

### Q2 — SC-1 wide-margin corroboration, single stage (~1.3% selectivity)

```
                                                               QUERY PLAN                                                               
----------------------------------------------------------------------------------------------------------------------------------------
 Sort  (cost=2827.13..2835.80 rows=3467 width=73) (actual time=2.715..2.859 rows=3465 loops=1)
   Sort Key: "position"
   Sort Method: quicksort  Memory: 447kB
   Buffers: shared hit=392
   ->  Bitmap Heap Scan on deals  (cost=43.16..2623.28 rows=3467 width=73) (actual time=0.180..1.235 rows=3465 loops=1)
         Recheck Cond: (stage_id = 'ad4d9fb5-92c7-4170-8e93-2163153a99d9'::text)
         Filter: (deleted_at IS NULL)
         Heap Blocks: exact=387
         Buffers: shared hit=392
         ->  Bitmap Index Scan on deals_stage_id_idx  (cost=0.00..42.29 rows=3467 width=0) (actual time=0.133..0.134 rows=3465 loops=1)
               Index Cond: (stage_id = 'ad4d9fb5-92c7-4170-8e93-2163153a99d9'::text)
               Buffers: shared hit=5
 Planning Time: 0.095 ms
 Execution Time: 3.116 ms
(14 rows)
```

### Q3 — SC-2, activity-reminder cron query

```
                                                              QUERY PLAN                                                               
---------------------------------------------------------------------------------------------------------------------------------------
 Index Scan using activities_due_date_idx on activities  (cost=0.30..12.21 rows=1 width=130) (actual time=0.037..0.037 rows=0 loops=1)
   Index Cond: ((due_date >= now()) AND (due_date <= (now() + '01:00:00'::interval)))
   Filter: ((completed_at IS NULL) AND (deleted_at IS NULL) AND (reminder_sent_at IS NULL))
   Buffers: shared hit=5
 Planning:
   Buffers: shared hit=96
 Planning Time: 0.974 ms
 Execution Time: 0.055 ms
(8 rows)
```

A literal `Index Scan using activities_due_date_idx`. The `due_date` range moved from the Filter
into the `Index Cond`; the three `IS NULL` predicates remain a cheap residual Filter over the
single candidate row, exactly as designed (see "Not gaps" on the declined narrow partial index).

### Q4 — SC-3, catalog assertion

Eleven `t` rows — the required AFTER result, and the only proof available for `deals.owner_id`.

```
      tbl      |       col       | index_backed 
---------------+-----------------+--------------
 activities    | deal_id         | t
 activities    | deleted_at      | t
 activities    | due_date        | t
 deals         | deleted_at      | t
 deals         | organization_id | t
 deals         | owner_id        | t
 deals         | person_id       | t
 deals         | stage_id        | t
 organizations | deleted_at      | t
 people        | deleted_at      | t
 people        | organization_id | t
(11 rows)
```

---

## Deltas

Taken from the two captures in **this file**, not from `33-RESEARCH.md`. Costs and buffers are the
graded figures.

| Statement | BEFORE node | AFTER node | Cost (before → after) | Buffers on the scanned table (before → after) |
|-----------|-------------|------------|------------------------|-----------------------------------------------|
| **Q1** kanban, BDR - Base Fria (14.9%) | `Seq Scan on deals` | `Bitmap Heap Scan on deals` ← `Bitmap Index Scan on deals_stage_id_idx` | 2729.07 → **2613.98** (−4.2%) | 2414 → **426** (420 hit + 6 read) — **5.7× fewer** |
| **Q2** kanban, single stage (~1.3%) | `Seq Scan on deals` | `Bitmap Heap Scan on deals` ← `Bitmap Index Scan on deals_stage_id_idx` | 2729.07 → **2623.28** | 2414 → **392** — 6.2× fewer |
| **Q3** reminder cron | `Seq Scan on activities`, `Rows Removed by Filter: 79023` | `Index Scan using activities_due_date_idx` | 5072.02 → **12.21** — **415× cheaper** | 3294 → **5** — **659× fewer** |
| **Q4** catalog | eleven `index_backed = f` | eleven `index_backed = t` | — | — |

Total-query cost including the `Sort` node: Q1 2952.02 → 2836.92, Q2 2932.93 → 2827.13. The `Sort`
survives in every variant — `ORDER BY position` across a multi-value `stage_id = ANY (...)` cannot
be satisfied by a leading-`stage_id` index, and the composite that might have removed it was
measured to fail SC-1 outright (D-04).

Execution times are reported for interest only and are **not graded**, because they fluctuate run
to run with cache state: Q1 13.243 ms → 4.103 ms, Q2 11.789 ms → 3.116 ms, Q3 15.197 ms →
0.055 ms.

---

## Verdicts

ROADMAP Phase 33 success criteria, quoted verbatim.

| SC | Criterion (verbatim) | Verdict | Evidence |
|----|----------------------|---------|----------|
| **SC-1** | "`EXPLAIN ANALYZE` on the kanban board query shows an index scan on `deals.stage_id` where it previously showed a sequential scan" | ✅ **SATISFIED** | AFTER Q1 shows `Bitmap Heap Scan on deals` fed by `Bitmap Index Scan on deals_stage_id_idx` with `Index Cond: (stage_id = ANY (...))`, where BEFORE Q1 — the byte-identical statement, in the same file — shows `Seq Scan on deals … Rows Removed by Filter: 21453`. Buffers on the deals node 2414 → 426. **Per D-01 the bitmap node form IS an index scan for grading purposes**: the index is unambiguously the access path, and a literal plain `Index Scan` node on `deals_stage_id_idx` is physically unachievable for a ~3,753-row scattered fetch at any selectivity where the index beats a sequential scan. Its absence must **not** be required or graded as a failure. Q2 corroborates at ~1.3% selectivity, where the margin is far wider, with the same index-driven plan. |
| **SC-2** | "`EXPLAIN ANALYZE` on the activity-reminder cron query shows an index scan on `activities.due_date`" | ✅ **SATISFIED** | AFTER Q3 shows the literal `Index Scan using activities_due_date_idx on activities`, cost **5072.02 → 12.21** (415× cheaper) and buffers **3294 → 5** (659× fewer), where BEFORE Q3 shows `Seq Scan on activities` with `Rows Removed by Filter: 79023`. The `due_date` range predicate moved into `Index Cond`. |
| **SC-3** | "Every core CRM foreign key (`deals.organization_id`, `deals.person_id`, `deals.owner_id`, `activities.deal_id`, `people.organization_id`) and every `deleted_at` filter column on deals/orgs/people/activities is index-backed via a single migration" | ✅ **SATISFIED** | AFTER Q4 returns eleven `index_backed = t` rows against the live catalog, testing the **leading** index column (`a.attnum = i.indkey[0]`), up from eleven `f` in the BEFORE half. Delivered by exactly one generated migration, `drizzle/0012_typical_radioactive_man.sql`, containing 11 `CREATE INDEX` statements and nothing else. `deals.owner_id` is **catalog-proven only (D-05)**: `n_distinct = 1` in this dataset, so the planner correctly ignores that index forever and no plan capture can demonstrate it — SC-3 asks for index-backing, which is a catalog fact. |
| **SC-4** | "Application behavior is unchanged — the suite passes with no test modifications" | ✅ **SATISFIED** | All three Phase 32 gates green: `npm test` exit 0 at exactly the baseline (41 files passed, 461 passed / 4 skipped), `npm run typecheck` exit 0, `npm run lint` exit 0. The whole-phase diff touches **zero** `*.test.ts` files and nothing outside the four schema files, the 0012 migration, its snapshot and the journal. No query, server action or route was modified; row visibility is byte-identical because soft-delete remains enforced solely by the app's untouched `isNull(deletedAt)` predicates. |

---

## Not gaps

Correct behaviour that must not be mistaken for a missing result:

- **The `Closer` pipeline keeps its `Seq Scan`.** It covers 61% of the deals table, well past the
  measured 15–19% selectivity crossover, so a sequential scan is genuinely cheaper. The planner is
  right. Deliberately not measured here.
- **`deals.owner_id` never uses its index.** `n_distinct = 1` — every deal shares one owner — so
  `owner_id = ?` matches 100% or 0% of rows. Catalog-backed (Q4), plan-invisible forever (D-05).
- **The `deleted_at IS NULL` read path is correctly NOT faster.** Those predicates match ~100% of
  rows, so the planner rightly ignores the index (measured: `organizations WHERE deleted_at IS NULL
  ORDER BY name LIMIT 50` still chooses a `Seq Scan`). The four `deleted_at` indexes serve the
  `IS NOT NULL` direction — `deals WHERE deleted_at IS NOT NULL` → `Index Scan using
  deals_deleted_at_idx`, cost 8.30 — which is what Phase 37 Trash & Restore needs. SC-3 asks only
  that the columns be index-backed.
- **The `Sort` node survives on Q1/Q2.** No single-column index can satisfy `ORDER BY position`
  across a multi-value `stage_id = ANY (...)`, and the `(stage_id, position)` composite that might
  have was measured to grow the index 200 kB → 1696 kB and push the planner back to `Seq Scan`,
  actively failing SC-1 (D-04).
- **No narrow partial index was added for the reminder cron.** `(due_date) WHERE completed_at IS
  NULL AND deleted_at IS NULL AND reminder_sent_at IS NULL` is cheaper in isolation (8.31 vs 12.21,
  64 kB vs 568 kB), but it would be a twelfth index outside the PERF-01 list and
  `reminder_sent_at IS NULL` is true for all 79,022 activities today, so it prunes nothing.
- **`random_page_cost` stays at 4 by decision (D-08).** Verified still `4` after the migration. It
  is the Postgres default, calibrated for spinning disks, and it is precisely why the crossover
  sits as low as 15–19%; lowering it to ~1.1 for SSD would widen every index win. That is server
  configuration rather than an index, and it is deferred to a later milestone.

### Measured cost of this phase

- **Storage:** **7328 kB** of added index footprint across the eleven indexes, measured live —
  `activities_deal_id_idx` 1328 kB, `deals_person_id_idx` 1280 kB, `people_organization_id_idx`
  1208 kB, `deals_organization_id_idx` 1192 kB, `activities_due_date_idx` 568 kB,
  `activities_deleted_at_idx` 552 kB, `organizations_deleted_at_idx` 328 kB,
  `people_deleted_at_idx` 280 kB, `deals_owner_id_idx` 200 kB, `deals_stage_id_idx` 200 kB,
  `deals_deleted_at_idx` 192 kB.
- **Write availability:** a **~1.08 s** write-blocking window per deploy. `CREATE INDEX` without
  `CONCURRENTLY` takes a `ShareLock` per table — reads continue, writes block for the build. All
  eleven statements run in one transaction, so a failure leaves zero indexes rather than a partial
  set. Acceptable for a single-instance self-hosted deployment applied at deploy time; a future
  multi-instance or high-write deployment should re-evaluate rather than rediscover this.
- **Reversal:** drizzle-kit has no down migrations. Manual reversal is a lossless `DROP INDEX` of
  the eleven named indexes **plus** removing the declarations from the four schema files — omit the
  schema revert and the next `generate` would recreate them. No row is altered, moved or
  reinterpreted, so there is no data-loss path to roll back from.
