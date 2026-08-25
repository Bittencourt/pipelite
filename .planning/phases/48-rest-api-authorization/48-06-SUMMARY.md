---
phase: 48-rest-api-authorization
plan: 06
subsystem: api
tags: [authorization, sc-3, db-test, api-keys, two-user-fixture, anti-vacuity, negative-controls]

# Dependency graph
requires:
  - phase: 48-rest-api-authorization
    plan: 02
    provides: the scoped `conditions` initialiser in activities/route.ts that this plan proves behaviourally
  - phase: 48-rest-api-authorization
    plan: 01
    provides: the ownership guards on activities/[id] that assumption A1's PUT pair exercises
provides:
  - "mintApiKey — the repository's first API-key fixture, minting a real pk_live_ key whose sha256 digest is what gets stored, exercisable through the unmocked withApiAuth"
  - "SC-3 proven behaviourally against real PostgreSQL: floor, ceiling, discriminator and two-direction cross-check, with two real identities"
  - "A per-table LEFTOVER_PREDICATE teardown idiom, so a table without an `id` column gets a non-vacuous leftover check"
  - "Negative control D (scope ablated) and negative control E in two variants (single-owner, empty), recorded verbatim"
affects: [50 (export authorization — mintApiKey is the reusable half), 48-08 (Q10 gate, sibling)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-identity API-key fixture: mint a real key per user, drive route handlers with a real Authorization: Bearer header, mock nothing"
    - "Four-component counting gate: floor + ceiling + discriminator + two-direction cross-check, each a named integer literal shared by the seed and the assertion"
    - "Per-table LEFTOVER_PREDICATE map instead of a shared `id like` sweep, so a table keyed on something other than `id` is still checked"
    - "Ablation-as-RED, explicitly labelled: when the fix landed in an earlier wave, delete the fix, record the failure verbatim, restore, prove clean"

key-files:
  created:
    - src/app/api/v1/__tests__/api-key-fixture.ts
    - src/app/api/v1/activities/activities-scope.db.test.ts
    - .planning/phases/48-rest-api-authorization/deferred-items.md
  modified: []

key-decisions:
  - "Control E1 re-points the NAMED CONSTANTS as well as the seed (A_OWNED 7->10, B_OWNED 3->0), so the resulting red is the criterion failing on a single-owner dataset rather than a stale literal disagreeing with a new one"
  - "audit_log's leftover check is keyed on entity_id/actor_user_id, not id — its id is a generated UUID, so an id-prefix check would report zero however many rows leaked"
  - "activity_types added to TOUCHED_TABLES beyond the plan's four: the activities.type_id FK is NOT NULL, so the suite must create one, and an uncounted touched table is a hole in the baseline re-assert"
  - "The A1 PUT pair drives the REAL [id] handler for both the allowed and the refused direction, so the 403 half is a genuine cross-user request through real authentication"
  - "Header prose deliberately does not spell the mocking helper or the two destructive SQL statements — an acceptance counter its own prose satisfies proves nothing"

requirements-completed: [SEC-01]

# Metrics
duration: 19min
completed: 2026-08-25
---

# Phase 48 Plan 06: Behavioural SC-3 Proof Summary

**SC-3 now has a proof that can fail: two real users holding two real API keys drive the unmocked
`withApiAuth` against real PostgreSQL, and A's seven activities, B's three and the seeded ten are
three different numbers — so an unscoped query cannot satisfy the assertion, which is exactly what
the criterion could not say against a live dataset where all 79,022 rows belong to one person.**

## Performance

- **Duration:** ~19 min
- **Started:** 2026-08-25T23:25:28Z
- **Completed:** 2026-08-25T23:45Z
- **Tasks:** 3
- **Files created:** 2 source + 1 planning artifact; **files modified:** 0 source

## Task Commits

| # | Task | Commit | Type |
|---|------|--------|------|
| 1 | Two-user API-key fixture + isolated harness + authentication smoke | `56ea4c8` | test |
| 2 | SC-3's floor, ceiling, discriminator and cross-check | `de9c893` | test |
| — | Rule 1 fix: static `node:crypto` import (suite-hook-hygiene caught a dynamic one) | `18c6e56` | fix |
| — | Rule 2 fix: header prose no longer satisfies its own acceptance counters | `d382922` | docs |
| 3 | Control E, two variants | control experiment — **no source change**; the deliverable is the transcripts below, and the tree was verified byte-identical afterwards |

---

## 1. What was built

### `src/app/api/v1/__tests__/api-key-fixture.ts` (103 lines)

`mintApiKey({ id, userId, name })` generates `"pk_live_" + randomBytes(32).toString("base64url")`,
computes `createHash("sha256").update(fullKey).digest("hex")`, inserts an `api_keys` row with the
caller-supplied id, the first 12 characters as `key_prefix` and the digest as `key_hash`, and returns
the plaintext plus a ready-made `Authorization: Bearer …` string.

**There was zero precedent for this in the repository.** Nothing under `src/` or `e2e/` referenced
`apiKeys` or `api_keys` outside the production modules themselves. Every `/api/v1` test authenticated
by mocking `@/lib/api/auth` — which is the mechanism by which SEC-48-B happened.

Three properties are deliberate and documented in the file:

- **The recipe is transcribed from `src/lib/api-keys.ts:21-48`, not remembered.** `validateApiKey`
  rejects anything not starting with `pk_live_` *before* hashing, and then looks the key up **by its
  digest** — so a fixture that got either half wrong would authenticate nothing.
- **The plaintext is returned because it is unrecoverable from the row.** Only the digest is stored.
  A fixture that returned just the row could not build a header, and a test written against it would
  have to reach for a mock.
- **The caller supplies the id.** `api_keys.id` has a `$defaultFn`, but letting it fire would produce
  an unprefixed UUID that a prefix-scoped teardown cannot find.

The test file asserts the storage model rather than trusting it: `keyHash` equals a recomputed sha256
of the plaintext, is **not** the plaintext, `keyPrefix` is the first 12 characters, and `deletedAt` is
null (a non-null value makes `validateApiKey` return null, i.e. authenticate nothing).

### `src/app/api/v1/activities/activities-scope.db.test.ts` (632 lines, 23 tests)

Nothing is mocked. `@/lib/api/auth` in particular is real: the wrapper is part of what is under test,
because `ctx.userId` is the value the scope predicate binds, and a test that supplies that value
itself has assumed the answer.

| Group | Tests | What it establishes |
|---|---|---|
| Connection guard | 4 | refuses `pipelite` by name, refuses a non-loopback host, refuses an unset URL, **and accepts the real one** (a guard that threw on everything would satisfy the first three) |
| Fixture set | 3 | exactly 10 prefixed activities, exactly 2 users and 2 api_keys, digest-not-plaintext storage |
| Authentication | 5 | minted key → 200; fabricated Bearer → 401; non-`pk_live_` token → 401; no header → 401; **and the identity that reaches the route is the key's user** |
| SC-3 | 8 | ceiling, floor, discriminator ×2, cross-check ×2, page/total agreement, narrowing filter |
| Assumption A1 | 3 | A's PUT on A's row → 200; B's PUT on A's row → 403 with title/owner/`updated_at` unchanged; the list afterwards still holds exactly A's seven |

---

## 2. Why SC-3 had to be amended before it could be asserted — the vacuity, in this repository

`select owner_id, count(*) from activities group by 1` on the live `pipelite` database returns **one
row**. All **79,022** activities belong to a single user, who is an admin. For the only user with any
data, a correctly scoped query and a completely unscoped query return the same number. **The original
criterion was satisfied today, by the broken route.** It could not fail.

The amended criterion names four components. All four are asserted, each with a named integer literal
shared by the seed and the assertion so the two cannot drift:

| Component | Assertion | Number |
|---|---|---|
| **CEILING** | A's `meta.total` equals a direct SQL `count(*) where owner_id = A and deleted_at is null` | `A_OWNED = 7` |
| **FLOOR** | that number is `> 0`, asserted separately with an explanatory message | `> 0` |
| **DISCRIMINATOR 1** | A's total is **not** the seeded global total, itself confirmed by direct SQL | `7 ≠ 10` |
| **DISCRIMINATOR 2** | B's total is 3, is above the floor, and is not the global total | `3 ≠ 10` |
| **CROSS-CHECK dir 1** | A's response id set **is exactly** A's seeded set and contains none of B's — **while direct SQL confirms B's rows exist** | 7 present, 3 absent-but-existing |
| **CROSS-CHECK dir 2** | the same with A and B exchanged | 3 present, 7 absent-but-existing |

Absence alone proves nothing (the query might be broken); presence alone proves nothing (the row might
be visible to everyone). Only the pair is a proof, which is why it is asserted in both directions.

**The plan's `must_haves` truths, checked one by one:**

- Two distinct users each holding a real key authenticating through the unmocked `withApiAuth` — yes,
  and the 401 cases prove the authentication is real rather than permissive.
- A's total is the named literal 7, B's is 3, the seeded total is 10 — yes.
- Floor holds — yes, and control E2 proves it can fail.
- Discriminator holds — yes, and control E1 proves it can fail.
- Cross-check holds by direct SQL in both directions — yes.
- Reverting the one-line scope reddens the ceiling, the discriminator and the cross-check — yes, §4.
- A single-owner dataset makes the discriminator fail — yes, §5, and it also shows the **ceiling still
  passing**.
- Row counts identical before and after, table by table — yes, §6.

---

## 3. The safety proof: this file cannot be pointed at the operator's data (Task 1 CLI acceptance)

`assertIsolatedConnection` is invoked at **module scope** (line 151), not inside a hook, so a wrong
target aborts COLLECTION.

**Transcript, run deliberately with `E2E_DATABASE_URL` cleared so `DATABASE_URL` falls through to
`.env`'s `postgresql://pipelite:pipelite@localhost:5433/pipelite`:**

```
$ E2E_DATABASE_URL= ./node_modules/.bin/vitest run --config vitest.db.config.ts \
    src/app/api/v1/activities/activities-scope.db.test.ts

 RUN  v4.1.11 /home/pedro/programming/pipelite/.claude/worktrees/agent-a1d324e4f204f753f

 ❯ |db| src/app/api/v1/activities/activities-scope.db.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |db| src/app/api/v1/activities/activities-scope.db.test.ts [ src/app/api/v1/activities/activities-scope.db.test.ts ]
Error: refusing to run: connection names database "pipelite", not "pipelite_dedup_test". "pipelite" is the DEVELOPMENT database and holds 79,022 real activities; this suite hard-deletes its fixtures and must never be pointed at it. Run `npm run test:db`.
 ❯ assertIsolatedConnection src/app/api/v1/activities/activities-scope.db.test.ts:136:11
    134|
    135|   if (database !== TEST_DATABASE) {
    136|     throw new Error(
       |           ^
    137|       `refusing to run: connection names database "${database}", not "…
    138|         (database === DEV_DATABASE
 ❯ src/app/api/v1/activities/activities-scope.db.test.ts:149:1

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

 Test Files  1 failed (1)
      Tests  no tests
   Start at  20:29:30
   Duration  1.53s (transform 480ms, setup 0ms, import 0ms, tests 0ms, environment 0ms)
```

### "…and issues no statement" — measured, not asserted

`(0 test)` / `Tests no tests` / `tests 0ms` establishes that no test body and no hook ran. The
remaining question is whether the ONE thing `src/db/index.ts` does at module evaluation —
`postgres(connectionString)` at `:11` — opens a backend before the guard throws. **It does not:**

```
$ node /tmp/p4806-lazy-probe.mjs &          # constructs postgres(url) with
                                            # ?application_name=p4806-lazy-probe, issues no query
client constructed; issuing no query; holding for 8s

$ docker exec pipelite-postgres-1 psql -U pipelite -d postgres -tAc \
    "select count(*) from pg_stat_activity where application_name = 'p4806-lazy-probe'"
0
```

Zero backends. Corroborated at the transaction level: `pg_stat_database.xact_commit` for `pipelite`
moved **+8** across the refused run, against **+10** of pure ambient application traffic measured over
an identical window with the correctly targeted run — i.e. indistinguishable from the app container's
own health checks.

---

## 4. Control D — the ablation, and it IS SC-3's RED-first evidence

**LABELLED AN ABLATION, NOT A NATURAL RED, DELIBERATELY.** Plan 48-02 landed the fix in wave 1, so
this criterion could not be observed red in its natural order — the route was already correct before
this file existed. Skipping the observation was the alternative; making it deliberately is what was
done instead. **This transcript is the RED-first evidence for SC-3, and it is the only such evidence
that exists.** 48-02's own summary says so in as many words: its rendered-predicate assertions are a
compiled-structure claim and "no assertion in this file may be cited as evidence that ROADMAP SC-3
holds."

**Ablation:** `src/app/api/v1/activities/route.ts:62` reverted from
`const conditions = [isNull(activities.deletedAt), eq(activities.ownerId, ctx.userId)]`
to `const conditions = [isNull(activities.deletedAt)]`.

```
 RUN  v4.1.11 /home/pedro/programming/pipelite/.claude/worktrees/agent-a1d324e4f204f753f

 ❯ |db| src/app/api/v1/activities/activities-scope.db.test.ts (23 tests | 9 failed) 326ms
     × the identity that reaches the route is the key's user, not anything from the request 28ms
     × CEILING: A's meta.total equals a direct SQL count scoped to A, and that number is 7 9ms
     × DISCRIMINATOR 1: A's total is NOT the seeded global total of 10 9ms
     × DISCRIMINATOR 2: B's total is 3, is above the floor, and is not the global total 8ms
     × CROSS-CHECK direction 1: A sees exactly A's ids, none of B's — while B's rows DO exist 9ms
     × CROSS-CHECK direction 2: B sees exactly B's ids, none of A's — while A's rows DO exist 6ms
     × PAGE AND TOTAL AGREE: with a limit above 7, A's data.length is 7 and equals meta.total 8ms
     × NARROWING FILTER: A asking for ?owner_id=<B> gets 200 with total 0 and an empty page 6ms
     × the list A reads afterwards still holds exactly A's seven, so the writes above leaked nothing 5ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 9 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  … > the identity that reaches the route is the key's user, not anything from the request
AssertionError: expected Set{ 'actscope-user-b', …(1) } to deeply equal Set{ 'actscope-user-a' }

- Expected
+ Received

  Set {
    "actscope-user-a",
+   "actscope-user-b",
  }

 ❯ src/app/api/v1/activities/activities-scope.db.test.ts:438:54

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/9]⎯

 FAIL  … > CEILING: A's meta.total equals a direct SQL count scoped to A, and that number is 7
AssertionError: expected 10 to be 7 // Object.is equality

- Expected
+ Received

- 7
+ 10

 ❯ src/app/api/v1/activities/activities-scope.db.test.ts:472:32
    470|     const direct = await sqlCountOwnedBy(USER_A)
    471|
    472|     expect(payload.meta.total).toBe(direct)
       |                                ^

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/9]⎯

 FAIL  … > DISCRIMINATOR 1: A's total is NOT the seeded global total of 10
