---
phase: 37-trash-restore
plan: 10
subsystem: server-actions
tags: [trash, authorization, server-actions, audit-actor, restore, purge, tdd]

requires:
  - phase: 37-trash-restore
    provides: "37-06 — restoreRecordByType / purgeRecordByType and their result types"
  - phase: 37-trash-restore
    provides: "37-07 — findTrashedRecord, the module findTrashedParents extends"
  - phase: 37-trash-restore
    provides: "37-02 — parseTrashTab, TRASH_TAB_TO_ENTITY, TRASH_PARENTS"
  - phase: 36-audit-log
    provides: "runWithActor and the globalThis-backed actor storage"
provides:
  - "src/app/trash/actions.ts — restoreRecord, restoreWithLinked, purgeRecord, TrashActionResult, TrashErrorCode"
  - "src/lib/trash/queries.ts — findTrashedParents, TrashedParentRef"
affects:
  - "37-1x trash-table.tsx (the three actions it calls and the five codes it switches on)"
  - "37-11 REST routes (the same authorization matrix at a different boundary)"

tech-stack:
  added: []
  patterns:
    - "the authorization predicate is re-checked against the RECORD, and independently against EACH parent, inside the action rather than at the client"
    - "the admin gate is placed BEFORE any lookup, so a denied action is not an existence oracle"
    - "discriminated failure CODES rather than prose, so the UI branches instead of string-matching"
    - "one runWithActor scope wrapping every write of a multi-record operation, opened after the session check"
    - "the parent set for a linked restore is derived server-side from an id, never taken from the client"
    - "denial tests assert the ABSENCE of the mutation call, not only the returned code"

key-files:
  created:
    - src/app/trash/actions.ts
    - src/app/trash/actions.test.ts
  modified:
    - src/lib/trash/queries.ts
    - src/lib/trash/queries.test.ts

key-decisions:
  - "findTrashedParents reuses findTrashedRecord for the parent lookup, so isNotNull(deletedAt) plus the name/owner projection stays expressed in exactly one place in the module"
  - "The owner-or-admin comparison is one `notOwnerOrAdmin` function in the negated deals/actions.ts:83 shape rather than three inline copies — the linked path applies it per parent and Phase 35 recorded what happens to hand-copied ownership checks"
  - "The per-tab list selects were NOT widened with parent ids: findTrashedParents takes an id and re-derives the parents on the server, which is the security property, and nothing on TrashRow would consume them"
  - "restoreWithLinked returns { name, tab, count }, a superset of the plan's { count }, so the linked toast can name the record and its destination exactly as the plain restore toast does"
  - "purgeRecord's admin gate precedes the lookup, so every id — real or invented — costs a non-admin zero database reads and returns the same code"

patterns-established:
  - "Pattern: a multi-record write re-checks authorization per record and skips what the caller may not touch, counting only what actually succeeded"
  - "Pattern: the mutation-call ABSENCE is the assertion on every authorization denial"

requirements-completed: [TRASH-02, TRASH-03]

duration: ~25min
completed: 2026-08-16
tasks_completed: 2
tests_added: 41
files_created: 2
---

# Phase 37 Plan 10: Trash Server Actions Summary

**Restore, restore-with-linked and purge, each re-checking owner-or-admin against the record it is
about to write — and, in the linked path, independently against every parent it restores — with one
audit actor scope per operation and five discriminated codes the UI can turn into five different
sentences.**

## Performance

- **Duration:** ~25 min (15:55 → 16:11)
- **Tasks:** 2 (both TDD, 4 commits)
- **Files created:** 2, modified 2
- **Tests added:** 41 (13 + 28)

## What Was Built

### `findTrashedParents` — the server re-derives what "linked" means

`findTrashedParents(entityType, id)` returns the record's ancestors that are **themselves in trash**,
each carrying `entityType`, `id`, `name` and — the load-bearing field — `ownerId`.

It takes an **id**, not a list, and that is a security property rather than an ergonomic one. A
client-supplied list of records to restore is a client-supplied list of records to **write**, and
re-checking the id the user clicked says nothing at all about the other ids in that list. So the
function reads the child's foreign keys itself and looks up each parent `TRASH_PARENTS[entityType]`
names.

Three things it deliberately does not do:

- **It does not issue a query for an organization.** `TRASH_PARENTS.organization` is empty, so the
  function returns before touching the database. Reading the row anyway to discover there is nothing
  to read would make the emptiness of that list a comment instead of a control. A test asserts
  `db.select` was never called.
- **It does not re-implement the trashed-record lookup.** The parent lookup **is**
  `findTrashedRecord` — the same `isNotNull(deletedAt)` predicate and the same name/owner projection
  the ownership guards already run against. A live parent therefore cannot be returned, and there is
  no second place in this module where "a record that is in trash" is expressed.
