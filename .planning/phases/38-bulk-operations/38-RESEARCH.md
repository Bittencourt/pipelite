# Phase 38: Bulk Operations - Research

**Researched:** 2026-08-17
**Domain:** Multi-record selection + best-effort sequential server-side writes over an existing
Next.js 16 / Drizzle / TanStack Table CRM
**Confidence:** HIGH (every load-bearing claim below is verified against this repo's source, the
installed `node_modules`, or the live Docker Postgres — not against training data)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Selection Model**
- Selection state lives in TanStack Table's own `rowSelection`, per list, with `getRowId` set to
  the record id. Organizations, People, and Activities all already build a table via
  `useReactTable`, so this is configuration rather than new machinery. No URL param, no global store.
- Select-all is **page-scoped**: the header checkbox selects the rows currently loaded, and the
  bulk toolbar states the exact count ("12 selected"). The lists page at `PAGE_SIZE = 50` behind a
  "Load More" button, so a filter-wide select would silently act on records the user never saw.
- Selection persists across "Load More" (the rows accumulate into the same client array) and is
  cleared on a search/filter change and after any bulk action that succeeded, so a stale id is
  never resubmitted.
- **Deals has no table surface** — `/deals` is a kanban (`kanban-board.tsx`, `deal-card.tsx`). Deals
  gets a checkbox on each deal card plus a "select all in stage" control in the kanban column
  header; the stage column header is the "header select-all" that success criterion 1 asks for. A
  full Deals table view is explicitly NOT built for this.

**Bulk Delete**
- Confirmation is a count-aware `AlertDialog` that names the record count and the live retention
  window read from trash settings ("…recoverable for 30 days"), not a copy of the singular
  `DeleteDialog` string.
- Deletion is **per-record and sequential** through the existing entity soft-delete mutations,
  best-effort — NOT one all-or-nothing transaction. Success criterion 3 requires per-record failure
  to be named, which a single aborting transaction structurally cannot do.
- The server enforces a hard cap of **100 ids per bulk call** and rejects an over-cap request with a
  count-aware error. Page size is 50, so the cap is never hit through the UI and exists to bound the
  API surface.
- Partial failure surfaces twice: a toast summary ("9 deleted, 3 failed") and an inline list naming
  each failed record and its reason. Failed records stay selected so a retry is one click; succeeded
  records are deselected.

**Bulk Reassign Owner**
- The reassigned field is `ownerId`, which all four entities carry (`organizations.ownerId`,
  `people.ownerId`, `deals.ownerId`, `activities.ownerId`). Activities' separate `assigneeId` is out
  of scope for this phase.
- The picker uses the already-vendored `src/components/ui/select.tsx`, which is the owner-picking
  idiom on 3 of the 4 surfaces today. **Corrected during 38-UI-SPEC:** this decision originally
  named `entity-combobox.tsx`, which is unimplementable here — it routes through
  `searchEntities(entityType: EntityType)` and `EntityType` (`src/db/schema/custom-fields.ts:19`) is
  a four-literal union reused by two *persisted* columns (`audit_log.entity_type`,
  `notes.entity_type`) plus `assertEntityType`, so admitting "user" would be a schema change. Either
  way, no new member-picker component is introduced. Options are filtered to
  `status = 'approved'` AND `deletedAt IS NULL` (note: `deals/page.tsx:159-163` filters on
  `deletedAt` alone and can therefore offer an unapproved user — that file is not touched here).
- **No email is sent on bulk reassign.** A per-record notification would emit up to 100 emails from
  one click; a digest email is deferred, not built.
- Reassignment routes through the existing per-entity update mutations, so each record produces its
  own `audit_log` UPDATE row carrying the real actor. Success criterion 5 is satisfied by reuse — no
  bulk-specific audit row and no new audit code.

**Scoped CSV Export**
- A server action receives the selected ids, reuses `fetchFilteredData` / the flatteners in
  `src/lib/export/formatters.ts`, and returns CSV text; the client downloads it via Blob +
  ObjectURL. This follows the Phase 30 precedent ("Export is pure client-side via Blob/ObjectURL").
  No new `/api/export` route.
- Columns come from the existing `deriveCsvColumns`, which already unions keys across every row, so
  `custom_*` columns survive a selection whose first row happens to carry none. The STATE.md note
  about dropped `custom_*` columns describes the pre-34-13 behaviour and no longer applies.
- Filename: `{entity}-selected-{count}-{YYYY-MM-DD}.csv`, so a scoped export is distinguishable
  from a full one on disk.
- CSV only. The Pipedrive variant in `src/lib/export/pipedrive.ts` is not offered for scoped export.

### Claude's Discretion
- Component decomposition of the bulk toolbar (one shared component vs per-entity), the exact
  placement of the toolbar relative to the search input, the shape of the server action return type
  beyond the established `{ success, error }` convention, and how the per-record failure list is
  laid out visually.
- Whether the 100-id cap is a shared constant or per-mutation.

### Deferred Ideas (OUT OF SCOPE)
- Bulk edit of arbitrary fields (including custom fields) and bulk stage moves on the kanban.
- A digest email notifying a new owner of a bulk reassignment.
- Filter-wide "select all N matching records" beyond the loaded page.
- Bulk reassignment of Activity `assigneeId` alongside `ownerId`.
- A tabular Deals view as an alternative to the kanban.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BULK-01 | User can select multiple records via checkbox column on Organizations, People, Deals, and Activities list pages (header select-all, individual row checkboxes) | § Surface Inventory (per-surface table wiring, verified line numbers); § Pitfall 9 (Activities needs `rowSelection` lifted to `ActivitiesClient`); § Pitfall 10 (`colSpan` off-by-one); § Pitfall 12 (won/lost deals are not selectable) |
| BULK-02 | User can bulk delete selected records (count-aware confirmation modal; per-record permission check; partial failure surfaced) | § Per-Entity Soft-Delete Call Path (all four verified, loop-safe); § Authorization Matrix (the exact per-entity predicate, incl. the deals-only admin bypass); § Retention window (`readTrashRetentionDays`, live value 30, fails closed) |
| BULK-03 | User can bulk reassign owner for selected records (member picker; partial failure surfaced per record) | § Pitfall 1 — **`ownerId` is not writable through any existing update mutation for org/person/activity**; § Pitfall 2 — the deal assignee wipe; § The Owner-Write Path (recommended `update{Entity}OwnerMutation`); § Pitfall 15 (only 1 approved user in the live DB → SC-5 unverifiable without a second) |
| BULK-04 | User can export only the currently selected records to CSV (scoped export, not full table) | § The Export Path (`fetchFilteredData` real signature, `ExportFilters.ids` widening, `inArray([])` → `false` verified); § Security Domain (the admin-gate bypass this action must not open) |
</phase_requirements>

---

## Summary

The UI is already fully specified and locked by `38-UI-SPEC.md`. Almost nothing about the *front end*
is at risk. What will break execution is the **server layer**, and the two largest hazards are both
invisible to a mocked test suite and both report `{ success: true }`:

1. **`ownerId` cannot be written through `updateOrganizationMutation`, `updatePersonMutation`, or
   `updateActivityMutation`.** `ownerId` is absent from `organizationSchema`, `personSchema`, and
   `activitySchema`; Zod's default object mode strips unknown keys silently, so the mutation writes
   only `updatedAt`, emits `{entity}.updated` with an empty diff, and the audit subscriber writes
   **no row at all**. A bulk reassign built on CONTEXT's "route through the existing per-entity
   update mutations" would be a silent success no-op that also fails SC-5. Verified by probe.
2. **`updateDealMutation(id, { ownerId }, userId)` destroys every `deal_assignees` row for that
   deal.** `updateDealSchema = dealSchema.partial()` keeps `assigneeIds`'s `.default([])` (Zod 4.3.6
   — verified by probe), and the mutation unconditionally `db.delete(dealAssignees)` before deciding
   what to re-insert. The loss is not even audited (assignees live in a join table, not in the
   diffed row). Blast radius today is zero (`deal_assignees` has 0 rows) but the bug is real.

The correct resolution for both is **four new narrow mutations named
`update{Organization,Person,Deal,Activity}OwnerMutation(id, ownerId, userId)`** — one field, full
`.returning()` row on the emit, `changedFields: ["ownerId"]`. This mirrors the existing
`updateDealStageMutation`, which exists for precisely this reason, keeps the REST/API write schema
un-widened, sidesteps the assignee wipe by construction, and — because of the `update` prefix — is
automatically covered by Phase 36's per-function SC-5 gate in
`src/lib/audit/no-mutation-coupling.test.ts`.

Everything else is reuse. All four soft-delete mutations are already loop-safe, side-effect-free
beyond the bus, and take `(id, userId)`. `src/lib/trash/dispatch.ts` maps `EntityType → restore/purge`
but **not** delete, so a fifth map is genuinely needed for delete (and for owner-write); model it on
`dispatch.ts`'s `Readonly<Record<EntityType, fn>> + satisfies` shape. `fetchFilteredData` needs one
new optional `ids?: string[]` on `ExportFilters` honoured by all four `fetch*` helpers.

**Primary recommendation:** Add `src/lib/bulk/` containing `limits.ts` (`BULK_MAX_IDS = 100`), a
`Readonly<Record<EntityType, …>>` delete-dispatch and owner-dispatch mirroring
`src/lib/trash/dispatch.ts`, and four new `update{Entity}OwnerMutation` functions in the existing
mutation modules. Never call `update{Entity}Mutation` with `{ ownerId }`. Wrap the whole sequential
loop in **one** `runWithActor`, `revalidatePath` **once** after the loop, and return
`{ succeeded: string[], failed: Array<{ id, reason }> }` where `reason` is one of
`notFound | notPermitted | alreadyDeleted | unknown`.

---

## Project Constraints (from environment + global CLAUDE.md / memory)

There is **no project-level `./CLAUDE.md`** and **no `.claude/skills` or `.agents/skills`
directory** in this repo (verified 2026-08-17). The binding constraints come from the user's
global instructions and project memory:

