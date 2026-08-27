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
import { recordExport } from "@/lib/audit/export-events"
import { countExportMatches } from "@/lib/export/export-count"
import { decideSelectivity } from "@/lib/export/export-selectivity"
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
 * `"too_broad"` (SEC-03) carries BOTH numbers the count produced, because `views.export.tooBroad`
 * is "This filter matches {matched} of {total} records" and a refusal the user cannot act on is the
 * G-2 regression again. A per-code payload is the EXISTING pattern here, not a new one — `too_many`
 * already carries `max` for the same reason. The client never re-derives either number: it has no
 * way to count rows, and a number it invented would disagree with the one the rule decided on.
 *
 * `filename` is SERVER-GENERATED and never translated, and `count` comes from the fetch RESULT
 * rather than from anything the caller sent, so the name and the row count cannot disagree.
 */
export type ViewExportResult =
  | { success: true; data: string; filename: string; count: number }
  | { success: false; error: "unauthenticated" | "refused" | "failed" }
  | { success: false; error: "too_many"; max: number }
  | { success: false; error: "too_broad"; matched: number; total: number }

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

  /*
   * THE MINIMUM SELECTIVITY BOUND (SEC-03). The guard above asks whether this map narrows AT ALL;
   * this asks whether it narrows ENOUGH. `search=a` passes the first and fails the second — it is a
   * filter, so `hasExportableFilter` is satisfied, and it matches 44,254 of 46,054 organizations,
   * 96.09% of the customer table. Four decisions are encoded in the placement and the payload
   * below, and each is one a later reader would otherwise undo.
   *
   * 1. IT IS AFTER THE GUARD, AND THAT ORDER IS THE CONTROL. Everything `guardExportInput` refuses
   *    still stops above this line having read no rows: a `{}` map, a map of only non-whitelisted
   *    keys, a blank or whitespace search, a crafted `entityType`, a deals view carrying nothing
   *    but its board. Moving the count earlier would buy TWO count queries for every request the
   *    guard already refuses for free, and `view-export-guard.ts:18-19` states that database-free
   *    refusal as a property worth keeping. `view-filters.test.ts` asserts
   *    `guardAt < countAt < decideAt` over comment-stripped source for exactly this reason.
   *
   * 2. IT IS BEFORE THE FETCH, AND THAT IS THE CRITERION. SEC-03 is about rows not leaving the
   *    product. A selectivity check placed after `fetchFilteredData` has already materialised and
   *    formatted the rows it was supposed to refuse, which is a refusal in name only.
   *
   * 3. IT RETURNS BEFORE `recordExport`, BECAUSE A REFUSED EXPORT PRODUCED NO FILE — and the known
   *    limitation that follows is stated here rather than left to be rediscovered: refused, capped
   *    and now `too_broad` attempts write NO audit row, so `audit_log` is evidence of exports that
   *    COMPLETED and not of probing. Anyone reading these rows as an attack trail will under-count.
   *    Recorded in `BACKLOG.md` under WR-04 and deliberately not closed here.
   *
   * 4. THERE IS NO ADMIN BRANCH, and its absence is the design rather than an oversight. The bound
   *    applies to EVERY authenticated user. Nothing is lost by that:
   *    `src/app/admin/export/actions.ts` is already a separate role-gated unbounded export, so
   *    admins keep the path they have and the view path is bounded for everyone. E-9 therefore
   *    survives intact — export is still available to every authenticated user, now BOUNDED rather
   *    than refused, which is also what SC-2 requires (a narrow export must still complete for a
   *    non-admin). `view-filters.test.ts` asserts this file contains neither an `admin` string nor a
   *    bare `role` token, that gate is UNMODIFIED by this phase, and relocating such a branch into
   *    `export-selectivity.ts` to satisfy it would be gate-laundering — which is why that module
   *    asserts the same two negatives of itself.
   *
   * ONE CONSEQUENCE, COMPUTED AND RECORDED SO IT IS NOT REDISCOVERED AS DEAD CODE. With a 0.40
   * fraction, `EXPORT_ROW_CAP = 50_000` is now UNREACHABLE from this path on current volumes: a set
   * above 50,000 rows on the largest table (79,022 activities) is 63%+, so this refusal lands
   * first. The cap's one live branch today — activities `status=completed`, 74,857 rows, previously
   * `too_many` — will now be refused as `too_broad`. THE CAP STAYS. It is defence in depth, it
   * re-enters as soon as a table passes ~125,000 rows (`50,000 / 0.40`), it bounds the read even if
   * the selectivity rule is ever loosened, and `view-filters.test.ts` asserts it in both
   * directions.
   */
  const counts = await countExportMatches(input.entityType, guarded.filters)
  const selectivity = decideSelectivity(counts)

  if (!selectivity.ok) {
    return {
      success: false,
      error: "too_broad",
      matched: selectivity.matched,
      total: selectivity.total,
    }
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

  // THE EXPORT IS NOW ATTRIBUTABLE (review WR-04). Awaited and after the fetch, because
  // `result.count` must be what the export actually produced — a refused or capped attempt
  // produced no file and writes no row, so this is evidence of exports, not of probing.
  //
  // It does NOT bound the export. `guardExportInput` above refuses an empty filter set and is
  // satisfied by `search=a`, which reaches 44,254 of 46,054 organizations; that exposure is
  // unchanged by this line and stays open in BACKLOG.md. `recordExport` swallows its own failure,
  // so a logging fault cannot fail an export the user already asked for — see its header.
  await recordExport({
    actorUserId: session.user.id,
    entityType: input.entityType,
    filters: guarded.filters,
    rowCount: result.count,
  })

  return { success: true, data: result.data, filename: result.filename, count: result.count }
}
