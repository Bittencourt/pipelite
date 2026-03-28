---
phase: 29-run-history-observability
verified: 2026-03-28T15:00:00Z
status: passed
score: 9/9 must-haves verified
re_verification: false
---

# Phase 29: Run History & Observability Verification Report

**Phase Goal:** Users can see what happened when workflows ran -- success/failure status, per-node details, and clear error messages
**Verified:** 2026-03-28
**Status:** PASSED
**Re-verification:** No -- initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can view a list of workflow runs with status indicators and timestamps | VERIFIED | `src/app/workflows/[id]/runs/page.tsx` — server component, DB query with paginated results, RunsTable renders status badges and timestamps |
| 2 | User can filter runs by status (all/completed/failed/running/waiting/pending) | VERIFIED | `status-filter.tsx` — "use client" Select with 6 options, updates URL params, page.tsx builds conditional WHERE clause |
| 3 | Workflow overview page shows stats card with total runs, success rate, last run | VERIFIED | `run-stats-card.tsx` — single aggregate SQL query with FILTER clause; renders 3 stats in grid |
| 4 | Workflow overview page shows mini-table of 5 most recent runs | VERIFIED | `recent-runs-mini.tsx` — queries 5 runs `.limit(5)`, renders table with status badge, duration, started, and "View all runs" link |
| 5 | User can drill into a run and see per-node execution details | VERIFIED | `src/app/workflows/[id]/runs/[runId]/page.tsx` — loads run + steps + workflow nodes, builds combinedSteps, renders RunStepList |
| 6 | Each step shows input data, output data, and duration | VERIFIED | `step-detail.tsx` — renders JsonViewer for input and output, formatDuration called in trigger row |
| 7 | Failed nodes display human-readable error summary with expandable raw details | VERIFIED | `step-detail.tsx` — destructive bg error summary + nested Collapsible "Raw error details" with pre tag; run detail page shows run-level "Failed at: [Node Name]" banner |
| 8 | Skipped branch nodes appear dimmed with Skipped badge | VERIFIED | `step-detail.tsx` — isSkipped guard renders `opacity-50` div with RunStatusBadge status="skipped"; run detail page builds synthetic skipped entries from workflow.nodes diff |
| 9 | REST API returns paginated runs list and single run detail with steps inline | VERIFIED | `route.ts` exports GET with withApiAuth, paginatedResponse, optional status filter; `[runId]/route.ts` exports GET returning `{ ...serializeRun(run), steps: steps.map(serializeRunStep) }` |

