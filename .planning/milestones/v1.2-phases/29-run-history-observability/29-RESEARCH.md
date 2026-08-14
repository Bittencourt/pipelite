# Phase 29: Run History & Observability - Research

**Researched:** 2026-03-28
**Domain:** Workflow run history UI + REST API (read-only views over existing execution data)
**Confidence:** HIGH

## Summary

Phase 29 is a **read-only presentation layer** over data that already exists in the database. The execution engine (Phase 26) and action handlers (Phase 27) already write `workflowRuns` and `workflowRunSteps` with all needed columns: status, input, output, error, timestamps. The schema has proper indexes and Drizzle relations defined. No migrations are needed.

The work decomposes into: (1) server-side data access functions for runs/steps, (2) REST API routes following the established v1 pattern, (3) run list page with status filtering and pagination, (4) run detail page with expandable step list, (5) a stats card + mini-table on the workflow detail page. All UI components use existing shadcn/ui primitives (Badge, Table, Card, Collapsible, Select).

**Primary recommendation:** Leverage the existing DB schema and API patterns exactly as-is. The JSON viewer should be a simple `<pre>` with `JSON.stringify(data, null, 2)` -- no external library needed for v1.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Both a summary on the workflow detail page AND a dedicated `/workflows/[id]/runs` page
- **D-02:** Workflow detail page shows a stats card (total runs, success rate, last run time) plus a mini-table of the 5 most recent runs, with a "View all runs" link
- **D-03:** Each run row shows: status badge (colored by success/failed/running/waiting), duration, and timestamps (started at, completed at)
- **D-04:** Status dropdown filter (all/success/failed/running/waiting) -- no date range or other filters for v1
- **D-05:** No trigger source or error preview columns in v1 -- keep it focused
- **D-06:** Vertical step list in execution order (GitHub Actions / CI pipeline style) -- each node is an expandable row
- **D-07:** Collapsible JSON tree viewer with syntax highlighting for node input/output data
- **D-08:** Duration shown per node (e.g., "245ms", "2.3s") -- no absolute timestamps per node
- **D-09:** Skipped branch nodes (from IF/ELSE) appear in the list but dimmed with a "Skipped" badge -- shows the full execution picture
- **D-10:** Node-level errors show a human-readable summary plus expandable raw error section
- **D-11:** Run-level error shows "Failed at: [Node Name]" with the summary
- **D-12:** Endpoints nested under workflow: `GET /api/v1/workflows/:id/runs` (list) and `GET /api/v1/workflows/:id/runs/:runId` (detail)
- **D-13:** Run detail response includes all steps inline -- no separate steps endpoint
- **D-14:** Offset/limit pagination matching existing API pattern (`parsePagination` + `paginatedResponse`)

### Claude's Discretion
- JSON tree viewer component choice (build simple or use a library)
- Stats card layout and which aggregate metrics to show
- Run list page pagination size (e.g., 20 per page)
- How to compute run duration (startedAt to completedAt vs sum of step durations)
- Status badge color mapping
- API response shape for runs (beyond the existing pattern)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EXEC-02 | User can view run history with status (success/failed/running/waiting) | Runs list page + RunsTable component; status filter via URL params; `workflowRuns` table has status column with index |
| EXEC-03 | User can view per-node execution details (input/output/error) for each run | Run detail page with expandable StepDetail rows; `workflowRunSteps` has input/output/error JSONB columns |
| EXEC-04 | User can see clear error messages on failed nodes | RunStatusBadge + error summary display; engine already stores human-readable errors like "Node 'X' (Label) failed: message" |
| API-03 | User can list workflow runs and view run details via REST API | `GET /api/v1/workflows/:id/runs` (list with pagination + status filter) and `GET /api/v1/workflows/:id/runs/:runId` (detail with inline steps) |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js 16 | current | App Router pages + API routes | Project framework |
| Drizzle ORM | current | DB queries for runs/steps | Project ORM, relations already defined |
| shadcn/ui | new-york preset | Badge, Table, Card, Collapsible, Select | Project UI library |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | current | Status icons (CheckCircle, XCircle, Loader, Clock, SkipForward) | Step list status indicators |
| next-intl | current | RelativeTime component for "2 hours ago" display | Stats card "Last Run" |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom JSON viewer | react-json-view-lite | Adds dependency; simple `<pre>` + JSON.stringify is sufficient for v1 |
| Server-side pagination | Client-side filtering | Server-side is correct -- runs table can grow large |

