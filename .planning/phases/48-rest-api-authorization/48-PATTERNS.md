# Phase 48: REST API Authorization - Pattern Map

**Mapped:** 2026-08-25
**Files analyzed:** 10 (4 modified, 6 created)
**Analogs found:** 9 / 10 (1 with no in-repo precedent — see § No Analog Found)

> Sources read in full or in targeted non-overlapping ranges for this map:
> `src/app/api/v1/pipelines/[id]/route.ts` (171, full), `src/app/api/v1/stages/[id]/route.ts` (164, full),
> `src/app/api/v1/stages/route.ts` (163, full), `src/app/api/v1/activities/route.ts` (185, full),
> `src/app/api/v1/activities/[id]/route.ts` (:1-60, :60-85, :85-215, :215-240, :240-297),
> `src/app/api/v1/organizations/[id]/__tests__/route.test.ts` (173, full),
> `src/app/api/v1/notes/__tests__/route.test.ts` (:1-130, :140-200, :275-325),
> `src/lib/views/queries.db.test.ts` (:1-175, :175-330, :530-607),
> `src/lib/__tests__/suite-hook-hygiene.test.ts` (:169-300, :379-475, :605-650, :740-800, :1093-1140, :1276-1400, :1585-1680),
> `src/lib/mutations/__tests__/db-test-isolation.test.ts` (outline + :609-660),
> `src/lib/mutations/activities.test.ts` (:56-125, :700-740, :1055-1090), `src/lib/mutations/activities.ts` (:517-560),
> `src/lib/api/auth.ts` (77), `src/lib/api/errors.ts` (91), `src/lib/api/pagination.ts` (33),
> `src/lib/api/notes-collection.ts` (outline), `src/app/api/v1/activities/[id]/notes/route.ts` (17),
> `vitest.config.ts`, `vitest.db.config.ts`, `public/openapi.yaml` (:2015-2085, :2361-2427, :2840-2896),
> plus `47-PATTERNS.md`, `48-CONTEXT.md`, `48-RESEARCH.md`, `ROADMAP.md` § Phase 48.
>
> Measurements in this document were produced with `node -e` / a temporary `.mjs` run from the repo
> root and deleted afterwards. Repo verified clean with `git diff --exit-code`. No `grep | wc -l`.

---

## Answers to the seven questions the orchestrator asked, up front

**1. `pipelines/[id]/route.ts` is the reference shape, and its PUT guards immutable fields BY OMISSION,
not by a check.** All three verbs are the identical four-step shape: `await params` → `findFirst` on
`and(eq(id), isNull(deletedAt))` → `if (!row) return Problems.notFound("Pipeline")` → `if (row.ownerId
!== ctx.userId) return Problems.forbidden()`. `ctx.userId` arrives as the second parameter of the
`withApiAuth` callback and is never read from the body or the query string. The 404-before-403
ordering is fixed and identical in all three. **The immutable-field guard is that
`updatePipelineSchema` (`:13-16`) simply does not declare `owner_id`** — zod strips it, so there is no
runtime check to forget. That is the cheapest correct answer for `activities/[id]`'s PUT, and CONTEXT's
"reject loudly" decision means the plan must add an explicit rejection **on top of**, not instead of,
that omission — see § `activities/[id]/route.ts` for the two-line shape.

**2. `ownershipWith` needs no change; the fix is "GET calls the existing helper".** Verbatim below.
PUT (`:93`) and DELETE (`:149`) both call `verifyStageOwnership(id, ctx.userId)` and destructure
`{ stage, owned }`. GET does not call it at all — it reimplements the predicate at `:74` as a
byte-for-byte copy of the helper's `:46`, but reads a relation loaded by `:60-62`'s caller-controlled
`withOptions`. **The helper's `:35` is unconditional; the GET's `:60` is `expand.has("pipeline") ?
… : undefined`.** That single expression is the whole of SEC-02. The helper already returns exactly
the 404-vs-403 discrimination the GET performs. **Verdict: GET calls the helper unchanged.** One
consequence the plan must carry: the helper always loads `pipeline`, so the projection at `:80` must
stay gated on `expand` alone or a bare GET starts leaking the pipeline object.

**3. How the `organizations/[id]` test fails to detect a deleted predicate — four independent
mechanisms, all present, each sufficient.** Diagnosed at file:line in § `activities/[id]/__tests__/
route.test.ts`. Summary: (a) `vi.mock("@/db")` with a bare `findFirst: vi.fn()` (`:13-20`) that never
inspects its `where` argument, which is where 100% of the route's cross-user behaviour lives;
(b) the "non-owner" case is simulated with `mockResolvedValueOnce(undefined)` (`:165`) — the test
asserts the route's reaction to a *hypothetical database result* rather than the database's reaction to
the route's query, i.e. it assumes the very thing it claims to prove; (c) **there is no second identity
anywhere in the file** — `withApiAuth` is mocked to the constant `{ userId: "user-1", keyId: "key-1" }`
(`:24-26`), the only fixture is `ownerId: "user-1"` (`:58`), and "not the caller's" is represented by
*absence* rather than by a foreign owner, so no cross-user request is ever constructed; (d) every
assertion is on `response.status` plus mock-call counts (`:169-171`) — nothing reads
`findFirst.mock.calls[0][0].where` and nothing reads a returned row's `ownerId`.
**And the repo already contains the cure for (a)+(d):** `src/lib/mutations/activities.test.ts:112-113`
renders a captured `where` back to SQL with `new PgDialect().sqlToQuery()` and asserts on the text
(`:720-723`, `:1072-1073`). It was written for exactly this class of one-character-inversion defect.

**4. DB-backed harness: `src/lib/views/queries.db.test.ts` is the file to copy, and there is NO
transaction-rollback helper and NO api-key fixture helper anywhere in this repo.** Enumerated
programmatically: exactly two `.db.test.ts` files exist (`dedup.db.test.ts` 62.9 KB,
`queries.db.test.ts` 24.6 KB); **zero test files anywhere under `src/` or `e2e/` reference `apiKeys`
or `api_keys`** — the only consumers are `src/app/api/api-keys/**`, `src/lib/api-keys.ts`,
`src/db/schema/api-keys.ts`, `src/lib/timeline/types.ts` and two UI files. A two-user API-key fixture
would be **the first in the repository**. The discipline to copy is the five-part one at
`queries.db.test.ts:72-106` (module-scope connection guard), `:113` (one prefix), `:164-244`
(baseline-then-clean-then-seed `beforeAll`), `:246-260` (`afterAll` asserting both zero leftovers AND
`count(*) === baseline`), `:156-162` (`removeFixtures` in FK order). No config change is needed: both
vitest globs already cover a new `*.db.test.ts` (`vitest.config.ts:28` excludes, `vitest.db.config.ts:102`
includes) and `db-test-isolation.test.ts:641-647` asserts the db include stays length-1 — adding a file
does not touch it.

