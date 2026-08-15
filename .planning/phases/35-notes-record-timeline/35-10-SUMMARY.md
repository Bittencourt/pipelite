---
phase: 35-notes-record-timeline
plan: 10
subsystem: api
tags: [rest-api, api-v1, notes, authorization, openapi, docs, idor, rfc7807]

# Dependency graph
requires:
  - phase: 35
    plan: 01
    provides: "notes table and the Note type"
  - phase: 35
    plan: 04
    provides: "findNoteById, createNoteMutation, updateNoteMutation, softDeleteNoteMutation, updateNoteSchema, NOTE_CONTENT_MAX"
  - phase: 35
    plan: 07
    provides: "isAuthorOrAdmin + resolveActorRole"
provides:
  - "GET/POST /api/v1/{deals|organizations|people|activities}/{id}/notes — offset/limit paged, parent-validated"
  - "PATCH/DELETE /api/v1/notes/{noteId} — author-or-admin, soft delete only"
  - "serializeNote — the single public note projection, with no deletedAt key in the type or the literal"
  - "SerializedNote type for any future v1 consumer"
  - "Note / NoteCreate / NoteUpdate OpenAPI schemas and five new documented paths"
  - "docs/api/notes.md — the human-facing notes API reference"
affects: [35-11, 35-15]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Nested sub-resource collection route generated from one hand-written template file, so the four entity variants cannot drift in structure"
    - "Authorization preamble extracted into one local helper shared by PATCH and DELETE, returning a discriminated union of (note | response) so the handler cannot forget to return the refusal"
    - "Route tests stub only the DB-touching half of an authorization module (resolveActorRole) and execute the real pure predicate (isAuthorOrAdmin)"
    - "Serialized-shape types omit soft-delete fields at the TYPE level, so re-adding one fails typecheck rather than silently leaking"

key-files:
  created:
    - src/lib/api/serializers/note.ts
    - src/app/api/v1/deals/[id]/notes/route.ts
    - src/app/api/v1/organizations/[id]/notes/route.ts
    - src/app/api/v1/people/[id]/notes/route.ts
    - src/app/api/v1/activities/[id]/notes/route.ts
    - src/app/api/v1/notes/[noteId]/route.ts
    - src/app/api/v1/notes/__tests__/route.test.ts
    - docs/api/notes.md
  modified:
    - public/openapi.yaml
    - docs/api/index.md

key-decisions:
  - "Validation failures return 422 (the repo-wide Problems.validation status), NOT the 400 named in the plan's interfaces block — the plan also mandates Problems.validation by name, and every other v1 endpoint plus docs/api/error-handling.md already document 422"
  - "The POST/PATCH body is parsed with the mutation layer's exported updateNoteSchema, imported under the alias noteBodySchema — no new export was added to the wave-2 mutation module, and the content ceiling still has exactly one definition"
  - "The three sibling collection routes are generated from the deals file by token substitution, then committed as real source — identical structure by construction, not by discipline"
  - "The 403 preamble runs BEFORE the body is read, so an unauthorized caller cannot even trigger JSON parsing work"
  - "SerializedNote omits deletedAt from the interface, not just from the returned object"

patterns-established:
  - "A public serializer for a soft-deleted entity declares its shape as a type without the soft-delete key, making the omission compiler-enforced"

requirements-completed: [NOTE-01]

# Metrics
duration: 13min
completed: 2026-08-15
---

# Phase 35 Plan 10: Notes v1 REST API Summary

**Notes are now a full public sub-resource on all four record types, and the API-key surface enforces the exact same author-or-admin predicate as the browser — with the role re-read from Postgres because `ApiAuthContext` carries none.**

## Performance

- **Duration:** ~13 min (16:12 → 16:25)
- **Tasks:** 3
- **Files created:** 8
- **Files modified:** 2
- **Tests:** 21 new, all passing; full suite 955 passed / 0 failed

## Accomplishments

- Six new route files, **every handler wrapped in `withApiAuth`** — 3 occurrences per collection file (import + GET + POST), 3 in the item file (import + PATCH + DELETE). A missed wrapper would be both unauthenticated and unrated (T-35-08); it is now grep-gated per file.
- `serializeNote` exists exactly once, in `src/lib/api/serializers/note.ts`, and all five route files import it. Its return **type** has no `deletedAt` key, so a future edit that re-adds the field fails `tsc` rather than shipping a soft-delete oracle.
- The item route's authorization preamble is `findNoteById` → `resolveActorRole` → `isAuthorOrAdmin`, in that order, returning `403` before any mutation call. It is proven by tests that assert the mutation mock **was not called**, not merely that the status was 403.
- Every read carries `isNull(notes.deletedAt)` explicitly. `notes_live_idx` encodes the predicate but does not enforce it.
- Both list ordering keys are present: `desc(createdAt), desc(id)`. Without the ID tiebreaker, two notes written in the same millisecond could repeat on one page and vanish from the next under offset paging.
- OpenAPI gained 5 paths (22 → 27) and 3 schemas; the whole document still parses with `js-yaml`, and both branches of the plan's `NOTE_SCHEMA_OK` gate (yaml-load and the indentation-scoped regex fallback) were verified independently.

