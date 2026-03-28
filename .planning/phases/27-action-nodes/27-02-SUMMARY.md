---
phase: 27-action-nodes
plan: 02
subsystem: execution
tags: [crm, email, notifications, mutations, interpolation, templates, drizzle]

requires:
  - phase: 27-action-nodes/01
    provides: "Action registry, interpolation engine, HTTP handler, SSRF prevention"
  - phase: 24-workflow-schema
    provides: "Mutation functions for deals, people, organizations, activities"
provides:
  - "CRM action handler (create/update/delete for 4 entity types)"
  - "Email action handler with dynamic + user recipients"
  - "Notification action handler for team member emails"
  - "Workflow email and notification templates"
  - "_workflowUserId field on ExecutionContext"
affects: [27-action-nodes, 28-visual-editor, 29-workflow-management-ui]

tech-stack:
  added: []
  patterns:
    - "Mutation dispatch map for entity/operation routing"
    - "Field lookup via ilike for entity resolution by common fields"
    - "Batch user email lookup with inArray for email/notification handlers"

key-files:
  created:
    - src/lib/execution/actions/crm.ts
    - src/lib/execution/actions/email.ts
    - src/lib/execution/actions/notification.ts
    - src/lib/email/templates/workflow-email.ts
    - src/lib/email/templates/workflow-notification.ts
    - src/lib/execution/actions/__tests__/crm.test.ts
    - src/lib/execution/actions/__tests__/email.test.ts
    - src/lib/execution/actions/__tests__/notification.test.ts
  modified:
    - src/lib/execution/types.ts
    - src/lib/execution/engine.ts
    - src/lib/execution/actions/index.ts
    - src/lib/email/templates/index.ts
    - src/lib/execution/actions/__tests__/http.test.ts

key-decisions:
  - "Mutation dispatch map uses type-cast wrappers to normalize varying mutation signatures"
  - "Field lookup uses ilike for case-insensitive matching on text fields"
  - "Email handler resolves user recipients via batch DB query with inArray"
  - "Workflow email templates are simple (no i18n) since subject/body are user-authored"

patterns-established:
  - "Mutation dispatch map: entity -> { create, update, delete } for CRM action routing"
  - "resolveTargetId: targetId interpolation OR lookupField+lookupValue DB query for entity resolution"

requirements-completed: [ACT-02, ACT-03, ACT-04]

duration: 6min
completed: 2026-03-28
---

# Phase 27 Plan 02: Action Handlers Summary

**CRM create/update/delete actions via mutation dispatch, email with interpolated templates to dynamic/user recipients, and team notification handler**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-28T03:19:28Z
- **Completed:** 2026-03-28T03:25:12Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- CRM handler dispatches to correct mutation for each entity/operation combo with field lookup resolution
- Email handler sends to both dynamic addresses and team member IDs with interpolated subject/body
- Notification handler looks up team members by ID and sends notification emails
- Both email templates follow existing project template pattern (table layout, white card)
- All 20 new tests passing, full execution module green (141 tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: CRM action handler with create/update/delete and field lookup** - `49e53ab` (feat)
2. **Task 2: Email and notification action handlers with workflow templates** - `7cf006a` (feat)

## Files Created/Modified
- `src/lib/execution/actions/crm.ts` - CRM create/update/delete handler for deals, people, orgs, activities
- `src/lib/execution/actions/email.ts` - Email send handler with dynamic + user recipients
- `src/lib/execution/actions/notification.ts` - Notification handler sending to team members
- `src/lib/email/templates/workflow-email.ts` - Email template for workflow-sent emails
- `src/lib/email/templates/workflow-notification.ts` - Notification template (simpler card)
- `src/lib/execution/types.ts` - Added _workflowUserId to ExecutionContext
- `src/lib/execution/engine.ts` - Set _workflowUserId from workflow.createdBy
- `src/lib/execution/actions/index.ts` - Added crm/email/notification side-effect imports
- `src/lib/email/templates/index.ts` - Exported new template functions
- `src/lib/execution/actions/__tests__/crm.test.ts` - 10 CRM tests
- `src/lib/execution/actions/__tests__/email.test.ts` - 6 email tests
- `src/lib/execution/actions/__tests__/notification.test.ts` - 4 notification tests
- `src/lib/execution/actions/__tests__/http.test.ts` - Updated mocks for new side-effect imports

## Decisions Made
- Mutation dispatch map uses type-cast wrappers to normalize varying mutation signatures (createMutation takes input object, update takes id+data+userId, delete takes id+userId)
- Field lookup uses ilike for case-insensitive matching on text fields (email, name, title)
- Email handler resolves user recipients via batch DB query with inArray rather than individual queries
- Workflow email templates are simple (no i18n) since subject/body are user-authored with interpolated variables

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated http.test.ts mocks for new side-effect imports**
- **Found during:** Task 2 (email/notification handlers)
- **Issue:** Adding crm/email/notification to index.ts side-effect imports caused http.test.ts to fail because it lacked mocks for @/db, @/lib/mutations, @/lib/email/send, etc.
- **Fix:** Added comprehensive vi.mock() calls to http.test.ts for all dependencies imported by new handlers
- **Files modified:** src/lib/execution/actions/__tests__/http.test.ts
- **Verification:** Full execution module tests pass (141/141)
- **Committed in:** 7cf006a (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Auto-fix necessary to maintain test isolation. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 5 action types now registered: http_request, crm_action, email, notification (+ transform, webhook_response from earlier)
- Ready for Phase 28 (Visual Editor) which will provide UI for configuring these action nodes
- Action handlers are fully functional and tested with 20 dedicated tests

---
*Phase: 27-action-nodes*
*Completed: 2026-03-28*
