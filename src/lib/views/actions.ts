"use server"

/**
 * THE SAVED-VIEW WRITE LAYER.
 *
 * A SERVER ACTION IS A PUBLIC POST ENDPOINT. Every argument below is attacker-authored — the `id`,
 * the whole `filters` map, the booleans — and every rule the UI implies has to exist here as well.
 * `SavedViewsBar` hides the save control on an unfiltered list (B-5) and hides the edit controls on
 * somebody else's view (G-7); neither of those is a control. They are presentation. The controls
 * are in this file, one per action, ahead of the write, and gated by
 * `src/lib/views/__tests__/actions.test.ts` on ORDER rather than on presence.
 *
 * WHY THIS LIVES UNDER `src/lib` AND NOT UNDER `src/app`. `src/lib/fetch-entities.ts` is the
 * precedent: a `"use server"` module for a surface with no route of its own. There is no
 * `/views` page, so creating `src/app/views/` would invent a route to hold two files.
 *
 * WHERE THE DECISIONS LIVE. Every synchronous guard is in `./write-guards`, not here, for two
 * measured reasons recorded in that file's header: Next.js refuses to build a `"use server"` module
 * that exports anything but an async function, and a unit test cannot import this file at all
 * because `@/db` constructs a postgres client at module load.
 *
 * THE SUBMITTED FILTER MAP IS DATA, NOT A CLAIM. `filters` arrives as a plain record and never as a
 * query string, and `guardSaveInput` re-derives what gets stored by walking the 40-01 whitelist
 * over it. A key outside the whitelist is dropped rather than persisted, so no later read can be
 * surprised by something this layer let through (T-40-25).
 *
 * NOTHING HERE RETURNS A TRANSLATED STRING. Each failure is a machine code and the client picks the
 * sentence; there is no locale in scope on the server, and a key returned from here would be a
 * localisation decision made in the wrong place. The gate asserts the absence.
 */

import { revalidatePath } from "next/cache"
import { and, eq, ne } from "drizzle-orm"
import type { Session } from "next-auth"

import { auth } from "@/auth"
import { db } from "@/db"
import { savedViewDefaults, savedViews } from "@/db/schema"

import type { ViewEntityType, ViewFilters } from "./types"
import {
  canMutateView,
  canSeeView,
  guardSaveInput,
  isDuplicateViewName,
  listRouteFor,
  narrowEntityType,
  narrowViewId,
  redactDbError,
} from "./write-guards"

/**
 * Everything these actions can answer with, as machine codes.
 *
 * The client maps each to a sentence:
 *   name_taken        -> the inline duplicate-name refusal beside the field (S-6)
 *   name_required     -> the inline empty-name refusal beside the field (S-7)
 *   no_filters        -> the nothing-to-save refusal (S-15)
 *   forbidden         -> the read-only explanation naming the owner (G-7 / S-4)
 *   failed            -> the generic "nothing changed, try again" toast
 *   not_authenticated -> also the generic toast. There is no dedicated sentence in the catalog and
 *                        this layer must not invent one: middleware establishes a session for every
 *                        non-API route, so reaching this code means the POST bypassed a page
 *                        entirely, and the browser's next act is a sign-in rather than a retry of
 *                        this form. It is a distinct code so the server log can tell them apart.
 */
export type ViewActionErrorCode =
  | "not_authenticated"
  | "forbidden"
  | "name_taken"
  | "name_required"
  | "no_filters"
  | "failed"

/** The repo's server-action return shape. */
export type ViewActionResult<T> =
  | ({ success: true } & T)
  | { success: false; error: ViewActionErrorCode }

/** What a create or an update answers with, so the client can toast `{name}` for the row it wrote. */
export interface SavedViewIdentity {
  id: string
  name: string
}

export type SaveViewResult = ViewActionResult<SavedViewIdentity>

/** A manage-dialog toggle answers with nothing but its outcome (G-4 commits on toggle). */
export type ManageViewResult = ViewActionResult<Record<never, never>>

