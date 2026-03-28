import { StepDetail } from "./step-detail"
import type { WorkflowRunStepStatus } from "@/db/schema/workflows"

export interface RunStep {
  nodeId: string
  nodeLabel: string
  status: WorkflowRunStepStatus
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
  error: string | null
  startedAt: Date | null
  completedAt: Date | null
  isSkipped: boolean
}

interface RunStepListProps {
  steps: RunStep[]
}

export function RunStepList({ steps }: RunStepListProps) {
  if (steps.length === 0) {
    return (
      <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
        No execution steps recorded
      </div>
    )
  }

  return (
    <div role="list" className="rounded-md border divide-y">
      {steps.map((step) => (
        <div key={step.nodeId} role="listitem">
          <StepDetail
            nodeLabel={step.nodeLabel}
            status={step.status}
            input={step.input}
            output={step.output}
            error={step.error}
            startedAt={step.startedAt}
            completedAt={step.completedAt}
            isSkipped={step.isSkipped}
          />
        </div>
      ))}
    </div>
  )
}
