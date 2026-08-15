---
phase: 35-notes-record-timeline
fixed_at: 2026-08-16T00:55:00Z
review_path: .planning/phases/35-notes-record-timeline/35-REVIEW.md
iteration: 3
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 35: Code Review Fix Report — iteration 3

**Fixed at:** 2026-08-16T00:55:00Z
**Source review:** `.planning/phases/35-notes-record-timeline/35-REVIEW.md` (iteration-3 section)
**Iteration:** 3 — targeted pass outside the `--auto` loop

**Summary:**
- Findings in scope: 3 (WR-12, WR-13, WR-14)
- Fixed: 3
- Skipped: 0

**WR-15 was explicitly out of scope** and is untouched: the `CALL_SITES` list in the gate is
still hand-maintained, and the review's own note that it is complete today
(seven renderers, confirmed by grep) still holds. It carries into verification as documented
known state.

## Gates

| Gate | Result |
|------|--------|
| `npm run typecheck` | exit 0 |
| `npm run lint` | 0 errors, 125 warnings (byte-identical pre-existing set) |
| `npm test` (both vitest projects) | 1128 passed / 4 skipped, plus 8 rsc — was 1108 at iteration 2 |
| `npx next build` | exit 0; all five notes routes present in `routes-manifest.json` |
| `scripts/reconcile-notes.sql` | all 4 deltas 0, all 4 mismatched 0, `compared` 29,037 / 46,198 / 0 / 0 |
| Database baseline after all work | 75,235 notes / 75,235 `source='migration'` / 0 `source<>'migration'` / 0 soft-deleted / `deal_stage_history` 0 rows — unchanged |
| Environment hygiene | probe container, its image and its browser profile all removed; `pipelite`, `postgres`, `template0/1` only; no `gsd-reviewfix` branch, worktree list is just `master` |

`condition-evaluator.test.ts` did not flake. **Nothing was written to the live database at any
point in this pass** — see WR-12: the empirical work was done against a standalone probe app
with no database at all.

Work was done in an isolated git worktree on `gsd-reviewfix/35-*`, fast-forwarded onto
`master` on completion. `npx next build` was run inside a container because turbopack rejects
a worktree whose `node_modules` is a symlink out of the project root.

## Fixed Issues

### WR-12: the reset guard was armed too late — and the `revalidatePath` question, answered

**Files modified:** `src/app/deals/deal-dialog.tsx`, `src/app/organizations/organization-dialog.tsx`,
`src/app/people/person-dialog.tsx`, `src/app/activities/activity-dialog.tsx`,
`src/app/organizations/data-table.tsx`, `src/app/people/data-table.tsx`,
`src/app/__tests__/record-dialog-note-failure.test.ts`
**Commit:** `d4eb706`

**The review asked for the question to be settled rather than hedged. It is settled:
`revalidatePath` inside a create server action DOES refresh the client tree, and the race
the review described is real.** Measured, not reasoned.

Method: a standalone Next 16.1.6 probe app — same `next` and `react` as this repo, run in a
container, **no database** — reproducing the exact shape of `activity-dialog`. A server
component rebuilds an array prop on every render (mirroring `activities/page.tsx:194`); a
client component lists that array in an effect's dependency list and, when the effect runs,
clears a 314-character draft (mirroring the create-mode `reset`). A button awaits a
`createLike()` action that calls `revalidatePath` and returns, then awaits a second, slower
action (mirroring `addNote`).

```
seeded draft: 314 chars
57871  --- submit (createLike WITH revalidatePath, then a CLIENT-side wait)
57871  t0 before create        draft=314 chars
57911  t1 create returned      draft=314 chars
57918  EFFECT RAN -> reset(draft="")  serverToken CHANGED     <- 7 ms after the create
60411  t2 wait over            draft=0 chars
```

Seven milliseconds. The server component re-rendered (its token changed), the effect re-ran
because it was handed a fresh array, and the draft was destroyed — all while the code was
still in the window between "the record exists" and "we know about the note".

The control, identical but with the `revalidatePath` removed:

```
22597  t0 before create        draft=314 chars
22609  t1 create returned      draft=314 chars
25124  t2 note FAILED          draft=314 chars      serverToken UNCHANGED
```

