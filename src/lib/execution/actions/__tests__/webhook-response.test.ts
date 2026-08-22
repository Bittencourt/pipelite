import { describe, it, expect } from "vitest"
import type { ExecutionContext } from "../../types"

function makeContext(overrides?: Partial<ExecutionContext>): ExecutionContext {
  return {
    trigger: {
      type: "webhook",
      data: {
        body: { name: "Test" },
      },
    },
    nodes: {
      transform_1: {
        output: { greeting: "Hello Test", logs: [] },
        status: "completed",
      },
    },
    ...overrides,
  }
}

// Import the coordination functions and handler registration (no DB dependency)
import {
  waitForWebhookResponse,
  sendWebhookResponse,
  hasWebhookResponseNode,
} from "../webhook-response"

// Import registry to get the handler directly (avoids importing crm.ts -> db)
import { getHandler } from "../registry"

// Trigger registration of webhook_response handler
import "../webhook-response"

const webhookResponseHandler = getHandler("webhook_response")!

describe("webhook response coordination", () => {
  it("sendWebhookResponse resolves pending waitForWebhookResponse", async () => {
    const promise = waitForWebhookResponse("run-100", 5000)

    const sent = sendWebhookResponse("run-100", 200, { ok: true })
    expect(sent).toBe(true)

    const result = await promise
    expect(result.statusCode).toBe(200)
    expect(result.body).toEqual({ ok: true })
  })

  it("waitForWebhookResponse times out", async () => {
    await expect(
      waitForWebhookResponse("run-timeout", 50)
    ).rejects.toThrow(/timeout/i)
  })

  it("sendWebhookResponse returns false if no pending response", () => {
    const sent = sendWebhookResponse("run-nonexistent", 200, {})
    expect(sent).toBe(false)
  })

  it("sendWebhookResponse cleans up after resolving", async () => {
    const promise = waitForWebhookResponse("run-cleanup", 5000)
    sendWebhookResponse("run-cleanup", 200, { done: true })
    await promise

    // Second send should return false (cleaned up)
    const sent = sendWebhookResponse("run-cleanup", 200, {})
    expect(sent).toBe(false)
  })
})

describe("webhook_response action handler", () => {
  it("interpolates body and calls sendWebhookResponse", async () => {
    // Set up a pending response first
    const pending = waitForWebhookResponse("run-handler", 5000)

    const result = await webhookResponseHandler(
      {
        statusCode: 201,
        body: { message: "Created {{trigger.data.body.name}}" },
      },
      makeContext(),
      "run-handler"
    )

    expect(result.output.sent).toBe(true)
    expect(result.output.statusCode).toBe(201)

    const response = await pending
    expect(response.statusCode).toBe(201)
    expect(response.body).toEqual({ message: "Created Test" })
  })

  it("returns not_waiting when no pending response", async () => {
    const result = await webhookResponseHandler(
      {
        statusCode: 200,
        body: { ok: true },
      },
      makeContext(),
      "run-no-pending"
    )

    expect(result.output.sent).toBe(false)
    expect(result.output.statusCode).toBe(200)
  })

  it("defaults to status 200", async () => {
    const result = await webhookResponseHandler(
      {
        body: { ok: true },
      },
      makeContext(),
      "run-default-status"
    )

    expect(result.output.statusCode).toBe(200)
  })
})

