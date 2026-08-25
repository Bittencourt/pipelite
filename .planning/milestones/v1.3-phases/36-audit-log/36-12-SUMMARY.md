---
phase: 36-audit-log
plan: 12
subsystem: import
tags: [audit, actor-context, import, csv, pipedrive, session-granularity]

# Dependency graph
requires:
  - phase: 36-audit-log
    plan: 01
    provides: "runWithActor / AuditActor — the actor scope the five importer entry points establish"
  - phase: 36-audit-log
    plan: 03
    provides: "auditLog table, AuditEntityType's fifth literal `import_session`, and the partial import-session index the summary row is looked up by"
provides:
  - "The `import` actor kind is now REAL: five entry points establish it (four CSV server actions + importFromPipedrive)"
  - "One summary audit row per import run, written directly by the importer"
  - "The Pipedrive summary row carries a genuine import_session_id; the CSV summary rows carry null"
affects: [36-15, 36-17, 36-19, 36-20, audit-subscriber, phase-summary]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Importer-written audit row: awaited inside its own try/catch, logged with an [audit-import] prefix and swallowed — the inverse of the subscriber's fire-and-forget, for the opposite reason"
    - "Terminal-path summary writer defined inside the actor scope and called from completion, cancellation and failure, so exactly one row exists per run"

key-files:
  created: []
  modified:
    - src/app/import/actions.ts
    - src/lib/import/pipedrive-api-import-actions.ts

key-decisions:
  - "SC-3 is satisfied at SESSION granularity, not per-record — stated in prose, not as a footnote"
  - "SC-5 holds for the four CRM mutation modules but NOT for the importers, which write their summary row directly"
  - "The Pipedrive ERROR path writes a summary row too, not just completion and cancellation"
  - "Summary counts are read from the session row the importer already maintains, via one getImportState call at the terminal point"

requirements-completed: [AUDIT-01, AUDIT-03]

# Metrics
duration: ~35min
completed: 2026-08-16
---

# Phase 36 Plan 12: The Import Actor and the Summary Row Summary

**Five importer entry points now run inside an `import` actor scope and each import run leaves
exactly one `import_session` audit row recording what it loaded — and nothing anywhere leaves one
row per imported record.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 2, both `type="auto"`, no checkpoints
- **Files modified:** 2 (0 created)
- **Packages added:** 0

## The two consequences, stated plainly

The plan required these to be written down rather than glossed. Both are real and both are
deliberate.

### 1. SC-3 holds at SESSION granularity, not per-record

An import is now distinguishable from a user change: every row an importer writes happens inside
`runWithActor({ kind: "import", ... })`, and each run leaves a summary row naming the user who ran
it, when, and how much it moved. **An individual imported record cannot be traced back to the
import that created it.** There is no audit row for deal #17,432 saying "an import made this".

This was not an oversight and it was not a cost estimate made up after the fact. Per-record events
were rejected on measured cost: both importers write through helpers that publish no CRM event, and
the workflow trigger evaluator subscribes to all thirteen event types, so making the importers
publish would turn a 25,206-deal import into 25,206 trigger evaluations and up to that many
webhook deliveries. The event-bus identifier count in both files is asserted at `0`.

What a reader of the audit log actually gets for an import is one row like:

```json
{ "entity_type": "import_session", "entity_id": "<run id>", "action": "created",
  "actor_kind": "import", "actor_user_id": "<who ran it>",
  "changes": { "deals": { "from": null, "to": 25206 },
               "warnings": { "from": null, "to": 3 },
               "autoCreated": { "from": null, "to": 118 } } }
```

### 2. SC-5 holds for the four CRM mutation modules but NOT for the importers

The audit subscriber remains the sole capture path for every write that publishes a CRM event. The
importers publish nothing, write their summary row **directly**, and are therefore outside that
claim. Anyone auditing SC-5 by asserting "no `db.insert(auditLog)` outside the subscriber" will
find two families of exceptions in this plan's two files, and they are the intended ones.

## Task 1 — the four CSV entry points

`src/app/import/actions.ts` has **four** exported entry points, not one:
`importOrganizations`, `importPeople`, `importDeals`, `importActivities`. Each now:

1. Mints `const importRunId = crypto.randomUUID()` — the identity of that run.
2. Wraps its whole remaining body in
   `runWithActor({ kind: "import", userId: actorUserId, importSessionId: null }, async () => { ... })`.
