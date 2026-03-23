# Roadmap: Pipelite

## Milestones

- ✅ **v1.0 MVP** — Phases 1-16 (shipped 2026-03-14)
- 🚧 **v1.1 Reliability & Operations** — Phases 17-22 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-16) — SHIPPED 2026-03-14</summary>

- [x] Phase 1: Foundation & Authentication (6/6 plans) — completed 2026-02-22
- [x] Phase 2: Organizations (3/3 plans) — completed 2026-02-22
- [x] Phase 3: People (3/3 plans) — completed 2026-02-22
- [x] Phase 4: Pipelines & Stages (4/4 plans) — completed 2026-02-23
- [x] Phase 5: Deals & Kanban (3/3 plans) — completed 2026-02-24
- [x] Phase 6: Activities (4/4 plans) — completed 2026-02-25
- [x] Phase 7: Custom Fields & Formulas (11/11 plans) — completed 2026-02-28
- [x] Phase 8: Search & Filtering (3/3 plans) — completed 2026-02-28
- [x] Phase 9: Import/Export (3/3 plans) — completed 2026-02-28
- [x] Phase 10: REST API (4/4 plans) — completed 2026-03-01
- [x] Phase 11: Keyboard Control (5/5 plans) — completed 2026-03-02
- [x] Phase 12: Localization (5/5 plans) — completed 2026-03-05
- [x] Phase 13: Comprehensive Documentation (4/4 plans) — completed 2026-03-06
- [x] Phase 14: Dashboard Metrics (3/3 plans) — completed 2026-03-07
- [x] Phase 15: Multi-user Collaboration (6/6 plans) — completed 2026-03-07
- [x] Phase 16: Pipedrive API Importer (6/6 plans) — completed 2026-03-08

Full archive: `.planning/milestones/v1.0-ROADMAP.md`

</details>

### 🚧 v1.1 Reliability & Operations (In Progress)

**Milestone Goal:** Resolve accumulated tech debt and bring operational reliability to webhooks, import state, and formula recalculation. Add bulk operations for efficient record management.

- [x] **Phase 17: TypeScript Cleanup** — Remove `ignoreBuildErrors`, verify clean `tsc --noEmit` (completed 2026-03-14)
- [ ] **Phase 18: DB Infrastructure** — Migrate `webhook_deliveries` and `import_sessions` tables
- [x] **Phase 19: Webhook Reliability** — Durable delivery, delivery history UI, DLQ with manual replay (completed 2026-03-22)
- [ ] **Phase 20: Import State Reliability** — DB-backed import sessions, cancellation persists across restarts
- [ ] **Phase 21: Formula Reactivity** — Server-side recalculation on save, dependency-aware fan-out control
- [ ] **Phase 22: Bulk Operations** — Checkbox selection, bulk delete, bulk assign owner, bulk CSV export

---

### Phase 17: TypeScript Cleanup

**Goal:** The build is honest — no suppressed errors, `tsc --noEmit` exits clean before any v1.1 code is written.

**Depends on:** Nothing (first phase, must run before all others)

**Requirements:** TSFIX-01

**Success Criteria** (what must be TRUE when this phase completes):
1. `next.config.ts` no longer contains `ignoreBuildErrors: true`
2. Running `npx tsc --noEmit` in the project root exits with code 0 and zero diagnostic output
3. The Docker build succeeds (`next build`) without any TypeScript error suppression in effect

**Plans:** 1 plan

Plans:
- [ ] 17-01-PLAN.md — Remove `ignoreBuildErrors` from `next.config.ts`, verify `tsc --noEmit` and Docker build pass clean

---

### Phase 18: DB Infrastructure

**Goal:** The database has the two new tables (`webhook_deliveries`, `import_sessions`) that Phases 19 and 20 depend on, with correct indexes and Drizzle schema exports in place.

**Depends on:** Phase 17

**Requirements:** None directly (infrastructure for WHOOK-01, IMPORT-01)

