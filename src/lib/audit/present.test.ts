import { readFileSync } from "node:fs"

import { describe, it, expect } from "vitest"

import type { AuditAction, AuditFieldChange, AuditValue } from "@/lib/timeline/types"

import {
  AUDIT_FIELD_LABELS,
  AUDIT_TITLE_MAX_CHARS,
  AUDIT_VALUE_MAX_CHARS,
  buildAuditFieldChanges,
  collapseAndTruncate,
  toAuditValue,
  type AuditResolution,
} from "./present"

/* -----------------------------------------------------------------------------------------
 * This file mocks NOTHING, and that is the point.
 *
 * The vitest suite mocks `@/db` wholesale, so every audit read path that touches the
 * database is untestable by construction. `present.ts` is where the phase's display
 * decisions live precisely so they can be tested here: it receives an `AuditResolution`
 * instead of querying for one. If mocking ever becomes necessary in this file,
 * something impure has been added to `present.ts` and that is the bug.
 * ----------------------------------------------------------------------------------------- */

function resolution(overrides: Partial<AuditResolution> = {}): AuditResolution {
  return {
    references: new Map<string, string | null>(),
    customFieldNames: new Map<string, string>(),
    customFieldTypes: new Map<string, string>(),
    customFieldPositions: new Map<string, number>(),
    ...overrides,
  }
}

/** The `to` value a single stored change turns into. */
function valueOf(
  field: string,
  raw: unknown,
  res: AuditResolution = resolution()
): AuditValue {
  const changes = buildAuditFieldChanges(
    "deal",
    "updated",
    { [field]: { from: null, to: raw } },
    res
  )
  expect(changes).toHaveLength(1)
  return changes[0].to
}

function fieldsOf(changes: AuditFieldChange[]): string[] {
  return changes.map((change) => change.field)
}

/** Every column the value rules must resolve through `references`, never as text. */
const REFERENCE_COLUMNS = [
  "stageId",
  "organizationId",
  "personId",
  "dealId",
  "ownerId",
  "assigneeId",
  "typeId",
]

const UUID = "3f1c9a6e-7d2b-4c8a-9e11-5b0d2a4f6c33"

describe("collapseAndTruncate", () => {
  it("truncates a 5,000-character value with embedded newlines to exactly 120 characters", () => {
    const input = `Line one\n\nLine two\r\n\tIndented   ${"x".repeat(5000)}`
    const { display } = collapseAndTruncate(input)

    expect(display).toHaveLength(AUDIT_VALUE_MAX_CHARS)
    expect(display).toHaveLength(120)
    expect(display).not.toMatch(/\s\s/)
    expect(display).not.toMatch(/[\n\r\t]/)
    expect(display.startsWith("Line one Line two Indented x")).toBe(true)
  })

  it("truncates with a single U+2026, not three periods", () => {
    const { display } = collapseAndTruncate("y".repeat(400))

    // 119 characters of content plus ONE ellipsis character. Asserted by length and by
    // code point, because "…" and "..." are indistinguishable at a glance and differ by
    // two characters of budget.
    expect(display.slice(0, 119)).toBe("y".repeat(119))
    expect(display.codePointAt(119)).toBe(0x2026)
    expect(display).toHaveLength(120)
    expect(display.endsWith("...")).toBe(false)
  })

  it("caps the title of a truncated value at 1,000 collapsed characters", () => {
    const { title } = collapseAndTruncate(`a\nb\n${"z".repeat(5000)}`)

    expect(AUDIT_TITLE_MAX_CHARS).toBe(1000)
    expect(title).not.toBeNull()
    expect(title).toHaveLength(AUDIT_TITLE_MAX_CHARS)
    expect(title).not.toMatch(/[\n\r\t]/)
    expect(title?.startsWith("a b z")).toBe(true)
  })

  it("returns a 40-character string unchanged with no title", () => {
    const input = "b".repeat(40)
    expect(collapseAndTruncate(input)).toEqual({ display: input, title: null })
  })

  it("collapses and trims without truncating when the result fits", () => {
    expect(collapseAndTruncate("  two   \n words \t ")).toEqual({
      display: "two words",
      title: null,
    })
  })

  it("truncates a 200-character unbroken URL like any other string, with no special case", () => {
    const url = `https://example.com/${"a".repeat(180)}`
    expect(url.length).toBeGreaterThan(AUDIT_VALUE_MAX_CHARS)

    const { display, title } = collapseAndTruncate(url)

    expect(display).toHaveLength(120)
    expect(display.codePointAt(119)).toBe(0x2026)
    expect(title).toBe(url)
  })

  it("returns an empty string unchanged rather than an ellipsis", () => {
    expect(collapseAndTruncate("")).toEqual({ display: "", title: null })
  })
})

