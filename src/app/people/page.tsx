import { redirect } from "next/navigation"
import { auth } from "@/auth"
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
import { readTrashRetentionDays } from "@/lib/trash/settings"
import {
  resolveDefaultViewRedirect,
  resolveSavedViewsBarProps,
} from "@/lib/views/resolve"

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

  /*
   * THE DEFAULT-VIEW REDIRECT (U-2, U-4, T-40-49). Taken here — after the session gate, before any
   * list query — because a redirect decided after the reads pays for a result that is thrown away on
   * every params-free visit, and on this route that result is the list itself.
   *
   * THE GUARD IS "NO PARAMS AT ALL", AND EVERY WORD OF THAT IS LOAD-BEARING:
   *
   *   - `view=none` IS A PARAM. The bar's "All records" entry and this page's own empty-search
   *     branch both navigate to `?view=none` precisely so this guard does not fire on them. A
   *     weaker test — `!params.search`, or anything that looks at one key — would read the escape
   *     URL as "nothing here" and bounce the user straight back into the view they were leaving,
   *     which is the loop (T-40-49). It is also why the redirect needs no second code path.
   *   - `?search=` (an empty value) is likewise one param, so a deliberate bare-filter visit is not
   *     hijacked either.
   *   - `resolveDefaultViewRedirect` returns `null` when the default's validated filter set comes
   *     back empty, which is the OTHER half of the loop guard: its target therefore always carries
   *     at least one whitelisted key plus `view=<id>`, so the URL it sends the user to can never
   *     satisfy this guard again.
   *
   * A REDIRECT, NOT A REWRITE (U-4). After it the address bar carries the view's own params and the
   * picker resolves the selection from the URL like any other visit, so "arrived by my default view"
   * and "opened this view by hand" are the same state — there is deliberately no second branch for
   * the former, and the filters are shareable the moment they are visible.
   *
   * `redirect()` works by THROWING, so it must never be wrapped in a try/catch here: Next's
   * `NEXT_REDIRECT` has to propagate or the page renders the unfiltered list with no error and no
   * clue. Nothing in this function catches.
   */
  if (Object.keys(params).length === 0) {
    const target = await resolveDefaultViewRedirect("person", session.user)

    if (target) redirect(`/people${target}`)
  }

  const pageNum = Math.max(1, parseInt(params.page ?? "1"))
  const search = params.search ?? ""

  const t = await getTranslations('people')

  /**
   * Four independent reads. The owners list is a SEPARATE query rather than a widening of
   * `getPeople`'s `leftJoin`: that join resolves the owner OF each row for the Owner column,
   * while this one is the pool of users a bulk reassign may target — a different question with
   * a different predicate, and folding them together would make one of the two wrong.
   *
   * BOTH predicates on that pool are load-bearing. `deletedAt IS NULL` alone (the shape
   * `activities/page.tsx` and `deals/page.tsx` use for their own dropdowns) would offer users
   * who are still pending verification or outright rejected, and handing them up to a hundred
   * records is a data defect no per-record failure could report, because the write SUCCEEDS.
   * The bulk reassign action re-validates the target once before its loop; this is the half
   * that keeps the picker from ever proposing it (T-38-06).
   *
   * `viewsBar` is the FOURTH entry, and it belongs IN this batch rather than in an `await` of its own
   * above it. It depends on nothing here and nothing here depends on it, so a separate await would
   * add a whole latency hop to every visit to this page — which is the reason the batch exists at
   * all. It resolves ALL EIGHT of the bar's props server-side (`SavedViewsBarProps`, declared once in
   * `src/lib/views/types.ts`) from the RAW `params` object: raw, because the `view` key naming the
   * open view is a control param that the filter whitelist deliberately drops, and the resolver is
   * the one place that reads both. It is handed `session.user` after the gate above, so no view the
   * viewer may not see ever reaches the Flight payload and nothing is filtered client-side
   * (T-40-51). Every failure inside it degrades to an empty picker over a list the user can still
   * filter, so a views outage cannot blank this page.
   */
  const [{ rows: peopleData, hasMore }, retentionDays, ownerRows, viewsBar] = await Promise.all([
    getPeople(search || undefined, pageNum),
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
    resolveSavedViewsBarProps({
      entityType: "person",
      viewer: session.user,
      rawSearchParams: params,
    }),
  ])

  const bulkOwners = ownerRows.map((u) => ({
    id: u.id,
    name: u.name || "Unknown",
  }))

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
            {/*
              `retentionDays` is passed STRAIGHT THROUGH, and is `null` whenever the window is
              unset, corrupted or out of range. There is deliberately no numeric default here or
              anywhere else in this file: `readTrashRetentionDays` fails closed, nothing is purged
              automatically in that state, and the bulk delete dialog's no-retention copy is what
              keeps the UI from promising a window the pruner is not enforcing (T-38-10).

              Both new props are plain serializable values, and no bulk UI module is imported
              into this server file — the bar, its two dialogs and the failure report all mount
              inside the `'use client'` table.
            */}
            <DataTable
              columns={columns}
              data={peopleData}
              hasMore={hasMore}
              search={search}
              currentPage={pageNum}
              retentionDays={retentionDays}
              bulkOwners={bulkOwners}
              isAdmin={isAdmin}
              viewsBar={viewsBar}
              /*
                The resolved id, by itself, ALONGSIDE the object that already contains it. Not
                redundancy: the table's three list-route writers seed `view=<id>` into the params they
                push, and seeding from the RESOLVED id rather than from the raw param is what scrubs a
                `view=<id>` whose view has since been deleted — the resolver answers `null` for it, so
                the next navigation drops it instead of leaving it haunting the address bar. Both
                values come from this one call site, so they cannot drift.
              */
              selectedViewId={viewsBar.selectedViewId}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
