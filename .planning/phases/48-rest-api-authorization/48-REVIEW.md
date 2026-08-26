---
status: findings
phase: 48-rest-api-authorization
reviewed: 2026-08-26T04:32:57Z
iteration: 2
depth: standard
files_reviewed: 30
critical: 2
warning: 3
info: 1
---

# Phase 48 (REST API Authorization) — Code Review, Iteration 2

**Depth:** standard (per-file, TypeScript/Next.js/Drizzle-aware)
**Scope:** re-verification of the eight iteration-1 findings the fix pass claims to have closed, plus
adversarial review of the new module `src/lib/api/db-errors.ts` and of the two widened gates.

## Summary

Seven of the eight fixed findings hold on the code, and they hold well. Every claim I could
falsify, I tried to: I read the compiled-sort-key proof rather than trusting DEF-48-04, I checked
that `requireScopedPredicate`'s two `toThrow` cells would go red against the old `as SQL` shape,
I parsed `public/openapi.yaml` with `yaml.safe_load` and dumped the actual `responses` maps rather
than grepping, and I confirmed WR-05's new AST branch is proven in **both** polarities (P10/P11
flagged, N9/N10 not flagged) plus a boundary cell for `export const GET = handlers.GET`. The
`db-errors.ts` cause-walk is bounded, terminates on the cyclic fixture, and leaks **nothing** past
the five-character SQLSTATE into a response body — I checked `Problems.internalError()` and
`problemResponse` directly for that.

The one finding that has **not** fully closed is CR-01, and it fails on the exact question priority 1
asks: *every* writer of `activities.deal_id`. The fix pass closed the two `/api/v1` routes, added the
two read-side guards, and recorded `createActivityMutation` as DEF-48-03. There are **three** more
writers, not one, and the residual-risk paragraph in DEF-48-03 is measurably wrong about two of
them:

- `src/app/import/actions.ts:757-760` loads **every live deal in the database** with no owner
  predicate and matches by lowercased title. This plants a cross-owner `deal_id` with no attacker
  at all (CR-03).
- `src/lib/execution/actions/crm.ts` reaches `updateActivityMutation` / `deleteActivityMutation`
  with a caller-authored `targetId` and `fieldMapping.dealId`, from a route that authenticates with
  an API key. DEF-48-03 says the remaining writer "needs a hand-crafted server-action call"; it
  needs three ordinary `/api/v1` requests. Following that thread produced the most serious finding
  in this review: an API key can read, update and soft-delete **any** user's activity through
  `POST /api/v1/workflows` → `PUT /api/v1/workflows/{id}` → `POST /api/v1/workflows/{id}/run`,
  which is the same OWASP API1 class the phase reports as closed on activities (CR-02).

Beyond that: the read-side guard the fix pass added to the **list** route has zero assertions
anywhere in the suite (WR-08) — deleting it is green, which is the mirror image of this project's
standing rule; `?offset=` still has no ceiling and both list GETs are still unwrapped, so a single
query parameter is still an unhandled 500 (WR-09); and the `[row]` destructure inside WR-01's new
`try` is typed as non-optional, so an empty `.returning()` throws *outside* the block that exists to
prevent exactly that (WR-10).

