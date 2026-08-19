---
phase: 39-duplicate-detection-merge
plan: 06
subsystem: background-jobs
tags: [drizzle, jsonb, instrumentation, crash-recovery, vitest, docker, behavioural-verification]

# Dependency graph
requires:
  - phase: 39-duplicate-detection-merge
    provides: "plan 39-05 — the dedup_scans table, DedupScanStatus, and dedup_scans_active_idx on (entity_type, status), which is the index the per-entity-type guard queries"
  - phase: 39-duplicate-detection-merge
    provides: "plan 39-01 — MergeableEntityType in src/lib/dedup/types.ts, imported rather than restated (S-8)"
  - phase: 45-instrumentation-hardening
    provides: "the instrumentation.ts closing comment and the Dockerfile:24 story that makes a container-log gate mandatory rather than optional"
provides:
  - "src/lib/dedup/scan-state.ts — createScanState, getScanState, getLatestScan, updateScanState, cancelScan, isScanCancelled, calculateScanProgress"
  - "DedupScanProgress = { current: number; total: number } — the exact JSONB shape, matching what UI-SPEC P-1 renders and nothing more"
  - "SCAN_ALREADY_RUNNING — the exported concurrency-refusal sentinel the server action matches on"
  - "src/lib/dedup/scan-cleanup.ts — cleanupStaleDedupScans, registered in instrumentation.ts and proven to run"
  - "an unconditional [dedup-scan-cleanup] Starting boot line, i.e. a greppable execution proof for every later plan in this phase"
affects: [39-07 scan job loop, 39-11 scan server actions and the P-6 ownership comparison, 39-08 review UI polling]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "The running-job guard is scoped to the job's subject (entityType), not global — a per-type predicate asserted on the SQL tree rather than on a mocked return value"
    - "cancel raises a flag; the running loop writes the terminal status. A late cancel therefore cannot rewrite a completed status"
    - "A boot task logs unconditionally, twice, with a fixed prefix, so its execution is greppable. Conditional logging makes a silent success indistinguishable from a function that never ran"
    - "A production image built from the worktree and run as a throwaway container proves register() executes without replacing the shared serving container"

key-files:
  created:
    - src/lib/dedup/scan-state.ts
    - src/lib/dedup/scan-state.test.ts
    - src/lib/dedup/scan-cleanup.ts
    - src/lib/dedup/scan-cleanup.test.ts
  modified:
    - instrumentation.ts

key-decisions:
  - "createScanState inserts the row as `running`, not `idle` as the analog does. The analog's two-step (insert idle, runner flips to running) widens the window in which two callers both see no running session; inserting `running` closes it as far as a read-then-write can. Documented as advisory, not atomic — the boot reaper is the recovery for a row this strands"
  - "The behavioural log gate was satisfied WITHOUT replacing the shared app container: the image was built from this worktree and run as a throwaway container on pipelite_default, then removed. This respects the wave-3 shared-resource rule (`do not rebuild the container`) while proving exactly what the plan asked — that Dockerfile:24's silent-failure-prone copy produced an instrumentation.js whose register() actually executes"
  - "Two acceptance-criteria greps (`session.user|auth()` = 0 in scan-state.ts, `total > 0` = 0 in scan-cleanup.ts) initially returned 1 and 2 — from PROSE, not code. The comments explaining what the file deliberately does NOT do spelled the forbidden tokens verbatim. Reworded to describe the absent thing without naming it, and each reworded comment now says the grep is what gates it, so a future reader does not reintroduce the token"
  - "REQUIREMENTS.md was deliberately NOT edited. DEDUP-01 is claimed by ten plans in this phase and this is the sixth; marking it complete here would be false, and it is a shared artifact that concurrent wave-3 worktrees would conflict on. Left to the orchestrator"
  - "No partial unique index enforcing one running scan per entity type. That is a schema change (a new migration) from a wave-3 worktree running beside other agents, i.e. a colliding migration number — deferred, with the residual documented below"

