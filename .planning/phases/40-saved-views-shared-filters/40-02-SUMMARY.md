---
phase: 40-saved-views-shared-filters
plan: 02
subsystem: database
tags: [postgres, drizzle, drizzle-kit, jsonb, migration, saved-views]

# Dependency graph
requires:
  - phase: 39-duplicate-detection-merge
    provides: "dedup_scans as the discriminator-table precedent (one table, entityType column, imported union) and the BACKLOG entry recording an advisory read-then-write guard as a defect"
  - phase: 35-custom-fields
    provides: "EntityType, the single definition of the four-member entity union, imported here rather than restated"
provides:
  - "saved_views: one table for all four entity types, entityType discriminator, JSONB filters, isShared boolean"
  - "saved_view_defaults: per-user per-entityType default, composite PK, cascading FK to saved_views"
  - "saved_views_owner_type_name_uniq: the S-6 name refusal as a database invariant, so the save action can catch 23505 instead of pre-checking"
  - "savedViewsRelations.owner: one-query V-5 attribution (name ?? email plus a soft-delete check)"
  - "migration 0018_adorable_smasher, applied to the development database"
affects: [40-04, 40-05, 40-06, 40-07, 40-08, 40-09, 40-10, 40-11, 40-12, 40-14]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Schema contracts asserted through getTableConfig (parsed structure), never through greps over the schema file"
    - "A per-user preference keyed on a shared row belongs in its own table with a composite PK, not a boolean on the shared row"

key-files:
  created:
    - src/db/schema/saved-views.ts
    - src/db/schema/saved-views.test.ts
    - drizzle/0018_adorable_smasher.sql
    - drizzle/meta/0018_snapshot.json
  modified:
    - src/db/schema/index.ts
    - src/db/schema/_relations.ts
    - drizzle/meta/_journal.json

key-decisions:
  - "saved_view_defaults exists as a second table because UI-SPEC G-7 requires a user to default to somebody else's shared view, which an isDefault flag on the view row cannot express. 40-CONTEXT's 'flag on the view row' wording is departed from; its discriminator decision is honoured exactly."
  - "saved_views.owner_id deliberately does NOT cascade, while both saved_view_defaults FKs do. A shared view outlives its (soft-deleted) owner because teammates use it; nobody else depends on my default."
  - "Name uniqueness and one-default-per-user-per-type are DATABASE invariants (a unique index and a composite PK), not application checks, because a read-then-write guard is advisory under concurrency."
  - "No deletedAt on saved_views (D-2: a delete removes it for everyone; /trash has no views tab) and no isDefault column."
  - "The union-not-restated contract is a type EQUALITY assertion, not an as-cast. Measured: TypeScript widens a fresh string literal before checking assertion comparability, so the cast version proved nothing."
  - "saved_views is registered in _relations.ts although dedup_scans and duplicate_pairs are not. The owner relation is what earns it: V-5 attribution needs the user row, and without the relation that is one extra query per view."

patterns-established:
  - "Discriminator table for saved per-entity-type objects: one table + entityType column + JSONB payload, following dedup_scans"
  - "Probe rows in the shared development database carry a literal '[probe-40-02]' name prefix and are deleted by that prefix; nothing else is ever deleted"
  - "Negative proofs are executed mutations of the real source, each expected to fail a NAMED assertion, then restored"

requirements-completed: [VIEW-01, VIEW-02]

# Metrics
duration: 47min
completed: 2026-08-21
---

# Phase 40 Plan 02: Saved Views Schema Summary

**One `saved_views` table for all four entity types with a JSONB `filters` column, plus a separate `saved_view_defaults` keyed `(userId, entityType)` so a user can default to somebody else's shared view — delivered by migration 0018 and proved in the Postgres catalog rather than from a migration exit code.**

## Performance

- **Duration:** ~47 min
- **Started:** 2026-08-21T05:57Z
- **Completed:** 2026-08-21T06:44Z
- **Tasks:** 2 of 2 (Task 1 executed as a TDD RED/GREEN pair)
- **Files modified:** 7

