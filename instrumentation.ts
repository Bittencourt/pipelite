export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startWebhookProcessor } = await import("@/lib/webhook-processor")
    startWebhookProcessor()
  }
}
