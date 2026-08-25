# Phase 41: Workflow Operator Affordances - Pattern Map

**Mapped:** 2026-08-22
**Files analyzed:** 36 (14 new including the migration, 22 modified)
**Analogs found:** 33 / 36
**Anchored on:** `41-CONTEXT.md` (16 decisions + amendments A1-A4), `41-RESEARCH.md`, `41-UI-SPEC.md` § Surface Inventory, `41-VALIDATION.md` § Wave 0

---

## How to read this file

Every excerpt below was read from source this session. **Line numbers are as-read today** — research C-3
already recorded that four UI-SPEC line references had drifted, so treat a line number as a locator and
the *class string / identifier* as the contract. Source-scan gates must key on strings, never on lines.

Three answers up front, because they change plan risk:

1. **There IS a polling analog.** `src/app/duplicates/scan-panel.tsx` is a `"use client"` component that
   fires a server action, then polls a read-only status action on a `setInterval` until a terminal status,
   with a documented list of the ways its own predecessor (`progress-step.tsx`) got it wrong. The dry-run
   dialog's "owns the wait" requirement is not new ground in this repo. **Risk: LOW, not HIGH.**
2. **There IS an exact analog for the NOT NULL + default ALTER on a populated table** —
   `drizzle/0010_pale_rocket_raccoon.sql:3` added `depth integer DEFAULT 0 NOT NULL` to
   `workflow_runs` itself. Same table, same shape.
3. **There is NO insert-and-revalidate server action that returns the new row's id AND revalidates.**
   `createWebhook` inserts + revalidates but is admin-gated; `triggerManualRun` creates a run and returns
   its id but is a lib function with no `revalidatePath`. The replay action is a **composition of two
   existing halves**, named per-half below.

---

## File Classification

### New files

| New file | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src/app/workflows/[id]/runs/[runId]/components/replay-run-button.tsx` | component (client) | request-response | `src/app/workflows/delete-workflow-dialog.tsx` + `src/app/admin/webhooks/[id]/delivery-table.tsx` | exact (composite) |
| `src/app/workflows/[id]/edit/components/dry-run-dialog.tsx` | component (client) | request-response + poll | `src/app/duplicates/scan-panel.tsx` | role-match (strong) |
| `src/app/workflows/[id]/runs/components/dry-run-badge.tsx` | component (server-safe) | presentational | `src/app/workflows/[id]/runs/components/run-status-badge.tsx` | exact |
| `src/lib/workflows/runs-filter.ts` | utility (pure) | transform | `src/lib/views/url-params.ts` | exact |
| `src/lib/workflows/replay.ts` *(implied — see note)* | utility (pure) | transform | `src/lib/views/url-params.ts` narrowers | role-match |
| `src/lib/execution/failure-alert.ts` | service | event-driven | `src/app/api/internal/email/process/route.ts` `processActivityReminders` | role-match (strong) |
| `src/lib/email/templates/workflow-failed.ts` | utility (template) | transform | `src/lib/email/templates/activity-reminder.ts` | exact |
| `drizzle/0019_<generated>.sql` | migration | schema | `drizzle/0010_pale_rocket_raccoon.sql` | exact |
| `src/lib/workflows/__tests__/runs-filter.test.ts` | test (unit) | pure | `src/lib/views/__tests__/url-params.test.ts` | exact |
| `src/lib/workflows/__tests__/replay.test.ts` | test (unit) | pure | same | exact |
| `src/lib/execution/__tests__/failure-alert.test.ts` | test (unit) | mocked-db | `src/lib/execution/execution-processor.test.ts` | exact |
| `src/db/schema/__tests__/workflow-runs-columns.test.ts` | test (schema) | structural | `src/db/schema/saved-views.test.ts` | exact |
| `src/app/workflows/[id]/runs/[runId]/__tests__/replay-visibility.test.ts` | test (source-scan) | structural | `src/components/views/__tests__/manage-views-dialog-wiring.test.ts` | exact |
| `src/app/workflows/__tests__/responsive-containers.test.ts` | test (source-scan) | structural | `src/components/views/__tests__/responsive-classes.test.ts` | exact |

**Note on `src/lib/workflows/replay.ts`:** VALIDATION Wave 0 names `__tests__/replay.test.ts` but no
module. RESEARCH § TDD applicability lists *"Replay run-input construction + 'failed only' predicate |
Pure functions once extracted"*. The planner must create the module or the test has nothing to import.
Same seam as `runs-filter.ts`.

**Two directory conventions collide — the planner must pick and say so:**
- `src/lib/execution/` tests are **colocated** (`engine.test.ts`, `execution-processor.test.ts`,
  `recursion.test.ts`); only `src/lib/execution/actions/__tests__/` uses a `__tests__` dir.
  VALIDATION asks for `src/lib/execution/__tests__/failure-alert.test.ts` — a **new directory**.
- `src/db/schema/` tests are **colocated** (`saved-views.test.ts` is the only one).
  VALIDATION asks for `src/db/schema/__tests__/workflow-runs-columns.test.ts` — a **new directory**.
- Both VALIDATION paths are fine (vitest include is glob-based); just record the choice so a reviewer
  does not "fix" it. Also note `src/lib/workflows/` already has BOTH `format.test.ts` and
  `__tests__/format.test.ts` — a pre-existing duplication, not a convention to copy.

### Modified files

| Modified file | Role | Data Flow | Pattern source for the edit |
|---|---|---|---|
| `src/db/schema/workflows.ts` | model | schema | its own `depth` column (`:43`) + `activities.reminderSentAt` |
| `src/db/schema/notification-preferences.ts` | model | schema | its own three `email_*` siblings (`:6-8`) |
| `src/lib/execution/types.ts` | model | — | its own `_workflowUserId` (`:92-93`) |
| `src/lib/triggers/create-run.ts` | service | CRUD | its own two `.values({…})` blocks (`:25-32`, `:40-45`) |
| `src/lib/execution/engine.ts` | service | event-driven | its own `_workflowUserId` assignment + both delay branches |
| `src/lib/execution/execution-processor.ts` | service | batch/poll | its own `reclaimStaleRuns` `RETURNING id` + `claimWorkflowRun` guard |
| `src/lib/execution/actions/{crm,email,http,notification,webhook-response}.ts` | service | transform | each other — gate immediately before the side effect |
| `src/lib/email/templates/index.ts` | config (barrel) | — | its own 10 export lines |
| `src/app/workflows/actions.ts` | controller (server action) | CRUD | its own `createWorkflow` (`:22-49`) + `getHttpTemplates` (`:237-241`) |
| `src/app/workflows/[id]/runs/[runId]/page.tsx` | component (RSC) | request-response | its own `{run.status === "failed" && (` at `:160` |
| `src/app/workflows/[id]/runs/page.tsx` | component (RSC) | CRUD | its own `whereClause` (`:45-47`) |
| `src/app/workflows/[id]/runs/components/status-filter.tsx` | component (client) | request-response | its own `handleChange` (`:30-41`) |
| `src/app/workflows/[id]/runs/components/runs-table.tsx` | component (RSC) | presentational | its own Status cell `flex flex-col gap-1` (`:66`) |
| `src/app/workflows/[id]/components/recent-runs-mini.tsx` | component (RSC) | CRUD | its own `where` (`:34`) — **query-only, see A7** |
| `src/app/workflows/[id]/edit/components/toolbar.tsx` | component (client) | request-response | its own Export/Import buttons (`:169-189`) |
| `src/app/settings/notifications/notification-form.tsx` | component (client) | request-response | its own three rows (`:38-84`) |
| `src/app/settings/notifications/actions.ts` | controller (server action) | CRUD | its own 4 spots (`:10-22`, `:42-46`, `:67-81`) |
| `src/messages/{en-US,pt-BR,es-ES}.json` | config | — | existing namespace shape |
| `src/messages/locale-parity.test.ts` | test | structural | `REQUIRED_VIEWS_KEYS` block (`:618-703`) + contract assertion (`:1093-1101`) |
| `src/lib/execution/{engine,execution-processor,recursion}.test.ts`, `actions/__tests__/*.test.ts`, `src/lib/triggers/create-run.test.ts` | test | unit | their own existing mock headers |
| `docs/admin/deployment/{docker,vercel}.md` | docs | — | their own `## Limitations and Workarounds` / `## Production Considerations` |

---

## Pattern Assignments

### 1. `src/app/workflows/actions.ts` — `replayWorkflowRun` (server action, CRUD)

**Analogs:** `src/app/admin/webhooks/actions.ts:90-108` (`replayDelivery` — the named precedent),
`src/app/admin/webhooks/actions.ts:25-51` (`createWebhook` — the insert-and-revalidate half),
`src/app/workflows/actions.ts:22-49` (`createWorkflow` — the auth posture and return shape actually to copy),
`src/lib/triggers/manual-trigger.ts:25-61` (the create-a-run half).

**The precedent, and exactly which half to take** (`admin/webhooks/actions.ts:90-108`):

```ts
export async function replayDelivery(deliveryId: string) {
  const session = await auth()
  if (!session?.user || session.user.role !== "admin") {
    return { success: false, error: "Unauthorized: Admin access required" }
  }

  await db
    .update(webhookDeliveries)                      // <-- RESET. Do NOT copy this.
    .set({ status: "pending", retryCount: 0, nextAttemptAt: new Date(), updatedAt: new Date() })
    .where(eq(webhookDeliveries.id, deliveryId))

  revalidatePath("/admin/webhooks")                 // <-- COPY this.
  return { success: true, id: deliveryId }          // <-- COPY this shape.
}
```

Take: the `revalidatePath` + `{ success, id }` return. **Reject:** the `.update()` reset and the admin gate.

**The auth gate to copy instead** (`src/app/workflows/actions.ts:28-32`) — session-only, per Pitfall 5:

```ts
const session = await auth()

if (!session?.user?.id) {
  return { success: false, error: "Not authenticated" }
}
```

**The insert-and-revalidate shape** (`admin/webhooks/actions.ts:38-50`) — note `.returning({ id })`
then `revalidatePath` then return the new id. This is the only place in the repo that does all three:

```ts
const [webhook] = await db
  .insert(webhooks)
  .values({ /* … */ })
  .returning({ id: webhooks.id })

