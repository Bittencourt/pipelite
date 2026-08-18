/**
 * The wiring gate for the FOUR callers of `BulkFailureReport`.
 *
 * `bulk-failure-report-wiring.test.ts` proves the component branches on a number. This file proves
 * the number is real: that each of the four surfaces mounting the report computes it against ITS OWN
 * rendered set, and that none of them "fixes" the old false sentence the forbidden way.
 *
 * WHY A SEPARATE FILE, AND WHY MULTI-SOURCE. The defect this phase closes lives in the seam, not in
 * either half. A perfectly-branching report handed a constant is exactly as wrong as the
 * unconditional sentence it replaced, and it would look correct in a diff of the component alone.
 * Four callers implementing one prop is also the classic copy-paste site, so each caller's own set
 * name is baked into its assertion: pasting the organizations expression into the kanban fails here
 * rather than silently reporting the wrong count for the rest of the product's life.
 *
 * WHY SOURCE-LEVEL. This repo renders NO client components in tests — no jsdom, no happy-dom, no
 * testing library — and adding one is a dependency decision belonging to a phase willing to own it
 * (Phases 38 and 44 both recorded the same constraint). All four callers are `'use client'` list
 * surfaces holding TanStack table state, so the wiring is pinned at the source level and the
 * rendered result is verified by this phase's browser UAT.
 *
 * EVERY ASSERTION IS COMMENT-BLIND, through the shared `readStrippedSource`. That is not tidiness:
 * the comment/grep collision has fired more than fifteen times across phases 37-38, including once
 * IN REVERSE — a token named in a doc comment is not thereby absent from the code. Prose in the
 * files below is therefore free, and prose in THIS file cannot satisfy anything.
 *
 * ANTI-VACUITY. Two blocks run before any other assertion: one proving all four files were read
 * (a helper returning "" would satisfy every negative assertion here perfectly), and one proving
 * each file actually mounts `BulkFailureReport` — which is what makes it the right file rather than
 * merely a file.
 */
import { describe, expect, it } from "vitest"

import { readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"

interface Caller {
  /** Repo-relative path, also the assertion's label. */
  path: string
  /** The name of the set of ids this surface actually has on screen. */
  setName: string
  /** Why THIS set, in this file — reproduced in the failure message. */
  why: string
  /** The state setter that would re-select a pruned id if it were called here. */
  selectionSetter: string
  /** Comment-stripped source. */
  source: string
}

const CALLERS: Caller[] = [
  {
    path: "src/app/organizations/data-table.tsx",
    setName: "loadedIds",
    why: "loadedIds is the set of ids currently in `data`; a failed id outside it has left the table, so it cannot be part of the effective selection no matter what rowSelection says",
    selectionSetter: "setRowSelection",
    source: "",
  },
  {
    path: "src/app/people/data-table.tsx",
    setName: "loadedIds",
    why: "loadedIds is the set of ids currently in `data`; a failed id outside it has left the table, so it cannot be part of the effective selection no matter what rowSelection says",
    selectionSetter: "setRowSelection",
    source: "",
  },
  {
    path: "src/app/activities/activities-client.tsx",
    setName: "loadedIds",
    why: "loadedIds is the set of ids currently in `activities`; a failed id outside it has left the list, so it cannot be part of the effective selection no matter what rowSelection says",
    selectionSetter: "setRowSelection",
    source: "",
  },
  {
    path: "src/app/deals/kanban-board.tsx",
    setName: "renderedIds",
    why: "the kanban's set is built across the OPEN stages ONLY, because the won and lost stages render summary tiles and no cards, so nothing there is ever selectable. Substituting a whole-data set here would be a silent behaviour change, not a rename",
    selectionSetter: "setSelectedDealIds",
    source: "",
  },
].map((caller) => ({ ...caller, source: readStrippedSource(caller.path) }))

const SOURCES: [string, string][] = CALLERS.map((caller) => [caller.path, caller.source])

/**
 * Extract the whole `<BulkFailureReport … />` opening element, brace- and string-aware.
 *
 * Scoping the assertions to the ELEMENT rather than to the file is what makes them mean anything on
 * these particular files: `kanban-board.tsx` already contains `selectedDealIds.has(deal.id)` on a
 * card, and all four contain their selection setter somewhere, so a file-wide `.has(` or a file-wide
 * absence check would be answered by unrelated code hundreds of lines away.
 */
function reportElement(source: string): string {
  const opensAt = source.indexOf("<BulkFailureReport")
  if (opensAt === -1) return ""

  let i = opensAt
  let depth = 0
  let quote: string | null = null

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

    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch
      i += 1
      continue
    }

    if (ch === "{") depth += 1
    else if (ch === "}") depth -= 1
    else if (depth === 0 && ch === "/" && source[i + 1] === ">") return source.slice(opensAt, i + 2)

    i += 1
  }

  return source.slice(opensAt)
}