**Installation:**
No new packages needed. All dependencies already installed.

## Architecture Patterns

### Recommended Project Structure
```
src/app/workflows/[id]/
├── runs/
│   ├── page.tsx                    # Runs list page (server component)
│   ├── components/
│   │   ├── run-status-badge.tsx    # Status → colored Badge mapping
│   │   ├── runs-table.tsx          # Table with run rows
│   │   └── status-filter.tsx       # Status dropdown filter
│   └── [runId]/
│       ├── page.tsx                # Run detail page (server component)
│       └── components/
│           ├── run-step-list.tsx    # Vertical expandable step list
│           ├── step-detail.tsx      # Single step expandable row
│           └── json-viewer.tsx      # JSON display with syntax highlighting
├── components/
│   ├── run-stats-card.tsx          # Stats card for workflow detail page
│   └── recent-runs-mini.tsx        # Mini-table (5 recent runs)
src/app/api/v1/workflows/[id]/
├── runs/
│   ├── route.ts                    # GET list (paginated, filterable)
│   └── [runId]/
│       └── route.ts                # GET detail (with inline steps)
src/lib/api/
└── serialize.ts                    # Add serializeRun + serializeRunStep
```

### Pattern 1: Server Component Data Fetching
**What:** Run list and detail pages are server components that query DB directly
**When to use:** All pages in this phase are read-only -- no client interactivity needed for data fetching
**Example:**
```typescript
// src/app/workflows/[id]/runs/page.tsx
export default async function RunsPage({ params, searchParams }: Props) {
  const { id } = await params
  const sp = await searchParams
  const status = sp.status || undefined
  const page = parseInt(sp.page || "1", 10)
  const limit = 20
  const offset = (page - 1) * limit

  const whereClause = status
    ? and(eq(workflowRuns.workflowId, id), eq(workflowRuns.status, status))
    : eq(workflowRuns.workflowId, id)

  const [runs, [{ total }]] = await Promise.all([
    db.select().from(workflowRuns)
      .where(whereClause)
      .orderBy(desc(workflowRuns.createdAt))
      .offset(offset).limit(limit),
    db.select({ total: count() }).from(workflowRuns).where(whereClause),
  ])

  return <RunsTable runs={runs} total={total} page={page} limit={limit} />
}
```

### Pattern 2: URL-Based Filtering (Server-Side)
**What:** Status filter updates URL search params, page re-renders server-side
**When to use:** The status filter and pagination controls
**Example:**
```typescript
// status-filter.tsx (client component)
"use client"
import { useRouter, useSearchParams } from "next/navigation"

export function StatusFilter({ workflowId }: { workflowId: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function onStatusChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === "all") params.delete("status")
    else params.set("status", value)
    params.delete("page") // reset to page 1
    router.push(`/workflows/${workflowId}/runs?${params.toString()}`)
  }
  // ...
}
```

