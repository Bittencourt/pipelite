/**
 * THE SAVED-VIEW URL VOCABULARY — the one definition of what a view may contain, when it may be
 * saved, and when its records may be exported.
 *
 * WHY A SIBLING MODULE AND NOT FOUR PAGE FILES. Six `"use client"` modules write these params
 * (`organizations/data-table.tsx`, `people/data-table.tsx`, `activities/activity-filters.tsx`,
 * `activities/activities-client.tsx`, `deals/deal-filters.tsx`, `components/views/*`) and four
 * server components read them. All ten have to agree, byte for byte, on the whitelist. Two copies
 * of that list is the T-37-03 defect class in its saved-view form: a view that stores a key the
 * reader drops, or a picker that highlights a view the list is not actually showing.
 * `src/app/duplicates/url-params.ts` is the shape this file copies; `src/lib/trash/entity-types.ts`
 * is the same pattern one surface earlier.
 *
 * NO RUNTIME DATABASE IMPORT, AND THAT IS A CONSTRAINT RATHER THAN A COINCIDENCE. Every one of the
 * six writers above is a `"use client"` module, so anything imported here enters the browser
 * bundle. The only import in this file is a TYPE, which is erased at compile time. Never import
 * `@/db`, a `queries.ts`, or `src/lib/export/formatters.ts` from here.
 *
 * EVERY FUNCTION IS TOTAL: it returns a valid value for any input and NEVER throws. Two distinct
 * untrusted sources reach these functions — a crafted URL, and a `filters` JSONB blob written
 * months ago by an older whitelist — and neither may produce an error page. There is no `error.tsx`
 * above any of the four routes, so a throw here is a blank page.
 */
import type { ViewEntityType, ViewFilters } from "./types"

/**
 * The escape param, `?view=none`.
 *
 * It exists because two locked decisions were mutually exclusive without it (40-CONTEXT amendment
 * A1): the default-view redirect fires on a URL with NO params, and there is an explicit
 * "All records" pseudo-view. Selecting All records navigates to a bare path — and gets redirected
 * straight back into the default view. See `withViewEscape` for the full account.
 */
export const VIEW_ESCAPE_KEY = "view"
export const VIEW_ESCAPE_VALUE = "none"

/**
 * THE SHAPE OF A VIEW ID IN THE URL — a v4 uuid, case-insensitively, anchored at both ends.
 *
 * Two facts justify a SHAPE-bounded narrowing here rather than the length-bounded one
 * `write-guards.ts` uses for a POST body, and they are both measured rather than assumed:
 *
 *   1. EVERY view id is a `crypto.randomUUID()`. `saved_views.id` is
 *      `text("id").primaryKey().$defaultFn(() => crypto.randomUUID())` and `createView` accepts no
 *      `id` from a caller, so there is no insert path that could supply another shape. A uuid-shaped
 *      narrowing therefore refuses nothing real.
 *   2. This value ROUND-TRIPS THROUGH THE ADDRESS BAR. Unlike a POST body — which is looked up and
 *      refused if it names no row — a `?view=` value is read from a URL the user can be handed and
 *      is written back into the next navigation target. There, "the lookup would have failed anyway"
 *      is not the whole story: the string itself is the hazard (T-40-85). Refusing everything that
 *      is not an id costs nothing and removes the class.
 *
 * Declared once and never inlined, and deliberately NOT `g`-flagged: a global regex carries
 * `lastIndex` between `.test` calls, which would make this predicate depend on call order.
 */
export const VIEW_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * WHAT THE `view` PARAM SAYS, in three mutually exclusive states.
 *
 * `absent` covers two different URLs with one answer: no `view` key, and a `view` key whose value is
 * neither the escape nor an id. A junk value is ABSENT rather than an error because this module's
 * whole posture is that a strange URL renders a page — there is no `error.tsx` above any of the four
 * list routes, so an error state here is a blank page.
 */
