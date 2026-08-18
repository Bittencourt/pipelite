---
phase: 45-cross-cutting-ui-repair-and-uat-closure
plan: 06
subsystem: audit-timeline
tags: [react, next-intl, source-gate, copy-contract, soft-delete, audit-presenter]

# Dependency graph
requires:
  - phase: 45-cross-cutting-ui-repair-and-uat-closure
    plan: "01"
    provides: audit.field.movedToTrash and audit.field.restoredFromTrash in all three locales, both gated by REQUIRED_AUDIT_KEYS
  - phase: 36-audit-log
    provides: AUDIT_FIELD_LABELS, NATIVE_ORDER, DATE_COLUMNS, describeField, buildAuditFieldChanges, AuditFieldRow, present.test.ts
  - phase: 37-trash-and-restore
    provides: the restore write path (SET deleted_at = NULL) that produces the transition this row describes
provides:
  - "deletedAtDirectionKey() in audit-entry.tsx — the from/to pair mapped to one of two message keys, or null for no direction"
  - "a one-line <dt>-only timeline row for deletedAt: no arrow, no value cell, no timestamp"
  - "deletedAt classified as a date column in present.ts (defence in depth)"
  - "src/components/timeline/__tests__/deleted-at-wiring.test.ts — region-scoped source gate"
  - "NATIVE_ORDER_PREFIX order guard in present.test.ts — the first checked-in defence of native field display order"
affects: [45-11, audit-entry, record-timeline, present, deals-detail, people-detail, organizations-detail, activities-detail]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "region-scoped source gate: brace-match a branch body from its `if` condition, then assert negatives INSIDE that slice, because the forbidden tokens are required everywhere else in the file"
    - "one deliberate raw (non-stripped) read per gate, for a claim that only ever lived in a comment — asserting its absence in stripped source is vacuous forever"
    - "an order guard as a checked-in prefix array, asserted with slice(0, n), so appends pass and insertions fail"

key-files:
  created:
    - src/components/timeline/__tests__/deleted-at-wiring.test.ts
    - .planning/phases/45-cross-cutting-ui-repair-and-uat-closure/deferred-items.md
  modified:
    - src/lib/audit/present.test.ts
    - src/lib/audit/present.ts
    - src/components/timeline/audit-entry.tsx

key-decisions:
  - "deletedAt was NOT added to AUDIT_FIELD_LABELS — the map is one key per column, describeField never sees the from/to pair, and any entry would take a rank in NATIVE_ORDER, whose insertion order is the display order of native fields in every record timeline"
  - "The soft-delete suppression beside 'deleted this deal' is already STRUCTURAL and was not re-implemented: buildAuditFieldChanges returns [] for the deleted action and AuditEntry renders no field list for it, so nothing was passed down to AuditFieldRow"
  - "The direction is read off both sides' `type !== \"empty\"`, never off a null test — change.to is never null (only change.from is, and only on a create), so a `to === null` test would be dead code and every restore would be labelled a deletion"
  - "A pair with both sides empty returns null and renders nothing: every server-action create records deletedAt: null against a row that did not exist, so this is the common case, not an edge one"
  - "The directionless row is filtered out in AuditEntry as well as in AuditFieldRow, because hiddenFieldCount is derived from the array length — the row returning null alone would promise 'show 1 more' and produce nothing"
  - "The 'unreachable path' assertion in present.test.ts was rewritten rather than deleted: it enforced a factually false comment, and the replacement asserts the corrected comment names deletedAt and points at audit-entry.tsx"
  - "The arrow/value-cell negatives are scoped to a brace-matched branch region, never to the file — a file-wide absence would be asserting that the timeline stopped showing field changes"

patterns-established:
  - "Region-scoped source negatives via quote-aware brace matching from a branch condition, with a non-empty assertion on the extracted slice as its own anti-vacuity gate"
  - "Anti-vacuity 4 for a scoped negative: assert the forbidden token is still PRESENT elsewhere in the file, so deleting it app-wide cannot turn the gate green"
  - "A display-order guard is a prefix, not a length: appends pass, insertions fail, and the guard states in its message what the order controls"

requirements-completed: [SC-3]

# Metrics
duration: 26min
completed: 2026-08-18
---

# Phase 45 Plan 06: The Soft-Delete Timeline Sentence Summary

**The record timeline no longer prints the database column name "Deleted at" beside an unformatted ISO instant — a `deleted_at` transition now reads as "Moved to Trash" or "Restored from Trash" in the reader's own language, in one line, with no arrow and no timestamp.**

