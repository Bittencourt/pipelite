import { resolve as dnsResolve } from "node:dns/promises"

const PRIVATE_IPV4_RANGES = [
  { prefix: "127.", mask: null },       // 127.0.0.0/8
  { prefix: "10.", mask: null },        // 10.0.0.0/8
  { prefix: "192.168.", mask: null },   // 192.168.0.0/16
  { prefix: "169.254.", mask: null },   // 169.254.0.0/16 (link-local / metadata)
  { prefix: "0.", mask: null },         // 0.0.0.0/8
]

/**
 * Check if an IPv4 is in the 172.16.0.0/12 range (172.16.x.x - 172.31.x.x).
 */
function isPrivate172(ip: string): boolean {
  if (!ip.startsWith("172.")) return false
  const secondOctet = parseInt(ip.split(".")[1], 10)
  return secondOctet >= 16 && secondOctet <= 31
}

/**
 * Check if an IPv6 address is private/loopback.
 */
function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^\[|]$/g, "")
  if (normalized === "::1") return true
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true // fc00::/7
  if (normalized.startsWith("fe80")) return true // fe80::/10
  return false
}

function isPrivateIP(ip: string): boolean {
  // Check simple prefix matches
  for (const range of PRIVATE_IPV4_RANGES) {
    if (ip.startsWith(range.prefix)) return true
  }
  // Check 172.16.0.0/12
  if (isPrivate172(ip)) return true
  // Check IPv6
  if (isPrivateIPv6(ip)) return true
  return false
}

/**
 * Validate a URL for SSRF prevention.
 * Blocks non-http/https protocols, private IPs, localhost, and metadata endpoints.
 * Resolves hostname via DNS to catch DNS rebinding attempts.
 */
export async function validateUrl(url: string): Promise<void> {
  const parsed = new URL(url)

  // Protocol check
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Blocked protocol: ${parsed.protocol} (only http/https allowed)`)
  }

  // Extract hostname (remove brackets for IPv6)
  const hostname = parsed.hostname.replace(/^\[|]$/g, "")

  // Try DNS resolution to get actual IPs
  let ips: string[]
  try {
    ips = await dnsResolve(hostname)
  } catch {
    // DNS failed -- hostname might be an IP literal
    ips = [hostname]
  }

  for (const ip of ips) {
    if (isPrivateIP(ip)) {
      throw new Error(
        `Blocked: request to private IP (${ip}). HTTP action nodes cannot access internal networks.`
      )
    }
  }
}
