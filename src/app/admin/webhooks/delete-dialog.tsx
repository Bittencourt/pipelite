"use client"

import { useTransition } from "react"
import { useTranslations } from "next-intl"
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
import { deleteWebhook } from "./actions"
import type { WebhookRow } from "./columns"

interface DeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  webhook: WebhookRow | null
}

export function DeleteDialog({ open, onOpenChange, webhook }: DeleteDialogProps) {
  const t = useTranslations("admin.webhooks")
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    if (!webhook) return
    startTransition(async () => {
      const result = await deleteWebhook(webhook.id)
      if (result.success) {
        toast.success(t("webhookDeleted"))
        onOpenChange(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("confirmDeleteTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("confirmDeleteDescription", { url: webhook?.url ?? "" })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {isPending ? t("deleting") : t("delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
