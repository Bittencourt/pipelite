"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Building2, Users, Briefcase, Calendar, Settings, Layers, Loader2 } from "lucide-react"
import type { PipedriveCounts } from "@/lib/import/pipedrive-api-import-actions"
import type { PipedriveImportConfig } from "@/lib/import/pipedrive-api-types"

interface PreviewStepProps {
  counts: PipedriveCounts
  selectedEntities: PipedriveImportConfig["entities"]
  onBack: () => void
  onConfirm: () => void
  isLoading?: boolean
}

function formatCount(count: number, hasMore?: boolean): string {
  if (hasMore) return `${count.toLocaleString()}+`
  return count.toLocaleString()
}

export function PreviewStep({ counts, selectedEntities, onBack, onConfirm, isLoading }: PreviewStepProps) {
  const items = [
    { key: "pipelines", label: "Pipelines", count: counts.pipelines, hasMore: false, icon: Layers, alwaysShow: true },
    { key: "stages", label: "Stages", count: counts.stages, hasMore: false, icon: Layers, alwaysShow: true },
    { key: "customFields", label: "Custom Fields", count: counts.dealFields + counts.personFields + counts.organizationFields + counts.activityFields, hasMore: false, icon: Settings },
    { key: "organizations", label: "Organizations", count: counts.organizations, hasMore: counts.organizationsHasMore, icon: Building2 },
    { key: "people", label: "People", count: counts.people, hasMore: counts.peopleHasMore, icon: Users },
    { key: "deals", label: "Deals", count: counts.deals, hasMore: counts.dealsHasMore, icon: Briefcase },
    { key: "activities", label: "Activities", count: counts.activities, hasMore: counts.activitiesHasMore, icon: Calendar },
  ]

  const filteredItems = items.filter(item =>
    item.alwaysShow || selectedEntities[item.key as keyof typeof selectedEntities]
  )

  const totalCount = filteredItems.reduce((sum, item) => sum + item.count, 0)
  const anyHasMore = filteredItems.some(item => item.hasMore)

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Preview Import</h3>
        <p className="text-muted-foreground text-sm mt-1">
          Review the data that will be imported from Pipedrive.
        </p>
      </div>

      <div className="grid gap-3">
        {filteredItems.map((item) => (
          <Card key={item.key}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <item.icon className="h-5 w-5 text-muted-foreground" />
                <span>{item.label}</span>
              </div>
              <span className="font-medium">{formatCount(item.count, item.hasMore)}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        Total records to import: <strong>{anyHasMore ? `${totalCount.toLocaleString()}+` : totalCount.toLocaleString()}</strong>
        {anyHasMore && " (exact count determined during import)"}
      </p>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={isLoading}>
          Back
        </Button>
        <Button onClick={onConfirm} disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Starting...
            </>
          ) : (
            "Start Import"
          )}
        </Button>
      </div>
    </div>
  )
}
