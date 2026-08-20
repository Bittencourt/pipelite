import { redirect } from "next/navigation"
import { auth } from "@/auth"
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
import { readTrashRetentionDays } from "@/lib/trash/settings"
import { readOrgIdentityInputFields } from "@/lib/dedup/identity-inputs"

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
  // This route had NO session check until phase 38's UAT (finding G5). `/deals`, `/activities` and
  // `/trash` each gate themselves exactly like this in their own page component; organizations and
  // people did not, so both answered 200 to a request carrying no cookie while their three siblings
  // answered 307. `src/middleware.ts` matches these paths but does not enforce authentication.
  //
  // No record ever actually leaked — the page rendered its empty state — but that was INCIDENTAL,
  // not enforced: nothing in this file made the absence of a session mean the absence of data, so
  // any later change to the queries below could have turned a shell into a disclosure. The gate is
  // what makes it intentional.
  const session = await auth()

  if (!session?.user?.id) {
    redirect("/login")
  }

  /*
   * VISIBILITY ONLY, exactly as on `/trash`. This decides whether the "Find duplicates" button is
   * RENDERED; it is never the authorization. `src/app/duplicates/layout.tsx` re-checks the role
   * independently and redirects a non-admin who reaches the route by URL, which is what makes
   * hiding rather than disabling the control safe (T-39-01).
   */
  const isAdmin = session.user.role === "admin"

  const params = await searchParams
  const pageNum = Math.max(1, parseInt(params.page ?? "1"))
  const search = params.search ?? ""

  /*
   * Four independent reads in one round trip. Three of the four exist only to feed components
   * mounted inside `data-table.tsx`; every one of them crosses the RSC boundary as a PLAIN
   * SERIALIZABLE VALUE and nothing else, which is why no bulk component is imported here.
   *
   * `retentionDays` is passed straight through, un-defaulted, and no numeric fallback may ever be
   * added anywhere in this file. The read fails closed to `null` when the window is unset,
   * corrupted, tampered with or out of range; nothing is purged automatically in that state, and
   * that `null` is exactly what selects the bulk delete dialog's no-retention copy. A coalesced
   * default here would have the dialog promise a window the pruner is not enforcing (T-38-10). The
   * real thirty-day default lives in DATA — a seeded `app_settings` row from migration 0015 —
   * never in code.
   *
   * `bulkOwners` is a NEW, SEPARATE query rather than a widening of the `leftJoin` above, which
   * exists only to supply the `ownerName` COLUMN. Both of its predicates are load-bearing: handing
   * up to a hundred records to a soft-deleted or unapproved user is a data defect that no
   * per-record failure could ever report, because every one of those writes SUCCEEDS — the rows
   * simply land on a principal who cannot sign in (T-38-06). `src/app/deals/page.tsx` filters its
   * own owner picker on the soft-delete column alone and is an anti-analog here, not a template.
   * The prop is named `bulkOwners`, not `owners`, so it can never be conflated with a future owner
   * FILTER list on this same surface.
   *
   * `identityFieldNames` is the admin-configured organization identity custom field LABELS that the
   * create dialog can collect a value for, and it is a PAGE-RENDER read — not a submit-path one. The
   * create submit performs exactly the queries it performed before this read existed, in both
   * configurations; the duplicate check's own field list is still read server-side inside the action
   * and is never taken from the request (T-39G-02). It resolves to `[]` — the same value as
   * unconfigured, so no input renders — on any failure, because a settings read may not be the
   * reason this list page goes blank and there is no `error.tsx` above this route.
   */
  const [{ rows: orgs, hasMore }, retentionDays, ownerRows, identityFieldNames] = await Promise.all([
    getOrganizations(search || undefined, pageNum),
    readTrashRetentionDays(),
    db.query.users.findMany({
      where: and(isNull(users.deletedAt), eq(users.status, "approved")),
      columns: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: [users.name],
    }),
    readOrgIdentityInputFields(),
  ])

  const bulkOwners = ownerRows.map((u) => ({
    id: u.id,
    name: u.name || "Unknown",
  }))

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
              retentionDays={retentionDays}
              bulkOwners={bulkOwners}
              identityFieldNames={identityFieldNames}
              isAdmin={isAdmin}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
