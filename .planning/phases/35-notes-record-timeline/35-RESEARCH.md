# Phase 35: Notes & Record Timeline - Research

**Researched:** 2026-08-15
**Domain:** Polymorphic append-only notes, per-record timeline assembly in Postgres, idempotent data migration at ~75k-row scale, Next.js 16 RSC/client boundary
**Confidence:** HIGH

Almost everything below was measured against this repo's **live Docker database** (PostgreSQL 16.13,
25,206 deals / 46,055 organizations / 79,023 activities) or verified by running the repo's own
toolchain (`drizzle-kit generate` on a throwaway probe schema, cleaned up afterwards). Where a claim
rests on training data alone it is tagged `[ASSUMED]` and repeated in the Assumptions Log.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Notes Data Model**
- One polymorphic `notes` table keyed by `entityType` + `entityId`, mirroring the existing
  `customFieldDefinitions.entityType` pattern — one migration, one query path, one component.
  Not four FK columns, not four tables.
- The author or an admin may edit and soft-delete their own note. Soft delete uses a `deletedAt`
  timestamp (repo convention across every CRM table). Edits stamp `updatedAt`; the UI renders an
  "edited" marker when `updatedAt > createdAt`.
- Note content is plain text with line breaks preserved. No markdown renderer, no rich-text
  editor, no new dependency — this also keeps the legacy-notes migration lossless by construction.
- The legacy `notes` column on `deals`, `organizations`, `people`, and `activities` is KEPT but
  goes dormant: nothing reads or writes it after this phase. Keeping it is what makes the SC-4
  reconciliation checkable after the fact. Dropping it is deferred to a later phase.

**Timeline Composition**
- Stage changes get a real source in this phase: a `deal.stage_changed` subscriber on the
  existing crmBus persists a minimal stage-history row. The timeline is built by a
  server-side assembler over a pluggable list of entry sources, so Phase 36's audit log
  becomes an additional source rather than a rewrite. SC-2 is therefore met inside Phase 35
  rather than deferred to Phase 36.
- Deals get the full timeline: notes + activities + stage changes. Organizations, people, and
  activities get the same timeline component fed by the notes source only. Pulling
  related-deal activities up into org/person timelines is deferred.
- Newest entry first, 20 entries per page, "Load more" to extend — matches existing paginated
  list conventions in the app.
- The timeline renders as a card below the record's details card, with an inline note composer
  pinned at the top of the card. Not a sidebar, not a separate tab.

**Legacy Notes Migration (NOTE-03)**
- A migrated note is attributed to the record's `ownerId` when present, otherwise the author is
  null and renders as "Unknown". Every migrated row carries `source: 'migration'` so migrated
  content stays distinguishable from user-written notes forever.
- A migrated note is dated with the record's `createdAt`, which guarantees SC-3's "first
  timeline entry" ordering without special-casing the sort.
- The migration is an idempotent `INSERT … SELECT` inside a generated drizzle migration,
  guarded so a re-run cannot duplicate rows (precedent: the Phase 25 manual migration SQL that
  wrapped existing data). Not a manually-run one-off script.
- SC-4 is proven by a checked-in reconciliation query that compares the count of non-empty
  legacy `notes` values per entity against the count of migrated notes per entity, with the
  before/after numbers recorded in the phase summary — the same BEFORE/AFTER evidence discipline
  Phase 33 used for its index work.

**API, Permissions & Surfaces**
- REST: `GET`/`POST` on `/api/v1/{entity}/{id}/notes` as a nested sub-resource, plus
  `PATCH`/`DELETE` on `/api/v1/notes/{noteId}`. This matches the existing `[id]`-nested route
  layout under `src/app/api/v1/`.
- Any authenticated user can add a note to any record, consistent with the logged decision that
  workflows are not owner-scoped and all authenticated users can CRUD them. Edit and delete stay
  restricted to the note's author or an admin (see Notes Data Model).
- No `note.created` CRM bus event in this phase. A 14th event type would drag in trigger-config
  UI, the trigger matcher, and API docs; it is deferred to its own phase.
- All new UI strings go through next-intl and land in all three locale files (`en-US.json`,
  `es-ES.json`, `pt-BR.json`).

### Claude's Discretion
- Table/column naming, index selection on the new tables, component file layout, and the exact
  shape of the timeline entry union type.
- Whether the stage-history table is deal-specific or generic enough for Phase 36 to reuse —
  decide during planning, but do not build the full audit log here.

