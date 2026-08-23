import { auth } from "@/auth"
import { db } from "@/db"
import { workflows, workflowRuns, workflowRunSteps } from "@/db/schema/workflows"
import type { WorkflowRunStepStatus } from "@/db/schema/workflows"
import { eq, and } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { RunStatusBadge } from "../components/run-status-badge"
import { DryRunBadge } from "../components/dry-run-badge"
import { formatDuration } from "@/lib/workflows/format"
import { ReplayRunButton } from "./components/replay-run-button"
import { RunStepList } from "./components/run-step-list"
import type { RunStep } from "./components/run-step-list"
import { RunChangedRecords } from "./components/run-changed-records"
import { readRunChangedRecords } from "@/lib/audit/linked-records"
import type { RunChangedRecord } from "@/lib/audit/linked-records"
import { log } from "@/lib/log"

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>
}) {
  const session = await auth()
  if (!session?.user) {
    redirect("/login")
  }

  const { id, runId } = await params

  // Load the run
  const runResults = await db
    .select()
    .from(workflowRuns)
    .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.workflowId, id)))
    .limit(1)

  if (runResults.length === 0) {
    notFound()
  }

  const run = runResults[0]

  // Load workflow for node labels
  const workflowResults = await db
    .select({ nodes: workflows.nodes, name: workflows.name })
    .from(workflows)
    .where(eq(workflows.id, id))
    .limit(1)

  if (workflowResults.length === 0) {
    notFound()
  }

  const workflow = workflowResults[0]

  // Load steps ordered by execution order
  const steps = await db
    .select()
    .from(workflowRunSteps)
    .where(eq(workflowRunSteps.runId, runId))
    .orderBy(workflowRunSteps.createdAt)

  // Build node label map from workflow.nodes
  const nodeMap = new Map<string, string>()
  const workflowNodes = (workflow.nodes ?? []) as Array<{
    id: string
    label?: string
    type?: string
  }>
  for (const node of workflowNodes) {
    nodeMap.set(node.id, node.label || node.type || node.id)
  }

  // Detect skipped nodes: nodes in workflow definition without corresponding step records
  const executedNodeIds = new Set(steps.map((s) => s.nodeId))

  // Build combined steps array
  const combinedSteps: RunStep[] = steps.map((s) => ({
    nodeId: s.nodeId,
    nodeLabel: nodeMap.get(s.nodeId) || s.nodeId,
    status: s.status as WorkflowRunStepStatus,
    input: s.input as Record<string, unknown> | null,
    output: s.output as Record<string, unknown> | null,
    error: s.error,
    startedAt: s.startedAt,
    completedAt: s.completedAt,
    isSkipped: false,
  }))

  // Add skipped nodes at the end
  for (const node of workflowNodes) {
    if (!executedNodeIds.has(node.id)) {
      combinedSteps.push({
        nodeId: node.id,
        nodeLabel: node.label || node.type || node.id,
        status: "skipped" as WorkflowRunStepStatus,
        input: null,
        output: null,
        error: null,
        startedAt: null,
        completedAt: null,
        isSkipped: true,
      })
    }
  }

  // Which CRM records this run changed — the second half of SC-2.
  //
  // GUARDED, AND THE GUARD IS THE POINT. `readRunChangedRecords` carries no try/catch of its own
  // on purpose: a swallow there would return `[]`, and `[]` renders "This run didn't change any
  // records" — indistinguishable from the truth. So the catch lives here, exactly as
  // `record-timeline.tsx:60-84` does it. There is no `error.tsx` or `global-error.tsx` anywhere
  // under `src/app/`, so an unguarded throw would replace this whole run page with Next.js's
  // default full-page error over one optional section (T-36-35).
  //
  // Sequential rather than folded into a `Promise.all`: this page has no such batch today, and
  // the query is one indexed read plus at most four batched title reads.
  //
  // NO AUTH CHECK IS ADDED. The page's session-only posture is matched deliberately (T-36-04,
  // 36-CONTEXT § Post-Research Addendum): workflows are not owner-scoped in this product, and
  // `step.input` / `step.output` already render CRM data on this same page. Tightening it here
  // would be an undeclared behaviour change in a phase that is not about auth.
  let changedRecords: RunChangedRecord[] = []
  let changedRecordsFailed = false
  try {
    changedRecords = await readRunChangedRecords(runId)
  } catch (error) {
    // Logged in full server-side; the user is told only that the section is unavailable.
    log.error("workflows/[id]/runs/[runId]", "Run changed-records read failed", { err: error })
    changedRecordsFailed = true
  }

  // Only the strings THIS PHASE authors go through a translator — the replay button's label, the
  // dry-run badge and the lineage line. UI-SPEC § i18n Scope declares that seam, and
  // `run-changed-records.tsx:14-19` is the in-tree precedent: the `/workflows` tree is English
  // literals today, and writing new untranslated English would propagate the debt while
  // translating the rest of this page is unrelated scope. So es-ES and pt-BR will show a
  // translated Replay button beside an English "Back to Runs", "Started" and "Duration:". That is
  // the declared trade, and it is NOT to be "fixed" here.
  const t = await getTranslations("workflows")

  const startedAtFormatted = run.startedAt
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(run.startedAt)
    : "Not started"

  return (
    <div className="container py-6 space-y-6">
      <Link
        href={`/workflows/${id}/runs`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; Back to Runs
      </Link>

      {/* R-1. TWO CLUSTERS, and `flex-wrap` on both of them, because this row went from two items
          to four. UI-SPEC's budget is 241px of content on a `container` page (305px client width
          less 64px of `padding-inline`), and an `<h1>` at `text-2xl font-bold` plus two badges plus
          a `size="sm"` button do not share that. `justify-between` + `flex-wrap` is the pattern
          `run-changed-records.tsx:119` already uses for its rows.

          The INNER cluster's `flex-wrap` is not decoration either: cluster A alone is three items,
          and it deliberately does NOT carry the old `flex items-center gap-3` string. Re-using it
          would let the R-1 gate's negative pass while the very row it names was still non-wrapping
          — the "added a wrapper and left the old row in place" defect that negative exists to
          catch.

          V-41-1: the title + RunStatusBadge cluster is the primary anchor and takes the first line
          when the row wraps. Replay is SECONDARY and right-aligned — a failed run's *status* is
          what the operator came to read; replay is what they do next. */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">
              Run #{run.id.slice(0, 8)}
            </h1>
            <RunStatusBadge status={run.status} />
            {run.dryRun && (
              <DryRunBadge />
            )}
          </div>
          {/* WRITTEN IN EXACTLY THIS SHAPE ON PURPOSE. The reshaped G-6 gate reads this site with
              `enclosingConditional`, which understands only `{<test> && ( … )}` and THROWS on a
              ternary, on an extracted `const`, or on an early return — and it asserts the test
              VERBATIM with `toBe`, so no second clause may be OR-ed in. That strictness is the
              point: an `|| isAdmin` here would render a button `replayWorkflowRun` then refuses
              (T-41-75). ABSENT, not disabled: a disabled button on every completed run is noise on
              a page that has no other action. And note `src/lib/workflows/replay.ts` exports no
              constant for this literal, deliberately — a `REPLAYABLE_RUN_STATUS` would make the
              scan unsatisfiable. The server action consumes `isRunReplayable` for the same
              decision, so the two cannot drift. */}
          {run.status === "failed" && (
            <ReplayRunButton workflowId={id} runId={run.id} />
          )}
        </div>
        {/* R-2 — `flex-wrap` added. This row gains a third item and its two existing ones already
            measure close to 241px in es-ES. Exactly the defect commit `c082430` fixed on the
            activities stats row. */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span>Started {startedAtFormatted}</span>
          <span>Duration: {formatDuration(run.startedAt, run.completedAt)}</span>
          {/* TERTIARY metadata (V-41-1): below the title cluster, never beside the title. It adds
              no size or colour class — it inherits `text-sm text-muted-foreground` from the row, so
              it cannot out-weigh its two siblings. The id is truncated to 8 characters, and the
              target route scopes its lookup by BOTH ids, so a stale or cross-workflow origin id
              404s rather than leaking (T-41-77). One direction only: no "replayed as …" reverse
              link on the origin, which would need a reverse query and a list — a chain can fan
              out — for no criterion. */}
          {run.replayedFromRunId && (
            <span>
              <Link
                href={`/workflows/${id}/runs/${run.replayedFromRunId}`}
                className="underline-offset-4 hover:underline"
              >
                {t("replay.lineage", {
                  runId: run.replayedFromRunId.slice(0, 8),
                })}
              </Link>
            </span>
          )}
        </div>
      </div>

      {run.status === "failed" && run.currentNodeId && (
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          Failed at: {nodeMap.get(run.currentNodeId) || run.currentNodeId}
          {run.error && (
            <span className="ml-1">&mdash; {run.error}</span>
          )}
        </div>
      )}

      <RunStepList steps={combinedSteps} />

      {/* Last block in the stack, and that is not arbitrary: reading order on this page is
          cause → effect. The header says what ran, the step list says what it did, and this
          says what it changed. Putting effects above causes would invert it. */}
      <RunChangedRecords records={changedRecords} failed={changedRecordsFailed} />
    </div>
  )
}