**Success Criteria** (what must be TRUE when this phase completes):
1. `webhook_deliveries` table exists in the running database with columns for status, payload, HTTP response, retry count, and `next_attempt_at`; composite index on `(status, next_attempt_at)` present
2. `import_sessions` table exists with JSONB progress column, status, and cancellation flag
3. Drizzle schema files export both tables via `src/db/schema/index.ts` and the app starts without migration errors

**Plans:** 1 plan

Plans:
- [ ] 18-01-PLAN.md — Create `webhook-deliveries.ts` and `import-sessions.ts` schema files, export from barrel, apply migration via Docker restart

---

### Phase 19: Webhook Reliability

**Goal:** Webhook delivery survives container restarts, admins can see every delivery outcome, and failed deliveries can be replayed without developer intervention.

**Depends on:** Phase 18 (`webhook_deliveries` table)

**Requirements:** WHOOK-01, WHOOK-02, WHOOK-03

**Success Criteria** (what must be TRUE when this phase completes):
1. Restarting the Docker container while a webhook retry is pending does not lose the delivery — the retry fires after restart because delivery state is in the database, not memory
2. Admin navigates to a webhook endpoint in the admin UI and sees a delivery log: each row shows timestamp, HTTP status, attempt number, and success/failure
3. Admin can see dead-letter entries (deliveries that exhausted all retries) as a distinct DLQ section and click "Replay" on any entry to re-queue it for immediate delivery
4. A 4xx response from the subscriber endpoint does not trigger retries (only 5xx and network errors do), visible from the delivery log status

**Plans:** 3/3 plans complete

Plans:
- [x] 19-01-PLAN.md — Rewrite deliver.ts to INSERT into webhook_deliveries; create cron processor and self-scheduling startup hook
- [x] 19-02-PLAN.md — Admin webhook list page with CRUD (create, edit, delete) and sidebar navigation
- [x] 19-03-PLAN.md — Webhook detail page with delivery history log, DLQ tab, and manual replay

---

### Phase 20: Import State Reliability

**Goal:** Pipedrive import progress is stored in the database — progress survives a container restart, and a cancellation issued before a restart takes effect when the container comes back up.

**Depends on:** Phase 18 (`import_sessions` table)

**Requirements:** IMPORT-01, IMPORT-02

**Success Criteria** (what must be TRUE when this phase completes):
1. Starting a Pipedrive import, restarting the Docker container mid-import, then polling the progress endpoint returns the last-known progress percentage (not a blank/error state)
2. Clicking "Cancel import" and then restarting the container results in the import not resuming — cancellation is durable
3. On app startup, any `import_sessions` rows still in `running` status are automatically transitioned to `error` (stale session cleanup), preventing phantom "in progress" indicators after a crash

**Plans:** 2 plans

Plans:
- [ ] 20-01-PLAN.md — Schema migration for userId column, rewrite pipedrive-import-state.ts to DB-backed Drizzle queries, startup cleanup module, instrumentation.ts hook
- [ ] 20-02-PLAN.md — Wire DB-backed state into import actions (await all calls, pass userId), interrupted state UI with i18n

---

### Phase 21: Formula Reactivity

**Goal:** Formula field values are computed server-side every time an entity is saved and stored in the JSONB blob — API responses, webhook payloads, and CSV exports all reflect current formula values without requiring a page load.

**Depends on:** Phase 17 (clean TypeScript build baseline)

**Requirements:** FORMULA-01, FORMULA-02

**Success Criteria** (what must be TRUE when this phase completes):
1. Editing a field that a formula depends on and then fetching the entity via the REST API returns the updated formula value in the same response — no extra page reload or manual recalculation needed
2. A webhook payload for a deal.updated event includes the current computed formula values in the `customFields` object
3. Exporting selected records to CSV includes formula field columns with current server-computed values (not blank or stale)
4. Changing one field triggers recalculation only for formulas that reference that field — updating an unrelated field does not recalculate unaffected formulas (verifiable via server logs)

**Plans:** TBD

