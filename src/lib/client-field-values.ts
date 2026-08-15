import { unwrapFormulaValue } from "@/lib/formula-helpers"
import type { CustomFieldDefinition } from "@/db/schema"

/* -------------------------------------------------------------------------------------------
 * Client mirror of `buildFormulaFieldValues` (src/lib/formula-recalc.ts) — CFUI-03 / D-14.
 *
 * THESE TWO FUNCTIONS MUST BE CHANGED TOGETHER. They are two evaluators over the same data,
 * and `client-field-values.test.ts` asserts they agree key-for-key for equivalent inputs; that
 * assertion is the only thing standing between this file and the divergence it exists to
 * repair. If you change the precedence, the seeding or the unwrapping here, change it there
 * too (and vice versa) — the parity test will fail if you change only one side.
 *
 * Why a second implementation exists at all: `buildFormulaFieldValues` lives in
 * `formula-recalc.ts`, which imports `@/db`, so it can never be imported from a `'use client'`
 * component. This module deliberately imports NOTHING that reaches a database client
 * (`formula-helpers` imports only `./formula-engine`), and a test greps this source to keep it
 * that way.
 *
 * Why it is a module rather than four lines inline in `custom-fields-section.tsx`: inline, the
 * server/client parity is unassertable without rendering a client component — which is exactly
 * how CFUI-03 survived.
 * ----------------------------------------------------------------------------------------- */

export interface BuildClientFieldValuesInput {
  /** Every ACTIVE definition for the entity. Only `name` is read. */
  definitions: Pick<CustomFieldDefinition, "name">[]
  /**
   * Native attributes already resolved to their formula-facing names
   * (`{ Value, Title, Notes, ExpectedCloseDate }` for a deal), as the detail pages pass them.
   * The server resolves attribute -> column against the row instead; the shapes differ, the
   * resulting keys do not. Optional because `activities/[id]/page.tsx` passes none (CFUI-04).
   */
  entityAttributes?: Record<string, unknown>
  /** The entity's stored `customFields` JSONB, plus any values edited in this session. */
  values: Record<string, unknown>
}

/**
 * Build the `fieldValues` object the browser hands to `evaluateFormula`, in the same
 * precedence order as the server: native attributes, then a `null` for every active
 * definition, then the stored blob with every `{formula:true,...}` wrapper unwrapped.
 *
 * **The order is the whole point and it is not interchangeable** (RESEARCH Pitfall 4).
 * Seeding LAST wipes every real value; seeding FIRST-of-all nulls nothing useful, because the
 * stored blob rarely carries a key for an unset field.
 *
 * Pass 2 is a correctness requirement, not an optimisation (D-14): `formula-engine.ts` errors
 * with `Unknown field: X` when a referenced key is ABSENT from `fieldValues`, but returns a
 * blank when the key is present and explicitly `null`. Records whose `custom_fields` is `{}`
 * therefore rendered `#ERROR — Unknown field: X` in the UI for a field that visibly exists in
 * the admin list — that is CFUI-03. Pinned by
 * `formula-engine.test.ts` › "absent key vs present-and-null".
 *
 * Pass 3's `unwrapFormulaValue` is equally load-bearing: a wrapper object reaching the sandbox
 * makes arithmetic yield `NaN`, which surfaces as `null` — a silent blank with no error.
 */
export function buildClientFieldValues({
  definitions,
  entityAttributes,
  values,
}: BuildClientFieldValuesInput): Record<string, unknown> {
  const fieldValues: Record<string, unknown> = {}

  // 1. Natives. `?? null` mirrors the server's `row?.[column] ?? null`, so an attribute the
  //    page did not resolve becomes a blank rather than an `undefined` in the sandbox.
  for (const [attribute, value] of Object.entries(entityAttributes ?? {})) {
    fieldValues[attribute] = value ?? null
  }

  // 2. The D-14 null seed — one present key per active definition.
  for (const definition of definitions) {
    fieldValues[definition.name] = null
  }

  // 3. Stored values, unwrapped. Last, so a real value always beats the seed.
  for (const [key, value] of Object.entries(values)) {
    fieldValues[key] = unwrapFormulaValue(value)
  }

  return fieldValues
}