revalidatePath("/admin/webhooks")
return { success: true, id: webhook.id, secret }
```

**But do NOT hand-roll the insert** — RESEARCH § Don't Hand-Roll. Use `createWorkflowRun`, which owns the
recursion short-circuit. The envelope-then-create shape to copy (`manual-trigger.ts:46-60`):

```ts
const envelope: TriggerEnvelope = {
  trigger_type: "manual",
  trigger_id: "manual",
  timestamp: new Date().toISOString(),
  data: { triggeredBy: userId, /* … */ },
}

const run = await createWorkflowRun(workflowId, envelope)

return { success: true, runId: run.id }
```

**Scope the origin lookup by BOTH ids** — the run-detail page's own predicate
(`runs/[runId]/page.tsx:32`), which is the enumeration control from § Security Domain:

```ts
.where(and(eq(workflowRuns.id, runId), eq(workflowRuns.workflowId, id)))
```

**Do NOT copy `triggerManualRun`'s active check** (`manual-trigger.ts:38-44`) into `startDryRun` — Pitfall 8.

**Result-type naming idiom for three new actions** (`src/app/duplicates/actions.ts:117-127`) — named
aliases so every signature reads `): Promise<XResult> {`, which keeps the source gates' brace finders simple:

```ts
export type StartScanResult = DedupActionResult<{ scanId: string }>
export type ScanProgressResult = DedupActionResult<{ scan: ScanProgressPayload | null }>
```

---

### 2. `src/app/workflows/actions.ts` — `getWorkflowRunStatus` (server action, read-only poll target)

**Analogs:** `src/app/duplicates/actions.ts:282-319` (`getScanProgress` — the poll target, exact),
`src/app/workflows/actions.ts:237-241` (`getHttpTemplates` — the minimal read-only action in the file being edited).

**The minimal read-only action already in this file** (`workflows/actions.ts:237-241`):

```ts
export async function getHttpTemplates(): Promise<HttpTemplateRecord[]> {
  const session = await auth()
  if (!session?.user?.id) return []
  return listHttpTemplates()
}
```

**The poll target, with the two properties the dry-run dialog depends on** (`duplicates/actions.ts:282-319`):

```ts
/**
 * NEVER THROWS AND NEVER 500s — … a `null` scan is a legal answer here rather than an error:
 * the reaper … may have removed a stranded row, and the poller must be able to stop rather
 * than retry forever.
 *
 * … the role check comes before the lookup: a non-admin learns `NOT_ADMIN` after zero
 * database reads, whatever id they send.
 */
export async function getScanProgress(scanId: string): Promise<ScanProgressResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, code: "NOT_AUTHENTICATED" }
  // … id narrowing …
  const scan = await getScanState(id)
  if (!scan) return { success: true, scan: null }   // absent row is SUCCESS, not an error
  return { success: true, scan: { /* flat, serialisable payload */ } }
}
```

Copy: gate before lookup; absent row is `{ success: true, <thing>: null }`; the payload is flat and
serialisable (`startedAt: scan.startedAt.toISOString()`), never a `Date` across the boundary.
Adapt: session-only (not admin), and return `{ success: true, status, dryRun }`.

---

### 3. `src/app/workflows/[id]/edit/components/dry-run-dialog.tsx` (client component, submit-then-poll)

**Analog:** `src/app/duplicates/scan-panel.tsx` — a `"use client"` component that starts a job via a
server action, then polls a read-only action to a terminal status. **This is the closest existing
polling/transition pattern and it is a strong one.** Its own header names the earlier analog it fixed
(`src/app/admin/import/pipedrive-api/steps/progress-step.tsx:26-46`) and lists its defects.

**Imports pattern** (`scan-panel.tsx`, after the header):

```tsx
"use client"

import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
import { useEffect, useState, useTransition, type ReactNode } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
// …
import { cancelDuplicateScan, getScanProgress, startDuplicateScan, type ScanProgressPayload } from "./actions"
```

**Poll cadence + terminal-status constants — declared, commented, module-level:**

```ts
/** One second, the same cadence as the importer's poll. */
const SCAN_POLL_INTERVAL_MS = 1000

/** How many consecutive "no such scan" answers are tolerated before the panel gives up. */
const MAX_MISSING_POLLS = 5

const TERMINAL_STATUSES: readonly ScanStatus[] = ["completed", "cancelled", "error"]

function isTerminal(status: ScanStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}
```

For phase 41 the equivalents are: a 1000ms interval, a 30s budget (UI-SPEC: `dryRun.timeout` at 30s),
and `TERMINAL_STATUSES = ["completed", "failed"]` — note `cancelled` is not a `WorkflowStatus`
(`workflows.ts:29`), and `waiting` is NOT terminal (it is the delay case A2 removes).

**The poll loop — copy this whole shape, including both stops:**

```tsx
/**
 * Deriving it during render rather than storing it is what keeps the effect's dependency honest: a
 * terminal status turns this to `null`, the effect re-runs, its cleanup clears the interval, and no
 * further request is made. That is the SECOND of the two stops — the first is inside the poll
 * callback — and the reason there are two is that the analog's equivalent effect stops nothing.
 */
const pollScanId = scan !== null && !isTerminal(scan.status) ? scan.scanId : null

useEffect(() => {
  if (pollScanId === null) return

  let mounted = true
  let missing = 0

  const poll = async () => {
    const result = await getScanProgress(pollScanId)
    if (!mounted) return

    if (!result.success) {
      // A refusal will be refused again a second later. Stop rather than retry forever.
      clearInterval(interval)
      return
    }

    if (result.scan === null) {
      missing += 1
      if (missing >= MAX_MISSING_POLLS) { clearInterval(interval); setScan(null) }
      return
    }

    setScan(result.scan)

    if (isTerminal(result.scan.status)) {
      clearInterval(interval)
      router.refresh()
    }
  }

  /*
    THE INTERVAL IS CREATED BEFORE THE FIRST FETCH … if the very first answer is
    already terminal, the clear has to have something to clear.
  */
  const interval = setInterval(poll, SCAN_POLL_INTERVAL_MS)
  void poll()

  return () => { mounted = false; clearInterval(interval) }
}, [pollScanId, router])
```

**Two lint facts this file records and the executor must not relitigate:**
- `setState` lives **inside the async callback `setInterval` invokes, never in the effect body** —
  `react-hooks/set-state-in-effect` is severity 2 (ERROR) in this repo and three Phase 38 plans hit it.
- The interval is created **before** the first `void poll()`.

**Fire-then-handle launch** (`scan-panel.tsx` `handleStart`) — for phase 41 the start action is awaited
(a run row insert is fast), but the *outcome handling* shape carries over:

```tsx
startDuplicateScan(scanId, entityType)
  .then((result) => {
    if (result.success) return
    setScan(null); setLaunchFailed(true)
  })
  .catch(() => { setScan(null); setLaunchFailed(true) })
