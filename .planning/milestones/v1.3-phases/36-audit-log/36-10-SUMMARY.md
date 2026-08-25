---
phase: 36-audit-log
plan: 10
subsystem: ui
tags: [audit, timeline, pure-module, tdd, vitest, i18n-keys]

# Dependency graph
requires:
  - phase: 35-notes-record-timeline
    provides: "src/lib/timeline/types.ts — TimelineEntryBase, the TimelineEntry union and the exhaustive `never` gate in timeline-entry.tsx that this plan deliberately leaves armed"
  - phase: 36-audit-log
    plan: 04
    provides: "the 20 audit field-label message keys in all three locales that AUDIT_FIELD_LABELS points at"
  - phase: 36-audit-log
    plan: 02
    provides: "src/lib/audit/diff.ts — the `{ field: { from, to } }` change map shape this module consumes, including the customFields.<name> namespacing"
provides:
  - "AuditActorKind, AuditAction, AuditValue, AuditFieldChange, AuditTimelineEntry — declared, NOT yet joined to the TimelineEntry union"
  - "buildAuditFieldChanges — a stored change map becomes a labelled, typed, deterministically ordered AuditFieldChange[]"
  - "toAuditValue — one stored value typed into one of the nine AuditValue shapes"
  - "collapseAndTruncate — the single truncation point for every string-producing case (120 display / 1,000 title)"
  - "AuditResolution — the parameter that replaces every query this display logic would otherwise need"
