---
phase: 36-audit-log
plan: 20
subsystem: verification
status: PARTIAL — Tasks 1-2 complete, Task 3 (browser walkthrough) awaiting the human
tags: [testing, source-gate, anti-vacuity, postgres, explain, docker, verification]

# Dependency graph
requires:
  - phase: 36-07
    provides: the four CRM mutation modules emitting `crmBus` events with a `previous` row
  - phase: 36-12
    provides: the import summary-row decision that scopes the SC-5 claim
  - phase: 36-18
    provides: the `startAuditPruner` instrumentation hook whose startup line is asserted here
  - phase: 36-17
    provides: "`includeAudit` on buildTimelineQuery, the fourth branch whose plan is measured here"
provides:
  - the SC-5 source gate, with anti-vacuity assertions and two detector vocabulary tables
  - proof that the pruner is alive in the Docker image, not only in the test suite
  - the `audit-log-checks.sql` output, the merged-timeline plan and the run-to-records plan, verbatim
affects: [phase-36-closing-gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Anti-vacuity triad for a source gate: prove the files were found, prove they are the right files via a positive marker, then assert the negative"
    - "A detector tested through its stripComments composition rather than as a bare regex, so the stripping is proven to run"
    - "Scale probes for EXPLAIN evidence inside BEGIN ... ROLLBACK, so measured plans commit nothing"

key-files:
  created:
    - src/lib/audit/no-mutation-coupling.test.ts
  modified: []

decisions:
  - "The SC-5 scan covers all nine non-test modules in src/lib/mutations, not only the four the plan named — a strictly stronger claim; the `toHaveLength(4)` anchor is applied to the four CRM entity modules, which is what the plan's positive `crmBus.emit` marker actually describes"
  - "The stale Docker image was rebuilt rather than merely restarted: the running image predated all 50 Phase-36 commits, so `restart` could not have produced the `[audit-prune]` line"
  - "audit_log was NOT seeded with synthetic rows to satisfy the actor_kind criterion — the scale probe is rolled back, and the table is left empty for the human's Task 3"

metrics:
  duration: ~50 min
  tasks-completed: 2
  tasks-total: 3
  completed: 2026-08-16
---

# Phase 36 Plan 20: Closing Gate Summary (PARTIAL)

Mechanically proved SC-5 with a source gate that fails loudly under both a rename and a real
violation, rebuilt the stale Docker image so the audit pruner is provably alive in the running
container, and recorded every database plan the mocked suite cannot reach.

**This summary is incomplete by design.** Task 3 is a `checkpoint:human-verify` gate whose eleven
browser steps must be performed by a human. Nothing below claims any of them was done.

---

## Task 1 — the SC-5 source gate

**Commit:** `470943f` — `test(36-20): add the SC-5 no-mutation-coupling source gate`
**File:** `src/lib/audit/no-mutation-coupling.test.ts` (262 lines, 24 tests, all passing)

### What it asserts

The negative — no module under `src/lib/mutations/` imports, references, or calls into the audit
layer — plus the three anti-vacuity requirements that make the negative mean something:

1. **The files were found and read.** `expect(crmFiles.map(...)).toHaveLength(4)` and an explicit
   `existsSync` check on the directory. A glob that silently matches zero files passes a "no file
   imports X" test perfectly.
2. **They are the right files.** Every one of the four contains `crmBus.emit`, asserted *before*
   the negative. A fifth assertion pins the set both ways: the four CRM modules are the *only*
   modules in the directory that emit, so a new emitter must be added to `CRM_MUTATION_MODULES`
   deliberately rather than slipping past the positive marker.
3. **A gate for the gate.** Two vocabulary tables (11 should-trip strings, 7 should-not) pinning
   what `couplesToAudit` recognises. Both tables exercise the `stripComments` → `test` composition
   rather than the bare regex, which is what proves the stripping is wired in and not merely
   defined nearby.

### Detector vocabulary

Should trip: `@/lib/audit/*` in any load form (static import, type-only import, `require`, dynamic
`await import`, relative `../audit/`), `@/db/schema/audit-log`, a bare `auditLog*` identifier, the
`Audit[A-Z]*` exported type names, and calls to `getCurrentActor` / `runWithActor` / `buildChanges`
/ `normaliseEventData` / `startAuditPruner` / `readRetentionDays`.

Should not trip: an audit mention inside a `//` or `/* */` comment, `auditedFields`, `auditor`,
the bare string `"audit"`, `"https://example.com/audit-log"` (the `[^:]` guard leaves this line
intact and it still must not match), and `crmBus.emit(...)` itself.

The type-only import form is deliberately caught. It is the shape most likely to be argued as
harmless, and it is not: it means the mutation module had to know the audit layer's shape.

### Comment stripping is load-bearing here, and that is asserted, not assumed

This is not hypothetical in these files. Four mutation modules carry a tombstone comment reading
"...omitting it would silently produce an audit row with no detail":

```
src/lib/mutations/deals.ts:481
src/lib/mutations/organizations.ts:332
src/lib/mutations/people.ts:371
src/lib/mutations/activities.ts:344
src/lib/mutations/notes.ts:230   ("undermines exactly the audit value that justifies keeping the row")
```

A gate over raw source would have to treat those as noise. The test asserts that the files whose
**raw** source says "audit" have no such mention left in the **stripped** source — a live proof
that `stripComments` runs on real input, not only on the synthetic table strings.

### WR-13 does not apply, and the file says so

No helper in this file takes an `indexOf` result as an anchor, so the silent-widening failure mode
cannot occur. The module header states the rule for any future helper that does add one: assert
`> -1` on the ANCHOR with a named message, because checking the brace cannot catch a missing
anchor — the brace it finds does exist.

### Negative proof — both deliberate red runs, performed and recorded

**Red run 1 — a real violation.** Added
`import { getCurrentActor } from "@/lib/audit/actor-context"` to `src/lib/mutations/deals.ts`:

```
× no file under src/lib/mutations couples to the audit layer
  AssertionError: expected [ Array(1) ] to deeply equal []
  + "src/lib/mutations/deals.ts references the audit layer via `@/lib/audit`",

× comment stripping is load-bearing here, not a formality
  AssertionError: src/lib/mutations/deals.ts names the audit layer outside a comment:
  expected true to be false

Tests  2 failed | 22 passed (24)
```

Reverted with `git checkout -- src/lib/mutations/deals.ts`; suite back to 24 passing.

**Red run 2 — the vacuity rehearsal.** Pointed `MUTATIONS_DIR` at `src/lib/mutations-renamed`:

```
× found the four CRM entity mutation modules and read them
  AssertionError: src/lib/mutations-renamed does not exist: expected false to be true
× scans the whole mutations directory, not only those four
× and that they are the ONLY modules in the directory that emit
× comment stripping is load-bearing here, not a formality
✓ no file under src/lib/mutations couples to the audit layer     <-- PASSED VACUOUSLY

Tests  4 failed | 20 passed (24)
```

**This is the finding that justifies the whole triad.** The negative assertion — the one the plan
is actually about — passed perfectly over an empty set. Only the anti-vacuity assertions went red.
Without them this gate would have reported success while detecting nothing at all.

With the `existsSync` line temporarily removed so the count assertion is reached first, the failure
lands exactly where the plan asked it to:

```
× found the four CRM entity mutation modules and read them
  AssertionError: expected [] to have a length of 4 but got +0
```

Both sabotages reverted; `git status --short` clean apart from the new file.

### Acceptance greps

| Grep | Required | Actual |
|---|---|---|
| `toHaveLength(4)` | ≥ 1 | 1 |
| `toBeGreaterThan(0)` | ≥ 1 | 3 |
| `it.each` | exactly 2 | 2 |
| `stripComments` | ≥ 2 | 4 |

### Full suite

| Command | Result |
|---|---|
| `vitest run` | 76 files, **1335 passed**, 4 skipped |
| `vitest run --config vitest.rsc.config.ts` | 2 files, **8 passed** |
| `tsc --noEmit` | clean, no output |
| `eslint src/lib/audit/no-mutation-coupling.test.ts` | clean, no output |

### Deviation from the plan's scope wording (Rule 1)

The plan says "`expect(files).toHaveLength(4)` on the `src/lib/mutations/*.ts` scan (excluding test
files)". **That directory holds nine non-test `.ts` files**, not four: `activities.ts`, `deals.ts`,
`http-templates.ts`, `index.ts`, `notes.ts`, `organizations.ts`, `people.ts`, `workflow-templates.ts`,
`workflows.ts`. Writing `toHaveLength(4)` against that scan would have been unsatisfiable, and
narrowing the scan to four files to satisfy the literal would have *weakened* SC-5 by leaving five
modules unchecked.

