---
phase: 37-trash-restore
plan: 12
subsystem: api
tags: [rest, api-v1, trash, authorization, admin-gate, rfc7807, delegation]

# Dependency graph
requires:
  - plan: 37-02
    provides: "TRASH_TABS / TRASH_TAB_TO_ENTITY / parseTrashTab / isTrashEntityType — the closed vocabulary every untrusted string narrows through"
  - plan: 37-06
    provides: "restoreRecordByType / purgeRecordByType — the dispatch both write routes delegate to"
  - plan: 37-07
    provides: "TRASH_PAGE_SIZE, listTrashed, countTrashed, findTrashedRecord — the owner-scoped reads and the ownership guard's source of truth"
  - phase: 35
    provides: "resolveActorRole — the storage re-read for an auth context that carries no role"
  - phase: 36
    provides: "/api/v1/audit — the admin-gate and closed-literal-filter precedent this plan copies"
provides:
  - "GET /api/v1/trash — owner-or-admin scoped listing with the standard { data, meta } envelope"
  - "POST /api/v1/trash/{type}/{id}/restore — owner-or-admin restore, 204 on success"
  - "DELETE /api/v1/trash/{type}/{id} — admin-only purge, gate ahead of the record lookup"
affects:
  - "37-10 (the server actions must make the SAME owner-or-admin / admin-only decisions these routes make)"
  - "any later plan that documents the REST surface in public/openapi.yaml"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "z.enum pointed at the SHARED allow-list constant rather than a route-local copy of the literals"
    - "authorization decided from a storage-resolved role, never from the auth context, on every request"
    - "the admin gate placed ahead of the record lookup so 403/404 cannot be read as an existence oracle"
    - "cumulative page API reconciled to offset/limit by slicing AFTER the scoped query, never before it"
    - "grep-gated invariants kept greppable: prose in these files deliberately does not spell the tokens its own gates search for"

key-files:
  created:
    - src/app/api/v1/trash/route.ts
    - src/app/api/v1/trash/[type]/[id]/restore/route.ts
    - src/app/api/v1/trash/[type]/[id]/route.ts
  modified: []

key-decisions:
  - "The redundant per-route runWithActor wrap the plan specified was OMITTED: withApiAuth already wraps every /api/v1 handler in runWithActor({ kind: 'api_key', userId }) and documents itself as the ONLY place an api_key actor is created. T-37-08 is satisfied there; a second identical wrap would be a second creation site with zero behavioural difference"
  - "offset/limit is reconciled to listTrashed's cumulative page signature by asking for the smallest covering page and slicing the window out of it — queries.ts was NOT extended, because 37-10 owns that file this wave"
  - "The deleted_by kind is emitted in the snake_case spelling /api/v1/audit already uses (workflow_run, api_key), mapped through an exhaustive switch so a sixth presentation kind is a compile error"
  - "The {type} path segment is validated with z.enum rather than run through parseTrashTab: parseTrashTab's silent default is right for a hand-editable URL and wrong for a REST caller, and after it runs the miss is no longer detectable"
  - "The segment-narrowing helper is duplicated across the two write routes rather than shared: an app-router route.ts may not export helpers, and both copies read the same TRASH_TABS constant so they cannot drift in vocabulary"

patterns-established:
  - "Pattern: a REST route validates an attacker-controlled path segment against the same exported allow-list the UI uses, and reports the miss instead of defaulting"
  - "Pattern: for an irreversible verb, the role gate runs before any read of the target record"

requirements-completed: [TRASH-01, TRASH-02, TRASH-03]

# Metrics
duration: ~55min
completed: 2026-08-16
tasks_completed: 2
files_created: 3
---

# Phase 37 Plan 12: Trash REST Surface Summary

**Three `/api/v1/trash` routes that make exactly the authorization decisions the UI makes and none
of the writes — the listing's owner scope stays inside the query, the purge gate runs before the
record is ever looked up, and both mutations are delegated so there is still one restore and one
purge implementation per entity.**

## Performance

- **Duration:** ~55 min
- **Tasks:** 2 (2 commits)
- **Files created:** 3
- **Tests added:** 0 committed (13 live checks run against the Docker database and deleted — see below)

## What Was Built

### `GET /api/v1/trash` — the listing

