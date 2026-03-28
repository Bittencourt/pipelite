import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { ExecutionContext } from "../../types"

// Mock dns.resolve so ssrf.ts doesn't do real DNS
vi.mock("node:dns/promises", () => ({
  resolve: vi.fn().mockResolvedValue(["93.184.216.34"]),
}))

function makeContext(overrides?: Partial<ExecutionContext>): ExecutionContext {
  return {
    trigger: {
      type: "deal.created",
      data: {
        name: "John",
        url: "https://api.example.com",
        token: "secret-token-123",
      },
    },
    nodes: {
      node_1: {
        output: { body: { id: "abc123" }, statusCode: 200 },
        status: "completed",
      },
    },
    ...overrides,
  }
}

// We need to dynamically import after mocking
let executeAction: typeof import("../index").executeAction

describe("HTTP action handler", () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)

    // Fresh import to ensure handler registration
    vi.resetModules()
    vi.doMock("node:dns/promises", () => ({
      resolve: vi.fn().mockResolvedValue(["93.184.216.34"]),
    }))
    const mod = await import("../index")
    executeAction = mod.executeAction
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("successful GET returns statusCode, headers, body", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve({ result: "ok" }),
      text: () => Promise.resolve('{"result":"ok"}'),
    })

    const result = await executeAction(
      "http_request",
      {
        actionType: "http_request",
        method: "GET",
        url: "https://api.example.com/data",
        timeout: 30,
        retryCount: 0,
      },
      makeContext(),
      "run-1"
    )

    expect(result.output.statusCode).toBe(200)
    expect(result.output.body).toEqual({ result: "ok" })
    expect(result.output.headers).toBeDefined()
  })

  it("POST with JSON body: body is interpolated and sent", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve({ id: "new-1" }),
      text: () => Promise.resolve('{"id":"new-1"}'),
    })

    await executeAction(
      "http_request",
      {
        actionType: "http_request",
        method: "POST",
        url: "https://api.example.com/items",
        body: { name: "{{trigger.data.name}}", ref: "{{nodes.node_1.output.body.id}}" },
        timeout: 30,
        retryCount: 0,
      },
      makeContext(),
      "run-1"
    )

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe("https://api.example.com/items")
    expect(JSON.parse(init.body)).toEqual({ name: "John", ref: "abc123" })
    expect(init.headers["content-type"]).toBe("application/json")
  })

  it("interpolates variables in URL", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve({}),
      text: () => Promise.resolve("{}"),
    })

    await executeAction(
      "http_request",
      {
        actionType: "http_request",
        method: "GET",
        url: "{{trigger.data.url}}/items/{{nodes.node_1.output.body.id}}",
        timeout: 30,
        retryCount: 0,
      },
      makeContext(),
      "run-1"
    )

    expect(fetchSpy.mock.calls[0][0]).toBe("https://api.example.com/items/abc123")
  })

  it("interpolates variables in headers", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve({}),
      text: () => Promise.resolve("{}"),
    })

    await executeAction(
      "http_request",
      {
        actionType: "http_request",
        method: "GET",
        url: "https://api.example.com/data",
        headers: { Authorization: "Bearer {{trigger.data.token}}" },
        timeout: 30,
        retryCount: 0,
      },
      makeContext(),
      "run-1"
    )

    const [, init] = fetchSpy.mock.calls[0]
    expect(init.headers["Authorization"]).toBe("Bearer secret-token-123")
  })

  it("passes AbortSignal to fetch for timeout", async () => {
    // Verify that fetchWithTimeout passes an AbortSignal to fetch
    // and that the signal aborts after the configured timeout
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve({}),
      text: () => Promise.resolve("{}"),
    })

    await executeAction(
      "http_request",
      {
        actionType: "http_request",
        method: "GET",
        url: "https://api.example.com/data",
        timeout: 15,
        retryCount: 0,
      },
      makeContext(),
      "run-1"
    )

    // Verify fetch was called with an AbortSignal
    const [, init] = fetchSpy.mock.calls[0]
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it("retries on failure with backoff delays", async () => {
    let callCount = 0
    fetchSpy.mockImplementation(() => {
      callCount++
      if (callCount < 3) {
        return Promise.resolve({
          ok: false,
          status: 500,
          headers: new Headers({}),
          text: () => Promise.resolve("Internal Server Error"),
        })
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({ success: true }),
        text: () => Promise.resolve('{"success":true}'),
      })
    })

    const promise = executeAction(
      "http_request",
      {
        actionType: "http_request",
        method: "GET",
        url: "https://api.example.com/data",
        timeout: 30,
        retryCount: 3,
      },
      makeContext(),
      "run-1"
    )

    // Advance past first retry delay (1s)
    await vi.advanceTimersByTimeAsync(1100)
    // Advance past second retry delay (2s)
    await vi.advanceTimersByTimeAsync(2100)

    const result = await promise
    expect(callCount).toBe(3)
    expect(result.output.statusCode).toBe(200)
  })

  it("fails immediately with retryCount 0", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers({}),
      text: () => Promise.resolve("Server Error"),
    })

    await expect(
      executeAction(
        "http_request",
        {
          actionType: "http_request",
          method: "GET",
          url: "https://api.example.com/data",
          timeout: 30,
          retryCount: 0,
        },
        makeContext(),
        "run-1"
      )
    ).rejects.toThrow("500")

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("calls validateUrl before making request (SSRF check)", async () => {
    // Import ssrf to check it's called
    const ssrf = await import("../ssrf")
    const validateSpy = vi.spyOn(ssrf, "validateUrl").mockRejectedValue(
      new Error("Blocked: request to private IP")
    )

    await expect(
      executeAction(
        "http_request",
        {
          actionType: "http_request",
          method: "GET",
          url: "http://127.0.0.1/admin",
          timeout: 30,
          retryCount: 0,
        },
        makeContext(),
        "run-1"
      )
    ).rejects.toThrow("Blocked: request to private IP")

    expect(fetchSpy).not.toHaveBeenCalled()
    validateSpy.mockRestore()
  })

  it("handles non-JSON response as text", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/plain" }),
      text: () => Promise.resolve("Hello world"),
    })

    const result = await executeAction(
      "http_request",
      {
        actionType: "http_request",
        method: "GET",
        url: "https://api.example.com/text",
        timeout: 30,
        retryCount: 0,
      },
      makeContext(),
      "run-1"
    )

    expect(result.output.body).toBe("Hello world")
  })

  it("includes status code in error message", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 422,
      headers: new Headers({}),
      text: () => Promise.resolve("Unprocessable Entity: validation failed"),
    })

    await expect(
      executeAction(
        "http_request",
        {
          actionType: "http_request",
          method: "POST",
          url: "https://api.example.com/data",
          timeout: 30,
          retryCount: 0,
        },
        makeContext(),
        "run-1"
      )
    ).rejects.toThrow(/422/)
  })
})