export type ViewSelection =
  | { readonly kind: "absent" }
  | { readonly kind: "escape" }
  | { readonly kind: "selection"; readonly viewId: string }

/** Shared results, frozen so a caller cannot grow or edit one. */
const VIEW_ABSENT: ViewSelection = Object.freeze({ kind: "absent" as const })
const VIEW_ESCAPE: ViewSelection = Object.freeze({ kind: "escape" as const })

/**
 * Never stored in a view's `filters`, on any surface (U-3).
 *
 * `page` because a view lands you on page 1 by definition — storing it would make "open my view"
 * mean "open my view at whatever page I happened to be on when I saved it". `view` because it is
 * this module's own control param and a view that stored it could nominate a different view.
 *
 * Both are also absent from every `SAVEABLE_FILTER_KEYS` row below, so this array is not the
 * mechanism that excludes them — the whitelist is. It is here so the exclusion is nameable and
 * assertable rather than implicit in four literal arrays.
 */
export const EXCLUDED_URL_KEYS: readonly string[] = Object.freeze(["page", "view"])

/**
 * A filter value longer than this is treated as absent (T-40-02).
 *
 * 256 characters: a uuid is 36, an ISO date is 10, and the longest legitimate value is a free-text
 * search a human typed into an `<Input>`. The cap's job is narrower than "validate the value" —
 * it stops a megabyte of text being carried into an ILIKE pattern, into a JSONB column and into a
 * log line, the same concern `MAX_PAGE_DIGITS` covers for `/duplicates`. It deliberately does NOT
 * try to decide whether a 40-character string is a real uuid; the queries own that, and a parser
 * that repairs input is a parser that can be steered.
 */
export const MAX_FILTER_VALUE_LENGTH = 256

/**
 * The four entity types, in the order the tables below list them.
 *
 * This array is the MEMBERSHIP TEST for an entity type reaching this module — including one that
 * arrived from a stored row rather than from a typed call site. It has to be an array scan and not
 * a property lookup on the tables: `SAVEABLE_FILTER_KEYS["__proto__"]` is `Object.prototype`, an
 * object with no `.includes`, so a property lookup would turn a crafted entity type into a
 * `TypeError` — which is exactly what this module promises not to do. The `parseTrashTab` precedent.
 *
 * Exhaustiveness is enforced by the tables themselves (`Record<ViewEntityType, …>` is a compile
 * error if a fifth entity type is added without a row), and the unit gate asserts this array and
 * those keys are the same set, so the two halves cannot drift.
 */
export const VIEW_ENTITY_TYPES = Object.freeze([
  "organization",
  "person",
  "deal",
  "activity",
] as const) satisfies readonly ViewEntityType[]

/**
 * WHAT A SAVED VIEW MAY CONTAIN, per entity type. This table IS the definition (U-3) — every key a
 * view stores, every key the picker writes to the URL, and every key the manage dialog counts.
 *
 * It matches what each list page actually reads today and nothing more: Phase 40 adds no filters
 * (Decision 1), so `organization` and `person` carry the single `search` param their pages have
 * (`organizations/page.tsx:67`, `people/page.tsx:75`), `deal` carries the six from
 * `deals/page.tsx:30-37`, and `activity` the seven filter params from `activities/page.tsx:51-60`.
 * `page` is in the activities URL contract but is not a filter, so it is not here.
 *
 * The arrays are ORDERED, and the order is load-bearing: `filtersToSearchParams` serialises in it,
 * which is what makes the stored-blob-versus-URL comparison in plan 40-05 independent of the order
 * somebody happened to insert keys in.
 */
export const SAVEABLE_FILTER_KEYS: Readonly<Record<ViewEntityType, readonly string[]>> =
  Object.freeze({
    organization: Object.freeze(["search"]),
    person: Object.freeze(["search"]),
    deal: Object.freeze(["pipeline", "stage", "owner", "assignee", "dateFrom", "dateTo"]),
    activity: Object.freeze([
      "type",
      "owner",
      "assignee",
      "status",
      "dateFrom",
      "dateTo",
      "search",
    ]),
  })

