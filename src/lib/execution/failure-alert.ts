import { sql, eq } from "drizzle-orm"
import { db } from "@/db"
import { workflows, workflowRuns } from "@/db/schema/workflows"
import { users } from "@/db/schema/users"
import { notificationPreferences } from "@/db/schema/notification-preferences"
import { getWorkflowFailedTemplate } from "@/lib/email/templates/workflow-failed"
import { safeSend } from "@/lib/email/send"
import { log } from "@/lib/log"

/**
 * WFOPS-03 — alert a workflow's author when one of its runs fails.
 *
 * The requirement exists because runs "can currently fail silently forever". The naive version
 * of this feature is itself an outage, which is what the throttle below is for.
 */

/**
 * How long one workflow's failure alert suppresses the next, in minutes.
 *
 * Chosen against the two poll intervals that bound the failure rate: the execution processor
 * ticks every 5 s and the schedule processor every 30 s. A workflow failing on every execution
 * tick emits roughly **17,000 emails a day** unthrottled — which gets the sending domain
 * blocked and makes the alerting system the outage — and **24 a day** at this window. That is
 * below any transactional relay's rate limit, and still frequent enough that a sustained
 * failure keeps reminding the operator instead of going quiet after one message. It also
 * matches the only other time constant in the email layer, the activity reminder's one-hour
 * horizon.
 *
 * Exported so the test imports it rather than restating 60, and so changing the trade is one
 * line here.
 */
export const FAILURE_ALERT_WINDOW_MINUTES = 60

/**
 * `to_char` mask for an EXACT `timestamp` round trip, to the microsecond.
 *
 * The claim and the release compare the same column value across a process boundary, and a
 * JavaScript `Date` cannot carry it: postgres-js parses `timestamp` into a `Date`, which truncates
 * postgres's microseconds to milliseconds, so a `WHERE failure_alert_sent_at = $claimedAt` guard
 * built from a `Date` would match NOTHING and the release below would silently never fire. The value
 * therefore crosses as TEXT in both directions and is cast back with `::timestamp`. Verified against
 * the live database on a temp table: the claim returns `…:12.590347`, and the guarded release using
 * that exact string restores the previous value while a mismatched guard matches zero rows.
 */
const CLAIM_TIMESTAMP_FORMAT = 'YYYY-MM-DD"T"HH24:MI:SS.US'

/** What one claim attempt learned. `previous`/`claimedAt` are exact `timestamp` literals. */
export interface FailureAlertClaim {
  /** True when THIS caller owns the window and may send. */
  claimed: boolean
  /** The value the column held BEFORE this claim — what the release restores. */
  previous: string | null
  /** The value this claim WROTE, which is what makes the release safe to guard on. */
  claimedAt: string | null
}

/**
 * Claim this workflow's failure-alert window. `claimed` is true if THIS caller may send, false if
 * an alert for this workflow was already sent inside the window.
 *
 * **The guard is IN the UPDATE, not in a preceding SELECT, and that is the whole point.** Two
 * replicas running this processor would each pass a read-then-write check and each send an
 * email — the defect class WFOPS-04 documents, and the exact race in the
 * `activities.reminderSentAt` writer (`src/app/api/internal/email/process/route.ts:75-79`),
 * whose column SHAPE this copies but whose writer it must not. Exactly one UPDATE can match
 * the predicate, so exactly one replica gets a row back; the loser sees zero affected rows and
 * backs off. This is the same atomic-claim shape as `processPendingRuns` and `reclaimStaleRuns`
 * — which is the property WFOPS-04 is documenting, so the alerting path had better have it.
 *
 * A NULL `failure_alert_sent_at` means "never alerted" and is claimable.
 *
 * `updated_at` is deliberately NOT touched: `failure_alert_sent_at` is runtime state, not a
 * definition change, and the workflow editor's "last modified" reading must not jump every
 * time a run failed.
 *
 * The window is passed through `make_interval(mins => $n)` as a bound parameter rather than
 * concatenated into an `INTERVAL '60 minutes'` literal, matching `reclaimStaleRuns`.
 *
 * WHY IT RETURNS THE PREVIOUS VALUE (WR-06). The claim is committed before the mail reaches the
 * transport — it has to be, or two ticks both send — so a relay that refuses one connection used to
 * cost the operator a full hour of silence on a workflow failing every 5 seconds, which is exactly
 * the "fails silently forever" outcome WFOPS-03 exists to prevent. `releaseFailureAlert` gives the
 * window back when the send never happened, and it needs both the value to restore and the value
 * this claim wrote (to guard against clobbering a newer claim). `FROM workflows AS prev` is a
 * self-join against the pre-update snapshot, which is how the OLD value comes back from an UPDATE
 * without a preceding SELECT — the property this whole function exists to preserve. STILL ONE
 * STATEMENT, still no read-then-write.
 */
