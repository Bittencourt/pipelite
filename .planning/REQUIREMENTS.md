# Requirements: Pipelite — v1.3 Foundation & CRM Depth

**Defined:** 2026-08-13
**Core Value:** API-complete CRM core that handles fundamentals well

Requirements derive from the post-v1.2 codebase review (2026-08-13), captured as backlog
items 999.1–999.12 in ROADMAP.md. Each category below names its originating backlog item so
the motivating evidence stays one hop away.

## v1.3 Requirements

### Test Infrastructure & CI (999.3)

- [x] **CI-01**: Developer can run the full test suite with `npm test` — no such script exists today, the suite is only reachable via `npx vitest`
- [x] **CI-02**: Test runs collect only source tests — `vitest.config.ts` excludes `.next/**` and `node_modules/**`, so the stale copy at `.next/standalone/src/lib/formula-engine.test.ts` stops being run as a second suite
- [x] **CI-03**: The full suite passes clean — fixes `mutations/workflows.test.ts > deleteWorkflow` (stale mock; cascade delete grew a `db.select` the mock chain does not supply, `workflows.ts:202`) and `formula-engine.test.ts > LOGIC.isBlank` (returns null, expects true)
- [x] **CI-04**: Every push and pull request runs `tsc --noEmit`, `eslint`, and the test suite in CI, and a failing check blocks merge

### Database Performance (999.4)

- [ ] **PERF-01**: Core CRM foreign keys and hot filter columns are indexed — `deals.stage_id`, `deals.deleted_at`, `deals.organization_id`, `deals.person_id`, `deals.owner_id`, `activities.due_date`, `activities.deal_id`, `people.organization_id`, and the `deleted_at` columns on orgs/people/activities
- [ ] **PERF-02**: The kanban board query and the activity-reminder cron query use index scans rather than sequential scans, confirmed by `EXPLAIN ANALYZE` before and after

### Formula Reactivity (999.1 — carried from v1.1)

- [ ] **FORMULA-01**: Formula field values are recalculated server-side when any entity field is saved, so stored JSONB values are correct in API responses, CSV exports, webhook payloads, and workflow condition evaluation
- [ ] **FORMULA-02**: Formula recalculation only runs for formulas whose referenced source fields actually changed (dependency-aware, prevents fan-out during bulk saves)

### Notes & Timeline (999.5)

- [ ] **NOTE-01**: User can add multiple timestamped, attributed notes to a deal, organization, person, or activity — appending rather than overwriting the single `notes` text column
- [ ] **NOTE-02**: User can view one chronological timeline per record interleaving notes, activities, and stage changes
- [ ] **NOTE-03**: Existing `notes` column content is migrated into a first note per record, with no data loss

### Audit Log (999.6)

- [ ] **AUDIT-01**: Every CRM write records who changed what — entity, field-level before/after, actor, and actor kind (user / workflow run / API key / import)
- [ ] **AUDIT-02**: Audit capture is driven by the existing `crmBus` subscriber, so no mutation code changes to add it
- [ ] **AUDIT-03**: User can view a record's change history, and can trace from a workflow run to the records that run mutated
- [ ] **AUDIT-04**: Admin can configure audit retention, and old entries are pruned automatically — this table grows fastest of anything in the schema on a self-hosted deployment

### Bulk Operations (999.2 — carried from v1.1)

- [ ] **BULK-01**: User can select multiple records via checkbox column on Organizations, People, Deals, and Activities list pages (header select-all, individual row checkboxes)
- [ ] **BULK-02**: User can bulk delete selected records (count-aware confirmation modal; per-record permission check; partial failure surfaced)
- [ ] **BULK-03**: User can bulk reassign owner for selected records (member picker; partial failure surfaced per record)
- [ ] **BULK-04**: User can export only the currently selected records to CSV (scoped export, not full table)

### Duplicate Detection & Merge (999.7)

- [ ] **DEDUP-01**: User is warned of likely duplicates when creating an organization or person, and can scan an entity type for existing duplicates on demand
- [ ] **DEDUP-02**: User can merge two records, choosing the winning value per conflicting field
- [ ] **DEDUP-03**: Merging reassigns all child records (deals, activities, notes, files, custom field values) to the surviving record rather than orphaning them

### Saved Views & Filters (999.8)

- [ ] **VIEW-01**: User can save the current filter set on a list page as a named view
- [ ] **VIEW-02**: User can mark a view private or shared, and set one as their default for that entity type
- [ ] **VIEW-03**: User can export the records matching a saved view

### Trash & Restore (999.9)

- [ ] **TRASH-01**: User can view soft-deleted records per entity type, with deletion time and the actor who deleted them
- [ ] **TRASH-02**: User can restore a soft-deleted record, including relinking children whose parent was deleted
- [ ] **TRASH-03**: Admin can permanently purge trashed records, and records past the retention window are purged automatically

