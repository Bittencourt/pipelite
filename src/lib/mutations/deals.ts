import { db } from "@/db"
import {
  deals,
  stages,
  organizations,
  people,
  dealAssignees,
  dealStageHistory,
  activities,
  notes,
  auditLog,
} from "@/db/schema"
import type { CustomFieldDefinition, EntityType } from "@/db/schema"
import { eq, and, isNull, isNotNull, desc, sql } from "drizzle-orm"
import { z } from "zod"
import { crmBus } from "@/lib/events"
import type { CrmEventPayload, DealStageChangedPayload } from "@/lib/events"
import { getCurrentActor } from "@/lib/audit/actor-context"
import { getActiveFieldDefinitions } from "@/lib/custom-fields"
import {
  recalculateFormulas,
  stripFormulaKeys,
  ENTITY_NATIVE_ATTRIBUTES,
  CHANGED_FIELDS_CUSTOM_SENTINEL,
  type RecalculateFormulasInput,
} from "@/lib/formula-recalc"

// ---- Zod Schemas ----

export const dealSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title must be 200 characters or less"),
  value: z.number().min(0).optional().nullable(),
  stageId: z.string().min(1, "Stage is required"),
  ownerId: z.string().optional(),
  organizationId: z.string().optional().nullable(),
  personId: z.string().optional().nullable(),
  expectedCloseDate: z.date().optional().nullable(),
  notes: z.string().max(2000, "Notes must be 2000 characters or less").optional().nullable(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  assigneeIds: z.array(z.string()).optional().default([]),
})

export const updateDealSchema = dealSchema.partial()

// ---- Mutation Input Types ----

interface CreateDealInput {
  title: string
  value?: number | null
  stageId: string
  ownerId?: string
  organizationId?: string | null
  personId?: string | null
  expectedCloseDate?: Date | null
  notes?: string | null
  customFields?: Record<string, unknown>
  assigneeIds: string[]
  userId: string
}

// ---- Helpers ----

/**
 * `previous` is the row exactly as it stood BEFORE this write, taken from the unprojected
 * existence-check `findFirst` every mutation below already runs — so it costs no extra query.
 * A subscriber fires after the write has landed and cannot recover a former value for itself;
 * carrying it on the payload is the only way before-values can exist at all.
 *
 * Creates pass nothing: a create has no before-state, and the optional parameter says so.
 * Deletes MUST pass it — `data` is literally `{ id }` there, so `previous` is the sole source
 * of state for the tombstone.
 */
function buildEventPayload(
  entityId: string,
  action: "created" | "updated" | "deleted",
  data: Record<string, unknown>,
  userId: string,
  changedFields: string[] | null = null,
  previous?: Record<string, unknown>
): CrmEventPayload {
  return {
    entity: "deal",
    entityId,
    action,
    data,
    previous,
    changedFields,
    userId,
    timestamp: new Date().toISOString(),
  }
}

/**
 * The native columns a create writes. A create genuinely changes every field, so a formula over
 * any of them must run — but this is still a precise list, not a wildcard, so FORMULA-02/SC-4
 * keeps holding for the update, stage-change and reorder paths.
 */
const DEAL_NATIVE_COLUMNS = Object.values(ENTITY_NATIVE_ATTRIBUTES.deal)

/**
 * Recalculate this deal's formula custom fields and return the blob to emit (D-01/D-17).
 *
 * The caller MUST await this before `crmBus.emit`: the webhook body and the workflow-trigger
 * envelope are emit-time snapshots of the row object, never a re-read, so recalculating after
 * the emit would leave both carrying stale values even though the stored row was correct.
 *
 * Resolves rather than rejects on failure (D-05): a broken admin-authored formula must never
 * block a user's edit. The failure is logged, not swallowed (T-34-17), and the pre-recalc blob
 * is emitted so the payload still describes the row as it stands.
 */
async function recalcCustomFields(
  input: RecalculateFormulasInput,
  fallback: Record<string, unknown>
): Promise<Record<string, unknown>> {
  try {
    const { customFields } = await recalculateFormulas(input)
    // `null` means the recalculation could not describe the entity (nothing in scope and no
    // row supplied), NOT that the entity has no custom fields. Fall back to the blob we wrote.
    return customFields ?? fallback
  } catch (error) {
    console.error("[formula-recalc] deal recalculation failed:", error)
    return fallback
  }
}

