/**
 * CFUI-04 gate — every entity detail page must hand the custom-fields section the SAME native
 * attribute vocabulary the server-side evaluator exposes.
 *
 * `ENTITY_NATIVE_ATTRIBUTES` (formula-recalc.ts) is the server's source of truth for which native
 * columns a formula may reference. Each detail page rebuilds that vocabulary inline as the
 * `entityAttributes` prop so the browser's live evaluation agrees with Postgres. `activities` was
 * shipped with the prop missing entirely, so `{{Title}}` / `{{DueDate}}` errored in the browser
 * while the stored value was correct — the same client/server divergence class as CFUI-03.
 *
 * This is a source-read assertion (precedent: the D-18 gate at custom-fields.test.ts:405). It is
 * parameterised over all four pages so a FUTURE detail page that forgets the prop, or that drifts
 * one key away from the server map, fails here rather than in a browser session.
 */
import { describe, it, expect, vi } from "vitest"

// `formula-recalc` imports `@/db`; the module-level constant we need does not touch it.
vi.mock("@/db", () => ({ db: {} }))

import { ENTITY_NATIVE_ATTRIBUTES } from "@/lib/formula-recalc"
import type { EntityType } from "@/db/schema"
import { readStrippedSource } from "./source-scan"

/**
 * Return the body of the object literal that follows `entityAttributes={{`, or null when the prop
 * is absent. Brace matching is string-aware so a `}` inside a string cannot close the literal.
 */
function extractEntityAttributesBody(source: string): string | null {
  const marker = "entityAttributes={{"
  const markerAt = source.indexOf(marker)
  if (markerAt === -1) return null

  // Start inside the object literal: one char past the SECOND `{` of `{{`.
  let i = markerAt + marker.length
  let depth = 1
  let quote: string | null = null
  const start = i

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
    } else if (ch === "{") {
      depth += 1
    } else if (ch === "}") {
      depth -= 1
      if (depth === 0) return source.slice(start, i)
    }

    i += 1
  }

  throw new Error("unterminated entityAttributes object literal")
}

/** Top-level `Key:` names of an object-literal body, ignoring keys of nested literals. */
function topLevelKeys(body: string): string[] {
  const keys: string[] = []
  let depth = 0
  let quote: string | null = null
  let segmentStart = 0
  let colonAt = -1

  const flush = (end: number) => {
    if (colonAt === -1) return
    const raw = body.slice(segmentStart, colonAt).trim()
    if (raw) keys.push(raw.replace(/^['"`]|['"`]$/g, ""))
    colonAt = -1
    segmentStart = end + 1
  }

  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]

    if (quote) {
      if (ch === "\\") {
        i += 1
        continue
      }
      if (ch === quote) quote = null
      continue
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch
    } else if (ch === "{" || ch === "(" || ch === "[") {
      depth += 1
    } else if (ch === "}" || ch === ")" || ch === "]") {
      depth -= 1
    } else if (depth === 0 && ch === ":" && colonAt === -1) {
      colonAt = i
    } else if (depth === 0 && ch === ",") {
      flush(i)
    }
  }
  flush(body.length)

  return keys
}

const PAGES: ReadonlyArray<readonly [EntityType, string]> = [
  ["deal", "src/app/deals/[id]/page.tsx"],
  ["organization", "src/app/organizations/[id]/page.tsx"],
  ["person", "src/app/people/[id]/page.tsx"],
  ["activity", "src/app/activities/[id]/page.tsx"],
]

describe("entityAttributes parity with ENTITY_NATIVE_ATTRIBUTES (CFUI-04)", () => {
  it("covers every entity type that has a native attribute map", () => {
    expect([...PAGES].map(([entityType]) => entityType).sort()).toEqual(
      Object.keys(ENTITY_NATIVE_ATTRIBUTES).sort()
    )
  })

  it.each(PAGES)("%s: the detail page passes entityAttributes", (entityType, pagePath) => {
    const source = readStrippedSource(pagePath)
    const body = extractEntityAttributesBody(source)

    expect(
      body,
      `${pagePath} passes no entityAttributes prop, so a formula on a ${entityType} cannot ` +
        `resolve any of: ${Object.keys(ENTITY_NATIVE_ATTRIBUTES[entityType]).join(", ")}`
    ).not.toBeNull()
  })

  it.each(PAGES)(
    "%s: entityAttributes keys match the server map exactly",
    (entityType, pagePath) => {
      const source = readStrippedSource(pagePath)
      const body = extractEntityAttributesBody(source)
      const actual = body === null ? [] : topLevelKeys(body)
      const expected = Object.keys(ENTITY_NATIVE_ATTRIBUTES[entityType])

      const missing = expected.filter((key) => !actual.includes(key))
      const extra = actual.filter((key) => !expected.includes(key))

      expect(
        { missing, extra },
        `${pagePath} drifted from ENTITY_NATIVE_ATTRIBUTES.${entityType}`
      ).toEqual({ missing: [], extra: [] })

      expect([...actual].sort()).toEqual([...expected].sort())
    }
  )
})
