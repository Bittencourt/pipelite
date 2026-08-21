---
phase: 40-saved-views-shared-filters
plan: 06
subsystem: lib
tags: [server-actions, authorization, input-validation, drizzle, postgres, tdd, saved-views]

# Dependency graph
requires:
  - phase: 40-01
    provides: "pickFilterParams, hasSaveableFilter (counts pipeline), MAX_FILTER_VALUE_LENGTH, VIEW_ENTITY_TYPES, ViewFilters/ViewEntityType"
  - phase: 40-02
    provides: "savedViews, savedViewDefaults, saved_views_owner_type_name_uniq as a raceable-proof invariant, and the cascading FKs that IMPLEMENT fall-back-to-unfiltered"
  - phase: 39-11
    provides: "the per-action authorization gate pattern: extract each exported function's body, assert the check's INDEX against the mutation's, name the function in the failure message"
  - phase: 35-custom-fields
    provides: "EntityType, the single definition of the four-member union"
provides:
  - "createView / updateView / setViewShared / setViewDefault / deleteView — the whole write side, each authorizing independently before its own write"
  - "src/lib/views/write-guards.ts — normaliseViewName, guardSaveInput, canMutateView, canSeeView, narrowEntityType, narrowViewId, listRouteFor, isDuplicateViewName, redactDbError, MAX_VIEW_NAME_LENGTH"
  - "ViewActionErrorCode — the six machine codes the client maps to sentences; no translated string crosses the boundary"
  - "the measured fact that drizzle-orm 0.45.1 wraps driver errors in DrizzleQueryError, so a 23505 mapping MUST walk the cause chain"
  - "SaveViewResult / ManageViewResult / DeleteViewResult"
affects: [40-08, 40-09, 40-10, 40-11, 40-12, 40-13, 40-14]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Synchronous guards live in a sibling module, never in the \"use server\" file: Next refuses to build a non-async export there, AND a unit test cannot import a module that opens a database client at load"
    - "await auth() is repeated at every action site rather than folded into a helper, because the gate asserts the call is inside each action's OWN body and ahead of that action's first query"
    - "A driver-error classifier walks the cause chain with a depth cap and a seen-set, and matches on code + constraint_name — never on the message, which embeds the SQL and every bound parameter"
    - "Two authorization predicates that disagree are written as two functions with the disagreement asserted as its own test, so 'simplifying' them into one fails by name"

key-files:
  created:
    - src/lib/views/actions.ts
    - src/lib/views/write-guards.ts
    - src/lib/views/__tests__/actions.test.ts
  modified: []

key-decisions:
  - "The pure guards moved OUT of actions.ts into write-guards.ts. Measured, not assumed: the Next SWC binary contains the string \"Only async functions are allowed to be exported in a \\\"use server\\\" file.\", so the plan's exported constant and three synchronous predicates would have been a build error that tsc, eslint and vitest all pass."
  - "isDuplicateViewName walks error.cause. drizzle-orm 0.45.1's PgPreparedQuery.queryWithCache wraps EVERY driver rejection in DrizzleQueryError, whose own .code is undefined. The plan's instruction to read the error's code field would have matched nothing and every duplicate name would have returned the generic failure."
  - "Never the driver message. DrizzleQueryError.message is `Failed query: <SQL>\\nparams: <values>` — it leaks the statement and the view name the user typed. redactDbError keeps only code and constraint_name, and a test proves the classifier does not string-match the message."
  - "MAX_VIEW_NAME_LENGTH = 120, measured on the COLLAPSED name, rejecting rather than truncating. saved_views.name is a bare text column, so this is the only bound."
  - "updateView authorizes BEFORE it guards. A stranger is refused without learning whether their name would have been acceptable."
  - "Unticking the default checkbox on an update clears the default ONLY if it pointed at this view. The plan describes the upsert and not the false branch; without it the checkbox is one-way, and an unscoped delete would let saving view A drop the user's default on view B."
  - "setViewShared's make-private branch deletes other users' defaults on the view, scoped away from the owner. A consequence 40-CONTEXT does not state; without it those users get a permanent silent no-op instead of the unfiltered list."
  - "setViewDefault refuses a view whose entityType differs from the submitted one, rather than silently rewriting the argument, which would make the argument decorative."
  - "not_authenticated is a distinct code even though it maps to the same generic sentence, so the server log can tell a bypassed page from a failed write."

