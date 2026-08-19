import { describe, it, expect } from "vitest"

import type { AuditResolution } from "@/lib/audit/present"

import {
  MERGE_EXCLUDED_COLUMNS,
  buildMergeFieldGroups,
  isEmptyMergeValue,
  type MergeField,
  type MergeFieldGroups,
} from "./field-groups"

/* -----------------------------------------------------------------------------------------
 * This file mocks NOTHING, following `src/lib/audit/present.test.ts`.
 *
 * `buildMergeFieldGroups` is pure and takes its database-derived knowledge as an
 * `AuditResolution`, exactly as `buildAuditFieldChanges` does. If mocking ever becomes
 * necessary here, something impure has been added to `field-groups.ts` and that is the bug.
 *
 * What is under test is 39-UI-SPEC M-3: which of the three merge sections a field lands in.
 * 39-VALIDATION names the default that follows from this partition "the phase's
 * highest-consequence silent default", and the partition is half of it - a field that never
 * reaches `conflicts` is never asked about, and a field that reaches `filledOnly` adopts a
 * value from the record being destroyed.
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

function groupsOf(
  survivor: Record<string, unknown>,
  loser: Record<string, unknown>,
  res: AuditResolution = resolution()
): MergeFieldGroups {
  return buildMergeFieldGroups({
    entityType: "organization",
    survivor,
    loser,
    resolution: res,
  })
}

function keysOf(fields: MergeField[]): string[] {
  return fields.map((field) => field.key)
}

/** Every key the partition placed anywhere, in group order. */
function allKeys(groups: MergeFieldGroups): string[] {
  return [...keysOf(groups.conflicts), ...keysOf(groups.filledOnly), ...keysOf(groups.identical)]
}

const CNPJ_DEFINITION = "0f0ad0e1-a1cc-4c2f-9a3d-1c2e4b6a8d10"
const SEGMENT_DEFINITION_A = "2b7f5c31-9e44-4f0a-8b21-77c9d3e5a1f4"
const SEGMENT_DEFINITION_B = "6d81aa02-3c17-4e9b-9f55-0ab2c4d6e8f9"

describe("isEmptyMergeValue", () => {
  it("treats null, undefined, the empty string, whitespace and an empty array as empty", () => {
    expect(isEmptyMergeValue(null)).toBe(true)
    expect(isEmptyMergeValue(undefined)).toBe(true)
    expect(isEmptyMergeValue("")).toBe(true)
    expect(isEmptyMergeValue("   ")).toBe(true)
    expect(isEmptyMergeValue([])).toBe(true)
  })

  it("treats a populated value as populated, including `false` and `0`", () => {
    expect(isEmptyMergeValue("Acme")).toBe(false)
    expect(isEmptyMergeValue(0)).toBe(false)
    expect(isEmptyMergeValue(false)).toBe(false)
    expect(isEmptyMergeValue(["a"])).toBe(false)
  })
})

