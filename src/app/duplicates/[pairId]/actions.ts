"use server"

/**
 * THE MERGE ENDPOINT — THE MOST DESTRUCTIVE BROWSER-FACING WRITE IN THE APPLICATION (DEDUP-03).
 *
 * THIS FILE IS THE SECOND HALF OF THE GATE, AND IT IS NOT REDUNDANT WITH THE FIRST.
 * `src/app/duplicates/layout.tsx` redirects a non-admin away from every page RENDER in the
 * subtree, `/duplicates/[pairId]` included — a layout renders for every nested route, so this
 * route inherits that control unchanged and adds none of its own. What a layout redirect cannot
 * do is protect a server action, which is a POST endpoint the browser can invoke with no page
 * render involved (`src/app/admin/audit/actions.ts:6-10` records the same fact for `/admin/*`).
 * So the admin role is re-checked at the top of the exported function below, in the same order
 * the six actions in `src/app/duplicates/actions.ts` check it.
 *
 * WHY THIS IS ITS OWN MODULE rather than a seventh export of the parent `actions.ts`: plan 39-13
 * and this plan ran as parallel worktree siblings in the same wave, and a shared module would
 * have been a shared edit. The parent file's derived source gate covers its own six; this file
 * carries its own assertions in `src/app/duplicates/__tests__/merge-form-wiring.test.ts`.
 *
 * ORDER: SESSION, ROLE, ARGUMENTS, THE PAIR, THEN THE ACTOR SCOPE (T-36-02). `runWithActor` opens
 * only after every check has passed, so a refused call establishes no actor at all.
 *
 * NOTHING HERE TRUSTS ITS ARGUMENTS, AND THAT INCLUDES THE ENTITY TYPE.
 * `mergeRecordsMutation` needs to know whether it is merging organizations or people, and the
 * browser is not asked: the value is read off the `duplicate_pairs` row this merge names. A
 * client-supplied entity type would be a way to point the merge's reads and writes at the wrong
 * table entirely, so the parameter simply does not exist on this boundary (T-39-04).
 *
 * THE FAILURE VOCABULARY IS CODES, NOT PROSE — the parent module's `DedupActionResult` shape,
 * imported as a TYPE so no runtime import crosses between two `"use server"` modules. A driver's
 * error string never reaches the browser: the mutation's `catch` already collapses a 23505 naming
 * `notes_migration_uniq` into a fixed sentinel, and this file maps codes only (T-39-03).
 */

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"

import { auth } from "@/auth"
import { db } from "@/db"
import { duplicatePairs } from "@/db/schema"
import { runWithActor } from "@/lib/audit/actor-context"
import type { MergeChoiceMap } from "@/lib/dedup/merge-defaults"
import type { MergeableEntityType } from "@/lib/dedup/types"
import { mergeRecordsMutation } from "@/lib/mutations/dedup"

// The failure vocabulary and the result envelope are the parent module's. Re-declaring them here
// would be a second definition of the same union, and the UI switches on ONE set of codes.
import type { DedupActionResult } from "../actions"

const LOG_PREFIX = "[merge-action]"

/** What the merge screen submits. Every field of it arrives from a browser. */
export interface MergeRecordsRequest {
  pairId: string
  survivorId: string
  loserId: string
  /**
   * The user's per-field answers. `Record<string, string>` because it is a boundary value; the
   * narrowing below is what turns it into something the mutation may act on.
   */
  choices: Record<string, string>
}

export type MergeRecordsActionResult = DedupActionResult<{
  movedChildren: number
  loserName: string
}>

/**
 * A BARE SHAPE TEST, NOT A UUID PATTERN — `src/app/duplicates/actions.ts`'s `parseRecordId`
 * verbatim, including its reasoning: every id this surface handles is a `uuid`-shaped `text`
 * column today, but a parser that encodes that assumption becomes wrong the moment one key type
 * changes, and the value's only job here is to be a bindable parameter. The ceiling stops a
 * megabyte string being carried into a query and a log line; the non-empty test stops `""`, which
 * is a legal `string` and matches nothing.
 *
 * NOT IMPORTED from the parent module on purpose: it is a private helper there, and exporting it
 * would add a non-action export to a `"use server"` module.
 */
