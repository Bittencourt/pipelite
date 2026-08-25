---
phase: 43-type-safety-deployment-docs
plan: 01
subsystem: type-safety
tags: [tanstack-table, module-augmentation, type-suppressions, gate]
requires: []
provides:
  - "src/types/tanstack-table.d.ts — the one shared TableMeta declaration, augmenting the library's own interface"
  - "src/types/__tests__/no-standing-suppressions.test.ts — the standing-suppression gate with the D-1 exclusion"
affects:
  - "src/app/admin/pipelines/columns.tsx"
  - "src/app/organizations/columns.tsx"
  - "src/app/people/columns.tsx"
  - "every useReactTable call site in the app (meta: literals are now excess-property checked)"
tech-stack:
  added: []
  patterns:
    - "TypeScript module augmentation of @tanstack/react-table's empty TableMeta interface"
    - "all-optional shared declaration + per-consumer Required<Pick<...>> narrowing (43-02)"
    - "raw-source gate with a join-assembled needle and a self-non-containment assertion"
key-files:
  created:
    - src/types/tanstack-table.d.ts
    - src/types/__tests__/no-standing-suppressions.test.ts
  modified:
    - src/app/admin/pipelines/columns.tsx
    - src/app/organizations/columns.tsx
    - src/app/people/columns.tsx
decisions:
  - "Module augmentation, not a hand-rolled interface plus casts: it removes the assertion instead of relabelling it, and it checks the producer as well as the consumer."
  - "Every member optional. admin/users/data-table.tsx:41 passes only meta: { refresh }, so any required member breaks it with TS2741. Required members are enforced per-consumer in 43-02."
  - "renderActions? included so TrashTableMeta stays assignable (weak-type rule); both Phase 37 trash files left untouched."
  - "The three dead useColumns exports were retyped, not deleted, despite carrying 7 of the 14 suppressions."
  - "The two D-1 test suppressions are protected by the gate, not targeted by it."
metrics:
  duration: ~35 min
  completed: 2026-08-24
  tasks: 2
  commits: 2
  files_changed: 5
requirements: [POLISH-01]
---

# Phase 43 Plan 01: Shared TableMeta & Standing-Suppression Removal Summary

One module augmentation of `@tanstack/react-table`'s deliberately-empty `TableMeta` interface replaced all 14 standing `@ts-expect-error` suppressions across the pipelines, organizations and people columns modules, in a single atomic commit, with `tsc --noEmit` at 0 errors and zero edits outside the four files.

## What Changed

`src/types/tanstack-table.d.ts` (new, 64 lines) declares six optional members on the library's own `TableMeta<TData>`: `onEdit`, `onDelete`, `onSetDefault`, `settingDefaultId`, `refresh`, `renderActions`. All 14 directive comment lines were then deleted from the three columns modules. Every `table.options.meta?.x` read beneath them is byte-identical — no cast, no non-null assertion, no new import.

The suppressions were the visible symptom, not the defect. Because `TableMeta` was declared empty (`node_modules/@tanstack/table-core/build/lib/types.d.ts:31`), TypeScript ran **no excess-property check** against it, so every `meta:` literal in the app was unchecked in *both* directions. The augmentation closes the producer side too — renaming a callback in a data-table without updating its columns file is now `TS2353` instead of a silent `undefined` at runtime.

## Atomicity — Why One Commit

Not stylistic. The augmentation is global and instantaneous: the moment the `.d.ts` exists, every suppression not yet deleted becomes `TS2578` for being unnecessary. Splitting leaves `tsc` red in between in either order. Research measured this (§ A1: 8 × `TS2578` from a partial probe). Delivered as one commit, `48dc258`, containing exactly 4 files.

Deletions were made **by content**, not by line number — a single `sed` matching the exact directive text — because line numbers shift as you delete.

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **exit 0, 0 errors** |
| `npm run lint` | **0 errors**, 122 warnings (worktree baseline; not gated on) |
| `no-standing-suppressions.test.ts` | **14/14 pass** (was 9 pass / 5 fail in RED) |
| `select-wiring.test.ts` (Phase 38) | **37/37 pass** |
| `npm test` full suite | **4538 passed / 32 skipped**, 163 files passed / 2 skipped |
| RSC suite | **8/8 pass** |
| `git show --stat HEAD` | exactly 4 files: 64 insertions, 14 deletions |
| columns diff | **0 insertions / 14 deletions** (6 + 4 + 4) |
| `package.json` / `package-lock.json` | untouched — empty `git diff --name-only` |
| tracked file deletions | none — empty `git diff --diff-filter=D` |

