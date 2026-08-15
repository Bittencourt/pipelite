"use client"

/**
 * The one destructive confirmation in phase 35.
 *
 * CFUI-01 (phase 44): this file is deliberately built as a NON-DEFINER. It takes
 * `open`/`onOpenChange` and renders no trigger of its own, so the repo-wide gate at
 * src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx never engages for it.
 * The shape is copied verbatim from src/app/admin/webhooks/delete-dialog.tsx. Do NOT
 * "simplify" this into a trigger-forwarding variant — that would put it in the definer
 * set and make every future server-rendered caller a silent render-nothing bug.
 *
 * AUTHORIZATION
 * This dialog is UI only. `deleteNote` re-checks author-or-admin server-side (plan 35-09)
 * and so does the v1 route (plan 35-10). Nothing here is the access control.
 *
 * TOASTS
 * Success is silent by design (35-UI-SPEC "Copy rules"): the entry vanishing from the
 * timeline is the confirmation, and a toast on top of a visible result is noise. Only the
 * failure path speaks, and it leaves the dialog open so the user can retry.
 */

import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useTransition } from "react"
import { toast } from "sonner"

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
import { deleteNote } from "@/app/notes/actions"
import { NOTE_ERROR } from "@/lib/notes/errors"

interface DeleteNoteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null while no row has armed the dialog yet. */
  noteId: string | null
  onDeleted: (noteId: string) => void
}

export function DeleteNoteDialog({
  open,
  onOpenChange,
  noteId,
  onDeleted,
}: DeleteNoteDialogProps) {
  const t = useTranslations("notes")
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    if (!noteId) return

    startTransition(async () => {
      try {
        const result = await deleteNote(noteId)

        if (result.success) {
          onDeleted(noteId)
          onOpenChange(false)
          return
        }

        // "Try again" is the wrong advice for a refusal that will never change its mind.
        // The Delete button is painted from a cosmetic `canManage`, so this branch is
        // reachable: a stale client still showing it on a colleague's note, or an admin
        // demoted mid-session.
        toast.error(
          result.error === NOTE_ERROR.notAuthorized
            ? t("error.notPermitted")
            : t("error.deleteFailed")
        )
      } catch {
        // A thrown action and a `success: false` action are the same event to the user.
        toast.error(t("error.deleteFailed"))
      }
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteDialog.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("deleteDialog.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            {t("deleteDialog.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("deleteNote")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
