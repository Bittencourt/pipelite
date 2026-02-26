"use client"

import { useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CustomFieldDefinition } from "@/db/schema"

interface BooleanFieldProps {
  definition: CustomFieldDefinition
  value: boolean | null | undefined
  onSave: (value: boolean) => Promise<void>
  disabled?: boolean
}

export function BooleanField({ definition, value, onSave, disabled }: BooleanFieldProps) {
  const [isSaving, setIsSaving] = useState(false)
  const checked = value === true

  const handleCheckedChange = async (newValue: boolean) => {
    if (disabled || isSaving) return
    
    setIsSaving(true)
    try {
      await onSave(newValue)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <label className={cn(
      "flex items-center gap-2 cursor-pointer",
      (disabled || isSaving) && "cursor-not-allowed opacity-50"
    )}>
      <Checkbox
        checked={checked}
        onCheckedChange={handleCheckedChange}
        disabled={disabled || isSaving}
      />
      <span className="text-sm">
        {definition.name}
        {definition.required && <span className="text-destructive ml-1">*</span>}
      </span>
      {isSaving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
    </label>
  )
}
