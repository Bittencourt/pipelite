# Phase 48: REST API Authorization - Research

**Researched:** 2026-08-25
**Domain:** REST route-level authorization (IDOR), Drizzle query construction, DB-backed route testing
**Confidence:** HIGH — every claim below except three explicitly-marked `[ASSUMED]` items was
measured in this session against the running stack, the live database, or the installed
`drizzle-orm@0.45.2`.

---

## Summary

**All four named defects reproduce end-to-end, and one of them is worse than the requirement says.**
SEC-01 was reproduced with two real API keys against `http://localhost:3001`: user A read
(HTTP 200, full body), renamed (200), reassigned `owner_id` to themselves (200), and soft-deleted
(204) user B's activity, after which B's own read of their own record returned 404. SEC-02 was
reproduced exactly: the stage's legitimate owner gets `403 FORBIDDEN` without `?expand=pipeline`
and `200` with it. **QG-03 is not latent — it is a live HTTP 500.** There is no `stageList`
non-empty guard anywhere in `stages/route.ts`; `GET /api/v1/stages?offset=73` (any offset ≥ the
global stage count) sends `... where ("pipelines"."id" IN () and ...)` to Postgres and takes
SQLSTATE `42601`, *syntax error at or near ")"*. ROADMAP SC-5 as written ("proven by removing the
`stageList` non-empty guard") **cannot be executed** — the guard it names does not exist. That is
this research's single most important correction, and the plan needs a different, stronger proof.

**The exposure is wider than the four named files.** `POST /api/v1/activities` lets any valid key
create an activity owned by *another* user (`route.ts:164`, `owner_id || ctx.userId`, and the only
check is that the target user *exists*). `GET /api/v1/workflows/[id]/runs` and
`GET /api/v1/workflows/[id]/runs/[runId]` read another user's run history and step payloads with no
ownership predicate at all. And `stages/route.ts` applies pagination **before** the authorization
filter, so a legitimate owner's `?limit=5` returned `data: []` alongside `meta.total: 1` — their own
stage is invisible through their own list endpoint. Full per-verb table below.

**And the tenth vacuous gate is already in the repository, in exactly the file Phase 48 would be
tempted to copy.** `src/app/api/v1/organizations/[id]/__tests__/route.test.ts:164` is named
*"returns 404 without calling the mutation when the organization is not the caller's"*. I deleted
**all three** `eq(organizations.ownerId, context.userId)` predicates from
`organizations/[id]/route.ts` — GET, PUT and DELETE — and that test file stayed green 6/6, and then
the **entire base suite** stayed green: `172 passed | 2 skipped (174) · 5237 passed | 32 skipped`.
Nothing in this repository detects the removal of an authorization check from a REST route. The
mock (`findFirst.mockResolvedValueOnce(undefined)`) never inspects the `where` argument, so the
predicate's presence is unobservable to it. Reverted; `git diff --exit-code` = 0.

**Primary recommendation:** fix the four routes with the `pipelines/[id]/route.ts` fetch-then-compare
shape (403), replace the raw `IN` with `inArray()` (drizzle 0.45.2 renders the empty case as the
literal `false` — measured, no throw), and split the test deliverable across **two** harnesses: base-
project route tests modelled on `notes/__tests__/route.test.ts` for the per-record verbs (they *can*
fail against a fetch-then-compare check), and a `.db.test.ts` modelled on `views/queries.db.test.ts`
for the list-scoping and empty-`IN` proofs (a mocked `@/db` provably cannot prove a `where` clause —
that is what the ablation above demonstrates).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**The four defects, as measured**
- **SEC-01 / activities:** GET, PUT and DELETE on `/api/v1/activities/[id]` perform **no ownership
  check at all**, and GET on `/api/v1/activities` is unscoped. The PUT can additionally **reassign
  `owner_id`**, handing a record to another user.
- **SEC-01 / the three verbs fail independently.** SC-1 requires them asserted **separately** for GET,
  PUT and DELETE — one shared helper test would hide two of the three. Do not collapse them.
- **SEC-02 / stages:** the GET builds `withOptions` as `undefined` unless `?expand=pipeline` is passed,
  so the relation the ownership check reads is never loaded and **the legitimate owner gets a 403**.
  The file's own `ownershipWith` helper (`stages/[id]/route.ts:35`) already does this correctly for
  PUT and DELETE — **the GET is the one path that does not use it, which is both the bug and the shape
  of the fix.**
- **QG-03 / stages list:** `stages/route.ts:73` builds ``sql`${pipelines.id} IN ${pipelineIds}` `` from
  a JavaScript array instead of `inArray()`. Unreachable today only because `stageList` is guarded
  non-empty; a future refactor removing that guard turns it from awkward into broken.

**Reference shape**
- **`pipelines/[id]/route.ts` is the reference implementation** — it does check `ownerId`. Match its
  shape rather than inventing a new one. Consistency across `/api/v1` is itself a security property:
  four routes that authorize four different ways is how the fifth gets missed.
- Prefer reusing the existing `ownershipWith` helper over writing a parallel mechanism.

**Status codes**
- **Non-owner gets 403**, per SC-4, which is the stated contract and matches current behaviour for the
  paths that do check. Do not change it to 404 in this phase.
- **Noted tension, deliberately deferred:** a 403 confirms the record exists, which is an information
  leak a 404 would not have. This repo has precedent for the stricter choice — Phase 25 decided *all*
  webhook error states return 404 for zero information leakage. Whether `/api/v1` should follow is a
  real question, but changing it here would contradict SC-4 and widen the blast radius of a security
  fix. Record it; do not act on it.

**Tests ship with the fix**
- **These four route files have ZERO test coverage today.** That is not incidental — it is why the
  defect survived. Tests are part of the deliverable, not a follow-up.
- **SC-3's anti-vacuity is built into the criterion and must be honoured literally:** the row count the
  list endpoint returns must equal a **direct SQL count scoped to that owner, on the live dataset**.
  An assertion that passes because both sides are empty proves nothing — this milestone has caught
  nine such gates already.
- **SC-5 is behavioural, not textual:** prove the `IN` fix by **removing the `stageList` non-empty
  guard and observing the query still correct** — explicitly NOT by grepping for ``sql` ``. A grep
  gate here would be the tenth vacuous gate.
- Every test must be able to fail. Write the authorization test, watch it go RED against the unfixed
  route, then fix. A test authored after the fix proves only that the code does what it does.

**Two-user fixtures**
- Authorization tests need **two distinct users with real API credentials**, and the negative case must
  be a genuine cross-user request — not a mocked-out authorization result. Mocking the check is how a
  test passes while the route is broken.
- Prefer the live database over fabricated fixtures where SC-3 demands the live dataset, but tests must
  not mutate real records: create and clean up their own, or operate in a transaction that rolls back.

### Claude's Discretion
- Whether the ownership check lives inline per route, in a shared helper, or in middleware — provided
  it is consistent with `pipelines/[id]/route.ts` and cannot be silently skipped.
- Test file placement and harness (the repo's `vitest.db.config.ts` project exists for DB-backed tests
  and **must stay outside `npm test`** — `db-test-isolation.test.ts` enforces that).
- Whether to add a route-level regression gate asserting every `/api/v1` record route authorizes.

### Deferred Ideas (OUT OF SCOPE)
- Changing `/api/v1` unauthorized responses from 403 to 404 to remove the existence leak — contradicts
  SC-4 as written; needs its own decision.
- A general authorization audit of every `/api/v1` route beyond the four named here.
- **SEC-47-B** (from Phase 47): `matches_regex` is unbounded on the execution path. Every quick remedy
  silently changes workflow **routing**; the likely answer is the QuickJS sandbox under its `timeoutMs`.
- **SEC-47-A** (from Phase 47): `src/lib/email/client.ts:20` sets `tls: { rejectUnauthorized: false }`
  unconditionally — a larger exposure than any advisory formally accepted in Phase 47.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **SEC-01** | A user cannot read, modify or delete another user's activity through the REST API, and the list endpoint returns only activities they may see | §Defect 1 (reproduced, 4 verbs, verbatim HTTP), §Fix Shape, §Harness A, §SC-3 Vacuity Problem |
| **SEC-02** | A stage's legitimate owner can read it without passing `?expand=pipeline` | §Defect 2 (reproduced, 4 status codes), §`ownershipWith` Analysis (fix = call the existing helper, unchanged) |
| **QG-03** | No query builds a SQL `IN` clause by interpolating a JavaScript array | §Defect 3 — **LIVE 500, not latent**; §Drizzle `IN` Rendering Matrix (measured, 0.45.2); §SC-5 Is Unexecutable As Written |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Caller identity (who) | API / Backend — `withApiAuth` (`src/lib/api/auth.ts:22`) | — | Single wrapper, already correct, already the sole `api_key` actor site. Not touched by this phase. |
| Per-record authorization (may they) | API / Backend — the route handler | — | Phase 25 decision, re-verified: the mutation layer checks *existence only*. `src/lib/mutations/activities.ts` receives a `userId` and trusts it. The check cannot move down. |
| List scoping (which records) | Database / Storage — a `where` predicate | API / Backend (compose it) | A JS post-filter breaks pagination — measured live on `stages/route.ts`, see §Finding F3. The predicate must be in SQL. |
| `IN`-list construction | Database / Storage — drizzle `inArray()` | — | Parameter binding and the empty-set case are the library's job. §Drizzle matrix. |
| Role resolution (admin bypass, if any) | Database / Storage — `resolveActorRole` re-reads `users.role` | API / Backend | `ApiAuthContext` carries **no** role (auth.ts:7-10) by deliberate design (T-35-24). Any admin posture requires a storage read. |
| Regression enforcement | Test tier — base vitest project (in CI) | — | `.db.test.*` is unreachable from CI by design; a gate that must run in CI cannot live there. |

---

## Q1 — Authorization state of EVERY `/api/v1` route

36 `route.ts` files, enumerated with `fs.readdirSync` recursion (**not** `grep | wc -l`, which is
unreliable here — see §Environment Hazards). Handler bodies were sliced between successive
`export async function <VERB>` lines and classified by AST-adjacent regex, then every `NONE` and
every ambiguous row was read by hand.

**Classification key**
- `WHERE-scoped` — identity reaches the SQL `where` (`eq(t.ownerId, context.userId)`). Non-owner → 404.
- `CMP` — row fetched, then `row.ownerId !== ctx.userId` → 403. The `pipelines/[id]` reference shape.
- `HELPER` — delegated to `verifyStageOwnership` / `authorizeNoteMutation` / `resolveActorRole` / `getWorkflow(id, userId)`.
- **`NONE`** — the caller identity never constrains which record is touched. Authentication only.

### Records with an owner column — the IDOR surface

| Route | Verb | Posture | Non-owner gets | Evidence |
|-------|------|---------|----------------|----------|
| `activities/[id]/route.ts` | GET | **NONE** | **200 + full body** | `:95-98` `findFirst` keyed on id + `deletedAt` only |
| `activities/[id]/route.ts` | PUT | **NONE** | **200, write lands** | `:141-143`; `ctx.userId` used only for the event payload `:255` |
| `activities/[id]/route.ts` | PUT | **NONE** | **`owner_id` reassignable** | `:188-191` writes `updateData.ownerId = updates.owner_id` unconditionally |
| `activities/[id]/route.ts` | DELETE | **NONE** | **204, row tombstoned** | `:271-282` |
| `activities/route.ts` | GET | **NONE** | **whole table** | `:53` conditions = `[isNull(deletedAt)]`; `:61-63` `owner_id` is an *optional user-supplied filter*, not a scope |
| `activities/route.ts` | POST | **NONE (write-as-other)** | creates a record owned by someone else | `:164` `const activityOwnerId = owner_id \|\| ctx.userId`; `:154-160` only checks the target user *exists* |
| `stages/[id]/route.ts` | GET | CMP, **broken** | 403 — *and so does the owner* | `:60-62` relation not loaded; `:74` reads `stage.pipeline` |
| `stages/[id]/route.ts` | PUT / DELETE | HELPER → 403 | 403 ✓ | `:93`, `:149` via `verifyStageOwnership` |
| `stages/route.ts` | GET | WHERE-scoped, **post-paginated** | scoped, but owner loses rows | `:59-65` global page, `:68-81` JS filter, `:84-93` scoped count. See F3. |
| `stages/route.ts` | POST | WHERE-scoped ✓ | 422 `pipeline_id not_found` | `:134-139` |
| `workflows/[id]/runs/route.ts` | GET | **NONE** | **200, another user's run list** | `:31-39` existence-only `select` on `workflows`; run query `:48-51` keyed on `workflowId` alone |
| `workflows/[id]/runs/[runId]/route.ts` | GET | **NONE** | **200, run + step payloads** | `:19-23`; the handler does not even destructure a context |
| `custom-field-definitions/[id]/route.ts` | GET/PUT/DELETE | **NONE** | 200 / write lands | `:29-30`, `:47-48`, `:102-103` — tenant-global config, no owner column. Privilege question, not IDOR. |
| `custom-field-definitions/route.ts` | GET/POST | **NONE** | — | same |
| `workflow-templates/[id]/route.ts` | GET/DELETE | **NONE** | — | `:15`, `:26` — global templates, no owner column |
| `workflow-templates/route.ts` | GET/POST | **NONE** | — | same |
| `docs/route.ts` | GET | **no `withApiAuth` at all** | public | intentional (OpenAPI doc) — flagged because a route outside the wrapper is also unaudited (auth.ts:56-61) |

### Records already authorized correctly — the reference set

| Route | Verbs | Posture | Non-owner |
|-------|-------|---------|-----------|
| `pipelines/[id]/route.ts` | GET/PUT/DELETE | CMP → 403 | 403 (`:56-58`, `:93-95`) |
| `pipelines/route.ts` | GET/POST | WHERE-scoped | — |
| `organizations/[id]/route.ts` | GET/PUT/DELETE | WHERE-scoped | 404 (`:34`, `:91`, `:139`) |
| `people/[id]/route.ts` | GET/PUT/DELETE | WHERE-scoped | 404 |
| `deals/[id]/route.ts` | GET/PUT/DELETE | WHERE-scoped | 404; PUT additionally re-checks stage/org/person ownership (`:218`, `:230`, `:247`) |
| `{organizations,people,deals}/route.ts`, `people/batch`, `deals/batch` | GET/POST | WHERE-scoped | — |
| `organizations/batch/route.ts` | POST | create-only, `userId: context.userId` (`:58`) | n/a |
| `webhooks/[id]/route.ts` | GET/PUT/DELETE | CMP → 403 | 403 |
| `workflows/[id]/route.ts`, `workflows/[id]/run` | GET/PUT/DELETE/POST | HELPER `getWorkflow(id, context.userId)` | — |
| `notes/[noteId]/route.ts` | PATCH/DELETE | HELPER, **owner-or-admin** | 403 |
| `trash/route.ts` | GET | HELPER, **owner-or-admin scope built from role** | 403 if role unresolvable |
| `trash/[type]/[id]/{route,restore}` | DELETE/POST | HELPER, **admin-only** | 403 |
| `audit/route.ts` | GET | HELPER, **admin-only** | 403 |
| `*/[id]/notes/route.ts` (4 files) | GET/POST | delegated to `noteCollectionHandlers` | — |

**Finding F1 — a fifth and sixth equally exposed route the requirement does not name.**
`workflows/[id]/runs` and `workflows/[id]/runs/[runId]` are unscoped reads. They are *read-only*, so
strictly less severe than activities, but they leak workflow run step payloads across users and they
sit next to `workflows/[id]/route.ts` which **is** scoped — i.e. the parent authorizes and the child
does not. `[ASSUMED]` that this is out of scope per CONTEXT ("a general authorization audit of every
`/api/v1` route beyond the four named" is deferred), but the planner should record it in BACKLOG
rather than let this research be the only place it exists.

**Finding F2 — `POST /api/v1/activities` is a write-as-another-user vector in one of the four in-scope
files.** `activities/route.ts:164`. It is inside the phase boundary (the file is named in scope) and
it is the mirror image of SC-2: SC-2 stops `owner_id` being *moved*, this stops it being *planted*.
Reproduced below.

**Finding F3 — `stages/route.ts` GET paginates before it authorizes.** Measured live: with one stage
owned by the test user, `GET /api/v1/stages?limit=5` returned `{"data":[],"meta":{"total":1,...}}` —
the owner's own stage was absent from page 1 because page 1 is the first 5 rows of *all 73* stages
ordered by `position`, and the ownership filter is applied in JavaScript afterwards. `?limit=100`
returned it. This is the same class of bug as the `IN` fragment and lives in the same lines
(`:59-81`), so the plan should fix both in one edit: one `innerJoin`-scoped query, paginated *after*
the predicate — which also deletes the `pipelineIds` array and therefore QG-03 at the root.

---

## Q2 — How authentication works on `/api/v1`

**One mechanism only: a Bearer API key. No session path, no scopes, no permissions.**

`withApiAuth` (`src/lib/api/auth.ts:22-77`) is the sole entry:

1. `:29-34` — requires `Authorization: Bearer …`, else `Problems.unauthorized()`. No cookie/session
   fallback exists in this file or anywhere under `/api/v1`.
2. `:39-43` — `validateApiKey(token)` → `{ userId, keyId } | null`.
3. `:46-50` — `checkRateLimit(result.keyId)`. **Fails open when Redis is absent**
   (`src/lib/api/rate-limit.ts:26-37`, returns `{ allowed: true }` and logs a WARN). Confirmed live:
   every request in this session logged `Rate limiting skipped: Redis not configured.` This matters
   for testing — a route test needs no Redis.
4. `:74-76` — `runWithActor({ kind: "api_key", userId }, …)`, an `AsyncLocalStorage` scope
   (`src/lib/audit/actor-context.ts:1`). Established *after* both reject paths, deliberately.

**`ctx.userId` is `api_keys.user_id`, nothing else.**

```
export interface ApiAuthContext {   // src/lib/api/auth.ts:7-10
  userId: string
  keyId: string
}
```

**There is no scope/permission concept. Identity is one axis; role is a second, and it is NOT in the
context** — by explicit design (T-35-24). Routes that need a role re-read it from storage per request
via `resolveActorRole` (`src/lib/notes/authorize.ts:70-87`), which returns `{ userId, role }` or
`null`, and `null` is always *denied* rather than treated as a member. Three distinct postures exist
in the codebase today:

| Posture | Sites | Admin bypass? |
|---------|-------|---------------|
| Owner-only | `pipelines/[id]`, `stages/[id]`, `webhooks/[id]`, `organizations/[id]`, `people/[id]`, `deals/[id]`, `workflows/[id]`, saved views | **No** |
| Owner-or-admin | `notes/[noteId]`, `trash/` list scope | Yes |
| Admin-only | `audit/`, `trash/[type]/[id]` | n/a |

**Phase 48 must pick one explicitly, and there is a measurement that forces the answer** — see
§SC-3's Vacuity Problem: the *only* owner of all 79,022 live activities is
`prbitt@gmail.com`, whose role is `admin`. An admin bypass would make SC-3's count assertion trivially
true for the only user who has any data. **Recommendation: owner-only, matching the
`pipelines/[id]` reference CONTEXT already locked.** `[CITED: 48-CONTEXT.md § Reference shape]`

### API key record shape and how to create two independent ones

`src/db/schema/api-keys.ts` / measured `\d api_keys`:

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` PK | **no default** — the caller must supply it |
| `user_id` | `text` NOT NULL → `users.id` `ON DELETE CASCADE` | |
| `name` | `text` NOT NULL | |
| `key_prefix` | `text` NOT NULL | first 12 chars, display only |
| `key_hash` | `text` NOT NULL | **SHA-256 hex** of the full key |
| `created_at` | `timestamp` NOT NULL DEFAULT `now()` | |
| `last_used_at` | `timestamp` | fire-and-forget update on every validation (`api-keys.ts:74-89`) |
| `deleted_at` | `timestamp` | non-null ⇒ `validateApiKey` returns `null` (`:69-71`) |

Key material (`src/lib/api-keys.ts:21-48`): `"pk_live_" + randomBytes(32).toString("base64url")`.
Validation (`:56-95`) is `startsWith("pk_live_")` → `sha256(key).hex` → `findFirst(eq(keyHash, …))`.
`validateApiKey` **never** looks at `users.deleted_at` or `users.status`
`[VERIFIED: src/lib/api-keys.ts:56-95 read in full]` — a soft-deleted user's key still authenticates.
Worth a note; out of scope.

**So a two-user fixture is pure SQL — no HTTP signup, no session, no email.** Exactly what I did
(and reverted):

```js
// generate, in Node
const key = "pk_live_" + randomBytes(32).toString("base64url")
const hash = createHash("sha256").update(key).digest("hex")
```
```sql
-- users.status is an enum: pending_verification | pending_approval | approved | rejected
-- ('active' does NOT exist — measured, it errors)
INSERT INTO users (id,email,name,role,status) VALUES ('t-a','t-a@local.test','A','member','approved');
INSERT INTO api_keys (id,user_id,name,key_prefix,key_hash) VALUES ('k-a','t-a','A',<prefix>,<hash>);
```

---

## Q3 — SEC-01 reproduced end to end (verbatim)

**Fixtures created:** users `p48res-userA` / `p48res-userB` (emails `p48res-{a,b}@local.test`, role
`member`, status `approved`), api_keys `p48res-keyA` / `p48res-keyB`, one activity each via
`POST /api/v1/activities` (`c7a7c3f5-…` owned by A, `e9d37d4c-…` owned by B), one pipeline
`30bd6b84-…` and one stage `201fe7f0-…` owned by A for Q4.
**All removed.** Cleanup transaction deleted 5 `audit_log` rows, 2 activities, 1 stage, 1 pipeline,
2 api_keys, 2 users. Post-cleanup counts: `activities 79022`, `stages 73`, `pipelines 12`,
`users 10`, `api_keys 8`, and `p48res%` leftovers = **0 / 0 / 0** across users, api_keys and
audit_log. No pre-existing row was read for mutation, and no `TRUNCATE`/`DROP`/unfiltered `DELETE`
was issued.

### SC-1: GET — user A reads user B's activity

```
$ curl -i http://localhost:3001/api/v1/activities/e9d37d4c-… -H "Authorization: Bearer <A>"
HTTP=200
{"data":{"id":"e9d37d4c-4739-460b-93b1-018d6905ac3f","title":"P48RES B activity",
 "type_id":"task","deal_id":null,"owner_id":"p48res-userB", …}}
```
`owner_id` in the body is **B**, returned to **A**. 200.

### SC-1: PUT — user A modifies user B's activity

```
$ curl -X PUT …/activities/e9d37d4c-… -H "Authorization: Bearer <A>" -d '{"title":"HIJACKED BY A"}'
HTTP=200
{"data":{… "title":"HIJACKED BY A", "owner_id":"p48res-userB", "updated_at":"…T17:57:07.784Z"}}
```

### SC-2: PUT — user A takes ownership of user B's activity

```
$ curl -X PUT …/activities/e9d37d4c-… -H "Authorization: Bearer <A>" -d '{"owner_id":"p48res-userA"}'
HTTP=200
{"data":{… "title":"HIJACKED BY A", "owner_id":"p48res-userA", …}}
```
`owner_id` went `p48res-userB` → `p48res-userA` on A's own request. **SC-2 confirmed.**

### SC-1: DELETE — user A destroys user B's activity

```
$ curl -X DELETE …/activities/e9d37d4c-… -H "Authorization: Bearer <A>"
HTTP=204   (empty body)

$ curl …/activities/e9d37d4c-… -H "Authorization: Bearer <B>"     # B reads their OWN record
HTTP=404
{"type":"https://api.pipelite.app/errors/ENTITY_NOT_FOUND","title":"Not Found","status":404,
 "detail":"Activity not found"}
```
**The three verbs are three independent holes and were exercised as three independent requests.
CONTEXT is right that one shared test would hide two of them.**

### SC-3: the list endpoint

```
$ curl "…/activities?limit=100" -H "Authorization: Bearer <B>"
returned rows: 100   meta.total: {"total":79024,"offset":0,"limit":100}
distinct owners in B's page: {"ef4acac9-e860-4e71-9db5-ddaa2808cb9f":100}
```
B is a brand-new user owning **exactly one** activity. B's first page is 100 rows, **none of them
B's**, all owned by a third party, and `meta.total` is the entire table (79,022 live + my 2).

### F2: POST — create-as-another-user

Both fixture activities were created through the API, and the second demonstrates the vector
directly: the key was A's for `p48res-userA` and B's for `p48res-userB`, but nothing stops
`Bearer <A>` + `{"owner_id":"p48res-userB"}` — `activities/route.ts:154-164` validates only that the
target user row exists.

---

## Q4 — SEC-02 reproduced (all four cells)

Stage `201fe7f0-…` in pipeline `30bd6b84-…` owned by A.

| # | Caller | `?expand=pipeline` | Measured | Correct? |
|---|--------|--------------------|----------|----------|
| a | **owner A** | no | **403 FORBIDDEN** | **NO — this is SEC-02** |
| b | owner A | yes | 200 + body + expanded `pipeline` | yes |
| c | non-owner B | no | 403 | yes **by accident** |
| d | non-owner B | yes | 403 | yes, for the right reason |
| e | owner A, `PUT` (helper path) | n/a | 200 | yes |
| f | non-owner B, `PUT` | n/a | 403 | yes |

```
(a) {"type":"https://api.pipelite.app/errors/FORBIDDEN","title":"Forbidden","status":403,
     "detail":"You don't have access to this resource"}    HTTP=403
(b) {"data":{…,"pipeline":{"id":"30bd6b84-…","owner_id":"p48res-userA",…}}}   HTTP=200
```

### ⚠ The vacuity trap inside SC-4, measured

**Cell (c) is 403 today for the *wrong reason*.** The relation is not loaded, so
`!stage.pipeline` short-circuits at `:74` before `ownerId` is ever compared. After the fix it will
still be 403 — via the actual comparison. **A test that asserts only "non-owner without expand →
403" passes identically before and after the fix and therefore cannot fail.** ROADMAP SC-4 has two
halves and only one of them is a defect proof:

- `owner + no expand → 200` — **RED today.** This is the whole proof.
- `non-owner + {no expand, expand} → 403` — **GREEN today.** A regression guard, not evidence.

The plan must label the second half as a regression guard, and its VALIDATION must not count it as a
negative control. This is the same shape as the ninth vacuous gate: a passing assertion whose pass
predates the work.

---

## Q5 — `ownershipWith` read closely: why GET diverges, and whether the helper changes

```ts
// src/app/api/v1/stages/[id]/route.ts:33-51
async function verifyStageOwnership(stageId: string, userId: string) {
  const ownershipWith: StageWith = { pipeline: true as const }          // :35  UNCONDITIONAL
  const stage = await db.query.stages.findFirst({
    where: eq(stages.id, stageId),
    with: ownershipWith,                                                 // :39
  }) as StageExpanded | undefined
  if (!stage) return { stage: null, owned: false }                       // :42-44
  if (!stage.pipeline || stage.pipeline.ownerId !== userId || stage.pipeline.deletedAt)
    return { stage, owned: false }                                       // :46-48
  return { stage, owned: true }
}
```

```ts
// GET, :59-76 — the divergence
const withOptions: StageWith = expand.has("pipeline") ? { pipeline: true as const } : undefined  // :60-62
const stage = await db.query.stages.findFirst({ where: eq(stages.id, id), with: withOptions })   // :64-67
if (!stage) return Problems.notFound("Stage")                                                    // :69-71
if (!stage.pipeline || stage.pipeline.ownerId !== ctx.userId || stage.pipeline.deletedAt)
  return Problems.forbidden()                                                                    // :74-76
```

**The precise divergence:** `:74` is a *byte-for-byte copy* of the helper's `:46` predicate, but it
reads a relation loaded by `:66`'s `withOptions`, which is `undefined` unless the *caller* asked for
`?expand=pipeline`. The helper's `:35` loads it unconditionally because it exists only to authorize.
The GET conflated two independent concerns into one variable: **what the response should project**
(caller-controlled) and **what the check needs** (never caller-controlled). SEC-02 is that
conflation, and the security lesson generalises beyond this file — *no input may decide what an
authorization predicate can see.*

**Answer: the fix is "call the existing helper." The helper needs no change.** It already returns
`{ stage, owned }`, which is exactly the 404-vs-403 discrimination the GET performs at `:69` and
`:74`, and its `deletedAt` and `!stage.pipeline` branches are identical. The GET becomes:

```ts
const { stage, owned } = await verifyStageOwnership(id, ctx.userId)   // authorization: never caller-controlled
if (!stage) return Problems.notFound("Stage")
if (!owned)  return Problems.forbidden()
// projection: caller-controlled, and only now
if (parseExpand(req).has("pipeline") && stage.pipeline) serialized.pipeline = serializePipeline(stage.pipeline)
```

Two consequences the plan should state, because both are behaviour changes a reviewer will notice:
1. The GET's second `findFirst` disappears — the helper's read serves both purposes. `stage.pipeline`
   is *always* populated now, so the projection must be gated on `expand` alone, or a bare GET starts
   leaking the pipeline object into the response. **That is a real regression risk in the fix itself
   and deserves its own assertion:** bare GET body must have no `pipeline` key.
2. `stages/[id]` GET/PUT/DELETE become one code path with one predicate — which is the CONTEXT's
   "consistency is itself a security property," achieved by deletion rather than addition.

---

## Q6 — QG-03: what drizzle actually generates. **It is broken TODAY.**

### There is no `stageList` non-empty guard

`stages/route.ts:67-81` reads:

```ts
let userStages = stageList
if (!pipelineId) {                                                   // :69  ← the only guard
  const pipelineIds = [...new Set(stageList.map(s => s.pipelineId))] // :70  ← [] when stageList is []
  const userPipelines = await db.query.pipelines.findMany({
    where: and(
      sql`${pipelines.id} IN ${pipelineIds}`,                        // :73
      eq(pipelines.ownerId, ctx.userId),
      isNull(pipelines.deletedAt)
    ),
    columns: { id: true },
  })
```

The guard at `:69` is `if (!pipelineId)` — *absence of a filter parameter*, not *non-emptiness of
`stageList`*. `stageList` is empty whenever `offset ≥` the global stage count, which any caller
controls: `parsePagination` (`src/lib/api/pagination.ts:27`) clamps `offset` only at zero and imposes
no ceiling. **BACKLOG 999.18, REQUIREMENTS QG-03 and ROADMAP SC-5 all state this is unreachable.
It is reachable, from the public API, with one query parameter.**

### Measured, against the running container

```
$ curl "…/api/v1/stages?limit=5&offset=73"    HTTP=200      # 73 stages existed → last non-empty page
$ curl "…/api/v1/stages?limit=5&offset=74"    HTTP=500
$ curl "…/api/v1/stages?limit=5&offset=999999" HTTP=500
```

Container log, verbatim:

```
Failed query: select "id" from "pipelines" "pipelines"
  where ("pipelines"."id" IN () and "pipelines"."owner_id" = $1 and "pipelines"."deleted_at" is null)
params: p48res-userA
cause: syntax error at or near ")"
  severity: 'ERROR', code: '42601', position: '70', file: 'scan.l', routine: 'scanner_yyerror'
```

*(the threshold at the time was 74 because the fixture stage existed; with the fixture removed the
live threshold is `offset ≥ 73`, and it moves with the table.)*

### Drizzle `IN` rendering matrix — `drizzle-orm@0.45.2` (installed; declared `^0.45.2`)

Generated with `new PgDialect().sqlToQuery(...)` against a minimal `pgTable`, no database:

| Expression | Rendered SQL | Params |
|-----------|--------------|--------|
| ``sql`${col} IN ${[]}` `` | `"pipelines"."id" IN ()` | `[]` |
| ``sql`${col} IN ${["p1"]}` `` | `"pipelines"."id" IN ($1)` | `["p1"]` |
| ``sql`${col} IN ${["p1","p2","p3"]}` `` | `"pipelines"."id" IN ($1, $2, $3)` | `["p1","p2","p3"]` |
| `inArray(col, [])` | **`false`** | `[]` |
| `inArray(col, ["p1"])` | `"pipelines"."id" in ($1)` | `["p1"]` |
| `inArray(col, ["p1","p2","p3"])` | `"pipelines"."id" in ($1, $2, $3)` | `["p1","p2","p3"]` |
| `and(inArray(col, []), eq(ownerId,…), isNull(deletedAt))` | `(false and "pipelines"."owner_id" = $1 and "pipelines"."deleted_at" is null)` | `["u1"]` |
| `and(sql`… IN ${[]}`, eq(…), isNull(…))` | `("pipelines"."id" IN () and …)` | `["u1"]` |

**Conclusions, all `[VERIFIED: drizzle-orm@0.45.2, executed this session]`:**
1. The raw fragment is **correct for non-empty arrays** (drizzle does expand the array into
   placeholders — it does not pass a Postgres array literal). The defect is *exclusively* the empty
   case. This narrows the phase: it is a robustness fix, and a live 500, not a SQL-injection fix.
2. `inArray(col, [])` in **0.45.2 renders the literal `false` and does not throw.** The historical
   drizzle behaviour the objective asks about — older versions threw
   *"inArray requires at least one value"* — is **not present** in the installed version. Composed
   into the route's `and(...)`, the empty case becomes `(false and … )`: valid SQL, zero rows, exactly
   the semantics the JS filter at `:80` wants. **No `.length > 0` wrapper is needed, and adding one
   would create an untested branch.**
3. `IN` vs `in` casing differs between the two shapes; a SQL-text assertion should be
   case-insensitive or, better, not be a SQL-text assertion at all.

### ⚠ SC-5 as written is unexecutable, and the correct proof is stronger

> SC-5: "Proven by removing the `stageList` non-empty guard and observing the query still be
> correct — not by grepping for ``sql` ``."

There is no guard to remove. **Substitute proof, which is strictly better because it needs no
ablation at all — the negative control is a live request:**

| | Before fix | After fix |
|---|---|---|
| `GET /api/v1/stages?offset=<stage_count>` | **HTTP 500**, log line `IN ()`, SQLSTATE 42601 | **HTTP 200**, `{"data":[],"meta":{"total":N,…}}` |
| Empty-set SQL, asserted from `.toSQL()` or `PgDialect` | contains `IN ()` | contains no `IN ()`; renders `false` |
| Non-empty set, both directions | correct rows | correct rows (**floor: > 0 rows, or the 200 above is vacuous**) |

The `offset ≥ count` request is a *behavioural* control that is RED today and GREEN after — the
strongest kind, and it is available for free. The plan should also carry a **counted floor** on the
non-empty half (a stage list that returns zero rows makes "correct rows" meaningless), per the
milestone's counting-gate rule.

**If F3 is fixed as recommended** (scope in SQL, paginate after), the `pipelineIds` array ceases to
exist and QG-03 is closed by *deletion*. A gate written against the `inArray` call would then have
nothing to bind to — so the gate must be written against **behaviour** (the two HTTP responses), not
against the presence of an `inArray` call site. Another reason not to grep.

---

## Q7 — Test infrastructure for DB-backed route tests

### The three vitest projects

| Project | Config | Include | In `npm test`? | In CI? |
|---------|--------|---------|----------------|--------|
| base | `vitest.config.ts` | `src/**/*.{test,spec}.*`, **excludes** `*.rsc.test.*` and `*.db.test.*` | yes | yes |
| rsc | `vitest.rsc.config.ts` | `*.rsc.test.*` | yes | yes |
| **db** | `vitest.db.config.ts` | **`src/**/*.db.test.*`** | **no, deliberately** | **no** |

`"test": "vitest run && vitest run --config vitest.rsc.config.ts"` ·
`"test:db": "bash scripts/dedup-db-test-setup.sh && vitest run --config vitest.db.config.ts"`

`src/lib/mutations/__tests__/db-test-isolation.test.ts` runs in the **base** project (so, in CI) and
asserts all three halves of the separation: the base exclude glob, `npm test` not invoking the db
project, and **no step of `ci.yml` invoking it**. CI's 7 named steps are typecheck, lint,
`npm test`, `db:check-migrations`, `security:audit`, `npm audit signatures` (plus checkout /
setup-node / `npm ci`). **A route-authorization gate that must run in CI cannot be a `.db.test.ts`.**

### How a db test gets a database

`scripts/dedup-db-test-setup.sh`: `docker exec` into the container discovered by
`docker ps --filter name=pipelite-postgres` (**not** `docker compose`, so it works from worktrees),
drops every non-system schema of `pipelite_dedup_test`, and reloads
`pg_dump --schema-only --no-owner --no-privileges` from `pipelite` — piped *inside* the container, so
no credential and no schema touch the host. It then hard-asserts the reload: ≥ 30 tables, ≥ 4
`GENERATED ALWAYS` columns, `notes_migration_uniq` present, and **`organizations = 0`**.

`vitest.db.config.ts` derives `DATABASE_URL` from `E2E_DATABASE_URL` (present in `.env`:
`postgresql://pipelite:pipelite@localhost:5433/pipelite`) by swapping only the database name to
`pipelite_dedup_test`, and forwards `E2E_DATABASE_URL` and `DEDUP_TEST_DATABASE` alongside. It sets
`fileParallelism: false`, `sequence.concurrent: false`, and 60 s test/hook timeouts.

**The isolated database starts EMPTY every run. This is the crux of the SC-3 problem below.**

### Fixture / teardown pattern — and there is no transaction-rollback helper

There are exactly **two** `.db.test.ts` files: `src/lib/mutations/dedup.db.test.ts` (1499 lines) and
`src/lib/views/queries.db.test.ts` (608 lines). Neither uses a transaction. Both use the same
discipline, and `queries.db.test.ts` is the one to copy:

1. **Module-scope connection guard** (`:72-106`) — `assertIsolatedConnection` re-derives host and
   database *name* from `process.env.DATABASE_URL`, refuses a non-loopback host, refuses any name
   other than `pipelite_dedup_test`, and names `pipelite` explicitly so it can be refused *by name*.
   It runs at module scope, so a wrong target **aborts collection** — no statement is sent.
2. **One prefix on every id and email** (`:113` `const PREFIX = "viewsdbt-"`, no `_`, no `%`, so no
   LIKE escaping).
3. **`beforeAll`** (`:164-244`) — record `baseline[table] = count(*)` for every touched table, run
   `removeFixtures()` first (an aborted prior run must not pollute), then insert.
4. **`afterAll`** (`:246-260`) — `removeFixtures()`; assert 0 prefixed rows remain; **and assert
   `count(*) === baseline[table]`, which catches a row MUTATED rather than created.**
5. `removeFixtures()` deletes by `like(col, "prefix%")` in foreign-key order. No `TRUNCATE`, no
   `DROP`, no unfiltered `DELETE` anywhere in either file.

### How to invoke a route in a test — three options, measured

**Option A — direct handler import + mocked `withApiAuth`. The established pattern, 8 files.**
`src/app/api/v1/notes/__tests__/route.test.ts` is the closest analog and is *itself* an IDOR test:

```ts
vi.mock("@/lib/api/auth", () => ({                                    // :29-33
  withApiAuth: vi.fn((req: NextRequest, handler: ApiRouteHandler) =>
    handler(req, { userId: "user-1", keyId: "key-1" })),
}))
import { PATCH, DELETE } from "@/app/api/v1/notes/[noteId]/route"      // :63
const params = { params: Promise.resolve({ noteId: "note-1" }) }       // :107
const foreignNote: Note = { ...authoredNote, id: "note-2", authorId: "user-9" }  // :91 "the IDOR target"
```
Its comment at `:27-28` states the reason precisely: *"this suite is about what the route does AFTER
authentication, and the bypass is what lets it assert the authorization step separately from the
authentication step."* Its `:35-41` states the counterpart: only `resolveActorRole` is stubbed;
`isAuthorOrAdmin` **stays real**, because *"a stubbed predicate would prove nothing."*

**Option B — no harness library exists and none should be added.** `next-test-api-route-handler`,
`node-mocks-http`, `supertest`, `msw` and `nock` are **all absent** from the 42 deps + 17 devDeps
`[VERIFIED: package.json read programmatically]`. Every existing route test constructs
`new NextRequest("http://localhost:3000/…", { method, body, headers })` by hand and passes
`{ params: Promise.resolve({...}) }`. Adding a dependency to a security phase enlarges its
supply-chain surface one phase after Phase 47 spent 14 plans on exactly that.

**Option C — real `withApiAuth` inside a `.db.test.ts`. Newly viable, and the strongest shape.**
Nothing blocks it, and I verified each prerequisite:
- `checkRateLimit` fails open with no Redis (`rate-limit.ts:26-37`) — measured on every live request.
- `runWithActor` is plain `AsyncLocalStorage` — no Next.js request context needed.
- `validateApiKey` is a `sha256` → `findFirst` on a table the test can seed (see Q2).
- `crmBus.emit` on PUT/DELETE is inert in a test process: subscribers are registered from
  `instrumentation.ts`, which vitest does not load. `[ASSUMED — inferred from the actor-context.ts:32-38
  comment about instrumentation living in a separate module graph; not executed]`

With Option C the test sends a genuine `Authorization: Bearer pk_live_…` for user A at a record owned
by user B, through the real auth wrapper, against real SQL. That is *literally* CONTEXT's
requirement — *"two distinct users with real API credentials, and the negative case must be a genuine
cross-user request — not a mocked-out authorization result."*

**Recommended split:**

| Criterion | Harness | Where | Why |
|-----------|---------|-------|-----|
| SC-1 (GET/PUT/DELETE × 3) | A | `src/app/api/v1/activities/[id]/__tests__/route.test.ts` (base) | Runs in CI. Fetch-then-compare is observable to a mock (see below). |
| SC-2 (`owner_id` reassign) | A | same file | Assert the response body's `owner_id` AND that `db.update` was not called. |
| SC-4 (stage GET) | A | `src/app/api/v1/stages/[id]/__tests__/route.test.ts` (base) | Runs in CI. |
| **SC-3 (list scoping)** | **C** | `src/app/api/v1/activities/activities-scope.db.test.ts` | **A mocked `@/db` provably cannot prove a `where` clause — the §Q9 ablation is the proof.** |
| **SC-5 (empty `IN`)** | **C** | `src/app/api/v1/stages/stages-scope.db.test.ts` | Needs a real Postgres to see `42601` become 200. |

**The load-bearing caveat on Harness A.** A mocked `findFirst` can prove a **fetch-then-compare**
check (`row.ownerId !== ctx.userId → 403`) because the mock returns a foreign-owned row and the
comparison executes for real. It **cannot** prove a **`where`-scoped** check, because the mock
ignores its argument. Since CONTEXT locks the `pipelines/[id]` reference shape — which *is*
fetch-then-compare — Harness A is sound for SC-1/2/4. **If the implementer instead adopts the
`organizations/[id]` `where`-scoped idiom, every Harness A test in this phase silently becomes
vacuous.** That coupling between the fix shape and the test validity must be written into the plan
as a constraint, not left as an implementation detail.

---

## Q8 — SC-3's live-dataset count is **vacuous by construction today**

Measured on `pipelite`:

```sql
select owner_id, count(*) n, count(*) filter (where deleted_at is null) live
  from activities group by owner_id order by n desc;

              owner_id                |   n   | live
--------------------------------------+-------+-------
 ef4acac9-e860-4e71-9db5-ddaa2808cb9f | 79022 | 79022
(1 row)
```

**One owner. Every activity. Zero rows belong to anyone else.** And that owner is
`prbitt@gmail.com`, `role = admin` (10 users total; 5 soft-deleted; the other 4 live users own no
activities).

Therefore, on the live dataset:

```
count(*) WHERE owner_id = 'ef4acac9…'  ==  count(*)         ==  79022
```

**A correctly-scoped query and a completely unscoped query return the identical number for the only
user who has data.** SC-3's assertion — *"the row count it returns equals a direct SQL count scoped
to that owner, on the live dataset"* — is satisfied **today, by the broken route**, if the caller is
that user. It is the eighth vacuous gate's exact shape: a success criterion already true before any
work begins. The criterion's own anti-vacuity clause ("so a passing assertion cannot come from an
empty result") defends the *floor* and leaves the *discrimination* undefended.

Two independent risks, and they compound:
1. **Single-owner data** → scoped count == total count.
2. **That owner is an admin** → if the fix grants admins a bypass, the equality is *permanently*
   trivially true regardless of the data.

### How to make it discriminating — three assertions, not one

SC-3 needs a **floor**, a **ceiling** and a **discriminator**:

| Role | Assertion | Fails when |
|------|-----------|-----------|
| **Ceiling** | `returned_total === SELECT count(*) FROM activities WHERE owner_id = A AND deleted_at IS NULL` | the route over-returns |
| **FLOOR** | that count `> 0` — and, per the milestone rule, a named integer floor (e.g. `>= 1`, or `>= 79022` if run against `pipelite`) | both sides are empty |
| **DISCRIMINATOR** | `returned_total !== SELECT count(*) FROM activities WHERE deleted_at IS NULL` **and** a second owner B with `>= 1` activity gets `returned_total === 1` and A's ids are absent from B's page | the query is unscoped (this is the assertion that is RED today) |

The discriminator requires **≥ 2 owners with ≥ 1 activity each**, which the live dataset does not
have. Concrete recommendation:

- Run SC-3 in the **db project** against `pipelite_dedup_test`, which starts **empty** — so the test
  seeds two users and a *named integer* number of activities per user (e.g. A:7, B:3), and asserts
  `A → 7`, `B → 3`, `total → 10`, `7 !== 10`, `3 !== 10`, with `7 >= 1` and `3 >= 1` as explicit
  floors and the ids compared as sets. Every number is a literal in the test, so an empty database or
  a failed seed goes red rather than green. This satisfies SC-3's *intent* (a scoped count that
  cannot pass empty) rather than its *letter*.