## Accomplishments

- `saved_views` and `saved_view_defaults` exist in the development database with every column, both foreign keys and all six indexes verified from `pg_indexes` / `pg_constraint`, not from `drizzle-kit`'s exit code.
- The two rules the phase depends on are DATABASE invariants and were exercised, not reasoned about: a duplicate `(owner, entityType, name)` raises `23505` on `saved_views_owner_type_name_uniq`, and a second default for one `(user, entityType)` raises `23505` on the composite primary key.
- The G-7 asymmetry the second table exists for was proved end to end: user B inserted a default pointing at user A's shared view, and deleting A's view cascaded that default away leaving zero orphans.
- V-5 attribution was proved against the real user table: a `NULL` name falls back to email, and a soft-deleted owner's view still resolves its owner (`Sarah Johnson`, `owner_soft_deleted = t`).
- Nine production row counts unchanged; both new tables back to zero rows after cleanup.

## Task Commits

1. **Task 1 (RED): failing schema contract** — `d57dd41` (test)
2. **Task 1 (GREEN): savedViews and savedViewDefaults schema + registration** — `8b012d1` (feat)
3. **Task 2: generate and apply migration 0018** — `dfb3990` (feat)

## Files Created/Modified

- `src/db/schema/saved-views.ts` — both tables, with the rationale for the two-table shape and for the two deliberately-absent columns written into the source
- `src/db/schema/saved-views.test.ts` — 18 assertions over the parsed table structure, plus four `tsc`-checked type contracts
- `src/db/schema/index.ts` — `export * from "./saved-views"` added before the trailing `_relations` export, which is still last
- `src/db/schema/_relations.ts` — `savedViewsRelations`, `savedViewDefaultsRelations`, and `savedViews: many(savedViews)` on `usersRelations`
- `drizzle/0018_adorable_smasher.sql` — 9 statements, all against the two new tables
- `drizzle/meta/0018_snapshot.json`, `drizzle/meta/_journal.json` — journal now ends at `idx: 18`

## Migration number

**Journal verified BEFORE generating.** `drizzle/meta/_journal.json` ended at `idx: 17`, tag `0017_dedup_schema`, and `information_schema` had no `saved%` table. `0018` was free, so this plan took it. The deferred dedup scan-guard fix recorded in `.planning/BACKLOG.md` also wants `0018` and has not landed — confirmed, not assumed. Nothing existing was renumbered.

## The generated SQL, verbatim

```sql
CREATE TABLE "saved_view_defaults" (
	"user_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"view_id" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "saved_view_defaults_user_id_entity_type_pk" PRIMARY KEY("user_id","entity_type")
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_shared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_view_defaults" ADD CONSTRAINT "saved_view_defaults_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_view_defaults" ADD CONSTRAINT "saved_view_defaults_view_id_saved_views_id_fk" FOREIGN KEY ("view_id") REFERENCES "public"."saved_views"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_view_defaults_view_idx" ON "saved_view_defaults" USING btree ("view_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_views_owner_type_name_uniq" ON "saved_views" USING btree ("owner_id","entity_type","name");--> statement-breakpoint
CREATE INDEX "saved_views_owner_idx" ON "saved_views" USING btree ("entity_type","owner_id");--> statement-breakpoint
CREATE INDEX "saved_views_shared_idx" ON "saved_views" USING btree ("entity_type","is_shared");
```

The plan required confirming the diff touches nothing else before applying it to a shared 46,054-organization database. That was checked by PARSING each statement's target rather than by reading the file: 9 statements, `{CREATE TABLE: 2, ALTER TABLE: 3, CREATE INDEX: 3, CREATE UNIQUE INDEX: 1}`, every target in `{saved_views, saved_view_defaults}`, every `"public"."x"` reference in `{saved_views, users}`, no `DROP`/`TRUNCATE`/`DELETE`. The guard's own discrimination was then proved (see Negative Proofs, NEG A).