affects: [36-13 audit-entry renderer, 36-16 workflow run records-changed section, 36-17 audit timeline source hydrate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Resolution-as-parameter: every db-dependent decision arrives in an AuditResolution, so the module is pure and the suite's wholesale @/db mock is irrelevant to it"
    - "Type declarations land one plan before the union edit that would fire an exhaustive `never` gate, keeping tsc green at every plan boundary"
    - "label carries a message key for native columns and verbatim user text for custom fields; the two are told apart structurally by the `custom:` prefix on `field`, never by inspecting the label"

key-files:
  created:
    - src/lib/audit/present.ts
    - src/lib/audit/present.test.ts
  modified:
    - src/lib/timeline/types.ts

key-decisions:
  - "AUDIT_FIELD_LABELS maps to message keys, not English, so the 20-branch mapping stays out of a render function and the module stays pure"
  - "collapseAndTruncate is exported for the RENDERER to call, not applied inside toAuditValue: list values are joined with format.list under the viewer's locale and can only be measured after that, so one truncation point serves both"
  - "Date strings are carried VERBATIM rather than round-tripped through Date — these are timestamp columns without a zone, and re-normalising would move the value by the process TZ offset"
  - "The custom-field change key stores the definition NAME (diff.ts writes customFields.<name>), so the definitionId is recovered by reverse lookup through customFieldNames; a deleted definition keeps its row, keyed custom:<name>"
  - "A reference id absent from the map and one mapped to null both render as 'no longer available' — a caller that could not resolve and a caller that did not try must not produce different screens"
  - "An empty array is `empty`, not a zero-item list: clearing every option of a multi-select is the field becoming empty"
  - "A hint that does not fit the stored value falls through to inference rather than asserting — a retyped definition renders the truth instead of an empty box"

requirements-completed: [AUDIT-01, AUDIT-03]

# Metrics
duration: 19min
completed: 2026-08-15
---

# Phase 36 Plan 10: Audit Value Presentation Summary

**The raw `{ field: { from, to } }` blob stored on an audit row now becomes a labelled, typed, deterministically ordered `AuditFieldChange[]` in a module that imports nothing but types — and the `TimelineEntry` union is deliberately untouched, so `tsc` is green at this plan boundary.**

## Performance

- **Duration:** 19 min
- **Started:** 2026-08-15T23:36:00Z
- **Completed:** 2026-08-15T23:55:00Z
- **Tasks:** 3
- **Files created/modified:** 3

## Accomplishments

- Five audit display types added to `src/lib/timeline/types.ts` verbatim from the UI-SPEC's data contract, with `TimelineEntryKind` and the `TimelineEntry` union left exactly as Phase 35 wrote them. Both sites now carry a comment saying 36-13 performs the join together with the renderer branch — the exhaustive `never` gate in `timeline-entry.tsx:57-62` stays armed and unfired.
- `src/lib/audit/present.ts`: `AUDIT_FIELD_LABELS` (20 native columns to message keys), `toAuditValue`, `buildAuditFieldChanges`, `collapseAndTruncate`, `AUDIT_VALUE_MAX_CHARS`, `AUDIT_TITLE_MAX_CHARS` and the `AuditResolution` contract. Zero database and zero bus imports; the only imports are types.
- 41 test cases, none of them mocking anything: value typing for all nine shapes, reference resolution including a raw-uuid-never-becomes-text sweep over all seven foreign-key columns, the 20 label keys asserted as a table, the camelCase fallback, four ordering cases, both truncation cases and the action semantics for `created` / `updated` / `deleted`.
- Ordering is proven stable: the same change map supplied in a different object-key order produces byte-identical output, which is what makes "only the first three rows render" a stable statement rather than a per-render lottery.

## Task Commits

1. **Task 1: Declare the audit display types without touching the TimelineEntry union** — `d179d56` (feat)
2. **Task 2 (RED): present.test.ts** — `337ed38` (test)
3. **Task 3 (GREEN): the pure presentation module** — `42b4e47` (feat)

**Plan metadata:** this SUMMARY (docs)

## Files Created/Modified

- `src/lib/timeline/types.ts` — `AuditActorKind`, `AuditAction`, `AuditValue`, `AuditFieldChange`, `AuditTimelineEntry`, plus a type-only `EntityType` import (erased at compile, same idiom as `sources.ts:13`). +70 lines, nothing removed.
- `src/lib/audit/present.ts` — 455 lines, the whole display contract, pure.
- `src/lib/audit/present.test.ts` — 599 lines, 41 cases, no mocking of any kind.

## Verification Performed

| Check | Result |
|-------|--------|
| `npm run typecheck` after Task 1 | exit 0 — the `never` gate has NOT fired |
| `grep -n "export type TimelineEntryKind" -A1 src/lib/timeline/types.ts` | still `'note' \| 'activity' \| 'stage_change'` |
| `AuditTimelineEntry` inside the `TimelineEntry` union | absent, as designed |
| `npx vitest run src/lib/audit/present.test.ts` before `present.ts` existed | exit 1, "Cannot find module './present'" — RED proven |
| `npx vitest run src/lib/audit/present.test.ts` after | 41 passed, 0 failed |
| `it(` block count | 41 (≥ 20 required) |
| Test names matching `/order/` and `/truncat/` | 4 and 5 |
| `grep -c "vi.mock" src/lib/audit/present.test.ts` | 0 |
| `grep -c "audit.field." src/lib/audit/present.ts` | exactly 20 |
| `grep -c "…"` / `grep -c '\.\.\.'` in `present.ts` | 1 / 0 — one U+2026, never three periods |
| `grep -vE '^\s*(\*\|//\|/\*)' present.ts \| grep -cE '"@/db"\|@/lib/events'` | 0 |
| `npx vitest run src/lib/timeline src/lib/audit` | 117 passed, 0 failed |
| `npm run typecheck` (final) | exit 0 |
| `npx eslint` on both new files | no issues |
| `npm test` (full suite, both projects) | 69 files 1196 passed / 4 skipped / 0 failed, plus 2 rsc files 8 passed — no regression |

## TDD Gate Compliance

Plan type is `tdd`. Gate sequence in git log: `test(36-10)` (`337ed38`) precedes `feat(36-10)` (`42b4e47`) for the module under test. No REFACTOR commit — the GREEN implementation needed no cleanup pass, and a commit with no diff would be noise. Task 1's `feat` commit precedes the RED gate because it adds type declarations only, with no behavior to test; its verification is `tsc`.

## Decisions Made

**1. Labels are message keys, not English.** The UI-SPEC's § Assumptions Flagged item 2 allows either shipping the resolved string or shipping the key. Shipping the key keeps this module pure (no `getTranslations`, no locale) and keeps a 20-branch mapping out of a render function. The cost is that `AuditFieldChange.label` carries two kinds of string — a message key for native columns, verbatim user-authored text for custom fields. That is documented on the map and the two are separated **structurally**: a custom field's `field` is `custom:<definitionId>`, a native's `field` is the column name. 36-13 must branch on that prefix, never on the label's content.

**2. Truncation is the renderer's call, not this module's.** `collapseAndTruncate` is exported rather than applied inside `toAuditValue` because `list` values are joined with `format.list` under the viewer's locale and can only be measured after that join. Applying it in both places would create two budgets that drift. `AuditValue` therefore carries the full string and 36-13 calls `collapseAndTruncate` once per string-producing case (`text`, `json`, the joined `list`, and a `reference` label).

**3. Date strings pass through verbatim.** `expectedCloseDate`, `dueDate` and `completedAt` are `timestamp` columns **without** a time zone. `diff.ts` already coerces every top-level `Date` to an ISO string via `toISOString()`. Re-normalising here (slicing to a calendar date, or re-parsing) would shift the value by the offset between the writing process's `TZ` and this one's, so the string is carried unchanged and `withTime` only tells the renderer whether to show the time part. The `Date` branch remains for a caller that skipped `diff.ts`.

**4. The custom-field key is a NAME, and that shaped the reverse lookup.** `diff.ts:185` writes `` `customFields.${key}` `` where `key` is the JSONB key — and the JSONB is keyed by `customFieldDefinitions.name` (`custom-fields-section.tsx:115`), not by id. The plan's `AuditResolution` is keyed by definitionId, so `customDefinitionId()` reverse-looks-up the name through `customFieldNames`. Names are necessarily unique per entity (they key the JSONB), so the lookup is unambiguous.

**5. A custom field whose definition was deleted keeps its row.** It is labelled with the stored name and keyed `custom:<name>`, sorted after every resolved custom field. Dropping the row would be omitting history, which `sources.ts` already names as the worst failure available on an audit surface. The `custom:` prefix is preserved so the renderer's structural branch stays correct for this case too.

**6. `entityType` is in the signature and currently unused.** No rule here is entity-dependent: the label map is shared across all four entities on purpose (`title` labels both a deal and an activity). It is consumed with `void entityType` — the same idiom `timeline-entry.tsx:60` uses — so per-entity divergence can land later without churning the 36-13 and 36-17 call sites.

**7. Inference on a hint mismatch, not assertion.** If a column or definition hint does not fit the stored value (a definition retyped after the entry was written, a column that changed shape), the value falls through to shape inference instead of asserting the hint. A wrong assertion renders a date as an empty box; the inference renders the truth.

## Deviations from Plan

None — plan executed exactly as written.

Three points where the plan's prose met the repo's reality and the resolution is recorded above rather than as a deviation:

- The plan describes the custom-field key as `customFields.<name>` in the behavior block and the resolution maps as definitionId-keyed. Both are true; decision 4 is the bridge, and no interface changed.
- `toAuditValue` is named in the plan's artifact list but not in its export list. It is exported, because the test suite types values through it directly and a later reader of a single stored value (36-16) needs it.
- Two acceptance criteria were read literally and shaped the source rather than causing a deviation: `grep -c "audit.field."` must be exactly 20, so that string appears only on the 20 map lines and never in a comment; and `grep -c '\.\.\.'` must be 0, so the module contains no spread syntax and no three-period ellipsis anywhere.

## Issues Encountered

**The RED gate was proven by a module-resolution failure, not by assertion failures.** `present.ts` did not exist when the tests were written, so vitest failed at import with `Cannot find module './present'` and exited non-zero. That satisfies the plan's `test $? -ne 0` criterion, and every one of the 41 cases then passed against the first implementation. Nothing passed unexpectedly during RED — nothing ran at all, which is the correct behavior for a plan whose module is being created from nothing.

## Known Stubs

None. Every export is fully implemented and exercised. The two deliberate non-implementations are documented rather than stubbed:

- `'audit'` is NOT in `TimelineEntryKind` and `AuditTimelineEntry` is NOT in the `TimelineEntry` union. This is the plan's explicit instruction, not an omission: adding either fires the exhaustive `never` gate in `timeline-entry.tsx` and would leave `tsc` red until 36-13 lands the renderer branch. Both sites carry a comment naming 36-13 as the plan that performs the join.
- `collapseAndTruncate` is not called anywhere yet. 36-13 is its only consumer, by design (decision 2).

## Threat Flags

None. No network endpoint, no auth path, no file access, no schema change. The three threats this plan owns are mitigated and asserted:

- **T-36-21 (stored XSS via user-authored custom field names)** — names pass through VERBATIM and unescaped, asserted byte-identical for a name containing `<script>alert("x")</script>`. The control is at the renderer, which 36-13 grep-gates to zero raw-HTML props.
- **T-36-08 (unbounded value blowing out the DOM)** — `collapseAndTruncate` caps display at 120 and `title` at 1,000, asserted by length and by code point (`0x2026` at index 119), with the 5,000-character embedded-newline case and the 200-character unbroken URL both tested.
- **T-36-22 (raw id leaking to a user)** — a sweep over all seven foreign-key columns asserts the value is `reference`-typed and that the uuid does not appear anywhere in the serialized value when unresolved.
- **T-36-SC** — zero packages added.

## User Setup Required

None.

## Next Phase Readiness

- **36-13** consumes `AuditFieldChange[]` and owns three things this module deliberately leaves to it: calling `collapseAndTruncate` for every string-producing case, resolving the `label` message key for native columns (branching on the `custom:` prefix, never on the label's content), and adding `'audit'` to `TimelineEntryKind` in the SAME commit as the `case "audit"` branch.
- **36-17** builds the `AuditResolution`: the `${changeKey}:${id}` reference labels, and the definitionId-keyed name / type / position maps. Note that the change map's custom keys carry the definition NAME, so the hydrate must load definitions by entity type and let this module do the reverse lookup.
- **36-16** can reuse `toAuditValue` and `buildAuditFieldChanges` for the run-detail field counts without a second implementation.

## Self-Check: PASSED

- `src/lib/timeline/types.ts` — FOUND, five audit types present, union untouched
- `src/lib/audit/present.ts` — FOUND
- `src/lib/audit/present.test.ts` — FOUND
- Commit `d179d56` — FOUND in git log
- Commit `337ed38` — FOUND in git log
- Commit `42b4e47` — FOUND in git log

---
*Phase: 36-audit-log*
*Completed: 2026-08-15*
