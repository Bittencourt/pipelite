---
phase: 35-notes-record-timeline
plan: 01
subsystem: database
tags: [drizzle, postgres, schema, partial-index, polymorphic, soft-delete]

# Dependency graph
requires:
  - phase: 33
    provides: "D-06 rule — indexes declared in schema TypeScript, never hand-written into migration SQL"
provides:
  - "notes table (polymorphic entityType/entityId, soft delete, source discriminator) declared in Drizzle"
  - "notes_live_idx partial index on (entity_type, entity_id, created_at DESC) WHERE deleted_at is null"
  - "notes_migration_uniq partial UNIQUE on (entity_type, entity_id) WHERE source = 'migration' — the NOTE-03 idempotency invariant"
  - "deal_stage_history table with real FKs to deals, stages (x2) and users"
  - "Note, NoteSource and DealStageHistoryRow types re-exported from @/db/schema"
  - "notesRelations (author only) and dealStageHistoryRelations (deal, fromStage, toStage, changedByUser)"
affects: [35-03 migration generation, 35-04 note mutations, 35-05 keyset pagination, 35-08 timeline assembler]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Partial index declared in the Drizzle second-arg object form with .where(sql`...`) — the first use of this in the repo"
    - "Polymorphic entityType/entityId key with no FK, documented at the schema as an application-layer obligation"

key-files:
  created:
    - src/db/schema/notes.ts
    - src/db/schema/deal-stage-history.ts
  modified:
    - src/db/schema/_relations.ts
    - src/db/schema/index.ts

key-decisions:
  - "EntityType is imported from ./custom-fields rather than redeclared — one definition in the repo, no drift (D-01)"
  - "notes.entityId carries no foreign key: it is polymorphic across deals, organizations, people and activities; the parent-existence check in plan 35-04 is the only defence (T-35-04)"
  - "notes_migration_uniq is a permanent database invariant, not a one-shot migration guard (D-11 / T-35-11)"
  - "No `mode` option on any timestamp: Drizzle's default builder yields Date, matching every existing CRM table, so the plan-35-05 keyset cursor compares Date to Date"
  - "deal_stage_history is deal-specific by design; pluggability lives in the assembler's source interface, not in the table shape — the payoff is real FKs"
  - "deal_stage_history omits updated-at and soft-delete columns: history rows are immutable append-only facts (deliberate deviation from repo convention, recorded in a schema comment)"
  - "relationName was NOT added to the two stages relations — typecheck is green without it, and the plan specified adding it only if the build demanded it"

patterns-established:
  - "Partial index pattern: index('name').on(...).where(sql`${table.col} is null`) inside the pgTable second argument"
  - "Polymorphic-key documentation pattern: the absent FK is annotated at the column with the owning mitigation and threat ID"

requirements-completed: [NOTE-01, NOTE-02, NOTE-03]

# Metrics
duration: 9min
completed: 2026-08-15
---

# Phase 35 Plan 01: Notes and Stage-History Schema Summary

**Polymorphic `notes` table with two partial indexes (live-timeline read + migration idempotency UNIQUE) and an append-only `deal_stage_history` table, both declared entirely in Drizzle TypeScript so `drizzle-kit generate` emits the DDL.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-08-15T00:00:00Z (approx)
- **Completed:** 2026-08-15
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- `notes` declared with the exact column set the phase contract requires: polymorphic `entity_type`/`entity_id`, `content`, nullable `author_id`, `source` discriminator defaulting to `'user'`, and `created_at`/`updated_at`/`deleted_at`.
- Both partial indexes declared in TypeScript, satisfying Phase 33's D-06 rule: `notes_live_idx` (partial on `deleted_at is null`) and `notes_migration_uniq` (partial UNIQUE on `source = 'migration'`). Neither file contains a line of hand-written index SQL.
- `deal_stage_history` declared with four real foreign keys (`deal_id`, `from_stage_id`, `to_stage_id`, `changed_by`) and a `(deal_id, created_at DESC)` read index.
- Relations wired: `notesRelations` exposes only `author`; `dealStageHistoryRelations` exposes `deal`, `fromStage`, `toStage`, `changedByUser`.
- Barrel re-exports both modules ahead of the trailing `export * from "./_relations"`, so `import { notes, dealStageHistory, type Note, type NoteSource } from "@/db/schema"` resolves.

