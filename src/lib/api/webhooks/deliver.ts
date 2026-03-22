import { db } from "@/db"
import { webhooks } from "@/db/schema/webhooks"
import { webhookDeliveries } from "@/db/schema/webhook-deliveries"
import { eq, and } from "drizzle-orm"

export interface WebhookPayload {
  event: string
  entity: string
  entityId: string
  action: "created" | "updated" | "deleted"
  data: unknown
  timestamp: string
}

/**
 * Trigger webhook delivery to all active subscriptions for a user
 *
 * Fire-and-forget pattern - does not block the calling request.
 * Inserts pending rows into webhook_deliveries for each matching subscription.
 * The cron processor picks them up and delivers with retry logic.
 */
export function triggerWebhook(
  userId: string,
  event: string,
  entity: string,
  entityId: string,
  action: "created" | "updated" | "deleted",
  data: unknown
): void {
  // Fire-and-forget - don't await
  enqueueDeliveries(userId, {
    event,
    entity,
    entityId,
    action,
    data,
    timestamp: new Date().toISOString(),
  }).catch((error) => {
    console.error("Webhook enqueue failed:", error)
  })
}

async function enqueueDeliveries(
  userId: string,
  payload: WebhookPayload
): Promise<void> {
  // Query active webhooks for this user
  const subscriptions = await db.query.webhooks.findMany({
    where: and(eq(webhooks.userId, userId), eq(webhooks.active, true)),
  })

  // Filter to webhooks that subscribe to this event
  const matchingSubscriptions = subscriptions.filter(
    (sub) => sub.events && sub.events.includes(payload.event)
  )

  if (matchingSubscriptions.length === 0) return

  // Insert one delivery row per matching subscription
  await db.insert(webhookDeliveries).values(
    matchingSubscriptions.map((sub) => ({
      webhookId: sub.id,
      status: "pending" as const,
      payload: payload as unknown as Record<string, unknown>,
      retryCount: 0,
      nextAttemptAt: new Date(),
    }))
  )
}
