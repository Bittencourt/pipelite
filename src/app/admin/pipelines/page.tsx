import { db } from "@/db"
import { pipelines, stages } from "@/db/schema"
import { isNull, desc, eq, count } from "drizzle-orm"
import { DataTable } from "./data-table"
import { columns } from "./columns"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Layers } from "lucide-react"

async function getPipelines() {
  // Query pipelines with stage count using subquery
  const result = await db
    .select({
      id: pipelines.id,
      name: pipelines.name,
      isDefault: pipelines.isDefault,
      createdAt: pipelines.createdAt,
    })
    .from(pipelines)
    .where(isNull(pipelines.deletedAt))
    .orderBy(desc(pipelines.isDefault), desc(pipelines.createdAt))

  // Get stage counts for each pipeline
  const stageCounts = await db
    .select({
      pipelineId: stages.pipelineId,
      count: count(),
    })
    .from(stages)
    .groupBy(stages.pipelineId)

  // Create a map of pipeline ID to stage count
  const stageCountMap = new Map(
    stageCounts.map((sc) => [sc.pipelineId, sc.count])
  )

  // Combine results
  return result.map((pipeline) => ({
    ...pipeline,
    stageCount: stageCountMap.get(pipeline.id) || 0,
  }))
}

export type PipelineListItem = Awaited<ReturnType<typeof getPipelines>>[number]

export default async function PipelinesPage() {
  const pipelines = await getPipelines()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Layers className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Pipelines</h1>
          <p className="text-muted-foreground">
            Configure sales pipelines and their stages
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="sr-only">
          <CardTitle>Pipelines List</CardTitle>
          <CardDescription>
            A table of all pipelines in your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={pipelines} />
        </CardContent>
      </Card>
    </div>
  )
}
