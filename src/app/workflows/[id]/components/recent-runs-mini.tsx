import { db } from "@/db"
import { workflowRuns } from "@/db/schema/workflows"
import { eq, desc } from "drizzle-orm"
import Link from "next/link"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { RunStatusBadge } from "../runs/components/run-status-badge"
import { formatDuration } from "@/lib/workflows/format"

interface RecentRunsMiniProps {
  workflowId: string
}

function formatDate(date: Date | null): string {
  if (!date) return "---"
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export async function RecentRunsMini({ workflowId }: RecentRunsMiniProps) {
  const runs = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.workflowId, workflowId))
    .orderBy(desc(workflowRuns.createdAt))
    .limit(5)

  if (runs.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No runs yet
      </div>
    )
  }

  return (
    <div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Started</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => (
              <TableRow key={run.id} className="cursor-pointer">
                <TableCell>
                  <Link href={`/workflows/${workflowId}/runs/${run.id}`}>
                    <RunStatusBadge status={run.status} />
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/workflows/${workflowId}/runs/${run.id}`}>
                    {formatDuration(run.startedAt, run.completedAt)}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/workflows/${workflowId}/runs/${run.id}`}>
                    {formatDate(run.startedAt)}
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="mt-2 text-center">
        <Link
          href={`/workflows/${workflowId}/runs`}
          className="text-sm text-muted-foreground hover:underline"
        >
          View all runs &rarr;
        </Link>
      </div>
    </div>
  )
}
