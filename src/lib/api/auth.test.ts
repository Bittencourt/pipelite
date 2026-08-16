/**
 * The first test of `withApiAuth` itself (AUDIT-02, T-36-01 / T-36-10).
 *
 * THE INVERSION: every other suite in this repo replaces `withApiAuth` with a stub that
 * calls the handler directly, because those suites are about what a route does AFTER
 * authentication. This one is about the wrapper, so it cannot do that — the wrapper is the
 * subject, not the scaffolding.
 *
 * The `AsyncLocalStorage` behind `getCurrentActor` is REAL here, deliberately. A stubbed
 * store would assert that this file calls a function, not that a handler genuinely observes
 * an actor across the awaits the real wrapper performs.
 *
 * `./errors` is also real, so the status codes asserted below are the ones a client sees.
 * Only the two external collaborators are replaced: `validateApiKey` (would reach the
 * database) and `checkRateLimit` (would reach Redis).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest, NextResponse } from "next/server"

vi.mock("@/lib/api-keys", () => ({ validateApiKey: vi.fn() }))
vi.mock("./rate-limit", () => ({ checkRateLimit: vi.fn() }))

import { withApiAuth, type ApiAuthContext } from "./auth"
import { validateApiKey } from "@/lib/api-keys"
import { checkRateLimit } from "./rate-limit"
import { getCurrentActor, type AuditActor } from "@/lib/audit/actor-context"

const mockValidateApiKey = vi.mocked(validateApiKey)
const mockCheckRateLimit = vi.mocked(checkRateLimit)

/** A request carrying a well-formed bearer token. */
function bearerRequest(token = "test-token"): NextRequest {
  return new NextRequest("http://localhost/api/v1/deals", {
    headers: { Authorization: `Bearer ${token}` },
  })
}

/** A request with no `Authorization` header at all. */
function anonymousRequest(): NextRequest {
  return new NextRequest("http://localhost/api/v1/deals")
}

/** `validateApiKey` resolves a real key, `checkRateLimit` allows. */
function allowAuthenticated(context: ApiAuthContext = { userId: "u1", keyId: "k1" }) {
  mockValidateApiKey.mockResolvedValue(context)
  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 499, resetIn: 60 })
}

