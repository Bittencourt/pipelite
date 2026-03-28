"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useEditorStore } from "../../lib/editor-store"

const DELAY_MODES = [
  { value: "fixed", label: "Fixed Duration" },
  { value: "until", label: "Until Time" },
  { value: "field", label: "From Field" },
] as const

const DURATION_UNITS = ["minutes", "hours", "days"] as const

interface Props {
  nodeId: string
  config: Record<string, unknown>
}

export function DelayConfig({ nodeId, config }: Props) {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig)

  const mode = (config.mode as string) ?? "fixed"
  const duration = (config.duration as number) ?? 1
  const unit = (config.unit as string) ?? "hours"
  const untilTime = (config.untilTime as string) ?? ""
  const fieldPath = (config.fieldPath as string) ?? ""

  const update = (patch: Record<string, unknown>) => {
    updateNodeConfig(nodeId, patch)
  }

  return (
    <div className="space-y-4 p-4">
      {/* Mode */}
      <div>
        <Label className="text-xs">Delay Mode</Label>
        <Select value={mode} onValueChange={(v) => update({ mode: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DELAY_MODES.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Fixed duration */}
      {mode === "fixed" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Duration</Label>
            <Input
              type="number"
              min={1}
              value={duration}
              onChange={(e) =>
                update({ duration: Number(e.target.value) || 1 })
              }
            />
          </div>
          <div>
            <Label className="text-xs">Unit</Label>
            <Select value={unit} onValueChange={(v) => update({ unit: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_UNITS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u.charAt(0).toUpperCase() + u.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Until time */}
      {mode === "until" && (
        <div>
          <Label className="text-xs">Until Time</Label>
          <Input
            type="datetime-local"
            value={untilTime}
            onChange={(e) => update({ untilTime: e.target.value })}
          />
        </div>
      )}

      {/* Field path */}
      {mode === "field" && (
        <div>
          <Label className="text-xs">Field Path</Label>
          <Input
            value={fieldPath}
            onChange={(e) => update({ fieldPath: e.target.value })}
            placeholder="e.g. trigger.data.scheduledAt"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Path to a date/time field in the execution context
          </p>
        </div>
      )}
    </div>
  )
}
