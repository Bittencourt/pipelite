---
phase: 40-saved-views-shared-filters
plan: 14
subsystem: saved-views
tags: [gates, source-scan, responsive, navigation, tdd]

requires:
  - "40-11 — the orgs/people navigations"
  - "40-12 — the deals navigations and the two byte-identical exemptions"
  - "40-13 — the activities navigations, including the seventh escape site"
  - "40-18 — withViewSelection and the ?view=<id> serialiser"
provides:
  - "V-40-4 — a 19-row census of every router.push/replace ARGUMENT EXPRESSION across the six filter surfaces plus the bar"
  - "R-4 / R-3 — a 29-row cross-file responsive-class gate over the three new components"
  - "a fixed elementRegion that terminates on self-closing tags, unblocking every future gate that scopes a region in kanban-board.tsx"
affects: [40-15, 40-16, 40-17, 40-VERIFICATION]

tech-stack:
  added: []
  patterns:
    - "a call-site census: count first, then classify — the count assertion is what catches a NEW navigation, before classification can"
    - "exemptions matched by EXACT whitespace-normalised argument text and consumed exactly once, so an exemption cannot silently widen"
    - "an iff rule derived from the data (import the helper exactly when you use it) instead of a hardcoded per-file list"
    - "one negative proof PER ASSERTION FAMILY when the assertion guards an empty set — otherwise it is vacuously green"

key-files:
  created:
    - src/lib/views/__tests__/view-escape-call-sites.test.ts
    - src/components/views/__tests__/responsive-classes.test.ts
    - src/components/custom-fields/__tests__/source-scan.test.ts
  modified:
    - src/components/custom-fields/__tests__/source-scan.ts

key-decisions:
  - "kanban-board.tsx must NOT import withViewEscape — both its navigations are exemptions, so the import the plan asked for would be unused, which is the exact 'lie' the plan warns about. Implemented as an iff rule."
  - "elementRegion's fix is scoped to self-closing tags only. Its pre-existing exclusion of the closing tag's final `>` is pinned by a test rather than corrected, because four 40-* gates already read regions on that basis."
  - "extractToolbarRegion in toolbar-wiring.test.ts carries the identical blind spot but is latent; reported rather than fixed, since consolidating it is already on BACKLOG."

requirements-completed: [VIEW-01]

# Metrics
duration: 42min
completed: 2026-08-21
---

# Phase 40 Plan 14: The V-40-4 Call-Site Gate and the Responsive-Class Gate — Summary

**Every navigation in the seven files that touch view state is now counted, classified and pinned; the three new components are proved to declare one breakpoint and place no two views side by side; and the shared tag walker that plan 40-12 could not use now works on the file that broke it.**

Three commits, 68 new tests, and **eighteen negative proofs run** — because sixteen of the assertions in these two gates currently guard an *empty* set, and an absence assertion nobody has ever seen fail is indistinguishable from one that cannot.

## Task Commits

| Commit | What |
|--------|------|
| `827f72e` | `fix(40-14): elementRegion terminates on self-closing tags` — 10 tests |
| `198f538` | `test(40-14): V-40-4 — the call-site census over every navigation` — 29 tests |
| `72484dc` | `test(40-14): R-4 / R-3 — the responsive-class gate over the three components` — 29 tests |

## The Measured Census vs the Plan's Prediction

Re-derived from the committed tree at `6d9a942`, not copied from the plan.

| Quantity | Plan predicted | **Measured** | Verdict |
|---|---|---|---|
| Navigations across the six filter surfaces | 17 | **17** | exact |
| …escaped | 13 | **13** | exact |
| …exempt | 4 | **4** | exact |
| Navigations in `saved-views-bar.tsx` | "report as measured" | **2** | — |
| `withViewSelection(` on a filter surface | 0 | **0** | exact |
| Files importing `withViewEscape` | "all six" | **five of six** | **plan wrong — see deviation 1** |

### The seven-vs-six escape count, reconciled

The dispatch note flagged that 40-13 measured **seven** escape sites where UI-SPEC's table lists six. That figure and this gate's figures are **different quantities**, and conflating them is how a count assertion gets written wrong:

- **UI-SPEC's "six"** counts the navigations that were *bare or empty-query-producing before this phase* and therefore needed an escape ADDED. 40-13 corrected it to **seven**, the omitted site being `activity-filters.tsx:124` (`handleSearchChange`) — emptying the search box when it was the last filter yields `/activities?`, a zero-length query Next reads as no-params.
- **This gate's "13 escaped / 17 total"** counts every navigation present today, bare or not. It is a strict superset of both figures: it includes sites that were never bare but route through the helper anyway (e.g. `activities-client.tsx:206`), and the four exemptions.

