---
phase: 41-workflow-operator-affordances
plan: 13
subsystem: ui
tags: [react, next-intl, shadcn, dialog, useTransition, sonner, source-scan, vitest]

# Dependency graph
requires:
  - phase: 41-workflow-operator-affordances
    provides: "41-02's isRunReplayable / buildReplayRunInput and its deliberate absence of a constant for the \"failed\" literal; 41-03's workflows.replay.* keys in all three locales; 41-10's DryRunBadge; 41-11's replayWorkflowRun server action"
provides:
  - "ReplayRunButton — the outline trigger, the consequential (not destructive) confirm dialog carrying replay.confirmBody in full, the in-button pending state, and router.push to the new run"
  - "the failed-only render site on the run detail page, written literally {run.status === \"failed\" && ( … )}"
  - "the reshaped G-6 gate: the control is ABSENT on non-failed runs, asserted verbatim with toBe"
  - "R-1 two-cluster wrapping header row and R-2 wrapping metadata row on runs/[runId]/page.tsx"
  - "the replay lineage line, and DryRunBadge rendered beside RunStatusBadge on the run detail page"
affects: [41-14, 41-15, 41-verify]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "consequential-confirm dialog: delete-workflow-dialog.tsx's tree MINUS its bg-destructive/10 tile and AlertTriangle, with variant=\"default\" on confirm"
    - "a visibility claim asserted through enclosingConditional + toBe when the repo has no DOM test environment"
    - "conditional() wrapper converting a source-scan helper throw into a failure message that names the implementation shapes it rejects"

key-files:
  created:
    - "src/app/workflows/[id]/runs/[runId]/components/replay-run-button.tsx"
    - "src/app/workflows/[id]/runs/[runId]/__tests__/replay-visibility.test.ts"
  modified:
    - "src/app/workflows/[id]/runs/[runId]/page.tsx"

key-decisions:
  - "Cluster A carries flex flex-wrap items-center gap-3, NOT the plan's literal flex items-center gap-3 — the latter is the exact string the R-1 negative forbids, and cluster A is three items on its own"
  - "expect.fail was not used (it appears nowhere in this repo); the throw is captured and asserted with expect(thrown, SHAPE(...)).toBeNull() instead"
  - "the lineage Link carries underline-offset-4 hover:underline — an affordance class, neither a size nor a colour class, so the plan's inherit-only rule holds"
  - "the server action's error string is not surfaced to the operator; it names an internal predicate and the next action is the same either way"

patterns-established:
  - "Consequential vs destructive confirm: same Dialog tree, no icon tile, variant=\"default\" confirm. The copy carries the weight; the chrome does not amplify it."
  - "Reshaping an unimplementable render-test gate onto enclosingConditional, with a wrapper that makes the helper's shape requirement legible in the failure message rather than opaque."

requirements-completed: [WFOPS-01]

# Metrics
duration: 34min
completed: 2026-08-22
---

# Phase 41 Plan 13: Replay Control on the Run Detail Page Summary

**A failed run's detail page gains an outline Replay trigger behind a consequential-confirm dialog that states every already-succeeded step will re-fire, navigating to the new run on success — plus the lineage line, the dry-run badge, and the two container fixes those four items force at 320px.**

## Performance

- **Duration:** 34 min
- **Started:** 2026-08-22T23:52:00Z
- **Completed:** 2026-08-23T00:26:00Z
- **Tasks:** 3
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- `ReplayRunButton` — a client component whose confirm dialog renders `replay.confirmBody` in full and unsplit, because that string is the only place an operator is told a replay re-sends the emails and repeats the CRM writes of the half of the run that already succeeded.
- The render site is literally `{run.status === "failed" && (` — **absent**, not disabled, on every other status, and gated `toBe`-verbatim so no `|| isAdmin` clause can be OR-ed in later (T-41-75).
- The reshaped G-6 gate: 10 assertions, RED at 7/10 before the page edit, GREEN at 10/10 after, with nothing loosened.
- R-1 and R-2 both wrap. The header row went from two items to four and the metadata row from two to three; at UI-SPEC's 241px budget the item a non-wrapping row would push off is the status badge the operator came to read.

