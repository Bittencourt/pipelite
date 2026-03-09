"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Check, Key, ListChecks, Eye, CheckCircle2, Loader2 } from "lucide-react"
import { ApiKeyStep } from "./steps/api-key-step"
import { SelectEntitiesStep } from "./steps/select-entities-step"
import { PreviewStep } from "./steps/preview-step"
import { ProgressStep } from "./steps/progress-step"
import {
  fetchPipedriveCounts,
  importFromPipedrive,
  type PipedriveCounts,
} from "@/lib/import/pipedrive-api-import-actions"
import type { ImportProgressState } from "@/lib/import/pipedrive-import-state"
import type { PipedriveImportConfig } from "@/lib/import/pipedrive-api-types"

const STEPS = [
  { id: "api-key", label: "API Key", icon: Key },
  { id: "select", label: "Select Entities", icon: ListChecks },
  { id: "preview", label: "Preview", icon: Eye },
  { id: "progress", label: "Import", icon: Loader2 },
] as const

type StepId = (typeof STEPS)[number]["id"]

const DEFAULT_ENTITIES: PipedriveImportConfig["entities"] = {
  pipelines: true,
  customFields: true,
  organizations: true,
  people: true,
  deals: true,
  activities: true,
}

export function PipedriveApiWizard() {
  const router = useRouter()

  const [step, setStep] = useState<StepId>("api-key")
  const [apiKey, setApiKey] = useState<string>("")
  const [selectedEntities, setSelectedEntities] = useState<PipedriveImportConfig["entities"]>(DEFAULT_ENTITIES)
  const [counts, setCounts] = useState<PipedriveCounts | null>(null)
  const [importId, setImportId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // --- Step handlers ---

  const handleApiKeyConfirm = useCallback((validatedApiKey: string) => {
    setApiKey(validatedApiKey)
    setStep("select")
  }, [])

  const handleEntityToggle = useCallback(
    (entity: keyof PipedriveImportConfig["entities"]) => {
      // Pipelines is always required
      if (entity === "pipelines") return

      setSelectedEntities((prev) => ({
        ...prev,
        [entity]: !prev[entity],
      }))
    },
    []
  )

  const handleSelectContinue = useCallback(async () => {
    setIsLoading(true)
    const result = await fetchPipedriveCounts(apiKey)
    setIsLoading(false)

    if (result.success) {
      setCounts(result.counts)
      setStep("preview")
    } else {
      // Error handling is done in the step component
      console.error("Failed to fetch counts:", result.error)
    }
  }, [apiKey])

  const handleStartImport = useCallback(() => {
    // Generate ID for tracking - state is created by server action
    const id = crypto.randomUUID()
    setImportId(id)

    const config: PipedriveImportConfig = {
      apiKey,
      entities: selectedEntities,
    }

    // Fire-and-forget: do NOT await. The server action runs independently
    // and creates its own state. Switch to progress step immediately so
    // ProgressStep can start polling.
    // Pass preloaded counts to avoid redundant API calls that can hit rate limits.
    importFromPipedrive(apiKey, config, id, counts ?? undefined)
    setStep("progress")
  }, [apiKey, selectedEntities, counts])

  const handleImportComplete = useCallback(() => {
    router.push("/admin")
  }, [router])

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
                      <s.icon className="h-4 w-4" />
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

      {/* API Source badge */}
      {step !== "api-key" && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Source:</span>
          <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
            Pipedrive API
          </span>
        </div>
      )}

      {/* Step content */}
      <div className="min-h-[300px]">
        {step === "api-key" && (
          <ApiKeyStep onConfirm={handleApiKeyConfirm} />
        )}

        {step === "select" && (
          <SelectEntitiesStep
            selectedEntities={selectedEntities}
            onToggle={handleEntityToggle}
            onBack={() => setStep("api-key")}
            onContinue={handleSelectContinue}
            isLoading={isLoading}
          />
        )}

        {step === "preview" && counts && (
          <PreviewStep
            counts={counts}
            selectedEntities={selectedEntities}
            onBack={() => setStep("select")}
            onConfirm={handleStartImport}
            isLoading={isLoading}
          />
        )}

        {step === "progress" && importId && (
          <ProgressStep
            importId={importId}
            onComplete={handleImportComplete}
          />
        )}
      </div>
    </div>
  )
}