So neither "six" nor "seven" is a number this gate asserts. Site #11 (`activity-filters.tsx:124`) is in the census as an escaped row and is labelled in the test as *"absent from UI-SPEC's table"*, so the discrepancy survives in the artifact rather than in a summary nobody re-reads.

### The 19 rows as implemented

| # | File | Where | Disposition |
|---|------|-------|-------------|
| 1 | `organizations/data-table.tsx` | `handleSearchChange` non-empty, L348 | escaped |
| 2 | `organizations/data-table.tsx` | `handleSearchChange` cleared, L361 | escaped |
| 3 | `organizations/data-table.tsx` | `onOpen`, L370 | **exempt** — `` `/organizations/${org.id}` `` |
| 4 | `organizations/data-table.tsx` | Load More, L570 | escaped |
| 5 | `people/data-table.tsx` | `handleSearchChange` non-empty, L216 | escaped |
| 6 | `people/data-table.tsx` | `handleSearchChange` cleared, L229 | escaped |
| 7 | `people/data-table.tsx` | `onOpen`, L311 | **exempt** — `` `/people/${person.id}` `` |
| 8 | `people/data-table.tsx` | Load More, L511 | escaped |
| 9 | `deals/deal-filters.tsx` | `setFilter`, L86 | escaped |
| 10 | `deals/deal-filters.tsx` | `clearAll`, L97 | escaped |
| 11 | `deals/kanban-board.tsx` | `handlePipelineChange`, L459 | **exempt** — `` `${pathname}?pipeline=${pipelineId}` `` |
| 12 | `deals/kanban-board.tsx` | no-results Clear filters, L560 | **exempt** — `` `${pathname}?pipeline=${selectedPipelineId}` `` |
| 13 | `activities/activity-filters.tsx` | `setFilter`, L90 | escaped |
| 14 | `activities/activity-filters.tsx` | `clearAll`, L96 | escaped |
| 15 | `activities/activity-filters.tsx` | `handleSearchChange`, L124 | escaped — *not in UI-SPEC's table* |
| 16 | `activities/activities-client.tsx` | `handleLoadMore`, L206 | escaped |
| 17 | `activities/activities-client.tsx` | no-results Clear filters, L389 | escaped |
| 18 | `views/saved-views-bar.tsx` | `selectView`, L198 | escaped — the one `withViewSelection` |
| 19 | `views/saved-views-bar.tsx` | `selectAllRecords`, L207 | escaped — `withViewEscape` |

**The wave-6 exemptions are honoured, not gated as violations.** All four exempt expressions are quoted byte-for-byte from 40-12's navigation inventory and 40-11's line table, matched after whitespace collapse, and each must be consumed **exactly once**. Proof (e) below shows what happens if someone "fixes" one.

## The Anti-Grep Property, Demonstrated by the Repo Itself

The strongest evidence this gate is not a token grep did not need to be constructed — it was already in the tree:

- `activity-filters.tsx:93` contains a comment holding the literal text `` `router.push(pathname)` ``
- `activities-client.tsx:378` contains a comment holding the literal text `` `router.push("/activities")` ``

A token count reads **four** navigations in the first file and **three** in the second. This gate reads **three** and **two**, because `readStrippedSource` runs before anything is extracted. Deleting either comment changes no assertion.

## `elementRegion` — the Shared-Walker Fix

**The bug.** The tag-depth walker counted every `<div` as an open and only `</div` as a close. A **self-closing** `<div />` incremented depth with nothing to decrement it, so depth never returned to zero and the whole region threw `unterminated <div> region`. `kanban-board.tsx` holds exactly that shape — the `<div />` placeholder used when `pipelines.length <= 1` — which is why plan 40-12's gate 8 had to fall back to offset counting.

Reproduced before touching anything, on both the real file and a 46-character synthetic:

```
KANBAN THREW: src/app/deals/kanban-board.tsx: unterminated <div> region
SYNTHETIC THREW: unterminated <div> region
```

**The fix.** Whether a tag self-closes is decided from the END of the real opening tag via `openingTagAt`, which is brace- and string-aware — so a `>` inside `className={n > 2 ? "x" : "y"}` cannot end the tag early, and a `/` inside `href="a/"` is not mistaken for a self-close. A self-closing ROOT returns the tag itself instead of throwing.

**Purity, which was the condition attached to this authorisation:**