AssertionError: expected 10 not to be 10 // Object.is equality
 ❯ src/app/api/v1/activities/activities-scope.db.test.ts:499:36

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/9]⎯

 FAIL  … > DISCRIMINATOR 2: B's total is 3, is above the floor, and is not the global total
AssertionError: expected 10 to be 3 // Object.is equality

- Expected
+ Received

- 3
+ 10

 ❯ src/app/api/v1/activities/activities-scope.db.test.ts:507:32

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/9]⎯

 FAIL  … > CROSS-CHECK direction 1: A sees exactly A's ids, none of B's — while B's rows DO exist
AssertionError: expected [ 'actscope-act-a-1', …(9) ] to deeply equal [ 'actscope-act-a-1', …(6) ]

- Expected
+ Received

@@ -4,6 +4,9 @@
    "actscope-act-a-3",
    "actscope-act-a-4",
    "actscope-act-a-5",
    "actscope-act-a-6",
    "actscope-act-a-7",
+   "actscope-act-b-1",
+   "actscope-act-b-2",
+   "actscope-act-b-3",
  ]

 ❯ src/app/api/v1/activities/activities-scope.db.test.ts:517:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/9]⎯

 FAIL  … > CROSS-CHECK direction 2: B sees exactly B's ids, none of A's — while A's rows DO exist
