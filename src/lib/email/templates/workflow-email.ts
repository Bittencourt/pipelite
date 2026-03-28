/**
 * Email template for workflow-sent emails.
 * Subject and body are user-authored with interpolated variables.
 */
export function getWorkflowEmailTemplate(
  subject: string,
  body: string
): { subject: string; html: string; text: string } {
  return {
    subject,
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
              <h1 style="margin: 0 0 20px; color: #333; font-size: 20px;">${subject}</h1>
              <pre style="color: #666; margin: 0; white-space: pre-wrap; word-wrap: break-word; font-family: inherit; font-size: 14px; line-height: 1.6;">${body}</pre>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    text: `${subject}\n\n${body}`,
  }
}