- Separately, satisfy SC-3's **letter** with a **read-only** live probe as a phase-gate step, not a
  committed test: with a temporary key for the sole owner, `GET /api/v1/activities` and compare
  `meta.total` to `select count(*) … where owner_id = 'ef4acac9…' and deleted_at is null`, **and**
  record that `79022 > 0`. Document in the plan that this half is a *smoke check*, not a proof,
  because the two numbers coincide.
- **If the plan cannot do both, do the seeded one.** A discriminating assertion on seeded data beats a
  non-discriminating assertion on live data. Say so in VALIDATION rather than reporting SC-3 PROVED on
  the live-data half alone.
- **Do NOT satisfy the discriminator by inserting activities for a second owner into `pipelite`.** It
  is the operator's real database, and 79,022 → 79,025 is a mutation of real data for a test's
  convenience.

---

## Q9 — Existing route-level authorization tests: yes, three — and one of them cannot fail

**188 test files total; 8 import a route handler:**

| File | What it authorizes | Can it fail? |
|------|--------------------|--------------|
| `src/app/api/v1/notes/__tests__/route.test.ts` | author-or-admin on PATCH/DELETE; `foreignNote` at `:91` is called *"the IDOR target"* | **YES** — `isAuthorOrAdmin` is deliberately left real (`:35-41`) |
| `src/app/api/v1/audit/__tests__/route.test.ts` | admin-only, role re-read from storage | `[ASSUMED]` yes — same shape; not ablated this session |
| `src/app/api/v1/organizations/[id]/__tests__/route.test.ts` | *claims* cross-user 404 at `:164` | **NO — measured** |
| `src/app/api/v1/workflows/__tests__/runs-routes.test.ts` | not authorization (the routes are unscoped, F1) | n/a |
| `src/app/api/health/__tests__/route.test.ts`, `deals/__tests__/formula-recalc.test.ts`, `people/__tests__/formula-recalc.test.ts`, `src/lib/api/__tests__/notes-collection.test.ts` | not authorization | n/a |