AssertionError: expected [ 'actscope-act-a-1', …(9) ] to deeply equal [ 'actscope-act-b-1', …(2) ]

- Expected
+ Received

  [
+   "actscope-act-a-1",
+   "actscope-act-a-2",
+   "actscope-act-a-3",
+   "actscope-act-a-4",
+   "actscope-act-a-5",
+   "actscope-act-a-6",
+   "actscope-act-a-7",
    "actscope-act-b-1",
    "actscope-act-b-2",
    "actscope-act-b-3",
  ]

 ❯ src/app/api/v1/activities/activities-scope.db.test.ts:532:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/9]⎯

 FAIL  … > PAGE AND TOTAL AGREE: with a limit above 7, A's data.length is 7 and equals meta.total
AssertionError: expected [ …(10) ] to have a length of 7 but got 10

- Expected
+ Received

- 7
+ 10

 ❯ src/app/api/v1/activities/activities-scope.db.test.ts:546:26

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/9]⎯

 FAIL  … > NARROWING FILTER: A asking for ?owner_id=<B> gets 200 with total 0 and an empty page
AssertionError: expected 3 to be +0 // Object.is equality

- Expected
+ Received

- 0
+ 3

 ❯ src/app/api/v1/activities/activities-scope.db.test.ts:556:32

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[8/9]⎯

 FAIL  … > the list A reads afterwards still holds exactly A's seven, so the writes above leaked nothing
