/**
 * THE T-39-01 AUTHORIZATION GATE, READ OUT OF THE SOURCE.
 *
 * `/duplicates` is admin-only and NOTHING ABOVE IT ENFORCES THAT. `src/middleware.ts` is a
 * five-line `NextAuth(authConfig).auth` export with a catch-all matcher: it establishes a session
 * for every non-API route and performs no role check whatsoever. Both halves of the control are
 * written by this phase, and this file is what stops either half from quietly disappearing:
 *
 *   1. `layout.tsx` redirects a non-admin away from every PAGE RENDER in the subtree, including
 *      `/duplicates/[pairId]`, which plan 39-15 adds and which inherits this layout.
 *   2. `actions.ts` re-checks the role inside EVERY exported action, because a server action is a
 *      POST endpoint the browser can invoke with no page render involved — the fact
 *      `src/app/admin/audit/actions.ts:6-10` records for `/admin/*`, where a layout redirect
 *      protects every page and no action.
 *
 * Neither half is redundant, and a hidden or disabled button is neither of them.
 *
 * THE FUNCTION LIST IS DERIVED FROM THE SOURCE, NOT HARDCODED. A seventh action added next year is
 * covered automatically; a hardcoded list would pass while the new action shipped ungated. The
 * derived list is asserted non-empty and at least as long as the six actions this plan writes
 * first, so a rename or a parser regression cannot turn the whole file into a vacuous pass.
 *
 * EVERY READ IS COMMENT-STRIPPED (`readStrippedSource`). The prose above names `role !== "admin"`
 * and both redirect targets; without stripping, this header alone would satisfy half the
 * assertions below and the gate would be self-invalidating (K-6).
 *
 * WHAT THIS FILE IS NOT. It is not a runtime authorization test — no session exists here and no
 * action is invoked. It asserts that the control is PRESENT and ORDERED. The behaviour it stands
 * in for is exercised by a real browser in plan 39-17.
 */
import { describe, expect, it } from "vitest"

import { readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"

const ACTIONS_PATH = "src/app/duplicates/actions.ts"
const LAYOUT_PATH = "src/app/duplicates/layout.tsx"

/** The admin predicate, spelled exactly as every other guard in this codebase spells it. */
const ADMIN_PREDICATE = 'role !== "admin"'

/**
 * The six actions this plan writes. Used ONLY as a floor — the assertions run over the derived
 * list, so a seventh action is gated without touching this array.
 */
const PLANNED_ACTIONS = [
  "startDuplicateScan",
  "getScanProgress",
  "cancelDuplicateScan",
  "dismissPair",
  "undismissPair",
  "saveOrgIdentityFields",
] as const

interface ExportedFunction {
  name: string
  /** The function body, braces excluded. */
  body: string
}

/**
 * Walk from an opening delimiter to just past its match, respecting string and template
 * literals so a brace or paren inside a string cannot close the span early.
 */
function skipBalanced(source: string, openAt: number, open: string, close: string): number {
  let depth = 0
  let i = openAt
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

/**
 * Every `export async function` in already-stripped source, with its body.
 *
 * The body is located by walking past the parameter list and then forward at ANGLE-BRACKET depth
 * zero, skipping any braced type literal that appears inside a generic. Without that, a return
 * type such as `Promise<DedupActionResult<{ scan: T | null }>>` would be mistaken for the body and
 * every assertion below would run over a type annotation instead of over code.
 */
function extractExportedAsyncFunctions(stripped: string): ExportedFunction[] {
  const marker = "export async function "
  const found: ExportedFunction[] = []
  let from = 0

  for (;;) {
    const at = stripped.indexOf(marker, from)
    if (at === -1) break

    let i = at + marker.length
    let name = ""
    while (i < stripped.length && /[A-Za-z0-9_$]/.test(stripped[i] ?? "")) {
      name += stripped[i]
      i += 1
    }

    const parenAt = stripped.indexOf("(", i)
    if (parenAt === -1) throw new Error(`${name}: no parameter list`)

    let cursor = skipBalanced(stripped, parenAt, "(", ")")
    let angle = 0
    let bodyAt = -1

    while (cursor < stripped.length) {
      const ch = stripped[cursor]

      if (ch === "<") {
        angle += 1
      } else if (ch === ">") {
        if (angle > 0) angle -= 1
      } else if (ch === "{") {
        if (angle === 0) {
          bodyAt = cursor
          break
        }
        cursor = skipBalanced(stripped, cursor, "{", "}")
        continue
      }

      cursor += 1
    }

    if (bodyAt === -1) throw new Error(`${name}: no function body`)

    const bodyEnd = skipBalanced(stripped, bodyAt, "{", "}")

    found.push({ name, body: stripped.slice(bodyAt + 1, bodyEnd - 1) })
    from = bodyEnd
  }

  return found
}

const actionsSource = readStrippedSource(ACTIONS_PATH)
const layoutSource = readStrippedSource(LAYOUT_PATH)
const actions = extractExportedAsyncFunctions(actionsSource)

describe("T-39-01: the /duplicates authorization gate", () => {
  describe("the derived action list", () => {
    it("finds exported actions at all", () => {
      // The floor that stops every assertion below from being vacuous: a parser regression, a
      // renamed export or an emptied file lands here rather than silently passing.
      expect(actions.length).toBeGreaterThan(0)
      expect(actions.length).toBeGreaterThanOrEqual(PLANNED_ACTIONS.length)
    })

    it("includes all six actions this plan writes", () => {
      const names = actions.map((action) => action.name)

      for (const planned of PLANNED_ACTIONS) {
        expect(names, `${ACTIONS_PATH} no longer exports ${planned}`).toContain(planned)
      }
    })
  })

  describe("every exported action re-checks the role", () => {
    // Derived, not hardcoded: a seventh action is gated the day it is added.
    for (const action of actions) {
      it(`${action.name} contains the admin re-check`, () => {
        expect(
          action.body,
          `${ACTIONS_PATH}: ${action.name} does not re-check ${ADMIN_PREDICATE}. A layout ` +
            `redirect cannot protect a server action — it is a POST endpoint the browser can ` +
            `invoke with no page render involved (T-39-01).`
        ).toContain(ADMIN_PREDICATE)
      })

      it(`${action.name} authenticates before anything else`, () => {
        expect(
          action.body,
          `${ACTIONS_PATH}: ${action.name} never calls auth()`
        ).toContain("auth()")

        const authAt = action.body.indexOf("auth()")
        const adminAt = action.body.indexOf(ADMIN_PREDICATE)

        expect(
          authAt,
          `${ACTIONS_PATH}: ${action.name} reads the role before establishing the session`
        ).toBeLessThan(adminAt)
      })

      it(`${action.name} opens no actor scope before authenticating (T-36-02)`, () => {
        const actorAt = action.body.indexOf("runWithActor")

        if (actorAt === -1) return

        const authAt = action.body.indexOf("auth()")

        expect(
          authAt,
          `${ACTIONS_PATH}: ${action.name} opens runWithActor BEFORE auth(), so an ` +
            `unauthenticated or non-admin call would establish an actor.`
        ).toBeLessThan(actorAt)
        expect(
          action.body.indexOf(ADMIN_PREDICATE),
          `${ACTIONS_PATH}: ${action.name} opens runWithActor BEFORE the admin re-check.`
        ).toBeLessThan(actorAt)
      })
    }
  })

  describe("cancelDuplicateScan enforces P-6 ownership", () => {
    it("compares the scan's starter against the caller", () => {
      const cancel = actions.find((action) => action.name === "cancelDuplicateScan")

      expect(cancel, `${ACTIONS_PATH} no longer exports cancelDuplicateScan`).toBeDefined()
      // `cancelPipedriveImport` checks authentication and never ownership — it never compares the
      // stored userId to the caller. UI-SPEC P-6 requires the comparison here: two users
      // cancelling each other's four-minute jobs is a support ticket, not a feature (T-39-08).
      expect(cancel?.body).toContain("session.user.id")
      expect(cancel?.body).toContain("NOT_STARTER")
    })
  })

  describe("the layout half of the gate", () => {
    it("redirects an unauthenticated visitor to the login callback", () => {
      expect(layoutSource).toContain("/login?callbackUrl=/duplicates")
    })

    it("redirects a signed-in non-admin away from the whole subtree", () => {
      expect(layoutSource).toContain("/?error=unauthorized")
      expect(layoutSource).toContain(ADMIN_PREDICATE)
    })

    it("calls redirect rather than merely computing a boolean", () => {
      // Anti-vacuity: the two targets could appear in a `const` nobody passes to anything.
      expect(layoutSource).toContain("redirect(")
      expect(layoutSource).toContain("auth()")
    })
  })

  describe("anti-vacuity on actions.ts itself", () => {
    it("is a real server-action module and not an emptied file", () => {
      // Every negative and every ordering assertion above passes trivially against an empty
      // string. These three are what make the file's contents load-bearing.
      expect(actionsSource).toContain('"use server"')
      expect(actionsSource).toContain("NOT_AUTHENTICATED")
      expect(actionsSource).toContain("revalidatePath")
      expect(actionsSource).toContain("runWithActor")
    })

    it("re-checks the role exactly once per exported action", () => {
      // A count, so a helper that hides the predicate behind one shared call site — which would
      // make the per-function assertions above pass by textual accident — cannot creep in.
      const occurrences = actionsSource.split(ADMIN_PREDICATE).length - 1

      expect(occurrences).toBe(actions.length)
    })
  })
})
