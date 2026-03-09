import { auth } from "@/auth"
import { db } from "@/db"
import { deals, stages, pipelines, users, dealAssignees } from "@/db/schema"
import { eq, and, isNull, gte, lte, asc, sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { KanbanBoard } from "./kanban-board"
import { getTranslations } from 'next-intl/server'


interface DealWithRelations {
  id: string
  title: string
  value: string | null
  stageId: string
  position: string
  ownerId: string
  organizationId: string | null
  personId: string | null
  expectedCloseDate?: Date | null
  notes?: string | null
  organization: { id: string; name: string } | null
  person: { id: string; firstName: string; lastName: string } | null
  assignees: { userId: string; user: { id: string; name: string | null; email: string } }[]
}

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{
    pipeline?: string
    stage?: string
    owner?: string
    assignee?: string
    dateFrom?: string
    dateTo?: string
  }>
}) {
  const session = await auth()
  const params = await searchParams
  const t = await getTranslations('deals')

  if (!session?.user?.id) {
    redirect("/login")
  }

  // Fetch all pipelines (not deleted, ordered by isDefault then name)
  const allPipelines = await db.query.pipelines.findMany({
    where: isNull(pipelines.deletedAt),
    orderBy: [
      sql`${pipelines.isDefault} DESC`,
      pipelines.name,
    ],
    columns: {
      id: true,
      name: true,
      isDefault: true,
    },
  })

  // If no pipelines exist, show empty state
  if (allPipelines.length === 0) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">{t('title')}</h1>
        </div>
        <div className="text-center py-12 text-muted-foreground border rounded-lg">
          {t('noPipelines')}
        </div>
      </div>
    )
  }

  // Determine selected pipeline (from query param, default, or first)
  const selectedPipeline = params.pipeline
    ? allPipelines.find(p => p.id === params.pipeline)
    : allPipelines.find(p => p.isDefault) || allPipelines[0]
  
  if (!selectedPipeline) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">{t('title')}</h1>
        </div>
        <div className="text-center py-12 text-muted-foreground border rounded-lg">
          {t('pipelineNotFound')}
        </div>
      </div>
    )
  }
  
  const selectedPipelineId = selectedPipeline.id

  // Fetch stages for the selected pipeline
  const pipelineStages = await db.query.stages.findMany({
    where: eq(stages.pipelineId, selectedPipelineId),
    orderBy: [stages.position],
  })

  // Fetch all deals with relations (for the selected pipeline's stages, with optional filters)
  const stageIds = pipelineStages.map(s => s.id)
  
  // Build filter conditions
  const filterConditions = [
    sql`${deals.stageId} IN ${stageIds}`,
    isNull(deals.deletedAt),
    // Stage filter - only apply if filtering by a specific stage
    params.stage ? eq(deals.stageId, params.stage) : undefined,
    // Owner filter
    params.owner ? eq(deals.ownerId, params.owner) : undefined,
    // Assignee filter
    params.assignee
      ? sql`${deals.id} IN (SELECT deal_id FROM deal_assignees WHERE user_id = ${params.assignee})`
      : undefined,
    // Date range filters
    params.dateFrom ? gte(deals.expectedCloseDate, new Date(params.dateFrom)) : undefined,
    params.dateTo ? lte(deals.expectedCloseDate, new Date(params.dateTo)) : undefined,
  ].filter(Boolean)
  
  const allDeals = stageIds.length > 0
    ? await db.query.deals.findMany({
        where: and(...filterConditions),
        orderBy: [sql`${deals.position} ASC`],
        with: {
          organization: {
            columns: {
              id: true,
              name: true,
            },
          },
          person: {
            columns: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          assignees: {
            with: {
              user: { columns: { id: true, name: true, email: true } },
            },
          },
        },
      })
    : []

  // Group deals by stage
  const dealsByStage: Record<string, DealWithRelations[]> = {}
  for (const stage of pipelineStages) {
    dealsByStage[stage.id] = []
  }
  for (const deal of allDeals) {
    if (deal.stageId in dealsByStage) {
      dealsByStage[deal.stageId].push(deal as DealWithRelations)
    }
  }

  // Fetch all users (for owner filter dropdown)
  const allUsers = await db.query.users.findMany({
    where: isNull(users.deletedAt),
    columns: { id: true, email: true, name: true },
    orderBy: [users.email],
  })

  // Get first open stage for default create dialog
  const firstOpenStage = pipelineStages.find(s => s.type === 'open')

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
      </div>

      <KanbanBoard
        selectedPipelineId={selectedPipelineId}
        pipelines={allPipelines.map(p => ({ id: p.id, name: p.name }))}
        stages={pipelineStages.map(s => ({
          id: s.id,
          name: s.name,
          pipelineId: s.pipelineId,
          color: s.color as 'slate' | 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'cyan' | 'orange',
          type: s.type,
        }))}
        dealsByStage={dealsByStage}
        defaultStageId={firstOpenStage?.id}
        owners={allUsers.map(u => ({ id: u.id, name: u.name || u.email }))}
        users={allUsers.map(u => ({ id: u.id, name: u.name, email: u.email }))}
        activeFilters={{
          stage: params.stage,
          owner: params.owner,
          assignee: params.assignee,
          dateFrom: params.dateFrom,
          dateTo: params.dateTo
        }}
      />
    </div>
  )
}
