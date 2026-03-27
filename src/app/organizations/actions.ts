"use server"

import { auth } from "@/auth"
import { db } from "@/db"
import { organizations } from "@/db/schema"
import { eq, and, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import {
  createOrganizationMutation,
  updateOrganizationMutation,
  deleteOrganizationMutation,
  organizationSchema,
  updateOrganizationSchema,
} from "@/lib/mutations/organizations"

/**
 * Create a new organization
 * - Validates user is authenticated
 * - Delegates to mutation layer for validation, insert, and event emission
 * - Returns success with organization ID or error
 */
export async function createOrganization(
  data: z.infer<typeof organizationSchema>
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  const result = await createOrganizationMutation({
    ...data,
    userId: session.user.id,
  })

  if (!result.success) {
    return result
  }

  revalidatePath("/organizations")

  return { success: true, id: result.id }
}

/**
 * Update an existing organization
 * - Validates user is authenticated
 * - Verifies user owns the organization
 * - Delegates to mutation layer for update and event emission
 * - Returns success or error
 */
export async function updateOrganization(
  id: string,
  data: z.infer<typeof updateOrganizationSchema>
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // Check ownership
  const organization = await db.query.organizations.findFirst({
    where: and(
      eq(organizations.id, id),
      isNull(organizations.deletedAt)
    ),
  })

  if (!organization) {
    return { success: false, error: "Organization not found" }
  }

  if (organization.ownerId !== session.user.id) {
    return { success: false, error: "Not authorized" }
  }

  const result = await updateOrganizationMutation(id, data, session.user.id)

  if (!result.success) {
    return result
  }

  revalidatePath("/organizations")
  revalidatePath(`/organizations/${id}`)

  return { success: true }
}

/**
 * Delete an organization (soft delete)
 * - Validates user is authenticated
 * - Verifies user owns the organization
 * - Delegates to mutation layer for delete and event emission
 * - Returns success or error
 */
export async function deleteOrganization(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // Check ownership
  const organization = await db.query.organizations.findFirst({
    where: and(
      eq(organizations.id, id),
      isNull(organizations.deletedAt)
    ),
  })

  if (!organization) {
    return { success: false, error: "Organization not found" }
  }

  if (organization.ownerId !== session.user.id) {
    return { success: false, error: "Not authorized" }
  }

  const result = await deleteOrganizationMutation(id, session.user.id)

  if (!result.success) {
    return result
  }

  revalidatePath("/organizations")

  return { success: true }
}
