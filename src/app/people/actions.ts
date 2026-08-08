"use server"

import { auth } from "@/auth"
import { db } from "@/db"
import { people } from "@/db/schema"
import { and, eq, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import {
  createPersonMutation,
  updatePersonMutation,
  deletePersonMutation,
  personSchema,
  updatePersonSchema,
} from "@/lib/mutations/people"

/**
 * Create a new person (contact)
 */
export async function createPerson(
  data: z.infer<typeof personSchema>
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  const result = await createPersonMutation({
    ...data,
    userId: session.user.id,
  })

  if (!result.success) {
    return result
  }

  revalidatePath("/people")
  const organizationId = data.organizationId || null
  if (organizationId) {
    revalidatePath(`/organizations/${organizationId}`)
  }

  return { success: true, id: result.id }
}

/**
 * Update an existing person
 */
export async function updatePerson(
  id: string,
  data: z.infer<typeof updatePersonSchema>
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // Auth check: verify ownership
  const person = await db.query.people.findFirst({
    where: and(eq(people.id, id), isNull(people.deletedAt)),
  })

  if (!person) {
    return { success: false, error: "Person not found" }
  }

  if (person.ownerId !== session.user.id) {
    return { success: false, error: "Not authorized" }
  }

  const result = await updatePersonMutation(id, data, session.user.id)

  if (result.success) {
    revalidatePath("/people")
    revalidatePath(`/people/${id}`)

    // Revalidate old org path if person was linked to one
    if (person.organizationId) {
      revalidatePath(`/organizations/${person.organizationId}`)
    }
    // Revalidate new org path if changed
    const newOrgId = data.organizationId !== undefined
      ? (data.organizationId || null)
      : undefined
    if (newOrgId && newOrgId !== person.organizationId) {
      revalidatePath(`/organizations/${newOrgId}`)
    }
  }

  return result
}

/**
 * Delete a person (soft delete)
 */
export async function deletePerson(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // Auth check: verify ownership
  const person = await db.query.people.findFirst({
    where: and(eq(people.id, id), isNull(people.deletedAt)),
  })

  if (!person) {
    return { success: false, error: "Person not found" }
  }

  if (person.ownerId !== session.user.id) {
    return { success: false, error: "Not authorized" }
  }

  const result = await deletePersonMutation(id, session.user.id)

  if (result.success) {
    revalidatePath("/people")
    if (person.organizationId) {
      revalidatePath(`/organizations/${person.organizationId}`)
    }
  }

  return result
}
