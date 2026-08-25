# Phase 37: Trash & Restore - Research

**Researched:** 2026-08-16
**Domain:** Soft-delete recovery surface in a mature Next.js 16 / Drizzle / PostgreSQL 16 CRM
**Confidence:** HIGH (codebase-verified; 11 live-database probes run against the running container)

## Summary

This phase is almost entirely a **codebase** problem, not an ecosystem problem. Every primitive it
needs already ships: `app_settings` + a Zod-validated fail-closed reader (Phase 36), a daily
`setTimeout`-chained pruner (Phase 36), an audit log that already records every delete with its
actor (Phase 36), a soft-delete column and a `deleted_at` btree index on all four CRM tables (Phase
33), and every UI primitive the UI-SPEC calls for. **No new npm package is required, no `shadcn add`
is required, and — verified by `EXPLAIN` on the live 25k/38k/46k/79k-row database — no new index is
required.**

Three findings materially change the shape of the plan versus what CONTEXT.md and the UI-SPEC assume:

1. **The cascade claim is CORRECT and is now independently verified per entity.** All four delete
   mutations and all four REST delete handlers do exactly one `UPDATE ... SET deleted_at` and nothing
   else. No FK is ever nulled anywhere in the repo. Restore is therefore genuinely "clear
   `deleted_at`", and the children reattach because they were never detached.
2. **Purge is NOT one statement — it is a transaction with an ordered teardown, and this was proven
   empirically.** Every one of the six FKs pointing at the CRM tables is `ON DELETE NO ACTION`.
   `DELETE FROM deals WHERE id = <a deal with an activity>` raises SQLSTATE 23503 today, and 13,770
   of 25,207 deals (54.6%) have at least one activity. Purge of a deal, a person or an organization
   all fail on a bare `DELETE`. Only `activities` is a true leaf. **Purge is the one operation in
   this phase that CREATES the orphan state CONTEXT.md correctly says the delete paths never create**,
   and since purge is irreversible that is acceptable — but it must be a deliberate, audited decision
   per FK, not an accident.
3. **Two documented assumptions are wrong and must not be carried into the plan.** (a) CONTEXT.md
   says `deals` has no `deleted_at` index — it does, `deals_deleted_at_idx`, added by migration
   `0012`; all four tables have one and `EXPLAIN` shows the trash query is already an `Index Scan
   Backward`. (b) The UI-SPEC says the `api_key` actor badge can show "the key name when known" —
   `audit_log` carries no api-key reference at all, and `src/lib/timeline/sources.ts:775-782`
   documents at length that `apiKeyName` is **always null by design**. The column can only ever show
   the kind label for that actor kind.

**Primary recommendation:** Build restore as a mirror of the four delete mutations (single
`UPDATE ... SET deleted_at = NULL`, then `recalculateFormulas` with a broad `changedFields`, then a
directly-written `audit_log` row — no bus event). Build purge as an explicit ordered teardown inside
one `db.transaction`, per entity type, with the FK dispositions in the table below. Copy
`src/lib/audit/{settings,prune}.ts` key-for-key for `trash.retention_days` and the pruner, and gate
the pruner's deployment on the `[trash-prune] Starting` line appearing in `docker compose logs app`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Trash listing query (rows, counts, linked-in-trash flags) | Database / Storage | Frontend Server (RSC) | One server render owns rows + all four counts so they cannot disagree (UI-SPEC § Surface 1). Reads run in `page.tsx`, a server component |
| "Deleted by" resolution | Database / Storage | — | One batched `DISTINCT ON` against `audit_log_entity_idx` + three LEFT JOINs, exactly like `auditSource.hydrate` |
| Tab state / `?type=` param | Browser / Client | Frontend Server | `router.push` writes the URL; the server re-renders. No client data fetching |
| Restore mutation | API / Backend (mutation layer) | — | `src/lib/mutations/{entity}.ts`, beside the matching delete. Ownership check stays in the action/route (STATE.md decision, Phase 24) |
| Purge mutation (ordered teardown) | Database / Storage | API / Backend | Must be one `db.transaction` — a partial teardown leaves FK-orphaned child rows with no parent to purge them later |
| Authorization (owner-or-admin read, admin-only purge) | API / Backend | — | Re-checked in every server action and REST route; the hidden client button is never the gate |
| Retention setting read/write | API / Backend | — | `src/lib/trash/settings.ts` mirroring `src/lib/audit/settings.ts`; fail-closed |
| Auto-purge scheduling | API / Backend (Node runtime) | — | `instrumentation.ts` `setTimeout` chain. NOT page-load triggered (SC-4) |
| Copy / i18n | Frontend Server + Browser | — | `getTranslations` in server components, `useTranslations` in client; three locale files + `locale-parity.test.ts` gate |

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Trash Surface & Navigation**

- **One `/trash` route with per-entity tabs** (Deals / People / Organizations / Activities), not four separate routes and not a "show deleted" toggle bolted onto each existing list. Success criterion 1 says "a trash view per entity type" — per-entity *view*, which tabs satisfy, not per-entity *route*.
- **Visibility follows the live-record rules**: a user sees a trashed record if they could have seen it live — owner or admin. This reuses the existing guard shape from `src/app/deals/actions.ts:83` (`deal.ownerId !== session.user.id && session.user.role !== "admin"`) rather than inventing a trash-specific permission. Trash is not admin-only; only *purge* is.
- **Columns**: name/title, deleted-at (relative, with the exact timestamp on hover), deleted-by, plus one entity-appropriate secondary column. Deleted-by must render all five actor kinds, not just users — a record deleted by a workflow run, an API key, or an import has to say so.
- **Navigation**: an entry in the user menu alongside the existing `/admin/users` link (`src/components/user-menu.tsx:66`). Not a new top-level nav item — trash is a recovery surface, not a daily one.

**Restore Semantics & Cascade**

- **No cascade-soft-delete is introduced.** Deleting a parent continues to leave its children live and still pointing at it. This was verified, not assumed: a repo-wide grep for `organizationId: null`, `personId: null`, and `dealId: null` returns zero non-test hits, and both `deleteDealMutation` (`src/lib/mutations/deals.ts:461`) and `deleteOrganizationMutation` (`src/lib/mutations/organizations.ts:311`) do exactly one `UPDATE ... SET deleted_at` and nothing else.
  - **Consequence for success criterion 2**: the criterion's phrase "children orphaned when the parent was deleted" describes a state this codebase does not produce. No FK is ever nulled, so no link is ever broken, so restore does not need to *re*-attach anything — clearing `deleted_at` is sufficient for the children to be correct again. The rejected alternative was to add real cascade-delete plus a `deletion_batch_id` column so restore could reverse exactly one batch; that is a schema change and a behaviour change to every delete path, for a problem that does not exist.
  - The planner must **verify this claim per entity** before relying on it and must state in the plan what it found. If some path does null a child FK, that path is where relinking work belongs.
- **A child whose parent is still trashed can be restored.** The row is flagged "parent is in trash" and offers a one-click "restore the parent too". Blocking the restore was rejected — it makes the common case (parent deleted by mistake, child needed now) require two trips through the UI in a fixed order.
- **Restore runs `recalculateFormulas` for the restored record.** Delete deliberately skips recalculation — see the comment at `src/lib/mutations/deals.ts:475` and the matching one in `organizations.ts`, both pointing at the known limitation recorded in plan 34-11. Restore is the natural repair point for the stale derived values that skip leaves behind.
- **Live list views are not touched.** They do not start hiding records whose parent is trashed. That is a behaviour change to surfaces this phase is not chartered to modify.

**Purge & Retention**

- **Purge is admin-only**, matching TRASH-03's wording. Record owners can trash and restore their own records but cannot destroy them.
- **Retention is configured as `trash.retention_days` in the `app_settings` table**, default 30, bounded by an explicit min and max. This mirrors `audit.retention_days` deliberately — `src/lib/audit/settings.ts` already establishes the pattern: a JSONB value, a Zod schema validating it on every read, and a fail-closed path that disables the policy (rather than coercing garbage) when the stored value is corrupt. Phase 36 introduced `app_settings` with exactly one key and noted that later phases would add theirs; this is the second key.
- **Auto-purge is a daily setTimeout-chained background processor registered in `instrumentation.ts`**, copied in shape from `startAuditPruner` (`src/lib/audit/prune.ts:42`). setTimeout chaining rather than `setInterval` is the established repo convention for all four existing processors, precisely to prevent overlapping runs. Purging lazily on trash-page load was rejected: criterion 4 requires records to leave trash "with no admin action", which a page-load trigger does not guarantee.
  - **Deployment note**: Docker standalone builds have historically dropped `instrumentation.js`, which silently killed every processor in production (see STATE.md, 2026-08-08). The plan must confirm the new pruner actually runs in the container, not merely that it is registered.
- **A purge hard-deletes the record and its notes, and preserves its `audit_log` rows.** The audit table's FK-free `entity_id` is not an oversight — `src/db/schema/audit-log.ts` documents at length that a referential guard there "would erase exactly the evidence the log exists to keep". Purge writes one further audit row recording the purge itself.

**Data Model & Interface**

- **Four entity types get trash**: deals, people, organizations, activities. Notes carry `deleted_at` too but are timeline children of a record, not records in their own right; a note deleted from a timeline is restored from that timeline, not from a global trash tab.
- **"Deleted by" is derived, not stored.** Resolve it by reading the most recent `audit_log` row with `action = 'deleted'` for that `(entity_type, entity_id)` — Phase 36 already writes exactly this row on every delete, and the composite index `audit_log_entity_idx` already serves the lookup. No `deleted_by` column is added to any CRM table.
  - The planner should confirm the read is efficient for a whole page of trashed records (one batched query, not N+1) and should decide what the UI shows for a record deleted before Phase 36 shipped, where no audit row exists.
- **REST API gets the surface too**: a trash listing endpoint, a restore endpoint per entity, and an admin-gated purge endpoint, following the auth and shape conventions of the existing `src/app/api/v1/` routes (`src/app/api/v1/audit/route.ts:124` shows the admin gate).
- **No new CRM bus event types.** Restore and purge write audit rows; they do not emit `{entity}.restored`. Emitting a new event type means workflow trigger UI work, which belongs to Phase 41, and emitting an existing `.created` event on restore would be a lie to every subscriber.

### Claude's Discretion

