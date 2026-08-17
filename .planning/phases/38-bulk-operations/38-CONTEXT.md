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
- The server enforces a hard cap of **100 ids per bulk call** and rejects an over-cap request with a
  count-aware error. Page size is 50, so the cap is never hit through the UI and exists to bound the
  API surface.
- Partial failure surfaces twice: a toast summary ("9 deleted, 3 failed") and an inline list naming
  each failed record and its reason. Failed records stay selected so a retry is one click; succeeded
  records are deselected.

### Bulk Reassign Owner
- The reassigned field is `ownerId`, which all four entities carry (`organizations.ownerId`,
  `people.ownerId`, `deals.ownerId`, `activities.ownerId`). Activities' separate `assigneeId` is out
  of scope for this phase.
- The picker reuses `src/components/ui/entity-combobox.tsx` over active users rather than
  introducing a new member-picker component.
- **No email is sent on bulk reassign.** A per-record notification would emit up to 100 emails from
  one click; a digest email is deferred, not built.
- Reassignment routes through the existing per-entity update mutations, so each record produces its
  own `audit_log` UPDATE row carrying the real actor. Success criterion 5 is satisfied by reuse — no
  bulk-specific audit row and no new audit code.

### Scoped CSV Export
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
