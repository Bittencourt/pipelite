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

- [x] **PERF-01**: Core CRM foreign keys and hot filter columns are indexed — `deals.stage_id`, `deals.deleted_at`, `deals.organization_id`, `deals.person_id`, `deals.owner_id`, `activities.due_date`, `activities.deal_id`, `people.organization_id`, and the `deleted_at` columns on orgs/people/activities
- [x] **PERF-02**: The kanban board query and the activity-reminder cron query use index scans rather than sequential scans, confirmed by `EXPLAIN ANALYZE` before and after

### Formula Reactivity (999.1 — carried from v1.1)

- [x] **FORMULA-01**: Formula field values are recalculated server-side when any entity field is saved, so stored JSONB values are correct in API responses, CSV exports, webhook payloads, and workflow condition evaluation
- [x] **FORMULA-02**: Formula recalculation only runs for formulas whose referenced source fields actually changed (dependency-aware, prevents fan-out during bulk saves)

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

- [x] **DEDUP-01**: User is warned of likely duplicates when creating an organization or person, and can scan an entity type for existing duplicates on demand
- [x] **DEDUP-02**: User can merge two records, choosing the winning value per conflicting field
- [x] **DEDUP-03**: Merging reassigns all child records (deals, activities, notes, files, custom field values) to the surviving record rather than orphaning them

### Saved Views & Filters (999.8)

- [x] **VIEW-01**: User can save the current filter set on a list page as a named view
- [x] **VIEW-02**: User can mark a view private or shared, and set one as their default for that entity type
- [x] **VIEW-03**: User can export the records matching a saved view

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

- [x] **OBS-01**: Application logs are structured and level-controlled, replacing the 108 bare `console.*` calls in non-test source
- [x] **OBS-02**: Unhandled server errors are reported to an error tracker, opt-in via env var so the self-hosted default stays no-phone-home
- [x] **OBS-03**: `/api/health` reports database connectivity and the liveness of all four background processors, so a dead instrumentation register() is detectable without reading container logs

### Type Safety & Docs (999.12)

- [x] **POLISH-01**: The codebase has zero `@ts-expect-error` suppressions — a shared typed `TableMeta` interface replaces all 14 in `admin/pipelines/columns.tsx`, `organizations/columns.tsx`, and `people/columns.tsx`
- [x] **POLISH-02**: Operator can follow documented backup and restore procedures for a self-hosted deployment

### Coverage-table reconciliation, 2026-08-24 (closing v1.3)

Eighteen rows still read `Pending` while every one of the 14 phases was complete on disk with a
verification report. All eighteen were **bookkeeping lag**, not unmet work — the same lag that left
OBS-01/02/03 open after Phase 42. Resolved as follows, after reading each phase's verification rather
than trusting the table:

| Requirements | Phase | Verification status | Resolution |
|---|---|---|---|
| NOTE-01..03 | 35 | `passed` | **Complete** |
| TRASH-01..03 | 37 | `passed` | **Complete** |
| WFOPS-01..04 | 41 | `passed` | **Complete** |
| AUDIT-01..04 | 36 | `gaps_found` | **Complete\*** — see below |
| BULK-01..04 | 38 | `gaps_found` | **Complete\*** — see below |