/**
 * Compute IDs of truly new assignees (not re-saved existing ones).
 */
export function computeNewAssigneeIds(
  currentIds: string[],
  updatedIds: string[]
): string[] {
  const currentSet = new Set(currentIds)
  return updatedIds.filter((id) => !currentSet.has(id))
}

// ---- Mutations ----

export async function createDealMutation(
  input: CreateDealInput
): Promise<{ success: true; id: string; deal: typeof deals.$inferSelect } | { success: false; error: string }> {
  // Validate input via Zod
  const validated = dealSchema.safeParse({
    title: input.title,
    value: input.value,
    stageId: input.stageId,
    ownerId: input.ownerId,
    organizationId: input.organizationId,
    personId: input.personId,
    expectedCloseDate: input.expectedCloseDate,
    notes: input.notes,
    customFields: input.customFields,
    assigneeIds: input.assigneeIds,
  })

  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message || "Invalid input" }
  }

  // Validate at least one of org/person is set
  if (!validated.data.organizationId && !validated.data.personId) {
    return { success: false, error: "At least one of organization or person is required" }
  }

  try {
    // Validate stage exists and is not deleted
    const stage = await db.query.stages.findFirst({
      where: eq(stages.id, validated.data.stageId),
      with: { pipeline: true },
    })

    if (!stage || stage.pipeline.deletedAt) {
      return { success: false, error: "Stage not found" }
    }

    // Validate organization exists if provided
    if (validated.data.organizationId) {
      const org = await db.query.organizations.findFirst({
        where: and(
          eq(organizations.id, validated.data.organizationId),
          isNull(organizations.deletedAt)
        ),
      })
      if (!org) {
        return { success: false, error: "Organization not found" }
      }
    }

    // Validate person exists if provided
    if (validated.data.personId) {
      const person = await db.query.people.findFirst({
        where: and(
          eq(people.id, validated.data.personId),
          isNull(people.deletedAt)
        ),
      })
      if (!person) {
        return { success: false, error: "Person not found" }
      }
    }

    // Get existing deals in stage to calculate position
    const existingDeals = await db.query.deals.findMany({
      where: and(
        eq(deals.stageId, validated.data.stageId),
        isNull(deals.deletedAt)
      ),
      orderBy: [desc(deals.position)],
    })

    const maxPosition = existingDeals[0]?.position ?? 0
    const position = (parseFloat(String(maxPosition)) + 10000).toString()

    // T-34-04: the server is the sole writer of formula keys, so a client-supplied value for a
    // formula-typed field is dropped before it can reach the JSONB blob. The definitions are
    // handed to the recalculation through `definitionsCache` so they are not read twice.
    const definitionsCache = new Map<EntityType, CustomFieldDefinition[]>()
    let customFieldsToPersist: Record<string, unknown> = {}
    if (validated.data.customFields !== undefined) {
      const definitions = await getActiveFieldDefinitions("deal")
      definitionsCache.set("deal", definitions)
      customFieldsToPersist = stripFormulaKeys(validated.data.customFields, definitions)
    }

    const [deal] = await db.insert(deals).values({
      title: validated.data.title,
      value: validated.data.value !== undefined ? validated.data.value?.toString() : null,
      stageId: validated.data.stageId,
      organizationId: validated.data.organizationId || null,
      personId: validated.data.personId || null,
      ownerId: validated.data.ownerId || input.userId,
      position,
      // custom_fields is never SQL NULL in this database — default to {}.
      customFields: customFieldsToPersist,
    }).returning()

    const newAssigneeIds = validated.data.assigneeIds ?? []
    if (newAssigneeIds.length > 0) {
      await db.insert(dealAssignees).values(
        newAssigneeIds.map(userId => ({ dealId: deal.id, userId }))
      )
    }

    // Recalculate BEFORE the emit (D-17), never after.
    const recalculatedCustomFields = await recalcCustomFields(
      {
        entityType: "deal",
        entityId: deal.id,
        changedFields: [...DEAL_NATIVE_COLUMNS, ...Object.keys(customFieldsToPersist)],
        row: deal as unknown as Record<string, unknown>,
        definitionsCache,
      },
      (deal.customFields ?? {}) as Record<string, unknown>,
    )

    // Emit CRM event
    crmBus.emit("deal.created", buildEventPayload(
      deal.id,
      "created",
      { ...deal, customFields: recalculatedCustomFields } as unknown as Record<string, unknown>,
      input.userId,
    ))

    return { success: true, id: deal.id, deal }
  } catch (error) {
    console.error("Failed to create deal:", error)
    return { success: false, error: "Failed to create deal" }
  }
}