## Performance

- **Duration:** 26 min
- **Started:** 2026-08-18T10:27:00Z
- **Completed:** 2026-08-18T10:53:00Z
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified) + 1 planning artifact created

## Accomplishments

- **The identifier is gone and the sentence is real.** `AuditFieldRow` now intercepts `deletedAt`
  before the general label path and renders a single `<dt>` at Label typography
  (`text-muted-foreground text-xs`) holding one translated sentence. The key is chosen by
  `deletedAtDirectionKey`, which reads the direction off the pair — a value appearing is
  `audit.field.movedToTrash`, a value being cleared is `audit.field.restoredFromTrash` — and resolves
  it through the file's existing convention of slicing `MESSAGE_NAMESPACE_PREFIX` off a stored
  `audit.` key. No `ArrowRight`, no `AuditValueText`, no `<dd>`, no second timestamp: the entry header
  already carries who and when, and the stored `deleted_at` value **is** that same instant.
- **Both directions are handled, and a third case was found that needed neither.** The plan named two
  directions; the pair has a third state. A create diffs the new row against nothing, so
  `deletedAt` is not in `IGNORED_COLUMNS` and every server-action create records
  `deletedAt: { from: undefined, to: null }` — both sides empty after `buildAuditFieldChanges`
  normalises `from` to null. Before this plan that row rendered the column name beside a blank on
  **every record ever created through the UI**; "moved to Trash" would have been actively false there.
  `deletedAtDirectionKey` returns `null` for it and the row is dropped.
- **The disclosure count stays honest.** `AuditEntry` now filters directionless `deletedAt` changes
  out of `changes` as well, because `hiddenFieldCount` is `changes.length - VISIBLE_FIELD_COUNT`. A
  row that renders null but still counts would promise "show 2 more" and then produce one field —
  visible on precisely the create entries the previous bullet describes, which routinely carry more
  than three changes. Same predicate, one call site each, no duplicated direction logic.
- **`deletedAt` is classified as a date column.** `DATE_COLUMNS` gained `deletedAt: true`, so
  `nativeKind` returns `"date"`. Proven by unit test against the real `buildAuditFieldChanges`: the
  value that used to resolve to `{ type: "text", value: "2026-08-18T13:45:00.000Z" }` — the raw ISO
  instant, verbatim — now resolves to `{ type: "date", iso, withTime: true }`. The renderer no longer
  prints the value at all, so this is defence in depth for any future path that does.
- **The false comment is corrected, not deleted.** `humaniseColumn`'s doc block said "THIS PATH
  SHOULD BE UNREACHABLE". It is reached, by `deletedAt`, on every soft delete recorded as an update
  and every restore — and that claim is why the identifier shipped through phases 36-38: a reader who
  believed it went looking for a missing label and concluded there was nothing to fix. The rewrite
  names the column, says why its absence from the map is deliberate, points at
  `audit-entry.tsx`, and keeps the original warning intact for every other column.
- **`NATIVE_ORDER` has a defence for the first time.** `present.test.ts` gained a checked-in
  20-element prefix array asserted with `slice(0, n)`. The pre-existing `labels` test compares the
  map with `toEqual`, which is blind to key order; `NATIVE_ORDER` is derived from
  `Object.keys(AUDIT_FIELD_LABELS)` and that index is the display order of native fields on all four
  Phase 35/36/37 record surfaces, with only the first three rendering collapsed. An append passes; an
  insertion fails. **Proven by a RUN negative proof, not reasoned about** — see below.

## Task Commits

| Task | Name | Commit |
|------|------|--------|
| 1 | Unit-test the present.ts side and gate the render side (RED) | `15022a4` |
| 2 | Classify deletedAt and render the direction sentence (GREEN) | `64b5fef` |

## TDD Gate Compliance

- **RED:** `15022a4` (`test(45-06)`) — **11 failed / 54 passed**. The failure output named
  `restoredFromTrash` (2 occurrences), `movedToTrash`, the `deletedAt` date classification
  (`expected { type: 'text', …(1) } to deeply equal { type: 'date', …(2) }`), and
  `THIS PATH SHOULD BE UNREACHABLE` (2 occurrences, one per gate file).
- **GREEN:** `64b5fef` (`feat(45-06)`) — 65/65 across the two files, and 2178/2199 suite-wide.
- **REFACTOR:** none needed; no commit.

## Key Implementation Details

### The decision could not live in `AUDIT_FIELD_LABELS`, for two independent reasons

