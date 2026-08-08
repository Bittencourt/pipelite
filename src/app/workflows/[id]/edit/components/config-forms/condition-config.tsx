"use client"

import { Plus, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { useEditorStore } from "../../lib/editor-store"
import { VariableInput } from "../variable-picker/variable-field"
import type { ConditionOperator, Condition, ConditionGroup } from "@/lib/execution/types"

const OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Not Equals" },
  { value: "contains", label: "Contains" },
  { value: "not_contains", label: "Not Contains" },
  { value: "greater_than", label: "Greater Than" },
  { value: "less_than", label: "Less Than" },
  { value: "greater_than_or_equals", label: ">= " },
  { value: "less_than_or_equals", label: "<=" },
  { value: "is_empty", label: "Is Empty" },
  { value: "is_not_empty", label: "Is Not Empty" },
  { value: "starts_with", label: "Starts With" },
  { value: "ends_with", label: "Ends With" },
  { value: "matches_regex", label: "Matches Regex" },
  { value: "in_list", label: "In List" },
  { value: "not_in_list", label: "Not In List" },
]

interface Props {
  nodeId: string
  config: Record<string, unknown>
}

export function ConditionConfig({ nodeId, config }: Props) {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig)

  const groups = (config.groups as ConditionGroup[]) ?? []
  const logicOperator = (config.logicOperator as "and" | "or") ?? "and"

  const update = (patch: Record<string, unknown>) => {
    updateNodeConfig(nodeId, patch)
  }

  const updateGroups = (newGroups: ConditionGroup[]) => {
    update({ groups: newGroups })
  }

  const addGroup = () => {
    updateGroups([
      ...groups,
      {
        operator: "and",
        conditions: [{ fieldPath: "", operator: "equals", value: "" }],
      },
    ])
  }

  const removeGroup = (groupIdx: number) => {
    updateGroups(groups.filter((_, i) => i !== groupIdx))
  }

  const updateGroupOperator = (groupIdx: number, op: "and" | "or") => {
    const updated = [...groups]
    updated[groupIdx] = { ...updated[groupIdx], operator: op }
    updateGroups(updated)
  }

  const addCondition = (groupIdx: number) => {
    const updated = [...groups]
    updated[groupIdx] = {
      ...updated[groupIdx],
      conditions: [
        ...updated[groupIdx].conditions,
        { fieldPath: "", operator: "equals", value: "" },
      ],
    }
    updateGroups(updated)
  }

  const removeCondition = (groupIdx: number, condIdx: number) => {
    const updated = [...groups]
    updated[groupIdx] = {
      ...updated[groupIdx],
      conditions: updated[groupIdx].conditions.filter((_, i) => i !== condIdx),
    }
    updateGroups(updated)
  }

  const updateCondition = (
    groupIdx: number,
    condIdx: number,
    patch: Partial<Condition>,
  ) => {
    const updated = [...groups]
    const conditions = [...updated[groupIdx].conditions]
    conditions[condIdx] = { ...conditions[condIdx], ...patch }
    updated[groupIdx] = { ...updated[groupIdx], conditions }
    updateGroups(updated)
  }

  return (
    <div className="space-y-4 p-4">
      {/* Overall logic operator between groups */}
      <div>
        <Label className="text-xs">Between Groups</Label>
        <Select
          value={logicOperator}
          onValueChange={(v) => update({ logicOperator: v })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="and">AND</SelectItem>
            <SelectItem value="or">OR</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Condition groups */}
      {groups.map((group, gi) => (
        <div key={gi} className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-semibold">Group {gi + 1}</Label>
              <Select
                value={group.operator}
                onValueChange={(v) =>
                  updateGroupOperator(gi, v as "and" | "or")
                }
              >
                <SelectTrigger className="h-7 w-20 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="and">AND</SelectItem>
                  <SelectItem value="or">OR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => removeGroup(gi)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {group.conditions.map((cond, ci) => (
            <div key={ci} className="space-y-1 rounded border p-2">
              <div className="flex items-center gap-1">
                <VariableInput
                  className="flex-1 text-xs"
                  value={cond.fieldPath}
                  onChange={(v) =>
                    updateCondition(gi, ci, { fieldPath: v })
                  }
                  nodeId={nodeId}
                  placeholder="Field path"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => removeCondition(gi, ci)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <Select
                value={cond.operator}
                onValueChange={(v) =>
                  updateCondition(gi, ci, {
                    operator: v as ConditionOperator,
                  })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERATORS.map((op) => (
                    <SelectItem key={op.value} value={op.value}>
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!["is_empty", "is_not_empty"].includes(cond.operator) && (
                <VariableInput
                  className="text-xs"
                  value={String(cond.value ?? "")}
                  onChange={(v) =>
                    updateCondition(gi, ci, { value: v })
                  }
                  nodeId={nodeId}
                  placeholder="Value"
                />
              )}
            </div>
          ))}

          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => addCondition(gi)}
          >
            <Plus className="mr-1 h-3 w-3" />
            Add Condition
          </Button>
        </div>
      ))}

      {/* Between-group separator */}
      {groups.length > 0 && groups.length > 1 && (
        <p className="text-center text-xs font-medium text-muted-foreground uppercase">
          {logicOperator}
        </p>
      )}

      <Button variant="outline" className="w-full" onClick={addGroup}>
        <Plus className="mr-2 h-4 w-4" />
        Add Condition Group
      </Button>
    </div>
  )
}
