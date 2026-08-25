---
phase: 36-audit-log
plan: 05
subsystem: api
tags: [audit, actor-context, asynclocalstorage, api-auth, workflow-engine, tdd, vitest]

# Dependency graph
requires:
  - phase: 36-audit-log
    plan: 01
    provides: "runWithActor / getCurrentActor and the AuditActor contract this plan establishes at two boundaries"
provides:
  - "src/lib/api/auth.ts — one runWithActor wrap covering every /api/v1 route, present and future"
  - "src/lib/execution/engine.ts — the workflow_run actor scope around the whole run graph"
  - "src/lib/api/auth.test.ts — the repo's first suite of withApiAuth itself, not of a stub of it"
  - "The reject-path control: an unauthenticated or rate-limited request establishes no actor at all"
affects: [36-11, 36-06, 36-12, audit-subscriber, api-v1-routes, execution-engine]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Actor established at the trust boundary, never at the mutation: two edits cover every /api/v1 route and every CRM action in every run"
    - "The wrap sits after the reject paths, so skipping the wrapper loses authentication, rate limiting and attribution together"
    - "Nested AsyncLocalStorage stores: actor inside recursion depth, both readable throughout the body"

key-files:
  created:
    - src/lib/api/auth.test.ts
  modified:
    - src/lib/api/auth.ts
    - src/lib/execution/engine.ts
    - src/lib/execution/engine.test.ts

key-decisions:
  - "The api_key actor is built solely from validateApiKey's return value — no header, query param or body field reaches runWithActor (T-36-01)"
  - "The workflow_run actor carries workflow.createdBy, never the triggering user — an automated write is a fact about the automation"
  - "Actor nested INSIDE runWithExecutionDepth so the existing recursion comment stays attached to the construct it describes"
  - "The two grep gates expecting runWithActor == 1 were reinterpreted as one call site; an import line makes the literal count 2 and the gate as written is unsatisfiable"

requirements-completed: [AUDIT-02]

# Metrics
duration: 20min
completed: 2026-08-15
---

# Phase 36 Plan 05: The api_key and workflow_run Actor Boundaries Summary

**Two one-call edits establish every non-user actor in the system: `withApiAuth` now runs every `/api/v1` handler inside an `api_key` scope built only from the validated key, and `executeRun` runs the whole graph inside a `workflow_run` scope carrying the run id and the workflow's author — with the wraps positioned after the reject paths so an unauthenticated, invalid-key or rate-limited request is attributable to nobody.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-16T02:33Z
- **Completed:** 2026-08-16T02:53Z
- **Tasks:** 3 (RED, GREEN, and a combined engine task)
- **Files modified:** 1 created, 3 modified

## Accomplishments

- `src/lib/api/auth.test.ts` is the first test in this repo of `withApiAuth` itself. Every other suite replaces the wrapper with a stub, because they are about what a route does *after* authentication; this one could not, so it composes three partial precedents instead of copying one file.
- Nine cases, all green: five on the actor scope (established, survives awaits, no run/session identity, built only from the validated key, cleared on exit) and four on the reject paths (no header, wrong scheme, invalid key, rate limited).
- One `runWithActor(` call in `auth.ts` covers every `/api/v1` route present and future. All 73 existing v1 route tests still pass — none needed a change, which is the point of capturing at the boundary.
- One `runWithActor(` call in `engine.ts` covers every CRM action in every workflow run, including the three `runWithExecutionDepth(depth + 1, …)` calls in `actions/crm.ts`, which inherit the scope by nesting. `crm.ts` is grep-verified to contain zero wraps of its own.
- Five actor cases added to `engine.test.ts`, all selectable with `-t "actor"`, and all proven non-vacuous (see Verification Results).
- Full suite: **1169 passed, 0 failed.** `tsc --noEmit` exit 0.

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): the first `withApiAuth` suite** — `178844b` (test)
2. **Task 2 (GREEN): the `api_key` wrap** — `372b423` (feat)
3. **Task 3: the `workflow_run` wrap + engine actor cases** — `8744076` (feat)

