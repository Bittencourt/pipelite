# Phase 38: Bulk Operations - Context

**Gathered:** 2026-08-17
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — all grey areas auto-accepted at recommended per user instruction

<domain>
## Phase Boundary

This phase makes multi-record action possible on the four CRM list surfaces without sacrificing
safety, attribution, or recoverability. In scope: row selection (checkbox column + select-all) on
Organizations, People, Activities, and selection on Deals kanban cards; bulk soft-delete with a
count-aware confirmation that lands every record in Trash; bulk owner reassignment; and CSV export
scoped to the current selection. Every bulk write goes through the existing per-entity mutations so
Phase 36's audit log and Phase 37's trash/restore apply unchanged.

Out of scope: bulk edit of arbitrary fields, bulk stage moves, bulk custom-field writes, a Deals
table view, reassigning Activity `assigneeId`, and any new export format.

</domain>

<decisions>
## Implementation Decisions

### Selection Model
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

### Bulk Delete
- Confirmation is a count-aware `AlertDialog` that names the record count and the live retention
  window read from trash settings ("…recoverable for 30 days"), not a copy of the singular
  `DeleteDialog` string.
- Deletion is **per-record and sequential** through the existing entity soft-delete mutations,
  best-effort — NOT one all-or-nothing transaction. Success criterion 3 requires per-record failure
  to be named, which a single aborting transaction structurally cannot do.
- The server enforces a hard cap of **100 ids per bulk call** (`BULK_MAX_IDS`) and rejects an
  over-cap request with a count-aware error. **Corrected during 38-RESEARCH:** the original claim
  that "the cap is never hit through the UI" is false on Deals — `/deals` has no pagination at all,
  there are 25,195 live deals, and the largest single stage holds 10,495. A per-stage select-all
  there is over-cap in the normal case, not an edge case. Select-all therefore selects at most
  `BULK_MAX_IDS` rows and says so through a dedicated copy key, which must land in
  `REQUIRED_BULK_KEYS` in the same commit (auto-accepted recommended, autonomous mode).
- Partial failure surfaces twice: a toast summary ("9 deleted, 3 failed") and an inline list naming
  each failed record and its reason. Failed records stay selected so a retry is one click; succeeded
  records are deselected.
- The post-delete affordance deep-links the correct Trash tab using the existing
  `ENTITY_TO_TRASH_TAB` map rather than landing on `/trash` generically (auto-accepted recommended,
  autonomous mode).
- **A second user must be restored as a plan task.** The live database has exactly one approved,
  non-deleted user owning all 46,054 organizations, so SC-3 (per-record failure named) and SC-5
  (reassignment in change history) are literally unverifiable as-is — reassigning to the same owner
  correctly writes no audit row. A second user unlocks a genuine partial-failure scenario.

### Bulk Reassign Owner
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
- Each reassigned record produces its own `audit_log` UPDATE row carrying the real actor, so success
  criterion 5 is satisfied without any bulk-specific audit row and without new audit code.
  **Corrected during 38-RESEARCH:** this decision originally said "routes through the existing
  per-entity update mutations", and taking that literally would ship a silent no-op.
  `ownerId` is absent from `organizationSchema`, `personSchema` and `activitySchema`, and Zod strips
  unknown keys silently — `updateOrganizationSchema.safeParse({ownerId:"user-1"})` returns
  `{success:true, data:{}}`, so the mutation writes only `updatedAt`, emits an empty diff, and
  `subscribers/audit.ts` drops the row. The whole suite would stay green while SC-3 and SC-5 both
  fail. Separately, `updateDealMutation(id, {ownerId})` unconditionally deletes every
  `deal_assignees` row before deciding what to re-insert (`deals.ts:406`), because `.partial()`
  preserves `assigneeIds`' `.default([])` — currently zero blast radius (`deal_assignees` is empty)
  but a latent data-loss bug. The phase therefore adds four narrow
  `update{Entity}OwnerMutation(id, ownerId, userId)` functions; the `update` prefix keeps them inside
  Phase 36's per-function SC-5 gate for free. This also avoids `updateDealMutation`'s assignee-email
  side effect, which is how "no email on bulk reassign" stays true.
- The reassign picker does NOT exclude the current owner; the mutation early-returns idempotently
  when the new owner equals the old one, which is also why reassigning to the same owner correctly
  writes no audit row (auto-accepted recommended, autonomous mode).
- Per-record authorization is NOT uniform across the four entities and must be copied verbatim, not
  unified: the deals server action carries `&& session.user.role !== "admin"`; organizations,
  people and activities do not. Unifying it either grants a privilege escalation or introduces a
  regression.

### Scoped CSV Export
- The scoped-export server action takes **`(ids: string[])` and nothing else**. It must NOT accept an
  `ExportFilters` object: the only existing export action is admin-gated, and a non-admin action that
  took filters and received `{}` would return all 46,054 organizations — an admin-gate bypass
  (found in 38-RESEARCH).
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

