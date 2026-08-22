import { getEmailTranslator } from '../i18n'

/**
 * WFOPS-03 — the workflow-failure alert email.
 *
 * This is the only one of the ten templates in this directory that renders an
 * ATTACKER-INFLUENCED value, and the two helpers below exist for that reason alone.
 *
 * `workflow_runs.error` can embed up to 200 characters of an arbitrary HTTP response body
 * (`src/lib/execution/actions/http.ts:109-111`, where a failing request's body preview becomes
 * the run's error message). That string reaches a rendered HTML email, so:
 *
 *  - it is HTML-escaped before interpolation. No existing template in this directory
 *    demonstrates escaping — `workflow-notification.ts:21` interpolates its workflow-supplied
 *    `message` UNESCAPED, so the nearest in-repo precedent is the defect this file must not
 *    copy (T-41-40).
 *  - it is truncated to `MAX_ERROR_CHARS`, so a multi-megabyte response body cannot turn one
 *    failure into a multi-megabyte mail.
 *  - it is rendered in its own block beside `t('errorLabel')`, and NEVER passed through the
 *    translator in any form. next-intl/use-intl reads `{` as a placeholder delimiter and
 *    THROWS AT RENDER on a brace inside a message it is parsing, so an `HTTP 400: {"error":…}`
 *    run error routed through `t(...)` would break the alert for exactly the run that most
 *    needed it. There is deliberately no `{errorMessage}` key in any locale file, and
 *    `src/messages/locale-parity.test.ts` fails if one is added (T-41-15).
 *
 * `escapeHtml` is deliberately LOCAL to this file and not exported: a second consumer is when
 * it gets promoted to a shared module, and this phase has one. No HTML-sanitiser dependency is
 * added for five string replacements.
 */

/**
 * Upper bound on the run error rendered into the alert, in characters. 500 comfortably holds
 * the 200-character HTTP body preview plus its `HTTP <status>: ` prefix and the longest
 * engine-authored error (the stale-run reclaim message), while keeping the mail small.
 */
export const MAX_ERROR_CHARS = 500

/** `&` MUST be replaced first, or the entities produced by the later rules get double-escaped. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** A visible ellipsis, so the operator knows the error continues rather than ended there. */
function truncate(value: string): string {
  return value.length > MAX_ERROR_CHARS ? `${value.slice(0, MAX_ERROR_CHARS)}…` : value
}

export async function getWorkflowFailedTemplate(
  workflowName: string,
  runUrl: string,
  errorMessage: string,
  locale: string = 'en-US'
) {
  const t = await getEmailTranslator(locale, 'emails.workflowFailed')

  // Which value takes which path, stated explicitly because getting it backwards either
  // double-escapes the subject line or leaks markup into the body:
  //
  //   RAW      -> the `subject` (a mail header, not markup) and the whole `text` part
  //               (plain text has no markup context; escaping there would show the operator
  //               `&lt;` where the real error said `<`).
  //   ESCAPED  -> everything this file interpolates into its own HTML template string.
  //
  // `workflowName` is workflow-author supplied and reaches the html through the translator's
  // VALUE slot. use-intl does not re-parse values, so an escaped value passes through intact —
  // which is why the html gets its own translator calls with the escaped name.
  const safeName = escapeHtml(workflowName)
  const truncatedError = truncate(errorMessage)
  const safeError = escapeHtml(truncatedError)

  return {
    subject: t('subject', { workflowName }),
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
      </head>
      <body style="background: #f9f9f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <table width="100%" style="max-width: 600px; margin: 40px auto; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px; text-align: center;">
              <h1 style="margin: 0 0 20px; color: #333;">${t('heading')}</h1>
              <p style="color: #666; margin-bottom: 24px;">
                ${t('body', { workflowName: safeName })}
              </p>
              <p style="color: #999; margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; text-align: left;">
                ${t('errorLabel')}
              </p>
              <p style="color: #666; margin: 0 0 30px; padding: 12px; background: #f4f4f5; border-radius: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; line-height: 1.5; text-align: left; word-break: break-word; white-space: pre-wrap;">${safeError}</p>
              <a href="${runUrl}" style="display: inline-block; background: #346df1; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 500;">
                ${t('buttonText')}
              </a>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    text: `${t('subject', { workflowName })}\n\n${t('body', { workflowName })}\n\n${t('errorLabel')}: ${truncatedError}\n\n${runUrl}`,
  }
}
