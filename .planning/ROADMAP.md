# Roadmap: Pipelite

## Milestones

- ✅ **v1.0 MVP** -- Phases 1-16 (shipped 2026-03-14)
- ✅ **v1.1 Reliability & Operations** -- Phases 17-20, 23 (shipped 2026-03-26)
- ✅ **v1.2 Workflows** -- Phases 24-31 (shipped 2026-03-28)
- 🚧 **v1.3 Foundation & CRM Depth** -- Phases 32-43 (in progress)

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

### v1.3 Foundation & CRM Depth (Phases 32-43)

- [ ] **Phase 32: Test Infrastructure & CI** - Green suite, one command to run it, and a merge gate that keeps it green
- [ ] **Phase 33: Database Indexes for the CRM Core** - Index the foreign keys and hot filter columns the v1.0 tables never got
- [ ] **Phase 34: Formula Reactivity** - Server-side, dependency-aware recalc so stored formula values stop going stale
- [ ] **Phase 35: Notes & Record Timeline** - Append-only attributed notes plus one chronological timeline per record
- [ ] **Phase 36: Audit Log** - Field-level change history with actor kind, fed by crmBus, with retention
- [ ] **Phase 37: Trash & Restore** - Make soft-deleted records visible, restorable, and eventually purged
- [ ] **Phase 38: Bulk Operations** - Multi-select with bulk delete, owner reassignment, and scoped export
- [ ] **Phase 39: Duplicate Detection & Merge** - Warn on likely duplicates and merge without orphaning children
- [ ] **Phase 40: Saved Views & Shared Filters** - Persist, share, default, and export named filter sets
- [ ] **Phase 41: Workflow Operator Affordances** - Replay, dry-run, failure alerting, and the single-instance constraint documented
- [ ] **Phase 42: Observability** - Structured logging, opt-in error tracking, and a health endpoint that sees the processors
- [ ] **Phase 43: Type Safety & Deployment Docs** - Clear the 14 type suppressions and document backup/restore

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

- [ ] 32-02-PLAN.md — Fix the `LOGIC.isBlank` source bug, repair the stale `deleteWorkflow` mock, and cover the cascade branch (CI-03)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 32-05-PLAN.md — Prove all gates green from a clean checkout, ship `.github/workflows/ci.yml`, document the merge gate (CI-04)

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 32-06-PLAN.md — Run CI once on master, create the `master` ruleset requiring the `ci` check, prove a broken PR is blocked (CI-04)

### Phase 33: Database Indexes for the CRM Core

**Goal**: The v1.0 CRM tables stop sequential-scanning on their hottest queries
**Depends on**: Nothing (schema-only, independent of every other phase)
**Requirements**: PERF-01, PERF-02
**Success Criteria** (what must be TRUE):

  1. `EXPLAIN ANALYZE` on the kanban board query shows an index scan on `deals.stage_id` where it previously showed a sequential scan
  2. `EXPLAIN ANALYZE` on the activity-reminder cron query shows an index scan on `activities.due_date`
  3. Every core CRM foreign key (`deals.organization_id`, `deals.person_id`, `deals.owner_id`, `activities.deal_id`, `people.organization_id`) and every `deleted_at` filter column on deals/orgs/people/activities is index-backed via a single migration
  4. Application behavior is unchanged — the suite passes with no test modifications

**Plans**: TBD

### Phase 34: Formula Reactivity

**Goal**: A formula field's stored value is correct everywhere it is read, not just where it is rendered
**Depends on**: Phase 32 (this is TDD-heavy against `formula-engine.test.ts`, the suite CI-03 repairs)
**Requirements**: FORMULA-01, FORMULA-02
**Success Criteria** (what must be TRUE):

  1. After saving an entity through the UI, a server action, or the REST API, a subsequent `GET` returns recomputed formula values without any page load having occurred
  2. A CSV export and a webhook payload produced right after a save carry the recalculated values
  3. A workflow condition evaluated against a formula field branches on the current value, not the value from the last page render
  4. Saving a field that no formula references triggers no recalculation — recalc is scoped to formulas whose source fields actually changed, so bulk saves do not fan out

**Plans**: TBD

### Phase 35: Notes & Record Timeline

**Goal**: A record accumulates an attributed history of what people wrote about it instead of one overwritable text box
**Depends on**: Phase 32
**Requirements**: NOTE-01, NOTE-02, NOTE-03
**Success Criteria** (what must be TRUE):

  1. User adds several notes to a deal, organization, person, or activity and sees each one with its author and timestamp, with earlier notes intact
  2. User opens a record and sees one chronological timeline interleaving notes, activities, and stage changes
  3. After migration, every record that had `notes` text shows that text as its first timeline entry, attributed and dated
  4. Pre- and post-migration content reconciles — no record loses note text

**Plans**: TBD
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

**Plans**: TBD
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

**Plans**: TBD
**UI hint**: yes

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

**Plans**: TBD
**UI hint**: yes

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
**Depends on**: Phase 38 (BULK-01 adds a checkbox column to the same `organizations/columns.tsx` and `people/columns.tsx` files POLISH-01 retypes)
**Requirements**: POLISH-01, POLISH-02
**Success Criteria** (what must be TRUE):

  1. `tsc --noEmit` passes and the codebase contains zero `@ts-expect-error` suppressions
  2. Table meta callbacks across pipelines, organizations, and people columns are typed through one shared `TableMeta` interface
  3. Operator follows documented steps to back up and restore a self-hosted deployment, with the restore exercised at least once against a real dump

**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 32. Test Infrastructure & CI | 3/6 | In Progress|  |
| 33. Database Indexes for the CRM Core | 0/? | Not started | - |
| 34. Formula Reactivity | 0/? | Not started | - |
| 35. Notes & Record Timeline | 0/? | Not started | - |
| 36. Audit Log | 0/? | Not started | - |
| 37. Trash & Restore | 0/? | Not started | - |
| 38. Bulk Operations | 0/? | Not started | - |
| 39. Duplicate Detection & Merge | 0/? | Not started | - |
| 40. Saved Views & Shared Filters | 0/? | Not started | - |
| 41. Workflow Operator Affordances | 0/? | Not started | - |
| 42. Observability | 0/? | Not started | - |
| 43. Type Safety & Deployment Docs | 0/? | Not started | - |

## Backlog

Unsequenced items awaiting a milestone. Promote with `/gsd:review-backlog` when ready.

_Empty._ All 12 backlog items (999.1-999.12, captured 2026-08-12 and 2026-08-13) were promoted
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

---
*Roadmap updated: 2026-08-13 -- v1.3 roadmapped as Phases 32-43, all 12 backlog items promoted*
