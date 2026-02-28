"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Check, AlertTriangle, Pencil } from "lucide-react"
import { transformPipedriveDataBatch } from "@/lib/import/pipedrive-mapping"
import type {
  FieldDefinition,
  FieldMapping,
  ImportEntityType,
} from "@/lib/import/types"

interface PipedriveMappingStepProps {
  sourceColumns: string[]
  suggestedMapping: Record<string, string>
  targetFields: FieldDefinition[]
  entityType: ImportEntityType
  sampleData: Record<string, string>[]
  onConfirm: (mapping: FieldMapping) => void
  onBack: () => void
}

const DO_NOT_IMPORT = "__skip__"

export function PipedriveMappingStep({
  sourceColumns,
  suggestedMapping,
  targetFields,
  entityType,
  sampleData,
  onConfirm,
  onBack,
}: PipedriveMappingStepProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [mapping, setMapping] = useState<Record<string, string>>(suggestedMapping)

  // Count mapped and unmapped columns
  const mappedCount = Object.values(mapping).filter((v) => v && v !== "").length
  const totalCount = sourceColumns.length

  // Check which required fields are mapped
  const mappedTargets = new Set(
    Object.values(mapping).filter((v) => v && v !== "")
  )
  const unmappedRequired = targetFields.filter(
    (f) => f.required && !mappedTargets.has(f.name)
  )

  const allRequiredMapped = unmappedRequired.length === 0

  // Generate transform preview
  const previewData = transformPipedriveDataBatch(
    sampleData,
    mapping,
    entityType
  )

  const handleMappingChange = (sourceCol: string, value: string) => {
    setMapping((prev) => ({
      ...prev,
      [sourceCol]: value === DO_NOT_IMPORT ? "" : value,
    }))
  }

  const getSample = (col: string): string => {
    for (const row of sampleData) {
      if (row[col] && row[col].trim()) return row[col]
    }
    return ""
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Review Field Mapping</h3>
        <p className="text-muted-foreground text-sm">
          Pipedrive fields have been automatically mapped to internal fields.
          Review the mapping below and adjust as needed.
        </p>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-4 rounded-md bg-muted/50 p-4 text-sm">
        <div>
          <span className="font-medium">{mappedCount}</span> of{" "}
          <span className="font-medium">{totalCount}</span> columns mapped
        </div>
        {unmappedRequired.length > 0 && (
          <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            <span>
              Missing required: {unmappedRequired.map((f) => f.label).join(", ")}
            </span>
          </div>
        )}
      </div>

      {/* Mapping table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pipedrive Column</TableHead>
            <TableHead>Sample Value</TableHead>
            <TableHead>Maps To</TableHead>
            <TableHead className="w-16 text-center">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sourceColumns.map((col) => {
            const targetName = mapping[col] || ""
            const target = targetName
              ? targetFields.find((f) => f.name === targetName)
              : null
            const isMapped = targetName !== ""

            return (
              <TableRow key={col}>
                <TableCell className="font-medium">{col}</TableCell>
                <TableCell className="text-muted-foreground max-w-48 truncate">
                  {getSample(col) || <span className="italic">empty</span>}
                </TableCell>
                <TableCell>
                  {isEditing ? (
                    <Select
                      value={targetName || DO_NOT_IMPORT}
                      onValueChange={(v) => handleMappingChange(col, v)}
                    >
                      <SelectTrigger className="w-full max-w-56">
                        <SelectValue placeholder="Select field..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={DO_NOT_IMPORT}>
                          Do not import
                        </SelectItem>
                        {targetFields.map((field) => (
                          <SelectItem key={field.name} value={field.name}>
                            {field.label}
                            {field.required ? " *" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span
                      className={
                        isMapped
                          ? ""
                          : "text-muted-foreground italic"
                      }
                    >
                      {target?.label || (isMapped ? targetName : "Skipped")}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {isMapped ? (
                    <Check className="mx-auto h-4 w-4 text-green-600" />
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {/* Transform preview */}
      {previewData.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Transform Preview</h4>
          <p className="text-muted-foreground text-xs">
            Shows how your data will look after field mapping and transformation.
          </p>
          <div className="max-h-64 overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {targetFields
                    .filter((f) => mappedTargets.has(f.name))
                    .map((f) => (
                      <TableHead key={f.name}>{f.label}</TableHead>
                    ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewData.slice(0, 5).map((row, i) => (
                  <TableRow key={i}>
                    {targetFields
                      .filter((f) => mappedTargets.has(f.name))
                      .map((f) => (
                        <TableCell
                          key={f.name}
                          className="max-w-48 truncate"
                        >
                          {row[f.name] != null ? String(row[f.name]) : ""}
                        </TableCell>
                      ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setIsEditing((prev) => !prev)}
          >
            <Pencil className="mr-2 h-4 w-4" />
            {isEditing ? "Done Editing" : "Edit Mapping"}
          </Button>
          <Button
            onClick={() => onConfirm(mapping)}
            disabled={!allRequiredMapped}
          >
            {isEditing ? "Confirm Mapping" : "Accept & Continue"}
          </Button>
        </div>
      </div>
    </div>
  )
}
