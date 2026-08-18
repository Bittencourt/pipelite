# Roadmap: Pipelite

## Milestones

- ✅ **v1.0 MVP** -- Phases 1-16 (shipped 2026-03-14)
- ✅ **v1.1 Reliability & Operations** -- Phases 17-20, 23 (shipped 2026-03-26)
- ✅ **v1.2 Workflows** -- Phases 24-31 (shipped 2026-03-28)
- 🚧 **v1.3 Foundation & CRM Depth** -- Phases 32-44 (in progress)

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

### v1.3 Foundation & CRM Depth (Phases 32-44)

- [x] **Phase 32: Test Infrastructure & CI** - Green suite, one command to run it, and a merge gate that keeps it green (completed 2026-08-14)
- [x] **Phase 33: Database Indexes for the CRM Core** - Index the foreign keys and hot filter columns the v1.0 tables never got (completed 2026-08-14)
- [x] **Phase 34: Formula Reactivity** - Server-side, dependency-aware recalc so stored formula values stop going stale (completed 2026-08-14)
- [x] **Phase 35: Notes & Record Timeline** - Append-only attributed notes plus one chronological timeline per record (completed 2026-08-15)
- [x] **Phase 36: Audit Log** - Field-level change history with actor kind, fed by crmBus, with retention (completed 2026-08-16)
- [x] **Phase 37: Trash & Restore** - Make soft-deleted records visible, restorable, and eventually purged (completed 2026-08-17)
- [x] **Phase 38: Bulk Operations** - Multi-select with bulk delete, owner reassignment, and scoped export (completed 2026-08-17; the one remaining human check — dragging a Deals kanban card by its body with a real mouse — is instrument-blocked and carried into Phase 45)
- [ ] **Phase 39: Duplicate Detection & Merge** - Warn on likely duplicates and merge without orphaning children
- [ ] **Phase 40: Saved Views & Shared Filters** - Persist, share, default, and export named filter sets
- [ ] **Phase 41: Workflow Operator Affordances** - Replay, dry-run, failure alerting, and the single-instance constraint documented
- [ ] **Phase 42: Observability** - Structured logging, opt-in error tracking, and a health endpoint that sees the processors
- [ ] **Phase 43: Type Safety & Deployment Docs** - Clear the 14 type suppressions and document backup/restore
- [x] **Phase 44: Custom Field UI Repair** - Restore the ability to add custom fields to Deals, and make the formula display agree with the stored value (completed 2026-08-15)
- [ ] **Phase 45: Cross-Cutting UI Repair and UAT Closure** - Close the five app-wide defects the Phase 36-38 browser UAT surfaced: mobile overflow, unreachable dark mode, untranslated shells, a lying failure panel, and the one drag check no tool can drive

## Phase Details

### Phase 32: Test Infrastructure & CI

**Goal**: A regression cannot reach master unnoticed — one command runs the whole suite, the suite is green, and CI blocks merges that break it
**Depends on**: Nothing (first phase of v1.3; everything downstream is verified against this suite)
**Requirements**: CI-01, CI-02, CI-03, CI-04
**Success Criteria** (what must be TRUE):

  1. Developer runs `npm test` from a clean checkout, gets the full suite, and gets a non-zero exit on any failure
  2. A test run collects source tests only — nothing is collected from `.next/**` or `node_modules/**`, so the stale `.next/standalone` formula-engine copy stops running as a second suite
  3. The full suite passes with zero failures, including `mutations/workflows.test.ts > deleteWorkflow` (the cascade-delete path) and `formula-engine.test.ts > LOGIC.isBlank`
  4. A pull request containing a type error, a lint error, or a failing test shows a red required check and cannot be merged

**Plans**: 6 plans

Plans:
**Wave 1**

- [x] 32-01-PLAN.md — Add `test`/`typecheck` scripts and scope vitest collection to `src/`, excluding `.next/**` (CI-01, CI-02)
- [x] 32-03-PLAN.md — Clear 14 eslint errors: type the Drizzle `any` casts in the v1 API routes and the test mock factories (CI-04)
- [x] 32-04-PLAN.md — Clear 13 eslint errors: escape JSX quotes and add five justified React Compiler suppressions (CI-04)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 32-02-PLAN.md — Fix the `LOGIC.isBlank` source bug, repair the stale `deleteWorkflow` mock, and cover the cascade branch (CI-03)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 32-05-PLAN.md — Prove all gates green from a clean checkout, ship `.github/workflows/ci.yml`, document the merge gate (CI-04)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 32-06-PLAN.md — Run CI once on master, create the `master` ruleset requiring the `ci` check, prove a broken PR is blocked (CI-04)

### Phase 33: Database Indexes for the CRM Core

**Goal**: The v1.0 CRM tables stop sequential-scanning on their hottest queries
**Depends on**: Nothing (schema-only, independent of every other phase)
**Requirements**: PERF-01, PERF-02
**Success Criteria** (what must be TRUE):

  1. `EXPLAIN ANALYZE` on the kanban board query shows an index scan on `deals.stage_id` where it previously showed a sequential scan
  2. `EXPLAIN ANALYZE` on the activity-reminder cron query shows an index scan on `activities.due_date`
  3. Every core CRM foreign key (`deals.organization_id`, `deals.person_id`, `deals.owner_id`, `activities.deal_id`, `people.organization_id`) and every `deleted_at` filter column on deals/orgs/people/activities is index-backed via a single migration
  4. Application behavior is unchanged — the suite passes with no test modifications

**Plans**: 3 plans

Plans:
**Wave 1**

- [x] 33-01-PLAN.md — Capture the BEFORE EXPLAIN plans for both named queries and the empty catalog assertion, before any index DDL exists (D-07)

**Wave 2**

- [x] 33-02-PLAN.md — Declare all eleven plain single-column indexes in the four Drizzle schema files (D-06)

**Wave 3**

- [x] 33-03-PLAN.md — Generate and gate the single index migration, apply it, then capture the AFTER plans and close SC-1..SC-4

### Phase 34: Formula Reactivity

