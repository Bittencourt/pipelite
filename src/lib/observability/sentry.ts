// src/lib/observability/sentry.ts — OBS-02. Opt-in server-side error tracking.
//
// WHY THIS FILE IS NOT AT THE REPO ROOT.
// Sentry's documented layout puts this configuration in `sentry.server.config.ts` at the project
// root. Everything in this codebase lives under `src/`, and this module is reached only through a
// dynamic import from `instrumentation.ts`, so its location is functionally irrelevant — the
// convention that matters more here is the repository's own.
//
// WHY THE SDK IS ONLY EVER REACHED BY `await import()` (amendment A6, threat T-42-20).
// `instrumentation.ts` is compiled for the EDGE runtime as well as node. Its edge copy is currently
// `async function t(){}` — empty *only* because every dependency sits behind an `await import()`
// inside a `NEXT_RUNTIME` guard. A single top-level value import of `@sentry/nextjs` anywhere in
// that graph would drag the SDK, and its `node:` builtins, into the edge bundle, where they do not
// exist. That is what rules out Sentry's own documented one-liner
// `export const onRequestError = Sentry.captureRequestError`, which needs a top-level import. This
// module is the wrapper that makes the guarded form possible, and it lets `instrumentation.ts` stay
// a thin delegator over exactly two functions.
//
// The same property is what makes OBS-02's negative directly assertable rather than merely assumed:
// with no DSN the SDK is not initialised-and-quiet, it is NEVER LOADED. `sentry.test.ts` proves
// that with a mock factory that throws.
//
// WHAT DOES NOT BELONG HERE: `log.error` is deliberately NOT wired into `captureException`. CONTEXT
// locks this feature to unhandled server errors only. 231 of this repo's 273 log call sites are
// `console.error` inside deliberate swallow-and-log catches, and its server actions return
// `{ success: false, error }` rather than throwing. Coupling the logger to Sentry would ship that
// entire volume — hundreds of handled errors — to a third party (T-42-19).
import { log } from "@/lib/log"

/**
 * Whether `init()` has run successfully, held on `globalThis` rather than in module scope.
 *
 * Amendment A2: `src/lib/events/bus.ts` exists as FOUR independent instances across nine chunks in
 * a real build — two of them inside a single `register()` call — because Turbopack's module cache
 * is keyed by module id and cannot dedupe a module duplicated across graphs. A module-level
 * `let enabled` would therefore read `false` in whichever instance `onRequestError` resolves to,
 * and Sentry would be configured but permanently silent. That failure is indistinguishable from
 * the disabled path, which is precisely the ambiguity this feature is built to remove.
 *
 * Same pattern, same reason, as `src/lib/observability/heartbeat.ts:121-125`,
 * `src/lib/events/bus.ts` and `src/lib/audit/actor-context.ts`. A boolean cannot be captured by
 * reference the way that file captures its `Map`, so it is read and written through the two
 * accessors below rather than bound once at module load.
 */
const g = globalThis as typeof globalThis & { __pipeliteSentryEnabled?: boolean }

function isEnabled(): boolean {
  return g.__pipeliteSentryEnabled === true
}

function setEnabled(value: boolean): void {
  g.__pipeliteSentryEnabled = value
}

/**
 * Whether the caller is running in the Node.js runtime rather than the edge runtime.
 *
 * Exported so amendment A6's guard is testable from `src/**`. `vitest.config.ts` anchors its
 * `include` at `src/**`, so a root-level `instrumentation.test.ts` is never collected; rather than
 * widening that config (whose header explains its choices at length), the decision lives here and
 * `instrumentation.ts` keeps no logic worth testing.
 *
 * An unset `NEXT_RUNTIME` counts as node: the variable is set by Next during a request, and this
 * module is also loaded by vitest and by any plain node process, neither of which is the edge.
 * Bracket notation so no bundler can statically inline the value.
 */
export function isNodeRuntime(): boolean {
  const runtime = typeof process !== "undefined" ? process.env["NEXT_RUNTIME"] : undefined
  return runtime === undefined || runtime === "nodejs"
}