| | Test files | Tests |
|---|---|---|
| Baseline at `6d9a942`, before the fix | 141 passed / 1 skipped | **3721 passed / 28 skipped** |
| Immediately after the fix | 142 passed / 1 skipped | **3731 passed / 28 skipped** |

3731 − 3721 = **10**, exactly the number of tests the fix added. **No pre-existing gate changed and no assertion was adapted.** Plans 40-08, 40-09, 40-10 and 40-12's gates all still pass untouched.

**One pre-existing behaviour deliberately NOT changed.** The returned region ends at the closing tag's *name* and excludes its final `>` — the walker advances by `"</div".length`, five characters. My first draft of the tests assumed a `>` was included and failed; rather than "fix" that too, I pinned the existing convention with an assertion and documented it, because several gates already read regions on that basis and widening a returned string by one character is a separate change with its own blast radius. It is a candidate for BACKLOG, not for this plan.

**A sibling walker with the same blind spot, reported not fixed.** `extractToolbarRegion` in `src/app/organizations/__tests__/toolbar-wiring.test.ts:56` counts `<div` / `</div` identically and would throw on a self-closing div in its region. It is **latent** — its target files have no self-closing div inside the toolbar row, and the full suite is green. It was left alone because consolidating those module-private walkers is already a BACKLOG item and the dispatch note scoped that out. Fixing it belongs to the consolidation, not to a drive-by edit.

## Negative Proofs — Eighteen, All RUN

### The call-site gate (7)

The plan mandated four. Three more were added because the plan's four leave several assertion halves unexercised, and 40-11 found a real hole in its own gate exactly that way.

**(a) A bare literal at an escaped site** — `router.push("/organizations")` at L348. **2 assertions RED:**

```
AssertionError: src/app/organizations/data-table.tsx: 1 navigation argument expression(s) neither
derive from a view helper nor match a named exemption:
    "/organizations"

A list-route navigation that does not pass through withViewEscape lands on a bare or empty query.
The default-view redirect guard reads that as 'no params' and sends the user straight back into
their default view — so pressing Clear filters would return them to the filters they were leaving.:
expected [ '"/organizations"' ] to deeply equal []
```

**(b) THE ANTI-GREP PROOF** — with the bare push from (a) still in place, a comment added above it reading `// This navigation goes through withViewEscape("organization", params) — honestly it does.`

**Result: STILL RED. Identical two failures, byte-for-byte the same message as (a).** The prose naming the helper satisfied nothing. This is the check Phase 39 lacked five times.

**(c) An eighteenth navigation** — `router.push("/people?foo=1")`. The COUNT assertion fires **before** classification:

```
AssertionError: src/app/people/data-table.tsx: found 5 router.push/replace call sites but the
census lists 4.
Census: handleSearchChange (non-empty), L216 [escaped]; handleSearchChange (cleared), L229
[escaped]; useDataTableKeyboard onOpen, L311 [exempt]; Load More, L511 [escaped]
Extracted:
    `/people?${withViewEscape("person", params)}`
    "/people?foo=1"
    `/people?${withViewEscape("person", new URLSearchParams())}`
    `/people/${person.id}`
    `/people?${withViewEscape("person", params)}`
```

**(d) A hand-built `view=` in the bar** — `` `${pathname}?${view.filters}&view=${view.id}` ``. **3 assertions RED**, including the one written for this shape:

```
AssertionError: src/components/views/saved-views-bar.tsx: 1 navigation(s) write a literal view=
instead of going through withViewSelection:
    `${pathname}?${view.filters}&view=${view.id}`

A hand-built view= bypasses every refusal withViewSelection makes — it will happily select a view
over an unfiltered list, or write an id that resolves to nothing. This shape passes a
withViewEscape-only gate, which is exactly why it is asserted here.
```