**Goal**: A formula field's stored value is correct everywhere it is read, not just where it is rendered
**Depends on**: Phase 32 (this is TDD-heavy against `formula-engine.test.ts`, the suite CI-03 repairs)
**Requirements**: FORMULA-01, FORMULA-02
**Success Criteria** (what must be TRUE):

  1. After saving an entity through the UI, a server action, or the REST API, a subsequent `GET` returns recomputed formula values without any page load having occurred
  2. A CSV export and a webhook payload produced right after a save carry the recalculated values
  3. A workflow condition evaluated against a formula field branches on the current value, not the value from the last page render
  4. Saving a field that no formula references triggers no recalculation — recalc is scoped to formulas whose source fields actually changed, so bulk saves do not fan out

**Plans**: 11 plans

Plans:
**Wave 1**

- [x] 34-01-PLAN.md — Prove server-side QuickJS works in the Docker standalone build and bound it (D-11)
- [x] 34-02-PLAN.md — Fix the silent `customFields` drop in all four mutations, with regression tests (D-12)

**Wave 2** *(blocked on Wave 1)*

- [x] 34-03-PLAN.md — `recalculateFormulas` single-entity core: scoping, seeding, unwrap, topological order, error persistence

**Wave 3** *(blocked on Wave 2)*

- [x] 34-04-PLAN.md — Bounded depth-1 cross-entity cascade with a 500-evaluation budget (D-03, D-04, D-09, D-13)
- [x] 34-05-PLAN.md — Fix the CSV `[object Object]` defect and normalise the workflow trigger envelope (D-16, SC-2, SC-3)

**Wave 4** *(blocked on Wave 3)*

- [x] 34-06-PLAN.md — Recalc before emit in the deal and activity write paths
- [x] 34-07-PLAN.md — Recalc before emit in the person and organization write paths
- [x] 34-08-PLAN.md — Recalc, diff and strip formula keys in the UI custom-field save path

**Wave 5** *(blocked on Wave 4)*

- [x] 34-09-PLAN.md — Recalc before emit in the six v1 deal and people routes
- [x] 34-10-PLAN.md — Bounded batch recalc for the CSV and Pipedrive importers

**Wave 6** *(blocked on Wave 5)*

- [x] 34-11-PLAN.md — Write-path coverage audit, Docker end-to-end verification, and limitations documentation

### Phase 35: Notes & Record Timeline

**Goal**: A record accumulates an attributed history of what people wrote about it instead of one overwritable text box
**Depends on**: Phase 32
**Requirements**: NOTE-01, NOTE-02, NOTE-03
**Success Criteria** (what must be TRUE):

  1. User adds several notes to a deal, organization, person, or activity and sees each one with its author and timestamp, with earlier notes intact
  2. User opens a record and sees one chronological timeline interleaving notes, activities, and stage changes
  3. After migration, every record that had `notes` text shows that text as its first timeline entry, attributed and dated
  4. Pre- and post-migration content reconciles — no record loses note text

**Plans**: 15 plans (9 waves)

Plans:
**Wave 1**

