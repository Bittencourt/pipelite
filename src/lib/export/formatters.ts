import Papa from "papaparse"
import { db } from "@/db"
import {
  organizations,
  people,
  deals,
  activities,
  stages,
  activityTypes,
  users,
} from "@/db/schema"
import { eq, and, isNull, gte, lte } from "drizzle-orm"
import type { ExportEntityType, ExportFilters, ExportOptions, ExportResult } from "./types"
import { toPipedriveFormat, exportToPipedriveCSV } from "./pipedrive"

// ---------------------------------------------------------------------------
// Custom field flattening
// ---------------------------------------------------------------------------

export function flattenCustomFields(
  fields: Record<string, unknown> | null | undefined,
  include: boolean
): Record<string, unknown> {
  if (!include || !fields) return {}
  const flat: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    flat[`custom_${key}`] = value
  }
  return flat
}

// ---------------------------------------------------------------------------
// Entity flatten functions
// ---------------------------------------------------------------------------

interface OrgRow {
  id: string
  name: string
  website: string | null
  industry: string | null
  notes: string | null
  ownerId: string
  customFields: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
  owner: { id: string; name: string | null; email: string } | null
}

export function flattenOrganization(
  org: OrgRow,
  includeCustomFields: boolean
): Record<string, unknown> {
  return {
    id: org.id,
    name: org.name,
    website: org.website ?? "",
    industry: org.industry ?? "",
    notes: org.notes ?? "",
    ownerId: org.ownerId,
    ownerName: org.owner?.name || org.owner?.email || "",
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
    ...flattenCustomFields(org.customFields, includeCustomFields),
  }
}

interface PersonRow {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  notes: string | null
  organizationId: string | null
  ownerId: string
  customFields: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
  organization: { id: string; name: string } | null
  owner: { id: string; name: string | null; email: string } | null
}

export function flattenPerson(
  person: PersonRow,
  includeCustomFields: boolean
): Record<string, unknown> {
  return {
    id: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    email: person.email ?? "",
    phone: person.phone ?? "",
    notes: person.notes ?? "",
    organizationId: person.organizationId ?? "",
    organizationName: person.organization?.name ?? "",
    ownerId: person.ownerId,
    ownerName: person.owner?.name || person.owner?.email || "",
    createdAt: person.createdAt.toISOString(),
    updatedAt: person.updatedAt.toISOString(),
    ...flattenCustomFields(person.customFields, includeCustomFields),
  }
}

interface DealRow {
  id: string
  title: string
  value: string | null
  stageId: string
  organizationId: string | null
  personId: string | null
  ownerId: string
  expectedCloseDate: Date | null
  notes: string | null
  customFields: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
  stage: { id: string; name: string } | null
  organization: { id: string; name: string } | null
  person: { id: string; firstName: string; lastName: string } | null
  owner: { id: string; name: string | null; email: string } | null
}

export function flattenDeal(
  deal: DealRow,
  includeCustomFields: boolean
): Record<string, unknown> {
  return {
    id: deal.id,
    title: deal.title,
    value: deal.value ?? "",
    stageId: deal.stageId,
    stageName: deal.stage?.name ?? "",
    organizationId: deal.organizationId ?? "",
    organizationName: deal.organization?.name ?? "",
    personId: deal.personId ?? "",
    personName: deal.person
      ? `${deal.person.firstName} ${deal.person.lastName}`
      : "",
    ownerId: deal.ownerId,
    ownerName: deal.owner?.name || deal.owner?.email || "",
    expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? "",
    notes: deal.notes ?? "",
    createdAt: deal.createdAt.toISOString(),
    updatedAt: deal.updatedAt.toISOString(),
    ...flattenCustomFields(deal.customFields, includeCustomFields),
  }
}

interface ActivityRow {
  id: string
  title: string
  typeId: string
  dealId: string | null
  ownerId: string
  dueDate: Date
  completedAt: Date | null
  notes: string | null
  customFields: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
  type: { id: string; name: string } | null
  deal: { id: string; title: string } | null
  owner: { id: string; name: string | null; email: string } | null
}

export function flattenActivity(
  activity: ActivityRow,
  includeCustomFields: boolean
): Record<string, unknown> {
  return {
    id: activity.id,
    title: activity.title,
    typeId: activity.typeId,
    typeName: activity.type?.name ?? "",
    dealId: activity.dealId ?? "",
    dealTitle: activity.deal?.title ?? "",
    ownerId: activity.ownerId,
    ownerName: activity.owner?.name || activity.owner?.email || "",
    dueDate: activity.dueDate.toISOString(),
    completedAt: activity.completedAt?.toISOString() ?? "",
    notes: activity.notes ?? "",
    createdAt: activity.createdAt.toISOString(),
    updatedAt: activity.updatedAt.toISOString(),
    ...flattenCustomFields(activity.customFields, includeCustomFields),
  }
}

// ---------------------------------------------------------------------------
// CSV / JSON formatting
// ---------------------------------------------------------------------------

export function exportToCSV(
  data: Record<string, unknown>[]
): string {
  return Papa.unparse(data, { header: true })
}

export function exportToJSON(
  data: Record<string, unknown>[],
  entityType: ExportEntityType
): string {
  return JSON.stringify(
    {
      entityType,
      version: "1.0",
      exportedAt: new Date().toISOString(),
      count: data.length,
      data,
    },
    null,
    2
  )
}

