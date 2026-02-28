"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Check } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FileDropzone } from "@/components/import/file-dropzone"
import { PipedriveMappingStep } from "./pipedrive-mapping-step"
import { PreviewStep } from "@/app/import/steps/preview-step"
import { ConfirmStep } from "@/app/import/steps/confirm-step"
import { parseFile } from "@/lib/import/parsers"
import {
  suggestFieldMapping,
  transformPipedriveDataBatch,
} from "@/lib/import/pipedrive-mapping"
import { getTargetFields } from "@/lib/import/mappers"
import { validateImportData } from "@/lib/import/validators"
import type {
  ImportEntityType,
  ImportProgress,
  ImportError,
  ImportWarning,
  FieldMapping,
} from "@/lib/import/types"

type PipedriveStep = "upload" | "mapping" | "preview" | "confirm"

const STEPS: { id: PipedriveStep; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "mapping", label: "Review Mapping" },
  { id: "preview", label: "Preview" },
  { id: "confirm", label: "Import" },
]

const ENTITY_OPTIONS: { value: ImportEntityType; label: string }[] = [
  { value: "organization", label: "Organizations" },
  { value: "person", label: "People" },
  { value: "deal", label: "Deals" },
  { value: "activity", label: "Activities" },
]

const ENTITY_PATHS: Record<ImportEntityType, string> = {
  organization: "/organizations",
  person: "/people",
  deal: "/deals",
  activity: "/activities",
}

