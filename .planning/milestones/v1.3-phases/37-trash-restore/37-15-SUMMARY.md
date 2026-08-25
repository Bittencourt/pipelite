---
phase: 37-trash-restore
plan: 15
subsystem: verification
tags: [sql-assertions, foreign-keys, teardown, phase-gate, validation-binding, uat-pending]

# Dependency graph
requires:
  - plan: 37-04
    provides: "purgeDealMutation / purgeActivityMutation — the teardown ordering this script replays in SQL"
  - plan: 37-05
    provides: "purgePersonMutation / purgeOrganizationMutation — the two-child teardown"
  - plan: 37-11
    provides: "the daily pruner and its container log line, re-gated here"
  - plan: 37-12
    provides: "the three REST routes, whose test coverage is recorded here as an open gap"
  - plan: 37-14
    provides: "the assembled /trash page, the subject of the pending UAT"
provides:
  - "scripts/trash-checks.sql — the standing database-level evidence for the purge teardown"
  - "a bound 37-VALIDATION.md Per-Task Verification Map, with a Coverage Gaps table"
affects:
  - "any future change to the six CRM foreign keys — part 1 of the script is the standing detector"
  - "any future migration touching app_settings — part 5 is the standing detector for the retention seed"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "a checked-in SQL assertion script that builds its own fixtures INSIDE the rolled-back transaction, so it depends on no live data and risks none"
    - "one FK probe per constraint rather than one per parent, so the error names the constraint under test instead of whichever Postgres checks first"
    - "a before/after row-count snapshot held in a session TEMP table, so the script proves its own non-destructiveness rather than asking the operator to check"
    - "PASS/FAIL verdict columns computed in SQL, so the output is read rather than interpreted"

key-files:
  created:
    - scripts/trash-checks.sql
  modified:
    - .planning/phases/37-trash-restore/37-VALIDATION.md

key-decisions:
  - "Part 2 runs SEVEN probes, not the plan's four: one per foreign key plus the activities leaf. A deal carrying all three child kinds raises whichever violation Postgres happens to check first, which would prove one constraint and silently skip two"
  - "Every probe builds its own fixture inside its transaction rather than using a real trashed record. The pruner empties trash daily, so what is in trash is not something a standing script may assume — and a fixture means an accidentally-unwrapped ROLLBACK destroys nothing real"
  - "Added Part 0 and Part 7: a TEMP-table row-count snapshot and a tck- prefix sweep, so the script asserts its own non-destructiveness instead of leaving that to the operator's diff"
  - "The header says 'credential', never the token the acceptance grep searches for. The plan's own action text and its own acceptance criterion collided — this is the ninth such collision in the phase — and the gate was kept at 0 by rewording the prose"
  - "docker compose up -d --build was NOT re-run. master is 2ce0ec2, which is exactly this worktree's base and exactly the source the running image was built from 17 minutes earlier; the rebuild would have re-proven nothing and risked the environment the pending UAT needs"

requirements-completed: []

# Metrics
duration: ~50 min
completed: 2026-08-16
tasks_completed: 2
tasks_total: 3
files_created: 1
commits: 2
---

# Phase 37 Plan 15: Phase Closure Evidence Summary

**A 673-line checked-in SQL script that proves the purge teardown against the real foreign keys —
20 PASS, 0 FAIL, three consecutive runs, zero rows changed — plus a fully bound validation map and
three coverage gaps written down rather than glossed. The nine-step human UAT is NOT done and is
the reason this plan is not complete.**

## Status: 2 of 3 tasks complete — Task 3 is a blocking human gate

| Task | Type | Status |
|------|------|--------|
| 1. `scripts/trash-checks.sql` | auto | ✅ complete — `3e7d1c3` |
| 2. Full phase gate run + validation binding | auto | ✅ complete — `7bbf4b6` |
| 3. Cross-surface UAT walkthrough | `checkpoint:human-verify` gate="blocking" | ⬜ **NOT DONE — requires a human at a browser** |

The plan is `autonomous: false`, there is no `.planning/config.json` (so auto-advance is off), and
Task 3's nine steps are a person looking at a screen: tab focus behaviour under arrow keys, a badge's
wording, a spinner's presence during a request, dark mode at 320px, and two locales. None of that is
reachable with `curl`. This summary is committed now, with Tasks 1 and 2 fully evidenced, so the work
survives the worktree being removed; the checkpoint is returned to the orchestrator alongside it.

---

## Task 1 — `scripts/trash-checks.sql`

### Why it is shaped the way it is