/** A delete answers with the name, because the confirmation toast interpolates a row that is gone. */
export type DeleteViewResult = ViewActionResult<{ name: string }>

/** The session fields every action reads, resolved once. `null` means no session. */
interface Viewer {
  id: string
  role?: string | null
}

/**
 * The caller, from the session and only from the session.
 *
 * A submitted `ownerId` is never read anywhere in this file; ownership is compared against the
 * STORED row (T-40-23).
 *
 * `await auth()` IS DELIBERATELY NOT FOLDED IN HERE. This helper is the synchronous projection
 * only, and every action calls `auth()` on its own first line, because the gate asserts the call
 * is present in each action's OWN body and ahead of that action's first query. An `await
 * resolveViewer()` wrapper reads better and hides the one line that matters: it would let a sixth
 * action ship with no session check while the gate stayed green, and it would put all five actions'
 * authentication behind a single edit. The repetition is the control being legible at each site,
 * which is the same reason `src/app/duplicates/actions.ts` repeats its four lines six times.
 */
function toViewer(session: Session | null): Viewer | null {
  const id = session?.user?.id

  if (!id) return null

  return { id, role: session.user.role }
}

/** Revalidate the list this view belongs to, or nothing at all for an entity type we do not know. */
function revalidateListFor(entityType: unknown): void {
  const route = listRouteFor(entityType)

  // `revalidatePath(undefined)` throws, and there is no `error.tsx` above any of the four routes.
  if (route !== null) revalidatePath(route)
}

/** The transaction handle drizzle hands a `db.transaction` callback. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Point this user's default for one entity type at one view, inside a caller-supplied transaction.
 *
 * `onConflictDoUpdate` on the composite primary key rather than a delete-then-insert: the key is
 * `(user_id, entity_type)`, plan 40-02 exercised it refusing a second write, and two concurrent
 * "set as default" clicks must not leave the user with no default at all in between.
 */
async function upsertDefault(
  tx: Tx,
  userId: string,
  entityType: ViewEntityType,
  viewId: string,
): Promise<void> {
  const now = new Date()

  await tx
    .insert(savedViewDefaults)
    .values({ userId, entityType, viewId, updatedAt: now })
    .onConflictDoUpdate({
      target: [savedViewDefaults.userId, savedViewDefaults.entityType],
      set: { viewId, updatedAt: now },
    })
}

/**
 * CREATE A VIEW.
 *
 * The name collision is caught, never pre-checked. A `SELECT` followed by an `INSERT` is advisory
 * under concurrency — two simultaneous saves both pass their own read — and `.planning/BACKLOG.md`
 * already records exactly that shape as a defect in the Phase 39 dedup scan guard.
 * `saved_views_owner_type_name_uniq` cannot be raced, so the database decides and this function
 * translates. `isDuplicateViewName` owns the translation, and it has to walk the error's `cause`
 * chain because drizzle wraps driver errors — see its comment; reading the caught error's own
 * SQLSTATE here would match nothing.
 */
export async function createView(input: {
  entityType: ViewEntityType
  name: string
  filters: ViewFilters
  isShared?: boolean
  makeDefault?: boolean
}): Promise<SaveViewResult> {
  const viewer = toViewer(await auth())

  if (viewer === null) return { success: false, error: "not_authenticated" }

  // No row exists yet, so there is nothing to authorize against: anyone signed in may create a
  // view of their own. The owner-or-admin predicate deliberately does not appear in this function.
  const entityType = narrowEntityType(input.entityType)

  if (entityType === null) return { success: false, error: "failed" }

  const guarded = guardSaveInput({
    entityType,
    filters: input.filters,
    name: input.name,
  })

  if (!guarded.ok) return { success: false, error: guarded.error }

  try {
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(savedViews)
        .values({
          ownerId: viewer.id,
          entityType,
          name: guarded.name,
          filters: guarded.filters,
          isShared: input.isShared === true,
        })
        .returning({ id: savedViews.id, name: savedViews.name })

      // IN THE SAME TRANSACTION as the insert. A default that failed after the view was stored
      // would leave the user believing the list opens here when it does not, and the checkbox
      // they ticked has no second chance to tell them otherwise.
      if (input.makeDefault === true) await upsertDefault(tx, viewer.id, entityType, row.id)

      return row
    })

    revalidateListFor(entityType)

    return { success: true, id: created.id, name: created.name }
  } catch (error) {
    if (isDuplicateViewName(error)) return { success: false, error: "name_taken" }

    console.error("createView failed", redactDbError(error))

    return { success: false, error: "failed" }
  }
}

