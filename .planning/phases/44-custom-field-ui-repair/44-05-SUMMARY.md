---
phase: 44-custom-field-ui-repair
plan: 05
subsystem: ui
tags: [react, radix-ui, rsc, custom-fields, vitest, dev-tooling]

# Dependency graph
requires:
  - phase: 44-custom-field-ui-repair
    provides: "44-RESEARCH R9 (executable proof that Radix asChild renders '' for a Flight-deferred child) and D-44-03 (dev-only guard, never a production throw)"
provides:
  - "warnIfInvalidTriggerChild — a pure, exported, dev-only guard that turns Radix SlotClone's silent null into a named console.error"
  - "FieldDialog wiring: the guard runs on every render, the DialogTrigger JSX is unchanged"
  - "A render-path lock test that fails if anyone introduces a conditional asChild or a fallback trigger (RESEARCH Pitfall 2)"
affects: [44-06 structural AddFieldButton repair, any future Radix asChild consumer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dev-only diagnostic guard as a separate pure module, unit-tested in isolation rather than buried in a component"
    - "Source-text assertions as a render-path lock against masking fixes"

key-files:
  created:
    - "src/app/admin/fields/[entityType]/trigger-child-guard.ts"
    - "src/app/admin/fields/[entityType]/__tests__/trigger-child-guard.test.ts"
  modified:
    - "src/app/admin/fields/[entityType]/field-dialog.tsx"

key-decisions:
  - "Guard is dev-only (process.env.NODE_ENV !== 'production') per D-44-03 — a production throw would turn a degraded page into a hard crash"
  - "The guard's return value is deliberately ignored at the call site; it is an alarm, not a fix"
  - "The log never serializes children or prop values (T-44-18) — asserted by a test, not just documented"

patterns-established:
  - "Alarm-not-fallback: diagnostics for silent-null render paths must not also repair the render, or the boundary contract stays broken for the next consumer"
  - "Anti-regression source lock: when the correct code is the absence of something, assert the absence in a test"

requirements-completed: [CFUI-01]

# Metrics
duration: 9min
completed: 2026-08-15
---

# Phase 44 Plan 05: Dev-Only Trigger-Child Guard Summary

**`warnIfInvalidTriggerChild` turns Radix `SlotClone`'s silent `null` into a named `console.error` in development only, wired into `FieldDialog` with a byte-identical render path and a source-level lock against masking fallbacks.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-08-15T12:48Z
- **Completed:** 2026-08-15T12:57Z
- **Tasks:** 2 (3 commits — TDD RED/GREEN plus the Task 2 lock)
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- A non-element child passed to `FieldDialog` now announces itself on first local render instead of after a full browser E2E pass (T-44-16). The message names the component, `asChild`, and the RSC boundary as the likely cause.
- Production behaviour is unchanged and silent (T-44-17 accepted, D-44-03) — the guard is a pure predicate there.
- The guard is tested against the *real* failure value: the `{ $$typeof: Symbol.for('react.lazy'), _payload, _init }` shape a Flight client materialises for `"$L<id>"`, not a convenient stand-in.
- The render path is locked: `<DialogTrigger asChild>{children}</DialogTrigger>` must stay unconditional, with exactly one `DialogTrigger` and no `isValidElement` branch inside the component. This is the assertion that stops Pitfall 2 — a fallback that makes the button reappear while leaving the boundary contract broken.

## Task Commits

1. **Task 1 (RED): failing test for the guard** — `da93842` (test)
2. **Task 1 (GREEN): guard + FieldDialog wiring** — `582cdb9` (feat)
3. **Task 2: render-path lock** — `921a96c` (test)

No REFACTOR commit — the implementation is one 12-line function and needed no cleanup.

## Files Created/Modified

- `src/app/admin/fields/[entityType]/trigger-child-guard.ts` (created) — exports `warnIfInvalidTriggerChild(children: unknown, componentName: string): boolean`. Returns `isValidElement(children)`, the same predicate Radix uses; logs one `console.error` when that is false and `NODE_ENV !== 'production'`.
- `src/app/admin/fields/[entityType]/__tests__/trigger-child-guard.test.ts` (created) — 16 tests: valid element, Flight lazy, string, `null`, `undefined`, plain object, the no-serialization guarantee, the production-silent pair, the `FieldDialog` wiring assertions, and the four render-path lock assertions.
- `src/app/admin/fields/[entityType]/field-dialog.tsx` (modified) — **+6 / -0**: one import, one commented call before the returned JSX. No JSX change.

## Decisions Made

- **Dev-only, per D-44-03.** No production throw. `process.env.NODE_ENV !== 'production'` is read at call time, so `vi.stubEnv` exercises the production branch honestly.
- **The message contains no data.** `console.error` is called with a single constant-shaped string; the offending child is never interpolated. Asserted directly (`expect(calls[0]).toHaveLength(1)` plus negative content checks) so T-44-18 cannot regress into a helpful-looking `console.error(msg, children)`.
- **`.ts`, not `.tsx`, for the test file** as specified in the plan's `files_modified` — elements are built with `createElement` rather than JSX.
- **Return value ignored at the call site**, with an inline comment explaining why. Without the comment, the ignored boolean reads like an oversight and invites exactly the conditional-`asChild` change the lock test forbids.

## Deviations from Plan

None — plan executed exactly as written.

One addition inside the plan's own scope: the plan's `<behavior>` did not spell out a test for T-44-18 (the "never serialize children" mitigation), but the threat register assigns it `mitigate` for this task's files. Added as a test rather than left as a comment (Rule 2 — a mitigation that is only documented is not mitigated). Committed as part of the Task 1 RED commit.

## Issues Encountered

- **Concurrent wave-1 agent in the same working tree.** Plan 44-01 was mid-flight in the same checkout: `vitest.config.ts`, `package.json`, `src/lib/custom-fields.test.ts` and `src/lib/formula-engine.test.ts` were dirty, and `vitest.rsc.config.ts` / `probe.rsc.test.tsx` were untracked. Handled by staging only this plan's three files (`git --literal-pathspecs add` on explicit paths, never `-A`). All three commits contain only this plan's files — verified via `git diff HEAD~3 HEAD`.
- **`npx tsc --noEmit` reports 2 errors, both out of scope.** `probe.rsc.test.tsx:13` (TS7016, missing declarations for `next/dist/compiled/react-server-dom-webpack/server.edge.js`) and `vitest.rsc.config.ts:27` (TS2769, `poolOptions`). Both belong to the concurrent 44-01 work and neither file is touched by this plan. Per the scope boundary, not fixed here — 44-01 owns them.
- **`npx eslint src/app/admin/fields` reports 0 errors, 3 warnings, all pre-existing.** The one warning in `field-dialog.tsx` is `react-hooks/incompatible-library` at line 286 (`watch('required')` from react-hook-form) and predates this change.

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run trigger-child-guard` | 16 passed, exit 0 |
| `npx vitest run` (full suite) | **831 passed**, 4 skipped, 53 files, exit 0 — above the 777 baseline, no new console noise breaking existing `console.error` spies |
| `npx tsc --noEmit` | 0 errors in this plan's files (2 pre-existing errors from concurrent 44-01 work) |
| `npx eslint src/app/admin/fields` | 0 errors |
| `git diff` on `field-dialog.tsx` | +6 / -0: one import, one call, one comment — no JSX change |

Note: the 831 figure includes tests from the concurrent 44-01 work present in the tree. This plan contributes 16.

## Known Stubs

None.

## Threat Flags

None — this plan adds no network, auth, file-access, or schema surface. It adds one dev-only console write whose content is a compile-time constant.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **44-06 is unblocked and unaffected.** This plan deliberately did *not* repair the boundary; `page.tsx` still passes JSX children across it. When 44-06 lands the client `AddFieldButton` wrapper, the guard goes quiet on its own — no coordination needed.
- **The lock test constrains 44-06.** `field-dialog.tsx` must keep `<DialogTrigger asChild>{children}</DialogTrigger>` verbatim, exactly one `DialogTrigger`, and no `isValidElement` branch. 44-06's repair is at the call site, so this is compatible by design — but a 44-06 author who reaches into `field-dialog.tsx` will get a red test, which is the intent.

## Caveat on requirement traceability

`requirements.mark-complete CFUI-01` was run because CFUI-01 is this plan's declared requirement, and
REQUIREMENTS.md now reads **CFUI-01 | Phase 44 | Complete**. That is premature in isolation: CFUI-01
is claimed by five plans (44-01, 44-05, 44-06, 44-08, 44-09) and **this plan does not repair it** — it
only makes its failure audible. The actual repair is 44-06's client `AddFieldButton` wrapper. Anyone
reading REQUIREMENTS.md before 44-06 lands should treat CFUI-01 as still open; the phase verifier
gate, not this row, is the authority.

## Self-Check: PASSED

All 4 claimed files exist on disk; all 3 claimed commits (`da93842`, `582cdb9`, `921a96c`) exist in git.

---
*Phase: 44-custom-field-ui-repair*
*Completed: 2026-08-15*
