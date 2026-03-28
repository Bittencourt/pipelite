import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { workflows } from "@/db/schema/workflows"
import { eq } from "drizzle-orm"
import { verifyWebhookSecret } from "@/lib/triggers/webhook-secret"
import { createWorkflowRun } from "@/lib/triggers/create-run"
import type { TriggerEnvelope } from "@/lib/triggers/types"

interface RouteParams {
  params: Promise<{ workflowId: string; secret: string }>
}

/**
 * Public inbound webhook endpoint.
 * No auth middleware -- the secret in the URL IS the authentication.
 *
 * POST /api/webhooks/in/{workflowId}/{secret}
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { workflowId, secret } = await params

  // Look up workflow
  const workflow = await db.query.workflows.findFirst({
    where: eq(workflows.id, workflowId),
  })

  // Not found or inactive: return 404 (no information leakage)
  if (!workflow || !workflow.active) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // Find webhook trigger in triggers array
  const triggers = (workflow.triggers ?? []) as Array<Record<string, unknown>>
  const webhookTriggerIndex = triggers.findIndex((t) => t.type === "webhook")
  const webhookTrigger = webhookTriggerIndex >= 0 ? triggers[webhookTriggerIndex] : null

  if (!webhookTrigger) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // Verify secret with timing-safe comparison
  const storedSecret = webhookTrigger.secret as string
  if (!storedSecret || !verifyWebhookSecret(secret, storedSecret)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // Parse request body
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    )
  }

  // Build trigger envelope
  const envelope: TriggerEnvelope = {
    trigger_type: "webhook",
    trigger_id: String(webhookTriggerIndex),
    timestamp: new Date().toISOString(),
    data: {
      body,
      headers: {
        "content-type": request.headers.get("content-type"),
        "user-agent": request.headers.get("user-agent"),
      },
    },
  }

  // Create workflow run
  const run = await createWorkflowRun(workflowId, envelope)

  return NextResponse.json(
    { ok: true, run_id: run.id },
    { status: 200 }
  )
}