```

**Dialog chrome** — take from `src/app/workflows/delete-workflow-dialog.tsx` (see §4). **Take its
`Dialog`/`DialogFooter`/outline-Cancel shape; omit the `AlertTriangle` in `bg-destructive/10`** (UI-SPEC
§ Consequential, not destructive).

**Toolbar trigger** — copy the button shape byte-for-byte from the toolbar's existing siblings
(`toolbar.tsx:169-189`), which already establish `size="sm" variant="outline"` + `mr-1 h-4 w-4` icon +
pending-label swap:

```tsx
<Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}
        aria-label="Export workflow as JSON">
  <Download className="mr-1 h-4 w-4" />
  {exporting ? "Exporting..." : "Export JSON"}
</Button>
```

**R-3 target rows** — `toolbar.tsx:151` outer row `flex items-center gap-4 border-b px-4 py-2`,
`:155` name Input `max-w-[300px] font-medium` (needs `min-w-0`), `:168` inner cluster
`ml-auto flex items-center gap-2`. The dirty marker at `:200-202` is the state the disabled-while-dirty
hint sits beside.

---

### 4. `src/app/workflows/[id]/runs/[runId]/components/replay-run-button.tsx` (client component)

**Analogs:** `src/app/workflows/delete-workflow-dialog.tsx` (the dialog, exact — same tree, same
`Dialog` primitives), `src/app/admin/webhooks/[id]/delivery-table.tsx:108-116` (the trigger markup).

**Dialog + pending-state pattern** (`delete-workflow-dialog.tsx:29-63`) — the whole component:

```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="sm:max-w-md">
    <DialogHeader>
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-destructive/10 p-2">        {/* OMIT — marks it destructive */}
          <AlertTriangle className="h-5 w-5 text-destructive" />  {/* OMIT */}
        </div>
        <DialogTitle>Delete Workflow</DialogTitle>                {/* needs className="leading-tight" */}
      </div>
      <DialogDescription className="pt-4">…</DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
        Cancel
      </Button>
      <Button variant="destructive" onClick={onConfirm} disabled={isLoading}>   {/* use variant="default" */}
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Delete
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

Note it does **not** pass `closeLabel` — UI-SPEC confirms `DialogContent` binds `common.close` itself.
Note also this file hardcodes English; the two new dialogs must use `useTranslations` (UI-SPEC § i18n Scope).

**Trigger markup** (`delivery-table.tsx:108-116`) — the precedent UI-SPEC calls byte-identical:

```tsx
<Button
  size="sm"
  variant="outline"
  onClick={() => handleReplay(row.original.id)}
  disabled={isPending && replayingId === row.original.id}
>
  <RotateCcw className="h-3 w-3 mr-1" />
  {t("replay")}
</Button>
```

Its state pattern (`delivery-table.tsx:37-39`): `useState<string | null>` for the in-flight id plus
`useTransition`, and `toast.success` / `toast.error` from `sonner`.

**Render site in `page.tsx` — a hard constraint from the G-6 gate.** Write it as `{… && ( … )}`, which
the page already does twice. The existing instance (`runs/[runId]/page.tsx:160`):

```tsx
{run.status === "failed" && run.currentNodeId && (
  <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
```

`enclosingConditional` throws on a ternary, an extracted `const`, or an early return (Pitfall 7).

**R-1 / R-2 target rows** (`runs/[runId]/page.tsx:147-158`):

```tsx
<div className="space-y-2">
  <div className="flex items-center gap-3">            {/* R-1: two clusters, flex-wrap justify-between */}
    <h1 className="text-2xl font-bold">Run #{run.id.slice(0, 8)}</h1>
    <RunStatusBadge status={run.status} />
  </div>
  <div className="flex items-center gap-4 text-sm text-muted-foreground">   {/* R-2: add flex-wrap */}
    <span>Started {startedAtFormatted}</span>
    <span>Duration: {formatDuration(run.startedAt, run.completedAt)}</span>
  </div>
</div>
```

---

### 5. `src/app/workflows/[id]/runs/components/dry-run-badge.tsx` (server-safe component)

**Analog:** `src/app/workflows/[id]/runs/components/run-status-badge.tsx` — same directory, no
`"use client"`, imports `Badge` and renders a string child.

```tsx
import { Badge } from "@/components/ui/badge"
// …
export function RunStatusBadge({ status }: RunStatusBadgeProps) {
  const config = statusConfig[status] ?? { label: status, variant: "secondary" as const }
  return (
    <Badge variant={config.variant} className={config.className} aria-label={`Status: ${config.label}`}>
      {config.label}
    </Badge>
  )
}
```

**Do NOT extend `statusConfig`** — its `Record<Status, …>` is exhaustive-by-type on purpose
(`run-status-badge.tsx:10`) and `dryRun` is not a `WorkflowStatus` (`workflows.ts:29`).

**The server-safe constraint, and its documented precedent** — `run-changed-records.tsx:1-8`, in the
same directory, states the rule verbatim:

```
 * THIS FILE IS A SERVER COMPONENT and must not gain a client directive. It renders only
 * `Link`, `Badge` (with no children-forwarding slot prop), plain DOM and lucide icons, so no
 * React element ever crosses the RSC boundary into a Radix slot (T-36-32, asserted repo-wide by
 * the CFUI-01 gate).
```

The badge needs a translated label, so it uses `getTranslations` from `next-intl/server` —
`run-changed-records.tsx:24` is the in-tree precedent (`import { getFormatter, getTranslations } from "next-intl/server"`).

**Render site** — `runs-table.tsx:66` Status cell, inside the existing `flex flex-col gap-1`, beside
`<RunStatusBadge>`. Adds no width (UI-SPEC).

**G-8 gate assertion** — invert the existing directive regex. Source
(`src/components/bulk/__tests__/bulk-dialogs-wiring.test.ts:61`, and `src/app/trash/__tests__/trash-client-wiring.test.ts:41`):

```ts
const CLIENT_DIRECTIVE = /^\s*(['"])use client\1/
```

---

### 6. `src/lib/workflows/runs-filter.ts` (pure utility, transform)

**Analog:** `src/lib/views/url-params.ts` — the module 40-01 extracted from a page for exactly this
reason, and the file RESEARCH names.

**The header contract to copy** (`url-params.ts:14-22`):

```
 * NO RUNTIME DATABASE IMPORT, AND THAT IS A CONSTRAINT RATHER THAN A COINCIDENCE. Every one of the
 * six writers above is a `"use client"` module, so anything imported here enters the browser
 * bundle. The only import in this file is a TYPE, which is erased at compile time. Never import
 * `@/db`, a `queries.ts`, or `src/lib/export/formatters.ts` from here.
 *
 * EVERY FUNCTION IS TOTAL: it returns a valid value for any input and NEVER throws.
```

**Import discipline** (`url-params.ts:24`) — a type-only import is the whole import list:

```ts
import type { ViewEntityType, ViewFilters } from "./types"
```

For `runs-filter.ts`: `import type { WorkflowStatus } from "@/db/schema/workflows"` is type-only and
therefore allowed; `import { workflowRuns }` is a value and is not. Verified: `url-params.test.ts`
contains **zero** occurrences of `@/db`, which is the gate to reproduce.

**Narrowing-function shape** (`url-params.ts:299`, `:326`) — total, returns `null` rather than throwing:

```ts
export function narrowViewSelectionId(raw: unknown): string | null { … }
export function parseViewSelection(source: FilterParamSource): ViewSelection { … }
```

**The existing predicate this replaces** (`runs/page.tsx:41-47`) — validated against a frozen `Set`,
then folded into the where clause:

```ts
const VALID_STATUSES = new Set<WorkflowStatus>(["pending", "running", "completed", "failed", "waiting"])
// …
const statusFilter = sp.status && VALID_STATUSES.has(sp.status as WorkflowStatus)
  ? sp.status as WorkflowStatus
  : null

const whereClause = statusFilter
  ? and(eq(workflowRuns.workflowId, id), eq(workflowRuns.status, statusFilter))
  : eq(workflowRuns.workflowId, id)
```

