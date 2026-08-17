---
phase: 38-bulk-operations
plan: 05
subsystem: ui
tags: [radix-ui, lucide-react, tailwind-v4, shadcn, checkbox, source-gate, vitest, accessibility]

# Dependency graph
requires:
  - phase: pre-existing
    provides: the vendored shadcn `Checkbox` wrapper over `CheckboxPrimitive` and the shared string-aware `readStrippedSource` helper from the custom-fields source gates
provides:
  - "`checkbox.tsx` renders MinusIcon for the indeterminate state and CheckIcon for true, via a `group/checkbox` marker on the Root and two mutually exclusive Indicator branches"
  - "`checkbox-indeterminate.test.ts` — a comment-blind source gate pinning the branch, its two vocabulary tables, and the enumerated Checkbox consumer set"
  - "a corrected consumer census: TEN non-bulk modules import `Checkbox`, not the eight recorded in 38-UI-SPEC; none passes an indeterminate value"
affects: [38-07, 38-08, 38-19, 38-20, select-column, bulk-action-bar, header-select-all]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tri-state checkbox visual: one Tailwind group marker on the Root plus two mutually exclusive icon siblings in the Indicator — no prop, no variant, no CSS"
    - "Blast-radius gate for a shared primitive: enumerate the consumer set with an exact count so a new consumer forces a re-check instead of an assumption"

key-files:
  created:
    - src/components/ui/checkbox-indeterminate.test.ts
  modified:
    - src/components/ui/checkbox.tsx

key-decisions:
  - "Asserted the OBSERVED consumer count of 10 rather than the spec's stale 8 — an exact count is the stronger gate, and the two missing modules import with single quotes, which is why a double-quote-only grep undercounted"
  - "Excluded `src/components/bulk/` from the consumer walk by full relative path, not by folder name, so an unrelated `bulk/` elsewhere is still scanned"
  - "Pinned `React.ComponentProps<typeof CheckboxPrimitive.Root>` in the gate, so the behaviour-neutrality claim the consumer test rests on cannot be quietly broken by a new prop"

patterns-established:
  - "Anchor discipline in source gates: assert `indexOf(...) > -1` on the anchor with a named message before slicing, or a missing anchor widens the slice to the whole file and the sub-assertions read the wrong element"
  - "Two-direction negative proof for a source gate: remove the real code (gate red), then re-add it as a COMMENT (gate still red) — the second run is what proves the stripper executed"

requirements-completed: [BULK-01]

# Metrics
duration: 13min
completed: 2026-08-17
---

# Phase 38 Plan 05: Indeterminate Checkbox Branch Summary

**`checkbox.tsx` now draws a dash instead of a check for the mixed state — a 7-line additive patch (`group/checkbox` + two mutually exclusive Indicator icons) plus a 12-test comment-blind source gate proving all 10 existing Checkbox consumers are untouched.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-08-17T13:45:12Z
- **Completed:** 2026-08-17T13:57:58Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- Fixed the real defect the phase would otherwise have shipped: Radix renders `CheckboxPrimitive.Indicator` for `checked === "indeterminate"` exactly as for `true`, so before this patch a partially selected header checkbox drew a CHECK MARK. "3 of 50 selected" and "50 of 50 selected" were visually identical while the accessibility tree already announced `mixed` — a user could confirm a destructive dialog believing every row was selected.
- Kept the patch provably additive: 4 insertions / 3 deletions, no prop added or renamed, no default changed, no variant introduced, no CSS in `globals.css`, no `tailwind.config.*` created, and every pre-existing class (`data-[state=checked]:bg-primary`, `data-[state=checked]:text-primary-foreground`, `disabled:opacity-50`) intact.
- Zero packages installed. `MinusIcon` is already exported by the installed `lucide-react` 0.575.0 as an alias of `Minus` (verified in `dist/lucide-react.d.ts`: `Minus as MinusIcon`). No `shadcn add` was run, so the vendored file was not overwritten.
- Corrected a stale fact in the design contract: the consumer census is **10**, not 8.
- Both required negative-proof directions demonstrated red and reverted, with the observed messages recorded below.

## Task Commits

1. **Task 1: Add the indeterminate branch to checkbox.tsx** — `c3ce7fc` (fix)
2. **Task 2: Comment-stripped source gate for the branch and its consumers** — `befac0f` (test)

## Files Created/Modified

- `src/components/ui/checkbox.tsx` — extended the lucide import with `MinusIcon`; appended `group/checkbox` to the end of the Root's `className` string; replaced the single `<CheckIcon className="size-3.5" />` with `<CheckIcon className="size-3.5 group-data-[state=indeterminate]/checkbox:hidden" />` and `<MinusIcon className="hidden size-3.5 group-data-[state=indeterminate]/checkbox:block" />`. The Indicator's own `data-slot` and `className` are byte-identical to before.
- `src/components/ui/checkbox-indeterminate.test.ts` — new, 12 tests, pure source gate. Reads every file through `readStrippedSource` from `@/components/custom-fields/__tests__/source-scan` (5 references; zero verbatim reads).

