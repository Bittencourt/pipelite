"use client"

import { useCallback, useRef, useState } from "react"
import { Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ProgressBar } from "./progress-bar"
import type { ImportEntityType, ImportProgress } from "@/lib/import/types"

interface FileDropzoneProps {
  onFileSelect: (file: File) => void
  entityType: ImportEntityType
  onEntityTypeChange: (type: ImportEntityType) => void
  progress: ImportProgress | null
  error: string | null
}

const ENTITY_OPTIONS: { value: ImportEntityType; label: string }[] = [
  { value: "organization", label: "Organizations" },
  { value: "person", label: "People" },
  { value: "deal", label: "Deals" },
  { value: "activity", label: "Activities" },
]

export function FileDropzone({
  onFileSelect,
  entityType,
  onEntityTypeChange,
  progress,
  error,
}: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    (file: File) => {
      if (file.type === "text/csv" || file.name.endsWith(".csv")) {
        onFileSelect(file)
      }
    },
    [onFileSelect]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  return (
    <div className="space-y-6">
      {/* Entity type selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium">What are you importing?</label>
        <Select value={entityType} onValueChange={(v) => onEntityTypeChange(v as ImportEntityType)}>
          <SelectTrigger className="w-full max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENTITY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Drop zone */}
      {progress ? (
        <div className="rounded-lg border p-8">
          <ProgressBar progress={progress} />
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50"
          }`}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="text-muted-foreground mb-4 h-10 w-10" />
          <p className="mb-1 text-sm font-medium">
            Drag and drop your CSV file here
          </p>
          <p className="text-muted-foreground mb-4 text-xs">or click to browse</p>
          <Button type="button" variant="outline" size="sm">
            Select File
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleInputChange}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}
    </div>
  )
}
