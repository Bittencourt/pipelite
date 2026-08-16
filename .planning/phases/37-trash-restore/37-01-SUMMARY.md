---
phase: 37-trash-restore
plan: 01
subsystem: trash-retention-settings
tags: [trash, retention, app-settings, fail-closed, migration, tdd]
requires:
  - app_settings table (migration 0014, Phase 36)
  - deletedAt columns + btree indexes on deals/people/organizations/activities (migration 0012)
provides:
  - TRASH_RETENTION_KEY
  - RETENTION_MIN
  - RETENTION_MAX
  - readTrashRetentionDays
  - writeTrashRetentionDays
  - readTrashStats
  - WriteTrashRetentionResult
  - TrashStats
  - seeded app_settings row trash.retention_days = 30
affects:
  - the trash pruner (reads the window)
  - the /admin/trash retention form and empty-state copy
tech-stack:
  added: []
  patterns:
    - "fail-closed settings read: seeded default in data, no code-level fallback"
    - "validate-before-write: zod safeParse ahead of any DB call"
    - "degrade-to-zero-state stats readout for admin pages"
    - "data-only drizzle migration via `generate --custom`"
key-files:
  created:
    - src/lib/trash/settings.ts
    - src/lib/trash/settings.test.ts
    - drizzle/0015_trash_retention_seed.sql
    - drizzle/meta/0015_snapshot.json
  modified:
    - drizzle/meta/_journal.json
decisions:
  - "RETENTION_MAX is 365, not the audit module's 3650: trash is a recovery buffer, not an archive"
  - "The 30-day default lives only in seeded data; readTrashRetentionDays has no `?? 30` and never will"
  - "readTrashStats issues four parallel aggregates rather than a UNION, keeping the analog's per-query try/catch posture"
  - "Migration applied by docker cp + `npx drizzle-kit migrate` in the container, because the worktree's new migration is not in the baked image"
metrics:
  duration: ~35 min
  completed: 2026-08-16
  tasks: 2
  commits: 3
  tests_added: 28
---

# Phase 37 Plan 01: Trash Retention Settings Summary

Fail-closed `trash.retention_days` settings module (read/write/stats) plus a data-only migration that seeds the 30-day default, so the default exists as data and a corrupted row disables purging rather than resuming it.

## What Was Built

**`src/lib/trash/settings.ts`** — a key-for-key mirror of `src/lib/audit/settings.ts` with three substantive divergences:

- `RETENTION_MAX = 365` instead of 3650. Trash is a recovery buffer; a decade-long ceiling would let a deployment appear to purge while never purging.
- `readTrashStats()` aggregates **four** tables (`deals`, `people`, `organizations`, `activities`) in one `Promise.all`, summing counts and folding to the earliest `min(deleted_at)`. `isNotNull(table.deletedAt)` is written out explicitly on each of the four reads — the trash surface is the only place in the codebase that inverts the live-record predicate, and an index predicate does not enforce itself.
- Log prefix `[trash-settings]`, carrying the key and the bounds only, never the stored value (T-37-09).

`readTrashRetentionDays()` has three distinct `null` returns — no row, parse failure with a `console.warn`, thrown query with a `console.error` — and no nullish-coalescing default anywhere. `writeTrashRetentionDays()` runs `retentionSchema.safeParse` before touching the database, so an out-of-range value never reaches storage.

**`drizzle/0015_trash_retention_seed.sql`** — produced with `drizzle-kit generate --custom` (this phase changes no schema at all, so a plain `generate` emits nothing). Its only statement is the idempotent seed; the rest is the four-point justification comment adapted from `0014`, covering why the seed exists, why the default is data rather than code, why hand-editing a data migration does not violate Phase 33 D-06, and why the conflict clause does nothing rather than upserting.

## Verification Results

| Gate | Result |
|------|--------|
| `npx vitest run src/lib/trash/settings.test.ts` | 28 passed (plan required ≥ 12) |
| `npm run typecheck` | exit 0 |
| `npm run lint` | 0 errors, 0 warnings in `src/lib/trash/` |
| `grep -c '?? 30' src/lib/trash/settings.ts` | 0 |
| `grep -n 'RETENTION_MAX = 365'` | exactly one line (39) |
| `grep -n 'TRASH_RETENTION_KEY = "trash.retention_days"'` | exactly one line (21) |
| `grep -c 'isNotNull'` | 6 (≥ 4 required) |
| non-comment DDL keywords in `0015_...sql` | 0 |
| `_journal.json` tag `0015_trash_retention_seed` | present |
| `SELECT value::text ... WHERE key='trash.retention_days'` | `30` |
| `SELECT count(*) FROM app_settings` | `2` |
| re-run of `drizzle-kit migrate` | no-op, no error, count still 2 |

