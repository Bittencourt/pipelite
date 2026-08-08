import { auth } from "@/auth"
import { db } from "@/db"
import { workflows } from "@/db/schema/workflows"
import { eq } from "drizzle-orm"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RunStatsCard } from "./components/run-stats-card"
import { RecentRunsMini } from "./components/recent-runs-mini"

export default async function WorkflowOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const { id } = await params

  const [workflow] = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, id))
    .limit(1)

  if (!workflow) redirect("/workflows")

  return (
    <div className="container py-6">
      <Link
        href="/workflows"
        className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:underline"
      >
        &larr; Back to Workflows
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{workflow.name}</h1>
            <Badge variant={workflow.active ? "default" : "secondary"}>
              {workflow.active ? "Active" : "Inactive"}
            </Badge>
          </div>
          {workflow.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {workflow.description}
            </p>
          )}
        </div>
        <Button variant="outline" asChild>
          <Link href={`/workflows/${id}/edit`}>Edit workflow</Link>
        </Button>
      </div>

      <div className="space-y-6">
        <RunStatsCard workflowId={id} />
        <RecentRunsMini workflowId={id} />
      </div>
    </div>
  )
}
