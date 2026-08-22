/**
 * V-40-4 — the call-site census.
 *
 * Every `router.push(...)` / `router.replace(...)` ARGUMENT EXPRESSION in the six client files this
 * phase edits, plus the saved-views bar, is extracted and classified: it either derives from
 * `withViewEscape(` / `withViewSelection(`, or it is a named exemption matched by exact expression
 * text. Nothing else passes.
 *
 * WHY IT MATTERS. `withViewEscape` is load-bearing and its failure mode is silent. A navigation that
 * builds `/activities?` — a zero-length query — is read by Next as "no params at all", which is
 * byte-for-byte the condition the default-view redirect guard tests. A user pressing "Clear filters"
 * would be sent straight back into the filters they were leaving.
 *
 * WHY IT IS NOT A GREP. Raw-token criteria were hit five times in Phase 39: the comment explaining a
 * rule trips the rule's own grep, and deleting the comment also passes, which is the wrong fix. Two
 * of the files below ALREADY contain comments holding the literal text `router.push(pathname)` and
 * `router.push("/activities")` — `activity-filters.tsx:93` and `activities-client.tsx:378`, both
 * written to explain what those sites used to be. A token count would read four and three
 * navigations in those files. This gate reads three and two, because `readStrippedSource` removes
 * comments BEFORE anything is extracted and because an argument expression cannot be satisfied by
 * prose. Deleting either comment changes no assertion here.
 *
 * WHAT THIS TEST IS NOT:
 *   - it does not measure anything and never opens a browser
 *   - it does not prove the escape WORKS. That `withViewEscape` produces a non-empty query is plan
 *     40-01's V-40-6 pure-function proof; that the round trip behaves is plan 40-15's.
 *   - it does not check per-component layout. Plans 40-08/09/10 own that.
 *
 * It proves exactly one thing: no list-route navigation in these seven files bypasses the helper.
 *
 * MEASURED, NOT ASSUMED. The census below was re-derived from the committed tree, not copied from
 * the plan. Six files: 17 navigations, 13 escaped, 4 exempt. The bar: 2 more. 19 in total.
 */
import { describe, expect, it } from "vitest"

