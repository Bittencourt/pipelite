---
phase: 44-custom-field-ui-repair
plan: 06
subsystem: admin-custom-fields
tags: [rsc, react-flight, radix-ui, asChild, custom-fields, client-boundary, CFUI-01]

# Dependency graph
requires:
  - phase: 44-custom-field-ui-repair
    plan: 01
    provides: "the base/rsc vitest split and rsc-boundary.test.tsx, which this plan appends its structural gates to"
  - phase: 44-custom-field-ui-repair
    provides: "44-RESEARCH Fix 1 (the prescriptive wrapper shape) and D-44-01 (structural repair, not the slim projection)"
provides:
  - "src/app/admin/fields/[entityType]/add-field-button.tsx — AddFieldButton and RestoreFieldButton client wrappers"
  - "A page.tsx that renders no FieldDialog: only strings and data cross the RSC boundary"
  - "The structural half of SC-5/SC-6 as executable gates (5 assertions)"
  - "A repo-wide class gate: every user of a children-forwarding asChild component must be a client module"
affects:
  - "44-08 payload projection — it changes the availableFields prop type on AddFieldButton (signature recorded below)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client trigger wrapper: a 'use client' module owns the trigger element so no React element is ever serialized into an asChild slot"
    - "Server resolves i18n (getTranslations) and passes label strings as props — the i18n call stays in one place and the payload stays smaller"
    - "Structural source-read gates with mandatory comment-stripping, so a negative assertion cannot be invalidated by prose"
    - "Class-wide repo scan derived from the defect's mechanism, not its location"

key-files:
  created:
    - "src/app/admin/fields/[entityType]/add-field-button.tsx"
  modified:
    - "src/app/admin/fields/[entityType]/page.tsx"
    - "src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx"

key-decisions:
  - "Moved BOTH trigger sites, not just the header — the archived-field Restore trigger at page.tsx:78 has the identical defect and is unobservable today only because deal has no archived definitions"
  - "The structural gate is 'page.tsx contains no <FieldDialog', not a header-only assertion, so the restore site cannot regress independently"
  - "availableFields stays the full CustomFieldDefinition[] — the slim projection still defers at n=155 (44-01 assertion 3), so shipping it here would blur the causal story; deferred to 44-08 as an optimisation"
  - "Test files are excluded from BOTH halves of the class-wide scan: they are not part of the RSC graph and they quote the searched patterns as literals, including the scanning file itself"
  - "The authorization gate stays wholly in page.tsx and is asserted in both directions (present on the server, absent in the client wrapper)"

patterns-established:
  - "When the mechanism of a bug is general, gate the mechanism repo-wide, not the one file where it was found"
  - "Assert security invariants in both directions: the control must still exist where it belongs AND not exist where it would be advisory"

requirements-completed: [CFUI-01]

# Metrics
duration: 12min
completed: 2026-08-15
---

# Phase 44 Plan 06: The CFUI-01 Structural Repair Summary

**`page.tsx` no longer renders `FieldDialog` at all — both the header Add Field trigger and the archived-field Restore trigger are now created inside a `'use client'` wrapper, so no React element crosses the RSC boundary into Radix's `asChild` slot at any definition count.**

## The repair

`/admin/fields/deal` had no UI path to create a custom field. `page.tsx` is a server component; rendering `<FieldDialog availableFields={activeFields}><Button/></FieldDialog>` there put 155 definition rows and an element in one props object. Past React Flight's 3200-byte row budget the serializer defers the next value into its own row and substitutes `"$L19"`; `SlotClone` behind `asChild` sees a non-element, returns `null` — no throw, no warning — and the button ceases to exist.

The fix moves the trigger construction client-side, making the composition client-to-client so the element is never serialized. This is the shape `src/app/workflows/new-workflow-button.tsx` already uses and the reason `fields-list.tsx` renders the same 155 rows correctly today.

### Prop signatures (44-08 changes the first one)

```tsx
AddFieldButton({ entityType: EntityType, availableFields: CustomFieldDefinition[], label: string })
RestoreFieldButton({ entityType: EntityType, field: CustomFieldDefinition, label: string })
```

`availableFields` is deliberately still the **full** `CustomFieldDefinition[]`. 44-08 narrows it; the type is declared in a named `AddFieldButtonProps` interface with a comment pointing at D-44-01 so the change lands in one place.

## Both trigger sites moved, not one

The plan's non-negotiable, and the reason the gate is written as *"`page.tsx` contains no `<FieldDialog`"* rather than a header assertion:

| Site | Before | After |
|---|---|---|
| header (`page.tsx:46`) | `<FieldDialog availableFields={155 rows}><Button/></FieldDialog>` | `<AddFieldButton … label={t('addField')} />` |
| archived rows (`page.tsx:78`) | `<FieldDialog field={…}><Button variant="ghost"/></FieldDialog>` | `<RestoreFieldButton … label={t('restore')} />` |

`serializedSize` accumulates across the whole Flight row, so on a 155-definition entity the budget is long gone before the serializer reaches the archived section. The restore triggers were already broken; `deal` simply has no archived definitions today. A header-only gate would have shipped that.

Nothing else in `page.tsx` changed: the `auth()` guard, both `notFound()` calls, the entity-type validation, `getAllFieldDefinitions`, the active/archived split, the `FieldsList` render and all layout markup are byte-identical.

## The gates

### Task 1 — structural + authorization (`e8b02c8` RED, `5c8cbea` GREEN)