patterns-established:
  - "A negative proof for an authorization ordering claim moves the check PAST the mutation rather than deleting it, because deletion is also caught by a presence assertion and proves less"
  - "Prototype-pollution inputs are built with JSON.parse, because an object literal's __proto__ sets the prototype and the test would exercise nothing"

requirements-completed: [VIEW-01, VIEW-02]

# Metrics
duration: 71min
completed: 2026-08-21
---

# Phase 40 Plan 06: The Saved-View Write Layer Summary

**Five server actions that each authorize inside their own body and ahead of their own write, gated on ORDER rather than presence — and two findings the plan could not have known: Next.js would have refused to build the file as specified, and drizzle 0.45.1 wraps driver errors so the plan's `23505` mapping would have matched nothing.**

## Performance

- **Duration:** ~71 min
- **Tasks:** 2 of 2, each as a TDD RED/GREEN pair
- **Assertions:** 71 in this suite (47 after task 1, 71 after task 2); 531 across `src/lib/views/`
- **Files:** 3 created, 0 modified, 1686 insertions, **0 deletions**

## Task Commits

| Task | Gate | Commit | Content |
|---|---|---|---|
| 1 | RED | `cfad774` | collection failure, **0 tests ran** (`../write-guards` absent) |
| 1 | GREEN | `e00676d` | `write-guards.ts`, `createView`, `updateView` — 47 pass |
| 2 | RED | `4225aa9` | **9 failed / 56 passed** of 65 |
| 2 | GREEN | `87ef40b` | `setViewShared`, `setViewDefault`, `deleteView` — 71 pass |

## THE AUTHORIZATION SHAPE — stated plainly, because this file is the write boundary

**A server action is a POST endpoint.** `SavedViewsBar` hides the save control on an unfiltered list
(B-5) and hides the edit controls on somebody else's view (G-7). Neither is a control. Every rule
those two presentations imply exists in `actions.ts`, once per action, ahead of the write.

**Each of the five actions calls `await auth()` on its own first line.** Not through a helper — see
the deviation below, where the gate caught exactly that mistake. `toViewer(session)` is the
synchronous projection only, so the one line that matters is legible at each site and a sixth action
cannot inherit somebody else's session check.

**MUTATION and VISIBILITY are two different predicates, and the difference is the point.**

| | predicate | admin branch? | read by |
|---|---|---|---|
| **May I change this view?** | `canMutateView` = `row.ownerId === viewer.id \|\| viewer.role === "admin"` | **yes** | `updateView`, `setViewShared`, `deleteView` |
| **May I see this view?** | `canSeeView` = `row.ownerId === viewer.id \|\| row.isShared` | **no** — Decision 3 | `setViewDefault` |

So an admin **may** delete a shared view they can see, and **cannot** enumerate anybody's private
views at all. Both directions are asserted, including the pair that would come out equal if the two
were unified:

```
canMutateView(privateRowOwnedByA, admin) === true
canSeeView(privateRowOwnedByA, admin)    === false
```

`views.save.privateHelp` promises the user "Only you can see this view. Nobody else, including
admins." in words, so this is a commitment and not an implementation detail. Its accepted cost is
recorded in 40-CONTEXT A6: a soft-deleted user's private views are unreachable by anyone, and six
such users exist here.

**`setViewDefault` deliberately does NOT check ownership.** A default is per user — which is the
whole reason plan 40-02 built a second table keyed `(userId, entityType)` rather than a boolean on
the view row, because a boolean would have made one user's choice the owner's choice too. UI-SPEC
G-7 calls the asymmetry "the one thing this row must make legible". The absence of the ownership
check is therefore a REQUIREMENT, and it has a test whose name says so. What `setViewDefault` does
check is **visibility**, and that check is not optional: without it a member could point their
default at an admin's private view and read its filter values out of their own address bar after the
redirect (T-40-24) — a disclosure an ownership check would not have caught, because ownership is not
the question being asked.

**Everything is read from the stored ROW, never from the request.** A submitted `ownerId` is not
read anywhere in the file; there is a test for the case where the viewer claims to be the owner.

