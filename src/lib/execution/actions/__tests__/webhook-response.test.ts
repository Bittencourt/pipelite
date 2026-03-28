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