Plans:
- [ ] 21-01: Add server-side formula evaluation step to `saveFieldValues` in `src/lib/custom-fields.ts`; implement dependency extraction to filter which formulas recalculate; store results in JSONB

---

### Phase 22: Bulk Operations

**Goal:** Users can select multiple records across all entity list pages and act on them together — delete, reassign, or export — without touching each record individually.

**Depends on:** Phase 19 (durable webhook queue in place before bulk mutations create webhook events), Phase 21 (formula recalc path in place before bulk edits touch formula dependencies)

**Requirements:** BULK-01, BULK-02, BULK-03, BULK-04

**Success Criteria** (what must be TRUE when this phase completes):
1. On Organizations, People, Deals, and Activities list pages, a checkbox column is visible; clicking the header checkbox selects all visible records; pressing Escape clears the selection
2. With records selected, clicking "Delete" shows a confirmation modal that states the exact count (e.g., "Delete 12 organizations?"); confirming deletes only the records the current user owns, and any per-record failures are surfaced individually (not silently skipped)
3. With records selected, clicking "Assign owner" opens a member picker; selecting a member reassigns all selected records and reports "X of Y updated" if any fail
4. With records selected, clicking "Export CSV" downloads a CSV containing only the selected records — not the full table

**Plans:** TBD

Plans:
- [ ] 22-01: Activate TanStack Table `enableRowSelection` on all four entity list tables; build shared `BulkActionBar` component that appears when selection is non-empty
- [ ] 22-02: Add `deleteMany` server actions per entity with per-record ownership check and partial-failure result shape; wire to count-confirmation modal
- [ ] 22-03: Add `assignMany` server actions per entity; build member picker in bulk bar; add scoped CSV export action for selected record IDs

---

## Progress

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 1. Foundation & Authentication | v1.0 | 6/6 | Complete | 2026-02-22 |
| 2. Organizations | v1.0 | 3/3 | Complete | 2026-02-22 |
| 3. People | v1.0 | 3/3 | Complete | 2026-02-22 |
| 4. Pipelines & Stages | v1.0 | 4/4 | Complete | 2026-02-23 |
| 5. Deals & Kanban | v1.0 | 3/3 | Complete | 2026-02-24 |
| 6. Activities | v1.0 | 4/4 | Complete | 2026-02-25 |
| 7. Custom Fields & Formulas | v1.0 | 11/11 | Complete | 2026-02-28 |
| 8. Search & Filtering | v1.0 | 3/3 | Complete | 2026-02-28 |
| 9. Import/Export | v1.0 | 3/3 | Complete | 2026-02-28 |
| 10. REST API | v1.0 | 4/4 | Complete | 2026-03-01 |
| 11. Keyboard Control | v1.0 | 5/5 | Complete | 2026-03-02 |
| 12. Localization | v1.0 | 5/5 | Complete | 2026-03-05 |
| 13. Documentation | v1.0 | 4/4 | Complete | 2026-03-06 |
| 14. Dashboard Metrics | v1.0 | 3/3 | Complete | 2026-03-07 |
| 15. Multi-user Collaboration | v1.0 | 6/6 | Complete | 2026-03-07 |
| 16. Pipedrive API Importer | v1.0 | 6/6 | Complete | 2026-03-08 |
| 17. TypeScript Cleanup | v1.1 | 1/1 | Complete | 2026-03-14 |
| 18. DB Infrastructure | v1.1 | 1 plan | Not started | - |
| 19. Webhook Reliability | v1.1 | Complete    | 2026-03-22 | 2026-03-22 |
| 20. Import State Reliability | v1.1 | 0/2 | Not started | - |
| 21. Formula Reactivity | v1.1 | 0/TBD | Not started | - |
| 22. Bulk Operations | v1.1 | 0/TBD | Not started | - |

### Phase 23: Resend email integration for production

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 22
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 23 to break down)

---
*Roadmap updated: 2026-03-23 — Phase 20 plans created (2 plans, 2 waves)*