**Gated by parsed structure, on ORDER.** `src/lib/views/__tests__/actions.test.ts` derives the
action list from the source (so a sixth action is covered the day it is added, with a floor
assertion so a parser regression cannot make the file vacuous), extracts each body by string-aware
brace matching, and compares indices — `auth()` before the first `db.`, `guardSaveInput` before the
write, `canMutateView`/`canSeeView` before the mutation — with the function name in every failure
message. The source is comment-stripped first, so the file's own prose cannot satisfy its own gate.

## Save-time refusals

`guardSaveInput` uses **`hasSaveableFilter`**, which counts `pipeline`, and **not**
`hasExportableFilter`, which does not. That is 40-CONTEXT amendment A2 and it is load-bearing in
this direction: Decision 4 requires a deals view to carry its board, so the export predicate would
refuse a legitimate pipeline-only deals view. Negative proof 3 swapped them and two tests failed by
name.

| refusal | when | client renders |
|---|---|---|
| `no_filters` | the PICKED map has no saveable key — empty, non-whitelisted keys only, `{search:"   "}`, or a value past the 40-01 length cap | `views.save.noFilters` (S-15) |
| `name_required` | the name normalises to nothing, or is not a string at all | `views.save.nameRequired` (S-7) |
| `name_taken` | `23505` on `saved_views_owner_type_name_uniq` | `views.save.nameTaken` (S-6) |
| `forbidden` | `canMutateView` / `canSeeView` refused | `views.manage.readOnly` / `views.save.targetNewOnly` |
| `failed` | anything else, plus a narrowing refusal the client cannot correct | the generic toast |
| `not_authenticated` | no session | the generic toast (no dedicated key exists; this plan invents none) |

`no_filters` is reported **ahead of** `name_required`: the empty-name message renders inline beside
the name field, and on a list with nothing to save that would point the user at the wrong problem.

**`MAX_VIEW_NAME_LENGTH = 120`**, measured on the collapsed name, **rejecting rather than
truncating**. `saved_views.name` is a bare `text` column, so this is the only bound. Measuring after
collapse matters: `"a" + 1 MiB of spaces + "b"` is a two-character name and refusing it would refuse
a legitimate name for the size of something that was discarded. A 1 MiB run of `x` is refused.

Runtime narrowing is explicit rather than incidental: `narrowEntityType` is a membership scan over
`VIEW_ENTITY_TYPES` (a property lookup would make `__proto__` resolve `Object.prototype`),
`narrowViewId` bounds ids at 64 characters before they reach a `WHERE`, and `listRouteFor` is a
frozen map — `person` maps to `/people`, and a string transform would produce `/persons`, which is
not a route, silently revalidating nothing while leaving the real page stale.

## The exact `23505` object this code matches against

The plan says to use "the `postgres`/Drizzle error's `code` field". **That would never have
matched.** Measured against the real database through real drizzle:

```
thrown constructor : DrizzleQueryError
err.code           : undefined
err.constraint_name: undefined
has cause          : true
cause constructor  : PostgresError
cause.code         : "23505"
cause.constraint   : "saved_views_owner_type_name_uniq"
message leaks SQL  : true
message leaks name : true
```

`drizzle-orm@0.45.1`'s `PgPreparedQuery.queryWithCache` wraps **every** driver rejection in
`DrizzleQueryError` (`node_modules/drizzle-orm/pg-core/session.js`, seven `throw new
DrizzleQueryError` sites, one per branch). So `isDuplicateViewName` walks the `cause` chain — depth
capped at 8, with a seen-set so a cycle cannot hang a POST endpoint — and matches
`code === "23505" && constraint_name === "saved_views_owner_type_name_uniq"`. Both the wrapped and
the bare shape are accepted, so a future drizzle release that stops wrapping is not a silent
regression.

**Two fields, both required, and never the message.** The SQLSTATE alone is not enough: two racing
"set as default" writes hit `saved_view_defaults_user_id_entity_type_pk` and also raise `23505`, and
reporting that as a taken name would send the user to rename a field that was never the problem.
The message is excluded deliberately — `DrizzleQueryError.message` is
`Failed query: <SQL>\nparams: <bound values>`, so a view whose *name* is the constraint's own name
would put that string into the message. A message match would report a collision that never
happened, and would keep passing if `constraint_name` were dropped from the check entirely. There is
a test for exactly that input, and `redactDbError` is what reaches `console.error` — code and
constraint only, asserted against the whole serialised value so a leak on a second property fails.

