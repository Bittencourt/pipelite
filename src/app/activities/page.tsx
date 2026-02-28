import { auth } from "@/auth"
import { db } from "@/db"
import { deals, stages, pipelines, users } from "@/db/schema"
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

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string
    owner?: string
    status?: string
    dateFrom?: string
    dateTo?: string
  }>
}) {
  const session = await auth()
  const params = await searchParams

  if (!session?.user?.id) {
    redirect("/login")
  }

  // Build filters for getActivities
  const filters: {
    typeId?: string
    ownerId?: string
    completed?: boolean
  } = {}

  if (params.type) {
    filters.typeId = params.type
  }
  if (params.owner) {
    filters.ownerId = params.owner
  }
  if (params.status === "completed") {
    filters.completed = true
  }

  // Fetch activities, types, deals, and users
  const [activitiesResult, typesResult, dealsForDropdown, ownersResult] = await Promise.all([
    getActivities(filters),
    getActivityTypes(),
    getDealsForDropdown(),
    db.query.users.findMany({
      where: isNull(users.deletedAt),
      columns: {
        id: true,
        name: true,
      },
      orderBy: [users.name],
    }),
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

  let activities = (activitiesResult.data as Activity[]).map((a: Activity) => ({
    ...a,
    // Ensure date objects
    dueDate: new Date(a.dueDate),
    completedAt: a.completedAt ? new Date(a.completedAt) : null,
  }))

  // Apply client-side date range filtering (server-side would need SQL date comparison)
  if (params.dateFrom) {
    const fromDate = new Date(params.dateFrom)
    fromDate.setHours(0, 0, 0, 0)
    activities = activities.filter((a: Activity) => new Date(a.dueDate) >= fromDate)
  }
  if (params.dateTo) {
    const toDate = new Date(params.dateTo)
    toDate.setHours(23, 59, 59, 999)
    activities = activities.filter((a: Activity) => new Date(a.dueDate) <= toDate)
  }

  // Filter for pending/overdue status (not completed)
  if (params.status === "pending") {
    activities = activities.filter((a: Activity) => !a.completedAt && new Date(a.dueDate) >= new Date())
  } else if (params.status === "overdue") {
    activities = activities.filter((a: Activity) => !a.completedAt && new Date(a.dueDate) < new Date())
  }

  const activityTypes = typesResult.data as Array<{
    id: string
    name: string
    icon: string | null
    color: string | null
  }>

  // Map owners to include name (handle null name)
  const owners = ownersResult.map((u) => ({
    id: u.id,
    name: u.name || "Unknown",
  }))

  // Calculate active filter count
  const activeFilters = {
    type: params.type || null,
    owner: params.owner || null,
    status: params.status || null,
    dateFrom: params.dateFrom || null,
    dateTo: params.dateTo || null,
  }

  return (
    <div className="container py-8 max-w-7xl">
      <ActivitiesClient
        activities={activities}
        activityTypes={activityTypes}
        deals={dealsForDropdown}
        owners={owners}
        activeFilters={activeFilters}
      />
    </div>
  )
}
