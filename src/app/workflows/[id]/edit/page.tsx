import { auth } from "@/auth"
import { db } from "@/db"
import { workflowRuns, workflows } from "@/db/schema/workflows"
import { and, desc, eq } from "drizzle-orm"
import { notFound, redirect } from "next/navigation"
import { WorkflowEditor } from "./workflow-editor"
import type { WorkflowNode } from "@/lib/execution/types"
import type { TriggerConfig } from "@/lib/triggers/types"

/**
 * The trigger DATA out of a stored trigger ENVELOPE (WFOPS-02).
 *
 * `workflow_runs.trigger_data` holds the whole `TriggerEnvelope` — `create-run.ts:71` writes it
 * verbatim — and the test-run dialog edits only its `data` payload, because `startDryRun` builds a
 * fresh envelope around whatever the operator submits. Prefilling with the envelope would put
 * `trigger_type` and `timestamp` in front of the operator as if they were editable, and nest the
 * real payload one level deeper than the workflow's own templates read it (`engine.ts:157-158`
 * resolves `?.data`).
 *
 * Total by construction: the column is nullable, rows written before the envelope shape settled can
 * hold anything, and an unrecognisable blob prefills nothing rather than throwing on an edit page.
 */
function triggerPayloadOf(triggerData: Record<string, unknown> | null): Record<string, unknown> | null {
  if (triggerData === null) return null

  const data = triggerData.data

  if (data === null || typeof data !== "object" || Array.isArray(data)) return null

  return data as Record<string, unknown>
}

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

  /*
   * One round trip for both. The second read is the test-run prefill: the most recent REAL run of
   * this workflow, `dryRun = false` so a previous test cannot become the next test's input — that
   * would let a mistyped payload propagate forward silently. The comparison is safe because the
   * column is NOT NULL DEFAULT false (schema/workflows.ts:53); a nullable one would make
   * eq(dryRun, false) evaluate to NULL for every pre-existing row.
   */
  const [results, latestRuns] = await Promise.all([
    db.select().from(workflows).where(eq(workflows.id, id)),
    db
      .select({ triggerData: workflowRuns.triggerData })
      .from(workflowRuns)
      .where(and(eq(workflowRuns.workflowId, id), eq(workflowRuns.dryRun, false)))
      .orderBy(desc(workflowRuns.createdAt))
      .limit(1),
  ])

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
        latestTriggerData={triggerPayloadOf(latestRuns[0]?.triggerData ?? null)}
      />
    </div>
  )
}