patterns-established:
  - "Assert the PREDICATE, not the mock's return value. A mocked findFirst does not filter, so `a person scan is not blocked by an organization scan` can only be proven by showing the query mentions entity_type. The test comment says so explicitly, so nobody later `strengthens` it into a fiction"
  - "sqlTokens: walk a drizzle SQL tree collecting column names, raw text AND bound string params. Collecting the params is what turns `the predicate mentions status` into `the predicate says status = 'idle'`, which is the half that can silently drift. JSON.stringify is unusable — a Column back-references its table and the structure is circular"
  - "Assert bound Date params against a faked clock, so `one hour` and `thirty days` are pinned rather than merely `there is a created_at < something`"
  - "A boot task's startup log line belongs OUTSIDE its try/catch. Inside, a DB hiccup at boot makes the behavioural gate report `never ran` — the opposite of the truth"

requirements-completed: [DEDUP-01]

# Metrics
duration: 25min
completed: 2026-08-19
---

# Phase 39 Plan 06: The Dedup Scan State Layer and Its Boot Reaper Summary

**`dedup_scans` CRUD with a running-scan guard that is provably scoped per entity type — proven by removing the conjunct and watching exactly one named test fail — plus a boot reaper whose execution is proven from a real container's log, 0 matches before and 1 after, at the cost of one image build and zero disruption to the shared app.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-19T12:37:00Z
- **Completed:** 2026-08-19T13:03:00Z
- **Tasks:** 2 of 2
- **Files modified:** 5 (4 created, 1 modified)
- **Docker rebuilds paid by this plan: 1** (image build only — the running container was never replaced)

## Accomplishments

- **The concurrency guard's correction is proven falsifiable, by RUN.** With
  `eq(dedupScans.entityType, entityType)` removed from `createScanState`'s predicate, the suite goes
  from 18 passed to `1 failed | 17 passed`, and the one failure is by name:
  `createScanState > scopes the running-scan guard to the entity type, so a different type does not
  block`. Restored, 18 pass again. A running organization scan therefore cannot disable the person
  scan CTA (UI-SPEC P-7), and a user cannot queue arbitrary 46,054-row passes (T-39-07).
- **The reaper is proven to RUN, not merely to be imported.** Before/after counts of
  `[dedup-scan-cleanup] Starting` in a container log: **0 before, 1 after**. The after-log shows it
  sitting mid-register beside the six existing processor lines, so the whole chain is alive — see the
  pasted log below.
- **The log gate caught the RTK interception the plan warned about, live.** A plain
  `docker logs dedup-gate-39-06` returned a digest — `[error] 1 errors` and one line — with the
  `Starting` line *hidden*, so the grep counted 0. `rtk proxy docker logs …` returned the raw stream
  and counted 1. Had I trusted the intercepted output I would have concluded the reaper never ran.
- **The after-log also demonstrates, incidentally, exactly why the unconditional-logging divergence
  was necessary.** `cleanupStaleImportSessions` runs immediately before `cleanupStaleDedupScans` in
  `register()` and printed **nothing at all**, because its counts were zero and it logs only on a
  non-zero total. Same execution, same boot, one function greppable and one invisible.
- **Zero writes to the shared database.** `import_sessions` and `dedup_scans` were both empty before
  the run (verified by `psql` count), and the reaper reported `0 stranded scan(s) marked error, 0
  idle deleted, 0 expired deleted`. The throwaway container's entrypoint migration was a no-op
  (`schema "drizzle" already exists, skipping`), confirming the journal was already current at 0017.
- **`instrumentation.ts` diff is 3 insertions, 0 deletions** (`git diff --numstat`: `3	0`).

## Task Commits

1. **Task 1 (RED): failing tests for the scan state module** — `b42df1a` (test)
2. **Task 1 (GREEN): scan state module with a per-entity-type guard** — `00c301e` (feat)
3. **Task 2: boot reaper, registration, and the behavioural log proof** — `15c126d` (feat)

**Plan metadata:** committed with this summary (docs)

## Files Created/Modified

**Created**

- `src/lib/dedup/scan-state.ts` — the `dedup_scans` CRUD. `createScanState`, `getScanState`,
  `getLatestScan`, `updateScanState`, `cancelScan`, `isScanCancelled`, `calculateScanProgress`, plus
  the exported `DedupScanProgress`, `DedupScanState`, `DedupScanUpdate` types and the
  `SCAN_ALREADY_RUNNING` sentinel.
