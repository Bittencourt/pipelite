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
  auditLog,
} from "@/db/schema"
import { runWithActor } from "@/lib/audit/actor-context"
import { eq, and, isNull, asc } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { fuzzyMatchOrganization } from "@/lib/import/fuzzy-match"
import { getActiveFieldDefinitions } from "@/lib/custom-fields"
import { stripFormulaKeys, FORMULA_EVALUATION_BUDGET } from "@/lib/formula-recalc"
import {
  recalculateImportedRows,
  type ImportedRow,
} from "@/lib/import/formula-recalc-batch"
import type { CustomFieldDefinition, EntityType } from "@/db/schema/custom-fields"

const BATCH_SIZE = 100

/**
 * This module publishes NO events to the CRM event bus, and that is deliberate — not an
 * oversight for a later plan to "fix". An import is not a CRM event source: publishing one
 * event per imported row would fire a workflow run and a webhook delivery per row, so a
 * 5,000-row file would become 5,000 workflow executions (threat T-34-26, accepted). Formula
 * recalculation therefore happens here directly, rather than through the emit-time payload
 * rebuild the mutation layer uses for the interactive write paths.
 *
 * A source scan asserts the event-bus identifier does not appear in this file, so do not write
 * it into prose here either.
 */

/** Extract custom field values from a mapped row (keys prefixed with "custom_") */
function extractCustomFields(row: Record<string, unknown>): Record<string, unknown> {
  const custom: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (key.startsWith("custom_")) {
      const fieldName = key.slice("custom_".length)
      if (value !== "" && value !== null && value !== undefined) {
        custom[fieldName] = value
      }
    }
  }
  return custom
}

// ----- Helpers -----

/**
 * Insert rows in batches of BATCH_SIZE, returning what was actually written.
 *
 * `.returning()` is what makes formula recalculation possible at all: the recalculation needs
 * the generated row id, and passing the returned row straight through saves it a re-read per
 * row. The BATCH_SIZE chunking is unchanged.
 */
async function batchInsert<T extends Record<string, unknown>>(
  table: Parameters<typeof db.insert>[0],
  rows: T[]
): Promise<ImportedRow[]> {
  const inserted: ImportedRow[] = []
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    // The existing `as never` cast on `values` erases the row type, so the returned rows are
    // widened back to the structural shape the recalculation needs (an id plus a JSONB blob).
    const returned = await db.insert(table).values(batch as never).returning()
    inserted.push(...(returned as unknown as ImportedRow[]))
  }
  return inserted
}

/**
 * The evaluation allowance for ONE server action — one CSV upload — shared by the primary
 * batch AND by every row the importer invents along the way (D-04 / D-13, threat T-34-03).
 *
 * Each of the four exported actions below is a separate CSV upload, so one action already IS
 * one import run; that is why the CSV importer needs a per-action closure where the Pipedrive
 * importer needs a per-run one. What changed in plan 34-13 is that an action now recalculates
 * more than one batch: `importPeople` may auto-create organizations and `importDeals` may
 * auto-create both organizations and people. Handing each of those a fresh
 * `FORMULA_EVALUATION_BUDGET` would multiply the bound by the number of call sites, and a bound
 * that scales with the amount of work is not a bound. `remaining` is threaded forward instead
 * and decremented by exactly what each call spent.
 *
 * The closure also memoises the definition read per entity type, so the T-34-04 strip and the
 * recalculation share a single query rather than issuing one each.
 */
