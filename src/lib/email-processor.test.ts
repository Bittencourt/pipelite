import { describe, it, expect } from 'vitest'

describe('processActivityReminders', () => {
  it('sends reminders for activities due within 1 hour', () => {
    // TODO: implement in plan 23-04
    expect(true).toBe(false)
  })

  it('skips activities that already have reminderSentAt set', () => {
    // TODO: implement in plan 23-04
    expect(true).toBe(false)
  })

  it('skips activities where user disabled emailActivityReminder', () => {
    // TODO: implement in plan 23-04
    expect(true).toBe(false)
  })
})

describe('processWeeklyDigest', () => {
  it('sends digest on Monday morning for opted-in users', () => {
    // TODO: implement in plan 23-04
    expect(true).toBe(false)
  })

  it('skips digest on non-Monday days', () => {
    // TODO: implement in plan 23-04
    expect(true).toBe(false)
  })

  it('does not send duplicate digest on same Monday', () => {
    // TODO: implement in plan 23-04
    expect(true).toBe(false)
  })
})