`ApiAuthContext` is `{ userId, keyId }` and carries no role, so the role is re-read from storage
with `resolveActorRole(context.userId)` on **every** request. Unlike `/api/v1/audit` this is not an
admin gate — the resolved role *builds the scope* rather than refusing the request — but an actor
that cannot be resolved at all (unknown user, soft-deleted user, or a thrown lookup, all `null`
from `resolveActorRole`) is still denied with 403, carrying the T-35-25 posture forward.

The viewer handed to `listTrashed` / `countTrashed` is built **only** from that resolved actor.
Nothing the caller sent contributes to it, and the rows are never re-filtered after the query: the
scope is the composed `trashScope` predicate inside 37-07's module, so the `meta.total` in the
envelope and the rows under it are scoped by construction (T-37-02). Live: an admin key saw
`total: 12`, a member key with no records saw `total: 0`, from the same handler.

`?type=` is validated with `z.enum(TRASH_TABS)` — pointed at the exported allow-list itself, not at
a route-local copy of the four literals. The audit route declares its own array because its
vocabulary exists nowhere else; the trash vocabulary is the opposite case, and re-typing it here
would create exactly the drift `entity-types.ts` exists to prevent. An unrecognised value is a 422
with the allow-list spelled out, **not** `parseTrashTab`'s silent fallback: a client that asked for
`?type=notes` and received a page of deals has been told nothing and will ship the bug (T-37-03).
`parseTrashTab` is still called afterwards, on an already-valid value, purely so "which tab is the
default" stays in one place.

### The offset/limit ↔ page reconciliation (the choice the plan left open)

`listTrashed(tab, page, viewer)` is **cumulative** — it returns rows `1..(page × TRASH_PAGE_SIZE)`,
because the UI it was built for is a "Load more" list. The route therefore asks for the smallest
page covering `offset + limit` and slices the window out of it. **The slice is presentation, never
authorization**: every row it discards was already inside the caller's scope.

The alternative — adding an offset-based read to `src/lib/trash/queries.ts` — was rejected because
37-10 is extending that file in a parallel worktree this wave.

`parsePagination` clamps `limit` but leaves `offset` unbounded, so the ceiling is re-applied here:
200 pages of 50 is 10,000 records, matching the `MAX_TRASH_PAGE` bound `entity-types.ts` puts on
the UI surface. `?offset=99999999` returns `200` with zero rows and a truthful `total`, rather than
asking the database to skip millions. The honest cost is that serving `offset=9950` fetches 10,000
rows; that is bounded, acceptable for a trash view, and the fix if it ever bites is an offset-based
read in the query layer — not a second scoped query written in a route.

### `deleted_by` says only what the schema can prove

The presentation union is mapped through an exhaustive `switch` (a sixth kind is a compile error)
into the snake_case spelling `/api/v1/audit` already uses for the same concepts — `workflow_run`,
`api_key` — so a client does not meet two vocabularies for one fact. A user carries `name` and
`email`, a workflow run carries `workflow_name`, and the other four carry nothing.

**No api-key name field is emitted, and none can be.** `audit_log` holds `actor_user_id`,
`workflow_run_id` and `import_session_id` and no api-key reference at all; the subscriber stores
the key's *owner* in `actor_user_id` for that kind, so resolving a name through it would pick an
arbitrary one of that user's keys and publish it as fact (T-37-31). `not_recorded` and
`unknown_user` stay separate members on the wire for the same reason they are separate in
`present.ts`: "nobody wrote it down" is not "a user did it and cannot be named".

### `POST .../restore` — owner-or-admin

Narrow the segment → resolve the role (null ⇒ 403) → `findTrashedRecord` (null ⇒ 404) →
`record.ownerId !== context.userId && role !== "admin"` ⇒ 403 → delegate → 204. The lookup is
scoped to trashed records only, so a *live* record and a missing one are the same 404 — restore is
not a way to discover live ids. A `NOT_IN_TRASH` refusal (already restored, or purged between the
lookup and the write) surfaces as 404, because from the caller's position the record is simply not
there; anything else is a 500.

### `DELETE .../{id}` — admin-only, gate first

