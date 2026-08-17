# Phase 38 — Deferred Items

Out-of-scope discoveries logged during execution. Nothing here was fixed; each entry names the
plan that found it and why it is not that plan's work.

## From the phase code review (38-REVIEW.md) — disposition

Status `issues_found`: 1 critical, 10 warnings, 4 info. The review independently re-verified the
declared security contract in all twelve actions and found it intact.

### FIXED — CR-01 (critical): the capped per-stage select-all could never deselect
Fixed in `e341b4f`, reproduced and re-verified live. The cap makes "all selected" unreachable, so the
header checkbox pins at `indeterminate`, and an indeterminate CONTROLLED Radix checkbox emits `true`
on every click — so branching on the emitted value took the select path forever. Measured before:
click 1 → 100, clicks 2 and 3 → nothing. After: 0 → 100 → 0 → 100 → 0. Nine live stages are over the
cap, so this was the ordinary case.

### FIXED — WR-10: the ReDoS assertion lost its divide-by-noise floor
Fixed in `cdbee1d`. This was a fair hit against the orchestrator's own earlier change to that test.

### OPEN — the ones that most deserve a follow-up phase, in priority order
1. **WR-09 (security-relevant): the scoped export applies NO per-record ownership predicate**, while
   delete and reassign both do. Any authenticated user can export any records by id. This is an
   inconsistency in the phase's own contract, not a pre-existing issue, and it needs a product
   decision — should export be owner-scoped like the writes, or is read-by-id intentionally open?
2. **WR-05: the element-level id narrowing — the phase's primary injection guard — has ZERO test
   coverage** in all four suites. Deleting the `typeof`/length checks from all four files leaves 320
   tests green. This is the fifth instance of the phase's own pattern: a gate that proves nothing.
3. **WR-07 (the root cause of CR-01 escaping): every bulk UI gate is a source-text grep and no
   component is rendered anywhere.** ~2,500 lines of tests, zero renders. The gate covering the exact
   CR-01 behaviour asserts only that the string `BULK_MAX_IDS` appears in the file. Closing this means
   deciding whether to add jsdom — which this phase deliberately refused — or to accept that
   interaction behaviour is browser-verified only.
4. **WR-08: CSV formula injection.** A pre-existing sink, but this phase moves it from admin-gated to
   reachable by any signed-in user over anyone's records, with `includeCustomFields: true`.
5. **WR-02**: bulk reassign never revalidates detail routes, and bulk delete of people never
   revalidates `/organizations/[id]`, which lists that org's live people. The `occurrences(...) === 1`
   gate locks the omission in.
6. **WR-03**: the table select-all is uncapped, contradicting `limits.ts`; **WR-04**:
   `bulkReassignOrganizationOwner` is the only reassign that never narrows `ownerId`; **WR-06**: the id
   parser is duplicated four times in three implementations under two names; **WR-01**: nameless users
   all render as "Unknown" while `email` is fetched and discarded.
7. **IN-02** is worth noting for consistency: `kanban-board.tsx` clears selection from inside an
   effect — the very pattern three sibling files in this same phase treat as a build error.

## From plan 38-20's UAT, triaged by the orchestrator

Plan 38-20 reported seven findings. Two were fixed (`cd6d44f`); the rest are recorded here with the
orchestrator's independent verification, because several were reported more strongly than the
evidence supports.

### FIXED — G5: `/organizations` and `/people` had no auth gate
Fixed in `cd6d44f`. **The report overstated it as "serve live CRM data at HTTP 200".** Verified: the
unauthenticated page rendered its EMPTY state ("No organizations found") and the payload carried no
user identity — checked for every seeded address; the only email present is the login form's
`user@example.com` placeholder. No record ever leaked. But the safety was INCIDENTAL, not enforced,
which is why it was still worth fixing. The report also claimed no `middleware.ts` exists; `src/middleware.ts`
does exist — its matcher covers these paths but does not enforce authentication. Verified after the
fix: all of `/organizations`, `/people`, `/deals` now answer **307** to a cookieless request.