**5. Prior art for the Q10 gate: `suite-hook-hygiene.test.ts` is a complete, shipped template — and
the cost model says DO NOT contort the design to share a parse.** Measured this session on the real
corpus: `import ts from "typescript"` = **522.9 ms** (first import per process; matches 47-05's ~525 ms),
the route walk = **1.3 ms**, parsing all 36 `/api/v1` `route.ts` files = **161.7 ms** over **23,215 AST
nodes**. The Q10 corpus is `route.ts`, which is **disjoint** from the two existing gates' `*.test.ts`
corpus — there is no `CORPUS` constant to extend, and the thing 47-05 measured as expensive (~850 ms
per *independent test-corpus sweep*) does not apply: this corpus is ~5× smaller. **Total worst case for
a standalone gate file ≈ 690 ms.** Build it standalone. The skeleton to copy wholesale is at
`suite-hook-hygiene.test.ts:169-300` (imports + named `MIN_*` floors with measured numbers in
doc-comments), `:415-435` (the `readRepoFile` + recursive walk), `:613-620` (`scanSource(fileName,
sourceText)` — a **source string**, so fixtures reach the same code path), `:743-750` (the `file:line`
collector), `:1093-1119` (the `it.each` matcher self-test **including the KNOWN_NEGATIVE parse floor at
:1111-1119**), `:1278-1332` (the shared `CORPUS` + the four reach-floors), `:1338-1353` (the
`expect(offenders).toEqual([])` array-form assertion with a prescriptive failure message), and
`:1585-1678` (the self-sweep block).

**6. Self-sweep: it does NOT apply here, and that has to be asserted rather than assumed. Carve-outs
DO apply and have a measured, non-obvious member.** The Q10 gate at `src/app/api/v1/__tests__/
route-authorization.test.ts` lives *inside* the walked tree but its file-name predicate is
`entry.name === "route.ts"`, so it never enumerates itself — S1(e) is structurally satisfied, and the
gate must carry `expect(ROUTE_FILES).not.toContain(GATE_PATH)` as a **live control on that claim**
rather than a comment. The carve-out rule (S1(f), `deployment-docs-accuracy.test.ts:537-556` +
`:692-700` + `:593-600`) applies at full force, and § The Q10 Gate below names the exemption the
research sketch missed entirely.

**7. Traps that would make a correct fix go red — the honest answer is ZERO hard traps, and that is
itself the finding.** Enumerated programmatically across all 178 test files: **no test file imports,
constructs a request for, or asserts anything about `activities/route.ts`, `activities/[id]/route.ts`,
`stages/route.ts` or `stages/[id]/route.ts`.** There is no route-count floor, no snapshot, no fixture
encoding a foreign owner, no e2e spec touching these paths. CONTEXT's "zero test coverage" is
confirmed by enumeration, and the absence of a trap **is** the defect's survival mechanism. What does
exist is three **stale-artifact** items that a correct fix silently falsifies — see § Traps and Stale
Artifacts. Two of them are ungated (so they go stale rather than red), which makes them easier to miss,
not harder.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| **MOD** `src/app/api/v1/activities/[id]/route.ts` | route (controller) | request-response, per-record CRUD | `pipelines/[id]/route.ts:46-58`, `:84-95`, `:151-162` | **exact** — same verbs, same helpers, same `Problems` |
| **MOD** `src/app/api/v1/activities/route.ts` GET | route (controller) | request-response, list read | `pipelines/route.ts` / `organizations/route.ts` (WHERE-scoped list) | **exact** — the `conditions` array at `:53` is the same idiom |
| **MOD** `src/app/api/v1/activities/route.ts` POST | route (controller) | request-response, create | `organizations/batch/route.ts:58` (`userId: context.userId`, create-only) | **role-match** |
| **MOD** `src/app/api/v1/stages/[id]/route.ts` GET | route (controller) | request-response, per-record read | **itself** — `PUT :93` / `DELETE :149` call the file's own helper | **self** |
| **MOD** `src/app/api/v1/stages/route.ts` GET | route (controller) | request-response, list read + join | **itself** — the count query at `:84-93` already carries the correct `innerJoin` | **self** |
| **NEW** `src/app/api/v1/activities/[id]/__tests__/route.test.ts` | test (route, mocked) | request-response | `notes/__tests__/route.test.ts` (**copy**) vs `organizations/[id]/__tests__/route.test.ts` (**do NOT copy**) | **exact** |
| **NEW** `src/app/api/v1/activities/__tests__/route.test.ts` | test (route, mocked) | request-response | same | **exact** |
| **NEW** `src/app/api/v1/stages/[id]/__tests__/route.test.ts` | test (route, mocked) | request-response | same | **exact** |
| **NEW** `src/app/api/v1/activities/activities-scope.db.test.ts` | test (integration, real PG) | file-I/O → SQL | `src/lib/views/queries.db.test.ts` | **exact** for the harness; **no analog** for the api-key fixture |
| **NEW** `src/app/api/v1/stages/stages-scope.db.test.ts` | test (integration, real PG) | file-I/O → SQL | same, plus `queries.db.test.ts:546-590` (`.toSQL()`) | **exact** |
| **NEW** `src/app/api/v1/__tests__/route-authorization.test.ts` | test (static AST gate) | file-I/O → parse → transform | `src/lib/__tests__/suite-hook-hygiene.test.ts` | **exact** — same tooling, disjoint corpus |

**Cross-gate constraint on every one of the six new test files.** They are all `*.test.ts` under
`src/`, so `suite-hook-hygiene.test.ts` and `suite-timing-hygiene.test.ts` will enumerate them the
moment they land (`MIN_TEST_FILES = 150`, measured 178 → 184 after this phase). They therefore inherit
both gates' rules: **no dynamic `import()` inside a lifecycle hook, a test body, or any same-file
helper reachable from one** (use static top-level imports beside the hoisted `vi.mock` calls, the
house style at `src/app/notes/actions.test.ts:29-40`), and **no `expect()` over a clock-derived delta
or ratio**. Both are cheap to honour and expensive to discover at wave-merge time.

---

## Pattern Assignments

### `src/app/api/v1/activities/[id]/route.ts` (route, request-response) — MODIFY

**Analog:** `src/app/api/v1/pipelines/[id]/route.ts` — exact. Same imports, same `Problems`, same
`RouteParams`, same three verbs.

**Imports pattern** — `activities/[id]/route.ts:1-16` already matches `pipelines/[id]/route.ts:1-11`.
**No import changes are needed for the ownership fix.** `Problems` (`:3`), `withApiAuth`/`ApiAuthContext`
(`:2`) and `eq, and, isNull` (`:12`) are all present.

**The reference authorization predicate — `pipelines/[id]/route.ts:46-58` (GET), :84-95 (PUT), :151-162
(DELETE).** Three sites, one shape:

```typescript
const pipeline = await db.query.pipelines.findFirst({
  where: and(eq(pipelines.id, id), isNull(pipelines.deletedAt)),
  with: withOptions,
}) as PipelineExpanded | undefined

if (!pipeline) {
  return Problems.notFound("Pipeline")
}

// Verify ownership
if (pipeline.ownerId !== ctx.userId) {
  return Problems.forbidden()
}
```

Load-bearing details a reviewer will check:
- `ctx` is the **second callback parameter** of `withApiAuth` (`pipelines/[id]/route.ts:36`,
  `:80`, `:147`), never a request field. `withApiAuth` builds it solely from `validateApiKey`'s return
  (`src/lib/api/auth.ts:74-76`).
- **404 is decided before 403**, always. A missing row never reaches the ownership comparison.
- The predicate sits **after** the fetch and **before** any body parse, any zod parse, and any write.
  In PUT that means it precedes `await req.json()` (`:97`), so a foreign caller's body is never even
  read.
- `Problems.forbidden()` → HTTP 403, `{"type":".../FORBIDDEN","title":"Forbidden","status":403,
  "detail":"You don't have access to this resource"}` (`src/lib/api/errors.ts:49-55`).
  `Problems.notFound("Activity")` → 404 with `detail: "Activity not found"` (`:57-58`).

**Where the three insertions go**, each immediately after the existing `notFound` block:

| Verb | Existing fetch | Existing `notFound` | Insert after |
|---|---|---|---|
| GET | `:95-98` | `:100-102` | `:102` |
| PUT | `:141-143` | `:145-147` | `:147` — **before** `await req.json()` at `:151` |
| DELETE | `:271-273` | `:275-277` | `:277` |

`activities.ownerId` is `text NOT NULL`, so there is no null branch to handle — matching
`pipelines.ownerId`.

⚠ **The fix shape is coupled to the test validity and the plan must say so as a constraint.** CONTEXT
locks fetch-then-compare → 403. If an implementer instead moves the check into the `where`
(`and(eq(id), eq(ownerId, ctx.userId))`, the `organizations/[id]` idiom), the route returns **404**,
contradicting SC-4, **and** every mocked test in this phase silently becomes unfalsifiable — because a
mocked `findFirst` ignores its argument. This is not an implementation detail; it is the difference
between a proof and the tenth vacuous gate.

**PUT's `owner_id` — the reference guards it by OMISSION, and CONTEXT wants a loud rejection on top.**
`updatePipelineSchema` (`pipelines/[id]/route.ts:13-16`) declares only `name` and `is_default`; zod
strips anything else, so the reference file has no ownership-reassignment code to get wrong.
`updateActivitySchema` (`activities/[id]/route.ts:22`) declares `owner_id: z.string().optional()` and
`:188-191` writes it unconditionally:

```typescript
if (updates.owner_id !== undefined) {
  updateData.ownerId = updates.owner_id
  if (updates.owner_id !== existingActivity.ownerId) changedFields.push("ownerId")
}
```

CONTEXT resolves this: **reject, do not silently ignore.** The rejection goes beside the ownership
check, using the file's own validation idiom (`activities/[id]/route.ts:158-165` shows
`Problems.validation` with `{ field, code, message }`):

```typescript
if (updates.owner_id !== undefined && updates.owner_id !== ctx.userId) {
  return Problems.validation([{ field: "owner_id", code: "forbidden",
    message: "owner_id cannot be reassigned through this endpoint" }])
}
```

**Supporting evidence for "reject" from the mutation layer** — `src/lib/mutations/activities.ts:517-531`
already treats ownership reassignment as a **separate, narrow mutation** with its own audit path, and
its doc-comment records that `activitySchema`'s omission of `ownerId` is pinned as a standing
assertion in `activities.test.ts`. The route's PUT bypasses `updateActivityOwnerMutation` entirely and
writes the column directly. That is the design divergence SEC-01/SC-2 is a symptom of, and the plan
should record it even if it does not reroute the write in this phase.

**Assertion form CONTEXT requires:** on `body.data.owner_id` / the persisted row — **not** merely
`expect(mockDb.update).not.toHaveBeenCalled()`, which passes if the route rejects for an unrelated
reason.

---

### `src/app/api/v1/activities/route.ts` (route, list + create) — MODIFY

**Analog for GET:** the WHERE-scoped list idiom, and the file already has the exact structure. `:53`:

```typescript
// Build where conditions
const conditions = [isNull(activities.deletedAt)]

if (typeId)  { conditions.push(eq(activities.typeId, typeId)) }
if (dealId)  { conditions.push(eq(activities.dealId, dealId)) }
if (ownerId) { conditions.push(eq(activities.ownerId, ownerId)) }   // :61-63 — a caller-supplied
                                                                    // FILTER, not a scope
```