- Tab vs. sub-route mechanics inside `/trash`, empty-state copy, and confirmation-dialog wording
- The exact min/max bounds on `trash.retention_days` and the pruner's batch size
- Whether the purge audit row uses `action: 'deleted'` with a distinguishing marker in `changes`, or another representation — the constraint is only that a purge is traceable afterwards
- Test placement and structure, subject to the suite staying green

### Deferred Ideas (OUT OF SCOPE)

- **Cascade-delete with a `deletion_batch_id`** — the literal reading of criterion 2. Revisit only if a delete path is found that genuinely orphans children.
- **`{entity}.restored` CRM bus events and workflow triggers on restore** — belongs with the workflow operator work in Phase 41.
- **Notes as a trash tab** — restoring a deleted note from its record timeline is separate work.
- **Live list views hiding records whose parent is trashed** — a behaviour change to existing surfaces; out of scope here.
- **Per-entity retention windows** — one global `trash.retention_days` until there is a reason for more.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TRASH-01 | User can view soft-deleted records per entity type, with deletion time and the actor who deleted them | § Trash Listing Query (index verified by `EXPLAIN`), § "Deleted By" Resolution (batched `DISTINCT ON`, template at `src/lib/timeline/sources.ts:705-782`), § Pitfall 4 ("Not recorded" is 100% of current live data), § Pitfall 5 (`apiKeyName` is unresolvable) |
| TRASH-02 | User can restore a soft-deleted record, including relinking children whose parent was deleted | § Cascade Verification (VERIFIED per entity: no relinking needed), § Restore Mutation Shape, § Pitfall 1 (`recalculateFormulas` no-ops on an empty `changedFields`) |
| TRASH-03 | Admin can permanently purge trashed records, and records past the retention window are purged automatically | § Purge Blast Radius (six FKs, all `NO ACTION`, empirically proven to block a bare `DELETE`), § Retention Pruner (template + Docker gate), § Don't Hand-Roll |

## Project Constraints (from CLAUDE.md)

**There is no `./CLAUDE.md` in this repository** (verified 2026-08-16 — the read failed with
"File does not exist"). There is no `.claude/skills/` and no `.agents/skills/` directory either.
The binding constraints come from the user's global memory file and from `.planning/STATE.md`:

| Constraint | Source | Effect on this phase |
|------------|--------|----------------------|
| **Always use Docker; never run a local dev server** | user memory | Verification runs against `http://localhost:3001`; never `npm run dev` |
| `docker` needs **no** `sudo`; never embed a password anywhere | user memory | Verified: `docker compose ps` works bare |
| `npx` resolves to `npm run` on the host — `npx drizzle-kit` fails with "Missing script" | STATE.md [Phase 36] | Use `./node_modules/.bin/drizzle-kit generate` on the host. `npx` works inside the container (the entrypoint uses it) |
| **Indexes are declared in the Drizzle schema and generated — never hand-written into migration SQL** | STATE.md [Phase 33] D-06 | A hand-written index was silently dropped by a later `generate` (0009 → 0010). *This phase needs no new index — see § Index Need* |
| `.planning` is gitignored-but-tracked | STATE.md [Phase 36] | Commit planning docs with `git add -f <specific file>`, never `git add -f <directory>` |
| A JS `Date` must never be bound into a raw drizzle `sql` fragment | STATE.md [Phase 35] | The pruner's cutoff must be computed server-side: `now() - make_interval(days => ${days})` |
| Every read path carries `isNull(table.deletedAt)` **explicitly** | STATE.md [Phase 35] | The trash query inverts it and must be equally explicit |
| A doc comment that NAMES a token gated at zero occurrences is itself a gate violation | STATE.md [Phase 35] | Applies to any `grep -c` gate the plan writes |

## Standard Stack

### Core

**No new dependency is introduced by this phase.** Every library below is already installed and
already in use on adjacent surfaces.

| Library | Version (installed) | Purpose | Why Standard |
|---------|--------------------|---------|--------------|
| `next` | 16.1.6 | RSC page shell, server actions, `instrumentation.ts` | Already the framework [VERIFIED: package.json + running container banner] |
| `drizzle-orm` | ^0.45.1 | Query builder for the trash list, restore `UPDATE`, purge teardown | Every mutation in `src/lib/mutations/` uses it [VERIFIED: package.json] |
| `zod` | ^4.3.6 | Validating `trash.retention_days` on read and write | `src/lib/audit/settings.ts:37` is the exact pattern [VERIFIED: source] |
| `next-intl` | ^4.8.3 | 61 new keys across three locale files | `src/messages/{en-US,es-ES,pt-BR}.json` [VERIFIED: filesystem] |
| `@tanstack/react-table` | ^8.21.3 | The trash table engine | Already behind all four list tables [VERIFIED: package.json] |
| `lucide-react` | ^0.575.0 | `Trash2`, `RotateCcw`, `Loader2`, `Workflow`, `Key`, `Download`, `Cog`, `Kanban`, `Users`, `Building2`, `CheckCircle2` | Zero new symbols per UI-SPEC [CITED: 37-UI-SPEC.md § Component Inventory] |
| `vitest` | ^4.0.18 | Two projects: base + `rsc` | `npm test` runs both [VERIFIED: package.json:11] |

### Supporting (already vendored, no `shadcn add`)

| Component | Path | When to Use |
|-----------|------|-------------|
| `tabs.tsx` | `src/components/ui/tabs.tsx` | The four per-entity tabs [VERIFIED: filesystem] |
| `table.tsx` | `src/components/ui/table.tsx` | The trash table; ships `overflow-x-auto` and `whitespace-nowrap` cells |
| `alert-dialog.tsx` | `src/components/ui/alert-dialog.tsx` | Purge confirmation + shorten-retention confirmation |
| `relative-time.tsx` | `src/components/ui/relative-time.tsx` | Every `deleted_at` cell; handles the SSR/CSR hydration guard |
| `card.tsx`, `button.tsx`, `badge.tsx`, `input.tsx`, `label.tsx`, `sonner.tsx`, `dropdown-menu.tsx` | `src/components/ui/` | All present [VERIFIED: `ls src/components/ui/`] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `DISTINCT ON` for "deleted by" | `LATERAL` join, one probe per row | Both are ONE round trip. `DISTINCT ON` matches `audit_log_entity_idx`'s `(entity_type, entity_id, created_at DESC)` ordering exactly and needs at most an Incremental Sort; `LATERAL` needs 50 index descents. Prefer `DISTINCT ON` |
| Hard `DELETE` per purge | `ON DELETE CASCADE` on the six FKs | Rejected: changing FK semantics alters what every *other* delete path can do, and this phase is explicitly not chartered to change delete behaviour. The ordered teardown is local to purge |
| New `AuditAction` literal `'purged'` | `action: 'deleted'` + a marker in `changes` | A 4th literal is a compile-error cascade across 4 files with exhaustive `Record<AuditAction, …>` maps — see § Pitfall 6. CONTEXT.md grants discretion; prefer the marker |

**Installation:** none. `npm install` is not run by this phase.

## Package Legitimacy Audit

**This phase installs no external packages.** Every library and every UI primitive it uses is
already a declared dependency of the repository, verified by reading `package.json` and
`src/components/ui/` on 2026-08-16.

| Package | Registry | Disposition |
|---------|----------|-------------|
| *(none)* | — | No install step in this phase |

**Packages removed due to slopcheck [SLOP] verdict:** none — no package was proposed.
**Packages flagged as suspicious [SUS]:** none.

