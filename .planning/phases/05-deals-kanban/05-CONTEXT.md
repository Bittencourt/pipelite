# Phase 5: Deals & Kanban - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Users manage deals through a visual kanban board with drag-and-drop. Deals are linked to organizations, people, and pipeline stages. Users can create, edit, delete deals and move them between stages via drag-drop. Stage headers show aggregated counts and values. Won/Lost deals are handled in a collapsed footer section.

</domain>

<decisions>

### Kanban Board Layout
- Fixed width columns (~280px) with horizontal scroll for many stages
- Pipeline selector dropdown at top of board to switch between pipelines
- Single column view with horizontal swipe on mobile/narrow screens
- Global "Add deal" button at top, stage selected within the form (not per-stage buttons)

### Stage Headers
- Show stage name, deal count, and total value of deals in stage
- Empty stages show just the header (no special placeholder text)

### Deal Cards
- Show title, value, and organization name on each card
- Cards ordered manually via drag reorder within each stage
- Clicking a card expands inline for quick view, with edit via button (not opening dialog directly)

### Deal Form Fields
- Required: Title, organization OR person (at least one link)
- Optional: Value, expected close date, notes
- Value field allows "No Value" (empty/null is valid)
- Currency symbol shown with value (e.g., $1,234)

### Won/Lost Deals
- Won and Lost stages appear in a collapsed footer row on the kanban board
- Not shown as regular columns to reduce visual clutter

### OpenCode's Discretion
- Exact card styling and visual priority
- Inline expansion animation/behavior details
- Currency formatting specifics
- Delete confirmation message wording
- Error handling for drag-drop failures

</decisions>

<specifics>
## Specific Ideas

- Kanban should feel like Trello or Linear's board views — clean, draggable
- Won/Lost as footer keeps focus on active deals while still accessible

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-deals-kanban*
*Context gathered: 2026-02-23*
