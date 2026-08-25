---
phase: 36-audit-log
plan: 02
subsystem: api
tags: [audit, diff, events, jsonb, formula, vitest, tdd, pure-function]

# Dependency graph
requires:
  - phase: 34-formulas
    provides: "isFormulaWrapper (src/lib/formula-helpers.ts:144) — the db-free value test that discriminates formula-derived values without a custom_field_definitions query"
  - phase: 26-workflow-events
    provides: "crmBus and CrmEventPayload — the 13-event typed bus this widens"
provides:
  - "CrmEventPayload.previous — the optional before-row a subscriber cannot recover for itself"
  - "buildChanges(payload) → AuditChangeMap — the field → {from,to} map that becomes the audit row's changes JSONB"
  - "normaliseEventData(entity, obj) — reconciles the two payload casings into raw column names"
  - "IGNORED_COLUMNS — id, createdAt, updatedAt, position"
affects: [36-03-schema, 36-06-mutation-enrichment, 36-11-audit-subscriber, 36-17-timeline-source, 36-19-timeline-toggle]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure, db-free transform module (posture copied from src/lib/formula-helpers.ts): the only fully unit-testable part of a phase whose suite mocks @/db wholesale"
    - "isDeepStrictEqual from node:util for JSONB comparison — never JSON.stringify, whose key order is unstable"

key-files:
  created:
    - src/lib/audit/diff.ts
    - src/lib/audit/diff.test.ts
  modified:
    - src/lib/events/types.ts

key-decisions:
  - "previous lives on the shared CrmEventPayload as optional, not on a narrower update-only type — creates honestly have none, and deletes (data === {id}) need it most"
  - "TWO key maps (person, deal), not four — serializeOrganization and serializeActivity never reach a crmBus.emit; the omission is commented so a later reader does not 'fix' it"
  - "A native column absent from an update payload is NOT treated as a clear — this is what keeps the REST one-field edit a one-key map (phantom deletedAt)"
  - "A custom_fields key that disappeared IS treated as a clear — custom fields are always written whole, unlike a serializer-omitted column"
  - "Every top-level Date is coerced to ISO rather than a named list of three date columns — the rule cannot fall out of date with the schema"

patterns-established:
  - "Formula gate: test the VALUE on BOTH sides (isFormulaWrapper), so the discriminator travels inside the payload and no definitions read is needed"
  - "Delete tombstone: diff previous against {} rather than against data, because data is {id} at all seven delete sites"

requirements-completed: [AUDIT-01]

# Metrics
duration: 11min
completed: 2026-08-16
---

# Phase 36 Plan 02: Pure Audit Diff Summary

**A db-free `buildChanges` that turns a `CrmEventPayload` plus its new `previous` row into a `field → {from,to}` map — reconciling the two payload casings, excluding formula-derived values on either side, and building delete tombstones from the before-row.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-08-16T02:12:00Z
- **Completed:** 2026-08-16T02:23:56Z
- **Tasks:** 3
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- `CrmEventPayload` gained `previous?: Record<string, unknown>` — the only way before-values can exist at all, since a subscriber fires after the write has landed. `DealStageChangedPayload` inherits it; the 13-entry `CrmEventMap` needed no edit; no existing emit site broke.
- `src/lib/audit/diff.ts` (~185 lines) exports `IGNORED_COLUMNS`, `normaliseEventData` and `buildChanges`, importing only `isFormulaWrapper` and types — zero `@/db`, zero bus, zero clock.
- 21 passing unit cases with no mocking whatsoever, covering all five 36-VALIDATION AUDIT-01 rows.
- The headline case works: a `PUT /api/v1/people/:id` payload (snake_case `data` from `serializePerson` vs. camelCase `previous`) where only the email changed produces a **one-key** map, not the ~14-key false map a naive diff yields.

## Task Commits

1. **Task 1: Widen CrmEventPayload with an optional previous row** - `fe8adad` (feat)
2. **Task 2 (RED): diff.test.ts covering both casings, the formula gate and the tombstone** - `278117c` (test)
3. **Task 3 (GREEN): the pure diff, the two key maps and the formula gate** - `7960cc4` (feat)

No REFACTOR commit — the GREEN implementation needed no cleanup pass.

## Files Created/Modified

