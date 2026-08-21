/**
 * THE SAVED-VIEW READ QUERIES — and the one place private-view visibility is enforced.
 *
 * SERVER ONLY. This module imports `@/db`, and through it `postgres`, so it may never be imported
 * from a `"use client"` file. `src/lib/views/url-params.ts` states the mirror-image constraint for
 * the same boundary: the parser has no database import precisely so the six client writers can use
 * it. The bar receives PROPS (Rule B-2); it never reaches for these functions.
 *
 * ---------------------------------------------------------------------------------------------
 * THE VISIBILITY PREDICATE IS `ownerId = viewer OR isShared`, AND IT HAS NO ADMIN BRANCH.
 *
 * THE ABSENCE OF THAT BRANCH IS THE DECISION, not an oversight, so it is written down here rather
 * than left to be inferred from code that looks incomplete.
 *
 * This app has an established visibility idiom, and it is `owner || role === "admin"`: see the
 * authorization check in `src/app/deals/actions.ts` (`deal.ownerId !== session.user.id &&
 * session.user.role !== "admin"`), which 37-CONTEXT.md:31 then LOCKED for Trash. Phase 40
 * DEPARTS from it deliberately (40-CONTEXT Decision 3, restated as UI-SPEC V-6): criterion 2 says a
 * private view "stays invisible to everyone else" and that is taken literally, because a "private"
 * view an admin can read is not private, and a user marking a view private is making a statement
 * about their own workspace rather than about record access. An admin sees exactly what a member
 * sees here.
 *
 * IF YOU ARE HERE TO ALIGN THIS FUNCTION WITH THE REST OF THE CODEBASE, THIS IS THE THING YOU WOULD
 * BE UNDOING. The predicate below is not missing a case.
 *
 * WHAT THIS DOES NOT WEAKEN. A saved view is a named filter set; it contains no record data. The
 * records a view resolves to stay governed by the existing per-record rules whoever opens it, so
 * hiding a view from an admin hides a filter definition and nothing else.
 *
 * THE ACCEPTED CONSEQUENCE (40-CONTEXT amendment A6, UI-SPEC V-6). Because the rule holds for
 * admins too, a soft-deleted user's PRIVATE views become permanently unreachable by anyone — there
 * is no principal for whom `ownerId = viewer` is true and no `isShared = true` to fall back on. Six
 * users in this deployment are already soft-deleted. Judged acceptable, because the rows are filter
 * sets with no record content, and recorded here so it is a known limitation rather than a later
 * discovery. Do NOT add a special case to expose them.
 *
 * `canEdit` KEEPS THE ADMIN BRANCH, and that is not a contradiction. 40-CONTEXT's sharing decision
 * says "only the owner (or an admin) may edit or delete a view" — that is about MUTATION, and an
 * admin can only mutate a view they can already see. So the admin branch appears exactly once in
 * this file, in the `canEdit` mapping, and never in a `where` clause.
 * ---------------------------------------------------------------------------------------------
 *
 * BOTH FUNCTIONS DEGRADE RATHER THAN THROW. There is no `error.tsx` above `/organizations`,
 * `/people`, `/deals` or `/activities` (M-14), so an exception escaping either function is a blank
 * list page. A failed view read costs the picker and nothing else: `[]` renders the bar in its
 * "no saved views" state and the list renders unfiltered. Same posture, same direction, as
 * `readOrgIdentityInputFields` degrading to `[]` at `organizations/page.tsx:123`.
 */
import { and, asc, eq, or } from "drizzle-orm"

import { db } from "@/db"
import { savedViewDefaults, savedViews } from "@/db/schema/saved-views"

import { countFilters } from "./url-params"

import type { SavedViewSummary, ViewEntityType, ViewFilters } from "./types"

const LOG_PREFIX = "[views/queries]"

/**
 * Who is asking.
 *
 * `role` is OPTIONAL and only ever consulted for `canEdit`. A caller that omits it gets the
 * member-shaped answer, which is the safe direction: a missing role must not silently confer edit
 * rights. It is deliberately `string | undefined` rather than the `userRoleEnum` union so a session
 * whose role is absent or unexpected compares unequal to `"admin"` instead of failing to typecheck
 * at the call site and tempting someone into a cast.
 */
