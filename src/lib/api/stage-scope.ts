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
 * THERE IS NO `as SQL` HERE, AND THAT IS DELIBERATE (WR-07). `and(...)` is typed `SQL | undefined`
 * and `.where(undefined)` is an UNFILTERED query. See `requireScopedPredicate` below for the
 * measured statement, and do not reintroduce a cast to silence the type.
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
  // Declared `SQL[]`, so every element is a real term by TYPE rather than by inspection, and
  // `terms.length` below is a trustworthy count of what actually reached the conjunction.
  const terms: SQL[] = [eq(pipelines.ownerId, userId), isNull(pipelines.deletedAt)]

  if (pipelineId) {
    terms.push(eq(stages.pipelineId, pipelineId))
  }

  return requireScopedPredicate(and(...terms), terms.length)
}

/**
 * The number of terms this scope may NEVER be without: the owner equality and the soft-delete guard.
 * The optional `?pipeline_id=` filter is a third, and it is not mandatory.
 */
export const MANDATORY_SCOPE_TERMS = 2

/**
 * WHY THIS EXISTS INSTEAD OF `as SQL`, AND WHY A CAST WAS THE WRONG TOOL HERE.
 *
 * `and(...)` returns `SQL | undefined` — `undefined` when every argument it received was
 * `undefined` — and drizzle treats `.where(undefined)` as NO WHERE CLAUSE AT ALL. Measured against
 * this repository's own schema:
 *
 *     with a predicate: ... inner join "pipelines" on ... where ("pipelines"."owner_id" = $1 and
 *                       "pipelines"."deleted_at" is null)
 *     collapsed:        ... inner join "pipelines" on "stages"."pipeline_id" = "pipelines"."id"
 *
 * No `where`. `GET /api/v1/stages` consumes this one expression for BOTH the page and the count, so
 * that statement is every stage in the database, returned to every caller, with a matching total.
 *
 * The previous shape ended `) as SQL`. A cast is an ASSERTION that the value is never `undefined` —
 * it removes the compiler from the one position where it was guarding a total scope bypass, in a
 * function whose entire job is the security boundary. The future edit that breaks it looks harmless:
 *
 *     return and(
 *       ...(userId ? [eq(pipelines.ownerId, userId)] : []),   // an admin path, a service token
 *       isNull(pipelines.deletedAt),
 *     ) as SQL
 *
 * `tsc` stays green through that, and so does every render assertion in `in-clause.test.ts`, because
 * those only exercise calls that pass a real `userId`.
 *
 * So the narrowing is CHECKED rather than asserted. This function returns `SQL` because the compiler
 * proves it from the `if` below, not because a cast told it to — and the collapsed case becomes a
 * loud throw at the call site instead of a silent unfiltered query. `termCount` is the second half:
 * a predicate can be non-`undefined` and still have lost its owner term, which `and(isNull(...))`
 * alone would be. Both halves are asserted in `src/app/api/v1/stages/__tests__/in-clause.test.ts`.
 *
 * Exported for that reason: an unreachable guard cannot be proven to reject anything.
 */
export function requireScopedPredicate(predicate: SQL | undefined, termCount: number): SQL {
  if (predicate === undefined) {
    throw new Error(
      "ownedStagesPredicate produced no predicate at all. drizzle renders `.where(undefined)` as " +
        "NO WHERE CLAUSE, which would return every stage in the database to every caller."
    )
  }

  if (termCount < MANDATORY_SCOPE_TERMS) {
    throw new Error(
      `ownedStagesPredicate built ${termCount} term(s); the owner equality and the soft-delete ` +
        `guard are both mandatory (${MANDATORY_SCOPE_TERMS}). A conjunction missing the owner term ` +
        "is still a valid predicate and still returns other people's stages."
    )
  }

  return predicate
}