export async function updateDealMutation(
  id: string,
  data: z.infer<typeof updateDealSchema>,
  userId: string,
): Promise<{ success: true; newAssigneeUserIds: string[]; dealTitle: string } | { success: false; error: string }> {
  // Validate input
  const validated = updateDealSchema.safeParse(data)
  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message || "Invalid input" }
  }

  // Check if deal exists
  const deal = await db.query.deals.findFirst({
    where: and(eq(deals.id, id), isNull(deals.deletedAt)),
  })

  if (!deal) {
    return { success: false, error: "Deal not found" }
  }

  // Validate at least one of org/person is set after update
  const newOrgId = validated.data.organizationId !== undefined
    ? validated.data.organizationId
    : deal.organizationId
  const newPersonId = validated.data.personId !== undefined
    ? validated.data.personId
    : deal.personId

  if (!newOrgId && !newPersonId) {
    return { success: false, error: "At least one of organization or person is required" }
  }

  try {
    // Validate organization exists if changing
    if (validated.data.organizationId) {
      const org = await db.query.organizations.findFirst({
        where: and(
          eq(organizations.id, validated.data.organizationId),
          isNull(organizations.deletedAt)
        ),
      })
      if (!org) {
        return { success: false, error: "Organization not found" }
      }
    }

    // Validate person exists if changing
    if (validated.data.personId) {
      const person = await db.query.people.findFirst({
        where: and(
          eq(people.id, validated.data.personId),
          isNull(people.deletedAt)
        ),
      })
      if (!person) {
        return { success: false, error: "Person not found" }
      }
    }

    // Build update object and track changed fields
    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    const changedFields: string[] = []
    // Shared with the recalculation below, so the definition query runs at most once.
    const definitionsCache = new Map<EntityType, CustomFieldDefinition[]>()

    const oldStageId = deal.stageId

    if (validated.data.title !== undefined && validated.data.title !== deal.title) {
      updateData.title = validated.data.title
      changedFields.push("title")
    } else if (validated.data.title !== undefined) {
      updateData.title = validated.data.title
    }

    if (validated.data.value !== undefined) {
      const newVal = validated.data.value?.toString() ?? null
      if (newVal !== deal.value) changedFields.push("value")
      updateData.value = newVal
    }

    if (validated.data.stageId !== undefined) {
      if (validated.data.stageId !== deal.stageId) changedFields.push("stageId")
      updateData.stageId = validated.data.stageId
    }

    if (validated.data.organizationId !== undefined) {
      if ((validated.data.organizationId || null) !== deal.organizationId) changedFields.push("organizationId")
      updateData.organizationId = validated.data.organizationId || null
    }

    if (validated.data.personId !== undefined) {
      if ((validated.data.personId || null) !== deal.personId) changedFields.push("personId")
      updateData.personId = validated.data.personId || null
    }

    if (validated.data.expectedCloseDate !== undefined) {
      updateData.expectedCloseDate = validated.data.expectedCloseDate
      changedFields.push("expectedCloseDate")
    }

    if (validated.data.notes !== undefined) {
      if ((validated.data.notes || null) !== deal.notes) changedFields.push("notes")
      updateData.notes = validated.data.notes || null
    }

    if (validated.data.ownerId !== undefined) {
      if (validated.data.ownerId !== deal.ownerId) changedFields.push("ownerId")
      updateData.ownerId = validated.data.ownerId
    }

    if (validated.data.customFields !== undefined) {
      // T-34-04: drop client-supplied formula keys before they reach the blob.
      const definitions = await getActiveFieldDefinitions("deal")
      definitionsCache.set("deal", definitions)
      // Shallow-merge onto the stored blob so an unrelated edit cannot wipe keys.
      updateData.customFields = {
        ...(deal.customFields ?? {}),
        ...stripFormulaKeys(validated.data.customFields, definitions),
      }
      changedFields.push("customFields")
    }

    const [updatedDeal] = await db
      .update(deals)
      .set(updateData)
      .where(eq(deals.id, id))
      .returning()

    // Handle assignees
    const currentAssignees = await db
      .select({ userId: dealAssignees.userId })
      .from(dealAssignees)
      .where(eq(dealAssignees.dealId, id))
    const currentAssigneeIds = currentAssignees.map((a) => a.userId)

    await db.delete(dealAssignees).where(eq(dealAssignees.dealId, id))
    const updatedAssigneeIds = validated.data.assigneeIds ?? []
    if (updatedAssigneeIds.length > 0) {
      await db.insert(dealAssignees).values(
        updatedAssigneeIds.map(uid => ({ dealId: id, userId: uid }))
      )
    }

    // Recalculate ONCE, before either emit (D-17). FORMULA-02/SC-4: `changedFields` is passed
    // straight through as the recalc scope, so a stage drag scopes to zero evaluations.
    const recalculatedCustomFields = await recalcCustomFields(
      {
        entityType: "deal",
        entityId: id,
        changedFields,
        row: updatedDeal as unknown as Record<string, unknown>,
        definitionsCache,
      },
      (updatedDeal.customFields ?? {}) as Record<string, unknown>,
    )
    const eventData = {
      ...updatedDeal,
      customFields: recalculatedCustomFields,
    } as unknown as Record<string, unknown>
    // The row as it stood before the update above, from the existence-check read at the top of
    // this function. Unprojected, so it is the whole row, and already in memory.
    const previousDeal = deal as unknown as Record<string, unknown>

    // Emit deal.updated event
    crmBus.emit("deal.updated", buildEventPayload(
      id,
      "updated",
      eventData,
      userId,
      changedFields.length > 0 ? changedFields : null,
      previousDeal,
    ))

    // Emit deal.stage_changed if stage changed
    if (validated.data.stageId !== undefined && validated.data.stageId !== oldStageId) {
      const stagePayload: DealStageChangedPayload = {
        ...buildEventPayload(
          id,
          "updated",
          eventData,
          userId,
          changedFields,
          previousDeal,
        ),
        entity: "deal",
        oldStageId,
        newStageId: validated.data.stageId,
      }
      crmBus.emit("deal.stage_changed", stagePayload)
    }

    return {
      success: true as const,
      newAssigneeUserIds: computeNewAssigneeIds(currentAssigneeIds, updatedAssigneeIds),
      dealTitle: deal.title,
    }
  } catch (error) {
    console.error("Failed to update deal:", error)
    return { success: false, error: "Failed to update deal" }
  }
}