The Package Legitimacy Gate is therefore not applicable. If the planner concludes a component must
be pulled from a registry, the UI-SPEC's § Registry Safety section must be revisited and the vetting
gate run **before** that component enters a plan.

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────────────┐
   GET /trash       │  src/app/trash/page.tsx   (server, RSC)      │
   ?type=&page= ───►│                                             │
                    │  1. resolve searchParams (default: deals)   │
                    │  2. auth() → { userId, role }               │
                    └──────────────┬──────────────────────────────┘
                                   │
                 ┌─────────────────┼──────────────────┬──────────────────┐
                 ▼                 ▼                  ▼                  ▼
        ┌────────────────┐ ┌──────────────┐  ┌────────────────┐ ┌──────────────┐
        │ 4× scoped      │ │ active tab   │  │ deleted-by     │ │ readTrash    │
        │ count(*)       │ │ rows + 2     │  │ batch lookup   │ │ RetentionDays│
        │ deleted_at     │ │ LEFT JOINs   │  │                │ │              │
        │ IS NOT NULL    │ │ (parent      │  │ DISTINCT ON    │ │ app_settings │
        │ + owner scope  │ │  trashed?)   │  │ (entity_id)    │ │ Zod, fail-   │
        │                │ │              │  │ FROM audit_log │ │ closed → null│
        │ *_deleted_at   │ │ *_deleted_at │  │ WHERE action=  │ │              │
        │ _idx           │ │ _idx (Index  │  │ 'deleted'      │ │              │
        │ (Index Only    │ │ Scan Back-   │  │ + 3 LEFT JOINs │ │              │
        │  Scan)         │ │ ward)        │  │ audit_log_     │ │              │
        │                │ │              │  │ entity_idx     │ │              │
        └────────┬───────┘ └──────┬───────┘  └───────┬────────┘ └──────┬───────┘
                 └────────────────┴──────────────────┴─────────────────┘
                                   │  plain serializable props only (CFUI-01)
                                   ▼
                    ┌─────────────────────────────────────────────┐
                    │ trash-tabs.tsx / trash-table.tsx  ('use client')
                    │  router.push('?type=') │ row actions
                    └──────────────┬──────────────────────────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────────┐
        ▼                          ▼                              ▼
  ┌───────────┐            ┌──────────────┐              ┌─────────────────┐
  │ restore   │            │ restoreWith  │              │ purge           │
  │ Record()  │            │ Linked()     │              │ Record()        │
  └─────┬─────┘            └──────┬───────┘              └────────┬────────┘
        │ auth: owner-or-admin    │ same, ∀ parent               │ auth: ADMIN ONLY
        ▼                         ▼                              ▼
  ┌──────────────────────────────────────────┐    ┌──────────────────────────────┐
  │ runWithActor({kind:'user', userId})       │    │ runWithActor(...)            │
  │  └► restore{Entity}Mutation               │    │  └► purge{Entity}Mutation    │
  │       UPDATE … SET deleted_at = NULL      │    │       db.transaction:        │
  │       recalculateFormulas(broad fields)   │    │       1. DELETE notes        │
  │       INSERT audit_log  (direct, no bus)  │    │       2. detach/DELETE FK    │
  │                                           │    │          children (per map)  │
  │  NO crmBus.emit — locked decision         │    │       3. DELETE the row      │
  └───────────────────┬───────────────────────┘    │       4. INSERT audit_log    │
                      │                            └──────────────┬───────────────┘
                      ▼                                           ▼
        ┌───────────────────────────────────────────────────────────────────┐
        │ 34 existing read paths, every one carrying isNull(t.deletedAt)     │
        │ lists · detail pages · /api/v1/* · search · export · dashboard ·   │
        │ timeline sources · email reminders · import                        │
        │  ⇒ a restored row REAPPEARS and a purged row DISAPPEARS with       │
        │    ZERO changes to any of them                                     │
        └───────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────────────┐
  │ instrumentation.ts  (Node runtime only, once per boot)                 │
  │   … 4 existing processors + startAuditPruner()                         │
  │   + startTrashPruner()   ← 60s initial delay, then daily setTimeout    │
  │        readTrashRetentionDays() → null ⇒ DELETE NOTHING (fail closed)  │
  │        else: for each of 4 entity types, batched ordered teardown      │
  │        logs a line EVERY tick, even at zero                            │
  └────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── app/
│   ├── trash/
│   │   ├── page.tsx              # server — searchParams, 4 counts, active-tab rows
│   │   ├── trash-tabs.tsx        # 'use client' — controlled Tabs, activationMode="manual"
│   │   ├── trash-table.tsx       # 'use client' — table, row actions, purge AlertDialog
│   │   ├── trash-columns.tsx     # 'use client' — per-entity ColumnDef builders
│   │   └── actions.ts            # server — restoreRecord/restoreWithLinked/purgeRecord
│   ├── admin/trash/
│   │   ├── page.tsx              # server — mirrors admin/audit/page.tsx
│   │   ├── retention-form.tsx    # 'use client' — mirrors admin/audit/retention-form.tsx
│   │   └── actions.ts            # server — saveTrashRetention, own admin check
│   └── api/v1/trash/             # REST listing + restore + admin-gated purge
├── lib/
│   ├── trash/
│   │   ├── settings.ts           # trash.retention_days — mirror of lib/audit/settings.ts
│   │   ├── queries.ts            # listTrashed / countTrashed / resolveDeletedBy
│   │   └── prune.ts              # startTrashPruner — mirror of lib/audit/prune.ts
│   └── mutations/
│       ├── deals.ts              # + restoreDealMutation, purgeDealMutation
│       ├── people.ts             # + restore/purge
│       ├── organizations.ts      # + restore/purge
│       └── activities.ts         # + restore/purge
└── messages/{en-US,es-ES,pt-BR}.json   # + trash.* (58) + admin.dashboard.* (2) + nav.trash (1)
```

Two directories, `src/lib/trash/` and `src/app/trash/`, keep the phase's surface auditable and
mirror `src/lib/audit/` exactly. `scripts/trash-checks.sql` is a live precedent worth following —
Phase 35 shipped `scripts/reconcile-notes.sql` and Phase 36 shipped `scripts/audit-log-checks.sql`
as standing database-level assertions.

---

### Pattern 1: Restore mutation (mirror of the delete mutation)

**What:** A single `UPDATE`, a formula repair, and a directly-written audit row.
**When to use:** All four entity types, identically.

```typescript
// Source: shape derived from src/lib/mutations/deals.ts:461-498 (the delete it mirrors)
export async function restoreDealMutation(
  id: string,
): Promise<{ success: true } | { success: false; error: string }> {
  // The existence check INVERTS the delete's predicate. `isNotNull`, never `isNull`.
  const deal = await db.query.deals.findFirst({
    where: and(eq(deals.id, id), isNotNull(deals.deletedAt)),
  })

  // Distinguish "already purged / never existed" from a generic failure — the UI-SPEC's
  // `trash.error.alreadyPurged` copy needs this discrimination (UI-SPEC Assumption 4).
  if (!deal) {
    return { success: false, error: "NOT_IN_TRASH" }
  }

  try {
    await db
      .update(deals)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(eq(deals.id, id))

    // Delete deliberately skips recalculation (deals.ts:475, plan 34-11). Restore is the
    // repair point. See Pitfall 1 for why `changedFields` must NOT be `[]`.
    await recalculateFormulas({
      entityType: "deal",
      entityId: id,
      changedFields: [
        CHANGED_FIELDS_CUSTOM_SENTINEL,
        ...Object.values(ENTITY_NATIVE_ATTRIBUTES.deal),
      ],
    })

    // NO crmBus.emit — locked decision. The audit row is written directly, so the actor must
    // be read from the ALS store the same way src/lib/events/subscribers/audit.ts:56 does.
    return { success: true }
  } catch (error) {
    console.error("Failed to restore deal:", error)
    return { success: false, error: "Failed to restore deal" }
  }
}
```

### Pattern 2: Purge as an ordered teardown inside one transaction

**What:** Notes first, then FK children by disposition, then the row, then the audit row.
**When to use:** Every purge, whether admin-triggered or pruner-triggered.

```typescript
// Source: teardown ordering pattern from src/lib/mutations/workflows.ts:200-212
// ("Cascade delete: steps -> runs -> workflow"), which is this repo's only existing
// multi-table hard delete.
await db.transaction(async (tx) => {
  // 1. Notes: polymorphic, NO foreign key (src/db/schema/notes.ts:16-20), so this cannot
  //    fail on a constraint and must be done explicitly or the rows dangle forever.
  await tx.delete(notes)
    .where(and(eq(notes.entityType, "deal"), eq(notes.entityId, id)))

  // 2. Pure children with no independent identity — hard delete.
  await tx.delete(dealAssignees).where(eq(dealAssignees.dealId, id))
  await tx.delete(dealStageHistory).where(eq(dealStageHistory.dealId, id))

  // 3. Independent entities that merely reference this one — DETACH, never delete.
  //    activities.deal_id is nullable. This DOES mutate a live activity; see Pitfall 3.
  await tx.update(activities)
    .set({ dealId: null, updatedAt: new Date() })
    .where(eq(activities.dealId, id))

  // 4. Now, and only now, the row itself.
  await tx.delete(deals).where(and(eq(deals.id, id), isNotNull(deals.deletedAt)))

  // 5. The purge's own audit row, INSIDE the transaction so a rollback cannot leave a
  //    record of a purge that did not happen. audit_log has no FK on entity_id, so the
  //    pre-existing rows for this record survive untouched — that is the design
  //    (src/db/schema/audit-log.ts:40-45).
  await tx.insert(auditLog).values({ /* … */ })
})
```

### Pattern 3: Batched "deleted by" — one query for a whole page

**What:** `DISTINCT ON` over `audit_log_entity_idx`, plus the three LEFT JOINs
`auditSource.hydrate` already uses.
**When to use:** Once per trash page render, per tab.

```sql
-- Source: index shape from src/db/schema/audit-log.ts:69
--   audit_log_entity_idx ON (entity_type, entity_id, created_at DESC NULLS LAST)
-- Join shape from src/lib/timeline/sources.ts:723-731
SELECT DISTINCT ON (al.entity_id)
       al.entity_id, al.actor_kind, al.created_at,
       u.id AS actor_id, u.name AS actor_name, u.email AS actor_email,
       w.id AS workflow_id, w.name AS workflow_name
FROM audit_log al
LEFT JOIN users          u  ON u.id  = al.actor_user_id
LEFT JOIN workflow_runs  wr ON wr.id = al.workflow_run_id
LEFT JOIN workflows      w  ON w.id  = wr.workflow_id
WHERE al.entity_type = $1            -- 'deal' | 'person' | 'organization' | 'activity'
  AND al.action      = 'deleted'
  AND al.entity_id   = ANY($2)       -- the 50 ids of the current page