Neither of the two self-declared weaknesses is a defect. WR-02's caveat is written where claimed
(`deferred-items.md` DEF-48-04, and `stages-scope.db.test.ts`'s own describe header) and the
substantive proof — `expect(keys).toHaveLength(2)` plus `rendered[1]` containing `"stages"."id"` in
`in-clause.test.ts:452-466` — **would** be red against the one-key route. WR-07's ablation is real:
`in-clause.test.ts:288-320` renders `.where(undefined)` and asserts the absence of `" where "` next
to a positive floor, and the two `requireScopedPredicate` throws are falsifiable by replacing the
function body with `return predicate as SQL`.

---

## 1. Verification of iteration-1 findings

| ID | Verdict | Evidence I read |
|---|---|---|
| **CR-01** | **PARTIALLY RESOLVED** | Write guards present and correct: `activities/[id]/route.ts:235-249` (PUT) and `activities/route.ts:205-215` (POST), both `and(eq(deals.id,…), eq(deals.ownerId, ctx.userId), isNull(deals.deletedAt))` → 422 `invalid_reference`, same shape as the house pattern at `deals/[id]/route.ts:225-256`. Read guards present on **both** projections: `activities/[id]/route.ts:144` and `activities/route.ts:137`. I grepped every `serializeDeal` site under `src/app/api/v1` — those two are the only places an activity can serialize a deal, and organization/person are reachable only *through* a deal the caller owns, so the projection coverage is complete. Behavioural cells are strong and correctly floored: `activities-scope.db.test.ts:770-818` (422 + `sqlDealIdOf` unchanged, read by direct SQL; positive anchor at `:797`; B-side symmetry at `:812`), `:821-863` (POST 422 + global `countAll` so a UUID-id row cannot hide), `:866-925` (read guard against a row planted by direct SQL, plus a positive anchor). **What is not closed:** three further writers of `activities.deal_id` — `src/app/import/actions.ts:757-760` + `:786-798` (CR-03), `src/lib/import/pipedrive-api-import-actions.ts:897-901` (same unscoped dedupe, narrower reach), and `src/lib/execution/actions/crm.ts:354` via `updateActivityMutation` (CR-02). DEF-48-03 names only the session-auth server action and asserts "what remains is an INTEGRITY gap … not a confidentiality one"; that is false for both CR-02 and CR-03. |
| **WR-01** | **RESOLVED** | Schema tightenings are real and match the columns: `activities/[id]/route.ts:38` (`due_at: z.string().datetime().optional()`, non-nullable against `.notNull()`), `:41` (`completed_at` keeps `.nullable()`, correctly), `activities/route.ts:27` (nullable on POST, justified by `due_at ? new Date(due_at) : now` at `:228`), `stages/[id]/route.ts:15-16,:28` (`int4` domain). `type_id` existence check at `activities/[id]/route.ts:261-271`, correctly existence-only (`activity_types` has no owner column). All five writes wrapped: `activities/[id]/route.ts:336-349`, `:411-417`, `stages/[id]/route.ts:178-189`, `:217-223`, `stages/route.ts:150-167`. `mapDeleteError` used on the one hard DELETE and `mapWriteError` everywhere else — the 23503-means-two-things split is right. **`db-errors.ts` reviewed in full** (priority 3): SQLSTATE→status mapping is sound; `23505` deliberately excluded from `INVALID_VALUE_CODES`; the `.cause` walk (`:107-120`) is bounded by `MAX_CAUSE_DEPTH = 5`, cannot loop (fixed-count `for`, not a `while`), and the cyclic fixture at `db-errors.test.ts:99-107` would time out red against an unbounded walk; the depth limit is not itself the bug — it fails **safe** (a SQLSTATE deeper than 5 becomes a logged 500, not a wrong 4xx). **No database internals reach any response body:** the 422 detail is `The request could not be applied (database error <5-char SQLSTATE>).`, the 409 detail is a route-supplied static string, and `Problems.internalError()` (`errors.ts:89-90`) has a fixed detail — no constraint name, column, table, statement or parameter. The original `.code`-on-top-level bug is genuinely fixed and the wrapped shape has its own cell (`db-errors.test.ts:73-89`) with a floor asserting the top level really carries no code. Two residuals are reported separately as WR-09 and WR-10. |
| **WR-02** | **RESOLVED** | `stages/route.ts:72` — `.orderBy(asc(stages.position), asc(stages.id))`. `activities/route.ts:105-110` gained the same trailing `asc(activities.id)`. The proof is falsifiable where it matters: `in-clause.test.ts:452-466` asserts `argsFor(builders[0], "orderBy")` has length **2** with a `> 0` floor in front of it, then that `rendered[1]` contains `"stages"."id"` specifically. Against the pre-fix one-key route that is red. The behavioural describe (`stages-scope.db.test.ts:812-874`) does hold a genuine position collision, proven by its own `having count(*) > 1` floor at `:836-851`, and its own header plus DEF-48-04 state plainly that it measured 28/28 against the unfixed route. **The caveat is written where claimed and the weakness is acceptable** — `LIMIT`/`OFFSET` over ties is unspecified, so a behavioural red would have been luck, and the compiled sort keys are a deterministic claim about the statement. |
| **WR-03** | **RESOLVED** | Parsed `public/openapi.yaml` with `yaml.safe_load`: 27 path items, 59 operations. Actual maps — `/activities/{id}` GET `[200,403,404]`, PUT `[200,403,404,422]`, DELETE `[204,403,404]`; `/stages` GET `[200,404]`, POST `[201,409,422]`; `/stages/{id}` GET `[200,403,404]`, PUT `[200,403,404,409,422]`, DELETE `[204,403,404,409]`. Every `$ref` resolves to a component that exists (`Conflict`, `Forbidden`, `NotFound`, `ValidationError` all present). Gate widened correctly: `REQUIRE_404_OPERATIONS` (7), `REQUIRE_409_OPERATIONS` (3), `REQUIRE_422_OPERATIONS` grew to 4. See §Gate integrity below for the falsifiability check. |
| **WR-04** | **RESOLVED** | `activities-scope.db.test.ts:344-365` and `stages-scope.db.test.ts:357-376` — `await removeFixtures()` now precedes the `for (const table of TOUCHED_TABLES) baseline[table] = await countAll(table)` loop in both files. The red-before-green is recorded in-source with the measured output (`Tests 30 passed (30) / Test Files 1 failed (1) / AssertionError: expected +0 to be 1`) from planting a single leftover `activity_types` row. `git show 1221f71` confirms the two statements were swapped rather than the delete being newly added, so the destructive-delete-before-connection-guard ordering is unchanged by this fix (and `vitest.db.config.ts:75-95` makes `DATABASE_URL` always resolve to `pipelite_dedup_test`, so the guard is belt-and-braces rather than the only control). |
| **WR-05** | **RESOLVED** | `route-authorization.test.ts:766-800` — form 3 is matched by `ts.isIdentifier(declaration.name) && VERBS.has(...)` with the initializer required to be an arrow **or** a function expression, and classified by the *same* `handlerAuthorizes` as form 1 (not exempted, not auto-flagged). Both polarities are pinned by fixtures the corpus cannot supply: P10 (`:1077-1099`, mixed shapes, `expected: ["DELETE:13"]` so a detector that flagged the neighbouring GET fails too), P11 (function-expression spelling), N9 (`:1296`, R2 authorized), N10 (`:1317`, R1 authorized). The dedicated cell at `:1391-1432` asserts `declarationHandlers 1 / arrowHandlers 1 / bindingHandlers 0`, per-handler `authorized`, per-handler `withApiAuthSeen`, and the exact flagged list. The boundary is covered too (`:1434-1449`, `export const GET = handlers.GET` must **not** become an arrow handler). No vacuous floor was added — `arrowHandlers` is measured 0 in the corpus and correctly has **no** `MIN_` floor. |
| **WR-06** | **RESOLVED** | `stages/[id]/route.ts:77-85` — three verdicts, absence decided before ownership: `if (!stage.pipeline \|\| stage.pipeline.deletedAt) return { stage: null, … }` then `if (stage.pipeline.ownerId !== userId) return { stage, owned: false }`. Priority 2 answered: nothing now returns 404 for a record that is the caller's and merely fails some *other* check — the only newly-404 branch is the trashed parent, which is the fix iteration 1 asked for and matches what `ownedStagesPredicate`'s `isNull(pipelines.deletedAt)` already did to the same row on the list. The discriminators are present and load-bearing: `route.test.ts:501-509` (foreign stage in a **live** pipeline still 403) and `:513-518` (live owner still 200), so the six 404 assertions cannot be satisfied by a helper that returns `stage: null` unconditionally. All three verbs asserted separately (`:430-475`), with `db.update`/`db.delete` asserted *not* called. |
| **WR-07** | **RESOLVED** | `stage-scope.ts:60-73` has no cast; `requireScopedPredicate` (`:115-132`) returns `SQL` because the compiler proves it from the `if`. The ablation the fix pass claims is real: `in-clause.test.ts:288-320` renders both forms side by side, asserts `scoped` contains `" where "` **and** `"owner_id"` as a floor, then that `collapsed` contains no `" where "`. The two `toThrow` cells (`:325-337`) are falsifiable — replacing the body with `return predicate as SQL` reds both — and the anti-vacuity anchor at `:341-347` stops a guard that threw unconditionally. `MANDATORY_SCOPE_TERMS` is pinned at 2 (`:353-356`), and the `termCount` half genuinely catches the named future edit (`[...(userId ? [eq(…)] : []), isNull(…)]` yields `terms.length === 1`). Both guards are unreachable from today's `ownedStagesPredicate` by construction — which is the stated intent and is documented as such, not concealed. Minor note, not a finding: a throw from `requireScopedPredicate` would escape the unwrapped `GET /api/v1/stages` as a framework 500; unreachable today, but it is the one place the new shape could produce a worse symptom than the old cast. |
| **IN-01** | **DEFERRED** | Unchanged. `activities/[id]/route.ts:297-300` still pushes `"dueDate"` unconditionally while every neighbour compares against `existingActivity` first. Out of fix scope. |
| **IN-02** | **DEFERRED** | Unchanged. `route-authorization.test.ts:434` still accepts `ne` as an authorization comparison. Out of fix scope. |
| **IN-03** | **DEFERRED** | Unchanged. `vitest.db.config.ts` still declares no `setupFiles` (verified by reading the whole config), so `registerAuditSubscriber()` is still never called in the test process and the `audit_log` half of the teardown proof is still 0 by construction. Out of fix scope. |
| **IN-04** | **DEFERRED, and now worse** | `stages/[id]/route.ts:99` still says "PUT (:93) and DELETE (:149)"; the calls are now at `:130` and `:200`. The fix pass inserted ~86 lines into `activities/[id]/route.ts` and ~43 into `stages/[id]/route.ts`, which invalidated a further set of line citations elsewhere — reported as IN-05 rather than as a re-raise of IN-04. |

### Gate integrity (priority 4)

**`openapi-error-coverage.test.ts` — can the widened gate still FAIL?** Yes. `REQUIRE_404_OPERATIONS`,
`REQUIRE_409_OPERATIONS` and the two extra `REQUIRE_422_OPERATIONS` entries are each asserted twice —
once that the status key is present in the operation's own `responses` map, once that its `$ref`
resolves to the exact component (`:509-540`, `:544-575`). Removing any one declaration from
`public/openapi.yaml` reds it. **No floor sits at or above its own measurement:** `MIN_PATH_ITEMS`
20 vs measured 27, `MIN_OPERATIONS` 45 vs measured 59 — I re-derived both by parsing the file, so
these are not restated from the comment. **No entry is satisfied trivially:** I traced each new
subject to the code path that emits it — `GET /stages` 404 at `stages/route.ts:40`, `POST /stages`
422 at `:113`/`:129` and 409 via `mapWriteError`'s `conflict` at `:163-166`,
`PUT /stages/{id}` 409 via `:185-188`, `DELETE /stages/{id}` 409 via `mapDeleteError` at `:220-222`,
`/activities/{id}` 404 at `:118`/`:175`/`:400`. `PUT /activities/{id}` correctly does **not** declare
409, because `mapWriteError` is called there with no `conflict` message (`:343-348`) and therefore
cannot return one — the inverted-polarity discipline held under widening.

**`route-authorization.test.ts` — can the widened detector still FAIL?** Yes, in both directions
(P10/P11 vs N9/N10 above). The widening added no new floor, so it created no false-RED risk; the
existing floors are all still below their measurements (36→30, 62→55, 8→4, 61→50, 55/28/130→40/15/90,
11 exempt matched, 2 accepted known routes). `walkRouteFiles` enumerated 36 `route.ts` files when I
listed them with `find`, matching `MIN_ROUTE_FILES`'s measurement.

---

## 2. New findings

### CR-02 (CRITICAL) — an API key can read, update and soft-delete ANY user's activity through the workflow engine, bypassing SEC-01 entirely

**Files:**
- `src/app/api/v1/workflows/route.ts:16` — `nodes: z.array(z.record(z.string(), z.unknown())).optional().default([])`
- `src/app/api/v1/workflows/[id]/route.ts:16` — `active: z.boolean().optional()`
- `src/app/api/v1/workflows/[id]/run/route.ts:51-57`
- `src/lib/execution/engine.ts:266-269`
- `src/lib/execution/actions/crm.ts:190-193` (`resolveIdByLookup`), `:354` (`mutations.update`), `:373` (`mutations.delete`)
- `src/lib/mutations/activities.ts:215-221` (`updateActivityMutation` — existence only), `:332-338` (`deleteActivityMutation` — existence only)

**Issue.** `POST /api/v1/workflows` accepts the `nodes` array as opaque `Record<string, unknown>`, so
the caller authors the node `config` verbatim. `handleCrmAction` resolves the target with
`resolveTargetId` → either `interpolate(String(config.targetId))` (an arbitrary id, unvalidated) or
`resolveIdByLookup`, whose query is:

```ts
await db.select({ id: def.idColumn }).from(def.table).where(ilike(column, lookupValue)).limit(1)
```

No owner predicate, and `lookupDefs.activity.fields` exposes `activities.title`. It then calls
`mutations.update(targetId, interpolatedFields, userId)` / `mutations.delete(targetId, userId)`, and
neither `updateActivityMutation` nor `deleteActivityMutation` compares `activity.ownerId` to the
`userId` argument — both only check that the row exists and is not soft-deleted. The workflow itself
*is* owner-scoped (`run/route.ts:24`, `getWorkflow(id, context.userId)`); the row it operates on is
not.

**Concrete failure scenario** (three requests, one API key, all `/api/v1`):

1. `POST /api/v1/workflows`
   `{"name":"x","nodes":[{"id":"n1","type":"action","config":{"actionType":"crm_action","entity":"activity","operation":"update","lookupField":"title","lookupValue":"%","fieldMapping":{}}}]}`
   → **201**.
2. `PUT /api/v1/workflows/{id}` `{"active":true}` → **200** (`triggerManualRun` requires only
   `workflow.active`; no manual trigger declaration is needed — `manual-trigger.ts:29-43`).
3. `POST /api/v1/workflows/{id}/run` → **201**.

The engine then runs `updateActivityMutation(<whatever activity `ilike '%'` returned first>, {}, A)`.
Wrong output: the mutation succeeds on a row user A does not own, and emits
`crmBus.emit("activity.updated", …)` carrying `data` = the victim's **full row** and `previous` =
the victim's full row (`mutations/activities.ts:310-318`) — title, notes, `customFields`, dueDate —
which the webhook subscriber delivers to whatever endpoint A registered via `POST /api/v1/webhooks`.
With `"operation":"delete"` the same chain soft-deletes the victim's activity and emits the
tombstone with `previous` set (`:350-357`). With `"targetId":"<known id>"` no enumeration is needed
at all.

This is the same OWASP API1 class as CR-01, on the same entity, reachable from the same
`withApiAuth` surface — and phase 48 reports activities as closed. It is **not** introduced by the
fix pass; iteration 1 missed it because it reviewed only the four route files. I surface it here
because priority 1 asked for every writer and this is the one DEF-48-03 describes as needing "a
hand-crafted server-action call".

**Fix.** Scope the mutations, not the routes — a route-level guard cannot help here because the
engine is the caller:

```ts
// src/lib/mutations/activities.ts — updateActivityMutation, deleteActivityMutation,
// toggleActivityCompletionMutation, updateActivityOwnerMutation
const activity = await db.query.activities.findFirst({
  where: and(eq(activities.id, id), eq(activities.ownerId, userId), isNull(activities.deletedAt)),
})
if (!activity) return { success: false, error: "Activity not found" }
```

and add `eq(def.ownerColumn, context._workflowUserId)` to `resolveIdByLookup`'s predicate so a
title lookup cannot cross an owner boundary. This is bigger than phase 48 and probably belongs in a
phase of its own — but it should be recorded as a security item now, not discovered again later,
because the phase's SUMMARY currently claims this endpoint's authorization is closed.

---

### CR-03 (CRITICAL) — CSV import links a user's activity to another user's deal, with no attacker required

**Files:**
- `src/app/import/actions.ts:757-760` (the unscoped deal load), `:786-798` (the title match), `:812-822` (the write)
- `src/lib/import/pipedrive-api-import-actions.ts:897-901` (same unscoped dedupe, narrower reach)
- `.planning/phases/48-rest-api-authorization/deferred-items.md:98-105` (the residual-risk claim this falsifies)

**Issue.**

```ts
// src/app/import/actions.ts:757
const existingDeals = await db.query.deals.findMany({
  where: isNull(deals.deletedAt),          // <- every deal in the database, every owner
  columns: { id: true, title: true },
})
…
const matchedDeal = existingDeals.find(
  (d) => d.title.toLowerCase() === item.dealTitle!.toLowerCase().trim()
)
if (matchedDeal) dealId = matchedDeal.id
…
rows.push({ …, dealId, ownerId: session.user!.id, … })
```

This is the third writer of `activities.deal_id` and it is the only one that needs no attacker:
`Array.prototype.find` returns whichever row PostgreSQL happened to emit first from an unordered
scan.

**Concrete failure scenario.** User A and user B each own a deal titled `Renewal 2026`. A uploads a
CSV whose activity row has `dealTitle = "Renewal 2026"`. `find` returns B's row. Wrong output:
`activities.deal_id` on A's newly imported activity is set to **B's deal id**, and A is told
"imported, 0 warnings" — the `Deal "…" not found` warning branch is not taken, because a deal *was*
found. Downstream:

- `src/app/activities/[id]/page.tsx:41-52` joins `deals`/`stages`/`pipelines` off `activities.dealId`
  with no owner predicate and renders `dealTitle`, `stageName` and `pipelineName` (`:202-213`), so
  A sees B's deal title, stage and pipeline name.
- `GET /api/v1/activities/{id}?expand=deal` *correctly* suppresses the deal (CR-01's read guard
  fires), which means the API now reports an activity that claims a `deal_id` the caller can never
  resolve — silent inconsistency between the two surfaces.
- B's deal now has a foreign child row it cannot account for, and `purgeDealMutation` will detach it.

DEF-48-03 states "The remaining writer is the session-auth server action, whose UI deal picker is
owner-scoped, so reaching it needs a hand-crafted server-action call … What remains is an INTEGRITY
gap … not a confidentiality one." Both halves are wrong: this writer needs no hand-crafted call, and
the planted row *is* read across the owner boundary by the session UI.

**Fix.** Scope the lookup, and keep the warning honest:

```ts
const existingDeals = await db.query.deals.findMany({
  where: and(isNull(deals.deletedAt), eq(deals.ownerId, session.user.id)),
  columns: { id: true, title: true },
})
```

Same change at `pipedrive-api-import-actions.ts:897-901`. Then correct DEF-48-03's writer
enumeration to four entries (mutation, CSV import, Pipedrive import, workflow `crm_action`) and
drop the "not a confidentiality one" claim.

---

### WR-08 (WARNING) — the read-side guard on the LIST route has zero assertions; deleting it is green

**File:** `src/app/api/v1/activities/route.ts:137`

**Issue.** CR-01's read half was added to two projections. The `[id]` one has four cells behind it
(`activities/[id]/__tests__/route.test.ts:493-560` and
`activities-scope.db.test.ts:866-925`, each with a positive anchor). The **list** one has none. I
grepped `expand=deal`, `expand.has("deal")` and `serialized.deal` across every test under
`src/app/api/v1`: every hit is against `/activities/{id}`, never `/activities`. The list route's own
suite (`activities/__tests__/route.test.ts`) has 14 `it`s and not one of them sets `?expand=`.

**Concrete failure scenario.** Delete ` && activity.deal.ownerId === ctx.userId` from
`activities/route.ts:137`. `tsc --noEmit` exits 0; `npm test` and `npm run test:db` stay green;
`route-authorization.test.ts` is unaffected (the handler still satisfies R1 through
`eq(activities.ownerId, ctx.userId)` at `:70`). Then
`GET /api/v1/activities?expand=deal` re-serializes B's deal, B's organization
(`website`, `industry`, `notes`, `custom_fields`) and B's person (`email`, `phone`, `notes`) for
every one of A's rows that already carries a foreign `deal_id` — and CR-03 shows such rows are still
being created. The guard's own comment calls itself "LOAD-BEARING"; nothing holds it. This is the
inverse of a vacuous gate: a live control with no test at all.

**Fix.** Add the list twin of the existing db cell — the same direct-SQL plant, then
`GET /api/v1/activities?expand=deal` for user A, asserting no element of `data` has a `deal` key and
that `JSON.stringify(body)` does not contain `${PREFIX}B-secret`, with the positive anchor
(A's own deal *does* come back) beside it:

```ts
// activities-scope.db.test.ts, alongside the existing describe at :866
await db.update(activities).set({ dealId: DEAL_B }).where(eq(activities.id, A_ACTIVITY_IDS[6]))
const body = await listAs(keyA.authorizationHeader, "?expand=deal")
expect(body.data.every(row => !("deal" in row))).toBe(true)
expect(JSON.stringify(body)).not.toContain(`${PREFIX}B-secret`)
```

---

### WR-09 (WARNING) — `?offset=` still has no ceiling and neither list GET is wrapped, so one query parameter is still an unhandled 500

**Files:** `src/lib/api/pagination.ts:24-32`; `src/app/api/v1/activities/route.ts:49-157`;
`src/app/api/v1/stages/route.ts:25-98`; `src/lib/api/stage-scope.ts:21-26` (documents the missing
ceiling)

**Issue.** Iteration 1's WR-01 opened with "the two list routes have no error handling at all". The
fix pass wrapped the five **writes** and left both list GETs unwrapped, which is correct for the five
enumerated bodies but leaves one reachable read-path 500 that `stage-scope.ts`'s own header already
names: *"`parsePagination` clamps `offset` at zero and imposes NO ceiling"*. That header claims the
consequence is gone because the raw `IN ()` fragment is gone. The ceiling is still missing.

`parsePagination` returns `Math.max(0, parseInt(raw, 10))` with no upper bound and no
`Number.isSafeInteger` check. drizzle renders `sql\` offset ${offset}\`` as a bound placeholder
(`drizzle-orm/pg-core/dialect.cjs:289`), and postgres.js serializes a JS number as `'' + x`.

**Concrete failure scenario.** `GET /api/v1/activities?offset=99999999999999999999` with a valid API
key. `parseInt` yields `1e20`, which survives both guards; `'' + 1e20` is
`"100000000000000000000"`; PostgreSQL's `OFFSET` is `bigint` (max `9223372036854775807`), so the
statement fails with `22003 value out of range for type bigint`. With 22 digits
(`?offset=1000000000000000000000`) the serialization is `"1e+21"` and the failure is
`22P02 invalid input syntax for type bigint`. Either way the rejection propagates out of an
unwrapped handler through a `withApiAuth` that has no `try`/`catch` (`auth.ts:22-77`) and Next.js
renders a framework 500 with no problem document — telling the caller to retry a request that will
fail identically forever, which is the exact sentence `db-errors.ts:22-24` gives as the reason this
class matters. Same request against `GET /api/v1/stages`.

**Fix.** Make it unrepresentable in the parser rather than catching it, matching the WR-01
preference:

```ts
// src/lib/api/pagination.ts
const MAX_OFFSET = 1_000_000            // far above any real page, far below int4/bigint limits
const offset = Number.isSafeInteger(rawOffset) ? Math.min(MAX_OFFSET, Math.max(0, rawOffset)) : 0
```

and add a cell asserting `parsePagination` clamps `?offset=99999999999999999999`, plus a route cell
asserting a 200 rather than a throw. (This affects every `/api/v1` list route, not only the two in
this phase — worth recording as a backlog item with the count.)

---

### WR-10 (WARNING) — the `[row]` destructure inside WR-01's new `try` is typed non-optional, so an empty `.returning()` throws OUTSIDE the block that exists to catch it

**Files:** `src/app/api/v1/stages/[id]/route.ts:177-189` and `:191`;
`src/app/api/v1/activities/[id]/route.ts:335-349` and `:355`

**Issue.**

```ts
let updatedStage: typeof stages.$inferSelect
try {
  const [row] = await db.update(stages).set(updateData).where(eq(stages.id, id)).returning()
  updatedStage = row                    // `row` is `T | undefined` at runtime
} catch (error) { return mapWriteError(…) }

return singleResponse(serializeStage(updatedStage))   // outside the try
```

`tsconfig.json` sets `strict: true` but not `noUncheckedIndexedAccess`, so `row` types as
`typeof stages.$inferSelect` while the runtime value is `undefined` whenever the UPDATE matches no
rows. The subsequent dereference is *after* the `catch`, so the `try` cannot see it. This shape
predates the fix pass (`git show 0fb8759` shows it was `const [updatedStage] = await …`), but WR-01
newly annotated it as non-optional and newly wrapped the statement while leaving the dereference
outside — so the block that advertises "an unwrapped rejection here is a 500 with no problem
document" still has one.

**Concrete failure scenario.** Stages are **hard** deleted, which makes this reachable rather than
theoretical. Owner holds two API keys and issues `PUT /api/v1/stages/stage-1` `{"name":"renamed"}`
and `DELETE /api/v1/stages/stage-1` concurrently. The PUT's `verifyStageOwnership` succeeds; the
DELETE commits; the PUT's `UPDATE … WHERE id = 'stage-1'` matches 0 rows; `.returning()` resolves to
`[]`; `row` is `undefined`; `serializeStage(undefined)` throws
`TypeError: Cannot read properties of undefined (reading 'id')` (`serialize.ts:126-138`) — outside
the `try`, out of an unwrapped `withApiAuth`, as a framework 500 with no problem document. The
activities PUT has the same shape at `:355` (`updatedActivity.customFields`), reachable via a soft
delete followed by `purgeActivityMutation`.

**Fix.** Treat the empty result as the "gone between check and write" case it is, inside the block:

```ts
let updatedStage: typeof stages.$inferSelect | undefined
try {
  ;[updatedStage] = await db.update(stages).set(updateData).where(eq(stages.id, id)).returning()
} catch (error) { return mapWriteError("api/v1/stages/[id]", error, { … }) }

if (!updatedStage) return Problems.notFound("Stage")   // already declared in openapi.yaml
```

`404` is already declared on both operations by WR-03, so this needs no contract change. Consider
enabling `noUncheckedIndexedAccess` so the compiler finds the other `const [x] = await …
.returning()` sites rather than a race finding them.

---

### IN-05 (INFO) — the fix pass shifted ~130 lines and invalidated the line citations two gates use as their written reasons

**Files:** `src/app/api/v1/__tests__/openapi-error-coverage.test.ts:140-146`, `:164-171`,
`:191-215`, `:332-335`, `:417`; `src/app/api/v1/stages/[id]/route.ts:99`

**Issue.** Same class as the deferred IN-04, but newly caused by this pass rather than a re-raise of
it: WR-01 inserted 86 lines into `activities/[id]/route.ts` and 43 into `stages/[id]/route.ts`, and
the gate's `reason` strings and subject-list doc-comments were not re-measured. `REQUIRE_403_OPERATIONS`
cites `activities/[id]/route.ts:106/:157/:308` — the `Problems.forbidden()` calls are at `123/181/405`;
`REQUIRE_404_OPERATIONS` cites `:110/:174/:369` — the `notFound` calls are at `118/175/400`;
`stages/[id]/route.ts:72/:102/:158` are now `107/137/207`; `MUST_NOT_DECLARE_403_OPERATIONS` cites
`activities/route.ts:165-167` for the `owner_id` refusal, which is now `186-190`, and
`stages/route.ts:62,:73` for `ownedStagesPredicate`, which is now `63` and `82`.

Two claims also disagree with their own constant: the `ALL_SUBJECTS` comment at `:332-335` says "the
union is 11 entries over 9 distinct operations" and the test title at `:417` says "the nine Phase 48
changed", while `EXPECTED_GATED_OPERATIONS` is 10 and the header block at `:210-232` correctly
explains *why* it became 10. The assertion is right; two of its labels are not.

This costs nothing today — the gate keys on paths and methods, not on line numbers — but in a
codebase that treats a cited line as evidence, a reader checking `stages/route.ts:62` finds an
`innerJoin` and has to re-derive the claim. **Fix:** re-measure the citations, or cite by symbol
(`Problems.forbidden()` in `DELETE`) instead of by line, and update the two "nine" labels to ten.

---

_Reviewed: 2026-08-26T04:32:57Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard — iteration 2_