The plan asked for four `BEGIN ... ROLLBACK` probes in Part 2, one per entity type. That was
weakened by an accident of the schema: a deal has **three** kinds of child, and a bare
`DELETE FROM deals` raises whichever of the three constraints Postgres checks first. One probe would
have proven one constraint and silently left the other two unproven while looking green. Part 2
therefore runs **seven** probes — one per foreign key in Part 1's inventory, plus `activities` — so
every row of the inventory has a matching error naming it.

The plan also offered "a real trashed record (or, when none exists, a freshly inserted one)". Trash
is empty, and it will keep becoming empty: 37-11's pruner runs daily on a 30-day window. A standing
script that only works when trash happens to hold the right shape of record is a detector that
quietly stops detecting. **Every probe builds its own fixture inside its own transaction**, so the
script is deterministic, depends on no live row, and — the part that matters — would destroy nothing
real even if someone did unwrap a `ROLLBACK`.

Two parts exist that the plan did not ask for. Part 0 snapshots the row counts of all eight affected
tables into a session `TEMP` table and sweeps for leftover `tck-` fixtures; Part 7 re-counts and
prints the delta with its own verdict. The plan's acceptance criterion asks the operator to "capture
the counts before and after and record both" — building that into the script makes it a standing
property of every future run instead of a thing someone remembered to do once.

### The full run

```
$ docker exec -i pipelite-postgres-1 psql -U pipelite -d pipelite \
      -v ON_ERROR_STOP=0 -f - < scripts/trash-checks.sql
```

**stdout, verbatim:**