`conditions` is consumed by **both** the page query (`:82`) and the count (`:88-91`):

```typescript
const [activityList, countResult] = await Promise.all([
  db.query.activities.findMany({ where: and(...conditions), orderBy: [...], offset, limit, with: withOptions }),
  db.select({ count: sql<number>`count(*)` }).from(activities).where(and(...conditions))
    .then(rows => rows[0]?.count ?? 0),
])
```

**One line at `:53` scopes both** — which is precisely what makes SC-3's `meta.total` a meaningful
ceiling rather than a second unscoped number:

```typescript
const conditions = [isNull(activities.deletedAt), eq(activities.ownerId, ctx.userId)]
```

Keep the caller-supplied `owner_id` filter at `:61-63`: composed under `and(...)` it can only narrow
within the caller's own records, never widen. State that in the plan, because a reviewer will read
`:61-63` and reach for the delete key.

**POST (F2, in scope by file) — `:154-164`:**

```typescript
// If owner_id provided, verify owner exists
if (owner_id) {
  const owner = await db.query.users.findFirst({ where: eq(users.id, owner_id) })
  if (!owner) {
    return Problems.validation([{ field: "owner_id", code: "not_found", message: "Owner not found" }])
  }
}

// Determine owner - use provided owner_id or authenticated user
const activityOwnerId = owner_id || ctx.userId          // :164 — plants a record on another user
```

**Analog for the correct shape:** `organizations/batch/route.ts:58` — create-only, `userId:
context.userId`, no caller-supplied owner accepted at all. Applied here, the existence check at
`:154-161` becomes an ownership check with the same `Problems.validation` shape already in the file,
and the same reject-not-ignore rule as PUT. If the plan chooses to drop `owner_id` from
`createActivitySchema` (`:18`) instead, that is the `updatePipelineSchema` guard-by-omission pattern —
but it is a **silent** drop, which CONTEXT rejected for PUT and should reject here for the same reason.

---

### `src/app/api/v1/stages/[id]/route.ts` (route, per-record read) — MODIFY

**Analog: itself.** PUT and DELETE already do it correctly.

**The helper, quoted entirely — `:33-51`:**

```typescript
// Helper to verify stage ownership through pipeline
async function verifyStageOwnership(stageId: string, userId: string) {
  const ownershipWith: StageWith = { pipeline: true as const }          // :35 UNCONDITIONAL

  const stage = await db.query.stages.findFirst({
    where: eq(stages.id, stageId),
    with: ownershipWith,                                                // :39
  }) as StageExpanded | undefined

  if (!stage) {
    return { stage: null, owned: false }                                // :42-44
  }

  if (!stage.pipeline || stage.pipeline.ownerId !== userId || stage.pipeline.deletedAt) {
    return { stage, owned: false }                                      // :46-48
  }

  return { stage, owned: true }
}
```

**How PUT calls it — `:93-101`** (DELETE at `:149-157` is byte-identical):

```typescript
const { stage: existingStage, owned } = await verifyStageOwnership(id, ctx.userId)

if (!existingStage) {
  return Problems.notFound("Stage")
}

if (!owned) {
  return Problems.forbidden()
}
```

**How GET diverges — `:59-76`:**

```typescript
// Build with options based on expand
const withOptions: StageWith = expand.has("pipeline")     // :60-62  CALLER-CONTROLLED
  ? { pipeline: true as const }
  : undefined

const stage = await db.query.stages.findFirst({
  where: eq(stages.id, id),
  with: withOptions,                                      // :66
}) as StageExpanded | undefined

if (!stage) {
  return Problems.notFound("Stage")                       // :69-71
}

// Verify ownership through pipeline
if (!stage.pipeline || stage.pipeline.ownerId !== ctx.userId || stage.pipeline.deletedAt) {
  return Problems.forbidden()                             // :74-76
}
```

`:74` is a byte-for-byte copy of the helper's `:46`. The **only** difference is that `:66` loads the
relation the predicate reads only when the *caller* asked for it. Two concerns were conflated into one
variable: what the response should project (caller-controlled) and what the check needs (never
caller-controlled).

**Verdict, stated plainly for the plan: the fix is "GET calls the existing helper, unchanged." The
helper needs NO change.** It already returns the `{ stage, owned }` pair that yields exactly the
`:69`/`:74` 404-vs-403 discrimination, and its `!stage.pipeline` and `deletedAt` branches are
identical. The GET body becomes the PUT/DELETE prologue plus a projection:

```typescript
const { stage, owned } = await verifyStageOwnership(id, ctx.userId)   // authorization
if (!stage) return Problems.notFound("Stage")
if (!owned) return Problems.forbidden()

const serialized: Record<string, unknown> = serializeStage(stage)
// projection: caller-controlled, and only now
if (expand.has("pipeline") && stage.pipeline) {
  serialized.pipeline = serializePipeline(stage.pipeline)             // :80-82, UNCHANGED
}
return singleResponse(serialized)
```

Two behaviour changes a reviewer will notice, both of which need their own assertion:
1. The GET's own `findFirst` (`:64-67`) **disappears** — the helper's read serves both purposes. That
   is the "consistency by deletion" CONTEXT asked for.
2. `stage.pipeline` is now **always** populated, so `:80`'s `expand.has("pipeline") &&` guard becomes
   load-bearing where it was previously belt-and-braces. **Assert that a bare GET's body has no
   `pipeline` key**, or a security fix ships a smaller information leak. (This one is a genuine
   regression risk *created by the fix*, not a pre-existing one.)

---

### `src/app/api/v1/stages/route.ts` (route, list read) — MODIFY

**Analog: itself — the correct join already exists in the file, twelve lines below the defect.**

**The defect, `:59-81`** — a global page, then a JS post-filter, then the raw `IN`:

```typescript
const stageList = await db.query.stages.findMany({
  where: stageConditions.length > 0 ? and(...stageConditions) : undefined,
  orderBy: [asc(stages.position)],
  offset,                                                  // :62  paginates the WHOLE table
  limit,
  with: withOptions,
}) as StageExpanded[]

// Filter to only stages from user's pipelines (when no specific pipeline filter)
let userStages = stageList
if (!pipelineId) {                                         // :69  absence of a FILTER PARAM,
  const pipelineIds = [...new Set(stageList.map(s => s.pipelineId))]   // :70  [] when stageList is []
  const userPipelines = await db.query.pipelines.findMany({
    where: and(
      sql`${pipelines.id} IN ${pipelineIds}`,               // :73  -> `IN ()` -> SQLSTATE 42601
      eq(pipelines.ownerId, ctx.userId),
      isNull(pipelines.deletedAt)
    ),
    columns: { id: true },
  })
  const userPipelineIds = new Set(userPipelines.map(p => p.id))
  userStages = stageList.filter(s => userPipelineIds.has(s.pipelineId))  // :80  JS post-filter
}
```

**The correct predicate, already in this file, `:84-93`** — the count query is scoped exactly right:

```typescript
const countResult = await db
  .select({ count: sql<number>`count(*)` })
  .from(stages)
  .innerJoin(pipelines, eq(stages.pipelineId, pipelines.id))
  .where(and(
    eq(pipelines.ownerId, ctx.userId),
    isNull(pipelines.deletedAt),
    ...(pipelineId ? [eq(stages.pipelineId, pipelineId)] : [])
  ))
  .then(rows => rows[0]?.count ?? 0)
```

**So the whole fix is: make the LIST query adopt the COUNT query's join, and move `offset`/`limit`
after it.** That deletes `pipelineIds` entirely, which closes QG-03 at the root and closes F3 in the
same edit, and it means the page and the total are computed from one predicate instead of two. The
plan must **state which option it takes** — RESEARCH offers a minimal alternative
(`inArray(pipelines.id, pipelineIds)` alone, which fixes the 500 but leaves F3) and explicitly says not
to leave the choice to the executor.

⚠ **Consequence for the gate design.** If the join fix is taken, `inArray` never appears in the file
and a gate written against an `inArray` call site binds to nothing. **SC-5 must therefore be
behavioural** — the two-request control below — which is also what CONTEXT requires by name.

**Related note the plan needs:** `parsePagination` (`src/lib/api/pagination.ts:27`) clamps `offset` at
zero and imposes **no ceiling** — `const offset = Number.isNaN(rawOffset) ? 0 : Math.max(0, rawOffset)`.
That is why `?offset=<stage_count>` is reachable from the public API with one query parameter. Do not
"fix" QG-03 by adding an offset ceiling; that hides the defect behind a different behaviour change.

---

### `src/app/api/v1/activities/[id]/__tests__/route.test.ts` (test, mocked route) — NEW

**Analog to COPY:** `src/app/api/v1/notes/__tests__/route.test.ts`.
**Analog to explicitly NOT copy:** `src/app/api/v1/organizations/[id]/__tests__/route.test.ts`.

#### Why the organizations test cannot fail — the mechanism, at file:line

The test that claims the property (`:164-172`):

