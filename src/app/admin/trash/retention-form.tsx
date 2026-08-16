"use client"

/**
 * The trash retention window control — input, validation, save transition, toast, and the
 * one destructive confirmation this surface adds.
 *
 * A near-exact mirror of `src/app/admin/audit/retention-form.tsx`. Two retention settings
 * that behave identically must not diverge structurally, or an operator has to relearn the
 * same control twice.
 *
 * WHY THE WHOLE INTERACTIVE SURFACE IS IN ONE MODULE (CFUI-01)
 * The confirmation dialog and the button that opens it both live here. That is a hard
 * boundary, not a preference: Radix's `SlotClone` silently renders `null` when an
 * `asChild` slot receives a React element that arrived across the RSC boundary, and the
 * repo-wide gate in `src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx`
 * fails the build for any server module that hands children to one. `page.tsx` passes this
 * component a single `number | null` and nothing else.
 *
 * The dialog is CONTROLLED (`open` / `onOpenChange`) with no trigger component of its own,
 * the same non-definer shape `src/components/timeline/delete-note-dialog.tsx` documents.
 *
 * THE TYPED VALUE IS RETAINED ON FAILURE
 * `value` is cleared or replaced in exactly one place — the success branch. A rejected save
 * and a thrown action land in the same handler, which re-enables the input with whatever
 * the operator typed still in it. Cancelling the confirmation leaves it there too, so they
 * can adjust the number rather than retype it.
 *
 * THE RANGE IS NOT IMPORTED, DELIBERATELY
 * `RETENTION_MIN` / `RETENTION_MAX` live in `src/lib/trash/settings.ts`, which imports the
 * database. Importing them here would drag a server-only module into the browser bundle,
 * so the two bounds are written out below instead. They are cosmetic either way: the input
 * bounds decide whether the button is enabled, and `writeTrashRetentionDays` — reached
 * through `saveTrashRetention`, which re-checks the admin role — is what actually enforces
 * the range. If those constants ever change, this file changes with them. The
 * `trash.retention.windowHelp` copy states the same 1-365 range; all three must agree.
 *
 * NO ERROR COLOUR ON AN OUT-OF-RANGE VALUE
 * The helper text states the allowed range and is always visible, and the Save button is
 * disabled until the value is inside it. A rule the operator can read before failing beats
 * one that scolds after, so the only red on this page is the confirmation's confirm button
 * and a failure toast (37-UI-SPEC § Color).
 *
 * THE SUCCESS TOAST IS NOT AN EXCEPTION TO PHASE 35'S RULE — IT IS THE MIRROR OF IT
 * "No success toast where the result is visible." A saved window looks byte-identical to an
 * unsaved one in the input, so there is no visible result to serve as the confirmation.
 *
 * THE READOUTS ARE NOT OPTIMISTICALLY UPDATED
 * The record count and the oldest deleted record only move when the pruner next runs. They
 * live in the server component and this module cannot touch them, which is the point.
 */

import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { saveTrashRetention } from "./actions"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/** Mirrors `RETENTION_MIN` / `RETENTION_MAX` — see the module header for why they are not imported. */
const MIN_DAYS = 1
const MAX_DAYS = 365

const INPUT_ID = "trash-retention-days"
const HELP_ID = "trash-retention-days-help"

interface RetentionFormProps {
  /** `null` when the window is unset — cleared, corrupted, or restored from a pre-0015 dump. */
  retentionDays: number | null
}

/**
 * `null` for anything that is not a whole number of days.
 *
 * The digits-only test is what rejects `1.5`, `1e3`, `-1`, ` `, `Infinity` and the empty
 * string, all of which `Number()` alone would either accept or turn into `0`. A `number`
 * input still hands back a string, so this is the only place the shape is decided.
 */
function parseDays(raw: string): number | null {
  const trimmed = raw.trim()

  if (!/^\d+$/.test(trimmed)) return null

  const parsed = Number(trimmed)

  return Number.isSafeInteger(parsed) ? parsed : null
}

export function RetentionForm({ retentionDays }: RetentionFormProps) {
  const t = useTranslations("trash")
  const [isPending, startTransition] = useTransition()

  const [value, setValue] = useState(
    retentionDays === null ? "" : String(retentionDays)
  )
  /**
   * The window the server currently holds. Tracked in state rather than read from the prop
   * on every render because a successful save has to move the baseline — otherwise the
   * button stays enabled on a value that is already stored, and the next click would
   * re-open the shorten confirmation for a shortening that already happened.
   */
  const [savedDays, setSavedDays] = useState(retentionDays)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const parsed = parseDays(value)
  const inRange = parsed !== null && parsed >= MIN_DAYS && parsed <= MAX_DAYS
  const changed = parsed !== null && parsed !== savedDays
  const canSave = inRange && changed && !isPending

  /** Only a LOWERED window destroys anything. Raising it, or setting it for the first time, does not. */
  const lowers = inRange && savedDays !== null && parsed !== null && parsed < savedDays

  function save(days: number) {
    startTransition(async () => {
      try {
        const result = await saveTrashRetention(days)

        if (result.success) {
          setSavedDays(days)
          setConfirmOpen(false)
          toast.success(t("retention.saved"))
          return
        }

        // A refusal and a thrown action are the same event to the operator, and neither
        // one touches what they typed.
        toast.error(t("retention.saveFailed"))
      } catch {
        toast.error(t("retention.saveFailed"))
      }
    })
  }

  function handleSave() {
    if (!canSave || parsed === null) return

    if (lowers) {
      setConfirmOpen(true)
      return
    }

    save(parsed)
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={INPUT_ID}>{t("retention.windowLabel")}</Label>

      <Input
        id={INPUT_ID}
        type="number"
        inputMode="numeric"
        min={MIN_DAYS}
        max={MAX_DAYS}
        step={1}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={isPending}
        aria-describedby={HELP_ID}
        className="max-w-32"
      />

      {/* Always present and always neutral. It is the rule, not a reaction to breaking it. */}
      <p id={HELP_ID} className="text-muted-foreground text-xs">
        {t("retention.windowHelp")}
      </p>

      {/* The one filled button this surface adds, and this page's primary visual anchor. */}
      <Button
        variant="default"
        className="mt-2"
        onClick={handleSave}
        disabled={!canSave}
      >
        {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
        {isPending ? t("retention.saving") : t("retention.save")}
      </Button>

      {/*
        Cancelling closes the dialog and leaves the typed value in the input untouched —
        `onOpenChange` writes nothing but the open flag.

        The copy says the next time trash is emptied, not "immediately", because the pruner
        is a daily timer and nothing is deleted when this button is pressed. The interface
        must not assert an outcome the system has not produced yet.
      */}
      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (isPending) return
          setConfirmOpen(open)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("retention.shortenDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("retention.shortenDialog.description", { days: parsed ?? 0 })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              {t("retention.shortenDialog.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // Radix closes on click by default; the dialog has to stay open while the
                // save is in flight so the spinner and the disabled state are visible.
                event.preventDefault()
                if (parsed !== null) save(parsed)
              }}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("retention.shortenDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
