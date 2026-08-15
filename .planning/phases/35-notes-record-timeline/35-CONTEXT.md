# Phase 35: Notes & Record Timeline - Context

**Gathered:** 2026-08-15
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — 16 decisions across 4 areas, all recommendations accepted

<domain>
## Phase Boundary

Replace the single overwritable `notes` text column on deals, organizations, people, and
activities with an append-only, attributed note feed, and render one chronological per-record
timeline that interleaves notes, activities, and deal stage changes. Every byte of existing
`notes` content is migrated into a first, attributed, dated note and the migration is
reconciled by count.

**In scope:** notes table + migration, note CRUD (UI + REST), timeline assembler and UI,
minimal deal stage-change history to satisfy the "stage changes" source.

**Out of scope:** the general audit log (Phase 36), trash/restore of notes beyond soft delete
(Phase 37), bulk note operations (Phase 38), `note.created` workflow trigger, dropping the
legacy `notes` column.

</domain>

<decisions>
## Implementation Decisions

### Notes Data Model
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

### Timeline Composition
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

### Legacy Notes Migration (NOTE-03)
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

### API, Permissions & Surfaces
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

### Post-Research Addendum (decided 2026-08-15, after 35-RESEARCH.md)

Research found eight surviving write/render sites for the legacy `notes` column that the
UI-SPEC's four detail-page edits do not touch, which would have left "the column goes dormant"
false on the busiest surfaces. Two decisions were taken:

- **Create dialogs keep a Notes textarea; edit dialogs lose it.** In `deal-dialog.tsx`,
  `organization-dialog.tsx`, `person-dialog.tsx`, and `activity-dialog.tsx`, the create path
  keeps a Notes textarea but it now writes a **first note row**, never the legacy column. The
  edit path drops the field entirely — notes are edited in the timeline. `deal-card.tsx` stops
  rendering the legacy column. Net effect: the legacy column is genuinely dormant (zero readers,
  zero writers in app code) with no regression to "jot a note while creating a record".
- **Notes on soft-deleted records ARE migrated** (15 rows on the live DB). The SC-4 reconciliation
  stays an exact equality with no soft-delete carve-out on either side, and Phase 37's Trash &
  Restore will find note history intact when a record is restored.

Researcher recommendations accepted without change: activity timeline entries sort on
`created_at`; the optional `activities (deal_id, created_at DESC)` index is SKIPPED; the
importer's continued writes to the dead column are documented in the reconciliation script
rather than fixed here; `public/openapi.yaml` and `docs/api/` updates are an explicit task;
notes bodies are NOT capped at 2000 characters (the live DB holds a 131,505-character activity
note that must stay editable); the UI uses **server actions**, not client fetches to
`/api/v1/**`, because those routes are API-key-only via `withApiAuth`; `tooltip.tsx` is not
vendored, so the migrated-note marker uses a native `title` attribute.

### Claude's Discretion
- Table/column naming, index selection on the new tables, component file layout, and the exact
  shape of the timeline entry union type.
- Whether the stage-history table is deal-specific or generic enough for Phase 36 to reuse —
  decide during planning, but do not build the full audit log here.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/events/` — crmBus with 13 typed events including `deal.stage_changed`
  (`src/lib/events/types.ts`), and an existing subscriber pattern in
  `src/lib/events/subscribers/` (webhook.ts, workflow-trigger.ts) to copy for stage history.
- `src/lib/mutations/` — established mutation layer that emits CRM events; note CRUD should
  follow it rather than writing DB calls inline in server actions.
- `src/components/ui/` — shadcn primitives (Card, Badge, Button) already used by the detail pages.
- `src/components/custom-fields/custom-fields-section.tsx` — the closest analog for a
  self-contained section component dropped into all four detail pages.

### Established Patterns
- Schema files live one-per-entity in `src/db/schema/` with relations isolated in `_relations.ts`
  to avoid circular imports; `index.ts` re-exports.
- Every CRM table uses `id: text().$defaultFn(crypto.randomUUID)`, `createdAt`/`updatedAt`
  timestamps, and `deletedAt` for soft delete, with indexes declared in the schema file and
  emitted through `drizzle-kit generate` — never hand-written into migration SQL (Phase 33, D-06).
- Server actions return `{ success: true/false, error/id }`.
- Detail pages are RSC (`src/app/{entity}/[id]/page.tsx`) that fetch with `db.select()` joins and
  hand data to client components; anything interactive must be a `'use client'` component and must
  not cross the RSC boundary into a Radix `asChild` slot (Phase 44, CFUI-01).
- i18n via `getTranslations` server-side, three locale files under `messages/`.

### Integration Points
- Four detail pages: `src/app/deals/[id]/page.tsx` (reads `deal.notes` today and renders it in a
  bordered block — that block is what the timeline replaces), plus the organizations, people, and
  activities equivalents.
- `src/app/api/v1/{deals,organizations,people,activities}/[id]/` for the nested notes routes.
- `src/db/schema/index.ts` and `_relations.ts` for the new tables.
- Existing indexes on the four tables were added in Phase 33 (`drizzle/0012_*`); the next
  migration number continues from there.

</code_context>

<specifics>
## Specific Ideas

- The deal detail page currently renders `deal.notes` in a `mt-6 pt-6 border-t` block near the
  bottom of the details card. That block is removed, not left alongside the timeline — two
  competing notes surfaces on one page is the exact failure this phase exists to fix.
- Migrated notes must remain identifiable after the fact (`source: 'migration'`), because the
  reconciliation in SC-4 is only meaningful if migrated rows can be counted separately from
  notes users wrote after the migration ran.

</specifics>

<deferred>
## Deferred Ideas

- Dropping the legacy `notes` columns once reconciliation has held for a release.
- `note.created` CRM event + workflow trigger support.
- Pulling related-deal activities into organization and person timelines.
- Markdown or rich-text note bodies.
- @-mentions and note reactions.

</deferred>
