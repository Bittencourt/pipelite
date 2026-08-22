import { NextRequest, NextResponse } from "next/server"
import { and, count, desc, eq, type SQL } from "drizzle-orm"
import { z } from "zod"

import { withApiAuth, type ApiAuthContext } from "@/lib/api/auth"
import { parsePagination } from "@/lib/api/pagination"
import { paginatedResponse } from "@/lib/api/response"
import { Problems } from "@/lib/api/errors"
import { resolveActorRole } from "@/lib/notes/authorize"
import { db } from "@/db"
import {
  auditLog,
  type AuditActorKind,
  type AuditEntityType,
  type AuditLogRow,
} from "@/db/schema/audit-log"

/**
 * GET /api/v1/audit — the ONLY handler this module will ever export.
 *
 * READ-ONLY, PERMANENTLY. There is no create, update, amend or delete verb here and none may be
 * added. Audit rows are append-only facts written by the crmBus subscriber (36-11) and by the
 * importer's summary row (36-12); the retention pruner (36-18) is the single permitted deletion
 * path. A mutating handler on this file would let an API-key holder rewrite the record of what
 * an API key did — the one thing the log exists to make impossible (T-36-33). The sibling test
 * imports this module and asserts the mutating verbs are `undefined`, so adding one fails the
 * suite rather than shipping quietly.
 *
 * ADMIN-ONLY. This is the broadest read surface in the phase: one request can retrieve former
 * values across every CRM record, so it is an information-disclosure surface if any API key can
 * reach it (T-36-05). `ApiAuthContext` is `{ userId, keyId }` with NO role
 * (src/lib/api/auth.ts:6-9), so the role is re-read from storage on every request and never
 * taken from the request itself.
 */

/**
 * The closed literal sets every filter is validated against.
 *
 * `satisfies` is what keeps them from drifting: if `AuditEntityType` or `AuditActorKind` ever
 * gains or renames a member, a stale literal here stops compiling. These values reach a SQL
 * predicate, so they are checked against a closed set BEFORE any fragment is composed — the same
 * posture as `assertEntityType` in src/lib/timeline/assemble.ts:33-41 (T-36-06).
 */
const AUDIT_ENTITY_TYPES = [
  "organization",
  "person",
  "deal",
  "activity",
  // The fifth literal is real: an import writes ONE summary row per session, and that row is
  // about a session rather than a CRM record.
  "import_session",
  // The sixth, likewise: one row per completed view export (Phase 40 review WR-04). It must be
  // listed here or the rows are unreachable — this endpoint is the ONLY reader of them, since
  // /admin/audit lists no rows and the record timeline admits the four CRM literals only.
  "export",
] as const satisfies readonly AuditEntityType[]

const AUDIT_ACTOR_KINDS = [
  "user",
  "workflow_run",
  "api_key",
  "import",
  "system",
] as const satisfies readonly AuditActorKind[]

/**
 * Free-text filters are bound as parameters by the drizzle builder, never interpolated — but
 * they are still floored at one character. An empty string is not a narrower query, it is a
 * caller who thinks they filtered and did not, and silently answering with the whole log is the
 * worst possible response on this particular endpoint.
 */
const auditFilterSchema = z.object({
  entity_type: z.enum(AUDIT_ENTITY_TYPES).optional(),
  entity_id: z.string().min(1).optional(),
  actor_kind: z.enum(AUDIT_ACTOR_KINDS).optional(),
  workflow_run_id: z.string().min(1).optional(),
})

/** The public shape of an audit entry: snake_case, like every other `/api/v1` serializer. */
interface SerializedAuditEntry {
  id: string
  entity_type: AuditLogRow["entityType"]
  entity_id: string
  action: AuditLogRow["action"]
  changes: AuditLogRow["changes"]
  actor_kind: AuditLogRow["actorKind"]
  actor_user_id: string | null
  workflow_run_id: string | null
  import_session_id: string | null
  created_at: string | null
}

