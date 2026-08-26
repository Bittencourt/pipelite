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
import { and, eq, ilike, isNull } from "drizzle-orm"
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
  /**
   * CR-02. The per-record authorization column, and the reason this interface gained two fields.
   *
   * Every one of the four tables carries `owner_id text NOT NULL REFERENCES users.id` and a
   * nullable `deleted_at` — verified column by column in `src/db/schema/{deals,people,
   * organizations,activities}.ts`. They are declared here, once, rather than spelled at each
   * query, so a fifth entity added to `mutationMap` cannot reach the mutation layer through an
   * unscoped resolution: `LookupDef` requires both, so omitting either is a compile error.
   */
  ownerColumn: DrizzleColumn
  deletedAtColumn: DrizzleColumn
  fields: Record<string, DrizzleColumn>
}

const lookupDefs: Record<string, LookupDef> = {
  deal: {
    table: deals,
    idColumn: deals.id,
    ownerColumn: deals.ownerId,
    deletedAtColumn: deals.deletedAt,
    fields: { title: deals.title },
  },
  person: {
    table: people,
    idColumn: people.id,
    ownerColumn: people.ownerId,
    deletedAtColumn: people.deletedAt,
    fields: { email: people.email, firstName: people.firstName },
  },
  organization: {
    table: organizations,
    idColumn: organizations.id,
    ownerColumn: organizations.ownerId,
    deletedAtColumn: organizations.deletedAt,
    fields: { name: organizations.name },
  },
  activity: {
    table: activities,
    idColumn: activities.id,
    ownerColumn: activities.ownerId,
    deletedAtColumn: activities.deletedAt,
    fields: { title: activities.title },
  },
}

// ---- Field type coercion ----

type CoercibleFieldType = "number" | "date" | "boolean"

/**
 * Known non-string fields per entity, mirroring the Zod schemas in
 * src/lib/mutations/*.ts. fieldMapping values arrive as strings (editor
 * text inputs / interpolation), so they must be coerced before validation.
 */
const crmFieldTypes: Record<string, Record<string, CoercibleFieldType>> = {
  deal: {
    value: "number", // dealSchema: z.number().min(0).optional().nullable()
    expectedCloseDate: "date", // dealSchema: z.date().optional().nullable()
  },
  person: {},
  organization: {},
  activity: {
    dueDate: "date", // activitySchema: z.date()
  },
}

/**
 * Coerce a single interpolated value to the target field's expected type.
 * Values that cannot be coerced are returned unchanged so Zod validation
 * surfaces a meaningful error.
 */
function coerceValue(value: unknown, type: CoercibleFieldType): unknown {
  if (typeof value !== "string") return value
  const trimmed = value.trim()

  switch (type) {
    case "number": {
      const num = Number(trimmed)
      return Number.isNaN(num) ? value : num
    }
    case "date": {
      const date = new Date(trimmed)
      return Number.isNaN(date.getTime()) ? value : date
    }
    case "boolean": {
      if (/^(true|1|yes)$/i.test(trimmed)) return true
      if (/^(false|0|no)$/i.test(trimmed)) return false
      return value
    }
  }
}

/**
 * Coerce interpolated fieldMapping values to the types the entity's Zod
 * schema expects. String fields pass through untouched. Empty strings for
 * typed (number/date/boolean) fields are omitted so they don't fail
 * validation or clobber existing data.
 */
function coerceFieldMapping(
  entity: string,
  fields: Record<string, unknown>
): Record<string, unknown> {
  const typeMap = crmFieldTypes[entity] ?? {}
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(fields)) {
    const type = typeMap[key]
    if (!type) {
      result[key] = value
      continue
    }
    if (typeof value === "string" && value.trim() === "") {
      continue // omit empty values for typed fields
    }
    result[key] = coerceValue(value, type)
  }

  return result
}

