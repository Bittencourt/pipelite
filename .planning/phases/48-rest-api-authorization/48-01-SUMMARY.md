---
phase: 48-rest-api-authorization
plan: 01
subsystem: rest-api
tags: [security, idor, authorization, ownership, rest-api, activities, SEC-01, SC-1, SC-2, tdd]

# Dependency graph
requires:
  - phase: 48-rest-api-authorization
    provides: "48-RESEARCH's end-to-end reproduction of the IDOR (user A read/renamed/reassigned/deleted user B's activity) and Pitfall 5, which forbids moving the check into the `where`"
  - phase: 48-rest-api-authorization
    provides: "48-PATTERNS' four-mechanism diagnosis of organizations/[id]/__tests__/route.test.ts and its identification of notes/__tests__/route.test.ts as the harness to copy"
  - phase: 25
    provides: "the layering decision that ownership checks live at the route layer and mutations only check existence — so the fix belongs in route.ts, not in src/lib/mutations/activities.ts"
provides:
  - "GET, PUT and DELETE on /api/v1/activities/[id] each compare the fetched row's ownerId to ctx.userId and return 403 — the reproduced IDOR is closed on all three verbs"
  - "a PUT carrying a foreign owner_id is rejected 422 naming the field, closing the reassignment escalation"
  - "the first test file in the repository that asserts REST route authorization with two distinct identities and a genuinely foreign-owned fixture"
  - "negative control D: four independent ablations proving each of the four guards is individually load-bearing"
affects:
  - "src/app/api/v1/activities/[id]/route.ts — GET/PUT/DELETE now 403 for non-owners; PUT 422 on foreign owner_id"
  - "any API-key client that relied on reading or writing another user's activity — that traffic now receives 403"
  - "48-05's Q10 route-authorization gate, which will find three `ctx.userId` ownership predicates in this file"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "fetch-then-compare -> 403, copied byte-for-byte in shape from pipelines/[id]/route.ts, at all three verbs of one file"
    - "the ownership guard placed BEFORE the JSON body parse, so a foreign caller's payload is never read"
    - "a reject-loudly immutable-field guard (422 naming the field) layered ON TOP of the schema-omission idiom rather than replacing it"
    - "two-identity route tests: a real foreign-owned fixture whose ownerId is a user that never authenticates, replacing the mockResolvedValueOnce(undefined) stand-in"
    - "per-verb describe blocks with NO shared 403 helper, because the verbs fail independently"
    - "status asserted before response.json(), because a 204 has an empty body and would otherwise mask the status diff"

key-files:
  created:
    - "src/app/api/v1/activities/[id]/__tests__/route.test.ts"
    - ".planning/phases/48-rest-api-authorization/48-01-SUMMARY.md"
  modified:
    - "src/app/api/v1/activities/[id]/route.ts"

decisions:
  - "The check is fetch-then-compare, NOT a `where`-scoped predicate. A `where`-scoped check would return 404 (contradicting SC-4's 403 contract) and would silently make every mocked assertion in this file unfalsifiable, because a mocked findFirst discards its `where` argument. This is exactly how organizations/[id] became the tenth vacuous gate."
  - "Owner-only, no admin bypass. ApiAuthContext carries no role and none was added; an admin bypass would make SC-3 permanently vacuous because the only user holding activities is an admin."
  - "A foreign owner_id is rejected 422 rather than stripped. owner_id deliberately STAYS in updateActivitySchema — dropping it there is the silent-drop CONTEXT rejected, and it would leave the caller believing the reassignment landed."
  - "The existing `if (updates.owner_id !== undefined)` write block at the old :188-191 was left in place. It is now reachable only when the value equals the caller's own id, which is a no-op assignment, and leaving it keeps the changedFields bookkeeping untouched."
  - "SC-2 lives in a describe NESTED inside the PUT describe, so the file keeps exactly three top-level describe blocks named for the three verbs while still asserting the reassignment property separately."
  - "The PUT guard's comment was reworded to drop the literal string `await req.json()`, because the plan's source criterion compares character indexes and a comment mentioning the parse would have made a correct implementation fail the check."

