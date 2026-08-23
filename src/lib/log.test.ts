/**
 * OBS-01 — the structured logger's emitter contract.
 *
 * THIS SUITE PROVES THE EMITTER. IT DOES NOT PROVE ANY CALL SITE USES IT.
 *
 * Everything below exercises `log.*` directly, so it can only show that a call produces one
 * well-formed line on the right console method. Three things it deliberately does NOT prove:
 *
 *   1. That any of the 273 `console.*` call sites were migrated. That is a lint gate
 *      (`no-console` with this file exempted), not a unit test, and it lands in a later plan.
 *   2. That this module is reachable from all four module graphs Next.js builds
 *      (instrumentation/edge, route+server-action, RSC, client bundle). vitest has a SINGLE
 *      module registry, so a module-graph duplication bug of the kind that produced four
 *      `crmBus` instances in one production build (see src/lib/audit/actor-context.ts:30-44)
 *      is structurally invisible here. This module is import-free specifically so it has no
 *      state to duplicate — that property is asserted by a grep in the plan, not by this file.
 *   3. That anything sensitive is kept OUT of `ctx`. The logger serialises what it is handed;
 *      redaction is a call-site responsibility (threat T-42-04, accepted at this layer).
 *
 * What it does pin down, and why each case exists rather than being assumed:
 *
 *   - `JSON.stringify(new Error("x"))` is `"{}"`. `name`, `message` and `stack` are all
 *     non-enumerable, so a logger that trusts `JSON.stringify` annihilates the stack trace on
 *     every `console.error(msg, err)` migration while every other test still passes. The
 *     Error-serialisation block below asserts the stack SURVIVES, and separately asserts the
 *     serialised value is not deep-equal to `{}` — the exact shape the naive implementation emits.
 *   - Delegation to the matching `console` method. 40 test files hold 89 `vi.spyOn(console, …)`
 *     calls. `process.stdout.write` would break all 89 at once and would not exist in the edge
 *     runtime or the browser. The delegation block asserts both the method that must be called
 *     and methods that must NOT be.
 *   - A logger must never throw. A throw inside a `catch` block converts a handled error into an
 *     unhandled one, so a circular reference or a BigInt in `ctx` must still yield a line.
 *   - One call is one line. A newline inside a user-controlled `ctx` value must not be able to
 *     forge a second JSON log record once these lines are machine-parsed (threat T-42-05).
 *
 * The module is loaded with `await import("./log")` inside each test rather than a top-level
 * import — the convention in src/lib/email/send.test.ts — so that a missing or broken module
 * surfaces as per-test failures instead of one collection error that hides the assertion count.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

/** The line cap the implementation must enforce; Docker's json-file driver splits at 16 KB. */
const MAX_LINE = 8_000

type Spy = ReturnType<typeof vi.fn>

async function loadLog() {
  const mod = await import("./log")
  return mod.log
}

function spyFor(method: "log" | "warn" | "error" | "debug"): Spy {
  return console[method] as unknown as Spy
}

/** Every argument of the most recent call on a console method. */
function lastCall(method: "log" | "warn" | "error" | "debug"): unknown[] {
  const calls = spyFor(method).mock.calls
  if (calls.length === 0) throw new Error(`console.${method} was never called`)
  return calls[calls.length - 1] as unknown[]
}

/** The single string argument of the most recent call — asserts the arity while it reads it. */
function lastLine(method: "log" | "warn" | "error" | "debug"): string {
  const args = lastCall(method)
  expect(args).toHaveLength(1)
  expect(typeof args[0]).toBe("string")
  return args[0] as string
}

/** The most recent line, parsed. Assertions then read as field checks, not string matches. */
function lastRecord(
  method: "log" | "warn" | "error" | "debug"
): Record<string, unknown> {
  return JSON.parse(lastLine(method)) as Record<string, unknown>
}

function callCounts(): { log: number; warn: number; error: number; debug: number } {
  return {
    log: spyFor("log").mock.calls.length,
    warn: spyFor("warn").mock.calls.length,
    error: spyFor("error").mock.calls.length,
    debug: spyFor("debug").mock.calls.length,
  }
}

