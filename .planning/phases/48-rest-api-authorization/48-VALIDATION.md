---
phase: 48
slug: rest-api-authorization
status: signed-off
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-25
signed_off: 2026-08-26
---

# Phase 48 — Validation Strategy

> Derived from `48-RESEARCH.md` § Validation Architecture and `48-PATTERNS.md`.
> **This phase fixes a live security defect.** A test that cannot fail here does not merely waste a
> re-run — it converts an open hole into an open hole with a green tick beside it.

---

## Test Infrastructure

| Property | Value |
|---|---|
| **Framework** | vitest 4.1.11, three projects |
| **Base (runs in CI)** | `vitest.config.ts` — excludes `*.rsc.test.*` and `*.db.test.*` |
| **DB (NOT in CI)** | `vitest.db.config.ts` — includes `src/**/*.db.test.*`, `fileParallelism: false`, 60 s timeouts. Must stay out of `npm test`; `db-test-isolation.test.ts` enforces it |
| **Baseline** | `172 passed / 2 skipped` files, **5237 passed / 32 skipped**, ~58 s |
| **DB suite** | `npm run test:db` (provisions `pipelite_dedup_test` first) |
| **Gate on** | lint **ERRORS (0)**, never a warning total — it differs between repo and worktree |
| **Container gate** | `docker compose up -d --build` then `/api/health` 200 with all processors |

---

## Requirements → Test Map

| Req | Behaviour | Type | Command | Exists? |
|---|---|---|---|---|
| SEC-01 SC-1a | GET `/activities/[id]`: non-owner → 403; **owner → 200** | unit | `npx vitest run "src/app/api/v1/activities/[id]/__tests__/route.test.ts"` | ❌ W0 |
| SEC-01 SC-1b | PUT: non-owner → 403 **and no `db.update` call** | unit | same | ❌ W0 |
| SEC-01 SC-1c | DELETE: non-owner → 403 **and row not tombstoned** | unit | same | ❌ W0 |
| SEC-01 SC-2 | PUT `{owner_id: other}` by the owner does not change `owner_id` | unit | same | ❌ W0 |
| SEC-01 SC-2b | POST `{owner_id: other}` does not create a record owned by another user | unit | `.../activities/__tests__/route.test.ts` | ❌ W0 |
| **SEC-01 SC-3** | list total == owner-scoped SQL count, **floor > 0**, **discriminator: != global count, and B sees only B's** | **integration (db)** | `npm run test:db` → `activities-scope.db.test.ts` | ❌ W0 |
| SEC-02 SC-4a | GET `/stages/:id` **owner, no expand → 200** — *the only RED-today half* | unit | `.../stages/[id]/__tests__/route.test.ts` | ❌ W0 |
| SEC-02 SC-4b | non-owner → 403 with **and** without expand — *regression guard, GREEN today* | unit | same | ❌ W0 |
| SEC-02 SC-4c | bare GET body has **no `pipeline` key** — guards the fix's own leak | unit | same | ❌ W0 |
| **QG-03 SC-5** | `?offset=<count>` → **200 + `data: []`** (500 / `42601` today) | **integration (db)** | `npm run test:db` → `stages-scope.db.test.ts` | ❌ W0 |
| QG-03 SC-5b | empty-set SQL contains no `IN ()`, asserted from `PgDialect`/`toSQL()`, **not** from route source text | unit | `.../stages/__tests__/in-clause.test.ts` | ❌ W0 |
| F3 | owner's `?limit=5` returns their stage; `data.length` consistent with `meta.total` | integration | `npm run test:db` | ❌ W0 |
| **Q10 gate** | every `/api/v1` record handler authorizes — AST sweep with floors | unit (**in CI**) | `npx vitest run src/app/api/v1/__tests__/route-authorization.test.ts` | ❌ W0 |

---

## Negative Controls — MANDATORY

Ten gates that could not fail have been found in this milestone. **The tenth is in this phase's own
subject area** and is the reason the Q10 gate exists: deleting all three ownership predicates from
`organizations/[id]/route.ts` left the full 5237-test suite green.

| # | Control | How broken | Expected red |
|---|---|---|---|
| **A** | **Q10 gate** | delete one `ownerId` predicate from a `/api/v1` record route | gate names that file:line. **This is the phase's most important control** — it is the direct answer to SEC-48-B |
| **B** | Q10 gate | rename the identity symbol it searches for | red, **not** green-because-it-broke (Phase 46 WR-11). Note **two spellings exist**: `context.userId` ×55 and `ctx.userId` ×22 |
| **C** | Q10 gate | add a new binding-form handler with no check | red — **a `FunctionDeclaration`-only walker sees the 8 existing binding-form handlers as ZERO** |
| **D** | activities `[id]` tests | revert the GET/PUT/DELETE ownership predicate one at a time | each verb red **independently** — SC-1 requires three separate assertions because the three verbs fail independently today |
| **E** | SC-3 db test | point it at a single-owner dataset | **floor fails** — an empty or single-owner result must not pass |
| **F** | SC-5 db test | restore the raw `sql\`IN\`` | 500 / `42601` returns |