3. On the **success return path only**, writes one summary row with the counts the action already
   computed — no extra query was added to derive them.
4. Awaits that insert inside its own `try`/`catch` that logs `[audit-import]` and swallows.

The error return paths write nothing: an import that failed before writing anything has nothing to
record, and each action already surfaces its own error to the user.

### `importSessionId` is null here — and that is load-bearing

The audit column is a genuine foreign key into `import_sessions`. The CSV path creates **no**
`import_sessions` row (confirmed by reading `src/db/schema/import-sessions.ts` and every insert in
`actions.ts`), so a minted id would have no parent. This is not a theoretical concern — it is
proven against the live database below: an audit row carrying a session id with no parent is
rejected outright. `importRunId` therefore lives only in `entity_id`, which carries no FK by
design (36-03).

### What the wider-than-necessary ALS wrap turned out to catch: nothing

The plan asked for a verified answer to whether the auto-create paths route through the mutation
layer (which would give auto-created records per-record audit rows via the subscriber) or through a
direct insert (which would not). **Verified: they all insert directly.**

| Auto-create path | Site | Route |
|---|---|---|
| `resolveOrganization` | `actions.ts` helper, used by `importPeople` and `importDeals` | `db.insert(organizations)` directly |
| auto-created person by email | inside `importDeals` | `db.insert(people)` directly |
| Pipedrive stub org / stub person | inside the deals block | `db.insert(organizations)` / `db.insert(people)` directly |

So auto-created organizations and people get **no per-record audit row**. The only record that they
came from an import at all is the `autoCreated` count on the summary row, which is why that key is
present with a constant `0` even in the two actions that invent nothing — four summary rows with
the same shape are readable; four with different shapes are not.

## Task 2 — the Pipedrive importer

`importFromPipedrive` is one entry point. Its body after the session guard is wrapped in
`runWithActor({ kind: "import", userId: importingUserId, importSessionId: importId }, ...)`.

Here `importSessionId` **is** populated, because `importId` is a real `import_sessions.id` — the
function's own parameter, which `createImportState` inserts under that exact id. The asymmetry with
the CSV path is commented at both sites so neither reads as an oversight.

A single `writeImportSummary(outcome)` closure writes the row. Its counts come from the session row
the function has been maintaining all along (`getImportState`), so a run that stopped early reports
what it actually reached. It is called from every terminal path, each of which returns immediately
afterwards — so a run leaves exactly one row:

| Terminal path | Row written | Why |
|---|---|---|
| completion | `outcome: "completed"` | the plain case |
| cancellation | `outcome: "cancelled"` | an import that moved 8,000 deals and was then cancelled did move 8,000 deals |
| failure (outer catch) | `outcome: "error"` | same argument; see deviation 2 |
| "An import is already in progress" | **none** | a *different* session is running, no session row exists under this id, nothing was loaded, and the FK would reject it anyway |

The cancellation write lives **inside `checkCancelled`**, not at the six call sites that consult it.
Six copies of the same two lines is six chances for a seventh cancellation site to be added later
without one.

## Runtime evidence — the two row shapes against the LIVE schema

Run inside `pipelite-postgres-1`, entirely within a transaction that was rolled back; `audit_log`
was left at `0` rows.

```
BEGIN
INSERT 0 1
           check            | rows
----------------------------+------
 1. CSV-shaped row accepted |    1        <- entity_type 'import_session', import_session_id NULL

INSERT 0 1  (import_sessions row)
INSERT 0 1
              check               | rows
----------------------------------+------
 2. Pipedrive-shaped row accepted |    1  <- import_session_id = a real session id

SAVEPOINT
ERROR:  insert or update on table "audit_log" violates foreign key constraint
        "audit_log_import_session_id_import_sessions_id_fk"
DETAIL:  Key (import_session_id)=(no-such-session) is not present in table "import_sessions".
ROLLBACK

          check          | indexdef
-------------------------+------------------------------------------------------------------
 4. import session index | CREATE INDEX audit_log_import_session_idx ON public.audit_log
                         | USING btree (import_session_id) WHERE (import_session_id IS NOT NULL)
ROLLBACK
            check            | rows
-----------------------------+------
 5. audit_log left untouched |    0
```

Probe 3 is the point: **the null on the CSV path is not stylistic.** A fabricated session id is
rejected by the database, so an importer that invented one would fail its own audit write on every
single run.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `grep -c "runWithActor"` cannot return `4` (or `1`) — the import statement matches**

