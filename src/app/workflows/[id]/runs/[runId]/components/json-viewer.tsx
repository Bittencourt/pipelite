"use client"

import { useState } from "react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ChevronRight } from "lucide-react"

interface JsonViewerProps {
  label: string
  data: Record<string, unknown> | null
  defaultOpen?: boolean
}

export function JsonViewer({ label, data, defaultOpen = false }: JsonViewerProps) {
  const [open, setOpen] = useState(defaultOpen)

  if (data == null) return null

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium">
        <ChevronRight className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`} />
        {label}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre
          className="mt-2 overflow-x-auto rounded-md bg-muted p-4 font-mono text-xs"
          role="region"
          aria-label={label}
        >
          {JSON.stringify(data, null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  )
}
