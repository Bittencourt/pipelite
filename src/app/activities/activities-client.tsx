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
import { useTranslations } from "next-intl"

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
  users: Array<{ id: string; name: string; email: string }>
  activeFilters: {
    type: string | null
    owner: string | null
    assignee: string | null
    status: string | null
    dateFrom: string | null
    dateTo: string | null
  }
  hasMore?: boolean
  search?: string
  currentPage?: number
}

export function ActivitiesClient({
  activities,
  activityTypes,
  deals,
  owners,
  users,
  activeFilters,
  hasMore = false,
  search = "",
  currentPage = 1,
}: ActivitiesClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null)
  const t = useTranslations('activities')

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

  const handleLoadMore = () => {
    const sp = new URLSearchParams(window.location.search)
    sp.set("page", String(currentPage + 1))
    router.push(`/activities?${sp.toString()}`)
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
            <h1 className="text-3xl font-bold">{t('title')}</h1>
            <p className="text-muted-foreground">
              {t('manageActivities')}
            </p>
          </div>
        </div>
        <Button onClick={handleAddNew}>
          <Plus className="h-4 w-4 mr-2" />
          {t('addActivity')}
        </Button>
      </div>

      {/* Stats */}
      <div className="flex gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-muted-foreground">{t('completed')}:</span>
          <span className="font-medium">{completedCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-amber-500" />
          <span className="text-muted-foreground">{t('pending')}:</span>
          <span className="font-medium">{pendingCount}</span>
        </div>
      </div>

      {/* Tabs for List/Calendar view */}
      <Tabs defaultValue="list" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="list" className="gap-2">
            <List className="h-4 w-4" />
            {t('list')}
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-2">
            <Calendar className="h-4 w-4" />
            {t('calendar')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <div className="space-y-4">
            <ActivityFilters
              activityTypes={activityTypes}
              owners={owners}
              assignees={users.map(u => ({ id: u.id, name: u.name || u.email }))}
              search={search}
            />

            {hasActiveFilters && activities.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border rounded-lg">
                <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">{t('noResultsMatch')}</p>
                <p className="text-sm mb-4">{t('tryAdjusting')}</p>
                <Button variant="outline" onClick={() => router.push("/activities")}>
                  {t('clearFilters')}
                </Button>
              </div>
            ) : (
              <>
                <ActivityList
                  activities={activities}
                  activityTypes={activityTypes}
                  onEdit={handleEdit}
                  onRefresh={handleRefresh}
                />
                {hasMore && (
                  <div className="flex justify-center pt-4">
                    <Button variant="outline" onClick={handleLoadMore}>
                      Load More
                    </Button>
                  </div>
                )}
              </>
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
        users={users}
        onSuccess={handleSuccess}
      />
    </div>
  )
}
