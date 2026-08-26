import {
  CUSTOM_FIELD_PREFIX,
  describeField,
  isFileDescriptor,
  type AuditResolution,
  type FieldDescriptor,
} from "@/lib/audit/present"
// WR-01. `formula-helpers.ts` imports no database client — a test greps it for a database-alias
// import and fails if one appears — so naming its predicate here keeps this module browser-safe.
import { isFormulaWrapper } from "@/lib/formula-helpers"
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
 * - `normName`, `normEmail`, `normPhone` - GENERATED ALWAYS columns, added by plan 39-05 in
 *   migration 0017 AFTER this set was written (the two plans were wave-1 siblings in separate
 *   worktrees and could not see each other). Three consequences, all bad, and all fixed by
 *   this entry: the merge picker would ask a user to choose between two normalized names; the
 *   `merged` audit entry would report the answer as a field the user picked; and - decisively -
 *   the survivor UPDATE would carry `SET norm_name = …`, which PostgreSQL rejects with
 *   SQLSTATE 428C9 (`column "norm_name" can only be updated to DEFAULT`), failing EVERY
 *   organization and person merge. The database maintains these values from `name` / `email` /
 *   `phone`; picking those columns is how a user picks the normalized form.
 *
 *   Listed by NAME rather than derived from the Drizzle tables on purpose: this module is
 *   database-free so it can be imported from a `"use client"` component (see the header), and
 *   `getTableColumns` would drag the schema - and through it `drizzle-orm/pg-core` - into a
 *   browser bundle. The drift alarm is a unit test instead: `dedup.test.ts` asserts that every
 *   generated column of both mergeable tables appears in this set, and `mergeRecordsMutation`
 *   independently filters generated columns out of its SET clause, so a fourth generated column
 *   fails a test rather than a merge.
 *
 * `Object.freeze` on a `Set` seals its properties, not its contents; the `ReadonlySet` type
 * is what actually stops `.add` at compile time. Both are here on purpose - one guards the
 * reader, the other guards the compiler.
 */
