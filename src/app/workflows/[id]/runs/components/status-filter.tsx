"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SHOW_DRY_RUNS_PARAM, SHOW_DRY_RUNS_VALUE } from "@/lib/workflows/runs-filter"

interface StatusFilterProps {
  workflowId: string
}

const statuses = [
  { value: "all", label: "All statuses" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "running", label: "Running" },
  { value: "waiting", label: "Waiting" },
  { value: "pending", label: "Pending" },
] as const

export function StatusFilter({ workflowId }: StatusFilterProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations("workflows.dryRun")
  const currentStatus = searchParams.get("status") ?? "all"
  // The reader's rule, restated on the writing side by IMPORTING it rather than by retyping "1":
  // parseShowDryRuns compares STRICTLY against SHOW_DRY_RUNS_VALUE, so ?dryRun=2 reveals nothing
  // and this box must be unticked for it. The two ends of the contract cannot drift.
  const showDryRuns = searchParams.get(SHOW_DRY_RUNS_PARAM) === SHOW_DRY_RUNS_VALUE

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === "all") {
      params.delete("status")
    } else {
      params.set("status", value)
    }
    // Reset to page 1 on filter change
    params.delete("page")
    const qs = params.toString()
    router.push(`/workflows/${workflowId}/runs${qs ? `?${qs}` : ""}`)
  }

  function handleDryRunToggle(checked: boolean) {
    const params = new URLSearchParams(searchParams.toString())
    if (checked) {
      params.set(SHOW_DRY_RUNS_PARAM, SHOW_DRY_RUNS_VALUE)
    } else {
      params.delete(SHOW_DRY_RUNS_PARAM)
    }
    // Reset to page 1 on filter change
    params.delete("page")
    const qs = params.toString()
    router.push(`/workflows/${workflowId}/runs${qs ? `?${qs}` : ""}`)
  }

  return (
    <>
      <Select value={currentStatus} onValueChange={handleChange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          {statuses.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* V-41-1: a SUBORDINATE MODIFIER of the status filter above, so it comes AFTER it in source
          order and lands on the line below once the page's flex-wrap row breaks at 320px. Rendered
          first it would read as a page-level control over something it only narrows.
          Deliberately NOT a sixth SelectItem: dry-run-ness is orthogonal to status, and folding it
          into the Select would make "failed" and "test" mutually exclusive — when a failed test run
          is the most interesting row on the page. */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="show-dry-runs"
          checked={showDryRuns}
          onCheckedChange={(checked) => handleDryRunToggle(checked === true)}
        />
        <Label htmlFor="show-dry-runs" className="cursor-pointer">
          {t("showInList")}
        </Label>
      </div>
    </>
  )
}