AssertionError: expected 10 to be 7 // Object.is equality

- Expected
+ Received

- 7
+ 10

 ❯ src/app/api/v1/activities/activities-scope.db.test.ts:615:32

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[9/9]⎯


 Test Files  1 failed (1)
      Tests  9 failed | 14 passed (23)
```

The ceiling receiving **10 against expected 7**, and both cross-checks returning the union of both
owners' id sets, is the exploit itself: user B's records handed to user A over the public REST API.

**Two things this transcript says that are worth reading carefully:**

1. **The FLOOR did not fail, and should not have.** A's total went to 10, which is still `> 0`. The
   floor is not a scope detector — it is an anti-vacuity detector, and it fires in control E2 instead.
   Reporting it as a scope detector would be a claim this evidence does not support.
2. **The narrowing filter reddened too.** `?owner_id=<B>` returned B's three rows to A. That is 48-02's
   "the filter can only narrow" claim, previously asserted by counting `"owner_id"` occurrences in
   rendered SQL, now observed behaviourally.

**Restored:** `git checkout -- src/app/api/v1/activities/route.ts`, then
`git diff --exit-code -- src/app/api/v1/activities/route.ts` → **exit 0**, and the file re-ran
**23 passed (23)**.

---

## 5. Control E — the criterion pointed at datasets that cannot discriminate

Both variants change **only** the three named seed constants at
`activities-scope.db.test.ts:175-177`. The whole seed is derived from them, so an E-variant transcript
describes a change to the DATA and never an accidental change to an assertion. Neither variant was
committed.

### E1 — single owner: A owns all 10, B owns none

`A_OWNED = 10`, `B_OWNED = 0`, `SEEDED_TOTAL = 10`.

```
 ❯ |db| src/app/api/v1/activities/activities-scope.db.test.ts (23 tests | 3 failed) 301ms
     × the identity that reaches the route is the key's user, not anything from the request 28ms
     × DISCRIMINATOR 1: A's total is NOT the seeded global total of 10 9ms
     × DISCRIMINATOR 2: B's total is 0, is above the floor, and is not the global total 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  … > the identity that reaches the route is the key's user, not anything from the request
AssertionError: expected Set{} to deeply equal Set{ 'actscope-user-b' }

- Expected
+ Received

