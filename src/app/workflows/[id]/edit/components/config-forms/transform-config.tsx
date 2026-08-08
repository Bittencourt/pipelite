"use client"

import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useEditorStore } from "../../lib/editor-store"

interface Props {
  nodeId: string
  config: Record<string, unknown>
}

export function TransformConfig({ nodeId, config }: Props) {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig)

  const code = (config.code as string) ?? ""

  return (
    <div className="space-y-4 p-4">
      {/* Code editor */}
      <div>
        <Label className="text-xs">JavaScript Code</Label>
        <Textarea
          value={code}
          onChange={(e) => updateNodeConfig(nodeId, { code: e.target.value })}
          placeholder="// Transform the input data&#10;return { ...input, processed: true }"
          className="min-h-[200px] font-mono text-xs"
        />
      </div>

      {/* Help text */}
      <div className="rounded-lg border bg-muted/50 p-3">
        <p className="mb-2 text-xs font-semibold">Available Globals</p>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>
            <code className="font-mono text-foreground">input</code> --{" "}
            <code className="font-mono">{"{ trigger, nodes }"}</code>. Trigger
            data is at{" "}
            <code className="font-mono">input.trigger.data</code>; outputs of
            earlier nodes are at{" "}
            <code className="font-mono">
              input.nodes.&lt;nodeId&gt;.output
            </code>
          </li>
          <li>
            <code className="font-mono text-foreground">console.log(...)</code>{" "}
            -- Logged messages are captured and returned with the node output
          </li>
          <li>
            <code className="font-mono text-foreground">MATH</code> -- abs,
            ceil, floor, round, max, min, sqrt, pow, log, log10, exp
          </li>
          <li>
            <code className="font-mono text-foreground">TEXT</code> -- upper,
            lower, trim, length, len, substring, replace, contains, startsWith,
            endsWith, split, join, left, right, concat
          </li>
          <li>
            <code className="font-mono text-foreground">DATE</code> -- today,
            now, addDays, addMonths, diffDays, format, parseDate, year, month,
            day, days
          </li>
          <li>
            <code className="font-mono text-foreground">LOGIC</code> -- if,
            and, or, not, isBlank, isNumber
          </li>
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          Your code must <code className="font-mono">return</code> an object.
        </p>
      </div>
    </div>
  )
}
