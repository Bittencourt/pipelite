/**
 * THE SAVED-VIEW WRITE LAYER — its refusal paths and its authorization ordering.
 *
 * TWO TESTABLE HALVES, AND NEITHER OF THEM MOCKS DRIZZLE.
 *
 *   1. The pure guards in `src/lib/views/write-guards.ts` are called directly with real values.
 *      They are the whole of the decision each action makes before it writes, so exercising them
 *      is exercising the control rather than a stand-in for it.
 *
 *   2. `src/lib/views/actions.ts` is asserted by PARSED STRUCTURE. It cannot be imported here:
 *      it imports `@/db`, which constructs a postgres client at module load and throws without
 *      `DATABASE_URL`, and the base vitest project loads no `.env` (see `vitest.config.ts`). It
 *      is read as source instead, comment-stripped, and its exported functions are extracted by
 *      brace matching so an ORDERING claim can be made about each body — which is the property
 *      that matters. A layout guard cannot protect a server action, and neither can a hidden
 *      button; the check has to be inside the function AND ahead of the write.
 *
 * WHY ORDERING RATHER THAN PRESENCE. `expect(body).toContain("auth()")` passes for an action that
 * inserts a row and then authenticates. Phase 39's analogue (`duplicates-actions-wiring.test.ts`)
 * settled this repo's answer: extract the body, compare indices, and name the function in the
 * failure message. This file follows it, including its derived-list floor so a parser regression
 * or a renamed export lands here instead of silently passing.
 *
 * EVERY SOURCE READ IS COMMENT-STRIPPED. This header names `auth()`, `guardSaveInput` and the
 * `23505` constraint; without stripping it would satisfy several assertions below on its own,
 * which is the self-invalidating gate K-6 warns about.
 */
import { describe, expect, it } from "vitest"