- **Found during:** Task 1 acceptance
- **Issue:** The criteria read `grep -c "runWithActor" src/app/import/actions.ts` returns `4` and
  `... pipedrive-api-import-actions.ts` returns `1`. `grep -c` counts matching **lines**, and the
  mandatory `import { runWithActor } from "@/lib/audit/actor-context"` line matches too, so the
  true values are `5` and `2` against perfectly correct files. The gate is unsatisfiable as
  written unless the module is not imported at all — the same self-invalidating-gate trap 36-01
  and 36-03 both hit.
- **Fix:** Measured **call sites** instead: `grep -c "runWithActor("` → `4` and `1`. The import
  line has no `(` after the identifier. Nothing in either source file was contorted to satisfy a
  grep.
- **Files modified:** none
- **Commits:** `3baf69a`, `79f7d5b`

  For the record, `grep -c 'kind: "import"'` needed no such correction: `actorKind: "import"` has a
  capital `K`, so it does not match the lowercase pattern, and the counts are exactly the `4` and
  `1` the plan expects.

**2. [Rule 2 - Missing critical] The Pipedrive FAILURE path writes a summary row too**

- **Found during:** Task 2
- **Issue:** The plan names completion, partial success and cancellation. It does not name the
  outer `catch`. A Pipedrive run that imported 7,999 deals and then hit a 429 or a dropped
  connection would have left **no audit row at all** — the single case where the log is most
  wrong, because a large amount of data appeared in the CRM with nothing recording where it came
  from.
- **Fix:** `await writeImportSummary('error')` in the outer catch, after the existing
  `addImportError` / status update. The `outcome` key in `changes` distinguishes the three
  cases, so nothing is disguised as a success.
- **Rationale:** identical to the plan's own argument for recording cancelled runs — "an audit log
  that omits it is wrong in the direction that matters".
- **Files modified:** `src/lib/import/pipedrive-api-import-actions.ts`
- **Commit:** `79f7d5b`

**3. [Clarification] Summary counts are read via one `getImportState` call, not from an in-memory mirror**

- **Found during:** Task 2
- **Issue:** The plan asks for counts "from state that already exists rather than from a new
  query". The Pipedrive importer keeps **no in-memory counters** — `incrementImportedCount` writes
  straight into the `import_sessions.progress` JSONB. There is no existing in-process value to
  read.
- **Fix:** One `getImportState(importId)` at the terminal point. This reads the state that already
  exists rather than deriving counts by counting CRM rows, which is what the constraint was
  guarding against; it costs a single `findFirst` at the end of a run that has already issued
  thousands of queries. The alternative — a parallel in-memory mirror — would duplicate state that
  is already authoritative in the session row and could silently drift from it.
- **Files modified:** `src/lib/import/pipedrive-api-import-actions.ts`
- **Commit:** `79f7d5b`

**4. [Cosmetic] The 17-line actor rationale is written once, not four times**

- **Found during:** Task 1
- **Issue:** Mechanically repeating the full `importSessionId`-asymmetry comment at all four CSV
  entry points added ~68 lines of identical prose to one file.
- **Fix:** `importOrganizations` carries the full rationale; the other three carry a two-line
  cross-reference to it. The asymmetry is still commented "at both sites" in the sense the plan
  meant — once in each of the two importer files.
- **Files modified:** `src/app/import/actions.ts`
- **Commit:** `3baf69a`

---

**Total deviations:** 4 (1 blocking gate correction, 1 missing-critical addition, 1 clarification,
1 cosmetic). No architectural changes, no scope creep, zero packages added.

### Plan expectation corrected

The Task 1 acceptance criterion says `npx vitest run src/app/import` "passes (or reports no test
files, which is the current state — record which)". **Recording which: there IS a test file.**
`src/app/import/actions.test.ts` exists with 11 tests, and all 11 pass both before and after this
plan's changes.

## Verification Results

