import { auth } from "@/auth"
import { db } from "@/db"
import { deals, stages, pipelines } from "@/db/schema"
import { isNull, eq, and, asc, sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { ActivityList, Activity } from "./activity-list"
import { ActivityDialog } from "./activity-dialog"
import { getActivityTypes, getActivities } from "./actions"
import { Button } from "@/components/ui/button"
import { Plus, Calendar, List } from "lucide-react"
import { ActivitiesClient } from "./activities-client"

// Get deals with stage/pipeline info for dropdown
async function getDealsForDropdown() {
  const result = await db
    .select({
      id: deals.id,
      title: deals.title,
      stageId: deals.stageId,
      stageName: stages.name,
      pipelineId: pipelines.id,
      pipelineName: pipelines.name,
    })
    .from(deals)
    .innerJoin(stages, eq(deals.stageId, stages.id))
    .innerJoin(pipelines, eq(stages.pipelineId, pipelines.id))
    .where(and(isNull(deals.deletedAt), isNull(pipelines.deletedAt)))
    .orderBy(deals.title)

  return result.map((deal) => ({
    id: deal.id,
    title: deal.title,
    stageId: deal.stageId,
    stage: {
      name: deal.stageName,
      pipelineId: deal.pipelineId,
    },
    pipeline: {
      name: deal.pipelineName,
    },
  }))
}

export default async function ActivitiesPage() {
  const session = await auth()

  if (!session?.user?.id) {
    redirect("/login")
  }

  // Fetch activities and types
  const [activitiesResult, typesResult, dealsForDropdown] = await Promise.all([
    getActivities(),
    getActivityTypes(),
    getDealsForDropdown(),
  ])

  // Handle errors
  if (!activitiesResult.success || !typesResult.success) {
    return (
      <div className="container py-8">
        <div className="text-center py-12 text-muted-foreground border rounded-lg">
          Error loading activities. Please try again.
        </div>
      </div>
    )
  }

  const activities = (activitiesResult.data as Activity[]).map((a: Activity) => ({
    ...a,
    // Ensure date objects
    dueDate: new Date(a.dueDate),
    completedAt: a.completedAt ? new Date(a.completedAt) : null,
  }))

  const activityTypes = typesResult.data as Array<{
    id: string
    name: string
    icon: string | null
    color: string | null
  }>

  return (
    <div className="container py-8 max-w-7xl">
      <ActivitiesClient
        activities={activities}
        activityTypes={activityTypes}
        deals={dealsForDropdown}
      />
    </div>
  )
}
