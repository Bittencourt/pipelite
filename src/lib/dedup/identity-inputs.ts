/**
 * WHICH configured organization identity fields can be COLLECTED at create time — gap D-39-01.
 *
 * `identity-settings.ts` answers "which labels did the admin configure". This module answers the
 * narrower question the create dialog has to ask: of those labels, which ones can a plain text input
 * safely collect a value for. The two are not the same question, and the difference is a
 * DATA-INTEGRITY CONTROL rather than a convenience.
 *
 * `customFields` is a JSONB blob keyed by the field definition's HUMAN LABEL, and every surface that
 * reads a given key expects the shape that key's definition declares. So a label whose definition is
 * a `multi_select` (an array), a `file` (an upload descriptor) or a `number` cannot be filled from a
 * free-text input: doing so would write a bare string under a key the detail page's `FieldRenderer`
 * has to read back, corrupting a value no error would report. It would also buy nothing —
 * `identityValue` in `matching.ts` returns `""` unless `typeof raw === "string"`, so a non-string
 * value can never decide a certain match in the first place.
 *
 * Everything this module drops therefore degrades to EXACTLY the behaviour the product had before
 * the gap was closed: no input, no value, no certain tier, no advisory. That is the same safe
 * direction `readOrgIdentityFields` chose for a missing or corrupted setting.
 *
 * A KNOWN RESIDUAL ASYMMETRY, recorded so nobody reads the drop as a bug: the admin identity-field
 * form offers every organization field label with no type filter, so an admin can configure a
 * non-text field and see it saved while no input ever appears for it. Filtering that control is a
 * separate decision, not this module's to make — and until it is made, silently doing nothing is
 * strictly better than silently corrupting a blob.
 *
 * LIKE `identity-settings.ts`, THIS MODULE READS THE DATABASE and may never be imported from a
 * `"use client"` file. `/organizations` reads it on the server and passes the resulting labels down
 * as a plain array of strings; the wiring gate in
 * `src/components/dedup/__tests__/duplicate-warning-wiring.test.ts` holds that boundary at zero
 * occurrences in both client files.
 *
 * NOTHING HERE THROWS. `/organizations` has no `error.tsx` above it and this read decides nothing
 * more than whether an extra input renders, so a settings or definitions failure must cost that
 * input and never the list page.
 */

import { getActiveFieldDefinitions } from "@/lib/custom-fields"
import { ORG_IDENTITY_FIELDS_MAX, readOrgIdentityFields } from "./identity-settings"

const LOG_PREFIX = "[dedup-identity-inputs]"

/**
 * The ONE custom field type a create-time identity input may collect.
 *
 * `single_select` and `url` store strings too and are still excluded: the first is only valid
 * against its definition's configured option list, and the second has its own validating component.
 * Inventing either input shape at create time is outside this gap, and a plain text box under a
 * `single_select` key would store an option that does not exist.
 */
export const IDENTITY_INPUT_FIELD_TYPE = "text"

/** The narrow projection of a definition this selector needs — never the whole row. */
interface FieldTypeByName {
  name: string
  type: string
}

/**
 * The configured labels that a create-time text input may collect, in CONFIGURED ORDER.
 *
 * Pure, and deliberately takes the projection above rather than `CustomFieldDefinition[]` so its
 * contract can be exercised without a schema import or a database double.
 *
 * Configured order is the CHECKING order — `firstSharedIdentity` consults the configured list in
 * order and stops at the first field populated on both records — so the inputs are rendered in the
 * order the decision is actually made, never in definition `position` order.
 *
 * A label is dropped when no active definition describes it (the admin renamed or deleted the field
 * after configuring it), or when any definition carrying that name is not text. "ANY", not "the
 * first": two active definitions may legitimately share a name in this deployment, and because the
 * blob has ONE key per name, a text row and a `multi_select` row under the same label both read that
 * one key. A shared name whose definitions disagree is therefore not collectable at all.
 *
 * The result is deduplicated — one input per blob key, whether the repetition came from the
 * configured list or from two definition rows — and capped at `ORG_IDENTITY_FIELDS_MAX`. The cap is
 * a belt: the read side already rejects a stored array longer than the cap, so a longer list can
 * only reach here from a caller passing a value in directly.
 */
export function selectIdentityInputFields(
  configured: readonly string[] | null,
  definitions: readonly FieldTypeByName[]
): string[] {
  if (configured === null || configured.length === 0) {
    return []
  }

  const selected: string[] = []

  for (const label of configured) {
    if (selected.includes(label)) continue

    const matching = definitions.filter((definition) => definition.name === label)

    if (matching.length === 0) continue
    if (!matching.every((definition) => definition.type === IDENTITY_INPUT_FIELD_TYPE)) continue

    selected.push(label)

    if (selected.length === ORG_IDENTITY_FIELDS_MAX) break
  }

  return selected
}

/**
 * The one server-side read `/organizations` performs to decide which identity inputs to render.
 *
 * Both reads are issued in a single round trip: the type allowlist needs the definitions whatever
 * the setting says, and short-circuiting on an unconfigured setting would trade a real latency
 * saving for a branch whose absence is easy to verify.
 *
 * A rejection from either read costs the inputs and nothing else. `getActiveFieldDefinitions` is a
 * bare `db.select()` with no guard of its own, so this wrapper is the only thing standing between a
 * database hiccup and a blank `/organizations` — the same wrapper `/duplicates/page.tsx` applies to
 * the same call for the same reason. The log carries the prefix and the error only; no field label
 * and no record content, since labels are admin-authored content (T-39-10).
 */
export async function readOrgIdentityInputFields(): Promise<string[]> {
  try {
    const [configured, definitions] = await Promise.all([
      readOrgIdentityFields(),
      getActiveFieldDefinitions("organization"),
    ])

    return selectIdentityInputFields(configured, definitions)
  } catch (error) {
    console.error(`${LOG_PREFIX} could not resolve the create-time identity inputs:`, error)
    return []
  }
}
