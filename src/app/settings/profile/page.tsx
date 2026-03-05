import { getCurrentUserSettings } from "@/actions/user-settings"
import { ProfileSettingsForm } from "./profile-settings-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { UserCircle } from "lucide-react"
import { getTranslations } from 'next-intl/server'

export default async function ProfileSettingsPage() {
  const settings = await getCurrentUserSettings()
  const t = await getTranslations('settings.profile')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">
          {t('subtitle')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserCircle className="h-5 w-5 text-muted-foreground" />
            <CardTitle>{t('localization')}</CardTitle>
          </div>
          <CardDescription>
            {t('localizationDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileSettingsForm initialSettings={settings} />
        </CardContent>
      </Card>
    </div>
  )
}
