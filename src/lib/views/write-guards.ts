/**
 * THE DECISIONS THE SAVED-VIEW WRITE ACTIONS MAKE BEFORE THEY WRITE.
 *
 * WHY THIS IS NOT INSIDE `actions.ts`, WHICH IS WHERE PLAN 40-06 PUT IT. Two independent reasons,
 * both measured rather than assumed:
 *
 *   1. `actions.ts` carries `"use server"`, and Next.js refuses to build a `"use server"` module
 *      that exports anything other than an async function — the SWC binary's own message is
 *      "Only async functions are allowed to be exported in a \"use server\" file."
 *      `MAX_VIEW_NAME_LENGTH`, `guardSaveInput`, `canMutateView` and `canSeeView` are a constant
 *      and three synchronous functions, so exporting them from there is a build error that neither
 *      `tsc` nor `eslint` nor `vitest` would have caught.
 *
 *   2. The gate has to be able to CALL these functions with real values. `actions.ts` imports
 *      `@/db`, which constructs a postgres client at module load, so importing it from a unit test
 *      throws before a single assertion runs. Nothing here imports the database, `next/cache`, or
 *      anything else with a side effect at load.
 *
 * So the module split is what makes the guards testable AND buildable. `actions.ts` is still the
 * only place the mutations live, and the gate asserts the ordering inside each of its functions.
 *
 * EVERY FUNCTION HERE IS TOTAL. Each one is handed a value that arrived from a browser POST whose
 * argument types are a declaration and not a check, so `unknown` is the honest parameter type and
 * "returns null" is the honest failure. None of them throws: there is no `error.tsx` above any of
 * the four list routes, so a throw is a blank page.
 */
import type { ViewEntityType, ViewFilters } from "./types"
import {
  VIEW_ENTITY_TYPES,
  hasSaveableFilter,
  pickFilterParams,
  type FilterParamSource,
} from "./url-params"

/**
 * The longest name a view may carry, in characters, measured AFTER normalisation.
 *
 * 120. There is no cap in the database — `saved_views.name` is a bare `text` column — so this is
 * the only bound on a value that reaches a JSONB-adjacent row, a toast with `{name}` in it, and
 * the manage dialog's wrapping name line. At the 241px width UI-SPEC R-40-2d measures, 120
 * characters is already about six lines of wrapped text, which is past the point where a longer
 * name helps anyone.
 *
 * An over-long name is REJECTED, never truncated. A truncated name is a name the user did not
 * choose, and two long names sharing a prefix would collide under
 * `saved_views_owner_type_name_uniq` for a reason the user cannot see from the form.
 */
export const MAX_VIEW_NAME_LENGTH = 120

/**
 * The longest a view id may be, in characters.
 *
 * Ids are `crypto.randomUUID()` — 36 characters. 64 is the same shape of bound the `/duplicates`
 * `parseRecordId` uses: generous enough that no real id is refused, tight enough that a megabyte
 * of text never reaches a `WHERE id = $1`.
 */
export const MAX_VIEW_ID_LENGTH = 64

/**
 * The unique index a duplicate name violates. Declared once, here, and read by the mapper below.
 *
 * `saved_views_owner_type_name_uniq` is scoped to `(owner_id, entity_type, name)`, so two users may
 * each own a view called "Mine" and one user may not. Plan 40-02 exercised this against the live
 * database rather than reasoning about it.
 */
export const SAVED_VIEW_NAME_CONSTRAINT = "saved_views_owner_type_name_uniq"

/** The SQLSTATE for a unique violation. */
const UNIQUE_VIOLATION = "23505"

/**
 * Where each entity type's list actually lives, for `revalidatePath`.
 *
 * A FROZEN MAP AND NEVER A STRING TRANSFORM. `person` + "s" is `/persons`, which is not a route in
 * this app; the list is at `/people`. A transform would revalidate a path that does not exist and
 * leave the real one stale, which reads as "I saved the view and the bar did not notice".
 */
const LIST_ROUTE_BY_ENTITY_TYPE: Readonly<Record<ViewEntityType, string>> = Object.freeze({
  organization: "/organizations",
  person: "/people",
  deal: "/deals",
  activity: "/activities",
})

/**
 * An entity type that arrived from a POST, narrowed to one of the four, or `null`.
 *
 * A MEMBERSHIP SCAN, never a property lookup — the same rule `url-params.ts` states for `keysFor`.
 * `LIST_ROUTE_BY_ENTITY_TYPE["__proto__"]` is `Object.prototype`, and treating that as a route
 * would hand `revalidatePath` an object.
 *
 * This narrowing is load-bearing rather than defensive: `saved_views.entity_type` is a bare `text`
 * column, so an unnarrowed value would be persisted verbatim and every later read of that row
 * would resolve no whitelist at all.
 */
export function narrowEntityType(raw: unknown): ViewEntityType | null {
  if (typeof raw !== "string") return null

  return VIEW_ENTITY_TYPES.find((candidate) => candidate === raw) ?? null
}

