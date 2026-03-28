"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useEditorStore } from "../../lib/editor-store"

interface Props {
  nodeId: string
  config: Record<string, unknown>
}

export function NotificationConfig({ nodeId, config }: Props) {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig)

  const userIds = (config.userIds as string[]) ?? []
  const message = (config.message as string) ?? ""

  const update = (patch: Record<string, unknown>) => {
    updateNodeConfig(nodeId, patch)
  }

  return (
    <div className="space-y-4 p-4">
      {/* User IDs */}
      <div>
        <Label className="text-xs">User IDs (comma-separated)</Label>
        <Input
          value={userIds.join(", ")}
          onChange={(e) =>
            update({
              userIds: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          placeholder="user-id-1, user-id-2"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Enter user IDs separated by commas
        </p>
      </div>

      {/* Message */}
      <div>
        <Label className="text-xs">Message</Label>
        <Textarea
          value={message}
          onChange={(e) => update({ message: e.target.value })}
          placeholder="Notification message content"
          className="min-h-[100px]"
        />
      </div>
    </div>
  )
}