**\* Why phases 36 and 38 count as complete despite `gaps_found`.** Both scored **5/5 on their
success criteria**; the `gaps_found` status was raised by *UAT* items, not unmet criteria. Those items
were the explicit remit of **Phase 45** ("Close the five app-wide defects the Phase 36-38 browser UAT
surfaced"), which verified `passed` 5/5 on 2026-08-19 — after 36's and 38's reports were written on
2026-08-16/17. Phase 45 closed them with real evidence: 320px across 6 routes x 3 locales (23/23),
dark mode switchable and surviving a reload, and the deals-kanban drag **converted into a genuine
automated test** (`e2e/deals-drag.spec.ts`, driven by trusted `page.mouse.*` input with zero
`dispatchEvent`/`dragTo`/`dragAndDrop`).

**Four UAT residuals were open at milestone close. One was closed (#1); three carry forward as
accepted debt.** None ever blocked a requirement; all four are recorded here so the milestone does not
close as if they did not exist:

1. ~~**Phase 36 — workflow-run "Records changed" list at 320px / dark mode / es-ES+pt-BR.**~~
   **CLOSED 2026-08-24** by `e2e/workflow-run-320.spec.ts` (commit `a6000a7`). This was the only
   residual that was an *uncovered check* rather than a known-and-accepted defect, which is why it was
   closed before archiving the milestone rather than carried forward. Confirmed first that Phase 45
   genuinely had not covered it — `e2e/viewport-320.spec.ts` exercises `/activities`, `/admin/audit`,
   `/deals`, `/duplicates`, `/organizations`, `/people`, `/trash`, with no workflow route. The new
   spec measures all three named dimensions in all three locales, light and dark, and was proven able
   to fail on each by five observed RED runs. Two limits stated in `36-VERIFICATION.md`: the dark
   check is colour-based rather than pixel-based, and the section's `unavailable` branch is unmeasured.
2. **D-45-04 — swipe-to-dismiss on the admin drawer.** Tested by the user on a real phone and it
   FAILED, but root-caused as not a regression: `src/components/ui/sheet.tsx` wraps Radix `Dialog`,
   which has no gesture layer, and `vaul` is not a dependency. Radix never had this capability.
3. **D-45-03 (F-2) — `/deals` pipeline select possibly rendering an empty label in dark mode.**
   Explicitly **UNCONFIRMED** — recorded by the finding team as neither broken nor fine.
4. **D-45-02 (F-1) — the fixed `ShortcutsHint` bar occluding controls vertically.** Predates Phase 45,
   outside SC-1's horizontal-overflow scope, deferred deliberately.

### Note on OBS-01 and OBS-03's wording (added 2026-08-23, after Phase 42 closed)

Both requirement texts above carry pre-implementation estimates that Phase 42 **measured to be
wrong**. They are left as written for traceability; `42-CONTEXT.md`'s scope correction supersedes them:

- **OBS-01 says "the 108 bare `console.*` calls".** The real figure was **273** in non-test source
  (277 counting `log.ts`'s own 4 internal delegations). All are migrated; the final non-test count is
  **4**, all inside `src/lib/log.ts`, and `no-console` is now `error` so a 274th cannot land.
- **OBS-03 says "all four background processors".** The real surface is **six** long-running
  processors **plus four** `crmBus` event subscribers — **ten** workers. `/api/health` reports all ten
  from a hard-coded roster, and a freshly built container was witnessed returning 200 with 10/10
  `alive: true`.

Verification: `.planning/phases/42-observability/42-VERIFICATION.md` — all three criteria MET.

### Custom Field UI Repair (999.25, 999.26, 999.27)

Found by the 2026-08-15 browser E2E pass over the completed v1.3 phases. All three are UI-layer
defects in the custom-field surface; the server-side contracts they sit on top of are correct.

- [x] **CFUI-01**: An admin can create a custom field on **every** entity type through the UI, including Deals — the "Add Field" trigger renders regardless of how many definitions the entity already has (999.25)
- [x] **CFUI-02**: After saving a formula's source field, the displayed formula value matches the stored value without a page reload (999.26)
- [x] **CFUI-03**: A formula whose source fields are unset renders blank, not `#ERROR — Unknown field: X` — the display evaluator seeds unset sources as `null`, matching `recalculateFormulas` D-14 behaviour (999.27)
- [x] **CFUI-04**: A formula on an activity can resolve native activity fields — `activities/[id]/page.tsx` passes `entityAttributes` like the other three detail pages do (found by 44-RESEARCH.md)
- [x] **CFUI-05**: The client-side formula evaluator applies the same QuickJS resource bounds as the server call site, so a runaway expression cannot hang the browser (Phase 34 D-18 parity; found by 44-RESEARCH.md)

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
| PERF-01 | Phase 33 | Complete |
| PERF-02 | Phase 33 | Complete |
| FORMULA-01 | Phase 34 | Complete |
| FORMULA-02 | Phase 34 | Complete |
| NOTE-01 | Phase 35 | Complete |
| NOTE-02 | Phase 35 | Complete |
| NOTE-03 | Phase 35 | Complete |
| AUDIT-01 | Phase 36 | Complete\* |
| AUDIT-02 | Phase 36 | Complete\* |
| AUDIT-03 | Phase 36 | Complete\* |
| AUDIT-04 | Phase 36 | Complete\* |
| BULK-01 | Phase 38 | Complete\* |
| BULK-02 | Phase 38 | Complete\* |
| BULK-03 | Phase 38 | Complete\* |
| BULK-04 | Phase 38 | Complete\* |
| DEDUP-01 | Phase 39 | Complete |
| DEDUP-02 | Phase 39 | Complete |
| DEDUP-03 | Phase 39 | Complete |
| VIEW-01 | Phase 40 | Complete |
| VIEW-02 | Phase 40 | Complete |
| VIEW-03 | Phase 40 | Complete |
| TRASH-01 | Phase 37 | Complete |
| TRASH-02 | Phase 37 | Complete |
| TRASH-03 | Phase 37 | Complete |
| WFOPS-01 | Phase 41 | Complete |
| WFOPS-02 | Phase 41 | Complete |
| WFOPS-03 | Phase 41 | Complete |
| WFOPS-04 | Phase 41 | Complete |
| OBS-01 | Phase 42 | Complete |
| OBS-02 | Phase 42 | Complete |
| OBS-03 | Phase 42 | Complete |
| CFUI-01 | Phase 44 | Complete |
| CFUI-02 | Phase 44 | Complete |
| CFUI-03 | Phase 44 | Complete |
| CFUI-04 | Phase 44 | Complete |
| CFUI-05 | Phase 44 | Complete |
| POLISH-01 | Phase 43 | Complete |
| POLISH-02 | Phase 43 | Complete |

**Coverage:**
- v1.3 requirements: 37 total
- Mapped to phases: 37 ✓
- Unmapped: 0 ✓
- Phases: 12 (Phases 32-43)

---
*Requirements defined: 2026-08-13*
*Last updated: 2026-08-13 — traceability populated from ROADMAP.md (Phases 32-43)*