export async function deleteDealMutation(
  id: string,
  userId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  // Check if deal exists
  const deal = await db.query.deals.findFirst({
    where: and(eq(deals.id, id), isNull(deals.deletedAt)),
  })

  if (!deal) {
    return { success: false, error: "Deal not found" }
  }

  try {
    // No formula recalculation here: a soft delete is not a save. Children of a deleted parent
    // keeping a stale derived value is a known limitation, recorded in plan 34-11.
    await db
      .update(deals)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(deals.id, id))

    // Emit CRM event. `data` is `{ id }` here, so `previous` is the ONLY state a subscriber can
    // build a tombstone from — omitting it would silently produce an audit row with no detail.
    crmBus.emit("deal.deleted", buildEventPayload(
      id,
      "deleted",
      { id },
      userId,
      null,
      deal as unknown as Record<string, unknown>,
    ))

    return { success: true }
  } catch (error) {
    console.error("Failed to delete deal:", error)
    return { success: false, error: "Failed to delete deal" }
  }
}

/**
 * The recalculation scope a restore must pass (TRASH-02).
 *
 * `scopeFormulasToChangedFields` admits a formula only when one of its refs matches an entry
 * here. `deletedAt` is not a referenceable attribute for ANY entity type, so `[]` or
 * `['deletedAt']` would select nothing and the restore would silently repair nothing — the
 * failure mode is a green test and stale values in production (RESEARCH Pitfall 1).
 *
 * A restore is the one write where over-scoping is correct: the row has been out of the
 * cascade for as long as it sat in the trash, so every formula over it is suspect.
 */
