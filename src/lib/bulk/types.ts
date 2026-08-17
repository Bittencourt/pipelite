/**
 * THE SHARED VOCABULARY OF A BULK OPERATION — the contract the server actions produce and the
 * `"use client"` bulk bar, dialogs and failure report consume.
 *
 * THIS MODULE MUST NEVER ACQUIRE AN IMPORT, for the reason spelled out in its sibling `limits.ts`:
 * the bulk bar and the failure report are client components, so anything reachable from here is in
 * the browser bundle. It declares types only, so there is nothing here to import in the first place
 * — keep it that way. The server-only routing that does import `@/db` lives in `dispatch.ts`.
 *
 * Every type below is deliberately CLOSED. No arm of any union carries a free-form string that
 * originated on the server.
 */

/**
 * Why a record failed, as a code the client renders through `bulk.reason.*`.
 *
 * A CLOSED SET, AND THAT IS THE POINT. The alternative — forwarding the mutation's own
 * `{ success: false, error }` string — fails twice over. It is untranslatable, because a message
 * composed in `src/lib/mutations/*.ts` never passes through `next-intl`, so a non-English UI would
 * render an English sentence next to translated copy. And it is an information-disclosure vector
 * (T-38-07): those messages are written for a server log and may name a table, a constraint or a
 * Postgres error, none of which belongs in a browser. This union has no string arm, so there is no
 * code path along which a raw server message can reach the client at all — the guarantee is
 * structural rather than a review habit.
 *
 *   notFound       — the per-record read matched nothing the caller may act on.
 *   notPermitted   — the record exists but the caller's ownership predicate refused it.
 *   alreadyDeleted — the record was already in Trash.
 *   unknown        — the mutation refused for a reason the action cannot classify. Deliberately
 *                    opaque; the detail stays in the server log.
 *
 * ON `alreadyDeleted` BEING UNREACHABLE ON THE DELETE PATH. It is, today, and that is recorded here
 * rather than left for a reader to discover: every `delete{Entity}Mutation` scopes its existence
 * read with `isNull(deletedAt)`, so a record that is already in Trash simply does not match and the
 * mutation returns its "not found" refusal. The bulk action therefore maps that miss to `notFound`.
 * Telling the two apart would require a SECOND read without the `deletedAt` predicate, per record,
 * purely to produce a nicer label (38-RESEARCH A6) — not worth an extra query per id.
 *
 * The key nevertheless stays in the union and in the copy contract for two reasons. The REASSIGN
 * path can produce it (its own read is also `deletedAt`-scoped, but a future second-read variant, or
 * a record trashed between the list render and the submit, is exactly this case), and any future
 * variant that does take the second read must not have to widen the union to report it. More
 * importantly, the collapse must go in this direction and no other: mapping a PERMISSION failure
 * onto "Already in Trash" would tell a user their colleague's record is deleted when it is not, and
 * that is a worse lie than collapsing two flavours of "gone" into one.
 */
export type BulkFailureReason = "notFound" | "notPermitted" | "alreadyDeleted" | "unknown"

/** One record that did not go through, paired with the code explaining why. */
export interface BulkFailure {
  id: string
  reason: BulkFailureReason
}

/**
 * Why the WHOLE CALL was refused before any record was touched.
 *
 * Distinct from `BulkFailureReason` on purpose — these are not per-record outcomes, they are
 * pre-flight refusals, and conflating the two would let a client render "3 of 12 failed" for a
 * request in which nothing was ever attempted.
 *
 *   not_authenticated — no session. Nothing was read and nothing was written.
 *   too_many          — `ids.length` exceeded `BULK_MAX_IDS` (see `limits.ts`).
 *   invalid_owner     — the reassign target is not an approved, non-deleted user.
 *   no_selection      — an empty id array. Refused rather than treated as "all records", which is
 *                       the shape a scoped operation must never silently widen into.
 */
export type BulkErrorCode = "not_authenticated" | "too_many" | "invalid_owner" | "no_selection"

/**
 * What every bulk server action returns.
 *
 * The success arm is a PARTIAL result by design: bulk delete and bulk reassign run per-record and
 * best-effort, not as one all-or-nothing transaction, because a single aborting transaction
 * structurally cannot name which record failed (38-CONTEXT § Bulk Delete). `success: true` with a
 * non-empty `failed` is therefore an ordinary outcome, not a contradiction — it means the call ran.
 *
 * `max` is populated ONLY for `too_many`, so the client can render `bulk.error.tooMany` with the
 * real number instead of hard-coding 100 in the copy and drifting from `BULK_MAX_IDS`.
 */
export type BulkWriteResult =
  | { success: true; succeeded: string[]; failed: BulkFailure[] }
  | { success: false; error: BulkErrorCode; max?: number }

/** Which bulk write ran, for a report that must name the operation in its copy. */
export type BulkOperationKind = "delete" | "reassign"

/**
 * The client's view of a completed bulk operation — a `BulkWriteResult` success arm plus the one
 * thing only the client can supply.
 */
export interface BulkOutcome {
  kind: BulkOperationKind
  succeeded: string[]
  failed: BulkFailure[]
  /**
   * id -> display name, captured AT SUBMIT TIME by the client, never returned by the server
   * (38-RESEARCH Pattern 3).
   *
   * The failure report has to name records, and a record that failed with `notFound` is by
   * definition absent from the next server render — so asking the server to echo labels back would
   * produce exactly no label for exactly the rows that need one. The client still holds the array it
   * submitted from, so it captures the labels before the call and keeps them afterwards. This is
   * also why the server's response carries ids and codes only: it never has to be trusted with
   * display text.
   */
  labelById: Record<string, string>
}
