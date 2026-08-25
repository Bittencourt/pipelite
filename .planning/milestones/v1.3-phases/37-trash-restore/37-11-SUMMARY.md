---
phase: 37-trash-restore
plan: 11
subsystem: trash-retention-pruner
tags: [trash, retention, pruner, background-timer, fail-closed, deployment-gate, tdd]

# Dependency graph
requires:
  - plan: 37-01
    provides: "readTrashRetentionDays() — null means purge nothing, no code-level default"
  - plan: 37-02
    provides: "TRASH_PRUNE_ORDER — activity, deal, person, organization (leaves first)"
  - plan: 37-06
    provides: "purgeRecordByType(entityType, id) — the exhaustive per-entity teardown dispatch"
provides:
  - startTrashPruner
  - INITIAL_DELAY
  - TICK_INTERVAL
  - BATCH_SIZE
  - MAX_BATCHES_PER_TICK
  - "a sixth background processor registered in instrumentation.ts"
affects:
  - "the /admin/trash retention form (its value now governs a live automated delete)"
  - "audit_log (every automated purge writes a system-actor row)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "self-scheduling setTimeout chain with the reschedule outside the try"
    - "fail-closed background tick: null setting ⇒ no query AND no mutation"
    - "capped batch loop with a no-progress break, per entity type"
    - "server-side cutoff arithmetic: now() - make_interval(days => $1), never a bound JS Date"
    - "behavioural deployment gate: the container log line, not the registration"

key-files:
  created:
    - src/lib/trash/prune.ts
    - src/lib/trash/prune.test.ts
  modified:
    - instrumentation.ts

key-decisions:
  - "BATCH_SIZE = 200, not the audit pruner's 5,000: a trash purge is a multi-statement teardown per row, not one bulk DELETE. Documented as an unmeasured tunable rather than presented as a measurement"
  - "MAX_BATCHES_PER_TICK = 25 ⇒ 5,000 records per entity type per day; starvation accepted because the total is logged every tick"
  - "A full batch that purged NOTHING breaks the loop early — added beyond the plan, because the next LIMIT query re-selects the same head-of-line rows and would spin the whole cap while starving every entity type after it"
  - "The physical-row-address subselect from the audit pruner is deliberately not carried over, and is not named anywhere in prune.ts (the plan gates that token at zero occurrences, and naming it in a comment is itself a gate violation)"
  - "The Docker gate was run by building the WORKTREE into the pipelite-app image and force-recreating the container, because the plan's literal `docker compose up -d --build` from the main checkout would have built code that does not contain this plan"

requirements-completed: [TRASH-03]

# Metrics
duration: ~35 min
completed: 2026-08-16
tasks_completed: 3
tests_added: 21
files_created: 2
commits: 3
---

# Phase 37 Plan 11: Trash Retention Pruner Summary

**A daily, fail-closed, always-rescheduling `setTimeout` chain that purges expired trash leaves-first
in capped batches — proven to run inside the rebuilt container by its own log output, and observed
permanently purging 15 real expired records with a `system` audit actor.**

## The gate, and what it actually showed

This plan's point was not the code. It was establishing that the code runs in the image, because
`Dockerfile:24` still ends in `2>/dev/null || true` and that exact suppressed failure killed all four
processors on 2026-08-08 while every test passed.

**Every command's actual output, verbatim.**

### 1. Rebuild

The plan's literal step is `docker compose up -d --build` from `/home/pedro/programming/pipelite`.
**That command could not have proven anything here** — its build context is the main checkout, which
does not contain this branch. See Deviations. What was run instead:

```
$ docker build -t pipelite-app /home/pedro/programming/pipelite/.claude/worktrees/agent-ad52ea2f0be8436b9
...
#27 naming to docker.io/library/pipelite-app:latest done
#27 unpacking to docker.io/library/pipelite-app:latest 19.7s done
#27 DONE 98.4s

$ docker compose -f .../docker-compose.yml --project-directory /home/pedro/programming/pipelite \
      -p pipelite up -d --force-recreate --no-build app
 Container pipelite-postgres-1 Running
 Container pipelite-app-1 Recreate
 Container pipelite-app-1 Recreated
 Container pipelite-postgres-1 Waiting
 Container pipelite-postgres-1 Healthy
 Container pipelite-app-1 Starting
 Container pipelite-app-1 Started
```

### 2. The five pre-existing processors still announce themselves