Resolution: the **negative assertion runs over all nine**, which is a strictly stronger SC-5 claim,
and the `toHaveLength(4)` anchor is applied to the four CRM entity modules — which is precisely
what the plan's requirement 2 describes ("every one of the four contains `crmBus.emit`"). Verified:
exactly four files in that directory contain `crmBus.emit`, and the gate asserts that set both ways.

---

## Task 2 — database and container evidence

**Commit:** this summary (no source edits; Task 2 records evidence).

### FINDING: the running container did not contain this phase's code

The plan says "restart the app container so the current build is running". A restart would not have
worked, and this is the single most important thing in Task 2:

| Fact | Value |
|---|---|
| `pipelite-app` image built | 2026-08-15T18:09:42-03:00 |
| Last commit inside that image | `caa3bab docs(35-15): ...` at 2026-08-15T18:00:26-03:00 |
| Plan base commit (wave-5 merge) | `dc21c0e` at 2026-08-16T00:58:48-03:00 |
| Phase-36 commits landed after the image was built | **50** |
| `docker-compose.yml` source mount for `app` | **none** — `build: .`, Next standalone, no hot reload |

Evidence of the staleness, before the rebuild:

```
$ docker compose -p pipelite logs app | grep -c "audit-prune"
0

$ docker compose -p pipelite exec -T app sh -c 'grep -rl "audit-prune" /app/.next'
(no matches)

app-1  | [webhook-processor] Starting with initial delay of 5s
app-1  | [email-processor] Starting with initial delay of 15s
app-1  | [schedule-processor] Starting with initial delay of 10s
app-1  | [execution-processor] Starting with initial delay of 5s
        <-- the four Phase-34/35 processors, and no audit pruner
```

