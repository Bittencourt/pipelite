---
phase: 14-dashboard-metrics
plan: 01
subsystem: ui
tags: [recharts, shadcn, dashboard, drizzle, date-fns, i18n]

# Dependency graph
requires:
  - phase: 05-deals-kanban
    provides: deals schema with stageId, value, createdAt, updatedAt, deletedAt
  - phase: 04-pipelines-stages
    provides: stages schema with type (open/won/lost), color, position
  - phase: 06-activities
    provides: activities schema with dueDate, completedAt, deletedAt
  - phase: 12-localization
    provides: next-intl locale files in src/messages/*.json
provides:
  - shadcn chart component (ChartContainer, ChartTooltip, ChartTooltipContent) via recharts
  - getWinRateMetrics: win/lost deal counts with date filter
  - getDealVelocityMetrics: avg days to close won deals
  - getPipelineValueByStage: open pipeline value grouped by stage
  - getActivityCompletionMetrics: completed/total/overdue with rate
  - DateFilter type and getDateRange helper
  - home.metrics translation keys in en-US, pt-BR, es-ES (21 keys each)
affects:
  - 14-02 (metric card UI components that consume these queries)
  - 14-03 (dashboard page that assembles metric cards)

# Tech tracking
tech-stack:
  added:
    - recharts ^2.15.4 (via shadcn chart add)
  patterns:
    - DateFilter union type with getDateRange helper for consistent period filtering
    - inArray() for multi-value enum filtering in drizzle-orm
    - Promise.all for parallel count queries in activity metrics
    - parseFloat(r.totalValue ?? '0') for drizzle sum() string coercion

key-files:
  created:
    - src/components/ui/chart.tsx
    - src/lib/dashboard-queries.ts
  modified:
    - src/components/ui/card.tsx
    - src/messages/en-US.json
    - src/messages/pt-BR.json
    - src/messages/es-ES.json
    - package.json
    - package-lock.json

key-decisions:
  - "recharts installed via shadcn CLI (not manually) to ensure correct CSS variable theming"
  - "updatedAt used as proxy for deal close date — deals table has no closedAt column"
  - "Win rate rate field returns null (not 0) when total=0 to distinguish 'no data' from '0%'"
  - "getPipelineValueByStage has no date filter — shows current open pipeline snapshot"
  - "Activity overdue count uses all-time query (no date range), completed/total use period filter"
  - "sum() drizzle result coerced with parseFloat(r ?? '0') — SQL SUM returns string|null"

patterns-established:
  - "DateFilter + getDateRange pattern: reusable across all metric queries"
  - "null rate/avgDays to signal no-data state (UI can show 'No data' instead of '0%')"

# Metrics
duration: 2min
completed: 2026-03-06
---

# Phase 14 Plan 01: Dashboard Infrastructure Summary

**shadcn chart component (recharts), four SQL metric query functions, and 21-key translation namespace for win rate, deal velocity, pipeline value, and activity completion dashboard**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-06T19:40:42Z
- **Completed:** 2026-03-06T19:42:52Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Installed shadcn chart component via CLI — `src/components/ui/chart.tsx` exports `ChartContainer`, `ChartTooltip`, `ChartTooltipContent` backed by recharts
- Created `src/lib/dashboard-queries.ts` with all four metric query functions, `DateFilter` type, and `getDateRange` helper — TypeScript compiles cleanly
- Added `home.metrics` namespace with 21 keys to en-US, pt-BR, and es-ES locale files

## Task Commits

Each task was committed atomically:

1. **Task 1: Install shadcn chart component** - `697d0fb` (chore)
2. **Task 2: Create dashboard query library** - `3b66bed` (feat)
3. **Task 3: Add metric translation strings** - `c27d8e2` (feat)

## Files Created/Modified

- `src/components/ui/chart.tsx` - shadcn chart component: ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig types
- `src/lib/dashboard-queries.ts` - All four metric queries plus DateFilter type and getDateRange helper
- `src/components/ui/card.tsx` - Updated by shadcn CLI as dependency
- `src/messages/en-US.json` - Added home.metrics namespace (21 keys)
- `src/messages/pt-BR.json` - Added home.metrics namespace (21 keys, Portuguese)
- `src/messages/es-ES.json` - Added home.metrics namespace (21 keys, Spanish)
- `package.json` / `package-lock.json` - Added recharts ^2.15.4

## Decisions Made

- shadcn CLI used (not manual) to generate chart.tsx — ensures correct CSS variable theming consistent with project's other shadcn components
- `updatedAt` is the proxy for deal close date since the deals table has no `closedAt` column (per RESEARCH.md guidance)
- `rate` and `avgDays` return `null` rather than `0` when no data exists, enabling the UI to distinguish "no data" from "actually 0%"
- `getPipelineValueByStage` intentionally has no date filter — it shows the current open pipeline snapshot, not historical data
- Activity `overdue` count is all-time (no date filter); `completed` and `total` respect the selected period
- drizzle `sum()` returns `string | null` — all sum results use `parseFloat(r.totalValue ?? '0')` coercion

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

The `npx shadcn@latest add chart --yes` command prompted interactively about overwriting `card.tsx`. Resolved by piping `echo "y"` to the command. The `--yes` flag suppresses the initial confirmation but not the file-overwrite prompts.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `src/components/ui/chart.tsx` importable as `@/components/ui/chart`
- All four query functions exportable from `@/lib/dashboard-queries`
- Translation strings available under `home.metrics.*` namespace
- Ready for Phase 14 Plan 02: metric card UI components

## Self-Check: PASSED

All created files exist on disk. All task commits verified in git log.

---
*Phase: 14-dashboard-metrics*
*Completed: 2026-03-06*
