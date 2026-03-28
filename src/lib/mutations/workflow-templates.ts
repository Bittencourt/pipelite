import { db } from "@/db"
import { workflowTemplates } from "@/db/schema/workflows"
import { eq, desc, count } from "drizzle-orm"
import { z } from "zod"
import type { WorkflowTemplate } from "@/db/schema/workflows"

export const createWorkflowTemplateSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(2000).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  trigger: z.record(z.string(), z.unknown()),
  nodes: z.array(z.record(z.string(), z.unknown())).default([]),
})

type CreateResult =
  | { success: true; id: string; template: WorkflowTemplate }
  | { success: false; error: string }
type DeleteResult = { success: true } | { success: false; error: string }

export async function createWorkflowTemplate(
  input: z.infer<typeof createWorkflowTemplateSchema>
): Promise<CreateResult> {
  const parsed = createWorkflowTemplateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid input",
    }
  }
  const { name, description, category, trigger, nodes } = parsed.data
  const [template] = await db
    .insert(workflowTemplates)
    .values({
      name,
      description: description ?? null,
      category: category ?? null,
      trigger,
      nodes,
    })
    .returning()
  return { success: true, id: template.id, template }
}

export async function getWorkflowTemplate(
  id: string
): Promise<WorkflowTemplate | null> {
  const [template] = await db
    .select()
    .from(workflowTemplates)
    .where(eq(workflowTemplates.id, id))
  return template ?? null
}

export async function listWorkflowTemplates(
  options: { offset?: number; limit?: number } = {}
): Promise<{ templates: WorkflowTemplate[]; total: number }> {
  const { offset = 0, limit = 50 } = options
  const [{ total: totalCount }] = await db
    .select({ total: count() })
    .from(workflowTemplates)
  const results = await db
    .select()
    .from(workflowTemplates)
    .orderBy(desc(workflowTemplates.createdAt))
    .offset(offset)
    .limit(limit)
  return { templates: results, total: totalCount }
}

export async function deleteWorkflowTemplate(
  id: string
): Promise<DeleteResult> {
  const [existing] = await db
    .select()
    .from(workflowTemplates)
    .where(eq(workflowTemplates.id, id))
  if (!existing) {
    return { success: false, error: "Workflow template not found" }
  }
  await db.delete(workflowTemplates).where(eq(workflowTemplates.id, id))
  return { success: true }
}
