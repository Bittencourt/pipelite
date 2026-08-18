/**
 * The wiring gate for the floating bulk action bar.
 *
 * COMMENT-BLIND BY CONSTRUCTION. Every source below is read through the shared `readStrippedSource`
 * helper, which removes line and block comments in a string-aware pass before a single assertion
 * runs. That is not tidiness. Most of what follows is a NEGATIVE assertion, and a negative source
 * assertion is trivially satisfied — or trivially broken — by prose: a doc comment that merely names
 * the token it forbids invalidates its own gate. Phase 37 lost nine gate runs to exactly that
 * collision, and Phase 38 has now hit it twice more.
 *
 * THE CORRECT RESPONSE TO A COLLISION IS TO REWORD THE COMMENT, NEVER TO WEAKEN THE GATE. If an
 * assertion below starts failing because a comment mentions a forbidden idiom, change the comment.
 * Loosening a pattern, adding an exception or deleting an assertion converts a real constraint into
 * decoration, which is the bug both of this repo's earlier source-gate analogs actually shipped.
 *
 * WHY A SOURCE GATE AT ALL. This repo renders NO client components in tests: there is no jsdom, no
 * happy-dom and no testing library, and adding one is a dependency decision belonging to a phase
 * willing to own it. The bar's load-bearing decisions are layout and layering, which have no
 * pure-function home — so they are pinned here at the source level, and the rendered result is
 * verified by this phase's browser UAT.
 *
 * Three anti-vacuity requirements, all met below:
 *
 *   1. Prove the sources were found and read — a helper that silently returned "" would satisfy
 *      every negative assertion in this file perfectly. Hence the non-empty assertions FIRST.
 *   2. Prove this is the RIGHT file, by asserting known POSITIVE markers before any negative. If the
 *      bar stops being a labelled region, or stops reading the shared cap, this gate must go RED and
 *      be reconsidered rather than keep passing over a file that no longer contains what it checks.
 *   3. A gate for the gate: two vocabulary tables, one pinning what must be PRESENT and one pinning
 *      what must be LEFT ALONE, each iterated, so a newly introduced idiom cannot sail through
 *      unasserted.
 */
import { describe, expect, it } from "vitest"

import { readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"

const BAR = readStrippedSource("src/components/bulk/bulk-action-bar.tsx")

/**
 * The one other `fixed bottom-0` element in the app, read so the layering assertion compares against
 * the MEASURED value rather than against a number copied into this file and left to rot.
 */
const SHORTCUTS_HINT = readStrippedSource("src/components/keyboard/shortcuts-hint.tsx")

/** The root layout, read so the toast container's global configuration can be pinned as untouched. */
const LAYOUT = readStrippedSource("src/app/layout.tsx")

/** The first non-comment token of a client module. */
const CLIENT_DIRECTIVE = /^\s*(['"])use client\1/

/** The bar's own layer, as an arbitrary-value Tailwind class. */
const BAR_LAYER = /z-\[(\d+)\]/

/** A plain-scale Tailwind layer class, which is how the global hint declares its own. */
const SCALE_LAYER = /\bz-(\d+)\b/

/** Every colour the UI contract forbids on these surfaces, plus any raw hex literal. */
const FORBIDDEN_COLOURS = [
  "text-red-",
  "text-green-",
  "bg-red-",
  "bg-green-",
  "bg-white",
  "text-black",
]
const HEX_LITERAL = /#[0-9a-fA-F]{3,6}/

/** A button that does not name its object, per the copy contract. */
const BARE_LABELS = [">Save<", ">Cancel<", ">Confirm<", ">OK<", ">Yes<", ">Apply<"]

/** Reaching for a shared generic label is how a bare "Confirm" button gets shipped. */
const SHARED_LABEL_KEYS = /tCommon|common\.(cancel|delete|confirm|save)/

/**
 * FORBIDDEN HOTKEY TOKENS. A table rather than one assertion per token, so the next candidate is
 * added in one place.
 *
 * The hazard is specific and it is the most safety-relevant rule of the phase: the list surfaces
 * already bind a bare letter to the SINGLE-record delete dialog for the keyboard-cursor row, and it
 * keeps doing exactly that while a bulk selection exists. Silently repurposing it to mean "delete
 * twelve records" — or binding a bare deletion key to a hundred writes — is the most dangerous thing
 * this phase could ship. Both quote flavours, because either spells the same binding.
 */
const FORBIDDEN_HOTKEYS = [
  '"d"',
  "'d'",
  '"x"',
  "'x'",
  '"Delete"',
  "'Delete'",
  '"Backspace"',
  "'Backspace'",
]

/**
 * VOCABULARY TABLE 1 — RECOGNISED. What must be PRESENT in the bar. Every entry is a decision with
 * no pure-function home, so its only proof is that it is still written down.
 */
const RECOGNISED = [
  // The region and its accessible name — a bare visible count omits the noun a screen reader needs.
  'role="region"',
  "actionBarLabel",
  // The shared cap, read rather than restated, so the guard and the copy cannot drift.
  "BULK_MAX_IDS",
  "error.tooMany",
  // Layout.
  "z-[60]",
  "max-w-[calc(100%-2rem)]",
  "flex-wrap",
  "h-20",
  "aria-hidden",
  // Absent at zero selection.
  "return null",
  // The three non-filled control variants and the destructive tint that is text, never a fill.
  'variant="outline"',
  'variant="ghost"',
  "text-destructive hover:text-destructive",
  // In-flight.
  "animate-spin",
  "startTransition",
  // Submit-time label capture, which is what lets the report name a record that no longer exists.
  "Object.fromEntries",
  // A partial result is a warning, not an error: records really did change.
  "toast.warning",
  // The Trash deep link, and the query parameter the trash surface actually parses.
  "ENTITY_TO_TRASH_TAB",
  "?type=",
  // The client-side download.
  "URL.createObjectURL",
  "URL.revokeObjectURL",
  "text/csv;charset=utf-8;",
  // Copy comes from the phase's own namespace.
  'useTranslations("bulk")',
]

/**
 * VOCABULARY TABLE 2 — LEFT ALONE. What must be ABSENT from the bar. Each entry would break
 * something silently rather than loudly, which is why they are asserted by iteration.
 */
const LEFT_ALONE = [
  // A lower layer puts the bar behind the global hint on a fresh profile.
  "z-30",
  "z-40",
  "z-50",
  // The bar has zero filled controls: it already carries the page's strongest visual weight.
  "bg-primary",
  "bg-destructive",
  'variant="default"',
  // The three actions are peers, all always applicable, and no hover-only hint primitive is vendored.
  "DropdownMenu",
  "Tooltip",
  // The export surface: ids and nothing else.
  "ExportOptions",
  "ExportFilters",
  "ExportFormat",
  "pipedrive",
  "api/export",
  // Server-only modules, which would break the build at the client boundary.
  "@/lib/bulk/dispatch",
  "@/lib/trash/dispatch",
  // The parameter the trash surface does NOT read.
  "?tab=",
]

// ANTI-VACUITY 1 AND 2. These run before every negative assertion in this file, deliberately.
describe("the gate reads the right sources", () => {
  it("read the bar's source", () => {
    expect(
      BAR.length,
      "bulk-action-bar.tsx must have been read: a helper returning an empty string would satisfy every negative assertion in this file perfectly"
    ).toBeGreaterThan(0)
  })

  it("read the two sources it compares the bar against", () => {
    expect(
      SHORTCUTS_HINT.length,
      "shortcuts-hint.tsx must have been read: the layering assertion compares against ITS declared layer, so an unread file would silently make that comparison vacuous"
    ).toBeGreaterThan(0)

    expect(
      LAYOUT.length,
      "layout.tsx must have been read: it is where the toast container is mounted, and an unread file would make the untouched-toaster assertion pass over nothing"
    ).toBeGreaterThan(0)
  })

  it("found the bar's labelled region", () => {
    expect(
      BAR,
      'bulk-action-bar.tsx must render role="region" with a translated accessible name. If the bar stops being a labelled region this gate must go red and be reconsidered, not keep asserting layout rules about a landmark that is gone'
    ).toContain('role="region"')
  })

  it("found the shared cap constant", () => {
    expect(
      BAR,
      "bulk-action-bar.tsx must read BULK_MAX_IDS. If the bar stops reading the shared constant, the number in the copy and the number the server enforces can drift, and this gate must go red rather than keep checking a mirror that no longer mirrors anything"
    ).toContain("BULK_MAX_IDS")
  })
})

describe("the bar sits on the client side of the RSC boundary", () => {
  it("opens with the 'use client' directive", () => {
    expect(
      CLIENT_DIRECTIVE.test(BAR),
      "bulk-action-bar.tsx must open with the 'use client' directive: it owns two Radix dialogs and its own state, and a server module handing children to an asChild slot renders nothing at all, silently (CFUI-01)"
    ).toBe(true)
  })
})

describe("the bar is layered above every other fixed element in the app (D-22)", () => {
  it("declares an arbitrary-value layer and no plain-scale one", () => {
    expect(
      BAR,
      "the bar must declare z-[60]. Anything on the plain Tailwind scale collides with the global keyboard-shortcuts hint, which is fixed to the bottom of the viewport at its own layer for the first ten seconds of a fresh session"
    ).toContain("z-[60]")
  })

  it("is strictly above the layer the global shortcuts hint declares for itself", () => {
    const barLayer = Number(BAR.match(BAR_LAYER)?.[1])
    const hintLayer = Number(SHORTCUTS_HINT.match(SCALE_LAYER)?.[1])

    expect(
      Number.isFinite(hintLayer),
      "shortcuts-hint.tsx must still declare a z- class. If it stops being a layered fixed element this comparison is vacuous and the gate must be reconsidered rather than silently pass"
    ).toBe(true)

    expect(
      Number.isFinite(barLayer),
      "bulk-action-bar.tsx must declare a numeric layer this gate can read"
    ).toBe(true)

    expect(
      barLayer,
      `the bar's layer (${barLayer}) must be strictly greater than the shortcuts hint's (${hintLayer}). The hint is mounted globally in the root layout as a fixed bottom-0 element for the first ten seconds of any session whose dismissal flag is unset, so a bar at or below its layer renders BEHIND it — unreachable exactly when a new user first tries a bulk action, and unreachable specifically for the destructive control (T-38-31)`
    ).toBeGreaterThan(hintLayer)
  })
})

describe("the bar wraps rather than widening the page at 320px", () => {
  it("caps its width and allows its controls to wrap", () => {
    expect(
      BAR,
      "the bar must cap its own width. A `fixed` element that exceeds the viewport STILL contributes to document.scrollWidth, so an uncapped bar gives every list page a horizontal scrollbar at narrow widths — the defect Phase 37 measured and this contract exists to prevent"
    ).toContain("max-w-[calc(100%-2rem)]")

    expect(
      BAR,
      "the bar's inner row must wrap. Capping the width without wrapping just moves the overflow inside the bar, which then scrolls horizontally instead of folding onto two or three lines"
    ).toContain("flex-wrap")
  })
})

describe("the bar reserves the space it covers", () => {
  it("renders a decorative in-flow spacer", () => {
    expect(
      BAR,
      "the bar must render an h-20 spacer. Without it the fixed bar covers the last table row and the Load More button, which are the two things at the bottom of every one of these surfaces"
    ).toContain("h-20")

    expect(
      BAR,
      "the spacer must be aria-hidden: it carries no content and a screen reader announcing an empty region between the table and the end of the document is noise"
    ).toContain("aria-hidden")
  })
})

describe("the bar has zero filled controls", () => {
  it("uses no accent or destructive fill and no default button variant", () => {
    for (const token of ["bg-primary", "bg-destructive", 'variant="default"']) {
      expect(
        BAR.includes(token),
        `"${token}" must not appear in the bar. It floats above the rows on a raised card surface, so it already has the strongest visual weight on the page; a filled control inside it would read as the page's dominant element while sitting permanently on top of the user's data`
      ).toBe(false)
    }
  })

  it("hides no action behind an overflow menu and needs no hover-only hint", () => {
    for (const token of ["DropdownMenu", "Tooltip"]) {
      expect(
        BAR.includes(token),
        `"${token}" must not appear in the bar. The three actions are peers, all always applicable, so hiding them adds a click to every bulk action; and no hover-only hint primitive is vendored in this repo, which is why every control carries a visible text label instead`
      ).toBe(false)
    }
  })
})

describe("the bar binds Escape and nothing else", () => {
  it("clears the selection on Escape", () => {
    expect(
      BAR,
      "Escape is the one new binding this phase adds, and the surfaces' existing keyboard hooks do not bind it, so there is no collision. When a dialog is open Radix owns it, which is what the handler's gate preserves"
    ).toContain("Escape")
  })

  it("binds no letter and no bare deletion key to a bulk action", () => {
    for (const token of FORBIDDEN_HOTKEYS) {
      expect(
        BAR.includes(token),
        `${token} must not be bound in the bar. The letter that opens the SINGLE-record delete dialog for the keyboard-cursor row must keep doing exactly that while a bulk selection exists — silently repurposing it to mean "delete twelve records" would be the most dangerous thing this phase could ship (T-38-30)`
      ).toBe(false)
    }
  })
})

/**
 * REGRESSION G1. One Escape with the Delete dialog open closed the dialog AND cleared the whole
 * selection, live on /organizations, three times out of three. The gate that was supposed to prevent
 * it read `deleteOpen`/`reassignOpen` — React state — from a DOCUMENT-level listener, and React can
 * flush Radix's `onOpenChange(false)` and re-register this listener BETWEEN two listeners of the one
 * keydown dispatch, so the handler that ran saw `false` and cleared.
 *
 * THIS DEFECT IS INVISIBLE TO A SYNTHETIC `KeyboardEvent`, which is why the Escape gate above passed
 * throughout the regression. It follows that no jsdom or synthetic-dispatch test can defend this, and
 * a test claiming to would be decoration. What is pinnable at the source level is the SHAPE of the
 * fix: an event-time ref, released on a later macrotask, and dialogs wired through the wrappers that
 * maintain it rather than through the raw setters. The behaviour itself is proven by browser UAT.
 */
describe("the Escape gate does not depend on React state alone (regression G1)", () => {
  it("consults an event-time ref, not only deleteOpen/reassignOpen", () => {
    expect(
      BAR,
      "the Escape handler must consult a ref for the event-time truth. React state is flushed asynchronously relative to a document-level keydown listener, so `deleteOpen`/`reassignOpen` can already read false inside the very dispatch that dismissed the dialog"
    ).toContain("dialogOwnsEscapeRef.current")
  })

  it("releases the dialog's claim on a later macrotask, never during the dispatch", () => {
    expect(
      BAR,
      "the claim must be released via setTimeout so it still reads true for the whole dispatch that dismissed the dialog; releasing it synchronously reintroduces G1 exactly"
    ).toContain("setTimeout")
  })

  it("routes both dialogs through the wrappers that maintain the ref", () => {
    for (const token of ["onOpenChange={handleDeleteOpenChange}", "onOpenChange={handleReassignOpenChange}"]) {
      expect(
        BAR,
        `the dialogs must be wired through ${token}. A dialog wired straight to its setter never marks the ref, so Escape falls back to the stale-state gate that caused G1`
      ).toContain(token)
    }
  })

  it("wires neither dialog straight to its raw state setter", () => {
    for (const token of ["onOpenChange={setDeleteOpen}", "onOpenChange={setReassignOpen}"]) {
      expect(
        BAR.includes(token),
        `"${token}" must not appear in the bar. That raw wiring is precisely the G1 shape: the dialog closes without ever claiming Escape, so the document listener clears the selection in the same keypress`
      ).toBe(false)
    }
  })
})

describe("the bar's export surface is ids and nothing else (T-38-01)", () => {
  it("constructs no export option, filter or format and reaches no route handler", () => {
    for (const token of [
      "ExportOptions",
      "ExportFilters",
      "ExportFormat",
      "pipedrive",
      "api/export",
    ]) {
      expect(
        BAR.includes(token),
        `"${token}" must not appear in the bar. It passes ids to a server action and nothing else: a client-supplied filter object would let the caller widen the export beyond its selection, and the alternate format is an admin surface, so either would be a gate bypass expressed as a prop`
      ).toBe(false)
    }
  })
})

describe("the bar downloads the CSV in the browser", () => {
  it("builds and releases an object URL with the CSV mime type", () => {
    expect(
      BAR,
      "the download must go through URL.createObjectURL, the mechanism the admin export form already uses — this phase adds no route handler for a file the server action already returned"
    ).toContain("URL.createObjectURL")

    expect(
      BAR,
      "the object URL must be revoked. It keeps its blob alive for the lifetime of the document, so a user exporting repeatedly would otherwise accumulate every CSV they ever generated"
    ).toContain("URL.revokeObjectURL")

    expect(
      BAR,
      "the blob must carry the CSV mime type this repo already ships, so the file this phase downloads and the file the admin export downloads are the same kind of thing"
    ).toContain("text/csv;charset=utf-8;")
  })
})

describe("the Trash deep link addresses the tab the trash surface actually parses (D-09)", () => {
  it("uses the shared entity-to-tab map", () => {
    expect(
      BAR,
      "the deep link must resolve its tab through ENTITY_TO_TRASH_TAB rather than a second map: the plural tab values and the singular entity types are deliberately different strings, and a local transform is how a trailing-s guess gets shipped"
    ).toContain("ENTITY_TO_TRASH_TAB")
  })

  it("writes the query parameter the trash page reads", () => {
    expect(
      BAR,
      "the link must use ?type=. trash/page.tsx reads searchParams.type through parseTrashTab, which falls back to the DEFAULT tab for anything it does not recognise"
    ).toContain("?type=")

    expect(
      BAR.includes("?tab="),
      "the link must NOT use ?tab=. Nothing reads that parameter, so the link would silently land on the default tab — the wrong destination for three of the four entity types, on the one link the phase's restore criterion is checked through"
    ).toBe(false)
  })
})

describe("the global toast container is untouched (D-23)", () => {
  it("leaves the Toaster with no position prop", () => {
    const toaster = LAYOUT.match(/<Toaster\b[^>]*>/)?.[0] ?? ""

    expect(
      toaster.length,
      "layout.tsx must still mount a Toaster. If the toast container moves, this gate must go red rather than keep asserting a rule about an element that is gone"
    ).toBeGreaterThan(0)

    expect(
      toaster.includes("position="),
      "the Toaster must carry no position prop. Sonner's own container declares a nine-digit z-index, so a toast already renders above the bar wherever both sit; repositioning the toaster to work around the bar would change global behaviour on every route to solve a problem that does not exist"
    ).toBe(false)
  })
})

describe("the bar's copy and colour stay inside the contracts", () => {
  it("gives every button a label that names its object", () => {
    for (const label of BARE_LABELS) {
      expect(
        BAR.includes(label),
        `a bare ${label.slice(1, -1)} button is forbidden in the bar: every control on these surfaces names its object, and the count is stated before any verb`
      ).toBe(false)
    }
  })

  it("uses none of the shared generic label keys", () => {
    expect(
      SHARED_LABEL_KEYS.test(BAR),
      "the bar must not reuse common.cancel / common.delete / common.confirm / common.save. The copy rule forbids a bare Cancel, Delete or Confirm on these surfaces, and reaching for the shared namespace is exactly how such a button gets shipped"
    ).toBe(false)
  })

  it("expresses colour through the design tokens only", () => {
    for (const token of FORBIDDEN_COLOURS) {
      expect(
        BAR.includes(token),
        `the bar must express colour through the design tokens; "${token}" bypasses them and breaks dark mode`
      ).toBe(false)
    }

    expect(
      HEX_LITERAL.test(BAR),
      "the bar must contain no raw hex colour: every colour on this surface is a CSS variable, so both themes are covered"
    ).toBe(false)
  })
})

describe("the bar pulls no server-only module across the boundary", () => {
  it("imports neither dispatch module and does import the client-safe trash vocabulary", () => {
    for (const token of ["@/lib/bulk/dispatch", "@/lib/trash/dispatch"]) {
      expect(
        BAR.includes(token),
        `the bar must not import ${token}: both are server-only and reach @/db, so importing one from a client module drags a database driver into the browser bundle of every route that renders a list`
      ).toBe(false)
    }

    expect(
      BAR,
      "the bar must import @/lib/trash/entity-types — the deliberately database-free sibling of the trash dispatch module, which exists precisely so a client component can read the tab vocabulary"
    ).toContain("@/lib/trash/entity-types")
  })
})

// ANTI-VACUITY 3. Both vocabulary tables, iterated, so a new idiom cannot sail through unasserted.
describe("the gate's own vocabulary", () => {
  it("finds every RECOGNISED token in the bar", () => {
    for (const token of RECOGNISED) {
      expect(
        BAR,
        `the bar must still contain "${token}". This table is the list of decisions with no pure-function home; a missing entry means the decision was edited out silently`
      ).toContain(token)
    }
  })

  it("finds no LEFT-ALONE token in the bar", () => {
    for (const token of LEFT_ALONE) {
      expect(
        BAR.includes(token),
        `the bar must not contain "${token}". Every entry in this table would break something silently rather than loudly, which is why it is asserted by iteration rather than one test per token`
      ).toBe(false)
    }
  })
})
