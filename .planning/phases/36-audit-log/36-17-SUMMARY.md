---
phase: 36-audit-log
plan: 17
subsystem: api
tags: [drizzle, postgres, timeline, audit, keyset-pagination, sql]

# Dependency graph
requires:
  - phase: 36-audit-log
    provides: "36-03's audit_log table and audit_log_entity_idx; 36-10's buildAuditFieldChanges / AuditResolution; 36-13's AuditTimelineEntry in the TimelineEntry union"
  - phase: 35-record-timeline
    provides: "the TimelineSource seam, the pre-limited UNION ALL assembler, instantKey/bindInstant and assemble.test.ts"
provides:
  - "auditSource: the fourth TimelineSource — branch, countBranch and a fully batched hydrate"
  - "the assembler's second filter dimension (includeAudit), defaulting to false everywhere"
  - "countTimeline returning { total, auditTotal } in one pass"
  - "assemble.test.ts's eight Phase 35 assertions rescoped by flag, plus a parallel audit-on block"
affects: [36-19]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A registry filtered on two dimensions: the source's own appliesTo, plus a consumer-supplied scope"
    - "Page-wide AuditResolution: one definitions read plus one read per referenced table, issued concurrently"
    - "Compile-time coupling between a pure display rule (AUDIT_REFERENCE_COLUMNS) and its database half (Record<AuditReferenceColumn, ReferenceTable>)"

key-files:
  created: []
  modified:
    - src/lib/timeline/sources.ts
    - src/lib/timeline/assemble.ts
    - src/lib/timeline/assemble.test.ts
    - src/lib/audit/present.ts
    - src/components/timeline/record-timeline.tsx

key-decisions:
  - "apiKeyName is always null and honestly so: audit_log carries no api key reference, and resolving one through actor_user_id would print an arbitrary key of that user as fact"
  - "Tasks 1 and 2 share one commit: TimelineSource requires all three members, so a branch-only commit cannot typecheck, and this phase's own doctrine forbids intermediate states that do not compile"
  - "countTimeline always issues the audit count, in both scopes, because the toggle label reports auditTotal in both states and a lazy second read could disagree with the first"
  - "Reference labels are read with no soft-delete predicate — the same posture linked-records.ts takes: what the field was set to does not change when that row is later deleted"
  - "Custom field definitions are read only when the page actually contains a customFields.* change, so a native-only page costs no definitions query at all"

patterns-established:
  - "Two-dimension source filtering: appliesTo(entityType) AND a consumer scope, with the scope applied to the SUM in countTimeline rather than to the queries, so both numbers come from one pass"
  - "Exhaustive Record keyed by a type derived from the pure module's own list, so adding an audited foreign key without teaching the resolver which table it points at is a compile error"

requirements-completed: [AUDIT-03]

# Metrics
duration: 62min
completed: 2026-08-16
---

# Phase 36 Plan 17: The Audit Timeline Source Summary

**The record's change history became the fourth branch of the Phase 35 merged timeline, behind a consumer-supplied scope that defaults to off and leaves the default statement byte-identical to the plan Phase 35 measured.**

## Performance

- **Duration:** ~62 min
- **Started:** 2026-08-16T00:00:00Z (approx.)
- **Completed:** 2026-08-16T00:45:00Z (approx.)
- **Tasks:** 3 (committed as 2 — see Deviations)
- **Files modified:** 5

## Accomplishments

- `auditSource` joins `TIMELINE_SOURCES`: a pre-limited branch on `audit_log` carrying notes' two-column `(entity_type, entity_id)` predicate and stage-history's absence of any soft-delete filter, keyset-scoped through the verbatim `instantKey` / `bindInstant` pair.
- `auditSource.hydrate` resolves a whole page with a bounded, batched query count and no per-entry fan-out (T-36-38): **2 to 4 queries for a typical page, 9 in the absolute worst case** (see Query budget below).
- The assembler gained its second filter dimension. `applicableSources`, `buildTimelineQuery`, `assembleTimeline` and `countTimeline` all take `includeAudit`, defaulting to `false` at every level.
- `countTimeline` now returns `{ total, auditTotal }` from one pass: `total` moves with the scope so the header always matches the list underneath it, `auditTotal` is reported in both states for the toggle label.
- All eight Phase 35 assertions were **kept and rescoped** as the `includeAudit: false` case, with a parallel audit-on block beside them. Full suite green: 1310 passed, 4 skipped, plus 8 RSC tests.

