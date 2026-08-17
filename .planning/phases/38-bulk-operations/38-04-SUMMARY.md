---
phase: 38-bulk-operations
plan: 04
subsystem: database
tags: [drizzle, postgres, csv, export, vitest, sql]

# Dependency graph
requires:
  - phase: 34-export-hardening
    provides: "deriveCsvColumns unioning custom_* keys across every row, so a scoped selection whose first row carries no custom fields still emits those columns"
  - phase: 37-trash
    provides: "the lesson that a wholly-mocked suite passed a malformed drizzle sql fragment, which is why this plan ships a live-database probe"
provides:
  - "ExportFilters.ids — the selection-scoped filter the bulk export actions narrow on"
  - "id narrowing honoured by all four private fetchers in formatters.ts, guarded on presence so an empty list yields zero rows"
  - "src/lib/export/formatters-live.test.ts — an env-gated read-only live-database probe pattern for the export module"
  - "a shaped @/db stub in formatters.test.ts that makes each fetcher's where predicate assertable via PgDialect.sqlToQuery"
affects: [38-11 scoped export action organizations, 38-12 scoped export action people, 38-13 scoped export action deals, 38-14 scoped export action activities]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Render a drizzle predicate to real SQL text + bound params in a unit test via `new PgDialect().sqlToQuery(where)` — no database needed, and the assertion is on the statement rather than an opaque object"
    - "Env-gated live-database probe: `describe.skipIf(!process.env.DATABASE_URL)` + dynamic `await import()` inside `beforeAll`, so a file collected by the default vitest run self-skips without loading the module-load-throwing db client"

key-files:
  created:
    - src/lib/export/formatters-live.test.ts
  modified:
    - src/lib/export/types.ts
    - src/lib/export/formatters.ts
    - src/lib/export/formatters.test.ts

key-decisions:
  - "The id guard is `if (filters?.ids)` — presence, never length. Skipping the push for an empty array would drop the predicate and return the whole table (T-38-01)."
  - "`ReturnType<typeof eq>[]` on the fetchDeals/fetchActivities condition arrays accepts inArray's `SQL<unknown>` unchanged — RESEARCH assumption A1 resolved by measurement, no annotation widening, no cast, no @ts-expect-error."
  - "The live probe reads its ids through raw SQL rather than through drizzle's own membership helper, so the ids under test come from a source independent of the predicate being verified."
  - "The 100-id cap was deliberately NOT added here (T-38-16 transferred): formatters.ts is a shared read path the admin full export also uses and must not acquire a bulk-specific limit."

patterns-established:
  - "PgDialect.sqlToQuery in unit tests: assert on generated SQL text and bound params, and assert ids are NOT present in the statement text (proves parameterisation, T-38-15)"
  - "Live probes state their own necessity in a header comment naming the mocked-suite defect class they exist to catch, and assert read-only-ness by snapshotting row counts in beforeAll and re-asserting them at the end"
  - "Mocked suites name the live file that proves what they structurally cannot"

requirements-completed: [BULK-04]

# Metrics
duration: 20min
completed: 2026-08-17
---

# Phase 38 Plan 04: ExportFilters.ids Narrowing Summary

**`ExportFilters.ids` narrows all four export fetchers via drizzle `inArray` bound parameters, proven against the live 46,054-row organizations table — including the load-bearing case that an empty id list returns zero rows rather than the whole table.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-17T13:44Z
- **Completed:** 2026-08-17T14:03Z
- **Tasks:** 3
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- `ExportFilters` gained `ids?: string[]`; `ExportOptions` and `ExportResult` are byte-unchanged, as is `fetchFilteredData`'s filename block and every flattener.
- All four private fetchers (`fetchOrganizations`, `fetchPeople`, `fetchDeals`, `fetchActivities`) push `inArray(<table>.id, filters.ids)` alongside their existing predicates, composing with `owner` / `stage` / `dateFrom` / `dateTo` rather than replacing them.
- The generated SQL was measured, not assumed: `("organizations"."deleted_at" is null and "organizations"."id" in ($1, $2, $3))` with `params: ["a","b","c"]`. This is emphatically **not** the Phase 37 defect shape (`= ANY(($1,$2,$3))`), and it was executed directly in `psql` against three real ids, returning exactly 3 rows.
- `inArray(col, [])` renders as `("organizations"."deleted_at" is null and false)` with zero params, and returns 0 rows — verified both through the probe and by running that exact predicate in `psql`.
- 17 new unit tests plus a 17-test live probe; the live suite self-skips so `npm test` stays hermetic (84 files passed, 1 skipped; 1720 tests passed, 21 skipped).