| Constraint | Consequence for this phase |
|---|---|
| **Always use Docker, never a local dev server.** App at `http://localhost:3001`, Postgres at `localhost:5433`, Mailhog at `http://localhost:8025`. | All browser verification targets `http://localhost:3001`. Never run `npm run dev` / `next dev`. |
| **`docker` needs NO `sudo`** (user is in the `docker` group). | `docker compose exec postgres …` works bare. Verified this session. |
| **NEVER embed a sudo password in a file or command.** It leaked to the public repo once. | If a command genuinely needs sudo, ask the user to run it as `! <command>`. |
| **`.planning` is gitignored-but-tracked.** | Commit `.planning` files individually with `git add -f <file>`; the GSD bulk commit helper fails here. An uncommitted `.planning` file is invisible to executor worktrees (Phase 36 lesson). |
| **`npx drizzle-kit` fails on the host** (`npx` resolves to `npm run`). | Use `./node_modules/.bin/drizzle-kit` on the host; `npx` works inside the container. This phase needs **no migration**, so this should not arise. |
| Suite must stay green: `npm test`, `npm run typecheck`, `npm run lint`, zero new `@ts-expect-error`. | Phase 43 (POLISH-01) must not inherit a suppression from this phase. |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Row/card selection state | Browser / Client | — | Ephemeral, per-visit, per-list. TanStack `rowSelection` (tables) / `Set<string>` (kanban). Locked in CONTEXT. |
| Selection→id derivation, `loadedIds` intersection | Browser / Client | — | Guards against phantom keys after a server re-render. Pure client concern. |
| Count/retention-aware confirmation copy | Browser / Client | Frontend Server (SSR) | Copy is client (`useTranslations`), but `retentionDays` must be fetched server-side and passed as a plain prop. |
| Per-record authorization | API / Backend (server action) | — | STATE.md decision: "Ownership checks remain in server actions/API routes; mutations only check entity existence." Do NOT move it into the mutation or into `src/lib/bulk/`. |
| The 100-id cap | API / Backend | Browser / Client (advisory) | Server enforces; client mirrors it only to make the state legible before the click. A client-only cap is not a cap. |
| Soft delete + audit emission | API / Backend (mutation layer) | — | Existing `delete{Entity}Mutation` + `crmBus` + the audit subscriber. Zero new audit code. |
| Owner write + audit emission | API / Backend (mutation layer) | — | **New** `update{Entity}OwnerMutation`. Must emit the full post-write row so `buildChanges` can diff `ownerId`. |
| Scoped CSV generation | API / Backend (server action) | — | `fetchFilteredData` reads the DB; the filename is generated server-side inside `ExportResult` so name and count cannot disagree. |
| File download | Browser / Client | — | Blob + `URL.createObjectURL` (Phase 30 precedent). No `/api/export` route. |
| Owner option list | Frontend Server (SSR) | Database | Fetched in each `page.tsx`, passed as `{ id, name }[]`. Filter `deleted_at IS NULL AND status = 'approved'`. |
| Change-history display | (already built, Phase 36) | — | Nothing to build. Bulk writes appear because they go through the same mutations. |

---

## Standard Stack

**Zero new dependencies. Zero `shadcn add`. Zero registry fetches.** Every version below was read
from `node_modules` or `package.json` in this repo on 2026-08-17.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tanstack/react-table` | 8.21.3 [VERIFIED: node_modules/@tanstack/table-core/package.json] | Row selection state + page-scoped select-all | Already the engine behind all three list tables. Row selection is its built-in feature, not an add-on. |
| `radix-ui` (single-package) | via `src/components/ui/checkbox.tsx` | `Checkbox` with `role="checkbox"` + `aria-checked="mixed"` | Already vendored. `CheckedState = boolean \| 'indeterminate'` [VERIFIED: node_modules/@radix-ui/react-checkbox/dist/index.d.mts:11] |
| `drizzle-orm` | 0.45.1 [VERIFIED: node_modules/drizzle-orm/package.json] | `inArray(col, ids)` for the id-scoped export query | Already the ORM. `inArray(col, [])` returns `sql\`false\`` → zero rows, never a full-table scan [VERIFIED: node_modules/drizzle-orm/sql/expressions/conditions.js:76] |
| `sonner` | 2.0.7 [VERIFIED: node_modules/sonner/package.json] | Result toasts incl. `toast.warning` for partial failure | `warning` is in the installed type surface [VERIFIED: node_modules/sonner/dist/index.d.ts:133] — UI-SPEC assumption #6 is confirmed, not assumed. |
| `next-intl` | 4.8.3 | The 43 new `bulk.*` keys, ICU plurals | `NextIntlClientProvider` wraps the whole app [VERIFIED: src/app/layout.tsx:47], so `useTranslations` works in any client component including a new `src/components/bulk/*`. |
| `lucide-react` | 0.575.0 [VERIFIED: node_modules/lucide-react/package.json] | `Minus`, `UserPen`, `Download`, `Trash2`, `X`, `Loader2`, `AlertCircle` | Already the icon library. |
| `@dnd-kit/core` / `@dnd-kit/sortable` | 6.3.1 / 10.0.0 | Not used *by* this phase — must be *defended against* on the deal card | `PointerSensor activationConstraint: { distance: 5 }` [VERIFIED: src/app/deals/kanban-board.tsx:120-129] |
| `papaparse` | (existing) | CSV serialisation via `exportToCSV` | Already the export serialiser; `deriveCsvColumns` already fixes its row-1 header bug. |
| `vitest` | 4.0.18 | Tests | Two projects (`vitest.config.ts` + `vitest.rsc.config.ts`), both `environment: 'node'`. |

### Supporting (in-repo modules to reuse, not rebuild)
| Module | Purpose | When to Use |
|--------|---------|-------------|
| `src/lib/mutations/{organizations,people,deals,activities}.ts` → `delete{Entity}Mutation(id, userId)` | Soft delete + `{entity}.deleted` emit | Every bulk delete. Loop-safe as-is. |
| `src/lib/audit/actor-context.ts` → `runWithActor(actor, fn)` | Establishes the audit actor for the whole async scope | Wrap the **entire loop** once, not per record. `AsyncLocalStorage` propagates across awaits. |
| `src/lib/trash/settings.ts` → `readTrashRetentionDays(): Promise<number \| null>` | The live retention window for the confirmation copy | Called in each `page.tsx`. **Name correction: it is `readTrashRetentionDays`, not `readRetentionDays` as 38-UI-SPEC states.** Live value = 30. Fails closed to `null` — never add a `?? 30`. |
| `src/lib/export/formatters.ts` → `fetchFilteredData(options: ExportOptions)` | Fetch + flatten + serialise | Scoped export. Needs `ExportFilters.ids`. |
| `src/lib/export/csv-columns.ts` → `deriveCsvColumns(data)` | Unions keys across every row | Already the default path inside `exportToCSV`. Nothing to do. |
| `src/app/admin/export/export-form.tsx:31-38` → `downloadFile(content, filename, mimeType)` | Blob → ObjectURL → synthetic `<a download>` → revoke | Copy the shape; do not write a third variant. |
| `src/lib/trash/dispatch.ts` | The `Readonly<Record<EntityType, fn>> + satisfies` dispatch idiom | Model the new delete-dispatch and owner-dispatch on it verbatim. It does **not** cover delete — see below. |
| `src/lib/trash/entity-types.ts` → `ENTITY_TO_TRASH_TAB` | Maps `EntityType → TrashTab` | Only if the success toast's `Open Trash` action wants to deep-link the right tab. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Four new `update{Entity}OwnerMutation` | Add `ownerId` to the three missing Zod schemas + the three `updateData` builders | Fewer functions, but it widens the **public REST write contract** (`PATCH /api/v1/organizations/:id` would start accepting `ownerId`), still leaves the deal-assignee wipe unfixed, and touches the single-record edit path. Rejected. |
| One `bulkDelete` action per entity file | One generic `bulkDelete(entityType, ids)` in `src/lib/bulk/actions.ts` | The generic version cannot express the per-entity authorization asymmetry (deals has an admin bypass, the other three do not) without a second dispatch map of predicates. Per-entity actions in the existing `actions.ts` files keep the auth check next to the single-record check it must match. Recommended: per-entity actions, shared dispatch for the *mutation* call only. |
| Sequential loop | `Promise.all` over the ids | `Promise.all` would fire up to 100 concurrent mutations against a `postgres.js` pool at its default size (`postgres(connectionString)` with no `max` — `src/db/index.ts`), each also spawning a fire-and-forget audit insert and a webhook enqueue. CONTEXT locks sequential; the pool is a second reason. |
| One transaction | Per-record best-effort | Locked in CONTEXT, and structurally required by SC-3. |

**Installation:** none.

```bash
# Nothing to install. Verified: components.json declares "registries": {} and every primitive
# this phase touches is already in src/components/ui/.
```

---

## Package Legitimacy Audit

**This phase installs no external packages.** No `npm install`, no `shadcn add`, no registry fetch.
The slopcheck / registry-verification gate therefore has an empty input set and is not applicable.

| Package | Registry | Disposition |
|---------|----------|-------------|
| *(none)* | — | No packages added this phase |

**Packages removed due to slopcheck [SLOP] verdict:** none — none proposed.
**Packages flagged as suspicious [SUS]:** none — none proposed.

If a plan later concludes a package is needed (it should not — see § Alternatives Considered), the
gate must be run before that package enters a plan, and `38-UI-SPEC.md § Registry Safety` must be
revisited.

---

## Architecture Patterns

### System Architecture Diagram

```
                        ┌─────────────────────────── BROWSER ───────────────────────────┐
                        │                                                               │
  user clicks a         │   TanStack rowSelection (tables)   Set<string> (kanban)        │
  checkbox ────────────►│            │                             │                    │
                        │            └──────────┬──────────────────┘                    │
                        │                       ▼                                       │
                        │        selectedIds = keys(rowSelection) ∩ loadedIds            │
                        │                       │                                       │
                        │                       ├── len === 0 ──► bar ABSENT from DOM    │
                        │                       ├── len > 100 ──► 3 actions disabled     │
                        │                       ▼                                       │
                        │              <BulkActionBar> (fixed bottom + h-20 spacer)      │
                        │              │        │           │            │              │
                        │        Reassign     Export      Delete      Clear              │
                        │              │        │           │            │              │
                        └──────────────┼────────┼───────────┼────────────┴──► setSel({}) ┘
                                       │        │           │
                     ┌─────────────────┘        │           └────────────────┐
                     ▼                          ▼                            ▼
        ┌──────── SERVER ACTION ('use server', per entity file) ─────────────────────────┐
        │                                                                               │
        │  1. await auth()                        ──► not authed  ──► { success:false }  │
        │  2. ids.length > BULK_MAX_IDS (100)      ──► reject, count-aware error         │
        │  3. dedupe ids                                                                │
        │  4. reassign only: validate target user ONCE (approved + not deleted)          │
        │  5. runWithActor({kind:'user', userId}, async () => {                          │
        │        for (const id of ids) {                     ◄── SEQUENTIAL, best-effort │
        │          row = findFirst(id, deletedAt IS NULL)                                │
        │          if (!row)                    → failed: notFound                       │
        │          if (!ownsOrBypass(row))      → failed: notPermitted                   │
        │          r = await mutation(id, …)    ──────────────────────────────┐          │
        │          r.success ? succeeded.push(id) : failed: unknown           │          │
        │        }                                                           │          │
        │     })                                                             │          │
        │  6. revalidatePath ONCE (never inside the loop)                     │          │
        │  7. return { succeeded, failed: [{ id, reason }] }                  │          │
        └────────────────────────────────────────────────────────────────────┼──────────┘
                                                                             │
                              ┌──────────── MUTATION LAYER ───────────────────┘
                              │  delete{Entity}Mutation(id, userId)
                              │  update{Entity}OwnerMutation(id, ownerId, userId)   ◄── NEW
                              │      • existence check (deletedAt IS NULL)
                              │      • UPDATE … SET
                              │      • crmBus.emit(event, { data: fullRow, previous: preRow })
                              └───────────────┬───────────────────────────────────┘
                                              │  synchronous EventEmitter — 4 subscribers
              ┌───────────────┬───────────────┼───────────────┬───────────────┐
              ▼               ▼               ▼               ▼               │
       audit subscriber   webhook sub.   workflow-trigger  stage-history       │
       buildChanges()     enqueue        matchAndFire      (stage_changed      │
       INSERT audit_log   delivery       triggers           only — not hit)    │
       ◄─ NOT AWAITED ─►  ◄─ NOT AWAITED ─►  ◄─ NOT AWAITED ─►                 │
              │                                                               │
              └── N records ⇒ N audit rows, N webhook deliveries, N trigger evaluations

  EXPORT PATH (separate, read-only):
       bar ──► exportSelected{Entity}(ids)  ──► fetchFilteredData({ entityType, format:'csv',
                                                   includeCustomFields:true, filters:{ ids } })
                                            ──► fetch*(…, inArray(col, ids)) ──► flatten*
                                            ──► deriveCsvColumns (unions ALL rows' keys)
                                            ──► Papa.unparse ──► { data, filename, count }
       ◄── Blob ──► URL.createObjectURL ──► <a download> ──► revokeObjectURL ──► toast
```

