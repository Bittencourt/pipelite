import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { readFile } from "node:fs/promises"
import type { ExecutionContext } from "../../types"

// Mock dns.resolve so ssrf.ts doesn't do real DNS
vi.mock("node:dns/promises", () => ({
  resolve: vi.fn().mockResolvedValue(["93.184.216.34"]),
}))

// Mock dependencies required by crm/email/notification side-effect imports
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) })) })),
  },
}))
vi.mock("@/db/schema", () => ({
  users: { id: "users.id", email: "users.email" },
  deals: { id: "deals.id", title: "deals.title" },
  people: { id: "people.id", email: "people.email", firstName: "people.firstName" },
  organizations: { id: "organizations.id", name: "organizations.name" },
  activities: { id: "activities.id", title: "activities.title" },
}))
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  ilike: vi.fn(),
  inArray: vi.fn(),
}))
vi.mock("@/lib/mutations", () => ({
  createDealMutation: vi.fn(),
  updateDealMutation: vi.fn(),
  deleteDealMutation: vi.fn(),
  createPersonMutation: vi.fn(),
  updatePersonMutation: vi.fn(),
  deletePersonMutation: vi.fn(),
  createOrganizationMutation: vi.fn(),
  updateOrganizationMutation: vi.fn(),
  deleteOrganizationMutation: vi.fn(),
  createActivityMutation: vi.fn(),
  updateActivityMutation: vi.fn(),
  deleteActivityMutation: vi.fn(),
}))
vi.mock("../../recursion", () => ({
  getCurrentExecutionDepth: vi.fn(() => 0),
  runWithExecutionDepth: vi.fn((_depth: number, fn: () => unknown) => fn()),
}))
vi.mock("@/lib/email/send", () => ({
  safeSend: vi.fn(),
}))
vi.mock("@/lib/email/templates", () => ({
  getWorkflowEmailTemplate: vi.fn(),
  getWorkflowNotificationTemplate: vi.fn(),
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

  it("GET with empty-string body omits body (built-in GET templates ship body: '')", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve({ ok: true }),
      text: () => Promise.resolve('{"ok":true}'),
    })

    await executeAction(
      "http_request",
      {
        actionType: "http_request",
        method: "GET",
        url: "https://api.example.com/forms/responses",
        headers: { Authorization: "Bearer token" },
        body: "",
        timeout: 30,
        retryCount: 0,
      },
      makeContext(),
      "run-1"
    )

    const [, init] = fetchSpy.mock.calls[0]
    expect(init.body).toBeUndefined()
    // No auto Content-Type since there is no body
    expect(init.headers["content-type"]).toBeUndefined()
  })

  it("GET with non-empty body never attaches it (fetch forbids GET/HEAD bodies)", async () => {
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
        body: '{"stale":"body"}',
        timeout: 30,
        retryCount: 0,
      },
      makeContext(),
      "run-1"
    )

    const [, init] = fetchSpy.mock.calls[0]
    expect(init.body).toBeUndefined()
  })

  it("HEAD request omits body", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({}),
      text: () => Promise.resolve(""),
    })

    await executeAction(
      "http_request",
      {
        actionType: "http_request",
        method: "HEAD",
        url: "https://api.example.com/data",
        body: '{"stale":"body"}',
        timeout: 30,
        retryCount: 0,
      },
      makeContext(),
      "run-1"
    )

    const [, init] = fetchSpy.mock.calls[0]
    expect(init.body).toBeUndefined()
  })

  it("POST with empty-string body sends no body", async () => {
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
        method: "POST",
        url: "https://api.example.com/data",
        body: "",
        timeout: 30,
        retryCount: 0,
      },
      makeContext(),
      "run-1"
    )

    const [, init] = fetchSpy.mock.calls[0]
    expect(init.body).toBeUndefined()
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

  it("non-ok response attaches structured output with a 200-char body preview", async () => {
    const longBody = "x".repeat(500)
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 503,
      headers: new Headers({ "x-upstream": "gateway" }),
      text: () => Promise.resolve(longBody),
    })

    let caught: (Error & { output?: Record<string, unknown> }) | undefined
    try {
      await executeAction(
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
    } catch (error) {
      caught = error as Error & { output?: Record<string, unknown> }
    }

    expect(caught).toBeDefined()
    expect(caught?.output).toEqual({
      statusCode: 503,
      headers: { "x-upstream": "gateway" },
      body: longBody,
    })
    expect(caught?.message).toBe(`HTTP 503: ${"x".repeat(200)}`)
  })

  describe("dry run", () => {
    it("makes no request and no backoff sleep, asserted with retryCount 3", async () => {
      // Frozen fake timers: if the handler awaited sleep(), this await would never
      // resolve and the test would time out. So resolving is itself the proof that
      // no backoff was awaited — and nothing actually waits.
      vi.useFakeTimers({ shouldAdvanceTime: false })
      const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout")
      const before = Date.now()

      const result = await executeAction(
        "http_request",
        {
          actionType: "http_request",
          method: "GET",
          url: "https://api.example.com/data",
          timeout: 30,
          // retryCount 3 so a gate placed INSIDE the loop (which would still fire one
          // fetch, and would still sleep between attempts) fails this case.
          retryCount: 3,
        },
        makeContext({ _dryRun: true }),
        "run-dry"
      )

      expect(fetchSpy).not.toHaveBeenCalled()
      // No sleep: no timer was scheduled at all (sleep() and fetchWithTimeout() are
      // the only setTimeout call sites in the handler).
      expect(
        setTimeoutSpy,
        "the gate must sit ABOVE the retry loop: inside it, a retryCount: 5 node " +
          "would burn ~31s of exponential backoff in the dry-run dialog"
      ).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
      expect(Date.now() - before).toBe(0)

      expect(result.output).toEqual({
        statusCode: 200,
        headers: {},
        body: {},
        simulated: true,
      })

      setTimeoutSpy.mockRestore()
    })

    it("still runs validateUrl, with the INTERPOLATED url", async () => {
      const ssrf = await import("../ssrf")
      const validateSpy = vi.spyOn(ssrf, "validateUrl")

      await executeAction(
        "http_request",
        {
          actionType: "http_request",
          method: "GET",
          url: "{{trigger.data.url}}/items/{{nodes.node_1.output.body.id}}",
          timeout: 30,
          retryCount: 0,
        },
        makeContext({ _dryRun: true }),
        "run-dry"
      )

      expect(validateSpy).toHaveBeenCalledWith(
        "https://api.example.com/items/abc123"
      )
      expect(fetchSpy).not.toHaveBeenCalled()
      validateSpy.mockRestore()
    })

    it("an SSRF-blocked URL STILL throws under dry run (real validateUrl, blocked protocol)", async () => {
      await expect(
        executeAction(
          "http_request",
          {
            actionType: "http_request",
            method: "GET",
            url: "file:///etc/passwd",
            timeout: 30,
            retryCount: 0,
          },
          makeContext({ _dryRun: true }),
          "run-dry"
        ),
        "validateUrl must stay ABOVE the gate: dropping it would let a dry run " +
          '"prove" a URL is fine that a real run rejects, turning the dry-run path ' +
          "into an SSRF oracle"
      ).rejects.toThrow(/Blocked protocol/)

      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it("a private-IP URL STILL throws under dry run", async () => {
      const ssrf = await import("../ssrf")
      const validateSpy = vi
        .spyOn(ssrf, "validateUrl")
        .mockRejectedValue(new Error("Blocked: request to private IP"))

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
          makeContext({ _dryRun: true }),
          "run-dry"
        ),
        "an SSRF rejection must surface in a dry run exactly as in a real run"
      ).rejects.toThrow("Blocked: request to private IP")

      expect(fetchSpy).not.toHaveBeenCalled()
      validateSpy.mockRestore()
    })

    it("still interpolates headers and still builds the body for a POST object body", async () => {
      const interp = await import("../interpolate")
      const interpolateSpy = vi.spyOn(interp, "interpolate")
      const interpolateDeepSpy = vi.spyOn(interp, "interpolateDeep")

      await executeAction(
        "http_request",
        {
          actionType: "http_request",
          method: "POST",
          url: "https://api.example.com/items",
          headers: { Authorization: "Bearer {{trigger.data.token}}" },
          body: { name: "{{trigger.data.name}}" },
          timeout: 30,
          retryCount: 0,
        },
        makeContext({ _dryRun: true }),
        "run-dry"
      )

      // Header values still go through interpolate...
      expect(interpolateSpy).toHaveBeenCalledWith(
        "Bearer {{trigger.data.token}}",
        expect.anything()
      )
      expect(
        interpolateSpy.mock.results.some((r) => r.value === "Bearer secret-token-123")
      ).toBe(true)
      // ...and the object body is still built, which is the straight-line path that
      // also applies the auto content-type (the gate sits below both).
      expect(interpolateDeepSpy).toHaveBeenCalledWith(
        { name: "{{trigger.data.name}}" },
        expect.anything()
      )
      expect(fetchSpy).not.toHaveBeenCalled()

      interpolateSpy.mockRestore()
      interpolateDeepSpy.mockRestore()
    })

    it("GET builds no body under dry run", async () => {
      const interp = await import("../interpolate")
      const interpolateDeepSpy = vi.spyOn(interp, "interpolateDeep")

      await executeAction(
        "http_request",
        {
          actionType: "http_request",
          method: "GET",
          url: "https://api.example.com/data",
          body: { stale: "body" },
          timeout: 30,
          retryCount: 0,
        },
        makeContext({ _dryRun: true }),
        "run-dry"
      )

      expect(interpolateDeepSpy).not.toHaveBeenCalled()
      expect(fetchSpy).not.toHaveBeenCalled()
      interpolateDeepSpy.mockRestore()
    })

    it("output key set equals the real output's key set plus exactly `simulated`", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({ result: "ok" }),
        text: () => Promise.resolve('{"result":"ok"}'),
      })

      const config = {
        actionType: "http_request",
        method: "GET",
        url: "https://api.example.com/data",
        timeout: 30,
        retryCount: 0,
      }

      const real = await executeAction(
        "http_request",
        config,
        makeContext(),
        "run-real"
      )
      const realCalls = fetchSpy.mock.calls.length

      const dry = await executeAction(
        "http_request",
        config,
        makeContext({ _dryRun: true }),
        "run-dry"
      )

      // ANTI-VACUITY: the same fetch mock the dry-run half saw zero times must be
      // seen a non-zero number of times by the real half.
      expect(realCalls).toBe(1)
      expect(fetchSpy.mock.calls.length).toBe(1)

      // Computed, not listed twice: a downstream transform/condition node reads
      // fields off the previous node's output.
      const realKeys = Object.keys(real.output).sort()
      const dryKeys = Object.keys(dry.output).sort()
      expect(dryKeys).toEqual([...realKeys, "simulated"].sort())
    })

    it("gate placement: the dry-run return sits AFTER validateUrl and the whole body build, and BEFORE the retry loop", async () => {
      const src = await readFile(new URL("../http.ts", import.meta.url), "utf8")

      const validateIdx = src.indexOf("await validateUrl(url)")
      const contentTypeIdx = src.indexOf(
        'headers["content-type"] = "application/json"'
      )
      const gateIdx = src.indexOf("if (context._dryRun)")
      const loopIdx = src.indexOf("for (let attempt = 0")

      expect(validateIdx).toBeGreaterThan(-1)
      expect(contentTypeIdx).toBeGreaterThan(-1)
      expect(gateIdx, "http.ts must contain a `if (context._dryRun)` gate").toBeGreaterThan(-1)
      expect(loopIdx).toBeGreaterThan(-1)

      expect(gateIdx).toBeGreaterThan(validateIdx)
      // The auto content-type is not observable in the simulated output (which is
      // deliberately `headers: {}`), so its survival is pinned structurally: the gate
      // sits below the entire body build.
      expect(gateIdx).toBeGreaterThan(contentTypeIdx)
      expect(loopIdx).toBeGreaterThan(gateIdx)
    })
  })
})