## Verification Evidence

| Check | Result |
|-------|--------|
| `vitest run src/components/ui/checkbox-indeterminate.test.ts` | 12 tests passed (plan required ≥ 6) |
| `vitest run src/components/` | 4 files, 44 tests passed |
| `npm test` (full suite, both vitest projects) | 85 files / 1715 passed, 4 skipped; rsc project 2 files / 8 passed — no regression |
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors, 125 warnings — all pre-existing `no-unused-vars` in unrelated files; zero findings in either file of this plan |
| `grep -c 'MinusIcon' checkbox.tsx` | 2 (import line + element line) |
| `grep -c 'group/checkbox' checkbox.tsx` | 1 |
| `grep -c 'group-data-\[state=indeterminate\]/checkbox' checkbox.tsx` | 2 (one `:hidden`, one `:block`) |
| `grep -c 'data-\[state=checked\]:bg-primary'` / `'disabled:opacity-50'` | 1 / 1 — both survive |
| `git diff --numstat src/components/ui/checkbox.tsx` | `4 3` — 7 changed lines, under the 10-line ceiling |
| `git status --porcelain src/app/globals.css` | empty; no `tailwind.config.*` exists |
| `grep -c 'readStrippedSource'` / `'readFileSync'` in the gate | 5 / 0 |

### Consumer census (the substance of T-38-18)