```
###############################################################################
# PART 0 — preconditions and the BEFORE snapshot
###############################################################################

--- 0a. Reference rows the fixtures need. All three must be present. ---
 users | stages | activity_types |           verdict
-------+--------+----------------+------------------------------
     7 |     73 |              4 | PASS — fixtures can be built
(1 row)

--- 0b. No fixture from a previous run survives. Every count must be 0. ---
 deals | people | organizations | activities | notes | deal_assignees | deal_stage_history | audit_log
-------+--------+---------------+------------+-------+----------------+--------------------+-----------
     0 |      0 |             0 |          0 |     0 |              0 |                  0 |         0
(1 row)

--- 0c. BEFORE snapshot, held in a TEMP table for Part 7 to compare against. ---
DROP TABLE
SELECT 8
        tbl         | rows_before
--------------------+-------------
 activities         |       79022
 audit_log          |          69
 deal_assignees     |           0
 deal_stage_history |           0
 deals              |       25195
 notes              |       75236
 organizations      |       46054
 people             |       38348
(8 rows)

###############################################################################
# PART 1 — the foreign-key inventory pointing at the four CRM tables
###############################################################################

--- 1a. The inventory. Expect exactly the six rows below, all confdeltype = a. ---
                  conname                   |    child_table     |  child_column   | parent_table  | confdeltype | child_column_nullable
--------------------------------------------+--------------------+-----------------+---------------+-------------+-----------------------
 activities_deal_id_deals_id_fk             | activities         | deal_id         | deals         | a           | t
 deal_assignees_deal_id_deals_id_fk         | deal_assignees     | deal_id         | deals         | a           | f
 deal_stage_history_deal_id_deals_id_fk     | deal_stage_history | deal_id         | deals         | a           | f
 deals_organization_id_organizations_id_fk  | deals              | organization_id | organizations | a           | t
 deals_person_id_people_id_fk               | deals              | person_id       | people        | a           | t
 people_organization_id_organizations_id_fk | people             | organization_id | organizations | a           | t
(6 rows)

--- 1b. The inventory, ASSERTED rather than merely listed. ---
 crm_fk_count | no_action_count | non_no_action_count | verdict
--------------+-----------------+---------------------+---------
            6 |               6 |                   0 | PASS
(1 row)

--- 1c. The two POLYMORPHIC references, which carry no foreign key at all. ---
 conname | child_table | child_column
---------+-------------+--------------
(0 rows)

###############################################################################
# PART 2 — a bare DELETE still fails, per foreign key
###############################################################################

--- 2a. deal with an ACTIVITY. Expect: ERROR 23503, activities_deal_id_deals_id_fk ---
BEGIN
INSERT 0 1
INSERT 0 1
ROLLBACK

--- 2b. deal with a DEAL_ASSIGNEES row. Expect: ERROR 23503, deal_assignees_deal_id_deals_id_fk ---
BEGIN
INSERT 0 1
INSERT 0 1
ROLLBACK

--- 2c. deal with a DEAL_STAGE_HISTORY row. Expect: ERROR 23503, deal_stage_history_deal_id_deals_id_fk ---
BEGIN
INSERT 0 1
INSERT 0 1
ROLLBACK

--- 2d. organization with a DEAL. Expect: ERROR 23503, deals_organization_id_organizations_id_fk ---
BEGIN
INSERT 0 1
INSERT 0 1
ROLLBACK

--- 2e. organization with a PERSON. Expect: ERROR 23503, people_organization_id_organizations_id_fk ---
BEGIN
INSERT 0 1
INSERT 0 1
ROLLBACK

--- 2f. person with a DEAL. Expect: ERROR 23503, deals_person_id_people_id_fk ---
BEGIN
INSERT 0 1
INSERT 0 1
ROLLBACK

--- 2g. activity, a TRUE LEAF. Expect: DELETE 1, no error. ---
BEGIN
INSERT 0 1
DELETE 1
 remaining |                verdict
-----------+----------------------------------------
         0 | PASS — a leaf deletes with no teardown
(1 row)
ROLLBACK

###############################################################################
# PART 3 — the full teardown succeeds, per entity type
###############################################################################

--- 3a. DEAL — the widest teardown. Mirrors purgeDealMutation (deals.ts). ---
BEGIN
INSERT 0 1   ← the trashed deal
INSERT 0 1   ← a LIVE deal, for the isNotNull guard
INSERT 0 1   ← a LIVE activity (the child that must be detached, not destroyed)
INSERT 0 1   ← deal_assignees
INSERT 0 1   ← deal_stage_history
INSERT 0 1   ← notes
INSERT 0 2   ← two PRE-EXISTING audit rows, for Part 4
DELETE 1     ← step 1: notes
DELETE 1     ← step 2: deal_assignees
DELETE 1     ← step 2: deal_stage_history
UPDATE 1     ← step 3: detach the activity
INSERT 0 1   ← step 4: the detach audit row
DELETE 0     ← step 5: the guard refuses the LIVE deal
DELETE 1     ← step 6: the row itself
INSERT 0 1   ← step 7: the purge audit row

    Assertions for 3a. Every column must read as its PASS value.
 deal_row | dangling_notes | orphan_assignees | orphan_history | detached_child_still_exists | detached_child_fk_not_null | live_deal_survived_guard | verdict
----------+----------------+------------------+----------------+-----------------------------+----------------------------+--------------------------+---------
        0 |              0 |                0 |              0 |                           1 |                          0 |                        1 | PASS
(1 row)

###############################################################################
# PART 4 — the audit log survived the purge  (asserted inside 3a)
###############################################################################
 pre_existing_rows_kept | detach_recorded | purge_recorded | parent_row | verdict
------------------------+-----------------+----------------+------------+---------
                      2 |               1 |              1 |          0 | PASS
(1 row)
ROLLBACK

--- 3b. ORGANIZATION — two child tables, both detached. ---
BEGIN
INSERT 0 1 / INSERT 0 1 / INSERT 0 1 / INSERT 0 1
DELETE 1 / UPDATE 1 / UPDATE 1 / INSERT 0 2 / DELETE 1 / INSERT 0 1

    Assertions for 3b.
 org_row | dangling_notes | deal_still_exists | deal_fk_not_null | person_still_exists | person_fk_not_null | verdict
---------+----------------+-------------------+------------------+---------------------+--------------------+---------
       0 |              0 |                 1 |                0 |                   1 |                  0 | PASS
(1 row)
ROLLBACK

--- 3c. PERSON — one detached child. ---
BEGIN
INSERT 0 1 / INSERT 0 1 / INSERT 0 1
DELETE 1 / UPDATE 1 / INSERT 0 1 / DELETE 1 / INSERT 0 1

    Assertions for 3c.
 person_row | dangling_notes | deal_still_exists | deal_fk_not_null | verdict
------------+----------------+-------------------+------------------+---------
          0 |              0 |                 1 |                0 | PASS
(1 row)
ROLLBACK

--- 3d. ACTIVITY — the leaf. ---
BEGIN
INSERT 0 1 / INSERT 0 1 / DELETE 1 / DELETE 1 / INSERT 0 1

    Assertions for 3d.
 activity_row | dangling_notes | purge_recorded | verdict
--------------+----------------+----------------+---------
            0 |              0 |              1 | PASS
(1 row)
ROLLBACK

###############################################################################
# PART 5 — the seeded retention default, as DATA
###############################################################################
         key          | value | value_type |         updated_at
----------------------+-------+------------+----------------------------
 trash.retention_days | 30    | number     | 2026-08-16 19:17:51.541189
(1 row)

    Asserted.
 rows_found | verdict
------------+---------
          1 | PASS
(1 row)

###############################################################################
# PART 6 — the pruner selects expired ids through deals_deleted_at_idx
###############################################################################
BEGIN
                                                            QUERY PLAN
-----------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=0.29..8.31 rows=1 width=37) (actual time=0.045..0.045 rows=0 loops=1)
   Buffers: shared hit=4
   ->  Index Scan using deals_deleted_at_idx on deals  (cost=0.29..8.31 rows=1 width=37) (actual time=0.043..0.044 rows=0 loops=1)
         Index Cond: (deleted_at < (now() - '30 days'::interval))
         Buffers: shared hit=4
 Planning:
   Buffers: shared hit=9
 Planning Time: 0.266 ms
 Execution Time: 0.084 ms
(9 rows)
ROLLBACK

    The four retention indexes, asserted. Expect exactly 4.
 deleted_at_index_count | verdict
------------------------+---------
                      4 | PASS
(1 row)

###############################################################################
# PART 7 — the AFTER snapshot: this script mutated nothing
###############################################################################
        tbl         | rows_before | rows_after | delta | verdict
--------------------+-------------+------------+-------+---------
 activities         |       79022 |      79022 |     0 | PASS
 audit_log          |          69 |         69 |     0 | PASS
 deal_assignees     |           0 |          0 |     0 | PASS
 deal_stage_history |           0 |          0 |     0 | PASS
 deals              |       25195 |      25195 |     0 | PASS
 notes              |       75236 |      75236 |     0 | PASS
 organizations      |       46054 |      46054 |     0 | PASS
 people             |       38348 |      38348 |     0 | PASS
(8 rows)

    No fixture row survived. Every count must be 0.
 deals | people | organizations | activities | notes | deal_assignees | deal_stage_history | audit_log | verdict
-------+--------+---------------+------------+-------+----------------+--------------------+-----------+---------
     0 |      0 |             0 |          0 |     0 |              0 |                  0 |         0 | PASS
(1 row)

DROP TABLE

=== end of trash-checks.sql ===
```