No pre-check: `saved_views_owner_type_name_uniq` cannot be raced, and `.planning/BACKLOG.md` already
records the Phase 39 dedup scan guard as a defect for being a read-then-write check.

## Live probes — RUN against the development database, 8/8

Fixtures are real users: **A** = `pedrobittencourt87@gmail.com` (live, `name IS NULL`), **B** =
`pipelite-e2e-member@local.test` (live member). The actions themselves cannot be invoked outside a
request — they call `auth()` — so the probe replicates each action's exact drizzle statements. Every
row carried the literal name prefix `[probe-40-06]` and was deleted by that prefix.

| # | Expectation | Observed | Result |
|---|---|---|---|
| 1 | A owns a shared view | `name=[probe-40-06] Shared` | PASS |
| 2 | B may own the SAME name (scope is per owner) | insert succeeded | PASS |
| 3 | A may NOT own it twice | `code=23505 constraint=saved_views_owner_type_name_uniq` | PASS |
| 4 | **G-7:** B's default points at A's view | `rows=1 on_someone_elses=true` | PASS |
| 5 | A and B both default to A's view | `defaults_on_view=2` | PASS |
| 6 | **making it private drops B's default and KEEPS A's own** | `remaining=1 owner_kept=true` | PASS |
| 7 | **deleting the shared view cascades BOTH defaults away, with NO error** | `defaults_before=2 deleted_views=1 defaults_after=0 threw=null` | PASS |
| 8 | zero orphaned defaults | `orphans=0` | PASS |

Probe 7 is the locked decision, exercised rather than reasoned about: a teammate who had defaulted
to a deleted shared view is left with no defaults row, and the absence of that row IS "falls back to
unfiltered, with no error". Nothing threw.

## Development database row counts

| Table | Before | After |
|---|---|---|
| organizations | 46054 | **46054** |
| people | 38348 | **38348** |
| deals | 25195 | **25195** |
| notes | 75236 | **75236** |
| activities | 79022 | **79022** |
| audit_log | 213 | **213** |
| saved_views | 0 | **0** |
| saved_view_defaults | 0 | **0** |
| users | 10 | **10** |

Unchanged. No `TRUNCATE`, `DROP` or unqualified `DELETE` was issued at any point; both new tables
are back to zero rows.

**`users` is 10, not the 9 the briefing quoted.** `pipelite-e2e-member@local.test` (role `member`,
live) was created at **2026-08-21 11:17:47**, i.e. during this wave and not by this plan — almost
certainly by sibling 40-04, which owns `e2e/**` and needs a second live member to prove that a
private view stays invisible (40-CONTEXT records that only one member account existed). Flagged
because a later plan asserting 9 would fail for the wrong reason. It is also why probe 4 above could
use a real second member rather than the admin.

## Negative proofs — 12, every one RUN, failing BY NAME, then restored

Each was applied to the committed source, run, and reverted with `git checkout --`. The final state
is the committed one: 71 pass, 0 fail.

| # | Mutation | Must fail | Observed |
|---|---|---|---|
| 1 | `canMutateView` check deleted from `updateView` only | the update authorization | `FAIL: updateView authorizes on the stored row BEFORE it mutates` (1 failed / 70) |
| 2 | `await auth()` moved BELOW the first query in `deleteView` | the ordering, not the presence | `FAIL: deleteView calls auth() before any db. access` |
| 3 | `hasSaveableFilter` -> `hasExportableFilter` in `guardSaveInput` | the pipeline distinction | `FAIL: accepts a pipeline-only deals view, because hasSaveableFilter counts pipeline` **+** `FAIL: stores the PICKED map…` (2 failed) |
| 4 | `isDuplicateViewName` "simplified" to read `error.code` | the wrapped shape | `FAIL: matches the WRAPPED shape drizzle actually throws` |
| 5 | admin branch added to `canSeeView` | Decision 3 | `FAIL: an ADMIN does NOT see somebody else's private view`; `FAIL: the two predicates disagree, and the disagreement is the point`; `FAIL: canSeeView's own body contains no admin branch…` (3 failed) |
| 6 | `canMutateView` added to `setViewDefault` (the plausible "consistency" fix) | G-7 | `FAIL: setViewDefault does NOT require ownership, because a default is per-user` |
| 7 | manual `savedViewDefaults` delete added to `deleteView` | the cascade claim | `FAIL: deleteView removes the row and lets the FK cascade take every default on it` |
| 8 | `normaliseViewName` truncates instead of rejecting | the rejection rule | `FAIL: REJECTS rather than truncates one character over the cap`; `FAIL: rejects a megabyte of text` (2 failed) |
| 9 | `isDuplicateViewName` matches the message text | the no-message-match rule | `FAIL: does NOT string-match the driver message` **+** both positive matchers (3 failed) |
| 10 | `ne(userId, row.ownerId)` scoping dropped from the make-private cleanup | the owner-keeps-theirs rule | `FAIL: setViewShared clears OTHER users' defaults when a view goes private` |
| 11 | `guardSaveInput` replaced by an inline always-ok object in `createView` | the re-derivation claim | `FAIL: createView calls guardSaveInput on the submitted map before writing` |
| 12 | `"views.manage.failed"` added to a `console.error` in `setViewShared` | the no-catalog-key rule | `FAIL: contains zero message-catalog keys` |

