import { Suspense } from "react"
import { auth } from "@/auth"
import { db } from "@/db"
import { workflows, workflowRuns } from "@/db/schema/workflows"
import type { WorkflowStatus } from "@/db/schema/workflows"
import { eq, desc, count, and, sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import Link from "next/link"
import { StatusFilter } from "./components/status-filter"
import { RunsTable } from "./components/runs-table"

const VALID_STATUSES = new Set<WorkflowStatus>(["pending", "running", "completed", "failed", "waiting"])
const LIMIT = 20

export default async function WorkflowRunsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ status?: string; page?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const { id } = await params
  const sp = await searchParams

  // Load workflow name
  const [workflow] = await db
    .select({ id: workflows.id, name: workflows.name })
    .from(workflows)
    .where(eq(workflows.id, id))
    .limit(1)

  if (!workflow) redirect("/workflows")

  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1)
  const offset = (page - 1) * LIMIT

  // Build where clause
  const statusFilter = sp.status && VALID_STATUSES.has(sp.status as WorkflowStatus)
    ? sp.status as WorkflowStatus
    : null

  const whereClause = statusFilter
    ? and(eq(workflowRuns.workflowId, id), eq(workflowRuns.status, statusFilter))
    : eq(workflowRuns.workflowId, id)

  // Query runs and total count in parallel
  const [runs, [{ total }]] = await Promise.all([
    db
      .select()
      .from(workflowRuns)
      .where(whereClause)
      .orderBy(desc(workflowRuns.createdAt))
      .limit(LIMIT)
      .offset(offset),
    db
      .select({ total: count() })
      .from(workflowRuns)
      .where(whereClause),
  ])

  return (
    <div className="container py-6">
      <Link
        href={`/workflows/${id}`}
        className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:underline"
      >
        &larr; Back to Workflow
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold">Workflow Runs</h1>
        <p className="text-sm text-muted-foreground">
          Execution history for &quot;{workflow.name}&quot;
        </p>
      </div>

      <div className="mb-4">
        <Suspense fallback={null}>
          <StatusFilter workflowId={id} />
        </Suspense>
      </div>

      <RunsTable
        runs={runs}
        total={total}
        page={page}
        limit={LIMIT}
        workflowId={id}
      />
    </div>
  )
}