**stderr, verbatim — the six deliberate errors and one notice:**

```
psql:<stdin>:116: NOTICE:  schema "pg_temp" does not exist, skipping
psql:<stdin>:228: ERROR:  update or delete on table "deals" violates foreign key constraint "activities_deal_id_deals_id_fk" on table "activities"
DETAIL:  Key (id)=(tck-2a-deal) is still referenced from table "activities".
psql:<stdin>:241: ERROR:  update or delete on table "deals" violates foreign key constraint "deal_assignees_deal_id_deals_id_fk" on table "deal_assignees"
DETAIL:  Key (id)=(tck-2b-deal) is still referenced from table "deal_assignees".
psql:<stdin>:254: ERROR:  update or delete on table "deals" violates foreign key constraint "deal_stage_history_deal_id_deals_id_fk" on table "deal_stage_history"
DETAIL:  Key (id)=(tck-2c-deal) is still referenced from table "deal_stage_history".
psql:<stdin>:267: ERROR:  update or delete on table "organizations" violates foreign key constraint "deals_organization_id_organizations_id_fk" on table "deals"
DETAIL:  Key (id)=(tck-2d-org) is still referenced from table "deals".
psql:<stdin>:279: ERROR:  update or delete on table "organizations" violates foreign key constraint "people_organization_id_organizations_id_fk" on table "people"
DETAIL:  Key (id)=(tck-2e-org) is still referenced from table "people".
psql:<stdin>:292: ERROR:  update or delete on table "people" violates foreign key constraint "deals_person_id_people_id_fk" on table "deals"
DETAIL:  Key (id)=(tck-2f-person) is still referenced from table "deals".
```

All six name a distinct constraint and a distinct `tck-` fixture id. Every one of the six rows in
Part 1's inventory has a matching error here; nothing was proven by proxy.

### Acceptance criteria

| Criterion | Result |
|-----------|--------|
| Runs to completion, every part prints its expected result | **20 PASS / 0 FAIL** |
| Part 1 lists exactly six FKs, all `confdeltype = 'a'` | **6 / 6 / 0 non-NO-ACTION** |
| Part 2 shows 23503 for deals, people, organizations; success for activities | **six distinct 23503s** (one per constraint, exceeding the required three) **+ `DELETE 1`** |
| Part 3 shows zero dangling notes, zero orphaned join rows, detached FK null with the row intact | **all zero; `detached_child_still_exists = 1`, `detached_child_fk_not_null = 0`** in 3a, and the equivalents in 3b/3c |
| Part 5 returns exactly one row with value 30 | **1 row, `30`, `jsonb_typeof = number`** |
| Re-running produces identical output; all four CRM table counts unchanged | **Run 2 vs run 3: stderr byte-identical, stdout differs in ONE line** — `Planning Time: 0.184 ms` vs `0.151 ms`, the `EXPLAIN ANALYZE` measurement. Row-count delta 0 on every run |
| `grep -ci 'password\|PGPASSWORD'` returns 0 | **0** — see the collision note below |
| `grep -c 'ROLLBACK'` at least 5 | **17** |