const DEAL_RESTORE_CHANGED_FIELDS = [
  CHANGED_FIELDS_CUSTOM_SENTINEL,
  ...DEAL_NATIVE_COLUMNS,
]

/**
 * Bring a trashed deal back to live state (TRASH-02).
 *
 * The mirror of `deleteDealMutation` above, with three deliberate divergences:
 *
 *   1. The existence predicate INVERTS to `isNotNull(deletedAt)` — a restore targets a row that
 *      IS in the trash, and `isNull` here would happily "restore" a live record.
 *   2. A miss returns the discriminated code `"NOT_IN_TRASH"` rather than prose. The trash UI
 *      switches on it to say "already purged" instead of "try again"; a user told to retry about
 *      a record that no longer exists will retry forever (RESEARCH Pitfall 7).
 *   3. Nothing is emitted on the CRM bus. 37-CONTEXT locks that no `{entity}.restored` event
 *      type is introduced, and re-emitting `deal.created` would be a lie to every webhook and
 *      workflow subscriber. Because there is no event, there is no audit subscriber to write
 *      the row, so this function writes it directly.
 */
export async function restoreDealMutation(
  id: string,
): Promise<{ success: true } | { success: false; error: string }> {
  // READ THE ACTOR SYNCHRONOUSLY, HERE, AT FUNCTION ENTRY, before any promise exists.
  // src/lib/events/subscribers/audit.ts:48-56 documents why: reading it later happens to work
  // under today's ALS continuation semantics, but capturing first is unconditionally correct.
  const actor = getCurrentActor()

  const deal = await db.query.deals.findFirst({
    where: and(eq(deals.id, id), isNotNull(deals.deletedAt)),
  })

  if (!deal) {
    return { success: false, error: "NOT_IN_TRASH" }
  }

  const trashedAt = deal.deletedAt

  try {
    await db
      .update(deals)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(eq(deals.id, id))

    // The delete deliberately skips recalculation (see the comment at `deleteDealMutation`
    // above, and plan 34-11). Restore is the repair point, and it must run AFTER the update:
    // `cascadeToChildren` filters `isNull(relation.deletedAt)`, so this deal's children only
    // re-enter the cascade once the deal itself is live again.
    try {
      await recalculateFormulas({
        entityType: "deal",
        entityId: id,
        changedFields: DEAL_RESTORE_CHANGED_FIELDS,
      })
    } catch (error) {
      // D-05: a broken admin-authored formula must never block a user's write. Reporting
      // "Failed to restore deal" here would be a lie — the row is already live.
      console.error("[formula-recalc] deal restore recalculation failed:", error)
    }
  } catch (error) {
    console.error("Failed to restore deal:", error)
    return { success: false, error: "Failed to restore deal" }
  }

  // Its own try/catch, deliberately outside the one above: the restore has landed and the user
  // can already see it, so a lost audit row is logged rather than turned into a false failure.
  try {
    await db.insert(auditLog).values({
      entityType: "deal",
      entityId: id,
      action: "updated",
      // `deletedAt` is already a recognised field name for the diff presenter, so the timeline
      // renders this with no new code and no fourth `AuditAction` literal.
      changes: { deletedAt: { from: trashedAt, to: null } },
      // NEVER a user id taken from the record. That field describes the deal, not the identity
      // that restored it. Absence of an actor is recorded honestly as `system`.
      actorKind: actor?.kind ?? "system",
      actorUserId: actor?.userId ?? null,
      workflowRunId: actor?.workflowRunId ?? null,
      importSessionId: actor?.importSessionId ?? null,
    })
  } catch (error) {
    console.error("[audit] failed to record deal restore:", error)
  }

  return { success: true }
}

