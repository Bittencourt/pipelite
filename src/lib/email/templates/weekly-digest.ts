import { getEmailTranslator } from '../i18n'

export type WeeklyDigestData = {
  newDeals: number
  dealsMovedStage: number
  dealsWon: number
  dealsLost: number
  overdueActivities: number
  upcomingActivities: number
}

export async function getWeeklyDigestTemplate(
  data: WeeklyDigestData,
  host: string,
  dashboardUrl: string,
  locale: string = 'en-US'
) {
  const t = await getEmailTranslator(locale, 'emails.weeklyDigest')
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
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; color: #333; text-align: center;">${t('heading')}</h1>

              <h2 style="color: #346df1; font-size: 16px; margin: 24px 0 12px;">${t('dealsHeading')}</h2>
              <ul style="color: #666; list-style: none; padding: 0; margin: 0 0 24px;">
                <li style="padding: 6px 0;">${t('newDeals', { count: data.newDeals })}</li>
                <li style="padding: 6px 0;">${t('dealsMovedStage', { count: data.dealsMovedStage })}</li>
                <li style="padding: 6px 0;">${t('dealsWon', { count: data.dealsWon })}</li>
                <li style="padding: 6px 0;">${t('dealsLost', { count: data.dealsLost })}</li>
              </ul>

              <h2 style="color: #346df1; font-size: 16px; margin: 24px 0 12px;">${t('activitiesHeading')}</h2>
              <ul style="color: #666; list-style: none; padding: 0; margin: 0 0 30px;">
                <li style="padding: 6px 0;">${t('overdueActivities', { count: data.overdueActivities })}</li>
                <li style="padding: 6px 0;">${t('upcomingActivities', { count: data.upcomingActivities })}</li>
              </ul>

              <div style="text-align: center;">
                <a href="${dashboardUrl}" style="display: inline-block; background: #346df1; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 500;">
                  ${t('buttonText')}
                </a>
              </div>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    text: `${t('subject', { host })}\n\n${t('dealsHeading')}\n- ${t('newDeals', { count: data.newDeals })}\n- ${t('dealsMovedStage', { count: data.dealsMovedStage })}\n- ${t('dealsWon', { count: data.dealsWon })}\n- ${t('dealsLost', { count: data.dealsLost })}\n\n${t('activitiesHeading')}\n- ${t('overdueActivities', { count: data.overdueActivities })}\n- ${t('upcomingActivities', { count: data.upcomingActivities })}\n\n${dashboardUrl}`,
  }
}