An extra live check beyond the plan's list: `SELECT jsonb_typeof(value)` returns `number` for both rows. This is the check that actually proves `readTrashRetentionDays()` returns `30` against the live database rather than failing closed — had the seed written `'"30"'::jsonb`, `value::text` would still have printed `30` while `retentionSchema` rejected it as a string.

Full suite: 1365 passed, 1 failed — `src/lib/execution/toggle.test.ts` hit a 10s `beforeEach` hook timeout under parallel load. It passes in isolation (`npx vitest run src/lib/execution/toggle.test.ts` → 5/5) and touches no file this plan modified. Pre-existing load flake, logged and left alone per the scope boundary.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree had no `node_modules` or `.env`**
- **Found during:** Task 1, before the RED run
- **Issue:** the git worktree is a bare checkout — `npx vitest`, `npm run typecheck` and `./node_modules/.bin/drizzle-kit` were all unrunnable, and `drizzle.config.ts` had no `DATABASE_URL`.
- **Fix:** symlinked `node_modules`, `.env` and `.env.local` from the main checkout. All three are gitignored, so nothing entered a commit. No package was installed.
- **Files modified:** none tracked
- **Commit:** n/a

**2. [Rule 3 - Blocking] Migration could not be applied by the plan's exact command**
- **Found during:** Task 2
- **Issue:** the plan specifies `docker compose exec -T app npx drizzle-kit migrate`. Two problems: (a) `docker compose` resolves the project name from the working directory, so from the worktree it reports "0 services" and the running stack is `pipelite-*`; (b) the `app` container runs a **baked image** whose `/app/drizzle` does not contain the worktree's new `0015` file, so a migrate inside it would have been a silent no-op that still printed "migrations applied successfully".
- **Fix:** `docker cp` the three migration artifacts into `pipelite-app-1`, then `docker exec pipelite-app-1 npx drizzle-kit migrate`. The container keeps the correct `DATABASE_URL` and network path to Postgres, so no credential appeared in any command.
- **Files modified:** none tracked
- **Commit:** 1c930c4

**3. [Rule 3 - Blocking] `drizzle-kit generate --custom` also emitted `drizzle/meta/0015_snapshot.json`**
- **Found during:** Task 2
- **Issue:** the plan's `files_modified` lists only the `.sql` and `_journal.json`. Leaving the snapshot uncommitted would desynchronise the migration folder and make the next `generate` misbehave.
- **Fix:** committed it alongside the other two.
- **Files modified:** `drizzle/meta/0015_snapshot.json`
- **Commit:** 1c930c4

### Test Count

28 tests rather than the "at least 12" floor. Two beyond the plan's enumerated behaviours were added under Rule 2, both pinning a threat-register mitigation the plan asserts in prose but did not list a case for:

- `"never names the stored value in the warning it logs"` — T-37-09 is dispositioned `mitigate`, and nothing else in the suite would have caught a log line that echoed a tampered value.
- `"issues exactly four aggregate reads, one per soft-deletable table"` — makes a silently-dropped table in `readTrashStats` a failure rather than an undercount.

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED | `092e7c3` `test(37-01): add failing tests for trash retention settings` | Verified failing before implementation — `Cannot find module '/src/lib/trash/settings'`, 0 tests executed |
| GREEN | `31a2571` `feat(37-01): add trash.retention_days settings module` | 28/28 pass |
| REFACTOR | — | not needed; the implementation is a direct mirror of an existing reviewed module |

No test passed unexpectedly during RED.

## Threat Flags

None. This plan adds no network endpoint, no auth path, no file access and no schema change — the only new surface is a settings key already covered by the register (T-37-04, T-37-05, T-37-09), and the phase installs nothing (T-37-SC).

## Known Stubs

None.

## Commits

| Hash | Message |
|------|---------|
| `092e7c3` | `test(37-01): add failing tests for trash retention settings` |
| `31a2571` | `feat(37-01): add trash.retention_days settings module` |
| `1c930c4` | `feat(37-01): seed the 30-day trash retention default as data` |

## Notes for Downstream Plans

- The 30-day row is **already applied to the live database**. A later plan must not re-seed it or expect `app_settings` to hold one row.
- `RETENTION_MAX = 365` cannot be imported by `retention-form.tsx`'s `Input` attributes or by the `trash.retention.windowHelp` locale string. Those two places must be written to agree with the constant; the test at `src/lib/trash/settings.test.ts` pins the literal so a change here fails loudly.
- `readTrashRetentionDays()` returning `null` means **purge nothing**. The pruner must branch on it and must not substitute a default.
- `readTrashStats()` is global and unscoped by owner, by design — `/admin/trash` is admin-only. Do not reuse it for a per-user trash view.
- The container's `/app/drizzle` was mutated by `docker cp`. A rebuild of the image from the merged branch restores it from source; no action needed, but a `docker compose down -v` would drop the seeded row and require a re-migrate.

## Self-Check: PASSED

All four created files verified present on disk; all three commit hashes verified in `git log`.