metrics:
  duration: "~70 min"
  completed: "2026-08-25"
  tasks: 3
  commits: 3
  tests_added: 12
---

# Phase 48 Plan 01: Close the Reproduced IDOR on /api/v1/activities/[id] Summary

**A live, reproduced IDOR is closed on all three verbs, and every predicate that closes it is proven
individually load-bearing.** Research demonstrated user A reading user B's activity (200), renaming it
(200), reassigning `owner_id` to himself (200) and deleting it (204), after which B's read of B's own
record returned 404. `GET`, `PUT` and `DELETE` now each compare the fetched row's `ownerId` to
`ctx.userId` and answer `403`, and a `PUT` carrying somebody else's `owner_id` is refused `422` naming
the field.

The test that proves it is the first in this repository to assert REST route authorization against
**two distinct identities**. It carries none of the four mechanisms that made
`organizations/[id]/__tests__/route.test.ts` survive a three-site ablation of its own subject.

## What Was Built

### Task 1 — the two-identity route test (RED)

`src/app/api/v1/activities/[id]/__tests__/route.test.ts`, 361 lines, 12 tests, harness copied from
`notes/__tests__/route.test.ts`.

The fixture pair is the whole design:

```typescript
const CALLER_ID = "user-1"
/**
 * The foreign owner. It is never an authenticated `userId` anywhere in this file — it exists only
 * as the owner of a record the caller must not reach.
 */
const FOREIGN_OWNER_ID = "user-9"

/** The same activity, owned by somebody else — the IDOR target. */
const foreignActivity: ActivityRow = { ...ownedActivity, id: "act-2", ownerId: FOREIGN_OWNER_ID }
```

`@/db` is mocked at the **fetch**; the predicate stays **real**. `findFirst` resolves a genuinely
foreign-owned row and `activity.ownerId !== ctx.userId` executes against a real second identity.

Three top-level `describe` blocks — GET, PUT, DELETE — verified programmatically, with **no shared
"assert 403 for verb X" helper**. The three verbs fail independently today; one shared helper would go
green the moment any single verb was fixed and would hide the other two. `SC-2` is a `describe` nested
inside PUT, so the top-level count stays exactly three.

Each 403 case is paired with an **owner-positive anchor** (200 / 200 / 204) so the refusal cannot be
satisfied by a route that 403s everyone, plus a 404 case proving a missing row never reaches the
comparison.

### Task 2 — four insertions in the route (GREEN)

`src/app/api/v1/activities/[id]/route.ts`, +32 lines, nothing else changed:

| Verb | Insertion | Placement |
|---|---|---|
| GET | `if (activity.ownerId !== ctx.userId) return Problems.forbidden()` | immediately after the existing 404 block |
| PUT | `if (existingActivity.ownerId !== ctx.userId) return Problems.forbidden()` | after the 404 block and **before** the JSON body parse — a foreign caller's payload is never read |
| PUT | `if (updates.owner_id !== undefined && updates.owner_id !== ctx.userId) return Problems.validation([{ field: "owner_id", code: "forbidden", message: "owner_id cannot be reassigned through this endpoint" }])` | after `parsed`, before the `updateData` assembly |
| DELETE | `if (existingActivity.ownerId !== ctx.userId) return Problems.forbidden()` | after the 404 block, before the soft-delete write |

No `findFirst` `where` was touched, no role lookup was added, and no existing status code changed.

### Task 3 — negative control D

Four independent ablations, each restored, transcripts below.

## Verbatim Output

### Task 1 RED — against the unfixed route

`./node_modules/.bin/vitest run "src/app/api/v1/activities/[id]/__tests__/route.test.ts" --reporter=verbose`

