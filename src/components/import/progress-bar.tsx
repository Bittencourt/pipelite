"use client"

import { ProgressBar as PresentationalProgressBar } from "@/components/ui/progress-bar"
import type { ImportProgress } from "@/lib/import/types"

/**
 * The importer's progress bar — now a THIN WRAPPER over `@/components/ui/progress-bar` (39-UI-SPEC P-2).
 *
 * WHAT CHANGED AND WHAT DID NOT. The markup moved out; this file kept its exact public API
 * (`({ progress }: { progress: ImportProgress })`) and kept `PHASE_LABELS` exactly where it was. That
 * is the whole point of the shape: both call sites — `src/app/import/steps/confirm-step.tsx` and
 * `src/app/admin/import/pipedrive-api/steps/progress-step.tsx` — change ZERO lines, and the refactor
 * cannot have altered how either import flow looks or behaves.
 *
 * `PHASE_LABELS` IS PRE-EXISTING HARDCODED ENGLISH AND IS DELIBERATELY LEFT ALONE. 39-UI-SPEC's
 * out-of-scope section assigns the importer's English literals to a dedicated copy pass; translating
 * them inside a duplicate-detection change would make this diff unreviewable. It stays here rather than
 * travelling into the shared component precisely because it is one caller's copy.
 */
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
    <PresentationalProgressBar
      label={label}
      percentage={progress.percentage}
      current={progress.current}
      total={progress.total}
    />
  )
}
