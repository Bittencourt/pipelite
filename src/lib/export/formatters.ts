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
import { eq, and, or, isNull, isNotNull, gte, lt, ilike, inArray, sql } from "drizzle-orm"
import type { SQL } from "drizzle-orm"
import type { ExportEntityType, ExportFilters, ExportOptions, ExportResult } from "./types"
import { toPipedriveFormat, exportToPipedriveCSV } from "./pipedrive"
import { deriveCsvColumns } from "./csv-columns"
import { formatFormulaValueForText } from "@/lib/formula-helpers"
// THE DATE-RANGE BOUNDARY RULE, SHARED WITH THE LIST PAGE. `getActivities`
// (`src/app/activities/actions.ts`) imports the same two helpers, which is what makes the "each
// predicate MIRRORS the list page it must match" claim below enforceable rather than aspirational —
// review finding CR-01 was two copies of this rule drifting apart into a silently narrower CSV.
import { endOfDayExclusive, startOfDayInclusive } from "@/lib/filters/date-range"

// Re-exported so the export module has one public surface; the implementation lives in a
// dependency-free module because `pipedrive.ts` needs it too and this file already imports that.
export { deriveCsvColumns }

// ---------------------------------------------------------------------------
// Custom field flattening
// ---------------------------------------------------------------------------

/**
 * Flatten an entity's `customFields` JSONB into `custom_<name>` columns.
 *
 * A recalculated formula field is persisted as `{ formula: true, value, error }` (D-05).
 * `Papa.unparse` stringifies that object to the literal `[object Object]` in every cell —
 * measured against the installed papaparse 5.5.3 — so each value is reduced to its scalar
 * (or `#ERROR: <message>`) here, at the single point every export format shares (D-16 / SC-2).
 *
 * `exportToJSON` receives these same flattened rows and therefore inherits the unwrapping:
 * a JSON consumer sees the scalar, consistent with the CSV. If preserving the structured
 * wrapper for JSON consumers is later wanted, that is a new export option, not this change.
 *
 * `formatFormulaValueForText` lives in `@/lib/formula-helpers`, which imports no database
 * client, so this adds no db coupling to the export module.
 */
