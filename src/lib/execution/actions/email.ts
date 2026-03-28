import { interpolate } from "./interpolate"
import { safeSend } from "@/lib/email/send"
import { getWorkflowEmailTemplate } from "@/lib/email/templates"
import { registerAction } from "./registry"
import { db } from "@/db"
import { users } from "@/db/schema"
import { inArray } from "drizzle-orm"
import type { ExecutionContext } from "../types"

interface Recipient {
  type: "user" | "dynamic"
  value: string
}

/**
 * Resolve email addresses from recipient list.
 * - "dynamic" type: interpolate value to get email address directly
 * - "user" type: look up user by ID in database to get email
 */
async function resolveRecipientEmails(
  recipients: Recipient[],
  context: ExecutionContext
): Promise<string[]> {
  const emails: string[] = []

  // Collect user IDs for batch lookup
  const userIds: string[] = []
  for (const r of recipients) {
    if (r.type === "user") {
      userIds.push(r.value)
    } else {
      const email = interpolate(r.value, context)
      if (email) {
        emails.push(email)
      }
    }
  }

  // Batch lookup user emails
  if (userIds.length > 0) {
    const rows = await db
      .select({ email: users.email })
      .from(users)
      .where(inArray(users.id, userIds))

    for (const row of rows) {
      if (row.email) {
        emails.push(row.email)
      }
    }
  }

  return emails
}

async function handleEmail(
  config: Record<string, unknown>,
  context: ExecutionContext,
  _runId: string
): Promise<{ output: Record<string, unknown> }> {
  const recipients = config.recipients as Recipient[]
  const subject = interpolate(config.subject as string, context)
  const body = interpolate(config.body as string, context)

  const emails = await resolveRecipientEmails(recipients, context)

  if (emails.length === 0) {
    throw new Error("No valid recipients resolved for email action")
  }

  const template = getWorkflowEmailTemplate(subject, body)

  for (const email of emails) {
    await safeSend(email, template)
  }

  return {
    output: {
      sent: true,
      recipientCount: emails.length,
      recipients: emails,
    },
  }
}

registerAction("email", handleEmail)