The gate's own detector — `/import\s*\{[^}]*\bCheckbox\b[^}]*\}\s*from\s*['"]@\/components\/ui\/checkbox['"]/` applied to comment-stripped source — resolves exactly these **10** non-test, non-bulk modules:

1. `src/app/(auth)/login/page.tsx`
2. `src/app/admin/export/export-form.tsx`
3. `src/app/admin/fields/[entityType]/field-dialog.tsx` ← not in the spec's list
4. `src/app/admin/fields/[entityType]/fields-list.tsx` ← not in the spec's list
5. `src/app/admin/import/pipedrive-api/steps/select-entities-step.tsx`
6. `src/app/admin/users/all-users-client.tsx`
7. `src/app/admin/webhooks/webhook-dialog.tsx`
8. `src/app/settings/notifications/notification-form.tsx`
9. `src/components/custom-fields/boolean-field.tsx`
10. `src/components/import/import-preview.tsx`

`grep -rn "indeterminate" src/` returns **0 occurrences repo-wide**, so none of the 10 ever puts the Root into the mixed state and the new branch is unreachable for all of them. The behaviour-neutrality claim holds — only the count was wrong.

### Negative proof 1 — the gate goes red when the branch is removed

Deleted the `<MinusIcon .../>` element from the Indicator (leaving the import in place, the harder case). 2 of 12 tests failed:

```
AssertionError: src/components/ui/checkbox.tsx is missing the indeterminate class
"group-data-[state=indeterminate]/checkbox:block" — the mixed state would render a
check mark, indistinguishable from all-selected
AssertionError: src/components/ui/checkbox.tsx must render <MinusIcon: the anchor is
missing, so nothing below could be checked: expected -1 to be greater than -1
```

### Negative proof 2 — comment-blindness

With the real element still absent, added `{/* TEMP negative proof: <MinusIcon className="hidden size-3.5 group-data-[state=indeterminate]/checkbox:block" /> */}` to `checkbox.tsx` — prose containing the gated class string verbatim. The gate produced the **identical two failures**, unchanged. The stripper demonstrably ran; a comment cannot satisfy this gate. Both mutations were reverted with `git checkout -- src/components/ui/checkbox.tsx` and the gate re-run green (12/12) before the Task 2 commit.

## Decisions Made

- **Assert the observed count (10), not the documented count (8).** The plan offered a `>= 8` fallback "if the exclusion makes the count assertion fragile", but the exclusion is not what made 8 wrong — the census itself was stale. An exact count is the stronger gate, so the gate pins 10 with a failure message that names every resolved file and instructs the reader to hand-check a new consumer for the mixed state before bumping the number. 38-UI-SPEC assumption #5 is therefore live, and correctly calibrated.
- **Match the consumer import with a trailing quote class rather than a bare substring**, so a future `@/components/ui/checkbox-group` cannot inflate the count, and accept both quote styles because this codebase genuinely uses both.
- **Exclude `src/components/bulk/` by full relative path** (`path.relative(REPO_ROOT, full) === path.join("src","components","bulk")`) rather than by folder name, so an unrelated directory called `bulk` anywhere else under `src/` is still scanned. Plan 38-19's cross-surface gate owns those files.
- **Added a public-surface assertion** (`React.ComponentProps<typeof CheckboxPrimitive.Root>`) beyond the plan's list. The consumer-safety test is only meaningful while the component takes no new prop; without this, a future prop could break behaviour-neutrality while every other assertion stayed green.
- **`group/checkbox` appended at the very end of the className string**, after `disabled:opacity-50`, so the diff is a pure suffix and no existing class moved.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The plan's and spec's consumer count of 8 is wrong; the real count is 10**

- **Found during:** Task 2 (consumer-safety enumeration)
- **Issue:** Both this plan's `<interfaces>` block and 38-UI-SPEC § Surface 1 state that eight modules import `Checkbox`, and Task 2's acceptance criteria asked for an exact-8 assertion. The real number on the phase-38 base commit is **10**. The two unlisted modules are `src/app/admin/fields/[entityType]/field-dialog.tsx` and `src/app/admin/fields/[entityType]/fields-list.tsx`, both introduced by `a108448 feat(44-08)`, and both importing with **single quotes** — a double-quote-only grep does not see them, which is the most likely origin of the stale census. Writing `toBe(8)` would have shipped a gate that was red on arrival.
- **Fix:** Asserted the verified count of 10, with the two additions and the single-quote cause documented in a comment on the constant, and re-verified the claim that actually matters: `grep -rn "indeterminate" src/` is 0, so all 10 (not just 8) are provably unable to reach the new branch. The spec's substantive conclusion is unaffected; only its arithmetic was.
- **Files modified:** `src/components/ui/checkbox-indeterminate.test.ts`
- **Verification:** The gate's own detector was forced to print its resolved list (by temporarily asserting 11) and returned exactly the 10 paths above, matching an independent `grep -rln "@/components/ui/checkbox" src/`. Restored to 10; gate green.
- **Committed in:** `befac0f` (Task 2 commit)

**2. [Rule 3 - Blocking] The worktree had no `node_modules`, so no verification command could run**

- **Found during:** Task 1 (before the first `npm run typecheck`)
- **Issue:** `git worktree` does not copy gitignored directories, so `typecheck`, `lint` and `vitest` all had nothing to resolve against.
- **Fix:** Symlinked the main checkout's `node_modules` into the worktree. `.gitignore` line 4 is `/node_modules`, so the symlink is ignored and `git status` stayed clean. No package was installed, added, or upgraded — `npm install` was never run, in line with the T-38-SC disposition.
- **Files modified:** none (untracked, ignored symlink only)
- **Verification:** `git status --short` clean after the symlink; the full suite subsequently ran green.
- **Committed in:** n/a (no tracked change)

---

**Total deviations:** 2 auto-fixed (1 incorrect documented fact, 1 blocking environment issue)
**Impact on plan:** No scope creep. Deviation 1 strengthened the gate relative to the plan's own instruction (it corrects a fact both the plan and the design spec got wrong) and is the single thing a reviewer of this plan most needs to know. Deviation 2 touched no tracked file.

## Issues Encountered

- The plan's Task 1 acceptance criteria rely on `grep -c`, which counts matching **lines**, not occurrences. The expected values (2 / 1 / 2) happen to be correct under line-counting because the import and the element sit on separate lines; noted so a future reader does not mistake the numbers for occurrence counts.
- The design spec's fix sketch omitted where in the Root's className `group/checkbox` should go. Appended at the end, per the plan's explicit "append it; do not reorder" instruction.

## Threat Flags

None. No new network endpoint, auth path, file access pattern, or schema change — the plan touched one presentational primitive and one test file. The three registered threats are all addressed: T-38-17 by the two-icon branch, T-38-18 by the (corrected) consumer census plus the public-surface assertion, T-38-19 by the two-direction negative proof.

## Known Stubs

None. Both files are complete: the branch renders and the gate asserts. The one deliberate deferral is that `src/components/bulk/` is excluded from the consumer walk because it does not exist yet — plan 38-19's cross-surface gate owns those files, and the exclusion is stated in a comment at the exclusion site.

## User Setup Required

None — no external service configuration, no environment variable, no dependency.

## Next Phase Readiness

- The primitive is ready for the header select-all in plans 38-07 onward: passing `checked={all || (some && "indeterminate")}` now produces three visually distinct states. `aria-checked="mixed"` came free from Radix and now agrees with what sighted users see.
- **For plan 38-19:** the cross-surface gate must cover `src/components/bulk/**`, which this gate deliberately skips.
- **For plan 38-20:** the browser pass still owes the actual pixel confirmation. This repo renders no client component in tests (no jsdom / happy-dom / testing library, and none was added), so a source gate is the strongest check available here and is weaker than a render. Confirm at http://localhost:3001 that a partial selection shows a dash, a full selection a check, and that the header checkbox on an empty table is visibly disabled.
- **For anyone re-touching `checkbox.tsx`:** it is vendored. Re-running `shadcn add checkbox` would overwrite this patch; the gate would catch it, and the correct response is to re-apply the branch, never to relax the gate.

## Self-Check: PASSED

- `src/components/ui/checkbox.tsx` — FOUND
- `src/components/ui/checkbox-indeterminate.test.ts` — FOUND
- `.planning/phases/38-bulk-operations/38-05-SUMMARY.md` — FOUND
- commit `c3ce7fc` — FOUND
- commit `befac0f` — FOUND

---
*Phase: 38-bulk-operations*
*Completed: 2026-08-17*
