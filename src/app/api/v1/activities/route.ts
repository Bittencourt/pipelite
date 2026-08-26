import { NextRequest } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { Problems } from "@/lib/api/errors"
import { parsePagination } from "@/lib/api/pagination"
import { parseExpand } from "@/lib/api/expand"
import { paginatedResponse, createdResponse } from "@/lib/api/response"
import { serializeActivity, serializeDeal, serializePerson, serializeOrganization } from "@/lib/api/serialize"
import { createActivityMutation } from "@/lib/mutations/activities"
import { db } from "@/db"
import { activities, deals, activityTypes, users } from "@/db/schema"
import { eq, and, isNull, desc, asc, sql } from "drizzle-orm"
import { log } from "@/lib/log"
import { z } from "zod"

const createActivitySchema = z.object({
  title: z.string().min(1, "Title is required"),
  type_id: z.string().min(1, "Type ID is required"),
  deal_id: z.string().optional().nullable(),
  owner_id: z.string().optional().nullable(),
  // WR-01: `.datetime()`. Without it `{"due_at": "not-a-date"}` reached `new Date("not-a-date")`,
  // which is an `Invalid Date`; postgres.js serializes via `toISOString()` and throws
  // `RangeError: Invalid time value` — a 500 carrying no SQLSTATE.
  //
  // NULLABLE HERE, unlike the PUT schema, and the asymmetry is deliberate rather than an oversight:
  // this route reads `due_at ? new Date(due_at) : now`, so `null` means "default it to now" and
  // never reaches the `.notNull()` column. On PUT there is no such default and no way to clear the
  // column, so `null` is refused there.
  due_at: z.string().datetime().optional().nullable(),
  notes: z.string().optional().nullable(),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
})

/** The three `users` columns the `?expand=owner` payload projects, anchored to the schema. */
type ExpandedOwner = Pick<typeof users.$inferSelect, "id" | "name" | "email">

/** The exact shape Drizzle accepts for the relational `with` key on an activity list query. */
type ActivityWith = NonNullable<Parameters<typeof db.query.activities.findMany>[0]>["with"]

/** An activity row plus the relations the `expand` handler may have loaded. */
type ActivityExpanded = typeof activities.$inferSelect & {
  type?: typeof activityTypes.$inferSelect | null
  deal?: (Parameters<typeof serializeDeal>[0] & {
    organization?: Parameters<typeof serializeOrganization>[0] | null
    person?: Parameters<typeof serializePerson>[0] | null
  }) | null
  owner?: ExpandedOwner | null
}