The image contained **zero** Phase-36 code. This is exactly the signature the plan warns about
(STATE.md 2026-08-08, "the standalone-build failure that killed all four processors") — except the
cause here was a stale image rather than a build failure. Restarting it would have produced a
confident, meaningless green.

**Action taken (deviation Rule 3 — blocking issue):** rebuilt the image from the main checkout,
which sits at exactly this plan's base commit (`git merge-base --is-ancestor dc21c0e master` → true,
`master` HEAD == `dc21c0e`):

```
docker compose --project-directory /home/pedro/programming/pipelite \
  -f /home/pedro/programming/pipelite/docker-compose.yml -p pipelite build app
docker compose --project-directory /home/pedro/programming/pipelite \
  -f /home/pedro/programming/pipelite/docker-compose.yml -p pipelite up -d --no-deps app
```

The build was run from the main project directory rather than from this worktree so that compose
loads the project's `.env`; recreating from the worktree would have started the container with
every environment variable empty. No credential appears in any command above, and none was read.

### The pruner is alive in the rebuilt image

```
$ docker compose -p pipelite logs app | grep "audit-prune"
app-1  | [audit-prune] Starting with initial delay of 60s, ticking daily

$ docker compose -p pipelite logs app | grep -c "audit-prune"
1
```

Acceptance criterion (≥ 1) met. This is the 36-18 line verbatim, and it is the thing a unit test
cannot prove: the instrumentation hook survived the Next standalone build.

Corroborating route probes against the rebuilt container:

```
$ curl -o /dev/null -w "%{http_code}" http://localhost:3001/           -> 200
$ curl -o /dev/null -w "%{http_code}" http://localhost:3001/admin/audit -> 302  (redirect to login; route exists)
$ curl -o /dev/null -w "%{http_code}" http://localhost:3001/api/v1/audit -> 401  (API-key gate; route exists)
```

### `scripts/audit-log-checks.sql` — full output

```
$ docker compose -p pipelite exec -T postgres psql -U pipelite -d pipelite -f - < scripts/audit-log-checks.sql

=== PART 1 — index catalog: the four declared indexes must be listed ===
          indexname           |                                              indexdef
------------------------------+----------------------------------------------------------------------------------------------
 audit_log_created_at_idx     | CREATE INDEX audit_log_created_at_idx ON public.audit_log USING btree (created_at)
 audit_log_entity_idx         | CREATE INDEX audit_log_entity_idx ON public.audit_log USING btree (entity_type, entity_id, created_at DESC NULLS LAST)
 audit_log_import_session_idx | CREATE INDEX audit_log_import_session_idx ON public.audit_log USING btree (import_session_id) WHERE (import_session_id IS NOT NULL)
 audit_log_pkey               | CREATE UNIQUE INDEX audit_log_pkey ON public.audit_log USING btree (id)
 audit_log_workflow_run_idx   | CREATE INDEX audit_log_workflow_run_idx ON public.audit_log USING btree (workflow_run_id) WHERE (workflow_run_id IS NOT NULL)
(5 rows)

=== PART 1b — the four declared indexes, counted. Expect exactly 4. ===
 declared_index_count
----------------------
                    4
(1 row)

=== PART 2 — immutability: audit_log columns. Expect NO updated_at, NO deleted_at. ===
    column_name    |          data_type          | is_nullable | column_default
-------------------+-----------------------------+-------------+----------------
 id                | text                        | NO          |
 entity_type       | text                        | NO          |
 entity_id         | text                        | NO          |
 action            | text                        | NO          |
 changes           | jsonb                       | NO          | '{}'::jsonb
 actor_kind        | text                        | NO          |
 actor_user_id     | text                        | YES         |
 workflow_run_id   | text                        | YES         |
 import_session_id | text                        | YES         |
 created_at        | timestamp without time zone | NO          | now()
(10 rows)

=== PART 2b — the mutability columns, counted. Expect exactly 0 rows. ===
 column_name
-------------
(0 rows)

=== PART 3 — the seeded retention default. Expect exactly one row, value 90. ===
         key          | value |         updated_at
----------------------+-------+----------------------------
 audit.retention_days | 90    | 2026-08-16 02:24:36.384572
(1 row)

=== PART 4 — the prune plan. Wrapped in a rolled-back transaction: deletes nothing. ===
BEGIN
 Delete on audit_log  (cost=16.24..30.32 rows=0 width=0) (actual time=0.007..0.008 rows=0 loops=1)
   Buffers: shared hit=1
   ->  Hash Semi Join  (cost=16.24..30.32 rows=83 width=36) (actual time=0.006..0.007 rows=0 loops=1)
         Hash Cond: (audit_log.ctid = "ANY_subquery".ctid)
         ->  Seq Scan on audit_log  (cost=0.00..12.50 rows=250 width=6) (actual time=0.005..0.005 rows=0 loops=1)
         ->  Hash  (cost=15.21..15.21 rows=83 width=36) (never executed)
               ->  Subquery Scan on "ANY_subquery"  (cost=0.00..15.21 rows=83 width=36) (never executed)
                     ->  Limit  (cost=0.00..14.38 rows=83 width=6) (never executed)
                           ->  Seq Scan on audit_log audit_log_1  (cost=0.00..14.38 rows=83 width=6) (never executed)
                                 Filter: (created_at < (now() - '90 days'::interval))
 Planning Time: 2.861 ms
 Execution Time: 0.163 ms
(16 rows)
ROLLBACK

=== PART 5 — table size, for context on what the retention window costs. ===
 total_rows | oldest_entry | total_size
------------+--------------+------------
          0 |              | 88 kB
(1 row)
```

