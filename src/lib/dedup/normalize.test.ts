import { describe, it, expect } from "vitest"
import {
  normalizeOrgName,
  normalizePersonName,
  normalizePhone,
  isComparableOrgName,
  isComparablePersonName,
} from "./normalize"
import { NORMALIZATION_CASES } from "./normalize.fixtures"

describe("normalizeOrgName — the shared case table", () => {
  // Driven by `it.each` rather than a loop inside one `it`, so a regression names the exact case
  // that broke. The negative proofs recorded in 39-01-SUMMARY.md depend on that.
  it.each(NORMALIZATION_CASES)("$name: $input", ({ input, expected }) => {
    expect(normalizeOrgName(input)).toBe(expected)
  })

  it.each(NORMALIZATION_CASES)("is idempotent for $name", ({ input }) => {
    const once = normalizeOrgName(input)
    expect(normalizeOrgName(once)).toBe(once)
  })
})

describe("normalizeOrgName — nullish input", () => {
  it("treats null, undefined and the empty string identically", () => {
    expect(normalizeOrgName(null)).toBe("")
    expect(normalizeOrgName(undefined)).toBe("")
    expect(normalizeOrgName("")).toBe("")
  })
})

describe("isComparableOrgName", () => {
  it("refuses the empty string, so two token-less organizations never match each other", () => {
    expect(isComparableOrgName("")).toBe(false)
    // The measured failure mode: 9 organizations normalize to nothing usable. Comparing two of
    // them by equality would report every pair among them as a duplicate.
    expect(isComparableOrgName(normalizeOrgName("###"))).toBe(false)
    expect(isComparableOrgName(normalizeOrgName("&&&"))).toBe(false)
  })

  it("refuses a name shorter than the token floor and accepts one that reaches it", () => {
    expect(isComparableOrgName("ab")).toBe(false)
    expect(isComparableOrgName("abc")).toBe(true)
  })

  it("refuses a name made only of initials, which has length but no token of length 3", () => {
    expect(isComparableOrgName("a b c")).toBe(false)
  })
})

describe("isComparablePersonName", () => {
  it("refuses a single-token name", () => {
    expect(isComparablePersonName("marcelo")).toBe(false)
  })

  it("refuses the measured import sentinel `nao encotrado`", () => {
    expect(isComparablePersonName("nao encotrado")).toBe(false)
    expect(isComparablePersonName("nao encontrado")).toBe(false)
  })

  it("accepts a two-token real name", () => {
    expect(isComparablePersonName("joao silva")).toBe(true)
  })

  it("refuses the empty string", () => {
    expect(isComparablePersonName("")).toBe(false)
  })
})

describe("normalizePersonName", () => {
  it("keeps the surname Sá while normalizeOrgName strips the SA suffix", () => {
    // The single reason two functions exist rather than one with a flag. Both halves are asserted
    // here so neither can pass vacuously: if the person normalizer ever grows the org suffix list,
    // `José de Sá` silently becomes `jose de` and every Sá in the database collides.
    expect(normalizePersonName("José de Sá")).toBe("jose de sa")
    expect(normalizeOrgName("LOJAS SA")).toBe("lojas")
  })

  it("folds accents and collapses runs of whitespace", () => {
    expect(normalizePersonName("  MARIA   DA   SILVA  ")).toBe("maria da silva")
  })

  it("treats null, undefined and the empty string identically", () => {
    expect(normalizePersonName(null)).toBe("")
    expect(normalizePersonName(undefined)).toBe("")
    expect(normalizePersonName("")).toBe("")
  })

  it("is idempotent", () => {
    const once = normalizePersonName("José de Sá")
    expect(normalizePersonName(once)).toBe(once)
  })
})

describe("normalizePhone", () => {
  it("keeps digits and nothing else", () => {
    expect(normalizePhone("(21) 99876-5432")).toBe("21998765432")
    expect(normalizePhone("+55 21 99876 5432")).toBe("5521998765432")
  })

  it("treats null, undefined and the empty string identically", () => {
    expect(normalizePhone(null)).toBe("")
    expect(normalizePhone(undefined)).toBe("")
    expect(normalizePhone("")).toBe("")
  })

  it("collapses a punctuation-only phone to the empty string", () => {
    expect(normalizePhone("()-  +")).toBe("")
  })
})
