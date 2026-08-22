/**
 * THE U-2 / T-40-49 SERVER-PAGE GATE — a source read over `/organizations/page.tsx` and
 * `/people/page.tsx`.
 *
 * Two properties are asserted here and neither is cosmetic:
 *
 *   1. THE REDIRECT GUARD IS EXACTLY "NO PARAMS AT ALL". `view=none` is a param, so the escape URL
 *      the bar and the empty-search branch navigate to is never itself bare and the redirect cannot
 *      recapture it (T-40-49). A weaker guard — `!params.search`, `params.search === undefined`,
 *      anything that ignores the other keys — reads `?view=none` as "nothing here" and bounces the
 *      user straight back into the view they were trying to leave. The guard's TEST EXPRESSION is
 *      therefore asserted verbatim rather than merely "contains Object.keys": a gate that accepts any
 *      test containing the right substring accepts `Object.keys(params).length === 0 || !params.search`.
 *   2. THE BAR PROPS ARE RESOLVED INSIDE THE EXISTING `Promise.all`. These pages already do three or
 *      four reads in one round trip and both carry a comment block explaining why that matters; a
 *      separate `await` above it adds a latency hop to every visit to the page. Asserted by extracting
 *      the `Promise.all` argument list and requiring the resolver call to be in it, plus a count of
 *      one so a second call outside cannot hide.
 *
 * `readStrippedSource` runs first, so the prose above — which names every identifier below — cannot
 * satisfy anything. Every assertion is scoped to an extracted region (the `if` statement, the
 * `Promise.all` argument text, the `<DataTable>` opening tag), never to the whole file.
 *
 * WHAT THIS TEST IS NOT: it does not execute either page. No database runs here, so it cannot know
 * that a default view actually redirects — it knows the guard has the shape that makes the redirect
 * correct and non-looping. The behavioural proof is manual, against the container, and is recorded in
 * 40-11-SUMMARY.md.
 */
import { describe, it, expect } from "vitest"

import {
  callArguments,
  openingTagAt,
  readStrippedSource,
  tagIndexes,
} from "@/components/custom-fields/__tests__/source-scan"

interface Surface {
  /** Human name used in every failure message. */
  label: string
  path: string
  /** The `ViewEntityType` literal this page must pass to both resolvers. */
  entityType: string
  /** The list route the redirect target must be built on. */
  route: string
}

const SURFACES: Surface[] = [
  {
    label: "organizations/page.tsx",
    path: "src/app/organizations/page.tsx",
    entityType: "organization",
    route: "/organizations",
  },
  {
    label: "people/page.tsx",
    path: "src/app/people/page.tsx",
    entityType: "person",
    route: "/people",
  },
]

/** The exact test expression the redirect guard must carry, and nothing else. */
const GUARD_TEST = "Object.keys(params).length === 0"

/**
 * The `if (<test>) { <body> }` statement whose test contains `marker`, split into its two parts.
 *
 * LOCAL ON PURPOSE, and this is the one thing in this file a reader should not "clean up".
 * `source-scan.ts` holds the shared extractors (`elementRegion`, `enclosingConditional`, …) and this
 * is deliberately not added to them: `enclosingConditional` matches the JSX `{… && ( … )}` form and
 * there is no `if`-STATEMENT extractor there, so one had to be written somewhere. 40-08's promotion
 * rule is the reason it is written HERE — helpers start module-private and move into `source-scan.ts`
 * in ONE commit when a THIRD gate needs them. This is the first consumer.
 *
 * Paren depth for the test, brace depth for the body, so a nested call or object literal in either
 * cannot close the region early.
 */
function ifStatement(source: string, marker: string, label: string): { test: string; body: string } {
  const at = source.indexOf(marker)
  if (at === -1) {
    throw new Error(
      `${label}: ${marker} does not appear in the source — the default-view redirect guard is ` +
        `missing, so a params-free visit renders the unfiltered list instead of the user's default ` +
        `view (criterion 3).`
    )
  }

  const open = source.lastIndexOf("if (", at)
  if (open === -1) throw new Error(`${label}: ${marker} is not inside an if statement`)

  let i = open + "if (".length
  const testStart = i
  let depth = 1

  while (i < source.length && depth > 0) {
    const ch = source[i]
    if (ch === "(") depth += 1
    else if (ch === ")") depth -= 1
    i += 1
  }
  if (depth !== 0) throw new Error(`${label}: unterminated if test around ${marker}`)

  const test = source.slice(testStart, i - 1)

  if (!test.includes(marker)) {
    throw new Error(
      `${label}: the if statement found before ${marker} does not contain it — the extraction ` +
        `latched onto an unrelated statement, so nothing below would be scoped to the guard.`
    )
  }

  const braceAt = source.indexOf("{", i - 1)
  if (braceAt === -1) throw new Error(`${label}: the guard has no braced body`)

  let j = braceAt + 1
  let braces = 1
  while (j < source.length && braces > 0) {
    const ch = source[j]
    if (ch === "{") braces += 1
    else if (ch === "}") braces -= 1
    j += 1
  }
  if (braces !== 0) throw new Error(`${label}: unterminated guard body`)

  return { test, body: source.slice(braceAt + 1, j - 1) }
}