### Deferred Ideas (OUT OF SCOPE)
- Dropping the legacy `notes` columns once reconciliation has held for a release.
- `note.created` CRM event + workflow trigger support.
- Pulling related-deal activities into organization and person timelines.
- Markdown or rich-text note bodies.
- @-mentions and note reactions.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NOTE-01 | User can add multiple timestamped, attributed notes to a deal, organization, person, or activity — appending rather than overwriting the single `notes` text column | § Standard Stack (notes table schema), § Pattern 2 (mutation layer + dual auth surfaces), § Pitfall 1 (the 4 edit dialogs still write the legacy column — must be neutralised or NOTE-01 is defeated in practice), § Security Domain (author/admin authorization) |
| NOTE-02 | User can view one chronological timeline per record interleaving notes, activities, and stage changes | § Pattern 1 (pre-limited UNION ALL assembler, **measured 1.0 ms warm** on a 500-note/117-activity/302-stage-change deal), § Pattern 3 (keyset paging, **0.35 ms** at depth), § Standard Stack (`deal_stage_history` table), § Pitfall 4 (crmBus subscriber is fire-and-forget and has silently died in this repo's Docker build before) |
| NOTE-03 | Existing `notes` column content is migrated into a first note per record, with no data loss | § Code Example 3 (exact idempotent `INSERT … SELECT`, **measured 3.3 s + 6.8 s** on live data), § Code Example 4 (reconciliation queries proving SC-4, count **and** byte-identity), § Pitfall 2 (2,000-char validation cap vs a real 131,505-char note), § Pitfall 6 (post-migration imports write to the dead column) |
</phase_requirements>

---

## Summary

This phase is mostly a **schema + query-shape + boundary-discipline** problem, not a library
problem. It adds **zero dependencies** — every primitive the UI-SPEC calls for is already vendored
(the one exception, a Tooltip, is not vendored; see Pitfall 8). The interesting work is in four
places, and all four were measured here rather than assumed:

1. **The polymorphic `notes` table.** `entityId` cannot carry a real FK because it points at four
   different tables. The mitigation is a `(entity_type, entity_id, created_at DESC) WHERE
   deleted_at IS NULL` partial index that serves the timeline read, plus a **partial unique index
   on `(entity_type, entity_id) WHERE source = 'migration'`** which converts the migration's
   idempotency from a hand-written `NOT EXISTS` guard into a permanent database invariant. Both
   were verified to survive `drizzle-kit generate` verbatim — including the partial predicate and
   `DESC NULLS LAST` — which is what makes them D-06-compliant.

2. **The timeline assembler.** A **pre-limited `UNION ALL`** (each branch gets its own
   `ORDER BY … LIMIT 21` before the union, then one outer `ORDER BY … LIMIT 21`) lets Postgres
   produce a `Merge Append` over three index-driven branches. Measured **1.0 ms** warm on a
   deliberately hostile deal (503 notes, 117 activities, 302 stage changes). N-queries-merged-in-app
   is rejected: it is 3 round trips instead of 1, it cannot use `Merge Append`, and it makes correct
   paging require over-fetching every source.

3. **The legacy-notes migration.** The live data is **29,037 organizations + 46,198 activities**
   with non-empty notes; **deals and people have exactly zero**. Measured end to end in a
   rolled-back transaction: **3.3 s + 6.8 s** with the indexes already in place, and **0 rows** on
   re-run. Critically, the migration only takes `ACCESS SHARE` on the source tables (a read) and
   writes exclusively to a brand-new table nothing else touches — so there is **no user-visible
   write lock**, unlike Phase 33's 1.08 s `ShareLock`.

4. **The RSC boundary.** The Phase 44 class-wide gate in
   `src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx` walks **every non-test
   `.tsx` under `src/`** and fails if a non-client module renders any component whose source
   contains the literal `asChild>{children}`. The delete-note dialog is exactly that shape, so it
   and every renderer of it must be `'use client'`.

**The single biggest risk in this phase is not technical — it is scope.** CONTEXT locks "nothing
reads or writes [the legacy column] after this phase," but the UI-SPEC only removes the four
detail-page render blocks. There are **four create/edit dialogs with a live Notes textarea that
writes the column**, plus a kanban-card render site. If those survive, a user editing an
organization still overwrites one text box, that text never reaches the timeline, and NOTE-01 is
defeated on the most-used surface in the app. See Pitfall 1.

**Primary recommendation:** Build one `notes` table with a partial unique migration guard and a
partial live-read index, a deal-specific `deal_stage_history` table, a pre-limited `UNION ALL`
assembler behind a pluggable source interface with `(occurred_at, id)` keyset paging, and treat
"neutralise the four edit dialogs" as a first-class in-scope task rather than a follow-up.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Notes persistence + soft delete | Database / Storage | — | New `notes` table; soft delete is a column, not application state |
| Legacy notes migration | Database / Storage | — | `INSERT … SELECT` inside the generated migration; runs at container start via `docker-entrypoint.sh` |
| Migration idempotency | Database / Storage | — | Partial unique index — a permanent invariant, not a one-shot script guard |
| Timeline assembly + ordering | Database / Storage | API / Backend | One SQL statement produces the merged, ordered, paged feed; the backend only maps rows to a union type |
| Stage-change capture | API / Backend | Database / Storage | crmBus subscriber in `instrumentation.ts`-registered Node runtime; writes one row per `deal.stage_changed` |
| Note CRUD + authorization | API / Backend | — | `src/lib/mutations/notes.ts` for the DB work; **authorization stays in the server action / route**, per the repo's logged decision ("mutations only check entity existence") |
| First-paint timeline render | Frontend Server (SSR) | — | Page 1 arrives with the RSC detail page — no skeleton, no loading spinner (UI-SPEC) |
| Composer, inline edit, delete, Load more | Browser / Client | Frontend Server (SSR) | All interactive; `'use client'` mandatory both for React state and for the CFUI-01 `asChild` gate |
| i18n string resolution | Frontend Server (SSR) | Browser / Client | `getTranslations` server-side, `useTranslations` in client components — existing repo split |

---

## Standard Stack

**No new dependencies.** Every capability is covered by what is already installed. Verified against
`package.json` and `src/components/ui/`.

### Core (already installed — versions verified from package.json / node_modules)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `drizzle-orm` | 0.45.1 | Schema declaration, queries, `sql` template for the keyset predicate | Repo-wide ORM [VERIFIED: node_modules/drizzle-orm/package.json] |
| `drizzle-kit` | 0.31.9 | `generate` emits the DDL; `migrate` applies it at container start | D-06 mandates schema-declared indexes emitted via generate [VERIFIED: node_modules/drizzle-kit/package.json] |
| `next` | 16.1.6 | RSC detail pages, server actions, route handlers | [VERIFIED: package.json] |
| `react` / `react-dom` | 19.2.3 | `useOptimistic` / `useTransition` for optimistic add/edit/delete | [VERIFIED: package.json] |
| `next-intl` | 4.8.3 | The new `notes.*` namespace across three locale files | [VERIFIED: package.json] |
| `zod` | 4.3.6 | Note content + cursor validation | [VERIFIED: package.json] |
| `radix-ui` | 1.4.3 | `AlertDialog` for delete confirmation (single-package import) | [VERIFIED: package.json] |
| `lucide-react` | 0.575.0 | `MessageSquare`, `ArrowRight`, `Pencil`, `Trash2`, `Loader2`, … | [VERIFIED: package.json] |
| `sonner` | 2.0.7 | `toast.error` on failure paths only (UI-SPEC: success has no toast) | [VERIFIED: package.json] |
| `vitest` | 4.0.18 | Two projects: base + `react-server` | [VERIFIED: package.json] |

### Supporting (in-repo modules, not packages)

| Module | Path | Purpose | When to Use |
|--------|------|---------|-------------|
| Mutation layer | `src/lib/mutations/` | DB writes + crmBus emission | Note create/update/delete — do **not** write `db.insert` inline in the server action |
| CRM event bus | `src/lib/events/bus.ts` | `globalThis`-pinned singleton EventEmitter | Subscribe to `deal.stage_changed` |
| Subscriber pattern | `src/lib/events/subscribers/webhook.ts` | `registered` flag + `_resetForTesting()` | Copy verbatim for the stage-history subscriber |
| API auth (external) | `src/lib/api/auth.ts` — `withApiAuth` | Bearer **API-key** auth + rate limit | `/api/v1/**` only |
| API responses | `src/lib/api/response.ts` | `{ data, meta }` envelope, `createdResponse`, `noContentResponse` | `/api/v1/**` only |
| Session auth (internal) | `src/auth.ts` — `auth()` | Auth.js JWT session | Server actions and non-v1 routes |
| Relative timestamps | `src/components/ui/relative-time.tsx` | Already carries the SSR/CSR hydration guard | Every `<time>` in the timeline |

### UI primitives — vendored inventory check

Present in `src/components/ui/`: `alert-dialog`, `avatar`, `badge`, `button`, `card`,
`separator`, `sonner`, `textarea`, `relative-time`, `label`, `collapsible`, `dialog`,
`dropdown-menu`. **`tooltip.tsx` is absent** — see Pitfall 8.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pre-limited `UNION ALL` | 3 separate queries merged in TypeScript | 3 round trips instead of 1; no `Merge Append`; correct paging needs each source over-fetched to `offset+limit`; the merge and tie-break logic becomes hand-written code that must exactly match the SQL ordering used by the count query. **Rejected.** |
| Pre-limited `UNION ALL` | A Postgres `VIEW` over the union | The view cannot be pre-limited per branch, so it materialises every entry for the record before the outer LIMIT. Loses the whole optimisation. **Rejected.** |
| Keyset `(created_at, id)` | `LIMIT/OFFSET` | Offset shifts under a concurrent insert (an entry the user already saw reappears, or one is skipped) and forces each `UNION ALL` branch to `LIMIT offset+limit`. Measured 1.19 ms at offset 480 vs 0.35 ms keyset — but correctness, not speed, is the reason. **Rejected.** |
| Partial unique index guard | `WHERE NOT EXISTS (SELECT 1 FROM notes …)` | Both measured idempotent. `NOT EXISTS` cost 1.45 s on the no-op re-run and protects nothing after the migration finishes. The index is declarative, D-06-compliant, and permanent. **Prefer the index**; `NOT EXISTS` is an acceptable fallback if the planner wants belt-and-braces. |
| Deal-specific `deal_stage_history` | A generic `entity_changes` table | A generic table either becomes Phase 36's audit log (explicitly forbidden here) or a half-generic shape Phase 36 must migrate anyway. Deal-specific gets **real FKs** on `deal_id`/`from_stage_id`/`to_stage_id` — which the polymorphic `notes` table cannot have. Pluggability lives in the **assembler's source interface**, not the table shape. **Recommend deal-specific.** |

**Installation:**
```bash
# None. This phase installs nothing.
```

---

## Package Legitimacy Audit

**Not applicable — this phase installs zero external packages.**

`35-UI-SPEC.md` § Registry Safety records `components.json` has `"registries": {}` and that every
primitive is already vendored; `package.json` was read directly and no capability in this phase
requires an addition. `slopcheck` was therefore not run, and no package in this document is a new
recommendation. Every version cited above was read from the checked-in `package.json` or
`node_modules/*/package.json`, not from a registry lookup.

If the planner later concludes a package is needed (it should not), the Package Legitimacy Gate
must be run before that package enters a plan.

---

## Architecture Patterns

### System Architecture Diagram

```
                      ┌──────────────── WRITE PATHS ────────────────┐
                      │                                             │
  Browser                                                     External client
  (session cookie)                                            (Bearer API key)
      │                                                              │
      │ server action                                                │ HTTPS
      ▼                                                              ▼
┌──────────────────────────┐                        ┌──────────────────────────────┐
│ src/app/{entity}/        │                        │ /api/v1/{entity}/{id}/notes  │
│   actions.ts             │                        │ /api/v1/notes/{noteId}       │
│  auth() → session.user   │                        │ withApiAuth → API key + rate │
└───────────┬──────────────┘                        └───────────────┬──────────────┘
            │                                                       │
            │   AUTHORIZATION DECIDED HERE (author-or-admin)        │
            │   ← repo rule: mutations only check existence →       │
            └───────────────────────┬───────────────────────────────┘
                                    ▼
                    ┌───────────────────────────────┐
                    │ src/lib/mutations/notes.ts    │
                    │  create / update / softDelete │
                    │  (no note.* crmBus event —    │
                    │   deferred, CONTEXT-locked)   │
                    └───────────────┬───────────────┘
                                    ▼
                            ┌───────────────┐
                            │  notes table  │
                            └───────────────┘

                      ┌──────────── STAGE HISTORY ────────────┐

  deal update / stage drag / reorder / v1 PATCH
      │  (4 emit sites — 3 in mutations/deals.ts, 1 in the v1 route)
      ▼
  crmBus.emit("deal.stage_changed", payload)          ← synchronous EventEmitter
      │
      ├──► webhook subscriber          (existing)
      ├──► workflow-trigger subscriber (existing)
      └──► stage-history subscriber    (NEW — registered in instrumentation.ts)
                │  fire-and-forget INSERT, .catch(console.error)
                ▼
        ┌──────────────────────┐
        │ deal_stage_history   │
        └──────────────────────┘

                      ┌──────────── READ PATH (SC-2) ────────────┐

  GET /{entity}/{id}   (RSC page, server-rendered page 1)
      │
      ▼
  ┌──────────────────────────────────────────────────────────────┐
  │ src/lib/timeline/assemble.ts                                 │
  │   sources = entityType === 'deal'                            │
  │     ? [notesSource, activitiesSource, stageChangeSource]     │
  │     : [notesSource]                    ← Phase 36 appends    │
  │   ONE SQL statement:                     auditSource here    │
  │     (notes  ORDER BY created_at DESC, id DESC LIMIT n+1)     │
  │     UNION ALL                                                │
  │     (activities  … LIMIT n+1)                                │
  │     UNION ALL                                                │
  │     (stage_history … LIMIT n+1)                              │
  │     ORDER BY occurred_at DESC, id DESC LIMIT n+1             │
  │   → Merge Append over 3 index scans. Measured 1.0 ms.        │
  └───────────────────────────┬──────────────────────────────────┘
                              ▼
             TimelineEntry[] (discriminated union on `kind`)
                              │
                              ▼
  <RecordTimeline>  (server)  ── Card shell, first page, count
        └── <TimelineList>    ('use client')  ── state, optimistic ops, Load more
              ├── <NoteComposer>       ('use client')
              └── <TimelineEntry>      ('use client')  → note | activity | stage-change
                    └── <DeleteNoteDialog> ('use client', AlertDialog)

  "Load more" → server action  loadMoreTimeline(entityType, entityId, cursor)
                cursor = { occurredAt, id } of the OLDEST loaded entry
```

### Recommended Project Structure

```
src/db/schema/
├── notes.ts                    # NEW — polymorphic notes table
├── deal-stage-history.ts       # NEW — minimal stage history
├── _relations.ts               # EDIT — notesRelations (author only), dealStageHistoryRelations
└── index.ts                    # EDIT — two re-exports

src/lib/
├── mutations/notes.ts          # NEW — create/update/softDelete, existence checks only
├── timeline/
│   ├── types.ts                # NEW — TimelineEntry discriminated union, cursor type
│   ├── sources.ts              # NEW — one builder per source (the pluggable seam)
│   └── assemble.ts             # NEW — composes sources into one SQL statement
└── events/subscribers/
    └── stage-history.ts        # NEW — copy of webhook.ts shape, one event

src/components/timeline/        # NEW — 9 files, boundaries fixed by 35-UI-SPEC.md
src/app/{deals,organizations,people,activities}/
├── [id]/page.tsx               # EDIT — delete legacy block, mount <RecordTimeline>
└── actions.ts                  # EDIT — note server actions (or one shared notes/actions.ts)

src/app/api/v1/
├── {deals,organizations,people,activities}/[id]/notes/route.ts   # NEW — GET, POST
└── notes/[noteId]/route.ts                                       # NEW — PATCH, DELETE

drizzle/0013_*.sql              # NEW — generated DDL + hand-appended data migration
scripts/reconcile-notes.sql     # NEW — checked-in, re-runnable SC-4 proof
instrumentation.ts              # EDIT — register the stage-history subscriber
src/messages/{en-US,es-ES,pt-BR}.json   # EDIT — new `notes` namespace, 30 keys
public/openapi.yaml             # EDIT — 3 new path entries
```

### Pattern 1: Pre-limited `UNION ALL` timeline assembly

**What:** Each source gets its own `ORDER BY … LIMIT pageSize+1` *before* the union; the outer
query re-sorts at most `3 × (pageSize+1)` rows.

**When to use:** Always, for the deal timeline. For org/person/activity the assembler collapses to
the single notes branch and emits no `UNION ALL` at all — do not build a degenerate one-branch union.

**Why the pre-limit matters:** without it, Postgres materialises every note/activity/stage-change
for the record before applying the outer LIMIT. With it, the planner produces a `Merge Append` and
each branch stops after 21 rows.

**Measured** [VERIFIED: live DB, deal `768ca731…` with 503 notes / 117 activities / 302 stage changes]:

| Query | Execution Time |
|-------|----------------|
| Page 1, cold | 18.30 ms (97 blocks read from disk) |
| Page 1, warm | **1.009 ms** |
| Keyset deep page | **0.354 ms** |
| `LIMIT 21 OFFSET 480` equivalent | 1.188 ms |
| Header count (3 index-only `count(*)`, 0 heap fetches) | **0.480 ms** |

**Example** (the exact statement benchmarked):
```sql
-- Source: measured against the live pipelite DB, PostgreSQL 16.13, 2026-08-15
(
  (SELECT 'note' AS kind, n.id, n.created_at AS occurred_at
     FROM notes n
    WHERE n.entity_type = 'deal' AND n.entity_id = $1 AND n.deleted_at IS NULL
    ORDER BY n.created_at DESC, n.id DESC LIMIT 21)
  UNION ALL
  (SELECT 'activity', a.id, a.created_at
     FROM activities a
    WHERE a.deal_id = $1 AND a.deleted_at IS NULL
    ORDER BY a.created_at DESC, a.id DESC LIMIT 21)
  UNION ALL
  (SELECT 'stage_change', h.id, h.created_at
     FROM deal_stage_history h
    WHERE h.deal_id = $1
    ORDER BY h.created_at DESC, h.id DESC LIMIT 21)
)
ORDER BY occurred_at DESC, id DESC
LIMIT 21;
```

Resulting plan (abridged, `EXPLAIN ANALYZE`, warm):
```
Limit (actual rows=21)
  ->  Merge Append   Sort Key: created_at DESC, id DESC
        ->  Limit -> Sort -> Bitmap Heap Scan on notes   (Bitmap Index Scan on notes_live_idx)
        ->  Limit -> Sort -> Bitmap Heap Scan on activities (Bitmap Index Scan on activities_deal_id_idx)
        ->  Limit -> Sort -> Bitmap Heap Scan on deal_stage_history (Bitmap Index Scan on dsh_deal_idx)
Execution Time: 1.009 ms
```

**Note on `Bitmap Index Scan` vs `Index Scan`:** Phase 33 D-01 already established that a bitmap
scan satisfies an "index scan" criterion in this repo. Do not write a verification step that
demands a literal `Index Scan` node here — it will fail for correct code.

**Implementation note:** Drizzle's query builder has `unionAll`, but a per-branch `ORDER BY … LIMIT`
inside a union is awkward to express. Building the statement with `sql` template fragments and one
`db.execute(sql\`…\`)` is the pragmatic route; it also makes the keyset row-comparison trivial. Keep
the SQL in `src/lib/timeline/assemble.ts` so it is unit-testable as a string.

### Pattern 2: Two auth surfaces, one mutation layer

**What:** `/api/v1/**` authenticates with a **Bearer API key** (`withApiAuth` →
`validateApiKey` + `checkRateLimit`). It does **not** read the session cookie. The browser
authenticates with the Auth.js session via `auth()` in a server action or a non-v1 route.

**Why this matters here:** the UI-SPEC says "only Load more and the mutations are client fetches."
Those client calls **cannot target `/api/v1/…/notes`** — a browser has no API key. Confirmed by
reading `src/lib/api/auth.ts` (rejects anything without `Authorization: Bearer`) and
`src/app/api/custom-fields/save/route.ts` (the existing session-auth pattern, which calls `auth()`
directly and is *not* under `/api/v1`).

**Recommended:** server actions for every UI operation (add / edit / delete / load-more), following
`src/app/deals/actions.ts`; the `/api/v1` routes are built in the same phase for external
consumers, sharing `src/lib/mutations/notes.ts`. This mirrors the repo's existing split exactly
(logged decision: *"API routes emit CRM events directly via crmBus (different auth patterns than
server actions)"*).

**Authorization placement:** the repo's logged decision is explicit —
*"Ownership checks remain in server actions/API routes; mutations only check entity existence."*
So `isAuthorOrAdmin` lives in the action and in the route, **not** in `mutations/notes.ts`. Both
call sites need it; a shared helper (`src/lib/notes/authorize.ts`) prevents drift.

**Example** (repo-shaped return contract):
```typescript
// Source: pattern extracted from src/app/deals/actions.ts (verified in repo)
"use server"
export async function addNote(
  entityType: EntityType, entityId: string, content: string
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "Not authenticated" }
  const result = await createNoteMutation({ entityType, entityId, content, authorId: session.user.id })
  if (!result.success) return result
  revalidatePath(`/${pathSegmentFor(entityType)}/${entityId}`)
  return { success: true, id: result.id }
}
```

### Pattern 3: Keyset paging on `(occurred_at, id)`

**What:** The cursor is the `(occurredAt, id)` of the **oldest loaded** entry. Each branch adds
`AND (created_at, id) < ($ts, $id)`.

**Why it is correct under concurrent inserts:** a new note has `created_at = now()`, strictly newer
than any cursor, so it can never land inside an already-fetched window nor push an unfetched entry
past it. Offset paging has no such guarantee. Migrated notes are dated with the record's
`createdAt` (CONTEXT-locked), so they are *older* than every cursor the user has not yet reached —
also safe. An edit preserves `created_at`, so ordering never shifts.

**Verified planner behaviour:** Postgres derives an index bound from the row comparison —
the plan showed `Index Cond: (entity_type = … AND entity_id = … AND created_at <= '…')` with the
full `ROW(...) < ROW(...)` retained as a filter. That is a real index seek, not a scan-and-filter.

**Drizzle expression:**
```typescript
// Row comparison — must be a raw fragment; Drizzle has no row-constructor helper.
sql`(${notes.createdAt}, ${notes.id}) < (${cursor.occurredAt}, ${cursor.id})`
```

**Cursor encoding:** base64url of `{occurredAt: ISO string, id}`. Validate with zod on the way in —
an attacker-supplied cursor reaches a SQL parameter, so it must parse as a real timestamp.
`hasMore` is derived from fetching `pageSize + 1` and discarding the extra row.

### Pattern 4: The pluggable source interface (what makes Phase 36 additive)

CONTEXT requires the assembler be "over a pluggable list of entry sources." Keep the seam at the
**SQL fragment** level, not at the "run a query and merge in JS" level — otherwise the pre-limited
`UNION ALL` optimisation is impossible.

```typescript
// src/lib/timeline/sources.ts
export interface TimelineSource {
  kind: TimelineEntryKind                       // 'note' | 'activity' | 'stage_change' | (Phase 36) 'audit'
  appliesTo(entityType: EntityType): boolean
  branch(entityId: string, cursor: Cursor | null, limit: number): SQL   // one SELECT, pre-limited
  hydrate(rows: RawRow[]): TimelineEntry[]      // id → full entry, one batched query per kind
}
```

Phase 36 adds one file to the array. Nothing else changes.

**Two-step hydration is recommended:** the union selects only `(kind, id, occurred_at)`; a second
batched query per present kind fetches the display columns with their joins (author name, activity
type, stage names). This keeps the union rows narrow — which is what lets the branch sorts stay in
a 28 kB `top-N heapsort` instead of spilling — and keeps the three very different column sets from
having to be `NULL`-padded into one union-compatible row shape.

### Anti-Patterns to Avoid

- **A `UNION ALL` without per-branch `LIMIT`.** Materialises the record's entire history before the
  outer LIMIT. The whole measured win comes from the pre-limit.
- **`NULL`-padding three column sets into one wide union row.** Forces every branch to carry every
  column, breaks the narrow-sort property, and produces an untypeable result. Use two-step hydration.
- **Putting authorization in `mutations/notes.ts`.** Contradicts the repo's logged decision and
  splits the check across two call sites that will drift.
- **A server component rendering a children-forwarding `asChild` component.** Fails the class-wide
  gate at build time. See Pitfall 3.
- **Emitting a `note.created` crmBus event.** CONTEXT-locked out. Adding a 14th event drags in
  `trigger-config.tsx`, the matcher, both existing subscribers' `ALL_EVENTS` arrays, and the API docs.
- **Awaiting the stage-history insert inside `crmBus.emit`.** The bus is a synchronous
  `EventEmitter`; `emit` cannot await. Fire-and-forget with `.catch()`, exactly like
  `workflow-trigger.ts`.
- **Hand-writing `CREATE INDEX` into the migration SQL.** D-06. Verified below that generate emits
  even partial + `DESC` indexes correctly, so there is no excuse.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Migration idempotency | An `applied_migrations`-style flag table, or a "check if any migrated note exists then skip" script | `CREATE UNIQUE INDEX … WHERE source = 'migration'` + `ON CONFLICT DO NOTHING` | Verified idempotent (re-run inserted 0). The index also prevents a *future* bug from double-migrating, which a one-shot guard cannot. |
| Merging three ordered streams | A JS k-way merge over three query results | One pre-limited `UNION ALL`; let `Merge Append` do it | Postgres already implements the merge; hand-rolled merges must replicate the exact tie-break or paging desynchronises from the count query. |
| Stable paging | Page numbers + `OFFSET` | `(occurred_at, id)` keyset | Offset is provably wrong under concurrent inserts — the exact scenario in a multi-user CRM timeline. |
| Relative timestamps | `formatDistanceToNow` + a mount guard | `src/components/ui/relative-time.tsx` | Already solves the SSR/CSR hydration mismatch and is documented as a deliberate, load-bearing effect (D-02). |
| Author initials | A new initials helper | The `getInitials` shape in `src/app/deals/deal-card.tsx:27` | Three copies already exist; a fourth is fine, a fifth *different* one is not. |
| Delete confirmation | A custom modal | `src/components/ui/alert-dialog.tsx` | Radix gives focus trap, ESC, and focus restoration — all required by the UI-SPEC accessibility contract. |
| Plain-text-with-linebreaks rendering | A markdown/sanitizer dependency | `whitespace-pre-wrap break-words` on a `<p>` | React escapes text children; there is no XSS surface without `dangerouslySetInnerHTML`. Matches the legacy block being replaced (`deals/[id]/page.tsx:245`). |
| Timestamps / ids / soft delete | Bespoke conventions | `text().$defaultFn(crypto.randomUUID)`, `createdAt`/`updatedAt`/`deletedAt` | Every CRM table in this repo. |

**Key insight:** every hand-rolled candidate in this phase is a *correctness* trap, not a
convenience one. A hand-rolled merge or a hand-rolled idempotency guard looks right in review and
fails only under concurrency or a re-run — which is precisely when SC-4 is being checked.

---

## Runtime State Inventory

> This is a schema-addition phase, not a rename, but it *does* mutate live data and register a new
> runtime subscriber, so the same discipline applies.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | `organizations.notes`: **29,037** non-empty. `activities.notes`: **46,198** non-empty. `deals.notes`: **0**. `people.notes`: **0**. Zero whitespace-only rows in all four tables. Zero rows with `owner_id IS NULL`. [VERIFIED: live DB, 2026-08-15] | Data migration (INSERT…SELECT) — 75,235 rows, measured 10.1 s |
| **Stored data (soft-deleted parents)** | 12 soft-deleted deals, 1 each in orgs/people/activities. The migration `WHERE` clause does **not** filter `deleted_at`. | **Decide explicitly.** Recommend migrating them too — SC-4 counts legacy non-empty rows, and excluding soft-deleted parents makes count and byte reconciliation disagree unless both sides filter identically. Migrating is simpler and lossless. |
| **Live service config** | None. No external service holds note state. | None — verified by inspecting `instrumentation.ts` and `src/lib/events/subscribers/` |
| **OS-registered state** | None. Migrations run via `docker-entrypoint.sh` at container start (`npx drizzle-kit migrate` with `set -e`), not via cron or a scheduler. | None — but see Pitfall 5: `set -e` means a failed migration kills the container |
| **Secrets/env vars** | None. No new env var. | None |
| **Build artifacts** | `instrumentation.js` is copied into the standalone output by an explicit `Dockerfile` step (lines 22-41) because Next.js standalone tracing omits it. The new stage-history subscriber is a transitive import of `instrumentation.ts` and is copied via `instrumentation.js.nft.json`. **The copy is guarded with `\|\| true` — it fails open.** | Rebuild the image; then **browser-verify** that a stage drag produces a timeline row (see Pitfall 4) |
| **Applied migration state** | `drizzle.__drizzle_migrations` last row `created_at = 1786722221685` (2026-08-14) = migration 0012. Latest on disk is `0012_typical_radioactive_man.sql`. **In sync.** New migration will be `0013`. | None |

---

## Common Pitfalls

### Pitfall 1 — The four edit dialogs keep writing the "dormant" column (HIGHEST RISK)

**What goes wrong:** CONTEXT locks *"nothing reads or writes [the legacy `notes` column] after this
phase."* The UI-SPEC only removes the four **detail-page render blocks**. But a `notes` textarea
that **writes** the column lives in all four create/edit dialogs, and it is still rendered on the
kanban card:

| File | Line(s) | What it does |
|------|---------|--------------|
| `src/app/deals/deal-dialog.tsx` | 51, 113, 145, 181, 364-374 | zod field, form default, edit prefill, submit payload, `<Textarea>` |
| `src/app/organizations/organization-dialog.tsx` | 27, 67, 79, 175-185 | same |
| `src/app/people/person-dialog.tsx` | 29, 75, 91, 220-230 | same |
| `src/app/activities/activity-dialog.tsx` | 47, 127, 151, 179, 365-375 | same |
| `src/app/deals/deal-card.tsx` | 195-197 | **renders** `deal.notes` on the kanban card |
| `src/app/deals/kanban-board.tsx` | 420 | passes `notes` into the edit dialog |

[VERIFIED: grep across `src/`, 2026-08-15]

If these survive, a user editing an organization still overwrites one text box, that text lands in
a column nothing displays, and the timeline never shows it. NOTE-01 is met on the detail page and
defeated on the dialog — the single most-used write surface.

**Why it happens:** the UI-SPEC's "Legacy removal (mandatory)" table lists four files. It is easy
to read that as the complete edit list. It is not; it is the complete list of **render** sites on
detail pages.

**How to avoid:** treat the locked decision as covering **write** sites too. The edit list is
~8 files, not 4. Recommended disposition:
- Remove the `notes` textarea + zod field from all four dialogs (create and edit modes).
- Remove the `deal.notes` render from `deal-card.tsx`.
- **Keep** `notes` optional in `src/lib/mutations/*.ts` zod schemas and in the `/api/v1` route
  schemas — external API consumers may still send it, and removing it is a breaking API change
  that belongs with the column drop (deferred).
- **Keep** `Notes: x.notes` in every `entityAttributes` prop — see Pitfall 7.

**Warning signs:** a plan whose file list for "make the column dormant" contains exactly four
`page.tsx` files.

**This deviates from the UI-SPEC's explicit file table, so it needs the planner's (or the user's)
sign-off rather than a silent expansion.**

### Pitfall 2 — A 2,000-character validation cap against a real 131,505-character note

**What goes wrong:** every existing mutation schema caps notes at 2,000 characters
(`src/lib/mutations/{deals,activities,organizations,people}.ts`, plus all four dialogs). The live
database contains an activity note of **131,505 characters**; the activities notes column totals
**21,233,898 bytes** across 46,198 rows (mean 460, max 131,505). Organizations: max 197, mean 55,
total 1,600,652 bytes. [VERIFIED: live DB]

The migration is raw SQL, so it copies the 131 kB note in fine. But if the new note API validates
`content` at 2,000 characters, **the user cannot edit that migrated note** — opening the inline
editor and pressing Save returns a validation error on text the user never typed. Worse, a naive
"trim to 2000" would silently destroy 129 kB of migrated content, violating NOTE-03 after the fact.

**Why it happens:** copying the existing `z.string().max(2000)` for consistency, without checking
that the existing cap was never enforced on the import path that created these rows.

**How to avoid:** the note `content` column is `text` (unbounded). Pick a cap **above** the observed
maximum — 200,000 is a reasonable ceiling that still stops abuse — or validate only `min(1)` after
trim plus a generous byte ceiling. Add a test asserting a 131,505-character note round-trips.

**Warning signs:** `z.string().max(2000)` appearing anywhere in the notes code.

### Pitfall 3 — The class-wide `asChild` gate is repo-wide and will fail the build

**What goes wrong:** `src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx` contains a
gate (`describe('CFUI-01 class-wide …')`) that:
1. Walks **every non-test `.tsx` under `src/`**.
2. Finds every file containing the literal string `asChild>{children}` — the "definers".
3. Extracts their `export function <Name>` identifiers.
4. Fails if **any** file that renders `<Name` is not a `'use client'` module.

[VERIFIED: read the test source in full]

`delete-note-dialog.tsx` is exactly a definer if written as
`<AlertDialogTrigger asChild>{children}</AlertDialogTrigger>`. `record-timeline.tsx` is a **server**
component per the UI-SPEC. If the server component renders the dialog directly — or renders any
other definer — the gate fails and CI blocks the merge.

**Why it happens:** the failure it protects against is *silent at runtime* (Radix `SlotClone`
returns `null` for a Flight-deferred child, with no throw and no warning), so it is invisible in
manual testing. The gate is the only thing that catches it.

**How to avoid:**
- Every component that forwards children into `asChild` must be `'use client'`, and every renderer
  of it must be `'use client'`.
- `record-timeline.tsx` (server) may render **only** `timeline-list.tsx` (client) and plain
  Card primitives. Everything interactive hangs off the client subtree.
- Simpler alternative: have `delete-note-dialog.tsx` render its own `Trash2` trigger internally
  instead of accepting `children`. Then it is not a definer at all and the gate never applies.
- Note the string match is **literal**: `asChild>{children}` with no whitespace. Prettier
  reformatting to `asChild>\n  {children}` would make the file invisible to the gate — do not rely
  on formatting for safety.

**Warning signs:** `npm test` failing with `offenders` non-empty and a path under
`src/components/timeline/`.

### Pitfall 4 — The stage-history subscriber can be silently dead in Docker

**What goes wrong:** crmBus subscribers are registered only from `instrumentation.ts`'s `register()`
under `NEXT_RUNTIME === "nodejs"`. **This repo has already shipped that exact bug:** STATE.md
Session Log, 2026-08-08 — *"Next.js standalone build omitting instrumentation.js so register() never
ran in Docker (all four processors dead in production)."* It took a debug session to find, and the
fix is a `Dockerfile` `cp` guarded with `|| true` — it fails open.

Compounding it: the subscriber's insert is fire-and-forget (the bus is a synchronous
`EventEmitter`; `emit` cannot await), so a thrown error vanishes unless explicitly caught.

**Why it happens:** the subscriber has no synchronous consumer. Nothing fails when it does not run;
the timeline just quietly has no stage changes, which looks identical to "this deal never moved."

**How to avoid:**
- `.catch(err => console.error("[stage-history]", err))` on the insert, exactly like
  `workflow-trigger.ts`.
- **Browser-verify in Docker**: drag a deal to a new stage, reload the detail page, confirm a
  stage-change entry appears. A passing unit test proves the handler works, not that it is
  registered. This repo has direct evidence that unit tests do not cover this failure mode.
- Verify **all four** emit sites reach the subscriber — three in `src/lib/mutations/deals.ts`
  (lines 428, 561, 684: update, `updateDealStageMutation`, `reorderDealsMutation`) and one in
  `src/app/api/v1/deals/[id]/route.ts:352`. A subscriber catches all four for free; that is the
  argument for the bus over an inline insert. [VERIFIED: grep]

**Secondary race (low but real):** `emit` returns before the insert resolves. If a stage drag is
immediately followed by a timeline read, the row may not exist yet. In practice the client
round-trip dwarfs a single INSERT. Accept it and note it; do not "fix" it by making the bus async.

**Warning signs:** the timeline shows notes and activities but never a stage change, on a deal you
just dragged.

### Pitfall 5 — Migrations run inside one transaction at container start

**What goes wrong:** `drizzle-orm`'s migrator wraps **all pending migrations in a single
transaction** (`session.transaction(...)` in `node_modules/drizzle-orm/pg-core/dialect.js:60`) and
splits statements on `--> statement-breakpoint`. `docker-entrypoint.sh` runs `npx drizzle-kit
migrate` with `set -e` before `node server.js`. [VERIFIED: read both sources]

Consequences the planner must design around:
- **`CREATE INDEX CONCURRENTLY` is impossible.** Confirms Phase 33 D-03.
- **A failed data migration kills the container.** The idempotency guard is not a nicety.
- **Each hand-written statement needs its own `--> statement-breakpoint`.** The migrator does
  `tx.execute(sql.raw(stmt))` per split chunk; multiple statements in one chunk is not the shape
  the 0009 precedent used, and should not be relied on.
- The whole migration is atomic, so a partial migration cannot be observed — good.

**Measured lock profile [VERIFIED: live DB]:** the `INSERT … SELECT` takes only `ACCESS SHARE` on
`organizations`/`activities` (a read — does not block writers) and writes exclusively to the newly
created `notes` table, which no other session can even see until commit. **Zero user-visible write
blocking**, in contrast to Phase 33's 1.08 s `ShareLock`. Startup cost is ~10 s.

**How to avoid:** keep the data migration in the same generated file as the DDL, one
`--> statement-breakpoint` per statement, and rely on the partial unique index for idempotency.

### Pitfall 6 — Post-migration imports keep writing to the dead column

**What goes wrong:** the migration runs once. `src/lib/import/validators.ts`,
`pipedrive-mapping.ts`, `pipedrive-api-transformers.ts`, `src/app/import/actions.ts`, and the
`/api/v1/**` create/update routes all still write `notes`. Every record imported *after* the
migration gets note text that is invisible in the timeline forever. Given this dataset came from a
Pipedrive import and imports are an active feature, this is not hypothetical.

**Why it happens:** "the column is dormant" is a decision about the UI, and imports are not UI.

**How to avoid:** decide explicitly and record the decision. Three viable positions:
1. **Out of scope, documented** — the migration is one-shot; a re-run of the reconciliation query
   after the next import will show a non-zero delta, which is the detection mechanism. Cheapest.
2. **Make the reconciliation query the alarm** — check it in with a comment saying a non-zero delta
   after this phase means an import wrote to the legacy column.
3. **In scope** — route the import's `notes` into `notes` rows. Largest scope increase; CONTEXT's
   in-scope list does not mention imports.

Recommend (2): zero scope increase, and it turns the SC-4 artifact into a permanent regression
detector rather than a one-time proof.

### Pitfall 7 — Removing `Notes` from `entityAttributes` breaks live formula fields

**What goes wrong:** `Notes` is a **first-class formula attribute** for all four entity types:

```typescript
// src/lib/formula-recalc.ts:103-130  (VERIFIED)
deal:         { Value, Title, Notes: "notes", ExpectedCloseDate }
organization: { Name, Website, Industry, Notes: "notes" }
person:       { FirstName, LastName, Email, Phone, Notes: "notes" }
activity:     { Title, Notes: "notes", DueDate, CompletedAt }
```

and every detail page passes it into `CustomFieldsSection`:
`deals/[id]/page.tsx:260`, `organizations/[id]/page.tsx:198`, `people/[id]/page.tsx:206`,
`activities/[id]/page.tsx:259`. [VERIFIED: read all four files]

`buildClientFieldValues` seeds the formula evaluation map from these attributes; the comment at
`custom-fields-section.tsx:50-54` records that an absent key makes the engine answer
`Unknown field: X` and render `#ERROR` — a bug this repo already shipped and fixed (CFUI-03).

**So the UI-SPEC is correct and must be obeyed: the `notes` value stays in `entityAttributes`.
Only the rendered block is deleted.**

**Accepted consequence to record in the plan:** because the column goes dormant while `{{Notes}}`
still reads it, any formula referencing `{{Notes}}` **freezes at its migration-time value**. That is
not a bug to fix here — the column drop is deferred, and re-pointing `{{Notes}}` at the notes feed
is a semantic change (which note?) that nobody has decided. Say so out loud so the next phase
inherits it as a known state, not a surprise.

### Pitfall 8 — `tooltip.tsx` is not vendored, but the UI-SPEC asks for a tooltip

**What goes wrong:** the UI-SPEC declares key `notes.migratedTooltip` ("Imported from this record's
old notes field") while also declaring Registry Safety = "zero registry components added this
phase." `src/components/ui/` has **no `tooltip.tsx`** [VERIFIED: `ls src/components/ui/`], and the
UI-SPEC's own Component Inventory does not list one. Running `shadcn add tooltip` would contradict
the spec's Registry Safety section, which explicitly says that section must be revisited first.

**How to avoid:** render the hint as a native `title` attribute on the `Migrated` `Badge`. Zero
dependencies, no registry fetch, keyboard-and-screen-reader accessible, and the copy key is used
as written.

### Pitfall 9 — `activities_deal_id_idx` has no `created_at`, so that branch sorts

**What goes wrong:** the activities branch is the slowest of the three. Its index is `deal_id` only
(Phase 33), so the branch does a bitmap heap scan of all matching activities and a `top-N heapsort`.
On the worst deal in the live data (117 activities) that was **17.15 ms cold / ~0.4 ms warm** — the
dominant cost of the cold page-1 query.

**Measured fix:** adding `activities (deal_id, created_at DESC NULLS LAST) WHERE deleted_at IS NULL`
brought that branch to **0.267 ms** and turned the header count into an `Index Only Scan` with
**0 heap fetches**. [VERIFIED: live DB, index created and dropped]

**How to avoid / decide:** this is a genuine optimisation but it is also an index on a hot,
79,023-row table that Phase 33 deliberately reasoned about. Phase 33's D-02 ("no partial, no
composite") was scoped to *that* phase's 11 indexes, not a standing ban — but adding one here needs
the same BEFORE/AFTER evidence discipline. Given max-activities-per-deal is 117 and warm timings
are sub-millisecond either way, **this is optional**. If it is added, declare it in
`src/db/schema/activities.ts` (D-06) and record the measurement.

### Pitfall 10 — "Load more" has no precedent in this codebase

**What goes wrong:** CONTEXT says 20-per-page + Load more "matches existing paginated list
conventions in the app." It does not. Every existing paginated surface uses **numbered pages**
(`src/app/workflows/[id]/runs/components/runs-table.tsx` computes `totalPages`; the organizations,
people, and activities lists use `page`/`limit` search params). A grep for `loadMore` /
`Load more` / `hasMore` across `src/app` and `src/components` returns **nothing**. [VERIFIED]

**Why it matters:** the planner cannot copy an existing component. The Load-more state machine
(idle / in-flight / failed / exhausted, all four specified in the UI-SPEC) must be written from
scratch, and the "fetch failed → toast, button returns to idle, never a silent no-op" requirement
is easy to miss.

**How to avoid:** budget a task for it. Do not plan it as "reuse the existing pagination."

---

## Code Examples

### 1. `src/db/schema/notes.ts` — verified to generate correct DDL

```typescript
// The probe version of this file was run through `drizzle-kit generate` on 2026-08-15
// and the emitted SQL was applied to PostgreSQL 16.13 successfully. Both artifacts
// were removed afterwards; the repo is unchanged.
import { pgTable, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import type { InferSelectModel } from "drizzle-orm"
import { users } from "./users"
import type { EntityType } from "./custom-fields"   // 'organization'|'person'|'deal'|'activity'

export type NoteSource = 'user' | 'migration'

export const notes = pgTable('notes', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  // Polymorphic key. No FK is possible on entityId — it points at one of four tables.
  // Mirrors customFieldDefinitions.entityType, per CONTEXT.
  entityType: text('entity_type').notNull().$type<EntityType>(),
  entityId: text('entity_id').notNull(),
  content: text('content').notNull(),
  // Nullable so a migrated row with no owner renders "Unknown" (CONTEXT).
  // In the live data every source row has a non-null owner_id, so this branch has
  // no natural production data — it needs a seeded fixture to be tested.
  authorId: text('author_id').references(() => users.id),
  source: text('source').notNull().default('user').$type<NoteSource>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  // The timeline read. Partial on deleted_at IS NULL because every timeline query
  // filters it, and it keeps soft-deleted rows out of the index entirely.
  liveEntityIdx: index('notes_live_idx')
    .on(table.entityType, table.entityId, table.createdAt.desc())
    .where(sql`${table.deletedAt} is null`),
  // NOTE-03 idempotency, enforced by the database forever — not just during the migration.
  migrationUniq: uniqueIndex('notes_migration_uniq')
    .on(table.entityType, table.entityId)
    .where(sql`${table.source} = 'migration'`),
  authorIdIdx: index('notes_author_id_idx').on(table.authorId),
}))

export type Note = InferSelectModel<typeof notes>
```

**Emitted by `drizzle-kit generate` 0.31.9** [VERIFIED — this exact output was produced and then
applied to the live Postgres inside a rolled-back transaction]:

```sql
CREATE INDEX "notes_live_idx" ON "notes" USING btree ("entity_type","entity_id","created_at" DESC NULLS LAST) WHERE "notes"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "notes_migration_uniq" ON "notes" USING btree ("entity_type","entity_id") WHERE "notes"."source" = 'migration';
```

and `\d notes` after applying:
```
"notes_live_idx"      btree (entity_type, entity_id, created_at DESC NULLS LAST) WHERE deleted_at IS NULL
"notes_migration_uniq" UNIQUE, btree (entity_type, entity_id) WHERE source = 'migration'::text
```

**Re-running `drizzle-kit generate` with no schema change reported "No schema changes, nothing to
migrate"** — i.e. the 0009→0010 silent-index-drop failure does **not** recur for schema-declared
partial indexes. This is the empirical confirmation that D-06 works for exactly this case.

### 2. `src/db/schema/deal-stage-history.ts`

```typescript
import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core"
import { users } from "./users"
import { deals } from "./deals"
import { stages } from "./pipelines"

// Deal-specific by design (resolving CONTEXT's discretion item). A generic table would
// either become Phase 36's audit log — explicitly forbidden here — or a half-generic
// shape Phase 36 must migrate anyway. Pluggability lives in the assembler's source
// interface, not the table. The payoff is real FKs, which `notes` cannot have.
export const dealStageHistory = pgTable('deal_stage_history', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  dealId: text('deal_id').notNull().references(() => deals.id),
  fromStageId: text('from_stage_id').references(() => stages.id),  // null on create
  toStageId: text('to_stage_id').notNull().references(() => stages.id),
  changedBy: text('changed_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  dealIdx: index('deal_stage_history_deal_idx').on(table.dealId, table.createdAt.desc()),
}))
```

No `updatedAt` / `deletedAt`: history rows are immutable append-only facts. This is a deliberate
deviation from the repo's table convention and should be stated as such in the plan.

`_relations.ts` additions: `notesRelations` gets **only** an `author` relation (no `entity` relation
is expressible for a polymorphic key — do not try). `dealStageHistoryRelations` gets `deal`,
`fromStage`, `toStage`, `changedByUser`.

### 3. The legacy-notes data migration — measured on live data

Appended by hand to the generated `0013_*.sql`, after the DDL, one
`--> statement-breakpoint` per statement (Phase 25 / 0009 precedent).

```sql
--> statement-breakpoint
-- NOTE-03. Idempotent via notes_migration_uniq (partial UNIQUE on
-- (entity_type, entity_id) WHERE source = 'migration'). Verified: a second run
-- inserts 0 rows.
--
-- Measured on the live database 2026-08-15 (PostgreSQL 16.13), indexes already present:
--   organizations : 29,037 rows, 3,279 ms
--   activities    : 46,198 rows, 6,849 ms
--   re-run (no-op):      0 rows, 1,451 ms
--   resulting notes table: 46 MB
-- deals and people have ZERO non-empty notes in this dataset; their statements are
-- included anyway so the migration is correct on any other deployment.
--
-- Lock profile: ACCESS SHARE on the source tables (a read — does not block writers);
-- all writes go to the brand-new `notes` table. No user-visible write blocking.
--
-- created_at = the record's created_at, so the migrated note sorts first (SC-3).
-- author_id  = the record's owner_id (NOT NULL on all four tables in this schema,
--              so "Unknown" never occurs here — it exists for other deployments).
-- btrim(...) <> '' skips whitespace-only notes: zero such rows exist today, but a
--              blank first timeline entry would be worse than none.
INSERT INTO "notes" ("id","entity_type","entity_id","content","author_id","source","created_at","updated_at")
SELECT gen_random_uuid()::text, 'deal', d."id", d."notes", d."owner_id", 'migration', d."created_at", d."created_at"
  FROM "deals" d
 WHERE d."notes" IS NOT NULL AND btrim(d."notes") <> ''
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "notes" ("id","entity_type","entity_id","content","author_id","source","created_at","updated_at")
SELECT gen_random_uuid()::text, 'organization', o."id", o."notes", o."owner_id", 'migration', o."created_at", o."created_at"
  FROM "organizations" o
 WHERE o."notes" IS NOT NULL AND btrim(o."notes") <> ''
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "notes" ("id","entity_type","entity_id","content","author_id","source","created_at","updated_at")
SELECT gen_random_uuid()::text, 'person', p."id", p."notes", p."owner_id", 'migration', p."created_at", p."created_at"
  FROM "people" p
 WHERE p."notes" IS NOT NULL AND btrim(p."notes") <> ''
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "notes" ("id","entity_type","entity_id","content","author_id","source","created_at","updated_at")
SELECT gen_random_uuid()::text, 'activity', a."id", a."notes", a."owner_id", 'migration', a."created_at", a."created_at"
  FROM "activities" a
 WHERE a."notes" IS NOT NULL AND btrim(a."notes") <> ''
ON CONFLICT DO NOTHING;
```

`gen_random_uuid()` is built into PostgreSQL 13+; no `pgcrypto` extension is required on 16.13
[VERIFIED: executed successfully on the live DB].

`ON CONFLICT DO NOTHING` without a conflict target is deliberate — it catches the partial unique
index without naming it, so a future index rename cannot silently turn the statement into a
duplicate-inserter.

### 4. `scripts/reconcile-notes.sql` — the SC-4 proof, checked in and re-runnable

Both queries were executed against the live database with the migration applied in a transaction.
Both returned **all zeros**.

```sql
-- SC-4 part 1: count reconciliation. Every row must show delta = 0.
-- Measured 484 ms on the live database.
SELECT
  e.entity_type,
  e.legacy_nonempty,
  (SELECT count(*) FROM notes n
    WHERE n.entity_type = e.entity_type AND n.source = 'migration') AS migrated,
  e.legacy_nonempty
    - (SELECT count(*) FROM notes n
        WHERE n.entity_type = e.entity_type AND n.source = 'migration') AS delta
FROM (
  SELECT 'deal'         AS entity_type, count(*) AS legacy_nonempty FROM deals         WHERE notes IS NOT NULL AND btrim(notes) <> ''
  UNION ALL SELECT 'organization', count(*) FROM organizations WHERE notes IS NOT NULL AND btrim(notes) <> ''
  UNION ALL SELECT 'person',       count(*) FROM people        WHERE notes IS NOT NULL AND btrim(notes) <> ''
  UNION ALL SELECT 'activity',     count(*) FROM activities    WHERE notes IS NOT NULL AND btrim(notes) <> ''
) e;

-- SC-4 part 2: BYTE-LEVEL reconciliation. A count match does not prove no truncation
-- or encoding damage — this does. Every row must show mismatched = 0.
-- Measured 241 ms on the live database.
SELECT 'organization' AS entity_type,
       count(*) FILTER (WHERE n.content IS DISTINCT FROM o.notes) AS mismatched
  FROM organizations o
  JOIN notes n ON n.entity_type = 'organization' AND n.entity_id = o.id AND n.source = 'migration'
UNION ALL
SELECT 'activity',
       count(*) FILTER (WHERE n.content IS DISTINCT FROM a.notes)
  FROM activities a
  JOIN notes n ON n.entity_type = 'activity' AND n.entity_id = a.id AND n.source = 'migration'
UNION ALL
SELECT 'deal',
       count(*) FILTER (WHERE n.content IS DISTINCT FROM d.notes)
  FROM deals d
  JOIN notes n ON n.entity_type = 'deal' AND n.entity_id = d.id AND n.source = 'migration'
UNION ALL
SELECT 'person',
       count(*) FILTER (WHERE n.content IS DISTINCT FROM p.notes)
  FROM people p
  JOIN notes n ON n.entity_type = 'person' AND n.entity_id = p.id AND n.source = 'migration';
```

**Measured result on the live dataset:**

| entity_type | legacy_nonempty | migrated | delta | byte mismatches |
|-------------|-----------------|----------|-------|-----------------|
| deal | 0 | 0 | 0 | 0 |
| organization | 29,037 | 29,037 | 0 | 0 |
| person | 0 | 0 | 0 | 0 |
| activity | 46,198 | 46,198 | 0 | 0 |

**Where it lives:** `scripts/reconcile-notes.sql`, run with
`docker compose exec -T postgres psql -U pipelite -d pipelite -f - < scripts/reconcile-notes.sql`.
A checked-in `.sql` file (rather than a vitest test) is the right home because the vitest suite
mocks `@/db` entirely — there is no live-DB integration test harness in this repo. Record the
BEFORE (pre-migration counts) and AFTER (post-migration deltas) in the phase summary, per the
Phase 33 evidence discipline.

**Bonus:** re-running this after future imports detects Pitfall 6 — a non-zero delta means
something wrote to the legacy column after the migration.

### 5. The stage-history subscriber

```typescript
// src/lib/events/subscribers/stage-history.ts
// Shape copied verbatim from src/lib/events/subscribers/webhook.ts, including the
// `registered` guard and `_resetForTesting` (added for test isolation — logged decision).
import { crmBus } from "@/lib/events"
import type { DealStageChangedPayload } from "@/lib/events/types"
import { db } from "@/db"
import { dealStageHistory } from "@/db/schema"

let registered = false

export function registerStageHistorySubscriber(): void {
  if (registered) return

  crmBus.on("deal.stage_changed", (payload: DealStageChangedPayload) => {
    // Fire-and-forget: crmBus is a synchronous EventEmitter, emit() cannot await.
    // The .catch is mandatory — without it a rejection is an unhandled promise and
    // the row is lost with no trace. Same pattern as workflow-trigger.ts.
    db.insert(dealStageHistory)
      .values({
        dealId: payload.entityId,
        fromStageId: payload.oldStageId,
        toStageId: payload.newStageId,
        changedBy: payload.userId,
      })
      .catch((err) => console.error("[stage-history]", err))
  })

  registered = true
}

export function _resetForTesting(): void {
  if (registered) crmBus.removeAllListeners("deal.stage_changed")
  registered = false
}
```

**Warning:** `_resetForTesting` here calls `removeAllListeners("deal.stage_changed")`, which also
removes the webhook and workflow-trigger listeners for that event. That is already true of the two
existing `_resetForTesting` helpers, so it is consistent — but a test that resets this one and then
asserts on webhook delivery will get a confusing result. Note it in the test file.

Register in `instrumentation.ts` next to the other two subscribers, inside the
`NEXT_RUNTIME === "nodejs"` guard.

### 6. RSC/client boundary — the safe shape

```tsx
// src/components/timeline/record-timeline.tsx   (SERVER — no 'use client')
// Renders only Card primitives and ONE client component. It must never render a
// component whose source contains `asChild>{children}` — see Pitfall 3.
export async function RecordTimeline({ entityType, entityId }: Props) {
  const t = await getTranslations('notes')
  const session = await auth()
  const { entries, hasMore, cursor, total } = await assembleTimeline({
    entityType, entityId, limit: 20,
  })

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base font-semibold leading-tight">
          {t('timeline')} <span className="text-sm text-muted-foreground">({total})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Serializable props only: plain objects, strings, dates. No React elements. */}
        <TimelineList
          entityType={entityType}
          entityId={entityId}
          initialEntries={entries}
          initialCursor={cursor}
          hasMore={hasMore}
          currentUserId={session!.user!.id}
          isAdmin={session!.user!.role === 'admin'}
        />
      </CardContent>
    </Card>
  )
}
```

Everything below `TimelineList` is `'use client'`. The `AlertDialog` in `delete-note-dialog.tsx`
therefore never has a server component as an ancestor renderer, and the class-wide gate passes.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| One `notes` text column per entity | Append-only polymorphic notes table + timeline | This phase | The column survives but goes dormant; SC-4 stays checkable |
| `LIMIT/OFFSET` deep paging | Keyset / seek pagination on a unique sort tuple | Long-standing Postgres consensus | Correct under concurrent inserts; O(1) rather than O(offset) [CITED: use-the-index-luke.com/no-offset] |
| Hand-written index SQL in migrations | Schema-declared, `drizzle-kit generate`-emitted | Phase 33, D-06 | Verified here to hold even for partial + `DESC` indexes |
| React elements passed across the RSC boundary into `asChild` | Client wrapper components that construct their own triggers | Phase 44, CFUI-01 | Enforced by a repo-wide gate in CI |

**Deprecated/outdated in this repo:**
- `npm run db:push` (`drizzle-kit push`) exists in `package.json` but this repo uses
  generate+migrate exclusively. Do not use `push` for this phase — it would bypass the data
  migration entirely.
- The numbered-page pagination in `runs-table.tsx` is the app's convention but is **not** the
  pattern this phase uses (Load more). Do not copy it.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker Compose stack | All dev + verification | ✓ | app/postgres/mailhog all up | — |
| PostgreSQL | Schema, migration, timeline queries | ✓ | **16.13** (x86_64-pc-linux-musl) | — |
| `gen_random_uuid()` | Data migration | ✓ | built-in on PG 13+; verified executing | `md5(random()::text)` (worse) |
| Partial index support | Idempotency guard, live index | ✓ | verified applied and used by the planner | `NOT EXISTS` guard |
| `drizzle-kit generate` | DDL emission (D-06) | ✓ | 0.31.9 — probe run succeeded | — |
| `drizzle-kit migrate` | Applied at container start via `docker-entrypoint.sh` | ✓ | last applied 0012, 2026-08-14 | — |
| vitest (base + rsc projects) | `npm test` | ✓ | 4.0.18, two config files | — |
| `npm run typecheck` | CI gate | ✓ | tsc 5.x | — |
| GitHub Actions CI | Merge gate on master | ✓ | typecheck → lint → test, ~95 s | — |
| shadcn registry | **Not needed** | n/a | `"registries": {}` | Use native `title` instead of Tooltip (Pitfall 8) |

**Missing dependencies with no fallback:** none.

**Missing dependencies with fallback:**
- `src/components/ui/tooltip.tsx` — absent. Fallback: native `title` attribute on the `Migrated`
  badge. See Pitfall 8.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.0.18, **two projects** |
| Config file (base) | `vitest.config.ts` — `environment: 'node'`, includes `src/**/*.{test,spec}.*`, **excludes** `*.rsc.test.*` |
| Config file (rsc) | `vitest.rsc.config.ts` — `resolve.conditions: ['react-server']`, includes only `src/**/*.rsc.test.*` |
| Quick run command | `npx vitest run <path>` |
| Full suite command | `npm test` (= `vitest run && vitest run --config vitest.rsc.config.ts`) |
| Type gate | `npm run typecheck` |
| Lint gate | `npm run lint` |
| CI | `.github/workflows/ci.yml` — typecheck, lint, test; required check on master |

**Critical constraint:** the entire suite **mocks `@/db`** (`vi.mock("@/db", …)` in every mutation
test). There is no live-database integration harness. Therefore the migration, the reconciliation,
and the real SQL plan **cannot** be covered by vitest — they are verified by the checked-in
`scripts/reconcile-notes.sql` plus recorded psql evidence, exactly as Phase 33 did for its indexes.

**Second constraint:** anything reachable from a `*.rsc.test.tsx` file may **not** import
`react-dom/server` — it cannot load under the `react-server` condition. Tests needing
`renderToStaticMarkup` must be named `*.test.tsx` (not `*.rsc.test.tsx`), like
`rsc-boundary.test.tsx`.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NOTE-01 | `createNoteMutation` inserts with `source:'user'`, correct `authorId`, trimmed content | unit | `npx vitest run src/lib/mutations/notes.test.ts` | ❌ Wave 0 |
| NOTE-01 | Content validation accepts a **131,505-character** note (Pitfall 2) and rejects empty/whitespace-only | unit | `npx vitest run src/lib/mutations/notes.test.ts -t "long note"` | ❌ Wave 0 |
| NOTE-01 | `updateNoteMutation` stamps `updatedAt`, preserves `createdAt` (drives the "edited" marker) | unit | `npx vitest run src/lib/mutations/notes.test.ts -t "edited"` | ❌ Wave 0 |
| NOTE-01 | Soft delete sets `deletedAt`, never issues `DELETE` | unit | `npx vitest run src/lib/mutations/notes.test.ts -t "soft delete"` | ❌ Wave 0 |
| NOTE-01 | Non-author non-admin is rejected; author allowed; admin allowed | unit | `npx vitest run src/lib/notes/authorize.test.ts` | ❌ Wave 0 |
| NOTE-01 | Server actions return `{ success: true, id } / { success: false, error }` | unit | `npx vitest run src/app/notes/actions.test.ts` | ❌ Wave 0 |
| NOTE-02 | Assembler emits a pre-limited `UNION ALL` with 3 branches for `deal`, 1 branch for other entity types | unit (SQL string assertion) | `npx vitest run src/lib/timeline/assemble.test.ts` | ❌ Wave 0 |
| NOTE-02 | Every branch carries `ORDER BY … DESC, id DESC LIMIT n+1` — the pre-limit is the whole optimisation | unit | `npx vitest run src/lib/timeline/assemble.test.ts -t "pre-limit"` | ❌ Wave 0 |
| NOTE-02 | Keyset cursor produces `(created_at, id) < (…, …)` on every branch; a null cursor omits it | unit | `npx vitest run src/lib/timeline/assemble.test.ts -t "cursor"` | ❌ Wave 0 |
| NOTE-02 | Cursor encode/decode round-trips; a malformed cursor is rejected before reaching SQL | unit | `npx vitest run src/lib/timeline/cursor.test.ts` | ❌ Wave 0 |
| NOTE-02 | `hasMore` derives from the `n+1`th row and that row is discarded | unit | `npx vitest run src/lib/timeline/assemble.test.ts -t "hasMore"` | ❌ Wave 0 |
| NOTE-02 | Stage-history subscriber inserts on `deal.stage_changed`; is idempotent on double-register; `.catch` swallows nothing silently | unit | `npx vitest run src/lib/events/subscribers/stage-history.test.ts` | ❌ Wave 0 |
| NOTE-02 | Timeline SQL plan is `Merge Append` over index scans, <5 ms warm | **manual (psql)** | `docker compose exec -T postgres psql -U pipelite -d pipelite -c "EXPLAIN (ANALYZE, BUFFERS) …"` | manual — db is mocked in vitest |
| NOTE-02 | Stage drag → timeline entry, end to end | **manual (browser)** | Docker at `http://localhost:3001`; **mandatory**, see Pitfall 4 | manual |
| NOTE-03 | Migration inserts the correct count per entity type | **manual (psql)** | `scripts/reconcile-notes.sql` part 1, delta = 0 | ❌ Wave 0 (the script) |
| NOTE-03 | Migrated content is byte-identical to the legacy value | **manual (psql)** | `scripts/reconcile-notes.sql` part 2, mismatched = 0 | ❌ Wave 0 (the script) |
| NOTE-03 | Re-running the migration inserts 0 rows | **manual (psql)** | Re-run the `INSERT … SELECT` block, expect `INSERT 0 0` | manual |
| NOTE-03 | A migrated note is the oldest entry on its record's timeline (SC-3) | **manual (browser)** | Open any organization with legacy notes | manual |
| CFUI-01 | No server component renders a children-forwarding `asChild` component | unit (existing repo-wide gate) | `npx vitest run "src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx"` | ✅ exists — must stay green |
| i18n | All 30 new `notes.*` keys exist in all three locale files | unit | `npx vitest run src/messages/locale-parity.test.ts` | ❌ Wave 0 (no parity test exists today) |

### Sampling Rate

- **Per task commit:** `npx vitest run <the touched test file>` + `npm run typecheck`
- **Per wave merge:** `npm test` (both projects) + `npm run lint`
- **After the migration task specifically:** run `scripts/reconcile-notes.sql` and paste the
  BEFORE/AFTER numbers into the plan file — vitest cannot cover it
- **Phase gate:** full suite green + browser verification in Docker of (a) add/edit/delete a note,
  (b) Load more, (c) a stage drag producing a timeline entry, (d) a migrated note showing the
  `Migrated` badge and sorting first — before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/lib/mutations/notes.test.ts` — NOTE-01 (mirror `src/lib/mutations/organizations.test.ts`'s `vi.mock("@/db")` shape)
- [ ] `src/lib/notes/authorize.test.ts` — NOTE-01 authorization
- [ ] `src/lib/timeline/assemble.test.ts` — NOTE-02 SQL shape, pre-limit, cursor, hasMore
- [ ] `src/lib/timeline/cursor.test.ts` — NOTE-02 cursor encode/decode + rejection
- [ ] `src/lib/events/subscribers/stage-history.test.ts` — NOTE-02 (mirror `webhook.test.ts`)
- [ ] `src/app/notes/actions.test.ts` — server action contract
- [ ] `scripts/reconcile-notes.sql` — NOTE-03 / SC-4, checked in and re-runnable
- [ ] `src/messages/locale-parity.test.ts` — no such gate exists today; three JSON files drifting is a live risk with 30 new keys
- [ ] Framework install: **none needed** — vitest 4.0.18 and both configs already exist

---

## Security Domain

`security_enforcement` is absent from `.planning/config.json`, so it is treated as **enabled**.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (reused) | Two existing surfaces, unchanged: Auth.js JWT session via `auth()` for the UI; `withApiAuth` (API key + rate limit) for `/api/v1`. **Do not invent a third.** |
| V3 Session Management | no | No new session state |
| V4 Access Control | **yes — the core control** | Any authenticated user may CREATE (CONTEXT-locked). EDIT/DELETE restricted to `note.authorId === session.user.id \|\| session.user.role === 'admin'`. Enforced **server-side in the action and the route**, per the repo's logged decision that mutations only check existence. The UI hiding the buttons is cosmetic. `users.role` is a real pg enum `('admin','member')`. |
| V5 Input Validation | yes | zod on `content` (non-empty after trim, generous max — see Pitfall 2), on `entityType` (must be one of the four `EntityType` literals — it is interpolated into a query predicate), and on the paging cursor (must decode to a valid timestamp + id). |
| V6 Cryptography | no | No crypto beyond `crypto.randomUUID()` for ids |
| V7 Error Handling | yes | Errors return `{ success: false, error }` with a generic message; details go to `console.error`. Never surface a raw Postgres error to the client. |
| V13 API | yes | New `/api/v1` routes inherit `withApiAuth` rate limiting automatically by using the wrapper. A route that forgets the wrapper is unauthenticated **and** unrated. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via the hand-built timeline SQL | Tampering | The assembler builds SQL with `sql` **template fragments** (parameterised), never string concatenation of user input. `entityType` is zod-validated against the four literals; `entityId` and the cursor are bound parameters. This is the single highest-risk spot in the phase because it is the one place raw SQL is composed. |
| SQL injection via the paging cursor | Tampering | Decode → zod → bind. Never interpolate the decoded values textually. |
| IDOR — editing another user's note by guessing a note id | Elevation of Privilege | Server-side author-or-admin check on PATCH/DELETE, in **both** the server action and the v1 route. Ids are v4 UUIDs (unguessable), but that is defence in depth, not the control. |
| Cross-record note injection — POSTing a note with a mismatched `entityType`/`entityId` | Tampering | Verify the parent record exists and is not soft-deleted before insert. `entityId` carries no FK — the database will **not** catch a dangling reference. This is the direct cost of the polymorphic design and must be an explicit check. |
| Stored XSS via note content | Tampering | React escapes text children; render with `whitespace-pre-wrap break-words` on a `<p>`. **Never** `dangerouslySetInnerHTML`. No markdown renderer (CONTEXT-locked), so there is no sanitizer to get wrong. |
| Information disclosure via a soft-deleted note | Information Disclosure | Every read path filters `deletedAt IS NULL`. The partial index encodes this — but the index does not *enforce* it; the predicate must still be in the query. |
| Unbounded content DoS | Denial of Service | A max-length cap on `content`. Note the existing 131,505-char row means the cap must be large; pair it with the existing API rate limiter. |
| Rate-limit bypass by omitting `withApiAuth` | Elevation of Privilege | Every `/api/v1` handler wraps in `withApiAuth`. Grep-verifiable. |
| Authorization drift between the action and the route | Elevation of Privilege | One shared `isAuthorOrAdmin` helper, unit-tested once, called from both. |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The 4 create/edit dialogs are in scope for "the legacy column goes dormant" | Pitfall 1 | **HIGH.** If the user intended only the detail pages, this phase grows by ~5 files. If they intended dormancy and the planner ships only the detail pages, NOTE-01 is defeated on the most-used write surface. **Needs an explicit decision before planning.** |
| A2 | Soft-deleted parent records should have their legacy notes migrated too | Runtime State Inventory | LOW-MEDIUM. Affects 15 rows total. But if excluded, the SC-4 count query must apply the same filter on both sides or it reports a false delta. |
| A3 | Activities sort into the timeline by `created_at`, not `dueDate` or `completedAt` | Pattern 1 | MEDIUM. A history feed ordered by a *future* due date reads wrong; `created_at` is the honest "when it happened". But nothing locks this, and the UI-SPEC's copy ("Due {date}", "Completed") is agnostic. Confirm during planning. |
| A4 | The UI uses **server actions**, not `/api/v1`, for its client-side mutations and Load more | Pattern 2 | LOW as a fact (v1 is API-key-only — verified), MEDIUM as a plan input: the UI-SPEC says "client fetches" without naming a target, so the planner must not wire the browser at `/api/v1/...`. |
| A5 | `note.created` genuinely must not be emitted, so `revalidatePath` is the only cache invalidation | Anti-Patterns | LOW. CONTEXT-locked. Consequence: workflows cannot react to notes in this phase — by design. |
| A6 | Keyset paging is acceptable even though CONTEXT says paging should "match existing list conventions" (which are numbered pages) | Pitfall 10 | LOW. "Load more, 20 per page" is itself locked, and Load-more + numbered pages are incompatible. Keyset is the correct implementation of the locked UX. |
| A7 | The `Migrated` badge tooltip is a native `title`, not a Radix Tooltip | Pitfall 8 | LOW. Avoids contradicting the UI-SPEC's Registry Safety section. If the user wants a real tooltip, that section must be revisited first. |
| A8 | The optional `activities (deal_id, created_at DESC)` index is not required | Pitfall 9 | LOW. Warm timings are sub-millisecond without it; the gain is on cold cache only. |

---

## Open Questions (RESOLVED)

> All six questions below were answered by the **Post-Research Addendum** in `35-CONTEXT.md`
> (decided 2026-08-15, after this document) and each answer is carried into a specific plan.
> The original question text is preserved for provenance; the resolution is appended to each.

1. **Do the four create/edit dialogs lose their Notes textarea in this phase?**
   - What we know: CONTEXT locks "nothing reads or writes [the column] after this phase." All four
     dialogs read it (edit prefill) and write it (submit). The UI-SPEC's mandatory-removal table
     lists only the four detail-page render blocks.
   - What's unclear: whether the UI-SPEC's four-file table was meant as exhaustive or as
     detail-page-scoped.
   - Recommendation: **remove the field from all four dialogs and from `deal-card.tsx`**, keeping
     `notes` optional in the mutation and v1 schemas. Surface this to the user before planning —
     it is the difference between NOTE-01 being met and being cosmetically met.
   - **RESOLVED** by 35-CONTEXT.md § Post-Research Addendum: the four create dialogs KEEP a Notes textarea but it now writes a first note row, and the edit paths drop the field entirely; `deal-card.tsx` stops rendering the legacy column. Implemented by plan **35-15** (nine write/render sites, not four).

2. **What is the activity entry's chronological position — `created_at` or `dueDate`?**
   - What we know: activities carry `createdAt`, `dueDate` (not null), and `completedAt`.
   - What's unclear: nothing locks the sort key. A future-dated task would sort to the top of a
     "history" feed under `dueDate`.
   - Recommendation: `created_at`, with the due/completed date rendered as entry content per the
     UI-SPEC copy. State it in the plan so it is not re-litigated at execution.
   - **RESOLVED** by 35-CONTEXT.md § Post-Research Addendum: activity timeline entries sort on `created_at`. Implemented and test-asserted by plan **35-08** (the activities branch ORDER BY).

3. **Are soft-deleted records' legacy notes migrated?**
   - What we know: 12 soft-deleted deals, 1 each elsewhere; the migration `WHERE` clause as written
     does not filter them.
   - Recommendation: migrate them (simpler, lossless, keeps both halves of SC-4 consistent). Just
     be explicit — do not leave it implicit in a `WHERE` clause.
   - **RESOLVED** by 35-CONTEXT.md § Post-Research Addendum: notes on soft-deleted records ARE migrated (15 rows), with no soft-delete carve-out on either side of the SC-4 reconciliation. Implemented by plan **35-03** (the data migration `WHERE` clauses and `scripts/reconcile-notes.sql` carry no `deleted_at` filter, grep-gated).

4. **Is the optional `activities (deal_id, created_at DESC)` index worth adding?**
   - What we know: measured 17.15 ms → 0.267 ms on the cold worst case; ~0.4 ms → 0.267 ms warm.
     Max 117 activities per deal.
   - Recommendation: **skip it.** If added, declare it in the schema (D-06) and capture BEFORE/AFTER
     evidence like Phase 33 did.
   - **RESOLVED** by 35-CONTEXT.md § Post-Research Addendum: the optional `activities (deal_id, created_at DESC)` index is SKIPPED. Recorded as an explicit decision in plan **35-08**'s SUMMARY rather than silently omitted.

5. **Does anything need to happen about imports writing to the dead column?**
   - What we know: five import/transform modules plus the v1 create/update routes still write
     `notes`. The migration runs once.
   - Recommendation: out of scope for building, **in scope for documenting**. Add a comment to
     `scripts/reconcile-notes.sql` stating that a non-zero delta after this phase means something
     wrote to the legacy column. Turns the SC-4 artifact into a permanent detector.
   - **RESOLVED** by 35-CONTEXT.md § Post-Research Addendum: option 2 — the importers' continued writes to the dead column are documented in the reconciliation script rather than fixed here, turning the SC-4 artifact into a permanent regression detector. Implemented by plan **35-03** task 2 (the five write sites are named in the file header, grep-gated).

6. **`public/openapi.yaml` and `docs/api/` updates.**
   - What we know: 2,393-line spec covering 22 paths; three new paths are needed. No test gates
     spec coverage — omitting it fails nothing.
   - Recommendation: include the spec edit as an explicit task, precisely *because* nothing enforces
     it.
   - **RESOLVED** by 35-CONTEXT.md § Post-Research Addendum: `public/openapi.yaml` and `docs/api/` updates are an explicit task. Implemented by plan **35-10** task 3, gated by falsifiable path and schema assertions precisely because no test enforces spec coverage.

---

## Project Constraints (from CLAUDE.md)

**No `./CLAUDE.md` exists in this repository** [VERIFIED: file read returned "File does not exist"].
No `.claude/skills/` or `.agents/skills/` directory exists either [VERIFIED: `ls` returned nothing].

The binding constraints therefore come from the environment brief, `.planning/STATE.md`, and
`docs/development/`:

- **Docker only.** `docker compose up -d` from the repo root. App at `http://localhost:3001`,
  Postgres at `localhost:5433` (host) / `postgres:5432` (in-network), Mailhog at `:8025`.
  **Never** `npm run dev` / `next dev`. `docker` needs **no** sudo.
- **Never embed a password in a command.** Historical incident; see project memory.
- **Migrations:** generate + migrate. **Never `drizzle-kit push`** for this phase.
- **D-06 (Phase 33):** indexes and schema changes are declared in `src/db/schema/*.ts` and emitted
  by `drizzle-kit generate` — never hand-written into migration SQL. Data migrations
  (`INSERT … SELECT`) **are** hand-appended, per the Phase 25 / 0009 precedent.
- **D-03 (Phase 33):** no `CREATE INDEX CONCURRENTLY` — drizzle wraps migrations in a transaction.
  Independently re-verified here in `drizzle-orm/pg-core/dialect.js:60`.
- **D-01 (Phase 33):** `Bitmap Index Scan` counts as an index scan. Do not write a verification
  step demanding a literal `Index Scan` node.
- **CFUI-01 (Phase 44):** no React element may cross the RSC boundary into a Radix `asChild` slot.
  Enforced by a repo-wide gate in CI.
- **Repo rule (logged):** ownership/authorization checks live in server actions and API routes;
  mutations only check entity existence.
- **CI gates every merge:** `npm run typecheck`, `npm run lint`, `npm test` — all must be green.
- **i18n:** every user-facing string via next-intl, in all three files under **`src/messages/`**
  (not `messages/`).

---

## Sources

### Primary (HIGH confidence — measured or read in this session)
- **Live PostgreSQL 16.13** (`docker compose exec postgres psql`) — all row counts, notes-length
  distributions, `owner_id` nullability, `EXPLAIN ANALYZE` plans and timings, migration timings,
  idempotency re-run, index DDL application, reconciliation query results. All destructive probes
  ran inside transactions and were rolled back or explicitly dropped; the database is unchanged.
- **`drizzle-kit generate` 0.31.9** run against a throwaway probe schema — confirmed partial and
  `DESC NULLS LAST` index emission, and confirmed a no-op re-generate. Probe file and generated
  migration both deleted; `drizzle/meta/` restored from backup; `git status` verified clean.
- Repo source read directly: `src/db/schema/*.ts`, `src/db/schema/_relations.ts`,
  `src/lib/events/{bus,types}.ts`, `src/lib/events/subscribers/{webhook,workflow-trigger}.ts`,
  `src/lib/mutations/deals.ts`, `src/lib/api/{auth,pagination,response}.ts`,
  `src/lib/formula-recalc.ts`, `src/components/custom-fields/custom-fields-section.tsx`,
  `src/components/ui/relative-time.tsx`, all four `[id]/page.tsx`, all four `*-dialog.tsx`,
  `src/app/api/custom-fields/save/route.ts`, `src/app/api/v1/deals/[id]/route.ts`,
  `src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx`, `vitest.config.ts`,
  `vitest.rsc.config.ts`, `.github/workflows/ci.yml`, `Dockerfile`, `docker-entrypoint.sh`,
  `drizzle.config.ts`, `drizzle/0009…`, `drizzle/0010…`, `drizzle/0012…`, `package.json`.
- `node_modules/drizzle-orm/pg-core/dialect.js` — migration transaction wrapping.
- `node_modules/drizzle-orm/pg-core/indexes.d.ts` — `IndexBuilder.where(condition: SQL)`.
- `.planning/{STATE,REQUIREMENTS,config.json}` and `35-{CONTEXT,UI-SPEC}.md`.

### Secondary (MEDIUM confidence)
- Keyset-vs-offset pagination consensus — long-standing, independently corroborated here by the
  measured plans (0.354 ms keyset vs 1.188 ms offset, and the index-bound derivation from the row
  comparison). [CITED: use-the-index-luke.com/no-offset]

### Tertiary (LOW confidence)
- None. No claim in this document rests on WebSearch. Nothing was researched externally because
  every question this phase raises is answerable from the repo or the live database — and doing so
  produced better answers than a search would have.

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| Standard stack | HIGH | Zero new packages; every version read from checked-in files |
| Schema + index design | HIGH | Generated by the repo's own drizzle-kit and applied to the live Postgres; re-generate confirmed no-op |
| Timeline query shape | HIGH | `EXPLAIN ANALYZE` on realistic worst-case data; four variants compared |
| Data migration | HIGH | Executed against the real 75,235 rows in a rolled-back transaction; idempotency re-run confirmed |
| Reconciliation (SC-4) | HIGH | Both queries executed; all zeros |
| RSC boundary rules | HIGH | Gate source read line by line |
| Scope of "column goes dormant" | **MEDIUM** | The *facts* are verified (8 write sites); the *decision* about which are in scope is A1 and needs user confirmation |
| Activity sort key | **MEDIUM** | Nothing locks it (A3) |
| Pitfalls | HIGH | Every pitfall is grounded in a specific verified file, line, or measurement — none is generic advice |

**Research date:** 2026-08-15
**Valid until:** 2026-09-14 (30 days — stable stack, no fast-moving dependency). Invalidated earlier
by: any new migration beyond 0013, a change to `rsc-boundary.test.tsx`'s gate, or a bulk import
that changes the legacy-notes row counts.
