import {
  createDealMutation,
  updateDealMutation,
  deleteDealMutation,
  createPersonMutation,
  updatePersonMutation,
  deletePersonMutation,
  createOrganizationMutation,
  updateOrganizationMutation,
  deleteOrganizationMutation,
  createActivityMutation,
  updateActivityMutation,
  deleteActivityMutation,
} from "@/lib/mutations"
import { db } from "@/db"
import { deals, people, organizations, activities } from "@/db/schema"
import { ilike } from "drizzle-orm"
import { interpolate, interpolateDeep } from "./interpolate"
import {
  getCurrentExecutionDepth,
  runWithExecutionDepth,
} from "../recursion"
import { registerAction } from "./registry"
import type { ExecutionContext } from "../types"

// ---- Mutation dispatch map ----

type CreateFn = (input: Record<string, unknown>) => Promise<{ success: boolean; id?: string; error?: string; [key: string]: unknown }>
type UpdateFn = (id: string, data: Record<string, unknown>, userId: string) => Promise<{ success: boolean; error?: string; [key: string]: unknown }>
type DeleteFn = (id: string, userId: string) => Promise<{ success: boolean; error?: string }>

const mutationMap: Record<
  string,
  { create: CreateFn; update: UpdateFn; delete: DeleteFn }
> = {
  deal: {
    create: createDealMutation as unknown as CreateFn,
    update: updateDealMutation as unknown as UpdateFn,
    delete: deleteDealMutation as unknown as DeleteFn,
  },
  person: {
    create: createPersonMutation as unknown as CreateFn,
    update: updatePersonMutation as unknown as UpdateFn,
    delete: deletePersonMutation as unknown as DeleteFn,
  },
  organization: {
    create: createOrganizationMutation as unknown as CreateFn,
    update: updateOrganizationMutation as unknown as UpdateFn,
    delete: deleteOrganizationMutation as unknown as DeleteFn,
  },
  activity: {
    create: createActivityMutation as unknown as CreateFn,
    update: updateActivityMutation as unknown as UpdateFn,
    delete: deleteActivityMutation as unknown as DeleteFn,
  },
}

// ---- Field lookup tables ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DrizzleTable = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DrizzleColumn = any

interface LookupDef {
  table: DrizzleTable
  idColumn: DrizzleColumn
  fields: Record<string, DrizzleColumn>
}

const lookupDefs: Record<string, LookupDef> = {
  deal: {
    table: deals,
    idColumn: deals.id,
    fields: { title: deals.title },
  },
  person: {
    table: people,
    idColumn: people.id,
    fields: { email: people.email, firstName: people.firstName },
  },
  organization: {
    table: organizations,
    idColumn: organizations.id,
    fields: { name: organizations.name },
  },
  activity: {
    table: activities,
    idColumn: activities.id,
    fields: { title: activities.title },
  },
}

/**
 * Resolve entity ID via field lookup.
 * Uses ilike for case-insensitive text matching.
 */
async function resolveIdByLookup(
  entity: string,
  lookupField: string,
  lookupValue: string
): Promise<string> {
  const def = lookupDefs[entity]
  if (!def) {
    throw new Error(`Cannot look up entity type: ${entity}`)
  }

  const column = def.fields[lookupField]
  if (!column) {
    throw new Error(
      `Unsupported lookup field '${lookupField}' for entity '${entity}'. Supported: ${Object.keys(def.fields).join(", ")}`
    )
  }

  const rows = await db
    .select({ id: def.idColumn })
    .from(def.table)
    .where(ilike(column, lookupValue))
    .limit(1)

  if (rows.length === 0) {
    throw new Error(
      `No ${entity} found where ${lookupField} = '${lookupValue}'`
    )
  }

  return rows[0].id
}

/**
 * Resolve target entity ID from targetId interpolation or field lookup.
 */
async function resolveTargetId(
  entity: string,
  config: Record<string, unknown>,
  context: ExecutionContext
): Promise<string> {
  if (config.targetId) {
    return interpolate(String(config.targetId), context)
  }

  if (config.lookupField && config.lookupValue) {
    const lookupValue = interpolate(String(config.lookupValue), context)
    return resolveIdByLookup(entity, String(config.lookupField), lookupValue)
  }

  throw new Error(
    `CRM ${entity} update/delete requires targetId or lookupField+lookupValue`
  )
}

// ---- Handler ----

async function handleCrmAction(
  config: Record<string, unknown>,
  context: ExecutionContext,
  _runId: string
): Promise<{ output: Record<string, unknown> }> {
  const entity = config.entity as string
  const operation = config.operation as string
  const fieldMapping = (config.fieldMapping as Record<string, unknown>) ?? {}

  const mutations = mutationMap[entity]
  if (!mutations) {
    throw new Error(`Unknown CRM entity type: ${entity}`)
  }

  if (!mutations[operation as keyof typeof mutations]) {
    throw new Error(`Unknown CRM operation: ${operation}`)
  }

  const userId = context._workflowUserId
  if (!userId) {
    throw new Error("No userId in execution context")
  }

  const depth = getCurrentExecutionDepth()
  const interpolatedFields = interpolateDeep(fieldMapping, context)

  switch (operation) {
    case "create": {
      const result = await runWithExecutionDepth(depth + 1, () =>
        mutations.create({ ...interpolatedFields, userId })
      )
      const res = await result
      if (!res.success) {
        throw new Error(res.error ?? "CRM create failed")
      }
      return { output: res as unknown as Record<string, unknown> }
    }

    case "update": {
      const targetId = await resolveTargetId(entity, config, context)
      const result = await runWithExecutionDepth(depth + 1, () =>
        mutations.update(targetId, interpolatedFields, userId)
      )
      const res = await result
      if (!res.success) {
        throw new Error(res.error ?? "CRM update failed")
      }
      return { output: res as unknown as Record<string, unknown> }
    }

    case "delete": {
      const targetId = await resolveTargetId(entity, config, context)
      const result = await runWithExecutionDepth(depth + 1, () =>
        mutations.delete(targetId, userId)
      )
      const res = await result
      if (!res.success) {
        throw new Error(res.error ?? "CRM delete failed")
      }
      return { output: res as unknown as Record<string, unknown> }
    }

    default:
      throw new Error(`Unknown CRM operation: ${operation}`)
  }
}

registerAction("crm_action", handleCrmAction)