### FIXED — G3: the bulk spacer was shorter than the wrapped bar
Fixed in `cd6d44f`. Independently reproduced in a real 320px same-origin iframe: at `innerWidth` 317
the bar stands **130px** tall against an 80px `h-20` spacer, so it covered `Load More`. Now
`h-40 sm:h-20`; re-measured after the fix at **spacer 160 ≥ bar 130**. The same run cleared the bar
of the horizontal-overflow charge: bar width **269** vs clientWidth **301**.

### NOT REPRODUCED — G1: one `Escape` through an open bulk dialog also clears the selection
Reported as high severity. The guard at `bulk-action-bar.tsx:147-156` reads correctly
(`if (!hasSelection || busy || deleteOpen || reassignOpen) return`), so if the defect is real the cause
is React flushing the dialog's `open=false` state synchronously during the same discrete keydown, so
the document listener sees `deleteOpen === false`. **The orchestrator could not reproduce it**, for an
instrument reason, not a product one — see the note below. Treat as OPEN and unconfirmed: it needs a
human at a real keyboard, or a working key-input path. If confirmed, the robust fix is to stop
depending on state-flush timing and check the DOM instead
(`document.querySelector('[role="dialog"][data-state="open"]')`), or to register the listener in the
capture phase so it runs before Radix's dismissable layer.

### BLOCKED, NOT FAILED — T-38-41: Space-to-select on a deal card
**An earlier orchestrator message called this a failure. That was wrong and is retracted here.** The
Claude-in-Chrome `computer` key action delivers **zero key events** to the page in this environment —
proven by calibration, not inferred: a document-level capture listener saw **0 events** for an
`Escape` press, and pressing Space *and* Enter on a plain focused `<button>Add Organization</button>`
produced **0 clicks and no dialog**, where a real keyboard always activates a focused button. A
synthetic `KeyboardEvent` cannot substitute, because synthetic events never produce the browser's
native default action. Click-to-select was confirmed working on the same checkbox
(`unchecked → checked → unchecked`), so the wiring is live. Space-to-select remains **unverified**.

### VERIFIED GOOD in the browser (not deferred — recorded so it is not re-tested)
- **D-07, the per-stage cap:** select-all on the 3,466-deal "Base Fria - Lead" stage selected exactly
  **100**, the bar read "100 selected", and the header went `indeterminate`. The accessible name
  states the cap: *"Select the first 100 of 3466 deals in Base Fria - Lead"*.
- **38-05's indeterminate branch, in a real browser:** in that state `lucide-check` computes to
  `display: none` and `lucide-minus` to `display: block` with real dimensions — genuinely mutually
  exclusive at runtime, which no source gate could establish.
- **Page-scoped select-all copy:** the Organizations header reads "Select all 50 loaded records" —
  page-scoped, as the locked decision requires.
- **Clear selection** empties the selection and unmounts the bar.

### STILL OPEN from the report, not investigated by the orchestrator
- **G2** (pre-existing, app-wide): the bulk delete confirm renders `bg-primary`, not red, because
  `AlertDialogAction`'s Slot concatenates classes so `twMerge` never resolves `bg-primary` against
  `bg-destructive`. **8 other consumers use the identical string**, so this is an app-wide primitive
  issue, not a phase-38 regression. Reported one-word fix: `variant="destructive"`.
- **G6**: the plan's `changes ? 'ownerId'` key_link also matches delete rows (81 vs 47 real
  reassigns) — should be `changes->'ownerId' ? 'to'`. A measurement-query defect, not a product one.
- **G4**: the owner picker shows `Unknown` for the NULL-name admin. **G7**: empty-state column widths
  shift (auto table-layout).
- **38-RESEARCH A4, answered in the negative**: Radix does **not** block document-level hotkeys —
  `d` then `n` with a bulk dialog open produced **3 stacked dialogs**. Pre-existing.

