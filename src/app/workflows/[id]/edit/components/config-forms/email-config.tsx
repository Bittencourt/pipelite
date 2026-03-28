"use client"

import { Plus, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { useEditorStore } from "../../lib/editor-store"

interface Recipient {
  type: "user" | "dynamic"
  value: string
}

interface Props {
  nodeId: string
  config: Record<string, unknown>
}

export function EmailConfig({ nodeId, config }: Props) {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig)

  const recipients = (config.recipients as Recipient[]) ?? []
  const subject = (config.subject as string) ?? ""
  const body = (config.body as string) ?? ""

  const update = (patch: Record<string, unknown>) => {
    updateNodeConfig(nodeId, patch)
  }

  const addRecipient = () => {
    update({ recipients: [...recipients, { type: "user" as const, value: "" }] })
  }

  const updateRecipient = (index: number, patch: Partial<Recipient>) => {
    const updated = [...recipients]
    updated[index] = { ...updated[index], ...patch }
    update({ recipients: updated })
  }

  const removeRecipient = (index: number) => {
    update({ recipients: recipients.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-4 p-4">
      {/* Recipients */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <Label className="text-xs">Recipients</Label>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={addRecipient}
          >
            <Plus className="mr-1 h-3 w-3" />
            Add
          </Button>
        </div>
        {recipients.map((r, i) => (
          <div key={i} className="mb-1 flex gap-1">
            <Select
              value={r.type}
              onValueChange={(v) =>
                updateRecipient(i, { type: v as "user" | "dynamic" })
              }
            >
              <SelectTrigger className="w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="dynamic">Dynamic</SelectItem>
              </SelectContent>
            </Select>
            <Input
              className="flex-1 text-xs"
              value={r.value}
              onChange={(e) => updateRecipient(i, { value: e.target.value })}
              placeholder={r.type === "user" ? "User ID" : "{{variable}}"}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => removeRecipient(i)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      {/* Subject */}
      <div>
        <Label className="text-xs">Subject</Label>
        <Input
          value={subject}
          onChange={(e) => update({ subject: e.target.value })}
          placeholder="Email subject line"
        />
      </div>

      {/* Body */}
      <div>
        <Label className="text-xs">Body</Label>
        <Textarea
          value={body}
          onChange={(e) => update({ body: e.target.value })}
          placeholder="Email body content"
          className="min-h-[120px]"
        />
      </div>
    </div>
  )
}