ORDER BY al.entity_id, al.created_at DESC;
```

`ORDER BY entity_id, created_at DESC` is required by `DISTINCT ON` and is also exactly the index's
column order for a fixed `entity_type`, so the planner produces an `Index Scan` feeding at most an
`Incremental Sort` with `Presorted Key: entity_id` — measured on the structurally identical
`notes_live_idx` (same `(entity_type, entity_id, created_at DESC)` shape, 75,236 rows) with a
50-element literal id list.

An entity id absent from the result set means **no audit row exists** → render
`trash.actor.notRecorded`, never `audit.unknownActor`.

### Anti-Patterns to Avoid

- **A bare `DELETE FROM deals/people/organizations`.** Raises SQLSTATE 23503. Proven, see § Purge Blast Radius.
- **`recalculateFormulas({ …, changedFields: [] })` on restore.** Silently evaluates nothing. See Pitfall 1.
- **Reading `getCurrentActor()` inside a promise continuation** rather than at handler entry. `src/lib/events/subscribers/audit.ts:48-56` documents why: capture the actor into a local synchronously.
- **A module-level `AsyncLocalStorage` or `EventEmitter` `const`.** Next.js instantiates `instrumentation.ts`'s module graph separately from server actions'. `src/lib/audit/actor-context.ts:45-50` and `src/lib/events/bus.ts:25` both use a `globalThis` singleton for exactly this reason, and the failure mode was observed in the running container on 2026-08-16 (every audit row written as `system`).
- **Passing a React element from `page.tsx` into a Radix `asChild` slot.** A repo-wide gate (`src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx`) fails the build. Both `AlertDialog`s must live inside `'use client'` modules.
- **Hand-writing index DDL into a migration.** STATE.md Phase 33 D-06 — a hand-written index was silently dropped by a later `generate`. *(Moot here: no index is needed.)*
- **Binding a JS `Date` into a raw `sql` fragment.** postgres.js throws `ERR_INVALID_ARG_TYPE`; the near-miss `${date}::timestamp` truncates microseconds. Compute the cutoff server-side.
- **`setInterval` for the pruner.** All five existing processors chain `setTimeout` specifically so a slow tick cannot overlap the next.

## Cascade Verification (CONTEXT.md's central claim — VERIFIED)

CONTEXT.md asserts that no delete path in this repo nulls or cascades a child foreign key. **This is
correct.** Verified independently and per entity by three methods.

**Method 1 — every soft-delete write site.** `grep -rn "deletedAt: new Date()" src/` excluding tests
returns 14 sites. Nine are non-CRM (custom field definitions, pipelines, stages, users, API keys).
The five CRM sites are:

| Site | Statement | Nulls a child FK? |
|------|-----------|-------------------|
| `src/lib/mutations/deals.ts:477-480` | one `UPDATE deals SET deleted_at, updated_at` | **No** |
| `src/lib/mutations/people.ts:364-367` | one `UPDATE people SET deleted_at, updated_at` | **No** |
| `src/lib/mutations/organizations.ts:325-328` | one `UPDATE organizations SET deleted_at, updated_at` | **No** |
| `src/lib/mutations/activities.ts:340-343` | one `UPDATE activities SET deleted_at, updated_at` | **No** |
| `src/app/api/v1/{deals,people,activities}/[id]/route.ts` | inline `UPDATE … SET deleted_at, updated_at` + a `crmBus.emit` that mirrors the mutation's | **No** |

`DELETE /api/v1/organizations/[id]` (line 148) delegates to `deleteOrganizationMutation` rather than
inlining, so organizations have exactly one delete implementation.

**Method 2 — every hard delete in the repo.** `grep -rn "db.delete("` excluding tests returns 11
sites. Exactly **one** touches a CRM child table: `src/lib/mutations/deals.ts:394`,
`db.delete(dealAssignees).where(eq(dealAssignees.dealId, id))` — and it is inside
`updateDealMutation`'s assignee-replacement path, not a delete path. The other ten are stages,
webhooks, HTTP templates, workflows and workflow templates.

**Method 3 — live data.** With 12 trashed deals, 1 trashed person, 1 trashed organization and 1
trashed activity in the production database, zero `deal_assignees` / `deal_stage_history` rows and
one `activities` row point at a trashed deal, and that activity is *itself* soft-deleted. No row
anywhere has a dangling or nulled parent reference caused by a delete.

**Conclusion for the plan:** restore is `SET deleted_at = NULL` and nothing more. `deal_assignees`
and `notes` are untouched by any delete, so they need no restore handling at all. The plan should
carry this evidence so verification does not re-litigate it (CONTEXT.md § Specific Ideas asks for
exactly that).

## Purge Blast Radius (the single most consequential finding)

**Every FK pointing at a CRM table is `ON DELETE NO ACTION`.** Queried from the live catalog, not
inferred from Drizzle source:

| Constraint | Child table.column | Parent | `confdeltype` | Nullable? |
|------------|-------------------|--------|---------------|-----------|
| `activities_deal_id_deals_id_fk` | `activities.deal_id` | `deals` | `a` (NO ACTION) | **yes** |
| `deal_assignees_deal_id_deals_id_fk` | `deal_assignees.deal_id` | `deals` | `a` | no (PK part) |
| `deal_stage_history_deal_id_deals_id_fk` | `deal_stage_history.deal_id` | `deals` | `a` | no |
| `deals_organization_id_organizations_id_fk` | `deals.organization_id` | `organizations` | `a` | **yes** |
| `people_organization_id_organizations_id_fk` | `people.organization_id` | `organizations` | `a` | **yes** |
| `deals_person_id_people_id_fk` | `deals.person_id` | `people` | `a` | **yes** |

That is the complete set. A catalog sweep of every column named `*entity_id*`, `*deal_id*`,
`*person_id*`, `*organization_id*`, `*activity_id*`, `*entity_type*` or `*record_id*` in the public
schema returns exactly 11 columns across 7 tables — the six above plus `audit_log.entity_id/
entity_type` (no FK, by design), `notes.entity_id/entity_type` (no FK, polymorphic) and
`custom_field_definitions.entity_type` (a discriminator, not a reference). **There is no
`workflow_runs`, `import_sessions`, `digest_log` or `webhook_deliveries` reference to a CRM row.**

### Proven empirically (transactions rolled back, live database)

```
BEGIN; DELETE FROM deals WHERE id IN (SELECT deal_id FROM activities …LIMIT 1); ROLLBACK;
  ERROR:  update or delete on table "deals" violates foreign key constraint
          "activities_deal_id_deals_id_fk" on table "activities"

BEGIN; DELETE FROM organizations WHERE id IN (SELECT organization_id FROM deals …); ROLLBACK;
  ERROR:  … violates "people_organization_id_organizations_id_fk" on table "people"

BEGIN; DELETE FROM people WHERE id IN (SELECT person_id FROM deals …); ROLLBACK;
  ERROR:  … violates "deals_person_id_people_id_fk" on table "deals"

BEGIN; DELETE FROM activities WHERE id IN (SELECT id FROM activities LIMIT 1); ROLLBACK;
  DELETE 1                                        ← activities are a true leaf
```

Scale on the live database: **13,770 of 25,207 deals (54.6%) have at least one activity**, and
61,770 activities carry a `deal_id`. `deal_stage_history` and `deal_assignees` are both empty today
but are written on every stage change and every assignee edit, so they will not stay empty.

### Required disposition per FK

| Purging | Blocker | Disposition | Rationale |
|---------|---------|-------------|-----------|
| **deal** | `deal_assignees.deal_id` | **DELETE** | A join row with no independent identity; it means nothing without the deal |
| **deal** | `deal_stage_history.deal_id` | **DELETE** | Immutable history *of the deal*. It is not the audit log; the audit log keeps the evidence (schema comment at `deal-stage-history.ts:8-11` says pluggability lives in the assembler, not the table) |
| **deal** | `activities.deal_id` | **NULL (detach)** | An activity is an independent trashable entity with its own owner and its own trash tab. Deleting it would destroy a record the admin did not choose to destroy |
| **organization** | `deals.organization_id` | **NULL (detach)** | Same |
| **organization** | `people.organization_id` | **NULL (detach)** | Same |
| **person** | `deals.person_id` | **NULL (detach)** | Same |
| **activity** | *(none)* | — | Leaf; only its notes need clearing |
| **all four** | `notes.entity_type/entity_id` | **DELETE** | No FK, so nothing enforces it. CONTEXT.md locks "a purge hard-deletes the record and its notes" |
| **all four** | `audit_log.entity_type/entity_id` | **PRESERVE** | Locked. `audit-log.ts:40-45` documents that a referential guard here "would erase exactly the evidence the log exists to keep" |

**Two consequences the plan must state explicitly:**

1. **Purge is the ONE operation in this phase that creates the orphan state CONTEXT.md correctly
   says the delete paths never create.** Detaching `activities.deal_id` mutates a *live* activity
   that the purging admin never selected. That is unavoidable — the alternative is refusing to purge
   any deal with an activity, which would make the pruner unable to satisfy SC-4 for 54.6% of deals.
   The plan should decide whether the detach writes its own `audit_log` row on the detached child
   (recommended: yes — otherwise a live activity silently loses its deal with no trace) and whether
   the purge confirmation copy mentions it.
2. **"Refuse to purge when children exist" is not viable** for the same reason. Do not let the plan
   drift into it.

## Trash Listing Query & Index Need

**No new index is required. All four tables already have a plain btree on `deleted_at`,** contrary
to CONTEXT.md § Integration Points which states `deals` does not. Verified against
`drizzle/0012_typical_radioactive_man.sql:8`, `src/db/schema/deals.ts:27`, and the live `pg_indexes`
catalog:

| Table | Index | Source |
|-------|-------|--------|
| `deals` | `deals_deleted_at_idx` | migration 0012 (Phase 33) — **CONTEXT.md is wrong about this** |
| `people` | `people_deleted_at_idx` | migration 0012 |
| `organizations` | `organizations_deleted_at_idx` | migration 0012 |
| `activities` | `activities_deleted_at_idx` | migration 0012 |

`EXPLAIN (ANALYZE, BUFFERS)` on the live 25,207-row `deals` table:

```
Limit  (actual time=2.715..2.745 rows=12 loops=1)
  Buffers: shared hit=12 read=1
  ->  Index Scan Backward using deals_deleted_at_idx on deals
        Index Cond: (deleted_at IS NOT NULL)
Execution Time: 2.785 ms
```

`deleted_at IS NOT NULL` is an **index condition**, not a filter, and `ORDER BY deleted_at DESC` is
served by the backward scan — no sort node at all. The tab count is even better:

```
Aggregate  ->  Index Only Scan using activities_deleted_at_idx on activities
                 Index Cond: (deleted_at IS NOT NULL)   Heap Fetches: 1
