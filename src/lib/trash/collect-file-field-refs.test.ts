/**
 * SEC-04 — enumerating the blobs a record's `customFields` JSONB references.
 *
 * The contract under test is a BLIND WALK that must not throw. `collectFileFieldRefs` reads a
 * JSONB column that other code writes (`src/components/custom-fields/file-field.tsx:14-22`), so
 * its input is hostile by default: a field can hold `null` because the last file was removed
 * (`file-field.tsx:167`), a definition can have been retyped while old values stayed behind, and
 * a value can be anything at all that once round-tripped through `JSON.parse`. A parser that
 * throws on a malformed value would turn a purge into a crash; a parser that returns `[]` for a
 * WELL-FORMED value would make SC-2's deletion a silent no-op that still reports success. Both
 * directions are covered here, which is why the malformed cells are not alone in this file.
 *
 * The negatives below are worthless without the POSITIVE ANCHOR: eleven "returns []" assertions
 * are all satisfied by a function that returns `[]` unconditionally. The anchor pins the count to
 * a named integer, and the ablation log in 49-02-SUMMARY.md records how many cells that ablation
 * reddens.
 *
 * No mocks, no database, no filesystem: the module under test has none of those by design (see
 * its header for why it must not read `custom_field_definitions`).
 */
import { describe, it, expect } from "vitest"

import { collectFileFieldRefs, type BlobRef } from "./collect-file-field-refs"

/**
 * NAMED-INTEGER FLOORS. Declared once and consumed by BOTH the fixture builder and the
 * assertion, so a count assertion can never be satisfied by a fixture that shrank to zero.
 */
const ANCHOR_REF_COUNT = 3
const ANCHOR_FIRST_FIELD_COUNT = 2
const ANCHOR_SECOND_FIELD_COUNT = 1
const MIXED_REF_COUNT = 1

const ENTITY_ID = "11111111-1111-4111-8111-111111111111"

/** One stored file descriptor, exactly as `file-field.tsx` writes them. */
function descriptor(storedName: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `id-${storedName}`,
    filename: `original-${storedName}`,
    storedName,
    path: `/tmp/uploads/${ENTITY_ID}/anexos/${storedName}`,
    publicUrl: `/api/files/${ENTITY_ID}/anexos/${storedName}`,
    size: 1234,
    mimeType: "application/pdf",
    ...overrides,
  }
}

/**
 * The well-formed blob the anchor walks: `ANCHOR_FIRST_FIELD_COUNT` files under one field name
 * and `ANCHOR_SECOND_FIELD_COUNT` under a second, built FROM the constants rather than written
 * out as literals.
 */
function anchorCustomFields() {
  return {
    anexos: Array.from({ length: ANCHOR_FIRST_FIELD_COUNT }, (_, i) =>
      descriptor(`anexo-${i}.pdf`)
    ),
    // A non-file field sitting beside them: the walk must not be confused by scalars.
    codigo: "ABC-123",
    contrato: Array.from({ length: ANCHOR_SECOND_FIELD_COUNT }, (_, i) =>
      descriptor(`contrato-${i}.docx`)
    ),
  }
}

describe("collectFileFieldRefs — the anchor: a well-formed column yields every blob", () => {
  it("the fixture itself carries a non-zero, named number of descriptors (anti-vacuity floor)", () => {
    // Without this, "returns 3 refs" is satisfiable by a fixture that drifted to 3 of something
    // else, and "the malformed cells return []" is satisfiable by a walk that stopped working.
    expect(ANCHOR_REF_COUNT).toBeGreaterThan(0)
    expect(ANCHOR_FIRST_FIELD_COUNT + ANCHOR_SECOND_FIELD_COUNT).toBe(ANCHOR_REF_COUNT)
    const fixture = anchorCustomFields()
    expect(fixture.anexos).toHaveLength(ANCHOR_FIRST_FIELD_COUNT)
    expect(fixture.contrato).toHaveLength(ANCHOR_SECOND_FIELD_COUNT)
  })

  it("returns one ref per stored descriptor across every field, in the order encountered", () => {
    const refs = collectFileFieldRefs(ENTITY_ID, anchorCustomFields())

    expect(refs).toHaveLength(ANCHOR_REF_COUNT)
    expect(refs).toEqual<BlobRef[]>([
      { entityId: ENTITY_ID, fieldName: "anexos", storedName: "anexo-0.pdf" },
      { entityId: ENTITY_ID, fieldName: "anexos", storedName: "anexo-1.pdf" },
      { entityId: ENTITY_ID, fieldName: "contrato", storedName: "contrato-0.docx" },
    ])
  })

  it("carries the entityId it was HANDED, not one read back out of the descriptor", () => {
    // `descriptor()` bakes ENTITY_ID into `path`/`publicUrl`; the ref must come from the
    // argument, because a purge knows the row id and must not trust the column's copy of it.
    const refs = collectFileFieldRefs("other-entity", anchorCustomFields())
    expect(refs).toHaveLength(ANCHOR_REF_COUNT)
    for (const ref of refs) {
      expect(ref.entityId).toBe("other-entity")
    }
  })
})