### Pattern 3: REST API Route Following Existing Pattern
**What:** API routes use `withApiAuth`, `parsePagination`, `paginatedResponse`
**When to use:** Both new API endpoints
**Example:**
```typescript
// src/app/api/v1/workflows/[id]/runs/route.ts
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req, context) => {
    const { id } = await params
    const { offset, limit } = parsePagination(req)
    const status = req.nextUrl.searchParams.get("status") || undefined

    // Verify workflow exists
    const workflow = await getWorkflow(id)
    if (!workflow) return Problems.notFound("Workflow")

    // Query with optional status filter
    const whereClause = status
      ? and(eq(workflowRuns.workflowId, id), eq(workflowRuns.status, status))
      : eq(workflowRuns.workflowId, id)

    const [runs, [{ total }]] = await Promise.all([
      db.select().from(workflowRuns)
        .where(whereClause)
        .orderBy(desc(workflowRuns.createdAt))
        .offset(offset).limit(limit),
      db.select({ total: count() }).from(workflowRuns).where(whereClause),
    ])

    return paginatedResponse(runs.map(serializeRun), total, offset, limit)
  })
}
```

### Pattern 4: Duration Formatting
**What:** Compute duration from `startedAt` to `completedAt`, format human-readably
**When to use:** Run rows and step rows
**Recommendation:** Use `startedAt` to `completedAt` (wall-clock time), not sum of step durations. This is simpler and more accurate.
**Example:**
```typescript
export function formatDuration(startedAt: Date | null, completedAt: Date | null): string {
  if (!startedAt) return "---"
  const end = completedAt || new Date()
  const ms = end.getTime() - startedAt.getTime()
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${mins}m ${secs}s`
}
```

### Anti-Patterns to Avoid
- **Client-side data fetching for initial load:** These are server components -- fetch in the component, no useEffect/SWR needed
- **Fetching all runs to filter client-side:** Use DB-level WHERE clause for status filter
- **Separate API call for step count on list page:** Not needed per D-05; only show status/duration/timestamps
- **Nested conditions in step ordering:** v1 has no nested conditions (per Phase 26 decision); steps can be ordered by createdAt

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pagination | Custom offset/limit logic | `parsePagination` + `paginatedResponse` | Already exists and tested |
| API auth | Custom auth check | `withApiAuth` wrapper | Consistent with all v1 endpoints |
| Status badges | Manual color mapping per-use | `RunStatusBadge` component (create once) | Reused in run list, mini-table, and detail page |
| Relative time | Custom time formatting | `<RelativeTime>` component | Already exists in `src/components/ui/relative-time.tsx` |
| JSON display | Custom tree viewer | `<pre>` + `JSON.stringify(data, null, 2)` with syntax highlighting via CSS | D-07 says collapsible JSON tree; a simple pre with collapsible sections is sufficient |

**Key insight:** This phase is entirely read-only views over existing data. The schema, indexes, and relations are all in place. Focus on presentation, not data modeling.

## Common Pitfalls

### Pitfall 1: Node Label Resolution for Error Messages
**What goes wrong:** The `workflowRunSteps` table stores `nodeId` but not the node label. The run-level `error` field stores `"Node 'nodeId' (Label) failed: message"` but parsing that string is fragile.
**Why it happens:** Steps only store `nodeId`; labels live in `workflows.nodes` JSONB.
**How to avoid:** When rendering run detail, load the workflow's nodes to build a `nodeId -> label` map. For the run list "Failed at: [Node Name]" pattern, parse `currentNodeId` from the run and look up the label from the workflow.
**Warning signs:** Showing raw UUIDs instead of human-readable node names.

### Pitfall 2: Skipped Steps Not in DB
**What goes wrong:** Per D-09, skipped branch nodes should appear dimmed. But the execution engine only creates step records for nodes it actually executes -- skipped branches have no `workflowRunSteps` rows.
**Why it happens:** The engine walks only the matched branch; nodes in the unmatched branch never get step records.
**How to avoid:** For the run detail view, compare the workflow's full node list against the step records. Nodes without corresponding steps that are in the non-taken branch of a condition should be displayed as "Skipped". This requires loading the workflow definition alongside the run steps.
**Warning signs:** Missing nodes in the step list, or no "Skipped" badges appearing.

### Pitfall 3: Stats Card N+1 Queries
**What goes wrong:** Computing total runs, success rate, and last run time with 3 separate queries.
**Why it happens:** Natural to fetch each stat independently.
**How to avoid:** Use a single aggregate query:
```sql
SELECT
  count(*) as total,
  count(*) FILTER (WHERE status = 'completed') as completed,
  max(started_at) as last_run