```
$ docker compose ... logs app | grep -E '\[(webhook|email|schedule|execution)-processor\] Starting|\[audit-prune\] Starting'
app-1  | [webhook-processor] Starting with initial delay of 5s
app-1  | [email-processor] Starting with initial delay of 15s
app-1  | [schedule-processor] Starting with initial delay of 10s
app-1  | [execution-processor] Starting with initial delay of 5s
app-1  | [audit-prune] Starting with initial delay of 60s, ticking daily
```

All five present. The rebuild broke nothing that was working.

### 3. THE GATE

```
$ docker compose ... logs app | grep -F '[trash-prune] Starting'
app-1  | [trash-prune] Starting with initial delay of 60s, ticking daily
```

**Matched.** `instrumentation.js` reached `.next/standalone/` and `register()` ran the new
registration. This, and not the presence of `startTrashPruner` in `instrumentation.ts`, is the
evidence SC-4 is met.

### 4. A real tick with a valid window

No forced 1-day window was needed — the live setting is already 30, and there was expired data:

```
$ docker compose ... logs app | grep -F '[trash-prune]'
app-1  | [trash-prune] Starting with initial delay of 60s, ticking daily
app-1  | [trash-prune] purged 15 record(s) older than 30d
```

**Those 15 records are permanently gone.** That is TRASH-03 working as specified — the window was
already live at 30 days and the whole requirement is that expired records leave trash with no admin
action — but it is a real, irreversible effect on the dev database and is called out here rather than
buried. Trash is now empty:

```
$ psql -c "SELECT 'deals', count(*) FROM deals WHERE deleted_at IS NOT NULL UNION ALL ..."
       t       | count
 --------------+-------
  deals        |     0
  people       |     0
  organizations|     0
  activities   |     0
```

**An extra live check beyond the plan's list — T-37-08 confirmed in the container, not just in a
mock.** The fake-timer suite asserts `runWithActor({kind:"system", userId:null})` against a stub; the
audit rows the real purges wrote prove the actor survived `AsyncLocalStorage` across the
`instrumentation.ts` module graph, which is exactly where it silently failed for the audit subscriber
on 2026-08-16:

```
$ psql -c "SELECT entity_type, action, actor_kind, actor_user_id, count(*) FROM audit_log
           WHERE created_at > now() - interval '30 minutes' GROUP BY 1,2,3,4 ORDER BY 1,2;"
 entity_type  | action  | actor_kind |            actor_user_id             | count
--------------+---------+------------+--------------------------------------+-------
 activity     | deleted | system     |                                      |     1
 deal         | deleted | api_key    | ef4acac9-e860-4e71-9db5-ddaa2808cb9f |     1
 deal         | deleted | system     |                                      |    12
 deal         | updated | api_key    | ef4acac9-e860-4e71-9db5-ddaa2808cb9f |     1
 organization | deleted | system     |                                      |     1
 person       | deleted | system     |                                      |     1
```

12 + 1 + 1 + 1 = **15 system-actor rows, every `actor_user_id` null**. Not one automated purge
acquired a plausible-looking user identity.

### 5. The fail-closed path is real

```
$ docker exec -i pipelite-postgres-1 psql -U pipelite -d pipelite \
    -c "UPDATE app_settings SET value = '0'::jsonb WHERE key = 'trash.retention_days';"
UPDATE 1
         key          | value | jsonb_typeof
----------------------+-------+--------------
 audit.retention_days | 90    | number
 trash.retention_days | 0     | number

$ docker compose ... restart app
 Container pipelite-app-1 Restarting
 Container pipelite-app-1 Started

$ docker compose ... logs --since 3m app | grep -E 'trash-prune|trash-settings'
app-1  | [trash-prune] Starting with initial delay of 60s, ticking daily
app-1  | [trash-prune] purged 15 record(s) older than 30d          ← previous boot
app-1  | [trash-prune] Starting with initial delay of 60s, ticking daily
app-1  | [trash-settings] trash.retention_days is not an integer in [1, 365] — trash purging is disabled until it is corrected
app-1  | [trash-prune] retention unset or invalid — nothing purged
```

The fail-closed line appears and **no `purged` line accompanies it** — the whole 37-01 → 37-11 chain
is visible in two lines: the settings module rejected `0` as out of range and returned `null`, and the
pruner branched on the `null` without substituting a default.

### Setting restored, and a healthy tick after it