### Recommended Project Structure

```
src/lib/bulk/
├── limits.ts            # BULK_MAX_IDS = 100 (isomorphic — imported by client bar AND actions)
├── dispatch.ts          # SERVER-ONLY. Readonly<Record<EntityType, fn>> for delete + owner write
└── types.ts             # BulkFailureReason union + BulkResult shape (isomorphic)

src/components/bulk/     # all 'use client'
├── select-column.tsx    # useSelectColumn<T>(getLabel) → ColumnDef<T, unknown>
├── bulk-action-bar.tsx  # the fixed bar + h-20 spacer + export download
├── bulk-delete-dialog.tsx
├── bulk-reassign-dialog.tsx
└── bulk-failure-report.tsx

src/lib/mutations/{organizations,people,deals,activities}.ts
└── + update{Entity}OwnerMutation(id, ownerId, userId)          # NEW, 4 functions

src/app/{organizations,people,deals,activities}/actions.ts
└── + bulkDelete{Entity}(ids), bulkReassign{Entity}Owner(ids, ownerId), exportSelected{Entity}(ids)
```

`src/lib/bulk/limits.ts` and `types.ts` MUST import nothing (no `@/db`) — the client bar imports
them. `dispatch.ts` imports the mutation layer and is therefore **server-only**; the same warning
`src/lib/trash/dispatch.ts` carries in its header applies verbatim and should be restated.

### Pattern 1: `Readonly<Record<EntityType, fn>>` dispatch with `satisfies`

**What:** One exhaustive map per operation, so a fifth entity type is a compile error in one file.
**When to use:** The delete dispatch and the owner-write dispatch.
**Why not reuse `src/lib/trash/dispatch.ts`:** It maps **restore** and **purge** only. Verified — its
two maps are `RESTORE_BY_TYPE` and `PURGE_BY_TYPE`; there is no delete map, because Phase 37 had no
need for one. A fifth map is genuinely new work, not duplication.

```ts
// Source: src/lib/trash/dispatch.ts:78-93 (this repo, verified 2026-08-17)
type DeleteMap = Readonly<Record<EntityType, (id: string, userId: string) => Promise<DeleteResult>>>

const DELETE_BY_TYPE: DeleteMap = Object.freeze({
  deal: deleteDealMutation,
  person: deletePersonMutation,
  organization: deleteOrganizationMutation,
  activity: deleteActivityMutation,
} satisfies DeleteMap)
```

The `satisfies` is load-bearing and not decoration. Phase 37 measured this: a literal passed to
`Object.freeze` loses excess-property checking, so a **missing** key fails on the annotation (TS2741)
but an **extra** key compiles clean without the `satisfies` (STATE.md, Phase 37). Assert both
directions if a gate is written.

### Pattern 2: One `runWithActor` around the whole loop

**What:** `runWithActor` uses `AsyncLocalStorage.run`, so the store survives every `await` inside
the callback. The audit subscriber reads it synchronously at handler entry, and `crmBus` is a
synchronous `EventEmitter` whose handlers run inline in the mutation's own stack — so every record
in the loop is inside the actor scope.
**When to use:** Every bulk write action.

```ts
// Source: src/app/deals/actions.ts:87-89 pattern, applied to a loop
const outcome = await runWithActor({ kind: "user", userId: session.user.id }, async () => {
  const succeeded: string[] = []
  const failed: Array<{ id: string; reason: BulkFailureReason }> = []
  for (const id of uniqueIds) {
    // per-record auth + mutation call
  }
  return { succeeded, failed }
})
revalidatePath("/organizations")   // ONCE, after the loop
```

`runWithActor` returns `T | Promise<T>` (verified signature), so an `async` callback needs
`await runWithActor(...)` — the existing single-record actions all do exactly this.

### Pattern 3: Client-side id→label mapping for the failure report

**What:** The server returns `{ id, reason }` only. The client already holds the row objects for every
selected id, so it maps id→display name locally.
**Why:** Cheaper (no extra server round trip, no extra columns in the response), and it removes
`38-UI-SPEC.md` assumption #4's requirement that the server return a display name. It also keeps the
reason a closed union (`bulk.reason.*`) with no raw server prose crossing the boundary.
**Caveat:** a record that failed with `notFound` may already be gone from the *next* server render —
but the client still has it in the array it submitted from, which is the array the report renders
against. Capture the id→label map **at submit time**, not at render time.

### Anti-Patterns to Avoid

- **Calling `update{Entity}Mutation(id, { ownerId }, userId)`.** Silent no-op on 3 of 4 entities;
  destroys `deal_assignees` on the 4th. See Pitfalls 1 and 2. This is the single most important rule
  in this document, and it is exactly what `38-CONTEXT.md` § Bulk Reassign Owner literally instructs.
- **`Promise.all` over the ids.** Locked out by CONTEXT; also a pool hazard.
- **One wrapping transaction.** Structurally cannot name a per-record failure (SC-3).
- **Putting the ownership check in the mutation or in `src/lib/bulk/`.** STATE.md decision: ownership
  lives in the server action / API route. `src/lib/trash/dispatch.ts` states the same rule in its
  header and explains why a second check location is worse than one.
- **`revalidatePath` inside the loop.** Up to 100 revalidations for one user action.
- **An effect keyed on the `data` array to clear the selection.** `revalidatePath` re-renders the
  current client tree regardless of the path argument (Phase 35, measured on Next 16.1.6), so a
  `[data]`-keyed effect would fire mid-action and wipe the failed-id selection SC-3 requires to
  survive. Key on the **filter string**.
- **Accepting `ExportFilters` (or `ExportOptions`) from the client in the scoped-export action.**
  See § Security Domain — this is an admin-gate bypass, not a style preference.
- **A client-only 100-id cap.** The cap must be enforced server-side; the client mirror exists only
  to make the state legible.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Row selection state, select-all, indeterminate | A `Set<string>` + manual header math on the three tables | TanStack `rowSelection` + `getIsAllPageRowsSelected` / `getIsSomePageRowsSelected` / `toggleAllPageRowsSelected` | Already installed and already the table engine. `RowSelectionState = Record<string, boolean>` [VERIFIED: node_modules/@tanstack/table-core/build/lib/features/RowSelection.d.ts:2] |
| `aria-checked="mixed"` / tri-state a11y | A custom tri-state control | Radix `Checkbox` with `checked={boolean \| "indeterminate"}` | `CheckedState` is part of the installed API. Only the *visual* indicator needs the two-line `MinusIcon` patch. |
| CSV header derivation across heterogeneous rows | `Object.keys(rows[0])` | `deriveCsvColumns` (already inside `exportToCSV`) | Closed by 34-13 after a live 46,055-row export emitted **zero** `custom_*` columns while 30,264 rows had values. Do not re-derive from row 1. |
| Empty-id-list guard in the export query | `if (ids.length === 0) return []` scattered per fetch | `inArray(col, ids)` | Drizzle 0.45.1 returns `sql\`false\`` for an empty array [VERIFIED: node_modules/drizzle-orm/sql/expressions/conditions.js:76]. Still guard at the action boundary, but the query itself cannot degrade to a full table. |
| Audit rows for bulk writes | A `bulkDelete`/`bulkReassign` audit row, or a loop of `db.insert(auditLog)` | The existing `crmBus` subscriber | AUDIT-02 is "no mutation code changes to add it". A bulk-specific audit row would also be caught by `no-mutation-coupling.test.ts`. |
| The retention default | `retentionDays ?? 30` | `readTrashRetentionDays()` + the `descriptionNoRetention` string | Phase 37 T-37-05: "default in data, fail closed in code". A `?? 30` re-collapses "unset" and "30" and makes the dialog lie about the deployment. |
| Blob download plumbing | A third `downloadFile` | The `src/app/admin/export/export-form.tsx:31-38` shape | Two copies exist; a third is drift. |
| Per-entity restore/purge routing | A new switch | `src/lib/trash/dispatch.ts` | Only if a bulk restore is ever wanted — **it is not** (Phase 37 scoped multi-select out of `/trash`, and 38-UI-SPEC confirms `/trash` gets no checkbox column). |

**Key insight:** every hand-roll temptation in this phase is a *second copy of something the repo
already got right after measuring a production failure*. `deriveCsvColumns`, `readTrashRetentionDays`,
and `Readonly<Record<EntityType, fn>> + satisfies` each exist because a simpler version shipped and
broke. Reuse is not just cheaper here; it is the accumulated bug fix.

---

## Surface Inventory (verified line numbers, 2026-08-17)

### Per-Entity Soft-Delete Call Path

All four are **loop-safe as-is**: same signature, existence-checked, no transaction, no email, no
formula recalculation, single bus emit, `{ success: true } | { success: false; error: string }`.

| Entity | Mutation | Site | Signature | Emits | Requires actor? |
|---|---|---|---|---|---|
| organization | `deleteOrganizationMutation` | `src/lib/mutations/organizations.ts:343` | `(id, userId)` | `organization.deleted` with `data={id}`, `previous=preRow` | No — reads no actor. Actor is picked up by the **subscriber** from ALS. |
| person | `deletePersonMutation` | `src/lib/mutations/people.ts:381` | `(id, userId)` | `person.deleted` | same |
| deal | `deleteDealMutation` | `src/lib/mutations/deals.ts:473` | `(id, userId)` | `deal.deleted` | same |
| activity | `deleteActivityMutation` | `src/lib/mutations/activities.ts:326` | `(id, userId)` | `activity.deleted` | same |

Uses the **module-level `db`**, not a `tx` — which is exactly why a loop is safe and a wrapping
transaction is not even available without changing the mutations.

The `previous` payload is why the tombstone audit row has any detail at all: `data` is literally
`{ id }`, and `buildChanges` diffs the whole `previous` row against `{}` for a delete
(`src/lib/audit/diff.ts:137-146`). Do not "optimise" the pre-read away.

### The Owner-Write Path — **this is the phase's main gap**