**A gate with no recorded red observation is treated as not delivered.** Record verbatim output.

---

## Vacuity traps specific to this phase — handle, do not rediscover

1. **SC-4's `non-owner + no expand → 403` cell passes identically before and after the fix**, because
   it is 403 today for the *wrong reason* (the relation is never loaded). It is a regression guard, not
   evidence. **Only `owner + no expand → 200` proves the defect is fixed.**
2. **SC-3 is vacuous against the live distribution** — all **79,022** activities belong to one admin
   user, so scoped count == unscoped count already. Needs a created-and-cleaned two-owner fixture.
   **No admin bypass**, or the criterion becomes permanently unfalsifiable.
3. **Do not copy `organizations/[id]/__tests__/route.test.ts`'s shape.** It fails through four
   independent mechanisms, each individually sufficient: a `where`-blind db mock (`:13-20`); a
   non-owner case simulated as `mockResolvedValueOnce(undefined)` (`:165`) which **encodes its own
   conclusion as its premise**; **no second identity anywhere in the file**; and assertions only on
   status + call counts (`:169-171`). The cure exists in-repo: `activities.test.ts:112-113` renders a
   captured `where` via `PgDialect().sqlToQuery()`.
4. **Q10 floors, measured:** 36 route files · **62 declaration-form handlers + 8 binding-form across 4
   files** · 61 `withApiAuth` calls · two identity spellings. A walker that misses binding form
   under-counts by 8 and reports success.
5. **Self-collision does not apply to Q10** — it sweeps `route.ts` files and is itself a `*.test.ts`.
   **Assert that rather than assume it, and add no second mitigation.**
6. **`rtk`:** `grep … | wc -l` returns a WRONG count (36 → 19); `grep -n "export"` returned "0 matches"
   on a file with 15 exports; `git status --porcelain` renders as `ok`. Recompute with `node -e`;
   verify cleanliness with `git diff --exit-code`.

---

## Wave 0 Requirements

- [ ] `src/app/api/v1/activities/[id]/__tests__/route.test.ts` — SC-1a/b/c, SC-2
- [ ] `src/app/api/v1/activities/__tests__/route.test.ts` — SC-2b
- [ ] `src/app/api/v1/stages/[id]/__tests__/route.test.ts` — SC-4a/b/c
- [ ] `src/app/api/v1/stages/__tests__/in-clause.test.ts` — SC-5b
- [ ] `src/app/api/v1/activities/activities-scope.db.test.ts` — SC-3 (db project)
- [ ] `src/app/api/v1/stages/stages-scope.db.test.ts` — SC-5, F3 (db project)
- [ ] `src/app/api/v1/__tests__/route-authorization.test.ts` — **the Q10 gate**
- [ ] a two-user API-key fixture invoking the real `withApiAuth` — **zero precedent in the repo**

---

## Stale artifacts to reconcile (found by pattern mapping, three ungated)

- `openapi.yaml` declares no `'403'` for `/activities/{id}` or `/stages/{id}`
- `docs/development/formula-fields.md:330` **asserts the IDOR still exists** — it becomes false on landing

---

## Sign-Off

- [x] All six negative controls observed red, verbatim output in the SUMMARY — A/A′/A″ and B1/B2 and C
      in `48-08-SUMMARY.md`, D1-D4 in `48-01-SUMMARY.md`, E1/E2 in `48-06-SUMMARY.md`, F in
      `48-07-SUMMARY.md`. Judged row by row in the register below; **fifteen named controls plus five
      unnamed ones, all DELIVERED, none NOT DELIVERED.**
- [x] The Q10 gate proven to catch a deleted predicate (control A) — the exact SEC-48-B ablation moved
      the base suite from **0 failures to exactly 1**, and the one red test names file, line and verb.
      **Re-falsified fresh at sign-off** (register § fresh falsifications).
- [x] SC-4a and SC-3 proven with the *defect-proving* halves, not the guards — SC-4a by ablation S1,
      which reddened `owner + no expand → 200` while **both non-owner cells stayed green**; SC-3 by the
      four-component seeded proof, with E1 showing the ceiling alone passing a single-owner dataset.
- [x] `/api/v1/stages?offset=<count>` returns 200 after a real container rebuild — image
      `8f07a18eddad` → **`eba9cfa1c4be`**, `offset=74` (the live count, read by SQL) and `offset=999999`
      both **HTTP 200 with `data: []`**, and **zero `42601`** in the container log for the probe window.
- [x] `nyquist_compliant: true`

**Approval:** signed off by 48-10 on 2026-08-26. Evidence: `48-10-SUMMARY.md`.

---

## The exploit re-checked over real HTTP against a REBUILT image (48-10 Task 1)

`docker compose up -d --build`. Bound image `sha256:8f07a18e…` → **`sha256:eba9cfa1…`**
(`pipelite-app:latest` `8f07a18eddad` → **`eba9cfa1c4be`**). `/api/health` **200**, `db.ok: true`,
**10/10** processors alive. A matching image id would have invalidated every row below; it does not
match, so the measurements are against this phase's code.

