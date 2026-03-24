"use server"

import { auth } from "@/auth"
import { db } from "@/db"
import { users, rejectedSignups, userInvites } from "@/db/schema"
import { eq, and, isNull, isNotNull, gt } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { sendApprovalEmail, sendInviteEmail } from "@/lib/email/send"
import { z } from "zod"

const updateUserSchema = z.object({
  role: z.enum(["admin", "member"]).optional(),
  status: z.enum(["pending_verification", "pending_approval", "approved", "rejected"]).optional(),
})

/**
 * Approve a pending user
 * - Updates status to approved
 * - Sends approval email notification
 * - Revalidates the admin users page
 */
export async function approveUser(userId: string): Promise<void> {
  const session = await auth()

  // Verify admin role
  if (!session?.user || session.user.role !== "admin") {
    throw new Error("Unauthorized: Admin access required")
  }

  // Get the user
  const user = await db.query.users.findFirst({
    where: and(
      eq(users.id, userId),
      eq(users.status, "pending_approval"),
      isNull(users.deletedAt)
    ),
  })

  if (!user) {
    throw new Error("User not found or already processed")
  }

  // Update user status
  await db
    .update(users)
    .set({
      status: "approved",
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))

  // Send approval email (async, don't await to avoid blocking)
  sendApprovalEmail(user.email).catch((error) => {
    console.error("Failed to send approval email:", error)
  })

  // Revalidate the page to show updated data
  revalidatePath("/admin/users")
  revalidatePath("/admin")
}

/**
 * Reject a pending user
 * - Logs rejection to rejected_signups table
 * - Soft deletes the user record
 * - Revalidates the admin users page
 */
export async function rejectUser(
  userId: string,
  reason?: string
): Promise<void> {
  const session = await auth()

  // Verify admin role
  if (!session?.user || session.user.role !== "admin") {
    throw new Error("Unauthorized: Admin access required")
  }

  // Get the user
  const user = await db.query.users.findFirst({
    where: and(
      eq(users.id, userId),
      eq(users.status, "pending_approval"),
      isNull(users.deletedAt)
    ),
  })

  if (!user) {
    throw new Error("User not found or already processed")
  }

  // Log the rejection for audit purposes
  await db.insert(rejectedSignups).values({
    email: user.email,
    rejectedBy: session.user.id,
    rejectedAt: new Date(),
    reason: reason || null,
  })

  // Soft delete the user (don't hard delete - keep for records)
  await db
    .update(users)
    .set({
      status: "rejected",
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))

  // Revalidate the page to show updated data
  revalidatePath("/admin/users")
  revalidatePath("/admin")
}

/**
 * Update a user's role and/or status
 * - Validates input with Zod
 * - Prevents admin from changing their own role
 * - Revalidates the admin users page
 */
export async function updateUser(
  userId: string,
  data: z.infer<typeof updateUserSchema>
): Promise<{ success: boolean; error?: string }> {
  const session = await auth()

  if (!session?.user || session.user.role !== "admin") {
    return { success: false, error: "Unauthorized: Admin access required" }
  }

  const parsed = updateUserSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  // Prevent admin from changing their own role
  if (parsed.data.role && session.user.id === userId) {
    return { success: false, error: "Cannot change your own role" }
  }

  await db
    .update(users)
    .set({
      ...parsed.data,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))

  revalidatePath("/admin/users")
  return { success: true }
}

/**
 * Deactivate a user (soft delete)
 * - Sets deletedAt timestamp
 * - Prevents self-deactivation
 * - Only operates on active users (deletedAt IS NULL)
 */
export async function deactivateUser(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await auth()

  if (!session?.user || session.user.role !== "admin") {
    return { success: false, error: "Unauthorized: Admin access required" }
  }

  if (session.user.id === userId) {
    return { success: false, error: "Cannot deactivate yourself" }
  }

  const user = await db.query.users.findFirst({
    where: and(eq(users.id, userId), isNull(users.deletedAt)),
  })

  if (!user) {
    return { success: false, error: "User not found or already deactivated" }
  }

  await db
    .update(users)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))

  revalidatePath("/admin/users")
  return { success: true }
}

/**
 * Reactivate a previously deactivated user
 * - Clears deletedAt timestamp
 * - Only operates on deactivated users (deletedAt IS NOT NULL)
 */
export async function reactivateUser(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await auth()

  if (!session?.user || session.user.role !== "admin") {
    return { success: false, error: "Unauthorized: Admin access required" }
  }

  const user = await db.query.users.findFirst({
    where: and(eq(users.id, userId), isNotNull(users.deletedAt)),
  })

  if (!user) {
    return { success: false, error: "User not found or not deactivated" }
  }

  await db
    .update(users)
    .set({
      deletedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))

  revalidatePath("/admin/users")
  return { success: true }
}

const inviteEmailSchema = z.object({
  email: z.string().email("Invalid email address"),
})

/**
 * Invite a user by email
 * - Validates email format
 * - Checks no active user exists with that email
 * - Checks no pending (non-expired, non-accepted) invite exists
 * - Creates invite record with 7-day expiry
 * - Fire-and-forget sends invite email
 */
export async function inviteUser(
  email: string
): Promise<{ success: boolean; error?: string }> {
  const session = await auth()

  if (!session?.user || session.user.role !== "admin") {
    return { success: false, error: "Unauthorized: Admin access required" }
  }

  const parsed = inviteEmailSchema.safeParse({ email })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const normalizedEmail = parsed.data.email.toLowerCase().trim()

  // Check if email already has an active user
  const existingUser = await db.query.users.findFirst({
    where: and(
      eq(users.email, normalizedEmail),
      isNull(users.deletedAt)
    ),
  })

  if (existingUser) {
    return { success: false, error: "A user with this email already exists" }
  }

  // Check if a pending invite already exists (not expired, not accepted)
  const existingInvite = await db.query.userInvites.findFirst({
    where: and(
      eq(userInvites.email, normalizedEmail),
      isNull(userInvites.acceptedAt),
      gt(userInvites.expiresAt, new Date())
    ),
  })

  if (existingInvite) {
    return { success: false, error: "A pending invite already exists for this email" }
  }

  // Generate token and set expiry (7 days)
  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  // Insert invite record
  await db.insert(userInvites).values({
    email: normalizedEmail,
    token,
    invitedBy: session.user.id,
    expiresAt,
  })

  // Fire-and-forget email send
  sendInviteEmail(normalizedEmail, token, session.user.name || "Admin").catch(
    (error) => {
      console.error("Failed to send invite email:", error)
    }
  )

  revalidatePath("/admin/users")
  return { success: true }
}
