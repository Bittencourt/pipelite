"use client"

/**
 * The scan launcher and its progress, for ONE entity type (DEDUP-01, 39-UI-SPEC P-1 to P-8).
 *
 * FOUR STATES, FOUR DISTINCT RENDERINGS, one small component each — `ScanIdlePanel`,
 * `ScanRunningPanel`, `ScanCompletedPanel`, `ScanFailedPanel`. They are separate top-level functions
 * rather than branches inside one 200-line return, for two reasons: each rendering has its own copy
 * and its own single control, and a source gate can then extract one region and assert about it
 * alone. `scan-panel-wiring.test.ts` asserts the background hint per region and the absence of the
 * cancel control from the non-starter branch, and neither assertion is expressible against a file
 * whose regions are anonymous.
 *
 * THE POLL IS COPIED FROM `progress-step.tsx:26-46` IN SHAPE AND IN NOTHING ELSE.
 *
 *   - `setState` lives inside the async callback that `setInterval` invokes, NEVER in the effect
 *     body. That placement is the whole point: `react-hooks/set-state-in-effect` is severity 2
 *     (ERROR) in this repo and three Phase 38 plans hit it independently.
 *   - THE ANALOG'S SECOND EFFECT (`progress-step.tsx:48-53`) IS A DEAD NO-OP. Its body is a comment,
 *     it clears no interval, and that importer therefore polls its finished job for as long as the
 *     tab stays open. This file clears the interval from inside the poll callback the moment a
 *     terminal status arrives, IN ADDITION to the cleanup's `clearInterval`. Both are gated, and the
 *     gate for the first one has a run negative proof (T-39-33).
 *   - The analog's null state renders a hardcoded `"Initializing import..."`. There is no such state
 *     here: `page.tsx` server-renders the scan row, so the first paint already knows which of the
 *     four renderings is correct and never shows a placeholder.
 *   - The analog's presentation is this phase's named anti-pattern — `text-green-600`,
 *     `text-orange-500`, and a `grid grid-cols-2 md:grid-cols-4` of large-type stat tiles. None of it
 *     is here (K-2, P-8), and the gate counts the literal colour prefixes at zero.
 *
 * TIME IS FORMATTED ON THE SERVER, NOT HERE. `lastRunLabel` arrives pre-built from `page.tsx`.
 * A relative-time string computed in a client component differs between the SSR render and
 * hydration for anything less than a minute old — which is exactly the age of a scan that just
 * finished — and `src/components/ui/relative-time.tsx` carries a documented lint suppression for
 * that same problem. 39-UI-SPEC also rules that component out for `dedup.scan.lastRun` specifically:
 * it renders an element, and this copy is a sentence whose word order differs across the three
 * locales. `useFormatter().number` IS used here, because a formatted integer does not depend on now.
 *
 * WHAT IS NOT A CONTROL. The cancel button's absence for a viewer who did not start the scan is
 * presentation; `cancelDuplicateScan` performs the `scan.userId !== session.user.id` comparison and
 * refuses a non-starter even when the caller is an admin (T-39-08). The CTA's absence during a run is
 * presentation; `createScanState`'s per-entity-type guard is the check — and that guard is
 * read-then-write, therefore advisory rather than atomic, which is why nothing below presents
 * single-flight as a promise: a refused start is handled as a normal outcome instead.
 */

import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
import { useEffect, useState, useTransition, type ReactNode } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ProgressBar } from "@/components/ui/progress-bar"
import type { MergeableEntityType } from "@/lib/dedup/types"

import {
  cancelDuplicateScan,
  getScanProgress,
  startDuplicateScan,
  type ScanProgressPayload,
} from "./actions"

/** One second, the same cadence as the importer's poll. */
const SCAN_POLL_INTERVAL_MS = 1000

/**
 * How many consecutive "no such scan" answers are tolerated before the panel gives up.
 *
 * `getScanProgress` answers `{ success: true, scan: null }` for a row that does not exist, which
 * covers two very different situations: the row has not been INSERTed yet (the launch is
 * fire-and-forget, so the first poll can outrun it) and the row has been reaped by
 * `scan-cleanup.ts`. A few misses are the first case; a run of them is the second, and the honest
 * response is to fall back to the idle rendering rather than to spin forever.
 */
const MAX_MISSING_POLLS = 5

type ScanStatus = ScanProgressPayload["status"]

