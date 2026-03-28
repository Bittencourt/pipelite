import { TriggerNode } from "./trigger-node"
import { ActionNode } from "./action-node"
import { ConditionNode } from "./condition-node"
import { DelayNode } from "./delay-node"
import { AddButtonEdge } from "./add-button-edge"

export const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  delay: DelayNode,
}

export const edgeTypes = {
  addButton: AddButtonEdge,
}
