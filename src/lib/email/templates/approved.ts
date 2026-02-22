export function getApprovedEmailTemplate(loginUrl: string, host: string) {
  return {
    subject: `Your account has been approved - ${host}`,
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
              <h1 style="margin: 0 0 20px; color: #333;">Account Approved!</h1>
              <p style="color: #666; margin-bottom: 30px;">
                Great news! Your account has been approved by an administrator. You can now log in and start using the platform.
              </p>
              <a href="${loginUrl}" style="display: inline-block; background: #10b981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 500;">
                Log In Now
              </a>
              <p style="color: #999; font-size: 13px; margin-top: 30px;">
                If you have any questions, please contact your administrator.
              </p>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    text: `Your account has been approved!\n\nYou can now log in at: ${loginUrl}\n\nWelcome to ${host}!`,
  }
}
