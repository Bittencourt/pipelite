/**
 * R-4 / R-3 — the cross-file responsive-class contract over the three components this phase adds.
 *
 * WHAT THIS TEST IS NOT, AND THIS MATTERS MORE THAN USUAL:
 *
 *   - IT MEASURES NOTHING. It never opens a browser, never sets a viewport and never reads a
 *     computed style. Every number in the comments below came from a measurement someone else took;
 *     nothing here reproduces one. Plan 40-15 owns all real 320px measurement for this phase.
 *   - It is a STATIC read of class STRINGS. A rule expressed in Tailwind tokens is the only thing it
 *     can see, so a layout broken by something other than a class token is invisible to it.
 *   - It does not duplicate the per-component gates. Plans 40-08, 40-09 and 40-10 already gate each
 *     component's own clamps and variants. This file asserts only what those three cannot see
 *     individually, because it is a property OF THE SET: one breakpoint across all three, no two
 *     views side by side anywhere, and no primitive edited to get there.
 *
 * EXTRACTION. Every className is read out of an opening tag extracted by `openingTagAt` — 40-08's
 * tag walker, promoted into `source-scan.ts` and reused here rather than reimplemented. BACKLOG.md
 * already records two brace matchers awaiting consolidation and this phase has deliberately added
 * none. The one completeness check below exists because a silent extraction miss is how a gate like
 * this goes vacuous: it asserts that the number of classNames pulled out of tags equals the number
 * of `className=` occurrences in the file, so a tag the walker failed to parse cannot hide a
 * violation.
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
  elementRegion,
  openingTagAt,
  readStrippedSource,
  tagIndexes,
} from "@/components/custom-fields/__tests__/source-scan"

const BAR = "src/components/views/saved-views-bar.tsx"
const SAVE_DIALOG = "src/components/views/save-view-dialog.tsx"
const MANAGE_DIALOG = "src/components/views/manage-views-dialog.tsx"

/** The three components this phase adds. Nothing else is in scope. */
const COMPONENTS = [BAR, SAVE_DIALOG, MANAGE_DIALOG] as const

/* --------------------------------------------------------------- extraction */

interface Tag {
  /** Offset of the `<`. */
  at: number
  /** The element name, e.g. `div` or `DropdownMenuTrigger`. */
  name: string
  /** The full opening tag text. */
  text: string
}

/**
 * Every opening tag in a source, delimited by `openingTagAt` so a `>` inside `className={a > b}`
 * or inside a string cannot end a tag early.
 *
 * TS generics (`useState<Set<string>>`) also start with `<` + a letter and are picked up here. They
 * carry no `className=`, so they contribute nothing; the completeness check below is what proves
 * this loose scan still sees every className in the file.
 */
function openingTags(source: string, file: string): Tag[] {
  const tags: Tag[] = []

  for (let i = 0; i < source.length; i += 1) {
    if (source[i] !== "<") continue
    if (!/[A-Za-z]/.test(source[i + 1] ?? "")) continue

    let text: string
    try {
      text = openingTagAt(source, i, "element", file)
    } catch {
      continue
    }

    tags.push({ at: i, name: text.slice(1).match(/^[A-Za-z0-9_.]+/)?.[0] ?? "", text })
    i += text.length - 1
  }

  return tags
}

/**
 * The class strings on one opening tag.
 *
 * Handles `className="…"` and `className={…}`, collecting every string literal inside the braces so
 * a `cn("a", flag && "b")` contributes both. The brace scan is bounded by the tag `openingTagAt`
 * already delimited — it reads a VALUE, it does not find structure, so it is not another structural
 * matcher.
 */
function classNamesOn(tag: string): string[] {
  const found: string[] = []
  const marker = "className="

  for (let at = tag.indexOf(marker); at !== -1; at = tag.indexOf(marker, at + marker.length)) {
    let i = at + marker.length

    if (tag[i] === '"' || tag[i] === "'") {
      const quote = tag[i]
      const end = tag.indexOf(quote, i + 1)
      if (end !== -1) found.push(tag.slice(i + 1, end))
      continue
    }

    if (tag[i] !== "{") continue

    let depth = 0
    const start = i
    while (i < tag.length) {
      if (tag[i] === "{") depth += 1
      else if (tag[i] === "}") {
        depth -= 1
        if (depth === 0) break
      }
      i += 1
    }

    const expression = tag.slice(start, i + 1)
    for (const literal of expression.match(/"[^"]*"|'[^']*'|`[^`$]*`/g) ?? []) {
      found.push(literal.slice(1, -1))
    }
  }

  return found
}

