/**
 * The wiring gate for the admin shell: its responsive collapse (R-2), the eleven English literals
 * that never reached the catalog (S-4), and the server authorization gate that must survive both.
 *
 * EVERY ASSERTION HERE IS COMMENT-BLIND BY CONSTRUCTION. All three sources are read through the
 * shared `readStrippedSource` helper, which strips line and block comments in a string-aware pass
 * before any assertion runs. That is not tidiness: most of the assertions below are NEGATIVE (a
 * token must appear ZERO times), and a negative source assertion is trivially broken by prose — a
 * doc comment that merely names the token it forbids invalidates its own gate. Phases 37-38 lost
 * fifteen gate runs to exactly that collision. THE CORRECT RESPONSE TO A COLLISION IS TO REWORD THE
 * COMMENT, NEVER TO WEAKEN THE GATE.
 *
 * This repo renders NO client components in tests — no jsdom, no happy-dom, no testing library, and
 * adding one is a dependency decision this phase must not make. So the structural facts below, none
 * of which has a pure-function home, are pinned at the source level; the rendered result is measured
 * by `e2e/viewport-320.spec.ts` in a real 320px browser once the image is rebuilt.
 *
 * THE TWO ASSERTIONS WORTH THE FILE, and why each exists:
 *
 *   1. `min-w-0` ON THE ADMIN CONTENT COLUMN. A flex item defaults to `min-width: auto`, which means
 *      it refuses to shrink below the intrinsic width of its own content no matter what the
 *      container can offer. That single default is the whole mechanism behind the measured
 *      `document.scrollWidth` of 491 (en-US), 518 (pt-BR) and 537 (es-ES) against a `clientWidth` of
 *      305 on `/admin/audit`: the rail takes 256 of the 305 available, `<main>` starts at x≈206, and
 *      nothing in the row is allowed to give. Hiding the rail below `md` is only half the fix —
 *      REMOVING `min-w-0` from the column that replaces it reintroduces the exact same defect, with
 *      the audit table's intrinsic width taking over the role the rail used to play. It is a
 *      correctness requirement on this layout, not a tidiness class.
 *
 *   2. THE AUTHORIZATION ASSERTIONS ON `src/app/admin/layout.tsx`. Making the sidebar a client-side
 *      drawer changes PRESENTATION ONLY. Every `/admin/*` route is gated TWICE — once by
 *      `middleware.ts`'s `authorized()` callback and once by this layout's `auth()` plus its
 *      `session.user.role !== "admin"` check — and this phase must not weaken either. Hiding a menu
 *      item has never been an access control, and a drawer that renders in the browser is even less
 *      of one. So both `redirect(` calls and the role comparison are pinned here, in the same file
 *      that authorises the layout being reshaped, where a reshaping diff that swallowed one of them
 *      would go red immediately.
 *
 * THREE ANTI-VACUITY REQUIREMENTS, all met below, because a gate without them is a string that
 * happens to be absent:
 *
 *   1. Prove the files were found and read. A helper silently returning "" would satisfy every
 *      negative assertion in this file perfectly. Hence the non-empty assertions FIRST — and the
 *      mobile bar's read is guarded by `existsSync` so a MISSING file reports as a named failure
 *      rather than throwing at module scope and taking the whole file down with it.
 *   2. Prove it is the RIGHT file, via known POSITIVE markers before any negative one.
 *   3. A gate for the gate: iterated vocabulary tables, one pinning what must be PRESENT and one
 *      pinning what must be LEFT ALONE, so a newly introduced idiom cannot sail through unasserted.
 */