```typescript
it("returns 404 without calling the mutation when the organization is not the caller's", async () => {
  mockDb.query.organizations.findFirst.mockResolvedValueOnce(undefined)

  const response = await PUT(putRequest({ custom_fields: { Score: 999 } }), params)

  expect(response.status).toBe(404)
  expect(mockMutation).not.toHaveBeenCalled()
  expect(mockDb.update).not.toHaveBeenCalled()
})
```

Four independent reasons it stayed green under a three-site ablation:

| # | Mechanism | file:line | Why it is fatal |
|---|---|---|---|
| **(a)** | The db mock is `organizations: { findFirst: vi.fn() }` and **never inspects its `where` argument** | `:13-20` | The route's entire cross-user behaviour *is* that argument (`and(eq(id), eq(ownerId, context.userId))`). Deleting the predicate changes only a value the mock discards. |
| **(b)** | The "non-owner" case is `mockResolvedValueOnce(undefined)` | `:165` | This asserts the route's reaction to a **hypothetical database result**, not the database's reaction to the route's query. It encodes the conclusion ("the scoped query finds nothing") as its own premise. |
| **(c)** | **No second identity exists in the file.** `withApiAuth` is mocked to a constant, and the sole fixture is `ownerId: "user-1"` | `:24-26`, `:58` | "Not the caller's" is represented by *absence*, never by a foreign owner. No cross-user request is ever constructed. This is what CONTEXT means by "the negative case must be a genuine cross-user request". |
| **(d)** | Every assertion is `response.status` + mock-call counts | `:169-171` | Nothing reads `findFirst.mock.calls[0][0].where`; nothing reads a returned row's `ownerId`. There is no surface on which the predicate could be observed. |

**The contrast, and it is exact.** `notes/__tests__/route.test.ts` mocks the **fetch** and keeps the
**predicate** real. It carries a genuine foreign-owned fixture at `:91`:

```typescript
/** Same note, written by somebody else — the IDOR target. */
const foreignNote: Note = { ...authoredNote, id: "note-2", authorId: "user-9" }
```

…and it states in a comment why the predicate is not stubbed (`:35-41`):

```typescript
// Only `resolveActorRole` is stubbed. `isAuthorOrAdmin` stays REAL, so every authorization
// assertion below executes the same predicate the browser server action executes — a stubbed
// predicate would prove nothing about T-35-03.
```

…and it drives the foreign fixture through five separate cases (`:148`, `:166`, `:190`, `:282`,
`:310`), asserting 403 **and** the absence of the write each time (`:153-155`, `:286-288`).

**Because CONTEXT locks fetch-then-compare, this harness is sound for SC-1/SC-2/SC-4**: the mock
returns a foreign-owned row and `activity.ownerId !== ctx.userId` executes for real.

#### The harness skeleton to copy — `notes/__tests__/route.test.ts:1-33, 63, 93-121`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest, NextResponse } from "next/server"
// Type-only import: erased at runtime, so it does not resurrect the mocked module below.
import type { ApiAuthContext } from "@/lib/api/auth"

/** Mirrors the real `withApiAuth` handler contract in src/lib/api/auth.ts. */
type ApiRouteHandler = (request: NextRequest, context: ApiAuthContext) => Promise<NextResponse>

// `update` is present on the db mock precisely so a test can prove the route NEVER calls it.
vi.mock("@/db", () => ({
  db: { query: { activities: { findFirst: vi.fn() } }, update: vi.fn() },
}))

// Auth bypass: this suite is about what the route does AFTER authentication, and the bypass is
// what lets it assert the authorization step separately from the authentication step.
vi.mock("@/lib/api/auth", () => ({
  withApiAuth: vi.fn((req: NextRequest, handler: ApiRouteHandler) =>
    handler(req, { userId: "user-1", keyId: "key-1" })
  ),
}))

import { GET, PUT, DELETE } from "@/app/api/v1/activities/[id]/route"

function putRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/activities/act-1", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}
const params = { params: Promise.resolve({ id: "act-1" }) }
```

**No harness library exists and none should be added.** `next-test-api-route-handler`, `supertest`,
`node-mocks-http`, `msw` and `nock` are all absent from `package.json`; all 8 existing route tests
construct `new NextRequest(...)` by hand and pass `{ params: Promise.resolve({...}) }`.

**Additional mocks this route needs** that notes does not: `@/lib/events` (`crmBus.emit` at
`activities/[id]/route.ts:251` and `:286`), `@/lib/formula-recalc` and `@/lib/custom-fields` (`:213`,
`:233`). `src/app/api/v1/deals/__tests__/formula-recalc.test.ts:77-79` is the in-repo precedent for
mocking that exact cluster around a v1 route handler.

**The fixture pair, modelled on `notes:78-91`:**

```typescript
const ownedActivity = { id: "act-1", title: "Call client", typeId: "type-1", dealId: null,
  ownerId: "user-1", /* … */ deletedAt: null }
/** The same activity, owned by somebody else — the IDOR target. */
const foreignActivity = { ...ownedActivity, id: "act-2", ownerId: "user-9" }
```

**Assert the three verbs SEPARATELY** — CONTEXT is explicit that one shared helper test would hide two
of three, and RESEARCH exercised them as three independent HTTP requests to prove they fail
independently. Mirror `notes`' per-verb `describe` blocks (`:146`, `:263`).

#### If a `where`-scoped assertion is ever wanted — the in-repo precedent

`src/lib/mutations/activities.test.ts:105-113`, written for exactly this class of unobservable-predicate
defect:

```typescript
/**
 * Render a Drizzle `where` back to SQL text.
 *
 * The restore/purge existence check INVERTS the delete's predicate, and `isNull` vs `isNotNull`
 * is a one-character difference with opposite meaning — an assertion on the rendered predicate is
 * the only way to catch it, because both compile and both return a row-or-undefined.
 */
const renderQuery = (where: unknown) => new PgDialect().sqlToQuery(where as SQL)
const renderPredicate = (where: unknown): string => renderQuery(where).sql
```

…used at `:718-723`:

```typescript
await restoreActivityMutation("act1")

const where = mockDb.query.activities.findFirst.mock.calls[0][0].where
const rendered = renderPredicate(where)
expect(rendered).toContain("is not null")
expect(rendered).not.toMatch(/is null/)
```

Imports at `:62-63`: `import { PgDialect } from "drizzle-orm/pg-core"` / `import type { SQL } from
"drizzle-orm"`. **This is the assertion the organizations test needed and did not have.** It is
optional for this phase's fetch-then-compare routes but it is the right tool if the plan wants a
belt-and-braces check that the `activities/route.ts` GET `conditions` array reached the `where` —
and it runs in the base project, i.e. in CI, unlike the db-project proof.

---

### `src/app/api/v1/stages/[id]/__tests__/route.test.ts` (test, mocked route) — NEW

Same harness. Two file-specific notes:

- Mock `@/db` with `stages: { findFirst: vi.fn() }` and `update` / `delete` (the DELETE is a **hard**
  delete here — `stages/[id]/route.ts:160` — so the mock needs `delete`, unlike the activities file).
- The fixture must be a **stage carrying a `pipeline` relation**, because the predicate reads
  `stage.pipeline.ownerId`:
  ```typescript
  const ownedStage = { id: "stage-1", pipelineId: "pipe-1", position: 1000, /* … */
    pipeline: { id: "pipe-1", ownerId: "user-1", deletedAt: null, /* … */ } }
  const foreignStage = { ...ownedStage, id: "stage-2",
    pipeline: { ...ownedStage.pipeline, id: "pipe-2", ownerId: "user-9" } }
  ```

⚠ **The SC-4 vacuity trap, and the plan must label it.** Of the four cells, only one is a defect proof:

| Cell | Today | After fix | Status |
|---|---|---|---|
| owner + no expand → 200 | **403** | 200 | **THE PROOF. RED today.** |
| owner + expand → 200 | 200 | 200 | regression guard |
| non-owner + no expand → 403 | 403 **for the wrong reason** (relation never loaded, `!stage.pipeline` short-circuits at `:74`) | 403 via the real comparison | **regression guard — NOT evidence** |
| non-owner + expand → 403 | 403 | 403 | regression guard |

Assert all four. Present only the first as the negative control. A VALIDATION section that reports
SC-4 PROVED on the third cell is the ninth vacuous gate's shape repeated.

Plus the fix's own regression assertion: **bare GET body has no `pipeline` key** —
`expect(Object.keys(body.data)).not.toContain("pipeline")`.

---

### `src/app/api/v1/activities/activities-scope.db.test.ts` + `stages/stages-scope.db.test.ts` (test, real PostgreSQL) — NEW

**Analog:** `src/lib/views/queries.db.test.ts` — exact for the harness, **no analog** for the two-user
API-key fixture (see § No Analog Found).

**Why these two cannot be mocked, stated in the file header** — `queries.db.test.ts:6-27` is the essay
to adapt, and its middle paragraph is the argument this phase needs verbatim:

```
 *   - a mocked `@/db` cannot prove it. A mock returns whatever the test told it to return, so it
 *     asserts the shape of the call and not the effect of the predicate. Delete the `or(...)` and a
 *     mocked test still passes, because the mock was never going to return the private row anyway.
 *   - a source-text assertion cannot prove it either. `expect(source).toContain("isShared")` is
 *     satisfied by the comment that explains the rule …
 *
 * So the predicate is exercised against a real PostgreSQL, from BOTH DIRECTIONS: the owner of a
 * private view sees it, and a different account — including an ADMIN — does not. Only the pair is
 * a proof. The first assertion alone is satisfied by a query with no predicate at all; the second
 * alone is satisfied by a query that returns nothing.
