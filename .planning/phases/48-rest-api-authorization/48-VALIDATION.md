---
phase: 48
slug: rest-api-authorization
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-25
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

- [ ] All six negative controls observed red, verbatim output in the SUMMARY
- [ ] The Q10 gate proven to catch a deleted predicate (control A)
- [ ] SC-4a and SC-3 proven with the *defect-proving* halves, not the guards
- [ ] `/api/v1/stages?offset=<count>` returns 200 after a real container rebuild
- [ ] `nyquist_compliant: true`

**Approval:** pending
