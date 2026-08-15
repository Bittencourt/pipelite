---
phase: 44-custom-field-ui-repair
plan: 08
subsystem: admin-custom-fields
tags: [rsc, react-flight, payload, custom-fields, projection, CFUI-01, D-44-02]

# Dependency graph
requires:
  - phase: 44-custom-field-ui-repair
    plan: 01
    provides: "the rsc vitest project (*.rsc.test.tsx + vitest.rsc.config.ts) this plan's measurement runs in, with no config change"
  - phase: 44-custom-field-ui-repair
    plan: 06
    provides: "the structural CFUI-01 repair and the AddFieldButton/RestoreFieldButton prop signatures this plan narrows"
provides:
  - "AdminFieldRow and AvailableField — the declared row contracts for /admin/fields/[entityType]"
  - "A page.tsx that projects once and shares one array between both consumers"
  - "available-fields-payload.rsc.test.tsx — the before/after measurement through the real Flight serializer"
  - "A source gate proving page.tsx uses that shape once, not merely that the shape is cheaper"
affects:
  - "Any future change to the admin fields route — adding a key to AdminFieldRow now ships it to every admin"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Measure an optimisation through the shipped serializer before shipping it, and assert relative facts only"
    - "Pair a shape gate (fixtures) with a source gate (the call site actually uses that shape, once)"
    - "When a narrowed type drops a field that drove a behavioural branch, replace it with an explicit prop and gate the prop"

key-files:
  created:
    - "src/app/admin/fields/[entityType]/__tests__/available-fields-payload.rsc.test.tsx"
  modified:
    - "src/app/admin/fields/[entityType]/field-dialog.tsx"
    - "src/app/admin/fields/[entityType]/fields-list.tsx"
    - "src/app/admin/fields/[entityType]/add-field-button.tsx"
    - "src/app/admin/fields/[entityType]/page.tsx"
    - "src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx"

key-decisions:
  - "Measured first, shipped second — the gate was real, and it passed decisively (45028 B -> 22353 B, -50.4%)"
  - "One shared array, never a separate slim one: the separate-array sketch measured 58681 B, a net INCREASE, because Flight back-references an array it already wrote"
  - "config stays in the projected row — the edit dialog reads select options and formula expressions from it, so it reaches the browser either way"
  - "FieldDialog's restore-vs-edit mode moved from field.deletedAt to an explicit `archived` prop, because AdminFieldRow drops the timestamp"
  - "The single-element measurement fixture is deliberate: a sibling-element fixture defers the sibling span, which is harmless, and would make the no-defer assertion claim something false"

patterns-established:
  - "An optimisation plan carries its own falsification condition: if the measurement does not improve, nothing ships"
  - "Types cannot catch a second derived array — only a source gate on the identifier can"

requirements-completed: []

# Metrics
duration: 15min
completed: 2026-08-15
---

# Phase 44 Plan 08: The Slim Projection as a Payload Optimisation Summary

**`/admin/fields/[entityType]` now projects its definition rows once into the six keys the browser
actually reads and shares that single array between both consumers, halving the Flight payload from
45,028 B to 22,353 B at n=155 — a payload optimisation that is explicitly NOT the CFUI-01 repair.**

## This is not the repair. Read the measurement, not the diff.

CFUI-01 was fixed structurally in plan 44-06: no React element crosses the RSC boundary into Radix's
`asChild` slot, at any definition count. That fix is untouched here and stays valid if every commit in
this plan is reverted. 44-01 assertion 3 still asserts that a slim `{id,name,type}` projection **still
defers at n=155** — the projection was never capable of being the repair, which is why D-44-02 framed
it as an optimisation in its own plan with its own commits.

## The measurement gate, honoured

The plan's instruction was that if the projection did not measurably shrink the payload, nothing
ships. Measured at n=155 (the live `deal` definition count) through
`next/dist/compiled/react-server-dom-webpack/server.edge.js`, the exact bundle production uses:

| Shape | Bytes | vs. shipped |
|---|---|---|
| Full rows, one shared array (**before**) | **45,028 B** | — |
| Projected rows, one shared array (**after**) | **22,353 B** | **−22,675 B (−50.4 %)** |
| Full rows + a **separate** slim `availableFields` array | 58,681 B | +13,653 B — *heavier* |
| Two full arrays, no sharing | 89,557 B | +44,529 B |

The optimisation pays off, so it shipped. The third row is the load-bearing correction the planner
made to 44-CONTEXT's original D-44-02 sketch, now measured rather than argued: `page.tsx` passes the
**same array reference** to both consumers, Flight keeps a map of already-written objects and emits a
back-reference for one it has seen, so building a *second* slim array for `availableFields` adds ~155
freshly-serialized objects on top of the full rows `FieldsList` still needs. The intuitive
"optimisation" would have made the page 30 % heavier.

## What was projected away, and what deliberately was not

`AdminFieldRow = Pick<CustomFieldDefinition, 'id' | 'name' | 'type' | 'config' | 'required' | 'showInList'>`