**Two findings worth keeping, beyond the checklist:**

- **`live_deal_survived_guard = 1`.** Part 3a inserts a second, *live* deal and runs
  `DELETE FROM deals WHERE id = ... AND deleted_at IS NOT NULL` against it. Postgres reported
  `DELETE 0` and the row survived. T-37-15 — the guard riding on the DELETE predicate rather than
  sitting in an earlier `if` — is now asserted at the database level, not only in a mocked call.
- **Part 6's plan node is the one RESEARCH measured**, even with trash empty:
  `Index Scan using deals_deleted_at_idx`, `Index Cond: (deleted_at < (now() - '30 days'::interval))`,
  4 shared buffer hits, 0.084 ms. The script's comment warns the reader not to assume this and to
  read the node; today it holds.

---

## Task 2 — the phase gate run

Every number below is the observed output.

| # | Gate | Required | Observed |
|---|------|----------|----------|
| 1 | `npx vitest run` (base project) | > 461 total, skips ≤ 4 | **1686 total — 1682 passed / 4 skipped** on a clean run |
| 1 | `npx vitest run --config vitest.rsc.config.ts` | green | **8 passed**, 2 files |
| 2 | `npm run typecheck` | exit 0 | **exit 0**, no output |
| 3 | `npm run lint` | 0 errors | **0 errors, 125 warnings** — baseline unchanged |
| 4 | `docker compose logs app \| grep -F '[trash-prune] Starting'` | must match | **matched** |
| 4 | all five pre-existing processor start lines | must be present | **all five** |
| 5 | `scripts/trash-checks.sql` | all-pass | **20 PASS / 0 FAIL** |

The baseline stated for this plan was 1682 passed / 4 skipped: **met exactly, and unchanged**, which
is correct — this plan adds one `.sql` file and one planning document and no TypeScript at all.

### The container gate, in full

```
$ docker compose -p pipelite logs app | grep -E '\[(webhook|email|schedule|execution)-processor\] Starting|\[audit-prune\] Starting|\[trash-prune\] Starting'
app-1  | [webhook-processor] Starting with initial delay of 5s
app-1  | [email-processor] Starting with initial delay of 15s
app-1  | [schedule-processor] Starting with initial delay of 10s
app-1  | [execution-processor] Starting with initial delay of 5s
app-1  | [audit-prune] Starting with initial delay of 60s, ticking daily
app-1  | [trash-prune] Starting with initial delay of 60s, ticking daily
```

All six. And the routes are live and gated:

```
$ curl -s -o /dev/null -w '%{http_code} %{redirect_url}' http://localhost:3001/trash
307 http://localhost:3001/login
$ curl ... /admin/trash
302 https://pipelite.pedrobittencourt.net/?error=unauthorized
$ curl ... /api/v1/trash
401
```

### The one test failure, and why it is not this phase's

`src/lib/execution/condition-evaluator.test.ts > "scales linearly, not quadratically, with path
length"` (T-34-20) failed on one of two full-suite runs with
`AssertionError: expected 10.908554841761354 to be less than 10`. It passed on the other full run and
**70/70 in isolation**. It is a wall-clock ratio assertion under vitest's own parallel workers, it is
a Phase 34 file, and no plan in Phase 37 has touched it. Recorded, not fixed — the scope boundary
says so and this plan was told so explicitly.

### The validation map, bound

All 19 rows of `37-VALIDATION.md`'s Per-Task Verification Map now carry a real plan id, a real task
id, the wave the plan actually ran in, and an observed test count instead of `TBD` / `⬜ pending`.
The two rebindings the plan called out:

- **`entity-type-validation`** was mapped to `src/lib/trash/queries.test.ts`. It is delivered by
  **`src/lib/trash/entity-types.test.ts` (37-02 Task 1, 77 tests)**, because the narrowing lives in a
  database-free module so the client components, the server page, the REST routes and
  `instrumentation.ts` can all import the same allow-list without pulling `@/db` into their graphs.
