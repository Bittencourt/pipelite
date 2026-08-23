import { interpolate } from "./interpolate"
import { safeSend } from "@/lib/email/send"
import { getWorkflowNotificationTemplate } from "@/lib/email/templates"
import { registerAction } from "./registry"
import { db } from "@/db"
import { users } from "@/db/schema"
import { inArray } from "drizzle-orm"
import type { ExecutionContext } from "../types"

async function handleNotification(
  config: Record<string, unknown>,
  context: ExecutionContext,
  _runId: string
): Promise<{ output: Record<string, unknown> }> {
  const userIds = config.userIds as string[]
  const message = interpolate(config.message as string, context)

  if (!userIds || userIds.length === 0) {
    throw new Error("No notification recipients specified")
  }

  // Batch lookup user emails
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(inArray(users.id, userIds))

  if (rows.length === 0) {
    throw new Error("No valid users found for notification")
  }

  const template = getWorkflowNotificationTemplate(message)

  const emails: string[] = []
  for (const row of rows) {
    if (row.email) {
      emails.push(row.email)
      // DRY-RUN GATE — amendment A1. Do NOT "simplify" this away.
      //
      // CONTEXT's dry-run decision enumerated FOUR side-effecting handlers to
      // simulate (crm, email, http, webhook-response). This is the fifth, and it is
      // the highest-severity finding of the phase: `.env` sets SMTP_PORT=465 against
      // a REAL relay, not mailhog's localhost:1025. So without this gate, a dry run
      // of any workflow containing a notification node sends real mail from the
      // production sending domain to real user addresses read from the `users` table.
      // The locked copy `workflows.dryRun.description` promises "nothing leaves this
      // app" — this gate is what makes that sentence true.
      //
      // Gate the send ONLY. The emails.push above stays outside it, and both throws
      // and the users SELECT above stay unconditional, so a dry run still reports who
      // WOULD have been notified and still fails for the real reason when the
      // recipients are misconfigured (Pitfall 2).
      if (!context._dryRun) {
        await safeSend(row.email, template)
      }
    }
  }

  if (context._dryRun) {
    return {
      output: {
        sent: false,
        simulated: true,
        recipientCount: emails.length,
        recipients: emails,
      },
    }
  }

  return {
    output: {
      sent: true,
      recipientCount: emails.length,
      recipients: emails,
    },
  }
}

registerAction("notification", handleNotification)
