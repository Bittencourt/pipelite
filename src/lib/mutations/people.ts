import { db } from "@/db"
import { people, organizations } from "@/db/schema"
import { eq, and, isNull } from "drizzle-orm"
import { z } from "zod"
import { crmBus } from "@/lib/events"
import type { CrmEventPayload } from "@/lib/events"

// ---- Zod Schemas ----

export const personSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(50, "First name must be 50 characters or less"),
  lastName: z.string().min(1, "Last name is required").max(50, "Last name must be 50 characters or less"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  phone: z.string().max(30, "Phone must be 30 characters or less").optional().or(z.literal("")),
  notes: z.string().max(2000, "Notes must be 2000 characters or less").optional().or(z.literal("")),
  organizationId: z.string().optional().or(z.literal("")),
  customFields: z.record(z.string(), z.unknown()).optional(),
})

export const updatePersonSchema = personSchema.partial()

// ---- Mutation Input Types ----

interface CreatePersonInput {
  firstName: string
  lastName: string
  email?: string
  phone?: string
  notes?: string
  organizationId?: string
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
    entity: "person",
    entityId,
    action,
    data,
    changedFields,
    userId,
    timestamp: new Date().toISOString(),
  }
}

// ---- Mutations ----

export async function createPersonMutation(
  input: CreatePersonInput
): Promise<{ success: true; id: string; person: typeof people.$inferSelect } | { success: false; error: string }> {
  // Validate input via Zod
  const validated = personSchema.safeParse({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    notes: input.notes,
    organizationId: input.organizationId,
    customFields: input.customFields,
  })

  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message || "Invalid input" }
  }

  // Validate organization exists if provided
  const organizationId = validated.data.organizationId || null
  if (organizationId) {
    const org = await db.query.organizations.findFirst({
      where: and(
        eq(organizations.id, organizationId),
        isNull(organizations.deletedAt)
      ),
    })
    if (!org) {
      return { success: false, error: "Organization not found" }
    }
  }

  try {
    const [person] = await db.insert(people).values({
      firstName: validated.data.firstName,
      lastName: validated.data.lastName,
      email: validated.data.email || null,
      phone: validated.data.phone || null,
      notes: validated.data.notes || null,
      organizationId,
      ownerId: input.userId,
    }).returning()

    // Emit CRM event
    crmBus.emit("person.created", buildEventPayload(
      person.id,
      "created",
      person as unknown as Record<string, unknown>,
      input.userId,
    ))

    return { success: true, id: person.id, person }
  } catch (error) {
    console.error("Failed to create person:", error)
    return { success: false, error: "Failed to create person" }
  }
}

export async function updatePersonMutation(
  id: string,
  data: z.infer<typeof updatePersonSchema>,
  userId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  // Validate input
  const validated = updatePersonSchema.safeParse(data)
  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message || "Invalid input" }
  }

  // Check if person exists
  const person = await db.query.people.findFirst({
    where: and(eq(people.id, id), isNull(people.deletedAt)),
  })

  if (!person) {
    return { success: false, error: "Person not found" }
  }

  // Validate organization exists if provided
  const organizationId = validated.data.organizationId !== undefined
    ? (validated.data.organizationId || null)
    : undefined
  if (organizationId) {
    const org = await db.query.organizations.findFirst({
      where: and(
        eq(organizations.id, organizationId),
        isNull(organizations.deletedAt)
      ),
    })
    if (!org) {
      return { success: false, error: "Organization not found" }
    }
  }

  try {
    // Build update data and track changed fields
    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    const changedFields: string[] = []

    if (validated.data.firstName !== undefined) {
      updateData.firstName = validated.data.firstName
      if (validated.data.firstName !== person.firstName) changedFields.push("firstName")
    }
    if (validated.data.lastName !== undefined) {
      updateData.lastName = validated.data.lastName
      if (validated.data.lastName !== person.lastName) changedFields.push("lastName")
    }
    if (validated.data.email !== undefined) {
      const newEmail = validated.data.email || null
      updateData.email = newEmail
      if (newEmail !== person.email) changedFields.push("email")
    }
    if (validated.data.phone !== undefined) {
      const newPhone = validated.data.phone || null
      updateData.phone = newPhone
      if (newPhone !== person.phone) changedFields.push("phone")
    }
    if (validated.data.notes !== undefined) {
      const newNotes = validated.data.notes || null
      updateData.notes = newNotes
      if (newNotes !== person.notes) changedFields.push("notes")
    }
    if (organizationId !== undefined) {
      updateData.organizationId = organizationId
      if (organizationId !== person.organizationId) changedFields.push("organizationId")
    }

    const [updatedPerson] = await db
      .update(people)
      .set(updateData)
      .where(eq(people.id, id))
      .returning()

    // Emit CRM event
    crmBus.emit("person.updated", buildEventPayload(
      id,
      "updated",
      updatedPerson as unknown as Record<string, unknown>,
      userId,
      changedFields.length > 0 ? changedFields : null,
    ))

    return { success: true }
  } catch (error) {
    console.error("Failed to update person:", error)
    return { success: false, error: "Failed to update person" }
  }
}

export async function deletePersonMutation(
  id: string,
  userId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  // Check if person exists
  const person = await db.query.people.findFirst({
    where: and(eq(people.id, id), isNull(people.deletedAt)),
  })

  if (!person) {
    return { success: false, error: "Person not found" }
  }

  try {
    await db
      .update(people)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(people.id, id))

    // Emit CRM event
    crmBus.emit("person.deleted", buildEventPayload(
      id,
      "deleted",
      { id },
      userId,
    ))

    return { success: true }
  } catch (error) {
    console.error("Failed to delete person:", error)
    return { success: false, error: "Failed to delete person" }
  }
}