/** A view id narrowed to a plausible id, or `null`. Trimmed, because a padded id is not an id. */
export function narrowViewId(raw: unknown): string | null {
  if (typeof raw !== "string") return null

  const trimmed = raw.trim()

  if (trimmed.length === 0) return null
  if (trimmed.length > MAX_VIEW_ID_LENGTH) return null

  return trimmed
}

/** The list route for an entity type, or `null` for anything that is not one of the four. */
export function listRouteFor(raw: unknown): string | null {
  const entityType = narrowEntityType(raw)

  return entityType === null ? null : LIST_ROUTE_BY_ENTITY_TYPE[entityType]
}

/**
 * A submitted name reduced to what would be stored, or `null` if it may not be stored at all.
 *
 * Trims the ends and collapses every internal whitespace run to one space, so "Overdue   mine"
 * and "Overdue mine" are the same name and cannot sit beside each other in the picker looking
 * identical. The cap is measured on the COLLAPSED value: a megabyte of spaces around two
 * characters is a two-character name, and refusing it would refuse a legitimate name for the size
 * of something that was discarded.
 */
export function normaliseViewName(raw: unknown): string | null {
  if (typeof raw !== "string") return null

  const collapsed = raw.trim().replace(/\s+/g, " ")

  if (collapsed.length === 0) return null
  if (collapsed.length > MAX_VIEW_NAME_LENGTH) return null

  return collapsed
}

/** What `guardSaveInput` is handed. Every field is a claim from a browser, not a guarantee. */
export interface SaveViewInput {
  entityType: ViewEntityType
  /**
   * The filter map, as a plain record and NEVER as a query string.
   *
   * The client builds it from `useSearchParams`; this module re-picks it. The declared type is a
   * convenience for the call site and nothing more — the value is data to be re-derived, so the
   * guard reads it as `unknown` and walks the whitelist over it.
   */
  filters: ViewFilters
  name: string
}

export type SaveGuardResult =
  | { ok: true; filters: ViewFilters; name: string }
  | { ok: false; error: "name_required" | "no_filters" }

/** Any value coerced to something `pickFilterParams` can walk, without ever throwing. */
function asFilterSource(raw: unknown): FilterParamSource {
  if (raw === null || raw === undefined) return undefined
  if (raw instanceof URLSearchParams) return raw
  if (typeof raw !== "object") return undefined

  return raw as Readonly<Record<string, unknown>>
}

/**
 * THE SAVE-TIME CONTROL (T-40-25, T-40-26).
 *
 * Two refusals, in this order:
 *
 *   `no_filters` — the picked map has no saveable key. Checked with `hasSaveableFilter`, which
 *   COUNTS `pipeline`, and deliberately not with `hasExportableFilter`, which does not. The
 *   distinction is the whole of 40-CONTEXT amendment A2: a board selector alone scopes to 25,195
 *   deals and may not authorize an export, but Decision 4 requires a deals view to carry its
 *   board, so refusing a pipeline-only view HERE would refuse a legitimate save.
 *
 *   `name_required` — the name normalises to nothing.
 *
 *   The order matters for the UI. `name_required` renders inline beside the name field (S-7); on a
 *   list with nothing to save that would point the user at the wrong problem. UI-SPEC B-5 replaces
 *   the save button with a sentence when there is nothing to save, so the dialog is unreachable in
 *   that state — and `no_filters` exists anyway (S-15), because a server action is a POST endpoint
 *   and a hidden button is presentation, not a control.
 *
 * What comes back is what gets STORED: the picked map, not the submitted one, so a client posting
 * `{ pipeline: "p", nonsense: "x" }` stores `{ pipeline: "p" }` and nothing else.
 */
export function guardSaveInput(input: SaveViewInput): SaveGuardResult {
  const entityType = narrowEntityType(input.entityType)

  // An unrecognised entity type resolves no whitelist, so nothing it submitted can be saveable.
  // Reported as `no_filters` rather than as its own code: the four real types are the only ones
  // the client can produce, so this is a crafted call, and it needs a refusal rather than a
  // vocabulary entry the message catalog has no sentence for.
  if (entityType === null) return { ok: false, error: "no_filters" }

  const filters = pickFilterParams(entityType, asFilterSource(input.filters))

  if (!hasSaveableFilter(entityType, filters)) return { ok: false, error: "no_filters" }

  const name = normaliseViewName(input.name)

  if (name === null) return { ok: false, error: "name_required" }

  return { ok: true, filters, name }
}

/** The stored row's fields that any authorization decision reads. Read from the ROW, never from the request. */
export interface ViewOwnershipRow {
  ownerId: string
  isShared: boolean
}

/** The caller, resolved from the session — never from an argument. */
export interface ViewViewer {
  id: string
  role?: string | null
}