/**
 * Redact e-mail addresses from a URL.
 *
 * `beforeSend` keeps `request.url` — the route is the whole diagnostic value of an error event —
 * but on a CRM a URL routinely carries a person's address, in a path segment or a search query.
 * The percent-encoded alternative is matched too, because a query string carries `%40` rather than
 * a literal `@`.
 */
const EMAIL_IN_URL = /[\w.+-]+(?:@|%40)[\w-]+(?:\.[\w-]+)+/gi

function stripEmails(url: string): string {
  return url.replace(EMAIL_IN_URL, "[redacted-email]")
}

/**
 * Initialise Sentry if — and only if — the operator opted in by setting `SENTRY_DSN`.
 *
 * Returns whether the SDK was initialised. The `await import()` inside the guard is the point:
 * with no DSN, `@sentry/nextjs` is never even EVALUATED. That is the strongest form of OBS-02's
 * negative that code can express, and `sentry.test.ts` asserts it three independent ways.
 *
 * NEVER THROWS (amendment A9). This runs as the first statement of `register()`, before any
 * processor starts. A `SENTRY_DSN` an operator typo'd into something that makes `init()` throw
 * would otherwise abort `register()` and start ZERO workers — the observability feature creating
 * the very outage it exists to reveal. Error tracking is optional by design, so a broken DSN
 * degrades to "no error tracking", never to "no application".
 */
export async function initSentry(): Promise<boolean> {
  const dsn = process.env["SENTRY_DSN"]

  if (!dsn) {
    // Announce-and-return, in the shape of `src/lib/redis.ts:12-15`: the disabled path is logged,
    // not silent, so an operator looking at boot output can see the feature is off rather than
    // broken. The line names the VARIABLE and never a value (T-42-07).
    log.info("sentry", "SENTRY_DSN unset — error tracking disabled, SDK not loaded")
    setEnabled(false)
    return false
  }

  if (!isNodeRuntime()) {
    // A6/T-42-20: reached when the edge copy of `instrumentation.ts` runs. Returning here is what
    // keeps the SDK out of the edge bundle's evaluated set.
    log.info("sentry", "Edge runtime — error tracking initialises in the Node runtime only")
    return false
  }

  try {
    const Sentry = await import("@sentry/nextjs")
    Sentry.init({
      dsn,

      // Tracing is OFF unless `tracesSampleRate` or `tracesSampler` is DEFINED, so both are
      // omitted entirely rather than set to 0. OpenTelemetry spans are a deferred idea for this
      // phase, and turning tracing on would add a second, much larger egress surface.

      // `sendDefaultPii` is not passed: it defaults to false, is deprecated, and is removed in
      // v11. `dataCollection` is the current option and takes precedence over it.
      //
      // This block is SENTRY'S filter. `beforeSend` below is OURS and runs last. Both exist
      // because relying on Sentry-side scrubbing alone would put CRM data on the wire and have it
      // filtered at the far end, and because `beforeSend` can only reach `event.request` — frame
      // locals and span attributes are out of its reach entirely. Defence in depth, in a system
      // whose every record is someone's name, address and deal value.
      dataCollection: {
        // Never populate `user.*` from instrumentation. Defaults to false; set explicitly because
        // the safe default is not optional here.
        userInfo: false,

        // An empty array disables body collection for all four targets. An OMITTED value collects
        // every body type valid for the platform, which on this app means request bodies full of
        // contact records.
        httpBodies: [],

        // `false`, not `{ deny: ["*"] }`. Deny terms are matched as case-insensitive SUBSTRINGS of
        // the key (@sentry/core/build/cjs/utils/data-collection/filterKeyValueData.js:20-28), so
        // `"*"` matches no cookie name at all and would be a silent no-op that collects
        // everything. `false` is the only encoding of "collect none".
        cookies: false,

        // The installed type is `{ request?: CollectBehavior; response?: CollectBehavior }`, NOT a
        // bare `CollectBehavior` — a flat `httpHeaders: { deny: [...] }` does not typecheck, and
        // omitting `response` leaves response headers on their default of `true`. Both halves are
        // therefore spelled out. Substring matching is what makes these short terms cover
        // `x-forwarded-for`, `cf-connecting-ip`, `x-real-ip` and friends.
        httpHeaders: {
          request: {
            deny: ["cookie", "authorization", "forwarded", "-ip", "remote-", "via", "-user"],
          },
          response: {
            deny: ["cookie", "authorization", "set-cookie", "forwarded", "-ip", "-user"],
          },
        },

        // Query strings on this app carry search terms, which are typically a person's name or
        // address.
        urlQueryParams: {
          deny: ["forwarded", "-ip", "remote-", "via", "-user", "email", "token", "q", "search"],
        },

        // Both of the following DEFAULT TO TRUE and neither is reachable by `beforeSend`'s
        // `event.request` deletions — frame locals land under `exception.stacktrace.frames[].vars`
        // and query data under span attributes. On this codebase a captured local is routinely a
        // person or deal row straight out of drizzle, and `databaseQueryData` explicitly covers
        // "inline literal values within query text […] and returned result data".
        stackFrameVariables: false,
        databaseQueryData: false,
      },

      // OUR filter, and the last thing to run before an event is serialised for the wire. Asserted
      // in `sentry.test.ts` on its RETURN VALUE, because a `beforeSend` that mutates the event but
      // forgets to return it drops every event silently — a mutation-only assertion would pass
      // while error tracking was entirely dead.
      beforeSend(event) {
        delete event.user
        if (event.request) {
          delete event.request.data
          delete event.request.cookies
          delete event.request.headers
          if (event.request.url) event.request.url = stripEmails(event.request.url)
        }
        return event
      },
    })

    setEnabled(true)
    log.info("sentry", "Error tracking enabled")
    return true
  } catch (err) {
    // A9. Note what is and is not in this ctx: the error, and nothing else. Not the DSN, whose
    // value is never logged on any path (T-42-07).
    setEnabled(false)
    log.warn("sentry", "Sentry init failed — continuing without error tracking", { err })
    return false
  }
}