Execution Time: 0.173 ms
```

With the owner scope and the two parent LEFT JOINs added, the plan stays an `Index Scan Backward`
with `owner_id` as a post-filter and `*_pkey` index scans for the parents (0.244 ms measured). The
owner filter is applied after the index cond, which is correct: the trashed set is small by
construction (it is bounded by the retention window), so filtering it is cheap and a composite
`(owner_id, deleted_at)` index would buy nothing.

**Therefore Phase 33 D-06 ("indexes are declared in the schema and generated, never hand-written")
does not bind this phase — because this phase declares no index.** If a later measurement changes
that, the rule applies in full.

## Read Path Inventory (which surfaces learn about restore/purge — answer: all of them, for free)

Every read path in the repository carries `isNull(table.deletedAt)` **explicitly** (a Phase 35
decision recorded in STATE.md: partial indexes do not enforce their own predicate). 34 non-test files
carry the predicate:

| Surface group | Files | What restore/purge does |
|---------------|-------|-------------------------|
| List pages | `src/app/{deals,people,organizations,activities}/page.tsx` | row reappears / disappears |
| Detail pages | `src/app/{deals,people,organizations,activities}/[id]/page.tsx` | page 404s → renders / renders → 404s |
| Server actions | `src/app/{deals,people,organizations,activities}/actions.ts` | record becomes editable / unfindable |
| REST list + detail | `src/app/api/v1/{deals,people,organizations,activities}/route.ts` and `[id]/route.ts` and `*/batch/route.ts` | same |
| **Search** | `src/app/api/search/route.ts:41,61,66,87` | reappears in search. **Note: only organizations, people and deals are searchable — activities are not in the search route at all** |
| **Export** | `src/lib/export/formatters.ts:253,273,294,326` | reappears in CSV / Pipedrive export (all four entities) |
| Dashboard | `src/lib/dashboard-queries.ts` | counts and charts update |
| Entity pickers | `src/lib/fetch-entities.ts` (`searchEntities`, `getEntityById`) | combobox options |
| Timeline | `src/lib/timeline/sources.ts` | notes/stage-history/audit sources |
| Email reminders | `src/app/api/internal/email/process/route.ts` | activity reminders resume |
| Team page | `src/app/team/page.tsx` | — |
| Import | `src/app/import/actions.ts`, `src/lib/import/pipedrive-api-import-actions.ts` | dedup matching |
| Formula cascade | `src/lib/formula-recalc.ts:886` | restored child re-enters the cascade |

**Nothing in this list needs to change.** `deleted_at IS NULL` is the universal live predicate; the
trash query is the only place in the codebase that must write `IS NOT NULL`, and SC-3 ("stops
appearing anywhere in the app") is satisfied structurally by the hard delete. This is the strongest
argument for keeping restore as a pure `deleted_at` write and adding no `restored_at`, `status` or
`trashed` column.

## Retention Pruner

`src/lib/audit/prune.ts` is the template and should be followed structurally, not merely in spirit.

| Property | `startAuditPruner` value | Recommendation for trash |
|----------|------------------------|--------------------------|
| `INITIAL_DELAY` | `60_000` | same — nothing here is time-critical |
| `TICK_INTERVAL` | `24 * 60 * 60 * 1000` | same. UI-SPEC copy already says "once a day" |
| `BATCH_SIZE` | `5_000` (measured 17.8 ms/batch) | **much smaller** — a trash purge is a multi-statement teardown per row, not one bulk `DELETE`. Suggest 100–500 and measure |
| `MAX_BATCHES_PER_TICK` | `20` (⇒ 100k rows/day cap) | a DoS control; keep the concept, size it to the batch |
| Fail-closed on `null` | logs and deletes nothing | **identical** — `readTrashRetentionDays()` returning `null` must mean purge nothing |
| Reschedule | tail `scheduleTick(TICK_INTERVAL)` **outside** the `try` | **identical** — a pruner that stops rescheduling after one bad read is a silently disabled policy |
| Logging | one line **every** tick, even at zero | **identical** — it is the only signal of starvation |
| `scheduleTick` visibility | module-private | **identical** — an exported one lets a caller start a second overlapping chain |
| Cutoff arithmetic | `now() - make_interval(days => ${days})`, server-side | **mandatory** — never bind a JS `Date` |

**The `ctid` batch-delete trick does NOT transfer.** `audit_log`'s pruner deletes from one table with
one statement, so `DELETE … WHERE ctid IN (SELECT ctid … LIMIT n)` is the right form (311 ms → 17.8 ms).
The trash pruner must run an ordered teardown per row, so it should instead **select a capped batch
of expired ids** (`SELECT id FROM deals WHERE deleted_at < now() - make_interval(days => $1) LIMIT $2`,
served by `deals_deleted_at_idx`) and then run the purge transaction for each. Do not copy the `ctid`
form into a context where it does not apply.

### The Docker standalone landmine — CURRENTLY MITIGATED, verified today

STATE.md 2026-08-08 records that Next.js standalone tracing omitted `instrumentation.js` from the
production image, silently killing **all four** processors. `Dockerfile:22-40` now copies
`instrumentation.js`, its `.map`, and every file listed in `instrumentation.js.nft.json` into
`.next/standalone/`.

**Verified working in the running container on 2026-08-16:**

```
docker compose logs app | …
  [webhook-processor] Starting with initial delay of 5s
  [email-processor] Starting with initial delay of 15s
  [schedule-processor] Starting with initial delay of 10s
  [execution-processor] Starting with initial delay of 5s
  [audit-prune] Starting with initial delay of 60s, ticking daily
  [audit-prune] deleted 0 row(s) older than 90d
