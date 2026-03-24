"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { updateNotificationPreferences, type NotificationPreferencesData } from "./actions"

interface NotificationFormProps {
  initialPreferences: NotificationPreferencesData
}

export function NotificationForm({ initialPreferences }: NotificationFormProps) {
  const t = useTranslations("settings.notifications")
  const [isPending, startTransition] = useTransition()
  const [prefs, setPrefs] = useState<NotificationPreferencesData>(initialPreferences)

  function handleToggle(key: keyof NotificationPreferencesData) {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updateNotificationPreferences(prefs)
      if (result.success) {
        toast.success(t("saved"))
      } else {
        toast.error(result.error || t("saveFailed"))
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-start space-x-3">
          <Checkbox
            id="deal-assigned"
            checked={prefs.emailDealAssigned}
            onCheckedChange={() => handleToggle("emailDealAssigned")}
          />
          <div className="space-y-1">
            <Label htmlFor="deal-assigned" className="font-medium cursor-pointer">
              {t("dealAssigned")}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t("dealAssignedDescription")}
            </p>
          </div>
        </div>

        <div className="flex items-start space-x-3">
          <Checkbox
            id="activity-reminder"
            checked={prefs.emailActivityReminder}
            onCheckedChange={() => handleToggle("emailActivityReminder")}
          />
          <div className="space-y-1">
            <Label htmlFor="activity-reminder" className="font-medium cursor-pointer">
              {t("activityReminder")}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t("activityReminderDescription")}
            </p>
          </div>
        </div>

        <div className="flex items-start space-x-3">
          <Checkbox
            id="weekly-digest"
            checked={prefs.emailWeeklyDigest}
            onCheckedChange={() => handleToggle("emailWeeklyDigest")}
          />
          <div className="space-y-1">
            <Label htmlFor="weekly-digest" className="font-medium cursor-pointer">
              {t("weeklyDigest")}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t("weeklyDigestDescription")}
            </p>
          </div>
        </div>
      </div>

      <Button onClick={handleSave} disabled={isPending}>
        {isPending ? t("saving") : t("save")}
      </Button>
    </div>
  )
}
