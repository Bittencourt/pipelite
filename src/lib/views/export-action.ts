"use server"

/**
 * EXPORT THE RECORDS A SAVED VIEW MATCHES (criterion 4, VIEW-03).
 *
 * ONE action, guarded and capped. Three absences here are DECISIONS, not omissions, and each would
 * be a regression if a later reader "fixed" it:
 *
 *   - **NO ADMIN GATE (E-9).** Export is available to every authenticated user. That is Decision
 *     2's direct consequence: 38-CONTEXT.md:110-116's gate is REPLACED by
 *     `guardExportInput`, not supplemented by it. Re-adding an admin check here would silently
 *     un-widen a deliberate, recorded widening — and it would do so invisibly, because the phase's
 *     tests would still pass for the two admin accounts this deployment has. The unit gate asserts
 *     this file mentions no admin role at all.
 *   - **NO `/api/export` ROUTE (M-14).** The client downloads through the Blob/ObjectURL idiom in
 *     `src/components/bulk/bulk-action-bar.tsx:73-83` (E-6). This phase adds no route.
 *   - **NO FORMAT CHOICE (E-10).** CSV only. `format` and `includeCustomFields` are LITERALS
 *     written below, exactly as `exportSelectedOrganizations` writes them, so the only
 *     caller-supplied value that reaches the read path is the filter map — and that has already
 *     been re-derived by the guard (T-40-34).
 *
 * The cap and the guard live in `src/lib/export/view-export-guard.ts` because a `"use server"`
 * module may export nothing but async functions; see that file's header.
 */
import { auth } from "@/auth"
import { fetchFilteredData } from "@/lib/export/formatters"
import { EXPORT_ROW_CAP, guardExportInput } from "@/lib/export/view-export-guard"
import type { ViewEntityType } from "@/lib/views/types"
import type { FilterParamSource } from "@/lib/views/url-params"

/**
 * A discriminated union so the client can pick its message without re-deriving anything.
 *
 * `bulk.exported` with `{count}` on success (E-7) and `bulk.error.exportFailed` for `"failed"`
 * (E-8) are REUSED VERBATIM — this phase adds no key to the `bulk` namespace it does not own.
 * `"too_many"` carries `max` so `views.export.tooMany` can render `{max}` without the client
 * knowing the cap, and `"refused"` selects `views.export.refused`.
 *
 * `filename` is SERVER-GENERATED and never translated, and `count` comes from the fetch RESULT
 * rather than from anything the caller sent, so the name and the row count cannot disagree.
 */
export type ViewExportResult =
  | { success: true; data: string; filename: string; count: number }
  | { success: false; error: "unauthenticated" | "refused" | "failed" }
  | { success: false; error: "too_many"; max: number }

export async function exportViewResults(input: {
  entityType: ViewEntityType
  filters: FilterParamSource
}): Promise<ViewExportResult> {
  const session = await auth()

  if (!session?.user?.id) {
    return { success: false, error: "unauthenticated" }
  }

  // THE GUARD, BEFORE ANY QUERY RUNS. An action handed `{}` — or a map of only non-whitelisted
  // keys, or a blank search, or a deals view carrying nothing but its board — stops here, having
  // read no rows. Everything this decision needs is in the submitted map, which is why it can
  // precede the database rather than filter its results.
  const guarded = guardExportInput(input)

  if (!guarded.ok) {
    return { success: false, error: "refused" }
  }

  const result = await fetchFilteredData({
    entityType: input.entityType,
    format: "csv",
    includeCustomFields: true,
    filters: guarded.filters,
    maxRows: EXPORT_ROW_CAP,
  })

  if (!result.success) {
    if (result.error === "too_many") {
      return { success: false, error: "too_many", max: EXPORT_ROW_CAP }
    }

    // Everything else collapses to one code. `fetchFilteredData` already logged the cause; the
    // client renders `bulk.error.exportFailed` and the user is told nothing about our internals.
    return { success: false, error: "failed" }
  }

  return { success: true, data: result.data, filename: result.filename, count: result.count }
}