describe.each(SURFACES)("$label — the default-view redirect and the bar props", (surface) => {
  const read = () => readStrippedSource(surface.path)

  it(`${surface.label}: the guard is exactly "no params at all" (T-40-49)`, () => {
    const { test } = ifStatement(read(), GUARD_TEST, surface.label)

    // VERBATIM, not `toContain`. An OR-ed second clause is the loop this assertion exists to make
    // impossible: `view=none` must read as "a param is present", so the escape URL is never bare.
    expect(test.trim()).toBe(GUARD_TEST)
  })

  it(`${surface.label}: the guard redirects through resolveDefaultViewRedirect, on this route`, () => {
    const { body } = ifStatement(read(), GUARD_TEST, surface.label)

    expect(body).toContain("resolveDefaultViewRedirect")
    expect(body).toContain("redirect(")
    expect(body).toContain(surface.route)
    // Anti-vacuity: an empty guard body would satisfy nothing above by accident but would satisfy a
    // future reader that the redirect "is there".
    expect(body.length).toBeGreaterThan(60)
  })

  it(`${surface.label}: nothing catches the guard's NEXT_REDIRECT`, () => {
    const { body } = ifStatement(read(), GUARD_TEST, surface.label)

    // `redirect()` works by THROWING. A try/catch anywhere between the call and the framework
    // swallows `NEXT_REDIRECT` and the page renders the unfiltered list with no error and no clue.
    // Word-boundary matched: `entry`, `country` and `retry` all contain "try".
    expect(body).not.toMatch(/\btry\b/)
    expect(body).not.toMatch(/\bcatch\b/)
  })

  it(`${surface.label}: the guard runs BEFORE the list query`, () => {
    const source = read()
    const guardAt = source.indexOf(GUARD_TEST)
    const readsAt = source.indexOf("Promise.all(")

    // BOTH OFFSETS ARE ASSERTED PRESENT FIRST. Written as a bare `toBeLessThan` this test passes
    // VACUOUSLY while the guard is missing, because `indexOf` returns -1 and -1 is less than every
    // real offset — measured on the RED run of this file, where it was one of only two green rows.
    expect(guardAt).toBeGreaterThan(-1)
    expect(readsAt).toBeGreaterThan(-1)
    // A redirect taken after the reads pays for a query whose result is thrown away on every
    // params-free visit — and on this route that query is the list itself.
    expect(guardAt).toBeLessThan(readsAt)
  })

  it(`${surface.label}: resolveDefaultViewRedirect is called for ${surface.entityType}`, () => {
    const calls = callArguments(read(), "resolveDefaultViewRedirect")

    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain(`"${surface.entityType}"`)
    // The viewer, not a bare id and not a role: `resolveDefaultViewRedirect` takes `ViewViewer`, and
    // the value must come from the session this page already gated on (T-40-51).
    expect(calls[0]).toContain("session.user")
  })

  it(`${surface.label}: the bar props resolve INSIDE the existing Promise.all`, () => {
    const source = read()
    const promiseAll = callArguments(source, "Promise.all")

    // One round trip, not two. Both pages carry a comment block explaining why the reads are batched.
    expect(promiseAll).toHaveLength(1)
    expect(promiseAll[0]).toContain("resolveSavedViewsBarProps(")

    // Exactly one call in the whole file, so a second one cannot sit above the batch as a separate
    // `await` while this gate stays green on the one inside it.
    expect(callArguments(source, "resolveSavedViewsBarProps")).toHaveLength(1)
  })

  it(`${surface.label}: the resolver gets this entity type, the session viewer and the raw params`, () => {
    const [args] = callArguments(read(), "resolveSavedViewsBarProps")

    expect(args).toContain(`entityType: "${surface.entityType}"`)
    expect(args).toContain("viewer: session.user")
    // The RAW params object, whitelisted inside the resolver. Handing it `search` alone would drop
    // the `view` key the selection is read from, which is the whole carrier plan 40-18 added.
    expect(args).toContain("rawSearchParams: params")
  })

  it(`${surface.label}: <DataTable> receives one viewsBar prop and the selected id`, () => {
    const source = read()
    const [at] = tagIndexes(source, "DataTable")
    expect(at).toBeDefined()

    const tag = openingTagAt(source, at as number, "<DataTable>", surface.label)

    // ONE prop for the eight, not eight loose ones: `SavedViewsBarProps` is declared once in
    // `src/lib/views/types.ts` and spread straight onto the bar, so a prop added there needs no edit
    // on any of the four surfaces.
    expect(tag).toContain("viewsBar={")
    // The writers in `data-table.tsx` seed `view=<id>` from the RESOLVED id, so they need it by
    // itself. Taken from the same resolved object at this one call site, so the two cannot drift.
    expect(tag).toContain("selectedViewId={")
  })

  it(`${surface.label}: retentionDays is still passed straight through, un-defaulted (T-38-10)`, () => {
    const source = read()
    const [at] = tagIndexes(source, "DataTable")
    const tag = openingTagAt(source, at as number, "<DataTable>", surface.label)

    // Guarding a pre-existing invariant against this plan's edit, not asserting new behaviour: a
    // numeric fallback here would have the bulk delete dialog promise a retention window the pruner
    // is not enforcing.
    expect(tag).toContain("retentionDays={retentionDays}")
    expect(source).not.toContain("retentionDays ??")
    expect(source).not.toContain("retentionDays ||")
  })
})