Five assertions appended to `rsc-boundary.test.tsx`, all source reads **with comments stripped before matching**. Comment-stripping is not cosmetic here: every assertion that matters is a negative one, and a negative source assertion is trivially invalidated by a comment mentioning the old code — exactly the self-invalidating gate that lets a regression back in. (`add-field-button.tsx`'s own header comment explains the whole mechanism and would have defeated an unstripped `not.toContain('auth(')`.)

| Assertion | Guards |
|---|---|
| `page.tsx` contains no `<FieldDialog` | both trigger sites, SC-5 structural half |
| `page.tsx` contains `<AddFieldButton`, `<RestoreFieldButton`, `from './add-field-button'` | the replacement is real, not a deletion |
| wrapper starts with `'use client'`, exports both functions, contains `<FieldDialog` | the dialog moved rather than vanished — keeps the gate non-vacuous |
| `page.tsx` retains `await auth()`, `session.user.role !== 'admin'`, `notFound()` | T-44-19, the gate stayed server-side |
| wrapper contains no `auth(`, no `session`, no `\brole\b` | T-44-19, no authz decision became advisory client-side |

### Task 2 — the class-wide gate

The rule RESEARCH derived is broader than one call site, so the gate is too. It walks `src/**/*.tsx`, collects files containing `asChild>{children}`, derives their `export function <Name>` components, re-walks for `<Name` usages, and requires every usage file to be the definer or a client module.

Measured on the repaired tree — both halves non-vacuous, which is asserted, not assumed:

```
scanned tsx files: 193
definers:   field-dialog.tsx, workflows/create-workflow-dialog.tsx
components: FieldDialog, CreateWorkflowDialog
FieldDialog        -> add-field-button.tsx (CLIENT), fields-list.tsx (CLIENT)
CreateWorkflowDialog -> new-workflow-button.tsx (CLIENT)
```

## The gates were proven discriminating by the RED run, not by a synthetic mutation

Run against the unrepaired `page.tsx` before any implementation existed:

```
5 failed | 4 passed
× page.tsx renders no <FieldDialog anywhere            expected '…<FieldDialog…' not to contain
× every user of a children-forwarding component…       expected [ Array(1) ] to deeply equal []
```

The class-wide scan independently identified **`page.tsx` as the sole offender in 193 files** with no knowledge of where the bug was — stronger evidence than the fixture mutation 44-01 used, because the offender was found rather than planted.

## Deviations from Plan

### Notes, not deviations

- **Task 2's describe block was committed in Task 1's RED commit** (`e8b02c8`) rather than in a commit of its own. The two blocks share `stripComments` and `isClientModule`; splitting them would have meant committing a half-defined helper set. Task 2 therefore produced no further file change — its verification was run against the same file. The TDD ordering that matters was preserved: the class-wide gate was RED (1 offender) before the implementation and green after.
- **Test files are excluded from the class-wide scan**, beyond the plan's `node_modules` / `.next` / `.claude` exclusions. Two independent reasons: test files are not part of the RSC component graph (nothing renders them on a server), and they quote the searched patterns as string literals — `rsc-boundary.test.tsx` itself contains both `asChild>{children}` and `<FieldDialog` as needles and would register as a definer *and* a non-client offender. The exclusion is documented in the test file next to the predicate.
- **No packages installed.** `package.json` untouched.
- **No file owned by the concurrent 44-07 executor was staged.** Both commits used explicit pathspecs; `custom-fields-section.tsx` and its test were modified and even *staged* by the sibling during this run and are absent from both commits (verified with `git show --stat`).

## Verification

| Gate | Result |
|---|---|
| `npx vitest run rsc-boundary` | **9/9 green** (3 pre-existing + 6 new) |
| `npx vitest run --config vitest.rsc.config.ts` | **4/4 green** — 44-01's Flight serializer gate unaffected |
| `npx vitest run` (base project) | **863 passed, 0 failed** |
| `npx tsc --noEmit` | **exit 0** |
| `npx eslint src/app/admin/fields` | **0 errors**; the 3 warnings are pre-existing in `actions.ts` / `field-dialog.tsx`, untouched |
| class-wide scan non-vacuity | 193 files, 2 definers, 2 components, 3 usages, all CLIENT |

Base-project count is 863 rather than 843 + 6 because sibling plan 44-07 committed tests into the same working tree during this run.

## Threat Model Coverage

| Threat | Disposition | How it landed |
|---|---|---|
| T-44-19 (EoP — authz moving client-side) | mitigate | `auth()` + role check + `notFound()` are byte-identical in `page.tsx`; asserted present there and absent from the wrapper. The wrapper renders only if the server already decided to render it |
| T-44-20 (DoS — the dropped trigger) | mitigate | Structural: no element crosses the boundary, so deferral cannot apply at any definition count. Gated by `no <FieldDialog in page.tsx` plus 44-01's serializer assertion 4 |
| T-44-21 (DoS — recurrence elsewhere) | mitigate | The repo-wide scan fails if any server component renders a children-forwarding `asChild` component, including in a file nobody thought to look at |
| T-44-22 (Info disclosure — 155 rows to the browser) | transfer | Unchanged and admin-only, as planned. Reduced in 44-08 |
| T-44-SC (package installs) | mitigate | Zero packages installed; `package.json` unchanged |

## Known Stubs

None. Both wrappers are complete and wired; no placeholder values, no empty-data paths.

## Self-Check: PASSED

- `src/app/admin/fields/[entityType]/add-field-button.tsx` — FOUND
- `src/app/admin/fields/[entityType]/page.tsx` — FOUND, renders no `FieldDialog`
- `src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx` — FOUND, 9 tests
- commit `e8b02c8` (test, RED) — FOUND in `git log`
- commit `5c8cbea` (feat, GREEN) — FOUND in `git log`
- TDD gate sequence: `test(44-06)` precedes `feat(44-06)` — compliant
