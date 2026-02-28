"use client"

import type { ImportProgress } from "@/lib/import/types"

const PHASE_LABELS: Record<string, string> = {
  parsing: "Parsing CSV...",
  validating: "Validating data...",
  importing: "Importing records...",
}

interface ProgressBarProps {
  progress: ImportProgress
}

export function ProgressBar({ progress }: ProgressBarProps) {
  const label = PHASE_LABELS[progress.phase] ?? progress.phase

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{progress.percentage}%</span>
      </div>
      <div className="bg-muted h-2.5 w-full overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full transition-all duration-300 ease-out"
          style={{ width: `${progress.percentage}%` }}
        />
      </div>
      {progress.total > 0 && (
        <p className="text-muted-foreground text-xs">
          {progress.current.toLocaleString()} / {progress.total.toLocaleString()}
        </p>
      )}
    </div>
  )
}