Two temporary users (`p48gate-user-a`, `p48gate-user-b`, role `member`, status `approved`), two
temporary API keys (`p48gate-key-a`, `p48gate-key-b`), one activity each created through
`POST /api/v1/activities` with that user's own key, one pipeline and one stage owned by A. **All
removed afterwards; absence asserted by count.** The plaintext keys were never written into any
committed file.

| Transcript | Research measured | 48-10 measured, same request | Verdict |
|---|---|---|---|
| `GET /activities/{B}` as A | **200**, body carried `owner_id: p48res-userB` | **403** `FORBIDDEN` | reversed |
| `PUT /activities/{B}` as A | **200**, `title: "HIJACKED BY A"` persisted | **403** `FORBIDDEN` | reversed |
| `PUT /activities/{A}` as A with `owner_id: B` | **200**, `owner_id` moved B → A | **422**, `errors: [{field: "owner_id", code: "forbidden", …}]`; follow-up GET shows `owner_id: p48gate-user-a` **unchanged** | reversed |
| `DELETE /activities/{B}` as A | **204**; B's own GET then **404** | **403**; B's own GET still **200** with B's row | reversed |
| `POST /activities` as A with `owner_id: B` | the vector was open (`:154-164` validated existence only) | **422** naming `owner_id`; B's `meta.total` **1 → 1** | reversed |
| `GET /activities` as B | 100 rows, **none of them B's**, `meta.total` **79024** | **1 row**, `distinct_owners: ["p48gate-user-b"]`, `meta.total` **1** | reversed |
| `GET /activities` as A | (same defect) | **1 row**, own only; `contains_B_activity: false` | correct |
| `GET /stages/{A}` owner, **no** `?expand` | **403** — *this was SEC-02* | **200**, and `data` keys carry **no `pipeline` key** | reversed |
| `GET /stages/{A}?expand=pipeline` owner | 200 + expanded pipeline | **200**, `pipeline.owner_id: p48gate-user-a` | guard, unchanged |
| `GET /stages/{A}` non-owner, both ways | 403 / 403 | **403** / **403** | guards, unchanged |
| `GET /stages?limit=5&offset=74` | **500**, `42601 syntax error at or near ")"` | **200**, `{"data":[],"meta":{"total":1,"offset":74,"limit":5}}` | reversed |
| `GET /stages?limit=5&offset=999999` | **500**, same | **200**, `data: []` | reversed |
| `GET /stages?limit=5` as the stage's owner (F3) | `data: []` beside `meta.total: 1` | **`data: ["p48gate-stage-a"]`**, `data_length: 1`, `meta.total: 1` | reversed |

**The boundary offset was read from the database, not written down.** `select count(*) from stages`
returned **74** while the fixture stage existed (73 live + 1), so `offset=74` is the first empty page —
the same class of request research measured at 500.

**Container log for the probe window:** `42601` **0**, `syntax error` **0**, `Failed query` **0**,
`IN ()` **0**, error-level lines **0**. Floored so the absence is not vacuous: the same window carries
**20** `Rate limiting skipped: Redis not configured` lines, one per authenticated `/api/v1` request, so
the window demonstrably covers the probe. The matcher itself was falsified against a positive fixture:
run over `48-RESEARCH.md` it reports **8** hits.

**Live database, before and after the probe — identical:**

| Table | Pre-probe | Post-cleanup |
|---|---|---|
| `activities` | 79 022 | **79 022** |
| `stages` | 73 | **73** |
| `pipelines` | 12 | **12** |
| `users` | 10 | **10** |
| `api_keys` | 8 | **8** |
| `audit_log` | 214 | **214** |

Deleted in foreign-key order: 2 `audit_log`, 2 `activities`, 1 `stages`, 1 `pipelines`, 2 `api_keys`,
2 `users`. Prefixed leftovers afterwards: `users 0 / api_keys 0 / audit_log 0 / pipelines 0 / stages 0`,
and 0 activities owned by either probe user. The leftover matcher was floored too — the same `LIKE`
form matched **10** rows when pointed at a pattern that must match.

Worth recording: research's cleanup removed **5** `audit_log` rows from 6 requests; this probe removed
**2** from ~22. The refusals write nothing, which is the audit-side shadow of the same fix.

---

## The negative-control register (48-10 Task 2)

**A control whose SUMMARY says it was performed but does not quote the failure is NOT DELIVERED.**
Twenty-six controls, judged one by one against verbatim tool output. Result: **26 DELIVERED, 0 NOT
DELIVERED.** Every DELIVERED row below cites a transcript that carries an assertion diff, an exit
code, or a named FATAL/error message — never a description of what was expected.

### The six the phase owed (A through F), plus the two it grew