## Task Commits

1. **Task 1: Nested collection routes + shared serializer** — `216ac45` (feat)
2. **Task 2: Item route with author-or-admin + 21 route tests** — `d5df588` (feat)
3. **Task 3: OpenAPI paths/schemas + docs/api/notes.md** — `17221c7` (docs)

## Verification Performed

| Gate | Result |
|------|--------|
| `npm run typecheck` (after each task) | exit 0 |
| `npm run lint` (after each task) | 0 errors, 128 pre-existing warnings, **0 in any new file** |
| `npx vitest run src/app/api/v1/notes/__tests__/route.test.ts` | 21 passed, 0 failed |
| `npx vitest run` (full node project) | 955 passed, 0 failed |
| `npx vitest run --config vitest.rsc.config.ts` | 8 passed |
| `ALL_COLLECTION_ROUTES_OK` (withApiAuth + `isNull(notes.deletedAt)` per file) | pass — 3 / 1 per file |
| No `2000` literal in any route file | pass — 0 in all four collection routes |
| `SERIALIZER_SINGLE_SOURCE` | pass — 1 |
| `ITEM_ROUTE_AUTHZ_OK` (`resolveActorRole` + `isAuthorOrAdmin`) | pass — 2 / 2 |
| `ITEM_ROUTE_INVARIANTS_OK` (no `db.delete`, no inline role comparison) | pass — 0 / 0 |
| `OPENAPI_PATHS_OK` (five path strings) | pass |
| `NOTE_SCHEMA_OK` (yaml branch) | pass |
| `NOTE_SCHEMA_OK` (regex fallback branch, checked separately) | pass — 42-line block, no `deletedAt`, has `source` |
| `DOCS_LINKED` | pass |
| curl examples in `docs/api/notes.md` | 4 |

The `SERIALIZER_SINGLE_SOURCE` gate initially reported **2** — a doc comment in the serializer
quoted the string `export function serializeNote` while explaining the gate. The comment was
reworded before the commit; the gate is intentionally a dumb substring count and the fix belongs
on the comment, not on the gate.

## Threat Mitigations Implemented

| Threat ID | Mitigation | Evidence |
|-----------|-----------|----------|
| T-35-08 (unwrapped route) | Every handler in all six files goes through `withApiAuth`, inheriting auth and rate limiting | per-file grep gate, 3 occurrences each |
| T-35-03 (IDOR on edit/delete) | `findNoteById` → `resolveActorRole` → `isAuthorOrAdmin` → `Problems.forbidden()` before any write | 4 tests asserting the mutation mock was never called |
| T-35-09 (authz drift) | The shared predicate is imported, never re-implemented; zero inline role comparisons | `ITEM_ROUTE_INVARIANTS_OK`; tests run the REAL `isAuthorOrAdmin` |
| T-35-04 (cross-record injection) | Parent lookup filtered on the parent `deletedAt` before every read and every insert, on top of the mutation layer's own check | route source; both GET and POST |
| T-35-06 (soft-delete leakage) | Every read carries `isNull(notes.deletedAt)`; `SerializedNote` has no `deletedAt` key; the OpenAPI `Note` schema declares none | grep gates + the response-shape test |
| T-35-10 (error/oracle leakage) | try/catch → `console.error` → `Problems.internalError()`; a missing note and a soft-deleted note return the identical 404 | 3 error-containment tests asserting no `relation`/`column`/`pg_`/stack text anywhere in the Problem JSON |
| T-35-25 (fail open on role lookup) | `resolveActorRole` returning null is refused explicitly, before the predicate is even consulted | 2 tests (PATCH and DELETE) |
| T-35-28 (forged attribution) | The POST body schema accepts only `content`; `authorId` is always `context.userId` | route source + the "reads the role from storage" test, which sends `role`/`authorId` in the body and still gets 403 |
| T-35-24 (claimed role) | Role re-read from Postgres via `resolveActorRole`, never taken from the request | same test |
| T-35-SC (npm installs) | Zero packages installed. `js-yaml` was used only via `require.resolve` for the verification gate and was NOT added to `package.json` | `git diff` touches no manifest |

