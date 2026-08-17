---
phase: 38-bulk-operations
plan: 09
subsystem: ui
tags: [react, next-intl, alert, source-gate, vitest, a11y, information-disclosure]

# Dependency graph
requires:
  - phase: 38-01
    provides: "the `bulk` copy namespace in all three locale files — `failures.*` and `reason.*` are the only strings this component renders"
  - phase: 38-06
    provides: "`BulkFailure`, `BulkFailureReason`, `BulkOperationKind` — the closed, import-free type vocabulary the report consumes"
provides:
  - "BulkFailureReport — an unfilled destructive Alert naming every record that failed and why, returning null when there are none"
  - "BulkFailureReportProps — the prop contract plans 38-15..38-18 mount directly"
  - "bulk-failure-report-wiring.test.ts — a 24-assertion comment-blind gate, including the reason-union copy-key coverage check"
affects: [38-10 bulk action bar, 38-15..38-18 server pages and table clients that mount the report, 38-20 browser UAT]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bounded scroll box (`max-h-48 overflow-y-auto`) instead of a truncating cap, so nothing leaves the DOM or the accessibility tree"
    - "Closed-union translation lookup with no fallback branch, so no server string can reach the UI"
    - "Union-to-copy-key coverage gate: extract the union members from the types module and assert each has a message key"
    - "Weight/spacing overrides applied in the consumer's className rather than patching a shared shadcn primitive"

key-files:
  created:
    - src/components/bulk/bulk-failure-report.tsx
    - src/components/bulk/__tests__/bulk-failure-report-wiring.test.ts
  modified: []

key-decisions:
  - "The reason is looked up as a template key over the closed union (`t(`reason.${failure.reason}`)`) — the plan's key_links pattern required the template spelling, it is the repo's established dynamic-key idiom, and it is byte-identical in behaviour to the concatenation the action text sketched"
  - "The arity tripwire and the copy-key coverage check are SEPARATE tests, so widening the union produces a failure that actually names the key with no copy rather than only a count"
  - "The en-US messages are reached by a static JSON import rather than a file read, because the plan forbids `readFileSync` in this gate and `resolveJsonModule` is already on"
  - "A missing label falls back to the raw id, never to a generic stand-in — an id still NAMES the record, which is what SC-3 asks for"
  - "`activity-list.tsx`'s overdue banner was read as an anti-analog only: its raw red tokens, its `bg-white` card and its `.slice(0, 3)` cap are all pre-existing token debt, neither copied nor fixed"

patterns-established:
  - "Uncapped-list-with-bounded-height: any surface that must NAME every item bounds its height by scrolling, never by truncating, and a source gate forbids `.slice(` in the file"
  - "Union coverage gate: when a closed union is rendered through dynamic message keys, a test extracts the members from the type declaration and asserts a key exists for each — the only detector for a widening that would otherwise be a runtime-only missing-translation"

requirements-completed: [BULK-02, BULK-03]

# Metrics
duration: 14min
completed: 2026-08-17
---

# Phase 38 Plan 09: Per-Record Failure Report Summary

**An unfilled destructive `Alert` that names every single record a bulk operation refused — no "and three others" cap, height bounded by a 192px scroll box instead — with each reason drawn from a closed four-member union so no server sentence can ever reach the browser, pinned by a 24-assertion comment-blind gate whose most valuable test proves every member of that union has a copy key.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-08-17T14:35:00Z
- **Completed:** 2026-08-17T14:49:00Z
- **Tasks:** 2
- **Files modified:** 2 created, 0 modified

## Accomplishments