- Set {
-   "actscope-user-b",
- }
+ Set {}

 ❯ src/app/api/v1/activities/activities-scope.db.test.ts:439:54

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  … > DISCRIMINATOR 1: A's total is NOT the seeded global total of 10
AssertionError: expected 10 not to be 10 // Object.is equality
 ❯ src/app/api/v1/activities/activities-scope.db.test.ts:499:36
    497|
    498|     expect(seededGlobal).toBe(SEEDED_TOTAL)
    499|     expect(payload.meta.total).not.toBe(seededGlobal)
       |                                    ^
    500|     expect(payload.meta.total).toBe(A_OWNED)
    501|   })

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  … > DISCRIMINATOR 2: B's total is 0, is above the floor, and is not the global total
AssertionError: expected 0 to be greater than 0
 ❯ src/app/api/v1/activities/activities-scope.db.test.ts:509:32
    507|     expect(payload.meta.total).toBe(direct)
    508|     expect(payload.meta.total).toBe(B_OWNED)
    509|     expect(payload.meta.total).toBeGreaterThan(0)
       |                                ^
    510|     expect(payload.meta.total).not.toBe(SEEDED_TOTAL)
    511|   })

 Test Files  1 failed (1)
      Tests  3 failed | 20 passed (23)
```

**THE POINT OF E1, and it is in the passing list rather than the failing one: the CEILING for user A
PASSED.** `CEILING: A's meta.total equals a direct SQL count scoped to A` is not among the three
failures, because 10 equals 10. **That is the original, unamended criterion, demonstrated passing on a
dataset that proves nothing — in this repository, with this test file, rather than argued from the
production row counts.** It is the same shape as the live `pipelite` distribution: one owner, so
scoped equals unscoped, so a correct route and a broken route are indistinguishable.

Only two things caught it: **discriminator 1** (A's number is the global number) and **the floor on B**
(the second owner has nothing).

**One prediction in the plan did not hold, and the correction strengthens the conclusion.** The plan
expected cross-check direction 2 to redden. It **passed**. With B owning nothing, `B_ACTIVITY_IDS` is
empty, so "B's response equals B's seeded id set" is `[] === []`, "contains none of A's" is trivially
true, and even the presence anchor `sqlIdsOwnedBy(USER_A)` is satisfied. **A cross-check goes vacuous
the moment one side is empty.** The floor is the only thing standing between that and a green tick.

### E2 — empty dataset: neither user owns anything

`A_OWNED = 0`, `B_OWNED = 0`, `SEEDED_TOTAL = 0` — the assertions re-pointed at the new dataset too,
so every red below is the criterion failing rather than a stale literal disagreeing.

```
 ❯ |db| src/app/api/v1/activities/activities-scope.db.test.ts (23 tests | 6 failed) 344ms
     × the identity that reaches the route is the key's user, not anything from the request 26ms
     × FLOOR: A's own count is greater than zero — an empty response must FAIL, not pass 6ms
     × DISCRIMINATOR 1: A's total is NOT the seeded global total of 0 8ms
     × DISCRIMINATOR 2: B's total is 0, is above the floor, and is not the global total 12ms
     × A updating A's own activity returns 200 and changes the title 6ms
     × B attempting the same write on A's activity is refused with 403 and changes nothing 1ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 6 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  … > FLOOR: A's own count is greater than zero — an empty response must FAIL, not pass
AssertionError: an empty response proves nothing: every 'contains no foreign row' assertion in this file is satisfied by a response containing no rows at all. The floor is what makes them mean something.: expected 0 to be greater than 0
 ❯ src/app/api/v1/activities/activities-scope.db.test.ts:485:7
    483|         "is satisfied by a response containing no rows at all. The flo…
    484|         "something.",
    485|     ).toBeGreaterThan(0)
       |       ^
    486|   })

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/6]⎯

 FAIL  … > DISCRIMINATOR 1: A's total is NOT the seeded global total of 0
AssertionError: expected +0 not to be +0 // Object.is equality
 ❯ src/app/api/v1/activities/activities-scope.db.test.ts:499:36

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/6]⎯

 FAIL  … > DISCRIMINATOR 2: B's total is 0, is above the floor, and is not the global total
AssertionError: expected 0 to be greater than 0
 ❯ src/app/api/v1/activities/activities-scope.db.test.ts:509:32

 Test Files  1 failed (1)
      Tests  6 failed | 17 passed (23)
```

(The two A1 failures are incidental: with no activities seeded, `A_ACTIVITY_IDS[0]` is `undefined` and
postgres.js raises `UNDEFINED_VALUE`. They are not evidence about the criterion.)

**THE POINT OF E2 is again in the passing list.** On a completely empty dataset, **the CEILING, BOTH
CROSS-CHECKS, PAGE-AND-TOTAL and the NARROWING FILTER all passed.** Every "contains no foreign row"
assertion in the file is satisfied by a response containing no rows at all. **If the floors were
removed, an empty database would give this file 21 of 23 green.**

### The conclusion the two variants establish

| Component alone | Satisfied by |
|---|---|
| **Ceiling alone** | a single-owner dataset (E1) — and therefore by an unscoped query, and therefore by the broken route on the live `pipelite` distribution |
| **Floor alone** | any non-empty result, including one containing every user's rows (control D: A's total went to 10 and the floor stayed green) |
| **Cross-check alone** | an empty dataset (E2), and a single-owner dataset in the direction whose side is empty (E1) |
| **All four together** | only a route that is actually scoped |

That is why the ROADMAP criterion was amended. Any future plan that keeps one component and drops the
others has restored the vacuity, and E1/E2 are the transcripts to re-run to see it.

