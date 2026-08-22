/**
 * THE 40-12 `/deals` MOUNT GATE — a scoped source read over the three files plan 40-12 edits.
 *
 * WHAT THIS TEST IS NOT. It renders nothing. `page.tsx` is a server component that imports `@/db`,
 * which constructs a pool at module load, so importing it here would need a live PostgreSQL —
 * `resolve.test.ts` records the same constraint and takes the same way out. Nothing below proves that
 * a browser shows a board; it proves that the CODE PATH which produces one exists, is reachable, and
 * is not guarded by the condition it must not be guarded by.
 *
 * WHY IT EXISTS ANYWAY. Three of this plan's claims are invisible to a type checker and to every
 * other test in the repo:
 *
 *   1. Decision 4's fallback. An unknown `?pipeline=` used to render `t('pipelineNotFound')` — a
 *      dead-end page with no `error.tsx` above it (M-14). MEASURED against the running container
 *      before this plan: `GET /deals?pipeline=00000000-0000-4000-8000-000000000000` returned 200 with
 *      `…rounded-lg">Pipeline not found.<`. The fix is one expression, and the shape of that
 *      expression is the whole mitigation: the default lookup must NOT sit inside a
 *      `params.pipeline ? … : …` ternary, or a dead id still lands nowhere.
 *   2. Rule P-2. `kanban-board.tsx` renders `<div />` in place of the pipeline cluster when
 *      `pipelines.length <= 1`. Copying that guard onto the bar is the obvious mistake, and it would
 *      hide saved views entirely from any install with one pipeline.
 *   3. Plan 40-14's exemption list. That gate matches `kanban-board.tsx`'s two navigations by EXACT
 *      expression text. A harmless-looking edit to either — `withViewEscape` added "for
 *      consistency" — turns it red. The assertions below pin both byte for byte.
 *
 * EVERY ASSERTION IS SCOPED TO AN EXTRACTED REGION and `readStrippedSource` removes comments first,
 * so the prose above — which names `params.pipeline`, `pipelines.length` and both navigation
 * expressions — cannot satisfy anything below. That is the K-9 trap: a gate satisfied by the comment
 * explaining the rule it was written to enforce.
 *
 * The extractors are IMPORTED from `source-scan.ts`. No fourth brace matcher was added by this plan.
 */
import { describe, it, expect } from "vitest"

import {
  callArguments,
  openingTagAt,
  readStrippedSource,
  tagIndexes,
} from "@/components/custom-fields/__tests__/source-scan"

const PAGE = "src/app/deals/page.tsx"
const BOARD = "src/app/deals/kanban-board.tsx"
const FILTERS = "src/app/deals/deal-filters.tsx"

/** Read fresh inside every test, so one missing expression reports as a named failing assertion. */
const read = (file: string) => readStrippedSource(file)

function occurrences(source: string, needle: string): number {
  return source.split(needle).length - 1
}

/** The single `<${tagName}` opening tag, refusing zero and refusing two. */
function soleOpeningTag(source: string, tagName: string, file: string): string {
  const found = tagIndexes(source, tagName)

  if (found.length !== 1) {
    throw new Error(
      `${file}: expected exactly one <${tagName} in this file, found ${found.length}. Two mounts ` +
        `of the same bar is how one of them stops being maintained.`
    )
  }

  return openingTagAt(source, found[0], `<${tagName}`, file)
}

/**
 * The source between two markers, refusing either being absent and refusing them being out of order.
 *
 * Ordering is half of what this file asserts — the redirect before the pipeline read, the bar between
 * two rows — and a slice built from a missing marker would silently be the empty string, which
 * `not.toContain` passes happily.
 */
function between(source: string, from: string, to: string, file: string): string {
  const start = source.indexOf(from)
  const end = source.indexOf(to)

  if (start === -1) throw new Error(`${file}: marker not found in the source: ${from}`)
  if (end === -1) throw new Error(`${file}: marker not found in the source: ${to}`)
  if (end < start) {
    throw new Error(
      `${file}: the two markers are in the WRONG ORDER — ${to} appears before ${from}. ` +
        `The slice below would be empty, so every assertion on it would pass for the wrong reason.`
    )
  }

  return source.slice(start + from.length, end)
}

