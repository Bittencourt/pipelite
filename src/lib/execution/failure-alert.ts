import { sql } from "drizzle-orm"
import { db } from "@/db"

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
 * Claim this workflow's failure-alert window. Returns true if THIS caller may send, false if
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
 */
export async function claimFailureAlert(workflowId: string): Promise<boolean> {
  const claimed = await db.execute(sql`
    UPDATE workflows
    SET failure_alert_sent_at = NOW()
    WHERE id = ${workflowId}
      AND (
        failure_alert_sent_at IS NULL
        OR failure_alert_sent_at < NOW() - make_interval(mins => ${FAILURE_ALERT_WINDOW_MINUTES})
      )
    RETURNING id
  `)

  // postgres-js does not always hand back a plain array; same defensive read as
  // reclaimStaleRuns (`execution-processor.ts:97`).
  return ((claimed as unknown as unknown[])?.length ?? 0) > 0
}
