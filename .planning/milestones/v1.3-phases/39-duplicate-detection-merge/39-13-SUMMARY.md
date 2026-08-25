---
phase: 39-duplicate-detection-merge
plan: 13
subsystem: dedup
tags: [dedup, rsc, next-intl, polling, react-hooks, progress-bar, responsive, refactor]

# Dependency graph
requires:
  - phase: 39-11
    provides: "`/duplicates` shell (layout gate, page, tabs, url-params), the six server actions, `ScanProgressPayload` / `DedupErrorCode`, and the two documented stubs this plan fills"
  - phase: 39-07
    provides: "`listPairs` (cumulative window + `hasMore`, `{ ok: false }` on failure), `MAX_PAIR_PAGE`, `PairListRow` / `PairSideSummary`"
  - phase: 39-06
    provides: "`getLatestScan`, `calculateScanProgress`, `DedupScanStatus`, and the recorded caveat that `createScanState`'s running guard is advisory rather than atomic"
  - phase: 39-04
    provides: "every `dedup.scan.*` and `dedup.review.*` key in three locales, plus the exact-set `REQUIRED_DEDUP_KEYS` contract this plan extends by one"
  - phase: 39-16
    provides: "the import completion summaries whose progress bar this plan refactors underneath them"
provides:
  - "`src/components/ui/progress-bar.tsx` — the app's ONE determinate progress bar, lifted from the importer; `src/components/import/progress-bar.tsx` is now a thin wrapper with an unchanged public API"
  - "`src/app/duplicates/scan-panel.tsx` — the four P-4 renderings and a 1s poll that genuinely stops on a terminal status"
  - "`src/app/duplicates/pair-card.tsx` — the stacked pair card, reused verbatim by the dismissed view (L-7)"
  - "`dedup.review.undismissFailed` in all three locales (`REQUIRED_DEDUP_KEYS` 78 -> 79)"
  - "`page.tsx`: the scan panel above the tab content, the pair list, `loadMore` paging, and a server-side projection of each side's distinguishing value"
