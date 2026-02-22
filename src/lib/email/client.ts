import { createTransport, type Transporter } from "nodemailer"

let transporter: Transporter | null = null

export function getEmailTransporter(): Transporter {
  if (transporter) return transporter

  // Validate required env vars
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.warn("SMTP configuration missing - emails will not be sent")
  }

  transporter = createTransport({
    host: process.env.SMTP_HOST || "localhost",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASSWORD
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
          }
        : undefined,
    // Don't fail on invalid certs in development
    tls:
      process.env.NODE_ENV === "development"
        ? { rejectUnauthorized: false }
        : undefined,
  })

  return transporter
}
