import { Suspense } from "react"
import { auth } from "@/auth"
import { db } from "@/db"
import { workflows, workflowRuns } from "@/db/schema/workflows"
import { eq, desc, count, and, sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import Link from "next/link"
import { parseRunsSearchParams } from "@/lib/workflows/runs-filter"
import { StatusFilter } from "./components/status-filter"
import { RunsTable } from "./components/runs-table"

const LIMIT = 20

export default async function WorkflowRunsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ status?: string; page?: string; dryRun?: string }>
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

  // The URL vocabulary lives in @/lib/workflows/runs-filter, which status-filter.tsx also writes.
  // One definition, because two copies of the whitelist is a chip that writes a status this page
  // drops. Every parser there is total: a crafted ?page= or ?status= renders a page, never throws.
  const { page, status, showDryRuns } = parseRunsSearchParams(sp)
  const offset = (page - 1) * LIMIT

  // Build where clause as an accumulator: the filters are independent dimensions, and a two-branch
  // ternary cannot express three of them.
  const conditions = [eq(workflowRuns.workflowId, id)]
  if (status) conditions.push(eq(workflowRuns.status, status))
  // Test runs are hidden by DEFAULT — the ABSENCE of ?dryRun=1 means real runs only, which is what
  // 41-CONTEXT locks in. Filtered in SQL, not in the client: a client-side filter would still ship
  // dry-run rows to the browser and would disagree with the count() below.
  // `dry_run` is NOT NULL DEFAULT false (migration 0019), so `= false` matches every pre-migration
  // row. It would match NONE if the column were ever relaxed to nullable — `NULL = false` is `NULL`.
  if (!showDryRuns) conditions.push(eq(workflowRuns.dryRun, false))
  const whereClause = and(...conditions)

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

      {/* R-4: the Select is w-[180px] and fits the 241px content budget at 320px; the checkbox and
          its label wrap to the line BELOW it, which is where V-41-1 puts a subordinate modifier. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
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
