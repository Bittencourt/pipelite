---
phase: 36-audit-log
plan: 01
subsystem: infra
tags: [asynclocalstorage, async_hooks, audit, actor-context, tdd, vitest]

# Dependency graph
requires:
  - phase: 26-workflow-execution
    provides: "The AsyncLocalStorage precedent (src/lib/execution/recursion.ts) whose shape and T | Promise<T> signature this module mirrors"
provides:
  - "src/lib/audit/actor-context.ts — runWithActor / getCurrentActor over a module-scope AsyncLocalStorage"
  - "AuditActor / AuditActorKind — the actor contract 36-05, 36-06, 36-11 and 36-12 compile against"
  - "The absence contract: no actor in scope reads as undefined, never a fabricated system actor"
affects: [36-05, 36-06, 36-11, 36-12, 36-20, audit-subscriber, api-auth-boundary, execution-engine, importers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dependency-free ALS context module: imports only node:async_hooks so the four entry boundaries stay light"
    - "Absence is not a default: the out-of-scope read returns undefined and the mapping to system lives at one asserted call site"

key-files:
  created:
    - src/lib/audit/actor-context.ts
    - src/lib/audit/actor-context.test.ts
  modified: []

key-decisions:
  - "getCurrentActor returns AuditActor | undefined with no ?? \"system\" default — absence must stay distinguishable from a real system-kind actor"
  - "importSessionId added to AuditActor alongside workflowRunId, matching the CONTEXT addendum that audits imports as one summary row per session"
  - "The 'nothing is mocked' comment avoids spelling the literal grep token, so the gate cannot be satisfied by its own comment"

patterns-established:
  - "Pattern 1: ALS behaviour is tested against the real AsyncLocalStorage under vitest, never a fake — matching recursion.test.ts"
  - "Pattern 2: the concurrency case starts both scopes without awaiting and asserts ordering, proving continuations genuinely interleaved"

requirements-completed: [AUDIT-02]

# Metrics
duration: 6min
completed: 2026-08-16
---

# Phase 36 Plan 01: The AsyncLocalStorage Actor Context Summary

**A dependency-free AsyncLocalStorage actor context (`runWithActor` / `getCurrentActor`) that carries `{kind, userId, workflowRunId, importSessionId}` from an entry boundary to the audit subscriber across awaits, returning `undefined` — never a guessed identity — outside any boundary.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-08-16T02:14Z
- **Completed:** 2026-08-16T02:20Z
- **Tasks:** 2 (RED + GREEN)
- **Files modified:** 2 created, 0 modified

## Accomplishments

- `src/lib/audit/actor-context.ts` exports the four names four downstream plans already reference, with no dependency beyond `node:async_hooks`.
- Six ALS behaviour cases pass against the **real** `AsyncLocalStorage` under vitest: scope read, survival across two awaits, nesting with outer restoration, absence, post-exit reset, and concurrency.
- The concurrency case — the one with no repo analog — proves two simultaneously-open scopes on interleaving timers each read back only their own actor, matching the RESEARCH probe's `concurrent-A` / `concurrent-B` result of zero cross-contamination.
- The T-36-02 repudiation control is implemented as designed: absence yields `undefined`, so an unattributed write cannot silently borrow a plausible identity.

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): actor-context.test.ts against the absent module** — `7b60cc2` (test)
2. **Task 2 (GREEN): the db-free actor context** — `b8b83f9` (feat)

No REFACTOR commit: the implementation is 58 lines with no duplication to extract, so a third gate would have been an empty commit.

## Files Created/Modified

- `src/lib/audit/actor-context.ts` — `AuditActorKind`, `AuditActor`, `getCurrentActor`, `runWithActor` over a module-scope `AsyncLocalStorage<AuditActor>`. Doc comments carry the two security rationales (never infer `userId` from a payload; never default absence to `system`).
- `src/lib/audit/actor-context.test.ts` — six `it` blocks, nothing mocked, one name containing `concurrent` so `-t "concurrent"` selects it.

## Decisions Made

- **`importSessionId` is on `AuditActor`.** The `<interfaces>` block in the plan lists it and the CONTEXT addendum audits imports as one summary row per session, so the `import` kind needs a session identity exactly as `workflow_run` needs a run identity. Both are optional and nullable.
- **No `?? "system"` at this layer**, per the plan's explicit divergence from the `recursion.ts` analog. `recursion.ts` defaults to `0` because zero is a real depth; here the two states must not collapse, since `system` is itself a legitimate `AuditActorKind`. The mapping is 36-11's single asserted line.
- **The absence test asserts more than `toBeUndefined()`.** It also asserts the value does not equal `{kind: "system", userId: null}`, so the test fails loudly if a future change makes absence return a plausible default object rather than nothing.
- **The concurrency test asserts observation order**, not just membership. Checking only that both userIds appear would pass even if the two bodies ran strictly sequentially; asserting that the shorter-timer scope (`concurrent-B`) is observed first proves the continuations actually interleaved, which is the property under test.

