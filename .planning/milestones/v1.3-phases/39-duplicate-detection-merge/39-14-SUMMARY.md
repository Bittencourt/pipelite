---
phase: 39-duplicate-detection-merge
plan: 14
subsystem: frontend
tags: [dedup, create-time-warning, server-actions, next-intl, react-hook-form, source-scan-gate, vitest]

# Dependency graph
requires:
  - phase: 39-08
    provides: "`findCertainMatches` and the `CertainMatch` shape — the server read this plan's UI renders, already capped at W-8's five and already unable to throw"
  - phase: 39-04
    provides: "the `dedup.warning.*` (4) and `dedup.reason.*` (4) message keys in all three locales, plus the `REQUIRED_DEDUP_KEYS` exact-set contract in `locale-parity.test.ts`"
  - phase: 39-01
    provides: "`CREATE_TIME_MATCH_LIMIT`, `DedupReason`, `MergeableEntityType`"
provides:
  - "`CreateOrganizationResult` / `CreatePersonResult` — the three-member create result, the two failure members deliberately disjoint"
  - "`CreateRecordOptions` — the `confirmDuplicate` flag, on the ACTION's parameter and never in a Zod schema"
  - "`DuplicateWarning` — the in-dialog advisory, 39-UI-SPEC Surface 1 W-1/W-3/W-6/W-7/W-8"
  - "the create-time warning wired into both record create dialogs, with W-2/W-4/W-9/W-10 held by source gates"