**Zero test files exist under `src/app/api/v1/activities/` or `src/app/api/v1/stages/`.** Enumerated
programmatically; the only files there are the 5 `route.ts`. CONTEXT's "zero test coverage" is
confirmed. (`activities/[id]/notes/route.ts` is covered indirectly by
`src/lib/api/__tests__/notes-collection.test.ts`.)

### THE TENTH VACUOUS GATE — measured, not read

`src/app/api/v1/organizations/[id]/__tests__/route.test.ts:164-172`:

```ts
it("returns 404 without calling the mutation when the organization is not the caller's", async () => {
  mockDb.query.organizations.findFirst.mockResolvedValueOnce(undefined)
  const response = await PUT(putRequest({ custom_fields: { Score: 999 } }), params)
  expect(response.status).toBe(404)
  expect(mockMutation).not.toHaveBeenCalled()
  expect(mockDb.update).not.toHaveBeenCalled()
})
```

The mock is `findFirst: vi.fn()` (`:13-20`). It **never inspects its `where` argument**. The route's
only cross-user behaviour *is* that `where` argument. So the test's pass is independent of whether
the predicate exists.

**Ablation, executed this session:**

```
$ # deleted all 3 occurrences of `eq(organizations.ownerId, context.userId),` (GET, PUT, DELETE)
$ git diff --stat -- "src/app/api/v1/organizations/[id]/route.ts"
 src/app/api/v1/organizations/[id]/route.ts | 3 ---
 1 file changed, 3 deletions(-)

$ npx vitest run "src/app/api/v1/organizations/[id]/__tests__/route.test.ts"
 Test Files  1 passed (1)
      Tests  6 passed (6)

$ npx vitest run                                     # THE ENTIRE BASE PROJECT
 Test Files  172 passed | 2 skipped (174)
      Tests  5237 passed | 32 skipped (5269)
   Duration  58.48s

$ git checkout -- "src/app/api/v1/organizations/[id]/route.ts" && git diff --exit-code && echo ok
ok
```

