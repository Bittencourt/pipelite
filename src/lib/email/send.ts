import { getEmailTransporter } from "./client"
import {
  getVerifyEmailTemplate,
  getApprovedEmailTemplate,
  getPasswordResetTemplate,
} from "./templates"

const fromEmail = process.env.EMAIL_FROM || "noreply@example.com"
const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000"

export async function safeSend(
  to: string,
  template: { subject: string; html: string; text: string }
): Promise<void> {
  if (!process.env.SMTP_HOST) {
    console.warn("[email] No SMTP_HOST configured, skipping email to:", to)
    return
  }
  const transporter = getEmailTransporter()
  try {
    const info = await transporter.sendMail({
      from: fromEmail,
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    })
    console.log("[email] Email sent to:", to, "messageId:", info.messageId)
  } catch (error) {
    console.error("[email] Failed to send email to:", to, error)
    throw error
  }
}

export async function sendVerificationEmail(
  email: string,
  token: string,
  locale: string = "en-US"
): Promise<void> {
  const verificationUrl = `${appUrl}/verify-email?token=${token}`
  const host = new URL(appUrl).host
  const template = await getVerifyEmailTemplate(verificationUrl, host, locale)
  await safeSend(email, template)
}

export async function sendApprovalEmail(
  email: string,
  locale: string = "en-US"
): Promise<void> {
  const loginUrl = `${appUrl}/login`
  const host = new URL(appUrl).host
  const template = await getApprovedEmailTemplate(loginUrl, host, locale)
  await safeSend(email, template)
}

export async function sendPasswordResetEmail(
  email: string,
  token: string,
  locale: string = "en-US"
): Promise<void> {
  const resetUrl = `${appUrl}/reset-password?token=${token}`
  const host = new URL(appUrl).host
  const template = await getPasswordResetTemplate(resetUrl, host, locale)
  await safeSend(email, template)
}
