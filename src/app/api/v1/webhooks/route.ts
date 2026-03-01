import { NextRequest } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { Problems } from "@/lib/api/errors"
import { parsePagination } from "@/lib/api/pagination"
import { paginatedResponse, createdResponse, singleResponse } from "@/lib/api/response"
import { db } from "@/db"
import { webhooks } from "@/db/schema/webhooks"
import { eq, and, isNull, desc, sql } from "drizzle-orm"
import { z } from "zod"
import crypto from "crypto"

const createWebhookSchema = z.object({
  url: z.string().url("Must be a valid URL").refine(
    (url) => url.startsWith("https://"),
    { message: "Webhook URL must use HTTPS" }
  ),
  events: z.array(z.string().min(1)).min(1, "At least one event is required"),
})

// Type for webhook without secret
type WebhookResponse = {
  id: string
  url: string
  events: string[]
  active: boolean
  created_at: string | null
  updated_at: string | null
}

// Type for webhook with secret (only for POST response)
type WebhookResponseWithSecret = WebhookResponse & {
  secret: string
}

/**
 * Serialize webhook to snake_case API format WITHOUT secret
 */
function serializeWebhook(webhook: typeof webhooks.$inferSelect): WebhookResponse {
  return {
    id: webhook.id,
    url: webhook.url,
    events: webhook.events || [],
    active: webhook.active,
    created_at: webhook.createdAt?.toISOString() || null,
    updated_at: webhook.updatedAt?.toISOString() || null,
  }
}

/**
 * Serialize webhook WITH secret (only for POST response)
 */
function serializeWebhookWithSecret(webhook: typeof webhooks.$inferSelect): WebhookResponseWithSecret {
  return {
    ...serializeWebhook(webhook),
    secret: webhook.secret,
  }
}

// GET /api/v1/webhooks - List webhook subscriptions
export async function GET(request: NextRequest) {
  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {
    const { offset, limit } = parsePagination(req)

    // Query webhooks owned by the user (without exposing secrets)
    const conditions = [eq(webhooks.userId, ctx.userId)]

    const [webhookList, countResult] = await Promise.all([
      db.query.webhooks.findMany({
        where: and(...conditions),
        orderBy: [desc(webhooks.createdAt)],
        offset,
        limit,
      }),
      db.select({ count: sql<number>`count(*)` })
        .from(webhooks)
        .where(and(...conditions))
        .then(rows => rows[0]?.count ?? 0),
    ])

    // Serialize WITHOUT secrets
    const data = webhookList.map(serializeWebhook)

    return paginatedResponse(data, Number(countResult), offset, limit)
  })
}

// POST /api/v1/webhooks - Create a new webhook subscription
export async function POST(request: NextRequest) {
  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return Problems.validation([{ field: "body", code: "invalid_json", message: "Invalid JSON body" }])
    }

    const parsed = createWebhookSchema.safeParse(body)
    if (!parsed.success) {
      return Problems.validation(
        parsed.error.issues.map(issue => ({
          field: issue.path.join(".") || "body",
          code: issue.code,
          message: issue.message,
        }))
      )
    }

    const { url, events } = parsed.data

    // Generate random secret for HMAC signing
    const secret = crypto.randomBytes(32).toString("hex")

    const now = new Date()
    const [webhook] = await db.insert(webhooks).values({
      userId: ctx.userId,
      url,
      secret,
      events,
      active: true,
      createdAt: now,
      updatedAt: now,
    }).returning()

    // Return WITH secret (only time this is shown)
    return createdResponse(serializeWebhookWithSecret(webhook))
  })
}
