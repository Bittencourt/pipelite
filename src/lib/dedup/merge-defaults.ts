import { CUSTOM_FIELD_PREFIX } from "@/lib/audit/present"

import {
  MERGE_EXCLUDED_COLUMNS,
  type MergeField,
  type MergeFieldGroups,
} from "./field-groups"

/* -----------------------------------------------------------------------------------------
 * PURE. No database client, no clock, no I/O of any kind. See `./field-groups.ts` for why.
 *
 * This module holds ONE rule and its write-side companion. 39-VALIDATION names that rule
 * "the phase's highest-consequence silent default": every other decision on the merge screen
 * is made by a user looking at two values, and this one is made for them. A wrong default
 * writes the wrong value onto a live record, and the `merged` audit entry then reports it as
 * something the user chose.
 * ----------------------------------------------------------------------------------------- */

/** Which of the two records a field's value is taken from. */
export type MergeChoice = "survivor" | "loser"

/**
 * The choice map as it ARRIVES, which is from a browser.
 *
 * Typed with `string` values rather than `MergeChoice` on purpose: this is a boundary type,
 * and declaring the narrow union here would only mean the compiler believed a claim the
 * client made about itself. Narrowing happens at runtime, in `applyMergeChoices`.
 */
export type MergeChoiceMap = Readonly<Record<string, string>>

/** The merged values, split by where they are written. */
export interface MergedValues {
  /**
   * ONLY the compared native columns. Never the survivor's other columns: this is the SET
   * clause of an update, and a column absent here is a column the merge does not touch.
   */
  native: Record<string, unknown>
  /**
   * The COMPLETE blob to store. A JSONB column is written wholesale, so this starts from the
   * survivor's own blob and overwrites only the compared keys - a partial blob here would
   * silently clear every custom field nobody was asked about.
   */
  customFields: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Every compared field, in the order the three sections render. */
function allMergeFields(groups: MergeFieldGroups): MergeField[] {
  return [...groups.conflicts, ...groups.filledOnly, ...groups.identical]
}

/**
 * The pre-selection the merge picker opens with.
 *
 * A direct transcription of the locked decision in 39-CONTEXT § Merge Semantics:
 *
 *   "The field picker pre-selects the survivor's value, except where the survivor's is empty
 *    and the loser's is not."
 *
 * Quoted rather than paraphrased so a future reader can see the rule was copied and not
 * invented. The exception IS `filledOnly` - that group is defined as survivor-empty and
 * loser-populated (39-UI-SPEC M-3), so the "except" clause needs no second emptiness test
 * here, and adding one would be a place for the two to disagree.
 *
 * `identical` fields are in the map even though the picker gives no control for them. They
 * carry the survivor's value, which is also the loser's, so the choice is inconsequential -
 * but their PRESENCE is not: `applyMergeChoices` writes exactly the keys this map names, and
 * an identical field missing from it would be a field quietly dropped from the merged record.
 */
export function resolveMergeDefaults(groups: MergeFieldGroups): Record<string, MergeChoice> {
  const defaults: Record<string, MergeChoice> = {}

  for (const field of groups.conflicts) defaults[field.key] = "survivor"
  for (const field of groups.identical) defaults[field.key] = "survivor"

  // The one place a value is adopted from the record that is about to be destroyed.
  for (const field of groups.filledOnly) defaults[field.key] = "loser"

  return defaults
}

/**
 * The merged values, given the user's answers.
 *
 * TWO INVARIANTS, both of them security properties rather than tidiness:
 *
 * 1. It never emits a key outside the compared set. The loop walks `groups` - built by the
 *    server from the two records - and consults `choices` only for the ANSWER to a question
 *    the server already asked. A crafted choice map naming `passwordHash` therefore writes
 *    nothing, because the iteration never reaches a key the picker did not display (T-39-04).
 *    An excluded column is dropped a second time on the way out, so a group list that somehow
 *    carried one still cannot write `ownerId` or `deletedAt` (T-39-13).
 * 2. It never mutates its inputs. The survivor's blob is copied before anything is written to
 *    it, so a caller can re-run this with different choices and get the same answer.
 *
 * An unrecognised choice VALUE is narrowed back to the default rather than rejected: a merge
 * screen that threw on a stray string would turn a harmless client bug into a lost form, and
 * the default is by construction a value the user was shown.
 *
 * `loser` is not read. Every loser value that can reach the output is one the picker
 * displayed, and `MergeField` already carries it - reading the record again here would open
 * the door to writing a value that was never on the screen. The parameter stays for symmetry
 * with the call site and so the signature does not churn if that ever changes.
 */
export function applyMergeChoices(
  survivor: Record<string, unknown>,
  loser: Record<string, unknown>,
  groups: MergeFieldGroups,
  choices: MergeChoiceMap
): MergedValues {
  void loser

  const defaults = resolveMergeDefaults(groups)

  const survivorBlob = survivor.customFields
  const native: Record<string, unknown> = {}
  const customFields: Record<string, unknown> = isRecord(survivorBlob) ? { ...survivorBlob } : {}

  for (const field of allMergeFields(groups)) {
    const fallback = defaults[field.key] ?? "survivor"
    const answer = choices[field.key]
    const choice: MergeChoice = answer === "survivor" || answer === "loser" ? answer : fallback
    const value = choice === "loser" ? field.loserValue : field.survivorValue

    if (field.key.startsWith(CUSTOM_FIELD_PREFIX)) {
      customFields[field.key.slice(CUSTOM_FIELD_PREFIX.length)] = value
      continue
    }

    if (MERGE_EXCLUDED_COLUMNS.has(field.key)) continue

    native[field.key] = value
  }

  return { native, customFields }
}