No REFACTOR commit: both production edits are a single call each, with nothing to extract.

## Files Created/Modified

- **`src/lib/api/auth.test.ts` (new, 214 lines)** — nine `it` blocks in two `describe` groups. Mocks only `@/lib/api-keys` and `./rate-limit`; `./errors` and the actor `AsyncLocalStorage` are real, so the asserted status codes and the observed actor are the production ones.
- **`src/lib/api/auth.ts`** — `runWithActor({ kind: "api_key", userId: result.userId }, () => handler(request, result)) as Promise<NextResponse>`, replacing the bare `return handler(request, result)`. A comment records why the position after both rejects is load-bearing and why the two grep gates are deliberately not spelled in prose.
- **`src/lib/execution/engine.ts`** — `runWithActor` nested inside the existing `runWithExecutionDepth`, carrying `{ kind: "workflow_run", userId: workflow.createdBy, workflowRunId: runId }`. Both values were already in scope from the `:103` destructure, so no extra query.
- **`src/lib/execution/engine.test.ts`** — a new `describe("executeRun actor scope")` with five cases plus two widened helper signatures (`createdBy` on the workflow, `depth` on the run).

## Decisions Made

- **The actor is observed from inside `executeAction`, not from a spy on the wrapper.** Asserting that the engine calls a function would prove nothing about whether a mutation several awaits deep still sees the actor, and that mutation is the only consumer that matters. Since `./actions` is already stubbed in this suite, `mockImplementationOnce` puts the observation point at exactly the boundary the real `crm.ts` handlers sit behind — and the stub awaits a timer first, so a scope that failed to survive the engine's own awaits would be caught.

- **Actor nested inside depth, not the other way round.** Both orders work (the RESEARCH probe proved it), but this order makes the diff one added call and keeps the existing `MAX_RECURSION_DEPTH` comment attached to the construct it describes. A test asserts the depth still reads back as `run.depth ?? 0` from inside the actor scope, so the nesting cannot silently cost the recursion guard.

- **The "no run identity" test asserts the kind as well.** `expect(observed?.workflowRunId).toBeUndefined()` passes vacuously when `observed` is `undefined` — that is, when there is no actor at all, which is the state the test is supposed to distinguish from. Adding `expect(observed?.kind).toBe("api_key")` turned a vacuous pass into a fourth RED failure. This is the same non-vacuity discipline `rsc-boundary.test.tsx` applies with its `expect(definers.length).toBeGreaterThan(0)`.

- **The comments avoid spelling the grep tokens.** T-36-01's control is "`workflowRunId` appears zero times in `auth.ts`", and the first draft's comment saying *"no `workflowRunId` is set here"* defeated it — the gate was tripped by the very prose asserting compliance. Both comments were reworded to describe the fields without naming them, and to say out loud that they do so deliberately. Phase 35 hit this three times and 36-01 hit it once; this is the fifth occurrence.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Two acceptance gates expecting `runWithActor` to appear exactly once are unsatisfiable as written**

- **Found during:** Task 2, and again in Task 3
- **Issue:** The gates `grep -c "runWithActor" src/lib/api/auth.ts` → `1` and `grep -c "runWithActor" src/lib/execution/engine.ts` → `1` cannot both hold and let the file compile: `grep -c` counts matching *lines*, and using the symbol requires an `import` line that also matches. The minimum achievable count is 2.
- **Fix:** Interpreted the gates by their evident intent — *exactly one wrap* — and verified `grep -c "runWithActor(" ` returns `1` in each file, with the total line count being `2` (one import, one call). No second wrap exists anywhere.
- **Files modified:** none beyond the planned edits
- **Verification:** `runWithActor(` = 1 in `auth.ts`, 1 in `engine.ts`, 0 in `crm.ts`
- **Committed in:** `372b423` and `8744076`

**2. [Rule 3 - Blocking] Comments defeated their own grep gates**