## Task Commits

1. **Tasks 1 + 2: auditSource — branch, countBranch and hydrate** — `184b200` (feat)
2. **Task 3: the kind scope, the registry and the rescoped assertions** — `36def5c` (feat)

## Files Created/Modified

- `src/lib/timeline/sources.ts` — `auditSource` (branch / countBranch / hydrate), the reference-label reader, the page-wide `buildAuditResolution`, and the rewritten `TIMELINE_SOURCES` doc comment. +~330 lines.
- `src/lib/timeline/assemble.ts` — `includeAudit` threaded through four functions; `TimelineCounts` and the one-pass `countTimeline`.
- `src/lib/timeline/assemble.test.ts` — eight assertions rescoped, one new audit-scope describe (5 cases), two new audit hydration cases, three rewritten `countTimeline` cases. 43 tests, all green.
- `src/lib/audit/present.ts` — `AUDIT_REFERENCE_COLUMNS` / `AuditReferenceColumn` / `CUSTOM_FIELD_PREFIX` exported so the database half cannot drift from the display rule. No behaviour change.
- `src/components/timeline/record-timeline.tsx` — reads `counts.total` (blocking fix, see Deviations).

## Query budget per hydrated page (T-36-38, recorded as the plan required)

| Stage | Queries | When |
|-------|---------|------|
| The audit rows, with 3 left joins (actor user, run, workflow) | 1 | always |
| Custom field definitions for the entity types present | 1 | only when the page contains a `customFields.*` change |
| Reference labels, one per REFERENCED TABLE, issued concurrently | 0–7 | only for change keys whose stored values are ids |

**Typical page: 1–3 queries. Worst case: 9.** Independent of the page's entry count — two entries that both moved `stageId` cost one stages read, which `assemble.test.ts` asserts directly by pinning `fromCalls` to `[auditLog, stages]`.

## Decisions Made

- **`apiKeyName` is always `null`.** See Deviations #1 — this is a plan defect resolved honestly rather than a shortcut.
- **`countTimeline` issues the audit count in both scopes.** One extra count versus Phase 35 in the default state. The toggle label needs `auditTotal` on every render, and reading it lazily would be a second pass that could disagree with the first.
- **Reference labels carry no soft-delete predicate**, matching `linked-records.ts:82-91`. Filtering would turn "the owner you set this to, who has since left" into "no longer available", which is a worse answer than the truth.
- **Definitions are read `deleted_at IS NULL`**, matching every other reader of that table. A definition deleted after the entry was written falls through `present.ts`'s documented path (labelled with the name the stored key itself carries) rather than being dropped.
- **The user reference label falls back to email** when `users.name` is null — the same fallback the audit entry's own actor line uses, so one person reads the same way in both places.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The plan's `api_keys` join does not exist and cannot**

- **Found during:** Task 2 (`auditSource.hydrate`)
- **Issue:** The plan and the UI-SPEC's data contract both call for a `leftJoin` to `api_keys` for the key name. `audit_log` has no api key column: it carries `actor_user_id`, `workflow_run_id` and `import_session_id` and nothing else (`src/db/schema/audit-log.ts:53-55`), and the subscriber stores the key's **owner** in `actor_user_id` for `actorKind: "api_key"` (`src/lib/events/subscribers/audit.ts:82-85`). The only available join would be `api_keys.user_id = audit_log.actor_user_id`, which returns every key that user owns and would print an arbitrary one as fact.
- **Fix:** `apiKeyName` is `null` for every entry, with a comment naming the missing column and stating why the available join is refused. `audit-entry.tsx:306` already degrades a null to the "API key" kind label, so the rendered result is the honest one the UI-SPEC's own fallback table specifies. Recording a key id is a schema change and belongs to a plan willing to make it.
- **Related, same root:** the `actor` guard tests `actorKind === "user"` **before** the joined-user guard, so an `api_key` row's owner is never attributed as the person who made the change. `assemble.test.ts` asserts this directly.
- **Files modified:** `src/lib/timeline/sources.ts`, `src/lib/timeline/assemble.test.ts`
- **Verification:** `npx vitest run src/lib/timeline/assemble.test.ts -t "audit"` — the degradation case asserts `apiKeyName === null` and `actor === null` for an `api_key` row that joined a real user.
- **Committed in:** `184b200`