interface ClassUse {
  file: string
  element: string
  className: string
}

/** Every className on every element of the three components. */
const ALL_USES: ClassUse[] = COMPONENTS.flatMap((file) => {
  const source = readStrippedSource(file)
  return openingTags(source, file).flatMap((tag) =>
    classNamesOn(tag.text).map((className) => ({ file, element: tag.name, className }))
  )
})

const tokensOf = (className: string) => className.split(/\s+/).filter(Boolean)

const usesIn = (file: string) => ALL_USES.filter((u) => u.file === file)

const show = (uses: ClassUse[]) =>
  uses.map((u) => `    ${u.file}  <${u.element}>  "${u.className}"`).join("\n")

/* ---------------------------------------------------------- the extractor is honest */

describe("the extractor sees every className", () => {
  it.each(COMPONENTS)("%s", (file) => {
    const source = readStrippedSource(file)
    const declared = (source.match(/className=/g) ?? []).length

    expect(
      usesIn(file).length,
      `${file}: the file declares className= ${declared} time(s) but only ` +
        `${usesIn(file).length} were extracted from opening tags. A tag the walker could not ` +
        `parse would hide every violation on it, which is how a gate like this silently goes ` +
        `vacuous.`
    ).toBe(declared)
  })
})

/* -------------------------------------------------- 1. R-4 — no side-by-side views */

describe("R-4 — nothing places two views horizontally adjacent at any viewport", () => {
  it("declares no unprefixed multi-column grid", () => {
    // At 241px of usable width, two columns give 120px each. A multi-column grid is only ever
    // acceptable above a breakpoint, so `sm:grid-cols-2` passes and a bare `grid-cols-2` does not.
    const offenders = ALL_USES.filter((use) =>
      tokensOf(use.className).some((token) => {
        const match = token.match(/^grid-cols-(\d+)$/)
        return match !== null && Number(match[1]) >= 2
      })
    )

    expect(
      offenders,
      `${offenders.length} unprefixed multi-column grid(s):\n${show(offenders)}\n\n` +
        `Two columns at 320px leave roughly 120px each, which cannot hold a view name plus its ` +
        `badge. Prefix it with sm: or keep the layout single-column.`
    ).toEqual([])
  })
})

/* ------------------------------------------- 2. R-4 — flex rows that cannot overflow */

/**
 * A flex row is allowed to skip `flex-wrap` only when its items cannot force an overflow.
 *
 * Every entry is an EXACT className, matched whole, with the number of elements expected to carry
 * it. Each is a control-plus-its-label cluster — two small items with a fixed 8px gap — not two
 * view blocks, which is what R-4 is about. If one of these strings stops appearing the expected
 * count fails, so an exemption cannot quietly widen to cover something new.
 */
const WRAP_EXEMPTIONS: { className: string; count: number; reason: string }[] = [
  {
    className: "text-muted-foreground flex items-center gap-2 text-xs",
    count: 1,
    reason:
      "the export in-flight row: a 16px spinner and one short status string. Neither item can " +
      "exceed the dialog width and the row holds no view block.",
  },
  {
    className: "flex items-start gap-2",
    count: 4,
    reason:
      "save-view-dialog checkbox/radio clusters: a 16px control and its Label. `items-start` " +
      "keeps the control aligned to the first line while the Label itself wraps as text, which " +
      "is the wrapping that matters here — the row never grows past its container.",
  },
  {
    className: "flex items-center gap-2",
    count: 2,
    reason:
      "manage-views-dialog switch clusters: a Switch and its Label, same shape as above. The row " +
      "that holds these clusters IS `flex-wrap` (`mt-3 flex flex-wrap items-center gap-2`), so " +
      "the clusters wrap as units rather than splitting a control from its label.",
  },
]

