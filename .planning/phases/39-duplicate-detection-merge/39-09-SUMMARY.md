---
phase: 39-duplicate-detection-merge
plan: 09
subsystem: mutations
tags: [dedup, merge, audit, transaction, formula-recalc]
requires:
  - "src/lib/dedup/field-groups.ts (39-02) — buildMergeFieldGroups, MERGE_EXCLUDED_COLUMNS"
  - "src/lib/dedup/merge-defaults.ts (39-02) — applyMergeChoices"
  - "src/db/schema/duplicate-pairs.ts (39-05) — the pair table and its canonical ordering"
  - "drizzle/0017_dedup_schema.sql (39-05) — the norm_* generated columns"
provides:
  - "mergeRecordsMutation — the whole merge, one transaction (DEDUP-03, SC-4, SC-5)"
  - "MERGE_MARKER_KEYS — the reserved __-prefixed audit change keys 39-12 reads back"
  - "MergeErrorCode — NOT_FOUND | SAME_RECORD | NOT_IN_PAIR | FAILED, for 39-15's server action"
  - "AuditAction's fourth literal 'merged', at all four declaration/consumption sites"
affects:
  - "39-12 (audit-entry presentation of a merged row; must skip __-prefixed keys)"
  - "39-10 (dedup.db.test.ts — the constraint half of B4's proof)"
  - "39-15 (the calling server action; re-checks V-9 independently)"
tech-stack:
  added: []
  patterns:
    - "purgeOrganizationMutation's six load-bearing properties, carried across verbatim"
    - "third local auditActorColumns copy (decision, not oversight)"
    - "one shared decrementing formula budget across an explicit child loop"
key-files:
  created:
    - src/lib/mutations/dedup.ts
    - src/lib/mutations/dedup.test.ts
    - src/lib/audit/__tests__/audit-action-exhaustive.test.ts
  modified:
    - src/db/schema/audit-log.ts
    - src/lib/timeline/types.ts
    - src/lib/audit/linked-records.ts
    - src/app/workflows/[id]/runs/[runId]/components/run-changed-records.tsx
    - src/lib/mutations/organizations.ts
    - src/lib/dedup/field-groups.ts
    - src/lib/dedup/field-groups.test.ts
    - src/lib/audit/no-mutation-coupling.test.ts
decisions:
  - "The loser's in-transaction audit row is `merged`, not `deleted`: the deleted tombstone comes from the bus, as it does for every other soft delete, so the loser's timeline does not carry the same line twice"
  - "`merged` ranks between `created` and `deleted` in ACTION_RANK — the row is written on the survivor, which is alive"
  - "auditActorColumns is a THIRD local copy; a shared extraction was rejected for this phase"
  - "MERGE_EXCLUDED_COLUMNS gains normName/normEmail/normPhone: generated columns cannot be written and are not questions a user can answer"
  - "the post-commit child recalculation shares ONE decrementing evaluation budget, not one per child"
metrics:
  duration: ~35 min
  tasks: 3
  files_changed: 11
  completed: 2026-08-19
---

# Phase 39 Plan 09: The Merge Mutation Summary

`mergeRecordsMutation` collapses two duplicate records inside one transaction covering every child,
both audit sides and the pair table — plus the four-file `AuditAction` compile cascade Phase 37
deliberately deferred, paid in one commit.

## What Landed

**Task 1 — `AuditAction` gains `merged` at all four sites** (`f08ebd6`)

Both declarations (`src/db/schema/audit-log.ts:34`, `src/lib/timeline/types.ts:113`) carry the
fourth literal; the duplication stays deliberate per Phase 36's dependency-free posture.
`ACTION_RANK` is renumbered `{ updated: 0, created: 1, merged: 2, deleted: 3 }` with the precedence
comment rewritten to `deleted > merged > created > updated`. `ACTION_BADGE_VARIANT` gains
`merged: "secondary"`, its NEVER-`destructive` rule intact. `PURGE_MARKER`'s doc comment now records
that Phase 39 paid the cascade it warned about, and that the purge's own choice is unchanged.