Applied with `drizzle-kit migrate` over the host-mapped port. `DATABASE_URL` in `.env` resolves `postgres:5432`, which is unreachable from the host, so `E2E_DATABASE_URL` (`localhost:5433/pipelite`, the same string `vitest.db.config.ts` uses) was substituted for the run and never printed.

## Catalog verification

`\d saved_views`:

```
 id          | text      | not null |
 owner_id    | text      | not null |
 entity_type | text      | not null |
 name        | text      | not null |
 filters     | jsonb     | not null | '{}'::jsonb
 is_shared   | boolean   | not null | false
 created_at  | timestamp | not null | now()
 updated_at  | timestamp | not null | now()
Indexes:
    "saved_views_pkey" PRIMARY KEY, btree (id)
    "saved_views_owner_idx" btree (entity_type, owner_id)
    "saved_views_owner_type_name_uniq" UNIQUE, btree (owner_id, entity_type, name)
    "saved_views_shared_idx" btree (entity_type, is_shared)
Foreign-key constraints:
    "saved_views_owner_id_users_id_fk" FOREIGN KEY (owner_id) REFERENCES users(id)     -- no cascade
Referenced by:
    "saved_view_defaults_view_id_saved_views_id_fk" ... ON DELETE CASCADE
```

`\d saved_view_defaults`:

```
 user_id     | text      | not null |
 entity_type | text      | not null |
 view_id     | text      | not null |
 updated_at  | timestamp | not null | now()
Indexes:
    "saved_view_defaults_user_id_entity_type_pk" PRIMARY KEY, btree (user_id, entity_type)
    "saved_view_defaults_view_idx" btree (view_id)
Foreign-key constraints:
    "..._user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    "..._view_id_saved_views_id_fk" FOREIGN KEY (view_id) REFERENCES saved_views(id) ON DELETE CASCADE
```

Ten catalog assertions, all PASS: both tables exist; the unique index exists; zero orphaned defaults; 4 indexes on `saved_views` and 2 on `saved_view_defaults`; `saved_views_owner_id_users_id_fk` has `confdeltype = 'a'` (no action); both `saved_view_defaults` FKs have `confdeltype = 'c'`; the primary key spans 2 columns; zero rows remain; migration 0018 is recorded in `drizzle.__drizzle_migrations`.

## Probe results (RUN, not reasoned about)

Fixtures are real users, chosen for what they prove — A = `pedrobittencourt87@gmail.com` (live, `name IS NULL`), B = `pipelite-e2e@local.test` (live admin, name set), C = `sarah.johnson@pipelite.local` (**soft-deleted**, name set). Every row written carried the literal name prefix `[probe-40-02]`.

| Probe | Expectation | Result |
|-------|-------------|--------|
| 1 | A and B may each own a view named `[probe-40-02] Mine` for `organization` | `INSERT 0 1` twice — **both succeeded** |
| 2 | A may not own a second one | `ERROR: duplicate key value violates unique constraint "saved_views_owner_type_name_uniq"`, `Key (owner_id, entity_type, name)=(bc79ecfe…, organization, [probe-40-02] Mine) already exists` — **23505** |
| 3 | The same name under `deal` is fine | `INSERT 0 1` — **succeeded** |
| 4 | **G-7:** B defaults to A's shared view | `INSERT 0 1`; the join reports `default_is_on_someone_elses_view = t` — **succeeded** |
| 5 | B may not hold two defaults for `organization` | `ERROR: duplicate key value violates unique constraint "saved_view_defaults_user_id_entity_type_pk"` — **23505** |
| 6 | B may hold one default per entity type | `INSERT 0 1` for `deal` — **succeeded** |
| 7 | A default may not point at a nonexistent view | `ERROR: ... violates foreign key constraint "saved_view_defaults_view_id_saved_views_id_fk"` — **23503** |
| 8 | **V-5 attribution** across NULL names and soft-deleted owners | `probe-40-02-a → pedrobittencourt87@gmail.com (name_was_null=t)`; `probe-40-02-b → Pipelite E2E Admin`; `probe-40-02-c → Sarah Johnson (owner_soft_deleted=t)` |
| 9 | Deleting A's view cascades B's default away | `DELETE 1`; `defaults_left_for_deleted_view = 0`; `orphaned_defaults = 0`; B's `deal` default survived untouched |