export interface ViewViewer {
  id: string
  role?: string
}

/**
 * The default view a user has chosen for one entity type, once its visibility has been confirmed.
 *
 * Narrower than `SavedViewSummary` on purpose: the only caller is the redirect resolver, which needs
 * the stored filters and the name for nothing but a log line. `isDefaultForViewer` is answered by
 * `listVisibleViews` instead, from the same defaults row, so nothing here duplicates it.
 */
export interface DefaultViewRow {
  id: string
  name: string
  entityType: ViewEntityType
  filters: ViewFilters
}

/**
 * A JSONB value narrowed to the map the rest of the pipeline expects.
 *
 * `filters` is declared `Record<string, string>` by `$type<>()`, which is a COMPILE-TIME claim about
 * a column no type system has ever checked at runtime — a hand-written row, or an older writer,
 * could put a scalar or an array there. This is not validation (that is `validateStoredFilters`'s
 * job, and it needs the catalog): it only guarantees the declared type is not a lie, so
 * `pickFilterParams` receives an object and `countFilters` cannot read a property of a number.
 */
function asFilterMap(raw: unknown): ViewFilters {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {}

  return raw as ViewFilters
}

/**
 * THE VISIBILITY PREDICATE, DEFINED EXACTLY ONCE (T-40-17, T-40-18).
 *
 * `ownerId = viewer OR isShared = true`. No admin branch — the header explains why at length, and
 * this is the expression that header is about.
 *
 * WHY IT IS A FUNCTION RATHER THAN TWO INLINE COPIES. Both reads in this module apply the same
 * rule: the picker list, and the "is this user's default still visible?" join. Two copies of a
 * security control is the defect class `url-params.ts` was written to avoid one layer up — the
 * copies agree today and one of them is edited later. One definition also makes the rule REACHABLE
 * by a test: this function can be compiled to SQL and inspected, which is the only way to assert
 * the difference T-40-17 is actually about. A behavioural test cannot see it. MEASURED, not
 * assumed: moving this predicate out of the `where` into a post-fetch `rows.filter(...)` leaves
 * ALL 25 behavioural assertions in `queries.db.test.ts` green, because the caller receives exactly
 * the same list either way — while the server has now loaded every private view in the table into
 * memory, and from a server component into the RSC payload of anything closing over them.
 *
 * It is deliberately parameterised on the viewer's ID ALONE. With no `role` parameter there is
 * nowhere for an admin branch to be threaded in without changing the signature.
 */
export function visibleViewsPredicate(viewerId: string) {
  return or(eq(savedViews.ownerId, viewerId), eq(savedViews.isShared, true))
}

/**
 * EVERY VIEW THIS VIEWER MAY SEE FOR ONE ENTITY TYPE, fully resolved.
 *
 * The visibility predicate is IN SQL and is never a post-fetch `.filter()` (T-40-17). That is a
 * security property, not a performance one: these functions are called from server components, so a
 * row fetched and then filtered out in JavaScript has already been serialised into the RSC payload
 * for anything that closes over it — every private view's NAME and FILTER SET would ship to a
 * browser that must not have them, whether or not it renders. `WHERE` is the only place the
 * exclusion can be complete.
 *
 * Two reads, one round trip. The defaults row is fetched alongside rather than after, because
 * `isDefaultForViewer` is needed for every row of the picker and a sequential read would add a
 * latency hop to all four list pages for one boolean.
 */
