"use client"

/**
 * WFOPS-02 — the editor's TEST RUN affordance: the toolbar trigger, the trigger-data editor, and the
 * bounded wait that lands the operator on the finished run.
 *
 * WHY THE DIALOG OWNS THE WAIT, rather than navigating the moment the run is created. A dry run is
 * inserted as a `pending` row and claimed asynchronously by the execution processor, and the run
 * detail page is a SERVER component with no polling of its own. Navigating immediately would put the
 * operator on an empty run they have to reload by hand — and what this feature exists for is reading
 * per-node output and seeing the changed-records panel read empty, both of which need a FINISHED
 * run. So the wait happens here, which also confines every asynchronous moving part of this feature
 * to one client component and leaves the run detail page, its step list, its step detail and its JSON
 * viewer behaviourally untouched.
 *
 * WHY A DIALOG AND NOT THE EDITOR'S SIDE PANEL. `side-panel.tsx:100` is a fixed `w-[400px]`, which
 * already overflows a 320px viewport before anything is added to it; the panel is single-slot and
 * owned by node selection, so opening a test run there would deselect the node being configured; and
 * the interaction is edit-then-confirm-then-wait, which is a modal shape — the side panel has no
 * confirm affordance. Do not reopen this.
 *
 * WHY THE TRIGGER REFUSES AN UNSAVED EDITOR (T-41-83). `startDryRun` hands a workflow ID to the
 * engine, which loads the PERSISTED definition. With unsaved edits on screen the test would silently
 * exercise the old definition and report on something the operator is not looking at — a false green
 * on a workflow they believe they just fixed. Hence `disabled={dirty}`, a `title`, AND a visible
 * hint the trigger points at with `aria-describedby`: a `title` alone is invisible to touch, because
 * there is no hover on a phone, and several screen readers do not announce it.
 *
 * THE POLL IS `src/app/duplicates/scan-panel.tsx` IN SHAPE, including both of its stops and the two
 * lint facts its header records:
 *
 *   - every `setState` lives inside the async callback `setInterval` invokes, NEVER in the effect
 *     body. `react-hooks/set-state-in-effect` is severity 2 (ERROR) in this repo and three Phase 38
 *     plans hit it independently.
 *   - the interval is created BEFORE the first `void poll()`, because the callback clears the
 *     interval itself and therefore has to be able to see it: if the very first answer is already
 *     terminal, the clear needs something to clear.
 *   - the polled id is DERIVED during render rather than stored as a boolean. A stop turns it to
 *     `null`, the effect re-runs, and its cleanup clears the interval. That is the second,
 *     independent stop, and the reason there are two is that scan-panel's own analog
 *     (`progress-step.tsx:48-53`) has a second effect whose body is a comment and stops nothing.
 *
 * WHAT SCAN-PANEL DOES NOT PROVIDE, and is new here: a WALL-CLOCK deadline. That file bounds by a
 * consecutive-miss count. This one bounds by elapsed time, so a slow poll cannot extend the budget —
 * and the deadline is an absolute timestamp captured at launch and held in state rather than a
 * `Date.now()` recorded inside the effect, because an effect that re-runs for any reason would
 * otherwise restart the clock and the budget would never elapse.
 *
 * THE THIRD STOP IS `status === null`. `getWorkflowRunStatus` answers a row that does not exist with
 * `{ success: true, status: null }` — a SUCCESS, deliberately, because a run may legitimately have
 * been pruned and a poller has to be able to stop rather than retry (T-41-67). A poller that only
 * watches for a terminal status polls forever against a run that is not there, one request per
 * second, from every open editor tab.
 *
 * F-41-1 — NOTHING HERE ASSERTS THE RUN CHANGED NOTHING. No "no records were changed", no reassuring
 * banner, no green tick, and no promise that the run WILL prove non-mutation. 41-CONTEXT: "An empty
 * list that is normally populated is evidence; a reassuring sentence is not." The proof is
 * `run-changed-records.tsx` rendering its existing empty state on the run detail page — the same
 * state a real run that happened to change nothing would produce, and that equivalence is the point.
 * `dryRun.description` states what is SIMULATED, which is a property of the execution, not a
 * conclusion offered to the operator.
 */

