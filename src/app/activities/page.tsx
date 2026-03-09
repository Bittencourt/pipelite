import { auth } from "@/auth"
import { db } from "@/db"
import { deals, stages, pipelines, users } from "@/db/schema"
import { isNull, eq, and } from "drizzle-orm"
import { redirect } from "next/navigation"
import { ActivityList, Activity } from "./activity-list"
import { ActivityDialog } from "./activity-dialog"
import { getActivityTypes, getActivities } from "./actions"
import { Button } from "@/components/ui/button"
import { Plus, Calendar, List } from "lucide-react"
import { ActivitiesClient } from "./activities-client"
import { getTranslations } from 'next-intl/server'

const PAGE_SIZE = 50

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
    assignee?: string
    status?: string
    dateFrom?: string
    dateTo?: string
    search?: string
    page?: string
  }>
}) {
  const session = await auth()
  const params = await searchParams
  const t = await getTranslations('activities')

  if (!session?.user?.id) {
    redirect("/login")
  }

  const pageNum = Math.max(1, parseInt(params.page ?? "1"))
  const search = params.search ?? ""

  // Build filters for getActivities
  const filters: {
    typeId?: string
    ownerId?: string
    assigneeId?: string
    completed?: boolean
    search?: string
    limit?: number
  } = {}

  if (params.type) {
    filters.typeId = params.type
  }
  if (params.owner) {
    filters.ownerId = params.owner
  }
  if (params.assignee) {
    filters.assigneeId = params.assignee
  }
  if (params.status === "completed") {
    filters.completed = true
  }
  if (search) {
    filters.search = search
  }

  // Fetch one extra row to detect hasMore
  filters.limit = PAGE_SIZE * pageNum + 1

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
        email: true,
      },
      orderBy: [users.name],
    }),
  ])

  // Handle errors
  if (!activitiesResult.success || !typesResult.success) {
    return (
      <div className="container py-8">
        <div className="text-center py-12 text-muted-foreground border rounded-lg">
          {t('errorLoading')}
        </div>
      </div>
    )
  }

  let allActivities = (activitiesResult.data as Activity[]).map((a: Activity) => ({
    ...a,
    // Ensure date objects
    dueDate: new Date(a.dueDate),
    completedAt: a.completedAt ? new Date(a.completedAt) : null,
  }))

  // Detect hasMore and trim the extra row
  const hasMore = allActivities.length > PAGE_SIZE * pageNum
  if (hasMore) {
    allActivities = allActivities.slice(0, PAGE_SIZE * pageNum)
  }

  // Apply client-side date range filtering (server-side would need SQL date comparison)
  if (params.dateFrom) {
    const fromDate = new Date(params.dateFrom)
    fromDate.setHours(0, 0, 0, 0)
    allActivities = allActivities.filter((a: Activity) => new Date(a.dueDate) >= fromDate)
  }
  if (params.dateTo) {
    const toDate = new Date(params.dateTo)
    toDate.setHours(23, 59, 59, 999)
    allActivities = allActivities.filter((a: Activity) => new Date(a.dueDate) <= toDate)
  }

  // Filter for pending/overdue status (not completed)
  if (params.status === "pending") {
    allActivities = allActivities.filter((a: Activity) => !a.completedAt && new Date(a.dueDate) >= new Date())
  } else if (params.status === "overdue") {
    allActivities = allActivities.filter((a: Activity) => !a.completedAt && new Date(a.dueDate) < new Date())
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

  // Users list for assignee select and filter (same pool as owners)
  const usersForAssignee = ownersResult.map((u) => ({
    id: u.id,
    name: u.name || "Unknown",
    email: u.email,
  }))

  // Calculate active filter count
  const activeFilters = {
    type: params.type || null,
    owner: params.owner || null,
    assignee: params.assignee || null,
    status: params.status || null,
    dateFrom: params.dateFrom || null,
    dateTo: params.dateTo || null,
  }

  return (
    <div className="container py-8 max-w-7xl">
      <ActivitiesClient
        activities={allActivities}
        activityTypes={activityTypes}
        deals={dealsForDropdown}
        owners={owners}
        users={usersForAssignee}
        activeFilters={activeFilters}
        hasMore={hasMore}
        search={search}
        currentPage={pageNum}
      />
    </div>
  )
}
