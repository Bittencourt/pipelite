---
phase: 35-notes-record-timeline
plan: 08
subsystem: timeline
tags: [tdd, sql, union-all, keyset-paging, pre-limit, security, drizzle, performance]

# Dependency graph
requires:
  - phase: 35
    plan: 01
    provides: "notes + deal_stage_history schema and the notes_live_idx / deal_stage_history_deal_idx indexes the branches seek on"
  - phase: 35
    plan: 05
    provides: "TimelineEntry union, TimelineCursor, TimelinePage, TIMELINE_PAGE_SIZE, encodeCursor/decodeCursor"
provides:
  - "buildTimelineQuery — PURE composer returning the timeline SQL without executing it, so shape/pre-limit/binding are assertable without a database"
  - "assembleTimeline — one page of the merged feed with hasMore + nextCursor derived from an n+1 fetch"
  - "countTimeline — the header badge count, summed across applicable sources"
  - "TimelineSource + TIMELINE_SOURCES — the SQL-fragment-level plug point Phase 36 appends its audit source to"
affects: [35-09 server action, 35-11 timeline rendering, 35-13 load-more, 36 audit log]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-limited UNION ALL: every branch carries its own ORDER BY ... DESC, id DESC LIMIT n+1 before the union, so Postgres emits a Merge Append and each branch stops at 21 rows"
    - "Pure SQL composer + PgDialect().sqlToQuery rendering: the statement text AND the bound parameter array are unit-assertable before a database exists"
    - "Two-step hydration: the union carries only (kind, id, occurred_at); one batched typed read per PRESENT kind fetches display columns, then results are merged back into the union's row order via a Map"
    - "Literal table/column identifiers inside a drizzle sql template with every VALUE as a ${} bind parameter — the injection control that survives grep-gating"

key-files:
  created:
    - src/lib/timeline/sources.ts
    - src/lib/timeline/assemble.ts
    - src/lib/timeline/assemble.test.ts
  modified: []

key-decisions:
  - "The optional activities (deal_id, created_at DESC NULLS LAST) WHERE deleted_at IS NULL index is SKIPPED, as locked in the CONTEXT Post-Research Addendum. Re-measured this plan: the activities branch does a Bitmap Index Scan on activities_deal_id_idx plus a 30 kB top-N heapsort over 117 rows, 0.466 ms inside a 1.5 ms whole-statement cold run. Max activities per deal in the live DB is 117; the index would buy a cold-cache case that a warm sub-millisecond query does not have"
  - "TimelineSource.branch takes a TimelineTarget { entityType, entityId } rather than a bare entityId string. The plan's stated interface passed only entityId, but the notes source is polymorphic and MUST filter on entity_type — the stated signature could not express its own stated WHERE clause. Arity is unchanged"
  - "The whole statement is wrapped as SELECT kind, id, occurred_at FROM ( ... ) AS t. Postgres rejects `(SELECT ...) ORDER BY ...` with `multiple ORDER BY clauses not allowed` when there is exactly one parenthesized branch — verified against the live DB. The wrapper makes the single-source and multi-source shapes identical, and EXPLAIN ANALYZE confirms it does not change the plan"
  - "Timestamps in the keyset predicate bind as timestamptz against timestamp columns; verified with EXPLAIN that Postgres keeps the ROW(...) < ROW(...) comparison as a filter over an index-driven Bitmap Index Scan on the deal predicate"
  - "assembleTimeline always computes total (via countTimeline) because TimelinePage declares it non-optional. The two run under one Promise.all"
  - "Hydration results are keyed by `${kind}:${id}`, not by id alone — ids are UUIDs so a collision is not realistic, but the composite key makes it impossible by construction"
  - "A union row whose hydration returns nothing (soft-deleted between the two reads) is dropped rather than rendered as a hole. nextCursor still derives from the last KEPT raw row, so paging cannot stall on it"

patterns-established:
  - "Hand-composed SQL in this repo is verified by rendering it with new PgDialect().sqlToQuery(query) and asserting on BOTH the statement text and the params array — injection probes must appear in params and must not appear in the text"

