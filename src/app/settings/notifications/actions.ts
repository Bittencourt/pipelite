"use server"

import { auth } from "@/auth"
import { db } from "@/db"
import { notificationPreferences } from "@/db/schema"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { revalidatePath } from "next/cache"

const updatePreferencesSchema = z.object({
  emailDealAssigned: z.boolean(),
  emailActivityReminder: z.boolean(),
  emailWeeklyDigest: z.boolean(),
  emailWorkflowFailed: z.boolean(),
})

export type NotificationPreferencesData = z.infer<typeof updatePreferencesSchema>

const defaultPreferences: NotificationPreferencesData = {
  emailDealAssigned: true,
  emailActivityReminder: true,
  emailWeeklyDigest: true,
  // Opt-OUT, matching the column default and the failure-alert path, which treats an absent
  // notification_preferences row as "send". A false here would render the toggle off for a
  // user who is still receiving the mail.
  emailWorkflowFailed: true,
}

/**
 * Get current user's notification preferences.
 * Returns defaults (all true) if no row exists yet.
 */
export async function getNotificationPreferences(): Promise<NotificationPreferencesData> {
  const session = await auth()
  if (!session?.user?.id) {
    return defaultPreferences
  }

  const prefs = await db.query.notificationPreferences.findFirst({
    where: eq(notificationPreferences.userId, session.user.id),
  })

  if (!prefs) {
    return defaultPreferences
  }

  return {
    emailDealAssigned: prefs.emailDealAssigned,
    emailActivityReminder: prefs.emailActivityReminder,
    emailWeeklyDigest: prefs.emailWeeklyDigest,
    emailWorkflowFailed: prefs.emailWorkflowFailed,
  }
}

/**
 * Upsert notification preferences for current user.
 */
export async function updateNotificationPreferences(
  data: NotificationPreferencesData
): Promise<{ success: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" }
  }

  const parsed = updatePreferencesSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  await db
    .insert(notificationPreferences)
    .values({
      userId: session.user.id,
      emailDealAssigned: parsed.data.emailDealAssigned,
      emailActivityReminder: parsed.data.emailActivityReminder,
      emailWeeklyDigest: parsed.data.emailWeeklyDigest,
      emailWorkflowFailed: parsed.data.emailWorkflowFailed,
      updatedAt: new Date(),
    })
    // This set block repeats every field from .values above. A field present in one and absent
    // from the other TYPECHECKS and silently never persists on update — the first save appears to
    // work and every save after it discards the change. Add a preference in BOTH places or neither.
    .onConflictDoUpdate({
      target: notificationPreferences.userId,
      set: {
        emailDealAssigned: parsed.data.emailDealAssigned,
        emailActivityReminder: parsed.data.emailActivityReminder,
        emailWeeklyDigest: parsed.data.emailWeeklyDigest,
        emailWorkflowFailed: parsed.data.emailWorkflowFailed,
        updatedAt: new Date(),
      },
    })

  revalidatePath("/settings/notifications")
  return { success: true }
}