export async function claimFailureAlert(workflowId: string): Promise<FailureAlertClaim> {
  const claimed = await db.execute(sql`
    UPDATE workflows AS w
    SET failure_alert_sent_at = NOW()
    FROM workflows AS prev
    WHERE w.id = ${workflowId}
      AND prev.id = w.id
      AND (
        w.failure_alert_sent_at IS NULL
        OR w.failure_alert_sent_at < NOW() - make_interval(mins => ${FAILURE_ALERT_WINDOW_MINUTES})
      )
    RETURNING
      to_char(w.failure_alert_sent_at, ${CLAIM_TIMESTAMP_FORMAT}) AS claimed_at,
      to_char(prev.failure_alert_sent_at, ${CLAIM_TIMESTAMP_FORMAT}) AS previous
  `)

  // postgres-js does not always hand back a plain array; same defensive read as
  // reclaimStaleRuns (`execution-processor.ts:97`).
  const rows = claimed as unknown as Record<string, unknown>[] | null | undefined
  const row = (rows?.length ?? 0) > 0 ? rows![0] : undefined

  if (!row) return { claimed: false, previous: null, claimedAt: null }

  return {
    claimed: true,
    previous: typeof row.previous === "string" ? row.previous : null,
    claimedAt: typeof row.claimed_at === "string" ? row.claimed_at : null,
  }
}

/**
 * GIVE BACK A WINDOW THAT WAS CLAIMED AND THEN NOT USED (WR-06).
 *
 * Called only when the send did not happen — a `safeSend` rethrow or a template that threw. Without
 * it, `failure_alert_sent_at` says an alert was sent when the operator received nothing, and a
 * workflow failing every 5 seconds produces NO alert at all for the next hour with no signal that
 * anything went wrong. A lost mail now costs one window rather than sixty minutes.
 *
 * THE GUARD IS WHAT MAKES THIS SAFE, and it is not decorative: `failure_alert_sent_at = $claimedAt`
 * matches only while the value is still the one THIS caller wrote. A newer claim (possible only once
 * the window has elapsed, e.g. if a hung send rejects an hour late) has a different timestamp, so it
 * is left alone rather than silently released. Restoring `previous` rather than `NULL` keeps the
 * last time an alert genuinely went out; both are equally claimable, since a successful claim
 * already proved `previous` was NULL or older than the window.
 *
 * It is a single UPDATE with no preceding SELECT, for the same reason the claim is.
 */
export async function releaseFailureAlert(
  workflowId: string,
  claim: FailureAlertClaim
): Promise<void> {
  // Nothing was claimed, or the claim could not tell us what it wrote — in which case a guarded
  // release is impossible and an unguarded one could clobber a live claim. Do nothing.
  if (!claim.claimed || claim.claimedAt === null) return

  await db.execute(sql`
    UPDATE workflows
    SET failure_alert_sent_at = ${claim.previous}::timestamp
    WHERE id = ${workflowId}
      AND failure_alert_sent_at = ${claim.claimedAt}::timestamp
  `)
}

/**
 * Alert a workflow's author that one of its runs failed — at most once per
 * `FAILURE_ALERT_WINDOW_MINUTES`, never for a dry run, and never by throwing.
 *
 * **This function must never reject.** Its callers are the execution processor's drain loops
 * (wired by plan 41-12, not here). An escaping rejection would abort a tick and leave pending
 * runs unclaimed, so the whole body is wrapped and every failure is logged instead.
 *
 * It DETECTS rather than hooks: `executeRun` does not throw on a failed run, it calls `failRun`
 * internally (`src/lib/execution/engine.ts:551-562`) and returns normally, so re-reading the
 * run's terminal status is the only way the processor can know (CONTEXT amendment A4).
 *
 * Deliberately NOT called from the run-creation helper (`create-run.ts`) or the inbound
 * webhook route.
 * Recursion-limit failures are inserted already-`failed` so the processor never claims them,
 * and synchronous webhook-response runs never reach the processor. Both are real coverage gaps
 * (T-41-48), documented in plan 41-04's deployment section rather than closed, because closing
 * them means putting email latency inside a live webhook request.
 */
