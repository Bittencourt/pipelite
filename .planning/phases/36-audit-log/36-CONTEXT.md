# Phase 36: Audit Log - Context

**Gathered:** 2026-08-16
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — 16 decisions across 4 areas, all recommendations accepted

<domain>
## Phase Boundary

Every CRM write becomes traceable to who or what made it — with field-level before/after values and
an actor kind — captured by a `crmBus` subscriber rather than by editing mutation code, rendered
into the Phase 35 timeline, traceable from a workflow run to the records it mutated, and bounded on
disk by an admin-configurable retention window that prunes itself.

**In scope:** the audit table and its capture subscriber, event enrichment with previous values, an
AsyncLocalStorage actor context, the `app_settings` table, the retention pruner, the audit timeline
source, workflow-run linked records, a read-only admin API, and the retention admin UI.

**Out of scope:** auditing non-CRM entities (users, workflows, pipelines, custom field definitions);
restoring a record from an audit entry (that is Phase 37's trash/restore, and undo is not in this
milestone); exporting the audit log; per-field access control on audit reads.

</domain>

<decisions>
## Implementation Decisions

### Capture Mechanism and Before/After Values
- `CrmEventPayload` gains an optional `previous` populated from the row the mutation layer
  **already re-reads** to check existence. AUDIT-02's requirement is that audit *capture* is a
  subscriber — enriching the event the subscriber consumes is not the same as putting audit logic
  into mutations. This is the only way before-values can exist at all: a subscriber fires after the
  write and cannot recover what the value used to be.
- One audit row per change event, carrying a JSONB `changes` map of `field → { from, to }`. Not one
  row per changed field — this is the table PROJECT.md singles out as the disk risk, and row count
  is the thing to keep down.
- Audited fields are native columns plus custom fields, **excluding formula-derived values**. The
  ROADMAP is explicit that Phase 34's recalculations are writes and must not flood the log with
  derived-value noise. A formula field changing because its input changed is already represented by
  the input's own entry.
- Creates and deletes are logged alongside updates — a create records the initial state, a delete
  records a tombstone. Without both ends, "traced to who made it" has holes.

### Actor Identity and Kind
- Actor kind comes from an `AsyncLocalStorage` actor context established at the four entry
  boundaries (server action, `/api/v1` route, workflow executor, importer) and read by the audit
  subscriber. Direct repo precedent: Phase 26 used AsyncLocalStorage for workflow recursion depth
  precisely because it propagates across async boundaries without threading a parameter through
  every function signature — which is what AUDIT-02 exists to avoid.
