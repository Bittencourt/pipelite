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
import { deactivateUser, reactivateUser } from "./actions"
import type { AllUser } from "./columns"

interface DeactivateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: AllUser | null
  action: "deactivate" | "reactivate"
  onComplete: () => void
}

export function DeactivateDialog({ open, onOpenChange, user, action, onComplete }: DeactivateDialogProps) {
  const t = useTranslations("admin.users")
  const [isPending, startTransition] = useTransition()

  function handleConfirm() {
    if (!user) return
    startTransition(async () => {
      const result = action === "deactivate"
        ? await deactivateUser(user.id)
        : await reactivateUser(user.id)
      if (result.success) {
        toast.success(action === "deactivate" ? t("userDeactivated") : t("userReactivated"))
        onOpenChange(false)
        onComplete()
      } else {
        toast.error(result.error || t("updateFailed"))
      }
    })
  }

  const isDeactivate = action === "deactivate"

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isDeactivate ? t("confirmDeactivateTitle") : t("confirmReactivateTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isDeactivate
              ? t("confirmDeactivate", { email: user?.email ?? "" })
              : t("confirmReactivate", { email: user?.email ?? "" })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isPending}
            className={isDeactivate
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : "bg-green-600 text-white hover:bg-green-700"}
          >
            {isPending
              ? (isDeactivate ? t("deactivating") : t("reactivating"))
              : (isDeactivate ? t("deactivate") : t("reactivate"))}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