```

Phase 36's pruner reaches the container correctly. **The residual risk is real, not theoretical:**
the copy step ends in `2>/dev/null || true`, so a build in which the chunk layout changes fails
silently. The plan's deployment gate must be behavioural:

```bash
docker compose up -d --build
sleep 5 && docker compose logs app | grep -F '[trash-prune] Starting'   # must match
```

A "registered in instrumentation.ts" code check is **not** sufficient evidence and must not be
accepted as one.

## Retention Setting

`src/lib/audit/settings.ts` is the key-for-key template. `app_settings` currently holds exactly one
row (`audit.retention_days` → `90`, seeded by migration `0014`). Adding `trash.retention_days`
requires:

- A new module `src/lib/trash/settings.ts` exporting `TRASH_RETENTION_KEY = "trash.retention_days"`,
  `RETENTION_MIN`/`RETENTION_MAX`, a `z.number().int().min().max()` schema, `readTrashRetentionDays()`
  (fail-closed → `null`, never a `?? 30` fallback), `writeTrashRetentionDays()` (validate before any
  DB call), and `readTrashStats()` for the `/admin/trash` readouts.
- **A hand-added `INSERT … ON CONFLICT DO NOTHING` seed in the generated migration** — the carve-out
  migration `0014` documents at length (lines 30-63): `drizzle-kit generate` manages DDL, never data
  rows, and applied migrations are append-only, so a data seed cannot be clobbered. This does **not**
  weaken Phase 33 D-06, which is about index DDL. The seed is what makes the 30-day default real on a
  fresh install without a code-level fallback.
- **Bounds:** the UI-SPEC recommends 1–365 (vs. audit's 1–3650) and default 30. Both are the
  planner's discretion per CONTEXT.md. Whatever ships, `trash.retention.windowHelp` copy, the
  `Input`'s `min`/`max`, and the Zod schema must all agree — and note that `retention-form.tsx`
  deliberately **hardcodes** the bounds rather than importing them (importing would pull `@/db` into
  the browser bundle). The mirror module must do the same, with the same comment.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reading a validated setting from `app_settings` | A bespoke JSONB reader | `src/lib/audit/settings.ts` copied key-for-key | Fail-closed semantics, the "default in data, fail closed in code" split, and error containment inside a timer tick are all subtle and already solved |
| A recurring background job | `setInterval`, a cron library, a page-load trigger | The `setTimeout` chain in `src/lib/audit/prune.ts:54-93` | All five processors use it precisely so a slow tick cannot overlap the next. A page-load trigger cannot satisfy SC-4 |
| Resolving an actor to a display name | A new join/resolver | `src/lib/timeline/sources.ts:705-782` `auditSource.hydrate` | Already handles the "`api_key` stores the key OWNER in `actor_user_id`" trap and the "workflow deleted → kind label, never a dead link" degradation |
| Rendering actor kinds | New badge components + new i18n keys | `audit.actorKind.{workflowRun,apiKey,import,system}` + `audit.unknownActor`, already in all three locales | UI-SPEC § Reused keys explicitly forbids duplicating these under `trash.*` |
| Multi-table hard delete ordering | Ad-hoc `DELETE`s in whatever order | `src/lib/mutations/workflows.ts:200-212` ordered teardown, wrapped in `db.transaction` | The only existing precedent; the FK errors above are what happens without it |
| Restoring formula-derived values | A bespoke recompute | `recalculateFormulas` with a broad `changedFields` | Budget capping, cascade depth, error containment and definition caching are all already solved and load-bearing (T-34-02, T-34-03) |
| Relative timestamps | `Intl.RelativeTimeFormat` inline | `src/components/ui/relative-time.tsx` | Handles the SSR/CSR hydration guard |
| Locale drift detection | Manual review | Extend `REQUIRED_TRASH_KEYS` in `src/messages/locale-parity.test.ts` | Five assertions (existence, non-empty, not-untranslated-in-both, placeholder survival, exact key-set identity) come for free |

**Key insight:** Phase 36 shipped, three weeks ago, a fully-worked reference implementation of
*every non-UI mechanism this phase needs* — settings, pruner, actor resolution, admin gate, admin
retention page. The single largest risk to this phase is a plan that re-derives any of them instead
of mirroring them.

## Common Pitfalls

### Pitfall 1: `recalculateFormulas` silently no-ops on restore

**What goes wrong:** Restore calls `recalculateFormulas({ entityType, entityId, changedFields: [] })`
(or `['deletedAt']`) and zero formulas are evaluated. The stale derived values plan 34-11 recorded
survive the restore, and the CONTEXT.md decision "restore is the natural repair point" is silently
unfulfilled. Every test passes.

**Why it happens:** `scopeFormulasToChangedFields` (`formula-recalc.ts:337`) is explicitly the SC-4
gate — *"a save that touches nothing a formula reads must produce zero evaluations and zero writes"*.
A formula enters scope only if one of its refs matches `changedFields` (via its own name, via
`NATIVE_ATTRIBUTE_COLUMNS[ref]`, or via the `CHANGED_FIELDS_CUSTOM_SENTINEL` for non-native refs).
`deletedAt` is not a referenceable attribute for any entity type, so it matches nothing.

**How to avoid:** Pass a `changedFields` list that puts every formula in scope:

```typescript
changedFields: [
  CHANGED_FIELDS_CUSTOM_SENTINEL,                        // every custom-field ref
  ...Object.values(ENTITY_NATIVE_ATTRIBUTES[entityType]) // every native column ref
]
```

Both constants are exported from `@/lib/formula-recalc`. Do **not** hardcode the column list —
`deals.test.ts:28-34` establishes the precedent of importing `ENTITY_NATIVE_ATTRIBUTES` via
`importOriginal` so the assertion compares against the single source of truth.

**Warning signs:** the restore test asserts `recalculateFormulas` *was called* rather than asserting
on the `changedFields` it was called with; a restored record's formula field still shows a
pre-delete value in the browser.

**Related:** call it **after** the `UPDATE`. `loadRow` (line 622) does **not** filter `deleted_at`, so
recalculating the record itself would work either way — but `cascadeToChildren` (line 886) filters
`isNull(relation.deletedAt)`, so children only re-enter the cascade once the parent is live. And
restoring an *organization* is the case that matters: the cascade walks
`organization → deal`, `organization → person`, `person → deal`, `deal → activity`
(`CASCADE_CHILD_RELATIONS`, line 225), which is exactly the direction that repairs dot-ref formulas
on the children.

### Pitfall 2: A bare `DELETE` on a purge

**What goes wrong:** SQLSTATE 23503, an unhandled rejection, and — in the pruner — a tick that dies.
**Why it happens:** every FK is `ON DELETE NO ACTION`; 54.6% of deals have an activity.
**How to avoid:** the ordered teardown in Pattern 2, inside `db.transaction`.
**Warning signs:** a purge test that mocks `db.delete` and never exercises the constraint. The only
honest test of this is `scripts/trash-checks.sql` or a manual `BEGIN/ROLLBACK` probe against the
container.

### Pitfall 3: Detaching a live child is an invisible mutation

**What goes wrong:** purging a deal sets `activities.deal_id = NULL` on live activities belonging to
other users. Their activity silently loses its deal, with no audit row and no notification.
**How to avoid:** decide deliberately. Recommended: write an `audit_log` row per detached child
(`action: 'updated'`, `changes: { dealId: { from: <id>, to: null } }`) inside the same transaction —
`dealId`, `organizationId` and `personId` are all already in `AUDIT_FIELD_LABELS`
(`present.ts:66-74`), so the timeline renders it correctly with no new code. Note that the label
resolver will render the *from* id as "no longer available" once the parent row is gone; that is
honest and is the existing degradation path.
**Warning signs:** the purge dialog copy says only "{name} and its notes will be permanently
deleted" while the transaction touches three other tables.

### Pitfall 4: Collapsing "Not recorded" into "Unknown user"

**What goes wrong:** a record deleted before Phase 36 shipped renders as if a deleted user deleted it.
**Scale, measured on the live database today:** **15 soft-deleted records exist and `audit_log`
contains ZERO rows with `action = 'deleted'`.** So on the current production data, *100%* of the
trash view renders `trash.actor.notRecorded`. This is not an edge case — it is the entire dataset
until the next delete happens.
**How to avoid:** absence from the `DISTINCT ON` result set ⇒ `trash.actor.notRecorded`; presence
with `actor_kind = 'user'` and a null joined user ⇒ `audit.unknownActor`. Two different strings, per
UI-SPEC and CONTEXT.md § Specific Ideas.
**Warning signs:** the "deleted by" resolver returns `null` for both cases with no discriminator.

### Pitfall 5: The UI-SPEC's `api_key` name is unresolvable

**What goes wrong:** the plan tries to render "the key name beside it when known" for an `api_key`
actor and finds no column to read.
**Why it happens:** `audit_log` has `actor_user_id`, `workflow_run_id` and `import_session_id` and
nothing else (`audit-log.ts:53-55`). `src/lib/timeline/sources.ts:775-782` documents that
`apiKeyName` is **ALWAYS NULL, AND HONESTLY SO**, and that resolving through `actor_user_id` "would
pick an arbitrary one of that user's keys and print it as fact". Recording a key id is a schema
change that Phase 36 deliberately declined.
**How to avoid:** the `api_key` badge shows the kind label only. `import` is the same — every
`runWithActor({ kind: "import", … })` call site in `src/app/import/actions.ts` passes
`importSessionId: null`, and `hydrate` does not join `import_sessions` anyway. The plan should
correct the UI-SPEC on this point rather than silently under-delivering it.

### Pitfall 6: Widening `AuditAction` with a `'purged'` literal

**What goes wrong:** a one-word schema change becomes a four-file compile cascade.
**Where it bites:** `AuditAction` is declared **twice** — `src/db/schema/audit-log.ts:23` and
`src/lib/timeline/types.ts:105` — and consumed by two exhaustive maps that will fail to compile:
`ACTION_BADGE_VARIANT: Record<AuditAction, …>` (`run-changed-records.tsx:54`) and
`ACTION_RANK: Record<AuditAction, number>` (`linked-records.ts:40`), plus a branch in
`buildAuditFieldChanges` (`present.ts:450`) and the `/api/v1/audit` filter validation.
**How to avoid:** CONTEXT.md grants discretion. Prefer `action: 'deleted'` with a distinguishing
marker in `changes` (e.g. `{ __purge: { from: null, to: true } }`) — but note that
`buildAuditFieldChanges` returns `[]` for `action === "deleted"` regardless of the map, so a marker
key will never render in the timeline. That is *fine* for a purge (the record's timeline is
unreachable), and it is a reason to prefer the marker.
**Also note:** the audit row for a delete is a **full tombstone** — `buildChanges`
(`diff.ts:136-163`) diffs the whole `previous` row against `{}`, so `changes` holds every field's
pre-delete value. `present.ts:434` calls it "a restore payload (Phase 37)". It is *not needed* for
restore (clearing `deleted_at` is enough) but it does mean **a purge leaves the record's full
content in `audit_log`** — worth stating in the plan, since the purge dialog copy promises "Its
change history is kept" and an operator may reasonably read that as metadata only.

### Pitfall 7: Restore cannot distinguish "already purged" from a generic failure

**What goes wrong:** the UI shows "try again" for a record that no longer exists; the user retries
forever. UI-SPEC Assumption 4 flags this explicitly and the copy contract has two strings for it.
**How to avoid:** the restore mutation's existence check is `and(eq(t.id, id), isNotNull(t.deletedAt))`.
A miss means either purged or already restored — both map to `trash.error.alreadyPurged` + a
`router.refresh()`, not to `trash.error.restoreFailed`. Return a discriminated error code
(`"NOT_IN_TRASH"`), not a prose string the action has to string-match.

### Pitfall 8: RSC boundary violation on either new page

**What goes wrong:** Radix's `SlotClone` renders `null` for an `asChild` slot that receives an
element from across the RSC boundary, and the record silently does not render.
**How to avoid:** both `AlertDialog`s live inside `'use client'` modules, controlled
(`open`/`onOpenChange`) with no trigger component of their own — the shape
`admin/audit/retention-form.tsx` and `components/timeline/delete-note-dialog.tsx` both document.
`page.tsx` on both routes passes only plain serializable values.
**Gate:** `src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx` scans all 193 `.tsx`
files repo-wide and fails the build.

### Pitfall 9: The audit actor never reaches the audit row

**What goes wrong:** every restore/purge audit row is written as `actor_kind: 'system'` with a null
user, silently defeating TRASH-01 for the very rows this phase creates.
**Why it happens:** two independent traps, both already hit in this repo. (1) A module-level
`AsyncLocalStorage` `const` gives the writer and the reader two different instances in a production
Next build — `actor-context.ts:30-50` documents observing exactly this in the container on
2026-08-16, and fixes it with a `globalThis` singleton. (2) The actor must be captured
**synchronously at handler entry**, before any promise is created (`subscribers/audit.ts:48-56`).
**How to avoid:** every new server action wraps its mutation in
`runWithActor({ kind: "user", userId: session.user.id }, () => …)`, exactly as
`src/app/deals/actions.ts:36,87,159,195,232` does; the mutation reads `getCurrentActor()` into a
local before building the insert. The **pruner** has no session, so it must either establish
`runWithActor({ kind: "system", userId: null }, …)` explicitly or rely on the subscriber's
documented `actor?.kind ?? "system"` fallback — prefer the explicit wrap, so "no actor established"
and "genuinely system" stay distinguishable.

## Code Examples

### Trash list query with counts, parent-trashed flags, and owner scope

```typescript
// Source: predicate convention from STATE.md [Phase 35]; join shape EXPLAIN-verified
// on the live database (Nested Loop Left Join + Index Scan Backward, 0.244 ms).
const scope = role === "admin" ? undefined : eq(deals.ownerId, userId)

const rows = await db
  .select({
    id: deals.id,
    title: deals.title,
    deletedAt: deals.deletedAt,
    organizationName: organizations.name,
    // Computed server-side in the same query — UI-SPEC Assumption 2.
    organizationTrashed: isNotNull(organizations.deletedAt),
    personTrashed: isNotNull(people.deletedAt),
  })
  .from(deals)
  .leftJoin(organizations, eq(organizations.id, deals.organizationId))
  .leftJoin(people, eq(people.id, deals.personId))
  .where(and(isNotNull(deals.deletedAt), scope))   // IS NOT NULL — the one inversion
  .orderBy(desc(deals.deletedAt))
  .limit(50)
  .offset(page * 50)
