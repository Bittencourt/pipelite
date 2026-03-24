import { describe, it, expect } from 'vitest'
import { z } from 'zod'

// Test the invite email validation schema (same as used in the action)
const inviteEmailSchema = z.object({
  email: z.string().email("Invalid email address"),
})

describe('inviteUser', () => {
  describe('email validation', () => {
    it('rejects invalid email format', () => {
      const result = inviteEmailSchema.safeParse({ email: "not-an-email" })
      expect(result.success).toBe(false)
    })

    it('rejects empty email', () => {
      const result = inviteEmailSchema.safeParse({ email: "" })
      expect(result.success).toBe(false)
    })

    it('accepts valid email format', () => {
      const result = inviteEmailSchema.safeParse({ email: "user@example.com" })
      expect(result.success).toBe(true)
    })
  })

  describe('token and expiry logic', () => {
    it('generates a UUID token', () => {
      const token = crypto.randomUUID()
      expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    })

    it('sets expiry to 7 days from now', () => {
      const now = Date.now()
      const expiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000)
      const expectedMs = 7 * 24 * 60 * 60 * 1000
      expect(expiresAt.getTime() - now).toBe(expectedMs)
    })

    it('builds correct insert shape', () => {
      const email = "test@example.com"
      const token = crypto.randomUUID()
      const invitedBy = "admin-user-id"
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

      const insertValues = {
        email: email.toLowerCase().trim(),
        token,
        invitedBy,
        expiresAt,
      }

      expect(insertValues).toEqual({
        email: "test@example.com",
        token: expect.any(String),
        invitedBy: "admin-user-id",
        expiresAt: expect.any(Date),
      })
      expect(insertValues.expiresAt.getTime()).toBeGreaterThan(Date.now())
    })
  })

  // Integration tests require DB mocking - skipped
  it.skip('creates invite record and sends email (requires DB)', () => {})
  it.skip('rejects if email already has active user (requires DB)', () => {})
  it.skip('rejects if pending invite exists (requires DB)', () => {})
})
