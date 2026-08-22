---
phase: 40-saved-views-shared-filters
plan: 12
subsystem: ui
tags: [saved-views, deals, kanban, pipeline-fallback, view-escape, source-gate, vitest, decision-4]

# Dependency graph
requires:
  - phase: 40-01
    provides: "withViewEscape and SAVEABLE_FILTER_KEYS.deal — the row that carries `pipeline`"
  - phase: 40-05
    provides: "resolveSavedViewsBarProps and resolveDefaultViewRedirect"
  - phase: 40-10
    provides: "SavedViewsBar — the component this plan mounts"
  - phase: 40-18
    provides: "the ?view=<id> carrier, and the preservation rule that made both call sites need ZERO shape changes"
provides:
  - "The Decision-4 pipeline fallback: an unknown ?pipeline= renders the default board instead of the pipelineNotFound dead end"
  - "The /deals default-view redirect, guarded on 'no params at all'"
  - "Two escaped filter navigations in deal-filters.tsx"
  - "13 source-read assertions, five of which FREEZE what this plan must not change"
  - "The exact expression text of kanban-board.tsx's two exempt navigations, for plan 40-14"
affects: [40-14, 40-15]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A three-step pipeline resolution: requestedPipeline / pipelineWasDropped / selectedPipeline, so a dropped board selector is a RECORDED fact rather than something re-derived later"
    - "Merge a page-local dropped key into the resolver's droppedFilterKeys at the call site, with an includes() guard — the resolver validates the view, the page validates the URL, and neither can see the other's half"
    - "Bound a JSX region by OFFSETS plus one `</div>` count when the region contains a self-closing element that defeats depth matching"
    - "Freeze what a plan must NOT change with assertions that are green from the first commit, then negative-prove each one can still go red"

key-files:
  created:
    - src/app/deals/views-bar-wiring.test.ts
  modified:
    - src/app/deals/page.tsx
    - src/app/deals/kanban-board.tsx
    - src/app/deals/deal-filters.tsx

key-decisions:
  - "The default lookup moved OUTSIDE the params.pipeline ternary rather than a new branch being added: the old default branch already existed and was unreachable for the exact input that needed it"
  - "The pipelineNotFound branch is RETAINED and documented as unreachable-by-guard — it is what narrows selectedPipeline for the 150 lines below it"
  - "The `pipeline` dropped key is merged in page.tsx, NOT by teaching the resolver about pipelines — resolve.ts is a shared file with two sibling agents live, and the page is the only place that knows whether the URL's own pipeline resolved"
  - "kanban-board.tsx's two navigations left byte-identical: git diff --unified=0 touches ZERO router. lines, and a negative proof confirms gate 9 goes red if either is 'improved'"
  - "No selectedViewId prop on deal-filters.tsx: both writers clone searchParams.toString(), so ?view=<id> is already in the input that withViewEscape reads"
  - "elementRegion cannot scope the pipeline row (it throws on the self-closing <div />) — reported as a blocked deviation instead of patching the shared source-scan.ts"

patterns-established:
  - "Measure the defect against the RUNNING container before fixing it, even when the fix cannot be measured there afterwards: the pre-change dead end is a fact, and its absence later is then a single rebuild away from proof"
  - "Negative-prove the assertions that were GREEN from the first commit — they are the ones at risk of being vacuous"

requirements-completed: [VIEW-01, VIEW-02]

# Metrics
duration: 41min
completed: 2026-08-21
---

# Phase 40 Plan 12: Mount the Bar on /deals Summary

`/deals` now carries the saved-views bar on its own row, and a view pointing at a deleted pipeline
lands on the default board instead of the "Pipeline not found." page it produced this morning —
measured, against the running container, before the change.

## What Was Built

### The Decision-4 fallback (`page.tsx`)

The ternary at `page.tsx:76-78` became three steps:

```ts
const requestedPipeline = params.pipeline
  ? allPipelines.find((p) => p.id === params.pipeline)
  : undefined
const pipelineWasDropped = Boolean(params.pipeline) && requestedPipeline === undefined
const selectedPipeline =
  requestedPipeline ?? allPipelines.find((p) => p.isDefault) ?? allPipelines[0]
```