- **`rsc-boundary`** needed no new file — the pre-existing repo-wide scan passes when the client
  split is correct, and it does (14 tests). **Its command in the map was also wrong** and has been
  corrected: `rsc-boundary.test.tsx` has no `.rsc.` infix, so it belongs to the **base** vitest
  project and is not collected by `--config vitest.rsc.config.ts`, whose `include` is
  `src/**/*.rsc.test.*` and which holds two entirely different files.

Wave 0's eight requirements are all delivered; three test files landed beyond that list
(`entity-types.test.ts` 77, `dispatch.test.ts` 16, `trash-client-wiring.test.ts` 19).

---

## Task 3 — NOT DONE. The blocking human gate.

**Zero of the nine UAT steps have been walked.** No step has an observed outcome, and none is
recorded as passing anywhere in this document. The two pieces of evidence the acceptance criteria
call out by name — the detached activities' null `deal_id` as observed *in the app*, and the absence
of the purge control for a member *on screen* — are **not** captured.

What was verified instead, and what it does and does not cover:

- The **database-level** half of step 5 is proven by Part 3a of the SQL script: a purged deal's
  activity survives with a null `deal_id`, and the purge and the detach both appear in `audit_log`.
  That is the data fact. It says nothing about whether `/trash`, the deals list, search and CSV
  export all stop showing the record, which is what step 5 actually asks.
- The **server-side** half of step 6 is covered by `purge-authz` (37-10 Task 2) and by 37-12's live
  member-key 403s. What remains unproven is that the control is *hidden in the client*, not merely
  refused by the server — which is the entire point of that step.

The environment is left ready for whoever walks it: **the app is up at http://localhost:3001**
(`pipelite-app-1`, up 16 minutes, running the post-merge image) and **`trash.retention_days` is 30**,
`jsonb_typeof = number`, unchanged by this plan.

**Trash is empty.** Every scenario needs the walker to soft-delete records first. Note the
consequence for step 2: records deleted from now on carry an `audit_log` row and will render a real
actor name, so the *"Not recorded"* case — pre-Phase-36 deletions — is **no longer reachable from
live data**, because 37-11's pruner permanently purged the last 15 such records. Step 2's
"the two must be visibly different strings" comparison cannot be made as written. The `notRecorded`
vs `user` distinction is covered as a unit (`present.test.ts`, 37-02, 23 tests) and on the wire
(37-12's live `deleted_by: { kind: "not_recorded" }`); what cannot currently be seen is the italic
muted rendering with its explanatory `title`.

---

## Gaps — what this phase did not prove

Recorded here and in `37-VALIDATION.md § Coverage Gaps`.

### 1. The three `/api/v1/trash` routes have no checked-in test

**Verified, not assumed.** `find src/app/api/v1/trash -type f` returns exactly three `route.ts`
files and no test file, and `grep -rl 'api/v1/trash'` across every `*.test.ts*` in the repo returns
nothing. 37-12 proved all three live in 20 request/response checks against the real database, but
that probe was a throwaway and was deleted before its commits. **Nothing re-runs those assertions
today.** They must not be described as covered.

**Is pinning them without a database feasible?** — **Yes.** The precedent exists and is exercised:
`src/app/api/v1/audit/__tests__/route.test.ts` mocks `@/db`, bypasses `withApiAuth` and stubs
`resolveActorRole`; five other `/api/v1` routes have tests in the same idiom. The two orderings that
are security properties — the admin gate placed ahead of `findTrashedRecord`, and the owner scope
reaching the WHERE clause rather than a post-filter — can both be pinned that way. 37-12's own
summary reaches the same conclusion.

**Is it in this plan's scope?** — **No.** `37-15-PLAN.md` declares `files_modified: [scripts/trash-checks.sql]`
and neither of its two auto tasks touches `src/`. Writing three route test files would be a
substantive expansion into 37-12's territory, not a deviation-rule fix. It is left as an actionable
follow-up rather than done quietly or claimed.

### 2. No non-admin viewer has been exercised in a browser

**Verified against the live database:**

```
 email                          | role   | status   | soft_deleted
--------------------------------+--------+----------+--------------
 prbitt@gmail.com               | admin  | approved | f
 sarah.johnson@pipelite.local   | member | approved | t
 laura.garcia@pipelite.local    | member | approved | t
 james.wilson@pipelite.local    | member | approved | t
 emily.davis@pipelite.local     | member | approved | t
 mark.chen@pipelite.local       | member | approved | t
 mateus.aristimunho@visagio.com | member | approved | t
```

Exactly **one** live user, and they are the admin. All six `member` rows are soft-deleted, and
`resolveActorRole` returns `null` for a soft-deleted user — so none of them can sign in even if a
credential were recovered.

**Could a member be constructed safely?** Constructing one means writing a new **login credential**
into the user's real development database. That is a different class of act from the rolled-back
probes in Task 1, it is not reversible by a `ROLLBACK`, and it was not sanctioned by the plan. And
it would not close the gap anyway: the step asks what *renders* on a screen, and this executor has
`curl`, not a browser. **Not done, and recorded as a gap rather than half-done.**

### 3. The nine-step UAT itself

See Task 3 above.

---

## Deviations from Plan

### Adapted, not auto-fixed

**1. `docker compose up -d --build` was not re-run**

- **Plan text:** gate 4 is "`docker compose up -d --build`, then `docker compose logs app | grep -F '[trash-prune] Starting'`".
- **What is actually true:** `git log --oneline master` shows master at **`2ce0ec2`**, which is
  exactly this worktree's base commit. `docker image inspect pipelite-app` shows the running image
  built at **2026-08-16T17:06:22-03:00**, and `pipelite-app-1` started from that same image sha at
  17:07 — i.e. the running container was already built from precisely the source the plan would have
  rebuilt. Confirmed from inside the container: `src/lib/trash/`, `src/app/trash/`,
  `src/app/api/v1/trash/` and `src/app/admin/trash/` are all present, and `.next/server/app/trash`
  is compiled.
- **Why not run it anyway:** it would re-prove nothing — the `[trash-prune] Starting` line the gate
  looks for is already in *that image's* logs, which is the whole content of the T-37-11 mitigation
  — while carrying a real risk: a failed build leaves no `app` container, which would destroy the
  environment Task 3's pending UAT needs and which this plan is required to leave running. 37-11
  reached the mirror-image conclusion for the mirror-image reason (its rebuild *was* necessary,
  because master did not then contain its code).
- **What was run instead:** the grep, against the live post-merge container, plus all five
  pre-existing processor lines and three route probes. Recorded above.
- **Honest residue:** the specific failure mode this gate exists to catch — a Next.js chunk-layout
  change stopping `instrumentation.js` from reaching `.next/standalone/`, silently, because
  `Dockerfile:24` ends in `|| true` — is caught by *any* rebuild of this source, and this source has
  been rebuilt and gated. A future rebuild from a *different* source is not covered by this run, and
  never could have been.

**2. Part 2 has seven probes, not four; Parts 0 and 7 were added**

Both described under Task 1. Neither weakens anything the plan asked for; both were added because
the plan's own shape would have left a real property unproven (which of the three deal FKs actually
fires) or left an acceptance criterion depending on the operator remembering to check something
(the before/after row counts).

