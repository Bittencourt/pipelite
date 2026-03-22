import { db } from "@/db"
import { webhooks, users } from "@/db/schema"
import { eq, isNull, desc } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Radio } from "lucide-react"
import { WebhookRow } from "./columns"
import { WebhooksClient } from "./webhooks-client"

async function getAllWebhooks(): Promise<WebhookRow[]> {
  const rows = await db
    .select({
      id: webhooks.id,
      url: webhooks.url,
      events: webhooks.events,
      active: webhooks.active,
      createdAt: webhooks.createdAt,
      userId: webhooks.userId,
      ownerEmail: users.email,
    })
    .from(webhooks)
    .leftJoin(users, eq(webhooks.userId, users.id))
    .orderBy(desc(webhooks.createdAt))

  return rows.map((r) => ({
    ...r,
    events: r.events ?? [],
    ownerEmail: r.ownerEmail ?? "Unknown",
  }))
}

async function getAllUsers() {
  const allUsers = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(isNull(users.deletedAt))
    .orderBy(users.email)

  return allUsers
}

export default async function AdminWebhooksPage() {
  const [webhooksList, usersList, t] = await Promise.all([
    getAllWebhooks(),
    getAllUsers(),
    getTranslations("admin.webhooks"),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-muted-foreground" />
            <CardTitle>{t("allWebhooks")}</CardTitle>
          </div>
          <CardDescription>{t("allWebhooksDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <WebhooksClient webhooks={webhooksList} users={usersList} />
        </CardContent>
      </Card>
    </div>
  )
}
