export function getPasswordResetTemplate(
  resetUrl: string,
  host: string
) {
  return {
    subject: `Reset your password - ${host}`,
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
              <h1 style="margin: 0 0 20px; color: #333;">Reset Your Password</h1>
              <p style="color: #666; margin-bottom: 30px;">
                We received a request to reset your password. Click the button below to create a new password.
              </p>
              <a href="${resetUrl}" style="display: inline-block; background: #346df1; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 500;">
                Reset Password
              </a>
              <p style="color: #999; font-size: 13px; margin-top: 30px;">
                This link will expire in 1 hour. If you did not request a password reset, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    text: `Reset your password for ${host}\n\nClick this link to reset your password: ${resetUrl}\n\nThis link expires in 1 hour. If you did not request this, ignore this email.`,
  }
}