---

## 6. The isolated database is byte-count-identical to how it was found

**The mechanism, and why it is stronger than a prefix sweep.** `afterAll` runs two halves per table:
zero prefixed leftovers **and** `count(*)` equal to the baseline recorded in `beforeAll`. The second
half is what catches a pre-existing row that was **mutated** rather than created — a prefix query
cannot see one. Both halves ran green after every variant above, including after the two E variants
and after both ablations.

`TOUCHED_TABLES` is `users`, `api_keys`, `activity_types`, `activities`, `audit_log`.

`audit_log` is included because it is written by a subscriber rather than by the route, so it is the
table a fixture sweep is most likely to forget — research's own live reproduction produced 5
`audit_log` rows from 6 requests. Its leftover check is keyed on `entity_id` / `actor_user_id`, **not**
`id`, because `audit_log.id` is a generated UUID and an id-prefix check there would report zero however
many rows leaked. (In this test process the subscriber is never registered — `registerAuditSubscriber`
runs from `instrumentation.ts`, not from vitest — so the observed count is zero, and the predicate is
correct rather than merely lucky.)

**Post-run catalog query, isolated database:**

```
$ docker exec pipelite-postgres-1 psql -U pipelite -d pipelite_dedup_test -tAc "…"
test-db users 0 api_keys 0 activities 0 activity_types 0 audit_log 0
```

**The live `pipelite` database, before and after this plan — nothing created, nothing removed,
nothing to clean up, because nothing was ever written there:**

| Table | Research baseline | Before 48-06 | After 48-06 |
|---|---|---|---|
| `activities` | 79,022 | **79,022** | **79,022** |
| `stages` | 73 | **73** | **73** |
| `pipelines` | 12 | **12** | **12** |
| `users` | 10 | **10** | **10** |
| `api_keys` | 8 | **8** | **8** |

```
$ docker exec pipelite-postgres-1 psql -U pipelite -d pipelite -tAc "…"
activities 79022 / stages 73 / pipelines 12 / users 10 / api_keys 8
actscope leftovers in LIVE: 0 / 0 / 0
```

**Exactly what this plan created, and where:** in `pipelite_dedup_test` only — 2 `users`
(`actscope-user-a`, `actscope-user-b`), 2 `api_keys` (`actscope-key-a`, `actscope-key-b`), 1
`activity_types` row (`actscope-type-task`) and 10 `activities` (`actscope-act-a-1…7`,
`actscope-act-b-1…3`), created and deleted on every run. **In `pipelite`: nothing.** The plan's
constraint 1 forbids seeding a second owner there to make the assertion discriminate, and
`assertIsolatedConnection` is the mechanism that makes that impossible rather than merely discouraged
(§3).

Note that the isolated database is *also* dropped and rebuilt from a schema-only dump by
`scripts/dedup-db-test-setup.sh` on every `npm run test:db`, so the fixture discipline is belt and
braces. The dump is read-only on the source.

---

## 7. Verification evidence

| Check | Command | Result |
|---|---|---|
| Plan's db test | `vitest run --config vitest.db.config.ts src/app/api/v1/activities/activities-scope.db.test.ts` | **23 passed (23)** |
| Whole db project | `npm run test:db` | **73 passed (73)**; `Test Files 1 failed \| 2 passed (3)` — the one failure is **pre-existing** in `queries.db.test.ts`'s teardown, see DEF-48-01 |
| Base suite | `npm test` | **177 passed \| 2 skipped (179) files; 5311 passed \| 32 skipped** — **exactly the post-wave-1 baseline, zero delta** |
| RSC project | `npm test` (second project) | **2 files, 8 passed** |
| Typecheck | `./node_modules/.bin/tsc --noEmit` | **exit 0**, no output |
| Lint | `npm run lint` | **0 errors**, 120 warnings — none in either file of this plan |
| Tree clean after every ablation and variant | `git diff --exit-code` | **exit 0** |
| Route restored | `git diff --exit-code -- src/app/api/v1/activities/route.ts` | **exit 0** |
| Mocking helper occurrences | `node -e` over the db test | **0** |
| Destructive-SQL token occurrences | `node -e` over the db test | **0** |
| `assertIsolatedConnection` at module scope | `node -e` | invoked at **line 151**, top level |
| Isolated db empty afterwards | catalog query, 5 tables | **0 / 0 / 0 / 0 / 0** |
| Live db unchanged | catalog query, 5 tables | **79022 / 73 / 12 / 10 / 8** |

**`npm test` does not execute this file, proven non-vacuously.** The base suite total is *identical*
to the post-wave-1 baseline — 177 files, 5311 passed, 32 skipped. A `*.db.test.ts` that had leaked into
the base project would have added files and tests to that count, and would then have failed for want
of a provisioned database. `vitest.db.config.ts:102` already included the glob and `vitest.config.ts:28`
already excluded it, so **zero config changes were made**, and `db-test-isolation.test.ts` — which
iterates every npm script asserting none but `test:db` mentions `test:db`/`db.config` — is green inside
that 5311. No npm script was added.