const originalEnv = process.env

beforeEach(() => {
  process.env = { ...originalEnv }
  // Deleted rather than left alone: the default-level cases below are only meaningful if the
  // ambient environment cannot set this.
  delete process.env.LOG_LEVEL

  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "debug").mockImplementation(() => {})
})

afterEach(() => {
  process.env = originalEnv
  vi.restoreAllMocks()
})

describe("log — line shape", () => {
  it("emits exactly one console call carrying exactly one string argument", async () => {
    const log = await loadLog()

    log.info("scope-a", "hello")

    expect(spyFor("log")).toHaveBeenCalledTimes(1)
    expect(lastCall("log")).toHaveLength(1)
    expect(typeof lastCall("log")[0]).toBe("string")
  })

  it("emits parseable JSON carrying level, scope, msg and an ISO-8601 ts", async () => {
    const log = await loadLog()

    log.info("scope-a", "hello")

    const record = lastRecord("log")
    expect(record.level).toBe("info")
    expect(record.scope).toBe("scope-a")
    expect(record.msg).toBe("hello")
    expect(record.ts).toMatch(ISO)
  })

  it("spreads ctx keys onto the top level rather than nesting them under ctx", async () => {
    const log = await loadLog()

    log.info("s", "m", { count: 3 })

    const record = lastRecord("log")
    expect(record.count).toBe(3)
    expect(record.ctx).toBeUndefined()
  })

  it("emits a single line — the string contains no newline", async () => {
    const log = await loadLog()

    log.info("s", "m", { note: "plain" })

    const line = lastLine("log")
    expect(line.includes("\n")).toBe(false)
    expect(line.split("\n")).toHaveLength(1)
  })
})

describe("log — LOG_LEVEL gating", () => {
  it("defaults to info: debug is suppressed, info/warn/error all emit", async () => {
    const log = await loadLog()

    log.debug("s", "d")
    expect(callCounts().debug).toBe(0)

    log.info("s", "i")
    log.warn("s", "w")
    log.error("s", "e")

    // Load-bearing default. 11 of the suite's 89 existing console spies assert on console.log;
    // a default above info would silence every migrated console.log and break all of them.
    expect(callCounts()).toEqual({ log: 1, warn: 1, error: 1, debug: 0 })
  })

  it("LOG_LEVEL=warn suppresses debug and info while warn and error still emit", async () => {
    process.env.LOG_LEVEL = "warn"
    const log = await loadLog()

    log.debug("s", "d")
    log.info("s", "i")
    log.warn("s", "w")
    log.error("s", "e")

    expect(callCounts()).toEqual({ log: 0, warn: 1, error: 1, debug: 0 })
  })

  it("LOG_LEVEL=silent mutes every level — zero console calls", async () => {
    process.env.LOG_LEVEL = "silent"
    const log = await loadLog()

    log.debug("s", "d")
    log.info("s", "i")
    log.warn("s", "w")
    log.error("s", "e")

    expect(callCounts()).toEqual({ log: 0, warn: 0, error: 0, debug: 0 })
  })

  it("an unrecognised LOG_LEVEL falls back to info instead of throwing", async () => {
    process.env.LOG_LEVEL = "nonsense"
    const log = await loadLog()

    // A typo in an operator's .env must not take the app down.
    expect(() => log.info("s", "i")).not.toThrow()
    log.debug("s", "d")
    log.warn("s", "w")
    log.error("s", "e")

    expect(callCounts()).toEqual({ log: 1, warn: 1, error: 1, debug: 0 })
  })

  it("reads LOG_LEVEL on every call rather than memoising it at module load", async () => {
    const log = await loadLog()

    log.info("s", "first")
    expect(callCounts().log).toBe(1)

    process.env.LOG_LEVEL = "silent"
    log.info("s", "second")

    // Still 1: the second call must obey the mutated value, with no module reload.
    expect(callCounts().log).toBe(1)

    process.env.LOG_LEVEL = "debug"
    log.debug("s", "third")
    expect(callCounts().debug).toBe(1)
  })
})