- **Found during:** Task 2
- **Issue:** The first draft of the `auth.ts` comment contained the literals `workflowRunId` and `runWithActor`, pushing `grep -c "workflowRunId"` from the required `0` to `1` and inflating the wrap count to 3.
- **Fix:** Reworded to "no run identity is set here" and "the helper's `T | Promise<T>` return type", with an explicit note that the omission is deliberate because a control its own prose can satisfy proves nothing. The `engine.ts` comment was written the same way from the start, so its `workflowRunId` count is exactly the required `1` (the code).
- **Files modified:** `src/lib/api/auth.ts`
- **Verification:** `grep -c "workflowRunId" src/lib/api/auth.ts` → `0`; `src/lib/execution/engine.ts` → `1`
- **Committed in:** `372b423`

**3. [Scope boundary] A pre-existing flaky timing test was logged, not fixed**

- **Found during:** Task 3 verification
- **Issue:** `condition-evaluator.test.ts:616` failed once under full-suite parallel load (`expected 11.57 to be less than 10`). It compares a wall-clock ratio against a fixed threshold.
- **Action:** Logged to `.planning/phases/36-audit-log/deferred-items.md`. Not fixed — the file is untouched by this plan and the failure is unrelated to the actor context. Verified pre-existing behaviour by re-running it 3× in isolation (all pass) and in the full suite (passes).

---

**Total deviations:** 2 auto-fixed (both blocking, both gate-mechanics rather than behaviour), 1 out-of-scope item deferred.
**Impact on plan:** None on behaviour or contract. Both fixes were comment rewords plus a gate reinterpretation; the three planned edits landed exactly as specified.

## Issues Encountered

- The worktree started at commit `cbf3229`, behind the assigned base `1e4f2ed`. Reset to the assigned base per the branch-check protocol before any work; the working tree was clean, so nothing was lost. (Same as 36-01.)
- The worktree had no `node_modules`; symlinked it from the main checkout to run vitest, tsc and eslint. The symlink is untracked and gitignored.

## Verification Results

| Gate | Result |
|------|--------|
| `npx vitest run src/lib/api/auth.test.ts` (RED, pre-wrap) | exit 1 — **4 failed**, 5 passed; all four failures on actor assertions |
| `npx vitest run src/lib/api/auth.test.ts` (GREEN) | **9 passed, 0 failed** |
| `npx vitest run src/app/api/v1` | **73 passed, 0 failed** — no regression across every existing v1 route suite |
| `npx vitest run src/lib/execution` | **211 passed, 0 failed** |
| `npx vitest run src/lib/execution/engine.test.ts -t "actor"` | **5 selected, 5 passed** (plan required ≥ 3) |
| Engine actor cases with the wrap temporarily removed | **4 of 5 failed** — non-vacuity proven, wrap restored |
| `grep -c 'it(' src/lib/api/auth.test.ts` | `9` (plan required ≥ 7) |
| `grep -c 'vi.mock("@/lib/audit/actor-context"' src/lib/api/auth.test.ts` | `0` |
| `grep -c "getCurrentActor" src/lib/api/auth.test.ts` | `11` (plan required ≥ 4) |
| `grep -c "runWithActor(" src/lib/api/auth.ts` | `1` |
| `grep -c 'kind: "api_key"' src/lib/api/auth.ts` | `1` |
| `grep -c "workflowRunId" src/lib/api/auth.ts` | `0` |
| `grep -c "runWithActor(" src/lib/execution/engine.ts` | `1` |
| `grep -c 'kind: "workflow_run"' src/lib/execution/engine.ts` | `1` |
| `grep -c "workflowRunId" src/lib/execution/engine.ts` | `1` |
| `grep -c "runWithActor" src/lib/execution/actions/crm.ts` | `0` |
| `npm run typecheck` | exit 0 |
| `npx eslint` on the four files | 0 errors; 3 warnings, all pre-existing unused test helpers (`chainSelect`/`chainInsert`/`chainUpdate`) |
| `npx vitest run` (full suite) | **1169 passed, 0 failed** |

