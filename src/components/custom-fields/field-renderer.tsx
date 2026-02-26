"use client"

import type { CustomFieldDefinition } from "@/db/schema"
import { TextField } from "./text-field"
import { NumberField } from "./number-field"
import { DateField } from "./date-field"
import { BooleanField } from "./boolean-field"
import { SelectField } from "./select-field"

interface FieldRendererProps {
  definition: CustomFieldDefinition
  value: unknown
  onSave: (value: unknown) => Promise<void>
  disabled?: boolean
}

// Placeholder for advanced field types not yet implemented
function PlaceholderField({ definition }: { definition: CustomFieldDefinition }) {
  return (
    <div className="px-2 py-1 text-sm text-muted-foreground bg-muted/50 rounded">
      {definition.name} ({definition.type} - not implemented)
    </div>
  )
}

export function FieldRenderer({ definition, value, onSave, disabled }: FieldRendererProps) {
  switch (definition.type) {
    case "text":
      return (
        <TextField
          definition={definition}
          value={value as string | null}
          onSave={async (v) => { await onSave(v) }}
          disabled={disabled}
        />
      )

    case "number":
      return (
        <NumberField
          definition={definition}
          value={value as number | null}
          onSave={async (v) => { await onSave(v) }}
          disabled={disabled}
        />
      )

    case "date":
      return (
        <DateField
          definition={definition}
          value={value as Date | string | null}
          onSave={async (v) => { await onSave(v) }}
          disabled={disabled}
        />
      )

    case "boolean":
      return (
        <BooleanField
          definition={definition}
          value={value as boolean | null}
          onSave={async (v) => { await onSave(v) }}
          disabled={disabled}
        />
      )

    case "single_select":
      return (
        <SelectField
          definition={definition}
          value={value as string | null}
          onSave={async (v) => { await onSave(v) }}
          disabled={disabled}
        />
      )

    // Advanced types - placeholder for now
    case "multi_select":
    case "url":
    case "lookup":
    case "file":
    case "formula":
      return <PlaceholderField definition={definition} />

    default:
      return <PlaceholderField definition={definition} />
  }
}