## Task Commits

1. **Task 1 (RED): failing tests for ids narrowing** — `fd2405e` (test)
2. **Task 1 (GREEN): ExportFilters.ids + four narrowed fetchers** — `a410ca8` (feat)
3. **Task 2: full ids-narrowing contract for all four entity types** — `8046a7d` (test)
4. **Task 3: live-database proof of the id-scoped query** — `1bfcabd` (test)

_Task 1 was `tdd="true"`; its RED and GREEN gates are separate commits. No REFACTOR commit was needed — the implementation is four three-line guards._

## Files Created/Modified

- `src/lib/export/types.ts` — `ExportFilters.ids?: string[]`, documented as zero-rows-on-empty by design. Nothing else in the file changed.
- `src/lib/export/formatters.ts` — `inArray` imported; one presence-guarded push per fetcher; a block comment above the fetch section recording why the guard is on presence and not length, with the drizzle source reference.
- `src/lib/export/formatters.test.ts` — the bare `db: { query: {} }` stub replaced with a shaped `vi.hoisted` mock recording each table's `findMany` call; a new `fetchFilteredData id narrowing` describe block (17 tests).
- `src/lib/export/formatters-live.test.ts` — **new.** Env-gated, read-only live-database probe (17 tests).

## Live-Database Measurements (Task 3)

Baseline, taken via `docker compose exec postgres psql -U pipelite -d pipelite` **before** the probe:

| Table | total rows | rows with `deleted_at is null` |
|---|---|---|
| organizations | 46,054 | 46,054 |
| people | 38,348 | 38,348 |
| deals | 25,195 | 25,195 |
| activities | 79,022 | 79,022 |
| audit_log | 73 | — |

Every table had ≥ 3 live rows, so all four entity types were probed with 3 real ids and asserted `count === 3`.

**Unfiltered organization export vs. direct count — the two agree exactly:**

- `fetchFilteredData({ entityType: "organization", format: "csv", includeCustomFields: true })` returned `count === 46054`.
- `select count(*) from organizations where deleted_at is null` returned `46054`.
- The probe asserts equality between the two, so a drift in the fetcher's own base predicate would fail the suite rather than pass unnoticed. It also asserts `46054 > 3`, which is what proves the 3-id narrowing was real rather than an artefact of an empty table.

**Empty id list, all four entity types:** `count === 0` and `data === ""`. Independently confirmed in `psql`: `select count(*) from organizations where ("organizations"."deleted_at" is null and false)` → `0`.

**Nonexistent id (`00000000-0000-0000-0000-000000000000`), all four entity types:** `count === 0`, no throw.

**Read-only proof.** Counts taken again **after** the probe run: organizations `46054`, audit_log `73`, people `38348`, deals `25195`, activities `79022` — identical to baseline. The probe also asserts this internally (organizations and audit_log snapshotted in `beforeAll`, re-read in a final test).

**Skip behaviour.** Without `DATABASE_URL`: `17 tests | 17 skipped`, exit 0. With it: `17 passed` in 2.4s.

## Decisions Made