**Part 4 chose a `Seq Scan`, and that is not a finding.** The script's own header anticipates it:
"On a small or empty table the planner may legitimately choose a different node — what this part
proves TODAY is that the index exists and the statement is valid." A `Seq Scan` over zero rows is
the correct plan. The index-driven plan at scale is measured below and does not seq-scan.

### Row count and per-actor-kind breakdown

```
$ docker compose -p pipelite exec -T postgres psql -U pipelite -d pipelite \
    -c "SELECT actor_kind, count(*) FROM audit_log GROUP BY actor_kind ORDER BY 1;"
 actor_kind | count
------------+-------
(0 rows)

$ ... -c "SELECT count(*) AS audit_rows FROM audit_log;"
 audit_rows
------------
          0
```

**FINDING — the acceptance criterion "the `actor_kind` breakdown shows at least `user` present"
CANNOT be satisfied by Task 2, and this is a plan-ordering defect, not a failure.**

`audit_log` is empty. It is empty for the correct reason: the table has never had a writer, because
until the rebuild above there was no subscriber in the image, and there has been no user edit since.
Task 2's action says "re-run the evidence script against the now-populated table" — but the only
thing that populates it is **Task 3's browser walkthrough**, which comes after Task 2 and is gated
on a human. The dependency runs backwards.

The table was deliberately **not** seeded to make the criterion green. Synthetic rows would have
corrupted the human's Task 3 evidence: step 2 counts timeline entries, step 4 needs a record whose
only history is audit entries, step 8 must show exactly one summary row per import, and step 9 reads
the entry count and oldest entry in `/admin/audit`. Every one of those is falsified by planted data.

**The `actor_kind` breakdown must be re-captured after the walkthrough**, with the command above.

Context for what the empty table means (see Phase-level statement 4): there was no backfill, so this
is also the correct steady state for the 25,194 existing deals.

Neighbouring timeline source volumes, for scale context:

```
 deals | notes | activities | stage_changes | runs
-------+-------+------------+---------------+------
 25194 | 75236 |      79023 |             0 |    0
```

`deal_stage_history` and `workflow_runs` are both empty, which bounds what browser steps 6 and 9
can show without the human first creating a workflow run.

### EXPLAIN — the merged timeline with the audit branch included

Target: deal `768ca731-94de-43f9-aa80-8aea967a68fb`, the deal with the most activities (117).
Statement reconstructed from `buildTimelineQuery` (`assemble.ts:104-106`) and the four
`branch()` bodies in `sources.ts` at `limit + 1 = 21`.

Warm run:

```
 Limit  (cost=346.79..347.16 rows=21 width=108) (actual time=0.536..0.544 rows=21 loops=1)
   ->  Merge Append  (cost=346.79..347.23 rows=25 width=108) (actual time=0.535..0.541 rows=21 loops=1)
         Sort Key: n.created_at DESC, n.id DESC
         ->  Limit ... ->  Sort ... ->  Index Scan using notes_live_idx on notes n
                                             Index Cond: ((entity_type = 'deal') AND (entity_id = '768ca731-...'))
         ->  Limit ... ->  Sort ... ->  Bitmap Heap Scan on activities a
                                             ->  Bitmap Index Scan on activities_deal_id_idx
         ->  Limit ... ->  Sort ... ->  Bitmap Heap Scan on deal_stage_history h
                                             ->  Bitmap Index Scan on deal_stage_history_deal_idx
         ->  Limit ... ->  Sort ... ->  Index Scan using audit_log_entity_idx on audit_log al
                                             Index Cond: ((entity_type = 'deal') AND (entity_id = '768ca731-...'))
 Planning Time: 3.622 ms
 Execution Time: 0.838 ms
```

**Matches the expectation exactly: `Merge Append` over four index-driven branches, sub-millisecond
warm (0.838 ms).** The audit branch uses `audit_log_entity_idx` — the index declared for precisely
this predicate and ordering. First (cold) execution of the same statement was 45.895 ms, dominated
by the `activities` bitmap heap scan reading 94 heap blocks; that is a cache-warmth artifact of the
activities table, not of the audit branch.

### EXPLAIN — run → records

```
$ EXPLAIN (ANALYZE, BUFFERS) SELECT al.entity_type, al.entity_id, al.changes
    FROM audit_log al WHERE al.workflow_run_id = '00000000-0000-0000-0000-000000000000';

 Index Scan using audit_log_workflow_run_idx on audit_log al
   (cost=0.12..8.14 rows=1 width=96) (actual time=0.034..0.034 rows=0 loops=1)
   Index Cond: (workflow_run_id = '00000000-0000-0000-0000-000000000000'::text)
   Buffers: shared hit=2
 Planning Time: 0.057 ms
 Execution Time: 0.054 ms
```

