---
phase: 15-multi-user-collaboration
plan: 05
subsystem: activities-ui
tags: [activities, assignee, filter, avatar, server-actions, i18n]

# Dependency graph
requires:
  - phase: 15-01
    provides: assigneeId FK column on activities table and Drizzle assignee relation
  - phase: 06-activities
    provides: activity server actions, dialog, filters, list, page structure
  - phase: 12-localization
    provides: next-intl translation infrastructure
provides:
  - assigneeId saved on activity create/update
  - Assignee Select in ActivityDialog
  - Assignee filter dropdown in ActivityFilters with ?assignee URL param
  - Assignee avatar rendered in each activity list row
affects:
  - All activity list/create/edit flows

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Same users pool serves both owner filter and assignee filter (no separate query)
    - Assignee displayed as avatar-only with title tooltip (no separate name column)

key-files:
  created: []
  modified:
    - src/app/activities/actions.ts
    - src/app/activities/activity-dialog.tsx
    - src/app/activities/activity-filters.tsx
    - src/app/activities/activities-client.tsx
    - src/app/activities/page.tsx
    - src/app/activities/activity-list.tsx
    - src/messages/en-US.json
    - src/messages/pt-BR.json
    - src/messages/es-ES.json

key-decisions:
  - "Same ownersResult user pool passed as both owners (filter) and users (assignee select/filter) — no extra query needed"
  - "Assignee avatar-only with title tooltip per design decision — no separate name column in activity list"
  - "assigneeLabel translation key added alongside assignee and allAssignees for the filter chip display"

# Metrics
duration: 5min
completed: 2026-03-07
---

# Phase 15 Plan 05: Activity Assignee Support Summary

**Single-assignee support on activities: server action schema, Assignee Select in dialog, Assignee filter in ActivityFilters, avatar in list rows, wired end-to-end through page/client stack**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-07T18:37:26Z
- **Completed:** 2026-03-07T18:43:25Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Updated `activitySchema` in server actions to include `assigneeId` (optional/nullable)
- `createActivity` persists `assigneeId` to DB; `updateActivity` conditionally sets it
- Added `assigneeId` filter support to `getActivities` with server-side `eq()` condition
- `getActivities` query now eagerly loads assignee user data (id, name, email)
- `ActivityDialog` accepts `users` prop and renders Assignee Select after the Deal field; pre-populates in edit mode
- `ActivityFilters` accepts `assignees` prop and renders Assignee dropdown; reads/writes `?assignee` URL param; shows assignee chip with clear button
- `ActivitiesClient` accepts `users` prop and maps it to `assignees` for filters and passes it directly to `ActivityDialog`
- `page.tsx` reads `?assignee` URL param, passes it to `getActivities` as `assigneeId`, fetches user email alongside name, exposes `users` to client
- `activity-list.tsx` `Activity` interface extended with optional `assignee` object; `getInitials` helper added; Avatar column renders assignee initials with name tooltip
- Translation keys (`assignee`, `allAssignees`, `assigneeLabel`) added to en-US, pt-BR, es-ES

## Task Commits

Each task was committed atomically:

1. **Task 1: Update activity server actions for assigneeId** - `b0da809` (feat)
2. **Task 2: Add Assignee select to dialog, filter to ActivityFilters, wire through page/client** - `40ccd86` (feat)
3. **Task 3: Render assignee avatar in activity list rows** - `1c428d4` (feat)

## Files Created/Modified

- `src/app/activities/actions.ts` - assigneeId in schema, createActivity, updateActivity, getActivities filter + query
- `src/app/activities/activity-dialog.tsx` - users prop, assigneeId form field, Assignee Select UI
- `src/app/activities/activity-filters.tsx` - assignees prop, assignee URL param, Assignee Select in popover, assignee chip
- `src/app/activities/activities-client.tsx` - users prop, assignees mapped and passed to ActivityFilters, users passed to ActivityDialog
- `src/app/activities/page.tsx` - assignee URL param, assigneeId filter, email fetched, usersForAssignee, activeFilters.assignee
- `src/app/activities/activity-list.tsx` - Activity interface extended, Avatar import, getInitials helper, assignee avatar column
- `src/messages/en-US.json` - assignee, allAssignees, assigneeLabel keys
- `src/messages/pt-BR.json` - Responsável, Todos os responsáveis translations
- `src/messages/es-ES.json` - Responsable, Todos los responsables translations

## Decisions Made

- The same `ownersResult` query (all active users) is reused for both the owner filter and the assignee select/filter — avoids an extra DB round-trip since both draw from the same user pool
- Assignee rendered as avatar-only (no separate name column) with `title` attribute for hover tooltip per design spec
- `assigneeLabel` translation key added for the active filter chip display text (separate from `assignee` which is the label inside the popover)

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

All 6 modified source files verified present on disk.
All 3 task commits (b0da809, 40ccd86, 1c428d4) verified in git log.
