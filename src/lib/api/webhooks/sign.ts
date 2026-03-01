import { createHmac } from "crypto"

/**
 * Sign a webhook payload using HMAC SHA-256
 * 
 * @param secret - The webhook secret key
 * @param payload - The JSON stringified payload
 * @returns Signature in format "sha256=<hex>"
 */
export function signWebhook(secret: string, payload: string): string {
  const signature = createHmac("sha256", secret).update(payload).digest("hex")
  return `sha256=${signature}`
}
