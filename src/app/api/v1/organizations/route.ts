import { NextRequest, NextResponse } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { parsePagination } from "@/lib/api/pagination"
import { parseExpand } from "@/lib/api/expand"
import { paginatedResponse, createdResponse } from "@/lib/api/response"
import { Problems } from "@/lib/api/errors"
import { serializeOrganization } from "@/lib/api/serialize"
import { createOrganizationMutation } from "@/lib/mutations/organizations"
import { db } from "@/db"
import { organizations } from "@/db/schema/organizations"
import { and, eq, isNull, count, sql } from "drizzle-orm"
import { log } from "@/lib/log"
import { z } from "zod"

const createOrganizationSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  website: z.string().url("Invalid website URL").optional(),
  industry: z.string().max(100).optional(),
  notes: z.string().optional(),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
})

export async function GET(request: NextRequest) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    const { offset, limit } = parsePagination(req)
    const expand = parseExpand(req)

    // Build query with ownership filter
    const whereClause = and(
      eq(organizations.ownerId, context.userId),
      isNull(organizations.deletedAt)
    )

    // Get total count
    const [{ total }] = await db
      .select({ total: count() })
      .from(organizations)
      .where(whereClause)

    // Get paginated results with optional expand
    const results = await db.query.organizations.findMany({
      where: whereClause,
      offset,
      limit,
      with: expand.has("owner")
        ? {
            owner: {
              columns: {
                id: true,
                name: true,
                email: true,
              },
            },
          }
        : undefined,
      orderBy: (orgs, { desc }) => [desc(orgs.createdAt)],
    })

    // Serialize results
    const data = results.map((org) => {
      const serialized = serializeOrganization(org)
      if (expand.has("owner") && "owner" in org && org.owner) {
        return { ...serialized, owner: org.owner }
      }
      return serialized
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
    const parseResult = createOrganizationSchema.safeParse(body)
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        code: issue.code,
        message: issue.message,
      }))
      return Problems.validation(errors)
    }

    const { name, website, industry, notes, custom_fields } = parseResult.data

    // Use mutation (handles insert + event emission)
    const result = await createOrganizationMutation({
      name,
      website,
      industry,
      notes,
      customFields: custom_fields,
      userId: context.userId,
    })

    if (!result.success) {
      return Problems.validation([{ field: "body", code: "mutation_error", message: result.error }])
    }

    // DATA-02: the 201 body is a CANONICAL READ, not the row the write returned. It is read back
    // through the same three-term predicate `GET /api/v1/organizations/[id]` uses, so ONE code path
    // defines truth and a create response cannot drift from a subsequent read — including for
    // derived fields that do not exist yet. The accepted cost is one extra SELECT per create.
    //
    // `recalculateFormulas` runs after the insert and before this point and writes `customFields`
    // (`src/lib/formula-recalc.ts:960-991`), so serializing the returned row would ship a value a
    // subsequent GET contradicts. It writes NO other column — `updatedAt` is deliberately not
    // bumped there — so this read differs from the inserted row in `custom_fields` and nowhere else.
    //
    // NOT `{ ...row, customFields: recalculated }`. That in-process merge agrees with the database
    // today only because the recalc happens to write exactly one column, which is a coincidence and
    // not a contract; it breaks for the next derived field. See `people/[id]/route.ts` for the
    // shape that was rejected.
    //
    // The fallback keeps a create from FAILING on a read. It is unreachable — the insert just
    // committed a row whose `ownerId` is the value being matched — and it is LOGGED rather than
    // silent, because an unlogged fallback is a path that reproduces this very defect and says
    // nothing about it.
    const canonical = await db.query.organizations.findFirst({
      where: and(
        eq(organizations.id, result.id),
        eq(organizations.ownerId, context.userId),
        isNull(organizations.deletedAt)
      ),
    })

    if (!canonical) {
      log.error("api/v1/organizations", "canonical read after create found no row", {
        id: result.id,
      })
    }

    return createdResponse(serializeOrganization(canonical ?? result.organization))
  })
}
