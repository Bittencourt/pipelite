/**
 * THE IDENTITY-FIELD PICKER OFFERS ONLY WHAT THE CREATE DIALOG CAN COLLECT — gap D-39-04.
 *
 * Plan 39-18 made the CONFIGURED organization identity fields collectable at create time and, in
 * doing so, created a new asymmetry it recorded in its own module header: this picker offered EVERY
 * organization field label with no type filter, while `identityValue` in `matching.ts` returns `""`
 * unless `typeof raw === "string"`. So a `multi_select` field could be chosen, saved, confirmed by a
 * toast — and do nothing. That is the same silent-failure class the gap it closed was, moved one
 * layer up into the very control that turns the feature on.
 *
 * WHAT THIS FILE GUARDS IS NOT "A FILTER EXISTS". It is that the filter is the SAME rule the create
 * dialog applies, applied in ONE place, and that the two are wired to each other rather than written
 * twice. `identity-inputs.test.ts` owns the rule itself; this file owns the WIRING — the page's
 * projection, the form's two call sites and the copy that explains the result.
 *
 * TWO CALL-SITE ASSERTIONS CARRY MOST OF THE VALUE, AND BOTH GUARD AN INVERSION RATHER THAN AN
 * ABSENCE:
 *
 *   `hasUnsupportedIdentityField` must be fed `fieldNames` — the OFFERED list — and never `options`.
 *   Against `options` it is FALSE FOREVER BY CONSTRUCTION, because `selectableOptions` is what put
 *   the stranded label into `options` in the first place. The sentence would become unreachable and
 *   every assertion about the sentence merely EXISTING would keep passing. So G3 reads the ARGUMENTS
 *   at the call site and requires zero occurrences of `options` among them.
 *
 *   `selectableOptions` must be fed BOTH inputs. Built from `fieldNames` alone, a stored label the
 *   picker can no longer offer has no `SelectItem` to match, and Radix renders an EMPTY trigger — the
 *   admin is shown that their configuration is gone while `app_settings` still holds it.
 *
 * WHY A SOURCE SCAN. There is no jsdom in this repository (K-6), so every component-level contract in
 * Phase 39 is checked by reading comment-stripped source: `merge-form-wiring.test.ts`,
 * `scan-panel-wiring.test.ts` and `pair-card-wiring.test.ts` are all source scans and this is the
 * fourth. `readStrippedSource` is what makes the reading honest — the prose above names
 * `variant="destructive"`, `options` and `definition.name`, and without stripping this header alone
 * would invert several assertions below. That collision is not hypothetical: this phase hit it six
 * times, and the recorded remedy is always a comment-blind read plus a reworded comment, never a
 * deleted one.
 *
 * NO BRACE MATCHER IS DEFINED HERE. Every assertion is a call-site or an exact expression, so the
 * suite's two existing local matchers are neither copied nor extended, and `source-scan.ts` is not
 * touched.
 */
