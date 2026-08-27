/**
 * THE EXPORT READ SURFACE IS SIX FILES WIDE, AND EACH ONE'S BOUND IS ASSERTED (SEC-03, T-50-05-07).
 *
 * ── THE GAP THIS FILE CLOSES, QUOTED FROM THE ASSERTION THAT LEAVES IT ──────────────────────────
 *
 * `view-filters.test.ts` already asserts, inside
 * `describe("exportViewResults is guarded, capped and not admin-gated")`:
 *
 *     const calls = callArguments(actionSource, "fetchFilteredData")
 *     // Exactly one call site: a second, uncapped one would be the whole cap defeated.
 *     expect(calls).toHaveLength(1)
 *
 * That is a true and useful assertion, and its scope is stated one line above it: `actionSource` is
 * `readStrippedSource("src/lib/views/export-action.ts")`. **It reads ONE FILE.** So it catches a
 * second, uncapped call added to `export-action.ts` — and it is completely blind to a second
 * view-export path added in a NEW file, which is the cheaper and more likely way for one to appear.
 * A `src/app/api/v1/export/route.ts`, or a `src/lib/views/export-all-action.ts`, would leave that
 * `toHaveLength(1)` perfectly green.
 *
 * PLAN 50-05 BOUNDS EXACTLY ONE CALL SITE. This file is what makes that fact durable, because the
 * failure mode the phase exists to prevent is not "the bound was written wrong" — it is "the bound
 * was written at one call site while another stayed open". Phase 48's CR-02 and CR-05 both took that
 * shape. So the enumeration is asserted repo-wide, in BOTH directions, with the offending path
 * NAMED in the failure output.
 *
 * ── WHAT WAS REUSED RATHER THAN REINVENTED ──────────────────────────────────────────────────────
 *
 * THE REPO WALK comes from `src/lib/__tests__/suite-hook-hygiene.test.ts` — its `walkTestFiles`
 * shape, its `REPO_ROOT = process.cwd()` anchor, its `readdirSync(…, { withFileTypes: true })`
 * recursion, and its practice of putting a MEASURED floor under the corpus so a broken walk cannot
 * pass by finding nothing. The predicate is inverted (production files, not test files) and
 * `__tests__` directories are pruned. That file is the second walk in the repo, this is the third,
 * and no fourth should be written — promote a shared helper instead.
 *
 * THE COMMENT STRIPPING comes from `src/components/custom-fields/__tests__/source-scan.ts`, and it
 * is not optional here. Both `src/lib/export/formatters.ts` and `src/app/organizations/actions.ts`
 * name `fetchFilteredData` IN PROSE — organizations/actions.ts:455-460 is a TOMBSTONE comment that
 * deliberately writes out `ExportOptions` and `ExportFilters` so that a signature gate which stopped
 * stripping comments would fail loudly instead of passing while detecting nothing. A raw grep here
 * would count those and report seven or eight sites. That collision is this repository's most
 * repeated review defect — nine times in Phase 37 alone.
 *
 * ── THE ONE EXCLUSION, AND WHY IT IS NOT A CARVE-OUT ───────────────────────────────────────────
 *
 * `formatters.ts` DECLARES `fetchFilteredData`, so `fetchFilteredData(` appears in it as the
 * declaration's own parameter list. `callSites` below skips an occurrence preceded by the keyword
 * `function`, and it does so by SHAPE rather than by path — `formatters.ts` stays in the corpus. A
 * real call added inside `formatters.ts` therefore still reddens cell 2 and names that file. An
 * excluded-path list would have hidden it.
 */
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { stripComments } from "@/components/custom-fields/__tests__/source-scan"

const REPO_ROOT = process.cwd()

/** The tree every vitest project in this repo collects from. */
const SRC_ROOT = "src"

const TEST_FILE = /\.(test|spec)\.(c|m)?[jt]sx?$/
const SOURCE_FILE = /\.(ts|tsx)$/