describe("collectFileFieldRefs — the column itself is not an object", () => {
  it("returns [] for null (a nullable JSONB column)", () => {
    expect(collectFileFieldRefs(ENTITY_ID, null)).toEqual([])
  })

  it("returns [] for undefined (a row selected without the column)", () => {
    expect(collectFileFieldRefs(ENTITY_ID, undefined)).toEqual([])
  })

  it("returns [] for a string", () => {
    expect(collectFileFieldRefs(ENTITY_ID, "anexos")).toEqual([])
  })

  it("returns [] for a number", () => {
    expect(collectFileFieldRefs(ENTITY_ID, 42)).toEqual([])
  })

  it("returns [] for a boolean", () => {
    expect(collectFileFieldRefs(ENTITY_ID, true)).toEqual([])
  })

  it("returns [] for an array handed in as the whole column", () => {
    // A `customFields` column is an OBJECT, never an array. The nested shape below is chosen
    // deliberately over a flat `[descriptor(...)]`: a flat array survives the walk anyway
    // (its entries are objects, not arrays, so the per-field guard skips them), which would
    // make the top-level `Array.isArray` rejection untestable. Nested, removing that rejection
    // yields refs under the numeric field name "0" — see the ablation log in the SUMMARY.
    expect(collectFileFieldRefs(ENTITY_ID, [[descriptor("smuggled.pdf")]])).toEqual([])
    expect(collectFileFieldRefs(ENTITY_ID, [descriptor("flat.pdf")])).toEqual([])
    expect(collectFileFieldRefs(ENTITY_ID, [])).toEqual([])
  })

  it("returns [] for an empty object", () => {
    expect(collectFileFieldRefs(ENTITY_ID, {})).toEqual([])
  })
})

describe("collectFileFieldRefs — a field's value is not a descriptor array", () => {
  it("skips a field whose value is a string rather than throwing", () => {
    expect(collectFileFieldRefs(ENTITY_ID, { anexos: "contrato.pdf" })).toEqual([])
  })

  it("skips a field whose value is null (the shape left when the last file is removed)", () => {
    expect(collectFileFieldRefs(ENTITY_ID, { anexos: null })).toEqual([])
  })

  it("skips a field whose value is a bare object rather than an array", () => {
    // `file-field.tsx` never writes a bare descriptor, but a hand-edited row could.
    expect(collectFileFieldRefs(ENTITY_ID, { anexos: descriptor("bare.pdf") })).toEqual([])
  })

  it("skips an array of non-objects", () => {
    expect(collectFileFieldRefs(ENTITY_ID, { anexos: [1, "x", null, true] })).toEqual([])
  })

  it("skips an array of nested arrays", () => {
    expect(collectFileFieldRefs(ENTITY_ID, { anexos: [[descriptor("nested.pdf")]] })).toEqual([])
  })
})

