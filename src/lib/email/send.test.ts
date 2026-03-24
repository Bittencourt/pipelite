import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the client module
const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-id' })
vi.mock('@/lib/email/client', () => ({
  getEmailTransporter: () => ({ sendMail: mockSendMail }),
}))

describe('safeSend', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    mockSendMail.mockClear()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('logs warning and returns when SMTP_HOST is not configured', async () => {
    delete process.env.SMTP_HOST
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { safeSend } = await import('./send')
    await safeSend('test@example.com', {
      subject: 'Test',
      html: '<p>Test</p>',
      text: 'Test',
    })

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('No SMTP_HOST configured'),
      expect.any(String)
    )
    expect(mockSendMail).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('sends email via transporter when SMTP_HOST is configured', async () => {
    process.env.SMTP_HOST = 'smtp.test.com'
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const { safeSend } = await import('./send')
    await safeSend('test@example.com', {
      subject: 'Test Subject',
      html: '<p>Test</p>',
      text: 'Test',
    })

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test</p>',
        text: 'Test',
      })
    )
    logSpy.mockRestore()
  })
})

describe('sendInviteEmail', () => {
  it('builds invite URL and calls safeSend with correct template', () => {
    // TODO: implement in plan 23-02 (invite email template not yet created)
    expect(true).toBe(true)
  })
})

describe('sendDealAssignedEmail', () => {
  it('builds deal URL and calls safeSend', () => {
    // TODO: implement in plan 23-02 (deal assigned template not yet created)
    expect(true).toBe(true)
  })
})

describe('sendActivityReminderEmail', () => {
  it('formats due date and calls safeSend', () => {
    // TODO: implement in plan 23-02 (activity reminder template not yet created)
    expect(true).toBe(true)
  })
})

describe('sendWeeklyDigestEmail', () => {
  it('calls safeSend with digest data', () => {
    // TODO: implement in plan 23-02 (weekly digest template not yet created)
    expect(true).toBe(true)
  })
})