requirements-completed: [NOTE-02]

# Metrics
duration: 42min
completed: 2026-08-15
---

# Phase 35 Plan 08: Timeline Assembler Summary

**One pre-limited `UNION ALL` statement — three branches for a deal, a single notes branch with no degenerate union for everything else — with keyset paging bound as parameters, `hasMore` derived from an n+1 fetch, and two-step hydration merged back into the union's own row order.**

## Performance

- **Duration:** ~42 min
- **Tasks:** 2 (RED, GREEN)
- **Files created:** 3
- **Tests:** 26 new, all passing; `src/lib/timeline/` 40 passing; full suite 960 passed / 4 skipped across 62 files plus 8 RSC tests, unregressed

## Accomplishments

- `src/lib/timeline/sources.ts` defines `TimelineSource` and the three concrete sources. The seam sits at the **SQL fragment** level, not at the "run a query per source and merge in JS" level, because the latter makes the pre-limited union impossible. `TIMELINE_SOURCES` is a plain array; Phase 36 appends a fourth entry and nothing else in the assembler changes.
- `src/lib/timeline/assemble.ts` exposes `buildTimelineQuery` (pure), `assembleTimeline` and `countTimeline`. Purity is what makes the three load-bearing properties assertable without a database: the shape, the pre-limit, and the parameter binding.
- The composed statement was **executed against the live database**, not merely rendered. For a deal with 117 activities the plan is a `Merge Append` over three pre-limited branches (`Index Scan using notes_live_idx`, `Bitmap Index Scan on activities_deal_id_idx`, `Bitmap Index Scan on deal_stage_history_deal_idx`), 1.519 ms cold. The single-branch organization form runs 0.512 ms on an `Index Scan using notes_live_idx`.
- The keyset predicate was executed with real values against the live DB: with a cursor of `('2026-03-11 10:27:39.793', 'zzz')` against 117 activities that all share one millisecond, the query returned exactly the 21 rows whose id sorts below `zzz` — the id tie-break doing the work the timestamp cannot.
- 26 tests cover branch composition, the soft-delete predicate, the pre-limit (`order by` and `limit` occurrence counts), the `n+1` limit value in `params`, cursor presence/absence, both injection probes, ordering, `hasMore`/`nextCursor` derivation, one-statement fetching, malformed-cursor degradation, per-kind hydration, ordering preservation, per-kind entry mapping, missing-hydration handling, and the count sum.

## Task Commits

1. **Task 1 (RED): failing assembler tests** — `341d454` (test)
2. **Task 2 (GREEN): sources + assembler implementation** — `d54e3b4` (feat)

REFACTOR was not needed — GREEN passed 26/26 on its first run and required no cleanup pass.

## TDD Gate Compliance

- **RED** — `341d454`. `npx vitest run src/lib/timeline/assemble.test.ts` exited 1 with exactly the expected cause: `Cannot find module '/src/lib/timeline/assemble'`. A missing module, not a broken assertion. No test passed unexpectedly, so the RED gate was real.
- **GREEN** — `d54e3b4`. 26/26 passing, `npm run typecheck` exit 0, `npm run lint` exit 0 (128 pre-existing repo-wide warnings, **zero** in `src/lib/timeline`), `npm test` 960 passed / 4 skipped.
- Gate order verified in `git log`: `test(35-08):` precedes `feat(35-08):`.

## The Statement This Produces

Rendered for `buildTimelineQuery('deal', $id, cursor, 20)` — the exact text, with every value a bind parameter:

