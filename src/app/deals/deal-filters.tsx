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

interface DealFiltersProps {
  stages: Array<{ id: string; name: string }>  // stages for the currently selected pipeline only
  owners: Array<{ id: string; name: string }>  // all users (for owner filter)
}

export function DealFilters({ stages, owners }: DealFiltersProps) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  // Read current filter values from searchParams
  const stageId = searchParams.get("stage")
  const ownerId = searchParams.get("owner")
  const dateFrom = searchParams.get("dateFrom")
  const dateTo = searchParams.get("dateTo")

  const hasFilters = !!(stageId || ownerId || dateFrom || dateTo)
  const activeFilterCount = [stageId, ownerId, dateFrom, dateTo].filter(Boolean).length

  // Find display names for active filters
  const stageName = stageId ? stages.find(s => s.id === stageId)?.name : null
  const ownerName = ownerId ? owners.find(o => o.id === ownerId)?.name : null

  const setFilter = (key: string, value: string | null) => {
    // Create new URLSearchParams from searchParams.toString() to preserve ?pipeline=
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    router.replace(`${pathname}?${params.toString()}`)
  }

  const clearAll = () => {
    const params = new URLSearchParams(searchParams.toString())
    // Keep "pipeline" param, delete filter params
    params.delete("stage")
    params.delete("owner")
    params.delete("dateFrom")
    params.delete("dateTo")
    router.replace(`${pathname}?${params.toString()}`)
  }

  const clearFilter = (key: string) => {
    setFilter(key, null)
  }

  // Get display label for a filter
  const getFilterLabel = (key: string, value: string): string => {
    if (key === "stage") return stageName || value
    if (key === "owner") return ownerName || value
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
                  value={stageId || ""}
                  onValueChange={(value) => setFilter("stage", value || null)}
                >
                  <SelectTrigger id="stage-filter">
                    <SelectValue placeholder="All stages" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All stages</SelectItem>
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
                  value={ownerId || ""}
                  onValueChange={(value) => setFilter("owner", value || null)}
                >
                  <SelectTrigger id="owner-filter">
                    <SelectValue placeholder="All owners" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All owners</SelectItem>
                    {owners.map((owner) => (
                      <SelectItem key={owner.id} value={owner.id}>
                        {owner.name}
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