**2. [Rule 3 - Blocking] `record-timeline.tsx` did not compile against the new `countTimeline` shape**

- **Found during:** Task 3
- **Issue:** `countTimeline` returning `{ total, auditTotal }` is a breaking change for its only consumer, which declared `let total: number`. `npm run typecheck` — a Task 3 acceptance gate — cannot pass without touching it. The file is not in this plan's `files_modified`; it is in 36-19's, which is wave 5 and merges after this, so there is no collision.
- **Fix:** Destructure to `counts` and render `counts.total`, with a comment saying the component passes no scope (so it gets the audit-off count) and that 36-19 owns the toggle. Three lines; no behaviour change in the default state.
- **Files modified:** `src/components/timeline/record-timeline.tsx`
- **Verification:** `npm run typecheck` exits 0; `npm test` green.
- **Committed in:** `36def5c`

**3. [Rule 2 - Missing Critical] The reference column list and its table map could silently drift**

- **Found during:** Task 2
- **Issue:** `present.ts` decides a value **is** a reference (`REFERENCE_COLUMNS`, private). The hydrate has to know which **table** each of those ids points at. Two independent copies of the same list means a column added to `present.ts` later would render "no longer available" for a reference the display layer knows perfectly well is one — a silent wrong answer on an audit surface.
- **Fix:** `present.ts` now exports `AUDIT_REFERENCE_COLUMNS` (a tuple) and the derived `AuditReferenceColumn` type; `sources.ts` declares `REFERENCE_TABLES: Record<AuditReferenceColumn, ReferenceTable>`, so the omission becomes a compile error. `CUSTOM_FIELD_PREFIX` was exported for the same reason (the hydrate must recognise the exact keys `diff.ts` writes).
- **Files modified:** `src/lib/audit/present.ts`, `src/lib/timeline/sources.ts`
- **Verification:** `npm run typecheck` exits 0; `npx vitest run src/lib/audit` green (36 present.ts cases unaffected — additive exports only).
- **Committed in:** `184b200`

### Structural deviation

**4. Tasks 1 and 2 were committed together as `184b200`**

Not an auto-fix; a deliberate, documented merge of two task boundaries.

`TimelineSource` requires `branch`, `countBranch` **and** `hydrate`. A commit containing Task 1's two members with the `: TimelineSource` annotation the plan specifies cannot typecheck, so Task 1's own acceptance gate (`npm run typecheck` exits 0) is unsatisfiable at a separate Task-1 boundary. The three available responses were: leave a non-compiling commit in history, write a throwaway `hydrate` returning `[]`, or commit the source as one unit. The second is a stub the phase's own guidance forbids. The first contradicts `src/lib/timeline/types.ts:22-24` — *"A phase whose intermediate states do not typecheck cannot be verified plan by plan, so they are not allowed to drift apart"* — which is this repo's stated position on exactly this question. Both tasks' acceptance criteria were verified at the single commit; they are recorded below.

Registration in `TIMELINE_SOURCES` was deliberately **held back** to `36def5c`, so that the commit which turns the eight assertions red is the same commit that rescopes them. `184b200` is green on the full suite by itself.

---

**Total deviations:** 3 auto-fixed (1 bug, 1 blocking, 1 missing critical) + 1 structural
**Impact on plan:** No scope creep. Deviation #1 is a data-model fact the plan could not have honoured; #2 is the unavoidable consequence of the plan's own `countTimeline` signature change; #3 hardens a seam the plan created. No file outside the plan's declared set was touched except `present.ts` (additive exports) and `record-timeline.tsx` (three lines, required to compile).

## Acceptance criteria — measured

Reported with the `grep -c` caveat this phase's earlier waves recorded: `grep -c` counts **lines**, and import lines and doc comments match a bare symbol name. Call-site counts are given alongside.