| Dropped | Why nothing reads it |
|---|---|
| `createdAt`, `updatedAt` | no client code on this route renders them |
| `deletedAt` | the server has already split active from archived |
| `position` | reordering posts ids only (`reorderFieldDefinitions(entityType, ids)`) |
| `entityType` | the page passes it separately as its own prop |

`config` **stays**, and that is not an oversight: the edit dialog reads select options, lookup targets
and formula expressions out of it. It reaches the browser either way, on an admin-only route.

`AvailableField = Pick<CustomFieldDefinition, 'id' | 'name' | 'type'>` is narrower still — the three
keys `field-dialog.tsx:239-256` reads for the formula editor's `{{Field}}` chips. `AdminFieldRow` is
structurally assignable to it, which is exactly what lets the one shared array satisfy both props with
no cast and no second array.

## The two gates, and why one is not enough

**Task 1 — `available-fields-payload.rsc.test.tsx` (`7ac2c63`)** proves the *shape* is cheaper. Four
assertions, all relative (smaller-than, appears-once, key-absent); absolute byte counts are printed,
never asserted, because they drift with any React or Next upgrade and would make this a flaky gate
rather than a useful one. The absent-key check runs in **both directions** — the keys must be present
before the projection, or their absence afterwards would prove nothing.

**Task 2 — the source gate in `rsc-boundary.test.tsx` (`acfc2f8`)** proves `page.tsx` actually *uses*
that shape, once. This is the half types cannot cover. A future edit could write

```tsx
availableFields={activeFields.map(f => ({ id: f.id, name: f.name, type: f.type }))}
```

which satisfies `AvailableField[]` perfectly while re-serializing 155 objects Flight can no longer
back-reference — measured at +13,653 B. Five assertions on comment-stripped source (reusing the
existing `readSource`/`stripComments` in that file, not a third implementation):

| Assertion | Guards |
|---|---|
| `availableFields?: AvailableField[]` with `AvailableField = Pick<CFD,'id'\|'name'\|'type'>` | the prop cannot silently grow back |
| exactly **one** `.map(` projection produces the admin row shape, containing all six keys | one array, one projection site |
| that projection contains none of `createdAt`/`updatedAt`/`deletedAt`/`position` | T-44-27 at the source; scoped to the map body, which is why the archived predicate may still use `deletedAt` |
| the identifier passed as `FieldsList fields` **is** the identifier passed as `AddFieldButton availableFields`, and is a bare identifier | the double-serialization regression above |
| restore-vs-edit mode comes from `archived`, and `RestoreFieldButton` sets it | see the deviation below |
| `as CustomFieldDefinition` is gone from `page.tsx` | the casts were dropped, not widened |

### Both new gates were mutation-verified, not assumed

Applied to the repaired tree before committing:

```
- removed `archived` from RestoreFieldButton
- rewrote availableFields as an inline .map(f => ({id, name, type}))
  × passes the SAME identifier to FieldsList and to AddFieldButton
  × derives restore-vs-edit mode from the explicit archived prop, and passes it
  2 failed | 12 passed
```

Both restored, 14/14 green. Note that the *single-projection* assertion did **not** fire on the
inline-`.map()` mutation (that literal carries no `showInList`), which is precisely why the
same-identifier assertion exists as a separate check rather than being folded into it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `FieldDialog` inferred its restore-vs-edit mode from a column the projection drops**

- **Found during:** Task 2
- **Issue:** `field-dialog.tsx:84-85` read `const isRestore = !!field?.deletedAt`. The plan specifies
  `field?: AdminFieldRow`, and `AdminFieldRow` has no `deletedAt` — so the narrowing does not merely
  fail to compile, it silently converts every restore prompt into an edit form for a field that is not
  editable. The plan's behaviour list ("the edit dialog's option/expression editing … still compile
  against the narrowed types") did not anticipate this coupling.
- **Fix:** Mode now comes from an explicit `archived?: boolean` prop. `RestoreFieldButton` sets it
  (`<FieldDialog … archived>`); it is the only caller that renders an archived field, so the answer is
  known at the call site without shipping a timestamp to the browser. `fields-list.tsx` receives only
  active rows and correctly leaves it unset.
- **Files modified:** `field-dialog.tsx`, `add-field-button.tsx`
- **Commit:** `a108448`

**2. [Rule 2 - Missing critical guard] Nothing would catch `archived` being dropped**

- **Found during:** Task 2, immediately after fix 1
- **Issue:** `archived` is optional, so removing it from `RestoreFieldButton` compiles cleanly, passes
  every existing test, and silently degrades the restore dialog. That is the same class of silent
  failure as the dropped trigger this entire phase exists to fix — and having just *created* the
  coupling, leaving it ungated would have been the wrong trade.
- **Fix:** A sixth source assertion in the D-44-02 block: the dialog must derive both flags from
  `archived` and must contain no `field?.deletedAt`, and the wrapper must pass `archived`.
  Mutation-verified red.