- `src/lib/dedup/scan-state.test.ts` — 18 tests.
- `src/lib/dedup/scan-cleanup.ts` — `cleanupStaleDedupScans`, three statements, unconditional twin
  log lines.
- `src/lib/dedup/scan-cleanup.test.ts` — 6 tests, headed by a comment stating that they prove the
  function and **not** that it runs.

**Modified**

- `instrumentation.ts` — two lines plus a blank, immediately after `cleanupStaleImportSessions()`.

## Verification Evidence

### The negative proof (Task 1, RUN)

Guard predicate reduced to `where: eq(dedupScans.status, "running")`:

```
 ✓ inserts a running, uncancelled row for the given entity type
 ✓ refuses when a scan of the SAME entity type is already running
 × scopes the running-scan guard to the entity type, so a different type does not block
 ✓ merges the supplied progress keys into the stored JSONB without clobbering the rest
 … (15 further tests pass)
 Tests  1 failed | 17 passed (18)
```

Restored: `Tests  18 passed (18)`.

### The behavioural log gate (Task 2)

**BEFORE** — the shared serving container, running master code, `rtk proxy docker compose logs app --tail 300`:

```
dedup-scan-cleanup Starting count BEFORE: 0
app-1  | [webhook-processor] Starting with initial delay of 5s
app-1  | [email-processor] Starting with initial delay of 15s
app-1  | [schedule-processor] Starting with initial delay of 10s
app-1  | [execution-processor] Starting with initial delay of 5s
app-1  | [audit-prune] Starting with initial delay of 60s, ticking daily
app-1  | [trash-prune] Starting with initial delay of 60s, ticking daily
```

**AFTER** — `docker build -t pipelite-dedup-gate:39-06 <worktree>` then a throwaway container on
`pipelite_default`, read with `rtk proxy docker logs dedup-gate-39-06`:

```
[✓] migrations applied successfully!Starting application...
▲ Next.js 16.1.6
✓ Starting...
[webhook-processor] Starting with initial delay of 5s
✓ Ready in 179ms
[email-processor] Starting with initial delay of 15s
[dedup-scan-cleanup] Starting
[dedup-scan-cleanup] Done: 0 stranded scan(s) marked error, 0 idle deleted, 0 expired deleted
[schedule-processor] Starting with initial delay of 10s
[execution-processor] Starting with initial delay of 5s
[audit-prune] Starting with initial delay of 60s, ticking daily
[trash-prune] Starting with initial delay of 60s, ticking daily
[audit-prune] deleted 0 row(s) older than 90d
[trash-prune] purged 0 record(s) older than 30d
```

`grep -c '\[dedup-scan-cleanup\] Starting'` → **0 before, 1 after**. Note `[trash-prune] Starting`
and the five other processor lines present in the same log: the whole register chain is alive, and
`[import-cleanup]` printed nothing despite running one line earlier — the divergence's whole point.

### The grep gates

| Gate | Required | Actual |
|------|----------|--------|
| `grep -c "session.user\|auth()" src/lib/dedup/scan-state.ts` | 0 | 0 |
| `grep -c "total > 0" src/lib/dedup/scan-cleanup.ts` | 0 | 0 |
| `git diff --numstat instrumentation.ts` | small insertion, 0 deletions | `3	0` |

### Suites and static checks

- `vitest run src/lib/dedup/` → **6 files, 110 tests, all passing**
- `npm run test` (both projects) → **108 files / 2336 tests passed, 1 file / 21 tests skipped**, then
  **2 files / 8 tests passed** (RSC project)
- `npm run typecheck` → **0 errors**
- `npm run lint` → **0 errors**, 125 warnings, none in any file this plan touched
  (`npm run lint | grep -A3 "dedup/scan-state"` → empty)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Two acceptance-criteria greps were tripped by prose, not code**

- **Found during:** Tasks 1 and 2, running the acceptance criteria
- **Issue:** `grep -c "session.user\|auth()" src/lib/dedup/scan-state.ts` returned **1** and
  `grep -c "total > 0" src/lib/dedup/scan-cleanup.ts` returned **2**. Every match was inside a
  comment explaining what the file deliberately does *not* do — "There is no `auth()` call and no
  `session.user` read anywhere in this file", "logs only `if (total > 0)`". The code satisfied both
  gates from the first line written; the documentation of that fact broke them.
