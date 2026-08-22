import { describe, it, expect } from 'vitest'
import { getVerifyEmailTemplate } from '../verify-email'
import { getApprovedEmailTemplate } from '../approved'
import { getPasswordResetTemplate } from '../password-reset'
import { getInviteUserTemplate } from '../invite-user'
import { getDealAssignedTemplate } from '../deal-assigned'
import { getActivityReminderTemplate } from '../activity-reminder'
import { getWeeklyDigestTemplate } from '../weekly-digest'
import type { WeeklyDigestData } from '../weekly-digest'
import { getWorkflowFailedTemplate, MAX_ERROR_CHARS } from '../workflow-failed'

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

/**
 * WFOPS-03 / plan 41-08. This template is the only one of the ten that receives an
 * ATTACKER-INFLUENCED value: `workflow_runs.error` can embed up to 200 characters of an
 * arbitrary HTTP response body (`src/lib/execution/actions/http.ts:109-111`). So these cases
 * assert two properties no sibling template has to satisfy — the error is HTML-escaped, and
 * it never passes through the translator (a `{` inside a message next-intl is PARSING throws
 * at render, which is T-41-15 and is asserted from the message side in locale-parity.test.ts).
 */
describe('getWorkflowFailedTemplate', () => {
  const URL = 'https://app.test/workflows/wf-1/runs/run-1'

  it('names the workflow in the subject in all three locales, and they are not all identical', async () => {
    const en = await getWorkflowFailedTemplate('Nightly sync', URL, 'boom', 'en-US')
    const pt = await getWorkflowFailedTemplate('Nightly sync', URL, 'boom', 'pt-BR')
    const es = await getWorkflowFailedTemplate('Nightly sync', URL, 'boom', 'es-ES')

    expect(en.subject).toContain('Nightly sync')
    expect(pt.subject).toContain('Nightly sync')
    expect(es.subject).toContain('Nightly sync')

    // Three identical subjects would mean the namespace resolved to the fallback in every
    // locale (or the keys are missing), which is exactly the failure this asserts against.
    expect(new Set([en.subject, pt.subject, es.subject]).size).toBeGreaterThan(1)
  })

  it('falls back to en-US for an unknown locale without throwing', async () => {
    const en = await getWorkflowFailedTemplate('Nightly sync', URL, 'boom', 'en-US')
    const unknown = await getWorkflowFailedTemplate('Nightly sync', URL, 'boom', 'kl-KL')
    expect(unknown.subject).toBe(en.subject)
    expect(unknown.html).toBe(en.html)
  })

  it('escapes the run error in the html and keeps it RAW in the text', async () => {
    const result = await getWorkflowFailedTemplate('Nightly sync', URL, '<script>alert(1)</script>', 'en-US')

    expect(result.html).toContain('&lt;script&gt;')
    expect(result.html).not.toContain('<script>')
    // ANTI-VACUITY: an implementation that dropped the error entirely would satisfy every
    // "does not contain <script>" assertion above while telling the operator nothing.
    expect(result.html).toContain('alert')
    expect(result.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')

    // The text part has no markup context; escaping there would show the operator `&lt;`
    // where the real error said `<`.
    expect(result.text).toContain('<script>alert(1)</script>')
    expect(result.text).not.toContain('&lt;')
  })

  it('escapes &, ", \' and > in the run error', async () => {
    const amp = await getWorkflowFailedTemplate('W', URL, 'a & b', 'en-US')
    expect(amp.html).toContain('a &amp; b')
    expect(amp.html).not.toContain('a & b')
    expect(amp.text).toContain('a & b')

    const quote = await getWorkflowFailedTemplate('W', URL, 'he said "hi"', 'en-US')
    expect(quote.html).toContain('&quot;hi&quot;')
    expect(quote.text).toContain('"hi"')

    const apos = await getWorkflowFailedTemplate('W', URL, "it's broken", 'en-US')
    expect(apos.html).toContain('it&#39;s broken')
    expect(apos.text).toContain("it's broken")

    const gt = await getWorkflowFailedTemplate('W', URL, 'a > b', 'en-US')
    expect(gt.html).toContain('a &gt; b')
    expect(gt.text).toContain('a > b')
  })

  it('does not throw on a run error containing braces, and the braces survive in the text', async () => {
    // This is the case that proves the error is NOT passed through the translator.
    const errorMessage = 'HTTP 400: {"error":"bad"}'
    const result = await getWorkflowFailedTemplate('Nightly sync', URL, errorMessage, 'en-US')

    expect(result.text).toContain('HTTP 400: {"error":"bad"}')
    expect(result.html).toContain('{')
    expect(result.html).toContain('}')
    expect(result.html).toContain('&quot;error&quot;')

    // And in every locale, since a translated message is a different parse.
    await expect(getWorkflowFailedTemplate('W', URL, errorMessage, 'pt-BR')).resolves.toBeTruthy()
    await expect(getWorkflowFailedTemplate('W', URL, errorMessage, 'es-ES')).resolves.toBeTruthy()
  })

  it('truncates a run error longer than MAX_ERROR_CHARS in both html and text', async () => {
    const huge = 'x'.repeat(10_000)
    const result = await getWorkflowFailedTemplate('Nightly sync', URL, huge, 'en-US')

    expect(MAX_ERROR_CHARS).toBeGreaterThan(0)
    expect(result.html).not.toContain('x'.repeat(MAX_ERROR_CHARS + 1))
    expect(result.text).not.toContain('x'.repeat(MAX_ERROR_CHARS + 1))
    // A visible ellipsis, so the operator knows the error continues.
    expect(result.html).toContain('…')
    expect(result.text).toContain('…')
    // Bounded by the named constant, not by a magic number.
    expect(result.text.length).toBeLessThan(MAX_ERROR_CHARS + 1000)
    expect(result.html.length).toBeLessThan(MAX_ERROR_CHARS * 6 + 3000)
    // ANTI-VACUITY: the beginning of the error is still there.
    expect(result.text).toContain('x'.repeat(100))
  })

  it('renders the run url as the action href and in the text body', async () => {
    const result = await getWorkflowFailedTemplate('Nightly sync', URL, 'boom', 'en-US')
    expect(result.html).toContain(`href="${URL}"`)
    expect(result.text).toContain(URL)
  })

  it('escapes the workflow name in the html but not in the subject', async () => {
    // The name is workflow-author supplied and reaches the html through the translator's
    // VALUE slot, which use-intl does not re-parse but which this file interpolates into
    // markup. The subject is a mail header, not markup, so escaping it there would show
    // the operator `&lt;b&gt;` in their inbox.
    const result = await getWorkflowFailedTemplate('<b>Nightly</b>', URL, 'boom', 'en-US')

    expect(result.html).toContain('&lt;b&gt;Nightly&lt;/b&gt;')
    expect(result.html).not.toContain('<b>Nightly</b>')
    expect(result.subject).toContain('<b>Nightly</b>')
    expect(result.text).toContain('<b>Nightly</b>')
  })

  it('labels the error block with the localised errorLabel key', async () => {
    const en = await getWorkflowFailedTemplate('W', URL, 'boom', 'en-US')
    const pt = await getWorkflowFailedTemplate('W', URL, 'boom', 'pt-BR')
    expect(en.html).toContain('Error')
    expect(pt.html).toContain('Erro')
    expect(en.text).toContain('Error')
  })
})