- **Files modified:** `__tests__/rsc-boundary.test.tsx`
- **Commit:** `a108448` (committed with the implementation it guards rather than as a third `test`
  commit — a test-only commit at that point would have described a tree state that did not exist)

### Notes, not deviations

- **The measurement fixture is one element, not two siblings.** A two-span page shape was written and
  measured first; it emits `"$L"` — for the *sibling span*, not for a child of an `asChild` slot, and a
  lazy in an ordinary `children` position is resolved by React without complaint (`rsc-boundary.test.tsx`
  assertion 3 isolates exactly that). Keeping it would have made the plan's no-defer assertion claim
  something false about a harmless behaviour while measuring identical bytes. The reasoning is recorded
  next to the fixture so nobody "improves" it back.
- **Fixture timestamps are real `Date`s**, unlike 44-01's `null` placeholders. Measuring the saving
  from dropping `createdAt`/`updatedAt` against `null` would have understated it.
- **The plan's verify command `vitest run --project rsc` does not work** — 44-01 shipped the *fallback*
  two-config form, not the inline `projects:` form. Used
  `npx vitest run --config vitest.rsc.config.ts` (and `npm test`, which chains both), exactly as
  44-01's SUMMARY documents. No config change was needed; the `*.rsc.test.tsx` filename was sufficient,
  as 44-01 predicted.
- **`CustomFieldDefinition` still appears in `field-dialog.tsx`** — as the source type of both `Pick`s.
  That is the point: the aliases stay bound to the schema, so a column rename breaks the build.
- **No packages installed.** `package.json` untouched.

## Verification

| Gate | Result |
|---|---|
| `npm test` (both projects, one command) | **exit 0** — base 868 passed / 4 skipped, rsc 8 passed |
| `npx vitest run --config vitest.rsc.config.ts` | **8/8** — 44-01's 4 CFUI-01 gates + this plan's 4 |
| `npx vitest run rsc-boundary trigger-child-guard` | **29/29** — 44-06's 9 gates all still green |
| `npx tsc --noEmit` | **exit 0** |
| `npx eslint src/app/admin/fields` | **0 errors**; the 3 warnings are pre-existing in `actions.ts` / `field-dialog.tsx` |
| Mutation check on both new source gates | red when mutated, green when restored |
| Regression baseline (867 across both projects) | 876, no regressions |

### 44-06's structural repair is intact

Verified directly, not assumed: `page.tsx` contains no `<FieldDialog`, both trigger wrappers are still
rendered, the `await auth()` / `role !== 'admin'` / `notFound()` gate is byte-identical and still
server-side, the wrapper still contains no authorization logic, and the class-wide scan still reports
zero offenders. All nine of 44-06's assertions pass unchanged.

### Not verified at runtime

The restore dialog's behaviour was **not** exercised in a browser. The Docker container serves a
production build rather than a dev server, so it would not pick up the change without a rebuild, and
`deal` has no archived definitions today — which is exactly why 44-06 called that trigger site
unobservable. The change is covered by `tsc` and by the source gate above; a browser pass on an entity
with an archived definition would be the stronger check if one is wanted.

## Threat Model Coverage

| Threat | Disposition | How it landed |
|---|---|---|
| T-44-27 (Info disclosure — full rows in the payload) | mitigate | `createdAt`, `updatedAt`, `deletedAt`, `position` no longer serialized. Gated twice: absent from the fixture payload (both directions), and absent from the projection body in source. `config` remains by design |
| T-44-28 (DoS — payload growth from a duplicated array) | mitigate | Single shared reference, measured: the array's row marker appears exactly once in the payload and twice when detached. The same-identifier source gate keeps it that way |
| T-44-29 (Tampering — the optimisation mistaken for the CFUI-01 fix) | mitigate | Separate plan, three separate commits, 44-01 assertion 3 (slim projection still defers at n=155) untouched and green, all nine 44-06 gates re-run and green |
| T-44-30 (EoP) | accept | No authorization surface touched; `page.tsx`'s server gate is byte-identical |
| T-44-SC (package installs) | mitigate | Zero packages installed; `package.json` unchanged |

## Known Stubs

None. Every narrowed prop is wired to a real projected array; no placeholder or empty-data path was
introduced.

## Self-Check: PASSED

- `src/app/admin/fields/[entityType]/__tests__/available-fields-payload.rsc.test.tsx` — FOUND
- `src/app/admin/fields/[entityType]/field-dialog.tsx` — FOUND, contains `AvailableField` and `AdminFieldRow`
- `src/app/admin/fields/[entityType]/page.tsx` — FOUND, one projection, no `as CustomFieldDefinition`, no `<FieldDialog`
- commit `7ac2c63` (test, measurement) — FOUND in `git log`
- commit `acfc2f8` (test, source gate RED) — FOUND in `git log`
- commit `a108448` (feat, GREEN) — FOUND in `git log`
- TDD gate sequence: both `test(44-08)` commits precede `feat(44-08)` — compliant
