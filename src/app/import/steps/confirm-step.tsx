"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/import/progress-bar"
import { CheckCircle2, XCircle, RotateCcw } from "lucide-react"
import {
  importOrganizations,
  importPeople,
  importDeals,
  importActivities,
} from "@/app/import/actions"
import type { ImportEntityType, ImportProgress, ImportError } from "@/lib/import/types"

interface ConfirmStepProps {
  data: Record<string, unknown>[]
  entityType: ImportEntityType
  allowPartial: boolean
  errors: ImportError[]
  onComplete: () => void
  onRetry: () => void
}

interface ImportResultState {
  status: "idle" | "importing" | "success" | "error"
  count: number
  warnings: string[]
  autoCreated: { orgs: string[]; people: string[] }
  error: string | null
}

const ENTITY_LABELS: Record<ImportEntityType, string> = {
  organization: "organizations",
  person: "people",
  deal: "deals",
  activity: "activities",
}

export function ConfirmStep({
  data,
  entityType,
  allowPartial,
  errors,
  onComplete,
  onRetry,
}: ConfirmStepProps) {
  const [result, setResult] = useState<ImportResultState>({
    status: "idle",
    count: 0,
    warnings: [],
    autoCreated: { orgs: [], people: [] },
    error: null,
  })
  const [progress, setProgress] = useState<ImportProgress>({
    phase: "importing",
    current: 0,
    total: data.length,
    percentage: 0,
  })

  const importStartedRef = useRef(false)

  useEffect(() => {
    if (importStartedRef.current) return
    importStartedRef.current = true

    const runImport = async () => {
      setResult((r) => ({ ...r, status: "importing" }))

      // Filter out error rows if partial import
      const errorRows = new Set(errors.map((e) => e.row))
      const importData = allowPartial
        ? data.filter((_, i) => !errorRows.has(i + 1))
        : data

      setProgress({
        phase: "importing",
        current: 0,
        total: importData.length,
        percentage: 10,
      })

      try {
        let response:
          | {
              success: true
              count: number
              warnings: string[]
              autoCreated: { orgs: string[]; people: string[] }
            }
          | { success: false; error: string }

        switch (entityType) {
          case "organization":
            response = await importOrganizations(
              importData as Array<{
                name: string
                website?: string
                industry?: string
                notes?: string
              }>
            )
            break
          case "person":
            response = await importPeople(
              importData as Array<{
                firstName: string
                lastName: string
                email?: string
                phone?: string
                notes?: string
                organizationName?: string
              }>
            )
            break
          case "deal":
            response = await importDeals(
              importData as Array<{
                title: string
                value?: string
                stageName?: string
                organizationName?: string
                personEmail?: string
                expectedCloseDate?: string
                notes?: string
              }>
            )
            break
          case "activity":
            response = await importActivities(
              importData as Array<{
                title: string
                typeName?: string
                dueDate: string
                dealTitle?: string
                notes?: string
              }>
            )
            break
        }

        setProgress({
          phase: "importing",
          current: importData.length,
          total: importData.length,
          percentage: 100,
        })

        if (response.success) {
          setResult({
            status: "success",
            count: response.count,
            warnings: response.warnings,
            autoCreated: response.autoCreated,
            error: null,
          })
        } else {
          setResult({
            status: "error",
            count: 0,
            warnings: [],
            autoCreated: { orgs: [], people: [] },
            error: response.error,
          })
        }
      } catch (err) {
        setResult({
          status: "error",
          count: 0,
          warnings: [],
          autoCreated: { orgs: [], people: [] },
          error:
            err instanceof Error ? err.message : "An unexpected error occurred",
        })
      }
    }

    runImport()
  }, [data, entityType, allowPartial, errors])

  return (
    <div className="space-y-6">
      {result.status === "importing" && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Importing Data...</h3>
          <ProgressBar progress={progress} />
          <p className="text-muted-foreground text-sm">
            Please wait while your data is being imported. Do not close this page.
          </p>
        </div>
      )}

      {result.status === "success" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
            <div>
              <h3 className="text-lg font-medium">Import Complete</h3>
              <p className="text-muted-foreground text-sm">
                Successfully imported {result.count}{" "}
                {ENTITY_LABELS[entityType]}.
              </p>
            </div>
          </div>

          {/* Auto-created entities */}
          {(result.autoCreated.orgs.length > 0 ||
            result.autoCreated.people.length > 0) && (
            <div className="rounded-md bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
              <p className="mb-1 font-medium text-amber-700 dark:text-amber-400">
                Auto-created entities:
              </p>
              {result.autoCreated.orgs.length > 0 && (
                <p className="text-amber-600 dark:text-amber-500">
                  {result.autoCreated.orgs.length} organization(s) created
                </p>
              )}
              {result.autoCreated.people.length > 0 && (
                <p className="text-amber-600 dark:text-amber-500">
                  {result.autoCreated.people.length} person(s) created
                </p>
              )}
            </div>
          )}

          {/* Warnings list */}
          {result.warnings.length > 0 && (
            <div className="max-h-48 overflow-auto rounded-md border p-3 text-sm">
              <p className="mb-1 font-medium">Import notes:</p>
              <ul className="text-muted-foreground list-inside list-disc space-y-0.5">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={onComplete}>
              View {ENTITY_LABELS[entityType]}
            </Button>
            <Button variant="outline" onClick={onRetry}>
              Import More
            </Button>
          </div>
        </div>
      )}

      {result.status === "error" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <XCircle className="h-8 w-8 text-red-600" />
            <div>
              <h3 className="text-lg font-medium">Import Failed</h3>
              <p className="text-sm text-red-600">{result.error}</p>
            </div>
          </div>

          <Button variant="outline" onClick={onRetry}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      )}
    </div>
  )
}