describe("deals/page.tsx — the 40-12 resolution gate", () => {
  it("1. Decision 4: the default lookup is NOT gated behind the requested pipeline", () => {
    const source = read(PAGE)
    const declaration = between(
      source,
      "const selectedPipeline =",
      "if (!selectedPipeline)",
      PAGE
    )

    /*
     * THE DISCRIMINATOR IS THE ABSENCE. The pre-plan expression read
     * `params.pipeline ? allPipelines.find(…) : allPipelines.find(p => p.isDefault) || allPipelines[0]`
     * — the default branch existed, but was unreachable for exactly the input that needed it. So it is
     * not enough to assert the default lookup is present: it must be present OUTSIDE any test on
     * `params.pipeline`. That param is read one declaration earlier, into `requestedPipeline`.
     */
    expect(
      declaration,
      `${PAGE}: the selectedPipeline declaration must not read params.pipeline — a dead id has to ` +
        `fall THROUGH to the default board (Decision 4), and a params.pipeline ternary here is ` +
        `exactly what made "Pipeline not found." reachable with 11 live pipelines.`
    ).not.toContain("params.pipeline")

    expect(
      declaration,
      `${PAGE}: the selectedPipeline declaration must start from requestedPipeline ?? — nullish, ` +
        `not a ternary, so an unresolved request continues to the next candidate.`
    ).toContain("requestedPipeline ??")

    expect(
      declaration,
      `${PAGE}: the fallback chain must still prefer the default pipeline.`
    ).toContain("isDefault")

    expect(
      declaration,
      `${PAGE}: the fallback chain must end at allPipelines[0]. MEASURED: all 11 live pipelines ` +
        `have is_default = 0, so the isDefault lookup returns undefined in production TODAY and ` +
        `this last link is the one that actually renders a board.`
    ).toContain("allPipelines[0]")
  })

  it("2. the drop is recorded, and recorded from the request rather than from the result", () => {
    const source = read(PAGE)
    const declaration = between(
      source,
      "const pipelineWasDropped =",
      "const selectedPipeline =",
      PAGE
    )

    expect(
      declaration,
      `${PAGE}: pipelineWasDropped must test that a pipeline WAS asked for. Without it, every ` +
        `default landing would claim a dropped key and print views.degraded over an untouched board.`
    ).toContain("Boolean(params.pipeline)")

    expect(
      declaration,
      `${PAGE}: pipelineWasDropped must test that the request did not resolve.`
    ).toContain("requestedPipeline === undefined")
  })

  it("3. the pipelineNotFound branch is retained, not deleted to tidy the diff", () => {
    const source = read(PAGE)

    expect(
      source,
      `${PAGE}: the if (!selectedPipeline) branch must survive. It is unreachable while ` +
        `allPipelines.length > 0 — which is guarded above — and that is the point: it narrows the ` +
        `type and it is the landing for the day that guard changes. Deleting a branch to make a ` +
        `diff look tidier is how the next reader loses the narrowing.`
    ).toContain("if (!selectedPipeline)")

    expect(source, `${PAGE}: the pipelineNotFound copy must survive with its branch.`).toContain(
      "pipelineNotFound"
    )
  })

  it("4. U-2: the default-view redirect fires only on a bare URL, before any pipeline read", () => {
    const source = read(PAGE)
    const calls = callArguments(source, "resolveDefaultViewRedirect")

    expect(
      calls.length,
      `${PAGE}: expected exactly one resolveDefaultViewRedirect call, found ${calls.length}.`
    ).toBe(1)

    expect(calls[0], `${PAGE}: the redirect resolver must be asked about "deal".`).toContain(
      '"deal"'
    )
    expect(
      calls[0],
      `${PAGE}: the resolver decides visibility from the viewer, so it must receive one.`
    ).toContain("session.user")

    const guarded = between(
      source,
      "Object.keys(params).length === 0",
      "db.query.pipelines.findMany",
      PAGE
    )

    expect(
      guarded,
      `${PAGE}: the resolveDefaultViewRedirect call must sit INSIDE the no-params guard and BEFORE ` +
        `the pipeline read. The guard is "no params at all" — view=none IS a param, so the escape ` +
        `URL never re-enters this branch and the redirect cannot loop (U-2).`
    ).toContain("resolveDefaultViewRedirect")

    expect(
      guarded,
      `${PAGE}: redirect() must target /deals with the resolver's own query string.`
    ).toContain("redirect(`/deals${target}`)")

    /*
     * `redirect()` signals by THROWING. A try/catch around it swallows the navigation and renders the
     * unfiltered board instead — a silent, correct-looking failure with no error anywhere.
     */
    expect(
      guarded,
      `${PAGE}: no try/catch may wrap the redirect — redirect() throws to navigate, so a catch ` +
        `here silently turns a working default view into a bare list.`
    ).not.toContain("try")
  })

  it("5. B-2: all eight bar props come from the resolver, asked about this viewer's URL", () => {
    const source = read(PAGE)
    const calls = callArguments(source, "resolveSavedViewsBarProps")

    expect(
      calls.length,
      `${PAGE}: expected exactly one resolveSavedViewsBarProps call, found ${calls.length}. The ` +
        `eight props are computed in one place (Rule B-2) so a page cannot half-compute them.`
    ).toBe(1)

    expect(calls[0], `${PAGE}: the resolver must be told this is a deal surface.`).toContain(
      'entityType: "deal"'
    )
    expect(calls[0], `${PAGE}: the picker is scoped to the viewer.`).toContain(
      "viewer: session.user"
    )
    expect(
      calls[0],
      `${PAGE}: the resolver reads the URL itself — passing a pre-picked map would give it a second, ` +
        `divergent whitelist.`
    ).toContain("rawSearchParams: params")
  })

  it("6. V-11: a dead pipeline in the URL joins the resolver's dropped keys", () => {
    const source = read(PAGE)
    const merge = between(source, "const viewsBar", "return (", PAGE)

    /*
     * The resolver validates the SELECTED VIEW'S stored filters. It cannot know that the URL's own
     * pipeline failed to resolve, because it never queries pipelines for the URL — this page does.
     * V-11 covers a deleted owner, a deleted stage and a deleted pipeline in ONE sentence, so both
     * sources have to reach the same prop or the third case renders a silently different board with
     * no notice at all.
     */
    expect(
      merge,
      `${PAGE}: the viewsBar prop must be conditioned on pipelineWasDropped.`
    ).toContain("pipelineWasDropped")

    expect(
      merge,
      `${PAGE}: the merge must extend droppedFilterKeys, which is the prop views.degraded reads.`
    ).toContain("droppedFilterKeys")

    expect(
      merge,
      `${PAGE}: the key added must literally be "pipeline" — it is the URL param name, and the ` +
        `notice lists param names.`
    ).toContain('"pipeline"')

    const board = soleOpeningTag(source, "KanbanBoard", PAGE)

    expect(
      board,
      `${PAGE}: <KanbanBoard> must receive the resolved props as one viewsBar prop. Eight separate ` +
        `props threaded through a kanban is how one of them gets dropped in a later refactor.`
    ).toContain("viewsBar={viewsBar}")
  })
})

