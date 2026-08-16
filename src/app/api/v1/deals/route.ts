import { NextRequest, NextResponse } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { parsePagination } from "@/lib/api/pagination"
import { parseExpand } from "@/lib/api/expand"
import { paginatedResponse, createdResponse } from "@/lib/api/response"
import { Problems } from "@/lib/api/errors"
import { serializeDeal } from "@/lib/api/serialize"
import { db } from "@/db"
import { deals } from "@/db/schema/deals"
import { organizations } from "@/db/schema/organizations"
import { people } from "@/db/schema/people"
import { stages, pipelines } from "@/db/schema/pipelines"
import { and, eq, isNull, count, max, sql } from "drizzle-orm"
import { z } from "zod"
import { crmBus } from "@/lib/events"
import type { CrmEventPayload } from "@/lib/events"
import type { CustomFieldDefinition, EntityType } from "@/db/schema"
import { getActiveFieldDefinitions } from "@/lib/custom-fields"
import {
  recalculateFormulas,
  stripFormulaKeys,
  ENTITY_NATIVE_ATTRIBUTES,
  type RecalculateFormulasInput,
} from "@/lib/formula-recalc"

const createDealSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  value: z.number().min(0).optional(),
  stage_id: z.string().min(1, "Stage ID is required"),
  organization_id: z.string().optional(),
  person_id: z.string().optional(),
  expected_close_date: z.string().datetime().optional(),
  notes: z.string().optional(),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
})

/**
 * The native columns a create writes. A create genuinely changes every native attribute, so a
 * formula over `{{Value}}` or `{{Title}}` must run even when the request carries no custom
 * fields at all. Still a precise list rather than a wildcard, so FORMULA-02/SC-4 keeps holding.
 */
const DEAL_NATIVE_COLUMNS = Object.values(ENTITY_NATIVE_ATTRIBUTES.deal)

/**
 * Drop caller-supplied formula keys before they reach the JSONB blob (threat T-34-04).
 *
 * The server is the sole writer of formula values; without this an API key could set any value
 * on a server-derived field and steer a workflow condition that branches on it (T-34-15).
 *
 * Fails OPEN, matching plan 34-07: if the definitions read itself throws, the caller's blob is
 * persisted unstripped and logged, rather than turning a transient DB blip into a 500 on a route
 * that has no such failure mode today. The recalculation that immediately follows overwrites
 * every in-scope formula key anyway, so the exposure is narrow.
 */
async function stripCallerFormulaKeys(
  values: Record<string, unknown>,
  definitionsCache: Map<EntityType, CustomFieldDefinition[]>
): Promise<Record<string, unknown>> {
  try {
    const definitions = await getActiveFieldDefinitions("deal")
    // Hand the definitions to the recalculation so one create issues ONE definitions query.
    definitionsCache.set("deal", definitions)
    return stripFormulaKeys(values, definitions)
  } catch (error) {
    console.error("[formula-recalc] deal definition load failed, custom fields not stripped:", error)
    return values
  }
}

