"use server"

import { auth } from "@/auth"
import { createPipedriveClient } from "./pipedrive-api-client"
import type { PipedriveImportConfig } from "./pipedrive-api-types"
import type {
  PipedrivePipeline,
  PipedriveStage,
  PipedriveOrganization,
  PipedrivePerson,
  PipedriveDeal,
  PipedriveActivity,
  PipedriveFieldDefinition,
  PipedriveUser,
} from "./pipedrive-api-types"
import {
  createImportState,
  getImportState,
  updateImportState,
  cancelImport,
  isImportCancelled,
  addImportError,
  addReviewItem,
  incrementImportedCount,
  type ImportProgressState,
} from "./pipedrive-import-state"
import { db } from "@/db"
import {
  users,
  pipelines,
  stages,
  organizations,
  people,
  deals,
  activities,
  activityTypes,
  customFieldDefinitions,
  auditLog,
} from "@/db/schema"
import { runWithActor } from "@/lib/audit/actor-context"
import { isNull } from "drizzle-orm"
import {
  transformPipedrivePipeline,
  transformPipedriveStage,
  transformPipedriveOrganization,
  transformPipedrivePerson,
  transformPipedriveDeal,
  transformPipedriveActivity,
  transformPipedriveCustomField,
  type NewPipelineData,
  type NewStageData,
  type NewOrganizationData,
  type NewPersonData,
  type NewDealData,
} from "./pipedrive-api-transformers"
import type { CustomFieldDefinition, FieldType, EntityType } from "@/db/schema/custom-fields"
import { getActiveFieldDefinitions } from "@/lib/custom-fields"
import { stripFormulaKeys, FORMULA_EVALUATION_BUDGET } from "@/lib/formula-recalc"
import { recalculateImportedRows, type ImportedRow } from "./formula-recalc-batch"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PipedriveCounts {
  pipelines: number
  stages: number
  organizations: number
  organizationsHasMore: boolean
  people: number
  peopleHasMore: boolean
  deals: number
  dealsHasMore: boolean
  activities: number
  activitiesHasMore: boolean
  dealFields: number
  personFields: number
  organizationFields: number
  activityFields: number
}

const BATCH_SIZE = 100

// ---------------------------------------------------------------------------
// Batch Insert Helper
// ---------------------------------------------------------------------------

async function batchInsert<T extends Record<string, unknown>>(
  table: Parameters<typeof db.insert>[0],
  rows: T[]
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    await db.insert(table).values(batch as never)
  }
}

// ---------------------------------------------------------------------------
// Formula recalculation — one shared budget for the WHOLE import run
// ---------------------------------------------------------------------------

/**
 * The evaluation allowance for one entire `importFromPipedrive` run, shared by organizations,
 * people, deals, activities and the auto-created stubs alike (D-04/D-13, threat T-34-03).
 *
 * A Pipedrive run writes four entity types in sequence, so handing each block its own fresh
 * `FORMULA_EVALUATION_BUDGET` would multiply the bound by the number of blocks — and a bound
 * that scales with the amount of work is not a bound. `remaining` is threaded forward instead
 * and decremented by what each block actually spent.
 */
function createImportFormulaBudget() {
  let remaining = FORMULA_EVALUATION_BUDGET
  const caches = new Map<EntityType, Map<EntityType, CustomFieldDefinition[]>>()

  /** One definitions cache per entity type, reused by every block that touches it. */
  function cacheFor(entityType: EntityType): Map<EntityType, CustomFieldDefinition[]> {
    const existing = caches.get(entityType)
    if (existing) return existing
    const created = new Map<EntityType, CustomFieldDefinition[]>()
    caches.set(entityType, created)
    return created
  }

  return {
    /**
     * The active definitions for an entity type, read ONCE per run and memoised into the very
     * cache the recalculation is handed — so the T-34-04 strip and the recalculation share a
     * single query rather than issuing one each.
     */
    async definitionsFor(entityType: EntityType): Promise<CustomFieldDefinition[]> {
      const cache = cacheFor(entityType)
      const cached = cache.get(entityType)
      if (cached) return cached

      const definitions = await getActiveFieldDefinitions(entityType)
      cache.set(entityType, definitions)
      return definitions
    },

    /** Recalculate one block's rows against what is left of the run-wide allowance. */
    async recalculate(entityType: EntityType, rows: ImportedRow[]): Promise<void> {
      if (rows.length === 0) return

      const summary = await recalculateImportedRows({
        entityType,
        rows,
        budget: remaining,
        definitionsCache: cacheFor(entityType),
      })

      remaining -= summary.evaluations
    },
  }
}

// Helper to update completed entities count
async function updateCompletedCount(importId: string, additionalCount: number): Promise<void> {
  const currentState = await getImportState(importId)
  if (currentState) {
    await updateImportState(importId, {
      completedEntities: currentState.completedEntities + additionalCount,
    })
  }
}

