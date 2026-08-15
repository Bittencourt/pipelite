import { notFound } from 'next/navigation'
import { auth } from '@/auth'
import { getAllFieldDefinitions } from '@/app/admin/fields/actions'
import { FieldsList } from './fields-list'
import { AddFieldButton, RestoreFieldButton } from './add-field-button'
import type { AdminFieldRow } from './field-dialog'
import type { EntityType } from '@/db/schema'
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

  // D-44-02: project ONCE into the keys the browser reads, then share the result. React
  // Flight keeps a map of already-written objects and emits a back-reference for one it
  // has seen, so passing this same array to both consumers costs its bytes once. Building
  // a second, separately-derived array for `availableFields` would therefore make the page
  // HEAVIER, not lighter - measured at n=155: 45028 B full rows, 22353 B projected and
  // shared, 58681 B with a separate slim array.
  const rows: AdminFieldRow[] = fields.map(f => ({
    id: f.id,
    name: f.name,
    type: f.type,
    config: f.config,
    required: f.required,
    showInList: f.showInList,
  }))

  // Separate active and archived. `deletedAt` is the predicate only: the split is decided
  // here, on the server, so the timestamp itself never crosses the boundary.
  const archivedIds = new Set(fields.filter(f => f.deletedAt).map(f => f.id))
  const activeFields = rows.filter(row => !archivedIds.has(row.id))
  const archivedFields = rows.filter(row => archivedIds.has(row.id))

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
        <AddFieldButton
          entityType={entityType as EntityType}
          availableFields={activeFields}
          label={t('addField')}
        />
      </div>

      {activeFields.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-lg font-medium">{t('activeFields')}</h2>
          <FieldsList
            fields={activeFields}
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
                <RestoreFieldButton
                  entityType={entityType as EntityType}
                  field={field}
                  label={t('restore')}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