/**
 * Permanently destroy a trashed deal (TRASH-03).
 *
 * This is an ORDERED TEARDOWN inside one transaction, not a `DELETE`. Every foreign key
 * pointing at `deals` is `ON DELETE NO ACTION`, and 54.6% of deals have at least one activity,
 * so a bare delete raises SQLSTATE 23503 for the majority of real records — in the pruner that
 * would kill the tick (T-37-16). Refusing to purge a parent that has children was considered
 * and rejected in 37-CONTEXT § Purge Cascade: it fails SC-4 for most of the data.
 *
 * The children are handled by DISPOSITION, not uniformly:
 *
 *   - `notes` are deleted. Polymorphic with no foreign key, so nothing enforces them and the
 *     rows would dangle forever; 37-CONTEXT locks that a purge takes the record and its notes.
 *   - `deal_assignees` and `deal_stage_history` are deleted. Neither row has any independent
 *     identity — they mean nothing without the deal. Note that stage history is not the audit
 *     log; the audit log is what keeps the evidence, and it is untouched here.
 *   - `activities` are DETACHED, never deleted. An activity is an independent trashable entity
 *     with its own owner and its own trash tab, so destroying one would remove a record the
 *     purging admin never selected. `activities.deal_id` is already nullable, so this needs no
 *     schema change.
 *
 * ORPHAN STATE, STATED PLAINLY: the detach is the one operation in this phase that mutates a
 * LIVE row the caller did not select. The mitigation is the per-child audit row below, so an
 * unlinked activity can be traced back to the deal that was purged out from under it.
 */
export async function purgeDealMutation(
  id: string,
): Promise<{ success: true; detached: number } | { success: false; error: string }> {
  // Read the actor SYNCHRONOUSLY at function entry, before the transaction promise exists
  // (src/lib/events/subscribers/audit.ts:48-56).
  const actor = getCurrentActor()

  const deal = await db.query.deals.findFirst({
    where: and(eq(deals.id, id), isNotNull(deals.deletedAt)),
  })

  if (!deal) {
    return { success: false, error: "NOT_IN_TRASH" }
  }

  const auditActor = {
    actorKind: actor?.kind ?? "system",
    actorUserId: actor?.userId ?? null,
    workflowRunId: actor?.workflowRunId ?? null,
    importSessionId: actor?.importSessionId ?? null,
  } as const

  try {
    let detached = 0

    await db.transaction(async (tx) => {
      // 1. Notes: polymorphic, no foreign key, so this must be explicit.
      await tx
        .delete(notes)
        .where(and(eq(notes.entityType, "deal"), eq(notes.entityId, id)))

      // 2. Pure children with no independent identity.
      await tx.delete(dealAssignees).where(eq(dealAssignees.dealId, id))
      await tx.delete(dealStageHistory).where(eq(dealStageHistory.dealId, id))

      // 3. Independent entities that merely reference this deal — detach, never delete.
      const detachedActivities = await tx
        .update(activities)
        .set({ dealId: null, updatedAt: new Date() })
        .where(eq(activities.dealId, id))
        .returning({ id: activities.id })
      detached = detachedActivities.length

      // 4. One audit row per detached child (T-37-10). `dealId` is already in
      //    AUDIT_FIELD_LABELS, so the activity's timeline renders this with no new code.
      //    Skipped entirely when nothing was detached: `insert([])` is not a no-op.
      if (detachedActivities.length > 0) {
        await tx.insert(auditLog).values(
          detachedActivities.map((activity) => ({
            entityType: "activity" as const,
            entityId: activity.id,
            action: "updated" as const,
            changes: { dealId: { from: id, to: null } },
            ...auditActor,
          }))
        )
      }

      // 5. Now, and only now, the row itself. The `isNotNull` guard rides on the DELETE so a
      //    guessed id for a LIVE deal cannot be purged even if every upstream check were
      //    bypassed (T-37-15).
      await tx.delete(deals).where(and(eq(deals.id, id), isNotNull(deals.deletedAt)))

      // 6. The purge's own audit row, INSIDE the transaction, so a rollback cannot leave a
      //    record of a purge that did not happen (T-37-07).
      //
      //    `action: "deleted"` plus a marker in `changes`, rather than a fourth AuditAction
      //    literal. A fourth literal would cascade across two duplicate type declarations and
      //    two exhaustive `Record<AuditAction, ...>` maps (RESEARCH Pitfall 6), and 37-CONTEXT
      //    grants this discretion explicitly. `buildAuditFieldChanges` returns `[]` for
      //    `action === "deleted"`, so the marker never renders in a timeline — which is fine,
      //    because a purged record's timeline is unreachable, and is a reason to prefer it.
      //
      //    The record's PRE-EXISTING audit rows are untouched: `audit_log.entity_id` has no
      //    foreign key by design (src/db/schema/audit-log.ts:40-45), and that is exactly what
      //    preserves the evidence the purge dialog promises to keep.
      await tx.insert(auditLog).values({
        entityType: "deal",
        entityId: id,
        action: "deleted",
        changes: { __purge: { from: null, to: true } },
        ...auditActor,
      })
    })

    return { success: true, detached }
  } catch (error) {
    console.error("Failed to purge deal:", error)
    return { success: false, error: "Failed to purge deal" }
  }
}