FROM workflow_runs WHERE workflow_id = ?
```
In Drizzle: use `sql` template for the filter expression.

### Pitfall 4: Hydration Mismatch on Timestamps
**What goes wrong:** Server renders absolute time, client shows relative time -- React hydration error.
**Why it happens:** Relative time depends on `Date.now()` which differs between server and client.
**How to avoid:** The existing `RelativeTime` component already handles this with `suppressHydrationWarning` and a `mounted` state check. Use it for all relative timestamps. For absolute timestamps in the table, format server-side with `toLocaleDateString()`.

### Pitfall 5: Empty Workflow Detail Page
**What goes wrong:** The workflow detail page (`/workflows/[id]/`) does not exist yet -- currently, clicking a workflow goes directly to `/workflows/[id]/edit`.
**Why it happens:** Phase 28 only built the editor. There is no separate workflow detail/overview page.
**How to avoid:** Either (a) create a new `/workflows/[id]/page.tsx` as a workflow overview with the stats card, or (b) add the stats card to the existing workflow list page per-workflow. Option (a) is more aligned with D-01/D-02 and provides a natural home for the stats card + mini-table. The workflow list link should be updated to point to `/workflows/[id]` (overview) instead of `/workflows/[id]/edit`.

## Code Examples

### Serializer for Runs (following existing serialize.ts pattern)
```typescript
// Add to src/lib/api/serialize.ts
export function serializeRun(run: WorkflowRun) {
  return {
    id: run.id,
    workflow_id: run.workflowId,
    status: run.status,
    trigger_data: run.triggerData,
    error: run.error,
    depth: run.depth,
    current_node_id: run.currentNodeId,
    started_at: toIsoString(run.startedAt),
    completed_at: toIsoString(run.completedAt),
    created_at: toIsoString(run.createdAt),
  }
}

