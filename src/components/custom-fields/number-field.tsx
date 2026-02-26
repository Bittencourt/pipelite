"use client"

import { InlineEdit } from "./inline-edit"
import type { CustomFieldDefinition } from "@/db/schema"

interface NumberFieldProps {
  definition: CustomFieldDefinition
  value: number | null | undefined
  onSave: (value: number | null) => Promise<void>
  disabled?: boolean
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return ""
  
  // Format with locale-aware formatting
  return new Intl.NumberFormat().format(value)
}

export function NumberField({ definition, value, onSave, disabled }: NumberFieldProps) {
  const handleSave = async (stringValue: string) => {
    const numValue = stringValue === "" ? null : parseFloat(stringValue)
    if (stringValue !== "" && isNaN(numValue as number)) {
      throw new Error("Please enter a valid number")
    }
    await onSave(numValue)
  }

  return (
    <InlineEdit<string>
      value={value?.toString() ?? ""}
      onSave={handleSave}
      displayFormatter={() => formatNumber(value)}
      disabled={disabled}
      placeholder={definition.required ? `${definition.name} *` : `Enter ${definition.name.toLowerCase()}`}
      renderInput={({ value: editValue, onChange, onKeyDown, disabled: inputDisabled, inputRef }) => (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="number"
          step="any"
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
