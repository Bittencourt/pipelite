---
phase: 36-audit-log
plan: 13
subsystem: ui
tags: [audit, timeline, renderer, i18n, a11y, never-gate]

# Dependency graph
requires:
  - phase: 36-audit-log
    plan: 04
    provides: "the `audit.*` message namespace in all three locale files — 77 keys the renderer resolves at runtime"
  - phase: 36-audit-log
    plan: 10
    provides: "AuditTimelineEntry / AuditValue / AuditFieldChange declared but NOT joined to the union, plus collapseAndTruncate and AUDIT_FIELD_LABELS in src/lib/audit/present.ts"
  - phase: 35-record-timeline
    plan: 11
    provides: "the shared row skeleton, the dispatcher and its exhaustive `never` gate"
provides:
  - "`TimelineEntryKind` carries four kinds and `TimelineEntry` carries four members — the union is closed for this phase"
  - "`timeline-entry.tsx` has a fourth `case` and the `never` gate is intact and still armed for the kind after this one"
  - "`AuditEntry` — the whole audit row: rail, attribution line, field `<dl>`, counted disclosure, locale value formatting"
  - "`getInitials` is now an EXPORT of note-entry.tsx; the copy count in the repo stops at four"
affects: [36-17, 36-18, 36-19, 36-20]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Union-literal + dispatcher-branch land in ONE commit: the `never` gate makes them a build break apart, so a plan boundary between them would leave `tsc` red"
    - "Message keys travel in data: `AuditFieldChange.label` holds a message key for native columns and verbatim user text for custom fields, told apart STRUCTURALLY by the `custom:` prefix on `field` — never by inspecting the label's content"
    - "Locale formatting in the client, shape decision in the pure module: `present.ts` says which of nine shapes a value is, `AuditValueText` says how that shape reads in the viewer's locale"
    - "Every value branch funnels into one `collapseAndTruncate` call, including the ones that look bounded"

key-files:
  created:
    - src/components/timeline/audit-entry.tsx
  modified:
    - src/lib/timeline/types.ts
    - src/components/timeline/timeline-entry.tsx
    - src/components/timeline/note-entry.tsx

decisions:
  - "The defensive `noVisibleChanges` line renders for `created` as well as `updated` — a create with nothing recorded is the same defect wearing a different action"
  - "`getInitials` was EXPORTED from note-entry.tsx rather than extracted to a shared module: the plan sanctioned either, and exporting is a one-word diff against a file this plan otherwise does not touch"
  - "The arrow carries `mx-1` (the declared 4px xs token). JSX strips inter-element whitespace, so without it the row renders `Ana Lima→Bruno Sá` with no gap"
  - "`AuditValueText` and `AuditFieldRow` are sibling components rather than helper functions, because both need `useTranslations` / `useFormatter`"

metrics:
  duration: ~35 min
  completed: 2026-08-16
  tasks: 2
  files-changed: 4
---

# Phase 36 Plan 13: Audit Timeline Entry Summary

The audit entry now renders as a fourth kind inside the Phase 35 timeline, sharing the row
skeleton byte for byte, carrying its actor kind in a text badge rather than only in a rail
glyph, and closing the exhaustive `never` gate Phase 35 left open specifically for this phase.

## What Was Built

### Task 1 — the union join and the dispatcher branch (commit `b92690e`)

`src/lib/timeline/types.ts` gained `'audit'` on `TimelineEntryKind` and `AuditTimelineEntry`
on the `TimelineEntry` union. The three "36-13 performs the join" comments 36-10 left behind
were rewritten in the past tense rather than deleted — the reason the two edits had to land
together is still the reason a later phase must not split them, so the prose stays and now
reads as a rule instead of a to-do.

`src/components/timeline/timeline-entry.tsx` gained exactly one branch:

```tsx
case "audit":
  return <AuditEntry entry={entry} />
```

No widened props (`AuditEntry` takes `entry` only — an audit entry has no row actions, so it
needs neither `canManage` nor the two callbacks), no `default: return null` swallowing the
union, and the `default: { const unhandled: never = entry; … }` block is untouched. The module
header's exhaustiveness paragraph was moved to the past tense and given an extra sentence
telling the phase after this one not to defeat the guard on its way in.

### Task 2 — the renderer (same commit)

`src/components/timeline/audit-entry.tsx`, 425 lines, `'use client'`, using
`useTranslations("audit")` and `useFormatter()`.

**Rail.** `user` → `Avatar size-8` with initials (imported `getInitials`, not a fifth copy);
`workflow_run` → `Workflow`, `api_key` → `Key`, `import` → `Download`, `system` → `Cog` — the
last of those explicitly not `Bot`, since nothing here is an AI. All rail glyphs are
`aria-hidden="true"`, which is exactly why the badge below is load-bearing.

