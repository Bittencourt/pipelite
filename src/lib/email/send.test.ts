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
  beforeEach(() => {
    vi.resetModules()
    mockSendMail.mockClear()
  })

  it('builds invite URL and calls safeSend with correct template', async () => {
    process.env.SMTP_HOST = 'smtp.test.com'
    process.env.NEXTAUTH_URL = 'https://app.test'
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const { sendInviteEmail } = await import('./send')
    await sendInviteEmail('user@example.com', 'abc123', 'John Doe', 'en-US')

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
      })
    )
    const call = mockSendMail.mock.calls[0][0]
    expect(call.html).toContain('https://app.test/register?invite=abc123')
    expect(call.html).toContain('John Doe')
    expect(call.subject).toContain('app.test')
    logSpy.mockRestore()
  })

  it('passes locale through to the template function', async () => {
    process.env.SMTP_HOST = 'smtp.test.com'
    process.env.NEXTAUTH_URL = 'https://app.test'
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const { sendInviteEmail } = await import('./send')
    await sendInviteEmail('user@example.com', 'abc123', 'John Doe', 'pt-BR')

    const call = mockSendMail.mock.calls[0][0]
    // pt-BR subject should be different from en-US
    expect(call.subject).toContain('app.test')
    expect(call.html).toContain('John Doe')
    logSpy.mockRestore()
  })
})

describe('sendDealAssignedEmail', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSendMail.mockClear()
  })

  it('builds deal URL and calls safeSend', async () => {
    process.env.SMTP_HOST = 'smtp.test.com'
    process.env.NEXTAUTH_URL = 'https://app.test'
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const { sendDealAssignedEmail } = await import('./send')
    await sendDealAssignedEmail('user@example.com', 'deal-456', 'Big Deal', 'Jane Smith', 'en-US')

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
      })
    )
    const call = mockSendMail.mock.calls[0][0]
    expect(call.html).toContain('https://app.test/deals/deal-456')
    expect(call.html).toContain('Big Deal')
    expect(call.html).toContain('Jane Smith')
    expect(call.subject).toContain('Big Deal')
    logSpy.mockRestore()
  })
})

describe('sendActivityReminderEmail', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSendMail.mockClear()
  })

  it('formats due date and calls safeSend', async () => {
    process.env.SMTP_HOST = 'smtp.test.com'
    process.env.NEXTAUTH_URL = 'https://app.test'
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const { sendActivityReminderEmail } = await import('./send')
    const dueDate = new Date('2026-03-25T14:00:00Z')
    await sendActivityReminderEmail('user@example.com', 'Follow up call', dueDate, 'en-US')

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
      })
    )
    const call = mockSendMail.mock.calls[0][0]
    expect(call.html).toContain('https://app.test/activities')
    expect(call.html).toContain('Follow up call')
    expect(call.subject).toContain('Follow up call')
    logSpy.mockRestore()
  })
})

describe('sendWeeklyDigestEmail', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSendMail.mockClear()
  })

  it('calls safeSend with digest data', async () => {
    process.env.SMTP_HOST = 'smtp.test.com'
    process.env.NEXTAUTH_URL = 'https://app.test'
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const { sendWeeklyDigestEmail } = await import('./send')
    await sendWeeklyDigestEmail('user@example.com', {
      newDeals: 5,
      dealsMovedStage: 3,
      dealsWon: 2,
      dealsLost: 1,
      overdueActivities: 4,
      upcomingActivities: 7,
    }, 'en-US')

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
      })
    )
    const call = mockSendMail.mock.calls[0][0]
    expect(call.html).toContain('https://app.test/dashboard')
    expect(call.html).toContain('5')
    expect(call.subject).toContain('app.test')
    logSpy.mockRestore()
  })
})
