# Phase 41 — Wave 1 handoff to later waves

**Written by the orchestrator after wave 1 merged**, because this run's context window (200K) does not
auto-load prior SUMMARY.md files into executor prompts. Everything below was discovered by a wave-1
executor and is binding on later waves. Each item names the plan that found it.

Merged state at handoff: **4011 passed / 32 skipped + RSC 8/8 · typecheck 0 · lint 0 errors / 127
warnings.** That is your baseline now, not 3860.

---

## Corrections to the upstream docs (do not chase the wrong path)

**`instrumentation.ts` is at the REPOSITORY ROOT, not `src/instrumentation.ts`.** Found independently
by 41-01 and 41-04. CONTEXT.md and several plans cite the `src/` path; it does not exist at any commit.
Same content, no code change needed — just cite the root path.

**The schema-column gate is COLOCATED:** `src/db/schema/workflow-runs-columns.test.ts`, **not**
`src/db/schema/__tests__/…` as 41-VALIDATION.md says. That directory has no `__tests__/` dir, so
VALIDATION's command finds nothing. Same deviation applies to `src/lib/execution/failure-alert.test.ts`
(41-08). Both are deliberate, per CONTEXT's directory-convention rule.

---

## Imports you must consume rather than re-declare (from 41-02)

`src/lib/workflows/runs-filter.ts` exports these. **Import them — do not re-type the literals:**

- `MAX_PAGE_DIGITS = 9`
- `SHOW_DRY_RUNS_PARAM = "dryRun"`
- `SHOW_DRY_RUNS_VALUE = "1"`

Relevant to **41-10** (runs list) and **41-11** (server actions).

`src/lib/workflows/replay.ts` exports `isRunReplayable`, `buildReplayRunInput`, and a frozen
`EMPTY_REPLAY_ENVELOPE`.

Two behaviours are asserted by its tests and must not be "tidied":

1. **`buildReplayRunInput` returns the trigger envelope BY THE SAME REFERENCE, deliberately.** The test
   asserts the aliasing. Cloning is exactly the normalisation that CONTEXT's "verbatim" forbids, and it
   would throw on a non-cloneable blob.
2. **A `null`/`undefined` `triggerData` yields the frozen `EMPTY_REPLAY_ENVELOPE` (`{}`)**, because
   `engine.ts:157-158` reads the blob as `?.trigger_type ?? "unknown"` / `?.data ?? {}` — so `{}` and
   `NULL` are byte-for-byte equivalent at the only read site. Do not synthesise a timestamp; it would
   make the function impure.

**There is deliberately NO exported constant for the `"failed"` literal.** The reshaped UI-SPEC G-6
gate scans the replay render site for `{run.status === "failed" && ( … )}`. A `REPLAYABLE_RUN_STATUS`
constant would make that scan permanently unsatisfiable. Relevant to **41-13**.

---

## The locale contract is TOTAL (from 41-03)

`REQUIRED_WORKFLOWS_KEYS` is compared with an exact-contract `toEqual`. **A `workflows.*` string that
is not in that array fails the suite.** You cannot quietly add a key. If a later plan genuinely needs
one, it must be added to the array in the same commit — but check first: 41-03 already wrote every
string this phase's UI-SPEC and plans call for, across all three locales (968 leaves each, up from
938).

**Binding on 41-08:** render the run's error message **escaped, outside the translator**, beside
`emails.workflowFailed.errorLabel`. There is deliberately **no `{errorMessage}` placeholder**, and the
T-41-15 gate **fails if one is added**. The obvious implementation is the wrong one here.

Also note: no literal `{` or `}` may appear in any message VALUE — next-intl reads `{` as a placeholder
delimiter and throws at render, which no test catches.

---

## Infrastructure facts (from 41-01)

**Migration `drizzle/0019_concerned_runaways.sql` is applied.** The four columns are live and verified
against `information_schema`: `dry_run` is `NOT NULL DEFAULT false` with a `dry_run IS NULL` count of
zero, `email_workflow_failed` is `NOT NULL DEFAULT true`, and both timestamp columns are nullable.
**No later wave needs to generate or apply a migration.** If a plan thinks it does, stop — the schema
work is finished.

**A migration cannot be applied through `docker compose exec app`.** The `app` service is `build: .`
with no volumes, so the container's baked image cannot see files generated in a worktree — the
in-container form reports success while applying nothing. Recorded here so nobody "fixes" the host-side
approach back into the container.

**The container has already been restarted** and all six processors announced
(`webhook, email, schedule, execution, audit-prune, trash-prune`), with
`[execution-processor] Starting` present and `curl` returning 200.

**`src/lib/api/__tests__/serialize-run.test.ts` fixtures now carry `dryRun: false` and
`replayedFromRunId: null`.** They build a full `workflowRuns.$inferSelect` row inline, so they broke
typecheck the moment the two run columns landed. `serializeRun` is an explicit field-by-field mapping
and does not emit the new columns, so its exact-object `toEqual` expectations are unchanged. **Any
later plan that adds a column to `workflow_runs` must expect the same breakage** — but see above, none
should.

---

## Standing constraints for every remaining wave

- `node_modules` is a shared symlink. **Never run `npm install` / `npm ci`.**
- One Postgres (`localhost:5433`) and one Docker app container, shared by every live agent. Wave 1's
  41-01 already did all the schema and restart work; later plans should need neither.
- `docker` needs no sudo. **Never embed or echo a password anywhere.**
- Bootstrap the three symlinks as your second action, before any test command, or every verification
  fails: `node_modules`, `.env`, and `e2e/.auth/admin.json` inside a REAL `e2e/.auth` directory.
- **Every worktree so far has branched from a stale base** — four for four, all from `aa01de2`. Run the
  base-correction check as your first action, without exception.
