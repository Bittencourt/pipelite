"use client"

import { useState } from "react"
import { Plus, Trash2, Copy } from "lucide-react"
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
import type { TriggerConfig as TriggerConfigType } from "@/lib/triggers/types"

const TRIGGER_TYPES = [
  { value: "crm_event", label: "CRM Event" },
  { value: "schedule", label: "Schedule" },
  { value: "webhook", label: "Webhook" },
  { value: "manual", label: "Manual" },
] as const

const CRM_ENTITIES = ["deal", "person", "organization", "activity"] as const
const CRM_ACTIONS = ["created", "updated", "deleted", "stage_changed"] as const
const SCHEDULE_MODES = ["interval", "cron"] as const

function CrmEventForm({
  trigger,
  onChange,
}: {
  trigger: TriggerConfigType & { type: "crm_event" }
  onChange: (t: TriggerConfigType) => void
}) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Entity</Label>
        <Select
          value={trigger.entity}
          onValueChange={(v) =>
            onChange({ ...trigger, entity: v as (typeof CRM_ENTITIES)[number] })
          }
        >
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
      <div>
        <Label className="text-xs">Action</Label>
        <Select
          value={trigger.action}
          onValueChange={(v) =>
            onChange({ ...trigger, action: v as (typeof CRM_ACTIONS)[number] })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CRM_ACTIONS.map((a) => (
              <SelectItem key={a} value={a}>
                {a.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Field Filters (comma-separated)</Label>
        <Input
          value={(trigger.fieldFilters ?? []).join(", ")}
          onChange={(e) =>
            onChange({
              ...trigger,
              fieldFilters: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          placeholder="e.g. title, amount"
        />
      </div>
      {trigger.action === "stage_changed" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">From Stage ID</Label>
            <Input
              value={trigger.fromStageId ?? ""}
              onChange={(e) =>
                onChange({
                  ...trigger,
                  fromStageId: e.target.value || undefined,
                })
              }
              placeholder="Optional"
            />
          </div>
          <div>
            <Label className="text-xs">To Stage ID</Label>
            <Input
              value={trigger.toStageId ?? ""}
              onChange={(e) =>
                onChange({
                  ...trigger,
                  toStageId: e.target.value || undefined,
                })
              }
              placeholder="Optional"
            />
          </div>
        </div>
      )}
    </div>
  )
}

function ScheduleForm({
  trigger,
  onChange,
}: {
  trigger: TriggerConfigType & { type: "schedule" }
  onChange: (t: TriggerConfigType) => void
}) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Mode</Label>
        <Select
          value={trigger.mode}
          onValueChange={(v) =>
            onChange({
              ...trigger,
              mode: v as (typeof SCHEDULE_MODES)[number],
            })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="interval">Interval</SelectItem>
            <SelectItem value="cron">Cron</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {trigger.mode === "interval" && (
        <div>
          <Label className="text-xs">Interval (minutes)</Label>
          <Input
            type="number"
            min={1}
            value={trigger.intervalMinutes ?? ""}
            onChange={(e) =>
              onChange({
                ...trigger,
                intervalMinutes: e.target.value
                  ? Number(e.target.value)
                  : undefined,
              })
            }
            placeholder="e.g. 60"
          />
        </div>
      )}
      {trigger.mode === "cron" && (
        <div>
          <Label className="text-xs">Cron Expression</Label>
          <Input
            value={trigger.cronExpression ?? ""}
            onChange={(e) =>
              onChange({
                ...trigger,
                cronExpression: e.target.value || undefined,
              })
            }
            placeholder="e.g. 0 */6 * * *"
          />
        </div>
      )}
    </div>
  )
}

function WebhookForm({
  trigger,
}: {
  trigger: TriggerConfigType & { type: "webhook" }
}) {
  const workflowId = useEditorStore((s) => s.workflowId)
  const webhookUrl = workflowId
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/in/${workflowId}/${trigger.secret}`
    : "Save workflow first"

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Webhook URL</Label>
        <div className="flex gap-1">
          <Input value={webhookUrl} readOnly className="text-xs font-mono" />
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => navigator.clipboard.writeText(webhookUrl)}
            title="Copy URL"
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div>
        <Label className="text-xs">Secret</Label>
        <div className="flex gap-1">
          <Input
            value={trigger.secret}
            readOnly
            className="text-xs font-mono"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => navigator.clipboard.writeText(trigger.secret)}
            title="Copy secret"
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function SingleTriggerForm({
  trigger,
  index,
  onChange,
  onRemove,
}: {
  trigger: TriggerConfigType
  index: number
  onChange: (t: TriggerConfigType) => void
  onRemove: () => void
}) {
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold">Trigger {index + 1}</Label>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div>
        <Label className="text-xs">Type</Label>
        <Select
          value={trigger.type}
          onValueChange={(v) => {
            const type = v as TriggerConfigType["type"]
            switch (type) {
              case "crm_event":
                onChange({
                  type: "crm_event",
                  entity: "deal",
                  action: "created",
                  fieldFilters: [],
                })
                break
              case "schedule":
                onChange({ type: "schedule", mode: "interval" })
                break
              case "webhook":
                onChange({
                  type: "webhook",
                  secret: crypto.randomUUID().replace(/-/g, ""),
                  responseStatusCode: 200,
                })
                break
              case "manual":
                onChange({ type: "manual" })
                break
            }
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRIGGER_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {trigger.type === "crm_event" && (
        <CrmEventForm trigger={trigger} onChange={onChange} />
      )}
      {trigger.type === "schedule" && (
        <ScheduleForm trigger={trigger} onChange={onChange} />
      )}
      {trigger.type === "webhook" && <WebhookForm trigger={trigger} />}
      {trigger.type === "manual" && (
        <p className="text-xs text-muted-foreground">
          This workflow runs manually.
        </p>
      )}
    </div>
  )
}

export function TriggerConfig() {
  const triggers = useEditorStore((s) => s.triggers)
  const setTriggers = useEditorStore((s) => s.setTriggers)

  const addTrigger = () => {
    setTriggers([...triggers, { type: "manual" }])
  }

  const updateTrigger = (index: number, trigger: TriggerConfigType) => {
    const updated = [...triggers]
    updated[index] = trigger
    setTriggers(updated)
  }

  const removeTrigger = (index: number) => {
    setTriggers(triggers.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-3 p-4">
      {triggers.map((trigger, i) => (
        <SingleTriggerForm
          key={i}
          trigger={trigger}
          index={i}
          onChange={(t) => updateTrigger(i, t)}
          onRemove={() => removeTrigger(i)}
        />
      ))}
      <Button variant="outline" className="w-full" onClick={addTrigger}>
        <Plus className="mr-2 h-4 w-4" />
        Add Trigger
      </Button>
    </div>
  )
}
