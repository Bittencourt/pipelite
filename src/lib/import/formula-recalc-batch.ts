/**
 * Bounded batch formula recalculation for the bulk import paths (D-02, D-04/D-13).
 *
 * The CSV importer (`src/app/import/actions.ts`) and the Pipedrive API importer
 * (`./pipedrive-api-import-actions.ts`) are the last two server-side write paths that build a
 * `customFields` blob and hand it straight to `db.insert`, bypassing the mutation layer entirely.
 * They are also the highest-volume writers in the system, which makes them the two places where
 * a naive "recalculate every row" would be a request-amplification primitive rather than a
 * correctness fix.
 *
 * This module exists so that neither importer has to reason about the budget itself. Both call
 * `recalculateImportedRows` once per entity flow and get bounded, cascade-free, failure-isolated
 * recalculation with a summary they can surface to the user.
 *
 * It deliberately adds NO `evaluateFormula` call site: every evaluation still goes through
 * `recalculateFormulas`, which is the single place that passes the D-18 resource bounds. A call
 * site that reached the engine directly would silently reopen threat T-34-02, so a test scans
 * this file's source for the token.
 */

import type { CustomFieldDefinition, EntityType } from "@/db/schema/custom-fields"
import {
  recalculateFormulas,
  FORMULA_EVALUATION_BUDGET,
  ENTITY_NATIVE_ATTRIBUTES,
} from "@/lib/formula-recalc"

/** A row as an importer's `.returning()` hands it back. */
export interface ImportedRow extends Record<string, unknown> {
  id: string
  customFields?: Record<string, unknown> | null
}

export interface RecalculateImportedRowsInput {
  entityType: EntityType
  rows: ImportedRow[]
  /**
   * The evaluation allowance for THIS ENTIRE CALL, shared by every row. Defaults to
   * `FORMULA_EVALUATION_BUDGET`. Zero or negative means zero evaluations, never unlimited.
   */
  budget?: number
  /**
   * Pass the cache the importer already used for its `stripFormulaKeys` read, so one import
   * issues one definition query per entity type instead of one per row.
   */
  definitionsCache?: Map<EntityType, CustomFieldDefinition[]>
}

export interface RecalculateImportedRowsSummary {
  /** Rows whose formulas were recomputed and persisted. */
  recalculated: number
  /** Rows that were NOT recomputed — budget exhausted, or the recalculation threw. */
  skipped: number
  /** Evaluations actually spent, across every row. */
  evaluations: number
}

/**
 * Recompute the formula custom fields of rows an importer just inserted.
 *
 * **The budget is ONE shared, decrementing counter for the whole call — never one per row.**
 * `recalculateFormulas` builds a fresh internal allowance on every invocation, so handing each
 * row the full `FORMULA_EVALUATION_BUDGET` would mean a 5,000-row import could run 2.5 million
 * evaluations at ~0.876 ms each (~36 minutes of pure sandbox time) while every individual call
 * still looked "bounded". Instead this loop carries `remaining` forward, passes it down as the
 * per-row `budget`, and subtracts what each row actually spent. Work stops when the allowance
 * runs out and the operator is told, rather than the import running for minutes (T-34-03).
 *
 * Resolves rather than rejects, always: an import of thousands of rows must not abort because
 * one row has a broken formula (D-05 at import scale, T-34-24).
 */
export async function recalculateImportedRows(
  input: RecalculateImportedRowsInput
): Promise<RecalculateImportedRowsSummary> {
  const { entityType, rows } = input

  if (rows.length === 0) {
    return { recalculated: 0, skipped: 0, evaluations: 0 }
  }

  // One cache for the whole import, not one per row. Created here when the importer has no
  // definitions read of its own to donate.
  const definitionsCache =
    input.definitionsCache ?? new Map<EntityType, CustomFieldDefinition[]>()

  // A budget of 0 or less means ZERO evaluations, mirroring `recalculateFormulas`.
  const limit = Math.max(0, input.budget ?? FORMULA_EVALUATION_BUDGET)

  // An import creates rows, and a create genuinely changes every native attribute, so a formula
  // over any of them must run. This is still a precise list rather than a wildcard — derived
  // from the shared `ENTITY_NATIVE_ATTRIBUTES` vocabulary so it cannot drift from the scoping.
  const nativeColumns = Object.values(ENTITY_NATIVE_ATTRIBUTES[entityType])

  let remaining = limit
  let recalculated = 0
  let budgetSkipped = 0
  let failed = 0
  let evaluations = 0

  for (const row of rows) {
    if (remaining <= 0) {
      budgetSkipped += 1
      continue
    }

    try {
      const result = await recalculateFormulas({
        entityType,
        entityId: row.id,
        changedFields: [...nativeColumns, ...Object.keys(row.customFields ?? {})],
        // The importer already has the inserted row, so no re-read is needed.
        row,
        // D-03, deliberate: every imported row is being written in the SAME operation, so
        // cascading from row N would recompute rows this very loop is about to recalculate
        // anyway. It turns an O(n) import into O(n x children) — pure amplification with no
        // correctness gain. Do not "fix" this to true.
        cascade: false,
        budget: remaining,
        definitionsCache,
      })

      evaluations += result.evaluations
      remaining -= result.evaluations
      recalculated += 1
    } catch (error) {
      // Logged, not swallowed (T-34-17). The row keeps whatever blob it was inserted with and
      // self-heals on its next save.
      failed += 1
      console.error(
        `[formula-recalc] ${entityType} import: recalculation failed for row ${row.id}:`,
        error
      )
    }
  }

  // Exactly one warning per call, however many rows ran out of allowance. Budget exhaustion is
  // a silent partial recalculation otherwise, which is precisely the repudiation risk T-34-25
  // names — the importers additionally surface `skipped` in their user-visible warnings.
  if (budgetSkipped > 0) {
    console.warn(
      `[formula-recalc] ${entityType} import: evaluation budget of ${limit} exhausted after ` +
        `${recalculated + failed} of ${rows.length} rows; ${budgetSkipped} rows were not ` +
        `recalculated and keep the values they were imported with`
    )
  }

  return { recalculated, skipped: budgetSkipped + failed, evaluations }
}
