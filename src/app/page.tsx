import { auth } from "@/auth"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { getTranslations } from "next-intl/server"

export default async function HomePage() {
  const session = await auth()
  const t = await getTranslations("home")

  if (!session) {
    return (
      <div className="container py-12">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <h1 className="text-4xl font-bold">{t("welcome")}</h1>
          <p className="text-xl text-muted-foreground">{t("subtitle")}</p>
          <div className="flex justify-center gap-4">
            <a href="/signup">
              <Button size="lg">{t("getStarted")}</Button>
            </a>
            <a href="/login">
              <Button size="lg" variant="outline">
                {t("signIn")}
              </Button>
            </a>
          </div>
        </div>
      </div>
    )
  }

  const td = await getTranslations("dashboard")
  const name = session.user?.email ? session.user.email.split("@")[0] : ""

  return (
    <div className="container py-8 space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold">{td("quickActions")}</h1>
        <p className="text-muted-foreground">
          {t("welcomeBack")}, {name}
        </p>
      </div>

      {/* Quick nav links */}
      <div>
        <h2 className="text-xl font-semibold mb-4">{t("organizations")}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/organizations"
            className="p-6 border rounded-lg hover:border-primary transition-colors"
          >
            <h3 className="font-semibold">{t("organizations")}</h3>
            <p className="text-sm text-muted-foreground">{t("manageOrganizations")}</p>
          </Link>
          <Link
            href="/people"
            className="p-6 border rounded-lg hover:border-primary transition-colors"
          >
            <h3 className="font-semibold">{t("people")}</h3>
            <p className="text-sm text-muted-foreground">{t("manageContacts")}</p>
          </Link>
          <Link
            href="/deals"
            className="p-6 border rounded-lg hover:border-primary transition-colors"
          >
            <h3 className="font-semibold">{t("deals")}</h3>
            <p className="text-sm text-muted-foreground">{t("viewPipeline")}</p>
          </Link>
          <Link
            href="/activities"
            className="p-6 border rounded-lg hover:border-primary transition-colors"
          >
            <h3 className="font-semibold">{t("activities")}</h3>
            <p className="text-sm text-muted-foreground">{t("manageTasks")}</p>
          </Link>
        </div>
        {session.user?.role === "admin" && (
          <div className="mt-4">
            <a href="/admin/users">
              <Button variant="outline" size="sm">
                {t("manageUsers")}
              </Button>
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
