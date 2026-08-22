/**
 * V-40-5 — THE SAVED-VIEWS-BAR WIRING GATE. A scoped source read over `saved-views-bar.tsx`, plus a
 * PARSED read of the interface declaration in `src/lib/views/types.ts`.
 *
 * WHAT THIS TEST IS NOT. It measures NOTHING. No browser runs here, so it cannot know that the bar
 * fits 320px, that the picker menu's two-line items are legible at 241px, or that the trigger and a
 * 139px "Guardar cambios" wrap to two rows rather than overflowing. **All real measurement belongs to
 * plan 40-15.** This file knows only that the classes and the wiring which make those outcomes
 * POSSIBLE are present, and it is deliberately not written in a way that could be mistaken for that
 * proof.
 *
 * ITS TWO HEADLINE ASSERTIONS ARE V-40-5's:
 *
 *   1. THE PARSED INTERFACE. `SavedViewsBarProps` names EXACTLY the eight B-2 properties — parsed out
 *      of the declaration, not grepped for. A ninth means somebody moved a derivation to the client; a
 *      missing one means the server stopped computing something. The gate reads
 *      `src/lib/views/types.ts`, which is where the interface actually lives, and it VERIFIES that
 *      before asserting anything: a stale assertion naming the wrong file propagated into three Phase
 *      39 documents while proving nothing.
 *   2. THE BAR DERIVES NOTHING. No comparison of `useSearchParams()` output against a `filters`
 *      object, and no local declaration of `isModified` or `droppedFilterKeys`. Both manifest as "the
 *      URL differs from the stored blob" and only the server knows WHICH — a key the user changed
 *      versus a key the read-side validator dropped. A client comparing the two labels every DEGRADED
 *      view "Modified" and invites the user to save the damage.
 *
 * EVERY ASSERTION IS SCOPED TO AN EXTRACTED ELEMENT, never made against the whole file except where
 * the rule IS a file-wide absence, and `readStrippedSource` removes comments FIRST — so the prose
 * above, which names classes and identifiers this file asserts, cannot satisfy anything below. That is
 * the K-9 trap Phase 39 hit five times: a gate satisfied by the comment explaining the rule it was
 * meant to enforce.
 *
 * ON THE EXTRACTORS — IMPORTED, NOT WRITTEN. `openingTagAt`, `tagIndexes`, `elementRegion` and
 * `callArguments` come from `source-scan.ts`, where plan 40-09 promoted them out of 40-08's gate.
 * **No brace matcher and no tag matcher was added to the repo by this plan.** The helpers below are
 * one-line compositions over those four, a `split`, and a `matchAll`. The one place a body has to be
 * sliced without them — the `export interface` block in `types.ts` — is bounded by a `}` at column
 * ZERO rather than by brace counting, and that choice is stated at the call site.
 */
import { describe, expect, it } from "vitest"

import {
  callArguments,
  elementRegion,
  openingTagAt,
  readStrippedSource,
  tagIndexes,
} from "@/components/custom-fields/__tests__/source-scan"

const COMPONENT = "src/components/views/saved-views-bar.tsx"
const TYPES = "src/lib/views/types.ts"

/** Read fresh inside every test, so one missing class reports as a named failing assertion. */
const read = () => readStrippedSource(COMPONENT)

function openingTags(source: string, tagName: string): string[] {
  return tagIndexes(source, tagName).map((at) =>
    openingTagAt(source, at, `<${tagName}`, COMPONENT)
  )
}

/** The single `<${tagName}` opening tag, refusing zero and refusing two. */
function soleOpeningTag(source: string, tagName: string): string {
  const tags = openingTags(source, tagName)

  if (tags.length !== 1) {
    throw new Error(
      `${COMPONENT}: expected exactly one <${tagName} in this file, found ${tags.length}. ` +
        `A second copy of the same element is how two of them drift apart and one stops being ` +
        `maintained (the 45-09 counting precedent).`
    )
  }

  return tags[0]
}

/** The opening tag that contains the byte at `at`. */
function tagContaining(source: string, at: number): string {
  const open = source.lastIndexOf("<", at)
  if (open === -1) throw new Error(`${COMPONENT}: no opening tag encloses offset ${at}`)

  return openingTagAt(source, open, `the tag enclosing offset ${at}`, COMPONENT)
}

/** The opening tag that carries `marker`, refusing a marker that appears nowhere. */
function tagCarrying(source: string, marker: string): string {
  const at = source.indexOf(marker)
  if (at === -1) throw new Error(`${COMPONENT}: ${marker} appears nowhere in the source`)

  return tagContaining(source, at)
}