import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { callArguments, readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"

const FORM_PATH = "src/app/duplicates/identity-fields-form.tsx"
const PAGE_PATH = "src/app/duplicates/page.tsx"

const FORM = readStrippedSource(FORM_PATH)
const PAGE = readStrippedSource(PAGE_PATH)

/** How many times `needle` occurs in `haystack`. */
function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

const LOCALES = ["en-US", "pt-BR", "es-ES"] as const
type Locale = (typeof LOCALES)[number]

type Messages = { [key: string]: string | Messages }

function loadLocale(locale: Locale): Messages {
  return JSON.parse(readFileSync(`src/messages/${locale}.json`, "utf8")) as Messages
}

/** Resolves a dot-path to its leaf string, or `undefined` if any segment is missing. */
function resolve(messages: Messages, path: string): string | undefined {
  let current: string | Messages | undefined = messages
  for (const segment of path.split(".")) {
    if (current === undefined || typeof current !== "object") return undefined
    current = current[segment]
  }
  return typeof current === "string" ? current : undefined
}

const catalogs = Object.fromEntries(LOCALES.map((locale) => [locale, loadLocale(locale)])) as Record<
  Locale,
  Messages
>

describe("G1: /duplicates projects the picker's options THROUGH the collectability filter", () => {
  it("calls collectableIdentityFieldNames with the definitions", () => {
    const calls = callArguments(PAGE, "collectableIdentityFieldNames")

    expect(calls).toHaveLength(1)
    expect(calls[0]?.trim()).toBe("definitions")
  })

  it("no longer projects the definitions to their bare names", () => {
    // EXACT rather than approximate: line 98 was verified to be this file's ONLY occurrence of the
    // string before the change, so a file-wide zero is a precise statement that the old unfiltered
    // projection is gone rather than merely moved.
    expect(occurrences(PAGE, "definition.name")).toBe(0)
  })

  it("still reads the definitions at all — the zero above cannot be satisfied by deletion", () => {
    // ANTI-VACUITY. A page that stopped reading the definitions, or dropped the guarded wrapper,
    // would satisfy the zero above while offering the admin nothing. 39-13 shipped a gate that
    // stayed green because unrelated code satisfied its assertion; this is the partner that stops it.
    expect(occurrences(PAGE, "getActiveFieldDefinitions")).toBeGreaterThan(0)
    expect(PAGE).toContain("readOrgFieldNames")
  })
})

describe("G2: the option list is built from BOTH the offered labels and the stored ones", () => {
  it("calls selectableOptions with the offered list AND the configured pair", () => {
    // An option list built from `fieldNames` alone is exactly the silent blanking this plan forbids:
    // `<Select value={primary}>` with no matching `SelectItem` renders an empty trigger.
    const calls = callArguments(FORM, "selectableOptions")

    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain("fieldNames")
    expect(calls[0]).toContain("configured")
  })
})

describe("G3: the unsupported-field predicate is fed the UNFILTERED offered list", () => {
  it("is called with fieldNames and configured, and with NO reference to options", () => {
    // THE HEADLINE ASSERTION. Fed `options`, this predicate is false forever — `selectableOptions`
    // put the stranded label there — and the explanatory sentence becomes unreachable while every
    // assertion about its existence still passes. Caught at the call site, not by looking for a
    // token somewhere in the file.
    const calls = callArguments(FORM, "hasUnsupportedIdentityField")

    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain("fieldNames")
    expect(calls[0]).toContain("configured")
    expect(
      occurrences(calls[0] ?? "", "options"),
      "hasUnsupportedIdentityField fed `options` is false by construction — the sentence would be unreachable",
    ).toBe(0)
  })
})

describe("G4: the stranded configuration is EXPLAINED, from the catalog, and not in red", () => {
  it("renders the sentence through the message catalog", () => {
    // An exact call expression: a bare mention of the key in prose cannot satisfy it, and neither
    // can a hardcoded English sentence.
    expect(FORM).toContain('t("identity.unsupported")')
  })

  it("is advisory rather than destructive (C-1)", () => {
    // C-1: this phase adds no `--warning` token and a misconfiguration is advisory, not an error.
    // The anti-vacuity partner is what stops an Alert-less file passing, and it is the same pairing
    // the C-1 assertion on `duplicate-warning.tsx` already uses.
    expect(occurrences(FORM, 'variant="destructive"')).toBe(0)
    expect(FORM).toContain('variant="default"')
  })
})

describe("G5: rendering the form cannot rewrite the stored setting", () => {
  it("seeds all three pieces of state from the STORED pair, never from the offered list", () => {
    // Seeding from the OFFERED list is the "corrective" fix a reader reaches for when a trigger
    // renders blank, and it would silently drop a stored label the admin never touched. Each of
    // these is an exact expression that can only appear as the initialiser it is.
    expect(FORM).toContain("useState(configured[0] ?? NONE_VALUE)")
    expect(FORM).toContain("useState(configured[1] ?? NONE_VALUE)")
    expect(FORM).toContain("useState<string[]>(configured)")
  })

  it("moves `saved` in exactly one place — the success branch", () => {
    expect(occurrences(FORM, "setSaved(")).toBe(1)
  })
})

describe("G6: the copy exists, and is translated, in every locale", () => {
  it.each(LOCALES)("%s carries a non-empty dedup.identity.unsupported", (locale) => {
    const value = resolve(catalogs[locale], "dedup.identity.unsupported")

    expect(typeof value).toBe("string")
    expect((value ?? "").length).toBeGreaterThan(0)
  })

  it("the three values are pairwise DIFFERENT", () => {
    // Asserted here rather than left to `untranslatedInBoth`, which only fires when BOTH
    // translations are byte-identical to en-US and would therefore pass a file where pt-BR alone was
    // left in English.
    const values = LOCALES.map((locale) => resolve(catalogs[locale], "dedup.identity.unsupported"))

    expect(new Set(values).size).toBe(LOCALES.length)
  })

  it.each([
    ["en-US", "text"],
    ["pt-BR", "texto"],
    ["es-ES", "texto"],
  ] as const)("%s's dedup.identity.help says the offered fields are TEXT fields", (locale, word) => {
    // A COPY ASSERTION, and it must be updated deliberately if the sentence is rewritten. Its job is
    // that the amendment cannot regress in one locale: the picker's list is now shorter than the
    // field list an admin sees on a record, and an unexplained absence is the confusion this change
    // itself introduces.
    const help = resolve(catalogs[locale], "dedup.identity.help") ?? ""

    expect(help.toLowerCase()).toContain(word)
  })
})
