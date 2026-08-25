---
phase: 48-rest-api-authorization
plan: 05
subsystem: api-authorization
tags: [security, ast-gate, anti-vacuity, tdd, BOLA, OWASP-API1]
requires: []
provides:
  - "src/app/api/v1/__tests__/route-authorization.test.ts — exported scanSource + walkRouteFiles"
  - "the detector plan 48-08 turns into an enforcing gate"
affects:
  - "48-08 (adds exemption lists, the offender assertion and the falsification controls)"
tech-stack:
  added: []
  patterns:
    - "AST presence gate over a route corpus, standalone (no shared CORPUS)"
    - "matcher self-tested against KNOWN_POSITIVE/KNOWN_NEGATIVE fixtures BEFORE the corpus is touched"
    - "KNOWN_NEGATIVE parse floor — toEqual([]) is satisfied by a parse that returned nothing"
    - "WR-11 token floors — the detector's own search terms must still be FOUND in the corpus"
key-files:
  created:
    - "src/app/api/v1/__tests__/route-authorization.test.ts"
  modified: []
decisions:
  - "Binding form detected as a first-class handler shape (resolution 1 of the two PATTERNS offered), not path-carved-out"
  - "getWorkflowTemplate excluded from AUTHORIZERS — 0 calls receive an identity argument, so it would be a dead entry that 48-08's reach control fails on"
  - "The pre-fix offender list is LOGGED, not asserted — four sibling plans are fixing these routes in the same wave"
  - "Exactly one self-collision mitigation: the entry.name === route.ts predicate, asserted rather than assumed"
metrics:
  duration: "~35 min"
  completed: 2026-08-25
  tasks: 3
  tests-added: 30
requirements: [SEC-01, SEC-02]
---

# Phase 48 Plan 05: The /api/v1 Route-Authorization Detector — Summary

A TypeScript AST detector that classifies all 70 exported verb handlers under `src/app/api/v1`
as authorizing or not, fixture-tested against 13 synthetic shapes before it was ever pointed at
the real tree — the first mechanism in this repository capable of noticing that an ownership
check was deleted from a REST route.

## What was built

`src/app/api/v1/__tests__/route-authorization.test.ts` (1086 lines, base vitest project, 30 tests).

- **`scanSource(fileName, sourceText)`** — exported, takes a source STRING so the fixtures reach
  exactly the same code path as the real files. Returns `handlers` (each with `verb`, `line`,
  `form`, `delegatedTo`, `authorized`, `withApiAuthSeen`), `offenders` as formatted
  `file:line: VERB does not constrain the record by caller identity` strings, and `counters`
  (`declarationHandlers`, `bindingHandlers`, `withApiAuthCalls`, `identityHits.ctx`,
  `identityHits.context`, `ownerLikeAccesses`, `nodesSeen`).
- **`walkRouteFiles(relativeDir)`** — exported `readdirSync` recursion, predicate
  `entry.name === "route.ts"`.
- **Four rules**, each doc-commented with the real route file and line range whose shape it
  accepts: R1 `where`-scoped `eq`/`ne` (`organizations/[id]/route.ts:31-36`), R2 fetch-then-compare
  (`pipelines/[id]/route.ts:56-58`), R3 authorizer delegation (`stages/[id]/route.ts:93`), R4
  create-time ownership assignment (`organizations/batch/route.ts:58`).
- **Both handler forms.** Declaration form and binding form
  (`export const { GET, POST } = noteCollectionHandlers(...)`).

## Task 1 — the stub transcript, verbatim

`scanSource` was first written as a deliberate stub: it called `ts.createSourceFile` and returned
zero handlers, zero offenders and zero counters. The run:

```
 × MUST flag: 'P1 GET fetches on and(eq(id), isNull(…'   → expected [] to deeply equal [ 'GET:1' ]
 × MUST flag: 'P2 PUT reads ctx.userId only into an …'   → expected [] to deeply equal [ 'PUT:1' ]
 × MUST flag: 'P3 list GET builds a conditions array…'   → expected [] to deeply equal [ 'GET:1' ]
 × MUST flag: 'P4 the only ownerId occurrence is ins…'   → expected [] to deeply equal [ 'DELETE:1' ]
 × MUST flag: 'P5 the only ownerId occurrence is ins…'   → expected [] to deeply equal [ 'GET:1' ]
 × MUST flag: 'P6 DELETE with no withApiAuth call at…'   → expected [] to deeply equal [ 'DELETE:1' ]
 ✓ MUST NOT flag: 'N1 fetch-then-compare, row.ownerId !=…'
 ✓ MUST NOT flag: 'N2 where-scoped, and(eq(t.id, id), eq…'
 ✓ MUST NOT flag: 'N3 helper delegation, verifyStageOwne…'
 ✓ MUST NOT flag: 'N4 helper delegation with the other s…'
 ✓ MUST NOT flag: 'N5 create handler assigning ownerId: …'
 ✓ MUST NOT flag: 'N6 the N1 handler written with contex…'
 ✓ MUST NOT flag: 'N7 binding-form export delegating to …'
 × still parses a handler in the negative fixture: 'N1 …'
   → the parse saw no exported handler in: N1 fetch-then-compare, row.ownerId !== ctx.userId then
     403: expected 0 to be greater than 0
 × still parses a handler in the negative fixture: 'N2 …'  (same shape)
 × still parses a handler in the negative fixture: 'N3 …'  (same shape)
 × still parses a handler in the negative fixture: 'N4 …'  (same shape)
 × still parses a handler in the negative fixture: 'N5 …'  (same shape)
 × still parses a handler in the negative fixture: 'N6 …'  (same shape)
 × still parses a handler in the negative fixture: 'N7 …'  (same shape)

 Test Files  1 failed (1)
      Tests  13 failed | 7 passed (20)
```

Exit code 1.

**The observation this task exists to produce: every KNOWN_NEGATIVE `toEqual([])` self-test PASSED
against a detector that detects nothing.** All seven of them. That is the concrete, in-repo
demonstration of why the parse floor is mandatory — `toEqual([])` is satisfied by a parse that
failed outright and returned nothing, so a matcher that matches nothing passes every negative
fixture and the whole sweep becomes unfalsifiable. The seven parse floors are what tell "saw the
handler, did not flag it" apart from "saw nothing at all", and they were the only thing red on the
negative side.

## Task 2 — GREEN

All 22 self-tests pass. Two additions beyond the plan's minimum, both anti-vacuity (Rule 2):

- an `it` asserting N7 is reported as `["binding GET", "binding POST"]` with
  `declarationHandlers === 0` and `delegatedTo === "noteCollectionHandlers"` — the
  `FunctionDeclaration`-only blind spot, closed and asserted;
- an `it` probing each of R1-R4 individually against its accepting and its rejecting expression, so
  a single over-broad rule that happened to match everything cannot satisfy the seven negatives.
  Notably `eq(activities.ownerId, ownerId)` — the `?owner_id=` caller-supplied FILTER at
  `activities/route.ts` — is asserted NOT to match R1. A caller-supplied filter is not an
  authorization check.

## Task 3 — the pre-fix offender list, verbatim

```
[48-05] 17 unauthorized /api/v1 handlers, pre-fix, no exemptions:
  src/app/api/v1/activities/[id]/route.ts:76: GET does not constrain the record by caller identity
  src/app/api/v1/activities/[id]/route.ts:136: PUT does not constrain the record by caller identity
  src/app/api/v1/activities/[id]/route.ts:266: DELETE does not constrain the record by caller identity
  src/app/api/v1/activities/route.ts:41: GET does not constrain the record by caller identity
  src/app/api/v1/activities/route.ts:131: POST does not constrain the record by caller identity
  src/app/api/v1/custom-field-definitions/[id]/route.ts:25: GET does not constrain the record by caller identity
  src/app/api/v1/custom-field-definitions/[id]/route.ts:42: PUT does not constrain the record by caller identity
  src/app/api/v1/custom-field-definitions/[id]/route.ts:97: DELETE does not constrain the record by caller identity
  src/app/api/v1/custom-field-definitions/route.ts:24: GET does not constrain the record by caller identity
  src/app/api/v1/custom-field-definitions/route.ts:62: POST does not constrain the record by caller identity
  src/app/api/v1/docs/route.ts:14: GET does not constrain the record by caller identity
  src/app/api/v1/workflow-templates/[id]/route.ts:15: GET does not constrain the record by caller identity
  src/app/api/v1/workflow-templates/[id]/route.ts:26: DELETE does not constrain the record by caller identity
  src/app/api/v1/workflow-templates/route.ts:13: GET does not constrain the record by caller identity
  src/app/api/v1/workflow-templates/route.ts:22: POST does not constrain the record by caller identity
  src/app/api/v1/workflows/[id]/runs/[runId]/route.ts:14: GET does not constrain the record by caller identity
  src/app/api/v1/workflows/[id]/runs/route.ts:23: GET does not constrain the record by caller identity
[48-05] corpus: 36 route files, 62 declaration-form + 8 binding-form handlers, 61 withApiAuth calls,
        55 context.userId + 22 ctx.userId, 123 owner-like accesses
```