```
 RUN  v4.1.11 /home/pedro/programming/pipelite/.claude/worktrees/agent-a1178723405cff420

 × GET /api/v1/activities/:id — per-record authorization (SC-1a) > returns 403 when the activity belongs to another user 19ms
   → expected 200 to be 403 // Object.is equality
 ✓ GET /api/v1/activities/:id — per-record authorization (SC-1a) > returns 200 for the owner 3ms
 ✓ GET /api/v1/activities/:id — per-record authorization (SC-1a) > returns 404 before it ever reaches the ownership comparison 1ms
 × PUT /api/v1/activities/:id — per-record authorization (SC-1b) > returns 403 for another user's activity and attempts no write 4ms
   → expected 200 to be 403 // Object.is equality
 ✓ PUT /api/v1/activities/:id — per-record authorization (SC-1b) > returns 200 for the owner and performs the write 2ms
 ✓ PUT /api/v1/activities/:id — per-record authorization (SC-1b) > returns 404 for a missing activity before any ownership comparison 1ms
 × PUT ... > owner_id reassignment (SC-2) > rejects a foreign owner_id with 422 naming the field, and writes nothing 2ms
   → expected 200 to be 422 // Object.is equality
 ✓ PUT ... > owner_id reassignment (SC-2) > still accepts the caller's OWN owner_id with 200 — the rejection is targeted 1ms
 ✓ PUT ... > owner_id reassignment (SC-2) > does not touch ownerId on an ordinary owner update 2ms
 × DELETE /api/v1/activities/:id — per-record authorization (SC-1c) > returns 403 for another user's activity and attempts no soft delete 2ms
   → expected 204 to be 403 // Object.is equality
 ✓ DELETE /api/v1/activities/:id — per-record authorization (SC-1c) > returns 204 for the owner and performs the soft delete 1ms
 ✓ DELETE /api/v1/activities/:id — per-record authorization (SC-1c) > returns 404 for a missing activity before any ownership comparison 1ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/api/v1/activities/[id]/__tests__/route.test.ts > GET /api/v1/activities/:id — per-record authorization (SC-1a) > returns 403 when the activity belongs to another user
AssertionError: expected 200 to be 403 // Object.is equality

- Expected
+ Received

- 403
+ 200

 ❯ src/app/api/v1/activities/[id]/__tests__/route.test.ts:211:29
    209|     const problem = await response.json()
    210|
    211|     expect(response.status).toBe(403)
       |                             ^
    212|     expect(problem.type).toMatch(/\/FORBIDDEN$/)
    213|     expect(problem.status).toBe(403)

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/4]⎯

 FAIL  src/app/api/v1/activities/[id]/__tests__/route.test.ts > PUT /api/v1/activities/:id — per-record authorization (SC-1b) > returns 403 for another user's activity and attempts no write
AssertionError: expected 200 to be 403 // Object.is equality

- Expected
+ Received

- 403
+ 200

 ❯ src/app/api/v1/activities/[id]/__tests__/route.test.ts:250:29
    248|     const problem = await response.json()
    249|
    250|     expect(response.status).toBe(403)
       |                             ^
    251|     expect(problem.type).toMatch(/\/FORBIDDEN$/)
    252|     // The whole point: the refusal happens BEFORE any write is attemp…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/4]⎯

 FAIL  src/app/api/v1/activities/[id]/__tests__/route.test.ts > PUT /api/v1/activities/:id — per-record authorization (SC-1b) > owner_id reassignment (SC-2) > rejects a foreign owner_id with 422 naming the field, and writes nothing
AssertionError: expected 200 to be 422 // Object.is equality

- Expected
+ Received

- 422
+ 200

 ❯ src/app/api/v1/activities/[id]/__tests__/route.test.ts:291:31
    289|       const problem = await response.json()
    290|
    291|       expect(response.status).toBe(422)
       |                               ^
    292|       // Asserted on the RESPONSE BODY, not merely on the absence of t…
    293|       // is that a foreign owner_id is REJECTED, not silently dropped,…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/4]⎯

 FAIL  src/app/api/v1/activities/[id]/__tests__/route.test.ts > DELETE /api/v1/activities/:id — per-record authorization (SC-1c) > returns 403 for another user's activity and attempts no soft delete
AssertionError: expected 204 to be 403 // Object.is equality

- Expected
+ Received

- 403
+ 204

 ❯ src/app/api/v1/activities/[id]/__tests__/route.test.ts:334:29
    332|     // before asserting would report `Unexpected end of JSON input` an…
    333|     // that is the actual defect.
    334|     expect(response.status).toBe(403)
       |                             ^
    335|     const problem = await response.json()
    336|     expect(problem.type).toMatch(/\/FORBIDDEN$/)

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯


 Test Files  1 failed (1)
      Tests  4 failed | 8 passed (12)
   Start at  16:07:47
   Duration  1.42s (transform 335ms, setup 0ms, import 1.15s, tests 46ms, environment 0ms)
```

