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

> **SUPERSEDED 2026-08-26 by the iteration-2 review-fix pass. Two of this entry's claims were
> WRONG and are corrected below; the entry is kept rather than rewritten so the correction is
> visible.**
>
> - **"reaching it needs a hand-crafted server-action call" — FALSE.** It needs three ordinary
>   `/api/v1` requests through the workflow engine (`POST /api/v1/workflows` →
>   `PUT …/{id}` `{"active":true}` → `POST …/{id}/run`), and it needs an ordinary CSV upload
>   through `importActivities`. Both were live.
> - **"What remains is an INTEGRITY gap … not a confidentiality one" — FALSE.** The planted row
>   IS read across the owner boundary: `src/app/activities/[id]/page.tsx:41-52` joins
>   `deals`/`stages`/`pipelines` off `activities.deal_id` with no owner predicate and renders the
>   deal title, stage name and pipeline name at `:202-213`. The two `/api/v1` read guards close
>   the API surface only.
> - **The writer enumeration was one entry short of four**, not one of two. The four are: the
>   session-auth server action (this entry), the CSV import (**closed** — CR-03,
>   `src/app/import/actions.ts`), the workflow-engine `crm_action` **target** (**closed** —
>   CR-02, `src/lib/execution/actions/crm.ts`), and the workflow-engine `crm_action`
>   **fieldMapping reference** (**still open** — DEF-48-05 below, which is the part of this entry
>   that survives).
>
> **What is still deferred from this entry:** the mutation-layer half. `createActivityMutation`
> and `updateActivityMutation` still validate `dealId` for existence only, and `assigneeId` not at
> all. Owner: Phase 49 (SEC-04/DATA-01/DATA-02), which is the phase for mutation-layer truth.


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

---

## DEF-48-05 — the workflow engine can still attach one of the caller's OWN records to another owner's record id

**Found during:** the CR-02 fix (iteration-2 code-review remediation pass). This is the surviving
half of DEF-48-03, restated with a correct reproduction.

**What is closed.** CR-02 closed the **target** of a `crm_action` node: `resolveIdByLookup` is now
owner-scoped at the query and `assertCallerOwnsTarget` refuses a caller-authored `targetId` that is
not one of the caller's own live records, for all four entities
(`src/lib/execution/actions/crm.ts`). So the engine can no longer read, write, delete or emit
another owner's row.

**What is still open.** The node's `fieldMapping` carries **reference columns**, and those still
reach the mutation layer unvalidated for ownership:

| entity | reference key | mutation check today |
|---|---|---|
| `activity` | `dealId` | `and(eq(deals.id, …), isNull(deals.deletedAt))` — existence (`src/lib/mutations/activities.ts:141-151`, `:235-245`) |
| `activity` | `assigneeId` | **none at all** |
| `deal` | `organizationId` | existence (`src/lib/mutations/deals.ts:311-329`) |
| `deal` | `personId` | existence (same) |
| `deal` | `stageId` | existence only, and stages are owned through `pipelines.owner_id` |
| `person` | `organizationId` | existence |

**Reproduction (three `/api/v1` requests, one API key, no id guessing needed beyond one read):**

1. `GET /api/v1/deals` as user A to learn A's own deal ids — or note that a victim's deal id can be
   obtained anywhere it leaks; the point is that the id is *not checked*.
2. `POST /api/v1/workflows` with
   `nodes: [{"id":"n1","type":"action","config":{"actionType":"crm_action","entity":"activity","operation":"create","fieldMapping":{"title":"x","typeId":"<any>","dueDate":"2026-01-01","dealId":"<B's deal id>"}}}]`
   → 201.
3. `PUT …/{id}` `{"active":true}` → 200, then `POST …/{id}/run` → 201.

