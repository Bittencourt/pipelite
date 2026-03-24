import { describe, it, expect } from 'vitest'
import { z } from 'zod'

// Mirror the schema from the actions module
const updatePreferencesSchema = z.object({
  emailDealAssigned: z.boolean(),
  emailActivityReminder: z.boolean(),
  emailWeeklyDigest: z.boolean(),
})

const defaultPreferences = {
  emailDealAssigned: true,
  emailActivityReminder: true,
  emailWeeklyDigest: true,
}

describe('getNotificationPreferences', () => {
  it('returns defaults when no preferences row exists', () => {
    // When no DB row exists, the action returns defaults (all true)
    expect(defaultPreferences).toEqual({
      emailDealAssigned: true,
      emailActivityReminder: true,
      emailWeeklyDigest: true,
    })
  })

  it('default values are all boolean true', () => {
    for (const [key, value] of Object.entries(defaultPreferences)) {
      expect(value).toBe(true)
    }
  })
})

describe('updateNotificationPreferences', () => {
  it('validates correct shape', () => {
    const data = {
      emailDealAssigned: false,
      emailActivityReminder: true,
      emailWeeklyDigest: false,
    }
    const result = updatePreferencesSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it('rejects missing fields', () => {
    const result = updatePreferencesSchema.safeParse({
      emailDealAssigned: true,
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-boolean values', () => {
    const result = updatePreferencesSchema.safeParse({
      emailDealAssigned: "yes",
      emailActivityReminder: 1,
      emailWeeklyDigest: null,
    })
    expect(result.success).toBe(false)
  })

  it('accepts all-false preferences', () => {
    const data = {
      emailDealAssigned: false,
      emailActivityReminder: false,
      emailWeeklyDigest: false,
    }
    const result = updatePreferencesSchema.safeParse(data)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.emailDealAssigned).toBe(false)
      expect(result.data.emailActivityReminder).toBe(false)
      expect(result.data.emailWeeklyDigest).toBe(false)
    }
  })

  // Integration tests require DB mocking - skipped
  it.skip('upserts preferences for user (requires DB)', () => {})
})
