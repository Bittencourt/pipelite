---
phase: 37-trash-restore
plan: 02
subsystem: trash
tags: [trash, input-validation, audit, presenter, pure-module]
requires: []
provides:
  - "src/lib/trash/entity-types.ts — TRASH_TABS, TrashTab, TRASH_TAB_TO_ENTITY, ENTITY_TO_TRASH_TAB, TRASH_PRUNE_ORDER, TRASH_PARENTS, parseTrashTab, parseTrashPage, isTrashEntityType"
  - "src/lib/trash/present.ts — DeletedByRow, DeletedByPresentation, presentDeletedBy"
affects:
  - "every later 37-* plan that reads ?type=/?page= or renders a deleted-by cell"
tech-stack:
  added: []
  patterns:
    - "closed-literal allow-list validated before a value reaches a SQL predicate (assemble.ts assertEntityType posture)"
    - "digits-only regex before Number(), then Number.isSafeInteger, then clamp (retention-form.tsx parseDays posture)"
    - "exhaustive switch with a `const unhandled: never` guard (audit-entry.tsx)"
    - "type-only schema import to keep a shared module browser-safe"
key-files:
  created:
    - src/lib/trash/entity-types.ts
    - src/lib/trash/entity-types.test.ts
    - src/lib/trash/present.ts
    - src/lib/trash/present.test.ts
  modified: []
decisions:
  - "parseTrashPage clamps above at 200 rather than rejecting an out-of-range page: an over-large ?page= is a bounded empty result, not an error surface"
  - "A non-safe-integer digit run (e.g. 40 nines) clamps to the maximum rather than falling back to page 1 — it is an over-large page, not an unparseable one"
  - "parseTrashTab does not trim, lowercase or singularise before matching: a parser that repairs input is a parser that can be steered"
  - "The api_key and import presentations carry no name field at all, rather than an always-null one — the plan corrects 37-UI-SPEC's 'the key name beside it when known', which this schema can never satisfy"
  - "presentDeletedBy returns data, not JSX and not message keys; the consuming cell reuses Phase 36's audit.actorKind.* keys per UI-SPEC § Reused keys"
metrics:
  duration: ~25 min
  tasks: 2
  files: 4
  tests-added: 100
  completed: 2026-08-16
---

# Phase 37 Plan 02: Trash Entity Vocabulary and Deleted-By Presenter Summary

Two pure, database-free modules: the closed `?type=`/`?page=` allow-list that keeps an
attacker-controlled URL out of every trash SQL predicate, and a total function from a joined
`audit_log` row (or its absence) to a renderable deleted-by presentation that keeps "not recorded"
distinct from "unknown user".

## What Was Built

### `src/lib/trash/entity-types.ts` (Task 1)

The vocabulary layer for the whole trash surface. Two deliberately different string sets live here:
the **plural** tab values (`deals`, `people`, `organizations`, `activities`) that appear in `?type=`
and are attacker-controlled, and the **singular** `EntityType` literals that reach the database.
Crossing between them is always a frozen-map lookup, never a string transform, so there is no path
where an arbitrary URL fragment becomes an entity type by concatenation or by stripping a trailing
`s`.

- `parseTrashTab` compares the raw value against the four `TRASH_TABS` literals by identity and
  returns `"deals"` for anything else. It does **not** trim, lowercase or singularise first — the
  near-misses (`deal`, `DEALS`) are exactly the inputs a lenient parser would "helpfully" repair,
  and repair is steerable. Repeated params (`?type=a&type=b`) take the first element and face the
  same allow-list.
- `parseTrashPage` runs `/^\d+$/` on the trimmed value **before** `Number()`, which is what rejects
  `1.5`, `1e9`, `-4`, `Infinity` and the empty string (all of which `Number()` alone accepts or
  coerces to `0`), then `Number.isSafeInteger`, then clamps to `[1, 200]`.
- `TRASH_PRUNE_ORDER` is a literal array in leaves-first order (`activity, deal, person,
  organization`) rather than derived from object keys, so the purge cascade's correctness does not
  depend on the incidental order somebody typed an object literal in.
- `TRASH_PARENTS` gives `organization` an empty array, which is the single place that says the
  linked-in-trash badge never renders on the Organizations tab.
- The only import is `import type { EntityType }`, erased at compile time, so the module stays
  importable from a `"use client"` component without pulling `pg` into the browser bundle.

### `src/lib/trash/present.ts` (Task 2)

`presentDeletedBy(row | undefined)` → a discriminated union on `kind`. The two contracts that matter
are a discrimination and a refusal:

- **The discrimination.** `undefined` (no `audit_log` row was found for this record) returns
  `{ kind: "notRecorded" }`, which is a different fact from `{ kind: "unknownUser" }` (a user did
  this and the joined user row is gone). This is 100% of the current live dataset, and collapsing
  the two into one string is the repudiation risk T-37-REP2.
- **The refusal.** The `actorKind === "user"` test comes *before* the `actorId`/`actorEmail` guard,
  which is what stops an `api_key` row — where `actor_user_id` holds the key's **owner**, not the
  actor — from being attributed to that person. `api_key` and `import` therefore return bare kinds
  with no name field at all.

`workflow_run` carries its three nullable parts through unchanged rather than collapsing them, so
the presenter never has to know about hrefs and the cell can render the kind label alone when the
workflow is gone. A sixth actor kind is a compile error via the `const unhandled: never` guard.

