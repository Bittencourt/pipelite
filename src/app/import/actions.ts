"use server"

import { auth } from "@/auth"
import { db } from "@/db"
import {
  organizations,
  people,
  deals,
  activities,
  activityTypes,
  stages,
  pipelines,
} from "@/db/schema"
import { eq, and, isNull, asc } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { fuzzyMatchOrganization } from "@/lib/import/fuzzy-match"

const BATCH_SIZE = 100

// ----- Helpers -----

/** Insert rows in batches of BATCH_SIZE */
async function batchInsert<T extends Record<string, unknown>>(
  table: Parameters<typeof db.insert>[0],
  rows: T[]
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    await db.insert(table).values(batch as never)
  }
}

/** Get the first stage from the first pipeline (fallback for missing stages) */
async function getDefaultStage(): Promise<{ id: string; name: string } | null> {
  const defaultPipeline = await db.query.pipelines.findFirst({
    where: isNull(pipelines.deletedAt),
    orderBy: [asc(pipelines.createdAt)],
  })

  if (!defaultPipeline) return null

  const firstStage = await db.query.stages.findFirst({
    where: eq(stages.pipelineId, defaultPipeline.id),
    orderBy: [asc(stages.position)],
  })

  return firstStage ? { id: firstStage.id, name: firstStage.name } : null
}

/** Resolve organization by name: exact match, fuzzy match, or auto-create */
async function resolveOrganization(
  name: string,
  ownerId: string,
  existingOrgs: Array<{ id: string; name: string }>,
  autoCreatedOrgs: Map<string, string>
): Promise<{ id: string; autoCreated: boolean }> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error("Organization name is empty")

  // Check if we already auto-created this org in this import
  const alreadyCreated = autoCreatedOrgs.get(trimmed.toLowerCase())
  if (alreadyCreated) {
    return { id: alreadyCreated, autoCreated: false }
  }

  // Try fuzzy matching against existing orgs
  const { match } = fuzzyMatchOrganization(trimmed, existingOrgs)
  if (match) {
    return { id: match.id, autoCreated: false }
  }

  // Auto-create organization with [Imported] flag
  const now = new Date()
  const [newOrg] = await db
    .insert(organizations)
    .values({
      name: trimmed,
      notes: `[Imported] Auto-created during import on ${now.toISOString().split("T")[0]}`,
      ownerId,
    })
    .returning()

  // Track so subsequent rows referencing the same org skip creation
  autoCreatedOrgs.set(trimmed.toLowerCase(), newOrg.id)
  // Add to existing list for fuzzy matching
  existingOrgs.push({ id: newOrg.id, name: trimmed })

  return { id: newOrg.id, autoCreated: true }
}

// ----- Import Actions -----

/**
 * Import organizations from CSV data.
 */
export async function importOrganizations(
  data: Array<{ name: string; website?: string; industry?: string; notes?: string }>
): Promise<
  | {
      success: true
      count: number
      warnings: string[]
      autoCreated: { orgs: string[]; people: string[] }
    }
  | { success: false; error: string }
> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  try {
    const now = new Date()
    const rows = data.map((item) => ({
      name: item.name,
      website: item.website || null,
      industry: item.industry || null,
      notes: item.notes || null,
      ownerId: session.user!.id,
      createdAt: now,
      updatedAt: now,
    }))

    await batchInsert(organizations, rows)

    revalidatePath("/organizations")
    return {
      success: true,
      count: rows.length,
      warnings: [],
      autoCreated: { orgs: [], people: [] },
    }
  } catch (error) {
    console.error("Failed to import organizations:", error)
    return { success: false, error: "Failed to import organizations" }
  }
}

/**
 * Import people from CSV data.
 * Auto-creates missing organizations with [Imported] flag.
 */
export async function importPeople(
  data: Array<{
    firstName: string
    lastName: string
    email?: string
    phone?: string
    notes?: string
    organizationName?: string
  }>
): Promise<
  | {
      success: true
      count: number
      warnings: string[]
      autoCreated: { orgs: string[]; people: string[] }
    }
  | { success: false; error: string }
> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  try {
    // Load existing organizations for fuzzy matching
    const existingOrgs = await db.query.organizations.findMany({
      where: isNull(organizations.deletedAt),
      columns: { id: true, name: true },
    })
    const orgList = existingOrgs.map((o) => ({ id: o.id, name: o.name }))

    const autoCreatedOrgs = new Map<string, string>()
    const warnings: string[] = []
    const now = new Date()
    const rows: Array<Record<string, unknown>> = []

    for (const item of data) {
      let organizationId: string | null = null

      if (item.organizationName && item.organizationName.trim()) {
        const result = await resolveOrganization(
          item.organizationName,
          session.user!.id,
          orgList,
          autoCreatedOrgs
        )
        organizationId = result.id
        if (result.autoCreated) {
          warnings.push(
            `Auto-created organization "${item.organizationName}" for person "${item.firstName} ${item.lastName}"`
          )
        }
      }

      rows.push({
        firstName: item.firstName,
        lastName: item.lastName,
        email: item.email || null,
        phone: item.phone || null,
        notes: item.notes || null,
        organizationId,
        ownerId: session.user!.id,
        createdAt: now,
        updatedAt: now,
      })
    }

    await batchInsert(people, rows)

    revalidatePath("/people")
    revalidatePath("/organizations")

    return {
      success: true,
      count: rows.length,
      warnings,
      autoCreated: {
        orgs: Array.from(autoCreatedOrgs.values()),
        people: [],
      },
    }
  } catch (error) {
    console.error("Failed to import people:", error)
    return { success: false, error: "Failed to import people" }
  }
}

/**
 * Import deals from CSV data.
 * Auto-creates missing organizations and people with [Imported] flag.
 * Uses first stage from first pipeline as fallback.
 */
export async function importDeals(
  data: Array<{
    title: string
    value?: string
    stageName?: string
    organizationName?: string
    personEmail?: string
    expectedCloseDate?: string
    notes?: string
  }>
): Promise<
  | {
      success: true
      count: number
      warnings: string[]
      autoCreated: { orgs: string[]; people: string[] }
    }
  | { success: false; error: string }
> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  try {
    // Load existing data for resolution
    const existingOrgs = await db.query.organizations.findMany({
      where: isNull(organizations.deletedAt),
      columns: { id: true, name: true },
    })
    const orgList = existingOrgs.map((o) => ({ id: o.id, name: o.name }))

    const existingPeople = await db.query.people.findMany({
      where: isNull(people.deletedAt),
      columns: { id: true, email: true, firstName: true, lastName: true },
    })

    // Load all stages for name matching
    const allStages = await db.query.stages.findMany({
      with: { pipeline: true },
    })
    const activeStages = allStages.filter((s) => !s.pipeline.deletedAt)

    const defaultStage = await getDefaultStage()
    if (!defaultStage) {
      return { success: false, error: "No pipelines or stages found. Create a pipeline first." }
    }

    const autoCreatedOrgs = new Map<string, string>()
    const autoCreatedPeople = new Map<string, string>()
    const warnings: string[] = []
    const now = new Date()
    const rows: Array<Record<string, unknown>> = []

    for (const item of data) {
      // Resolve stage
      let stageId = defaultStage.id
      if (item.stageName && item.stageName.trim()) {
        const matchedStage = activeStages.find(
          (s) => s.name.toLowerCase() === item.stageName!.toLowerCase().trim()
        )
        if (matchedStage) {
          stageId = matchedStage.id
        } else {
          warnings.push(
            `Stage "${item.stageName}" not found for deal "${item.title}", using default stage "${defaultStage.name}"`
          )
        }
      }

      // Resolve organization
      let organizationId: string | null = null
      if (item.organizationName && item.organizationName.trim()) {
        const result = await resolveOrganization(
          item.organizationName,
          session.user!.id,
          orgList,
          autoCreatedOrgs
        )
        organizationId = result.id
        if (result.autoCreated) {
          warnings.push(
            `Auto-created organization "${item.organizationName}" for deal "${item.title}"`
          )
        }
      }

      // Resolve person by email
      let personId: string | null = null
      if (item.personEmail && item.personEmail.trim()) {
        const email = item.personEmail.trim().toLowerCase()

        // Check if already auto-created in this import
        const alreadyCreated = autoCreatedPeople.get(email)
        if (alreadyCreated) {
          personId = alreadyCreated
        } else {
          // Try to match on email (case-insensitive)
          const matchedPerson = existingPeople.find(
            (p) => p.email?.toLowerCase() === email
          )

          if (matchedPerson) {
            personId = matchedPerson.id
          } else {
            // Auto-create person with [Imported] flag
            const emailPrefix = email.split("@")[0] || "unknown"
            const [newPerson] = await db
              .insert(people)
              .values({
                firstName: "[Imported]",
                lastName: emailPrefix,
                email: item.personEmail.trim(),
                notes: `[Imported] Auto-created during import on ${now.toISOString().split("T")[0]}`,
                organizationId,
                ownerId: session.user!.id,
                createdAt: now,
                updatedAt: now,
              })
              .returning()

            personId = newPerson.id
            autoCreatedPeople.set(email, newPerson.id)
            warnings.push(
              `Auto-created person "${emailPrefix}" (${email}) for deal "${item.title}"`
            )
          }
        }
      }

      // Parse expected close date
      let expectedCloseDate: Date | null = null
      if (item.expectedCloseDate && item.expectedCloseDate.trim()) {
        const parsed = new Date(item.expectedCloseDate.trim())
        if (!isNaN(parsed.getTime())) {
          expectedCloseDate = parsed
        }
      }

      rows.push({
        title: item.title,
        value: item.value || null,
        stageId,
        organizationId,
        personId,
        ownerId: session.user!.id,
        position: "10000",
        expectedCloseDate,
        notes: item.notes || null,
        createdAt: now,
        updatedAt: now,
      })
    }

    await batchInsert(deals, rows)

    revalidatePath("/deals")
    revalidatePath("/people")
    revalidatePath("/organizations")

    return {
      success: true,
      count: rows.length,
      warnings,
      autoCreated: {
        orgs: Array.from(autoCreatedOrgs.values()),
        people: Array.from(autoCreatedPeople.values()),
      },
    }
  } catch (error) {
    console.error("Failed to import deals:", error)
    return { success: false, error: "Failed to import deals" }
  }
}

