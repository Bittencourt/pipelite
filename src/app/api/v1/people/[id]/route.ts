import { NextRequest, NextResponse } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { parseExpand } from "@/lib/api/expand"
import { singleResponse, noContentResponse } from "@/lib/api/response"
import { Problems } from "@/lib/api/errors"
import { serializePerson } from "@/lib/api/serialize"
import { db } from "@/db"
import { people } from "@/db/schema/people"
import { organizations } from "@/db/schema/organizations"
import { and, eq, isNull } from "drizzle-orm"
import { z } from "zod"
import { crmBus } from "@/lib/events"
import type { CustomFieldDefinition, EntityType } from "@/db/schema"
import { getActiveFieldDefinitions } from "@/lib/custom-fields"
import {
  recalculateFormulas,
  stripFormulaKeys,
  type RecalculateFormulasInput,
} from "@/lib/formula-recalc"

const updatePersonSchema = z.object({
  first_name: z.string().min(1, "First name is required").max(100).optional(),
  last_name: z.string().min(1, "Last name is required").max(100).optional(),
  email: z.string().email("Invalid email").nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  notes: z.string().nullable().optional(),
  organization_id: z.string().nullable().optional(),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * Drop caller-supplied formula keys before the merge (threat T-34-04). Fails open and logs —
 * see the identical helper in `../route.ts` for the rationale.
 */
async function stripCallerFormulaKeys(
  values: Record<string, unknown>,
  definitionsCache: Map<EntityType, CustomFieldDefinition[]>
): Promise<Record<string, unknown>> {
  try {
    const definitions = await getActiveFieldDefinitions("person")
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
 * Must be awaited before `crmBus.emit`: both the webhook body and the workflow-trigger envelope
 * are emit-time snapshots of the row object, never a re-read. Resolves rather than rejects on
 * failure (D-05), logging with the `[formula-recalc]` prefix (T-34-17).
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

export async function GET(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    const { id } = await params
    const expand = parseExpand(req)

    // Query person with ownership check
    const person = await db.query.people.findFirst({
      where: and(
        eq(people.id, id),
        eq(people.ownerId, context.userId),
        isNull(people.deletedAt)
      ),
      with: {
        ...(expand.has("owner") && {
          owner: {
            columns: {
              id: true,
              name: true,
              email: true,
            },
          },
        }),
        ...(expand.has("organization") && {
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
    })

    if (!person) {
      return Problems.notFound("Person")
    }

    const serialized = serializePerson(person)
    const expanded: Record<string, unknown> = {}
    if (expand.has("owner") && "owner" in person && person.owner) {
      expanded.owner = person.owner
    }
    if (expand.has("organization") && "organization" in person && person.organization) {
      expanded.organization = person.organization
    }

    const data = Object.keys(expanded).length > 0 ? { ...serialized, ...expanded } : serialized

    return singleResponse(data)
  })
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    const { id } = await params

    let body
    try {
      body = await req.json()
    } catch {
      return Problems.validation([
        { field: "body", code: "invalid_json", message: "Invalid JSON body" },
      ])
    }

    // Validate input
    const parseResult = updatePersonSchema.safeParse(body)
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        code: issue.code,
        message: issue.message,
      }))
      return Problems.validation(errors)
    }

    // Check person exists and belongs to user
    const existing = await db.query.people.findFirst({
      where: and(
        eq(people.id, id),
        eq(people.ownerId, context.userId),
        isNull(people.deletedAt)
      ),
    })

    if (!existing) {
      return Problems.notFound("Person")
    }

    const { first_name, last_name, email, phone, notes, organization_id, custom_fields } = parseResult.data

    // Verify organization exists and belongs to user if provided
    if (organization_id !== undefined && organization_id !== null) {
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

    // Build update object and track changed fields
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    }
    const changedFields: string[] = []

    if (first_name !== undefined) {
      updates.firstName = first_name
      if (first_name !== existing.firstName) changedFields.push("firstName")
    }
    if (last_name !== undefined) {
      updates.lastName = last_name
      if (last_name !== existing.lastName) changedFields.push("lastName")
    }
    if (email !== undefined) {
      updates.email = email
      if (email !== existing.email) changedFields.push("email")
    }
    if (phone !== undefined) {
      updates.phone = phone
      if (phone !== existing.phone) changedFields.push("phone")
    }
    if (notes !== undefined) {
      updates.notes = notes
      if (notes !== existing.notes) changedFields.push("notes")
    }
    if (organization_id !== undefined) {
      updates.organizationId = organization_id
      if (organization_id !== existing.organizationId) changedFields.push("organizationId")
    }
    // Strip client-supplied formula keys BEFORE the merge (T-34-04), keeping the definitions so
    // the recalculation below does not read them a second time.
    const definitionsCache = new Map<EntityType, CustomFieldDefinition[]>()
    let persistedCustomFieldKeys: string[] = []
    if (custom_fields !== undefined) {
      const stripped = await stripCallerFormulaKeys(custom_fields, definitionsCache)
      persistedCustomFieldKeys = Object.keys(stripped)
      // Merge with existing custom fields
      updates.customFields = {
        ...((existing.customFields as Record<string, unknown>) || {}),
        ...stripped,
      }
      changedFields.push("customFields")
    }

    // Update person
    const [updated] = await db
      .update(people)
      .set(updates)
      .where(eq(people.id, id))
      .returning()

    // Recalculate AFTER the write and STRICTLY BEFORE the emit (D-01 / D-17).
    const recalculatedCustomFields = await recalcCustomFields(
      {
        entityType: "person",
        entityId: id,
        // The route's own coarse `customFields` sentinel is passed through untouched (the helper
        // accepts it as a safety net), plus the precise key names the caller actually wrote, so
        // FORMULA-02 / SC-4 holds tightly. The EVENT's changedFields below keeps the sentinel
        // alone — webhook consumers may depend on that exact array.
        changedFields: [...changedFields, ...persistedCustomFieldKeys],
        row: updated as unknown as Record<string, unknown>,
        definitionsCache,
      },
      (updated.customFields ?? {}) as Record<string, unknown>
    )

    const recalculatedPerson = { ...updated, customFields: recalculatedCustomFields }

    // Emit CRM event via bus, from the POST-recalc row.
    crmBus.emit("person.updated", {
      entity: "person",
      entityId: updated.id,
      action: "updated",
      data: serializePerson(recalculatedPerson) as unknown as Record<string, unknown>,
      changedFields: changedFields.length > 0 ? changedFields : null,
      userId: context.userId,
      timestamp: new Date().toISOString(),
    })

    // The response carries the post-recalc value too, so a caller doing PUT then GET does not
    // see two different values for the same field (matches PUT /api/v1/activities/[id]).
    return singleResponse(serializePerson(recalculatedPerson))
  })
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    const { id } = await params

    // Check person exists and belongs to user
    const existing = await db.query.people.findFirst({
      where: and(
        eq(people.id, id),
        eq(people.ownerId, context.userId),
        isNull(people.deletedAt)
      ),
    })

    if (!existing) {
      return Problems.notFound("Person")
    }

    // Soft delete
    await db
      .update(people)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(people.id, id))

    // Emit CRM event via bus
    crmBus.emit("person.deleted", {
      entity: "person",
      entityId: id,
      action: "deleted",
      data: { id },
      changedFields: null,
      userId: context.userId,
      timestamp: new Date().toISOString(),
    })

    return noContentResponse()
  })
}
