---
phase: 41-workflow-operator-affordances
plan: 06
subsystem: api
tags: [workflows, execution-engine, dry-run, crm-mutations, webhook-response, tdd]

# Dependency graph
requires:
  - phase: 41-01
    provides: "ExecutionContext._dryRun (src/lib/execution/types.ts:100) and the workflow_runs.dry_run column"
provides:
  - "Three dry-run gates in crm_action, one per mutations.* call, each placed after all resolution"
  - "A dry-run gate on sendWebhookResponse in webhook_response"
  - "Simulated outputs that carry the same KEYS as their real counterparts plus `simulated: true`"
  - "The zero-audit-row property a dry run's changed-records panel depends on: no mutation call means no crmBus event means no audit_log row"
  - "A computed key-set parity idiom (expectSimulatedKeyParity) for the remaining handler gates"
affects: [41-05, 41-07, 41-09, 41-12, 41-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gate immediately before the side effect, never above the resolution"
    - "Key-set parity asserted by computing both sets from the real output, never by listing keys twice"
    - "Anti-vacuity: assert a gate against a REGISTERED resource, not against an incidental miss"

key-files:
  created: []
  modified:
    - src/lib/execution/actions/crm.ts
    - src/lib/execution/actions/webhook-response.ts
    - src/lib/execution/actions/__tests__/crm.test.ts
    - src/lib/execution/actions/__tests__/webhook-response.test.ts

key-decisions:
  - "Three separate gates in crm_action rather than one early return, so interpolateDeep, coerceFieldMapping and resolveTargetId's ilike lookup all still run and a dry run still throws for the real reason"
  - "Simulated create id is `dryrun-${crypto.randomUUID()}`, matching the repo's id-generation convention"
  - "Simulated deal update supplies newAssigneeUserIds: [] and dealTitle from interpolatedFields.title ?? '' — shape fidelity, so a downstream transform reads a string rather than undefined"
  - "Value fidelity is documented as unachievable in a code comment on gate 1 and deliberately NOT surfaced as user-facing copy (UI-SPEC F-41-1)"
  - "The webhook-response gate was added even though the handler was already incidentally safe, and is asserted against a registered pending entry — the RED run proved the pre-gate handler resolved a live request"

patterns-established:
  - "Dry-run gate placement: after every resolution step, immediately before the side-effecting call, with a rules comment on the first gate of a group"
  - "expectSimulatedKeyParity(realOutput, dryOutput): realKeys must not contain `simulated`; dryKeys must equal realKeys ∪ {simulated}"
  - "Anti-vacuity for a gate whose absence is masked by incidental safety: construct the condition the incidental safety does not cover"

requirements-completed: [WFOPS-02]

# Metrics
duration: 17min
completed: 2026-08-23
---

# Phase 41 Plan 06: CRM and webhook-response dry-run gates Summary

**The two heaviest side-effecting handlers now simulate under `_dryRun` — all three `mutations.*` calls and `sendWebhookResponse` are skipped, while interpolation, coercion and the `ilike` target lookup still run for real, so a dry run still fails for the reasons a real run would.**

## Performance

- **Duration:** ~17 min
- **Started:** 2026-08-22T23:45:39Z
- **Completed:** 2026-08-23T00:03:00Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 4

## Accomplishments

- **Three gates in `crm.ts`**, at lines 329 / 349 / 368, each immediately before its `runWithExecutionDepth(depth + 1, () => mutations.*)` call and — for update and delete — *after* `resolveTargetId`. Verified structurally: `interpolateDeep` is at line 300 and both `resolveTargetId` calls at 346 and 365, so no gate sits above a resolution step.
- **One gate in `webhook-response.ts`**, after `normalizeBody` and `interpolateDeep`, before `sendWebhookResponse`.
- **The `runWithExecutionDepth` wrapper is not entered for a skipped mutation**, asserted directly (T-41-32). Bumping the ambient depth without mutating could spuriously trip the recursion guard for a sibling node.
- **Key-set parity is computed, not listed.** `expectSimulatedKeyParity` derives the expected simulated key set from the real output's own keys, so a real output that grows a key fails the simulated one until it grows the same key.
- **The anti-vacuity assertion earned its place.** Of the 7 new webhook-response tests, only 2 were RED — confirming that 5 of them pass on the pre-existing *incidental* map miss and would have passed with no gate at all. The registered-pending-entry case failed with `expected true to be false`, i.e. the pre-gate handler really did resolve a live waiting HTTP request from a dry run (T-41-33).

## Task Commits

1. **Task 1: The crm_action dry-run gate on all three mutations** — `024b4c5` (feat)
2. **Task 2: The webhook_response dry-run gate** — `31ef3c9` (feat)

**Plan metadata:** this SUMMARY (docs)

_TDD note: each task's RED run was recorded before its implementation edit; test and implementation landed in one commit per task since the tests extend existing files rather than creating new ones._

## TDD RED counts (actual)

| Task | File | RED result | GREEN result |
|------|------|-----------|--------------|
| 1 | `__tests__/crm.test.ts` | **35 tests: 24 passed, 11 failed** | 35/35 passed |
| 2 | `__tests__/webhook-response.test.ts` | **18 tests: 16 passed, 2 failed** | 18/18 (111/111 across `actions/`) |

The 11 RED failures in task 1 were the mutation-call-count-zero assertions (all three operations), the interpolated-entity-object assertion, all four key-set parity assertions, the `runWithExecutionDepth`-not-entered assertion, and the collective zero-call assertion. The 4 validation-still-throws cases and the 3 real-run regression cases were green from the start, as expected — they assert unchanged behaviour.

The 2 RED failures in task 2 were the registered-pending-entry case and the key-set parity case. **The other 5 were green before the gate existed**, which is precisely the vacuity the plan predicted; the registered-entry case is what distinguishes a gate from the incidental map miss, and its failure message says so.

## Exact simulated output shapes

| Call site | Real output | Simulated output |
|---|---|---|
| `create` (any entity) | `{ success: true, id, <entity> }` | `{ success: true, id: "dryrun-<uuid>", <entity>: { id, ...interpolatedFields }, simulated: true }` |
| `update`, `entity === "deal"` | `{ success: true, newAssigneeUserIds: string[], dealTitle: string }` | `{ success: true, newAssigneeUserIds: [], dealTitle: interpolatedFields.title ?? "", simulated: true }` |
| `update`, other entities | `{ success: true }` | `{ success: true, simulated: true }` |
| `delete` (any entity) | `{ success: true }` | `{ success: true, simulated: true }` |
| `webhook_response` | `{ sent, statusCode, body }` | `{ sent: false, statusCode, body: interpolatedBody, simulated: true }` |

`dealTitle` is coerced with `title == null ? "" : String(title)` so the simulated field is a `string`, matching the real mutation's return type rather than merely being present.

## What still runs under `_dryRun` (asserted, not assumed)

**`crm_action`:**
- `Unknown CRM entity type` throws for a bad entity
- `No userId in execution context` throws when `_workflowUserId` is absent
- `interpolateDeep` — the simulated entity object carries `title: "New Deal"`, not `"{{trigger.data.title}}"`
- `coerceFieldMapping` — `value: "9999"` appears as the number `9999`
- `resolveTargetId` — the `ilike` mock is asserted called with the **interpolated** lookup value (`ilike("people.email", "john@example.com")`), and `db…limit()` is asserted invoked
- **a target that resolves to nothing still THROWS** (`/no person found/i`), and the missing-`targetId`-and-`lookupField` config error still throws

**`webhook_response`:**
- `normalizeBody` — an unparseable string body and a numeric body both still normalise to `{}`
- `interpolateDeep` — the output body carries `{ message: "Hi Test" }`
- `statusCode` still defaults to `200`

## Value-fidelity limitation — where it is documented

Recorded as **rule 2 in the code comment on gate 1 of `crm.ts`** (and nowhere else):

> SHAPE fidelity is achievable, VALUE fidelity is not. A transform reading a field the node never wrote still gets `undefined`, and `simulated: true` is what makes that diagnosable in `json-viewer.tsx`.

**Confirmed NOT surfaced as user-facing copy.** No locale key was added or modified by this plan — the total `REQUIRED_WORKFLOWS_KEYS` contract from 41-03 is untouched, and no `.tsx` file was modified. UI-SPEC F-41-1 respected.

## Second-order properties preserved

- **No `crmBus` event → no `audit_log` row.** The gate skips the mutation *call*, not the mutation's effects, so `instrumentation.ts`'s workflow-trigger subscriber never fires, a dry run cannot start a downstream workflow (T-41-30), and no audit row is written (T-41-31). This is what makes `run-changed-records.tsx` render its existing empty state — criterion 2's affirmative proof. Documented as rule 3 on gate 1, explicitly flagged as the thing a rolled-back-transaction rewrite would destroy.
- **Nothing in this plan writes an `audit_log` row.** `no-mutation-coupling.test.ts` still passes.
- **`pendingResponses`, `waitForWebhookResponse` and `sendWebhookResponse` are byte-for-byte unmodified.** The diff for `webhook-response.ts` is the gate plus its comment, inside the handler only.

## Files Created/Modified

- `src/lib/execution/actions/crm.ts` — three dry-run gates; new `simulateCreate` / `simulateUpdate` / `simulateDelete` helpers above the handler; the three-rule comment on gate 1
- `src/lib/execution/actions/webhook-response.ts` — one dry-run gate with the RESEARCH Q3 incidental-safety rationale and the replay consequence
- `src/lib/execution/actions/__tests__/crm.test.ts` — +18 tests under a `dry run` describe (create / update / delete sub-groups, a collective zero-call anti-vacuity case, three real-run regression cases)
- `src/lib/execution/actions/__tests__/webhook-response.test.ts` — +7 tests under a `webhook_response dry run` describe, including the registered-pending-entry case

## Scope discipline

`email.ts`, `notification.ts` and `http.ts` were **not touched** — plan 41-07 gates those in parallel. Verified: `grep -c "_dryRun"` returns 0 matches across all three. `git status` at each commit showed only this plan's two source files and two test files.

## Decisions Made

- **`dealTitle` uses `String(title)` rather than a bare `?? ""`.** A non-string interpolated title would otherwise make the simulated field a different *type* from the real one, which defeats the point of shape fidelity for a downstream `javascript_transform`.
- **Gate 2 and gate 3 carry a one-line pointer (`Rules at gate 1`) rather than repeating the rules.** Three copies of a 20-line comment invites one of them drifting.
- **Simulation helpers live above the handler, not inline.** Inline object literals in three `case` arms would make the shapes hard to compare against the real ones, which is the property most likely to rot.

## Deviations from Plan

None — plan executed exactly as written.

The plan's `<interfaces>` section matched the source at every line it cited, including `crm.ts:230-296`, `webhook-response.ts:106-126`, and the real-vs-simulated output table. `updateDealMutation`'s return type was independently re-verified at `src/lib/mutations/deals.ts:274` (`{ success: true; newAssigneeUserIds: string[]; dealTitle: string }`) before the simulated shape was written.

## Issues Encountered

**The worktree branched from a stale base — five for five.** `HEAD` was at `aa01de2` (an ancestor of the required base), so wave 1's schema work and `ExecutionContext._dryRun` were absent. Corrected with the sanctioned `git reset --hard c747ed3` from the startup check, verified clean, before any file was read. The handoff's warning was accurate and remains worth repeating to later waves.

No other issues. No package was installed (T-41-SC clean), no migration generated or applied, no Docker restart.

## Verification

| Gate | Result |
|------|--------|
| `npx vitest run src/lib/execution/actions/` | **111 passed / 0 failed** |
| `npx vitest run` (full unit suite) | **4036 passed / 32 skipped** (baseline 4011 + exactly the 25 new tests; skipped unchanged) |
| `npx vitest run --config vitest.rsc.config.ts` | **8 passed / 0 failed** |
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **0 errors, 125 warnings** (≤127 baseline; both warnings in the touched files — `mockSelect`, `_runId` — are pre-existing) |
| Gate placement scan | 3 `context._dryRun` gates in `crm.ts` (329, 349, 368), all after `interpolateDeep` (300) and after `resolveTargetId` (346, 365); 1 in `webhook-response.ts` |
| Registered-pending-entry assertion present | Yes — `webhook-response.test.ts`, "leaves a REGISTERED pending response untouched" |
| New `audit_log` write | None |

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **For 41-05 (engine wiring):** the four gated call sites read `context._dryRun` only; nothing reads the persisted `workflow_runs.context` blob, so the "authoritative from the column only" invariant in `types.ts` is intact.
- **For 41-07 (the other three handlers):** reuse the `expectSimulatedKeyParity` idiom and the registered-resource anti-vacuity pattern. Note especially that a gate whose absence is masked by incidental safety needs a test that constructs the condition the incidental safety does not cover — this plan's RED run proved five such assertions were vacuous.
- **For 41-12/41-verification:** the zero-`audit_log`-row proof is structural now, resting on the mutation call being skipped. Any future rewrite toward a rolled-back transaction would silently destroy it; the reason is recorded as rule 3 on gate 1 of `crm.ts`.
- **Blocker for none.** STATE.md and ROADMAP.md deliberately untouched — the orchestrator owns those writes.

---
*Phase: 41-workflow-operator-affordances*
*Completed: 2026-08-23*