- `BulkFailureReport` renders **one row per failure, in submit order, with no slicing and no trailing count of omitted records.** SC-3 says failures are *named*; a cap is indistinguishable, from the user's side, from a failure that was never reported. Forty failures therefore produce forty rows.
- Height is bounded by `max-h-48 overflow-y-auto` on the `<ul>` (192px, roughly eight rows). The page does not grow, the fixed action bar below stays reachable, and every row remains in the DOM and in the accessibility tree — a screen reader walks the whole list regardless of the scroll box.
- Each reason is rendered as `t(`reason.${failure.reason}`)` over the closed `BulkFailureReason` union **with no fallback branch and no server-supplied string anywhere**. `BulkFailure` has no `error`/`message` field to render, so the T-38-07 guarantee is structural rather than a review habit.
- Returns `null` on an empty `failures` array, so every caller can mount it unconditionally: with nothing to report the surface is **absent**, not present-and-blank.
- **No timer of any kind.** Dismissal is the explicit button (wired to the caller's `onDismiss`), the next bulk result replacing the state, or the caller clearing the selection.
- No bespoke announcement region — `Alert` hardcodes `role="alert"` at `alert.tsx:28`, and a second region would announce the same text twice.
- `AlertTitle`'s weight-500 default is raised to 600 with `font-semibold` **in this consumer's className**. `src/components/ui/alert.tsx` is byte-identical to its committed state (`git status --porcelain` empty), and the gate asserts it still carries `font-medium leading-none` so a future "fix" that patches the primitive fails loudly.
- All copy comes from the `bulk.*` keys merged in 38-01. **Zero strings invented, zero keys added** — `locale-parity.test.ts` stays green (6 tests).
- Zero packages installed. `alert.tsx`, `button.tsx` and `AlertCircle` were all already in the repo.

## Task Commits

1. **Task 1: BulkFailureReport** — `0523e70` (feat)
2. **Task 2: Comment-stripped source gate for the report** — `329ad85` (test)

## Files Created/Modified

- `src/components/bulk/bulk-failure-report.tsx` — 113 lines; `"use client"` on line 1; exports `BulkFailureReportProps` and `BulkFailureReport` exactly as the plan's `<interfaces>` specified.
- `src/components/bulk/__tests__/bulk-failure-report-wiring.test.ts` — 366 lines, 24 assertions, all against `readStrippedSource` output; `readFileSync` appears **0** times.

**Recorded per acceptance criteria — the four `BulkFailureReason` members the gate extracted from `src/lib/bulk/types.ts`:**

```
notFound, notPermitted, alreadyDeleted, unknown
```

All four have a `bulk.reason.*` entry in `src/messages/en-US.json` (*"No longer exists"*, *"You don't have access"*, *"Already in Trash"*, *"Couldn't be saved"*).

## Decisions Made

- **The reason lookup uses the template spelling.** The plan's action text sketched `t("reason." + failure.reason)`, but the plan's own `must_haves.key_links` pattern is `reason\.\$\{|`reason\.` — satisfiable only by a template literal — and 38-UI-SPEC's anatomy block writes it as `` t(`reason.${record.reason}`) ``. The template form is also the established repo idiom (`shortcuts-overlay.tsx:60`, `audit-entry.tsx:338`). Behaviour is identical; the pattern the plan checks is now satisfied.
- **The messages file is reached by static import.** `import enUS from "@/messages/en-US.json"` rather than a read, because the acceptance criteria pin `readFileSync` at 0 occurrences in this gate. `resolveJsonModule` is already enabled (`tsconfig.json:12`), and the `bulk.reason` object is cast to `Record<string, string | undefined>` so a dynamically-extracted member can index it — which is also what makes the negative proof produce `undefined` rather than a type error.
- **No comment in either new file names a gated token.** Every acceptance-criteria grep is pinned at an exact count, so the component's prose deliberately avoids the literals `max-h-48`, `overflow-y-auto`, `font-semibold`, `variant="destructive"`, `bg-destructive`, `aria-live`, `setTimeout`, `.slice(`, `and N …`, any `#` hex and both dispatch paths. Per the phase's standing instruction, restated for the twelfth time in this plan's own environment notes: **reword the comment, never weaken the gate.**
- **`activity-list.tsx:401-423` was read purely to recognise it as the anti-analog it is.** `border-red-200 bg-red-50 text-red-600 text-red-700 bg-white` *and* a literal `.slice(0, 3)` cap — the exact two mistakes this surface exists to avoid. Left untouched: it is pre-existing token debt belonging to a future UI phase, not this plan's scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] The reason-coverage test could not produce the failure message its own acceptance criterion demanded**

- **Found during:** Task 2, negative proof 2
- **Issue:** Written as the plan specified — one test that asserts exactly four members and *then* loops the copy-key check — the union-widening proof stopped at the arity assertion. Vitest aborts an `it` on the first failed `expect`, so adding a fifth member produced only *"expected [ … ] to have a length of 4 but got 5"* and **never named `bulk.reason.lockedByWorkflow` as the key with no copy**. The acceptance criterion explicitly requires a failure "naming the missing `bulk.reason.*` key", and the person who widens the union needs the key name, not a count.
- **Fix:** Split into two tests over a module-scope `REASON_MEMBERS` list: `still declares the reason union where this gate reads it` (declaration found + arity 4) and `gives every member of the reason union a copy key` (per-member coverage, with its own non-empty anti-vacuity guard so it cannot pass by iterating nothing). Widening now trips **both**, and the second failure names the key.
- **Files modified:** `src/components/bulk/__tests__/bulk-failure-report-wiring.test.ts` (before its commit)
- **Verification:** negative proof 2 re-run; 2 tests red, one naming `bulk.reason.lockedByWorkflow`. Reverted; 24/24 green.
- **Committed in:** `329ad85` (Task 2 commit — the fix landed before the file was staged)

---

**Total deviations:** 1 auto-fixed (1 missing-critical-functionality)
**Impact on plan:** The deviation strengthened the gate: the assertion count rose from 23 to 24 and the union-widening failure is now actionable instead of merely detectable. No behaviour change to the component; no other file touched.

## Negative Proofs (both demonstrated and reverted)

**Proof 1 — a cap makes the gate red.** Temporarily changed the list to `failures.slice(0, 3).map(...)`. Result: **2 tests failed** (the dedicated test plus the iterated LEFT-ALONE table):

> the report must not truncate its list. SC-3 says every per-record failure is NAMED, and a trailing count of the records it left out is exactly the swallowing SC-3 forbids — from the user's side it is indistinguishable from a failure that was never reported. Height is bounded by the scroll box instead: expected true to be false

> bulk-failure-report.tsx must not contain ".slice(". Every entry in this table would break something silently rather than loudly, which is why it is asserted by iteration rather than one test per token: expected true to be false

Reverted; the component is byte-identical to `0523e70`.

**Proof 2 — a fifth reason with no copy key makes the gate red, by name.** Temporarily appended `| "lockedByWorkflow"` to `BulkFailureReason` in `src/lib/bulk/types.ts` without touching any locale file. Result (after the deviation-1 split): **2 tests failed**:

> the reason union must have exactly four members. The count is pinned separately from the coverage check below so that WIDENING the union trips a tripwire of its own: a fifth reason is a copy decision and a server-action decision, not just a type edit: expected [ 'notFound', 'notPermitted', …(3) ] to have a length of 4 but got 5

> bulk.reason.lockedByWorkflow must exist in src/messages/en-US.json. A reason code with no copy key renders as a raw key path in the browser, and nothing else catches it: the compiler cannot, and the locale-parity gate compares the three locale files to EACH OTHER rather than to this union: expected undefined to be truthy

Reverted; `git status --porcelain` shows `src/lib/bulk/types.ts` clean. This is the gate with no alternative detector: the compiler cannot see a missing message key, and `locale-parity.test.ts` compares the three locale files to each other rather than to the union, so it would stay green while the browser rendered `bulk.reason.lockedByWorkflow` as literal text.

## Verification Results

| Check | Result |
|-------|--------|
| `vitest run src/components/bulk/__tests__/bulk-failure-report-wiring.test.ts` | **24 passed** (criterion: ≥10) |
| `vitest run src/messages/locale-parity.test.ts` | 6 passed |
| `vitest run "src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx"` | 14 passed |
| `npm test` (main project) | **1859 passed / 21 skipped** — baseline 1835 + the 24 new, no regressions |
| `npm test` (rsc project) | 8 passed — unchanged |
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **0 errors**, 125 warnings — identical to the pre-existing baseline |
| `git status --porcelain src/components/ui/alert.tsx` | empty — the primitive was not patched |

### Acceptance-criteria greps (component)

| Grep | Required | Actual |
|------|----------|--------|
| line 1 is the client directive | yes | `"use client"` |
| `max-h-48` / `overflow-y-auto` | 1 / 1 | 1 / 1 (same line, `bulk-failure-report.tsx:87`) |
| `\.slice\(|and .* more|andMore` | 0 | 0 |
| `setTimeout|setInterval` | 0 | 0 |
| `aria-live` | 0 | 0 |
| `variant="destructive"` / `bg-destructive` | 1 / 0 | 1 / 0 |
| `font-semibold` | 1 | 1 |
| the four `failures.*` keys | 4 matching lines | 4 |
| hex, `bg-white`, `text-black`, red/green tokens | 0 | 0 |
| `lib/bulk/dispatch` / `lib/trash/dispatch` | 0 | 0 |
| early return on an empty array | present | `if (failures.length === 0) return null` |

### Acceptance-criteria greps (gate)

| Grep | Required | Actual |
|------|----------|--------|
| `readStrippedSource` | ≥3 | 5 (import + 3 calls + 1 in the header) |
| `readFileSync` | 0 | 0 |

## Threat Model Verification

| Threat ID | Disposition | How it is now enforced |
|-----------|-------------|------------------------|
| T-38-07 (info disclosure via the reason) | mitigate | The lookup is a template key over the closed union with **no** default branch; `BulkFailure` has no message field to render; the gate proves all four members have a copy key, so a fifth cannot ship as a raw key path either |
| T-38-27 (silently swallowed failure) | mitigate | Every failure renders, in submit order. `.slice(` is gated at 0 occurrences and the cap regex covers `andMore` and `and N more/others`; negative proof 1 demonstrates the gate fires. Height bounded by scroll, so all rows stay in the DOM and the a11y tree |
| T-38-28 (report vanishes before it is read) | mitigate | `setTimeout`/`setInterval` gated at 0 occurrences; the only dismissal path in the file is the button calling the caller's `onDismiss` |
| T-38-29 (colour as the sole carrier) | mitigate | No background fill (`bg-destructive` gated at 0); the title states a count in words via an ICU plural, and each row states its reason as real text in the muted-foreground token |
| T-38-SC (package installs) | accept | Zero packages installed. `node_modules` was symlinked from the main checkout as the worktree protocol requires |

No new security-relevant surface was introduced: the component takes plain serializable props, performs no I/O, no navigation and no mutation, and imports nothing but two vendored primitives, one icon, `next-intl` and a type-only module.

## Known Stubs

None. The component is complete and self-contained; it has no data source to wire, because its data arrives as props from the callers that plans 38-15..38-18 will build.

## What the Next Plans Need to Know

- **Mount it above the table, below the search/filter row** — not inside the fixed bar, which must stay one compact control cluster at every viewport.
- **`labelById` must be captured at SUBMIT time**, from the array the caller submitted. A record that failed with `notFound` is by definition gone from the next server render, so a label harvested at render time is exactly missing for the rows that need one. A missing entry degrades to the raw id, which is legible but not friendly.
- **Failed records stay selected; succeeded records are deselected** (38-UI-SPEC Surface 7, locked). The report is the *what*; the selection is the *retry*. This component does not touch selection state — that is the caller's.
- **Total failure is a toast, not this panel.** When zero records succeeded, the cause is one thing rather than N things: `toast.error(t("error.deleteFailed"))` and no inline report.
- **Mount it unconditionally.** It returns `null` for an empty array, so no caller needs its own `failures.length > 0 &&` guard.

## Self-Check: PASSED

- `src/components/bulk/bulk-failure-report.tsx` — FOUND
- `src/components/bulk/__tests__/bulk-failure-report-wiring.test.ts` — FOUND
- commit `0523e70` — FOUND
- commit `329ad85` — FOUND
- `src/components/ui/alert.tsx` — unmodified, as required
- `src/lib/bulk/types.ts` — unmodified (negative proof 2 fully reverted)
