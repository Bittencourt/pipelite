---
phase: 44-custom-field-ui-repair
plan: 03
subsystem: ui
tags: [formula, custom-fields, quickjs, vitest, tdd, react]

# Dependency graph
requires:
  - phase: 34-formula-reactivity
    provides: "buildFormulaFieldValues, the D-14 null-seeding contract, unwrapFormulaValue"
provides:
  - "buildClientFieldValues — a db-free, client-importable mirror of the server's formula field-value map"
  - "An executable server/client parity gate: buildClientFieldValues vs buildFormulaFieldValues"
  - "A pinned contract test for the engine's absent-key vs present-and-null distinction"
affects: [44-07, 44-04, custom-fields-section, formula-field]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Extract client/server-duplicated logic into a pure module so the parity is directly assertable"
    - "vi.mock('@/db') in a test to import a db-touching server module purely for a parity assertion"

key-files:
  created:
    - src/lib/client-field-values.ts
    - src/lib/client-field-values.test.ts
  modified:
    - src/lib/formula-engine.test.ts

key-decisions:
  - "buildClientFieldValues normalises natives with `?? null`, mirroring the server's `row?.[column] ?? null`, so an unresolved attribute becomes a blank rather than an `undefined` in the sandbox"
  - "The parity assertion is a full `toEqual` plus a sorted key-set comparison — not weakened to a subset check"
  - "Kept the type-only `@/db/schema` import the plan specified; client-safety is gated on the absence of a runtime `@/db` import instead"

patterns-established:
  - "Pattern: a second evaluator is only acceptable if a test asserts it against the first"
  - "Pattern: assert key PRESENCE (`'X' in map`) when the consumer branches on presence, not just the value"

requirements-completed: [CFUI-03]

# Metrics
duration: 5min
completed: 2026-08-15
---

# Phase 44 Plan 03: Client Field-Value Map Summary

**`buildClientFieldValues` — a db-free mirror of the server's `buildFormulaFieldValues` (natives → D-14 `null` seed → stored values unwrapped), asserted key-for-key against the server implementation under `vi.mock('@/db')`.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-08-15T15:47:32Z
- **Completed:** 2026-08-15T15:52:47Z
- **Tasks:** 2 (Task 2 was TDD: RED → GREEN)
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- **The absent-vs-null engine contract is now executable.** `formula-engine.test.ts` pins all three
  cases for `{{GSD Base Value}} * 2`: absent key → `Unknown field: GSD Base Value` (the CFUI-03
  symptom itself, documented as the thing the seeding prevents), present-and-null → `{ value: null,
  error: null }`, and a real value → `6`. A refactor that drops the seeding now fails here with a
  legible message instead of surfacing as `#ERROR` in a browser weeks later.
- **`buildClientFieldValues` exists as a pure module**, not four lines inlined in a client component.
  That is the entire reason CFUI-03 survived: inline, the parity was unassertable without rendering
  a client component, which the repo has never done.
- **Server/client parity is asserted, not asserted-about.** Four parity cases (deal with empty blob,
  deal with stored values + a formula wrapper + an orphan stored key, person with zero definitions,
  activity) each build the server map via the real `buildFormulaFieldValues` and compare with
  `toEqual` plus a sorted key-set equality. If either side's precedence, seeding or unwrapping
  changes alone, this fails.
- 16 new helper tests + 3 new engine tests, all green; suite at **827 passing** (baseline 777).

## Task Commits

1. **Task 1: Pin the absent-vs-null engine distinction** — `376773b` (test)
2. **Task 2 (RED): Failing spec for the client field-value map helper** — `1751c40` (test)
3. **Task 2 (GREEN): Implement `buildClientFieldValues`** — `17f8570` (feat)

No REFACTOR commit — the implementation is three loops and needed no cleanup.

## Files Created/Modified

- `src/lib/client-field-values.ts` (created) — exports `buildClientFieldValues` and
  `BuildClientFieldValuesInput`. Imports only `unwrapFormulaValue` from `@/lib/formula-helpers`
  plus a **type-only** `CustomFieldDefinition` from `@/db/schema`. File header names
  `buildFormulaFieldValues` as the function it must be changed together with.
- `src/lib/client-field-values.test.ts` (created) — 16 tests across seeding, precedence, wrapper
  unwrapping, server parity, and a client-safety source grep.
- `src/lib/formula-engine.test.ts` (modified) — one new top-level describe, 3 tests, appended
  without restructuring the file. 70 tests pass (was 67).

## The exported signature (for plan 44-07)

```ts
// src/lib/client-field-values.ts
import type { CustomFieldDefinition } from '@/db/schema'

export interface BuildClientFieldValuesInput {
  /** Every ACTIVE definition for the entity. Only `name` is read. */
  definitions: Pick<CustomFieldDefinition, 'name'>[]
  /** Natives already resolved to formula-facing names, e.g. `{ Value, Title, Notes, ExpectedCloseDate }`. Optional. */
  entityAttributes?: Record<string, unknown>
  /** The entity's stored `customFields` JSONB, plus anything edited this session. */
  values: Record<string, unknown>
}

export function buildClientFieldValues(
  input: BuildClientFieldValuesInput
): Record<string, unknown>
```