### Layering (found during 38-PATTERNS, auto-accepted recommended, autonomous mode)
- The floating bulk bar takes **`z-[60]`**, not the UI-SPEC's `z-30`. `ShortcutsHint`
  (`src/components/keyboard/shortcuts-hint.tsx:33`, mounted at `src/app/layout.tsx:53`) is
  `fixed bottom-0 left-0 right-0 z-50` for the first 10 seconds of any session whose
  `localStorage` flag is unset, so on a fresh browser profile a `z-30` bar renders *behind* it.
  `z-[60]` is deterministic and couples nothing; the hint still auto-dismisses on its own.
  A z-index is not a spacing token, so this does not touch the UI-SPEC spacing exception list.
- **No change to `<Toaster />`.** Sonner's own container carries `z-index: 999999999`
  (`node_modules/sonner/dist/styles.css`), so a toast always renders above the bar regardless of the
  bar's z-index and regardless of the default bottom-right position. The UI-SPEC checklist item
  "the bar does not cover the Sonner toast region" is satisfied structurally, not by positioning.

### Claude's Discretion
- Component decomposition of the bulk toolbar (one shared component vs per-entity), the exact
  placement of the toolbar relative to the search input, the shape of the server action return type
  beyond the established `{ success, error }` convention, and how the per-record failure list is
  laid out visually.
- Whether the 100-id cap is a shared constant or per-mutation.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/ui/checkbox.tsx` — shadcn Checkbox, already present, no new dependency needed.
- `src/components/ui/alert-dialog.tsx` — used by `activity-list.tsx` for its delete confirmation;
  the count-aware bulk confirmation follows that pattern.
- `src/components/ui/entity-combobox.tsx` — the user/entity picker for the reassign control.
- `src/lib/export/csv-columns.ts` (`deriveCsvColumns`) and `src/lib/export/formatters.ts`
  (`fetchFilteredData`, flatteners) — the whole CSV pipeline is already extracted and testable.
- `src/lib/mutations/{organizations,people,deals,activities}.ts` — soft-delete and update mutations
  that already emit CRM events and write audit rows.
- `src/lib/trash/` — restore/purge/prune, plus `settings.ts` for the retention window used in the
  confirmation copy.

### Established Patterns
- Lists are `"use client"` components over `@tanstack/react-table` with `getCoreRowModel`, fed by a
  server component page that does the query (`src/app/organizations/page.tsx`, `PAGE_SIZE = 50`,
  `hasMore` + Load More).
- `useDataTableKeyboard` from `@/components/keyboard` wires per-row keyboard nav on every list; a new
  checkbox cell must not swallow its row `onClick`.
- Server actions return `{ success: true/false, error }`; toasts come from `sonner`.
- Dialog closing is the dialog's decision via `onOpenChange`; a save callback is refresh-only and is
  named `onRecordSaved` (Phase 35 rename — do not reintroduce `onSuccess`).
- Mutations check entity existence; ownership checks stay in the server action / API route layer.

### Integration Points
- `src/app/organizations/{data-table,columns}.tsx`, `src/app/people/{data-table,columns}.tsx` —
  checkbox column + toolbar.
- `src/app/activities/activity-list.tsx` — same, inside the existing table.
- `src/app/deals/{kanban-board,kanban-column,deal-card}.tsx` — card-level selection and per-stage
  select-all.
- `src/app/{organizations,people,deals,activities}/actions.ts` — new bulk server actions.
- Phase 43 (POLISH-01) retypes `organizations/columns.tsx` and `people/columns.tsx`; this phase adds
  a column to both files first, which is the declared dependency direction.

</code_context>

<specifics>
## Specific Ideas

- The user's standing instruction for this autonomous run: accept the recommended option at every
  decision point, and perform browser-based verification through the Claude-in-Chrome tools against
  the Docker app at `http://localhost:3001`.
- Phase 37 established that a 320px viewport must be tested through a **same-origin iframe**, not
  `resize_window`, because the latter cannot change `window.innerWidth` in this environment. The new
  bulk toolbar is a horizontal control cluster and is exactly the kind of element that overflowed
  there before.
- Phase 37 also recorded that the global app `<header>` already overflows at 320px on every route
  (tracked as 37-UAT G5) — that pre-existing overflow must not be misattributed to this phase's
  toolbar.

</specifics>

<deferred>
## Deferred Ideas

- Bulk edit of arbitrary fields (including custom fields) and bulk stage moves on the kanban.
- A digest email notifying a new owner of a bulk reassignment.
- Filter-wide "select all N matching records" beyond the loaded page.
- Bulk reassignment of Activity `assigneeId` alongside `ownerId`.
- A tabular Deals view as an alternative to the kanban.

</deferred>
