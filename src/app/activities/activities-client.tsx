"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, Calendar, List, CheckCircle2, Search } from "lucide-react"
import { ActivityList, Activity } from "./activity-list"
import { ActivityDialog } from "./activity-dialog"
import { ActivityCalendar } from "./activity-calendar"
import { ActivityFilters } from "./activity-filters"

interface ActivityType {
  id: string
  name: string
  icon: string | null
  color: string | null
}

interface DealInfo {
  id: string
  title: string
  stageId: string
  stage?: { name: string; pipelineId: string } | null
  pipeline?: { name: string } | null
}

interface ActivitiesClientProps {
  activities: Activity[]
  activityTypes: ActivityType[]
  deals: DealInfo[]
  owners: Array<{ id: string; name: string }>
  activeFilters: {
    type: string | null
    owner: string | null
    status: string | null
    dateFrom: string | null
    dateTo: string | null
  }
}

export function ActivitiesClient({
  activities,
  activityTypes,
  deals,
  owners,
  activeFilters,
}: ActivitiesClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null)

  const handleAddNew = () => {
    setEditingActivity(null)
    setDialogOpen(true)
  }

  const handleEdit = (activity: Activity) => {
    setEditingActivity(activity)
    setDialogOpen(true)
  }

  const handleSuccess = () => {
    setDialogOpen(false)
    setEditingActivity(null)
    startTransition(() => {
      router.refresh()
    })
  }

  const handleRefresh = () => {
    startTransition(() => {
      router.refresh()
    })
  }

  // Calculate stats
  const completedCount = activities.filter((a) => a.completedAt).length
  const pendingCount = activities.filter((a) => !a.completedAt).length

  // Check if any filters are active
  const hasActiveFilters = Object.values(activeFilters).some((v) => v !== null)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <CheckCircle2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Activities</h1>
            <p className="text-muted-foreground">
              Manage your tasks, calls, meetings, and emails
            </p>
          </div>
        </div>
        <Button onClick={handleAddNew}>
          <Plus className="h-4 w-4 mr-2" />
          Add Activity
        </Button>
      </div>

      {/* Stats */}
      <div className="flex gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-muted-foreground">Completed:</span>
          <span className="font-medium">{completedCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-amber-500" />
          <span className="text-muted-foreground">Pending:</span>
          <span className="font-medium">{pendingCount}</span>
        </div>
      </div>

      {/* Tabs for List/Calendar view */}
      <Tabs defaultValue="list" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="list" className="gap-2">
            <List className="h-4 w-4" />
            List
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-2">
            <Calendar className="h-4 w-4" />
            Calendar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <div className="space-y-4">
            <ActivityFilters activityTypes={activityTypes} owners={owners} />
            
            {hasActiveFilters && activities.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border rounded-lg">
                <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">No results match your filters</p>
                <p className="text-sm mb-4">Try adjusting your filter criteria</p>
                <Button variant="outline" onClick={() => router.push("/activities")}>
                  Clear filters
                </Button>
              </div>
            ) : (
              <ActivityList
                activities={activities}
                activityTypes={activityTypes}
                onEdit={handleEdit}
                onRefresh={handleRefresh}
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="calendar">
          <ActivityCalendar
            activities={activities}
            activityTypes={activityTypes}
            onSelectActivity={handleEdit}
          />
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <ActivityDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        activity={editingActivity}
        activityTypes={activityTypes}
        deals={deals}
        onSuccess={handleSuccess}
      />
    </div>
  )
}
