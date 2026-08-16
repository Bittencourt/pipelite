import { describe, it, expect } from "vitest"

import type { CrmEntityType, CrmEventPayload } from "@/lib/events/types"

import { IGNORED_COLUMNS, buildChanges, normaliseEventData } from "./diff"

/* -----------------------------------------------------------------------------------------
 * This file mocks NOTHING on purpose.
 *
 * The rest of the audit phase talks to `@/db`, which the suite mocks wholesale, so the
 * module under test is deliberately the only fully unit-testable piece of the capture path:
 * it imports `isFormulaWrapper` and types, and nothing else. If mocking ever becomes
 * necessary here, something impure has been added to `diff.ts` and that is the bug.
 * ----------------------------------------------------------------------------------------- */

/** A valid `CrmEventPayload`, so each case below reads as its own deviation. */
function payload(overrides: Partial<CrmEventPayload> = {}): CrmEventPayload {
  return {
    entity: "deal",
    entityId: "deal-1",
    action: "updated",
    data: {},
    changedFields: null,
    userId: "user-1",
    timestamp: "2026-08-15T12:00:00.000Z",
    ...overrides,
  }
}

/** The raw camelCase deal row, as every `src/lib/mutations/*.ts` site emits it. */
function dealRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "deal-1",
    title: "Contrato Tyr",
    value: "1000.00",
    stageId: "stage-1",
    organizationId: "org-1",
    personId: "person-1",
    ownerId: "user-1",
    position: "10000",
    expectedCloseDate: new Date("2026-09-01T00:00:00.000Z"),
    notes: null,
    customFields: { Origem: ["Outbound Manual"] },
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  }
}

/** The raw camelCase person row (the shape a mutation module pre-reads into `previous`). */
function personRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "person-1",
    firstName: "Ana",
    lastName: "Silva",
    email: "ana@old.example",
    phone: "+55 11 90000-0000",
    notes: null,
    organizationId: "org-1",
    ownerId: "user-1",
    customFields: { Origem: ["Outbound Manual"] },
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  }
}

describe("IGNORED_COLUMNS", () => {
  it("covers exactly the four columns that change without a user changing them", () => {
    // updatedAt differs on literally every write; position differs on every kanban reorder;
    // id and createdAt are immutable and would only ever be noise.
    expect([...IGNORED_COLUMNS].sort()).toEqual(["createdAt", "id", "position", "updatedAt"])
  })
})

describe("buildChanges - native columns", () => {
  it("diffs a changed native column into a single from/to entry", () => {
    const changes = buildChanges(
      payload({
        previous: dealRow(),
        data: dealRow({ title: "Contrato Tyr II" }),
      })
    )

    expect(changes).toEqual({
      title: { from: "Contrato Tyr", to: "Contrato Tyr II" },
    })
  })

  it("never reports id, createdAt, updatedAt or position, even when they all differ", () => {
    const changes = buildChanges(
      payload({
        previous: dealRow(),
        data: dealRow({
          position: "20000",
          updatedAt: new Date("2026-08-15T12:00:00.000Z"),
          createdAt: new Date("2020-01-01T00:00:00.000Z"),
          id: "deal-2",
        }),
      })
    )

    expect(changes).toEqual({})
  })

  it("returns an empty map when previous and data are identical, so no row is written", () => {
    expect(buildChanges(payload({ previous: dealRow(), data: dealRow() }))).toEqual({})
  })

  it("never uses changedFields as the key source", () => {
    // The people update route builds changedFields in camelCase and data in snake_case in
    // the SAME object literal, so the payload literally disagrees with itself. The diff is
    // the source of truth; changedFields is not consulted at all.
    const changes = buildChanges(
      payload({
        entity: "person",
        entityId: "person-1",
        changedFields: ["firstName"],
        previous: personRow(),
        data: personRow({ phone: "+55 11 91111-1111" }),
      })
    )

    expect(Object.keys(changes)).toEqual(["phone"])
    expect(changes.phone).toEqual({
      from: "+55 11 90000-0000",
      to: "+55 11 91111-1111",
    })
  })

  it("does not report a column the serializer omits, such as deletedAt, as a change", () => {
    // serializePerson/serializeDeal emit no deleted_at at all, while the pre-read row that
    // becomes `previous` always carries `deletedAt: null`. Treating "absent from data" as
    // "changed to undefined" would put a phantom deletedAt entry in every REST edit.
    const { deletedAt: _omitted, ...serverReportedRow } = personRow({
      email: "ana@new.example",
    })

    const changes = buildChanges(
      payload({
        entity: "person",
        entityId: "person-1",
        previous: personRow(),
        data: serverReportedRow,
      })
    )

    expect(Object.keys(changes)).toEqual(["email"])
  })
})