const MAX_RECORD_ID_LENGTH = 64

function parseRecordId(raw: unknown): string | null {
  return typeof raw === "string" && raw.length > 0 && raw.length <= MAX_RECORD_ID_LENGTH
    ? raw
    : null
}

/**
 * The two answers a field can have, as a frozen membership test rather than a type annotation.
 *
 * `MergeChoice` is a type and therefore not a control. A `find` over frozen literals rather than
 * an object lookup, so `__proto__` is an ordinary non-member.
 */
const MERGE_CHOICES: readonly string[] = Object.freeze(["survivor", "loser"])

/**
 * How many field answers one merge may carry, and how long a field key may be.
 *
 * BOUNDED BECAUSE THE MAP IS NOT. The compared field set is the record's native columns plus one
 * key per custom field name — on this deployment that is tens of keys, not thousands. Without a
 * ceiling a single POST could hand this function an arbitrarily large object to iterate and log.
 * The key LENGTH bound is the same idea one level down: a key is a column name or
 * `customFields.<user-authored name>`, and 128 characters is well past every real one.
 *
 * A key the server never computed writes nothing regardless — `applyMergeChoices` walks the
 * server-built group list and consults `choices` only for the ANSWER to a question it already
 * asked (T-39-04). These bounds are about the cost of the call, not about what it can write.
 */
const MAX_MERGE_CHOICES = 200
const MAX_CHOICE_KEY_LENGTH = 128

/**
 * The choice map, or `null` when it is not one.
 *
 * STRICT ABOUT VALUES, deliberately, even though `applyMergeChoices` narrows an unrecognised
 * value back to the default rather than throwing. That leniency exists so a client bug cannot
 * destroy a filled-in form; it is not a licence for this boundary to forward whatever arrived.
 * The merge screen only ever sends the two literals, so anything else is a crafted request and
 * refusing it outright is the honest answer.
 */
function parseChoices(raw: unknown): MergeChoiceMap | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null

  const entries = Object.entries(raw as Record<string, unknown>)

  if (entries.length > MAX_MERGE_CHOICES) return null

  const choices: Record<string, string> = {}

  for (const [key, value] of entries) {
    if (key.length === 0 || key.length > MAX_CHOICE_KEY_LENGTH) return null
    if (typeof value !== "string") return null
    if (MERGE_CHOICES.find((choice) => choice === value) === undefined) return null

    choices[key] = value
  }

  return choices
}

interface PairMembers {
  entityType: MergeableEntityType
  recordAId: string
  recordBId: string
}

/**
 * Collapse two duplicate records into one, on the user's instructions (DEDUP-02, DEDUP-03).
 *
 * THE PAIR IS RE-READ AND ITS MEMBERSHIP RE-VALIDATED HERE, AND THAT IS NOT REDUNDANT WITH THE
 * MUTATION'S OWN CHECK (39-VALIDATION V-9, T-39-02). Two controls at two layers, both required,
 * for two different reasons:
 *
 *   - This one, because the action is reachable by a crafted POST. `pairId`, `survivorId` and
 *     `loserId` all arrive from a browser, and without a membership test a request naming one
 *     pair and the ids of two unrelated records would merge anything into anything — the one
 *     tampering path in this phase whose success the user cannot undo.
 *   - The mutation's, at `src/lib/mutations/dedup.ts` step "39-VALIDATION V-9 / T-39-02", because
 *     `mergeRecordsMutation` is an exported library function reachable from a future call site —
 *     a workflow action, a CLI, a second screen — none of which passes through this file.
 *
 * Neither may be "tidied up" into the other. The re-read also supplies the entity type, which is
 * therefore a fact about the stored pair rather than a claim by the caller.
 */
