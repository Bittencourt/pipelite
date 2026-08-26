# Phase 48 — Deferred Items

Out-of-scope discoveries logged during execution. Per the executor scope boundary these are NOT
fixed here: they are not caused by this phase's changes.

---

## DEF-48-01 — `src/lib/views/queries.db.test.ts` fails in `afterAll` (pre-existing) — **CLOSED 2026-08-26**

> **CLOSED in Phase 49**, commit `37202ce`. The guard wrapped the `expect` but not the QUERY, so
> `saved_view_defaults` (no `id` column) raised `42703` regardless. Query moved inside the guard;
> `npm run test:db` → 11 files / 252 tests / **EXIT=0**. Found by plan 49-06, logged there as
> DEF-49-04. Original entry unchanged below.

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

> **CORRECTED IN PLACE 2026-08-26 by the iteration-3 review-fix pass. THIS ENTRY'S CENTRAL CLAIM
> WAS FALSE IN BOTH DIRECTIONS, and it is corrected here rather than rewritten so the correction
> stays visible — the same treatment DEF-48-03 got above.**
>
> The sentence *"So the engine can no longer **read**, **write**, delete or emit another owner's
> row"* was **wrong on both halves**, and it was wrong in the one place that matters most, because
> Phase 49 would have inherited it as a settled premise.
>
> - **WRITE — false.** `dealSchema` carried `ownerId: z.string().optional()` and both deal
>   mutations honoured it (`src/lib/mutations/deals.ts:35`, `:232`, `:377-380`).
>   `coerceFieldMapping` passes unknown keys through untouched and the call sites spread
>   `{ ...interpolatedFields, userId }`, which protects `userId` but NOT `ownerId`. So
>   `fieldMapping: { ownerId: "<victim>" }` on `entity: "deal"` **created a row in the victim's
>   account** — visible in the victim's `GET /api/v1/deals` and their `/deals` UI, sitting on the
>   attacker's stage in the attacker's pipeline — and the `update` variant **transferred** one of
>   the caller's own rows to the victim after `assertCallerOwnsTarget` legitimately passed. That is
>   strictly worse than the reference columns this entry tabulates: those attach a foreign FK to
>   the caller's own row, `ownerId` moves the row itself across the boundary.
>   **CR-04. NOW CLOSED** at the boundary this pass already chose — `FORBIDDEN_MAPPING_KEYS` in
>   `src/lib/execution/actions/crm.ts` refuses `ownerId`, `id` and `deletedAt` on all four
>   entities, above the switch so it covers create/update/delete and lands above all three dry-run
>   gates. Proof: the CR-04 describe in `src/lib/execution/actions/crm-ownership.db.test.ts`,
>   measured red first (`Tests 6 failed | 24 passed (30)`), asserting the DATABASE rather than the
>   response code.
> - **READ — false, and it had never been recorded anywhere.** `matchAndFireTriggers`
>   (`src/lib/triggers/matcher.ts`) selected `from(workflows).where(eq(workflows.active, true))`
>   with **no owner predicate at all**, so every active workflow in the deployment fired on every
>   user's CRM write and received the victim's full row as `workflow_runs.trigger_data`, which
>   `serializeRun` returns verbatim from `GET /api/v1/workflows/{id}/runs`. **CR-05. NOW CLOSED** —
>   see **DEF-48-07** below, which is its full record.
>
> **`ownerId` was missing from the table below entirely**, which is how it survived two review-fix
> passes: the table enumerates *reference* columns and nobody enumerated the *ownership* column.
> Two more user-naming fields the CR-04 audit turned up are now in it as well.

**Found during:** the CR-02 fix (iteration-2 code-review remediation pass). This is the surviving
half of DEF-48-03, restated with a correct reproduction.

**What is closed.** CR-02 closed the **target** of a `crm_action` node: `resolveIdByLookup` is now
owner-scoped at the query and `assertCallerOwnsTarget` refuses a caller-authored `targetId` that is
not one of the caller's own live records, for all four entities
(`src/lib/execution/actions/crm.ts`). ~~So the engine can no longer read, write, delete or emit
another owner's row.~~ **That sentence was false — see the correction block above.** What CR-02
closed is the **target of a node**, and nothing more: the node's own `fieldMapping` (CR-04) and the
CRM event stream that feeds the engine in the first place (CR-05) were both still open, and both
are closed now by separate fixes.

**What is still open.** The node's `fieldMapping` carries **reference columns**, and those still
reach the mutation layer unvalidated for ownership:

| entity | reference key | mutation check today | status |
|---|---|---|---|
| `deal` | **`ownerId`** | **`validated.data.ownerId \|\| input.userId` on create; `updateData.ownerId = …` on update — HONOURED, no check** | **CLOSED by CR-04** — refused in `crm.ts` |
| `activity` | `dealId` | `and(eq(deals.id, …), isNull(deals.deletedAt))` — existence (`src/lib/mutations/activities.ts:141-151`, `:235-245`) | open |
| `activity` | `assigneeId` | **none at all** — `text('assignee_id') references users.id` | open |
| `deal` | `assigneeIds` | **none at all** — `z.array(z.string())` → `deal_assignees.user_id`, for arbitrary user ids | open |
| `deal` | `organizationId` | existence (`src/lib/mutations/deals.ts:311-329`) | open |
| `deal` | `personId` | existence (same) | open |
| `deal` | `stageId` | existence only, and stages are owned through `pipelines.owner_id` | open |
| `person` | `organizationId` | existence | open |

**Why `assigneeIds` / `assigneeId` are residuals here rather than refusals in `crm.ts`.** They name
a USER, like `ownerId`, but they do NOT move the record: `GET /api/v1/deals` and
`GET /api/v1/activities` both scope their lists by `owner_id` and never by assignee
(`deals/route.ts:109`, `activities/route.ts:70`), so an assigned record does not appear in the
assignee's account. Refusing them would break assigning work to a colleague from a workflow, which
is a supported product behaviour. `deal.assigneeIds` additionally reaches `newAssigneeUserIds` and
therefore a notification email, which is SEC-48-D's recipient question and not this one's.

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

---

## DEF-48-07 — CR-05: the CRM trigger matcher was unscoped, and it had never been recorded — **CLOSED 2026-08-26 (both halves: matcher, then the SEC-48-A read path)**

**Found during:** the iteration-3 code review. **This item did not exist in `.planning/` in any
form before this entry.** A search of the whole directory for `matchAndFireTriggers` returned one
hit — a Phase 25 note in `STATE.md` about testability — so the single largest cross-owner READ on
the `/api/v1` surface was never a recorded security item, while DEF-48-05 and BACKLOG SEC-48-C
both asserted in writing that the engine could no longer read another owner's row.

**What was open.** `src/lib/triggers/matcher.ts` selected

```ts
const activeWorkflows = await db.select().from(workflows).where(eq(workflows.active, true))
```

with no owner predicate of any kind. `matchesTrigger` compares only `entity` and `action`, and
`fieldFilters` defaults to `[]` so the field check is skipped entirely. So **every active workflow
in the deployment fired on every user's CRM write**, and received `payload.data` — the victim's full
row, because every `crmBus.emit` in the mutation layer passes the post-write row and a delete
carries it in `previous` — as `workflow_runs.trigger_data` (`create-run.ts`), which `serializeRun`
returns **verbatim** (`src/lib/api/serialize.ts`) from `GET /api/v1/workflows/{id}/runs`.

**Reproduction: two `/api/v1` requests and then waiting.**

1. `POST /api/v1/workflows`
   `{"name":"x","triggers":[{"type":"crm_event","entity":"deal","action":"updated"}],"nodes":[]}`
   → 201 (`createWorkflow` sets `createdBy = context.userId`).
2. `PUT /api/v1/workflows/{id}` `{"active":true}` → 200.
3. Any other user edits any deal, through the UI or the API.
4. `GET /api/v1/workflows/{id}/runs` → 200, and every element's `trigger_data` is another owner's
   row: `title`, `value`, `notes`, `customFields`, `ownerId`, `stageId`, `organizationId`,
   `personId`.

`nodes: []` sufficed — the run row is persisted before any node runs. It never resolves a target id,
so the CR-02 guard in `crm.ts` was not on this path at all. And unlike SEC-48-D there is no
legitimate session-path equivalent: nothing else in this product lets an ordinary member read
another member's deal row.

**What was done.** The matcher resolves the **owner of the record the event describes** and scopes
the workflow read to it:

```ts
const terms: SQL[] = [eq(workflows.active, true), eq(workflows.createdBy, ownerId)]
.where(requireScopedPredicate(and(...terms), terms.length, "matchAndFireTriggers' owner scope"))
```

**The review suggested `eq(workflows.createdBy, payload.userId)` — the ACTING user — and that was
rejected, with reasons, rather than applied:**