| Criterion | Result |
|-----------|--------|
| `grep -c "auditSource" sources.ts` ≥ 1 | **2** (definition + registry) |
| `grep -c "bindInstant\|instantKey" sources.ts` increases by exactly 2 | **7 → 9** ✓ |
| audit branch contains no `deleted_at` | ✓ — asserted in both scopes; `deleted_at is null` stays at **2** |
| `grep -c "new Date" sources.ts` does not increase | ✓ — **0** added lines match |
| `grep -c "hydrate" sources.ts` increases by exactly 1 | **7 → 10 lines** (3 new: 1 implementation + 2 doc comments). **Call sites `hydrate(`: 3 → 4** ✓ — the criterion holds on call sites, not on lines |
| `grep -c "buildAuditFieldChanges" sources.ts` = 1 | **3 lines** (import + doc comment + call). **Call sites `buildAuditFieldChanges(`: 1** ✓ |
| `grep -c "leftJoin" sources.ts` increases by ≥ 3 | **5 → 8** ✓ |
| no database call inside a `.map(` or `for` over entries | ✓ — verified by reading, and pinned by the `fromCalls` assertion |
| `grep -c "includeAudit" assemble.ts` ≥ 6 | **9** ✓ |
| `grep -c "auditTotal" assemble.ts` ≥ 2 | **3** ✓ |
| `npx vitest run assemble.test.ts` | **43 passed, 0 failed** ✓ |
| `npx vitest run assemble.test.ts -t "audit"` selects ≥ 2 | **10 selected, all passing** ✓ |
| the `includeAudit: false` block retains the non-deal `union all` = 0 case | ✓ — `assemble.test.ts:275` |
| `npm test` — no other suite regressed | **75 files, 1310 passed, 4 skipped**, plus 2 RSC files / 8 tests ✓ |
| `npm run typecheck` | exit **0** ✓ |
| `npx eslint` on all five changed files | no issues ✓ |

**One criterion could not be run as written:** `npx vitest run assemble.test.ts -t "deleted_at"` selects **0 tests**, and did so before this plan too — no test name in that file has ever contained the string `deleted_at` (the case is named *"filters soft-deleted rows out of the notes and activities branches"*). The equivalent selector is `-t "soft-delete"`, which selects **2** tests (the original plus the new both-scopes case) and passes.

## Issues Encountered

- **`vitest -t` name selection.** The plan's `-t "deleted_at"` gate matches nothing; recorded above rather than worked around by renaming an existing Phase 35 test to satisfy a grep.
- **`AuditEntityType` narrowing.** `audit_log.entity_type` is `EntityType | "import_session"`, while `AuditTimelineEntry.entityType` and `buildAuditFieldChanges` both take `EntityType`. `assertEntityType` already makes an import-session row unreachable through the union, but `hydrate` takes ids and not a target, so the narrowing is written explicitly (`isCrmEntityType`) rather than assumed — the same guard `linked-records.ts` uses, for the same reason.
- **`customFieldDefinitions.position` is `numeric`**, which the driver returns as a string, while `AuditResolution.customFieldPositions` is `Map<string, number>`. Parsed at the boundary.

## Known Stubs

None. `apiKeyName: null` is not a stub — it is the correct value given the schema, and is documented as such at the call site and in Deviations #1.

## Threat Flags

None. No new network endpoint, auth path or file access was introduced. The one new trust boundary (`entityType` / `entityId` / cursor into a hand-composed audit branch, T-36-06) is inside the plan's declared threat model and is mitigated exactly as the register requires: identifiers literal, every value a `${}` bind, `entityType` zod-validated by `assertEntityType` before any fragment is composed, and asserted in `assemble.test.ts` (`expect(lower).not.toContain("'organization'")` alongside the bound-parameter count).

## User Setup Required

None — no external service configuration, no migration, no package added.

## Next Phase Readiness

- **36-19 (wave 5) can proceed.** It needs: `assembleTimeline({ ..., includeAudit })`, `countTimeline(entityType, entityId, includeAudit) -> { total, auditTotal }`, and the exported `TimelineCounts` type. All three are in place and typed.
- **`record-timeline.tsx` currently passes no scope**, so it renders the audit-off total. 36-19 must thread `includeAudit` from `searchParams` into **both** calls — passing it to `assembleTimeline` alone would put an audit-inclusive list under an audit-excluded header.
- **`loadMoreTimeline` (`src/app/notes/actions.ts:244`) still calls `assembleTimeline` with no scope**, so page 2 is currently always audit-off. 36-19 owns this; until then a cursor is only ever minted and replayed in one scope, so the cursor trap is not reachable.
- **`TimelinePage.total` is unchanged** (`number`, the scoped total). `auditTotal` is deliberately not on the page shape — it comes from `countTimeline`, which the card header already calls separately.

## Self-Check: PASSED

All five modified files exist on disk; all three commits (`184b200`, `36def5c`, `e53e75d`) are present in `git log`.

---
*Phase: 36-audit-log*
*Completed: 2026-08-16*