export async function mergeRecords(
  input: MergeRecordsRequest
): Promise<MergeRecordsActionResult> {
  const session = await auth()

  if (!session?.user?.id) {
    return { success: false, code: "NOT_AUTHENTICATED" }
  }

  if (session.user.role !== "admin") {
    return { success: false, code: "NOT_ADMIN" }
  }

  const pairId = parseRecordId(input?.pairId)
  const survivorId = parseRecordId(input?.survivorId)
  const loserId = parseRecordId(input?.loserId)
  const choices = parseChoices(input?.choices)

  if (pairId === null || survivorId === null || loserId === null || choices === null) {
    return { success: false, code: "INVALID" }
  }

  const userId = session.user.id

  let pair: PairMembers

  try {
    const [row] = await db
      .select({
        entityType: duplicatePairs.entityType,
        recordAId: duplicatePairs.recordAId,
        recordBId: duplicatePairs.recordBId,
      })
      .from(duplicatePairs)
      .where(eq(duplicatePairs.id, pairId))
      .limit(1)

    if (!row) {
      // A pair that is not there names nothing mergeable, and gets the same answer as a pair whose
      // members do not match — see the code mapping at the end of this function for why.
      return { success: false, code: "PAIR_GONE" }
    }

    pair = row
  } catch (error) {
    console.error(`${LOG_PREFIX} could not read pair ${pairId}:`, error)
    return { success: false, code: "FAILED" }
  }

  /*
   * THE MEMBERSHIP CONTROL. The survivor and the loser must be the pair's two members, and must
   * not be the same record.
   *
   * `duplicate_pairs` canonicalises `(recordAId, recordBId)` in lexicographic order, so which side
   * an id sits on carries no meaning and a set comparison is the right test. The distinctness test
   * is folded in here rather than answered separately: the two stored members are distinct by
   * construction, so a request whose survivor equals its loser fails this test for the same reason
   * a request naming an outsider does, and therefore gets the same answer. A self-merge would
   * soft-delete the record it had just updated and reparent its children onto themselves.
   */
  const members = [pair.recordAId, pair.recordBId]
  const membersMatch =
    survivorId !== loserId && members.includes(survivorId) && members.includes(loserId)

  if (!membersMatch) {
    // Identifiers only (T-37-09), and answered with the same code a stale screen gets.
    console.error(
      `${LOG_PREFIX} pair ${pairId} does not hold both of ${survivorId} and ${loserId}`
    )
    return { success: false, code: "PAIR_GONE" }
  }

  /*
   * THE ACTOR SCOPE OPENS HERE AND NOT ONE LINE EARLIER. Every audit row the merge writes — the
   * survivor's `merged` entry, the loser's, and one per reparented child — takes its actor from
   * this store, so a merge performed by a user must never fall back to the audit subscriber's
   * `system` attribution. It wraps the whole mutation because those rows are written inside the
   * mutation's own transaction.
   */
  const result = await runWithActor({ kind: "user", userId }, () =>
    mergeRecordsMutation({
      entityType: pair.entityType,
      pairId,
      survivorId,
      loserId,
      choices,
    })
  )

  if (!result.success) {
    /*
     * THE CODE MAPPING, AND THE ONE PROPERTY IT EXISTS TO PRESERVE (T-39-37).
     *
     * `NOT_FOUND`, `SAME_RECORD` and `NOT_IN_PAIR` all become `PAIR_GONE` — the code the screen
     * renders as `dedup.merge.gone`. They are three different facts to the mutation and must be
     * ONE fact to the browser: if a crafted request could tell "that pair does not contain that
     * id" apart from "one of these records has been deleted", the response would be an oracle for
     * probing which of the two ids was wrong. A stale screen and an attack get the same sentence.
     *
     * `FAILED` stays `FAILED` — `dedup.merge.failed`, whose copy says nothing was changed, which
     * is true because the merge is one transaction.
     */
    const code = result.error === "FAILED" ? "FAILED" : "PAIR_GONE"

    // The mutation has already logged the real error under its own prefix; this line records the
    // refusal at the boundary, in identifiers and its own code only.
    console.error(`${LOG_PREFIX} merge of pair ${pairId} refused: ${result.error}`)

    return { success: false, code }
  }

  /*
   * The review list has one fewer open pair, and possibly several fewer: the mutation also retires
   * every other still-open pair naming the loser as `superseded`. A cached list would keep offering
   * a merge screen for a record that is now in Trash.
   */
  revalidatePath("/duplicates")

  return {
    success: true,
    movedChildren: result.movedChildren,
    loserName: result.loserName,
  }
}
