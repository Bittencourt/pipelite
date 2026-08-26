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
    // The three `norm*` entries joined in 39-09: they are GENERATED ALWAYS columns from
    // migration 0017, so a merge that offered them would both ask a meaningless question and
    // raise SQLSTATE 428C9 on the survivor UPDATE. `dedup.test.ts` holds the drift alarm that
    // ties this list to the tables' actual generated columns — a list this file cannot see
    // without importing the schema, which its own header forbids.
    expect([...MERGE_EXCLUDED_COLUMNS].sort()).toEqual([
      "createdAt",
      "customFields",
      "deletedAt",
      "id",
      "normEmail",
      "normName",
      "normPhone",
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

/* -----------------------------------------------------------------------------------------
 * CR-02 — a file value is not a compared merge field
 * ----------------------------------------------------------------------------------------- */

const ANEXOS_DEFINITION = "9c4e1b77-2a58-4d31-b0e6-5f7a8c9d0e1b"

/** A descriptor in exactly the shape `src/app/api/upload/route.ts:102-110` writes. */
function fileDescriptor(entityId: string, storedName: string) {
  return {
    id: storedName.replace(/\.[^.]+$/, ""),
    filename: "Contrato assinado.pdf",
    storedName,
    path: `/app/uploads/${entityId}/Anexos/${storedName}`,
    publicUrl: `/api/files/${entityId}/Anexos/${storedName}`,
    size: 4096,
    mimeType: "application/pdf",
  }
}

const LOSER_FILE = fileDescriptor("org-B", "b1.pdf")
const SURVIVOR_FILE = fileDescriptor("org-A", "a1.pdf")

describe("buildMergeFieldGroups — CR-02: a file value is refused as a compared field", () => {
  it("offers the key in NO group when only the loser holds files — the filledOnly default case", () => {
    const groups = groupsOf(
      { name: "Acme", customFields: {} },
      { name: "Acme", customFields: { Anexos: [LOSER_FILE] } }
    )

    // The whole point: not in `filledOnly` (whose default is the LOSER), and not anywhere else
    // either — `applyMergeChoices` writes exactly the keys these groups name.
    expect(allKeys(groups)).not.toContain("customFields.Anexos")
    // ANCHOR: the partition still ran and still saw a key. Without this the assertion above
    // would pass on an empty partition.
    expect(allKeys(groups)).toContain("name")
  })

  it("offers the key in NO group when only the survivor holds files", () => {
    const groups = groupsOf(
      { name: "Acme", customFields: { Anexos: [SURVIVOR_FILE] } },
      { name: "Acme", customFields: {} }
    )

    expect(allKeys(groups)).not.toContain("customFields.Anexos")
    expect(allKeys(groups)).toContain("name")
  })

  it("offers the key in NO group when BOTH hold different files — the conflicts case", () => {
    const groups = groupsOf(
      { name: "Acme", customFields: { Anexos: [SURVIVOR_FILE] } },
      { name: "Acme", customFields: { Anexos: [LOSER_FILE] } }
    )

    expect(keysOf(groups.conflicts)).not.toContain("customFields.Anexos")
    expect(allKeys(groups)).not.toContain("customFields.Anexos")
    expect(allKeys(groups)).toContain("name")
  })

  it("refuses a MIXED array — one descriptor beside one string is a corrupted blob, not a list", () => {
    // `.some(isFileDescriptor)`, not `.every`. `.every` would wave this through and let the
    // descriptor cross onto the survivor.
    const groups = groupsOf(
      { name: "Acme", customFields: {} },
      { name: "Acme", customFields: { Anexos: ["Inbound", LOSER_FILE] } }
    )

    expect(allKeys(groups)).not.toContain("customFields.Anexos")
  })

  /**
   * THE ANTI-VACUITY CONTROL, and it is the one that decided the shape of the fix.
   *
   * `mergeRecordsMutation` calls `buildMergeFieldGroups` with a DELIBERATELY EMPTY
   * `AuditResolution` (`src/lib/mutations/dedup.ts:309-320`), while the merge SCREEN passes a real
   * one. An exclusion keyed on the definition TYPE — which is the obvious fix, and the one the
   * review suggested — would therefore fire on the screen and never in the mutation: the picker
   * would stop offering the field while the mutation went on writing it from its `filledOnly`
   * default.
   *
   * So both cells below are the SAME assertion under the two resolutions the two call sites
   * actually pass. A type-based implementation makes the first one red.
   */
  it("excludes the key with an EMPTY resolution — the mutation's call shape", () => {
    const groups = groupsOf(
      { name: "Acme", customFields: {} },
      { name: "Acme", customFields: { Anexos: [LOSER_FILE] } },
      resolution()
    )

    expect(groups.conflicts.length + groups.filledOnly.length + groups.identical.length)
      .toBeGreaterThan(0)
    expect(allKeys(groups)).not.toContain("customFields.Anexos")
  })

  it("excludes the key with a FULLY POPULATED resolution — the screen's call shape", () => {
    const res = resolution({
      customFieldNames: new Map([[ANEXOS_DEFINITION, "Anexos"]]),
      customFieldTypes: new Map([[ANEXOS_DEFINITION, "file"]]),
      customFieldPositions: new Map([[ANEXOS_DEFINITION, 3]]),
    })

    const groups = groupsOf(
      { name: "Acme", customFields: {} },
      { name: "Acme", customFields: { Anexos: [LOSER_FILE] } },
      res
    )

    expect(allKeys(groups)).not.toContain("customFields.Anexos")
  })

  it("still compares a multi_select array — the exclusion is not 'any array'", () => {
    // A `multi_select` stores strings and can never satisfy `isFileDescriptor`. If this key were
    // excluded too, the fix would be silently dropping every list-valued custom field from every
    // merge — a far larger regression than the one it fixes, and invisible without this cell.
    const groups = groupsOf(
      { name: "Acme", customFields: { Origem: [] } },
      { name: "Acme", customFields: { Origem: ["Inbound", "Indicação"] } }
    )

    expect(keysOf(groups.filledOnly)).toContain("customFields.Origem")
  })

  it("still compares a plain object custom value — the exclusion is not 'any object array'", () => {
    // A JSON-ish custom field holding an array of plain objects with no `filename` is not a file
    // value. If this were excluded the fix would be dropping arbitrary structured custom fields
    // from every merge.
    const groups = groupsOf(
      { name: "Acme", customFields: { Meta: [] } },
      { name: "Acme", customFields: { Meta: [{ k: "v" }] } }
    )

    expect(keysOf(groups.filledOnly)).toContain("customFields.Meta")
  })

  it("still compares a file-typed key while BOTH sides are empty — nothing can move", () => {
    // `null` / `[]` is the field being empty and says nothing about its type. Such a key falls
    // through to the ordinary partitioning and lands in `identical`, where `applyMergeChoices`
    // writes the survivor's own empty value. Pinned so a future widening of the predicate to
    // "anything a file definition names" is a visible decision rather than a side effect.
    const groups = groupsOf(
      { name: "Acme", customFields: { Anexos: null } },
      { name: "Acme", customFields: { Anexos: [] } }
    )

    expect(keysOf(groups.identical)).toContain("customFields.Anexos")
  })
})

/* -----------------------------------------------------------------------------------------
 * WR-01 — a stored formula result is not a compared merge field
 * ----------------------------------------------------------------------------------------- */

const SCORE_DEFINITION = "5a1c9e04-7b62-4a18-9c3f-2d4e6f8a0b1c"

/** The persisted shape `recalculateFormulas` writes: `{ formula: true, value, error }`. */
const SURVIVOR_SCORE = { formula: true, value: 20, error: null }
const LOSER_SCORE = { formula: true, value: 84, error: null }

describe("buildMergeFieldGroups — WR-01: a stored formula result is refused as a compared field", () => {
  it("offers the key in NO group when only the LOSER holds a formula value", () => {
    // The reviewer's scenario, and it needs no click: a formula definition added after the
    // survivor's last save leaves it with no key, so the key would land in `filledOnly` whose
    // default is the LOSER.
    const groups = groupsOf(
      { name: "Acme", customFields: { Receita: 10 } },
      { name: "Acme", customFields: { Receita: 42, Score: LOSER_SCORE } }
    )

    expect(allKeys(groups)).not.toContain("customFields.Score")
    // ANCHORS: the INPUT is still compared — the fix must not silently stop the merge asking about
    // the values a formula READS — and the partition still ran.
    expect(allKeys(groups)).toContain("customFields.Receita")
    expect(allKeys(groups)).toContain("name")
  })

  it("offers the key in NO group when BOTH hold formula values — so no choice map can set one", () => {
    const groups = groupsOf(
      { name: "Acme", customFields: { Receita: 10, Score: SURVIVOR_SCORE } },
      { name: "Acme", customFields: { Receita: 42, Score: LOSER_SCORE } }
    )

    expect(keysOf(groups.conflicts)).not.toContain("customFields.Score")
    expect(allKeys(groups)).not.toContain("customFields.Score")
    expect(keysOf(groups.conflicts)).toContain("customFields.Receita")
  })

  it("offers the key in NO group when only the SURVIVOR holds a formula value", () => {
    const groups = groupsOf(
      { name: "Acme", customFields: { Score: SURVIVOR_SCORE } },
      { name: "Acme", customFields: {} }
    )

    expect(allKeys(groups)).not.toContain("customFields.Score")
    expect(allKeys(groups)).toContain("name")
  })

  it("refuses an ERRORED wrapper too — `{ formula: true, value: null, error }`", () => {
    // An errored wrapper is still a server-derived value. Adopting the loser's error message onto
    // the survivor would report a failure that never happened on the survivor's own inputs.
    const groups = groupsOf(
      { name: "Acme", customFields: {} },
      {
        name: "Acme",
        customFields: { Score: { formula: true, value: null, error: "Unknown field: Receita" } },
      }
    )

    expect(allKeys(groups)).not.toContain("customFields.Score")
  })

  /**
   * THE SAME PAIR OF RESOLUTIONS AS THE CR-02 CELLS, for the same reason. The mutation passes an
   * EMPTY `AuditResolution` and the screen passes a real one, so an exclusion keyed on
   * `descriptor.kind` would fire on one and not the other. Both cells assert the same thing.
   */
  it("excludes the key with an EMPTY resolution — the mutation's call shape", () => {
    const groups = groupsOf(
      { name: "Acme", customFields: { Receita: 10 } },
      { name: "Acme", customFields: { Receita: 10, Score: LOSER_SCORE } },
      resolution()
    )

    expect(allKeys(groups).length).toBeGreaterThan(0)
    expect(allKeys(groups)).not.toContain("customFields.Score")
  })

  it("excludes the key with a FULLY POPULATED resolution — the screen's call shape", () => {
    const res = resolution({
      customFieldNames: new Map([[SCORE_DEFINITION, "Score"]]),
      customFieldTypes: new Map([[SCORE_DEFINITION, "formula"]]),
      customFieldPositions: new Map([[SCORE_DEFINITION, 7]]),
    })

    const groups = groupsOf(
      { name: "Acme", customFields: { Receita: 10 } },
      { name: "Acme", customFields: { Receita: 10, Score: LOSER_SCORE } },
      res
    )

    expect(allKeys(groups)).not.toContain("customFields.Score")
  })

  it("still compares a plain number under a formula-ish NAME — the test is the shape, not the name", () => {
    // A bare number is not a wrapper. If a key called `Score` holds `84` rather than
    // `{ formula: true, … }` then nothing in this system derived it, and the merge must still ask.
    // This is the cell that keeps the predicate honest about being a SHAPE test.
    const groups = groupsOf(
      { name: "Acme", customFields: { Score: 20 } },
      { name: "Acme", customFields: { Score: 84 } }
    )

    expect(keysOf(groups.conflicts)).toContain("customFields.Score")
  })

  it("still compares a multi_select array — `'formula' in []` must not be evaluated on a prototype", () => {
    // `isFormulaWrapper`'s `!Array.isArray` guard is load-bearing and this is its cell here: every
    // multi_select value in this database is an array, and `'formula' in []` would otherwise be
    // checked against the array prototype chain rather than refused outright.
    const groups = groupsOf(
      { name: "Acme", customFields: { Origem: ["Inbound"] } },
      { name: "Acme", customFields: { Origem: ["Outbound"] } }
    )

    expect(keysOf(groups.conflicts)).toContain("customFields.Origem")
  })
})
