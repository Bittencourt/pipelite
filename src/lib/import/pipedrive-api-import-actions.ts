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
} from "@/db/schema"
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
import type { FieldType, EntityType } from "@/db/schema/custom-fields"

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

// Helper to update completed entities count
function updateCompletedCount(importId: string, additionalCount: number): void {
  const currentState = getImportState(importId)
  if (currentState) {
    updateImportState(importId, {
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

  // Create state in server memory where this action runs
  // (Previously created in client, but client/server have separate memory)
  const state = createImportState(importId)

  updateImportState(importId, { status: 'running' })
  const client = createPipedriveClient(apiKey)
  const importingUserId = session.user.id
  const now = new Date()

  // Helper to check cancellation
  const checkCancelled = () => {
    if (isImportCancelled(importId)) {
      updateImportState(importId, { status: 'cancelled', completedAt: new Date() })
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

    updateImportState(importId, { totalEntities })

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
      if (checkCancelled()) return { success: false, error: "Import cancelled" }

      updateImportState(importId, { currentEntity: 'pipelines' })

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
          incrementImportedCount(importId, 'pipelines')
        }
      }

      updateCompletedCount(importId, pdPipelines.length)
    }

    // -----------------------------------------------------------------------
    // 2. Import Stages
    // -----------------------------------------------------------------------
    if (config.entities.pipelines) {
      if (checkCancelled()) return { success: false, error: "Import cancelled" }

      updateImportState(importId, { currentEntity: 'stages' })

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
          incrementImportedCount(importId, 'stages')
        }
      }

      updateCompletedCount(importId, pdStages.length)
    }

    // -----------------------------------------------------------------------
    // 3. Import Custom Field Definitions
    // -----------------------------------------------------------------------
    if (config.entities.customFields) {
      if (checkCancelled()) return { success: false, error: "Import cancelled" }

      updateImportState(importId, { currentEntity: 'customFields' })

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
              incrementImportedCount(importId, 'customFields')
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

      updateCompletedCount(
        importId,
        pdDealFields.length + pdPersonFields.length + pdOrgFields.length + pdActivityFields.length
      )
    }

    // -----------------------------------------------------------------------
    // 4. Import Organizations
    // -----------------------------------------------------------------------
    if (config.entities.organizations) {
      if (checkCancelled()) return { success: false, error: "Import cancelled" }

      updateImportState(importId, { currentEntity: 'organizations' })

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
      if (newOrgs.length > 0) {
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
              customFields: orgData.customFields,
              createdAt: now,
              updatedAt: now,
            })
            .returning()

          orgIdMap.set(orgData.pdId, inserted.id)
          incrementImportedCount(importId, 'organizations')
        }
      }

      updateCompletedCount(importId, pdOrgs.length)
    }

    // -----------------------------------------------------------------------
    // 5. Import People
    // -----------------------------------------------------------------------
    if (config.entities.people) {
      if (checkCancelled()) return { success: false, error: "Import cancelled" }

      updateImportState(importId, { currentEntity: 'people' })

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
      if (newPeople.length > 0) {
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
              customFields: personData.customFields,
              createdAt: now,
              updatedAt: now,
            })
            .returning()

          personIdMap.set(personData.pdId, inserted.id)
          incrementImportedCount(importId, 'people')
        }
      }

      updateCompletedCount(importId, pdPeople.length)
    }

    // -----------------------------------------------------------------------
    // 6. Import Deals
    // -----------------------------------------------------------------------
    if (config.entities.deals) {
      if (checkCancelled()) return { success: false, error: "Import cancelled" }

      updateImportState(importId, { currentEntity: 'deals' })

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
            addReviewItem(importId, 'organization', stubOrg.id, `Stub created for deal "${pdDeal.title}"`)
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
            addReviewItem(importId, 'person', stubPerson.id, `Stub created for deal "${pdDeal.title}"`)
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
      if (newDeals.length > 0) {
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
              customFields: dealData.customFields,
              createdAt: now,
              updatedAt: now,
            })
            .returning()

          dealIdMap.set(dealData.pdId, inserted.id)
          incrementImportedCount(importId, 'deals')
        }
      }

      updateCompletedCount(importId, pdDeals.length)
    }

    // -----------------------------------------------------------------------
    // 7. Import Activities
    // -----------------------------------------------------------------------
    if (config.entities.activities) {
      if (checkCancelled()) return { success: false, error: "Import cancelled" }

      updateImportState(importId, { currentEntity: 'activities' })

      const activitiesData = await client.fetchActivities()
      const pdActivities = activitiesData as PipedriveActivity[]

      // Load activity types
      const types = await db.query.activityTypes.findMany()
      const typeMap = new Map(types.map((t) => [t.name.toLowerCase(), t.id]))
      const defaultTypeId = types.find((t) => t.name.toLowerCase() === 'task')?.id || types[0]?.id

      if (!defaultTypeId) {
        addImportError(importId, 'activities', 'No activity types found')
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
        if (newActivities.length > 0) {
          for (const activityData of newActivities) {
            await db.insert(activities).values({
              title: activityData.title,
              typeId: activityData.typeId,
              dealId: activityData.dealId,
              ownerId: activityData.ownerId,
              dueDate: activityData.dueDate,
              completedAt: activityData.completedAt,
              notes: activityData.notes,
              customFields: activityData.customFields,
              createdAt: now,
              updatedAt: now,
            })
            incrementImportedCount(importId, 'activities')
          }
        }
      }

      updateCompletedCount(importId, pdActivities.length)
    }

    // -----------------------------------------------------------------------
    // Complete Import
    // -----------------------------------------------------------------------
    updateImportState(importId, {
      status: 'completed',
      completedAt: new Date(),
      currentEntity: null,
    })

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
    addImportError(importId, 'general', errorMessage)
    updateImportState(importId, {
      status: 'error',
      completedAt: new Date(),
    })
    return { success: false, error: errorMessage }
  }
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

  const state = getImportState(importId)
  if (!state) {
    return { success: false, error: "Import session not found" }
  }

  cancelImport(importId)

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

  const state = getImportState(importId)

  return { success: true, state: state ?? null }
}