New `src/lib/audit/__tests__/audit-action-exhaustive.test.ts` (10 tests): a compile-time invariant
type-equality assertion between the two declarations, and comment-blind source scans via
`readStrippedSource` pinning both maps to exactly four keys, distinct ranks, the stated precedence,
and no `Partial` relaxation.

**Task 2 — `mergeRecordsMutation`** (`44f70a6`)

`src/lib/mutations/dedup.ts`, 802 lines. Order: actor captured synchronously at entry → `SAME_RECORD`
guard → two existence reads and the V-9 pair-membership read **outside** the transaction → field
groups, defaults and merged values → one `db.transaction` covering both `FOR UPDATE` re-reads, the
three foreign-key reparentings, the two-statement notes handling, the survivor update, the loser's
inline soft delete, four audit inserts and both pair updates → two independent best-effort
post-commit blocks.

**Task 3 — mocked unit tests** (`d3c6f84`)

`src/lib/mutations/dedup.test.ts`, 25 tests, all asserting order by index out of a recorded
`{ op, table, label }` sequence. The header names what the file cannot prove and points at 39-10.

## Acceptance Criteria — Measured

| Gate | Result |
|------|--------|
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors (125 pre-existing warnings, none in touched files) |
| `npm run test` (both projects) | 2351 passed / 21 skipped, then 8 passed |
| `grep -c "Partial<Record<AuditAction" src/` | **0** |
| `grep -cE "db\.update|db\.insert|db\.delete" dedup.ts` | **0** |
| `grep -cE "deleteOrganizationMutation|deletePersonMutation" dedup.ts` | **0** |
| `grep -c "update(activities)" dedup.ts` | **0** |
| `grep -ci "activit" dedup.ts` | **5** (the comment where the statement is not) |
| `grep -c 'error: "FAILED"' dedup.ts` | **1** |