function serializeAuditEntry(row: AuditLogRow): SerializedAuditEntry {
  return {
    id: row.id,
    entity_type: row.entityType,
    entity_id: row.entityId,
    action: row.action,
    // The before/after map is returned verbatim. Per-field access control on audit reads is
    // explicitly out of scope for this phase (36-CONTEXT § Phase Boundary); admin-only is the
    // whole of the gate.
    changes: row.changes,
    actor_kind: row.actorKind,
    actor_user_id: row.actorUserId,
    workflow_run_id: row.workflowRunId,
    import_session_id: row.importSessionId,
    created_at: row.createdAt ? row.createdAt.toISOString() : null,
  }
}

/**
 * The admin gate, written as a local helper on purpose.
 *
 * It does NOT extend `src/lib/notes/authorize.ts`: that module's own header states it is
 * notes-specific by design, and its `isAuthorOrAdmin` predicate is "admin OR author" — there is
 * no author on an audit row, so reusing it would quietly widen this gate to anyone who happened
 * to match an ownership field. This is a direct role comparison and nothing else.
 *
 * An unresolvable actor is DENIED. `resolveActorRole` returns null for an unknown user, a
 * soft-deleted user, and a thrown query alike; none of the three may be treated as a non-admin
 * fallback and none as a default-allow (T-36-05, carrying the Phase 35 T-35-25 posture forward).
 */
async function authorizeAuditRead(
  userId: string
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const actor = await resolveActorRole(userId)

  if (!actor || actor.role !== "admin") {
    // 403 rather than 404: the endpoint's existence is not a secret worth keeping, and a 404
    // here would tell an admin whose role lookup transiently failed that the route is gone.
    return { ok: false, response: Problems.forbidden() }
  }

  return { ok: true }
}

/**
 * GET /api/v1/audit
 *
 * Offset/limit paging with the standard `{ data, meta: { total, offset, limit } }` envelope.
 * The page-size clamp belongs to `parsePagination` (T-36-34) and is deliberately not
 * re-implemented here — a second copy is a second thing to forget to update.
 */
export async function GET(request: NextRequest) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    try {
      // Authorization runs FIRST, before the query string is even inspected: a caller who may
      // not read the log learns nothing from the shape of its own validation errors.
      const authorized = await authorizeAuditRead(context.userId)
      if (!authorized.ok) {
        return authorized.response
      }

      const { searchParams } = req.nextUrl
      const parsed = auditFilterSchema.safeParse({
        entity_type: searchParams.get("entity_type") ?? undefined,
        entity_id: searchParams.get("entity_id") ?? undefined,
        actor_kind: searchParams.get("actor_kind") ?? undefined,
        workflow_run_id: searchParams.get("workflow_run_id") ?? undefined,
      })

      if (!parsed.success) {
        // Returning here is the mitigation: an invalid value never reaches a predicate.
        return Problems.validation(
          parsed.error.issues.map((issue) => ({
            field: issue.path.join(".") || "query",
            code: issue.code,
            message: issue.message,
          }))
        )
      }

      const { offset, limit } = parsePagination(req)

      // Each filter maps to one indexed column: entity_type/entity_id hit
      // `audit_log_entity_idx`, workflow_run_id hits the partial `audit_log_workflow_run_idx`.
      const conditions: SQL[] = []
      if (parsed.data.entity_type) {
        conditions.push(eq(auditLog.entityType, parsed.data.entity_type))
      }
      if (parsed.data.entity_id) {
        conditions.push(eq(auditLog.entityId, parsed.data.entity_id))
      }
      if (parsed.data.actor_kind) {
        conditions.push(eq(auditLog.actorKind, parsed.data.actor_kind))
      }
      if (parsed.data.workflow_run_id) {
        conditions.push(eq(auditLog.workflowRunId, parsed.data.workflow_run_id))
      }

      // No filters means no WHERE clause at all, not a tautology predicate.
      const where = conditions.length > 0 ? and(...conditions) : undefined

      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(auditLog)
          .where(where)
          // `id` is the tiebreaker: two rows written in the same millisecond would otherwise be
          // free to swap places between pages, repeating one and hiding the other.
          .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
          .offset(offset)
          .limit(limit),
        db.select({ total: count() }).from(auditLog).where(where),
      ])

      return paginatedResponse(rows.map(serializeAuditEntry), total, offset, limit)
    } catch (error) {
      console.error("GET /api/v1/audit failed:", error)
      return Problems.internalError()
    }
  })
}
