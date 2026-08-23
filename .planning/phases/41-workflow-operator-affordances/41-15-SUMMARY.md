---
phase: 41-workflow-operator-affordances
plan: 15
subsystem: workflows-ui-gates
tags: [source-scan, responsive, 320px, theming, tokens, anti-vacuity]
wave: 4
requires:
  - 41-09 (notification-form's fourth checkbox row)
  - 41-10 (R-4 filter row, dry-run badge, runs-table Status cell)
  - 41-13 (R-1/R-2 run-detail header clusters, replay-run-button)
  - 41-14 (R-3a/R-3b/R-3c toolbar row, dry-run-dialog)
provides:
  - "G-3: R-1..R-4 container classes asserted as exact whole classNames, both positively and negatively"
  - "G-3: R-3b min-w-0 + max-w-[300px] asserted on the SAME opening tag"
  - "G-3: a general isFlexRow/SAFE rule over every extracted className in all nine touched files"
  - "G-4/C-41-1: zero new palette utilities across all 22 Tailwind families, over both extracted classNames and whole stripped sources"
  - "G-7: an in-suite approximation via @/components/ui/ import resolution"
  - "four independent anti-vacuity controls, two of them demonstrated by deliberate break"
affects:
  - src/app/workflows/[id]/runs/components/runs-table.tsx
tech-stack:
  added: []
  patterns:
    - "exact whole-className matching (whitespace-normalised) instead of substring toContain"
    - "paired positive/negative assertions per container rule"
    - "palette scan over whole stripped source as a superset of the extracted-className scan"
key-files:
  created:
    - src/app/workflows/__tests__/responsive-containers.test.ts
  modified:
    - src/app/workflows/[id]/runs/components/runs-table.tsx
decisions:
  - "The palette rule scans the WHOLE stripped source as well as extracted classNames — run-status-badge.tsx proves an extraction-only scan has a blind spot"
  - "runs-table.tsx's pagination row was FIXED rather than exempted: ?page= accepts 9 digits, so its middle item is caller-influenced"
  - "openingTags/classNamesOn copied from responsive-classes.test.ts with a recorded promotion condition rather than promoted now"
  - "The git half of G-7 was not copied from the phase-40 analog: pinning a phase-41 base commit would make this file's history a dependency of its own assertions"
metrics:
  tasks: 2
  commits: 3
  tests-added: 105
  duration: ~35min
  completed: 2026-08-22
---

# Phase 41 Plan 15: G-3 / G-4 Responsive-and-Palette Sweep Summary

One source-scan gate closes UI-SPEC's G-3 and G-4 over the nine files phase 41 touched: 105 tests
asserting that every flex row which gained an item declares a wrap, that the toolbar's name field can
shrink, and that no hardcoded Tailwind palette utility exists anywhere in the new code — with the
scanner proven to fail on broken input for both rules rather than merely passing on correct input.

## Both RED Counts, Recorded Honestly

**Task 1 (G-3) — first run: 41 passed, 1 failed.**

The single failure was the general flex-row rule, which I ran with a deliberately EMPTY
`WRAP_EXEMPTIONS` table so the offender list would be an honest census rather than a table seeded
from reading the code first. It reported 8 rows:

| # | File | className | Verdict |
|---|------|-----------|---------|
| 1 | `toolbar.tsx` | `flex items-center gap-2` | exempt |
| 2 | `status-filter.tsx` | `flex items-center gap-2` | exempt |
| 3 | `runs-table.tsx` | `flex h-[300px] items-center justify-center rounded-lg border border-dashed` | exempt |
| 4 | `runs-table.tsx` | `mt-4 flex items-center justify-center gap-4 text-sm` | **FIXED** |
| 5-8 | `notification-form.tsx` | `flex items-start space-x-3` (×4) | exempt |

Everything the plan predicted might be RED was already GREEN: **all five R-1..R-4 positive
assertions, all five negative assertions, and R-3b passed on the first run.** That is the expected
outcome and the reason this plan is last — 41-10, 41-13 and 41-14 each already asserted their own
R-1/R-2/R-3/R-4 strings inside their own gates, so this sweep was always going to be mostly
confirmation. The exception is the row nobody had gated, which is exactly where the defect was.

**Task 2 (G-4) — first run: 105 passed, 0 failed. Zero RED.** No file in the scanned set contained a
palette utility, a `focus:ring`, or an import that would require a new primitive. Recorded as zero
because it was zero; the deliberate break below is what distinguishes that from a gate that reads
nothing.

## Both Deliberate-Break Proofs

**Break 1 — remove `flex-wrap` from R-3a in `toolbar.tsx`.**

`className="flex flex-wrap items-center gap-4 border-b px-4 py-2"` →
`className="flex items-center gap-4 border-b px-4 py-2"`

Result: **45 passed → 42 passed / 3 FAILED.** Three independent assertions fired, which is the
layered defence the threat model asked for:

1. `R-1..R-4 — the required container class is present, verbatim > R-3a` — "declares no element whose className is exactly `flex flex-wrap items-center gap-4 border-b px-4 py-2`"
2. `R-1..R-4 — the old non-wrapping class is gone, not merely wrapped > R-3a` — "still declares an element whose className is exactly `flex items-center gap-4 border-b px-4 py-2`"
3. `every flex row either wraps, shrinks, or is a named exemption` — "1 flex row(s) that can neither wrap nor shrink"

Restored; back to 45 passed, and `git status` confirmed `toolbar.tsx` byte-identical to its committed
state.

**Break 2 — add `text-red-600` to the Replay trigger in `replay-run-button.tsx`.**

Chosen deliberately as the break site because that file's header prose names `AlertTriangle`,
`bg-destructive/10`, `variant="destructive"`, `AlertDialog`, `closeLabel` and `focus:ring-*` while
explaining why the file omits every one — so it is the strongest possible demonstration.

Result: **105 passed → 103 passed / 2 FAILED:**

1. `G-4 / C-41-1 > declares none on any extracted className` — "1 palette utility/utilities on extracted element(s): `replay-run-button.tsx  <Button>  "text-red-600"`"
2. `G-4 / C-41-1 > replay-run-button.tsx declares none anywhere in its source` — "1 palette match(es) in the stripped source — `-red-6`"

**And exactly one file was named, with exactly one token.** None of the six prose-only markers in that
same file's header produced a false positive. Restored; back to 105 passed, byte-identical.

## The One Source File This Plan Had To FIX

This is the phase's real 320px defect report, and it has one entry.

**`src/app/workflows/[id]/runs/components/runs-table.tsx` — the pagination row.**

`mt-4 flex items-center justify-center gap-4 text-sm` → `mt-4 flex flex-wrap items-center justify-center gap-4 text-sm`

Three items ("← Previous", "Page N of M", "Next →") plus 32px of `gap-4` in a 241px budget, with no
wrap. I fixed rather than exempted it because **the middle item is not a fixed width and is
caller-influenced**: `?page=` accepts up to `MAX_PAGE_DIGITS = 9` digits
(`runs-filter.ts:50,176`), so `Page 123456789 of 123456789` is a reachable string. `justify-center`
means the wrapped rows stay centred, so the wrap costs nothing at any width where it does not
trigger.

Worth stating plainly: **this phase added nothing to that row.** I could have exempted it under the
plan's own rule (exemptions are forbidden only for rows this phase added an item to). I did not,
because an exemption's reason column has to say why the row cannot overflow, and for this row no
honest reason existed. This is the sweep doing the job it was written for — finding a row that four
earlier plans' per-file gates could not see, because none of them looked at pagination.

## Exemption Table — Every Entry With Its Reason

| className | Count | Reason |
|---|---|---|
| `flex items-center gap-2` | 2 | Two control-plus-label clusters, each **nested inside a wrapping parent**: `toolbar.tsx`'s Switch + "Active" sits in the R-3a row, `status-filter.tsx`'s Checkbox + "Show test runs" sits in the R-4 row. A non-wrapping row inside a wrapping one is the *correct* shape — it makes the cluster wrap as a unit instead of splitting a control from the label that names it. Each holds one ~16px control and one short string, and the Label's text wraps as text, so neither can force its parent wide. |
| `flex h-[300px] items-center justify-center rounded-lg border border-dashed` | 1 | `runs-table.tsx`'s empty state has exactly **one child**, a `text-center` block holding two `<p>`s. There is no second item for flex to push off the edge and nothing for `flex-wrap` to reflow; the long sentence wraps as ordinary text and the fixed `h-[300px]` absorbs the extra lines. Adding `flex-wrap` would change nothing at any width. |
| `flex items-start space-x-3` | 4 | `notification-form.tsx`'s four preference rows — pre-existing shape, and this phase added a fourth *row* of it rather than an item to an existing row. Each is a 16px Checkbox plus a text block (Label + description `<p>`). `items-start` holds the checkbox against the first line while the text block wraps as text, which is the wrapping that matters: these are vertical rows that already stack naturally and never grow past their container. |

Each carries an exact count, so an exemption cannot quietly widen to cover something new. The rule is
recorded in the file verbatim: *an exemption whose className changed must be re-examined against
R-1..R-4, not re-counted.*

## Scanner Corrections and Strengthenings

No assertion was weakened. Two decisions went the other way and both are recorded in the gate file.

**1. The palette rule runs over the whole stripped source, not only over extracted classNames.**

The plan specified extraction from opening tags. The file the plan sent me to read is the proof that
this alone is insufficient: `run-status-badge.tsx` parks its three palette pairs in a `statusConfig`
**object literal** and applies them as `className={config.className}`. They therefore appear in *no
opening tag at all*, and an extraction-only scan reports that file clean. Any of the nine could
acquire a palette utility the same way — `const TONE = { ok: "text-green-600" }` is invisible to a
tag walker. So the gate runs both forms, the whole-source one being a strict superset. This is safe
only because comments are stripped first, which is also why the plan's own narrower per-plan analog
(`runs-list-wiring.test.ts:98`) can get away with the same shape.

**2. Exact whole-className matching, never substring `toContain`.**

Two independent reasons, both recorded in the file. A substring match on `flex flex-wrap
items-center gap` matches several rows in these files and so proves nothing about any of them — the
run detail page now carries both `flex flex-wrap items-center justify-between gap-3` (R-1's outer
row) and `flex flex-wrap items-center gap-3` (cluster A). And R-4's negative is only *expressible*
as an exact className: `mb-4` is a substring of the required `mb-4 flex flex-wrap items-center
gap-2`, so a substring form of that assertion can never fail. Comparison is whitespace-normalised so
a stray double space cannot fail a rule for a reason unrelated to it.

**3. Two REQUIRED_PRESENT tokens moved to allow-only, with the reason stated rather than dropped.**

The plan asked that two groups of semantic tokens be asserted present in the scanned set. The first
group (`bg-destructive/10`, `text-destructive`) is present and is asserted so, along with
`text-muted-foreground` and `border-dashed`. The second group's remaining members — `bg-muted`,
`bg-background`, `border-border`, `bg-primary`, `text-primary-foreground`, `bg-input/30` — are **not**
present at any call site, because they live inside `buttonVariants` and the Badge/Textarea
primitives, which this phase reaches through `variant="outline"` / `variant="default"` rather than by
writing the class. Asserting their presence would be asserting something about `src/components/ui/`,
which G-7 forbids this phase from touching. They are asserted only not to trip the matcher, and the
comment in the file says why.

## Anti-Vacuity Controls

Five, of which two are demonstrated rather than asserted:

1. **Per-file extractor completeness** — `className=` occurrences in the stripped source equals the number extracted from opening tags, per file, 9/9. A tag the walker cannot parse would hide every violation on it.
2. **`TOUCHED_FILES.length === 9`** plus a non-empty-stripped-source check per entry, plus a check that every file contributed at least one className. A path typo would otherwise make every negative pass at zero.
3. **`stripper-is-load-bearing`** — asserts, on the real `replay-run-button.tsx`, that all six prose-only markers ARE in the raw source and are NOT in the stripped source. This is what licenses every negative assertion in the file. If a marker leaves the prose, the instruction in the failure message is to remove it from the list, not to remove the test.
4. **No comment delimiter survives stripping**, per file. This is the one that catches an unbalanced quote: `stripComments` is string-aware, so a lone apostrophe in JSX text would open a string it never closes and every comment after it would survive — silently, and without changing any className count.
5. **The palette matcher self-test** — fires on `bg-emerald-100`, does not fire on `bg-destructive/10`, fires on `bg-{family}-500` for each of the 22 families individually, and fires on the real content of `run-status-badge.tsx`. Plus a floor on the number of `@/components/ui/` imports G-7 resolved, so that check cannot pass over an empty set.

## Helper Provenance

All four structural helpers (`stripComments` via `readStrippedSource`, `openingTagAt`, `tagIndexes`)
are imported from `source-scan.ts`. The gate defines **no brace matcher, no comment stripper and no
tag walker of its own** — `source-scan.ts:14-27` records that a fourth one is exactly what it exists
to prevent, and 40-08's promotion condition is already spent.

`openingTags` and `classNamesOn` are copied verbatim from `responsive-classes.test.ts:62-125`, where
they are module-private. Neither is a new structural matcher: `openingTags` is a for-loop over the
shared `openingTagAt`, and `classNamesOn` reads a *value* out of a tag `openingTagAt` has already
delimited, so its brace scan cannot run past that tag. They are on their **second** consumer, and the
gate records the promotion condition in 40-08's own shape: *if a third gate needs them, promote both
into `source-scan.ts` in ONE commit and delete both copies.* I did not promote them now — that would
have meant editing a phase-40 gate file outside this plan's declared scope to save one copy.

## Verification

| Check | Result |
|---|---|
| `npx vitest run .../responsive-containers.test.ts` | **105 passed / 0 failed** |
| `npm test` | **4363 passed / 32 skipped** + RSC **8/8** (baseline 4258 + exactly this gate's 105) |
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **0 errors / 123 warnings** (ceiling is ≤127; none in any file this plan touched) |
| `git diff --name-only src/components/ui/` | **empty** (both vs. the phase base and in the working tree) |
| `e2e/viewport-320.spec.ts` | **unmodified** |
| `side-panel.tsx` | **unmodified** |
| `run-status-badge.tsx` | **unmodified** |

Total change set is exactly two files: the new gate, and the one-token fix to `runs-table.tsx`.

**Lint warning count note for the verifier:** the prompt's baseline said 125 warnings; I measured 123
both before and after my change, and confirmed none of the 123 is in a file this plan touched. The
trend across this phase has been downward (127 → 125 → 123), so 123 is most likely wave 3's merged
state with the handoff figure not re-measured. No warning was introduced or removed by this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `runs-table.tsx` pagination row could overflow at 320px**
- **Found during:** Task 1, by the gate's own general flex-row rule
- **Issue:** `mt-4 flex items-center justify-center gap-4 text-sm` — three items plus 32px of gap in a 241px budget, no wrap, and the middle item's width is caller-influenced via a 9-digit `?page=`
- **Fix:** added `flex-wrap`, with a comment recording that the sweep found it and why the middle item is not fixed-width
- **Files modified:** `src/app/workflows/[id]/runs/components/runs-table.tsx`
- **Commit:** `5082954`

### Scope Judgements Recorded Rather Than Auto-Applied

**Palette scan widened to whole-source** (strengthening, not a deviation from intent): documented
above and in the gate file. The plan's specified extraction point has a blind spot that
`run-status-badge.tsx` itself demonstrates.

**`REQUIRED_PRESENT` narrowed from the plan's two groups to four tokens:** six of the Theme Contract's
tokens are not written at any call site in these files. Asserting their presence would have been
either a failing assertion or an assertion about `src/components/ui/`. Recorded in the file with the
reason rather than silently dropped.

### Not Done, Per Plan

`e2e/viewport-320.spec.ts` not extended. `side-panel.tsx` not touched. `run-status-badge.tsx` not
touched and not added to the scanned set. No package installed, no DOM test environment added, no
Playwright row added. No migration, no Docker restart. `src/messages/*.json` and
`locale-parity.test.ts` untouched. The `Checkbox` importer census left at 12.

## Known Stubs

None. The gate asserts over real files and every assertion has been observed to fail on broken input
or is a self-test of its own matcher.

## Threat Flags

None. This plan adds one test file and one Tailwind token to an existing container; it introduces no
network endpoint, auth path, file access pattern or schema change.

## For the Verifier

- The claim "G-3 and G-4 are gated" rests on 105 tests in one file. Both rules have a recorded
  deliberate break with before/after counts (45→42/3 and 105→103/2) — neither is a green gate that
  has never been seen to fail.
- The phase's 320px defect report is one row: `runs-table.tsx`'s pagination. Every other flex row in
  the nine files either declares a wrap or has a reason in the exemption table.
- `TOUCHED_FILES` is 9 and the exclusions are named in the gate's own comments with a reason each, so
  an absence there is a decision rather than an oversight.
