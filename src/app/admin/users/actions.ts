"use server"

import { auth } from "@/auth"
import { db } from "@/db"
import { users, rejectedSignups } from "@/db/schema"
import { eq, and, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { sendApprovalEmail } from "@/lib/email/send"

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
