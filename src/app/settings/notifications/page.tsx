import { getTranslations } from "next-intl/server"
import { getNotificationPreferences } from "./actions"
import { NotificationForm } from "./notification-form"

export default async function NotificationSettingsPage() {
  const t = await getTranslations("settings.notifications")
  const preferences = await getNotificationPreferences()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t("title")}</h2>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>
      <NotificationForm initialPreferences={preferences} />
    </div>
  )
}
