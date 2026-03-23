"use client"

import { useState, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { CheckCircle2, XCircle, AlertTriangle, Loader2, X } from "lucide-react"
import { ProgressBar } from "@/components/import/progress-bar"
import {
  getImportProgress,
  cancelPipedriveImport,
} from "@/lib/import/pipedrive-api-import-actions"
import type { ImportProgressState } from "@/lib/import/pipedrive-import-state"

interface ProgressStepProps {
  importId: string
  onComplete: () => void
}

export function ProgressStep({ importId, onComplete }: ProgressStepProps) {
  const t = useTranslations("admin.import.steps.progress")
  const [state, setState] = useState<ImportProgressState | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)

  // Poll for progress updates
  useEffect(() => {
    let mounted = true

    const pollProgress = async () => {
      const result = await getImportProgress(importId)
      if (mounted && result.success && result.state) {
        setState(result.state)
      }
    }

    // Initial fetch
    pollProgress()

    // Set up polling interval
    const pollInterval = setInterval(pollProgress, 1000)

    return () => {
      mounted = false
      clearInterval(pollInterval)
    }
  }, [importId])

  // Stop polling when complete
  useEffect(() => {
    if (state?.status === "completed" || state?.status === "cancelled" || state?.status === "error") {
      // Import finished, no need to poll anymore
    }
  }, [state?.status])

  const handleCancel = useCallback(async () => {
    setIsCancelling(true)
    await cancelPipedriveImport(importId)
    setIsCancelling(false)
  }, [importId])

  if (!state) {
    return (
      <div className="text-center py-8">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <p className="mt-4 text-muted-foreground">Initializing import...</p>
      </div>
    )
  }

  const isRunning = state.status === "running"
  const isCompleted = state.status === "completed"
  const isCancelled = state.status === "cancelled"
  const isInterrupted = state.status === "error" && state.errors.length === 0
  const isError = state.status === "error" && state.errors.length > 0
  const hasErrors = state.errors.length > 0
  const hasReviewItems = state.reviewItems.length > 0

  // Calculate progress percentage
  const progressPercentage = state.totalEntities > 0
    ? Math.round((state.completedEntities / state.totalEntities) * 100)
    : 0

  return (
    <div className="space-y-6">
      {/* Status header */}
      <div className="flex items-center gap-3">
        {isRunning && <Loader2 className="h-8 w-8 animate-spin text-primary" />}
        {isCompleted && <CheckCircle2 className="h-8 w-8 text-green-600" />}
        {isCancelled && <XCircle className="h-8 w-8 text-orange-500" />}
        {isInterrupted && <AlertTriangle className="h-8 w-8 text-orange-500" />}
        {isError && <XCircle className="h-8 w-8 text-destructive" />}
        <div>
          <h3 className="text-lg font-medium">
            {isRunning && "Importing Data..."}
            {isCompleted && "Import Complete"}
            {isCancelled && "Import Cancelled"}
            {isInterrupted && t("interrupted.title")}
            {isError && "Import Failed"}
          </h3>
          {isRunning && state.currentEntity && (
            <p className="text-muted-foreground text-sm">
              Importing {state.currentEntity}...
            </p>
          )}
          {isInterrupted && (
            <p className="text-muted-foreground text-sm mt-1">
              {t("interrupted.description")}
            </p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {isRunning && (
        <>
          <ProgressBar
            progress={{
              phase: "importing",
              current: state.completedEntities,
              total: state.totalEntities,
              percentage: progressPercentage,
            }}
          />
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isCancelling}
          >
            {isCancelling ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Cancelling...
              </>
            ) : (
              <>
                <X className="mr-2 h-4 w-4" />
                Cancel Import
              </>
            )}
          </Button>
        </>
      )}

      {/* Summary */}
      {(isCompleted || isCancelled || state.status === "error") && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(state.imported).map(([key, count]) => (
              count > 0 && (
                <div key={key} className="p-3 rounded-lg border">
                  <p className="text-2xl font-bold">{count}</p>
                  <p className="text-sm text-muted-foreground capitalize">{key}</p>
                </div>
              )
            ))}
          </div>

          {/* Interrupted hint */}
          {isInterrupted && (
            <p className="text-sm text-muted-foreground">
              {t("interrupted.hint")}
            </p>
          )}

          {/* Errors */}
          {hasErrors && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{state.errors.length} Error(s)</AlertTitle>
              <AlertDescription>
                <ul className="mt-2 space-y-1 max-h-32 overflow-auto">
                  {state.errors.slice(0, 10).map((err, i) => (
                    <li key={i} className="text-sm">
                      {err.entity}: {err.message}
                    </li>
                  ))}
                  {state.errors.length > 10 && (
                    <li className="text-sm text-muted-foreground">
                      ...and {state.errors.length - 10} more
                    </li>
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Review items */}
          {hasReviewItems && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{state.reviewItems.length} Item(s) Need Review</AlertTitle>
              <AlertDescription>
                <p className="text-sm mt-1">
                  Some imported items may need manual attention.
                </p>
                <ul className="mt-2 space-y-1 max-h-32 overflow-auto">
                  {state.reviewItems.slice(0, 5).map((item, i) => (
                    <li key={i} className="text-sm">
                      {item.type}: {item.reason}
                    </li>
                  ))}
                  {state.reviewItems.length > 5 && (
                    <li className="text-sm text-muted-foreground">
                      ...and {state.reviewItems.length - 5} more
                    </li>
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <Button onClick={onComplete}>
            {isInterrupted ? t("interrupted.startNew") : "Done"}
          </Button>
        </div>
      )}
    </div>
  )
}
