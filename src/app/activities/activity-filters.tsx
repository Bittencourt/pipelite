"use client"

import { useSearchParams, usePathname, useRouter } from "next/navigation"
import { useRef } from "react"
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
import { Filter, Search, X } from "lucide-react"
import { Suspense } from "react"
import { useTranslations } from "next-intl"

interface ActivityFiltersProps {
  activityTypes: Array<{ id: string; name: string }>
  owners: Array<{ id: string; name: string }>
  assignees?: Array<{ id: string; name: string }>
  search?: string
}

function ActivityFiltersInner({
  activityTypes,
  owners,
  assignees = [],
  search = "",
}: ActivityFiltersProps) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const t = useTranslations('activities')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Read filter values from URL
  const typeId = searchParams.get("type") || ""
  const ownerId = searchParams.get("owner") || ""
  const assigneeId = searchParams.get("assignee") || ""
  const status = searchParams.get("status") || ""
  const dateFrom = searchParams.get("dateFrom") || ""
  const dateTo = searchParams.get("dateTo") || ""

  // Calculate active filter count
  const activeFilterCount = [
    typeId,
    ownerId,
    assigneeId,
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

  // Debounced search handler
  const handleSearchChange = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set("search", value)
      } else {
        params.delete("search")
      }
      params.delete("page")
      router.push(`${pathname}?${params.toString()}`)
    }, 300)
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

  const getAssigneeName = (id: string) => {
    const assignee = assignees.find((a) => a.id === id)
    return assignee?.name || id
  }

  const getStatusName = (value: string) => {
    switch (value) {
      case "pending":
        return t('pending')
      case "completed":
        return t('completed')
      case "overdue":
        return t('overdue')
      default:
        return value
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search activities..."
            defaultValue={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-8 max-w-sm"
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-4 w-4" />
              {t('filters')}
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
                <Label htmlFor="type-filter">{t('activityType')}</Label>
                <Select
                  value={typeId}
                  onValueChange={(value) => setFilter("type", value === "all" ? "" : value)}
                >
                  <SelectTrigger id="type-filter">
                    <SelectValue placeholder={t('allTypes')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('allTypes')}</SelectItem>
                    {activityTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status-filter">{t('status')}</Label>
                <Select
                  value={status}
                  onValueChange={(value) => setFilter("status", value === "all" ? "" : value)}
                >
                  <SelectTrigger id="status-filter">
                    <SelectValue placeholder={t('allStatuses')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('all')}</SelectItem>
                    <SelectItem value="pending">{t('pending')}</SelectItem>
                    <SelectItem value="completed">{t('completed')}</SelectItem>
                    <SelectItem value="overdue">{t('overdue')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="owner-filter">{t('owner')}</Label>
                <Select
                  value={ownerId}
                  onValueChange={(value) => setFilter("owner", value === "all" ? "" : value)}
                >
                  <SelectTrigger id="owner-filter">
                    <SelectValue placeholder={t('allOwners')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('allOwners')}</SelectItem>
                    {owners.map((owner) => (
                      <SelectItem key={owner.id} value={owner.id}>
                        {owner.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="assignee-filter">{t('assignee')}</Label>
                <Select
                  value={assigneeId || "all"}
                  onValueChange={(value) => setFilter("assignee", value === "all" ? "" : value)}
                >
                  <SelectTrigger id="assignee-filter">
                    <SelectValue placeholder={t('allAssignees')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('allAssignees')}</SelectItem>
                    {assignees.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('dueDateRange')}</Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      type="date"
                      placeholder={t('from')}
                      value={dateFrom}
                      onChange={(e) => setFilter("dateFrom", e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  <div className="flex-1">
                    <Input
                      type="date"
                      placeholder={t('to')}
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
                  {t('clearAllFilters')}
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
                {t('typeLabel')}: {getTypeName(typeId)}
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
                {t('statusLabel')}: {getStatusName(status)}
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
                {t('ownerLabel')}: {getOwnerName(ownerId)}
                <button
                  onClick={() => setFilter("owner", "")}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {assigneeId && (
              <Badge variant="secondary" className="gap-1 font-normal">
                {t('assigneeLabel')}: {getAssigneeName(assigneeId)}
                <button
                  onClick={() => setFilter("assignee", "")}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {dateFrom && (
              <Badge variant="secondary" className="gap-1 font-normal">
                {t('fromLabel')}: {dateFrom}
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
                {t('toLabel')}: {dateTo}
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
              {t('clearAll')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export function ActivityFilters(props: ActivityFiltersProps) {
  const t = useTranslations('activities')
  return (
    <Suspense fallback={<Button variant="outline" size="sm">{t('filters')}</Button>}>
      <ActivityFiltersInner {...props} />
    </Suspense>
  )
}