The one ordering that is a security property rather than a style choice: **the admin check runs
before the record lookup** (T-37-01). With the lookup first, a member could walk ids and read the
404/403 split as an existence oracle for records they may not see. Verified live — a member key got
403 for a real trashed id and 403 for `no-such-deal-id`, the same answer either way.

Both routes delegate to `src/lib/trash/dispatch.ts` and issue no write of their own, so the ordered
child teardown and the `isNotNull(deletedAt)` guard stay in exactly one place per entity (T-37-32).
Neither emits a CRM bus event.

## Task Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | `f4a97c1` | feat(37-12): add GET /api/v1/trash owner-or-admin listing |
| 2 | `598f7f6` | feat(37-12): add REST restore and admin-only purge for trashed records |

## Verification

| Check | Required | Result |
|-------|----------|--------|
| `npm run typecheck` | exit 0 | **exit 0** |
| `npm run lint` | 0 errors | **0 errors, 125 warnings** (baseline unchanged; none in the new files) |
| `npm test` | green | **1601 passed / 4 skipped**, + **8** rsc — exactly the wave-2 baseline |
| `grep -c 'crmBus'` on both write routes | 0 | **0 / 0** |
| `grep -c 'db.update\|db.delete'` on both write routes | 0 | **0 / 0** |
| Admin gate at a lower line than `findTrashedRecord` (purge) | required | **line 93 vs line 99** |
| `grep -ci 'apikeyname\|api_key_name'` on the listing | 0 | **0** |
| `grep -c 'z.enum'` on the listing | ≥1 | **2** |
| `grep -c 'await resolveActorRole('` per route | 1 each | **1 / 1 / 1** |
| `grep -c 'withApiAuth(request'` on the listing | 1 | **1** |

Two acceptance criteria are written as `grep -c` counts of `1` for `withApiAuth` and
`resolveActorRole`. `grep -c` counts matching **lines**, and the import statement always matches, so
the literal number is unreachable for any file that uses either symbol — `/api/v1/audit/route.ts`,
the plan's own reference, returns 2 for `withApiAuth`. The intent (exactly one wrapper, exactly one
role resolution per handler) is met and is recorded above against call-site greps instead.

### Live checks against the running Docker database

The container serves a baked image built from an earlier commit, so `curl`ing `localhost:3001`
would have tested code that does not contain these routes. Rebuilding the shared image mid-wave
would have disrupted the sibling worktree agents. Instead a throwaway vitest probe imported the
**real** route modules and drove them with real `NextRequest`s carrying real bearer tokens — so
`withApiAuth`, key validation, `resolveActorRole`, the dispatch and the mutations all ran for real
against the live database. The probe was deleted before either commit and never staged.

Fixtures: one throwaway member user, two throwaway API keys (one admin, one member) and two
throwaway trashed deals owned by the admin. Nothing pre-existing was restored or purged. After the
run the trashed-deal count was back to its pre-probe value of 12, with zero probe rows left in
`deals`, `api_keys` or `users`.

| Request | Result |
|---------|--------|
| `GET /trash?type=deals` (admin) | **200**, `X-Total-Count: 12`, rows carry `entity_type: "deal"`, ISO `deleted_at`, `deleted_by: { kind: "not_recorded" }` |
| `GET /trash?type=deals` (member, owns nothing) | **200**, `meta.total: 0` — the owner scope, over REST |
| `GET /trash?type=notes` | **422** `VALIDATION_ERROR`, `field: "type"`, message naming all four literals |
| `GET /trash` (no `?type=`) | **200**, 12 rows — defaults to deals |
| `GET /trash?type=deals&offset=2&limit=3` | **200**, 3 rows, `meta: { total: 12, offset: 2, limit: 3 }` |
| `GET /trash?type=deals&offset=99999999` | **200**, 0 rows, `total: 12` — the page ceiling holds |
| `GET /trash` (no Authorization header) | **401** |
| `GET /trash?type=people` / `organizations` / `activities` | **200** each; the activity row carried `linked_parents: ["Activity Test Deal"]` |
| `POST /trash/notes/{id}/restore` | **422**, segment echoed back |
| `POST /trash/deals/{id}/restore` (no auth) | **401** |
| `POST /trash/deals/{id}/restore` (member, not owner) | **403**, `deleted_at` unchanged |
| `POST /trash/deals/{unknown}/restore` (admin) | **404** |
| `POST /trash/deals/{id}/restore` (admin) | **204**, `deleted_at` is `null` afterwards |
| the same restore repeated | **404** — the `NOT_IN_TRASH` mapping |
| `DELETE /trash/deals/{id}` (no auth) | **401** |
| `DELETE /trash/deals/{id}` (member) | **403**, the row survives |
| `DELETE /trash/deals/{unknown}` (member) | **403** — same answer as for a real id: no oracle |
| `DELETE /trash/deals/{id}` (admin) | **204**, row gone from `deals`, gone from the listing, `total` 13 → 12 |
| `DELETE /trash/deals/{unknown}` (admin) | **404** |
| `DELETE /trash/deals/{live id}` (admin) | **404**, the live record untouched — purge is not a hard-delete shortcut |

