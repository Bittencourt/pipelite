/**
 * THE 40-09 MANAGE-DIALOG WIRING GATE — a scoped source read over `manage-views-dialog.tsx`.
 *
 * WHAT THIS TEST IS NOT. It measures NOTHING. No browser runs here, so it cannot know that this
 * dialog fits inside a 640px viewport with eight views in it, that its footer survives a long list,
 * or that its `flex flex-wrap` action cluster does not overflow 241px. **The measurement belongs to
 * plan 40-15.** This file knows only that the classes and the wiring which make those outcomes
 * POSSIBLE are present, and it is deliberately not written in a way that could be mistaken for that
 * proof.
 *
 * WHY IT EXISTS ANYWAY. Three of the things it guards are SILENT IN THE SOURCE and INVISIBLE IN A
 * GREEN SUITE:
 *
 *   1. The DOUBLE CLAMP (O-1). `DialogContent` declares neither a `max-h-*` nor an `overflow-y-*`
 *      (measured, M-8), so the dialog needs its own. But clamping only the DIALOG lets a long list
 *      push the footer off screen — F-39-07's shape again — so the inner list needs `max-h-[50vh]`
 *      too. Two clamps. A later reader with a tidying instinct sees one of them as redundant.
 *   2. The DEFAULT SWITCH ON A READ-ONLY ROW (G-7). A default is PER USER, and 40-CONTEXT is
 *      explicit that a user may set someone else's SHARED view as their own default, "otherwise
 *      sharing has little payoff". Tucking that switch inside the same `view.canEdit &&` guard as
 *      the share switch and the delete button LOOKS like consistency and silently removes a
 *      capability the feature was designed to grant.
 *   3. `variant="destructive"` ON THE DELETE ACTION (C-40-3). `AlertDialogAction` defaults to
 *      `variant="default"` (`alert-dialog.tsx:149`), so dropping the prop leaves a button that
 *      deletes a view for every teammate looking exactly like "OK".
 *
 * EVERY ASSERTION IS SCOPED TO AN EXTRACTED ELEMENT, never made against the whole file except where
 * the rule IS a file-wide absence, and `readStrippedSource` removes comments first — so the prose
 * above, which names every class this file asserts, cannot satisfy anything below. That is the K-9
 * trap Phase 39 hit five times: a gate satisfied by the comment explaining the rule it was supposed
 * to enforce.
 *
 * ON THE EXTRACTORS — IMPORTED. Plan 40-08 wrote `openingTagAt`, `tagIndexes`, `elementRegion` and
 * `enclosingConditional` module-private, and its SUMMARY set the condition for promoting them: "if a
 * third 40-* gate needs these, promote all four into `source-scan.ts` in ONE commit and delete both
 * copies." This file is that third consumer, so the promotion happened first and both this gate and
 * 40-08's now import the same four. **No brace matcher was added to the repo.** The five helpers
 * below are one-line compositions over them — `soleOpeningTag` refuses zero and refuses two,
 * `regionAround` slices the source at an element's own opening tag so `elementRegion` can scope to a
 * `<div>` that is not the file's first, and `occurrences` / `offsetsOf` are a split and a matchAll.
 */
import { describe, it, expect } from "vitest"

import {
  elementRegion,
  enclosingConditional,
  openingTagAt,
  readStrippedSource,
  tagIndexes,
} from "@/components/custom-fields/__tests__/source-scan"

const COMPONENT = "src/components/views/manage-views-dialog.tsx"

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

/**
 * The opening tag carrying `marker`, plus that element's whole `<tagName> … </tagName>` region.
 *
 * `elementRegion` scopes to the FIRST `<tagName` in whatever it is handed, so scoping to a `<div>`
 * that is not the file's first `<div>` is done by SLICING the source at that element's own opening
 * tag. That is the documented way to use it and adds no second walker.
 */
