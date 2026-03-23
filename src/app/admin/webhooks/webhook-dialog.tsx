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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createWebhook, updateWebhook } from "./actions"
import type { WebhookRow } from "./columns"
import { Copy, Check } from "lucide-react"

const WEBHOOK_EVENTS = [
  "deal.created",
  "deal.updated",
  "deal.deleted",
  "organization.created",
  "organization.updated",
  "organization.deleted",
  "person.created",
  "person.updated",
  "person.deleted",
  "activity.created",
  "activity.updated",
  "activity.deleted",
  "stage.created",
  "stage.updated",
  "stage.deleted",
  "pipeline.created",
  "pipeline.updated",
  "pipeline.deleted",
] as const

const formSchema = z.object({
  url: z.string().url("Invalid URL"),
  events: z.array(z.string()).min(1, "At least one event is required"),
  active: z.boolean(),
  userId: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

type User = { id: string; email: string }

interface WebhookDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  webhook?: WebhookRow | null
  users: User[]
}

export function WebhookDialog({ open, onOpenChange, webhook, users }: WebhookDialogProps) {
  const t = useTranslations("admin.webhooks")
  const [isPending, startTransition] = useTransition()
  const [createdSecret, setCreatedSecret] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const isEditing = !!webhook

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      url: webhook?.url ?? "",
      events: webhook?.events ?? [],
      active: webhook?.active ?? true,
      userId: webhook?.userId ?? "",
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        url: webhook?.url ?? "",
        events: webhook?.events ?? [],
        active: webhook?.active ?? true,
        userId: webhook?.userId ?? "",
      })
    }
  }, [open, webhook, form])

  const selectedEvents = form.watch("events")

  function toggleEvent(event: string) {
    const current = form.getValues("events")
    if (current.includes(event)) {
      form.setValue("events", current.filter((e) => e !== event), { shouldValidate: true })
    } else {
      form.setValue("events", [...current, event], { shouldValidate: true })
    }
  }

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      if (isEditing) {
        const result = await updateWebhook(webhook.id, {
          url: values.url,
          events: values.events,
          active: values.active,
        })
        if (result.success) {
          toast.success(t("webhookUpdated"))
          onOpenChange(false)
        } else {
          toast.error(result.error)
        }
      } else {
        if (!values.userId) {
          toast.error(t("ownerRequired"))
          return
        }
        const result = await createWebhook({
          url: values.url,
          events: values.events,
          active: values.active,
          userId: values.userId,
        })
        if (result.success && "secret" in result) {
          setCreatedSecret(result.secret as string)
          toast.success(t("webhookCreated"))
        } else if (!result.success) {
          toast.error(result.error)
        }
      }
    })
  }

  function handleClose(open: boolean) {
    if (!open) {
      setCreatedSecret(null)
      setCopied(false)
      form.reset()
    }
    onOpenChange(open)
  }

  function copySecret() {
    if (createdSecret) {
      navigator.clipboard.writeText(createdSecret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // After creation, show secret
  if (createdSecret) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("webhookCreated")}</DialogTitle>
            <DialogDescription>{t("secretDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Input value={createdSecret} readOnly className="font-mono text-sm" />
              <Button variant="outline" size="icon" onClick={copySecret}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">{t("secretWarning")}</p>
          </div>
          <DialogFooter>
            <Button onClick={() => handleClose(false)}>{t("done")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? t("editWebhook") : t("createWebhook")}</DialogTitle>
          <DialogDescription>
            {isEditing ? t("editDescription") : t("createDescription")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="url">{t("url")}</Label>
            <Input
              id="url"
              placeholder="https://example.com/webhook"
              {...form.register("url")}
            />
            {form.formState.errors.url && (
              <p className="text-sm text-destructive">{form.formState.errors.url.message}</p>
            )}
          </div>

          {!isEditing && (
            <div className="space-y-2">
              <Label htmlFor="userId">{t("owner")}</Label>
              <Select
                value={form.watch("userId") || ""}
                onValueChange={(v) => form.setValue("userId", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("selectOwner")} />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>{t("events")}</Label>
            <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto border rounded-md p-3">
              {WEBHOOK_EVENTS.map((event) => (
                <label key={event} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={selectedEvents.includes(event)}
                    onCheckedChange={() => toggleEvent(event)}
                  />
                  {event}
                </label>
              ))}
            </div>
            {form.formState.errors.events && (
              <p className="text-sm text-destructive">{form.formState.errors.events.message}</p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Checkbox
              checked={form.watch("active")}
              onCheckedChange={(checked: boolean) => form.setValue("active", checked)}
            />
            <Label>{t("active")}</Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("saving") : isEditing ? t("save") : t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
