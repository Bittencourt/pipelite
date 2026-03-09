import { db } from "@/db"
import { organizations, users } from "@/db/schema"
import { isNull, desc, eq, and, or, ilike } from "drizzle-orm"
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

const PAGE_SIZE = 50

async function getOrganizations(search?: string, pageNum: number = 1) {
  const limit = PAGE_SIZE * pageNum + 1

  const whereClause = search
    ? and(
        isNull(organizations.deletedAt),
        or(
          ilike(organizations.name, `%${search}%`),
          ilike(organizations.industry, `%${search}%`),
          ilike(organizations.website, `%${search}%`)
        )
      )
    : isNull(organizations.deletedAt)

  const rows = await db
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
    .where(whereClause)
    .orderBy(desc(organizations.createdAt))
    .limit(limit)

  const hasMore = rows.length > PAGE_SIZE * pageNum
  const result = hasMore ? rows.slice(0, PAGE_SIZE * pageNum) : rows

  return {
    rows: result.map((org) => ({
      ...org,
      ownerName: org.ownerName || null,
    })),
    hasMore,
  }
}

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>
}) {
  const params = await searchParams
  const pageNum = Math.max(1, parseInt(params.page ?? "1"))
  const search = params.search ?? ""

  const { rows: orgs, hasMore } = await getOrganizations(search || undefined, pageNum)
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
            <DataTable
              columns={columns}
              data={orgs}
              hasMore={hasMore}
              search={search}
              currentPage={pageNum}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