Cleanup deleted by name prefix only (`DELETE 1` defaults, `DELETE 3` views). Post-cleanup `saved_views = 0`, `saved_view_defaults = 0`.

## Development database row counts

Additive only. Identical before and after:

| Table | Before | After |
|-------|--------|-------|
| organizations | 46054 | **46054** |
| people | 38348 | **38348** |
| deals | 25195 | **25195** |
| notes | 75236 | **75236** |
| activities | 79022 | **79022** |
| audit_log | 213 | **213** |
| duplicate_pairs | 543 | **543** |
| dedup_scans | 1 | **1** |
| users | 9 | **9** |

No `TRUNCATE`, `DROP` or unqualified `DELETE` was issued against `pipelite` at any point.

## Negative proofs

Every one was applied to the real source, RUN, confirmed to fail by name, and restored. The suite was re-run green after each restore.

| # | Mutation | Must fail | Observed |
|---|----------|-----------|----------|
| 1 | `isDefault` boolean added back onto `saved_views` | the no-`is_default` rule | `FAIL … carries NO is_default column, because a per-user default cannot live on the view row` **+** `FAIL … has exactly the eight columns the phase needs` (2 failed / 16 passed) |
| 2 | `owner_id` given `onDelete: "cascade"` | the survives-a-soft-deleted-owner rule | `FAIL … does NOT cascade on owner deletion, so a soft-deleted owner's shared view survives` |
| 3 | Unique index unscoped from the owner | the per-owner scoping rule | `FAIL … declares name uniqueness per (owner, entityType) as a database invariant` |
| 4 | `view_id` cascade removed | the no-orphan rule | `FAIL … cascades from both the user and the view, so no orphan default can survive` |
| 5 | Defaults PK reduced to `(user_id)` | the one-per-user-per-type rule | `FAIL … enforces one default per user per entity type with a composite primary key` |
| 6 | `owner` relation deleted from `savedViewsRelations` | the relation rule **and** the attribution typecheck | `FAIL … relates a view to its owner and to the defaults pointing at it`; `tsc`: `TS2353 'owner' does not exist in type …` plus three `TS2551` |
| 7 | `export * from "./saved-views"` removed from the barrel | the registration rule | `FAIL … re-exports both tables from the schema barrel` |
| 9a | Union RESTATED in `saved-views.ts` with one member misspelled | the union-equality contract | `saved-views.test.ts(44,7): error TS2322: Type 'true' is not assignable to type 'never'` |
| 9b | Union restated verbatim, then `EntityType` renamed upstream | the same contract, via drift | same `TS2322` at line 44 |
| NEG A | `ALTER TABLE "organizations"` appended to a **copy** of 0018 | the SQL scoping guard | `TOUCHES FOREIGN TABLE "organizations"`, exit 1 |
| NEG B | The ten catalog checks pointed at `pipelite_dedup_test` (no 0018) | all of them | 10 of 10 FAIL, exit 1 |

`tsc` reported 0 errors and the schema suite 18/18 after every restore, and the real `0018_adorable_smasher.sql` was confirmed to contain no `probe_drift` (NEG A used a scratchpad copy).

## Decisions Made

1. **A second table, not a boolean.** `40-CONTEXT.md` says the default is "a per-user, per-entityType flag on the view row". That cannot express its own companion rule from the same file and from UI-SPEC G-7 — a user may set someone else's shared view as their own default — because a flag on Ana's view row would make it Ana's default too. `saved_view_defaults` with PK `(userId, entityType)` and a cascading FK is the smaller departure; the alternative was silently dropping a locked spec rule. The discriminator decision (ONE views table, four entity types, not four tables) is honoured exactly. The full reasoning is in the source above the table, because this is precisely the kind of thing a later reader "simplifies" back.

