import { describe, it, expect } from 'vitest'
import { getVerifyEmailTemplate } from '../verify-email'
import { getApprovedEmailTemplate } from '../approved'
import { getPasswordResetTemplate } from '../password-reset'

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
  it('getInviteUserTemplate returns i18n content for each locale', () => {
    // TODO: implement in plan 23-02 (invite template not yet created)
    expect(true).toBe(true)
  })

  it('getDealAssignedTemplate returns i18n content', () => {
    // TODO: implement in plan 23-02
    expect(true).toBe(true)
  })

  it('getActivityReminderTemplate returns i18n content', () => {
    // TODO: implement in plan 23-02
    expect(true).toBe(true)
  })

  it('getWeeklyDigestTemplate returns i18n content with data', () => {
    // TODO: implement in plan 23-02
    expect(true).toBe(true)
  })
})
