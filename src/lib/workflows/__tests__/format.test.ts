import { describe, it, expect, vi } from "vitest"
import { formatDuration } from "../format"

describe("formatDuration", () => {
  it("returns '---' when startedAt is null", () => {
    expect(formatDuration(null, null)).toBe("---")
  })

  it("formats sub-second durations as milliseconds", () => {
    const start = new Date("2026-03-28T10:00:00.000Z")
    const end = new Date("2026-03-28T10:00:00.245Z")
    expect(formatDuration(start, end)).toBe("245ms")
  })

  it("formats zero duration as 0ms", () => {
    const start = new Date("2026-03-28T10:00:00.000Z")
    const end = new Date("2026-03-28T10:00:00.000Z")
    expect(formatDuration(start, end)).toBe("0ms")
  })

  it("formats sub-minute durations as seconds with one decimal", () => {
    const start = new Date("2026-03-28T10:00:00.000Z")
    const end = new Date("2026-03-28T10:00:02.300Z")
    expect(formatDuration(start, end)).toBe("2.3s")
  })

  it("formats exactly 1 second", () => {
    const start = new Date("2026-03-28T10:00:00.000Z")
    const end = new Date("2026-03-28T10:00:01.000Z")
    expect(formatDuration(start, end)).toBe("1.0s")
  })

  it("formats durations >= 1 minute as minutes and seconds", () => {
    const start = new Date("2026-03-28T10:00:00.000Z")
    const end = new Date("2026-03-28T10:01:12.000Z")
    expect(formatDuration(start, end)).toBe("1m 12s")
  })

  it("formats multi-minute durations", () => {
    const start = new Date("2026-03-28T10:00:00.000Z")
    const end = new Date("2026-03-28T10:05:30.000Z")
    expect(formatDuration(start, end)).toBe("5m 30s")
  })

  it("uses current time when completedAt is null", () => {
    const now = new Date("2026-03-28T10:00:05.000Z")
    vi.useFakeTimers()
    vi.setSystemTime(now)

    const start = new Date("2026-03-28T10:00:00.000Z")
    expect(formatDuration(start, null)).toBe("5.0s")

    vi.useRealTimers()
  })
})
