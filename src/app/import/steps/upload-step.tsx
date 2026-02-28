"use client"

import { useState, useCallback } from "react"
import { FileDropzone } from "@/components/import/file-dropzone"
import { parseCSV } from "@/lib/import/parsers"
import type { ImportEntityType, ImportProgress } from "@/lib/import/types"

interface UploadStepProps {
  entityType: ImportEntityType
  onEntityTypeChange: (type: ImportEntityType) => void
  onFileParsed: (data: Record<string, string>[], columns: string[]) => void
}

export function UploadStep({
  entityType,
  onEntityTypeChange,
  onFileParsed,
}: UploadStepProps) {
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFileSelect = useCallback(
    async (file: File) => {
      setError(null)
      setProgress({
        phase: "parsing",
        current: 0,
        total: file.size,
        percentage: 0,
      })

      try {
        const result = await parseCSV<Record<string, string>>(file, setProgress)

        if (result.errors.length > 0 && result.data.length === 0) {
          setError(
            `Failed to parse CSV: ${result.errors[0]?.message || "Unknown error"}`
          )
          setProgress(null)
          return
        }

        if (result.data.length === 0) {
          setError("The CSV file is empty or has no data rows")
          setProgress(null)
          return
        }

        setProgress(null)
        onFileParsed(result.data, result.meta.fields)
      } catch (err) {
        setError(
          `Failed to parse file: ${err instanceof Error ? err.message : "Unknown error"}`
        )
        setProgress(null)
      }
    },
    [onFileParsed]
  )

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Upload CSV File</h3>
        <p className="text-muted-foreground text-sm">
          Choose the entity type and upload a CSV file to import.
        </p>
      </div>

      <FileDropzone
        onFileSelect={handleFileSelect}
        entityType={entityType}
        onEntityTypeChange={onEntityTypeChange}
        progress={progress}
        error={error}
      />

      <div className="text-muted-foreground space-y-1 text-xs">
        <p>Accepted format: CSV (comma-separated values)</p>
        <p>The first row should contain column headers.</p>
      </div>
    </div>
  )
}
