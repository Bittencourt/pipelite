"use client"

import { InlineEdit } from "./inline-edit"
import { Label } from "@/components/ui/label"
import type { CustomFieldDefinition } from "@/db/schema"

interface TextFieldProps {
  definition: CustomFieldDefinition
  value: string | null | undefined
  onSave: (value: string) => Promise<void>
  disabled?: boolean
}

export function TextField({ definition, value, onSave, disabled }: TextFieldProps) {
  return (
    <div className="py-2">
      <Label className="text-sm text-muted-foreground">
        {definition.name}
        {definition.required && " *"}
      </Label>
      <InlineEdit<string>
        value={value ?? ""}
        onSave={onSave}
        disabled={disabled}
        placeholder={`Enter ${definition.name.toLowerCase()}`}
        renderInput={({ value: editValue, onChange, onKeyDown, disabled: inputDisabled, inputRef }) => (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={editValue}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={inputDisabled}
            className="h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        )}
      />
    </div>
  )
}