import { FlaskConical, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { getWorkflowRunStatus, startDryRun } from "@/app/workflows/actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { WorkflowStatus } from "@/db/schema/workflows"

/** One second, the same cadence `scan-panel.tsx` and the importer's progress poll both use. */
const DRY_RUN_POLL_INTERVAL_MS = 1000

/**
 * How long the dialog is willing to wait for a verdict before handing the operator back to the
 * editor with a pointer at the run history.
 *
 * THIRTY SECONDS IS REACHABLE IN NORMAL OPERATION, and this is not an error budget. The execution
 * processor polls every 5 s, so a fresh dry run waits up to 5 s before it is even claimed; and
 * serial enforcement queues a dry run behind any `running` or `waiting` run of the same workflow, so
 * a workflow with a parked delay will never be claimed inside this budget at all. That is honest
 * behaviour and `dryRun.timeout` is its state — do not treat it as a failure and do not raise the
 * budget to hide it.
 */
const DRY_RUN_POLL_BUDGET_MS = 30_000

/**
 * The statuses after which there is nothing left to poll for.
 *
 * `cancelled` is deliberately absent: it is not a member of `WorkflowStatus`. `waiting` is
 * deliberately absent too — it is a run parked on a delay, which is not finished — though plan
 * 41-05's amendment A2 means a dry run skips the delay WAIT and should never reach it.
 */
const TERMINAL_STATUSES: readonly WorkflowStatus[] = ["completed", "failed"]

function isTerminal(status: WorkflowStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

/** The two ways trigger data can be refused, named exactly as `startDryRun` names them. */
type ValidationFailure = "invalidJson" | "notAnObject"

/**
 * THIS PARSE IS FEEDBACK, NOT A TRUST BOUNDARY (T-41-81). `startDryRun` parses the same string again
 * on the server and applies the same two refusals, and that one is the boundary: this function
 * exists so a person who missed a comma is told which comma rather than watching a run fail. The two
 * outcomes stay distinct because "trigger data must be valid JSON" tells someone who typed a
 * perfectly valid array nothing at all.
 *
 * `typeof x === "object"` alone admits both `null` and every array, and the parsed value reaches the
 * QuickJS transform sandbox, so all three are excluded explicitly — the same test the server runs.
 */
function validateTriggerData(json: string): ValidationFailure | null {
  let parsed: unknown

  try {
    parsed = JSON.parse(json)
  } catch {
    return "invalidJson"
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return "notAnObject"
  }

  return null
}

/** Where the wait has got to. `deadline` is an absolute timestamp, captured once at launch. */
type WaitState =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "polling"; runId: string; deadline: number }

export interface DryRunDialogProps {
  workflowId: string
  /** From the editor store. The trigger refuses to run a definition the operator cannot see. */
  dirty: boolean
  /**
   * The `data` payload of this workflow's most recent NON-test run, or `null` when it has never run.
   *
   * Passed in rather than fetched here: the editor page already reads this workflow server-side, and
   * a second round trip from a client component to prefill a textarea is a request nobody needs.
   */
  latestTriggerData: Record<string, unknown> | null
}

export function DryRunDialog({ workflowId, dirty, latestTriggerData }: DryRunDialogProps) {
  const t = useTranslations("workflows")
  const tCommon = useTranslations("common")
  const router = useRouter()

  const hasPrefill = latestTriggerData !== null

  const [open, setOpen] = useState(false)
  const [triggerJson, setTriggerJson] = useState(() =>
    // `{}` is CODE, not copy: it is the JSON an operator would type for an empty envelope, so it
    // never goes near the translator.
    latestTriggerData === null ? "{}" : JSON.stringify(latestTriggerData, null, 2)
  )
  const [failure, setFailure] = useState<ValidationFailure | null>(null)
  const [wait, setWait] = useState<WaitState>({ phase: "idle" })

  const running = wait.phase === "starting" || wait.phase === "polling"

  /*
   * Resolved during render, not inside the effect. `t` is a hook result and putting it in the
   * effect's dependency list would make an identity change restart the interval; a plain string
   * cannot.
   */
  const timeoutMessage = t("dryRun.timeout")
  const startFailedMessage = t("dryRun.error")

  let validationMessage: string | null = null
  if (failure === "invalidJson") validationMessage = t("dryRun.invalidJson")
  if (failure === "notAnObject") validationMessage = t("dryRun.notAnObject")

  /**
   * The id the poll asks about, and its deadline, or `null` for "nothing to poll".
   *
   * Derived during render rather than stored, which is what keeps the effect's dependency honest: a
   * stop sets the wait back to idle, this turns `null`, the effect re-runs and its cleanup clears
   * the interval. That is the second of the two stops.
   */
  const pollRunId = wait.phase === "polling" ? wait.runId : null
  const pollDeadline = wait.phase === "polling" ? wait.deadline : 0

  useEffect(() => {
    if (pollRunId === null) return

    let mounted = true

    const poll = async () => {
      /*
        THE DEADLINE IS CHECKED BEFORE THE REQUEST, NOT AFTER IT (WR-04). A Next.js server action
        REJECTS rather than returning `{ success: false }` on a transport-level failure — a
        container restart or a DB outage inside this 30-second window, a proxy hiccup, a deploy —
        and a request that hangs never resolves at all. With the check after the await, neither
        outcome ever reaches it: `clearInterval` is never called, the budget is never evaluated, and
        the dialog issues one request per second forever, from every open editor tab, with an
        unhandled rejection each time. Evaluated first, the budget holds whatever the request does.
      */
      if (Date.now() >= pollDeadline) {
        clearInterval(interval)
        setWait({ phase: "idle" })
        setOpen(false)
        toast.info(timeoutMessage)
        return
      }

      let result: Awaited<ReturnType<typeof getWorkflowRunStatus>>

      try {
        result = await getWorkflowRunStatus(workflowId, pollRunId)
      } catch {
        /*
          A TRANSPORT FAILURE SAYS NOTHING ABOUT THE RUN. The run may well have finished; only this
          request did not arrive. So this is not `dryRun.error` and not a stop — keep polling, and
          let the deadline above end the wait. A rejection that escaped this async callback would
          also skip the `clearInterval` below and leave the interval running past every stop.
        */
        return
      }

      if (!mounted) return

      if (!result.success) {
        // A refusal will be refused again a second later. Stop rather than retry forever.
        clearInterval(interval)
        setWait({ phase: "idle" })
        setOpen(false)
        toast.error(startFailedMessage)
        return
      }

      if (result.status === null) {
        /*
          THE ROW IS NOT THERE. `getWorkflowRunStatus` reports that as a success on purpose, because
          a run can be pruned. It shares an outcome with the deadline below rather than getting its
          own string: both mean "this dialog stopped waiting without a verdict", and both leave the
          operator with the same one useful next step, which `dryRun.timeout` states.
        */
        clearInterval(interval)
        setWait({ phase: "idle" })
        setOpen(false)
        toast.info(timeoutMessage)
        return
      }

      if (isTerminal(result.status)) {
        clearInterval(interval)
        setWait({ phase: "idle" })
        setOpen(false)
        router.push(`/workflows/${workflowId}/runs/${pollRunId}`)
        return
      }
    }

    /*
      THE INTERVAL IS CREATED BEFORE THE FIRST FETCH. The poll callback clears the interval itself,
      so it has to be able to see it: if the very first answer is already terminal, the clear needs
      something to clear.
    */
    const interval = setInterval(poll, DRY_RUN_POLL_INTERVAL_MS)
    void poll()

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [pollRunId, pollDeadline, workflowId, router, timeoutMessage, startFailedMessage])

  /**
   * VALIDATION HAPPENS HERE, ON SUBMIT, and not on every keystroke: red text under someone who is
   * halfway through typing an object is hostile, and every partial object is invalid. The submit
   * button stays enabled through a refusal so the fix is one edit and one press away.
   *
   * The server's own two refusals are mapped back onto the same two messages. They should be
   * unreachable — this function just checked — but a refusal shown as "it didn't start" when the
   * reason is a bad payload would send the operator looking in the wrong place.
   */
  async function handleSubmit() {
    const refusal = validateTriggerData(triggerJson)

    if (refusal !== null) {
      setFailure(refusal)
      return
    }

    setFailure(null)
    setWait({ phase: "starting" })

    let result: Awaited<ReturnType<typeof startDryRun>>

    try {
      result = await startDryRun(workflowId, triggerJson)
    } catch {
      /*
        A REJECTED SERVER ACTION USED TO WEDGE THIS DIALOG PERMANENTLY (WR-04). The rejection
        propagated out of the floating promise the onClick created, `wait` stayed `{ phase:
        "starting" }` forever, and `running` stayed true — Confirm and Cancel both disabled, the
        Textarea readOnly, the spinner never stopping, and no way out but a page reload, with the
        operator's typed trigger data trapped behind a disabled control.

        Same outcome as a returned failure: nothing ran, so the dialog stays OPEN with the trigger
        data still on screen, and `dryRun.error` says exactly that.
      */
      setWait({ phase: "idle" })
      toast.error(startFailedMessage)
      return
    }

    if (result.success) {
      setWait({
        phase: "polling",
        runId: result.runId,
        deadline: Date.now() + DRY_RUN_POLL_BUDGET_MS,
      })
      return
    }

    setWait({ phase: "idle" })

    if (result.error === "invalidJson" || result.error === "notAnObject") {
      setFailure(result.error)
      return
    }

    // The dialog stays OPEN and the buttons re-enable: nothing ran, so there is nothing to go and
    // look at, and the trigger data the operator typed is still on screen to retry with.
    toast.error(startFailedMessage)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={dirty}
            title={dirty ? t("dryRun.dirtyHint") : undefined}
            aria-describedby={dirty ? "dry-run-dirty-hint" : undefined}
          >
            <FlaskConical className="mr-1 h-4 w-4" aria-hidden="true" />
            {t("dryRun.action")}
          </Button>
        </DialogTrigger>

        <DialogContent>
          <DialogHeader>
            {/* leading-none (dialog.tsx:149) collides a wrapped title's descenders with the next
                line's ascenders, and both the pt-BR and es-ES titles wrap in the 240px a
                DialogContent leaves at 320px. */}
            <DialogTitle className="leading-tight">{t("dryRun.title")}</DialogTitle>
            <DialogDescription>{t("dryRun.description")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="dry-run-trigger-data">{t("dryRun.triggerDataLabel")}</Label>

            {/* NO FONT-SIZE CLASS. textarea.tsx:12 is "text-base md:text-sm" deliberately — 16px
                below the md breakpoint so iOS does not zoom the whole editor on focus. And no
                wrap="off": that would make this a horizontal scroll container, which R-5 forbids. */}
            <Textarea
              id="dry-run-trigger-data"
              className="font-mono min-h-[160px] max-h-[320px] overflow-y-auto"
              value={triggerJson}
              onChange={(event) => setTriggerJson(event.target.value)}
              spellCheck={false}
              autoComplete="off"
              readOnly={running}
              aria-invalid={validationMessage !== null}
              aria-describedby={validationMessage === null ? undefined : "dry-run-trigger-error"}
            />

            {hasPrefill && (
              <p className="text-sm text-muted-foreground">{t("dryRun.prefilledHint")}</p>
            )}
            {!hasPrefill && (
              <p className="text-sm text-muted-foreground">{t("dryRun.emptyHint")}</p>
            )}

            {/* Text only — no fill, no border-colour change, no Alert block. A mistyped comma is not
                a failure of the workflow, and dressing it as one says it is. */}
            {validationMessage !== null && (
              <p
                id="dry-run-trigger-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {validationMessage}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>
              {tCommon("cancel")}
            </Button>
            <Button variant="default" onClick={handleSubmit} disabled={running}>
              {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {running ? t("dryRun.running") : t("dryRun.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/*
        The visible half of the disabled trigger's explanation, and the node its aria-describedby
        points at. It renders in the toolbar row beside the trigger, in the same
        text-xs text-muted-foreground the existing "Unsaved changes" marker uses, so it reads as a
        note on that marker rather than as a second one.
      */}
      {dirty && (
        <span id="dry-run-dirty-hint" className="text-xs text-muted-foreground">
          {t("dryRun.dirtyHint")}
        </span>
      )}
    </>
  )
}
