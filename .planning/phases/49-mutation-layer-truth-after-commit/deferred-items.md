# Phase 49 — Deferred Items

Out-of-scope discoveries, logged rather than fixed. Each names the plan that found it, what was
measured, and why it was not changed there.

---

## DEF-49-01 — `GET /api/v1/activities/[id]` returns 403 where its three siblings return 404

**Found by:** plan 49-05, Task 2, while closing plan 49-03's ablation 3 (cross-route owner scoping).
**Measured, against unablated shipped code:**

```
AssertionError: A read B's activity — the GET-by-id predicate is not owner-scoped. This is the
exact term plan 49-03's ablation 3 removed and nothing caught.: expected 403 to be 404
- Expected
+ Received
- 404
+ 403
```

**What the four routes actually do:**

| Route | Predicate | Foreign record |
|---|---|---|
| `organizations/[id]` GET | `id`, `owner_id`, `deleted_at is null` | **404** |
| `people/[id]` GET | `id`, `owner_id`, `deleted_at is null` | **404** |
| `deals/[id]` GET | `id`, `owner_id`, `deleted_at is null` | **404** |
| `activities/[id]` GET | `id`, `deleted_at is null`, **then** `activity.ownerId !== ctx.userId` → `Problems.forbidden()` (`src/app/api/v1/activities/[id]/route.ts:112-123`) | **403** |

**Why it matters:** a 403 where the siblings return 404 is an existence oracle — it confirms to an
unauthorized caller that a record with that id exists. The three sibling routes deliberately make a
foreign record indistinguishable from a missing one.

**Why plan 49-05 did not change it:** changing an API's status code is a contract change to a
published surface (`public/openapi.yaml`), it is not DATA-02, and it would need the OpenAPI document
and `openapi-error-coverage.test.ts` amended in the same commit. 49-05 asserts the **measured**
behaviour per entity through `FOREIGN_READ_STATUS` in
`src/app/api/v1/__tests__/create-response-canonical.db.test.ts`, which reddens in both directions if
anybody harmonises the four silently.

---

## DEF-49-02 — `activities/route.ts`'s DATA-02 comment names a predicate its GET does not use

**Found by:** plan 49-05, Task 2, same investigation as DEF-49-01.

`src/app/api/v1/activities/route.ts`'s canonical-read comment (landed by plan 49-03) reads:

> It is read back through the same three-term predicate `GET /api/v1/activities/[id]` uses

That GET's predicate has **two** terms (`id`, `deleted_at is null`); its ownership check is a
post-fetch comparison on the fetched row. Plan 49-03's SUMMARY repeats the claim for all four
entities. It is accurate for `organizations`, `people` and `deals`, and inaccurate for `activities`.

**Not a functional defect.** The activities canonical read IS three-term and IS correctly scoped —
it is strictly narrower than the GET it is described as mirroring, and it resolves the row the
insert just committed either way. Only the sentence about *which* predicate it mirrors is wrong.

**Why plan 49-05 did not change it:** editing another plan's shipped comment mid-phase would make
49-03's recorded evidence and the tree disagree, and 49-09 is the sign-off that should decide
whether the comment or the route is what moves. The inaccuracy is recorded here and in the
`FOREIGN_READ_STATUS` doc-comment of 49-05's proof file.

---

## DEF-49-03 — the owner term in a create's canonical read is structurally unobservable

**Found by:** plan 49-05, Task 2, ablation 6a. Recorded so no later plan spends time trying to
build a behavioural gate for it.

Dropping `eq(organizations.ownerId, context.userId)` from the POST canonical read leaves
**23/23 green**, and no test can do better. The insert immediately above wrote `ownerId` as the
caller's id, so the owner term is satisfied by construction on every reachable execution: the
two-term and three-term predicates resolve the same row, always. The term is defence-in-depth
against a future refactor that changes what the read is keyed on, not an observable behaviour.

**Consequence for 49-09:** the four canonical reads' owner terms are held by 49-03's rendered-
predicate assertion (organizations only) and by review, not by behaviour — and that is a property
of the code shape, not a gap a proof was lazy about. The **GET-by-id** owner terms, which ARE
observable, are covered behaviourally for all four entities by 49-05.

---

## DEF-49-04 — **CLOSED 2026-08-26, commit `37202ce`** (see the note directly below)

> **CLOSED.** The orchestrator fixed this immediately rather than deferring it, because a green suite
> exiting non-zero made `test:db`'s exit code unusable as a gate and had forced a standing caveat into
> every phase from 48 onward, including all nine Phase 49 plans and the five phases still to run.
> Measured before/after with the same command: `1 failed (1) / 28 passed / exit 1` →
> `1 passed (1) / 28 passed / exit 0`; `npm run test:db` → 11 files / 252 tests / **EXIT=0**.
> This also closes **DEF-48-01**. Original entry follows.

## DEF-49-04 (original entry) — `src/lib/views/queries.db.test.ts`'s `afterAll` throws 42703, so the db PROJECT can never be green

**Found by:** plan 49-06, Task 2, running the whole db project after the ablations.

**Measured, in isolation, on unmodified code** (`vitest run --config vitest.db.config.ts
src/lib/views/queries.db.test.ts`):

```
 Test Files  1 failed (1)
      Tests  28 passed (28)
```
```
Serialized Error: { severity: 'ERROR', code: '42703', position: '60', file: 'parse_relation.c',
  routine: 'errorMissingColumn',
  query: 'select count(*)::int as n from "saved_view_defaults" where id::text like $1',
  parameters: [ 'viewsdbt-%' ] }
```

**The defect, at `src/lib/views/queries.db.test.ts:246-257`:** the leftover query is EXECUTED for
every entry in `TOUCHED_TABLES` and only the `expect` around its result is guarded by
`if (table !== "saved_view_defaults")`. `saved_view_defaults` has no `id` column, so the statement
itself raises 42703 before the guard is ever consulted. Every one of its 28 cells passes; the hook is
what fails.

**Why it matters beyond that file:** it means the db project reports `1 failed | 10 passed` on a run
where all 252 tests pass, and it is a plausible cause of **DEF-48-01** ("`npm run test:db` exits
NON-ZERO on a GREEN suite"). The fix is to move the query inside the guard, or to give
`saved_view_defaults` its own predicate the way `LEFTOVER_PREDICATE` does in the later db-tests.

**Why plan 49-06 did not change it:** it is a Phase 40 file (`f097b5b`), untouched by this phase, in
a subsystem this phase does not own. The executor scope boundary says pre-existing failures in
unrelated files are logged, not fixed. It is independent of this plan's work: it reproduces on the
file alone, and 49-06's own file contributes 18 passing cells with a clean two-part `afterAll`
(234 → 252 passed, nothing else moved).
