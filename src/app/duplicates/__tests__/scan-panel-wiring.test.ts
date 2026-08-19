/**
 * THE SCAN PANEL'S POLL CONTRACT AND ITS FOUR RENDERINGS, READ OUT OF THE SOURCE.
 *
 * Three defect classes are one careless copy away here, and this file is what stands between the
 * scan panel and each of them. All three are real, all three are in this repository today:
 *
 *   1. `react-hooks/set-state-in-effect` is severity 2 (ERROR) in this repo, and three Phase 38
 *      plans hit it independently. The safe shape is `setState` inside the ASYNC CALLBACK invoked by
 *      `setInterval`, never in the effect body. Lint catches the literal form; this gate catches it
 *      too, and asserts the CONTRACT (no state setter directly in the effect body, only inside a
 *      nested function) rather than merely asserting that an effect exists.
 *   2. `src/app/admin/import/pipedrive-api/steps/progress-step.tsx:48-53` is a DEAD EFFECT: its body
 *      is a comment and it clears no interval, so that importer polls its finished job forever. The
 *      scan panel must genuinely stop, so this gate requires a `clearInterval` reachable from the
 *      POLL CALLBACK (the terminal-status stop) in addition to the one in the effect cleanup. A poll
 *      that never stops is T-39-33.
 *   3. That same file's presentation is the phase's named anti-pattern: `text-green-600`,
 *      `text-orange-500`, a `grid grid-cols-2 md:grid-cols-4` of `text-2xl font-bold` stat tiles and
 *      eleven hardcoded English literals. The loop is copied in shape; none of the presentation is.
 *
 * WHY A SOURCE SCAN AND NOT A DOM TEST. There is no jsdom in this repository (K-6), so every
 * component-level contract in Phase 39 is written to be checkable by reading comment-stripped source.
 * `readStrippedSource` is what makes the reading honest: the prose above names `setInterval`,
 * `clearInterval`, `text-green-600` and `text-2xl`, and without stripping this header alone would
 * satisfy several assertions below and invert the gate's meaning.
 *
 * THE MESSAGE KEYS ARE SPELLED AS THE COMPONENT SPELLS THEM. `useTranslations("dedup")` binds the
 * namespace once, so the source says `t("scan.backgroundHint")` and never the full dot-path. The
 * namespace binding is asserted separately, so a key suffix cannot be satisfied from the wrong
 * namespace.
 *
 * WHAT THIS FILE IS NOT. It does not render, does not poll and does not authorize. The cancel
 * control's absence for a non-starter is PRESENTATION — `cancelDuplicateScan` performs the
 * `scan.userId !== session.user.id` comparison and that action is the control (T-39-08). Real
 * behaviour in a real browser is plan 39-17's job.
 */
import { describe, expect, it } from "vitest"

import { readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"

const PANEL_PATH = "src/app/duplicates/scan-panel.tsx"

const source = readStrippedSource(PANEL_PATH)

/**
 * Walk from an opening delimiter to just past its match, string- and template-literal aware so a
 * brace or paren inside a string cannot close the span early. Same helper shape as
 * `duplicates-actions-wiring.test.ts`, which needs it for the same reason.
 */
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

/** The braced body of `text` starting at the brace at `openAt`, braces excluded. */
function bodyAt(text: string, openAt: number): string {
  return text.slice(openAt + 1, skipBalanced(text, openAt, "{", "}") - 1)
}

/**
 * The body of `function NAME(...) { ... }`.
 *
 * The parameter list is skipped by PAREN matching, so the inline object type every one of these
 * components destructures its props with — which is full of braces — cannot be mistaken for the
 * body. None of these functions declares a return-type annotation; one containing a brace would
 * break this finder, and the assertion below on each extracted body being non-trivial is what would
 * report it.
 */
function functionBody(name: string): string {
  const at = source.indexOf(`function ${name}(`)
  if (at === -1) throw new Error(`${PANEL_PATH}: no function named ${name}`)

  const parenAt = source.indexOf("(", at)
  const afterParams = skipBalanced(source, parenAt, "(", ")")
  const braceAt = source.indexOf("{", afterParams)
  if (braceAt === -1) throw new Error(`${PANEL_PATH}: no body for ${name}`)

  return bodyAt(source, braceAt)
}

/** The body of the arrow function passed to `useEffect(() => { … })`. */
function effectBody(): string {
  const marker = "useEffect(() => {"
  const at = source.indexOf(marker)
  if (at === -1) throw new Error(`${PANEL_PATH}: no useEffect(() => { … }) found`)

  return bodyAt(source, at + marker.length - 1)
}

/** The body of `const NAME = async () => { … }` / `const NAME = () => { … }` inside `scope`. */
function arrowBody(scope: string, name: string): string {
  const at = scope.search(new RegExp(`const\\s+${name}\\s*=\\s*(async\\s*)?\\(\\s*\\)\\s*=>\\s*\\{`))
  if (at === -1) throw new Error(`${PANEL_PATH}: no arrow function named ${name} in scope`)

  return bodyAt(scope, scope.indexOf("{", at))
}

/** The body of the `return () => { … }` cleanup inside `scope`. */
function cleanupBody(scope: string): string {
  const marker = "return () => {"
  const at = scope.indexOf(marker)
  if (at === -1) throw new Error(`${PANEL_PATH}: the effect has no cleanup function`)

  return bodyAt(scope, at + marker.length - 1)
}

/**
 * Index ranges of every nested `… => {` function body inside `text`.
 *
 * This is the instrument behind the K-7 assertion: a state setter is legal inside one of these
 * ranges (an async callback) and illegal outside all of them (the effect body itself).
 */
function nestedArrowSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = []
  const pattern = /=>\s*\{/g

  for (;;) {
    const match = pattern.exec(text)
    if (match === null) break

    const braceAt = match.index + match[0].length - 1
    const end = skipBalanced(text, braceAt, "{", "}")
    spans.push([braceAt, end])
    pattern.lastIndex = braceAt + 1
  }

  return spans
}

/**
 * The platform timer functions, which match the `setSomething(` shape and are not state setters.
 *
 * Excluded by name rather than by a narrower pattern, because `useState`'s setter has no distinctive
 * spelling beyond the convention — anything narrower would let a real `setScan` through.
 */
const NOT_STATE_SETTERS = new Set(["setInterval", "setTimeout", "setImmediate"])

/** Every `setSomething(` call in `text` that could be a `useState` setter, with its index. */
function stateSetterCalls(text: string): Array<{ name: string; index: number }> {
  return [...text.matchAll(/\bset[A-Z][A-Za-z0-9_]*\(/g)]
    .map((match) => ({ name: match[0].slice(0, -1), index: match.index }))
    .filter((call) => !NOT_STATE_SETTERS.has(call.name))
}

function count(text: string, needle: string): number {
  return text.split(needle).length - 1
}

describe("scan panel — the poll", () => {
  it("polls with exactly one interval", () => {
    expect(count(source, "setInterval(")).toBe(1)
  })

  it("sets no state directly in the effect body — every setter is inside a nested callback (K-7)", () => {
    const body = effectBody()
    const spans = nestedArrowSpans(body)

    const bare = stateSetterCalls(body).filter(
      (call) => !spans.some(([from, to]) => call.index > from && call.index < to)
    )

    expect(
      bare.map((call) => call.name),
      `${PANEL_PATH}: ${bare
        .map((call) => call.name)
        .join(", ")} is called directly in the effect body. ` +
        "react-hooks/set-state-in-effect is an ERROR in this repo; move it into the async poll callback."
    ).toEqual([])
  })

  it("has a non-trivial effect body, so the assertion above cannot pass on an emptied effect", () => {
    expect(effectBody().trim().length).toBeGreaterThan(200)
  })

  it("clears the interval from inside the poll callback", () => {
    const poll = arrowBody(effectBody(), "poll")

    expect(
      poll.includes("clearInterval("),
      `${PANEL_PATH}: the poll callback never calls clearInterval, so nothing but the effect's ` +
        "cleanup can ever stop the poll — progress-step.tsx:48-53's dead effect (T-39-33).",
    ).toBe(true)
  })

  /**
   * The assertion above is NOT ENOUGH ON ITS OWN, and that is not a guess: deleting the
   * terminal-status stop while writing this gate left it green, because the poll's other early exits
   * (a refused request, a run of missing rows) also clear the interval. The stop this rule is about
   * is the one keyed on a TERMINAL STATUS — the exact stop the analog is missing — so it is asserted
   * inside its own branch rather than anywhere in the callback.
   */
  it("stops the poll in the terminal-status branch specifically (T-39-33)", () => {
    const poll = arrowBody(effectBody(), "poll")
    const at = poll.indexOf("if (isTerminal(")

    expect(at, `${PANEL_PATH}: the poll callback has no terminal-status branch`).toBeGreaterThan(-1)

    const branch = bodyAt(poll, poll.indexOf("{", at))

    expect(
      branch.includes("clearInterval("),
      `${PANEL_PATH}: the terminal-status branch of the poll does not clear the interval, so a ` +
        "completed, cancelled or errored scan would keep being polled for as long as the tab is open.",
    ).toBe(true)
  })

  it("clears the interval in the effect cleanup as well", () => {
    expect(cleanupBody(effectBody())).toContain("clearInterval(")
  })

  it("guards its state writes with a mounted flag", () => {
    expect(effectBody()).toContain("mounted")
  })

  it("launches the scan fire-and-forget — the action is never awaited", () => {
    expect(count(source, "startDuplicateScan(")).toBeGreaterThan(0)
    expect(count(source, "await startDuplicateScan")).toBe(0)
    expect(source).toContain("crypto.randomUUID()")
  })
})

describe("scan panel — the four states (P-4)", () => {
  it("branches on all four scan status literals", () => {
    for (const status of ['"running"', '"completed"', '"cancelled"', '"error"']) {
      expect(source, `${PANEL_PATH}: no branch keyed by ${status}`).toContain(status)
    }
  })

  it("renders the background hint in the idle region (P-5)", () => {
    expect(functionBody("ScanIdlePanel")).toContain("scan.backgroundHint")
  })

  it("renders the background hint in the running region as well (P-5)", () => {
    expect(functionBody("ScanRunningPanel")).toContain("scan.backgroundHint")
  })

  it("names the dedup namespace, so a key suffix cannot come from the wrong catalog", () => {
    expect(source).toContain('useTranslations("dedup")')
  })

  it("uses the shared progress bar rather than a second one (P-2)", () => {
    expect(source).toContain('from "@/components/ui/progress-bar"')
  })
})

describe("scan panel — the non-starter branch (P-6)", () => {
  it("names who started the scan", () => {
    expect(functionBody("ScanStarterNote")).toContain("scan.startedBy")
  })

  it("offers no cancel control to a viewer who did not start the scan", () => {
    const branch = functionBody("ScanStarterNote")

    expect(
      branch.includes("scan.cancel"),
      `${PANEL_PATH}: ScanStarterNote — the branch shown to a viewer who did NOT start the scan — ` +
        "renders the cancel copy. P-6 requires the control to be absent there.",
    ).toBe(false)
    expect(branch).not.toContain("ScanCancelButton")
  })

  it("keeps the cancel control behind the canCancel guard", () => {
    const running = functionBody("ScanRunningPanel")

    expect(count(running, "ScanCancelButton")).toBe(1)
    expect(
      running.indexOf("canCancel"),
      `${PANEL_PATH}: ScanCancelButton is rendered before any canCancel guard appears.`,
    ).toBeLessThan(running.indexOf("ScanCancelButton"))
    expect(count(running, "scan.cancel")).toBe(0)
  })

  it("has a cancel control at all, so the negative above is not vacuous", () => {
    expect(functionBody("ScanCancelButton")).toContain("scan.cancel")
  })
})

describe("scan panel — presentation (K-2, R-3, typography)", () => {
  it("uses semantic tokens only — none of the analog's literal colours", () => {
    for (const forbidden of ["text-green-", "text-orange-", "text-red-"]) {
      expect(count(source, forbidden), `${PANEL_PATH}: ${forbidden} is not a semantic token`).toBe(0)
    }
  })

  it("renders no stat tiles (P-8)", () => {
    expect(count(source, "text-2xl")).toBe(0)
  })

  it("puts nothing in two columns below the sm breakpoint (R-3)", () => {
    const unprefixed = [...source.matchAll(/(\S{0,4})grid-cols-2/g)].filter(
      (match) => !/(sm:|md:)$/.test(match[1] ?? "")
    )

    expect(unprefixed.map((match) => match[0])).toEqual([])
  })

  it("still uses the accent where the accent belongs, so the negatives above cannot pass on an emptied file", () => {
    expect(source).toContain("text-primary")
    expect(count(source, 'className="')).toBeGreaterThan(5)
  })

  it("takes every user-visible string from the catalog", () => {
    expect([...source.matchAll(/t\("scan\./g)].length).toBeGreaterThan(5)
  })
})