/**
 * UPDATE A VIEW — its name, its filters and its visibility.
 *
 * AUTHORIZATION IS READ FROM THE STORED ROW AND HAPPENS BEFORE THE GUARD, not after. The save
 * dialog offers a stranger a different choice (S-4: "you can only save this as a new view"), and
 * that is an explanation, not an enforcement. A caller who is neither the owner nor an admin is
 * refused here and learns nothing else about the row — not even whether the name they submitted
 * would have been acceptable.
 */
export async function updateView(input: {
  id: string
  name: string
  filters: ViewFilters
  isShared?: boolean
  makeDefault?: boolean
}): Promise<SaveViewResult> {
  const viewer = toViewer(await auth())

  if (viewer === null) return { success: false, error: "not_authenticated" }

  const id = narrowViewId(input.id)

  if (id === null) return { success: false, error: "failed" }

  try {
    const row = await db.query.savedViews.findFirst({
      where: eq(savedViews.id, id),
      columns: { id: true, ownerId: true, entityType: true, isShared: true },
    })

    // A missing row and a refused row answer differently on purpose: the caller supplied this id,
    // so "gone" is not a disclosure, while "forbidden" is the sentence G-7 renders.
    if (!row) return { success: false, error: "failed" }
    // VISIBILITY FIRST, AND ANSWERED AS A MISSING ROW (WR-01). `canMutateView` has an admin branch
    // and `canSeeView` has none, so ownership alone would let an admin holding a private view's id
    // rename it and overwrite its filters — the invariant `queries.ts:38-41` claims ("an admin can
    // only mutate a view they can already see") with nothing enforcing it. `failed` and not
    // `forbidden`: the refusal must not tell an admin that somebody's private view exists here.
    if (!canSeeView(row, viewer)) return { success: false, error: "failed" }
    if (!canMutateView(row, viewer)) return { success: false, error: "forbidden" }

    const entityType = narrowEntityType(row.entityType)

    if (entityType === null) return { success: false, error: "failed" }

    const guarded = guardSaveInput({
      entityType,
      filters: input.filters,
      name: input.name,
    })

    if (!guarded.ok) return { success: false, error: guarded.error }

    await db.transaction(async (tx) => {
      await tx
        .update(savedViews)
        .set({
          name: guarded.name,
          filters: guarded.filters,
          isShared: input.isShared === true,
          updatedAt: new Date(),
        })
        .where(eq(savedViews.id, id))

      if (input.makeDefault === true) {
        await upsertDefault(tx, viewer.id, entityType, id)
      } else {
        // UNTICKING THE BOX CLEARS THE DEFAULT, BUT ONLY IF IT POINTED HERE.
        //
        // The default row is keyed `(userId, entityType)` and may well point at a DIFFERENT view.
        // An unscoped delete would let saving changes to view A silently drop the user's default
        // on view B. The plan describes the upsert and not this branch; without it the checkbox
        // would be one-way, which is not what a checkbox means.
        await tx
          .delete(savedViewDefaults)
          .where(
            and(
              eq(savedViewDefaults.userId, viewer.id),
              eq(savedViewDefaults.entityType, entityType),
              eq(savedViewDefaults.viewId, id),
            ),
          )
      }
    })

    revalidateListFor(entityType)

    return { success: true, id, name: guarded.name }
  } catch (error) {
    if (isDuplicateViewName(error)) return { success: false, error: "name_taken" }

    console.error("updateView failed", redactDbError(error))

    return { success: false, error: "failed" }
  }
}