**Module-level `db` uses in `dedup.ts`, each read and justified:** lines 255, 261, 277 — all
`db.select()`, the survivor read, the loser read and the pair-membership read, deliberately outside
the transaction (the template's property 2). Line 339 is `db.transaction` itself. Zero writes.

**Emit placement, by line number:** `db.transaction(` opens at **line 339**, its callback closes at
**line 624**, `crmBus.emit` is at **line 671** — strictly after, as required.

**The derived formula ref-name list.** Derived in `parentRefNamesForReparent`, from
`parentChangedRefNames` (`src/lib/formula-recalc.ts:763-789`), whose source folds in three things:
`changed.add(field)` for each `changedFields` entry (column names), `changed.add(attribute)` via
`attributeByColumn` built from `ENTITY_NATIVE_ATTRIBUTES[parentType]`, and every non-formula
definition name when the `customFields` sentinel is present. A reparenting changes the parent
wholesale, so the list is the union of `Object.keys` + `Object.values` of
`ENTITY_NATIVE_ATTRIBUTES[parentType]` plus every parent definition name. For `organization` that
is `["Name", "Website", "Industry", "Notes", "name", "website", "industry", "notes", ...definition
names]`. The column names cannot match a dotted ref (`scopeFormulasToChangedFields:355` compares the
text after the dot, which is an attribute or custom-field name) and are folded in anyway for exact
parity with the private function. Asserted live, against the real map, by the test
"keys the parent's changed refs by the prefix buildRelatedEntities itself used".

## Negative Proofs — All RUN

**1. The four-file cascade.** Removing `merged` from `src/lib/timeline/types.ts` only did **not**
break `linked-records.ts` or `run-changed-records.tsx` — both import `AuditAction` from
`@/db/schema/audit-log`, not from the timeline module. The plan's expectation was wrong about the
direction. It reported instead:

```
src/lib/audit/__tests__/audit-action-exhaustive.test.ts(45,7): error TS2322: Type 'true' is not assignable to type 'false'.
src/lib/timeline/sources.ts(751,9): error TS2322: Type '…/audit-log').AuditAction' is not assignable to type '…/timeline/types').AuditAction'.
  Type '"merged"' is not assignable to type 'AuditAction'.
src/lib/timeline/sources.ts(780,53): error TS2345: Argument of type '…/audit-log').AuditAction' is not assignable to parameter of type '…/timeline/types').AuditAction'.
```

So the complementary half was run too — removing `merged` from `src/db/schema/audit-log.ts`, which
is the declaration the two exhaustive maps consume. **That** is the cascade:

```
src/app/workflows/[id]/runs/[runId]/components/run-changed-records.tsx(64,3): error TS2353: Object literal may only specify known properties, and 'merged' does not exist in type 'Record<AuditAction, "secondary" | "outline">'.
src/lib/audit/__tests__/audit-action-exhaustive.test.ts(45,7): error TS2322: Type 'true' is not assignable to type 'false'.
src/lib/audit/__tests__/audit-action-exhaustive.test.ts(56,3): error TS2353: Object literal may only specify known properties, and 'merged' does not exist in type 'Record<AuditAction, true>'.
src/lib/audit/linked-records.ts(51,3): error TS2353: Object literal may only specify known properties, and 'merged' does not exist in type 'Record<AuditAction, number>'.
```

Both restored; typecheck clean. Worth recording: the divergence between the two declarations IS
caught today, but only because `sources.ts` happens to assign one to the other. The new
compile-time equality assertion catches it unconditionally.

**2. `ACTION_RANK` collision.** Setting `merged: 3` (colliding with `deleted: 3`):

```
× assigns a distinct rank to every action
  AssertionError: duplicate ranks in ACTION_RANK: {"updated":0,"created":1,"merged":3,"deleted":3}: expected 3 to be 4
× ranks deleted > merged > created > updated
  AssertionError: expected 3 to be greater than 3
```

**3. Note statement order.** Swapping the demotion and the reassignment:

```
× Test 5: the note demotion is issued BEFORE the note reassignment
  AssertionError: the demotion must precede the reassignment: demote at index 5, reassign at index 4.
  recorded: select:organizations -> select:organizations -> update:deals(reparent) -> update:people(reparent)
  -> update:notes(reassign) -> update:notes(demote) -> update:organizations(survivor) -> ...
```

Test 4 went red alongside it, naming the whole recorded sequence.

**4. Bus placement.** Moving `crmBus.emit` inside the transaction callback:

```
× Test 9: crmBus.emit fires AFTER the transaction resolves
  AssertionError: crmBus.emit ran before the transaction settled — it must be outside the db.transaction callback: expected false to be true
```

**5. Sentinel leak.** Returning the caught error's `message`:

```
× Test 8: a 23505 inside the transaction returns FAILED and leaks no index name
  - "error": "FAILED",
  + "error": "duplicate key value violates unique constraint \"notes_migration_uniq\"",
```

All five restored; the full suite is green at plan end.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] The `merged` audit row on the loser replaces a duplicate `deleted` row**

- **Found during:** Task 2, step f
- **Issue:** The plan asked for BOTH a `deleted` audit row on the loser written inside the
  transaction AND a post-commit `crmBus.emit("<entity>.deleted", …)`. Those collide:
  `organization.deleted` and `person.deleted` are members of `AUDITED_EVENTS`
  (`src/lib/events/subscribers/audit.ts:19`), so the subscriber writes a `deleted` row off the
  emit. The loser's timeline would carry the same "deleted this organization" line twice — on the
  most destructive operation in the app, in a phase about audit fidelity.
- **Verified, not assumed:** the plan justified the row's `{ deletedAt: { from, to } }` shape as
  "the shape 45-06's Moved to Trash renderer already reads". It is not.
  `buildAuditFieldChanges` (`src/lib/audit/present.ts:488`) returns `[]` for `deleted` whatever the
  map holds, and `deletedAtDirectionKey` (`src/components/timeline/audit-entry.tsx:142`) reads that
  shape only off an `updated` row — which is the restore's shape.