- **Presence guard, not length guard.** `if (filters?.ids)` is the whole T-38-01 mitigation at this layer. The `formatters.ts` comment block spells out the wrong form explicitly so a future reader cannot "optimise" it back.
- **RESEARCH assumption A1 resolved by measurement.** `ReturnType<typeof eq>[]` on the `fetchDeals` / `fetchActivities` condition arrays accepts `inArray`'s `SQL<unknown>` without complaint — `npm run typecheck` reports 0 errors. No annotation widening, no `type SQL` import, no cast, no suppression. Phase 43 inherits nothing.
- **`PgDialect.sqlToQuery` over queryChunk introspection.** The plan offered a fallback of merely asserting the `where` value *changes* between an id-scoped and an unscoped call. That fallback was not needed: drizzle's own dialect renders the predicate to SQL text and bound params with no database, so the unit tests assert on the real statement — and additionally assert the ids are **absent** from the statement text, which is a direct T-38-15 (parameterisation) check the fallback could not have made.
- **Raw SQL for the probe's id lookups**, so the ids under test do not originate from the membership helper being verified.
- **No 100-id cap here.** T-38-16 stays transferred to the server actions; this is a shared read path.

## Deviations from Plan

**1. [Rule 3 - Blocking] The worktree had no `node_modules`**
- **Found during:** setup, before Task 1
- **Issue:** The git worktree is a bare checkout; `./node_modules/.bin/vitest`, `npm run typecheck` and `npm run lint` all failed with nothing installed.
- **Fix:** Symlinked the main repo's existing install: `ln -s /home/pedro/programming/pipelite/node_modules <worktree>/node_modules`. **No package was installed** — the package-manager-install exclusion to Rule 3 was not triggered, and `package.json` / `package-lock.json` are untouched.
- **Verification:** `/node_modules` is in `.gitignore`, so `git status` stays clean and the symlink is not committed. Confirmed clean before every commit.

**2. [Plan-structure adjustment] Task 1's RED gate touched `formatters.test.ts`, which is nominally Task 2's file**
- **Found during:** Task 1
- **Issue:** Task 1 carries `tdd="true"`, so a failing test must exist before the implementation — but the plan assigns all test authoring to Tasks 2 and 3. A RED gate for id narrowing is unwritable without the shaped `@/db` stub that Task 2 introduces.
- **Fix:** The shaped stub plus two failing tests landed in the Task 1 RED commit (`fd2405e`); Task 2 (`8046a7d`) then expanded that block from 2 tests to 17 (per-entity dispatch isolation, parameterisation, empty-list, omitted-vs-empty-filters, owner composition). RED was genuinely red: 2 failed / 16 passed, with the failure message `expected '"organizations"."deleted_at" is null' to contain ' in '` — i.e. the predicate provably absent before the implementation.
- **Files modified:** `src/lib/export/formatters.test.ts`
- **Verification:** TDD gate sequence present in git log: `test(38-04)` → `feat(38-04)`. No existing assertion was weakened or deleted; the 16 pre-existing tests stayed green across the stub replacement.

**3. [Scope clarification — deferred, not done] The source gate banning `ExportFilters` / `ExportOptions` / `format` from the scoped-export action surface**
- **Found during:** post-task review against the orchestrator's framing note
- **Issue:** The orchestrator prompt said this plan "owns the fetcher layer plus the source gate banning `ExportFilters`/`ExportOptions`/`format` from the new action surface". `38-04-PLAN.md` itself defines exactly 3 tasks over 4 files and contains no such gate in `files_modified`, `must_haves.artifacts` or any task.
- **Why it was not written here:** this plan is wave 1 with `depends_on: []`, and the scoped-export actions it would police do not exist until plans 38-11..38-14. A gate over zero matching functions is a vacuous pass, which `38-PATTERNS.md § Anti-vacuity requirements for any new source gate` explicitly forbids; adding the anti-vacuity assertion that would make it meaningful ("four scoped export actions exist") would fail the wave-1 build.
- **Action required:** the gate belongs with the action surface it constrains. Plans **38-11 through 38-14** must carry it, asserting over comment-stripped source that no scoped-export action's signature references `ExportFilters`, `ExportOptions` or `format`, with an anti-vacuity assertion that all four actions were found. `38-CONTEXT.md` already locks the `(ids: string[])`-only signature, so the constraint itself is recorded; only its automated enforcement is deferred.
- **Impact:** none on BULK-04 at this layer. The fetcher-level second line of defence (empty list → zero rows) is implemented and proven live, which is what this plan's `must_haves` require.