/**
 * WHICH KEYS MAY AUTHORIZE AN EXPORT, per entity type (E-2).
 *
 * THIS IS A SECOND INDEPENDENT TABLE, WRITTEN OUT IN FULL, AND IT MUST NOT BE DERIVED FROM
 * `SAVEABLE_FILTER_KEYS`. Filtering the table above with a `key !== "pipeline"` predicate would
 * produce the same four rows today and would be WRONG, because it encodes the wrong rule. The rule
 * this table states is: *every key here is applied as a SQL predicate by the matching `fetch*` in
 * `src/lib/export/formatters.ts`, so its presence provably narrows the exported row set.* "Not
 * pipeline" is a coincidence of the current data model; "narrows the query" is the invariant, it is
 * what plan 40-07 gates, and the next key that fails it will not be named `pipeline`.
 *
 * Why the divergence exists at all, and why it is the whole guard:
 *
 *   38-CONTEXT.md:110-116 forbids a filters-taking export action reachable without an admin gate,
 *   because an action handed `{}` returns all 46,054 organizations. Decision 2 amends that letter —
 *   export is available to every authenticated user (E-9) — and preserves its INTENT by refusing an
 *   empty filter set outright. But Decision 4 requires a deals view to carry its `pipeline`, and a
 *   pipeline is a BOARD SELECTOR, not a filter: the app's own UI already separates them ("Pipeline:"
 *   versus "Filters"). A pipeline-only view passes any naive non-empty test while resolving to up to
 *   25,195 deals — precisely the unbounded export the prohibition exists to prevent. So the guard
 *   needs two predicates, and this is the line where it actually falls.
 *
 * ACCEPTED CONSEQUENCE: a `/deals` view carrying only a pipeline is SAVEABLE but NOT EXPORTABLE.
 * Criterion 4 is narrowed rather than the export gate widened. If you are here to "simplify" these
 * two tables into one, that is the hole you would be reopening (40-CONTEXT amendment A2).
 */
export const EXPORTABLE_FILTER_KEYS: Readonly<Record<ViewEntityType, readonly string[]>> =
  Object.freeze({
    organization: Object.freeze(["search"]),
    person: Object.freeze(["search"]),
    // No `pipeline`. See the paragraph above before adding it.
    deal: Object.freeze(["stage", "owner", "assignee", "dateFrom", "dateTo"]),
    activity: Object.freeze([
      "type",
      "owner",
      "assignee",
      "status",
      "dateFrom",
      "dateTo",
      "search",
    ]),
  })

/**
 * Anything a filter map can arrive as.
 *
 * `URLSearchParams` covers both ends of a navigation (`useSearchParams()` returns a read-only
 * subclass); the record form covers Next.js's `await searchParams`, where a repeated param is an
 * array; and `unknown` values rather than `string` values are deliberate, because the third caller
 * is a JSONB blob whose contents no type system has ever checked.
 */
export type FilterParamSource =
  | URLSearchParams
  | Readonly<Record<string, unknown>>
  | null
  | undefined

/** Shared empty result for an unrecognised entity type. Frozen so no caller can grow it. */
const NO_KEYS: readonly string[] = Object.freeze([])

/**
 * The keys a table holds for an entity type, or none at all for an entity type that is not one of
 * the four. A membership scan, never a property lookup — see `VIEW_ENTITY_TYPES`.
 */
function keysFor(
  table: Readonly<Record<ViewEntityType, readonly string[]>>,
  entityType: ViewEntityType,
): readonly string[] {
  const known = VIEW_ENTITY_TYPES.find((candidate) => candidate === entityType)

  return known === undefined ? NO_KEYS : table[known]
}