## Deviations from Plan

**1. [Rule 3 - Blocking] Reworded the test file's header comment so it does not contain the literal `vi.mock`**

- **Found during:** Task 1 (RED)
- **Issue:** The comment explaining *why* nothing is mocked contained the literal string `vi.mock`, so the acceptance gate `grep -c "vi.mock" …` returned `1` instead of `0` — the gate was tripped by the very comment asserting compliance. This is precisely the self-invalidating-gate trap the plan's Task 2 warns about after Phase 35 hit it three times.
- **Fix:** Rewrote the comment to say "nothing is mocked" and to note that it deliberately avoids spelling the token, since a gate its own comment can defeat proves nothing.
- **Files modified:** `src/lib/audit/actor-context.test.ts`
- **Verification:** `grep -c "vi.mock"` now returns `0`; the file still contains no mocking of any kind.
- **Committed in:** `7b60cc2` (folded into the Task 1 commit, before RED was committed)

---

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** Cosmetic — a comment reword, no behaviour or contract change. No scope creep.

## Issues Encountered

- The worktree started at commit `cbf3229`, behind the assigned base `c55205f`. Reset to the assigned base per the branch-check protocol before any work; the working tree was clean, so nothing was lost.
- The worktree had no `node_modules`; symlinked it from the main checkout to run vitest, tsc and eslint. The symlink is untracked and gitignored.

## Verification Results

| Gate | Result |
|------|--------|
| `npx vitest run src/lib/audit/actor-context.test.ts` (RED, pre-implementation) | exit 1 — `Cannot find module './actor-context'` |
| `npx vitest run src/lib/audit/actor-context.test.ts` (GREEN) | **6 passed, 0 failed** |
| `npx vitest run … -t "concurrent"` | 1 passed — the concurrency case is selectable |
| `grep -c "vi.mock" …test.ts` | `0` |
| `grep -vE '^\s*(\*\|//\|/\*)' …ts \| grep -cE '"@/db"\|from "@/db'` | `0` — no database import |
| `grep -c "node:async_hooks" …ts` | `1` |
| `npm run typecheck` | exit 0 |
| `npm run lint` | 0 errors, 125 warnings — all pre-existing, none in the two new files |

## Known Stubs

None. Both files are complete: the module exports its full contract and every exported name is exercised by a passing test.

## Threat Flags

None. This module opens no network, file or database surface — it imports only `node:async_hooks`. The two threats it carries (T-36-01 spoofing, T-36-02 repudiation) are dispositioned `mitigate` in the plan and both mitigations are implemented: `AuditActor` has no field a request body maps onto, and `getCurrentActor` returns `undefined` rather than a fabricated default.

## Next Phase Readiness

- The contract is frozen and importable. 36-05, 36-06, 36-11 and 36-12 can compile against `runWithActor`, `getCurrentActor`, `AuditActor` and `AuditActorKind` as written.
- **Carried to 36-11:** the `undefined → "system"` mapping is deliberately NOT here. It must be one explicit line in the subscriber, asserted there, and must never fall back to `payload.userId`.
- **Carried to the boundary plans:** `runWithActor` returns `T | Promise<T>`, so the `/api/v1` wrapper edit at `src/lib/api/auth.ts:52` needs the `as Promise<NextResponse>` cast the RESEARCH diff shows.
- No blockers.

## TDD Gate Compliance

Both mandatory gates are present in git log, in order:

1. **RED** — `7b60cc2` `test(36-01): add failing actor-context ALS cases`, verified failing with a module-resolution error before any implementation existed.
2. **GREEN** — `b8b83f9` `feat(36-01): add AsyncLocalStorage audit actor context`, all six cases passing.

No test passed unexpectedly during RED — the failure was the expected `Cannot find module './actor-context'`, not a spuriously-satisfied assertion. REFACTOR was intentionally skipped as there was nothing to clean up.

## Self-Check: PASSED

- `src/lib/audit/actor-context.ts` — FOUND
- `src/lib/audit/actor-context.test.ts` — FOUND
- Commit `7b60cc2` — FOUND
- Commit `b8b83f9` — FOUND

---
*Phase: 36-audit-log*
*Completed: 2026-08-16*
