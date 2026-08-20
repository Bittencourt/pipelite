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
 * THE ADMIN PICKER AND THIS MODULE NOW SHARE ONE PREDICATE, and that is the point of
 * `isCollectableIdentityField` being exported rather than inlined. Until gap D-39-04 was closed the
 * admin identity-field form offered every organization field label with no type filter, so an admin
 * could configure a non-text field and see it saved while no input ever appeared for it — the same
 * silent-failure class D-39-01 was, moved one layer up. The picker's option list is now produced by
 * `collectableIdentityFieldNames` in this module, consumed by `readOrgFieldNames` in
 * `src/app/duplicates/page.tsx` and passed to the form as a plain array of labels. Both sides route
 * through ONE implementation of the rule precisely so the picker cannot offer a label the create
 * dialog would then refuse: two independently maintained filters would disagree on the shared-name
 * case below and rebuild the defect somewhere new.
 *
 * THE PICKER IS A CONTROL, NOT THE ENFORCEMENT (T-39G-17). `saveOrgIdentityFields` validates the
 * submitted array's SHAPE and deliberately not its types, so a crafted POST can still store a
 * `multi_select` label. What makes that safe is the read side here refusing to collect it — the
 * configuration degrades to exactly the unconfigured behaviour rather than corrupting a blob.
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

/**
 * The narrow projection of a definition this selector needs — never the whole row.
 *
 * Exported because two exported functions take it, and a caller assembling a fixture or a projection
 * needs to be able to name the shape.
 */
export interface FieldTypeByName {
  name: string
  type: string
}

/**
 * THE ONE IMPLEMENTATION OF THE COLLECTABILITY RULE. Both the create dialog (through
 * `selectIdentityInputFields` below) and the admin picker (through `collectableIdentityFieldNames`,
 * and thence `/duplicates/page.tsx`) ask this and nothing else.
 *
 * True when at least one active definition carries that name AND every definition carrying it is
 * `IDENTITY_INPUT_FIELD_TYPE`.
 *
 * BOTH HALVES TRAVEL TOGETHER AND THE ORDER IS LOAD-BEARING. `Array.prototype.every` returns TRUE on
 * an empty array, so dropping the "at least one" test — or reordering it after the `every` — would
 * make every UNKNOWN label collectable, which is the precise opposite of this module's purpose. It is
 * the kind of thing a later simplification removes because it reads as redundant; it is not.
 *
 * "EVERY definition carrying it", not "the first one": two active definitions may legitimately share
 * a name in this deployment, and because `customFields` has ONE key per name, a text row and a
 * `multi_select` row under the same label both read that one key. A shared name whose definitions
 * disagree is therefore collectable by neither side.
 */
export function isCollectableIdentityField(
  label: string,
  definitions: readonly FieldTypeByName[]
): boolean {
  const matching = definitions.filter((definition) => definition.name === label)

  if (matching.length === 0) return false

  return matching.every((definition) => definition.type === IDENTITY_INPUT_FIELD_TYPE)
}

/**
 * Every DISTINCT definition name the predicate admits, in DEFINITION ORDER — the option list the
 * admin identity-field picker offers.
 *
 * DEFINITION ORDER, which is `position` order because `getActiveFieldDefinitions` orders by it, and
 * NOT configured order: this list feeds a control where the admin has not chosen anything yet, so
 * there is no configured order to honour, and `position` is the order the same fields appear in
 * everywhere else in the app.
 *
 * NOT CAPPED AT `ORG_IDENTITY_FIELDS_MAX`. The cap bounds how many fields may be CONFIGURED, not how
 * many may be OFFERED — capping the picker at two options would leave an admin unable to choose the
 * third field in the table.
 *
 * Deduplicated for the same reason `selectIdentityInputFields` deduplicates: one blob key per name,
 * so two definition rows sharing a name are one choice, and offering both would render two options
 * that cannot be told apart and mean the same thing.
 */
export function collectableIdentityFieldNames(
  definitions: readonly FieldTypeByName[]
): string[] {
  const names: string[] = []

  for (const definition of definitions) {
    if (names.includes(definition.name)) continue
    if (!isCollectableIdentityField(definition.name, definitions)) continue

    names.push(definition.name)
  }

  return names
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
 * WHICH labels are dropped is `isCollectableIdentityField`'s answer and not restated here — the admin
 * picker asks the same function, and a second copy of the rule in this loop is exactly how the two
 * would drift apart. In short: a label with no active definition (the admin renamed or deleted the
 * field after configuring it) and a label any of whose definitions is not text are both dropped.
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
    if (!isCollectableIdentityField(label, definitions)) continue

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