Both the rows query and the `count()` query share `whereClause` (`:54`, `:61`), so pagination totals
stay consistent when the `dryRun` predicate is added to the accumulator.

**Client-side toggle** — reuse `status-filter.tsx:30-41` verbatim in shape, including the `page` delete:

```tsx
function handleChange(value: string) {
  const params = new URLSearchParams(searchParams.toString())
  if (value === "all") { params.delete("status") } else { params.set("status", value) }
  // Reset to page 1 on filter change
  params.delete("page")
  const qs = params.toString()
  router.push(`/workflows/${workflowId}/runs${qs ? `?${qs}` : ""}`)
}
```

**R-4 target row** (`runs/page.tsx:80-84`): `<div className="mb-4">` wrapping the `<Suspense>` +
`<StatusFilter>`. The `Select` inside is `w-[180px]` (`status-filter.tsx:45`).

---

### 7. `src/lib/execution/failure-alert.ts` (service, event-driven)

**Analogs for the three concerns, each different:**

**(a) Throttle / "already sent this".** The prompt asks about `digest_log`. Read it —
`src/db/schema/digest-log.ts:3-8`, complete:

```ts
export const digestLog = pgTable('digest_log', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  sentAt: timestamp('sent_at').defaultNow().notNull(),
  userCount: integer('user_count').notNull(),
  weekStart: timestamp('week_start', { mode: 'date' }).notNull(),
})
```

**No workflow key.** Its only reader (`api/internal/email/process/route.ts:113-121`):

```ts
const [existingDigest] = await db
  .select({ id: digestLog.id })
  .from(digestLog)
  .where(eq(digestLog.weekStart, thisMonday))
  .limit(1)

if (existingDigest) {
  return 0            // <-- an extra row here silently kills the weekly digest
}
```

And its writer (`:209-215`), a plain insert after the sends. **Confirms RESEARCH Q5: `digest_log` is a
conceptual precedent and the wrong vessel.**

**The right in-repo precedent is `activities.reminderSentAt`** (`src/db/schema/activities.ts:15`):

```ts
reminderSentAt: timestamp('reminder_sent_at', { mode: 'date' }),
```

read at `email/process/route.ts:45` (`isNull(activities.reminderSentAt)`) and written at `:75-79`:

```ts
// Mark as sent BEFORE sending (prevents duplicates even if send fails)
await db
  .update(activities)
  .set({ reminderSentAt: new Date() })
  .where(eq(activities.id, activity.id))
```

**Note the defect this analog carries and the new code must NOT inherit:** that `UPDATE` has no
`AND reminder_sent_at IS NULL` guard, so it is a read-then-write, not an atomic claim. The phase-41
throttle must be the **guarded** form. Two atomic-claim shapes to copy from:

`execution-processor.ts:87-97` — guarded `UPDATE … RETURNING` + length check, with the
parameterised interval:

```ts
const reclaimed = await db.execute(sql`
  UPDATE workflow_runs
  SET status = 'failed', error = ${staleError}, completed_at = NOW()
  WHERE status = 'running'
    AND started_at < NOW() - make_interval(mins => ${STALE_RUN_TIMEOUT_MINUTES})
  RETURNING id
`)

const count = (reclaimed as unknown as unknown[])?.length ?? 0
```

`create-run.ts:65-73` — the drizzle-builder form of the same claim, with the invariant written out:

```ts
export async function claimWorkflowRun(runId: string): Promise<boolean> {
  const claimed = await db
    .update(workflowRuns)
    .set({ status: "running", startedAt: new Date() })
    .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.status, "pending")))
    .returning({ id: workflowRuns.id })

  return claimed.length > 0
}
```

**(b) Preference read with "absent row means enabled"** (`email/process/route.ts:66-73`):

```ts
// Check notification preferences (default true if no row)
const [prefs] = await db
  .select({ emailActivityReminder: notificationPreferences.emailActivityReminder })
  .from(notificationPreferences)
  .where(eq(notificationPreferences.userId, targetUserId))
  .limit(1)

if (prefs && !prefs.emailActivityReminder) continue   // no row => send
```

This must match `getNotificationPreferences`' own default (`settings/notifications/actions.ts:38-40`):

```ts
if (!prefs) {
  return defaultPreferences        // all true
}
```

**(c) Fire-and-forget send from a background loop** (`email/process/route.ts:81-89`) — because `safeSend`
**rethrows** (`src/lib/email/send.ts:34-37`):

```ts
// Fire-and-forget email
sendActivityReminderEmail(user.email, activity.title, activity.dueDate, user.locale)
  .catch((error) => {
    console.error("[email-process] Failed to send activity reminder:", error)
  })
```

Recipient + locale lookup shape (`:58-62`):

```ts
const [user] = await db
  .select({ email: users.email, locale: users.locale })
  .from(users)
  .where(eq(users.id, targetUserId))
  .limit(1)
```

**(d) The log-prefix convention** — every module in this path uses a bracketed prefix:
`[execution-processor]`, `[execution-engine]`, `[email-process]`, `[email]`. Use `[failure-alert]`.

---

### 8. `src/lib/email/templates/workflow-failed.ts` (template, transform)

**Analog for the localised family (C-4 option A):** `src/lib/email/templates/activity-reminder.ts` —
complete, 37 lines, the closest shape:

```ts
import { getEmailTranslator } from '../i18n'

export async function getActivityReminderTemplate(
  activityTitle: string,
  activityUrl: string,
  dueDate: string,
  locale: string = 'en-US'
) {
  const t = await getEmailTranslator(locale, 'emails.activityReminder')
  return {
    subject: t('subject', { activityTitle }),
    html: `
      <!DOCTYPE html>
      … <table width="100%" style="max-width: 600px; margin: 40px auto; background: white; …">
        <h1 style="margin: 0 0 20px; color: #333;">${t('heading')}</h1>
        <p style="color: #666; margin-bottom: 30px;">${t('body', { activityTitle, dueDate })}</p>
        <a href="${activityUrl}" style="display: inline-block; background: #346df1; …">${t('buttonText')}</a>
      …
    `,
    text: `${t('subject', { activityTitle })}\n\n${t('body', { activityTitle, dueDate })}\n\n${activityUrl}`,
  }
}
```

**Analog for the un-localised family (C-4 option B):** `src/lib/email/templates/workflow-notification.ts`
— sync, no translator, hardcoded English, same HTML skeleton.

**Whichever is chosen, the barrel edit is one line** (`src/lib/email/templates/index.ts:1-10`):

```ts
export { getWorkflowNotificationTemplate } from "./workflow-notification"
```

**Security note that changes this template from every sibling:** the seven existing templates interpolate
*translator output*. This one interpolates `workflow_runs.error`, which can embed up to 200 chars of an
HTTP response body (`actions/http.ts:109-111`). Escape it. No existing template demonstrates escaping —
**this is the one genuinely new concern in the file** (see § No Analog Found).

---

### 9. The five handler gates (service, transform)

**Pattern: gate immediately before the side effect, never above the resolution** (Pitfall 2). The
side-effect call site in each, with the resolution above it that must still run:

`actions/email.ts:65-75` — the throw at `:67-69` must still fire under `_dryRun`:

```ts
const emails = await resolveRecipientEmails(recipients, context)

if (emails.length === 0) {
  throw new Error("No valid recipients resolved for email action")
}

const template = getWorkflowEmailTemplate(subject, body)

for (const email of emails) {
  await safeSend(email, template)        // <-- GATE HERE
}
```

`actions/notification.ts:23-40` — **amendment A1.** Both throws (`:18-20`, `:28-30`) and the `users`
SELECT stay; only `safeSend` at `:38` is skipped:

```ts
const rows = await db.select({ email: users.email }).from(users).where(inArray(users.id, userIds))
if (rows.length === 0) throw new Error("No valid users found for notification")
const template = getWorkflowNotificationTemplate(message)
for (const row of rows) {
  if (row.email) { emails.push(row.email); await safeSend(row.email, template) }   // <-- GATE HERE
}
```

`actions/http.ts:59-95` — interpolation *and* `validateUrl` stay; the gate goes above the retry loop's
`fetchWithTimeout`:

```ts
const url = interpolate(rawUrl, context)
// …headers interpolation…
// SSRF check
await validateUrl(url)                                   // <-- KEEP under dry run
// …body build…
for (let attempt = 0; attempt <= retryCount; attempt++) {
  const response = await fetchWithTimeout(url, { method, headers, body }, timeout)   // <-- GATE HERE
```

