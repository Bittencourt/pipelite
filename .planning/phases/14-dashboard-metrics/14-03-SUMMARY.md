---
phase: 14-dashboard-metrics
plan: "03"
subsystem: home-page
tags: [dashboard, metrics, server-component, next-intl, recharts]
dependency_graph:
  requires:
    - "14-01"
    - "14-02"
  provides:
    - "authenticated home page with sales metrics dashboard"
  affects:
    - "src/app/page.tsx"
tech_stack:
  added: []
  patterns:
    - "URL search param period filter with server-rendered active state"
    - "Promise.all parallel data fetching in server component"
    - "Inline period selector Links styled as button tabs"
key_files:
  created: []
  modified:
    - path: "src/app/page.tsx"
      description: "Rewrote authenticated branch to render 4 stat cards, pipeline chart, activity donut chart, and period selector"
decisions:
  - "[14-03] Period selector rendered as inline <Link> elements styled conditionally — no client component needed since active state comes from server-rendered searchParam"
  - "[14-03] Quick Access section heading reused t('organizations') key — acceptable given no dedicated heading translation key exists"
metrics:
  duration: "2min"
  completed_date: "2026-03-07"
  tasks_completed: 1
  files_modified: 1
---

# Phase 14 Plan 03: Home Page Sales Dashboard Summary

Rewrote the authenticated home page to show a real sales dashboard — four metric stat cards, a horizontal pipeline value bar chart, an activity completion donut chart, and a URL-param-driven time period filter (This Month / This Quarter / Last 30 Days / All Time).

## What Was Built

- **`src/app/page.tsx`** — Fully rewritten authenticated branch:
  - `searchParams` parsed for `period` URL param, validated against `DateFilter` type, defaulted to `thisMonth`
  - `Promise.all` fetches all four metrics in parallel: `getWinRateMetrics`, `getDealVelocityMetrics`, `getPipelineValueByStage`, `getActivityCompletionMetrics`
  - **Win Rate card** — percentage with won/lost subtitle or "no data" message
  - **Deal Velocity card** — avg days to close with deal count subtitle
  - **Pipeline Value card** — total formatted via `formatCurrency` with open stage count subtitle
  - **Activity Completion card** — completion percentage with completed/total subtitle
  - **PipelineValueChart** — full-width horizontal bar chart per stage (from 14-02)
  - **ActivityCompletionChart** — donut chart with center percentage overlay (from 14-02)
  - **Overdue card** — count in destructive red with link to /activities
  - **Period selector** — 4 `<Link href="?period=X">` buttons styled with active state from server-rendered searchParam
  - **Quick nav links** — preserved from original (organizations, people, deals, activities)
  - **Admin link** — preserved, moved to a less prominent position below quick nav
  - Guest landing page (unauthenticated branch) unchanged

## Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Rewrite home page with metrics dashboard | 2019d6c |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `src/app/page.tsx` — confirmed written (238 insertions)
- Commit 2019d6c — confirmed in git log
- TypeScript: `npx tsc --noEmit` — no errors
- Docker app: `curl http://localhost:3001/` — returns 200
