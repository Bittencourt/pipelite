---
phase: 39-duplicate-detection-merge
plan: 18
subsystem: frontend
tags: [dedup, create-time-warning, custom-fields, gap-closure, rsc-boundary, source-scan-gate, vitest]
gap_closure: true
closes_gaps: [D-39-01]

# Dependency graph
requires:
  - phase: 39-08
    provides: "`readOrgIdentityFields` (fail-closed to `null`) and `findCertainOrganizationMatches`, whose `draftHasIdentityValue` gate this plan makes passable for the first time"
  - phase: 39-14
    provides: "the create-time warning itself — `DuplicateWarning`, the three-member create result, `confirmDuplicate`, and the wiring gate this plan extends"
  - phase: 39-11
    provides: "the `/duplicates` admin form that writes `dedup.organization_identity_fields`, i.e. the configuration this plan finally reads on a create surface"
provides:
  - "`selectIdentityInputFields` — the pure resolution of which configured identity labels a create-time text input may collect"
  - "`readOrgIdentityInputFields` — the fail-closed server composition, resolving `[]` on any failure"
  - "`identityFieldNames` — the label list on `DataTableProps` and `OrganizationDialogProps`, plain strings across the Flight boundary"
  - "an organization create payload that can carry `customFields`, so the organization certain tier is reachable from a real surface"
affects: [39-19, any future edit-time or importer-time organization duplicate check]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "a field-TYPE allowlist used as a data-integrity control: a label is collectable only when every active definition sharing that name is text, so a free-text input can never write a bare string under a `multi_select` or `file` blob key"
    - "inputs held OUTSIDE react-hook-form because their names are per-installation data — `zodResolver` strips keys the schema cannot declare, and RHF reads a dot in a field name as a path"
    - "a conditional spread at a single call site to keep an unconfigured payload byte-identical, rather than an always-present key defaulted downstream"
    - "call-scoped source assertions on BOTH polarities of the same token: `customFields` required inside the create call's argument text, forbidden inside both update calls' — a file-wide grep would accept either placement"

key-files:
  created:
    - src/lib/dedup/identity-inputs.ts
    - src/lib/dedup/identity-inputs.test.ts
  modified:
    - src/app/organizations/page.tsx
    - src/app/organizations/data-table.tsx
    - src/app/organizations/organization-dialog.tsx
    - src/components/dedup/__tests__/duplicate-warning-wiring.test.ts

key-decisions:
  - "only TEXT-typed configured fields render an input; every other type degrades to exactly the unconfigured behaviour, because `identityValue` returns \"\" for a non-string and a free-text write under a non-text key would corrupt what `FieldRenderer` reads back"
  - "a label whose two active definitions DISAGREE about type is dropped entirely — the blob has one key per name, so no single input shape is safe for it"
  - "the identity inputs are not react-hook-form fields and are not cleared in an effect; they ride the existing `dialogSessionKey` adjust-state-on-prop-change block, the only mechanism available under `react-hooks/set-state-in-effect`"
  - "the read lives on the PAGE render, not the submit path, so the create submit issues exactly the queries it issued before in both configurations"
  - "`customFields` is attached to the CREATE call only; the retry-after-a-failed-note update is included in the prohibition because inline edit on the detail page is the sole sanctioned writer of custom fields on a persisted record"

metrics:
  duration: ~30m
  tasks: 2
  files-changed: 6
  completed: 2026-08-19
---

# Phase 39 Plan 18: Collect the Organization Identity Fields at Create Time Summary

The admin-configured organization identity custom fields are now collectable in the Add Organization
dialog, so `draftHasIdentityValue` can pass and the organization certain tier is reachable from a
real surface for the first time.

## THIS PLAN DOES NOT CLOSE DEDUP-01

It closes D-39-01's **collection half, at the source layer**. The requirement stays OPEN until plan
39-19 observes the advisory in a browser.

This distinction is the whole lesson of the gap: plan 39-14 shipped this feature's organization half
with its own source gate green and believed DEDUP-01 satisfied. A source contract proves the wire is
connected; it cannot prove the light comes on. Every assertion added here was therefore run against a
deliberately reintroduced defect before being trusted (see Discrimination Probes below) — and even
so, the observation belongs to 39-19.

## What Was Built

