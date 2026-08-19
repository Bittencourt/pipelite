/**
 * THE PAIR CARD'S LAYOUT AND DISMISSAL CONTRACT, READ OUT OF THE SOURCE.
 *
 * Two rules on this surface are worth a gate, and both are rules a reasonable-looking rewrite breaks.
 *
 * R-3 / L-3 — THE TWO RECORDS ARE STACKED AT EVERY VIEWPORT. A table row or a `grid-cols-2` reads
 * fine at 1280px and gives each record about 110px at 320px, where `overflow-x-auto` then hides half
 * the comparison behind a scrollbar the user has no reason to suspect. `e2e/viewport-320.spec.ts`
 * measures the route, but only in the states a fixture-free spec can reach; this gate covers the card
 * itself, which only exists once a scan has found something.
 *
 * L-8 — A FAILED DISMISSAL LEAVES THE PAIR VISIBLE. The list is server-rendered, so the only way to
 * make a pair disappear is a fresh render. An optimistic local removal would hide a pair whose write
 * failed, and the user would be told nothing except a toast they may not read — the pair would come
 * back on the next navigation, having never been dismissed. The gate therefore asserts that the
 * dismiss handler sets no local state at all and reaches `router.refresh()` instead.
 *
 * WHY A SOURCE SCAN. There is no jsdom in this repository (K-6). `readStrippedSource` makes the read
 * honest: this header names `grid-cols-2`, `truncate` and `<table`, and without comment-stripping it
 * would satisfy several of the assertions below on its own.
 *
 * WHAT THIS FILE IS NOT. It is not an authorization test. `dismissPair` and `undismissPair` re-check
 * the admin role themselves and scope their UPDATE to the expected current status, and
 * `duplicates-actions-wiring.test.ts` gates that. A button is not a control.
 */
import { describe, expect, it } from "vitest"

import { readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"

const CARD_PATH = "src/app/duplicates/pair-card.tsx"

const source = readStrippedSource(CARD_PATH)

/** String- and template-aware delimiter matching. Same helper as the sibling wiring gates. */
function skipBalanced(text: string, openAt: number, open: string, close: string): number {
  let depth = 0
  let i = openAt
  let quote: string | null = null

  while (i < text.length) {
    const ch = text[i]

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
    } else if (ch === open) {
      depth += 1
    } else if (ch === close) {
      depth -= 1
      if (depth === 0) return i + 1
    }

    i += 1
  }

  throw new Error(`unbalanced ${open}${close} starting at ${openAt}`)
}

function bodyAt(text: string, openAt: number): string {
  return text.slice(openAt + 1, skipBalanced(text, openAt, "{", "}") - 1)
}

/** The body of `function NAME(...) { … }`, parameter list skipped by paren matching. */
function functionBody(name: string): string {
  const at = source.indexOf(`function ${name}(`)
  if (at === -1) throw new Error(`${CARD_PATH}: no function named ${name}`)

  const afterParams = skipBalanced(source, source.indexOf("(", at), "(", ")")
  return bodyAt(source, source.indexOf("{", afterParams))
}

/** The object literal assigned to `const NAME`. */
function objectLiteral(name: string): string {
  const at = source.indexOf(`const ${name}`)
  if (at === -1) throw new Error(`${CARD_PATH}: no constant named ${name}`)

  return bodyAt(source, source.indexOf("{", at))
}

/** Every `className="…"` value in the file. */
function classNames(text: string): string[] {
  return [...text.matchAll(/className="([^"]+)"/g)].map((match) => match[1])
}

/**
 * The timer built-ins match the `setSomething(` shape and are not state setters; `startTransition`
 * does not match it at all. Anything else shaped like a setter, inside a handler that must not hold
 * local list state, is the L-8 defect.
 */
const NOT_STATE_SETTERS = new Set(["setInterval", "setTimeout", "setImmediate"])