/**
 * Report one genuinely unhandled server error, as delivered by Next's `onRequestError` hook.
 *
 * The log line is emitted FIRST and UNCONDITIONALLY. The structured stream is the guaranteed
 * channel; Sentry is the optional one, so an operator who never sets a DSN still loses nothing.
 *
 * `context.routerKind` is optional here but REQUIRED by `@sentry/nextjs`'s own `ErrorContext`
 * (node_modules/@sentry/nextjs/build/types/common/captureRequestError.d.ts:6-10). Next's
 * `RequestErrorContext` always supplies it, so `instrumentation.ts` can forward its argument
 * untouched; the parameter stays optional so a caller with only a route path and type still
 * compiles, and the default reflects the only router this app has (everything lives under
 * `src/app`).
 */
export async function reportRequestError(
  err: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: { routePath: string; routeType: string; routerKind?: string }
): Promise<void> {
  // T-42-18: the fields are picked out ONE AT A TIME. Neither the raw `request` object nor its
  // `headers` map may go into `ctx` — `authorization` and `cookie` live in there, and `ctx` keys
  // are spread FLAT onto the log line, so a whole header map would be dumped verbatim.
  log.error("request", "Unhandled server error", {
    err,
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
  })

  if (!isEnabled()) return
  if (!isNodeRuntime()) return

  try {
    const { captureRequestError } = await import("@sentry/nextjs")
    // Awaited even though the installed signature returns `void`: the SDK has changed this shape
    // before, and an unawaited promise here would report after the process had moved on.
    await captureRequestError(err, request, {
      routerKind: context.routerKind ?? "App Router",
      routePath: context.routePath,
      routeType: context.routeType,
    })
  } catch (reportErr) {
    // This function is the LAST handler in the chain — it runs because something already escaped
    // every other one. A throw here would turn a reported error into an unhandled rejection
    // inside the unhandled-error handler.
    log.warn("sentry", "Failed to forward an unhandled error to Sentry", { err: reportErr })
  }
}