- **It does not filter the CHILD on `deleted_at`.** The child's own trashed-ness is the caller's
  guard to make; repeating it here would make the badge impossible on a live record's page.

At most two round-trip waves: the child's foreign keys, then the parents concurrently. A null foreign
key costs no query at all. Results come back in `TRASH_PARENTS` order — organization, then person —
which is the order the caller must restore them in.

### The three actions, and where the gate actually is

`trash-table.tsx` will hide `Delete permanently` from a non-admin and hide `Restore` from a
non-owner. **Neither of those is a control.** A server action is a POST endpoint the browser can
invoke directly with no page render involved — the fact `src/app/admin/audit/actions.ts:3-17`
records about `/admin/*`, where a layout redirect protects every page and no action. So:

| Action | Gate | Placement |
|--------|------|-----------|
| `restoreRecord` | owner-or-admin, against the record's own `ownerId` | after the lookup |
| `restoreWithLinked` | owner-or-admin for the record, **and again per parent** against that parent's `ownerId` | per record |
| `purgeRecord` | `session.user.role !== "admin"` | **before any lookup** |

The purge gate's placement is the whole of T-37-01's second half: a non-admin who could tell a real
id from an invented one by the returned code would have an existence oracle. Every id costs them zero
database reads and returns `NOT_ADMIN`.

**A parent the caller may not touch is skipped, not fatal.** The record they actually clicked still
comes back, and the skipped parent is excluded from `count`, so the toast never claims more records
came back than actually did (T-37-28). A member whose deal hangs off a colleague's organization is
the common case here, not an attack.

**Parents first, outermost first.** `cascadeToChildren` in the formula engine filters on the child
relation's null `deleted_at`, so a parent restored *after* its child means the child's cascade ran
while the parent was still trashed and its rollups are wrong until something else touches them. The
test pins the order through `invocationCallOrder`, not through the shape of the code.

### Codes, not prose

```
NOT_AUTHENTICATED  NOT_AUTHORIZED  NOT_ADMIN  NOT_IN_TRASH  FAILED
```

`NOT_IN_TRASH` is forwarded from the mutation as itself and never flattened. That is the difference
between telling a user "this was permanently deleted" and telling them to retry a record that no
longer exists, forever (37-RESEARCH § Pitfall 7). Everything else becomes `FAILED`, and a test
asserts the driver's own message (`"Database unavailable"`, `"foreign key violation on activities"`)
never appears in the serialised result.

### Attribution

Every write is wrapped in `runWithActor({ kind: "user", userId: session.user.id })`, with the scope
opened **after** the session check so an unauthenticated call establishes no actor at all. The
linked path opens **one** scope around all four restores. Tests assert the actor object, that its
`userId` equals the session's, and — via `invocationCallOrder` — that the wrap precedes the first
write. Without it the audit subscriber's documented `actor?.kind ?? "system"` fallback would
attribute every restore and purge in this phase to the system (§ Pitfall 9).

## Task Commits

| Task | Gate | Commit | Message |
|------|------|--------|---------|
| 1 | RED | `f73f861` | test(37-10): add failing tests for trashed-parent lookup |
| 1 | GREEN | `36a9f2a` | feat(37-10): add findTrashedParents |
| 2 | RED | `bf46caf` | test(37-10): add failing authorization-matrix tests for the trash actions |
| 2 | GREEN | `41d559f` | feat(37-10): add restoreRecord, restoreWithLinked and purgeRecord |

## TDD Gate Compliance

Both tasks ran a real RED gate, and neither failed on an assertion:

- Task 1's RED failed 13 tests with `findTrashedParents is not a function` while all 36 tests plan
  37-07 wrote stayed green.
- Task 2's RED failed the whole file with `Cannot find module '/src/app/trash/actions'` — the module
  did not exist when the test was committed.

`test(...)` precedes `feat(...)` for both tasks in `git log`. No REFACTOR gate was needed; the one
structural change made during GREEN (extracting `notOwnerOrAdmin`) landed before the `feat` commit.

## Verification