```sql
SELECT kind, id, occurred_at FROM ((
      SELECT 'note' AS kind, n.id, n.created_at AS occurred_at
      FROM "notes" n
      WHERE n.entity_type = $1
        AND n.entity_id = $2
        AND n.deleted_at IS NULL AND (n.created_at, n.id) < ($3, $4)
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT $5
    ) UNION ALL (
      SELECT 'activity' AS kind, a.id, a.created_at AS occurred_at
      FROM "activities" a
      WHERE a.deal_id = $6
        AND a.deleted_at IS NULL AND (a.created_at, a.id) < ($7, $8)
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT $9
    ) UNION ALL (
      SELECT 'stage_change' AS kind, h.id, h.created_at AS occurred_at
      FROM "deal_stage_history" h
      WHERE h.deal_id = $10 AND (h.created_at, h.id) < ($11, $12)
      ORDER BY h.created_at DESC, h.id DESC
      LIMIT $13
    )) AS t
    ORDER BY "occurred_at" DESC, "id" DESC
    LIMIT $14
```

For `organization`, `person` and `activity` the same composer emits the notes branch alone with **zero** `UNION ALL` and 6 parameters.

## Files Created/Modified

- `src/lib/timeline/sources.ts` — `TimelineTarget`, `TimelineSource`, `notesSource`, `activitiesSource`, `stageChangeSource`, `TIMELINE_SOURCES`. Each source owns its branch, its count branch and its batched hydration read. Threat IDs T-35-01/02/06/26/27 are cited at the predicates that implement them.
- `src/lib/timeline/assemble.ts` — `buildTimelineQuery`, `assembleTimeline`, `countTimeline`, plus the zod `entityTypeSchema` gate that runs before any fragment is composed.
- `src/lib/timeline/assemble.test.ts` — 26 tests, 534 lines, organised into the `pre-limit`, `cursor` and `hasMore` describe blocks named by 35-VALIDATION.md.

## Decisions Made

- **The `activities (deal_id, created_at DESC)` index stays skipped.** This was CONTEXT-locked, and re-measuring in this plan supports it: the activities branch is the slowest of the three at 0.466 ms, inside a 1.519 ms cold whole-statement run, on the worst deal in the database (117 activities). The sort is a 30 kB `top-N heapsort`, well inside `work_mem`. Adding an index to remove a sub-millisecond heapsort would be paying write cost for a read that is already fast.
- **`Bitmap Index Scan` is treated as satisfying "index scan"**, per Phase 33 D-01. Two of the three branches plan as bitmap scans and that is correct behaviour, not a regression. No verification step in this plan demands a literal `Index Scan` node.
- **Identifiers are literal, values are bound.** The branches write `n.created_at`, `a.deal_id`, `h.id` as plain text and alias each table (`FROM ${notes} n`). This is what lets the source carry a literal `deleted_at IS NULL` predicate — both for the grep gate and, more importantly, for a reader who greps the codebase for soft-delete filters. Zero raw-fragment escapes, zero string concatenation.
- **Ordering is on `created_at` for all three sources**, including activities. A history feed sorted by a *future* due date reads wrong; `created_at` is the honest "when it happened". The test asserts the rendered SQL contains neither `due_date` nor `completed_at`.
- **`stageChangeSource.hydrate` uses `leftJoin` for the destination stage too**, with `?? ""` fallbacks, even though `to_stage_id` is `NOT NULL` with a real foreign key. Mixing `innerJoin` into an otherwise-left-joined chain gave no typing benefit here, and a uniform left join means a hypothetically orphaned row degrades to an empty label rather than silently vanishing from the page.

## Deviations from Plan

### 1. [Rule 3 - Blocking] `TimelineSource.branch` takes a target object, not a bare `entityId`

- **Found during:** Task 2, writing `notesSource`.
- **Issue:** The plan's `<interfaces>` block declares `branch(entityId: string, cursor, limit)`, but the same plan's `<action>` requires the notes branch to emit `WHERE n.entity_type = ${entityType} AND n.entity_id = ${entityId}`. The `notes` table is polymorphic; the declared signature cannot express its own required predicate. Dropping `entity_type` would return every note for *any* record sharing that id — a cross-entity data leak, not merely a bug.
- **Fix:** `branch(target: TimelineTarget, cursor, limit)` and `countBranch(target)`, where `TimelineTarget = { entityType, entityId }`. Arity is unchanged (3 and 1), all five interface members named in the acceptance criteria are present, and `entityType` remains a bind parameter.
- **Files modified:** `src/lib/timeline/sources.ts`, `src/lib/timeline/assemble.ts`
- **Commit:** `d54e3b4`