/**
 * The statuses after which there is nothing left to poll for.
 *
 * `cancelled` is in here and `idle` is not. A cancel raises a flag; the scan loop is what turns the
 * status terminal, so a cancelled scan is still worth polling until the loop notices — it is
 * terminal because the STATUS says so, never because a button was pressed.
 */
const TERMINAL_STATUSES: readonly ScanStatus[] = ["completed", "cancelled", "error"]

function isTerminal(status: ScanStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

// ---------------------------------------------------------------------------------------
// The four renderings
// ---------------------------------------------------------------------------------------

/**
 * Never scanned: the CTA, and the promise that the user may leave.
 *
 * The CTA is this surface's ONE primary-filled button (39-UI-SPEC § Color). `backgroundHint` is
 * mandatory here and in the running rendering (P-5) — the single most likely user error on this page
 * is sitting on it for minutes because nothing said they could navigate away.
 */
function ScanIdlePanel({
  entityType,
  onStart,
}: {
  entityType: MergeableEntityType
  onStart: () => void
}) {
  const t = useTranslations("dedup")

  return (
    <>
      <div>
        <Button onClick={onStart}>
          {entityType === "organization" ? t("scan.startOrganizations") : t("scan.startPeople")}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">{t("scan.backgroundHint")}</p>
    </>
  )
}

/**
 * The cancel control. Rendered ONLY for the viewer who started the scan (P-6).
 *
 * `variant="outline"`: stopping a scan is not the action this page exists for, and the accent is
 * already spent on the CTA.
 */
function ScanCancelButton({ onCancel, pending }: { onCancel: () => void; pending: boolean }) {
  const t = useTranslations("dedup")

  return (
    <Button variant="outline" onClick={onCancel} disabled={pending}>
      {t("scan.cancel")}
    </Button>
  )
}

/**
 * What a viewer who did NOT start the scan sees in place of the cancel control (P-6).
 *
 * A running scan belongs to an entity type, not to a user, so everyone who opens the page watches
 * the same job — and two admins cancelling each other's is a support ticket, not a feature. This
 * component deliberately renders no control at all, and the gate asserts that by name.
 */
function ScanStarterNote({ name }: { name: string }) {
  const t = useTranslations("dedup")

  return <p className="text-muted-foreground text-xs">{t("scan.startedBy", { name })}</p>
}

/**
 * A scan in flight: a determinate bar, never a bare spinner (P-1).
 *
 * `progressLabel` is absent for the first moment of every scan, before the count query has returned
 * a total — and an unknown total is rendered as nothing rather than as "0 of 0 records compared".
 *
 * NO STAT TILES AND NO PER-PHASE BREAKDOWN (P-8). One track, one sentence, one control.
 */
function ScanRunningPanel({
  current,
  total,
  percentage,
  progressLabel,
  canCancel,
  starterName,
  onCancel,
  cancelPending,
}: {
  current: number
  total: number
  percentage: number
  progressLabel: string | undefined
  canCancel: boolean
  starterName: string | null
  onCancel: () => void
  cancelPending: boolean
}) {
  const t = useTranslations("dedup")

  return (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <Loader2 className="text-primary size-4 shrink-0 animate-spin" aria-hidden="true" />
        <h2 className="min-w-0 text-lg leading-tight font-semibold">{t("scan.running")}</h2>
      </div>

      <ProgressBar
        percentage={percentage}
        current={current}
        total={total}
        countsLabel={progressLabel}
      />

      {canCancel ? <ScanCancelButton onCancel={onCancel} pending={cancelPending} /> : null}
      {starterName === null ? null : <ScanStarterNote name={starterName} />}

      <p className="text-muted-foreground text-xs">{t("scan.backgroundHint")}</p>
    </>
  )
}

/**
 * A finished scan: when it ran, and the way to run it again.
 *
 * `lastRunLabel` is `null` for a CANCELLED scan on purpose. "Last scanned {time}" is a claim that a
 * scan completed, and a cancelled one compared some unknown prefix of the records — the pairs it did
 * find are real and are listed below, but the sentence would not be true. Saying less is the only
 * honest option in the catalog.
 */
function ScanCompletedPanel({
  lastRunLabel,
  onStart,
}: {
  lastRunLabel: string | null
  onStart: () => void
}) {
  const t = useTranslations("dedup")

  return (
    <>
      {lastRunLabel === null ? null : (
        <p className="text-muted-foreground text-xs">{lastRunLabel}</p>
      )}
      <div>
        <Button onClick={onStart}>{t("scan.rescan")}</Button>
      </div>
    </>
  )
}

/**
 * A scan that did not finish (P-4).
 *
 * `Alert variant="destructive"` because this one IS an error, unlike the create-time duplicate
 * warning. The body's promise — that no records were changed — is true for both ways of arriving
 * here: a scan that errored mid-run only ever INSERTs pair rows, and a launch the server refused
 * never started at all.
 */
function ScanFailedPanel({ onStart }: { onStart: () => void }) {
  const t = useTranslations("dedup")

  return (
    <>
      <Alert variant="destructive">
        <AlertTitle>{t("scan.failed")}</AlertTitle>
        <AlertDescription>{t("scan.failedBody")}</AlertDescription>
      </Alert>
      <div>
        <Button onClick={onStart}>{t("scan.rescan")}</Button>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------------------

export interface ScanPanelProps {
  entityType: MergeableEntityType
  /**
   * The latest scan of this entity type, resolved by the server render. `null` means this type has
   * never been scanned.
   *
   * The same payload the poll returns, so the first paint and every subsequent tick agree on their
   * shape. It carries `startedByViewer` rather than the starter's user id — plan 39-11's decision,
   * and the reason a viewer never receives another user's id.
   */
  initialScan: ScanProgressPayload | null
  /** The starter's display name, for P-6's note. `null` when it is unknown or the viewer's own. */
  startedByName: string | null
  /** `dedup.scan.lastRun`, pre-built by the server. `null` unless a scan COMPLETED. */
  lastRunLabel: string | null
}

export function ScanPanel({
  entityType,
  initialScan,
  startedByName,
  lastRunLabel,
}: ScanPanelProps) {
  const t = useTranslations("dedup")
  const format = useFormatter()
  const router = useRouter()

  const [scan, setScan] = useState<ScanProgressPayload | null>(initialScan)
  const [launchFailed, setLaunchFailed] = useState(false)
  const [cancelRequested, setCancelRequested] = useState(false)
  const [isCancelling, startCancelTransition] = useTransition()

  /**
   * The id the poll asks about, or `null` for "nothing to poll".
   *
   * Deriving it during render rather than storing it is what keeps the effect's dependency honest: a
   * terminal status turns this to `null`, the effect re-runs, its cleanup clears the interval, and no
   * further request is made. That is the SECOND of the two stops — the first is inside the poll
   * callback — and the reason there are two is that the analog's equivalent effect stops nothing.
   */
  const pollScanId = scan !== null && !isTerminal(scan.status) ? scan.scanId : null

  useEffect(() => {
    if (pollScanId === null) return

    let mounted = true
    let missing = 0

    const poll = async () => {
      const result = await getScanProgress(pollScanId)

      if (!mounted) return

      if (!result.success) {
        // A refusal will be refused again a second later. Stop rather than retry forever.
        clearInterval(interval)
        return
      }

      if (result.scan === null) {
        missing += 1
        if (missing >= MAX_MISSING_POLLS) {
          clearInterval(interval)
          setScan(null)
        }
        return
      }

      setScan(result.scan)

      if (isTerminal(result.scan.status)) {
        clearInterval(interval)
        // The pairs the scan wrote are server-rendered, so the finished scan needs a fresh render
        // to become a list. Without this the user reads "scan complete" above an empty panel.
        router.refresh()
      }
    }

    /*
      THE INTERVAL IS CREATED BEFORE THE FIRST FETCH, which is the one place the shape of the analog's
      loop is deliberately altered (it calls its poller first and assigns afterwards). Here the poll
      callback clears the interval itself, so it must be able to see it: if the very first answer is
      already terminal, the clear has to have something to clear.
    */
    const interval = setInterval(poll, SCAN_POLL_INTERVAL_MS)
    void poll()

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [pollScanId, router])

  /**
   * Launch, fire-and-forget: the id is generated here, the action is NOT awaited, and the running
   * rendering appears in the same tick — `pipedrive-api-wizard.tsx`'s `handleStartImport` verbatim in
   * shape. Awaiting would leave the user looking at an unchanged page for the length of the insert.
   *
   * THE OUTCOME IS STILL HANDLED, which the analog does not do. `startDuplicateScan` itself returns
   * as soon as the row exists (it is the ACTION that does not await the scan), so a refusal comes
   * back in milliseconds — and an unhandled refusal would leave a progress bar advertising a scan
   * that never started.
   */
  function handleStart() {
    const scanId = crypto.randomUUID()

    setLaunchFailed(false)
    setCancelRequested(false)
    setScan({
      scanId,
      entityType,
      status: "running",
      cancelled: false,
      current: 0,
      total: 0,
      percentage: 0,
      startedAt: new Date().toISOString(),
      startedByViewer: true,
    })

    startDuplicateScan(scanId, entityType)
      .then((result) => {
        if (result.success) return

        if (result.code === "SCAN_RUNNING") {
          /*
            Someone else's scan of this entity type started first — the guard is per entity type and
            is advisory, so this is a reachable outcome rather than an impossible one. The server
            render is the authority on whose scan it is and how far along, so ask for it instead of
            inventing an error: the panel comes back as a running scan with the other user's name and
            no cancel control.
          */
          setScan(null)
          router.refresh()
          return
        }

        setScan(null)
        setLaunchFailed(true)
      })
      .catch(() => {
        setScan(null)
        setLaunchFailed(true)
      })
  }

  /**
   * Cancel. Raising the flag is all this does — the scan loop reads it between batches and is what
   * writes the terminal status, so the bar keeps moving for up to one batch afterwards. That is why
   * the control disappears on success instead of a toast claiming the scan has stopped: the poll
   * reporting `cancelled` is the truthful confirmation, and it arrives on its own.
   *
   * A FAILED CANCEL INVENTS NO COPY. There is no cancel-failure sentence in the catalog and this plan
   * does not add one, because the failure is self-evident on screen: the control comes back and the
   * progress bar visibly carries on. The refresh re-reads the server's version of who owns the scan,
   * which is the one thing a client cannot conclude for itself.
   */
  function handleCancel() {
    if (scan === null) return

    const scanId = scan.scanId
    setCancelRequested(true)

    startCancelTransition(async () => {
      const result = await cancelDuplicateScan(scanId)

      if (!result.success) {
        setCancelRequested(false)
        router.refresh()
      }
    })
  }

  /**
   * `p-4` and a 16px internal rhythm, per 39-UI-SPEC § Spacing. `Card`'s own `py-6 gap-6` is
   * overridden rather than wrapped, so the panel matches the pair cards below it instead of being
   * inset further than they are.
   */
  const shell = (children: ReactNode) => <Card className="gap-4 p-4">{children}</Card>

  if (scan === null) {
    /*
      P-7 lives here by construction: while a scan of this entity type runs, the CTA is not disabled —
      it is REPLACED by the running rendering, which is the visible reason it is unavailable. A greyed
      button with no explanation is what the rule forbids.
    */
    return shell(
      launchFailed ? (
        <ScanFailedPanel onStart={handleStart} />
      ) : (
        <ScanIdlePanel entityType={entityType} onStart={handleStart} />
      )
    )
  }

  if (scan.status === "error") {
    return shell(<ScanFailedPanel onStart={handleStart} />)
  }

  if (scan.status === "completed" || scan.status === "cancelled") {
    return shell(
      <ScanCompletedPanel
        lastRunLabel={scan.status === "completed" ? lastRunLabel : null}
        onStart={handleStart}
      />
    )
  }

  /*
    Everything else is in flight. `idle` reaches this branch as well as `running`: the row is
    INSERTed with the default status and the loop moves it on, so a freshly created scan is a
    started scan from the user's position, and rendering a CTA for it would offer to start it twice.

    `{current}` and `{total}` are pre-formatted here rather than inside the catalog, because
    `dedup.scan.progress` is one sentence in three languages whose word order differs and whose
    numbers must still be grouped by the viewer's locale.
  */
  const progressLabel =
    scan.total > 0
      ? t("scan.progress", {
          current: format.number(scan.current),
          total: format.number(scan.total),
        })
      : undefined

  return shell(
    <ScanRunningPanel
      current={scan.current}
      total={scan.total}
      percentage={scan.percentage}
      progressLabel={progressLabel}
      canCancel={scan.startedByViewer && !cancelRequested}
      starterName={scan.startedByViewer ? null : startedByName}
      onCancel={handleCancel}
      cancelPending={isCancelling}
    />
  )
}