`git diff --exit-code -- "src/app/api/v1/activities/[id]/route.ts"` exited **0** at this point — the
route was still unfixed, and all four failures are the defect.

**One correction was needed to get this transcript.** On the first RED run the DELETE test failed with
`SyntaxError: Unexpected end of JSON input` rather than a status diff, because a successful DELETE
answers `204` with an **empty body** and the test parsed the body before asserting the status. The
parse error would have masked the `204`-instead-of-`403` on every future ablation. The status
assertion was moved ahead of `response.json()`, which produced the `expected 204 to be 403` above.

### Task 2 GREEN

```
 ✓ ... GET ... > returns 403 when the activity belongs to another user 19ms
 ✓ ... GET ... > returns 200 for the owner 5ms
 ✓ ... GET ... > returns 404 before it ever reaches the ownership comparison 4ms
 ✓ ... PUT ... > returns 403 for another user's activity and attempts no write 6ms
 ✓ ... PUT ... > returns 200 for the owner and performs the write 10ms
 ✓ ... PUT ... > returns 404 for a missing activity before any ownership comparison 2ms
 ✓ ... PUT ... > owner_id reassignment (SC-2) > rejects a foreign owner_id with 422 naming the field, and writes nothing 5ms
 ✓ ... PUT ... > owner_id reassignment (SC-2) > still accepts the caller's OWN owner_id with 200 — the rejection is targeted 3ms
 ✓ ... PUT ... > owner_id reassignment (SC-2) > does not touch ownerId on an ordinary owner update 5ms
 ✓ ... DELETE ... > returns 403 for another user's activity and attempts no soft delete 3ms
 ✓ ... DELETE ... > returns 204 for the owner and performs the soft delete 2ms
 ✓ ... DELETE ... > returns 404 for a missing activity before any ownership comparison 1ms

 Test Files  1 passed (1)
      Tests  12 passed (12)
```

Source criteria, recomputed with `node -e` (never `grep | wc -l`, which is unreliable under `rtk`):

```
ownerId !== ctx.userId : 3
Problems.forbidden()   : 3
Problems.forbidden() indexes: [ 3949, 5604, 11649 ]
first await req.json() index: 5677
PUT forbidden before json parse: true
GET forbidden before json parse: true
schema keeps owner_id  : true
rejection message      : true
findFirst blocks: 3 any mentioning ctx.userId: false
```

## Negative Control D — four independent ablations

Each ablation deleted exactly ONE guard (the script refused to run unless the target text was unique
in the file), ran the test file, and restored with `git checkout -- <that one file>`.

### D1 — GET guard deleted

Ablated (4 lines):

```typescript
    // Verify ownership
    if (activity.ownerId !== ctx.userId) {
      return Problems.forbidden()
    }
```