describe("R-4 — every flex row either wraps, shrinks, or is a named exemption", () => {
  /** `flex` as a whole token: `flex-col`, `flex-wrap` and `flex-1` are different utilities. */
  const isFlexRow = (className: string) => {
    const tokens = tokensOf(className)
    return tokens.includes("flex") && !tokens.includes("flex-col")
  }

  const SAFE = ["flex-wrap", "shrink-0", "min-w-0"]

  it("has no unexempted flex row without flex-wrap, shrink-0 or min-w-0", () => {
    const exempt = new Set(WRAP_EXEMPTIONS.map((e) => e.className))

    const offenders = ALL_USES.filter(
      (use) =>
        isFlexRow(use.className) &&
        !SAFE.some((token) => tokensOf(use.className).includes(token)) &&
        !exempt.has(use.className)
    )

    expect(
      offenders,
      `${offenders.length} flex row(s) that can neither wrap nor shrink:\n${show(offenders)}\n\n` +
        `A non-wrapping flex row holding two view blocks overflows at 320px rather than ` +
        `reflowing. Add flex-wrap, or add an entry to WRAP_EXEMPTIONS in this file with a ` +
        `reason — never by loosening the rule.`
    ).toEqual([])
  })

  it.each(WRAP_EXEMPTIONS)("the exemption $className is still used exactly $count time(s)", (e) => {
    const hits = ALL_USES.filter((use) => use.className === e.className)

    expect(
      hits.length,
      `the wrap exemption "${e.className}" matched ${hits.length} element(s), expected ` +
        `${e.count}.\n  Exempt because: ${e.reason}\n\n` +
        `An exemption whose className changed must be re-examined against R-4, not re-counted.`
    ).toBe(e.count)
  })
})

/* ----------------------------------------------- 3. R-3 — min-w-0 on the three carriers */

/**
 * A flex item defaults to `min-width: auto`, which refuses to shrink below its content. That
 * default is the mechanism behind every horizontal overflow Phase 45 measured, so the three
 * elements that hold variable-length user text each need `min-w-0` explicitly.
 *
 * Asserted per EXTRACTED ELEMENT rather than per file: `min-w-0` appearing somewhere in the file
 * says nothing about whether it is on the element that needs it.
 */
describe("R-3 — min-w-0 is on the elements that carry user text", () => {
  it("the bar's outermost row", () => {
    const source = readStrippedSource(BAR)

    // `tagIndexes`, never `indexOf("<DropdownMenu")`: the first substring match in this file is
    // `<DropdownMenuRadioItem`, inside the `viewItem` helper declared ABOVE the row — which would
    // scope this assertion to the wrong element and then find no enclosing div at all.
    const [menuAt] = tagIndexes(source, "DropdownMenu")
    expect(menuAt, `${BAR}: no <DropdownMenu> element found`).toBeDefined()

    // The nearest enclosing <div>, confirmed by containment rather than assumed from proximity.
    const enclosing = tagIndexes(source, "div")
      .filter((at) => at < menuAt)
      .reverse()
      .find((at) => {
        const region = elementRegion(source.slice(at), "div", BAR)
        return tagIndexes(region, "DropdownMenu").length > 0
      })

    expect(enclosing, `${BAR}: no <div> encloses the <DropdownMenu>`).toBeDefined()

    const tag = openingTagAt(source, enclosing as number, "bar row", BAR)
    const classes = classNamesOn(tag).join(" ")

    expect(
      tokensOf(classes),
      `${BAR}: the bar's outermost row is <${tag.slice(0, 80)}…> with classes "${classes}". ` +
        `Without min-w-0 the row refuses to shrink below its content and the picker cannot ` +
        `truncate.`
    ).toContain("min-w-0")
  })

  it("the picker trigger", () => {
    const source = readStrippedSource(BAR)
    const [triggerAt] = tagIndexes(source, "DropdownMenuTrigger")
    expect(triggerAt, `${BAR}: no <DropdownMenuTrigger> element found`).toBeDefined()

    // Whole-tag-name matching again, so `<ButtonGroup` could never stand in for `<Button`.
    const buttonAt = tagIndexes(source, "Button").find((at) => at > triggerAt)
    expect(buttonAt, `${BAR}: no <Button> inside the DropdownMenuTrigger`).toBeDefined()

    const tag = openingTagAt(source, buttonAt as number, "picker trigger", BAR)
    const classes = classNamesOn(tag).join(" ")

    expect(
      tokensOf(classes),
      `${BAR}: the picker trigger is <${tag.slice(0, 80)}…> with classes "${classes}". ` +
        `min-w-0 is what lets the trigger shrink at all; max-w alone does not.`
    ).toContain("min-w-0")
  })

  it("the manage-dialog row's name cluster", () => {
    const source = readStrippedSource(MANAGE_DIALOG)
    const tags = openingTags(source, MANAGE_DIALOG)

    // The per-view row, located by its own class marker rather than by a line number.
    const row = tags.find((t) => t.name === "div" && t.text.includes("last:border-b-0"))
    expect(row, `${MANAGE_DIALOG}: no per-view row <div> carrying last:border-b-0`).toBeDefined()

    const region = elementRegion(source.slice((row as Tag).at), "div", MANAGE_DIALOG)
    const inner = openingTags(region, MANAGE_DIALOG).filter((t) => t.name === "div" && t.at > 0)

    expect(inner.length, `${MANAGE_DIALOG}: the per-view row has no child <div>`).toBeGreaterThan(0)

    const classes = classNamesOn(inner[0].text).join(" ")

    expect(
      tokensOf(classes),
      `${MANAGE_DIALOG}: the row's first child (the name cluster) is ` +
        `<${inner[0].text.slice(0, 80)}…> with classes "${classes}". A long view name in a cluster ` +
        `without min-w-0 pushes the row's controls off the right edge instead of truncating.`
    ).toContain("min-w-0")
  })
})