// ANTI-VACUITY 1. Runs before everything else, deliberately.
describe("the gate reads all four callers", () => {
  it("read every source", () => {
    for (const [path, source] of SOURCES) {
      expect(
        source.length,
        `${path} must have been read: a helper returning an empty string would satisfy every negative assertion in this file perfectly`
      ).toBeGreaterThan(0)
    }
  })

  it("covers four callers and no fewer", () => {
    expect(
      CALLERS.length,
      "four surfaces mount BulkFailureReport — organizations, people, activities and the deals kanban. If a fifth appears, it must be added here rather than inheriting an unchecked copy of the count expression"
    ).toBe(4)
  })

  // ANTI-VACUITY 2. Proves these are the RIGHT files, not merely files that exist.
  it("finds the report mounted in each of them", () => {
    for (const caller of CALLERS) {
      expect(
        caller.source,
        `${caller.path} must mount <BulkFailureReport>. If it stops doing so this gate must go red and be reconsidered, not keep passing over a file it no longer describes`
      ).toContain("<BulkFailureReport")
    }
  })
})

describe("every caller tells the report what actually survived", () => {
  it("passes the surviving count as a prop", () => {
    for (const caller of CALLERS) {
      expect(
        reportElement(caller.source),
        `${caller.path} must pass stillSelected= to BulkFailureReport. Without it the report has no way to know whether the records it names are still on screen, and it would be back to asserting one selection state for every outcome`
      ).toContain("stillSelected=")
    }
  })

  it("computes it by intersecting the failures with its own rendered set", () => {
    for (const caller of CALLERS) {
      const element = reportElement(caller.source)

      expect(
        element,
        `${caller.path} must compute stillSelected with ${caller.setName}.has( — ${caller.why}`
      ).toContain(`${caller.setName}.has(`)

      expect(
        element,
        `${caller.path} must derive the count by filtering the failures, not by reading a length off something else: the number the report renders is |failed ∩ ${caller.setName}|`
      ).toContain(".filter(")
    }
  })

  it("intersects against the rendered set, never against rowSelection", () => {
    for (const caller of CALLERS) {
      expect(
        reportElement(caller.source).includes("rowSelection["),
        `${caller.path} must not compute the surviving count from rowSelection. handleOutcome re-asserts EVERY failed id into rowSelection unconditionally, so rowSelection[failedId] is always true and an intersection with it would report the old, false number while looking like a fix`
      ).toBe(false)
    }
  })
})

/**
 * THE LOCKED DIRECTION, stated as a gate.
 *
 * There were two ways to stop the panel lying. This phase took conditional copy; the other one is
 * forbidden here permanently.
 */
describe("no caller re-selects a pruned id to make the old sentence true", () => {
  it("calls no selection setter from inside the report's render expression", () => {
    for (const caller of CALLERS) {
      expect(
        reportElement(caller.source).includes(caller.selectionSetter),
        `${caller.path} must not call ${caller.selectionSetter} while rendering BulkFailureReport. Retaining the failed ids would reintroduce ids the table cannot render — precisely what the prune exists to prevent — trading a false sentence for a broken selection. The panel receives what survived and states only what is true`
      ).toBe(false)
    }
  })

  it("leaves the kanban's open-stage set unmixed with a whole-data set", () => {
    const kanban = CALLERS.find((caller) => caller.path === "src/app/deals/kanban-board.tsx")

    expect(
      kanban,
      "the kanban caller must be present in this table, or the assertion below iterates nothing"
    ).toBeDefined()

    expect(
      kanban?.source.includes("loadedIds"),
      "src/app/deals/kanban-board.tsx must not acquire a loadedIds set. Its renderedIds covers the OPEN stages only — the won and lost stages render summary tiles and no cards — so a set built from all board data would count deals that were never selectable and inflate the surviving count"
    ).toBe(false)
  })
})
