/**
 * OBS-02 — opt-in server-side error tracking, and the PROOF that its disabled state is inert.
 *
 * THIS SUITE'S CENTRAL CLAIM IS A NEGATIVE, WHICH IS WHY IT IS ASSERTED THREE TIMES.
 *
 * Criterion 2's first half is "with SENTRY_DSN unset, nothing leaves the deployment". An absence
 * of observed traffic is not evidence of that, so the disabled path is attacked from three
 * independent directions, each of which would still be meaningful if the other two were deleted:
 *
 *   Layer 1 — `init` is never called.        A direct test of the guard.
 *   Layer 2 — the SDK module is never even EVALUATED, proven with a mock factory that THROWS.
 *             This is the strong layer: it shows the `await import()` genuinely sits inside the
 *             DSN branch rather than being hoisted to module scope.
 *   Layer 3 — no outbound `fetch`.           The criterion's literal claim, tested at the
 *             transport boundary instead of at the API boundary.
 *
 * NOVEL IDIOM, ON PURPOSE: layer 2's `vi.doMock(..., () => { throw ... })` has NO precedent
 * anywhere in this repository — a grep across the tree found zero occurrences. A reviewer should
 * not go looking for the convention; there isn't one. It is the only way to assert "this module
 * was never loaded" from inside a test, because any observation made through the module's own
 * exports presupposes that the module was loaded.
 *
 * A throwing factory is also vacuous unless something proves it is actually installed — a typo'd
 * module path would make layer 2 pass for the wrong reason. So layer 2 carries an explicit CONTROL
 * case: with a DSN set, the guarded import IS reached and the factory DOES throw. That control
 * doubles as the proof of amendment A9 (a broken SDK must degrade to "no error tracking", never to
 * "no application"), since `initSentry()` must catch it and return `false`.
 *
 * `vi.doMock` rather than `vi.mock`: `vi.mock` calls are HOISTED to the top of the file, so two
 * `vi.mock("@sentry/nextjs", …)` factories cannot coexist here — the last one registered would win
 * for every test in the file and layer 2's throwing factory would poison layer 1 and the positive
 * cases. `vi.doMock` is not hoisted, applies to subsequent dynamic imports, and pairs with
 * `vi.resetModules()`. Precedent: src/lib/execution/actions/__tests__/http.test.ts:86-91.
 *
 * What this suite deliberately does NOT prove:
 *   1. That `instrumentation.ts` calls either function. That wiring lands in plan 42-17; this file
 *      only fixes the contract it will delegate to.
 *   2. That the real `@sentry/nextjs` accepts this `init` config at runtime. The SDK is mocked
 *      throughout, so the `dataCollection` assertions are assertions about what we ASK for. The
 *      option shapes were read off the installed types
 *      (node_modules/@sentry/core/build/types/types/datacollection.d.ts) rather than off the docs.
 *   3. That an error actually arrives in a Sentry project. That needs a real DSN and is out of
 *      scope for a unit suite by construction.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

type SentryModule = typeof import("./sentry")

/** Syntactically valid and entirely fictitious. Never point a test at a real project. */
const VALID_DSN =
  "https://0123456789abcdef0123456789abcdef@o4507000000000000.ingest.de.sentry.io/4507000000000001"

const REQUEST = {
  path: "/api/deals/42",
  method: "POST",
  // Two deliberately sensitive headers: T-42-18 asserts neither reaches the log line.
  headers: {
    authorization: "Bearer super-secret-token-value",
    cookie: "authjs.session-token=super-secret-cookie-value",
    "content-type": "application/json",
  } as Record<string, string | string[] | undefined>,
}

const CONTEXT = { routePath: "/api/deals/[id]", routeType: "route", routerKind: "App Router" }

const originalEnv = process.env

/**
 * The module's `enabled` flag lives on `globalThis` (amendment A2 — a module-level `const` is
 * duplicated across Turbopack module graphs, and even between two processors started by one
 * `register()` call). `vi.resetModules()` clears the module registry but NOT `globalThis`, so it
 * must be cleared by hand or the DSN-set cases leak into the DSN-unset cases.
 */
function clearSentryGlobal(): void {
  delete (globalThis as { __pipeliteSentryEnabled?: boolean }).__pipeliteSentryEnabled
}