/* ------------------------------------------------- 4. one breakpoint, and only one */

describe("the responsive contract — one declared breakpoint", () => {
  const OTHER_BREAKPOINTS = ["md:", "lg:", "xl:", "2xl:"]

  it.each(OTHER_BREAKPOINTS)("declares no %s variant", (prefix) => {
    const offenders = ALL_USES.filter((use) =>
      tokensOf(use.className).some((token) => token.startsWith(prefix))
    )

    expect(
      offenders,
      `${offenders.length} className(s) declare a ${prefix} variant:\n${show(offenders)}\n\n` +
        `This phase declares ONE breakpoint, sm:, and adds no media query. A stray ${prefix} is a ` +
        `second layout at a width nobody in this phase measured.`
    ).toEqual([])
  })
})

/* ------------------------------------------------------- 5. the absence sweep */

describe("the cross-file absence sweep", () => {
  /** Component names that must not appear as a JSX element or a named import in the three files. */
  const FORBIDDEN_ELEMENTS: { name: string; prefix: boolean; reason: string }[] = [
    {
      name: "Popover",
      prefix: true,
      reason:
        "O-2 — PopoverContent never consumes --radix-popover-content-available-height. The " +
        "existing /activities filter popover already renders 388px into a 347px slot with 41px " +
        "clipped off the top. DropdownMenuContent is height-safe by construction.",
    },
    {
      name: "DropdownMenuSubContent",
      prefix: false,
      reason: "a submenu opens sideways, which has nowhere to go at 320px",
    },
    {
      name: "ProgressBar",
      prefix: false,
      reason: "this phase shows in-flight state as a spinner plus a label, never as a bar",
    },
  ]

  it.each(FORBIDDEN_ELEMENTS)("uses no $name", (forbidden) => {
    const hits: string[] = []

    for (const file of COMPONENTS) {
      const source = readStrippedSource(file)

      for (const tag of openingTags(source, file)) {
        const matched = forbidden.prefix
          ? tag.name.startsWith(forbidden.name)
          : tag.name === forbidden.name
        if (matched) hits.push(`${file}: <${tag.name}>`)
      }

      for (const match of source.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from/g)) {
        for (const part of match[1].split(",")) {
          const name = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]?.trim()
          if (!name) continue
          const matched = forbidden.prefix
            ? name.startsWith(forbidden.name)
            : name === forbidden.name
          if (matched) hits.push(`${file}: import { ${name} }`)
        }
      }
    }

    expect(hits, `${forbidden.name} appears ${hits.length} time(s):\n    ${hits.join("\n    ")}\n\n${forbidden.reason}`).toEqual([])
  })

  /**
   * Class tokens that must not appear. Matched as WHOLE TOKENS, never as substrings: plan 40-09's
   * first attempt broke because `Check` is a substring of `onCheckedChange`, and `leading-none`
   * would otherwise have to be distinguished from the `leading-tight` these files do use.
   */
  const FORBIDDEN_TOKENS: { token: string; reason: string }[] = [
    {
      token: "sticky",
      reason:
        "B-4 / R-40-2f — bulk-action-bar.tsx already owns one fixed bar on all four host pages, " +
        "and D-45-02 is a live UAT item about a fixed bar occluding content. A second one is not " +
        "available to this phase.",
    },
    { token: "fixed", reason: "same as sticky — the bar sits in the normal flow and adds no spacer" },
    {
      token: "leading-none",
      reason:
        "leading-none clips descenders on the accented characters the Spanish labels carry; these " +
        "files use leading-tight",
    },
    { token: "bg-green-500", reason: "outside the phase's accent budget" },
    { token: "bg-amber-500", reason: "outside the phase's accent budget" },
    { token: "text-red-600", reason: "outside the phase's accent budget — use text-destructive" },
    { token: "text-green-600", reason: "outside the phase's accent budget" },
    { token: "text-amber-500", reason: "outside the phase's accent budget" },
  ]

  it.each(FORBIDDEN_TOKENS)("declares no $token", (forbidden) => {
    const offenders = ALL_USES.filter((use) => tokensOf(use.className).includes(forbidden.token))

    expect(
      offenders,
      `${forbidden.token} appears on ${offenders.length} element(s):\n${show(offenders)}\n\n` +
        forbidden.reason
    ).toEqual([])
  })

  it("uses no font size outside text-xs / text-sm / text-lg", () => {
    const ALLOWED = ["text-xs", "text-sm", "text-lg"]
    // Only the size scale. `text-muted-foreground` and `text-destructive` are colours, not sizes,
    // and must not be swept up by a looser `text-` match.
    const SIZE = /^text-(xs|sm|base|lg|xl|[2-9]xl)$/

    const offenders = ALL_USES.filter((use) =>
      tokensOf(use.className).some((token) => SIZE.test(token) && !ALLOWED.includes(token))
    )

    expect(
      offenders,
      `${offenders.length} element(s) use a font size outside the three this phase declares:\n` +
        `${show(offenders)}\n\nThe type scale here is text-xs / text-sm / text-lg and nothing else.`
    ).toEqual([])
  })
})

