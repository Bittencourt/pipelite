/**
 * AN EXPORT LEAVES A TRACE (Phase 40 review finding WR-04).
 *
 * ## What this is, and what it is NOT
 *
 * Phase 38 (38-CONTEXT.md:110-116) forbade a filters-taking export action reachable without an
 * admin gate, because an action handed `{}` returns every row. Phase 40 Decision 2 (E-9) replaced
 * that gate with `guardExportInput`, which refuses an EMPTY filter set — and is satisfied by a
 * one-character search. Measured twice against the live database, once by the reviewer and once by
 * the phase verifier:
 *
 *     search=a  →  44,254 of 46,054 organizations (96.1%)
 *                  36,893 of 38,348 people
 *     — under EXPORT_ROW_CAP, for any authenticated non-admin, with notes and all custom fields.
 *
 * **This module does not bound that.** It makes it ATTRIBUTABLE: who exported, which entity type,
 * under which filters, how many rows. Detection, not prevention. The chosen posture is that such
 * an export should be *visible*, not impossible. WR-04 therefore stays OPEN in
 * `.planning/BACKLOG.md` with its residual exposure restated — a future reader who finds this file
 * and concludes the finding is closed has been misled, so the backlog entry is the authority and
 * this paragraph is the pointer to it.
 *
 * ## Two shape decisions, both following the import-summary precedent
 *
 * **`action: "created"`, not a new `"exported"` literal.** `AuditAction` is declared TWICE
 * (`src/db/schema/audit-log.ts` and `src/lib/timeline/types.ts`) and consumed by two exhaustive
 * `Record<AuditAction, …>` maps, so a new action is a four-file compile cascade plus
 * `audit-action-exhaustive.test.ts`. The import summary row faced the same question and reused
 * `"created"`, carrying its meaning in `entity_type` instead. This follows it rather than inventing
 * a second convention for the same problem.
 *
 * **`entity_type: "export"`, with a fresh uuid in `entity_id`.** An export is an event, not a
 * record: there is no row it is *about* and none to point at afterwards. The import summary at
 * least had a session id; an export has nothing, so each event gets its own identity. The payoff is
 * structural — `assertEntityType` in `src/lib/timeline/assemble.ts` admits only the four CRM
 * literals, so an export row can never surface in a record's timeline, and `isCrmEntityType` in
 * `linked-records.ts` already excludes it from the workflow-run list. Neither needed a change.
 *
 * ## Where these rows are readable
 *
 * `/api/v1/audit` with `entity_type=export` (admin-only, and the role is re-read from storage on
 * every request). There is deliberately no UI: `/admin/audit` is the retention settings page and
 * lists no rows at all. Anyone relying on this control to *notice* a bulk export needs to query for
 * it — it is evidence after the fact, not an alert. Also recorded in BACKLOG.md.
 */
import { db } from "@/db"
import { auditLog } from "@/db/schema"
import type { ExportFilters } from "@/lib/export/types"
import type { ViewEntityType } from "@/lib/views/types"

/**
 * Flatten the guard-re-derived filter map into one stable, greppable string.
 *
 * SORTED BY KEY so two identical exports produce identical rows — an unsorted
 * `Object.entries` walk would record insertion order and make the log's own values look like
 * they differ when they do not.
 *
 * `ids` is DROPPED. It is unreachable from a view export by construction (it is on no whitelist
 * row in `SAVEABLE_FILTER_KEYS`), so a value here means a bulk-selection caller; recording up to
 * 100 uuids as a filter string would bury the two fields that matter under noise the row count
 * already summarises.
 */
function serialiseFilters(filters: ExportFilters): string {
  return Object.entries(filters)
    .filter(([key, value]) => key !== "ids" && typeof value === "string" && value.length > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("&")
}

/**
 * Record one completed export.
 *
 * Call this AFTER the fetch succeeds, never before: `rowCount` must be what the export actually
 * produced, and a refused or capped attempt produced no file. (A consequence worth naming: a
 * REFUSED attempt is not logged, so this is not a probe detector.)
 *
 * `actorUserId` is passed explicitly rather than read from `getCurrentActor()`. The export action
 * is not one of the four wrapped actor boundaries, so the AsyncLocalStorage store is empty there
 * and a `getCurrentActor()` read would silently attribute every export to `system` — the exact
 * failure observed in the container on 2026-08-16 and documented in `actor-context.ts`.
 */
export async function recordExport(input: {
  actorUserId: string
  entityType: ViewEntityType
  filters: ExportFilters
  rowCount: number
}): Promise<void> {
  try {
    await db.insert(auditLog).values({
      entityType: "export",
      // Each export is its own event with no persistent parent row to reference.
      entityId: crypto.randomUUID(),
      action: "created",
      changes: {
        exportedEntityType: { from: null, to: input.entityType },
        rowCount: { from: null, to: input.rowCount },
        filters: { from: null, to: serialiseFilters(input.filters) },
      },
      actorKind: "user",
      actorUserId: input.actorUserId,
      workflowRunId: null,
      importSessionId: null,
    })
  } catch (auditError) {
    // SWALLOWED, and this is the module's one real weakness rather than a tidy default. The import
    // summary swallows for a sound reason — failing a completed import because its audit row failed
    // would report a lie about the user's own data — and the same holds here: the CSV is already
    // built and the user asked for it. But the consequence is that an export whose audit write
    // fails is an UNLOGGED export, which is precisely the invisibility this module exists to
    // remove. Loud in the log rather than silent, and recorded in BACKLOG.md. Making the export
    // FAIL instead would be a prevention behaviour, which is not the posture that was chosen.
    console.error("[audit-export] failed to record export event:", auditError)
  }
}