describe("value typing", () => {
  it("types a plain string as text", () => {
    expect(valueOf("title", "Contrato Tyr")).toEqual({
      type: "text",
      value: "Contrato Tyr",
    })
  })

  it("types a number as number, including a numeric column stored as a string", () => {
    expect(valueOf("someCount", 42)).toEqual({ type: "number", value: 42 })
    // `deals.value` is `numeric`, which node-postgres hands back as a string.
    expect(valueOf("value", "1000.00")).toEqual({ type: "number", value: 1000 })
  })

  it("types a boolean as boolean", () => {
    expect(valueOf("someFlag", true)).toEqual({ type: "boolean", value: true })
    expect(valueOf("someFlag", false)).toEqual({ type: "boolean", value: false })
  })

  it("types null and undefined as empty", () => {
    expect(valueOf("title", null)).toEqual({ type: "empty" })
    expect(valueOf("title", undefined)).toEqual({ type: "empty" })
  })

  it("types an empty string as empty, never as text with an empty value", () => {
    // The renderer prints the word "empty" for this case. A `text` node holding "" would
    // print nothing and the diff row would look broken.
    expect(valueOf("title", "")).toEqual({ type: "empty" })
    expect(valueOf("title", "   \n  ")).toEqual({ type: "empty" })
  })

  it("types dueDate as a date with time and expectedCloseDate as a date without time", () => {
    expect(valueOf("dueDate", "2026-08-15T14:30:00.000Z")).toEqual({
      type: "date",
      iso: "2026-08-15T14:30:00.000Z",
      withTime: true,
    })
    expect(valueOf("completedAt", "2026-08-15T14:30:00.000Z")).toEqual({
      type: "date",
      iso: "2026-08-15T14:30:00.000Z",
      withTime: true,
    })
    expect(valueOf("expectedCloseDate", "2026-08-15T00:00:00.000Z")).toEqual({
      type: "date",
      iso: "2026-08-15T00:00:00.000Z",
      withTime: false,
    })
  })

  it("accepts a Date instance on a date column and carries its ISO string", () => {
    expect(valueOf("dueDate", new Date("2026-08-15T14:30:00.000Z"))).toEqual({
      type: "date",
      iso: "2026-08-15T14:30:00.000Z",
      withTime: true,
    })
  })

  it("falls back to text when a date column holds an unparseable string", () => {
    expect(valueOf("dueDate", "not a date")).toEqual({
      type: "text",
      value: "not a date",
    })
  })

  it("types an array of strings as a list", () => {
    expect(valueOf("customFields.Tags", ["alpha", "beta"])).toEqual({
      type: "list",
      items: ["alpha", "beta"],
    })
  })

  it("types an empty array as empty rather than a zero-item list", () => {
    expect(valueOf("customFields.Tags", [])).toEqual({ type: "empty" })
  })

  it("types an array of file descriptors as a file count, never as JSON", () => {
    const files = [
      { id: "f1", filename: "contract.pdf", storedName: "a.pdf", size: 12, mimeType: "application/pdf" },
      { id: "f2", filename: "annex.pdf", storedName: "b.pdf", size: 34, mimeType: "application/pdf" },
    ]

    expect(valueOf("customFields.Attachments", files)).toEqual({
      type: "files",
      count: 2,
    })
  })

  it("types an unrecognised object as compacted JSON with no pretty-printing", () => {
    const value = valueOf("customFields.Blob", { b: 1, a: { deep: [1, 2] } })

    expect(value.type).toBe("json")
    if (value.type !== "json") throw new Error("unreachable")
    expect(value.value).not.toMatch(/\n/)
    expect(value.value).not.toMatch(/: /)
    expect(value.value).toBe('{"b":1,"a":{"deep":[1,2]}}')
  })

  it("exports toAuditValue for callers that resolve a single stored value", () => {
    expect(toAuditValue("title", "Contrato Tyr", resolution())).toEqual({
      type: "text",
      value: "Contrato Tyr",
    })
  })
})