describe("buildMergeFieldGroups", () => {
  it("Test 1: puts a field both records populate differently into `conflicts`", () => {
    const groups = groupsOf({ name: "Acme Ltda" }, { name: "ACME Comercio Ltda" })

    expect(keysOf(groups.conflicts)).toEqual(["name"])
    expect(groups.conflicts[0].survivorValue).toBe("Acme Ltda")
    expect(groups.conflicts[0].loserValue).toBe("ACME Comercio Ltda")
    expect(keysOf(groups.filledOnly)).toEqual([])
    expect(keysOf(groups.identical)).toEqual([])
  })

  it("Test 2: puts a field the survivor is empty on and the loser populates into `filledOnly`", () => {
    const groups = groupsOf({ website: null }, { website: "https://acme.com.br" })

    expect(keysOf(groups.filledOnly)).toEqual(["website"])
    expect(groups.filledOnly[0].survivorValue).toBeNull()
    expect(groups.filledOnly[0].loserValue).toBe("https://acme.com.br")
    expect(keysOf(groups.conflicts)).toEqual([])
  })

  it("Test 3: puts a field the survivor populates and the loser is empty on into `identical`, never `conflicts`", () => {
    const groups = groupsOf({ website: "https://acme.com.br" }, { website: null })

    expect(keysOf(groups.identical)).toEqual(["website"])
    expect(keysOf(groups.conflicts)).toEqual([])
    expect(keysOf(groups.filledOnly)).toEqual([])
  })

  it("Test 4: counts a field both records leave empty as `identical`", () => {
    const groups = groupsOf({ website: null }, { website: null })

    expect(keysOf(groups.identical)).toEqual(["website"])
    expect(keysOf(groups.conflicts)).toEqual([])
    expect(keysOf(groups.filledOnly)).toEqual([])
  })

  it("Test 5: counts an equal non-empty value as `identical`", () => {
    const groups = groupsOf({ name: "Acme Ltda" }, { name: "Acme Ltda" })

    expect(keysOf(groups.identical)).toEqual(["name"])
    expect(keysOf(groups.conflicts)).toEqual([])
  })

  it("Test 6: treats \"\", whitespace, null and undefined as one another's equals, never a conflict", () => {
    const groups = groupsOf(
      { website: "", phone: "   ", industry: null, email: undefined },
      { website: null, phone: undefined, industry: "", email: "   " }
    )

    expect(keysOf(groups.conflicts)).toEqual([])
    expect(keysOf(groups.filledOnly)).toEqual([])
    expect(keysOf(groups.identical).sort()).toEqual(["email", "industry", "phone", "website"])
  })

  it("Test 7: puts a differing custom field into `conflicts`, labelled through the audit descriptor", () => {
    const res = resolution({
      customFieldNames: new Map([[CNPJ_DEFINITION, "CNPJ / CPF"]]),
      customFieldPositions: new Map([[CNPJ_DEFINITION, 3]]),
    })

    const groups = groupsOf(
      { customFields: { "CNPJ / CPF": "11.111.111/0001-11" } },
      { customFields: { "CNPJ / CPF": "22.222.222/0001-22" } },
      res
    )

    expect(keysOf(groups.conflicts)).toEqual(["customFields.CNPJ / CPF"])
    // VERBATIM the user-authored definition name, resolved by `describeField` - not a literal
    // in this module and not a second label map (39-UI-SPEC M-4).
    expect(groups.conflicts[0].label).toBe("CNPJ / CPF")
    expect(groups.conflicts[0].survivorValue).toBe("11.111.111/0001-11")
    expect(groups.conflicts[0].loserValue).toBe("22.222.222/0001-22")
  })

  it("Test 8: emits exactly ONE field when two definitions share a custom field name", () => {
    // The live database holds TWO `custom_field_definitions` rows named `Segmento Organização`
    // for `entity_type='organization'`. `customFields` is keyed by NAME, so both address one
    // blob key and the user must be asked about it once.
    const res = resolution({
      customFieldNames: new Map([
        [SEGMENT_DEFINITION_A, "Segmento Organização"],
        [SEGMENT_DEFINITION_B, "Segmento Organização"],
      ]),
      customFieldPositions: new Map([
        [SEGMENT_DEFINITION_A, 5],
        [SEGMENT_DEFINITION_B, 9],
      ]),
    })

    const groups = groupsOf(
      { customFields: { "Segmento Organização": "Industria" } },
      { customFields: { "Segmento Organização": "Comercio" } },
      res
    )

    expect(keysOf(groups.conflicts)).toEqual(["customFields.Segmento Organização"])
    expect(allKeys(groups)).toHaveLength(1)
  })

  it("Test 9: orders native columns by the audit ranking, then unmapped columns, then custom fields", () => {
    const res = resolution({
      customFieldNames: new Map([[CNPJ_DEFINITION, "CNPJ / CPF"]]),
      customFieldPositions: new Map([[CNPJ_DEFINITION, 3]]),
    })

    const groups = groupsOf(
      {
        website: "https://a.example",
        customFields: { "CNPJ / CPF": "11.111.111/0001-11" },
        address: "Rua A, 1",
        name: "Acme A",
      },
      {
        website: "https://b.example",
        customFields: { "CNPJ / CPF": "22.222.222/0001-22" },
        address: "Rua B, 2",
        name: "Acme B",
      },
      res
    )

    // `name` (rank 1 in the audit label map) before `website` (rank 6), then the unmapped
    // native column, then the custom field. Full order, not membership.
    expect(keysOf(groups.conflicts)).toEqual([
      "name",
      "website",
      "address",
      "customFields.CNPJ / CPF",
    ])
  })

  it("Test 10: never surfaces an excluded column, while still surfacing a real one", () => {
    const res = resolution({
      customFieldNames: new Map([[CNPJ_DEFINITION, "CNPJ / CPF"]]),
      customFieldPositions: new Map([[CNPJ_DEFINITION, 3]]),
    })

    const groups = groupsOf(
      {
        id: "1e4e2f2b-1111-4a2a-9c3d-000000000001",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-02-01T00:00:00.000Z"),
        deletedAt: null,
        ownerId: "1e4e2f2b-2222-4a2a-9c3d-000000000002",
        name: "Acme A",
        customFields: { "CNPJ / CPF": "11.111.111/0001-11" },
      },
      {
        id: "1e4e2f2b-1111-4a2a-9c3d-000000000003",
        createdAt: new Date("2023-01-01T00:00:00.000Z"),
        updatedAt: new Date("2023-02-01T00:00:00.000Z"),
        deletedAt: null,
        ownerId: "1e4e2f2b-2222-4a2a-9c3d-000000000004",
        name: "Acme B",
        customFields: { "CNPJ / CPF": "22.222.222/0001-22" },
      },
      res
    )

    const surfaced = allKeys(groups)

    for (const excluded of ["id", "createdAt", "updatedAt", "deletedAt", "ownerId", "customFields"]) {
      expect(surfaced).not.toContain(excluded)
    }
    // Anti-vacuity: the assertion above must not be answered by an empty result.
    expect(surfaced).toContain("name")
    expect(surfaced).toContain("customFields.CNPJ / CPF")
    expect(surfaced).toHaveLength(2)
  })

  it("keeps the excluded set frozen and complete", () => {
    expect([...MERGE_EXCLUDED_COLUMNS].sort()).toEqual([
      "createdAt",
      "customFields",
      "deletedAt",
      "id",
      "ownerId",
      "updatedAt",
    ])
    expect(Object.isFrozen(MERGE_EXCLUDED_COLUMNS)).toBe(true)
  })

  it("does not mutate either record", () => {
    const survivor = { name: "Acme A", customFields: { "CNPJ / CPF": "1" } }
    const loser = { name: "Acme B", customFields: { "CNPJ / CPF": "2" } }
    const survivorBefore = JSON.stringify(survivor)
    const loserBefore = JSON.stringify(loser)

    groupsOf(survivor, loser)

    expect(JSON.stringify(survivor)).toBe(survivorBefore)
    expect(JSON.stringify(loser)).toBe(loserBefore)
  })
})
