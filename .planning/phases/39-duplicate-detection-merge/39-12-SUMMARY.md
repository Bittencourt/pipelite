---
phase: 39-duplicate-detection-merge
plan: 12
subsystem: timeline
tags: [dedup, merge, audit, timeline, i18n, source-gate]
requires:
  - "src/lib/mutations/dedup.ts (39-09) — MERGE_MARKER_KEYS, the __-prefixed change keys this plan reads back"
  - "src/lib/timeline/types.ts (39-09) — AuditAction's fourth literal `merged`"
  - "src/messages/*.json (39-04) — audit.entry.merged.*, mergedNoFieldChanges, mergedChildren"
  - "src/components/custom-fields/__tests__/source-scan.ts (Phase 37) — readStrippedSource, callArguments"
  - "src/components/timeline/audit-entry.tsx (45-06) — the field-list conditional and the deleted guard"
provides:
  - "AUDIT_MARKER_PREFIX — the reserved __ prefix, exported and enforced in buildAuditFieldChanges"
  - "AuditTimelineEntry.mergedLoserName / .mergedChildCount — the merge's two display facts as first-class entry fields"
  - "the merged entry's rendering: predicate with the loser named, child-count line, field diff (SC-5)"
  - "src/lib/timeline/sources.test.ts — the first coverage auditSource.hydrate has had"
  - "src/components/timeline/__tests__/merged-entry-wiring.test.ts — the A-2/A-3/A-5/A-6/A-7 gate"
affects:
  - "39-15 and the phase browser walk — the survivor's timeline is now the merge's receipt"
  - "any future mutation inventing a __ marker: it inherits the filter without further work"
tech-stack:
  added: []
  patterns:
    - "brace-anchored region extraction (braceBlockAt) — anchors ON the JSX expression container's own brace, where 45-06's blockAfter searched for the first brace AFTER its marker"
    - "call-scoped assertion via callArguments: the values object must be on the SAME t() call, not merely in the file"
    - "marker strings copied into the reader with the drift closed by a source scan of the writer, rather than imported"
key-files:
  created:
    - src/lib/timeline/sources.test.ts
    - src/components/timeline/__tests__/merged-entry-wiring.test.ts
  modified:
    - src/lib/audit/present.ts
    - src/lib/audit/present.test.ts
    - src/lib/timeline/types.ts
    - src/lib/timeline/sources.ts
    - src/components/timeline/audit-entry.tsx
decisions:
  - "the marker filter is a general rule about the __ prefix, asserted against `updated` as well as `merged`, so the next mutation to invent a marker inherits it"
  - "the values object is passed to the predicate UNCONDITIONALLY: next-intl tolerates unused values, and a ternary would create the second predicate-building path A-2 forbids"
  - "sources.ts COPIES the two marker strings rather than importing MERGE_MARKER_KEYS — importing would put the merge mutation, the event bus and the formula recalculator on the timeline's read path for two string literals; the drift is closed by a source scan instead"
  - "__mergedIntoName is deliberately NOT read into mergedLoserName: it holds the SURVIVOR's name, and routing it there would state the merge backwards"
  - "readMergedChildCount uses Number.isInteger, not a bare typeof: NaN and Infinity are both typeof number and either would reach the ICU plural selector"
metrics:
  duration: ~28 min
  tasks: 3
  files_changed: 7
  completed: 2026-08-19
---

# Phase 39 Plan 12: The Merged Entry in the Record Timeline Summary

The survivor's change history now names the record that was absorbed into it, states how many linked
records moved, and lists the field diff — with the merge's internal markers filtered out one layer
upstream, where the "show N more" count is derived.

## What Landed

**Task 1 — `buildAuditFieldChanges` skips the reserved marker keys** (`ae5f94b` RED, `66f98a2` GREEN)