describe("reference resolution", () => {
  it("resolves a foreign key present in the resolution map to its label", () => {
    const res = resolution({
      references: new Map([[`ownerId:${UUID}`, "Ana Pereira"]]),
    })

    expect(valueOf("ownerId", UUID, res)).toEqual({
      type: "reference",
      label: "Ana Pereira",
    })
  })

  it("resolves a foreign key absent from the resolution map to a null label", () => {
    expect(valueOf("ownerId", UUID)).toEqual({ type: "reference", label: null })
  })

  it("resolves a foreign key explicitly mapped to null to a null label", () => {
    const res = resolution({ references: new Map([[`stageId:${UUID}`, null]]) })

    expect(valueOf("stageId", UUID, res)).toEqual({ type: "reference", label: null })
  })

  it("types a cleared foreign key as empty, not as an unresolvable reference", () => {
    expect(valueOf("ownerId", null)).toEqual({ type: "empty" })
    expect(valueOf("ownerId", "")).toEqual({ type: "empty" })
  })

  it("never lets a raw id survive into a text value on any reference column", () => {
    for (const column of REFERENCE_COLUMNS) {
      const unresolved = valueOf(column, UUID)
      expect(unresolved.type).toBe("reference")
      expect(JSON.stringify(unresolved)).not.toContain(UUID)

      const resolved = valueOf(
        column,
        UUID,
        resolution({ references: new Map([[`${column}:${UUID}`, "Resolved name"]]) })
      )
      expect(resolved).toEqual({ type: "reference", label: "Resolved name" })
    }
  })

  it("resolves a custom lookup field through the same references map", () => {
    const res = resolution({
      customFieldNames: new Map([["def-lookup", "Parceiro"]]),
      customFieldTypes: new Map([["def-lookup", "lookup"]]),
      customFieldPositions: new Map([["def-lookup", 10000]]),
      references: new Map([[`customFields.Parceiro:${UUID}`, "Tyr Energia"]]),
    })

    expect(valueOf("customFields.Parceiro", UUID, res)).toEqual({
      type: "reference",
      label: "Tyr Energia",
    })
  })
})

