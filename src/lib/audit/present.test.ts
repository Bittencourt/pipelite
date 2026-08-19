import { readFileSync } from "node:fs"

import { describe, it, expect } from "vitest"

import type { AuditAction, AuditFieldChange, AuditValue } from "@/lib/timeline/types"

import {
  AUDIT_FIELD_LABELS,
  AUDIT_MARKER_PREFIX,
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

  it("documents which columns actually reach the unmapped-column fallback", () => {
    // RAW, not comment-stripped, and deliberately so: the doc comment IS what is under test.
    // The fallback used to assert it could never be reached; `deletedAt` reaches it on every
    // restore, which is how a user came to be reading a database identifier in the timeline.
    // A reader who believed that claim would look for the soft-delete sentence in the label map
    // above and conclude it was missing, rather than that it lives in the renderer by necessity.
    const source = readFileSync(new URL("./present.ts", import.meta.url), "utf8")

    expect(
      /THIS PATH SHOULD BE UNREACHABLE/.test(source),
      "present.ts must not claim the unmapped-column fallback is unreachable. It is reached, by `deletedAt`, on every soft delete and every restore — the claim is what let a raw column name ship to a user for the whole of phases 36-38"
    ).toBe(false)

    expect(
      source,
      "the rewritten comment must NAME deletedAt as the column that reaches the fallback. A comment corrected only to the extent of dropping the false claim leaves the next reader exactly where the false one did"
    ).toContain("deletedAt")

    expect(
      source,
      "the rewritten comment must point at src/components/timeline/audit-entry.tsx, where the soft-delete sentence is chosen. AUDIT_FIELD_LABELS holds ONE key per column and `describeField` never sees the from/to pair, so a direction cannot be expressed in this module and the pointer is the only way a reader of this file finds the decision"
    ).toContain("audit-entry.tsx")
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

/**
 * Every key of `AUDIT_FIELD_LABELS`, in the insertion order it carried when this guard was
 * checked in (45-06).
 *
 * THIS ARRAY IS NOT A DUPLICATE OF THE `labels` DESCRIBE ABOVE. That block asserts the map's
 * CONTENTS with `toEqual`, which compares objects by key/value and is entirely blind to order.
 * This one asserts ORDER, and order is the load-bearing property: `NATIVE_ORDER` is built from
 * `Object.keys(AUDIT_FIELD_LABELS)` and its index becomes each native column's `rank`, which is
 * the display order of native fields in EVERY record timeline in the app — deals, people,
 * organizations and activities alike, on the four Phase 35/36/37 surfaces that share the
 * component. Only the first three rows render before the disclosure, so a reordering silently
 * changes which three fields a reader sees first and nothing else in the suite would notice.
 */
const NATIVE_ORDER_PREFIX = [
  "title",
  "name",
  "firstName",
  "lastName",
  "email",
  "phone",
  "website",
  "industry",
  "defaultCurrency",
  "value",
  "stageId",
  "expectedCloseDate",
  "organizationId",
  "personId",
  "dealId",
  "ownerId",
  "assigneeId",
  "typeId",
  "dueDate",
  "completedAt",
]

describe("the native display order", () => {
  it("appends new columns rather than inserting them", () => {
    expect(
      Object.keys(AUDIT_FIELD_LABELS).slice(0, NATIVE_ORDER_PREFIX.length),
      "the first 20 keys of AUDIT_FIELD_LABELS must still be in their checked-in order. NATIVE_ORDER is derived from this object's INSERTION ORDER (present.ts, immediately below the map) and that index is the display order of native columns in every record timeline; inserting a key rather than appending one silently reorders every timeline in the app, and because only the first three rows render collapsed it changes which fields a reader sees at all. A new column goes at the END"
    ).toEqual(NATIVE_ORDER_PREFIX)
  })

  it("still derives that order from the map rather than from a second list", () => {
    // Anti-vacuity for the guard above: if the map were emptied or renamed, `slice(0, 20)` of
    // nothing would be `[]` and would not equal the prefix — but a map that GREW a 21st key
    // still passes, which is the point. The guard defends the prefix, never the length.
    expect(
      Object.keys(AUDIT_FIELD_LABELS).length,
      "AUDIT_FIELD_LABELS must have at least as many keys as the pinned prefix, or the order guard above would be comparing against a truncated slice"
    ).toBeGreaterThanOrEqual(NATIVE_ORDER_PREFIX.length)
  })
})

/* -----------------------------------------------------------------------------------------
 * THE SOFT-DELETE COLUMN (45-06)
 *
 * `deletedAt` is audited but is deliberately ABSENT from `AUDIT_FIELD_LABELS`: that map is one
 * message key per column, and a `deleted_at` transition needs two — which direction it went.
 * The sentence is therefore chosen in `src/components/timeline/audit-entry.tsx`, where the
 * from/to pair is in hand, and gated by
 * `src/components/timeline/__tests__/deleted-at-wiring.test.ts`.
 *
 * What belongs HERE is the half that is a pure function: how the stored value is TYPED. Before
 * this plan `nativeKind("deletedAt")` returned `"auto"`, `inferValue` saw a string, and the row
 * rendered the raw ISO instant verbatim. Classifying it as a date is defence in depth — the
 * renderer no longer prints the value at all, but any future path that does will format it in
 * the viewer's locale rather than hand them a database representation.
 * ----------------------------------------------------------------------------------------- */
describe("the soft-delete column", () => {
  it("types a stored deleted_at as a date carrying its time of day", () => {
    expect(
      valueOf("deletedAt", "2026-08-18T13:45:00.000Z"),
      'deletedAt must resolve to a `date` value with withTime true. Untyped it falls to inferValue, which sees a string and returns { type: "text" } — that is literally the raw ISO instant reaching the screen, and a moment of deletion without its time of day is not a useful fact'
    ).toEqual({ type: "date", iso: "2026-08-18T13:45:00.000Z", withTime: true })
  })

  it("still reports a cleared deleted_at as empty rather than as a date", () => {
    // The restore direction. `null` is an absence in every column, and the date classification
    // must not turn one into an invented instant.
    expect(
      valueOf("deletedAt", null),
      "a cleared deleted_at must stay an `empty` value: it is what the renderer branches on to tell a restore from a soft delete"
    ).toEqual({ type: "empty" })
  })

  it("keeps deletedAt out of the label map, so no single key claims a direction", () => {
    expect(
      AUDIT_FIELD_LABELS.deletedAt,
      "deletedAt must NOT have an entry in AUDIT_FIELD_LABELS. One column maps to one key there and `describeField` emits one label with no sight of the from/to pair, so any entry would state a single direction for a transition that has two — and the entry would also take a rank in NATIVE_ORDER"
    ).toBeUndefined()
  })

  it("orders deletedAt after every mapped native column, as an unmapped one", () => {
    const changes = buildAuditFieldChanges(
      "deal",
      "updated",
      {
        deletedAt: { from: "2026-08-18T13:45:00.000Z", to: null },
        title: { from: "Antigo", to: "Novo" },
      },
      resolution()
    )

    expect(
      fieldsOf(changes),
      "an unmapped native column sorts after every mapped one (group 1 vs group 0), so leaving deletedAt out of the label map costs it no position it would otherwise have held"
    ).toEqual(["title", "deletedAt"])
  })
})

/* -----------------------------------------------------------------------------------------
 * THE RESERVED MARKER PREFIX (39-12)
 *
 * A `__`-prefixed key in a stored change map is a statement about the CHANGE, not about a
 * FIELD: `__purge` (Phase 37) distinguishes a purge from a soft delete, and the `__merged*`
 * family (Phase 39, `MERGE_MARKER_KEYS` in `src/lib/mutations/dedup.ts`) carries the losing
 * record's id, its display name and the number of child rows reparented.
 *
 * The convention had never needed ENFORCING here, because the only action carrying a marker was
 * `deleted` and `buildAuditFieldChanges` returns `[]` for it before the loop is ever reached.
 * `merged` breaks that: it DOES render its field list (39-UI-SPEC A-5), so an unfiltered marker
 * becomes a field row labelled by `humaniseColumn` — a user reading a sentence-cased marker name
 * beside a raw record id, which is the same class of defect 45-06 removed for `deletedAt`.
 *
 * The rule asserted below is GENERAL, not a `merged` special case: a marker on an `updated` row
 * is skipped too, and a key that merely CONTAINS a double underscore is not.
 * ----------------------------------------------------------------------------------------- */
describe("the reserved marker prefix", () => {
  const LOSER = "8c2d1f4a-6b3e-4d59-a0f7-2e9c8b1d4a70"

  /** The exact shape `mergeRecordsMutation` writes on the SURVIVOR's row (39-09, dedup.ts:505). */
  function survivorMergeChanges(): Record<string, { from: unknown; to: unknown }> {
    return {
      name: { from: "Tyr Energia Ltda", to: "Tyr Energia" },
      __mergedFrom: { from: LOSER, to: null },
      __mergedFromName: { from: "Tyr Energia Ltda (dup)", to: null },
      __mergedChildren: { from: null, to: 7 },
    }
  }

  it("exports the prefix as the two-character string the mutations already write", () => {
    expect(
      AUDIT_MARKER_PREFIX,
      'AUDIT_MARKER_PREFIX must be exactly "__". Both marker families already in the database are spelled that way (`__purge` since Phase 37, the merge markers since Phase 39); a different value here would silently stop matching every row already written'
    ).toBe("__")
  })

  it("returns only the real field for a merged entry carrying three markers", () => {
    const changes = buildAuditFieldChanges(
      "organization",
      "merged",
      survivorMergeChanges(),
      resolution()
    )

    expect(
      changes,
      "a merged entry with one real change and three markers must produce exactly ONE field row. Each unfiltered marker becomes a row labelled by humaniseColumn: one beside a raw record id, one beside the loser's name, and one beside a count the entry already states in its own sentence (A-7)"
    ).toHaveLength(1)

    expect(
      fieldsOf(changes),
      "the surviving row must be the real column, not whichever marker happened to sort first. Asserting the identity as well as the length is what stops this test passing over an empty array"
    ).toEqual(["name"])
  })

  it("skips a marker on an updated entry too, so the rule is general", () => {
    // `__purge` rides on a `deleted` action today, which never reaches the loop. Asserting it
    // against `updated` proves the filter is a rule about the PREFIX rather than a carve-out for
    // the merge, so the next mutation that invents a marker inherits the behaviour.
    const changes = buildAuditFieldChanges(
      "organization",
      "updated",
      {
        name: { from: "Antigo", to: "Novo" },
        __purge: { from: null, to: true },
      },
      resolution()
    )

    expect(
      fieldsOf(changes),
      "the marker filter must apply to every action that renders a field list, not only to `merged`. A prefix rule enforced for one action is not a convention, it is a special case wearing one"
    ).toEqual(["name"])
  })

  it("keeps a key that merely contains a double underscore", () => {
    const changes = buildAuditFieldChanges(
      "deal",
      "updated",
      { custom__field: { from: "a", to: "b" } },
      resolution()
    )

    expect(
      fieldsOf(changes),
      '`startsWith`, never `includes`. A column or a user-authored field name containing a double underscore anywhere but the start is ordinary history, and dropping it would be an audit surface quietly omitting a change — the worst failure available on this screen'
    ).toEqual(["custom__field"])
  })

  it("returns an empty list for a merged entry that is nothing but markers", () => {
    const onlyMarkers = survivorMergeChanges()
    delete onlyMarkers.name

    expect(
      buildAuditFieldChanges("organization", "merged", onlyMarkers, resolution()),
      "a merge where the survivor won every field records no real change, and the result must be [] rather than three marker rows. This is the case that makes audit-entry.tsx's mergedNoFieldChanges branch (A-6) reachable at all"
    ).toEqual([])
  })

  it("leaves the deleted and created rules exactly as 45-06 left them", () => {
    expect(
      buildAuditFieldChanges("organization", "deleted", survivorMergeChanges(), resolution()),
      "`deleted` must still short-circuit to [] before the loop. The marker filter is an addition to the loop, not a replacement for that early return, and the UI-SPEC draws no field list for a delete"
    ).toEqual([])

    const created = buildAuditFieldChanges(
      "organization",
      "created",
      { name: { from: "should be dropped", to: "Tyr" }, __purge: { from: null, to: true } },
      resolution()
    )

    expect(created, "the marker must be skipped on `created` as well").toHaveLength(1)
    expect(
      created[0].from,
      "`created` must still force every `from` to null. A create is an initial state and an arrow drawn from nothing would be a fiction — the marker filter must not have moved that decision"
    ).toBeNull()
  })
})
