"use server"

import { auth } from "@/auth"
import { db } from "@/db"
import { people, organizations } from "@/db/schema"
import { eq, and, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"

// Validation schema for person data
const personSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(50, "First name must be 50 characters or less"),
  lastName: z.string().min(1, "Last name is required").max(50, "Last name must be 50 characters or less"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  phone: z.string().max(30, "Phone must be 30 characters or less").optional().or(z.literal("")),
  notes: z.string().max(2000, "Notes must be 2000 characters or less").optional().or(z.literal("")),
  organizationId: z.string().optional().or(z.literal("")),
  customFields: z.record(z.string(), z.unknown()).optional(),
})

const updatePersonSchema = personSchema.partial()

/**
 * Create a new person (contact)
 * - Validates user is authenticated
 * - Validates input with personSchema
 * - Validates organization exists if provided
 * - Creates person with current user as owner
 * - Returns success with person ID or error
 */
export async function createPerson(
  data: z.infer<typeof personSchema>
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // Validate input
  const validated = personSchema.safeParse(data)
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
      ownerId: session.user.id,
    }).returning()

    revalidatePath("/people")
    if (organizationId) {
      revalidatePath(`/organizations/${organizationId}`)
    }

    return { success: true, id: person.id }
  } catch (error) {
    console.error("Failed to create person:", error)
    return { success: false, error: "Failed to create person" }
  }
}

/**
 * Update an existing person
 * - Validates user is authenticated
 * - Verifies user owns the person
 * - Validates organization exists if provided
 * - Updates person with validated data
 * - Returns success or error
 */
export async function updatePerson(
  id: string,
  data: z.infer<typeof updatePersonSchema>
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // Validate input
  const validated = updatePersonSchema.safeParse(data)
  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message || "Invalid input" }
  }

  // Check if person exists and user owns it
  const person = await db.query.people.findFirst({
    where: and(
      eq(people.id, id),
      isNull(people.deletedAt)
    ),
  })

  if (!person) {
    return { success: false, error: "Person not found" }
  }

  if (person.ownerId !== session.user.id) {
    return { success: false, error: "Not authorized" }
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
    // Build update data, converting empty strings to null for optional fields
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (validated.data.firstName !== undefined) {
      updateData.firstName = validated.data.firstName
    }
    if (validated.data.lastName !== undefined) {
      updateData.lastName = validated.data.lastName
    }
    if (validated.data.email !== undefined) {
      updateData.email = validated.data.email || null
    }
    if (validated.data.phone !== undefined) {
      updateData.phone = validated.data.phone || null
    }
    if (validated.data.notes !== undefined) {
      updateData.notes = validated.data.notes || null
    }
    if (organizationId !== undefined) {
      updateData.organizationId = organizationId
    }

    await db
      .update(people)
      .set(updateData)
      .where(eq(people.id, id))

    revalidatePath("/people")
    revalidatePath(`/people/${id}`)

    // Revalidate old org path if person was linked to one
    if (person.organizationId) {
      revalidatePath(`/organizations/${person.organizationId}`)
    }
    // Revalidate new org path if changed
    if (organizationId && organizationId !== person.organizationId) {
      revalidatePath(`/organizations/${organizationId}`)
    }

    return { success: true }
  } catch (error) {
    console.error("Failed to update person:", error)
    return { success: false, error: "Failed to update person" }
  }
}

/**
 * Delete a person (soft delete)
 * - Validates user is authenticated
 * - Verifies user owns the person
 * - Sets deletedAt timestamp (soft delete)
 * - Returns success or error
 */
export async function deletePerson(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // Check if person exists and user owns it
  const person = await db.query.people.findFirst({
    where: and(
      eq(people.id, id),
      isNull(people.deletedAt)
    ),
  })

  if (!person) {
    return { success: false, error: "Person not found" }
  }

  if (person.ownerId !== session.user.id) {
    return { success: false, error: "Not authorized" }
  }

  try {
    // Soft delete - set deletedAt timestamp
    await db
      .update(people)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(people.id, id))

    revalidatePath("/people")
    if (person.organizationId) {
      revalidatePath(`/organizations/${person.organizationId}`)
    }

    return { success: true }
  } catch (error) {
    console.error("Failed to delete person:", error)
    return { success: false, error: "Failed to delete person" }
  }
}