**(e) An exemption "fixed"** *(added — the plan's four never exercise exemption consumption)* — the exempt kanban site changed to use `withViewEscape`, so classification passes and only consumption can catch it:

```
AssertionError: src/app/deals/kanban-board.tsx: the exemption for handlePipelineChange, L459
matched 0 argument expressions, expected exactly 1.
  Exempt because: already carries `?pipeline=`, a saveable key, so the query is never empty and
  the redirect guard cannot fire. Plan 40-12 proved this with a negative test: adding
  withViewEscape here turned its own gate RED. The expression text must stay byte-identical
  Expected text : `${pathname}?pipeline=${pipelineId}`
```

**(f) A filter surface mints a selection** *(added — and this one found the hole worth finding)* — `deal-filters.tsx`'s `clearAll` changed to `withViewSelection("deal", params, "some-view-id")`.

**Exactly ONE assertion fired.** Classification passed (the helper *is* in the allow-list), the per-file count passed, escaped-13 passed, exempt-4 passed. Only this caught it:

```
AssertionError: withViewSelection( appears in 1 navigation(s) on a filter surface:
    src/app/deals/deal-filters.tsx: `${pathname}?${withViewSelection("deal", params, "some-view-id")}`

Only the saved-views bar may mint a selection. A filter toolbar that wrote view= would let changing
a filter silently REASSIGN which saved view is open, so the user's next "update this view" would
overwrite a view they never chose.
```

Without that assertion the gate would have been **silent** on a filter change reassigning the open view. It is the plan's item 2, and it earns its place.

**(g) The import rule, both directions** *(added)*:

```
AssertionError: src/app/deals/deal-filters.tsx escapes at least one navigation but does not import
withViewEscape from @/lib/views/url-params. Imported: [VIEW_ESCAPE_KEY]: expected false to be true

AssertionError: src/app/deals/kanban-board.tsx imports withViewEscape from @/lib/views/url-params
but escapes nothing — an unused import reads as compliance without being it. Every navigation here
is a named exemption; if that changed, update the census.
```

### The responsive gate (11)

The plan mandated one. **Sixteen of this gate's assertions guard an empty set** — zero `grid-cols`, zero `md:`, zero `Popover`, zero `sticky`, and so on — so each family got its own proof. Every one turned the intended assertion RED **and no other**:

| Proof | Mutation | Assertion that fired |
|---|---|---|
| **P1** *(plan-mandated)* | `grid grid-cols-2` on a manage-dialog wrapper | `1 unprefixed multi-column grid(s):` |
| P2 | the save dialog's `<form>` made a bare flex row | `1 flex row(s) that can neither wrap nor shrink:` |
| P3 | `min-w-0` off the bar's outermost row | `…the bar's outermost row is <div className="flex flex-wrap items-center gap-2"> … Without min-w-0 the row refuses to shrink below its content and the picker cannot truncate.` |
| P4 | `min-w-0` off the picker trigger | `…the picker trigger is <Button …` |
| P5 | `min-w-0` off the manage name cluster | `…the row's first child (the name cluster) is <div className="space-y-1"> … pushes the row's controls off the right edge instead of truncating.` |
| P6 | `md:ml-2` on a Badge | `1 className(s) declare a md: variant:` |
| P7 | `sticky` on the bar row | `sticky appears on 1 element(s):` |
| P8 | a `Popover` import + element | `Popover appears 1 time(s):` |
| P9 | `text-2xl` in the manage dialog | `2 element(s) use a font size outside the three this phase declares:` |
| P10 | one `flex items-start gap-2` given `flex-wrap` | `the wrap exemption "flex items-start gap-2" matched 3 element(s), expected 4.` |
| P11 | `const SNEAKY = "className=grid-cols-2"` | `the file declares className= 20 time(s) but only 19 were extracted from opening tags.` |

P11 is the anti-vacuity check: it proves the extractor cannot silently miss a className and thereby hide every violation on that element.

## Which Brace Matcher Was Reused

**`openingTagAt`, `tagIndexes` and `elementRegion` from `src/components/custom-fields/__tests__/source-scan.ts`** — 40-08's walkers, promoted there by 40-09. Plus `callArguments` and `readStrippedSource` from the same module.

**No new brace matcher was added.** The repo's count is unchanged: the two on BACKLOG for consolidation (`toolbar-wiring.test.ts`'s two module-private walkers) plus `source-scan.ts`'s. The one new scanner in the responsive gate, `classNamesOn`, reads a *value* inside a tag that `openingTagAt` has already delimited — it finds no structure and cannot be used to locate an element.

## Deviations from Plan

**1. [Rule 1 — plan assertion contradicted by the tree] `kanban-board.tsx` must NOT import `withViewEscape`.**
- **Found during:** Task 1, writing the import assertion.
- **Issue:** The plan asks the gate to assert `withViewEscape` is imported "in all six files". Measured: five of six. `kanban-board.tsx` imports it nowhere — correctly, because **both** its navigations are named exemptions, so it never calls the helper. Asserting the plan's rule would have forced an **unused import**, which is precisely the "an unused import would still be a lie" failure the plan's own sentence warns about two lines earlier.
- **Fix:** Implemented as an **iff** rule derived from the data — a file imports `withViewEscape` exactly when at least one of its extracted arguments contains `withViewEscape(`. Strictly stronger than the plan's rule in both directions, and it needs no hardcoded file list. Both directions proven in (g).
- **Commit:** `198f538`

**2. [Authorised by dispatch, not in the plan] The `elementRegion` self-closing fix.**
- Its own atomic commit `827f72e`, with 10 focused tests, purity demonstrated above, and the trailing-`>` convention pinned rather than changed.

**3. [Rule 2 — missing critical coverage] Thirteen negative proofs beyond the five the plan mandates.**
- **Why:** the plan's five leave the exemption-consumption half, the mint-no-selection half, the import rule and ten of the responsive families entirely unexercised. Proof (f) shows this was not hypothetical — that assertion is the *sole* guard against its defect, and every other assertion in the file passes while it is present.
- **Commits:** `198f538`, `72484dc`

**4. [Rule 1 — my own gate was wrong] `indexOf("<DropdownMenu")` matched `<DropdownMenuRadioItem`.**
- **Found during:** Task 2, first run. The bar's `viewItem` helper declares `<DropdownMenuRadioItem` at offset 4533, *above* the row div at 5700, so the substring search scoped the assertion to the wrong element and then found no enclosing `<div>` at all — the assertion failed for a reason unrelated to the rule it tests.
- **Fix:** `tagIndexes`, which boundary-checks the tag name. This is the same class of defect as 40-09's `Check` / `onCheckedChange` collision, and it is why the upstream note about substring collisions is in the dispatch.
- **Commit:** `72484dc`

**5. [Rule 1 — my own gate was wrong] The `src/components/ui/` git check flagged a test file.**
- **Found during:** Task 2, first run. `src/components/ui/checkbox-indeterminate.test.ts` changed since the phase base — but it is a **colocated test**, not a primitive. Plan 40-08 appended a row to it recording an eleventh `Checkbox` consumer, which is a test noting a fact *about* this phase, not an edit to a shared component.
- **Fix:** the check excludes `__tests__/` and `*.test.ts(x)`, and the phase base is pinned to `bb5be2e~1` (the parent of this phase's first commit) rather than inferred from a date.
- **Commit:** `72484dc`

**6. [Reported, not fixed] `extractToolbarRegion` shares the self-closing blind spot.** Latent; consolidation is on BACKLOG. See the `elementRegion` section above.

## Verification

| Check | Result |
|---|---|
| `npx vitest run` | **3789 passed / 28 skipped / 3817 total**, 144 files passed / 1 skipped |
| Baseline at `6d9a942` | 3721 passed / 28 skipped / 3749 total |
| Delta | **+68** = 10 (source-scan) + 29 (call-site) + 29 (responsive) — no other test's result changed |
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **0 errors**, 125 warnings (all pre-existing; the dispatch quoted 127 — the two new test files add none either way) |
| `git diff --stat bb5be2e~1..HEAD -- src/components/ui/` | `src/components/ui/checkbox-indeterminate.test.ts \| 13 +++++++++++-` — **one colocated test, zero primitives** |
| `git diff --name-only bb5be2e~1..HEAD -- "src/components/ui/*.tsx"` | **empty** |
| Source files modified by this plan | **none** — `git diff --stat` clean after every negative proof was reverted |

The 24 skipped `formatters-live` tests self-skip on `!process.env.DATABASE_URL`, as expected.

## Known Stubs

None. This plan adds only gates over code that already exists.

## Threat Flags

None. This plan adds no runtime surface — two test files, one test-helper fix, zero production-code changes.

## Notes for Plan 40-15 and the Verifier

- **Every number in both gates is static.** Nothing here measures a viewport. 40-15 still owns the only real 320px measurement in this phase, and the responsive gate's header says so explicitly so a reader cannot mistake a green class-token check for a layout proof.
- **`elementRegion` now works on `kanban-board.tsx`.** 40-12's gate 8 offset-counting workaround can be simplified to a depth-matched region whenever someone touches that file next. Not done here: it would mean editing another plan's gate with no defect to justify it.
- **The census is the thing to update, not to loosen.** If a later plan adds a navigation to any of the seven files, the per-file count assertion fails first and prints every extracted expression. The correct response is a new row in `SITES`, escaped or exempt-with-a-reason — never widening a match.

## Self-Check: PASSED

All four created files exist on disk and all three commits resolve in `git log`:
`827f72e`, `198f538`, `72484dc` — each a child of the phase base `6d9a942`.
No modifications to `STATE.md` or `ROADMAP.md`; the orchestrator owns those writes.
