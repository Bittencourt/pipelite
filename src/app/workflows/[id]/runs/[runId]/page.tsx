import { auth } from "@/auth"
import { db } from "@/db"
import { workflows, workflowRuns, workflowRunSteps } from "@/db/schema/workflows"
import type { WorkflowRunStepStatus } from "@/db/schema/workflows"
import { eq, and } from "drizzle-orm"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { RunStatusBadge } from "../components/run-status-badge"
import { formatDuration } from "@/lib/workflows/format"
import { RunStepList } from "./components/run-step-list"
import type { RunStep } from "./components/run-step-list"

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

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">
            Run #{run.id.slice(0, 8)}
          </h1>
          <RunStatusBadge status={run.status} />
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>Started {startedAtFormatted}</span>
          <span>Duration: {formatDuration(run.startedAt, run.completedAt)}</span>
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
    </div>
  )
}
