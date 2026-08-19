import { describe, it, expect } from "vitest"

import type { AuditResolution } from "@/lib/audit/present"

import { buildMergeFieldGroups, type MergeFieldGroups } from "./field-groups"
import { applyMergeChoices, resolveMergeDefaults } from "./merge-defaults"

/* -----------------------------------------------------------------------------------------
 * The locked rule under test, quoted from 39-CONTEXT § Merge Semantics:
 *
 *   "The field picker pre-selects the survivor's value, except where the survivor's is empty
 *    and the loser's is not."
 *
 * 39-VALIDATION calls this "the phase's highest-consequence silent default": a wrong default
 * writes the wrong value onto a live record and the audit entry then records it as the user's
 * intention. It is tested in BOTH directions - that the survivor wins everywhere else, and
 * that `filledOnly` is the one exception - because a rule tested in one direction only is
 * satisfied by a function that always returns the same answer.
 *
 * `applyMergeChoices` is tested against a hostile choice map, because that map is authored by
 * the browser (T-39-04).
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

const CNPJ_DEFINITION = "0f0ad0e1-a1cc-4c2f-9a3d-1c2e4b6a8d10"

const CUSTOM_RESOLUTION = resolution({
  customFieldNames: new Map([[CNPJ_DEFINITION, "CNPJ / CPF"]]),
  customFieldPositions: new Map([[CNPJ_DEFINITION, 3]]),
})

function groupsOf(
  survivor: Record<string, unknown>,
  loser: Record<string, unknown>,
  res: AuditResolution = CUSTOM_RESOLUTION
): MergeFieldGroups {
  return buildMergeFieldGroups({ entityType: "organization", survivor, loser, resolution: res })
}

/**
 * A survivor and a loser exercising all three groups at once:
 * - `name`   → conflict (both populated, different)
 * - `website`→ filled only on the loser
 * - `phone`  → identical
 */
const MIXED_SURVIVOR: Record<string, unknown> = {
  name: "Acme Ltda",
  website: null,
  phone: "+55 11 5555-0000",
  customFields: { "CNPJ / CPF": "11.111.111/0001-11" },
}

const MIXED_LOSER: Record<string, unknown> = {
  name: "ACME Comercio Ltda",
  website: "https://acme.com.br",
  phone: "+55 11 5555-0000",
  customFields: { "CNPJ / CPF": "22.222.222/0001-22" },
}

describe("resolveMergeDefaults", () => {
  it("Test 1: defaults every conflict to the survivor", () => {
    const groups = groupsOf(MIXED_SURVIVOR, MIXED_LOSER)
    const defaults = resolveMergeDefaults(groups)

    expect(groups.conflicts.length).toBeGreaterThan(0)
    for (const field of groups.conflicts) {
      expect(defaults[field.key]).toBe("survivor")
    }
    expect(defaults.name).toBe("survivor")
    expect(defaults["customFields.CNPJ / CPF"]).toBe("survivor")
  })

  it("Test 2: defaults every filled-only field to the LOSER — the locked exception", () => {
    const groups = groupsOf(MIXED_SURVIVOR, MIXED_LOSER)
    const defaults = resolveMergeDefaults(groups)

    expect(groups.filledOnly.map((field) => field.key)).toEqual(["website"])
    for (const field of groups.filledOnly) {
      expect(defaults[field.key]).toBe("loser")
    }
  })

  it("Test 3: still names every identical field, defaulting it to the survivor", () => {
    const groups = groupsOf(MIXED_SURVIVOR, MIXED_LOSER)
    const defaults = resolveMergeDefaults(groups)

    expect(groups.identical.map((field) => field.key)).toEqual(["phone"])
    // The key IS present even though the user gets no control for it, so a later writer
    // cannot drop an identical field out of the merged record by accident.
    expect(Object.prototype.hasOwnProperty.call(defaults, "phone")).toBe(true)
    expect(defaults.phone).toBe("survivor")
  })

  it("Test 4: returns exactly the union of the three groups' keys, no more and no less", () => {
    const groups = groupsOf(MIXED_SURVIVOR, MIXED_LOSER)
    const defaults = resolveMergeDefaults(groups)

    const expected = [
      ...groups.conflicts.map((field) => field.key),
      ...groups.filledOnly.map((field) => field.key),
      ...groups.identical.map((field) => field.key),
    ].sort()

    expect(Object.keys(defaults).sort()).toEqual(expected)
    expect(expected).toEqual([
      "customFields.CNPJ / CPF",
      "name",
      "phone",
      "website",
    ])
  })
})