/**
 * The first value of a param.
 *
 * `?search=a&search=b` arrives as an array from `await searchParams`. Taking the first entry rather
 * than rejecting the pair keeps the surface's posture: a strange URL renders a page, it does not
 * produce an error.
 */
function firstParam(raw: unknown): unknown {
  return Array.isArray(raw) ? raw[0] : raw
}

/**
 * Read one whitelisted key out of any source shape, without ever reaching a prototype.
 *
 * The `hasOwnProperty` guard is what stops an inherited member being read as a value — `toString`
 * is not on any whitelist today, but the guard means the whitelist is the only thing standing
 * between this function and a function-valued "filter" if one ever were. The `try` is for a source
 * carrying an accessor: a getter that throws is a bizarre input, and a bizarre input must still
 * produce a page.
 */
function readRawValue(source: FilterParamSource, key: string): unknown {
  if (source === null || source === undefined) return undefined
  if (typeof source !== "object") return undefined

  try {
    if (source instanceof URLSearchParams) return source.get(key) ?? undefined
    if (!Object.prototype.hasOwnProperty.call(source, key)) return undefined

    return (source as Record<string, unknown>)[key]
  } catch {
    return undefined
  }
}

/**
 * A raw param value narrowed to a usable filter value, or `undefined` for anything else.
 *
 * Three rejections, each with its own reason:
 *   - NOT A STRING. A number, an object or a `null` out of a JSONB blob is dropped rather than
 *     coerced: `String(value)` on an object runs a `toString` the blob supplied.
 *   - BLANK. `""` and `"   "` are ABSENT, not present-and-empty — an empty search box is not a
 *     filter, and this is the exact case that must not bounce a user into their default view.
 *   - TOO LONG (T-40-02). See `MAX_FILTER_VALUE_LENGTH`.
 *
 * The value that survives is returned VERBATIM, untrimmed. Trimming would be the parser repairing
 * input: it would make the URL and the stored blob disagree about what the list actually applied,
 * and the "Modified" badge is computed from exactly that comparison.
 */
function narrowFilterValue(raw: unknown): string | undefined {
  const value = firstParam(raw)

  if (typeof value !== "string") return undefined
  if (value.trim() === "") return undefined
  if (value.length > MAX_FILTER_VALUE_LENGTH) return undefined

  return value
}

/**
 * A raw `?view=` value narrowed to a view id, or `null` for anything else. Never throws.
 *
 * Trimmed, because a padded id is not an id — the same call `write-guards.ts`' `narrowViewId` makes.
 * NOT lower-cased, and that is the `narrowFilterValue` rule applied here: a parser that repairs its
 * input is a parser that can be steered, and a hand-typed upper-case uuid simply resolves to no
 * visible view, which the resolver already handles by rendering the unfiltered list.
 *
 * `"none"` is rejected explicitly, ahead of the pattern that would reject it anyway. The escape is a
 * DIFFERENT state, not a malformed id, and stating that here means `parseViewSelection` cannot be
 * reordered into treating it as one.
 *
 * THE ASYMMETRY WITH `narrowViewId` IS DELIBERATE. That one is length-bounded (1..64) because it
 * narrows a POST body about to be looked up; this one is shape-bounded because its output is echoed
 * into an address bar. Both are correct for their own job, they have disjoint consumers, and
 * `write-guards.ts` imports THIS module — so unifying them would also be a circular import.
 */
export function narrowViewSelectionId(raw: unknown): string | null {
  if (typeof raw !== "string") return null

  const trimmed = raw.trim()

  if (trimmed === VIEW_ESCAPE_VALUE) return null
  if (!VIEW_ID_PATTERN.test(trimmed)) return null

  return trimmed
}

