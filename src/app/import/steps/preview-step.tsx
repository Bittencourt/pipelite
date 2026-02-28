"use client"

import { useState } from "react"
import { ImportPreview } from "@/components/import/import-preview"
import { WarningDialog } from "@/components/import/warning-dialog"
import { Button } from "@/components/ui/button"
import type { ImportError, ImportWarning, ImportEntityType } from "@/lib/import/types"

interface PreviewStepProps {
  mappedData: Record<string, unknown>[]
  errors: ImportError[]
  warnings: ImportWarning[]
  entityType: ImportEntityType
  onConfirm: (allowPartial: boolean) => void
  onBack: () => void
}

export function PreviewStep({
  mappedData,
  errors,
  warnings,
  entityType,
  onConfirm,
  onBack,
}: PreviewStepProps) {
  const [allowPartialImport, setAllowPartialImport] = useState(false)
  const [showWarningDialog, setShowWarningDialog] = useState(false)

  const hasErrors = errors.length > 0
  const hasWarnings = warnings.length > 0

  // Disable import if there are errors and user hasn't opted for partial import
  const canImport = !hasErrors || allowPartialImport

  const handleImportClick = () => {
    if (hasWarnings) {
      setShowWarningDialog(true)
    } else {
      onConfirm(allowPartialImport)
    }
  }

  const handleWarningConfirm = () => {
    setShowWarningDialog(false)
    onConfirm(allowPartialImport)
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Preview Import</h3>
        <p className="text-muted-foreground text-sm">
          Review your data before importing. Error rows are highlighted in red.
        </p>
      </div>

      <ImportPreview
        data={mappedData}
        errors={errors}
        entityType={entityType}
        allowPartialImport={allowPartialImport}
        onAllowPartialChange={setAllowPartialImport}
      />

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleImportClick} disabled={!canImport}>
          Import {canImport && hasErrors
            ? `${mappedData.length - new Set(errors.map((e) => e.row)).size} rows`
            : `${mappedData.length} rows`}
        </Button>
      </div>

      {/* Warning confirmation dialog */}
      <WarningDialog
        warnings={warnings}
        open={showWarningDialog}
        onConfirm={handleWarningConfirm}
        onCancel={() => setShowWarningDialog(false)}
      />
    </div>
  )
}
