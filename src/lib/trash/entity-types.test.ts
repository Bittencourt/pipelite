/**
 * TRASH-01 — the closed `?type=` / `?page=` vocabulary.
 *
 * These cases are the T-37-03 and T-37-02 evidence. `parseTrashTab` and `parseTrashPage`
 * sit between an attacker-controlled URL and a SQL predicate / an offset, so what matters
 * is not that the happy path parses but that EVERY other path lands inside the closed set:
 * a hostile string must not fall through as itself, and a huge page number must not walk an
 * unbounded offset. The hostile inputs are table-driven so adding a newly-imagined one is a
 * single line rather than a new test body.
 *
 * The module under test touches nothing — no database, no React, no i18n — so there is
 * nothing to mock. That is itself part of the contract: it is imported from server
 * components, server actions, REST routes AND client components, and a mock-requiring
 * dependency here would mean it had stopped being importable from one of them.
 */
import { describe, it, expect } from "vitest"

import {
  TRASH_TABS,
  TRASH_TAB_TO_ENTITY,
  ENTITY_TO_TRASH_TAB,
  TRASH_PRUNE_ORDER,
  TRASH_PARENTS,
  parseTrashTab,
  parseTrashPage,
  isTrashEntityType,
  type TrashTab,
} from "./entity-types"

describe("TRASH_TABS", () => {
  it("is exactly the four plural tab values, in display order", () => {
    expect(TRASH_TABS).toEqual(["deals", "people", "organizations", "activities"])
  })
})

describe("parseTrashTab", () => {
  it.each(TRASH_TABS)("returns %s unchanged", (tab) => {
    expect(parseTrashTab(tab)).toBe(tab)
  })

  /**
   * Every one of these must land on "deals". The singular forms and the wrong-case form are
   * in here deliberately: they are the plausible near-misses a hand-edited URL produces, and
   * a lenient parser that "helpfully" normalised them would be doing string coercion on the
   * exact value that selects a table.
   */
  const hostile: ReadonlyArray<[string, string | string[] | null | undefined]> = [
    ["undefined", undefined],
    ["null", null],
    ["the empty string", ""],
    ["whitespace", "   "],
    ["nonsense", "nonsense"],
    ["a real but non-trash entity", "notes"],
    ["the singular form", "deal"],
    ["the wrong case", "DEALS"],
    ["a SQL fragment", "deals'; DROP TABLE deals--"],
    ["a path traversal", "../../etc/passwd"],
    ["a prototype key", "__proto__"],
    ["constructor", "constructor"],
    ["toString", "toString"],
    ["an empty repeated param", []],
    ["a repeated param whose first value is hostile", ["nope", "deals"]],
  ]

  it.each(hostile)("falls back to deals for %s", (_label, raw) => {
    expect(parseTrashTab(raw)).toBe("deals")
  })

  it.each(hostile)("never returns a value outside TRASH_TABS for %s", (_label, raw) => {
    expect(TRASH_TABS).toContain(parseTrashTab(raw))
  })

  it("takes the first element of a repeated search param", () => {
    expect(parseTrashTab(["people", "deals"])).toBe("people")
  })
})

