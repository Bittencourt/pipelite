"use client"

import { useSearchParams, usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Filter, X } from "lucide-react"
import { withViewEscape } from "@/lib/views/url-params"

interface DealFiltersProps {
  stages: Array<{ id: string; name: string }>  // stages for the currently selected pipeline only
  owners: Array<{ id: string; name: string }>  // all users (for owner filter)
  assignees: Array<{ id: string; name: string }>  // all users (for assignee filter)
}

export function DealFilters({ stages, owners, assignees }: DealFiltersProps) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  // Read current filter values from searchParams
  const stageId = searchParams.get("stage")
  const ownerId = searchParams.get("owner")
  const assigneeId = searchParams.get("assignee") || ""
  const dateFrom = searchParams.get("dateFrom")
  const dateTo = searchParams.get("dateTo")

  const hasFilters = !!(stageId || ownerId || assigneeId || dateFrom || dateTo)
  const activeFilterCount = [stageId, ownerId, assigneeId, dateFrom, dateTo].filter(Boolean).length

  // Find display names for active filters
  const stageName = stageId ? stages.find(s => s.id === stageId)?.name : null
  const ownerName = ownerId ? owners.find(o => o.id === ownerId)?.name : null
  const assigneeName = assigneeId ? assignees.find(a => a.id === assigneeId)?.name : null

  /**
   * BOTH WRITERS BELOW GO THROUGH `withViewEscape`, AND BOTH NEEDED IT.
   *
   * The obvious reading is that only `clearAll` can produce a bare query, since it deletes the five
   * filter keys and KEEPS `pipeline`. But the page DEFAULTS the pipeline without putting it in the URL,
   * so "no pipeline param" is the common case, not the edge — and then `clearAll` leaves `?` with
   * nothing in it. `setFilter(key, null)` removing the last remaining chip produces exactly the same
   * bare query by another route. A bare `/deals` is what the new default-view redirect in `page.tsx`
   * acts on, so either one, left unescaped, would bounce the user straight back into the view they
   * just cleared (T-40-55).
   *
   * `withViewEscape` answers that by appending `view=none` when no saveable filter survives: an
   * explicit "I have no view", which is a param, so the redirect guard does not fire on it.
   *
   * NEITHER SITE WRITES `view=<id>`, AND NEITHER NEEDED A NEW PROP (plan 40-18). These functions
   * change FILTERS, never the selection — only the bar mints or clears a selection. The URL now carries
   * `?view=<id>` naming the open view, and the helper PRESERVES it whenever a saveable filter survives,
   * reading it out of the params it is handed. Both clones below are built from
   * `searchParams.toString()`, so `view` is already in the input and the selection rides through a
   * filter change untouched — which is what makes `isModified` reachable, and why the preservation rule
   * lives in the helper instead of being threaded as a prop through six files.
   *
   * No `selectedViewId` prop belongs here either. Plan 40-11 passes one to the two `data-table.tsx`
   * files because those build their query strings from PROPS and have no `searchParams` to preserve
   * from. This file has them. The asymmetry is about where the two groups get their params.
   *
   * `replace`, not `push`, at both sites: that is the existing behaviour and it is right — a filter
   * tweak should not put an entry in the back stack for every keystroke of a date.
   */
  const setFilter = (key: string, value: string | null) => {
    // Create new URLSearchParams from searchParams.toString() to preserve ?pipeline= and ?view=
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    router.replace(`${pathname}?${withViewEscape("deal", params)}`)
  }

  const clearAll = () => {
    const params = new URLSearchParams(searchParams.toString())
    // Keep "pipeline" param, delete filter params
    params.delete("stage")
    params.delete("owner")
    params.delete("assignee")
    params.delete("dateFrom")
    params.delete("dateTo")
    router.replace(`${pathname}?${withViewEscape("deal", params)}`)
  }

  const clearFilter = (key: string) => {
    setFilter(key, null)
  }

  // Get display label for a filter
  const getFilterLabel = (key: string, value: string): string => {
    if (key === "stage") return stageName || value
    if (key === "owner") return ownerName || value
    if (key === "assignee") return assigneeName || value
    if (key === "dateFrom") return `From: ${value}`
    if (key === "dateTo") return `To: ${value}`
    return value
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-2" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="stage-filter">Stage</Label>
                <Select
                  value={stageId || "all"}
                  onValueChange={(value) => setFilter("stage", value === "all" ? null : value)}
                >
                  <SelectTrigger id="stage-filter">
                    <SelectValue placeholder="All stages" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All stages</SelectItem>
                    {stages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        {stage.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="owner-filter">Owner</Label>
                <Select
                  value={ownerId || "all"}
                  onValueChange={(value) => setFilter("owner", value === "all" ? null : value)}
                >
                  <SelectTrigger id="owner-filter">
                    <SelectValue placeholder="All owners" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All owners</SelectItem>
                    {owners.map((owner) => (
                      <SelectItem key={owner.id} value={owner.id}>
                        {owner.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="assignee-filter">Assignee</Label>
                <Select
                  value={assigneeId || "all"}
                  onValueChange={(value) => setFilter("assignee", value === "all" ? "" : value)}
                >
                  <SelectTrigger id="assignee-filter">
                    <SelectValue placeholder="All assignees" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All assignees</SelectItem>
                    {assignees.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="date-from">Close Date From</Label>
                <Input
                  id="date-from"
                  type="date"
                  value={dateFrom || ""}
                  onChange={(e) => setFilter("dateFrom", e.target.value || null)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="date-to">Close Date To</Label>
                <Input
                  id="date-to"
                  type="date"
                  value={dateTo || ""}
                  onChange={(e) => setFilter("dateTo", e.target.value || null)}
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            Clear all
          </Button>
        )}
      </div>

      {/* Filter chips */}
      {hasFilters && (
        <div className="flex flex-wrap gap-2">
          {stageId && (
            <Badge variant="secondary" className="gap-1 pr-1">
              Stage: {getFilterLabel("stage", stageId)}
              <button
                onClick={() => clearFilter("stage")}
                className="ml-1 hover:bg-muted rounded-sm p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {ownerId && (
            <Badge variant="secondary" className="gap-1 pr-1">
              Owner: {getFilterLabel("owner", ownerId)}
              <button
                onClick={() => clearFilter("owner")}
                className="ml-1 hover:bg-muted rounded-sm p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {assigneeId && (
            <Badge variant="secondary" className="gap-1 pr-1">
              Assignee: {getFilterLabel("assignee", assigneeId)}
              <button
                onClick={() => clearFilter("assignee")}
                className="ml-1 hover:bg-muted rounded-sm p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {dateFrom && (
            <Badge variant="secondary" className="gap-1 pr-1">
              {getFilterLabel("dateFrom", dateFrom)}
              <button
                onClick={() => clearFilter("dateFrom")}
                className="ml-1 hover:bg-muted rounded-sm p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {dateTo && (
            <Badge variant="secondary" className="gap-1 pr-1">
              {getFilterLabel("dateTo", dateTo)}
              <button
                onClick={() => clearFilter("dateTo")}
                className="ml-1 hover:bg-muted rounded-sm p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}
