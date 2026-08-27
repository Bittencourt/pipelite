import { readFileSync } from "node:fs"
import { describe, it, expect } from "vitest"

import { createTranslator, type AbstractIntlMessages } from "use-intl/core"

/**
 * SC-3 — THE REFUSAL RESOLVES TO A SENTENCE THE USER CAN ACT ON, IN THREE LANGUAGES.
 *
 * SC-3 asks that "a user who is refused sees why, in terms they can act on — a blocked broad export
 * is distinguishable from a broken one." `views.export.tooBroad` is that sentence, and this file is
 * its behavioural half.
 *
 * ── WHERE THIS FILE LIVES, AND WHY ────────────────────────────────────────────────────────────
 *
 * A SIBLING in `src/messages/`, not a `__tests__/` child, because `src/messages/` has no
 * `__tests__/` directory: `locale-parity.test.ts` is a sibling of the three JSON files it reads and
 * this file reads the same three. Creating a one-file `__tests__/` directory beside them would put
 * two tests over the same data in two places for no gain.
 *
 * ── THE DIVISION OF LABOUR WITH locale-parity.test.ts, STATED SO IT IS NOT DUPLICATED ─────────
 *
 * A duplicated assertion is a second place to update and a first place to disagree, so this file
 * deliberately does NOT restate what the parity gate already proves about this key:
 *
 *   - that `views.export.tooBroad` EXISTS in all three locales           → parity `missingIn`
 *   - that its ICU placeholder SET is identical across locales            → parity `placeholderDrift`
 *   - that the pt-BR and es-ES values are genuinely TRANSLATED            → parity `untranslatedInBoth`
 *   - that the contract lists it, exactly once, and the count moved to 62 → parity's two hard counts
 *
 * All four are assertions about the JSON as DATA. None of them renders anything. What is left is the
 * only thing SC-3 actually asks about: that a real refusal, carrying the two counts the server
 * measured, RESOLVES to a sentence with those counts in it. That is what this file does, through the
 * real `use-intl` over the real locale files.
 *
 * The coverage is not merely complementary, it is strictly wider in one measured respect. Copying the
 * en-US sentence over the es-ES one ONLY leaves the parity file GREEN: `untranslatedInBoth` fires
 * only when es-ES AND pt-BR are both byte-identical to en-US, so a one-locale copy-paste — the more
 * likely translator slip of the two — is invisible to it. The pairwise cell below catches it, and
 * that ablation was run in both directions to establish which detector fires.
 *
 * ── WHAT THIS FILE STILL CANNOT PROVE, STATED PLAINLY ────────────────────────────────────────
 *
 * NOTHING HERE RENDERS THE TOAST. This repository has no jsdom and no `@testing-library/react`, so
 * no unit test in it can mount `saved-views-bar.tsx` and read the text `toast.error` displays. The
 * evidence here is the STRING half — resolved through the production translator over the shipped
 * JSON — and the wiring half is a separate, structural gate over the component source. A reader
 * must not take the green below as evidence that a user saw this sentence on screen.
 *
 * ── THE NUMBER-FORMATTING TRAP, AND WHAT IT ACTUALLY IS (MEASURED, 2026-08-27) ────────────────
 *
 * 50-RESEARCH §6 and 50-02-PLAN both warn that `use-intl` formats a numeric ICU argument PER LOCALE,
 * so that `44254` renders as `44,254` in en-US and `44.254` in pt-BR, and that a `toContain("44254")`
 * assertion therefore fails against correct code. **Measured against this repository, that is the
 * wrong way round, and the trap is the INVERSE of the documented one.**
 *
 *   createTranslator({ locale: "en-US", … })("export.tooBroad", { matched: 44254, total: 46054 })
 *     => "This filter matches 44254 of 46054 records — too many to export. Narrow it and try again."
 *
 * The numbers come out BARE, with no grouping separator, in all three locales. The reason is ICU
 * argument types: a SIMPLE argument `{matched}` is stringified, and `Intl.NumberFormat` is applied
 * only when the message declares the type — `{matched, number}` — which then does yield `44,254` and
 * `44.254`. Verified both ways in-session.
 *
 * So the assertion that fails against correct code is the LOCALE-FORMATTED one, and its red is
 * recorded verbatim in 50-02-SUMMARY.md. The cell named "the numbers are NOT grouped" below pins
 * that on purpose; see its own comment for why the copy keeps the simple form.
 *
 * ── WHY THE NOT-EQUAL CELLS ARE THE CRITERION AND NOT DECORATION ──────────────────────────────
 *
 * SC-3's second half is that a blocked broad export is distinguishable from a broken one. A user has
 * exactly one channel for making that distinction: the sentence in the toast. If `tooBroad` resolved
 * to the same text as `bulk.error.exportFailed`, every assertion about placeholders and translations
 * above would still pass and the criterion would still be unmet — the user would be told the product
 * is broken when in fact they were bounded. So the inequality is asserted, against the OTHER TWO
 * outcomes `runExport` can reach (`saved-views-bar.tsx:246-289`): the generic breakage, and the
 * older no-filter refusal `views.export.refused`.
 */