describe("buildChanges - custom fields", () => {
  it("excludes a formula-wrapped custom field that changed on both sides", () => {
    // Phase 34 recalculations are writes. A formula field moving because its input moved is
    // already represented by the input's own entry, so it must never reach the log.
    const changes = buildChanges(
      payload({
        previous: dealRow({
          customFields: { Margem: { formula: true, value: 42, error: null } },
        }),
        data: dealRow({
          customFields: { Margem: { formula: true, value: 99, error: null } },
        }),
      })
    )

    expect(changes).toEqual({})
  })

  it("excludes a custom field whose definition was flipped to formula-typed, wrapping only one side", () => {
    // Unwrapped `from` beside a wrapped `to`. Still derived noise, so the gate tests BOTH sides.
    const flippedToFormula = buildChanges(
      payload({
        previous: dealRow({ customFields: { Margem: 42 } }),
        data: dealRow({ customFields: { Margem: { formula: true, value: 42, error: null } } }),
      })
    )
    expect(flippedToFormula).toEqual({})

    const flippedFromFormula = buildChanges(
      payload({
        previous: dealRow({ customFields: { Margem: { formula: true, value: 42, error: null } } }),
        data: dealRow({ customFields: { Margem: 42 } }),
      })
    )
    expect(flippedFromFormula).toEqual({})
  })

  it("diffs a multi_select array normally instead of mistaking it for a formula wrapper", () => {
    // Every multi_select value in this database is an array; `'formula' in []` would be
    // evaluated against the array prototype chain if isFormulaWrapper lacked !Array.isArray.
    const changes = buildChanges(
      payload({
        previous: dealRow({ customFields: { Origem: ["Outbound Manual"] } }),
        data: dealRow({ customFields: { Origem: ["Outbound Manual", "Indicação"] } }),
      })
    )

    expect(changes).toEqual({
      "customFields.Origem": {
        from: ["Outbound Manual"],
        to: ["Outbound Manual", "Indicação"],
      },
    })
  })

  it("compares custom field values deeply, so key insertion order is not a change", () => {
    // JSONB round-trip key order is not stable. A JSON.stringify comparison would report
    // every custom field as changed on every save; this case goes red if anyone refactors
    // deep equality into a stringify.
    const changes = buildChanges(
      payload({
        previous: dealRow({
          customFields: {
            Endereco: { city: "São Paulo", zip: "01000-000" },
            Origem: ["Outbound Manual"],
          },
        }),
        data: dealRow({
          customFields: {
            Origem: ["Outbound Manual"],
            Endereco: { zip: "01000-000", city: "São Paulo" },
          },
        }),
      })
    )

    expect(changes).toEqual({})
  })

  it("reports a custom field key that disappeared as a clear", () => {
    // Unlike a native column, a custom_fields key is always written whole by the writer,
    // so a missing key really does mean the value was cleared.
    const changes = buildChanges(
      payload({
        previous: dealRow({ customFields: { Origem: ["Outbound Manual"] } }),
        data: dealRow({ customFields: {} }),
      })
    )

    expect(changes).toEqual({
      "customFields.Origem": { from: ["Outbound Manual"], to: undefined },
    })
  })
})

describe("normaliseEventData", () => {
  it("normalises serializePerson keys back to column names and drops the computed full_name", () => {
    const normalised = normaliseEventData("person", {
      id: "person-1",
      first_name: "Ana",
      last_name: "Silva",
      full_name: "Ana Silva",
      email: "ana@example.com",
      organization_id: "org-1",
      owner_id: "user-1",
      custom_fields: { Origem: ["Outbound Manual"] },
    })

    expect(normalised).toEqual({
      id: "person-1",
      firstName: "Ana",
      lastName: "Silva",
      email: "ana@example.com",
      organizationId: "org-1",
      ownerId: "user-1",
      customFields: { Origem: ["Outbound Manual"] },
    })
    // full_name is computed in serializePerson and never stored, so it can only be noise.
    expect("full_name" in normalised).toBe(false)
    expect("fullName" in normalised).toBe(false)
  })

  it("normalises serializeDeal keys back to column names", () => {
    const normalised = normaliseEventData("deal", {
      id: "deal-1",
      title: "Contrato Tyr",
      value: 1000,
      stage_id: "stage-1",
      organization_id: "org-1",
      person_id: "person-1",
      owner_id: "user-1",
      expected_close_date: "2026-09-01T00:00:00.000Z",
      custom_fields: {},
    })

    expect(normalised).toEqual({
      id: "deal-1",
      title: "Contrato Tyr",
      value: 1000,
      stageId: "stage-1",
      organizationId: "org-1",
      personId: "person-1",
      ownerId: "user-1",
      expectedCloseDate: "2026-09-01T00:00:00.000Z",
      customFields: {},
    })
  })

  it("normalises Date values to ISO strings so both casings compare in one representation", () => {
    // toIsoString runs on the snake_case sites only, so a date column can disagree in TYPE
    // as well as in key name.
    const normalised = normaliseEventData("deal", {
      expectedCloseDate: new Date("2026-09-01T00:00:00.000Z"),
    })

    expect(normalised.expectedCloseDate).toBe("2026-09-01T00:00:00.000Z")
  })

  it("leaves keys that are already in column form untouched, which makes it safe on both sides", () => {
    const row = { firstName: "Ana", customFields: { Origem: ["Outbound Manual"] } }
    expect(normaliseEventData("person", row)).toEqual(row)
  })

  it("is the identity for organization and activity, whose serializers never reach an emit site", () => {
    // 36-PATTERNS corrects 36-RESEARCH here: only serializePerson and serializeDeal ever
    // reach a crmBus.emit. Organizations and activities emit raw camelCase everywhere.
    const orgRow = { name: "Tyr", ownerId: "user-1", customFields: {} }
    expect(normaliseEventData("organization", orgRow)).toEqual(orgRow)

    const activityRow = { title: "Ligar", typeId: "type-1", dealId: "deal-1", completedAt: null }
    expect(normaliseEventData("activity", activityRow)).toEqual(activityRow)
  })
})

