/**
 * The wiring gate for dark mode: the provider in the root layout and the three-value toggle in the
 * user menu.
 *
 * EVERY ASSERTION HERE IS COMMENT-BLIND BY CONSTRUCTION. Both sources are read through the shared
 * `readStrippedSource` helper, which removes line and block comments in a string-aware pass before a
 * single assertion runs. That is not tidiness. A large part of what follows is a NEGATIVE assertion,
 * and a negative source assertion is trivially satisfied — or trivially broken — by prose: a doc
 * comment that merely names the token it forbids invalidates its own gate. Phases 37-38 lost fifteen
 * gate runs to exactly that collision.
 *
 * THE CORRECT RESPONSE TO A COLLISION IS TO REWORD THE COMMENT, NEVER TO WEAKEN THE GATE.
 *
 * This repo renders NO client components in tests — no jsdom, no happy-dom, no testing library, and
 * adding one is a dependency decision belonging to a phase willing to own it. Dark mode has no pure
 * function to unit-test: it is a provider mounted at one place in a tree, four props, and a radio
 * group. So it is pinned here at the source level, and the behavioural proof that the choice
 * survives a reload lives in the Playwright spec authored later in this phase.
 *
 * THREE ANTI-VACUITY REQUIREMENTS, all met below, because a gate without them is a string that
 * happens to be absent:
 *
 *   1. Prove the files were found and read. A helper that silently returned "" would satisfy every
 *      negative assertion in this file perfectly. Hence the non-empty assertions FIRST.
 *   2. Prove these are the RIGHT files, by asserting known POSITIVE markers before any negative.
 *   3. A gate for the gate: vocabulary tables, one pinning what must be PRESENT and one pinning what
 *      must be LEFT ALONE, each iterated, so a newly introduced idiom cannot sail through unasserted.
 *
 * The most valuable assertions here are the two that look removable — the absence of a `mounted`
 * hydration gate, and the `?? "system"` fallback. Both carry their reasoning in the failure message,
 * because a future reader who does not know why they exist will delete them.
 */
import { describe, expect, it } from "vitest"

import { readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"
import enUS from "@/messages/en-US.json"

const LAYOUT = readStrippedSource("src/app/layout.tsx")
const USER_MENU = readStrippedSource("src/components/user-menu.tsx")

const SOURCES: [string, string][] = [
  ["src/app/layout.tsx", LAYOUT],
  ["src/components/user-menu.tsx", USER_MENU],
]

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

/** The complete set of copy keys the toggle renders, all delivered by 45-01. */
const THEME_KEYS = ["label", "light", "dark", "system"]

/**
 * VOCABULARY TABLE 1 — RECOGNISED in the root layout. The provider configuration is locked: these
 * four props are the whole contract, and each one is silently survivable if dropped, which is
 * exactly why they are pinned rather than trusted.
 */
const LAYOUT_RECOGNISED = [
  "next-themes",
  "ThemeProvider",
  'attribute="class"',
  'defaultTheme="system"',
  "enableSystem",
  "disableTransitionOnChange",
  "suppressHydrationWarning",
]

/**
 * VOCABULARY TABLE 2 — LEFT ALONE in the root layout.
 *
 * `<head` — the shadcn dark-mode doc shows one; it predates Next's automatic head management,
 * changes nothing here, and risks disturbing the existing next/font variable classes.
 *
 * The local wrapper module — next-themes ships its own client directive as the first token of its
 * dist entry, so the provider imports DIRECTLY into this async server layout. A wrapper file would
 * be a second place for the four locked props to drift.
 */
const LAYOUT_LEFT_ALONE = ["<head", "@/components/theme-provider"]

/**
 * VOCABULARY TABLE 3 — RECOGNISED in the user menu. Three radio values, the SSR-safe fallback, the
 * setter wired straight to the group, the copy namespace, and the C-1 token repair.
 */
const MENU_RECOGNISED = [
  "useTheme",
  "DropdownMenuRadioGroup",
  "DropdownMenuRadioItem",
  'value="light"',
  'value="dark"',
  'value="system"',
  'theme ?? "system"',
  "onValueChange={setTheme}",
  'useTranslations("theme")',
  "text-destructive",
]

/**
 * VOCABULARY TABLE 4 — LEFT ALONE in the user menu. The first four entries are the hydration gate
 * this file must never grow; the rest are the palette utilities that bypass the design tokens and
 * therefore break in precisely the theme this plan makes reachable.
 */
const MENU_LEFT_ALONE = [
  "setMounted",
  "useEffect",
  "useState",
  "useMediaQuery",
  ...FORBIDDEN_COLOURS,
]

/** Every `<DropdownMenuRadioItem value=` opening tag. Counted, because a fourth is not a state. */
const RADIO_ITEM_TAGS = USER_MENU.match(/DropdownMenuRadioItem value=/g) ?? []

// ANTI-VACUITY 1 AND 2. These run before every negative assertion in this file, deliberately.
describe("the gate reads the right sources", () => {
  it("read both sources", () => {
    for (const [name, source] of SOURCES) {
      expect(
        source.length,
        `${name} must have been read: a helper returning an empty string would satisfy every negative assertion in this file perfectly`
      ).toBeGreaterThan(0)
    }
  })

  it("found the root layout, by its existing locale provider", () => {
    expect(
      LAYOUT,
      "src/app/layout.tsx must still mount NextIntlClientProvider. That marker is how this gate knows it is reading the root layout rather than some other file that happens to render html; if the provider chain moves, this gate must go red and be rewritten, not keep passing over a file that configures nothing"
    ).toContain("NextIntlClientProvider")
  })

  it("found the user menu, by its dropdown trigger", () => {
    expect(
      USER_MENU,
      "src/components/user-menu.tsx must still render DropdownMenuTrigger. If the avatar menu stops being a dropdown, the theme toggle has no home and this gate must be reconsidered rather than keep asserting over a file that no longer opens a menu"
    ).toContain("DropdownMenuTrigger")
  })
})

describe("the theme provider is mounted with the locked configuration", () => {
  it("carries every locked token of the provider contract", () => {
    for (const token of LAYOUT_RECOGNISED) {
      expect(
        LAYOUT,
        `src/app/layout.tsx must contain "${token}". These are the four locked props plus the import and the hydration suppression: every one of them is silently survivable if dropped — the app still builds, still renders, and simply stops honouring the theme`
      ).toContain(token)
    }
  })

  it("suppresses the hydration warning on the html element", () => {
    expect(
      LAYOUT,
      'suppressHydrationWarning must be present on <html>. next-themes injects a synchronous inline script that writes document.documentElement BEFORE hydration, and it writes TWO attributes the server never rendered: the class (from attribute="class") and style="color-scheme: …" (from enableColorScheme, which defaults to true and is not disabled here). Without the suppression React logs a mismatch on every page load and in development may discard the server HTML outright — a self-inflicted degraded render'
    ).toContain("suppressHydrationWarning")
  })

  it("mounts the provider above the hotkeys provider, so its script is the first node in body", () => {
    const themeAt = LAYOUT.indexOf("<ThemeProvider")
    const hotkeysAt = LAYOUT.indexOf("<HotkeysProvider")
    const intlAt = LAYOUT.indexOf("<NextIntlClientProvider")

    expect(
      themeAt,
      "an opening <ThemeProvider tag must appear in src/app/layout.tsx: the four props above could otherwise all be satisfied by a commented-out block or by a differently-named element"
    ).toBeGreaterThan(-1)

    expect(
      themeAt,
      "ThemeProvider must nest INSIDE NextIntlClientProvider. Neither depends on the other, so the order is chosen to keep the existing tree diff to a single wrapper rather than restructuring the provider chain"
    ).toBeGreaterThan(intlAt)

    expect(
      themeAt,
      "ThemeProvider must sit ABOVE HotkeysProvider. It renders [<ThemeScript/>, children], and neither NextIntlClientProvider nor HotkeysProvider emits DOM — so at this position that inline <script> is the first DOM node inside <body>, the earliest point at which the theme class can land. Nested any lower, NavHeader paints in the wrong theme first"
    ).toBeLessThan(hotkeysAt)
  })

  it("invents no wrapper module and adds no head element", () => {
    for (const token of LAYOUT_LEFT_ALONE) {
      expect(
        LAYOUT.includes(token),
        `src/app/layout.tsx must not contain "${token}". Each entry in this table would break something quietly rather than loudly: a hand-rolled <head> risks the next/font variable classes, and a local provider wrapper is a second place for the four locked props to drift out of sync`
      ).toBe(false)
    }
  })
})

describe("the toggle is three flat radio items with no hydration gate", () => {
  it("carries every token of the toggle contract", () => {
    for (const token of MENU_RECOGNISED) {
      expect(
        USER_MENU,
        `src/components/user-menu.tsx must contain "${token}". This table is the toggle's whole contract — the three values, the SSR-safe fallback, the setter wired to the group, the copy namespace and the C-1 token — and none of it has a pure-function home to test instead`
      ).toContain(token)
    }
  })

  it("offers exactly three theme values", () => {
    expect(
      RADIO_ITEM_TAGS,
      'the menu must render exactly three DropdownMenuRadioItem tags. light / dark / system is the COMPLETE set of states next-themes has: a fourth value would render a radio row the library can never select, and dropping one strands the user — with defaultTheme="system", removing the system row means no way back to following the operating system'
    ).toHaveLength(3)
  })

  it("falls back to system while the theme is unknown", () => {
    expect(
      USER_MENU,
      'the radio group value must be `theme ?? "system"`, not bare `theme`. This is required, not defensive: next-themes initialises its state with useState(() => …) whose initializer returns undefined when typeof window === "undefined", so during SSR `theme` is genuinely undefined and an undefined value on a Radix radio group silently selects nothing'
    ).toContain('theme ?? "system"')
  })

  it("adds no mounted hydration gate", () => {
    for (const token of MENU_LEFT_ALONE) {
      expect(
        USER_MENU.includes(token),
        `src/components/user-menu.tsx must not contain "${token}". The standard next-themes recipe wraps theme UI in a flag set from an effect; it is forbidden here for two independent reasons. (a) react-hooks/set-state-in-effect resolves to severity 2 in this repo, so the usual one-line recipe fails npm run lint and therefore CI — three Phase 38 plans hit that rule on code their own spec had specified. (b) It is unnecessary: Radix MenuPortal renders Presence present={forceMount || context.open} and shadcn's DropdownMenuContent passes no forceMount to the Portal, so a CLOSED menu renders nothing at all — the radio items first mount on a user click, long after the library has read localStorage. There is no mismatch to guard. The remaining entries are palette utilities that bypass the design tokens, which is how a control breaks in exactly the theme this plan makes reachable`
      ).toBe(false)
    }

    expect(
      HEX_LITERAL.test(USER_MENU),
      "src/components/user-menu.tsx must contain no raw hex colour: every colour on this surface is a CSS variable, so both themes are covered by one declaration"
    ).toBe(false)
  })

  it("colours sign-out from the destructive token rather than the palette", () => {
    expect(
      USER_MENU,
      "the sign-out item must use text-destructive. C-1: red-600 (#dc2626) on the dark popover surface (oklch(0.205 0 0)) measures roughly 3.4:1, below the 4.5:1 AA threshold for text — and this plan is what makes that surface reachable for the first time. The --destructive token carries a lightened dark-mode value precisely so one declaration works in both themes"
    ).toContain("text-destructive")
  })
})

describe("every string the toggle renders exists in the catalog", () => {
  it("resolves all four theme copy keys in en-US", () => {
    const themeCopy = enUS.theme as Record<string, string | undefined>

    expect(
      THEME_KEYS.length,
      "the key list must be non-empty, or this test would pass by iterating nothing"
    ).toBeGreaterThan(0)

    for (const key of THEME_KEYS) {
      const value = themeCopy[key]

      expect(
        typeof value,
        `theme.${key} must exist in src/messages/en-US.json as a string. All four keys were added to the three locale files by 45-01; a key that vanishes renders as a raw key path in the menu, and nothing else catches it — the compiler cannot, and the locale-parity gate compares the three locale files to EACH OTHER rather than to this list`
      ).toBe("string")

      expect(
        (value ?? "").length,
        `theme.${key} must not be empty: an empty string is a present key that renders an invisible menu row`
      ).toBeGreaterThan(0)
    }
  })
})
