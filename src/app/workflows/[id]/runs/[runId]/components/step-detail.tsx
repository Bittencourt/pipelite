"use client"

import { useState } from "react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { RunStatusBadge } from "../../components/run-status-badge"
import { formatDuration } from "@/lib/workflows/format"
import { JsonViewer } from "./json-viewer"
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Circle,
  SkipForward,
} from "lucide-react"
import type { WorkflowRunStepStatus } from "@/db/schema/workflows"

interface StepDetailProps {
  nodeLabel: string
  status: WorkflowRunStepStatus
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
  error: string | null
  startedAt: Date | null
  completedAt: Date | null
  isSkipped: boolean
}

const statusIcons: Record<WorkflowRunStepStatus, React.ReactNode> = {
  completed: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  failed: <XCircle className="h-4 w-4 text-destructive" />,
  running: <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />,
  waiting: <Clock className="h-4 w-4 text-amber-600" />,
  skipped: <SkipForward className="h-4 w-4 text-muted-foreground" />,
  pending: <Circle className="h-4 w-4 text-muted-foreground" />,
}

export function StepDetail({
  nodeLabel,
  status,
  input,
  output,
  error,
  startedAt,
  completedAt,
  isSkipped,
}: StepDetailProps) {
  const [open, setOpen] = useState(status === "failed")
  const [errorExpanded, setErrorExpanded] = useState(false)
  const icon = statusIcons[status] ?? statusIcons.pending

  if (isSkipped) {
    return (
      <div className="flex items-center justify-between border-b px-4 py-3 opacity-50">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm">{nodeLabel}</span>
        </div>
        <RunStatusBadge status="skipped" />
      </div>
    )
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <div
          className={`flex items-center justify-between border-b px-4 py-3 hover:bg-muted/50 cursor-pointer${
            status === "failed" ? " border-l-4 border-destructive" : ""
          }`}
        >
          <div className="flex items-center gap-2">
            {icon}
            <span className="text-sm font-medium">{nodeLabel}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {formatDuration(startedAt, completedAt)}
            </span>
            <RunStatusBadge status={status} />
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-3 px-4 py-3 pl-10">
          {status === "failed" && error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
              <Collapsible open={errorExpanded} onOpenChange={setErrorExpanded}>
                <CollapsibleTrigger className="mt-2 block text-xs font-medium underline">
                  Raw error details
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="mt-2 font-mono text-xs whitespace-pre-wrap">
                    {error}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
          <JsonViewer label="Input data" data={input} />
          <JsonViewer label="Output data" data={output} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