`actions/webhook-response.ts:112-126` — `normalizeBody` + `interpolateDeep` stay:

```ts
const rawBody = normalizeBody(config.body)
const interpolatedBody = interpolateDeep(rawBody, context)
const sent = sendWebhookResponse(runId, statusCode, interpolatedBody)   // <-- GATE HERE
return { output: { sent, statusCode, body: interpolatedBody } }
```

`actions/crm.ts:238-292` — validation (`:238-245`), `_workflowUserId` check (`:247-250`),
`interpolateDeep` + `coerceFieldMapping` (`:253-256`) and `resolveTargetId` (`:271`, `:283`) all stay.
The gate is on the three `mutations.*` calls inside `runWithExecutionDepth(depth + 1, …)`:

```ts
case "update": {
  const targetId = await resolveTargetId(entity, config, context)     // <-- KEEP: a real ilike lookup
  const result = await runWithExecutionDepth(depth + 1, () =>
    mutations.update(targetId, interpolatedFields, userId)            // <-- GATE HERE
  )
```

**Handler test mock header to copy** (`actions/__tests__/email.test.ts:1-38`) — `safeSend` is already
mocked in every handler test file, so the RED for "did not send" is one `it` block:

```ts
const mockSafeSend = vi.fn()
vi.mock("@/lib/email/send", () => ({
  safeSend: (...args: unknown[]) => mockSafeSend(...args),
}))
vi.mock("@/db", () => ({ db: { select: () => ({ from: mockFrom }) } }))
vi.mock("drizzle-orm", () => ({ inArray: vi.fn(…), eq: vi.fn(…), ilike: vi.fn(…) }))
vi.mock("@/db/schema", () => ({ users: { id: "users.id", email: "users.email" }, … }))
```

---

### 10. `src/lib/execution/engine.ts` + `types.ts` (the `_dryRun` flag)

**`types.ts:80-94`** — the field to copy, comment style and all:

```ts
export interface ExecutionContext {
  trigger: { type: string; data: Record<string, unknown> }
  nodes: Record<string, { output: Record<string, unknown>; status: "completed" | "failed" | "skipped" }>
  /** User ID of the workflow creator, used by CRM actions for mutation calls */
  _workflowUserId?: string
}
```

**`engine.ts` — the assignment site.** The restore/fresh branch, then the authoritative overwrite:

```ts
// Initialize or restore execution context
const savedContext = run.context as unknown as ResumableContext | null
const context: ResumableContext = savedContext?.trigger && savedContext?.nodes
  ? savedContext
  : { trigger: { … }, nodes: {} }

// Set workflow creator userId for CRM action mutations
context._workflowUserId = workflow.createdBy          // <-- _dryRun goes on the next line
```

This placement is what makes a resumed dry run stay dry: the restore happens above, the column read
happens below, so both underscore fields are re-derived from the authoritative row on every entry.

**Both delay branches** — A2's no-op reuses the *existing* `resumeAt === null` path verbatim.
Branch 1 (`engine.ts:324-333`):

```ts
case "delay": {
  const resumeAt = resolveDelay(node.config, context)

  if (resumeAt === null) {
    // Past time -- skip the delay
    const output = { delayed: false, skipped: true }
    context.nodes[node.id] = { output, status: "completed" }
    await completeStep(step.id, output)
    await persistContext(runId, context)
    nextNodeId = node.nextNodeId
  } else {
```

Branch 2 (`engine.ts:459-467`) is the same shape inside `executeBranchSegment`. **Two sites, same edit.**

**`failRun`** (`engine.ts:551-562`) — the reason A4 exists. It writes and returns; it does not throw:

```ts
async function failRun(runId: string, error: string, failedNodeId?: string): Promise<void> {
  console.error(`[execution-engine] Run ${runId} failed: ${error}`)
  const updates: Record<string, unknown> = { status: "failed", error }
  if (failedNodeId) updates.currentNodeId = failedNodeId
  await db.update(workflowRuns).set(updates).where(eq(workflowRuns.id, runId))
}
```

Note it does **not** set `completedAt` — RESEARCH Q5 relies on this when rejecting the
derive-from-`workflow_runs` throttle.

---

### 11. `src/lib/execution/execution-processor.ts` (3 alert call sites + the A3 fix)

**Call site 1 — `processPendingRuns:142-149`.** The `catch` that only sees unexpected throws:

```ts
try {
  await executeRun(run.id as string)
} catch (error) {
  console.error(`[execution-processor] Error executing run ${run.id}:`, error)
}
```

**Call site 2 — `processWaitingRuns:196-204`**, same shape.

**Call site 3 — `reclaimStaleRuns`**, over the ids the `RETURNING id` at `:94` already yields.

**The A3 fix — `processWaitingRuns:163-194`.** The unguarded claim, verbatim:

```ts
const readySteps = await db.execute(sql`
  SELECT wrs.id, wrs.run_id
  FROM workflow_run_steps wrs
  WHERE wrs.status = 'waiting'
    AND wrs.resume_at <= NOW()
  FOR UPDATE SKIP LOCKED        -- lock drops at statement end: no transaction wrapper
`)
// …
await db
  .update(workflowRunSteps)
  .set({ status: "completed" as const, completedAt: new Date() })
  .where(eq(workflowRunSteps.id, stepId))        // <-- NO `AND status = 'waiting'` guard
```

**The guard to copy is `claimWorkflowRun` (`create-run.ts:65-73`, quoted in §7b)** — `and(eq(id), eq(status))`
plus `.returning({ id })` plus a `length > 0` skip. Its header states the protocol the fix must join:
*"flip 'pending' -> 'running' atomically. Whichever side wins the UPDATE owns the run; the other side
sees zero affected rows and backs off."*

**Processor test mock header** (`execution-processor.test.ts:1-33`) — already mocks `db.execute`,
`executeRun`, the schema tables and the `sql` template. Adding an alert mock is one more `vi.mock`:

```ts
const mockExecute = vi.fn()
vi.mock("@/db", () => ({ db: { execute: mockExecute, update: vi.fn(), select: vi.fn() } }))
const mockExecuteRun = vi.fn()
vi.mock("./engine", () => ({ executeRun: (...args: unknown[]) => mockExecuteRun(...args) }))
vi.mock("drizzle-orm", () => ({ sql: (strings, ...values) => ({ _tag: "sql", strings, values }), eq: vi.fn(…) }))
```

Its drain-loop test idiom — `mockResolvedValueOnce([{…}])` then `mockResolvedValueOnce([])`.

---

### 12. `src/lib/triggers/create-run.ts` (+ options bag)

**Both insert branches must carry the options** — the recursion short-circuit is the one that gets
forgotten, and a dry run that trips the limit must still be `dryRun` or it appears in the runs list:

```ts
if (effectiveDepth >= MAX_RECURSION_DEPTH) {
  const [run] = await db.insert(workflowRuns).values({
    workflowId,
    status: "failed",
    triggerData: triggerEnvelope as unknown as Record<string, unknown>,
    depth: effectiveDepth,
    error: `Recursion limit reached (${MAX_RECURSION_DEPTH} levels)`,
    completedAt: new Date(),
  }).returning()
  return run
}

const [run] = await db.insert(workflowRuns).values({
  workflowId,
  status: "pending",
  triggerData: triggerEnvelope as unknown as Record<string, unknown>,
  depth: effectiveDepth,
}).returning()
```

**Test mock idiom** (`create-run.test.ts:5-46`) — the chained-builder mock to extend:

```ts
vi.mock("@/db", () => ({ db: { insert: vi.fn() } }))
// …
mockDb.insert.mockReturnValue({
  values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([mockRun]) }),
})
```

To assert the passthrough, capture the `values` spy and read its first argument.

---

### 13. `src/db/schema/workflows.ts` + `notification-preferences.ts` (model)

**`workflowRuns` already contains the exact column shape needed** (`workflows.ts:41-45`):

```ts
triggerData: jsonb("trigger_data").$type<Record<string, unknown>>(),
error: text("error"),
depth: integer("depth").notNull().default(0),        // <-- dryRun copies this: .notNull().default(false)
context: jsonb("context").$type<Record<string, unknown>>().default({}),
currentNodeId: text("current_node_id"),               // <-- replayedFromRunId copies this: plain nullable text
```