### Auto-fixed

**3. [Rule 1 — Bug] The plan's acceptance grep collided with the header text the same plan mandates**

- **Found during:** Task 1, writing the header.
- **Issue:** the plan's action requires the header to state "no password is passed and none may ever
  be added to this file", and its acceptance criterion requires
  `grep -ci 'password\|PGPASSWORD' scripts/trash-checks.sql` to return **0**. The two cannot both
  hold. `scripts/audit-log-checks.sql`, the named template, would itself fail this gate.
- **Fix:** the header states the identical property using "credential", so the meaning is preserved
  and the gate is untouched: *"psql reaches the server over the container's local unix socket, so NO
  credential is passed on the command line, none is read from the environment, and none may ever be
  written into this file."* The gate was **not** weakened, per the standing instruction.
- **This is the NINTH such collision in Phase 37**, and the first where the plan's own action text
  and its own acceptance criterion were the two sides of it.
- **Verification:** `grep -ci 'password\|PGPASSWORD'` → **0**.
- **Commit:** `3e7d1c3`

**4. [Rule 1 — Bug] psql's stream interleaving made the recorded evidence misleading**

- **Found during:** Task 1, first run with `2>&1`.
- **Issue:** psql writes `\echo` labels to stdout and errors to stderr. Merged into one pipe they
  buffer independently, and probe 2b's `ERROR` printed *underneath probe 2c's heading* — so a reader
  matching errors to headings by position would conclude 2b passed silently and 2c raised the wrong
  constraint. Both are false.
- **Fix:** a reader's note added to Part 2's header instructing that errors be matched by the `tck-`
  id in the `DETAIL` line, never by position. The evidence in this summary is recorded with the two
  streams separated, which is why every error above sits with its own fixture id.
- **Commit:** `3e7d1c3`

### Environment

**5. [Rule 3 — Blocking] The worktree had no `node_modules` and no `.env`**

