import Link from 'next/link'
import { auth } from '@/auth'
import { notFound } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

const entities = [
  { type: 'organization', label: 'Organizations', description: 'Company custom fields' },
  { type: 'person', label: 'People', description: 'Contact custom fields' },
  { type: 'deal', label: 'Deals', description: 'Deal custom fields' },
  { type: 'activity', label: 'Activities', description: 'Activity custom fields' },
]

export default async function FieldSettingsIndex() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    notFound()
  }
  
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Custom Field Settings</h1>
        <p className="text-muted-foreground">
          Configure custom fields for each entity type
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
