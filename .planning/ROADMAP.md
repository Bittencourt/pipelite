# Roadmap: Pipelite

## Milestones

- ✅ **v1.0 MVP** -- Phases 1-16 (shipped 2026-03-14)
- ✅ **v1.1 Reliability & Operations** -- Phases 17-20, 23 (shipped 2026-03-26)
- ✅ **v1.2 Workflows** -- Phases 24-31 (shipped 2026-03-28)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-16) -- SHIPPED 2026-03-14</summary>

- [x] Phase 1: Foundation & Authentication (6/6 plans) -- completed 2026-02-22
- [x] Phase 2: Organizations (3/3 plans) -- completed 2026-02-22
- [x] Phase 3: People (3/3 plans) -- completed 2026-02-22
- [x] Phase 4: Pipelines & Stages (4/4 plans) -- completed 2026-02-23
- [x] Phase 5: Deals & Kanban (3/3 plans) -- completed 2026-02-24
- [x] Phase 6: Activities (4/4 plans) -- completed 2026-02-25
- [x] Phase 7: Custom Fields & Formulas (11/11 plans) -- completed 2026-02-28
- [x] Phase 8: Search & Filtering (3/3 plans) -- completed 2026-02-28
- [x] Phase 9: Import/Export (3/3 plans) -- completed 2026-02-28
- [x] Phase 10: REST API (4/4 plans) -- completed 2026-03-01
- [x] Phase 11: Keyboard Control (5/5 plans) -- completed 2026-03-02
- [x] Phase 12: Localization (5/5 plans) -- completed 2026-03-05
- [x] Phase 13: Comprehensive Documentation (4/4 plans) -- completed 2026-03-06
- [x] Phase 14: Dashboard Metrics (3/3 plans) -- completed 2026-03-07
- [x] Phase 15: Multi-user Collaboration (6/6 plans) -- completed 2026-03-07
- [x] Phase 16: Pipedrive API Importer (6/6 plans) -- completed 2026-03-08

Full archive: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>v1.1 Reliability & Operations (Phases 17-20, 23) -- SHIPPED 2026-03-26</summary>

- [x] Phase 17: TypeScript Cleanup (1/1 plan) -- completed 2026-03-14
- [x] Phase 18: DB Infrastructure (1/1 plan) -- completed 2026-03-14
- [x] Phase 19: Webhook Reliability (3/3 plans) -- completed 2026-03-22
- [x] Phase 20: Import State Reliability (2/2 plans) -- completed 2026-03-23
- [x] Phase 23: Resend Email Integration (5/5 plans) -- completed 2026-03-24

Full archive: `.planning/milestones/v1.1-ROADMAP.md`

</details>

<details>
<summary>v1.2 Workflows (Phases 24-31) -- SHIPPED 2026-03-28</summary>

- [x] Phase 24: Schema & Event Infrastructure (4/4 plans) -- completed 2026-03-27
- [x] Phase 25: Trigger System (4/4 plans) -- completed 2026-03-28
- [x] Phase 26: Execution Engine & Flow Control (3/3 plans) -- completed 2026-03-28
- [x] Phase 27: Action Nodes (3/3 plans) -- completed 2026-03-28
- [x] Phase 28: Visual Editor (5/5 plans) -- completed 2026-03-28
- [x] Phase 29: Run History & Observability (3/3 plans) -- completed 2026-03-28
- [x] Phase 30: Templates & Portability (3/3 plans) -- completed 2026-03-28
- [x] Phase 31: Workflow Wiring Fixes (gap closure) -- completed 2026-03-28

Full archive: `.planning/milestones/v1.2-ROADMAP.md`

</details>

## Backlog

Unsequenced items awaiting a milestone. Promote with `/gsd:review-backlog` when ready.

Items 999.3-999.12 came from a post-v1.2 codebase review on 2026-08-13. Each carries the
evidence that motivated it so planning doesn't have to re-derive it.

**Suggested v1.3 slice** (coherent "make the foundation trustworthy" milestone):
999.3 (CI) → 999.4 (indexes) → 999.1 (formula reactivity) → 999.5 (notes timeline) → 999.6 (audit log).
Remaining items are v1.4+ candidates.

### Phase 999.1: Formula reactivity -- server-side recalc on save (BACKLOG)

**Goal:** [Captured for future planning] Formula field values recalculate server-side so stored JSONB values stay correct in API responses, exports, and webhook payloads.
**Requirements:** FORMULA-01, FORMULA-02 (carried from v1.1, originally Phase 21)
**Plans:** 0 plans

- FORMULA-01: Formula field values are recalculated server-side when any entity field is saved (values stored in JSONB; appear in API responses, exports, and webhook payloads)
- FORMULA-02: Formula recalculation only runs for formulas whose referenced source fields actually changed (dependency-aware, prevents fan-out during bulk saves)

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.2: Bulk operations -- select, delete, reassign, export (BACKLOG)