/**
 * FLOOR ON THE PRODUCTION CORPUS. **Measured on the tree this file was written against: 532.** The
 * floor is 400, set deliberately below the measurement so ordinary refactoring does not fatal with a
 * message that misdiagnoses shrinkage as a broken walk — the same reasoning, and the same numeric
 * margin, that `suite-hook-hygiene.test.ts` states for its own `MIN_TEST_FILES = 150` against a
 * measured 178.
 *
 * WITHOUT THIS FLOOR EVERY OTHER CELL IN THIS FILE IS VACUOUS. A wrong `SRC_ROOT`, a pruning bug, or
 * a recursion that stopped recursing yields an empty file list, therefore zero `fetchFilteredData`
 * sites, therefore a set that will never equal the six expected paths — which reddens cell 2 loudly.
 * But cell 5's NEGATIVE ("no api file calls it") would pass perfectly on nothing at all, and so
 * would any future negative added here. Falsified on purpose: pointing the walk at a directory that
 * does not exist, transcript in 50-05-SUMMARY.md.
 */
const MIN_PRODUCTION_FILES = 400

/**
 * FLOOR ON THE `src/app/api` CORPUS, for the same reason at cell 5's own scale. **Measured: 52.**
 * 40 is the floor. Cell 5 asserts an ABSENCE across these files, and an absence over an empty set is
 * the purest form of a gate that cannot fail.
 */
const MIN_API_FILES = 40

/**
 * THE SIX PRODUCTION FILES THAT READ THROUGH `fetchFilteredData`, sorted.
 *
 * | # | call site | bounded by | maxRows | audit row |
 * |---|---|---|---|---|
 * | 1 | `src/lib/views/export-action.ts` | `guardExportInput` + the SEC-03 selectivity refusal | `EXPORT_ROW_CAP` | yes |
 * | 2 | `src/app/admin/export/actions.ts` | a `role !== "admin"` refusal | none, deliberately | no |
 * | 3 | `src/app/organizations/actions.ts` | `ids` only, `BULK_MAX_IDS = 100` | none | no |
 * | 4 | `src/app/people/actions.ts` | same | none | no |
 * | 5 | `src/app/deals/actions.ts` | same | none | no |
 * | 6 | `src/app/activities/actions.ts` | same | none | no |
 *
 * Site 2 is unbounded ON PURPOSE and that is not the hole SEC-03 is about: it is reachable only
 * after an explicit role refusal, and `types.ts:55-57` names it as the caller `maxRows` must stay
 * optional for. Sites 3-6 take `(ids: string[])` and nothing else — a security boundary rather than
 * a style preference (T-38-01), because a non-admin action accepting an options object and receiving
 * `{}` would fetch the whole table.
 */
const EXPECTED_CALL_SITES = [
  "src/app/activities/actions.ts",
  "src/app/admin/export/actions.ts",
  "src/app/deals/actions.ts",
  "src/app/organizations/actions.ts",
  "src/app/people/actions.ts",
  "src/lib/views/export-action.ts",
] as const

/**
 * The four ids-only bulk exports: file, exported action, entity literal, and THE NAME OF THE ID
 * PARSER THAT FILE USES.
 *
 * THE FOURTH COLUMN IS NOT DECORATION, and it exists because this file's first draft assumed one
 * name and went RED against correct code. **Measured: there are FOUR module-private copies of the
 * same parser, under TWO names** — `parseIdList` in `organizations/actions.ts:248`, and
 * `parseBulkIds` in `people/actions.ts:235`, `deals/actions.ts:204` and `activities/actions.ts:175`.
 * Each is `(raw: unknown): string[] | null`. Nothing in the repository asserts they agree.
 *
 * The duplication is recorded rather than fixed — consolidating four private helpers is not this
 * plan's work — but the column keeps the assertion HONEST: it asserts the parser each file actually
 * uses, so it fails when a real bound disappears rather than when a name differs. See the
 * observation in 50-05-SUMMARY.md.
 */
const BULK_SITES = [
  ["src/app/organizations/actions.ts", "exportSelectedOrganizations", "organization", "parseIdList"],
  ["src/app/people/actions.ts", "exportSelectedPeople", "person", "parseBulkIds"],
  ["src/app/deals/actions.ts", "exportSelectedDeals", "deal", "parseBulkIds"],
  ["src/app/activities/actions.ts", "exportSelectedActivities", "activity", "parseBulkIds"],
] as const

