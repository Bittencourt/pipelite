export function getVerifyEmailTemplate(
  verificationUrl: string,
  host: string
) {
  return {
    subject: `Verify your email for ${host}`,
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
              <h1 style="margin: 0 0 20px; color: #333;">Verify Your Email</h1>
              <p style="color: #666; margin-bottom: 30px;">
                Click the button below to verify your email address and continue your registration.
              </p>
              <a href="${verificationUrl}" style="display: inline-block; background: #346df1; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 500;">
                Verify Email Address
              </a>
              <p style="color: #999; font-size: 13px; margin-top: 30px;">
                This link will expire in 24 hours. If you did not create an account, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    text: `Verify your email for ${host}\n\nClick this link to verify your email: ${verificationUrl}\n\nThis link expires in 24 hours. If you did not request this, ignore this email.`,
  }
}