### Workflow Operations (999.10)

- [ ] **WFOPS-01**: User can re-run a failed workflow run from the run detail page, mirroring the existing webhook DLQ replay pattern
- [ ] **WFOPS-02**: User can dry-run a workflow from the editor against sample trigger data, seeing per-node output without mutating CRM records
- [ ] **WFOPS-03**: User is notified when a workflow run fails — runs can currently fail silently forever
- [ ] **WFOPS-04**: The webhook-response single-instance constraint is documented in deployment docs — its in-memory promise map breaks under a second replica, while schedule and execution claims are already multi-instance safe

### Observability (999.11)

- [ ] **OBS-01**: Application logs are structured and level-controlled, replacing the 108 bare `console.*` calls in non-test source
- [ ] **OBS-02**: Unhandled server errors are reported to an error tracker, opt-in via env var so the self-hosted default stays no-phone-home
- [ ] **OBS-03**: `/api/health` reports database connectivity and the liveness of all four background processors, so a dead instrumentation register() is detectable without reading container logs

### Type Safety & Docs (999.12)

- [ ] **POLISH-01**: The codebase has zero `@ts-expect-error` suppressions — a shared typed `TableMeta` interface replaces all 14 in `admin/pipelines/columns.tsx`, `organizations/columns.tsx`, and `people/columns.tsx`
- [ ] **POLISH-02**: Operator can follow documented backup and restore procedures for a self-hosted deployment

## Future Requirements

Deferred beyond v1.3. Tracked but not in the current roadmap.

_(None — all 12 backlog items are in v1.3 scope.)_

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Free-form canvas workflow editor | Linear/branching covers 95% of CRM use cases — validated through v1.2 |
| AI/LLM agent nodes | Users can call AI APIs via the HTTP node |
| Native third-party integration nodes | Generic HTTP + template library covers the need |
| Multi-tenancy | Single company per deployment — a core architectural constraint |
| Mobile app | Web-first, responsive design sufficient |
| Horizontal scaling of webhook-response workflows | Documented as a constraint (WFOPS-04) rather than engineered away this milestone |
| Email sync / shared inbox | Large surface area; buildable externally via the REST API |

## Traceability

Which phases cover which requirements. Populated during roadmap creation (2026-08-13).

| Requirement | Phase | Status |
|-------------|-------|--------|
| CI-01 | Phase 32 | Complete |
| CI-02 | Phase 32 | Complete |
| CI-03 | Phase 32 | Complete |
| CI-04 | Phase 32 | Complete |
| PERF-01 | Phase 33 | Pending |
| PERF-02 | Phase 33 | Pending |
| FORMULA-01 | Phase 34 | Pending |
| FORMULA-02 | Phase 34 | Pending |
| NOTE-01 | Phase 35 | Pending |
| NOTE-02 | Phase 35 | Pending |
| NOTE-03 | Phase 35 | Pending |
| AUDIT-01 | Phase 36 | Pending |
| AUDIT-02 | Phase 36 | Pending |
| AUDIT-03 | Phase 36 | Pending |
| AUDIT-04 | Phase 36 | Pending |
| BULK-01 | Phase 38 | Pending |
| BULK-02 | Phase 38 | Pending |
| BULK-03 | Phase 38 | Pending |
| BULK-04 | Phase 38 | Pending |
| DEDUP-01 | Phase 39 | Pending |
| DEDUP-02 | Phase 39 | Pending |
| DEDUP-03 | Phase 39 | Pending |
| VIEW-01 | Phase 40 | Pending |
| VIEW-02 | Phase 40 | Pending |
| VIEW-03 | Phase 40 | Pending |
| TRASH-01 | Phase 37 | Pending |
| TRASH-02 | Phase 37 | Pending |
| TRASH-03 | Phase 37 | Pending |
| WFOPS-01 | Phase 41 | Pending |
| WFOPS-02 | Phase 41 | Pending |
| WFOPS-03 | Phase 41 | Pending |
| WFOPS-04 | Phase 41 | Pending |
| OBS-01 | Phase 42 | Pending |
| OBS-02 | Phase 42 | Pending |
| OBS-03 | Phase 42 | Pending |
| POLISH-01 | Phase 43 | Pending |
| POLISH-02 | Phase 43 | Pending |

**Coverage:**
- v1.3 requirements: 37 total
- Mapped to phases: 37 ✓
- Unmapped: 0 ✓
- Phases: 12 (Phases 32-43)

---
*Requirements defined: 2026-08-13*
*Last updated: 2026-08-13 — traceability populated from ROADMAP.md (Phases 32-43)*