## Deviations from Plan

### 1. [Rule 3 — Blocking inconsistency] Validation Problems are 422, not the 400 named in the plan

- **Found during:** Task 1
- **Issue:** The plan's `<interfaces>` block specifies "400 Problem on validation", but its `<action>` block mandates `Problems.validation(...)` by name as "the deals/[id]/route.ts idiom". `Problems.validation` returns **422** (`src/lib/api/errors.ts:60-68`), as does every other v1 endpoint and `docs/api/error-handling.md`.
- **Decision:** Use the shared helper, and therefore 422. The alternatives were both worse: changing `Problems.validation`'s status would break 22 other documented paths, and hand-rolling a bespoke 400 for notes only would make one endpoint disagree with the entire rest of the API — which is precisely the drift this plan is otherwise designed to prevent.
- **Consequence:** The plan's test list names "400"; the corresponding tests assert 422 and are named for the behaviour ("rejects invalid JSON with a validation Problem") rather than the number. OpenAPI and `docs/api/notes.md` document 422 throughout.
- **Files:** all six route files, the test suite, `public/openapi.yaml`, `docs/api/notes.md`
- **Commits:** `216ac45`, `d5df588`, `17221c7`

### 2. [Discretion] The body schema is the mutation layer's `updateNoteSchema`, aliased

- **Found during:** Task 1
- **Issue:** The plan says to reuse "the content rule exported by `@/lib/mutations/notes`". The rule itself (`noteContent`) is module-private; only `createNoteSchema` and `updateNoteSchema` are exported, and `createNoteSchema` also demands `entityType`/`entityId`/`authorId`, which must NOT come from a request body.
- **Fix:** Import `updateNoteSchema as noteBodySchema` — it is exactly `{ content: noteContent }` and is the correct body shape for both POST and PATCH. `src/lib/mutations/notes.ts` (a wave-2 file outside this plan's `files_modified`) was left untouched.
- **Files:** all five body-parsing route files.

### 3. [Discretion] Serialized field names are camelCase

The plan's `<interfaces>` block asks for camelCase (`entityType`, `authorId`, `createdAt`) and describes it as "matching the existing v1 serializers" — but `src/lib/api/serialize.ts` is snake_case throughout. The explicit field list won over the parenthetical, because Task 3's OpenAPI instructions name the same camelCase keys and the two would otherwise contradict each other. **Notes are therefore the only camelCase resource on the v1 surface.** Flagged for the phase verifier: if consistency with the other 22 paths is preferred, it is a single-file change in `serializers/note.ts` plus the OpenAPI `Note` schema, and the response-shape test pins it.

No Rule 1, 2 or 4 deviations. No architectural decisions were needed.

## Deferred Issues

None. No auto-fix attempts were spent on out-of-scope failures; the phase-34 `condition-evaluator`
timing test that has been intermittently failing in sibling worktrees passed cleanly here
(955/955).

## Known Stubs

None. Every endpoint is wired to the real mutation layer and the real authorization predicate.

## Threat Flags

None beyond the register above. This plan adds five new network paths, all of which were already
enumerated in the plan's `<threat_model>` and are covered by rows T-35-08 / T-35-03 / T-35-04.

## Notes for Future Plans

- **35-11 (UI)** — the API's paging is offset/limit and is deliberately NOT the timeline's keyset cursor. Do not consolidate them; external clients are built against `{ data, meta: { total, offset, limit } }`.
- **35-15 (browser verification)** — the note object returned by this API is camelCase; the deviation above explains why, and it is the one open consistency question in this plan.
- `SerializedNote` is exported from `src/lib/api/serializers/note.ts` and can be imported by any future client or SDK generator.
- Nothing in this plan emits on the CRM bus, matching D-15 and the mutation layer's bus-silence guarantee.

## User Setup Required

None. No environment variables, no migrations, no packages.

## Self-Check: PASSED

- `src/lib/api/serializers/note.ts` — FOUND
- `src/app/api/v1/deals/[id]/notes/route.ts` — FOUND
- `src/app/api/v1/organizations/[id]/notes/route.ts` — FOUND
- `src/app/api/v1/people/[id]/notes/route.ts` — FOUND
- `src/app/api/v1/activities/[id]/notes/route.ts` — FOUND
- `src/app/api/v1/notes/[noteId]/route.ts` — FOUND
- `src/app/api/v1/notes/__tests__/route.test.ts` — FOUND
- `docs/api/notes.md` — FOUND
- Commit `216ac45` — FOUND
- Commit `d5df588` — FOUND
- Commit `17221c7` — FOUND

---
*Phase: 35-notes-record-timeline*
*Completed: 2026-08-15*
