"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Check } from "lucide-react"
import { UploadStep } from "./steps/upload-step"
import { MappingStep } from "./steps/mapping-step"
import { PreviewStep } from "./steps/preview-step"
import { ConfirmStep } from "./steps/confirm-step"
import {
  getTargetFields,
  autoSuggestMapping,
  applyFieldMapping,
} from "@/lib/import/mappers"
import { validateImportData } from "@/lib/import/validators"
import type {
  ImportStep,
  ImportEntityType,
  FieldMapping,
  ImportError,
  ImportWarning,
} from "@/lib/import/types"

const STEPS: { id: ImportStep; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "mapping", label: "Map Fields" },
  { id: "preview", label: "Preview" },
  { id: "confirm", label: "Import" },
]

const ENTITY_PATHS: Record<ImportEntityType, string> = {
  organization: "/organizations",
  person: "/people",
  deal: "/deals",
  activity: "/activities",
}

export function ImportWizard() {
  const router = useRouter()

  const [step, setStep] = useState<ImportStep>("upload")
  const [entityType, setEntityType] = useState<ImportEntityType>("organization")

  // Data flow state
  const [rawData, setRawData] = useState<Record<string, string>[]>([])
  const [sourceColumns, setSourceColumns] = useState<string[]>([])
  const [mapping, setMapping] = useState<FieldMapping>({})
  const [mappedData, setMappedData] = useState<Record<string, unknown>[]>([])
  const [errors, setErrors] = useState<ImportError[]>([])
  const [warnings, setWarnings] = useState<ImportWarning[]>([])
  const [allowPartial, setAllowPartial] = useState(false)

  // --- Step handlers ---

  const handleFileParsed = useCallback(
    (data: Record<string, string>[], columns: string[]) => {
      setRawData(data)
      setSourceColumns(columns)
      // Auto-suggest mapping
      const suggested = autoSuggestMapping(columns, entityType)
      setMapping(suggested)
      setStep("mapping")
    },
    [entityType]
  )

  const handleMappingNext = useCallback(() => {
    // Apply mapping to all rows
    const mapped = rawData.map((row) => applyFieldMapping(row, mapping))
    setMappedData(mapped)

    // Validate
    const result = validateImportData(entityType, mapped)
    setErrors(result.errors)
    setWarnings(result.warnings)

    // Detect auto-create warnings based on entity type
    const autoWarnings: ImportWarning[] = []
    if (entityType === "person" || entityType === "deal") {
      // Check for organizationName that will trigger auto-create
      const orgNames = new Set<string>()
      mapped.forEach((row, i) => {
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

    if (entityType === "deal") {
      const emails = new Set<string>()
      mapped.forEach((row, i) => {
        const email = row.personEmail
        if (email && typeof email === "string" && email.trim()) {
          if (!emails.has(email.trim().toLowerCase())) {
            emails.add(email.trim().toLowerCase())
            autoWarnings.push({
              row: i + 1,
              type: "auto_create_person",
              message: `Person with email "${email}" may be auto-created if not found`,
            })
          }
        }
      })
    }

    setWarnings((prev) => [...prev, ...autoWarnings])
    setStep("preview")
  }, [rawData, mapping, entityType])

  const handlePreviewConfirm = useCallback(
    (partial: boolean) => {
      setAllowPartial(partial)
      setStep("confirm")
    },
    []
  )

  const handleComplete = useCallback(() => {
    router.push(ENTITY_PATHS[entityType])
  }, [router, entityType])

  const handleRetry = useCallback(() => {
    // Reset everything and go back to upload
    setStep("upload")
    setRawData([])
    setSourceColumns([])
    setMapping({})
    setMappedData([])
    setErrors([])
    setWarnings([])
    setAllowPartial(false)
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

      {/* Step content */}
      {step === "upload" && (
        <UploadStep
          entityType={entityType}
          onEntityTypeChange={setEntityType}
          onFileParsed={handleFileParsed}
        />
      )}

      {step === "mapping" && (
        <MappingStep
          sourceColumns={sourceColumns}
          targetFields={getTargetFields(entityType)}
          mapping={mapping}
          onMappingChange={setMapping}
          sampleData={rawData.slice(0, 5)}
          onNext={handleMappingNext}
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
