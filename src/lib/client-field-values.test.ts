import { describe, it, expect, vi } from "vitest"

// Established mock shape. Needed only because this file imports `formula-recalc` (which pulls
// in `@/db`) for the server-parity assertion. `client-field-values` itself imports no database
// module - that is the point of it, and a test below greps the source to prove it.
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    query: {
      deals: { findFirst: vi.fn(), findMany: vi.fn() },
      people: { findFirst: vi.fn(), findMany: vi.fn() },
      organizations: { findFirst: vi.fn(), findMany: vi.fn() },
      activities: { findFirst: vi.fn(), findMany: vi.fn() },
    },
  },
}))

import { readFileSync } from "node:fs"
import { buildClientFieldValues } from "./client-field-values"
import { buildFormulaFieldValues, ENTITY_NATIVE_ATTRIBUTES } from "./formula-recalc"
import type {
  CustomFieldDefinition,
  EntityType,
  FieldConfig,
  FieldType,
} from "@/db/schema"

function makeDef(
  name: string,
  type: FieldType,
  config: FieldConfig = null,
  entityType: EntityType = "deal"
): CustomFieldDefinition {
  return {
    id: `def-${name}`,
    entityType,
    name,
    type,
    config,
    required: false,
    position: "10000",
    showInList: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    deletedAt: null,
  }
}

const BASE = makeDef("Base", "number")
const DOUBLED = makeDef("Doubled", "formula", { expression: "{{Base}} * 2" })