Proof 2 is the one that says the most about the gate's shape: it did not *delete* the check, it
*reordered* it, which a presence assertion would have accepted. Proof 9 is the counterpart on the
error classifier — an implementation that string-matches the message passes a "does it detect a
duplicate name" test and fails only the input crafted to look like one.

## Verification

| Check | Result |
|---|---|
| `npx vitest run src/lib/views/__tests__/actions.test.ts` | **71 pass, 0 fail** |
| `npx vitest run src/lib/views/` | **531 pass, 0 fail** |
| `npm test` | **131 files / 3294 tests passed**, 1 file / 21 skipped; rsc project **2 files / 8 passed** |
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **0 errors**, 125 pre-existing warnings, **none in this plan's files** |
| `npx eslint src/lib/views` | **No issues found** |
| `git diff --stat` vs base | 3 files, **1686 insertions, 0 deletions** |
| files touched under `e2e/`, `playwright.config.ts`, `url-params.ts`, `queries/validate/resolve`, `src/lib/export/`, `src/messages/`, `package.json`, `drizzle/`, `.planning/*.md` | **none** |
| `drizzle/meta/_journal.json` | still ends at **`idx: 18`** — no migration generated |
| dependencies | **none installed**; no Docker rebuild; no `sudo` |

## Deviations from Plan

### 1. [Rule 3 — Blocking] The plan's module layout does not build

- **Found during:** Task 1, designing the test's imports.
- **Issue:** the plan puts `MAX_VIEW_NAME_LENGTH`, `guardSaveInput`, `canMutateView` and
  `canSeeView` in `actions.ts`, which carries `"use server"`. Next.js refuses to build a
  `"use server"` module that exports anything other than an async function. **Measured rather than
  recalled** — the string is in the SWC binary itself:
  `strings node_modules/@next/swc-linux-x64-gnu/next-swc.linux-x64-gnu.node | grep "async functions are allowed"`
  returns `Only async functions are allowed to be exported in a "use server" file.` Nothing in the
  plan's verification would have caught it: `tsc`, `eslint` and `vitest` all pass on such a file,
  and it fails at `next build`.
- **Second, independent reason:** the suite has to CALL those guards with real values. `actions.ts`
  imports `@/db`, which constructs a postgres client at module load and throws without
  `DATABASE_URL`; the base vitest project loads no `.env`. So the file cannot be imported by a unit
  test at all, which is also why 39-11's analogue only ever reads its `actions.ts` as text.
- **Fix:** the guards live in a new sibling, `src/lib/views/write-guards.ts` — no `"use server"`, no
  database import, nothing with a load-time side effect. `actions.ts` remains the only place the
  mutations live, and the gate still asserts the ordering inside each of its functions. The name is
  deliberately specific rather than `guards.ts`, so it cannot collide with a parallel sibling.
- **Files:** `src/lib/views/write-guards.ts` (new)
- **Commit:** `e00676d`

### 2. [Rule 1 — Bug] The plan's `23505` mapping would have matched nothing

- **Found during:** Task 1, probing the real error object before writing the mapper.
- **Issue:** the plan says "Use the `postgres`/Drizzle error's `code` field; do not string-match the
  message text." The second half is right and the first half is wrong for this drizzle version. A
  duplicate insert through drizzle throws `DrizzleQueryError`, whose own `code` is `undefined`; the
  SQLSTATE is on `.cause`. Implemented literally, every duplicate-name save would have returned the
  generic failure toast instead of S-6's inline "You already have a view called X", and the bug
  would have been invisible to any test that constructed a bare `PostgresError`.