function offsetsOf(source: string, pattern: RegExp): number[] {
  return [...source.matchAll(pattern)].map((match) => match.index ?? -1)
}

function occurrences(source: string, needle: string): number {
  return source.split(needle).length - 1
}

/** A single className token, so `flex` is not satisfied by `flex-wrap`. */
function hasClass(tag: string, token: string): boolean {
  return new RegExp(`(?<![\\w-])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`).test(tag)
}

/*
 * THE JSX TEXT-RUN EXTRACTOR (assertion 13's instrument).
 *
 * A text node is what sits between a tag's closing `>` and the next `<`. Finding those `>` by regex
 * is unsound — `=>` and `length > 0` both produce one, and a TypeScript generic (`useState<boolean>`)
 * produces a `<` that is not a tag — so the run boundaries are ANCHORED ON REAL TAGS: every
 * `<Uppercase…` / `</Uppercase…` plus the three lowercase elements this component uses, with
 * `openingTagAt` (string- and brace-aware) supplying the true end of each opening tag. A generic is
 * therefore never mistaken for a tag, and a `>` inside a className string never ends a run.
 */
const TAG_ANCHOR = /<\/?(?:[A-Z][\w.]*|div|span|p)\b/g

function textRuns(source: string): string[] {
  const runs: string[] = []

  for (const match of source.matchAll(TAG_ANCHOR)) {
    const at = match.index ?? -1
    let end: number

    if (source.startsWith("</", at)) {
      end = source.indexOf(">", at)
      if (end === -1) throw new Error(`${COMPONENT}: unterminated closing tag ${match[0]}`)
    } else {
      end = at + openingTagAt(source, at, match[0], COMPONENT).length - 1
    }

    const next = source.indexOf("<", end + 1)
    runs.push(source.slice(end + 1, next === -1 ? source.length : next))
  }

  return runs
}

/** The eight B-2 properties, in the order `types.ts` declares them. */
const BAR_PROPS = [
  "entityType",
  "views",
  "selectedViewId",
  "isModified",
  "droppedFilterKeys",
  "canSave",
  "canExport",
  "canUpdateSelected",
]

/** The eighteen bar-level `views.*` keys. `save.*`, `manage.*` and `delete.*` belong to the dialogs. */
const BAR_KEYS = [
  "picker.label",
  "allRecords",
  "modified",
  "groupMine",
  "groupShared",
  "badgeShared",
  "badgePrivate",
  "badgeDefault",
  "ownedBy",
  "ownerUnavailable",
  "emptyMenu",
  "saveNew",
  "saveChanges",
  "manageAction",
  "exportAction",
  "exporting",
  "needsFilter",
  "degraded",
]

/** The three `views.export.*` keys — the two the `bulk` namespace cannot say, plus E-3's reason. */
const EXPORT_KEYS = ["export.disabledReason", "export.tooMany", "export.refused"]

/** REUSED VERBATIM from a namespace this phase does not own (E-7, E-8). Zero new keys. */
const BULK_KEYS = ["exported", "error.exportFailed"]

const B2_REASON =
  `B-2: isModified and droppedFilterKeys BOTH manifest as "the URL differs from the stored blob", ` +
  `and only the server knows which — a key the user changed, or a key the read-side validator ` +
  `dropped because its target no longer exists. A client that compares the two labels every ` +
  `DEGRADED view "Modified" and invites the user to save the damage.`