const VIEW_SITE = "src/lib/views/export-action.ts"
const ADMIN_SITE = "src/app/admin/export/actions.ts"

/**
 * Every production `.ts`/`.tsx` file under `relativeDir`, as repo-relative POSIX paths.
 *
 * `__tests__` directories are PRUNED and `*.test.*` / `*.spec.*` files are skipped, because a gate
 * counting its own assertions would report itself as a call site: this very file names
 * `fetchFilteredData` in a string literal, and `view-filters.test.ts` and `formatters.test.ts` both
 * call it for real against a mocked `db`.
 *
 * The only regular expressions here match FILE NAMES.
 */
function walkProductionFiles(relativeDir: string): string[] {
  const out: string[] = []

  for (const entry of readdirSync(path.join(REPO_ROOT, relativeDir), { withFileTypes: true })) {
    const rel = `${relativeDir}/${entry.name}`

    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue
      out.push(...walkProductionFiles(rel))
      continue
    }

    if (!SOURCE_FILE.test(entry.name)) continue
    if (TEST_FILE.test(entry.name)) continue

    out.push(rel)
  }

  return out
}

const PRODUCTION_FILES = walkProductionFiles(SRC_ROOT).sort()

const sourceCache = new Map<string, string>()

/** Comment-stripped source, read once per file per run. */
function source(relativePath: string): string {
  const cached = sourceCache.get(relativePath)
  if (cached !== undefined) return cached

  const stripped = stripComments(readFileSync(path.join(REPO_ROOT, relativePath), "utf8"))
  sourceCache.set(relativePath, stripped)

  return stripped
}

/**
 * Byte offsets of every real `${callee}(` CALL in comment-stripped source.
 *
 * Two things are excluded, both by shape and never by path:
 *
 *   - a partial identifier match — `myFetchFilteredData(` is not `fetchFilteredData(`, the same
 *     boundary check `callArguments` makes in `source-scan.ts`;
 *   - the DECLARATION, `function ${callee}(` in any of its forms (`export async function …`), whose
 *     parameter list is otherwise indistinguishable from an argument list.
 */
function callSites(src: string, callee: string): number[] {
  const marker = `${callee}(`
  const hits: number[] = []
  let from = 0

  for (;;) {
    const at = src.indexOf(marker, from)
    if (at === -1) break

    from = at + marker.length

    const before = at === 0 ? "" : src[at - 1]
    if (/[A-Za-z0-9_$]/.test(before)) continue
    if (/\bfunction$/.test(src.slice(0, at).trimEnd())) continue

    hits.push(at)
  }

  return hits
}

/** The production files containing at least one real call to `callee`, sorted. */
function callingFiles(callee: string): string[] {
  return PRODUCTION_FILES.filter((file) => callSites(source(file), callee).length > 0).sort()
}