2. **Asymmetric cascades.** `saved_views.owner_id` does not cascade; both `saved_view_defaults` FKs do. A shared view must outlive its owner (V-5, and six users here are already soft-deleted), while nobody else's behaviour depends on my default. The absence of a defaults row IS the "falls back to unfiltered, with no error" requirement, so the cascade implements the requirement rather than merely tidying up.

3. **Invariants in the database.** Both uniqueness rules are a unique index and a composite primary key. `BACKLOG.md` already records the Phase 39 dedup scan-guard as a defect for being a read-then-write check; repeating that shape here would let two concurrent saves both pass their own SELECT.

4. **A type EQUALITY contract, not casts.** The first version of the union-not-restated contract used `as` casts. It was worthless: TypeScript widens a fresh string literal before checking assertion comparability, so `"organization" as ('org' | 'person' | 'deal' | 'activity')` compiles. Measured, not assumed — see Issues Encountered.

5. **Registered in `_relations.ts` deliberately.** `dedup_scans` and `duplicate_pairs` both have FKs to `users` and no relation entry, so an FK does not earn one in this repo. The `owner` relation earns it: V-5's `name ?? email` plus a soft-delete check needs the user row, and without the relation that is one query per view.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] `docker compose exec` resolves no services from inside a worktree**

- **Found during:** Task 2 (the plan's `<automated>` verification and its psql command shape)
- **Issue:** Compose derives its project name from the working directory. From `/…/.claude/worktrees/agent-aa313417ae6da9f64` that name is `agent-aa313417ae6da9f64`, so `docker compose ps` returns an empty table and every `docker compose exec -T postgres …` fails with no container. The plan's verification command could not run as written.
- **Fix:** Addressed the same container directly — `docker exec -i pipelite-postgres-1 psql -U pipelite -d pipelite`. The assertions are byte-for-byte the plan's; only the container-naming mechanism changed. The reason is recorded in the verification script header.
- **Verification:** The three assertions the plan specified all PASS, alongside seven more.
- **Committed in:** `dfb3990`

**2. [Rule 1 — Bug] The plan's type-level contract asserted nothing**

- **Found during:** Task 1 (running the negative proof for the union-not-restated rule)
- **Issue:** The contract was written as mutual `as` casts. Negative proof 9 renamed a member of `EntityType` and predicted a compile error in `saved-views`; 564 tsc errors appeared across the repo and **zero** in `saved-views.ts` or its test. A one-line isolated probe confirmed the cause: TypeScript widens a fresh string literal before checking assertion comparability, so a cast to a non-overlapping union compiles cleanly.
- **Fix:** Replaced the casts with `type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never`, and corrected the comment to state the true property. The obvious claim ("renaming a member of `EntityType` is a compile error in this file") is FALSE while the file imports the union — the two sides move together, which is the point; the rename errors at the ~100 call sites that spell the literals out. What `Exact` catches is the failure mode that actually matters: a RESTATED copy of the union, which is equal on the day it is written and diverges the moment `EntityType` changes.
- **Files modified:** `src/db/schema/saved-views.test.ts`
- **Verification:** Proofs 9a and 9b — restating the union with a misspelled member, and restating it verbatim then renaming upstream — both now produce `TS2322: Type 'true' is not assignable to type 'never'` at the assertion.
- **Committed in:** `8b012d1`

**3. [Rule 2 — Missing coverage] Two probes the plan did not list**

- **Found during:** Task 2
- **Issue:** The plan proved the composite primary key structurally but never exercised it, and never checked that a default cannot point at a nonexistent view.
- **Fix:** Added probes 5 (second default for one `(user, entityType)` → `23505`) and 7 (default referencing a missing view → `23503`). Both are correctness requirements of the two-table design rather than extras.
- **Committed in:** `dfb3990`

---

**Total deviations:** 3 auto-fixed (1× Rule 1, 1× Rule 2, 1× Rule 3)
**Impact on plan:** No scope creep. Deviation 2 strengthened an assertion that would otherwise have shipped as a false guarantee; the other two were mechanical.

## Issues Encountered

**The worktree was 11 phases stale.** `git merge-base HEAD 86c9002` returned this worktree's own HEAD (`cbf3229`, "docs(34): mark phase 34 complete"), so the base was reset to `86c9002` as the bootstrap instructions anticipated. The journal was then re-verified from the corrected tree — `idx: 17` — before anything was generated. Had the stale journal been trusted it would have ended at a Phase-34-era entry and produced a colliding migration number.

**A prediction that disagreed with reality was investigated, not forced.** See deviation 2. The plan's cast-based contract was measured to prove nothing, the cause was isolated in a two-line probe, and the assertion was rewritten to be genuinely discriminating rather than adjusted until it passed.

**One figure in the executor briefing was wrong.** The briefing quoted `people 38,338`; the actual count is **38,348**, before and after this plan (the plan file itself says 38348, which is correct). Nothing here changed that table. Flagged because a later plan asserting 38,338 would fail for the wrong reason.

**A pre-existing lint warning was left alone.** `src/db/schema/_relations.ts:15` warns that `customFieldDefinitions` is imported but unused. It predates this plan and is out of scope; `npm run lint` reports 0 errors and 125 warnings repo-wide, unchanged.

## Verification

- `npm run typecheck` — 0 errors
- `npm run lint` — 0 errors (125 pre-existing warnings, none in this plan's files; `eslint` on the four touched files reports only the pre-existing `_relations.ts:15` warning)
- `npm test` — base project 129 files / 2761 tests passed, 1 file / 21 tests skipped; RSC project 2 files / 8 tests passed
- `src/db/schema/saved-views.test.ts` — 18/18
- Catalog assertions — 10/10 PASS
- Probes — 9/9 as specified
- Negative proofs — 11/11 failed by name and restored

## Known Stubs

None. This plan delivers storage only; no UI or action code reads these tables yet, which is the plan's boundary rather than a stub.

## Threat Flags

None. The surface this plan creates is exactly the surface the plan's threat register anticipated: T-40-07 is mitigated by `saved_views_owner_type_name_uniq` (exercised — probe 2); T-40-09's bound comes from the whitelist and length cap in plan 40-01, upstream of this table; T-40-08 and T-40-10 remain accepted-and-recorded rather than fixed here.

## Next Phase Readiness

Ready. Downstream plans can rely on:

- `savedViews` / `savedViewDefaults` and the four inferred types (`SavedView`, `NewSavedView`, `SavedViewDefault`, `NewSavedViewDefault`) from `@/db/schema`
- `db.query.savedViews.findMany({ with: { owner: true } })` for V-5 attribution in one query — the null-name and soft-deleted-owner paths are both proved live
- Catching `23505` on `saved_views_owner_type_name_uniq` for S-6's `name_taken`, and on `saved_view_defaults_user_id_entity_type_pk` for a racing default write — no pre-check needed or wanted
- The cascade as the "deleting a shared view someone defaulted to falls back to unfiltered" mechanism

Two notes for consumers: the `filters` column is `Record<string, string>` and validation is **not** enforced here, so plan 40-01's parser is the only gate on its contents; and `saved_views` has no `deletedAt`, so a delete is permanent by design.

## Self-Check: PASSED

All 8 claimed files exist on disk; all 3 task commits (`d57dd41`, `8b012d1`, `dfb3990`) are present in `git log --all`; `drizzle/meta/_journal.json` ends at `idx: 18`; 0 files touched under `src/lib/views/` or `src/messages/` (owned by siblings 40-01 and 40-03).

---
*Phase: 40-saved-views-shared-filters*
*Completed: 2026-08-21*