describe("parseTrashPage", () => {
  it("parses a plain positive integer", () => {
    expect(parseTrashPage("1")).toBe(1)
    expect(parseTrashPage("3")).toBe(3)
    expect(parseTrashPage("200")).toBe(200)
  })

  /**
   * `1.5`, `1e9`, `-4` and `""` are here because `Number()` alone accepts or coerces all
   * four — the digits-only test in front of it is what rejects them, the same posture
   * `retention-form.tsx` uses for day counts.
   */
  const invalidPages: ReadonlyArray<[string, string | string[] | null | undefined]> = [
    ["undefined", undefined],
    ["null", null],
    ["the empty string", ""],
    ["whitespace", "  "],
    ["zero", "0"],
    ["a negative", "-4"],
    ["a decimal", "1.5"],
    ["letters", "abc"],
    ["exponent notation", "1e9"],
    ["Infinity", "Infinity"],
    ["NaN", "NaN"],
    ["a mixed string", "3; DROP TABLE deals"],
    ["an empty repeated param", []],
  ]

  it.each(invalidPages)("falls back to page 1 for %s", (_label, raw) => {
    expect(parseTrashPage(raw)).toBe(1)
  })

  it("clamps above so a crafted page cannot ask for an unbounded offset", () => {
    expect(parseTrashPage("201")).toBe(200)
    expect(parseTrashPage("99999999")).toBe(200)
    expect(parseTrashPage("9".repeat(40))).toBe(200)
  })

  it("takes the first element of a repeated search param", () => {
    expect(parseTrashPage(["4", "9"])).toBe(4)
  })
})

describe("TRASH_TAB_TO_ENTITY / ENTITY_TO_TRASH_TAB", () => {
  it("maps each tab to its singular entity type", () => {
    expect(TRASH_TAB_TO_ENTITY).toEqual({
      deals: "deal",
      people: "person",
      organizations: "organization",
      activities: "activity",
    })
  })

  it.each(TRASH_TABS)("round-trips %s through the entity type and back", (tab) => {
    expect(ENTITY_TO_TRASH_TAB[TRASH_TAB_TO_ENTITY[tab]]).toBe(tab)
  })

  it("is an exact inverse in the other direction too", () => {
    for (const entity of TRASH_PRUNE_ORDER) {
      expect(TRASH_TAB_TO_ENTITY[ENTITY_TO_TRASH_TAB[entity]]).toBe(entity)
    }
  })

  it("is frozen, so a consumer cannot mutate the shared map", () => {
    expect(Object.isFrozen(TRASH_TAB_TO_ENTITY)).toBe(true)
    expect(Object.isFrozen(ENTITY_TO_TRASH_TAB)).toBe(true)
  })
})

describe("TRASH_PRUNE_ORDER", () => {
  it("is leaves-first, in the exact fixed order", () => {
    expect(TRASH_PRUNE_ORDER).toEqual(["activity", "deal", "person", "organization"])
  })

  it("contains each entity type exactly once", () => {
    expect(new Set(TRASH_PRUNE_ORDER).size).toBe(TRASH_PRUNE_ORDER.length)
    expect(TRASH_PRUNE_ORDER.length).toBe(TRASH_TABS.length)
  })
})

describe("TRASH_PARENTS", () => {
  it("is the fixed exhaustive parent map", () => {
    expect(TRASH_PARENTS).toEqual({
      deal: ["organization", "person"],
      person: ["organization"],
      activity: ["deal"],
      organization: [],
    })
  })

  it("gives organization no parents, so the badge never renders on that tab", () => {
    expect(TRASH_PARENTS.organization).toHaveLength(0)
  })

  it("only ever names real entity types as parents", () => {
    for (const parents of Object.values(TRASH_PARENTS)) {
      for (const parent of parents) {
        expect(TRASH_PRUNE_ORDER).toContain(parent)
      }
    }
  })
})

describe("isTrashEntityType", () => {
  it.each(["organization", "person", "deal", "activity"])("accepts %s", (value) => {
    expect(isTrashEntityType(value)).toBe(true)
  })

  it.each([
    ["a plural tab value", "deals"],
    ["a non-CRM entity", "import_session"],
    ["the empty string", ""],
    ["a number", 4],
    ["null", null],
    ["undefined", undefined],
    ["an object", { entity: "deal" }],
    ["an array", ["deal"]],
  ])("rejects %s", (_label, value) => {
    expect(isTrashEntityType(value)).toBe(false)
  })
})

describe("the tab type", () => {
  it("keeps TrashTab assignable from a parsed value", () => {
    const tab: TrashTab = parseTrashTab("activities")
    expect(tab).toBe("activities")
  })
})