No re-render, no effect, draft intact. So the refresh is caused by `revalidatePath` and by
nothing else. A third run showed the path argument is irrelevant: `revalidatePath("/somewhere-else")`
refreshed the current tree just the same (4 ms), which is why `revalidatePath("/organizations")`
refreshes an `/organizations?search=…&page=2` view too.

**One nuance worth recording, because it explains why the browser pass in iteration 2 saw the
draft survive.** When the second `await` is itself a server action, Next's action queue holds
the router state update behind it — in that run the effect fired 47 ms *after* the note
resolved, so the failure branch's late assignment happened to win:

```
79145  t1 create returned      draft=314 chars
81686  t2 note FAILED          draft=314 chars
81733  EFFECT RAN -> reset     serverToken CHANGED   <- after t2, not during
```

That ordering is an accident of Next's action queue, not a guarantee. The identical code with
a plain client-side wait in that window loses the draft in 7 ms. So the review's structural
claim is exactly right: the guard cannot be allowed to depend on which of two racing things
happens to land first.

**The fix**, in all four dialogs — the one line, moved earlier:

```ts
} else {
  const result = await createOrganization(record)
  if (!result.success) { toast.error(result.error); return }
  recordId = result.id
  // Arm the reset guard the instant the record exists, and not one await later.
  createdRecordIdRef.current = recordId
}
```

The failure branch's own assignment is gone, and its comment now says where the guard was
armed and why it is not armed there. The ref's lifecycle doc-comment and the effect's
bail-out comment were both rewritten: the effect now documents *two* refreshes it has to
absorb (the create action's own, and the failure branch's), where before it named only one.
Nothing else moves — `handleClose()` still clears the ref on the success path, so a completed
create still resets.

**The second half of the finding: `handleRecordSaved` on the two data tables.** The review
framed this as a dichotomy — either the refresh is real (race live) or it is not (the list
goes stale). The measurement resolves it the first way, so the list is **not** stale: the
create/update action's own `revalidatePath` re-renders the current tree a few milliseconds
after it resolves, before `handleRecordSaved` matters at all. What was wrong was the comment,
which claimed the callback "refreshes the list" while `refresh` is an optional prop that no
parent passes. Rather than adding a `router.refresh()` that would buy a second fetch of a tree
the action has already sent, the comment now states the measured truth and says why the
optional hook is kept. Both data tables, identically.

**Regression gate.** The `if (!noteSaved)` containment assertion was replaced with an
*ordering* one, which is what actually encodes the finding:

```ts
expect(armed).toBeLessThan(noteCall)   // createdRecordIdRef armed before `await addNote(`
```

Mutation-tested: moving the assignment back to the failure branch — the exact pre-fix shape —
fails with `expected 2950 to be less than 2073`. Restored, 58/58 green.

### WR-13: `blockAt` passed vacuously when its anchor disappeared

**Files modified:** `src/app/__tests__/record-dialog-note-failure.test.ts`
**Commit:** `ac5117d`

`blockAt` now checks the **anchor**, not the brace, because `expect(start).toBeGreaterThan(-1)`
never could: the brace it finds does exist. Every call site passes a label, so the failure
names the branch that vanished.

The review's own mutation, re-run both ways — deleting the whole `if (!open)` branch from
`organization-dialog.tsx`:

```
old blockAt   38 passed  (0 failed)   <- the vacuous pass the review demonstrated
new blockAt   37 passed, 1 FAILED
              AssertionError: if (!open) branch not found — blockAt would silently
              widen to the enclosing block: expected -1 to be greater than -1
```

And the symmetric case the review predicted but did not run, deleting the `if (organization)`
branch:

```
old blockAt   38 passed  (0 failed)
new blockAt   37 passed, 1 FAILED
              AssertionError: if (organization) branch not found — …
```

Both mutations reverted; the file re-verified clean.

### WR-14: the gate was blind to the closing idiom the CR-03 fix created

**Files modified:** `src/app/__tests__/record-dialog-note-failure.test.ts`
**Commit:** `7a7cc2d`

`CLOSES_THE_DIALOG` is rebuilt from an alternation list with the reasoning attached. It went
further than the review's suggested regex in one respect: **the argument is no longer
constrained to a literal `false`**. The review's own probe listed
`const next = false; setDialogOpen(next)` as MISSED, and its proposed regex still misses it.
Matching the *call* rather than the literal closes that indirection too, and costs nothing —
a callback that means "re-read your data" has no business touching the dialog's open state at
any value, and all seven current handler bodies are a bare `router.refresh()` / `refresh?.()`
/ `window.location.reload()`. The `set(?!Delete)` carve-out is preserved.

Covered now: `setXOpen(...)`, `setEditingX(...)`, `setSelectedDeal(...)`,
`handle*OpenChange(...)`, `onOpenChange(...)`, `handleClose(...)`, and the indirect form.

Mutation-tested with the review's own probe case — putting `handleDialogOpenChange(false)`
into `organizations/data-table.tsx`'s refresh callback:

```
old regex   38 passed  (0 failed)     <- blind to the idiom the fix introduced
new regex   57 passed, 1 FAILED
            never closes the dialog from the refresh callback
```

A **gate for the gate** was added alongside: eleven closing idioms the detector must catch
(including the three it used to miss) and five it must leave alone (including
`setDeleteDialogOpen(false)`). That is what makes the next blind spot fail here rather than
be found by a reviewer. Suite went 38 → 58 assertions.

## Notes for the developer

**Requires human confirmation.** The WR-12 change is behavioural, and its effect is only
visible in a browser under a failing `addNote`. The probe proves the *mechanism* (a
`revalidatePath` refresh lands ~7 ms after the create resolves and re-runs an effect that
depends on a rebuilt prop); it does not re-run the iteration-2 browser pass against the real
dialogs. That pass was done at iteration 2 and passed for a reason that this change makes
robust rather than accidental, so a re-run is a confirmation and not a discovery — but it is
the honest thing to do before the phase closes.

**Not done, deliberately:** WR-15 (out of scope by instruction) and all remaining Info
findings — IN-02, IN-03, IN-06, IN-07, IN-08, IN-09, IN-10. IN-04 remains a recorded decision
in 35-CONTEXT.

---

_Fixed: 2026-08-16T00:55:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 3_

---

# Phase 35: Code Review Fix Report — iteration 2

**Fixed at:** 2026-08-15T23:10:00Z
**Source review:** `.planning/phases/35-notes-record-timeline/35-REVIEW.md` (iteration-2 section)
**Iteration:** 2

**Summary:**
- Findings in scope: 3 (CR-03 blocker, WR-10, WR-11)
- Fixed: 3
- Skipped: 0

The iteration-1 report is preserved verbatim at the bottom of this file.

## Gates

| Gate | Result |
|------|--------|
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 — 0 errors, 125 warnings (all pre-existing, byte-identical set) |
| `npm test` (both vitest projects) | 1108 passed / 4 skipped, plus 8 rsc — was 1069 at iteration 1 |
| `npx next build` | exit 0; all five notes routes present in `routes-manifest.json` |
| Browser pass (headless Chromium, CDP) | 5/5 on the polled run; see CR-03 |
| `scripts/reconcile-notes.sql` | all 4 deltas 0, all 4 mismatched 0, compared 29,037 / 46,198 / 0 / 0 |
| Database baseline after all probes | 75,235 notes / 75,235 `source='migration'` / 0 `source<>'migration'` / 0 soft-deleted / `deal_stage_history` 0 rows — unchanged |

`src/lib/execution/condition-evaluator.test.ts` did not flake in the full run.

Work was done in an isolated git worktree on `gsd-reviewfix/35-*`, fast-forwarded onto
`master` on completion.

## Fixed Issues

### CR-03 (blocker): every call site's `onSuccess` closed the dialog, so the typed note was still destroyed

**Files modified:** `src/app/deals/deal-dialog.tsx`, `src/app/organizations/organization-dialog.tsx`,
`src/app/people/person-dialog.tsx`, `src/app/activities/activity-dialog.tsx`,
`src/app/deals/kanban-board.tsx`, `src/app/deals/deal-card.tsx`,
`src/app/organizations/data-table.tsx`, `src/app/organizations/[id]/organization-detail-client.tsx`,
`src/app/people/data-table.tsx`, `src/app/people/[id]/person-detail-client.tsx`,
`src/app/activities/activities-client.tsx`, `src/app/__tests__/record-dialog-note-failure.test.ts` (new)
**Commit:** `0a653c2`

**Not the review's suggested shape, and why.** The review proposed
`onSuccess: (options?: { keepOpen?: boolean }) => void` with a guard at each call site.
That works, but it leaves the trap intact — the callback still sometimes closes, so the
next reader still has to remember the flag, and forgetting it reproduces exactly this
finding. Instead the contract was split so there is no flag to forget:

- `onSuccess` was **renamed** to `onRecordSaved` and documented as REFRESH ONLY, MUST NEVER
  CLOSE. The rename is the enforcement mechanism: every one of the seven call sites became
  a type error and had to be revisited, including the three edit-only ones that were also
  closing from the callback and would otherwise have preserved the trap.
- Closing is now exclusively the dialog's own decision, taken through `onOpenChange(false)`
  from `handleClose()`. The work each call site used to do in the success callback
  (`setDialogOpen(false)`, `setEditingOrg(null)`, `setSelectedDeal(null)`) moved into its
  `onOpenChange` handler, so it still happens on every close, cancel included.

**`createdPendingNoteId` -> `createdRecordIdRef`, and its reset semantics.** The review is
right that this state was dead and is now live for the first time, so its lifecycle
matters. Two changes:

1. It is a **ref, not state**. As state it would have to be a dependency of the
   reset-on-open effect, so setting it would re-run that effect and `reset()` away the very
   draft it exists to protect.
2. The effect was restructured into three explicit branches, and the middle one is the new
   guard:
   - `!open` -> clear the ref. Covers a parent flipping `open` directly instead of going
     through `handleClose`.
   - edit target present -> clear the ref, then reset to the record's values. A create's
     half-finished id can never be inherited by an edit.
   - otherwise -> **`if (createdRecordIdRef.current) return`** before the create-mode
     `reset`. This is what makes the draft survive the parent re-render that the failure's
     own refresh triggers.

That last guard is load-bearing and was not in the review's shape.
`activity-dialog`'s reset effect depends on the `activityTypes` **array** prop, whose
identity changes on every `router.refresh()`. Holding the dialog open would not have been
enough on that surface: the refresh fired by the failure branch would have re-run the
effect and wiped the textarea anyway. Verified in the browser (below).

Reading is confined to the create path — `isEditMode` short-circuits above it — so a
create can never silently become an update of an unrelated record, and a reopen always
starts clean.

**BROWSER-VERIFIED, which is what iteration 1 was missing.** Driven through a real headless
Chromium over CDP against a full-build container (port 3002) with one temporary sabotage:
`addNote` refused any content not starting with `OK:`. It ran against
`pipelite_cr03`, a `pg_dump`/restore copy of the live database, so **the real database was
never written to by this test**. Environment torn down afterwards (container, image,
throwaway database, browser profile all removed).

Organizations dialog, polled rather than sampled — 5/5:

```
PASS  the note-failure toast is shown
      ["The record was saved, but your note wasn't. The text is still in the box — try again."]
PASS  no success toast accompanies it
PASS  dialog still open with the draft intact  — 269 chars
PASS  success toast on the retry  — ["Organization created!", ...]
PASS  dialog closed after the successful retry
```

Activities dialog, the hard case (its refresh callback runs
`startTransition(router.refresh())` and its effect depends on an array prop):

```
PASS  dialog is STILL OPEN after the failed note
PASS  the draft SURVIVED the parent refresh that the failure triggered  — 314 chars intact
PASS  the title survived too
```

And the retry semantics, read straight out of the database after each run:

```
organizations named 'CR03 Verification Org …'   1      note rows  1  (source=user, 487 chars)
activities  titled 'CR03 Activity …'            1      note rows  1  (source=user, 318 chars)
organizations named 'CR03 Org Round3 …'         1      note rows  1
total notes with source <> 'migration'          3      — one per run, no duplicates
legacy `notes` column on all three              NULL   — still dormant
```

So: the dialog stays open, the paste is still in the textarea, the retry updates rather
than creating a second record, and the toast copy — *"The text is still in the box"* — is
now true.

**Regression gate.** `src/app/__tests__/record-dialog-note-failure.test.ts`, 38 assertions.
This repo has no DOM test environment (both vitest projects are `environment: 'node'`, and
neither jsdom nor @testing-library/react is installed — adding one was out of bounds), so
the gate asserts source shape, the same approach the notes-collection suite uses for the
route bodies. It checks, per dialog: the failure branch does not call `handleClose` or
`reset`, does call the refresh callback, and returns; the ref is set there and read on the
create path; the id is a ref and not state; the effect carries the bail-out guard *before*
the create reset; the ref is cleared on all three paths. And per call site: the refresh
handler's body (inline arrow or named const, brace-balanced extraction) contains nothing
that closes the dialog.

The gate was mutation-tested. Re-adding `setCreateDialogOpen(false)` to the kanban handler
and deleting the effect guard produced exactly the two expected failures; both were
restored and the file re-verified clean.

### WR-10: `reconcile-notes.sql` part 2 could pass vacuously

**Files modified:** `scripts/reconcile-notes.sql`
**Commit:** `cdbf85a`

`count(*) AS compared` added to all four branches. The file's instruction changed from
"every row must show mismatched = 0" to that **and** a `compared` explainable by the number
of migrated notes since edited or deleted, in three places: the WHAT THIS PROVES header,
the part-2 header, and a new READ `compared` BEFORE YOU BELIEVE `mismatched` paragraph
that names the failure mode explicitly.

MEASURED BASELINE now records both parts separately:

```
Part 1  legacy_nonempty/migrated/delta   deal 0/0/0 · organization 29,037/29,037/0 · person 0/0/0 · activity 46,198/46,198/0
Part 2  compared/mismatched              organization 29,037/0 · activity 46,198/0 · deal 0/0 · person 0/0
```

Also written down: `deal 0` and `person 0` are correct and expected rather than a broken
join — neither table held a non-empty legacy `notes` value at migration time — so only the
two non-zero branches carry proof and only they can decay.

Run against the live database, the numbers come back exactly as recorded above.

The vacuity itself was demonstrated rather than asserted. Inside `BEGIN … ROLLBACK`,
soft-deleting all 29,037 organization migrated notes:

```
 entity_type  | compared | mismatched
--------------+----------+------------
 organization |        0 |          0
```

`mismatched = 0` over an empty sample — the exact false pass, now visible in `compared`.
After `ROLLBACK`: 75,235 notes, 0 soft-deleted. Nothing was written.

### WR-11: a zod-valid cursor could still make Postgres throw

**Files modified:** `src/lib/timeline/cursor.ts`, `src/lib/timeline/cursor.test.ts`
**Commit:** `2cd2cf8`

`cursorPayloadSchema.t` now carries a `.refine` gating the instant to
`[1970-01-01T00:00:00.000000Z, 9999-12-31T23:59:59.999999Z]`, compared lexicographically —
sound for the same reason the cursor sorts that way at all, since `to_char(…'.US"Z"')` is
fixed width. The bounds are named constants with the reasoning attached, and the T-35-20
paragraph in the module header was extended to say that the guarantee covers the pipeline
and not just `decodeCursor`, so anything Postgres cannot represent has to be rejected in
this module or the error merely moves from decode time to query time.

Both ends were measured rather than assumed, against the live database:

```
'0000-01-01T00:00:00Z'::text::timestamp        ERROR: date/time field value out of range
'0001-01-01T00:00:00Z'::text::timestamp        0001-01-01 00:00:00
'1970-01-01T00:00:00Z'::text::timestamp        1970-01-01 00:00:00
'9999-12-31T23:59:59.999999Z'::text::timestamp 9999-12-31 23:59:59.999999
```

Postgres's own floor is lower than 1970; 1970 is the chosen bound because nothing this
application writes predates the epoch, so a cursor claiming to is hostile rather than old.

**A scope check the review did not make, worth recording:** the year is the *only* hole.
zod 4's `z.iso.datetime()` was probed directly and it already rejects `2026-13-01`,
`2026-12-32`, `2026-04-31`, `2026-02-31` and even `2026-02-29` in a non-leap year — all of
which Postgres would also have rejected. Only the four-digit year magnitude was unchecked,
so the range gate closes the class rather than one instance of it.

Test added: `rejects an instant outside the range Postgres can represent (WR-11)` —
`0000-01-01`, `0000-12-31`, `0001-01-01` and `1969-12-31` all decode to `null`; both
spellings of the lower boundary (`1970-01-01T00:00:00Z` and `…T00:00:00.000000Z`) and the
upper boundary decode through unchanged, which is what pins the `'Z'` sorts after `'.'`
reasoning. Mutation-tested: reverting the refine fails exactly this test and nothing else.

## Notes for the developer

**Contract change worth knowing about.** The four record dialogs no longer accept
`onSuccess`. They accept `onRecordSaved`, and it must not close the dialog. This is a
compile error at any call site that missed it, and `src/app/__tests__/record-dialog-note-failure.test.ts`
gates the behaviour a compiler cannot see. Any new call site has to be added to the
`CALL_SITES` list in that file.

**One behaviour change beyond the finding.** Cancelling an edit dialog now also clears the
parent's `editingOrg` / `editingPerson` / `editingActivity` / `selectedDeal` state, because
that clearing moved from the success callback into `onOpenChange`. Previously it happened
only on a successful save. The dialogs are re-pointed on every open, so this is a cleanup
rather than a visible change, but it is a real diff in the close path.

**Still open from iteration 1**, unchanged and acknowledged out of scope: IN-02, IN-03,
IN-06, IN-07. IN-04 remains a recorded decision in 35-CONTEXT and was not touched.

---

_Fixed: 2026-08-15T23:10:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_

---

# Iteration 1 report (verbatim)

## Phase 35: Code Review Fix Report — iteration 1

**Fixed at:** 2026-08-15T22:25:00Z
**Source review:** `.planning/phases/35-notes-record-timeline/35-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope (Critical + Warning): 11
- Fixed: 11
- Skipped: 0

Info findings were out of scope. IN-01 and IN-05 were subsumed by CR-01 and WR-06
respectively; IN-02, IN-03, IN-06 and IN-07 were not touched. IN-04 is one of the phase's
recorded decisions per the fix brief and was deliberately left alone.

## Gates

| Gate | Result |
|------|--------|
| `npm run typecheck` | exit 0 |
| `npm run lint` | 0 errors, 125 warnings (all pre-existing) |
| `npm test` (both vitest projects) | 1069 passed / 4 skipped, plus 8 rsc — was 1017 at baseline |
| `npx next build` | exit 0; all five notes routes registered as dynamic handlers |
| `scripts/reconcile-notes.sql` | all four deltas 0, all four mismatch counts 0 |
| Database baseline | 75,235 notes, all `source='migration'`, 0 edited, 0 soft-deleted, `deal_stage_history` 0 rows |

Work was done in an isolated git worktree on `gsd-reviewfix/35-*`, fast-forwarded onto
`master` on completion.

## Fixed Issues

### CR-01: Hydration reads omit `deleted_at IS NULL`

**Files modified:** `src/lib/timeline/sources.ts`, `src/lib/timeline/assemble.ts`,
`src/lib/timeline/assemble.test.ts`
**Commit:** `fe21ddc`

Added the explicit predicate to BOTH `notesSource.hydrate` and `activitiesSource.hydrate`.
`stageChangeSource.hydrate` was left alone — `deal_stage_history` has no `deleted_at`
column, as its branch already documents.

Also rewrote the `assemble.ts:147` comment, which claimed the post-hydration
`.filter(entry => entry !== undefined)` was the soft-delete control. It is not: it only
drops what `hydrate` declined to return, and `hydrate` always returned everything. The
comment now states that the filter is what makes the hydrate-side predicate *visible*, and
that removing the predicate re-opens the hole with nothing there to catch it.

Two regression tests capture every hydration `where` and assert the rendered predicate
carries `"deleted_at" is null`, for notes and for activities.

### CR-02: Create dialogs destroy the user's typed note

**Files modified:** `src/app/deals/deal-dialog.tsx`, `src/app/organizations/organization-dialog.tsx`,
`src/app/people/person-dialog.tsx`, `src/app/activities/activity-dialog.tsx`,
`src/messages/{en-US,es-ES,pt-BR}.json`, `src/messages/locale-parity.test.ts`
**Commit:** `1b03c3e`

On a failed `addNote` the dialog now stays open, keeps the draft, does not fire
`toast.success`, and still calls `onSuccess()` because the record itself did land.

**Beyond the review's suggested fix:** the review's minimal patch (`return` without
`handleClose()`) introduces a duplicate-record bug — the dialog is still in create mode, so
the next submit calls `createDeal` again. Each dialog therefore also remembers the id of
the record it already created, and a retry `update`s that record instead of `create`ing a
second one. That additionally preserves any field the user changed while the dialog stayed
open. The id is cleared on close and on every fresh open.

New string `notes.error.recordCreatedNoteFailed` in all three locales, added to the
`REQUIRED_NOTE_KEYS` list so the parity gate covers it.

### WR-02 + WR-03: Cursor truncated to milliseconds; `bindInstant` TZ-dependent

**Files modified:** `src/lib/timeline/types.ts`, `src/lib/timeline/cursor.ts`,
`src/lib/timeline/sources.ts`, `src/lib/timeline/assemble.ts`, plus both test files
**Commit:** `50314f0`

Took the review's preferred direction — the JS `Date` is gone from the round trip entirely,
which resolves WR-03 as a side effect. Each branch emits
`to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS occurred_at_key`; `TimelineCursor`
carries that text; the predicate casts it back. The comparison still binds against the
`timestamp` column (not against `to_char` on both sides), so `notes_live_idx` is still used
— verified with `EXPLAIN`, the row comparison is pushed down to an `Index Cond`.

**A second defect surfaced while verifying this that the review did not identify.** Even
with full precision carried end to end, `${instant}::timestamp` still truncated. A bare
`::timestamp` lets Postgres resolve the otherwise-unspecified parameter to OID 1114, and
postgres.js then re-serializes the value for that OID with
`(x instanceof Date ? x : new Date(x)).toISOString()` (`node_modules/postgres/src/types.js`,
`types.date.serialize`) — the driver rebuilding a `Date` from our string and truncating the
microseconds back off on the wire. Measured against the live database:

```
SELECT $1::text            -> 2026-08-15T21:33:08.478005Z   (intact)
SELECT $1::timestamp::text -> 2026-08-15 21:33:08.478       (driver truncated it)
SELECT $1::text::timestamp -> 2026-08-15 21:33:08.478005    (intact)
```

The bind is therefore `${instant}::text::timestamp`. `::text` pins the parameter to OID 25,
whose serializer is `'' + x`, and the text→timestamp cast happens server-side. This is
documented at length in `bindInstant` and pinned by a test, because it is invisible from the
source and a future "simplification" back to `::timestamp` silently reintroduces the bug.

**Regression tests:**
- `cursor.test.ts` — a microsecond instant survives encode → decode byte for byte, and is
  explicitly asserted not to equal its millisecond-truncated form.
- `assemble.test.ts` — the cursor is decoded from the wire and bound at microsecond
  precision on all three branches; `nextCursor` is built from `occurred_at_key` and not from
  the driver's millisecond `Date`; every branch renders `to_char` with `.US`; the bind is
  `::text::timestamp` on all three branches and nowhere binds a bare `::timestamp`.

**Live verification** (inside a rolled-back transaction, DB left untouched): 25 notes one
microsecond apart inside a single millisecond page to **25/25 reachable** with this cursor
and **21/25** with the truncating one — 4 entries permanently unreachable, exactly the
failure filed. The 117-entry live deal timeline pages to 117 distinct entries, 0 duplicates.

### WR-01: A timeline/DB failure takes down the record detail page

**Files modified:** `src/components/timeline/record-timeline.tsx`, three locale files,
`src/messages/locale-parity.test.ts`
**Commit:** `b6600c8`

The reads are wrapped; on a throw the card renders with an inline
`notes.error.timelineUnavailable` body and the error is logged server-side in full. Chose
the degraded card over `return null` so the user can see that a section failed rather than
silently losing it.

### WR-04 + WR-07: Both note UPDATEs lack a `deleted_at` guard

**Files modified:** `src/lib/mutations/notes.ts`, `src/lib/mutations/notes.test.ts`
**Commit:** `79532f8`

`updateNoteMutation` is guarded and now returns `"Note not found"` on an empty `returning()`
— the same string as a missing note, so neither is an existence oracle. `softDeleteNoteMutation`
is guarded and idempotent, and losing the race still reports success because the caller's
intent is satisfied either way. The same unchecked-index shape in `createNoteMutation` is
guarded too.

Did **not** enable `noUncheckedIndexedAccess` as the review suggests — that is a repo-wide
compiler change well outside a phase-35 review fix. Flagged below.

### WR-05: v1 note routes answer a lost race with 500

**Files modified:** `src/app/api/v1/notes/[noteId]/route.ts`, its test
**Commit:** `f4414ea`

Both handlers map `"Note not found"` to `Problems.notFound("Note")` before the generic 500,
and no longer log a routine concurrent delete as a route failure. A genuine mutation failure
still 500s and still logs.

### WR-06: `notes.error.notPermitted` translated, parity-gated and never shown

**Files modified:** `src/lib/notes/errors.ts` (new), `src/app/notes/actions.ts`, its test,
`src/components/timeline/note-entry.tsx`, `src/components/timeline/delete-note-dialog.tsx`
**Commit:** `0b16e20`

The actions return stable codes — `not_authenticated` / `not_authorized` / `not_found` /
`failed` — and the two UI call sites branch on `not_authorized` to render
`error.notPermitted`. The codes live in a separate module because `actions.ts` carries
`"use server"` and may export nothing but async functions.

This also removes the untranslated English prose the actions were returning into a fully
localized surface, which the review filed separately as IN-05.

### WR-08: Four nested notes routes are ~140 lines of near-identical duplication

**Files modified:** `src/lib/api/notes-collection.ts` (new),
`src/lib/api/__tests__/notes-collection.test.ts` (new), all four
`src/app/api/v1/*/[id]/notes/route.ts`
**Commit:** `1f6789f`

Each route is now a 17-line adapter and owns exactly one security-relevant value: its
`entityType` literal, which reaches a query predicate and is never taken from the request.
`export const { GET, POST } = ...` is already the repo's idiom for factory-built handlers
(`src/app/api/auth/[...nextauth]/route.ts`).

These routes had **no test coverage at all**, which is what made the duplication dangerous
rather than merely verbose. The new suite drives the REAL exported handlers of all four
route modules through one table-driven loop and asserts per entity type: the notes read
carries `deleted_at IS NULL`; it is scoped to that route's own `entityType`; a
missing/soft-deleted parent 404s before any note is read; POST attributes to the API key's
user and never to a body-supplied `authorId`; the parent race remaps to 404. Plus a
structural gate that no route may grow a private copy of the body.

Confirmed with a full `npx next build`: all five notes routes register as dynamic handlers.

### WR-09: `reconcile-notes.sql` part 2 permanently false-fails after any edit

**Files modified:** `scripts/reconcile-notes.sql`
**Commit:** `42f3126`

Part 2 now joins only rows still in their as-migrated state
(`updated_at = created_at AND deleted_at IS NULL`). Part 1 is untouched, and the header now
says explicitly that the no-carve-out rule (D-18) is a part-1 rule so the two are not
confused. The MEASURED BASELINE comment records the added predicate.

Verified against the live database: all four deltas and all four mismatch counts still 0.
Verified in a rolled-back transaction that editing one migrated note takes the old query to
`mismatched = 1` and leaves the new one at 0.

## Notes for the developer

**Requires human confirmation (behavioural, not just syntactic):**

1. **CR-02's retry semantics.** The retry path calls `updateX(recordId, payload)` rather
   than `createX(payload)`. This is a deliberate departure from the review's suggested
   patch, taken to avoid a duplicate-record bug. Worth a browser pass: create a record with
   a note, force the note to fail, confirm the dialog stays open with the text intact, then
   submit again and confirm exactly one record exists with one note.

2. **WR-06's code change is a contract change.** `editNote` / `deleteNote` / `addNote` /
   `loadMoreTimeline` now return codes rather than English prose. No caller rendered the old
   strings, and the full suite passes, but anything added later must map codes rather than
   display them.

**Deliberately not done:**

- `noUncheckedIndexedAccess` (suggested under WR-04) — a repo-wide compiler flag change,
  out of scope for a phase-35 review fix. Worth its own task; the two instances the review
  found are now guarded by hand.
- All Info findings except IN-01 and IN-05, which fell out of CR-01 and WR-06.

---

_Fixed: 2026-08-15T22:25:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