```

That last sentence **is** SC-3's floor/ceiling/discriminator rule, already written down in this repo.

**1. Module-scope connection guard — `queries.db.test.ts:68-106`, copy near-verbatim:**

```typescript
const TEST_DATABASE = "pipelite_dedup_test"
/** The development database, named here only so it can be refused BY NAME. */
const DEV_DATABASE = "pipelite"

function assertIsolatedConnection(connectionString: string | undefined): string {
  if (!connectionString) throw new Error("DATABASE_URL is not set for the db vitest project. …")
  const url = new URL(connectionString)
  if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1")
    throw new Error(`refusing to run: connection host "${url.hostname}" is not loopback. …`)
  const database = url.pathname.replace(/^\//, "")
  if (database !== TEST_DATABASE) throw new Error(`refusing to run: connection names database "${database}" …`)
  return connectionString
}

assertIsolatedConnection(process.env.DATABASE_URL)   // module scope -> aborts COLLECTION
```

It runs at module scope on purpose: a wrong target aborts collection and **no statement is sent**.

**2. One prefix on every id and email — `:112-114`:**

```typescript
/** One prefix, on every id and every email. No `_` and no `%`, so no LIKE escaping is needed. */
const PREFIX = "viewsdbt-"
const LIKE_PREFIX = `${PREFIX}%`
```

Use a phase-specific prefix (`actscope-` / `stgscope-`). RESEARCH's own live reproduction used
`p48res-` and proved the discipline works.

**3. Baseline → clean → seed, `beforeAll` at `:164-244` (abridged):**

```typescript
/** Totals before the run, re-asserted afterwards: a prefix query cannot see a MUTATED row. */
const baseline: Record<string, number> = {}

async function countAll(table: string): Promise<number> {
  const rows = await db.execute(sql`select count(*)::int as n from ${sql.identifier(table)}`)
  return Number((rows as unknown as { n: number }[])[0].n)
}

const TOUCHED_TABLES = ["users", "saved_views", "saved_view_defaults"] as const

async function removeFixtures(): Promise<void> {
  // Foreign-key order: defaults reference views, views reference users.
  await db.delete(savedViewDefaults).where(like(savedViewDefaults.viewId, LIKE_PREFIX))
  …
  await db.delete(users).where(like(users.id, LIKE_PREFIX))
}

beforeAll(async () => {
  for (const table of TOUCHED_TABLES) baseline[table] = await countAll(table)
  // A previous aborted run must not make this one report someone else's rows.
  await removeFixtures()
  await db.insert(users).values([ /* … */ ])
}, 60_000)
```

**4. Teardown that catches a MUTATED row, not just a created one — `:246-260`:**

```typescript
afterAll(async () => {
  await removeFixtures()
  for (const table of TOUCHED_TABLES) {
    const leftovers = await db.execute(
      sql`select count(*)::int as n from ${sql.identifier(table)} where id::text like ${LIKE_PREFIX}`,
    )
    expect(Number((leftovers as unknown as { n: number }[])[0].n)).toBe(0)
    expect(await countAll(table)).toBe(baseline[table])
  }
}, 60_000)
```

**There is no transaction-rollback helper in this repo and neither `.db.test.ts` uses one.** Neither
file contains a `TRUNCATE`, a `DROP`, or an unfiltered `DELETE`. The baseline re-assert is the
substitute, and it is strictly stronger than a naive prefix-delete because it catches a pre-existing
row that was *modified*.

**5. Fixture-set self-check — `:593-606`.** Both new files need this shape, because it is the floor
that makes an empty or half-failed seed go red rather than green:

```typescript
describe("the fixture set is what these assertions assume", () => {
  it("holds exactly the seven views it created", async () => {
    const rows = await db.select({ id: savedViews.id }).from(savedViews)
      .where(like(savedViews.id, LIKE_PREFIX))
    expect(rows.map((r) => r.id).sort()).toEqual([...ALL_VIEW_IDS].sort())
  })
})
```

**6. Both-directions assertions with their own anti-vacuity half — `:274-296`.** This is SC-3's
discriminator, already implemented once in this repo:

```typescript
it("a different MEMBER does not see it", async () => {
  const ids = (await listVisibleViews("organization", viewerMember)).map((v) => v.id)
  expect(ids).not.toContain(OWNER_PRIVATE)
  // Direction 2's own anti-vacuity: the same read DOES return the shared views, so the absence
  // above is the predicate working rather than the query failing.
  expect(ids).toContain(OWNER_SHARED)
  expect(ids).toContain(MEMBER_PRIVATE) // their own private view
})
```

Applied to SC-3 with **named integer literals** (A:7, B:3, total:10 per RESEARCH), the floors and the
ceiling and the discriminator all live in one `describe` and every number is a literal, so an empty
database fails rather than passes.

**7. `.toSQL()` for a compiled-structure claim — `queries.db.test.ts:530-560`, the SC-5b pattern:**

```typescript
/**
 * `.toSQL()` compiles the query without executing it, so this reads the SQL that would actually be
 * sent. It is a compiled-structure assertion, not a source grep: the paragraphs of prose in
 * `queries.ts` that discuss `is_shared` … are invisible to it, and deleting one of those comments
 * does not change its outcome.
 */
it("compiles to a WHERE naming owner_id and is_shared", () => {
  const compiled = db.select({ id: savedViews.id }).from(savedViews)
    .where(visibleViewsPredicate(OWNER)).toSQL()

  expect(compiled.sql).toMatch(/where/i)
  expect(compiled.sql).toContain('"owner_id"')
  // The viewer id is a bound parameter, never interpolated into the statement text.
  expect(compiled.sql).not.toContain(OWNER)
  expect(compiled.params).toContain(OWNER)
})
```

This is the **only** legitimate textual assertion available to SC-5, and it is textual about
*compiled SQL*, not about route source. It is the exact opposite of the `expect(source).toContain("sql\`")`
grep CONTEXT forbids by name (Pitfall 7). Note RESEARCH's measured casing hazard: the raw fragment
renders `IN` and `inArray` renders `in` — make any such assertion case-insensitive, or better, assert
`.not.toContain("IN ()")` case-insensitively and let the behavioural control carry the proof.

**8. The behavioural control that is RED today and needs no ablation** — `?offset=<stage_count>`:

```typescript
const [{ n }] = await db.execute(sql`select count(*)::int as n from stages`)
expect(n, "an empty stages table makes the offset-past-the-end request prove nothing").toBeGreaterThan(0)  // FLOOR
const res = await GET(listRequest({ offset: n, limit: 5 }))
expect(res.status).toBe(200)          // 500 / SQLSTATE 42601 before the fix
expect((await res.json()).data).toEqual([])
```

Note the floor is mandatory and is the counting-gate rule applied: with zero stages, `offset: 0` is not
past the end and the assertion means nothing.

**Config: nothing to change.** `vitest.db.config.ts:102` includes `src/**/*.db.test.?(c|m)[jt]s?(x)`;
`vitest.config.ts:28` excludes the same glob; `db-test-isolation.test.ts:613-647` asserts both halves
and that the db include stays length-1. A new file at
`src/app/api/v1/activities/activities-scope.db.test.ts` is picked up by the db project and invisible to
the base project with **zero** config edits. `fileParallelism: false` and 60 s timeouts are already set
(`vitest.db.config.ts:110-118`).

**⚠ RESEARCH assumption A1 is untested and gates this harness.** `crmBus.emit` firing on the real PUT
/ DELETE path is assumed inert in a vitest process (subscribers register from `instrumentation.ts`,
which vitest does not load). It is cheap to verify — run one PUT through the real handler in the db
project and assert no outbound delivery row — and it should be a task in the plan, not a footnote.

---

### `src/app/api/v1/__tests__/route-authorization.test.ts` — the Q10 gate (test, static AST sweep) — NEW

**Analog:** `src/lib/__tests__/suite-hook-hygiene.test.ts` — same tooling (`import ts from
"typescript"`), same structure, **disjoint corpus**. This is the phase's central deliverable and the
only thing that makes the 37th route's missing check fail a build.

#### Measured facts the gate's floors must be built from (this session, `node` + `ts.createSourceFile`)

| Quantity | Measured | Suggested floor |
|---|---|---|
| `route.ts` files under `src/app/api/v1` | **36** | `MIN_ROUTE_FILES = 30` |
| `route.ts` files under `src/app/api` (incl. non-v1) | 52 | — (scope is v1) |
| Exported verb handlers in **FunctionDeclaration** form | **62** | `MIN_HANDLERS_PARSED = 50` |
| Handlers exported via `export const { GET, POST } = …` | **8**, in **4** files | must be handled — see below |
| `withApiAuth(...)` call expressions | **61** (= 62 − `docs/route.ts` GET) | `MIN_WITH_API_AUTH_CALLS = 50` |
| `context.userId` property accesses | **55** | token floor ≥ 40 |
| `ctx.userId` property accesses | **22** | token floor ≥ 15 |
| `*.ownerId\|userId\|authorId\|createdBy` property accesses | **123** | token floor ≥ 90 |
| Total AST nodes in the corpus | **23,215** | (informational) |
| `typescript` first import | **522.9 ms** | per worker, unavoidable |
| Corpus parse | **161.7 ms** | — |
| Directory walk | **1.3 ms** | — |

**Local authorizer function declarations actually present in v1 route files** (measured, so the
`AUTHORIZERS` set is not guesswork): `verifyStageOwnership` (2 calls), `authorizeNoteMutation` (2),
`authorizeAuditRead` (1). **Imported authorizers called from v1 routes:** `resolveActorRole` (5),
`getWorkflow` (4), `getWorkflowTemplate` (1).

**⚠ The identity expression has TWO spellings and the gate must accept both.** `context.userId` (55)
and `ctx.userId` (22) are both in live use across `/api/v1`. A detector that matches only one silently
under-detects by 26% and reports offenders that are correctly authorized.

#### ⚠ The exemption RESEARCH's sketch missed entirely, and it is the gate's most likely vacuity

Four route files export **no `FunctionDeclaration` at all**:

```
src/app/api/v1/activities/[id]/notes/route.ts
src/app/api/v1/deals/[id]/notes/route.ts
src/app/api/v1/organizations/[id]/notes/route.ts
src/app/api/v1/people/[id]/notes/route.ts
```

Each is 17 lines and delegates wholesale — `activities/[id]/notes/route.ts:12-17`:

```typescript
export const { GET, POST } = noteCollectionHandlers({
  entityType: "activity",
  entityLabel: "Activity",
  parentTable: activities,
  routeLabel: "/api/v1/activities/[id]/notes",
})
```

A `FunctionDeclaration`-only walker sees **zero handlers** in these files and therefore **zero
offenders** — they drop out of the sweep with no exemption entry, no reason, and no record. That is
precisely the anti-gate shape this milestone exists to eliminate, and it would ship inside the gate
built to prevent it. Two acceptable resolutions, and the plan must pick one **explicitly**:

1. Detect the binding form too (`VariableStatement` with an `export` modifier whose declaration name is
   an `ObjectBindingPattern` containing a verb name), and follow the delegation to
   `src/lib/api/notes-collection.ts` — where `withApiAuth` is called at `:85` and `:129`, and
   `context.userId` reaches `authorId` at `:161`.
2. Carve them out **as a live control** in the `OPERATOR_POSTGRES_DOCS` style: assert each of the four
   still exports via `noteCollectionHandlers`, assert `src/lib/api/notes-collection.ts` still calls
   `withApiAuth`, and assert the four are a **named list of exactly 4** matched **by path** against the
   enumerated corpus. A rewrite that inlines a handler into one of those files then turns the
   exemption red instead of silently escaping the sweep.

**Also exempt, each with a reason that is itself an assertion** (RESEARCH's list, verified):
`custom-field-definitions/**` and `workflow-templates/**` (no owner column in the schema — assert the
schema table has no `ownerId`), `docs/route.ts` (deliberately outside `withApiAuth` — assert it still
is, so a route that quietly loses the wrapper is caught), `audit/route.ts` and `trash/[type]/[id]/**`
(admin-only via `resolveActorRole` / `authorizeAuditRead` — assert the call is still there), and
**ACCEPTED-KNOWN: `workflows/[id]/runs/route.ts` + `workflows/[id]/runs/[runId]/route.ts`** (F1, real
and out of scope per CONTEXT — must be **listed by name and count**, because an accepted hole with no
name is indistinguishable from an oversight).

#### The gate must accept BOTH authorization idioms or it flags 9 correct handlers

`pipelines/[id]`, `stages/[id]`, `webhooks/[id]` use **fetch-then-compare → 403**;
`organizations/[id]`, `people/[id]`, `deals/[id]` use **`where`-scoped → 404**. Both are correct
authorizations. RESEARCH Open Question 5 records this; the gate is a **presence** gate over both
shapes. It cannot distinguish "authorizes correctly" from "authorizes" — a route comparing against the
wrong id passes it. **Write that limitation into the header**, or verify-work will over-read the gate.

#### Skeleton — `suite-hook-hygiene.test.ts`, section by section

**Imports and roots (`:169-181`):**

```typescript
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

import ts from "typescript"
import { describe, expect, it } from "vitest"

const REPO_ROOT = process.cwd()
const API_ROOT = "src/app/api/v1"
/** This file, by path. Named so the self-collision control can assert it is NOT enumerated. */
const GATE_PATH = "src/app/api/v1/__tests__/route-authorization.test.ts"
```

**The walk (`:419-435`)** — `readdirSync` recursion, **never `grep`** (which returns wrong counts in
this environment):

```typescript
function walkRouteFiles(relativeDir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(path.join(REPO_ROOT, relativeDir), { withFileTypes: true })) {
    const rel = `${relativeDir}/${entry.name}`
    if (entry.isDirectory()) out.push(...walkRouteFiles(rel))
    else if (entry.name === "route.ts") out.push(rel)
  }
  return out
}
const ROUTE_FILES = walkRouteFiles(API_ROOT).sort()
```

**A floor constant with its measured number in the doc-comment, set BELOW the measurement (`:216-227`):**

```typescript
/**
 * Floor on the number of `route.ts` files the walk enumerates under `src/app/api/v1`.
 * Measured on the tree this gate was written against: **36**. 30 is a deliberately loose floor,
 * set BELOW the measurement so that ordinary consolidation does not fatal with a message that
 * misdiagnoses shrinkage as a broken walk.
 *
 * Without this floor a wrong root constant or a broken recursion yields an empty file list,
 * therefore zero offenders, therefore a permanently green gate — the exact shape of the v1.3 gates
 * that could not fail.
 */