| Check | Required | Result |
|-------|----------|--------|
| `npx vitest run src/lib/trash/queries.test.ts` | prior 36 still green | **49 passed** (36 + 13) |
| `npx vitest run src/app/trash/actions.test.ts` | ≥18 tests, full matrix | **28 passed** |
| `npm run typecheck` | exit 0 | **exit 0** |
| `npm run lint` | 0 errors | **0 errors, 125 warnings** (baseline unchanged; none in the new files) |
| `npx vitest run` (default project) | — | **1642 passed** (1601 baseline + 41 new) |
| `npx vitest run --config vitest.rsc.config.ts` | — | **8 passed** |
| `grep -c 'TRASH_PARENTS' src/lib/trash/queries.ts` | ≥1 | **9** |
| `grep -c 'isNull(' src/lib/trash/queries.ts` | 0 (37-07 invariant) | **0** |
| `grep -c 'role !== "admin"' src/app/trash/actions.ts` | ≥2 | **3** |
| `grep -c 'runWithActor' src/app/trash/actions.ts` | ≥3 | **5** |
| Non-admin purge asserts the dispatch was NOT called | required | **3 tests** (owner-member, non-owner-member, and the pre-lookup oracle test) |
| `runWithActor` actor asserted on every successful path | required | **3 tests**, one per action |
| Parents-before-record order via `invocationCallOrder` | required | **1 test**, plus a second pinning the actor scope opens before the first write |

No flakes: `condition-evaluator.test.ts` and `toggle.test.ts` both passed in the full run.

### Live-database check (beyond the plan's automated verification)

The mocked suite proves the statement's *shape*; it cannot prove postgres.js accepts the new child
lookup or that the parent projection comes back correctly. Probed against the running Docker
database with a throwaway test (deleted before commit, never staged), asserting the **absence** of
any `[trash-queries]` degrade log — the function swallows failures by design, so a green call proves
nothing on its own:

- `findTrashedParents("activity", "15d14ce6-…")` returned exactly
  `[{ entityType: "deal", id: "7c8e6af4-…", name: "Activity Test Deal", ownerId: <set> }]` — the
  same trashed activity/deal pair 37-07 saw through the list join, now resolved through the new
  path, with the parent's real owner attached.
- `findTrashedParents("deal", "7c8e6af4-…")` returned `[]` with no degrade log: that deal's own
  parents are live or absent, which is the "a live parent is never returned" branch on real data.
- `findTrashedParents("deal", "00000000-…")` (no such row) returned `[]` with no degrade log.
- `findTrashedParents("organization", …)` returned `[]` against real infrastructure without opening
  a connection.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The worktree had no `node_modules`**

- **Found during:** Task 1 RED
- **Issue:** The agent worktree was created without dependencies, so `npx vitest` and
  `npm run typecheck` could resolve nothing.
- **Fix:** Symlinked the main checkout's `node_modules` into the worktree. `/node_modules` is
  gitignored, so nothing was staged and no lockfile changed. **No package was installed** — this
  phase installs nothing (37-RESEARCH § Package Legitimacy Audit, T-37-SC).
- **Files modified:** none tracked
- **Verification:** `git status --short` reports a clean tree with no untracked entry
- **Committed in:** n/a

### Adapted, not auto-fixed

**2. The owner-or-admin guard is one function, not three inline copies**

The plan's step 4 says to reproduce "the exact guard shape from `src/app/deals/actions.ts:83`", and
an acceptance criterion greps for `role !== "admin"` at least twice. Written literally that means
three copies of `x.ownerId !== session.user.id && session.user.role !== "admin"` — one in
`restoreRecord`, one in `restoreWithLinked`'s record check, one in its **per-parent** check.

