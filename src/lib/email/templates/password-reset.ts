import { getEmailTranslator } from '../i18n'

export async function getPasswordResetTemplate(
  resetUrl: string,
  host: string,
  locale: string = 'en-US'
) {
  const t = await getEmailTranslator(locale, 'emails.passwordReset')
  return {
    subject: t('subject', { host }),
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
              <p style="color: #666; margin-bottom: 30px;">
                ${t('body')}
              </p>
              <a href="${resetUrl}" style="display: inline-block; background: #346df1; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 500;">
                ${t('buttonText')}
              </a>
              <p style="color: #999; font-size: 13px; margin-top: 30px;">
                ${t('expiryNote')}
              </p>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    text: `${t('subject', { host })}\n\n${t('body')}\n\n${resetUrl}\n\n${t('expiryNote')}`,
  }
}
