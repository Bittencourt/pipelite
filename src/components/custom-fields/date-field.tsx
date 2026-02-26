"use client"

import { InlineEdit } from "./inline-edit"
import { format, parseISO } from "date-fns"
import type { CustomFieldDefinition } from "@/db/schema"

interface DateFieldProps {
  definition: CustomFieldDefinition
  value: Date | string | null | undefined
  onSave: (value: Date | null) => Promise<void>
  disabled?: boolean
}

function formatDateDisplay(value: Date | string | null | undefined): string {
  if (!value) return ""
  
  try {
    const date = typeof value === "string" ? parseISO(value) : value
    if (isNaN(date.getTime())) return ""
    return format(date, "MMM d, yyyy")
  } catch {
    return ""
  }
}

function toDateString(value: Date | string | null | undefined): string {
  if (!value) return ""
  
  try {
    const date = typeof value === "string" ? parseISO(value) : value
    if (isNaN(date.getTime())) return ""
    return format(date, "yyyy-MM-dd")
  } catch {
    return ""
  }
}

export function DateField({ definition, value, onSave, disabled }: DateFieldProps) {
  const handleSave = async (stringValue: string) => {
    if (stringValue === "") {
      await onSave(null)
    } else {
      const date = parseISO(stringValue)
      if (isNaN(date.getTime())) {
        throw new Error("Please enter a valid date")
      }
      await onSave(date)
    }
  }

  return (
    <InlineEdit<string>
      value={toDateString(value)}
      onSave={handleSave}
      displayFormatter={() => formatDateDisplay(value)}
      disabled={disabled}
      placeholder={definition.required ? `${definition.name} *` : `Select ${definition.name.toLowerCase()}`}
      renderInput={({ value: editValue, onChange, onKeyDown, disabled: inputDisabled, inputRef }) => (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="date"
          value={editValue}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={inputDisabled}
          className="h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      )}
    />
  )
}
