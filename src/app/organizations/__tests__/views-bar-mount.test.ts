/**
 * THE R-40-2c / B-6 / T-40-50 TABLE GATE — a source read over `/organizations/data-table.tsx` and
 * `/people/data-table.tsx`, the two tables this plan mounts the saved-views bar on.
 *
 * Three properties, and each one is a defect that was measured rather than imagined:
 *
 *   1. THE BAR IS ON ITS OWN ROW, ABOVE THE TOOLBAR, NEVER MERGED INTO IT (R-40-2c). Both toolbars
 *      ALREADY wrap to two rows at 320px with the three controls they carry (M-4: search cluster 50 +
 *      "Find duplicates" 133 on row 1, "Add …" 171 on row 2). A fourth and fifth control on that row
 *      makes four rows of ungrouped buttons, and it also mixes "which slice of the list am I seeing"
 *      with "search and create" — different questions. The bar is also NOT sticky and NOT fixed (K-8):
 *      `bulk-action-bar.tsx` already owns one fixed bar on this page and D-45-02 is an open UAT item
 *      about a fixed bar occluding content.
 *   2. THE SEARCH INPUT RE-SYNCS WHEN THE URL CHANGES (B-6). `defaultValue` is ignored after mount and
 *      app-router navigation re-renders WITHOUT remounting, so applying a view that stores
 *      `search=acme` filters the list and leaves the box showing whatever was there before — measured,
 *      M-9: typed "acme" on `/organizations`, pressed Back, URL returned to `/organizations` with the
 *      input still reading "acme". `key={search}` is the fix; a controlled `value={search}` is NOT,
 *      because these are 300ms-debounced writers and a value fed from the URL fights its own debounce
 *      on every keystroke. Both halves are asserted.
 *   3. EVERY LIST-ROUTE NAVIGATION GOES THROUGH `withViewEscape` (T-40-50), and the DETAIL-route one
 *      does not. The empty-search branch is the site that matters: it used to push the bare
 *      `"/organizations"`, which the new redirect guard reads as "no params" — so a user clearing
 *      their search box would land back inside the default view they were trying to leave.
 *
 * `readStrippedSource` runs first, so the prose above cannot satisfy anything below. Every assertion
 * is scoped to an extracted element or an extracted argument list, never to the whole file.
 *
 * WHAT THIS TEST IS NOT: it renders nothing and measures nothing. It cannot know that either toolbar
 * fits at 320px (that measurement belongs to 39-17), and it cannot observe a remount. The behavioural
 * halves are manual and are recorded in 40-11-SUMMARY.md.
 */
import { describe, it, expect } from "vitest"

import {
  callArguments,
  elementRegion,
  openingTagAt,
  readStrippedSource,
  tagIndexes,
} from "@/components/custom-fields/__tests__/source-scan"

interface Table {
  /** Human name used in every failure message. */
  label: string
  path: string
  /** The `ViewEntityType` literal every `withViewEscape` call on this surface must pass. */
  entityType: string
  /** This surface's list route. */
  route: string
}

const TABLES: Table[] = [
  {
    label: "organizations/data-table.tsx",
    path: "src/app/organizations/data-table.tsx",
    entityType: "organization",
    route: "/organizations",
  },
  {
    label: "people/data-table.tsx",
    path: "src/app/people/data-table.tsx",
    entityType: "person",
    route: "/people",
  },
]

/** The root stack both tables return. The bar must be its FIRST child. */
const ROOT = '<div className="space-y-4">'

/** The toolbar row's opening marker — the same literal `toolbar-wiring.test.ts` scopes to. */
const TOOLBAR = '<div className="flex flex-wrap'

/**
 * The toolbar row region, by tag depth.
 *
 * Sliced at the row's own opening tag and handed to the SHARED `elementRegion`, rather than
 * re-implementing a `<div>` depth walk: `elementRegion` takes the first `<div` in what it is given, so
 * the slice is what says WHICH div. This is the reason it has no "nth occurrence" parameter.
 */
function toolbarRegion(source: string, label: string): string {
  const at = source.indexOf(TOOLBAR)
  if (at === -1) {
    throw new Error(
      `${label}: no wrapping toolbar row found — the row's opening tag no longer carries flex-wrap ` +
        `(R-5), which is the Phase 45 defect toolbar-wiring.test.ts exists for.`
    )
  }

  return elementRegion(source.slice(at), "div", label)
}

