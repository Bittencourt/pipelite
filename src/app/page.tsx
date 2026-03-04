import { auth } from "@/auth"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { getTranslations } from 'next-intl/server'

export default async function HomePage() {
  const session = await auth()
  const t = await getTranslations('home')

  if (!session) {
    return (
      <div className="container py-12">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <h1 className="text-4xl font-bold">{t('welcome')}</h1>
          <p className="text-xl text-muted-foreground">
            {t('subtitle')}
          </p>
          <div className="flex justify-center gap-4">
            <a href="/signup">
              <Button size="lg">{t('getStarted')}</Button>
            </a>
            <a href="/login">
              <Button size="lg" variant="outline">{t('signIn')}</Button>
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container py-8">
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">
          {t('welcomeBack')}{session.user?.email ? `, ${session.user.email.split("@")[0]}` : ""}!
        </h1>
        <p className="text-muted-foreground">
          {t('youAreLoggedInAs')} <span className="capitalize font-medium">{session.user?.role}</span>.
        </p>
        {session.user?.role === "admin" && (
          <div className="flex gap-4">
            <a href="/admin/users">
              <Button>{t('manageUsers')}</Button>
            </a>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/organizations"
            className="p-6 border rounded-lg hover:border-primary transition-colors"
          >
            <h3 className="font-semibold">{t('organizations')}</h3>
            <p className="text-sm text-muted-foreground">{t('manageOrganizations')}</p>
          </Link>
          <Link
            href="/people"
            className="p-6 border rounded-lg hover:border-primary transition-colors"
          >
            <h3 className="font-semibold">{t('people')}</h3>
            <p className="text-sm text-muted-foreground">{t('manageContacts')}</p>
          </Link>
          <Link
            href="/deals"
            className="p-6 border rounded-lg hover:border-primary transition-colors"
          >
            <h3 className="font-semibold">{t('deals')}</h3>
            <p className="text-sm text-muted-foreground">{t('viewPipeline')}</p>
          </Link>
          <Link
            href="/activities"
            className="p-6 border rounded-lg hover:border-primary transition-colors"
          >
            <h3 className="font-semibold">{t('activities')}</h3>
            <p className="text-sm text-muted-foreground">{t('manageTasks')}</p>
          </Link>
        </div>
      </div>
    </div>
  )
}