function regionAround(
  source: string,
  marker: string,
  tagName: string
): { tag: string; region: string } {
  const at = source.indexOf(marker)
  if (at === -1) throw new Error(`${COMPONENT}: ${marker} appears nowhere in the source`)

  const tagStart = source.lastIndexOf("<", at)
  if (tagStart === -1) throw new Error(`${COMPONENT}: no opening tag encloses ${marker}`)

  return {
    tag: openingTagAt(source, tagStart, `the tag carrying ${marker}`, COMPONENT),
    region: elementRegion(source.slice(tagStart), tagName, COMPONENT),
  }
}

function offsetsOf(source: string, pattern: RegExp): number[] {
  return [...source.matchAll(pattern)].map((match) => match.index ?? -1)
}

function occurrences(source: string, needle: string): number {
  return source.split(needle).length - 1
}

/** The opening tag that contains the byte at `at`. */
function tagContaining(source: string, at: number): string {
  const open = source.lastIndexOf("<", at)
  if (open === -1) throw new Error(`${COMPONENT}: no opening tag encloses offset ${at}`)

  return openingTagAt(source, open, `the tag enclosing offset ${at}`, COMPONENT)
}

/** The thirteen `views.manage.*` keys and the five `views.delete.*` keys, as they exist in en-US. */
const MANAGE_KEYS = [
  "manage.title",
  "manage.description",
  "manage.empty",
  "manage.emptyBody",
  "manage.share",
  "manage.unshare",
  "manage.setDefault",
  "manage.clearDefault",
  "manage.delete",
  "manage.readOnly",
  "manage.filterCount",
  "manage.saved",
  "manage.failed",
]

const DELETE_KEYS = [
  "delete.title",
  "delete.body",
  "delete.action",
  "delete.success",
  "delete.failed",
]