**Goal:** [Captured for future planning] Multi-select on entity list pages with bulk delete, owner reassignment, and scoped CSV export.
**Requirements:** BULK-01 through BULK-04 (carried from v1.1, originally Phase 22)
**Plans:** 0 plans

- BULK-01: User can select multiple records via checkbox column on Organizations, People, Deals, and Activities list pages (header select-all, individual row checkboxes)
- BULK-02: User can bulk delete selected records (count-aware confirmation modal; per-record permission check; partial failure surfaced)
- BULK-03: User can bulk reassign owner for selected records (member picker; partial failure surfaced per record)
- BULK-04: User can export only the currently selected records to CSV (scoped export, not full table)

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.3: Test infrastructure & CI (BACKLOG)

**Goal:** [Captured for future planning] Make regressions impossible to merge silently. Three tests fail on master today and nothing runs them.
**Requirements:** CI-01 through CI-04 (proposed)
**Plans:** 0 plans

- CI-01: `package.json` exposes a `test` script (`vitest run`) -- none exists today, so the suite is only reachable via `npx vitest`
- CI-02: `vitest.config.ts` excludes build output (`.next/**`, `node_modules/**`) -- it currently collects and runs `.next/standalone/src/lib/formula-engine.test.ts`, a stale copy of a real suite
- CI-03: Fix the three failing tests: `mutations/workflows.test.ts > deleteWorkflow` (stale mock -- cascade delete grew a `db.select` the mock chain does not supply, `workflows.ts:202`), and `formula-engine.test.ts > LOGIC.isBlank` (returns null, expects true -- pre-existing, fails in both copies)
- CI-04: GitHub Actions workflow running `tsc --noEmit`, `eslint`, and `vitest run` on push and PR -- no `.github/workflows/` exists

**Evidence:** Full suite as of 2026-08-13: 3 failed / 508 passed / 4 skipped across 42 files. The `deleteWorkflow` failure means the cascade delete (steps -> runs -> workflow), the most destructive path in the workflow subsystem, is currently unverified. Likely collateral from the PR #8/#9 hardening merges.

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.4: Database indexes for the v1.0 CRM core (BACKLOG)

**Goal:** [Captured for future planning] Index the foreign keys and hot filter columns on the core CRM tables. Best performance-per-effort available in the repo.
**Requirements:** PERF-01, PERF-02 (proposed)
**Plans:** 0 plans

