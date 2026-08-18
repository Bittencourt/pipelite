/**
 * The wiring gate for the search-surface prerequisite: `CommandDialog` prop forwarding, and the
 * single-copy extraction of the global-search results tree.
 *
 * EVERY ASSERTION HERE IS COMMENT-BLIND BY CONSTRUCTION. All three sources are read through the
 * shared `readStrippedSource` helper, which strips line and block comments in a string-aware pass
 * before any assertion runs. That is not tidiness: two of the strongest assertions below are
 * NEGATIVE (a token must appear ZERO times), and a negative source assertion is trivially broken by
 * prose — a doc comment that merely names the token it forbids invalidates its own gate. Phases
 * 37-38 lost fifteen gate runs to exactly that collision. THE CORRECT RESPONSE TO A COLLISION IS TO
 * REWORD THE COMMENT, NEVER TO WEAKEN THE GATE.
 *
 * This repo renders NO client components in tests — no jsdom, no happy-dom, no testing library, and
 * adding one is a dependency decision this phase must not make. So the two structural facts that
 * have no pure-function home are pinned here at the source level.
 *
 * THE TWO ASSERTIONS WORTH THE FILE, and why each exists:
 *
 *   1. `shouldFilter` must REACH THE INNER `<Command>`, not merely exist in `CommandDialog`'s type.
 *      cmdk defaults `shouldFilter` to true and filters every item against that item's own `value`.
 *      Every item this app renders is `value={<a uuid>}`. So a user typing a name matches no item,
 *      the dialog renders its empty state for every query, and the network request that produced
 *      the matches succeeded — a silent, total failure with a green build. Declaring the prop on
 *      the type without forwarding it produces EXACTLY that outcome while looking correct in a
 *      diff, which is the failure mode this assertion exists to catch. `CommandDialog`'s rest
 *      spread lands on the Radix `Dialog` root, so a prop that is not destructured and explicitly
 *      passed can never reach the inner `<Command>` at all.
 *
 *   2. `CommandGroup` must appear ZERO times in `global-search.tsx`. The results tree is about to
 *      serve two surfaces; two copies of it is precisely how the second one drifts from the first,
 *      silently, one bug fix at a time. The extraction is therefore required to be a MOVE, and a
 *      count of zero is the only formulation that can tell a move from a copy.
 *
 * THREE ANTI-VACUITY REQUIREMENTS, all met below, because a gate without them is a string that
 * happens to be absent:
 *
 *   1. Prove the files were found and read. A helper silently returning "" would satisfy every
 *      negative assertion in this file perfectly. Hence the non-empty assertions FIRST — and hence
 *      the `existsSync` guard on the new module, since a module-scope read throwing would abort the
 *      whole file and take the `command.tsx` assertions down with it.
 *   2. Prove it is the RIGHT file, via known POSITIVE markers before any negative one.
 *   3. A gate for the gate: two iterated vocabulary tables, one pinning what must be PRESENT and
 *      one pinning what must be LEFT ALONE.
 */
import { existsSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"

const COMMAND_PATH = "src/components/ui/command.tsx"
const GLOBAL_SEARCH_PATH = "src/components/global-search/global-search.tsx"
const SEARCH_RESULTS_PATH = "src/components/global-search/search-results.tsx"

const COMMAND = readStrippedSource(COMMAND_PATH)
const GLOBAL_SEARCH = readStrippedSource(GLOBAL_SEARCH_PATH)

/**
 * Guarded rather than read directly. A `readFileSync` throw at module scope aborts the ENTIRE file
 * before vitest collects a single test, so a missing module would hide the `command.tsx` half of
 * this gate behind an unrelated ENOENT instead of reporting both halves.
 */
const SEARCH_RESULTS_EXISTS = existsSync(SEARCH_RESULTS_PATH)
const SEARCH_RESULTS = SEARCH_RESULTS_EXISTS ? readStrippedSource(SEARCH_RESULTS_PATH) : ""

/** The `use client` directive as the first non-comment token of a module. */
const CLIENT_DIRECTIVE = /^\s*(['"])use client\1/

/** A named export of the lifted component; this repo default-exports only under `src/app/**`. */
const NAMED_EXPORT = /export\s+function\s+SearchResults\b/

/** A default export anywhere in the lifted module. */
const DEFAULT_EXPORT = /export\s+default\b/

/**
 * The slice of `source` holding one top-level `function <name>(...)` declaration, from its
 * `function` keyword to the start of the next top-level declaration.
 */
function sliceFunction(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`)
  if (start === -1) return ""
  const next = source.indexOf("\nfunction ", start + 1)
  return next === -1 ? source.slice(start) : source.slice(start, next)
}

/**
 * Return the full text of the first `<tag …>` OPENING TAG in `source`, brace- and string-aware so
 * that a `>` inside a className string or inside a nested expression cannot close it early.
 *
 * Extracting the tag is what makes assertion 1 above meaningful: a check for the forwarding text
 * anywhere in the file would also pass on a prop forwarded to the wrong element.
 */
function openingTag(source: string, tag: string): string {
  const marker = `<${tag}`
  let from = 0

  for (;;) {
    const at = source.indexOf(marker, from)
    if (at === -1) return ""

    // Do not match `<CommandInput` when looking for `<Command`.
    const after = source[at + marker.length]
    if (after !== undefined && /[A-Za-z0-9_]/.test(after)) {
      from = at + marker.length
      continue
    }

    let i = at + marker.length
    let quote: string | null = null
    let depth = 0

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

      if (ch === '"' || ch === "'" || ch === "`") quote = ch
      else if (ch === "{") depth += 1
      else if (ch === "}") depth -= 1
      else if (ch === ">" && depth === 0) return source.slice(at, i + 1)

      i += 1
    }

    return source.slice(at)
  }
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

const COMMAND_DIALOG = sliceFunction(COMMAND, "CommandDialog")
const DESTRUCTURE_END = COMMAND_DIALOG.indexOf("}:")
const COMMAND_DIALOG_DESTRUCTURE =
  DESTRUCTURE_END === -1 ? "" : COMMAND_DIALOG.slice(0, DESTRUCTURE_END)
const INNER_COMMAND_TAG = openingTag(COMMAND_DIALOG, "Command")

/**
 * VOCABULARY TABLE 1 — RECOGNISED. What must still be PRESENT in `command.tsx` after the
 * forwarding edit. Each entry is behaviour this plan is required NOT to disturb while touching the
 * same fifteen lines.
 */
const RECOGNISED_IN_COMMAND = [
  'from "cmdk"',
  "CommandPrimitive",
  'data-slot="command"',
  "showCloseButton={showCloseButton}",
  "DialogContent",
]

/**
 * VOCABULARY TABLE 2 — LEFT ALONE. What must be ABSENT from the lifted module. Each entry marks a
 * responsibility that belongs to the CALLER, not to a presentational tree shared by two surfaces:
 * its own list wrapper, its own navigation, its own state, its own data fetching. The last entry
 * pins this repo's unified `radix-ui` import convention, which currently has zero violations.
 */
const LEFT_ALONE_IN_SEARCH_RESULTS = [
  "<CommandList",
  "useRouter",
  "useState",
  "useDebouncedCallback",
  "fetch(",
  "@radix-ui/react-",
]

const SOURCES: [string, string][] = [
  ["command.tsx", COMMAND],
  ["global-search.tsx", GLOBAL_SEARCH],
  ["search-results.tsx", SEARCH_RESULTS],
]

// ANTI-VACUITY 1 AND 2. These run before every negative assertion in this file, deliberately.
describe("the gate reads the right sources", () => {
  it("finds the lifted module on disk", () => {
    expect(
      SEARCH_RESULTS_EXISTS,
      `${SEARCH_RESULTS_PATH} must exist. It is the single home of the search results tree; until it does, every negative assertion below is being made against an empty string and proves nothing`
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
      COMMAND,
      "command.tsx must still wrap cmdk's CommandPrimitive. If this file stops being the cmdk wrapper, this gate must go red and be reconsidered rather than keep passing over a file it no longer describes"
    ).toContain("CommandPrimitive")

    expect(
      GLOBAL_SEARCH,
      "global-search.tsx must still register its useHotkeys binding — that is the marker identifying it as the desktop search surface rather than some other module"
    ).toContain("useHotkeys")

    expect(
      SEARCH_RESULTS,
      "search-results.tsx must render CommandGroup. A module by that name containing no group is not the lifted results tree, and every count assertion below would be measuring the wrong file"
    ).toContain("CommandGroup")
  })
})

describe("CommandDialog can turn cmdk's client-side filter off", () => {
  it("still declares CommandDialog with a destructured parameter list", () => {
    expect(
      COMMAND_DIALOG.length,
      "command.tsx must still declare `function CommandDialog(`. This gate slices that one function out and asserts against the slice; if the declaration moves or changes shape, the assertions below would silently be made against an empty string"
    ).toBeGreaterThan(0)

    expect(
      COMMAND_DIALOG_DESTRUCTURE.length,
      "CommandDialog must keep its destructure-then-forward shape, ending at the `}:` that opens its inline props type — the same shape dialog.tsx already uses for showCloseButton"
    ).toBeGreaterThan(0)
  })

  it("destructures shouldFilter and loop out of the rest spread", () => {
    for (const prop of ["shouldFilter", "loop"]) {
      expect(
        COMMAND_DIALOG_DESTRUCTURE,
        `CommandDialog must destructure \`${prop}\`. Destructuring is what makes the forwarding both possible AND safe: it removes the prop from \`...props\`, which is spread onto the Radix Dialog root where it means nothing and would land as an unknown DOM attribute`
      ).toContain(prop)
    }
  })

  it("declares both props as optional booleans on its inline props type", () => {
    for (const declaration of ["shouldFilter?: boolean", "loop?: boolean"]) {
      expect(
        COMMAND_DIALOG,
        `CommandDialog's props type must declare \`${declaration}\`, alongside the existing title / description / className / showCloseButton members. Optional is required: a caller passing neither must keep cmdk's defaults exactly as today`
      ).toContain(declaration)
    }
  })

  it("forwards both props to the INNER Command, not to the Dialog root", () => {
    expect(
      INNER_COMMAND_TAG.length,
      "CommandDialog must still render an inner `<Command>`. This assertion extracts that opening tag so the two below describe the element the props actually reach, rather than the text appearing anywhere in the function"
    ).toBeGreaterThan(0)

    expect(
      INNER_COMMAND_TAG,
      "the inner <Command> must carry `shouldFilter={shouldFilter}`. cmdk defaults shouldFilter to true and filters each item against that item's own `value`; every item this app renders is `value={<a uuid>}`, so a user typing a name matches nothing and the dialog shows its empty state for every query while the search request that produced the matches returned 200. Adding the prop to the type WITHOUT forwarding it reproduces that failure exactly while looking correct in a diff — which is the case this assertion exists to catch"
    ).toContain("shouldFilter={shouldFilter}")

    expect(
      INNER_COMMAND_TAG,
      "the inner <Command> must carry `loop={loop}`. It travels with shouldFilter for the same mechanical reason: CommandDialog's rest spread lands on the Radix Dialog root, so a prop that is not explicitly passed here cannot reach cmdk at all"
    ).toContain("loop={loop}")
  })
})

describe("the results tree exists in exactly one place", () => {
  it("is a client module with a named SearchResults export", () => {
    expect(
      CLIENT_DIRECTIVE.test(SEARCH_RESULTS),
      "search-results.tsx must open with the 'use client' directive: it binds useTranslations and receives an event handler prop, neither of which exists on the server side of the boundary"
    ).toBe(true)

    expect(
      NAMED_EXPORT.test(SEARCH_RESULTS),
      "search-results.tsx must export SearchResults as a NAMED export. This repo default-exports only route files under src/app/** and root config files"
    ).toBe(true)

    expect(
      DEFAULT_EXPORT.test(SEARCH_RESULTS),
      "search-results.tsx must carry no default export, for the same convention reason"
    ).toBe(false)
  })

  it("holds all three result groups and the empty state", () => {
    expect(
      countOccurrences(SEARCH_RESULTS, "CommandGroup"),
      "search-results.tsx must reference CommandGroup at least three times — the import plus one group each for organizations, people and deals. A minimum rather than an exact count, so that explaining the mechanism in code cannot break the gate"
    ).toBeGreaterThanOrEqual(3)

    expect(
      countOccurrences(SEARCH_RESULTS, "CommandEmpty"),
      "search-results.tsx must reference CommandEmpty: the no-results branch travels with the groups, or the second surface renders a blank popover where the first renders a sentence"
    ).toBeGreaterThanOrEqual(1)
  })

  it("leaves the list wrapper at each call site", () => {
    for (const token of LEFT_ALONE_IN_SEARCH_RESULTS) {
      expect(
        SEARCH_RESULTS.includes(token),
        `search-results.tsx must not contain "${token}". The shared unit is presentational: each surface owns its own list wrapper, its own navigation side effect, its own state and its own fetching, and this repo imports Radix through the unified package rather than the per-primitive ones`
      ).toBe(false)
    }
  })

  it("takes its navigation as a prop rather than reaching for the router", () => {
    expect(
      SEARCH_RESULTS,
      "SearchResults must accept an onSelect prop. The popover's handler closes the popover as well as navigating and the dialog's will close the dialog: two behaviours, one tree, so the behaviour is the caller's and the tree is shared"
    ).toContain("onSelect")
  })
})

describe("the desktop popover consumes the shared tree instead of its own copy", () => {
  it("renders SearchResults", () => {
    expect(
      GLOBAL_SEARCH,
      "global-search.tsx must render <SearchResults. The popover is the first of the two surfaces the extracted tree serves; if it kept its own copy, the extraction bought nothing"
    ).toContain("<SearchResults")
  })

  it("keeps no second copy of the result groups", () => {
    expect(
      countOccurrences(GLOBAL_SEARCH, "CommandGroup"),
      "global-search.tsx must reference CommandGroup ZERO times. Two copies of the results tree is exactly how the popover and the dialog drift apart — silently, one bug fix at a time — so the extraction is required to be a MOVE, and a count of zero is the only formulation that can tell a move from a copy"
    ).toBe(0)
  })

  it("still disables cmdk's filter on its own outer Command", () => {
    expect(
      GLOBAL_SEARCH,
      "global-search.tsx's outer <Command> must still set shouldFilter={false}. The popover path works ONLY because of it: every item it renders is keyed by a UUID, so re-enabling cmdk's filter would hide every result the moment the user typed a second character"
    ).toContain("shouldFilter={false}")
  })
})

// ANTI-VACUITY 3. Both vocabulary tables, iterated, so a new idiom cannot sail through unasserted.
describe("the gate's own vocabulary", () => {
  it("finds every RECOGNISED token in command.tsx", () => {
    for (const token of RECOGNISED_IN_COMMAND) {
      expect(
        COMMAND,
        `command.tsx must still contain "${token}". This table pins the behaviour the forwarding edit is required NOT to disturb while touching the same fifteen lines`
      ).toContain(token)
    }
  })

  it("keeps command.tsx on the unified radix package", () => {
    expect(
      COMMAND.includes("@radix-ui/react-"),
      "command.tsx must import no per-primitive @radix-ui/react-* package. This repo has zero such imports and uses the unified `radix-ui` package throughout"
    ).toBe(false)
  })
})