describe("deals/kanban-board.tsx — the 40-12 mount gate", () => {
  it("7. the bar is mounted exactly once, spread from the resolved props", () => {
    const source = read(BOARD)
    const tag = soleOpeningTag(source, "SavedViewsBar", BOARD)

    expect(
      tag,
      `${BOARD}: the mount must spread the resolver's result. Re-listing the eight props by hand ` +
        `here is a second declaration of the same shape.`
    ).toContain("{...viewsBar}")

    expect(
      source,
      `${BOARD}: the bar must be imported from the one component that owns both dialogs.`
    ).toContain('from "@/components/views/saved-views-bar"')
  })

  it("8. K-8 + M-3 + P-2: the bar is its own row between the pipeline row and the filters", () => {
    const source = read(BOARD)

    /*
     * WHY THIS IS BOUNDED BY OFFSETS AND A `</div>` COUNT RATHER THAN BY `elementRegion`, and this was
     * measured rather than assumed. `elementRegion(source.slice(rowAt), "div")` THROWS here —
     * `src/app/deals/kanban-board.tsx: unterminated <div> region` — because the pipeline row contains
     * the self-closing `<div />` that stands in for the pipeline cluster when there is one pipeline.
     * The shared extractor counts `<div` as an open and only `</div` as a close, so a void element
     * leaves its depth permanently above zero.
     *
     * That is a real gap in the shared helper, and it is NOT patched from here: `source-scan.ts` is
     * read by four other 40-* gates and two sibling plans are editing their own surfaces in parallel.
     * Recorded in 40-12-SUMMARY.md as a blocked deviation instead. No fourth brace matcher was written
     * either — the structure below is asserted from offsets and one substring count, which is weaker
     * than depth matching in general but exact for this question: the row's LAST child is the "Add
     * Deal" button, so a `</div>` between that button and the bar can only be the row closing.
     */
    const rowAt = source.indexOf('<div className="flex flex-wrap')
    const addDealAt = source.indexOf("Add Deal")
    const barAt = source.indexOf("<SavedViewsBar")
    const filtersAt = source.indexOf("<DealFilters")

    expect(
      rowAt,
      `${BOARD}: the pipeline row's opening div was not found, so nothing below is scoped to it.`
    ).toBeGreaterThan(-1)
    expect(
      addDealAt,
      `${BOARD}: the "Add Deal" button is this gate's anchor for the end of the pipeline row.`
    ).toBeGreaterThan(rowAt)
    expect(
      barAt,
      `${BOARD}: the bar must sit AFTER the pipeline row. A deals view carries its pipeline ` +
        `(Decision 4) and the pipeline control is the row ABOVE the filters, so a bar that can ` +
        `change the pipeline has to sit above both things it changes.`
    ).toBeGreaterThan(addDealAt)
    expect(
      filtersAt,
      `${BOARD}: the bar must sit BEFORE <DealFilters>, on its own row between the two.`
    ).toBeGreaterThan(barAt)

    /*
     * M-3, MEASURED: the pipeline row is EXACTLY full at 241px — the "Pipeline:" cluster at 118, an
     * 8px gap and "Add Deal" at 115. Zero slack, before pt-BR or es-ES lengthens either label. So the
     * bar must not be merged into it, and ordering alone would not catch a mount placed after the
     * button but INSIDE the row: the row has to close first.
     */
    expect(
      occurrences(source.slice(addDealAt, barAt), "</div>"),
      `${BOARD}: the pipeline row must CLOSE before the bar — the bar is its own row, not a third ` +
        `item in a row measured exactly full at 241px (M-3).`
    ).toBeGreaterThanOrEqual(1)

    const gap = source.slice(addDealAt, filtersAt)

    /*
     * RULE P-2, and this is the assertion the plan exists for. The pipeline cluster is replaced by
     * `<div />` when `pipelines.length <= 1`. Copying that guard onto the bar would hide saved views
     * entirely on any install with one pipeline — and the bar's content does not depend on the
     * pipeline count at all. Scoped to AFTER the button so the row's own legitimate guard, which sits
     * above it, cannot fail this.
     */
    expect(
      gap,
      `${BOARD}: no pipelines.length guard may stand between the pipeline row and <DealFilters>. ` +
        `Rule P-2: the bar renders even when only one pipeline exists.`
    ).not.toContain("pipelines.length")

    expect(
      gap,
      `${BOARD}: the bar is not sticky (K-8) — it scrolls with the board.`
    ).not.toContain("sticky")
    expect(gap, `${BOARD}: the bar is not fixed (K-8).`).not.toContain("fixed")
  })

  it("9. plan 40-14's exemptions: both navigations are byte-identical to their recorded text", () => {
    const source = read(BOARD)

    /*
     * Both already carry `?pipeline=…`, `pipeline` is a saveable key, so `withViewEscape` would append
     * NOTHING to either. UI-SPEC lists them as unchanged specifically so a plan does not "fix" them,
     * and 40-14's call-site gate carries both as named exemptions MATCHED BY EXACT EXPRESSION TEXT.
     * Changing them, even harmlessly, turns that gate red.
     */
    expect(
      source,
      `${BOARD}: the pipeline-select navigation must stay byte-identical (40-14 exemption).`
    ).toContain("router.push(`${pathname}?pipeline=${pipelineId}`)")

    expect(
      source,
      `${BOARD}: the no-results clear must stay byte-identical (40-14 exemption).`
    ).toContain("router.replace(`${pathname}?pipeline=${selectedPipelineId}`)")

    expect(
      occurrences(source, "router.push("),
      `${BOARD}: this file has exactly one router.push and this plan adds none.`
    ).toBe(1)

    expect(
      occurrences(source, "router.replace("),
      `${BOARD}: this file has exactly one router.replace and this plan adds none.`
    ).toBe(1)

    expect(
      source,
      `${BOARD}: withViewEscape must NOT appear here. Both navigations are already escape-safe, and ` +
        `adding the helper "for consistency" is precisely the edit 40-14's exemption list forbids.`
    ).not.toContain("withViewEscape")
  })

  it("10. out of scope: the board's five English literals are not translated here", () => {
    const source = read(BOARD)

    expect(
      source,
      `${BOARD}: no useTranslations in this file. Its five hardcoded literals are real debt, are ` +
        `named in UI-SPEC § Out of scope, and belong to a dedicated copy pass — translating them in ` +
        `the same diff as a mount makes the mount unreviewable.`
    ).not.toContain("useTranslations")
  })
})

