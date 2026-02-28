---
phase: 09-import-export
plan: 01
subsystem: import
tags: [csv, papaparse, fuzzy-matching, levenshtein, wizard, file-upload]

# Dependency graph
requires:
  - phase: 02-organizations
    provides: organizations schema and actions pattern
  - phase: 03-people
    provides: people schema and actions pattern
  - phase: 05-deals-kanban
    provides: deals schema with stage references
  - phase: 06-activities
    provides: activities schema and activity types
provides:
  - CSV parsing infrastructure with papaparse and progress reporting
  - Fuzzy organization name matching using Levenshtein distance
  - Zod validation schemas for import data per entity type
  - Field mapping with auto-suggest based on column name similarity
  - Server actions for batch import with auto-create and flagging
  - 4-step import wizard (Upload, Map Fields, Preview, Confirm)
  - Warning dialog for auto-created entity confirmation
affects: [09-02, 09-03, 10-api]

# Tech tracking
tech-stack:
  added: [papaparse, "@types/papaparse"]
  patterns: [batch-insert, fuzzy-matching, import-wizard-flow, auto-create-with-flag]

key-files:
  created:
    - src/lib/import/types.ts
    - src/lib/import/parsers.ts
    - src/lib/import/fuzzy-match.ts
    - src/lib/import/validators.ts
    - src/lib/import/mappers.ts
    - src/app/import/actions.ts
    - src/app/import/page.tsx
    - src/app/import/import-wizard.tsx
    - src/app/import/steps/upload-step.tsx
    - src/app/import/steps/mapping-step.tsx
    - src/app/import/steps/preview-step.tsx
    - src/app/import/steps/confirm-step.tsx
    - src/components/import/progress-bar.tsx
    - src/components/import/file-dropzone.tsx
    - src/components/import/field-mapper.tsx
    - src/components/import/import-preview.tsx
    - src/components/import/warning-dialog.tsx
  modified:
    - package.json

key-decisions:
  - "Levenshtein distance with normalized scoring for fuzzy org matching (threshold 0.85 for auto-match)"
  - "Auto-created entities flagged with [Imported] prefix in notes field for review"
  - "Batch insert with BATCH_SIZE=100 for all entity imports"
  - "importOrganizations returns consistent shape with warnings and autoCreated.orgs/people"
  - "Auto-suggest mapping based on column name normalization and partial matching"
  - "Warning dialog groups by warning type (auto_create_org, auto_create_person, stage_fallback)"

patterns-established:
  - "Batch insert helper: generic batchInsert function for chunked DB inserts"
  - "Entity resolution: fuzzy match -> exact match -> auto-create pattern"
  - "Import wizard flow: upload -> mapping -> preview with validation -> confirm with progress"
  - "Auto-suggest mapping: normalize column names and match against target field definitions"

# Metrics
duration: 9min
completed: 2026-02-28
---

# Phase 09 Plan 01: CSV Import Wizard Summary

**4-step CSV import wizard with papaparse, Levenshtein fuzzy org matching, auto-create missing entities with [Imported] flag, and batch server actions**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-28T21:27:15Z
- **Completed:** 2026-02-28T21:37:04Z
- **Tasks:** 3
- **Files modified:** 18

## Accomplishments
- CSV parsing infrastructure with papaparse, progress callbacks, and web worker support for large files
- Fuzzy organization matching using Levenshtein distance with normalized scoring and common suffix stripping
- Zod validation schemas for all 4 entity types with comprehensive import field definitions
- Server actions for batch import with auto-create of missing orgs/people, stage fallback, and activity type resolution
- 4-step wizard UI: Upload (drag-drop) -> Map Fields (auto-suggest) -> Preview (50 rows, red error highlighting, partial import checkbox) -> Confirm (progress bar, success/error states)
- Warning dialog requiring confirmation before importing when auto-creates are detected

## Task Commits

Each task was committed atomically:

1. **Task 1: Install papaparse and create import infrastructure** - `2b24f7a` (feat)
2. **Task 2: Create server actions with auto-create and flagging** - `1aff3f6` (feat)
3. **Task 3: Create 4-step import wizard with all UI components** - `0a896b7` (feat)

## Files Created/Modified
- `src/lib/import/types.ts` - Import types: ImportStep, ImportState, ImportProgress, ImportWarning, etc.
- `src/lib/import/parsers.ts` - CSV parsing with papaparse, progress callback, web worker for >1MB files
- `src/lib/import/fuzzy-match.ts` - Levenshtein fuzzy matching for organization names
- `src/lib/import/validators.ts` - Zod schemas and validateImportData for all entity types
- `src/lib/import/mappers.ts` - Target field definitions, auto-suggest mapping, applyFieldMapping
- `src/app/import/actions.ts` - Server actions: importOrganizations, importPeople, importDeals, importActivities
- `src/app/import/page.tsx` - Import page wrapper
- `src/app/import/import-wizard.tsx` - 4-step wizard state management and step rendering
- `src/app/import/steps/upload-step.tsx` - File upload step with progress
- `src/app/import/steps/mapping-step.tsx` - Field mapping step with required validation
- `src/app/import/steps/preview-step.tsx` - Preview step with error handling and warning dialog
- `src/app/import/steps/confirm-step.tsx` - Confirm step with import execution and result display
- `src/components/import/progress-bar.tsx` - Progress bar with percentage and phase label
- `src/components/import/file-dropzone.tsx` - Drag-drop file upload with entity type selector
- `src/components/import/field-mapper.tsx` - Source-to-target field mapping table
- `src/components/import/import-preview.tsx` - 50-row preview table with red error rows and error list
- `src/components/import/warning-dialog.tsx` - AlertDialog for auto-create warnings confirmation
- `package.json` - Added papaparse and @types/papaparse

## Decisions Made
- Used Levenshtein distance with normalized scoring (0-1 range) and common suffix stripping for fuzzy org matching, with 0.85 threshold for automatic match and 0.4 for suggestions
- Auto-created entities flagged with "[Imported] Auto-created during import on [date]" in notes field
- Batch insert helper uses BATCH_SIZE=100 to chunk inserts and avoid memory issues
- importOrganizations returns consistent shape matching other import actions (warnings, autoCreated.orgs/people)
- Auto-suggest mapping normalizes column names by removing underscores/hyphens/spaces and comparing against field names and labels
- Warning dialog groups warnings by type for clear display

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed importOrganizations return type inconsistency**
- **Found during:** Task 3 (TypeScript compilation)
- **Issue:** importOrganizations returned `autoCreated: string[]` but all other import actions returned `autoCreated: { orgs: string[]; people: string[] }`
- **Fix:** Updated importOrganizations to return consistent shape with `warnings: string[]` and `autoCreated: { orgs: string[]; people: string[] }`
- **Files modified:** src/app/import/actions.ts
- **Verification:** TypeScript compiles clean
- **Committed in:** 0a896b7 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor type consistency fix. No scope creep.

## Issues Encountered
- Docker container permission error prevented npm install inside container; installed from host instead (volume-mounted node_modules shared)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Import infrastructure complete, ready for Plan 02 (CSV export) and Plan 03 (Pipedrive compatibility)
- All entity types (org, person, deal, activity) supported with consistent import patterns
- Fuzzy matching available for reuse in Pipedrive import mapping

## Self-Check: PASSED

All 17 created files verified present. All 3 task commits verified in git log.

---
*Phase: 09-import-export*
*Completed: 2026-02-28*