Counts were recomputed with `node -e`; `grep … | wc -l` was not used, and cleanliness was verified with
`git diff --exit-code` rather than `git status --porcelain` (which renders as the token `ok` under
`rtk`).

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A dynamic `import()` in a test body broke the base suite**
- **Found during:** Task 3 verification (`npm test`)
- **Issue:** the digest self-check recomputed the hash with
  `(await import("node:crypto")).createHash(...)`. `src/lib/__tests__/suite-hook-hygiene.test.ts`
  forbids a dynamic `import()` in a test body — a lazy module load inside a timed body charges the
  first test that reaches it — and it caught this: `5310 passed | 1 failed` against the 5311 baseline.
  The plan's own constraints said "use static top-level imports only"; this was a genuine miss, and the
  repo's hygiene gate is what found it. **Worth recording as a positive datapoint in a milestone about
  gates that cannot fail: this one could, and did.**
- **Fix:** hoisted to a static `import { createHash } from "node:crypto"`, with a comment naming the
  gate so the next reader does not reintroduce it.
- **Verification:** base suite back to **177 files / 5311 passed / 32 skipped**; db test 23/23.
- **Committed in:** `18c6e56`

**2. [Rule 2 - Missing critical] The header prose satisfied the acceptance counters it described**
- **Found during:** Task 3, pre-SUMMARY source verification
- **Issue:** Task 1's acceptance criterion is "the file contains no `vi.mock` at all". The header
  sentence asserting exactly that **spelled the token**, so `node -e` reported **1** where the
  criterion requires **0**. The same applied to the fixture-discipline sentence naming the two
  destructive SQL statements it swears the file does not use (2 occurrences). This collision class has
  fired 15+ times in this repo and hit plan 48-02 on this same phase.
- **Fix:** both sentences reworded to describe the property without spelling the token, each stating in
  the file *why* it does not spell it.
- **Verification:** `node -e` recounts **0** and **0**; 23 tests still pass; `tsc` clean.
- **Committed in:** `d382922`

**3. [Rule 2 - Missing critical] `activity_types` added to `TOUCHED_TABLES`**
- **Found during:** Task 1
- **Issue:** the plan named four tables (`activities`, `api_keys`, `users`, `audit_log`).
  `activities.type_id` is `NOT NULL` and references `activity_types`, so the suite **must** create a
  row there. A touched table absent from the baseline set is a hole in the very guarantee `afterAll`
  exists to give — its `count(*)` would never be re-asserted.
- **Fix:** added to `TOUCHED_TABLES`, to `LEFTOVER_PREDICATE` and to `removeFixtures` in foreign-key
  order (after activities, before users).
- **Verification:** post-run catalog query reports `activity_types 0`.
- **Committed in:** `56ea4c8`

**4. [Rule 2 - Missing critical] Per-table `LEFTOVER_PREDICATE` instead of a shared `id like` sweep**
- **Found during:** Task 1
- **Issue:** the idiom copied from `queries.db.test.ts` runs `where id::text like 'prefix-%'` against
  every touched table. `audit_log.id` is a generated UUID, so that check reports **zero however many
  rows leaked** — a vacuous half of the assertion that is supposed to catch a leak, inside a phase
  whose whole subject is assertions that cannot fail.
- **Fix:** a `Record<table, SQL>` of per-table recognition predicates; `audit_log`'s is
  `entity_id like … or actor_user_id like …`.
- **Side effect worth noting:** the same structural flaw is what makes `queries.db.test.ts` throw in
  teardown today (DEF-48-01) — it issues an `id`-keyed query against `saved_view_defaults`, which has
  no `id` column.
- **Committed in:** `56ea4c8`

### Deviations of record (no fix required)

**5. Control E1's prediction was wrong in a way that strengthens the finding.** The plan expected
cross-check direction 2 to redden on a single-owner dataset. It **passed** — vacuously, because with
B owning nothing both its "equals B's set" and "contains none of A's" halves are satisfied by an empty
response. Recorded in §5 rather than papered over: it means the cross-check is *not* self-anchoring and
the floor is doing more work than the plan credited it with.

**6. Tasks 1 and 2 authored one file in a single pass, then committed at the plan's task boundaries.**
The SC-3 and A1 blocks were split out, the harness-only state was run (`12 passed (12)`), typechecked
and linted, and committed as `56ea4c8`; the assertion blocks were then re-added, re-run
(`23 passed (23)`) and committed as `de9c893`. Both commits describe their tree accurately and both
runs are real, but the authoring order was not two passes and this summary should not be read as
claiming it was.

**7. Control D and control E transcripts were re-captured after the two fix commits** so their quoted
line numbers match the committed file. The earlier captures were identical in content.

---

**Total deviations:** 4 auto-fixed (1 bug, 3 missing critical) + 3 recorded. No file outside the plan's
`files_modified` was changed, and `src/app/api/v1/activities/route.ts` — the one pre-existing source
file in that list — is byte-identical to its wave-1 state (`git diff --exit-code` exit 0).

## Issues Encountered