describe("log — Error serialization (amendment A3)", () => {
  it("round-trips an Error's name, message AND stack", async () => {
    const log = await loadLog()

    log.error("s", "boom", { err: new Error("kaput") })

    const err = lastRecord("error").err as Record<string, unknown>
    expect(err.name).toBe("Error")
    expect(err.message).toBe("kaput")
    expect(typeof err.stack).toBe("string")
    expect((err.stack as string).length).toBeGreaterThan(0)
    expect(err.stack as string).toContain("kaput")
  })

  it("does not emit the empty object a bare JSON.stringify would produce", async () => {
    const log = await loadLog()

    // JSON.stringify(new Error("kaput")) === "{}" — name/message/stack are non-enumerable.
    // This assertion is the whole reason serialize() exists.
    expect(JSON.stringify(new Error("kaput"))).toBe("{}")

    log.error("s", "boom", { err: new Error("kaput") })

    const err = lastRecord("error").err
    expect(err).not.toEqual({})
    expect(Object.keys(err as object).length).toBeGreaterThan(0)
  })

  it("serialises a cause chain", async () => {
    const log = await loadLog()

    log.error("s", "boom", {
      err: new Error("outer", { cause: new Error("inner") }),
    })

    const err = lastRecord("error").err as Record<string, unknown>
    expect(err.message).toBe("outer")
    const cause = err.cause as Record<string, unknown>
    expect(cause.message).toBe("inner")
    expect(typeof cause.stack).toBe("string")
  })

  it("terminates a cause chain deeper than the depth cap without throwing", async () => {
    const log = await loadLog()

    let deep = new Error("level-0")
    for (let i = 1; i <= 10; i++) deep = new Error(`level-${i}`, { cause: deep })

    expect(() => log.error("s", "deep", { err: deep })).not.toThrow()

    // Walk the emitted chain with a hard bound: if the implementation recursed without a cap
    // the JSON would be 11 deep, and an unbounded walk over a cyclic chain would never end.
    let node = lastRecord("error").err as Record<string, unknown> | undefined
    let depth = 0
    while (node && node.cause !== undefined && depth < 20) {
      node = node.cause as Record<string, unknown>
      depth++
    }
    expect(depth).toBeLessThan(20)
    expect(depth).toBeLessThanOrEqual(4)
  })

  it("survives a cyclic cause chain", async () => {
    const log = await loadLog()

    const a = new Error("a")
    const b = new Error("b", { cause: a })
    ;(a as Error & { cause?: unknown }).cause = b

    expect(() => log.error("s", "cyclic", { err: a })).not.toThrow()
    expect(spyFor("error")).toHaveBeenCalledTimes(1)
    expect(lastLine("error").includes("\n")).toBe(false)
  })

  it("passes non-Error ctx values through unchanged", async () => {
    const log = await loadLog()

    log.info("s", "m", {
      text: "hello",
      count: 42,
      flag: false,
      nested: { a: 1, b: ["x", "y"] },
      nothing: null,
    })

    const record = lastRecord("log")
    expect(record.text).toBe("hello")
    expect(record.count).toBe(42)
    expect(record.flag).toBe(false)
    expect(record.nested).toEqual({ a: 1, b: ["x", "y"] })
    expect(record.nothing).toBeNull()
  })
})

