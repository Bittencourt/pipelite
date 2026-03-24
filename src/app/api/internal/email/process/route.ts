import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { activities, users, notificationPreferences, digestLog, deals, stages } from "@/db/schema"
import { eq, and, isNull, gte, lt, lte, or, sql } from "drizzle-orm"
import { sendActivityReminderEmail, sendWeeklyDigestEmail } from "@/lib/email/send"
import { isMondayMorning, getWeekBoundaries } from "@/lib/email-processor"
import type { WeeklyDigestData } from "@/lib/email/templates"

export async function POST(request: NextRequest) {
  // Verify internal secret
  const secret = request.headers.get("X-Internal-Secret")
  if (!secret || secret !== process.env.INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const reminders = await processActivityReminders()
    const digests = await processWeeklyDigest()

    return NextResponse.json({ reminders, digests })
  } catch (error) {
    console.error("[email-process] Error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

async function processActivityReminders(): Promise<number> {
  const now = new Date()
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000)

  // Query activities due within 1 hour that haven't been reminded yet
  const dueActivities = await db
    .select({
      id: activities.id,
      title: activities.title,
      dueDate: activities.dueDate,
      assigneeId: activities.assigneeId,
      ownerId: activities.ownerId,
    })
    .from(activities)
    .where(
      and(
        isNull(activities.completedAt),
        isNull(activities.deletedAt),
        isNull(activities.reminderSentAt),
        gte(activities.dueDate, now),
        lte(activities.dueDate, oneHourFromNow)
      )
    )

  let sentCount = 0

  for (const activity of dueActivities) {
    // Use assignee if available, otherwise owner
    const targetUserId = activity.assigneeId || activity.ownerId

    // Look up user email and locale
    const [user] = await db
      .select({ email: users.email, locale: users.locale })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1)

    if (!user) continue

    // Check notification preferences (default true if no row)
    const [prefs] = await db
      .select({ emailActivityReminder: notificationPreferences.emailActivityReminder })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, targetUserId))
      .limit(1)

    if (prefs && !prefs.emailActivityReminder) continue

    // Mark as sent BEFORE sending (prevents duplicates even if send fails)
    await db
      .update(activities)
      .set({ reminderSentAt: new Date() })
      .where(eq(activities.id, activity.id))

    // Fire-and-forget email
    sendActivityReminderEmail(
      user.email,
      activity.title,
      activity.dueDate,
      user.locale
    ).catch((error) => {
      console.error("[email-process] Failed to send activity reminder:", error)
    })

    sentCount++
  }

  return sentCount
}

async function processWeeklyDigest(): Promise<number> {
  const now = new Date()

  // Only run on Monday morning (8-9 UTC)
  if (!isMondayMorning(now)) {
    return 0
  }

  // Compute this Monday at 00:00 UTC for dedup check
  const thisMonday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  ))

  // DB-backed deduplication: check if we already sent this week's digest
  const [existingDigest] = await db
    .select({ id: digestLog.id })
    .from(digestLog)
    .where(eq(digestLog.weekStart, thisMonday))
    .limit(1)

  if (existingDigest) {
    return 0
  }

  // Get week boundaries for data queries
  const { weekStart, weekEnd } = getWeekBoundaries(now)

  // Query aggregate deal data (once for all users)
  const [dealStats] = await db
    .select({
      newDeals: sql<number>`count(*) filter (where ${deals.createdAt} >= ${weekStart} and ${deals.createdAt} <= ${weekEnd})`,
      dealsWon: sql<number>`count(*) filter (where ${stages.type} = 'won' and ${deals.updatedAt} >= ${weekStart} and ${deals.updatedAt} <= ${weekEnd})`,
      dealsLost: sql<number>`count(*) filter (where ${stages.type} = 'lost' and ${deals.updatedAt} >= ${weekStart} and ${deals.updatedAt} <= ${weekEnd})`,
    })
    .from(deals)
    .leftJoin(stages, eq(deals.stageId, stages.id))
    .where(isNull(deals.deletedAt))

  // Count deals that changed stage this week (approximation: updated but not created this week)
  const [stageChanges] = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(deals)
    .where(
      and(
        isNull(deals.deletedAt),
        gte(deals.updatedAt, weekStart),
        lte(deals.updatedAt, weekEnd),
        lt(deals.createdAt, weekStart) // Exclude newly created deals
      )
    )

  const globalDealData = {
    newDeals: Number(dealStats?.newDeals ?? 0),
    dealsMovedStage: Number(stageChanges?.count ?? 0),
    dealsWon: Number(dealStats?.dealsWon ?? 0),
    dealsLost: Number(dealStats?.dealsLost ?? 0),
  }

  // Get all users with emailWeeklyDigest enabled (default true if no preference row)
  const optedInUsers = await db
    .select({
      id: users.id,
      email: users.email,
      locale: users.locale,
    })
    .from(users)
    .leftJoin(notificationPreferences, eq(users.id, notificationPreferences.userId))
    .where(
      and(
        isNull(users.deletedAt),
        or(
          isNull(notificationPreferences.emailWeeklyDigest),
          eq(notificationPreferences.emailWeeklyDigest, true)
        )
      )
    )

  let sentCount = 0

  for (const user of optedInUsers) {
    // Per-user activity data
    const [userActivities] = await db
      .select({
        overdue: sql<number>`count(*) filter (where ${activities.dueDate} < now() and ${activities.completedAt} is null and ${activities.deletedAt} is null)`,
        upcoming: sql<number>`count(*) filter (where ${activities.dueDate} >= now() and ${activities.dueDate} <= ${weekEnd} and ${activities.completedAt} is null and ${activities.deletedAt} is null)`,
      })
      .from(activities)
      .where(
        or(
          eq(activities.assigneeId, user.id),
          eq(activities.ownerId, user.id)
        )
      )

    const digestData: WeeklyDigestData = {
      ...globalDealData,
      overdueActivities: Number(userActivities?.overdue ?? 0),
      upcomingActivities: Number(userActivities?.upcoming ?? 0),
    }

    sendWeeklyDigestEmail(user.email, digestData, user.locale).catch((error) => {
      console.error("[email-process] Failed to send weekly digest:", error)
    })

    sentCount++
  }

  // Record digest sent in digest_log for deduplication
  if (sentCount > 0) {
    await db.insert(digestLog).values({
      sentAt: new Date(),
      userCount: sentCount,
      weekStart: thisMonday,
    })
  }

  return sentCount
}
