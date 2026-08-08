export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startWebhookProcessor } = await import("@/lib/webhook-processor")
    startWebhookProcessor()

    const { startEmailProcessor } = await import("@/lib/email-processor")
    startEmailProcessor()

    const { cleanupStaleImportSessions } = await import("@/lib/import/import-session-cleanup")
    await cleanupStaleImportSessions()

    const { registerWebhookSubscriber } = await import("@/lib/events/subscribers/webhook")
    registerWebhookSubscriber()

    const { registerWorkflowTriggerSubscriber } = await import("@/lib/events/subscribers/workflow-trigger")
    registerWorkflowTriggerSubscriber()

    const { startScheduleProcessor } = await import("@/lib/triggers/schedule-processor")
    startScheduleProcessor()

    const { startExecutionProcessor } = await import("@/lib/execution/execution-processor")
    startExecutionProcessor()
  }
}