- **`npm run test:db` exits non-zero on a fully green suite.** `queries.db.test.ts`'s `afterAll`
  issues an `id`-keyed leftover query against `saved_view_defaults`, which has no `id` column
  (`42703`). All 28 of its assertions pass; only the teardown throws. Proven pre-existing (last
  commit `f097b5b`, Phase 40) and reproduced with that file run alone, so none of 48-06's files were
  loaded. Out of scope per the executor scope boundary — logged as **DEF-48-01** in
  `deferred-items.md` with the fix, and flagged there because **any future plan gating on
  `npm run test:db`'s exit code will read a green suite as red.**
- **A soft-deleted user's API key still authenticates.** `validateApiKey` checks `apiKeys.deletedAt`
  but never reads `users.deletedAt` or `users.status`. Found while transcribing the fixture recipe;
  already noted by 48-RESEARCH § Q2 as out of scope. Logged as **DEF-48-02**.
- **Worktree base was stale** (29/29 as recorded in project memory). Fixed with
  `git merge --ff-only e29ab2f`, never `reset --hard`.
- **`rtk` mangled `grep -v '"level"'`** into a match report rather than an inverse filter, so every
  transcript in this document was extracted with `node -e` instead. Consistent with the recorded
  hazard list.

## Threat Model — dispositions delivered

| Threat ID | Mitigation as shipped |
|---|---|
| T-48-06-01 (foreign rows disclosed) | two-direction cross-check against direct SQL through the real auth wrapper; ablation-proven in §4 — 9 of 23 tests red |
| T-48-06-02 (both sides empty) | named-integer floors on **both** users, asserted separately with explanatory messages; **control E2 demonstrates the failure mode and shows 21/23 would be green without them** |
| T-48-06-03 (single-owner dataset) | a seeded two-owner discriminator; **control E1 demonstrates the ceiling alone passing a single-owner dataset** |
| T-48-06-04 (admin bypass) | both fixture users are role `member`, status `approved`; no bypass exists in the route and none was added |
| T-48-06-05 (fixture code hits `pipelite`) | module-scope `assertIsolatedConnection`, refusing non-loopback hosts and any database but `pipelite_dedup_test`, naming `pipelite` so it is refused by name; proven by a deliberate misconfigured run **and** by a probe showing `postgres(url)` opens no backend (§3) |
| T-48-06-06 (a row mutated, not created) | `afterAll` asserts `count(*)` equals the recorded baseline per table, not merely that prefixed rows are gone |
| T-48-06-07 (plaintext key persisted) | keys generated per run with `randomBytes`, never written to a file, rows deleted in `afterAll`; the test asserts the row holds the **digest** and **not** the plaintext |
| T-48-06-08 (db suite entering CI) | file is `*.db.test.ts`, **zero config changes**, base-suite count unchanged at 5311 proving non-execution, `db-test-isolation.test.ts` green, no npm script added |
| T-48-06-09 (`crmBus` side effects escaping teardown) | `audit_log` in `TOUCHED_TABLES` with a non-`id` leftover predicate; assumption A1 asserted by a real PUT pair (200 and 403) plus the baseline re-assert |

## Threat Flags

None. This plan created no network endpoint, no auth path, no file access and no schema change. Both
files are tests; the one production-path file in `files_modified`
(`src/app/api/v1/activities/route.ts`) was ablated and restored byte-identical.

## Known Stubs

None.

## Next Phase Readiness

- **`mintApiKey` is exported and reusable.** Phase 50's export-authorization work (SEC-03) needs the
  same two-identity setup against `/api/v1`; that is why the fixture lives in
  `src/app/api/v1/__tests__/` rather than beside one test file, and the header says so.
- **A working recipe now exists for any `/api/v1` behavioural authorization test** — real key, real
  wrapper, isolated database, baseline-plus-prefix teardown with a per-table leftover predicate. The
  next route that needs proving does not have to rediscover it.
- **48-08 (Q10) is unaffected by this plan.** No route source changed. The scope token
  `eq(activities.ownerId, ctx.userId)` still occurs exactly once in `activities/route.ts` and still
  does not appear in any comment.
- **Not closed by this plan:** the stages list scope (SC-5, F3 — a sibling plan owns
  `stages-scope.db.test.ts`), and the two deferred items above.
- **A warning for whoever gates on it:** `npm run test:db` currently exits non-zero even when every
  test passes (DEF-48-01). Gate on the reported test counts, or fix that teardown first.

## Self-Check: PASSED

Files:
- FOUND: `src/app/api/v1/__tests__/api-key-fixture.ts`
- FOUND: `src/app/api/v1/activities/activities-scope.db.test.ts`
- FOUND: `.planning/phases/48-rest-api-authorization/deferred-items.md`
- FOUND: `.planning/phases/48-rest-api-authorization/48-06-SUMMARY.md`

Commits:
- FOUND `56ea4c8` — `test(48-06): mint two real API keys and prove the isolated db harness`
- FOUND `de9c893` — `test(48-06): assert SC-3's floor, ceiling, discriminator and cross-check`
- FOUND `18c6e56` — `fix(48-06): static node:crypto import, not a dynamic one in a test body`
- FOUND `d382922` — `docs(48-06): stop the header prose satisfying its own acceptance counters`

STATE.md and ROADMAP.md were deliberately NOT modified — the orchestrator owns those after the wave.

---
*Phase: 48-rest-api-authorization*
*Completed: 2026-08-25*