describe("log — console delegation (amendment A3)", () => {
  it("log.error lands on console.error and on nothing else", async () => {
    const log = await loadLog()

    log.error("s", "m")

    expect(callCounts()).toEqual({ log: 0, warn: 0, error: 1, debug: 0 })
    expect(spyFor("log")).not.toHaveBeenCalled()
    expect(spyFor("warn")).not.toHaveBeenCalled()
    expect(spyFor("debug")).not.toHaveBeenCalled()
  })

  it("log.warn lands on console.warn and on nothing else", async () => {
    const log = await loadLog()

    log.warn("s", "m")

    expect(callCounts()).toEqual({ log: 0, warn: 1, error: 0, debug: 0 })
    expect(spyFor("error")).not.toHaveBeenCalled()
    expect(spyFor("log")).not.toHaveBeenCalled()
  })

  it("log.debug lands on console.debug and on nothing else", async () => {
    process.env.LOG_LEVEL = "debug"
    const log = await loadLog()

    log.debug("s", "m")

    expect(callCounts()).toEqual({ log: 0, warn: 0, error: 0, debug: 1 })
    expect(spyFor("log")).not.toHaveBeenCalled()
    expect(spyFor("error")).not.toHaveBeenCalled()
  })

  it("log.info lands on console.log and on nothing else", async () => {
    const log = await loadLog()

    log.info("s", "m")

    expect(callCounts()).toEqual({ log: 1, warn: 0, error: 0, debug: 0 })
    expect(spyFor("debug")).not.toHaveBeenCalled()
    expect(spyFor("error")).not.toHaveBeenCalled()
  })
})

describe("log — throw-safety", () => {
  it("emits a marked line for a circular ctx object instead of throwing", async () => {
    const log = await loadLog()

    const circular: Record<string, unknown> = { name: "loop" }
    circular.self = circular

    expect(() => log.error("s", "circular", { payload: circular })).not.toThrow()

    const record = lastRecord("error")
    expect(record.level).toBe("error")
    expect(record.scope).toBe("s")
    expect(record.msg).toBe("circular")
    expect(record.ts).toMatch(ISO)
    expect(record.ctxUnserializable).toBe(true)
  })

  it("does not throw on a BigInt in ctx", async () => {
    const log = await loadLog()

    // `BigInt("…")` rather than a `9007199254740993n` literal: tsconfig targets ES2017, where
    // the literal syntax is a compile error (TS2737) even though the global exists at runtime.
    expect(() => log.info("s", "big", { size: BigInt("9007199254740993") })).not.toThrow()

    const record = lastRecord("log")
    expect(record.scope).toBe("s")
    expect(record.msg).toBe("big")
    expect(record.ctxUnserializable).toBe(true)
  })

  it("truncates an oversized payload to a valid line under the cap", async () => {
    const log = await loadLog()

    log.info("s", "huge", { blob: "x".repeat(50_000) })

    const line = lastLine("log")
    expect(line.length).toBeLessThanOrEqual(MAX_LINE)
    expect(line.includes("\n")).toBe(false)

    const record = JSON.parse(line) as Record<string, unknown>
    expect(record.level).toBe("info")
    expect(record.scope).toBe("s")
    expect(record.msg).toBe("huge")
    expect(record.ts).toMatch(ISO)
    expect(record.truncated).toBe(true)
    expect(record.blob).toBeUndefined()
  })
})

describe("log — log injection (threat T-42-05)", () => {
  it("a newline-bearing ctx value cannot forge a second log record", async () => {
    const log = await loadLog()

    const forgery = '\n{"level":"error","scope":"forged","msg":"pwned"}'
    log.info("real-scope", "user input", { payload: forgery })

    const line = lastLine("log")

    // One call, one line: no raw newline anywhere in the emitted string.
    expect(spyFor("log")).toHaveBeenCalledTimes(1)
    expect(line.includes("\n")).toBe(false)
    expect(line.split("\n")).toHaveLength(1)

    // And the one record it parses to is the real one, not the injected one.
    const record = JSON.parse(line) as Record<string, unknown>
    expect(record.scope).toBe("real-scope")
    expect(record.scope).not.toBe("forged")
    expect(record.msg).toBe("user input")

    // The value survives intact — escaped in transport, not stripped.
    expect(record.payload).toBe(forgery)
  })

  it("a newline in the scope or msg itself cannot break the line either", async () => {
    const log = await loadLog()

    log.error('sco\npe', 'ms\ng {"level":"info"}')

    const line = lastLine("error")
    expect(line.includes("\n")).toBe(false)

    const record = JSON.parse(line) as Record<string, unknown>
    expect(record.level).toBe("error")
    expect(record.scope).toBe("sco\npe")
  })
})