type ConsoleMethod = "log" | "warn" | "error" | "debug"

function spyFor(method: ConsoleMethod): ReturnType<typeof vi.fn> {
  return console[method] as unknown as ReturnType<typeof vi.fn>
}

/** Every line emitted on a console method, parsed. Field checks, not string matches. */
function records(method: ConsoleMethod): Record<string, unknown>[] {
  return spyFor(method).mock.calls.map((args: unknown[]) => {
    expect(args).toHaveLength(1)
    return JSON.parse(args[0] as string) as Record<string, unknown>
  })
}

/** The raw text of every line emitted on a console method — for "must not appear" assertions. */
function rawLines(method: ConsoleMethod): string {
  return spyFor(method)
    .mock.calls.map((args: unknown[]) => String(args[0]))
    .join("\n")
}

function allRawLines(): string {
  return (["log", "warn", "error", "debug"] as ConsoleMethod[]).map(rawLines).join("\n")
}

async function loadSentry(): Promise<SentryModule> {
  return import("./sentry")
}

/** The object-shaped SDK mock used by every case except layer 2. */
function mockSdk(): { init: ReturnType<typeof vi.fn>; captureRequestError: ReturnType<typeof vi.fn> } {
  const init = vi.fn()
  const captureRequestError = vi.fn()
  vi.doMock("@sentry/nextjs", () => ({ init, captureRequestError }))
  return { init, captureRequestError }
}

beforeEach(() => {
  vi.resetModules()
  process.env = { ...originalEnv }
  // All three deleted rather than left alone: every case below is only meaningful if the ambient
  // environment cannot set them. A developer with a real SENTRY_DSN exported in their shell would
  // otherwise turn the entire disabled half of this suite green for the wrong reason.
  delete process.env.SENTRY_DSN
  delete process.env.NEXT_RUNTIME
  delete process.env.LOG_LEVEL
  clearSentryGlobal()

  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "debug").mockImplementation(() => {})
})

afterEach(() => {
  process.env = originalEnv
  clearSentryGlobal()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.doUnmock("@sentry/nextjs")
  vi.resetModules()
})

// ---------------------------------------------------------------------------------------------
// Layer 1 — init is never called
// ---------------------------------------------------------------------------------------------

describe("OBS-02 layer 1 — with SENTRY_DSN unset, init() is never called", () => {
  it("initSentry() resolves false and the SDK's init was not called", async () => {
    const { init } = mockSdk()

    const { initSentry } = await loadSentry()
    await expect(initSentry()).resolves.toBe(false)

    expect(init).not.toHaveBeenCalled()
  })

  it("announces the disabled state on stdout naming the variable, so an operator can see it is off", async () => {
    mockSdk()

    const { initSentry } = await loadSentry()
    await initSentry()

    const line = records("log").find((r) => r.scope === "sentry")
    expect(line).toBeDefined()
    expect(line?.level).toBe("info")
    expect(String(line?.msg)).toContain("SENTRY_DSN")
  })

  it("names the variable without echoing anything DSN-shaped (T-42-07)", async () => {
    mockSdk()

    const { initSentry } = await loadSentry()
    await initSentry()

    // A DSN is a URL carrying a public key. Neither a scheme nor a credential separator may
    // appear anywhere in the announcement.
    expect(allRawLines()).not.toContain("://")
    expect(allRawLines()).not.toContain("ingest")
  })
})

// ---------------------------------------------------------------------------------------------
// Layer 2 — the module is never even evaluated (the strong layer)
// ---------------------------------------------------------------------------------------------

