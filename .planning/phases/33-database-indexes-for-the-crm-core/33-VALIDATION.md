---
phase: 33
slug: database-indexes-for-the-crm-core
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-14
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.0.18 (`npm test`, established in Phase 32) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run <path>` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~14s suite; `tsc --noEmit` ~23s; `eslint` ~24s |

**Critical:** the unit suite cannot validate this phase's substance. All 18 DB-touching test files `vi.mock("@/db")`, so indexes are invisible to them — that is exactly what SC-4 requires ("suite passes with no test modifications"), but it means the real validation is **SQL-level, against the live database**, not test-level.

**Database:** PostgreSQL 16 at `localhost:5433` (host) / `postgres:5432` (Docker network). Contains real imported CRM data — 25,206 deals, 79,023 activities, 46,055 organizations, 38,345 people. **Do not seed, do not truncate, do not mutate rows.**

---

## Sampling Rate

- **After the schema edit, before generating:** `npx drizzle-kit generate` and read the emitted SQL — assert `CREATE INDEX` only, no `CONCURRENTLY` (D-03), no composite `(stage_id, position)` (D-04), no `WHERE` clauses (D-02)
- **After the migration is applied:** re-run the two `EXPLAIN ANALYZE` captures and the `pg_indexes` catalog assertion
- **After every task commit:** `npm test` (guards SC-4 — must stay green with zero test edits)
- **Before `/gsd:verify-work`:** all three Phase 32 gates green AND both AFTER plans captured AND catalog assertion passing
- **Max feedback latency:** ~25s

---

## Per-Task Verification Map

| Requirement | Verifies | Test Type | Automated Command | Status |
|-------------|----------|-----------|-------------------|--------|
| SC-7 (ordering, D-07) | BEFORE plans captured **before** migration | SQL | Both BEFORE `EXPLAIN (ANALYZE, BUFFERS)` outputs saved to a file, committed, and timestamped earlier than the migration commit | ⬜ pending |
| PERF-01 / SC-1 | Kanban query becomes index-driven | SQL | `EXPLAIN (ANALYZE, BUFFERS)` on the kanban query pinned to the `BDR - Base Fria` stage IDs shows `Bitmap Index Scan using deals_stage_id_idx`. **D-01: `Bitmap Index Scan` SATISFIES this criterion — a literal `Index Scan` node is physically unachievable and must NOT be required.** Expect ~660ms/2414 buffers → ~210ms/426 buffers | ⬜ pending |
| PERF-02 / SC-2 | Reminder cron query becomes index scan | SQL | `EXPLAIN (ANALYZE, BUFFERS)` shows a literal `Index Scan using activities_due_date_idx`. Expect cost 5071.99 → 12.21, ~24.5ms → ~0.094ms, 3294 → 5 buffers | ⬜ pending |
| SC-3 | All 11 columns index-backed via ONE migration | SQL + file | `pg_indexes` CTE assertion returns a row for each of the 11 target columns; exactly one new migration file exists in `drizzle/` (expected `0012_*.sql`) | ⬜ pending |
| SC-3 (D-05) | `deals.owner_id` index exists | SQL catalog only | Catalog assertion only — **`EXPLAIN` cannot demonstrate this** (`n_distinct = 1`, so the planner correctly ignores the index). Do not attempt an EXPLAIN proof | ⬜ pending |
| SC-4 | Zero behavior change | CLI + git | `npm test` exit 0 with 41 files / 461 passed / 4 skipped; `git diff --name-only` for the phase touches **no** `*.test.ts` file; `npx tsc --noEmit` exit 0; `npx eslint` exit 0 | ⬜ pending |
| D-02 | Indexes are plain, not partial | source | Generated migration SQL contains no `WHERE` clause on any `CREATE INDEX` | ⬜ pending |
| D-03 | No CONCURRENTLY | source | Generated SQL contains no `CONCURRENTLY`; `npm run db:migrate` exits 0 | ⬜ pending |
| D-04 | No composite stage index | source | No `CREATE INDEX` names both `stage_id` and `position` | ⬜ pending |
| D-06 | Schema-first, not hand-written SQL | source | Every new index appears in a `src/db/schema/*.ts` file via the `index()` builder; the migration is generated output, not hand-authored | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — vitest and the three CI gates were established in Phase 32, and Postgres is up and healthy.

- [ ] BEFORE `EXPLAIN ANALYZE` capture (D-07) is a hard prerequisite for SC-1/SC-2 and must be the first task

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None | — | — | Every criterion in this phase is verifiable by SQL, catalog query, generated-SQL inspection, or the test suite. |

**Regression watch (not a criterion):** D-02 rejected partial indexes partly because they would break the stage-delete guard at `src/app/admin/pipelines/actions.ts:483-489`. Since plain indexes were chosen, that guard is unaffected — but if anyone later reintroduces a partial index, re-check it.

---

## Validation Sign-Off

- [ ] All tasks have an automated verify command
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] BEFORE-capture ordering (D-07) enforced by task sequence, not by convention
- [ ] SC-1 acceptance pre-states that `Bitmap Index Scan` passes (D-01) so verification cannot false-fail on wording
- [ ] `deals.owner_id` verified by catalog, not EXPLAIN (D-05)
- [ ] No watch-mode flags
- [ ] No seeding, truncation, or row mutation of the live dev database
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
