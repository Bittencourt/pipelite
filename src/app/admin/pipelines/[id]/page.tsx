import { db } from "@/db"
import { pipelines, stages } from "@/db/schema"
import { isNull, eq, asc, and } from "drizzle-orm"
import { notFound } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ChevronLeft, Layers } from "lucide-react"
import { StageConfigurator } from "./stage-configurator"

interface PageProps {
  params: Promise<{ id: string }>
}

async function getPipeline(id: string) {
  const pipeline = await db.query.pipelines.findFirst({
    where: and(
      eq(pipelines.id, id),
      isNull(pipelines.deletedAt)
    ),
  })
  return pipeline
}

async function getStages(pipelineId: string) {
  const stageList = await db.query.stages.findMany({
    where: eq(stages.pipelineId, pipelineId),
    orderBy: [asc(stages.position)],
  })
  return stageList
}

export default async function PipelineDetailPage({ params }: PageProps) {
  const { id } = await params
  const pipeline = await getPipeline(id)

  if (!pipeline) {
    notFound()
  }

  const stageList = await getStages(id)

  // Transform stages for client component
  const initialStages = stageList.map((stage) => ({
    id: stage.id,
    name: stage.name,
    description: stage.description,
    color: stage.color as keyof typeof import("@/lib/stage-colors").STAGE_COLORS,
    type: stage.type as "open" | "won" | "lost",
    position: stage.position,
  }))

  // Calculate existing types for validation
  const existingTypes = {
    hasWon: stageList.some((s) => s.type === "won"),
    hasLost: stageList.some((s) => s.type === "lost"),
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground">
        <Link href="/admin" className="hover:text-foreground">
          Admin
        </Link>
        {" / "}
        <Link href="/admin/pipelines" className="hover:text-foreground">
          Pipelines
        </Link>
        {" / "}
        <span className="text-foreground">{pipeline.name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Layers className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">{pipeline.name}</h1>
            <p className="text-muted-foreground">
              Configure stages for this pipeline
            </p>
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link href="/admin/pipelines">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to Pipelines
          </Link>
        </Button>
      </div>

      {/* Stage Configurator */}
      <StageConfigurator
        pipelineId={id}
        pipelineName={pipeline.name}
        initialStages={initialStages}
        existingTypes={existingTypes}
      />
    </div>
  )
}
