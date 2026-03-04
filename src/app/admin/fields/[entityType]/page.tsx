import { notFound } from 'next/navigation'
import { auth } from '@/auth'
import { getAllFieldDefinitions } from '@/app/admin/fields/actions'
import { FieldsList } from './fields-list'
import { FieldDialog } from './field-dialog'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import type { EntityType, CustomFieldDefinition } from '@/db/schema'
import { getTranslations } from 'next-intl/server'

const validEntityTypes: EntityType[] = ['organization', 'person', 'deal', 'activity']

interface PageProps {
  params: Promise<{ entityType: string }>
}

export default async function FieldSettingsPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    notFound()
  }

  const { entityType } = await params
  if (!validEntityTypes.includes(entityType as EntityType)) {
    notFound()
  }

  const t = await getTranslations('admin.customFields')
  const fields = await getAllFieldDefinitions(entityType as EntityType)

  // Separate active and archived
  const activeFields = fields.filter(f => !f.deletedAt)
  const archivedFields = fields.filter(f => f.deletedAt)

  const entityLabel = entityType.charAt(0).toUpperCase() + entityType.slice(1) + 's'

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('customFieldsFor', { entity: entityLabel })}</h1>
          <p className="text-muted-foreground">
            {t('configureForEntity', { entity: entityType })}
          </p>
        </div>
        <FieldDialog entityType={entityType as EntityType} availableFields={activeFields as CustomFieldDefinition[]}>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            {t('addField')}
          </Button>
        </FieldDialog>
      </div>

      {activeFields.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-lg font-medium">{t('activeFields')}</h2>
          <FieldsList
            fields={activeFields as CustomFieldDefinition[]}
            entityType={entityType as EntityType}
          />
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          {t('noFieldsConfigured')}
        </div>
      )}

      {archivedFields.length > 0 && (
        <div className="space-y-4 opacity-60">
          <h2 className="text-lg font-medium">{t('archivedFields')}</h2>
          <div className="space-y-2">
            {archivedFields.map(field => (
              <div key={field.id} className="flex items-center justify-between p-3 border rounded bg-muted/50">
                <div>
                  <span className="font-medium line-through">{field.name}</span>
                  <span className="text-sm text-muted-foreground ml-2">({field.type})</span>
                </div>
                <FieldDialog field={field as CustomFieldDefinition} entityType={entityType as EntityType}>
                  <Button variant="ghost" size="sm">{t('restore')}</Button>
                </FieldDialog>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