/**
 * WHAT DOES THIS URL SAY ABOUT WHICH VIEW IS OPEN?
 *
 * The one grammar for the `view` param. `withViewEscape` reads it to decide what to preserve and
 * `resolve.ts` reads it to decide what is selected, so the escape and the selection cannot drift
 * apart into two definitions — which is the T-37-03 defect class this module exists to avoid.
 *
 * It reuses `readRawValue` and `firstParam` rather than re-reading the source shape: those two
 * already own "read one key out of any source without reaching a prototype and without throwing",
 * and a second reader would be a second thing to keep correct. The consequence worth naming is that
 * a REPEATED param takes its FIRST value, so `?view=none&view=<uuid>` is the escape — the same rule
 * `pickFilterParams` applies to a repeated filter.
 *
 * The escape is matched EXACTLY, with no trimming, which is what the merged `hasViewEscape` did
 * before this function replaced it. Widening it to `" none "` would be this parser repairing input.
 */
export function parseViewSelection(source: FilterParamSource): ViewSelection {
  const raw = firstParam(readRawValue(source, VIEW_ESCAPE_KEY))

  if (raw === VIEW_ESCAPE_VALUE) return VIEW_ESCAPE

  const viewId = narrowViewSelectionId(raw)

  return viewId === null ? VIEW_ABSENT : { kind: "selection", viewId }
}

/**
 * THE INPUT-VALIDATION CONTROL FOR THE SAVED-VIEW SURFACES (T-40-01, T-40-02).
 *
 * Whatever comes in — a crafted URL, a repeated param, a stored blob — what comes out is a plain
 * object whose keys are a subset of `SAVEABLE_FILTER_KEYS[entityType]` and whose values are
 * non-blank strings within the length cap. Nothing else can pass, because the loop walks the
 * WHITELIST and not the source: an unlisted key is never even looked up, so `page`, `view`, `sort`,
 * `__proto__` and `constructor` are all ordinary non-members rather than special cases. That is
 * also why the returned object cannot be polluted — the only keys ever assigned are the four
 * tables' literals, none of which is `__proto__`.
 *
 * Keys come out in whitelist order, so two callers that built their maps differently produce the
 * same object.
 */
export function pickFilterParams(
  entityType: ViewEntityType,
  source: FilterParamSource,
): ViewFilters {
  const picked: ViewFilters = {}

  for (const key of keysFor(SAVEABLE_FILTER_KEYS, entityType)) {
    const value = narrowFilterValue(readRawValue(source, key))

    if (value !== undefined) picked[key] = value
  }

  return picked
}

/**
 * How many filters a view carries — the number `views.manage.filterCount` renders (G-3).
 *
 * Defined as the size of the PICKED map rather than of the raw one, so the number the user reads
 * and the number the parser accepted cannot diverge. A stored blob holding a megabyte value and a
 * `page` reads as "0 filters", which is the truth about what the list will apply.
 */
export function countFilters(entityType: ViewEntityType, source: FilterParamSource): number {
  return Object.keys(pickFilterParams(entityType, source)).length
}

/**
 * A filter set as a query string, in whitelist order.
 *
 * The ORDER is the point. Plan 40-05 decides `selectedViewId` and `isModified` by comparing the
 * current URL against each stored blob; if serialisation followed `Object.keys` order, a view saved
 * as `{stage, owner}` and a URL built as `?owner=…&stage=…` would compare unequal and every view
 * would render "Modified". Ordering by the table makes the comparison a string comparison again.
 */
export function filtersToSearchParams(
  entityType: ViewEntityType,
  source: FilterParamSource,
): URLSearchParams {
  const picked = pickFilterParams(entityType, source)
  const params = new URLSearchParams()

  for (const key of keysFor(SAVEABLE_FILTER_KEYS, entityType)) {
    const value = picked[key]

    if (value !== undefined) params.set(key, value)
  }

  return params
}

/**
 * Copy a params object so the original is never written to.
 *
 * `useSearchParams()` returns a `ReadonlyURLSearchParams`, whose `set`/`delete`/`append` THROW, and
 * four of the six call sites build their query string from it. So cloning is not tidiness — it is
 * the difference between working and throwing in the browser.
 *
 * The `catch` covers the constructor rejecting an init it cannot read (a one-dimensional array, an
 * object with a throwing accessor). An unreadable source has no params worth preserving, and an
 * empty clone then takes the escape, which is the safe end of that decision: the user lands on an
 * unfiltered list rather than on an error page.
 */