`replayedFromRunId` gets **no `.references()`** — RESEARCH Q6: runs are prunable and an FK would either
block pruning or cascade-delete the replay. Contrast `workflowId` at `:37-39`, which does have one.

`failureAlertSentAt` on `workflows` copies `activities.reminderSentAt` (`activities.ts:15`) —
nullable `timestamp`. **Do not** put it near `updatedAt` in any `.set()`; it is runtime state.

**`notification-preferences.ts:4-10`, complete — the fourth column is a copy of any of three:**

```ts
export const notificationPreferences = pgTable('notification_preferences', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  emailDealAssigned: boolean('email_deal_assigned').default(true).notNull(),
  emailActivityReminder: boolean('email_activity_reminder').default(true).notNull(),
  emailWeeklyDigest: boolean('email_weekly_digest').default(true).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
```

Note the ordering idiom in this file is `.default(true).notNull()`; `workflows.ts` uses
`.notNull().default(false)`. Both emit the same SQL. Match the file being edited.

---

### 14. `drizzle/0019_*.sql` (migration)

**Exact analog: `drizzle/0010_pale_rocket_raccoon.sql` — same table, same shape, already applied to
this populated database.** The whole file:

```sql
DROP INDEX "workflows_next_run_at_idx";--> statement-breakpoint
ALTER TABLE "workflow_run_steps" ADD COLUMN "resume_at" timestamp;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "depth" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "context" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "current_node_id" text;
```

Line 3 is `dry_run`'s precedent to the letter: a `NOT NULL` column with a non-volatile default, added to
`workflow_runs`. Line 5 is `replayed_from_run_id`'s.

**Second precedent, and the reassuring one about table size:** `drizzle/0004_yummy_mandarin.sql` added
three `NOT NULL DEFAULT` text columns to `users` and `organizations`; `drizzle/0009_trigger_array_migration.sql`
added `triggers jsonb DEFAULT '[]'::jsonb NOT NULL` to `workflows`.

**On the lock/rewrite cost, since the live DB has ~25k deals / ~79k activities:** neither table this
migration touches is one of the large ones. `workflow_runs`, `workflows` and `notification_preferences`
are all small in this deployment. And on PG 16 (`postgres:16-alpine`, verified) `ADD COLUMN … DEFAULT <constant>`
is a **catalog-only** operation (PG 11+): no table rewrite, no backfill pass. The `ACCESS EXCLUSIVE`
lock is held for the catalog update only — milliseconds. **The rewrite risk named in the prompt does not
materialise here**, and the reason is the non-volatile default, which is the same property that makes
Pitfall 1's `NOT NULL` mandatory. One clause buys both.

**Note what is NOT in any precedent:** none of the 19 migrations contains a hand-written `ALTER`.
`drizzle/0006_import-sessions-user-id.sql`, `0009_trigger_array_migration.sql`, `0015_trash_retention_seed.sql`
and `0016_dedup_functions.sql` have hand-authored names, so a named migration is acceptable, but the
column DDL itself must come from `drizzle-kit generate` — never `push`. Journal is at `idx: 18`,
`tag: "0018_adorable_smasher"`, so the next tag is `0019_*`.

---

### 15. `src/app/settings/notifications/notification-form.tsx` + `actions.ts`

**The row to copy, byte for byte** (`notification-form.tsx:70-84`) — insert as third of four:

```tsx
<div className="flex items-start space-x-3">
  <Checkbox
    id="weekly-digest"
    checked={prefs.emailWeeklyDigest}
    onCheckedChange={() => handleToggle("emailWeeklyDigest")}
  />
  <div className="space-y-1">
    <Label htmlFor="weekly-digest" className="font-medium cursor-pointer">
      {t("weeklyDigest")}
    </Label>
    <p className="text-sm text-muted-foreground">
      {t("weeklyDigestDescription")}
    </p>
  </div>
</div>
```

`handleToggle` is generic over the key (`:20-22`) — `keyof NotificationPreferencesData` — so the new
row needs no new handler.

**The four spots in `actions.ts`** — schema (`:10-14`), defaults (`:18-22`), select map (`:42-46`),
upsert `values` **and** `onConflictDoUpdate.set` (`:67-81`). The upsert repeats every field twice:

```ts
await db.insert(notificationPreferences)
  .values({ userId: session.user.id, emailDealAssigned: …, emailActivityReminder: …, emailWeeklyDigest: …, updatedAt: new Date() })
  .onConflictDoUpdate({
    target: notificationPreferences.userId,
    set: { emailDealAssigned: …, emailActivityReminder: …, emailWeeklyDigest: …, updatedAt: new Date() },
  })
```

A field added to one and not the other typechecks and silently never persists on update. **Five edit
points, not four.**

---

### 16. `src/messages/locale-parity.test.ts` — `REQUIRED_WORKFLOWS_KEYS` (G-1)

**Analog: the `views` contract, which is the newest and the one UI-SPEC L-41-2 names.** Four pieces to copy.

**(a) The list, with the "total contract" header** (`locale-parity.test.ts:600-617`, then `:618`):

```
 * 61 keys, every one of them inside the `views` namespace. Like `bulk` and `dedup`, and unlike
 * `audit`, `trash` and `shell`, phase 40 adds NOTHING outside its own namespace — no `nav` entry, no
 * `admin.dashboard` tile — so `viewsKeys` below needs no `*_EXTRA_KEYS` sibling and the comparison
 * against this list is TOTAL: a 62nd `views` string that never made it into this array fails, which
 * is the half a missing-key check cannot see.
 *
 * The per-group counts in the comments are load-bearing: they are how a reader sees at a glance that
 * a group lost a key.
 */
export const REQUIRED_VIEWS_KEYS: string[] = [
  // The bar and the picker — 18. …
  "views.picker.label",
  …
```

Phase 41 is the same case: 23 `workflows.*` keys, no extras array, total. **The two
`settings.notifications.*` keys stay OUT** of `REQUIRED_WORKFLOWS_KEYS` (L-41-2) — they are covered by
the whole-file parity assertion only.

**(b) The namespace constant** (`:797-805`):

```ts
const NOTES_NAMESPACE = "notes"
const AUDIT_NAMESPACE = "audit"
…
const VIEWS_NAMESPACE = "views"       // <-- add: const WORKFLOWS_NAMESPACE = "workflows"
```

**(c) The scope, with its "no extras sibling" comment** (`:843-846`):

```ts
// Same again, and the strongest case of it so far: 40-UI-SPEC adds zero strings outside `views` —
// no `nav` entry and no `admin.dashboard` tile — so this scope IS the whole contract and the
// comparison against REQUIRED_VIEWS_KEYS below is total.
const viewsKeys = keysMatching(inNamespace(VIEWS_NAMESPACE))
```

**(d) The exact-contract assertion** (`:1093-1101`) — the piece that makes it *total*:

```ts
const viewsContract = [...REQUIRED_VIEWS_KEYS].sort()
for (const locale of LOCALES) {
  expect.soft(
    viewsKeys[locale],
    `${VIEWS_NAMESPACE} key set in ${locale}.json diverges from the checked-in contract`,
  ).toEqual(viewsContract)
}
```

**Plus five one-line additions to the existing shared `it` blocks**, each of which already takes a
contract array — `missingIn` (`:981-987`), `blankIn` (`:1110-1116`), `untranslatedInBoth` (`:1119-1136`),
`placeholderDrift` (`:1139+`), and `expectIdenticalKeySets` (`:1029-1035`). All five helpers exist; the
edit is `expect.soft(missingIn(REQUIRED_WORKFLOWS_KEYS)).toEqual(emptyPerLocale)` etc.

**Plus the pinned-count test** (`:1002-1009`), which the views contract carries and which catches a
list that repeats one dot-path and drops another:

```ts
it("the checked-in views contract still lists exactly 61 keys", () => {
  expect(REQUIRED_VIEWS_KEYS).toHaveLength(61)
  expect(new Set(REQUIRED_VIEWS_KEYS).size, "REQUIRED_VIEWS_KEYS lists a key twice").toBe(61)
})
```

**Plus the "phase N changes no pre-existing contract" test** (`:1020-1027`) — phase 41 should add its own
row set (`AUDIT 86 / TRASH 63 / BULK 46 / DEDUP 80 / VIEWS 61`) and the file's own warning applies:
*"The lengths below were read from THIS FILE by evaluating the module, and the file wins."*
UI-SPEC says 23 keys; **evaluate the array, do not trust the document's arithmetic.**

