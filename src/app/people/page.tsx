import { db } from "@/db"
import { people, organizations, users } from "@/db/schema"
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
import { Users } from "lucide-react"
import { getTranslations } from 'next-intl/server'

const PAGE_SIZE = 50

async function getPeople(search?: string, pageNum: number = 1) {
  const limit = PAGE_SIZE * pageNum + 1

  const whereClause = search
    ? and(
        isNull(people.deletedAt),
        or(
          ilike(people.firstName, `%${search}%`),
          ilike(people.lastName, `%${search}%`),
          ilike(people.email, `%${search}%`),
          ilike(people.phone, `%${search}%`)
        )
      )
    : isNull(people.deletedAt)

  const rows = await db
    .select({
      id: people.id,
      firstName: people.firstName,
      lastName: people.lastName,
      email: people.email,
      phone: people.phone,
      notes: people.notes,
      organizationId: people.organizationId,
      organizationName: organizations.name,
      ownerName: users.name,
      createdAt: people.createdAt,
    })
    .from(people)
    .leftJoin(
      organizations,
      and(eq(people.organizationId, organizations.id), isNull(organizations.deletedAt))
    )
    .leftJoin(users, eq(people.ownerId, users.id))
    .where(whereClause)
    .orderBy(desc(people.createdAt))
    .limit(limit)

  const hasMore = rows.length > PAGE_SIZE * pageNum
  const result = hasMore ? rows.slice(0, PAGE_SIZE * pageNum) : rows

  return {
    rows: result.map((person) => ({
      ...person,
      organizationName: person.organizationName || null,
      ownerName: person.ownerName || null,
    })),
    hasMore,
  }
}

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>
}) {
  const params = await searchParams
  const pageNum = Math.max(1, parseInt(params.page ?? "1"))
  const search = params.search ?? ""

  const t = await getTranslations('people')

  const { rows: peopleData, hasMore } = await getPeople(search || undefined, pageNum)

  return (
    <div className="container py-8">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">{t('title')}</h1>
            <p className="text-muted-foreground">
              {t('manageContacts')}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="sr-only">
            <CardTitle>{t('title')} List</CardTitle>
            <CardDescription>
              A table of all people in your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              data={peopleData}
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
