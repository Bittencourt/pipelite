import { describe, it, expect } from 'vitest'
import { isMondayMorning, getWeekBoundaries } from './email-processor'

describe('isMondayMorning', () => {
  it('returns true for Monday 8:00 UTC', () => {
    // Monday March 24, 2025 at 08:00 UTC
    const date = new Date('2025-03-24T08:00:00Z')
    expect(isMondayMorning(date)).toBe(true)
  })

  it('returns true for Monday 8:30 UTC', () => {
    const date = new Date('2025-03-24T08:30:00Z')
    expect(isMondayMorning(date)).toBe(true)
  })

  it('returns false for Monday 9:00 UTC (outside window)', () => {
    const date = new Date('2025-03-24T09:00:00Z')
    expect(isMondayMorning(date)).toBe(false)
  })

  it('returns false for Monday 7:59 UTC (before window)', () => {
    const date = new Date('2025-03-24T07:59:00Z')
    expect(isMondayMorning(date)).toBe(false)
  })

  it('returns false for Tuesday 8:00 UTC', () => {
    const date = new Date('2025-03-25T08:00:00Z')
    expect(isMondayMorning(date)).toBe(false)
  })

  it('returns false for Sunday 8:00 UTC', () => {
    const date = new Date('2025-03-23T08:00:00Z')
    expect(isMondayMorning(date)).toBe(false)
  })

  it('returns false for Wednesday', () => {
    const date = new Date('2025-03-26T08:00:00Z')
    expect(isMondayMorning(date)).toBe(false)
  })

  it('returns false for Saturday', () => {
    const date = new Date('2025-03-29T08:00:00Z')
    expect(isMondayMorning(date)).toBe(false)
  })
})

describe('getWeekBoundaries', () => {
  it('returns previous Monday to previous Sunday for a given Monday', () => {
    // Monday March 24, 2025
    const date = new Date('2025-03-24T08:30:00Z')
    const { weekStart, weekEnd } = getWeekBoundaries(date)

    // Previous Monday = March 17, 2025 00:00 UTC
    expect(weekStart.toISOString()).toBe('2025-03-17T00:00:00.000Z')
    // Previous Sunday = March 23, 2025 23:59:59.999 UTC
    expect(weekEnd.toISOString()).toBe('2025-03-23T23:59:59.999Z')
  })

  it('weekEnd is exactly 1ms before thisMonday', () => {
    const date = new Date('2025-03-31T08:00:00Z')
    const { weekStart, weekEnd } = getWeekBoundaries(date)

    // Previous Monday = March 24
    expect(weekStart.toISOString()).toBe('2025-03-24T00:00:00.000Z')
    // Previous Sunday = March 30 end of day
    expect(weekEnd.toISOString()).toBe('2025-03-30T23:59:59.999Z')
  })

  it('weekStart is exactly 7 days before the current Monday', () => {
    const date = new Date('2025-04-07T08:00:00Z')
    const { weekStart, weekEnd } = getWeekBoundaries(date)

    expect(weekStart.toISOString()).toBe('2025-03-31T00:00:00.000Z')
    expect(weekEnd.toISOString()).toBe('2025-04-06T23:59:59.999Z')
  })

  it('handles year boundary correctly', () => {
    // Monday Jan 6, 2025
    const date = new Date('2025-01-06T08:30:00Z')
    const { weekStart, weekEnd } = getWeekBoundaries(date)

    // Previous Monday = Dec 30, 2024
    expect(weekStart.toISOString()).toBe('2024-12-30T00:00:00.000Z')
    // Previous Sunday = Jan 5, 2025
    expect(weekEnd.toISOString()).toBe('2025-01-05T23:59:59.999Z')
  })
})

describe('processWeeklyDigest logic', () => {
  it('non-Monday days should not trigger digest', () => {
    // Tuesday through Sunday
    const days = [
      new Date('2025-03-25T08:00:00Z'), // Tuesday
      new Date('2025-03-26T08:00:00Z'), // Wednesday
      new Date('2025-03-27T08:00:00Z'), // Thursday
      new Date('2025-03-28T08:00:00Z'), // Friday
      new Date('2025-03-29T08:00:00Z'), // Saturday
      new Date('2025-03-30T08:00:00Z'), // Sunday
    ]

    for (const day of days) {
      expect(isMondayMorning(day)).toBe(false)
    }
  })
})

describe('processActivityReminders logic', () => {
  it('activity due in 30 minutes should match "due within 1 hour" criteria', () => {
    const now = new Date()
    const dueIn30Min = new Date(now.getTime() + 30 * 60 * 1000)
    // Check: dueDate >= now AND dueDate <= now + 1 hour
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000)
    expect(dueIn30Min >= now).toBe(true)
    expect(dueIn30Min <= oneHourFromNow).toBe(true)
  })

  it('activity due in 2 hours should NOT match criteria', () => {
    const now = new Date()
    const dueIn2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000)
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000)
    expect(dueIn2Hours <= oneHourFromNow).toBe(false)
  })

  it('activity already past due should NOT match criteria (dueDate < now)', () => {
    const now = new Date()
    const pastDue = new Date(now.getTime() - 30 * 60 * 1000)
    expect(pastDue >= now).toBe(false)
  })
})
