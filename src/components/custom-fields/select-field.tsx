"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Pencil } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CustomFieldDefinition, SelectConfig } from "@/db/schema"

interface SelectFieldProps {
  definition: CustomFieldDefinition
  value: string | null | undefined
  onSave: (value: string | null) => Promise<void>
  disabled?: boolean
}

export function SelectField({ definition, value, onSave, disabled }: SelectFieldProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editValue, setEditValue] = useState(value ?? "")
  const containerRef = useRef<HTMLDivElement>(null)

  const config = definition.config as SelectConfig | null
  const options = config?.options ?? []

  // Reset edit value when external value changes
  useEffect(() => {
    setEditValue(value ?? "")
  }, [value])

  const handleStartEdit = useCallback(() => {
    if (disabled || isSaving) return
    setIsEditing(true)
  }, [disabled, isSaving])

  const handleSave = useCallback(async (newValue: string) => {
    if (isSaving) return
    
    setIsSaving(true)
    try {
      await onSave(newValue === "" ? null : newValue)
      setIsEditing(false)
    } catch {
      // Reset value on error
      setEditValue(value ?? "")
    } finally {
      setIsSaving(false)
    }
  }, [isSaving, onSave, value])

  const handleCancel = useCallback(() => {
    setEditValue(value ?? "")
    setIsEditing(false)
  }, [value])

  // Handle click outside to cancel
  useEffect(() => {
    if (!isEditing) return

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleCancel()
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isEditing, handleCancel])

  // Find display label for current value
  const displayLabel = value ? options.find(o => o === value) ?? value : ""

  if (isEditing) {
    return (
      <div ref={containerRef} className="relative">
        <Select
          value={editValue}
          onValueChange={(v) => {
            setEditValue(v)
            handleSave(v)
          }}
          disabled={isSaving}
          open={isEditing}
          onOpenChange={(open) => {
            if (!open) handleCancel()
          }}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder={`Select ${definition.name.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isSaving && (
          <div className="absolute right-8 top-1/2 -translate-y-1/2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={handleStartEdit}
      disabled={disabled}
      className={cn(
        "group flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm transition-colors",
        "hover:bg-accent/50",
        disabled && "cursor-not-allowed opacity-50",
        !disabled && "cursor-pointer"
      )}
    >
      <span className={cn(
        "flex-1 truncate",
        !displayLabel && "text-muted-foreground"
      )}>
        {displayLabel || `Select ${definition.name.toLowerCase()}`}
      </span>
      {!disabled && (
        <Pencil className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-50" />
      )}
    </button>
  )
}