export function flattenCustomFields(
  fields: Record<string, unknown> | null | undefined,
  include: boolean
): Record<string, unknown> {
  if (!include || !fields) return {}
  const flat: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    flat[`custom_${key}`] = formatFormulaValueForText(value)
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

/**
 * All four entity exports funnel through here, so this is the single place the column set is
 * decided. `header: true` alone derived it from row 1 only — see `deriveCsvColumns` for the
 * measurement and for why the ordering is what it is (SC-2).
 */
export function exportToCSV(
  data: Record<string, unknown>[]
): string {
  const columns = deriveCsvColumns(data)
  // papaparse throws `Option columns is empty` on an empty array, and an empty dataset must
  // still produce an empty string rather than an exception.
  if (columns.length === 0) return Papa.unparse(data, { header: true })
  return Papa.unparse(data, { header: true, columns })
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
//
// `filters.ids` (BULK-04) narrows the read to a caller-supplied selection. All four fetchers
// below guard on PRESENCE, never on length:
//
//   if (filters?.ids) conditions.push(...)          <- correct
//   if (filters?.ids && filters.ids.length) ...     <- an admin-gate bypass (T-38-01)
//
// Skipping the push for an empty array would drop the predicate entirely and return the whole
// table. Drizzle 0.45.1 renders an empty membership test as the literal `false`
// (node_modules/drizzle-orm/sql/expressions/conditions.js), so keeping the push yields zero
// rows. That is the second line of defence behind the `(ids: string[])`-only signature the
// per-entity bulk export actions carry; `formatters-live.test.ts` proves it against the real
// database, because a mocked suite structurally cannot catch a malformed membership fragment.
//
// Every id crosses into SQL as a bound parameter (T-38-15) — never interpolated into a raw
// `sql` fragment. The 100-id cap belongs to the server actions, not here: this is a shared
// read path the admin full export also uses and it must not acquire a bulk-specific limit.
//
// ---------------------------------------------------------------------------
// THE SAVED-VIEW PREDICATES (Phase 40, VIEW-03) AND THEIR INVARIANT
//
// Every key listed in `EXPORTABLE_FILTER_KEYS` (`src/lib/views/url-params.ts`) is applied below
// as a REAL SQL predicate by the fetcher for its entity type. That is not a convention — it is
// the claim the export guard rests on. `hasExportableFilter` decides whether a filter map may
// authorize an export at all, and it is only a meaningful gate if the keys it counts provably
// narrow the query. A key that authorizes while narrowing nothing is an unbounded export wearing
// a filter's clothes (T-40-30, 40-CONTEXT amendment A8).
//
// `src/lib/export/__tests__/view-filters.test.ts` enforces it structurally, per fetcher, over
// comment-stripped source. Adding a key to that table without a predicate here fails that gate.
//
// Each predicate MIRRORS the list page it must match, so the export and the list agree about what
// the view means: `organizations/page.tsx:29-31`, `people/page.tsx:28-31`, `deals/page.tsx:113-115`
// and `getActivities` in `activities/actions.ts`. Every filter value crosses as a BOUND PARAMETER,
// including the two `sql` fragments (T-38-15/T-40-32) — nothing is interpolated into raw text.
//
// `maxRows` is threaded as the third parameter of each fetcher and selects `maxRows + 1`, so
// `fetchFilteredData` can tell "exactly at the cap" from "over it" and refuse. Omitting it leaves
// the read unbounded, which the admin full export depends on.
// ---------------------------------------------------------------------------

/** `limit` for a `findMany`, or nothing at all when the caller set no cap. */
function rowLimit(maxRows: number | undefined): { limit?: number } {
  return maxRows === undefined ? {} : { limit: maxRows + 1 }
}

async function fetchOrganizations(
  filters: ExportFilters | undefined,
  includeCustomFields: boolean,
  maxRows?: number
) {
  const conditions: SQL[] = [isNull(organizations.deletedAt)]

  if (filters?.owner) {
    conditions.push(eq(organizations.ownerId, filters.owner))
  }
  if (filters?.search) {
    // The same three columns `organizations/page.tsx:29-31` searches, in the same order.
    conditions.push(
      or(
        ilike(organizations.name, `%${filters.search}%`),
        ilike(organizations.industry, `%${filters.search}%`),
        ilike(organizations.website, `%${filters.search}%`)
      )!
    )
  }
  if (filters?.ids) {
    conditions.push(inArray(organizations.id, filters.ids))
  }

  const rows = await db.query.organizations.findMany({
    where: and(...conditions),
    with: {
      owner: { columns: { id: true, name: true, email: true } },
    },
    ...rowLimit(maxRows),
  })

  return rows.map((r) => flattenOrganization(r as OrgRow, includeCustomFields))
}

async function fetchPeople(
  filters: ExportFilters | undefined,
  includeCustomFields: boolean,
  maxRows?: number
) {
  const conditions: SQL[] = [isNull(people.deletedAt)]

  if (filters?.owner) {
    conditions.push(eq(people.ownerId, filters.owner))
  }
  if (filters?.search) {
    // The same four columns `people/page.tsx:28-31` searches, in the same order.
    conditions.push(
      or(
        ilike(people.firstName, `%${filters.search}%`),
        ilike(people.lastName, `%${filters.search}%`),
        ilike(people.email, `%${filters.search}%`),
        ilike(people.phone, `%${filters.search}%`)
      )!
    )
  }
  if (filters?.ids) {
    conditions.push(inArray(people.id, filters.ids))
  }

  const rows = await db.query.people.findMany({
    where: and(...conditions),
    with: {
      organization: { columns: { id: true, name: true } },
      owner: { columns: { id: true, name: true, email: true } },
    },
    ...rowLimit(maxRows),
  })

  return rows.map((r) => flattenPerson(r as PersonRow, includeCustomFields))
}

async function fetchDeals(
  filters: ExportFilters | undefined,
  includeCustomFields: boolean,
  maxRows?: number
) {
  const conditions: SQL[] = [isNull(deals.deletedAt)]

  if (filters?.owner) {
    conditions.push(eq(deals.ownerId, filters.owner))
  }
  if (filters?.stage) {
    conditions.push(eq(deals.stageId, filters.stage))
  }
  if (filters?.pipeline) {
    // A BOARD SELECTOR, NOT AN AUTHORIZING FILTER. `pipeline` is absent from
    // `EXPORTABLE_FILTER_KEYS.deal` — it cannot authorize an export on its own, because a board
    // scoping 25,195 deals is the unbounded export 38-CONTEXT.md:110-116 forbids (E-2). But it
    // MUST still narrow, or a deals view exported with `pipeline` + `owner` would silently return
    // that owner's deals on every board rather than the one the view was saved on.
    //
    // Do NOT delete this predicate on the grounds that pipeline is not exportable; the two facts
    // are independent and `view-filters.test.ts` asserts both together for exactly that reason.
    conditions.push(
      sql`${deals.stageId} IN (SELECT id FROM stages WHERE pipeline_id = ${filters.pipeline})`
    )
  }
  if (filters?.assignee) {
    // The exact shape `deals/page.tsx:113-115` uses, copied rather than improvised so the export
    // and the kanban cannot disagree about what "assigned to" means.
    conditions.push(
      sql`${deals.id} IN (SELECT deal_id FROM deal_assignees WHERE user_id = ${filters.assignee})`
    )
  }
  // HALF-OPEN, `[dateFrom 00:00, dateTo+1day 00:00)` in UTC — the same rule `getActivities` applies
  // (CR-01). An `lte` upper bound is MIDNIGHT of the end day, so a deal expected to close at any
  // time later on that day was silently absent from the CSV. The 324 live deals carrying an
  // `expected_close_date` are all imported at 00:00:00, which is the only reason nobody saw it.
  if (filters?.dateFrom) {
    conditions.push(gte(deals.expectedCloseDate, startOfDayInclusive(filters.dateFrom)))
  }
  if (filters?.dateTo) {
    conditions.push(lt(deals.expectedCloseDate, endOfDayExclusive(filters.dateTo)))
  }
  if (filters?.ids) {
    conditions.push(inArray(deals.id, filters.ids))
  }

  const rows = await db.query.deals.findMany({
    where: and(...conditions),
    with: {
      stage: { columns: { id: true, name: true } },
      organization: { columns: { id: true, name: true } },
      person: { columns: { id: true, firstName: true, lastName: true } },
      owner: { columns: { id: true, name: true, email: true } },
    },
    ...rowLimit(maxRows),
  })

  return rows.map((r) => flattenDeal(r as DealRow, includeCustomFields))
}

async function fetchActivities(
  filters: ExportFilters | undefined,
  includeCustomFields: boolean,
  maxRows?: number
) {
  const conditions: SQL[] = [isNull(activities.deletedAt)]

  if (filters?.owner) {
    conditions.push(eq(activities.ownerId, filters.owner))
  }
  if (filters?.type) {
    conditions.push(eq(activities.typeId, filters.type))
  }
  if (filters?.assignee) {
    conditions.push(eq(activities.assigneeId, filters.assignee))
  }
  if (filters?.search) {
    // The same two columns `getActivities` searches (`src/app/activities/actions.ts`).
    conditions.push(
      or(
        ilike(activities.title, `%${filters.search}%`),
        ilike(activities.notes, `%${filters.search}%`)
      )!
    )
  }
  if (filters?.status) {
    // WHY THIS PREDICATE IS THE ONE THAT MATTERS ON THIS FETCHER.
    // `hasExportableFilter("activity", { status: "overdue" })` is `true`. Without a real predicate
    // here that would authorize an export of ALL 79,022 live activities — the guard satisfied by a
    // control that filters nothing, which is the exact failure mode E-2 exists to prevent and which
    // neither 40-CONTEXT nor the UI-SPEC checked on this surface (amendment A8).
    //
    // THE LIST SIDE IS CURRENTLY WEAKER THAN THIS, AND THAT IS NOT THIS FILE'S BUG TO FIX.
    // `getActivities` pushes a no-op duplicate `isNull(deletedAt)` for `completed` and then filters
    // in JavaScript AFTER applying `limit`; it applies no `status` at all for `pending`/`overdue`
    // and no date range whatsoever. **Plan 40-13 closes the list side.** Do not edit
    // `getActivities` from here — different file, different owner in this wave, and a concurrent
    // edit would collide. Until 40-13 lands the export is NARROWER than the list, which is the
    // safe direction to be wrong in.
    const now = new Date()

    if (filters.status === "completed") {
      conditions.push(isNotNull(activities.completedAt))
    } else if (filters.status === "pending") {
      conditions.push(isNull(activities.completedAt))
    } else if (filters.status === "overdue") {
      conditions.push(and(isNull(activities.completedAt), lt(activities.dueDate, now))!)
    }
    // Anything else adds no predicate. Unreachable from the view path — `pickFilterParams` has
    // already dropped a value the toolbar cannot produce — but the admin export can pass anything,
    // and an unrecognised status must not silently mean "completed".
  }
  // HALF-OPEN, `[dateFrom 00:00, dateTo+1day 00:00)` in UTC, from the SAME module `getActivities`
  // imports (CR-01). The old `lte(dueDate, new Date(dateTo))` bounded at midnight, so the CSV was
  // missing every activity due later on the last day of the range — which is every activity the app
  // creates, because the dialog composes `${dueDate}T${dueTime || "09:00"}`. It was silent: the row
  // count in the success toast comes from this query too.
  if (filters?.dateFrom) {
    conditions.push(gte(activities.dueDate, startOfDayInclusive(filters.dateFrom)))
  }
  if (filters?.dateTo) {
    conditions.push(lt(activities.dueDate, endOfDayExclusive(filters.dateTo)))
  }
  if (filters?.ids) {
    conditions.push(inArray(activities.id, filters.ids))
  }

  const rows = await db.query.activities.findMany({
    where: and(...conditions),
    with: {
      type: { columns: { id: true, name: true } },
      deal: { columns: { id: true, title: true } },
      owner: { columns: { id: true, name: true, email: true } },
    },
    ...rowLimit(maxRows),
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
    const { entityType, format, includeCustomFields, filters, maxRows } = options

    let flatData: Record<string, unknown>[]

    switch (entityType) {
      case "organization":
        flatData = await fetchOrganizations(filters, includeCustomFields, maxRows)
        break
      case "person":
        flatData = await fetchPeople(filters, includeCustomFields, maxRows)
        break
      case "deal":
        flatData = await fetchDeals(filters, includeCustomFields, maxRows)
        break
      case "activity":
        flatData = await fetchActivities(filters, includeCustomFields, maxRows)
        break
      default:
        return { success: false, error: "Unknown entity type" }
    }

    // THE CAP, REFUSED BEFORE ANY FORMATTING (T-40-31). Each fetcher above selected `maxRows + 1`,
    // so `>` here means "there is at least one more row than the caller allowed" — and the refusal
    // happens BEFORE `exportToCSV`, so a rejected 79k-row activities export never materialises a
    // CSV string it is only going to throw away. A truncated file would be worse than a refusal:
    // the user cannot see what is missing.
    //
    // `maxRows === undefined` skips this entirely, which is what keeps the admin full export and
    // the `exportSelected*` bulk paths byte-for-byte unchanged.
    if (maxRows !== undefined && flatData.length > maxRows) {
      return { success: false, error: "too_many" }
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