/* --------------------------------------------- 6. no primitive was edited to get here */

describe("src/components/ui/ is untouched by this phase", () => {
  /**
   * Every clamp O-1 requires is a per-call-site className, never a primitive edit: `dialog.tsx` is
   * shared by roughly sixteen dialogs, so a clamp added there would change all of them at once.
   *
   * Two independent checks. The import check runs everywhere; the git check is the direct one and
   * is skipped rather than faked where the history is unavailable.
   */
  it("imports only primitives and exports that already exist", () => {
    const missing: string[] = []

    for (const file of COMPONENTS) {
      const source = readStrippedSource(file)

      for (const match of source.matchAll(
        /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["'](@\/components\/ui\/[^"']+)["']/g
      )) {
        const modulePath = `src/components/ui/${match[2].split("/").pop()}.tsx`

        if (!existsSync(modulePath)) {
          missing.push(`${file}: ${match[2]} does not exist`)
          continue
        }

        const primitive = readFileSync(modulePath, "utf8")
        for (const part of match[1].split(",")) {
          const name = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]?.trim()
          if (!name) continue
          if (!new RegExp(`\\b${name}\\b`).test(primitive)) {
            missing.push(`${file}: ${match[2]} does not provide ${name}`)
          }
        }
      }
    }

    expect(
      missing,
      `these imports would require a primitive to be edited or created:\n    ${missing.join("\n    ")}`
    ).toEqual([])
  })

  it("has changed no primitive under src/components/ui/ since the phase base", () => {
    // `bb5be2e` is this phase's first commit ("docs(40): create phase plan"), so its parent is the
    // tree the phase started from.
    const PHASE_BASE = "bb5be2e~1"

    let changed: string[]
    try {
      execFileSync("git", ["rev-parse", "--verify", `${PHASE_BASE}^{commit}`], { stdio: "ignore" })
      changed = execFileSync(
        "git",
        ["diff", "--name-only", `${PHASE_BASE}..HEAD`, "--", "src/components/ui/"],
        { encoding: "utf8" }
      )
        .split("\n")
        .filter(Boolean)
    } catch {
      // Shallow clone or no history — the import check above still runs unconditionally.
      return
    }

    // Colocated TESTS under this directory are not primitives. Plan 40-08 appended a row to
    // `checkbox-indeterminate.test.ts` recording an eleventh Checkbox CONSUMER, which is a test
    // noting a fact about this phase — not an edit to a shared component.
    const isTest = (path: string) => /(^|\/)__tests__\//.test(path) || /\.test\.tsx?$/.test(path)
    const primitives = changed.filter((path) => !isTest(path))

    expect(
      primitives,
      `primitive(s) under src/components/ui/ changed since ${PHASE_BASE}:\n    ` +
        `${primitives.join("\n    ")}\n\n` +
        `dialog.tsx alone is shared by roughly sixteen dialogs, so a clamp added there changes ` +
        `all of them at once. Every clamp this phase needs is a per-call-site className.`
    ).toEqual([])
  })
})