Call shape 44-07 will want in `custom-fields-section.tsx`:

```ts
const allFieldValues = useMemo(
  () => buildClientFieldValues({ definitions, entityAttributes, values: localValues }),
  [definitions, entityAttributes, localValues]
)
```

Note it takes a **single object argument**, not the three positional arguments
`44-VALIDATION.md` sketched (`buildClientFieldValues(definitions, entityAttributes, values)`) —
44-03-PLAN.md specifies the object form, matching `buildFormulaFieldValues`' own input shape.

## Decisions Made

1. **Natives are normalised with `?? null`.** The server does `row?.[column] ?? null`; the client
   receives an already-resolved attribute map, so a page that resolved an attribute to `undefined`
   would otherwise put `undefined` into the sandbox — a present key whose value is neither null nor
   usable. Mirroring `?? null` keeps parity exact and is covered by its own test. This is a
   correctness hardening within the plan's stated intent (mirror the server's precedence), not a
   scope addition.
2. **The parity assertion was kept at full strength.** `expect(client).toEqual(server)` plus
   `expect(Object.keys(client).sort()).toEqual(Object.keys(server).sort())`. The plan explicitly
   forbade weakening it to a subset check without recording why; there was no need to weaken it.
3. **Client-safety is gated on the absence of a runtime `@/db` import**, not on the literal string
   `@/db` being absent from the file. The plan's `<verification>` line
   (`grep -rn "@/db" src/lib/client-field-values.ts` returns nothing) is in tension with the plan's
   own `<action>` instruction to import the type from `@/db/schema`. The `<action>` wins: the import
   is `import type`, fully erased at compile time, so it cannot pull a database client into a client
   bundle. The committed test asserts what actually matters — no `from "@/db"` and no
   `formula-recalc` import — and it runs on every suite execution, unlike a plan-file grep.

## Deviations from Plan

**None affecting scope.** Two notes, both recorded above as decisions:

- The `?? null` normalisation on natives (decision 1) is an addition to the plan's literal
  "three passes" wording, made to keep the parity assertion honest. It is behaviour-preserving for
  every real call site (natives are already `null` or a value) and has its own test.
- Decision 3 reconciles a self-contradiction inside the plan's own text; nothing was skipped.

## Issues Encountered

**One out-of-scope failure in the full suite, not caused by this plan.**
`rtk proxy npx vitest run` reports `1 failed | 827 passed | 4 skipped` (54 files). The single
failure is `src/app/admin/fields/[entityType]/__tests__/probe.rsc.test.tsx` —
`The "react" package in this environment is not configured correctly. The "react-server" condition
must be enabled`. That file and `vitest.rsc.config.ts` are **untracked scratch artefacts of a
sibling wave-1 executor** (plan 44-01, which owns the RSC project config); `git status` shows them
as `??`, and this plan touched neither. `npx tsc --noEmit` likewise reports 2 errors, both inside
those same two sibling-owned files. Per the executor scope boundary these were left alone rather
than "fixed" underneath the agent that is mid-way through creating them.

This plan's own gates are all clean:

| Gate | Result |
|---|---|
| `rtk proxy npx vitest run client-field-values` | 16 passed |
| `rtk proxy npx vitest run formula-engine.test` | 70 passed (was 67) |
| `npx eslint` on the three touched files | 0 errors |
| `npx tsc --noEmit` | no error in any file this plan touched |
| No component file modified | confirmed — `src/lib` only |

## Known Stubs

None. Both new files are fully wired; the only thing deliberately *not* done here is the call site,
which is plan 44-07's scope by design (`<success_criteria>`: "No component file is modified by this
plan").

## User Setup Required

None — no external service configuration, no packages installed. The phase's no-new-packages
constraint holds (`package.json` untouched).

## Next Phase Readiness

- **44-07 can wire the helper directly.** Signature and call shape are recorded above.
- **44-04 (CFUI-04, activities `entityAttributes`) benefits for free** — the parity suite already
  includes an `activity` case, so once the activities detail page passes its natives, the client map
  will match the server's without further work here.
- **Standing constraint for future phases:** `buildClientFieldValues` and `buildFormulaFieldValues`
  must be changed together. The parity test is the enforcement; the file header says so in prose.

## Self-Check: PASSED

- `src/lib/client-field-values.ts` — FOUND, exports `buildClientFieldValues`
- `src/lib/client-field-values.test.ts` — FOUND
- `src/lib/formula-engine.test.ts` — FOUND (modified)
- `.planning/phases/44-custom-field-ui-repair/44-03-SUMMARY.md` — FOUND
- Commits `376773b`, `1751c40`, `17f8570` — all FOUND in `git log`
