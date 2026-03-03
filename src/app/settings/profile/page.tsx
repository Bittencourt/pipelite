import { getCurrentUserSettings } from "@/actions/user-settings"
import { ProfileSettingsForm } from "./profile-settings-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { UserCircle } from "lucide-react"

export default async function ProfileSettingsPage() {
  const settings = await getCurrentUserSettings()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Profile Settings</h1>
        <p className="text-muted-foreground">
          Manage your language and timezone preferences
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserCircle className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Localization</CardTitle>
          </div>
          <CardDescription>
            Customize how the application displays language, dates, and times
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileSettingsForm initialSettings={settings} />
        </CardContent>
      </Card>
    </div>
  )
}
