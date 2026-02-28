"use client"

import { FieldMapper } from "@/components/import/field-mapper"
import { Button } from "@/components/ui/button"
import type { FieldDefinition, FieldMapping } from "@/lib/import/types"

interface MappingStepProps {
  sourceColumns: string[]
  targetFields: FieldDefinition[]
  mapping: FieldMapping
  onMappingChange: (mapping: FieldMapping) => void
  sampleData: Record<string, string>[]
  onNext: () => void
  onBack: () => void
}

export function MappingStep({
  sourceColumns,
  targetFields,
  mapping,
  onMappingChange,
  sampleData,
  onNext,
  onBack,
}: MappingStepProps) {
  // Check if all required fields are mapped
  const mappedTargets = new Set(
    Object.values(mapping).filter((v): v is string => v !== null)
  )
  const allRequiredMapped = targetFields
    .filter((f) => f.required)
    .every((f) => mappedTargets.has(f.name))

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Map Fields</h3>
        <p className="text-muted-foreground text-sm">
          Map your CSV columns to the corresponding fields. Required fields are
          marked with *.
        </p>
      </div>

      <FieldMapper
        sourceColumns={sourceColumns}
        targetFields={targetFields}
        mapping={mapping}
        onMappingChange={onMappingChange}
        sampleData={sampleData}
      />

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={!allRequiredMapped}>
          Next
        </Button>
      </div>
    </div>
  )
}
