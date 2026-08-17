/**
 * THE ONE PLACE THAT STATES HOW MANY IDS A SINGLE BULK CALL MAY CARRY.
 *
 * WHY 100. It is not a new number: `src/app/api/v1/organizations/batch/route.ts:8` (and its three
 * sibling batch routes) already declare `const MAX_BATCH_SIZE = 100` and reject anything larger.
 * Bulk delete and bulk reassign are the same shape of request arriving through a server action
 * instead of a REST route, so they continue the existing cap rather than inventing a second,
 * different one that a reader would have to reconcile.
 *
 * THIS MODULE MUST NEVER ACQUIRE AN IMPORT. Not a type import, not a re-export — nothing. The
 * `"use client"` bulk action bar imports it so its select-all can stop at the same number the
 * server enforces, and a client component's import graph is its bundle. One transitive `@/db`
 * import from here drags `pg` into the browser bundle for every route that renders a list. Its
 * sibling `types.ts` carries the same rule; the server-only routing that DOES import `@/db` lives
 * in `dispatch.ts`, which is a separate file for exactly this reason. Compare
 * `src/lib/trash/entity-types.ts`, which is the client-safe sibling of `src/lib/trash/dispatch.ts`
 * under the same split.
 *
 * THE SERVER ENFORCES THE CAP; THE CLIENT MIRROR IS ADVISORY ONLY. A server action is a POST
 * endpoint, so a caller can hand it 50,000 ids without going near the bulk bar — a client-only cap
 * is not a cap at all, it is a hint. Every bulk server action re-checks `ids.length` against this
 * constant and refuses with `{ success: false, error: "too_many", max: BULK_MAX_IDS }`. The bar
 * reads the same constant so the number in the copy and the number in the guard cannot drift.
 *
 * This is load-bearing on Deals in the ordinary case, not only in the abuse case: `/deals` has no
 * pagination, the live database holds 25,195 live deals, and its largest single stage holds 10,495,
 * so a per-stage select-all is over-cap on the first click (38-CONTEXT, corrected during
 * 38-RESEARCH).
 */

/** Maximum number of record ids accepted by one bulk delete or bulk reassign call. */
export const BULK_MAX_IDS = 100
