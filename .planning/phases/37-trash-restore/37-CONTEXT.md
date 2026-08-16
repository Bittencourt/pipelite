# Phase 37: Trash & Restore - Context

**Gathered:** 2026-08-16
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — 16 decisions across 4 areas, all recommendations accepted

<domain>
## Phase Boundary

This phase makes the soft-delete that already exists on the four CRM tables *visible and reversible*. Every CRM entity already carries a `deleted_at` column and every delete mutation already sets it — what is missing is a way to see what is in that state, a way to bring it back, and a way to make it eventually go away for good.

**In scope:**
- A trash view listing soft-deleted records per entity type, showing when each was deleted and who deleted it (TRASH-01)
- A restore action returning a record to its live list, with its child relationships intact and its derived values repaired (TRASH-02)
- An admin-only permanent purge, plus an automatic retention-window purge that needs no admin action (TRASH-03)

**Out of scope (explicitly):**
- Changing what the existing live list views show or filter
- Adding cascade-delete semantics to the delete mutations
- Notes as a trash-able entity in their own right
- New CRM bus event types for restore or purge

</domain>

<decisions>
## Implementation Decisions

### Trash Surface & Navigation

- **One `/trash` route with per-entity tabs** (Deals / People / Organizations / Activities), not four separate routes and not a "show deleted" toggle bolted onto each existing list. Success criterion 1 says "a trash view per entity type" — per-entity *view*, which tabs satisfy, not per-entity *route*.
- **Visibility follows the live-record rules**: a user sees a trashed record if they could have seen it live — owner or admin. This reuses the existing guard shape from `src/app/deals/actions.ts:83` (`deal.ownerId !== session.user.id && session.user.role !== "admin"`) rather than inventing a trash-specific permission. Trash is not admin-only; only *purge* is.
- **Columns**: name/title, deleted-at (relative, with the exact timestamp on hover), deleted-by, plus one entity-appropriate secondary column. Deleted-by must render all five actor kinds, not just users — a record deleted by a workflow run, an API key, or an import has to say so.
- **Navigation**: an entry in the user menu alongside the existing `/admin/users` link (`src/components/user-menu.tsx:66`). Not a new top-level nav item — trash is a recovery surface, not a daily one.

### Restore Semantics & Cascade

- **No cascade-soft-delete is introduced.** Deleting a parent continues to leave its children live and still pointing at it. This was verified, not assumed: a repo-wide grep for `organizationId: null`, `personId: null`, and `dealId: null` returns zero non-test hits, and both `deleteDealMutation` (`src/lib/mutations/deals.ts:461`) and `deleteOrganizationMutation` (`src/lib/mutations/organizations.ts:311`) do exactly one `UPDATE ... SET deleted_at` and nothing else.
  - **Consequence for success criterion 2**: the criterion's phrase "children orphaned when the parent was deleted" describes a state this codebase does not produce. No FK is ever nulled, so no link is ever broken, so restore does not need to *re*-attach anything — clearing `deleted_at` is sufficient for the children to be correct again. The rejected alternative was to add real cascade-delete plus a `deletion_batch_id` column so restore could reverse exactly one batch; that is a schema change and a behaviour change to every delete path, for a problem that does not exist.
  - The planner must **verify this claim per entity** before relying on it and must state in the plan what it found. If some path does null a child FK, that path is where relinking work belongs.
- **A child whose parent is still trashed can be restored.** The row is flagged "parent is in trash" and offers a one-click "restore the parent too". Blocking the restore was rejected — it makes the common case (parent deleted by mistake, child needed now) require two trips through the UI in a fixed order.
- **Restore runs `recalculateFormulas` for the restored record.** Delete deliberately skips recalculation — see the comment at `src/lib/mutations/deals.ts:475` and the matching one in `organizations.ts`, both pointing at the known limitation recorded in plan 34-11. Restore is the natural repair point for the stale derived values that skip leaves behind.
- **Live list views are not touched.** They do not start hiding records whose parent is trashed. That is a behaviour change to surfaces this phase is not chartered to modify.

### Purge & Retention