affects: [39-16, the importer's flagged-rows report, any future edit-time duplicate check]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "a server action returning THREE members, with two disjoint failure members instead of one member carrying two optional fields"
    - "React's adjust-state-on-prop-change (`setState` during render, keyed on a composed session string) used deliberately INSTEAD of a `useEffect` that calls `setState`"
    - "a `register()` wrapper that chains react-hook-form's own `onChange` and then clears derived state, so no effect is needed to watch the form"
    - "a frozen `Record<ClosedUnion, string>` message-key map, because next-intl messages are untyped in this repo and a runtime missing-key error would land in front of a user"
    - "per-branch source gates: a brace-matched block extracted by marker and asserted in isolation, so 'the duplicates branch does not close the dialog' cannot be satisfied by the file as a whole"

key-files:
  created:
    - src/components/dedup/duplicate-warning.tsx
    - src/components/dedup/__tests__/duplicate-warning-wiring.test.ts
    - src/app/organizations/actions.test.ts
    - src/app/people/actions.test.ts
  modified:
    - src/app/organizations/actions.ts
    - src/app/people/actions.ts
    - src/app/organizations/organization-dialog.tsx
    - src/app/people/person-dialog.tsx

key-decisions:
  - "the two failure members are disjoint (`{error}` XOR `{duplicates}`), pinned by a compile-time type test, because a single optional-field member lets a caller narrow on `success === false`, read `result.error`, get undefined and toast nothing for what is actually an advisory"
  - "`confirmDuplicate` is the ACTION's second parameter, never a field of the validated payload — Zod strips unknown keys silently and the flag would become a permanent no-op"
  - "the advisory is cleared by React's adjust-state-on-prop-change pattern plus the compared field's own change handler; ZERO new `useEffect` calls, because `react-hooks/set-state-in-effect` is an ERROR here and three Phase 38 plans hit it on code their spec had specified verbatim"
  - "`REASON_MESSAGE_KEY` is a frozen `Record<DedupReason, string>` rather than a bare `t(match.reason)`: next-intl messages are untyped in this repo, so a fifth reason would be a runtime missing-key error in front of a user instead of a compile error"
  - "the new-tab behaviour is announced through an `sr-only` span INSIDE the link, not an `aria-label`: an aria-label would REPLACE the accessible name and a screen-reader user would hear 'Open in a new tab' with no idea which record"
  - "`tRoot = useTranslations()` with the fully-qualified `dedup.warning.createAnyway` path in both dialogs, so the W-6 gate's anti-vacuity half has a literal to read"
  - "the duplicates branch marker `if (\"duplicates\" in result)` is written identically in both dialogs so one source gate can extract the branch from either file by the same marker"
  - "a production build was run as verification, not for deployment: it is the only check that proves the type-only `CertainMatch` import erases and does not drag `@/db` into a browser bundle"

patterns-established:
  - "Predicted intermediate typecheck errors: the count, the file, the error code and the message are quoted in the commit that introduces them and in the commit that resolves them, rather than suppressed with a cast"
  - "Anti-vacuity pairing: every negative source assertion is accompanied by a positive one that fails if the subject it constrains disappears"
  - "Gate-literal hygiene: when an acceptance criterion is a raw `grep -c … = 1`, the attribute is spelled exactly once in the file and the surrounding comment describes it in prose instead of quoting it"

requirements-completed: [DEDUP-01]

# Metrics
duration: 32min
completed: 2026-08-19
---

# Phase 39 Plan 14: Create-Time Duplicate Warning Summary

**Creating an organization or person that matches an existing record now warns before the record is saved — server-side on submit, inline inside the open dialog, with each match named, reasoned and linked to a new tab, and overridable in one more click without retyping anything.**

## Performance

- **Duration:** 32 min
- **Started:** 2026-08-19T13:29:00Z
- **Completed:** 2026-08-19T14:01:14Z
- **Tasks:** 3 (task 1 TDD, RED → GREEN)
- **Files:** 4 created, 4 modified

## Accomplishments

- **Both create actions can now report duplicates without creating anything.** `createOrganization`
  and `createPerson` gained an optional `options?: { confirmDuplicate?: boolean }` and a third
  result member. The lookup sits between the `auth()` guard and `runWithActor`, so an
  unauthenticated call performs no lookup and establishes no actor.
- **The check is provably skipped on the confirmed second submit.** Without that, the warning would
  re-appear on every attempt and "advisory, never blocking" would be false in practice. Asserted by
  `expect(mockFindCertainMatches).not.toHaveBeenCalled()`, and proven by a RUN mutation.
- **A failing duplicate check can never fail a create** (T-39-36). `findCertainMatches` already
  swallows its own query errors; `certainMatchesOrNone` catches what it cannot, logs, and falls
  through to the insert.
- **`DuplicateWarning`** renders the advisory as `Alert variant="default"` — never `destructive` —
  with one stacked, three-line block per match and no controls of its own.
- **Both dialogs keep the draft.** The duplicates branch stores the matches and returns: no close,
  no `reset()`, and `createdRecordIdRef` left null. Gated per-branch rather than per-file.
- **35 new tests** (19 action + 16 wiring), full suite **2453 passed | 21 skipped** plus 8 in the
  rsc project, `npm run typecheck` 0 errors, `npm run lint` 0 errors.
- **Five negative proofs RUN and recorded**, as the plan's success criteria require.

## Task Commits

1. **Task 1: The create actions gain a third result member** (TDD)
   - `5e5fcf9` (test) — RED: 19 cases, 6 runtime failures and 6 typecheck errors, all of them the
     feature's absence
   - `2ee3d95` (feat) — GREEN: 19/19 pass, and the two predicted dialog typecheck errors open
2. **Task 2: The DuplicateWarning component**
   - `e13e247` (feat) — the advisory component, all grep gates satisfied
3. **Task 3: Wire both create dialogs, and gate the contract**
   - `eab41c2` (feat) — both dialogs wired, typecheck back to 0, 16 source gates added

No REFACTOR commit: nothing needed cleanup after going green.

**TDD gate sequence verified in `git log`:** `test(39-14)` at `5e5fcf9` precedes `feat(39-14)` at
`2ee3d95`.

## Files Created/Modified

**Created**

- `src/components/dedup/duplicate-warning.tsx` (6.8K) — `DuplicateWarning`, plus the frozen
  `REASON_MESSAGE_KEY` and `DETAIL_PATH` maps, both `Record<ClosedUnion, string>` so a new union
  member is a compile error here.
- `src/components/dedup/__tests__/duplicate-warning-wiring.test.ts` (8.6K) — 16 gates over both
  dialogs and the component. Local `blockAfter` (string-aware brace matching) and `occurrences`
  helpers on top of the shared `readStrippedSource` / `callArguments`.
- `src/app/organizations/actions.test.ts` (10.4K) — 9 cases.
- `src/app/people/actions.test.ts` (8.8K) — 10 cases (the extra one covers the second
  `revalidatePath` when the draft names an organization).

**Modified**

- `src/app/organizations/actions.ts` — `CreateOrganizationResult`, `CreateRecordOptions`,
  `certainMatchesOrNone`, and the gate inside `createOrganization`.
- `src/app/people/actions.ts` — the twin.
- `src/app/organizations/organization-dialog.tsx` (+~105 lines, 6 removed) — `duplicates` state,
  the session-key adjust pattern, `clearDuplicateWarning`, `registerComparedField`, the duplicates
  branch, the `<DuplicateWarning>` render and the relabelled submit.
- `src/app/people/person-dialog.tsx` (+~104 lines, 7 removed) — the twin, with four compared fields
  instead of two.

## Decisions Made

**1. The two failure members are disjoint, and a compile-time test keeps them that way.**
`{ success: false; error: string }` and `{ success: false; duplicates: CertainMatch[] }` are separate
union members. The tempting single member with two optional fields would let a caller narrow on
`success === false`, reach for `result.error`, get `undefined`, and render an empty toast for what is
actually an advisory the user needs to read. Test 6 isolates each member with
`Exclude<Failure, { … }>` and assigns `true` to a `[T] extends [never] ? never : true` type — if the
union is ever collapsed, both `Exclude`s become `never` and the assignments stop compiling.

**2. `confirmDuplicate` lives on the action's parameter, never in the Zod schema.**
Zod strips unknown keys silently. A flag smuggled into `data` would be dropped by
`organizationSchema.parse` inside the mutation and the check would run forever, which is exactly the
class of silent no-op Phase 38 recorded for an `ownerId` in the same position.
`grep -c confirmDuplicate` on both mutation modules = 0.

**3. T-39-34 is accepted at the flag, in writing.** The flag is browser-supplied and only skips an
ADVISORY. A client that always sends `true` gets exactly the behaviour a user clicking "Create
anyway" gets. The comment says so, and says it must not be hardened into an authorization control —
because the next reader's instinct will be to treat a client-supplied boolean as a bypass.

**4. `certainMatchesOrNone` is duplicated in both action files rather than shared.**
A `"use server"` module may only EXPORT async functions, so a shared runtime home would have to
export the helper — publishing the duplicate lookup as its own POST endpoint. Both copies carry the
reason and the instruction that they change together. This follows the repo's existing posture for
the ownership predicate, which `bulkDeleteOrganizations` documents as "copied VERBATIM".

**5. The new-tab behaviour is announced by content, not by `aria-label`.**
W-3 says the accessible name is `dedup.warning.openExisting`. An `aria-label` carrying only that
phrase would REPLACE the record's name, so a screen-reader user would hear "Open in a new tab" with
no idea which of up to five records they were about to open. An `sr-only` span inside the link
appends the phrase instead, so the computed name is "Acme Holdings Open in a new tab" — the record
first, the behaviour second, and no string concatenated in code.

**6. `REASON_MESSAGE_KEY` is a frozen total map, not `t(match.reason)`.**
There is no `IntlMessages` augmentation in this repo, so next-intl keys are unchecked strings and
`t(match.reason)` would compile against anything. `Record<DedupReason, string>` makes a fifth reason
a compile error in the component instead of a missing-key error rendered to a user on the one screen
whose whole job is to reduce confusion. Spelling the four leaves also gives the source gate a key
set to read.

**7. The advisory is cleared without a single `useEffect`.**
Two mechanisms, both sanctioned, neither an effect: the compared field's own `onChange` (chained
after react-hook-form's, W-10), and React's adjust-state-on-prop-change pattern keyed on
`` `${open ? "open" : "closed"}:${organization?.id ?? "new"}` `` — which covers a close by any route,
including a parent that flips `open` directly instead of going through `handleClose`, and a dialog
re-pointed at a different record. `react-hooks/set-state-in-effect` is an ERROR here and does not
fire. The gate asserts the CONTRACT ("no `set*(` inside any effect body") with an explicit
anti-vacuity check that each dialog still HAS an effect body, exactly as the plan required.

**8. `tRoot = useTranslations()` with fully-qualified key paths in the dialogs.**
A namespaced `useTranslations("dedup.warning")` + `t("createAnyway")` would leave the W-6 gate's
anti-vacuity half — "`dedup.warning.` appears at least once" — with no literal to read, which is how
a negative assertion becomes satisfiable by an emptied file. Both dialogs carry the reason in a
comment so nobody "tidies" it into a namespace.

**9. A production build was run as verification.** It is the only check that proves the type-only
`CertainMatch` import in two `"use client"` files and one client component erases rather than
dragging `@/db` (and `postgres`) into a browser bundle, and that a `"use server"` module exporting a
`type` / `interface` still compiles. `✓ Compiled successfully in 58s`.

## Verification Evidence

**Test runs**

- `./node_modules/.bin/vitest run src/app/organizations/actions.test.ts` — **9 passed**.
- `./node_modules/.bin/vitest run src/app/people/actions.test.ts` — **10 passed**.
- `./node_modules/.bin/vitest run src/components/dedup` — **16 passed**.
- `./node_modules/.bin/vitest run src/components/dedup src/app/organizations src/app/people` —
  5 files, **107 passed**.
- `./node_modules/.bin/vitest run src/messages/locale-parity.test.ts` — **9 passed** (no new keys
  were added; the 77-key exact-set contract still holds).
- `npm run test` — **2453 passed | 21 skipped** (main project) and **8 passed** (rsc project), 0
  failures.
- `npm run typecheck` — **0 errors**.
- `npm run lint` — **0 errors, 125 warnings**, none of them in any file this plan touched
  (identical count to the 125 recorded by 39-08; all pre-existing, in `src/lib/import/*` and
  elsewhere). `react-hooks/set-state-in-effect` does not fire.
- `npm run build` — `✓ Compiled successfully in 58s`.

**The two predicted intermediate typecheck errors**

Introduced by `2ee3d95` (task 1), resolved by `eab41c2` (task 3). Exactly two, one per dialog, both
`TS2339`, and no others — quoted verbatim from the run at the intermediate commit:

```
src/app/organizations/organization-dialog.tsx(177,32): error TS2339: Property 'error' does not
  exist on type '{ success: false; error: string; } | { success: false; duplicates: CertainMatch[]; }'.
  Property 'error' does not exist on type '{ success: false; duplicates: CertainMatch[]; }'.
src/app/people/person-dialog.tsx(194,32): error TS2339: Property 'error' does not exist on type
  '{ success: false; error: string; } | { success: false; duplicates: CertainMatch[]; }'.
  Property 'error' does not exist on type '{ success: false; duplicates: CertainMatch[]; }'.
```

They were also the ONLY two errors after task 2, confirming the component introduced none of its
own. Neither was suppressed: `grep -cE 'as any|@ts-expect-error|@ts-ignore'` = **0** in both
dialogs, and both were resolved by real narrowing on `"duplicates" in result`.

**Five negative proofs, RUN**

| # | Task | Mutation | Result |
|---|------|----------|--------|
| 1 | 1 | replaced the `confirmDuplicate` short-circuit with `options?.confirmDuplicate \|\| true` | `× Test 3 — confirmDuplicate: true does NOT run the check, and creates the record` — 1 failed, 8 passed. Restored. |
| 2 | 1 | hoisted a `findCertainMatches` call above the `auth()` guard | `× Test 4 — an unauthenticated call looks nothing up and creates nothing` (plus 1b/3/5 as collateral) — 4 failed, 5 passed. Restored. |
| 3 | 3 | added a `tRoot("dedup.merge.gone")` reference to the organization dialog | `× W-6 — offers no merge affordance, and is not empty (anti-vacuity)` — 1 failed, 15 passed. The PERSON dialog's identically-named case still passed, confirming the gate is scoped per file. Restored. |
| 4 | 3 | called `handleClose()` inside the duplicates branch | `× W-2 — the duplicates branch neither closes the dialog, resets the form, nor arms the create guard`, on `expected '…' not to contain 'handleClose('`. The file-wide `handleClose(` count was unchanged, so only the per-branch extraction could catch this. Restored. |
| 5 | 3 | moved the flag off the create call onto an adjacent `const strayFlag = …` statement | `× W-4 — the confirm flag rides on the create action's OWN call`. A file-wide `grep confirmDuplicate` would still have found it. Restored. |

After every restore the suite was re-run green, and the committed files are byte-identical to the
verified ones (`git status --short` clean, no `NEGATIVE PROOF` marker left behind).

**Grep gates**

| Gate | Expected | Result |
|------|----------|--------|
| `grep -c confirmDuplicate src/lib/mutations/{organizations,people}.ts` | 0 | **0 / 0** — the flag never enters a Zod schema |
| `grep -c 'variant="destructive"' duplicate-warning.tsx` | 0 | **0** (C-1) |
| `grep -c 'target="_blank"' duplicate-warning.tsx` | 1 | **1** |
| `grep -c 'rel="noopener noreferrer"' duplicate-warning.tsx` | 1 | **1** (T-39-35) |
| `grep -c '<Button' duplicate-warning.tsx` | 0 | **0** |
| `grep -cE 'truncate\|line-clamp' duplicate-warning.tsx` | 0 | **0** (W-7) |
| all four `dedup.reason.*` leaves reachable | 4 | **4** — `email`, `nameIdentity`, `similarName`, `similarNamePhone`, spelled in the frozen map and re-asserted by the wiring test |
| `grep -cE 'as any\|@ts-expect-error\|@ts-ignore'` in both dialogs | 0 | **0 / 0** |
| `dedup.merge.` in both dialogs | 0 | **0 / 0**, with `dedup.warning.` ≥ 1 in each as the anti-vacuity pair (W-6) |

Two of these gates initially read **2** rather than **1** — `target="_blank"` and the
`truncate|line-clamp` pair — because the *comment explaining the rule* quoted the attribute and used
the word "truncates". Both comments were reworded to describe the rule in prose instead of quoting
it, and each now notes that the attribute is gated at one occurrence so a future reader does not
reintroduce a second mention. See "Issues Encountered".

**The pre-existing English literals are untouched.** `git diff -U0` removed 6 lines from
`organization-dialog.tsx` and 7 from `person-dialog.tsx`, and every one is a line this change had to
rewrite: the React import, the `create*(record)` call, the `register(...)` spreads, and the submit
label ternary. No unrelated string moved. All ~20 pre-existing literals per dialog are still present
byte for byte, including `"Add Organization"`, `"Organization created!"`, `"Acme Corporation"`,
`"Save Changes"` and `"Create Organization"`.

## Deviations from Plan

### 1. [Rule 3 — Blocking] `src/app/people/actions.test.ts` was created, though `files_modified` does not list it

- **Found during:** Task 1.
- **Issue:** The plan's `files_modified` names only `src/app/organizations/actions.test.ts`, but the
  same task's `<behavior>` block says "Tests 1-6 repeated for `createPerson`" and its acceptance
  criteria say "the person equivalents pass **in their own file**". The two cannot both be honoured
  without a second test file, and neither file existed before this plan.
- **Fix:** Created `src/app/people/actions.test.ts` with the person equivalents (10 cases).
- **Verification:** 10 passed; both files run in the same command in the plan's own verify block.
- **Committed in:** `5e5fcf9` (RED) / `2ee3d95` (GREEN).

### 2. [Rule 2 — Missing critical] The advisory is cleared on close and on re-target, not only on edit

- **Found during:** Task 3.
- **Issue:** W-10 only requires clearing when a compared field is edited. Editing alone leaves a
  hole: close the dialog with the warning showing, reopen it, and the advisory is still there — now
  naming records that have nothing to do with the empty form in front of the user. The dialog's own
  reset effect already handles this class of problem for `createdRecordIdRef`, but that effect is
  unavailable for state (`react-hooks/set-state-in-effect`).
- **Fix:** the adjust-state-on-prop-change key is composed from `open` AND the edit target's id, so
  the warning clears on open, on close by any route, and on a re-target. Four lines, and it is the
  pattern the plan explicitly offered as the alternative to an effect.
- **Files modified:** both dialogs.
- **Verification:** covered by the "no effect body calls a state setter" gate, `npm run lint` 0
  errors, and the production build.
- **Committed in:** `eab41c2`.

### 3. [Rule 2 — Missing critical] Three extra assertions on the W-2 branch gate

- **Found during:** Task 3.
- **Issue:** The plan's W-2 gate names close and reset. `createdRecordIdRef` is the third thing that
  must not happen in that branch and is the most dangerous of the three: arming it would turn the
  user's next submit into an UPDATE of a record that was never created. The plan's own key_facts
  say "`createdRecordIdRef` stays null" but assign it no gate.
- **Fix:** the branch assertion also asserts the absence of `createdRecordIdRef`, plus a positive
  `toContain("setDuplicates(result.duplicates)")` so the three negatives cannot be satisfied by an
  empty block, plus a `reset(` anti-vacuity check alongside the `handleClose(` one.
- **Files modified:** `src/components/dedup/__tests__/duplicate-warning-wiring.test.ts`.
- **Committed in:** `eab41c2`.

### 4. [Documentation] Two grep gates required rewording the comments that explain them

- **Found during:** Task 2 acceptance verification.
- **Issue:** `grep -c 'target="_blank"' = 1` and `grep -cE 'truncate|line-clamp' = 0` are raw greps
  over the file, so the comment quoting the attribute and the comment using the word "truncates"
  each broke their own gate. Neither is a code defect; both would have been a real one if satisfied
  by deleting the comment instead.
- **Resolution:** both comments now describe the rule in prose, name the gate, and state that the
  attribute is deliberately spelled nowhere else in the file. Recorded here because the same trap
  waits for every future plan whose acceptance criteria are raw greps.

### 5. [Scope] Shared planning artifacts deliberately not written

- **Issue:** This plan executed as a parallel worktree agent.
- **Resolution:** `STATE.md`, `ROADMAP.md` and `REQUIREMENTS.md` were **not** modified, per the
  orchestrator's instruction that it owns those writes after the wave merges.
- **Note for the orchestrator:** `DEDUP-01` can now be ticked. Plan 39-08 delivered its server half
  and explicitly deferred the requirement, saying "mark `DEDUP-01` complete only once that half
  lands". **This is that half** — 39-UI-SPEC Surface 1 is shipped and SC-1 is met.

### 6. [Scope] The pre-existing hardcoded English literals in both dialogs were left alone

- **Issue:** Phase 45's S-8 assigned roughly twenty hardcoded literals per record dialog to "Phases
  39-43".
- **Resolution:** Declined, exactly as the plan's `key_facts` instructed. Migrating two 400-line
  dialogs inside the same change as the warning would make the warning's own diff unreviewable. The
  narrow rule was enforced instead and holds: **every string this plan ADDED comes from the
  catalog**, and zero new hardcoded user-visible literals were introduced in any file it edited.

---

**Total deviations:** 6 (1 blocking-file addition, 2 Rule 2 additions, 1 documentation, 2 scope
notes)
**Impact on plan:** No scope creep. The two Rule 2 additions close gaps in the plan's own stated
contract ("`createdRecordIdRef` stays null", "a stale warning is worse than none") rather than
widening it. Nothing was removed or weakened.

## Issues Encountered

- **The worktree was created from a stale base**, `cbf3229` — the systematic problem the dispatch
  notes warn about, and the same one 39-08 hit. Corrected with
  `git reset --hard df0693d04242f8ffbc2329030992d5c4474fd1c7` as the first action, then verified
  before touching anything: `src/lib/dedup/matching.ts` present and exporting `findCertainMatches`,
  `identity-settings.ts` present, `drizzle/0017_dedup_schema.sql` present with
  `drizzle/meta/_journal.json` ending at `idx: 17`, and the `dedup.*` keys present in all three
  locale files. Without the reset this plan had nothing to call.
- **Two grep gates were broken by their own explanatory comments** (see deviation 4). Worth stating
  plainly because the wrong fix — deleting the comment — would have passed the gate and lost the
  reason.
- **The mutation-layer test fixture needed a narrowing cast.** `createOrganizationMutation`'s success
  member also carries the inserted row, which the action never reads. Rather than build a full
  12-field `organizations` row in every test, one documented `created(id)` helper narrows it once per
  test file. This is in test fixtures only; the acceptance criterion forbidding casts is scoped to
  the dialogs and reads 0 there.
- **No `useEffect` was added to either dialog**, so the effect-body gate would have been vacuous had
  the pre-existing reset effect not been there. The gate asserts `effects.length > 0` explicitly for
  that reason, as the plan required.

## User Setup Required

None. No package was installed (T-39-SC: this plan installs nothing), no migration was generated,
and no environment variable was added.

**Operator note, not setup:** organizations have **no create-time warning until an admin configures
`dedup.organization_identity_fields`**. That is 39-08's fail-closed design, not a defect here:
`findCertainMatches` returns `[]` with no query at all when the key is unset, and `[]` renders as no
warning. People work out of the box, because `people.email` is a real column. Anyone testing this
feature on a fresh install should test it with a person first, or they will conclude it does not
work.

## Next Phase Readiness

**Ready to consume:**

- Plan 39-16 (the importer's flagged-rows report) can call `findCertainMatches` directly, or call
  the create actions with `{ confirmDuplicate: true }` to import as new records while recording the
  matches. **Nothing in this plan makes the importer interactive** — the two create actions'
  behaviour with the flag set is byte-identical to their behaviour before this plan.
- A future edit-time duplicate check has the shape it needs: `CertainMatchInput.excludeId` already
  exists for exactly that case (39-08 built it), and `DuplicateWarning` takes a plain
  `CertainMatch[]` with no create-path assumptions.
- `DuplicateWarning` is reusable on any surface that can render an `Alert`: it owns no buttons, no
  layout above `Alert`, and no state.

**Concerns for whoever comes next:**

- **`CreateRecordOptions` is declared twice**, once per action file, because a `"use server"` module
  may only export async functions and a shared runtime home would publish `certainMatchesOrNone` as
  a POST endpoint. If a third entity ever gains a create-time check, resist unifying these into an
  action file — put the shared piece in a plain module and keep the actions thin.
- **The advisory shows only *certain* matches.** A user who creates a near-duplicate that only the
  *likely* tier would catch sees nothing, by design (39-UI-SPEC Surface 1, locked). `/duplicates` is
  where that belongs. If anyone reports "it didn't warn me", check the tier before checking the code.
- **The submit button's label is a three-way ternary now.** Adding a fourth state to it will make it
  unreadable; extract a `submitLabel` variable at that point rather than nesting further.

## Known Stubs

None. Every rendered value comes from a live server read: `matches` originates in
`findCertainMatches`, the reason line from the classifier's own output, and the link target from the
matched record's id. `useState<CertainMatch[]>([])` is an initial value, not a placeholder — it is
replaced by the server's answer on the first submit and cleared deliberately by W-10.

## Threat Flags

None. This plan adds no network endpoint, no auth path and no schema change. The one new
trust-boundary input, the browser-supplied `confirmDuplicate` flag, is already in the plan's threat
register as **T-39-34 (accept)** and is documented at the flag itself; the one mitigation assigned
to this plan's files, **T-39-35**, is gated at exactly one `rel="noopener noreferrer"` beside exactly
one blank target; and **T-39-36** is covered by `certainMatchesOrNone` and Test 5 in both action
suites.

## Self-Check: PASSED

- `src/components/dedup/duplicate-warning.tsx` — FOUND (6.8K)
- `src/components/dedup/__tests__/duplicate-warning-wiring.test.ts` — FOUND (8.6K)
- `src/app/organizations/actions.test.ts` — FOUND (10.4K)
- `src/app/people/actions.test.ts` — FOUND (8.8K)
- `src/app/organizations/actions.ts` — MODIFIED
- `src/app/people/actions.ts` — MODIFIED
- `src/app/organizations/organization-dialog.tsx` — MODIFIED
- `src/app/people/person-dialog.tsx` — MODIFIED
- `5e5fcf9` test(39-14) — FOUND in `git log`
- `2ee3d95` feat(39-14) — FOUND in `git log`
- `e13e247` feat(39-14) — FOUND in `git log`
- `eab41c2` feat(39-14) — FOUND in `git log`
- working tree clean, no untracked files, no deletions in any commit
- `STATE.md`, `ROADMAP.md`, `REQUIREMENTS.md` — UNMODIFIED, as instructed

---
*Phase: 39-duplicate-detection-merge*
*Completed: 2026-08-19*