import { existsSync, readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { stripComments } from "@/components/custom-fields/__tests__/source-scan"
import enUS from "@/messages/en-US.json"

const SIDEBAR_PATH = "src/components/admin-sidebar.tsx"
const MOBILE_BAR_PATH = "src/components/admin-mobile-bar.tsx"
const LAYOUT_PATH = "src/app/admin/layout.tsx"

/**
 * Read a repo-relative source with comments stripped, returning "" when the file does not exist.
 *
 * `readStrippedSource` throws on a missing path, and a throw at module scope aborts the entire test
 * file before a single assertion reports. `admin-mobile-bar.tsx` does not exist until task 3, so its
 * absence has to arrive as a NAMED failure inside a test rather than as a stack trace.
 */
function readOptionalStrippedSource(path: string): string {
  if (!existsSync(path)) return ""
  return stripComments(readFileSync(path, "utf8"))
}

const SIDEBAR = readOptionalStrippedSource(SIDEBAR_PATH)
const MOBILE_BAR = readOptionalStrippedSource(MOBILE_BAR_PATH)
const LAYOUT = readOptionalStrippedSource(LAYOUT_PATH)

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

/** The first non-comment token of a client module. */
const CLIENT_DIRECTIVE = /^\s*(['"])use client\1/

/**
 * The eleven English strings the admin shell has always rendered in every locale, each checked in
 * the THREE JSX/data forms it could plausibly take: as a quoted data value, as a child between two
 * tags, and alone on its own line as a JSX child.
 *
 * Three forms rather than one because the defect wears two shapes in the current file already:
 * `<h2 …>Admin Panel</h2>` is the between-tags form, while `Back to App` sits alone on its own line
 * inside a `<Button>`. A gate that only knew the quoted form would have called the file clean while
 * two literals still rendered.
 */
const ENGLISH_LITERALS_IN_SIDEBAR = [
  "Admin Panel",
  "Dashboard",
  "User Management",
  "Pipelines",
  "Custom Fields",
  "Webhooks",
  "Audit Log",
  "Trash",
  "Export Data",
  "Pipedrive Import",
  "Back to App",
] as const

function literalForms(literal: string): { form: string; present: boolean }[] {
  return [
    { form: `the quoted data value "${literal}"`, present: SIDEBAR.includes(`"${literal}"`) },
    { form: `the JSX child >${literal}<`, present: SIDEBAR.includes(`>${literal}<`) },
    {
      form: `${literal} alone on its own JSX line`,
      present: new RegExp(`^[ \\t]*${literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[ \\t]*$`, "m").test(
        SIDEBAR
      ),
    },
  ]
}

/**
 * VOCABULARY TABLE 1 — RECOGNISED in `admin-sidebar.tsx`. The catalog hook and the collapse class,
 * the two facts that make the rail translated and responsive.
 */
const RECOGNISED_IN_SIDEBAR = ['useTranslations("admin.nav")', "hidden md:flex"]

/**
 * VOCABULARY TABLE 2 — RECOGNISED in `admin-mobile-bar.tsx`. Every entry is a decision with no
 * pure-function home: the drawer's side and its width, the sanctioned Radix warning suppression, the
 * visible heading, the catalog namespace, the trigger's accessible name, the collapse class, the bar
 * height and the 40px trigger size.
 */
const RECOGNISED_IN_MOBILE_BAR = [
  "SheetContent",
  'side="left"',
  "w-64",
  "aria-describedby={undefined}",
  "SheetTitle",
  "admin.nav",
  "openMenu",
  "md:hidden",
  "h-12",
  'size="icon-lg"',
]

/**
 * VOCABULARY TABLE 3 — LEFT ALONE in both component files.
 *
 * The first three are the three ways a viewport gets into React state. A media-query hook returns
 * false on the server and the truth only after an effect, which is either a hydration mismatch or a
 * `react-hooks/set-state-in-effect` error — severity 2 in this repo, so a failed build. The collapse
 * is CSS and only CSS: `md:hidden` on the bar, `hidden md:flex` on the rail.
 */
const NO_VIEWPORT_STATE = ["useMediaQuery", "window.innerWidth", "useEffect"]

const SOURCES: [string, string][] = [
  ["admin-sidebar.tsx", SIDEBAR],
  ["admin-mobile-bar.tsx", MOBILE_BAR],
  ["app/admin/layout.tsx", LAYOUT],
]

const COMPONENT_SOURCES: [string, string][] = [
  ["admin-sidebar.tsx", SIDEBAR],
  ["admin-mobile-bar.tsx", MOBILE_BAR],
]

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

// ANTI-VACUITY 1 AND 2. These run before every negative assertion in this file, deliberately.
describe("the gate reads the right sources", () => {
  it("read all three sources", () => {
    for (const [name, source] of SOURCES) {
      expect.soft(
        source.length,
        `${name} must exist and have been read: a helper returning an empty string would satisfy every negative assertion in this file perfectly, so an unread source is a silently green gate rather than a red one`
      ).toBeGreaterThan(0)
    }
  })

  it("found the rail, the mobile bar and the authorization gate", () => {
    expect(
      SIDEBAR,
      "admin-sidebar.tsx must still declare its item array (sidebarItems). The array is what makes the nav data-driven and what the drawer consumes; a file without it is not the file these assertions describe"
    ).toContain("sidebarItems")

    expect(
      MOBILE_BAR,
      "admin-mobile-bar.tsx must render SheetContent. It is the drawer itself — without one the collapse removes admin navigation from small viewports rather than relocating it"
    ).toContain("SheetContent")

    expect(
      LAYOUT,
      "app/admin/layout.tsx must still call redirect. It is the server authorization gate; a layout that cannot redirect is not authorising anything"
    ).toContain("redirect")
  })
})

/**
 * S-4. Eleven strings, one namespace. See this file's header for why three forms are checked.
 */
describe("the admin shell speaks the user's language", () => {
  it("reads its labels through the admin.nav catalog", () => {
    expect(
      SIDEBAR,
      'admin-sidebar.tsx must call useTranslations("admin.nav"). Every one of its eleven visible strings is English in pt-BR and es-ES today, on the one surface where a user is most likely to be an operator rather than a salesperson'
    ).toContain('useTranslations("admin.nav")')
  })

  it("renders none of the eleven English literals in any JSX or data form", () => {
    for (const literal of ENGLISH_LITERALS_IN_SIDEBAR) {
      for (const { form, present } of literalForms(literal)) {
        expect.soft(
          present,
          `admin-sidebar.tsx must not contain ${form}. All eleven move into admin.nav.*, so the array holds KEYS and the renderer resolves them — a surviving literal renders English to a Portuguese or Spanish operator while every sibling entry is translated, which reads as a bug rather than as a gap`
        ).toBe(false)
      }
    }
  })

  it("carries no stale justification for the literals it no longer ships", () => {
    const RAW_SIDEBAR = existsSync(SIDEBAR_PATH) ? readFileSync(SIDEBAR_PATH, "utf8") : ""

    expect(
      RAW_SIDEBAR.includes("half-migrating"),
      'admin-sidebar.tsx must not still argue that "half-migrating a single entry would read as a bug". Migrating all eleven SATISFIES that argument rather than violating it, so the sentence is now a justification for a rule the file no longer follows. This is the ONE deliberately RAW read in this gate: the target only ever lived in a comment, so asserting it against comment-stripped source would be vacuously true forever'
    ).toBe(false)
  })

  it("has non-empty copy for all twelve keys this shell consumes", () => {
    const keys = [
      "title",
      "dashboard",
      "users",
      "pipelines",
      "customFields",
      "webhooks",
      "auditLog",
      "trash",
      "exportData",
      "pipedriveImport",
      "backToApp",
      "openMenu",
    ] as const

    const nav = enUS.admin.nav as Record<string, string | undefined>

    for (const key of keys) {
      expect.soft(
        nav[key],
        `admin.nav.${key} must resolve to a non-empty string in en-US.json. A key that is called but absent renders as the raw key path in the browser, and nothing else catches it: the compiler cannot, and the locale-parity gate compares the three locale files to EACH OTHER rather than to their call sites`
      ).toBeTruthy()
    }
  })
})

/**
 * R-2, THE COLLAPSE. One breakpoint for the whole app: `md`, 768px, the same point the global nav
 * has always used. Two collapse points would put the rail and the header out of step at some width.
 */
describe("the admin shell collapses at md and only at md", () => {
  it("takes the rail out of the flow below md", () => {
    expect(
      SIDEBAR,
      'the rail must be "hidden md:flex". At 320px it takes 256 of the 305 available client width, which is the measured cause of /admin/audit\'s overflow; any fix that keeps a 256px rail on screen keeps losing, and it loses harder as the translations get longer'
    ).toContain("hidden md:flex")
  })

  it("puts the mobile bar in its place below md", () => {
    expect(
      MOBILE_BAR,
      "the mobile bar must be md:hidden: it is the exact mirror of the rail's `hidden md:flex`, so exactly one of the two navigation surfaces is on screen at any width. Both visible would put a 256px rail back beside a 48px bar"
    ).toContain("md:hidden")

    expect(
      MOBILE_BAR,
      "the mobile bar must be h-12 (48px). It is deliberately shorter than the 56px global header above it, so the two stacked bars cost 104px rather than 112px of a 640px-tall phone viewport"
    ).toContain("h-12")
  })

  it("stores no viewport in React on either surface", () => {
    for (const [name, source] of COMPONENT_SOURCES) {
      for (const token of NO_VIEWPORT_STATE) {
        expect.soft(
          source.includes(token),
          `${name} must not contain "${token}". Each is a way of putting the viewport into React state: a media-query hook returns false on the server and the truth after an effect, which is either a hydration mismatch or a react-hooks/set-state-in-effect error — severity 2 in this repo, so a failed build. The collapse is CSS and only CSS`
        ).toBe(false)
      }
    }
  })
})

/**
 * R-2, THE DRAWER. A Radix Dialog in a portal, 256px wide, opening from the left.
 */
describe("the drawer is one sidebar design, not a second one", () => {
  it("is a client module, because Sheet is a Radix Dialog", () => {
    expect(
      CLIENT_DIRECTIVE.test(MOBILE_BAR),
      "admin-mobile-bar.tsx must open with the 'use client' directive. Sheet is a Radix Dialog: it holds open state, portals into the body and traps focus, none of which a server component can do — and a server module handing children to a Radix asChild slot renders nothing at all, silently, which is the CFUI-01 failure phase 44 spent a plan repairing"
    ).toBe(true)
  })

  it("opens from the left at the rail's own width", () => {
    expect(
      MOBILE_BAR,
      'the SheetContent must carry side="left". The rail lives on the left at every width above md; a drawer sliding in from the right would be a different component that happens to hold the same links'
    ).toContain('side="left"')

    expect(
      MOBILE_BAR,
      'the SheetContent must carry w-64 — 256px, byte-identical to the desktop rail. It overrides the shadcn block default of w-3/4 through tailwind-merge (same w- group), and that default is why this is asserted rather than left alone: w-3/4 renders 240px at a 320px viewport and 575px at 767px, which is two different drawers at two viewports instead of one sidebar design'
    ).toContain("w-64")
  })

  it("suppresses the Radix description warning without inventing copy", () => {
    expect(
      MOBILE_BAR,
      "the SheetContent must carry aria-describedby={undefined}. Radix's Dialog logs a missing-description warning otherwise; this is the sanctioned suppression and it costs no new string in three locales for a menu that describes itself"
    ).toContain("aria-describedby={undefined}")
  })

  it("shows the same heading the rail shows, visibly", () => {
    expect(
      MOBILE_BAR,
      "the drawer must render a SheetTitle. Radix requires an accessible title on every Dialog, and this one is rendered VISIBLY rather than sr-only — it is the same 'Admin Panel' heading the rail shows, so the drawer is recognisably the rail and not a new surface"
    ).toContain("SheetTitle")

    expect(
      MOBILE_BAR.includes("leading-none"),
      'the SheetTitle must not carry leading-none. pt-BR renders "Painel de Administração" — 22 characters into 256px minus 32px of padding — so the heading may wrap, and a zero leading makes two wrapped lines collide'
    ).toBe(false)
  })

  it("reaches the drawer through a 40px trigger with a translated accessible name", () => {
    expect(
      MOBILE_BAR,
      'the trigger must carry size="icon-lg", which resolves to size-10 — the 40px minimum target the UI contract sets for a new icon-only control. It is the only way into admin navigation below md, so it is not a control to make small'
    ).toContain('size="icon-lg"')

    expect(
      MOBILE_BAR,
      'the trigger\'s accessible name must come from admin.nav.openMenu. An icon-only button with no name is a button announced as "button" by every screen reader, and hardcoding the name in English would create a new instance of exactly the defect this plan removes'
    ).toContain("openMenu")

    expect(
      MOBILE_BAR,
      "the mobile bar must read its copy from the admin.nav namespace — the same one the rail reads, so the drawer's heading and the rail's heading cannot drift into two different translations of one string"
    ).toContain("admin.nav")
  })
})

/**
 * THE SHARED LIST. Two copies of an eleven-item array is how the next locale leak gets in: one gets
 * a new entry, the other does not, and nothing fails until a user reports a missing menu item.
 */
describe("the eleven items are declared exactly once", () => {
  it("declares the item list in the sidebar and nowhere else", () => {
    const declarationsInSidebar = countOccurrences(SIDEBAR, "pipedriveImport")
    const declarationsInMobileBar = countOccurrences(MOBILE_BAR, "pipedriveImport")

    expect(
      declarationsInSidebar,
      'the pipedriveImport key must appear in admin-sidebar.tsx: that file owns the one item array. If the array moved elsewhere this gate must go red and be reconsidered, not keep passing over a file that no longer declares it'
    ).toBeGreaterThanOrEqual(1)

    expect(
      declarationsInMobileBar,
      "the pipedriveImport key must appear ZERO times in admin-mobile-bar.tsx. A count of zero is the only formulation that distinguishes a SHARED array from a COPIED one, and a copy is how the rail and the drawer drift apart one added menu entry at a time"
    ).toBe(0)
  })

  it("declares each item href exactly once across the two component files", () => {
    const hrefs = [
      "/admin/users",
      "/admin/pipelines",
      "/admin/fields",
      "/admin/webhooks",
      "/admin/audit",
      "/admin/trash",
      "/admin/export",
      "/admin/import/pipedrive-api",
    ]

    for (const href of hrefs) {
      const total = countOccurrences(SIDEBAR, href) + countOccurrences(MOBILE_BAR, href)
      expect.soft(
        total,
        `the href ${href} must be written exactly once across admin-sidebar.tsx and admin-mobile-bar.tsx. A second copy is a second place for a route rename to be missed, and a drawer pointing at a dead route looks like a broken app rather than a stale constant`
      ).toBe(1)
    }
  })

  it("exports the shared array and the shared renderer", () => {
    expect(
      /export\s+(const|function)\s+(adminNavItems|sidebarItems|AdminNavItems)/.test(SIDEBAR),
      "admin-sidebar.tsx must EXPORT the item array and the item renderer. Both the rail and the drawer render the same eleven entries with the same active-state logic and the same icon sizing; the export is what makes that one implementation instead of two"
    ).toBe(true)

    expect(
      SIDEBAR,
      "the shared renderer must accept an onNavigate callback. The rail passes nothing; the drawer passes its own close function, because a drawer still sitting open over the page it just navigated to reads as a failed tap rather than as a successful one"
    ).toContain("onNavigate")
  })

  it("preserves the exact-match rule for the dashboard entry", () => {
    expect(
      SIDEBAR,
      'the active-item test must stay `item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href)`. Every other href is a prefix of nothing, but "/admin" is a prefix of all ten siblings — a startsWith test for it would light the Dashboard entry on every admin page in the app'
    ).toContain('pathname === "/admin"')

    expect(
      SIDEBAR,
      "the active-item test must still use pathname.startsWith for the other ten entries, so /admin/fields/deal keeps highlighting Custom Fields rather than nothing"
    ).toContain("pathname.startsWith(item.href)")
  })
})

/**
 * R-2, THE LAYOUT, AND THE AUTHORIZATION GATE IT MUST NOT DISTURB.
 * See assertions 1 and 2 in this file's header for both mechanisms.
 */
describe("the admin layout lets its content column shrink", () => {
  it("carries min-w-0 on the content column", () => {
    expect(
      LAYOUT,
      "app/admin/layout.tsx must carry min-w-0 on the column beside the rail. A flex item defaults to `min-width: auto` and refuses to shrink below its own content, which is the mechanism behind the measured document scrollWidth of 491 (en-US), 518 (pt-BR) and 537 (es-ES) against a clientWidth of 305 on /admin/audit. Hiding the rail is only half the fix: removing min-w-0 reintroduces the exact same defect with the audit table playing the role the rail used to play"
    ).toContain("min-w-0")
  })

  it("keeps the rail behind the same md breakpoint", () => {
    expect(
      LAYOUT,
      'the rail\'s wrapper must be "hidden md:flex". It is the single collapse point the whole responsive contract pins to — the same one the global nav uses — so the header and the admin shell can never be out of step at some intermediate width'
    ).toContain("hidden md:flex")
  })

  it("leaves the main content region exactly as it was", () => {
    expect(
      LAYOUT,
      'the <main> must still carry "flex-1 p-6 bg-muted/30". The page padding and the muted backdrop are not the defect and do not change; the fix is that main now sits inside a column that is allowed to shrink'
    ).toContain("flex-1 p-6 bg-muted/30")
  })

  it("keeps the server authorization gate authoritative", () => {
    expect(
      LAYOUT,
      'app/admin/layout.tsx must still test `session.user.role !== "admin"`. Making the sidebar a client-side drawer changes PRESENTATION ONLY: /admin/* is gated twice, by middleware.ts\'s authorized() callback and by this layout, and this phase must not weaken either. Hiding a menu item is never an access control, and a drawer that renders in the browser is even less of one'
    ).toContain('session.user.role !== "admin"')

    expect(
      countOccurrences(LAYOUT, "redirect("),
      "app/admin/layout.tsx must still make BOTH redirect calls — the unauthenticated one to /login?callbackUrl=/admin and the non-admin one to /?error=unauthorized. They are two distinct outcomes, and a reshaping diff that collapsed them into one would silently turn a signed-out visitor into an unauthorized-error page or the reverse"
    ).toBe(2)

    expect(
      LAYOUT,
      "app/admin/layout.tsx must still await auth(). It is the session read the role check depends on; without it the role comparison reads undefined and the gate becomes a no-op that still looks correct in a diff"
    ).toContain("auth()")
  })
})

describe("neither component reaches past the design tokens", () => {
  it("expresses colour through the tokens only", () => {
    for (const [name, source] of COMPONENT_SOURCES) {
      for (const token of FORBIDDEN_COLOURS) {
        expect.soft(
          source.includes(token),
          `${name} must express colour through the design tokens; "${token}" bypasses them and breaks dark mode, which this same phase has only just made reachable`
        ).toBe(false)
      }

      expect.soft(
        HEX_LITERAL.test(source),
        `${name} must contain no raw hex colour: every colour on this surface is a CSS variable, so both themes are covered by one declaration`
      ).toBe(false)
    }
  })
})

// ANTI-VACUITY 3. Both vocabulary tables, iterated, so a new idiom cannot sail through unasserted.
describe("the gate's own vocabulary", () => {
  it("finds every RECOGNISED token in admin-sidebar.tsx", () => {
    for (const token of RECOGNISED_IN_SIDEBAR) {
      expect.soft(
        SIDEBAR,
        `admin-sidebar.tsx must contain "${token}". This table is the list of decisions with no pure-function home; a missing entry means one was edited out silently`
      ).toContain(token)
    }
  })

  it("finds every RECOGNISED token in admin-mobile-bar.tsx", () => {
    for (const token of RECOGNISED_IN_MOBILE_BAR) {
      expect.soft(
        MOBILE_BAR,
        `admin-mobile-bar.tsx must contain "${token}". This table is the list of decisions with no pure-function home; a missing entry means one was edited out silently`
      ).toContain(token)
    }
  })
})
