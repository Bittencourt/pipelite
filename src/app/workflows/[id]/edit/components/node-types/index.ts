import { TriggerNode } from "./trigger-node"
import { ActionNode } from "./action-node"
import { ConditionNode } from "./condition-node"
import { DelayNode } from "./delay-node"
import { SplitNode } from "./split-node"
import { AddButtonEdge } from "./add-button-edge"

export const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  delay: DelayNode,
  split: SplitNode,
}

export const edgeTypes = {
  addButton: AddButtonEdge,
}
