---
phase: quick-4
plan: 01
subsystem: organizations, people, activities
tags: [pagination, search, ux, performance]
dependency_graph:
  requires: []
  provides: [server-side search, load-more pagination for orgs/people/activities]
  affects: [organizations page, people page, activities page]
tech_stack:
  added: []
  patterns: [cumulative ILIKE pagination, debounced URL param search, +1 fetch for hasMore detection]
key_files:
  created: []
  modified:
    - src/app/organizations/page.tsx
    - src/app/organizations/data-table.tsx
    - src/app/people/page.tsx
    - src/app/people/data-table.tsx
    - src/app/activities/actions.ts
    - src/app/activities/page.tsx
    - src/app/activities/activities-client.tsx
    - src/app/activities/activity-filters.tsx
decisions:
  - Cumulative paging (LIMIT = PAGE_SIZE * pageNum) so Load More appends rows without client-side merge
  - +1 fetch trick to detect hasMore without a COUNT query
  - 300ms debounce via useRef+setTimeout (no extra dependency)
  - Activities keeps relational findMany query (Drizzle supports limit param) — avoids shape change from db.select() refactor
metrics:
  duration: 6min
  completed: 2026-03-09
---

# Quick Task 4: Add Pagination with Lazy Loading

**One-liner:** Server-side ILIKE search + cumulative load-more pagination added to Organizations, People, and Activities tables.

## What Was Built

### Organizations

- `page.tsx`: Reads `?search=` and `?page=` searchParams. `getOrganizations(search, pageNum)` applies `and(isNull(deletedAt), or(ilike(name), ilike(industry), ilike(website)))` with `LIMIT = PAGE_SIZE * pageNum + 1`. Passes `hasMore`, `search`, `currentPage` to DataTable.
- `data-table.tsx`: Search input with 300ms debounce (`useRef` + `setTimeout`) pushing `?search=value&page=1`. Load More button pushes `?page=N+1` when `hasMore=true`.

### People

- `page.tsx`: Same pattern — ILIKE on `firstName`, `lastName`, `email`, `phone`. Cumulative paging.
- `data-table.tsx`: Search input + Load More, identical UX pattern to organizations.

### Activities

- `actions.ts`: Added `search?: string` and `limit?: number` to `getActivities` filters. When `search` is set, adds `or(ilike(title), ilike(notes))` to conditions. Passes `limit` to `findMany`.
- `page.tsx`: Adds `?search=` and `?page=` to searchParams type. Passes `limit: PAGE_SIZE * pageNum + 1` to `getActivities`. Trims extra row and sets `hasMore`. Passes to `ActivitiesClient`.
- `activities-client.tsx`: Added `hasMore`, `search`, `currentPage` props. Load More button uses `window.location.search` to preserve all existing filter params when pushing `?page=N+1`.
- `activity-filters.tsx`: Text search input with absolute-positioned Search icon, 300ms debounce, resets `?page=` to 1 on change, preserves all other URL params.

## Deviations from Plan

### Auto-fixed Issues

None - plan executed exactly as written, with one minor implementation decision:

**Activities: kept relational findMany instead of switching to db.select()**
- The plan suggested switching to `db.select()` builder to support `limit`. However, Drizzle's `db.query.findMany()` already accepts a `limit` parameter natively. This avoided a full query refactor while achieving identical behavior, keeping the nested `type`/`deal`/`owner`/`assignee` shape unchanged.

## Self-Check

Commits created:
- d384fc1: Organizations server-side search + load-more
- db9f566: People server-side search + load-more
- bd292c5: Activities text search + load-more

Files exist:
- src/app/organizations/page.tsx
- src/app/organizations/data-table.tsx
- src/app/people/page.tsx
- src/app/people/data-table.tsx
- src/app/activities/actions.ts
- src/app/activities/page.tsx
- src/app/activities/activities-client.tsx
- src/app/activities/activity-filters.tsx
