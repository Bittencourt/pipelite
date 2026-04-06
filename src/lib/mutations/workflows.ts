import { db } from "@/db"
import { workflows, workflowRuns, workflowRunSteps } from "@/db/schema/workflows"
import { eq, desc, count, inArray } from "drizzle-orm"
import { z } from "zod"
import type { Workflow } from "@/db/schema/workflows"
import { generateWebhookSecret } from "@/lib/triggers/webhook-secret"

// --- Schemas ---

export const createWorkflowSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Name must be 200 characters or less"),
  description: z.string().max(2000).optional().nullable(),
  triggers: z.array(z.record(z.string(), z.unknown())).default([]),
  nodes: z.array(z.record(z.string(), z.unknown())).default([]),
  createdBy: z.string().min(1, "Created by is required"),
})

export const updateWorkflowSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Name must be 200 characters or less").optional(),
  description: z.string().max(2000).nullable().optional(),
  triggers: z.array(z.record(z.string(), z.unknown())).optional(),
  nodes: z.array(z.record(z.string(), z.unknown())).optional(),
  active: z.boolean().optional(),
})

// --- Result types ---

type CreateResult =
  | { success: true; id: string; workflow: Workflow }
  | { success: false; error: string }

type UpdateResult =
  | { success: true; workflow: Workflow }
  | { success: false; error: string }

type DeleteResult =
  | { success: true }
  | { success: false; error: string }

// --- Mutations ---

export async function createWorkflow(
  input: z.input<typeof createWorkflowSchema>
): Promise<CreateResult> {
  const parsed = createWorkflowSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || "Invalid input" }
  }

  const { name, description, triggers, nodes, createdBy } = parsed.data

  const [workflow] = await db
    .insert(workflows)
    .values({
      name,
      description: description ?? null,
      triggers,
      nodes,
      active: false,
      createdBy,
    })
    .returning()

  return { success: true, id: workflow.id, workflow }
}

export async function updateWorkflow(
  id: string,
  input: z.infer<typeof updateWorkflowSchema>
): Promise<UpdateResult> {
  const existing = await db.query.workflows.findFirst({
    where: eq(workflows.id, id),
  })

  if (!existing) {
    return { success: false, error: "Workflow not found" }
  }

  const parsed = updateWorkflowSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || "Invalid input" }
  }

  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
  }

  const data = parsed.data
  if (data.name !== undefined) updates.name = data.name
  if (data.description !== undefined) updates.description = data.description
  if (data.triggers !== undefined) updates.triggers = data.triggers
  if (data.nodes !== undefined) updates.nodes = data.nodes
  if (data.active !== undefined) updates.active = data.active

  const [workflow] = await db
    .update(workflows)
    .set(updates)
    .where(eq(workflows.id, id))
    .returning()

  return { success: true, workflow }
}

export async function deleteWorkflow(id: string): Promise<DeleteResult> {
  const existing = await db.query.workflows.findFirst({
    where: eq(workflows.id, id),
  })

  if (!existing) {
    return { success: false, error: "Workflow not found" }
  }

  // Cascade delete: steps -> runs -> workflow
  const runs = await db
    .select({ id: workflowRuns.id })
    .from(workflowRuns)
    .where(eq(workflowRuns.workflowId, id))

  if (runs.length > 0) {
    const runIds = runs.map((r) => r.id)
    await db.delete(workflowRunSteps).where(inArray(workflowRunSteps.runId, runIds))
    await db.delete(workflowRuns).where(eq(workflowRuns.workflowId, id))
  }

  await db.delete(workflows).where(eq(workflows.id, id))

  return { success: true }
}

export async function getWorkflow(id: string): Promise<Workflow | null> {
  const workflow = await db.query.workflows.findFirst({
    where: eq(workflows.id, id),
  })

  return workflow ?? null
}

// --- Webhook Secret Regeneration ---

type RegenerateSecretResult =
  | { success: true; secret: string }
  | { success: false; error: string }

export async function regenerateWebhookSecret(
  workflowId: string,
  userId: string
): Promise<RegenerateSecretResult> {
  const existing = await db.query.workflows.findFirst({
    where: eq(workflows.id, workflowId),
  })

  if (!existing) {
    return { success: false, error: "Workflow not found" }
  }

  // Authorization: only the creator can regenerate the secret
  if (existing.createdBy !== userId) {
    return { success: false, error: "Not authorized" }
  }

  const newSecret = generateWebhookSecret()

  // Update the webhook trigger config in the triggers JSONB array
  const triggers = (existing.triggers ?? []) as Array<Record<string, unknown>>
  const updatedTriggers = triggers.map((t) => {
    if (t.type === "webhook") {
      return { ...t, secret: newSecret }
    }
    return t
  })

  await db
    .update(workflows)
    .set({
      webhookSecret: newSecret,
      triggers: updatedTriggers,
      updatedAt: new Date(),
    })
    .where(eq(workflows.id, workflowId))

  return { success: true, secret: newSecret }
}

export async function listWorkflows(
  options: { offset?: number; limit?: number } = {}
): Promise<{ workflows: Workflow[]; total: number }> {
  const { offset = 0, limit = 50 } = options

  const [{ total }] = await db
    .select({ total: count() })
    .from(workflows)

  const results = await db.query.workflows.findMany({
    orderBy: desc(workflows.createdAt),
    offset,
    limit,
  })

  return { workflows: results, total }
}
