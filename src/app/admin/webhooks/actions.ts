"use server"

import { auth } from "@/auth"
import { db } from "@/db"
import { webhooks, webhookDeliveries } from "@/db/schema"
import { eq, desc } from "drizzle-orm"
import { users } from "@/db/schema"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import crypto from "crypto"

const createWebhookSchema = z.object({
  url: z.string().url("Invalid URL"),
  events: z.array(z.string()).min(1, "At least one event is required"),
  active: z.boolean().default(true),
  userId: z.string().min(1, "Owner is required"),
})

const updateWebhookSchema = z.object({
  url: z.string().url("Invalid URL").optional(),
  events: z.array(z.string()).min(1).optional(),
  active: z.boolean().optional(),
})

export async function createWebhook(data: z.infer<typeof createWebhookSchema>) {
  const session = await auth()
  if (!session?.user || session.user.role !== "admin") {
    return { success: false, error: "Unauthorized: Admin access required" }
  }

  const parsed = createWebhookSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const secret = crypto.randomBytes(32).toString("hex")

  const [webhook] = await db
    .insert(webhooks)
    .values({
      url: parsed.data.url,
      events: parsed.data.events,
      active: parsed.data.active,
      userId: parsed.data.userId,
      secret,
    })
    .returning({ id: webhooks.id })

  revalidatePath("/admin/webhooks")
  return { success: true, id: webhook.id, secret }
}

export async function updateWebhook(id: string, data: z.infer<typeof updateWebhookSchema>) {
  const session = await auth()
  if (!session?.user || session.user.role !== "admin") {
    return { success: false, error: "Unauthorized: Admin access required" }
  }

  const parsed = updateWebhookSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  await db
    .update(webhooks)
    .set({
      ...parsed.data,
      updatedAt: new Date(),
    })
    .where(eq(webhooks.id, id))

  revalidatePath("/admin/webhooks")
  return { success: true, id }
}

export async function deleteWebhook(id: string) {
  const session = await auth()
  if (!session?.user || session.user.role !== "admin") {
    return { success: false, error: "Unauthorized: Admin access required" }
  }

  // Delete deliveries first (no cascade FK assumed)
  await db.delete(webhookDeliveries).where(eq(webhookDeliveries.webhookId, id))
  await db.delete(webhooks).where(eq(webhooks.id, id))

  revalidatePath("/admin/webhooks")
  return { success: true, id }
}

export async function replayDelivery(deliveryId: string) {
  const session = await auth()
  if (!session?.user || session.user.role !== "admin") {
    return { success: false, error: "Unauthorized: Admin access required" }
  }

  await db
    .update(webhookDeliveries)
    .set({
      status: "pending",
      retryCount: 0,
      nextAttemptAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(webhookDeliveries.id, deliveryId))

  revalidatePath("/admin/webhooks")
  return { success: true, id: deliveryId }
}

export async function getWebhookWithDeliveries(webhookId: string) {
  const [webhook] = await db
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
    .where(eq(webhooks.id, webhookId))
    .limit(1)

  if (!webhook) {
    return null
  }

  const allDeliveries = await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookId, webhookId))
    .orderBy(desc(webhookDeliveries.createdAt))

  const dlqDeliveries = allDeliveries.filter(
    (d) => d.status === "failed" && d.retryCount >= 5
  )

  return {
    webhook: {
      ...webhook,
      events: webhook.events ?? [],
      ownerEmail: webhook.ownerEmail ?? "Unknown",
    },
    allDeliveries,
    dlqDeliveries,
    dlqCount: dlqDeliveries.length,
  }
}
