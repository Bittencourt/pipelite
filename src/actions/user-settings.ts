"use server"

import { cookies } from "next/headers"
import { db } from "@/db"
import { users } from "@/db/schema/users"
import { auth } from "@/auth"
import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { locales, type Locale } from "@/i18n/request"

/**
 * Update the current user's locale preference
 * - Updates the database record
 * - Sets the locale cookie for immediate effect
 * - Revalidates the layout to refresh translations
 */
export async function updateUserLocale(locale: Locale): Promise<{ success: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" }
  }

  // Validate locale is supported
  if (!locales.includes(locale)) {
    return { success: false, error: "Unsupported locale" }
  }

  try {
    // Update database
    await db
      .update(users)
      .set({ locale, updatedAt: new Date() })
      .where(eq(users.id, session.user.id))

    // Update cookie for immediate effect
    const cookieStore = await cookies()
    cookieStore.set("locale", locale, {
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: "/",
      sameSite: "lax"
    })

    revalidatePath("/", "layout")
    return { success: true }
  } catch (error) {
    console.error("Failed to update locale:", error)
    return { success: false, error: "Failed to update locale" }
  }
}

/**
 * Update the current user's timezone preference
 * - Updates the database record
 * - Sets the timezone cookie for immediate effect
 * - Revalidates the layout to refresh time displays
 */
export async function updateUserTimezone(timezone: string): Promise<{ success: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" }
  }

  try {
    // Update database
    await db
      .update(users)
      .set({ timezone, updatedAt: new Date() })
      .where(eq(users.id, session.user.id))

    // Update cookie for immediate effect
    const cookieStore = await cookies()
    cookieStore.set("timezone", timezone, {
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: "/",
      sameSite: "lax"
    })

    revalidatePath("/", "layout")
    return { success: true }
  } catch (error) {
    console.error("Failed to update timezone:", error)
    return { success: false, error: "Failed to update timezone" }
  }
}

/**
 * Get the current user's locale and timezone settings
 * Returns null if not authenticated
 */
export async function getCurrentUserSettings(): Promise<{ locale: string; timezone: string } | null> {
  const session = await auth()
  if (!session?.user?.id) {
    return null
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { locale: true, timezone: true }
  })

  return user ?? null
}