```
D1 ABLATED: GET guard deleted (4 lines)

 × GET ... > returns 403 when the activity belongs to another user 22ms
   → expected 200 to be 403 // Object.is equality
 ✓ GET ... > returns 200 for the owner 3ms
 ✓ GET ... > returns 404 before it ever reaches the ownership comparison 2ms
 ✓ PUT ... > returns 403 for another user's activity and attempts no write 3ms
 ✓ PUT ... > returns 200 for the owner and performs the write 7ms
 ✓ PUT ... > returns 404 for a missing activity before any ownership comparison 2ms
 ✓ PUT ... > owner_id reassignment (SC-2) > rejects a foreign owner_id with 422 naming the field, and writes nothing 5ms
 ✓ PUT ... > owner_id reassignment (SC-2) > still accepts the caller's OWN owner_id with 200 — the rejection is targeted 2ms
 ✓ PUT ... > owner_id reassignment (SC-2) > does not touch ownerId on an ordinary owner update 4ms
 ✓ DELETE ... > returns 403 for another user's activity and attempts no soft delete 3ms
 ✓ DELETE ... > returns 204 for the owner and performs the soft delete 1ms
 ✓ DELETE ... > returns 404 for a missing activity before any ownership comparison 1ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
```

**Red:** `GET ... returns 403 when the activity belongs to another user`, `expected 200 to be 403`.
**Green:** 11, including the PUT and DELETE non-owner tests. `D1 RESTORED CLEAN`.

### D2 — PUT guard deleted

Ablated (6 lines, including its two comment lines):

```typescript
    // Verify ownership. Placed BEFORE the body parse below, so a foreign caller's payload is never
    // even read — matching pipelines/[id]/route.ts, where the same guard precedes the JSON parse.
    if (existingActivity.ownerId !== ctx.userId) {
      return Problems.forbidden()
    }
```

```
D2 ABLATED: PUT guard deleted (6 lines incl. its 2 comment lines)
 ✓ GET ... > returns 403 when the activity belongs to another user 26ms
 ✓ GET ... > returns 200 for the owner 5ms
 ✓ GET ... > returns 404 before it ever reaches the ownership comparison 3ms
 × PUT ... > returns 403 for another user's activity and attempts no write 25ms
   → expected 200 to be 403 // Object.is equality
 ✓ PUT ... > returns 200 for the owner and performs the write 6ms
 ✓ PUT ... > returns 404 for a missing activity before any ownership comparison 3ms
 ✓ PUT ... > owner_id reassignment (SC-2) > rejects a foreign owner_id with 422 naming the field, and writes nothing 3ms
 ✓ PUT ... > owner_id reassignment (SC-2) > still accepts the caller's OWN owner_id with 200 — the rejection is targeted 2ms
 ✓ PUT ... > owner_id reassignment (SC-2) > does not touch ownerId on an ordinary owner update 7ms
 ✓ DELETE ... > returns 403 for another user's activity and attempts no soft delete 4ms
 ✓ DELETE ... > returns 204 for the owner and performs the soft delete 2ms
 ✓ DELETE ... > returns 404 for a missing activity before any ownership comparison 1ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 Test Files  1 failed (1)
      Tests  1 failed | 11 passed (12)
```

**Red:** `PUT ... returns 403 for another user's activity and attempts no write`, `expected 200 to be
403`. **Green:** 11, including GET and DELETE non-owner **and** the SC-2 reassignment test — the two
PUT guards are independent of each other, not one mechanism counted twice. `D2 RESTORED CLEAN`.

### D3 — DELETE guard deleted

Ablated (4 lines):

```typescript
    // Verify ownership
    if (existingActivity.ownerId !== ctx.userId) {
      return Problems.forbidden()
    }
```

```
D3 ABLATED: DELETE guard deleted (4 lines)
 ✓ GET ... > returns 403 when the activity belongs to another user 23ms
 ✓ GET ... > returns 200 for the owner 9ms
 ✓ GET ... > returns 404 before it ever reaches the ownership comparison 1ms
 ✓ PUT ... > returns 403 for another user's activity and attempts no write 3ms
 ✓ PUT ... > returns 200 for the owner and performs the write 5ms
 ✓ PUT ... > returns 404 for a missing activity before any ownership comparison 2ms
 ✓ PUT ... > owner_id reassignment (SC-2) > rejects a foreign owner_id with 422 naming the field, and writes nothing 4ms
 ✓ PUT ... > owner_id reassignment (SC-2) > still accepts the caller's OWN owner_id with 200 — the rejection is targeted 3ms
 ✓ PUT ... > owner_id reassignment (SC-2) > does not touch ownerId on an ordinary owner update 3ms
 × DELETE ... > returns 403 for another user's activity and attempts no soft delete 17ms
   → expected 204 to be 403 // Object.is equality
 ✓ DELETE ... > returns 204 for the owner and performs the soft delete 1ms
 ✓ DELETE ... > returns 404 for a missing activity before any ownership comparison 1ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 Test Files  1 failed (1)
      Tests  1 failed | 11 passed (12)
```

