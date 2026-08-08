---
phase: 30-templates-portability
plan: 01
subsystem: api
tags: [templates, export, import, zod, drizzle, http, workflows]

# Dependency graph
requires:
  - phase: 29-workflow-ui
    provides: workflow schema, mutations, and server actions
provides:
  - 6 built-in HTTP templates (Slack, Discord, Planka, Apprise, Tally, Typeform)
  - 4 workflow starter templates
  - http_templates DB table with CRUD mutations
  - Export/import library with secret stripping and pipelite/v1 schema validation
  - importWorkflow, saveHttpTemplate, removeHttpTemplate server actions
affects: [30-02-PLAN, 30-03-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: [secret-stripping on export, pipelite/v1 schema versioning, template config as typed static data]

key-files:
  created:
    - src/lib/templates/http-templates.ts
    - src/lib/templates/workflow-templates.ts
    - src/lib/workflows/export-import.ts
    - src/lib/mutations/http-templates.ts
    - src/db/schema/http-templates.ts
  modified:
    - src/db/schema/index.ts
    - src/db/schema/_relations.ts
    - src/app/workflows/actions.ts

key-decisions:
  - "SECRET_HEADER_KEYS regex matches common auth header patterns for secret stripping"
  - "Import name conflict resolved by appending ' (Imported)' suffix"
  - "HTTP template permission check allows owner or admin to delete"

patterns-established:
  - "Static template data: typed arrays with id/name/description/config shape"
  - "Export schema versioning: pipelite/v1 literal for forward compatibility"

requirements-completed: [TMPL-01, TMPL-02, TMPL-04]

# Metrics
duration: 4min
completed: 2026-03-28
---

# Phase 30 Plan 01: Data Foundation Summary

**6 HTTP templates, 4 workflow starters, export/import with secret stripping, http_templates table with CRUD mutations**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-28T20:24:32Z
- **Completed:** 2026-03-28T20:28:14Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Built-in HTTP templates for 6 services (Slack, Discord, Planka, Apprise, Tally, Typeform) with typed config
- Workflow starter templates for 4 patterns (scheduled sync, webhook notifier, data pipeline, email digest)
- Export serialization strips secrets from Authorization/token/api-key headers automatically
- Import validation enforces pipelite/v1 schema version and validates node types

## Task Commits

Each task was committed atomically:

1. **Task 1: Static template data files + DB schema + migration** - `136e46a` (feat)
2. **Task 2: Export/import library + HTTP template mutations + importWorkflow server action** - `01cecc4` (feat)

## Files Created/Modified
- `src/lib/templates/http-templates.ts` - 6 built-in HTTP templates with typed config interfaces
- `src/lib/templates/workflow-templates.ts` - 4 workflow starter templates
- `src/lib/workflows/export-import.ts` - Export serialization, import validation, secret stripping, slugify
- `src/lib/mutations/http-templates.ts` - CRUD mutations for custom HTTP templates
- `src/db/schema/http-templates.ts` - http_templates table definition
- `src/db/schema/index.ts` - Added http-templates export
- `src/db/schema/_relations.ts` - Added httpTemplatesRelations
- `src/app/workflows/actions.ts` - Added importWorkflow, saveHttpTemplate, removeHttpTemplate

## Decisions Made
- SECRET_HEADER_KEYS regex covers authorization, bearer, token, api-key, secret, x-api-key, x-token, password, x-secret patterns
- Import name conflict appends " (Imported)" rather than failing (D-17)
- HTTP template delete permission: owner OR admin (D-08)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Migration required explicit DATABASE_URL with localhost:5433 (host-mapped port) since .env uses Docker-internal hostname

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All data layers ready for Plan 02 (HTTP config form UI) and Plan 03 (toolbar export/import UI)
- builtInHttpTemplates, workflowStarterTemplates importable for UI rendering
- serializeWorkflowForExport, validateWorkflowImport ready for toolbar integration

---
*Phase: 30-templates-portability*
*Completed: 2026-03-28*
