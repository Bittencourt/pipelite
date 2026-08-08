import { auth } from "@/auth"
import { db } from "@/db"
import { workflows } from "@/db/schema/workflows"
import { eq } from "drizzle-orm"
import { notFound, redirect } from "next/navigation"
import { WorkflowEditor } from "./workflow-editor"
import type { WorkflowNode } from "@/lib/execution/types"
import type { TriggerConfig } from "@/lib/triggers/types"

export default async function WorkflowEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user) {
    redirect("/login")
  }

  const { id } = await params

  const results = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, id))

  if (results.length === 0) {
    notFound()
  }

  const workflow = results[0]

  return (
    <div className="h-[calc(100vh-3.5rem)]">
      <WorkflowEditor
        workflow={{
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          active: workflow.active,
          triggers: (workflow.triggers ?? []) as unknown as TriggerConfig[],
          nodes: (workflow.nodes ?? []) as unknown as WorkflowNode[],
        }}
      />
    </div>
  )
}