## Task Commits

1. **Task 1: ReplayRunButton — trigger, consequential confirm, pending, navigate** — `a42479a` (feat)
2. **Task 2: The G-6 gate — the control is ABSENT, not disabled** — `444eb73` (test, RED)
3. **Task 3: The page — R-1, R-2, the badge, the lineage line, the failed-only render site** — `38a35bd` (feat, GREEN)

## Files Created/Modified

- `src/app/workflows/[id]/runs/[runId]/components/replay-run-button.tsx` — created. Outline `RotateCcw` trigger, plain `Dialog` confirm with `leading-tight` on the title and `variant="default"` on confirm, `useTransition` + `sonner`, `router.push` to the new run on success, dialog left open on failure.
- `src/app/workflows/[id]/runs/[runId]/__tests__/replay-visibility.test.ts` — created. 10 assertions over the stripped page source.
- `src/app/workflows/[id]/runs/[runId]/page.tsx` — modified. Four edits: R-1 restructure, R-2 `flex-wrap`, the lineage line, and `getTranslations("workflows")`. Six lines removed in total, all of them the two container `<div>`s and the re-indented title cluster.

## Task 2 RED counts — per assertion

`npx vitest run "src/app/workflows/[id]/runs/[runId]/__tests__/replay-visibility.test.ts"` before task 3 touched the page: **7 failed / 3 passed of 10.**

| # | Assertion | RED | Failure |
|---|-----------|-----|---------|
| 0 | anti-vacuity: the source is this page, read and stripped | PASS | asserts a pre-existing property — passing here is correct and is the point |
| 1 | G-6 first half: the conditional test is `toBe` the guard | **FAIL** | `<ReplayRunButton not found in the source`, surfaced through `conditional()`'s SHAPE message rather than as an opaque helper throw |
| 2 | G-6 second half: no `disabled` on the control | **FAIL** | failed at its anti-vacuity precondition `toContain("<ReplayRunButton")` (line 147). The `disabled` negative was never reached — correct: reached, it would have passed **vacuously** on a page with no control at all |
| 3 | the lineage line's test references `replayedFromRunId` | **FAIL** | `replay.lineage not found in the source` |
| 4 | V-41-1: lineage offset > R-2 row offset | **FAIL** | `expected -1 to be greater than -1` — both markers absent. This is exactly the `indexOf` vacuity trap the `> -1` preconditions exist for, and it fired on a real RED run, as `views-page-wiring.test.ts:161-174` records |
| 5 | DryRunBadge's test references `dryRun`, and sits after RunStatusBadge | **FAIL** | `<DryRunBadge not found in the source` |
| 6 | R-1 positive + negative | **FAIL** | failed at the positive (line 223). The negative was also false at that point — the old `className="flex items-center gap-3"` was still present |
| 7 | R-2 positive + negative | **FAIL** | failed at the positive (line 246). Negative also false |
| 8 | non-regression: failed-node panel, step list, changed-records | PASS | asserts pre-existing structure; passing before AND after is the whole point of a non-regression row |
| 9 | C-41-1: no palette utility | PASS | asserts an absence that was already true |

The three green rows are all rows that assert something true *before* the change. No row that asserts new work was green in RED.

## The exact string the G-6 `toBe` compares against

```
run.status === "failed"
```

Bound as `REPLAY_GUARD` in the gate. **Normalisation applied: `.trim()`, and nothing else.**
`enclosingConditional` returns `source.slice(brace + 1, arrow)` — everything between the opening `{`
and the `&& (` — so the raw extracted value from `{run.status === "failed" && (` carries exactly one
trailing space. It is trimmed; no whitespace is collapsed internally, no quotes are normalised, and
the comparison is `toBe` rather than `toContain` deliberately.

## The four read-only presentation components — confirmed untouched

