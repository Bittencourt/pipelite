"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { ChevronDown, Download, Loader2 } from "lucide-react"
import { getExportData } from "./actions"
import type { ExportEntityType, ExportFormat, ExportFilters } from "@/lib/export/types"

interface ExportFormProps {
  initialFilters?: ExportFilters
  owners: Array<{ id: string; name: string }>
  stages: Array<{ id: string; name: string }>
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function getMimeType(format: ExportFormat): string {
  switch (format) {
    case "csv":
    case "pipedrive-csv":
      return "text/csv;charset=utf-8;"
    case "json":
    case "pipedrive-json":
      return "application/json;charset=utf-8;"
    default:
      return "text/plain"
  }
}

export function ExportForm({ initialFilters, owners, stages }: ExportFormProps) {
  const [entityType, setEntityType] = useState<ExportEntityType>("organization")
  const [format, setFormat] = useState<ExportFormat>("csv")
  const [includeCustomFields, setIncludeCustomFields] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastExport, setLastExport] = useState<{ count: number; filename: string } | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(!!initialFilters?.stage || !!initialFilters?.owner || !!initialFilters?.dateFrom || !!initialFilters?.dateTo)

  // Filters
  const [filterStage, setFilterStage] = useState(initialFilters?.stage ?? "")
  const [filterOwner, setFilterOwner] = useState(initialFilters?.owner ?? "")
  const [filterDateFrom, setFilterDateFrom] = useState(initialFilters?.dateFrom ?? "")
  const [filterDateTo, setFilterDateTo] = useState(initialFilters?.dateTo ?? "")

  async function handleExport() {
    setIsExporting(true)
    setError(null)
    setLastExport(null)

    const filters: ExportFilters = {}
    if (filterStage) filters.stage = filterStage
    if (filterOwner) filters.owner = filterOwner
    if (filterDateFrom) filters.dateFrom = filterDateFrom
    if (filterDateTo) filters.dateTo = filterDateTo

    const result = await getExportData({
      entityType,
      format,
      includeCustomFields,
      filters: Object.keys(filters).length > 0 ? filters : undefined,
    })

    setIsExporting(false)

    if (result.success) {
      downloadFile(result.data, result.filename, getMimeType(format))
      setLastExport({ count: result.count, filename: result.filename })
    } else {
      setError(result.error)
    }
  }

  const showStageFilter = entityType === "deal"
  const showDateFilter = entityType === "deal" || entityType === "activity"

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Export Settings</CardTitle>
          <CardDescription>
            Choose what data to export and in what format
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Entity type */}
          <div className="space-y-2">
            <Label htmlFor="entity-type">Entity Type</Label>
            <Select
              value={entityType}
              onValueChange={(v) => setEntityType(v as ExportEntityType)}
            >
              <SelectTrigger id="entity-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="organization">Organizations</SelectItem>
                <SelectItem value="person">People</SelectItem>
                <SelectItem value="deal">Deals</SelectItem>
                <SelectItem value="activity">Activities</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Format */}
          <div className="space-y-2">
            <Label htmlFor="format">Format</Label>
            <Select
              value={format}
              onValueChange={(v) => setFormat(v as ExportFormat)}
            >
              <SelectTrigger id="format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="json">JSON</SelectItem>
                <SelectItem value="pipedrive-csv">Pipedrive CSV</SelectItem>
                <SelectItem value="pipedrive-json">Pipedrive JSON</SelectItem>
              </SelectContent>
            </Select>
            {format.startsWith("pipedrive") && (
              <p className="text-xs text-muted-foreground">
                Pipedrive format uses field names compatible with Pipedrive CRM import
              </p>
            )}
          </div>

          {/* Include custom fields */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="custom-fields"
              checked={includeCustomFields}
              onCheckedChange={(checked) =>
                setIncludeCustomFields(checked === true)
              }
            />
            <Label htmlFor="custom-fields" className="text-sm font-normal">
              Include custom fields (prefixed with custom_)
            </Label>
          </div>

          {/* Filters */}
          <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 p-0 h-auto font-medium">
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${filtersOpen ? "" : "-rotate-90"}`}
                />
                Filters
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4 space-y-4">
              {/* Stage filter (deals only) */}
              {showStageFilter && (
                <div className="space-y-2">
                  <Label htmlFor="filter-stage">Stage</Label>
                  <Select
                    value={filterStage || "all"}
                    onValueChange={(v) => setFilterStage(v === "all" ? "" : v)}
                  >
                    <SelectTrigger id="filter-stage">
                      <SelectValue placeholder="All stages" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All stages</SelectItem>
                      {stages.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Owner filter */}
              <div className="space-y-2">
                <Label htmlFor="filter-owner">Owner</Label>
                <Select
                  value={filterOwner || "all"}
                  onValueChange={(v) => setFilterOwner(v === "all" ? "" : v)}
                >
                  <SelectTrigger id="filter-owner">
                    <SelectValue placeholder="All owners" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All owners</SelectItem>
                    {owners.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date range (deals, activities) */}
              {showDateFilter && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="filter-date-from">
                      {entityType === "deal" ? "Close date from" : "Due date from"}
                    </Label>
                    <Input
                      id="filter-date-from"
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="filter-date-to">
                      {entityType === "deal" ? "Close date to" : "Due date to"}
                    </Label>
                    <Input
                      id="filter-date-to"
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {(filterStage || filterOwner || filterDateFrom || filterDateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFilterStage("")
                    setFilterOwner("")
                    setFilterDateFrom("")
                    setFilterDateTo("")
                  }}
                >
                  Clear filters
                </Button>
              )}
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      {/* Export button */}
      <Button
        onClick={handleExport}
        disabled={isExporting}
        size="lg"
        className="w-full"
      >
        {isExporting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Exporting...
          </>
        ) : (
          <>
            <Download className="mr-2 h-4 w-4" />
            Export {entityType === "person" ? "People" : entityType === "activity" ? "Activities" : `${entityType.charAt(0).toUpperCase() + entityType.slice(1)}s`}
          </>
        )}
      </Button>

      {/* Result feedback */}
      {error && (
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {lastExport && (
        <div className="rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4 text-sm text-green-700 dark:text-green-400">
          Exported {lastExport.count} record{lastExport.count !== 1 ? "s" : ""} to{" "}
          <span className="font-medium">{lastExport.filename}</span>
        </div>
      )}
    </div>
  )
}