### 2. [Rule 3 - Blocking] The statement is wrapped in `SELECT ... FROM ( ... ) AS t`

- **Found during:** Task 2, before writing the implementation — the candidate SQL was executed against Docker Postgres first.
- **Issue:** The plan's shape for a non-deal entity is a single parenthesized branch followed by the outer `ORDER BY`/`LIMIT`. Postgres rejects this: `ERROR: multiple ORDER BY clauses not allowed`. The form is only legal when a set operation sits between the parenthesized selects. Without the outer clause the plan's own test expectation (2 `order by`, 2 `limit` for a non-deal entity) also cannot hold.
- **Fix:** Both shapes are wrapped as `SELECT kind, id, occurred_at FROM ( ... ) AS t ORDER BY "occurred_at" DESC, "id" DESC LIMIT $n`. Confirmed by `EXPLAIN ANALYZE` against the live DB that the wrapper does **not** change the plan — still `Limit -> Merge Append` over three pre-limited branches, still 1.5 ms cold.
- **Files modified:** `src/lib/timeline/assemble.ts`
- **Commit:** `d54e3b4`

### 3. [Rule 2 - Missing critical functionality] `assembleTimeline` computes `total`

- **Issue:** `TimelinePage` (plan 35-05) declares `total: number` as non-optional, and the plan's interface has `assembleTimeline` return `Promise<TimelinePage>`. Returning a placeholder would put a wrong number in the header badge.
- **Fix:** `assembleTimeline` runs `countTimeline` alongside the page query under one `Promise.all`. Measured cost is 0.480 ms for three index counts.
- **Commit:** `d54e3b4`

No architectural (Rule 4) decisions were needed. No package was installed.

## Verification Performed

- `npx vitest run src/lib/timeline/assemble.test.ts` — RED: exit 1, `Cannot find module './assemble'`. GREEN: 26 passed, 0 failed.
- `npx vitest run src/lib/timeline/` — 40 passed (26 assembler + 14 cursor).
- `npm run typecheck` — exit 0.
- `npm run lint` — exit 0; zero warnings in `src/lib/timeline`.
- `npm test` — 62 files, 960 passed / 4 skipped, plus the RSC project 2 files / 8 passed. Unregressed.
- Injection grep gate: `${entityType}` occurrences over non-`//` lines = 2 (≥ 1 required); `sql.raw` / `+ entityId` / `+ entityType` occurrences = **0**. `NO_STRING_CONCAT_SQL`.
- Soft-delete grep gate: literal `deleted_at IS NULL` over non-`//` lines of `sources.ts` = **4** (≥ 2 required; two branches plus two count branches). `SOFT_DELETE_FILTERS_PRESENT`.
- **Live-database execution**, not just rendering. The exact statement text emitted by `buildTimelineQuery` was run through `PREPARE`/`EXECUTE` against the Docker Postgres holding the 75,235 migrated notes:

  | Query | Plan | Execution |
  |-------|------|-----------|
  | Deal, 3 branches, cursor, `LIMIT 21` | `Limit -> Merge Append` over 3 pre-limited branches | 21 rows returned, all with id `< 'zzz'` |
  | Deal, 3 branches, no cursor, wrapped | `Limit -> Merge Append`; notes via `Index Scan using notes_live_idx`, activities via `Bitmap Index Scan on activities_deal_id_idx` (117 rows -> top-N heapsort 30 kB), history via `Bitmap Index Scan on deal_stage_history_deal_idx` | **1.519 ms** |
  | Organization, single branch, wrapped | `Limit -> Limit -> Sort -> Index Scan using notes_live_idx` with `Index Cond` on both `entity_type` and `entity_id` | **0.512 ms** |