- [x] 35-01-PLAN.md — notes + deal_stage_history schema, relations and barrel (wave 1)
- [x] 35-02-PLAN.md — notes i18n namespace across three locales + locale parity gate (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 35-03-PLAN.md — migration 0013, idempotent legacy-notes data migration, SC-4 reconciliation [BLOCKING] (wave 2)
- [x] 35-04-PLAN.md — note mutation layer: create, edit, soft delete, parent-existence check (wave 2)
- [x] 35-05-PLAN.md — timeline entry union types + keyset cursor codec (wave 2)
- [x] 35-06-PLAN.md — deal.stage_changed subscriber persisting stage history (wave 2)
- [x] 35-07-PLAN.md — shared author-or-admin authorization helper (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 35-08-PLAN.md — pluggable sources + pre-limited UNION ALL timeline assembler (wave 3)
- [x] 35-10-PLAN.md — /api/v1 notes routes + OpenAPI and docs (wave 3)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 35-09-PLAN.md — note server actions: add, edit, delete, load more (wave 4)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 35-11-PLAN.md — composer, note row with inline edit, delete dialog (wave 5)

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 35-12-PLAN.md — activity and stage-change renderers, entry switch, empty state (wave 6)

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 35-13-PLAN.md — client timeline list with Load more + server card shell (wave 7)

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 35-14-PLAN.md — mount the timeline and delete the legacy block on four detail pages (wave 8)

**Wave 9** *(blocked on Wave 8 completion)*

- [x] 35-15-PLAN.md — legacy column dormancy across nine sites + browser verification (wave 9)

**UI hint**: yes

### Phase 36: Audit Log

**Goal**: Any change to a CRM record can be traced to who or what made it, and the table does not eat the disk
**Depends on**: Phase 35 (per-record history renders into the timeline built there); Phase 34 (formula recalcs are writes and must not flood the log with derived-value noise)
**Requirements**: AUDIT-01, AUDIT-02, AUDIT-03, AUDIT-04
**Success Criteria** (what must be TRUE):

  1. After a user edits a deal, that record's history shows the changed fields with before/after values and the user's name
  2. After a workflow CRM action edits a record, the record's history attributes the change to a workflow run, and the run detail page links to every record that run mutated
  3. Changes made via API key and via the Pipedrive importer are distinguishable by actor kind from user-made changes
  4. Admin sets an audit retention window and entries older than it disappear without manual intervention
  5. Audit capture required no edit to any mutation function — it subscribes to the existing `crmBus`

**Plans**: 20 plans in 6 waves

Plans:
**Wave 1**

- [x] 36-01-PLAN.md — AsyncLocalStorage actor context, db-free (AUDIT-02)
- [x] 36-02-PLAN.md — pure diff, key normalisation and formula exclusion; `CrmEventPayload.previous` (AUDIT-01)
- [x] 36-03-PLAN.md — `audit_log` + `app_settings` schema, four indexes, [BLOCKING] migration 0014, psql evidence script (AUDIT-01, AUDIT-04)
- [x] 36-04-PLAN.md — 79 copy keys in three locales + `REQUIRED_AUDIT_KEYS` parity gate (AUDIT-03, AUDIT-04)

**Wave 2** *(blocked on Wave 1)*

- [x] 36-05-PLAN.md — `api_key` and `workflow_run` actor boundaries; first `withApiAuth` test (AUDIT-02)
- [x] 36-06-PLAN.md — `user` actor at 15 server actions; `saveFieldValues` gains a real emit (AUDIT-01, AUDIT-02)
- [x] 36-07-PLAN.md — `previous` enrichment across the mutation layer and the three inline v1 routes (AUDIT-01)
- [x] 36-08-PLAN.md — fail-closed retention settings read/write + audit stats (AUDIT-04)
- [x] 36-09-PLAN.md — workflow-run linked-records reader (AUDIT-03)
- [x] 36-10-PLAN.md — pure audit value presentation + additive timeline types (AUDIT-01, AUDIT-03)

**Wave 3** *(blocked on Wave 2)*

- [x] 36-11-PLAN.md — the `crmBus` audit capture subscriber + instrumentation registration (AUDIT-01, AUDIT-02)
- [x] 36-12-PLAN.md — `import` actor at five importer entry points + one summary row per run (AUDIT-01, AUDIT-03)
- [x] 36-13-PLAN.md — `audit-entry.tsx`, the dispatcher branch and the timeline union join (AUDIT-01, AUDIT-03)
- [x] 36-14-PLAN.md — `/admin/audit` retention control, sidebar entry, dashboard tile (AUDIT-04)
- [x] 36-15-PLAN.md — read-only admin-only `GET /api/v1/audit` (AUDIT-03)
- [x] 36-16-PLAN.md — workflow run → records-changed section (AUDIT-03)

**Wave 4** *(blocked on Wave 3)*

- [x] 36-17-PLAN.md — `auditSource`, the assembler kind scope, and the eight `assemble.test.ts` assertions (AUDIT-03)
- [x] 36-18-PLAN.md — capped `ctid` retention pruner + instrumentation registration (AUDIT-04)

**Wave 5** *(blocked on Wave 4)*

- [x] 36-19-PLAN.md — the audit filter toggle, the cursor trap and the hidden-history empty state (AUDIT-03)

**Wave 6** *(blocked on Wave 5)*

- [x] 36-20-PLAN.md — SC-5 source gate, psql evidence, and the blocking browser verification (AUDIT-01..04)

**UI hint**: yes

### Phase 37: Trash & Restore

**Goal**: Soft-deleted records are recoverable rather than merely invisible
**Depends on**: Phase 36 (TRASH-01 shows who deleted a record, which the audit log supplies)
**Requirements**: TRASH-01, TRASH-02, TRASH-03
**Success Criteria** (what must be TRUE):

  1. User opens a trash view per entity type and sees soft-deleted records with deletion time and the actor who deleted them
  2. User restores a trashed record and finds it back in its list with its children reattached, including children orphaned when the parent was deleted
  3. Admin permanently purges a trashed record and it stops appearing anywhere in the app
  4. Records past the retention window leave trash automatically, with no admin action

**Plans**: 15 plans
**UI hint**: yes

Plans:
**Wave 1**

- [x] 37-01-PLAN.md — trash.retention_days settings module + seeded data-only migration
- [x] 37-02-PLAN.md — Pure trash vocabulary: closed ?type= parsers + the deleted-by presenter
- [x] 37-03-PLAN.md — 61 i18n keys across three locales + REQUIRED_TRASH_KEYS parity contract
- [x] 37-04-PLAN.md — Deal and activity restore + purge mutations (ordered transactional teardown)
- [x] 37-05-PLAN.md — Person and organization restore + purge mutations (two-child detach)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 37-06-PLAN.md — Restore/purge dispatch map over the four entity types
- [x] 37-07-PLAN.md — Trash read layer: owner-scoped counts and rows, batched deleted-by
- [x] 37-08-PLAN.md — /admin/trash retention page, form and admin-gated save action
- [x] 37-09-PLAN.md — Nav entries for /trash and /admin/trash + six delete-dialog copy corrections

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 37-10-PLAN.md — restoreRecord, restoreWithLinked and purgeRecord server actions
- [x] 37-11-PLAN.md — Daily trash retention pruner + instrumentation registration + Docker log gate
- [x] 37-12-PLAN.md — REST /api/v1/trash listing, restore and admin-gated purge

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 37-13-PLAN.md — trash-columns and trash-table client components + source-wiring gate

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 37-14-PLAN.md — /trash server page and the controlled tab bar

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 37-15-PLAN.md — scripts/trash-checks.sql, full phase gates and cross-surface UAT

### Phase 38: Bulk Operations

**Goal**: A user acts on many records at once without losing safety, attribution, or recoverability
**Depends on**: Phase 36 (bulk changes must land in the audit log), Phase 37 (bulk delete must be restorable, not a mass unrecoverable delete)
**Requirements**: BULK-01, BULK-02, BULK-03, BULK-04
**Success Criteria** (what must be TRUE):

  1. User selects rows via checkboxes on Organizations, People, Deals, and Activities lists, including select-all from the header
  2. User bulk deletes selected records after a count-aware confirmation, and finds those records in trash afterwards
  3. User bulk reassigns owner for selected records, and any per-record failure is named rather than silently swallowed
  4. User exports only the selected records to CSV, not the whole table
  5. Bulk deletes and reassignments appear in each affected record's change history

**Plans**: 20 plans in 6 waves
**UI hint**: yes

Plans:
**Wave 1**

- [x] 38-01-PLAN.md — the 44-key `bulk.*` copy contract in three locales + `REQUIRED_BULK_KEYS` (BULK-01..04)
- [x] 38-02-PLAN.md — `updateOrganizationOwnerMutation` + `updatePersonOwnerMutation` + the `buildChanges` ownerId gate (BULK-03)
- [x] 38-03-PLAN.md — `updateDealOwnerMutation` + `updateActivityOwnerMutation` + the `deal_assignees` regression gate (BULK-03)
- [x] 38-04-PLAN.md — `ExportFilters.ids` narrowing across all four fetchers + a live-database probe (BULK-04)
- [x] 38-05-PLAN.md — `checkbox.tsx` indeterminate branch + the 8-consumer safety gate (BULK-01)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 38-06-PLAN.md — `src/lib/bulk/{limits,types,dispatch}.ts` + the dispatch mis-wiring test (BULK-02, BULK-03)
- [x] 38-07-PLAN.md — the shared checkbox column: `buildSelectColumn` (pure) + `useSelectColumn` (BULK-01)
- [x] 38-08-PLAN.md — the bulk delete and reassign dialogs + their comment-stripped source gate (BULK-02, BULK-03)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 38-09-PLAN.md — the per-record failure report, uncapped and scroll-bounded (BULK-02, BULK-03)
- [x] 38-10-PLAN.md — the floating bulk action bar at `z-[60]`, its handlers and the CSV download (BULK-02..04)
- [x] 38-11-PLAN.md — Organizations bulk delete / reassign / scoped export + session-swapping suite (BULK-02..04)
- [x] 38-12-PLAN.md — People bulk delete / reassign / scoped export + session-swapping suite (BULK-02..04)
- [x] 38-13-PLAN.md — Deals bulk actions incl. the admin-bypass asymmetry and the no-email gate (BULK-02..04)
- [x] 38-14-PLAN.md — Activities bulk actions incl. the `assigneeId` boundary gate (BULK-02..04)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 38-15-PLAN.md — Organizations surface: rowSelection, select column, bar/spacer/report (BULK-01..04)
- [x] 38-16-PLAN.md — People surface, kept byte-identical to its Organizations twin (BULK-01..04)
- [x] 38-17-PLAN.md — Activities surface with `rowSelection` lifted to `ActivitiesClient` (BULK-01..04)
- [x] 38-18-PLAN.md — Deals kanban: card checkbox, per-stage capped select-all, board mount (BULK-01..04)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 38-19-PLAN.md — the cross-surface select-wiring gate + the phase-wide suite/typecheck/lint run (BULK-01..04)

**Wave 6** *(blocked on Wave 5 completion)*

- [ ] 38-20-PLAN.md — second approved user, live-database probes, and browser UAT across all four surfaces (BULK-01..04)

### Phase 39: Duplicate Detection & Merge

**Goal**: Duplicates entering through the importer or manual entry are caught and collapsible without data loss
**Depends on**: Phase 35 (DEDUP-03 must reassign notes, which only exist as child records after Phase 35), Phase 36 (a merge is destructive and must be auditable)
**Requirements**: DEDUP-01, DEDUP-02, DEDUP-03
**Success Criteria** (what must be TRUE):

  1. Creating an organization or person whose details match an existing record warns the user before the record is saved
  2. User scans an entity type on demand and gets a list of likely duplicate pairs
  3. User merges two records, choosing the winning value field by field for every conflict
  4. After a merge, every deal, activity, note, file, and custom field value from the losing record is attached to the survivor — nothing is orphaned
  5. The merge is visible in the surviving record's change history

**Plans**: TBD
**UI hint**: yes

### Phase 40: Saved Views & Shared Filters

**Goal**: The filter combinations users rebuild daily become named, shareable, exportable objects
**Depends on**: Phase 32
**Requirements**: VIEW-01, VIEW-02, VIEW-03
**Success Criteria** (what must be TRUE):

  1. User saves the current filter set on a list page as a named view and reopens it later with the filters restored
  2. User marks a view shared and a teammate sees it; a private view stays invisible to everyone else
  3. User sets a default view per entity type and lands on it when opening that list
  4. User exports the records matching a saved view

**Plans**: TBD
**UI hint**: yes

### Phase 41: Workflow Operator Affordances

**Goal**: A failed or unproven workflow has a recovery path that does not require re-triggering by hand
**Depends on**: Phase 32 (CI-03 repairs the workflow mutation test that guards the cascade-delete path this phase builds on)
**Requirements**: WFOPS-01, WFOPS-02, WFOPS-03, WFOPS-04
**Success Criteria** (what must be TRUE):

  1. User re-runs a failed workflow run from its detail page and gets a new run with its own step history
  2. User dry-runs a workflow from the editor against sample trigger data, sees per-node output, and can confirm no CRM record changed
  3. When a run fails, the user is notified rather than discovering it by browsing run history
  4. Deployment docs state the webhook-response single-instance constraint and which engine components are already multi-instance safe

**Plans**: TBD
**UI hint**: yes

### Phase 42: Observability

**Goal**: A production failure is detectable from an endpoint and a log stream, not from grepping container stdout months later
**Depends on**: Nothing (cross-cutting, independent of the CRM feature phases)
**Requirements**: OBS-01, OBS-02, OBS-03
**Success Criteria** (what must be TRUE):

  1. Application logs are structured and level-controlled; no bare `console.*` calls remain in non-test source
  2. With the error-tracking env var unset nothing leaves the deployment; with it set, an unhandled server error appears in the tracker
  3. `/api/health` reports database connectivity plus the liveness of all four background processors, so a dead `register()` is visible from the endpoint alone

**Plans**: TBD

### Phase 43: Type Safety & Deployment Docs

**Goal**: No standing type suppressions, and a self-hoster can recover their data
**Depends on**: Phase 38 — but the anticipated file collision was DESIGNED OUT during Phase 38 planning: 38-UI-SPEC § Surface 1 puts the bulk checkbox column in a shared `src/components/bulk/select-column.tsx` consumed inside each table's client component, so `organizations/columns.tsx` and `people/columns.tsx` are explicitly NOT edited by Phase 38 and POLISH-01's retype has no merge surface with it. The dependency is retained only as an ordering preference, not a blocker.
**Requirements**: POLISH-01, POLISH-02
**Success Criteria** (what must be TRUE):

  1. `tsc --noEmit` passes and the codebase contains zero `@ts-expect-error` suppressions
  2. Table meta callbacks across pipelines, organizations, and people columns are typed through one shared `TableMeta` interface
  3. Operator follows documented steps to back up and restore a self-hosted deployment, with the restore exercised at least once against a real dump

**Plans**: TBD

### Phase 44: Custom Field UI Repair

**Goal**: An admin can create a custom field on any entity — Deals included — and a formula's displayed value always agrees with its stored value
**Depends on**: Phase 34 (this repairs the UI surface over the recalculation engine Phase 34 shipped; no other phase touches these files)
**Requirements**: CFUI-01, CFUI-02, CFUI-03, CFUI-04, CFUI-05
**Source**: 2026-08-15 browser E2E pass over the completed v1.3 phases — see `34-VERIFICATION.md` § Browser E2E Amendment. Backlog 999.25, 999.26, 999.27. Mechanism proven in `44-RESEARCH.md`; scope locked in `44-CONTEXT.md` § Scope Decisions.
**Success Criteria** (what must be TRUE):

  1. The "Add Field" trigger renders on `/admin/fields/deal` (155 definitions) and an admin can create a field there — verified in a browser against the live dataset, not only in a unit test
  2. The trigger still renders on person, organization and activity, and the formula editor's field-reference chips still work on all four
  3. After editing a formula's source field on a freshly loaded record page, the rendered formula value equals the value stored in Postgres, with no reload
  4. A formula whose sources are unset renders blank rather than `#ERROR — Unknown field: X`, on a record whose `custom_fields` is `{}`
  5. A **real Flight round-trip** regression gate fails if a React element is ever again passed across the RSC boundary into an `asChild` slot alongside a growable data prop — asserting on the serializer's own output, not on a mock
  6. No React element crosses the server→client boundary at the repaired call site — the fix is structural (client `AddFieldButton` wrapper), and remains correct at any definition count
  7. A formula on an activity resolves native activity fields (CFUI-04), and the client evaluator applies the server's QuickJS resource bounds (CFUI-05)

**Plans**: 9 plans

Plans:
**Wave 1** *(scaffolding and independent fixes — fully parallel, zero file overlap)*

- [x] 44-01-PLAN.md — Add the react-server vitest project and the real Flight round-trip gate, plus the Radix `asChild` silent-null mechanism test (CFUI-01)
- [x] 44-02-PLAN.md — Return `recalculateFormulas`' recomputed blob from `saveFieldValues`, preserving D-05 and the wrapper strip (CFUI-02)
- [x] 44-03-PLAN.md — Extract `buildClientFieldValues` and assert its parity with the server's `buildFormulaFieldValues` seeding (CFUI-03)
- [x] 44-04-PLAN.md — Pass `entityAttributes` from the activity page and bound both browser evaluator call sites with the server's QuickJS limits (CFUI-04, CFUI-05)
- [x] 44-05-PLAN.md — Dev-only loud guard when `FieldDialog` receives a non-element child (CFUI-01, D-44-03)

**Wave 2** *(blocked on Wave 1)*

- [x] 44-06-PLAN.md — Structural CFUI-01 repair: `AddFieldButton`/`RestoreFieldButton` client wrappers, plus a repo-wide gate on the whole bug class (CFUI-01, D-44-01)
- [x] 44-07-PLAN.md — Wire `CustomFieldsSection` to the seeded map and to the server's returned values (CFUI-02, CFUI-03)

**Wave 3** *(blocked on Wave 2)*

- [x] 44-08-PLAN.md — Slim `availableFields` contract and single projected row array, shipped and measured as a payload optimisation, not as the repair (CFUI-01, D-44-02)

**Wave 4** *(blocked on Wave 3)*

- [ ] 44-09-PLAN.md — Rebuild, run every gate, and close the four manual browser verifications against the live 155-definition dataset (CFUI-01..05)

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 32. Test Infrastructure & CI | 6/6 | Complete   | 2026-08-14 |
| 33. Database Indexes for the CRM Core | 3/3 | Complete   | 2026-08-14 |
| 34. Formula Reactivity | 13/13 | Complete   | 2026-08-15 |
| 35. Notes & Record Timeline | 15/15 | Complete   | 2026-08-15 |
| 36. Audit Log | 20/20 | Complete   | 2026-08-16 |
| 37. Trash & Restore | 15/15 | Complete   | 2026-08-17 |
| 38. Bulk Operations | 19/20 | In Progress|  |
| 39. Duplicate Detection & Merge | 0/? | Not started | - |
| 40. Saved Views & Shared Filters | 0/? | Not started | - |
| 41. Workflow Operator Affordances | 0/? | Not started | - |
| 42. Observability | 0/? | Not started | - |
| 43. Type Safety & Deployment Docs | 0/? | Not started | - |
| 44. Custom Field UI Repair | 9/9 | Complete   | 2026-08-15 |

## Backlog

Unsequenced items awaiting a milestone. Promote with `/gsd:review-backlog` when ready.

**999.13 — Proper fix for the five React Compiler lint findings** (captured 2026-08-14, Phase 32)
Phase 32 suppressed five `react-hooks/*` errors with scoped `// eslint-disable-next-line <rule> -- <reason>`
comments per D-02. The rules remain at `error` severity project-wide, so a sixth occurrence still fails CI —
but these five need a real refactor in a UI-focused phase that has UI test coverage (per 32-CONTEXT.md
§ Deferred Ideas). Full written justification for each is in `32-04-SUMMARY.md` § Suppression Register:

| # | File:Line | Rule |
|---|-----------|------|
| 1 | `src/app/(auth)/reset-password/page.tsx:42` | `react-hooks/set-state-in-effect` |
| 2 | `src/app/(auth)/verify-email/page.tsx:20` | `react-hooks/immutability` |
| 3 | `src/app/settings/profile/profile-settings-form.tsx:38` | `react-hooks/set-state-in-effect` |
| 4 | `src/components/ui/relative-time.tsx:17` | `react-hooks/set-state-in-effect` |
| 5 | `src/app/import/import-wizard.tsx:91` | `react-hooks/preserve-manual-memoization` |

Each is behaviour-adjacent (auth error UX, single-use token fetch, hydration guard, wizard step
transitions), which is why none was mechanically "fixed" inside an infrastructure phase.
Grep the live set with `grep -rn 'eslint-disable-next-line react-hooks/' src/`.

**999.14 — Dockerfile pins `node:20-alpine`, below vite 7's engines floor** (captured 2026-08-14, Phase 32)
`vite@7.3.1` declares `engines: ^20.19.0 || >=22.12.0`, reached transitively via vitest. The image tag
currently resolves to something >= 20.19 (the container builds today), so this is latent rather than broken.
CI pins Node 24 and does not inherit the Dockerfile's tag. Resolution: raise the base image, or pin the
patch explicitly so a future `node:20-alpine` rebuild cannot drift below the floor.
Source: `32-RESEARCH.md` Open Question 4 / Pitfall 6.

**999.15 — `GET /api/v1/stages/:id` returns 403 to the legitimate owner** (captured 2026-08-14, Phase 32)
The ownership check reads `stage.pipeline`, which is only loaded when `?expand=pipeline` is passed, so a
request without that query parameter fails authorization for the resource owner. Found by plan 32-03 and
deliberately left unchanged there because T-32-10 required that plan's typing work to be behaviour-neutral.
This is a real pre-existing auth bug, not a typing artifact — fixing it changes runtime behaviour and needs
its own test. See `32-03-SUMMARY.md` § Decisions Made.

**999.16 — 39 npm advisories in the committed lockfile** (captured 2026-08-14, Phase 32)
`npm ci` reports 39 vulnerabilities (3 low, 9 moderate, 23 high, 4 critical). CI-04 does not ask for an
audit gate, and adding `npm audit --audit-level=high` to `ci.yml` would make the required check red on day
one, so it was deliberately not bolted on. Resolution: triage the criticals/highs, then decide whether an
audit step or a `.npmrc` audit policy belongs in CI.

**999.17 — SECURITY: `/api/v1/activities` has no ownership check (IDOR)** (captured 2026-08-14, Phase 32)
`src/app/api/v1/activities/[id]/route.ts` GET/PUT/DELETE and `src/app/api/v1/activities/route.ts` GET
perform **no ownership check at all**. Any valid API key can read (`[id]:80-116`), modify
(`[id]:126-216`, **including reassigning `owner_id`**) or soft-delete (`[id]:226-237`) *any* user's
activity by id, and the list endpoint returns every user's activities. Compare `pipelines/[id]`,
which does check `ownerId`. Pre-existing — Phase 32's diff only retyped `withOptions` — but surfaced
by the Phase 32 code review, and **more severe than anything found in the phase itself**. These six
route files have zero test coverage, so add tests with the fix. Prioritise ahead of the cosmetic
backlog items. See `32-REVIEW.md` § "Pre-existing, out of diff scope".

**999.18 — `stages/route.ts` passes a JS array into a raw `sql` fragment** (captured 2026-08-14, Phase 32)
`src/app/api/v1/stages/route.ts:73` uses ``sql`${pipelines.id} IN ${pipelineIds}` `` instead of
`inArray()`. Unreachable with an empty array today (guarded by `stageList` being non-empty) but
fragile — a future refactor removing that guard changes it from awkward to broken. Mechanical fix.

**999.19 — Pipedrive importer hardcodes stage type `"open"`** (captured 2026-08-14, Phase 32)
`src/lib/import/pipedrive-api-transformers.ts:164-167` reads
`const type: "open" | "won" | "lost" = "open"` under a comment promising "Determine stage type based
on `rotten_flag` and `deal_probability`". The won/lost mapping was never implemented; Phase 32's
`let`→`const` change (L-06) removed the last hint that it is a placeholder. Deliberately deferred
from the Phase 32 fix pass — it is a product decision about Pipedrive stage mapping, not a
regression. Address alongside the import wizard's terminal-stage handling.

**999.20 — `npm run db:migrate` cannot reach the DB from the host** (captured 2026-08-14, Phase 33)
`drizzle.config.ts` reads `DATABASE_URL`. `.env` sets it to `postgres:5432` (the Docker-network hostname —
unresolvable from the host, fails `EAI_AGAIN`) and `.env.local` sets it to `localhost:5432` — the **wrong
port**, since Postgres publishes on **5433**. So the documented migrate command fails from the host and has
to be run with an inline `DATABASE_URL` override. Phase 33 worked around it without editing a tracked file.
Fix: point `.env.local` at `localhost:5433`. This will bite every future phase that runs a migration
(34, 35, 36, 37, 39, 40 all add schema). Cheap fix, high recurring cost if left.

**999.28 — `condition-evaluator` linearity gate is contention-flaky** (captured 2026-08-15, Phase 44)
`src/lib/execution/condition-evaluator.test.ts` › "resolveFieldPath — parsing is linear, not backtracking"
(Phase 34 **T-34-20**) asserts a **wall-clock ratio**, so it misfires whenever the machine is loaded. It
failed twice during Phase 44's parallel waves — once reported as `25.5 < 10` — while passing 70/70 in
isolation and in every serial run.

Not introduced by Phase 44 and deliberately not fixed there (editing a Phase 34 test from inside another
phase hides the signal). But a timing-ratio assertion is a false-failure generator in any parallel
execution, and a suite that cries wolf is how the three defects this phase repaired stayed invisible in the
first place. Fix: assert on operation **counts** or algorithmic shape rather than elapsed time, or mark it
serial-only.

**999.25, 999.26, 999.27 — PROMOTED to Phase 44 (2026-08-15)** (captured 2026-08-15, E2E verification of v1.3)
Three custom-field UI defects found by the browser end-to-end pass over the completed v1.3 phases:
999.25 (BLOCKER — no UI path to add a custom field to Deals), 999.26 (formula display one save behind),
999.27 (`#ERROR — Unknown field` on unset sources). Promoted together as **Phase 44: Custom Field UI
Repair** → requirements CFUI-01/02/03. Full diagnosis, reproduction steps and the
already-proven-working baseline live in `.planning/phases/44-custom-field-ui-repair/44-CONTEXT.md`.

**999.24 — RESOLVED (Phase 34, plan 34-13) — CSV export silently drops ALL custom-field columns** (captured 2026-08-14, Phase 34)
> Closed by `deriveCsvColumns` (`src/lib/export/csv-columns.ts`), which unions keys across all rows.
> Verified live 2026-08-15 on a 38,345-row People CSV export: 8 `custom_*` columns present,
> `custom_GSD Doubled = 100` carried correctly with row 1 blank for that column (the exact failure mode),
> and zero `[object Object]` in the file. Retained here for history.

`exportToCSV` calls `Papa.unparse(data, { header: true })`, and papaparse derives the header row from the
**first object only**. Any key absent from row 1 is omitted for every row. Measured on the live data: a
46,055-row organization export produced **zero `custom_*` columns**, even though **30,264 rows carry custom
field values**. Users exporting their CRM are silently losing every custom field unless the very first row
happens to populate them.

Pre-existing and affects **all** custom fields, not just formulas — Phase 34 did not cause it. But it means
Phase 34's SC-2 CSV half is **not observable on this dataset**: the unwrapping logic is correct (proven via
the JSON export, which shares `flattenCustomFields`), yet the columns never reach the file. Fix: compute the
header as the union of keys across all rows, or pass an explicit `columns` list to `unparse`. This is
arguably the most user-visible defect found in the milestone so far. See `34-11-SUMMARY.md`.

**999.23 — POST responses echo pre-recalculation formula values** (captured 2026-08-14, Phase 34)
The create mutations return the raw `.returning()` row, so a `POST /api/v1/{organizations,people,deals,activities}`
201 body carries the **un-computed** custom-field blob. The stored value, the emitted `crmBus` event and any
subsequent `GET` are all correct — only the create response is stale, and `PUT` has no such gap.

SC-1 is therefore satisfied ("a subsequent GET returns recomputed values"), which is why Phase 34 did not
chase it: folding the recalc into the return value would break two plan 34-02 assertions that compare the
result against a fixture, and weakening existing tests was forbidden. But it leaves an API inconsistency —
a client that trusts the 201 body sees different data than the same client re-reading the record. Decide
once for all four entities. See `34-07-SUMMARY.md`.

**999.22 — Condition builder UI has no field picker for bracket paths** (captured 2026-08-14, Phase 34)
Phase 34 plan 34-12 made `resolveFieldPath` accept bracket-quoted segments, so a workflow condition can now
reach `customFields["Previsão de início operação"]`. But the condition builder UI offers no picker that
emits that syntax — an operator has to hand-type both the bracket form and the exact accented field name,
with no autocomplete and no validation. So the capability exists at the engine level while remaining
effectively undiscoverable in the product. A field picker that emits the correct path is what stands
between the fix and it being usable without documentation. Pairs with 999.21.

Also from 34-12: **escaping is unsupported inside brackets** — a name containing the same quote character
used to delimit it stops the parser at the first match. The other quote style works around it; a name
containing *both* quote characters is unaddressable. None of the 169 live definitions hit this today.

**999.21 — Workflow conditions cannot address 90% of custom fields — ENGINE FIXED in Phase 34 (34-12), UI GAP REMAINS** (captured 2026-08-14, Phase 34)
`resolveFieldPath` splits a condition's field path on `.`, so any custom field whose **name contains a
space or punctuation is unreachable from a workflow condition**. Measured against the live DB:
**152 of 169 definitions (90%)** are affected — this dataset's field names are predominantly Portuguese
with spaces and punctuation (`Código Mãe`, `Previsão de início operação`, `CNPJ / CPF`,
`UUID UC (TYR Core)`, `Tem solução de solar?`).

Pre-existing and affects **all** custom fields, not just formula fields — Phase 34 did not introduce it and
explicitly scoped it out. But it materially limits Phase 34's SC-3: the formula value now normalises
correctly into the trigger envelope, yet in practice a workflow condition can only reach a formula field
whose name is a simple identifier. Fix needs a quoting/escaping syntax or an id-based field reference.
Worth prioritising — it silently makes a headline feature inapplicable to most of the real data.
See `34-05-SUMMARY.md`.

---

All 12 original backlog items (999.1-999.12, captured 2026-08-12 and 2026-08-13) were promoted
into v1.3 on 2026-08-13 and now live as Phases 32-43 above:

| Backlog item | Now |
|--------------|-----|
| 999.1 Formula reactivity | Phase 34 |
| 999.2 Bulk operations | Phase 38 |
| 999.3 Test infrastructure & CI | Phase 32 |
| 999.4 Database indexes | Phase 33 |
| 999.5 Notes & activity timeline | Phase 35 |
| 999.6 Audit log | Phase 36 |
| 999.7 Duplicate detection & merge | Phase 39 |
| 999.8 Saved views & shared filters | Phase 40 |
| 999.9 Trash & restore | Phase 37 |
| 999.10 Workflow operator affordances | Phase 41 |
| 999.11 Observability | Phase 42 |
| 999.12 Type-safety & deployment-docs polish | Phase 43 |

The evidence captured with each backlog item is preserved in the v1.3 requirement text
(`.planning/REQUIREMENTS.md`) — each category there names its originating backlog item.

### Phase 45: Cross-Cutting UI Repair and UAT Closure

**Goal**: The app is usable on a phone, its shipped dark theme can actually be turned on, its admin shell speaks the user's language, and no bulk message tells the user something untrue
**Depends on**: Nothing. Every item is app-wide or already-shipped code; none of it belongs to Phases 39-43, and none of them touch these files. Sequence it whenever convenient — it is deliberately schedulable in parallel with the remaining feature phases.
**Requirements**: Derived from browser UAT rather than the requirements register — see 36-HUMAN-UAT.md, 37-UAT.md (G5, G6) and 38-UAT.md
**Success Criteria** (what must be TRUE):

  1. No route has a horizontal page scrollbar at a 320px viewport — measured as `document.scrollWidth <= document.clientWidth` on /organizations, /people, /deals, /activities, /trash and /admin/audit, in all three locales
  2. A user can switch to dark mode from the UI and the choice survives a reload
  3. The admin shell renders in the active locale — no hardcoded English strings in the sidebar or in the dialog close controls
  4. No bulk message asserts a selection state that is not true
  5. The deals-kanban drag-with-selection check is either verified or converted into an automated test that can actually drive it

**Origin**: Every item was found by re-running the outstanding Phase 36-38 human UAT in a real authenticated browser on 2026-08-18. That session closed 9 of 10 debt items; these five are what it found still broken, plus the one item it could not drive. None was introduced by Phases 36-38 — items 1-3 predate them and are app-wide, which is exactly why they are collected here instead of being retro-fitted into a shipped phase.

**Scope** (five items, each independently shippable):

  1. **Header overflow at 320px** — `src/components/nav-header.tsx`. The search input carries `min-w-0 w-xs w-64`; `w-64` wins and pins it to a computed 256px, and its wrapper is a bare `div.relative` with no shrink allowance, so 256 + 16 (`gap-4`) + 40 (avatar) = 312px of non-shrinkable content inside a 305px client width. Measured `document.scrollWidth` 416 vs 305 on every route. Candidate fix: `w-full max-w-64 min-w-0` on the input with `min-w-0 flex-1` on the wrapper, or collapse the search to an icon below `sm`. Tracked as 37-UAT G5. Note 37-UAT already fixed the *other* half of this (the trash tablist, G3) — the header is the untouched remainder.
  2. **Admin layout does not collapse at mobile** — `src/app/admin/layout.tsx`. The sidebar rail stays full width, pushing `<main>` to start at x≈206px. `/admin/audit` measures `scrollWidth` 508 in pt-BR and **526 in es-ES** — it degrades further with longer translations, which is the specific failure mode the Phase 36 UAT item was written to catch. Needs a drawer or collapse below `sm`.
  3. **Dark mode is unreachable** — `src/app/layout.tsx` renders a bare `<html lang={locale}>`, mounts no `ThemeProvider`, and no toggle or `setTheme` call exists anywhere in the codebase. The theme itself is complete and correct: `globals.css` defines `@custom-variant dark` plus a full `.dark` token block, 69 `dark:` utilities are in use, and forcing the class at runtime flips `body` from `lab(100 0 0)` to `lab(2.75381 0 0)` correctly. The only `next-themes` import in the repo is inside `sonner.tsx`, whose `useTheme()` therefore always reads the default. Mount a provider, add a toggle, persist the choice. Tracked as 37-UAT G6. **This one is load-bearing for verification**: while it is broken, every "check it in dark mode" UAT item in the project is unverifiable as a real user state.
  4. **Untranslated shell strings** — two separate leaks, both visible in pt-BR and es-ES. The whole admin sidebar is hardcoded English ("Admin Panel, Dashboard, User Management, Pipelines, Custom Fields, Webhooks, Audit Log, Trash, Export Data, Pipedrive Import, Back to App"), and the Radix dialog close button's sr-only label renders as "Close" in every locale (`ui/dialog.tsx`, `ui/alert-dialog.tsx`). A third, smaller one: the record timeline prints the raw DB column name "Deleted at" as a field label next to a raw ISO timestamp, where the delete entry beside it gets a proper sentence.
  5. **Bulk failure panel states something false** — `src/components/bulk/bulk-failure-report.tsx`. It renders "these records are still selected — fix the problem and try again" unconditionally, but the bar prunes its selection to rendered ids, so for the `no longer exists` reason code the failed rows have left the table and the selection is empty. Observed live: 0 checked, bar unmounted, panel still instructing a retry. This is not an artefact of the forced test — it is exactly what happens when another user deletes the records concurrently. Either keep failed ids selected when their rows are gone, or make the copy conditional on what survived the prune. Tracked as a 38-UAT gap (major).

**Carried-over verification** (not a fix — the one item the 2026-08-18 sweep could not close):

  - Deals kanban: drag a card by its body while another card is checked. Playwright's `browser_drag` times out on mouse-up because dnd-kit's pointer sensor needs an activation constraint (distance/delay plus intermediate `pointermove`) that a simple move-and-up does not satisfy. Synthetic pointer events were deliberately refused as evidence, because regression G1 in that same session proved synthetic dispatch hides a real defect on this exact component. Close it with a human at a real mouse, or by adding an e2e runner that can emit a held pointer sequence — the latter would also give the repo somewhere to pin G1's behaviour, which no current test can defend.

**Plans:** 6/11 plans executed

Plans:
- [x] 45-01-PLAN.md — 22 message keys x 3 locales + the locale-parity contract lists that gate them
- [x] 45-02-PLAN.md — Playwright harness: devDependency, config, e2e admin seed, authenticated storageState, ignore-file entries
- [x] 45-03-PLAN.md — ThemeProvider mounted, three-way light/dark/system toggle in UserMenu, C-1 destructive-token repair
- [x] 45-04-PLAN.md — dialog.tsx close labels from common.close (both sites) + the new sheet.tsx, translated at creation
- [x] 45-05-PLAN.md — bulk failure panel: three truth-conditional branches + all four callers passing the surviving count
- [ ] 45-06-PLAN.md — timeline deletedAt becomes a translated direction sentence; NATIVE_ORDER order guard
- [x] 45-07-PLAN.md — CommandDialog forwards shouldFilter/loop; the search results tree lifted into SearchResults
- [ ] 45-08-PLAN.md — the three e2e specs (viewport-320 proven RED, deals-drag, theme)
- [ ] 45-09-PLAN.md — admin shell: translated sidebar, one shared item renderer, Sheet drawer below md, min-w-0 content column
- [ ] 45-10-PLAN.md — header collapse below md, mobile search dialog, min-w-0 on both clusters, t("workflows")
- [ ] 45-11-PLAN.md — the single Docker rebuild, the full e2e run, and the human dark-palette walk

---
*Roadmap updated: 2026-08-18 -- Phase 45 planned (11 plans, 4 waves); UI edits batched so the Docker rebuild is paid once, in the final wave*
*Roadmap updated: 2026-08-18 -- Phase 45 added (Cross-Cutting UI Repair and UAT Closure), collecting the five app-wide defects found when the outstanding Phase 36-38 human UAT was re-run in a real authenticated browser; depends on nothing and can run in parallel with Phases 39-43*
*Roadmap updated: 2026-08-17 -- Phase 38 planned (20 plans, 6 waves); the anticipated Phase 43 collision on `organizations/columns.tsx` and `people/columns.tsx` was designed out*
