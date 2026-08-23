// src/lib/log.ts — OBS-01. The structured logger every `console.*` call site migrates onto.
//
// This module imports NOTHING, by design and permanently.
//
// It is reachable from four distinct module graphs that Next.js builds separately: the
// `instrumentation.ts` graph (which is compiled for the EDGE runtime as well as node), the
// route + server-action graph, the RSC render graph, and the CLIENT bundle. Any dependency added
// here is pulled into all four, and anything node-only added here breaks the edge and browser
// copies. That is the same rule, for the same reason, as `src/lib/audit/actor-context.ts:6-9`.
//
// Concretely, the only primitives available in every one of those runtimes are `console.*`,
// `JSON.stringify`, `Date`, and a guarded `process.env` read. So: no `node:` imports, no
// `process.stdout`, no `fs`, no `Buffer`. Keep it that way.
//
// Being import-free also means this module holds no state, which is why it needs none of the
// `globalThis` singleton machinery that `actor-context.ts` and `crmBus` require — there is
// nothing here for a duplicated module instance to disagree about.
//
// This is also the ONLY module exempted from the `no-console` ESLint rule. (The rule and the
// exemption both land in a later plan; the console calls below are legal today either way.)

type Level = "debug" | "info" | "warn" | "error"

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }

/**
 * The minimum numeric level that will be emitted, resolved on EVERY call.
 *
 * Bracket notation (`process.env["LOG_LEVEL"]`) rather than dotted access so that no bundler can
 * statically inline the value into the client chunk. Read per call rather than memoised at module
 * load for two reasons: a test needs a mutation of `process.env.LOG_LEVEL` to take effect without
 * a module reload, and a property read costs nothing next to the `JSON.stringify` that follows.
 * The `typeof process` guard is for the browser, where `process` may be absent entirely.
 *
 * Accepted values: `debug | info | warn | error | silent`. The default is `info`, and that default
 * is load-bearing rather than arbitrary — the existing suite holds 89 `console` spies, 11 of them
 * asserting on `console.log`. A default of `warn` would silence every migrated `console.log` →
 * `log.info` and break all eleven.
 *
 * An unrecognised value falls back to `info` instead of throwing: a typo in an operator's `.env`
 * must not take the application down.
 */
function threshold(): number {
  const raw = typeof process !== "undefined" ? process.env["LOG_LEVEL"] : undefined
  if (raw === "silent") return Number.POSITIVE_INFINITY
  return ORDER[(raw as Level) in ORDER ? (raw as Level) : "info"]
}

/** Deepest `cause` link that is followed. Bounds both long and CYCLIC cause chains. */
const MAX_CAUSE_DEPTH = 3

/**
 * Convert one `ctx` value into something `JSON.stringify` can represent faithfully.
 *
 * `JSON.stringify(new Error("x"))` is `"{}"` — `name`, `message` and `stack` are all
 * NON-ENUMERABLE own properties, so the default serialiser sees an object with no keys. Without
 * this function, migrating the 231 `console.error(msg, err)` call sites silently DESTROYS every
 * stack trace in the codebase — the single most valuable field in the log — while every existing
 * test continues to pass. That is the largest regression risk in this phase, which is why the
 * `Error` branch is explicit and why `src/lib/log.test.ts` asserts that a stack survives the
 * round trip AND that the result is not deep-equal to `{}`.
 *
 * `cause` is followed recursively because wrapped errors are where the actual failure lives, and
 * capped because a cause chain can be cyclic (`a.cause = b; b.cause = a` is legal and does occur
 * in retry wrappers) — an uncapped walk would recurse until the stack blew.
 */
function serialize(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...(value.cause !== undefined && depth < MAX_CAUSE_DEPTH
        ? { cause: serialize(value.cause, depth + 1) }
        : {}),
    }
  }
  return value
}

/**
 * Hard cap on the emitted line length.
 *
 * Docker's `json-file` logging driver splits a log line at 16 KB, producing two fragments that are
 * each invalid JSON. Once these lines are machine-parsed that corrupts the stream, so stay well
 * under the split threshold and emit a deliberately reduced line instead.
 */
const MAX_LINE = 8_000

function emit(level: Level, scope: string, msg: string, ctx?: Record<string, unknown>): void {
  if (ORDER[level] < threshold()) return

  let line: string
  try {
    // Key order is fixed so the common fields are greppable at a fixed position in the line;
    // `ctx` keys are spread last and flat, never nested under a `ctx` wrapper.
    const fields: Record<string, unknown> = { level, scope, msg, ts: new Date().toISOString() }
    for (const [k, v] of Object.entries(ctx ?? {})) fields[k] = serialize(v)

    // `JSON.stringify` is also the log-injection control (T-42-05): it escapes `\n` inside every
    // string it writes, so a newline in a user-controlled `ctx` value — or in `scope` or `msg` —
    // cannot terminate this record and forge a second one. One call is one line, always.
    line = JSON.stringify(fields)

    if (line.length > MAX_LINE) {
      line = JSON.stringify({ level, scope, msg, ts: fields.ts, truncated: true })
    }
  } catch {
    // A LOGGER MUST NEVER THROW. Most log calls sit inside a `catch` block, so a throw here
    // converts a handled error into an unhandled one and takes down whatever was recovering.
    // Both circular references and `BigInt` values make `JSON.stringify` throw, and drizzle /
    // postgres.js error objects are a realistic source of each.
    line = JSON.stringify({
      level,
      scope,
      msg,
      ts: new Date().toISOString(),
      ctxUnserializable: true,
    })
  }

  // DELEGATE TO THE MATCHING `console` METHOD. Never `process.stdout.write`.
  //
  // Two independent reasons, both load-bearing:
  //   1. 40 test files hold 89 `vi.spyOn(console, …)` calls (71 on error, 11 on log, 7 on warn).
  //      Delegating keeps every silencing spy and 86 of the 89 assertions working untouched,
  //      reducing the migration's test fallout to exactly 3 argument-shape assertions. Writing to
  //      stdout directly would break all 89 at once.
  //   2. `process.stdout` does not exist in the edge runtime or in the browser, and this module
  //      must stay importable from both.
  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else if (level === "debug") console.debug(line)
  else console.log(line)
}

/**
 * The whole public surface: four verbs, each `(scope, msg, ctx?)`.
 *
 * `emit`, `serialize` and `threshold` are deliberately NOT exported — a call site that reaches for
 * them is a call site building a second, divergent line format.
 *
 *   log.error("trash-prune", "Tick error", { err: error })
 *   → {"level":"error","scope":"trash-prune","msg":"Tick error","ts":"…","err":{"name":…,"stack":…}}
 */
export const log = {
  debug: (scope: string, msg: string, ctx?: Record<string, unknown>) =>
    emit("debug", scope, msg, ctx),
  info: (scope: string, msg: string, ctx?: Record<string, unknown>) =>
    emit("info", scope, msg, ctx),
  warn: (scope: string, msg: string, ctx?: Record<string, unknown>) =>
    emit("warn", scope, msg, ctx),
  error: (scope: string, msg: string, ctx?: Record<string, unknown>) =>
    emit("error", scope, msg, ctx),
}