**Deviation from the stated expectation, recorded rather than adjusted away:** the plan expected a
`Bitmap Index Scan` on `audit_log_workflow_run_idx`. Postgres chose a plain `Index Scan` on that
same index. That is the *stronger* of the two nodes for a single-row lookup — a bitmap build would
be pure overhead here — and it satisfies the AUDIT-04 index-usage criterion under the Phase 33 D-01
precedent. The named index is used; only the node kind differs from the prediction.

### Scale probe — because a plan over an empty table proves little

Both plans above are honest but were measured against zero audit rows, where "the planner chose the
index" is nearly free. To get an index-usage measurement that means something, 200,000 synthetic
rows were inserted, `ANALYZE`d and measured **inside `BEGIN ... ROLLBACK`**, exactly the pattern
Part 4 of the checked-in script uses. Nothing was committed; verified afterwards:

```
=== POST-ROLLBACK: audit_log must be back to 0 rows ===
 rows_after_rollback
---------------------
                   0
```

**Retention prune batch at 200k rows — the AUDIT-04 claim, and it holds:**

```
 Delete on audit_log  (actual time=13.590..13.591 rows=0 loops=1)
   ->  Nested Loop  (actual time=4.402..11.169 rows=5000 loops=1)
         ->  HashAggregate  (actual time=4.395..5.095 rows=5000 loops=1)
               ->  Subquery Scan on "ANY_subquery"  (actual time=0.379..2.638 rows=5000 loops=1)
                     ->  Limit  (actual time=0.037..1.482 rows=5000 loops=1)
                           ->  Index Scan using audit_log_created_at_idx on audit_log audit_log_1
                                 Index Cond: (created_at < (now() - '1 day'::interval))
         ->  Tid Scan on audit_log  (actual time=0.000..0.000 rows=1 loops=5000)
 Execution Time: 13.868 ms
```

Index-driven, `Tid Scan` for the delete, **13.868 ms for a 5,000-row batch** — consistent with
36-RESEARCH's 17.8 ms at 1,000,000 rows, and nowhere near the 395.7 ms un-indexed figure. No
`Seq Scan` anywhere.

**Finding worth carrying forward — the entity branch at scale did NOT use `audit_log_entity_idx`:**

```
 Limit  (actual time=2.302..2.305 rows=21 loops=1)
   ->  Incremental Sort  (actual time=2.301..2.303 rows=21 loops=1)
         Presorted Key: created_at
         ->  Index Scan Backward using audit_log_created_at_idx on audit_log al
               Filter: ((entity_type = 'deal') AND (entity_id = '768ca731-...'))
               Rows Removed by Filter: 10978
 Execution Time: 2.335 ms
```

At 200k rows the planner preferred a backward scan of `audit_log_created_at_idx` with a filter over
`audit_log_entity_idx`, discarding 10,978 rows to find 21. Still fast (2.3 ms), but it is not the
plan the index was declared for.

**This is very likely an artifact of the synthetic distribution and should not be read as a
production finding.** The probe put the target deal's rows at every 500th row across the whole time
range, so a `created_at DESC` walk hits 21 matches almost immediately — the best possible case for
that plan and the worst possible case for the entity index. Real audit rows for one deal cluster in
time instead. Recorded because it is what actually happened, and flagged as unresolved: the honest
measurement of `audit_log_entity_idx` under load needs real accumulated data, which nothing in this
phase can produce yet.

### No credential appears in any command

Every psql invocation runs through `docker compose exec -T postgres` on the container's unix socket.
No `PGPASSWORD`, no `-W`, no inlined connection URL, no `sudo`. The project `.env` was never read;
it is only referenced indirectly by `docker compose --project-directory`.

---

## Task 3 — NOT PERFORMED

`checkpoint:human-verify`, `gate="blocking"`. The eleven browser steps require a human at
`http://localhost:3001`. **No step was performed, self-approved, or recorded.** Fabricating browser
evidence would defeat the entire purpose of this plan, which exists because a passing unit suite has
already coexisted in this repo with every processor being dead in production.

The container is now ready for that walkthrough: rebuilt from `dc21c0e`, pruner confirmed alive,
`audit_log` empty and uncontaminated.

Outstanding items that only Task 3 can settle:

- the `actor_kind` breakdown showing `user`, `workflow_run`, `api_key` and `import`
- browser step 5's observed answer on webhook and workflow fan-out from custom-field-only saves
- browser step 7's one-field change map (the snake_case regression test)
- browser step 9's `[audit-prune]` deletion-count line
- a real-data measurement of `audit_log_entity_idx` under load

---

## Phase-level statements