| Entity | `ownerId` in its Zod schema? | Handled in the `updateData` builder? | Result of `update{Entity}Mutation(id, { ownerId })` |
|---|---|---|---|
| organization | **NO** (`organizationSchema` = name, website, industry, notes, customFields — `organizations.ts:20-26`) | **NO** (`:281-308`) | Silent no-op, `{success:true}`, **no audit row** |
| person | **NO** (`personSchema` = firstName, lastName, email, phone, notes, organizationId, customFields — `people.ts:20-28`) | **NO** | Silent no-op, `{success:true}`, **no audit row** |
| activity | **NO** (`activitySchema` = title, typeId, dealId, assigneeId, dueDate, notes, customFields — `activities.ts:20-28`) | **NO** | Silent no-op, `{success:true}`, **no audit row** |
| deal | **YES** (`dealSchema.ownerId` — `deals.ts:34`) | YES (`deals.ts:376-379`) | Writes `ownerId` **and destroys every `deal_assignees` row** (`deals.ts:406`) |

Column facts (all four verified): `owner_id text NOT NULL REFERENCES users(id)`. There is no
nullable owner, so there is no "unassign" — consistent with 38-UI-SPEC. Only `deals` has an index on
`owner_id` (`deals_owner_id_idx`), and STATE.md Phase 33 records that `n_distinct = 1` in this dataset
so the planner ignores it — irrelevant for a PK-keyed update.

`ownerId` is **absent from `ENTITY_NATIVE_ATTRIBUTES`** for all four entities
(`src/lib/formula-recalc.ts:103-130`), so `changedFields: ["ownerId"]` scopes the formula
recalculation to **zero evaluations**. Passing it is correct and costs nothing.

**Recommended shape** (four functions, one per entity module):

```ts
export async function updateOrganizationOwnerMutation(
  id: string,
  ownerId: string,
  userId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const organization = await db.query.organizations.findFirst({
    where: and(eq(organizations.id, id), isNull(organizations.deletedAt)),
  })
  if (!organization) return { success: false, error: "Organization not found" }
  if (organization.ownerId === ownerId) return { success: true }   // idempotent; no event, no audit row

  try {
    const [updated] = await db.update(organizations)
      .set({ ownerId, updatedAt: new Date() })
      .where(eq(organizations.id, id))
      .returning()

    // The FULL post-write row, so buildChanges can diff ownerId. Emitting `{ id, ownerId }`
    // would make every unreported column look unchanged — which is correct here — but the
    // repo's convention at every other emit site is the whole row, and diff.ts skips native
    // keys absent from `data` on UPDATES only, so a partial payload silently narrows the diff.
    crmBus.emit("organization.updated", buildEventPayload(
      id, "updated",
      updated as unknown as Record<string, unknown>,
      userId,
      ["ownerId"],
      organization as unknown as Record<string, unknown>,
    ))
    return { success: true }
  } catch (error) {
    console.error("Failed to reassign organization owner:", error)
    return { success: false, error: "Failed to reassign organization owner" }
  }
}
```

**Name them `update{Entity}OwnerMutation`, not `reassign…`.** Phase 36's SC-5 gate
(`src/lib/audit/no-mutation-coupling.test.ts:165`) slices and asserts per function using
`/export async function (?:create|update|delete)[A-Za-z]*Mutation\b/`. A `reassign…` name matches
neither that regex nor the `restore|purge` carve-out regex, so the new function would sit **outside**
the gate in a carve-out file. The `update` prefix puts it inside for free. There is no count
assertion pinning the mutation set, so adding one is non-breaking (verified: the gate asserts
`> 0`, never an exact number).

**Email side effects, resolved:** the only email on any owner/assignee path is
`sendDealAssignedEmail`, and it fires **in the server action** (`src/app/deals/actions.ts:96-127`)
off `result.newAssigneeUserIds` — i.e. off *deal assignees*, never off `ownerId`. So CONTEXT's "no
email on bulk reassign" costs nothing: the new mutation returns no `newAssigneeUserIds` and the bulk
action simply does not contain the loop. No suppression flag, no conditional email. Verify with
Mailhog (`http://localhost:8025`, zero new messages) as 38-UI-SPEC's checklist requires.

### Authorization Matrix (per-record, in the server action)

**Not uniform.** The bulk actions must mirror each entity's existing predicate exactly. Inventing a
uniform one either grants organizations/people/activities an admin bypass they do not have today
(privilege escalation) or removes deals' bypass (regression).

| Entity | Delete predicate (existing, verified) | Update predicate | Admin bypass? |
|---|---|---|---|
| organization | `organization.ownerId !== session.user.id` → "Not authorized" (`organizations/actions.ts`) | same | **No** |
| person | `person.ownerId !== session.user.id` (`people/actions.ts`) | same | **No** |
| activity | `activity.ownerId !== session.user.id` (`activities/actions.ts`) | same | **No** |
| deal | `deal.ownerId !== session.user.id && session.user.role !== "admin"` (`deals/actions.ts:155-157`) | same (`:83-85`) | **Yes** |

Map a failed predicate to `notPermitted`; a missing row (`deletedAt IS NULL` miss) to `notFound`.
`alreadyDeleted` is reachable only if a record was soft-deleted between the client's render and the
loop's read — the `findFirst` already carries `isNull(deletedAt)`, so distinguishing it from
`notFound` needs a second read without the predicate. **Recommendation (auto-accepted recommended,
autonomous mode):** do the single read with `isNull(deletedAt)` and map a miss to `notFound`; do
**not** ship `alreadyDeleted` as a reachable reason for delete. Keep the key in the catalogue (it is
in the 43-key contract) but state in the plan, in writing, that the delete path collapses
`alreadyDeleted` into `notFound` rather than mapping a permission failure onto "try again" —
which is exactly what `38-UI-SPEC.md` assumption #4 asks for.

### Table Wiring, per surface

| Surface | File | `useReactTable` at | Has `getRowId`? | Row models | Search source | Load More location |
|---|---|---|---|---|---|---|
| Organizations | `src/app/organizations/data-table.tsx` | `:125` | **No** — must add | core only | `search` **prop** (`:38`) | inside `data-table.tsx` (`:210`) |
| People | `src/app/people/data-table.tsx` | `:125` | **No** — must add | core only | `search` prop | inside `data-table.tsx` (`:216`) |
| Activities | `src/app/activities/activity-list.tsx` | `:391` | **No** — must add | core **+ `getFilteredRowModel()`** (`:395`) | **none** — no `search` prop reaches `ActivityList` | **in the parent** `activities-client.tsx` (`:170-176`) |
| Deals | `src/app/deals/kanban-board.tsx` | none (kanban) | n/a | n/a | URL params via `activeFilters` prop | **no pagination at all** |

Already present and inert on all three tables: `data-state={row.getIsSelected() && "selected"}`
(`organizations/data-table.tsx:180`, `people/data-table.tsx:180`, `activity-list.tsx:480`) and
`table.tsx:60`'s `data-[state=selected]:bg-muted`. It starts working the moment `rowSelection` is
enabled — zero new CSS, exactly as 38-UI-SPEC says.

Row arrays are **cumulative** across Load More — verified `organizations/page.tsx:19` (`limit =
PAGE_SIZE * pageNum + 1`, sliced to `PAGE_SIZE * pageNum`) and the identical shape in
`people/page.tsx`. 38-UI-SPEC assumption #7 is confirmed.

`useDataTableKeyboard` bindings: `j`/`down`, `k`/`up`, `enter`, `e`, `d`, `n`
(`src/components/keyboard/data-table-keyboard.tsx:72-120`). `useKanbanKeyboard`: `k`/`up`, `j`/`down`,
`h`/`left`, `l`/`right`, `enter`, `n`. **Neither binds `Escape`** — verified, so the new
Escape-to-clear binding has no collision *with those hooks* (see Pitfall 14 for the dialog problem).

`rowProps(index)` returns `{ "data-selected": boolean, className: "bg-muted/50" | undefined,
onClick: () => setSelectedIndex(index) }` — the row click moves the **keyboard cursor** and does not
open the record (`onOpen` is bound to `enter`). 38-UI-SPEC is right that the checkbox's
`stopPropagation` is defence in depth rather than a bug fix.

`globals.css:172-174` applies `[data-selected="true"] { box-shadow: 0 0 0 2px var(--primary) }`
**globally**, not only to kanban cards despite its comment. So a keyboard-cursor row already carries
a primary ring; combined with `bg-muted` for bulk-selected, the two states really are
simultaneously distinguishable — 38-UI-SPEC's checklist item is satisfiable.

### The Export Path

`fetchFilteredData(options: ExportOptions): Promise<ExportResult>` — real signature verified at
`src/lib/export/formatters.ts:354`. There is **no** `ids` anywhere:

```ts
// src/lib/export/types.ts, verbatim, 2026-08-17
export interface ExportFilters { stage?: string; owner?: string; dateFrom?: string; dateTo?: string }
export interface ExportOptions {
  entityType: ExportEntityType; format: ExportFormat
  includeCustomFields: boolean; filters?: ExportFilters
}
export type ExportResult =
  | { success: true; data: string; filename: string; count: number }
  | { success: false; error: string }
```

**Required change:** add `ids?: string[]` to `ExportFilters` and honour it in all four private
fetchers (`fetchOrganizations` `:249`, `fetchPeople` `:269`, `fetchDeals` `:290`,
`fetchActivities` `:322`) with `conditions.push(inArray(<table>.id, filters.ids))`. Note the two
deal/activity fetchers annotate `const conditions: ReturnType<typeof eq>[]` — `inArray` also returns
`SQL<unknown>`, so it fits, but typecheck it rather than assuming.

**The filename must be overridden.** `fetchFilteredData:417-424` produces
`{entityPlural}{formatSuffix}-{YYYY-MM-DD}.{ext}` — e.g. `organizations-2026-08-17.csv`. The locked
scoped name is `{entity}-selected-{count}-{YYYY-MM-DD}.csv`. Two options: (a) the action rewrites
`result.filename` before returning, or (b) `fetchFilteredData` learns a `filenameSuffix`. **(a)
recommended** (auto-accepted recommended, autonomous mode) — it keeps a widely-shared function
untouched and still satisfies "generated server-side inside the `ExportResult`", since the action is
server-side and the count comes from `result.count`, so name and count cannot disagree.

`ExportResult` needs no change. `deriveCsvColumns` needs no change.

---

## Common Pitfalls

### Pitfall 1 — `ownerId` is silently stripped on three of the four entities (**CRITICAL**)
**What goes wrong:** `bulkReassignOrganizationOwner` reports "12 records reassigned", the owner column
does not change, and **no audit row is written** — so SC-3 and SC-5 both fail while the UI claims
success and the whole test suite stays green.
**Why it happens:** `organizationSchema` / `personSchema` / `activitySchema` do not declare `ownerId`.
Zod object schemas default to *strip* mode, so `updateOrganizationSchema.safeParse({ ownerId })` →
`{ success: true, data: {} }` [VERIFIED by probe, zod 4.3.6, this session]. The mutation then builds
`updateData = { updatedAt: new Date() }`, `changedFields = []`, writes the row, and emits
`{entity}.updated`. `buildChanges` ignores `updatedAt` (`IGNORED_COLUMNS`, `diff.ts:26-31`) so
`changes === {}`, and the subscriber's rule "an update that changed nothing writes no row at all"
(`subscribers/audit.ts:66-68`) drops it.
**How to avoid:** four new `update{Entity}OwnerMutation(id, ownerId, userId)`. Never
`update{Entity}Mutation(id, { ownerId })`.
**Warning signs:** a bulk reassign whose success toast fires but whose `ownerName` column is
unchanged; `select count(*) from audit_log where changes ? 'ownerId'` returning 0 after a reassign.

