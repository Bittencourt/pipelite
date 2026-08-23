---
phase: 42-observability
plan: 01
subsystem: infra
tags: [logging, structured-logs, json, observability, console, error-serialization, log-injection, tdd]

# Dependency graph
requires: []
provides:
  - "src/lib/log.ts — the structured logger all 273 console.* call sites migrate onto"
  - "log.debug/info/warn/error, each (scope, msg, ctx?), emitting one JSON line"
  - "Explicit Error serialization (name/message/stack + cause to depth 3) — the stack survives"
  - "Console-method delegation, so the suite's 89 existing console spies keep working"
  - "LOG_LEVEL gating: debug|info|warn|error|silent, default info, unknown falls back to info"
  - "8000-char line cap and a never-throw fallback for circular refs and BigInt"
  - "src/lib/log.test.ts — 24-test OBS-01 emitter contract"
affects: [42-observability plans 04-17 (every migration plan imports this module), plan 18 (the no-console lint flip exempts this file)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Zero-import module for anything reachable from all four Next.js module graphs"
    - "Bracket-notation, per-call process.env reads so no bundler can inline and tests can mutate"
    - "Explicit Error serialization instead of trusting JSON.stringify"
    - "Delegate to console.* rather than process.stdout.write to preserve existing test spies"

key-files:
  created:
    - src/lib/log.ts
    - src/lib/log.test.ts
  modified: []

key-decisions:
  - "Delegate each level to the matching console method (error/warn/debug/log) rather than process.stdout.write — keeps 86 of the suite's 89 console-spy assertions untouched and stays importable from the edge runtime and the browser"
  - "Serialize Error explicitly (name, message, stack, recursive cause to depth 3) because JSON.stringify(new Error()) is '{}' — those three properties are non-enumerable"
  - "Cap the cause walk at depth 3 so a cyclic cause chain (a.cause=b; b.cause=a, legal and produced by retry wrappers) cannot blow the stack"
  - "Default LOG_LEVEL is info, and an unrecognised value falls back to info rather than throwing — an operator's .env typo must not take the app down"
  - "8000-char line cap, under Docker's 16 KB json-file split threshold; the truncated line still carries level/scope/msg/ts and stays valid JSON"
  - "Whole serialization sits in try/catch — a logger that throws inside a catch block converts a handled error into an unhandled one"
  - "Export only `log`; emit/serialize/threshold stay private so no call site can build a second, divergent line format"
  - "JSON.stringify IS the log-injection control (T-42-05) — it escapes \\n in every string it writes, so no user-controlled ctx value can forge a second record"

patterns-established:
  - "Structured line shape: {level, scope, msg, ts} first at fixed positions for greppability, ctx keys spread flat afterwards"
  - "Test convention: load the module with `await import(\"./log\")` per test so a broken module surfaces as per-test failures rather than one collection error that hides the assertion count"

requirements-completed: [OBS-01]

# Metrics
duration: 21min
completed: 2026-08-23
---

# Phase 42 Plan 01: The Structured Logger Summary

**Zero-import JSON logger with explicit Error/stack serialization, console-method delegation to preserve 89 existing test spies, per-call LOG_LEVEL gating, an 8000-char cap and a never-throw fallback — proven by 24 tests written before the module existed.**

## Performance

- **Duration:** ~21 min
- **Started:** 2026-08-23T12:34Z
- **Completed:** 2026-08-23T12:55Z
- **Tasks:** 2 (both TDD)
- **Files created:** 2 (`src/lib/log.ts` 155 lines, `src/lib/log.test.ts` 446 lines)

## Accomplishments

- **`src/lib/log.ts` — 155 lines, zero imports.** Verified: `grep -c '^import'` returns 0, and `process.stdout` / `node:` appear only inside the explanatory comments the plan mandates, never in code.
- **The stack survives.** `serialize()` handles `Error` explicitly. The suite asserts both directions: that `err.stack` is a non-empty string containing the message, and that the serialized value is NOT deep-equal to `{}` — the exact shape the naive implementation emits.
- **Blast radius held at 3.** Every level lands on its matching `console` method, asserted per level along with the methods that must NOT be called. The 89 `vi.spyOn(console, …)` calls across 40 test files are untouched, as the full-suite run confirms.
- **Never throws.** Circular objects, `BigInt` values and 50 KB payloads all produce a valid single line rather than an exception.
- **One call is one line.** The log-injection case asserts a ctx value carrying `\n{"level":"error","scope":"forged"}` yields one record whose `scope` is the real scope, with the value preserved intact (escaped in transport, not stripped).

## Task Commits

1. **Task 1: RED — the OBS-01 contract against the absent module** — `2b2862c` (test)
2. **Task 2: GREEN — implement `src/lib/log.ts`** — `85dbdff` (feat)

No REFACTOR commit: the implementation follows the pre-verified RESEARCH Pattern 6 design and needed no cleanup after going green.

## RED counts (both runs recorded, as required)

| Run | Condition | Result |
|-----|-----------|--------|
| RED 1 | `src/lib/log.ts` absent | **24 tests, 24 failed**, 7 suites failed — every failure `Error: Cannot find module '/src/lib/log'` |
| RED 2 | plausible-but-wrong implementation present | **24 tests, 8 passed, 16 failed** |
| GREEN | real implementation | **24 tests, 24 passed, 0 failed** |

RED 2 is the run that matters, and it was worth doing. The wrong implementation was wrong in exactly the ways a careful engineer gets wrong on the first pass: `JSON.stringify` applied directly to `ctx` (so an `Error` becomes `{}`), no depth cap, no truncation, no try/catch, and every level routed to `console.log`. The 16 failures were:

- all 5 Error-serialization cases (stack lost, `{}` emitted, no cause, no depth termination, cyclic chain)
- 3 of 4 delegation cases (error/warn/debug all landed on `console.log`)
- all 3 throw-safety cases (circular and BigInt threw; the 50 KB payload emitted a 50 KB line)
- 4 of 5 LOG_LEVEL cases
- 1 of 2 injection cases

This proves the assertions bite on the substance rather than merely failing on a missing import. The 8 that passed under the naive implementation are informative too: the four shape assertions, `silent` muting, non-Error passthrough, `info`→`console.log`, and the primary injection case all pass because `JSON.stringify` genuinely provides those properties. The injection mitigation is a property of the serializer, not of extra defensive code — which is why it is asserted rather than assumed.

## Files Created

- **`src/lib/log.ts`** (155 lines) — the logger. `threshold()` resolves `LOG_LEVEL` per call; `serialize()` handles `Error` and its `cause` chain; `emit()` builds the line, caps it, catches everything, and delegates to the matching `console` method. Only `log` is exported.
- **`src/lib/log.test.ts`** (446 lines) — 24 tests in 7 describe blocks: line shape (4), LOG_LEVEL gating (5), Error serialization (6), console delegation (4), throw-safety (3), log injection (2).

## Decisions Made

Two choices went beyond what the plan specified:

1. **Load the module with `await import("./log")` inside each test** rather than a top-level static import. With a static import, an absent module fails the whole file as one collection error and reports zero tests — which would have made the plan's "N tests, N failed with N ≥ 20" acceptance criterion unobservable, and would have hidden whether the assertions bite. Per-test dynamic import gives 24 individually-failing tests. This is also already the tree's convention (`src/lib/email/send.test.ts`).

2. **Added two cases the plan did not enumerate:** a cyclic `cause` chain (`a.cause = b; b.cause = a`), because the depth cap's real justification is cycles rather than depth and an untested cap invites a later "simplification"; and a newline inside `scope`/`msg` themselves, not just inside a ctx value, since those two fields are also caller-supplied.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] BigInt literal broke the typecheck while every test passed**
- **Found during:** Task 2, at the `npx tsc --noEmit` gate
- **Issue:** The throw-safety test used `BigInt(9007199254740993n)`. `tsconfig.json` targets ES2017, where the `n` literal suffix is a compile error (TS2737). Vitest does not typecheck, so all 24 tests passed green while `tsc` reported 1 error — the failure mode the plan's separate typecheck gate exists to catch.
- **Fix:** `BigInt("9007199254740993")` — the string constructor, with a comment recording why the literal cannot be used here.
- **Files modified:** `src/lib/log.test.ts`
- **Verification:** `npx tsc --noEmit` clean; suite still 24/24.
- **Committed in:** `85dbdff` (Task 2 commit)

### Noted tension in the plan's acceptance criteria (no code change)

Task 2 requires `grep -c 'process\.stdout' src/lib/log.ts` to return 0, while the same task's `<action>` requires commenting *both* reasons for not using `process.stdout`. Those two instructions cannot both be satisfied literally. The `<action>` was followed — the reasoning is the most valuable comment in the file, since a future engineer "simplifying" to `process.stdout.write` is precisely the regression the plan is defending against. The substantive requirement is met: `process.stdout` (3 hits) and `node:` (1 hit) appear only in comments, confirmed with a comment-stripping grep, and there is no stdout usage in code. Same for the `node:` mention.

---

**Total deviations:** 1 auto-fixed (1 bug). No scope creep; no new dependencies.

## Verification

| Gate | Baseline | Result |
|------|----------|--------|
| `npx vitest run src/lib/log.test.ts` | — | **24 passed, 0 failed** |
| `npx tsc --noEmit` | 0 errors | **0 errors** |
| `npm test` | 4406 passed / 32 skipped | **4430 passed / 32 skipped** (4406 + the 24 added, exactly — no existing assertion moved) |
| `npm test` (RSC project) | 8/8 | **8/8** |
| `npx eslint` | 0 errors, ~124 warnings | **0 errors, 122 warnings** |
| `npx eslint src/lib/log.ts src/lib/log.test.ts` | — | **No issues found** |

Acceptance greps on `src/lib/log.ts`: `^import` → 0; `process\.env\["LOG_LEVEL"\]` outside comments → 1; `process.stdout` in code → 0; `node:` in code → 0; 155 lines (min 60). `src/lib/log.test.ts` is 446 lines (min 120).

The 122 lint warnings sit just below the stated ~124. Adding files can only ever increase a warning count and my two files produce zero, so this is a pre-existing baseline measurement difference, not drift caused here. Not chased, per instruction.

## TDD Gate Compliance

Both gates present and correctly ordered in `git log`:
- RED: `2b2862c` `test(42-01): …` — test file only; `src/lib/log.ts` verified absent at commit time
- GREEN: `85dbdff` `feat(42-01): …` — implementation, committed after RED
- REFACTOR: not needed

## Known Stubs

None. The module is complete against its published interface; no placeholder values, no unwired paths.

## Threat Flags

None. No new security-relevant surface beyond the plan's threat register. Dispositions delivered as planned:

| Threat | Status |
|--------|--------|
| T-42-05 (log injection) | mitigated — asserted by two tests, not assumed |
| T-42-08 (line length) | mitigated — 8000-char cap, truncated form still valid JSON |
| T-42-11 (logger throws) | mitigated — try/catch with minimal-line fallback; circular + BigInt asserted |
| T-42-12 (env disclosure) | mitigated — exactly one variable read by name, `process.env` never enumerated |
| T-42-04 (sensitive ctx) | accepted at this layer, as planned; control lives at the call sites |

## Issues Encountered

Beyond the BigInt typecheck bug above: the worktree branched from a stale base (`df3395c`, an ancestor of the expected `4ff7b1a`) and was reset per the setup contract — the same failure that hit fourteen of fourteen worktrees in the previous phase. Worth noting that it recurred.

## User Setup Required

None for this plan. `LOG_LEVEL` is optional and defaults to `info`; wiring it into `docker-compose.yml` is amendment A5's job in a later plan, and until then the container simply runs at the default.

## Next Phase Readiness

The interface downstream plans code against is final and proven:

```typescript
log.error("trash-prune", "Tick error", { err: error })
```

Ready for the wave-2 migrations (plans 04-17) and for plan 18's `no-console` flip, which must add `src/lib/log.ts` to the rule's exemption list — the file's header already records that it is the sole exemption.

Two things a migrating plan must know:
- `ctx` keys land flat at the top level, so a key named `level`, `scope`, `msg` or `ts` would collide with a base field. No guard was added (out of scope here); worth a convention note in the migration plans.
- The logger serializes whatever it is handed. Redaction is the call site's job — the migration contract's "never add a value that was not already in the string" rule is what enforces T-42-04, and it is not enforceable from inside this module.

## Self-Check: PASSED

- `src/lib/log.ts` — FOUND (155 lines)
- `src/lib/log.test.ts` — FOUND (446 lines)
- `.planning/phases/42-observability/42-01-SUMMARY.md` — FOUND
- Commit `2b2862c` — FOUND in git log
- Commit `85dbdff` — FOUND in git log

---
*Phase: 42-observability, Plan: 01*
*Completed: 2026-08-23*