## Task Commits

1. **Task 1: Declare the notes and deal_stage_history tables** — `4089bab` (feat)
2. **Task 2: Wire relations and the schema barrel** — `f8b20a5` (feat)

## Files Created/Modified

- `src/db/schema/notes.ts` — the polymorphic notes table, `NoteSource` union, `Note` type, and all three indexes.
- `src/db/schema/deal-stage-history.ts` — append-only deal stage transition table, `DealStageHistoryRow` type, and the deal read index.
- `src/db/schema/_relations.ts` — added the two schema imports plus `notesRelations` and `dealStageHistoryRelations`.
- `src/db/schema/index.ts` — added `export * from "./notes"` and `export * from "./deal-stage-history"` before the trailing `_relations` export.

## Decisions Made

All decisions listed in the frontmatter `key-decisions` were pre-specified by the plan and followed as written. The single decision left to execution discretion was the `relationName` question on the two `stages` relations: the plan said to add `relationName: 'fromStage'` / `'toStage'` **only if the build demanded it**. `npm run typecheck` is green without them — `stagesRelations` declares no reverse `many(dealStageHistory)`, so Drizzle has no one/many pair to disambiguate — so they were left out. If a future plan adds a reverse relation from `stages`, `relationName` will become necessary at that point.

## Deviations from Plan

None — plan executed exactly as written.

## Verification Performed

- `npm run typecheck` — exits 0 (run after each task).
- `npx vitest run src/lib/mutations/organizations.test.ts` — 25 passed, 0 failed, confirming the barrel edit did not break module resolution for existing schema consumers.
- Grep assertions from both tasks' `<verify>` blocks: `NOTES_SCHEMA_OK`, `STAGE_HISTORY_SCHEMA_OK`, `BARREL_OK`, `RELATIONS_OK`.
- Additional acceptance checks, all zero/expected: the `EntityType` union is not redeclared in `notes.ts`; neither new file contains `CREATE INDEX`; neither passes a `mode` option to `timestamp(...)`; `deal-stage-history.ts` contains zero `deletedAt` and zero `updatedAt` occurrences and exactly four `.references(` calls; the `entity_id` column line carries no `.references(`.
- Barrel contract confirmed by typechecking a temporary file importing `{ notes, dealStageHistory, type Note, type NoteSource }` from `@/db/schema`; the temporary file was deleted before commit and is not in either commit.
- `drizzle-kit generate` was deliberately NOT run — plan 35-03 owns that `[BLOCKING]` task. No migration files were created or modified.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

None — this plan introduces no network endpoint, auth path, or file access surface. The two schema-level threats it touches (`T-35-04` polymorphic dangling reference, `T-35-06` soft-deleted note disclosure) are both mitigated as the plan's threat register specifies: documented in schema comments and carried forward as mandatory read/write predicates for plans 35-04 and 35-08. Neither is closable at the schema layer.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Every downstream plan in the phase can now `import { notes, dealStageHistory, type Note, type NoteSource, type DealStageHistoryRow } from "@/db/schema"`.
- Plan 35-03 is unblocked and owns `drizzle-kit generate` + `drizzle-kit migrate`. Its generated migration is expected to contain both partial index statements verbatim; research confirmed a re-run reports "No schema changes, nothing to migrate", so the 0009→0010 silent-index-drop failure does not recur here.
- Reminder for 35-04 and 35-08: `notes_live_idx` does not enforce its own predicate. Every read path must still carry `deleted_at is null` explicitly.

---
*Phase: 35-notes-record-timeline*
*Completed: 2026-08-15*
