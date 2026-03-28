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

const CRM_ENTITIES = ["deal", "person", "organization", "activity"] as const
const CRM_OPERATIONS = ["create", "update", "delete"] as const

interface Props {
  nodeId: string
  config: Record<string, unknown>
}

export function CrmConfig({ nodeId, config }: Props) {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig)

  const entity = (config.entity as string) ?? "deal"
  const operation = (config.operation as string) ?? "create"
  const targetId = (config.targetId as string) ?? ""
  const lookupField = (config.lookupField as string) ?? ""
  const lookupValue = (config.lookupValue as string) ?? ""
  const fieldMapping = (config.fieldMapping as Record<string, string>) ?? {}

  const mappingEntries = Object.entries(fieldMapping)
  const needsTarget = operation === "update" || operation === "delete"

  const update = (patch: Record<string, unknown>) => {
    updateNodeConfig(nodeId, patch)
  }

  const updateMapping = (oldKey: string, newKey: string, value: string) => {
    const updated = { ...fieldMapping }
    if (oldKey !== newKey) delete updated[oldKey]
    updated[newKey] = value
    update({ fieldMapping: updated })
  }

  const removeMapping = (key: string) => {
    const updated = { ...fieldMapping }
    delete updated[key]
    update({ fieldMapping: updated })
  }

  const addMapping = () => {
    update({ fieldMapping: { ...fieldMapping, "": "" } })
  }

  return (
    <div className="space-y-4 p-4">
      {/* Entity */}
      <div>
        <Label className="text-xs">Entity</Label>
        <Select value={entity} onValueChange={(v) => update({ entity: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CRM_ENTITIES.map((e) => (
              <SelectItem key={e} value={e}>
                {e.charAt(0).toUpperCase() + e.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Operation */}
      <div>
        <Label className="text-xs">Operation</Label>
        <Select
          value={operation}
          onValueChange={(v) => update({ operation: v })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CRM_OPERATIONS.map((o) => (
              <SelectItem key={o} value={o}>
                {o.charAt(0).toUpperCase() + o.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Target identification for update/delete */}
      {needsTarget && (
        <div className="space-y-3 rounded-lg border p-3">
          <Label className="text-xs font-semibold">Target Record</Label>
          <div>
            <Label className="text-xs">Target ID (direct)</Label>
            <Input
              value={targetId}
              onChange={(e) => update({ targetId: e.target.value })}
              placeholder="Record ID or variable"
            />
          </div>
          <p className="text-center text-xs text-muted-foreground">-- or --</p>
          <div>
            <Label className="text-xs">Lookup Field</Label>
            <Input
              value={lookupField}
              onChange={(e) => update({ lookupField: e.target.value })}
              placeholder="e.g. email"
            />
          </div>
          <div>
            <Label className="text-xs">Lookup Value</Label>
            <Input
              value={lookupValue}
              onChange={(e) => update({ lookupValue: e.target.value })}
              placeholder="e.g. {{trigger.data.email}}"
            />
          </div>
        </div>
      )}

      {/* Field Mapping */}
      {operation !== "delete" && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <Label className="text-xs">Field Mapping</Label>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={addMapping}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add
            </Button>
          </div>
          {mappingEntries.map(([key, value], i) => (
            <div key={i} className="mb-1 flex gap-1">
              <Input
                className="flex-1 text-xs"
                value={key}
                onChange={(e) => updateMapping(key, e.target.value, value)}
                placeholder="Field name"
              />
              <Input
                className="flex-1 text-xs"
                value={value}
                onChange={(e) => updateMapping(key, key, e.target.value)}
                placeholder="Value"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => removeMapping(key)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