/**
 * SHARE OR UNSHARE A VIEW (the G-4 switch, which commits on toggle).
 *
 * MAKING A VIEW PRIVATE ALSO CLEARS EVERY OTHER USER'S DEFAULT ON IT, in the same transaction.
 *
 * THIS IS A CONSEQUENCE 40-CONTEXT DOES NOT STATE, and it is written here rather than left to be
 * discovered. A default pointing at a view its holder can no longer see would redirect them into a
 * view the resolver then declines to resolve — a silent, permanent no-op on every visit to that
 * list, with nothing on screen to explain it. Dropping the stale row degrades them to the
 * unfiltered list instead, which is exactly the behaviour the locked decision already chose for a
 * DELETED shared view ("falls back to unfiltered, with no error"). One rule, two ways of reaching
 * it.
 *
 * The OWNER's own default survives, which is why the delete is scoped away from `row.ownerId`
 * rather than applied to every row pointing at this view: they can still see their own private
 * view, so their default still resolves.
 */
export async function setViewShared(input: {
  id: string
  isShared: boolean
}): Promise<ManageViewResult> {
  const viewer = toViewer(await auth())

  if (viewer === null) return { success: false, error: "not_authenticated" }

  const id = narrowViewId(input.id)

  if (id === null) return { success: false, error: "failed" }

  const isShared = input.isShared === true

  try {
    const row = await db.query.savedViews.findFirst({
      where: eq(savedViews.id, id),
      columns: { id: true, ownerId: true, entityType: true, isShared: true },
    })

    if (!row) return { success: false, error: "failed" }
    // VISIBILITY FIRST (WR-01), AND THIS IS THE SITE THAT MATTERED MOST. Without it an admin
    // holding a private view's id could call `setViewShared({ id, isShared: true })` and the view's
    // NAME and FULL FILTER SET would appear in their own picker on the next read — Decision 3
    // defeated outright rather than partially. Refused as `failed`, identically to a missing row.
    if (!canSeeView(row, viewer)) return { success: false, error: "failed" }
    if (!canMutateView(row, viewer)) return { success: false, error: "forbidden" }

    await db.transaction(async (tx) => {
      await tx
        .update(savedViews)
        .set({ isShared, updatedAt: new Date() })
        .where(eq(savedViews.id, id))

      if (!isShared) {
        await tx
          .delete(savedViewDefaults)
          .where(and(eq(savedViewDefaults.viewId, id), ne(savedViewDefaults.userId, row.ownerId)))
      }
    })

    revalidateListFor(row.entityType)

    return { success: true }
  } catch (error) {
    console.error("setViewShared failed", redactDbError(error))

    return { success: false, error: "failed" }
  }
}

/**
 * SET OR CLEAR THIS USER'S DEFAULT VIEW FOR ONE ENTITY TYPE.
 *
 * THIS ACTION DELIBERATELY DOES NOT AUTHORIZE ON OWNERSHIP, and that absence is a requirement
 * rather than an oversight. A default is PER USER — which is the whole reason plan 40-02 put it in
 * its own table keyed `(userId, entityType)` instead of a boolean on the view row, because a
 * boolean would have made one user's choice the owner's choice too. UI-SPEC G-7 calls the asymmetry
 * "the one thing this row must make legible", and 40-CONTEXT gives the reason: a user MAY set
 * someone else's shared view as their own default, otherwise sharing has little payoff. So the
 * default switch stays live on a row whose other controls are absent.
 *
 * VISIBILITY IS STILL REQUIRED, AND IT IS A DIFFERENT PREDICATE. `canSeeView` has no admin branch
 * (Decision 3), so a private view belongs to exactly one person. Without this check a member could
 * point their default at an admin's private view and then read its filter values out of their own
 * address bar after the redirect — an information disclosure an ownership check would NOT have
 * caught, because ownership is not the question being asked (T-40-24).
 */