- **Purge is admin-only**, matching TRASH-03's wording. Record owners can trash and restore their own records but cannot destroy them.
- **Retention is configured as `trash.retention_days` in the `app_settings` table**, default 30, bounded by an explicit min and max. This mirrors `audit.retention_days` deliberately — `src/lib/audit/settings.ts` already establishes the pattern: a JSONB value, a Zod schema validating it on every read, and a fail-closed path that disables the policy (rather than coercing garbage) when the stored value is corrupt. Phase 36 introduced `app_settings` with exactly one key and noted that later phases would add theirs; this is the second key.
- **Auto-purge is a daily setTimeout-chained background processor registered in `instrumentation.ts`**, copied in shape from `startAuditPruner` (`src/lib/audit/prune.ts:42`). setTimeout chaining rather than `setInterval` is the established repo convention for all four existing processors, precisely to prevent overlapping runs. Purging lazily on trash-page load was rejected: criterion 4 requires records to leave trash "with no admin action", which a page-load trigger does not guarantee.
  - **Deployment note**: Docker standalone builds have historically dropped `instrumentation.js`, which silently killed every processor in production (see STATE.md, 2026-08-08). The plan must confirm the new pruner actually runs in the container, not merely that it is registered.
- **A purge hard-deletes the record and its notes, and preserves its `audit_log` rows.** The audit table's FK-free `entity_id` is not an oversight — `src/db/schema/audit-log.ts` documents at length that a referential guard there "would erase exactly the evidence the log exists to keep". Purge writes one further audit row recording the purge itself.

### Data Model & Interface

- **Four entity types get trash**: deals, people, organizations, activities. Notes carry `deleted_at` too but are timeline children of a record, not records in their own right; a note deleted from a timeline is restored from that timeline, not from a global trash tab.
- **"Deleted by" is derived, not stored.** Resolve it by reading the most recent `audit_log` row with `action = 'deleted'` for that `(entity_type, entity_id)` — Phase 36 already writes exactly this row on every delete, and the composite index `audit_log_entity_idx` already serves the lookup. No `deleted_by` column is added to any CRM table.
  - The planner should confirm the read is efficient for a whole page of trashed records (one batched query, not N+1) and should decide what the UI shows for a record deleted before Phase 36 shipped, where no audit row exists.
- **REST API gets the surface too**: a trash listing endpoint, a restore endpoint per entity, and an admin-gated purge endpoint, following the auth and shape conventions of the existing `src/app/api/v1/` routes (`src/app/api/v1/audit/route.ts:124` shows the admin gate).
- **No new CRM bus event types.** Restore and purge write audit rows; they do not emit `{entity}.restored`. Emitting a new event type means workflow trigger UI work, which belongs to Phase 41, and emitting an existing `.created` event on restore would be a lie to every subscriber.

### Purge Cascade (added post-research, 2026-08-16)

Phase 37 research overturned this section's assumption that no operation in this phase orphans children. **Purge does.** Every foreign key pointing at the four CRM tables is `ON DELETE NO ACTION` (`confdeltype = 'a'` in `pg_constraint`, verified), so a hard `DELETE` raises SQLSTATE 23503 — empirically confirmed by rolled-back probes for `activities_deal_id_deals_id_fk`, `people_organization_id_organizations_id_fk`, and `deals_person_id_people_id_fk`. And 13,770 of 25,207 deals (54.6%) have at least one activity, so refusing to purge parents with children would break success criterion 4 for the majority of records.

- **A purge DETACHES live children rather than destroying them.** The purge transaction nulls the child foreign key first — `activities.deal_id`, `people.organization_id`, `deals.person_id` — then deletes the parent row. Every one of those columns is already nullable, so this needs no schema change.
- **Nothing beyond the purged row itself is destroyed.** Children survive as unlinked records. Cascade-purging children, cascade-trashing them, and refusing the purge outright were all considered and rejected: the first two destroy or hide records the admin never chose to delete, and the third fails criterion 4.
- **The detach is auditable.** The purge audit row records which children were detached, so an unlinked activity can be traced back to the deal that was purged out from under it.
- **Purge is therefore a transaction with an ordered teardown, not a single statement.** The plan must order it: null child FKs → delete the row, all inside one transaction, so a failure part-way cannot leave children detached from a parent that still exists.
- The retention pruner runs the same teardown, and processes entity types leaves-first (activities → deals → people → organizations) so a parent is never purged while a sibling pass is still detaching from it.