describe("labels", () => {
  it("maps all twenty audited native columns to their message keys", () => {
    expect(Object.keys(AUDIT_FIELD_LABELS)).toHaveLength(20)

    const expected: Record<string, string> = {
      title: "audit.field.title",
      name: "audit.field.name",
      firstName: "audit.field.firstName",
      lastName: "audit.field.lastName",
      email: "audit.field.email",
      phone: "audit.field.phone",
      website: "audit.field.website",
      industry: "audit.field.industry",
      defaultCurrency: "audit.field.defaultCurrency",
      value: "audit.field.value",
      stageId: "audit.field.stage",
      expectedCloseDate: "audit.field.expectedCloseDate",
      organizationId: "audit.field.organization",
      personId: "audit.field.person",
      dealId: "audit.field.deal",
      ownerId: "audit.field.owner",
      assigneeId: "audit.field.assignee",
      typeId: "audit.field.type",
      dueDate: "audit.field.dueDate",
      completedAt: "audit.field.completedAt",
    }

    expect(AUDIT_FIELD_LABELS).toEqual(expected)
  })

  it("labels a foreign key by its relationship, never by its id column", () => {
    // "Stage", not "Stage ID" — the id is an implementation detail and never reaches a screen.
    expect(AUDIT_FIELD_LABELS.stageId).toBe("audit.field.stage")
    expect(AUDIT_FIELD_LABELS.ownerId).toBe("audit.field.owner")

    const [change] = buildAuditFieldChanges(
      "deal",
      "updated",
      { stageId: { from: null, to: null } },
      resolution()
    )
    expect(change.label).toBe("audit.field.stage")
    expect(change.field).toBe("stageId")
  })

  it("falls back to a sentence-cased camelCase name for an unmapped column", () => {
    const [change] = buildAuditFieldChanges(
      "deal",
      "updated",
      { someNewColumn: { from: null, to: "x" } },
      resolution()
    )

    expect(change.label).toBe("Some new column")
  })

  it("documents the unmapped-column fallback as an unreachable path", () => {
    const source = readFileSync(new URL("./present.ts", import.meta.url), "utf8")
    expect(source).toMatch(/unreachable/i)
  })

  it("renders a custom field's user-authored name verbatim, unescaped", () => {
    const name = 'Contrato <script>alert("x")</script> & Cª'
    const res = resolution({
      customFieldNames: new Map([["def-1", name]]),
      customFieldTypes: new Map([["def-1", "text"]]),
      customFieldPositions: new Map([["def-1", 10000]]),
    })

    const [change] = buildAuditFieldChanges(
      "deal",
      "updated",
      { [`customFields.${name}`]: { from: null, to: "novo" } },
      res
    )

    // Byte-identical: React escapes text children downstream, and escaping here as well
    // would display the entity codes to the user.
    expect(change.label).toBe(name)
    expect(change.field).toBe("custom:def-1")
  })

  it("keeps a custom field whose definition is gone, labelled by its stored key", () => {
    const [change] = buildAuditFieldChanges(
      "deal",
      "updated",
      { "customFields.Removida": { from: "a", to: "b" } },
      resolution()
    )

    expect(change.label).toBe("Removida")
    expect(change.field).toBe("custom:Removida")
  })

  it("types a custom field by its definition type", () => {
    const res = resolution({
      customFieldNames: new Map([
        ["def-date", "Assinatura"],
        ["def-multi", "Setores"],
        ["def-bool", "Ativo"],
        ["def-num", "Peso"],
      ]),
      customFieldTypes: new Map([
        ["def-date", "date"],
        ["def-multi", "multi_select"],
        ["def-bool", "boolean"],
        ["def-num", "number"],
      ]),
      customFieldPositions: new Map([
        ["def-date", 10000],
        ["def-multi", 20000],
        ["def-bool", 30000],
        ["def-num", 40000],
      ]),
    })

    expect(valueOf("customFields.Assinatura", "2026-08-15T00:00:00.000Z", res)).toEqual({
      type: "date",
      iso: "2026-08-15T00:00:00.000Z",
      withTime: false,
    })
    expect(valueOf("customFields.Setores", ["Energia"], res)).toEqual({
      type: "list",
      items: ["Energia"],
    })
    expect(valueOf("customFields.Ativo", true, res)).toEqual({
      type: "boolean",
      value: true,
    })
    expect(valueOf("customFields.Peso", "12.5", res)).toEqual({
      type: "number",
      value: 12.5,
    })
  })
})

