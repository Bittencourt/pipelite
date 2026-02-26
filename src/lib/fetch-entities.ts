"use server"

import { auth } from "@/auth"
import { db } from "@/db"
import { organizations, people, deals } from "@/db/schema"
import { eq, ilike, and, isNull, or } from "drizzle-orm"
import type { EntityType } from "@/db/schema"

interface EntitySearchResult {
  id: string
  name: string
  type: EntityType
}

export async function searchEntities(
  entityType: EntityType,
  query: string
): Promise<EntitySearchResult[]> {
  const session = await auth()
  if (!session?.user) return []

  const searchTerm = `%${query}%`

  switch (entityType) {
    case "organization": {
      const results = await db
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(
          and(isNull(organizations.deletedAt), ilike(organizations.name, searchTerm))
        )
        .limit(20)
      return results.map((r) => ({ ...r, type: "organization" as EntityType }))
    }

    case "person": {
      const results = await db
        .select({ id: people.id, firstName: people.firstName, lastName: people.lastName })
        .from(people)
        .where(
          and(
            isNull(people.deletedAt),
            or(
              ilike(people.firstName, searchTerm),
              ilike(people.lastName, searchTerm),
              ilike(people.email, searchTerm)
            )
          )
        )
        .limit(20)
      return results.map((r) => ({
        id: r.id,
        name: `${r.firstName} ${r.lastName}`.trim(),
        type: "person" as EntityType,
      }))
    }

    case "deal": {
      const results = await db
        .select({ id: deals.id, name: deals.title })
        .from(deals)
        .where(and(isNull(deals.deletedAt), ilike(deals.title, searchTerm)))
        .limit(20)
      return results.map((r) => ({ ...r, type: "deal" as EntityType }))
    }

    case "activity":
      // Activities typically not linked from other entities
      return []

    default:
      return []
  }
}

export async function getEntityById(
  entityType: EntityType,
  id: string
): Promise<EntitySearchResult | null> {
  const session = await auth()
  if (!session?.user) return null

  switch (entityType) {
    case "organization": {
      const results = await db
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, id))
        .limit(1)
      return results[0] ? { ...results[0], type: "organization" } : null
    }

    case "person": {
      const results = await db
        .select({ id: people.id, firstName: people.firstName, lastName: people.lastName })
        .from(people)
        .where(eq(people.id, id))
        .limit(1)
      return results[0]
        ? {
            id: results[0].id,
            name: `${results[0].firstName} ${results[0].lastName}`.trim(),
            type: "person" as EntityType,
          }
        : null
    }

    case "deal": {
      const results = await db
        .select({ id: deals.id, name: deals.title })
        .from(deals)
        .where(eq(deals.id, id))
        .limit(1)
      return results[0] ? { ...results[0], type: "deal" } : null
    }

    default:
      return null
  }
}
