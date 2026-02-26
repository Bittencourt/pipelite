"use client"

import { useState, useCallback } from "react"
import { X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { CustomFieldDefinition, SelectConfig } from "@/db/schema"

interface MultiSelectFieldProps {
  definition: CustomFieldDefinition
  value: string[] | null | undefined
  onSave: (value: string[] | null) => Promise<void>
  disabled?: boolean
}

export function MultiSelectField({ definition, value, onSave, disabled }: MultiSelectFieldProps) {
  const [isSaving, setIsSaving] = useState(false)
  const selected = value || []
  const config = definition.config as SelectConfig | null
  const options = config?.options || []
  const availableOptions = options.filter(opt => !selected.includes(opt))

  const handleAdd = useCallback(async (option: string) => {
    if (selected.includes(option) || isSaving) return
    setIsSaving(true)
    try {
      await onSave([...selected, option])
    } finally {
      setIsSaving(false)
    }
  }, [selected, isSaving, onSave])

  const handleRemove = useCallback(async (option: string) => {
    if (isSaving) return
    setIsSaving(true)
    try {
      const newSelected = selected.filter(s => s !== option)
      await onSave(newSelected.length > 0 ? newSelected : null)
    } finally {
      setIsSaving(false)
    }
  }, [selected, isSaving, onSave])

  return (
    <div className="py-1">
      <div className="flex flex-wrap gap-1">
        {selected.map(opt => (
          <Badge key={opt} variant="secondary" className="gap-1 pr-1">
            {opt}
            <button
              type="button"
              onClick={() => !disabled && handleRemove(opt)}
              disabled={disabled || isSaving}
              className={cn(
                "ml-1 rounded-sm hover:bg-muted-foreground/20",
                disabled && "cursor-not-allowed opacity-50"
              )}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>

      {availableOptions.length > 0 && !disabled && (
        <Select onValueChange={handleAdd} disabled={isSaving}>
          <SelectTrigger className="mt-2 h-8">
            <SelectValue placeholder="Add option..." />
          </SelectTrigger>
          <SelectContent>
            {availableOptions.map(option => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {selected.length === 0 && !disabled && (
        <div className="text-sm text-muted-foreground italic">None selected</div>
      )}
    </div>
  )
}