Resolution: the comparison is written **once**, in the same negated shape, as
`notOwnerOrAdmin(caller, ownerId)`, and called at all three sites. Phase 35 recorded exactly why:
three hand-copied ownership comparisons in `src/app/organizations/actions.ts` drifted, which is the
reason `isAuthorOrAdmin` exists at all. The grep criterion is still met (3 matches — the predicate,
its doc comment quoting the deals form, and `purgeRecord`'s independent admin gate), and the
admin-only gate remains a genuinely separate check rather than a parameter to the shared one.

**3. The per-tab list selects were NOT widened with parent ids**

37-07's handoff note suggests adding `organizationId` / `personId` / `dealId` to the existing
per-tab selects so the restore-the-parent-too affordance has parent ids without a second query.
That was not done, and the reason is the plan's own security requirement: `findTrashedParents` takes
an **id** and re-derives the parents server-side precisely so no client-supplied parent list is ever
trusted. Ids on `TrashRow` would therefore have no consumer — the UI calls
`restoreWithLinked(tab, id)` and the server resolves the rest — and unread columns on a fifty-row
page query are dead data that the next reader has to reason about. The "one query per page"
property 37-07 protects is untouched: `findTrashedParents` is on the click path, not the render
path, and runs at most twice per user action.

**4. `restoreWithLinked` returns a superset of the specified payload**

The plan specifies `{ success: true, count }`. Implemented as `{ success: true, name, tab, count }`,
matching `restoreRecord`, so the `trash.restoredWithLinked` toast can name the record and link to
the list it went back to rather than reporting a bare number. Additive; no caller exists yet.

---

**Total deviations:** 1 auto-fixed (blocking), 3 adaptations.
**Impact on plan:** None on scope. No package installed, no migration, no index, no new dependency,
and no export beyond the four the plan names plus the `TrashErrorCode` alias the UI needs to switch
on `code` without re-typing the union.

## Issues Encountered

None that reached the implementation. The one thing worth recording is a type-level trap that did
**not** bite: `TrashActionResult<T = Record<string, never>>` intersected with `{ success: true }`
compiles here only because every one of the three actions supplies a real payload type — the default
is documentation, and a future action returning a bare `{ success: true }` should give `T` an
explicit `Record<string, never>` payload rather than relying on the default.

## Known Stubs

None. All three actions call the real dispatch and the real lookups; the linked path was exercised
end-to-end against the live database through `findTrashedParents`.

## Threat Coverage

| Threat | Disposition | Where it lands |
|--------|-------------|----------------|
| T-37-01 (EoP, purge) | mitigate | `session.user.role !== "admin"` inside the action, **before** any lookup. Three tests assert the purge dispatch was never called, including for the record's own owner |
| T-37-02 (info disclosure, restore) | mitigate | Owner-or-admin per record and **independently per parent**; a member's linked restore skips the parent it may not touch and the dispatch is asserted absent for it |
| T-37-03 (tampering, `tab`) | mitigate | Real `parseTrashTab` left unmocked; three hostile-tab tests (`"organizations; drop table deals"`, `"__proto__"`, `"people'; --"`) prove each resolves to `deal` before any dispatch |
| T-37-08 (repudiation, actor) | mitigate | One `runWithActor` scope per operation, opened after the session check; asserted per action with `invocationCallOrder` |
| T-37-15 (tampering, live record) | mitigate | `findTrashedRecord`'s `isNotNull(deletedAt)` here plus the mutation's own predicate — two independent layers, the first tested by the null-lookup case |
| T-37-27 (info disclosure, logging) | mitigate | `[trash-actions]` logs `entityType:id` identifiers and counts only, never record contents |
| T-37-28 (repudiation, partial restore) | mitigate | Skipped and failed parents are excluded from `count`; two tests pin `count: 2` for a three-record attempt |
| T-37-SC (package installs) | accept | Nothing installed |

## Threat Flags

None. No new network endpoint, file access or schema change. The two server actions added are new
POST-able surfaces, which is exactly what the plan's threat register already models as the
`browser → server action` boundary, and every entry against it is mitigated with a test.

## Notes for Later Plans

- **Switch on `code`, never on prose.** The UI maps `NOT_IN_TRASH` → `trash.error.alreadyPurged`
  **plus `router.refresh()`**, `NOT_ADMIN` → `trash.error.purgeNotPermitted`, `NOT_AUTHORIZED` →
  the same or a nearby string, and `FAILED` → `trash.error.restoreFailed`. Nothing else is
  distinguishable, and nothing else should be.
- **`restoreWithLinked` can succeed with a `count` smaller than the badge implied.** A parent owned
  by someone else is skipped silently by design, so the toast must report `count` and not the length
  of the badge's parent list.
- **Do not import `@/lib/trash/dispatch` from a client component.** It pulls `@/db` and `pg`. These
  actions are the boundary; `entity-types.ts` is what a `"use client"` module may import.
- **The REST routes (37-11) need the same matrix, not the same code.** They authenticate by API key,
  so their actor is `api_key`, not `user`, and `session.user.role` does not exist there —
  `resolveActorRole` is the analog. The *predicate* to reproduce is `notOwnerOrAdmin`'s, and the
  admin-before-lookup placement on purge.
- **`findTrashedParents` is the only reader of `TRASH_PARENTS` outside the list joins.** A fifth
  entity type changes it in one place and both paths follow.

## Next Phase Readiness

The trash table component has everything it needs: three actions with a five-code failure vocabulary,
a success payload carrying the record name and destination tab for both restore variants, and
`detached` for the purge toast. Nothing in wave 4 needs to know which parents are trashed in order to
restore them — it passes the row's id and the server does the rest.

## Self-Check: PASSED

Files:
- FOUND: `src/app/trash/actions.ts`
- FOUND: `src/app/trash/actions.test.ts`
- FOUND: `src/lib/trash/queries.ts` (modified)
- FOUND: `src/lib/trash/queries.test.ts` (modified)

Commits:
- FOUND: `f73f861` test(37-10): add failing tests for trashed-parent lookup
- FOUND: `36a9f2a` feat(37-10): add findTrashedParents
- FOUND: `bf46caf` test(37-10): add failing authorization-matrix tests for the trash actions
- FOUND: `41d559f` feat(37-10): add restoreRecord, restoreWithLinked and purgeRecord

Working tree clean; no tracked file was deleted by any of the four commits.

---
*Phase: 37-trash-restore*
*Completed: 2026-08-16*