export async function updateDealStageMutation(
  id: string,
  stageId: string,
  userId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  // Check if deal exists
  const deal = await db.query.deals.findFirst({
    where: and(eq(deals.id, id), isNull(deals.deletedAt)),
  })

  if (!deal) {
    return { success: false, error: "Deal not found" }
  }

  try {
    // Validate new stage exists
    const newStage = await db.query.stages.findFirst({
      where: eq(stages.id, stageId),
      with: { pipeline: true },
    })

    if (!newStage || newStage.pipeline.deletedAt) {
      return { success: false, error: "Stage not found" }
    }

    // Get existing deals in new stage to calculate position
    const existingDeals = await db.query.deals.findMany({
      where: and(eq(deals.stageId, stageId), isNull(deals.deletedAt)),
      orderBy: [desc(deals.position)],
    })

    const maxPosition = existingDeals[0]?.position ?? 0
    const position = (parseFloat(String(maxPosition)) + 10000).toString()
    const oldStageId = deal.stageId

    await db
      .update(deals)
      .set({ stageId, position, updatedAt: new Date() })
      .where(eq(deals.id, id))

    // The post-write state, handed to the recalculation so it need not re-read the row.
    const rowAfterUpdate = { ...deal, stageId, position } as unknown as Record<string, unknown>

    // Recalculate once, before either emit (D-17). `stageId` is absent from
    // ENTITY_NATIVE_ATTRIBUTES.deal, so a stage drag scopes to zero evaluations (SC-4); the call
    // is retained so this path stays correct if the native attribute map ever grows.
    const recalculatedCustomFields = await recalcCustomFields(
      {
        entityType: "deal",
        entityId: id,
        changedFields: ["stageId"],
        row: rowAfterUpdate,
        definitionsCache: new Map<EntityType, CustomFieldDefinition[]>(),
      },
      (deal.customFields ?? {}) as Record<string, unknown>,
    )
    const eventData = {
      ...rowAfterUpdate,
      customFields: recalculatedCustomFields,
    } as unknown as Record<string, unknown>
    // `deal` is the pre-write row; `rowAfterUpdate` is that row with the new stage and position
    // spread over it, so `deal` itself is untouched and is the correct before-value.
    const previousDeal = deal as unknown as Record<string, unknown>

    // Emit deal.updated
    crmBus.emit("deal.updated", buildEventPayload(
      id,
      "updated",
      eventData,
      userId,
      ["stageId"],
      previousDeal,
    ))

    // Emit deal.stage_changed
    const stagePayload: DealStageChangedPayload = {
      ...buildEventPayload(
        id,
        "updated",
        eventData,
        userId,
        ["stageId"],
        previousDeal,
      ),
      entity: "deal",
      oldStageId,
      newStageId: stageId,
    }
    crmBus.emit("deal.stage_changed", stagePayload)

    return { success: true }
  } catch (error) {
    console.error("Failed to update deal stage:", error)
    return { success: false, error: "Failed to update deal stage" }
  }
}