// ---- Dry run (WFOPS-02) ----
//
// `sendWebhookResponse` is gated under `_dryRun` even though it is ALREADY incidentally safe:
// `pendingResponses` is only written by `waitForWebhookResponse`, which only the inbound webhook
// route calls, so a dry run created by a server action never has an entry and the send returns
// false on the map miss. That safety is an accident of two facts asserted nowhere. The tests below
// assert the gate against a REGISTERED entry, which is the only way to tell a gate apart from the
// incidental miss.
describe("webhook_response dry run", () => {
  const dryContext = () => makeContext({ _dryRun: true })

  it("leaves a REGISTERED pending response untouched", async () => {
    const runId = "run-dry-registered"
    const pending = waitForWebhookResponse(runId, 5000)
    let settled = false
    void pending.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      }
    )

    const result = await webhookResponseHandler(
      { statusCode: 202, body: { message: "Hi {{trigger.data.body.name}}" } },
      dryContext(),
      runId
    )

    expect(result.output.sent).toBe(false)

    // Drain the microtask and macrotask queues: a resolved promise flips `settled` by now.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(
      settled,
      "ANTI-VACUITY: the dry run resolved a LIVE pending webhook response, so the gate is " +
        "absent. Every other dry-run assertion in this file also passes on the pre-existing " +
        "INCIDENTAL map miss; this is the only one that proves the gate exists."
    ).toBe(false)

    // Still pending, and still resolvable for real — which also clears its 5s timeout.
    expect(sendWebhookResponse(runId, 200, { ok: true })).toBe(true)
    await expect(pending).resolves.toEqual({
      statusCode: 200,
      body: { ok: true },
    })
  })

  it("still interpolates the body", async () => {
    const result = await webhookResponseHandler(
      { statusCode: 200, body: { message: "Hi {{trigger.data.body.name}}" } },
      dryContext(),
      "run-dry-interpolate"
    )

    expect(result.output.body).toEqual({ message: "Hi Test" })
  })

  it("still normalises a non-object body to {}", async () => {
    const unparseable = await webhookResponseHandler(
      { statusCode: 200, body: "not json at all" },
      dryContext(),
      "run-dry-normalize-string"
    )
    expect(unparseable.output.body).toEqual({})

    const numeric = await webhookResponseHandler(
      { statusCode: 200, body: 42 },
      dryContext(),
      "run-dry-normalize-number"
    )
    expect(numeric.output.body).toEqual({})
  })

  it("still defaults statusCode to 200", async () => {
    const result = await webhookResponseHandler(
      { body: { ok: true } },
      dryContext(),
      "run-dry-default-status"
    )

    expect(result.output.statusCode).toBe(200)
  })

  it("matches the real output's key set plus exactly `simulated`", async () => {
    const config = {
      statusCode: 201,
      body: { message: "Created {{trigger.data.body.name}}" },
    }

    const real = await webhookResponseHandler(
      config,
      makeContext(),
      "run-parity-real"
    )
    const dry = await webhookResponseHandler(config, dryContext(), "run-parity-dry")

    // Computed from the real output, not listed twice: a real output that grows a key makes the
    // simulated one fail until it grows the same key. Shape fidelity is the point — a downstream
    // node reading a field off this output must not get `undefined` in a dry run.
    const realKeys = new Set(Object.keys(real.output))
    expect(realKeys.has("simulated")).toBe(false)
    expect(new Set(Object.keys(dry.output))).toEqual(
      new Set([...realKeys, "simulated"])
    )
    expect(dry.output).toEqual({
      sent: false,
      statusCode: 201,
      body: { message: "Created Test" },
      simulated: true,
    })
  })

  it("still sends for real when _dryRun is false", async () => {
    const runId = "run-real-explicit-false"
    const pending = waitForWebhookResponse(runId, 5000)

    const result = await webhookResponseHandler(
      { statusCode: 201, body: { message: "Created {{trigger.data.body.name}}" } },
      makeContext({ _dryRun: false }),
      runId
    )

    expect(result.output).toEqual({
      sent: true,
      statusCode: 201,
      body: { message: "Created Test" },
    })
    // sendWebhookResponse was called exactly once with (runId, statusCode, interpolatedBody):
    // the pending promise for THIS runId resolved with exactly those values...
    await expect(pending).resolves.toEqual({
      statusCode: 201,
      body: { message: "Created Test" },
    })
    // ...and only once, since the entry is now gone.
    expect(sendWebhookResponse(runId, 200, {})).toBe(false)
  })

  it("keeps the map-miss behaviour unchanged for a real run", async () => {
    const result = await webhookResponseHandler(
      { statusCode: 200, body: { ok: true } },
      makeContext({ _dryRun: false }),
      "run-real-unregistered"
    )

    expect(result.output).toEqual({
      sent: false,
      statusCode: 200,
      body: { ok: true },
    })
  })
})

describe("hasWebhookResponseNode", () => {
  it("returns true when webhook_response node exists", () => {
    const nodes = [
      { id: "1", type: "action", config: { actionType: "http_request" } },
      { id: "2", type: "action", config: { actionType: "webhook_response" } },
    ]
    expect(hasWebhookResponseNode(nodes)).toBe(true)
  })

  it("returns false when no webhook_response node exists", () => {
    const nodes = [
      { id: "1", type: "action", config: { actionType: "http_request" } },
      { id: "2", type: "condition", config: { groups: [] } },
    ]
    expect(hasWebhookResponseNode(nodes)).toBe(false)
  })

  it("returns false for empty array", () => {
    expect(hasWebhookResponseNode([])).toBe(false)
  })

  it("handles malformed nodes gracefully", () => {
    const nodes = [null, undefined, { id: "1" }, { id: "2", config: {} }]
    expect(hasWebhookResponseNode(nodes as unknown[])).toBe(false)
  })
})
