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
      await safeSend(row.email, template)
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