describe("withApiAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("the api_key actor scope", () => {
    it("establishes an api_key actor carrying the authenticated userId", async () => {
      allowAuthenticated()
      let observed: AuditActor | undefined

      const handler = vi.fn(async () => {
        observed = getCurrentActor()
        return NextResponse.json({ ok: true })
      })

      const response = await withApiAuth(bearerRequest(), handler)

      expect(response.status).toBe(200)
      expect(handler).toHaveBeenCalledTimes(1)
      expect(observed).toEqual({ kind: "api_key", userId: "u1" })
    })

    it("keeps the same actor readable after the handler awaits", async () => {
      allowAuthenticated()
      let observed: AuditActor | undefined

      // A real route awaits its database work before anything reaches the audit
      // subscriber, so reading the actor synchronously at handler entry would prove
      // nothing about the path that matters.
      const handler = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1))
        await Promise.resolve()
        observed = getCurrentActor()
        return NextResponse.json({ ok: true })
      })

      await withApiAuth(bearerRequest(), handler)

      expect(observed).toEqual({ kind: "api_key", userId: "u1" })
    })

    it("never carries a workflowRunId on the api-key path", async () => {
      allowAuthenticated()
      let observed: AuditActor | undefined

      const handler = vi.fn(async () => {
        observed = getCurrentActor()
        return NextResponse.json({ ok: true })
      })

      await withApiAuth(bearerRequest(), handler)

      // The kind assertion is not redundant: without it the two absence checks below
      // would pass vacuously against `observed === undefined`, i.e. against no actor at
      // all, which is exactly the state this test is supposed to distinguish from.
      expect(observed?.kind).toBe("api_key")
      // T-36-13: a run identity is written only by the executor, from its own runId.
      // An HTTP caller must have no way to acquire one.
      expect(observed?.workflowRunId).toBeUndefined()
      expect(observed?.importSessionId).toBeUndefined()
    })

    it("builds the actor only from the validated key, never from the request", async () => {
      // The request claims to be somebody else in every way it can. The actor must
      // reflect `validateApiKey`'s answer and nothing else (T-36-01).
      allowAuthenticated({ userId: "real-user", keyId: "real-key" })
      let observed: AuditActor | undefined

      const request = new NextRequest(
        "http://localhost/api/v1/deals?userId=attacker&workflowRunId=forged",
        {
          headers: {
            Authorization: "Bearer test-token",
            "X-User-Id": "attacker",
            "X-Actor-Kind": "user",
          },
        }
      )

      const handler = vi.fn(async () => {
        observed = getCurrentActor()
        return NextResponse.json({ ok: true })
      })

      await withApiAuth(request, handler)

      expect(observed).toEqual({ kind: "api_key", userId: "real-user" })
    })

    it("leaves no actor in scope once withApiAuth resolves", async () => {
      allowAuthenticated()

      const handler = vi.fn(async () => NextResponse.json({ ok: true }))

      await withApiAuth(bearerRequest(), handler)

      expect(getCurrentActor()).toBeUndefined()
    })
  })

  describe("the reject paths establish no actor", () => {
    /**
     * These three cases are the control for T-36-10. The wrap sits after both rejects, so a
     * route that bypasses `withApiAuth` loses authentication, rate limiting AND actor
     * attribution together — its writes land as `system`, which is the visible symptom.
     *
     * "The handler was not called" is the load-bearing half of each assertion: the actor is
     * only ever observable from inside the handler, so a handler that never ran cannot have
     * seen one.
     */
    it("returns 401 and runs no handler when the Authorization header is absent", async () => {
      const handler = vi.fn(async () => NextResponse.json({ ok: true }))

      const response = await withApiAuth(anonymousRequest(), handler)

      expect(response.status).toBe(401)
      expect(handler).not.toHaveBeenCalled()
      expect(mockValidateApiKey).not.toHaveBeenCalled()
      expect(getCurrentActor()).toBeUndefined()
    })

    it("returns 401 and runs no handler when the Authorization scheme is not Bearer", async () => {
      const handler = vi.fn(async () => NextResponse.json({ ok: true }))
      const request = new NextRequest("http://localhost/api/v1/deals", {
        headers: { Authorization: "Basic dTE6azE=" },
      })

      const response = await withApiAuth(request, handler)

      expect(response.status).toBe(401)
      expect(handler).not.toHaveBeenCalled()
      expect(getCurrentActor()).toBeUndefined()
    })

    it("returns 401 and runs no handler when the key does not validate", async () => {
      mockValidateApiKey.mockResolvedValue(null)
      const handler = vi.fn(async () => NextResponse.json({ ok: true }))

      const response = await withApiAuth(bearerRequest("bogus"), handler)

      expect(response.status).toBe(401)
      expect(handler).not.toHaveBeenCalled()
      expect(mockCheckRateLimit).not.toHaveBeenCalled()
      expect(getCurrentActor()).toBeUndefined()
    })

    it("returns 429 and runs no handler when the key is rate limited", async () => {
      mockValidateApiKey.mockResolvedValue({ userId: "u1", keyId: "k1" })
      mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetIn: 42 })
      const handler = vi.fn(async () => NextResponse.json({ ok: true }))

      const response = await withApiAuth(bearerRequest(), handler)

      expect(response.status).toBe(429)
      expect(response.headers.get("Retry-After")).toBe("42")
      expect(handler).not.toHaveBeenCalled()
      // A rate-limited request is authenticated but still gets no actor: the wrap is
      // after this reject, so the whole request is attributable to nobody.
      expect(getCurrentActor()).toBeUndefined()
    })
  })
})
