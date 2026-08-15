---
phase: 35-notes-record-timeline
plan: 04
subsystem: data-access
tags: [notes, mutations, zod, tdd, soft-delete, polymorphic, drizzle]

# Dependency graph
requires:
  - phase: 35
    plan: 01
    provides: "notes table (polymorphic entityType/entityId, soft delete, source discriminator) and the Note type"
provides:
  - "createNoteMutation — validates, checks the parent record exists and is live, inserts with source 'user'"
  - "updateNoteMutation — content + updatedAt only, never createdAt"
  - "softDeleteNoteMutation — sets deletedAt/updatedAt via db.update, never a SQL DELETE"
  - "findNoteById — the single live-note read, carrying isNull(notes.deletedAt) explicitly"
  - "createNoteSchema / updateNoteSchema / NOTE_CONTENT_MAX = 200000 / CreateNoteInput"
  - "The parent-existence check that substitutes for the foreign key notes.entityId cannot have"
affects: [35-07 authorize helper, 35-09 server actions, 35-10 v1 route, 35-15 browser verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Polymorphic parent-existence check: a PARENT_TABLES map for the column handles plus a switch for the db.query dispatch, so each findFirst stays bound to its own relational query builder"
    - "Content ceiling exported as a named constant (NOTE_CONTENT_MAX) and consumed by the test rather than re-typed, so the test file contains no magic cap literal to drift from"

key-files:
  created:
    - src/lib/mutations/notes.ts
    - src/lib/mutations/notes.test.ts
  modified: []

key-decisions:
  - "NOTE_CONTENT_MAX = 200000, not the 2000 used by every neighbouring mutation: the live database holds a 131,505-character activity note that plan 35-03 migrates in, and a 2,000 cap would make it permanently uneditable"
  - "The test file imports NOTE_CONTENT_MAX instead of hard-coding 200000 — that keeps the acceptance grep (zero occurrences of '2000' in the test) honest and makes the cap a single source of truth"
  - "Parent lookup dispatched with a switch rather than an indexed db.query[key] handle: detaching findFirst from its RelationalQueryBuilder would lose its `this` binding in production even though the vi.fn mock would not notice"
  - "findNoteById swallows a read failure into null and logs it, so the two callers (edit, delete) return a clean not-found instead of leaking a Postgres error"
  - "updateNoteMutation writes exactly two keys — asserted by an exact Object.keys equality, not just a missing-createdAt check — so a future edit cannot quietly add a third"
  - "@/lib/events is deliberately NOT mocked in the test; the bus-silence test spies on the real singleton, which is what makes it a real proof rather than a mock artefact"

patterns-established:
  - "Bus-silence assertion: spy the real crmBus.emit across create/update/delete and assert zero calls, for any module that must stay off the event bus"
  - "Builder-chain fake that accepts either a result array or an Error, so the happy path and the throw path share one stub helper"

requirements-completed: [NOTE-01]

# Metrics
duration: 12min
completed: 2026-08-15
---

# Phase 35 Plan 04: Note Mutations Summary

**The note persistence layer — create, edit, soft-delete and fetch-by-id — with a 200,000-character ceiling that keeps the live 131,505-character note editable and the parent-existence check that stands in for the foreign key a polymorphic `entityId` cannot have.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-15T18:57Z (approx)
- **Completed:** 2026-08-15T19:09Z
- **Tasks:** 2 (RED, GREEN)
- **Files created:** 2

## Accomplishments

- `src/lib/mutations/notes.test.ts` — 25 tests across 8 describes, written and committed **before** any implementation existed. The RED run failed with `Cannot find module '/src/lib/mutations/notes'`, which is the correct RED: a missing module, not a broken test file.
- `src/lib/mutations/notes.ts` — all seven exports from the plan's `<interfaces>` block, implemented to the contract the tests had already pinned. The suite went green on the first run against the implementation.
- The content ceiling is `NOTE_CONTENT_MAX = 200000`. A 131,505-character note round-trips; `NOTE_CONTENT_MAX + 1` is refused before `db.insert` is ever reached.
- Content is `z.string().trim().min(1).max(NOTE_CONTENT_MAX)`: `"  line one\n\nline two  "` stores as `"line one\n\nline two"`. Surrounding whitespace is stripped, internal line breaks survive.
- The parent-existence check dispatches on `entityType` to one of four tables and filters `and(eq(table.id, entityId), isNull(table.deletedAt))`. A dangling *or* soft-deleted parent both surface as `undefined` and both block the insert.
- `updateNoteMutation` writes exactly `{ content, updatedAt }` — asserted by an exact `Object.keys` equality, so the `updatedAt > createdAt` "edited" marker stays meaningful.
- `softDeleteNoteMutation` goes through `db.update`; the mock exposes a `delete` handle purely so a test can prove it is never called.
- Zero CRM bus emissions, proved by spying the real `crmBus.emit` (not a mock) across all three mutations.

## Task Commits

1. **Task 1: RED — the note mutation test suite** — `33c4b60` (test)
2. **Task 2: GREEN — the note mutation layer** — `3ef58fe` (feat)

No REFACTOR commit: the only duplication that emerged (two parallel maps for the parent table and the parent query handle) was collapsed into a single map plus a switch before the first green run, inside the GREEN task.

## TDD Gate Compliance

| Gate | Commit | Evidence |
|------|--------|----------|
| RED | `33c4b60` | `npx vitest run src/lib/mutations/notes.test.ts` exited 1 with `Cannot find module '/src/lib/mutations/notes'` |
| GREEN | `3ef58fe` | Same command: 25 passed, 0 failed |
| REFACTOR | — | Not needed; no duplication survived into the green state |

Sequence verified in `git log`: the `test(35-04):` commit precedes the `feat(35-04):` commit.

## Files Created/Modified

- `src/lib/mutations/notes.ts` — `NOTE_CONTENT_MAX`, `createNoteSchema`, `updateNoteSchema`, `CreateNoteInput`, `findNoteById`, `createNoteMutation`, `updateNoteMutation`, `softDeleteNoteMutation`, plus the private `PARENT_TABLES` map and `parentExists` dispatch.
- `src/lib/mutations/notes.test.ts` — 25 tests. Mirrors `organizations.test.ts`'s `vi.mock("@/db", …)` scaffold, extended with `findFirst` handles for `notes` and all four parent tables and a `delete: vi.fn()` handle that exists only to be proven unused.

## Decisions Made

Every non-negotiable rule in the plan was followed as written. The decisions left to execution discretion:

1. **Switch instead of an indexed `db.query` handle.** The plan asked for "a `db.query[...]` dispatch". A literal indexed dispatch requires extracting `findFirst` from its `RelationalQueryBuilder`, which detaches the method from its receiver. The `vi.fn()` mock would never notice — it is a free function — but production would break on the first note. The switch keeps every call attached to its own builder while `PARENT_TABLES` still supplies the columns for the shared `where` clause. `findFirst` still appears in the file, satisfying the plan's `key_links` pattern.
2. **`findNoteById` catches its own read failure** and returns `null` after logging. The plan required try/catch in every exported function; for a read whose only two callers turn `null` into a clean not-found, returning `null` is the behaviour that keeps a Postgres error away from the caller (T-35-10).
3. **`source: 'user'` written explicitly** rather than relying on the column default. The plan permitted either. Explicit is what makes the `source` discriminator legible at the one call site that writes user notes, leaving `'migration'` exclusively to plan 35-03's SQL.
4. **The bus-silence test spies the real singleton.** `@/lib/events` is side-effect free (it registers no subscribers), so importing it in a test is safe, and a spy on the real `crmBus.emit` is a stronger proof of D-15 than an assertion against a mock this module never imports.

## Deviations from Plan

None — plan executed exactly as written. No auto-fix rules fired.

## Verification Performed

| Check | Result |
|-------|--------|
| `npx vitest run src/lib/mutations/notes.test.ts` (RED, before implementation) | exit 1, `Cannot find module '/src/lib/mutations/notes'` |
| `npx vitest run src/lib/mutations/notes.test.ts` (GREEN) | 25 passed, 0 failed |
| `npx vitest run … -t "long note"` | 2 passed |
| `npx vitest run … -t "dangling"` | 4 passed |
| `npx vitest run … -t "edited"` | 4 passed |
| `npx vitest run … -t "soft delete"` | 2 passed |
| `npm run typecheck` | exit 0 |
| `npm run lint` | 0 errors (128 pre-existing warnings, none in either new file) |
| `npx vitest run` (node project) | 898 passed, 4 skipped, 1 pre-existing flaky failure (see Issues) |
| `npx vitest run --config vitest.rsc.config.ts` (react-server project) | 8 passed |

Grep invariants on `src/lib/mutations/notes.ts`, all zero: `max(2000`, `2000,`, `crmBus`, `@/lib/events`, `db.delete`, `session`, `role`. `NOTE_CONTENT_MAX = 200000` present on line 19.

Grep invariants on `src/lib/mutations/notes.test.ts`: zero occurrences of `2000`; four occurrences of `131505`.

## Issues Encountered

`src/lib/execution/condition-evaluator.test.ts > "scales linearly, not quadratically, with path length"` failed once during the full-suite run with `expected 10.163760504845142 to be less than 10`. It is a wall-clock ratio benchmark from phase 34 (T-34-20) that passed on an immediate isolated re-run (70/70) and touches nothing this plan changed. Pre-existing timing jitter, out of scope, left alone.

## Known Stubs

None.

## Threat Flags

None — this plan adds no network endpoint, auth path or file access surface. The four threats in its register are all mitigated in the implementation and asserted by tests:

| Threat | Mitigation | Asserted by |
|--------|-----------|-------------|
| T-35-04 | `z.enum` on the four literals + mandatory parent lookup filtered on `isNull(deletedAt)` | `-t "dangling"` (4 tests) and `"rejects an entityType outside the four literals"` |
| T-35-06 | `findNoteById` carries `isNull(notes.deletedAt)`; edit and delete both route through it | `"returns null for a missing or soft-deleted note"`, `"returns not-found for an edit of a soft-deleted or missing note"` |
| T-35-07 | `NOTE_CONTENT_MAX = 200000` | `"refuses a long note above NOTE_CONTENT_MAX"` |
| T-35-10 | try/catch everywhere, detail to `console.error`, generic string out | `"returns a generic error and logs the detail when the insert throws"` (+2 more) |
| T-35-18 | Zero `session`/`role` occurrences; authorization stays in the action/route tier | grep gate above |

## User Setup Required

None.

## Next Phase Readiness

- Plan 35-07 can build `isAuthorOrAdmin` on top of `findNoteById`, which already returns `null` for a soft-deleted note — the helper does not need its own deleted-at predicate.
- Plans 35-09 (server actions) and 35-10 (v1 route) can consume all four functions directly; both must call the 35-07 authorize helper themselves, because this module deliberately does not.
- `NOTE_CONTENT_MAX` is exported and should be the client-side character counter's bound too (35-11/35-12), so the UI limit cannot drift from the server's.

## Self-Check: PASSED

- `src/lib/mutations/notes.ts` — FOUND
- `src/lib/mutations/notes.test.ts` — FOUND
- Commit `33c4b60` — FOUND
- Commit `3ef58fe` — FOUND

---
*Phase: 35-notes-record-timeline*
*Completed: 2026-08-15*