describe("SEC-03 — the fetchFilteredData read surface, enumerated repo-wide", () => {
  it("1. the walk found a real corpus — the floor under every cell below", () => {
    expect(
      PRODUCTION_FILES.length,
      `the production walk under ${SRC_ROOT}/ found only ${PRODUCTION_FILES.length} files, below ` +
        `the floor of ${MIN_PRODUCTION_FILES} (measured: 532). A wrong root, a pruning bug or a ` +
        `recursion that stopped recursing yields an empty corpus — and an EMPTY corpus satisfies ` +
        `every negative assertion in this file perfectly.`
    ).toBeGreaterThanOrEqual(MIN_PRODUCTION_FILES)

    // The walk really reaches the two subtrees the assertions below are about, not just `src/`'s
    // top level — a recursion that descended one directory would clear the floor and still miss
    // every call site.
    expect(PRODUCTION_FILES).toContain(VIEW_SITE)
    expect(PRODUCTION_FILES).toContain(ADMIN_SITE)
    // And it EXCLUDES tests, so a gate cannot be satisfied by another gate's assertions.
    expect(PRODUCTION_FILES).not.toContain("src/lib/export/__tests__/view-filters.test.ts")
    expect(PRODUCTION_FILES).not.toContain("src/lib/export/formatters.test.ts")
  })

  it("2. EXACTLY these six production files call fetchFilteredData — both directions", () => {
    const found = callingFiles("fetchFilteredData")

    // A sorted `toEqual` rather than a count, so the failure output NAMES the offender. A seventh
    // site shows up as an extra path; a bound removed by deleting a whole file shows up as a
    // missing one. Falsified on purpose by adding a real seventh call site — transcript in
    // 50-05-SUMMARY.md.
    expect(
      found,
      `the set of production files calling fetchFilteredData has changed. Every one of them reads ` +
        `rows out of a customer table, so each needs a stated bound (SEC-03). If you added a call ` +
        `site: bound it, then add it to EXPECTED_CALL_SITES together with its classification in ` +
        `cell 3. Do NOT add the path without the classification.`
    ).toEqual([...EXPECTED_CALL_SITES])

    expect(found).toHaveLength(6)
    expect(EXPECTED_CALL_SITES).toHaveLength(6)

    // One call per file. A second call inside an ALREADY-listed file would keep the set equal
    // while adding an unbounded read — the one thing a path-set assertion cannot see on its own.
    for (const file of found) {
      expect(
        callSites(source(file), "fetchFilteredData"),
        `${file} calls fetchFilteredData more than once. The enumeration above still says six ` +
          `files, so this is the shape a second, unbounded read hides in.`
      ).toHaveLength(1)
    }

    // `formatters.ts` DECLARES it and is still in the corpus — the declaration is excluded by
    // shape, not by an excluded-path list, so a real call added there would appear above.
    expect(PRODUCTION_FILES).toContain("src/lib/export/formatters.ts")
    expect(found).not.toContain("src/lib/export/formatters.ts")
  })

  it("3a. site 1, the view export, is bounded by the guard AND by the selectivity refusal", () => {
    const src = source(VIEW_SITE)

    // BOTH controls, and this is the second independent detector for the pair — `view-filters.test.ts`
    // asserts the same two calls from the single-file side. Deleting the SEC-03 fix therefore
    // reddens two gates in two files rather than one.
    expect(
      callSites(src, "guardExportInput"),
      `${VIEW_SITE} lost its guardExportInput call. Without it an action handed \`{}\` returns the ` +
        `whole table (38-CONTEXT.md:110-116).`
    ).toHaveLength(1)
    expect(
      callSites(src, "countExportMatches"),
      `${VIEW_SITE} lost its countExportMatches call — SEC-03's bound has no numbers to decide on.`
    ).toHaveLength(1)
    expect(
      callSites(src, "decideSelectivity"),
      `${VIEW_SITE} lost its decideSelectivity call. The count still runs and its answer is now ` +
        `discarded, so \`search=a\` walks out 96.09% of the customer table again.`
    ).toHaveLength(1)

    // The cap is the third, independent bound and it stays even though the 0.40 fraction makes it
    // unreachable below ~125,000 rows on any one table. See the action's own comment.
    expect(src).toContain("maxRows: EXPORT_ROW_CAP")
  })

  it("3b. site 2, the admin full export, is unbounded but reachable only past a role refusal", () => {
    const src = source(ADMIN_SITE)

    // This is the ONE call site allowed to pass no `maxRows`, and the refusal above it is the whole
    // reason. Removing that refusal turns a deliberate admin tool into an unbounded export
    // reachable by anyone with a session — a real exposure shape whose detector should exist
    // whether or not this phase existed. Falsified on purpose; transcript in 50-05-SUMMARY.md.
    expect(
      /\brole\b/.test(src),
      `${ADMIN_SITE} no longer reads a role. It performs an UNCAPPED, UNFILTERED fetch on a whole ` +
        `entity table; the role refusal is the only thing standing in front of it.`
    ).toBe(true)
    expect(/["']admin["']/.test(src)).toBe(true)
    expect(
      src,
      `${ADMIN_SITE} no longer refuses a non-admin caller. A server action is a POST endpoint and ` +
        `the caller controls the argument.`
    ).toContain("Not authorized")

    // And it is authenticated first, so the role read cannot be reached on a null session.
    expect(src.indexOf("await auth()")).toBeGreaterThan(-1)
    expect(src.indexOf("await auth()")).toBeLessThan(src.indexOf("Not authorized"))
  })

  it.each(BULK_SITES)(
    "3c. site %s is ids-only and capped at BULK_MAX_IDS",
    (file, fnName, entityLiteral, parserName) => {
      const src = source(file)

      // THE SIGNATURE IS THE BOUNDARY (T-38-01). A non-admin action that accepted an options object
      // and received `{}` would fetch every row in the table — an admin-gate bypass reachable by
      // anyone with a session.
      expect(
        src,
        `${file}: ${fnName} no longer takes exactly \`(ids: string[])\`. That signature IS the ` +
          `security boundary — see the tombstone comment in this file.`
      ).toContain(`export async function ${fnName}(ids: string[])`)

      // The parser is DECLARED in this file and CALLED in it — the declaration alone would be
      // satisfied by dead code, and a call alone by an import of something else.
      expect(
        src,
        `${file}: ${parserName} is no longer declared here.`
      ).toContain(`function ${parserName}(raw: unknown): string[] | null`)
      expect(
        callSites(src, parserName),
        `${file}: ${parserName} is never called, so the id list is no longer narrowed and deduped ` +
          `before the read.`
      ).not.toHaveLength(0)

      expect(
        src,
        `${file}: BULK_MAX_IDS is gone, so the ids-only export is no longer capped at 100.`
      ).toContain("BULK_MAX_IDS")

      // The call itself narrows by ids and nothing else. A `filters` object that grew any other key
      // here would be a filter-taking export with no guard in front of it.
      const at = callSites(src, "fetchFilteredData")[0]
      const call = src.slice(at, at + 400)

      expect(call).toContain(`entityType: "${entityLiteral}"`)
      expect(
        call,
        `${file}: the bulk export's fetch no longer narrows by \`ids\` alone.`
      ).toContain("filters: { ids: uniqueIds }")
    }
  )

  it("4. guardExportInput, countExportMatches and decideSelectivity have ONE production caller each", () => {
    // A SECOND view-export path is the threat this cell is shaped for, and it is the one cell here
    // that would catch it before it even reached `fetchFilteredData`: a new module importing the
    // guard is a second place where a filter map is authorized.
    for (const callee of ["guardExportInput", "countExportMatches", "decideSelectivity"]) {
      expect(
        callingFiles(callee),
        `${callee} is called from more than one production file (or from none). A second caller is ` +
          `a second view-export path, and only the one in ${VIEW_SITE} is bounded by all three ` +
          `controls this phase relies on.`
      ).toEqual([VIEW_SITE])
    }

    // IMPORTERS, not just callers, so a module that imports the guard and has not wired it up yet
    // is visible too. The declaring module is excluded by looking for an import statement.
    const importers = PRODUCTION_FILES.filter((file) =>
      /import\s*\{[^}]*\bguardExportInput\b[^}]*\}\s*from/.test(source(file))
    )

    expect(importers).toEqual([VIEW_SITE])
  })

  it("5. NO file under src/app/api calls fetchFilteredData (M-14)", () => {
    const apiFiles = PRODUCTION_FILES.filter((file) => file.startsWith("src/app/api/"))

    // ANTI-VACUITY FIRST. This cell asserts an ABSENCE, and an absence over an empty set is the
    // purest gate that cannot fail. Measured: 52 production files under src/app/api.
    expect(
      apiFiles.length,
      `the walk found only ${apiFiles.length} production files under src/app/api, below the floor ` +
        `of ${MIN_API_FILES} (measured: 52). The absence asserted below would be vacuous.`
    ).toBeGreaterThanOrEqual(MIN_API_FILES)

    const offenders = apiFiles.filter((file) => callSites(source(file), "fetchFilteredData").length > 0)

    // M-14 forbids an export ROUTE, and the reason is not tidiness: the client downloads through
    // the Blob/ObjectURL idiom, and a route is a GET-able URL that would need its own copy of the
    // guard, the cap and the selectivity rule — three controls that exist once today.
    expect(
      offenders,
      `these src/app/api files call fetchFilteredData: ${offenders.join(", ")}. M-14 forbids an ` +
        `export route; a route would need its own guard, its own cap and its own selectivity rule, ` +
        `and every one of them would be a second copy free to drift.`
    ).toEqual([])
  })
})