- `src/lib/events/types.ts` - `CrmEventPayload.previous?`, with a doc comment recording why it is optional and on the shared type, and that it is always supplied by the writer and never reconstructed by a subscriber.
- `src/lib/audit/diff.ts` - `AuditChangeMap`, `IGNORED_COLUMNS`, `PERSON_KEY_MAP`/`DEAL_KEY_MAP`, `normaliseEventData`, `buildChanges`.
- `src/lib/audit/diff.test.ts` - 21 cases across six `describe` blocks; mocks nothing by design.

## Decisions Made

- **`previous` on the shared payload, optional** (the decision 36-CONTEXT § Claude's Discretion delegated here). Creates legitimately have no previous row and `?:` says so honestly; deletes emit `data === { id }` at all seven sites, so an "update-only" payload type would have excluded the case that depends on `previous` most; and a second interface would have forced parallel edits to `DealStageChangedPayload` and every `CrmEventMap` entry.
- **Two key maps, not four.** Per 36-PATTERNS' correction to 36-RESEARCH, only `serializePerson` and `serializeDeal` reach an emit site. `KEY_MAPS` carries a comment stating the omission is deliberate and that adding organization/activity entries would assert a snake_case shape on paths where none exists.
- **`full_name` is dropped outright** via a `COMPUTED_KEYS` set rather than mapped to `fullName` — it is computed inside `serializePerson` and never stored, so it could only ever restate what `firstName`/`lastName` already record.
- **Blanket `Date` → ISO coercion** at the top level of `normaliseEventData`, rather than a named list of `expectedCloseDate`/`dueDate`/`completedAt`. Same effect for those three, but the rule cannot drift as the schema grows. Custom field values are untouched: they come out of JSONB and never contain a `Date`.
- **`isDeepStrictEqual` from `node:util`.** A `JSON.stringify` comparison would report every custom field as changed on every save, because JSONB round-trip key order is not stable. There is an explicit test (nested object with reordered keys) that goes red if anyone refactors toward stringify.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A column absent from an update payload was being reported as a phantom change**

- **Found during:** Task 2 (writing the realistic `person.updated` fixture)
- **Issue:** The plan specifies a union walk over both sides' keys with `IGNORED_COLUMNS = {id, createdAt, updatedAt, position}`. But `serializePerson` and `serializeDeal` omit `deleted_at` entirely, while the pre-read row that becomes `previous` (`...updatedDeal` at the mutation sites, the unprojected `findFirst` row at the REST sites) **always** carries `deletedAt: null`. A plain union walk therefore emits `deletedAt: { from: null, to: undefined }` on top of the real change — making the one-field REST edit a **two**-key map. That directly falsifies this plan's must-have truth ("a one-field edit produces a one-key change map, whichever route emitted it") and the 36-VALIDATION browser row "`PUT /api/v1/people/:id` … and a **one-field** change map".
- **Fix:** For `action === "updated"` only, a native key absent from the normalised `data` is skipped — a column the writer did not report is not a column that was cleared. Creates and deletes are exempt, since "absent from the other side" is precisely the signal there. `IGNORED_COLUMNS` was left exactly as the plan specifies (adding `deletedAt` to it was the alternative, and was rejected: it would have silenced a genuine soft-delete/restore signal that Phase 37 will need, and it does not generalise to any other column a future serializer omits).
- **Files modified:** `src/lib/audit/diff.ts`, `src/lib/audit/diff.test.ts`
- **Verification:** Dedicated case `"does not report a column the serializer omits, such as deletedAt, as a change"`, plus the `normalise` case asserting `Object.keys(changes)` is exactly `["email"]` and `"deletedAt" in changes` is `false`.
- **Committed in:** `7960cc4` (Task 3 commit)

**2. [Rule 2 - Missing Critical] The same rule, scoped OUT of the custom-fields walk**

- **Found during:** Task 3 (implementing the fix above)
- **Issue:** Applying deviation 1 uniformly would have hidden a real user action: clearing a custom field can remove its key from the `custom_fields` object, and that must be recorded.
- **Fix:** The "absent means unreported" rule applies to native columns only. Custom field sub-keys are always diffed when `customFields` is present on the update, because every writer passes the object whole. A separate guard skips the entire custom-fields walk when an update reports no `customFields` at all, so a hypothetical partial payload cannot claim every custom field was wiped.
- **Files modified:** `src/lib/audit/diff.ts`, `src/lib/audit/diff.test.ts`
- **Verification:** Case `"reports a custom field key that disappeared as a clear"` asserts `{ from: [...], to: undefined }`.
- **Committed in:** `7960cc4` (Task 3 commit)

**3. [Rule 3 - Blocking] Two ESLint `no-unused-vars` warnings in the new test**

- **Found during:** Task 3 (post-implementation lint)
- **Issue:** An unused `CrmEntityType` type import, and a `_omitted` destructuring binding (the underscore prefix does not exempt it under this config).
- **Fix:** Dropped the unused import; replaced the destructure with an explicit `delete serverReportedRow.deletedAt`.
- **Files modified:** `src/lib/audit/diff.test.ts`
- **Verification:** `npx eslint src/lib/audit/diff.ts src/lib/audit/diff.test.ts src/lib/events/types.ts` — 0 errors, 0 warnings.
- **Committed in:** `7960cc4` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 1 missing critical, 1 blocking)
**Impact on plan:** No scope creep — all three are inside the plan's own files. Deviation 1 is the difference between meeting and failing this plan's stated must-have, and it was invisible until a *realistic* `previous` fixture (one that includes `deletedAt: null`, as every real pre-read row does) was written.

