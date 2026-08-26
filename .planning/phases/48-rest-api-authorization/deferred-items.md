# Phase 48 — Deferred Items

Out-of-scope discoveries logged during execution. Per the executor scope boundary these are NOT
fixed here: they are not caused by this phase's changes.

---

## DEF-48-01 — `src/lib/views/queries.db.test.ts` fails in `afterAll` (pre-existing)

**Found during:** 48-06, Task 3 verification (`npm run test:db` over the whole db project).

**Symptom:**

```
 FAIL  |db| src/lib/views/queries.db.test.ts [ src/lib/views/queries.db.test.ts ]
Error: Failed query: select count(*)::int as n from "saved_view_defaults" where id::text like $1
params: viewsdbt-%
Caused by: PostgresError: column "id" does not exist
 ❯ src/lib/views/queries.db.test.ts:250:23
Serialized Error: { severity: 'ERROR', code: '42703', position: '60', routine: 'errorMissingColumn' }
```

**Cause:** the `afterAll` at `queries.db.test.ts:246-260` issues the leftover query for EVERY entry in
`TOUCHED_TABLES` and only *afterwards* skips the assertion for `saved_view_defaults`:

```ts
const leftovers = await db.execute(
  sql`select count(*)::int as n from ${sql.identifier(table)} where id::text like ${LIKE_PREFIX}`,
)

if (table !== "saved_view_defaults") {
  expect(...)
}
```

`saved_view_defaults` has no `id` column (its key is `(user_id, entity_type)`), so the query throws
before the guard is reached. The guard skips the *assertion*, not the *query*.

**Proven pre-existing, not caused by 48-06:**
- The file's last commit is `f097b5b test(40-05): …` — Phase 40, untouched by this phase.
- It fails identically when run ALONE, with none of 48-06's files loaded:
  `./node_modules/.bin/vitest run --config vitest.db.config.ts src/lib/views/queries.db.test.ts`
  → `Test Files 1 failed (1) / Tests 28 passed (28)`.
- All 28 of its own assertions pass. Only the teardown throws.

**Consequence:** `npm run test:db` exits non-zero even when every test in every db file passes
(`73 passed (73)`, `Test Files 1 failed | 2 passed (3)`). Any future plan gating on `npm run test:db`'s
EXIT CODE will read a green suite as red.

**Fix when picked up:** move the `db.execute` inside the guard, or give the table its own predicate —
`queries.db.test.ts` already needs the per-table `LEFTOVER_PREDICATE` map that
`activities-scope.db.test.ts:216-222` introduced for the same reason (`audit_log.id` is a generated
UUID, so an id-prefix leftover check there would be vacuously zero).

**Also worth noting when fixing:** with the query throwing, that file's `count(*) === baseline`
re-assert never runs for any table after `saved_view_defaults` in `TOUCHED_TABLES` order. Its
fixture-restoration guarantee is therefore weaker than it reads.

---

## DEF-48-02 — a soft-deleted user's API key still authenticates

**Found during:** 48-06, Task 1 (reading `src/lib/api-keys.ts:56-95` in full for the fixture recipe).

`validateApiKey` checks `apiKeys.deletedAt` but never reads `users.deletedAt` or `users.status`. A key
belonging to a soft-deleted or `rejected` user therefore still authenticates every `/api/v1` request
and still establishes an `api_key` actor scope. Recorded by 48-RESEARCH § Q2 as "worth a note; out of
scope" and out of scope here too — 48-06 only proves the list scope, and widening the fixture to cover
account lifecycle would be a different requirement.

---

## DEF-48-03 — `createActivityMutation` still validates deal EXISTENCE, not ownership

**Found during:** the CR-01 fix (code review remediation pass).

CR-01 was fixed in the two `/api/v1` ROUTES — `activities/route.ts` POST and
`activities/[id]/route.ts` PUT — because that is where the review located it and where the house
pattern lives (`deals/[id]/route.ts:226-256`). `src/lib/mutations/activities.ts:140-151` is
unchanged and still reads:

```ts
if (validated.data.dealId) {
  const deal = await db.query.deals.findFirst({
    where: and(eq(deals.id, validated.data.dealId), isNull(deals.deletedAt)),
  })
  if (!deal) return { success: false, error: "Deal not found" }
}
```

Existence, not ownership.

**Why it was not fixed here.** The review says so explicitly: "the mutation is also called from the
session-auth server-action path where `input.userId` is already the owner, so tightening it there is
a second, separate change." That path has different callers, a different auth model and a different
blast radius — a `{ success: false }` return there surfaces in the UI, not as a 422.

**Residual risk, and why it is not a leak.** The REST route can no longer plant a foreign `deal_id`.
The remaining writer is the session-auth server action, whose UI deal picker is owner-scoped, so
reaching it needs a hand-crafted server-action call. And the READ side is now guarded independently:
both `?expand=deal` projections compare `activity.deal.ownerId` to `ctx.userId`
(`activities/route.ts`, `activities/[id]/route.ts`), so a row that carries a foreign link — planted
this way, or existing from before the fix — does not serialize the deal, its organization or its
person. What remains is an INTEGRITY gap (a `deal_id` the victim's deal cannot account for), not a
confidentiality one.

**Fix when picked up:** add `eq(deals.ownerId, input.userId)` to the mutation's deal lookup and
re-run the server-action suites; the route-level guards then become defence in depth rather than the
only control. Consider the same treatment for `assigneeId`, which the mutation accepts and does not
check at all.

**Owner:** whoever picks up the activities server-action work next.

---

## DEF-48-04 — the WR-02 tie case cannot be proven behaviourally

**Found during:** the WR-02 fix (code review remediation pass).

`GET /api/v1/stages` now orders by `(position, id)`, so `LIMIT`/`OFFSET` is over a TOTAL order. The
behavioural guard for it — `stages-scope.db.test.ts`, "WR-02 — a multi-pipeline caller loses no stage
between pages", which seeds a second pipeline for user A with COLLIDING positions and asserts the
collision is present before paging — was measured against the UNFIXED route and came back
**`Tests 28 passed (28)`**. It did not catch the defect.

That is not a defect in the test. `LIMIT`/`OFFSET` over a sort with ties is UNSPECIFIED in
PostgreSQL: correct pages are a permitted outcome, and for six rows on one plan they are the likely
one. The RED/GREEN proof therefore lives in `stages/__tests__/in-clause.test.ts` on the COMPILED SORT
KEYS, where "the order is total" is a deterministic claim about the statement rather than a hope
about the planner.

**What is deferred:** nothing is broken, but the behavioural guard is weaker than it looks and its
header says so. If a future plan wants a behavioural proof, it needs a fixture large enough to force
a different plan (a sort spill, or an index-only scan over thousands of tied rows) — which is a
performance-shaped fixture, not a correctness-shaped one, and is out of proportion to the defect.

**Owner:** unassigned. Recorded so the guard is not mistaken for evidence.
