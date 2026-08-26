/**
 * CR-01 — the sentinel a purge transaction throws when its row `DELETE` matched nothing.
 *
 * ## What it is for
 *
 * All four purge mutations (`src/lib/mutations/{organizations,people,deals,activities}.ts`) carry
 * `isNotNull(deletedAt)` on the row `DELETE`, so the statement CAN legitimately match zero rows —
 * and until this sentinel existed, nothing read the count. There was no `.returning()`, no rowcount
 * and no early exit.
 *
 * The window is between each mutation's pre-fetch and its transaction, and it is reachable twice
 * over: from two browser tabs, because Restore and Purge Forever sit side by side in `/trash`; and
 * from the unattended daily pruner, which works a batch of up to 200 expired ids one record at a
 * time (`./prune.ts`). A restore landing in that window left a **LIVE** record whose notes had been
 * deleted, whose live children had been silently detached, and whose attachment bytes had been
 * irreversibly `unlink`ed — with `{ success: true, detached: N }` returned and a `__purge` audit row
 * written claiming the purge happened.
 *
 * The mismatch log could not catch it. `deleted === blobRefs.length` held: every ref the purge
 * collected really was deleted. It was the RECORD that was not gone.
 *
 * A second, cheaper instance of the same missing check: two concurrent purges of the same id both
 * reported success and both wrote a `__purge` audit row, because the loser of the race also
 * committed a transaction whose `DELETE` matched nothing.
 *
 * ## Why a THROW and not a returned flag
 *
 * Throwing does two things a `{ purged: false }` return cannot:
 *
 *  1. It ROLLS THE WHOLE TEARDOWN BACK. The notes deletion and the child detach must not survive a
 *     purge that did not happen either — those are writes against LIVE rows the caller never
 *     selected, which is the widest part of the blast radius.
 *  2. It makes the post-commit unlink block UNREACHABLE BY CONSTRUCTION rather than by a condition
 *     someone has to remember to write. Control leaves through the outer `catch`, so there are no
 *     four separate `if (purged)` statements to keep in step across four files — and "the
 *     post-commit block runs unconditionally" was the root cause the review named for all three of
 *     this phase's criticals.
 *
 * ## Why it lives here rather than four times over
 *
 * ONE constant, imported by all four mutations, because four string literals in four files is
 * exactly how two of them come to disagree. `GONE_INSIDE_TRANSACTION` in
 * `src/lib/mutations/dedup.ts` is the in-repo precedent for the idiom itself: a fixed sentinel
 * string, mapped in the outer `catch` to a code the caller already understands, never the driver
 * message.
 *
 * This module has NO imports on purpose. `./dispatch.ts` imports the four mutations, so a sentinel
 * declared there would be a cycle; a leaf with zero imports cannot be one.
 *
 * ## What the caller sees
 *
 * Each mutation's outer `catch` maps this to the `{ success: false, error: "NOT_IN_TRASH" }` it
 * ALREADY returns when the pre-fetch itself misses. `PurgeResult` (`./dispatch.ts`) is therefore
 * unchanged, and the eleven exact `toEqual({ success: true, detached: N })` assertions across the
 * four mutation test files are untouched by construction.
 */
export const NOT_IN_TRASH_INSIDE_TRANSACTION = "__purge_not_in_trash__"