// GET /api/v1/activities - List activities with pagination and filters
export async function GET(request: NextRequest) {
  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {
    const { offset, limit } = parsePagination(req)
    const expand = parseExpand(req)
    const searchParams = req.nextUrl.searchParams

    // Filter params
    const typeId = searchParams.get("type_id")
    const dealId = searchParams.get("deal_id")
    const ownerId = searchParams.get("owner_id")

    // Build where conditions.
    //
    // SEC-01: the owner equality below is the caller scope, and that ONE line scopes
    // BOTH queries below — the page query and the count query each consume this same `conditions`
    // array, so `meta.total` is a ceiling on what this caller may see rather than an independent
    // count of everybody's rows.
    //
    // The caller-supplied `?owner_id=` filter pushed below is a FILTER, not a scope. Composed
    // under `and(...)` after this line it can only narrow within the caller's own records; it can
    // never widen them. Do not delete it, and do not move it above this line.
    const conditions = [isNull(activities.deletedAt), eq(activities.ownerId, ctx.userId)]

    if (typeId) {
      conditions.push(eq(activities.typeId, typeId))
    }
    if (dealId) {
      conditions.push(eq(activities.dealId, dealId))
    }
    if (ownerId) {
      conditions.push(eq(activities.ownerId, ownerId))
    }

    // Build with options based on expand
    const withOptions: ActivityWith = expand.size > 0 ? {
      ...(expand.has("type") ? { type: true as const } : {}),
      ...(expand.has("deal") ? {
        deal: {
          with: {
            organization: true as const,
            person: true as const,
          },
        },
      } : {}),
      ...(expand.has("owner") ? { owner: true as const } : {}),
    } : undefined

    // Query activities with count
    const [activityList, countResult] = await Promise.all([
      db.query.activities.findMany({
        where: and(...conditions),
        // WR-02: the trailing `asc(activities.id)` is a TIEBREAKER. `createdAt` is not unique —
        // bulk-created rows share a timestamp to the millisecond — and `LIMIT`/`OFFSET` over a sort
        // with ties is UNSPECIFIED in PostgreSQL, so a row can appear on two pages and another on
        // none while `meta.total` reports the true count in both. The primary key makes the order
        // TOTAL. It is appended, never inserted: the visible sort is unchanged.
        orderBy: [
          asc(sql`${activities.dueDate} IS NULL`),
          asc(activities.dueDate),
          desc(activities.createdAt),
          asc(activities.id),
        ],
        offset,
        limit,
        with: withOptions,
      }) as Promise<ActivityExpanded[]>,
      db.select({ count: sql<number>`count(*)` })
        .from(activities)
        .where(and(...conditions))
        .then(rows => rows[0]?.count ?? 0),
    ])

    // Serialize with expand
    const data = activityList.map(activity => {
      const serialized: Record<string, unknown> = serializeActivity(activity)

      if (expand.has("type") && activity.type) {
        serialized.type = {
          id: activity.type.id,
          name: activity.type.name,
          icon: activity.type.icon,
          color: activity.type.color,
        }
      }

      // CR-01, the READ half — see the twin comment in `[id]/route.ts`. The list expands the same
      // relation, so a row already carrying a foreign `deal_id` would leak that deal, its
      // organization and its person here too. The `owner_id` comparison is LOAD-BEARING.
      if (expand.has("deal") && activity.deal && activity.deal.ownerId === ctx.userId) {
        serialized.deal = {
          ...serializeDeal(activity.deal),
          ...(activity.deal.organization && { organization: serializeOrganization(activity.deal.organization) }),
          ...(activity.deal.person && { person: serializePerson(activity.deal.person) }),
        }
      }

      if (expand.has("owner") && activity.owner) {
        serialized.owner = {
          id: activity.owner.id,
          name: activity.owner.name,
          email: activity.owner.email,
        }
      }

      return serialized
    })

    return paginatedResponse(data, Number(countResult), offset, limit)
  })
}

