import { getEmailTransporter } from "./client"
import {
  getVerifyEmailTemplate,
  getApprovedEmailTemplate,
  getPasswordResetTemplate,
} from "./templates"

const fromEmail = process.env.EMAIL_FROM || "noreply@example.com"
const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000"

export async function sendVerificationEmail(
  email: string,
  token: string
): Promise<void> {
  const verificationUrl = `${appUrl}/verify-email?token=${token}`
  const host = new URL(appUrl).host
  const template = getVerifyEmailTemplate(verificationUrl, host)

  const transporter = getEmailTransporter()
  console.log("[email] Sending verification email to:", email)
  try {
    const info = await transporter.sendMail({
      from: fromEmail,
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    })
    console.log("[email] Verification email sent:", info.messageId)
  } catch (error) {
    console.error("[email] Failed to send verification email:", error)
    throw error
  }
}

export async function sendApprovalEmail(email: string): Promise<void> {
  const loginUrl = `${appUrl}/login`
  const host = new URL(appUrl).host
  const template = getApprovedEmailTemplate(loginUrl, host)

  const transporter = getEmailTransporter()
  await transporter.sendMail({
    from: fromEmail,
    to: email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  })
}

export async function sendPasswordResetEmail(
  email: string,
  token: string
): Promise<void> {
  const resetUrl = `${appUrl}/reset-password?token=${token}`
  const host = new URL(appUrl).host
  const template = getPasswordResetTemplate(resetUrl, host)

  const transporter = getEmailTransporter()
  await transporter.sendMail({
    from: fromEmail,
    to: email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  })
}