const LOCALES = ["en-US", "es-ES", "pt-BR"] as const
type Locale = (typeof LOCALES)[number]

/**
 * The two counts a REAL refusal produces on this deployment: `search=a` over `organizations`,
 * re-measured for this phase (50-VALIDATION "Preconditions to RE-MEASURE", 44,254 of 46,054 =
 * 96.09%, refused at `MAX_EXPORT_FRACTION = 0.40`).
 *
 * Named integers rather than round stand-ins on purpose: the sentence is proven with the figures
 * SC-1 actually produces, so a proof that passes here is a proof about the refusal users will hit.
 */
const MATCHED = 44_254
const TOTAL = 46_054

/** Read straight off disk, the same way `locale-parity.test.ts` does, so both gates see one source. */
function loadLocale(locale: Locale): AbstractIntlMessages {
  const raw = readFileSync(new URL(`./${locale}.json`, import.meta.url), "utf8")
  return JSON.parse(raw) as AbstractIntlMessages
}

/**
 * The production translator, constructed exactly as `src/lib/email/i18n.ts:18` constructs it —
 * `createTranslator` from `use-intl/core`, with the same cast, because this is the call whose
 * behaviour is under test. A hand-rolled `String.replace` over `{matched}` would prove that a
 * substitution CAN be done, not that this application's translator does it.
 */
function translatorFor(locale: Locale, namespace: string) {
  return createTranslator({ locale, messages: loadLocale(locale), namespace }) as (
    key: string,
    values?: Record<string, unknown>,
  ) => string
}

/** The refusal sentence as a user in `locale` would receive it, for the measured counts. */
function renderTooBroad(locale: Locale): string {
  return translatorFor(locale, "views")("export.tooBroad", { matched: MATCHED, total: TOTAL })
}

