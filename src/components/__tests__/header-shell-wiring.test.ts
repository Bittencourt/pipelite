/**
 * The wiring gate for the global header shell: the responsive search collapse (R-1), the mobile
 * search dialog and its translated sr-only header (S-7), and the last hardcoded nav label (S-5).
 *
 * EVERY ASSERTION HERE IS COMMENT-BLIND BY CONSTRUCTION. All three sources are read through the
 * shared `readStrippedSource` helper, which strips line and block comments in a string-aware pass
 * before any assertion runs. That is not tidiness: several of the assertions below are NEGATIVE (a
 * token must appear ZERO times), and a negative source assertion is trivially broken by prose — a
 * doc comment that merely names the token it forbids invalidates its own gate. Phases 37-38 lost
 * fifteen gate runs to exactly that collision. THE CORRECT RESPONSE TO A COLLISION IS TO REWORD THE
 * COMMENT, NEVER TO WEAKEN THE GATE.
 *
 * That rule has a second edge here. The product noun this gate polices legitimately appears in this
 * file's own prose and may appear in a comment inside the header. So the label assertion is written
 * against the JSX FORM — a label sitting between a closing and an opening angle bracket, or alone on
 * its own line inside a JSX child position — never against the bare word. An explanatory sentence
 * can then never be what makes this gate pass or fail.
 *
 * This repo renders NO client components in tests — no jsdom, no happy-dom, no testing library, and
 * adding one is a dependency decision this phase must not make. So the structural facts below, none
 * of which has a pure-function home, are pinned at the source level; the rendered result is measured
 * by `e2e/viewport-320.spec.ts` in a real 320px browser once the image is rebuilt.
 *
 * THE THREE ASSERTIONS WORTH THE FILE, and why each exists:
 *
 *   1. `min-w-0` ON BOTH HEADER CLUSTERS. A flex item defaults to `min-width: auto`, which means it
 *      refuses to shrink below the intrinsic width of its content no matter what the container can
 *      offer. That single default is the whole mechanism behind the measured `document.scrollWidth`
 *      of 416-420 against a `clientWidth` of 305 on every main route: the 256px search input, the
 *      16px gap and the 40px avatar add to more than the client width, and nothing in the row is
 *      allowed to give. `min-w-0` is what makes `justify-between` able to shrink at all, so it is
 *      required on both clusters and not merely on the one that happens to overflow today.
 *
 *   2. `matchMedia` PRESENT AND `useMediaQuery` ABSENT. The `/` hotkey has two targets now, and it
 *      must choose between them without ever storing the viewport in React. A hook that reads a
 *      media query returns false on the server and the real value only after an effect, which is
 *      either a hydration mismatch or a `react-hooks/set-state-in-effect` lint error — severity 2 in
 *      this repo, so a build failure. The breakpoint is therefore read at EVENT TIME inside the
 *      handler and nowhere else: no render-time read, no effect, no state.
 *
 *   3. `title=` AND `description=` ON THE `CommandDialog` CALL. Its defaults are hardcoded English,
 *      and `DialogHeader` is a SIBLING of `DialogContent` rather than a child — so those two strings
 *      render into the page whenever the dialog is MOUNTED, open or not. Passing neither prop would
 *      put untranslated English into every authenticated page in the app, on a brand-new surface, in
 *      the same phase that exists to remove the last of it. Both props are asserted on the SAME
 *      opening tag rather than merely somewhere in the file, because a `title` on one element and a
 *      `description` on another satisfies a file-wide check while leaving one default in place.
 *
 * THREE ANTI-VACUITY REQUIREMENTS, all met below, because a gate without them is a string that
 * happens to be absent:
 *
 *   1. Prove the files were found and read. A helper silently returning "" would satisfy every
 *      negative assertion in this file perfectly. Hence the non-empty assertions FIRST.
 *   2. Prove it is the RIGHT file, via known POSITIVE markers before any negative one.
 *   3. A gate for the gate: iterated vocabulary tables, one pinning what must be PRESENT and one
 *      pinning what must be LEFT ALONE, so a newly introduced idiom cannot sail through unasserted.
 */
