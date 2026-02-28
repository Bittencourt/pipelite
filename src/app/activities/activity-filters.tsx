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
import { Suspense } from "react"

interface ActivityFiltersProps {
  activityTypes: Array<{ id: string; name: string }>
  owners: Array<{ id: string; name: string }>
}

function ActivityFiltersInner({
  activityTypes,
  owners,
}: ActivityFiltersProps) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  // Read filter values from URL
  const typeId = searchParams.get("type") || ""
  const ownerId = searchParams.get("owner") || ""
  const status = searchParams.get("status") || ""
  const dateFrom = searchParams.get("dateFrom") || ""
  const dateTo = searchParams.get("dateTo") || ""

  // Calculate active filter count
  const activeFilterCount = [
    typeId,
    ownerId,
    status,
    dateFrom,
    dateTo,
  ].filter(Boolean).length

  const hasFilters = activeFilterCount > 0

  // Set a filter value in URL
  const setFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  // Clear all filters
  const clearAll = () => {
    router.push(pathname)
  }

  // Get display name for a filter value
  const getTypeName = (id: string) => {
    const type = activityTypes.find((t) => t.id === id)
    return type?.name || id
  }

  const getOwnerName = (id: string) => {
    const owner = owners.find((o) => o.id === id)
    return owner?.name || id
  }

  const getStatusName = (value: string) => {
    switch (value) {
      case "pending":
        return "Pending"
      case "completed":
        return "Completed"
      case "overdue":
        return "Overdue"
      default:
        return value
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
                >
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="type-filter">Activity Type</Label>
                <Select
                  value={typeId}
                  onValueChange={(value) => setFilter("type", value === "all" ? "" : value)}
                >
                  <SelectTrigger id="type-filter">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {activityTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status-filter">Status</Label>
                <Select
                  value={status}
                  onValueChange={(value) => setFilter("status", value === "all" ? "" : value)}
                >
                  <SelectTrigger id="status-filter">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="owner-filter">Owner</Label>
                <Select
                  value={ownerId}
                  onValueChange={(value) => setFilter("owner", value === "all" ? "" : value)}
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
                <Label>Due Date Range</Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      type="date"
                      placeholder="From"
                      value={dateFrom}
                      onChange={(e) => setFilter("dateFrom", e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  <div className="flex-1">
                    <Input
                      type="date"
                      placeholder="To"
                      value={dateTo}
                      onChange={(e) => setFilter("dateTo", e.target.value)}
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>

              {hasFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={clearAll}
                >
                  Clear all filters
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Filter chips */}
        {hasFilters && (
          <div className="flex flex-wrap items-center gap-2">
            {typeId && (
              <Badge variant="secondary" className="gap-1 font-normal">
                Type: {getTypeName(typeId)}
                <button
                  onClick={() => setFilter("type", "")}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {status && (
              <Badge variant="secondary" className="gap-1 font-normal">
                Status: {getStatusName(status)}
                <button
                  onClick={() => setFilter("status", "")}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {ownerId && (
              <Badge variant="secondary" className="gap-1 font-normal">
                Owner: {getOwnerName(ownerId)}
                <button
                  onClick={() => setFilter("owner", "")}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {dateFrom && (
              <Badge variant="secondary" className="gap-1 font-normal">
                From: {dateFrom}
                <button
                  onClick={() => setFilter("dateFrom", "")}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {dateTo && (
              <Badge variant="secondary" className="gap-1 font-normal">
                To: {dateTo}
                <button
                  onClick={() => setFilter("dateTo", "")}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground"
              onClick={clearAll}
            >
              Clear all
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export function ActivityFilters(props: ActivityFiltersProps) {
  return (
    <Suspense fallback={<Button variant="outline" size="sm">Filters</Button>}>
      <ActivityFiltersInner {...props} />
    </Suspense>
  )
}