**With the authorization check removed from all three verbs of a live REST route, 5,237 tests pass
and not one goes red.** Three consequences for the plan:

1. **The `organizations/[id]` test is the pattern Phase 48 must NOT copy**, even though it is the only
   route-authorization test for an owner-scoped entity in the repo. The distinction is exact:
   `notes/__tests__/route.test.ts` mocks the *fetch* and keeps the *predicate* real; the
   organizations test mocks the fetch and the predicate is the `where` — so there is nothing left real.
2. **A negative control is mandatory per success criterion.** Every test this phase ships must be
   observed RED against the unfixed route, and the RED must be *recorded with its assertion diff*
   (the 46-06 / 47-13 standard). CONTEXT already says this; the ablation is why.
3. **`5237 passed` ≠ STATE.md's `5164 passed`.** My command was `npx vitest run` (base project only;
   `npm test` additionally runs the rsc project). The planner should **re-measure the baseline rather
   than inherit 5164** — a suite-count delta ledger built on a stale number will not reconcile.

---

## Q10 — A route-level regression gate: feasible, and here is the sketch with its floors

**Feasible, and it should be built** — the §Q9 ablation is the argument. Without it, this phase fixes
four routes and leaves the property unenforced for the 36th route somebody adds next month.

**It must live in the base project** (`src/app/api/v1/__tests__/route-authorization.test.ts`), because
CI never runs `.db.test.*`.

