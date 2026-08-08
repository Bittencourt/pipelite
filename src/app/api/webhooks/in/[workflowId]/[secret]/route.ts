import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { workflows } from "@/db/schema/workflows"
import { eq } from "drizzle-orm"
import { verifyWebhookSecret } from "@/lib/triggers/webhook-secret"
import { createWorkflowRun, claimWorkflowRun } from "@/lib/triggers/create-run"
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

  // Match the provided secret against ANY webhook trigger in the array.
  // A workflow can have multiple webhook triggers, each with its own secret;
  // every candidate is checked with a timing-safe comparison. We deliberately
  // do not break out of the loop early so the amount of comparison work does
  // not depend on which trigger (if any) matched.
  const triggers = (workflow.triggers ?? []) as Array<Record<string, unknown>>
  let matchedTriggerIndex = -1
  for (let i = 0; i < triggers.length; i++) {
    const trigger = triggers[i]
    if (trigger.type !== "webhook") continue

    const storedSecret = trigger.secret as string | undefined
    if (
      storedSecret &&
      verifyWebhookSecret(secret, storedSecret) &&
      matchedTriggerIndex === -1
    ) {
      matchedTriggerIndex = i
    }
  }

  // No webhook trigger or no matching secret: 404 (no information leakage)
  if (matchedTriggerIndex === -1) {
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
    trigger_id: String(matchedTriggerIndex),
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
    // Atomically claim the run (pending -> running) BEFORE executing it here.
    // The execution processor polls every few seconds and claims any pending
    // run with the same status flip; without this claim both sides could
    // execute the run, duplicating steps and CRM/HTTP side effects.
    const claimed = await claimWorkflowRun(run.id)
    if (!claimed) {
      // Not claimable: either the processor already grabbed it (it will
      // execute the run) or the run was created in a non-pending state
      // (e.g. failed by the recursion guard). Do not execute it here.
      return NextResponse.json(
        { ok: true, run_id: run.id },
        { status: 200 }
      )
    }

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