`AUDIT_FIELD_LABELS` maps one column to one message key, and `describeField` emits a single `label`
per column with no access to the from/to pair — so "Moved to Trash" vs "Restored from Trash" is two
keys for one column and does not fit. Separately, `NATIVE_ORDER` is built from that object's
insertion order and its index becomes each native column's `rank`, so an entry anywhere but the very
end shifts every field after it in every timeline in the app. `deletedAt` was therefore **not** added
to the map — the lower-risk route the plan offered — and both facts are now asserted: the map must not
contain a `deletedAt` entry (unit and source gate), and the first 20 keys must stay in their
checked-in order.

### The soft-delete suppression was already structural, so nothing was passed down

The plan allowed passing `entry.action` into `AuditFieldRow` if the action were not available there.
It is not needed: `buildAuditFieldChanges` returns `[]` outright for the `deleted` action
(`present.ts`), and `AuditEntry` independently renders no field list when
`entry.action === "deleted"`. The row is therefore already absent exactly where the UI-SPEC calls it
"pure redundancy", enforced in both the pure layer and the renderer. Passing the action down would
have been dead code with a second copy of the classification. The gate asserts both existing
suppressions so a later plan cannot weaken them into a per-field decision.

### `change.to` is never null, so the direction is read off emptiness

`AuditFieldChange.to` is `AuditValue`, not `AuditValue | null`; only `from` is nullable, and only on
a create. A cleared `deleted_at` arrives as `{ type: "empty" }` via `isEmptyValue`. So the plan's
suggested `change.to === null` test would never fire and every restore would have been labelled a
deletion. Both sides are read as `type !== "empty"` instead, and the gate pins that expression with
the reason attached.

### Why the arrow negatives are region-scoped, and how the region is extracted

`ArrowRight`, `AuditValueText`, `<dd`, `format.dateTime` and `value.changedTo` are how **every other**
field row draws its before/after pair. A file-wide absence assertion would be asserting that the
timeline stopped showing field changes at all — the opposite of the contract. The gate therefore
brace-matches the branch body from `change.field === DELETED_AT_COLUMN`, quote-aware so a `{` inside
a JSX attribute cannot open an unclosed level, and asserts the five negatives inside that slice only.
This is the same string-aware technique `callArguments` in `source-scan.ts` uses on parentheses, and
was chosen over the plan's alternative of a 400-character proximity window because a character window
silently stops covering the branch the moment a prop or a comment is added inside it — and does so
without failing. Two anti-vacuity assertions carry it: the extracted slice must be non-empty, and
every forbidden token must still be **present** in the file at large, so deleting the arrow app-wide
cannot turn the gate green.

### One deliberate raw read, and why the rest are stripped

Every other assertion in the new gate reads comment-stripped source through `readStrippedSource`.
The `THIS PATH SHOULD BE UNREACHABLE` assertion reads the **raw** file, and says so at the call site:
that string only ever existed inside a doc comment, so asserting its absence in stripped source would
be vacuously true for all time. This is the inverse of the phases 37-38 comment/grep collision — the
lesson there was that a comment can satisfy a gate, and the corollary here is that stripping can
silently empty one.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The existing `present.test.ts` test enforced the false comment this plan had to remove**

- **Found during:** Task 1, reading `present.test.ts` before writing anything
- **Issue:** `it("documents the unmapped-column fallback as an unreachable path")` at line 350
  asserted `expect(source).toMatch(/unreachable/i)` against the raw `present.ts`. The plan's own
  acceptance criterion requires `THIS PATH SHOULD BE UNREACHABLE` to be gone, and `npm run test` to
  stay green — those two are contradictory while that test stands. A test that pins a factually wrong
  comment is not a pre-existing constraint to work around; it is the defect wearing a green tick.
- **Fix:** Rewritten in place as
  `it("documents which columns actually reach the unmapped-column fallback")`, asserting the negative
  (`/THIS PATH SHOULD BE UNREACHABLE/` absent) plus two positives: the comment must name `deletedAt`,
  and it must point at `src/components/timeline/audit-entry.tsx`. A corrected comment that merely
  drops the false claim leaves the next reader exactly where the false one did.
- **Files modified:** `src/lib/audit/present.test.ts`
- **Commit:** `15022a4`

**2. [Rule 1 - Bug] Every created record carried a "Deleted at — empty" row, and the plan's two-direction branch would have labelled it a deletion**

