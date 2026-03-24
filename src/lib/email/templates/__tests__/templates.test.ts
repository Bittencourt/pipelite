import { describe, it, expect } from 'vitest'
import { getVerifyEmailTemplate } from '../verify-email'
import { getApprovedEmailTemplate } from '../approved'
import { getPasswordResetTemplate } from '../password-reset'
import { getInviteUserTemplate } from '../invite-user'
import { getDealAssignedTemplate } from '../deal-assigned'
import { getActivityReminderTemplate } from '../activity-reminder'
import { getWeeklyDigestTemplate } from '../weekly-digest'
import type { WeeklyDigestData } from '../weekly-digest'

describe('existing templates i18n', () => {
  it('getVerifyEmailTemplate returns subject/html/text for en-US', async () => {
    const result = await getVerifyEmailTemplate('https://app.test/verify?token=abc', 'app.test', 'en-US')
    expect(result.subject).toContain('app.test')
    expect(result.subject).toContain('Verify')
    expect(result.html).toContain('Verify Your Email')
    expect(result.html).toContain('https://app.test/verify?token=abc')
    expect(result.text).toBeTruthy()
  })

  it('getVerifyEmailTemplate returns translated content for pt-BR', async () => {
    const enResult = await getVerifyEmailTemplate('https://app.test/verify?token=abc', 'app.test', 'en-US')
    const ptResult = await getVerifyEmailTemplate('https://app.test/verify?token=abc', 'app.test', 'pt-BR')

    expect(ptResult.subject).toContain('app.test')
    expect(ptResult.subject).not.toBe(enResult.subject)
    expect(ptResult.html).toContain('Verifique')
    expect(ptResult.html).not.toBe(enResult.html)
  })

  it('getApprovedTemplate returns i18n content', async () => {
    const enResult = await getApprovedEmailTemplate('https://app.test/login', 'app.test', 'en-US')
    const ptResult = await getApprovedEmailTemplate('https://app.test/login', 'app.test', 'pt-BR')

    expect(enResult.subject).toContain('approved')
    expect(enResult.html).toContain('Account Approved')
    expect(ptResult.subject).not.toBe(enResult.subject)
    expect(ptResult.html).toContain('Conta Aprovada')
  })

  it('getPasswordResetTemplate returns i18n content', async () => {
    const enResult = await getPasswordResetTemplate('https://app.test/reset?token=abc', 'app.test', 'en-US')
    const esResult = await getPasswordResetTemplate('https://app.test/reset?token=abc', 'app.test', 'es-ES')

    expect(enResult.subject).toContain('Reset')
    expect(enResult.html).toContain('Reset Your Password')
    expect(esResult.subject).not.toBe(enResult.subject)
    expect(esResult.html).toContain('Restablecer')
  })
})

describe('new templates i18n', () => {
  it('getInviteUserTemplate returns i18n content for en-US and pt-BR', async () => {
    const enResult = await getInviteUserTemplate('https://app.test/register?invite=abc', 'app.test', 'John', 'en-US')
    const ptResult = await getInviteUserTemplate('https://app.test/register?invite=abc', 'app.test', 'John', 'pt-BR')

    expect(enResult.subject).toBeTruthy()
    expect(enResult.subject).toContain('app.test')
    expect(enResult.html).toContain('https://app.test/register?invite=abc')
    expect(enResult.html).toContain('John')
    expect(enResult.text).toContain('John')

    expect(ptResult.subject).not.toBe(enResult.subject)
    expect(ptResult.html).toContain('John')
  })

  it('getDealAssignedTemplate returns i18n content', async () => {
    const enResult = await getDealAssignedTemplate('Acme Corp Deal', 'https://app.test/deals/123', 'Jane', 'en-US')
    const ptResult = await getDealAssignedTemplate('Acme Corp Deal', 'https://app.test/deals/123', 'Jane', 'pt-BR')

    expect(enResult.subject).toBeTruthy()
    expect(enResult.subject).toContain('Acme Corp Deal')
    expect(enResult.html).toContain('Acme Corp Deal')
    expect(enResult.html).toContain('Jane')
    expect(enResult.html).toContain('https://app.test/deals/123')

    expect(ptResult.subject).not.toBe(enResult.subject)
    expect(ptResult.html).toContain('Jane')
  })

  it('getActivityReminderTemplate returns i18n content', async () => {
    const enResult = await getActivityReminderTemplate('Follow up call', 'https://app.test/activities', '3/25/2026, 2:00 PM', 'en-US')
    const ptResult = await getActivityReminderTemplate('Follow up call', 'https://app.test/activities', '25/03/2026 14:00', 'pt-BR')

    expect(enResult.subject).toBeTruthy()
    expect(enResult.subject).toContain('Follow up call')
    expect(enResult.html).toContain('Follow up call')
    expect(enResult.html).toContain('3/25/2026, 2:00 PM')
    expect(enResult.html).toContain('https://app.test/activities')

    expect(ptResult.subject).not.toBe(enResult.subject)
  })

  it('getWeeklyDigestTemplate returns i18n content with data', async () => {
    const data: WeeklyDigestData = {
      newDeals: 5,
      dealsMovedStage: 3,
      dealsWon: 2,
      dealsLost: 1,
      overdueActivities: 4,
      upcomingActivities: 7,
    }
    const enResult = await getWeeklyDigestTemplate(data, 'app.test', 'https://app.test/dashboard', 'en-US')
    const ptResult = await getWeeklyDigestTemplate(data, 'app.test', 'https://app.test/dashboard', 'pt-BR')

    expect(enResult.subject).toBeTruthy()
    expect(enResult.subject).toContain('app.test')
    expect(enResult.html).toContain('5')
    expect(enResult.html).toContain('3')
    expect(enResult.html).toContain('2')
    expect(enResult.html).toContain('https://app.test/dashboard')
    expect(enResult.text).toContain('5')

    expect(ptResult.subject).not.toBe(enResult.subject)
  })
})
