/**
 * THE 40-08 SAVE-DIALOG WIRING GATE — a scoped source read over `save-view-dialog.tsx`.
 *
 * WHAT THIS TEST IS NOT. It measures NOTHING. No browser runs here, so it cannot know that the
 * dialog actually fits inside a 640px viewport or that its submit button is trial-clickable in the
 * stacked 320px footer. **The real measurement belongs to plan 40-15.** This file knows only that
 * the classes and the wiring which make fitting POSSIBLE are present, and it is deliberately not
 * written in a way that could be mistaken for that proof.
 *
 * WHY IT EXISTS ANYWAY. F-39-07 was a mobile dead-end that shipped past a GREEN horizontal-overflow
 * gate: `DialogContent` declares neither `max-h-*` nor `overflow-y-*` (measured, M-8), the
 * `/organizations` create dialog already occupies 586px of a 640px viewport, and a taller dialog
 * therefore pushes its own submit button off-screen with nothing to scroll. The two classes that
 * prevent it look like decoration to a later reader with a tidying instinct.
 *
 * EVERY ASSERTION IS SCOPED TO AN EXTRACTED ELEMENT, never made against the whole file, and
 * `readStrippedSource` removes comments first — so the prose above, which names every class this
 * file asserts, cannot satisfy anything below. That is the K-9 trap Phase 39 hit five times: a gate
 * satisfied by the comment explaining the rule it was supposed to enforce.
 *
 * ON THE EXTRACTORS — COPIED IN SHAPE, NOT IMPORTED, and here is why.
 * `readStrippedSource` and `callArguments` ARE imported: they are the shared helpers, and
 * `callArguments` is the repo's existing paren matcher, reused for assertion 12 rather than
 * reimplemented. The tag/paren walkers below are copied in shape from
 * `src/app/organizations/__tests__/toolbar-wiring.test.ts` (`extractToolbarRegion` /
 * `extractAdminConditional`) because those two functions are module-private there AND hard-wired to
 * that file's marker — `'<div className="flex flex-wrap'` — so importing them would mean first
 * exporting and generalising a helper that two gates use for different shapes. That generalisation
 * is exactly the consolidation `.planning/BACKLOG.md` already tracks under "Two brace matchers
 * should be consolidated", and doing it here would smuggle a cross-file refactor into a plan that
 * is about one dialog. **No third brace matcher is added:** the walkers below track depth over JSX
 * tag names and parens while scanning, and the one `{`/`}` count is inside the opening-tag scanner
 * because `onSubmit={(event) => …}` puts a `>` inside a prop.
 */
import { describe, it, expect } from "vitest"

import {
  callArguments,
  readStrippedSource,
} from "@/components/custom-fields/__tests__/source-scan"

const COMPONENT = "src/components/views/save-view-dialog.tsx"

/** Read fresh inside every test, so one missing class reports as a named failing assertion. */
const read = () => readStrippedSource(COMPONENT)

/**
 * The opening tag that starts at `at`, up to the `>` that closes it.
 *
 * String-aware AND brace-depth-aware: an arrow function in a prop (`onSubmit={(e) => …}`) contains
 * a `>` that is not the end of the tag, and a naive `indexOf(">")` would truncate the tag right
 * before the className it is being asked about.
 */
function openingTagAt(source: string, at: number, label: string): string {
  let i = at
  let depth = 0
  let quote: string | null = null

  while (i < source.length) {
    const ch = source[i]

    if (quote) {
      if (ch === "\\") {
        i += 2
        continue
      }
      if (ch === quote) quote = null
      i += 1
      continue
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch
      i += 1
      continue
    }

    if (ch === "{") depth += 1
    else if (ch === "}") depth -= 1
    else if (ch === ">" && depth === 0) return source.slice(at, i + 1)

    i += 1
  }

  throw new Error(`${COMPONENT}: unterminated opening tag for ${label}`)
}

/**
 * Every offset where `<${tagName}` begins as a WHOLE tag name.
 *
 * The boundary check is what stops `<Dialog` matching `<DialogContent` and `<RadioGroup` matching
 * `<RadioGroupItem` — an assertion scoped to the wrong element is not scoped at all.
 */
