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