/**
 * =============================================================================
 * CR-02 — THE PER-RECORD AUTHORIZATION BOUNDARY FOR THE WORKFLOW ENGINE
 * =============================================================================
 *
 * WHAT WAS OPEN. `POST /api/v1/workflows` and `PUT /api/v1/workflows/{id}` both declare
 * `nodes: z.array(z.record(z.string(), z.unknown()))`, so a node's `config` is verbatim caller
 * input. `resolveTargetId` took `config.targetId` unvalidated, or ran `ilike(<field>, lookupValue)`
 * with NO owner predicate — `lookupValue: "%"` needs no knowledge of any id. It then called
 * `mutations.update(targetId, fields, userId)` / `mutations.delete(targetId, userId)`, and NONE of
 * the eight mutation helpers behind `mutationMap` compares the record's `owner_id` to the `userId`
 * it was handed: all eight check existence and soft-delete state only. Three ordinary `/api/v1`
 * requests therefore read, updated and soft-deleted any user's deal, person, organization or
 * activity — and the resulting `crmBus` event carried `data` and `previous` as the VICTIM'S FULL
 * ROW, which the webhook subscriber delivers to whatever endpoint the caller registered through
 * `POST /api/v1/webhooks`. Same OWASP API1 class as CR-01, same entity, same authenticated surface.
 *
 * WHY THE GUARD IS HERE AND NOT IN THE MUTATION LAYER, which is what the review suggested.
 *
 * The mutation helpers are SHARED with the session-auth server actions, and the ownership
 * predicate there is ASYMMETRIC — `src/lib/bulk/dispatch.ts:20-34` records this as the
 * load-bearing reason no permission check lives in the dispatch map either. `src/app/deals/
 * actions.ts` refuses on `deal.ownerId !== session.user.id && session.user.role !== "admin"` at six
 * call sites, so an ADMIN legitimately updates and deletes deals they do not own and
 * `updateDealMutation` / `deleteDealMutation` are reached with `userId = <the admin>`. Adding
 * `eq(deals.ownerId, userId)` to those helpers' existence checks would turn a supported admin
 * action into "Deal not found" — a regression, not a fix. Activities, people and organizations
 * carry no such bypass, so a blanket change would ALSO make the four entities disagree in a way no
 * single predicate can express. Re-shaping the mutation contract is Phase 49's subject
 * (SEC-04/DATA-01/DATA-02); it is not a review-fix edit.
 *
 * The engine has no second caller class and no admin concept: `context._workflowUserId` is
 * `workflow.createdBy` (`src/lib/execution/engine.ts:165`, pinned by `engine.test.ts:1076`), which
 * for the `/api/v1` path is exactly the API key's user. So `handleCrmAction`'s target resolution is
 * the boundary that CAN decide per record, and it is the only caller of the mutation layer that
 * needs to.
 *
 * THE TWO HALVES ARE NOT REDUNDANT, and neither is a re-check of the other:
 *
 *   - `resolveIdByLookup` is scoped AT THE QUERY. Filtering afterwards would still let a caller
 *     establish that another owner's record exists (a probe for `title = 'Acme renewal'` that
 *     resolves and then refuses is an existence oracle). Scoped, a foreign match is
 *     indistinguishable from no match.
 *   - `assertCallerOwnsTarget` covers the `config.targetId` branch, where there is no query to
 *     scope: the id arrives from the caller and nothing else looks at it.
 *
 * The lookup branch deliberately does NOT also call `assertCallerOwnsTarget`. It cannot fail there
 * — the query that produced the id already carried the same predicate — and a check that cannot
 * fail is worse than no check.
 *
 * KNOWN RESIDUALS, recorded rather than papered over:
 *
 *   - `fieldMapping` reference keys (`dealId` on an activity, `organizationId`/`personId` on a
 *     deal, `organizationId` on a person) are still validated for EXISTENCE only, by the mutation
 *     helpers. A caller can therefore still attach one of their OWN records to another owner's
 *     record id. That is CR-01's residual, not CR-02's, and it is recorded as DEF-48-05.
 *   - Ownership is read here and acted on by the mutation a moment later, so a concurrent owner
 *     transfer between the two is not serialized. Closing that means moving the predicate into the
 *     mutation's own statement, which is the Phase 49 work above.
 * =============================================================================
 */

/**
 * The caller-scope predicate every target resolution below rides on.
 *
 * `and(...)` returns `SQL | undefined` and `.where(undefined)` is an UNFILTERED query, so this is
 * never spread into a `.where()` on its own — both call sites nest it inside a further `and()` with
 * a non-optional term, which is what makes an accidental collapse a type error rather than a
 * silent full-table read. (Same hazard `src/lib/api/stage-scope.ts` documents at length for
 * `ownedStagesPredicate`; the shape here is different enough not to reuse that helper.)
 */
function callerScope(def: LookupDef, userId: string) {
  return and(eq(def.ownerColumn, userId), isNull(def.deletedAtColumn))
}

/**
 * Resolve entity ID via field lookup, WITHIN the caller's own records.
 * Uses ilike for case-insensitive text matching.
 */
async function resolveIdByLookup(
  entity: string,
  lookupField: string,
  lookupValue: string,
  userId: string
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
    .where(and(ilike(column, lookupValue), callerScope(def, userId)))
    .limit(1)

  if (rows.length === 0) {
    throw new Error(
      `No ${entity} found where ${lookupField} = '${lookupValue}'`
    )
  }

  return rows[0].id
}

/**
 * Refuse a caller-supplied `targetId` that is not one of the caller's own live records.
 *
 * The message is the SAME for "does not exist" and "belongs to somebody else", deliberately: a
 * distinguishable refusal is an existence oracle for another owner's records, which is half of what
 * CR-02 was. It names the id the caller already supplied and nothing from the row.
 */
async function assertCallerOwnsTarget(
  entity: string,
  targetId: string,
  userId: string
): Promise<void> {
  const def = lookupDefs[entity]
  if (!def) {
    throw new Error(`Cannot look up entity type: ${entity}`)
  }

  const rows = await db
    .select({ id: def.idColumn })
    .from(def.table)
    .where(and(eq(def.idColumn, targetId), callerScope(def, userId)))
    .limit(1)

  if (rows.length === 0) {
    throw new Error(`No ${entity} found with id '${targetId}'`)
  }
}