- Rendered-SQL inspection confirmed: 2 `union all` / 4 `order by` / 4 `limit` / 14 params for a deal with a cursor; 0 `union all` / 2 `order by` / 2 `limit` / 6 params for an organization with a cursor.

## Issues Encountered

Postgres's `multiple ORDER BY clauses not allowed` on the single-branch form (deviation 2 above) was caught by executing the candidate SQL against the live database *before* writing the implementation, rather than after a green unit test. The unit tests mock `@/db` and assert on the rendered string, so they would have passed against a statement Postgres refuses to parse. This is the standing limitation of SQL-shape testing and the reason the live execution above is recorded as evidence.

## Known Stubs

None. All three artifacts are complete implementations.

## Threat Flags

None beyond the plan's register — this plan adds no endpoint, no auth path and no file access. Its registered threats close as follows:

| Threat | Status | Where |
|--------|--------|-------|
| T-35-01 (SQL injection via hand-built SQL) | mitigated | `entityTypeSchema.safeParse` runs before any fragment is composed and throws on anything outside the four literals; `entityId` binds as `${}`. Proven by `binds entityId as a parameter and never interpolates it into the SQL text` (probe `d1'; DROP TABLE notes;--` appears in `params`, not in the text) and by the zero-match grep gate. |
| T-35-02 (SQL injection via the paging cursor) | mitigated | `decodeCursor` returns `null` on malformed input, and both surviving components bind as `${}`. Proven by `binds cursor values as parameters and never interpolates them into the SQL text` (probe `x' OR '1'='1`) and by `degrades a malformed cursor to page 1 instead of throwing`, which asserts the resulting SQL carries no row comparison at all. |
| T-35-06 (soft-deleted notes appearing) | mitigated | Explicit literal `deleted_at IS NULL` in the notes and activities branches *and* their count branches — four occurrences, grep-gated. Asserted on the rendered SQL, not just the source. `deal_stage_history` has no such column by design (immutable history). |
| T-35-26 (whole history materialised) | mitigated | Every branch carries `ORDER BY ... DESC, id DESC LIMIT $n`. Asserted by occurrence counts (4/4 for a deal, 2/2 otherwise) and by `params` containing `21` exactly four times. Confirmed in the live plan: each branch has its own `Limit` node under the `Merge Append`. |
| T-35-27 (paging desync under concurrent inserts) | mitigated | Keyset `(created_at, id) < ($ts, $id)` on every branch, never `OFFSET`. Verified against real data that the id tie-break resolves a 117-row millisecond collision correctly. |
| T-35-SC (npm supply chain) | accepted | Zero packages installed. `drizzle-orm` and `zod` were already dependencies. |

## Next Phase Readiness

- Plan 35-09 can `import { assembleTimeline, countTimeline } from "@/lib/timeline/assemble"`. `assembleTimeline` already returns a complete `TimelinePage` including `total`, so the server action does not need a second count call.
- Plan 35-13's "Load more" passes the encoded `nextCursor` straight back as `params.cursor`; `decodeCursor` runs inside `assembleTimeline`, so callers never handle a `TimelineCursor` object.
- **Phase 36:** add the audit source file, append it to `TIMELINE_SOURCES`, and add `'audit'` to `TimelineEntryKind`. `buildTimelineQuery`, the pre-limit, the keyset predicate and the hydration loop are all driven off that array and need no edit. If the audit source applies to a non-deal entity type, the single-branch path automatically becomes a two-branch union — no special case needed.
- **For the phase verifier:** do not add a check demanding a literal `Index Scan` node in the timeline plan. Two of the three branches correctly plan as `Bitmap Index Scan` (Phase 33 D-01).

## Self-Check: PASSED

- `src/lib/timeline/sources.ts` — FOUND
- `src/lib/timeline/assemble.ts` — FOUND
- `src/lib/timeline/assemble.test.ts` — FOUND
- Commit `341d454` — FOUND
- Commit `d54e3b4` — FOUND

---
*Phase: 35-notes-record-timeline*
*Completed: 2026-08-15*