**`src/lib/dedup/identity-inputs.ts`** — two exports plus the allowlisted type.
`selectIdentityInputFields(configured, definitions)` is pure and returns the collectable labels in
CONFIGURED order (which is the checking order `firstSharedIdentity` uses, so the inputs render in the
order the decision is actually made). It drops a label no active definition describes, a label whose
definitions are not all `text`, and collapses repeats — from the configured list or from two
definition rows sharing a name — to one entry per blob key, capped at `ORG_IDENTITY_FIELDS_MAX`.
`readOrgIdentityInputFields()` composes the two reads in one round trip and resolves `[]` on any
rejection.

**`src/app/organizations/page.tsx`** — a fourth entry in the existing `Promise.all`, destructured as
`identityFieldNames` and passed to `<DataTable>`.

**`src/app/organizations/data-table.tsx`** — the prop, documented in the file's established style,
and the pass-through to `<OrganizationDialog>`.

**`src/app/organizations/organization-dialog.tsx`** — `identityValues` state keyed by label, a
`handleIdentityChange` that sets the value and clears a showing advisory (W-10), a
`collectIdentityCustomFields` that trims and omits empties, one controlled `Input` per configured
label in create mode only, and the blob attached to the create call under a conditional spread.

## Every Must-Hold Condition, and How It Is Held

| Condition | How |
|-----------|-----|
| Configured text field renders an input | `{!isEditMode && identityFieldNames.length > 0 && …}` over `identityFieldNames.map`, id stem `org-identity-{index}` |
| The typed value reaches `createOrganization` as `data.customFields[label]` | `{ ...record, customFields: identityCustomFields }` on the create call; `actions.ts:105` already forwarded it, so that file is untouched |
| Unconfigured ⇒ payload byte-identical | conditional spread: with `[]` labels or all-blank inputs, `collectIdentityCustomFields()` returns `{}` and the argument is the bare `record`, no `customFields` key at all |
| Unconfigured ⇒ no warning, no error | `readOrgIdentityInputFields` returns `[]` (unconfigured *and* on failure), nothing renders, nothing is sent, and the action's own fail-closed read is unchanged |
| W-10 | `handleIdentityChange` calls `clearDuplicateWarning()`; probe (c) proves the gate sees it |
| W-4 intact | the create call still carries `confirmDuplicate: true` and is still called exactly once; the pre-existing W-4 assertion and its every-mention-inside-that-call companion both still pass |
| Edit path writes no custom fields | both `updateOrganization` calls carry zero `customFields`; probe (b) proves that negative is call-scoped |
| No state setter in any effect | the values are cleared in the `dialogSessionKey` block and in `handleClose`; the file's pre-existing no-setter-in-effect assertion still passes |
| Server/client boundary | zero occurrences of `@/lib/dedup/identity` in either `"use client"` file, comment-blind, with the page's read as the anti-vacuity partner |

## Discrimination Probes — All Three RUN, Each Failed By Name

Not reasoned about. Run, recorded, restored via `git checkout -- <file>`.

**(a) `customFields` removed from the create call's argument.** 1 failure of 23:
`the create call carries customFields, and still carries the confirm flag (anti-vacuity)` —
`AssertionError: expected '\n            record,\n            \n…' to contain 'customFields'`.

**(b) `customFields` ALSO placed on the retry-branch `updateOrganization(recordId, …)` call, create
call left intact.** 1 failure of 23:
`neither updateOrganization call writes customFields, and both calls exist (anti-vacuity)` —
`AssertionError: expected 1 to be +0 // Object.is equality`. Assertion (a)'s test still PASSED, which
is the point: the negative is scoped to a call, not a file-wide grep that both placements satisfy.

**(c) `clearDuplicateWarning()` removed from `handleIdentityChange`'s body.** 1 failure of 23:
`W-10 — editing an identity input clears a showing advisory` —
`AssertionError: expected '\n      const { value } = event.targe…' to contain
'clearDuplicateWarning'`. The quoted slice is the handler's real body, which is the evidence that
`blockAfter` extracted the right region and that the group 4/5 assertions are not vacuous.

The RED run before implementation is the fourth piece of evidence: 6 of 7 new assertions failed, and
that failure list is D-39-01 stated at the source layer (recorded verbatim in commit `e6e5155`).

## The Known Residual Asymmetry — STATED, NOT FIXED

**A configured NON-TEXT identity field silently does nothing.** The 39-11 admin form offers every
organization field label with no type filter (`identity-fields-form.tsx:124`), so an admin can
configure a `multi_select` such as `Tier`, see it saved, and never see an input for it. After this
plan, TEXT identity fields work and non-text ones do not.