// ---------------------------------------------------------------------------
// fetchPipedriveCounts
// ---------------------------------------------------------------------------

/**
 * Validate a Pipedrive API key by making a single lightweight API call.
 *
 * Used in step 1 of the import wizard to verify the key before proceeding.
 * Much faster than fetchPipedriveCounts because it fetches only 1 record.
 */
export async function validatePipedriveApiKey(
  apiKey: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  try {
    const client = createPipedriveClient(apiKey)
    // Fetch a single pipeline to confirm the key is valid.
    // This is a fast single-request check with no pagination.
    await client.fetchPipelines()
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Invalid API key or failed to connect to Pipedrive",
    }
  }
}

/**
 * Fetch entity counts from Pipedrive for the import preview step.
 *
 * For large entity types (organizations, people, deals, activities), fetches
 * only the first page (up to 500 items) rather than paginating all records.
 * This avoids server action timeouts on large accounts while still providing
 * useful count estimates. When more than 500 records exist, the hasMore flag
 * is set on the corresponding count field.
 *
 * For small entity types (pipelines, stages, field definitions), fetches all
 * records since these are always small datasets.
 */
export async function fetchPipedriveCounts(
  apiKey: string
): Promise<{ success: true; counts: PipedriveCounts } | { success: false; error: string }> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  try {
    const client = createPipedriveClient(apiKey)

    // Fetch small entities fully (always small datasets) and large entities
    // using a single-page count to avoid paginating through thousands of records.
    const [
      pipelinesData,
      stagesData,
      orgsCount,
      peopleCount,
      dealsCount,
      activitiesCount,
      dealFieldsData,
      personFieldsData,
      organizationFieldsData,
      activityFieldsData,
    ] = await Promise.all([
      client.fetchPipelines(),
      client.fetchStages(),
      client.fetchOrganizationsCount(),
      client.fetchPeopleCount(),
      client.fetchDealsCount(),
      client.fetchActivitiesCount(),
      client.fetchDealFields(),
      client.fetchPersonFields(),
      client.fetchOrganizationFields(),
      client.fetchActivityFields(),
    ])

    return {
      success: true,
      counts: {
        pipelines: pipelinesData.length,
        stages: stagesData.length,
        organizations: orgsCount.count,
        organizationsHasMore: orgsCount.hasMore,
        people: peopleCount.count,
        peopleHasMore: peopleCount.hasMore,
        deals: dealsCount.count,
        dealsHasMore: dealsCount.hasMore,
        activities: activitiesCount.count,
        activitiesHasMore: activitiesCount.hasMore,
        dealFields: dealFieldsData.length,
        personFields: personFieldsData.length,
        organizationFields: organizationFieldsData.length,
        activityFields: activityFieldsData.length,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch counts from Pipedrive",
    }
  }
}

// ---------------------------------------------------------------------------
// importFromPipedrive
// ---------------------------------------------------------------------------

/**
 * Import all selected entities from Pipedrive.
 *
 * Import order respects dependencies:
 * 1. Pipelines → Stages (depends on pipelines)
 * 2. Custom field definitions
 * 3. Organizations
 * 4. People (depends on orgs)
 * 5. Deals (depends on stages, orgs, people)
 * 6. Activities (depends on deals)
 *
 * Features:
 * - Owner matching by email with fallback to importing user
 * - Duplicate detection (orgs by name, people by email, deals by title+org)
 * - Stub creation for orphan references
 * - Error collection with continuation
 * - Progress tracking and cancellation support
 */
