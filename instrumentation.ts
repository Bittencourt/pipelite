export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startWebhookProcessor } = await import("@/lib/webhook-processor")
    startWebhookProcessor()

    const { startEmailProcessor } = await import("@/lib/email-processor")
    startEmailProcessor()

    const { cleanupStaleImportSessions } = await import("@/lib/import/import-session-cleanup")
    await cleanupStaleImportSessions()
  }
}