describe("deals/deal-filters.tsx — the 40-12 escape gate", () => {
  it("11. both navigations route through withViewEscape, with no raw toString left", () => {
    const source = read(FILTERS)
    const escapes = callArguments(source, "withViewEscape")

    expect(
      escapes.length,
      `${FILTERS}: expected exactly two withViewEscape calls — setFilter and clearAll — found ` +
        `${escapes.length}. clearAll KEEPS pipeline, so it is bare only when no pipeline param was ` +
        `set, which is the common case because the page defaults the pipeline without putting it in ` +
        `the URL. setFilter(key, null) removing the last chip produces the same bare query by ` +
        `another route. Escaping one and not the other leaves half the surface recapturable by the ` +
        `default-view redirect.`
    ).toBe(2)

    for (const args of escapes) {
      expect(
        args.replace(/\s+/g, " ").trim(),
        `${FILTERS}: withViewEscape takes the entity type and the params it is about to navigate to.`
      ).toBe('"deal", params')
    }

    const replaces = callArguments(source, "router.replace")

    expect(
      replaces.length,
      `${FILTERS}: expected two router.replace sites, found ${replaces.length}.`
    ).toBe(2)

    for (const args of replaces) {
      expect(
        args,
        `${FILTERS}: every router.replace here must build its query through withViewEscape.`
      ).toContain("withViewEscape(")

      expect(
        args,
        `${FILTERS}: no router.replace may still stringify the params directly — that is the ` +
          `pre-plan expression, and it is what produced a bare ?  that the default-view redirect ` +
          `would recapture (T-40-55).`
      ).not.toContain("params.toString()")
    }

    expect(
      occurrences(source, "router.push("),
      `${FILTERS}: filter changes must not stack history entries — replace, never push. That is ` +
        `the existing behaviour and this plan preserves it.`
    ).toBe(0)

    expect(
      source,
      `${FILTERS}: the helper comes from the one module that owns the whitelist.`
    ).toContain('from "@/lib/views/url-params"')
  })

  it("12. 40-18: the selection rides along in the clone, so no view= writer is needed", () => {
    const source = read(FILTERS)

    /*
     * `withViewEscape` PRESERVES a `?view=<id>` whenever a saveable filter survives, and it reads that
     * id out of the params it is HANDED. Both sites here clone `searchParams.toString()`, so `view` is
     * already in the input and the selection survives a filter change with zero call-site edits —
     * which is why the preservation rule lives in the helper instead of being threaded as a prop
     * through six files. Rebuilding these params from props instead would silently drop the selection
     * and make `selected && modified` unreachable again, which is the state plan 40-05 measured as
     * having zero instances.
     */
    expect(
      occurrences(source, "new URLSearchParams(searchParams.toString())"),
      `${FILTERS}: both writers must clone the LIVE search params, so ?view=<id> is in the input ` +
        `and withViewEscape can carry it through the filter change (40-18).`
    ).toBe(2)

    expect(
      source,
      `${FILTERS}: no selectedViewId prop belongs here. Plan 40-11 passes one to the two data-table ` +
        `files because those build their query strings from PROPS and have no searchParams to ` +
        `preserve from. This file has them, so it needs nothing — the asymmetry is about where the ` +
        `two groups get their params, not a gap.`
    ).not.toContain("selectedViewId")
  })

  it("13. out of scope: the filter component's ~20 literals are not translated here", () => {
    const source = read(FILTERS)

    expect(
      source,
      `${FILTERS}: no useTranslations in this file. This edit is two expressions; translating a ` +
        `250-line filter component in the same diff would make the URL change unreviewable. The ` +
        `debt is named in UI-SPEC § Out of scope.`
    ).not.toContain("useTranslations")
  })
})