- `payload.userId` **is not always a user id.** `src/lib/mutations/dedup.ts:672-685` emits
  `<entity>.deleted` with `userId: actor?.userId ?? ""`. Scoping on it would silently stop every
  merge from firing any trigger for anybody, with no error raised anywhere — a legitimate feature
  lost to a security fix.
- **Actor and owner genuinely diverge.** `src/app/deals/actions.ts:89,161,254,347,445,482` grant
  admins a documented bypass, so an admin editing another member's deal emits with the ADMIN's id —
  scoping on the actor would stop the OWNER's own automation from firing on the owner's own record.
  `src/lib/import/pipedrive-api-import-actions.ts` writes rows owned by MAPPED users while the actor
  is the importer, and diverges the same way.

All four entities carry `owner_id text NOT NULL`, and every delete in this product is a SOFT delete
(the merge loser included, `dedup.ts:485-488`), so the column is readable at match time for every
event including the tombstones. It **fails closed**: an unresolvable owner fires nothing and logs at
error level.

**Whether CR-05 is closed across every consumer of the event stream, checked rather than assumed:**

| consumer | verdict |
|---|---|
| `triggers/matcher.ts` (workflow triggers) | **was the hole. Fixed.** |
| `events/subscribers/webhook.ts` | **already scoped** — `triggerWebhook(payload.userId, …)` → `eq(webhooks.userId, userId)` (`src/lib/api/webhooks/deliver.ts:49-51`). Scoped by ACTOR rather than owner, which is a divergence from the matcher but not a cross-owner read: outside the deals admin bypass no write path in this product lets a principal write a record they cannot read (`people/actions.ts:148,196`, `organizations/actions.ts`, `activities/actions.ts` all refuse on `ownerId !== session.user.id` with no role clause). |
| `events/subscribers/audit.ts` | **not readable across the boundary** — it writes `audit_log`, and `GET /api/v1/audit` is admin-only via `authorizeAuditRead` → `resolveActorRole`, which denies an unresolvable actor. |
| `events/subscribers/stage-history.ts` | one `deal_stage_history` row about the deal that moved; carries no other owner's data. |
| `triggers/schedule-processor.ts` | also selects every active workflow, but its envelope is `{ scheduledAt }` and carries no record at all. |
| `triggers/manual-trigger.ts` | the caller supplies its own `entityData`; the route (`workflows/[id]/run`) scopes the workflow by `getWorkflow(id, context.userId)`. |

~~**STILL OPEN, and NOT fixed by this pass because it is explicitly out of scope:** `GET
/api/v1/workflows/{id}/runs` and `.../runs/{runId}` do not check `workflows.createdBy` at all, so an
API key can read **any** workflow's runs and run steps.~~ **CLOSED 2026-08-26 — see the block
below.** The paragraph is struck rather than rewritten because it was accurate when written and the
sequence matters: the matcher was scoped first, the read path second, and a reader needs to be able
to see that CR-05 shipped with a known-open half.

> **THE READ HALF IS NOW CLOSED (2026-08-26), so CR-05 is complete.**
>
> `GET /api/v1/workflows/{id}/runs` and `GET .../runs/{runId}` both resolve the workflow through
> `getWorkflow(id, context.userId)` and answer `Problems.notFound("Workflow")` otherwise — the
> house pattern of every sibling under `workflows/` (`workflows/[id]/route.ts:29,:68,:93`,
> `workflows/[id]/run/route.ts:24`). The `[runId]` handler's callback had been `async () => …`, with
> no `context` parameter at all, so the caller's identity was not even in scope in the function that
> served the row; the workflow is now resolved BEFORE the run is read, and the pre-existing
> `eq(workflowRuns.workflowId, id)` term is retained ALONGSIDE the owner check rather than replaced
> by it, so a caller still cannot pull an arbitrary run id through a workflow they own.
>
> **404 and not 403**, because every sibling of these two answers 404 and because 403-for-real
> beside 404-for-unknown is an existence oracle over every workflow id in the deployment. Asserted,
> not claimed: the two responses are compared BYTE FOR BYTE on both routes.
>
> **All five routes under `src/app/api/v1/workflows/` were checked**, not just the two named:
> `[id]` GET/PUT/DELETE and `[id]/run` POST were already `getWorkflow(id, ctx.userId)`; the
> collection GET was already `listWorkflows({createdBy})` with the same filter on its `total`; the
> collection POST stamps `createdBy: context.userId`. There is no steps or logs sub-route.
>
> **No admin surface was broken.** Checked the way `authorizeAuditRead` gates `GET /api/v1/audit`:
> these routes carry no role read, and nothing outside `src/app/api/v1` calls them — the UI's own
> runs pages query the database directly.
>
> **Proof:** `src/app/api/v1/workflows/__tests__/runs-owner-scope.db.test.ts` (new) — real
> PostgreSQL, real unmocked `withApiAuth`, real route handlers, two real keys from the existing
> `mintApiKey` fixture. Measured **red first** at `Tests 6 failed | 11 passed (17)`, with the red
> asserted on the SERIALIZED RESPONSE BODY rather than the status code, so it shows user A actually
> receiving B's `trigger_data`; green at `17 passed (17)`. The step leak is a separate marker
> because `serializeRunStep` is a second verbatim passthrough. Anti-vacuity: A reading A's own runs
> and run detail must succeed and must contain A's markers, and B reading B's own must too.
>
> **The gate built for this fired.** `route-authorization.test.ts`'s inverted-polarity
> `ACCEPTED_KNOWN_ROUTES` control went red on the fix and forced the carve-out out: the list, its
> two controls and its `EXEMPT_LISTS` entry are deleted, `MIN_EXEMPT_MATCHED` 11 → 9,
> `SUPPRESSED_BY_EXEMPTION` 12 → 10, `RAW_OFFENDERS` 13 → 11. Both routes are covered by the
> ordinary offender sweep now, and a named replacement cell asserts they are neither flagged NOR
> exempt, so the hole cannot be re-hidden.
>
> Both operations were also **undocumented in `public/openapi.yaml`** — no path item at all — and
> are now documented with their 404 and held by the parsed-YAML gate in both polarities (scope
> 10 → 12 operations). `DOC-48-01` is not closed by that.

