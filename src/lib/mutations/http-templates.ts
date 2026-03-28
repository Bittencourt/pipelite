import { db } from "@/db"
import { httpTemplates } from "@/db/schema/http-templates"
import { eq, desc } from "drizzle-orm"
import { z } from "zod"
import type { HttpTemplateRecord } from "@/db/schema/http-templates"

// --- Schema ---

export const createHttpTemplateSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(500).optional().nullable(),
  config: z.record(z.string(), z.unknown()),
  createdBy: z.string().min(1),
})

// --- Result types ---

type CreateResult =
  | { success: true; id: string }
  | { success: false; error: string }

type DeleteResult =
  | { success: true }
  | { success: false; error: string }

// --- Mutations ---

export async function createHttpTemplate(
  input: z.input<typeof createHttpTemplateSchema>
): Promise<CreateResult> {
  const parsed = createHttpTemplateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid input",
    }
  }

  const { name, description, config, createdBy } = parsed.data

  const [record] = await db
    .insert(httpTemplates)
    .values({
      name,
      description: description ?? null,
      config,
      createdBy,
    })
    .returning()

  return { success: true, id: record.id }
}

export async function deleteHttpTemplate(
  id: string,
  userId: string,
  isAdmin: boolean
): Promise<DeleteResult> {
  const existing = await db.query.httpTemplates.findFirst({
    where: eq(httpTemplates.id, id),
  })

  if (!existing) {
    return { success: false, error: "Template not found" }
  }

  // Permission: owner or admin
  if (existing.createdBy !== userId && !isAdmin) {
    return { success: false, error: "Not authorized" }
  }

  await db.delete(httpTemplates).where(eq(httpTemplates.id, id))

  return { success: true }
}

export async function listHttpTemplates(): Promise<HttpTemplateRecord[]> {
  return db.query.httpTemplates.findMany({
    orderBy: desc(httpTemplates.createdAt),
  })
}