## Issues Encountered

- The plan's acceptance criterion `grep -c "vi.mock" src/lib/audit/diff.test.ts` returns `0` was initially tripped by the file's own header comment explaining *why* it mocks nothing. Reworded to "if mocking ever becomes necessary". Worth noting for future source-grep gates: prose about a forbidden pattern trips the gate as readily as the pattern itself.
- A latent mismatch was noticed and deliberately **not** fixed: `serializeDeal` emits `value` as a `number` (`parseFloat`) while the raw row stores a numeric `string` (`"1000.00"`). It cannot produce a false diff today, because the only snake_case deal emit sites are **creates**, which have no `previous`. If a future phase ever serializes a deal **update** into an event, `value` will diff spuriously on every write. Logged here rather than fixed, since fixing it would mean adding untested speculative coercion.

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run src/lib/audit/diff.test.ts` | 21 passed, 0 failed |
| `npx vitest run src/lib/audit/diff.test.ts -t "formula"` | 4 passed |
| `npx vitest run src/lib/audit/diff.test.ts -t "multi_select"` | 1 passed |
| `npx vitest run src/lib/audit/diff.test.ts -t "normalise"` | 7 passed |
| `npx vitest run src/lib/audit/diff.test.ts -t "create\|delete"` | 5 passed |
| `npm run typecheck` | exit 0 |
| `npx eslint` (3 touched files) | 0 errors, 0 warnings |
| `npx vitest run src/lib/events src/app/api/v1` | 86 passed, 0 failed (no regression from the optional field) |
| `grep -E '"@/db"\|@/lib/events/bus\|JSON.stringify' src/lib/audit/diff.ts` | no matches — module is pure |

## TDD Gate Compliance

RED → GREEN sequence honoured and visible in `git log`:

- **RED:** `278117c` `test(36-02): …` — failed with `Cannot find module './diff'`, exit 1, before any implementation existed.
- **GREEN:** `7960cc4` `feat(36-02): …` — 21/21 pass.
- **REFACTOR:** none required.

No test passed unexpectedly during RED.

## Known Stubs

None. Every export is fully implemented and exercised by tests.

## User Setup Required

None — no external service configuration, and zero packages added (T-36-SC holds).

## Next Phase Readiness

- **36-11 (the audit subscriber)** can import `buildChanges` directly; its remaining job is `changes` → row insert plus the "empty map writes no row" no-op guard, which this module makes trivial (`buildChanges(...)` returning `{}`).
- **36-06 (mutation `previous` enrichment)** has the type it needs: four identical `buildEventPayload` edits adding a 6th optional parameter, plus the `/api/v1/{entity}/[id]` routes. The pre-read already exists at every site, so it stays a zero-extra-query change.
- **Contract note for 36-03 (schema):** change keys are column names, with custom fields namespaced as `customFields.{fieldName}`. Deletes produce one entry per non-ignored column with `to: undefined` — `undefined` serialises out of JSONB entirely, so a tombstone entry stored as `{"from": "Contrato Tyr"}` with no `to` key is expected and correct. Any reader must treat a missing `to`/`from` as "did not exist", not as malformed.
- No blockers.

## Self-Check: PASSED

- Files verified present: `src/lib/audit/diff.ts`, `src/lib/audit/diff.test.ts`, `src/lib/events/types.ts`, `.planning/phases/36-audit-log/36-02-SUMMARY.md`
- Commits verified in `git log`: `fe8adad`, `278117c`, `7960cc4`
- No shared orchestrator artifact touched: `STATE.md` and `ROADMAP.md` are unmodified.

---
*Phase: 36-audit-log*
*Completed: 2026-08-16*