**1. Audit capture required no edit to any mutation function — mechanically asserted.**
`src/lib/audit/no-mutation-coupling.test.ts` proves it over all nine non-test modules in
`src/lib/mutations/`: none imports, references, or calls into the audit layer, in any load form,
with comments stripped so the assertion cannot be invalidated by prose. The mutation modules emit a
`crmBus` event and know nothing about who listens. **The two importers are outside this claim, not
exceptions to it:** `src/app/import/actions.ts` and `src/lib/import/pipedrive-api-import-actions.ts`
write their one summary audit row directly via `db.insert(...)`, deliberately bypassing both the
mutation layer and the subscriber. `src/lib/custom-fields.ts` is also outside the gate's directory
scope; it emits a `crmBus` event and imports nothing from the audit layer, the same posture as the
mutation modules.

**2. SC-3 is satisfied at import-SESSION granularity, not per-record.** One import writes exactly
one audit row, carrying `import_session_id` and `actor_kind = 'import'`. Per-record events were
rejected because a single import would have produced 25,206 trigger evaluations and 25,206 webhook
deliveries — a fan-out that would have made imports unusable and would have buried every genuine
user change in the timeline. The consequence is stated plainly: **records auto-created by an import
(CSV organization/person auto-create, Pipedrive stubs) get no per-record audit rows at all**,
because those paths call `db.insert(...)` directly rather than going through the mutation layer.
Opening such a record shows an empty change history; that is the locked design, not a gap.

**3. Custom-field-only saves now fire webhooks and workflow triggers for the first time.**
Before 36-06, saving only custom fields emitted nothing, so no webhook and no workflow trigger ever
saw those writes. They do now, deliberately (T-36-16, dispositioned `accept`). **The observed
outcome is PENDING — browser step 5 has not been performed.** Existing workflows may react to saves
they have never previously seen, and this phase requires an observed answer rather than an assumed
one. This statement must be completed after Task 3.

**4. The audit table starts EMPTY, and there was no backfill.** Confirmed above: 0 rows, 88 kB.
There is no before-state to reconstruct for the 188,629 existing records — an audit row's entire
value is the `from` → `to` pair, and inventing one would be fabrication. A verifier opening an old
deal, organization, person or activity will see an empty change history, and **that is correct, not
a bug**. Only edits made from now on are recorded.

**5. The 90-day retention default ships as SEEDED DATA, not as a code fallback.** Part 3 of the
evidence script shows the `app_settings` row `audit.retention_days = 90` present in the live
database, written by migration 0014 (applied 2026-08-16 02:24:36 UTC) with no admin action. A fresh
deployment therefore prunes correctly out of the box. Meanwhile `readRetentionDays()` fails **closed**
— to "delete nothing" — on a cleared, corrupted or pre-migration row, so a missing setting can never
cause data loss. Default in data, fail closed in code: the two are complementary, and the evidence
script's Part 3 is what detects the seed being dropped by a botched restore (T-36-43).

**6. A database failure on the fire-and-forget insert loses that audit row.** The subscriber writes
without awaiting, and a failure leaves only the `.catch` log line as a trace. This is an accepted
limitation. The alternative — awaiting the audit write inside the user's request — violates AUDIT-02
and would make an audit-table hiccup block user writes outright. Losing a record of a change is
strictly better than losing the change.

---

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 — Blocking] The Docker image predated all 50 Phase-36 commits**
- **Found during:** Task 2
- **Issue:** The plan says "restart the app container so the current build is running". The
  `pipelite-app` image was built 2026-08-15T18:09:42-03:00, at the end of Phase 35; the plan's base
  commit is 2026-08-16T00:58:48-03:00. `docker-compose.yml` mounts no source for `app` (Next
  standalone, `build: .`), so there is no hot reload. A restart would have re-run the *same* stale
  image and Task 2's `[audit-prune]` criterion would have failed with no explanation.
- **Fix:** Rebuilt and recreated the `app` service from the main checkout (which sits exactly at the
  base commit), rather than from this worktree, so compose loads the project `.env`.
- **Files modified:** none (infrastructure only)
- **Commit:** n/a

**2. [Rule 1 — Plan defect] `toHaveLength(4)` was unsatisfiable against the stated scan**
- **Found during:** Task 1
- **Issue:** `src/lib/mutations/` holds nine non-test `.ts` files, not four. Asserting
  `toHaveLength(4)` on that scan fails; narrowing the scan to four to satisfy the literal would have
  weakened SC-5.
- **Fix:** The negative assertion runs over all nine (stronger claim); `toHaveLength(4)` anchors the
  four CRM entity modules, which is exactly what the plan's `crmBus.emit` positive marker describes.
  Both the count and the emitter set are asserted, in both directions.
- **Commit:** `470943f`

### Findings recorded, not fixed

**3. [Plan-ordering defect] Task 2's `actor_kind` criterion depends on Task 3's output**
Task 2 must show `actor_kind` including `user`, but only Task 3's browser walkthrough can create
audit rows, and Task 3 runs after Task 2 behind a human gate. The table was left empty rather than
seeded, because planted rows would falsify browser steps 2, 4, 8 and 9. The breakdown must be
re-captured after the walkthrough.

**4. [Expectation vs reality] The run→records lookup uses `Index Scan`, not `Bitmap Index Scan`**
Same index (`audit_log_workflow_run_idx`), stronger node for a single-row lookup. Recorded rather
than adjusted; satisfies the criterion under Phase 33 D-01.