- The kinds are `user`, `workflow_run`, `api_key`, `import` (exactly AUDIT-01's four) plus `system`.
- A nullable, indexed `workflow_run_id` foreign key is stored on the audit row so the workflow run
  detail page can list every record that run mutated. That is the second half of SC-2 and it needs
  a real key, not timestamp correlation.
- When no actor context is present, the entry records `system`. It must NEVER fall back to the
  event's `userId` — a confidently wrong name in an audit log is worse than an honest "unknown".

### Retention and Pruning (the question PROJECT.md flagged as "decide, do not assume")
- Default retention is **90 days**, configurable. Long enough to answer "who changed this last
  quarter", short enough to bound growth on a deployment where nobody is watching disk.
- The setting lives in a new minimal `app_settings` key/value table with a JSONB value. No settings
  table exists in the schema today. Phase 40 (saved views) and Phase 42 (observability) will both
  want one, so this is the point at which a shared table stops being speculative — but this phase
  only introduces the table and the one key it needs.
- Pruning runs as a `setTimeout`-chained processor registered in `instrumentation.ts` — the
  established pattern for all four existing processors — daily, deleting in **capped batches** so
  it never takes a long write lock on the biggest table in the schema.
- Pruning is observable and fails closed: it logs rows deleted per run, caps deletions per tick, and
  does nothing at all when retention is unset or unparseable. The safe direction is keeping data.

### Surfaces
- Per-record history renders as a **fourth timeline source**, not a separate tab. Phase 35 built the
  assembler for exactly this: append to `TIMELINE_SOURCES`, add `'audit'` to `TimelineEntryKind`,
  and the dispatcher's compile-time `never` check will fail the build if the renderer is missed.
  Phase 35's summary states this is a two-edit extension.
- The workflow run detail page gains a linked-records section, queried by the indexed
  `workflow_run_id`.
- REST exposure is a **read-only, admin-only** `GET` under `/api/v1`. An audit log any API key can
  read is an information-disclosure surface, and it is never writable from outside the subscriber.
- The retention admin UI is a number input under `/admin` that writes the `app_settings` key and
  displays the current entry count and oldest entry, so the operator can see what the window costs.

### Claude's Discretion
- Table and column naming, index selection, the exact JSONB shape of `changes`, batch size and tick
  interval for the pruner, and how the audit timeline entry renders visually.
- Whether `previous` is added to the shared `CrmEventPayload` or to a narrower update-only payload
  type — decide during planning based on what keeps the type honest for creates and deletes.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/events/` — `crmBus` with 13 typed events; `CrmEventPayload` carries
  `{ entity, entityId, action, data, changedFields, userId, timestamp }`. **`data` is the NEW state
  and there are no before-values** — this is the fact that shapes the whole phase.
- `src/lib/events/subscribers/` — four registered subscribers, including `stage-history.ts` from
  Phase 35, which is the closest analog: fire-and-forget insert with a `.catch` that logs, plus an
  idempotent module-scope registration guard and a `_resetForTesting()`.
- `src/lib/timeline/sources.ts` + `assemble.ts` — the pluggable source array this phase extends.
  Phase 35 measured and documented the two-edit extension path.
- `instrumentation.ts` — registers four processors and three subscribers behind
  `NEXT_RUNTIME === "nodejs"`; the pruner and the audit subscriber both belong here.
- `src/lib/import/import-session-cleanup.ts` — the existing cleanup-job precedent.
- AsyncLocalStorage precedent from Phase 26 lives in the workflow execution layer (recursion depth).

### Established Patterns
- Schema one-file-per-entity in `src/db/schema/`, relations isolated in `_relations.ts`, indexes
  declared in the schema file and emitted by `drizzle-kit generate` — NEVER hand-written into
  migration SQL (Phase 33 D-06).
- Timestamps take no `mode` option; a `Date` must never be bound into a raw `sql` fragment
  (Phase 35: bind `${iso}::text::timestamp`).
- Every read path carries `deleted_at IS NULL` explicitly where soft delete applies.
- Server actions return `{ success: true, ... } / { success: false, error }`; `/api/v1` routes wrap
  every handler in `withApiAuth` and return snake_case.
- `/api/v1` auth context is `{ userId, keyId }` with NO role — an admin check needs
  `resolveActorRole` (Phase 35, `src/lib/notes/authorize.ts`).

### Integration Points
- `src/lib/mutations/{deals,people,organizations,activities}.ts` — where `buildEventPayload` is
  constructed and where the pre-read that yields `previous` already happens.
- `src/lib/timeline/{sources,types}.ts` — the two-edit extension.
- `src/app/workflows/[id]/` — the run detail page gaining linked records.
- `src/app/admin/` — the retention setting UI.
- Latest migration on disk is `drizzle/0013_parched_redwing.sql`; this phase's is 0014.

</code_context>

<specifics>
## Specific Ideas

- The audit table is expected to become the largest in the schema. Every design choice above that
  looks conservative — one row per event rather than per field, excluding formula noise, capped
  batch pruning, a default window rather than unlimited — is aimed at that single fact.
- Phase 35 left the timeline dispatcher with an exhaustive `never` check specifically so that adding
  an `'audit'` kind fails typecheck here rather than silently rendering nothing. Do not defeat it.
- The live database has ~25,206 deals, 29,037 organizations and 46,198 activities. Any backfill or
  migration must be measured against that scale, and any pruning batch cap chosen with it in mind.

</specifics>

<deferred>
## Deferred Ideas

- Auditing non-CRM entities (users, workflows, pipelines, custom field definitions).
- Restoring or undoing a record from an audit entry — Phase 37 owns trash/restore.
- Exporting or streaming the audit log to an external SIEM.
- Per-field or per-entity access control on audit reads beyond admin-only.
- Migrating the Phase 35 `deal_stage_history` table into the audit log; the two coexist, and the
  timeline assembler already merges both.

</deferred>
