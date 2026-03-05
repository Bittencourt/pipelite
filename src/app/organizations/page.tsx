import { db } from "@/db"
import { organizations, users } from "@/db/schema"
import { isNull, desc, eq } from "drizzle-orm"
import { DataTable } from "./data-table"
import { columns } from "./columns"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Building2 } from "lucide-react"
import { getTranslations } from 'next-intl/server'

async function getOrganizations() {
  const result = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      website: organizations.website,
      industry: organizations.industry,
      notes: organizations.notes,
      createdAt: organizations.createdAt,
      ownerName: users.name,
    })
    .from(organizations)
    .leftJoin(users, eq(organizations.ownerId, users.id))
    .where(isNull(organizations.deletedAt))
    .orderBy(desc(organizations.createdAt))

  return result.map((org) => ({
    ...org,
    ownerName: org.ownerName || null,
  }))
}

export default async function OrganizationsPage() {
  const organizations = await getOrganizations()
  const t = await getTranslations('organizations')

  return (
    <div className="container py-8">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">{t('title')}</h1>
            <p className="text-muted-foreground">
              {t('manageOrganizations')}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="sr-only">
            <CardTitle>{t('title')} List</CardTitle>
            <CardDescription>
              A table of all organizations in your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable columns={columns} data={organizations} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