// ---------------------------------------------------------------------------
// Data fetching with filters
// ---------------------------------------------------------------------------

async function fetchOrganizations(
  filters: ExportFilters | undefined,
  includeCustomFields: boolean
) {
  const conditions = [isNull(organizations.deletedAt)]

  if (filters?.owner) {
    conditions.push(eq(organizations.ownerId, filters.owner))
  }

  const rows = await db.query.organizations.findMany({
    where: and(...conditions),
    with: {
      owner: { columns: { id: true, name: true, email: true } },
    },
  })

  return rows.map((r) => flattenOrganization(r as OrgRow, includeCustomFields))
}

async function fetchPeople(
  filters: ExportFilters | undefined,
  includeCustomFields: boolean
) {
  const conditions = [isNull(people.deletedAt)]

  if (filters?.owner) {
    conditions.push(eq(people.ownerId, filters.owner))
  }

  const rows = await db.query.people.findMany({
    where: and(...conditions),
    with: {
      organization: { columns: { id: true, name: true } },
      owner: { columns: { id: true, name: true, email: true } },
    },
  })

  return rows.map((r) => flattenPerson(r as PersonRow, includeCustomFields))
}

async function fetchDeals(
  filters: ExportFilters | undefined,
  includeCustomFields: boolean
) {
  const conditions: ReturnType<typeof eq>[] = [isNull(deals.deletedAt)]

  if (filters?.owner) {
    conditions.push(eq(deals.ownerId, filters.owner))
  }
  if (filters?.stage) {
    conditions.push(eq(deals.stageId, filters.stage))
  }
  if (filters?.dateFrom) {
    conditions.push(gte(deals.expectedCloseDate, new Date(filters.dateFrom)))
  }
  if (filters?.dateTo) {
    conditions.push(lte(deals.expectedCloseDate, new Date(filters.dateTo)))
  }

  const rows = await db.query.deals.findMany({
    where: and(...conditions),
    with: {
      stage: { columns: { id: true, name: true } },
      organization: { columns: { id: true, name: true } },
      person: { columns: { id: true, firstName: true, lastName: true } },
      owner: { columns: { id: true, name: true, email: true } },
    },
  })

  return rows.map((r) => flattenDeal(r as DealRow, includeCustomFields))
}

async function fetchActivities(
  filters: ExportFilters | undefined,
  includeCustomFields: boolean
) {
  const conditions: ReturnType<typeof eq>[] = [isNull(activities.deletedAt)]

  if (filters?.owner) {
    conditions.push(eq(activities.ownerId, filters.owner))
  }
  if (filters?.dateFrom) {
    conditions.push(gte(activities.dueDate, new Date(filters.dateFrom)))
  }
  if (filters?.dateTo) {
    conditions.push(lte(activities.dueDate, new Date(filters.dateTo)))
  }

  const rows = await db.query.activities.findMany({
    where: and(...conditions),
    with: {
      type: { columns: { id: true, name: true } },
      deal: { columns: { id: true, title: true } },
      owner: { columns: { id: true, name: true, email: true } },
    },
  })

  return rows.map((r) => flattenActivity(r as ActivityRow, includeCustomFields))
}

// ---------------------------------------------------------------------------
// Main export entry point
// ---------------------------------------------------------------------------

export async function fetchFilteredData(
  options: ExportOptions
): Promise<ExportResult> {
  try {
    const { entityType, format, includeCustomFields, filters } = options

    let flatData: Record<string, unknown>[]

    switch (entityType) {
      case "organization":
        flatData = await fetchOrganizations(filters, includeCustomFields)
        break
      case "person":
        flatData = await fetchPeople(filters, includeCustomFields)
        break
      case "deal":
        flatData = await fetchDeals(filters, includeCustomFields)
        break
      case "activity":
        flatData = await fetchActivities(filters, includeCustomFields)
        break
      default:
        return { success: false, error: "Unknown entity type" }
    }

    const timestamp = new Date().toISOString().split("T")[0]
    let data: string
    let ext: string

    switch (format) {
      case "csv":
        data = exportToCSV(flatData)
        ext = "csv"
        break
      case "json":
        data = exportToJSON(flatData, entityType)
        ext = "json"
        break
      case "pipedrive-csv":
        data = exportToPipedriveCSV(flatData, entityType)
        ext = "csv"
        break
      case "pipedrive-json": {
        const pipedriveData = toPipedriveFormat(flatData, entityType)
        data = JSON.stringify(
          {
            entityType,
            version: "1.0",
            format: "pipedrive",
            exportedAt: new Date().toISOString(),
            count: pipedriveData.length,
            data: pipedriveData,
          },
          null,
          2
        )
        ext = "json"
        break
      }
      default:
        return { success: false, error: "Unknown export format" }
    }

    const formatSuffix = format.startsWith("pipedrive") ? "-pipedrive" : ""
    const entityPlural =
      entityType === "person"
        ? "people"
        : entityType === "activity"
          ? "activities"
          : `${entityType}s`
    const filename = `${entityPlural}${formatSuffix}-${timestamp}.${ext}`

    return { success: true, data, filename, count: flatData.length }
  } catch (error) {
    console.error("Export failed:", error)
    return { success: false, error: "Export failed. Please try again." }
  }
}