## Success Criteria

| Criterion | Status |
|-----------|--------|
| One `runWithActor` in `auth.ts`, one in `engine.ts`, zero in `crm.ts` | Met — one call site each, zero in `crm.ts` |
| Reject paths (no header, bad key, rate limited) establish no actor | Met — four cases, each asserting 401/429, handler not called, and no actor in scope |
| The workflow actor carries the run id and the workflow's author, never the triggering user | Met — asserted explicitly against a `triggerData` carrying a different `userId` |

## Known Stubs

None. Both wraps are complete and every branch of both is exercised by a passing test.

## Threat Flags

None — this plan opens no new network, file or database surface. It adds one function call at each of two existing trust boundaries.

The four `mitigate` dispositions in the plan's threat register are implemented and verified:

| Threat | Control | Evidence |
|--------|---------|----------|
| T-36-01 (spoofing the API actor) | Actor built only from `validateApiKey`'s return | The "builds the actor only from the validated key" case sends `userId`/`workflowRunId` query params and `X-User-Id`/`X-Actor-Kind` headers all claiming another identity; the observed actor is unaffected. `workflowRunId` grep-count in `auth.ts` is `0`. |
| T-36-10 (a route skipping `withApiAuth`) | Wrap after both rejects, coupling the three failures | Four reject-path cases assert no actor alongside the status code. |
| T-36-13 (forged run id) | Written only from the executor's own `runId` | `crm.ts` grep-verified to contain no wrap; the engine test asserts the id equals the run being executed. |
| T-36-SC (package installs) | Accept — zero packages added | `package.json` untouched. |

## Next Phase Readiness

- Three of the five `AuditActorKind` values now have a producer: `api_key` and `workflow_run` here, `user` still to come from 36-06's server-action boundary and `import` from 36-12.
- **Carried to 36-11:** the subscriber's `undefined → "system"` mapping is now the only thing standing between an unattributed write and a plausible-looking audit row. Every `/api/v1` request and every workflow run reaches it with an actor; anything else genuinely has none.
- **Carried to any future `/api/v1` route:** no per-route work is required for attribution. A route that goes through `withApiAuth` is audited; one that does not is unauthenticated and unrate-limited as well, which is the intended coupling.
- No blockers.

## TDD Gate Compliance

Both mandatory gates are present in git log, in order:

1. **RED** — `178844b` `test(36-05): add first withApiAuth suite asserting the api_key actor scope`, verified failing (4 of 9) before the wrap existed.
2. **GREEN** — `372b423` `feat(36-05): establish the api_key actor at the withApiAuth boundary`, all nine passing.

No test passed unexpectedly during RED. Five of the nine cases did pass pre-implementation, which the plan anticipated and named as expected: the reject-path and post-exit cases assert the *absence* of an actor, and absence is trivially true before the wrap exists. The four cases asserting an actor's *presence* all failed, which is the property under test.

Task 3 is marked `tdd="true"` but its `<action>` specifies the wrap and the tests in one commit, so it produced no separate RED commit. To keep the gate honest rather than nominal, the wrap was temporarily removed after the fact and the actor cases re-run: **4 of the 5 failed**, confirming they detect the absence of the wrap rather than passing vacuously. The fifth is the post-exit case, which asserts absence and therefore cannot fail that way by construction.

## Self-Check: PASSED

- `src/lib/api/auth.test.ts` — FOUND
- `src/lib/api/auth.ts` — FOUND
- `src/lib/execution/engine.ts` — FOUND
- `src/lib/execution/engine.test.ts` — FOUND
- `.planning/phases/36-audit-log/deferred-items.md` — FOUND
- Commit `178844b` — FOUND
- Commit `372b423` — FOUND
- Commit `8744076` — FOUND

---
*Phase: 36-audit-log*
*Completed: 2026-08-15*