/**
 * MAY THIS CALLER CHANGE THIS VIEW? Owner, or admin.
 *
 * The app's ordinary mutation idiom, and the one definition of it for this feature: `updateView`,
 * `setViewShared` and `deleteView` all read it, so there is one rule rather than three copies.
 *
 * DO NOT CONFLATE THIS WITH `canSeeView` BELOW. They are different predicates and they disagree on
 * purpose. An admin may delete a shared view they can see; an admin may not enumerate anybody's
 * private views at all. Collapsing the two — in either direction — either lets a stranger rename
 * someone's view or lets an admin read a view whose whole promise to its owner is that they
 * cannot (Decision 3, and `views.save.privateHelp` says so to the user in words).
 */
export function canMutateView(row: ViewOwnershipRow, viewer: ViewViewer): boolean {
  return row.ownerId === viewer.id || viewer.role === "admin"
}

/**
 * MAY THIS CALLER SEE THIS VIEW? Owner, or the view is shared. **NO ADMIN BRANCH.**
 *
 * 40-CONTEXT Decision 3, taken literally: a private view is invisible to everyone, admins
 * included. That DEPARTS from the app's `owner || role === "admin"` visibility idiom, and the
 * departure is the decision — "private" an admin can read is not private, and marking a view
 * private is a statement about one's own workspace rather than about record access. The records a
 * view resolves to stay governed by the existing per-record rules either way.
 *
 * Read by `setViewDefault`, which needs visibility and NOT ownership: pointing your own default at
 * a view is a per-user act. Without this check a member could point their default at an admin's
 * private view and read its filter values out of their own address bar after the redirect
 * (T-40-24) — the disclosure `canMutateView` does not cover, because ownership is not the question
 * being asked.
 *
 * Accepted consequence, recorded in 40-CONTEXT A6: a soft-deleted user's private views become
 * unreachable by anyone. Six such users exist here.
 */
export function canSeeView(row: ViewOwnershipRow, viewer: ViewViewer): boolean {
  return row.ownerId === viewer.id || row.isShared
}

/** The two fields worth keeping from a driver error. Never the message — see `redactDbError`. */
export interface RedactedDbError {
  code: string | null
  constraint: string | null
}

/** How far down a `cause` chain to walk before giving up. A cycle must not hang a POST endpoint. */
const MAX_CAUSE_DEPTH = 8

/**
 * Walk an error and its `cause` chain, yielding each link.
 *
 * WHY A CHAIN AND NOT JUST THE ERROR. MEASURED against this deployment's drizzle-orm 0.45.1:
 * `PgPreparedQuery.queryWithCache` wraps every driver rejection in a `DrizzleQueryError`, so what
 * a `catch` around `db.insert(...)` receives has `code === undefined`, and the SQLSTATE lives one
 * level down on `cause`. Reading `error.code` directly — which is the obvious implementation, and
 * the one plan 40-06 describes — matches nothing, and every duplicate-name save would answer with
 * the generic failure instead of the field-level refusal S-6 requires.
 *
 * Both shapes are accepted, because a future drizzle release could stop wrapping and this mapping
 * should not become a silent regression when it does.
 */
function* causeChain(error: unknown): Generator<Record<string, unknown>> {
  const seen = new Set<unknown>()
  let current = error

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (current === null || typeof current !== "object") return
    if (seen.has(current)) return
    seen.add(current)

    yield current as Record<string, unknown>

    current = (current as { cause?: unknown }).cause
  }
}

/**
 * Is this the name collision S-6 refuses, as opposed to any other write failure?
 *
 * TWO FIELDS, BOTH REQUIRED, AND NEVER THE MESSAGE TEXT. The SQLSTATE alone is not enough: two
 * concurrent "set as default" writes race on `saved_view_defaults_user_id_entity_type_pk` and also
 * raise 23505, and reporting that as a taken name would send the user to rename a field that was
 * never the problem.
 *
 * The message text is excluded deliberately rather than incidentally. `DrizzleQueryError.message`
 * embeds the SQL **and the bound parameters**, so a view whose name is the constraint's own name
 * would put that string into the message; a message match would then report a collision that never
 * happened, and would keep passing if `constraint_name` were dropped from the check entirely.
 */
export function isDuplicateViewName(error: unknown): boolean {
  for (const link of causeChain(error)) {
    if (link.code === UNIQUE_VIOLATION && link.constraint_name === SAVED_VIEW_NAME_CONSTRAINT) {
      return true
    }
  }

  return false
}

/**
 * What is safe to `console.error` about a driver failure.
 *
 * The SQLSTATE and the constraint, and nothing else. The obvious `console.error(error)` would put
 * the full statement and every bound parameter — including a view name the user typed — into the
 * server log, which is the same class of leak T-39-03 already paid for on the merge path. This is
 * not about hiding the failure: the two fields kept here are the two that identify it.
 */
export function redactDbError(error: unknown): RedactedDbError {
  for (const link of causeChain(error)) {
    const code = typeof link.code === "string" ? link.code : null
    const constraint = typeof link.constraint_name === "string" ? link.constraint_name : null

    if (code !== null || constraint !== null) return { code, constraint }
  }

  return { code: null, constraint: null }
}