| # | Gate | What was broken | Expected red | Observed red — verbatim, cited | Verdict |
|---|---|---|---|---|---|
| **A** | Q10 gate | one, then all three, `eq(organizations.ownerId, context.userId)` predicates deleted | the gate names that file:line | `48-08` § Control A: variant 1 → `organizations/[id]/route.ts:25: GET does not constrain the record by caller identity`, `1 failed \| 57 passed (58)`. Variant 2, the exact SEC-48-B ablation → three offenders named at `:25`, `:62`, `:129`; full base suite `1 failed \| 5338 passed \| 32 skipped`. **RE-FALSIFIED FRESH at sign-off**, below | **DELIVERED** |
| **A′** | Q10 gate, against *this phase's own* fix | 48-01's GET ownership guard deleted from `activities/[id]/route.ts` | the gate names it, independently of that route's own tests | `48-08` § Control A′: `activities/[id]/route.ts:76: GET does not constrain the record by caller identity`, `1 failed \| 57 passed (58)` | **DELIVERED** |
| **A″** | rule R5 | only the rejection guard removed, from a verbatim copy of the real POST at `__control_r5__/route.ts` | the gate flags the POST — R5 must be a rule, not an exemption | `48-08` § Control A″: variant 1 (guard intact) `58 passed (58)`; variant 2 `__control_r5__/route.ts:1: POST does not constrain the record by caller identity`, `1 failed \| 57 passed (58)`. **Both polarities observed** | **DELIVERED** |
| **B1** | Q10 token floor | `ctx` removed from `IDENTITY_OBJECTS` | red, **not** green-because-it-broke (WR-11) | `48-08` § Control B1: `` `ctx.userId` fell to 0 occurrences in src/app/api/v1 (measured 22) … expected 0 to be greater than or equal to 15``, `10 failed \| 48 passed (58)`, offenders flooded to 20. **RE-FALSIFIED FRESH at sign-off**, below | **DELIVERED** |
| **B2** | Q10 token floor | both spellings replaced with names occurring nowhere | red, in the other direction too | `48-08` § Control B2: `` `context.userId` fell to 0 occurrences … expected 0 to be greater than or equal to 40``; `OFFENDER COUNT: 50 (was 0)`; `the gate classified 0 declaration-form handlers as authorized, measured 50`; **19 red** | **DELIVERED** |
| **C** | Q10 binding-form walker | a new binding-form handler with no check, `__control_c__/route.ts` | red — a `FunctionDeclaration`-only walker sees the binding form as ZERO handlers | `48-08` § Control C: `__control_c__/route.ts:10: GET does not constrain the record by caller identity`, `1 failed \| 57 passed (58)`, and with floors raised to 999 the live counts read `ROUTE_FILES enumerated: 37` / `binding-form handlers: 9` — genuinely enumerated, not name-matched | **DELIVERED** |
| **D1** | `activities/[id]` GET guard | deleted (4 lines) | the GET non-owner test red, **alone** | `48-01` § D1: `expected 200 to be 403`, `1 failed \| 11 passed (12)`; PUT and DELETE non-owner tests both green | **DELIVERED** |
| **D2** | PUT guard | deleted (6 lines incl. comments) | the PUT non-owner test red, alone | `48-01` § D2: `expected 200 to be 403`, `1 failed \| 11 passed (12)`; the SC-2 reassignment test stayed green, so the two PUT guards are not one mechanism counted twice | **DELIVERED** |
| **D3** | DELETE guard | deleted (4 lines) | the DELETE non-owner test red, alone | `48-01` § D3: `expected 204 to be 403` — the received `204` is the soft delete actually happening — `1 failed \| 11 passed (12)` | **DELIVERED** |
| **D4** | `owner_id` rejection guard | deleted (10 lines; **the explanatory comment deliberately left in place**, so the ablation removes behaviour rather than prose) | the SC-2 test red, alone | `48-01` § D4: `expected 200 to be 422`, `1 failed \| 11 passed (12)` | **DELIVERED** |
| **E1** | SC-3 db test | pointed at a single-owner dataset (`A_OWNED 7→10`, `B_OWNED 3→0`), **constants re-pointed with the seed** so the red is the criterion failing rather than a stale literal | the floor and the discriminator fail | `48-06` § E1: `3 failed \| 20 passed (23)`; `DISCRIMINATOR 1 … expected 10 not to be 10`; `DISCRIMINATOR 2 … expected 0 to be greater than 0`. **And the point is in the passing list: the CEILING PASSED** — the original unamended criterion, demonstrated passing on a dataset that proves nothing | **DELIVERED** |
| **E2** | SC-3 db test | pointed at an empty dataset | the floor fails | `48-06` § E2: `6 failed \| 17 passed (23)`; the FLOOR's own named message rendered verbatim (`an empty response proves nothing: … expected 0 to be greater than 0`). **Ceiling, both cross-checks, page-and-total and the narrowing filter all PASSED** — without the floors an empty database gives that file 21 of 23 green | **DELIVERED** |
| **F** | SC-5 db test | the **shipped** raw `sql` membership fragment restored via `git checkout c291dc8^ -- route.ts` — no invented ablation | `500` / `42601` returns | `48-07` § 3: `7 failed \| 18 passed (25)`; `PostgresError: syntax error at or near ")"`, `code: '42601'`, `position: '70'`, `file: 'scan.l'`, `routine: 'scanner_yyerror'`, and the statement text identical **character for character** to `48-RESEARCH § Q6`'s container log | **DELIVERED** |
| **G1** | `in-clause` gate | the pre-fix GET reinstated (id array + raw fragment + global page) | the structural assertions red | `48-04` § G1: `6 failed \| 4 passed (10)`; `expected "vi.fn()" to not be called at all, but actually been called 1 times` (the array's existence, observed), and `expected [ +0 ] to have a length of 2 but got 1` (only one `db.select` builder existed) | **DELIVERED** |
| **G2** | `in-clause` gate | the two predicates drifted (count query given its own inline `and(...)`) | the two identical-render assertions red, **alone** | `48-04` § G2: `2 failed \| 8 passed (10)`, with the verbatim SQL diff `Expected: ""pipelines"."owner_id" = $1"` / `Received: "("pipelines"."owner_id" = $1 and "pipelines"."deleted_at" is null)"` | **DELIVERED** |
| **S1** | `stages/[id]` SC-4 cells | the caller-controlled `with` reinstated (the shipped SEC-02 defect) | **only** `owner + no expand → 200` reddens; both non-owner cells stay green | `48-03` § S1: `expected 403 to be 200` and `expected undefined to be true`, with `SC-4b` and `SC-4b′` both `✓`. **RE-FALSIFIED FRESH at sign-off**, below | **DELIVERED** |
| **S2** | `stages/[id]` leak guard | `expand.has("pipeline") &&` removed | SC-4c red, alone | `48-03` § S2: `1 failed \| 12 passed (13)`, `expected [ 'id', 'pipeline_id', 'name', …(7) ] to not include 'pipeline'` | **DELIVERED** |

### The nine the phase produced beyond the list it was given

| # | Gate | What was broken | Observed red — verbatim, cited | Verdict |
|---|---|---|---|---|
| 48-02-a1 | activities list scope (structural) | `eq(activities.ownerId, ctx.userId)` deleted from the `conditions` initialiser | `3 failed \| 6 passed (9)`; `expected '"activities"."deleted_at" is null' to contain 'owner_id'`; `expected 1 to be 2` on the two-occurrence check | **DELIVERED** |
| 48-02-a2 | POST ownership guard (structural) | the whole guard block deleted | `2 failed \| 7 passed (9)`; `expected 201 to be 422` | **DELIVERED** |
| 48-06-D | the **same** list scope, **behaviourally** | the one-line revert, against real PostgreSQL through the unmocked `withApiAuth` | `9 failed \| 14 passed (23)`; ceiling `expected 10 to be 7`; both cross-checks returned the **union** of both owners' id sets (`+ actscope-act-b-1/2/3`); narrowing filter `expected 3 to be +0`. **This is SC-3's only RED-first evidence** | **DELIVERED** |
| 48-07-RP1 | the stages db test's empty-page assertion | boundary offset hard-coded to `0` | `expected [ …(4) ] to deeply equal []` — so the empty page is a consequence of the offset, not of the route returning nothing to anybody | **DELIVERED** |
| 48-07-RP2 | the stages db test's global-count FLOOR | `SEED_PLAN`'s id arrays emptied (data only) | `6 failed \| 10 passed`, the FLOOR's named message rendered verbatim, **while `THE PROOF` and `THE PROOF, not pinned to the boundary` both PASSED** — the vacuity argument demonstrated, not asserted | **DELIVERED** |
| 48-09-C1 | the OpenAPI gate, inverted polarity | a `'403'` over-declared on `GET /activities` | `1 failed \| 36 passed (37)`, and the one red names the operation and its measured reason | **DELIVERED** |
| 48-09-C2 | the OpenAPI gate's parse floors | `paths:` truncated, 78 115 → 29 687 bytes | `26 failed \| 11 passed (37)`; `parsed to 1 path items … expected 1 to be greater than or equal to 20`, **and the subject-reach assertions reddened too** — a truncated parse is caught twice | **DELIVERED** |
| 48-09-C3 | plan 48-09's **own** Task 3 verification script | run against pre-edit `HEAD`, then against empty documents | fired on **3 of 4** needles: `'guarded non-empty'` matches nothing and never did. And all four are satisfied by an empty file — `3 absence assertions, 0 positive floors`. **A control that FOUND a defect in its own plan** | **DELIVERED** |
| 48-09-C4 | the no-checkbox-changed assertion | the matcher's own count reported | `checkboxes HEAD=19 now=19`, `trace rows HEAD=19 now=19` — a zero count would have failed the probe explicitly | **DELIVERED** |

### Three re-falsified fresh at sign-off, plus one new

Each ran on a tree verified clean by `git diff --exit-code`, and each file was restored the same way.

**FF-1 — control A, re-run at sign-off.** All three `eq(organizations.ownerId, context.userId)`
predicates deleted (the script refused to proceed unless the split found exactly 3):

```
FF-1 ABLATED: all three eq(organizations.ownerId, context.userId) predicates deleted — the exact SEC-48-B ablation
AssertionError: an /api/v1 handler reads or writes an owned record without constraining it by the
CALLER's identity. That is OWASP API1:2023 BOLA — Broken Object Level Authorization: …
  src/app/api/v1/organizations/[id]/route.ts:129: DELETE does not constrain the record by caller identity
  src/app/api/v1/organizations/[id]/route.ts:25: GET does not constrain the record by caller identity
  src/app/api/v1/organizations/[id]/route.ts:62: PUT does not constrain the record by caller identity: expected [ …(3) ] to deeply equal []
 Test Files  1 failed (1)
      Tests  1 failed | 57 passed (58)
exit code: 1
FF-1 restored; git diff --exit-code = 0
```

**FF-2 — control B1, re-run at sign-off.** `IDENTITY_OBJECTS` narrowed from `["ctx", "context"]` to
`["context"]`:

```
      Tests  10 failed | 48 passed (58)
AssertionError: `ctx.userId` fell to 0 occurrences in src/app/api/v1 (measured 22). Both spellings
are in live use; a detector matching only one under-detects by 26% and reports offenders that are
correctly authorized.: expected 0 to be greater than or equal to 15
AssertionError: `verifyStageOwnership` is in AUTHORIZERS but no /api/v1 route calls it with
ctx.userId or context.userId. …: expected 0 to be greater than or equal to 1
AssertionError: `ownedStagesPredicate` is in AUTHORIZERS but no /api/v1 route calls it with … : expected 0 to be greater than or equal to 1
AssertionError: R3 fired 10 times across the corpus, measured 15 (3+2+1+3+4+2). …: expected 10 to be greater than or equal to 12
exit code: 1
FF-2 restored; git diff --exit-code = 0
```

Four KNOWN_NEGATIVE fixtures, the rule-discrimination probe, the token floor, three AUTHORIZERS
controls and the offender assertion — ten reds, and **the same ten 48-08 recorded.** The rename
question is answered with a RED.

**FF-3 — the SC-4a ablation, re-run at sign-off.** The GET's `verifyStageOwnership` call replaced by
the shipped caller-controlled `with` plus the copied predicate:

```
 × SC-4a — owner, NO ?expand → 200 [THE DEFECT PROOF, red before the fix] > returns 200 to the stage's legitimate owner without ?expand=pipeline
   → expected 403 to be 200 // Object.is equality
 × SC-4a — … > reads ownership through an UNCONDITIONAL relation load: a bare GET's findFirst carries with.pipeline === true
   → expected undefined to be true // Object.is equality
 × SC-4c — owner, NO ?expand → body has no `pipeline` key [guards the fix's own leak]
   → expected 403 to be 200 // Object.is equality
 ✓ SC-4b — non-owner, NO ?expand → 403 [REGRESSION GUARD — 403 today for the WRONG reason, NOT evidence] …
 ✓ SC-4b' — non-owner, ?expand=pipeline → 403 [REGRESSION GUARD, green before AND after] …
 Test Files  1 failed (1)
      Tests  3 failed | 10 passed (13)
exit code: 1
FF-3 restored; git diff --exit-code = 0
 Tests  13 passed (13)
```

**This is the single most important row in the register for SC-4.** The defect proof reddened while
**both** non-owner cells stayed green, at sign-off, on the merged tree. That is why the SC-4 verdict
below cites `owner + no expand → 200` and nothing else.

**FF-4 — new at sign-off: the rename question, applied to the OpenAPI gate.** No prior control asked
it of that gate (48-09's four were over-declaration, truncation, and two script probes). The
`Forbidden` response component was renamed to `AccessRefused` **consistently** — the declaration and
all six `$ref`s moved together, so the document stayed internally valid:

```
baseline: 6 $refs to Forbidden, 1 component declaration(s) named Forbidden
FF-4 ABLATED: component `Forbidden` renamed to `AccessRefused`, every $ref moved with it
  post-ablation $refs to Forbidden: 0
  post-ablation $refs to AccessRefused: 6
      Tests  7 failed | 30 passed (37)
AssertionError: expected [ 'Unauthorized', …(4) ] to include 'Forbidden'
AssertionError: GET /activities/{id}'s '403' must $ref #/components/responses/Forbidden; a dangling
or inline-empty ref is documentation that says nothing: expected '#/components/responses/AccessRefused'
to be '#/components/responses/Forbidden' // Object.is equality
… five more, one per remaining subject
exit code: 1
FF-4 restored; git diff --exit-code = 0
 Tests  37 passed (37)
```

**Verdict: RED, not green-because-it-broke.** The gate does not merely count `'403'` keys; it pins
the target of the reference, so a consistent rename cannot slip past it.

---

## The vacuity hunt (48-10 Task 2)

**Result: no twelfth gate that cannot fail was found.** Four tests applied to **eight** artifacts.

**Reconciling the count with 48-09, explicitly rather than silently.** `48-09-SUMMARY.md` records the
**eleventh** vacuous check of this milestone: the dead needle `'guarded non-empty'` inside plan
48-09's own Task 3 verification script, which matched nothing and never did — the real sentence was
``(guarded by `stageList` being non-empty)`` — and which was non-vacuous only through a second
disjunct, alongside three absence assertions with no presence floor, so deleting all three target
documents exited 0. **That finding is accepted here as the eleventh, not re-counted and not
ignored.** Two qualifications worth writing down: it lived in a **plan artifact**, not in committed
code, so nothing vacuous shipped from it; and it was found by 48-09's own control C3, which is a
control that worked. This hunt therefore searched for a **twelfth**, and reports **none found**.

**The plan asked for seven artifacts and then enumerated eight** (`route-authorization.test.ts`,
`openapi-error-coverage.test.ts`, `in-clause.test.ts`, the two `.db.test.ts` files, and the three
route test files). The enumeration is what was audited; the count in the plan's own sentence is off
by one, recorded rather than rounded.

### Test 1 — can it be made to fail by breaking the thing it claims to protect?

| Artifact | Answer | Transcript |
|---|---|---|
| `route-authorization.test.ts` | **yes**, five ways | A, A′, A″, B1, B2, C — plus FF-1 and FF-2 fresh |
| `openapi-error-coverage.test.ts` | **yes**, three ways | 48-09 C1 (over-declare), C2 (truncate), plus **FF-4** (rename) fresh |
| `in-clause.test.ts` | **yes**, two ways | G1, G2 |
| `activities-scope.db.test.ts` | **yes** | 48-06-D behavioural ablation, `9 failed \| 14 passed` |
| `stages-scope.db.test.ts` | **yes** | control F (`42601`), RP1, RP2 |
| `activities/[id]/__tests__/route.test.ts` | **yes**, four ways, each reddening exactly one test | D1-D4 |
| `activities/__tests__/route.test.ts` | **yes**, two ways | 48-02-a1, 48-02-a2 |
| `stages/[id]/__tests__/route.test.ts` | **yes**, two ways | S1, S2 — plus FF-3 fresh |

**Nothing here is unproven.** Every one of the eight has at least one recorded red.

### Test 2 — is there a FLOOR as well as a ceiling? Would an empty corpus / response / parse satisfy it?

Measured with `node`, and every declared floor re-measured against the live tree so "below its
measurement" is a fact rather than a doc-comment:

| Floor | Declared | Live measurement | Margin |
|---|---|---|---|
| `MIN_ROUTE_FILES` | 30 | **36** | 6 |
| `MIN_HANDLERS_PARSED` | 55 | 62 | 7 |
| `MIN_BINDING_HANDLERS` | 4 | 8 | 4 (deliberately at half — the failure it guards is a walker reporting **zero**) |
| `MIN_WITH_API_AUTH_CALLS` | 50 | **61** | 11 |
| `MIN_IDENTITY_HITS_CONTEXT` | 40 | **55** | 15 |
| `MIN_IDENTITY_HITS_CTX` | 15 | **29** | 14 |
| `MIN_OWNER_LIKE_ACCESSES` | 90 | 130 | 40 |
| `MIN_AUTHORIZED_HANDLERS` | 30 | ~50 | 20 |
| `MIN_PATH_ITEMS` | 20 | **27** | 7 |
| `MIN_OPERATIONS` | 45 | **59** | 14 |

- `in-clause.test.ts`: 5 negative assertions, each preceded by a positive floor on the same string,
  and a `toHaveLength(2)` builder-count floor asserted **three** times before any render comparison —
  G1 confirms that floor reddens on its own when only one builder exists. **No `readFileSync` at all**
  (measured 0), so it is not a source-text gate that could pass on an empty file.
- `openapi-error-coverage.test.ts`: two parse floors **and** a `.length` floor on each of the three
  subject arrays — because an `it.each` over an emptied array generates zero tests and reports
  success. C2 confirms the parse floor and the subject reach redden together.
- `activities-scope.db.test.ts` / `stages-scope.db.test.ts`: 2 and 7 `toBeGreaterThan(0)` floors
  respectively; E2 and RP2 are the transcripts where the floor is the **only** thing red.
- The three route test files carry no corpus floor and need none: their anti-vacuity mechanism is the
  **owner-positive anchor** paired with every refusal. Measured: `activities/[id]` 4×403 against
  4×200 + 1×204 + 1×422; `stages/[id]` 3×403 against 3×200; `activities/` 1×422 against 1×201-path
  assertion. A route that 403s everybody fails all three files.

**One floor is named as brittle rather than quietly softened.** `MIN_EXEMPT_MATCHED = 11` is pinned
in **both** directions — exactly 11, not "at least 11" — unlike every other number in that file. The
justification is real (each direction is a distinct failure: a shrinking list means an exemption
stopped matching, a growing one means an exemption swallowed a handler nobody reviewed), but it means
a legitimate route consolidation false-REDs it. That is a false-RED risk, **not** vacuity — the same
shape as Phase 47's `MIN_NON_TEST_PERFORMANCE_NOW = 2`, and recorded the same way.

### Test 3 — does it collide with itself, and if a mitigation exists, is there exactly one and is it named?

- `route-authorization.test.ts` sweeps a directory and **could** include itself. Exactly **one**
  mitigation: the corpus predicate `entry.name === "route.ts"`, asserted rather than assumed
  (`expect(ROUTE_FILES).not.toContain(GATE_PATH)` plus a `__tests__` check), and the four exemption
  lists additionally asserted **not** to name `GATE_PATH` — which 48-08 correctly labels as the same
  mitigation checked from the other side, not a second one.
- `openapi-error-coverage.test.ts` reads exactly **one** file by name (`public/openapi.yaml`) and
  walks no directory, so self-collision does not apply and no mitigation exists — which is the right
  answer, not a gap. Its one adjacent hazard is handled and scoped: its own prose quotes the string
  `guarded non-empty`, so 48-09's strengthened Task 3 check is limited to the three edited documents
  **by explicit filename**.
- The remaining six read no source and walk no directory (`readFileSync`/`readdirSync` measured 0),
  so the question does not arise.

**No artifact carries two mitigations.** Two would be one fewer than one, because neither ends up
provable.

### Test 4 — does a rename of the token it searches for make it go red rather than green?

- `route-authorization.test.ts`: **yes**, both spellings, both directions — B1 and B2, and FF-2 fresh.
- `openapi-error-coverage.test.ts`: **yes** — **FF-4**, established for the first time at sign-off.
- `in-clause.test.ts`: the question barely applies — it asserts on **compiled SQL** from
  `PgDialect().sqlToQuery`, not on source tokens, so an identifier rename in the route changes the
  rendered statement and reddens the comparison. G2 is that transcript, produced by a semantic change.
- The two `.db.test.ts` files and the three route test files assert on **HTTP status codes, response
  bodies and direct SQL counts**, none of which is a searched-for token. The question is inapplicable
  by construction, which is the strongest available answer to it.

### The Q10 matcher, EXTRACTED and RUN — not read

The ninth vacuous gate of this milestone was found by extracting a shipped matcher and running it.
The same was done here: a temporary probe imported `scanSource` from the gate and pointed it at five
fixtures whose text appears **nowhere** in `route-authorization.test.ts` (asserted, with a
40 000-character floor on the gate file so `includes` returning `false` is not because it is empty).

| Fixture | Shape | Required | Result |
|---|---|---|---|
| V1 | the comparison exists but compares to a **hard-coded string** (`!== "operator-of-record"`) | FLAG | **flagged** |
| V2 | the caller identity is compared, but against a **non-ownership column** (`serialNumber !== ctx.userId`) | FLAG | **flagged** |
| V3 | fetch-then-compare, novel table and variable names, `context` spelling | must NOT flag | **not flagged** |
| V4 | `where`-scoped, but scoped to a **caller-supplied** owner (`searchParams.get("as_owner")`) | FLAG | **flagged** |
| V5 | delegation to a known authorizer from a handler shape not in the corpus | must NOT flag | **not flagged** |

**Every fixture cleared a parse floor first** (`handlers.length > 0`), so the two "must not flag"
verdicts are not satisfied by a matcher that parsed nothing — which is exactly the failure 48-05's
stub transcript exhibited when all seven `toEqual([])` negatives passed against a detector that
detected nothing. `Tests 69 passed (69)`. The probe file was then deleted;
`git diff --exit-code` = 0 and no untracked file remains.

**V4 is the load-bearing new result.** It is the shape closest to a plausible future regression — a
`where` clause that looks scoped but is scoped to whatever the query string says — and the matcher
rejects it.

### Two limitations this phase ships ON PURPOSE

Recorded here so a later reader does not mistake either for an oversight.

1. **The Q10 gate is a presence gate.** It proves an ownership check **exists**; it cannot tell
   "authorizes correctly" from "authorizes". Its own header names the measured counter-example:
   `stages/[id]/route.ts` GET satisfied rule R2 and was reported as authorizing **while it WAS the
   SEC-02 defect** — the comparison was real, and the value it compared was decided by the caller. A
   guard whose branch fell through would satisfy R5 for the same reason. Behavioural tests own that
   property (48-03, 48-06, 48-07, and Task 1's HTTP re-check). **A green run of this gate must never
   be read as covering SEC-02.**
2. **The OpenAPI gate covers only the nine operations this phase changed.** 50 of 59 remain ungated,
   with the drift measured in `BACKLOG.md` § DOC-48-01: `401` declared on 22 of 59 operations against
   all 59 that can return it, `429` on 12 of 59, `403` on 8 of 59 against at least 12 — and **36
   route files against 27 documented path items**, which is the larger defect. The both-polarity
   structure to extend from 9 to 59 already exists in the gate.