The old expression was not missing a default branch — it **had** one, and that branch was unreachable
for the one input that needed it. `params.pipeline ? find(byId) : find(isDefault) || first` sends a
requested-but-dead id to `undefined`, never to the default. The fix is entirely in the shape: the
default lookup now sits outside any test on `params.pipeline`, chained with `??`, which is exactly
what `find()`'s `undefined` miss continues on.

`pipelineWasDropped` is recorded rather than inferred later, because by the time `selectedPipeline`
exists, "your pipeline died and I substituted one" is indistinguishable from a plain default landing.

The `if (!selectedPipeline)` / `t('pipelineNotFound')` branch is **retained**, with a comment saying
it is now unreachable while `allPipelines.length > 0` (guarded 15 lines above) and why it stays: it
is what narrows `selectedPipeline` to non-`undefined` for the rest of the function, and it is the
landing for the day that guard changes shape.

### The default-view redirect (`page.tsx`)

```ts
if (Object.keys(params).length === 0) {
  const target = await resolveDefaultViewRedirect("deal", session.user)
  if (target) redirect(`/deals${target}`)
}
```

Placed after the `auth()` gate and **before** `allPipelines` — the first of five reads on this page,
all of which a redirect makes wasted work. No try/catch: `redirect()` signals by throwing, and a catch
would swallow the navigation and render the unfiltered board, a failure that looks exactly like
success. `searchParams` gained `view?: string`, which the page passes through and never reads.

### The eight bar props, plus one local amendment (`page.tsx`)

`resolveSavedViewsBarProps({ entityType: "deal", viewer: session.user, rawSearchParams: params })`,
then:

```ts
const viewsBar: SavedViewsBarProps =
  pipelineWasDropped && !resolvedViewsBar.droppedFilterKeys.includes("pipeline")
    ? { ...resolvedViewsBar, droppedFilterKeys: [...resolvedViewsBar.droppedFilterKeys, "pipeline"] }
    : resolvedViewsBar
```

V-11 covers a deleted owner, a deleted stage and a deleted pipeline in one sentence, deliberately. The
resolver validates the **selected view's stored filters** and cannot see that the **URL's own**
pipeline failed to resolve, because it never queries pipelines for the URL — this page does, ninety
lines earlier. The `includes` check is not padding: when the selected view's own stored pipeline is
the one that died, the resolver has already listed the key and a second append would print it twice.

### The mount (`kanban-board.tsx`)

`<SavedViewsBar {...viewsBar} />` on its **own row** at line 530, between the pipeline row and
`<Suspense><DealFilters/></Suspense>`. `KanbanBoardProps` gained ONE `viewsBar: SavedViewsBarProps`
prop, not eight.

All three parts of the placement rationale are in the file:

- **Not inside `deal-filters.tsx`** — a deals view carries its `pipeline` (Decision 4) because the
  pipeline decides which board exists at all, and the pipeline control is the row *above* the filters.
  A bar that can change the pipeline has to sit above both things it changes.
- **Not merged into the pipeline row** — that row is measured EXACTLY full at 241px (M-3): 118 + 8 +
  115. Zero slack, before pt-BR or es-ES lengthens either label.
- **Rule P-2** — no `pipelines.length` guard. The row above swaps in `<div />` when
  `pipelines.length <= 1`; copying that here would hide saved views entirely from a one-pipeline
  install, and the bar's content does not depend on the pipeline count.

Not sticky, not fixed (K-8).

### Both filter navigations escaped (`deal-filters.tsx`)

`setFilter` (line 86) and `clearAll` (line 97) now read
`router.replace(`${pathname}?${withViewEscape("deal", params)}`)`. Two expressions, plus the import
and the comment explaining why both were needed:

`clearAll` deletes the five filter keys and KEEPS `pipeline` — so the naive reading is that it can
never go bare. But the page **defaults the pipeline without putting it in the URL**, so "no pipeline
param" is the common case rather than the edge, and then `clearAll` leaves a bare `?`. And
`setFilter(key, null)` removing the last remaining chip produces the identical bare query by another
route. Either one left unescaped would be recaptured by the new redirect and bounce the user straight
back into the view they had just cleared (T-40-55).

**No `view=` writer and no `selectedViewId` prop were added**, per plan 40-18: both sites already
clone `new URLSearchParams(searchParams.toString())`, so `?view=<id>` is in the input and
`withViewEscape` carries it through a filter change untouched. Gate 12 pins that clone so a future
refactor to props-derived params cannot silently make `selected && modified` unreachable again.

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| RED | The /deals mount gate — 8 red, 5 green by construction | `fba5a65` | `src/app/deals/views-bar-wiring.test.ts` |
| 1 | The pipeline fallback, the redirect, the bar props | `588d4ab` | `page.tsx`, `views-bar-wiring.test.ts` |
| 2 | Mount the bar, escape both filter navigations | `e5cf512` | `kanban-board.tsx`, `deal-filters.tsx` |

## Negative Proofs — all three run, output transcribed verbatim

### (a) The RED run IS the proof for the Decision-4 gate

The pre-plan expression is not a synthetic mutant — it is what shipped. Gate 1 read it and failed:

```
AssertionError: src/app/deals/page.tsx: the selectedPipeline declaration must not read
params.pipeline — a dead id has to fall THROUGH to the default board (Decision 4), and a
params.pipeline ternary here is exactly what made "Pipeline not found." reachable with 11 live
pipelines.: expected ' params.pipeline\n    ? allPipelines.…' not to contain 'params.pipeline'
```

Eight of thirteen gates were red at `fba5a65`; the other five are the freeze assertions and were green
by construction, which is why they get their own proofs below.

### (b) Rule P-2 — the guard the plan forbids

The bar was temporarily wrapped in `{pipelines.length > 1 && <SavedViewsBar {...viewsBar} />}`:

```
× 8. K-8 + M-3 + P-2: the bar is its own row between the pipeline row and the filters
AssertionError: src/app/deals/kanban-board.tsx: no pipelines.length guard may stand between the
pipeline row and <DealFilters>. Rule P-2: the bar renders even when only one pipeline exists.:
expected 'Add Deal\n          </Button>\n      …' not to contain 'pipelines.length'
Tests  1 failed | 12 passed (13)
```

Reverted with `git checkout -- src/app/deals/kanban-board.tsx`.

### (c) Plan 40-14's exemption list — the "harmless" improvement

The pipeline-select navigation was temporarily rewritten as the exact edit the plan warns about,
`router.push(`${pathname}?${withViewEscape("deal", new URLSearchParams({ pipeline: pipelineId }))}`)`:

```
× 9. plan 40-14's exemptions: both navigations are byte-identical to their recorded text
AssertionError: src/app/deals/kanban-board.tsx: the pipeline-select navigation must stay
byte-identical (40-14 exemption).: expected '"use client"\n\nimport { useState, us…' to contain
'router.push(`${pathname}?pipeline=${p…'
Tests  1 failed | 12 passed (13)
```

Reverted the same way. Note this also exercised the sibling assertion `withViewEscape must NOT appear
here` — the mutation was chosen to trip both halves at once.

## Measurements

**The defect, against the RUNNING container, before the change** (authenticated with the stored
Playwright admin cookie, `http://localhost:3001`):

```
GET /deals?pipeline=00000000-0000-4000-8000-000000000000  ->  200
grep: text-center py-12 text-muted-foreground border rounded-lg">Pipeline not found.<
"Pipeline not found" x3 in the response body
```

There is no `error.tsx` above this route (M-14), so that block is the entire page.

**Where it now falls back to, and it is not the default pipeline.** All 11 live pipelines have
`is_default = 0`:

```
 010edd01-e023-427e-b03b-3ed305b8f586 | BDR - Base Fria        | 0
 8e3b92d1-d667-4b4c-affa-3220f5022e3c | Closer                 | 0
 cf465256-8dcf-4803-94ef-bc5048dd5117 | Funil Migração         | 0
 ... (11 rows, every one is_default = 0)
```

So `allPipelines.find(p => p.isDefault)` returns `undefined` in production **today** and the third
link of the chain — `allPipelines[0]`, first under the `isDefault DESC, name` ordering — is what
actually renders: **"BDR - Base Fria"** (`010edd01-e023-427e-b03b-3ed305b8f586`). Confirmed
independently: a bare `GET /deals` against the same container renders that board today. `is_default`
is an `integer` column defaulting to `0`, not a boolean, so the existing truthiness test is correct
and was left alone.

**The exemption is backed by an upstream measurement, not by assertion.**
`src/lib/views/__tests__/url-params.test.ts:553-556` already proves
`withViewEscape("deal", new URLSearchParams("pipeline=p1")) === "pipeline=p1"` — `pipeline` is in
`SAVEABLE_FILTER_KEYS.deal`, so the helper would append nothing to either kanban navigation. Nothing
was duplicated here.

## Final Navigation Inventory — for plan 40-14's call-site gate

Line numbers are post-change and were read from the committed files.

| File | Line | Expression | Disposition |
|------|------|-----------|-------------|
| `src/app/deals/page.tsx` | 57 | `redirect("/login")` | pre-existing auth gate, untouched |
| `src/app/deals/page.tsx` | 80 | `redirect(`/deals${target}`)` | NEW — server redirect, target built by `redirectTargetFor` |
| `src/app/deals/kanban-board.tsx` | 459 | `router.push(`${pathname}?pipeline=${pipelineId}`)` | **EXEMPT — byte-identical, do not touch** |
| `src/app/deals/kanban-board.tsx` | 560 | `router.replace(`${pathname}?pipeline=${selectedPipelineId}`)` | **EXEMPT — byte-identical, do not touch** |
| `src/app/deals/deal-filters.tsx` | 86 | `router.replace(`${pathname}?${withViewEscape("deal", params)}`)` | escaped (setFilter) |
| `src/app/deals/deal-filters.tsx` | 97 | `router.replace(`${pathname}?${withViewEscape("deal", params)}`)` | escaped (clearAll) |

Both exempt expressions are quoted above **exactly as they appear in the file**, including the
backticks and the `${pathname}` interpolation, so 40-14 can match on the literal. Verified
mechanically:

```
git diff --unified=0 src/app/deals/kanban-board.tsx | grep -c "router.replace\|router.push"  ->  0
```

`kanban-board.tsx` also contains four `router.refresh()` calls — lines **283, 448, 460, 473** — which
carry no query string at all and are not navigation call sites.

## Deviations from Plan

### Blocked — reported, not fixed (parallel-wave isolation)

**1. `elementRegion` cannot scope a region containing a self-closing element.**

- **Found during:** RED, gate 8.
- **Issue:** `elementRegion(source.slice(rowAt), "div")` on `kanban-board.tsx` throws
  `src/app/deals/kanban-board.tsx: unterminated <div> region`. The extractor counts `<div` as an open
  and only `</div` as a close, and the pipeline row contains the self-closing `<div />` that stands in
  for the pipeline cluster when `pipelines.length <= 1`. Its depth never returns to zero.
- **Why it was NOT fixed:** `src/components/custom-fields/__tests__/source-scan.ts` is a shared file
  read by four other 40-* gates, and two sibling agents (40-11, 40-13) were editing their own surfaces
  in the same wave. Per the isolation rules this is reported rather than patched.
- **What was done instead:** gate 8 bounds the region by offsets plus one `</div>` count between the
  row's last child (the "Add Deal" button) and the bar. That is weaker than depth matching in general
  and exact for this question, since a `</div>` there can only be the row closing. **No fourth brace
  matcher was added to the repo.** The reasoning is written into the test.
- **Suggested owner:** whoever next needs `elementRegion` over JSX containing void elements. A
  one-line `<tag ... />` lookahead in the close scan would do it, in ONE commit, with the four
  existing consumers re-run.

### Auto-fixed

**2. [Rule 3 — Blocking] Gate 6's slice was inverted by a pre-existing `return (`.**

- **Found during:** GREEN, task 1.
- **Issue:** gate 6 bounded the merge region as `between(source, "const viewsBar", "return (")`.
  `between` uses `indexOf` for both markers, and the FIRST `return (` in `page.tsx` belongs to the
  `noPipelines` empty state — far above `const viewsBar`. The slice was inverted.
- **Fix:** re-bounded to `<KanbanBoard`, which is unique and downstream. The assertion's intent is
  unchanged. `between`'s own ordering guard is what surfaced it, with
  `the two markers are in the WRONG ORDER` — rather than the assertion silently passing over an empty
  string, which is the failure mode that guard exists for.
- **Commit:** `588d4ab`.

### Not deviations, recorded because they look like omissions

- **`deal-filters.tsx`'s ~20 hardcoded English literals and `kanban-board.tsx`'s five are untouched**,
  and gates 10 and 13 now *enforce* that by asserting `useTranslations` appears in neither file. The
  debt is real and is named in UI-SPEC § Out of scope; translating a 250-line filter component in the
  same diff as a two-expression URL change would make the URL change unreviewable.
- **`kanban-board.tsx`'s two navigations were not "fixed"**, per (c) above.
- **No shared file was edited.** Not `src/components/views/*`, not `src/lib/views/*`, not
  `src/messages/*`, not `source-scan.ts`. The only files in the three commits are the plan's three
  plus the new gate file, which lives in this plan's own surface directory.

## Verification

| Check | Result |
|-------|--------|
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **0 errors**, 125 warnings — the pre-existing baseline exactly |
| `npx vitest run` | **3674 passed / 28 skipped / 3702 total** (baseline 3661/28/3689; delta +13 = this plan's gates, zero regressions) |
| `src/app/deals/views-bar-wiring.test.ts` | **13/13 green** |
| `git diff --unified=0 kanban-board.tsx \| grep -c "router\."` | **0** |
| `deal-filters.tsx` withViewEscape call sites | **exactly 2**, both `"deal", params`, zero `params.toString()` remaining |

The 24 skipped `formatters-live` tests self-skip on `!process.env.DATABASE_URL` — expected, not a
regression.

## Deferred to Plan 40-15 — the ONE thing this plan could not measure

The plan's verification asks that an unknown `?pipeline=` be exercised **manually against the running
container** after the change. **It was not, and it could not be.** `docker-compose.yml` declares
`build: .` with **no volume mount**, so the container serves a baked image built before this plan;
there is no path from a worktree edit to that container except a rebuild. Plan 40-15 owns the phase's
only rebuild and two sibling agents were live in the same wave, so rebuilding here was forbidden.

What *was* measured is the half that does not need a rebuild: the pre-change defect, verbatim above.
After 40-15's rebuild, one command closes it:

```bash
curl -s -H "Cookie: <admin session cookie>" \
  "http://localhost:3001/deals?pipeline=00000000-0000-4000-8000-000000000000" | grep -c "Pipeline not found"
```

Expected **0** occurrences in rendered markup (one match inside the serialized next-intl message blob
is normal and appears on every `/deals` response), and the board should render **"BDR - Base Fria"**
with the `views.degraded` line beneath the bar. If "Pipeline not found." still renders, the fallback
did not ship.

## Known Stubs

None. Every prop the bar receives is resolved server-side from a real query; nothing on this surface
renders placeholder data.

## Self-Check: PASSED

All five claimed files exist on disk; all three claimed commits resolve in `git log`
(`fba5a65`, `588d4ab`, `e5cf512`). No `STATE.md` or `ROADMAP.md` write — the orchestrator owns those.

## Threat Flags

None. This plan added no endpoint, no auth path, no file access and no schema change. The two
dispositions it implements — T-40-53 (mitigate, the fallback) and T-40-55 (mitigate, both escapes) —
are in the plan's own register, and T-40-56's `accept` is now backed by the upstream measurement cited
above rather than by assertion.