`AUDIT_MARKER_PREFIX = "__"`, exported from `src/lib/audit/present.ts`, and one `continue` at the
top of the loop — placed **before** `describeField`, so a marker never reaches `humaniseColumn` and
can never be sentence-cased into a field name a user reads. The comment records the whole reason:
the convention has existed since Phase 37 (`__purge`) but had never needed **enforcing**, because
until `merged` existed every marker rode on a `deleted` action and that action returns `[]` before
the loop. It also records why the filter belongs here rather than in the renderer — 45-06's rule
that a change which renders `null` must also leave the array, or `hiddenFieldCount` promises "show 1
more" and produces nothing.

Six new assertions in `present.test.ts`. The rule is proven **general**: a `__purge` on an `updated`
row is skipped too, and `custom__field` — a double underscore that does not START the key — is kept,
because `startsWith` and `includes` differ by exactly one silently-dropped change.

**Task 2 — the two hydrated entry fields** (`d093d7c` RED, `bb275aa` GREEN)

`AuditTimelineEntry` gains `mergedLoserName: string | null` and `mergedChildCount: number`, both
**required rather than optional** so no consumer needs a presence check — the meaninglessness on a
non-merged action is expressed as `null`/`0`, never as an absent key.

`src/lib/timeline/sources.test.ts` is new, and is the first coverage `auditSource.hydrate` has ever
had: `assemble.test.ts` covers `branch` and `countBranch` because they are pure SQL, but `hydrate`
queries. It mocks `@/db` and nothing else, so `buildAuditFieldChanges` runs for real and Task 1's
filter is exercised end to end rather than restated.

**Task 3 — the rendering and its gate** (`f868225`)

Four edits to `audit-entry.tsx`, 46 insertions and 2 deletions, and no others:

| Rule | Edit |
|------|------|
| A-2 | the one predicate call now passes `{ name: entry.mergedLoserName ?? "" }` unconditionally |
| A-3 | comment only — the name stays an interpolated ICU value, i.e. an escaped React text child |
| A-6 | the `changes.length === 0` fallback branches on the action, keeping both arms |
| A-7 | one muted Label-typography line for the child count, before the field list |
| A-5 | **no edit.** Asserted rather than assumed. |

`merged-entry-wiring.test.ts`, 19 assertions, every read comment-stripped and **no raw read at
all** — unlike 45-06's gate, nothing asserted here is a string that lives only in a comment, so the
exception that file needed is closed by construction here.

## Acceptance Criteria — Measured

| Gate | Result |
|------|--------|
| `vitest run src/lib/audit src/lib/timeline src/components/timeline` | 293 passed / 293 |
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors (125 pre-existing warnings, none in touched files — the same 125 39-09 measured) |
| `npm run test` (both projects) | 2457 passed / 21 skipped, then 8 passed. 0 failed |
| 45-06's `deleted-at-wiring.test.ts` | 18/18, file unmodified |
| 45-06's `NATIVE_ORDER` order guard | green, `AUDIT_FIELD_LABELS` unmodified |
| `git diff --stat src/components/timeline/audit-entry.tsx` | **46 insertions, 2 deletions** |
| `git diff --stat src/lib/audit/present.ts` | **35 insertions, 0 deletions** — so A-8 shows literally zero changed lines |
| `grep -c mergedLoserName` in `types.ts` / `sources.ts` | 1 / 1 |
| new assertions | 6 (present) + 14 (sources) + 19 (wiring) = **39** |

**A-8, verified rather than claimed.** `present.ts`'s diff is 35 insertions and **zero deletions**,
so no line of `AUDIT_FIELD_LABELS` or `NATIVE_ORDER` changed. The only occurrence of either name in
the diff is inside the new doc comment, explaining why a marker can never have an entry there.

## Negative Proofs — All Six RUN

**1. The marker filter (Task 1).** Disabling the `continue` — four tests red, including both the
plan named:

```
× the reserved marker prefix > returns only the real field for a merged entry carrying three markers
  AssertionError: … expected [ …4 items ] to have a length of 1 but got 4
    + "label": "__merged from name",
× the reserved marker prefix > skips a marker on an updated entry too, so the rule is general
× the reserved marker prefix > returns an empty list for a merged entry that is nothing but markers
× the reserved marker prefix > leaves the deleted and created rules exactly as 45-06 left them
```

