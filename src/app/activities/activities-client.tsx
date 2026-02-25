"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, Calendar, List, CheckCircle2 } from "lucide-react"
import { ActivityList, Activity } from "./activity-list"
import { ActivityDialog } from "./activity-dialog"

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
}

export function ActivitiesClient({
  activities,
  activityTypes,
  deals,
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
          <TabsTrigger value="calendar" className="gap-2" disabled>
            <Calendar className="h-4 w-4" />
            Calendar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <ActivityList
            activities={activities}
            activityTypes={activityTypes}
            onEdit={handleEdit}
            onRefresh={handleRefresh}
          />
        </TabsContent>

        <TabsContent value="calendar">
          <div className="text-center py-12 text-muted-foreground border rounded-lg">
            Calendar view coming soon
          </div>
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