export async function importFromPipedrive(
  apiKey: string,
  config: PipedriveImportConfig,
  importId: string,
  preloadedCounts?: PipedriveCounts
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  const importingUserId = session.user.id

  // The whole run executes under the `import` actor kind, so every row it writes is
  // distinguishable from one a user typed in by hand (SC-3).
  //
  // `importSessionId` IS populated here, and is deliberately null on the CSV path in
  // src/app/import/actions.ts. The asymmetry is not an oversight: `importId` is a real primary
  // key in the import-session table, so the audit column's foreign key resolves, whereas the CSV
  // importer creates no such row and would have nothing valid to point at.
  return await runWithActor({ kind: "import", userId: importingUserId, importSessionId: importId }, async () => {
    // Create state in DB where it survives container restarts.
    //
    // This is the ONE terminal path that writes no summary row: the rejection means a DIFFERENT
    // session is running, so no session row exists under this id, this run loaded nothing, and a
    // row pointing at a non-existent parent would fail the foreign key anyway.
    try {
      await createImportState(importId, importingUserId)
    } catch (error) {
      if (error instanceof Error && error.message === "An import is already in progress") {
        return { success: false, error: "An import is already in progress" }
      }
      throw error
    }

    await updateImportState(importId, { status: 'running' })
    const client = createPipedriveClient(apiKey)
    const now = new Date()

    /**
     * The ONE audit row this run leaves — a summary of what it loaded, never one row per record.
     *
     * Per-record rows were rejected on measured cost, not on taste: a 25,206-deal import would
     * publish 25,206 CRM events, and the trigger evaluator subscribes to all thirteen of them, so
     * the import would become 25,206 trigger evaluations and up to that many webhook deliveries.
     * The consequence is real and is written down rather than glossed: SC-3 holds at SESSION
     * granularity. An import is distinguishable from a user change; an individual imported record
     * is not traceable back to the run that created it.
     *
     * Called from exactly one place per terminal path — completion, cancellation, and failure —
     * and each of those returns immediately afterwards, so a run leaves exactly one row.
     *
     * The counts come from the session row this function has been maintaining all along, so a
     * cancelled or failed run reports what it actually reached rather than nothing. An import
     * that moved 8,000 deals and was then cancelled did move 8,000 deals, and a log that omits it
     * is wrong in the direction that matters.
     */
    const writeImportSummary = async (outcome: 'completed' | 'cancelled' | 'error') => {
      try {
        const finalState = await getImportState(importId)
        const imported = finalState?.imported
        await db.insert(auditLog).values({
          entityType: "import_session",
          entityId: importId,
          action: "created",
          changes: {
            outcome: { from: null, to: outcome },
            pipelines: { from: null, to: imported?.pipelines ?? 0 },
            stages: { from: null, to: imported?.stages ?? 0 },
            customFields: { from: null, to: imported?.customFields ?? 0 },
            organizations: { from: null, to: imported?.organizations ?? 0 },
            people: { from: null, to: imported?.people ?? 0 },
            deals: { from: null, to: imported?.deals ?? 0 },
            activities: { from: null, to: imported?.activities ?? 0 },
            errors: { from: null, to: finalState?.errors.length ?? 0 },
          },
          actorKind: "import",
          actorUserId: importingUserId,
          workflowRunId: null,
          importSessionId: importId,
        })
      } catch (auditError) {
        // Awaited — unlike the subscriber's fire-and-forget — but swallowed. Whatever this run
        // loaded is already in the database, and failing the import because its audit row failed
        // would report a lie about the user's own data (T-36-26).
        console.error('[audit-import] failed to write Pipedrive import summary:', auditError)
      }
    }

    // Helper to check cancellation
    const checkCancelled = async () => {
      if (await isImportCancelled(importId)) {
        await updateImportState(importId, { status: 'cancelled', completedAt: new Date() })
        // Written HERE rather than at the six call sites so a cancellation cannot be added later
        // that forgets to record what it had already loaded.
        await writeImportSummary('cancelled')
        return true
      }
      return false
    }

    try {
      // -----------------------------------------------------------------------
      // Load Pipelite users for email matching
      // -----------------------------------------------------------------------
      const pipeliteUsers = await db.query.users.findMany({
        where: isNull(users.deletedAt),
        columns: { id: true, email: true },
      })

      // Load Pipedrive users and build owner mapping
      const pipedriveUsersData = await client.fetchUsers()
      const pipedriveUsers = pipedriveUsersData as PipedriveUser[]
      const pdUserToPipeliteUser = new Map<number, string>()

      for (const pdUser of pipedriveUsers) {
        const match = pipeliteUsers.find(
          (u) => u.email.toLowerCase() === pdUser.email.toLowerCase()
        )
        pdUserToPipeliteUser.set(pdUser.id, match?.id ?? importingUserId)
      }

      // -----------------------------------------------------------------------
      // Calculate total entities for progress tracking
      // Use preloaded counts from the wizard preview step if available,
      // otherwise fetch them (avoids extra API calls that can hit rate limits)
      // -----------------------------------------------------------------------
      let countsData: PipedriveCounts
      if (preloadedCounts) {
        countsData = preloadedCounts
      } else {
        const countsResult = await fetchPipedriveCounts(apiKey)
        if (!countsResult.success) {
          throw new Error(countsResult.error)
        }
        countsData = countsResult.counts
      }
      let totalEntities = 0
      if (config.entities.pipelines) {
        totalEntities += countsData.pipelines + countsData.stages
      }
      if (config.entities.customFields) {
        totalEntities +=
          countsData.dealFields +
          countsData.personFields +
          countsData.organizationFields +
          countsData.activityFields
      }
      if (config.entities.organizations) {
        totalEntities += countsData.organizations
      }
      if (config.entities.people) {
        totalEntities += countsData.people
      }
      if (config.entities.deals) {
        totalEntities += countsData.deals
      }
      if (config.entities.activities) {
        totalEntities += countsData.activities
      }

      await updateImportState(importId, { totalEntities })

      // ONE formula evaluation allowance for this entire run, spent down by every entity block
      // below. Created here rather than per block so the D-13 bound cannot be multiplied by the
      // number of entity types an import happens to cover.
      const formulaBudget = createImportFormulaBudget()

      // ID maps for entity relationships
      const pipelineIdMap = new Map<number, string>()
      const stageIdMap = new Map<number, string>()
      const orgIdMap = new Map<number, string>()
      const personIdMap = new Map<number, string>()
      const dealIdMap = new Map<number, string>()

      // Pipedrive field definitions (needed for custom field extraction)
      // Fetch these upfront so they're available for both custom field import and entity transformations
      let pdDealFields: PipedriveFieldDefinition[] = []
      let pdPersonFields: PipedriveFieldDefinition[] = []
      let pdOrgFields: PipedriveFieldDefinition[] = []
      let pdActivityFields: PipedriveFieldDefinition[] = []

      // Fetch field definitions if custom fields or any entities with custom fields are enabled
      const needsFieldDefs = config.entities.customFields ||
        config.entities.organizations ||
        config.entities.people ||
        config.entities.deals ||
        config.entities.activities

      if (needsFieldDefs) {
        const [dealFieldsData, personFieldsData, orgFieldsData, activityFieldsData] =
          await Promise.all([
            client.fetchDealFields(),
            client.fetchPersonFields(),
            client.fetchOrganizationFields(),
            client.fetchActivityFields(),
          ])

        pdDealFields = dealFieldsData as PipedriveFieldDefinition[]
        pdPersonFields = personFieldsData as PipedriveFieldDefinition[]
        pdOrgFields = orgFieldsData as PipedriveFieldDefinition[]
        pdActivityFields = activityFieldsData as PipedriveFieldDefinition[]
      }

      // -----------------------------------------------------------------------
      // 1. Import Pipelines
      // -----------------------------------------------------------------------
      if (config.entities.pipelines) {
        if (await checkCancelled()) return { success: false, error: "Import cancelled" }

        await updateImportState(importId, { currentEntity: 'pipelines' })

        const pipelinesData = await client.fetchPipelines()
        const pdPipelines = pipelinesData as PipedrivePipeline[]

        // Load existing pipelines for duplicate detection
        const existingPipelines = await db.query.pipelines.findMany({
          where: isNull(pipelines.deletedAt),
          columns: { id: true, name: true },
        })

        const newPipelines: Array<NewPipelineData & { pdId: number }> = []

        for (const pdPipeline of pdPipelines) {
          // Pipelines/Stages: always create (clone Pipedrive structure)
          // Check for existing by name (case-insensitive) in this import batch
          const existingByName = existingPipelines.find(
            (p) => p.name.toLowerCase() === pdPipeline.name.toLowerCase()
          )

          if (!existingByName) {
            const transformed = transformPipedrivePipeline(pdPipeline, importingUserId)
            newPipelines.push({ ...transformed, pdId: pdPipeline.id })
          }
        }

        // Insert pipelines and build ID map
        if (newPipelines.length > 0) {
          for (const pipelineData of newPipelines) {
            const [inserted] = await db
              .insert(pipelines)
              .values({
                name: pipelineData.name,
                isDefault: pipelineData.isDefault,
                ownerId: pipelineData.ownerId,
                createdAt: now,
                updatedAt: now,
              })
              .returning()

            pipelineIdMap.set(pipelineData.pdId, inserted.id)
            await incrementImportedCount(importId, 'pipelines')
          }
        }

        await updateCompletedCount(importId, pdPipelines.length)
      }

      // -----------------------------------------------------------------------
      // 2. Import Stages
      // -----------------------------------------------------------------------
      if (config.entities.pipelines) {
        if (await checkCancelled()) return { success: false, error: "Import cancelled" }

        await updateImportState(importId, { currentEntity: 'stages' })

        const stagesData = await client.fetchStages()
        const pdStages = stagesData as PipedriveStage[]

        // Load existing stages for duplicate detection
        const existingStages = await db.query.stages.findMany({
          columns: { id: true, pipelineId: true, name: true },
        })

        const newStages: Array<NewStageData & { pdId: number }> = []

        for (const pdStage of pdStages) {
          // Only import if the pipeline was imported
          const pipelineId = pipelineIdMap.get(pdStage.pipeline_id)
          if (!pipelineId) {
            // Pipeline wasn't imported (was existing), skip stage
            continue
          }

          // Check for existing stage by name in this pipeline
          const existingInPipeline = existingStages.find(
            (s) => s.pipelineId === pipelineId && s.name.toLowerCase() === pdStage.name.toLowerCase()
          )

          if (!existingInPipeline) {
            const transformed = transformPipedriveStage(pdStage, pipelineIdMap)
            if (transformed) {
              newStages.push({ ...transformed, pdId: pdStage.id })
            }
          }
        }

        // Insert stages and build ID map
        if (newStages.length > 0) {
          for (const stageData of newStages) {
            const [inserted] = await db
              .insert(stages)
              .values({
                pipelineId: stageData.pipelineId,
                name: stageData.name,
                description: stageData.description,
                color: stageData.color,
                type: stageData.type,
                position: stageData.position,
                createdAt: now,
                updatedAt: now,
              })
              .returning()

            stageIdMap.set(stageData.pdId, inserted.id)
            await incrementImportedCount(importId, 'stages')
          }
        }

        await updateCompletedCount(importId, pdStages.length)
      }

      // -----------------------------------------------------------------------
      // 3. Import Custom Field Definitions
      // -----------------------------------------------------------------------
      if (config.entities.customFields) {
        if (await checkCancelled()) return { success: false, error: "Import cancelled" }

        await updateImportState(importId, { currentEntity: 'customFields' })

        // Fetch all custom field definitions
        const [dealFieldsData, personFieldsData, orgFieldsData, activityFieldsData] =
          await Promise.all([
            client.fetchDealFields(),
            client.fetchPersonFields(),
            client.fetchOrganizationFields(),
            client.fetchActivityFields(),
          ])

        const pdDealFields = dealFieldsData as PipedriveFieldDefinition[]
        const pdPersonFields = personFieldsData as PipedriveFieldDefinition[]
        const pdOrgFields = orgFieldsData as PipedriveFieldDefinition[]
        const pdActivityFields = activityFieldsData as PipedriveFieldDefinition[]

        // Load existing custom fields for duplicate detection
        const existingFields = await db.query.customFieldDefinitions.findMany({
          where: isNull(customFieldDefinitions.deletedAt),
          columns: { id: true, entityType: true, name: true },
        })

        const insertCustomField = async (
          field: PipedriveFieldDefinition,
          entityType: EntityType
        ) => {
          // Custom Fields: match by entity_type + key
          const existing = existingFields.find(
            (f) => f.entityType === entityType && f.name.toLowerCase() === field.name.toLowerCase()
          )

          if (!existing) {
            const transformed = transformPipedriveCustomField(field, entityType)
            if (transformed) {
              const inserted = await db.insert(customFieldDefinitions).values({
                entityType: transformed.entityType as EntityType,
                name: transformed.name,
                type: transformed.type as FieldType,
                config: transformed.config,
                required: transformed.required,
                position: transformed.position,
                showInList: transformed.showInList,
                createdAt: now,
                updatedAt: now,
              }).onConflictDoNothing().returning()
              if (inserted.length > 0) {
                await incrementImportedCount(importId, 'customFields')
              }
            }
          }
        }

        // Insert custom fields for each entity type
        for (const field of pdDealFields) {
          await insertCustomField(field, 'deal')
        }
        for (const field of pdPersonFields) {
          await insertCustomField(field, 'person')
        }
        for (const field of pdOrgFields) {
          await insertCustomField(field, 'organization')
        }
        for (const field of pdActivityFields) {
          await insertCustomField(field, 'activity')
        }

        await updateCompletedCount(
          importId,
          pdDealFields.length + pdPersonFields.length + pdOrgFields.length + pdActivityFields.length
        )
      }

      // -----------------------------------------------------------------------
      // 4. Import Organizations
      // -----------------------------------------------------------------------
      if (config.entities.organizations) {
        if (await checkCancelled()) return { success: false, error: "Import cancelled" }

        await updateImportState(importId, { currentEntity: 'organizations' })

        const orgsData = await client.fetchOrganizations()
        const pdOrgs = orgsData as PipedriveOrganization[]

        // Load existing organizations for duplicate detection
        const existingOrgs = await db.query.organizations.findMany({
          where: isNull(organizations.deletedAt),
          columns: { id: true, name: true },
        })

        const newOrgs: Array<NewOrganizationData & { pdId: number }> = []

        for (const pdOrg of pdOrgs) {
          // Organizations: match by name (case-insensitive)
          const existing = existingOrgs.find(
            (o) => o.name.toLowerCase() === pdOrg.name.toLowerCase()
          )

          if (!existing) {
            // v2 API: owner_id is a plain number (not an object)
            const ownerId = pdOrg.owner_id
              ? pdUserToPipeliteUser.get(pdOrg.owner_id) ?? importingUserId
              : importingUserId

            // Pass Pipedrive field definitions (pdOrgFields) so extractCustomFieldValues
            // can map hash keys → field names. These are fetched upfront in needsFieldDefs block.
            const transformed = transformPipedriveOrganization(pdOrg, ownerId, pdOrgFields)
            newOrgs.push({ ...transformed, pdId: pdOrg.id })
          } else {
            // Map to existing for relationships
            orgIdMap.set(pdOrg.id, existing.id)
          }
        }

        // Insert organizations and build ID map
        const insertedOrgs: ImportedRow[] = []
        if (newOrgs.length > 0) {
          // T-34-04: a Pipedrive field mapped onto a formula-typed custom field name cannot seed a
          // server-derived value. The definitions are read once per run and reused by the recalc.
          const orgDefinitions = await formulaBudget.definitionsFor("organization")

          for (const orgData of newOrgs) {
            const [inserted] = await db
              .insert(organizations)
              .values({
                name: orgData.name,
                website: orgData.website,
                industry: orgData.industry,
                notes: orgData.notes,
                ownerId: orgData.ownerId,
                defaultCurrency: orgData.defaultCurrency,
                customFields: stripFormulaKeys(orgData.customFields ?? {}, orgDefinitions),
                createdAt: now,
                updatedAt: now,
              })
              .returning()

            orgIdMap.set(orgData.pdId, inserted.id)
            insertedOrgs.push(inserted as unknown as ImportedRow)
            await incrementImportedCount(importId, 'organizations')
          }
        }

        await formulaBudget.recalculate("organization", insertedOrgs)

        await updateCompletedCount(importId, pdOrgs.length)
      }

      // -----------------------------------------------------------------------
      // 5. Import People
      // -----------------------------------------------------------------------
      if (config.entities.people) {
        if (await checkCancelled()) return { success: false, error: "Import cancelled" }

        await updateImportState(importId, { currentEntity: 'people' })

        const peopleData = await client.fetchPeople()
        const pdPeople = peopleData as PipedrivePerson[]

        // Load existing people for duplicate detection
        const existingPeople = await db.query.people.findMany({
          where: isNull(people.deletedAt),
          columns: { id: true, email: true },
        })

        // Use Pipedrive person field definitions for custom field extraction
        // (these were fetched earlier in the custom fields import section)
        const newPeople: Array<NewPersonData & { pdId: number }> = []

        for (const pdPerson of pdPeople) {
          // People: match by email (case-insensitive)
          // v2 API: email array is named 'emails' (plural)
          const primaryEmail =
            pdPerson.emails?.find((e) => e.primary)?.value || pdPerson.emails?.[0]?.value

          const existing = primaryEmail
            ? existingPeople.find((p) => p.email?.toLowerCase() === primaryEmail.toLowerCase())
            : null

          if (!existing) {
            // v2 API: owner_id is a plain number (not an object)
            const ownerId = pdPerson.owner_id
              ? pdUserToPipeliteUser.get(pdPerson.owner_id) ?? importingUserId
              : importingUserId

            const transformed = transformPipedrivePerson(
              pdPerson,
              orgIdMap,
              ownerId,
              pdPersonFields
            )
            newPeople.push({ ...transformed, pdId: pdPerson.id })
          } else {
            // Map to existing for relationships
            personIdMap.set(pdPerson.id, existing.id)
          }
        }

        // Insert people and build ID map
        const insertedPeople: ImportedRow[] = []
        if (newPeople.length > 0) {
          // T-34-04: strip formula-typed keys from the Pipedrive field mapping.
          const personDefinitions = await formulaBudget.definitionsFor("person")

          for (const personData of newPeople) {
            const [inserted] = await db
              .insert(people)
              .values({
                firstName: personData.firstName,
                lastName: personData.lastName,
                email: personData.email,
                phone: personData.phone,
                notes: personData.notes,
                organizationId: personData.organizationId,
                ownerId: personData.ownerId,
                customFields: stripFormulaKeys(personData.customFields ?? {}, personDefinitions),
                createdAt: now,
                updatedAt: now,
              })
              .returning()

            personIdMap.set(personData.pdId, inserted.id)
            insertedPeople.push(inserted as unknown as ImportedRow)
            await incrementImportedCount(importId, 'people')
          }
        }

        await formulaBudget.recalculate("person", insertedPeople)

        await updateCompletedCount(importId, pdPeople.length)
      }

      // -----------------------------------------------------------------------
      // 6. Import Deals
      // -----------------------------------------------------------------------
      if (config.entities.deals) {
        if (await checkCancelled()) return { success: false, error: "Import cancelled" }

        await updateImportState(importId, { currentEntity: 'deals' })

        const dealsData = await client.fetchDeals()
        const pdDeals = dealsData as PipedriveDeal[]

        // Load existing deals for duplicate detection
        const existingDeals = await db.query.deals.findMany({
          where: isNull(deals.deletedAt),
          columns: { id: true, title: true, organizationId: true },
        })

        // Use the deal field definitions fetched earlier (avoid re-fetching / variable shadowing)
        // pdDealFields is already populated in the upfront field definitions fetch above.

        const newDeals: Array<NewDealData & { pdId: number }> = []
        // Auto-created stubs are imported rows too: they carry real native attributes (a name, a
        // notes string) that a formula may read, so they are recalculated alongside the deals.
        const stubOrgs: ImportedRow[] = []
        const stubPeople: ImportedRow[] = []

        for (const pdDeal of pdDeals) {
          // Deals: match by title + organization_id
          // v2 API: org_id is a plain number (not an object)
          const orgId = pdDeal.org_id ? orgIdMap.get(pdDeal.org_id) : null

          const existing = existingDeals.find(
            (d) =>
              d.title.toLowerCase() === pdDeal.title.toLowerCase() &&
              d.organizationId === orgId
          )

          if (!existing) {
            // v2 API: owner_id is a plain number (not an object)
            const ownerId = pdDeal.owner_id
              ? pdUserToPipeliteUser.get(pdDeal.owner_id) ?? importingUserId
              : importingUserId

            // Handle orphan references - create stubs if needed
            // v2 API: org_id and person_id are plain numbers (not objects)
            let dealOrgId: string | null = pdDeal.org_id ? (orgIdMap.get(pdDeal.org_id) ?? null) : null
            let dealPersonId: string | null = pdDeal.person_id ? (personIdMap.get(pdDeal.person_id) ?? null) : null

            // Create stub org if missing (org referenced by deal but not imported)
            if (pdDeal.org_id && !dealOrgId) {
              const stubName = `[Pipedrive Import] Organization #${pdDeal.org_id}`
              const [stubOrg] = await db
                .insert(organizations)
                .values({
                  name: stubName,
                  notes: `[Pipedrive Import] Auto-created stub for deal "${pdDeal.title}"`,
                  ownerId: importingUserId,
                  createdAt: now,
                  updatedAt: now,
                })
                .returning()

              dealOrgId = stubOrg.id
              orgIdMap.set(pdDeal.org_id, stubOrg.id)
              stubOrgs.push(stubOrg as unknown as ImportedRow)
              await addReviewItem(importId, 'organization', stubOrg.id, `Stub created for deal "${pdDeal.title}"`)
            }

            // Create stub person if missing (person referenced by deal but not imported)
            if (pdDeal.person_id && !dealPersonId) {
              const [stubPerson] = await db
                .insert(people)
                .values({
                  firstName: '[Pipedrive Import]',
                  lastName: `Person #${pdDeal.person_id}`,
                  notes: `[Pipedrive Import] Auto-created stub for deal "${pdDeal.title}"`,
                  organizationId: dealOrgId,
                  ownerId: importingUserId,
                  createdAt: now,
                  updatedAt: now,
                })
                .returning()

              dealPersonId = stubPerson.id
              personIdMap.set(pdDeal.person_id, stubPerson.id)
              stubPeople.push(stubPerson as unknown as ImportedRow)
              await addReviewItem(importId, 'person', stubPerson.id, `Stub created for deal "${pdDeal.title}"`)
            }

            const transformed = transformPipedriveDeal(
              pdDeal,
              stageIdMap,
              orgIdMap,
              personIdMap,
              ownerId,
              pdDealFields
            )

            if (transformed) {
              newDeals.push({ ...transformed, pdId: pdDeal.id })
            }
          } else {
            dealIdMap.set(pdDeal.id, existing.id)
          }
        }

        // Insert deals and build ID map
        const insertedDeals: ImportedRow[] = []
        if (newDeals.length > 0) {
          // T-34-04: strip formula-typed keys from the Pipedrive field mapping.
          const dealDefinitions = await formulaBudget.definitionsFor("deal")

          for (const dealData of newDeals) {
            const [inserted] = await db
              .insert(deals)
              .values({
                title: dealData.title,
                value: dealData.value,
                stageId: dealData.stageId,
                organizationId: dealData.organizationId,
                personId: dealData.personId,
                ownerId: dealData.ownerId,
                position: dealData.position,
                expectedCloseDate: dealData.expectedCloseDate,
                notes: dealData.notes,
                customFields: stripFormulaKeys(dealData.customFields ?? {}, dealDefinitions),
                createdAt: now,
                updatedAt: now,
              })
              .returning()

            dealIdMap.set(dealData.pdId, inserted.id)
            insertedDeals.push(inserted as unknown as ImportedRow)
            await incrementImportedCount(importId, 'deals')
          }
        }

        await formulaBudget.recalculate("organization", stubOrgs)
        await formulaBudget.recalculate("person", stubPeople)
        await formulaBudget.recalculate("deal", insertedDeals)

        await updateCompletedCount(importId, pdDeals.length)
      }

      // -----------------------------------------------------------------------
      // 7. Import Activities
      // -----------------------------------------------------------------------
      if (config.entities.activities) {
        if (await checkCancelled()) return { success: false, error: "Import cancelled" }

        await updateImportState(importId, { currentEntity: 'activities' })

        const activitiesData = await client.fetchActivities()
        const pdActivities = activitiesData as PipedriveActivity[]

        // Load activity types
        const types = await db.query.activityTypes.findMany()
        const typeMap = new Map(types.map((t) => [t.name.toLowerCase(), t.id]))
        const defaultTypeId = types.find((t) => t.name.toLowerCase() === 'task')?.id || types[0]?.id

        if (!defaultTypeId) {
          await addImportError(importId, 'activities', 'No activity types found')
        } else {
          const newActivities: Array<{
            title: string
            typeId: string
            dealId: string | null
            ownerId: string
            dueDate: Date
            completedAt: Date | null
            notes: string | null
            customFields: Record<string, unknown>
          }> = []

          for (const pdActivity of pdActivities) {
            const ownerId = pdActivity.owner_id
              ? pdUserToPipeliteUser.get(pdActivity.owner_id) ?? importingUserId
              : importingUserId

            // Resolve deal ID
            const dealId: string | null = pdActivity.deal_id ? (dealIdMap.get(pdActivity.deal_id) ?? null) : null

            // Resolve activity type
            const typeName = pdActivity.type?.toLowerCase() || 'task'
            const typeId = typeMap.get(typeName) || defaultTypeId

            // Parse due date
            const dueDate = pdActivity.due_date ? new Date(pdActivity.due_date) : new Date()
            const completedAt = pdActivity.done ? new Date() : null

            // Extract custom fields (activities have no custom_fields in Pipedrive v2)
            const transformed = transformPipedriveActivity(
              pdActivity,
              dealIdMap,
              ownerId,
            )

            newActivities.push({
              title: transformed.title,
              typeId,
              dealId,
              ownerId: transformed.ownerId,
              dueDate: transformed.dueDate,
              completedAt: transformed.completedAt,
              notes: transformed.notes,
              customFields: transformed.customFields,
            })
          }

          // Insert activities
          const insertedActivities: ImportedRow[] = []
          if (newActivities.length > 0) {
            // T-34-04: strip formula-typed keys from the Pipedrive field mapping.
            const activityDefinitions = await formulaBudget.definitionsFor("activity")

            for (const activityData of newActivities) {
              // `.returning()` — the recalculation needs the generated id, and passing the row
              // through saves it a re-read.
              const [inserted] = await db.insert(activities).values({
                title: activityData.title,
                typeId: activityData.typeId,
                dealId: activityData.dealId,
                ownerId: activityData.ownerId,
                dueDate: activityData.dueDate,
                completedAt: activityData.completedAt,
                notes: activityData.notes,
                customFields: stripFormulaKeys(activityData.customFields ?? {}, activityDefinitions),
                createdAt: now,
                updatedAt: now,
              }).returning()

              insertedActivities.push(inserted as unknown as ImportedRow)
              await incrementImportedCount(importId, 'activities')
            }
          }

          await formulaBudget.recalculate("activity", insertedActivities)
        }

        await updateCompletedCount(importId, pdActivities.length)
      }

      // -----------------------------------------------------------------------
      // Complete Import
      // -----------------------------------------------------------------------
      await updateImportState(importId, {
        status: 'completed',
        completedAt: new Date(),
        currentEntity: null,
      })

      await writeImportSummary('completed')

      return { success: true }
    } catch (error) {
      // Handle both Error instances and SDK plain-object errors
      // Pipedrive SDK can throw: { success: false, errorCode: 429, error: 'request over limit' }
      let errorMessage = "Import failed"
      if (error instanceof Error) {
        errorMessage = error.message
      } else if (error && typeof error === 'object') {
        const sdkError = error as { error?: string; errorCode?: number; message?: string }
        if (sdkError.error) {
          errorMessage = sdkError.errorCode
            ? `Pipedrive API error ${sdkError.errorCode}: ${sdkError.error}`
            : sdkError.error
        } else if (sdkError.message) {
          errorMessage = sdkError.message
        }
      }
      console.error('[importFromPipedrive] Error:', errorMessage, error)
      await addImportError(importId, 'general', errorMessage)
      await updateImportState(importId, {
        status: 'error',
        completedAt: new Date(),
      })
      // A run that failed at deal 8,000 still moved 7,999 records. The same argument that makes a
      // cancelled run worth recording makes a failed one worth recording, so this is partial
      // success reported honestly, not an error path pretending to be one.
      await writeImportSummary('error')
      return { success: false, error: errorMessage }
    }
  })
}

// ---------------------------------------------------------------------------
// cancelPipedriveImport
// ---------------------------------------------------------------------------

/**
 * Cancel a running import.
 */
export async function cancelPipedriveImport(
  importId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  const state = await getImportState(importId)
  if (!state) {
    return { success: false, error: "Import session not found" }
  }

  await cancelImport(importId)

  return { success: true }
}

// ---------------------------------------------------------------------------
// getImportProgress
// ---------------------------------------------------------------------------

/**
 * Get the current progress of an import.
 */
export async function getImportProgress(
  importId: string
): Promise<{ success: true; state: ImportProgressState | null } | { success: false; error: string }> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  const state = await getImportState(importId)

  return { success: true, state: state ?? null }
}