**This is the direct answer to SEC-48-B.** 17 entries, exactly the set the planner prototyped, and
it names the five in-scope handlers the plan required: `activities/[id]/route.ts` at all three
verbs, `activities/route.ts` at GET and POST.

## Every planner measurement reproduced independently

| Quantity | Planner measured | This run | Floor | Cross-check |
|---|---|---|---|---|
| `route.ts` files under `/api/v1` | 36 | **36** | `MIN_ROUTE_FILES = 30` | `node -e` walk agrees: 36 |
| declaration-form handlers | 62 | **62** | `MIN_HANDLERS_PARSED = 55` | — |
| binding-form handlers | 8, in 4 files | **8** | `MIN_BINDING_HANDLERS = 4` | — |
| `withApiAuth(...)` calls | 61 | **61** | `MIN_WITH_API_AUTH_CALLS = 50` | 62 handlers − `docs` GET |
| `context.userId` | 55 | **55** | `≥ 40` | — |
| `ctx.userId` | 22 | **22** | `≥ 15` | — |
| owner-like property accesses | 123 | **123** | `≥ 90` | — |

`MIN_BINDING_HANDLERS` sits at HALF its measurement, unlike the other four, and its doc-comment
says why: the failure it defends against is a walker reporting **zero**, and consolidating two of
the four note routes is an ordinary refactor that must not false-RED.

The route-file count was recomputed with `node -e` (36) and agrees with the number the gate
reports. `grep … | wc -l` was not used — it returns 19 for this corpus in this environment.

## Measured runtime (recorded, never asserted)

`typescript` first import 522.9 ms per worker, directory walk 1.3 ms, corpus parse 161.7 ms over
23,215 AST nodes. Observed file duration: **1.18 s** total including vitest transform and import.
These numbers live in doc-comments only — `suite-timing-hygiene.test.ts` forbids an `expect()` over
a clock-derived delta or ratio.

## The presence-gate limitation, written into the header

The header states plainly that this gate proves an ownership check **exists**, not that it is
**correct**, and names the measured counter-example:

> `src/app/api/v1/stages/[id]/route.ts` GET satisfies rule R2 and this gate reports it as
> authorizing — while it IS the SEC-02 defect. `withOptions` is `undefined` unless the request
> passes `?expand=pipeline`, so `stage.pipeline` is normally never loaded and the LEGITIMATE OWNER
> receives a 403. The comparison is real; the value it compares is decided by the caller.

Verify-work must not read a green run here as covering SEC-02. Behavioural tests own that
(plans 48-03, 48-06).

## What this plan deliberately does NOT contain — plan 48-08 owns it

- **The corpus offender assertion.** `expect(CORPUS_OFFENDERS).toEqual([])` would be red today.
  Wave 1 LOGS the list; the temporary `it` asserts **only** `MIN_ROUTE_FILES`. Its doc-comment says
  in capitals that it is not a gate and that **plan 48-08 deletes it** and replaces it with the
  array-form assertion. A log line is not a gate, and asserting the pre-fix set would go red the
  moment the four sibling plans in this wave merge.
- **The exemption lists** (`custom-field-definitions/**`, `workflow-templates/**`, `docs/route.ts`,
  `audit`/`trash`, the four note routes, and the ACCEPTED-KNOWN `workflows/[id]/runs` pair) and
  their live controls.