function stateSetterCalls(text: string): string[] {
  return [...text.matchAll(/\bset[A-Z][A-Za-z0-9_]*\(/g)]
    .map((match) => match[0].slice(0, -1))
    .filter((name) => !NOT_STATE_SETTERS.has(name))
}

function count(text: string, needle: string): number {
  return text.split(needle).length - 1
}

describe("pair card — the stacked layout (L-3, R-3)", () => {
  it("is not a table", () => {
    expect(count(source, "<table")).toBe(0)
    expect(count(source, "<Table")).toBe(0)
  })

  it("puts nothing in two columns below the sm breakpoint", () => {
    const unprefixed = [...source.matchAll(/(\S{0,4})grid-cols-2/g)].filter(
      (match) => !/(sm:|md:)$/.test(match[1] ?? "")
    )

    expect(
      unprefixed.map((match) => match[0]),
      `${CARD_PATH}: an unprefixed grid-cols-2 puts the two records side by side at 320px, where ` +
        "each would get about 110px (R-3).",
    ).toEqual([])
  })

  /**
   * SCOPING DECISION, RECORDED. 39-UI-SPEC's typography rule PERMITS truncation on the pair card's
   * record names — it forbids it only inside the merge picker, on the grounds that the full value is
   * one click away from the list. This gate is therefore STRICTER THAN THE RULE, deliberately and
   * only inside the record block: the names on this surface are near-identical by construction (that
   * is why the pair exists), so the characters a truncation removes are exactly the ones that
   * distinguish the two records. "Acme Comercio de Aliment…" twice is a card that cannot be read at
   * all. They wrap instead, which costs a line at 320px and nothing at 1280px.
   *
   * Scoped to `PairRecord` rather than asserted file-wide, so a future truncation somewhere it does
   * no harm is not blocked by a rule about names.
   */
  it("does not truncate a record name", () => {
    const block = functionBody("PairRecord")

    expect(count(block, "truncate")).toBe(0)
    expect(count(block, "line-clamp")).toBe(0)
  })

  /**
   * Asserted as two tokens in ONE class list rather than as the adjacent pair `text-primary
   * hover:underline`, because class order in this repo is not the author's to choose — the formatter
   * sorts utilities, so an adjacency assertion would fail on correctly written code the moment
   * anything else joined the same element. Both tokens on the same element is the actual contract
   * (§ Color item 6: a link from a listed row to the record it names).
   */
  it("links each record name to the record it names, in the sanctioned accent", () => {
    const accentLinks = classNames(functionBody("PairRecord")).filter(
      (value) => value.includes("text-primary") && value.includes("hover:underline")
    )

    expect(accentLinks.length, `${CARD_PATH}: no record name carries the accent link idiom`).toBe(1)
  })

  it("carries min-w-0 on the wrapping action row (R-4)", () => {
    const rows = classNames(source).filter(
      (value) =>
        value.includes("flex") && value.includes("flex-wrap") && value.includes("gap-2")
    )

    expect(rows.length, `${CARD_PATH}: no wrapping flex row found at all`).toBeGreaterThan(0)
    expect(
      rows.filter((value) => !value.includes("min-w-0")),
      `${CARD_PATH}: a wrapping flex row without min-w-0. A flex item's default min-width is auto, ` +
        "which is the mechanism behind every overflow Phase 45 measured (R-4).",
    ).toEqual([])
  })
})

describe("pair card — dismissal (L-6, L-8)", () => {
  it("removes nothing from a local list when the dismissal fails", () => {
    const handler = functionBody("handleDismiss")
    const setters = stateSetterCalls(handler)

    expect(
      setters,
      `${CARD_PATH}: handleDismiss calls ${setters.join(", ")}. The list is server-rendered, so ` +
        "local state that hides the pair would hide one whose write FAILED (L-8).",
    ).toEqual([])
  })

  it("asks the server for a fresh list instead", () => {
    expect(functionBody("handleDismiss")).toContain("router.refresh")
    expect(functionBody("handleUndismiss")).toContain("router.refresh")
  })

  it("has non-empty handlers, so the assertions above cannot pass on emptied functions", () => {
    expect(functionBody("handleDismiss").trim().length).toBeGreaterThan(120)
    expect(functionBody("handleUndismiss").trim().length).toBeGreaterThan(80)
    expect(source).toContain("dismissPair(")
    expect(source).toContain("undismissPair(")
  })

  it("reports both outcomes to the user", () => {
    expect(source).toContain("toast.success")
    expect(source).toContain("toast.error")
  })

  it("asks for no confirmation — dismissal is reversible (L-6)", () => {
    expect(
      count(source, "AlertDialog"),
      `${CARD_PATH}: a confirm dialog on a reversible action trains the user to dismiss dialogs unread.`,
    ).toBe(0)
  })
})

describe("pair card — copy and colour (C-3, K-1, § Color)", () => {
  it("distinguishes the confidence tiers by words", () => {
    expect(source).toContain("review.confidenceCertain")
    expect(source).toContain("review.confidenceLikely")
  })

  it("maps every match reason to a catalog key", () => {
    const map = objectLiteral("REASON_MESSAGE_KEY")

    for (const reason of ["email", "nameIdentity", "similarName", "similarNamePhone"]) {
      expect(map, `${CARD_PATH}: REASON_MESSAGE_KEY has no entry for ${reason}`).toContain(reason)
    }
  })

  it("offers both actions and the dismissed view's replacement from the catalog", () => {
    for (const key of ["review.merge", "review.dismiss", "review.undismiss"]) {
      expect(source).toContain(key)
    }
  })

  it("fills no button with the accent — every Button names its variant", () => {
    const unstyled = [...source.matchAll(/<Button\b/g)]
      .map((match) => source.slice(match.index, source.indexOf(">", match.index)))
      .filter((tag) => !tag.includes("variant="))

    expect(
      unstyled,
      `${CARD_PATH}: a Button with no variant is primary-filled. This surface spends its single ` +
        "filled button on the scan CTA (§ Color); the card's actions are outline and ghost.",
    ).toEqual([])
  })

  it("uses semantic tokens only (K-2)", () => {
    for (const forbidden of ["text-green-", "text-orange-", "text-red-"]) {
      expect(count(source, forbidden)).toBe(0)
    }
  })
})
