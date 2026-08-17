"use client"

/**
 * The bulk soft-delete confirmation: count-aware, retention-aware, controlled.
 *
 * This dialog is the last thing between one click and up to a hundred writes, so its two sentences
 * carry the phase's safety contract. Both are read from the `bulk` namespace; neither is assembled
 * by concatenation, because every count here is an ICU plural and both es-ES and pt-BR inflect.
 *
 * THE RETENTION WINDOW IS NEVER DEFAULTED IN THIS FILE. `retentionDays` arrives as a plain
 * serializable prop from each server page, and the trash settings reader it ultimately comes from
 * deliberately has no code-level fallback: it yields `null` whenever the window is unset, corrupted,
 * tampered with or out of range, and in that state nothing is purged automatically at all. A numeric
 * default here — a nullish coalesce, an or-default, a literal thirty — would make the UI promise a
 * window its own deployment does not have. Phase 37 named the rule: default in data, fail closed in
 * code. Hence two separate strings selected on a strict null check, and hence the source gate that
 * pins the absence of any numeric default in this file.
 *
 * CONTROLLED, WITH NO TRIGGER COMPONENT OF ITS OWN — the non-definer shape `trash-table.tsx` uses.
 * CFUI-01 is a hard boundary: a React element crossing the RSC boundary into a Radix `asChild` slot
 * renders nothing at all, silently, and a repo-wide scan fails the build on it. The caller owns
 * `open` and opens this from its own client module.
 *
 * There is deliberately no type-the-count gate. The action is reversible — every record lands in
 * Trash — and friction proportionate to an irreversible purge would train users to click straight
 * through Phase 37's purge dialog, where the friction is warranted.
 */

import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"

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

export interface BulkDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  count: number
  /** null means nothing is purged automatically; the copy must say so. NEVER default it. */
  retentionDays: number | null
  isDeleting: boolean
  onConfirm: () => void
}

export function BulkDeleteDialog({
  open,
  onOpenChange,
  count,
  retentionDays,
  isDeleting,
  onConfirm,
}: BulkDeleteDialogProps) {
  const t = useTranslations("bulk")

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Refusing to close while the request is running means ESC and an overlay click cannot
        // abandon writes that are already in flight.
        if (isDeleting) return
        onOpenChange(next)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteDialog.title", { count })}</AlertDialogTitle>
          <AlertDialogDescription>
            {retentionDays === null
              ? t("deleteDialog.descriptionNoRetention", { count })
              : t("deleteDialog.description", { count, days: retentionDays })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            {t("deleteDialog.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              // Radix closes on click by default; the dialog has to stay open while the request is
              // in flight so the spinner and the disabled state are visible.
              event.preventDefault()
              onConfirm()
            }}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? <Loader2 className="size-4 animate-spin" /> : null}
            {isDeleting
              ? t("deleteDialog.deleting")
              : t("deleteDialog.confirm", { count })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
