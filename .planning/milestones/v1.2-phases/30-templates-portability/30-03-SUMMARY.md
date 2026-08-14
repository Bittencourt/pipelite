---
phase: 30-templates-portability
plan: 03
subsystem: api
tags: [templates, export, import, rest-api, toolbar, workflows, zod]

# Dependency graph
requires:
  - phase: 30-templates-portability
    plan: 01
    provides: export-import library, workflowTemplates table, importWorkflow action
provides:
  - Export/Import JSON buttons in workflow editor toolbar
  - Workflow templates REST API (CRUD) at /api/v1/workflow-templates
  - serializeWorkflowTemplate API serializer
  - workflow-templates mutations (create, get, list, delete)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [toolbar export via Blob download, hidden file input for import, API route CRUD following existing patterns]

key-files:
  created:
    - src/lib/mutations/workflow-templates.ts
    - src/app/api/v1/workflow-templates/route.ts
    - src/app/api/v1/workflow-templates/[id]/route.ts
  modified:
    - src/app/workflows/[id]/edit/components/toolbar.tsx
    - src/lib/api/serialize.ts

key-decisions:
  - "Used db.select() instead of db.query for workflowTemplates (no relations defined for standalone table)"
  - "Export is pure client-side via Blob/ObjectURL (no server round-trip)"

patterns-established:
  - "Toolbar action buttons: variant=outline, size=sm, with lucide icon + label"

requirements-completed: [TMPL-04, API-04]

# Metrics
duration: 3min
completed: 2026-03-28
---

# Phase 30 Plan 03: Export/Import Toolbar + Templates API Summary

**Export/Import JSON buttons in editor toolbar with client-side serialization, plus full CRUD REST API for workflow templates**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-28T20:31:04Z
- **Completed:** 2026-03-28T20:34:47Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Export JSON button serializes current workflow with secret stripping and downloads as .json file
- Import JSON button validates pipelite/v1 schema, creates new workflow, navigates to editor
- REST API supports list (GET), create (POST), get detail (GET /:id), and delete (DELETE /:id) for workflow templates
- All API routes use withApiAuth, Zod validation, and RFC 7807 error responses

## Task Commits

Each task was committed atomically:

1. **Task 1: Export/Import buttons in editor toolbar** - `d2917ce` (feat)
2. **Task 2: Workflow templates REST API + mutations** - `0bd729f` (feat)

## Files Created/Modified
- `src/app/workflows/[id]/edit/components/toolbar.tsx` - Added Export JSON and Import JSON buttons with handlers
- `src/lib/mutations/workflow-templates.ts` - CRUD mutations for workflow_templates table with Zod schema
- `src/lib/api/serialize.ts` - Added serializeWorkflowTemplate for snake_case API output
- `src/app/api/v1/workflow-templates/route.ts` - GET (list) and POST (create) endpoints
- `src/app/api/v1/workflow-templates/[id]/route.ts` - GET (detail) and DELETE endpoints

## Decisions Made
- Used `db.select()` pattern instead of `db.query` for workflowTemplates since no relations are defined for the standalone table
- Export is pure client-side via Blob/ObjectURL -- no server round-trip needed for serialization

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Toolbar export/import fully functional for workflow portability
- REST API ready for programmatic template management
- All plan 30 features complete (data foundation, HTTP config UI, export/import + API)

---
*Phase: 30-templates-portability*
*Completed: 2026-03-28*
