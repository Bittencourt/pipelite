import { createTransport, type Transporter } from "nodemailer"
import { log } from "@/lib/log"

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

  // These four fields are the WHOLE of what may be logged here, and the list is deliberate —
  // do not "complete" it by spreading `config`. `config.auth.user` and `config.auth.pass` are
  // `SMTP_USER` and `SMTP_PASSWORD` read verbatim eight lines above; either one on the log
  // stream is a credential disclosure (T-42-49). `hasAuth` is the boolean presence check that
  // answers the only operational question ("did credentials get picked up?") without carrying
  // the credential itself.
  log.info("email", "Creating transporter", {
    host: config.host,
    port: config.port,
    secure: config.secure,
    hasAuth: !!config.auth,
  })

  transporter = createTransport(config)

  return transporter
}