Full-suite count reconciles exactly against the stated baseline: 4524 + 14 new gate assertions = 4538. Skipped unchanged at 32.

`@tanstack/react-table` 8.21.3 was already installed; **no package manager command was run**.

## RED Output, Verbatim

`npx vitest run src/types/__tests__/no-standing-suppressions.test.ts` before any implementation — `PASS (9) FAIL (5)`:

```
AssertionError: Standing suppressions must be replaced by the shared TableMeta declaration in
src/types/tanstack-table.d.ts, not left in place. Found 14:
src/app/admin/pipelines/columns.tsx:92
src/app/admin/pipelines/columns.tsx:94
src/app/admin/pipelines/columns.tsx:96
src/app/admin/pipelines/columns.tsx:199
src/app/admin/pipelines/columns.tsx:201
src/app/admin/pipelines/columns.tsx:203
src/app/organizations/columns.tsx:102
src/app/organizations/columns.tsx:104
src/app/organizations/columns.tsx:204
src/app/organizations/columns.tsx:206
src/app/people/columns.tsx:113
src/app/people/columns.tsx:115
src/app/people/columns.tsx:223
src/app/people/columns.tsx:225: expected [ …(14) ] to deeply equal []
```

The other four RED failures: repo-wide total `expected 16 to be 2`, and three `tanstack-table.d.ts` shape assertions failing because the file did not exist.

**The two D-1 assertions were GREEN in the RED run** — `keeps exactly two occurrences across test files` and `keeps them in exactly the two files D-1 names` both passed before any implementation. That is the proof the gate *protects* the two deliberate suppressions rather than forcing their deletion. A gate red on D-1 on day one is the regression-forcing gate 43-CONTEXT.md D-1 warns about.

## Measured Counts Behind the Gate's Anti-Vacuity Floors

Numbers, not "above the floor":

| Quantity | Measured | Floor asserted |
|---|---|---|
| Non-test `.ts`/`.tsx` modules under `src/` | **523** | 400 |
| Test modules under `src/` | **170** (169 before this plan added the gate file) | 100 |
| Total enumerated | **693** | — |

The `.d.ts` counts as a non-test module and contains no needle, so the non-test figure is 523 both before and after.

## What Makes Each Gate Assertion Go Red

The plan required this to be stated. Assertions marked **[demonstrated]** were actually driven red and restored; the rest were observed red in the RED run.

| Assertion | Goes red when | Evidence |
|---|---|---|
| non-test occurrences === 0 | any suppression returns to non-test source | RED run: 14 listed |
| repo-wide total === 2 | either half regresses; deliberately kept in its own describe block so it cannot mask or be masked by the other two | RED run: 16 |
| test occurrences === 2 | either D-1 suppression is deleted, or a third appears | **[demonstrated]** deleted line 343 → red |
| containing test files === the D-1 pair | a D-1 suppression moves, is deleted, or a new file acquires one | **[demonstrated]** deleted line 343 → red |
| raw read proof (`actions.test.ts` contains the needle) | the gate is ever routed through a comment-stripping reader — which would zero every count above | **[demonstrated]** deleted line 343 → red |
| gate source does not contain the needle | a future edit spells the directive in a comment or test name here, self-inflating the repo-wide count | structural; needle assembled by `join` |
| gate source does not name the stripped-source helper | anyone "modernises" this gate onto the house comment-blind helper | structural; symbol assembled by `join` |
| walk floors (523/170) | a wrong path constant or broken recursion — the exact phase-42 vacuity mode | fails at 0 files |
| walk contains all three columns paths | a rename moves a target out from under the gate | fails on rename |
| each columns file > 3000 chars and contains `ColumnDef` | zero is reached by emptying or deleting a host file (deleting the dead `useColumns` would remove 7 of 14 "for free") | fails on emptied file |
| `.d.ts` exists, `declare module`, `interface TableMeta` | the declaration is removed or relocated | RED run: file absent |
| all six members declared `?:` | anyone makes a member required | **[demonstrated]** `onEdit?:` → `onEdit:` turned the gate red *and* produced `TS2741` at `admin/users/data-table.tsx:41` and `trash-table.tsx:355` |
| `renderActions?` present | the member that keeps `TrashTableMeta` assignable is dropped | RED run: file absent |

Two mutations were run and reverted with `git checkout -- <specific file>`; `tsc` reconfirmed at 0 errors afterwards and the tree left clean.

### On the `readStrippedSource` criterion