- **Fix:** `isDuplicateViewName` walks the `cause` chain (depth 8, seen-set) and accepts either
  shape. The test that pins it is written against the WRAPPED object, so the naive version fails.
  Cause: `PgPreparedQuery.queryWithCache` in `pg-core/session.js` wraps on all seven branches.
- **Also fixed in passing:** `DrizzleQueryError.message` embeds the SQL **and the bound parameters**,
  so `console.error(error)` would log the statement and the view name the user typed. `redactDbError`
  keeps `code` and `constraint_name` only.
- **Files:** `src/lib/views/write-guards.ts`
- **Commit:** `e00676d`

### 3. [Rule 2 — Security] `await auth()` had been hidden behind a helper, and the gate caught it

- **Found during:** Task 1 GREEN — 2 of 47 failed.
- **Issue:** the first implementation used `const viewer = await resolveViewer()`, with `auth()`
  inside the helper. The gate failed by name: `createView calls auth() before any db. access` and
  the same for `updateView`, because `action.body.indexOf("auth()")` was `-1`. Reading better is not
  the property being asserted — a wrapper puts all five actions' authentication behind a single
  edit, and a sixth action inherits nothing.
- **Fix:** `await auth()` is inline at all five sites; `toViewer(session)` is the synchronous
  projection only. The reason is written above the helper, addressed to the next reader who wants to
  fold it back in.
- **Commit:** `e00676d`

### 4. [Rule 2 — Correctness] Unticking the default checkbox had no effect

- **Found during:** Task 1, writing `updateView`.
- **Issue:** the plan specifies a "transactional default upsert" when `makeDefault` is true and says
  nothing about false. Ignoring false makes S-10's `Checkbox` one-way, which is not what a checkbox
  means. But an unscoped delete is worse: the defaults row is keyed `(userId, entityType)` and may
  point at a DIFFERENT view, so saving changes to view A would silently drop the user's default on
  view B.
- **Fix:** `makeDefault === false` deletes the defaults row only when it points at THIS view —
  `and(userId, entityType, viewId)`. Commented as a plan gap at the site.
- **Commit:** `e00676d`

### 5. [Rule 2 — Correctness] Runtime narrowing the plan did not specify

- **Found during:** both tasks.
- **Issue:** `saved_views.entity_type` is a bare `text` column and `id` is unbounded, so a crafted
  POST could persist an arbitrary entity type (making every later read resolve no whitelist) or
  carry a megabyte into a `WHERE`. `revalidatePath(undefined)` throws, and there is no `error.tsx`
  above any of the four routes. `setViewDefault` could also have been handed a `viewId` of a
  different entity type than the `entityType` it keys on, which would redirect a list to filters no
  query on it applies.
- **Fix:** `narrowEntityType` (membership scan), `narrowViewId` (≤64, trimmed), `listRouteFor`
  (frozen map, `null` for anything else), and an explicit `row.entityType !== entityType` refusal in
  `setViewDefault` rather than a silent rewrite of the submitted argument.
- **Commits:** `e00676d`, `87ef40b`

### 6. [Rule 2 — Correctness] `setViewShared` making a view private clears other users' defaults

The plan asks for this, so it is not a deviation — recorded here because 40-CONTEXT does not state
it and the source says so at the site. The scoping is the part the plan leaves open: the delete is
`and(viewId, ne(userId, row.ownerId))`, so the **owner keeps their own default** (they can still see
their own private view) while everybody else degrades to unfiltered. Negative proof 10 removed the
scoping; probe 6 proved the behaviour live.

---

**Total deviations:** 5 auto-fixed (1× Rule 1, 3× Rule 2, 1× Rule 3), plus one plan requirement
whose scoping was under-specified.
**Impact on plan:** no scope creep and no file outside `src/lib/views/`. Deviations 1 and 2 are the
two that would have shipped broken: one as a build failure, one as a silently wrong error code.

## Issues Encountered

**The worktree was stale, as predicted.** `git merge-base HEAD dcb92ae` returned this worktree's own
HEAD (`cbf3229`, a Phase-34-era commit), so the base was reset to `dcb92ae` per the bootstrap
instructions. The journal was then re-verified from the corrected tree — `idx: 18` — before anything
else. 17 of 17 executors across three phases have now needed this reset.

