import { describe, it, expect } from "vitest"
import {
  isValidMatchEmail,
  classifyPersonMatch,
  classifyOrganizationMatch,
  type OrganizationMatchSide,
  type PersonMatchSide,
} from "./scoring"
import { normalizeOrgName, normalizePersonName, normalizePhone } from "./normalize"

/** Build a person side from raw field values, so the tests exercise the real normalizers too. */
function person(name: string, email: string | null, phone: string | null): PersonMatchSide {
  return {
    email,
    normName: normalizePersonName(name),
    normPhone: normalizePhone(phone),
  }
}

/** Build an organization side from a raw name plus its custom-field JSONB blob. */
function org(name: string, customFields: Record<string, unknown> | null = null): OrganizationMatchSide {
  return { normName: normalizeOrgName(name), customFields }
}

const CNPJ = "CNPJ / CPF"
const CONTACT_EMAIL = "E-mail de Contato 1"
const IDENTITY_FIELDS = [CNPJ, CONTACT_EMAIL] as const

describe("isValidMatchEmail", () => {
  it("rejects the junk sentinels and syntactically invalid addresses", () => {
    // `#` is the measured worst case: 212 people carry it, which is a 22,366-pair clique.
    expect(isValidMatchEmail("#")).toBe(false)
    expect(isValidMatchEmail("-")).toBe(false)
    expect(isValidMatchEmail("")).toBe(false)
    expect(isValidMatchEmail(null)).toBe(false)
    expect(isValidMatchEmail(undefined)).toBe(false)
    expect(isValidMatchEmail("a@b")).toBe(false)
    expect(isValidMatchEmail("a b@c.com")).toBe(false)
  })

  it("accepts a real address", () => {
    expect(isValidMatchEmail("jose@empresa.com.br")).toBe(true)
  })

  it("rejects the measured placeholder addresses teste@teste.com and teste@gmail.com", () => {
    expect(isValidMatchEmail("teste@teste.com")).toBe(false)
    expect(isValidMatchEmail("teste@gmail.com")).toBe(false)
    expect(isValidMatchEmail("TESTE@Gmail.COM")).toBe(false)
  })
})

describe("classifyPersonMatch", () => {
  it("reports certain/email for equal valid addresses, case-insensitively", () => {
    const result = classifyPersonMatch(
      person("José da Silva", "Jose@Empresa.com.BR", null),
      person("J. da Silva", "jose@empresa.com.br", null)
    )
    expect(result).toEqual({ tier: "certain", reason: "email" })
  })

  it("reports nothing when both e-mails are the sentinel #", () => {
    // THE B2 GUARD. Measured: unfiltered exact-email grouping produced 28,032 person pairs with a
    // largest group of 212 (all `#`); requiring a syntactically valid address dropped that to
    // 5,338 pairs, largest group 23. If this assertion ever passes a `certain` tier, the scan
    // output becomes untriageable.
    const result = classifyPersonMatch(
      person("Ana Pereira", "#", null),
      person("Bruno Costa", "#", null)
    )
    expect(result).toBeNull()
  })

  it("reports likely/similarNamePhone when the names and the phone both agree", () => {
    const result = classifyPersonMatch(
      person("João Silva", "joao@a.com", "(21) 99876-5432"),
      person("Joao Silva", "joao.silva@b.com", "+21 99876 5432")
    )
    expect(result).toEqual({ tier: "likely", reason: "similarNamePhone" })
  })

  it("reports nothing for an equal but non-comparable single-token name", () => {
    // `marcelo` is the complete normalized name of 78 different people.
    const result = classifyPersonMatch(
      person("Marcelo", "marcelo@a.com", null),
      person("marcelo", "marcelo@b.com", null)
    )
    expect(result).toBeNull()
  })

  it("reports likely/similarName when the names agree and no phone is recorded", () => {
    const result = classifyPersonMatch(
      person("João Silva", "joao@a.com", null),
      person("Joao Silva", "joao.silva@b.com", "")
    )
    expect(result).toEqual({ tier: "likely", reason: "similarName" })
  })

  it("does not let two empty phones stand in for a phone match", () => {
    const result = classifyPersonMatch(
      person("João Silva", "joao@a.com", ""),
      person("Joao Silva", "outro@b.com", "")
    )
    expect(result?.reason).toBe("similarName")
  })

  it("reports nothing when neither the e-mails nor the names agree", () => {
    const result = classifyPersonMatch(
      person("Ana Pereira", "ana@a.com", "21999990000"),
      person("Bruno Costa", "bruno@b.com", "21988880000")
    )
    expect(result).toBeNull()
  })
})