- **The falsification controls** (controls A/B/C in `48-VALIDATION.md`), including the Q9 ablation
  replay on `organizations/[id]/route.ts`. No route file was modified by this plan — four sibling
  executors are editing that surface in this same wave.
- **The `AUTHORIZERS` reach control.** `getWorkflowTemplate` is deliberately absent from the set
  (measured 0 calls receiving an identity argument), so that control will not fail on a dead entry
  when 48-08 adds it. `ownedStagesPredicate` IS in the set, at 0 calls today, becoming 2 once plan
  48-04 lands — recorded in the doc-comment.

## Self-collision

Asserted, not assumed, and with exactly ONE mitigation: the corpus predicate is
`entry.name === "route.ts"` and this file is not one. `expect(ROUTE_FILES).not.toContain(GATE_PATH)`
plus `expect(ROUTE_FILES.some(f => f.includes("__tests__"))).toBe(false)`. No second mitigation was
added and this file is named in no exclusion list — two mitigations would be one fewer than one,
because neither ends up provable.

## Verification

| Check | Result |
|---|---|
| `./node_modules/.bin/vitest run src/app/api/v1/__tests__/route-authorization.test.ts` | **30 passed** |
| `./node_modules/.bin/vitest run` (base project) | **173 files passed / 2 skipped; 5267 passed / 32 skipped** |
| base-project delta vs re-measured baseline | 172→173 files, 5237→5267 tests = **+30, exactly this file**; 32 skipped unchanged; zero regressions |
| RSC project | **8/8 passed** |
| `./node_modules/.bin/tsc --noEmit` | **exit 0** |
| `npm run lint` | **0 errors**, 122 warnings (this file contributes 0) |
| `git diff --exit-code` | **exit 0** |
| files changed vs base `ae514ed` | **exactly 1** — `src/app/api/v1/__tests__/route-authorization.test.ts`. No route file touched. |

## Deviations from Plan

### Auto-added anti-vacuity controls

**1. [Rule 2 - Missing critical functionality] Per-rule discrimination probe**
- **Found during:** Task 2
- **Issue:** The seven KNOWN_NEGATIVE fixtures collectively prove "not flagged", but a single
  over-broad rule that fired on every handler would satisfy all seven identically. Nothing asserted
  WHICH rule fired.
- **Fix:** Added `distinguishes the four rules by which one fires, not just by the verdict` — eight
  assertions, each pairing an expression R*n* must accept with one it must reject. Includes the
  `eq(activities.ownerId, ownerId)` caller-supplied-filter case.
- **Files modified:** `src/app/api/v1/__tests__/route-authorization.test.ts`
- **Commit:** `7cacfc8`

**2. [Rule 2 - Missing critical functionality] Per-file zero-handler assertion**
- **Found during:** Task 3
- **Issue:** The plan asked for parse integrity "for every file known to export at least one
  handler", which as written needs a hand-maintained name list that goes stale. A generic form is
  strictly stronger here.
- **Fix:** Asserted the list of enumerated files parsing to zero AST nodes is empty AND the list
  parsing to zero exported handlers is empty, both in array form with prescriptive messages.
  Measured: both are empty across all 36 files, so the assertion is live rather than vacuous.
- **Files modified:** `src/app/api/v1/__tests__/route-authorization.test.ts`
- **Commit:** `8fa0aba`

No route file was modified, no exemption list was added, and no corpus offender assertion was
added — all three are out of this plan's scope by construction.

## Threat Flags

None. This plan added one test file and no production surface.

## Self-Check: PASSED

- `src/app/api/v1/__tests__/route-authorization.test.ts` — FOUND (1086 lines, min_lines 400)
- `.planning/phases/48-rest-api-authorization/48-05-SUMMARY.md` — FOUND
- Commit `94f3b47` — FOUND
- Commit `7cacfc8` — FOUND
- Commit `8fa0aba` — FOUND
- `scanSource` exported — FOUND; `walkRouteFiles` exported — FOUND
- `ts.createSourceFile` — FOUND (5 occurrences); `toBeGreaterThan(0)` — FOUND (2)
- Header contains `5237` and `32 skipped` and names `stages/[id]/route.ts` — FOUND
- `getWorkflowTemplate` appears once, in the doc-comment stating it is excluded — FOUND