export async function reorderDealsMutation(
  dealId: string,
  targetStageId: string,
  targetIndex: number,
  userId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    // Get the deal being moved
    const deal = await db.query.deals.findFirst({
      where: and(eq(deals.id, dealId), isNull(deals.deletedAt)),
    })

    if (!deal) {
      return { success: false, error: "Deal not found" }
    }

    // Validate target stage exists
    const targetStage = await db.query.stages.findFirst({
      where: eq(stages.id, targetStageId),
      with: { pipeline: true },
    })

    if (!targetStage || targetStage.pipeline.deletedAt) {
      return { success: false, error: "Stage not found" }
    }

    // Fetch all deals in target stage, ordered by position
    const allDealsInStage = await db.query.deals.findMany({
      where: and(
        eq(deals.stageId, targetStageId),
        isNull(deals.deletedAt)
      ),
      orderBy: [sql`${deals.position} ASC`],
    })

    // If moving to same stage, filter out the deal being moved
    let targetDeals = allDealsInStage
    if (deal.stageId === targetStageId) {
      targetDeals = allDealsInStage.filter(d => d.id !== dealId)
    }

    const clampedIndex = Math.max(0, Math.min(targetIndex, targetDeals.length))

    let newPosition: string
    if (targetDeals.length === 0) {
      newPosition = "10000"
    } else if (clampedIndex === 0) {
      const firstPos = parseFloat(targetDeals[0].position)
      newPosition = (firstPos / 2).toString()
    } else if (clampedIndex >= targetDeals.length) {
      const lastPos = parseFloat(targetDeals[targetDeals.length - 1].position)
      newPosition = (lastPos + 10000).toString()
    } else {
      const prevPos = parseFloat(targetDeals[clampedIndex - 1].position)
      const nextPos = parseFloat(targetDeals[clampedIndex].position)
      newPosition = ((prevPos + nextPos) / 2).toString()
    }

    await db
      .update(deals)
      .set({ stageId: targetStageId, position: newPosition, updatedAt: new Date() })
      .where(eq(deals.id, dealId))

    // One cache for the whole reorder, so the definition query runs once however many deals this
    // path ends up touching rather than once per row.
    const definitionsCache = new Map<EntityType, CustomFieldDefinition[]>()
    const stageChanged = deal.stageId !== targetStageId
    const rowAfterUpdate = {
      ...deal,
      stageId: targetStageId,
      position: newPosition,
    } as unknown as Record<string, unknown>

    // Neither `position` nor `stageId` appears in ENTITY_NATIVE_ATTRIBUTES.deal, so the helper
    // early-returns with zero evaluations — that is the intended SC-4 behaviour, and the call is
    // retained so the path stays correct if the native attribute map ever grows.
    const recalculatedCustomFields = await recalcCustomFields(
      {
        entityType: "deal",
        entityId: dealId,
        changedFields: stageChanged ? ["position", "stageId"] : ["position"],
        row: rowAfterUpdate,
        definitionsCache,
      },
      (deal.customFields ?? {}) as Record<string, unknown>,
    )

    // Emit CRM events when stage actually changed (not position-only reorder)
    if (stageChanged) {
      const updatedData = {
        ...rowAfterUpdate,
        customFields: recalculatedCustomFields,
      } as unknown as Record<string, unknown>
      // Pre-write row, from the existence check at the top of the try block.
      const previousDeal = deal as unknown as Record<string, unknown>

      crmBus.emit("deal.updated", buildEventPayload(
        dealId,
        "updated",
        updatedData,
        userId,
        ["stageId"],
        previousDeal,
      ))

      const stagePayload: DealStageChangedPayload = {
        ...buildEventPayload(
          dealId,
          "updated",
          updatedData,
          userId,
          ["stageId"],
          previousDeal,
        ),
        entity: "deal",
        oldStageId: deal.stageId,
        newStageId: targetStageId,
      }
      crmBus.emit("deal.stage_changed", stagePayload)
    }

    return { success: true }
  } catch (error) {
    console.error("Failed to reorder deals:", error)
    return { success: false, error: "Failed to reorder deals" }
  }
}
