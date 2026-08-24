---
phase: 43-type-safety-deployment-docs
plan: 02
subsystem: type-safety
tags: [typescript, tanstack-table, table-meta, polish-01]
requires: [43-01]
provides:
  - "OrganizationTableMeta / PersonTableMeta / PipelineTableMeta — per-consumer required-member contracts derived from the one shared TableMeta declaration"
  - "Compile-time enforcement that each of the three tables passes every callback its columns file reads"
affects:
  - src/app/organizations/data-table.tsx
  - src/app/people/data-table.tsx
  - src/app/admin/pipelines/data-table.tsx
tech-stack:
  added: []
  patterns:
    - "Required<Pick<TableMeta<Row>, …>> — narrowing the one globally augmented interface per consumer instead of declaring a second interface"
    - "Annotated module-scope contract + hoisted `const meta`, handed to useReactTable by reference (the shape src/app/trash/trash-table.tsx has used since Phase 37)"
key-files:
  created: []
  modified:
    - src/app/organizations/data-table.tsx
    - src/app/people/data-table.tsx
    - src/app/admin/pipelines/data-table.tsx
decisions:
  - "Required-ness lives at the consumer, never in the shared declaration — admin/users/data-table.tsx:41 passes only { refresh }, so a required member there breaks a file you would never open"
  - "settingDefaultId is in the pipelines contract despite being a value nobody reads, because it is in the literal; Required<> strips only the `?` and leaves string | null intact"
  - "Paraphrased the TS2741 text in the organizations doc comment rather than quoting it verbatim — a verbatim quote tripped the file's own one-occurrence gate on prose"
metrics:
  duration: ~22m
  tasks: 2
  files-changed: 3
  completed: 2026-08-24
---

# Phase 43 Plan 02: Consumer-Side Required-Member Contracts Summary

Each of the three data-tables now declares what it actually passes through
`Required<Pick<TableMeta<Row>, …>>` — a narrowing of 43-01's single augmentation, not a second
interface — so omitting a callback is `TS2741` at the producer instead of `undefined is not a
function` on a Delete button, and that failure was observed twice on purpose before being reverted.

## What This Closes

43-01 deleted 14 suppressions by augmenting the library's own `TableMeta<TData>`. Because that
augmentation is **global**, no member could be required: `src/app/admin/users/data-table.tsx:41`
passes only `{ refresh }`, so requiring `onEdit` would break that table. Everything was therefore
optional, which left a real hole — rename a callback in `columns.tsx` and the data-table still
compiles while the button silently does nothing. This plan puts required-ness where it is actually
true: at each consumer.

## The Three Contracts, As Written

```ts
// src/app/organizations/data-table.tsx
type OrganizationTableMeta = Required<Pick<TableMeta<Organization>, "refresh" | "onEdit" | "onDelete">>

// src/app/people/data-table.tsx
type PersonTableMeta = Required<Pick<TableMeta<Person>, "refresh" | "onEdit" | "onDelete">>

// src/app/admin/pipelines/data-table.tsx
type PipelineTableMeta = Required<Pick<TableMeta<Pipeline>, "onEdit" | "onDelete" | "onSetDefault" | "settingDefaultId">>
```

`Pick` selects from the same declaration in `src/types/tanstack-table.d.ts`, so a member renamed
there stops compiling at all three consumers. Each file has **exactly one** occurrence of
`Required<Pick<TableMeta<` (verified per-file: 1 / 1 / 1) and **zero** occurrences of `meta: {` —
the literal was hoisted, not duplicated.

## The Negative Proof — Run Twice, Verbatim

A contract never seen failing is a claim. Both proofs were executed, not reasoned about.

**Proof 1 — `onDelete` deleted from the organizations literal:**

```
src/app/organizations/data-table.tsx(426,9): error TS2741: Property 'onDelete' is missing in type
'{ refresh: () => void; onEdit: (org: Organization) => void; }' but required in type
'Required<Pick<TableMeta<Organization>, "onEdit" | "onDelete" | "refresh">>'.
```