describe("views.export.tooBroad resolves to an actionable refusal (SC-3)", () => {
  for (const locale of LOCALES) {
    describe(locale, () => {
      it("names both counts the server measured", () => {
        const sentence = renderTooBroad(locale)

        // Rendered, not read: `resolve(json, key)` would return the template and satisfy a naive
        // "mentions both numbers" reading without ever interpolating anything.
        expect(
          sentence,
          `${locale}: the refusal must name how many rows matched, or the user cannot act on it`,
        ).toContain(String(MATCHED))
        expect(
          sentence,
          `${locale}: the refusal must name the table total, or "${MATCHED}" has no scale`,
        ).toContain(String(TOTAL))
      })

      it("actually interpolated — no placeholder token survives", () => {
        const sentence = renderTooBroad(locale)

        // THE ANTI-VACUITY FLOOR. A sentence returned uninterpolated still "contains both numbers"
        // in no useful sense and tells the user nothing, so the absence of the tokens is asserted
        // rather than inferred from the presence of the digits.
        //
        // MEASURED: what `use-intl` does when the caller forgets the values depends on WHICH BUILD
        // is loaded, and the two failure modes are caught by two DIFFERENT cells in this file.
        //   - development build (what vitest resolves): logs `IntlError: FORMATTING_ERROR` and
        //     returns the KEY PATH, "views.export.tooBroad". No braces, so THIS cell passes and the
        //     sibling `toContain(String(MATCHED))` cell is what fires.
        //   - production build: returns the template with `{matched}` intact. THIS cell fires.
        // Either way the user reads garbage — the Phase 45 finding, that a message which fails to
        // resolve renders its own dot-path — so both cells are kept and neither is redundant.
        expect(sentence, `${locale}: {matched} was not interpolated`).not.toContain("{matched}")
        expect(sentence, `${locale}: {total} was not interpolated`).not.toContain("{total}")
      })

      it("reads differently from the generic breakage and from the no-filter refusal", () => {
        const sentence = renderTooBroad(locale)
        const tBulk = translatorFor(locale, "bulk")
        const tViews = translatorFor(locale, "views")

        // SC-3's second half, as an assertion rather than an eyeball. Both comparands are RESOLVED
        // through the same translator, so this compares what two users would actually read.
        expect(
          sentence,
          `${locale}: a blocked broad export must be distinguishable from a broken one — ` +
            `bulk.error.exportFailed is the generic breakage and tells the user to refresh`,
        ).not.toEqual(tBulk("error.exportFailed"))

        expect(
          sentence,
          `${locale}: a blocked broad export must also be distinguishable from the NO-FILTER ` +
            `refusal — views.export.refused is a different cause with a different remedy`,
        ).not.toEqual(tViews("export.refused"))
      })
    })
  }

  it("the three locales render three different sentences", () => {
    const rendered = LOCALES.map(renderTooBroad)

    // Pairwise, so the failure names the colliding pair rather than reporting "not 3".
    for (let i = 0; i < LOCALES.length; i++) {
      for (let j = i + 1; j < LOCALES.length; j++) {
        expect
          .soft(
            rendered[i],
            `${LOCALES[i]} and ${LOCALES[j]} render the same sentence — one locale was copied ` +
              `from the other, and a user in one of them is reading the wrong language`,
          )
          .not.toEqual(rendered[j])
      }
    }

    expect(new Set(rendered).size, "three locales must yield three distinct sentences").toBe(
      LOCALES.length,
    )
  })

  it("the assertions above are reading tooBroad and not any string with numbers in it", () => {
    // THE DISCRIMINATING CELL. Every assertion above would also pass over some OTHER export string
    // that happened to carry digits, and `views.export.tooMany` is exactly that neighbour: it is
    // the absolute-cap refusal, it interpolates a number, and it is one key away in the same
    // object. Resolving it with the cap must NOT produce the selectivity counts.
    const tooMany = translatorFor("en-US", "views")("export.tooMany", { max: 50_000 })

    expect(tooMany, "views.export.tooMany must interpolate its own {max}").toContain("50000")
    expect(
      tooMany,
      "views.export.tooMany must not carry the selectivity counts — if it does, the cells above " +
        "are not specific to the key this plan added",
    ).not.toContain(String(MATCHED))
    expect(tooMany).not.toEqual(renderTooBroad("en-US"))
  })

  it("the counts are NOT locale-grouped, and that is a deliberate ICU choice", () => {
    /*
     * PINNED, WITH ITS REASON, BECAUSE THE OBVIOUS "FIX" BREAKS A SHIPPED GATE.
     *
     * `{matched}` is a SIMPLE ICU argument, so `use-intl` stringifies it: en-US renders `44254`,
     * not `44,254`. Declaring the type — `{matched, number}` — would group it per locale, which
     * reads better, AND WOULD SILENTLY REMOVE THIS KEY FROM `placeholderDrift`: that gate's
     * placeholder regex is `/\{[a-zA-Z0-9_]+\}/g`, which matches `{matched}` and does NOT match
     * `{matched, number}` (measured both ways in-session). A typed argument therefore yields an
     * empty expected set, the gate `continue`s past the key, and the cross-locale placeholder
     * contract stops covering the one views string that carries two of them.
     *
     * Every interpolating key in all eight contracts in `locale-parity.test.ts` uses the simple
     * form, so the simple form is also the house convention rather than an oversight here.
     *
     * This cell is the tripwire: switching the JSON to `{matched, number}` turns it red, which is
     * the prompt to extend `placeholders()` in the SAME commit. Recorded for 50-05 / 50-08 as an
     * open copy question, not as a defect being hidden.
     */
    const enUS = renderTooBroad("en-US")
    const grouped = new Intl.NumberFormat("en-US").format(MATCHED)

    // The premise, exercised rather than assumed: grouping really would change the digits, so this
    // cell is not comparing a string to itself.
    expect(grouped, "Intl grouping must differ from the bare digits or this cell is vacuous").not.toEqual(
      String(MATCHED),
    )
    expect(
      enUS,
      "views.export.tooBroad uses simple ICU arguments; if this is now grouped, extend " +
        "placeholders() in locale-parity.test.ts in the same commit",
    ).not.toContain(grouped)
  })
})