---

**Total deviations:** 1 auto-fixed (Rule 3 blocking), 1 plan-structure adjustment, 1 explicit deferral to plans 38-11..38-14.
**Impact on plan:** No scope creep. All three `must_haves.truths`, all three `must_haves.artifacts` and the `key_links` pattern `inArray\([a-zA-Z]+\.id` are satisfied.

## Issues Encountered

- **`vi.mock` hoisting vs. the spy table.** `vi.mock("@/db", ...)` is hoisted above the imports, so it cannot close over an ordinary `const`. Resolved with `vi.hoisted`.
- **Recorded-call typing.** The `findMany` stub is declared arg-less, so `mock.calls` is typed `[][]` and `calls[0][0]` fails to compile (TS2493 / TS2352). Resolved by re-typing the recorded tuple inside the single helper that reads it, rather than adding an unused parameter (the ESLint config has no `argsIgnorePattern`, so `_config` would have produced a warning).
- **postgres-js keeping the worker alive.** The live probe closes the pool in `afterAll` via `db.$client.end({ timeout: 5 })`; without it vitest does not exit.
- Pre-existing lint warnings in `formatters.ts` (unused `stages` / `activityTypes` / `users` schema imports, lines 8-10) were left alone — out of scope, present on master, 0 errors overall.

## Verification

| Check | Result |
|---|---|
| `npm run typecheck` | 0 errors; no new `@ts-expect-error` in the diff |
| `./node_modules/.bin/vitest run src/lib/export/` | 33 passed (16 pre-existing + 17 new), live suite skipped |
| `DATABASE_URL=... vitest run src/lib/export/formatters-live.test.ts` | 17 passed, 2.4s |
| `vitest run src/lib/export/formatters-live.test.ts` (no env) | 17 skipped, exit 0 |
| `npm test` | 84 files passed / 1 skipped; 1720 tests passed / 21 skipped |
| `eslint` on all four touched files | exit 0, no new warnings |
| `grep -c 'ids?: string\[\]' types.ts` | 1 |
| `grep -v '^\s*[*/]' formatters.ts \| grep -c 'inArray('` | 4 |
| per-table `inArray(<table>.id` count | 4 |
| length-based guard count | 0 |
| `git diff` on `fetchFilteredData`'s filename block | no change |

## User Setup Required

None — no external service configuration required. The live probe needs `DATABASE_URL="postgresql://pipelite:pipelite@localhost:5433/pipelite"` on the command line (host port 5433 maps to the container's 5432; `.env.local`'s 5432 is the in-network value and will not work from the host).

## Next Phase Readiness

- Plans **38-11..38-14** can now construct `ExportOptions` server-side with `filters: { ids }` and get exactly the selected rows. Their action signature must remain `(ids: string[])` and nothing else, and they own the source gate deferred above.
- They must still enforce the primary controls at the action boundary: authentication, the per-record ownership predicate (asymmetric — deals carries the admin bypass, the other three do not), the 100-id cap, and rewriting `result.filename` to `{entity}-selected-{count}-{YYYY-MM-DD}.csv`. `formatters.ts` deliberately does none of these.
- No blockers.

## Self-Check: PASSED

- `src/lib/export/types.ts` — FOUND
- `src/lib/export/formatters.ts` — FOUND
- `src/lib/export/formatters.test.ts` — FOUND
- `src/lib/export/formatters-live.test.ts` — FOUND
- Commits `fd2405e`, `a410ca8`, `8046a7d`, `1bfcabd` — all 4 FOUND in git log
- No file deletions in any of the four commits (`git diff --diff-filter=D` empty)
- No untracked files left behind

---
*Phase: 38-bulk-operations*
*Completed: 2026-08-17*
