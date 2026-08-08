/**
 * Email template for workflow notification emails.
 * Simpler than the full email template -- just a message in a card.
 */
export function getWorkflowNotificationTemplate(
  message: string
): { subject: string; html: string; text: string } {
  return {
    subject: "Workflow Notification",
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
              <h1 style="margin: 0 0 20px; color: #333; font-size: 18px;">Workflow Notification</h1>
              <p style="color: #666; margin: 0; font-size: 14px; line-height: 1.6;">${message}</p>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    text: `Workflow Notification\n\n${message}`,
  }
}
