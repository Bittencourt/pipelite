import { db } from "@/db"
import { domainWhitelist } from "@/db/schema/domain-whitelist"

/**
 * Check if an email domain is allowed for signup
 * - If whitelist is empty, all domains are allowed
 * - If whitelist has entries, email domain must match one
 */
export async function isDomainAllowed(email: string): Promise<boolean> {
  const domain = email.split("@")[1]?.toLowerCase()

  if (!domain) {
    return false
  }

  const whitelist = await db.select().from(domainWhitelist)

  // Empty whitelist = all domains allowed
  if (whitelist.length === 0) {
    return true
  }

  return whitelist.some(
    (entry) => entry.domain.toLowerCase() === domain
  )
}
