import { auth } from "@/auth"
import { db } from "@/db"
import { users, activities } from "@/db/schema"
import { isNull, and, gte, isNotNull } from "drizzle-orm"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { TeamPageClient } from "./team-page-client"

export default async function TeamPage() {
  const session = await auth()
  if (!session?.user?.id) {
    redirect("/login")
  }

  const t = await getTranslations("team")

  // Fetch all active (non-deleted) users
  const allUsers = await db.query.users.findMany({
    where: isNull(users.deletedAt),
    columns: { id: true, name: true, email: true },
    orderBy: [users.name],
  })

  // For each user, fetch assigned deals (not deleted) and upcoming activities (not completed, dueDate >= now)
  const now = new Date()

  const [assignedDeals, upcomingActivities] = await Promise.all([
    db.query.dealAssignees.findMany({
      with: {
        deal: {
          with: {
            stage: { columns: { id: true, name: true } },
          },
          columns: { id: true, title: true, value: true, stageId: true, deletedAt: true },
        },
      },
    }),
    db.query.activities.findMany({
      where: and(
        isNull(activities.deletedAt),
        isNotNull(activities.assigneeId),
        gte(activities.dueDate, now)
      ),
      columns: { id: true, title: true, dueDate: true, assigneeId: true },
      with: {
        type: { columns: { id: true, name: true, icon: true } },
      },
    }),
  ])

  // Build per-user data map
  const userDataMap = allUsers.map((user) => ({
    ...user,
    assignedDeals: assignedDeals
      .filter((da) => da.userId === user.id && da.deal !== null && da.deal.deletedAt === null)
      .map((da) => da.deal!),
    upcomingActivities: upcomingActivities
      .filter((a) => a.assigneeId === user.id),
  }))

  return (
    <div className="container py-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t("team")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("teamView")}</p>
      </div>
      <TeamPageClient users={userDataMap} />
    </div>
  )
}
