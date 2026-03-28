import { describe, it, expect } from "vitest"
import { formatDuration } from "../format"

describe("formatDuration", () => {
  it("returns '---' when startedAt is null", () => {
    expect(formatDuration(null, null)).toBe("---")
  })

  it("returns milliseconds for sub-second durations", () => {
    const start = new Date("2026-01-01T10:00:00.000Z")
    const end = new Date("2026-01-01T10:00:00.500Z")
    expect(formatDuration(start, end)).toBe("500ms")
  })

  it("returns seconds with one decimal for sub-minute durations", () => {
    const start = new Date("2026-01-01T10:00:00.000Z")
    const end = new Date("2026-01-01T10:00:02.500Z")
    expect(formatDuration(start, end)).toBe("2.5s")
  })

  it("returns minutes and seconds for longer durations", () => {
    const start = new Date("2026-01-01T10:00:00.000Z")
    const end = new Date("2026-01-01T10:02:05.000Z")
    expect(formatDuration(start, end)).toBe("2m 5s")
  })

  it("uses current time when completedAt is null", () => {
    const start = new Date()
    const result = formatDuration(start, null)
    expect(result).toMatch(/^\d+ms$/)
  })
})
