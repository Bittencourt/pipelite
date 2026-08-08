import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { workflows } from "@/db/schema/workflows"
import { eq } from "drizzle-orm"
import { verifyWebhookSecret } from "@/lib/triggers/webhook-secret"
import { createWorkflowRun } from "@/lib/triggers/create-run"
import {
  waitForWebhookResponse,
  hasWebhookResponseNode,
} from "@/lib/execution/actions/webhook-response"
import { executeRun } from "@/lib/execution/engine"
import type { TriggerEnvelope } from "@/lib/triggers/types"

interface RouteParams {
  params: Promise<{ workflowId: string; secret: string }>
}

/**
 * Public inbound webhook endpoint.
 * No auth middleware -- the secret in the URL IS the authentication.
 *
 * POST /api/webhooks/in/{workflowId}/{secret}
 *
 * If the workflow contains a webhook_response action node, the handler
 * executes the run synchronously and waits up to 30s for a custom response.
 * Otherwise, the run is created for async processing by the execution processor.
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

  // Check if workflow has a webhook_response node for synchronous execution
  const workflowNodes = (workflow.nodes ?? []) as unknown[]
  if (hasWebhookResponseNode(workflowNodes)) {
    // Register pending response BEFORE executing so the handler can resolve it
    const responsePromise = waitForWebhookResponse(run.id, 30_000)

    // Execute run synchronously (not via processor queue)
    // executeRun is fire-and-forget here; we wait on the response promise
    const executePromise = executeRun(run.id)

    try {
      // Wait for either the webhook response or the execution to complete
      const response = await Promise.race([
        responsePromise,
        executePromise.then(() => null),
      ])

      if (response) {
        return NextResponse.json(response.body as Record<string, unknown>, {
          status: response.statusCode,
        })
      }

      // Execution completed but no webhook_response node fired (edge case)
      return NextResponse.json(
        { ok: true, run_id: run.id },
        { status: 200 }
      )
    } catch {
      // Timeout or execution error: fall back to default response
      return NextResponse.json(
        { ok: true, run_id: run.id },
        { status: 200 }
      )
    }
  }

  // No webhook_response node: return immediately, run executes via processor
  return NextResponse.json(
    { ok: true, run_id: run.id },
    { status: 200 }
  )
}