- **Found during:** Task 2, tracing what `buildAuditFieldChanges` actually produces for a create
- **Issue:** `deletedAt` is not in `IGNORED_COLUMNS`, and `buildChanges` diffs a create against
  `before = {}`, so a server-action create records `deletedAt: { from: undefined, to: null }`.
  `buildAuditFieldChanges` then forces `from` to null on creates, producing a pair with **both sides
  empty**. The plan's stated rule — "`change.from === null` (a value appeared) means a soft delete" —
  is true only of creates, so implemented literally it would have printed "Moved to Trash" on every
  record the moment it was created. The pre-existing behaviour was the column name beside a blank.
- **Fix:** `deletedAtDirectionKey` returns `null` for a directionless pair and the row renders
  nothing. Documented at the function with the reason, so it does not read as defensive padding.
- **Files modified:** `src/components/timeline/audit-entry.tsx`
- **Commit:** `64b5fef`
- **Verified:** the unit test `"still reports a cleared deleted_at as empty rather than as a date"`
  pins the `empty` shape the branch depends on; the gate pins `return null` inside the function.

**3. [Rule 2 - Missing critical functionality] A row that renders null still inflated the "show N more" count**

- **Found during:** Task 2, immediately after deviation 2
- **Issue:** `hiddenFieldCount = changes.length - VISIBLE_FIELD_COUNT` is derived from the array, not
  from what renders. With the suppressed row still in `changes`, a create entry — which routinely
  carries more than three changes — would offer "show 2 more" and then produce one field. The
  defensive `changes.length === 0` branch would also never fire for an entry whose only recorded
  change is an invisible one.
- **Fix:** `AuditEntry` filters on the same predicate:
  `change.field !== DELETED_AT_COLUMN || deletedAtDirectionKey(change) !== null`. One shared function,
  two call sites, no duplicated direction logic — which is why the direction was extracted into a
  named module-scope function rather than inlined in the branch as the plan sketched. Scoped to that
  one column; no other field is filtered out of the history.
- **Files modified:** `src/components/timeline/audit-entry.tsx`
- **Commit:** `64b5fef`
- **Gated by:** the gate asserts `deletedAtDirectionKey(change) !== null` appears in the entry source.

No architectural change, no package install, no checkpoint, no locale-file edit (45-01 delivered both
keys and `REQUIRED_AUDIT_KEYS` already gates them).

## Verification Evidence

| Check | Result |
|-------|--------|
| `vitest run src/lib/audit/present.test.ts src/components/timeline/__tests__/deleted-at-wiring.test.ts` | **65 passed** (47 + 18) |
| `vitest run src/lib/audit/` | **7 files / 172 passed** |
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **0 errors**, 127 warnings (all pre-existing, unchanged) |
| `npm run test` | **2178 passed / 21 skipped** (100 files + 1 skipped) plus the RSC project **8 passed** — exit 0 |
| `grep -c "THIS PATH SHOULD BE UNREACHABLE" src/lib/audit/present.ts` | **0** |
| `grep -c "Deleted at" present.ts audit-entry.tsx` | **0 / 0** |
| comments stripped, `present.ts` contains `deletedAt: true` | yes (gate assertion) |
| comments stripped, `audit-entry.tsx` contains `movedToTrash` and `restoredFromTrash` | yes (gate assertion, `expect.soft` loop) |
| `deletedAt` in `AUDIT_FIELD_LABELS` | **absent** — asserted from both sides (unit + source) |
| every `expect(` / `expect.soft(` in the new gate carries a prose message | **25 of 25** |

### Negative proofs — RUN, not reasoned about

| Proof | Mutation | Result |
|-------|----------|--------|
| The order guard fires on an insertion | inserted `deletedAt: "audit.field.deletedAt"` after `value:` in `AUDIT_FIELD_LABELS` — the exact mistake the guard exists to catch | **4 failed.** The order-guard message printed in full, naming `NATIVE_ORDER`; the `labels` arity test reported `length of 20 but got 21`; both no-entry assertions fired. Restored → 65/65. |
| The region-scoped arrow negative fires | added `<ArrowRight … />` back inside the `deletedAt` branch | **1 failed**, naming `ArrowRight` and quoting the reason the assertion is regional. Restored → 18/18. |

Success criteria from the plan, all met:

- [x] The `deletedAt` timeline row renders a translated sentence, one line, no arrow, no timestamp
- [x] The redundant row is suppressed when the entry's own sentence already says "deleted" (structural, in both layers)
- [x] `THIS PATH SHOULD BE UNREACHABLE` no longer appears in `present.ts`
- [x] `deletedAt` is classified as a date column
- [x] A checked-in order guard defends `NATIVE_ORDER` against future insertions

## Threat Model Dispositions