`git diff --stat HEAD` against all four returns empty:

- `src/app/workflows/[id]/runs/[runId]/components/step-detail.tsx` — untouched
- `src/components/ui/json-viewer.tsx` — untouched
- `src/app/workflows/[id]/runs/[runId]/components/run-step-list.tsx` — untouched
- `src/app/workflows/[id]/runs/[runId]/components/run-changed-records.tsx` — untouched

`git diff --name-only src/components/ui/` is **empty** (G-7). No shadcn component added, nothing
installed. The `readRunChangedRecords` try/catch and its comment block at `page.tsx:107-130` are
byte-identical — the only removed lines in the whole diff are the two container `<div>`s and the four
re-indented lines of the title cluster.

## Decisions Made

- **The confirm dialog is styled consequential, not destructive**, and the copy is not softened to compensate. It copies `delete-workflow-dialog.tsx`'s tree but omits the `rounded-lg bg-destructive/10 p-2` tile and its `AlertTriangle`, and confirms with `variant="default"`. Nothing is deleted by a replay — the origin run is an immutable historical record and the replay is a new row — so `AlertDialog` and a destructive button would both misinform.
- **The pending text lives inside the confirm button**, replacing `confirmAction` rather than sitting beside it, so the button's accessible *name* changes and the state is announced rather than merely visible.
- **Failure leaves the dialog open.** Closing would leave the operator on the origin run with a toast and no dialog, having to re-open and re-read the consequence copy to retry.
- **The server action's error string is not surfaced.** Its two failure messages name an internal predicate (`Only failed runs can be replayed`) and the operator's next action is identical either way, so `replay.error` is shown instead.
- **`expect.fail` was avoided.** It appears nowhere in this repo; the throw is captured into a `thrown` variable and asserted `toBeNull()` with the SHAPE message attached, which is the repo-native form and keeps the diagnostic in the assertion message where a reader will see it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 2's R-1 negative and task 3's R-1 action contradicted each other**

- **Found during:** Task 3 (the page edit), anticipated while writing task 2's gate
- **Issue:** Task 2 requires the source **not** to contain `className="flex items-center gap-3"` ("the old non-wrapping header row"), and states why: *"an added wrapper that left the old row in place would satisfy the positives."* Task 3 then says cluster A is *"wrapped in its own `flex items-center gap-3` div"* — which re-introduces that exact string. Written literally, the gate is unsatisfiable by the implementation the same plan specifies.
- **Fix:** Cluster A is `<div className="flex flex-wrap items-center gap-3">`. This satisfies both halves honestly rather than by loosening either: the forbidden exact string is genuinely absent, and it is not a substring of the R-1 positive (`flex flex-wrap items-center justify-between gap-3`) so nothing is satisfied by accident. It is also the *correct* answer independent of the gate — cluster A is three items (`<h1>` at `text-2xl font-bold`, the status badge, the dashed test-run badge) and does not fit 241px unwrapped, so the inner cluster needs `flex-wrap` on its own merits.
- **Files modified:** `src/app/workflows/[id]/runs/[runId]/page.tsx`
- **Verification:** gate 10/10 green with no assertion edited; `git diff` confirms the old string is gone rather than relocated
- **Committed in:** `38a35bd` (Task 3 commit)

**2. [Rule 2 - Missing Critical] The lineage `Link` had no visible affordance**

- **Found during:** Task 3
- **Issue:** The plan says the lineage line adds "no size or colour class of its own" — correct, it must not out-weigh its two `text-muted-foreground` siblings. But rendered with *no* class at all, a `Link` inside a muted metadata row is visually identical to the two plain `<span>`s beside it: nothing tells the operator it is clickable, and the one navigation this feature adds is undiscoverable.
- **Fix:** `className="underline-offset-4 hover:underline"`. Neither a size nor a colour class, so the plan's inherit-only rule holds literally; it adds a hover affordance and nothing else.
- **Files modified:** `src/app/workflows/[id]/runs/[runId]/page.tsx`
- **Verification:** gate row 4 (tertiary placement) and the C-41-1 palette negative both green; typecheck and lint clean
- **Committed in:** `38a35bd` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking contradiction, 1 missing critical affordance)
**Impact on plan:** Neither changes the plan's shape or scope. Deviation 1 resolves an internal contradiction in the plan text in the direction both halves point at; deviation 2 adds one non-colour, non-size utility class. No scope creep, no gate loosened, no assertion removed.

