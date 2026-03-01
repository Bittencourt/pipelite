import { NextRequest } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { Problems } from "@/lib/api/errors"
import { singleResponse, noContentResponse } from "@/lib/api/response"
import { db } from "@/db"
import { webhooks } from "@/db/schema/webhooks"
import { eq } from "drizzle-orm"
import { z } from "zod"

const updateWebhookSchema = z.object({
  url: z.string().url("Must be a valid URL").refine(
    (url) => url.startsWith("https://"),
    { message: "Webhook URL must use HTTPS" }
  ).optional(),
  events: z.array(z.string().min(1)).min(1, "At least one event is required").optional(),
  active: z.boolean().optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

// Type for webhook without secret
type WebhookResponse = {
  id: string
  url: string
  events: string[]
  active: boolean
  created_at: string | null
  updated_at: string | null
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

// GET /api/v1/webhooks/:id - Get a single webhook (without secret)
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {
    const { id } = await params

    const webhook = await db.query.webhooks.findFirst({
      where: eq(webhooks.id, id),
    })

    if (!webhook) {
      return Problems.notFound("Webhook")
    }

    // Verify ownership
    if (webhook.userId !== ctx.userId) {
      return Problems.forbidden()
    }

    // Return WITHOUT secret
    return singleResponse(serializeWebhook(webhook))
  })
}

// PUT /api/v1/webhooks/:id - Update a webhook
export async function PUT(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {
    const { id } = await params

    // Fetch existing webhook
    const existingWebhook = await db.query.webhooks.findFirst({
      where: eq(webhooks.id, id),
    })

    if (!existingWebhook) {
      return Problems.notFound("Webhook")
    }

    // Verify ownership
    if (existingWebhook.userId !== ctx.userId) {
      return Problems.forbidden()
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return Problems.validation([{ field: "body", code: "invalid_json", message: "Invalid JSON body" }])
    }

    const parsed = updateWebhookSchema.safeParse(body)
    if (!parsed.success) {
      return Problems.validation(
        parsed.error.issues.map(issue => ({
          field: issue.path.join(".") || "body",
          code: issue.code,
          message: issue.message,
        }))
      )
    }

    const updates = parsed.data
    const now = new Date()

    // Build update object
    // Note: secret cannot be updated (would need regeneration endpoint)
    const updateData: Record<string, unknown> = {
      updatedAt: now,
    }

    if (updates.url !== undefined) updateData.url = updates.url
    if (updates.events !== undefined) updateData.events = updates.events
    if (updates.active !== undefined) updateData.active = updates.active

    const [updatedWebhook] = await db.update(webhooks)
      .set(updateData)
      .where(eq(webhooks.id, id))
      .returning()

    // Return WITHOUT secret
    return singleResponse(serializeWebhook(updatedWebhook))
  })
}

// DELETE /api/v1/webhooks/:id - Delete a webhook subscription
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {
    const { id } = await params

    // Fetch existing webhook
    const existingWebhook = await db.query.webhooks.findFirst({
      where: eq(webhooks.id, id),
    })

    if (!existingWebhook) {
      return Problems.notFound("Webhook")
    }

    // Verify ownership
    if (existingWebhook.userId !== ctx.userId) {
      return Problems.forbidden()
    }

    // Hard delete (webhooks don't need soft delete)
    await db.delete(webhooks).where(eq(webhooks.id, id))

    return noContentResponse()
  })
}
