import { db } from "@/db"
import { workflowRuns } from "@/db/schema/workflows"
import { and, eq, desc } from "drizzle-orm"
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
    // D-A7 — A QUERY-ONLY EDIT, and deliberately so. This file is absent from 41-UI-SPEC's Surface
    // Inventory, whose completeness rule makes an addition a scope violation rather than an
    // improvement. Nothing new is rendered here: no element, no class string, no copy — only this
    // second `where` condition. It IMPLEMENTS 41-CONTEXT's "filtered out of the runs list by
    // default" in the SECOND place runs are listed. Without it a dry run shows up in the overview's
    // Recent Runs, unbadged and indistinguishable from a real run, and pushes a real run out of the
    // top 5. `dry_run` is NOT NULL DEFAULT false (migration 0019), so `= false` matches every
    // pre-migration row; it would match none over a nullable column, since `NULL = false` is `NULL`.
    .where(and(eq(workflowRuns.workflowId, workflowId), eq(workflowRuns.dryRun, false)))
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
