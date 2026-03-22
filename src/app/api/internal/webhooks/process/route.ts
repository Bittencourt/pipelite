import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { webhookDeliveries } from "@/db/schema/webhook-deliveries"
import { webhooks } from "@/db/schema/webhooks"
import { eq, and, lte, sql, inArray } from "drizzle-orm"
import { signWebhook } from "@/lib/api/webhooks/sign"
import type { WebhookPayload } from "@/lib/api/webhooks/deliver"

const MAX_RETRIES = 5
const RETRY_DELAYS = [60_000, 300_000, 900_000, 3_600_000, 21_600_000]
const CLEANUP_DAYS = 30

async function processDelivery(
  delivery: {
    id: string
    payload: unknown
    retryCount: number
  },
  webhook: {
    url: string
    secret: string
  }
): Promise<void> {
  const payload = delivery.payload as WebhookPayload
  const body = JSON.stringify(payload)
  const signature = signWebhook(webhook.secret, body)

  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Event": payload.event,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    })

    const responseBody = await response.text().catch(() => "")
    const truncatedBody = responseBody.slice(0, 1024)

    if (response.ok) {
      // 2xx - success
      await db
        .update(webhookDeliveries)
        .set({
          status: "delivered",
          httpStatus: response.status,
          responseBody: truncatedBody,
          updatedAt: new Date(),
        })
        .where(eq(webhookDeliveries.id, delivery.id))
      return
    }

    if (response.status >= 400 && response.status < 500) {
      // 4xx - fail immediately, no retry
      await db
        .update(webhookDeliveries)
        .set({
          status: "failed",
          httpStatus: response.status,
          responseBody: truncatedBody,
          updatedAt: new Date(),
        })
        .where(eq(webhookDeliveries.id, delivery.id))
      return
    }

    // 5xx - retry with backoff
    await handleRetry(delivery, response.status, truncatedBody)
  } catch (error) {
    // Network error or timeout - retry with backoff
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error"
    await handleRetry(delivery, null, errorMessage)
  }
}

async function handleRetry(
  delivery: { id: string; retryCount: number },
  httpStatus: number | null,
  responseBody: string
): Promise<void> {
  const newRetryCount = delivery.retryCount + 1

  if (newRetryCount >= MAX_RETRIES) {
    // Exhausted all retries - mark as failed
    await db
      .update(webhookDeliveries)
      .set({
        status: "failed",
        httpStatus: httpStatus,
        responseBody: responseBody,
        retryCount: newRetryCount,
        updatedAt: new Date(),
      })
      .where(eq(webhookDeliveries.id, delivery.id))
    return
  }

  // Schedule next attempt with jitter
  const baseDelay = RETRY_DELAYS[newRetryCount - 1] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1]
  const jitteredDelay = baseDelay * (0.8 + Math.random() * 0.4)
  const nextAttemptAt = new Date(Date.now() + jitteredDelay)

  await db
    .update(webhookDeliveries)
    .set({
      httpStatus: httpStatus,
      responseBody: responseBody,
      retryCount: newRetryCount,
      nextAttemptAt,
      updatedAt: new Date(),
    })
    .where(eq(webhookDeliveries.id, delivery.id))
}

export async function POST(request: NextRequest) {
  // Validate internal secret
  const secret = request.headers.get("X-Internal-Secret")
  if (!process.env.INTERNAL_SECRET || secret !== process.env.INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Fetch pending deliveries ready for processing
  const pendingDeliveries = await db
    .select({
      id: webhookDeliveries.id,
      payload: webhookDeliveries.payload,
      retryCount: webhookDeliveries.retryCount,
      webhookUrl: webhooks.url,
      webhookSecret: webhooks.secret,
    })
    .from(webhookDeliveries)
    .innerJoin(webhooks, eq(webhookDeliveries.webhookId, webhooks.id))
    .where(
      and(
        eq(webhookDeliveries.status, "pending"),
        lte(webhookDeliveries.nextAttemptAt, new Date())
      )
    )
    .orderBy(webhookDeliveries.nextAttemptAt)
    .limit(10)

  // Process each delivery
  for (const row of pendingDeliveries) {
    await processDelivery(
      { id: row.id, payload: row.payload, retryCount: row.retryCount },
      { url: row.webhookUrl, secret: row.webhookSecret }
    )
  }

  // Auto-cleanup: remove delivered/failed records older than 30 days
  const cutoffDate = new Date(Date.now() - CLEANUP_DAYS * 24 * 60 * 60 * 1000)
  const cleanupResult = await db
    .delete(webhookDeliveries)
    .where(
      and(
        inArray(webhookDeliveries.status, ["delivered", "failed"]),
        lte(webhookDeliveries.createdAt, cutoffDate)
      )
    )
    .returning({ id: webhookDeliveries.id })

  return NextResponse.json({
    processed: pendingDeliveries.length,
    cleaned: cleanupResult.length,
  })
}