affects: [39-17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "a poll whose interval is created BEFORE the first fetch, so the poll callback can clear it when the very first answer is already terminal"
    - "state reset by `key` on the client component from the server render (entity type + scan id), instead of an adjust-state-on-prop-change effect — no `setState` outside a callback anywhere in the file"
    - "four renderings as four named top-level components, so a comment-blind source gate can extract ONE region and assert about it alone"
    - "a fire-and-forget server action whose refusal is still handled via `.then()` — no `await`, but no unhandled refusal either"
    - "relative-time strings built in the SERVER render and passed as pre-formatted props, avoiding the SSR/hydration divergence `relative-time.tsx` carries a lint suppression for"
    - "additive optional props on a lifted component, so the original caller's rendering is provably unchanged while a second caller gets what its spec requires"

key-files:
  created:
    - src/components/ui/progress-bar.tsx
    - src/app/duplicates/scan-panel.tsx
    - src/app/duplicates/pair-card.tsx
    - src/app/duplicates/__tests__/scan-panel-wiring.test.ts
    - src/app/duplicates/__tests__/pair-card-wiring.test.ts
  modified:
    - src/components/import/progress-bar.tsx
    - src/app/duplicates/page.tsx
    - src/messages/en-US.json
    - src/messages/pt-BR.json
    - src/messages/es-ES.json
    - src/messages/locale-parity.test.ts

key-decisions:
  - "The poll stops TWICE and both stops are load-bearing: `clearInterval` in the terminal-status branch of the poll callback, and `clearInterval` in the effect cleanup reached by the derived `pollScanId` turning null. Writing the gate proved the second is not enough on its own — deleting the terminal stop left an earlier version of the gate green, because the poll's other early exits also clear."
  - "The panel's state is reset by a `key` carrying BOTH the entity type and the scan id, not by an effect. The entity-type half is a real bug fix: switching tabs re-renders an identical tree, so React would reuse the instance and carry an optimistic organization 'running' state onto the people tab."
  - "The launch is fire-and-forget (no `await`) but its refusal IS handled. `SCAN_RUNNING` triggers `router.refresh()` rather than an error: the server render is the authority on whose scan is running and how far along, so the panel comes back as someone else's running scan with no cancel control — which is exactly P-6."
  - "`dedup.scan.lastRun` is built in `page.tsx`, not in the client component. A relative-time string computed client-side differs between SSR and hydration for anything under a minute old, which is the precise age of a scan that just finished."
  - "P-6 needs a NAME and 39-11's payload deliberately carries only a boolean, so the starter's display name is resolved by one server-side lookup per render — not per poll tick — and only in the one state that renders it."
  - "The pair card's distinguishing value is projected on the SERVER. `PairSideSummary` carries the whole `customFields` blob; shipping it would send every custom field of both records, for 25 cards, so the browser could pick one string out of it."
  - "A pair whose record was deleted since the scan renders `dedup.merge.gone` and DROPS the merge button. Dismiss stays, because it is the one action that still means something."
  - "The pair card declines truncation on record names even though the typography rule permits it there: the two names are near-identical by construction, so a truncation removes exactly the characters that distinguish them."
  - "`dedup.review.undismissFailed` was added rather than reusing `dismissFailed`, which says 'That pair wasn't dismissed' — the opposite of what is true when an undismiss fails."

requirements-completed: []

metrics:
  duration: ~50 min
  completed: 2026-08-19
  tasks: 3
  files-created: 5
  files-modified: 6
  commits: 5
---

# Phase 39 Plan 13: The Scan Panel, the Pair Card and One Progress Bar — Summary

`/duplicates` now starts a scan, shows how far it has got, stops polling when it ends, and lists the
pairs it found as cards that read identically at 320px and 1280px — and the app has one progress bar
instead of two, with the importers provably untouched.

## The three defect classes this plan was one careless copy away from

Stated first, because avoiding them was the plan's whole reason for existing.

**1. `react-hooks/set-state-in-effect` (ERROR severity in this repo, hit independently by three Phase
38 plans).** `scan-panel.tsx` contains **zero** `setState` calls outside a callback — not in the
effect body, and not in a render-time adjust-on-prop-change either. The poll's setters live inside the
async function `setInterval` invokes; the panel's reset comes from a `key` on the server render. That
second choice matters: the obvious alternative (React's documented adjust-state-during-render pattern)
would have put a setter in the render path for no benefit, since a `key` does the same job and is what
React documents for a full reset.

**2. The analog's dead stop-polling effect.** `progress-step.tsx:48-53` is a `useEffect` whose body is
a comment: it clears nothing, so that importer polls its finished job for as long as the tab is open.
This panel clears the interval in the poll callback's terminal-status branch **and** in the cleanup.

**3. The analog's presentation.** `text-green-600`, `text-orange-500`, `grid grid-cols-2
md:grid-cols-4` of large-type stat tiles, eleven hardcoded English literals. Counted at zero in both
new components, by gate and by hand.

## Task-by-task

### Task 1 — the progress-bar lift (`1fc0fa3`)

`src/components/ui/progress-bar.tsx` holds the presentational half. `src/components/import/progress-bar.tsx`
kept its exact signature (`({ progress }: { progress: ImportProgress })`) and its hardcoded
`PHASE_LABELS`, and delegates.

**V-5, quoted as the acceptance criteria require:**

```
$ git diff --stat 7f29674 -- src/app/import/import-wizard.tsx src/app/admin/import/pipedrive-api/steps/progress-step.tsx
$ git diff --stat 7f29674 -- src/app/import/steps/confirm-step.tsx
```

Both produce **no output at all** — zero-line diffs against the plan's base.

| Acceptance grep | Required | Actual |
|---|---|---|
| `grep -c "PHASE_LABELS" src/components/ui/progress-bar.tsx` | 0 | **0** |
| `grep -c "h-2.5" src/components/ui/progress-bar.tsx` | 1 | **1** |
| `grep -c "h-2.5" src/components/import/progress-bar.tsx` | 0 | **0** |

**The importers' behaviour is DEMONSTRATED, not assumed** (the shared-component instruction). Three
independent pieces of evidence:

1. **The class-string sequence is byte-identical.** Extracting every `className="…"` from
   `git show HEAD:src/components/import/progress-bar.tsx` (the pre-lift file) and from the new
   `ui/progress-bar.tsx` gives the same seven values in the same order:
   `["w-full space-y-2", "flex items-center justify-between text-sm", "text-muted-foreground", "font-medium", "bg-muted h-2.5 w-full overflow-hidden rounded-full", "bg-primary h-full rounded-full transition-all duration-300 ease-out", "text-muted-foreground text-xs"]`.
2. **The prop mapping is 1:1 and total** — `label` from `PHASE_LABELS[progress.phase] ?? progress.phase`,
   and `percentage` / `current` / `total` straight through. The wrapper passes no `countsLabel`, so the
   `current / total` line renders exactly as before.
3. **Zero-line diffs at both call sites**, above, so neither importer can even see the change.

**V-5's second call site is not where the plan says it is, and this is worth recording.** The plan and
39-UI-SPEC both name `src/app/import/import-wizard.tsx` as a `ProgressBar` call site. It is not one —
`grep -rn "ProgressBar" src/app/import/` returns only `src/app/import/steps/confirm-step.tsx:195`
(a file plan 39-16 edited last wave). The zero-line-diff assertion on `import-wizard.tsx` is therefore
vacuously true, so **the real call site was asserted as well**, and it is also unchanged. See
Deviations.

### Task 2 — the scan panel and its poll (`98eb4d7` RED, `41d35e6` GREEN)

Written test-first: the gate was committed failing with `ENOENT: scan-panel.tsx`, then made to pass.

**Four states, four named components** — `ScanIdlePanel`, `ScanRunningPanel`, `ScanCompletedPanel`,
`ScanFailedPanel`, plus `ScanCancelButton` and `ScanStarterNote`. They are separate top-level functions
because a source gate can then extract ONE region and assert about it: "the background hint appears in
both the idle and running regions" and "the non-starter branch renders no cancel copy" are not
expressible against a 200-line anonymous return.

| UI-SPEC rule | How it is satisfied |
|---|---|
| P-1 | determinate bar, with `dedup.scan.progress` beneath the track as its counts line |
| P-3 | `setInterval(poll, 1000)`, `mounted` flag, setters inside the async callback, two independent stops |
| P-4 | four renderings, exact copy keys, `Alert variant="destructive"` for failed |
| P-5 | `backgroundHint` in **both** idle and running, asserted per extracted region |
| P-6 | `startedBy` with the starter's real name, and **no** cancel control, for a non-starter |
| P-7 | the CTA is not greyed — it is REPLACED by the running rendering, which is the visible reason |
| P-8 | no stat tiles, no per-phase breakdown; `text-2xl` counted at 0 |

**Three RUN negative proofs** (all three executed, restored, and re-verified green):

| Proof | Mutation | Result |
|---|---|---|
| 1 | `setLaunchFailed(false)` inserted directly in the effect body | **BOTH** failed. Lint: `error  Error: Calling setState synchronously within an effect can trigger cascading renders` at `scan-panel.tsx:310:5`. Gate: `setLaunchFailed is called directly in the effect body. react-hooks/set-state-in-effect is an ERROR in this repo; move it into the async poll callback` (`expected [ 'setLaunchFailed' ] to deeply equal []`). |
| 2 | deleted the `clearInterval` from the poll's terminal-status branch | **Failed by name**: `stops the poll in the terminal-status branch specifically (T-39-33)` — `the terminal-status branch of the poll does not clear the interval, so a completed, cancelled or errored scan would keep being polled for as long as the tab is open`. |
| 3 | added `t("scan.cancel")` to `ScanStarterNote` | **Failed by name**: `offers no cancel control to a viewer who did not start the scan` — `ScanStarterNote — the branch shown to a viewer who did NOT start the scan — renders the cancel copy. P-6 requires the control to be absent there.` |

**Proof 2 changed the gate, and that is the most useful thing this plan learned.** On its first run the
mutation left the gate **green**: the assertion was "the poll callback contains a `clearInterval`", and
the poll's other early exits (a refused request, a run of missing rows) satisfy it. A new assertion was
added that extracts the `if (isTerminal(...))` branch specifically. Without running the proof, the plan
would have shipped a gate that could not detect the exact defect it exists to prevent.

`grep -c "await startDuplicateScan" src/app/duplicates/scan-panel.tsx` = **0**.

### Task 3 — the pair card and the dismissed view (`3ebc3c5` RED, `c7b4ee6` GREEN)

Also test-first (`ENOENT: pair-card.tsx`).

One `rounded-md border p-4` card: the confidence `Badge` and the reason line, then record A stacked
above record B (name as a `text-primary hover:underline` link, matched value beneath at Label
typography muted), then a `flex min-w-0 flex-wrap gap-2` action row. `dedup.review.merge` is
`variant="outline"`, `dedup.review.dismiss` is `variant="ghost"` with an `X`; the dismissed view is the
**same component** with `dedup.review.undismiss` in place of both (L-7).

**`variant="default"` count in `pair-card.tsx` is 0, and every match was read by hand as the acceptance
criteria require.** There are no `variant="default"` occurrences at all: the confidence badge is
`variant={tier === "certain" ? "default" : "secondary"}`, so the literal appears inside a ternary and
never as a prop assignment. All three `<Button` tags name a variant — two `outline`, one `ghost`. The
gate asserts the general form of this (every `<Button` carries `variant=`), which is stronger than the
count and cannot be satisfied by a future button that omits it.

**Every user-visible string comes from the catalog, inspected by hand.** Extracting every string
literal from both new components (comments removed) yields only: module paths, Tailwind class strings,
`t(...)` / `tReason(...)` key suffixes, `DedupErrorCode` and status literals, shadcn variant names,
and `aria-hidden="true"`. **No English sentence appears in either file.** The full literal inventory
was reviewed line by line; `pair-card.tsx` renders 9 catalog keys and `scan-panel.tsx` renders 10.

**Two RUN negative proofs:**

| Proof | Mutation | Result |
|---|---|---|
| 4 | `setHidden(true)` added to the dismiss handler's success branch | **Failed by name**: `removes nothing from a local list when the dismissal fails` — `handleDismiss calls setHidden. The list is server-rendered, so local state that hides the pair would hide one whose write FAILED (L-8)`. |
| 5 | wrapped the two records in `<div className="grid grid-cols-2 gap-2">` | **Failed by name**: `puts nothing in two columns below the sm breakpoint` — `an unprefixed grid-cols-2 puts the two records side by side at 320px, where each would get about 110px (R-3)`. |

## The two stubs plan 39-11 handed over, both now filled

| 39-11 stub | What is there now |
|---|---|
| the empty pair-card region in the rows-present branch | the cards, plus `loadMore` paging bounded by `MAX_PAIR_PAGE`. 39-11's `pairsFound` count line is untouched. |
| `panel = null` for a running / cancelled / errored scan with zero pairs | **still `null`, deliberately — and now honest.** The scan panel directly above explains that emptiness: a progress bar with a count while it runs, a destructive `dedup.scan.failed` Alert when it errored, a rescan CTA with no claim about findings when it was cancelled. None of the three empty-state copies became true in that state, so nothing was invented for it. What DID change is that the empty `Card` frame is no longer drawn around the `null` — a bordered box containing nothing is a box the user tries to read. |

The third 39-11 note (the empty states carry no CTA) is now also resolved for the never-scanned case:
the scan panel above carries the primary CTA, so the page no longer shows an emptiness whose remedy is
unreachable.

## Carry-forward facts honoured

- **The measured timings (organizations 20.6s, people 32.0s) are not promised anywhere.** Nothing in
  the panel states or implies a duration. `dedup.scan.backgroundHint` says the scan runs in the
  background and the user may leave, which is true at any duration; the determinate bar is what
  answers "how long", from real progress rather than from an estimate.
- **Single-flight is never presented as a guarantee.** `createScanState`'s guard is read-then-write, so
  `SCAN_RUNNING` is handled as a normal outcome that refreshes to server truth, not as an impossible
  error. No migration was generated; the journal still ends at `idx: 17`.
- **A low organization pair count is not treated as an error.** There is no "suspiciously few results"
  state anywhere; 405 pairs render as 405 pairs.
- **Tier badges follow `scoring.ts`, not prose.** The card switches on the `tier` column
  (`certain` / `likely`) and never re-derives a tier from a reason, so `similarNamePhone` arriving at
  `likely` renders as "Likely" with no special-casing.
- **The normalized columns are never offered as user-visible fields.** `normName` appears only as a
  read-only distinguishing VALUE beneath a name, never as something to choose between.
- **The comment-versus-grep trap (hit four times in this phase) bit again, twice, and was handled by
  rewording rather than deleting.** `ui/progress-bar.tsx` must contain `h-2.5` exactly once and
  `PHASE_LABELS` zero times, so its header describes "the 10px track height" and "the importer's
  hardcoded phase-label map" in prose and states that the tokens are deliberately unspelled.

## Verification

| Check | Result |
|---|---|
| `vitest run src/app/duplicates` | **63 passed** (26 from 39-11, 22 scan panel, 15 pair card) |
| `vitest run src/app/duplicates src/components src/messages` | **393 passed** |
| `vitest run src/messages/locale-parity.test.ts` | **9 passed**, with the 79-key exact-set contract |
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **0 errors**; 125 pre-existing warnings, **none in any file this plan touched** |
| `npm run test` (both projects) | **2642 passed / 21 skipped**, and **8 passed** in the rsc project |
| `git diff --stat` on both importer call sites (vs base) | **empty** |
| `git diff --stat src/app/import/steps/confirm-step.tsx` (the real CSV call site) | **empty** |
| files under `src/app/duplicates/[pairId]/` touched | **none** (plan 39-15 owns them) |
| `src/components/ui/radio-group.tsx` touched | **no** (plan 39-15 owns it) |
| `package.json` / `vitest*.config.ts` touched | **no** |
| migration generated | **none**; `_journal.json` ends at `idx: 17` |

No Docker rebuild and no Playwright run — plan 39-17 owns both. Nothing was written to the live
database: this plan runs no query of its own beyond the one guarded `users` lookup it added, and no
test in it touches Postgres.

## Deviations from Plan

### Auto-fixed / auto-added

**1. [Rule 1 - bug] The `ScanPanel` key needed the entity type, not just the scan id**
- **Found during:** Task 2
- **Issue:** the panel is a client component holding polled state. Switching tabs re-renders the same
  position with an identical tree shape, so React reuses the instance. With a key of only the scan id,
  two never-scanned tabs share the key `"none"` — an optimistic "running" state produced by clicking
  Scan on the organizations tab would then render, unchanged, above the people tab's list.
- **Fix:** `key={`${entityType}:${scanPayload?.scanId ?? "none"}`}`, with the reasoning at the site.
- **Commit:** `41d35e6`

**2. [Rule 2 - missing critical functionality] The fire-and-forget launch handles its refusal**
- **Found during:** Task 2
- **Issue:** the analog (`pipedrive-api-wizard.tsx`) discards the promise entirely. Copying that
  faithfully would leave a progress bar advertising a scan that never started whenever
  `startDuplicateScan` returns `SCAN_RUNNING`, `NOT_ADMIN` or `FAILED` — and `SCAN_RUNNING` is
  reachable in normal use, because the guard behind it is advisory.
- **Fix:** `.then()` on the un-awaited call (so `grep -c "await startDuplicateScan"` stays 0).
  `SCAN_RUNNING` drops the optimistic state and `router.refresh()`es to server truth; anything else
  drops it and renders the failed Alert, whose copy ("No records were changed. Start the scan again")
  is true for a launch that never began.
- **Commit:** `41d35e6`

**3. [Rule 2 - missing critical functionality] Two additive optional props on the lifted progress bar**
- **Found during:** Task 2
- **Issue:** P-1 puts `dedup.scan.progress` ("{current} of {total} records compared") **beneath the
  track**, which is the position the lifted bar fills with a raw `1,234 / 46,054`. Rendering both says
  the same thing twice; and the bar's left-hand label would repeat `dedup.scan.running`, which P-4
  already requires above the bar at Heading typography.
- **Fix:** `label?: string` and `countsLabel?: string`, both optional and both defaulting to the exact
  previous behaviour. The importer passes neither, so its rendering is provably unchanged (see the
  three pieces of evidence in Task 1) and V-5 still holds. The alternative — passing `total={0}` to
  suppress the counts line — would have put a false value in a prop to achieve a layout.
- **Commit:** `41d35e6`

**4. [Rule 2 - correctness] `dedup.scan.lastRun` and the starter's name resolved on the server**
- **Found during:** Task 2
- **Issue:** two problems the plan's text does not anticipate. (a) A relative-time string computed in a
  client component differs between the SSR render and hydration for anything under a minute old, which
  is exactly when a user reads "Last scanned …"; `src/components/ui/relative-time.tsx` carries a
  documented lint suppression for the same problem, and 39-UI-SPEC forbids using that component here
  because it renders an element. (b) `dedup.scan.startedBy` needs `{name}`, and 39-11's
  `ScanProgressPayload` deliberately carries only `startedByViewer` — so there was no name to
  interpolate.
- **Fix:** both strings/values are produced by the server render and passed as props —
  `lastRunLabel: string | null` and `startedByName: string | null`. The name lookup is a guarded
  single-row read that only runs when a scan of this type is in flight and the viewer did not start it,
  so it costs nothing in every other state and is not repeated per poll tick.
- **Commit:** `41d35e6`

**5. [Rule 2 - correctness] A pair with a deleted record drops the merge button**
- **Found during:** Task 3
- **Issue:** `listPairs` keeps its visibility predicate in the join's ON clause specifically so a pair
  survives one of its records being deleted, with that side null-extended. The plan does not say what
  the card does with it. Offering "Review and merge" would open a screen that can only refuse, and
  rendering a link to a deleted record's detail page is a broken link.
- **Fix:** the record block renders `dedup.merge.gone` — which says "One of these records is no longer
  available. It may already have been merged or deleted", exactly the true statement, and is the same
  sentence the merge screen shows for the same cause — and the merge affordance is suppressed. Dismiss
  stays, because clearing an unactionable pair out of the queue is the one thing left that helps.
- **Commit:** `c7b4ee6`

**6. [Rule 2 - missing critical functionality] `dedup.review.undismissFailed`, a new key**
- **Found during:** Task 3
- **Issue:** the plan specifies the dismiss failure path and says nothing about the undismiss one.
  `dedup.review.dismissFailed` reads "That pair wasn't dismissed. Check your connection and try again"
  — which, when moving a pair back OUT of the dismissed list fails, states the opposite of the truth:
  it is still dismissed, and that is the problem being reported. The alternatives were a hardcoded
  literal (forbidden, K-1) or a silent failure.
- **Fix:** `dedup.review.undismissFailed` in all three locales, mirroring `dismissFailed`'s structure
  with the vocabulary already used by `undismiss` / `undismissed` in each language.
  `REQUIRED_DEDUP_KEYS` **78 -> 79**, the review group comment **18 -> 19**, both length assertions and
  the three stale prose counts updated. The exact-set gate passes in both directions, which is what
  proves the key is present, non-blank and non-identical across locales. This follows plan 39-11's
  recorded precedent for `review.unavailable`.
- **Commit:** `c7b4ee6`

**7. [Rule 2 - information disclosure] `PAIR_GONE` reports the cause, not the user's connection**
- **Found during:** Task 3
- **Issue:** the plan says `PAIR_GONE` gets a `toast.error` without saying which. Using
  `dismissFailed` would blame the network for a write the server refused deliberately (the pair is no
  longer `open` — someone else dismissed or merged it, or a rescan superseded it), and the user would
  retry a button that will refuse again.
- **Fix:** `dedup.merge.gone` for `PAIR_GONE` plus `router.refresh()`, so the button that can no longer
  do anything leaves the page. Every other failure keeps `dismissFailed` **and does not refresh** —
  the server's answer is that nothing changed, so a re-render would cost a round trip to show the same
  list.
- **Commit:** `c7b4ee6`

**8. [Rule 3 - blocking] The gate for the terminal-status stop had to be strengthened mid-proof**
- **Found during:** Task 2, running negative proof 2
- **Issue:** the first version of the assertion ("the poll callback contains a `clearInterval`") stayed
  green when the terminal-status stop was deleted, because the poll's other early exits also clear the
  interval. A gate that cannot detect the defect it names is worse than no gate, because it is
  reassuring.
- **Fix:** a second assertion that extracts the `if (isTerminal(...))` block by brace matching and
  requires the clear inside it. The comment above it records that this was discovered by running the
  proof rather than by reasoning.
- **Commit:** `41d35e6`

**9. [Rule 3 - blocking] The state-setter detector matched `setInterval`**
- **Found during:** Task 2
- **Issue:** the K-7 assertion looks for `set[A-Z]…(` calls outside nested functions. `setInterval` has
  that exact shape and is legitimately in the effect body, so the gate failed on correct code.
- **Fix:** an explicit `NOT_STATE_SETTERS` exclusion of the three platform timers, named rather than
  pattern-narrowed — anything narrower would let a real `setScan` through. Proof 1 then showed the
  assertion still catches a genuine setter.
- **Commit:** `41d35e6`

**10. [Rule 1 - bug] The accent-link assertion was checking class ORDER**
- **Found during:** Task 3
- **Issue:** the gate required the adjacent string `text-primary hover:underline`. Utility order in
  this repo is the formatter's to choose, so the assertion failed on correctly written code and would
  have failed again for anyone adding a class to that element.
- **Fix:** both tokens must appear in the same `className` value. The comment records why adjacency is
  the wrong contract.
- **Commit:** `c7b4ee6`

### Within-plan choices worth recording

- **V-5's stated call sites are not the real ones.** `src/app/import/import-wizard.tsx` does not render
  `ProgressBar` — `src/app/import/steps/confirm-step.tsx:195` does. The assertion named by the plan is
  therefore vacuously true, and the real call site was asserted alongside it. Both are empty. Recorded
  because the same stale pair of paths appears in 39-UI-SPEC P-2 and 39-VALIDATION V-5.
- **The empty `Card` frame around a `null` panel was removed** rather than left. It is a two-line
  conditional in `page.tsx` and it is the difference between "nothing to say here" and a bordered box
  that looks like it failed to load.
- **`loadMore` is a `Link`, not a `router.push`.** `/trash`'s precedent uses a button with a push;
  a link keeps the cursor a real URL that the back button and a shared address both honour, which is
  L-1's whole posture for this route. It is bounded by `MAX_PAIR_PAGE`, past which the query clamps and
  the button would visibly do nothing.
- **`REASON_MESSAGE_KEY` and `DETAIL_PATH` are local copies** of the maps
  `src/components/dedup/duplicate-warning.tsx` holds privately. Cross-importing from a create-dialog
  component into a review-list card to save eight lines is a dependency neither file's name predicts;
  both copies are `Record<DedupReason, …>` so a fifth reason is a compile error in both places.
- **The scan panel is a `Card` with `gap-4 p-4`**, overriding the component's `py-6 gap-6`, so it
  matches the `p-4` the spacing contract declares for it and the `p-4` of the pair cards beneath it
  rather than being inset further than they are.
- **The progress sentence is suppressed while `total` is 0** — the first moment of every scan, before
  the count query returns. "0 of 0 records compared" is worse than no line.

## Known Stubs

| Stub | File | Why, and who resolves it |
|---|---|---|
| `dedup.review.merge` links to `/duplicates/{pairId}`, a route that does not exist in this worktree | `src/app/duplicates/pair-card.tsx` | Plan **39-15** creates it, in this same wave. The link is what the plan specifies; if 39-15 does not land, this link 404s and no other behaviour on the page is affected. |
| `panel = null` for a running / cancelled / errored scan with zero pairs | `src/app/duplicates/page.tsx` | **Deliberate and now explained** rather than stubbed — see the stubs table above. The scan panel carries the true statement for each of those three states; the list position stays silent because no list-level sentence is true there. |

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: information-disclosure | `src/app/duplicates/page.tsx` | New surface not in this plan's register: the scan starter's display **name** (falling back to their **email**, since `users.name` is nullable) is now sent to any admin viewing `/duplicates` while another admin's scan of that entity type is in flight. Required by P-6, which cannot be rendered without a name. Assessed as acceptable — every viewer of this route passes `layout.tsx`'s admin gate, and an admin can already read every user's name and email from `/admin`. It is deliberately narrower than the alternative: 39-11 kept the starter's user **id** out of the payload, and this adds no id, only the label the sentence needs, and only in the one state that renders it. |

Everything else this plan touches is already in the register and mitigated at the site: T-39-33 (the
poll that never stops — two independent stops, with a run negative proof that strengthening the gate
was necessary), T-39-08 (the hidden cancel button, gated as presentation with the action named as the
control), T-39-01 (both components live under the admin-gated subtree and every action they call
re-checks the role), T-39-32 (record names render as React text children, which React escapes).

No package was installed. No migration was generated. No new network endpoint or file-access path was
introduced. The only new query in the plan is one guarded single-row `users` lookup.

## Self-Check: PASSED

All five created files exist on disk. All five commits (`1fc0fa3`, `98eb4d7`, `41d35e6`, `3ebc3c5`,
`c7b4ee6`) are present in `git log`. `STATE.md`, `ROADMAP.md` and `REQUIREMENTS.md` were **not**
modified — `git diff --name-only` against the base lists only the eleven source files above. Nothing
under `src/app/duplicates/[pairId]/` and no `src/components/ui/radio-group.tsx` was touched (plan
39-15 owns both this wave), and `package.json`, `vitest.config.ts` and `vitest.db.config.ts` were not
modified.
