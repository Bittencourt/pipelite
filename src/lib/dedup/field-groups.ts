import {
  CUSTOM_FIELD_PREFIX,
  describeField,
  type AuditResolution,
  type FieldDescriptor,
} from "@/lib/audit/present"
import type { MergeableEntityType } from "./types"

/* -----------------------------------------------------------------------------------------
 * PURE. No database client, no clock, no I/O of any kind.
 *
 * The posture is copied from `src/lib/audit/present.ts`: the vitest suite mocks `@/db`
 * wholesale, so anything that queries cannot be unit tested. Everything this module needs
 * from the database - a custom field definition's user-authored name, its type, its position -
 * arrives in the `AuditResolution` parameter, supplied by the caller. That is what makes the
 * merge screen's partitioning decision testable without rendering anything, which matters
 * because this repo has no jsdom (39-VALIDATION V-7).
 *
 * WHAT THIS MODULE DECIDES: which of the merge screen's three sections a compared field
 * belongs to (39-UI-SPEC M-3), and in what order the fields inside a section appear. It does
 * NOT decide which side wins - that is `./merge-defaults.ts` - and it does not format
 * anything for display.
 * ----------------------------------------------------------------------------------------- */

/**
 * The two entity types a merge can be performed on.
 *
 * Re-exported from the canonical `MergeableEntityType` in `./types` (landed by plan 39-01)
 * rather than restated, so adding a fifth entity cannot silently make it mergeable. During
 * wave 1 these two plans ran in separate worktrees and could not import from one another, so
 * this was briefly declared locally with an identical `Extract<EntityType, …>` derivation;
 * it was re-pointed at the canonical type once both merged.
 */
export type MergeEntityType = MergeableEntityType

/**
 * Columns the merge picker never offers and `applyMergeChoices` never writes.
 *
 * - `id` - the survivor's identity IS the merge; a merge that could rewrite it would be a
 *   different operation with no survivor.
 * - `createdAt` - the survivor's own creation instant is a fact about the survivor, and the
 *   loser's is a fact about a record that is about to be in Trash.
 * - `updatedAt` - owned by the write path, not by a user's radio button.
 * - `deletedAt` - a merge must not be a route to soft-deleting or resurrecting a record;
 *   Phase 37 owns that transition and logs it as its own audit action.
 * - `customFields` - the blob itself is never a field. Its KEYS are compared individually,
 *   prefixed, so that a user answers about "CNPJ / CPF" and not about a JSON object.
 * - `ownerId` - Phase 38 established the narrow `update{Entity}OwnerMutation` functions as
 *   the only sanctioned owner write path, and a merge is not one of them (T-39-13).
 *
 * `Object.freeze` on a `Set` seals its properties, not its contents; the `ReadonlySet` type
 * is what actually stops `.add` at compile time. Both are here on purpose - one guards the
 * reader, the other guards the compiler.
 */
export const MERGE_EXCLUDED_COLUMNS: ReadonlySet<string> = Object.freeze(
  new Set(["id", "createdAt", "updatedAt", "deletedAt", "customFields", "ownerId"])
)

/** One compared field, as the merge picker asks about it. */
export interface MergeField {
  /** A native column name, or `customFields.<definition name>`. Stable, and the React key. */
  key: string
  /**
   * Resolved through the audit presentation layer, never through a map in this file: a
   * message key for a mapped native column, the VERBATIM user-authored name for a custom
   * field (39-UI-SPEC M-4). Told apart structurally, by the `key`'s prefix.
   */
  label: string
  survivorValue: unknown
  loserValue: unknown
}

/** The three sections of 39-UI-SPEC M-3, in the order they render. */
export interface MergeFieldGroups {
  /** Both sides populated and different. Default: the survivor. Never collapsed. */
  conflicts: MergeField[]
  /** Survivor empty, loser populated. Default: the LOSER. Never collapsed. */
  filledOnly: MergeField[]
  /** Equal, or both empty, or the survivor already holds the only value. No control. */
  identical: MergeField[]
}

export interface MergeFieldGroupsInput {
  entityType: MergeEntityType
  survivor: Record<string, unknown>
  loser: Record<string, unknown>
  resolution: AuditResolution
}

/**
 * A value that counts as "the record does not have this".
 *
 * ONE predicate, exported, because `./merge-defaults.ts` decides its default from the same
 * notion of emptiness. Two copies would eventually disagree, and the disagreement would show
 * up as a field defaulting to the loser's value in a group that says it defaults to the
 * survivor's.
 *
 * An empty array counts: a multi-select with zero options selected is the field being empty,
 * not a list the user chose. Mirrors `isEmptyValue` in the audit presentation layer, which
 * renders exactly these as the word "empty" (39-UI-SPEC M-5).
 */
export function isEmptyMergeValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === "string") return value.trim() === ""
  if (Array.isArray(value)) return value.length === 0
  return false
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Whether two stored values are the same value.
 *
 * Deliberately STRICT about strings: `"Acme"` and `"Acme "` are a conflict, not a match. A
 * merge that silently picked one of two spellings would be making an editorial decision the
 * user never saw, and trailing whitespace in a name is exactly the kind of thing an importer
 * introduces on one side only.
 *
 * Arrays and plain objects are compared structurally because multi-select and file custom
 * fields store them, and reference equality would report every such field as a conflict.
 */
function mergeValuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true

  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((item, index) => mergeValuesEqual(item, b[index]))
  }

  if (isRecord(a) && isRecord(b)) {
    const aKeys = Object.keys(a)
    const bKeys = Object.keys(b)
    if (aKeys.length !== bKeys.length) return false
    // Key ORDER is not part of a value: two JSONB blobs that differ only in serialisation
    // order are the same custom field value.
    return aKeys.every(
      (key) => Object.prototype.hasOwnProperty.call(b, key) && mergeValuesEqual(a[key], b[key])
    )
  }

  return false
}

/** The `customFields` blob of a record, or an empty one when it holds anything else. */
function customBlob(record: Record<string, unknown>): Record<string, unknown> {
  const blob = record.customFields
  return isRecord(blob) ? blob : {}
}

/** The value a record holds under a compared key, native column or prefixed custom field. */
function readMergeValue(record: Record<string, unknown>, key: string): unknown {
  if (key.startsWith(CUSTOM_FIELD_PREFIX)) {
    return customBlob(record)[key.slice(CUSTOM_FIELD_PREFIX.length)]
  }
  return record[key]
}

/**
 * Every key the two records are compared on: the union of their native columns minus the
 * excluded set, then one key per custom field name present in either blob.
 *
 * DEDUPED BY THE COMPOSED KEY STRING, and that is not defensive tidiness. The live database
 * holds TWO `custom_field_definitions` rows named `Segmento Organização` for
 * `entity_type='organization'`. A `customFields` blob is keyed by NAME, so both definitions
 * address one and the same blob key: there is one value, and the user must be asked about it
 * once. Keying off the definition list instead of the blob would ask twice and let the second
 * answer overwrite the first.
 */
function comparedKeys(
  survivor: Record<string, unknown>,
  loser: Record<string, unknown>
): string[] {
  const keys: string[] = []
  const seen = new Set<string>()

  const push = (key: string): void => {
    if (seen.has(key)) return
    seen.add(key)
    keys.push(key)
  }

  for (const column of [...Object.keys(survivor), ...Object.keys(loser)]) {
    if (MERGE_EXCLUDED_COLUMNS.has(column)) continue
    push(column)
  }

  for (const name of [...Object.keys(customBlob(survivor)), ...Object.keys(customBlob(loser))]) {
    push(CUSTOM_FIELD_PREFIX + name)
  }

  return keys
}

interface RankedMergeField {
  descriptor: FieldDescriptor
  field: MergeField
}

/**
 * The same ordering `compareChanges` applies in the audit presentation layer: mapped native
 * columns in label-map order, then unmapped native columns, then custom fields ascending by
 * position, every tie broken by the label and finally by the key so the comparator is total.
 *
 * Shared ordering is not cosmetic. The merge picker asks the questions and the `merged`
 * timeline entry reports the answers; a reader comparing the two reads down the same list in
 * the same order.
 */
function compareMergeFields(a: RankedMergeField, b: RankedMergeField): number {
  if (a.descriptor.group !== b.descriptor.group) return a.descriptor.group - b.descriptor.group
  if (a.descriptor.rank !== b.descriptor.rank) return a.descriptor.rank - b.descriptor.rank

  const byLabel = a.field.label.localeCompare(b.field.label)
  if (byLabel !== 0) return byLabel

  if (a.field.key === b.field.key) return 0
  return a.field.key < b.field.key ? -1 : 1
}

function sorted(ranked: RankedMergeField[]): MergeField[] {
  return [...ranked].sort(compareMergeFields).map((entry) => entry.field)
}

/**
 * The two records, partitioned into the merge screen's three sections (39-UI-SPEC M-3).
 *
 * Neither input is mutated and neither is read for anything but its own values.
 */
export function buildMergeFieldGroups(input: MergeFieldGroupsInput): MergeFieldGroups {
  const { survivor, loser, resolution } = input

  // Part of the contract and passed by every caller, but no rule below is entity-dependent:
  // the compared key set is derived from the records themselves. Kept in the signature so a
  // future per-entity rule does not churn every call site. Same `void` idiom as
  // `buildAuditFieldChanges`.
  void input.entityType

  const conflicts: RankedMergeField[] = []
  const filledOnly: RankedMergeField[] = []
  const identical: RankedMergeField[] = []

  for (const key of comparedKeys(survivor, loser)) {
    const descriptor = describeField(key, resolution)
    const survivorValue = readMergeValue(survivor, key)
    const loserValue = readMergeValue(loser, key)

    const ranked: RankedMergeField = {
      descriptor,
      field: { key, label: descriptor.label, survivorValue, loserValue },
    }

    const survivorEmpty = isEmptyMergeValue(survivorValue)
    const loserEmpty = isEmptyMergeValue(loserValue)

    if ((survivorEmpty && loserEmpty) || mergeValuesEqual(survivorValue, loserValue)) {
      // Both empty counts as identical, explicitly: `""` on one side and `null` on the other
      // is not a decision, and offering it as one would bury the real conflicts.
      identical.push(ranked)
      continue
    }

    if (survivorEmpty && !loserEmpty) {
      // The locked exception. This is the ONLY group whose default adopts a value from the
      // record being destroyed, which is why M-3 gives it its own visible section.
      filledOnly.push(ranked)
      continue
    }

    if (!survivorEmpty && loserEmpty) {
      // IDENTICAL, not a conflict. The survivor already holds the only value there is, and
      // the alternative on offer would be "delete this value" - which is not what merging
      // two records means and not a question the user came here to answer.
      identical.push(ranked)
      continue
    }

    conflicts.push(ranked)
  }

  return {
    conflicts: sorted(conflicts),
    filledOnly: sorted(filledOnly),
    identical: sorted(identical),
  }
}