describe("buildChanges - payload casing", () => {
  it("normalises a snake_case person update against a camelCase previous row into a one-key map", () => {
    // PUT /api/v1/people/:id emits serializePerson(...) while the pre-read row is raw
    // camelCase. Without normalisation this one-field edit diffs as ~14 changed keys.
    const changes = buildChanges(
      payload({
        entity: "person",
        entityId: "person-1",
        action: "updated",
        changedFields: ["email"],
        previous: personRow(),
        data: {
          id: "person-1",
          first_name: "Ana",
          last_name: "Silva",
          full_name: "Ana Silva",
          email: "ana@new.example",
          phone: "+55 11 90000-0000",
          notes: null,
          organization_id: "org-1",
          owner_id: "user-1",
          custom_fields: { Origem: ["Outbound Manual"] },
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-08-15T12:00:00.000Z",
        },
      })
    )

    expect(Object.keys(changes)).toEqual(["email"])
    expect(changes.email).toEqual({ from: "ana@old.example", to: "ana@new.example" })
    expect("full_name" in changes).toBe(false)
    expect("first_name" in changes).toBe(false)
    expect("deletedAt" in changes).toBe(false)
  })

  it("normalises a snake_case deal payload built by serializeDeal into column-named keys", () => {
    const changes = buildChanges(
      payload({
        entity: "deal",
        entityId: "deal-1",
        action: "created",
        data: {
          id: "deal-1",
          title: "Contrato Tyr",
          value: 1000,
          stage_id: "stage-1",
          organization_id: "org-1",
          person_id: "person-1",
          owner_id: "user-1",
          position: 10000,
          expected_close_date: "2026-09-01T00:00:00.000Z",
          notes: null,
          custom_fields: { Origem: ["Outbound Manual"] },
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      })
    )

    expect(Object.keys(changes).sort()).toEqual([
      "customFields.Origem",
      "expectedCloseDate",
      "notes",
      "organizationId",
      "ownerId",
      "personId",
      "stageId",
      "title",
      "value",
    ])
    expect(changes.stageId).toEqual({ from: undefined, to: "stage-1" })
  })
})

describe("buildChanges - create and delete", () => {
  it("records the initial state on create, one entry per non-ignored key with an undefined from", () => {
    const changes = buildChanges(
      payload({
        action: "created",
        previous: undefined,
        data: dealRow(),
      })
    )

    expect(changes.title).toEqual({ from: undefined, to: "Contrato Tyr" })
    expect(changes.stageId).toEqual({ from: undefined, to: "stage-1" })
    expect(changes["customFields.Origem"]).toEqual({
      from: undefined,
      to: ["Outbound Manual"],
    })
    // Dates arrive as Date objects on a camelCase create and are recorded as ISO strings.
    expect(changes.expectedCloseDate).toEqual({
      from: undefined,
      to: "2026-09-01T00:00:00.000Z",
    })
    // Ignored columns stay ignored on a create too.
    expect("id" in changes).toBe(false)
    expect("position" in changes).toBe(false)
    expect("createdAt" in changes).toBe(false)
    expect("updatedAt" in changes).toBe(false)
    // Every entry is a genuine initial value.
    for (const change of Object.values(changes)) {
      expect(change.from).toBeUndefined()
    }
  })

  it("builds a delete tombstone from previous, because data is only the id", () => {
    // All seven delete emit sites send `{ id }` and nothing else. An implementation that
    // diffs `data` first produces a useless one-key map here and fails silently.
    const changes = buildChanges(
      payload({
        action: "deleted",
        previous: dealRow(),
        data: { id: "deal-1" },
      })
    )

    expect(changes.title).toEqual({ from: "Contrato Tyr", to: undefined })
    expect(changes.stageId).toEqual({ from: "stage-1", to: undefined })
    expect(changes["customFields.Origem"]).toEqual({
      from: ["Outbound Manual"],
      to: undefined,
    })
    expect("id" in changes).toBe(false)
    for (const change of Object.values(changes)) {
      expect(change.to).toBeUndefined()
    }
  })

  it("excludes formula-derived values from a delete tombstone as well", () => {
    const changes = buildChanges(
      payload({
        action: "deleted",
        previous: dealRow({
          customFields: {
            Origem: ["Outbound Manual"],
            Margem: { formula: true, value: 42, error: null },
          },
        }),
        data: { id: "deal-1" },
      })
    )

    expect(changes["customFields.Origem"]).toEqual({
      from: ["Outbound Manual"],
      to: undefined,
    })
    expect("customFields.Margem" in changes).toBe(false)
  })
})
