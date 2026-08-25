---
phase: 36-audit-log
plan: 15
subsystem: rest-api
tags: [audit-log, api-v1, authorization, admin-only, read-only, tdd]
requires:
  - "36-03 (audit_log table, AuditEntityType / AuditActorKind / AuditLogRow types)"
  - "35-09/35-10 (resolveActorRole — the API-key surface's role re-read)"
provides:
  - "GET /api/v1/audit — read-only, admin-only, offset/limit paged, snake_case"
  - "the read-only method-surface assertion (POST/PUT/PATCH/DELETE are undefined)"
  - "zod-validated entity_type / entity_id / actor_kind / workflow_run_id filters"
affects:
  - "36-19/36-20 (API docs + phase verification), any future audit read surface"
tech-stack:
  added: []
  patterns:
    - "local admin-only gate by direct role comparison, deliberately NOT reusing isAuthorOrAdmin"
    - "`as const satisfies readonly AuditEntityType[]` — compile-time drift guard on a zod enum"
    - "PgDialect().sqlToQuery(where) in tests to assert a value is BOUND, not interpolated"
    - "thenable chainable drizzle-builder mock discriminated on the select() projection argument"
key-files:
  created:
    - src/app/api/v1/audit/route.ts
    - src/app/api/v1/audit/__tests__/route.test.ts
  modified: []
decisions:
  - "422 (Problems.validation) is this repo's 400-class validation response; the plan said '400-class' and this is what that means here."
  - "paginatedResponse, not `listResponse` — the plan named a helper that does not exist in src/lib/api/response.ts."
  - "Authorization runs BEFORE filter validation, so a non-admin gets 403 and never learns the filter grammar."
  - "Unknown query parameters are ignored, not rejected — they compose no predicate, and rejecting them breaks clients that append tracking keys."
metrics:
  duration: ~20 min
  completed: 2026-08-15
---

# Phase 36 Plan 15: Read-Only Admin Audit REST Endpoint Summary

`GET /api/v1/audit` returns the audit log to an admin API key and to nobody else — with the
mutating verbs asserted absent by a test that imports the module, so a future edit that adds one
breaks the suite rather than shipping quietly.

## What Was Built

**`src/app/api/v1/audit/route.ts`** — one exported handler, `GET`, wrapped in `withApiAuth`.

| Concern | How |
|---------|-----|
| Authentication | `withApiAuth` (one call site), inheriting bearer parsing, key validation, rate limiting |
| Authorization | local `authorizeAuditRead` → `resolveActorRole(context.userId)`, then `actor.role !== "admin"` → `Problems.forbidden()` |
| Fail-closed | `!actor` takes the same branch — never a non-admin fallback, never default-allow |
| Filters | one zod object, four optional keys, validated before any fragment is composed |
| Paging | `parsePagination(req)`; the clamp is NOT re-implemented here |
| Ordering | `created_at DESC, id DESC` |
| Response | `paginatedResponse(rows.map(serializeAuditEntry), total, offset, limit)` — snake_case |
| Errors | `console.error("GET /api/v1/audit failed:", error)` + `Problems.internalError()` |

Three constraints are written into the file as comments so they travel with it:

1. **The read-only constraint, in the module header.** It states that no create/update/amend/delete
   verb exists or may be added, names the two legitimate write paths (36-11's subscriber, 36-12's
   importer row) and the one legitimate deletion path (36-18's pruner), and says why: a mutating
   handler here would let an API-key holder rewrite the record of what an API key did.
2. **Why the gate is local rather than an extension of `src/lib/notes/authorize.ts`.** That module's
   own header declares it notes-specific by design, and `isAuthorOrAdmin` is "admin OR author" —
   there is no author on an audit row, so reusing it would quietly widen the gate to whoever matched
   an ownership field. This is a direct role comparison and nothing else.
3. **Why 403 and not 404.** The endpoint's existence is not a secret worth keeping, and a 404 would
   tell an admin whose role lookup transiently failed that the route is gone.

The two literal sets are declared `as const satisfies readonly AuditEntityType[]` /
`readonly AuditActorKind[]`. That is not decoration: if 36-03's union ever gains or renames a
member, a stale literal here stops compiling instead of silently becoming an unreachable filter.

**`src/app/api/v1/audit/__tests__/route.test.ts`** — 20 cases in five groups. `@/db`,
`@/lib/api/auth` and `resolveActorRole` are mocked; `parsePagination`, `Problems` and the real
`auditLog` table are not.

Two things the test does that are worth keeping:

- **`PgDialect().sqlToQuery(where)`** renders the composed predicate to real SQL text plus bind
  params, so `?entity_type=deal` is asserted to put `"deal"` in **params** and to leave it out of
  the **SQL text**. That is an assertion about injection resistance rather than about a mock.
- **The db mock discriminates on the `select()` projection argument** (`undefined` → the row read,
  `{ total: count() }` → the total), so it does not depend on `Promise.all` evaluation order.

## TDD Gate Compliance

| Gate | Commit | Evidence |
|------|--------|----------|
| RED | `c8b7a8d` | `vitest run src/app/api/v1/audit` → `Cannot find package '@/app/api/v1/audit/route'`, exit non-zero |
| GREEN | `033b5da` | 20/20 pass |
| REFACTOR | — | not taken: no duplication to remove, lint clean on first pass |

**The RED was a module-resolution failure**, which proves less than a failing assertion does. So
the admin gate was **mutation-tested** after GREEN: replacing `if (!actor || actor.role !== "admin")`
with `if (!actor)` made exactly 2 of the 20 cases fail (the non-admin deny and the
authorize-before-validate case), then the file was restored from a backup and verified. The gate is
load-bearing, not incidentally satisfied.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The plan's `listResponse` does not exist**

- **Found during:** Task 2
- **Issue:** The plan says "Response: `listResponse` with snake_case items, matching every other
  `/api/v1` route." `src/lib/api/response.ts` exports `paginatedResponse`, `singleResponse`,
  `createdResponse` and `noContentResponse`. There is no `listResponse` anywhere in the repo.
- **Fix:** Used `paginatedResponse`, which is what the plan's own "matching every other `/api/v1`
  route" clause actually points at — `src/lib/api/notes-collection.ts:109` is the nearest precedent
  and returns the `{ data, meta: { total, offset, limit } }` envelope.
- **Files modified:** `src/app/api/v1/audit/route.ts`
- **Commit:** `033b5da`

**2. [Rule 3 - Blocking] Three grep gates count the import line, so their stated value is unreachable**

- **Found during:** Task 2
- **Issue:** The acceptance criteria require `grep -c "withApiAuth"` = 1, `grep -c "resolveActorRole"`
  = 1 and `grep -c "parsePagination"` = 1. Each of those symbols must be **imported** before it can
  be **called**, so the honest floor for a correct file is 2 lines, not 1 — and for the two that are
  also named in explanatory comments, 3. No correct implementation can score 1 without aliasing the
  import purely to dodge a grep, which is the tail-wagging-dog move 36-03 rejected.
- **Fix:** Ran each gate as a **call-site** count, which is what the threat model actually asks for
  ("Grep-asserted at exactly one occurrence" as the guarantee that no handler is unwrapped). Both
  numbers are reported below rather than the convenient one.
- **Files modified:** none
- **Commit:** n/a (verification interpretation only)

**3. [Rule 3 - Blocking] `npx` is intercepted in this environment**

- **Found during:** Task 1
- **Issue:** `npx <bin>` is rewritten to `npm run <bin>` here, so `npx vitest run …` fails with
  `Missing script`. Independently, the worktree has no `node_modules` at all.
- **Fix:** Symlinked `node_modules` to the main checkout (line 4 of `.gitignore` is `/node_modules`,
  so it can never be staged) and invoked `./node_modules/.bin/vitest` and `./node_modules/.bin/tsc`
  directly. Same binaries, same config resolution. The symlink appears in no commit. This is the
  same deviation 36-03 recorded.
- **Files modified:** none
- **Commit:** n/a (tooling invocation only)

### Judgement Calls (not deviations, but decided here)

- **`400`-class means `422`.** The plan says an invalid filter is "rejected with a `400`-class
  problem". `Problems.validation` is this repo's validation response and it is 422 on every existing
  v1 route. Using 400 would have made this one endpoint inconsistent with the rest of the surface.
- **Authorization runs before filter validation.** The plan lists filters first. Doing it in that
  order would let a non-admin probe the filter grammar with 422s before hitting the 403. One test
  (`"authorizes before validating, so a non-admin learns nothing from a bad filter"`) pins the order.
- **Unknown query parameters are ignored.** `?sort_by=whatever` returns 200 and composes no
  predicate. Rejecting unknown keys is not a security gain here and breaks clients that append
  tracking parameters; a test pins the behaviour so it is a decision rather than an accident.
- **`changes` is returned verbatim.** Per-field access control on audit reads is explicitly out of
  scope for this phase (36-CONTEXT § Phase Boundary), so admin-only is the whole of the gate. Noted
  in the serializer comment.

## Threat Model Coverage

| Threat ID | Disposition | Where mitigated |
|-----------|-------------|-----------------|
| T-36-05 | mitigate | `authorizeAuditRead` re-reads the role via `resolveActorRole` (context carries none) and denies `null` identically to a non-admin. 3 tests, plus a mutation test proving the role comparison is load-bearing. |
| T-36-33 | mitigate | Only `GET` is exported. Asserted by importing the module namespace and checking `POST`/`PUT`/`PATCH`/`DELETE` are `undefined`, by a second test that `insert`/`update`/`delete` are never called on a read, and by the grep gate (0). Constraint written into the module header. |
| T-36-06 | mitigate | Four filters, each zod-validated against a closed literal set or floored at 1 character, with an early return before composition. Four tests assert `db.select` is never called on an invalid value; one asserts the valid value lands in **bind params**, not in SQL text. |
| T-36-10 | mitigate | One `withApiAuth` call site wrapping the one exported handler. |
| T-36-34 | mitigate | `parsePagination` owns the clamp; three tests assert `.limit(MAX_PAGE_SIZE)` on `?limit=99999`, `.offset(0)` on `?offset=-5`, and the defaults when absent. |
| T-36-SC | accept | Zero packages added. |

## Known Stubs

None. The route queries the real `audit_log` table through the real drizzle builder; only the
database client is mocked, and only in tests.

## Threat Flags

None. This plan adds one read-only endpoint whose surface is entirely described by the register
above; no new schema, no new write path, no new trust boundary.

## Out-of-Scope Observation (not fixed, by scope rule)

One full-suite run showed a single failure at
`src/lib/execution/condition-evaluator.test.ts:616` — the ReDoS regression guard, which asserts
`large / small < 10` on wall-clock timings. Two subsequent full runs were green
(69 files / 1175 tests / 4 skipped). It is a pre-existing timing-jitter-sensitive assertion in a
file this plan does not touch, and it failed under the load of a 69-file parallel run. Recorded
here rather than in a shared `deferred-items.md`, because three wave-3 agents writing that file
concurrently in separate worktrees would collide on merge; whoever consolidates the phase should
decide whether to give that assertion more headroom.

## Verification

| Check | Result |
|-------|--------|
| `vitest run src/app/api/v1/audit` (before implementation) | exit non-zero — RED |
| `vitest run src/app/api/v1/audit` | 20/20 pass |
| `vitest run src/app/api/v1` | 6 files / 93 tests pass |
| `vitest run` (whole suite) | 69 files / 1175 pass, 4 skipped |
| `npm run typecheck` | exit 0 |
| `eslint src/app/api/v1/audit` | exit 0, no warnings |
| `grep -cE "export async function (POST\|PUT\|PATCH\|DELETE)" route.ts` | `0` |
| `grep -c "export async function GET" route.ts` | `1` |
| `grep -c "withApiAuth" route.ts` | `2` literal (1 import + **1 call site**) — see Deviation 2 |
| `grep -c "withApiAuth(request" route.ts` | `1` |
| `grep -c "resolveActorRole" route.ts` | `3` literal (import + comment + **1 call site**) |
| `grep -c "await resolveActorRole(" route.ts` | `1` |
| `grep -c "parsePagination" route.ts` | `3` literal (import + comment + **1 call site**) |
| `grep -c "parsePagination(req)" route.ts` | `1` |
| `grep -c "Problems.forbidden" route.ts` | `1` (>= 1) |
| `grep -c "Problems.notFound" route.ts` | `0` |
| `it(` blocks in the test | `20` (>= 9) |
| test name matching `/read-only/` | present (`"is read-only: the module exports GET and no mutating handler"`) |
| `grep -c "forbidden"` in the test | `2` (>= 2) |
| deletions in either commit | none |

## Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 (RED) | 20 failing admin-only audit REST cases | `c8b7a8d` |
| 2 (GREEN) | Read-only admin audit REST endpoint | `033b5da` |

## For the Next Plan

- `GET /api/v1/audit` accepts `entity_type`, `entity_id`, `actor_kind`, `workflow_run_id`, `offset`,
  `limit`. Everything else is ignored. **36-19 should document exactly those six.**
- `import_session` is an accepted `entity_type` on this surface — deliberately, since the importer's
  summary row (36-12) is otherwise unreachable over REST. That is the opposite of the record
  timeline, where `assertEntityType` blocks it.
- The `SerializedAuditEntry` shape lives inline in the route because this plan's `files_modified`
  names two files. If a **second** audit read surface appears, lift it into
  `src/lib/api/serializers/` first — the notes serializer exists as one definition for exactly this
  reason, and a second copy is how one endpoint starts leaking a field the other does not.
- The read-only method-surface test is the regression detector for T-36-33. Do not weaken it into a
  grep-only gate; it is the part that survives a file rename.

## Self-Check: PASSED

Files verified present on disk:
- `FOUND: src/app/api/v1/audit/route.ts`
- `FOUND: src/app/api/v1/audit/__tests__/route.test.ts`

Commits verified in `git log`:
- `FOUND: c8b7a8d`
- `FOUND: 033b5da`

STATE.md and ROADMAP.md were **not** touched — the orchestrator owns those. The `node_modules`
symlink is gitignored (`.gitignore:4`) and appears in no commit.
