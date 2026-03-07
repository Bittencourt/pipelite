# Phase 15: Multi-user Collaboration - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Add assignees to deals and activities so teams can collaborate — deals get an owner (single) plus multiple additional assignees via a join table; activities get a single assignee column. A /team page shows each team member with their assigned deals and activities. Assignee filtering is added to both deals and activities pages.

</domain>

<decisions>
## Implementation Decisions

### Team view
- Both: assignee filter on deals page AND a dedicated /team page
- /team page shows all users with expandable rows per person
- Each expanded row shows: deals assigned to that person + their upcoming activities
- Accessible to all logged-in users (not admin-only)

### Deal card display
- Stacked AvatarGroup on kanban cards (overlapping circles + "+N" overflow)
- Avatar count is dynamic based on card width (not a fixed cutoff)
- Hover shows tooltip with assignee name(s)
- AvatarGroup also appears as a column in the deals list/table view

### Owner vs assignee
- Owner is the primary/lead person; assignees are collaborators — but they use the same user pool
- Owner can also appear in the assignees list (no forced separation)
- Deal dialog has two distinct fields: "Owner" (single select) + "Assignees" (multi-select)
- Any user with edit access (not just admins) can change the owner of a deal

### Activity assignee model
- Single assignee = the person responsible for completing the activity
- No default — assignee starts blank and must be set manually
- Displayed as avatar only in the activities list (no separate column with name)
- Assignee filter added to ActivityFilters (same pattern as deals)

### Claude's Discretion
- Avatar initials generation (first+last initial or single initial)
- Exact AvatarGroup stacking order (left-to-right or newest-last)
- Tooltip formatting for multiple avatars on hover
- Exact /team page layout within the expandable row design
- Navigation placement of /team page in the nav header

</decisions>

<specifics>
## Specific Ideas

- Owner conceptually is "just the first/primary assignee" — no strong semantic difference from assignees, just highlighted as the lead
- The /team page expandable row pattern should show both deals and activities sections per user
- AvatarGroup count should flex with card width rather than using a fixed number

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 15-multi-user-collaboration*
*Context gathered: 2026-03-07*
