---
phase: 35-notes-record-timeline
plan: 09
subsystem: server-actions
tags: [server-actions, authorization, authentication, tdd, vitest, next-auth, revalidation, notes]

# Dependency graph
requires: ["35-04", "35-07", "35-08"]
provides:
  - "`addNote(entityType, entityId, content)` — any authenticated user, author taken from the session"
  - "`editNote(noteId, content)` — author-or-admin, returns the rehydrated timeline entry"
  - "`deleteNote(noteId)` — author-or-admin soft delete"
  - "`loadMoreTimeline(entityType, entityId, cursor)` — opaque-cursor paging over the assembled timeline"
  - "The first `vi.mock(\"@/auth\")` scaffold in the repo, with a per-test swappable session"
affects: [35-11, 35-12, 35-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Session-swapping test scaffold: `@/auth` mocked as a bare `vi.fn()` so each test drives its own session, rather than the auto-approving `withApiAuth` bypass used by the v1 route suites"
    - "The authorization module under test is deliberately NOT mocked, so the matrix proves enforcement instead of proving a stub was called"
    - "One hydration path shared by add and edit, so an optimistically rendered entry cannot drift from what the next timeline read produces"
    - "Missing and soft-deleted rows collapse to one identical refusal string, removing the existence oracle"

key-files:
  created:
    - src/app/notes/actions.ts
    - src/app/notes/actions.test.ts
  modified: []

key-decisions:
  - "The actor's role comes from the signed Auth.js session; `resolveActorRole` is NOT called here — that exists for the API-key surface, whose auth context carries no role"
  - "`addNote` has no `authorId` parameter at all, so forged attribution is a compile error rather than a runtime check"
  - "Both add and edit rehydrate through `notesSource.hydrate`, because on an admin edit the note's author is not the session user"
  - "`revalidatePath` uses the note's OWN entityType/entityId on edit and delete, never a route the caller named"
  - "No REFACTOR commit: the repeated auth guard is kept inline in all four actions so every action visibly carries its own gate"

patterns-established:
  - "A server action module whose only exports are the four actions; the route-segment map and the hydration helper stay private, satisfying the \"use server\" export rule"

requirements-completed: [NOTE-01, NOTE-02]

# Metrics
duration: 16min
completed: 2026-08-15
---

# Phase 35 Plan 09: Note Server Actions Summary

**The browser can now add, edit, delete and page notes through four session-authenticated server actions whose edit/delete gate is the same `isAuthorOrAdmin` the v1 route uses, with the author id taken from the signed session and never from the caller's arguments.**

## Performance

- **Duration:** ~16 min
- **Tasks:** 2 (RED, GREEN)
- **Files created:** 2
- **Tests:** 35 passing (suite total 1016 passed / 4 skipped, plus 8 RSC — no regressions)

## Accomplishments

- Built the whole authentication / attribution / authorization / revalidation / paging matrix as a
  failing suite first, so the browser surface inherited a proven contract rather than acquiring one.
- Established the repo's first `@/auth` mock. Every existing suite that touches auth uses the
  `withApiAuth` auto-approve bypass, which cannot express "the same call, a different session" —
  and that is the only thing this plan's tests are actually about.
- Kept the real `isAuthorOrAdmin` in the loop. The eight-case edit/delete matrix passes against the
  actual predicate from plan 35-07, so this suite proves enforcement rather than proving that a stub
  was invoked.
- Closed forged attribution structurally: `addNote` has no `authorId` parameter, so there is no
  argument for a client to supply. The test asserts `addNote.length === 3` alongside the delegated
  payload, which makes the guarantee a signature property rather than a validation branch.
- Made a missing note and a soft-deleted note indistinguishable to the client, which is what removes
  the existence oracle rather than merely hiding the Postgres text.

## TDD Cycle

### RED — `test(35-09)` (`95b170a`)

`src/app/notes/actions.test.ts` written first. `npx vitest run src/app/notes/actions.test.ts`
exited 1 with `Cannot find module '/src/app/notes/actions'`. RED confirmed on the missing module,
not on a weak assertion.

Coverage written down before any implementation existed:

| Group | Cases |
|-------|-------|
| Authentication | all four actions refuse a null session AND delegate nothing; a session with no `user.id` is refused too. `editNote`/`deleteNote` additionally assert `findNoteById` was never reached — refused *before* any database work |
| Attribution (T-35-28) | `createNoteMutation` receives `authorId` equal to the session id; `addNote.length === 3`; the returned entry's author is the session user |
| Creation permission (D-14) | a plain member adds a note to a record they do not own → success |
| Authorization (T-35-03) | author edits own → allow; admin edits another's → allow; member edits another's → deny + `updateNoteMutation` uncalled; member on a null-author note → deny; admin on a null-author note → allow; the same four for delete; missing note → generic refusal; soft-deleted note → **byte-identical** refusal |
| Revalidation | `/organizations/o1` after add; all four segment mappings via `it.each`; the note's own record after edit and delete; no revalidation when the mutation fails, on either path |
| Paging (T-35-02) | the encoded cursor reaches `assembleTimeline` untouched; the page is returned unchanged; a throwing assembler yields a generic error with no `relation`/`character 42` detail and a logged cause |
| Error containment (T-35-10) | a throwing `createNoteMutation` and a throwing `findNoteById` both produce a generic string, a `console.error`, and no revalidation |

The soft-deleted case asserts `softDeleted.error === missing.error` rather than asserting a
particular string. That is the actual security property: the two must be indistinguishable, and a
future reword of the message cannot silently reintroduce the oracle.

### GREEN — `feat(35-09)` (`b4c59e3`)

`src/app/notes/actions.ts`: 35/35 pass, `npm run typecheck` clean, `npm run lint` 0 errors
(128 pre-existing warnings, none in the new files).

Plan invariant gates, all verified:

| Gate | Result |
|------|--------|
| first line is `"use server"` | pass |
| `isAuthorOrAdmin` imported | pass (import + 2 call sites) |
| zero `db.` references | `0` |
| zero inline `role === 'admin'` (both quote styles) | `0` / `0` |
| exports exactly the four actions | `addNote`, `editNote`, `deleteNote`, `loadMoreTimeline` — all `export async function` |
| `resolveActorRole` not called | the single match is the doc comment explaining why it is not called |

### REFACTOR — none

The four-line auth guard repeats in all four actions and the lookup-then-authorize sequence repeats
in two. Both were left in place deliberately. Extracting the guard would mean a reader has to trust
a helper to know an action is gated, in exactly the code where being able to see the gate matters
most; extracting the authorize sequence into a discriminated-union helper would add a failure mode
(a caller ignoring the discriminant) to buy three lines across two adjacent functions. Duplication
that a grep can audit beats indirection that it cannot. No refactor commit was made.

## Key Decisions

1. **The role comes from the session, not from storage.** Plan 35-07 shipped `resolveActorRole`
   for the API-key surface, whose `ApiAuthContext` is `{ userId, keyId }` with no role. The Auth.js
   session already carries a role that the JWT callback refreshes from the database on every
   request (src/auth.ts:112-134), so a lookup here would be a redundant query returning the value we
   already hold. The file documents this so a future reader does not "fix" the asymmetry.

2. **`addNote` cannot express a forged author.** The alternative — accepting an `authorId` and
   validating it against the session — leaves a parameter that a later refactor could stop
   validating. Removing the parameter removes the class.

3. **Add and edit share one hydration path.** `addNote` could have built its entry from the session
   user (the author is the session user by construction), but `editNote` cannot: an admin editing
   someone else's note has no access to that author's name or email. Rather than run two hydration
   strategies that render the same component, both go through `notesSource.hydrate` — the identical
   read the timeline itself performs. The optimistic entry is therefore guaranteed to match what the
   next timeline page will show. The fallback for a row soft-deleted between the write and the read
   returns a locally-built entry with `author: null` instead of failing a write that succeeded.

4. **Edit and delete revalidate the note's own record.** The path is derived from the note row
   returned by `findNoteById`, never from a caller-supplied entity id — a caller who could name the
   route to revalidate could evict arbitrary pages from the cache.

5. **A non-author's refusal differs from a not-found.** Missing and soft-deleted collapse to one
   string; a permission denial says "Not authorized". A note's existence on a record the caller can
   already read is not the secret — its content and the ability to change it are.

## Cache Invalidation Scope

`revalidatePath` is the ONLY cache invalidation in this phase. Notes emit nothing on the CRM bus:
`note.created` is CONTEXT-locked out by D-15, because a 14th event type would drag in the
trigger-config UI, the workflow matcher, both subscribers' `ALL_EVENTS` arrays and the API docs for
no user-visible gain. Workflows therefore cannot react to a note yet — by design, not by omission.
The mutation layer (35-04) carries the same note at its own boundary.

## Threat Mitigations Implemented

| Threat ID | Mitigation |
|-----------|-----------|
| T-35-03 (IDOR) | `findNoteById` then `isAuthorOrAdmin(note, actor)` before any write; the deny tests assert the mutation was never called AND that nothing was revalidated |
| T-35-09 (drift) | The shared predicate is imported; grep gate confirms zero inline `role === 'admin'` comparisons in either quote style |
| T-35-28 (forged attribution) | No `authorId` parameter exists; `authorId` is `session.user.id` only |
| T-35-10 (info disclosure) | Every action body is wrapped in try/catch: detail to `console.error`, a fixed generic string to the client. Missing and soft-deleted return one identical message |
| T-35-02 (cursor injection) | The cursor is forwarded verbatim to `assembleTimeline`; this module never decodes, parses or trusts it |
| T-35-29 (unbounded content) | Delegated to `createNoteMutation`'s `NOTE_CONTENT_MAX` zod cap |
| T-35-SC (supply chain) | Zero packages installed |

## Deviations from Plan

The plan executed as written. Two additions were required to make the suite runnable, neither
changing the contract:

**1. [Rule 3 - Blocking] Mocked `@/db` in the test file.**
`src/db/index.ts` throws at import time when `DATABASE_URL` is unset, and the suite loads the real
`@/lib/notes/authorize` (which imports `db` for `resolveActorRole`). Without the mock the file
cannot load at all. This does not weaken the plan's "do not mock the authorizer" rule —
`isAuthorOrAdmin` is pure and never touches the stub.
Files: `src/app/notes/actions.test.ts`. Commit: `95b170a`.

**2. [Rule 3 - Blocking] Mocked `@/lib/timeline/sources`.**
Not in the plan's mock list, because the plan left the add-path hydration strategy open ("author
name/email from the session user is acceptable here, or re-read via the notes source's hydrate").
Choosing hydrate (see Key Decision 3) pulls `notesSource` into the module graph, so the suite mocks
it. Files: `src/app/notes/actions.test.ts`. Commit: `95b170a`.

## Deferred Issues

None. The full suite is green in this worktree: **1016 passed / 0 failed / 4 skipped** across 64
files, plus 8 RSC tests across 2 files. The `condition-evaluator` wall-clock test that flaked during
plan 35-07 passed here.

## Notes for Future Plans

- **35-11 / 35-12 (UI)** — `addNote` and `editNote` return a full `NoteTimelineEntry`, already
  hydrated with the author, so a composer can prepend or replace optimistically with no refetch.
  Hiding the edit/delete buttons for non-authors is cosmetic only; the control is this server call.
- **35-13 (load more)** — `loadMoreTimeline` takes the ENCODED `nextCursor` string straight from the
  previous `TimelinePage`. Do not decode it client-side and do not construct one.
- Server actions are a separate surface from `/api/v1` and are **not** bound by the v1 snake_case
  serializer. These return the camelCase `NoteTimelineEntry`/`TimelinePage` types from
  `@/lib/timeline/types`, which is what the React components consume directly.
- The `@/auth` mock scaffold in `actions.test.ts` is the reference shape for any future server-action
  suite that needs to vary the session. The header comment explains why the `withApiAuth` bypass
  idiom does not transfer.
- The route-segment map (`deal → deals`, `organization → organizations`, `person → people`,
  `activity → activities`) is private to this module. If a third surface needs it, promote it rather
  than copying it.

## Commits

- `95b170a` — `test(35-09): add failing tests for the note server actions`
- `b4c59e3` — `feat(35-09): implement the note server actions`

## TDD Gate Compliance

RED (`test(35-09)`, `95b170a`) precedes GREEN (`feat(35-09)`, `b4c59e3`) in git log. RED failed on a
missing module, not on an assertion. No REFACTOR commit — none was warranted (see above). Gate
sequence satisfied.

## Known Stubs

None. Every action is fully wired to the mutation layer and the assembler; no placeholder values,
empty returns or TODO paths were introduced.

## Threat Flags

None. This plan adds no new network endpoint, file access path or schema change. The server-action
surface itself is the trust boundary already enumerated in the plan's threat model.

## Self-Check: PASSED

- `src/app/notes/actions.ts` — FOUND
- `src/app/notes/actions.test.ts` — FOUND (572 lines, min 120)
- `.planning/phases/35-notes-record-timeline/35-09-SUMMARY.md` — FOUND
- Commit `95b170a` — FOUND
- Commit `b4c59e3` — FOUND