import { callArguments, readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"
import type { ViewFilters } from "../types"
import {
  MAX_VIEW_NAME_LENGTH,
  SAVED_VIEW_NAME_CONSTRAINT,
  guardSaveInput,
  isDuplicateViewName,
  listRouteFor,
  narrowEntityType,
  narrowViewId,
  normaliseViewName,
  redactDbError,
} from "../write-guards"

const ACTIONS_PATH = "src/lib/views/actions.ts"
const GUARDS_PATH = "src/lib/views/write-guards.ts"

/** The two actions this task writes. A FLOOR, never the subject list — see below. */
const PLANNED_ACTIONS = ["createView", "updateView"] as const

/** The call each save action's guard must precede. Its own write, not merely its first query. */
const WRITE_MARKER: Readonly<Record<string, string>> = Object.freeze({
  createView: ".insert(",
  updateView: ".update(",
})

interface ExportedFunction {
  name: string
  /** The function body, braces excluded. */
  body: string
}

/**
 * Walk from an opening delimiter to just past its match, string- and template-aware so a brace
 * inside a string literal cannot close the span early.
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
 * Every `export async function` in already-stripped source, paired with its body.
 *
 * The body is found by walking past the parameter list and then forward at ANGLE-BRACKET depth
 * zero, skipping any braced type literal inside a generic. Without that, a return type such as
 * `Promise<ViewActionResult<{ id: string }>>` would be mistaken for the body and every ordering
 * assertion below would run over a type annotation. If it ever DOES mis-parse, the ordering
 * assertions fail closed: a type literal contains neither `auth()` nor `db.`, so both indices are
 * -1 and `-1 < -1` is false.
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
const guardsSource = readStrippedSource(GUARDS_PATH)
const actions = extractExportedAsyncFunctions(actionsSource)

function actionNamed(name: string): ExportedFunction {
  const found = actions.find((action) => action.name === name)

  if (!found) throw new Error(`${ACTIONS_PATH} no longer exports ${name}`)

  return found
}

describe("normaliseViewName", () => {
  it("rejects a name that is only whitespace", () => {
    // S-7's refusal. `""` and `"   "` are the same input as far as the user is concerned.
    expect(normaliseViewName("  ")).toBeNull()
    expect(normaliseViewName("")).toBeNull()
    expect(normaliseViewName("\t\n ")).toBeNull()
  })

  it("collapses internal whitespace runs to a single space", () => {
    expect(normaliseViewName("a\t\nb")).toBe("a b")
    expect(normaliseViewName("  Overdue    and   mine  ")).toBe("Overdue and mine")
  })

  it("accepts a name of exactly MAX_VIEW_NAME_LENGTH", () => {
    const exact = "x".repeat(MAX_VIEW_NAME_LENGTH)

    expect(normaliseViewName(exact)).toBe(exact)
  })

  it("REJECTS rather than truncates one character over the cap", () => {
    // A truncated name is a name the user did not choose, and it would collide with a real one
    // under `saved_views_owner_type_name_uniq` for reasons the user cannot see.
    expect(normaliseViewName("x".repeat(MAX_VIEW_NAME_LENGTH + 1))).toBeNull()
  })

  it("rejects a megabyte of text", () => {
    expect(normaliseViewName("x".repeat(1024 * 1024))).toBeNull()
  })

  it("counts the COLLAPSED length against the cap, not the raw length", () => {
    // A megabyte of spaces around two characters is a two-character name. The cap bounds what is
    // STORED, so it has to be measured after normalisation or a legitimate name is refused.
    expect(normaliseViewName(`a${" ".repeat(1024 * 1024)}b`)).toBe("a b")
  })

  it("rejects a non-string, because a server action's argument types are not enforced", () => {
    expect(normaliseViewName(undefined)).toBeNull()
    expect(normaliseViewName(null)).toBeNull()
    expect(normaliseViewName(42)).toBeNull()
    expect(normaliseViewName({ toString: () => "sneaky" })).toBeNull()
    expect(normaliseViewName(["a"])).toBeNull()
  })
})

describe("guardSaveInput", () => {
  it("stores the PICKED map, so an unwhitelisted key submitted alongside a real one is dropped", () => {
    const result = guardSaveInput({
      entityType: "deal",
      filters: { pipeline: "p1", nonsense: "x", page: "9", view: "other" },
      name: "Board",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.filters).toEqual({ pipeline: "p1" })
    expect(Object.keys(result.filters)).toEqual(["pipeline"])
  })

  it("accepts a pipeline-only deals view, because hasSaveableFilter counts pipeline", () => {
    // The load-bearing distinction from 40-01: `hasExportableFilter` does NOT count `pipeline`,
    // and using it here would refuse a legitimate board-only deals view that Decision 4 requires.
    const result = guardSaveInput({
      entityType: "deal",
      filters: { pipeline: "p1" },
      name: "My board",
    })

    expect(result).toEqual({ ok: true, filters: { pipeline: "p1" }, name: "My board" })
  })

  it("refuses an empty filter map (S-15: the guard is the control, the hidden button is not)", () => {
    expect(guardSaveInput({ entityType: "organization", filters: {}, name: "Nothing" })).toEqual({
      ok: false,
      error: "no_filters",
    })
  })

  it("refuses a map of only non-whitelisted keys", () => {
    // Built with `JSON.parse`, which is how a POST body actually arrives, and which is the ONLY
    // way to get a real own `__proto__` property: written as an object literal, `__proto__` sets
    // the prototype instead and the test would look like it exercised pollution while exercising
    // nothing. The cast is the point too — a server action's declared types are not a check.
    const crafted = JSON.parse(
      '{"page":"2","view":"abc","sort":"name","__proto__":{"polluted":true}}',
    ) as ViewFilters

    expect(
      guardSaveInput({ entityType: "organization", filters: crafted, name: "Nothing" }),
    ).toEqual({ ok: false, error: "no_filters" })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it("refuses a whitespace-only search value", () => {
    // An empty search box is not a filter. This is the case that must not become a saveable view.
    expect(
      guardSaveInput({ entityType: "organization", filters: { search: "   " }, name: "Blank" }),
    ).toEqual({ ok: false, error: "no_filters" })
  })

  it("refuses a filter value over the 40-01 length cap", () => {
    expect(
      guardSaveInput({
        entityType: "organization",
        filters: { search: "x".repeat(1000) },
        name: "Huge",
      }),
    ).toEqual({ ok: false, error: "no_filters" })
  })

  it("refuses a name normaliseViewName rejects", () => {
    expect(
      guardSaveInput({ entityType: "organization", filters: { search: "acme" }, name: "   " }),
    ).toEqual({ ok: false, error: "name_required" })
    expect(
      guardSaveInput({
        entityType: "organization",
        filters: { search: "acme" },
        // A client that omits the field entirely. The declared `string` does not stop it.
        name: undefined as unknown as string,
      }),
    ).toEqual({ ok: false, error: "name_required" })
  })

  it("reports no_filters ahead of name_required when both are wrong", () => {
    // Order matters for the UI: `name_required` renders inline beside the field, so reporting it
    // for a list that has nothing to save would point the user at the wrong problem.
    expect(guardSaveInput({ entityType: "organization", filters: {}, name: "" })).toEqual({
      ok: false,
      error: "no_filters",
    })
  })

  it("returns the NORMALISED name, not the submitted one", () => {
    const result = guardSaveInput({
      entityType: "activity",
      filters: { status: "overdue" },
      name: "  Overdue\tmine  ",
    })

    expect(result.ok && result.name).toBe("Overdue mine")
  })

  it("refuses an unrecognised entity type instead of storing it", () => {
    // `entity_type` is a bare `text` column, so an unnarrowed value would be persisted verbatim.
    expect(
      guardSaveInput({
        // @ts-expect-error - a server action's declared parameter type is a claim, not a check.
        entityType: "__proto__",
        filters: { search: "acme" },
        name: "Crafted",
      }),
    ).toEqual({ ok: false, error: "no_filters" })
  })
})

describe("narrowEntityType", () => {
  it("accepts the four real entity types", () => {
    expect(narrowEntityType("organization")).toBe("organization")
    expect(narrowEntityType("person")).toBe("person")
    expect(narrowEntityType("deal")).toBe("deal")
    expect(narrowEntityType("activity")).toBe("activity")
  })

  it("rejects anything else, including prototype-named strings and non-strings", () => {
    expect(narrowEntityType("__proto__")).toBeNull()
    expect(narrowEntityType("constructor")).toBeNull()
    expect(narrowEntityType("organizations")).toBeNull()
    expect(narrowEntityType("")).toBeNull()
    expect(narrowEntityType(null)).toBeNull()
    expect(narrowEntityType(undefined)).toBeNull()
    expect(narrowEntityType(7)).toBeNull()
  })
})

describe("narrowViewId", () => {
  it("accepts a uuid", () => {
    const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3301"

    expect(narrowViewId(id)).toBe(id)
  })

  it("rejects blank, over-long and non-string ids before they reach a query", () => {
    expect(narrowViewId("")).toBeNull()
    expect(narrowViewId("   ")).toBeNull()
    expect(narrowViewId("x".repeat(65))).toBeNull()
    expect(narrowViewId(null)).toBeNull()
    expect(narrowViewId({})).toBeNull()
  })
})

describe("listRouteFor", () => {
  it("maps each entity type to the route its list actually lives at", () => {
    // A frozen map, never a string transform: `person` + "s" is `/persons`, which does not exist.
    expect(listRouteFor("organization")).toBe("/organizations")
    expect(listRouteFor("person")).toBe("/people")
    expect(listRouteFor("deal")).toBe("/deals")
    expect(listRouteFor("activity")).toBe("/activities")
  })

  it("returns null for an unrecognised entity type rather than an undefined path", () => {
    // `revalidatePath(undefined)` throws, and these actions must never throw into a route with
    // no error boundary above it.
    expect(listRouteFor("__proto__")).toBeNull()
    expect(listRouteFor("persons")).toBeNull()
    expect(listRouteFor(null)).toBeNull()
  })
})

describe("isDuplicateViewName", () => {
  it("matches the WRAPPED shape drizzle actually throws", () => {
    // MEASURED, not assumed. drizzle-orm 0.45.1 wraps every driver error in a
    // `DrizzleQueryError` whose own `code` is undefined and whose `cause` is the postgres.js
    // `PostgresError`. An implementation reading `error.code` directly would never match, and
    // every duplicate-name save would return the generic failure instead of the field-level one.
    const wrapped = {
      name: "DrizzleQueryError",
      message: 'Failed query: insert into "saved_views" ...\nparams: ...',
      cause: {
        name: "PostgresError",
        code: "23505",
        constraint_name: SAVED_VIEW_NAME_CONSTRAINT,
        table_name: "saved_views",
      },
    }

    expect(isDuplicateViewName(wrapped)).toBe(true)
  })

  it("matches an unwrapped PostgresError too", () => {
    // A future drizzle release could stop wrapping; both shapes are accepted deliberately.
    expect(
      isDuplicateViewName({ code: "23505", constraint_name: SAVED_VIEW_NAME_CONSTRAINT }),
    ).toBe(true)
  })

  it("does NOT match a 23505 on a different constraint", () => {
    // Two concurrent "set as default" writes race on the defaults primary key and also raise
    // 23505. That is not a name collision and must not be reported as one.
    expect(
      isDuplicateViewName({
        cause: { code: "23505", constraint_name: "saved_view_defaults_user_id_entity_type_pk" },
      }),
    ).toBe(false)
  })

  it("does NOT match a different SQLSTATE on the same constraint name", () => {
    expect(
      isDuplicateViewName({ code: "23503", constraint_name: SAVED_VIEW_NAME_CONSTRAINT }),
    ).toBe(false)
  })

  it("does NOT string-match the driver message", () => {
    // The discriminating case. `DrizzleQueryError.message` embeds the SQL and the bound
    // parameters, so a name the user typed can put the constraint's own name into the message
    // text. Matching on the message would let a crafted view name be reported as a collision
    // that never happened - and, worse, would keep passing if `constraint_name` were dropped.
    expect(
      isDuplicateViewName({
        code: "23505",
        constraint_name: "some_other_index",
        message: `duplicate key value violates unique constraint "${SAVED_VIEW_NAME_CONSTRAINT}"`,
      }),
    ).toBe(false)
  })

  it("returns false for values that are not errors at all", () => {
    expect(isDuplicateViewName(null)).toBe(false)
    expect(isDuplicateViewName(undefined)).toBe(false)
    expect(isDuplicateViewName("23505")).toBe(false)
    expect(isDuplicateViewName(new Error("boom"))).toBe(false)
    expect(isDuplicateViewName({})).toBe(false)
  })

  it("terminates on a self-referential cause chain", () => {
    // A cause cycle is a bizarre input, and a bizarre input must not hang a POST endpoint.
    const cyclic: { code: string; cause?: unknown } = { code: "42P01" }
    cyclic.cause = cyclic

    expect(isDuplicateViewName(cyclic)).toBe(false)
  })
})

describe("redactDbError", () => {
  it("keeps the SQLSTATE and the constraint and nothing else", () => {
    const wrapped = {
      message: 'Failed query: insert into "saved_views" ("id", "name") values ($1, $2)\nparams: uuid,Secret View',
      cause: { code: "23505", constraint_name: SAVED_VIEW_NAME_CONSTRAINT },
    }

    const redacted = JSON.stringify(redactDbError(wrapped))

    expect(redacted).toContain("23505")
    expect(redacted).toContain(SAVED_VIEW_NAME_CONSTRAINT)
    // The whole serialised value, not one field, so a leak smuggled onto a second property fails.
    expect(redacted).not.toContain("insert into")
    expect(redacted).not.toContain("Secret View")
    expect(redacted).not.toContain("params")
  })

  it("survives a non-error without inventing fields", () => {
    expect(redactDbError(null)).toEqual({ code: null, constraint: null })
  })
})

describe(`${ACTIONS_PATH}: the write layer's authorization ordering`, () => {
  describe("the derived action list", () => {
    it("finds exported actions at all", () => {
      // The floor that stops every ordering assertion below from passing vacuously: an emptied
      // file, a renamed export or a parser regression lands here.
      expect(actions.length).toBeGreaterThan(0)
      expect(actions.length).toBeGreaterThanOrEqual(PLANNED_ACTIONS.length)
    })

    it("exports every action this task writes", () => {
      const names = actions.map((action) => action.name)

      for (const planned of PLANNED_ACTIONS) {
        expect(names, `${ACTIONS_PATH} no longer exports ${planned}`).toContain(planned)
      }
    })
  })

  describe("every exported action authenticates before it touches the database", () => {
    // Derived from the source, not hardcoded: a sixth action is gated the day it is added.
    for (const action of actions) {
      it(`${action.name} calls auth() before any db. access`, () => {
        expect(
          action.body,
          `${ACTIONS_PATH}: ${action.name} never calls auth(). A server action is a POST ` +
            `endpoint; no page guard and no hidden button protects it (T-40-22).`,
        ).toContain("auth()")

        const dbAt = action.body.indexOf("db.")

        expect(
          dbAt,
          `${ACTIONS_PATH}: ${action.name} performs no db. access in its own body, so the ` +
            `ordering claim below would be vacuous. Keep the query visible in the action.`,
        ).toBeGreaterThan(-1)

        expect(
          action.body.indexOf("auth()"),
          `${ACTIONS_PATH}: ${action.name} reaches the database BEFORE establishing the ` +
            `session (T-40-22).`,
        ).toBeLessThan(dbAt)
      })

      it(`${action.name} refuses an unauthenticated caller`, () => {
        expect(
          action.body,
          `${ACTIONS_PATH}: ${action.name} calls auth() but never acts on the absence of a ` +
            `session.`,
        ).toContain("not_authenticated")
      })
    }
  })

  describe("createView and updateView re-derive their own inputs", () => {
    for (const name of PLANNED_ACTIONS) {
      it(`${name} calls guardSaveInput on the submitted map before writing`, () => {
        const action = actionNamed(name)
        const calls = callArguments(action.body, "guardSaveInput")

        expect(
          calls.length,
          `${ACTIONS_PATH}: ${name} does not call guardSaveInput. The submitted filter map is ` +
            `data to be re-derived, never a claim to be trusted (T-40-25).`,
        ).toBe(1)

        // The argument text, parsed rather than grepped: the call must be handed the submitted
        // map and the submitted name, not a pre-cleaned local.
        expect(calls[0]).toContain("filters")
        expect(calls[0]).toContain("name")

        // Compared against the WRITE, not against the first `db.` access. `updateView` reads the
        // stored row first on purpose — it has to, in order to authorize against the row rather
        // than against the request — so "before any query" would be the wrong claim here.
        const writeAt = action.body.indexOf(WRITE_MARKER[name])

        expect(
          writeAt,
          `${ACTIONS_PATH}: ${name} performs no ${WRITE_MARKER[name]}, so the ordering claim ` +
            `would be vacuous.`,
        ).toBeGreaterThan(-1)
        expect(
          action.body.indexOf("guardSaveInput"),
          `${ACTIONS_PATH}: ${name} writes before it guards.`,
        ).toBeLessThan(writeAt)
      })
    }

    it("updateView authorizes on the stored row BEFORE it mutates", () => {
      const update = actionNamed("updateView")
      const authorizeAt = update.body.indexOf("canMutateView")
      const mutateAt = update.body.indexOf(".update(")

      expect(
        authorizeAt,
        `${ACTIONS_PATH}: updateView never calls canMutateView. S-4 offering a different dialog ` +
          `is presentation; the refusal has to exist here (T-40-23).`,
      ).toBeGreaterThan(-1)
      expect(
        mutateAt,
        `${ACTIONS_PATH}: updateView performs no .update(, so the ordering claim is vacuous.`,
      ).toBeGreaterThan(-1)
      expect(
        authorizeAt,
        `${ACTIONS_PATH}: updateView mutates the row before authorizing the caller.`,
      ).toBeLessThan(mutateAt)
    })

    it("createView does not authorize against a stored row, because there is none", () => {
      // Anti-vacuity in the opposite direction: if `canMutateView` appeared in every action the
      // ordering assertion above would say nothing about `updateView` in particular.
      expect(actionNamed("createView").body).not.toContain("canMutateView")
    })
  })

  describe("no translated string crosses this boundary", () => {
    it("contains zero message-catalog keys", () => {
      // The action returns a machine code; the client picks the sentence. A key returned from
      // here would be a locale decision made on the server, where no locale is in scope.
      const lowercased = actionsSource
      const occurrences = lowercased.split("views.").length - 1

      expect(
        occurrences,
        `${ACTIONS_PATH} contains ${occurrences} occurrence(s) of a message-catalog namespace.`,
      ).toBe(0)
    })

    it("returns the machine codes the catalog is keyed by", () => {
      // Anti-vacuity for the assertion above, which an empty file would also satisfy.
      for (const code of ["name_taken", "name_required", "no_filters", "forbidden", "failed"]) {
        expect(actionsSource, `${ACTIONS_PATH} never returns ${code}`).toContain(code)
      }
    })
  })

  describe("anti-vacuity on the two source files", () => {
    it("actions.ts is a real server-action module", () => {
      expect(actionsSource).toContain('"use server"')
      expect(actionsSource).toContain("revalidatePath")
      expect(actionsSource).toContain("savedViews")
      expect(actionsSource).toContain("isDuplicateViewName")
    })

    it("actions.ts never reads a raw SQLSTATE or constraint name of its own", () => {
      // One definition of the mapping, in the guard module the suite exercises directly. A second
      // inline `error.code === "23505"` here would be an untested copy.
      expect(actionsSource).not.toContain("23505")
    })

    it("write-guards.ts imports no database module, so this suite can import it", () => {
      expect(guardsSource).not.toContain('from "@/db')
      expect(guardsSource).not.toContain('from "next/cache"')
      expect(guardsSource).not.toContain('"use server"')
    })
  })
})