function cloneSearchParams(params: URLSearchParams): URLSearchParams {
  try {
    return new URLSearchParams(params)
  } catch {
    return new URLSearchParams()
  }
}

/**
 * SERIALISE PARAMS FOR A NAVIGATION THAT DOES NOT ITSELF CHANGE THE SELECTION.
 *
 * Two things come out of that one sentence: `view=none` is appended iff no saveable filter survives
 * (U-1), and an existing `?view=<id>` selection is PRESERVED iff one does. A filter change, a
 * keystroke, a chip removal, a `clearAll` and a Load More are all navigations of this kind — they
 * change WHAT is filtered, never WHICH view you have open. `withViewSelection` is the other
 * function, for the navigation that does change it.
 *
 * WHY THIS FUNCTION EXISTS. Two locked decisions were mutually exclusive without it. The
 * default-view redirect fires when the incoming URL carries NO params — deliberately, so that a
 * bare-filter visit is never hijacked — and there is also an explicit "All records" pseudo-view as
 * the escape hatch from a default view. Selecting All records navigates to a bare path, which is
 * exactly the condition that triggers the redirect, so the user is thrown straight back into the
 * default view they were trying to leave. And it is not only that one control: SIX existing controls
 * already navigate to bare or can-be-bare paths and would each bounce the user the same way — the
 * `/organizations` and `/people` empty-search branches, `activity-filters.tsx`'s `clearAll`, its
 * `setFilter(key, "")` on the last remaining chip, `activities-client.tsx`'s no-results
 * "Clear filters" button, and `deal-filters.tsx`'s `clearAll` when no pipeline param was set. A
 * SEVENTH was found while planning: `activity-filters.tsx`'s `handleSearchChange`, which produces
 * `${pathname}?` when the search box was the last filter standing.
 *
 * WHY IT CANNOT LOOP (U-2). The redirect guard is "no params at all", and `view=none` IS a param.
 * So the escape URL is never itself bare, the redirect does not fire on it, and there is no second
 * code path for "arrived by default".
 *
 * WHY IT IS IDEMPOTENT BY CONSTRUCTION, not by luck. `view` is deleted UNCONDITIONALLY and
 * re-appended only when required, so `f(f(x)) === f(x)` holds for every input — including a URL
 * that already carries the escape, and a URL that carries a crafted `?view=<script>` (T-40-05: the
 * hostile value is deleted before anything is decided, so it can never survive into the navigation
 * target). Six call sites apply this helper and 40-14 gates them; a helper whose result changed when
 * applied twice would make the order of those applications matter.
 *
 * TWO CLASSES OF PARAM, TREATED DIFFERENTLY, AND THE DIFFERENCE IS DELIBERATE:
 *
 *   - Params this module does not own — `page`, `sort`, anything else — are PRESERVED VERBATIM.
 *     `page` in particular is what "Load more" depends on, and it does not count as a filter, so a
 *     `?page=2` URL comes back as `page=2&view=none`.
 *   - Params it DOES own (the whitelist) are REWRITTEN from `pickFilterParams`. So a key whose
 *     value the parser rejected — blank, non-string, over the length cap — is removed rather than
 *     left in the address bar meaning nothing, and a repeated key collapses to its first value.
 *     `?search=` therefore comes back as plain `view=none`, which is what `/organizations` and
 *     `/people` already do today: their empty-search branch pushes the bare path with no `search`
 *     key at all (`organizations/data-table.tsx:293`), and routing that through this helper must not
 *     start leaving a `?search=` behind. The side benefit is a canonical key order for the
 *     whitelisted portion, which is what lets plan 40-05 compare a URL to a stored blob as strings.
 *
 * NOTE FOR THE READER WHO CHECKS THIS AGAINST 40-01-PLAN.md: the plan's five-step recipe (clone,
 * delete `view`, pick, maybe set, stringify) does NOT produce the plan's own asserted result for
 * `?search=` — it would return `search=&view=none`. The assertion is the contract and the recipe was
 * incomplete; the rewrite loop below is the reconciliation. Recorded in 40-01-SUMMARY.md.
 *
 * WHY A SELECTION IS PRESERVED HERE RATHER THAN DELETED (plan 40-18, and this paragraph is the
 * reason the plan existed). As merged, this function deleted `view` unconditionally and re-appended
 * only the escape. Thirteen call sites route through it and EVERY ONE of them is a filter change, a
 * search change, a clear or a page change — so the first keystroke after opening a view destroyed
 * the selection. Plan 40-05 then measured the consequence: `selectedViewId` was derived from filter
 * equality and `computeIsModified` compared the same two sets, so `selected && modified` was
 * unrepresentable. 10 URLs x 3 views, 2 selections, ZERO modified. Three designed surfaces were
 * unreachable: the "view selected, modified" state, slot 2's `views.saveChanges` (B-5) and the save
 * dialog's target `RadioGroup` (S-3/S-4). "Update an existing view" was impossible.
 *
 * NO CALL SITE NEEDS EDITING TO GET PRESERVATION. That is why the rule lives in this helper instead
 * of being threaded as a prop through six files: every writer already passes the current
 * `useSearchParams()`, which already carries the `view` key, so the selection survives by virtue of
 * being in the input. Thirteen call sites, zero edits.
 *
 * ESCAPE AND SELECTION ARE MUTUALLY EXCLUSIVE, AND NO-FILTERS WINS. A URL naming two views is
 * meaningless, so at most one `view` key is ever emitted. When the last filter goes, the selection
 * goes with it and the escape takes over: a view must carry at least one whitelisted key to be
 * saveable at all (U-2), so "this view, with no filters" is not a state that can exist.
 *
 * THE UUID NARROWING IS ASSERTED SOMEWHERE ELSE THAN YOU WOULD EXPECT, and this was measured. The
 * hostile-value test above (T-40-05) passes IDENTICALLY with a permissive 1..64-character parser,
 * because it feeds hostile values with NO filter present and the no-filters branch returns
 * `view=none` either way. The rows that discriminate carry a hostile value ALONGSIDE a surviving
 * filter — `?search=acme&view=%3Cscript%3E`, `?search=acme&view=a&view=b` — and they live in
 * `describe("withViewEscape PRESERVES a selection")`. Loosen `narrowViewSelectionId` and those go
 * red while T-40-05 stays green.
 */