**Red:** `DELETE ... returns 403 for another user's activity and attempts no soft delete`, `expected
204 to be 403` — the received `204` is the soft delete actually happening. **Green:** 11.
`D3 RESTORED CLEAN`.

### D4 — owner_id rejection guard deleted

Ablated (10 lines; the explanatory comment was deliberately LEFT in place, so the ablation removes
behaviour rather than prose — a control that a comment could satisfy would prove nothing):

```typescript
    if (updates.owner_id !== undefined && updates.owner_id !== ctx.userId) {
      return Problems.validation([
        {
          field: "owner_id",
          code: "forbidden",
          message: "owner_id cannot be reassigned through this endpoint",
        },
      ])
    }
```

```
D4 ABLATED: owner_id rejection guard deleted (10 lines, comment left in place)
 ✓ GET ... > returns 403 when the activity belongs to another user 43ms
 ✓ GET ... > returns 200 for the owner 9ms
 ✓ GET ... > returns 404 before it ever reaches the ownership comparison 18ms
 ✓ PUT ... > returns 403 for another user's activity and attempts no write 10ms
 ✓ PUT ... > returns 200 for the owner and performs the write 15ms
 ✓ PUT ... > returns 404 for a missing activity before any ownership comparison 6ms
 × PUT ... > owner_id reassignment (SC-2) > rejects a foreign owner_id with 422 naming the field, and writes nothing 75ms
   → expected 200 to be 422 // Object.is equality
 ✓ PUT ... > owner_id reassignment (SC-2) > still accepts the caller's OWN owner_id with 200 — the rejection is targeted 10ms
 ✓ PUT ... > owner_id reassignment (SC-2) > does not touch ownerId on an ordinary owner update 29ms
 ✓ DELETE ... > returns 403 for another user's activity and attempts no soft delete 18ms
 ✓ DELETE ... > returns 204 for the owner and performs the soft delete 8ms
 ✓ DELETE ... > returns 404 for a missing activity before any ownership comparison 1ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 Test Files  1 failed (1)
      Tests  1 failed | 11 passed (12)
```

**Red:** the SC-2 reassignment test only. **Green:** 11, including all three verb tests.
`D4 RESTORED — WORKING TREE CLEAN (git diff --exit-code = 0)`, then `Tests 12 passed (12)`.

### What control D establishes

Every ablation reddened **exactly one** test and left **eleven** green. The point is the
**independence**, not the redness: a single shared "assert 403 for verb X" helper would have gone red
on D1, D2 and D3 alike and would therefore have proved nothing about *which* verb is protected. That
is precisely the failure mode `organizations/[id]/__tests__/route.test.ts` exhibits, where deleting
**all three** ownership predicates left the whole 5237-test suite green.

## Verification

Baseline **re-measured at plan start** on this worktree at base `ae514ed` (STATE.md's 5164 was not
inherited):

```
 Test Files  172 passed | 2 skipped (174)
      Tests  5237 passed | 32 skipped (5269)
```

After the plan:

```
 Test Files  173 passed | 2 skipped (175)
      Tests  5249 passed | 32 skipped (5281)
   Duration  143.96s
```

Exactly **+1 file, +12 tests, zero new failures**. `suite-hook-hygiene.test.ts` and
`suite-timing-hygiene.test.ts` both enumerate the new file and both stayed green — it uses static
top-level imports only and asserts over no clock-derived delta.