// POST /api/v1/activities - Create a new activity
export async function POST(request: NextRequest) {
  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return Problems.validation([{ field: "body", code: "invalid_json", message: "Invalid JSON body" }])
    }

    const parsed = createActivitySchema.safeParse(body)
    if (!parsed.success) {
      return Problems.validation(
        parsed.error.issues.map(issue => ({
          field: issue.path.join(".") || "body",
          code: issue.code,
          message: issue.message,
        }))
      )
    }

    const { title, type_id, deal_id, owner_id, due_at, notes, custom_fields } = parsed.data

    // SEC-01: a caller may only create activities they own. `owner_id` stays declared in the
    // schema so a caller who sends one is TOLD it was refused — silently coercing it to the
    // caller would leave them believing the write landed as sent.
    if (owner_id && owner_id !== ctx.userId) {
      return Problems.validation([
        { field: "owner_id", code: "forbidden", message: "owner_id cannot be set to another user" },
      ])
    }

    // CR-01: `deal_id` is a CALLER-SUPPLIED FOREIGN KEY and nothing constrained it.
    // `createActivityMutation` validates that the deal EXISTS
    // (`src/lib/mutations/activities.ts:140-151` — `eq(deals.id, dealId), isNull(deals.deletedAt)`)
    // and never that the caller owns it, so a POST naming another user's deal reached 201 and
    // `?expand=deal` then serialized that deal plus its organization and its person.
    //
    // THE GUARD BELONGS HERE, IN THE ROUTE, not in the mutation: the mutation is also the
    // session-auth server-action path, where `input.userId` is already the established owner, so
    // tightening it there is a separate change with a separate blast radius.
    //
    // Same shape, same 422 and same `invalid_reference` code as
    // `src/app/api/v1/deals/[id]/route.ts:226-256`. Placed AFTER the `owner_id` refusal above so a
    // caller who cannot create the row at all does not get a deal-existence oracle for free.
    if (deal_id) {
      const deal = await db.query.deals.findFirst({
        where: and(eq(deals.id, deal_id), eq(deals.ownerId, ctx.userId), isNull(deals.deletedAt)),
      })

      if (!deal) {
        return Problems.validation([
          { field: "deal_id", code: "invalid_reference", message: "Deal not found" },
        ])
      }
    }

    // Determine owner - after the guard above, `owner_id` can only ever be the caller's own id,
    // so this is provably equal to `ctx.userId`.
    const activityOwnerId = owner_id || ctx.userId

    // Use mutation (handles insert + validation + event emission)
    const now = new Date()
    const result = await createActivityMutation({
      title,
      typeId: type_id,
      dealId: deal_id,
      assigneeId: null,
      dueDate: due_at ? new Date(due_at) : now,
      notes,
      customFields: custom_fields,
      userId: activityOwnerId,
    })

    if (!result.success) {
      return Problems.validation([{ field: "body", code: "mutation_error", message: result.error }])
    }

    // DATA-02: the 201 body is a CANONICAL READ, not the row the write returned. It is read back
    // through the same three-term predicate `GET /api/v1/activities/[id]` uses, so ONE code path
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
    // not a contract; it breaks for the next derived field. See `activities/[id]/route.ts` for the
    // shape that was rejected.
    //
    // The owner term is `activityOwnerId` rather than `ctx.userId` because that is the identifier
    // the insert actually wrote; the 422 above proves the two are equal.
    //
    // WR-02 — THE FALLBACK IS REACHABLE, AND THE COMMENT HERE USED TO SAY IT WAS NOT.
    //
    // The claim was "unreachable — the insert just committed a row whose `ownerId` is the value
    // being matched". THREE THINGS DEFEAT IT, one per predicate term:
    //
    //  - `isNull(deletedAt)`: `createActivityMutation` emits `activity.created` ON THE BUS, INSIDE
    //    the mutation, BEFORE this read. `crmBus.emit` is a synchronous `EventEmitter` and its
    //    workflow subscriber calls `matchAndFireTriggers(...)` fire-and-forget
    //    (`src/lib/events/subscribers/workflow-trigger.ts:76-78`), so a `crm_action` with
    //    `operation: "delete"` targeting `{{trigger.entityId}}` races this read and soft-deletes
    //    the row.
    //  - `eq(activities.ownerId, …)`: a BULK-03 owner reassign landing in the same window.
    //  - `eq(activities.id, …)`: a concurrent `DELETE /api/v1/activities/:id`.
    //
    // A comment asserting a property the code does not have is worse than no comment: it sends the
    // next reader looking for an impossible database state instead of for the workflow that
    // deleted the record.
    //
    // WHAT IS *NOT* IMPROVED HERE, AND WHY. people/deals now fall back to
    // `{ ...row, customFields: <post-recalc blob> }`. THIS route cannot: the recalculation happens
    // inside `createActivityMutation` (which needs it for its own emit) and the post-recalc blob is
    // not in this scope. Returning it would mean widening the mutation's return type, a change with
    // its own blast radius. So this route's fallback still ships `result.activity` — the pre-recalc
    // blob — and the LOG is what changes. Recorded as the remaining half of WR-02.
    const canonical = await db.query.activities.findFirst({
      where: and(
        eq(activities.id, result.id),
        eq(activities.ownerId, activityOwnerId),
        isNull(activities.deletedAt)
      ),
    })

    if (!canonical) {
      log.error(
        "api/v1/activities",
        "canonical read after create found no row; the record was reassigned, trashed or deleted " +
          "between the insert and the read, so this 201 body carries the PRE-recalc blob",
        { id: result.id }
      )
    }

    return createdResponse(serializeActivity(canonical ?? result.activity))
  })
}