**G-2 / G-9 come free:** `{runId}` is covered by `placeholderDrift` (regex `/\{[a-zA-Z0-9_]+\}/g`), and
`ICU_PLURAL_KEYS` (`:928-941`) gets **no** new entry — phase 41 adds no plural.

---

### 17. `src/app/workflows/[id]/runs/[runId]/__tests__/replay-visibility.test.ts` (G-6 reshaped)

**Analog: `src/components/views/__tests__/manage-views-dialog-wiring.test.ts:373-457`** — the worked
`enclosingConditional` example the prompt asks for. Its three moves, all reusable:

**(a) Extract a conditional per marker, and assert its test:**

```ts
const share = enclosingConditional(source, "manage.share", COMPONENT)
const remove = enclosingConditional(source, "manage.delete", COMPONENT)

expect(
  share.test,
  `${COMPONENT}: the share Switch must render only when view.canEdit (T-40-39 — visibility ` +
    `only; plan 40-06's canMutateView is the authorization). Its test is: ${share.test.trim()}`
).toContain("view.canEdit")
```

**(b) Assert an absence INSIDE an extracted body, not against the whole file:**

```ts
expect(
  occurrences(share.body, "setViewDefault({"),
  `${COMPONENT}: setViewDefault appears inside the share switch's view.canEdit branch (G-7). ${G7}`
).toBe(0)
```

**(c) The "no NEW branch either" general half — the try/catch idiom, because a throw means
"no enclosing conditional":**

```ts
/*
 * … `enclosingConditional` throws when the nearest preceding `&& (` does not actually contain the
 * marker, which is the "no enclosing conditional" answer.
 */
let enclosing: { test: string; body: string } | null = null
try {
  enclosing = enclosingConditional(source, "setViewDefault({", COMPONENT)
} catch {
  enclosing = null
}

if (enclosing !== null) {
  expect(enclosing.test, `…`).not.toContain("canEdit")
}
```

**The helper's own contract** (`source-scan.ts:284-330`) — read it before writing the gate:

```
/**
 * The `{<test> && ( … )}` JSX conditional that ENCLOSES `marker`, split into its test and its body,
 * extracted by paren depth.
 *
 * The final containment check is not decoration: without it, a marker that moved out of the
 * conditional would still find the nearest preceding `&& (` and the gate would happily assert
 * things about a branch the marker no longer lives in.
 */
export function enclosingConditional(source, marker, file = ""): { test: string; body: string }
```

Its three throw messages are the failure modes to expect: *"… not found in the source"*,
*"… is not inside a {… && ( … )} conditional"*, *"… latched onto an unrelated branch"*.

**Import path** (`source-scan.ts` exports `readStrippedSource` at `:88`):

```ts
import { readStrippedSource, enclosingConditional } from "@/components/custom-fields/__tests__/source-scan"
```

**A second, tighter analog for the "verbatim, not toContain" strictness** —
`src/app/organizations/__tests__/views-page-wiring.test.ts:132-138`, which also carries the
anti-vacuity lesson the replay gate needs:

```ts
// VERBATIM, not `toContain`. An OR-ed second clause is the loop this assertion exists to make
// impossible …
expect(test.trim()).toBe(GUARD_TEST)
```

and (`:161-174`) the `indexOf` trap, measured on a real RED run:

```ts
// BOTH OFFSETS ARE ASSERTED PRESENT FIRST. Written as a bare `toBeLessThan` this test passes
// VACUOUSLY while the guard is missing, because `indexOf` returns -1 …
expect(guardAt).toBeGreaterThan(-1)
```

---

### 18. `src/app/workflows/__tests__/responsive-containers.test.ts` (G-3 + G-4)

**Analog: `src/components/views/__tests__/responsive-classes.test.ts`** — a class-string scan over a
named set of files, with an anti-vacuity completeness check and a named-exemption table.

**The header disclaimer to copy** (`:4-14`):

```
 * WHAT THIS TEST IS NOT, AND THIS MATTERS MORE THAN USUAL:
 *   - IT MEASURES NOTHING. It never opens a browser, never sets a viewport and never reads a
 *     computed style. …
 *   - It is a STATIC read of class STRINGS. …
```

**The completeness check that stops the gate going vacuous** (`:150-163`):

```ts
describe("the extractor sees every className", () => {
  it.each(COMPONENTS)("%s", (file) => {
    const source = readStrippedSource(file)
    const declared = (source.match(/className=/g) ?? []).length

    expect(
      usesIn(file).length,
      `${file}: the file declares className= ${declared} time(s) but only ` +
        `${usesIn(file).length} were extracted from opening tags. A tag the walker could not ` +
        `parse would hide every violation on it, which is how a gate like this silently goes vacuous.`
    ).toBe(declared)
  })
})
```

**The flex-row rule and its SAFE tokens** (`:223-249`) — directly reusable for R-1..R-4:

```ts
const isFlexRow = (className: string) => {
  const tokens = tokensOf(className)
  return tokens.includes("flex") && !tokens.includes("flex-col")
}

const SAFE = ["flex-wrap", "shrink-0", "min-w-0"]
```

plus the exemption table with per-entry counts (`:197-221`, `:251-260`), whose rule is:
*"An exemption whose className changed must be re-examined against R-4, not re-counted."*

**For G-4 (zero new palette utilities)**, the simplest form is the same `ALL_USES` scan with a token
regex `/-(red|green|emerald|blue|amber|violet|rose)-[0-9]/`. Note the scope must be the **six touched
files**, because `run-status-badge.tsx:13,21,25` already ships three palette pairs and is not modified
(UI-SPEC C-41-1 states this narrowing explicitly).

**Whichever helper set is used, import it — do not write a fourth brace matcher.**
`source-scan.ts:14-27` records that as its reason for existing, and the promotion rule
(*"if a third gate needs these, promote all four into `source-scan.ts` in ONE commit"*) is already spent.

---

### 19. `src/db/schema/__tests__/workflow-runs-columns.test.ts` (Pitfall 1)

**Analog: `src/db/schema/saved-views.test.ts`** — and its opening rationale is exactly the trap
this test must avoid:

```
 * The storage contract for saved views, asserted against the PARSED Drizzle table
 * definitions rather than against the text of `saved-views.ts`.
 *
 * That distinction is the whole point of this file. Phase 39 was bitten five separate
 * times by assertions written as raw-token greps: the comment explaining a rule tripped
 * the grep gate that enforced the rule, and deleting the comment "fixed" it … `getTableConfig`
 * gives the real column, index, foreign-key and primary-key structure, so an assertion here can
 * only be satisfied by changing the schema, never by editing prose.
```

**The helper to copy** (`saved-views.test.ts:70-82`):

```ts
import { getTableConfig } from "drizzle-orm/pg-core"

type ColumnFacts = { type: string; notNull: boolean; hasDefault: boolean; primary: boolean }

function columnFacts(table: Parameters<typeof getTableConfig>[0]): Record<string, ColumnFacts> {
  const out: Record<string, ColumnFacts> = {}
  for (const column of getTableConfig(table).columns) {
    out[column.name] = {
      type: column.getSQLType(),
      notNull: column.notNull,
      hasDefault: column.hasDefault,
      primary: column.primary,
    }
  }
  return out
}
```

**The exact-set assertion** (`:117-128`) — fails on an *added* column as well as a removed one:

```ts
it("has exactly the eight columns the phase needs, and no others", () => {
  expect(columnFacts(savedViews)).toEqual({
    id: { type: "text", notNull: true, hasDefault: true, primary: true },
    …
    is_shared: { type: "boolean", notNull: true, hasDefault: true, primary: false },
  })
})
```

For `workflow_runs` the Pitfall-1 row is `dry_run: { type: "boolean", notNull: true, hasDefault: true, primary: false }`
and the negative is `replayed_from_run_id: { type: "text", notNull: false, hasDefault: false, primary: false }`.
`hasDefault: true` + `notNull: true` **is** the "not nullable" assertion; note it does not prove the
default is `false` rather than `true` — if that matters, assert `getTableConfig(workflowRuns).columns`'
`.default` too, or keep the SQL-text check on the generated migration as a second, separate gate.

**The FK-absence assertion** uses `foreignKeyFacts` (`:92-103`) — `replayed_from_run_id` must not appear
in it (RESEARCH Q6: no FK, because runs are prunable).

---

### 20. `docs/admin/deployment/{vercel,docker}.md` (WFOPS-04)

**Insertion points, verified against the current files:**

| File | Section | Line |
|---|---|---|
| `vercel.md` | `## Limitations and Workarounds` — after `### Cold Starts` | 217 / 242 |
| `vercel.md` | one bullet in the top-of-file `### Limitations` list | 15 |
| `docker.md` | `## Production Considerations` — beside `### HTTPS with Reverse Proxy` | 182 / 184 |