## Verification

| Check | Result |
|-------|--------|
| `replay-visibility.test.ts` | **10/10 green** (RED was 7 failed / 3 passed) |
| `locale-parity.test.ts` | 22/22 green — no locale file or `REQUIRED_WORKFLOWS_KEYS` touched |
| `npm test` | **4199 passed / 32 skipped** (baseline 4189 + this plan's 10) · **RSC 8/8** |
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **0 errors / 123 warnings** (baseline 125 — went down, not up) |
| `git diff --name-only src/components/ui/` | **empty** (G-7) |
| four read-only presentation components | **unmodified** |
| `git diff --diff-filter=D` on every commit | **no deletions** |

## Issues Encountered

- **`npx tsx` is unusable in this environment** for ad-hoc verification — the shell wrapper rewrites it into `npm tsx` and it fails with `Missing script: "tsx"`. Worked around by scanning the component's code body with `tail -n +56 | grep` rather than importing `readStrippedSource` from a script. Recorded because the same detour will hit anyone trying to run a one-off TypeScript snippet here.
- The five hits for `AlertTriangle` / `bg-destructive/10` / `variant="destructive"` / `AlertDialog` / `closeLabel` in `replay-run-button.tsx` are **all in the file-header prose that explains why each is omitted.** The code body has none. This is the phase-39 defect class running in reverse, and it is precisely why every gate in this phase reads through `readStrippedSource`: a raw `grep` on this file would report five violations that do not exist.

## Notes for later plans in this phase

- **41-15's cross-file gate can key on the two R-1/R-2 class strings as written here.** Note the inner cluster string `className="flex flex-wrap items-center gap-3"` also exists on this page now (deviation 1). It is not a substring of the R-1 outer row string, so an exact-string assertion on either is unambiguous — but a `toContain("flex flex-wrap items-center gap")` style loose match would now hit both.
- **`viewport-320.spec.ts` still measures 7 routes and none under `/workflows`.** R-1 and R-2 are asserted here by class string only. Nothing in the suite measures this header at 320px, by UI-SPEC's explicit decision not to extend the matrix to a ReactFlow tree.
- The lineage line is one-directional by decision. There is no "replayed as …" back-link on the origin run, and adding one needs a reverse query plus a list because a chain can fan out.

## User Setup Required

None — nothing installed, no shadcn component added, no migration, no env var, no container restart.

## Next Phase Readiness

- WFOPS-01's operator half is complete and observable end to end: a failed run shows the control, the dialog states the consequence, and success lands the operator on the new run's own detail page.
- No blockers for 41-14 (the dry-run dialog) or 41-15 (the cross-file responsive gate). Both `DialogTitle`s this phase adds now carry `leading-tight`; 41-14 owns the second one.

## Self-Check: PASSED

Both created files exist on disk and are present in their commits; all three task commits are in
`git log`; the worktree is clean.

| Claim | Verified |
|-------|----------|
| `src/app/workflows/[id]/runs/[runId]/components/replay-run-button.tsx` | present in `a42479a` (+153) |
| `src/app/workflows/[id]/runs/[runId]/__tests__/replay-visibility.test.ts` | present in `444eb73` (+286) |
| `src/app/workflows/[id]/runs/[runId]/page.tsx` | modified in `38a35bd` (+73/−6) |
| commits `a42479a`, `444eb73`, `38a35bd` | all in `git log` |
| `git status --short` | clean |

---
*Phase: 41-workflow-operator-affordances*
*Completed: 2026-08-22*
