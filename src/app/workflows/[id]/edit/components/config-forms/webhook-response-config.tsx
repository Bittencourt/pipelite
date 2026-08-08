"use client"

import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useEditorStore } from "../../lib/editor-store"
import { VariableTextarea } from "../variable-picker/variable-field"

interface Props {
  nodeId: string
  config: Record<string, unknown>
}

/** Stringify the stored body (object) for display in the textarea. */
function bodyToText(body: unknown): string {
  if (body == null) return ""
  if (typeof body === "string") return body
  try {
    return JSON.stringify(body, null, 2)
  } catch {
    return ""
  }
}

export function WebhookResponseConfig({ nodeId, config }: Props) {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig)

  const statusCode = (config.statusCode as number) ?? 200

  // Local text state for the textarea; the stored config.body is always
  // a parsed JSON object (or undefined), never a raw string.
  const [bodyText, setBodyText] = useState(() => bodyToText(config.body))
  const [bodyInvalid, setBodyInvalid] = useState(false)

  // Reset local text when switching to a different node.
  useEffect(() => {
    setBodyText(bodyToText(config.body))
    setBodyInvalid(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId])

  const update = (patch: Record<string, unknown>) => {
    updateNodeConfig(nodeId, patch)
  }

  const handleBodyChange = (v: string) => {
    setBodyText(v)

    if (v.trim() === "") {
      // Empty input: omit the body entirely.
      setBodyInvalid(false)
      update({ body: undefined })
      return
    }

    try {
      const parsed: unknown = JSON.parse(v)
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        setBodyInvalid(false)
        update({ body: parsed })
        return
      }
    } catch {
      // fall through to invalid state
    }

    // Not a valid JSON object: don't store the raw string (the execution
    // handler expects an object). Keep the last valid value and hint.
    setBodyInvalid(true)
  }

  return (
    <div className="space-y-4 p-4">
      {/* Status Code */}
      <div>
        <Label className="text-xs">Status Code</Label>
        <Input
          type="number"
          min={200}
          max={599}
          value={statusCode}
          onChange={(e) =>
            update({ statusCode: Number(e.target.value) || 200 })
          }
        />
        <p className="mt-1 text-xs text-muted-foreground">
          HTTP status code to return (200-599)
        </p>
      </div>

      {/* Response Body */}
      <div>
        <Label className="text-xs">Response Body (JSON)</Label>
        <VariableTextarea
          value={bodyText}
          onChange={handleBodyChange}
          nodeId={nodeId}
          placeholder='{"success": true, "message": "Processed"}'
          className="min-h-[120px] font-mono text-xs"
        />
        {bodyInvalid && (
          <p className="mt-1 text-xs text-destructive">
            Invalid JSON — must be a JSON object, e.g.{" "}
            {'{"success": true}'}. Changes are not saved until valid.
          </p>
        )}
      </div>
    </div>
  )
}