describe("collectFileFieldRefs — the storedName is the on-disk name and must be usable", () => {
  it("skips a descriptor with no storedName at all", () => {
    const noStored = { id: "x", filename: "contrato.pdf", size: 1, mimeType: "application/pdf" }
    expect(collectFileFieldRefs(ENTITY_ID, { anexos: [noStored] })).toEqual([])
  })

  it("skips storedName: '' — an empty name resolves to the field directory itself", () => {
    expect(collectFileFieldRefs(ENTITY_ID, { anexos: [descriptor("", {})] })).toEqual([])
  })

  it("skips a non-string storedName rather than emitting a ref that carries a number", () => {
    const refs = collectFileFieldRefs(ENTITY_ID, {
      anexos: [descriptor("placeholder", { storedName: 42 })],
    })
    expect(refs).toEqual([])
    // The barrier: if the type guard is removed, the assertion above fails AND a ref carrying
    // a non-string escapes into a path builder. Name that consequence here.
    for (const ref of refs) {
      expect(typeof ref.storedName).toBe("string")
    }
  })

  it("skips a null storedName", () => {
    expect(
      collectFileFieldRefs(ENTITY_ID, { anexos: [descriptor("placeholder", { storedName: null })] })
    ).toEqual([])
  })
})

describe("collectFileFieldRefs — malformed siblings do not take the field down with them", () => {
  it("returns the one well-formed descriptor out of four in the SAME array", () => {
    const refs = collectFileFieldRefs(ENTITY_ID, {
      anexos: [
        null,
        7,
        descriptor("survivor.pdf"),
        { filename: "no-stored-name.pdf" },
        descriptor("placeholder", { storedName: "" }),
      ],
    })

    // The barrier is the exact count: a whole-field abort returns 0, and a walk with no guards
    // at all returns more than one. MIXED_REF_COUNT pins it between the two.
    expect(refs).toHaveLength(MIXED_REF_COUNT)
    expect(refs[0]).toEqual({
      entityId: ENTITY_ID,
      fieldName: "anexos",
      storedName: "survivor.pdf",
    })
  })

  it("keeps walking later fields after an earlier field was skipped entirely", () => {
    const refs = collectFileFieldRefs(ENTITY_ID, {
      quebrado: "not an array",
      anexos: [descriptor("later.pdf")],
    })
    expect(refs).toHaveLength(MIXED_REF_COUNT)
    expect(refs[0].fieldName).toBe("anexos")
  })
})

describe("collectFileFieldRefs — the live deployment's field names", () => {
  it("round-trips a name with a space and non-ASCII characters unmodified", () => {
    // The live field names are Portuguese, e.g. "Código Mãe". The fieldName becomes a path
    // segment downstream, so any normalisation here would point the deletion at the wrong
    // directory and the blob would survive the purge.
    const fieldName = "Código Mãe"
    const refs = collectFileFieldRefs(ENTITY_ID, {
      [fieldName]: [descriptor("anexo.pdf")],
    })
    expect(refs).toHaveLength(MIXED_REF_COUNT)
    expect(refs[0].fieldName).toBe(fieldName)
    expect(refs[0].fieldName).toBe("Código Mãe")
  })

  it("does not special-case a name containing a slash — it is simply carried", () => {
    // NOT a subject of SC-1/SC-2: a name with "/" cannot round-trip through the three-segment
    // /api/files/[entityId]/[fieldName]/[filename] route at all, so the SC fixtures must avoid
    // one. Asserted here only so the walk's behaviour is documented rather than assumed; the
    // containment check in `deleteEntityFiles` is what actually refuses a traversal.
    const refs = collectFileFieldRefs(ENTITY_ID, { "a/b": [descriptor("anexo.pdf")] })
    expect(refs).toHaveLength(MIXED_REF_COUNT)
    expect(refs[0].fieldName).toBe("a/b")
  })
})

describe("collectFileFieldRefs — purity", () => {
  it("does not mutate the column it was handed", () => {
    const fixture = anchorCustomFields()
    const before = JSON.stringify(fixture)
    collectFileFieldRefs(ENTITY_ID, fixture)
    expect(JSON.stringify(fixture)).toBe(before)
  })

  it("never throws for any of the hostile shapes above, checked in one sweep", () => {
    const hostile: unknown[] = [
      null,
      undefined,
      0,
      "",
      NaN,
      [],
      {},
      { anexos: undefined },
      { anexos: [undefined] },
      { anexos: [{}] },
      { anexos: { length: 3 } },
      { anexos: [Object.create(null)] },
    ]
    for (const value of hostile) {
      expect(() => collectFileFieldRefs(ENTITY_ID, value)).not.toThrow()
    }
    // Floor: the sweep above is vacuous if the list is empty.
    expect(hostile.length).toBeGreaterThan(ANCHOR_REF_COUNT)
  })
})