### STILL UNVERIFIED — no browser evidence exists for these
Activities and Trash UAT, the `?type=` deep link end-to-end, the rendered change-history timeline, the
real CSV file download, the inline failure report at 3 and 40 failures, and both non-English locales.
The Deals kanban is now **partly** covered (cap + indeterminate verified above); its drag-wobble and
Space-to-select are not.

## From plans 38-13 and 38-18

### The Deals owner filter can offer an unapproved user

- **File:** `src/app/deals/page.tsx:159-163` (the `allUsers` query)
- **Symptom:** it filters owners on `deletedAt IS NULL` **alone**, with no
  `status = 'approved'` predicate, so a `pending_verification` or `rejected` user can be *offered* in
  the owner controls fed by it.
- **Why it is not a security hole:** `bulkReassignDealOwner` independently validates the target
  against `deletedAt IS NULL AND status = 'approved'` and refuses with `invalid_owner`, so the write
  cannot land. The defect is that the UI presents an impossible choice, not that it permits a bad one.
- **Why out of scope here:** this query feeds `DealFilters` and `DealDialog`, not just a bulk control.
  Tightening it would drop an unapproved deal-owner from the owner *filter*, making that user's
  existing deals unfindable — a different regression. Plan 38-18 confirmed that wiring `bulkOwners`
  never required touching it, so it was left alone deliberately; `bulkOwners` carries both predicates
  and the loose one was not copied into any new code.
- **Where it belongs:** Phase 43 (POLISH). The fix needs a decision about filter-vs-picker semantics,
  which is a product question, not a mechanical tightening.

## From plan 38-03

### ~~`condition-evaluator.test.ts` T-34-20 linearity assertion is flaky under full-suite load~~ — **RESOLVED**

> **Fixed by the orchestrator in `0c0fc0e`, after plans 38-01, 38-02 and 38-03 each hit it
> independently in one wave** (Phase 37 had already recorded it as a live CI-flake risk on master).
> The diagnosis below is correct but understates the cause: the problem was not merely "tolerance too
> tight", it was that a 4x input span gives linear a 4x prediction and quadratic a 16x prediction, so
> a 10x ceiling sat only 2.5x above linear — and measured jitter reached 15.6x, i.e. ABOVE quadratic's
> own prediction. The test could not distinguish the defect it existed to catch from the load it ran
> under, at any tolerance.
>
> The fix widens the input span to 16x (8000 → 128000), which pushes the predictions to 16x linear
> and 256x quadratic, and makes both windows large enough that real work dominates the ~0.9ms of
> fixed overhead that made the old 4000-element measurement mostly constant. Ceiling set to 80x.
>
> Measured on this machine: **13.8x idle, 21.0x under concurrent full-suite load, 186.2x for a
> deliberately quadratic scanner.** Verified 3/3 in isolation and 2/2 under load. The suggested
> step-count rewrite below was considered and rejected as unnecessary — it would require
> instrumenting `resolveFieldPath` itself, and the widened span already yields clean separation.

- **File:** `src/lib/execution/condition-evaluator.test.ts:616`
- **Test:** `resolveFieldPath — parsing is linear, not backtracking (T-34-20) > scales linearly, not quadratically, with path length`
- **Symptom:** `expected 13.34 to be less than 10` — the assertion is a wall-clock ratio
  (`large / small`) with a 10x tolerance.
- **Reproduction:** fails under `npm test` (84 files in parallel), passes on
  `vitest run src/lib/execution/condition-evaluator.test.ts` in isolation, twice each way.
- **Why out of scope for 38-03:** plan 38-03 touches only `src/lib/mutations/deals.ts` and
  `src/lib/mutations/activities.ts` (both additive, 0 deleted lines) and their two suites.
  Neither file is in this test's import graph, and the assertion measures parser timing, not
  mutation behaviour. This is pre-existing timing jitter, not a regression this plan introduced.
- **Suggested fix, if it is ever picked up:** replace the wall-clock ratio with a step-count or
  operation-count assertion, which is what the test actually means to pin. A timing ratio under
  parallel test-runner load will keep going red at random.
