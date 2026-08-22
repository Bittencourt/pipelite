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
  canMutateView,
  canSeeView,
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

/**
 * The five actions this plan writes. A FLOOR, never the subject list: every ordering assertion
 * below runs over the list DERIVED from the source, so a sixth action is gated the day it is added
 * rather than the day somebody remembers to add it here.
 */
const PLANNED_ACTIONS = [
  "createView",
  "updateView",
  "setViewShared",
  "setViewDefault",
  "deleteView",
] as const

/** The two actions that take a name and a filter map, and therefore run the save-time guard. */
const SAVE_ACTIONS = ["createView", "updateView"] as const

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
function extractExportedFunctions(stripped: string, marker: string): ExportedFunction[] {
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
const actions = extractExportedFunctions(actionsSource, "export async function ")
const guards = extractExportedFunctions(guardsSource, "export function ")

function actionNamed(name: string): ExportedFunction {
  const found = actions.find((action) => action.name === name)

  if (!found) throw new Error(`${ACTIONS_PATH} no longer exports ${name}`)

  return found
}

function guardNamed(name: string): ExportedFunction {
  const found = guards.find((guard) => guard.name === name)

  if (!found) throw new Error(`${GUARDS_PATH} no longer exports ${name}`)

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

/**
 * THE ASYMMETRY. Two predicates that a reader will assume are the same one, and are not.
 *
 * MUTATION is the app's ordinary `owner || role === "admin"`. VISIBILITY is not: 40-CONTEXT
 * Decision 3 hides a private view from everyone including admins, which is a deliberate departure
 * from that idiom. So an admin may delete a shared view they can see and may not enumerate anybody's
 * private views at all. Each direction is asserted, including the ones that would pass if the two
 * predicates were collapsed into one — because that is the "simplification" this pair invites.
 */
const OWNER = { id: "user-owner", role: "member" as const }
const ADMIN = { id: "user-admin", role: "admin" as const }
const STRANGER = { id: "user-stranger", role: "member" as const }
const PRIVATE_ROW = { ownerId: OWNER.id, isShared: false }
const SHARED_ROW = { ownerId: OWNER.id, isShared: true }

describe("canMutateView — who may change a view", () => {
  it("ANTI-VACUITY: the owner may", () => {
    // A predicate hardcoded to `false` passes every refusal test below. These two are what stop it.
    expect(canMutateView(PRIVATE_ROW, OWNER)).toBe(true)
    expect(canMutateView(SHARED_ROW, OWNER)).toBe(true)
  })

  it("ANTI-VACUITY: an admin may, on somebody else's view", () => {
    expect(canMutateView(SHARED_ROW, ADMIN)).toBe(true)
  })

  it("a stranger may not", () => {
    expect(canMutateView(SHARED_ROW, STRANGER)).toBe(false)
    expect(canMutateView(PRIVATE_ROW, STRANGER)).toBe(false)
  })

  it("reads the ROW's owner, never a submitted one", () => {
    // A viewer claiming to be the owner is not the owner: the comparison is against the stored
    // column, so a crafted `ownerId` in the request has nowhere to land (T-40-23).
    expect(canMutateView({ ownerId: "someone-else", isShared: true }, STRANGER)).toBe(false)
  })

  it("does not treat a missing or oddly-cased role as admin", () => {
    expect(canMutateView(SHARED_ROW, { id: STRANGER.id })).toBe(false)
    expect(canMutateView(SHARED_ROW, { id: STRANGER.id, role: null })).toBe(false)
    expect(canMutateView(SHARED_ROW, { id: STRANGER.id, role: "Admin" })).toBe(false)
  })
})

describe("canSeeView — who may see a view", () => {
  it("ANTI-VACUITY: the owner sees their own private view", () => {
    expect(canSeeView(PRIVATE_ROW, OWNER)).toBe(true)
  })

  it("ANTI-VACUITY: anybody sees a shared view", () => {
    expect(canSeeView(SHARED_ROW, STRANGER)).toBe(true)
    expect(canSeeView(SHARED_ROW, ADMIN)).toBe(true)
  })

  it("an ADMIN does NOT see somebody else's private view", () => {
    // THE DISCRIMINATING CASE, and the whole of Decision 3. `canMutateView` returns TRUE for this
    // exact pair, so a `canSeeView` that had been "unified" with it would return true here and
    // this is the only assertion that would notice. `views.save.privateHelp` promises the user
    // "Only you can see this view. Nobody else, including admins." in words.
    expect(canSeeView(PRIVATE_ROW, ADMIN)).toBe(false)
    expect(canMutateView(PRIVATE_ROW, ADMIN)).toBe(true)
  })

  it("a stranger does not see a private view", () => {
    expect(canSeeView(PRIVATE_ROW, STRANGER)).toBe(false)
  })

  it("the two predicates disagree, and the disagreement is the point", () => {
    // Stated as one assertion so a future reader who deletes the pair by "simplifying" them into
    // one function fails a test whose name says what they broke.
    expect(canSeeView(PRIVATE_ROW, ADMIN)).not.toBe(canMutateView(PRIVATE_ROW, ADMIN))
    expect(canSeeView(SHARED_ROW, STRANGER)).not.toBe(canMutateView(SHARED_ROW, STRANGER))
  })

  it("canSeeView's own body contains no admin branch; canMutateView's does", () => {
    // Read from the EXTRACTED FUNCTION BODY rather than from the file, so the paragraph above
    // `canSeeView` explaining why it has no admin branch cannot satisfy the assertion — and,
    // equally, so deleting that paragraph is not a way to make it pass.
    expect(guardNamed("canSeeView").body).not.toContain("admin")
    expect(guardNamed("canMutateView").body).toContain("admin")
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
    for (const name of SAVE_ACTIONS) {
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

  describe("the G-7 asymmetry, action by action", () => {
    it("setViewShared refuses a view the caller neither owns nor admins", () => {
      const action = actionNamed("setViewShared")
      const authorizeAt = action.body.indexOf("canMutateView")
      const mutateAt = action.body.indexOf(".update(")

      // The predicate itself, exercised: a stranger is refused.
      expect(canMutateView(SHARED_ROW, STRANGER)).toBe(false)

      expect(
        authorizeAt,
        `${ACTIONS_PATH}: setViewShared never calls canMutateView. The G-4 switch being absent ` +
          `on a read-only row is presentation, not the control (T-40-23).`,
      ).toBeGreaterThan(-1)
      expect(mutateAt, `${ACTIONS_PATH}: setViewShared performs no .update(`).toBeGreaterThan(-1)
      expect(
        authorizeAt,
        `${ACTIONS_PATH}: setViewShared flips the flag before authorizing the caller.`,
      ).toBeLessThan(mutateAt)
    })

    it("setViewShared clears OTHER users' defaults when a view goes private", () => {
      // A consequence 40-CONTEXT does not state. An unshared view that is still somebody else's
      // default would redirect them into a view they can no longer see, and the resolver would
      // return nothing on every visit — a silent, permanent no-op with nothing on screen to
      // explain it. Dropping the stale row degrades them to the unfiltered list instead, which is
      // the behaviour the locked decision already chose for a DELETED shared view.
      //
      // THE FOUR ASSERTIONS THIS TEST USED TO MAKE — `savedViewDefaults`, `.delete(`, `ne(` and
      // `ownerId`, all against setViewShared's own body — ARE STILL MADE, and against a wider
      // scope: they moved to the block below, which checks the cleanup ONCE in the shared helper
      // that both unshare paths now call. Leaving them here would have required the delete to stay
      // inline, which is what let `updateView` ship without it (WR-03).
      const body = actionNamed("setViewShared").body

      expect(
        body,
        `${ACTIONS_PATH}: setViewShared no longer clears other users' defaults when the view goes ` +
          `private.`,
      ).toContain("clearOtherUsersDefaults(")

      // Inside the transaction that flips the flag, so the two commit or roll back together.
      const txAt = body.indexOf("db.transaction(")
      const cleanupAt = body.indexOf("clearOtherUsersDefaults(")

      expect(txAt, `${ACTIONS_PATH}: setViewShared no longer opens a transaction`).toBeGreaterThan(
        -1,
      )
      expect(
        cleanupAt,
        `${ACTIONS_PATH}: setViewShared clears the defaults OUTSIDE its transaction, so a failed ` +
          `update leaves the defaults gone anyway.`,
      ).toBeGreaterThan(txAt)

      // Only when the view is going PRIVATE. Clearing on every toggle would drop a teammate's
      // default the moment the owner re-shared.
      expect(body).toContain("if (!isShared)")
    })

    it("setViewDefault does NOT require ownership, because a default is per-user", () => {
      // UI-SPEC G-7: "the default switch, which is per-user and stays live: a user may default to
      // someone else's shared view". 40-CONTEXT gives the reason — "otherwise sharing has little
      // payoff" — and plan 40-02 put the default in its own table keyed (userId, entityType)
      // precisely so this is expressible; a boolean on the view row would have made one user's
      // choice the owner's choice too. So the absence of the ownership check here is a REQUIREMENT.
      expect(
        actionNamed("setViewDefault").body,
        `${ACTIONS_PATH}: setViewDefault calls canMutateView, which would stop a user pointing ` +
          `their own default at somebody else's shared view (UI-SPEC G-7).`,
      ).not.toContain("canMutateView")
    })

    it("setViewDefault refuses a view the caller cannot see", () => {
      // The check that IS required, and it is not the ownership one. Without it a member could
      // point their default at an admin's private view and read its filter values out of their
      // own address bar after the redirect — the disclosure an ownership check does not cover,
      // because ownership is not the question being asked (T-40-24).
      const action = actionNamed("setViewDefault")
      const seeAt = action.body.indexOf("canSeeView")
      const writeAt = action.body.indexOf("upsertDefault")

      expect(canSeeView(PRIVATE_ROW, STRANGER)).toBe(false)

      expect(
        seeAt,
        `${ACTIONS_PATH}: setViewDefault never calls canSeeView (T-40-24).`,
      ).toBeGreaterThan(-1)
      expect(writeAt, `${ACTIONS_PATH}: setViewDefault performs no upsert`).toBeGreaterThan(-1)
      expect(
        seeAt,
        `${ACTIONS_PATH}: setViewDefault writes the default before checking visibility.`,
      ).toBeLessThan(writeAt)
    })

    it("deleteView authorizes before it deletes", () => {
      const action = actionNamed("deleteView")
      const authorizeAt = action.body.indexOf("canMutateView")
      const deleteAt = action.body.indexOf(".delete(")

      expect(authorizeAt, `${ACTIONS_PATH}: deleteView never calls canMutateView`).toBeGreaterThan(
        -1,
      )
      expect(deleteAt, `${ACTIONS_PATH}: deleteView performs no .delete(`).toBeGreaterThan(-1)
      expect(
        authorizeAt,
        `${ACTIONS_PATH}: deleteView removes the row before authorizing the caller.`,
      ).toBeLessThan(deleteAt)
    })

    it("deleteView removes the row and lets the FK cascade take every default on it", () => {
      // THE LOCKED DECISION: "deleting a shared view that someone had defaulted to falls back to
      // unfiltered, with no error." Plan 40-02 made both saved_view_defaults foreign keys cascade
      // and exercised it live — deleting a shared view left zero orphaned defaults — so the
      // ABSENCE of a row IS the fallback. A manual delete here would be a second implementation
      // of a database guarantee, and one a transaction boundary could get wrong.
      const body = actionNamed("deleteView").body

      expect(body).toContain("savedViews")
      expect(
        body,
        `${ACTIONS_PATH}: deleteView deletes saved_view_defaults by hand. The cascade already ` +
          `does it; the manual delete is an untested duplicate of a database guarantee.`,
      ).not.toContain("savedViewDefaults")
    })

    it("deleteView returns the name, because the row is gone before the toast renders", () => {
      expect(actionNamed("deleteView").body).toContain("name: row.name")
    })
  })

  /**
   * WR-01 — THE MUTATION GATES MUST COMPOSE WITH THE VISIBILITY GATE.
   *
   * `queries.ts:38-41` states the invariant as settled fact:
   *
   *     `canEdit` KEEPS THE ADMIN BRANCH, and that is not a contradiction. […] an admin can only
   *     mutate a view they can already see.
   *
   * Nothing enforced it. All three mutators fetched the row by primary key with NO visibility
   * predicate and then asked `canMutateView` alone — which is
   * `row.ownerId === viewer.id || viewer.role === "admin"`, unconditionally true for an admin. So an
   * admin holding a private view's id could flip it shared (disclosing its name and its whole filter
   * set into their own picker, defeating Decision 3 outright), rename it, overwrite its filters, or
   * delete it and receive `row.name` back in the success payload.
   *
   * WHY THIS IS A WARNING AND NOT A CRITICAL, stated so the severity is not overstated: ids are
   * `crypto.randomUUID()` v4 and no code path hands a private view's id to a non-owner. The defect is
   * the absence of defence behind an unguessable id, plus a documented invariant that was false.
   *
   * THE ASSERTION IS AN ORDERING ONE, and deliberately mirrors the one this file already makes for
   * `setViewDefault`: visibility FIRST, then ownership, then the write. Order matters here for a
   * reason beyond tidiness — a row the caller cannot see must be answered exactly as a missing one
   * (`failed`), never as `forbidden`, or the refusal itself tells an admin that somebody's private
   * view exists at that id.
   */
  describe("WR-01: an admin can only mutate a view they can already SEE", () => {
    /** Each mutator, and the call its visibility check must precede. */
    const MUTATORS: ReadonlyArray<{ name: string; write: string }> = [
      { name: "updateView", write: ".update(" },
      { name: "setViewShared", write: ".update(" },
      { name: "deleteView", write: ".delete(" },
    ]

    it("the predicates themselves disagree about a private view, which is what makes this testable", () => {
      // Exercised, not assumed. If `canSeeView` and `canMutateView` agreed on this pair there would
      // be nothing for the composition to add, and every ordering assertion below would be theatre.
      expect(canSeeView(PRIVATE_ROW, ADMIN)).toBe(false)
      expect(canMutateView(PRIVATE_ROW, ADMIN)).toBe(true)
    })

    for (const { name, write } of MUTATORS) {
      it(`${name} calls canSeeView BEFORE canMutateView and before its write`, () => {
        const action = actionNamed(name)
        const seeAt = action.body.indexOf("canSeeView")
        const mutateAt = action.body.indexOf("canMutateView")
        const writeAt = action.body.indexOf(write)

        expect(
          seeAt,
          `${ACTIONS_PATH}: ${name} never calls canSeeView, so canMutateView's admin branch lets ` +
            `an admin holding the id read, rename, share or delete a view Decision 3 says belongs ` +
            `to exactly one person (WR-01). queries.ts:38-41 claims otherwise.`,
        ).toBeGreaterThan(-1)
        expect(
          mutateAt,
          `${ACTIONS_PATH}: ${name} performs no canMutateView check, so this ordering claim is ` +
            `vacuous.`,
        ).toBeGreaterThan(-1)
        expect(
          writeAt,
          `${ACTIONS_PATH}: ${name} performs no ${write}, so this ordering claim is vacuous.`,
        ).toBeGreaterThan(-1)

        expect(
          seeAt,
          `${ACTIONS_PATH}: ${name} asks whether the caller may MUTATE the row before asking ` +
            `whether they may SEE it. The order is the disclosure: an unseen row must be refused ` +
            `with the same answer as a missing one.`,
        ).toBeLessThan(mutateAt)
        expect(
          seeAt,
          `${ACTIONS_PATH}: ${name} writes before checking visibility.`,
        ).toBeLessThan(writeAt)
      })

      it(`${name} answers an unseen row exactly as it answers a missing one`, () => {
        /*
         * `forbidden` is the sentence G-7 renders — "this view belongs to someone else" — and
         * returning it here would confirm to an admin that a private view exists at the id they
         * guessed or kept. `failed` is what a missing row already returns, so the two cases are
         * indistinguishable from outside.
         */
        const body = actionNamed(name).body
        const refusal = /canSeeView\([^)]*\)\)\s*return\s*\{\s*success:\s*false,\s*error:\s*"failed"\s*\}/

        expect(
          refusal.test(body),
          `${ACTIONS_PATH}: ${name}'s canSeeView refusal does not return ` +
            `{ success: false, error: "failed" }. A distinct code turns the guard itself into the ` +
            `disclosure it was added to prevent (WR-01).`,
        ).toBe(true)
      })
    }

    it("all three mutators are covered, and setViewDefault is NOT one of them", () => {
      /*
       * ANTI-VACUITY AND A BOUNDARY IN ONE. The list above is a literal, so this pins it against the
       * actions actually exported: every action that calls `canMutateView` must also call
       * `canSeeView`. `setViewDefault` deliberately calls neither `canMutateView` (G-7: a default is
       * per user) nor a write this block would recognise, so it is excluded by the predicate rather
       * than by being forgotten.
       */
      const mutating = actions
        .filter((fn) => fn.body.includes("canMutateView"))
        .map((fn) => fn.name)
        .sort()

      expect(mutating).toEqual(["deleteView", "setViewShared", "updateView"])

      for (const name of mutating) {
        expect(
          actionNamed(name).body,
          `${ACTIONS_PATH}: ${name} calls canMutateView without canSeeView (WR-01).`,
        ).toContain("canSeeView")
      }
    })
  })

  /**
   * WR-03 — BOTH PATHS THAT CAN TAKE A VIEW PRIVATE OWE THE SAME CLEANUP.
   *
   * `setViewShared` documented the consequence at length and implemented it. `updateView` can make
   * the identical state change — the save dialog's "Share with the team" checkbox arrives as
   * `isShared` and is written unconditionally — and did not. Reachable in three clicks: A shares V,
   * B defaults to it, A reopens the save dialog with V selected, unticks the box, saves. B's
   * `saved_view_defaults` row survived.
   *
   * The immediate effect is benign (`readDefaultViewForUser` carries the visibility predicate in its
   * join, so B degrades to the unfiltered list). The RE-SHARE is not: if A ever shares V again, B is
   * silently redirected into a view they last chose weeks ago.
   *
   * ONE IMPLEMENTATION, ASSERTED ONCE, CALLED FROM BOTH. Two inline copies of the same delete is the
   * shape that produced this defect, so the gate is written to fail if a second copy appears rather
   * than to tolerate it.
   */
  describe("WR-03: every path that unshares a view clears other users' defaults", () => {
    /**
     * The module's private helpers — everything above the first exported action.
     *
     * A SLICE, NOT A FOURTH MATCHER. `extractExportedFunctions` above only sees
     * `export async function`, and `clearOtherUsersDefaults` must NOT be exported: Next.js refuses
     * to build a `"use server"` module that exports a non-async-function, and exporting it would
     * also make it a public POST endpoint that deletes defaults. Every private helper in this file
     * is declared before `createView`, so that offset IS the boundary — asserted, not assumed, in
     * the first test below.
     */
    const helpers = actionsSource.slice(0, actionsSource.indexOf("export async function "))

    it("the helper region really is the private preamble", () => {
      expect(helpers.length, `${ACTIONS_PATH}: no exported action found at all`).toBeGreaterThan(0)
      expect(helpers).not.toContain("export async function")
      expect(helpers).toContain("async function upsertDefault(")
      expect(helpers).toContain("async function clearOtherUsersDefaults(")
    })

    it("the cleanup is defined ONCE, scoped away from the owner", () => {
      /*
       * The four assertions the setViewShared test used to make against its own body, now made
       * against the single definition both callers share. Scoped to somebody ELSE: the owner keeps
       * their own default, because they can still see their own private view, and an unscoped
       * delete would take theirs too.
       */
      expect(helpers).toContain("savedViewDefaults")
      expect(helpers).toContain(".delete(")
      expect(helpers).toContain("ne(savedViewDefaults.userId, ownerId)")
      expect(helpers).toContain("eq(savedViewDefaults.viewId, viewId)")

      // It takes a transaction handle, never `db`, so it commits with the visibility change.
      expect(helpers).toContain("clearOtherUsersDefaults(tx: Tx")
      expect(
        helpers.slice(helpers.indexOf("async function clearOtherUsersDefaults(")),
        `${ACTIONS_PATH}: clearOtherUsersDefaults reaches for the module-level db handle instead ` +
          `of the transaction it was handed.`,
      ).not.toContain("db.delete")
    })

    it("updateView clears other users' defaults when its write takes the view private", () => {
      const body = actionNamed("updateView").body
      const cleanupAt = body.indexOf("clearOtherUsersDefaults(")

      expect(
        cleanupAt,
        `${ACTIONS_PATH}: updateView can unshare a view — the save dialog's checkbox is written ` +
          `unconditionally at its .update() — and never clears the other users' defaults that ` +
          `setViewShared does. A teammate keeps a stale default row, and re-sharing later silently ` +
          `redirects them into a view they chose weeks ago (WR-03).`,
      ).toBeGreaterThan(-1)

      // Conditional on the view HAVING been shared and NOT being shared any more. Unconditional
      // clearing would wipe teammates' defaults every time the owner merely renamed a shared view.
      expect(
        body,
        `${ACTIONS_PATH}: updateView clears the defaults without checking that the view was shared ` +
          `and is not any more — a rename of a still-shared view would drop every teammate's ` +
          `default.`,
      ).toContain("row.isShared && input.isShared !== true")

      // Inside the same transaction as the update itself.
      const txAt = body.indexOf("db.transaction(")

      expect(txAt, `${ACTIONS_PATH}: updateView no longer opens a transaction`).toBeGreaterThan(-1)
      expect(cleanupAt).toBeGreaterThan(txAt)
    })

    it("updateView still scopes its OWN default-clearing to the viewer, which is a different row set", () => {
      /*
       * ANTI-CONFLATION. `updateView` already deleted from `savedViewDefaults`, but scoped to
       * `viewer.id` — the untick-the-default-checkbox branch, which is the OPPOSITE row set from
       * the one WR-03 is about. The finding was easy to misread as "it already deletes defaults, so
       * it is fine"; this assertion keeps both behaviours present so the fix cannot have replaced
       * one with the other.
       */
      const body = actionNamed("updateView").body

      expect(body).toContain("eq(savedViewDefaults.userId, viewer.id)")
      expect(body).toContain("clearOtherUsersDefaults(")
    })

    it("no caller re-implements the delete inline", () => {
      // The gate against the shape that caused WR-03 in the first place: a second copy, added
      // beside the helper rather than through it, that then fails to be updated with the first.
      for (const action of actions) {
        expect(
          action.body,
          `${ACTIONS_PATH}: ${action.name} spells the other-users cleanup out inline instead of ` +
            `calling clearOtherUsersDefaults. Two copies of this rule is exactly how updateView ` +
            `ended up without one (WR-03).`,
        ).not.toContain("ne(savedViewDefaults.userId")
      }
    })

    it("exactly the two unsharing actions call it — createView and setViewDefault cannot unshare", () => {
      // Anti-vacuity, and a boundary: `createView` has no previous visibility to change and
      // `setViewDefault` writes one user's own row. A cleanup call in either would be deleting
      // other people's defaults for no reason.
      const callers = actions
        .filter((fn) => fn.body.includes("clearOtherUsersDefaults("))
        .map((fn) => fn.name)
        .sort()

      expect(callers).toEqual(["setViewShared", "updateView"])
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