## Task Commits

| Task | Gate | Commit | Message |
|------|------|--------|---------|
| 1 | RED | `e6dc846` | test(37-02): add failing tests for the trash entity vocabulary |
| 1 | GREEN | `ade15fb` | feat(37-02): add trash tab vocabulary and search-param parsers |
| 2 | RED | `df269e8` | test(37-02): add failing tests for the deleted-by presenter |
| 2 | GREEN | `3fd43c3` | feat(37-02): add the deleted-by presenter with notRecorded discrimination |

## TDD Gate Compliance

Both tasks ran a real RED gate: each test file was committed while its module did not exist, and
each RED run failed with `Cannot find module` before the implementation commit. `test(...)` precedes
`feat(...)` for both tasks in `git log`. No REFACTOR gate was needed — neither module required
cleanup after GREEN.

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run src/lib/trash/entity-types.test.ts` | 77 passed (plan required ≥10) |
| `npx vitest run src/lib/trash/present.test.ts` | 23 passed (plan required ≥10) |
| `npm run typecheck` | exit 0 |
| `npm run lint` | 0 errors, 0 new warnings (125 pre-existing warnings unchanged; none in `src/lib/trash`) |
| `npx vitest run` (default project) | 1437 passed |
| `npx vitest run --config vitest.rsc.config.ts` | 8 passed |
| `grep -c 'from "@/db"' entity-types.ts` | 0 |
| `grep -c 'from "@/db"\|from "react"' present.ts` | 0 |
| `grep -c 'apiKeyName' present.ts` | 0 |
| `grep -c 'never' present.ts` | 2 (includes the exhaustiveness guard) |
| `TRASH_PRUNE_ORDER` literal order | `activity, deal, person, organization` |

Threat-register coverage: **T-37-03** is proven by 15 hostile `?type=` inputs (including
`deals'; DROP TABLE deals--`, `../../etc/passwd` and `__proto__`) each asserted twice — once for the
`"deals"` fallback and once for membership in `TRASH_TABS`. **T-37-02** is proven by the upper-clamp
cases (`201`, `99999999`, forty nines). **T-37-REP2** is proven by a direct `notRecorded.kind !==
unknownUser.kind` inequality. **T-37-09** is proven by asserting the api-key presentation's
serialisation contains neither the joined user's name nor their email.

## Deviations from Plan

**1. [Rule 2 - Missing edge case] Non-safe-integer page numbers clamp up, not down**

- **Found during:** Task 1 GREEN
- **Issue:** The plan's ordering ("digits-only, then `Number.isSafeInteger`, then clamp") leaves the
  `Number.isSafeInteger` failure branch unspecified. A forty-digit run of nines passes the regex but
  loses precision.
- **Decision:** Return the maximum (200) rather than the minimum (1). A digit string that large is
  unambiguously an over-large page, and returning page 1 would silently serve the *first* page to a
  caller who asked for a nonexistent deep one — a wrong answer rather than a bounded empty one.
- **Files:** `src/lib/trash/entity-types.ts`
- **Commit:** `ade15fb`

**2. [Documented correction, not a code deviation] `37-UI-SPEC` § "Deleted by" is under-delivered on
purpose**

The spec says an `api_key` actor renders "the key name beside it when known". It is never knowable:
`audit_log` has `actor_user_id`, `workflow_run_id` and `import_session_id` and no api-key reference
at all. The plan anticipated this and the presenter carries no name field for that kind. Recording a
key id on the audit row is a schema change and belongs to a plan willing to make it. The same applies
to `import`, where every `runWithActor({ kind: "import" })` call site passes a null session id.

## Deferred Issues

**Flaky pre-existing perf test — `src/lib/execution/condition-evaluator.test.ts:616`**

`"scales linearly, not quadratically, with path length"` failed once during the first full `npm test`
run of this plan (ratio 15.57 against a `< 10` threshold), then passed on an immediate re-run of the
full suite and again in isolation. The test measures a scaling ratio under parallel suite load and is
unrelated to this plan — neither file this plan created is imported by it, and the plan touched
nothing in `src/lib/execution`. Out of scope per the executor scope boundary; logged here rather than
fixed. Worth a threshold review by whoever owns that file if it recurs.

## Notes for Later Plans

- Import the parsers, never re-parse. `parseTrashTab` is the *only* sanctioned path from `?type=` to
  an `EntityType`, and its doc comment says so. A later plan that writes its own ternary against
  `searchParams.type` re-opens T-37-03.
- `presentDeletedBy` carries **no** translation keys by design. The cell picks them, and per
  `37-UI-SPEC` § "Reused keys" it must reuse Phase 36's `audit.actorKind.*` and `audit.unknownActor`
  rather than duplicating them under `trash.*`. Only `trash.actor.notRecorded` /
  `trash.actor.notRecordedTitle` are genuinely new.
- Page size is 50 (`37-UI-SPEC` § Route and tab mechanics); the `[1, 200]` page clamp therefore
  bounds the deepest offset at 10,000 records.
- `TRASH_PARENTS.organization` being empty is the guard that keeps the linked-in-trash badge off the
  Organizations tab — check it rather than special-casing the tab in a component.

## Self-Check: PASSED

All four created files exist on disk; all four commit hashes resolve in `git log`.
