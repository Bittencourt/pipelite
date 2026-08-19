export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
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