**`docker compose` does not work from a worktree**, as 40-02 recorded: Compose derives its project
name from the directory. All database access went through `docker exec -i pipelite-postgres-1 psql`
or through `postgres.js` on the host-mapped `localhost:5433`, never with `sudo`.

**`head`/`sed` redirected into a file is intercepted in this environment.** `head -300 actions.ts >
actions.ts.tmp` wrote an ELIDED file containing literal `// ... 313 lines omitted` markers, silently
corrupting the source mid-task. Caught immediately by inspecting the result rather than trusting the
exit code, and the file was rewritten with the Write tool. Every subsequent file write in this plan
went through Write/Edit only; `sed -n` for READING to stdout is unaffected. Worth knowing for the
next executor here — it is a class of corruption that a passing test suite would not necessarily
reveal.

**A prediction that disagreed with reality was investigated, not forced** — twice (deviations 1 and
2). In both cases the plan's instruction was checked against the artefact (the SWC binary, then the
live database through real drizzle) before being departed from, and the departure is recorded in the
source where the next reader will meet it.

## Known Stubs

None. All five actions are implemented and every guard they call is exercised directly. No client
component calls them yet — the picker, the save dialog and the manage dialog are plans 40-08 through
40-10 — which is this plan's boundary rather than a stub, and no code here returns a placeholder or
reads mock data.

## Threat Flags

None. Every trust boundary this plan opens is in its own register and is mitigated at the site:
T-40-22 (`auth()` first, asserted per function by index), T-40-23 (`canMutateView` from the row, with
the submitted `ownerId` never read), T-40-24 (`canSeeView` on `setViewDefault`, no admin branch),
T-40-25 (`pickFilterParams` re-derives the stored map), T-40-26 (`hasSaveableFilter` refuses an empty
set at the action), T-40-27 (`23505` caught, never pre-checked), T-40-28 (`MAX_VIEW_NAME_LENGTH`
rejects), T-40-SC (nothing installed).

One surface worth naming for the reviewer even though it is not new: these are the first server
actions in the repo that live under `src/lib` rather than under `src/app`, following
`src/lib/fetch-entities.ts`. They are reachable as POST endpoints exactly as any action under
`src/app` is, which is why the per-action gate rather than a route gate is the whole control here —
there is no route above them to guard.

## Next Phase Readiness

Ready. Consumers can rely on:

- `createView`, `updateView`, `setViewShared`, `setViewDefault`, `deleteView` from
  `@/lib/views/actions`, all returning `{ success: true, … } | { success: false, error: ViewActionErrorCode }`.
- **The client owns the sentence.** Map the six codes to the keys in the table above; do not expect a
  translated string. `not_authenticated` has no dedicated key on purpose — render the generic failure.
- `MAX_VIEW_NAME_LENGTH` (120) from `@/lib/views/write-guards` for the `Input`'s `maxLength`, so the
  form and the action agree. Note the action REJECTS an over-long name rather than truncating, so a
  client that omits `maxLength` produces `name_required`-adjacent surprise rather than a silent trim.
- `canMutateView` / `canSeeView` for the read layer's `canEdit` and visibility scoping (plan 40-05) —
  **use both, and do not substitute one for the other**; the whole of Decision 3 is in the difference.
- `deleteView` returning `{ name }` so `views.delete.success` can interpolate a row that is gone.

Two notes. `setViewShared` making a view private clears other users' defaults on it — if 40-05's
resolver assumes a defaults row always points at a visible view, that assumption now holds for a
reason, and it did not before. And `updateView` treats `makeDefault: false` as "clear my default if
it points here", so the save dialog must send the checkbox's real state rather than omitting it.

## Self-Check: PASSED

- `src/lib/views/actions.ts` — FOUND
- `src/lib/views/write-guards.ts` — FOUND
- `src/lib/views/__tests__/actions.test.ts` — FOUND
- commit `cfad774` — FOUND
- commit `e00676d` — FOUND
- commit `4225aa9` — FOUND
- commit `87ef40b` — FOUND
- working tree clean after all 12 negative proofs restored — CONFIRMED
- `STATE.md`, `ROADMAP.md`, `REQUIREMENTS.md` not modified — CONFIRMED

---
*Phase: 40-saved-views-shared-filters*
*Completed: 2026-08-21*