- **Fix:** the in-transaction row on the loser is `action: "merged"` carrying `__mergedInto` /
  `__mergedIntoName` / `__mergedChildren`; the `deleted` tombstone comes from the bus, by the same
  path as every other soft delete. Both audit sides are still atomic (T-39-09 satisfied), the emit
  still reaches webhooks and workflow triggers (Test 9), there are still ≥3 `tx.insert(auditLog)`
  calls (Test 6), and the loser's timeline is strictly more informative — it names the record that
  absorbed it. Also recorded at the same site: nothing is emitted for the SURVIVOR, because
  `organization.updated` is audited too and would duplicate the `merged` row's diff.
- **Files modified:** `src/lib/mutations/dedup.ts`
- **Commit:** `44f70a6`

**2. [Rule 3 — Blocking] `MERGE_EXCLUDED_COLUMNS` did not exclude the 0017 generated columns**

- **Found during:** Task 2, before writing the survivor UPDATE
- **Issue:** 39-02 wrote `MERGE_EXCLUDED_COLUMNS` and 39-05 added `organizations.norm_name`,
  `people.norm_name`, `people.norm_email` and `people.norm_phone` as `GENERATED ALWAYS` columns —
  wave-1 siblings in separate worktrees, neither able to see the other. `buildMergeFieldGroups`
  therefore compares them, `applyMergeChoices` puts them in `native`, and the survivor UPDATE would
  carry `SET norm_name = …`, which PostgreSQL rejects with SQLSTATE 428C9. **Every organization and
  person merge would have failed.** The merge screen would also have asked users to choose between
  two normalized names.
- **Fix:** the three property names joined `MERGE_EXCLUDED_COLUMNS` (root cause, fixes the screen
  too), listed by name because that module is deliberately database-free. Two independent guards
  back it: `writableNativeValues` in `dedup.ts` filters generated columns off the table itself, and
  `dedup.test.ts` holds the drift alarm — every generated column of both tables must appear in the
  set, plus an anti-vacuity assertion that the loop found at least three.
- **Files modified:** `src/lib/dedup/field-groups.ts`, `src/lib/dedup/field-groups.test.ts`,
  `src/lib/mutations/dedup.ts`, `src/lib/mutations/dedup.test.ts`
- **Commit:** `90e5e2c` (the exclusion), `44f70a6` (the derived filter), `d3c6f84` (the alarm)

**3. [Rule 3 — Blocking] The SC-5 coupling gate did not model the merge's shape**

- **Found during:** Task 3, `npm run test`
- **Issue:** `src/lib/audit/no-mutation-coupling.test.ts` models two shapes. Phase 37's carve-out
  requires a file to be one of the four CRM entity modules and to declare at least one
  create/update/delete mutation; everything else falls into `wholeFileScope`, which forbids ANY
  audit reference. `dedup.ts` is neither — one exported function, an event-less audit writer, owns
  no entity — so three assertions went red, and the plan's mandated `tx.insert(auditLog)` cannot
  satisfy the whole-file negative.
- **Fix:** the reviewed extension the gate's own comment asks for. `EVENTLESS_AUDIT_WRITER` now
  recognises `merge*Mutation`; a third scope `DEDICATED_EVENTLESS_MODULES` carries the same three
  anti-vacuity requirements plus a new assertion that every audit row in it goes through `tx` and
  never the module client; `REEMITTING_MODULES` records that `dedup.ts` re-emits an event it does
  not own, keeping the both-ways emitter pin without claiming a fifth entity module; `AuditChanges`
  joins the permitted vocabulary (same class as `AuditActor` — a type-only shape for a column the
  list already permits), and `dedup.ts` imports it through the schema barrel as its siblings do.
  SC-5's claim is unchanged: every event-emitting mutation is still sliced out and asserted
  uncoupled one function at a time.
