import { describe, it, expect, vi, beforeEach } from "vitest"
import { validateUrl } from "../ssrf"

// Mock dns.resolve from node:dns/promises
vi.mock("node:dns/promises", () => ({
  resolve: vi.fn(),
}))

import { resolve as dnsResolve } from "node:dns/promises"
const mockDnsResolve = vi.mocked(dnsResolve)

describe("validateUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("blocks requests to 127.0.0.1", async () => {
    mockDnsResolve.mockResolvedValue(["127.0.0.1"])
    await expect(validateUrl("http://127.0.0.1/path")).rejects.toThrow(
      "Blocked: request to private IP"
    )
  })

  it("blocks requests to 10.0.0.0/8", async () => {
    mockDnsResolve.mockResolvedValue(["10.0.0.1"])
    await expect(validateUrl("http://10.0.0.1/path")).rejects.toThrow(
      "Blocked: request to private IP"
    )
  })

  it("blocks requests to 192.168.0.0/16", async () => {
    mockDnsResolve.mockResolvedValue(["192.168.1.1"])
    await expect(validateUrl("http://192.168.1.1/path")).rejects.toThrow(
      "Blocked: request to private IP"
    )
  })

  it("blocks requests to metadata endpoint (169.254.169.254)", async () => {
    mockDnsResolve.mockResolvedValue(["169.254.169.254"])
    await expect(validateUrl("http://169.254.169.254/metadata")).rejects.toThrow(
      "Blocked: request to private IP"
    )
  })

  it("blocks requests to IPv6 loopback [::1]", async () => {
    // ::1 is an IP literal, dns.resolve will fail, so we check directly
    mockDnsResolve.mockRejectedValue(new Error("DNS lookup failed"))
    await expect(validateUrl("http://[::1]/path")).rejects.toThrow(
      "Blocked: request to private IP"
    )
  })

  it("blocks non-http/https protocols", async () => {
    await expect(validateUrl("ftp://example.com")).rejects.toThrow("Blocked protocol")
  })

  it("allows public URLs with http/https", async () => {
    mockDnsResolve.mockResolvedValue(["93.184.216.34"])
    await expect(validateUrl("https://example.com")).resolves.toBeUndefined()
  })

  it("blocks 172.16.0.0/12 range", async () => {
    mockDnsResolve.mockResolvedValue(["172.16.5.10"])
    await expect(validateUrl("http://172.16.5.10/path")).rejects.toThrow(
      "Blocked: request to private IP"
    )
  })

  it("allows 172.32.x.x (outside /12 range)", async () => {
    mockDnsResolve.mockResolvedValue(["172.32.0.1"])
    await expect(validateUrl("http://172.32.0.1/path")).resolves.toBeUndefined()
  })
})