## Deviations from Plan

### Adapted, not auto-fixed

**1. The per-route `runWithActor` wrap was omitted — `withApiAuth` already establishes it**

- **Plan text:** restore step 5 and the purge's equivalent both specify
  `runWithActor({ kind: "api_key", userId: context.userId }, () => …RecordByType(...))`, and T-37-08
  requires every REST write to carry that actor.
- **What is actually true:** `src/lib/api/auth.ts:74` already wraps **every** `/api/v1` handler in
  `runWithActor({ kind: "api_key", userId: result.userId }, () => handler(request, result))`, and
  its header states this is "the ONLY place an `api_key` actor is created … routes need no
  per-mutation edit to be audited". A nested wrap with an identical actor is a no-op on an
  `AsyncLocalStorage` scope.
- **Resolution:** the wrap is omitted and each route carries a paragraph naming
  `src/lib/api/auth.ts:74` as where T-37-08 lands. Adding it would have introduced a second
  api-key-actor creation site — contradicting a documented module invariant — for zero behavioural
  difference. The mitigation itself is unchanged: both routes' writes run inside an `api_key` actor
  scope whose `userId` is the key's owner.
- **How to re-verify:** the audit rows written by the live purge above carry
  `actor_kind = 'api_key'` by virtue of that wrapper alone.

**2. `isTrashEntityType(parseTrashTab(segment))` cannot detect the failure it is supposed to report**

- **Plan text:** "Narrow `type` with `isTrashEntityType` after mapping the plural path segment
  through `TRASH_TAB_TO_ENTITY[parseTrashTab(type)]` — but return `Problems.validation(...)` for an
  unrecognised segment."
- **Issue:** `parseTrashTab` returns `"deals"` for both `"deals"` and garbage, so once it has run the
  miss is gone; the two halves of the instruction cannot both be followed.
- **Resolution:** the membership test happens **first**, with `z.enum(TRASH_TABS)` — the same
  allow-list and the same shape the listing route uses for `?type=`, so the query-param and
  path-segment surfaces validate identically. The result is mapped through `TRASH_TAB_TO_ENTITY` and
  then narrowed with `isTrashEntityType`, which is what proves at runtime that a value which arrived
  as an untyped string is an `EntityType`.

**3. Two grep-gated invariants were tripped by the prose asserting them**

- **Found during:** running task 2's own acceptance criteria.
- **Issue:** `grep -c 'db.update\|db.delete'` returned **1** on the purge route — the match was a
  comment reading "There is no `db.delete` in this file and none may be added". A gate its own
  documentation can defeat is not a gate.
- **Fix:** both routes' delegation paragraphs were reworded to assert the property without spelling
  the tokens the gate searches for, and each says so explicitly, so a future editor does not
  reintroduce the literal. This mirrors the same discipline already recorded in
  `src/lib/api/auth.ts:67-70`.
- **Files modified:** both write routes (before the task 2 commit).
- **Verification:** both routes now return 0.

### Documented choices the plan left open

**The segment-narrowing helper is duplicated, not shared.** An app-router `route.ts` may only export
route handlers, so the purge route cannot export a helper for its `restore/` child, and a shared
module would have been a fourth file outside the plan's artifact list. Both copies read the same
`TRASH_TABS` constant, so they can differ in shape but never in vocabulary — which is the property
that matters for T-37-03.

