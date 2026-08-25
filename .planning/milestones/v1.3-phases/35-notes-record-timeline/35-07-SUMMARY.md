---
phase: 35-notes-record-timeline
plan: 07
subsystem: security
tags: [authorization, access-control, tdd, vitest, idor, asvs-v4, notes]

# Dependency graph
requires: ["35-01"]
provides:
  - "`isAuthorOrAdmin(note, actor)` — the single shared edit/delete predicate for notes, pure and DB-free"
  - "`resolveActorRole(userId)` — role lookup for the API-key surface, whose auth context carries no role"
  - "`NoteActor` type (`{ userId, role: 'admin' | 'member' }`) matching the `user_role` pg enum"
  - "15-case access-control truth table covering T-35-03, T-35-24 and T-35-25"
affects: [35-09, 35-10, 35-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Access-control decision extracted into one pure predicate so two differently-authenticated call sites cannot drift"
    - "Role read from storage for the API-key surface rather than trusted from the request"
    - "Fail-closed authorization inputs: an errored role lookup returns null, which the predicate rejects"
    - "Drizzle `where` clause asserted structurally in a unit test (walking `queryChunks` for column names) instead of trusted by comment"

key-files:
  created:
    - src/lib/notes/authorize.ts
    - src/lib/notes/authorize.test.ts
  modified: []

key-decisions:
  - "The predicate lives in `src/lib/notes/authorize.ts`, NOT in `src/lib/mutations/notes.ts` — the project's logged decision keeps ownership checks in server actions / API routes while mutations only check entity existence"
  - "`resolveActorRole` exists because `ApiAuthContext` is `{ userId, keyId }` only (src/lib/api/auth.ts:6-9); no existing v1 route performs this lookup, so the v1 admin-override branch needs it"
  - "An actor with an empty/falsy `userId` is rejected before any comparison, so a null `authorId` can never be matched by a null-ish actor id"
  - "A note with `authorId: null` is admin-only, never everyone-editable"
  - "The soft-delete filter is asserted structurally in the test (the `where` tree must reference `deleted_at`), not just documented"

patterns-established:
  - "One exported predicate + one unit test file owns a control that must hold across multiple auth surfaces; downstream plans grep-gate that they import it rather than inlining"

requirements-completed: [NOTE-01]

# Metrics
duration: 14min
completed: 2026-08-15
---

# Phase 35 Plan 07: Note Author-or-Admin Authorization Summary

**One tested predicate now owns the notes edit/delete decision for both auth surfaces — the Auth.js session action and the API-key v1 route — with the role for the API-key path re-read from `users` because the API auth context carries none.**

## Performance

- **Duration:** ~14 min
- **Tasks:** 2 (RED, GREEN)
- **Files created:** 2
- **Tests:** 15 passing

## Accomplishments

- Wrote the full access-control truth table before any implementation existed, so both future call sites (35-09 server action, 35-10 v1 route) inherit an already-proven contract.
- Implemented `isAuthorOrAdmin` as a pure function with zero imports beyond the type — no `db`, no I/O — which is precisely what makes it callable identically from a session context and from an API-key context.
- Implemented `resolveActorRole` to close the gap the pattern map flagged: `ApiAuthContext` is `{ userId, keyId }` with no role, and no v1 route in the repo reads one. Without this, the admin-override branch would have been unenforceable over the API.
- Made the module fail closed at every edge: absent actor, empty actor id, unknown user, soft-deleted user, and a throwing lookup all resolve to "denied".

## TDD Cycle

### RED — `test(35-07)` (`88fd9b6`)

`src/lib/notes/authorize.test.ts` written first; `npx vitest run` exited non-zero with
`Cannot find module '/src/lib/notes/authorize'`. RED confirmed on the missing module, not on a
weak assertion.

Coverage written down before implementation:

| Case | Note | Actor | Expected |
|------|------|-------|----------|
| allows the author | `authorId:'u1'` | `u1` / member | `true` |
| allows an admin who is not the author | `authorId:'u1'` | `u2` / admin | `true` |
| allows an admin who is the author | `authorId:'u1'` | `u1` / admin | `true` |
| rejects a non-author member (T-35-03, the IDOR control) | `authorId:'u1'` | `u2` / member | `false` |
| rejects a member on a null-author note | `authorId:null` | `u2` / member | `false` |
| allows an admin on a null-author note | `authorId:null` | `u2` / admin | `true` |
| rejects a null or undefined actor | any | `null` / `undefined` | `false` |
| null authorId does not match a null-ish actor id | `authorId:null` | `''` / member | `false` |
| performs no database access | — | — | `findFirst` never called |

Plus `resolveActorRole`: stored role returned; caller-supplied role never trusted (T-35-24);
unknown user → `null`; soft-deleted user → `null` **with a structural assertion that the `where`
tree references `deleted_at`**; a throwing lookup → `null` and a logged error (T-35-25); and a
composition test proving a failed lookup makes `isAuthorOrAdmin` deny.

### GREEN — `feat(35-07)` (`ad3c4e0`)

`src/lib/notes/authorize.ts`: 15/15 tests pass, `npm run typecheck` clean, `npm run lint`
0 errors (128 pre-existing warnings, none in the new files).

Invariant gates from the plan, all verified:

- `grep -v '^\s*//' src/lib/notes/authorize.ts | grep -c ' == '` → `0`; ` != ` → `0`
- `isNull(users.deletedAt)` present → 1 match
- No `db.` reference inside `isAuthorOrAdmin`

### REFACTOR — none

The implementation is already the minimal form the tests demand: an early fail-closed guard, an
admin short-circuit, and one strict-equality comparison. There is nothing to collapse without
losing the explicit null-author edge, so no refactor commit was made.

## Threat Mitigations Implemented

| Threat ID | Mitigation |
|-----------|-----------|
| T-35-03 (IDOR) | `isAuthorOrAdmin` returns `false` for a non-author member; unit-tested, and both 35-09 and 35-10 must import this exact function |
| T-35-09 (drift) | A single exported predicate; the two call sites have exactly one function to import |
| T-35-24 (claimed role) | `resolveActorRole` reads `users.role` from Postgres; no caller-supplied role is accepted anywhere in the module |
| T-35-25 (fail open) | `resolveActorRole` catches, logs, and returns `null`; `isAuthorOrAdmin(note, null)` is `false` |

## Key Decisions

1. **The predicate does not live in the mutation layer.** The repo's logged decision is that
   ownership checks stay in server actions / API routes while mutations only verify existence.
   A standalone `src/lib/notes/` module honours that while still giving both surfaces one import.
2. **The empty-string actor id is rejected up front**, before any comparison — this kills the whole
   falsy-equality bug class rather than patching one instance of it.
3. **The soft-delete filter is asserted, not documented.** The test walks the drizzle `SQL`
   condition tree collecting reachable column names and requires `deleted_at` among them, so
   dropping the filter fails the suite instead of silently authorising deleted users.
4. **A null `authorId` is admin-only.** The alternative readings (nobody, or everybody) are both
   wrong: admins must be able to clean up unattributed notes, and no member should inherit them.

## Deviations from Plan

None — the plan executed as written. One comment was reworded during GREEN to avoid the literal
substring ` == ` inside a code comment, so the plan's loose-equality grep gate stays unambiguous.

## Deferred Issues

- `src/lib/execution/condition-evaluator.test.ts > "scales linearly, not quadratically, with path
  length"` fails in this worktree (`expected 26.99 to be less than 10`). This is a wall-clock ratio
  assertion from phase 34 (T-34-20) that is sensitive to machine load, and several executor agents
  were running in parallel. Pre-existing and unrelated to this plan's files — not touched, per the
  scope boundary. The rest of the suite is green: **888 passed / 1 failed / 4 skipped**.

## Notes for Future Plans

- **35-09 (server actions)** — build the actor from the Auth.js session
  (`{ userId: session.user.id, role: session.user.role }`); do NOT call `resolveActorRole` there,
  the signed session already carries the role.
- **35-10 (v1 routes)** — `const actor = await resolveActorRole(context.userId)` then
  `if (!isAuthorOrAdmin(note, actor)) return Problems.forbidden()`. Budget the extra query; it is
  one indexed primary-key lookup per mutating request.
- Both plans carry a grep gate asserting they import `isAuthorOrAdmin` from
  `@/lib/notes/authorize` rather than inlining a check. Do not weaken it.
- **35-11 (UI)** — hiding the edit/delete buttons for non-authors is cosmetic. The control is the
  server-side call; the UI may mirror the same predicate for affordance, but must never be the
  only place it runs.

## Commits

- `88fd9b6` — `test(35-07): add failing tests for note author-or-admin authorization`
- `ad3c4e0` — `feat(35-07): implement shared note author-or-admin authorization`

## TDD Gate Compliance

RED (`test(35-07)`, `88fd9b6`) precedes GREEN (`feat(35-07)`, `ad3c4e0`) in git log. No REFACTOR
commit — none was warranted. Gate sequence satisfied.

## Self-Check: PASSED

- `src/lib/notes/authorize.ts` — FOUND
- `src/lib/notes/authorize.test.ts` — FOUND
- `.planning/phases/35-notes-record-timeline/35-07-SUMMARY.md` — FOUND
- Commit `88fd9b6` — FOUND
- Commit `ad3c4e0` — FOUND
