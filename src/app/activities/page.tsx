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
import { readTrashRetentionDays } from "@/lib/trash/settings"
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
    status?: string
    dateFrom?: string
    dateTo?: string
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
  /*
    ALL THREE OF THESE REACH THE `where` CLAUSE NOW, and none of them is a new filter — every one
    was already in the `searchParams` type above, already written by `activity-filters.tsx` and
    already drawn as a removable chip. What they were not was applied.

    `status` replaces the old `params.status === "completed"` branch, which mapped exactly one of
    three values onto a boolean and left `pending` and `overdue` to a JavaScript pass further down
    this file. `dateFrom`/`dateTo` had no server-side leg at all. The measured consequence, on
    79,022 live activities: `?status=overdue` matched 4,151 rows and rendered 0, `?status=pending`
    matched 4,165 and rendered 0, `?dateFrom=2025-01-01&dateTo=2025-03-31` matched 7,933 and
    rendered 0 — because the narrowing ran over the 50 rows a `limit` had already chosen from the
    unnarrowed set, ordered by `dueDate` ascending, all of them completed.
  */
  if (params.status) {
    filters.status = params.status
  }
  if (params.dateFrom) {
    filters.dateFrom = params.dateFrom
  }
  if (params.dateTo) {
    filters.dateTo = params.dateTo
  }
  if (search) {
    filters.search = search
  }

  // Fetch one extra row to detect hasMore
  filters.limit = PAGE_SIZE * pageNum + 1

  // Fetch activities, types, deals, and users
  const [
    activitiesResult,
    typesResult,
    dealsForDropdown,
    ownersResult,
    bulkOwnersResult,
    retentionDays,
  ] = await Promise.all([
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
    /*
      A SECOND, SEPARATE users query, and the separation is the point. The array above feeds both
      the ActivityFilters owner dropdown and the ActivityDialog, so adding a `status` predicate to
      it would silently drop options from two existing controls — a behaviour change outside this
      phase. A bulk reassign target, by contrast, must be an active principal: transferring
      ownership to a pending or rejected account hands records to someone who cannot sign in
      (T-38-06). Two reads against one table in the same Promise.all is the cost of not breaking
      the other two consumers.
    */
    db.query.users.findMany({
      where: and(isNull(users.deletedAt), eq(users.status, "approved")),
      columns: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: [users.name],
    }),
    readTrashRetentionDays(),
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

  /*
    THE LAST THING DONE TO THE ROW SET, AND NOW THE ONLY THING.

    `hasMore` is meaningful only because the narrowing happens in SQL: the extra 51st row the query
    asked for is the 51st row THAT MATCHES, so its presence really does mean "there is another
    page". Three post-fetch narrowing passes used to run BELOW this point — a date range and a
    pending/overdue status, in JavaScript, over the already-trimmed page. They are gone, replaced by
    real predicates in `getActivities`. Two things were wrong with them and only the first is
    obvious: they could not see rows the `limit` had never fetched (4,151 overdue activities
    rendering as 0), and they ran AFTER `hasMore` was computed, so the button and the visible row
    count described different result sets.
  */
  const hasMore = allActivities.length > PAGE_SIZE * pageNum
  if (hasMore) {
    allActivities = allActivities.slice(0, PAGE_SIZE * pageNum)
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

  // Reassign targets for the bulk action bar only — never passed to ActivityFilters or
  // ActivityDialog, which keep the unfiltered list above.
  const bulkOwners = bulkOwnersResult.map((u) => ({
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

  /*
    `retentionDays` is handed to the client exactly as read. `null` means the pruner is purging
    nothing — the window is unset, corrupted or out of range — and the bulk delete dialog has a
    branch for precisely that state. Any numeric default here would make the UI promise a window
    nobody is enforcing (T-38-10).
  */
  return (
    <div className="container py-8 max-w-7xl">
      <ActivitiesClient
        activities={allActivities}
        activityTypes={activityTypes}
        deals={dealsForDropdown}
        owners={owners}
        users={usersForAssignee}
        bulkOwners={bulkOwners}
        retentionDays={retentionDays}
        activeFilters={activeFilters}
        hasMore={hasMore}
        search={search}
        currentPage={pageNum}
      />
    </div>
  )
}