const MIN_ROUTE_FILES = 30
```

**`scanSource` takes a STRING, so the fixtures reach the same code path (`:605-620`):**

```typescript
/**
 * Exported and taking a source STRING rather than only a path, so the fixtures below reach exactly
 * this code path (S1(b)) …
 */
export function scanSource(fileName: string, sourceText: string): ScanResult {
  const src = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  …
  const lineOf = (node: ts.Node): number =>
    src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1
```

**The `file:line` collector (`:742-750`):**

```typescript
/** `file:line: scope container (opened at :N) contains text`, the house `file:line` collector shape. */
function formatHit(hit: ImportHit): string {
  return `${hit.file}:${hit.line}: ${hit.scope} ${hit.container} (opened at :${hit.containerLine})` …
}
```

For Q10: `${file}:${line}: ${verb} does not constrain the record by caller identity`.

**Matcher self-test FIRST, with the KNOWN_NEGATIVE parse floor (`:1093-1119`) — the single most
important block to copy:**

```typescript
describe("the hook/test/helper import matcher, unit-tested against fixtures FIRST", () => {
  /**
   * These assertions gate everything below them. A matcher that matches nothing yields an empty hit
   * list, an empty list satisfies `toEqual([])`, and the whole sweep becomes unfalsifiable. If any
   * fixture here is red, treat every pass further down as unproven.
   */
  it.each(KNOWN_POSITIVE)("MUST flag: $label", ({ source, expected }) => {
    const { hits } = scanSource("known-positive.ts", source)
    expect(hits.map((hit) => `${hit.scope} ${hit.container}:${hit.line}`)).toEqual([...expected])
  })

  it.each(KNOWN_NEGATIVE)("MUST NOT flag: $label", ({ source, scope }) => { … expect(relevant.map(formatHit)).toEqual([]) })

  it.each(KNOWN_NEGATIVE)("still parses a scope in the negative fixture: $label", ({ source, label }) => {
    // The negatives' token floor. `toEqual([])` above is satisfied by a parse that failed outright
    // and returned nothing, which would make every negative meaningless — a matcher that matches
    // nothing passes all of them. …
    const { hooksSeen, testCallbacksSeen } = scanSource("known-negative.ts", source)
    expect(hooksSeen + testCallbacksSeen, `the parse saw no hook and no test in: ${label}`).toBeGreaterThan(0)
  })
})
```

Note the positives assert the **extracted value** (`scope container:line`), not a boolean — a matcher
that flagged every node fails here too.

**KNOWN_POSITIVE fixtures Q10 needs** (each a source string, each drawn from real defect text):
- a `GET` whose `findFirst` `where` is `and(eq(t.id, id), isNull(t.deletedAt))` with no subsequent
  comparison — the `activities/[id]/route.ts:95-102` shape;
- a `PUT` that reads `ctx.userId` only into an event payload — the `:255` shape (identity *present in
  the body* but not reaching a predicate; this is the one a token-presence detector gets wrong);
- a list `GET` whose `conditions` array never mentions the caller — the `activities/route.ts:53` shape;
- **a handler whose only `ownerId` is inside a `//` comment**, and one whose only `ownerId` is inside a
  string literal. RESEARCH names this as the degradation path ("the token `ownerId` appears somewhere
  in the body", the collision that fired fifteen times across Phases 37-38).

**KNOWN_NEGATIVE fixtures** (must NOT be flagged), one per accepted idiom:
- fetch-then-compare → 403 (`pipelines/[id]/route.ts:56-58` verbatim);
- `where`-scoped → 404 (`organizations/[id]/route.ts:34` shape);
- helper delegation (`verifyStageOwnership(id, ctx.userId)`, `getWorkflow(id, context.userId)`);
- the **`ctx` vs `context` pair** — the same handler written both ways, both green.

**Reach floors, one `describe`, four `it`s (`:1282-1332`):**

```typescript
describe("the sweep reaches the tree it claims to scan", () => {
  it(`enumerates at least ${MIN_ROUTE_FILES} route files under ${API_ROOT}/`, …)
  it(`parses at least ${MIN_HANDLERS_PARSED} exported verb handlers`, …)
  it("enumerates every file this gate names, by exact path", () => {
    // Fails if a rename moves a subject or a carved-out file out from under this gate …
    for (const named of [...SUBJECT_PATHS, ...EXEMPT_PATHS]) {
      expect(ROUTE_FILES, `${named} is no longer enumerated`).toContain(named)
    }
  })
  it("parses files without a syntax error swallowing their contents", () => {
    // A `ts.createSourceFile` that fails to parse still returns a SourceFile, silently, with a
    // truncated tree. Every named file is known to contain handlers, so a zero here is a parse
    // failure rather than a clean file.
  })
})
```

**TOKEN FLOOR (WR-11) — the assertion the phase-46 lesson demands, and Q10's is unusually easy to get
right because the numbers are measured above.** The gate's own identifiers must still be *found in the
corpus*, or a rename makes the detector stop detecting and every "no offenders" goes green **because it
broke**. Model on `db-test-isolation.test.ts:579-605` (quoted in full in `47-PATTERNS.md § S1(d)`):

```typescript
it("still finds the identity expressions it matches on, in both spellings", () => {
  // WR-11. The negative below is "no handler fails to reach an identity expression". A detector
  // that stopped recognising `context.userId` satisfies it by finding nothing to recognise.
  // Measured: 55 `context.userId`, 22 `ctx.userId`, 61 `withApiAuth(` call expressions.
  expect(IDENTITY_HITS.context, "`context.userId` vanished from /api/v1 — the detector was almost " +
    "certainly renamed rather than the codebase").toBeGreaterThanOrEqual(40)
  expect(IDENTITY_HITS.ctx).toBeGreaterThanOrEqual(15)
  expect(WITH_API_AUTH_CALLS).toBeGreaterThanOrEqual(50)
})
```

**The array-form offender assertion with a prescriptive message (`:1338-1353`)** — never
`expect(hits.length).toBe(0)`, which prints nothing:

```typescript
expect(
  offenders,
  `a /api/v1 handler that reads or writes an owned record does not constrain it by caller ` +
    `identity. This is OWASP API1:2023 BOLA. Add the fetch-then-compare check from ` +
    `src/app/api/v1/pipelines/[id]/route.ts:56-58 …  If the route genuinely has no owner ` +
    `column, add it to EXEMPT with a written reason — the live control there will hold you to ` +
    `it. Offenders: ${offenders.join(" | ")}`
).toEqual([])
```

**Carve-outs are live controls, never comments — `deployment-docs-accuracy.test.ts:537-556` +
`:692-700` + `:593-600`, quoted verbatim in `47-PATTERNS.md § S1(f)`.** Every exempt path gets: a
doc-comment reason, an `it.each` asserting the excluded item **still exhibits the excluded property**,
and a disjointness assertion between the exemption lists.

**Self-sweep — S1(e) does NOT apply, and that must be asserted, not assumed.** Unlike
`suite-hook-hygiene.test.ts` (which is a `*.test.ts` sweeping `*.test.ts`), this gate is
`route-authorization.test.ts` sweeping files named exactly `route.ts`. It lives inside the walked tree
but its filename predicate excludes it structurally. Carry the assertion anyway, in the
`suite-hook-hygiene.test.ts:1586-1607` style inverted:

```typescript
describe("the gate does not sweep itself, and that is structural rather than an exclusion", () => {
  it("is not enumerated by its own walk", () => {
    // The corpus predicate is `entry.name === "route.ts"`; this file is not one. Asserted rather
    // than assumed, because a future widening of the predicate to `*.ts` would silently pull the
    // fixtures in and give this gate a second, unprovable reason to be green.
    expect(ROUTE_FILES).not.toContain(GATE_PATH)
  })
  it("is NOT path-excluded from anything — the exemption lists never name it", () => {
    for (const list of [DELEGATED_ROUTES, NO_OWNER_COLUMN_ROUTES, ADMIN_ONLY_ROUTES, ACCEPTED_KNOWN_ROUTES]) {
      expect(list as readonly string[]).not.toContain(GATE_PATH)
    }
  })
})
```

**Exactly ONE mitigation.** `suite-hook-hygiene.test.ts:1590-1598` states the rule and the reason:

```
// The load-bearing half of the header's decision. If someone adds this file to a carve-out
// list, the mitigation stops being one thing and becomes two, and neither is provable.
```

Here the one mitigation is the **filename predicate**. Do not additionally path-exclude, and do not
additionally claim the string fixtures are the mitigation — say which one is load-bearing.

**Falsification is the acceptance test, and it is 30 seconds of work.** Replay the §Q9 ablation: delete
`eq(organizations.ownerId, context.userId)` from `organizations/[id]/route.ts` and the gate must name
that file and verb in its offender list. Record the offender line verbatim in the SUMMARY, restore,
`git diff --exit-code`. Today that ablation is invisible to 5,237 passing tests. If the new gate does
not go red on it, the gate is worthless — and this is measurable before any of the four fixes land.

**Where it lives, and why:** `src/app/api/v1/__tests__/route-authorization.test.ts`, in the **base**
vitest project, so it runs in CI. `.db.test.*` is unreachable from CI by design
(`db-test-isolation.test.ts` asserts all three halves of that separation), so a gate that must run in CI
cannot live there. Do not name it `*.db.test.ts` or `*.rsc.test.ts`.

---

## Shared Patterns

### S-A — Authentication and identity (applies to all four route files and all six test files)

**Source:** `src/lib/api/auth.ts:7-10, 22-34, 74-76`

```typescript
export interface ApiAuthContext {
  userId: string
  keyId: string
}
```

`withApiAuth` is the sole entry to `/api/v1`. Bearer API key only — **no session path, no scopes, no
permissions, and no role**. `ApiAuthContext` carries no role by explicit design (T-35-24); routes that
need one re-read it per request via `resolveActorRole` (`src/lib/notes/authorize.ts:70-87`), which
returns `null` on unknown / soft-deleted / thrown and where `null` always **denies**.

**CONTEXT locks owner-only with NO admin bypass for these routes**, and the measurement forces it: the
sole owner of all 79,022 live activities is an admin, so an admin bypass makes SC-3 permanently vacuous.

`checkRateLimit` fails open without Redis (`src/lib/api/rate-limit.ts:26-37`), which is why a route
test needs no Redis — and why no test may depend on rate limiting.

### S-B — Error responses (applies to all four route files)

**Source:** `src/lib/api/errors.ts:40-58`

```typescript
export const Problems = {
  forbidden: () =>
    problemResponse("FORBIDDEN", "Forbidden", 403, "You don't have access to this resource"),

  notFound: (entity: string) =>
    problemResponse("ENTITY_NOT_FOUND", "Not Found", 404, `${entity} not found`),

  validation: (errors: ProblemDetail["errors"]) =>
    problemResponse("VALIDATION_ERROR", "Validation Error", 422, "Request validation failed", undefined, errors),
}
```

RFC 7807 shape, `type: "https://api.pipelite.app/errors/<CODE>"`. **404 before 403, always** — the
reference file does this at all three verbs. CONTEXT defers the 403-vs-404 information-leak question;
403 stays.

### S-C — Anti-vacuity, five forms (inherited wholesale from `47-PATTERNS.md § S1`)

| Form | Canonical source | Applies to in Phase 48 |
|---|---|---|
| **(a)** Named `MIN_*` floor with the measured number in the doc-comment, floor set *below* the measurement, asserted in its own `it` | `node-engines-floor.test.ts:76-86`; `suite-hook-hygiene.test.ts:216-271` | Q10's route/handler/authorized floors; SC-3's named integers (A:7, B:3, total:10); SC-5's `stages count > 0` |
| **(b)** Matcher self-tests against `KNOWN_POSITIVE` / `KNOWN_NEGATIVE` `as const` fixtures **before** the sweep, asserting the *extracted value* | `suite-hook-hygiene.test.ts:1093-1109` | the Q10 detector — including a fixture whose only `ownerId` is a comment |
| **(c)** Known-present positive anchor beside every negative | `queries.db.test.ts:278-281` | every SC-3 "does not contain B's rows" is paired with "does contain A's" |
| **(d) ⭐ FLOOR THE TOKEN, NOT JUST THE COUNT (WR-11)** | `db-test-isolation.test.ts:579-605`; `suite-hook-hygiene.test.ts:1625-1644` | Q10's identity-expression floors: `context.userId` ≥ 40, `ctx.userId` ≥ 15, `withApiAuth(` ≥ 50 |
| **(e) THE GATE MUST NOT COLLIDE WITH ITSELF** | `no-standing-suppressions.test.ts:19-25`; `suite-hook-hygiene.test.ts:1585-1607` | **structurally satisfied** for Q10 (route.ts vs *.test.ts) — assert it, do not assume it, and add no second mitigation |
| **(f)** An exclusion list is a **live control**: the excluded items are asserted to still exhibit the excluded property, and the lists are asserted disjoint | `deployment-docs-accuracy.test.ts:537-556` + `:692-700` + `:593-600` | Q10's four exemption categories, especially the four `noteCollectionHandlers` files |

### S-D — Parse, never regex, when a parser exists (`47-PATTERNS.md § S3`)

`ts.createSourceFile` for TypeScript source. Two reasons, both live in this phase: a comment explaining
the rule satisfies the rule's own grep (fired fifteen times in Phases 37-38, and the Q10 gate's header
will necessarily *contain* the strings `ownerId` and `ctx.userId`), and **`grep | wc -l` returns wrong
counts in this environment** (measured 36 → 19; `grep -n "export"` returned "0 matches" on a file with
15 export lines; `git status --porcelain` renders as the token `ok`). Every count in this document came
from `node` + `fs`; cleanliness was verified with `git diff --exit-code`.

### S-E — Cross-file changes ship in ONE commit (`47-PATTERNS.md § S7`)

Three clusters where a partial state is green for the wrong reason:
1. `stages/route.ts` GET rewrite + its `.db.test.ts` (the `IN` proof binds to behaviour, and the
   behaviour only exists after the join lands);
2. `stages/[id]/route.ts` GET → helper + the bare-GET `no pipeline key` assertion (the leak is
   *created by* the fix);
3. `activities/route.ts` GET scope + SC-3's discriminator (the discriminator is the whole proof, and
   without the fix it is the RED).

### S-F — TDD sequencing, and the RED must be recorded with its assertion diff

`config.json workflow.tdd_mode: true`. CONTEXT: *"Write the authorization test, watch it go RED against
the unfixed route, then fix."* The 46-06 / 47-13 standard is that the SUMMARY **quotes the failure**,
not that it says "verified the test covers the fix". Six negative controls are owed (RESEARCH § Wave 0
Gaps, controls A–F), and every one needs its complement observed too — a control that cannot
distinguish both cases is not a control (`node-engines-floor.test.ts:332-336`).

---

## Traps and Stale Artifacts

There are **zero hard traps** — no existing assertion pins the broken behaviour, because nothing tests
these four files at all. Enumerated across all 178 test files: no import of, request to, or assertion
about `activities/route.ts`, `activities/[id]/route.ts`, `stages/route.ts` or `stages/[id]/route.ts`.
No route-count floor, no snapshot, no e2e spec, no fixture encoding a foreign owner. **That absence is
the defect's survival mechanism, and it is the reason the Q10 gate is the deliverable that matters.**

What does exist is four stale artifacts a correct fix silently falsifies. Three are **ungated**, which
makes them easier to miss, not safer.

| # | Artifact | Current text | After the fix | Gated? |
|---|---|---|---|---|
| 1 | `public/openapi.yaml:2015-2081` (`/activities/{id}`) | GET declares `'200'` + `'404'`; PUT declares only `'200'`; DELETE only `'204'`. **No `'403'` anywhere.** | All three can return 403; PUT can return 422 on a foreign `owner_id` | **No test reads `openapi.yaml`** — verified: the only consumer is `src/app/api/v1/docs/route.ts:16`. Stale, not red. |
| 2 | `public/openapi.yaml:2361-2426` (`/stages/{id}`) | Same omission — and GET **already** returns 403 today, undocumented | unchanged behaviour, still undocumented | same |
| 3 | `docs/development/formula-fields.md:330` | *"`PUT /api/v1/activities/[id]` performs no ownership check (pre-existing IDOR, backlog 999.17)."* | Becomes false | **No.** `deployment-docs-accuracy.test.ts` scans `docs/**` only for phantom compose services and `DATABASE_URL` host:port — it does not read this claim. |
| 4 | `.planning/BACKLOG.md` 999.18 / `REQUIREMENTS` QG-03 / ROADMAP SC-5 note | *"unreachable today… guarded by `stageList` being non-empty"* | Already false **before** the fix — no such guard exists; `:69` is `if (!pipelineId)` | ROADMAP SC-5 is **AMENDED**; the amended text is the contract. A plan task quoting SC-5 verbatim is Pitfall 8. |

`components/responses/Forbidden` already exists in the spec (referenced at `openapi.yaml:2864`,
`:2891` for the Notes endpoints), so item 1 is a `$ref` addition, not a schema authoring job.

**One soft trap in the fix's own direction, worth restating because it is easy to miss:** the stage GET
fix makes `stage.pipeline` always populated, so the `expand.has("pipeline") &&` guard at
`stages/[id]/route.ts:80` becomes the *only* thing preventing a new leak. Assert it.

**And the environment trap that would corrupt any measurement in this phase:** `rtk` proxies every Bash
call and makes `grep … | wc -l` return wrong counts, `grep -n "export"` return "0 matches" on a file
with 15 export lines, and `git status --porcelain` render as the token `ok`. Every count in a plan gate
must come from `node -e` with `fs`, and cleanliness from `git diff --exit-code`. A count gate built on
`wc -l` is vacuous in this environment by construction.

---

## No Analog Found

| File / concern | Role | Data Flow | Reason |
|---|---|---|---|
| **A two-user API-key fixture, and any test that mints an API key at all** | test fixture | SQL insert → SHA-256 → HTTP header | **Zero precedent.** Enumerated programmatically: no file under `src/**` or `e2e/**` that is a test references `apiKeys` or `api_keys`. Neither `.db.test.ts` file creates one. There is no shared fixture helper, no factory, no seed script for keys. `e2e/seed-admin.ts` seeds a *user*, not a key. **RESEARCH § Q2 supplies the recipe verbatim and it was executed live this session:** `"pk_live_" + randomBytes(32).toString("base64url")` → `createHash("sha256").update(key).digest("hex")` → insert `api_keys(id, user_id, name, key_prefix, key_hash)` with **caller-supplied `id`** (the column is `text` with no default). `users.status` is an enum whose values are `pending_verification \| pending_approval \| approved \| rejected` — **`'active'` does not exist and errors.** Copy that recipe; do not go looking for a helper. RESEARCH also flags this helper will be needed twice here and again in Phase 50, so extracting one is defensible — but it is new code with no pattern to match. |
| **Invoking a route handler through the REAL `withApiAuth` in a test** (Harness C) | test | HTTP-shaped → real SQL | All 8 existing route tests **mock** `@/lib/api/auth` and bypass the wrapper. Nothing in the repo has ever driven `validateApiKey` → `checkRateLimit` → `runWithActor` end-to-end from a test process. RESEARCH verified each prerequisite individually (rate limit fails open, `runWithActor` is plain `AsyncLocalStorage`, `validateApiKey` is sha256 + `findFirst`) but the composition is unexercised, and **assumption A1 (`crmBus.emit` inertness) is explicitly untested**. Budget it as new ground. |
| **A transaction-rollback fixture wrapper** | test helper | — | Does not exist. Both `.db.test.ts` files use prefix-delete + baseline-count instead, and `db-test-isolation.test.ts:698-774` gates the operational scripts against destructive statements aimed at a read-only database. Use the prefix discipline; do not introduce a transaction wrapper as a novel mechanism inside a security phase. |

---

## Metadata

**Analog search scope:** all 36 `route.ts` under `src/app/api/v1` (enumerated with `fs.readdirSync`
recursion and AST-classified); all 178 `*.test.ts`/`*.test.tsx` under `src/` (scanned for `/api/v1`
references, `where`-argument assertions, `.toSQL()` usage and `api_keys` usage); both `.db.test.ts`
files; `src/lib/api/**`; `src/lib/mutations/activities.{ts,test.ts}`; `src/lib/__tests__/` (8 gate
files, outlined; `suite-hook-hygiene.test.ts` read in 7 non-overlapping ranges); `vitest.config.ts`,
`vitest.db.config.ts`; `public/openapi.yaml` (3 ranges); `docs/**` and `scripts/**` (grepped via `node`
for activities/stages route references).

**Files scanned:** ~250 enumerated programmatically; 22 read in full or in targeted non-overlapping
ranges.

**Measurements taken this session** (temporary `.mjs` run from the repo root, deleted afterwards; repo
verified clean with `git diff --exit-code`): 36 v1 route files / 188,450 bytes / 23,215 AST nodes;
62 declaration-form verb handlers + 8 binding-form in 4 files; 61 `withApiAuth` calls; 55
`context.userId` + 22 `ctx.userId`; 123 owner-like property accesses; `typescript` import 522.9 ms,
walk 1.3 ms, parse 161.7 ms.

**Pattern extraction date:** 2026-08-25
