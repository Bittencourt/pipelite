---
phase: 03-people
plan: 02
subsystem: ui
tags: [react, next.js, tanstack-react-table, shadcn, select, data-table, people, contacts]

# Dependency graph
requires:
  - phase: 03-people
    plan: 01
    provides: "People schema, server actions (createPerson, updatePerson, deletePerson)"
  - phase: 02-organizations
    provides: "Organizations data-table pattern, columns pattern, page layout to mirror"
provides:
  - "People list page at /people with data table and org/owner joins"
  - "People navigation link in header for authenticated users"
  - "Clickable People dashboard card on home page"
  - "shadcn Select UI component for dialog use"
  - "Stub person-dialog and delete-dialog for Plan 03 replacement"
affects: [03-03-people-dialogs-detail]

# Tech tracking
tech-stack:
  added: [shadcn-select]
  patterns: [people-list-page, multi-entity-left-join, soft-delete-aware-join, stub-dialog-pattern]

key-files:
  created:
    - src/app/people/columns.tsx
    - src/app/people/data-table.tsx
    - src/app/people/page.tsx
    - src/app/people/person-dialog.tsx
    - src/app/people/delete-dialog.tsx
    - src/components/ui/select.tsx
  modified:
    - src/components/nav-header.tsx
    - src/app/page.tsx

key-decisions:
  - "Organization join filtered by deletedAt to hide soft-deleted orgs (pitfall #2 from research)"
  - "Stub dialogs created for compilation; Plan 03 replaces with full implementations"
  - "Organizations passed to DataTable as prop for future person dialog dropdown"
  - "Promise.all for parallel data fetching (people + orgs) in server component"

patterns-established:
  - "Soft-delete-aware join: and(eq(FK), isNull(deletedAt)) in left join condition"
  - "Stub component pattern: create minimal stubs for dependencies not yet implemented"

# Metrics
duration: 2min
completed: 2026-02-22
---

# Phase 3 Plan 2: People List Page & Navigation Summary

**People data table at /people with org/owner left joins, nav header link, dashboard card, and shadcn Select component**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-22T22:59:53Z
- **Completed:** 2026-02-22T23:02:16Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- People list page at /people with 7-column data table (Name, Email, Phone, Organization, Owner, Created, Actions)
- Left join to organizations (filtered by deletedAt) and users for displaying related names
- Navigation header updated with People link and Users icon for authenticated users
- Dashboard People card is now a clickable Link to /people instead of a static placeholder
- shadcn Select component installed for use in person dialog (Plan 03)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create people list page with data table** - `cdaad58` (feat)
2. **Task 2: Add People navigation link and dashboard card** - `7bafd4f` (feat)

## Files Created/Modified
- `src/app/people/columns.tsx` - Column definitions with Person type, Name link, Organization link, Actions with edit/delete callbacks
- `src/app/people/data-table.tsx` - Client data table with dialog state management, delete handler, Add Person button
- `src/app/people/page.tsx` - Server component with getPeople (dual left join) and getOrganizationsForSelect queries
- `src/app/people/person-dialog.tsx` - Stub returning null, typed props for Plan 03 replacement
- `src/app/people/delete-dialog.tsx` - Stub returning null, typed props for Plan 03 replacement
- `src/components/ui/select.tsx` - shadcn Select component (codegen from radix-ui)
- `src/components/nav-header.tsx` - Added Users icon import and People nav link
- `src/app/page.tsx` - Replaced static People card with clickable Link to /people

## Decisions Made
- Organization join filtered by `isNull(organizations.deletedAt)` in the join condition itself (not just the where clause), so soft-deleted orgs show as null organization rather than displaying a deleted org name
- Created stub person-dialog and delete-dialog with typed props to allow compilation while Plan 03 builds the real implementations
- Organizations fetched via separate `getOrganizationsForSelect()` query and passed to DataTable for future dialog dropdown use
- Used `Promise.all` to fetch people and organizations in parallel for the server component

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- People list page renders and compiles; ready for Plan 03 (dialogs and detail page)
- Stub dialogs have typed props matching expected PersonDialog and DeleteDialog interfaces
- Organizations list passed through to DataTable, ready for person dialog org dropdown
- shadcn Select component available for import in person-dialog.tsx

## Self-Check: PASSED

- [x] src/app/people/columns.tsx exists
- [x] src/app/people/data-table.tsx exists
- [x] src/app/people/page.tsx exists
- [x] src/app/people/person-dialog.tsx exists
- [x] src/app/people/delete-dialog.tsx exists
- [x] src/components/ui/select.tsx exists
- [x] src/components/nav-header.tsx contains "People"
- [x] src/app/page.tsx contains People link
- [x] Commit cdaad58 exists (Task 1)
- [x] Commit 7bafd4f exists (Task 2)

---
*Phase: 03-people*
*Completed: 2026-02-22*