describe("field ordering", () => {
  const orderedResolution = resolution({
    customFieldNames: new Map([
      ["def-a", "Alpha"],
      ["def-b", "Beta"],
      ["def-c", "Gamma"],
    ]),
    customFieldTypes: new Map([
      ["def-a", "text"],
      ["def-b", "text"],
      ["def-c", "text"],
    ]),
    customFieldPositions: new Map([
      ["def-a", 20000],
      ["def-b", 10000],
      ["def-c", 30000],
    ]),
  })

  it("orders native columns by the label map, then custom fields by position", () => {
    const changes = buildAuditFieldChanges(
      "deal",
      "updated",
      {
        "customFields.Gamma": { from: null, to: "c" },
        ownerId: { from: null, to: null },
        "customFields.Beta": { from: null, to: "b" },
        title: { from: "a", to: "b" },
        "customFields.Alpha": { from: null, to: "a" },
      },
      orderedResolution
    )

    expect(fieldsOf(changes)).toEqual([
      "title",
      "ownerId",
      "custom:def-b",
      "custom:def-a",
      "custom:def-c",
    ])
  })

  it("produces the same order for the same input supplied in a different key order", () => {
    const first = buildAuditFieldChanges(
      "deal",
      "updated",
      {
        title: { from: "a", to: "b" },
        "customFields.Alpha": { from: null, to: "a" },
        stageId: { from: null, to: null },
        "customFields.Beta": { from: null, to: "b" },
      },
      orderedResolution
    )

    const second = buildAuditFieldChanges(
      "deal",
      "updated",
      {
        "customFields.Beta": { from: null, to: "b" },
        stageId: { from: null, to: null },
        "customFields.Alpha": { from: null, to: "a" },
        title: { from: "a", to: "b" },
      },
      orderedResolution
    )

    // Only the first three rows render by default. An order that depends on object key
    // insertion would show a different three on every render.
    expect(fieldsOf(first)).toEqual(fieldsOf(second))
    expect(fieldsOf(first)).toEqual(["title", "stageId", "custom:def-b", "custom:def-a"])
  })

  it("breaks a custom field position tie by ordering on the label", () => {
    const tied = resolution({
      customFieldNames: new Map([
        ["def-z", "Zulu"],
        ["def-y", "Alfa"],
      ]),
      customFieldTypes: new Map([
        ["def-z", "text"],
        ["def-y", "text"],
      ]),
      customFieldPositions: new Map([
        ["def-z", 10000],
        ["def-y", 10000],
      ]),
    })

    const changes = buildAuditFieldChanges(
      "deal",
      "updated",
      {
        "customFields.Zulu": { from: null, to: "z" },
        "customFields.Alfa": { from: null, to: "a" },
      },
      tied
    )

    expect(fieldsOf(changes)).toEqual(["custom:def-y", "custom:def-z"])
  })

  it("orders an unmapped native column after every mapped one and before custom fields", () => {
    const changes = buildAuditFieldChanges(
      "deal",
      "updated",
      {
        "customFields.Alpha": { from: null, to: "a" },
        zzUnmapped: { from: null, to: "u" },
        completedAt: { from: null, to: null },
      },
      orderedResolution
    )

    expect(fieldsOf(changes)).toEqual(["completedAt", "zzUnmapped", "custom:def-a"])
  })
})

describe("action semantics", () => {
  it("gives every change a null from on a created entry", () => {
    const changes = buildAuditFieldChanges(
      "deal",
      "created",
      {
        title: { from: undefined, to: "Contrato Tyr" },
        value: { from: undefined, to: "1000.00" },
      },
      resolution()
    )

    expect(changes).toHaveLength(2)
    for (const change of changes) {
      expect(change.from).toBeNull()
    }
    expect(changes[0].to).toEqual({ type: "text", value: "Contrato Tyr" })
  })

  it("keeps both sides on an updated entry", () => {
    const [change] = buildAuditFieldChanges(
      "deal",
      "updated",
      { title: { from: "Antigo", to: "Novo" } },
      resolution()
    )

    expect(change.from).toEqual({ type: "text", value: "Antigo" })
    expect(change.to).toEqual({ type: "text", value: "Novo" })
  })

  it("returns no changes at all on a deleted entry", () => {
    const changes = buildAuditFieldChanges(
      "deal",
      "deleted",
      {
        title: { from: "Contrato Tyr", to: undefined },
        ownerId: { from: UUID, to: undefined },
      },
      resolution()
    )

    // The UI-SPEC renders no <dl> for a delete: line 1 alone is the entry.
    expect(changes).toEqual([])
  })

  it("returns an empty array for an empty change map on every action", () => {
    for (const action of ["created", "updated", "deleted"] as AuditAction[]) {
      expect(buildAuditFieldChanges("deal", action, {}, resolution())).toEqual([])
    }
  })
})