export function withViewEscape(entityType: ViewEntityType, params: URLSearchParams): string {
  // Read BEFORE the clone is written to, because the delete below is what erases the answer.
  const selection = parseViewSelection(params)
  const clone = cloneSearchParams(params)
  const saveableKeys = keysFor(SAVEABLE_FILTER_KEYS, entityType)

  // Unconditional deletes first, re-appends second: that ordering is what makes the function
  // idempotent by construction rather than by luck, and it is what stops a crafted `?view=`
  // surviving into the navigation target.
  clone.delete(VIEW_ESCAPE_KEY)

  const picked = pickFilterParams(entityType, clone)

  for (const key of saveableKeys) clone.delete(key)

  for (const key of saveableKeys) {
    const value = picked[key]

    if (value !== undefined) clone.set(key, value)
  }

  if (Object.keys(picked).length === 0) {
    clone.set(VIEW_ESCAPE_KEY, VIEW_ESCAPE_VALUE)
  } else if (selection.kind === "selection") {
    // A filter survived and the URL named a view: the user changed a filter WITH that view open, so
    // it stays open and `isModified` becomes true. This is the branch 40-05's measurement was
    // missing. A hostile value never reaches here — it parsed as `absent` and was deleted above.
    clone.set(VIEW_ESCAPE_KEY, selection.viewId)
  }

  return clone.toString()
}

