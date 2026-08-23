import Link from "next/link"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DryRunBadge } from "./dry-run-badge"
import { RunStatusBadge } from "./run-status-badge"
import { formatDuration } from "@/lib/workflows/format"
import type { WorkflowRun } from "@/db/schema/workflows"

interface RunsTableProps {
  runs: WorkflowRun[]
  total: number
  page: number
  limit: number
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

export function RunsTable({ runs, total, page, limit, workflowId }: RunsTableProps) {
  const totalPages = Math.ceil(total / limit)

  if (runs.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-lg border border-dashed">
        <div className="text-center">
          <p className="text-muted-foreground">No runs yet</p>
          <p className="text-sm text-muted-foreground">
            This workflow hasn&apos;t been executed yet. Runs will appear here once the workflow is triggered.
          </p>
        </div>
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
              <TableHead>Started At</TableHead>
              <TableHead>Completed At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => (
              <TableRow key={run.id} className="cursor-pointer">
                <TableCell>
                  <Link
                    href={`/workflows/${workflowId}/runs/${run.id}`}
                    className="flex flex-col gap-1"
                  >
                    <RunStatusBadge status={run.status} />
                    {/* An ORTHOGONAL second dimension, stacked under the status inside this cell's
                        existing flex-col: it adds no width, and Table already ships its own
                        overflow-x-auto. Without it a shown test run is indistinguishable from a
                        real run whose changed-records panel is inexplicably empty. */}
                    {run.dryRun && (
                      <DryRunBadge />
                    )}
                    {run.status === "failed" && run.currentNodeId && (
                      <span className="text-xs text-muted-foreground">
                        Failed at node {run.currentNodeId.slice(0, 8)}
                      </span>
                    )}
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
                <TableCell>
                  <Link href={`/workflows/${workflowId}/runs/${run.id}`}>
                    {formatDate(run.completedAt)}
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        // `flex-wrap` added by the G-3 sweep (plan 41-15), which found this row rather than being
        // told about it. Three items — "Previous", "Page N of M", "Next" — plus 32px of gap-4 in a
        // 241px budget, and the middle one is NOT a fixed width: `?page=` accepts up to
        // MAX_PAGE_DIGITS = 9 digits (`runs-filter.ts:50,176`), so "Page 123456789 of 123456789" is
        // a reachable string. With `justify-center` the wrapped rows stay centred, so the wrap costs
        // nothing at any width where it does not trigger.
        <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-sm">
          {page > 1 ? (
            <Link
              href={`/workflows/${workflowId}/runs?page=${page - 1}`}
              className="text-muted-foreground hover:underline"
            >
              &larr; Previous
            </Link>
          ) : (
            <span className="text-muted-foreground/50">&larr; Previous</span>
          )}
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={`/workflows/${workflowId}/runs?page=${page + 1}`}
              className="text-muted-foreground hover:underline"
            >
              Next &rarr;
            </Link>
          ) : (
            <span className="text-muted-foreground/50">Next &rarr;</span>
          )}
        </div>
      )}
    </div>
  )
}
