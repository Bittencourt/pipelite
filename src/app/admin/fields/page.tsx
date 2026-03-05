import Link from 'next/link'
import { auth } from '@/auth'
import { notFound } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { getTranslations } from 'next-intl/server'

export default async function FieldSettingsIndex() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    notFound()
  }

  const t = await getTranslations('admin.customFields')

  const entities = [
    { type: 'organization', label: t('organizations'), description: t('orgDescription') },
    { type: 'person', label: t('people'), description: t('peopleDescription') },
    { type: 'deal', label: t('deals'), description: t('dealsDescription') },
    { type: 'activity', label: t('activities'), description: t('activitiesDescription') },
  ]

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('settings')}</h1>
        <p className="text-muted-foreground">
          {t('configureFields')}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {entities.map(entity => (
          <Link key={entity.type} href={`/admin/fields/${entity.type}`}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
              <CardHeader>
                <CardTitle>{entity.label}</CardTitle>
                <CardDescription>{entity.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