export async function maybeAlertOnRunFailure(runId: string): Promise<void> {
  try {
    const [run] = await db
      .select({
        status: workflowRuns.status,
        dryRun: workflowRuns.dryRun,
        error: workflowRuns.error,
        workflowId: workflowRuns.workflowId,
      })
      .from(workflowRuns)
      .where(eq(workflowRuns.id, runId))
      .limit(1)

    // No row means the run was pruned between the caller reading it and this read. Nothing to
    // report, and nothing is wrong.
    if (!run || run.status !== "failed") return

    // A failing TEST run is expected, not an incident: the operator is watching the dialog
    // that started it. This return is BEFORE the claim on purpose — claiming and then not
    // sending would burn the workflow's one-per-window budget on a test run and suppress the
    // next REAL failure's alert, which would also let anyone silence a workflow's alerts by
    // clicking Test run in a loop (T-41-44).
    if (run.dryRun) return

    const [workflow] = await db
      .select({ name: workflows.name, createdBy: workflows.createdBy })
      .from(workflows)
      .where(eq(workflows.id, run.workflowId))
      .limit(1)
    if (!workflow?.createdBy) return

    // Exactly one recipient, the person who authored the automation. Deliberately NOT widened
    // to all admins: the body carries run internals, and a user who cannot see the run must
    // not be told about it (T-41-46).
    const [author] = await db
      .select({ email: users.email, locale: users.locale })
      .from(users)
      .where(eq(users.id, workflow.createdBy))
      .limit(1)
    if (!author?.email) return

    // An ABSENT row means SEND. `getNotificationPreferences` returns all-true defaults when the
    // row is missing (`src/app/settings/notifications/actions.ts:38-40`) and that table is only
    // ever written by the settings form, so reading absence as "do not send" would silently
    // disable failure alerting for every user who has never opened that page.
    const [prefs] = await db
      .select({ emailWorkflowFailed: notificationPreferences.emailWorkflowFailed })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, workflow.createdBy))
      .limit(1)
    if (prefs && !prefs.emailWorkflowFailed) return

    // Last gate, so nobody above burns the window: opted-out users and dry runs never reach it.
    // Everything BELOW it can still fail, though, which is why the window can be given back —
    // the claim has to precede the send (or two ticks both send), so the compensation is the only
    // place the "claimed but never sent" case can be repaired (WR-06).
    const claim = await claimFailureAlert(run.workflowId)
    if (!claim.claimed) return

    /** Hand the window back, and never let the attempt itself become the failure. */
    const release = async () => {
      try {
        await releaseFailureAlert(run.workflowId, claim)
      } catch (error) {
        log.error("failure-alert", "Failed to release the throttle window", {
          runId,
          err: error,
        })
      }
    }

    const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000"
    const runUrl = `${appUrl}/workflows/${run.workflowId}/runs/${runId}`

    let template: Awaited<ReturnType<typeof getWorkflowFailedTemplate>>

    try {
      // Inside the claim's compensation scope: `getEmailTranslator` throws on a missing message
      // key, and letting the outer catch swallow that would burn the window on a send that never
      // even reached the transport.
      template = await getWorkflowFailedTemplate(
        workflow.name,
        runUrl,
        run.error ?? "",
        author.locale
      )
    } catch (error) {
      log.error("failure-alert", "Failed to build the alert", { runId, err: error })
      await release()
      return
    }

    // NOT awaited. `safeSend` RETHROWS on transport failure (`src/lib/email/send.ts:34-37`),
    // and it also skips silently when SMTP_HOST is unset (`send.ts:20-23`). Awaiting it here
    // would put relay latency, and its exceptions, inside the processor's drain loop
    // (T-41-45).
    safeSend(author.email, template).catch(async (error) => {
      log.error("failure-alert", "Failed to send failure alert", { runId, err: error })
      // The mail never reached the transport, so the hour of silence this claim bought is a lie.
      await release()
    })
  } catch (error) {
    log.error("failure-alert", "Alert check failed", { runId, err: error })
  }
}