The gate initially explained rule 1 by *naming* the helper in two comments, which made the plan's `grep -c 'readStrippedSource'` return 2 instead of 0. Per this project's own standing rule — reword the prose, never weaken the gate — the prose was reworded to refer to it by location instead of symbol, and the rule was additionally made **structural**: `STRIPPED_HELPER` is assembled by `join` and the gate asserts its own source does not contain it. So the criterion now holds for a reason, not by coincidence. `grep -c` returns 0.

## Scope Boundaries Honoured

- `src/app/trash/trash-columns.tsx` and `src/app/trash/trash-table.tsx` — **not modified**. `renderActions?` in the shared declaration is what keeps them compiling: an all-optional non-empty interface is a *weak type*, so without that member `TrashTableMeta` shares no property with `TableMeta<TrashRow>` and `trash-table.tsx:355` fails `TS2559`.
- **`TrashTableMeta` is now a NARROWING of the one shared declaration, not a competing declaration.** Recording this explicitly so nobody reopens the argument: its cast at `trash-columns.tsx:305` remains valid because `TrashTableMeta` stays assignable to the augmented `TableMeta<TrashRow>`. Folding it in fully (`Required<Pick<...>>` + dropping the cast) is research Tier 3 and deliberately not done here.
- No data-table, no `admin/users` file, nothing under `src/components/bulk/` was touched. The augmentation needs **no import in the columns files at all**, which is precisely why Phase 38's select-wiring gate stays green — none of the four tokens it forbids (`useSelectColumn`, `components/bulk`, `components/ui/checkbox`, `rowSelection`) could arrive.
- `package.json` / `package-lock.json` untouched. No install command run.

## Backlog Observations

1. **All three `useColumns` exports are dead code.** `src/app/organizations/columns.tsx:30`, `src/app/people/columns.tsx:33`, `src/app/admin/pipelines/columns.tsx:29` are imported nowhere in `src/` or `e2e/`; the rendered tables use the legacy `columns` const (`organizations/page.tsx:7`, `people/page.tsx:7`, `admin/pipelines/page.tsx:5`). They carry **7 of the 14** suppressions. They were **retyped, not deleted** — deleting them would satisfy half the criterion for free but is a scope expansion with no requirement behind it, and POLISH-01's text says the suppressions are *replaced by a shared typed interface*, not deleted with their host code. Note the direction: the dead copies are the *translated* ones and the live `columns` const carries hardcoded English headers, so deleting the dead ones points away from the untranslated-header debt. Worth its own item.
2. **`src/app/admin/users/columns.tsx:68` and `:248` now carry a redundant cast.** Both read `const meta = table.options.meta as { refresh: () => void } | undefined`. The augmentation makes the cast unnecessary — `meta?.refresh` would now be correctly typed — but it still compiles, it is not one of the 14, and the file is outside `files_modified`. Left alone deliberately; a one-line cleanup for a future pass.

## Deviations from Plan

None affecting scope, files or behaviour. Two presentational adjustments inside the gate file, both tightening rather than loosening:

1. **Moved the repo-wide `=== 2` assertion out of the D-1 describe block** into its own `the two halves reconcile` block. It is expected red before implementation (16), whereas every assertion in the D-1 block must be green from the first run. Same assertion, same failure behaviour; the regrouping just makes "the D-1 block is green in RED" checkable at block granularity.
2. **Reworded the two comments naming `readStrippedSource`** and added a structural assertion that the symbol is absent, so the plan's `grep -c ... = 0` criterion is satisfied by construction. See above.

## Known Stubs

None. No placeholder values, no TODOs, no unwired data paths. The `.d.ts` emits no runtime code — a module augmentation is erased entirely by the bundler, so there is no new data path, no new I/O and no new dependency (threat register T-43-08, `accept`).

## Threat Flags

None. No new network endpoint, auth path, file access pattern or schema change. The change is type-level only, and its net effect on the trust boundary is *additive checking*: 14 standing instructions to the compiler to stop checking were removed, and excess-property checking now applies to every `meta:` literal in the app where previously none applied.

## Commits

| Hash | Type | Description |
|---|---|---|
| `b56fe80` | test | failing standing-suppression gate with the D-1 exclusion (RED: 9 pass / 5 fail) |
| `48dc258` | feat | augment `TableMeta` and delete all 14 standing suppressions (4 files) |

## TDD Gate Compliance

RED then GREEN, both gates present and in order. `test(43-01)` at `b56fe80` was observed failing for the right reason — 14 named occurrences plus the absent declaration — before `feat(43-01)` at `48dc258`. No REFACTOR commit: the measured result required no cleanup, since the columns diff is deletions only.