export function PipedriveWizard() {
  const router = useRouter()

  const [step, setStep] = useState<PipedriveStep>("upload")
  const [entityType, setEntityType] = useState<ImportEntityType>("organization")

  // Data flow state
  const [rawData, setRawData] = useState<Record<string, string>[]>([])
  const [sourceColumns, setSourceColumns] = useState<string[]>([])
  const [suggestedMapping, setSuggestedMapping] = useState<Record<string, string>>({})
  const [fieldMapping, setFieldMapping] = useState<FieldMapping>({})
  const [mappedData, setMappedData] = useState<Record<string, unknown>[]>([])
  const [errors, setErrors] = useState<ImportError[]>([])
  const [warnings, setWarnings] = useState<ImportWarning[]>([])
  const [allowPartial, setAllowPartial] = useState(false)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // --- Step handlers ---

  const handleFileSelect = useCallback(
    async (file: File) => {
      setUploadError(null)
      setProgress({
        phase: "parsing",
        current: 0,
        total: file.size,
        percentage: 0,
      })

      try {
        const result = await parseFile(file, setProgress)

        if (result.errors.length > 0 && result.data.length === 0) {
          setUploadError(
            `Failed to parse file: ${result.errors[0]?.message || "Unknown error"}`
          )
          setProgress(null)
          return
        }

        if (result.data.length === 0) {
          setUploadError("The file is empty or has no data rows")
          setProgress(null)
          return
        }

        setRawData(result.data)
        setSourceColumns(result.meta.fields)

        // Auto-suggest Pipedrive mapping
        const suggested = suggestFieldMapping(result.meta.fields, entityType)
        setSuggestedMapping(suggested)
        setFieldMapping(suggested)

        setProgress(null)
        setStep("mapping")
      } catch (err) {
        setUploadError(
          `Failed to parse file: ${err instanceof Error ? err.message : "Unknown error"}`
        )
        setProgress(null)
      }
    },
    [entityType]
  )

  const handleMappingConfirm = useCallback(
    (confirmedMapping: FieldMapping) => {
      setFieldMapping(confirmedMapping)

      // Convert FieldMapping (allows null) to Record<string, string> (no nulls)
      const stringMapping: Record<string, string> = {}
      for (const [key, value] of Object.entries(confirmedMapping)) {
        stringMapping[key] = value ?? ""
      }

      // Transform data using Pipedrive mapping
      const transformed = transformPipedriveDataBatch(
        rawData,
        stringMapping,
        entityType
      )
      setMappedData(transformed)

      // Validate
      const result = validateImportData(entityType, transformed)
      setErrors(result.errors)

      // Detect auto-create warnings
      const autoWarnings: ImportWarning[] = []
      if (entityType === "person" || entityType === "deal") {
        const orgNames = new Set<string>()
        transformed.forEach((row, i) => {
          const orgName = row.organizationName
          if (orgName && typeof orgName === "string" && orgName.trim()) {
            if (!orgNames.has(orgName.trim().toLowerCase())) {
              orgNames.add(orgName.trim().toLowerCase())
              autoWarnings.push({
                row: i + 1,
                type: "auto_create_org",
                message: `Organization "${orgName}" may be auto-created if not found`,
              })
            }
          }
        })
      }

      setWarnings([...result.warnings, ...autoWarnings])
      setStep("preview")
    },
    [rawData, entityType]
  )

  const handlePreviewConfirm = useCallback((partial: boolean) => {
    setAllowPartial(partial)
    setStep("confirm")
  }, [])

  const handleComplete = useCallback(() => {
    router.push(ENTITY_PATHS[entityType])
  }, [router, entityType])

  const handleRetry = useCallback(() => {
    setStep("upload")
    setRawData([])
    setSourceColumns([])
    setSuggestedMapping({})
    setFieldMapping({})
    setMappedData([])
    setErrors([])
    setWarnings([])
    setAllowPartial(false)
    setProgress(null)
    setUploadError(null)
  }, [])

  // --- Step indicator ---
  const currentStepIndex = STEPS.findIndex((s) => s.id === step)

  return (
    <div className="space-y-8">
      {/* Step indicator */}
      <nav aria-label="Progress">
        <ol className="flex items-center">
          {STEPS.map((s, idx) => {
            const isComplete = idx < currentStepIndex
            const isCurrent = idx === currentStepIndex

            return (
              <li
                key={s.id}
                className={`flex items-center ${
                  idx < STEPS.length - 1 ? "flex-1" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-medium transition-colors ${
                      isComplete
                        ? "border-primary bg-primary text-primary-foreground"
                        : isCurrent
                          ? "border-primary text-primary"
                          : "border-muted-foreground/30 text-muted-foreground"
                    }`}
                  >
                    {isComplete ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <span
                    className={`hidden text-sm sm:inline ${
                      isCurrent ? "font-medium" : "text-muted-foreground"
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    className={`mx-4 h-px flex-1 ${
                      isComplete ? "bg-primary" : "bg-muted-foreground/30"
                    }`}
                  />
                )}
              </li>
            )
          })}
        </ol>
      </nav>

      {/* Pipedrive format badge */}
      {step !== "upload" && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Mode:</span>
          <span className="inline-flex items-center rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
            Pipedrive Import
          </span>
        </div>
      )}

      {/* Step content */}
      {step === "upload" && (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-medium">Upload Pipedrive Export</h3>
            <p className="text-muted-foreground text-sm">
              Select the entity type and upload your Pipedrive CSV or JSON export file.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">What are you importing?</label>
            <Select
              value={entityType}
              onValueChange={(v) => setEntityType(v as ImportEntityType)}
            >
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

          <FileDropzone
            onFileSelect={handleFileSelect}
            entityType={entityType}
            onEntityTypeChange={setEntityType}
            progress={progress}
            error={uploadError}
          />

          <div className="text-muted-foreground space-y-1 text-xs">
            <p>Upload the CSV or JSON file exported from Pipedrive.</p>
            <p>Fields will be automatically mapped to internal fields.</p>
          </div>
        </div>
      )}

      {step === "mapping" && (
        <PipedriveMappingStep
          sourceColumns={sourceColumns}
          suggestedMapping={suggestedMapping}
          targetFields={getTargetFields(entityType)}
          entityType={entityType}
          sampleData={rawData.slice(0, 5)}
          onConfirm={handleMappingConfirm}
          onBack={() => setStep("upload")}
        />
      )}

      {step === "preview" && (
        <PreviewStep
          mappedData={mappedData}
          errors={errors}
          warnings={warnings}
          entityType={entityType}
          onConfirm={handlePreviewConfirm}
          onBack={() => setStep("mapping")}
        />
      )}

      {step === "confirm" && (
        <ConfirmStep
          data={mappedData}
          entityType={entityType}
          allowPartial={allowPartial}
          errors={errors}
          onComplete={handleComplete}
          onRetry={handleRetry}
        />
      )}
    </div>
  )
}