**Score:** 9/9 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/api/__tests__/serialize-run.test.ts` | Test stubs for serializers | VERIFIED | 5 tests; imports from `../serialize`; passes in main codebase |
| `src/lib/workflows/__tests__/format.test.ts` | Test stubs for formatDuration | VERIFIED | 8 tests (expanded from planned 5); all pass |
| `src/app/api/v1/workflows/__tests__/runs-routes.test.ts` | Test stubs for API routes | VERIFIED | 4 tests (pagination, 404, run+steps, run 404); all pass in main codebase |
| `src/lib/api/serialize.ts` | serializeRun and serializeRunStep | VERIFIED | Both functions present (lines 178-210), full snake_case output with toIsoString for timestamps |
| `src/lib/workflows/format.ts` | formatDuration utility | VERIFIED | 16-line pure function, handles null/ms/s/m ranges correctly |
| `src/app/workflows/[id]/runs/components/run-status-badge.tsx` | RunStatusBadge with 6 statuses | VERIFIED | statusConfig map covers completed/failed/running/waiting/pending/skipped; aria-label on every Badge |
| `src/app/api/v1/workflows/[id]/runs/route.ts` | GET /api/v1/workflows/:id/runs | VERIFIED | withApiAuth, parsePagination, workflow existence check, optional status filter, paginatedResponse |
| `src/app/api/v1/workflows/[id]/runs/[runId]/route.ts` | GET /api/v1/workflows/:id/runs/:runId | VERIFIED | withApiAuth, run lookup with workflowId+runId, steps ordered by createdAt, singleResponse with steps inline |
| `src/app/workflows/[id]/page.tsx` | Workflow overview page | VERIFIED | 64 lines, auth check, DB query, RunStatsCard + RecentRunsMini rendered, edit button links to /edit |
| `src/app/workflows/[id]/runs/page.tsx` | Paginated runs list page | VERIFIED | 95 lines, auth check, DB query with optional filter, StatusFilter in Suspense, RunsTable |
| `src/app/workflows/[id]/runs/components/runs-table.tsx` | RunsTable component | VERIFIED | Exports RunsTable; renders Table with status/duration/started/completed columns; empty state; pagination |
| `src/app/workflows/[id]/runs/components/status-filter.tsx` | StatusFilter dropdown | VERIFIED | Exports StatusFilter; "use client"; 6 options; resets page param on change |
| `src/app/workflows/[id]/components/run-stats-card.tsx` | RunStatsCard with aggregate query | VERIFIED | Exports RunStatsCard; single SQL query with FILTER clause; formatRelativeTime inline helper |
| `src/app/workflows/[id]/components/recent-runs-mini.tsx` | RecentRunsMini with 5 recent runs | VERIFIED | Exports RecentRunsMini; .limit(5) query; "View all runs" link |
| `src/app/workflows/[id]/runs/[runId]/page.tsx` | Run detail page | VERIFIED | 143 lines, auth, run+workflow+steps loaded, nodeMap built, combinedSteps with skipped detection, error banner |
| `src/app/workflows/[id]/runs/[runId]/components/json-viewer.tsx` | JsonViewer collapsible | VERIFIED | Exports JsonViewer; "use client"; Collapsible with ChevronRight rotation; null guard; role=region |
| `src/app/workflows/[id]/runs/[runId]/components/step-detail.tsx` | StepDetail expandable row | VERIFIED | Exports StepDetail; "use client"; 6 status icons; opacity-50 for skipped; border-l-4 destructive for failed; error + nested "Raw error details"; JsonViewer for input/output |
| `src/app/workflows/[id]/runs/[runId]/components/run-step-list.tsx` | RunStepList vertical list | VERIFIED | Exports RunStepList and RunStep type; role="list"/"listitem"; StepDetail per step; empty state |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `runs/route.ts` | `src/lib/api/serialize.ts` | import serializeRun | WIRED | Line 6: `import { serializeRun } from "@/lib/api/serialize"` — used in `runs.map(serializeRun)` |
| `runs/[runId]/route.ts` | `src/lib/api/serialize.ts` | import serializeRun, serializeRunStep | WIRED | Line 5: both imported; used in `serializeRun(run)` and `steps.map(serializeRunStep)` |
| `runs/page.tsx` | `src/db/schema/workflows.ts` | direct DB query for runs with filter | WIRED | imports workflowRuns, builds where clause, queries in parallel |
| `[id]/page.tsx` | `run-stats-card.tsx` | import RunStatsCard | WIRED | Line 9 import, rendered at line 59 as `<RunStatsCard workflowId={id} />` |
| `src/app/workflows/page.tsx` | `/workflows/[id]` | Link href change from /edit to overview | WIRED | Line 75: `href={\`/workflows/${wf.id}\`}` — no `/edit` link present |
| `[runId]/page.tsx` | `src/db/schema/workflows.ts` | DB query for run + steps + workflow nodes | WIRED | imports workflowRuns, workflowRunSteps, workflows; queries all three |
| `run-step-list.tsx` | `step-detail.tsx` | renders StepDetail per step | WIRED | Line 1: import StepDetail; rendered inside map loop |
| `step-detail.tsx` | `json-viewer.tsx` | renders JsonViewer for input/output | WIRED | Line 11: import JsonViewer; rendered at lines 105-106 |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| EXEC-02 | 29-02-PLAN.md | User can view run history with status (success/failed/running/waiting) | SATISFIED | Runs list page at `/workflows/[id]/runs` with status badges, filter, and pagination. Note: REQUIREMENTS.md still shows `[ ]` (Pending) — discrepancy needs update |
| EXEC-03 | 29-03-PLAN.md | User can view per-node execution details (input/output/error) for each run | SATISFIED | Run detail page with RunStepList showing StepDetail per node with JsonViewer for input/output |
| EXEC-04 | 29-00-PLAN.md, 29-01-PLAN.md, 29-03-PLAN.md | User can see clear error messages on failed nodes | SATISFIED | StepDetail shows error summary in destructive bg + expandable "Raw error details"; run detail page shows "Failed at: [Node Name]" banner |
| API-03 | 29-00-PLAN.md, 29-01-PLAN.md | User can list workflow runs and view run details (including per-node results) via REST API | SATISFIED | GET /api/v1/workflows/:id/runs (paginated, filterable) + GET /api/v1/workflows/:id/runs/:runId (run + steps inline) |

**Note on EXEC-02 discrepancy:** REQUIREMENTS.md traceability table marks EXEC-02 as "Pending" (`[ ]`) while EXEC-03, EXEC-04, and API-03 are marked complete (`[x]`). The implementation is fully present in the codebase. The REQUIREMENTS.md checkbox needs to be updated to `[x]`.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `status-filter.tsx` | 46 | `placeholder="All statuses"` | Info | Not a stub — this is the Select placeholder text for accessibility; no functional impact |

No blockers or warnings found.

---

## Human Verification Required

### 1. Visual appearance of status badges and step list

**Test:** Navigate to a workflow that has completed, failed, and running runs. Open the runs list, then open a run detail.
**Expected:** Status badges are color-coded (emerald for completed, red for failed, blue for running, amber for waiting). Failed steps show a red left border. Skipped steps appear dimmed (50% opacity). JSON viewers expand and collapse smoothly.
**Why human:** Color, opacity, and animation can only be verified visually in a browser.

### 2. Status filter URL behavior

**Test:** On the runs list page, select "Failed" from the status dropdown. Then navigate back using the browser back button.
**Expected:** The filter selection persists in the URL, the page re-loads with filtered results, and the Select shows the correct selected value.
**Why human:** Client-side routing behavior and URL synchronization requires interactive testing.

### 3. Run-level error banner with node name resolution

**Test:** Find or trigger a failing workflow run where a named node fails. Open the run detail page.
**Expected:** The error banner shows "Failed at: [Human-readable node name]" (not the raw UUID) when the workflow has named nodes.
**Why human:** Requires a real workflow with node labels in the database to verify node name lookup works correctly at runtime.

---

## Gaps Summary

No gaps. All 9 observable truths verified, all 18 artifacts exist with substantive implementation, all 8 key links are wired. The only action item is updating REQUIREMENTS.md to mark EXEC-02 as `[x]` complete.

---

_Verified: 2026-03-28_
_Verifier: Claude (gsd-verifier)_
