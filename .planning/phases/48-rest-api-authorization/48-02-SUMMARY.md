---
phase: 48-rest-api-authorization
plan: 02
subsystem: api
tags: [authorization, drizzle, rest-api, idor, vitest, pg-dialect, rendered-predicate]

# Dependency graph
requires:
  - phase: 47-suite-trust-supply-chain
    provides: the re-measured base-suite baseline (5237 passed / 32 skipped, 172 files) this plan diffs against
provides:
  - "GET /api/v1/activities scoped to the authenticated caller via one predicate shared by the page query and the count query"
  - "POST /api/v1/activities rejects a foreign owner_id with 422 instead of planting a record on another user"
  - "A rendered-predicate test idiom for /api/v1 list routes: capture the `where`, render it with PgDialect().sqlToQuery, assert on the SQL text and the bound params"
affects: [48-06 (behavioural SC-3 proof), 48-08 (Q10 structural authorization gate), 48-05 (route-authorization inventory test)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Rendered-predicate assertion for mocked Drizzle query builders (PgDialect().sqlToQuery on the captured `where`)"
    - "Scope-then-filter: the caller scope is the conditions array initialiser; caller-supplied filters are pushed after it so `and(...)` can only narrow"
    - "Reject-not-ignore for caller-supplied ownership fields (422 with a named field, the field stays in the schema)"

key-files:
  created:
    - src/app/api/v1/activities/__tests__/route.test.ts
  modified:
    - src/app/api/v1/activities/route.ts

key-decisions:
  - "The scope lives in the `conditions` array initialiser, not in a second query — one line scopes both the page and the count, which is what makes meta.total a ceiling rather than an independent number"
  - "The caller-supplied ?owner_id= filter is KEPT; the test asserts it composes under and(...) (two owner_id occurrences, both ids bound) rather than asserting the line exists"
  - "No admin bypass — an admin holds all 79,022 live activities, so a bypass would make SC-3 permanently vacuous"
  - "A foreign owner_id on POST is rejected 422, not silently coerced to the caller"
  - "The POST guard sits after the body parse (the owner value IS the body) but strictly before any write — the pipelines/[id] before-req.json() ordering does not apply to a create"
  - "Asserted on createActivityMutation's real parameter name `userId`, not the plan's `ownerId` — `userId` is the input the mutation writes to activities.ownerId"

patterns-established:
  - "Rendered-predicate assertion: a mocked findMany discards its `where`, so the predicate is unobservable from the response; render it back to SQL and assert on the text plus params"
  - "Explicit epistemic labelling: the helper's doc-comment states in the file that a rendered predicate is a compiled-structure claim and NOT behavioural proof, and names the plan that owns the proof"
  - "Caller id must appear in the bound params and never in the statement text"

requirements-completed: [SEC-01]

# Metrics
duration: 20min
completed: 2026-08-25
---

# Phase 48 Plan 02: Activities List Scope and Create Ownership Summary

**`GET /api/v1/activities` is now scoped to its caller by one predicate shared with the count query, and `POST` answers 422 instead of creating a record owned by somebody else — both proven by rendering the captured Drizzle `where` back to SQL, and both ablation-tested.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-25T16:05:00Z
- **Completed:** 2026-08-25T16:25:00Z
- **Tasks:** 3
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- **The list leak is closed.** `conditions` opens with `[isNull(activities.deletedAt), eq(activities.ownerId, ctx.userId)]`. Because that array is consumed by *both* `db.query.activities.findMany` and the `count(*)` select, one line scopes the page and the total together — `meta.total` is now a ceiling on what the caller may see rather than a second, unscoped number.
- **The create-as-another-user hole is closed loudly.** `POST` with `owner_id` naming somebody else returns 422 with `{ field: "owner_id", code: "forbidden", message: "owner_id cannot be set to another user" }` and never reaches `createActivityMutation`. The field stays declared in `createActivitySchema` so the caller is told, rather than silently believing the write landed as sent.
- **The caller-supplied `?owner_id=` filter survived, with its safety asserted rather than asserted-away.** The test renders the predicate for `?owner_id=user-9` and requires *two* `"owner_id"` occurrences with *both* ids bound. One occurrence would mean the caller's value replaced the scope — which is exactly the defect that shipped.
- **Both fixes are ablation-proven.** Deleting either one reddens named assertions, verbatim transcripts below.
- **No regressions:** base suite went 5237 → 5246 passed (+9, exactly the new file), 172 → 173 files, 32 skipped unchanged, RSC 8/8, `tsc --noEmit` clean, lint 0 errors.

## Task Commits

1. **Task 1: RED — list-scope and create-ownership tests** — `12d7713` (test)
2. **Task 2: Scope the list conditions, reject a foreign owner on create** — `1a32db9` (feat)
3. **Task 3: Two ablations** — control experiment, no source change; the deliverable is the transcripts recorded below and the tree was verified byte-identical afterwards.

## Files Created/Modified

- `src/app/api/v1/activities/__tests__/route.test.ts` (created, 245 lines) — 9 tests: the rendered bare-GET scope, the caller-id-is-a-param check, page/count predicate equality, the two narrowing-filter cases, and four POST ownership cases. Carries the `renderPredicate` helper and the `occurrences` counter.
- `src/app/api/v1/activities/route.ts` (modified) — the scoped `conditions` initialiser with the comment explaining why the filter below it must not be deleted or moved; the owner-existence lookup replaced by the ownership guard.

## The RED observation (Task 1, verbatim)

Run against the **unfixed** route. `git diff --exit-code -- src/app/api/v1/activities/route.ts` exited 0 immediately before this run, so nothing about the route had been touched.

```
 FAIL  src/app/api/v1/activities/__tests__/route.test.ts > GET /api/v1/activities — owner scope, rendered (T-48-02-01) > scopes a bare list to the caller: the rendered predicate names owner_id and binds user-1
AssertionError: expected '"activities"."deleted_at" is null' to contain 'owner_id'

Expected: "owner_id"
Received: ""activities"."deleted_at" is null"

 ❯ src/app/api/v1/activities/__tests__/route.test.ts:153:22
    151|     // would start returning the caller's own trashed rows.
    152|     expect(rendered).toContain("deleted_at")
    153|     expect(rendered).toContain("owner_id")
       |                      ^
    154|     expect(renderParams(pageWhere())).toContain("user-1")
    155|   })

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/5]⎯

 FAIL  src/app/api/v1/activities/__tests__/route.test.ts > GET /api/v1/activities — the caller-supplied filter narrows, never widens (T-48-02-03) > composes ?owner_id=user-9 UNDER the scope: two owner_id occurrences, both ids bound
AssertionError: expected 1 to be 2 // Object.is equality

- Expected
+ Received

- 2
+ 1

 ❯ src/app/api/v1/activities/__tests__/route.test.ts:185:49
    183|     // REPLACED the scope instead of joining it — which is the current…
    184|     // anyone who can type a query string.
    185|     expect(occurrences(rendered, '"owner_id"')).toBe(2)
       |                                                 ^
    186|     expect(params).toContain("user-1")
    187|     expect(params).toContain("user-9")

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/5]⎯

 FAIL  src/app/api/v1/activities/__tests__/route.test.ts > GET /api/v1/activities — the caller-supplied filter narrows, never widens (T-48-02-03) > keeps the scope when other filters are supplied too
AssertionError: expected [ 'type-1', 'deal-1' ] to include 'user-1'
 ❯ src/app/api/v1/activities/__tests__/route.test.ts:197:20
    195|
    196|     const params = renderParams(pageWhere())
    197|     expect(params).toContain("user-1")
       |                    ^
    198|     expect(params).toContain("type-1")
    199|     expect(params).toContain("deal-1")

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/5]⎯

 FAIL  src/app/api/v1/activities/__tests__/route.test.ts > POST /api/v1/activities — create-as-another-user (SC-2b, T-48-02-02) > rejects a foreign owner_id with 422 and creates nothing
AssertionError: expected 201 to be 422 // Object.is equality

- Expected
+ Received

- 422
+ 201

 ❯ src/app/api/v1/activities/__tests__/route.test.ts:209:29
    207|     const problem = await response.json()
    208|
    209|     expect(response.status).toBe(422)
       |                             ^
    210|     expect(problem.errors).toEqual([
    211|       { field: "owner_id", code: "forbidden", message: "owner_id canno…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/5]⎯

 FAIL  src/app/api/v1/activities/__tests__/route.test.ts > POST /api/v1/activities — create-as-another-user (SC-2b, T-48-02-02) > rejects loudly rather than silently coercing the owner to the caller
AssertionError: expected 201 not to be 201 // Object.is equality
 ❯ src/app/api/v1/activities/__tests__/route.test.ts:221:33
    219|     const response = await POST(createRequest({ title: "x", type_id: "…
    220|
    221|     expect(response.status).not.toBe(201)
       |                                 ^
    222|     expect(mockCreateActivity).not.toHaveBeenCalled()
    223|   })

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/5]⎯


 Test Files  1 failed (1)
      Tests  5 failed | 4 passed (9)
```

The `201` in failures 4 and 5 is the exploit, reproduced: `user-1` created an activity owned by `user-9`, and the API told them it worked.

## Task 3 — ablation transcripts

### Ablation 1: delete `eq(activities.ownerId, ctx.userId)` from the `conditions` initialiser

Line deleted (the initialiser reverted to `const conditions = [isNull(activities.deletedAt)]`):

```
 ❯ src/app/api/v1/activities/__tests__/route.test.ts (9 tests | 3 failed) 285ms
     × scopes a bare list to the caller: the rendered predicate names owner_id and binds user-1 129ms
     × composes ?owner_id=user-9 UNDER the scope: two owner_id occurrences, both ids bound 25ms
     × keeps the scope when other filters are supplied too 18ms

 FAIL  … > scopes a bare list to the caller: the rendered predicate names owner_id and binds user-1
AssertionError: expected '"activities"."deleted_at" is null' to contain 'owner_id'

Expected: "owner_id"
Received: ""activities"."deleted_at" is null"

 FAIL  … > composes ?owner_id=user-9 UNDER the scope: two owner_id occurrences, both ids bound
AssertionError: expected 1 to be 2 // Object.is equality

- Expected
+ Received

- 2
+ 1

 FAIL  … > keeps the scope when other filters are supplied too
AssertionError: expected [ 'type-1', 'deal-1' ] to include 'user-1'

 Test Files  1 failed (1)
      Tests  3 failed | 6 passed (9)
```

Restored, then `git diff --exit-code -- src/app/api/v1/activities/route.ts` → **exit 0**.

### Ablation 2: delete the POST ownership guard (scope restored)

Lines deleted — the whole `if (owner_id && owner_id !== ctx.userId) { return Problems.validation([...]) }` block:

```
 ❯ src/app/api/v1/activities/__tests__/route.test.ts (9 tests | 2 failed) 194ms
     × rejects a foreign owner_id with 422 and creates nothing 57ms
     × rejects loudly rather than silently coercing the owner to the caller 4ms

 FAIL  … > rejects a foreign owner_id with 422 and creates nothing
AssertionError: expected 201 to be 422 // Object.is equality

- Expected
+ Received

- 422
+ 201

 FAIL  … > rejects loudly rather than silently coercing the owner to the caller
AssertionError: expected 201 not to be 201 // Object.is equality

 Test Files  1 failed (1)
      Tests  2 failed | 7 passed (9)
```

Restored; the file re-ran **9 passed (9)** and `git diff --exit-code` over the whole tree exited 0.

## What these assertions do and do not prove — read this before citing them

**They prove:** the route hands the database a predicate that names `owner_id` and binds the authenticated caller's id; that the same predicate object reaches both the page query and the count; that a caller-supplied `?owner_id=` composes under `and(...)` rather than replacing the scope; and that deleting either fix reddens a named CI assertion rather than passing silently.

**They do NOT prove the list is behaviourally scoped.** The `where` is asserted by *rendering* it, because the mock discards it: `db.query.activities.findMany` is a `vi.fn()` that resolves to whatever the test set, entirely regardless of the predicate. This is a **compiled-structure claim** — "the route asked for this SQL" — and it is strictly weaker than "the database returned only the caller's rows". No assertion in this file may be cited as evidence that ROADMAP SC-3 holds.

**The behavioural proof is owned by plan 48-06:** a seeded two-owner database, a real query, a floor (own count > 0) and a ceiling (no foreign row). The live distribution cannot substitute for it — all 79,022 activities belong to one admin user, so a scoped count equals an unscoped count today and a live count-equality assertion would pass against the broken route.

**What the ablation adds on top:** it answers the SEC-48-B failure directly. In `organizations/[id]/route.ts`, three authorization predicates were deleted and 5237 tests stayed green. Here, deleting the equivalent line takes three named assertions red within one second. That is a claim about *detection*, not about *behaviour* — the two ablations show the CI assertion is load-bearing over the rendered predicate, which is the property SEC-48-B found missing everywhere else in this repo.

## None of the four forbidden mechanisms were used

The plan forbade copying `organizations/[id]/__tests__/route.test.ts`. For the record:

| Forbidden mechanism | What this file does instead |
|---|---|
| A `where`-blind db mock (`:13-20`) | The `where` is captured from `findMany.mock.calls[0][0]` and from the count builder's `where`, then rendered to SQL with `PgDialect().sqlToQuery` |
| Non-owner simulated as `mockResolvedValueOnce(undefined)` (`:165`) — encoding the conclusion as the premise | `db.query.users.findFirst` resolves to a **real-looking `user-9` row**, deliberately: if it returned `undefined` the POST would 422 for the wrong reason ("Owner not found") and the RED observation would have been a lie |
| No second identity in the file | `user-9` is present as a foreign owner in both the `?owner_id=user-9` query-string case and the POST body case, distinct from the authenticated `user-1` |
| Assertions only on status + call counts (`:169-171`) | Status and call counts are asserted, **plus** the rendered SQL text, the bound-parameter arrays, an occurrence count of `"owner_id"`, page/count predicate string equality, and the exact `errors` payload |

## Decisions Made

- **Scope placement.** The equality went into the `conditions` array initialiser rather than into a separate query, so the page and count cannot drift. A comment above it states this and warns against deleting or reordering the caller-supplied filter below.
- **Caller filter kept and asserted, not deleted.** The plan predicted a reviewer would reach for the delete key at `:61-63`. The two-occurrence assertion is what makes keeping it safe: it can only narrow.
- **Guard placement on POST.** Hard rule 5's "check before `await req.json()`" is a per-record-read ordering; on a create the owner value *is* the body, so the guard necessarily follows the parse. It still precedes every write, and `createActivityMutation` is asserted un-called in the rejection cases.
- **`activityOwnerId = owner_id || ctx.userId` left in place** at the plan's instruction: after the guard the left operand can only be the caller's own id, so it is provably equal to `ctx.userId`, and rewriting it would be a gratuitous diff.
- **No admin bypass, and none was added.**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The db mock needed `db.query.users.findFirst`, which the plan's mock spec omitted**
- **Found during:** Task 1
- **Issue:** The plan listed `activityTypes.findFirst` and `deals.findFirst` on the `@/db` mock but not `users.findFirst`. The **unfixed** route calls `db.query.users.findFirst` to verify the supplied owner exists. Without that mock the foreign-owner POST would have thrown, or — worse, had it been mocked to `undefined` — returned 422 for the *existence* reason and produced a green-looking RED that proved nothing.
- **Fix:** Added `users: { findFirst: vi.fn() }` to the mock and resolved it to a real-looking `user-9` row, with a comment stating why it must not resolve `undefined`.
- **Files modified:** `src/app/api/v1/activities/__tests__/route.test.ts`
- **Verification:** The RED transcript shows `expected 201 to be 422` — the route accepted the create — rather than any existence-related failure.
- **Committed in:** `12d7713`

**2. [Rule 1 - Bug in the plan text] The plan named the mutation's ownership field `ownerId`; it is `userId`**
- **Found during:** Task 1
- **Issue:** The plan's behaviour spec said "the object passed to `createActivityMutation` carries `ownerId` equal to `user-1`". `createActivityMutation` takes `userId` and writes it to `activities.ownerId` (`src/lib/mutations/activities.ts`). An assertion on `.ownerId` would have read `undefined` and could only have been made to pass by asserting `toBeUndefined()` — a vacuous gate.
- **Fix:** Asserted `mockCreateActivity.mock.calls[0][0].userId === "user-1"`, with a comment naming the indirection so the next reader does not "correct" it back.
- **Files modified:** `src/app/api/v1/activities/__tests__/route.test.ts`
- **Verification:** The assertion is live in two passing tests and would fail if the route stopped passing the caller's id.
- **Committed in:** `12d7713`

**3. [Rule 2 - Missing critical] Reworded the scope comment so the acceptance criterion's own count stays honest**
- **Found during:** Task 2
- **Issue:** The first draft of the explanatory comment quoted `eq(activities.ownerId, ctx.userId)` verbatim, which made the plan's `node -e` acceptance check report **2** occurrences where it required exactly **1**. The same collision class has fired 15+ times in this repo (see `eslint.config.mjs`, which documents it firing twice on its own explanatory prose) and would have inflated any structural counter that plan 48-08's Q10 gate builds on the same token.
- **Fix:** Reworded to "the owner equality below is the caller scope". Count re-measured with `node -e`: 1.
- **Files modified:** `src/app/api/v1/activities/route.ts`
- **Verification:** `node -e` reports occurrence count 1 and `scope before filter: true`.
- **Committed in:** `1a32db9`

---

**Total deviations:** 3 auto-fixed (1 blocking, 1 bug, 1 missing critical)
**Impact on plan:** All three protect the plan's own anti-vacuity intent — two prevent a RED observation that would have been true for the wrong reason, one prevents an acceptance counter from being inflated by prose describing the thing it counts. No scope creep; no file outside the plan's `files_modified` was touched.

## Issues Encountered

- **Two new lint warnings from the test file.** `vi.fn((_condition: unknown) => …)` warned under `@typescript-eslint/no-unused-vars` — this repo's config sets no `argsIgnorePattern`, so the `_` prefix buys nothing. Retyping as `vi.fn<(condition: unknown) => Promise<{ count: number }[]>>(() => …)` keeps `mock.calls[0][0]` typed while dropping the unused binding. Both warnings gone; `tsc --noEmit` still clean.
- **Pre-existing, deliberately not fixed:** `src/app/api/v1/activities/route.ts:10` warns that `deals` is unused. Verified against `git show 12d7713:…` that the import was already unused before this plan — out of scope per the scope boundary, not introduced here.
- **Worktree base was stale** (28/28 as recorded). Fixed with `git merge --ff-only ae514ed`, never `reset --hard`.

## Verification Evidence

| Check | Command | Result |
|---|---|---|
| Plan tests | `./node_modules/.bin/vitest run "src/app/api/v1/activities/__tests__/route.test.ts"` | 9 passed (9) |
| Base suite | `npm test` | 173 passed / 2 skipped files; **5246 passed / 32 skipped** (baseline 5237/32, +9 = exactly this file) |
| RSC project | `npm test` (second project) | 2 files, 8 passed |
| Typecheck | `./node_modules/.bin/tsc --noEmit` | exit 0, no output |
| Lint | `npm run lint` | **0 errors**, 121 warnings (none in either file of this plan) |
| Scope occurrence | `node -e` over the route | `eq(activities.ownerId, ctx.userId)` × 1, before `if (ownerId)` |
| Caller filter kept | `node -e` | `conditions.push(eq(activities.ownerId, ownerId))` × 1 |
| Old branch gone | `node -e` | `code: "not_found", message: "Owner not found"` × 0 |
| Shared consumption | `node -e` | `and(...conditions)` × 2 (page + count) |
| Tree clean after ablations | `git diff --exit-code` | exit 0 |

Counts were recomputed with `node -e`; `grep … | wc -l` was not used, and cleanliness was verified with `git diff --exit-code` rather than `git status --porcelain`.

## Next Phase Readiness

- **Ready for 48-06.** That plan owns the behavioural SC-3 proof and now has a fixed route to prove against; a seeded two-owner test would have been meaningless before this change.
- **Ready for 48-08 (Q10).** The scope token `eq(activities.ownerId, ctx.userId)` occurs exactly once in the route and does not appear in any comment, so a structural detector can count it without prose collisions.
- **Handoff note for 48-05's route inventory:** `GET /api/v1/activities` now authorizes via a WHERE-scope rather than a fetch-then-compare, so an inventory gate that looks only for a `!== ctx.userId` comparison will miss it. This route's shape is `eq(col.ownerId, ctx.userId)` inside the conditions array.
- **Not closed by this plan:** `PUT`/`DELETE`/`GET` on `/api/v1/activities/[id]` (plan 48-01) and the `?owner_id=` cross-user read path on any other list route. `meta.total` is now trustworthy for activities only.

## Self-Check: PASSED

- FOUND: `src/app/api/v1/activities/__tests__/route.test.ts`
- FOUND: `src/app/api/v1/activities/route.ts`
- FOUND: `.planning/phases/48-rest-api-authorization/48-02-SUMMARY.md`
- FOUND commit `12d7713` — `test(48-02): add failing list-scope and create-ownership tests for activities`
- FOUND commit `1a32db9` — `feat(48-02): scope the activity list to its caller and reject a foreign owner on create`

STATE.md and ROADMAP.md were deliberately NOT modified — the orchestrator owns those after the wave.

---
*Phase: 48-rest-api-authorization*
*Completed: 2026-08-25*
