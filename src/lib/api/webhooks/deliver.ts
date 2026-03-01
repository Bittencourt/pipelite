import { db } from "@/db"
import { webhooks } from "@/db/schema/webhooks"
import { eq, and } from "drizzle-orm"
import { signWebhook } from "./sign"

// Retry delays: 1min, 5min, 15min, 1hr, 6hr (in milliseconds)
const RETRY_DELAYS = [60000, 300000, 900000, 3600000, 21600000]

interface WebhookPayload {
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
 * Fire-and-forget pattern - does not block the calling request
 * Queries active webhooks matching the event and delivers with HMAC signature
 * Implements exponential backoff retry on failure
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
  deliverWebhooks(userId, {
    event,
    entity,
    entityId,
    action,
    data,
    timestamp: new Date().toISOString(),
  }).catch((error) => {
    console.error("Webhook delivery failed:", error)
  })
}

async function deliverWebhooks(
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

  // Deliver to each matching subscription
  await Promise.all(
    matchingSubscriptions.map((sub) => sendToEndpoint(sub, payload, 0))
  )
}

async function sendToEndpoint(
  subscription: { id: string; url: string; secret: string },
  payload: WebhookPayload,
  attempt: number
): Promise<void> {
  const body = JSON.stringify(payload)
  const signature = signWebhook(subscription.secret, body)

  try {
    const response = await fetch(subscription.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Event": payload.event,
      },
      body,
    })

    // Success - 2xx response
    if (response.ok) {
      return
    }

    // Non-2xx response - schedule retry if attempts remaining
    console.warn(
      `Webhook to ${subscription.url} returned ${response.status} (attempt ${attempt + 1})`
    )

    if (attempt < RETRY_DELAYS.length) {
      setTimeout(
        () => sendToEndpoint(subscription, payload, attempt + 1),
        RETRY_DELAYS[attempt]
      )
    } else {
      console.error(
        `Webhook to ${subscription.url} failed after ${RETRY_DELAYS.length} retries`
      )
    }
  } catch (error) {
    // Network or other error - schedule retry if attempts remaining
    console.error(
      `Webhook to ${subscription.url} error:`,
      error,
      `(attempt ${attempt + 1})`
    )

    if (attempt < RETRY_DELAYS.length) {
      setTimeout(
        () => sendToEndpoint(subscription, payload, attempt + 1),
        RETRY_DELAYS[attempt]
      )
    } else {
      console.error(
        `Webhook to ${subscription.url} failed after ${RETRY_DELAYS.length} retries`
      )
    }
  }
}