**Proof:** `src/lib/triggers/trigger-owner-scope.db.test.ts` (new) — real PostgreSQL, real
mutations, real `crmBus`, real route handlers, real minted API keys; measured red first at
`Tests 7 failed | 6 passed (13)`, and the negative is asserted twice per cell, by direct SQL AND
from what the real `GET /api/v1/workflows/{id}/runs` handler serves. Plus four fail-closed cells in
`src/lib/triggers/matcher.test.ts`.

---

## DEF-48-08 — the engine now enforces a STRICTER rule than the product does, for deals, on purpose

**Found during:** the iteration-3 code review (WR-13). Recorded because it is a **behavioural
change to a shipped feature** and nothing in `48-SUMMARY.md`, this file or `BACKLOG.md` mentioned
it — the review was right that the divergence was real and right that it was undocumented.

`assertCallerOwnsTarget` and `callerScope` (`src/lib/execution/actions/crm.ts`) are pure
`eq(ownerColumn, userId)` with **no role read**. `src/app/deals/actions.ts:89,161,254,347,445,482`
each read `deal.ownerId !== session.user.id && session.user.role !== "admin"` and then call
`updateDealStageMutation(id, stageId, session.user.id)` / `deleteDealMutation(id, session.user.id)`
with the **admin's** id. So an admin can do through the UI what the engine now refuses.

**Concrete consequence.** An admin's workflow with a `deal.stage_changed` trigger and a
`crm_action` node aimed at `{{trigger.data.id}}` used to update whichever deal moved. It now
terminates `failed` with `No deal found with id '<uuid>'` for every deal the admin does not
personally own — which is precisely the "turn a supported admin action into 'Deal not found'"
outcome the iteration-2 fix pass cited as its reason for NOT editing `deleteDealMutation`. The same
asymmetry, created in the opposite direction, one layer up.

**THE DECISION: keep it. Do not add an admin bypass to the engine.** Failing closed is the right
default here, and the alternative is actively dangerous: combined with what CR-05 was, an admin
bypass in the engine would have turned one admin-authored workflow into a standing read of every
record in the deployment. Activities, people and organizations have **no** admin bypass anywhere
(zero `role !== "admin"` matches in their action files), so adding one to the engine would also make
the four entities disagree in a way no single predicate expresses — which is DEF-48-05's problem
restated.

**What a future phase should do instead**, if an admin automation is wanted: give the engine an
explicit role read (`select role from users where id = $userId`) that bypasses
`assertCallerOwnsTarget` for `deal` ONLY, matching `deals/actions.ts` exactly, and gate it behind
the CR-05 owner scope so an admin workflow still only fires on records it is entitled to. That is a
product decision about what an admin automation may do, not a predicate to tighten.

**Owner:** Phase 49 (Mutation-Layer Truth After Commit), alongside DEF-48-05 — the two are the same
question asked from the two ends.