/**
 * Recalculate this deal's formula fields and return the blob to emit (D-01/D-17).
 *
 * The caller MUST await this before `crmBus.emit`: the webhook body and the workflow-trigger
 * envelope are emit-time snapshots of the row object, never a re-read, so recalculating after
 * the emit leaves both carrying stale values even though the stored row is correct.
 *
 * Resolves rather than rejects on failure (D-05): a broken admin-authored formula must never
 * block a write. The failure is logged, not swallowed (T-34-17).
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

export async function GET(request: NextRequest) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    const { offset, limit } = parsePagination(req)
    const expand = parseExpand(req)
    const { searchParams } = req.nextUrl

    // Parse filter params
    const stageId = searchParams.get("stage_id")
    const organizationId = searchParams.get("organization_id")
    const ownerId = searchParams.get("owner_id")

    // Build where conditions
    const conditions = [
      eq(deals.ownerId, context.userId),
      isNull(deals.deletedAt),
    ]

    if (stageId) {
      conditions.push(eq(deals.stageId, stageId))
    }
    if (organizationId) {
      conditions.push(eq(deals.organizationId, organizationId))
    }
    if (ownerId) {
      conditions.push(eq(deals.ownerId, ownerId))
    }

    const whereClause = and(...conditions)

    // Get total count
    const [{ total }] = await db
      .select({ total: count() })
      .from(deals)
      .where(whereClause)

    // Determine which relations to expand
    const expandOwner = expand.has("owner")
    const expandOrganization = expand.has("organization")
    const expandPerson = expand.has("person")
    const expandStage = expand.has("stage")

    // Get paginated results with optional expand
    const results = await db.query.deals.findMany({
      where: whereClause,
      offset,
      limit,
      with: {
        ...(expandOwner && {
          owner: {
            columns: {
              id: true,
              name: true,
              email: true,
            },
          },
        }),
        ...(expandOrganization && {
          organization: {
            columns: {
              id: true,
              name: true,
              website: true,
              industry: true,
            },
          },
        }),
        ...(expandPerson && {
          person: {
            columns: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        }),
        ...(expandStage && {
          stage: {
            columns: {
              id: true,
              name: true,
              color: true,
              type: true,
              position: true,
            },
          },
        }),
      },
      orderBy: (d, { asc }) => [asc(d.position)],
    })

    // Serialize results
    const data = results.map((deal) => {
      const serialized = serializeDeal(deal)
      const expanded: Record<string, unknown> = {}
      if (expandOwner && "owner" in deal && deal.owner) {
        expanded.owner = deal.owner
      }
      if (expandOrganization && "organization" in deal && deal.organization) {
        expanded.organization = deal.organization
      }
      if (expandPerson && "person" in deal && deal.person) {
        expanded.person = deal.person
      }
      if (expandStage && "stage" in deal && deal.stage) {
        expanded.stage = deal.stage
      }
      return Object.keys(expanded).length > 0 ? { ...serialized, ...expanded } : serialized
    })

    return paginatedResponse(data, total, offset, limit)
  })
}

export async function POST(request: NextRequest) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    let body
    try {
      body = await req.json()
    } catch {
      return Problems.validation([
        { field: "body", code: "invalid_json", message: "Invalid JSON body" },
      ])
    }

    // Validate input
    const parseResult = createDealSchema.safeParse(body)
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        code: issue.code,
        message: issue.message,
      }))
      return Problems.validation(errors)
    }

    const { title, value, stage_id, organization_id, person_id, expected_close_date, notes, custom_fields } = parseResult.data

    // Verify stage exists and pipeline belongs to user
    const stage = await db.query.stages.findFirst({
      where: eq(stages.id, stage_id),
      with: {
        pipeline: {
          columns: { id: true, ownerId: true },
        },
      },
    })

    if (!stage || stage.pipeline.ownerId !== context.userId) {
      return Problems.validation([
        { field: "stage_id", code: "invalid_reference", message: "Stage not found or does not belong to user" },
      ])
    }

    // Verify organization exists and belongs to user if provided
    if (organization_id) {
      const org = await db.query.organizations.findFirst({
        where: and(
          eq(organizations.id, organization_id),
          eq(organizations.ownerId, context.userId),
          isNull(organizations.deletedAt)
        ),
      })

      if (!org) {
        return Problems.validation([
          { field: "organization_id", code: "invalid_reference", message: "Organization not found" },
        ])
      }
    }

    // Verify person exists and belongs to user if provided
    if (person_id) {
      const person = await db.query.people.findFirst({
        where: and(
          eq(people.id, person_id),
          eq(people.ownerId, context.userId),
          isNull(people.deletedAt)
        ),
      })

      if (!person) {
        return Problems.validation([
          { field: "person_id", code: "invalid_reference", message: "Person not found" },
        ])
      }
    }

    // Get max position for auto-positioning
    const [maxResult] = await db
      .select({ maxPosition: max(deals.position) })
      .from(deals)
      .where(and(eq(deals.stageId, stage_id), isNull(deals.deletedAt)))

    const nextPosition = maxResult.maxPosition
      ? parseFloat(maxResult.maxPosition) + 10000
      : 10000

    // Strip client-supplied formula keys BEFORE the write (T-34-04), keeping the definitions so
    // the recalculation below does not read them a second time.
    const definitionsCache = new Map<EntityType, CustomFieldDefinition[]>()
    const customFieldsToPersist =
      custom_fields !== undefined
        ? await stripCallerFormulaKeys(custom_fields, definitionsCache)
        : {}

    // Insert deal
    const [deal] = await db
      .insert(deals)
      .values({
        title,
        value: value ? String(value) : null,
        stageId: stage_id,
        organizationId: organization_id || null,
        personId: person_id || null,
        ownerId: context.userId,
        position: String(nextPosition),
        expectedCloseDate: expected_close_date ? new Date(expected_close_date) : null,
        notes,
        customFields: customFieldsToPersist,
      })
      .returning()

    // Recalculate AFTER the write and STRICTLY BEFORE the emit (D-01 / D-17).
    const recalculatedCustomFields = await recalcCustomFields(
      {
        entityType: "deal",
        entityId: deal.id,
        // The precise scope (FORMULA-02 / SC-4): every native column a create writes, plus the
        // custom-field key names actually persisted. A key the server just stripped was never
        // written, so listing it as changed would be a lie the scoping would act on.
        changedFields: [...DEAL_NATIVE_COLUMNS, ...Object.keys(customFieldsToPersist)],
        row: deal as unknown as Record<string, unknown>,
        definitionsCache,
      },
      (deal.customFields ?? {}) as Record<string, unknown>
    )

    // Emit CRM event via bus, from the POST-recalc blob.
    // This route emits `serializeDeal(...)` — snake_case `custom_fields` — while the mutation
    // layer emits the raw camelCase row. Both spellings are normalised by the trigger envelope;
    // do NOT harmonise the casing here, it would break existing webhook consumers (T-34-23).
    crmBus.emit("deal.created", {
      entity: "deal",
      entityId: deal.id,
      action: "created",
      data: serializeDeal({
        ...deal,
        customFields: recalculatedCustomFields,
      }) as unknown as Record<string, unknown>,
      changedFields: null,
      userId: context.userId,
      timestamp: new Date().toISOString(),
    })

    // The 201 body deliberately carries the PRE-recalc row: the stored value, the emitted event
    // and any subsequent GET are all correct (SC-1), and changing a create response is backlog
    // 999.23, which is being decided once for all four entities rather than per route.
    return createdResponse(serializeDeal(deal))
  })
}