**5. [Unresolved] `audit_log_entity_idx` is not chosen under the synthetic 200k probe**
The planner preferred `audit_log_created_at_idx` backward with a filter, discarding 10,978 rows.
Almost certainly an artifact of the probe's uniform time distribution rather than a production
finding, but it is unproven either way and needs real accumulated data to settle.

---

## Out-of-scope discoveries

- `deal_stage_history` and `workflow_runs` are both empty in this database (0 rows each). Browser
  steps 6 and 9 will need the human to create a workflow run first; there is nothing pre-existing to
  observe.
- Only **one** note in the entire database is attached to a deal (`entity_type = 'deal'`); the other
  75,235 are on activities (46,198) and organizations (29,037). Browser step 4 ("a record whose only
  history is audit entries") is therefore easy to satisfy with almost any deal.
- The `app` container logs an npm major-version notice (10.8.2 → 12.0.2) on every start. Cosmetic,
  unrelated to this phase, not actioned.

---

## Commits

| Task | Type | Hash | Message |
|---|---|---|---|
| 1 | test | `470943f` | `test(36-20): add the SC-5 no-mutation-coupling source gate` |
| 2 | docs | this commit | `docs(36-20): record the SC-5 gate and the database evidence` |

---

## Self-Check

- `src/lib/audit/no-mutation-coupling.test.ts` — FOUND
- `.planning/phases/36-audit-log/36-20-SUMMARY.md` — FOUND
- commit `470943f` — FOUND in `git log`
- `src/lib/mutations/deals.ts` — unmodified after red run 1 (`git status --short` clean)
- `audit_log` — 0 rows committed, scale probe rolled back

## Self-Check: PASSED (for Tasks 1-2 only)

Task 3 is unexecuted by design and is not covered by this check.

---

# Task 3 — Browser verification in Docker (executed 2026-08-16)

Driven by the orchestrator against `http://localhost:3001` after rebuilding the `app` image.
**Two production defects were found and fixed during this task.** Both were invisible to the
1,335-test suite; both defeated the phase's own goal in the running container.

## Defect 1 — every audit row was attributed to `system` (fixed, `46b3413`)

Next.js bundles `instrumentation.ts` into a different module graph from the app's server actions,
so `src/lib/audit/actor-context.ts` was instantiated **twice** in a production build: once in the
graph that registers the audit subscriber (the READER) and once in the graph that runs the wrapped
server actions (the WRITER). Each held its own `AsyncLocalStorage`, so `getStore()` in the
subscriber always returned `undefined` and every row fell back to `?? "system"` with a null user.

- **Observed:** a deal created by a logged-in user in the browser wrote `actor_kind = system`,
  `actor_user_id = NULL`.
- **Confirmed by bundle inspection:** two chunks in `/app/.next/server/chunks` each define
  `getCurrentActor` and construct their own `AsyncLocalStorage` — `d3f92449` (contains
  `registerAuditSubscriber`) and `2ca07b42` (the app graph).
- **Why the tests missed it:** vitest has a single module registry, so reader and writer are always
  the same instance under test.
- **Why the EVENT arrived but the ACTOR did not:** `crmBus` (`src/lib/events/bus.ts:25`) already
  carries a `globalThis` singleton for exactly this reason. `actorStorage` did not.
- **Fix:** same `globalThis` pattern.
- **Verified after fix:** the same browser edit records `actor_kind = user` with the correct
  `actor_user_id`.

This alone would have shipped AUDIT-01 as non-functional: no CRM change would have been traceable
to who made it.

## Defect 2 — custom-field edits produced no audit row at all (fixed, `3b393c7`)

`recalculateFormulas` has two no-op paths returning a blob that does not contain the values the
save just wrote. The SC-4 fast path (`formula-recalc.ts:663`) returns `input.row?.customFields ?? {}`,
and `saveFieldValues` **deliberately omits `row`** — so it returns `{}` whenever no formula
references the changed field, which is the common case for any custom field nothing computes from.

`saveFieldValues:298` assigned that result directly, so the emitted `data.customFields` was `{}`.
The audit diff compared `{}` before against `{}` after, produced no change map, and the
subscriber's "an update that changed nothing writes no row" guard discarded the event.

- **Observed:** editing the text custom field `UUID UC (TYR Core)` persisted the value
  (`{"UUID UC (TYR Core)": "AUDIT36-CF-TEST-2"}`) and wrote **zero** audit rows. No `[audit]` error
  in the logs, because the insert was never attempted.
- **Blast radius beyond audit:** the same empty blob went to every webhook and workflow trigger —
  undercutting the very behaviour change 36-06 introduced (T-36-16).
- **Fix:** layer the recalc result over the written blob (`{ ...next, ...result.customFields }`).
  On the success path `result.customFields` is `{ ...existing, ...computed }` over the post-write
  blob, so this is a no-op there.
- **Test change (flagged deliberately):** the CFUI-02 test asserted `result.values` was *identically*
  `recalculateFormulas`' return. That expectation encoded the bug and silently dropped a posted
  non-formula value (`Origem`). Rewritten to assert the merge, plus a new regression test covering
  the empty-recalc path.
- **Verified after fix:** the same edit writes one row —
  `{"customFields.UUID UC (TYR Core)": {"from": "AUDIT36-CF-TEST-2", "to": "AUDIT36-CF-FIXED"}}`.

## Step-by-step results

| # | Step | Result |
|---|---|---|
| 1 | User edit → attributed entry with before→after | **PASS** (after Defect 1 fix) — `prbitt@gmail.com updated this deal`, avatar rail, `UUID UC (TYR Core) AUDIT36-CF-TEST-2 → AUDIT36-CF-FIXED`. Multi-field rendering confirmed on the create entry (Title / Value / Stage + "Show 6 more fields"). Performed as a custom-field + workflow edit rather than title+owner — the deal detail page exposes no native-field edit control. |
| 2 | Filter default OFF | **PASS** — `Timeline (0)` with `Show field changes (1)` and the toggle off on first load; audit total shown separately in parentheses. |
| 3 | Cursor trap | **PASS** — 48 entries across 3 pages, strict descending, no duplicates or gaps. Toggling OFF dropped `?changes=1`, reset to `Timeline (0)` and discarded all 48 rather than merging. Toggling back ON restarts at page 1; Load more yields a second page of audit entries. |
| 4 | Empty-state trap | **PASS** — "No notes, activities or stage changes yet / 1 field change is hidden on this record. Turn on Show field changes to see them." Does **not** say "Nothing has happened yet" and names the control. |
| 5 | Custom fields (the behaviour change) | **PASS after two fixes.** This is the step that exposed both defects. **Observed answer on the side effect:** no workflow fired and no webhook was delivered — because at the time of the test there were zero active workflows with an `*.updated` trigger and no webhook subscriptions configured in this database. The trigger/webhook exposure is therefore real but currently unexercised here; on a database with active unfiltered `*.updated` workflows it would fire on every custom-field edit. |
| 6 | Workflow attribution (SC-2) | **PASS** — run completed; row `actor_kind = workflow_run` carrying `workflow_run_id`, one changed field. Timeline shows "AUDIT36 walkthrough workflow updated this person" with the Workflow badge, rail icon and a link to the run. Run detail shows "Records changed (1)" listing Audit Tester, Updated, "1 field". |
| 7 | API key, exactly one field (SC-3) | **PASS** — the step the plan called most likely to fail. `PUT /api/v1/people/:id` with `{"phone": ...}` produced `actor_kind = api_key` and **exactly one** changed field, correct from→to. The snake_case-payload regression did not occur. Entry renders the generic "API key" label, consistent with 36-17's finding that `apiKeyName` is permanently null. |
| 8 | Import, one summary row (SC-3) | **PASS** — 3-row CSV import produced **exactly one** row: `actor_kind = import`, `entity_type = import_session`, `changes = {people: 3, warnings: 0, autoCreated: 0}`. No per-record rows. `import_session_id` is null on the CSV path, matching 36-12. |
| 9 | Retention (SC-4) | **PASS** — input showed **90** on first load with no admin action (migration-0014 seed). "Audit entries stored" and "Oldest entry" both render. Lowering to 1 raised the shorten dialog with the required "the next time pruning runs" copy; raising back to 90 correctly did **not**. After restart the pruner used the runtime value: `[audit-prune] deleted 0 row(s) older than 1d` (0 is correct — all entries are same-day). Restored to 90. |
| 10 | Escaping | **PASS** — a custom field named `<script>alert(1)</script>` renders as literal text in both the field list and the audit entry. No execution, no broken markup, page stayed responsive. |
| 11 | Cross-cutting (dark mode, 320px, es-ES/pt-BR) | **NOT VERIFIED.** `resize_window` reported success twice but the rendered viewport did not change, so the 320px check could not be performed honestly; dark mode and the two locales were not exercised. This remains outstanding human UAT. |

## Additional findings (not fixed — outside this phase)

- **`deals.createdAt` renders as a raw i18n key** on the deal detail page; the container logs
  `Error: MISSING_MESSAGE: deals.createdAt (en-US)` on every render. Pre-existing, not Phase 36.
- **Retention dialog copy says "1 days"** — no singular pluralisation. Phase 36 copy defect, cosmetic.
- **`users.name` is NULL** for the test account, so entries fall back to the email address and the
  Owner field reads "Unknown". A data condition, not a defect — the actor join resolves correctly.

## Environment note

The container was stale at the start of Task 3 (built during Phase 35, zero of this phase's commits,
no source mount). It was rebuilt from the main checkout, and rebuilt twice more to verify each fix.

## Test artifacts left in the database

`AUDIT-36 Walkthrough Test Deal`, person `audit36-test-person`, 3 imported `*Audit36` people,
workflow `audit36-wf` (deactivated), and 52 `audit_log` rows. The walkthrough's API key was
**deleted** and the `<script>` custom-field definition **removed** (it rendered on every person page).

## Task 3 verdict

Ten of eleven steps pass. Step 11 is outstanding. Two defects that defeated AUDIT-01 in production
were found here and nowhere else — which is precisely the gap this plan exists to close.