| Gate | Result |
|---|---|
| `./node_modules/.bin/vitest run "src/app/api/v1/activities/[id]/__tests__/route.test.ts"` | 12 passed |
| `./node_modules/.bin/vitest run` (base project) | 5249 passed / 32 skipped, 173 files |
| `./node_modules/.bin/tsc --noEmit` | `TSC_EXIT=0` |
| `npm run lint` | `✖ 121 problems (0 errors, 121 warnings)` — **0 errors**, gated on errors only |
| `git diff --exit-code` after the final restore | exit 0 |

Lint warnings are not gated: the total differs between the main repo and a worktree (124 vs 121-122)
because of `.planning`'s untracked files, so a warning-total gate would be environment-dependent.

## Success Criteria

| Criterion | Status | Evidence |
|---|---|---|
| SC-1a — non-owner GET is 403 | met | own `it` in `describe("GET ...")`, foreign-owned fixture, `type` ends `/FORBIDDEN`; D1 red independently |
| SC-1b — non-owner PUT is 403, no write | met | own `it` in `describe("PUT ...")`, `db.update` and `crmBus.emit` both asserted uncalled; D2 red independently |
| SC-1c — non-owner DELETE is 403, no soft delete | met | own `it` in `describe("DELETE ...")`, `db.update` (the soft delete) asserted uncalled; D3 red independently |
| SC-1 — three verbs asserted SEPARATELY | met | 3 top-level `describe` blocks counted with `node -e`; no shared 403 helper anywhere in the file |
| SC-2 — foreign `owner_id` rejected 422 | met | assertion on the response `errors` array naming field `owner_id`, plus `db.update` uncalled; D4 red independently |
| SC-2 — self-assignment still succeeds | met | `{ owner_id: "user-1" }` → 200, `db.update` called once — the rejection is targeted, not blanket |
| SC-2 — persisted owner untouched | met | `Object.keys(updatedValues)` does not contain `ownerId` on an ordinary PUT |
| No admin bypass | met | no role lookup added; `ApiAuthContext` unchanged |
| 403, not 404 | met | no `findFirst` `where` mentions `ctx.userId` (verified with `node -e`) |
| Guards match `pipelines/[id]/route.ts` in shape | met | same four-step fetch → 404 → compare → `Problems.forbidden()`, check before body parse |
| Control D delivered | met | four ablations, four verbatim transcripts above, tree restored clean |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] DELETE non-owner test reported a JSON parse error instead of the status diff**

- **Found during:** Task 1, first RED run
- **Issue:** The test parsed `response.json()` before asserting `response.status`. A successful DELETE
  answers `204` with an empty body, so the failure surfaced as
  `SyntaxError: Unexpected end of JSON input` rather than `expected 204 to be 403`. The plan's own
  acceptance criterion requires "received 204 against expected 403", and more importantly the parse
  error would have masked the status on every subsequent ablation — the D3 transcript would have been
  uninterpretable.
- **Fix:** Moved the status assertion ahead of `response.json()` in that test, with a comment stating
  why. The other tests are unaffected because 403/422 responses carry a body.
- **Files modified:** `src/app/api/v1/activities/[id]/__tests__/route.test.ts`
- **Commit:** `e6b6059` (folded into the RED commit, before the fix existed)

**2. [Rule 3 - Blocking] The PUT guard's comment defeated the plan's own source criterion**

- **Found during:** Task 2 verification
- **Issue:** The plan requires the PUT's `Problems.forbidden()` to sit at a lower character index than
  the file's **first occurrence of the string** `await req.json()`. My guard comment explained the
  placement by naming `await req.json()` literally, which created an earlier textual occurrence and
  made a behaviourally correct implementation fail the textual check (`guard-before-parse: false`).
- **Fix:** Reworded the comment to say "the JSON parse" instead. Re-verified: PUT guard at index 5604,
  first `await req.json()` at 5677, `PUT forbidden before json parse: true`.