describe.each(TABLES)("$label — the bar, the input and the escaped writers", (table) => {
  const read = () => readStrippedSource(table.path)

  it(`${table.label}: the bar is mounted exactly once, spread from one prop`, () => {
    const source = read()
    const mounts = tagIndexes(source, "SavedViewsBar")

    // The 45-09 counting precedent: two copies of the same control are how the copies drift apart.
    expect(mounts).toHaveLength(1)

    const tag = openingTagAt(source, mounts[0], "<SavedViewsBar>", table.label)

    // ASSERTED VERBATIM, whitespace-normalised. The equality is what proves the ABSENCE of a
    // `className` — no `sticky`, no `fixed`, no wrapper positioning (K-8) — and that the eight props
    // are spread from the single resolved object rather than threaded one by one.
    expect(tag.replace(/\s+/g, " ")).toBe("<SavedViewsBar {...viewsBar} />")
  })

  it(`${table.label}: the bar is the FIRST child of the root stack, on its own row`, () => {
    const source = read()
    const rootAt = source.indexOf(ROOT)
    expect(rootAt).toBeGreaterThan(-1)

    const [barAt] = tagIndexes(source, "SavedViewsBar")
    expect(barAt).toBeDefined()

    // Nothing at all between the stack's opening tag and the bar. Comments are already stripped, so
    // an empty slice means no wrapper div, no sticky container and no sibling smuggled in front of
    // it — the bar owns the first row of the table's own vertical rhythm.
    expect(source.slice(rootAt + ROOT.length, barAt).trim()).toBe("")
  })

  it(`${table.label}: the bar is NOT inside the toolbar row (R-40-2c)`, () => {
    const source = read()
    const region = toolbarRegion(source, table.label)

    // Anti-vacuity first: an empty or wrong region would make the real assertion unreachable.
    expect(region.length).toBeGreaterThan(200)
    expect(region).toContain("<Input")
    expect(region).toContain("findDuplicates")

    expect(region).not.toContain("SavedViewsBar")
  })

  it(`${table.label}: the search Input carries key={search} beside defaultValue (B-6, M-9)`, () => {
    const source = read()
    const region = toolbarRegion(source, table.label)
    const [inputAt] = tagIndexes(region, "Input")
    expect(inputAt).toBeDefined()

    const tag = openingTagAt(region, inputAt, "<Input>", table.label)

    expect(tag).toContain("key={search}")
    // `defaultValue` STAYS. `key` is what makes it take effect again: it remounts only when the URL
    // actually changes, which is exactly the event that must reset the box.
    expect(tag).toContain("defaultValue={search}")
  })

  it(`${table.label}: the search Input was NOT converted to a controlled input`, () => {
    const source = read()
    const region = toolbarRegion(source, table.label)
    const [inputAt] = tagIndexes(region, "Input")
    const tag = openingTagAt(region, inputAt, "<Input>", table.label)

    // SUBSTRING COLLISION, CHECKED DELIBERATELY (the 40-09 lesson, where `Check` matched inside
    // `onCheckedChange`): `defaultValue={` contains `Value={` with a CAPITAL V, so the lowercase
    // `value={` below cannot match it. Verified by the row above, which requires `defaultValue={`
    // to be present in the very same extracted tag this row requires `value={` to be absent from.
    expect(tag).not.toContain("value={")
  })

  it(`${table.label}: there are exactly three withViewEscape sites, all for ${table.entityType}`, () => {
    const calls = callArguments(read(), "withViewEscape")

    // Three list-route navigations on this surface: search-with-a-value, search-cleared, Load More.
    expect(calls).toHaveLength(3)
    for (const args of calls) expect(args).toContain(`"${table.entityType}"`)
  })

  it(`${table.label}: every list-route push is escaped and none targets the bare path`, () => {
    const pushes = callArguments(read(), "router.push")

    // Four navigations in this file: three on the list route plus the keyboard hook's detail one.
    expect(pushes).toHaveLength(4)

    const listPushes = pushes.filter((args) => args.includes(`${table.route}?`))
    expect(listPushes).toHaveLength(3)
    for (const args of listPushes) expect(args).toContain("withViewEscape")

    // THE BARE PATH IS THE DEFECT (T-40-50). `push("/organizations")` is what the empty-search branch
    // used to do, and the redirect guard reads it as "no params" — so clearing the search box would
    // bounce the user back into the view they were leaving. Both quoting styles are checked because
    // the original was a plain string and the escaped form is a template literal.
    const bare = pushes.filter(
      (args) => args.trim() === `"${table.route}"` || args.trim() === `\`${table.route}\``
    )
    expect(bare).toHaveLength(0)
  })

  it(`${table.label}: the DETAIL-route push is left alone (40-14's named exemption)`, () => {
    const pushes = callArguments(read(), "router.push")
    const detail = pushes.filter((args) => args.includes(`${table.route}/$`))

    expect(detail).toHaveLength(1)
    // It targets a record route, not the list route, so escaping it would be nonsense. Plan 40-14's
    // call-site gate carries it as a named exemption and matches its expression text, which is why
    // this row asserts the ABSENCE rather than leaving the question open.
    expect(detail[0]).not.toContain("withViewEscape")
  })

  it(`${table.label}: the debounced writer escapes both branches and stays debounced`, () => {
    const timeouts = callArguments(read(), "setTimeout")

    // One debounced writer per table. `clearTimeout(` does not contain `setTimeout(`, and the ref's
    // `ReturnType<typeof setTimeout>` is not a call, so this is the search writer alone.
    expect(timeouts).toHaveLength(1)

    const body = timeouts[0]
    expect(body).toContain("300")
    expect(body.split("router.push").length - 1).toBe(2)
    expect(body.split("withViewEscape").length - 1).toBe(2)
    // The cleared-search branch builds its params FRESH: clearing the only filter of a view leaves no
    // filter, so no selection is coherent (U-2) and `withViewEscape` answers `view=none` either way.
    expect(body).toContain("new URLSearchParams()")
  })

  it(`${table.label}: the writers seed view from the RESOLVED id, not from useSearchParams`, () => {
    const source = read()

    // A `new URLSearchParams()` seeded only with `search` and `page` DROPS `view` and destroys the
    // selection on the first keystroke — precisely the defect plan 40-18 exists to fix. The seed is
    // the resolved id, under a null guard so the key is never set to the string "null".
    expect(source).toContain("selectedViewId !== null")
    const sets = callArguments(source, "params.set")
    expect(sets.some((args) => args.includes("VIEW_ESCAPE_KEY") && args.includes("selectedViewId")))
      .toBe(true)

    // ONE Suspense-wrapped consumer of the hook per page, and it is the bar. A second one here buys
    // nothing and the resolved id is strictly better than the raw param anyway.
    expect(source).not.toContain("useSearchParams")
  })
})