export const MERGE_EXCLUDED_COLUMNS: ReadonlySet<string> = Object.freeze(
  new Set([
    "id",
    "createdAt",
    "updatedAt",
    "deletedAt",
    "customFields",
    "ownerId",
    "normName",
    "normEmail",
    "normPhone",
  ])
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

/**
 * CR-02 — a compared custom key whose value on EITHER side is a set of stored file descriptors.
 *
 * ## The failure this closes
 *
 * A blob's on-disk location is `${UPLOAD_DIR}/${entityId}/${fieldName}/${storedName}`, where
 * `entityId` is the record it was uploaded AGAINST (`src/app/api/upload/route.ts:92-101`). Every
 * `customFields` key used to be a compared merge field, so the merge copied the descriptor object —
 * `storedName`, `path` and `publicUrl` all naming the LOSER — onto the survivor and touched neither
 * the bytes, nor the loser's own blob, nor the descriptor's `publicUrl`. Two live records then
 * referenced one file.
 *
 * A purge collects its refs blindly from the row it is destroying (by design: see
 * `src/lib/trash/collect-file-field-refs.ts` for why a definition-driven walk would MISS blobs)
 * with no notion that another row holds the same `storedName`. So 30 days later the retention
 * pruner unlinked, unattended, the bytes a LIVE record was still showing — and
 * `deleted === expected` held, so the mismatch log stayed silent. The mirror image was equally bad:
 * purging the SURVIVOR first built `${UPLOAD_DIR}/${survivorId}/…`, which never existed, and
 * `delete-entity-files.ts` counts an already-absent file as deleted, so the purge reported full
 * success while the loser's bytes remained forever.
 *
 * The merge was the ONLY way two CRM rows could come to share a `storedName`, so this is the single
 * hole in the "a blob belongs to exactly one row" premise the whole SC-2 design rests on.
 *
 * ## WHY THE TEST IS THE VALUE SHAPE AND NOT THE DEFINITION TYPE
 *
 * The obvious fix is to ask the definition: `describeField` already resolves it, and a
 * `type='file'` definition yields `descriptor.kind === "files"`. THAT FIX WOULD BE VACUOUS ON THE
 * PATH THAT MATTERS. `mergeRecordsMutation` (`src/lib/mutations/dedup.ts:309-320`) calls
 * `buildMergeFieldGroups` with a DELIBERATELY EMPTY `AuditResolution` — `customFieldTypes` is
 * `new Map()` — because it needs the key set and the partitioning, not labels. So `describeField`
 * returns `kind: "auto"` for every custom field there, and a type-based exclusion would never fire
 * in the mutation. Measured: with the type test substituted for this one, five of the eight CR-02
 * cells in `./field-groups.test.ts` redden, INCLUDING the one named for the mutation's call shape.
 *
 * Worse than vacuous: the merge SCREEN (`src/app/duplicates/[pairId]/page.tsx:373-377`) passes a
 * REAL resolution, and under that same substitution its cell stays GREEN. A type-based exclusion
 * would therefore fire on the screen and not in the mutation — the picker would stop offering the
 * field while the mutation went on writing it from its `filledOnly` default. The screen and the
 * mutation MUST agree on the compared key set, which they do today only because every rule in this
 * module is resolution-independent. This one is too.
 *
 * It also closes a hole the type test could not: `getActiveFieldDefinitions` filters
 * `isNull(deletedAt)`, so a definition that was soft-deleted or RETYPED no longer appears while its
 * VALUES remain in the column. A definition-driven exclusion would wave those descriptors straight
 * through.
 *
 * ## `.some`, not `.every`
 *
 * A `multi_select` stores an array of strings and can never satisfy `isFileDescriptor`, so `.some`
 * has no false positive on any value the product produces. `.every` would let a MIXED array — one
 * descriptor beside one string, which is a corrupted blob rather than an impossible one — carry a
 * descriptor across. Refusing the whole key costs the survivor its own value for that key at worst,
 * which is a choice a user can redo; adopting the descriptor is irreversible.
 *
 * ## The empty case is deliberately NOT excluded
 *
 * `null`, `undefined` and `[]` are the field being empty, and nothing about them says "file". Such
 * a key falls through to the ordinary partitioning, lands in `identical` (both empty), and
 * `applyMergeChoices` writes the survivor's own empty value. No descriptor can move, so there is
 * nothing to refuse — and excluding it would need a definition read this module cannot make.
 *
 * ## What it costs, stated
 *
 * A MERGE NO LONGER MOVES ATTACHMENTS. The loser's files stay on the loser, which goes to Trash
 * with them intact and restorable for the whole retention window; the survivor keeps its own. That
 * is the honest trade against the two alternatives: re-homing the bytes puts filesystem I/O on the
 * merge's critical path and, done post-commit best-effort, leaves the survivor pointing at the
 * loser's directory whenever the copy fails — the same defect with a smaller window. Making the
 * purge reference-aware keeps the bytes but leaves the survivor displaying an attachment that
 * `findOwnedRecordById` refuses (the loser is trashed), i.e. a record still pointing at bytes it
 * does not own.
 */
function isFileMergeValue(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.some(isFileDescriptor)
}

/**
 * WR-01 — a compared custom key whose value on EITHER side is a STORED FORMULA RESULT.
 *
 * ## The failure this closes
 *
 * `survivorChangedFields` in `src/lib/mutations/dedup.ts` is built from the values that CHANGED,
 * and `scopeFormulasToChangedFields` selects a formula only when one of its **refs** is in that set.
 * A formula's own name being in `changedFields` selects nothing — there is no branch that looks for
 * it, by design.
 *
 * But the merge writes `customFields` WHOLESALE, and a `formula`-typed key used to be a compared
 * merge field like any other whose `filledOnly` default is the LOSER. So the merge could overwrite
 * the survivor's derived value with the loser's while none of that formula's inputs changed, and
 * the post-commit recalculation would then CORRECTLY decide there was nothing to recompute.
 *
 * The survivor was left permanently storing a derived value its own inputs contradict — DATA-01, in
 * the block written to close DATA-01 — and a formula value the SERVER DID NOT COMPUTE, which is the
 * T-34-04 invariant every other write path in the product enforces through `stripFormulaKeys`
 * (`saveFieldValues` and every `/api/v1` route merge). The merge picker was the one write path with
 * no equivalent.
 *
 * Reachable with no click at all: a formula definition added AFTER the survivor's last save leaves
 * the survivor with no key for it while the loser, saved later, has one — survivor-empty and
 * loser-populated is `filledOnly`, whose default is the loser.
 *
 * ## Why the SHAPE and not the definition type, again
 *
 * The same argument as `isFileMergeValue`'s, and it applies with the same force: the mutation passes
 * an EMPTY `AuditResolution` and the screen passes a real one, so a `descriptor.kind`-based test
 * would be vacuous where it matters and would make the two call sites disagree about the compared
 * key set. `isFormulaWrapper` is `src/lib/formula-helpers.ts`'s exported predicate, documented there
 * as "the single place that shape is understood", and that module imports no database client — which
 * is what keeps this one importable from a `"use client"` component.
 *
 * It also covers the retyped/soft-deleted definition, exactly as the file case does.
 *
 * ## Refusing the key is only HALF the fix
 *
 * With the key refused, the survivor keeps its OWN stored value (the blob is copied wholesale before
 * anything is written to it), or keeps having none. That already satisfies SC-3 — the value is
 * consistent with inputs that did not change — but it leaves a never-computed key blank right after
 * a merge in which the loser visibly had a value. So `mergeRecordsMutation` also adds
 * `CHANGED_FIELDS_CUSTOM_SENTINEL` to `survivorChangedFields` when the loser held a formula value
 * differing from the survivor's, which makes the post-commit block COMPUTE it. The two halves are
 * deliberately in different modules: refusing the write is a partitioning rule and belongs here;
 * deciding to recompute needs the engine and belongs there.
 */
function isFormulaMergeValue(value: unknown): boolean {
  return isFormulaWrapper(value)
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

    // CR-02. A file value is REFUSED as a compared field outright: not offered in any group, so
    // `applyMergeChoices` never emits the key and a choice map naming it writes nothing (the same
    // property T-39-13 gives `MERGE_EXCLUDED_COLUMNS`). The survivor's blob is copied wholesale
    // before anything is written to it, so its OWN file value stands untouched.
    //
    // Restricted to custom keys: no native column of either mergeable table can hold a descriptor,
    // and narrowing the test is what keeps `name`/`website`/`notes` out of its reach entirely.
    //
    // See `isFileMergeValue` for why this is a value-shape test and why a definition-type test —
    // the obvious fix, and the one the review suggested — would be vacuous in the mutation and
    // divergent on the screen.
    //
    // WR-01 rides on the same `continue` for the same reason: a stored formula result is a value
    // the SERVER derives, so it is not a question a user gets to answer and not a value a choice
    // map gets to set. Refusing it here is what stops the merge writing a derived value its own
    // inputs contradict; `mergeRecordsMutation` then asks the engine to COMPUTE the survivor's.
    if (
      key.startsWith(CUSTOM_FIELD_PREFIX) &&
      (isFileMergeValue(survivorValue) ||
        isFileMergeValue(loserValue) ||
        isFormulaMergeValue(survivorValue) ||
        isFormulaMergeValue(loserValue))
    ) {
      continue
    }

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
