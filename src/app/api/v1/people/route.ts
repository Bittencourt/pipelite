import { NextRequest, NextResponse } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { parsePagination } from "@/lib/api/pagination"
import { parseExpand } from "@/lib/api/expand"
import { paginatedResponse, createdResponse } from "@/lib/api/response"
import { Problems } from "@/lib/api/errors"
import { serializePerson } from "@/lib/api/serialize"
import { db } from "@/db"
import { people } from "@/db/schema/people"
import { organizations } from "@/db/schema/organizations"
import { and, eq, isNull, count } from "drizzle-orm"
import { z } from "zod"
import { crmBus } from "@/lib/events"
import type { CustomFieldDefinition, EntityType } from "@/db/schema"
import { getActiveFieldDefinitions } from "@/lib/custom-fields"
import {
  recalculateFormulas,
  stripFormulaKeys,
  ENTITY_NATIVE_ATTRIBUTES,
  type RecalculateFormulasInput,
} from "@/lib/formula-recalc"

const createPersonSchema = z.object({
  first_name: z.string().min(1, "First name is required").max(100),
  last_name: z.string().min(1, "Last name is required").max(100),
  email: z.string().email("Invalid email").optional(),
  phone: z.string().max(50).optional(),
  notes: z.string().optional(),
  organization_id: z.string().optional(),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
})

/**
 * The native columns a create writes. A create genuinely changes every native attribute, so a
 * formula over `{{FirstName}}` or `{{Email}}` must run even when the request carries no custom
 * fields at all. Still a precise list rather than a wildcard, so FORMULA-02/SC-4 keeps holding —
 * note `organizationId` is deliberately absent, because no formula can reference it.
 */
const PERSON_NATIVE_COLUMNS = Object.values(ENTITY_NATIVE_ATTRIBUTES.person)

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
    const definitions = await getActiveFieldDefinitions("person")
    // Hand the definitions to the recalculation so one create issues ONE definitions query.
    definitionsCache.set("person", definitions)
    return stripFormulaKeys(values, definitions)
  } catch (error) {
    console.error(
      "[formula-recalc] person definition load failed, custom fields not stripped:",
      error
    )
    return values
  }
}

/**
 * Recalculate this person's formula fields and return the blob to emit (D-01/D-17).
 *
 * The caller MUST await this before `crmBus.emit`: the webhook body and the workflow-trigger
 * envelope are emit-time snapshots of the row object, never a re-read, so recalculating after
 * the emit leaves both carrying stale values even though the stored row is correct.
 *
 * Resolves rather than rejects on failure (D-05), logging with the `[formula-recalc]` prefix so
 * the failure stays visible rather than swallowed (T-34-17).
 */
async function recalcCustomFields(
  input: RecalculateFormulasInput,
  fallback: Record<string, unknown>
): Promise<Record<string, unknown>> {
  try {
    const { customFields } = await recalculateFormulas(input)
    return customFields
  } catch (error) {
    console.error("[formula-recalc] person recalculation failed:", error)
    return fallback
  }
}

export async function GET(request: NextRequest) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    const { offset, limit } = parsePagination(req)
    const expand = parseExpand(req)

    // Build query with ownership filter
    const whereClause = and(
      eq(people.ownerId, context.userId),
      isNull(people.deletedAt)
    )

    // Get total count
    const [{ total }] = await db
      .select({ total: count() })
      .from(people)
      .where(whereClause)

    // Determine which relations to expand
    const expandOwner = expand.has("owner")
    const expandOrganization = expand.has("organization")

    // Get paginated results with optional expand
    const results = await db.query.people.findMany({
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
      },
      orderBy: (p, { desc }) => [desc(p.createdAt)],
    })

    // Serialize results
    const data = results.map((person) => {
      const serialized = serializePerson(person)
      const expanded: Record<string, unknown> = {}
      if (expandOwner && "owner" in person && person.owner) {
        expanded.owner = person.owner
      }
      if (expandOrganization && "organization" in person && person.organization) {
        expanded.organization = person.organization
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
    const parseResult = createPersonSchema.safeParse(body)
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        code: issue.code,
        message: issue.message,
      }))
      return Problems.validation(errors)
    }

    const { first_name, last_name, email, phone, notes, organization_id, custom_fields } = parseResult.data

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

    // Strip client-supplied formula keys BEFORE the write (T-34-04), keeping the definitions so
    // the recalculation below does not read them a second time.
    const definitionsCache = new Map<EntityType, CustomFieldDefinition[]>()
    const customFieldsToPersist =
      custom_fields !== undefined
        ? await stripCallerFormulaKeys(custom_fields, definitionsCache)
        : {}

    // Insert person
    const [person] = await db
      .insert(people)
      .values({
        firstName: first_name,
        lastName: last_name,
        email,
        phone,
        notes,
        organizationId: organization_id || null,
        ownerId: context.userId,
        customFields: customFieldsToPersist,
      })
      .returning()

    // Recalculate AFTER the write and STRICTLY BEFORE the emit (D-01 / D-17).
    const recalculatedCustomFields = await recalcCustomFields(
      {
        entityType: "person",
        entityId: person.id,
        // The precise scope (FORMULA-02 / SC-4): every native column a create writes, plus the
        // custom-field key names actually persisted. A key the server just stripped was never
        // written, so listing it as changed would be a lie the scoping would act on.
        changedFields: [...PERSON_NATIVE_COLUMNS, ...Object.keys(customFieldsToPersist)],
        row: person as unknown as Record<string, unknown>,
        definitionsCache,
      },
      (person.customFields ?? {}) as Record<string, unknown>
    )

    // Emit CRM event via bus, from the POST-recalc blob.
    // This route emits `serializePerson(...)` — snake_case `custom_fields` — while the mutation
    // layer emits the raw camelCase row. Both spellings are normalised by the trigger envelope;
    // do NOT harmonise the casing here, it would break existing webhook consumers (T-34-23).
    crmBus.emit("person.created", {
      entity: "person",
      entityId: person.id,
      action: "created",
      data: serializePerson({
        ...person,
        customFields: recalculatedCustomFields,
      }) as unknown as Record<string, unknown>,
      changedFields: null,
      userId: context.userId,
      timestamp: new Date().toISOString(),
    })

    // The 201 body deliberately carries the PRE-recalc row: the stored value, the emitted event
    // and any subsequent GET are all correct (SC-1), and changing a create response is backlog
    // 999.23, which is being decided once for all four entities rather than per route.
    return createdResponse(serializePerson(person))
  })
}
