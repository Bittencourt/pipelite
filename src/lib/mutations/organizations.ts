import { db } from "@/db"
import { organizations } from "@/db/schema"
import { eq, and, isNull } from "drizzle-orm"
import { z } from "zod"
import { crmBus } from "@/lib/events"
import type { CrmEventPayload } from "@/lib/events"

// ---- Zod Schemas ----

export const organizationSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  website: z.string().url("Invalid website URL").optional().or(z.literal("")),
  industry: z.string().max(50, "Industry must be 50 characters or less").optional(),
  notes: z.string().max(2000, "Notes must be 2000 characters or less").optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
})

export const updateOrganizationSchema = organizationSchema.partial()

// ---- Mutation Input Types ----

interface CreateOrganizationInput {
  name: string
  website?: string
  industry?: string
  notes?: string
  customFields?: Record<string, unknown>
  userId: string
}

// ---- Helpers ----

function buildEventPayload(
  entityId: string,
  action: "created" | "updated" | "deleted",
  data: Record<string, unknown>,
  userId: string,
  changedFields: string[] | null = null
): CrmEventPayload {
  return {
    entity: "organization",
    entityId,
    action,
    data,
    changedFields,
    userId,
    timestamp: new Date().toISOString(),
  }
}

// ---- Mutations ----

export async function createOrganizationMutation(
  input: CreateOrganizationInput
): Promise<{ success: true; id: string; organization: typeof organizations.$inferSelect } | { success: false; error: string }> {
  // Validate input via Zod
  const validated = organizationSchema.safeParse({
    name: input.name,
    website: input.website,
    industry: input.industry,
    notes: input.notes,
    customFields: input.customFields,
  })

  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message || "Invalid input" }
  }

  try {
    const [organization] = await db.insert(organizations).values({
      name: validated.data.name,
      website: validated.data.website || null,
      industry: validated.data.industry || null,
      notes: validated.data.notes || null,
      ownerId: input.userId,
    }).returning()

    // Emit CRM event
    crmBus.emit("organization.created", buildEventPayload(
      organization.id,
      "created",
      organization as unknown as Record<string, unknown>,
      input.userId,
    ))

    return { success: true, id: organization.id, organization }
  } catch (error) {
    console.error("Failed to create organization:", error)
    return { success: false, error: "Failed to create organization" }
  }
}

export async function updateOrganizationMutation(
  id: string,
  data: z.infer<typeof updateOrganizationSchema>,
  userId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  // Validate input
  const validated = updateOrganizationSchema.safeParse(data)
  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message || "Invalid input" }
  }

  // Check if organization exists
  const organization = await db.query.organizations.findFirst({
    where: and(eq(organizations.id, id), isNull(organizations.deletedAt)),
  })

  if (!organization) {
    return { success: false, error: "Organization not found" }
  }

  try {
    // Build update data and track changed fields
    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    const changedFields: string[] = []

    if (validated.data.name !== undefined) {
      updateData.name = validated.data.name
      if (validated.data.name !== organization.name) changedFields.push("name")
    }
    if (validated.data.website !== undefined) {
      const newWebsite = validated.data.website || null
      updateData.website = newWebsite
      if (newWebsite !== organization.website) changedFields.push("website")
    }
    if (validated.data.industry !== undefined) {
      const newIndustry = validated.data.industry || null
      updateData.industry = newIndustry
      if (newIndustry !== organization.industry) changedFields.push("industry")
    }
    if (validated.data.notes !== undefined) {
      const newNotes = validated.data.notes || null
      updateData.notes = newNotes
      if (newNotes !== organization.notes) changedFields.push("notes")
    }

    const [updatedOrg] = await db
      .update(organizations)
      .set(updateData)
      .where(eq(organizations.id, id))
      .returning()

    // Emit CRM event
    crmBus.emit("organization.updated", buildEventPayload(
      id,
      "updated",
      updatedOrg as unknown as Record<string, unknown>,
      userId,
      changedFields.length > 0 ? changedFields : null,
    ))

    return { success: true }
  } catch (error) {
    console.error("Failed to update organization:", error)
    return { success: false, error: "Failed to update organization" }
  }
}

export async function deleteOrganizationMutation(
  id: string,
  userId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  // Check if organization exists
  const organization = await db.query.organizations.findFirst({
    where: and(eq(organizations.id, id), isNull(organizations.deletedAt)),
  })

  if (!organization) {
    return { success: false, error: "Organization not found" }
  }

  try {
    await db
      .update(organizations)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(organizations.id, id))

    // Emit CRM event
    crmBus.emit("organization.deleted", buildEventPayload(
      id,
      "deleted",
      { id },
      userId,
    ))

    return { success: true }
  } catch (error) {
    console.error("Failed to delete organization:", error)
    return { success: false, error: "Failed to delete organization" }
  }
}
