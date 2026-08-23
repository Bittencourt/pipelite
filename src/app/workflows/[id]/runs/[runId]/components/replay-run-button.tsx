"use client"

/**
 * THE REPLAY CONTROL — WFOPS-01's operator half.
 *
 * WHY A CONFIRM DIALOG AT ALL, when the webhook DLQ replay next door
 * (`admin/webhooks/[id]/delivery-table.tsx:108-116`) fires on a single click. A webhook replay
 * re-delivers ONE payload to ONE endpoint. A workflow replay starts a NEW run from node one, so
 * every step that already SUCCEEDED before the failure runs again: its emails send again, its
 * outgoing HTTP calls fire again, its CRM writes repeat. `.env` points SMTP at a real relay. An
 * operator clicking a button labelled "Replay" on a failed run does not necessarily expect to
 * duplicate the successful half of it, and `replay.confirmBody` is the only place they are told.
 * That string is load-bearing; it is not a courtesy. Do not truncate it, do not split it across
 * elements, do not add a "learn more" that hides half of it behind a click.
 *
 * CONSEQUENTIAL, NOT DESTRUCTIVE — and the styling says so deliberately. This tree copies
 * `delete-workflow-dialog.tsx`'s shape (plain `Dialog`, `DialogHeader`, `DialogFooter`, outline
 * Cancel) but OMITS its `rounded-lg bg-destructive/10 p-2` tile and the `AlertTriangle` inside it,
 * and the confirm button is `variant="default"` rather than `variant="destructive"`. That tile is
 * what marks the delete dialog as destructive; copying it here would tell the operator that
 * replaying a failed run is dangerous, when nothing is lost by it — the origin run is an immutable
 * historical record and the replay is a new row. Nothing is deleted, so `AlertDialog` is wrong too.
 * The copy carries the weight; the chrome does not amplify it.
 *
 * WHY IT NAVIGATES. Criterion 1 is "gets a new run with its own step history", and the operator has
 * to be able to SEE it — so success pushes to the new run's detail page rather than staying put.
 * At that instant the new run is `pending` with no steps yet; that is honest, and its status badge
 * says exactly that.
 *
 * WHY FAILURE LEAVES THE DIALOG OPEN. Closing on failure discards the operator's context for a
 * retry: they would be back on the origin run with a toast and no dialog, having to re-open and
 * re-read the consequence copy. The transition ending re-enables both buttons on its own.
 *
 * THE PENDING TEXT LIVES INSIDE THE CONFIRM BUTTON, not beside it. That changes the button's
 * accessible NAME, which is what makes the state announced rather than merely visible — a spinner
 * with `aria-hidden` and no text change is invisible to a screen reader.
 *
 * NO `aria-label` ANYWHERE HERE. Both icons sit beside visible text, so both are `aria-hidden`;
 * there is no icon-only control in this phase and therefore no touch-target question either.
 *
 * NO `focus:ring-*` CLASS. `globals.css:148-153` already gives every button a
 * `2px solid var(--primary)` `:focus-visible` outline; adding one here would double it.
 *
 * NO `closeLabel` ON `DialogContent`. The primitive binds `common.close` itself
 * (`dialog.tsx:68`), which is why the roughly sixteen existing call sites pass nothing.
 *
 * i18n — the seam UI-SPEC § i18n Scope declares. The `/workflows` tree is English literals today;
 * every string THIS PHASE authors goes through a translator anyway (`run-changed-records.tsx:14-19`
 * is the in-tree precedent). So a translated Replay button will sit beside an English "Back to
 * Runs" and "Duration:". That is the declared trade, not an inconsistency to fix here.
 *
 * RENDERING THIS IS NOT AUTHORIZATION. The page renders it only for a failed run, and
 * `replayWorkflowRun` independently re-checks `isRunReplayable` after re-scoping the origin lookup
 * by BOTH ids (T-41-75). Two controls, and the client one is the disposable one.
 */

import { Loader2, RotateCcw } from "lucide-react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { replayWorkflowRun } from "@/app/workflows/actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface ReplayRunButtonProps {
  workflowId: string
  runId: string
}

export function ReplayRunButton({ workflowId, runId }: ReplayRunButtonProps) {
  const t = useTranslations("workflows")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await replayWorkflowRun(workflowId, runId)

      if (!result.success) {
        // Deliberately no `setOpen(false)`: see the header note on retry context. The server's
        // own message is not surfaced — it names an internal predicate, and the operator's next
        // action is the same either way.
        toast.error(t("replay.error"))
        return
      }

      setOpen(false)
      toast.success(t("replay.success"))
      router.push(`/workflows/${workflowId}/runs/${result.runId}`)
    })
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <RotateCcw className="h-3 w-3 mr-1" aria-hidden="true" />
        {t("replay.action")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            {/*
              `leading-tight` is a MEASUREMENT, not a preference. `DialogTitle` ships `leading-none`
              (`dialog.tsx:149`); at 320px a `DialogContent` gives 240px of content, and in
              `text-lg` the es-ES title "¿Repetir esta ejecución?" wraps to two lines at that
              width, where `leading-none` collides line 1's descenders with line 2's ascenders.
            */}
            <DialogTitle className="leading-tight">
              {t("replay.confirmTitle")}
            </DialogTitle>
            <DialogDescription className="pt-4">
              {t("replay.confirmBody")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              variant="default"
              onClick={handleConfirm}
              disabled={isPending}
            >
              {isPending && (
                <Loader2
                  className="mr-2 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              )}
              {isPending ? t("replay.pending") : t("replay.confirmAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