**Wrong output:** an activity owned by A carrying B's `deal_id`. `?expand=deal` correctly suppresses
the deal on both `/api/v1` projections (CR-01's read guards, now covered by WR-08 as well), but
`src/app/activities/[id]/page.tsx:41-52` joins off that column with no owner predicate and renders
B's deal title, stage and pipeline name at `:202-213`. The `update` operation reaches the same place
through `updateActivityMutation`'s `dealId` branch.

**Why it was not fixed in this pass.** The fix belongs in the mutation layer, and the mutation layer
cannot take a blanket owner predicate: `src/lib/bulk/dispatch.ts:20-34` records that the ownership
predicate is ASYMMETRIC, and `src/app/deals/actions.ts:89,161,254,347,445,482` all read
`deal.ownerId !== session.user.id && session.user.role !== "admin"`, so `updateDealMutation` and
`deleteDealMutation` are legitimately reached with an admin's `userId`. Closing the reference half
means deciding what the mutation layer's contract IS, which is Phase 49's declared subject
(SEC-04 / DATA-01 / DATA-02). A second boundary check in `crm.ts` would close the `/api/v1` path
only and would then be a fourth place the same rule is spelled — which is how CR-01 came to have
five writers in the first place.

**Owner:** Phase 49 (Mutation-Layer Truth After Commit). Do not fold it into a route task.

---

## DEF-48-06 — three more unscoped lookups in the CSV importer, deliberately left

**Found during:** the CR-03 fix (iteration-2 code-review remediation pass), while auditing every
`findMany` in `src/app/import/actions.ts` rather than only the one the review cited.

CR-03 closed `importActivities`' deal lookup. Three more reads in the same file carry no owner
predicate and feed rows whose `ownerId` is `session.user.id`:

| line | read | consumer |
|---|---|---|
| `src/app/import/actions.ts:380-381` | `existingOrgs` (all live organizations) | `resolveOrganization` in `importPeople` → `people.organization_id` |
| `:528-529` | `existingOrgs` | `resolveOrganization` in `importDeals` → `deals.organization_id` |
| `:534-535` | `existingPeople` (all live people) | `importDeals` → `deals.person_id` |
| `:540-543` | `allStages` (all stages, `with: { pipeline: true }`, filtered only on `!pipeline.deletedAt`) | `importDeals` → `deals.stage_id` |

**Why they are NOT the same fix, and why closing them here would have been worse than leaving them.**

- The organization and person reads feed **fuzzy matching** (`fuzzyMatchOrganization`) and
  **auto-creation**: no match means the importer INVENTS a row (`actions.ts:200-220`). Scoping them
  therefore does not produce a warning like the deal case — it produces a per-owner **duplicate** of
  every shared organization and person on every import. This deployment holds 46,054 organizations
  and 38,348 people, and an entire duplicate-detection and merge subsystem exists (Phase 39) because
  duplicates are expensive here. Changing what the importer matches against changes duplicate volume
  across those tables. That is a product decision with its own verification, not a review-fix edit.
- `allStages` is a third shape again: `stages` has no owner column, ownership runs through
  `pipelines.owner_id`, and `getDefaultStage()` (`:155-170`) reads `pipelines` unscoped and is the
  fallback for every unmatched stage name. Scoping the match without scoping the default makes the
  two paths disagree about the same import. Pipelines are also admin-managed in this app
  (`src/app/admin/pipelines/actions.ts`), so "who owns a pipeline" is a question with a product
  answer, not a lookup to tighten.

Deals have no dedup subsystem and no auto-creation, which is exactly why CR-03's own query was
contained and these are not.

**ALSO RECORDED HERE: a disagreement with the review.** CR-03 lists
`src/lib/import/pipedrive-api-import-actions.ts:897-901` as "same unscoped dedupe, narrower reach".
It is **not the same defect and must not be scoped.** That importer MAPS Pipedrive owners onto
Pipelite users and writes rows owned by those mapped users, not by the importer —
`ownerId: pdOrg.owner_id` → `ownerId: orgData.ownerId` (`:737`/`:766`), the same pattern for people
(`:828`/`:861`), deals (`:925`/`:1007`) and activities (`:1061`/`:1108`). Its dedupe is cross-owner
**by design**: it is recreating a whole multi-user Pipedrive account, and scoping it to
`importingUserId` would duplicate every record belonging to another mapped user. Left unchanged
deliberately.

**Fix when picked up:** one plan covering the organization/person match policy for imports, with a
measurement of how many additional rows scoping would create against a copy of the live data, and a
decision on pipeline ownership for the stage half. Do not fold it into a security task; the security
half (a foreign FK that the session UI then renders) is real but the remedy is a duplicates
decision.

**Owner:** unassigned. Candidate for the same phase as the Phase 39 duplicate work.