/**
 * SERIALISE A NAVIGATION THAT OPENS A VIEW: its filters, in canonical order, plus `view=<id>`.
 *
 * The counterpart to `withViewEscape`, and the difference between the two is the whole point of
 * having both. This one is a FRESH navigation INTO a view, so it starts clean: `page` and every other
 * param this module does not own are DROPPED, because V-9 says a view lands you on page 1 and a view
 * that reopened at whatever page you were on when you saved it is not the view you saved.
 * `withViewEscape` is a modification of the URL you are already on, so it keeps those params.
 *
 * TWO REFUSALS, both delegating to `withViewEscape` so there is one definition of "what a navigation
 * with no filters looks like":
 *
 *   - NO SAVEABLE FILTER SURVIVES. A view must carry at least one whitelisted key to be saveable
 *     (U-2), so "selected, with no filters" is not a state and the bar must not mint one. Refusing
 *     here rather than trusting the caller is the T-40-90 mitigation: a selection over an unfiltered
 *     list would be a URL asserting something the write side cannot produce.
 *   - THE ID FAILS `narrowViewSelectionId`. A caller must not be able to put a string in the address
 *     bar that a crafted URL could not (T-40-85). The result is the filters with NO `view` key —
 *     never a junk one.
 */
export function withViewSelection(
  entityType: ViewEntityType,
  filters: FilterParamSource,
  viewId: string,
): string {
  // Whitelist-only by construction: `filtersToSearchParams` emits the picked map in canonical order
  // and nothing else, so `page`, `sort` and any pre-existing `view` are gone before we start.
  const params = filtersToSearchParams(entityType, filters)
  const narrowed = narrowViewSelectionId(viewId)

  if (narrowed === null || params.toString() === "") return withViewEscape(entityType, params)

  params.set(VIEW_ESCAPE_KEY, narrowed)

  return params.toString()
}

/**
 * MAY THIS FILTER SET BE SAVED AS A VIEW? Counts every whitelisted key, `pipeline` INCLUDED.
 *
 * `pipeline` counts because Decision 4 requires a deals view to carry the board it was saved on —
 * a `/deals` view without one is not reproducible. So a pipeline-only deals view is saveable, and
 * `hasExportableFilter` is where that stops being true.
 *
 * Computed from the PICKED map, so an over-long, blank or non-string value cannot authorize
 * anything: what the guard tests is what the list will actually apply.
 */
export function hasSaveableFilter(
  entityType: ViewEntityType,
  source: FilterParamSource,
): boolean {
  const table = keysFor(SAVEABLE_FILTER_KEYS, entityType)

  return Object.keys(pickFilterParams(entityType, source)).some((key) => table.includes(key))
}

/**
 * MAY THIS FILTER SET AUTHORIZE AN EXPORT? Counts only keys that provably narrow the query, so on
 * `/deals` it does NOT count `pipeline`.
 *
 * This is NOT `hasSaveableFilter`, and it is not derived from it. It reads its own table for the
 * reason spelled out over `EXPORTABLE_FILTER_KEYS`: a board selector scoping 25,195 deals is the
 * unbounded export 38-CONTEXT.md:110-116 forbids, and Phase 40 replaced that admin gate with this
 * predicate. If this function ever returns `true` for a pipeline-only deals view, the phase has
 * made the hole wider than it found it.
 *
 * Written as its own `some` over its own table rather than as `hasSaveableFilter(…) && …` for the
 * same reason: the two are independent questions that happen to agree on three of four surfaces.
 */
export function hasExportableFilter(
  entityType: ViewEntityType,
  source: FilterParamSource,
): boolean {
  const table = keysFor(EXPORTABLE_FILTER_KEYS, entityType)

  return Object.keys(pickFilterParams(entityType, source)).some((key) => table.includes(key))
}
