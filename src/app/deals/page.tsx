import { auth } from "@/auth"
import { db } from "@/db"
import { deals, stages, pipelines, organizations, people } from "@/db/schema"
import { eq, and, isNull, asc, sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { KanbanBoard } from "./kanban-board"


interface DealWithRelations {
  id: string
  title: string
  value: string | null
  stageId: string
  position: string
  organizationId: string | null
  personId: string | null
  expectedCloseDate?: Date | null
  notes?: string | null
  organization: { id: string; name: string } | null
  person: { id: string; firstName: string; lastName: string } | null
}

export default async function DealsPage() {
  const session = await auth()

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
          <h1 className="text-3xl font-bold">Deals</h1>
        </div>
        <div className="text-center py-12 text-muted-foreground border rounded-lg">
          No pipelines exist yet. Create a pipeline first to manage deals.
        </div>
      </div>
    )
  }

  // Determine selected pipeline (default or first)
  const selectedPipeline = allPipelines.find(p => p.isDefault) || allPipelines[0]
  const selectedPipelineId = selectedPipeline.id

  // Fetch stages for the selected pipeline
  const pipelineStages = await db.query.stages.findMany({
    where: eq(stages.pipelineId, selectedPipelineId),
    orderBy: [stages.position],
  })

  // Fetch all deals with relations (for the selected pipeline's stages)
  const stageIds = pipelineStages.map(s => s.id)
  const allDeals = stageIds.length > 0
    ? await db.query.deals.findMany({
        where: and(
          sql`${deals.stageId} IN ${stageIds}`,
          isNull(deals.deletedAt)
        ),
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

  // Fetch all organizations (not deleted, for dropdown)
  const allOrganizations = await db.query.organizations.findMany({
    where: isNull(organizations.deletedAt),
    orderBy: [organizations.name],
    columns: {
      id: true,
      name: true,
    },
  })

  // Fetch all people (not deleted, for dropdown)
  const allPeople = await db.query.people.findMany({
    where: isNull(people.deletedAt),
    orderBy: [people.firstName, people.lastName],
    columns: {
      id: true,
      firstName: true,
      lastName: true,
    },
  })

  // Get first open stage for default create dialog
  const firstOpenStage = pipelineStages.find(s => s.type === 'open')

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Deals</h1>
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
        organizations={allOrganizations}
        people={allPeople}
        defaultStageId={firstOpenStage?.id}
      />
    </div>
  )
}