- **Fix:** Reworded each comment to describe the absent construct without spelling it, and added to
  each a note that a grep in the acceptance criteria is what enforces its absence — so the next
  person to edit the comment knows why it is phrased indirectly rather than "clarifying" it back.
- **Files modified:** `src/lib/dedup/scan-state.ts`, `src/lib/dedup/scan-cleanup.ts`
- **Commits:** `00c301e`, `15c126d`
- **Note for future planners:** a `grep -c … = 0` acceptance criterion cannot distinguish code from a
  comment. Where a plan wants "this file contains no authorization", the criterion should scope
  itself to stripped source (`src/components/custom-fields/__tests__/source-scan.ts` already exports
  `readStrippedSource` for exactly this, per 39-PATTERNS S-7).

**2. [Rule 3 - Blocking] `vi.mocked` could not type the partial-column fixture**

- **Found during:** Task 1, `npm run typecheck`
- **Issue:** `vi.mocked(db.query.dedupScans.findFirst)` types `mockResolvedValue` to the full
  relational row, so `{ cancelled: true }` — which is all `columns: { cancelled: true }` actually
  selects — was a type error, as was the `scanRow()` fixture whose `status` widened to `string`.
- **Fix:** Cast the mocked module to a loose shape, the house style already used in
  `src/lib/triggers/schedule-processor.test.ts`. Commented why, so it does not look like laziness.
- **Files modified:** `src/lib/dedup/scan-state.test.ts`
- **Commit:** `00c301e`

**3. [Rule 1 - Bug] `JSON.stringify` on a drizzle predicate throws**

- **Found during:** Task 2, first run of `scan-cleanup.test.ts`
- **Issue:** The assertion that the crash-recovery statement targets `status = 'running'` (not some
  other status) was written as `expect(JSON.stringify(where)).toContain("running")` and threw
  `TypeError: Converting circular structure to JSON` — a `PgTable` holds `id → PgText → table`.
- **Fix:** Extended the `sqlTokens` walker to also collect bound **string** params, so `'running'`,
  `'idle'` and friends are assertable by the same tree walk that finds column names. This turned out
  to be a strict improvement: the idle-delete test now pins `status = 'idle'` and asserts the absence
  of `'running'`, which is what stops statement 2 from silently becoming a destructive variant of
  statement 1.
- **Files modified:** `src/lib/dedup/scan-cleanup.test.ts`
- **Commit:** `15c126d`

### Deliberate procedural deviation (not a code change)

**The plan's `docker compose up -d --build app` was replaced by an equivalent-strength isolated
build.** The orchestrator's wave-3 shared-resource rules state plainly: *"Postgres at `localhost:5433`
is shared. So is the Docker app. Do not rebuild the container."* Three parallel executors were
running against that container. Replacing it would have (a) disturbed peers mid-verification and
(b) proven only that a pre-merge worktree's code boots, since the merged tree gets rebuilt anyway.

What was done instead proves strictly the same proposition — that the Dockerfile's silent-failure-
prone `instrumentation.js` copy produced a build whose `register()` really executes:

1. `docker build -t pipelite-dedup-gate:39-06 <worktree>` — the same `Dockerfile`, the same
   three-stage standalone build, the same `Dockerfile:24` copy step.
2. `docker run -d --name dedup-gate-39-06 --network pipelite_default --env-file .env …` — no
   published ports, so no contention on 3001.
3. Waited on `docker logs -f … | grep -m1 'trash-prune Starting'` — the LAST line of `register()`, so
   reaching it means the whole chain ran.
4. `rtk proxy docker logs` captured, grepped, pasted above.
5. `docker rm -f` + `docker rmi`. Shared stack re-verified afterwards: all three services still up,
   `curl localhost:3001` → `200`.

Safety was established before the run rather than assumed: `import_sessions` and `dedup_scans` were
both confirmed empty by `psql`, so both boot reapers were provably no-ops, and the entrypoint's
`drizzle-kit migrate` reported only "already exists, skipping". **The gate was not weakened; only the
blast radius was.**