export async function setViewDefault(input: {
  entityType: ViewEntityType
  viewId: string | null
}): Promise<ManageViewResult> {
  const viewer = toViewer(await auth())

  if (viewer === null) return { success: false, error: "not_authenticated" }

  const entityType = narrowEntityType(input.entityType)

  if (entityType === null) return { success: false, error: "failed" }

  try {
    if (input.viewId === null || input.viewId === undefined) {
      // Clearing the default. There is no row to authorize against and nothing to disclose: a user
      // may always stop one of their own lists from opening somewhere.
      await db
        .delete(savedViewDefaults)
        .where(
          and(
            eq(savedViewDefaults.userId, viewer.id),
            eq(savedViewDefaults.entityType, entityType),
          ),
        )

      revalidateListFor(entityType)

      return { success: true }
    }

    const viewId = narrowViewId(input.viewId)

    if (viewId === null) return { success: false, error: "failed" }

    const row = await db.query.savedViews.findFirst({
      where: eq(savedViews.id, viewId),
      columns: { id: true, ownerId: true, entityType: true, isShared: true },
    })

    if (!row) return { success: false, error: "failed" }
    if (!canSeeView(row, viewer)) return { success: false, error: "forbidden" }

    // The default is keyed by entity type, so a view of a DIFFERENT type would make this list
    // redirect to filters no query on it applies. Refused rather than silently rewritten to the
    // row's own type, which would make the submitted argument decorative.
    if (row.entityType !== entityType) return { success: false, error: "failed" }

    await db.transaction(async (tx) => {
      await upsertDefault(tx, viewer.id, entityType, viewId)
    })

    revalidateListFor(entityType)

    return { success: true }
  } catch (error) {
    console.error("setViewDefault failed", redactDbError(error))

    return { success: false, error: "failed" }
  }
}

/**
 * DELETE A VIEW, FOR EVERYONE.
 *
 * There is no `deletedAt` on `saved_views` and no views tab in `/trash` (D-2): the row goes, and
 * the records it resolved to are untouched.
 *
 * NO MANUAL CLEANUP OF THE DEFAULTS TABLE IS NEEDED OR WANTED, and the omission is deliberate.
 * Both of that table's foreign keys cascade — plan 40-02 exercised it against the live database and
 * measured zero orphaned defaults after deleting a shared view somebody else had defaulted to — so
 * a teammate who had defaulted here simply has no default afterwards. The ABSENCE of that row IS
 * the locked decision, "falls back to unfiltered, with no error". An explicit delete would be a
 * second implementation of a database guarantee, and one a transaction boundary could get wrong.
 *
 * The name is read before the delete because the confirmation toast interpolates it and the row is
 * gone by the time the client renders.
 */
export async function deleteView(input: { id: string }): Promise<DeleteViewResult> {
  const viewer = toViewer(await auth())

  if (viewer === null) return { success: false, error: "not_authenticated" }

  const id = narrowViewId(input.id)

  if (id === null) return { success: false, error: "failed" }

  try {
    const row = await db.query.savedViews.findFirst({
      where: eq(savedViews.id, id),
      columns: { id: true, ownerId: true, entityType: true, isShared: true, name: true },
    })

    if (!row) return { success: false, error: "failed" }
    // VISIBILITY FIRST (WR-01). This action RETURNS `row.name` on success, so without the check an
    // admin holding a private view's id could destroy it AND read back its name — a disclosure the
    // ownership predicate does not cover, because ownership is not the question being asked.
    if (!canSeeView(row, viewer)) return { success: false, error: "failed" }
    if (!canMutateView(row, viewer)) return { success: false, error: "forbidden" }

    await db.delete(savedViews).where(eq(savedViews.id, id))

    revalidateListFor(row.entityType)

    return { success: true, name: row.name }
  } catch (error) {
    console.error("deleteView failed", redactDbError(error))

    return { success: false, error: "failed" }
  }
}