```
$ docker exec -i pipelite-postgres-1 psql -U pipelite -d pipelite \
    -c "UPDATE app_settings SET value = '30'::jsonb, updated_at = now() WHERE key = 'trash.retention_days';"
UPDATE 1
         key          | value | jsonb_typeof
----------------------+-------+--------------
 audit.retention_days | 90    | number
 trash.retention_days | 30    | number

$ docker compose ... logs --since 90s app | grep -E 'trash-prune|trash-settings'
app-1  | [trash-settings] trash.retention_days is not an integer in [1, 365] — trash purging is disabled until it is corrected
app-1  | [trash-prune] retention unset or invalid — nothing purged
app-1  | [trash-prune] Starting with initial delay of 60s, ticking daily
app-1  | [trash-prune] purged 0 record(s) older than 30d
```

`app_settings` is left holding `trash.retention_days = 30`, `jsonb_typeof = number`. The zero-count
line is the one that matters operationally: it is emitted at zero, which is the only signal the cap
is ever starving the delete rate.

The pre-existing `MISSING_MESSAGE: deals.createdAt (en-US)` noise appears in these logs and is
unrelated to this phase, as the plan anticipated.

## What Was Built

`src/lib/trash/prune.ts` follows `src/lib/audit/prune.ts` structurally — the module-private
`scheduleTick`, the reschedule outside the `try`, the log line every tick — with three substantive
divergences the audit pruner's shape does not survive:

- **Selects ids, does not bulk-delete.** The audit pruner's single-statement form belongs to a table
  it can delete from in one statement. A trash purge is an ordered multi-statement teardown in its own
  transaction per row, so this pruner runs
  `SELECT "deals"."id" FROM "deals" WHERE "deals"."deleted_at" < now() - make_interval(days => $1) LIMIT $2`
  and hands each id to `purgeRecordByType`. The table and column are **drizzle references**, not
  hand-written identifiers, so a renamed column follows automatically rather than becoming a runtime
  SQL error inside a background timer where nobody is watching.
- **Two loops, not one.** The outer loop is `TRASH_PRUNE_ORDER` — read from the literal array, never
  from `Object.keys` — so leaves-first ordering is a contract and not an artifact of object literal
  key order. The inner loop is the capped batch loop, per entity type.
- **Two break conditions, not one.** A short batch means nothing older is left. A *full* batch that
  purged **nothing** also breaks — see Deviations; that one is not in the plan.

Every individual purge is wrapped on its own, so one undeletable row does not abort its batch, and
the failing record is logged by **identifier only** (T-37-30).

## Verification Results

| Gate | Required | Result |
|------|----------|--------|
| `npx vitest run src/lib/trash/prune.test.ts` | ≥ 14 tests | **21 passed** |
| fail-closed test asserts absence of BOTH `db.execute` and `purgeRecordByType` | required | present — `"issues no database call and no purge at all when the window is null"` |
| a test asserts `params.some((p) => p instanceof Date) === false` | required | present |
| a test asserts the four statements name the tables in order | required | present — `toEqual(["activities","deals","people","organizations"])`, and separately against `TRASH_PRUNE_ORDER.map(...)` |
| a test asserts `vi.getTimerCount() >= 1` after a thrown tick, and the next tick still reads the window | required | present, in three variants (settings read, id query, purge) |
| `grep -c 'ctid' src/lib/trash/prune.ts` | 0 | **0** |
| `grep -c 'setInterval' src/lib/trash/prune.ts` | 0 | **0** |
| `grep -c 'export function scheduleTick\|export const scheduleTick'` | 0 | **0** |
| `grep -c 'startTrashPruner' instrumentation.ts` | 2 | **2** |
| `grep -c 'startAuditPruner' instrumentation.ts` | 2 | **2** |
| new lines inside the `NEXT_RUNTIME === "nodejs"` guard | required | yes — appended after the `startAuditPruner` block, no existing registration reordered |
| `npm run typecheck` | exit 0 | **exit 0** |
| `npm run lint` | 0 errors | **0 errors, 125 warnings** (baseline unchanged; none in `src/lib/trash/`) |
| `docker compose logs app \| grep -F '[trash-prune] Starting'` after a rebuild | must match | **matched** |
| all five pre-existing processor start lines still present | required | **all five** |

**Full suite:** 1621 passed / 1 failed / 4 skipped, plus 8 rsc. Baseline was 1601 + 4 skipped, and
1601 + 21 new = 1622, which is exactly the total observed. The one failure is
`src/lib/execution/condition-evaluator.test.ts > "scales linearly, not quadratically, with path
length"` — the documented load-sensitive flake, asserting `large/small < 10` and measuring 11.94 under
parallel agent load. **Passes in isolation: 70/70.** It touches no file this plan modified. Left alone
per the scope boundary. `npm test` short-circuits on `&&`, so the rsc project was run separately: 8/8.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The worktree had no `node_modules` and no `.env`**