- **T-45-20 (Information disclosure, `humaniseColumn` fallback — mitigate):** closed. `deletedAt` no
  longer reaches the fallback's output: the renderer intercepts the column and never prints its
  label. `deletedAt: true` in `DATE_COLUMNS` means any surviving render formats in the viewer's
  locale rather than exposing the stored ISO instant, proven by unit test against the real presenter.
  The corrected doc comment names the column and points at the branch, so the next reader is not sent
  down the path that produced the leak. `grep -c "Deleted at"` is 0 in both files.
- **T-45-21 (Repudiation, timeline field ordering — mitigate):** closed, and stronger than asked. The
  prefix assertion exists **and its negative proof was run**: an insertion produces 4 failures, one of
  which prints why the order matters. `deletedAt` also stays out of the map entirely, so this plan
  added zero risk to the order it now defends.
- **T-45-22 (Tampering, audit copy keys — mitigate):** upheld by 45-01's `REQUIRED_AUDIT_KEYS`
  exact-set assertion (81 keys), untouched here. This plan adds the other half of that contract: the
  gate asserts both keys resolve to non-empty strings in the imported `en-US` catalog, which
  `locale-parity.test.ts` cannot do because it compares the three locales to each other rather than
  to any component's call sites. Both English sentences are also asserted **absent** from the
  component, so neither can be hardcoded past next-intl.
- **T-45-23 (Information disclosure, suppressed soft-delete row — accept):** accepted as planned, and
  it costs nothing: the suppression is `buildAuditFieldChanges` returning `[]` for a delete plus
  `AuditEntry` rendering no list, both pre-existing. The entry header still carries the actor and the
  instant, and `deleted_at` is that same instant. A **second** suppression was added (both sides
  empty) and it also removes no information: no direction was recorded, so none is withheld.
- **T-45-SC (Tampering, npm installs — mitigate):** nothing installed. `package.json` and
  `package-lock.json` are untouched.

No new threat surface: no endpoint, no auth path, no file access, no schema change. No threat flags.

## Known Stubs

None. Both message keys are live in all three locales (45-01), both are reached by real branches, and
the value classification is exercised by a unit test against the real presenter rather than a mock.

## Notes for Future Plans

- **45-11 still owns the phase's single Docker rebuild (V-7).** Nothing here was rebuilt or
  browser-verified. The two sentences to look for on the walk: **restore a record from `/trash` and
  open its timeline** (expect "Restored from Trash" / "Restaurado da Lixeira" / "Restaurado desde la
  Papelera", one line, no arrow), and **create a record and open its timeline** (expect NO
  soft-delete row at all, and a "show N more" count that matches what expanding actually reveals).
  The es-ES pass matters as much as en-US, per the phase's own asymmetry note.
- **The `blockAfter` brace matcher in `deleted-at-wiring.test.ts` is the second region-scoped gate
  helper in this repo**, after 45-05's `reportElement` element walker in
  `bulk-caller-wiring.test.ts`. They solve the same shape of problem from two directions — one scopes
  to a JSX element, one to a statement block. If a third phase needs either, **lift both into
  `src/components/custom-fields/__tests__/source-scan.ts`** rather than copying; three copies is how
  they drift, and `source-scan.ts` already owns `stripComments`, `readStrippedSource` and
  `callArguments` for exactly this reason.
- **`deletedAt` is not in `IGNORED_COLUMNS`** (`src/lib/audit/diff.ts`) and that is load-bearing for
  Phase 37 — the tombstone a delete writes is a restore payload, and the restore transition is the
  thing this row describes. Do not "clean up" the create-time phantom by ignoring the column: it
  would take the restore row with it. The renderer is the right place for the suppression.
- **The order guard's prefix is 20 keys.** When a native column is genuinely added, append it to
  `AUDIT_FIELD_LABELS` and extend `NATIVE_ORDER_PREFIX` in the same commit. The guard is
  `slice(0, prefix.length)`, so an append needs no edit to pass — extending the prefix is what brings
  the new column under the same protection.

## Self-Check: PASSED

- `src/components/timeline/__tests__/deleted-at-wiring.test.ts` — FOUND
- `src/lib/audit/present.test.ts` — FOUND
- `src/lib/audit/present.ts` — FOUND
- `src/components/timeline/audit-entry.tsx` — FOUND
- `.planning/phases/45-cross-cutting-ui-repair-and-uat-closure/deferred-items.md` — FOUND
- commit `15022a4` — FOUND in `git log --all`
- commit `64b5fef` — FOUND in `git log --all`