### Pitfall 2 — `updateDealMutation` with a partial payload destroys `deal_assignees` (**CRITICAL, latent**)
**What goes wrong:** every assignee of every reassigned deal is deleted, silently and unaudited.
**Why it happens:** `updateDealSchema = dealSchema.partial()`, and `assigneeIds` is declared
`z.array(z.string()).optional().default([])`. `.partial()` does **not** remove the default —
`updateDealSchema.safeParse({ ownerId: "abc" })` yields `{ assigneeIds: [], ownerId: "abc" }`
[VERIFIED by probe, this session]. `deals.ts:406` then runs
`await db.delete(dealAssignees).where(eq(dealAssignees.dealId, id))` **unconditionally**, and the
re-insert is gated on `updatedAssigneeIds.length > 0`. Because assignees live in a join table and
never appear in the diffed deal row, the audit log records nothing.
**How to avoid:** use the narrow `updateDealOwnerMutation`, which does not touch `dealAssignees` at
all. (If a future task must call `updateDealMutation` partially, it has to read the current
assignees first and pass them through.)
**Blast radius today:** `select count(*) from deal_assignees` → **0** [VERIFIED: live DB]. The bug is
real but currently destroys nothing. Do not let that make it acceptable; the fix is free.
**Warning signs:** `deal_assignees` row count dropping after a bulk reassign.

### Pitfall 3 — Assuming one authorization predicate fits all four entities
**What goes wrong:** either organizations/people/activities gain an admin bypass they do not have
(privilege escalation shipped as a bulk feature), or deals loses its bypass (a regression an admin
will hit immediately, since in the live data the admin owns everything).
**Why it happens:** the four `actions.ts` files look copy-pasted but are not — only deals has
`&& session.user.role !== "admin"`.
**How to avoid:** copy each entity's existing predicate into its own bulk action, verbatim, adjacent
to the single-record one.
**Warning signs:** an org bulk delete succeeding on a record the single-record delete refuses.

### Pitfall 4 — Building the scoped export on top of a client-supplied filter object
**What goes wrong:** a non-admin calls `exportSelectedOrganizations({ filters: {} })` and receives the
entire 46,054-row table — bypassing the `role !== "admin"` gate on `getExportData`
(`src/app/admin/export/actions.ts`).
**Why it happens:** the natural refactor is "pass `ExportOptions` through". The full export is
admin-only; the scoped export must be available to any authenticated user; the two must not share a
parameter object.
**How to avoid:** the action signature is `(ids: string[])` and **nothing else**. It constructs
`{ entityType: <fixed>, format: "csv", includeCustomFields: true, filters: { ids } }` server-side.
No `format`, no `filters`, no `entityType` from the client.
**Warning signs:** an export action whose parameter type mentions `ExportFilters`, `ExportOptions`, or
`ExportFormat`.

### Pitfall 5 — Treating the 100-id cap as unreachable on Deals
**What goes wrong:** "select all in stage" on a real pipeline instantly selects thousands, the three
actions are permanently disabled, and the stage select-all is dead on the product's busiest surface.
**Why it happens:** `38-CONTEXT.md` reasons "Page size is 50, so the cap is never hit through the UI".
That is true for the three tables and **false for Deals**: `/deals` has no pagination at all —
`src/app/deals/page.tsx:120-145` fetches every non-deleted deal in the selected pipeline with no
`limit`. Live data: 25,195 live deals; largest single stage **10,495** (`Closer / FlyWheel`); nine
stages over 300 [VERIFIED: live DB, this session].
**How to avoid:** decide this explicitly in the plan. See Open Question 1 for the recommendation.
**Warning signs:** a `tooMany` line that appears on the first click of any real stage header.

### Pitfall 6 — Expecting the fan-out to be free
**What goes wrong:** a 100-record bulk delete enqueues **100 webhook deliveries** and runs **100
workflow-trigger evaluations**, plus 100 fire-and-forget `audit_log` inserts, against a `postgres.js`
client created with no `max` (`src/db/index.ts` — `postgres(connectionString)`, library default 10).
**Why it happens:** four subscribers are registered on every CRUD event
(`instrumentation.ts`): `audit` (12 events), `webhook` (13, `subscribers/webhook.ts`),
`workflow-trigger` (13, `subscribers/workflow-trigger.ts`), `stage-history` (stage_changed only).
This is *correct* semantics — a bulk delete genuinely is N deletes — but it is not free and nobody
has stated it.
**Live blast radius (verified):** 1 active webhook; 3 workflows, **0 active**. So today: 100 webhook
deliveries enqueued, 0 workflow runs.
**How to avoid:** nothing to avoid — state it in the plan, keep the loop sequential, and expect a
100-record bulk delete to take seconds, not milliseconds. The bar's disabled+spinner state (already
specified) is what makes this acceptable.
**Warning signs:** `webhook_deliveries` growing by exactly N after a bulk delete (expected);
connection-pool timeouts (would mean the loop went concurrent).

### Pitfall 7 — Asserting SC-5 immediately after the toast
**What goes wrong:** the change-history check fails intermittently, or a verifier concludes audit
capture is broken.
**Why it happens:** the audit insert is deliberately **not awaited** — `subscribers/audit.ts:70-88`
fires `db.insert(auditLog)….catch(...)` and returns, because `crmBus.emit` is synchronous and cannot
await. The server action returns and `revalidatePath` runs while up to 100 inserts are still in
flight.
**How to avoid:** in browser UAT, re-read the record's history (or poll `audit_log`) rather than
asserting on the first render after the toast. In a DB probe, allow a short settle.
**Warning signs:** a history assertion that passes on a slow machine and fails on a fast one.

### Pitfall 8 — Keying the clear-selection effect on `data`
**What goes wrong:** the failed-record selection SC-3 depends on is wiped mid-action.
**Why it happens:** Phase 35 measured that `revalidatePath` re-renders the current client tree
regardless of the path argument (Next 16.1.6), and every bulk action calls it.
**How to avoid:** `useEffect(() => setRowSelection({}), [search])` — the **filter string**. Remove
succeeded ids **explicitly in the handler**, never via an effect.
**Warning signs:** a partial failure whose bar reads "0 selected" instead of "3 selected".

### Pitfall 9 — Putting Activities' bar and spacer inside `ActivityList`
**What goes wrong:** the `h-20` spacer sits above the `Load More` button, so the fixed bar covers it —
the exact defect the spacer exists to prevent. And there is no filter key available to clear the
selection on.
**Why it happens:** `ActivityList` owns `useReactTable` but `ActivitiesClient` owns the `Load More`
button (`activities-client.tsx:170-176`), the `ActivityFilters` row, and the `search` /
`activeFilters` props. `ActivityList`'s props are only
`{ activities, activityTypes, onEdit, onRefresh }` (`activity-list.tsx:83-88`) — no `search`.
**How to avoid:** **lift `rowSelection` to `ActivitiesClient`** and pass
`{ rowSelection, onRowSelectionChange }` down into `ActivityList`'s `useReactTable`. The bar, the
spacer, and the failure report then render in `ActivitiesClient` after the `Load More` button, and
the clear-on-filter effect keys on a filter signature the parent already has
(`JSON.stringify({ search, ...activeFilters })`). (auto-accepted recommended, autonomous mode)
**Warning signs:** the Activities `Load More` button hidden behind the bar; an Activities selection
that survives a filter change.

### Pitfall 10 — `colSpan={columns.length}` after prepending the select column
**What goes wrong:** the "No organizations found." empty-state cell is one column short, so the table
renders a stray empty cell.
**Why it happens:** all three tables hardcode `colSpan={columns.length}` from the **prop**, not from
the table (`organizations/data-table.tsx:199`, `people/data-table.tsx:199`,
`activity-list.tsx:499`), and the select column is added to a derived `columnsWithSelect` array.
**How to avoid:** `colSpan={table.getAllLeafColumns().length}` (or `columnsWithSelect.length`).
**Warning signs:** a visibly misaligned empty state on a filtered-to-nothing list.

### Pitfall 11 — `getFilteredRowModel()` on Activities is inert
**What goes wrong:** a plan (or a verifier) spends effort on a filtered-select-all scenario that
cannot be produced, and 38-UI-SPEC's checklist item "Activities only: filter to 5 rows, select all,
clear the filter → the count did not jump to 50" is untestable as written.
**Why it happens:** `activity-list.tsx:395` configures `getFilteredRowModel()` but **no filter state
is ever set** — verified: zero occurrences of `columnFilters`, `globalFilter`, `setColumnFilters`,
`setGlobalFilter`, `filterFn`, or a `state:` key in that file. All Activities filtering is
server-side via URL params (`activities/page.tsx:70-155`) plus post-query `.filter()` calls in
`page.tsx`. So the filtered row model equals the core row model.
**How to avoid:** still use the `Page` variants (`getIsAllPageRowsSelected` etc.) — they are correct
and future-proof — but justify the `loadedIds` intersection on the **phantom-key** ground (TanStack
does not prune `rowSelection` when a row leaves `data`), not on the filter ground. Rewrite the
Activities checklist item as "filter via the URL filter bar → selection cleared".
**Warning signs:** a plan task asserting a client-side filter on Activities.

### Pitfall 12 — Won/lost stage deals are not selectable
**What goes wrong:** a user cannot bulk-act on won or lost deals, and a verifier may read that as a
defect.
**Why it happens:** `kanban-board.tsx:360-395` renders won and lost stages as **summary tiles**
(count + total value) with no `DealCard` children at all. Only `openStages` render cards.
**How to avoid:** state the boundary in the plan: "Deals selection covers open-stage cards only;
won/lost stages render summaries, not cards, and get no checkbox." 38-UI-SPEC does not mention this.
**Warning signs:** a task that adds a checkbox to the won/lost tiles.

### Pitfall 13 — A grep-based acceptance gate colliding with an explanatory comment
**What goes wrong:** the plan's own gate goes red because a comment *mentions* the forbidden token.
**Why it happens:** STATE.md, Phase 37: "A grep-based acceptance gate that searches raw file text
collided with an explanatory COMMENT **nine times in one phase** — including once with the plan's own
suggested wording." Phase 35 hit it three times.
**How to avoid:** **always reword the comment, never weaken the gate.** Better: strip comments before
asserting (the pattern `src/lib/audit/no-mutation-coupling.test.ts` uses, and
`src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx`). This phase is unusually
exposed because its most important rule is a *negative* about a function name
(`update{Entity}Mutation` must not be called with `ownerId`) that will inevitably be explained in a
comment right next to the call site.
**Warning signs:** a gate whose failure message points at a doc comment.

