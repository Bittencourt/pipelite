/**
 * CSV column derivation, shared by every export format.
 *
 * This lives in its own module rather than in `formatters.ts` because `pipedrive.ts` needs it
 * too and `formatters.ts` already imports `pipedrive.ts`. Putting it in `formatters.ts` would
 * make the two modules mutually importing, and `formatters.ts` pulls in the drizzle client at
 * module scope — exactly the kind of cycle that has already cost this codebase a production
 * build once. This module imports nothing.
 */

/** Every export column carrying a custom field value is prefixed with this. */
const CUSTOM_FIELD_PREFIX = "custom_"

/**
 * Derive the CSV column list as the UNION of every row's keys.
 *
 * `Papa.unparse(data, { header: true })` builds the header from the **first object only**
 * (measured against the installed papaparse 5.5.3), so any key absent from row 1 is dropped for
 * every row. This is not a corner case: a live 46,055-row organization export emitted **zero**
 * `custom_*` columns although **30,264** of those rows held custom field values, because the
 * first exported row happened not to carry any. Every user exporting their CRM was silently
 * losing all custom fields unless row 1 populated them (SC-2, gap closed by plan 34-13).
 *
 * Ordering is a user-visible contract, so it is fixed rather than incidental:
 *
 * - **Native (non-`custom_`) columns keep first-seen order**, which for the `flatten*` functions
 *   in `formatters.ts` is exactly the order they have always been emitted in — same columns, same
 *   positions. For any dataset where row 1 was representative the output is unchanged.
 * - **Custom columns follow, sorted.** Sorting matters for reproducibility: without it the order
 *   would depend on which row happened to be serialised first and on JSONB key insertion order,
 *   so two exports of the same data could differ. The comparator compares UTF-16 code units
 *   rather than using `localeCompare`, whose result depends on the ambient ICU locale — these
 *   field names contain diacritics (`Consumo Médio em MWh`), so a locale-sensitive sort would
 *   not be deterministic across environments.
 */
export function deriveCsvColumns(data: Record<string, unknown>[]): string[] {
  const native: string[] = []
  const seenNative = new Set<string>()
  const custom = new Set<string>()

  for (const row of data) {
    for (const key of Object.keys(row)) {
      if (key.startsWith(CUSTOM_FIELD_PREFIX)) {
        custom.add(key)
      } else if (!seenNative.has(key)) {
        seenNative.add(key)
        native.push(key)
      }
    }
  }

  // Locale-independent, and therefore identical on every machine and every run.
  const sortedCustom = Array.from(custom).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0
  )

  return [...native, ...sortedCustom]
}
