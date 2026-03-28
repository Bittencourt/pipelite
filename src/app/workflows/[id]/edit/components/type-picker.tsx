"use client"

import {
  Globe,
  Database,
  Mail,
  Bell,
  GitBranch,
  Clock,
  Code,
  Webhook,
} from "lucide-react"
import { useEditorStore } from "../lib/editor-store"

interface NodeOption {
  label: string
  icon: React.ComponentType<{ className?: string }>
  colorClass: string
  type: "action" | "condition" | "delay"
  actionType?: string
}

const NODE_OPTIONS: NodeOption[] = [
  {
    label: "HTTP Request",
    icon: Globe,
    colorClass: "text-green-600 bg-green-50",
    type: "action",
    actionType: "http_request",
  },
  {
    label: "CRM Action",
    icon: Database,
    colorClass: "text-green-600 bg-green-50",
    type: "action",
    actionType: "crm_action",
  },
  {
    label: "Email",
    icon: Mail,
    colorClass: "text-green-600 bg-green-50",
    type: "action",
    actionType: "email",
  },
  {
    label: "Notification",
    icon: Bell,
    colorClass: "text-green-600 bg-green-50",
    type: "action",
    actionType: "notification",
  },
  {
    label: "Condition",
    icon: GitBranch,
    colorClass: "text-amber-600 bg-amber-50",
    type: "condition",
  },
  {
    label: "Delay",
    icon: Clock,
    colorClass: "text-purple-600 bg-purple-50",
    type: "delay",
  },
  {
    label: "JS Transform",
    icon: Code,
    colorClass: "text-green-600 bg-green-50",
    type: "action",
    actionType: "javascript_transform",
  },
  {
    label: "Webhook Response",
    icon: Webhook,
    colorClass: "text-green-600 bg-green-50",
    type: "action",
    actionType: "webhook_response",
  },
]

export function TypePicker() {
  const addNode = useEditorStore((s) => s.addNode)

  return (
    <div className="grid grid-cols-2 gap-3 p-4">
      {NODE_OPTIONS.map((option) => {
        const Icon = option.icon
        return (
          <button
            key={option.actionType ?? option.type}
            className="flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors hover:bg-muted"
            onClick={() => addNode(option.type, option.actionType)}
          >
            <div className={`rounded-md p-2 ${option.colorClass}`}>
              <Icon className="h-5 w-5" />
            </div>
            <span className="text-sm font-medium">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
