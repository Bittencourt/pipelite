---
phase: 34-formula-reactivity
plan: 08
subsystem: custom-fields
tags: [tdd, formula, jsonb, ui-write-path, sc-4, t-34-04, d-06, security]

# Dependency graph
requires:
  - plan: 34-03
    provides: recalculateFormulas and stripFormulaKeys
  - plan: 34-04
    provides: the cascade that recalculateFormulas now performs by default
provides:
  - "saveFieldValues — the UI write path — now strips client-posted formula keys, carries over stored formula wrappers, diffs against a pre-image and recalculates"
  - "diffChangedFields / stableStringify — deep, key-order-independent change detection for a full-replacement JSONB blob (module-private)"
  - "src/lib/custom-fields.test.ts — the module's first test file (22 tests)"
affects: [34-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-image diff for full-replacement blobs: post-strip values vs the stored non-formula keys, deep-compared via a key-sorted JSON.stringify replacer"
    - "Strip-then-carry-over: client formula keys removed, stored formula keys re-added from the pre-image, so a whole-blob replacement cannot delete derived values"
    - "Recalculation is called WITHOUT `row` when the caller holds only the JSONB blob, so the helper's own primary-key lookup supplies the native attributes"

key-files:
  created:
    - src/lib/custom-fields.test.ts
  modified:
    - src/lib/custom-fields.ts

key-decisions:
  - "`row` is deliberately omitted from the recalculateFormulas input. The plan's point 8 escape hatch applies: getFieldValues selects only `customFields`, so a hand-built row would carry no native attributes and would fabricate 'Unknown field' errors on any formula reading {{Value}}, {{Title}} etc. The helper's own lookup runs after the UPDATE, so it sees both the persisted blob and the real columns"
  - "The diff compares the STRIPPED posted blob against the pre-image's NON-formula keys only, so a client poking a formula key can neither write it nor force a recalculation through it"
  - "Deep comparison uses JSON.stringify with a key-sorting replacer rather than a dependency; a sentinel string distinguishes `undefined` from a JSON-unrepresentable value"
  - "No crmBus event added — this route has never emitted one; adding it would start firing workflows on every custom-field edit, a side-effecting behaviour change outside this phase"

patterns-established:
  - "Pattern: prove SC-4 with `toEqual([])` on changedFields rather than with values — five diff tests assert an empty changed-key list"

requirements-completed: [FORMULA-01, FORMULA-02]

# Metrics
duration: 5min
tasks_completed: 2
files_changed: 2
tests_added: 22
completed: 2026-08-14
---

# Phase 34 Plan 08: UI Custom-Field Save Path Summary

**`saveFieldValues` — the single most-used write path in the application — now reads a pre-image, discards client-posted formula values, carries the stored ones over, diffs precisely, persists and recalculates, closing both the D-02 coverage gap and the T-34-04 tampering hole on the path that matters most.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-08-14T22:46:46Z
- **Completed:** 2026-08-14T22:51:13Z
- **Tasks:** 2 (TDD: RED then GREEN)
- **Files changed:** 2

## Task Commits

1. **Task 1 RED — the first test file for the custom-fields module** — `704c571` (test)
2. **Task 2 GREEN — pre-image diff, formula-key stripping and recalculation** — `871a0cf` (feat)

No refactor commit: the GREEN implementation needed no cleanup pass.

## What Changed

`saveFieldValues(entityType, entityId, values)` keeps its exported signature and its
`{ success, error? }` return shape — `src/app/api/custom-fields/save/route.ts:24` returns it
verbatim to the browser and is **untouched** (`git diff --name-only` on it is empty). Its body is
now:

1. Validate (unchanged, still short-circuits before any read or write).
2. One `getActiveFieldDefinitions` call, reused for the strip, the diff and `definitionsCache`.
3. `getFieldValues` for the pre-image (no new query shape).
4. `stripFormulaKeys(values, definitions)` — **T-34-04**.
5. `next = { ...formulaKeysFromPreImage, ...posted }` — **D-06 / T-34-20**.
6. `changedFields = diffChangedFields(posted, preImageNonFormulaKeys)` — **FORMULA-02 / SC-4**.
7. `db.update(...).set({ customFields: next, updatedAt: new Date() })` — the `updatedAt` bump is
   kept; this is a genuine user edit, unlike the recalculation's own write.
8. `recalculateFormulas({ entityType, entityId, changedFields, definitionsCache })` in a
   try/catch that logs with a `[formula-recalc]` prefix and continues — **D-05**.

## The Two Security-Relevant Behaviours, and How They Are Pinned

**T-34-04 — a client can no longer write a derived field.** `CustomFieldsSection` posts
`{ ...localValues, [field]: value }`, which *includes* the formula key, so before this change any
authenticated user could POST `Margin: 999999` and have it stored as the field's value. Two tests
pin the fix: posting `{ Price: 100, Margin: 999999 }` persists `Margin` as the *stored wrapper*
`{ formula: true, value: 60, error: null }` and never `999999`; and `Margin` does not appear in
`changedFields`, so poking the formula key cannot even force a recalculation.

**T-34-20 — stripping must not become deletion.** The post is a full replacement blob, so a naive
strip would wipe every formula value on every save. Two tests pin the carry-over: a post omitting
`Margin` still persists the stored wrapper, while a post omitting the *non-formula* `Origem` does
remove it (the UI blob stays authoritative for keys the user owns).

## SC-4 Is Proven by an Empty Changed-Key List

Five diff tests assert `changedFields` directly:

| Posted against the stored `{ Price: 100, Origem: ['Outbound Manual'], Margin: <wrapper> }` | `changedFields` |
|---|---|
| identical non-formula values | `[]` |
| `Price: 200` | `["Price"]` |
| `Origem` omitted | `["Origem"]` — a deletion is a change |
| a brand-new `Observacao` key | `["Observacao"]` |
| a structurally equal but distinct `['Outbound Manual']` array | `[]` |
| `['Outbound Manual', 'Inbound']` | `["Origem"]` |
| `Meta: { b: 2, a: 1 }` against stored `{ a: 1, b: 2 }` | `[]` |

The array case is the one that matters operationally: `multi_select` is the commonest field type
in this database and its values are arrays, so reference comparison would have marked every such
field changed on every save and silently defeated SC-4 across the board.

## D-18 Compliance on This Path

This module never calls `evaluateFormula` — it reaches the sandbox only through
`recalculateFormulas`, which passes the resource bounds on every call (proven and
mutation-checked in plan 34-03). A source-scan test enforces the delegation: `custom-fields.ts`
must not match `/evaluateFormula/` or `/formula-engine/`, and must match both helper names. If a
future edit inlines an engine call here, that test fails.

## Verification

| Gate | Result |
|---|---|
| `npx vitest run src/lib/custom-fields.test.ts src/lib/formula-recalc.test.ts` | exit 0 — **91 passed** (22 + 69) |
| `npm test` | exit 0 — 45 files, **604 passed / 4 skipped** (baseline 44 files, 582/4; +22 = exactly the new tests, 0 regressions) |
| `npx tsc --noEmit` | exit 0 |
| `npx eslint src/lib/custom-fields.ts src/lib/custom-fields.test.ts` | exit 0 — **0 errors**, 1 pre-existing warning (`FieldConfig` unused, present before this plan) |
| `git diff --name-only -- src/app/api/custom-fields/save/route.ts` | **empty** — the route is unchanged |
| `git diff --name-only -- src/lib/formula-recalc.ts` | **empty** — this plan consumes the helper |
| Test-shape guard (`>=15` tests + `invocationCallOrder`) | `shape OK 22` |
| Wiring guard (both helpers present in non-comment source) | `wired OK` |
| `git diff --stat -- package.json package-lock.json` | **empty** — zero new dependencies (T-34-SC) |

### The RED gate failed for the right reason

17 failed / 5 passed. Every failure is an `AssertionError` — no module-resolution error and no
mock-chain `TypeError`. The 5 that passed at RED are the ones that must hold in both states:
`updatedAt` is bumped, validation short-circuits, and the three `getFieldValues` /
`getFieldsWithValues` smoke tests. The `recalcInput()` helper asserts the call happened before
reading it, specifically so a missing call surfaces as a readable assertion rather than a
`Cannot read properties of undefined` from the harness.

### The new import cycle was smoke-tested for real

`custom-fields.ts` now imports `formula-recalc.ts`, which already imported
`getActiveFieldDefinitions` from `custom-fields.ts` — a genuine ESM cycle. It is safe by
construction (every binding involved is a hoisted `export function` / `export async function`,
and neither module reads the other at module-evaluation time), but "safe by construction" was not
taken on trust: a temporary test file importing **both modules unmocked** was run
(`1 passed`, both namespaces fully initialised, `stripFormulaKeys` callable) and then deleted
before staging. It is not in either commit and `git status --porcelain` is clean. The cycle is
also documented in a comment above the import so a future reader does not "fix" it blindly.

## Deviations from Plan

**1. [Decision] `row` is omitted from the `recalculateFormulas` input**

- **Found during:** Task 2
- **Issue:** The plan's `must_haves` mentions passing the persisted blob as `row.customFields`,
  but its Task 2 action (point 8) explicitly authorises omitting `row` when supplying native
  attributes would need a row read the function does not already perform. That is exactly the
  case here: point 3 mandates reading the pre-image via `getFieldValues`, which selects **only**
  `customFields`. A row built from it would carry no `title`, `value`, `notes` or
  `expectedCloseDate`, so every formula referencing a native attribute would store a fabricated
  `Unknown field` error.
- **Resolution:** `row` is left undefined. `recalculateOneEntity` then runs
  `loadRow(entityType, entityId)` itself — **after** our `UPDATE` (pinned by the
  `invocationCallOrder` test), so it reads both the freshly persisted blob and the real columns.
  Cost is one extra primary-key lookup. A dedicated test asserts `row` is undefined with the
  reasoning in a comment, so this cannot be "optimised" back into a bug.
- **Files modified:** none beyond the plan's list.
- **Commit:** `871a0cf`

**2. [Rule 2 - Missing critical functionality] Added a D-18 delegation source-scan test**

- **Found during:** Task 1
- **Issue:** The plan's behaviour list does not include a D-18 assertion for this path, because
  this module does not call the engine. But D-18 is marked BLOCKING for every call site, and
  nothing structurally prevented a future edit from inlining an `evaluateFormula` call here
  without the 4th argument.
- **Fix:** A source-scan test asserts `custom-fields.ts` matches neither `/evaluateFormula/` nor
  `/formula-engine/`, and does match both `recalculateFormulas` and `stripFormulaKeys`.
- **Commit:** `704c571`

No Rule 1 (bug), Rule 3 (blocking) or Rule 4 (architectural) deviations. No packages installed —
`node_modules` was symlinked from the main checkout and is gitignored. No database row was read
or written; the suite is DB-free via `vi.mock("@/db")`.

## Threat Model Coverage

| Threat | Disposition | Status |
|---|---|---|
| T-34-04 Tampering — client-posted formula key | mitigate | **Closed on this path.** `stripFormulaKeys` applied before persistence; stored wrapper carried over; two dedicated tests. |
| T-34-20 Tampering — whole-blob replacement wiping derived values | mitigate | Carry-over implemented and pinned by two tests (formula key omitted -> preserved; non-formula key omitted -> removed). |
| T-34-21 EoP — no per-entity ownership check on this route | accept | Unchanged and **not widened**: this plan strictly reduces what a caller can write. Still `auth()`-only with no ownership check on `entityId` — pre-existing since the custom-fields feature shipped. Backlog item for plan 34-11. |
| T-34-03 DoS — recalculation on every UI field edit | mitigate | Pre-image diff yields a precise `changedFields`; deep array comparison specifically so `multi_select` fields do not appear changed on every save. |
| T-34-17 Repudiation — recalculation failure visibility | mitigate | Rejections logged with a `[formula-recalc]` prefix including `entityType`/`entityId`; save still returns success (D-05). Identifiers only, no field values — consistent with T-34-06. |
| T-34-02 DoS — unbounded formula CPU | mitigate | By delegation: this module never calls the engine, enforced by the source-scan test. |
| T-34-SC Tampering — npm installs | accept | Zero new packages. |

**Threat surface scan:** no new endpoint, auth path, file access, or schema change. The one write
is the pre-existing `UPDATE ... SET custom_fields, updated_at` keyed by primary key through a
parameterised Drizzle `eq`. Nothing to flag.

## Known Stubs

None. No placeholder values, hardcoded empties feeding UI, or TODO/FIXME markers were introduced.

## Known Limitations (deliberate, not defects)

- **`POST /api/custom-fields/save` still emits no `crmBus` event.** No webhook and no workflow
  fires for a UI custom-field edit, before or after this plan. Adding one would start firing
  workflows on every custom-field edit — a side-effecting behavioural change outside this
  phase's boundary. The omission is now stated in a code comment above `saveFieldValues` so it
  reads as deliberate. **Plan 34-11 should document this as a known limitation.**
- **No ownership check on `entityId`** (T-34-21) — pre-existing, unchanged, for plan 34-11's
  backlog.
- **The recalculation is a second `UPDATE` outside any transaction** (T-34-11, inherited from
  plan 34-03). Self-healing on the next save.
- **A non-formula key the UI does not know about is dropped.** The posted blob is authoritative
  for non-formula keys by design (`CustomFieldsSection` round-trips the whole blob), so a key
  written by another path and absent from the browser's `localValues` is removed. This is the
  pre-existing whole-blob-replacement semantic, unchanged here; only formula keys were made
  exempt.

## Next Phase Readiness

- **The D-02 coverage gap is closed for write path #1.** `saveFieldValues` is the highest-traffic
  entry point in the inventory and now recalculates, scoped.
- **For plan 34-11:** record two items — the absent `crmBus` event on this route, and T-34-21's
  missing ownership check.
- **For other write-path plans (34-06, 34-07, 34-09, 34-10):** the strip-then-carry-over shape
  here is the reference for any path that replaces the whole blob rather than merging. Paths that
  shallow-merge (the mutation layer, per plan 34-02) need the strip but not the carry-over.
- `.planning/STATE.md` and `.planning/ROADMAP.md` were intentionally not modified — Phase 34's
  wave bookkeeping is maintained by the orchestrator, and this executor ran in a parallel
  worktree alongside plans 34-06, 34-07 and 34-12.

## Self-Check: PASSED

Files verified present on disk:
- `src/lib/custom-fields.ts` — FOUND (278 lines)
- `src/lib/custom-fields.test.ts` — FOUND (416 lines, 22 tests; `min_lines` was 120)

Commits verified in `git log`:
- `704c571` — FOUND (test)
- `871a0cf` — FOUND (feat)

RED-before-GREEN ordering verified: `704c571` is the parent of `871a0cf`.
No file deletions in either commit (`git diff --diff-filter=D` empty for both).
No untracked files left behind after the temporary cycle smoke test was removed.
Only this plan's `files_modified` were touched: `git diff --name-only 0682ca5..HEAD` lists exactly
`src/lib/custom-fields.ts` and `src/lib/custom-fields.test.ts`.

## TDD Gate Compliance

Gate sequence satisfied: `test(34-08)` `704c571` (verified failing — 17 assertion failures, 5
must-hold-in-both-states tests passing) -> `feat(34-08)` `871a0cf` (22/22 pass). No REFACTOR gate
was needed.

---
*Phase: 34-formula-reactivity*
*Completed: 2026-08-14*
