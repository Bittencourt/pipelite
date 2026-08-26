---
status: findings
phase: 48-rest-api-authorization
reviewed: 2026-08-26T00:00:00Z
depth: standard
files_reviewed: 16
critical: 1
warning: 7
info: 4
---

# Phase 48 (REST API Authorization) — Code Review

**Depth:** standard (per-file, TypeScript/Next.js/Drizzle-aware)
**Status:** issues_found

## Summary

The four production routes do apply the ownership predicate the phase set out to add, and they
apply it on every branch of the **primary** record: `activities/[id]` GET/PUT/DELETE compare
`ownerId` to `ctx.userId` before any read projection or write; `stages/[id]` reaches the check
through `verifyStageOwnership` on all three verbs with the relation loaded unconditionally;
`activities` GET and `stages` GET both feed the *same* predicate object to the page query and the
count query, so the `total`-leaks-cardinality class is genuinely closed; and `limit`/`offset` are
demonstrably applied after the `where` in both list routes (`in-clause.test.ts` asserts the method
ORDER on a per-builder call log, which is the right shape for that claim). `stage-scope.ts` is
clean on the specific defect it replaced — no raw `sql` fragment, no JS-derived list, no
empty-array path, no identifier built from request input, caller id bound as `$1`.

The defect the phase did **not** close is one level down: the ownership predicate constrains the
activity row but not the **relations the caller chooses to attach to it**. `deal_id` is written
into `activities` from both POST and PUT with no ownership check at all (and, on PUT, no existence
check either), and `?expand=deal` then serializes that deal plus its organization and its person
into the response. The house pattern for exactly this — validate every caller-supplied foreign key
against `eq(<table>.ownerId, ctx.userId)` and answer 422 `invalid_reference` — already exists one
directory over in `deals/[id]/route.ts:226-256`. That is CR-01 and it is the same OWASP API1
class the phase reports as closed on this endpoint.

Beyond that: the two list routes have no error handling at all, and four separate valid-per-zod
bodies produce an unhandled 500 (WR-01); `GET /api/v1/stages` paginates over a non-unique sort key
so a multi-pipeline account can silently lose stages between pages (WR-02); and the published
contract still omits 404/422 on six of the operations this phase edited, including the one whose
404 the phase's own gate documents in prose (WR-03).

On the test files: the gates are unusually well floored and I could not find an assertion that is
vacuous *as written* — every `toEqual([])` and every `not.toContain` I traced has a positive floor
in front of it, and no floor sits at or above its own measurement (36→30, 62→55, 8→4, 61→50,
50→30, 15→12, 55/28/130→40/15/90, 27→20, 59→45 all clear). Two real defects remain: the db
fixtures capture their baseline **before** cleaning up a previous aborted run, which converts an
earlier crash into a confusing false RED (WR-04), and the AST detector recognises only two of the
three export shapes Next.js accepts, leaving a shape that is invisible with no exemption entry and
no record (WR-05) — the same "N handlers seen as zero" failure the file claims to have eliminated.

---

## Critical Issues

### CR-01: `deal_id` is written unvalidated, and `?expand=deal` then serializes another user's deal, organization and person

**Files:**
- `src/app/api/v1/activities/[id]/route.ts:211-214` (PUT writes `updateData.dealId` directly)
- `src/app/api/v1/activities/[id]/route.ts:84-91`, `:120-126` (GET expands and serializes it)
- `src/app/api/v1/activities/route.ts:160-186` (POST forwards `deal_id`)
- `src/app/api/v1/activities/route.ts:77-84`, `:116-122` (list expands and serializes it)
- `src/lib/mutations/activities.ts:140-151` (validates the deal EXISTS, never that the caller owns it)

**Issue:** The ownership predicate added by 48-01 is applied to the `activities` row only. The
relation that gets attached to that row is chosen by the caller, and nothing constrains it.

`updateActivitySchema` accepts `deal_id: z.string().nullable().optional()`. In PUT the value goes
straight into the update object with **no ownership check and no existence check**:

```ts
if (updates.deal_id !== undefined) {
  updateData.dealId = updates.deal_id
  if ((updates.deal_id || null) !== existingActivity.dealId) changedFields.push("dealId")
}
```

`createActivityMutation` (the POST path) checks only `eq(deals.id, dealId), isNull(deals.deletedAt)`
— existence, not ownership.

Then `GET /api/v1/activities/:id?expand=deal` loads
`deal: { with: { organization: true, person: true } }` and projects
`serializeDeal(activity.deal)` plus `serializeOrganization(...)` and `serializePerson(...)`. Those
serializers expose the victim's `title`, `value`, `notes`, `custom_fields`, `owner_id`,
`website`, `industry`, and — via the person — `email` and `phone`
(`src/lib/api/serialize.ts:32-87`).

**Concrete failure scenario:**

1. Attacker (user A, valid API key) knows or obtains a deal id `D` owned by user B.
2. `PUT /api/v1/activities/<A's own activity>` body `{"deal_id": "D"}` → **200**. Ownership of the
   activity passes (it is A's), and `deal_id` is never checked. The row now links A's activity to
   B's deal.
3. `GET /api/v1/activities/<A's own activity>?expand=deal` → **200** with B's deal fully
   serialized, plus B's organization (`website`, `industry`, `notes`, `custom_fields`) and B's
   person (`email`, `phone`, `notes`).

`POST /api/v1/activities` with `{"title":"x","type_id":"…","deal_id":"D"}` reaches the same state in
one request instead of two. `GET /api/v1/activities?expand=deal` leaks it in the list body too.

Deal ids are `crypto.randomUUID()`, so this needs a known id rather than enumeration — but that is
a mitigation, not a control, and ids leak through webhook payloads, workflow trigger data and
exports. The *write* half (linking your activity to a foreign deal) succeeds unconditionally and
is itself an integrity defect: it plants a `deal_id` the victim's own deal can never account for.

**Fix:** apply the pattern already used by `src/app/api/v1/deals/[id]/route.ts:226-256`. In
`activities/[id]/route.ts` PUT, before building `updateData`:

```ts
if (updates.deal_id) {
  const deal = await db.query.deals.findFirst({
    where: and(
      eq(deals.id, updates.deal_id),
      eq(deals.ownerId, ctx.userId),
      isNull(deals.deletedAt)
    ),
  })
  if (!deal) {
    return Problems.validation([
      { field: "deal_id", code: "invalid_reference", message: "Deal not found" },
    ])
  }
}
```

and the same guard in `activities/route.ts` POST before `createActivityMutation` (the route, not
the mutation — the mutation is also called from the session-auth server-action path where
`input.userId` is already the owner, so tightening it there is a second, separate change).

Also add a behavioural test to `activities-scope.db.test.ts`: B's deal id planted on A's activity
must be refused with 422, and `?expand=deal` on an already-planted row must not return B's deal.

---

## Warnings

### WR-01: Four valid-per-zod request bodies produce an unhandled 500; none of the four routes has any error handling

**Files:** `src/app/api/v1/activities/[id]/route.ts:219-222`, `:207-214`;
`src/app/api/v1/stages/route.ts:132-141`; `src/app/api/v1/stages/[id]/route.ts:135-140`

**Issue:** `withApiAuth` has no `try/catch` (`src/lib/api/auth.ts:22-77`, and the
`stages-scope.db.test.ts` header says so explicitly), and none of the four routes wraps its write.
Every database error propagates out as a rejected promise, which Next.js turns into a 500. Several
are reachable with a body that passes zod:

1. `activities.dueDate` is `.notNull()` (`src/db/schema/activities.ts:13`) but the API schema
   declares `due_at: z.string().nullable().optional()`. `PUT /api/v1/activities/<own id>` with
   `{"due_at": null}` executes `updateData.dueDate = null` → `23502 null value in column
   "due_date" violates not-null constraint` → **500**, where 422 is correct.
2. `{"due_at": "not-a-date"}` → `new Date("not-a-date")` is `Invalid Date`; postgres.js serializes
   via `toISOString()` → `RangeError: Invalid time value` → **500**. Same for `completed_at`.
3. `{"type_id": "does-not-exist"}` or `{"deal_id": "does-not-exist"}` on PUT → `23503` FK
   violation → **500**. The POST path returns a clean 422 (`"Activity type not found"` /
   `"Deal not found"`) for the identical input, so the two verbs disagree on the same error.
4. `POST /api/v1/stages` with a `name` that already exists in the caller's own pipeline →
   `23505` on the unique `(pipeline_id, name)` index → **500**, where `Problems.conflict` (409,
   already defined and unused) is correct.
5. `PUT /api/v1/stages/:id` with `{"position": 1e12}` → `position` is an integer column →
   `22003 numeric field overflow` → **500**.

**Fix:** at minimum make the two schema/database contradictions unrepresentable —
`due_at: z.string().datetime().optional()` (non-nullable, matching `notNull()`) and validate
`type_id`/`deal_id` before the update as in CR-01 — and wrap each write in a `try/catch` that maps
`23505` to `Problems.conflict`, `23503`/`23502`/`22003` to `Problems.validation`, and anything
else to `Problems.internalError` after `log.error`.

### WR-02: `GET /api/v1/stages` paginates over a non-unique sort key, so a multi-pipeline caller can silently lose stages between pages

**File:** `src/app/api/v1/stages/route.ts:63-65`

**Issue:** `.orderBy(asc(stages.position)).offset(offset).limit(limit)` — `position` is unique only
*within* a pipeline. `POST /api/v1/stages` assigns `1000` to the first stage of every pipeline and
`max + 1000` thereafter (`:127-129`), so every pipeline a caller owns contributes a stage at
`1000`, one at `2000`, and so on. `LIMIT`/`OFFSET` over a sort with ties is unspecified in
PostgreSQL: the same row may appear on two pages and another may appear on none.

**Concrete failure scenario:** caller owns pipelines P1 and P2, each with 5 stages at
1000…5000 — 10 rows over 5 distinct sort keys. `GET /api/v1/stages?limit=5&offset=0` followed by
`?limit=5&offset=5` can return `P1-1000` in both pages and never return `P2-1000`. `meta.total` is
10 in both responses, so a client that pages until it has `total` rows either loops forever or
stops with a set that is missing a stage. Under the default `limit=50` this is invisible for small
accounts, which is why it survived.

`stages-scope.db.test.ts` cannot catch it: its fixture deliberately seeds six globally distinct
positions (`A_POSITIONS = [1000,2000,3000,4000]`, `B_POSITIONS = [1500,2500]`, and the comment at
`:241-242` states the order is total *because* of that), so the tie case is never exercised.

**Fix:** add a unique tiebreaker, and seed a colliding position in the db fixture so the assertion
can fail:

```ts
.orderBy(asc(stages.position), asc(stages.id))
```

(the same applies, less acutely, to `activities/route.ts:92`, whose final key `createdAt` is not
unique for bulk-created rows).

### WR-03: Six operations this phase edited still declare no 404/422 — including the one whose 404 the phase's own gate documents

**Files:** `public/openapi.yaml:2336-2349`, `:2360-2369`, `:2062-2090`, `:2416-2442`;
`src/app/api/v1/__tests__/openapi-error-coverage.test.ts:181-186`

**Issue:** The gate's stated rationale is that "a 403 that the contract does not mention is
indistinguishable from an outage, and the usual reaction to an unexpected non-2xx is a retry". That
argument applies verbatim to 404 and 422, and the phase left them undeclared on operations it
changed:

- `GET /stages` declares `'200'` only. It returns `Problems.notFound("Pipeline")` — a **404** — for
  an unknown or foreign `?pipeline_id=` (`stages/route.ts:38-40`). The gate's own
  `MUST_NOT_DECLARE_403_OPERATIONS` entry writes that 404 down as the measured reason the operation
  has no 403, and then never asserts it exists in the spec.
- `POST /stages` declares `'201'` only. It returns **422** for a zod failure and for
  `pipeline_id` not owned (`stages/route.ts:104-121`).
- `PUT /activities/{id}` and `DELETE /activities/{id}` declare 403 and 422/204 but no **404**
  (`activities/[id]/route.ts:151`, `:303`).
- `PUT /stages/{id}` and `DELETE /stages/{id}` declare 403 but no **404**
  (`stages/[id]/route.ts:98`, `:154`), and PUT returns **422** on a zod failure (`:114`).

**Concrete failure scenario:** an integrator generates a client from the spec, calls
`GET /api/v1/stages?pipeline_id=<a pipeline they just deleted>`, receives a 404 the generated
client has no branch for, and — per the gate's own reasoning — retries it as a transient fault.

**Fix:** add `'404': {$ref: '#/components/responses/NotFound'}` to those five operations and
`'422': {$ref: '#/components/responses/ValidationError'}` to `POST /stages` and
`PUT /stages/{id}`, then extend the gate with `REQUIRE_404_OPERATIONS` in the same shape as
`REQUIRE_403_OPERATIONS` so the additions are held rather than described.

### WR-04: The db fixtures capture their table baseline BEFORE cleaning up a previous aborted run, turning an earlier crash into a misdiagnosed false RED

**Files:** `src/app/api/v1/activities/activities-scope.db.test.ts:287-291`;
`src/app/api/v1/stages/stages-scope.db.test.ts:348-352`

**Issue:**

```ts
beforeAll(async () => {
  for (const table of TOUCHED_TABLES) baseline[table] = await countAll(table)
  // A previous aborted run must not make this one report someone else's rows.
  await removeFixtures()
```

The baseline is measured *including* any leftover rows, and then those rows are deleted. `afterAll`
asserts `countAll(table) === baseline[table]`.

**Concrete failure scenario:** a run is killed (`Ctrl-C`, container restart, OOM) after
`beforeAll` inserted 2 users, 2 keys, 1 activity type and 10 activities, so `afterAll` never ran.
The next run measures `baseline.activities = N + 10`, deletes the 10 leftovers, seeds 10 fresh
ones, deletes them again in `afterAll`, and asserts `N === N + 10` → **red**, with the message
"nothing that was NOT ours changed in number either. This is what catches a pre-existing row that
was mutated rather than created" — which is a precise description of a failure that did not
happen. The run after that is green, so the signal is a one-shot false RED that points at the
wrong cause.

**Fix:** clean first, then measure.

```ts
beforeAll(async () => {
  await removeFixtures()
  for (const table of TOUCHED_TABLES) baseline[table] = await countAll(table)
```

### WR-05: The authorization detector recognises only two of the three export shapes Next.js accepts; the third is invisible with no exemption entry and no record

**File:** `src/app/api/v1/__tests__/route-authorization.test.ts:716-771`

**Issue:** `scanSource` collects `ts.isFunctionDeclaration(statement)` (form 1) and
`ts.isVariableStatement` whose declaration name is an `ObjectBindingPattern` (form 2). Next.js also
accepts `export const GET = async (request: NextRequest) => { … }` — a `VariableStatement` whose
declaration name is a plain `Identifier`. That branch hits `if (!ts.isObjectBindingPattern(...)) continue`
and the handler is never added to `handlers`, so it can be neither authorized nor an offender.

The `noHandler` control at `:1390-1395` catches this only when the file has *no* other handler. A
file that mixes shapes slips through entirely.

**Concrete failure scenario:** someone adds to an existing `route.ts`:

```ts
export async function GET(request: NextRequest) {           // authorized, satisfies R1
  return withApiAuth(request, async (req, ctx) => { … eq(deals.ownerId, ctx.userId) … })
}
export const DELETE = async (request: NextRequest) => {     // no auth at all
  const { id } = await request.json()
  await db.delete(deals).where(eq(deals.id, id))
  return new NextResponse(null, { status: 204 })
}
```

`declarationHandlers` = 1, `bindingHandlers` = 0, `handlers.length` = 1 (so `noHandler` is
satisfied), `GATE_OFFENDERS` = `[]`, `SUPPRESSED_BY_EXEMPTION` unchanged, every floor still clears
(62→63 declaration handlers is above 55). The gate is green over a live unauthenticated DELETE.
Currently no `/api/v1` route uses that shape (verified: 36 `route.ts` files, 4 binding-form, 0
`export const <VERB> =`), so this is a hole rather than a live defect — but it is precisely the
"eight handlers seen as ZERO, with no exemption entry, no reason and no record" failure the file's
own header says it exists to eliminate.

**Fix:** in form 2, also accept `ts.isIdentifier(declaration.name) && VERBS.has(name)` when the
initializer is an arrow function or function expression, classify it with `handlerAuthorizes` like
form 1, and add a `KNOWN_POSITIVE` fixture in that shape (an unauthorized
`export const DELETE = async () => …`) plus a `KNOWN_NEGATIVE` counterpart, so the new branch is
proven before the corpus is swept.

### WR-06: `verifyStageOwnership` conflates "pipeline is in the trash" with "not yours", so the legitimate owner gets 403 on their own stage

**File:** `src/app/api/v1/stages/[id]/route.ts:46-48`

**Issue:**

```ts
if (!stage.pipeline || stage.pipeline.ownerId !== userId || stage.pipeline.deletedAt) {
  return { stage, owned: false }
}
```

`owned: false` maps to `Problems.forbidden()` in all three verbs. A soft-deleted pipeline is not an
authorization failure — the caller owns it.

**Concrete failure scenario:** the owner soft-deletes pipeline P (it goes to trash, recoverable),
then requests `GET /api/v1/stages/<a stage of P>` and receives
`403 {"title":"Forbidden","detail":"You don't have access to this resource"}` for a record they own
and can restore. `GET /api/v1/stages` meanwhile just omits it (`isNull(pipelines.deletedAt)` in
`ownedStagesPredicate`), so the two endpoints disagree about the same row: one says "not yours",
the other says "does not exist". This is the same 403-to-the-owner shape 48-03 fixed, on a
different branch of the same predicate.

**Fix:** separate the two verdicts so the soft-delete case answers 404, matching the list route:

```ts
if (!stage.pipeline || stage.pipeline.deletedAt) return { stage: null, owned: false }
if (stage.pipeline.ownerId !== userId) return { stage, owned: false }
return { stage, owned: true }
```

and add a fourth cell to `stages/[id]/__tests__/route.test.ts` (owner, pipeline `deletedAt` set →
404, not 403).

### WR-07: `as SQL` in `ownedStagesPredicate` disables the one type check that would catch a total scope bypass

**File:** `src/lib/api/stage-scope.ts:60-64`

**Issue:** `and(...)` in drizzle returns `SQL | undefined` — `undefined` when every argument is
`undefined`. The helper casts the result to `SQL`, and drizzle treats `.where(undefined)` as **no
WHERE clause at all**. The cast is the only thing standing between a future edit and an unfiltered
query, and it removes the compiler from that position in a function whose entire job is the
security boundary.

**Concrete failure scenario:** a later change makes the owner term conditional for a reason that
looks harmless (an admin path, a service token, a nullable `userId`):

```ts
return and(
  ...(userId ? [eq(pipelines.ownerId, userId)] : []),
  isNull(pipelines.deletedAt),
) as SQL
```

Called with `userId === ""` this returns `and(isNull(...))`, which is still narrowing; drop the
`isNull` too and it returns `undefined`, `.where(undefined)` emits no predicate, and
`GET /api/v1/stages` returns **every stage in the database** to every caller — page and count
alike, since both consume this one expression. `tsc` stays green, and no assertion in
`in-clause.test.ts` fires: `renderPredicate(undefined)` would throw rather than fail on content,
and the `sql.length > 0` floors are only checked on the two calls that pass a real `userId`.

**Fix:** make the impossibility structural instead of asserted — build the mandatory terms
explicitly so the return type is `SQL` without a cast:

```ts
export function ownedStagesPredicate(userId: string, pipelineId?: string | null): SQL {
  const owner = eq(pipelines.ownerId, userId)
  const live = isNull(pipelines.deletedAt)
  return pipelineId
    ? and(owner, live, eq(stages.pipelineId, pipelineId))!
    : and(owner, live)!
}
```

or keep the cast and add a control in `in-clause.test.ts` asserting
`renderPredicate(ownedStagesPredicate("", null))` still contains `"owner_id"`.

---

## Info

### IN-01: `changedFields.push("dueDate")` is unconditional, unlike every other field beside it

**File:** `src/app/api/v1/activities/[id]/route.ts:219-222`

Every other branch in the block compares against `existingActivity` before pushing
(`title`, `typeId`, `dealId`, `notes`, `completed`); `due_at` does not. `PUT` with a `due_at`
identical to the stored value reports `changedFields: ["dueDate"]` to the webhook and
workflow-trigger envelopes and widens the formula recalculation scope at `:265`. Fix: mirror the
neighbours — `if (updateData.dueDate?.getTime() !== existingActivity.dueDate?.getTime()) changedFields.push("dueDate")`.

### IN-02: R1 accepts `ne` as an authorization comparison, so an inverted predicate classifies as authorized

**File:** `src/app/api/v1/__tests__/route-authorization.test.ts:434`

`if (callee !== "eq" && callee !== "ne") return false` — a handler whose scope is
`ne(deals.ownerId, ctx.userId)` (that is, *everybody else's* rows) satisfies R1 and is reported as
authorizing. This falls inside the documented presence-gate limitation, but unlike R2's
`EQUALITY_OPERATORS` the `ne` acceptance has no written reason and no fixture pinning it — the
"distinguishes the five rules" probe only exercises `eq`. Either drop `ne` or add a fixture
recording the decision.

### IN-03: The `audit_log` half of the db-fixture teardown proof cannot fire in a vitest process

**Files:** `src/app/api/v1/stages/stages-scope.db.test.ts:737-743`;
`src/app/api/v1/activities/activities-scope.db.test.ts:205-212`

`registerAuditSubscriber()` is never called in the test process — `vitest.db.config.ts` declares no
`setupFiles`, and neither test file imports the subscriber, so `crmBus.on` has no listeners and
`emit` is a no-op. `countLeftovers("audit_log")` is therefore 0 by construction, not by evidence,
and the `it("wrote no audit_log row, so the baseline re-assert in afterAll is not covering for
one")` assertion cannot distinguish "reads are not audited" from "nothing in this process is
audited". Keeping `audit_log` in `TOUCHED_TABLES` for leak safety is right; the claim built on top
of it is not yet a control. Either import and register the subscriber (which would also exercise
the fire-and-forget insert racing teardown — worth knowing) or restate the assertion as
"unregistered in this process" so a reader is not misled.

### IN-04: Two comments in `stages/[id]/route.ts` disagree with a third about the same line numbers

**Files:** `src/app/api/v1/stages/[id]/route.ts:64`;
`src/app/api/v1/__tests__/route-authorization.test.ts:467-468` vs `:1618-1623`

`stages/[id]/route.ts:64` says "PUT (:93) and DELETE (:149) already reach the check through this
same call" and R3's doc-comment repeats `:93`/`:149`; the `verifyStageOwnership` calls are actually
at `:95` and `:151`, which the `AUTHORIZER_CALLS` block gets right (`:65, :95, :151`). In a
codebase that cites line numbers as evidence, two of three citations being stale by two lines is
worth a pass.

---

_Reviewed: 2026-08-26_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
