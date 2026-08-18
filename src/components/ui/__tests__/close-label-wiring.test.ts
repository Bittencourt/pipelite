/**
 * The wiring gate for the dialog-family close label — UI-SPEC rules S-2, S-3 and S-4.
 *
 * EVERY ASSERTION HERE IS COMMENT-BLIND BY CONSTRUCTION. All three sources are read through the
 * shared `readStrippedSource` helper, which strips line and block comments in a string-aware pass
 * before any assertion runs. That is not tidiness: the strongest assertions below are NEGATIVE (a
 * token must appear ZERO times), and a negative source assertion is trivially broken by prose — a
 * doc comment that merely names the token it forbids invalidates its own gate. Phases 37-38 lost
 * fifteen gate runs to exactly that collision. THE CORRECT RESPONSE TO A COLLISION IS TO REWORD THE
 * COMMENT, NEVER TO WEAKEN THE GATE.
 *
 * This repo renders NO client components in tests — no jsdom, no happy-dom, no testing library, and
 * adding one is a dependency decision this phase must not make. The rendered `sr-only` text is
 * therefore pinned here at the source level and confirmed by this phase's browser UAT.
 *
 * THE THREE ASSERTIONS WORTH THE FILE, and why each exists:
 *
 *   1. `dialog.tsx` must carry no hardcoded close string AT EITHER OF ITS TWO SITES. Site one is the
 *      `sr-only` span inside `DialogContent`'s close button — the only name a screen-reader user
 *      gets for that control, rendered in English under pt-BR and es-ES today, across roughly
 *      sixteen call sites. Site two is a VISIBLE outline button inside `DialogFooter`, behind that
 *      component's OWN `showCloseButton` prop, which defaults to false and is a different prop from
 *      `DialogContent`'s. The second site is easy to miss precisely because it is off by default,
 *      and it is the same defect class, so this gate asserts against the whole file rather than
 *      against one component.
 *
 *   2. `sheet.tsx` must satisfy the identical rule FROM THE MOMENT IT EXISTS. The official shadcn
 *      block ships its own hardcoded close span verbatim; adding it as-is would create a NEW
 *      instance of exactly the defect this phase removes, in the same change that removes the old
 *      ones. The assertion is written to be red while the file is absent so it cannot be satisfied
 *      by never adding the component.
 *
 *   3. `alert-dialog.tsx` must keep carrying no hardcoded close string. This is S-3, and it is an
 *      ASSERTION, NOT AN EDIT: that file ships nothing of the kind today, because
 *      `AlertDialogCancel` renders only its children and all of its roughly sixteen call sites
 *      already pass translated copy. Inventing an unrequested default label there would be wrong.
 *      Pinning the current, correct absence is what satisfies the locked decision.
 *
 * THREE ANTI-VACUITY REQUIREMENTS, all met below, because a gate without them is a string that
 * happens to be absent:
 *
 *   1. Prove the files were found and read. A helper silently returning "" would satisfy every
 *      negative assertion in this file perfectly. Hence the non-empty assertions FIRST — and hence
 *      the `existsSync` guard on the new primitive, since a module-scope read that throws aborts the
 *      whole file before vitest collects a single test and would hide the `dialog.tsx` half of this
 *      gate behind an unrelated ENOENT instead of reporting both halves by name.
 *   2. Prove it is the RIGHT file, via known POSITIVE markers before any negative one.
 *   3. A gate for the gate: two iterated vocabulary tables, one pinning what must be PRESENT in both
 *      translated primitives and one pinning what must be LEFT ALONE in all three.
 */
import { existsSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"
import enUS from "@/messages/en-US.json"

const DIALOG_PATH = "src/components/ui/dialog.tsx"
const SHEET_PATH = "src/components/ui/sheet.tsx"
const ALERT_DIALOG_PATH = "src/components/ui/alert-dialog.tsx"

const DIALOG = readStrippedSource(DIALOG_PATH)
const ALERT_DIALOG = readStrippedSource(ALERT_DIALOG_PATH)

/**
 * Guarded rather than read directly, so that a missing primitive is reported as its own named
 * failure instead of an ENOENT that takes every other assertion in the file down with it.
 */
const SHEET_EXISTS = existsSync(SHEET_PATH)
const SHEET = SHEET_EXISTS ? readStrippedSource(SHEET_PATH) : ""

/**
 * A close label written into the source instead of read from the catalog, in either of the two
 * spellings this family takes: a JSX text node, or a bare quoted literal handed to a prop.
 */
const HARDCODED_CLOSE = /(>\s*Close\s*<)|(["'`]Close["'`])/

/** The unified-package import this repo uses for every Radix primitive. */
const UNIFIED_RADIX = /from "radix-ui"/

/** The per-primitive packages this repo does not use. */
const PER_PACKAGE_RADIX = "@radix-ui/react-"

/** The `use client` directive as the first non-comment token of a module. */
const CLIENT_DIRECTIVE = /^\s*(['"])use client\1/

/** The full export set of the official shadcn sheet block. */
const SHEET_EXPORTS = [
  "Sheet",
  "SheetClose",
  "SheetContent",
  "SheetDescription",
  "SheetFooter",
  "SheetHeader",
  "SheetTitle",
  "SheetTrigger",
]

/**
 * The slice of `source` holding one top-level `function <name>(...)` declaration, from its
 * `function` keyword to the start of the next top-level declaration.
 *
 * Slicing matters here: `dialog.tsx` has TWO close sites in two different components, and a
 * whole-file check for the translated chain would pass with one site converted and one left in
 * English.
 */
function sliceFunction(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`)
  if (start === -1) return ""
  const next = source.indexOf("\nfunction ", start + 1)
  return next === -1 ? source.slice(start) : source.slice(start, next)
}

function countOccurrences(source: string, token: string): number {
  let count = 0
  let from = 0

  for (;;) {
    const at = source.indexOf(token, from)
    if (at === -1) return count
    count += 1
    from = at + token.length
  }
}

const DIALOG_CONTENT = sliceFunction(DIALOG, "DialogContent")
const DIALOG_FOOTER = sliceFunction(DIALOG, "DialogFooter")
const SHEET_CONTENT = sliceFunction(SHEET, "SheetContent")
const ALERT_DIALOG_CANCEL = sliceFunction(ALERT_DIALOG, "AlertDialogCancel")

/**
 * The three fragments that together make one close site translated: the prop is declared, the
 * namespace is bound, and the override falls back to the catalog key. All three are asserted per
 * SITE rather than per file, because two of the three appearing anywhere in `dialog.tsx` proves
 * nothing about the second component.
 */
const TRANSLATED_CLOSE_SITE = [
  "closeLabel",
  'useTranslations("common")',
  't("close")',
]

/**
 * VOCABULARY TABLE 1 — RECOGNISED. What must be PRESENT in both translated primitives. Each entry
 * is a decision with no pure-function home in a repo that renders no components in tests.
 */
const RECOGNISED_IN_TRANSLATED = [
  "closeLabel?: string",
  'useTranslations("common")',
  't("close")',
  'from "next-intl"',
  "data-slot=",
  "cn(",
]

/**
 * VOCABULARY TABLE 2 — LEFT ALONE. What must be ABSENT from all three files. Each entry would break
 * something silently rather than loudly: a hardcoded label reads as English to every non-English
 * screen-reader user while the build stays green, a per-primitive Radix import splits this repo's
 * single dependency into two copies of the same code, and `forwardRef` / `displayName` are the
 * pre-v4 shadcn shape none of these files uses — a file carrying them was pasted from the wrong era
 * of the registry and will drift from its siblings.
 */
const LEFT_ALONE_EVERYWHERE = [
  PER_PACKAGE_RADIX,
  'sr-only">Close',
  "forwardRef",
  "displayName",
]

const SOURCES: [string, string][] = [
  ["dialog.tsx", DIALOG],
  ["sheet.tsx", SHEET],
  ["alert-dialog.tsx", ALERT_DIALOG],
]

/** The two primitives this plan is required to route through the catalog. */
const TRANSLATED_PRIMITIVES: [string, string][] = [
  ["dialog.tsx", DIALOG],
  ["sheet.tsx", SHEET],
]

// ANTI-VACUITY 1 AND 2. These run before every negative assertion in this file, deliberately.
describe("the gate reads the right sources", () => {
  it("finds the sheet primitive on disk", () => {
    expect(
      SHEET_EXISTS,
      `${SHEET_PATH} must exist — this plan creates it. The admin drawer is built on it by a later plan, and until the file is on disk every negative assertion about it below is being made against an empty string and proves nothing`
    ).toBe(true)
  })

  it("read all three sources", () => {
    for (const [name, source] of SOURCES) {
      expect(
        source.length,
        `${name} must have been read as non-empty: a source that read as "" would satisfy every negative assertion in this file perfectly`
      ).toBeGreaterThan(0)
    }
  })

  it("found the expected positive marker in each source", () => {
    expect(
      DIALOG,
      "dialog.tsx must still render DialogPrimitive.Close. If this file stops owning the dialog close control, this gate must go red and be reconsidered rather than keep passing over a file it no longer describes"
    ).toContain("DialogPrimitive.Close")

    expect(
      SHEET,
      "sheet.tsx must render SheetPrimitive.Content — that is the marker identifying it as the Radix-backed sheet primitive rather than some other module of the same name"
    ).toContain("SheetPrimitive.Content")

    expect(
      ALERT_DIALOG,
      "alert-dialog.tsx must still render AlertDialogPrimitive.Cancel: the S-3 assertion below is about what that component does NOT contain, so this gate must first prove the component is still there"
    ).toContain("AlertDialogPrimitive.Cancel")
  })

  it("still has the catalog key both primitives default from", () => {
    const close: unknown = enUS.common.close

    expect(
      typeof close,
      "common.close must exist in src/messages/en-US.json as a string. It already ships in all three locales, which is why this plan adds no key — and this assertion is what makes removing it break loudly here rather than quietly in a screen reader"
    ).toBe("string")

    expect(
      (close as string).length,
      "common.close must be non-empty: a blank label leaves the close control with no accessible name at all, which is worse than the untranslated English it replaces"
    ).toBeGreaterThan(0)
  })
})

describe("both dialog close sites default from the catalog", () => {
  it("still declares both components this gate slices", () => {
    expect(
      DIALOG_CONTENT.length,
      "dialog.tsx must still declare `function DialogContent(`. This gate slices that function out and asserts against the slice; if the declaration moves or changes shape, the assertions below would silently be made against an empty string"
    ).toBeGreaterThan(0)

    expect(
      DIALOG_FOOTER.length,
      "dialog.tsx must still declare `function DialogFooter(`, for the same reason. It is a SEPARATE component from DialogContent and holds the second close site"
    ).toBeGreaterThan(0)
  })

  it("routes the sr-only label in DialogContent through common.close", () => {
    for (const fragment of TRANSLATED_CLOSE_SITE) {
      expect(
        DIALOG_CONTENT,
        `DialogContent must contain "${fragment}". The sr-only span on its close button is the only name a screen-reader user gets for that control, and it renders as English under pt-BR and es-ES today at roughly sixteen call sites. The default lives at the primitive rather than at the callers because one edit fixes every one of them, while requiring sixteen callers to pass a label invites the same leak straight back`
      ).toContain(fragment)
    }
  })

  it("routes the visible footer button in DialogFooter through common.close", () => {
    for (const fragment of TRANSLATED_CLOSE_SITE) {
      expect(
        DIALOG_FOOTER,
        `DialogFooter must contain "${fragment}". This is the second close site and it is easy to miss: it is a VISIBLE outline button sitting behind DialogFooter's own showCloseButton prop, which defaults to false and is a DIFFERENT prop from DialogContent's. Same defect class, same fix — and asserting per component rather than per file is what stops one converted site from covering for one left in English`
      ).toContain(fragment)
    }
  })

  it("binds the common namespace once per close site", () => {
    expect(
      countOccurrences(DIALOG, 'useTranslations("common")'),
      "dialog.tsx must call useTranslations(\"common\") at least twice. DialogContent and DialogFooter are two separate function components, so a hook bound in one is not in scope in the other — a single binding means one of the two sites is reading a label it cannot see"
    ).toBeGreaterThanOrEqual(2)
  })

  it("keeps the label overridable per caller", () => {
    expect(
      DIALOG,
      'dialog.tsx must declare `closeLabel?: string`. Optional is the whole point: every existing call site must keep working untouched and get the translated default, while a caller with a more specific word for the action can still say it'
    ).toContain("closeLabel?: string")
  })
})

describe("the sheet primitive ships translated rather than retro-fitted", () => {
  it("still declares the component this gate slices", () => {
    expect(
      SHEET_CONTENT.length,
      "sheet.tsx must declare `function SheetContent(`. That is the component holding the close button, and the assertions below are made against its slice"
    ).toBeGreaterThan(0)
  })

  it("routes its sr-only label through common.close", () => {
    for (const fragment of TRANSLATED_CLOSE_SITE) {
      expect(
        SHEET_CONTENT,
        `SheetContent must contain "${fragment}". The official shadcn block ships a hardcoded close span verbatim, so adding the component as-is would create a NEW instance of exactly the defect this phase exists to remove, in the same change that removes the old ones. The treatment is applied at creation, before the first caller exists`
      ).toContain(fragment)
    }
  })

  it("keeps the label overridable per caller", () => {
    expect(
      SHEET,
      "sheet.tsx must declare `closeLabel?: string`, the same optional-override shape as dialog.tsx. Two primitives with two different prop names for one idea is how the next person forgets which is which"
    ).toContain("closeLabel?: string")
  })

  it("exports the block's full component set", () => {
    for (const name of SHEET_EXPORTS) {
      expect(
        new RegExp(`\\b${name}\\b`).test(SHEET),
        `sheet.tsx must export ${name}. The registry block's set is kept whole: trimming it to only what the first caller needs means the second caller re-adds a component from a different registry version and the two drift`
      ).toBe(true)
    }
  })
})

describe("alert-dialog keeps its hands off the close label — S-3", () => {
  it("renders only its children in AlertDialogCancel", () => {
    expect(
      ALERT_DIALOG_CANCEL.length,
      "alert-dialog.tsx must still declare `function AlertDialogCancel(`. This gate asserts what that function does NOT do, so it has to prove the function is still there first"
    ).toBeGreaterThan(0)

    expect(
      ALERT_DIALOG_CANCEL.includes("<span"),
      "AlertDialogCancel must render no span of its own. This is S-3 and it is an ASSERTION, NOT AN EDIT: the file ships no hardcoded close string today, because the cancel control renders only its children and all of its roughly sixteen call sites already pass translated copy. Adding an unrequested default label here would be the wrong fix — the locked decision is satisfied by pinning the current, correct absence"
    ).toBe(false)
  })

  it("declares no closeLabel prop, and is not asked to", () => {
    expect(
      ALERT_DIALOG.includes("closeLabel"),
      "alert-dialog.tsx must NOT gain a closeLabel prop. It has no close button to label: it exposes Action and Cancel, both of which take their copy from the caller by design, and a default here would silently override a translated string one of those callers already passes"
    ).toBe(false)
  })
})

describe("no close label is written into the source", () => {
  it("names its close control from the catalog in all three files", () => {
    for (const [name, source] of SOURCES) {
      expect(
        HARDCODED_CLOSE.test(source),
        `${name} must contain no hardcoded close string, in either the JSX-text or the quoted-literal spelling. In dialog.tsx that covers BOTH sites — the sr-only span inside DialogContent's close button and the visible outline button inside DialogFooter. A label written into the source reads as English to every pt-BR and es-ES user while the build stays green and no other check in this repo notices`
      ).toBe(false)
    }
  })
})

describe("the unified radix package convention holds", () => {
  it("imports Radix through the single package in both primitives", () => {
    for (const [name, source] of TRANSLATED_PRIMITIVES) {
      expect(
        UNIFIED_RADIX.test(source),
        `${name} must import from "radix-ui". This repo uses the unified radix-ui@1.4.3 package, aliased on import as <Name>Primitive, in every primitive under src/components/ui/`
      ).toBe(true)
    }
  })

  it("pulls in no per-primitive radix package anywhere", () => {
    for (const [name, source] of SOURCES) {
      expect(
        source.includes(PER_PACKAGE_RADIX),
        `${name} must import no per-primitive @radix-ui/react-* package. The count of such imports across src/ is currently ZERO, so a single reintroduction is a convention break rather than a style preference: it installs a second copy of code the unified package already provides, and the two copies version independently`
      ).toBe(false)
    }
  })
})

describe("both primitives stay on the client side of the RSC boundary", () => {
  it("opens with the 'use client' directive", () => {
    for (const [name, source] of TRANSLATED_PRIMITIVES) {
      expect(
        CLIENT_DIRECTIVE.test(source),
        `${name} must open with the 'use client' directive: it calls useTranslations and mounts Radix state, neither of which exists on the server side of the boundary`
      ).toBe(true)
    }
  })
})

// ANTI-VACUITY 3. Both vocabulary tables, iterated, so a new idiom cannot sail through unasserted.
describe("the gate's own vocabulary", () => {
  it("finds every RECOGNISED token in both translated primitives", () => {
    for (const [name, source] of TRANSLATED_PRIMITIVES) {
      for (const token of RECOGNISED_IN_TRANSLATED) {
        expect(
          source,
          `${name} must still contain "${token}". This table is the list of decisions with no pure-function home in a repo that renders no components in tests; a missing entry means the decision was edited out silently`
        ).toContain(token)
      }
    }
  })

  it("finds no LEFT-ALONE token in any of the three files", () => {
    for (const [name, source] of SOURCES) {
      for (const token of LEFT_ALONE_EVERYWHERE) {
        expect(
          source.includes(token),
          `${name} must not contain "${token}". Every entry in this table would break something silently rather than loudly, which is why it is asserted by iteration rather than one test per token`
        ).toBe(false)
      }
    }
  })
})
