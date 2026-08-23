import { db } from "@/db"
import { workflowRuns } from "@/db/schema/workflows"
import { and, eq, count, sql } from "drizzle-orm"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface RunStatsCardProps {
  workflowId: string
}

function formatRelativeTime(date: Date | null): string {
  if (!date) return "Never"
  const now = Date.now()
  const diffMs = now - date.getTime()
  if (diffMs < 0) return "Just now"

  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

export async function RunStatsCard({ workflowId }: RunStatsCardProps) {
  // TEST RUNS ARE EXCLUDED (WR-03). This card sits immediately above `RecentRunsMini`, which now
  // filters them out, so counting them here made the two adjacent panels disagree: one successful
  // production run and four failed test runs rendered "Total Runs 5 · Success Rate 20% · Last Run
  // 2m ago" above a Recent Runs list showing a single row from three days ago. The operator's
  // headline health metric for the workflow would be driven by their own testing.
  //
  // `and(...)`, not a second `.where(...)`: drizzle OVERWRITES a chained where rather than
  // conjoining it.
  const [stats] = await db
    .select({
      total: count(),
      completed: sql<number>`count(*) filter (where ${workflowRuns.status} = 'completed')`,
      lastRunAt: sql<Date | null>`max(${workflowRuns.startedAt})`,
    })
    .from(workflowRuns)
    .where(and(eq(workflowRuns.workflowId, workflowId), eq(workflowRuns.dryRun, false)))

  const successRate = stats.total > 0
    ? Math.round((stats.completed / stats.total) * 100)
    : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Run History</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Total Runs</p>
            <p className="text-2xl font-semibold">{stats.total}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Success Rate</p>
            <p className="text-2xl font-semibold">{successRate}%</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Last Run</p>
            <p className="text-2xl font-semibold">
              {formatRelativeTime(stats.lastRunAt ? new Date(stats.lastRunAt) : null)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