describe("V-40-5 — the saved-views-bar wiring gate", () => {
  it("1. B-2: SavedViewsBarProps declares EXACTLY the eight props, parsed from types.ts", () => {
    const types = readStrippedSource(TYPES)
    const head = "export interface SavedViewsBarProps {"
    const at = types.indexOf(head)

    /*
     * VERIFY THE FILE FIRST. A stale assertion naming the wrong file propagated into three Phase 39
     * documents while proving nothing, so this gate refuses to assert on a declaration it has not
     * found. The interface lives in `types.ts` and not in the component because the server resolver
     * (plan 40-05) returns exactly this shape — a client module must not be in a server import graph
     * — and because ONE declaration cannot drift from itself.
     */
    expect(
      at,
      `${TYPES} does not declare "export interface SavedViewsBarProps". This gate reads THAT file ` +
        `because that is where the interface lives; if it moved, this assertion is measuring nothing ` +
        `and must be repointed rather than deleted.`
    ).toBeGreaterThan(-1)

    /*
     * The body is bounded by a `}` at COLUMN ZERO — Prettier's shape for a top-level declaration in
     * this repo — rather than by brace counting. That is deliberate: the repo already carries two
     * brace matchers on BACKLOG awaiting consolidation and this phase has added none. A nested inline
     * object type would be indented, so it cannot close the region early.
     */
    const end = types.indexOf("\n}", at)

    expect(
      end,
      `${TYPES}: the SavedViewsBarProps declaration has no closing } at column zero.`
    ).toBeGreaterThan(at)

    const body = types.slice(at + head.length, end)
    const parsed = body
      .split("\n")
      .map((line) => /^ {2}(?:readonly )?([A-Za-z_$][\w$]*)\s*\??\s*:/.exec(line)?.[1])
      .filter((name): name is string => name !== undefined)

    expect(
      parsed.length,
      `${TYPES}: SavedViewsBarProps must declare exactly 8 properties (B-2). Found ` +
        `${parsed.length}: ${parsed.join(", ")}. A NINTH property means a derivation moved to the ` +
        `client; a MISSING one means the server stopped computing something the bar renders. ` +
        `${B2_REASON}`
    ).toBe(8)

    expect(
      [...parsed].sort(),
      `${TYPES}: SavedViewsBarProps must name exactly ${BAR_PROPS.join(", ")}. Found: ` +
        `${parsed.join(", ")}.`
    ).toEqual([...BAR_PROPS].sort())

    /*
     * ONE declaration, not two. The component RE-EXPORTS the type so its callers can name it without
     * a second interface that can drift.
     */
    const source = read()

    expect(
      source,
      `${COMPONENT} must re-export the props type from ${TYPES} rather than restate it.`
    ).toContain('export type { SavedViewsBarProps } from "@/lib/views/types"')

    expect(
      occurrences(source, "interface SavedViewsBarProps"),
      `${COMPONENT} declares its own SavedViewsBarProps. There must be exactly ONE declaration, in ` +
        `${TYPES}, or the two drift and the parsed assertion above stops describing what the ` +
        `component actually accepts.`
    ).toBe(0)
  })

  it("2. B-2: the bar derives NOTHING — no URL-versus-blob comparison, no local isModified", () => {
    const source = read()

    /*
     * (a) THE FILTER CALLS. Whatever the bar does with a filter map, it does not COMPARE one: no
     * equality operator and no JSON.stringify inside the arguments of the three functions that
     * handle filter maps.
     */
    for (const callee of ["pickFilterParams", "filtersToSearchParams", "withViewEscape"]) {
      for (const args of callArguments(source, callee)) {
        expect(
          args,
          `${COMPONENT}: ${callee}(${args.trim()}) compares filter maps. ${B2_REASON}`
        ).not.toMatch(/===|!==|JSON\.stringify/)
      }
    }

    // ANTI-VACUITY: the bar must actually pick its filters through the 40-01 whitelist.
    expect(
      callArguments(source, "pickFilterParams").length,
      `${COMPONENT}: pickFilterParams is never called, so the loop above asserted nothing and the ` +
        `bar is handing an unfiltered param bag to the export action and the save dialog.`
    ).toBeGreaterThan(0)

    // (b) THE COMPARISON ITSELF, AND ITS MIRROR IMAGE.
    const forward = /(searchParams|urlFilters)[^;\n]*(===|!==|JSON\.stringify)[^;\n]*(\.filters)/
    const mirror = /(\.filters)[^;\n]*(===|!==|JSON\.stringify)[^;\n]*(searchParams|urlFilters)/

    expect(
      source,
      `${COMPONENT}: the URL is compared against a stored filters blob. ${B2_REASON}`
    ).not.toMatch(forward)

    expect(
      source,
      `${COMPONENT}: a stored filters blob is compared against the URL. ${B2_REASON}`
    ).not.toMatch(mirror)

    /*
     * (c) THE SHARPEST FORM OF B-2. `isModified` and `droppedFilterKeys` may only ever be READ from
     * the props object. The moment somebody computes either locally, this fails.
     */
    for (const name of ["isModified", "droppedFilterKeys"]) {
      expect(
        offsetsOf(source, new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*=`, "g")),
        `${COMPONENT}: ${name} is DECLARED in this file. It is a prop, computed on the server, and ` +
          `nothing here may recompute it. ${B2_REASON}`
      ).toEqual([])
    }

    // ANTI-VACUITY: both must still be READ, or "not derived" would be satisfied by "not used".
    for (const name of ["isModified", "droppedFilterKeys"]) {
      expect(
        occurrences(source, name),
        `${COMPONENT}: ${name} appears nowhere, so the bar renders neither the Modified badge nor ` +
          `the degraded notice and the assertion above is vacuous.`
      ).toBeGreaterThan(0)
    }
  })

  it("3. O-2: no Popover and no DropdownMenuSub anywhere in this file", () => {
    const source = read()

    /*
     * MEASURED, not preferred. `PopoverContent` never consumes
     * `--radix-popover-content-available-height` and the existing /activities filter popover already
     * renders 388px into a 347px slot with 41px clipped off the top of the viewport (M-5).
     * `DropdownMenuSubContent` is `overflow-hidden` with no clamp at all and opens SIDEWAYS into a
     * 241px budget (M-7). `DropdownMenuContent` is the one height-safe overlay host on these pages,
     * which is the whole reason the picker is a DropdownMenu.
     */
    for (const forbidden of ["Popover", "DropdownMenuSub"]) {
      expect(
        occurrences(source, forbidden),
        `${COMPONENT}: ${forbidden} is forbidden here (O-2). PopoverContent has no height clamp and ` +
          `DropdownMenuSubContent has none either while opening sideways into 241px. Both are ` +
          `measured non-conforming at 320x640.`
      ).toBe(0)
    }
  })

  it("3b. V-9 / plan 40-18: the selection writer mints a view=<id>, the escape writes view=none", () => {
    const source = read()
    const pushes = callArguments(source, "router.push")

    const WHY =
      `withViewEscape DELETES an unparsed view key, so using it for a SELECTION silently drops the ` +
      `selection and returns the bar to the state plan 40-05 measured: 10 URLs x 3 views, ZERO ` +
      `modified — a picker that can never report "Modified", a dead views.saveChanges row, and a ` +
      `save dialog whose target RadioGroup can never appear. It is invisible in a screenshot: the ` +
      `list filters correctly and only the badge is wrong.`

    expect(
      pushes.length,
      `${COMPONENT}: expected exactly two router.push calls — one that OPENS a view and one that ` +
        `escapes to All records. Found ${pushes.length}. ${WHY}`
    ).toBe(2)

    const selecting = pushes.filter((args) => args.includes("withViewSelection("))
    const escaping = pushes.filter((args) => args.includes("withViewEscape("))

    expect(
      selecting.length,
      `${COMPONENT}: exactly one router.push must build its query with withViewSelection( — the ` +
        `navigation that OPENS a view. Found ${selecting.length}. ${WHY}`
    ).toBe(1)

    expect(
      escaping.length,
      `${COMPONENT}: exactly one router.push must build its query with withViewEscape( — the ` +
        `All-records escape, which is what stops the default-view redirect bouncing the user back ` +
        `into the view they just left (U-1/U-2). Found ${escaping.length}.`
    ).toBe(1)

    for (const args of pushes) {
      expect(
        args.includes("withViewSelection(") && args.includes("withViewEscape("),
        `${COMPONENT}: one router.push expression uses BOTH helpers. They are mutually exclusive: ` +
          `one preserves a selection, the other clears it. ${WHY}`
      ).toBe(false)

      expect(
        args,
        `${COMPONENT}: a router.push hand-builds a view= literal. The query string is the helpers' ` +
          `job — they narrow the id, order the whitelist canonically and drop page (V-9). ${WHY}`
      ).not.toContain("view=")
    }

    /*
     * WHICH push is which, read from what each helper is FED rather than from a comment. The
     * selection is fed a view's own filters and id; the escape is fed a FRESH empty params object,
     * which is what "All records" means.
     */
    const selectionArgs = callArguments(source, "withViewSelection")
    const escapeArgs = callArguments(source, "withViewEscape")

    expect(selectionArgs.length, `${COMPONENT}: withViewSelection must be called exactly once.`).toBe(
      1
    )
    expect(escapeArgs.length, `${COMPONENT}: withViewEscape must be called exactly once.`).toBe(1)

    for (const fragment of ["view.filters", "view.id"]) {
      expect(
        selectionArgs[0],
        `${COMPONENT}: withViewSelection must be handed the picked view's own ${fragment} — ` +
          `naming the view in the URL is what makes "modified" possible at all. ${WHY}`
      ).toContain(fragment)
    }

    expect(
      escapeArgs[0],
      `${COMPONENT}: the All-records escape must be built from a FRESH URLSearchParams. Reusing the ` +
        `current params would carry the filters the user is trying to leave.`
    ).toContain("new URLSearchParams()")

    expect(
      source,
      `${COMPONENT}: the escape branch must be selected by comparing against VIEW_ESCAPE_VALUE, not ` +
        `by matching a translated label — the label changes per locale, the sentinel does not.`
    ).toContain("=== VIEW_ESCAPE_VALUE")
  })

  it("4. K-8 / R-40-2f: the bar is neither sticky nor fixed", () => {
    const source = read()

    for (const forbidden of ["sticky", "fixed"]) {
      expect(
        offsetsOf(source, new RegExp(`(?<![\\w-])${forbidden}(?![\\w-])`, "g")),
        `${COMPONENT}: ${forbidden} is forbidden (K-8, R-40-2f). bulk-action-bar.tsx already owns ` +
          `ONE fixed bar on all four of these pages and D-45-02 is a live open UAT item about a ` +
          `fixed bar occluding content. A second one is not available to this phase, and a sticky ` +
          `bar would need a spacer that moves the rows the user is aiming at.`
      ).toEqual([])
    }
  })

  it("5. R-40-2a: the bar row's own opening tag carries the wrap contract", () => {
    const source = read()
    const [at] = tagIndexes(source, "div")

    expect(at, `${COMPONENT}: no <div> found — the bar row is missing.`).not.toBeUndefined()

    const tag = openingTagAt(source, at, "the bar row <div", COMPONENT)
    const region = elementRegion(source, "div", COMPONENT)

    /*
     * BOUND TO THE BAR, not to "some div". The row is the element that holds slot 1, so the region
     * must contain the picker trigger — otherwise this assertion could be satisfied by any nested
     * cluster that happens to carry the same classes.
     */
    expect(
      region,
      `${COMPONENT}: the first <div> in this file is not the bar row — it does not contain the ` +
        `picker trigger, so every class assertion below is scoped to the wrong element.`
    ).toContain("DropdownMenuTrigger")

    for (const token of ["flex", "flex-wrap", "items-center", "gap-2", "min-w-0"]) {
      expect(
        hasClass(tag, token),
        `${COMPONENT}: the bar row must carry ${token} (R-40-2a). flex-wrap is LOAD-BEARING, not ` +
          `decoration: a 200px trigger plus 8px plus a 139px "Guardar cambios" is 347px against a ` +
          `241px budget, so the row wraps to two in all three locales (M-10) and that is accepted, ` +
          `not fought. min-w-0 is what lets the trigger shrink at all — a flex item's default ` +
          `min-width:auto is the mechanism behind every overflow Phase 45 measured. Tag: ${tag}`
      ).toBe(true)
    }
  })

  it("6. R-40-2b: the trigger shrinks, the name truncates, the state survives", () => {
    const source = read()
    const triggerAt = source.indexOf("<DropdownMenuTrigger")

    expect(
      triggerAt,
      `${COMPONENT}: no <DropdownMenuTrigger — there is no picker.`
    ).toBeGreaterThan(-1)

    const slice = source.slice(triggerAt)
    const [buttonAt] = tagIndexes(slice, "Button")

    expect(
      buttonAt,
      `${COMPONENT}: the DropdownMenuTrigger wraps no <Button (V-1).`
    ).not.toBeUndefined()

    const trigger = openingTagAt(slice, buttonAt, "the picker trigger <Button", COMPONENT)

    for (const token of ["min-w-0", "max-w-[200px]"]) {
      expect(
        hasClass(trigger, token),
        `${COMPONENT}: the picker trigger must carry ${token} (V-1, R-40-2b). max-w-[200px] is ` +
          `MEASURED (M-10): wider and the trigger alone eats the 241px row before the badge gets a ` +
          `pixel; narrower and an ordinary view name shows four characters. Tag: ${trigger}`
      ).toBe(true)
    }

    expect(
      trigger,
      `${COMPONENT}: the picker trigger must be variant="outline" (Accent budget). All four host ` +
        `pages already spend their one primary-filled button on "Add …".`
    ).toContain('variant="outline"')

    const badge = soleOpeningTag(source, "Badge")

    expect(
      hasClass(badge, "shrink-0"),
      `${COMPONENT}: the Modified badge must carry shrink-0 (R-40-2b). That single class is what ` +
        `guarantees the STATE survives when the NAME does not: without it the badge is the flex ` +
        `item that gives way first and the user loses the only signal that their view has unsaved ` +
        `changes. Tag: ${badge}`
    ).toBe(true)

    expect(
      badge,
      `${COMPONENT}: the Modified badge must be variant="secondary" (V-1) — the default variant is ` +
        `bg-primary and would spend an accent the bar does not have.`
    ).toContain('variant="secondary"')

    // The visible name element itself, not the button around it.
    const nameTag = tagCarrying(source, "selectedView.name")

    expect(
      hasClass(nameTag, "truncate"),
      `${COMPONENT}: the element rendering the selected view's name must carry truncate (V-1, ` +
        `R-40-2b) — a long name must clip, never push the badge and the chevron out of the row. ` +
        `Tag: ${nameTag}`
    ).toBe(true)
  })

  it("7. M-7: DropdownMenuContent overrides neither its clamp nor its scroll", () => {
    const tag = soleOpeningTag(read(), "DropdownMenuContent")

    /*
     * SCOPED TO THE OPENING TAG. The primitive ships
     * `max-h-(--radix-dropdown-menu-content-available-height)` plus `overflow-y-auto`
     * (dropdown-menu.tsx:45), which is the ONLY reason this menu may be unbounded and uncapped
     * (V-7). A local max-h- or overflow- class is the one way to break that, and `cn`'s
     * tailwind-merge makes the override SILENT — the primitive's class simply disappears.
     */
    for (const forbidden of ["max-h-", "overflow-"]) {
      expect(
        tag,
        `${COMPONENT}: the <DropdownMenuContent> opening tag must declare no ${forbidden} class of ` +
          `its own (M-7, O-1). The primitive is height-safe BY CONSTRUCTION — ` +
          `max-h-(--radix-dropdown-menu-content-available-height) + overflow-y-auto — and ` +
          `tailwind-merge would silently drop the primitive's class in favour of a local one, ` +
          `turning the phase's one height-safe overlay into an unbounded menu. That is also why the ` +
          `menu needs no cap and no paging (V-7). Tag: ${tag}`
      ).not.toContain(forbidden)
    }
  })

  it("8. R-40-2d: every VIEW radio item is a two-line item at py-2", () => {
    const source = read()
    const items = openingTags(source, "DropdownMenuRadioItem")

    expect(
      items.length,
      `${COMPONENT}: expected at least two <DropdownMenuRadioItem — the All-records escape plus the ` +
        `mapped view items (V-2, V-3). Found ${items.length}.`
    ).toBeGreaterThan(1)

    const escape = items.filter((tag) => tag.includes("VIEW_ESCAPE_VALUE"))

    expect(
      escape.length,
      `${COMPONENT}: exactly one radio item must carry value={VIEW_ESCAPE_VALUE} — views.allRecords, ` +
        `always present and always first (V-3).`
    ).toBe(1)

    const viewItems = items.filter((tag) => !tag.includes("VIEW_ESCAPE_VALUE"))

    expect(
      viewItems.length,
      `${COMPONENT}: no view radio item found, so the loop below asserts nothing.`
    ).toBeGreaterThan(0)

    for (const tag of viewItems) {
      expect(
        hasClass(tag, "py-2"),
        `${COMPONENT}: a view radio item must override the primitive's py-1.5 with py-2 (V-4, ` +
          `R-40-2d). Each item is TWO STACKED LINES — the name, then the state words — and 6px of ` +
          `vertical padding around two lines of text collapses them into each other. A single ` +
          `horizontal row of name + badges is the alternative, and it cannot survive 241px: ` +
          `truncating it would delete the state words. Tag: ${tag}`
      ).toBe(true)
    }
  })

  it("9. Accent budget / F-39-06: zero filled buttons, text-primary only on a spinner", () => {
    const source = read()

    expect(
      occurrences(source, 'variant="default"'),
      `${COMPONENT}: the bar spends ZERO primary-filled buttons (Accent budget). All four host ` +
        `pages already spend their one on "Add Organization" / "Add Person" / "Add Deal" / ` +
        `"Add Activity", and the save dialog's submit is the phase's only filled control.`
    ).toBe(0)

    /*
     * F-39-06 — counted per ELEMENT, not per file. `text-primary` as a TEXT colour is the Phase 39
     * defect; on a spinner it is a tint on an icon. Paired with an anti-vacuity half, because a pass
     * earned by having no in-flight indicator at all would report the absence of the thing it guards.
     */
    for (const at of offsetsOf(source, /text-primary(?![\w-])/g)) {
      expect(
        tagContaining(source, at),
        `${COMPONENT}: text-primary is only permitted on the in-flight spinner element (F-39-06). ` +
          `As a text colour it is the Phase 39 defect, and the element carrying it here does not ` +
          `also carry animate-spin.`
      ).toContain("animate-spin")
    }

    expect(
      occurrences(source, "animate-spin"),
      `${COMPONENT}: there is no animate-spin in-flight indicator, so slot 2 cannot resolve to ` +
        `views.exporting and an export that takes ten seconds looks like a menu that did nothing ` +
        `(E-4).`
    ).toBeGreaterThan(0)
  })

  it("10. E-3 / E-4 / K-7: the export item is gated, and its in-flight state comes from a transition", () => {
    const source = read()
    const at = source.indexOf("disabled={!canExport}")

    expect(
      at,
      `${COMPONENT}: no menu item is disabled on !canExport (E-3). canExport is NOT canSave — on ` +
        `/deals a pipeline-only view is saveable and NOT exportable, because a board selector ` +
        `scoping 25,195 deals is the unbounded export 38-CONTEXT forbids.`
    ).toBeGreaterThan(-1)

    const itemStart = source.lastIndexOf("<", at)
    const tag = openingTagAt(source, itemStart, "the export menu item", COMPONENT)
    const region = elementRegion(source.slice(itemStart), "DropdownMenuItem", COMPONENT)

    expect(
      tag,
      `${COMPONENT}: the disabled={!canExport} element must be a <DropdownMenuItem (E-1) — the menu ` +
        `is the one height-safe container on these pages and all four toolbars are already at or ` +
        `past their width budget (M-2, M-3, M-4).`
    ).toContain("<DropdownMenuItem")

    expect(
      region,
      `${COMPONENT}: the disabled-on-!canExport item must be the export affordance — it does not ` +
        `render views.exportAction, so this assertion is scoped to the wrong item.`
    ).toContain('t("exportAction")')

    expect(
      region,
      `${COMPONENT}: the export item must render views.export.disabledReason as a second muted line ` +
        `(E-3). This is the ONE place in the phase where a disabled control is correct, and it is ` +
        `correct only because a menu is a vertical list with room for the reason ADJACENT rather ` +
        `than hidden in a tooltip. A bare greyed row with no explanation is what 39-UI-SPEC P-7 ` +
        `forbids.`
    ).toContain('t("export.disabledReason")')

    /*
     * E-4 / K-7. The whole opening tag is the extracted unit, and `openingTagAt` is brace-aware, so
     * the tag it returns contains the entire onSelect handler. The state must be set from inside a
     * transition callback and never from an effect body — `react-hooks/set-state-in-effect` is an
     * ERROR in this repo.
     */
    expect(
      tag,
      `${COMPONENT}: the export item's onSelect must enter a startTransition (E-4, K-7). The ` +
        `in-flight state belongs to the BAR, not to the menu: a menu held open for the duration of ` +
        `a 50k-row SELECT is dismissible by any outside click, which strands the user with no ` +
        `feedback. Tag: ${tag}`
    ).toContain("startTransition")

    expect(
      tag,
      `${COMPONENT}: the export item must NOT prevent its default (E-4, V-10). The menu closes on ` +
        `selection and slot 2 carries the in-flight state; nothing in this file prevents onSelect.`
    ).not.toContain("preventDefault")

    expect(
      occurrences(source, "useEffect"),
      `${COMPONENT}: useEffect is not needed here and react-hooks/set-state-in-effect is an ERROR ` +
        `in this repo (K-7). The in-flight state is useTransition's isPending, so there is no ` +
        `setter to call from an effect body at all.`
    ).toBe(0)

    expect(
      occurrences(source, "ProgressBar"),
      `${COMPONENT}: no progress bar (E-5). fetchFilteredData is ONE query, not a job, and ` +
        `ProgressBar has no role="progressbar" / aria-valuenow (F-39-04) — a fake bar would add an ` +
        `a11y defect in service of a lie.`
    ).toBe(0)
  })

  it("11. E-6: the object URL is created once and released once", () => {
    const source = read()

    expect(
      occurrences(source, "URL.createObjectURL"),
      `${COMPONENT}: the download must go through URL.createObjectURL — the mechanism ` +
        `bulk-action-bar.tsx:73-83 already uses. This phase adds no /api/export route (M-14) for a ` +
        `file the server action already returned.`
    ).toBe(1)

    expect(
      occurrences(source, "URL.revokeObjectURL"),
      `${COMPONENT}: the object URL must be revoked exactly once (E-6). An object URL keeps its blob ` +
        `alive for the LIFETIME OF THE DOCUMENT, so a user exporting repeatedly accumulates every ` +
        `CSV they ever generated until they navigate away.`
    ).toBe(1)

    expect(
      source,
      `${COMPONENT}: the filename must come from the server result and is never translated (E-6) — ` +
        `a locale-dependent name on disk is unsupportable, and a server-generated name cannot ` +
        `disagree with the row count beside it.`
    ).toContain("result.filename")
  })

  it("12. K-2, T-1, R-4: the inherited absences", () => {
    const source = read()

    // K-2 — a raw palette colour bypasses the theme and carries meaning by hue alone.
    for (const forbidden of [
      "bg-green-500",
      "bg-amber-500",
      "text-red-600",
      "text-green-600",
      "text-amber-500",
    ]) {
      expect(
        occurrences(source, forbidden),
        `${COMPONENT}: ${forbidden} is forbidden (K-2) — use a semantic token. There is no --warning ` +
          `token in this repo and this phase does not add one.`
      ).toBe(0)
    }

    // T-1 — leading-none overlaps its own lines the moment a label wraps inside 288px.
    expect(
      occurrences(source, "leading-none"),
      `${COMPONENT}: leading-none is forbidden anywhere in this file (T-1).`
    ).toBe(0)

    // R-4 — two columns inside 241px of usable width is 120px per column before any gap.
    expect(
      offsetsOf(source, /(?<!sm:)grid-cols-2/g),
      `${COMPONENT}: grid-cols-2 must be prefixed with sm: (R-4).`
    ).toEqual([])

    // C-40-4 — a view that still rendered a list did not fail, and red would teach the user nothing.
    for (const forbidden of ["Alert", "destructive"]) {
      expect(
        occurrences(source, forbidden),
        `${COMPONENT}: ${forbidden} is forbidden here (C-40-4, V-11). A stored owner or pipeline id ` +
          `that no longer exists still rendered a list — nothing failed and nothing is unsafe. A red ` +
          `panel over a working list teaches the user that red means nothing. views.degraded is one ` +
          `muted line beneath the bar.`
      ).toBe(0)
    }
  })

  it("13. K-4: every JSX text node resolves through the catalog", () => {
    const source = read()
    const runs = textRuns(source)

    // ANTI-VACUITY: a file the extractor could not read would pass the loop below.
    expect(
      runs.length,
      `${COMPONENT}: the text-run extractor found ${runs.length} runs, which is too few for a ` +
        `component this size — it is reading the wrong thing and the loop below asserts nothing.`
    ).toBeGreaterThan(20)

    for (const run of runs) {
      /*
       * A BARE TEXT NODE always sits at the START of a run, before any brace or paren. Whatever
       * follows the first `{`, `}`, `(`, `)` or `;` is an expression, and expressions are covered by
       * the quoted-literal half below.
       */
      const lead = run.split(/[{}();]/)[0]

      expect(
        /[A-Za-z]/.test(lead),
        `${COMPONENT}: hardcoded text "${lead.trim()}" is rendered as a JSX child. Every visible ` +
          `string in this file comes from the views or bulk catalog (K-4) — a literal written into ` +
          `the source reads as English to every pt-BR and es-ES user while the build stays green.`
      ).toBe(false)

      /*
       * A QUOTED LITERAL in a child expression is either a catalog key or hardcoded copy. `t("` /
       * `tBulk("` in the same run is what tells the two apart; a pure data read (`{view.name}`,
       * `{ownViews.map(…)}`) carries no quote at all and is not examined.
       */
      if (/["']/.test(run)) {
        expect(
          run.includes('t("') || run.includes('tBulk("'),
          `${COMPONENT}: a JSX child expression carries a string literal that does not resolve ` +
            `through the catalog (K-4): ${run.trim()}`
        ).toBe(true)
      }
    }
  })

  it("14. K-4: the eighteen bar keys, the three export keys, and the two REUSED bulk keys", () => {
    const source = read()

    for (const namespace of ["views", "bulk"]) {
      expect(
        source,
        `${COMPONENT}: the bar must bind useTranslations("${namespace}"). Without the binding the ` +
          `key assertions below prove only that a dot-path string appears, not that it resolves.`
      ).toContain(`useTranslations("${namespace}")`)
    }

    for (const key of [...BAR_KEYS, ...EXPORT_KEYS]) {
      expect(
        source,
        `${COMPONENT}: views.${key} is never referenced. An unreferenced key is a sentence that was ` +
          `written, translated into three locales, and then never shown. needsFilter, emptyMenu and ` +
          `degraded are the three most likely to be quietly dropped — each is the ONLY thing the ` +
          `bar says in a state the user will reach on their first visit.`
      ).toContain(`t("${key}"`)
    }

    for (const key of BULK_KEYS) {
      expect(
        source,
        `${COMPONENT}: bulk.${key} must be REUSED VERBATIM (E-7, E-8). This phase adds no key to a ` +
          `namespace it does not own, and REQUIRED_BULK_KEYS must not change — if you are editing ` +
          `it you have added a key you were told to reuse.`
      ).toContain(`tBulk("${key}"`)
    }

    /*
     * bulk.error.tooMany is deliberately NOT reused: its copy is about a SELECTION of ids ("You can
     * act on at most {max} records at once. {count} are selected.") and would read as nonsense over a
     * filter set nobody selected.
     */
    expect(
      occurrences(source, 'tBulk("error.tooMany"'),
      `${COMPONENT}: bulk.error.tooMany must not be reused (E-8) — its copy names a selection of ` +
        `ids. views.export.tooMany is the key for a filter set that matches too many rows.`
    ).toBe(0)
  })
})