describe("OBS-02 layer 2 — with SENTRY_DSN unset, @sentry/nextjs is never evaluated", () => {
  beforeEach(() => {
    // NOVEL IDIOM — see the file header. Zero precedent in this repo; do not look for one.
    // If the `await import("@sentry/nextjs")` in sentry.ts were hoisted to module scope, merely
    // loading sentry.ts would run this factory and every case in this block would reject.
    vi.doMock("@sentry/nextjs", () => {
      throw new Error("@sentry/nextjs must not be imported when SENTRY_DSN is unset")
    })
  })

  it("initSentry() resolves false rather than rejecting", async () => {
    const { initSentry } = await loadSentry()

    await expect(initSentry()).resolves.toBe(false)
  })

  it("reportRequestError() completes rather than rejecting", async () => {
    const { reportRequestError } = await loadSentry()

    await expect(
      reportRequestError(new Error("boom"), REQUEST, CONTEXT)
    ).resolves.toBeUndefined()
  })

  it("CONTROL — with a DSN set the guarded import IS reached, and A9 keeps the throw contained", async () => {
    // Without this case layer 2 is vacuous: a mis-resolved module path would make the two cases
    // above pass for entirely the wrong reason. Here the factory must actually throw.
    //
    // It also closes amendment A9. `initSentry()` runs as the first statement of `register()`,
    // before any processor starts, so an `init()` that throws would abort `register()` and start
    // ZERO workers — the observability feature causing the outage it exists to reveal. A broken
    // SDK must degrade to "no error tracking", never to "no application".
    process.env.SENTRY_DSN = VALID_DSN

    const { initSentry } = await loadSentry()
    await expect(initSentry()).resolves.toBe(false)

    const warned = records("warn").find((r) => r.scope === "sentry")
    expect(warned).toBeDefined()
    expect(warned?.level).toBe("warn")
    // Proof the throwing factory really ran: its message is on the line.
    expect(JSON.stringify(warned)).toContain("must not be imported")
  })

  it("A9 — a failed init leaves reporting disabled instead of half-initialised", async () => {
    process.env.SENTRY_DSN = VALID_DSN

    const { initSentry, reportRequestError } = await loadSentry()
    await initSentry()

    // The SDK still throws on import; if `enabled` had been set before the failure, this would
    // reject instead of resolving.
    await expect(
      reportRequestError(new Error("boom"), REQUEST, CONTEXT)
    ).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------------------------
// Layer 3 — nothing on the wire
// ---------------------------------------------------------------------------------------------

describe("OBS-02 layer 3 — with SENTRY_DSN unset, nothing reaches the wire", () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    mockSdk()
  })

  it("reportRequestError() completes and fetch was never called", async () => {
    const { reportRequestError } = await loadSentry()

    await reportRequestError(new Error("boom"), REQUEST, CONTEXT)

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("still emits the error on the structured stream — the log is the guaranteed channel", async () => {
    const { reportRequestError } = await loadSentry()
    const err = new Error("boom")

    await reportRequestError(err, REQUEST, CONTEXT)

    const line = records("error").find((r) => r.scope === "request")
    expect(line).toBeDefined()
    expect(line?.level).toBe("error")
    const serialised = line?.err as Record<string, unknown>
    expect(serialised.message).toBe("boom")
    // The stack is the single most valuable field; JSON.stringify(new Error()) is "{}", so its
    // survival is not a given.
    expect(typeof serialised.stack).toBe("string")
    expect(String(serialised.stack)).toContain("boom")
    expect(line?.path).toBe(REQUEST.path)
    expect(line?.method).toBe(REQUEST.method)
    expect(line?.routePath).toBe(CONTEXT.routePath)
    expect(line?.routeType).toBe(CONTEXT.routeType)
  })

  it("never sweeps the raw request or its headers into the log line (T-42-18)", async () => {
    const { reportRequestError } = await loadSentry()

    await reportRequestError(new Error("boom"), REQUEST, CONTEXT)

    const line = records("error").find((r) => r.scope === "request")
    expect(line?.headers).toBeUndefined()
    expect(line?.request).toBeUndefined()
    expect(allRawLines()).not.toContain("super-secret-token-value")
    expect(allRawLines()).not.toContain("super-secret-cookie-value")
  })
})

// ---------------------------------------------------------------------------------------------
// The positive half of criterion 2
// ---------------------------------------------------------------------------------------------

describe("OBS-02 positive — with SENTRY_DSN set", () => {
  it("initSentry() resolves true and calls init exactly once with the DSN", async () => {
    process.env.SENTRY_DSN = VALID_DSN
    const { init } = mockSdk()

    const { initSentry } = await loadSentry()
    await expect(initSentry()).resolves.toBe(true)

    expect(init).toHaveBeenCalledTimes(1)
    const options = init.mock.calls[0][0] as Record<string, unknown>
    expect(options.dsn).toBe(VALID_DSN)
  })

  it("calls captureRequestError exactly once with the ORIGINAL error object", async () => {
    process.env.SENTRY_DSN = VALID_DSN
    const { captureRequestError } = mockSdk()

    const { initSentry, reportRequestError } = await loadSentry()
    await initSentry()

    const err = new Error("boom")
    await reportRequestError(err, REQUEST, CONTEXT)

    expect(captureRequestError).toHaveBeenCalledTimes(1)
    // Identity, not a copy: a wrapped or re-thrown error loses the original stack.
    expect(captureRequestError.mock.calls[0][0]).toBe(err)
    expect(captureRequestError.mock.calls[0][1]).toEqual(REQUEST)
    // `routerKind` is REQUIRED by @sentry/nextjs's ErrorContext type even though Next's own
    // RequestErrorContext is the source of it — see sentry.ts on why the parameter accepts it
    // optionally and defaults it.
    expect(captureRequestError.mock.calls[0][2]).toEqual(
      expect.objectContaining({
        routePath: CONTEXT.routePath,
        routeType: CONTEXT.routeType,
        routerKind: expect.any(String),
      })
    )
  })

  it("still logs the error even when Sentry is enabled — the two channels are independent", async () => {
    process.env.SENTRY_DSN = VALID_DSN
    mockSdk()

    const { initSentry, reportRequestError } = await loadSentry()
    await initSentry()
    await reportRequestError(new Error("boom"), REQUEST, CONTEXT)

    expect(records("error").some((r) => r.scope === "request")).toBe(true)
  })

  it("never writes the DSN value to the log stream (T-42-07)", async () => {
    process.env.SENTRY_DSN = VALID_DSN
    mockSdk()

    const { initSentry, reportRequestError } = await loadSentry()
    await initSentry()
    await reportRequestError(new Error("boom"), REQUEST, CONTEXT)

    expect(allRawLines()).not.toContain(VALID_DSN)
    expect(allRawLines()).not.toContain("0123456789abcdef")
  })

  it("A2 — the enabled flag survives a module reload, so a duplicated instance still reports", async () => {
    // Amendment A2: src/lib/events/bus.ts exists as FOUR independent instances across nine
    // chunks in a real build, two of them inside a single `register()` call. A module-level
    // `let enabled` would therefore be `false` in whichever instance `onRequestError` resolves
    // to, and Sentry would be configured but permanently silent — an absence indistinguishable
    // from the disabled path this suite works so hard to prove.
    //
    // vitest has ONE module registry and cannot reproduce a Turbopack graph split, so this is a
    // PROXY for that hazard, exactly like the globalThis case in heartbeat.test.ts. What it does
    // pin down is that the flag is not stored in module scope.
    process.env.SENTRY_DSN = VALID_DSN
    const { captureRequestError } = mockSdk()

    const first = await loadSentry()
    await expect(first.initSentry()).resolves.toBe(true)

    vi.resetModules()
    const second = await loadSentry()
    expect(second).not.toBe(first)

    await second.reportRequestError(new Error("boom"), REQUEST, CONTEXT)

    expect(captureRequestError).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------------------------
// PII scrubbing — T-42-06. This is a CRM.
// ---------------------------------------------------------------------------------------------

describe("OBS-02 PII scrubbing — T-42-06", () => {
  let init: ReturnType<typeof vi.fn>

  beforeEach(() => {
    process.env.SENTRY_DSN = VALID_DSN
    init = mockSdk().init
  })

  async function initOptions(): Promise<Record<string, unknown>> {
    const { initSentry } = await loadSentry()
    await initSentry()
    expect(init).toHaveBeenCalledTimes(1)
    return init.mock.calls[0][0] as Record<string, unknown>
  }

  /** A synthetic event carrying one instance of every category that must not leave. */
  function dirtyEvent(): Record<string, unknown> {
    return {
      message: "boom",
      user: { id: "usr_1", email: "jane.doe@acme.example", ip_address: "203.0.113.7" },
      request: {
        url: "https://crm.example.com/api/people/jane.doe@acme.example",
        method: "POST",
        data: { email: "jane.doe@acme.example", notes: "considering a competitor" },
        cookies: { "authjs.session-token": "super-secret-cookie-value" },
        headers: { authorization: "Bearer super-secret-token-value" },
      },
    }
  }

  it("beforeSend's RETURN VALUE has user, request.data, request.cookies and request.headers removed", async () => {
    const options = await initOptions()
    const beforeSend = options.beforeSend as (e: unknown) => Record<string, unknown> | null

    // Asserted on the return value, never on the input object: a beforeSend that mutates but
    // forgets to `return event` drops every event silently, and an input-object assertion would
    // still pass.
    const result = beforeSend(dirtyEvent())

    expect(result).not.toBeNull()
    expect(result?.user).toBeUndefined()
    const request = result?.request as Record<string, unknown>
    expect(request.data).toBeUndefined()
    expect(request.cookies).toBeUndefined()
    expect(request.headers).toBeUndefined()
  })

  it("beforeSend returns the event rather than undefined, so nothing is dropped", async () => {
    const options = await initOptions()
    const beforeSend = options.beforeSend as (e: unknown) => Record<string, unknown> | null

    const result = beforeSend(dirtyEvent())

    expect(result).toBeDefined()
    expect(result?.message).toBe("boom")
  })

  it("beforeSend keeps request.url — the route is the diagnostic — but strips embedded addresses", async () => {
    const options = await initOptions()
    const beforeSend = options.beforeSend as (e: unknown) => Record<string, unknown> | null

    const result = beforeSend(dirtyEvent())
    const url = String((result?.request as Record<string, unknown>).url)

    expect(url).toContain("/api/people/")
    expect(url).not.toContain("jane.doe@acme.example")
  })

  it("beforeSend strips a percent-encoded address too, since query strings carry them encoded", async () => {
    const options = await initOptions()
    const beforeSend = options.beforeSend as (e: unknown) => Record<string, unknown> | null

    const result = beforeSend({
      request: { url: "https://crm.example.com/people?q=jane.doe%40acme.example" },
    })
    const url = String((result?.request as Record<string, unknown>).url)

    expect(url).not.toContain("jane.doe")
    expect(url).toContain("/people?q=")
  })

  it("beforeSend tolerates an event with no request and no user", async () => {
    const options = await initOptions()
    const beforeSend = options.beforeSend as (e: unknown) => Record<string, unknown> | null

    // A logger must never throw; nor must a beforeSend, which runs inside the SDK's own send path.
    const result = beforeSend({ message: "bare" })

    expect(result).toEqual({ message: "bare" })
  })

  it("dataCollection turns userInfo off and collects no HTTP bodies", async () => {
    const options = await initOptions()
    const dataCollection = options.dataCollection as Record<string, unknown>

    // Sentry's own filter. beforeSend is ours and runs last; relying on Sentry-side scrubbing
    // alone would put CRM data on the wire before anything filtered it.
    expect(dataCollection).toBeDefined()
    expect(dataCollection.userInfo).toBe(false)
    expect(dataCollection.httpBodies).toEqual([])
  })

  it("dataCollection disables cookie collection outright rather than with a deny list", async () => {
    const options = await initOptions()
    const dataCollection = options.dataCollection as Record<string, unknown>

    // `{ deny: ["*"] }` looks like "deny everything" and is in fact a NO-OP: the installed
    // filter matches deny terms as case-insensitive SUBSTRINGS of the key
    // (@sentry/core/build/cjs/utils/data-collection/filterKeyValueData.js:20-28), and no cookie
    // name contains a literal asterisk. `false` is the only encoding of "collect none".
    expect(dataCollection.cookies).toBe(false)
  })

  it("dataCollection denies sensitive request AND response headers", async () => {
    const options = await initOptions()
    const dataCollection = options.dataCollection as Record<string, unknown>
    const httpHeaders = dataCollection.httpHeaders as {
      request?: { deny?: string[] }
      response?: { deny?: string[] }
    }

    // The installed type is `{ request?: CollectBehavior; response?: CollectBehavior }`, NOT a
    // bare CollectBehavior — a flat `httpHeaders: { deny: [...] }` does not typecheck, and
    // omitting `response` would leave response headers on their default of `true`.
    expect(httpHeaders.request?.deny).toEqual(expect.arrayContaining(["cookie", "authorization"]))
    expect(httpHeaders.response?.deny).toEqual(expect.arrayContaining(["cookie"]))
  })

  it("dataCollection denies identifying URL query parameters", async () => {
    const options = await initOptions()
    const dataCollection = options.dataCollection as Record<string, unknown>
    const urlQueryParams = dataCollection.urlQueryParams as { deny?: string[] }

    expect(urlQueryParams.deny).toEqual(expect.arrayContaining(["email", "token"]))
  })

  it("dataCollection suppresses stack-frame locals and database query data", async () => {
    const options = await initOptions()
    const dataCollection = options.dataCollection as Record<string, unknown>

    // Both DEFAULT TO TRUE and neither is reachable by beforeSend's event.request deletions:
    // frame locals land under exception.stacktrace, and query data under span attributes. On a
    // CRM a captured local is typically a person or deal row.
    expect(dataCollection.stackFrameVariables).toBe(false)
    expect(dataCollection.databaseQueryData).toBe(false)
  })

  it("passes neither tracesSampleRate nor tracesSampler — tracing stays off", async () => {
    const options = await initOptions()

    // Tracing is off unless one of the two is DEFINED, so both must be absent rather than 0.
    // OpenTelemetry spans are a deferred idea for this phase.
    expect("tracesSampleRate" in options).toBe(false)
    expect("tracesSampler" in options).toBe(false)
  })

  it("does not pass sendDefaultPii — deprecated, removed in v11, and defaults to false", async () => {
    const options = await initOptions()

    expect("sendDefaultPii" in options).toBe(false)
  })
})

// ---------------------------------------------------------------------------------------------
// The NEXT_RUNTIME guard — amendment A6, tested here rather than at the repo root
// ---------------------------------------------------------------------------------------------

describe("A6 — the NEXT_RUNTIME guard", () => {
  // vitest.config.ts anchors `include` at `src/**`, so a root-level instrumentation.test.ts is
  // never collected. Rather than widening that config (whose header explains its choices at
  // length), the guard's decision is EXPORTED from this module and asserted here, leaving
  // instrumentation.ts a thin delegator with no logic worth testing.

  it("isNodeRuntime() is true when NEXT_RUNTIME is unset", async () => {
    mockSdk()

    const { isNodeRuntime } = await loadSentry()

    expect(isNodeRuntime()).toBe(true)
  })

  it("isNodeRuntime() is true on the nodejs runtime", async () => {
    process.env.NEXT_RUNTIME = "nodejs"
    mockSdk()

    const { isNodeRuntime } = await loadSentry()

    expect(isNodeRuntime()).toBe(true)
  })

  it("isNodeRuntime() is false on the edge runtime", async () => {
    process.env.NEXT_RUNTIME = "edge"
    mockSdk()

    const { isNodeRuntime } = await loadSentry()

    expect(isNodeRuntime()).toBe(false)
  })

  it("initSentry() returns false on the edge runtime even with a DSN set, without loading the SDK", async () => {
    process.env.SENTRY_DSN = VALID_DSN
    process.env.NEXT_RUNTIME = "edge"
    // The throwing factory again: on the edge the SDK must not be evaluated at all. A top-level
    // value import would drag it into the edge bundle, where `node:` builtins do not exist
    // (T-42-20).
    vi.doMock("@sentry/nextjs", () => {
      throw new Error("@sentry/nextjs must not be imported on the edge runtime")
    })

    const { initSentry } = await loadSentry()

    await expect(initSentry()).resolves.toBe(false)
  })

  it("reportRequestError() on the edge runtime still logs but never touches the SDK", async () => {
    process.env.SENTRY_DSN = VALID_DSN
    const { captureRequestError } = mockSdk()

    const { initSentry, reportRequestError } = await loadSentry()
    await expect(initSentry()).resolves.toBe(true)

    // Same process, now reporting from the edge copy of instrumentation.ts.
    process.env.NEXT_RUNTIME = "edge"
    await reportRequestError(new Error("boom"), REQUEST, CONTEXT)

    expect(captureRequestError).not.toHaveBeenCalled()
    expect(records("error").some((r) => r.scope === "request")).toBe(true)
  })
})