**It must be AST-based, not a grep.** The repo already has the template and the tooling: `typescript`
is a dependency and `src/lib/__tests__/suite-hook-hygiene.test.ts` (1680 lines) and
`suite-timing-hygiene.test.ts` are `ts.createSourceFile` sweeps with `KNOWN_POSITIVE` /
`KNOWN_NEGATIVE` in-file fixtures and named `MIN_*` floors. Copy that architecture wholesale.

### Sketch

```
1. Enumerate  src/app/api/v1/**/route.ts   via fs recursion (NOT grep — see Environment Hazards)
2. For each file, ts.createSourceFile → for each `export async function GET|PUT|PATCH|DELETE|POST`:
   a. does the body reach `withApiAuth`?                                     → else OFFENDER
   b. does an identity expression — `ctx.userId` / `context.userId` — flow into
      EITHER a `where` argument
      OR a BinaryExpression against a `*.ownerId|userId|authorId|createdBy` property access
      OR a call to a name in AUTHORIZERS = {verifyStageOwnership, authorizeNoteMutation,
         resolveActorRole, getWorkflow}                                      → else OFFENDER
3. Subtract EXEMPT (each with a written reason, and each reason is itself an assertion):
   - no owner column in the schema: custom-field-definitions, workflow-templates
   - deliberately public: docs
   - admin-only, role-gated instead of owner-gated: audit, trash/[type]/[id]
   - ACCEPTED-KNOWN, must be listed by name and count: workflows/[id]/runs, runs/[runId]   (F1)
4. expect(offenders).toEqual([])
```

### The floors, without which it is the eleventh vacuous gate

| Floor | Why |
|-------|-----|
| `MIN_ROUTE_FILES = 30` (measured 36, set below) | a wrong root or broken recursion yields `[]`, and `[]` has no offenders |
| `MIN_HANDLERS_PARSED = 55` (measured 68 `export async function` handlers + 4 delegated) | a `ts.createSourceFile` that fails to parse still returns a SourceFile, silently, with no statements |
| `MIN_AUTHORIZED_HANDLERS = 30` | if the *detector* breaks, every handler looks unauthorized AND every handler looks authorized depending on polarity; flooring the positives catches the second direction |
| `MIN_EXEMPT_MATCHED = <exact count>`, matched **by path** | an exemption list whose paths no longer exist silently widens; assert each exempt path still resolves to a real file |
| **`KNOWN_POSITIVE` fixtures** — synthetic handler sources that MUST be flagged | the detector's own falsifiability |
| **`KNOWN_NEGATIVE` fixtures** + **a parse floor on each** | `toEqual([])` on a negative is satisfied by a parse that returned nothing; count the nodes seen per fixture (the exact pattern at `suite-hook-hygiene.test.ts:1111-1112`) |
| **Token floor (WR-11)** | the gate's own identifiers (`ownerId`, `ctx.userId`, `withApiAuth`) must be counted as *found in the corpus*, so a rename that makes the detector stop detecting goes RED instead of green |

### And it must be falsified before it is trusted

**The acceptance test for the gate is the §Q9 ablation, replayed:** delete
`eq(organizations.ownerId, context.userId)` from `organizations/[id]/route.ts` and the new gate must
name that file and verb in its offender list. Record the offender line verbatim in the SUMMARY. If it
does not go red, the gate is worthless — and this is measurable in about 30 seconds, which is the
whole point.

**Two honest caveats the planner should hear before committing:**
- A dataflow check ("identity reaches the `where`") is the hard part and the place a lazy
  implementation degrades into "the token `ownerId` appears somewhere in the body" — which a *comment*
  satisfies (the collision that fired fifteen times across Phases 37-38). The `KNOWN_NEGATIVE`
  fixtures must include a handler whose only `ownerId` is inside a comment and inside a string literal.
- The gate cannot distinguish "authorizes correctly" from "authorizes". A route comparing against the
  *wrong* id passes it. That is acceptable — it is a *presence* gate, and presence is exactly what is
  absent today — but the plan must say so, or verify-work will over-read it.

---

## Recommended Fix Shape

### `activities/[id]/route.ts` — GET / PUT / DELETE

Match `pipelines/[id]/route.ts` exactly: fetch, then compare, then 403.

```ts
// GET :95-102, PUT :141-147, DELETE :271-277 — after each existing `if (!activity) notFound`:
if (activity.ownerId !== ctx.userId) {
  return Problems.forbidden()
}
```
`activities.ownerId` is `text NOT NULL` (`src/db/schema/activities.ts:11`), so no null branch.
**Do not move the check into the `where`** — that would return 404 (contradicting SC-4's 403 contract
for stages, and breaking consistency with the reference file) *and* it would make every Harness A
test in this phase vacuous (§Q7).

