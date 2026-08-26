import { interpolate } from "./interpolate"
import { safeSend } from "@/lib/email/send"
import { getWorkflowEmailTemplate } from "@/lib/email/templates"
import { registerAction } from "./registry"
import { db } from "@/db"
import { users } from "@/db/schema"
import { and, inArray, isNull } from "drizzle-orm"
import type { ExecutionContext } from "../types"

interface Recipient {
  type: "user" | "dynamic"
  value: string
}

/**
 * Resolve email addresses from recipient list.
 * - "dynamic" type: interpolate value to get email address directly
 * - "user" type: look up user by ID in database to get email
 *
 * =============================================================================
 * SEC-48-D, SPLIT — WHAT THE OWNER PREDICATE HERE IS AND IS NOT
 * =============================================================================
 *
 * The iteration-3 review asked for `eq(users.id, context._workflowUserId)` on this read, arguing
 * that `resolveRecipientEmails` returns the resolved addresses in the node's `output`, that those
 * outputs are persisted as `workflow_run_steps.output` and served by `serializeRunStep`, and that
 * this is therefore "a read oracle whose answer is returned to the caller in a response body" —
 * an owner-boundary defect of the same class as CR-01/CR-02, separable from the recipient-policy
 * question because the dry-run gate below returns the addresses with NO MAIL SENT.
 *
 * THAT SELF-PREDICATE WAS NOT APPLIED, AND THE REASONING IS RECORDED RATHER THAN THE CONCLUSION:
 * the premise is false in this product. `src/app/team/page.tsx` — an ordinary page, with NO role
 * gate (`src/auth.config.ts:31-32` protects only `/settings` and `/admin`) — reads
 *
 *     db.query.users.findMany({ where: isNull(users.deletedAt),
 *                               columns: { id: true, name: true, email: true } })
 *
 * for EVERY non-deleted user and hands the result to a client component, which renders the address
 * at `team-page-client.tsx:55,57`. So every signed-in principal already holds the entire user
 * directory INCLUDING email addresses, from a single GET, and an API key belongs to such a
 * principal. Resolving one id to one address here discloses strictly less than `/team` already
 * does. Adding a self-predicate would buy no confidentiality and would break the supported case of
 * a workflow notifying a colleague — a product decision, which is the very thing SEC-48-D is
 * deferred on. The relay half stays deferred with the entry corrected.
 *
 * WHAT WAS ACTUALLY WRONG, AND IS FIXED: this read had no `deletedAt` predicate at all, so it was
 * WIDER than the already-public directory. A soft-deleted user — a departed employee — could still
 * be resolved to their address and still be mailed. `isNull(users.deletedAt)` makes the engine's
 * user read exactly as wide as `/team`'s and no wider. Related to DEF-48-02, which records that a
 * soft-deleted user's API key still authenticates.
 * =============================================================================
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

  // Batch lookup user emails. `isNull(users.deletedAt)` is carried ON THE STATEMENT rather than
  // filtered afterwards: a departed employee's address must not be resolvable, and a JavaScript
  // filter would still have read it. See the SEC-48-D block above for why there is no owner or
  // self predicate here.
  if (userIds.length > 0) {
    const rows = await db
      .select({ email: users.email })
      .from(users)
      .where(and(inArray(users.id, userIds), isNull(users.deletedAt)))

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

  // DRY-RUN GATE — placed immediately before the only side effect, and deliberately
  // BELOW resolveRecipientEmails, BELOW the zero-recipients throw and BELOW the
  // template build.
  //
  // Pitfall 2: gate at the side effect, never above the resolution. Gating above
  // resolveRecipientEmails would make every dry run of a MISCONFIGURED email node
  // pass — and "the recipient you configured does not resolve to an address" is one
  // of the two most valuable things a dry run can tell an operator. Building the
  // template under dry run costs nothing and keeps a template error surfacing too.
  //
  // recipientCount/recipients are the REAL resolved addresses: a dry run must report
  // exactly who WOULD have been mailed. The key set matches the real output plus
  // `simulated`, so a downstream transform/condition node reading this output behaves
  // identically.
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