function tagIndexes(source: string, tagName: string): number[] {
  const found: number[] = []
  const marker = `<${tagName}`
  let from = 0

  for (;;) {
    const at = source.indexOf(marker, from)
    if (at === -1) break

    const after = source[at + marker.length]
    if (after !== undefined && /[A-Za-z0-9_]/.test(after)) {
      from = at + marker.length
      continue
    }

    found.push(at)
    from = at + marker.length
  }

  return found
}

function openingTags(source: string, tagName: string): string[] {
  return tagIndexes(source, tagName).map((at) => openingTagAt(source, at, `<${tagName}`))
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

/**
 * The `<${tagName}> … </${tagName}>` region, by TAG DEPTH rather than by a line range.
 *
 * A line range silently drifts the moment anything above the element grows; depth counting does
 * not, and a nested copy of the same tag cannot close the region early.
 */
function elementRegion(source: string, tagName: string): string {
  const [at] = tagIndexes(source, tagName)
  if (at === undefined) throw new Error(`${COMPONENT}: no <${tagName}> found`)

  const open = `<${tagName}`
  const close = `</${tagName}`
  let depth = 1
  let i = at + open.length

  while (i < source.length && depth > 0) {
    if (source.startsWith(close, i)) {
      depth -= 1
      i += close.length
      continue
    }
    if (source.startsWith(open, i)) {
      depth += 1
      i += open.length
      continue
    }
    i += 1
  }

  if (depth !== 0) throw new Error(`${COMPONENT}: unterminated <${tagName}> region`)

  return source.slice(at, i)
}

/**
 * The `{<test> && ( … )}` JSX conditional that ENCLOSES `marker`, split into its test and its body,
 * extracted by paren depth.
 *
 * The final containment check is not decoration: without it, a marker that moved out of the
 * conditional would still find the nearest preceding `&& (` and the gate would happily assert
 * things about a branch the marker no longer lives in.
 */
function enclosingConditional(source: string, marker: string): { test: string; body: string } {
  const at = source.indexOf(marker)
  if (at === -1) throw new Error(`${COMPONENT}: ${marker} not found in the source`)

  const arrow = source.lastIndexOf("&& (", at)
  if (arrow === -1) {
    throw new Error(`${COMPONENT}: ${marker} is not inside a {… && ( … )} conditional`)
  }

  const brace = source.lastIndexOf("{", arrow)
  if (brace === -1) {
    throw new Error(`${COMPONENT}: no JSX expression container opens the conditional around ${marker}`)
  }

  let depth = 1
  let i = arrow + "&& (".length
  const bodyStart = i

  while (i < source.length && depth > 0) {
    const ch = source[i]
    if (ch === "(") depth += 1
    else if (ch === ")") depth -= 1
    i += 1
  }

  if (depth !== 0) throw new Error(`${COMPONENT}: unterminated conditional around ${marker}`)

  const body = source.slice(bodyStart, i - 1)

  if (!body.includes(marker)) {
    throw new Error(
      `${COMPONENT}: the conditional found before ${marker} does not contain it — the extraction ` +
        `latched onto an unrelated branch, so nothing below would be scoped to the right one.`
    )
  }

  return { test: source.slice(brace + 1, arrow), body }
}

/** The opening tag that contains the byte at `at`. */
function tagContaining(source: string, at: number): string {
  const open = source.lastIndexOf("<", at)
  if (open === -1) throw new Error(`${COMPONENT}: no opening tag encloses offset ${at}`)

  return openingTagAt(source, open, `the tag enclosing offset ${at}`)
}

function offsetsOf(source: string, pattern: RegExp): number[] {
  return [...source.matchAll(pattern)].map((match) => match.index ?? -1)
}

function occurrences(source: string, needle: string): number {
  return source.split(needle).length - 1
}

describe("save-view-dialog.tsx — the 40-08 wiring gate", () => {
  it("1. O-1: the DialogContent opening tag declares its own fits-or-scrolls clamp", () => {
    const tag = soleOpeningTag(read(), "DialogContent")

    /*
     * SCOPED TO THE OPENING TAG on purpose. A file-wide search for this class would be satisfied by
     * the comment in the component that explains why the class is there — which is precisely how a
     * gate becomes self-invalidating. `dvh` and not `vh`, because a mobile URL bar changes `vh` and
     * F-39-07 is a mobile defect.
     */
    expect(
      tag,
      `${COMPONENT}: the <DialogContent> opening tag must carry max-h-[calc(100dvh-2rem)] (O-1). ` +
        `The primitive declares no max-h and no overflow-y (M-8), the /organizations create dialog ` +
        `already leaves ~54px of headroom in a 640px viewport, and without this class the submit ` +
        `button leaves the viewport with nothing to scroll — F-39-07 verbatim.`
    ).toContain("max-h-[calc(100dvh-2rem)]")

    expect(
      tag,
      `${COMPONENT}: the <DialogContent> opening tag must carry overflow-y-auto (O-1). A height ` +
        `clamp with no scroll container CLIPS the submit button instead of revealing it.`
    ).toContain("overflow-y-auto")
  })

  it("2. R-6: the clamp does not override the inherited max-w", () => {
    const tag = soleOpeningTag(read(), "DialogContent")

    /*
     * The primitive already resolves to 288px at a 320px viewport via `max-w-[calc(100%-2rem)]`
     * plus `sm:max-w-lg`. Re-declaring a bracketed max-w here is how that gets widened by accident.
     * `sm:max-w-lg` is allowed and carries no bracket, so this is a bracket check.
     */
    expect(
      tag,
      `${COMPONENT}: the <DialogContent> opening tag must not declare a bracketed max-w (R-6) — ` +
        `the inherited max-w-[calc(100%-2rem)] is what keeps the dialog at 288px on a 320px screen.`
    ).not.toContain("max-w-[")
  })

  it("3. T-1: every DialogTitle carries leading-tight and nothing carries leading-none", () => {
    const source = read()
    const titles = openingTags(source, "DialogTitle")

    // ANTI-VACUITY: with no titles at all the forEach below asserts nothing.
    expect(titles.length).toBeGreaterThan(0)

    for (const title of titles) {
      expect(
        title,
        `${COMPONENT}: a <DialogTitle> is missing leading-tight (T-1). The primitive ships ` +
          `text-lg leading-none, and es-ES views.save.titleUpdate is 33 characters, which wraps ` +
          `inside 288px — leading-none on a wrapping title overlaps its own lines.`
      ).toContain("leading-tight")
    }

    expect(
      occurrences(source, "leading-none"),
      `${COMPONENT}: leading-none is forbidden anywhere in this file (T-1).`
    ).toBe(0)
  })

  it("4. S-12: Cancel precedes the submit in the DialogFooter DOM order", () => {
    const footer = elementRegion(read(), "DialogFooter")
    const cancelAt = footer.indexOf('variant="outline"')
    const submitAt = footer.indexOf('type="submit"')

    expect(cancelAt, `${COMPONENT}: no variant="outline" Cancel button inside <DialogFooter>`).toBeGreaterThan(-1)
    expect(submitAt, `${COMPONENT}: no type="submit" button inside <DialogFooter>`).toBeGreaterThan(-1)

    /*
     * `DialogFooter` is `flex flex-col-reverse … sm:flex-row`, so at 320px the LAST DOM child is
     * rendered visually FIRST. Cancel first in the DOM is therefore what puts the primary action at
     * the top of the stacked footer, and that is the arrangement plan 40-15 asserts is
     * trial-clickable. This is the primitive's behaviour and is not overridden.
     */
    expect(
      cancelAt,
      `${COMPONENT}: Cancel must appear BEFORE the submit in the <DialogFooter> DOM (S-12). ` +
        `Cancel at index ${cancelAt}, submit at index ${submitAt}. flex-col-reverse renders the ` +
        `last DOM child first, so reversing these two buries the primary action below the fold at 320px.`
    ).toBeLessThan(submitAt)
  })

  it("5. O-2: no Popover and no DropdownMenuSubContent", () => {
    const source = read()

    // Neither primitive is height-safe on a 640px viewport, which is the whole subject of this file.
    expect(occurrences(source, "Popover"), `${COMPONENT}: Popover is forbidden here (O-2)`).toBe(0)
    expect(
      occurrences(source, "DropdownMenuSubContent"),
      `${COMPONENT}: DropdownMenuSubContent is forbidden here (O-2)`
    ).toBe(0)
  })

  it("6. K-2: none of the raw palette colours", () => {
    const source = read()

    // `activities-client.tsx:253,258` carries two of these. It is the anti-pattern reference, not a
    // template: a raw palette colour bypasses the theme and carries meaning by hue alone.
    for (const forbidden of [
      "bg-green-500",
      "bg-amber-500",
      "text-red-600",
      "text-green-600",
      "text-amber-500",
    ]) {
      expect(
        occurrences(source, forbidden),
        `${COMPONENT}: ${forbidden} is forbidden (K-2) — use a semantic token.`
      ).toBe(0)
    }
  })

  it("7. F-39-06: text-primary appears only on the in-flight spinner element", () => {
    const source = read()

    /*
     * Counted per ELEMENT, not per file. `text-primary` as a TEXT colour is F-39-06; on the spinner
     * it is a tint on an icon. The anti-vacuity half is the spinner itself: a gate that passes
     * because there is no spinner at all would be reporting the absence of the thing it guards.
     */
    for (const at of offsetsOf(source, /text-primary(?![\w-])/g)) {
      expect(
        tagContaining(source, at),
        `${COMPONENT}: text-primary is only permitted on the in-flight spinner element (F-39-06). ` +
          `As a text colour it is the Phase 39 defect; the element carrying it here does not also ` +
          `carry animate-spin.`
      ).toContain("animate-spin")
    }

    expect(
      occurrences(source, "animate-spin"),
      `${COMPONENT}: the submit button has no animate-spin in-flight indicator (S-11).`
    ).toBeGreaterThan(0)
  })

  it("8. R-4: no unprefixed grid-cols-2", () => {
    const source = read()

    // Two columns inside 241px of usable width is 120px per column before any gap.
    expect(
      offsetsOf(source, /(?<!sm:)grid-cols-2/g),
      `${COMPONENT}: grid-cols-2 must be prefixed with sm: (R-4).`
    ).toEqual([])
  })

  it("9. S-7: the submit is not disabled on the name state", () => {
    const source = read()
    const submitTag = openingTags(source, "Button").find((tag) => tag.includes('type="submit"'))

    expect(submitTag, `${COMPONENT}: no type="submit" <Button> found`).toBeDefined()

    /*
     * P-7 forbids a disabled control with no adjacent reason, and S-7 spends the inline error slot
     * instead: submitting an empty name produces `views.save.nameRequired` beneath the input, which
     * is discoverable and screen-reader-announced. A greyed-out button is neither.
     */
    expect(
      /disabled=\{[^}]*name/.test(submitTag ?? ""),
      `${COMPONENT}: the submit button must not be disabled on the name state (S-7, P-7). A ` +
        `disabled submit tells the user nothing about WHY; the inline nameRequired message does. ` +
        `Offending tag: ${submitTag}`
    ).toBe(false)
  })

  it("10. S-3: the target RadioGroup is reachable and defaults to targetUpdate", () => {
    const source = read()
    const { test, body } = enclosingConditional(source, "<RadioGroup")

    const reachability =
      `${COMPONENT}: the target RadioGroup must render only when a view is selected AND the ` +
      `viewer may update it (S-3). Its conditional test is: ${test.trim()}`

    expect(test, reachability).toContain("selectedView")
    expect(test, reachability).toContain("canUpdateSelected")

    // The branch has to actually contain its three strings, or "reachable" means an empty group.
    expect(body).toContain("save.targetLegend")
    expect(body).toContain("save.targetUpdate")
    expect(body).toContain("save.targetNew")

    const wrongDefault =
      `${COMPONENT}: the target RadioGroup must default to targetUpdate, not targetNew (S-3). ` +
      `"I opened my view, tweaked it and pressed save" means UPDATE far more often than it means ` +
      `fork. This branch was structurally unreachable until plan 40-18 added the ?view=<id> ` +
      `carrier, so it has never been exercised by a user — and a wrong default here is the ` +
      `difference between updating a view and silently accumulating forks of it.`

    const tag = soleOpeningTag(source, "RadioGroup")
    const uncontrolled = /defaultValue="([^"]+)"/.exec(tag)

    if (uncontrolled !== null) {
      expect(uncontrolled[1], wrongDefault).toBe("targetUpdate")
      return
    }

    // Controlled: the default lives in the initial state of whatever `value={…}` names.
    const controlled = /value=\{([A-Za-z0-9_$]+)\}/.exec(tag)
    expect(
      controlled,
      `${COMPONENT}: the <RadioGroup> is neither defaultValue- nor value-controlled, so it has no ` +
        `default selection at all (S-3).`
    ).not.toBeNull()

    const stateName = controlled?.[1] ?? ""
    const initial = new RegExp(
      `\\[\\s*${stateName}\\s*,[^\\]]*\\]\\s*=\\s*useState[^(]*\\(\\s*"([^"]+)"`
    ).exec(source)

    expect(
      initial,
      `${COMPONENT}: could not find the initial value of the "${stateName}" state that controls ` +
        `the target RadioGroup, so its default selection is unverifiable (S-3).`
    ).not.toBeNull()

    expect(initial?.[1], wrongDefault).toBe("targetUpdate")
  })

  it("11. S-4: the refusal and the RadioGroup are mutually exclusive", () => {
    const source = read()
    const { body } = enclosingConditional(source, "<RadioGroup")

    /*
     * Both-or-neither is the failure mode this catches. A user who may not overwrite someone else's
     * shared view must read WHY and WHOSE it is — a silently missing option is how they conclude
     * the feature is broken.
     */
    expect(
      occurrences(body, "save.targetNewOnly"),
      `${COMPONENT}: views.save.targetNewOnly must not render inside the RadioGroup branch (S-4) ` +
        `— the refusal replaces the choice, it does not accompany it.`
    ).toBe(0)

    expect(
      occurrences(source, "save.targetNewOnly"),
      `${COMPONENT}: views.save.targetNewOnly never renders, so a viewer who cannot overwrite the ` +
        `selected view sees a GAP where the target choice was (S-4).`
    ).toBeGreaterThan(0)

    const refusal = enclosingConditional(source, "save.targetNewOnly")
    expect(
      refusal.test,
      `${COMPONENT}: the targetNewOnly refusal must be the negation of the same canUpdateSelected ` +
        `test that gates the RadioGroup (S-4). Its test is: ${refusal.test.trim()}`
    ).toContain("!canUpdateSelected")

    // The sentence names the view AND its owner, per T-40-38: never a uuid, never a blank.
    expect(source).toContain("ownerLabel")
    expect(source).toContain("ownerUnavailable")
  })

  it("12. the filters submitted are the CURRENT ones, not the stored ones", () => {
    const source = read()
    const updates = callArguments(source, "updateView")
    const creates = callArguments(source, "createView")

    expect(updates.length, `${COMPONENT}: updateView must be called exactly once`).toBe(1)
    expect(creates.length, `${COMPONENT}: createView must be called exactly once`).toBe(1)

    for (const args of [...updates, ...creates]) {
      /*
       * Saving `selectedView.filters` would make "Save changes" a no-op that reported success — the
       * exact defect no visual check catches, because the toast is identical either way. The point
       * of the entire feature is that the persisted filters are the ones on screen NOW.
       */
      expect(
        args.includes("selectedView.filters"),
        `${COMPONENT}: the save must submit the dialog's own \`filters\` prop, never ` +
          `selectedView.filters — the latter turns "Save changes" into a successful no-op.`
      ).toBe(false)

      expect(
        /(^|[^.\w])filters\b/.test(args),
        `${COMPONENT}: the save call does not pass the current \`filters\` prop at all. ` +
          `Arguments: ${args.trim()}`
      ).toBe(true)
    }
  })

  it("13. every user-visible string comes from the catalog", () => {
    const source = read()

    /*
     * Not one of the twelve, and cheap: the namespace bindings are what make the `save.*` key
     * assertions above mean "a catalog key" rather than "a bare English literal that happens to
     * read like one". `views` for this surface's twenty-one keys, `common` for the Cancel label —
     * K-4, no new close word.
     */
    expect(source).toContain('useTranslations("views")')
    expect(source).toContain('useTranslations("common")')
    expect(
      elementRegion(source, "DialogFooter"),
      `${COMPONENT}: the Cancel button must read common.cancel, not a new label (K-4, S-11).`
    ).toContain('("cancel")')
  })
})
