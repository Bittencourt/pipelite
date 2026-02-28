import { db } from "@/db"
import { users, stages, pipelines } from "@/db/schema"
import { isNull, asc, eq } from "drizzle-orm"
import { ExportForm } from "./export-form"
import type { ExportFilters } from "@/lib/export/types"

export default async function ExportPage({
  searchParams,
}: {
  searchParams: Promise<{
    stage?: string
    owner?: string
    dateFrom?: string
    dateTo?: string
  }>
}) {
  const params = await searchParams

  // Build initial filters from URL params
  const initialFilters: ExportFilters = {}
  if (params.stage) initialFilters.stage = params.stage
  if (params.owner) initialFilters.owner = params.owner
  if (params.dateFrom) initialFilters.dateFrom = params.dateFrom
  if (params.dateTo) initialFilters.dateTo = params.dateTo

  // Fetch owners for filter dropdown
  const allUsers = await db.query.users.findMany({
    where: isNull(users.deletedAt),
    columns: { id: true, name: true, email: true },
    orderBy: [asc(users.email)],
  })

  // Fetch stages for filter dropdown (all pipelines)
  const allStages = await db
    .select({
      id: stages.id,
      name: stages.name,
      pipelineName: pipelines.name,
    })
    .from(stages)
    .innerJoin(pipelines, eq(stages.pipelineId, pipelines.id))
    .where(isNull(pipelines.deletedAt))
    .orderBy(asc(pipelines.name), asc(stages.position))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Export Data</h1>
        <p className="text-muted-foreground">
          Export your CRM data in CSV, JSON, or Pipedrive-compatible format
        </p>
      </div>

      <ExportForm
        initialFilters={
          Object.keys(initialFilters).length > 0 ? initialFilters : undefined
        }
        owners={allUsers.map((u) => ({
          id: u.id,
          name: u.name || u.email,
        }))}
        stages={allStages.map((s) => ({
          id: s.id,
          name: `${s.pipelineName} - ${s.name}`,
        }))}
      />
    </div>
  )
}
