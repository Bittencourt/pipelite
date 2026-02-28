import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/db"
import { organizations, people, deals, stages } from "@/db/schema"
import { ilike, or, and, isNull, eq } from "drizzle-orm"

// GET /api/search - Search organizations, people, and deals
export async function GET(request: NextRequest) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const q = request.nextUrl.searchParams.get("q")?.trim()

  // Return empty results if no query
  if (!q) {
    return NextResponse.json({
      organizations: [],
      people: [],
      deals: [],
    })
  }

  try {
    // Build search term for ilike
    const searchTerm = `%${q}%`

    // Run three parallel queries
    const [orgs, persons, dealResults] = await Promise.all([
      // Organizations: search by name
      db
        .select({
          id: organizations.id,
          name: organizations.name,
        })
        .from(organizations)
        .where(
          and(
            isNull(organizations.deletedAt),
            ilike(organizations.name, searchTerm)
          )
        )
        .limit(5),

      // People: search by first or last name, join organizations for org name
      db
        .select({
          id: people.id,
          firstName: people.firstName,
          lastName: people.lastName,
          organizationId: people.organizationId,
          organizationName: organizations.name,
        })
        .from(people)
        .leftJoin(
          organizations,
          and(
            eq(people.organizationId, organizations.id),
            isNull(organizations.deletedAt)
          )
        )
        .where(
          and(
            isNull(people.deletedAt),
            or(
              ilike(people.firstName, searchTerm),
              ilike(people.lastName, searchTerm)
            )
          )
        )
        .limit(5),

      // Deals: search by title, join stages for stage name
      db
        .select({
          id: deals.id,
          title: deals.title,
          stageId: deals.stageId,
          stageName: stages.name,
        })
        .from(deals)
        .innerJoin(stages, eq(deals.stageId, stages.id))
        .where(
          and(
            isNull(deals.deletedAt),
            ilike(deals.title, searchTerm)
          )
        )
        .limit(5),
    ])

    return NextResponse.json({
      organizations: orgs,
      people: persons,
      deals: dealResults,
    })
  } catch (error) {
    console.error("Search error:", error)
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    )
  }
}