- **Files modified:** `src/app/api/v1/activities/[id]/route.ts`
- **Commit:** `cb2f2f3`

### Structural choice worth flagging

`SC-2`'s three tests live in a `describe` **nested inside** the PUT `describe`, rather than in a fourth
top-level block. The plan's acceptance criterion asks for "three separate `describe` blocks named for
GET, PUT and DELETE"; a fourth top-level block would have made the programmatic count read 4. Nesting
keeps the top-level count at exactly 3 while still asserting the reassignment property in its own
tests, which D4 confirms are independently load-bearing.

## Observations for Future Phases

### The route's PUT bypasses `updateActivityOwnerMutation` entirely

`src/lib/mutations/activities.ts:531` carries a narrow, audited `updateActivityOwnerMutation(id,
ownerId, userId)` whose doc-comment says, verbatim:

> NEVER route an owner change through `updateActivityMutation`. `activitySchema` does not declare
> `ownerId` and Zod strips unknown keys silently, so `updateActivitySchema.safeParse({ ownerId })`
> returns `{ success: true, data: {} }` — the generic path would then write only `updatedAt`, emit an
> empty diff, and have the audit subscriber drop the row. A silent no-op, with every test in this
> suite still green.

`/api/v1/activities/[id]`'s PUT does **not** use it. It performs its own `db.update(...).set(...)` and
emits on `crmBus` directly, so a `PUT { owner_id }` — which is now only legal as a self-assignment —
follows a different, unaudited path from the one the mutation layer designates for owner changes.
**This was not rerouted in this phase**, per the plan: the route layer is where ownership is decided
(Phase 25) and rerouting the write would widen a security fix past what one plan can verify. Recorded
here so it can be picked up as a mutation-layer/audit consistency item.

### 403 confirms the record exists

Deliberately accepted (T-48-01-07, CONTEXT). A `403` tells an unauthorized caller the id is real, where
a `404` would not. Phase 25 chose the stricter answer for webhooks. Changing `/api/v1` would contradict
SC-4 and is deferred with its own decision, not silently adopted here.

### The `assigneeId` column is not an ownership axis on this route

`activities` carries both `ownerId` and `assigneeId`. The guards compare `ownerId` only, matching
`pipelines/[id]/route.ts` and CONTEXT's owner-only decision. If assignees are ever meant to reach
activities assigned to them, that is a product decision needing its own criterion — it is not a gap in
this fix.

## Known Stubs

None. No hardcoded empty value, placeholder string, or unwired data source was introduced.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern or schema change was introduced; the
change removes reachable surface (three verbs and one field now refuse unauthorized callers) rather
than adding any. All seven entries in the plan's threat register are addressed: T-48-01-01 through
T-48-01-04 by the four guards, T-48-01-05 by control D's per-verb independence, T-48-01-06 by keeping
the `findFirst` `where` clauses free of `ctx.userId`, and T-48-01-07 accepted as recorded above.

## Commits

| Commit | Type | Description |
|---|---|---|
| `e6b6059` | `test` | RED — failing two-identity IDOR test for `activities/[id]` |
| `cb2f2f3` | `feat` | GREEN — authorize every verb per record, reject `owner_id` reassignment |
| (this file) | `docs` | SUMMARY with the RED transcript and the four control-D ablations |

TDD gate sequence satisfied: `test(...)` precedes `feat(...)` in git history. No `refactor` commit was
needed — the fix is 32 lines of guard with nothing to clean up.

## Self-Check: PASSED

- `src/app/api/v1/activities/[id]/__tests__/route.test.ts` — present (14.3K)
- `src/app/api/v1/activities/[id]/route.ts` — present (12.0K)
- `.planning/phases/48-rest-api-authorization/48-01-SUMMARY.md` — present (30.8K)
- commit `e6b6059` — present in `git log`
- commit `cb2f2f3` — present in `git log`

`STATE.md` and `ROADMAP.md` were deliberately NOT modified — the phase orchestrator owns those after
the wave.