This plan fails closed on purpose. `identityValue` (`matching.ts:124-128`) returns `""` unless
`typeof raw === "string"`, so a non-text value could never decide a certain match even if it were
collected — and rendering a free-text input under a `multi_select` or `file` key would CORRUPT the
blob the detail page's `FieldRenderer` has to read back. Doing nothing is the same safe direction
39-08 chose. Filtering the admin select is a separate decision the orchestrator is handling;
`identity-fields-form.tsx` and `src/app/duplicates/page.tsx` were not touched.

`single_select` and `url` store strings and are excluded too: the first is only valid against its
definition's option list and the second has its own validating component.

## Deviations from Plan

**One, and it is a scope ADDITION inside the plan's own stated rationale, not a departure.**

**[Rule 2 - Missing critical functionality] A shared label whose definitions disagree about type is
dropped.** The plan specified the duplicate-definition-name collapse (this deployment really has two
active rows sharing a name) and the type allowlist, but not their intersection: one `text` row and
one `multi_select` row under the same label. Because the blob has exactly ONE key per name, both
definitions read that key, so no single input shape is safe for it. Implemented as
`matching.every(d => d.type === "text")` rather than "the first match wins", with its own test case.
Without this, the collapse rule would have let a text row shadow a `multi_select` row and hand the
corruption path back.

Everything else was executed as written: no migration, no dependency change, no `shadcn add`, no
Docker rebuild, no edit to `organizations/actions.ts`, `identity-fields-form.tsx`,
`duplicates/page.tsx`, or any file owned by sibling plan 39-20.

**The `no new query` condition, stated explicitly rather than left as an unstated deviation:** this
plan adds a read to the `/organizations` PAGE RENDER (a fourth entry in an existing `Promise.all`, so
no additional round trip). It adds NOTHING to the submit path, which is what `39-GAPS.md`'s
"unconfigured ⇒ no new query" condition governs. The create submit issues exactly the queries it
issued before, in both configurations.

## Verification

| Gate | Result |
|------|--------|
| `npx vitest run src/lib/dedup/identity-inputs.test.ts` | 22 passed |
| `npx vitest run …/duplicate-warning-wiring.test.ts` | 23 passed (16 pre-existing + 7 new) |
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors, 125 warnings (baseline 127 — not above) |
| `npm run test` | 127 files / 2703 passed, 1 file / 21 skipped; plus the RSC project's 2 files / 8 passed (39-17 baseline was 126 / 2674 + 2 / 8) |
| `git diff -- package.json package-lock.json` | empty |
| `git diff -- .github/workflows/ci.yml` | empty |
| drizzle journal | still ends at `idx: 17`; last migration `drizzle/0017_dedup_schema.sql` |
| Docker | NO rebuild, NO container restart — the stale image is left intact so plan 39-19's RED is free |
| dev database | nothing written; no `app_settings` row touched, so the `dedup.*` row count is unchanged from what it was at dispatch |

## Threat Register Outcome

`T-39G-02` (a client widening its own duplicate check) — mitigated as designed: the rendered label
list is NEVER passed back to the action. `createOrganization` still reads the identity field list
server-side via `readOrgIdentityFields()`, and this plan added no parameter to it.
`T-39G-05` (whitespace-only values) — mitigated: `collectIdentityCustomFields` trims and omits, so a
space cannot make `draftHasIdentityValue` pass and then match nothing.
`T-39G-06` (server/client boundary) — mitigated and gated at zero, comment-blind, with an
anti-vacuity partner.
`T-39G-01` / `T-39G-03` / `T-39G-04` — accepted as dispositioned; no new control added, deliberately.

## Threat Flags

None. This plan adds no network endpoint, no auth path, no file access and no schema change. The one
new trust-boundary surface — a client-supplied `customFields` on the create payload — is
`T-39G-01`, already dispositioned `accept` in the plan's own register, on the grounds that the same
authenticated user can already write any custom field value through
`src/app/api/custom-fields/save/` one request later and `createOrganizationMutation` already strips
formula-typed keys server-side.

## Known Stubs

None. Every input rendered is wired to real state, real trimming and the real create payload. The
one thing that renders nothing — a configured non-text field — is a deliberate fail-closed
degradation documented above, not an unwired placeholder.

## For Plan 39-19

The DOM id stem for the identity inputs is `org-identity-{index}`, zero-based in configured order,
label text = the user-authored field name verbatim. The inputs appear in the Add Organization dialog
only (never the edit dialog), between Industry and Notes, and only when
`dedup.organization_identity_fields` names at least one TEXT-typed organization custom field. The
Docker image is deliberately still stale.