- PERF-01: Add indexes on the sequential-scan paths -- `deals.stage_id` (kanban's primary query), `deals.deleted_at` (filtered on every deal query), `deals.organization_id`, `deals.person_id`, `deals.owner_id`, `activities.due_date` (reminder cron, every 5 min), `activities.deal_id`, `people.organization_id`, and the matching `deleted_at` columns on orgs/people/activities
- PERF-02: Confirm plan changes with `EXPLAIN ANALYZE` on the kanban and reminder-cron queries before and after

**Evidence:** All 8 indexes in the schema are on v1.1/v1.2 tables (`webhooks`, `webhook_deliveries`, `workflows` x3, `workflow_runs` x2, `workflow_run_steps` x2). `deals`, `people`, `organizations`, `activities`, and `custom_field_definitions` have zero non-PK indexes. Postgres does not auto-index FK columns -- only the referenced side. Zero behavior change; roughly one migration.

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.5: Notes & activity timeline per entity (BACKLOG)

**Goal:** [Captured for future planning] Replace the overwrite-in-place notes column with a chronological, attributed feed on each record.
**Requirements:** NOTE-01 through NOTE-03 (proposed)
**Plans:** 0 plans

- NOTE-01: Notes table with author, timestamps, and entity polymorphic reference -- append-only rather than overwrite
- NOTE-02: Combined timeline on deal/org/person detail pages interleaving notes with activities and stage changes
- NOTE-03: Migrate existing `notes` text column content into the first note per record

**Evidence:** `deals.notes` (and the equivalents on orgs/people/activities) is a single `text` column. No history, no author, no per-entry timestamps. This is the largest UX gap relative to the Pipedrive baseline the project is measured against.

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.6: Audit log (BACKLOG)

**Goal:** [Captured for future planning] Answer "who changed this record, when, and was it a human or a workflow?" Makes the v1.2 automation engine trustworthy.
**Requirements:** AUDIT-01 through AUDIT-03 (proposed)
**Plans:** 0 plans

- AUDIT-01: Audit log table capturing entity, field-level before/after, actor, and actor kind (user / workflow run / API key / import)
- AUDIT-02: Subscriber on the existing `crmBus` -- the 13 typed events already fire on every mutation, so no mutation code needs to change
- AUDIT-03: Per-record history view, and a link from a workflow run to the records it mutated

**Evidence:** Workflows now mutate CRM data autonomously via the CRM action node, and nothing records that they did. Retention/pruning policy needs deciding during planning -- this table grows fastest of anything in the schema.

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.7: Duplicate detection & record merge (BACKLOG)

**Goal:** [Captured for future planning] Detect and merge duplicate organizations, people, and deals.
**Requirements:** DEDUP-01 through DEDUP-03 (proposed)
**Plans:** 0 plans

- DEDUP-01: Duplicate detection on create and on demand (email, name+org, phone)
- DEDUP-02: Merge UI with per-field winner selection
- DEDUP-03: Merge reassigns child records (deals, activities, notes, files) rather than orphaning them

**Evidence:** The project ships a Pipedrive API importer, which is precisely how duplicates enter a CRM. There is currently no detection and no merge path.

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.8: Saved views & shared filters (BACKLOG)

**Goal:** [Captured for future planning] Let users persist, name, and share the filter combinations they rebuild daily.
**Requirements:** VIEW-01 through VIEW-03 (proposed)
**Plans:** 0 plans

- VIEW-01: Save the current filter set as a named view per entity type
- VIEW-02: Private vs. shared visibility, with a per-user default view
- VIEW-03: Views usable as the deal scope for exports

**Evidence:** Filtering exists across the list pages (Phase 8) but nothing about it is persistable.

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.9: Trash & restore for soft-deleted records (BACKLOG)

**Goal:** [Captured for future planning] Make `deletedAt` recoverable instead of merely invisible.
**Requirements:** TRASH-01 through TRASH-03 (proposed)
**Plans:** 0 plans

- TRASH-01: Trash view listing soft-deleted records per entity type with deletion time and actor
- TRASH-02: Restore action, including relinking children whose parent was deleted
- TRASH-03: Retention policy and permanent-purge path for admins

**Evidence:** `deletedAt` is set consistently across entities, but the app has only 4 `restore` references. Deleted records are unreachable rather than recoverable, so soft delete currently buys nothing a hard delete wouldn't.

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.10: Workflow operator affordances (BACKLOG)

**Goal:** [Captured for future planning] Give the workflow engine the operational controls its newness demands -- replay, dry-run, and failure alerting.
**Requirements:** WFOPS-01 through WFOPS-04 (proposed)
**Plans:** 0 plans

- WFOPS-01: Re-run / replay a failed run from the run detail page -- mirror the existing webhook DLQ replay pattern
- WFOPS-02: Dry-run in the editor -- execute against sample trigger data without mutating CRM records
- WFOPS-03: Notify on `status = failed` (email and/or in-app) -- runs can currently fail silently forever
- WFOPS-04: Document the webhook-response single-instance constraint (in-memory promise map coordinating waitFor/send) -- everything else, including the atomic `UPDATE...RETURNING` claims on schedules and runs, is already multi-instance safe

**Evidence:** v1.2's first real-world test found the entire engine dead in Docker for months (see `debug/resolved/workflow-engine-not-firing.md`). The engine is verified working now, but a transient HTTP 503 in an action still has no recovery path short of re-triggering by hand.

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.11: Observability -- structured logging, error tracking, health endpoint (BACKLOG)

**Goal:** [Captured for future planning] Make production failures detectable without grepping container stdout.
**Requirements:** OBS-01 through OBS-03 (proposed)
**Plans:** 0 plans

- OBS-01: Structured logger (pino or equivalent) replacing the 108 bare `console.*` calls in non-test source
- OBS-02: Error tracking integration (Sentry or equivalent), opt-in via env var to preserve the self-hosted no-phone-home default
- OBS-03: `/api/health` reporting DB connectivity and the liveness of all four background processors

**Evidence:** No pino/winston/Sentry in the dependency tree. `docker-compose.yml` healthchecks Postgres, not the app. The instrumentation failure that killed the workflow, webhook, and email processors went undetected from March to August precisely because nothing reported processor liveness.

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.12: Type-safety & deployment-docs polish (BACKLOG)

**Goal:** [Captured for future planning] Clear the standing type suppressions and document the self-hosting operational story.
**Requirements:** POLISH-01, POLISH-02 (proposed)
**Plans:** 0 plans

- POLISH-01: Shared typed `TableMeta` interface for TanStack Table, removing all 14 `@ts-expect-error` suppressions (`admin/pipelines/columns.tsx`, `organizations/columns.tsx`, `people/columns.tsx` -- all the same meta-callback typing issue)
- POLISH-02: Backup and restore documentation -- the product is self-hosted and the user owns the database, but no backup story is documented

**Evidence:** The 14 suppressions are the only `@ts-expect-error` instances in the codebase and share one root cause, so one shared interface clears all of them.

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

---
*Roadmap updated: 2026-08-13 -- captured 10 post-v1.2 review findings as backlog items 999.3-999.12*