describe("classifyOrganizationMatch", () => {
  it("never reports certain when no identity field is configured", () => {
    // THE DEGRADATION RULE (39-CONTEXT § Post-Research Decisions). Measured: 70.7% of the 46,054
    // organizations share a normalized name, so name-only "certain" would be 1,030,436 pairs.
    const result = classifyOrganizationMatch(
      org("COGUMELO INDUSTRIA E COMERCIO LTDA", { [CNPJ]: "11222333000181" }),
      org("Cogumelo Industria e Comercio", { [CNPJ]: "11222333000181" }),
      []
    )
    expect(result).toEqual({ tier: "likely", reason: "similarName" })
  })

  it("reports certain/nameIdentity when the name and the first identity field both agree", () => {
    const result = classifyOrganizationMatch(
      org("COGUMELO INDUSTRIA E COMERCIO LTDA", {
        [CNPJ]: "11.222.333/0001-81",
        [CONTACT_EMAIL]: "contato@cogumelo.com.br",
      }),
      org("Cogumelo Industria e Comercio ME", {
        [CNPJ]: "11.222.333/0001-81",
        [CONTACT_EMAIL]: "vendas@cogumelo.com.br",
      }),
      IDENTITY_FIELDS
    )
    expect(result).toEqual({ tier: "certain", reason: "nameIdentity" })
  })

  it("falls through to the second configured field when the first is empty on one side", () => {
    const result = classifyOrganizationMatch(
      org("COGUMELO INDUSTRIA E COMERCIO LTDA", {
        [CNPJ]: "",
        [CONTACT_EMAIL]: "contato@cogumelo.com.br",
      }),
      org("Cogumelo Industria e Comercio ME", {
        [CNPJ]: "11.222.333/0001-81",
        [CONTACT_EMAIL]: "Contato@Cogumelo.com.br",
      }),
      IDENTITY_FIELDS
    )
    expect(result).toEqual({ tier: "certain", reason: "nameIdentity" })
  })

  it("is not certain when the identity values agree but the names do not", () => {
    // The locked rule is name AND identity, never identity alone: one CNPJ legitimately covers
    // several branches carrying different trade names.
    const result = classifyOrganizationMatch(
      org("COGUMELO INDUSTRIA E COMERCIO LTDA", { [CNPJ]: "11222333000181" }),
      org("Padaria do Bairro LTDA", { [CNPJ]: "11222333000181" }),
      IDENTITY_FIELDS
    )
    expect(result?.tier).not.toBe("certain")
    expect(result).toBeNull()
  })

  it("is only likely when the configured field is populated on one side only", () => {
    const result = classifyOrganizationMatch(
      org("COGUMELO INDUSTRIA E COMERCIO LTDA", { [CNPJ]: "11222333000181" }),
      org("Cogumelo Industria e Comercio", {}),
      IDENTITY_FIELDS
    )
    expect(result).toEqual({ tier: "likely", reason: "similarName" })
  })

  it("is only likely when the configured field disagrees", () => {
    const result = classifyOrganizationMatch(
      org("COGUMELO INDUSTRIA E COMERCIO LTDA", { [CNPJ]: "11222333000181" }),
      org("Cogumelo Industria e Comercio", { [CNPJ]: "99888777000166" }),
      IDENTITY_FIELDS
    )
    expect(result).toEqual({ tier: "likely", reason: "similarName" })
  })

  it("reports nothing when both names normalize to empty", () => {
    // The 9 measured token-less organizations must never form a clique with each other.
    const a = org("###")
    const b = org("&&&")
    expect(a.normName).toBe("")
    expect(b.normName).toBe("")
    expect(classifyOrganizationMatch(a, b, IDENTITY_FIELDS)).toBeNull()
  })

  it("reports nothing when both names normalize to empty even with a matching identity value", () => {
    const result = classifyOrganizationMatch(
      org("###", { [CNPJ]: "11222333000181" }),
      org("&&&", { [CNPJ]: "11222333000181" }),
      IDENTITY_FIELDS
    )
    expect(result).toBeNull()
  })

  it("ignores a custom-field value that is not a string", () => {
    const result = classifyOrganizationMatch(
      org("COGUMELO INDUSTRIA E COMERCIO LTDA", { [CNPJ]: { nested: true } }),
      org("Cogumelo Industria e Comercio", { [CNPJ]: { nested: true } }),
      IDENTITY_FIELDS
    )
    expect(result).toEqual({ tier: "likely", reason: "similarName" })
  })

  it("tolerates a null custom-fields blob", () => {
    const result = classifyOrganizationMatch(
      org("COGUMELO INDUSTRIA E COMERCIO LTDA", null),
      org("Cogumelo Industria e Comercio", null),
      IDENTITY_FIELDS
    )
    expect(result).toEqual({ tier: "likely", reason: "similarName" })
  })
})