| Gate | Expected | Result |
|------|----------|--------|
| `npm run typecheck` | exit 0 | **exit 0** |
| `npm test` (vitest + rsc config) | no new failures | **68 files / 1155 passed, 4 skipped**, plus rsc **2 files / 8 passed** |
| `npx vitest run src/app/import` | passes | **1 file / 11 tests passed** |
| `grep -c "runWithActor("` in `actions.ts` | 4 | **4** (see deviation 1) |
| `grep -c 'kind: "import"'` in `actions.ts` | 4 | **4** |
| `grep -c "import_session"` in `actions.ts` | 4 | **4** |
| `grep -c "crmBus"` in `actions.ts` | 0 | **0** |
| `grep -c "audit-import"` in `actions.ts` | 4 | **4** |
| `grep -c "runWithActor("` in the Pipedrive importer | 1 | **1** (see deviation 1) |
| `grep -c 'kind: "import"'` in the Pipedrive importer | 1 | **1** |
| `grep -c "importSessionId: importId"` | >= 2 | **2** (the actor and the audit row) |
| `grep -c "crmBus"` in the Pipedrive importer | 0 | **0** |
| `npx eslint` on both files | no new problems | **0 errors**; 10 + 5 warnings, all pre-existing `no-unused-vars` |
| Live-DB shape probe | both shapes accepted, fabricated id rejected | **as shown above**, `audit_log` left at 0 rows |

## Deferred / Out of Scope

- `batchInsert` in `src/lib/import/pipedrive-api-import-actions.ts:88` is dead code — every insert
  in that file is a per-row `db.insert(...).returning()`. It is a **pre-existing** eslint warning,
  unrelated to this plan's changes, and was deliberately not touched. Worth deleting in a cleanup
  plan; deleting it here would have mixed an unrelated removal into an audit commit.
- The four `no-unused-vars` destructuring discards (`_sn`, `_on`, `_pe`, ...) in
  `src/app/import/actions.ts` are the existing idiom for dropping mapped CSV columns and are
  likewise untouched.

## Known Stubs

None. Both summary writers are real, wired to real counts, and their row shapes are proven accepted
by the live schema. Nothing in this plan renders placeholder data or returns a hardcoded empty
value.

## Threat Model Coverage

| Threat ID | Disposition | Where |
|-----------|-------------|-------|
| T-36-25 | accept | Per-record import changes remain unattributable. Documented above in prose, not a footnote; must be carried to the phase SUMMARY and the milestone audit. |
| T-36-26 | mitigate | Both summary inserts are awaited inside their own `try`/`catch`, log `[audit-import]`, and swallow. A failed audit row cannot turn a successful import into a reported failure. |
| T-36-01 | mitigate | `userId` is `session.user.id` in all five scopes; `importSessionId` is the function's own `importId` parameter on the Pipedrive path and `null` on the CSV path. No value is taken from CSV content or from a Pipedrive API response. |
| T-36-16 | mitigate | No CRM event publication added to either importer; the identifier count is `0` in both files. |
| T-36-SC | accept | Zero packages added. |

## Threat Flags

None. This plan opens no network surface, no auth path, no file access and no schema change. It
adds two writes to a table that already existed, under an actor scope that already existed.

## For the Next Plan

- **36-15 / 36-17 / 36-19 (REST, timeline, UI):** an `import_session` audit row has an `entity_id`
  that is a **run id on the CSV path** (referencing nothing) and an **`import_sessions.id` on the
  Pipedrive path**. `assertEntityType` already keeps these rows out of every record timeline; any
  new query path must preserve that.
- **36-20 / phase SUMMARY:** the two consequences at the top of this document are required content.
  SC-3 is session-granular; SC-5 excludes the importers. Neither should be restated as though the
  subscriber captured imports.
- A CSV import summary row is discoverable only by `entity_type = 'import_session'` — it will not
  appear in the `audit_log_import_session_idx` partial index, which by definition holds only rows
  with a non-null session id (i.e. Pipedrive runs).

## Self-Check: PASSED

Files verified present on disk:
- `FOUND: src/app/import/actions.ts`
- `FOUND: src/lib/import/pipedrive-api-import-actions.ts`
- `FOUND: .planning/phases/36-audit-log/36-12-SUMMARY.md`

Commits verified in `git log`:
- `FOUND: 3baf69a` — feat(36-12): scope the four CSV imports to the import actor with one summary row each
- `FOUND: 79f7d5b` — feat(36-12): scope the Pipedrive import to the import actor with one summary row

STATE.md and ROADMAP.md were **not** touched — the orchestrator owns those. The `node_modules`
symlink created to run tsc/vitest/eslint is untracked and appears in no commit.

---
*Phase: 36-audit-log*
*Completed: 2026-08-16*
