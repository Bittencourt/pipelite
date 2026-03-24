"use client"

import { useState, useTransition, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { updateUser } from "./actions"
import type { AllUser } from "./columns"
import { DeactivateDialog } from "./deactivate-dialog"

const formSchema = z.object({
  role: z.enum(["admin", "member"]),
  status: z.enum(["pending_verification", "pending_approval", "approved", "rejected"]),
})

type FormValues = z.infer<typeof formSchema>

interface EditUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: AllUser | null
  currentUserId: string
}

export function EditUserDialog({ open, onOpenChange, user, currentUserId }: EditUserDialogProps) {
  const t = useTranslations("admin.users")
  const [isPending, startTransition] = useTransition()
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false)
  const [deactivateAction, setDeactivateAction] = useState<"deactivate" | "reactivate">("deactivate")
  const isSelf = user?.id === currentUserId

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      role: user?.role ?? "member",
      status: user?.status ?? "approved",
    },
  })

  useEffect(() => {
    if (open && user) {
      form.reset({
        role: user.role,
        status: user.status,
      })
    }
  }, [open, user, form])

  function onSubmit(values: FormValues) {
    if (!user) return
    startTransition(async () => {
      const data: { role?: "admin" | "member"; status?: "pending_verification" | "pending_approval" | "approved" | "rejected" } = {}
      if (values.role !== user.role) data.role = values.role
      if (values.status !== user.status) data.status = values.status

      if (Object.keys(data).length === 0) {
        onOpenChange(false)
        return
      }

      const result = await updateUser(user.id, data)
      if (result.success) {
        toast.success(t("userUpdated"))
        onOpenChange(false)
      } else {
        toast.error(result.error || t("updateFailed"))
      }
    })
  }

  function handleDeactivate() {
    setDeactivateAction("deactivate")
    setDeactivateDialogOpen(true)
  }

  function handleReactivate() {
    setDeactivateAction("reactivate")
    setDeactivateDialogOpen(true)
  }

  function handleDeactivateComplete() {
    onOpenChange(false)
  }

  if (!user) return null

  const isDeactivated = user.deletedAt !== null

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("editUser")}</DialogTitle>
          <DialogDescription>{t("editUserDescription")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("email")}</Label>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">{t("role")}</Label>
            <Select
              value={form.watch("role")}
              onValueChange={(v) => form.setValue("role", v as "admin" | "member")}
              disabled={isSelf}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">{t("roles.admin")}</SelectItem>
                <SelectItem value="member">{t("roles.member")}</SelectItem>
              </SelectContent>
            </Select>
            {isSelf && (
              <p className="text-xs text-muted-foreground">{t("cannotEditSelf")}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">{t("status")}</Label>
            <Select
              value={form.watch("status")}
              onValueChange={(v) => form.setValue("status", v as FormValues["status"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="approved">{t("statuses.approved")}</SelectItem>
                <SelectItem value="pending_approval">{t("statuses.pending_approval")}</SelectItem>
                <SelectItem value="pending_verification">{t("statuses.pending_verification")}</SelectItem>
                <SelectItem value="rejected">{t("statuses.rejected")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={isPending}>
                {t("save")}
              </Button>
            </div>
            <div className="border-t pt-3 mt-1">
              {isDeactivated ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full text-green-600 border-green-600 hover:bg-green-50"
                  onClick={handleReactivate}
                  disabled={isPending}
                >
                  {t("reactivate")}
                </Button>
              ) : !isSelf ? (
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full"
                  onClick={handleDeactivate}
                  disabled={isPending}
                >
                  {t("deactivate")}
                </Button>
              ) : null}
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <DeactivateDialog
      open={deactivateDialogOpen}
      onOpenChange={setDeactivateDialogOpen}
      user={user}
      action={deactivateAction}
      onComplete={handleDeactivateComplete}
    />
  </>
  )
}