### `activities/[id]/route.ts` — PUT `owner_id`

`:188-191` currently writes `updateData.ownerId` unconditionally. Two candidate shapes:

| Option | Behaviour | Note |
|--------|-----------|------|
| **Reject** | `owner_id` present and `!== ctx.userId` → `Problems.validation` or `forbidden` | Explicit; the response tells the caller. **Recommended.** |
| Ignore | drop `owner_id` from `updateActivitySchema` / from `updateData` | Silent; a client believes the write landed |

Whichever is chosen, the assertion must be **on the persisted row / response body**
(`body.data.owner_id` unchanged) and **not** merely `expect(mockDb.update).not.toHaveBeenCalled()` —
the latter passes if the route rejects for an unrelated reason.
Also consider the mirror at `activities/route.ts:164` (F2), which is in-scope by file.

### `activities/route.ts` — GET

Add `eq(activities.ownerId, ctx.userId)` to `conditions` at `:53`, ahead of the optional
user-supplied `owner_id` filter at `:61-63`. Both the list query (`:81-87`) and the count
(`:88-91`) already share `conditions`, so **one line scopes both** — which is precisely what makes
SC-3's `meta.total` a meaningful ceiling. Keep the user-supplied `owner_id` filter (it becomes a
narrowing filter within the caller's own records; it cannot widen).

### `stages/[id]/route.ts` — GET

Call `verifyStageOwnership` (§Q5). Helper unchanged. Add an assertion that a bare GET's body has
**no `pipeline` key**, or the fix leaks the relation.

### `stages/route.ts` — GET

Replace `:59-93` with one owner-scoped, joined query paginated *after* the predicate. This closes
QG-03 by deleting `pipelineIds` entirely and closes F3 in the same edit. `:84-93` already contains
the correct join — `innerJoin(pipelines, eq(stages.pipelineId, pipelines.id))` with
`eq(pipelines.ownerId, ctx.userId)` and `isNull(pipelines.deletedAt)` — so the shape already exists
in the file for the count, and the list query should adopt it.
If the plan prefers the minimal edit, `sql\`${pipelines.id} IN ${pipelineIds}\`` →
`inArray(pipelines.id, pipelineIds)` alone fixes the 500 (empty → `false`, measured) but leaves F3.
**State which is chosen; do not leave it to the executor.**

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQL `IN` from a JS array | a raw `sql` fragment, or a `.length > 0` wrapper around one | `inArray()` from `drizzle-orm` | `inArray(col, [])` renders `false` in 0.45.2 — **measured**. A hand-rolled guard adds an untested branch to fix a case the library already handles. |
| Stage ownership check | a second predicate in the GET | the existing `verifyStageOwnership` (`stages/[id]/route.ts:34`) | It is already correct for PUT/DELETE and already returns the 404/403 discrimination the GET needs. |
| Role lookup | reading a role off the request | `resolveActorRole` (`src/lib/notes/authorize.ts:70`) | `ApiAuthContext` carries no role *by design*; `null` (unknown / soft-deleted / thrown) must deny, and that logic is already written and tested. |
| Route invocation in tests | `next-test-api-route-handler` / `supertest` / `msw` | direct handler import + `new NextRequest(...)` + `{ params: Promise.resolve({...}) }` | 8 files already do it; none of those packages is installed; a security phase should not enlarge the dependency surface one phase after Phase 47. |
| DB test isolation | `TRUNCATE`, a transaction wrapper, or a `beforeEach` reset | the prefix + baseline-count discipline in `views/queries.db.test.ts:113-260` | There is no transaction-rollback helper in this repo, and the baseline re-assert catches a row *mutated* rather than created — which a rollback would too, but which a naive prefix-delete would not. |
| Route-authorization gate | `grep -rn "ownerId" src/app/api/v1` | `ts.createSourceFile` sweep modelled on `suite-hook-hygiene.test.ts` | A comment explaining the rule satisfies the rule's own grep — that collision fired fifteen times in Phases 37-38. And `grep \| wc -l` returns wrong counts in this environment. |

**Key insight:** every hole in this phase is a *missing* line, not a wrong one. So the durable
deliverable is not the four fixes — it is a mechanism that makes the fifth missing line fail a build.
The §Q9 ablation says no such mechanism exists today.

---

## Common Pitfalls

### Pitfall 1: writing the test after the fix
**What goes wrong:** the test asserts what the code does, and a later regression that changes both
stays green.
**Why it happens:** the fix is one line and feels self-evidently correct.
**How to avoid:** TDD mode is already on (`config.json workflow.tdd_mode: true`). Record the RED with
its **assertion diff**, per 46-06/47-13.
**Warning signs:** a SUMMARY that says "verified the test covers the fix" instead of quoting a failure.

### Pitfall 2: asserting the already-true half of SC-4
**What goes wrong:** "non-owner without expand → 403" is GREEN today (§Q4). A suite of it reports
SC-4 PROVED while SEC-02 is untouched.
**How to avoid:** the discriminating assertion is `owner + no expand → 200`. Label the other three
cells regression guards in VALIDATION.
**Warning signs:** an SC-4 negative control that "could not be made to fail."

### Pitfall 3: an SC-3 count that both sides satisfy
**What goes wrong:** all 79,022 live activities have one owner, so scoped == unscoped (§Q8).
**How to avoid:** three assertions — ceiling, named-integer floor, and a *discriminator* requiring a
second owner with ≥ 1 record.
**Warning signs:** the test computes both numbers from the same `where`.

### Pitfall 4: mocking `@/db` for the list test
**What goes wrong:** a mocked `findMany` ignores `where`, so SC-3 passes with the scope deleted.
**How to avoid:** SC-3 and SC-5 go in the db project. §Q9 is the empirical proof, on this repo.
**Warning signs:** `vi.mock("@/db")` in the same file as a list-scoping assertion.

### Pitfall 5: choosing the `where`-scoped idiom and keeping Harness A
**What goes wrong:** switching to `and(eq(id), eq(ownerId, ctx.userId))` returns 404 (contradicting
SC-4) **and** makes every mocked cross-user test in the phase unfalsifiable.
**How to avoid:** lock fetch-then-compare + 403 in the plan, as a constraint on both the fix and
the tests.
**Warning signs:** a task that says "scope the query" for `activities/[id]`.

### Pitfall 6: leaking `pipeline` from the fixed stage GET
**What goes wrong:** after the fix the relation is always loaded, so an ungated projection returns it
on a bare GET — a new, smaller information leak introduced by a security fix.
**How to avoid:** assert `Object.keys(body.data)` has no `pipeline` on a bare GET.

### Pitfall 7: writing SC-5 as `expect(source).not.toContain("sql\`")`
**What goes wrong:** the tenth vacuous gate, and CONTEXT forbids it by name.
**How to avoid:** the two-request behavioural control in §Q6 (`offset ≥ count`: 500 → 200).
**Warning signs:** any `toContain` on route source text in this phase.

### Pitfall 8: an SC-5 ablation of a guard that does not exist
**What goes wrong:** the executor searches for the `stageList` non-empty guard, cannot find it, and
either invents one to delete or marks SC-5 unverifiable.
**How to avoid:** the plan must state up front that the guard does not exist and QG-03 is a live 500.
**Warning signs:** a plan task quoting SC-5 verbatim.

### Pitfall 9: `grep … | wc -l` for any count in this phase
**What goes wrong:** measured wrong in this environment (36 → 19); `grep -n "export"` returned
"0 matches" on a file with 15 export lines; `git status --porcelain` renders as `ok`.
**How to avoid:** every count in this research came from `node -e` with `fs`/`readdirSync`.
Cleanliness was verified with `git diff --exit-code`, never `git status`.

### Pitfall 10: mutating `pipelite` to make a test discriminating
**What goes wrong:** 79,022 real activities, one real owner. Inserting a second owner's rows to make
an assertion work is a data change for a test's convenience.
**How to avoid:** seed `pipelite_dedup_test`, which starts empty. Keep the live probe read-only.

---

## Code Examples

### The reference authorization shape (`pipelines/[id]/route.ts:46-58`)

```ts
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

### The route-test harness (`src/app/api/v1/notes/__tests__/route.test.ts:29-33, 63, 93-107`)

```ts
vi.mock("@/lib/api/auth", () => ({
  withApiAuth: vi.fn((req: NextRequest, handler: ApiRouteHandler) =>
    handler(req, { userId: "user-1", keyId: "key-1" })
  ),
}))

import { PATCH, DELETE } from "@/app/api/v1/notes/[noteId]/route"

