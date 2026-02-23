# Phase 4: Pipelines & Stages - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Admins configure sales pipelines with stages for deal progression. This phase delivers pipeline and stage CRUD with proper ordering, typing, and deletion handling. Deals and Kanban visualization come in Phase 5.

</domain>

<decisions>
## Implementation Decisions

### Stage Ordering
- Drag-and-drop for reordering stages within a pipeline
- Kanban-style columns display in the configuration UI
- New pipelines pre-populated with default stages (e.g., Lead → Qualified → Proposal → Won/Lost)
- New stages added at the end, admin reorders as needed

### Stage Properties
- Pickable color from a predefined palette (not custom hex picker)
- No probability percentage field
- Stage types: Won, Lost, and implicit Open (stages not marked Won/Lost are Open)
- Optional description field per stage
- Exactly one Won and one Lost stage allowed per pipeline (maximum, but optional to have)
- Won/Lost stages are optional — pipeline works without them
- Won/Lost stages can appear anywhere in the order (not constrained to end)
- Colors auto-assign from palette on stage creation
- Stage names must be unique within a pipeline

### Deletion Handling
- Delete stage with deals → admin must reassign deals to another stage first
- Delete pipeline → soft delete/archive (deals still accessible)
- Default stages are fully editable — admin can delete or rename them
- Won/Lost stage deletion → extra confirmation about historical deals affected

### Pipeline Settings
- Multiple pipelines allowed per organization
- Admin explicitly selects which pipeline is default
- Per-user visibility — admins configure which pipelines each user can see
- Pipeline entity has name only (no description field)

### OpenCode's Discretion
- Exact default stage names for new pipelines
- Number of colors in predefined palette and their values
- Archive/soft-delete implementation details
- Stage reassignment dialog UX

</decisions>

<specifics>
## Specific Ideas

- Kanban-style stage preview gives admin immediate visual feedback on configuration
- Per-user visibility allows segmenting sales teams by pipeline (e.g., enterprise vs SMB)

</specifics>

<deferred>
## Deferred Ideas

- Probability-based forecasting — out of scope, no probability field
- Pipeline templates for different use cases — future enhancement

</deferred>

---

*Phase: 04-pipelines-stages*
*Context gathered: 2026-02-22*