function createCsvImportFormulaBudget(warnings: string[]) {
  let remaining = FORMULA_EVALUATION_BUDGET
  const caches = new Map<EntityType, Map<EntityType, CustomFieldDefinition[]>>()

  function cacheFor(entityType: EntityType): Map<EntityType, CustomFieldDefinition[]> {
    const existing = caches.get(entityType)
    if (existing) return existing
    const created = new Map<EntityType, CustomFieldDefinition[]>()
    caches.set(entityType, created)
    return created
  }

  return {
    /** An entity type's active definitions, read ONCE per action and memoised into the cache. */
    async definitionsFor(entityType: EntityType): Promise<CustomFieldDefinition[]> {
      const cache = cacheFor(entityType)
      const cached = cache.get(entityType)
      if (cached) return cached

      const definitions = await getActiveFieldDefinitions(entityType)
      cache.set(entityType, definitions)
      return definitions
    },

    /**
     * Recalculate one set of rows against what is LEFT of the action-wide allowance, and tell
     * the user when it ran out.
     *
     * Surfacing the shortfall in the existing `warnings` array matters (T-34-25): budget
     * exhaustion is otherwise a silent partial recalculation visible only in a server log.
     */
    async recalculate(entityType: EntityType, rows: ImportedRow[]): Promise<void> {
      if (rows.length === 0) return

      const summary = await recalculateImportedRows({
        entityType,
        rows,
        budget: remaining,
        definitionsCache: cacheFor(entityType),
      })

      remaining -= summary.evaluations

      if (summary.skipped > 0) {
        warnings.push(
          `Formula fields were not recalculated for ${summary.skipped} of ${rows.length} imported ` +
            `${entityType} rows — this import exceeded the formula evaluation budget. Those rows keep ` +
            `the values they were imported with and will recompute the next time they are saved.`
        )
      }
    },
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

/**
 * Resolve organization by name: exact match, fuzzy match, or auto-create.
 *
 * When it auto-creates, it hands the INSERTED ROW back alongside the id. That row carries real
 * native attributes (`name`, `notes`) a formula can read, so it needs recalculating exactly like
 * any row the user imported — and the recalculation needs the row itself, not just its id, or it
 * would have to re-read it (FORMULA-01, the gap 34-VERIFICATION recorded). The caller collects
 * these and spends them from the same action-wide allowance as the primary batch.
 */
async function resolveOrganization(
  name: string,
  ownerId: string,
  existingOrgs: Array<{ id: string; name: string }>,
  autoCreatedOrgs: Map<string, string>
): Promise<{ id: string; autoCreated: boolean; row?: ImportedRow }> {
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

  return {
    id: newOrg.id,
    autoCreated: true,
    row: newOrg as unknown as ImportedRow,
  }
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

  // The identity of THIS import run. Nothing else in the codebase mints it: the CSV path
  // creates no session row, so this id lives only on the summary audit row written below.
  const importRunId = crypto.randomUUID()
  const actorUserId = session.user.id

  // Everything this action does from here on runs under the `import` actor kind, so a row it
  // writes is distinguishable from one a user typed in by hand (SC-3).
  //
  // The wrap is deliberately WIDER than the summary row needs. Any path inside that publishes a
  // CRM event would now be attributed `import` rather than `system` — verified during execution:
  // the auto-create paths in this file insert directly, so there are none, and auto-created
  // organizations and people therefore get no per-record audit row of their own.
  //
  // `importSessionId` is null here and NOT null on the Pipedrive path. That asymmetry is real,
  // not an oversight: the audit column is a genuine foreign key into the import-session table,
  // the CSV importer creates no row there, and storing an id with no parent would fail the
  // constraint.
  return await runWithActor({ kind: "import", userId: actorUserId, importSessionId: null }, async () => {
    try {
      const warnings: string[] = []
      const budget = createCsvImportFormulaBudget(warnings)
      const definitions = await budget.definitionsFor("organization")
      const now = new Date()
      const rows = data.map((item) => {
        const { name, website, industry, notes, ...rest } = item as Record<string, unknown>
        // T-34-04: the server is the sole writer of formula keys, so a `custom_Margin` column in
        // an uploaded file cannot seed a server-derived value.
        const customFields = stripFormulaKeys(extractCustomFields(rest), definitions)
        return {
          name: name as string,
          website: (website as string) || null,
          industry: (industry as string) || null,
          notes: (notes as string) || null,
          ownerId: session.user!.id,
          customFields,
          createdAt: now,
          updatedAt: now,
        }
      })

      const inserted = await batchInsert(organizations, rows)
      await budget.recalculate("organization", inserted)

      revalidatePath("/organizations")

      // ONE summary row for the whole run — never one per imported record. A per-record event
      // would drive the trigger evaluator once per row, so a 25,206-row file would become 25,206
      // trigger evaluations and up to that many webhook deliveries. The consequence is stated
      // rather than hidden: SC-3 holds at RUN granularity, so an import is distinguishable from a
      // user change, but an individual imported record cannot be traced back to the run that
      // created it.
      try {
        await db.insert(auditLog).values({
          entityType: "import_session",
          entityId: importRunId,
          action: "created",
          changes: {
            organizations: { from: null, to: rows.length },
            warnings: { from: null, to: warnings.length },
            autoCreated: { from: null, to: 0 },
          },
          actorKind: "import",
          actorUserId,
          workflowRunId: null,
          importSessionId: null,
        })
      } catch (auditError) {
        // Awaited — unlike the subscriber's fire-and-forget — but swallowed. The rows are already
        // in the database; turning a successful import into a reported failure because its audit
        // row failed would tell the user something untrue about their own data.
        console.error("[audit-import] failed to write organizations import summary:", auditError)
      }

      return {
        success: true,
        count: rows.length,
        warnings,
        autoCreated: { orgs: [], people: [] },
      }
    } catch (error) {
      console.error("Failed to import organizations:", error)
      return { success: false, error: "Failed to import organizations" }
    }
  })
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

  // Same actor scope as importOrganizations above, including the null session id — read the
  // comment there for why this path carries none and the Pipedrive path does.
  const importRunId = crypto.randomUUID()
  const actorUserId = session.user.id

  return await runWithActor({ kind: "import", userId: actorUserId, importSessionId: null }, async () => {
    try {
      // Load existing organizations for fuzzy matching
      const existingOrgs = await db.query.organizations.findMany({
        where: isNull(organizations.deletedAt),
        columns: { id: true, name: true },
      })
      const orgList = existingOrgs.map((o) => ({ id: o.id, name: o.name }))

      const autoCreatedOrgs = new Map<string, string>()
      const warnings: string[] = []
      const budget = createCsvImportFormulaBudget(warnings)
      const definitions = await budget.definitionsFor("person")
      const now = new Date()
      const rows: Array<Record<string, unknown>> = []
      // Rows this importer INVENTED. They carry real native attributes, so they need the same
      // recalculation as the rows the user actually uploaded (FORMULA-01).
      const autoCreatedOrgRows: ImportedRow[] = []

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
            if (result.row) autoCreatedOrgRows.push(result.row)
            warnings.push(
              `Auto-created organization "${item.organizationName}" for person "${item.firstName} ${item.lastName}"`
            )
          }
        }

        const { firstName, lastName, email, phone, notes, organizationName: _orgName, ...rest } = item as Record<string, unknown>
        // T-34-04: formula-typed keys are stripped from what the uploaded file supplied.
        const customFields = stripFormulaKeys(extractCustomFields(rest), definitions)
        rows.push({
          firstName: firstName as string,
          lastName: lastName as string,
          email: (email as string) || null,
          phone: (phone as string) || null,
          notes: (notes as string) || null,
          organizationId,
          ownerId: session.user!.id,
          customFields,
          createdAt: now,
          updatedAt: now,
        })
      }

      const inserted = await batchInsert(people, rows)
      // Parents first: a child formula may reference a parent field (D-08) including a parent
      // formula field (D-10), so the organization must hold its computed value before the people
      // that point at it compute theirs. Both spend from the SAME allowance (D-13).
      await budget.recalculate("organization", autoCreatedOrgRows)
      await budget.recalculate("person", inserted)

      revalidatePath("/people")
      revalidatePath("/organizations")

      // ONE summary row for the whole run — see importOrganizations for why per-record rows were
      // rejected. `autoCreated` counts the organizations this run invented; they were written by
      // a direct insert, so they leave no audit row of their own and this count is the only
      // record that they came from an import at all.
      try {
        await db.insert(auditLog).values({
          entityType: "import_session",
          entityId: importRunId,
          action: "created",
          changes: {
            people: { from: null, to: rows.length },
            warnings: { from: null, to: warnings.length },
            autoCreated: { from: null, to: autoCreatedOrgs.size },
          },
          actorKind: "import",
          actorUserId,
          workflowRunId: null,
          importSessionId: null,
        })
      } catch (auditError) {
        console.error("[audit-import] failed to write people import summary:", auditError)
      }

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
  })
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

  // Same actor scope as importOrganizations above, including the null session id — read the
  // comment there for why this path carries none and the Pipedrive path does.
  const importRunId = crypto.randomUUID()
  const actorUserId = session.user.id

  return await runWithActor({ kind: "import", userId: actorUserId, importSessionId: null }, async () => {
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
      const budget = createCsvImportFormulaBudget(warnings)
      const definitions = await budget.definitionsFor("deal")
      const now = new Date()
      const rows: Array<Record<string, unknown>> = []
      // Rows this importer INVENTED, for the same recalculation the uploaded rows get.
      const autoCreatedOrgRows: ImportedRow[] = []
      const autoCreatedPersonRows: ImportedRow[] = []

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
            if (result.row) autoCreatedOrgRows.push(result.row)
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
              // A row this importer invented, carrying real firstName/lastName/email/notes that a
              // formula can read — recalculated below from the action-wide allowance.
              autoCreatedPersonRows.push(newPerson as unknown as ImportedRow)
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

        const { title, value, stageName: _sn, organizationName: _on, personEmail: _pe, expectedCloseDate: _ec, notes, ...rest } = item as Record<string, unknown>
        // T-34-04: formula-typed keys are stripped from what the uploaded file supplied.
        const customFields = stripFormulaKeys(extractCustomFields(rest), definitions)
        rows.push({
          title: title as string,
          value: (value as string) || null,
          stageId,
          organizationId,
          personId,
          ownerId: session.user!.id,
          position: "10000",
          expectedCloseDate,
          notes: (notes as string) || null,
          customFields,
          createdAt: now,
          updatedAt: now,
        })
      }

      const inserted = await batchInsert(deals, rows)
      // Parents before children (D-08/D-10), all three sharing ONE decrementing allowance (D-13).
      await budget.recalculate("organization", autoCreatedOrgRows)
      await budget.recalculate("person", autoCreatedPersonRows)
      await budget.recalculate("deal", inserted)

      revalidatePath("/deals")
      revalidatePath("/people")
      revalidatePath("/organizations")

      // ONE summary row for the whole run — see importOrganizations for why per-record rows were
      // rejected. `autoCreated` sums both kinds of record this run invented, organizations and
      // people, since neither leaves an audit row of its own.
      try {
        await db.insert(auditLog).values({
          entityType: "import_session",
          entityId: importRunId,
          action: "created",
          changes: {
            deals: { from: null, to: rows.length },
            warnings: { from: null, to: warnings.length },
            autoCreated: { from: null, to: autoCreatedOrgs.size + autoCreatedPeople.size },
          },
          actorKind: "import",
          actorUserId,
          workflowRunId: null,
          importSessionId: null,
        })
      } catch (auditError) {
        console.error("[audit-import] failed to write deals import summary:", auditError)
      }

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
  })
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

  // Same actor scope as importOrganizations above, including the null session id — read the
  // comment there for why this path carries none and the Pipedrive path does.
  const importRunId = crypto.randomUUID()
  const actorUserId = session.user.id

  return await runWithActor({ kind: "import", userId: actorUserId, importSessionId: null }, async () => {
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
      const budget = createCsvImportFormulaBudget(warnings)
      const definitions = await budget.definitionsFor("activity")
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

        const { title, typeName: _tn, dueDate: _dd, dealTitle: _dt, notes, ...rest } = item as Record<string, unknown>
        // T-34-04: formula-typed keys are stripped from what the uploaded file supplied.
        const customFields = stripFormulaKeys(extractCustomFields(rest), definitions)
        rows.push({
          title: title as string,
          typeId,
          dealId,
          ownerId: session.user!.id,
          dueDate: isNaN(dueDate.getTime()) ? now : dueDate,
          notes: (notes as string) || null,
          customFields,
          createdAt: now,
          updatedAt: now,
        })
      }

      const inserted = await batchInsert(activities, rows)
      await budget.recalculate("activity", inserted)

      revalidatePath("/activities")

      // ONE summary row for the whole run — see importOrganizations for why per-record rows were
      // rejected. This action invents nothing, so `autoCreated` is a constant zero rather than an
      // omitted key: a reader comparing four summary rows should see the same shape in each.
      try {
        await db.insert(auditLog).values({
          entityType: "import_session",
          entityId: importRunId,
          action: "created",
          changes: {
            activities: { from: null, to: rows.length },
            warnings: { from: null, to: warnings.length },
            autoCreated: { from: null, to: 0 },
          },
          actorKind: "import",
          actorUserId,
          workflowRunId: null,
          importSessionId: null,
        })
      } catch (auditError) {
        console.error("[audit-import] failed to write activities import summary:", auditError)
      }

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
  })
}