The received value is worth recording: the label `humaniseColumn` produces for an unfiltered marker
is **`"__merged from name"`** — that string, beside a raw record id, is the literal defect this task
removes.

**2. The `typeof` narrowing (Task 2).** Replacing `readMergedLoserName`'s guard with a pass-through
cast — exactly one test red, by name:

```
× a malformed marker degrades instead of throwing >
  rejects a non-string name and a non-number count rather than passing them through
  AssertionError: … expected { nested: 'object' } to be null
```

**3. A-5 widened (Task 3).** `entry.action === "deleted" || entry.action === "merged"`:

```
× A-5: the field list is suppressed for deleted and ONLY for deleted >
  keeps the guard exactly as narrow as 45-06 left it
```

**4. The values object moved to another `t(...)` call (Task 3).** This is the proof that matters most
for A-2, because `name:` and `entry.mergedLoserName` both **remained in the file** and the assertion
failed anyway — the gate is scoped to the call, not to the file:

```
× A-2: the predicate call itself carries the loser's name >
  passes the values object at the same call that builds the key
  AssertionError: THE SAME call must carry a `name:` property … expected
  '`entry.${entry.action}.${entry.entity…' to contain 'name:'
```

**5. A-6 replaced rather than branched (Task 3).** `{t("entry.mergedNoFieldChanges")}`
unconditionally — two red, the both-arms assertion among them:

```
× A-6 … > branches inside the field-list conditional
× A-6 … > keeps BOTH arms, so a replacement fails where a branch passes
  AssertionError: the fallback must still reference "noVisibleChanges" …
```

**6. A-7 moved inside the field list (Task 3), the sixth proof.** The plan mandated three for Task 3;
this one was added because A-7's placement claim is the only one of the five that a regional
assertion alone could have been vacuous about. Rendering the count line inside the `<dl>` branch:

```
× A-7: the child-count line sits before the field list, not inside it > appears exactly once in the file
× A-7: the child-count line sits before the field list, not inside it > is not inside the field-list conditional
```

All six restored; the suite is green at plan end.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing critical functionality] The plan's `typeof` narrowing does not stop `NaN`**

- **Found during:** Task 2, writing `readMergedChildCount`
- **Issue:** the plan specifies "narrow both at runtime (`typeof` checks)". A bare
  `typeof stored === "number"` admits `NaN` and `Infinity`, which are both `typeof "number"`. The
  count feeds `t("entry.mergedChildren", { count })` — an ICU plural — so either value renders a
  sentence stating a quantity that is not one. T-39-28's disposition is `mitigate`, and a guard that
  admits two of the three ways a number can be meaningless does not mitigate it.
- **Fix:** `Number.isInteger(stored) && stored >= 0`, which rejects `NaN`, `Infinity`, negatives and
  fractions in one predicate. A seventh test was added for the `NaN` case specifically, with a
  comment saying why it is reachable through an `unknown` boundary even though JSON has no `NaN`
  literal.
- **Files modified:** `src/lib/timeline/sources.ts`, `src/lib/timeline/sources.test.ts`
- **Commit:** `bb275aa`, `d093d7c`

**2. [Rule 2 — Missing critical functionality] A drift alarm for the copied marker strings**

- **Found during:** Task 2, deciding how `sources.ts` learns the two key names
- **Issue:** the plan's `key_links` block wants `sources.ts` to read the markers by literal, which is
  right — importing `MERGE_MARKER_KEYS` would put the merge mutation, the event bus and the formula
  recalculator on the timeline's READ path for two string literals, and a reader must not depend on
  a writer. But two literals agreeing across two modules with no compile-time link is exactly the
  drift 39-09 was itself bitten by (`MERGE_EXCLUDED_COLUMNS` vs the 0017 generated columns, two
  wave-1 siblings unable to see each other). A rename in `dedup.ts` would hydrate `null` on every
  merged row from that day forward, with no type error anywhere.
- **Fix:** four assertions in `sources.test.ts` that scan `dedup.ts`'s **comment-stripped** source
  for both spellings, assert the reader holds the same two, and assert the reader does **not** name
  `__mergedIntoName` — the string-level half of the loser-name decision below.
- **Files modified:** `src/lib/timeline/sources.test.ts`
- **Commit:** `d093d7c`

**3. [Rule 3 — Blocking] `braceBlockAt`, because 45-06's `blockAfter` cannot reach this region**

- **Found during:** Task 3, extracting the field-list region
- **Issue:** the plan says to reuse the 45-06 precedent. `blockAfter(source, marker)` searches for
  the first `{` **after** its marker, which works for `function deletedAtDirectionKey` and for
  `change.field === DELETED_AT_COLUMN`. The region A-5 and A-6 both live inside is a JSX expression
  **container** — `{entry.action === "deleted" ? … }` — whose brace is attached to the FRONT of the
  marker. `blockAfter` would have found the next brace inside the branch and returned a fragment,
  and every negative scoped to it would have passed over the wrong text.
- **Fix:** `braceBlockAt`, which anchors on the marker's own first character and asserts it is `{`.
  Same quote-aware walk, exact rather than approximate extraction. The file documents the difference
  from `blockAfter` at the function, so the next reader does not assume they are interchangeable.
- **Files modified:** `src/components/timeline/__tests__/merged-entry-wiring.test.ts`
- **Commit:** `f868225`

**4. [Rule 1 — Bug] Two assertion-authoring errors in the gate, caught by running it**

- **Found during:** Task 3, first run of the new gate
- **Issue:** `expect(PREDICATE_CALLS.length).toHaveLength(1)` — a length matcher applied to a
  number, which fails with `expected 1 to have property 'length'` rather than measuring anything.
  And the key-template needle was written `entry.${entry.entityType}`, which is not a substring of
  `` `entry.${entry.action}.${entry.entityType}` `` because `action}.` sits between the two halves.
  Both would have been **false failures**, not false passes — but a gate that cannot go green is as
  useless as one that cannot go red.
- **Fix:** `.toBe(1)`, and the needle corrected to `${entry.action}.${entry.entityType}`.
- **Files modified:** `src/components/timeline/__tests__/merged-entry-wiring.test.ts`
- **Commit:** `f868225`

**5. [Rule 3 — Blocking] `enUS.audit.entry as Record<string, string | undefined>` does not typecheck**

- **Found during:** Task 3, `npm run typecheck`
- **Issue:** `audit.entry` holds four nested objects alongside its three flat strings, so the cast
  is a TS2352 "neither type sufficiently overlaps" error. The suite was green — vitest does not
  typecheck — and only `tsc --noEmit` caught it.
- **Fix:** destructure the one key needed (`const { mergedChildren } = enUS.audit.entry`), which is
  properly typed and needs no cast at all. The `Record<string, unknown>` cast used elsewhere in the
  file is legal and was left alone.
- **Files modified:** `src/components/timeline/__tests__/merged-entry-wiring.test.ts`
- **Commit:** `f868225`

### Plan Assumption Corrected

**The plan's `__mergedFromName` premise is right, but it is only half the picture.** 39-09's recorded
deviation means a completed merge writes a `merged` row on **both** sides: the survivor's carries
`__mergedFrom` / `__mergedFromName` / `__mergedChildren`, and the **loser's** carries `__mergedInto`
/ `__mergedIntoName` / `__mergedChildren`. The plan's hydration spec only names the survivor's
markers.

Verified by reading `src/lib/mutations/dedup.ts` (the two `tx.insert(auditLog)` calls at the survivor
and loser rows) and `src/lib/mutations/dedup.test.ts` rather than taken from the plan text. The
carry-forward briefing was correct: there is **no `deleted` row on the loser** from the mutation —
that tombstone comes from the bus, and the `merged` row is what the transaction writes.

This was handled rather than ignored: `mergedLoserName` reads **only** `__mergedFromName`, and the
decision is asserted from both directions — a behavioural test proving `__mergedIntoName` does not
populate the field, and a source-level assertion that the string appears nowhere in `sources.ts`.
Feeding the survivor's name through the `merged {name} into this record` predicate would state the
merge backwards, and this repo's own actor-attribution rule (T-36-29) prefers an honest omission to
a confident inversion. See Known Limitations for what that omission costs.

## Authentication Gates

None.

## Known Stubs

None. Every field this plan added is wired end to end: `__mergedFromName` and `__mergedChildren` are
read from the real column by the real hydrate, rendered by the real component, and asserted against
the real message catalog. No placeholder values, no empty returns feeding a UI.

## Known Limitations (recorded, not defects)

- **The LOSER's own `merged` row renders without a name, and there is no key for the sentence it
  wants.** Its marker is `__mergedIntoName` (the survivor's name), which is deliberately not routed
  into `mergedLoserName`, so the predicate resolves with `{name}` empty. HTML collapses the double
  space, so the row reads "merged into this organization" — grammatical and true, just less specific
  than it could be. **Fixing it properly needs a fifth and sixth `audit.entry.merged.*` key** (a
  loser-direction sentence per entity type) in all three locale files, and
  `src/messages/locale-parity.test.ts:73` pins Phase 39 to **exactly four** additions. That is
  39-04's contract, not this plan's file list, so widening it here would have broken a sibling's
  gate to improve a row that is currently unreachable: the losing record is soft-deleted and
  `src/app/organizations/[id]/page.tsx:41` filters `isNull(deletedAt)` before `notFound()`, so its
  timeline cannot be opened at all until someone restores it from Trash. **Worth a follow-up plan**;
  not worth a cross-plan gate break today.
- **`audit.entry.merged` has no `deal` or `activity` child**, by design — neither is mergeable. The
  predicate builds its key from `entry.action` and `entry.entityType` with no guard, so a `merged`
  row written against a deal would render a raw dotted path. Nothing can write one today
  (`MergeableEntityType` is organization | person), and adding a guard would create the second
  predicate-building path A-2 exists to forbid. The constraint lives in the mutation's type, which
  is where it belongs.
- **The gate proves the wiring is written down, not that it renders.** Unchanged from 45-06: this
  repo renders no client components in tests, and adding jsdom is a dependency decision belonging to
  a phase willing to own it (V-7). The two halves that CAN be pure functions are covered by real
  unit tests (`present.test.ts`, `sources.test.ts`); the rendered sentence is for the browser walk.

## Threat Flags

None. Every file touched is covered by the plan's `<threat_model>`; no new network endpoint, auth
path, file access pattern or trust-boundary schema change was introduced. T-39-27 (markers reaching
the user) and T-39-28 (a malformed marker crashing a page) are both `mitigate` and both now have a
RUN negative proof behind them; T-39-17 (the loser's name interpolated into the predicate) is
`accept`, and the A-3 no-link half of its reasoning is asserted regionally.

## TDD Gate Compliance

Tasks 1 and 2 were marked `tdd="true"` and ran the full cycle with the gates as separate commits:
RED `ae5f94b` (5 failing, 48 pre-existing passing) → GREEN `66f98a2`; RED `d093d7c` (9 failing, 1
passing) → GREEN `bb275aa`. Neither needed a REFACTOR commit.

Task 3 was **not** marked `tdd="true"` in the plan, correctly: its deliverable is a source-scan gate
over render decisions, and a source gate written before the source it scans is not a RED test in the
TDD sense — it is a gate asserting the absence of code nobody has claimed exists yet. It is one
commit, and its ability to fail is established by three RUN negative proofs instead (proofs 3, 4 and
5 above), which is the stronger evidence for this class of test.

## Self-Check: PASSED

- `src/lib/audit/present.ts` — FOUND
- `src/lib/audit/present.test.ts` — FOUND
- `src/lib/timeline/types.ts` — FOUND
- `src/lib/timeline/sources.ts` — FOUND
- `src/lib/timeline/sources.test.ts` — FOUND
- `src/components/timeline/audit-entry.tsx` — FOUND
- `src/components/timeline/__tests__/merged-entry-wiring.test.ts` — FOUND
- Commits `ae5f94b`, `66f98a2`, `d093d7c`, `bb275aa`, `f868225` — all 5 FOUND in `git log`