- **Found during:** Task 1, before the RED run
- **Issue:** the git worktree is a bare checkout — `npx vitest` and `npm run typecheck` were both
  unrunnable.
- **Fix:** symlinked `node_modules`, `.env` and `.env.local` from the main checkout. All three are
  gitignored (and `.dockerignore`d), so nothing entered a commit or a build context. No package was
  installed.
- **Files modified:** none tracked
- **Commit:** n/a

**2. [Rule 3 - Blocking] The plan's literal Docker gate command could not have proven the gate**

- **Found during:** Task 3
- **Issue:** the plan specifies `docker compose up -d --build` run from
  `/home/pedro/programming/pipelite`. The `app` service is `build: .`, so that command's build context
  is the **main checkout** — which does not contain this plan's branch. It would have produced a green
  `[trash-prune] Starting`… only if the code were already merged, and a red one otherwise, in neither
  case testing what was written. 37-01 hit the adjacent form of this ("`docker compose` from a
  worktree resolves a different project name and reports 0 services").
- **Fix:** built the **worktree** directly into the image name compose already consumes
  (`docker build -t pipelite-app <worktree>`), then force-recreated only the `app` service against the
  live `pipelite` project by absolute path
  (`-f .../docker-compose.yml --project-directory /home/pedro/programming/pipelite -p pipelite up -d --force-recreate --no-build app`).
  `--no-build` is what stops compose from rebuilding from the main checkout and silently discarding
  the image just built. The project name, its config-file path, and the `postgres`/`mailhog`
  containers are all left exactly as they were, so nothing points at the worktree after it is removed.
- **Files modified:** none tracked
- **Commit:** n/a

**3. [Rule 1 - Bug] The test's own SQL assertion was case-wrong**

- **Found during:** Task 1 GREEN — 20/21 passing
- **Issue:** `expect(sql).toContain("select")` against a rendered statement that reads `SELECT`.
- **Fix:** compared on `sql.toLowerCase()`. The assertion's intent (a select, not a delete) is
  unchanged.
- **Files modified:** `src/lib/trash/prune.test.ts`
- **Commit:** `7375970`

### Added beyond the plan (Rule 2)

**4. A full batch that purges nothing breaks the loop for that entity type**

The plan's batch loop has exactly one exit before the cap: a short batch. That is not sufficient, and
the gap is a denial-of-service one rather than a cosmetic one. The batch query is
`SELECT … WHERE deleted_at < cutoff LIMIT 200` with **no offset**, so a record whose teardown
permanently fails — a foreign key this phase did not anticipate, a row another process holds — is
re-selected by the very next batch query. Without a no-progress exit the tick spins all 25 batches on
the same 200 head-of-line rows, and because the entity types are walked in sequence, **every table
after it in `TRASH_PRUNE_ORDER` is starved entirely** while the log still reports a plausible-looking
total. The break emits its own `console.error` naming the entity type, so the condition is visible
rather than inferred from a suspiciously round number. Pinned by
`"stops re-reading a table when a full batch purged nothing at all"`.

This does not weaken the plan's stated behaviour: one failing record still does not abort its batch
(the per-record try/catch is untouched), and the cap test still drives 25 full batches because those
purges succeed.

**5. Six tests beyond the plan's enumerated behaviours**

21 rather than the 14 floor. The additions pin register entries the plan asserts in prose without
listing a case: that the statement reads `deleted_at` and not `created_at` (a copy-paste from the
audit pruner would typecheck and silently purge by creation date); that it is a select and not a
delete; that `runWithActor` is called for *every* purge rather than once; that the logged total sums
across all four entity types; and the no-progress break above.

### Adapted, not auto-fixed

**6. The forced 1-day window was not needed and was not used**

Plan step 4 asks for the retention window to be temporarily set to 1 day via the admin UI to force an
observable tick, noting `N may be 0`. It was not necessary: the live window is already 30 and there
was real expired data, so the very first tick logged `purged 15 record(s) older than 30d` — a
**stronger** observation than the intended `purged 0 record(s) older than 1d`, since it exercises the
select, the dispatch, the teardown and the audit actor rather than only the log line. Narrowing the
window to 1 day would additionally have put every record trashed in the last month at risk of
permanent deletion for no additional evidence, which is the wrong trade on a database holding real
work. The fail-closed half of the same step (step 5) was run exactly as written.

---

**Total deviations:** 3 auto-fixed, 2 additions, 1 adaptation.
**Impact on scope:** none. The pruner is strictly stronger than specified; the gate is strictly
better evidenced.

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED | `c947f2d` `test(37-11): add failing fake-timer tests for the trash pruner` | Verified failing before implementation — `Error: Cannot find module '/src/lib/trash/prune'`, **0 tests executed** |
| GREEN | `7375970` `feat(37-11): add the daily trash retention pruner` | 21/21 pass |
| REFACTOR | — | not needed |

No test passed unexpectedly during RED — the suite could not even load, which is the strongest form
of the gate.

## Commits

| Hash | Message |
|------|---------|
| `c947f2d` | `test(37-11): add failing fake-timer tests for the trash pruner` |
| `7375970` | `feat(37-11): add the daily trash retention pruner` |
| `580e6ad` | `feat(37-11): register the trash pruner in instrumentation.ts` |

## Threat Coverage

| Threat | Disposition | Where it lands |
|--------|-------------|----------------|
| T-37-05 (tampered retention read) | mitigate | No `?? 30` anywhere; `null` branches to a log and nothing else. Asserted by the **absence** of both `db.execute` and `purgeRecordByType`, and observed live with the setting forced to `0` |
| T-37-06 (one long tick holding write locks) | mitigate | `BATCH_SIZE = 200` × `MAX_BATCHES_PER_TICK = 25` per entity type, plus the no-progress break. Starvation accepted because the total is logged every tick, at zero included — verified in the container |
| T-37-18 (cutoff arithmetic) | mitigate | `now() - make_interval(days => $1)` server-side from a bound integer; `params.some(p => p instanceof Date)` asserted `false` |
| T-37-08 (pruner's audit actor) | mitigate | Explicit `runWithActor({kind:"system", userId:null})` on every purge, asserted in the suite **and** confirmed against 15 real `audit_log` rows written by the running container, all `actor_kind = system` with a null `actor_user_id` |
| T-37-29 (a tick that stops rescheduling) | mitigate | `scheduleTick(TICK_INTERVAL)` outside the `try`, `scheduleTick` module-private (grep gate 0). Three rejection paths each assert a pending timer and a following tick |
| T-37-11 (Docker standalone build) | mitigate | The behavioural gate above, run against a container rebuilt from this branch. All five pre-existing processors re-verified in the same log |
| T-37-30 (pruner logging) | mitigate | Counts and identifiers only; a failed record is logged as `<entityType> <id>` and never by content |
| T-37-SC (package installs) | accept | Nothing installed |

## Threat Flags

None. This plan adds no network endpoint, no auth path, no file access and no schema change. It adds
one automated deletion path, which is the surface the register already covers end to end (T-37-05,
T-37-06, T-37-08, T-37-18, T-37-29, T-37-30).

## Known Stubs

None. `BATCH_SIZE = 200` is an **unmeasured tunable**, documented as such in its own comment rather
than presented as a measurement — it is a real number doing real work, not a placeholder, but the
next person to touch this should time it against a seeded batch before trusting it.

## Notes for Downstream Plans

- **The pruner is live in the running container right now**, on a 30-day window. Any plan that seeds
  or restores test data with an old `deleted_at` should expect it to be permanently purged within a
  day. Trash is currently empty.
- **The retention form (whichever plan owns `/admin/trash`) now governs a live automated delete.** A
  shorten-retention confirmation dialog is not cosmetic — lowering the number destroys records on the
  next tick with no further action.
- **The container is running an image built from this worktree branch.** A later
  `docker compose up -d --build` from the main checkout will rebuild from main and **revert** the
  container to code without this plan until the branch is merged. That is expected; re-run the gate
  after the merge if a later plan needs the pruner live.
- **Do not export `scheduleTick`.** Two overlapping chains purging the same four tables is exactly the
  lock contention the cap exists to prevent, and there is a grep gate at zero on it.
- **`app_settings` holds `trash.retention_days = 30`, `jsonb_typeof = number`.** It was set to `0` and
  back during the gate; do not re-seed it.

## Self-Check: PASSED

Files:
- FOUND: `src/lib/trash/prune.ts`
- FOUND: `src/lib/trash/prune.test.ts`
- FOUND: `instrumentation.ts` (modified)

Commits:
- FOUND: `c947f2d` test(37-11): add failing fake-timer tests for the trash pruner
- FOUND: `7375970` feat(37-11): add the daily trash retention pruner
- FOUND: `580e6ad` feat(37-11): register the trash pruner in instrumentation.ts

Working tree clean; no tracked file deleted by any of the three commits.

---
*Phase: 37-trash-restore*
*Completed: 2026-08-16*