### Pitfall 14 — `d` / `e` / `n` fire while a bulk dialog is open, and `Escape` double-fires
**What goes wrong:** pressing `d` with the bulk delete `AlertDialog` open opens the **single-record**
delete dialog underneath it. Pressing `Escape` closes the dialog **and** clears the selection.
**Why it happens:** `useDataTableKeyboard`'s hotkeys are document-level `react-hotkeys-hook` bindings
guarded only by `isFormFocused()`, which checks for `INPUT`/`TEXTAREA`/`SELECT`/`contenteditable`
(`data-table-keyboard.tsx:60-70`). A focused Radix dialog button is none of those. Radix's own
`Escape` handling does not block document listeners.
**How to avoid:** the `d`/`e`/`n`-during-dialog behaviour is **pre-existing** (it is already true of
the existing single-record delete dialog) — note it, verify it, do not fix it here. For the **new**
`Escape` binding, gate it on dialog state: `enabled: !bulkDeleteOpen && !bulkReassignOpen` (or a
plain container `onKeyDown`). Add **no** other key binding — 38-UI-SPEC forbids binding `d`, `x`,
`Delete`, or `Backspace` to a bulk action, and that prohibition is the single most safety-relevant
copy rule in the phase.
**Warning signs:** two stacked dialogs; a cancelled bulk delete that also cleared the selection.