- **Files modified:** `src/lib/audit/no-mutation-coupling.test.ts`, `src/lib/mutations/dedup.ts`
- **Commit:** `06ba43f`

**4. [Rule 2 — Missing critical functionality] One shared formula budget across the child loop**

- **Found during:** Task 2, step 6
- **Issue:** the plan mandates iterating reparented children explicitly (a survivor-rooted cascade
  short-circuits on `changed.size === 0`) but specifies no budget. `recalculateFormulas` takes a
  per-invocation `budget` defaulting to 500, so a loop over the measured worst case of 114 children
  would grant 114 independent allowances — 57,000 evaluations from one request, which is the
  request-amplification shape T-34-03 exists to forbid ("ONE counter for the saved entity and every
  cascaded child together — never one per child").
- **Fix:** `recalcReparentedChildren` decrements a single allowance by the `evaluations` each call
  returns, passes the remainder as that call's `budget`, and breaks with one identifiers-only warn
  when it is spent. Asserted: budgets `[500, 490, 480]` across three children.
- **Files modified:** `src/lib/mutations/dedup.ts`
- **Commit:** `44f70a6`

**5. [Rule 3 — Blocking] Four zero-occurrence grep gates tripped by my own doc comments**

- **Found during:** Tasks 1 and 2, while checking acceptance criteria
- **Issue:** comments explaining *why* a pattern is forbidden spelled the pattern out, and the plan
  gates those tokens at zero occurrences repo-wide. Phase 35's rule applies: "a doc comment which
  names a token gated at zero occurrences is itself a gate violation — reword rather than weaken."
- **Fix:** four rewordings, each keeping the reasoning and adding a sentence saying why the pattern
  is not spelled out. `Partial<Record<AuditAction, …>>` → "a `Partial<…>` of its `Record`" (three
  sites); `db.insert` → "the module-level client"; `deleteOrganizationMutation` /
  `deletePersonMutation` → cited by file and line. All four gates now measure 0.
- **Files modified:** `src/db/schema/audit-log.ts`, `src/lib/audit/linked-records.ts`,
  `src/app/workflows/[id]/runs/[runId]/components/run-changed-records.tsx`,
  `src/lib/audit/__tests__/audit-action-exhaustive.test.ts`, `src/lib/mutations/dedup.ts`
- **Commits:** `f08ebd6`, `44f70a6`

## Authentication Gates

None.

## Known Stubs

None. Every function in `dedup.ts` is fully wired; no placeholder values, no empty returns feeding a
UI.

## Known Limitations (recorded, not defects)

- **The post-commit recalculation is ONE hop.** A reparented deal's own formula values feed `Deal.*`
  into its activities, and a reparented person's feed `Person.*` into that person's deals; those
  second-hop rows keep stale values. Same class as the purge limitation in STATE.md, but the first
  hop IS repaired here because the parent row still exists. Stated at the call site rather than
  implied.
- **`__`-prefixed marker keys render as unlabelled field rows until 39-12** makes
  `buildAuditFieldChanges` skip them. An ordered dependency, commented on `MERGE_MARKER_KEYS`.
- **B4's constraint half is not proven here.** A mocked write cannot raise `notes_migration_uniq`.
  The test file's header says so and names `src/lib/mutations/dedup.db.test.ts` (39-10) as the proof.

## Threat Flags

None. Every file touched is covered by the plan's `<threat_model>`; no new network endpoint, auth
path, file access pattern or trust-boundary schema change was introduced.

## Self-Check: PASSED

- `src/lib/mutations/dedup.ts` — FOUND
- `src/lib/mutations/dedup.test.ts` — FOUND
- `src/lib/audit/__tests__/audit-action-exhaustive.test.ts` — FOUND
- Commits `f08ebd6`, `90e5e2c`, `44f70a6`, `06ba43f`, `d3c6f84` — all 5 FOUND in `git log`