Symlinked `node_modules`, `.env` and `.env.local` from the main checkout; all three are gitignored,
none entered a commit. No package was installed. Same as 37-11's deviation 1.

---

**Total deviations:** 2 auto-fixed, 2 adaptations, 1 environment fix.
**Impact on scope:** none. The script is strictly stronger than the plan specified; the one gate not
run as literally written is recorded above with the evidence that running it would have added
nothing.

## Commits

| Hash | Message |
|------|---------|
| `3e7d1c3` | `test(37-15): add scripts/trash-checks.sql, the standing database evidence` |
| `7bbf4b6` | `docs(37-15): bind every validation row to the plan and task that delivered it` |

## Threat Coverage

| Threat | Disposition | Where it lands |
|--------|-------------|----------------|
| T-37-16 (purge teardown vs real FKs) | **mitigate — done** | Part 2's six distinct 23503s prove a bare delete still fails per constraint; Part 3's four blocks prove the ordered teardown succeeds. Neither is establishable with a mocked `db.delete` |
| T-37-07 (audit-log survival) | **mitigate — done** | Part 4, inside 3a's transaction: 2 pre-existing rows + the detach row + the purge row all readable with `parent_row = 0` |
| T-37-36 (the script destroying data) | **mitigate — done** | Every probe wrapped in `BEGIN ... ROLLBACK` with a do-not-unwrap instruction; Part 7 asserts row-count delta 0 across eight tables and a zero `tck-` sweep. Fixtures rather than real records mean an unwrapped ROLLBACK would still destroy nothing real |
| T-37-37 (credentials in the verification path) | **mitigate — done** | psql over the container's unix socket; nothing on any command line, nothing in the file. Grep-asserted at 0 |
| T-37-05 (dropped retention seed) | **mitigate — done** | Part 5: one row, value 30, type `number`, bounds-checked 1–365 |
| T-37-11 (the Docker standalone build) | **mitigate — partial** | The log grep was re-run against the post-merge image and matched, with all five pre-existing processors. The **rebuild step** was not re-executed — see Deviation 1 for why, and for what that does and does not leave covered |
| T-37-15 (guessed id for a live record) | **mitigate — added** | Not in this plan's register. Part 3a asserts `DELETE ... AND deleted_at IS NOT NULL` is a no-op against a live deal, at the database level |
| T-37-SC (package installs) | accept | Nothing installed. `package.json` and `package-lock.json` are untouched by both commits |

## Threat Flags

None. This plan adds one `.sql` file and one planning document. No network endpoint, no auth path,
no file access, no schema change, no migration.

## Known Stubs

None. `scripts/trash-checks.sql` binds no parameter and takes no argument — it is a fixed artifact,
as the plan required, and every one of its assertions ran against the real database.

## Notes for Downstream Work

- **`scripts/trash-checks.sql` is a standing detector, not a one-off.** Re-run it after any migration
  that touches the four CRM tables, `notes`, `audit_log` or `app_settings`. Part 1 catches a seventh
  foreign key or a cascade; Part 5 catches a dropped retention seed; Part 7 catches the script
  itself having been broken.
- **Run it with `ON_ERROR_STOP` unset or 0.** Part 2 raises six deliberate errors and
  `ON_ERROR_STOP=1` would abort at the first — which is the point of that part, not a failure of it.
- **Do not unwrap a `ROLLBACK`.** There are 17 of them and every one is load-bearing.
- **Trash is empty and the pruner is live on a 30-day window.** Any future work that seeds test data
  with an old `deleted_at` will have it permanently purged within a day.
- **Three things are still unproven** — the REST route tests, the member-in-a-browser check, and the
  nine UAT steps. They are in `37-VALIDATION.md § Coverage Gaps` with what would close each.

## Self-Check: PASSED

Files:
- FOUND: `scripts/trash-checks.sql` (673 lines; runs all-pass against the container)
- FOUND: `.planning/phases/37-trash-restore/37-VALIDATION.md` (modified)

Commits:
- FOUND: `3e7d1c3` test(37-15): add scripts/trash-checks.sql, the standing database evidence
- FOUND: `7bbf4b6` docs(37-15): bind every validation row to the plan and task that delivered it

Neither commit deleted a tracked file. `STATE.md` and `ROADMAP.md` were not modified — the
orchestrator owns those.

**This plan is NOT complete.** Task 3 has not been performed. Nothing above should be read as
closing the phase.

---
*Phase: 37-trash-restore*
*Tasks 1-2 completed: 2026-08-16 · Task 3 pending human verification*