import { callArguments, readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"

const URL_PARAMS_MODULE = "@/lib/views/url-params"

/** The sentence a failure has to print, because the defect is invisible without it. */
const WHY = [
  "A list-route navigation that does not pass through withViewEscape lands on a bare or empty",
  "query. The default-view redirect guard reads that as 'no params' and sends the user straight",
  "back into their default view — so pressing Clear filters would return them to the filters they",
  "were leaving.",
].join(" ")

interface NavSite {
  file: string
  /** The enclosing function or JSX handler. Used only in failure messages. */
  where: string
  rule: "escaped" | "exempt"
  /** For "exempt" only: the EXACT argument expression, whitespace-normalised. */
  exactArgument?: string
  /** For "exempt" only: why it is allowed to skip the helper. */
  reason?: string
}

const ORGS = "src/app/organizations/data-table.tsx"
const PEOPLE = "src/app/people/data-table.tsx"
const DEAL_FILTERS = "src/app/deals/deal-filters.tsx"
const KANBAN = "src/app/deals/kanban-board.tsx"
const ACTIVITY_FILTERS = "src/app/activities/activity-filters.tsx"
const ACTIVITIES_CLIENT = "src/app/activities/activities-client.tsx"
const BAR = "src/components/views/saved-views-bar.tsx"

/** The six filter surfaces. They change filters, searches and pages; none of them mints a view. */
const SIX_FILES = [
  ORGS,
  PEOPLE,
  DEAL_FILTERS,
  KANBAN,
  ACTIVITY_FILTERS,
  ACTIVITIES_CLIENT,
] as const

const DETAIL_ROUTE_REASON =
  "detail-route navigation — it leaves the list entirely for a record page, so there is no filter " +
  "state to escape and no list query for the redirect guard to read"

const PIPELINE_REASON =
  "already carries `?pipeline=`, a saveable key, so the query is never empty and the redirect " +
  "guard cannot fire. Plan 40-12 proved this with a negative test: adding withViewEscape here " +
  "turned its own gate RED. The expression text must stay byte-identical"

const SITES: NavSite[] = [
  // ---- organizations/data-table.tsx — 4 sites, 3 escaped, 1 exempt
  { file: ORGS, where: "handleSearchChange (non-empty), L348", rule: "escaped" },
  { file: ORGS, where: "handleSearchChange (cleared), L361", rule: "escaped" },
  {
    file: ORGS,
    where: "useDataTableKeyboard onOpen, L370",
    rule: "exempt",
    exactArgument: "`/organizations/${org.id}`",
    reason: DETAIL_ROUTE_REASON,
  },
  { file: ORGS, where: "Load More, L570", rule: "escaped" },

  // ---- people/data-table.tsx — 4 sites, 3 escaped, 1 exempt
  { file: PEOPLE, where: "handleSearchChange (non-empty), L216", rule: "escaped" },
  { file: PEOPLE, where: "handleSearchChange (cleared), L229", rule: "escaped" },
  {
    file: PEOPLE,
    where: "useDataTableKeyboard onOpen, L311",
    rule: "exempt",
    exactArgument: "`/people/${person.id}`",
    reason: DETAIL_ROUTE_REASON,
  },
  { file: PEOPLE, where: "Load More, L511", rule: "escaped" },

  // ---- deals/deal-filters.tsx — 2 sites, both escaped
  { file: DEAL_FILTERS, where: "setFilter, L86", rule: "escaped" },
  { file: DEAL_FILTERS, where: "clearAll, L97", rule: "escaped" },

  // ---- deals/kanban-board.tsx — 2 sites, both exempt
  {
    file: KANBAN,
    where: "handlePipelineChange, L459",
    rule: "exempt",
    exactArgument: "`${pathname}?pipeline=${pipelineId}`",
    reason: PIPELINE_REASON,
  },
  {
    file: KANBAN,
    where: 'no-results "Clear filters" button, L560',
    rule: "exempt",
    exactArgument: "`${pathname}?pipeline=${selectedPipelineId}`",
    reason: PIPELINE_REASON,
  },

  // ---- activities/activity-filters.tsx — 3 sites, all escaped
  { file: ACTIVITY_FILTERS, where: "setFilter, L90", rule: "escaped" },
  { file: ACTIVITY_FILTERS, where: "clearAll, L96", rule: "escaped" },
  {
    file: ACTIVITY_FILTERS,
    // Not in 40-UI-SPEC's escape table. Emptying the search box when it was the only filter left
    // `/activities?` behind. Plan 40-13 found it and named the discrepancy at the site.
    where: "handleSearchChange, L124 (absent from UI-SPEC's table)",
    rule: "escaped",
  },

  // ---- activities/activities-client.tsx — 2 sites, both escaped
  { file: ACTIVITIES_CLIENT, where: "handleLoadMore, L206", rule: "escaped" },
  { file: ACTIVITIES_CLIENT, where: 'no-results "Clear filters", L389', rule: "escaped" },

  // ---- the bar — the ONLY file that mints a selection
  { file: BAR, where: "selectView, L198", rule: "escaped" },
  { file: BAR, where: "selectAllRecords, L207", rule: "escaped" },
]

/* ---------------------------------------------------------------- helpers */

const normalise = (text: string) => text.replace(/\s+/g, " ").trim()

/** Every navigation argument expression in a file, comments removed FIRST. */
function navArguments(file: string): string[] {
  const source = readStrippedSource(file)
  return [...callArguments(source, "router.push"), ...callArguments(source, "router.replace")].map(
    normalise
  )
}

const rowsFor = (file: string) => SITES.filter((s) => s.file === file)

const derivesFromHelper = (argument: string) =>
  argument.includes("withViewEscape(") || argument.includes("withViewSelection(")

/**
 * The names a file imports from a module, read from the import statement itself rather than by
 * substring search — an unused import would otherwise look like compliance.
 */
function namedImportsFrom(source: string, module: string): string[] {
  const escaped = module.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&")
  const pattern = new RegExp(
    String.raw`import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']${escaped}["']`,
    "g"
  )

  const names: string[] = []
  for (const match of source.matchAll(pattern)) {
    for (const part of match[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/)[0]?.trim()
      if (name) names.push(name)
    }
  }
  return names
}

/* ------------------------------------------------------------- the census */

describe("V-40-4 — every navigation is escaped or a named exemption", () => {
  describe.each(SIX_FILES)("%s", (file) => {
    const expected = rowsFor(file)

    it("contains exactly the navigations in the census", () => {
      const args = navArguments(file)

      // This is what catches a NEW call site: an eighteenth navigation is in neither the escaped
      // nor the exempt set, and this fails before classification gets a chance to.
      expect(
        args.length,
        `${file}: found ${args.length} router.push/replace call sites but the census lists ` +
          `${expected.length}.\n` +
          `Census: ${expected.map((r) => `${r.where} [${r.rule}]`).join("; ")}\n` +
          `Extracted:\n${args.map((a) => `    ${a}`).join("\n")}\n\n` +
          `A navigation added to this file must be added to the census in this test, either as ` +
          `"escaped" or as an "exempt" row with its exact argument text and a reason. ${WHY}`
      ).toBe(expected.length)
    })

    it("routes every non-exempt navigation through withViewEscape or withViewSelection", () => {
      const exemptTexts = new Set(
        expected.filter((r) => r.rule === "exempt").map((r) => normalise(r.exactArgument ?? ""))
      )

      const offenders = navArguments(file).filter(
        (argument) => !exemptTexts.has(argument) && !derivesFromHelper(argument)
      )

      expect(
        offenders,
        `${file}: ${offenders.length} navigation argument expression(s) neither derive from a ` +
          `view helper nor match a named exemption:\n` +
          `${offenders.map((o) => `    ${o}`).join("\n")}\n\n${WHY}`
      ).toEqual([])
    })

    it("consumes every named exemption exactly once", () => {
      const args = navArguments(file)

      for (const row of expected.filter((r) => r.rule === "exempt")) {
        const wanted = normalise(row.exactArgument ?? "")
        const hits = args.filter((a) => a === wanted).length

        expect(
          hits,
          `${file}: the exemption for ${row.where} matched ${hits} argument expressions, ` +
            `expected exactly 1.\n` +
            `  Exempt because: ${row.reason}\n` +
            `  Expected text : ${wanted}\n` +
            `  Extracted     :\n${args.map((a) => `    ${a}`).join("\n")}\n\n` +
            `An exemption that stops matching exactly must be re-examined, not widened. ${WHY}`
        ).toBe(1)
      }
    })
  })

  describe("across the six filter surfaces", () => {
    const allArgs = SIX_FILES.flatMap((file) =>
      navArguments(file).map((argument) => ({ file, argument }))
    )
    const exemptTexts = new Set(
      SITES.filter((s) => s.rule === "exempt").map((s) => normalise(s.exactArgument ?? ""))
    )

    it("holds exactly 17 navigations", () => {
      expect(
        allArgs.length,
        `expected 17 navigations across the six filter surfaces, found ${allArgs.length}`
      ).toBe(17)
    })

    it("escapes exactly 13 of them", () => {
      const escaped = allArgs.filter(
        (a) => !exemptTexts.has(a.argument) && derivesFromHelper(a.argument)
      )

      expect(
        escaped.length,
        `expected 13 escaped navigations, found ${escaped.length}:\n` +
          escaped.map((a) => `    ${a.file}: ${a.argument}`).join("\n")
      ).toBe(13)
    })

    it("exempts exactly 4 of them", () => {
      const exempt = allArgs.filter((a) => exemptTexts.has(a.argument))

      expect(
        exempt.length,
        `expected 4 exempt navigations, found ${exempt.length}:\n` +
          exempt.map((a) => `    ${a.file}: ${a.argument}`).join("\n")
      ).toBe(4)
    })

    it("mints no view selection — a filter toolbar must never reassign which view is open", () => {
      const minting = allArgs.filter((a) => a.argument.includes("withViewSelection("))

      expect(
        minting,
        `withViewSelection( appears in ${minting.length} navigation(s) on a filter surface:\n` +
          `${minting.map((a) => `    ${a.file}: ${a.argument}`).join("\n")}\n\n` +
          `Only the saved-views bar may mint a selection. A filter toolbar that wrote view= would ` +
          `let changing a filter silently REASSIGN which saved view is open, so the user's next ` +
          `"update this view" would overwrite a view they never chose.`
      ).toEqual([])
    })

    it("imports withViewEscape exactly when it escapes something", () => {
      for (const file of SIX_FILES) {
        const source = readStrippedSource(file)
        const imports = namedImportsFrom(source, URL_PARAMS_MODULE)
        const escapesSomething = navArguments(file).some((a) => a.includes("withViewEscape("))

        expect(
          imports.includes("withViewEscape"),
          escapesSomething
            ? `${file} escapes at least one navigation but does not import withViewEscape from ` +
                `${URL_PARAMS_MODULE}. Imported: [${imports.join(", ") || "none"}]`
            : `${file} imports withViewEscape from ${URL_PARAMS_MODULE} but escapes nothing — ` +
                `an unused import reads as compliance without being it. Every navigation here is ` +
                `a named exemption; if that changed, update the census.`
        ).toBe(escapesSomething)
      }
    })
  })

  describe(`${BAR} — the only file that mints a selection`, () => {
    const expected = rowsFor(BAR)

    it("contains exactly the navigations in the census", () => {
      const args = navArguments(BAR)

      expect(
        args.length,
        `${BAR}: found ${args.length} router.push/replace call sites, census lists ` +
          `${expected.length}.\nExtracted:\n${args.map((a) => `    ${a}`).join("\n")}`
      ).toBe(expected.length)
    })

    it("derives every navigation from a view helper", () => {
      const offenders = navArguments(BAR).filter((argument) => !derivesFromHelper(argument))

      expect(
        offenders,
        `${BAR}: navigation(s) bypassing both view helpers:\n` +
          `${offenders.map((o) => `    ${o}`).join("\n")}\n\n${WHY}`
      ).toEqual([])
    })

    it("mints its selection through withViewSelection", () => {
      const minting = navArguments(BAR).filter((a) => a.includes("withViewSelection("))

      expect(
        minting.length,
        `${BAR} must mint its view selection through withViewSelection at least once; found ` +
          `${minting.length}. This is the one file where that helper belongs.`
      ).toBeGreaterThanOrEqual(1)
    })

    it("never hand-builds a literal view=", () => {
      const handBuilt = navArguments(BAR).filter((argument) => argument.includes("view="))

      expect(
        handBuilt,
        `${BAR}: ${handBuilt.length} navigation(s) write a literal view= instead of going ` +
          `through withViewSelection:\n${handBuilt.map((o) => `    ${o}`).join("\n")}\n\n` +
          `A hand-built view= bypasses every refusal withViewSelection makes — it will happily ` +
          `select a view over an unfiltered list, or write an id that resolves to nothing. This ` +
          `shape passes a withViewEscape-only gate, which is exactly why it is asserted here.`
      ).toEqual([])
    })

    it("never combines both helpers in one expression", () => {
      const both = navArguments(BAR).filter(
        (a) => a.includes("withViewEscape(") && a.includes("withViewSelection(")
      )

      expect(
        both,
        `${BAR}: expression(s) using BOTH helpers at once:\n` +
          `${both.map((o) => `    ${o}`).join("\n")}\n\n` +
          `Escaping and selecting are opposite intents — one drops the view, the other assigns it.`
      ).toEqual([])
    })

    it("imports both helpers from the url-params module", () => {
      const imports = namedImportsFrom(readStrippedSource(BAR), URL_PARAMS_MODULE)

      expect(imports, `${BAR} imports: [${imports.join(", ") || "none"}]`).toEqual(
        expect.arrayContaining(["withViewEscape", "withViewSelection"])
      )
    })
  })
})
