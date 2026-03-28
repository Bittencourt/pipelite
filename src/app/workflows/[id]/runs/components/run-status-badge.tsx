import { Badge } from "@/components/ui/badge"
import type { WorkflowStatus, WorkflowRunStepStatus } from "@/db/schema/workflows"

type Status = WorkflowStatus | WorkflowRunStepStatus

interface RunStatusBadgeProps {
  status: Status
}

const statusConfig: Record<Status, { label: string; variant?: "destructive" | "secondary" | "outline"; className?: string }> = {
  completed: {
    label: "Completed",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  },
  failed: {
    label: "Failed",
    variant: "destructive",
  },
  running: {
    label: "Running",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  },
  waiting: {
    label: "Waiting",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  },
  pending: {
    label: "Pending",
    variant: "secondary",
  },
  skipped: {
    label: "Skipped",
    variant: "outline",
  },
}

export function RunStatusBadge({ status }: RunStatusBadgeProps) {
  const config = statusConfig[status] ?? { label: status, variant: "secondary" as const }

  return (
    <Badge
      variant={config.variant}
      className={config.className}
      aria-label={`Status: ${config.label}`}
    >
      {config.label}
    </Badge>
  )
}