Exactly 1 error in 1 file. This reproduces what research measured (research saw `(395,9)`; the line
moved to 426 because this plan added the contract's doc comment above it). Restored → `tsc` 0,
`git status --porcelain` clean.

**Proof 2 — `settingDefaultId` deleted from the pipelines literal:**

```
src/app/admin/pipelines/data-table.tsx(140,9): error TS2741: Property 'settingDefaultId' is missing
in type '{ onEdit: (pipeline: Pipeline) => void; onDelete: (pipeline: Pipeline) => void;
onSetDefault: (pipeline: Pipeline) => Promise<void>; }' but required in type
'Required<Pick<TableMeta<Pipeline>, "onEdit" | "onDelete" | "onSetDefault" | "settingDefaultId">>'.
```

Restored → `tsc` 0, tree clean. This member was chosen because it is the one most likely to be
silently wrong: a **value**, not a callback, and the columns file never reads it. The error also
confirms `Required<>` stripped only the `?` — `settingDefaultId`'s `string | null` survived, which
is why the four-member object still compiles while holding `null`.

**What makes each annotation able to fail:** the annotation sits on the `const meta` declaration
itself, so the object literal is checked against the contract at its point of definition — missing
member is `TS2741`, misspelled member is `TS2353` against the shared declaration. Nothing widens it
on the way to `useReactTable`, which is why deleting a member reports at the literal rather than
passing silently.

## Verification Numbers

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **0 errors** (after task 1, and again after both proofs reverted) |
| `npm test` | **4562 passed / 32 skipped / 0 failed**, 165 files passed / 2 skipped |
| `npm test` RSC project | **8 passed / 8** (2 files) |
| `npm run lint` | **0 errors**, 122 warnings (the expected worktree count; warnings not gated) |
| TS suppressions, non-test source | **0** |
| TS suppressions, test files | **exactly 2** (`src/lib/views/__tests__/actions.test.ts:343`, `src/lib/audit/export-events-live.test.ts:149`) |
| `package.json` / `package-lock.json` | **unmodified** — `git status --porcelain` on both returns empty |

Full suite matches the recorded baseline exactly. No drop.

## Source-Scan Gates

All gate tests in `src/components/bulk/__tests__` and `src/app/organizations/__tests__` ran green:
**177 passed / 0 failed**. As predicted, none asserts on `meta`, so the change was gate-neutral in
code. One prose collision did occur and was fixed the house way (see below).

**Finding — three of the seven files the plan named do not exist.** The plan's
`<gate_collision_map>` lists `src/components/bulk/__tests__/duplicate-warning-wiring.test.ts`,
`src/app/organizations/__tests__/record-dialog-note-failure.test.ts`, and
`src/app/organizations/__tests__/view-escape-call-sites.test.ts`. None is on disk. The actual gate
files in those two directories are:

- `src/components/bulk/__tests__/select-wiring.test.ts`
- `src/components/bulk/__tests__/bulk-caller-wiring.test.ts`
- `src/components/bulk/__tests__/bulk-action-bar-wiring.test.ts`
- `src/components/bulk/__tests__/bulk-dialogs-wiring.test.ts`
- `src/components/bulk/__tests__/bulk-failure-report-wiring.test.ts`
- `src/app/organizations/__tests__/toolbar-wiring.test.ts`
- `src/app/organizations/__tests__/views-bar-mount.test.ts`
- `src/app/organizations/__tests__/views-page-wiring.test.ts`

Eight files, not seven, and three of the plan's names were wrong. Running both directories whole
rather than the enumerated list is what caught this — worth noting because a gate list that names
non-existent files is a gate list that cannot fail on those entries.

## Deviations from Plan

**1. [Rule 1 - Bug] Collapsed two wrapped type aliases onto one line**

- **Found during:** Task 1 acceptance greps
- **Issue:** I first wrote the organizations and pipelines aliases wrapped across three lines
  (`Required<` / `  Pick<…>` / `>`). That broke the literal substring `Required<Pick<TableMeta<` that
  both the acceptance criteria and the plan's `must_haves.artifacts.contains` check depend on — the
  greps returned 0 for those two files.
- **Fix:** Collapsed each alias to a single line. Confirmed no Prettier config exists in this repo
  (`.prettierrc*`, `prettier.config.js`, and a `prettier` key in `package.json` are all absent), so
  the ~103 and ~120 character lines are unconstrained, and lint reports 0 errors.
- **Files modified:** `src/app/organizations/data-table.tsx`,
  `src/app/admin/pipelines/data-table.tsx`
- **Commit:** 4c90e97 (folded into task 1 before committing)

**2. [Rule 1 - Bug] Reworded a doc comment that tripped this file's own occurrence gate**

- **Found during:** Task 1 acceptance greps
- **Issue:** The organizations contract comment quoted the measured `TS2741` verbatim, including
  `'Required<Pick<TableMeta<Organization>, "refresh" | "onEdit" | "onDelete">>'`. That made the
  per-file occurrence count **2** instead of the required 1 — the comment satisfied the grep on
  prose. This is the same trap two wave-1 executors hit independently.
- **Fix:** Paraphrased the error text so the comment no longer contains the contract expression,
  and added a line inside the comment recording *why* it is paraphrased so a future editor does not
  helpfully restore the verbatim quote. **The assertion was not weakened** — the count is still
  gated at exactly 1, which is now satisfied by the declaration alone.
- **Files modified:** `src/app/organizations/data-table.tsx`
- **Commit:** 4c90e97

No architectural deviations. No Rule 4 escalations.

## Behaviour Preservation (T-43-11)

This is a typing change only; every runtime expression survived the hoist byte-identical. The diff
shows the meta property lines removed at 6-space indent and re-added at 4-space indent with
identical right-hand sides:

- `refresh: refresh || (() => {})` — unchanged in both organizations and people
- `onEdit: handleEdit`, `onDelete: handleDeleteClick` — unchanged in all three
- `settingDefaultId` — still the bare shorthand, not expanded to `settingDefaultId: settingDefaultId`

`getRowId` and its T-38-36 comment block **do not appear in the diff at all** in either the
organizations or people table, which is the strongest available statement that Phase 38's
bulk-delete-safety documentation was untouched.

## Scope Held

- `src/app/trash/trash-columns.tsx` and `trash-table.tsx` — **untouched**
  (`git status --porcelain src/app/trash/` empty). The augmentation's `renderActions?` member still
  folds `TrashTableMeta` in and `trash-table.tsx:355` still compiles.
- `src/app/admin/users/data-table.tsx` — **untouched** and still compiling. It passes only
  `{ refresh }` and is unaffected, which is the proof that per-consumer contracts were the right
  place for required-ness.
- The dead `useColumns` exports — **not deleted**, still present in all three columns files.
- The redundant inline cast at `admin/users/columns.tsx:68,248` that 43-01 flagged — **left alone**,
  as it is outside this plan's files. It still compiles. Noting it here so it is not lost: it is
  cosmetic, and this is the last phase of a milestone.

## Known Stubs

None. No placeholder values, no unwired data sources, no TODOs introduced.

## Commits

| Task | Commit | Description |
|---|---|---|
| 1 | `4c90e97` | feat(43-02): type the three data-table meta objects through the shared declaration |
| 2 | — | No permanent file change by design; both proofs reverted, tree left clean |
