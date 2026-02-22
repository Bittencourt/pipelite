import { createTransport, type Transporter } from "nodemailer"

let transporter: Transporter | null = null

export function getEmailTransporter(): Transporter {
  if (transporter) return transporter

  const config = {
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
    tls: { rejectUnauthorized: false },
  }

  console.log("[email] Creating transporter with config:", {
    host: config.host,
    port: config.port,
    secure: config.secure,
    hasAuth: !!config.auth,
  })

  transporter = createTransport(config)

  return transporter
}