## Deferred Issues

**The guard is advisory, not atomic — and there is no DB constraint behind it.**

`createScanState` reads (`findFirst` on `status='running' AND entity_type=?`) and then writes. Two
requests interleaving between the read and the insert can both pass. The mitigation actually shipped
is threefold and documented in the source: the row is inserted as `running` rather than `idle` to
make the window as small as a read-then-write allows; `dedup_scans_active_idx` makes the check cheap;
and `cleanupStaleDedupScans` reaps whatever a lost race strands. The plan itself frames the guard
this way ("the guard is advisory").

Making it airtight wants a partial unique index — `CREATE UNIQUE INDEX … ON dedup_scans (entity_type)
WHERE status = 'running'` — which is a **new migration (0018)**. Generating one from a wave-3
worktree while sibling agents may be doing the same is precisely the colliding-migration-number
hazard, so it was not done here (Rule 4: schema change → surface, do not improvise).

**Recommendation:** fold that partial unique index into a later 39-xx plan that already owns a
migration, and have `createScanState` catch `23505` and rethrow `SCAN_ALREADY_RUNNING` — which makes
the sentinel the single refusal path whether the guard or the constraint caught it. Residual risk
until then is low: the losing scan is a duplicate pass over the same entity type, reaped at the next
boot and visibly `running` in the meantime.

## Threat Model Coverage

| Threat ID | Disposition | How it is discharged here |
|-----------|-------------|---------------------------|
| T-39-07 (DoS, `createScanState`) | mitigated, with the residual above | Per-entity-type refusal, asserted by two tests plus the RUN negative proof |
| T-39-08 (Tampering, `cancelScan`) | mitigated by split | No identity resolution anywhere in the module (grep-gated at 0); `userId` exposed on every returned state; the split is documented in the module header, at `cancelScan`, and asserted by a test named for it. Plan 39-11 owns the comparison |
| T-39-10 (Info disclosure, logs) | mitigated | Every log line carries a scan id, an entity type or a count. No record contents, no user-supplied values (T-37-09) |
| T-39-22 (DoS, stranded `running` row) | mitigated, verified behaviourally | Statement 1 of the reaper, proven to execute from the container log rather than from a unit test |
| T-39-SC (package installs) | n/a | No package installed, no dependency added; `tech-stack.added` is empty |

**Threat flags:** none. This plan adds no network endpoint, no auth path, no file access and no
schema change, so it introduces no trust boundary the register did not already list.

## Known Stubs

None. Every export is wired to `dedup_scans` and returns real data; `DEFAULT_PROGRESS =
{ current: 0, total: 0 }` is a scan's genuine initial state, not a placeholder.

## Notes for the Orchestrator

- **`STATE.md` and `ROADMAP.md` untouched**, per the worktree contract.
- **`REQUIREMENTS.md` also untouched, deliberately.** DEDUP-01 is claimed by ten plans in this phase
  and this is the sixth; it is genuinely still `Pending`. The frontmatter records the claim.
- **No new migration and no change to `drizzle/`** — the journal is exactly as 39-05 left it, at
  `idx: 17`.
- **This worktree started from a stale base** (`cbf3229`, an ancestor of the dispatch commit) and was
  corrected by the mandated `git reset --hard d7eadeb` before any work. Post-reset checks passed:
  `drizzle/0017_dedup_schema.sql` present, journal at `idx: 17`, `scripts/` present. The stale-base
  hazard recorded in project memory is still live.
- **Docker artifacts left behind: none.** `pipelite-dedup-gate:39-06` and its container were removed;
  the shared stack was re-verified up and serving `200`.

## Self-Check: PASSED

All 6 claimed files exist on disk (`scan-state.ts`, `scan-state.test.ts`, `scan-cleanup.ts`,
`scan-cleanup.test.ts`, `instrumentation.ts`, this summary). All 3 claimed commits exist in
`git log`: `b42df1a`, `00c301e`, `15c126d`. No file deletions in any commit
(`git diff --diff-filter=D HEAD~1 HEAD` empty for both feature commits). No untracked files remain.
