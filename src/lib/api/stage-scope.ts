/**
 * THE OWNER-SCOPING PREDICATE FOR STAGE READS ON `/api/v1`.
 *
 * WHY THIS IS ONE EXPORTED EXPRESSION AND NOT TWO INLINE `and(...)` CALLS.
 *
 * `GET /api/v1/stages` needs the same scope in two places: the page query and the `meta.total`
 * count. Written inline they were two predicates, and they DRIFTED — the count was scoped by an
 * `innerJoin` on `pipelines.owner_id` while the page was a global, unscoped `stages` page filtered
 * in JavaScript afterwards. Measured consequence: `?limit=5` returned `data: []` alongside
 * `meta.total: 1` for the stage's OWN owner. A total that does not bound its own page is not a
 * total. One definition is the only structural guarantee that the two cannot disagree, and it is
 * the thing the route's tests compare by compiled render.
 *
 * WHAT IT REPLACED, AND WHY THAT MATTERS (QG-03).
 *
 * The previous shape paginated the whole `stages` table, collected the resulting page's pipeline
 * ids into a JavaScript array, and interpolated that array into a raw SQL fragment:
 *
 *     sql`${pipelines.id} IN ${pipelineIds}`
 *
 * `parsePagination` clamps `offset` at zero and imposes NO ceiling, so any `?offset=` at or past
 * the global stage count produced an empty page, therefore an empty array, therefore the statement
 * text `"pipelines"."id" IN ()` — which PostgreSQL rejects outright with
 * `42601 syntax error at or near ")"`. That was a live 500 reachable from the public API with a
 * single query parameter. The array is now gone entirely: ownership is a static join condition, so
 * there is no runtime-sized list to render into the statement and no empty case to guard.
 *
 * A NOTE ON HOW FAR TO TAKE THAT. For NON-empty arrays drizzle expanded the values into
 * placeholders rather than splicing them, so the raw fragment was an availability and robustness
 * defect, NOT a SQL-injection defect. Do not restate it as one.
 *
 * THE CALLER ID IS ALWAYS A BOUND PARAMETER. `eq()` emits a placeholder; the id never becomes part
 * of the statement text. `in-clause.test.ts` asserts exactly that against the compiled render, and
 * asserts that no rendering of this predicate matches an empty `IN ()` in any form.
 *
 * THE NAME IS PINNED. `ownedStagesPredicate` is referenced by the `/api/v1` authorization
 * regression gate (plans 48-05 and 48-08) as a known authorizer. Renaming it here silently removes
 * this route from that gate's coverage.
 *
 * IT LIVES HERE RATHER THAN IN THE ROUTE because Next.js validates the export surface of a
 * `route.ts`: a non-verb export fails the build's route type check.
 */
import { and, eq, isNull, type SQL } from "drizzle-orm"
import { stages, pipelines } from "@/db/schema"

/**
 * Every stage belonging to a pipeline this caller owns, optionally narrowed to one pipeline.
 *
 * Intended to be applied to a query that has already joined `stages` to `pipelines` — the owner
 * and soft-delete columns it names live on `pipelines`, not on `stages`.
 *
 * @param userId - The authenticated caller (`ctx.userId`). Bound as a parameter, never interpolated.
 * @param pipelineId - The optional `?pipeline_id=` filter. When null or empty the scope is every
 *   pipeline the caller owns.
 */
export function ownedStagesPredicate(
  userId: string,
  pipelineId?: string | null
): SQL {
  return and(
    eq(pipelines.ownerId, userId),
    isNull(pipelines.deletedAt),
    ...(pipelineId ? [eq(stages.pipelineId, pipelineId)] : [])
  ) as SQL
}