describe("applyMergeChoices", () => {
  it("Test 5: writes the loser's value when a conflict is flipped to the loser", () => {
    const groups = groupsOf(MIXED_SURVIVOR, MIXED_LOSER)
    const result = applyMergeChoices(MIXED_SURVIVOR, MIXED_LOSER, groups, {
      name: "loser",
    })

    expect(result.native.name).toBe("ACME Comercio Ltda")
    // Untouched keys keep the default, which for `website` is the loser's (Test 2).
    expect(result.native.website).toBe("https://acme.com.br")
    expect(result.native.phone).toBe("+55 11 5555-0000")
  })

  it("Test 6: routes a customFields. key into the blob under its bare name, never into native", () => {
    const groups = groupsOf(MIXED_SURVIVOR, MIXED_LOSER)
    const result = applyMergeChoices(MIXED_SURVIVOR, MIXED_LOSER, groups, {
      "customFields.CNPJ / CPF": "loser",
    })

    expect(result.customFields["CNPJ / CPF"]).toBe("22.222.222/0001-22")
    expect(result.native["customFields.CNPJ / CPF"]).toBeUndefined()
    expect(result.native["CNPJ / CPF"]).toBeUndefined()
    expect(Object.keys(result.native)).not.toContain("customFields")
  })

  it("Test 7: ignores a choice key that is not in any group", () => {
    const groups = groupsOf(MIXED_SURVIVOR, MIXED_LOSER)
    const result = applyMergeChoices(MIXED_SURVIVOR, MIXED_LOSER, groups, {
      // Everything below is a key the server never compared. The map arrives from the
      // browser, so this is the control that stops a crafted map writing a column that
      // was never on the screen (T-39-04).
      id: "loser",
      deletedAt: "loser",
      ownerId: "loser",
      passwordHash: "loser",
      "customFields.Nao Comparado": "loser",
    })

    for (const forged of ["id", "deletedAt", "ownerId", "passwordHash"]) {
      expect(Object.keys(result.native)).not.toContain(forged)
    }
    expect(Object.keys(result.customFields)).not.toContain("Nao Comparado")
    // Anti-vacuity: a compared key still came through.
    expect(result.native.name).toBe("Acme Ltda")
  })

  it("Test 8: falls back to the default for an unrecognised choice value, and never throws", () => {
    const groups = groupsOf(MIXED_SURVIVOR, MIXED_LOSER)

    const result = applyMergeChoices(MIXED_SURVIVOR, MIXED_LOSER, groups, {
      name: "whichever",
      website: "",
      phone: "__proto__",
    })

    expect(result.native.name).toBe("Acme Ltda")
    expect(result.native.website).toBe("https://acme.com.br")
    expect(result.native.phone).toBe("+55 11 5555-0000")
  })

  it("Test 9: keeps a survivor custom field that was never compared", () => {
    const survivor: Record<string, unknown> = {
      name: "Acme Ltda",
      customFields: { "CNPJ / CPF": "11.111.111/0001-11", "Observação": "manter isto" },
    }
    const loser: Record<string, unknown> = {
      name: "ACME Comercio Ltda",
      customFields: { "CNPJ / CPF": "22.222.222/0001-22" },
    }

    // Groups deliberately built WITHOUT the uncompared key, standing in for any caller that
    // compares a subset. A merge must not silently clear a field nobody was asked about.
    const groups = groupsOf(
      { name: survivor.name, customFields: { "CNPJ / CPF": "11.111.111/0001-11" } },
      loser
    )

    const result = applyMergeChoices(survivor, loser, groups, {})

    expect(result.customFields).toEqual({
      "CNPJ / CPF": "11.111.111/0001-11",
      "Observação": "manter isto",
    })
    // Inputs are never mutated.
    expect(result.customFields).not.toBe(survivor.customFields)
    expect(survivor.customFields).toEqual({
      "CNPJ / CPF": "11.111.111/0001-11",
      "Observação": "manter isto",
    })
  })

  it("Test 10: never emits an excluded column into native, even from a forged group", () => {
    const groups = groupsOf(MIXED_SURVIVOR, MIXED_LOSER)

    // A group list is server-built today, but the guard is stated here rather than assumed:
    // an excluded column reaching `native` would let the merge write `ownerId` outside
    // Phase 38's narrow owner mutations, or resurrect a row through `deletedAt` (T-39-13).
    const forged: MergeFieldGroups = {
      ...groups,
      conflicts: [
        ...groups.conflicts,
        { key: "ownerId", label: "Owner", survivorValue: "a", loserValue: "b" },
        { key: "deletedAt", label: "Deleted", survivorValue: null, loserValue: "2024-01-01" },
        { key: "id", label: "Id", survivorValue: "a", loserValue: "b" },
      ],
    }

    const result = applyMergeChoices(MIXED_SURVIVOR, MIXED_LOSER, forged, {
      ownerId: "loser",
      deletedAt: "loser",
      id: "loser",
    })

    for (const excluded of ["id", "createdAt", "updatedAt", "deletedAt", "ownerId", "customFields"]) {
      expect(Object.keys(result.native)).not.toContain(excluded)
    }
    // Anti-vacuity: the assertion above must not be answered by an empty object.
    expect(result.native.name).toBe("Acme Ltda")
    expect(Object.keys(result.native).sort()).toEqual(["name", "phone", "website"])
  })

  it("does not mutate the survivor, the loser or the groups", () => {
    const groups = groupsOf(MIXED_SURVIVOR, MIXED_LOSER)
    const survivorBefore = JSON.stringify(MIXED_SURVIVOR)
    const loserBefore = JSON.stringify(MIXED_LOSER)
    const groupsBefore = JSON.stringify(groups)

    applyMergeChoices(MIXED_SURVIVOR, MIXED_LOSER, groups, { name: "loser" })

    expect(JSON.stringify(MIXED_SURVIVOR)).toBe(survivorBefore)
    expect(JSON.stringify(MIXED_LOSER)).toBe(loserBefore)
    expect(JSON.stringify(groups)).toBe(groupsBefore)
  })
})
