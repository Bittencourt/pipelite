// Execution engine type definitions

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "greater_than"
  | "less_than"
  | "greater_than_or_equals"
  | "less_than_or_equals"
  | "is_empty"
  | "is_not_empty"
  | "starts_with"
  | "ends_with"
  | "matches_regex"
  | "in_list"
  | "not_in_list"

export interface Condition {
  fieldPath: string
  operator: ConditionOperator
  value: unknown
}

export interface ConditionGroup {
  operator: "and" | "or"
  conditions: Condition[]
}

export interface DelayConfig {
  mode: "fixed" | "until" | "field"
  duration?: number
  unit?: "minutes" | "hours" | "days"
  untilTime?: string
  fieldPath?: string
}

export interface WorkflowNode {
  id: string
  type: "condition" | "delay" | "action"
  label: string
  config: Record<string, unknown>
  nextNodeId: string | null
}

export interface ConditionNode extends WorkflowNode {
  type: "condition"
  config: {
    groups: ConditionGroup[]
    logicOperator: "and" | "or"
  }
  trueBranch: string | null
  falseBranch: string | null
}

export interface DelayNode extends WorkflowNode {
  type: "delay"
  config: DelayConfig
}

export interface ExecutionContext {
  trigger: {
    type: string
    data: Record<string, unknown>
  }
  nodes: Record<
    string,
    {
      output: Record<string, unknown>
      status: "completed" | "failed" | "skipped"
    }
  >
}

export interface NodeExecutionResult {
  type: "completed" | "condition" | "delay"
  output?: Record<string, unknown>
  matched?: boolean
  resumeAt?: Date
}
