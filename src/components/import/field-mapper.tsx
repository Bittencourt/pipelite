"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Check, AlertTriangle } from "lucide-react"
import type { FieldDefinition, FieldMapping } from "@/lib/import/types"

interface FieldMapperProps {
  sourceColumns: string[]
  targetFields: FieldDefinition[]
  mapping: FieldMapping
  onMappingChange: (mapping: FieldMapping) => void
  sampleData: Record<string, string>[]
}

const DO_NOT_IMPORT = "__skip__"

export function FieldMapper({
  sourceColumns,
  targetFields,
  mapping,
  onMappingChange,
  sampleData,
}: FieldMapperProps) {
  const handleChange = (sourceCol: string, value: string) => {
    onMappingChange({
      ...mapping,
      [sourceCol]: value === DO_NOT_IMPORT ? null : value,
    })
  }

  // Get sample value for a column (first non-empty from sample rows)
  const getSample = (col: string): string => {
    for (const row of sampleData) {
      if (row[col] && row[col].trim()) return row[col]
    }
    return ""
  }

  // Check which required fields are mapped
  const mappedTargets = new Set(
    Object.values(mapping).filter((v): v is string => v !== null)
  )

  const unmappedRequired = targetFields.filter(
    (f) => f.required && !mappedTargets.has(f.name)
  )

  return (
    <div className="space-y-4">
      {unmappedRequired.length > 0 && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Required fields not mapped:</p>
            <p>{unmappedRequired.map((f) => f.label).join(", ")}</p>
          </div>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Source Column</TableHead>
            <TableHead>Sample Data</TableHead>
            <TableHead>Maps To</TableHead>
            <TableHead className="w-16 text-center">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sourceColumns.map((col) => {
            const targetName = mapping[col]
            const target = targetName
              ? targetFields.find((f) => f.name === targetName)
              : null
            const isRequired = target?.required
            const isMapped = targetName !== null && targetName !== undefined

            return (
              <TableRow key={col}>
                <TableCell className="font-medium">{col}</TableCell>
                <TableCell className="text-muted-foreground max-w-48 truncate">
                  {getSample(col) || <span className="italic">empty</span>}
                </TableCell>
                <TableCell>
                  <Select
                    value={targetName ?? DO_NOT_IMPORT}
                    onValueChange={(v) => handleChange(col, v)}
                  >
                    <SelectTrigger className="w-full max-w-56">
                      <SelectValue placeholder="Select field..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DO_NOT_IMPORT}>
                        Do not import
                      </SelectItem>
                      {targetFields.filter((f) => !f.group).map((field) => (
                        <SelectItem key={field.name} value={field.name}>
                          {field.label}
                          {field.required ? " *" : ""}
                        </SelectItem>
                      ))}
                      {targetFields.some((f) => f.group === "custom") && (
                        <>
                          <div className="text-muted-foreground px-2 py-1.5 text-xs font-medium">
                            Custom Fields
                          </div>
                          {targetFields.filter((f) => f.group === "custom").map((field) => (
                            <SelectItem key={field.name} value={field.name}>
                              {field.label}
                              {field.required ? " *" : ""}
                            </SelectItem>
                          ))}
                        </>
                      )}
                    </SelectContent>
                  </Select>
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
    </div>
  )
}