function patchRequest(body: unknown, raw?: string) {
  return new NextRequest("http://localhost:3000/api/v1/notes/note-1", {
    method: "PATCH",
    body: raw ?? JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}
const params = { params: Promise.resolve({ noteId: "note-1" }) }
```

### The two-direction proof, stated (`src/lib/views/queries.db.test.ts:24-27`)

```
 * So the predicate is exercised against a real PostgreSQL, from BOTH DIRECTIONS: the owner of a
 * private view sees it, and a different account — including an ADMIN — does not. Only the pair is
 * a proof. The first assertion alone is satisfied by a query with no predicate at all; the second
 * alone is satisfied by a query that returns nothing.
```

### The db-test connection guard (`src/lib/views/queries.db.test.ts:68-106`, abridged)

```ts
const TEST_DATABASE = "pipelite_dedup_test"
const DEV_DATABASE = "pipelite"           // named here only so it can be refused BY NAME

function assertIsolatedConnection(connectionString: string | undefined): string {
  if (!connectionString) throw new Error("DATABASE_URL is not set for the db vitest project…")
  const url = new URL(connectionString)
  if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1")
    throw new Error(`refusing to run: connection host "${url.hostname}" is not loopback.`)
  const database = url.pathname.replace(/^\//, "")
  if (database !== TEST_DATABASE) throw new Error(`refusing to run: names "${database}"…`)
  return connectionString
}
assertIsolatedConnection(process.env.DATABASE_URL)   // module scope → aborts COLLECTION
```

### The empty-`IN` behavioural control (new, for SC-5)

```ts
// db project. `total` is read from the DB, so the request is aimed past the real end of the table.
const [{ n }] = await db.execute(sql`select count(*)::int as n from stages`)
expect(n).toBeGreaterThan(0)                              // FLOOR: an empty table proves nothing
const res = await GET(listRequest({ offset: n, limit: 5 }))
expect(res.status).toBe(200)                              // RED before the fix: 500 / SQLSTATE 42601
expect((await res.json()).data).toEqual([])
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `sql\`col IN ${arr}\`` | `inArray(col, arr)` | drizzle has shipped `inArray` throughout 0.2x-0.4x | the raw form is correct for non-empty arrays and a syntax error for empty ones |
| `inArray(col, [])` throws | `inArray(col, [])` renders `false` | present in **0.45.2**, measured | no `.length` guard needed; the historical edge case the objective asks about does not apply to the installed version |
| grep-based source gates | `ts.createSourceFile` sweeps with KNOWN_POSITIVE/NEGATIVE + `MIN_*` floors | Phase 47 (`suite-hook-hygiene`, `suite-timing-hygiene`) | the template for Q10's gate already exists in-repo |
| `pg_dump`-provisioned test DB because the chain could not replay | the chain **can** replay (Phase 46); the dump is kept for *faithfulness* to the running deployment | Phase 46 / DEPLOY-01 | `scripts/dedup-db-test-setup.sh`'s header documents this; don't "fix" it |

**Deprecated / stale in the planning documents themselves:**
- BACKLOG 999.18, REQUIREMENTS QG-03 and ROADMAP SC-5: "unreachable today… guarded by `stageList`
  being non-empty" — **false**. No such guard; live 500 at `offset ≥ 73`.
- BACKLOG 999.17: "These six route files have zero test coverage" — the count is four route files in
  scope (`activities/route.ts`, `activities/[id]/route.ts`, `stages/route.ts`,
  `stages/[id]/route.ts`); `activities/[id]/notes/route.ts` is covered via
  `notes-collection.test.ts`. Coverage is still zero for the four.
- STATE.md `5164 passed`: I measured `5237 passed | 32 skipped (5269)` for `npx vitest run` at commit
  `3681275` with a clean tree. Re-measure; do not inherit.

---

## Runtime State Inventory

Phase 48 is a code-and-test change with no rename, no migration and no schema change. Each category
was checked explicitly rather than left blank.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **None requiring migration.** `activities.owner_id` / `pipelines.owner_id` are already populated and `NOT NULL`; the fix reads them, it does not backfill them. One record *was* mutated by my reproduction (`e9d37d4c-…`, owner reassigned then soft-deleted) — **it was a fixture I created and it was hard-deleted.** No pre-existing row was altered. | none |
| Live service config | **None.** No n8n, no Datadog, no Tailscale in this stack. `docker-compose.yml` has 3 services (app, postgres, mailhog); the app's config is env-var driven and no env var names a route or an authorization posture. | none |
| OS-registered state | **None.** No Task Scheduler, no pm2, no systemd unit references these routes. Verified: the only long-running processes are the compose services. | none |
| Secrets / env vars | **None changed.** `E2E_DATABASE_URL` already exists in `.env` (`postgresql://pipelite:pipelite@localhost:5433/pipelite`) and is what `npm run test:db` needs — no new variable. `REDIS_URL` is unset, which is why rate limiting fails open; the phase must not depend on it. | none |
| Build artifacts | **The container image must be rebuilt, not restarted.** `docker compose restart` runs the OLD image — a route change is invisible until `docker compose up -d --build`. Current image `pipelite-app`, container up 7 h, Node v24.19.0 inside. **Any phase gate that curls `/api/v1` after editing a route MUST build first, and the build must itself be the gate** — a "Starting" log line is a vacuous freshness check. | `docker compose up -d --build`, then re-probe |
| **API keys created by tests** | If the plan uses a live-stack probe (SC-3's letter), it creates `api_keys` rows. Those are runtime state a code-only cleanup misses. | delete by id prefix; assert 0 leftovers, as this research did |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker (no `sudo`) | app + postgres + the db-test setup script | ✓ | compose v2, 3 services up | — |
| App container | live HTTP probes | ✓ | `pipelite-app`, up 7 h, Node v24.19.0, host 3001 → 3000 | — |
| `/api/health` | freshness / gate | ✓ | `200`, `{"status":"ok","db":{"ok":true,"latencyMs":1}}`, processors alive | — |
| PostgreSQL | everything | ✓ | `postgres:16-alpine`, healthy, host 5433 → 5432, role `pipelite`, db `pipelite` | — |
| `pipelite_dedup_test` | `npm run test:db` | ✓ provisionable | rebuilt every run by `scripts/dedup-db-test-setup.sh` | — |
| `E2E_DATABASE_URL` | `vitest.db.config.ts` | ✓ | in `.env`, loopback, port 5433 | — |
| Node (host) | vitest, all `node -e` measurement | ✓ | v24.13.1 | — |
| vitest | all three projects | ✓ | 4.1.11 | — |
| `drizzle-orm` | `inArray` | ✓ | **0.45.2** installed (declared `^0.45.2`) | — |
| `typescript` | the Q10 AST gate | ✓ | present; used by 3 existing gate files | — |
| **Redis** | `checkRateLimit` | **✗** | unset | **fails open by design** (`rate-limit.ts:26-37`) — no test may depend on rate limiting |
| `next-test-api-route-handler` / `supertest` / `msw` / `nock` | — | ✗ | — | **direct handler import** (8 existing files). Do not install. |
| `rtk` shell proxy | every Bash call | ✓ but **hostile to counting** | see Environment Hazards | `node -e` + `fs`; `git diff --exit-code` |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** Redis → fail-open; route-test harness libs → direct import.

---

## Environment Hazards (measured this session)

| Hazard | Observed | Mitigation |
|--------|----------|------------|
| `git status --porcelain` | rendered as the single token `ok` | use `git diff --exit-code` (exit 0) — used at every checkpoint here |
| `grep … \| wc -l` | wrong counts (36 → 19 recorded previously; not re-trusted here) | every count in this document came from `node -e` + `fs.readdirSync` |
| numeric output | wrapped in ANSI colour codes inside strings | parse with `node`, don't string-compare |
| heredoc / redirect into a file | writes an ELIDED file, exit 0 | `Write` tool for every file created; `docker exec -i … -f - < file` for SQL |
| shell quoting of nested `'` in `node -e` | broke a setup script outright | write the script to a file, then run it |
| `users.status` enum | `'active'` does not exist → `invalid input value for enum user_status` | values are `pending_verification \| pending_approval \| approved \| rejected` |
| `users.id` / `api_keys.id` | `text`, **no default** | fixtures must supply their own ids (which is convenient — it gives them a prefix) |
| `docker compose restart` | runs the OLD image | `up -d --build`, and make the build a gate |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.11 — **three** projects |
| Config (base, in CI) | `vitest.config.ts` — excludes `*.rsc.test.*` and `*.db.test.*` |
| Config (db, NOT in CI) | `vitest.db.config.ts` — includes `src/**/*.db.test.*`, `fileParallelism: false`, 60 s timeouts |
| Quick run (one file) | `npx vitest run <path>` |
| Full base suite | `npx vitest run` — measured `172 passed \| 2 skipped (174)` / `5237 passed \| 32 skipped (5269)`, 58 s |
| Full `npm test` | `vitest run && vitest run --config vitest.rsc.config.ts` |
| DB suite | `npm run test:db` (provisions `pipelite_dedup_test` first) |
| Typecheck / lint | `npm run typecheck` / `npm run lint` — **gate on ERRORS, never a warning total** (the count differs between the repo and a worktree) |
| Container gate | `docker compose up -d --build`, then `curl /api/health` → 200 with all processors alive |

### Phase Requirements → Test Map

| Req | Behavior | Type | Automated Command | File Exists? |
|-----|----------|------|-------------------|--------------|
| SEC-01 / SC-1a | GET `/activities/[id]`: non-owner → 403; **owner → 200** | unit (Harness A) | `npx vitest run "src/app/api/v1/activities/[id]/__tests__/route.test.ts"` | ❌ Wave 0 |
| SEC-01 / SC-1b | PUT: non-owner → 403 **and** no `db.update` call | unit (A) | same | ❌ Wave 0 |
| SEC-01 / SC-1c | DELETE: non-owner → 403 **and** row not tombstoned | unit (A) | same | ❌ Wave 0 |
| SEC-01 / SC-2 | PUT `{owner_id: other}` by the owner does **not** change `owner_id` (assert the body/row) | unit (A) | same | ❌ Wave 0 |
| SEC-01 / SC-2b (F2) | POST `{owner_id: other}` does **not** create a record owned by another user | unit (A) | `.../activities/__tests__/route.test.ts` | ❌ Wave 0 |
| **SEC-01 / SC-3** | list total == owner-scoped SQL count; **floor > 0**; **discriminator: != global count, and B sees only B's** | **integration (Harness C, db project)** | `npm run test:db` → `src/app/api/v1/activities/activities-scope.db.test.ts` | ❌ Wave 0 |
| SEC-02 / SC-4a | GET `/stages/:id` **owner, no expand → 200** *(the only RED-today half)* | unit (A) | `npx vitest run "src/app/api/v1/stages/[id]/__tests__/route.test.ts"` | ❌ Wave 0 |
| SEC-02 / SC-4b | non-owner → 403 with **and** without expand — *regression guard, GREEN today* | unit (A) | same | ❌ Wave 0 |
| SEC-02 / SC-4c | bare GET body has **no `pipeline` key** (guards the fix's own leak) | unit (A) | same | ❌ Wave 0 |
| **QG-03 / SC-5** | `?offset=<count>` → **200 + `data: []`** (500/42601 today); non-empty page correct with a **counted floor** | **integration (C, db project)** | `npm run test:db` → `src/app/api/v1/stages/stages-scope.db.test.ts` | ❌ Wave 0 |
| QG-03 / SC-5b | empty-set SQL contains no `IN ()` — asserted from `PgDialect`/`toSQL()`, **not** from route source text | unit | `.../stages/__tests__/in-clause.test.ts` (base) | ❌ Wave 0 |
| F3 (recommended) | owner's `?limit=5` returns their stage; `data.length` consistent with `meta.total` | integration (C) | `npm run test:db` | ❌ Wave 0 |
| Q10 gate | every `/api/v1` record handler authorizes; AST sweep with floors | unit (base, **in CI**) | `npx vitest run src/app/api/v1/__tests__/route-authorization.test.ts` | ❌ Wave 0 |
| Phase gate | `/api/health` 200 after a **rebuild**; live 500 becomes 200 | manual + scripted | `docker compose up -d --build && curl …/api/v1/stages?offset=<N>` | n/a |

### Sampling Rate

- **Per task commit:** `npx vitest run <the one changed test file>` + `npm run typecheck`
- **Per wave merge:** `npx vitest run` (full base) + `npm run lint` (errors only) + `npm run test:db`
- **Phase gate:** `npm test` green · `npm run test:db` green · typecheck 0 · lint **0 errors** ·
  `docker compose up -d --build` · `/api/health` 200 with all processors ·
  `GET /api/v1/stages?offset=<stage_count>` **200** · `git diff --exit-code` 0

### Wave 0 Gaps

- [ ] `src/app/api/v1/activities/[id]/__tests__/route.test.ts` — SC-1a/b/c, SC-2 (new file)
- [ ] `src/app/api/v1/activities/__tests__/route.test.ts` — SC-2b / F2 (new file)
- [ ] `src/app/api/v1/stages/[id]/__tests__/route.test.ts` — SC-4a/b/c (new file)
- [ ] `src/app/api/v1/activities/activities-scope.db.test.ts` — SC-3 (new file, db project)
- [ ] `src/app/api/v1/stages/stages-scope.db.test.ts` — SC-5, F3 (new file, db project)
- [ ] `src/app/api/v1/__tests__/route-authorization.test.ts` — the Q10 gate (new file, base/CI)
- [ ] **A shared two-user API-key fixture helper** for the db tests. None exists;
      `views/queries.db.test.ts` inlines its users. Extracting one is optional but it will be needed
      twice in this phase and again in Phase 50.
- [ ] Framework install: **none needed.** vitest, drizzle, typescript, the db project and its
      provisioning script all exist.

**Negative controls this phase owes (each must be recorded with verbatim tool output):**

| # | Control | Expected RED |
|---|---------|--------------|
| A | run each SC-1/SC-2/SC-4a test against the **unfixed** route | assertion diff, `200`/`403` vs expected |
| B | run the SC-5 test against the **unfixed** route | `500` / `Failed query: … IN () …` / SQLSTATE `42601` |
| C | run the SC-3 test against the **unfixed** route | returned total == global total, discriminator fails with both integers printed |
| D | **delete `eq(organizations.ownerId, context.userId)` and confirm the Q10 gate names it** | offender line with `file:verb` — *and note that today, per §Q9, this ablation is invisible to 5,237 tests* |
| E | remove one `MIN_*` floor's subject (e.g. point the route walker at an empty dir) and confirm the floor fires | `expected 0 to be greater than or equal to 30` |
| F | put `ownerId` **in a comment only** inside a `KNOWN_NEGATIVE` fixture and confirm it is still flagged | the fixture appears in the offender list |

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (unchanged) | Bearer API key, SHA-256 hashed at rest (`src/lib/api-keys.ts`). Not in scope. |
| V3 Session Management | no | `/api/v1` has no session path — key only. |
| **V4 Access Control** | **YES — the entire phase** | **Per-record ownership check in every handler.** This is ASVS 4.1.1/4.2.1 (function- and object-level access control) — OWASP API Security Top 10 **API1:2023 BOLA**, the canonical name for what SEC-01 is. Reference shape: `pipelines/[id]/route.ts:56-58`. |
| **V5 Input Validation** | **YES — partially** | `zod` schemas already validate shape (`updateActivitySchema:18-27`). The gap is **mass assignment**: `owner_id` is an accepted, authorization-relevant field (**API3:2023 Broken Object Property Level Authorization**). Fix = reject or drop it. |
| V6 Cryptography | no | SHA-256 key hashing exists and is untouched. |
| V7 Error Handling / Logging | incidentally | The QG-03 500 leaks the full SQL and the bound `params` into the container log (measured). Not caller-visible; noting it, not fixing it. |
| V13 API | YES | 403-vs-404 information disclosure — CONTEXT **defers** this deliberately (403 stays). Record; don't act. |

### Known Threat Patterns for Next.js 16 route handlers + Drizzle + API keys

| Pattern | STRIDE | Standard Mitigation | Status here |
|---------|--------|---------------------|-------------|
| **BOLA / IDOR** — object id from the path, no owner check | Elevation of Privilege, Information Disclosure | ownership predicate in every handler | **PRESENT**, reproduced on 4 verbs |
| **Mass assignment** — a writable field that changes who owns the record | Tampering, Elevation | server owns authorization-relevant fields; reject them from the body | **PRESENT** (`[id]:188-191` reassign, `route.ts:164` plant) |
| **Unscoped collection read** | Information Disclosure | scope in the `where`, never a JS post-filter | **PRESENT** (`activities/route.ts:53`) |
| **Authorization predicate reading caller-controlled state** | Elevation | inputs may choose the *projection*, never the *check* | **PRESENT** — this is SEC-02's root cause and the generalisable lesson |
| **SQL built by string interpolation** | Tampering (injection) / DoS | parameterised builders (`inArray`) | `IN ()` — a **DoS/500**, not an injection: values are bound as `$1..$n` (measured). Still must be fixed. |
| **Pagination applied before authorization** | Information Disclosure / correctness | filter, then paginate | **PRESENT** (F3) |
| **Authorization test that cannot fail** | *the milestone's own threat* | ablate the check; watch the test go red | **PRESENT** — `organizations/[id]` test, measured green under a 3-site ablation |
| Fail-open rate limiting | DoS | documented, accepted | present (no Redis); out of scope |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `crmBus.emit` is inert in a vitest process because subscribers register from `instrumentation.ts`, which vitest does not load | Q7 Option C | a db route test could fire real webhook/workflow side effects. **Verify before writing Harness C**: run one PUT through the real handler in the db project and assert no outbound delivery row. Cheap to check. |
| A2 | `audit/__tests__/route.test.ts` is a *falsifiable* authorization test | Q9 | if it is also vacuous, the repo has an eleventh, and the Q10 gate's exemption of `audit/` rests on an untested claim. Ablate `actor.role !== "admin"` and re-run — one command. |
| A3 | F1 (`workflows/[id]/runs*`) is out of scope per CONTEXT's deferred "general authorization audit" | Q1 | if the planner reads it as in-scope, two more route files and their tests join the phase. Needs an explicit decision, not an inference. |
| A4 | Fixing F3 (scope-then-paginate in `stages/route.ts`) is within the phase boundary because the file is named in scope | Fix Shape | it is a behaviour change beyond the three requirements; if descoped, QG-03 must be fixed with the minimal `inArray()` edit and F3 recorded in BACKLOG. |

---

## Open Questions

1. **Does an admin bypass the ownership check?**
   - Known: three postures coexist (owner-only / owner-or-admin / admin-only); `ApiAuthContext` has no
     role; `resolveActorRole` exists and denies on `null`.
   - Unclear: which one `/api/v1/activities` should have.
   - Recommendation: **owner-only**, matching the `pipelines/[id]` reference CONTEXT locked. And note
     the forcing measurement — the sole owner of all 79,022 live activities *is* an admin, so an admin
     bypass makes SC-3 permanently vacuous.

2. **Reject or silently ignore a foreign `owner_id` on PUT?**
   - Known: today it is written unconditionally; the `POST` mirror (F2) accepts it too.
   - Recommendation: **reject** (explicit response), and assert on the persisted value rather than on
     "the update was not called."

3. **Does SC-3 run against `pipelite` or `pipelite_dedup_test`?**
   - Known: SC-3 says "the live dataset"; the db harness points at an **empty** isolated database by
     hard assertion; the live dataset has one owner.
   - Recommendation: seeded-and-discriminating in the db project as the *proof*, plus a read-only live
     probe as a *smoke check*, and say plainly in VALIDATION which is which. Do not report SC-3 PROVED
     on the live half alone.

4. **Is the Q10 gate in scope?**
   - Known: CONTEXT leaves it to Claude's discretion; the §Q9 ablation shows nothing currently
     enforces the property.
   - Recommendation: **yes** — and its acceptance test is the ablation replayed. If the plan cannot
     afford it, say so explicitly rather than shipping a weaker grep version.

5. **Does the repo want one authorization idiom across `/api/v1`?**
   - Known: `pipelines`/`stages`/`webhooks` = fetch-then-compare → 403; `organizations`/`people`/
     `deals` = where-scoped → 404. Two contracts for the same property.
   - Recommendation: out of scope here (CONTEXT defers the general audit), but the Q10 gate must accept
     **both** idioms or it will flag 9 correctly-authorized handlers. Note this in the gate's design.

---

## Sources

### Primary (HIGH confidence — executed or read in this session)
- `src/app/api/v1/**/route.ts` — all 36 files enumerated and classified; the 6 in-scope/reference files read in full
- `src/lib/api/auth.ts`, `src/lib/api-keys.ts`, `src/lib/api/rate-limit.ts`, `src/lib/api/pagination.ts`, `src/lib/api/errors.ts`, `src/lib/notes/authorize.ts`, `src/lib/audit/actor-context.ts`
- `src/db/schema/{activities,pipelines,deals,people,organizations,notes,webhooks,workflows,api-keys,users}.ts`; live `\d users`, `\d api_keys`, enum ranges
- `vitest.config.ts`, `vitest.db.config.ts`, `scripts/dedup-db-test-setup.sh`, `.github/workflows/ci.yml`, `package.json`, `.env` (keys only)
- `src/lib/views/queries.db.test.ts`, `src/app/api/v1/notes/__tests__/route.test.ts`, `src/app/api/v1/organizations/[id]/__tests__/route.test.ts`, `src/lib/__tests__/suite-hook-hygiene.test.ts`
- **Live HTTP against `localhost:3001`** — 16 requests with recorded status codes and bodies (SEC-01 ×5, SEC-02 ×6, QG-03 ×4, health ×1)
- **Live SQL against `pipelite`** — owner distribution, table counts, enum introspection, fixture setup and cleanup with post-cleanup verification
- **`drizzle-orm@0.45.2` `PgDialect().sqlToQuery()`** — the 8-row `IN` rendering matrix, executed
- **Ablation:** 3 predicates deleted from `organizations/[id]/route.ts`; 1 file then the full base suite re-run; reverted, `git diff --exit-code` 0
- `.planning/{ROADMAP,REQUIREMENTS,BACKLOG,STATE}.md`, `48-CONTEXT.md`, `47-13-SUMMARY.md`

### Secondary (MEDIUM)
- Container logs (`docker logs pipelite-app-1`) — the verbatim `42601` failure with the generated SQL
- `docker compose ps` / `/api/health` — stack state and image freshness

### Tertiary (LOW / unverified)
- OWASP API Security Top 10 category names (API1:2023 BOLA, API3:2023 BOPLA) and ASVS V4/V5 numbering
  — **`[ASSUMED]` from training data, not fetched this session.** They are used as vocabulary only; no
  technical conclusion depends on the exact identifier.
- Historical drizzle "inArray requires at least one value" behaviour in older versions — `[ASSUMED]`;
  what matters is that **0.45.2 renders `false`**, which was measured.

---

## Metadata

**Confidence breakdown**
- Route audit (Q1): **HIGH** — all 36 files enumerated programmatically; every `NONE` and every
  ambiguous row read by hand.
- Authentication model (Q2): **HIGH** — `auth.ts` and `api-keys.ts` read in full; key format and hash
  scheme confirmed by successfully minting two working keys.
- SEC-01 / SEC-02 reproduction (Q3, Q4): **HIGH** — verbatim HTTP status codes and bodies from the
  running container; fixtures created and provably removed.
- `ownershipWith` analysis (Q5): **HIGH** — both code paths read line by line; the divergence is a
  single expression.
- QG-03 (Q6): **HIGH** — live 500 with the exact generated SQL and SQLSTATE, plus an 8-case dialect
  matrix on the installed version.
- Test infrastructure (Q7): **HIGH** for configs, scripts and patterns; **MEDIUM** for Harness C's
  end-to-end viability (A1 is untested — the crmBus inertness assumption).
- SC-3 vacuity (Q8): **HIGH** — one `GROUP BY` settles it.
- Existing authorization tests + the tenth vacuous gate (Q9): **HIGH** — the ablation was executed
  against the full suite, not reasoned about.
- Q10 gate feasibility: **MEDIUM** — the template and tooling exist and are in-repo; the dataflow
  detector is the unbuilt part and is where a lazy implementation degrades.

**Research date:** 2026-08-25
**Valid until:** 2026-09-24 (30 days — a stable, self-contained codebase). Two facts expire sooner and
must be re-measured at plan time: the **stage count** (the QG-03 `offset` threshold moves with it) and
the **suite totals** (`5237` was measured, `5164` is what STATE.md says).

**Repository left CLEAN** (`git diff --exit-code` 0, index clean) and the **stack left UP**
(`/api/health` 200, db latency 1 ms, processors alive). Fixtures created: 2 users, 2 api_keys,
2 activities, 1 pipeline, 1 stage, 5 audit_log rows — **all removed**, with post-cleanup counts
restored to `activities 79022 / stages 73 / pipelines 12 / users 10 / api_keys 8` and zero `p48res%`
leftovers in any of users, api_keys or audit_log.