```

### Pruner tick body (structure copied from `src/lib/audit/prune.ts:54-93`)

```typescript
// Source: src/lib/audit/prune.ts — reschedule OUTSIDE the try, log every tick.
function scheduleTick(delay: number): void {
  setTimeout(async () => {
    try {
      const days = await readTrashRetentionDays()

      if (days === null) {
        // FAILS CLOSED. `null` is what an unset, cleared, corrupted, out-of-range or
        // pre-migration settings row produces. Never `?? 30` — the 30-day default is a
        // SEEDED app_settings row, not a code fallback.
        console.log("[trash-prune] retention unset or invalid — nothing purged")
      } else {
        let total = 0
        for (const entityType of TRASH_ENTITY_TYPES) {
          // Cutoff computed SERVER-SIDE from a bound day count. Never bind a JS Date.
          const expired = await db.execute(sql`
            SELECT id FROM ${table(entityType)}
            WHERE deleted_at < now() - make_interval(days => ${days})
            LIMIT ${BATCH_SIZE}
          `)
          for (const row of expired) {
            await purgeMutation(entityType, row.id)   // the ordered teardown, in a tx
            total += 1
          }
        }
        // Logged EVERY tick, even at zero: the only signal the pruner is falling behind.
        console.log(`[trash-prune] purged ${total} record(s) older than ${days}d`)
      }
    } catch (error) {
      console.error("[trash-prune] Tick error:", error)
    }
    scheduleTick(TICK_INTERVAL)   // outside the try — always reschedules
  }, delay)
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No `deleted_at` index on any CRM table | Plain btree on all four | Phase 33, migration `0012` | The trash query needs no new index — CONTEXT.md's "deals does not have one" is stale |
| No settings table | `app_settings` (jsonb, Zod-validated, fail-closed) | Phase 36, migration `0014` | `trash.retention_days` is the second key, not a new mechanism |
| No record of who deleted anything | `audit_log` with a full tombstone + actor on every delete | Phase 36 | TRASH-01's "actor who deleted them" is a read, not a schema change |
| Processors dead in the Docker image | `Dockerfile:22-40` copies `instrumentation.js` + its nft deps | 2026-08-08 hotfix | Verified working today; the residual `|| true` risk means the gate must be behavioural |
| One vitest project | Two — base + `rsc` (`vitest.rsc.config.ts`) | Phase 44 | `npm test` runs both sequentially |

**Deprecated / outdated in this repo:**

- `notes` legacy columns are dormant, **not** dropped (STATE.md Phase 35) — keeps
  `scripts/reconcile-notes.sql` re-runnable. Do not touch them.
- The "partial index on `next_run_at` WHERE active=true" precedent in older notes is a
  **cautionary tale, not a supporting pattern** — that index was silently dropped by migration
  `0010` (STATE.md Phase 33).

## Runtime State Inventory

*(Not a rename/refactor/migration phase — but this phase writes runtime state, so the categories are
answered to keep the deployment surface explicit.)*

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `app_settings` gains a `trash.retention_days` row. 15 rows currently carry a non-null `deleted_at` (12 deals, 1 person, 1 organization, 1 activity) and become visible in `/trash` on first deploy | Data seed via `INSERT … ON CONFLICT DO NOTHING` in the generated migration |
| Live service config | None — no external service holds trash config | None |
| OS-registered state | None — the pruner is an in-process `setTimeout`, not a cron entry or a systemd unit | None |
| Secrets / env vars | None — no new env var. `DATABASE_URL`, `AUTH_SECRET` unchanged | None |
| Build artifacts | `instrumentation.js` + its `nft.json` deps must reach `.next/standalone/`. Verified present and working for `[audit-prune]` today | Rebuild the image (`docker compose up -d --build`) and grep the logs for `[trash-prune] Starting` |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker + compose | All verification | ✓ (no sudo) | 3 services up | — |
| PostgreSQL | Everything | ✓ | 16-alpine, healthy 7 days, port 5433 | — |
| App container | Behavioural gates | ✓ | Next.js 16.1.6, port 3001 | — |
| Node | Host tests | ✓ | 20-alpine in image | — |
| `drizzle-kit` | Migration generation | ✓ | via `./node_modules/.bin/drizzle-kit` on the host | `npx` **inside** the container |
| `vitest` | Test suite | ✓ | ^4.0.18, two projects | — |
| Mailhog | Not used by this phase | ✓ | port 8025 | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** `npx drizzle-kit` fails on the host (`npx` resolves to
`npm run` here) — use `./node_modules/.bin/drizzle-kit generate`.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^4.0.18, **two projects** |
| Config files | `vitest.config.ts` (base, `environment: 'node'`, `include: src/**/*.{test,spec}.*`, excludes `*.rsc.test.*`) and `vitest.rsc.config.ts` (`include: src/**/*.rsc.test.*`, `ssr.resolve.conditions: ['react-server', …]`) |
| Quick run command | `npx vitest run src/lib/trash src/lib/mutations` *(host; `npx vitest` works — it is `npx drizzle-kit` that is broken)* |
| Full suite command | `npm test` → `vitest run && vitest run --config vitest.rsc.config.ts` |
| Additional gates | `npm run typecheck` (`tsc --noEmit`), `npm run lint` (eslint) — both green today and both in CI (`.github/workflows/ci.yml`, required check on `master`) |

**Every test in this repo mocks `@/db` wholesale.** `vi.mock("@/db", () => ({ db: { query: {…},
insert: vi.fn(), update: vi.fn(), delete: vi.fn(), select: vi.fn() } }))` is the universal opening of
`src/lib/mutations/*.test.ts`; `prune.test.ts` narrows it to a single `execute` deliberately so that
"any other query the implementation grows surfaces as a TypeError instead of being absorbed by a
permissive mock". **There is no integration-test harness and this phase must not build one.** The
database-level facts (FK behaviour, index usage, teardown ordering) belong in a checked-in SQL
assertion script, following `scripts/audit-log-checks.sql` (Phase 36) and
`scripts/reconcile-notes.sql` (Phase 35).

**Client components are not rendered in tests** (STATE.md Phase 44: "Rendering a 'use client'
component needs jsdom plus a testing library, which phase 44 must not install"). Client wiring is
gated by comment-stripped **source reads**; behaviour is unit-tested in the pure helpers.

### Phase Requirements → Test Map

| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|--------------|
| TRASH-01 | Trash query returns only `deleted_at IS NOT NULL`, ordered DESC, owner-scoped for non-admins | unit (mocked db, SQL compiled via `PgDialect`, as `prune.test.ts:52` does) | `npx vitest run src/lib/trash/queries.test.ts` | ❌ Wave 0 |
| TRASH-01 | "Deleted by" resolves in ONE query for a page of N ids (not N queries) | unit — assert `db.execute`/`db.select` called exactly once | `npx vitest run src/lib/trash/queries.test.ts` | ❌ Wave 0 |
| TRASH-01 | No audit row ⇒ `notRecorded`; `user` actor with null join ⇒ `unknownActor`; the two never collapse | unit (pure presenter) | `npx vitest run src/lib/trash/present.test.ts` | ❌ Wave 0 |
| TRASH-01 | 61 new keys exist, non-empty, translated, placeholders preserved, key-set identical in all 3 locales | unit | `npx vitest run src/messages/locale-parity.test.ts` | ✅ exists — extend with `REQUIRED_TRASH_KEYS` |
| TRASH-02 | Restore issues `SET deleted_at = NULL` and nothing else; existence check uses `isNotNull` | unit | `npx vitest run src/lib/mutations/deals.test.ts` | ✅ extend |
| TRASH-02 | Restore calls `recalculateFormulas` with a `changedFields` containing the sentinel **and** every native column (Pitfall 1) | unit — assert on the argument, not the call | `npx vitest run src/lib/mutations/deals.test.ts` | ✅ extend |
| TRASH-02 | A record not in trash returns the discriminated `NOT_IN_TRASH` code | unit | `npx vitest run src/lib/mutations/deals.test.ts` | ✅ extend |
| TRASH-02 | `restoreWithLinked` restores the child and every trashed parent, and reports the count | unit | `npx vitest run src/app/trash/actions.test.ts` | ❌ Wave 0 |
| TRASH-03 | Purge issues the teardown in order (notes → join/history → detach → row → audit) inside one transaction | unit — mocked `db.transaction`, assert call order | `npx vitest run src/lib/mutations/deals.test.ts` | ✅ extend |
| TRASH-03 | Non-admin purge is rejected by the **server action**, not just hidden in the client | unit | `npx vitest run src/app/trash/actions.test.ts` | ❌ Wave 0 |
| TRASH-03 | Pruner fails closed on `null` retention — asserted by the **absence** of any db call | unit (fake timers, `prune.test.ts` is the template) | `npx vitest run src/lib/trash/prune.test.ts` | ❌ Wave 0 |
| TRASH-03 | Pruner always reschedules, even after a thrown tick | unit (fake timers) | `npx vitest run src/lib/trash/prune.test.ts` | ❌ Wave 0 |
| TRASH-03 | Pruner is capped at `MAX_BATCHES_PER_TICK` | unit | `npx vitest run src/lib/trash/prune.test.ts` | ❌ Wave 0 |
| SC-3 / FK | Every FK pointing at a CRM table is accounted for by the teardown; a purge leaves no dangling `notes` row and no orphaned `deal_assignees`/`deal_stage_history` | **SQL assertion script** — the only honest test of a real constraint | `docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f -' < scripts/trash-checks.sql` | ❌ Wave 0 |
| SC-4 / deploy | The pruner actually starts in the container | **behavioural gate** | `docker compose logs app \| grep -F '[trash-prune] Starting'` | ❌ Wave 0 |
| CFUI-01 | No server module hands children to a Radix `asChild` component | unit (repo-wide scan) | `npx vitest run src/app/admin/fields/**/rsc-boundary.test.tsx` | ✅ exists — passes automatically if the split is correct |

### Sampling Rate

- **Per task commit:** `npx vitest run <the touched test file(s)>` + `npm run typecheck`
- **Per wave merge:** `npm test` (both projects) + `npm run lint`
- **Phase gate:** `npm test` green, `npm run typecheck` clean, `npm run lint` 0 errors,
  `scripts/trash-checks.sql` all-pass against the container, and
  `docker compose logs app | grep -F '[trash-prune] Starting'` matching after a
  `docker compose up -d --build`. The CI check `ci` is a required status on `master`.

### Wave 0 Gaps

- [ ] `src/lib/trash/queries.test.ts` — TRASH-01 list/count/deleted-by shape
- [ ] `src/lib/trash/settings.test.ts` — TRASH-03 fail-closed read, validated write (mirror of `src/lib/audit/settings.test.ts`)
- [ ] `src/lib/trash/prune.test.ts` — TRASH-03 fail-closed, capped, always-reschedules (mirror of `src/lib/audit/prune.test.ts`; **the only fake-timer precedent in the repo**)
- [ ] `src/lib/trash/present.test.ts` — TRASH-01 actor presentation, `notRecorded` vs `unknownActor`
- [ ] `src/app/trash/actions.test.ts` — authorization gates on restore/restoreWithLinked/purge
- [ ] `scripts/trash-checks.sql` — FK/teardown/dangling-row assertions against a real database
- [ ] Extend `src/messages/locale-parity.test.ts` with `REQUIRED_TRASH_KEYS` (61 keys) — **the UI-SPEC states this is part of the phase's work, not a nice-to-have**
- [ ] Extend `src/lib/mutations/{deals,people,organizations,activities}.test.ts` with restore + purge blocks
- Framework install: **none needed** — vitest is configured and green.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `auth()` in every server action; `withApiAuth` in every `/api/v1/` route. No new auth code |
| V3 Session Management | no | Auth.js JWT strategy unchanged |
| **V4 Access Control** | **yes — the highest-risk area of this phase** | Owner-or-admin for read/restore (`record.ownerId !== session.user.id && session.user.role !== "admin"`, the shape at `src/app/deals/actions.ts:83`); **admin-only for purge**, re-checked server-side. Hiding the button is never the gate |
| V5 Input Validation | yes | `?type=` narrowed to the four literals before it reaches any predicate (the `assertEntityType` posture at `src/lib/timeline/assemble.ts:33-41`); `page` parsed and clamped; `trash.retention_days` Zod-validated before any DB call |
| V6 Cryptography | no | No new crypto |
| V7 Error Handling & Logging | yes | Every purge and restore writes an `audit_log` row; the pruner logs a line every tick, even at zero. Never log record contents — `formula-recalc.ts:927` establishes "identifiers and counts only" (T-34-06) |

### Known Threat Patterns for Next.js 16 / Drizzle / Postgres

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A non-admin POSTs directly to the purge server action | Elevation of Privilege | Re-check `session.user.role !== "admin"` inside the action (`src/app/admin/audit/actions.ts:26-30` is the exact precedent, with a comment explaining why the layout redirect is insufficient) |
| A user restores or enumerates another user's trashed records | Information Disclosure | Owner-or-admin predicate applied **in the query**, not after; tab counts scoped identically to rows (UI-SPEC: a count a user cannot explain is a visible defect) |
| `?type=` injected into a hand-composed SQL fragment | Tampering | Validate against the four literals **before** composing any predicate. Prefer the Drizzle builder — the timeline assembler is the only hand-composed SQL in the codebase and is documented as such |
| Retention set to 0 or negative, used as a mass-destruction primitive | Denial of Service / Tampering | `RETENTION_MIN = 1` is a **control**, not ergonomics (`settings.ts:22-27`, T-36-07). Validate before write, and again on read |
| A corrupted/tampered `app_settings` row resumes purging at a code default | Tampering | **No `?? 30` fallback.** `null` means purge nothing. Default lives in the seeded data row |
| One pruner tick takes a long write lock | DoS | `MAX_BATCHES_PER_TICK` cap, per `prune.ts:31-39` — accept starvation over lock contention, and log the total so the shortfall is visible |
| Purge erases the evidence of the purge | Repudiation | `audit_log` has no FK on `entity_id` by design; purge preserves prior rows and writes one more, inside the same transaction |
| An unattributed restore/purge acquires a `system` identity silently | Repudiation | `getCurrentActor()` returns `undefined` outside a boundary and must not be mapped to `system` implicitly. Wrap every action in `runWithActor` |
| A purge audit row leaks the full record content | Information Disclosure | Already true of every delete tombstone (`diff.ts:145`). Not introduced here, but the purge dialog's "Its change history is kept" should not be read as "metadata only". Bounded by `audit.retention_days` |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The batched `DISTINCT ON` stays one query at production audit-log volume. The `audit_log` table holds only 52 rows today (0 with `action='deleted'`), so the plan was measured on the structurally identical `notes_live_idx` (75,236 rows, same `(entity_type, entity_id, created_at DESC)` shape) rather than on `audit_log` itself | Pattern 3 | Low. Worst case is an `Incremental Sort` over the matched rows, which is bounded by page size (50). The UI-SPEC's stated fallback (smaller page size) applies |
| A2 | A batch size of 100–500 is right for the trash pruner | Retention Pruner | Low. It is a tunable constant, and CONTEXT.md grants discretion. Should be measured once against a seeded batch |
| A3 | Detaching (`SET fk = NULL`) is preferable to refusing or cascade-deleting live children on purge | Purge Blast Radius | **Medium — this is a product decision the plan should surface, not bury.** Refusing breaks SC-4 for 54.6% of deals; cascade-deleting destroys records the admin never selected. Detaching is the least-bad option but it does mutate live data |
| A4 | Writing an `audit_log` row per detached child is the right level of traceability | Pitfall 3 | Low-medium. It is extra writes per purge; the alternative is a silent mutation |
| A5 | The `2>/dev/null \|\| true` in `Dockerfile:24` will not silently break on the next Next.js minor | Retention Pruner | Medium — it broke once already (2026-08-08). Mitigated entirely by making the log-line grep a required gate rather than a nice-to-have |
| A6 | Bounds 1–365 with default 30 (vs. audit's 1–3650 / 90) | Retention Setting | Low. Discretionary; the only hard requirement is that the Zod schema, the `Input` `min`/`max` and the `windowHelp` copy agree |
| A7 | `action: 'deleted'` + a marker in `changes` is preferable to a new `'purged'` literal | Pitfall 6 | Low. CONTEXT.md explicitly grants discretion; the marker avoids a four-file compile cascade |

## Open Questions

1. **Should the purge dialog copy mention detached children?**
   - What we know: purging a deal nulls `activities.deal_id` on live activities (0–117 per deal on
     live data; avg 4.49, p99 33 per `CASCADE_CHILD_RELATIONS`' Phase 33 measurements).
   - What's unclear: the UI-SPEC's locked description is *"{name} and its notes will be permanently
     deleted. This can't be undone. Its change history is kept."* — silent on the detach.
   - Recommendation: keep the locked string (changing it means new copy and a UI-SPEC amendment) but
     **write the detach into `audit_log`** so it is discoverable afterward. Raise the copy question
     as a plan-level note rather than resolving it unilaterally.

2. **Does the pruner purge a record whose parent purge would cascade into it?**
   - What we know: a trashed deal and a trashed activity pointing at it can both expire in the same
     tick. Order matters: purging the deal first detaches the (trashed) activity, then the activity
     is purged normally. Purging the activity first is also fine.
   - What's unclear: nothing structurally — but a per-entity-type loop with a fixed order
     (activities → deals → people → organizations, i.e. leaves first) minimises detach churn.
   - Recommendation: fix the order explicitly and comment why, rather than iterating an object's keys.

3. **What does `/trash` show for a record whose owner was soft-deleted?**
   - What we know: `users` has a `deleted_at` and `src/app/admin/users/actions.ts:105,183` sets it.
     `resolveActorRole` returns `null` for a soft-deleted user and `/api/v1/audit` treats that as
     "deny".
   - What's unclear: whether a trashed record owned by a deactivated user should be visible to
     admins only or to nobody.
   - Recommendation: admins see everything (they already do for live records); leave the owner-scope
     predicate keyed on `ownerId` alone, unchanged from the live lists.

4. **`MISSING_MESSAGE: deals.createdAt (en-US)` is being thrown in the running container.**
   - Pre-existing, unrelated to this phase, visible in `docker compose logs app` today. Flagged so
     it is not mistaken for a Phase 37 regression during verification.

## Sources

### Primary (HIGH confidence — read directly this session)

- `src/db/schema/{deals,people,organizations,activities,notes,audit-log,app-settings,deal-assignees,deal-stage-history}.ts`
- `src/lib/mutations/{deals,people,organizations,activities,workflows}.ts` — all four delete mutations read in full
- `src/lib/audit/{prune,settings,present,actor-context}.ts` and `src/lib/audit/prune.test.ts`
- `src/lib/audit/diff.ts`, `src/lib/events/subscribers/audit.ts`, `src/lib/timeline/sources.ts`
- `src/lib/formula-recalc.ts` (`recalculateFormulas`, `scopeFormulasToChangedFields`, `loadRow`, `cascadeToChildren`, `CASCADE_CHILD_RELATIONS`, `ENTITY_NATIVE_ATTRIBUTES`)
- `src/app/api/v1/{deals,people,organizations,activities}/[id]/route.ts`, `src/app/api/v1/audit/route.ts`
- `src/app/admin/audit/{page.tsx,actions.ts,retention-form.tsx}`, `src/components/user-menu.tsx`
- `src/app/api/search/route.ts`, `src/lib/export/formatters.ts`
- `src/messages/locale-parity.test.ts`, `vitest.config.ts`, `vitest.rsc.config.ts`, `package.json`
- `Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh`, `instrumentation.ts`
- `drizzle/0012_typical_radioactive_man.sql`, `drizzle/0014_sloppy_slapstick.sql`
- `.planning/{REQUIREMENTS.md,STATE.md}`, `37-CONTEXT.md`, `37-UI-SPEC.md`

### Primary (HIGH confidence — live database and container probes, 2026-08-16)

- `pg_constraint` sweep: 6 FKs at `deals/people/organizations/activities`, **all `confdeltype = 'a'` (NO ACTION)**
- `information_schema.columns` sweep for every `*entity_id*` / `*_id*` / `*entity_type*` column: 11 columns, 7 tables — the complete reference surface
- Four rolled-back `DELETE` probes: deal → 23503 on `activities_deal_id_deals_id_fk`; organization → 23503 on `people_organization_id_organizations_id_fk`; person → 23503 on `deals_person_id_people_id_fk`; activity → `DELETE 1` (leaf)
- `pg_indexes`: `deals_deleted_at_idx`, `people_deleted_at_idx`, `organizations_deleted_at_idx`, `activities_deleted_at_idx` all present
- `EXPLAIN (ANALYZE, BUFFERS)` on the trash list (Index Scan Backward, 2.785 ms), the tab count (Index Only Scan, 0.173 ms), and the owner-scoped joined list (Nested Loop Left Join, 0.244 ms)
- `EXPLAIN (ANALYZE)` on the `DISTINCT ON` shape against `notes_live_idx` with a 50-element literal id list (Incremental Sort, `Presorted Key: entity_id`)
- Row counts: deals 25,207 (12 trashed), people 38,349 (1), organizations 46,055 (1), activities 79,023 (1), notes 75,236 (0), `audit_log` 52 rows with **0** `action='deleted'`; 13,770 deals have ≥1 activity
- `app_settings` contents: exactly one row, `audit.retention_days = 90`
- `docker compose logs app`: all five processors including `[audit-prune] Starting with initial delay of 60s, ticking daily` and `[audit-prune] deleted 0 row(s) older than 90d`
- Container filesystem: `.next/server/instrumentation.js` present, `audit-prune` string present in a shipped chunk

### Secondary (MEDIUM confidence)

- STATE.md decision log (Phases 33, 35, 36, 44) — the repo's own record of past landmines; treated as authoritative for this codebase but not independently re-verified except where noted

### Tertiary (LOW confidence)

- None. No WebSearch was performed: this phase introduces no new library, and every claim above is
  either read from source, read from the live catalog, or measured.

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH** — no new dependency; every existing one read from `package.json` and confirmed in use
- Cascade verification: **HIGH** — three independent methods (write-site grep, hard-delete grep, live data)
- Purge blast radius: **HIGH** — catalog query plus four empirical rolled-back `DELETE` probes
- Index need: **HIGH** — `EXPLAIN (ANALYZE, BUFFERS)` on the real production-sized tables
- Pruner / Docker gate: **HIGH** — the mechanism was observed working in the running container today
- "Deleted by" batching: **MEDIUM-HIGH** — the plan shape is proven on a structurally identical 75k-row index; `audit_log` itself is too small (52 rows) to measure meaningfully
- Pitfalls: **HIGH** — every one traced to a specific line of source or a specific STATE.md incident

**Research date:** 2026-08-16
**Valid until:** 2026-09-15 (30 days — the codebase is the source and it is under active change by
adjacent phases; re-verify the FK table and the `deleted_at` index list if Phase 38 lands first)