**`DELETE` returns 204, not the `detached` count.** `PurgeResult` carries the number of live children
the purge unlinked rather than destroyed. It is useful in the UI toast, but a `DELETE` returning a
body would be the only one under `/api/v1` that does.

---

**Total deviations:** 1 auto-fixed (a self-defeating grep gate), 2 adaptations.
**Impact on plan:** no scope change. Three files, no package installed, no migration, no change to
any file another wave-3 agent owns — `src/lib/trash/queries.ts` was read from and never touched.

## Issues Encountered

The `users.status` enum has no `active` member (`pending_verification` / `pending_approval` /
`approved` / `rejected`); the probe's throwaway member was created with `approved`. This only
affected the probe fixture, not shipped code.

## Known Stubs

None. All three routes issue real queries and real writes, verified end to end above.

## Threat Coverage

| Threat | Disposition | Where it lands |
|--------|-------------|----------------|
| T-37-01 (EoP on purge) | mitigate | Role re-read from storage; `!actor \|\| actor.role !== "admin"` at line 93, `findTrashedRecord` at line 99. Live: a member got 403 for both a real id and a nonexistent one |
| T-37-02 (disclosure via listing/restore) | mitigate | The viewer is built only from the resolved actor and the scope lives in `trashScope`; restore re-checks owner-or-admin against the record's own `ownerId`. Live: member `total: 0` vs admin `total: 12` |
| T-37-03 (tampering via `[type]`) | mitigate | `z.enum(TRASH_TABS)` on both the query param and the path segment, then `isTrashEntityType`; a miss is a 422 with the allow-list |
| T-37-08 (actor attribution) | mitigate | Established once by `withApiAuth` (`src/lib/api/auth.ts:74`) for every handler — see deviation 1 |
| T-37-31 (api-key name disclosure) | mitigate | The serializer emits no key-name field; grep for `apikeyname\|api_key_name` returns 0 |
| T-37-32 (duplicated write logic) | mitigate | Both routes delegate to `dispatch.ts`; the drizzle-write grep returns 0 on both, and the gate is no longer defeated by its own comment |
| T-37-SC (package installs) | accept | Nothing installed |

## Threat Flags

Three new network endpoints were introduced — but all three are the endpoints this plan exists to
add and all three are already in its threat register with a `mitigate` disposition and a live check
above. No new file access, no schema change, and no trust boundary beyond the three the plan names.

## Notes for Later Plans

- **`public/openapi.yaml` does not document these routes.** It also does not document
  `/api/v1/audit`, which Phase 36 shipped undocumented, so this follows the immediately preceding
  precedent rather than inventing a rule. Whichever plan updates the spec should add both at once:
  `/trash`, `/trash/{type}/{id}` and `/trash/{type}/{id}/restore`.
- **The listing pays for the cumulative page API.** If deep paging over REST ever matters, add an
  offset-based read to `src/lib/trash/queries.ts` and delete `pageCovering` — do **not** write a
  second scoped query in the route.
- **37-10's server actions must match these decisions exactly**: restore is owner-or-admin, purge is
  admin-only. Both surfaces compare against `findTrashedRecord`'s `ownerId`; if one of them starts
  computing ownership differently, that is the drift the whole arrangement exists to prevent.
- **No route test file was committed.** The repo has a well-worn idiom for these
  (`src/app/api/v1/audit/__tests__/route.test.ts`: mock `@/db`, bypass `withApiAuth`, stub
  `resolveActorRole`). A follow-up could pin the two orderings that are security properties — the
  admin gate ahead of the lookup, and the scope reaching the query rather than a post-filter —
  without a database.

## Self-Check: PASSED

Files:
- FOUND: `src/app/api/v1/trash/route.ts`
- FOUND: `src/app/api/v1/trash/[type]/[id]/restore/route.ts`
- FOUND: `src/app/api/v1/trash/[type]/[id]/route.ts`

Commits:
- FOUND: `f4a97c1` feat(37-12): add GET /api/v1/trash owner-or-admin listing
- FOUND: `598f7f6` feat(37-12): add REST restore and admin-only purge for trashed records

No tracked file was deleted by either commit; the throwaway probe was removed before the first
commit touched it and never appeared in `git status` as staged.

---
*Phase: 37-trash-restore*
*Completed: 2026-08-16*