Both files already carry `###` subsections under those headings, so the new section inherits their depth.
**No test gate** (CONTEXT: *"A docs-presence grep mostly obstructs rewording"*). `bare-metal.md` exists
and is the optional third (A8).

---

## Shared Patterns

### Server-action contract
**Source:** `src/app/workflows/actions.ts:26-49`
**Apply to:** all three new actions
```ts
const session = await auth()
if (!session?.user?.id) {
  return { success: false, error: "Not authenticated" }
}
// …
return { success: true, id: result.id }
```
Discriminated-union return type, spelled out at the signature
(`workflows/actions.ts:27`): `Promise<{ success: true; id: string } | { success: false; error: string }>`.
Session-only — **not** `replayDelivery`'s `session.user.role !== "admin"` (Pitfall 5).

### Zod validation on a server action
**Source:** `src/app/settings/notifications/actions.ts:10-14`, `:60-63`
**Apply to:** the `emailWorkflowFailed` field; and the dry-run trigger data's server-side re-parse
```ts
const parsed = updatePreferencesSchema.safeParse(data)
if (!parsed.success) {
  return { success: false, error: parsed.error.issues[0].message }
}
```

### Atomic claim via guarded write
**Source:** `src/lib/triggers/create-run.ts:65-73` (builder form),
`src/lib/execution/execution-processor.ts:87-97` (raw-SQL form)
**Apply to:** `claimFailureAlert`, and the `processWaitingRuns` A3 fix
The guard is IN the write, never in a preceding SELECT. `.returning()` + a length check is the answer.

### Parameterised SQL interval
**Source:** `src/lib/execution/execution-processor.ts:82`, `:93`
**Apply to:** the throttle window
```sql
AND started_at < NOW() - make_interval(mins => ${STALE_RUN_TIMEOUT_MINUTES})
```
Never a concatenated `INTERVAL '60 minutes'` literal — the constant must live in TS so a test can import it.

### Fire-and-forget email
**Source:** `src/app/api/internal/email/process/route.ts:82-89`
**Apply to:** every `safeSend` from the processor path (Pitfall 4 — `safeSend` rethrows, `send.ts:34-37`)

### Preference default = enabled
**Source:** `src/app/api/internal/email/process/route.ts:67-73`; must agree with
`src/app/settings/notifications/actions.ts:38-40`
**Apply to:** `failure-alert.ts`

### Log prefix
**Source:** `[execution-processor]`, `[execution-engine]`, `[email-process]`, `[email]`
**Apply to:** `failure-alert.ts` → `[failure-alert]`

### Source-scan gate imports
**Source:** `src/components/custom-fields/__tests__/source-scan.ts`
**Apply to:** all four new source-scan gates
```ts
import {
  callArguments, elementRegion, enclosingConditional, openingTagAt,
  readStrippedSource, tagIndexes,
} from "@/components/custom-fields/__tests__/source-scan"
```
`readStrippedSource` first, always — the prose in a file header names every identifier the gate asserts,
and an un-stripped read lets a comment satisfy the gate.

### `"use client"` directive detection
**Source:** `src/components/bulk/__tests__/bulk-dialogs-wiring.test.ts:61`
**Apply to:** G-8 (as a negation)
```ts
const CLIENT_DIRECTIVE = /^\s*(['"])use client\1/
```

### 320px container remediation
**Source:** commit `c082430` (*"wrap the activities stats row — three stats overflow 320px"*),
`run-changed-records.tsx:119` (`justify-between` + `flex-wrap` row)
**Apply to:** R-1 through R-4. Note `min-w-0` on a `max-w-[…]` Input is a *separate* fix from
`flex-wrap` — the cap sets no minimum, so the Input refuses to shrink and forces the row wide before
the wrap can help (R-3).

---

## No Analog Found

| File / concern | Role | Reason |
|---|---|---|
| **HTML-escaping user data in an email template** (`workflow-failed.ts`) | utility | All 9 existing templates interpolate translator output or app-controlled strings. `workflow-notification.ts:21` interpolates a workflow's own `message` **unescaped** — so the nearest thing to a precedent is the defect. This template interpolates `workflow_runs.error`, which can carry 200 chars of an HTTP response body (`http.ts:109-111`). § Security Domain requires escaping; there is no in-repo escaper for HTML email to copy. The planner must name the approach (a small local `escapeHtml`, or truncate-and-plain-text-only). |
| **A 30-second wall-clock budget on a client poll** | component | `scan-panel.tsx` bounds by *consecutive-miss count* (`MAX_MISSING_POLLS = 5`), not by elapsed time, and `progress-step.tsx` bounds by nothing at all. UI-SPEC's `dryRun.timeout` is a 30s deadline. The interval + terminal-status machinery is copyable; the deadline is new. Note the interaction RESEARCH Q2 flagged: `POLL_INTERVAL = 5_000` means 0-5s of queue before the run even starts, and a workflow with a `waiting` run will never be claimed inside 30s — the timeout path is reachable in normal operation, not just on error. |
| **A multi-instance-safety matrix in deployment docs** | docs | `vercel.md` § Limitations and `docker.md` § Production Considerations hold prose limitations, not component/verdict tables. Structure is new; the surrounding heading depth and tone are the only pattern. |

---

## Contradictions and Risks the Planner Must Resolve

1. **`REQUIRED_WORKFLOWS_KEYS` count.** UI-SPEC says 25 keys total / 23 in `workflows.*`; VALIDATION says
   23 dot-paths. `locale-parity.test.ts:1011-1018` carries a standing warning that every key count quoted
   in a phase-40 planning document was **wrong**, because a naive count over an array literal also counts
   the dot-paths quoted inside the explanatory comments. **Evaluate the array; the file wins.**
   Then A5 (localised failure template) adds `emails.workflowFailed.*` on top, which the 25-key manifest
   never enumerated — RESEARCH C-4 requires that choice be recorded explicitly either way.

2. **Fourth schema column.** CONTEXT's discretion item says *"the three schema additions"*;
   RESEARCH Q5 recommends a fourth (`workflows.failureAlertSentAt`) with the alternatives priced (A6).
   The `digest_log` reuse CONTEXT gestured at is verified broken (it would suppress the weekly digest for
   every user). The planner must record the decision.

3. **A3 says fix `processWaitingRuns`; RESEARCH Open Question 5 recommends document-only.**
   CONTEXT amendment A3 is USER-APPROVED and overrides. Fix it. Analog in §11.

4. **Two new test directories** (`src/lib/execution/__tests__/`, `src/db/schema/__tests__/`) diverge from
   those directories' existing colocated convention. Harmless, but state it.

5. **The migration must not be `push`.** `package.json` has a `db:push` script and it is not the
   convention (19 checked-in migrations + journal). Generate, inspect the SQL for
   `DEFAULT false NOT NULL` **before** applying (Pitfall 1), then `docker compose exec app npx drizzle-kit migrate`,
   then **restart the app container** and confirm `docker compose logs app | grep -F '[execution-processor] Starting'`
   — RESEARCH § Runtime State Inventory: `instrumentation.ts` ends its build step in `2>/dev/null || true`,
   so a chunk-layout change can kill all four processors while every unit test passes.

---

## Metadata

**Analog search scope:** `src/app/workflows/**`, `src/app/admin/webhooks/**`, `src/app/settings/notifications/**`,
`src/app/duplicates/**`, `src/app/organizations/__tests__/`, `src/app/api/internal/email/process/`,
`src/lib/execution/**`, `src/lib/triggers/**`, `src/lib/email/**`, `src/lib/views/`, `src/db/schema/`,
`src/components/{views,bulk,custom-fields,ui}/__tests__/`, `src/messages/`, `drizzle/`, `docs/admin/deployment/`

**Files read this session:** 41
**Strong analogs extracted:** 20 assignment blocks, 9 shared patterns
**Pattern extraction date:** 2026-08-22
**Anchored at commit:** `739fc1d`