describe("manage-views-dialog.tsx — the 40-09 wiring gate", () => {
  it("1. O-1a: the DialogContent opening tag declares its own fits-or-scrolls clamp", () => {
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
        `The primitive declares no max-h and no overflow-y (M-8), and this dialog is the tallest ` +
        `surface the phase adds — one row per view, unbounded. Without this class the rows push the ` +
        `dialog past the viewport with nothing to scroll: F-39-07 verbatim.`
    ).toContain("max-h-[calc(100dvh-2rem)]")

    expect(
      tag,
      `${COMPONENT}: the <DialogContent> opening tag must carry overflow-y-auto (O-1). A height ` +
        `clamp with no scroll container CLIPS the last rows instead of revealing them.`
    ).toContain("overflow-y-auto")

    /*
     * R-6. The primitive already resolves to 288px at a 320px viewport via
     * `max-w-[calc(100%-2rem)]` plus `sm:max-w-lg`; a bracketed max-w here is how that gets widened
     * by accident. `sm:max-w-lg` carries no bracket, so this is a bracket check.
     */
    expect(
      tag,
      `${COMPONENT}: the <DialogContent> opening tag must not declare a bracketed max-w (R-6) — ` +
        `the inherited max-w-[calc(100%-2rem)] is what keeps the dialog at 288px on a 320px screen.`
    ).not.toContain("max-w-[")
  })

  it("2. O-1b: the inner list carries the SECOND clamp, and the rows are inside it", () => {
    const source = read()
    const { tag, region } = regionAround(source, "max-h-[50vh]", "div")

    /*
     * TWO CLAMPS, NOT ONE. This is the assertion the plan called the headline. Clamping only the
     * dialog means a fifteen-view list makes the dialog itself the scroll container, and everything
     * below the list — including nothing at all here, but the footer of any future revision — leaves
     * the viewport. Clamping the LIST keeps the surrounding chrome on screen at every list length.
     */
    expect(
      tag,
      `${COMPONENT}: the inner list container must carry max-h-[50vh] (O-1b). One clamp on the ` +
        `dialog is not enough: the list is the only unbounded region on this surface, and an ` +
        `unclamped list is what pushes everything after it off a 640px screen.`
    ).toContain("max-h-[50vh]")

    expect(
      tag,
      `${COMPONENT}: the inner list container must carry overflow-y-auto beside its max-h-[50vh] ` +
        `(O-1b) — a clamp with no scroll container hides the rows past the cut instead of ` +
        `scrolling to them.`
    ).toContain("overflow-y-auto")

    /*
     * THE SCOPING HALF, and the reason this is not a file-wide presence check: `max-h-[50vh]` on the
     * wrong element passes a grep and clamps nothing. The class has to be on an ANCESTOR of the row
     * map, so the element that scrolls is the element the rows are in.
     */
    expect(
      region,
      `${COMPONENT}: the max-h-[50vh] element must ENCLOSE the row map (O-1b). The rows are not ` +
        `inside it, so the clamp is on some other element and the list still grows without bound. ` +
        `A file-wide presence check would have passed this.`
    ).toContain("views.map(")
  })

  it("3. O-1c: the AlertDialogContent opening tag carries the same clamp", () => {
    const tag = soleOpeningTag(read(), "AlertDialogContent")

    /*
     * The confirmation body is three full sentences (D-2) and es-ES/pt-BR run longer than en-US, so
     * this is not a hypothetical: a wrapped three-clause body plus a stacked 320px footer is how the
     * Delete button ends up below the fold on the one dialog where a mis-click is irreversible.
     */
    expect(
      tag,
      `${COMPONENT}: the <AlertDialogContent> opening tag must carry max-h-[calc(100dvh-2rem)] ` +
        `(O-1c). The primitive declares no max-h, and this content is a three-clause body plus a ` +
        `footer that stacks at 320px — the confirm button is what leaves the viewport.`
    ).toContain("max-h-[calc(100dvh-2rem)]")

    expect(
      tag,
      `${COMPONENT}: the <AlertDialogContent> opening tag must carry overflow-y-auto (O-1c).`
    ).toContain("overflow-y-auto")
  })

  it("4. C-40-3: the delete action is variant=\"destructive\", explicitly", () => {
    const tag = soleOpeningTag(read(), "AlertDialogAction")

    /*
     * THE PRIMITIVE DEFAULTS TO `variant="default"` — `alert-dialog.tsx:149` destructures
     * `variant = "default"`. So the ABSENCE of this prop is SILENT: the button still renders, still
     * deletes, and looks exactly like a primary "OK". Deleting a SHARED view removes it from every
     * teammate who selected it, which is the same class of consequence as a bulk delete, and this
     * repo already paints that destructive.
     */
    expect(
      tag,
      `${COMPONENT}: the <AlertDialogAction> must pass variant="destructive" explicitly (C-40-3). ` +
        `The primitive destructures variant = "default" (alert-dialog.tsx:149), so omitting the ` +
        `prop is SILENT — the button deletes a view for every teammate while looking like "OK". ` +
        `Offending tag: ${tag}`
    ).toContain('variant="destructive"')

    /*
     * The Cancel takes NO variant override: `AlertDialogCancel` already defaults to
     * `variant="outline"` (`alert-dialog.tsx:167`), and re-declaring it here is how the two drift.
     */
    const cancel = soleOpeningTag(read(), "AlertDialogCancel")

    expect(
      cancel,
      `${COMPONENT}: the <AlertDialogCancel> must pass no variant override (D-3) — the primitive ` +
        `already defaults to variant="outline".`
    ).not.toContain("variant=")
  })

  it("5. R-40-2e: the rows are stacked, never a table", () => {
    const source = read()

    /*
     * A table forces name / visibility / default / actions into columns, and at 241px of usable
     * width (M-1) that is about 60px each — the name column alone would truncate to two words. The
     * rows are stacked for that reason, and "stacked" is not a preference that survives a later
     * "let's make this scannable" without a gate.
     */
    for (const forbidden of ["<table", "<Table", "<thead", "<TableHeader"]) {
      expect(
        occurrences(source, forbidden),
        `${COMPONENT}: ${forbidden} is forbidden on this surface (R-40-2e). Four view attributes ` +
          `in columns inside 241px gives each about 60px, so the name — the one thing this dialog ` +
          `exists to show in full — is the first casualty.`
      ).toBe(0)
    }
  })

  it("6. G-4: every commit-on-toggle Switch reverts its own position on failure", () => {
    const source = read()
    const switches = openingTags(source, "Switch")

    /*
     * TWO SWITCHES: share and default. The `<Switch>` OPENING TAG is the extracted unit here, and
     * `openingTagAt` is brace-aware, so the tag it returns contains the whole `onCheckedChange={…}`
     * handler — the `>` inside every `=>` sits at brace depth ≥ 1 and does not truncate it. That is
     * why this reads a tag rather than a paren-extracted body: the tag IS the handler plus its
     * `checked` and `disabled` props, and no second walker is needed to get it.
     */
    expect(
      switches.length,
      `${COMPONENT}: expected exactly two <Switch> elements — share and default (G-4). Found ` +
        `${switches.length}.`
    ).toBe(2)

    const handlers = [
      {
        what: "the SHARE switch",
        tag: switches.find((tag) => tag.includes("setViewShared({")),
        setter: "setSharedOverride",
        action: "setViewShared({",
      },
      {
        what: "the DEFAULT switch",
        tag: switches.find((tag) => tag.includes("setViewDefault({")),
        setter: "setDefaultOverride",
        action: "setViewDefault({",
      },
    ]

    for (const { what, tag, setter, action } of handlers) {
      expect(
        tag,
        `${COMPONENT}: ${what} has no <Switch> whose handler calls ${action} (G-4).`
      ).toBeDefined()

      const body = tag ?? ""

      expect(
        body,
        `${COMPONENT}: ${what} must commit on toggle via onCheckedChange (G-4) — a Switch in this ` +
          `app means immediate effect, which is why this surface uses one where the save dialog ` +
          `uses a Checkbox.`
      ).toContain("onCheckedChange={")

      expect(
        body,
        `${COMPONENT}: ${what} must write through startTransition, never from an effect body ` +
          `(K-7: react-hooks/set-state-in-effect is an ERROR in this repo).`
      ).toContain("startTransition")

      /*
       * THE REVERT PATH. Capturing the previous value and putting it back is the whole of T-40-40:
       * without it a refused write leaves the switch asserting a state the database does not hold,
       * and the user's next act is based on a lie the UI told them. Two calls to the same setter —
       * one optimistic, one restoring — is the structural signature of that, and deleting the
       * restoring one drops the count to 1.
       */
      expect(
        body,
        `${COMPONENT}: ${what} must capture its previous value before writing (G-4, T-40-40).`
      ).toContain("const previous")

      expect(
        occurrences(body, `${setter}(`),
        `${COMPONENT}: ${what} must call ${setter} TWICE — once optimistically and once to REVERT ` +
          `on failure (G-4, T-40-40). Found ${occurrences(body, `${setter}(`)}. With only the ` +
          `optimistic write, a refused toggle leaves the switch showing a position the database ` +
          `never accepted, and nothing on screen ever corrects it.`
      ).toBeGreaterThanOrEqual(2)

      expect(
        body,
        `${COMPONENT}: ${what} must toast views.manage.saved on success (G-4).`
      ).toContain("manage.saved")

      expect(
        body,
        `${COMPONENT}: ${what} must toast views.manage.failed on failure (G-4) — a silently ` +
          `reverting switch is indistinguishable from a mis-click.`
      ).toContain("manage.failed")
    }
  })

  it("7. G-7: the default switch stays LIVE on a row the viewer cannot edit", () => {
    const source = read()

    const G7 =
      `A default is PER USER. 40-CONTEXT is explicit that a user may set someone else's SHARED ` +
      `view as their own default — "otherwise sharing has little payoff" — and UI-SPEC G-7 calls ` +
      `that asymmetry "the one thing this row must make legible". Moving the default switch inside ` +
      `the view.canEdit guard alongside the share switch and the delete button LOOKS like ` +
      `consistency and silently deletes a capability the feature was designed to grant. Nothing ` +
      `else in the suite would notice.`

    // The two controls that ARE gated, each extracted by paren depth from its own conditional.
    const share = enclosingConditional(source, "manage.share", COMPONENT)
    const remove = enclosingConditional(source, "manage.delete", COMPONENT)

    expect(
      share.test,
      `${COMPONENT}: the share Switch must render only when view.canEdit (T-40-39 — visibility ` +
        `only; plan 40-06's canMutateView is the authorization). Its test is: ${share.test.trim()}`
    ).toContain("view.canEdit")

    expect(
      remove.test,
      `${COMPONENT}: the delete Button must render only when view.canEdit (G-6, T-40-39). Its ` +
        `test is: ${remove.test.trim()}`
    ).toContain("view.canEdit")

    // ZERO setViewDefault calls inside either gated branch.
    expect(
      occurrences(share.body, "setViewDefault({"),
      `${COMPONENT}: setViewDefault appears inside the share switch's view.canEdit branch (G-7). ${G7}`
    ).toBe(0)

    expect(
      occurrences(remove.body, "setViewDefault({"),
      `${COMPONENT}: setViewDefault appears inside the delete button's view.canEdit branch (G-7). ${G7}`
    ).toBe(0)

    expect(
      occurrences(share.body, "manage.setDefault"),
      `${COMPONENT}: the default switch's label renders inside the share switch's view.canEdit ` +
        `branch (G-7). ${G7}`
    ).toBe(0)

    // ...and at least one OUTSIDE them, or "not gated" would be satisfied by "not present".
    expect(
      occurrences(source, "setViewDefault({"),
      `${COMPONENT}: setViewDefault is never called, so there is no default switch at all (G-4).`
    ).toBeGreaterThan(0)

    /*
     * THE GENERAL HALF: no `&& (` conditional of ANY shape whose test mentions canEdit may enclose
     * the setViewDefault call. The two checks above catch it being moved into an EXISTING branch;
     * this one catches a NEW branch being wrapped around it. `enclosingConditional` throws when the
     * nearest preceding `&& (` does not actually contain the marker, which is the "no enclosing
     * conditional" answer.
     */
    let enclosing: { test: string; body: string } | null = null
    try {
      enclosing = enclosingConditional(source, "setViewDefault({", COMPONENT)
    } catch {
      enclosing = null
    }

    if (enclosing !== null) {
      expect(
        enclosing.test,
        `${COMPONENT}: setViewDefault is enclosed by a conditional testing canEdit (G-7). Its ` +
          `test is: ${enclosing.test.trim()}. ${G7}`
      ).not.toContain("canEdit")
    }

    // G-7's sentence itself, and the owner it names — never a uuid, never a blank (T-40-43).
    const readOnly = enclosingConditional(source, "manage.readOnly", COMPONENT)

    expect(
      readOnly.test,
      `${COMPONENT}: views.manage.readOnly must render exactly when the viewer CANNOT edit (G-7) ` +
        `— it is the sentence that explains why the other controls are absent. Its test is: ` +
        `${readOnly.test.trim()}`
    ).toContain("!view.canEdit")

    expect(source).toContain("ownerLabel")
    expect(source).toContain("ownerUnavailable")
  })

  it("8. K-2, F-39-06, T-1, O-2, R-4: the five absences, scoped as 40-08 scoped them", () => {
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
        `${COMPONENT}: ${forbidden} is forbidden (K-2) — use a semantic token.`
      ).toBe(0)
    }

    /*
     * F-39-06 — counted per ELEMENT, not per file. `text-primary` as a TEXT colour is the Phase 39
     * defect; on a spinner it is a tint on an icon. The anti-vacuity half is the spinner itself: a
     * pass earned by having no in-flight indicator at all would report the absence of the thing it
     * guards.
     */
    for (const at of offsetsOf(source, /text-primary(?![\w-])/g)) {
      expect(
        tagContaining(source, at),
        `${COMPONENT}: text-primary is only permitted on an in-flight spinner element (F-39-06). ` +
          `As a text colour it is the Phase 39 defect, and the element carrying it here does not ` +
          `also carry animate-spin.`
      ).toContain("animate-spin")
    }

    expect(
      occurrences(source, "animate-spin"),
      `${COMPONENT}: the delete confirmation has no animate-spin in-flight indicator. This is the ` +
        `one irreversible write on the surface; a click with no visible response invites a second.`
    ).toBeGreaterThan(0)

    // T-1 — the primitive ships `leading-none` on its titles, and both titles here can wrap at 288px.
    const titles = [...openingTags(source, "DialogTitle"), ...openingTags(source, "AlertDialogTitle")]

    // ANTI-VACUITY: with no titles at all the loop below asserts nothing.
    expect(
      titles.length,
      `${COMPONENT}: expected a DialogTitle and an AlertDialogTitle (G-2, D-1).`
    ).toBe(2)

    for (const title of titles) {
      expect(
        title,
        `${COMPONENT}: a title is missing leading-tight (T-1, D-1). The primitives ship ` +
          `leading-none, and a wrapping title with leading-none overlaps its own lines inside 288px.`
      ).toContain("leading-tight")
    }

    expect(
      occurrences(source, "leading-none"),
      `${COMPONENT}: leading-none is forbidden anywhere in this file (T-1).`
    ).toBe(0)

    // O-2 — neither primitive is height-safe on a 640px viewport, which is G-1's whole reason.
    expect(occurrences(source, "Popover"), `${COMPONENT}: Popover is forbidden here (O-2)`).toBe(0)
    expect(
      occurrences(source, "DropdownMenuSubContent"),
      `${COMPONENT}: DropdownMenuSubContent is forbidden here (O-2, G-1) — it is not height-safe, ` +
        `and its absence is why all five operations live in this dialog instead of a submenu.`
    ).toBe(0)

    // R-4 — two columns inside 241px of usable width is 120px per column before any gap.
    expect(
      offsetsOf(source, /(?<!sm:)grid-cols-2/g),
      `${COMPONENT}: grid-cols-2 must be prefixed with sm: (R-4).`
    ).toEqual([])

    /*
     * C-40-2 — Shared / Private / Default are WORDS on a muted line, never a glyph and never a hue.
     * A lock and a share glyph are two more vocabularies to learn and neither says anything to a
     * screen reader without a label.
     *
     * ASSERTED AS AN ALLOW-LIST OVER THE `lucide-react` IMPORT, not as a deny-list over the file.
     * A deny-list of glyph names is unsound here and was measured to be: `Check` is a substring of
     * `onCheckedChange`, so the deny-list form failed on the two Switch handlers this file requires.
     * The allow-list has no such collision AND is strictly stronger — it refuses every glyph rather
     * than the handful somebody thought to enumerate. `Trash2` is permitted because G-6 pairs it
     * with the WORD `views.manage.delete`, and `Loader2` because it is an in-flight tint rather
     * than a state carrier.
     */
    const lucide = /import\s*\{([^}]*)\}\s*from\s*"lucide-react"/.exec(source)

    expect(
      lucide,
      `${COMPONENT}: no lucide-react import found, so the C-40-2 icon allow-list has nothing to ` +
        `check. G-6 requires a Trash2 beside the delete word.`
    ).not.toBeNull()

    const icons = (lucide?.[1] ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name.length > 0)
      .sort()

    expect(
      icons,
      `${COMPONENT}: the only icons this surface may import are Trash2 (paired with the WORD ` +
        `views.manage.delete, G-6) and Loader2 (an in-flight tint). Found: ${icons.join(", ")}. ` +
        `A lock or share glyph carrying Shared/Private is C-40-2: a second vocabulary to learn, ` +
        `and silent to a screen reader without a label.`
    ).toEqual(["Loader2", "Trash2"])

    // K-7 — the switches write from transition callbacks, so there is no effect to write from.
    expect(
      occurrences(source, "useEffect"),
      `${COMPONENT}: useEffect is not needed here and react-hooks/set-state-in-effect is an ERROR ` +
        `in this repo (K-7). Every write happens in a startTransition callback.`
    ).toBe(0)
  })

  it("11. WR-06: a SUCCESSFUL write discards its own override, so the prop stops being shadowed", () => {
    /*
     * THE HEADER OF THIS COMPONENT STATES THE MODEL CORRECTLY:
     *
     *     The truth is the `views` prop, which the server rebuilds after every action's
     *     `revalidatePath`. Between the click and that rebuild the switch has to show the position
     *     the user just chose […]
     *
     * The implementation never returned to that truth. `sharedOverride[view.id]` was written on
     * toggle and cleared ONLY on failure; on success it was left in place, and the render reads
     * `sharedOverride[view.id] ?? view.isShared` — so from the FIRST successful toggle onward the
     * prop was permanently shadowed for that view, for the lifetime of the client tree. The dialog
     * is always mounted (only `open` changes), so closing it does not reset anything either.
     * `defaultOverride` had the same shape.
     *
     * CONCRETELY: unshare view A here (override {A: false}), close, re-share A through the save
     * dialog's checkbox, reopen. The switch reads "off" and the state words say "Private" while the
     * row is shared. Clicking the switch then sends `setViewShared({ isShared: true })` — a no-op
     * that happens to repair the display, which is exactly how this gets misdiagnosed as a
     * rendering glitch. Same story for a change made in a second tab, or for a shared view a
     * colleague unshares.
     *
     * THE ASSERTION IS AN ORDERING ONE, over the same `<Switch>` opening tags assertion 6 reads: the
     * success branch must call the setter BEFORE it returns. `revalidatePath` has already been
     * awaited by the time the action resolves, so dropping the override there cannot flash back to
     * the old position. Assertion 6's `>= 2` count stays true and is not weakened — the count is now
     * three, and it is the ORDER that carries the new claim, because a third call sitting after the
     * `return` would be exactly the failure-path call that already existed.
     */
    const source = read()
    const switches = openingTags(source, "Switch")

    const handlers = [
      {
        what: "the SHARE switch",
        tag: switches.find((tag) => tag.includes("setViewShared({")),
        setter: "setSharedOverride",
      },
      {
        what: "the DEFAULT switch",
        tag: switches.find((tag) => tag.includes("setViewDefault({")),
        setter: "setDefaultOverride",
      },
    ]

    for (const { what, tag, setter } of handlers) {
      expect(tag, `${COMPONENT}: ${what} was not found (G-4).`).toBeDefined()

      const body = tag ?? ""
      const successAt = body.indexOf("if (result.success)")

      expect(
        successAt,
        `${COMPONENT}: ${what} has no \`if (result.success)\` branch, so this ordering claim would ` +
          `be vacuous.`
      ).toBeGreaterThan(-1)

      const returnAt = body.indexOf("return", successAt)
      const clearAt = body.indexOf(`${setter}(`, successAt)

      expect(
        returnAt,
        `${COMPONENT}: ${what}'s success branch does not return, so "before the return" means ` +
          `nothing here.`
      ).toBeGreaterThan(successAt)

      expect(
        clearAt,
        `${COMPONENT}: ${what} never calls ${setter} in its SUCCESS branch (WR-06). The override ` +
          `is cleared only on failure, so after the first successful toggle the authoritative ` +
          `\`views\` prop is permanently shadowed by stale local state for that row — the switch ` +
          `keeps asserting a position the server may have moved away from, and nothing on screen ` +
          `ever corrects it.`
      ).toBeGreaterThan(-1)

      expect(
        clearAt,
        `${COMPONENT}: ${what} calls ${setter} only AFTER its success branch returns, which is the ` +
          `failure-path revert and not a reconciliation (WR-06).`
      ).toBeLessThan(returnAt)

      /*
       * THREE CALLS NOW, not two: optimistic, discard-on-success, revert-on-failure. Assertion 6
       * requires at least two and is untouched; this pins the third so deleting it fails here with
       * a message that names it, rather than silently dropping back to the shadowed behaviour.
       */
      expect(
        occurrences(body, `${setter}(`),
        `${COMPONENT}: ${what} must call ${setter} three times — optimistically, to DISCARD the ` +
          `override once the write succeeded (WR-06), and to REVERT it on failure (T-40-40). ` +
          `Found ${occurrences(body, `${setter}(`)}.`
      ).toBeGreaterThanOrEqual(3)
    }

    /*
     * THE SHAPE OF EACH DISCARD, checked because the two overrides are modelled differently and a
     * copy-paste between them would be wrong in a way ordering cannot see. Sharing is per view, so
     * its override is a map and only THIS view's entry may be dropped — assigning `{}` would discard
     * a sibling row's in-flight position. The default is per (user, entityType), so exactly one view
     * can hold it and `null` means "no override at all".
     */
    const shareTag = switches.find((tag) => tag.includes("setViewShared({")) ?? ""

    expect(
      shareTag,
      `${COMPONENT}: the share switch must drop only its OWN key from sharedOverride. Replacing the ` +
        `whole map would discard another row's in-flight position (WR-06).`
    ).toContain("delete remaining[view.id]")

    const defaultTag = switches.find((tag) => tag.includes("setViewDefault({")) ?? ""

    expect(
      defaultTag,
      `${COMPONENT}: the default switch must clear its override with setDefaultOverride(null) — ` +
        `the default is per (user, entityType), so "no override" is the whole of it (WR-06).`
    ).toContain("setDefaultOverride(null)")
  })

  it("9. F-39-04: no ProgressBar", () => {
    const source = read()

    /*
     * `progress-bar.tsx` exists and has neither `role="progressbar"` nor `aria-valuenow`. Nothing
     * on this surface has progress to report anyway — each toggle is one round trip — so a bar
     * would add an accessibility defect in exchange for a lie.
     */
    expect(
      occurrences(source, "ProgressBar"),
      `${COMPONENT}: ProgressBar is forbidden (F-39-04) — it has no role="progressbar" and no ` +
        `aria-valuenow, and nothing here has progress to report.`
    ).toBe(0)
  })

  it("10. K-1: every user-visible string comes from the catalog, all eighteen keys", () => {
    const source = read()

    /*
     * NOT ONE OF THE PLAN'S NINE, and cheap. The namespace bindings are what make the key
     * assertions above mean "a catalog key" rather than "a bare English literal that happens to
     * read like one", and the exhaustive lists are the plan's own done criterion: all 13
     * views.manage.* keys and all 5 views.delete.* keys referenced. An unreferenced key is a
     * sentence the user was promised and never sees — the empty-state body and the read-only
     * explanation are exactly the two most likely to be dropped.
     */
    expect(source).toContain('useTranslations("views")')
    expect(source).toContain('useTranslations("common")')

    for (const key of [...MANAGE_KEYS, ...DELETE_KEYS]) {
      expect(
        source,
        `${COMPONENT}: views.${key} is never referenced (K-1). The catalog carries it in all three ` +
          `locales, so an unused key is a sentence that was written, translated and then not shown.`
      ).toContain(`"${key}"`)
    }

    // K-4 — the Cancel reads common.cancel; no new close word.
    expect(
      source,
      `${COMPONENT}: the confirmation's Cancel must read common.cancel, not a new label (K-4).`
    ).toContain('("cancel")')

    // C-40-2's three state words, present as catalog keys rather than as literals.
    for (const key of ["badgeShared", "badgePrivate", "badgeDefault", "ownedBy"]) {
      expect(
        source,
        `${COMPONENT}: views.${key} is never referenced (C-40-2) — the state-words line is the ONLY ` +
          `carrier of Shared / Private / Default on this surface.`
      ).toContain(`"${key}"`)
    }
  })
})