export async function listVisibleViews(
  entityType: ViewEntityType,
  viewer: ViewViewer,
): Promise<SavedViewSummary[]> {
  try {
    const [rows, defaultRow] = await Promise.all([
      db.query.savedViews.findMany({
        where: and(
          eq(savedViews.entityType, entityType),
          // THE ENTIRE PRIVACY CONTROL FOR CRITERION 2, in the `where` and not in a `.filter()`.
          visibleViewsPredicate(viewer.id),
        ),
        with: {
          // The `owner` relation registered in `_relations.ts:301` exists for exactly this line.
          // Without it, attribution is one extra query per view.
          owner: { columns: { id: true, name: true, email: true, deletedAt: true } },
        },
        orderBy: [asc(savedViews.name)],
      }),
      db.query.savedViewDefaults.findFirst({
        where: and(
          eq(savedViewDefaults.userId, viewer.id),
          eq(savedViewDefaults.entityType, entityType),
        ),
        columns: { viewId: true },
      }),
    ])

    const isAdmin = viewer.role === "admin"

    return rows.map((row) => {
      const isOwnedByViewer = row.ownerId === viewer.id
      const filters = asFilterMap(row.filters)

      return {
        id: row.id,
        name: row.name,
        entityType: row.entityType as ViewEntityType,
        // LEFT AS STORED. Validation needs the catalog and therefore belongs to `resolve.ts`,
        // which replaces this with the validated set before the props reach the bar.
        filters,
        isShared: row.isShared,
        isOwnedByViewer,
        isDefaultForViewer: defaultRow?.viewId === row.id,
        /**
         * `name || email`, and `||` rather than `??` because an empty-string name must fall back
         * too. This is the COMMON path in this deployment, not the exotic one: two of the four live
         * users have `name = NULL` (measured this session; 40-CONTEXT A5 said two of three, before a
         * fourth live account existed). `null` when the owner is soft-deleted, which is what selects
         * `views.ownerUnavailable` — a bare uuid may never reach the UI (V-5).
         */
        ownerLabel: row.owner.deletedAt ? null : row.owner.name || row.owner.email,
        ownerIsInactive: row.owner.deletedAt !== null,
        // Computed from the whitelist, so the number the manage dialog renders and the number the
        // parser will accept cannot diverge (G-3).
        filterCount: countFilters(entityType, filters),
        // The ONE admin branch in this file, and it is about mutation, not visibility.
        canEdit: isOwnedByViewer || isAdmin,
      }
    })
  } catch (error) {
    console.error(`${LOG_PREFIX} could not list views for ${entityType}:`, error)
    return []
  }
}

/**
 * THIS USER'S DEFAULT VIEW FOR ONE ENTITY TYPE, or `null`.
 *
 * The visibility predicate rides in the JOIN CONDITION rather than being applied to the result
 * (T-40-18), so the same rule that hides a private view from the picker also stops it being reached
 * through a stale defaults row. The case is real: a user may default to a teammate's SHARED view
 * (UI-SPEC G-7, the reason `saved_view_defaults` is its own table), and that teammate may later
 * unshare it. From that moment the default resolves to `null`, the redirect does not fire, and the
 * list renders unfiltered — the locked "falls back to unfiltered, with no error" behaviour. The
 * deleted-view case needs no code at all: `viewId` cascades, so the row is simply gone.
 *
 * A core `select` with an `innerJoin` rather than `db.query…findFirst({ with: { view: true } })`,
 * because the relational builder applies a `with` predicate after fetching the parent row, and
 * "confirm the visibility rule in SQL" is precisely what must not become a post-fetch check.
 */
export async function readDefaultViewForUser(
  entityType: ViewEntityType,
  userId: string,
): Promise<DefaultViewRow | null> {
  try {
    const rows = await db
      .select({
        id: savedViews.id,
        name: savedViews.name,
        entityType: savedViews.entityType,
        filters: savedViews.filters,
      })
      .from(savedViewDefaults)
      .innerJoin(
        savedViews,
        and(
          eq(savedViews.id, savedViewDefaults.viewId),
          // THE SAME predicate as `listVisibleViews` — the same function, not a second copy of it.
          visibleViewsPredicate(userId),
        ),
      )
      .where(
        and(
          eq(savedViewDefaults.userId, userId),
          eq(savedViewDefaults.entityType, entityType),
        ),
      )
      .limit(1)

    const row = rows[0]

    if (row === undefined) return null

    return {
      id: row.id,
      name: row.name,
      entityType: row.entityType as ViewEntityType,
      filters: asFilterMap(row.filters),
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} could not read the default view for ${entityType}:`, error)
    return null
  }
}