/**
 * Resolve target entity ID from targetId interpolation or field lookup.
 *
 * Both branches return an id that is PROVEN to be one of `userId`'s own live records — see the
 * CR-02 block above for why the two branches prove it differently.
 */
async function resolveTargetId(
  entity: string,
  config: Record<string, unknown>,
  context: ExecutionContext,
  userId: string
): Promise<string> {
  if (config.targetId) {
    const targetId = interpolate(String(config.targetId), context)
    await assertCallerOwnsTarget(entity, targetId, userId)
    return targetId
  }

  if (config.lookupField && config.lookupValue) {
    const lookupValue = interpolate(String(config.lookupValue), context)
    return resolveIdByLookup(entity, String(config.lookupField), lookupValue, userId)
  }

  throw new Error(
    `CRM ${entity} update/delete requires targetId or lookupField+lookupValue`
  )
}

// ---- Dry-run simulation (WFOPS-02) ----

/**
 * Simulated `create` output. Mirrors the real mutation's shape:
 * `{ success, id, <entity> }`, plus `simulated: true`.
 */
function simulateCreate(
  entity: string,
  interpolatedFields: Record<string, unknown>
): Record<string, unknown> {
  const id = `dryrun-${crypto.randomUUID()}`
  return {
    success: true,
    id,
    [entity]: { id, ...interpolatedFields },
    simulated: true,
  }
}

/**
 * Simulated `update` output. `updateDealMutation` returns
 * `{ success, newAssigneeUserIds, dealTitle }`; every other entity's update returns
 * `{ success }`. The simulation reproduces whichever shape applies.
 */
function simulateUpdate(
  entity: string,
  interpolatedFields: Record<string, unknown>
): Record<string, unknown> {
  if (entity === "deal") {
    const title = interpolatedFields.title
    return {
      success: true,
      newAssigneeUserIds: [] as string[],
      dealTitle: title == null ? "" : String(title),
      simulated: true,
    }
  }
  return { success: true, simulated: true }
}

/** Simulated `delete` output. The real mutations return `{ success }`. */
function simulateDelete(): Record<string, unknown> {
  return { success: true, simulated: true }
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
  const interpolatedFields = coerceFieldMapping(
    entity,
    interpolateDeep(fieldMapping, context)
  )

  switch (operation) {
    case "create": {
      // ---- DRY-RUN GATE 1 of 3 (WFOPS-02). Three rules govern all three gates. ----
      //
      // 1. SIMULATE THE SIDE EFFECT, NEVER THE RESOLUTION. The gate sits here, immediately
      //    before the mutation call, and NOT at the top of the handler. Everything above it has
      //    already run for real — the entity/operation validation, the userId check,
      //    interpolateDeep, coerceFieldMapping, and (for update/delete) resolveTargetId's `ilike`
      //    lookup. So a dry run fails for the reasons a real run would fail: a missing target
      //    record, an unknown entity, an absent workflow user. An early return at the top of the
      //    handler is a two-line diff that makes every dry run "pass", including the ones whose
      //    real counterpart would blow up — a decorative dry run is worse than none.
      //
      // 2. THE ENTITY OBJECT CARRIES THE INTERPOLATED FIELDS ON PURPOSE, so a downstream
      //    transform or condition reading a field this node was configured to write gets a value
      //    rather than `undefined`. Note the honest limit: SHAPE fidelity is achievable, VALUE
      //    fidelity is not. A transform reading a field the node never wrote still gets
      //    `undefined`, and `simulated: true` is what makes that diagnosable in json-viewer.tsx.
      //    That limitation is documented HERE and must not become user-facing copy (UI-SPEC
      //    F-41-1).
      //
      // 3. DO NOT "IMPROVE" THIS INTO A ROLLED-BACK TRANSACTION. Skipping the mutation *call* is
      //    also what stops the `crmBus` event, hence instrumentation.ts's workflow-trigger
      //    subscriber, hence any downstream workflow — and hence any `audit_log` row. That empty
      //    changed-records panel is the affirmative proof that a dry run changed nothing. A
      //    rolled-back transaction would emit the event and lose all of it.
      if (context._dryRun) {
        return { output: simulateCreate(entity, interpolatedFields) }
      }

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
      // resolveTargetId runs BEFORE the gate, deliberately: an update aimed at a record that does
      // not exist must still fail the dry run. See rule 1 at gate 1. CR-02 rides on the same
      // placement and gains from it — a dry run aimed at another owner's record now fails the dry
      // run too, so the refusal is discoverable from the workflow editor rather than only on the
      // first real execution.
      const targetId = await resolveTargetId(entity, config, context, userId)

      // ---- DRY-RUN GATE 2 of 3. Rules at gate 1. ----
      if (context._dryRun) {
        return { output: simulateUpdate(entity, interpolatedFields) }
      }

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
      // As with update: the target is resolved — and owner-checked (CR-02) — for real before the
      // gate.
      const targetId = await resolveTargetId(entity, config, context, userId)

      // ---- DRY-RUN GATE 3 of 3. Rules at gate 1. ----
      if (context._dryRun) {
        return { output: simulateDelete() }
      }

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