describe("buildClientFieldValues", () => {
  describe("seeding (D-14 / CFUI-03)", () => {
    it("makes every active definition name a PRESENT key, seeded null", () => {
      const result = buildClientFieldValues({
        definitions: [BASE, DOUBLED],
        entityAttributes: { Title: "x" },
        values: {},
      })

      // `in` rather than `toBeNull` on purpose: the engine branches on key PRESENCE, and an
      // absent key is what fabricates `#ERROR - Unknown field: X`.
      expect("Base" in result).toBe(true)
      expect("Doubled" in result).toBe(true)
      expect(result.Base).toBeNull()
      expect(result.Doubled).toBeNull()
      expect(result.Title).toBe("x")
    })

    it("tolerates an absent entityAttributes (activities pass none today)", () => {
      const result = buildClientFieldValues({
        definitions: [BASE, DOUBLED],
        values: { Base: 3 },
      })

      expect(result).toEqual({ Base: 3, Doubled: null })
    })

    it("seeds nothing when there are no definitions", () => {
      expect(
        buildClientFieldValues({ definitions: [], entityAttributes: { Title: "x" }, values: {} })
      ).toEqual({ Title: "x" })
    })
  })

  describe("precedence (RESEARCH Pitfall 4)", () => {
    it("lets a stored value beat the null seed", () => {
      const result = buildClientFieldValues({
        definitions: [BASE, DOUBLED],
        entityAttributes: { Title: "x" },
        values: { Base: 3 },
      })

      expect(result.Base).toBe(3)
      expect(result.Doubled).toBeNull()
    })

    it("lets a stored value beat the null seed even when it is falsy", () => {
      const result = buildClientFieldValues({
        definitions: [BASE],
        values: { Base: 0 },
      })

      expect(result.Base).toBe(0)
    })

    it("does NOT let the null seed wipe a native attribute of the same name", () => {
      // Reversing the two passes ({...natives} last, or seeding last) is the documented
      // failure mode: it nulls a value the page actually has.
      const result = buildClientFieldValues({
        definitions: [makeDef("Title", "text")],
        entityAttributes: { Title: "Acme expansion" },
        values: { Title: "Acme expansion" },
      })

      expect(result.Title).toBe("Acme expansion")
    })

    it("keeps a stored key that has no matching definition (the blob always wins last)", () => {
      const result = buildClientFieldValues({
        definitions: [BASE],
        entityAttributes: { Title: "x" },
        values: { Base: 1, Archived: "legacy" },
      })

      expect(result.Archived).toBe("legacy")
    })

    it("normalises an undefined native to null, as the server's `?? null` does", () => {
      const result = buildClientFieldValues({
        definitions: [],
        entityAttributes: { Notes: undefined },
        values: {},
      })

      expect("Notes" in result).toBe(true)
      expect(result.Notes).toBeNull()
    })
  })

  describe("wrapper unwrapping (T-44-09)", () => {
    it("unwraps a stored { formula: true, ... } wrapper", () => {
      const result = buildClientFieldValues({
        definitions: [BASE, DOUBLED],
        entityAttributes: { Title: "x" },
        values: { Base: 3, Doubled: { formula: true, value: 6, error: null } },
      })

      expect(result.Doubled).toBe(6)
    })

    it("unwraps an errored wrapper to its (null) value, never to the object", () => {
      const result = buildClientFieldValues({
        definitions: [DOUBLED],
        values: { Doubled: { formula: true, value: null, error: "Unknown field: Base" } },
      })

      expect(result.Doubled).toBeNull()
    })

    it("passes a multi_select array through untouched (D-15)", () => {
      const result = buildClientFieldValues({
        definitions: [makeDef("Origem", "multi_select", { options: ["Outbound Manual"] })],
        values: { Origem: ["Outbound Manual"] },
      })

      expect(result.Origem).toEqual(["Outbound Manual"])
    })
  })

  describe("server parity with buildFormulaFieldValues (T-44-10)", () => {
    /** The attribute-keyed shape the detail pages hand the client, derived from the same row. */
    function clientAttributes(
      entityType: EntityType,
      row: Record<string, unknown>
    ): Record<string, unknown> {
      return Object.fromEntries(
        Object.entries(ENTITY_NATIVE_ATTRIBUTES[entityType]).map(([attribute, column]) => [
          attribute,
          row[column] ?? null,
        ])
      )
    }

    function assertParity(
      entityType: EntityType,
      definitions: CustomFieldDefinition[],
      row: Record<string, unknown>
    ) {
      const server = buildFormulaFieldValues({ entityType, definitions, row })
      const client = buildClientFieldValues({
        definitions,
        entityAttributes: clientAttributes(entityType, row),
        values: (row.customFields ?? {}) as Record<string, unknown>,
      })

      expect(client).toEqual(server)
      expect(Object.keys(client).sort()).toEqual(Object.keys(server).sort())
    }

    it("agrees key-for-key on a deal with an empty customFields blob", () => {
      assertParity("deal", [BASE, DOUBLED], {
        id: "d1",
        title: "Acme expansion",
        value: "1000.00",
        notes: null,
        expectedCloseDate: null,
        customFields: {},
      })
    })

    it("agrees key-for-key on a deal carrying stored values and a formula wrapper", () => {
      assertParity("deal", [BASE, DOUBLED, makeDef("Origem", "multi_select")], {
        id: "d1",
        title: "Acme expansion",
        value: "1000.00",
        notes: "hello",
        expectedCloseDate: "2026-12-31",
        customFields: {
          Base: 3,
          Doubled: { formula: true, value: 6, error: null },
          Origem: ["Outbound Manual"],
          Archived: "legacy",
        },
      })
    })

    it("agrees key-for-key on a person with no definitions at all", () => {
      assertParity("person", [], {
        id: "p1",
        firstName: "Ada",
        lastName: null,
        email: "ada@example.com",
        phone: null,
        notes: null,
        customFields: {},
      })
    })

    it("agrees key-for-key on an activity, whose natives the client page omits today", () => {
      assertParity(
        "activity",
        [makeDef("Score", "number", null, "activity")],
        {
          id: "a1",
          title: "Call Ada",
          notes: null,
          dueDate: "2026-09-01",
          completedAt: null,
          customFields: { Score: 7 },
        }
      )
    })
  })

  describe("client safety", () => {
    it("imports no database module — it must stay importable from a 'use client' file", () => {
      const source = readFileSync(new URL("./client-field-values.ts", import.meta.url), "utf8")
      expect(source).not.toMatch(/from\s+["']@\/db["']/)
      expect(source).not.toMatch(/from\s+["'].*formula-recalc["']/)
    })
  })
})
