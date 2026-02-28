"use client"

import { useState, useCallback } from "react"
import { FileDropzone } from "@/components/import/file-dropzone"
import { parseFile } from "@/lib/import/parsers"
import type { ImportEntityType, ImportProgress } from "@/lib/import/types"

interface UploadStepProps {
  entityType: ImportEntityType
  onEntityTypeChange: (type: ImportEntityType) => void
  onFileParsed: (data: Record<string, string>[], columns: string[], fileType: "csv" | "json", detectedEntityType?: ImportEntityType) => void
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
        const result = await parseFile(file, setProgress)

        if (result.errors.length > 0 && result.data.length === 0) {
          setError(
            `Failed to parse file: ${result.errors[0]?.message || "Unknown error"}`
          )
          setProgress(null)
          return
        }

        if (result.data.length === 0) {
          setError("The file is empty or has no data rows")
          setProgress(null)
          return
        }

        setProgress(null)
        onFileParsed(result.data, result.meta.fields, result.fileType, result.detectedEntityType)
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
        <h3 className="text-lg font-medium">Upload File</h3>
        <p className="text-muted-foreground text-sm">
          Choose the entity type and upload a CSV or JSON file to import.
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
        <p>Accepted formats: CSV (comma-separated values) or JSON</p>
        <p>For CSV, the first row should contain column headers.</p>
        <p>JSON files exported from this application are automatically recognized.</p>
      </div>
    </div>
  )
}