/**
 * Import activities from CSV data.
 * Matches activity type by name (defaults to "task").
 * Optionally matches deal by title.
 */
export async function importActivities(
  data: Array<{
    title: string
    typeName?: string
    dueDate: string
    dealTitle?: string
    notes?: string
  }>
): Promise<
  | {
      success: true
      count: number
      warnings: string[]
      autoCreated: { orgs: string[]; people: string[] }
    }
  | { success: false; error: string }
> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  try {
    // Load activity types
    const types = await db.query.activityTypes.findMany()
    const defaultType = types.find((t) => t.name.toLowerCase() === "task") || types[0]
    if (!defaultType) {
      return { success: false, error: "No activity types found. Seed activity types first." }
    }

    // Load deals for title matching
    const existingDeals = await db.query.deals.findMany({
      where: isNull(deals.deletedAt),
      columns: { id: true, title: true },
    })

    const warnings: string[] = []
    const now = new Date()
    const rows: Array<Record<string, unknown>> = []

    for (const item of data) {
      // Resolve activity type
      let typeId = defaultType.id
      if (item.typeName && item.typeName.trim()) {
        const matchedType = types.find(
          (t) => t.name.toLowerCase() === item.typeName!.toLowerCase().trim()
        )
        if (matchedType) {
          typeId = matchedType.id
        } else {
          warnings.push(
            `Activity type "${item.typeName}" not found for "${item.title}", using default "${defaultType.name}"`
          )
        }
      }

      // Resolve deal by title
      let dealId: string | null = null
      if (item.dealTitle && item.dealTitle.trim()) {
        const matchedDeal = existingDeals.find(
          (d) => d.title.toLowerCase() === item.dealTitle!.toLowerCase().trim()
        )
        if (matchedDeal) {
          dealId = matchedDeal.id
        } else {
          warnings.push(
            `Deal "${item.dealTitle}" not found for activity "${item.title}"`
          )
        }
      }

      // Parse due date
      const dueDate = new Date(item.dueDate)
      if (isNaN(dueDate.getTime())) {
        warnings.push(`Invalid due date "${item.dueDate}" for activity "${item.title}", using current date`)
      }

      rows.push({
        title: item.title,
        typeId,
        dealId,
        ownerId: session.user!.id,
        dueDate: isNaN(dueDate.getTime()) ? now : dueDate,
        notes: item.notes || null,
        createdAt: now,
        updatedAt: now,
      })
    }

    await batchInsert(activities, rows)

    revalidatePath("/activities")

    return {
      success: true,
      count: rows.length,
      warnings,
      autoCreated: { orgs: [], people: [] },
    }
  } catch (error) {
    console.error("Failed to import activities:", error)
    return { success: false, error: "Failed to import activities" }
  }
}