### Pitfall 15 — SC-3 and SC-5 for reassign are unverifiable in the current live data
**What goes wrong:** a reassign "succeeds" and no audit row appears, and it looks like Pitfall 1 all
over again — but this time it is *correct behaviour*.
**Why it happens:** the live DB has exactly **1** user matching `deleted_at IS NULL AND status =
'approved'` (`prbitt@gmail.com`, role `admin`), and **all 46,054 organizations are owned by that same
user** [VERIFIED: live DB, this session — 38-UI-SPEC's measurement is confirmed]. The other 6 users
are all `approved` but all soft-deleted. So the picker offers exactly one option: the record's
current owner. `ownerId` from === to → `buildChanges` → `{}` → **no audit row**, correctly.
**How to avoid:** the plan must include a verification prerequisite — restore or create a second
approved, non-deleted user before UAT (e.g. via `/admin/users`, or
`UPDATE users SET deleted_at = NULL WHERE email = 'mark.chen@pipelite.local'`). Without it SC-3's
per-record failure path and SC-5's reassign history are both undemonstrable.
**Bonus — this also unlocks the canonical partial-failure scenario:** reassign 3 organizations to
user B, then select those 3 plus 9 owned by the admin and bulk delete. Organizations have **no admin
bypass**, so exactly 3 fail with `notPermitted` and 9 succeed — a real 9/12 partial failure, not a
simulated one. (On **deals** the same sequence would fully succeed, because deals *does* have the
bypass. That asymmetry is itself worth showing.)
**Warning signs:** a UAT step that reassigns to "the only option in the list".

### Pitfall 16 — Adding `owners` to the wrong query on Activities and Deals
**What goes wrong:** the existing owner *filter* dropdown or the activity-dialog assignee list
silently loses or gains options.
**Why it happens:** `activities/page.tsx:99-107` and `deals/page.tsx:159-163` both fetch
`users` with `isNull(users.deletedAt)` **only** — no `status` predicate — and feed one array to
several consumers (`ActivityFilters`, `ActivityDialog`, `DealFilters`). 38-UI-SPEC requires the bulk
picker to filter on both `deleted_at IS NULL` **and** `status = 'approved'`, and explicitly says not
to change the existing lists.
**How to avoid:** a **separate** `bulkOwners` query/prop for the bulk picker on all four pages.
`organizations/page.tsx` and `people/page.tsx` fetch no users at all today (verified) and need the
new query outright.
**Warning signs:** a diff that changes the `where` clause of an existing `users.findMany`.

---

## Code Examples

### Deriving `selectedIds` defensively (client)

```ts
// Source: 38-UI-SPEC.md § Surface 1, justified against @tanstack/react-table 8.21.3 behaviour
const loadedIds = useMemo(() => new Set(data.map((r) => r.id)), [data])
const selectedIds = useMemo(
  () => Object.keys(rowSelection).filter((id) => rowSelection[id] && loadedIds.has(id)),
  [rowSelection, loadedIds],
)
```

TanStack does not prune `rowSelection` when a row leaves `data`, so after a bulk delete the keys of
the deleted rows linger. The intersection makes a phantom impossible by construction, on top of the
explicit clearing in the handler.

### Enabling row selection (client, all three tables)

```ts
// Source: node_modules/@tanstack/table-core/build/lib/features/RowSelection.d.ts (8.21.3)
const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

const table = useReactTable({
  data,
  columns: columnsWithSelect,
  getRowId: (row) => row.id,        // REQUIRED — the default row id is the row INDEX
  state: { rowSelection },
  onRowSelectionChange: setRowSelection,
  enableRowSelection: true,
  getCoreRowModel: getCoreRowModel(),
  // existing meta / getFilteredRowModel unchanged
})
```

### The bulk delete server action (server)

```ts
// Source: composed from src/app/organizations/actions.ts (auth + ownership + runWithActor +
// revalidatePath) and src/app/api/v1/organizations/batch/route.ts (sequential per-record loop)
"use server"

export async function bulkDeleteOrganizations(
  ids: string[],
): Promise<
  | { success: true; succeeded: string[]; failed: Array<{ id: string; reason: BulkFailureReason }> }
  | { success: false; error: "not_authenticated" | "too_many"; max?: number }
> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "not_authenticated" }

  const uniqueIds = Array.from(new Set(ids))
  if (uniqueIds.length > BULK_MAX_IDS) {
    return { success: false, error: "too_many", max: BULK_MAX_IDS }
  }

  // ONE actor scope for the whole loop. AsyncLocalStorage propagates across every await inside,
  // and the audit subscriber reads it synchronously at handler entry while crmBus.emit is still
  // on the mutation's own stack.
  const outcome = await runWithActor({ kind: "user", userId: session.user.id }, async () => {
    const succeeded: string[] = []
    const failed: Array<{ id: string; reason: BulkFailureReason }> = []

    for (const id of uniqueIds) {
      const row = await db.query.organizations.findFirst({
        where: and(eq(organizations.id, id), isNull(organizations.deletedAt)),
      })
      if (!row) { failed.push({ id, reason: "notFound" }); continue }

      // The predicate is copied verbatim from deleteOrganization above. Organizations have NO
      // admin bypass; deals do. Do not unify these four.
      if (row.ownerId !== session.user.id) {
        failed.push({ id, reason: "notPermitted" }); continue
      }

      const result = await deleteOrganizationMutation(id, session.user.id)
      if (result.success) succeeded.push(id)
      else failed.push({ id, reason: "unknown" })
    }

    return { succeeded, failed }
  })

  // ONCE, after the loop — not per record.
  if (outcome.succeeded.length > 0) revalidatePath("/organizations")

  return { success: true, ...outcome }
}
```

### Scoped export server action (server)

```ts
// The signature takes ids and NOTHING else. See § Pitfall 4 — accepting ExportFilters here
// would let any authenticated caller bypass the admin gate on getExportData.
export async function exportSelectedOrganizations(ids: string[]): Promise<ExportResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "Not authenticated" }

  const uniqueIds = Array.from(new Set(ids))
  if (uniqueIds.length === 0) return { success: false, error: "No records selected" }
  if (uniqueIds.length > BULK_MAX_IDS) return { success: false, error: "Too many records" }

  const result = await fetchFilteredData({
    entityType: "organization",
    format: "csv",
    includeCustomFields: true,
    filters: { ids: uniqueIds },
  })
  if (!result.success) return result

  const date = new Date().toISOString().split("T")[0]
  // Never translated: the entity slug is the English plural, so the name is stable on disk.
  return { ...result, filename: `organizations-selected-${result.count}-${date}.csv` }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact on this phase |
|---|---|---|---|
| `Papa.unparse(data, { header: true })` deriving headers from row 1 | `deriveCsvColumns` unions keys across every row | plan 34-13 | `custom_*` columns survive a scoped export whose first row has none. The STATE.md "CSV export drops every custom_* column" note is **stale** — do not re-derive from row 1, and do not "fix" a problem that is fixed. |
| A hard-delete `deleteX` | soft delete + `/trash` + restore + audited purge + daily pruner | Phase 37 (2026-08-17) | Bulk delete is genuinely recoverable, so no type-the-count friction gate is warranted. |
| Audit code inside mutations | one `crmBus` subscriber, gated by `no-mutation-coupling.test.ts` | Phase 36 | Bulk writes are audited for free — and any bulk-specific audit row would fail the gate. |
| `onSuccess` on record dialogs | `onRecordSaved`, refresh-only; closing lives in `onOpenChange` | Phase 35 | Do not reintroduce `onSuccess`. |
| Kanban selection via `data-selected` only | `data-selected` = keyboard cursor; `data-state="selected"` = bulk selection | this phase | The two must not be conflated; `data-state` is already wired and inert on all three tables. |

**Deprecated / do not reach for:**
- `src/components/ui/entity-combobox.tsx` for users — hardwired to the four CRM `EntityType`
  literals; widening `EntityType` would push a non-CRM literal into two **persisted** column types
  (`audit_log.entity_type`, `notes.entity_type`) plus `assertEntityType`.
- `src/components/assignee-picker.tsx` — multi-select (`value: string[]`); owner is single-valued.
  Held in reserve for a >30-active-user deployment.
- `src/app/admin/export/actions.ts::getExportData` — admin-gated; unusable for the scoped export.
- The `/api/v1/*/batch` loops as a *failure-reporting* model — they silently drop failures
  (`organizations/batch/route.ts:55-62` pushes only successes, and `meta.total` is set to
  `created.length`, so it can never disagree with `meta.created`). Reuse the sequential-loop shape;
  reject the swallow.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | Adding `ids?: string[]` to `ExportFilters` typechecks against `const conditions: ReturnType<typeof eq>[]` in `fetchDeals` / `fetchActivities` without a cast | § The Export Path | A cast or a widened annotation is needed; one extra line, no design change |
| A2 | A `Readonly<Record<EntityType, (id, userId) => Promise<…>>>` map accepts all four `delete*Mutation` references without a wrapper (their signatures are structurally identical — read, not compiled together) | § Pattern 1 | Needs per-arm wrappers, as `src/lib/mutations` dispatch did in Phase 27 ("type-cast wrappers to normalize varying mutation signatures", STATE.md) |
| A3 | ~2-6 s wall clock for a 100-record sequential bulk delete (≈3-4 round trips per record on a local pool, plus non-awaited fan-out) — **estimated, not measured** | § Pitfall 6 | If materially slower, the bar's single spinner may need a progress count; measure during execution before promising a number in copy |
| A4 | Radix `AlertDialog` / `Dialog` do not block document-level `react-hotkeys-hook` listeners, so `d`/`e`/`n` fire while a bulk dialog is open | § Pitfall 14 | If Radix does block them, the pre-existing hazard does not exist and the `Escape` gate is still correct but less necessary. Verify in the browser, do not assume either way |
| A5 | Tailwind v4 emits `data-[state=selected]:bg-muted` after plain `bg-muted/50`, so a row that is both keyboard-cursor and bulk-selected renders `bg-muted` | § Surface Inventory | Only affects which weak tint wins; the primary-ring from `globals.css:172-174` carries the distinction either way |
| A6 | The delete path can collapse `alreadyDeleted` into `notFound` without a second read | § Authorization Matrix | If a plan wants `alreadyDeleted` reachable, it needs a second `findFirst` without the `isNull(deletedAt)` predicate — one extra query per failed id |

Everything else in this document is `[VERIFIED]` against this repo's source, `node_modules`, or the
live Docker Postgres, or `[CITED]` to a specific file and line.

---

## Open Questions (RESOLVED)

> All three were resolved at their recommended answers under the autonomous run's standing
> auto-accept instruction, and all three are implemented in the plans:
> **Q1 RESOLVED** → cap at `BULK_MAX_IDS` with the 44th copy key `bulk.selectAllInStageCapped`,
> added to `REQUIRED_BULK_KEYS` in the same commit (plans 38-01, 38-18).
> **Q2 RESOLVED** → do not filter the picker; the owner mutations early-return idempotently on an
> unchanged `ownerId`, so a same-owner reassign writes no audit row by design (plans 38-02, 38-08).
> **Q3 RESOLVED** → deep-link the Trash tab via the existing `ENTITY_TO_TRASH_TAB` (plan 38-10).

1. **What should "select all in stage" do on a stage with 10,495 deals?** — **RESOLVED (capped)**
   - *What we know:* `/deals` has no pagination; the largest live stage holds 10,495 deals; the cap is
     100. `38-CONTEXT.md`'s justification for the cap ("page size is 50, so the cap is never hit
     through the UI") does not hold on Deals, and the copy catalogue has no truncation string.
   - *What's unclear:* whether to disable, truncate, or accept the dead control.
   - *Recommendation (auto-accepted recommended, autonomous mode):* **select at most `BULK_MAX_IDS`
     deals, taking them in rendered order, and make the header checkbox's `aria-label` and the bar's
     count state the truth** — the bar already says "100 selected", which is exact and non-misleading.
     Also **disable** the stage-header checkbox when the stage holds more than `BULK_MAX_IDS` deals is
     the *alternative*; it is worse, because it makes the control useless on 9 of the live stages
     without explaining why. Truncation needs **one new key** beyond the 43 (e.g.
     `bulk.selectAllInStageCapped`) — flag that as a deliberate, justified addition to the copy
     contract rather than letting the executor invent a string. `locale-parity.test.ts`'s
     exact-contract assertion means the key must be added to `REQUIRED_BULK_KEYS` in the same commit.
   - *Escalation:* if the planner prefers not to touch the copy contract, choose disable-over-cap and
     say so in the plan; do **not** ship an uncapped select-all that puts the bar permanently in its
     error state.

2. **Should the reassign picker exclude the records' current owner?** — **RESOLVED (no filter)**
   - *What we know:* with 1 approved user, the only option *is* the current owner of every record, and
     reassigning to the same owner is a correct no-op that writes no audit row.
   - *Recommendation:* do **not** filter — a mixed selection has no single current owner, so filtering
     would be either wrong or per-record. Make `update{Entity}OwnerMutation` return
     `{ success: true }` early when `ownerId` is unchanged, and state in the plan that a same-owner
     reassign produces no audit row **by design**. Combined with the second-user prerequisite
     (Pitfall 15), SC-5 stays demonstrable.

3. **Does the success toast's `Open Trash` action need the right tab?** — **RESOLVED (deep-link)**
   - *What we know:* `bulk.openTrash` is in the key catalogue; `ENTITY_TO_TRASH_TAB`
     (`src/lib/trash/entity-types.ts:47`) already maps `EntityType → TrashTab`, and `/trash` parses
     a tab param via `parseTrashTab`.
   - *Recommendation:* deep-link the tab (`/trash?type=organizations`). It is one existing constant and
     it is what makes SC-2 ("finds those records in trash") a one-click check rather than a hunt.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker app container | All browser verification | ✓ | Up 2 hours; `GET /login` → **200** | none — required |
| Postgres (Docker) | Live-DB probes, SC-2/SC-5 verification | ✓ | Up 8 days (healthy); reachable via `docker compose exec postgres` (no sudo) | none — required |
| Mailhog | Proving no email on bulk reassign | ✓ | Up 9 days; `http://localhost:8025` → **200** | none — required for that one check |
| `vitest` | Unit tests | ✓ | 4.0.18 | none |
| `./node_modules/.bin/drizzle-kit` | Migrations | ✓ | 0.31.9 | Not needed — this phase adds **no** migration (`ExportFilters.ids` is a type, `BULK_MAX_IDS` is a constant, the new mutations write existing columns) |
| jsdom / `@testing-library/react` | Rendering client components in tests | ✗ | — | **No fallback.** Both vitest projects are `environment: 'node'` and neither library is installed. Component behaviour is verified in the browser; only pure helpers are unit-tested. Phase 44 made the same call deliberately (STATE.md) — do **not** install them here. |
| A second approved, non-deleted user | SC-3 partial-failure and SC-5 reassign verification | ✗ | 1 of 7 users is live+approved | Restore one (`UPDATE users SET deleted_at = NULL WHERE email = 'mark.chen@pipelite.local'`) or create one via `/admin/users`. **This is a plan task, not an incidental setup step.** |

**Missing dependencies with no fallback:** jsdom / testing-library — accepted; the phase's automated
coverage is server-side and pure-helper, and its UI contract is browser-verified.
**Missing dependencies with fallback:** the second user — restore or create one.

---

## Validation Architecture

`workflow.nyquist_validation` is `true` and `workflow.tdd_mode` is `true` in `.planning/config.json`,
so this section is binding.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest **4.0.18**, two projects |
| Config files | `vitest.config.ts` (base, `environment: 'node'`, `include: ['src/**/*.{test,spec}...']`, excludes `*.rsc.test.*`) and `vitest.rsc.config.ts` (`react-server` condition, `include: ['src/**/*.rsc.test.*']`) |
| DOM environment | **none** — no jsdom, no happy-dom, no `@testing-library/*` |
| Quick run command | `./node_modules/.bin/vitest run <path>` |
| Full suite command | `npm test` (= `vitest run && vitest run --config vitest.rsc.config.ts`) |
| Typecheck / lint | `npm run typecheck` (`tsc --noEmit`), `npm run lint` (`eslint`) |
| Current baseline | 1703 passing, 0 typecheck errors, 0 lint errors (Phase 37 close-out) |
| Mocking convention | `vi.mock("@/db", …)` with a hand-shaped `{ query: { <table>: { findFirst } }, insert, update, delete, transaction }`; `vi.mock("@/lib/events")` for `crmBus.emit`; `vi.mock("@/lib/audit/actor-context")` for `getCurrentActor`; `vi.mock("@/lib/custom-fields")` and a partial mock of `@/lib/formula-recalc` via `importOriginal`. See `src/lib/mutations/organizations.test.ts:1-64`. **Importing any `src/lib/mutations/*` module without mocking `@/db` throws `DATABASE_URL environment variable is not set`** (verified this session). |

### Phase Requirements → Test Map

| Req | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| BULK-01 | `useSelectColumn` produces `id:"select"`, `size:44`, `enableSorting:false`, `enableHiding:false` | unit (pure column def) | `./node_modules/.bin/vitest run src/components/bulk/select-column.test.ts` | ❌ Wave 0 |
| BULK-01 | The checkbox column is prepended, never appended, and the empty-state `colSpan` counts it | source gate (comment-stripped) | `./node_modules/.bin/vitest run src/components/bulk/select-wiring.test.ts` | ❌ Wave 0 |
| BULK-01 | `checkbox.tsx` renders a Minus branch for `indeterminate` and the 8 existing consumers pass no `indeterminate` | source gate | `./node_modules/.bin/vitest run src/components/ui/checkbox-indeterminate.test.ts` | ❌ Wave 0 |
| BULK-01 | Selection, indeterminate, Load-More persistence, filter-clear, kanban drag/expand/keyboard non-interference, 320px | **browser (manual UAT)** | not automatable — no jsdom | n/a (38-UI-SPEC § States Checklist) |
| BULK-02 | Over-cap request is rejected with the count, and **no mutation is called** | unit | `./node_modules/.bin/vitest run src/app/organizations/bulk-actions.test.ts` | ❌ Wave 0 |
| BULK-02 | Unauthenticated → `not_authenticated`, no mutation call, **no actor established** | unit | same file | ❌ Wave 0 |
| BULK-02 | A non-owned record yields `notPermitted` and the mutation is **not** called for it | unit | same file (×4 entities) | ❌ Wave 0 |
| BULK-02 | Deals **does** allow an admin over a non-owned deal; organizations/people/activities do **not** | unit | `src/app/deals/bulk-actions.test.ts` + the three others | ❌ Wave 0 |
| BULK-02 | 9 succeed / 3 fail → `{ succeeded: [9], failed: [3 with reasons] }`, loop continues past a failure | unit | same files | ❌ Wave 0 |
| BULK-02 | `revalidatePath` is called **once**, after the loop | unit (spy call count) | same files | ❌ Wave 0 |
| BULK-02 | `runWithActor` wraps the loop once, not per record | unit (spy call count === 1) | same files | ❌ Wave 0 |
| BULK-02 | Records really land in `/trash` under the right tab, and change history shows the delete | **browser + live DB probe** | `docker compose exec postgres psql … "select count(*) from audit_log where action='deleted' and actor_user_id=…"` | n/a |
| BULK-03 | `update{Entity}OwnerMutation` writes `ownerId`, emits the **full** post-write row as `data` and the pre-read row as `previous`, with `changedFields: ["ownerId"]` | unit | `./node_modules/.bin/vitest run src/lib/mutations/organizations.test.ts` (extend the existing file) ×4 | ✅ extend |
| BULK-03 | Same-owner reassign short-circuits: no UPDATE, no emit | unit | same | ✅ extend |
| BULK-03 | **REGRESSION GATE:** `updateDealOwnerMutation` never touches `dealAssignees` | unit (assert `db.delete` not called) | `src/lib/mutations/deals.test.ts` | ✅ extend |
| BULK-03 | **REGRESSION GATE:** `buildChanges` on the emitted payload yields an `ownerId` entry (proves the audit row will be written) | unit (pure — `diff.ts` is db-free) | `src/lib/audit/diff.test.ts` | ✅ extend |
| BULK-03 | The target user is validated **once** before the loop, against `deleted_at IS NULL AND status='approved'` | unit | `src/app/*/bulk-actions.test.ts` | ❌ Wave 0 |
| BULK-03 | No email is sent | **browser + Mailhog** (zero new messages at `http://localhost:8025`) | n/a | n/a |
| BULK-04 | `ExportFilters.ids` narrows every one of the four fetchers | unit | `./node_modules/.bin/vitest run src/lib/export/formatters.test.ts` | ✅ extend |
| BULK-04 | `ids: []` yields zero rows (never a full table) | unit + **live DB probe** | same + `psql` count | ✅ extend |
| BULK-04 | `deriveCsvColumns` keeps `custom_*` when row 1 has none | unit | `src/lib/export/csv-columns` coverage already exists | ✅ exists |
| BULK-04 | The scoped-export action signature accepts **only** `ids` — no `ExportFilters` / `ExportOptions` / `format` | source gate (comment-stripped) | `src/app/*/bulk-actions.test.ts` | ❌ Wave 0 |
| BULK-04 | Filename is `{entity}-selected-{count}-{YYYY-MM-DD}.csv` and untranslated | unit | same | ❌ Wave 0 |
| BULK-04 | The downloaded file has exactly N data rows and no `[object Object]` | **browser** | n/a | n/a |
| all | 43 `bulk.*` keys exist, non-empty, translated, placeholder-stable, key-set-identical in all 3 locales | unit | `./node_modules/.bin/vitest run src/messages/locale-parity.test.ts` | ✅ extend with `REQUIRED_BULK_KEYS` + `BULK_NAMESPACE` + `bulkKeys` |
| all | No React element crosses the RSC boundary into a Radix `asChild` slot | unit (existing repo-wide gate) | `./node_modules/.bin/vitest run "src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx"` | ✅ exists |
| all | The new `update*OwnerMutation`s stay uncoupled from the audit layer (SC-5) | unit (existing gate, auto-covers them via the `update` prefix) | `./node_modules/.bin/vitest run src/lib/audit/no-mutation-coupling.test.ts` | ✅ exists |

### Sampling Rate
- **Per task commit:** `./node_modules/.bin/vitest run <the touched test file>` + `npm run typecheck`
- **Per wave merge:** `npm test` (both projects) + `npm run typecheck` + `npm run lint`
- **Phase gate:** full suite green (≥1703 + new), 0 typecheck, 0 lint errors, zero new
  `@ts-expect-error`, then `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/bulk/limits.ts` + `src/lib/bulk/types.ts` — import-free, so the client bar can use them
- [ ] `src/lib/bulk/dispatch.ts` + `src/lib/bulk/dispatch.test.ts` — assert **both** directions of the
      `satisfies` (TS2741 missing arm, TS2353 extra arm), per Phase 37's lesson
- [ ] `src/app/{organizations,people,deals,activities}/bulk-actions.test.ts` — covers over-cap,
      unauthenticated, per-entity authorization asymmetry, partial failure, single `revalidatePath`,
      single `runWithActor`, and the export-signature source gate
- [ ] `src/components/bulk/select-column.test.ts` + `select-wiring.test.ts` — pure column def + a
      comment-stripped source gate on the three tables
- [ ] `src/components/ui/checkbox-indeterminate.test.ts` — the Minus branch plus the
      8-consumer no-`indeterminate` assertion
- [ ] Extend `src/lib/mutations/{organizations,people,deals,activities}.test.ts` — the four new owner
      mutations, incl. the `dealAssignees`-untouched regression gate
- [ ] Extend `src/lib/audit/diff.test.ts` — `ownerId` appears in `buildChanges` for the new emit shape
- [ ] Extend `src/lib/export/formatters.test.ts` — `ids` narrowing on all four fetchers, `ids: []`
- [ ] Extend `src/messages/locale-parity.test.ts` — `BULK_NAMESPACE`, `bulkKeys`, `REQUIRED_BULK_KEYS`
      (43 keys, or 44 if Open Question 1 adds the capped-select string), passed **separately**, never
      concatenated with the note/audit/trash lists
- [ ] Framework install: **none** — vitest is present, and jsdom/testing-library must **not** be added

**Where a live-DB probe is mandatory** (Phase 37's lesson: "a wholly-mocked suite passes the broken
version, which is why this needed a live-database probe"):
1. `ExportFilters.ids` → the generated SQL and its row count. A mocked `db.query` cannot catch a
   malformed `inArray` any more than it caught the malformed `sql` fragment in Phase 37.
2. The audit rows for a bulk delete and a bulk reassign — count and `changes` keys, read from
   `audit_log` in the container, not from a spy.
3. The `deal_assignees` row count before and after a deals bulk reassign (the Pitfall 2 regression).
4. `owners` list correctness — `select count(*) from users where deleted_at is null and status='approved'`.

---

## Security Domain

`security_enforcement` is not set to `false`, so this section applies.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `await auth()` first in every bulk action; return before any actor scope opens (`runWithActor` after the session check — T-36-02) |
| V3 Session Management | no (unchanged) | Auth.js JWT strategy, untouched |
| V4 Access Control | **yes — the core risk of this phase** | Per-record ownership check in the server action, copying each entity's existing predicate verbatim (deals has an admin bypass; the other three do not). Plus: the scoped-export action must **not** accept filters — see below |
| V5 Input Validation | yes | `ids: string[]` deduped and length-capped at `BULK_MAX_IDS` server-side; `ownerId` validated once against `deleted_at IS NULL AND status='approved'`; `owner_id` is `NOT NULL REFERENCES users(id)` so the DB is the last line |
| V6 Cryptography | no | Nothing cryptographic in this phase |
| V7 Error Handling & Logging | yes | Every bulk write produces an `audit_log` row via the existing subscriber. Per-record failures return a **closed reason code**, never a raw server message (untranslatable, and a leak vector) |
| V12 Files & Resources | no | No upload/download of user files; the CSV is generated in memory |
| V13 API & Web Service | yes | No new REST route. The new server actions are the only new write surface |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| **Admin-gate bypass via the scoped export** — a non-admin passes `filters: {}` (or omits them) to a scoped-export action that accepts `ExportFilters`, and receives all 46,054 organizations, bypassing `getExportData`'s `role !== "admin"` check | Information Disclosure / Elevation of Privilege | The action signature is `(ids: string[])` and nothing else; `ExportOptions` is constructed server-side with `filters: { ids }`. `ids.length === 0` returns an error, never an unfiltered fetch. `inArray(col, [])` → `sql\`false\`` is the second line of defence |
| **Mass unauthorized mutation** — a crafted action call with 100 ids the caller does not own | Tampering / Elevation of Privilege | Per-record ownership check inside the loop, before the mutation call. Never a batch `UPDATE … WHERE id IN (…)` — that would authorize once for many rows |
| **Unbounded request** — 25,195 ids in one call | Denial of Service | `BULK_MAX_IDS = 100` enforced **server-side**; the client mirror is advisory only. Precedent: `MAX_BATCH_SIZE = 100` already exists in the `/api/v1/*/batch` routes |
| **Actor spoofing / unattributed writes** — a bulk write recorded as `system` | Repudiation | `runWithActor({ kind: "user", userId: session.user.id }, …)` built **only** from the session, never from a parameter. `actor-context.ts` exposes no way to set an actor from request data, and `subscribers/audit.ts` refuses to borrow `payload.userId` |
| **Silent data destruction** — `deal_assignees` wiped by a partial `updateDealMutation`, unaudited because assignees are a join table | Tampering | The narrow `updateDealOwnerMutation` never touches `dealAssignees`; a unit gate asserts `db.delete` is not called |
| **Reassigning to an inactive principal** — 100 records handed to a `rejected` or unverified user; the write succeeds so no per-record failure reports it | Elevation of Privilege (via ownership transfer) | Validate the target once against `deleted_at IS NULL AND status='approved'` before the loop. Do **not** copy `deals/page.tsx:159-163`'s `deletedAt`-only predicate |
| **Raw server error strings rendered in the failure report** | Information Disclosure | Closed reason union `notFound \| notPermitted \| alreadyDeleted \| unknown`, rendered through `bulk.reason.*` |
| **Event-fan-out amplification** — one click enqueues 100 webhook deliveries to a user-controlled URL | Denial of Service (outbound) | Bounded by `BULK_MAX_IDS`; the webhook delivery queue and its retry/backoff already exist and are unchanged. Documented, not mitigated further — the semantics (N deletes = N events) are correct |

---

## Sources

### Primary (HIGH confidence — read directly in this repo / container, 2026-08-17)
- `src/lib/mutations/{organizations,people,deals,activities}.ts` — Zod schemas, all delete/update
  mutations, `buildEventPayload`, `computeNewAssigneeIds`, `updateDealStageMutation`
- `src/app/{organizations,people,deals,activities}/actions.ts` — auth + ownership predicates,
  `runWithActor` placement, `revalidatePath`, `sendDealAssignedEmail` call site
- `src/lib/audit/{actor-context,diff}.ts`, `src/lib/events/subscribers/{audit,webhook,workflow-trigger}.ts`,
  `instrumentation.ts` — the fan-out and the non-awaited inserts
- `src/lib/audit/no-mutation-coupling.test.ts` — the per-function SC-5 gate regexes
- `src/lib/trash/{dispatch,entity-types,settings}.ts` — the dispatch idiom, tab map,
  `readTrashRetentionDays`
- `src/lib/export/{formatters,types,csv-columns}.ts`, `src/app/admin/export/{actions,export-form}.tsx`
- `src/app/{organizations,people,activities,deals}/page.tsx`, `.../data-table.tsx`,
  `activity-list.tsx`, `activities-client.tsx`, `kanban-{board,column}.tsx`, `deal-card.tsx`
- `src/components/ui/{checkbox,table}.tsx`, `src/components/keyboard/{data-table,kanban}-keyboard.tsx`,
  `src/app/globals.css`, `src/app/layout.tsx`
- `src/messages/locale-parity.test.ts`, `vitest.config.ts`, `vitest.rsc.config.ts`, `package.json`
- `node_modules/@tanstack/table-core@8.21.3/build/lib/features/RowSelection.d.ts`
- `node_modules/@radix-ui/react-checkbox/dist/index.d.mts` (`CheckedState`)
- `node_modules/drizzle-orm@0.45.1/sql/expressions/conditions.js` (`inArray` empty-array → `sql\`false\``)
- `node_modules/sonner@2.0.7/dist/index.d.ts` (`toast.warning`)
- **Live Postgres** via `docker compose exec postgres psql`: deal/org/person/activity counts,
  per-stage deal counts, user statuses + `deleted_at`, owner distribution, `deal_assignees` count,
  `app_settings` retention values, webhook/workflow counts, `audit_log` count
- **Two Zod probes run in this repo's vitest** confirming (a) `.partial()` preserves
  `.default([])` on `assigneeIds`, (b) unknown keys such as `ownerId` are stripped with
  `{ success: true, data: {} }`
- `.planning/phases/38-bulk-operations/38-CONTEXT.md`, `38-UI-SPEC.md`, `.planning/REQUIREMENTS.md`,
  `.planning/STATE.md`, `.planning/config.json`

### Secondary (MEDIUM confidence)
- Live HTTP probes: `http://localhost:3001/login` → 200, `http://localhost:8025` → 200,
  `docker compose ps` (app up 2h, postgres healthy 8d, mailhog 9d)

### Tertiary (LOW confidence — none relied upon)
- No WebSearch, Context7, or external documentation was needed: every API question was answerable
  from the installed `node_modules` type declarations, which are strictly more authoritative for the
  installed versions than published docs.

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — no new dependencies; every version read from `node_modules`
- Architecture / call paths: **HIGH** — every mutation, action, subscriber, and page read in full
- The two critical defects (Pitfalls 1 and 2): **HIGH** — reproduced by executable probes in this
  repo's own vitest, not inferred
- Authorization asymmetry, export gate, fan-out, pagination gap: **HIGH** — read from source and
  confirmed against live data
- Pitfalls: **HIGH**, except A3 (timing estimate) and A4 (Radix vs document listeners), both flagged
- Validation architecture: **HIGH** — configs and mocking conventions read directly; the
  no-jsdom constraint is a hard, verified fact with a documented precedent (Phase 44)

**Research date:** 2026-08-17
**Valid until:** 2026-09-16 (30 days — the stack is stable and fully in-repo; the only invalidator is
a change to the mutation-layer schemas, which is exactly what this phase touches)
