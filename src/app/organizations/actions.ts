"use server"

import { auth } from "@/auth"
import { db } from "@/db"
import { organizations } from "@/db/schema"
import { eq, and, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"

// Validation schema for organization data
const organizationSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  website: z.string().url("Invalid website URL").optional().or(z.literal("")),
  industry: z.string().max(50, "Industry must be 50 characters or less").optional(),
  notes: z.string().max(2000, "Notes must be 2000 characters or less").optional(),
})

const updateOrganizationSchema = organizationSchema.partial()

/**
 * Create a new organization
 * - Validates user is authenticated
 * - Validates input with organizationSchema
 * - Creates organization with current user as owner
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

  // Validate input
  const validated = organizationSchema.safeParse(data)
  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message || "Invalid input" }
  }

  try {
    const [organization] = await db.insert(organizations).values({
      name: validated.data.name,
      website: validated.data.website || null,
      industry: validated.data.industry || null,
      notes: validated.data.notes || null,
      ownerId: session.user.id,
    }).returning()

    revalidatePath("/organizations")

    return { success: true, id: organization.id }
  } catch (error) {
    console.error("Failed to create organization:", error)
    return { success: false, error: "Failed to create organization" }
  }
}

/**
 * Update an existing organization
 * - Validates user is authenticated
 * - Verifies user owns the organization
 * - Updates organization with validated data
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

  // Validate input
  const validated = updateOrganizationSchema.safeParse(data)
  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message || "Invalid input" }
  }

  // Check if organization exists and user owns it
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

  try {
    await db
      .update(organizations)
      .set({
        ...validated.data,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, id))

    revalidatePath("/organizations")
    revalidatePath(`/organizations/${id}`)

    return { success: true }
  } catch (error) {
    console.error("Failed to update organization:", error)
    return { success: false, error: "Failed to update organization" }
  }
}

/**
 * Delete an organization (soft delete)
 * - Validates user is authenticated
 * - Verifies user owns the organization
 * - Sets deletedAt timestamp (soft delete)
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

  // Check if organization exists and user owns it
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

  try {
    // Soft delete - set deletedAt timestamp
    await db
      .update(organizations)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, id))

    revalidatePath("/organizations")

    return { success: true }
  } catch (error) {
    console.error("Failed to delete organization:", error)
    return { success: false, error: "Failed to delete organization" }
  }
}
