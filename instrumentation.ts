/**
 * NO TOP-LEVEL VALUE IMPORTS IN THIS FILE, EVER.
 *
 * Next compiles this module TWICE — once for the Node runtime and once for the EDGE runtime. The
 * edge copy is currently `async function t(){}`, an empty function (verified in
 * `.next/server/edge/chunks/_52aa5b93._.js`), and it is empty ONLY because every dependency sits
 * behind an `await import()` inside the `process.env.NEXT_RUNTIME === "nodejs"` guard below.
 *
 * That is what rules out Sentry's own documented one-liner,
 * `export const onRequestError = Sentry.captureRequestError`: it needs a top-level
 * `import * as Sentry from "@sentry/nextjs"`, which would pull the SDK — and its `node:` builtins,
 * which the edge runtime does not have — into the edge bundle. Bigger bundle at best, a failed
 * build at worst. Amendment A6.
 *
 * Type-only imports are fine, because they are erased and reach neither bundle. Hence the one
 * import below, and nothing else, ever.
 */
import type { Instrumentation } from "next"

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // FIRST STATEMENT, before any worker starts, so a throw during processor startup is captured
    // rather than lost. Awaiting it cannot abort the twelve blocks below: `initSentry` NEVER
    // THROWS — amendment A9 puts Sentry's `init()` inside a try/catch in that module — so a
    // `SENTRY_DSN` an operator typo'd degrades to "no error tracking", never to "no processors".
    // With no DSN set (the default) `@sentry/nextjs` is not even evaluated.
    const { initSentry } = await import("@/lib/observability/sentry")
    await initSentry()

    const { startWebhookProcessor } = await import("@/lib/webhook-processor")
    startWebhookProcessor()

    const { startEmailProcessor } = await import("@/lib/email-processor")
    startEmailProcessor()

    const { cleanupStaleImportSessions } = await import("@/lib/import/import-session-cleanup")
    await cleanupStaleImportSessions()

    const { cleanupStaleDedupScans } = await import("@/lib/dedup/scan-cleanup")
    await cleanupStaleDedupScans()

    const { registerWebhookSubscriber } = await import("@/lib/events/subscribers/webhook")
    registerWebhookSubscriber()

    const { registerWorkflowTriggerSubscriber } = await import("@/lib/events/subscribers/workflow-trigger")
    registerWorkflowTriggerSubscriber()

    const { registerStageHistorySubscriber } = await import("@/lib/events/subscribers/stage-history")
    registerStageHistorySubscriber()

    const { registerAuditSubscriber } = await import("@/lib/events/subscribers/audit")
    registerAuditSubscriber()

    const { startScheduleProcessor } = await import("@/lib/triggers/schedule-processor")
    startScheduleProcessor()

    const { startExecutionProcessor } = await import("@/lib/execution/execution-processor")
    startExecutionProcessor()

    const { startAuditPruner } = await import("@/lib/audit/prune")
    startAuditPruner()

    // REGISTRATION HERE IS NOT EVIDENCE OF EXECUTION. `Dockerfile:24` copies the built
    // `instrumentation.js` into `.next/standalone/` with a step that ends in `2>/dev/null || true`,
    // so a build whose chunk layout changes fails silently and this whole function never runs. That
    // exact breakage killed all four processors in production on 2026-08-08 while every test passed.
    // The gate is behavioural: `docker compose logs app | grep -F '[trash-prune] Starting'`.
    const { startTrashPruner } = await import("@/lib/trash/prune")
    startTrashPruner()
  }
}

/**
 * The ONLY seam Next.js offers that sees render, route, action and proxy errors uniformly:
 * `RequestErrorContext.routeType` is `'render' | 'route' | 'action' | 'proxy'`, declared in
 * `node_modules/next/dist/server/instrumentation/types.d.ts`. It replaces per-call-site wrapping
 * entirely, which is why nothing under `src/app` imports Sentry.
 *
 * Guarded and dynamically imported for the reason in this file's header — `@/lib/observability/
 * sentry` must not be reachable from the top level of a module that is also compiled for the edge
 * runtime. Both of that module's exports also short-circuit on their own `isNodeRuntime()` check,
 * so the guard below is protecting the BUNDLE, not the behaviour. This handler stays a three-line
 * delegator on purpose: `vitest.config.ts` anchors `include` at `src/**`, so a root-level test file
 * is never collected, and any logic worth testing belongs in `src/lib/observability/sentry.ts`
 * where `sentry.test.ts` covers it.
 *
 * SCOPE — this fires only for GENUINELY UNHANDLED errors. This repo's deliberate swallow-and-log
 * catches and its `{ success: false, error }` server actions never reach it, and that is the
 * design: `@/lib/log` is the channel for handled errors and Sentry catches the residue. Do not
 * "fix" the apparent gap by wiring `log.error` into `captureException`.
 *
 * NOT CAPTURED: errors thrown INSIDE edge middleware. This hook does not run for the edge runtime,
 * and middleware here is only next-auth's `authorized` callback (`src/middleware.ts:4`,
 * `src/auth.config.ts:27-52`).
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  // All three arguments forwarded UNTOUCHED. `reportRequestError` owns the field selection — it
  // picks `path`, `method`, `routePath` and `routeType` out one at a time and never lets the
  // `headers` map, which carries `authorization` and `cookie`, into a log `ctx` (T-42-18). Keeping
  // that decision in one reviewable place is the whole reason this file adds nothing.
  const { reportRequestError } = await import("@/lib/observability/sentry")
  await reportRequestError(err, request, context)
}