**Line 1**, in order: actor name at the Label role; the per-entity predicate resolved from
`audit.entry.{action}.{entityType}` (twelve separate keys, no `{entity}` placeholder — Spanish
and Portuguese inflect the demonstrative with the noun's gender); the `<time dateTime title>`
+ `RelativeTime` treatment with the siblings' exact `format.dateTime` options; and, only when
`actorKind !== 'user'`, a `Badge variant="secondary" className="gap-1 font-normal"` carrying
the icon and the translated kind label.

The name fallback is always the kind label, never a guess (T-36-29). A `workflow_run` actor
links to `/workflows/{workflowId}/runs/{runId}`; when `workflowRun` is null the plain kind
label renders with no link, so there is no broken link on the page.

**Line 2.** A `<dl className="mt-1 space-y-1">` with one
`<div className="flex flex-wrap items-baseline gap-2">` per change: `<dt>` at
`text-muted-foreground text-xs`, `<dd>` at `text-sm leading-normal min-w-0 break-words`
holding the muted `from`, an `sr-only` `audit.value.changedTo`, an `aria-hidden` inline
`ArrowRight`, and the foreground `to`.

**No red/green diff colouring**, and the grep gate proves it: zero occurrences of any hue
class or hex literal in the file. A `created` entry (`from === null`) omits the arrow AND the
`sr-only` connector; a `deleted` entry renders no `<dl>` at all.

**Value rendering** follows the UI-SPEC's nine-case table exhaustively, with a `never`
assignment in the default branch so a tenth `AuditValue` member is a compile error rather than
a blank cell. `empty` and an unresolvable `reference` render as italic muted prose; `number`
uses `format.number` with no currency symbol; `boolean` uses the translated Yes/No; `date`
uses `format.dateTime` with the two specified option sets and never `RelativeTime`; `list`
uses `format.list` and is truncated after joining; `files` uses the ICU plural; `json` renders
the compacted string with no viewer. Every branch ends at one `collapseAndTruncate` call, and
the truncated span carries a native `title` (omitted entirely when nothing was cut).

**Disclosure.** Three rows by default; past that, a
`Button variant="ghost" size="xs" className="text-muted-foreground mt-1"` with `aria-expanded`
and `aria-controls` pointing at the `<dl>`'s `id={audit-fields-${entry.id}}`, labelled with the
remainder count. Plain `useState` and a conditional render, and the source comment gives the
two reasons that actually apply while explicitly recording that the RSC-boundary gate is NOT a
third reason and must not be quoted as one by a later phase.

**Defensive state.** Zero changes on a non-deleted entry renders line 1 plus a single muted
`audit.entry.noVisibleChanges` line.

The `FROM_SLOT`/`TO_SLOT` sentinel machinery from `stage-change-entry.tsx` was deliberately
not copied, and the module header says why: it exists because a translated sentence had to
host React badges, and the audit `<dl>` is label/value with no interpolated elements.

## The one design decision the plan left to the executor

`AuditFieldChange.label` carries **two kinds of string** — a message key like
`audit.field.owner` for native columns, and verbatim user-authored text for custom fields.
`present.ts` states the two are told apart *structurally*, by whether `field` starts with
`custom:`, and the renderer does exactly that. The `custom:` test runs **first**, so a custom
field a user happened to name `audit.field.owner` still renders as the name they typed rather
than being translated. There is a third case the plan did not name: `present.ts`'s
`humaniseColumn` fallback for an unmapped native column produces plain prose, not a key, and
it falls through to verbatim as well.

Resolution is `t(label.slice("audit.".length))` under `useTranslations("audit")`, gated on the
`audit.field.` prefix — the namespace prefix has to come off because the hook already supplies
it.

## Verification

| Gate | Result |
|------|--------|
| `npm run typecheck` | exit 0 — the `never` gate is satisfied |
| `npm test` | 74 files, 1287 passed, 4 skipped, 0 failed (includes `locale-parity.test.ts`) |
| `npx vitest run "src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx"` | 14 passed — the repo-wide CFUI-01 gate stays green |
| `npm run lint` | 0 errors, 125 warnings, all pre-existing and all in files this plan did not touch |

Grep gates on `src/components/timeline/audit-entry.tsx`:

| Gate | Expected | Actual |
|------|----------|--------|
| raw-HTML injection prop | 0 | 0 |
| `text-red-\|text-green-\|bg-red-\|bg-green-\|hex\|bg-white\|text-black` | 0 | 0 |
| the vendored disclosure primitive's name | 0 | 0 |
| the floating-overlay primitive's name | 0 | 0 |
| `function getInitials` | 0 | 0 (imported) |
| `aria-expanded` | 1 | 1 |
| `aria-controls` | 1 | 1 |
| `sr-only` | ≥1 | 2 (one is the module header explaining it) |
| `collapseAndTruncate` | ≥1 | 3 (1 import + 1 call + 1 comment) |
| `"use client"` | 1, first non-empty line | 1, first non-empty line |
| file length | ≥150 | 425 |

Gates on the other two files:

| Gate | Expected | Actual |
|------|----------|--------|
| `case "audit"` in `timeline-entry.tsx` | 1 | 1 |
| `unhandled: never` in `timeline-entry.tsx` | 1 | 1 |
| `canManage\|onUpdated\|onDeleted` on the `<AuditEntry>` line | 0 | 0 — the line is `return <AuditEntry entry={entry} />` |
| `AuditTimelineEntry` in `types.ts` | ≥2 | 4 |
| `TimelineEntryKind` | four kinds | `'note' \| 'activity' \| 'stage_change' \| 'audit'` |

### A note on the phase's grep-count convention

Two of this plan's acceptance criteria were written as `grep -c "<symbol>"` expecting a
call-site count. `grep -c` counts *lines*, and the mandatory `import` line matches too, so
those criteria are only satisfiable as "at least N". The table above reports the real number
and what makes it up rather than aliasing an import to hit a target. This is the same defect
wave-2 executors flagged; it did not require a code change here because both affected criteria
were already phrased as "at least".

## Deviations from Plan

### Auto-fixed / executor-resolved

**1. [Rule 3 - Blocking] `getInitials` was not exported**

- **Found during:** Task 2
- **Issue:** The plan required importing `getInitials` from `note-entry.tsx` rather than
  pasting a fifth copy, but the helper was module-private.
- **Fix:** Added `export` and extended its doc comment to record that 36-13 imports it and
  that the copy count stops at four. `note-entry.tsx` is not in the plan's `files_modified`,
  but the plan's action text explicitly sanctions "exporting it there if it is not already
  exported".
- **Files modified:** `src/components/timeline/note-entry.tsx`
- **Commit:** `b92690e`

**2. [Rule 2 - Correctness] The defensive line covers `created` as well as `updated`**

- **Found during:** Task 2
- **Issue:** The UI-SPEC scopes `audit.entry.noVisibleChanges` to an `updated` entry with an
  empty `changes` array. A `created` entry with an empty `changes` array would then render
  line 1 and nothing else — visually indistinguishable from a correct `deleted` row, and
  therefore invisible as a bug.
- **Fix:** The branch is `action === "deleted" ? nothing : changes.length === 0 ? the line :
  the list`. A `deleted` row still correctly draws no field list.
- **Files modified:** `src/components/timeline/audit-entry.tsx`
- **Commit:** `b92690e`

**3. [Rule 1 - Rendering] Explicit spacing around the arrow**

- **Found during:** Task 2
- **Issue:** The UI-SPEC's `<dd>` pseudo-markup shows spaces between `{from}`, the connector
  and `{to}`, but JSX strips whitespace that contains a newline between elements — the row
  would have rendered `Ana Lima→Bruno Sá` with no gap at all.
- **Fix:** `mx-1` on the `ArrowRight`, which is the already-declared 4px `xs` token, not a new
  spacing value.
- **Files modified:** `src/components/timeline/audit-entry.tsx`
- **Commit:** `b92690e`

### Single commit for two tasks

Both tasks landed in one commit. This is what the plan instructs ("Commit both together if the
executor's per-task commit would otherwise be red"): Task 1 alone fires the `never` gate, so a
Task-1-only commit would have been a red build.

## Threat Model Coverage

| Threat ID | Mitigation as built |
|-----------|---------------------|
| T-36-21 (stored XSS) | Custom field labels and every stored value render as React text children. Zero raw-HTML injection props in the file, grep-gated. The `<script>`-named-custom-field case is exercised in 36-20's browser verification. |
| T-36-27 (client DoS) | `collapseAndTruncate` caps display at 120 chars and the `title` at 1,000; `break-words` on the `<dd>`. Every value branch funnels through it, including `number` — `format.number` on a 300-digit value would otherwise exceed the budget. |
| T-36-28 (info disclosure) | A `reference` renders its label or the translated "no longer available". No branch in the file prints an id. |
| T-36-29 (visual spoofing) | The name fallback is the kind label in every branch. The workflow-run link renders only when `workflowRun !== null`. |
| T-36-SC (supply chain) | Zero packages added, zero `shadcn add` runs, `components.json` untouched. |

## Threat Flags

None. This plan adds no network endpoint, no auth path, no file access and no schema change —
it is a pure client renderer over data another plan already fetched.

## Known Stubs

None. Every branch the UI-SPEC's States Checklist names for Surface 1 is implemented. The row
is not yet *reachable* in a running app — nothing produces an `AuditTimelineEntry` until 36-17
adds the timeline source and 36-18 wires the filter toggle — but that is plan sequencing, not a
stub: the renderer is complete against its declared contract.

## Out-of-scope observations

Recorded here rather than in a shared file, per the wave instruction:

- `getInitials` now has four call sites across `deal-card.tsx`, `note-entry.tsx` and two
  siblings, one of which is now an import. A shared `src/lib/initials.ts` is the obvious next
  step and would delete three copies, but it touches four files this plan has no business in.
- `src/components/timeline/` still has no `__tests__/` directory. The four renderers are
  verified by typecheck, lint and browser checks only. Component tests for the value-rendering
  table — nine branches with locale formatting and an exact truncation budget — would be
  cheap and would catch the class of bug the grep gates cannot see.

## Self-Check: PASSED

- `src/components/timeline/audit-entry.tsx` — FOUND
- `src/lib/timeline/types.ts` — FOUND
- `src/components/timeline/timeline-entry.tsx` — FOUND
- `src/components/timeline/note-entry.tsx` — FOUND
- commit `b92690e` — FOUND