### Claude's Discretion

- Tab vs. sub-route mechanics inside `/trash`, empty-state copy, and confirmation-dialog wording
- The exact min/max bounds on `trash.retention_days` and the pruner's batch size
- Whether the purge audit row uses `action: 'deleted'` with a distinguishing marker in `changes`, or another representation — the constraint is only that a purge is traceable afterwards
- Test placement and structure, subject to the suite staying green

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets

- `src/lib/audit/settings.ts` — `app_settings` read/write with Zod validation and fail-closed behaviour; `trash.retention_days` should follow it key-for-key
- `src/lib/audit/prune.ts` — the daily retention pruner: batched deletes, an index deliberately sized for the scan, and the setTimeout-chaining loop. This is the template for the trash pruner
- `src/lib/audit/present.ts` and `linked-records.ts` — actor presentation across all five `AuditActorKind` values; "deleted by" rendering should reuse this rather than re-deriving actor labels
- `src/app/admin/audit/retention-form.tsx` — an existing admin form for a retention setting
- `src/lib/mutations/{deals,people,organizations,activities}.ts` — the four delete mutations; restore and purge belong beside them in the same mutation-layer pattern
- `src/lib/formula-recalc.ts` (per Phase 34/44) — `recalculateFormulas`, to be called on restore

### Established Patterns

- **Mutation layer** (`src/lib/mutations/`) holds reusable DB operations; ownership checks live in the server action or API route, not the mutation, which only checks entity existence
- **Server actions return `{ success: true }` / `{ success: false, error }`** — every delete mutation above uses this exact shape
- **Soft delete is `UPDATE ... SET deleted_at = now(), updated_at = now()`** followed by a `crmBus.emit` carrying `previous` (the full pre-delete row) because `data` is only `{ id }`
- **Every read path carries `isNull(table.deletedAt)` explicitly** — Phase 35 recorded that partial indexes do not enforce their own predicate, so the filter is always written out. Trash queries invert this and must be equally explicit
- **Background processors** chain `setTimeout` and are started from `instrumentation.ts`
- **Admin gate**: `session.user.role !== "admin"` checked in the action/route

### Integration Points

- `instrumentation.ts` (repo root) — register the trash pruner alongside the existing four processors and the audit pruner
- `src/components/user-menu.tsx:66` — where the trash nav entry goes
- `src/db/schema/{deals,people,organizations,activities}.ts` — all four already have `deleted_at`; three already have a `deleted_at` index (`people`, `organizations`, `activities`). **`deals` does not** — Phase 33 indexed `stage_id`, `organization_id`, `person_id`, `owner_id` but not `deleted_at`. The trash query will need it
- `src/db/schema/app-settings.ts` — second key added here
- `src/app/api/v1/` — new trash/restore/purge routes
- `audit_log` — read for "deleted by", written on purge

</code_context>

<specifics>
## Specific Ideas

- The "children orphaned when the parent was deleted" clause in success criterion 2 was checked against the code and does not describe current behaviour. The phase satisfies the criterion's *intent* (a restored record comes back whole) without adding cascade machinery. This is a deliberate, evidenced reading — not an oversight — and the plan should carry the evidence so verification does not re-litigate it.
- Phase 36's audit-log design notes are the reference for anything touching `audit_log`: it is append-only, the retention pruner is its only deletion path, and its lack of a foreign key on `entity_id` is load-bearing.
- Records soft-deleted before Phase 36 shipped have no audit row, so "deleted by" is genuinely unknown for them. Show that honestly rather than defaulting to a system actor.

</specifics>

<deferred>
## Deferred Ideas

- **Cascade-delete with a `deletion_batch_id`** — the literal reading of criterion 2. Revisit only if a delete path is found that genuinely orphans children.
- **`{entity}.restored` CRM bus events and workflow triggers on restore** — belongs with the workflow operator work in Phase 41.
- **Notes as a trash tab** — restoring a deleted note from its record timeline is separate work.
- **Live list views hiding records whose parent is trashed** — a behaviour change to existing surfaces; out of scope here.
- **Per-entity retention windows** — one global `trash.retention_days` until there is a reason for more.

</deferred>