import { describe, expect, it } from "vitest"

import { readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"
import enUS from "@/messages/en-US.json"

const NAV_HEADER_PATH = "src/components/nav-header.tsx"
const GLOBAL_SEARCH_PATH = "src/components/global-search/global-search.tsx"
const SEARCH_RESULTS_PATH = "src/components/global-search/search-results.tsx"

const NAV_HEADER = readStrippedSource(NAV_HEADER_PATH)
const GLOBAL_SEARCH = readStrippedSource(GLOBAL_SEARCH_PATH)
const SEARCH_RESULTS = readStrippedSource(SEARCH_RESULTS_PATH)

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

/**
 * The nav label in its two JSX forms: between two tags, and alone on its own line as a JSX child.
 *
 * Deliberately NOT the bare word. The word is the product noun, it is the correct value of the
 * catalog key, and it appears in this file's prose — asserting on it directly would make a rewritten
 * sentence able to flip the gate.
 */
const LABEL_BETWEEN_TAGS = ">Workflows<"
const LABEL_ON_ITS_OWN_LINE = /^[ \t]*Workflows[ \t]*$/m

/**
 * The slice of `source` holding the first `<tag …>` OPENING TAG, brace- and string-aware so that a
 * `>` inside a className string or a nested expression cannot close it early.
 *
 * Local rather than shared with `src/components/ui/__tests__/command-dialog-wiring.test.ts`, which
 * carries the same two helpers: promoting them into `source-scan.ts` would edit a module outside
 * this plan's three files, and a gate helper is the last thing that should be refactored by a plan
 * whose own gate depends on it.
 */
function openingTag(source: string, tag: string): string {
  const marker = `<${tag}`
  let from = 0

  for (;;) {
    const at = source.indexOf(marker, from)
    if (at === -1) return ""

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

const COMMAND_DIALOG_TAG = openingTag(GLOBAL_SEARCH, "CommandDialog")
const ICON_BUTTON_TAG = openingTag(GLOBAL_SEARCH, "Button")

/**
 * VOCABULARY TABLE 1 — RECOGNISED. What must be PRESENT in `global-search.tsx`. Every entry is a
 * decision with no pure-function home: the two surfaces, the two breakpoint halves, the dialog's
 * four required props, and the desktop behaviour this change is required NOT to disturb.
 */
const RECOGNISED_IN_GLOBAL_SEARCH = [
  "CommandDialog",
  "CommandInput",
  "CommandList",
  "shouldFilter={false}",
  "showCloseButton={false}",
  "relative hidden md:block",
  "md:hidden",
  'size="icon-lg"',
  "matchMedia",
  "768px",
  'useTranslations("common")',
  'useTranslations("nav")',
  'className="w-64 pl-9 pr-9"',
  '{ scopes: ["global"], useKey: true }',
]

/**
 * VOCABULARY TABLE 2 — LEFT ALONE. What must be ABSENT from `global-search.tsx`. The first three
 * are the three ways a viewport gets into React state, each of which costs either a hydration
 * mismatch or a lint error at severity 2. The fourth is 45-07's extraction: the results tree serves
 * two surfaces now, so a `CommandGroup` reappearing here is a copy of a tree that must have exactly
 * one, and a copy is how the popover and the dialog drift apart one bug fix at a time.
 */
const LEFT_ALONE_IN_GLOBAL_SEARCH = [
  "useMediaQuery",
  "window.innerWidth",
  "useEffect",
  "CommandGroup",
]

const SOURCES: [string, string][] = [
  ["nav-header.tsx", NAV_HEADER],
  ["global-search.tsx", GLOBAL_SEARCH],
  ["search-results.tsx", SEARCH_RESULTS],
]

const COMPONENT_SOURCES: [string, string][] = [
  ["nav-header.tsx", NAV_HEADER],
  ["global-search.tsx", GLOBAL_SEARCH],
]

// ANTI-VACUITY 1 AND 2. These run before every negative assertion in this file, deliberately.
describe("the gate reads the right sources", () => {
  it("read all three sources", () => {
    for (const [name, source] of SOURCES) {
      expect(
        source.length,
        `${name} must have been read: a helper returning an empty string would satisfy every negative assertion in this file perfectly`
      ).toBeGreaterThan(0)
    }
  })

  it("found the header, the search surface and the shared results tree", () => {
    expect(
      NAV_HEADER,
      "nav-header.tsx must still render next/link Links. If the nav stops being a set of links this gate must go red and be reconsidered, not keep passing over a file that no longer navigates"
    ).toContain("Link")

    expect(
      GLOBAL_SEARCH,
      "global-search.tsx must still register a hotkey. The / shortcut is half of what this plan changes; a file without one is not the file these assertions describe"
    ).toContain("useHotkeys")

    expect(
      SEARCH_RESULTS,
      "search-results.tsx must still render CommandGroup — it is where 45-07 moved the three result groups, and both surfaces render it"
    ).toContain("CommandGroup")
  })
})

/**
 * R-1, THE ARITHMETIC HALF.
 *
 * `w-64` resolves to 256px. At a 320px viewport the document reports a 305px client width, and the
 * global container gutter takes 64 of those, leaving 241 usable. 256 alone does not fit, before the
 * 16px gap and the 40px avatar beside it. So the fix cannot be a smaller input — 256px is 84% of the
 * viewport and a proportionally shrunken one is unusable — it has to be the input leaving the flex
 * row entirely, which is what `hidden md:block` on its wrapper does.
 */
describe("the inline search leaves the flex row below md instead of shrinking", () => {
  it("hides the input's wrapper below md and restores it at md and up", () => {
    expect(
      GLOBAL_SEARCH,
      'the inline input\'s wrapper must carry "relative hidden md:block": below md the whole wrapper leaves the flex row, and `relative` stays because the search icon and the spinner are absolutely positioned against it'
    ).toContain("relative hidden md:block")
  })

  it("leaves the desktop input at its full width", () => {
    expect(
      GLOBAL_SEARCH,
      'the Input must still carry className="w-64 pl-9 pr-9". The desktop control is not the defect and does not change; the fix is that its wrapper is not in the row below md. An input that shrank in place would be a different, worse fix that this assertion refuses'
    ).toContain('className="w-64 pl-9 pr-9"')
  })

  it("puts a 40px icon trigger in its place below md", () => {
    expect(
      ICON_BUTTON_TAG.length,
      "global-search.tsx must render a Button. Below md the search surface is reached through a 40px icon trigger, and without one there is no way to search at all on a phone"
    ).toBeGreaterThan(0)

    expect(
      ICON_BUTTON_TAG,
      'the icon trigger must carry size="icon-lg", which is size-10 — the 40px minimum target the UI contract sets for a new icon-only control'
    ).toContain('size="icon-lg"')

    expect(
      ICON_BUTTON_TAG,
      "the icon trigger must carry md:hidden: it is the mirror of the wrapper's `hidden md:block`, so exactly one of the two controls is in the row at any width. Both visible would put the 256px input back beside a 40px button"
    ).toContain("md:hidden")
  })
})

/**
 * R-1, THE SHRINK-ALLOWANCE HALF. See assertion 1 in this file's header for the mechanism.
 */
describe("both header clusters are allowed to shrink", () => {
  it("carries min-w-0 on each of the two clusters", () => {
    expect(
      countOccurrences(NAV_HEADER, "min-w-0"),
      "nav-header.tsx must carry min-w-0 at least twice, once per cluster. A flex item defaults to `min-width: auto` and refuses to shrink below its content, which is the mechanism behind the measured document scrollWidth of 416-420 against a clientWidth of 305 on every main route. min-w-0 is what makes justify-between able to shrink; putting it on only the cluster that overflows today leaves the other one as the next overflow"
    ).toBeGreaterThanOrEqual(2)
  })

  it("leaves the nav's own collapse point alone", () => {
    expect(
      NAV_HEADER,
      "the main nav must still be `hidden md:flex`. It is where the md breakpoint in this contract comes from, and the whole point of reusing md for the search collapse is that the header has ONE collapse point rather than two"
    ).toContain("hidden md:flex")
  })
})

/**
 * S-7. See assertion 3 in this file's header for why a file-wide check is not enough here.
 */
describe("the mobile dialog announces itself in the user's language", () => {
  it("renders a CommandDialog at all", () => {
    expect(
      COMMAND_DIALOG_TAG.length,
      "global-search.tsx must render a CommandDialog: it is the surface the icon trigger opens, and without it the collapse removes search from small viewports rather than relocating it"
    ).toBeGreaterThan(0)
  })

  it("passes both the title and the description on that same call", () => {
    expect(
      COMMAND_DIALOG_TAG,
      'the CommandDialog must be passed title={t("search")}. Its default is the hardcoded English "Command Palette", and DialogHeader is a SIBLING of DialogContent, so that default renders into the page whenever the dialog is mounted — open or not'
    ).toContain('title={t("search")}')

    expect(
      COMMAND_DIALOG_TAG,
      'the CommandDialog must be passed description={tNav("searchDescription")}. Its default is the hardcoded English "Search for a command to run...", rendered by the same sr-only sibling header, so omitting it leaks English onto every authenticated page in the app'
    ).toContain('description={tNav("searchDescription")}')
  })

  it("turns cmdk's own filter off on that same call", () => {
    expect(
      COMMAND_DIALOG_TAG,
      "the CommandDialog must be passed shouldFilter={false}. cmdk defaults it to true and filters each item against that item's `value`, and every value this app renders is a UUID — so with the filter on, a user typing a name matches nothing and the dialog shows its empty state for every query while the request that produced the matches returned 200"
    ).toContain("shouldFilter={false}")

    expect(
      COMMAND_DIALOG_TAG,
      "the CommandDialog must be passed showCloseButton={false}. Escape and the overlay already close it, and an X inside a full-width search field at 320px takes the only spare horizontal room on the surface this phase exists to fit"
    ).toContain("showCloseButton={false}")
  })

  it("renders the shared results tree on both surfaces", () => {
    expect(
      countOccurrences(GLOBAL_SEARCH, "<SearchResults"),
      "SearchResults must be rendered at least twice — once inside the popover's CommandList and once inside the dialog's. One tree, two surfaces: a second copy of the groups is how the desktop and mobile results drift apart, which is exactly what 45-07's extraction exists to prevent"
    ).toBeGreaterThanOrEqual(2)
  })
})

/**
 * THE HOTKEY. See assertion 2 in this file's header for why no hook may appear here.
 */
describe("the / hotkey picks its target at event time", () => {
  it("reads the breakpoint from matchMedia", () => {
    expect(
      GLOBAL_SEARCH,
      "the handler must call window.matchMedia. The breakpoint is read at EVENT TIME, inside the hotkey body — never during render and never in an effect — so it produces no hydration mismatch and trips no React Compiler rule"
    ).toContain("matchMedia")

    expect(
      GLOBAL_SEARCH,
      "the media query must name 768px, which is Tailwind's md and the single collapse point this header has. The number is duplicated from the Tailwind config by necessity, which is why the source carries a note to keep the two in sync"
    ).toContain("768px")
  })

  it("keeps the repo's hotkey options object verbatim", () => {
    expect(
      GLOBAL_SEARCH,
      'the useHotkeys options must stay `{ scopes: ["global"], useKey: true }`. Five other registrations in nav-header.tsx use the same object; only the BODY of this handler changes'
    ).toContain('{ scopes: ["global"], useKey: true }')
  })

  it("stores no viewport in React", () => {
    for (const token of ["useMediaQuery", "window.innerWidth", "useEffect"]) {
      expect(
        GLOBAL_SEARCH.includes(token),
        `global-search.tsx must not contain "${token}". Each is a way of putting the viewport into React state: a media-query hook returns false on the server and the truth after an effect, which is either a hydration mismatch or a react-hooks/set-state-in-effect error — severity 2 in this repo, so a failed build`
      ).toBe(false)
    }
  })
})

/**
 * S-5. The last hardcoded label in a nav whose other six links have always called t().
 */
describe("every nav label comes from the catalog", () => {
  it("reads the workflows label through t()", () => {
    expect(
      NAV_HEADER,
      'the workflows link must render t("workflows"). Its markup is otherwise byte-identical to the six links beside it; only the label was a literal'
    ).toContain('t("workflows")')
  })

  it("renders no literal label in JSX", () => {
    expect(
      NAV_HEADER.includes(LABEL_BETWEEN_TAGS),
      `nav-header.tsx must not contain "${LABEL_BETWEEN_TAGS}". The assertion is on the JSX form rather than the bare word on purpose: the word is a product noun and the correct catalog value, so a sentence explaining this rule must never be able to flip the gate`
    ).toBe(false)
  })

  it("leaves no literal label alone on a JSX line either", () => {
    expect(
      LABEL_ON_ITS_OWN_LINE.test(NAV_HEADER),
      "nav-header.tsx must not carry the label alone on its own line: that is the exact shape the defect had, a JSX child on its own line between an icon and a closing tag"
    ).toBe(false)
  })

  it("has non-empty copy for all three keys this surface consumes", () => {
    const keys: [string, string | undefined][] = [
      ["nav.workflows", enUS.nav.workflows],
      ["nav.searchDescription", enUS.nav.searchDescription],
      ["common.search", enUS.common.search],
    ]

    for (const [key, value] of keys) {
      expect.soft(
        value,
        `${key} must resolve to a non-empty string in en-US.json. A key that is called but absent renders as the raw key path in the browser, and nothing else catches it: the compiler cannot, and the locale-parity gate compares the three locale files to EACH OTHER rather than to their call sites`
      ).toBeTruthy()
    }
  })
})

describe("neither file reaches past the design tokens", () => {
  it("expresses colour through the tokens only", () => {
    for (const [name, source] of COMPONENT_SOURCES) {
      for (const token of FORBIDDEN_COLOURS) {
        expect(
          source.includes(token),
          `${name} must express colour through the design tokens; "${token}" bypasses them and breaks dark mode, which this same phase has only just made reachable`
        ).toBe(false)
      }

      expect(
        HEX_LITERAL.test(source),
        `${name} must contain no raw hex colour: every colour on this surface is a CSS variable, so both themes are covered by one declaration`
      ).toBe(false)
    }
  })
})

// ANTI-VACUITY 3. Both vocabulary tables, iterated, so a new idiom cannot sail through unasserted.
describe("the gate's own vocabulary", () => {
  it("finds every RECOGNISED token in global-search.tsx", () => {
    for (const token of RECOGNISED_IN_GLOBAL_SEARCH) {
      expect.soft(
        GLOBAL_SEARCH,
        `global-search.tsx must contain "${token}". This table is the list of decisions with no pure-function home; a missing entry means one was edited out silently`
      ).toContain(token)
    }
  })

  it("finds no LEFT-ALONE token in global-search.tsx", () => {
    for (const token of LEFT_ALONE_IN_GLOBAL_SEARCH) {
      expect.soft(
        GLOBAL_SEARCH.includes(token),
        `global-search.tsx must not contain "${token}". Every entry in this table breaks something silently rather than loudly, which is why the table is iterated rather than written out one test per token`
      ).toBe(false)
    }
  })
})