export function serializeRunStep(step: WorkflowRunStep) {
  return {
    id: step.id,
    run_id: step.runId,
    node_id: step.nodeId,
    status: step.status,
    input: step.input,
    output: step.output,
    error: step.error,
    resume_at: toIsoString(step.resumeAt),
    started_at: toIsoString(step.startedAt),
    completed_at: toIsoString(step.completedAt),
    created_at: toIsoString(step.createdAt),
  }
}
```

### Run Detail API Response Shape
```typescript
// GET /api/v1/workflows/:id/runs/:runId
{
  data: {
    id: "uuid",
    workflow_id: "uuid",
    status: "failed",
    error: "Node 'abc' (Send Email) failed: HTTP request failed: 404 Not Found",
    trigger_data: { ... },
    started_at: "2026-03-28T14:30:22.000Z",
    completed_at: "2026-03-28T14:30:24.300Z",
    created_at: "2026-03-28T14:30:22.000Z",
    steps: [
      {
        id: "uuid",
        node_id: "node-1",
        status: "completed",
        input: { ... },
        output: { ... },
        error: null,
        started_at: "...",
        completed_at: "...",
      },
      // ...
    ]
  }
}
```

### RunStatusBadge Component
```typescript
// Source: UI-SPEC.md status badge color map
const STATUS_CONFIG = {
  completed: { label: "Completed", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" },
  failed:    { label: "Failed",    variant: "destructive" as const },
  running:   { label: "Running",   className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400" },
  waiting:   { label: "Waiting",   className: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
  pending:   { label: "Pending",   variant: "secondary" as const },
  skipped:   { label: "Skipped",   variant: "outline" as const },
} as const
```

### Aggregate Stats Query
```typescript
import { sql, eq } from "drizzle-orm"

const [stats] = await db
  .select({
    total: count(),
    completed: sql<number>`count(*) filter (where ${workflowRuns.status} = 'completed')`,
    lastRunAt: sql<Date | null>`max(${workflowRuns.startedAt})`,
  })
  .from(workflowRuns)
  .where(eq(workflowRuns.workflowId, workflowId))
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Client-side pagination (fetch all, slice) | Server-side offset/limit | Project standard | Must use server-side for runs (can grow unbounded) |
| Pages Router API routes | App Router route handlers | Next.js 13+ | Use `route.ts` with `{ params: Promise<> }` pattern |

**Nothing deprecated** applies to this phase. All patterns are current and established in the codebase.

## Open Questions

1. **Workflow detail page doesn't exist yet**
   - What we know: Currently `/workflows/[id]/` has no `page.tsx` -- only the `/edit` subdirectory exists
   - What's unclear: Should we create a full workflow overview page, or add the stats card elsewhere?
   - Recommendation: Create `/workflows/[id]/page.tsx` as a lightweight overview (name, description, active status, stats card, mini-table, link to editor). Update workflow list links to point here instead of directly to edit.

2. **Step ordering for display**
   - What we know: Steps are created as the engine walks the graph, so `createdAt` ordering matches execution order
   - What's unclear: For branches, the true-branch steps come before false-branch steps (since false branch is never executed). Skipped nodes need synthetic entries.
   - Recommendation: Order steps by `createdAt` ASC, then inject synthetic "skipped" entries for unmatched branch nodes by comparing workflow node list vs executed steps.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXEC-02 | Run list query with status filter | unit | `npx vitest run src/app/workflows/[id]/runs/ -x` | No -- Wave 0 |
| EXEC-03 | Run detail with steps inline | unit | `npx vitest run src/app/workflows/[id]/runs/ -x` | No -- Wave 0 |
| EXEC-04 | Error message extraction + display | unit | `npx vitest run src/app/workflows/[id]/runs/ -x` | No -- Wave 0 |
| API-03 | REST API runs list + detail endpoints | unit | `npx vitest run src/app/api/v1/workflows/ -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before verification

### Wave 0 Gaps
- [ ] `src/lib/api/__tests__/serialize-run.test.ts` -- covers serializeRun/serializeRunStep
- [ ] Duration formatter utility test -- covers formatDuration edge cases (null dates, sub-second, minutes)
- [ ] API route tests for runs list and detail -- covers EXEC-02, API-03

## Sources

### Primary (HIGH confidence)
- `src/db/schema/workflows.ts` -- Complete schema for workflowRuns (status, error, timestamps) and workflowRunSteps (nodeId, input, output, error, timestamps)
- `src/db/schema/_relations.ts` -- Relations: workflows -> runs -> steps already defined
- `src/lib/api/pagination.ts` -- parsePagination helper (offset/limit)
- `src/lib/api/response.ts` -- paginatedResponse, singleResponse helpers
- `src/lib/api/errors.ts` -- Problems.notFound, Problems.validation
- `src/lib/api/serialize.ts` -- serializeWorkflow pattern to follow
- `src/app/api/v1/workflows/[id]/route.ts` -- Existing API pattern (withApiAuth, params Promise)
- `src/app/api/v1/people/route.ts` -- Reference list endpoint with pagination
- `src/lib/execution/engine.ts` -- How runs/steps are created and updated
- `src/lib/execution/types.ts` -- WorkflowNode type definition
- `.planning/phases/29-run-history-observability/29-UI-SPEC.md` -- Approved UI design contract

### Secondary (MEDIUM confidence)
- None needed -- all relevant code is directly in the codebase

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use, no new dependencies
- Architecture: HIGH - follows established patterns exactly (API routes, server components, shadcn/ui)
- Pitfalls: HIGH - identified from direct code reading (skipped steps gap, node label resolution, missing detail page)

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable -- no external dependencies changing)
