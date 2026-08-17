---
phase: 37-trash-restore
fixed_at: 2026-08-17T06:30:00Z
review_path: .planning/phases/37-trash-restore/37-REVIEW.md
iteration: 1
findings_in_scope: 10
fixed: 10
skipped: 0
status: all_fixed
---

# Phase 37: Code Review Fix Report

**Fixed at:** 2026-08-17T06:30:00Z
**Source review:** `.planning/phases/37-trash-restore/37-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 10 (1 critical, scoped down by user decision; 9 warnings)
- Fixed: 10
- Skipped: 0
- Info findings (IN-01..IN-08): out of scope. IN-01 and IN-04 were corrected as direct
  consequences of WR-08 and WR-03 respectively; the other six were not touched.

**Gates after the last commit:**
- `npm test` — 1703 passed / 4 skipped (project 1) + 8 passed (rsc project). Baseline was 1690;
  the pass added 21 tests. Zero failures, including `condition-evaluator.test.ts` T-34-20 (the
  known CI flake), which also passed 70/70 in isolation.
- `npm run typecheck` — exit 0.
- `npm run lint` — 0 errors, 125 warnings (baseline).

No dependency was installed. No local dev server was started. Every commit was made in an
isolated git worktree and fast-forwarded onto `master`.

## Fixed Issues

### CR-01: A purge leaves the record's file attachments on disk and downloadable

**Scope: deliberately reduced by user decision.** File deletion was NOT implemented and
`src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts` was NOT touched — verified by
diff. Only the false comment was corrected, plus the follow-up record the comment points at.

**Files modified:** `src/lib/trash/prune.ts`, `.planning/STATE.md`
**Commits:** `f4db80a`, `86f6da5`
**Applied fix:** The `BATCH_SIZE` docblock claimed the teardown handles *"notes, files,
custom-field rows and up to six foreign-key detachments"*. Two of those three claims were false
and the third was miscounted. Replaced with an exhaustive statement of what the teardown really
covers (the row, its `notes`, `deal_assignees` and `deal_stage_history` for a deal, and the
foreign keys of live children — at most two detach statements, for an organization), a note that
custom-field *values* need no statement because they ride in the row's own JSONB, and an
explicit `NOT COVERED — UPLOADED FILE BLOBS ARE NOT REMOVED` paragraph explaining that purging
the row destroys the reference and leaves the bytes. `.planning/STATE.md` § Blockers/Concerns now
carries the gap, so the comment's pointer is true rather than aspirational.

### WR-01: The documented `entity_type` round-trip is broken

**Files modified:** `src/app/api/v1/trash/route.ts`
**Commit:** `579936d`
**Applied fix:** Fixed in the serializer, not by widening the write routes. `entity_type` KEEPS
the singular `EntityType` — that key and those values are what `/api/v1/audit` and
`/api/v1/custom-field-definitions` already emit, and re-spelling a shared key's values on one
route would trade one inconsistency for a worse one. A new `type` field carries the plural tab,
which is exactly the `{type}` segment both write routes accept and the `?type=` param this route
accepts, and it is named after the parameter it feeds. The round-trip claim in the comment is now
true of a field that actually round-trips. Additive, so no shipped client breaks.

**Deviation from the review's two suggestions, stated plainly:** the review offered (a) accept
both spellings in the segment or (b) emit the plural in `entity_type`. (a) was excluded by the
user (do not widen the destructive route's allow-list). (b) satisfies the letter of the fix but
introduces a cross-route divergence in what `entity_type` means. The third option taken here
satisfies "make the emitted value round-trip correctly" without that cost.

### WR-02: Purge detaches live children without recalculating their formulas

**Files modified:** `src/lib/mutations/deals.ts`, `src/lib/mutations/people.ts`,
`src/lib/mutations/organizations.ts`, `.planning/STATE.md`
**Commits:** `5c9f51b`, `86f6da5`
**Applied fix:** Took the second branch the user authorised — an honest statement of the
limitation — because recalculation is not implementable here, and the investigation is what
establishes that:

- `changedFields: ["dealId"]` selects nothing. A foreign key is not in
  `ENTITY_NATIVE_ATTRIBUTES`, and `Deal.Value` is a DOTTED ref, which
  `scopeFormulasToChangedFields` admits only via `changedRelatedFields` — so the one-line call
  that looks like the fix is a silent no-op, the worst outcome because it also looks fixed.
- `changedRelatedFields: { Deal: [...] }` does select those formulas, but `recalculateOneEntity`
  passes `relatedEntities` straight to the engine and there is no parent row to pass. An
  unresolvable dotted ref returns `{ value: null, error: "Unknown entity: Deal" }`, which D-06
  stores unconditionally. That writes an internal error string onto live records the admin never
  selected, from the least reversible path in the phase.
- `recalculateFormulas` uses the module-level `db`, not a `tx`, so "inside the transaction" is
  not available to it at all.
- The same gap already exists wherever a child's own foreign key is cleared through the UI, so
  it is a recalculation-scoping limitation that purge makes *permanent*, not one purge introduces.

So the three purge mutations now state at the detach that no recalculation runs, that unlike the
delete path there is no later repair point, and why each locally available call is worse than the
staleness. `purgeDealMutation`'s docblock additionally warns the reader not to read the absence
as the same deferral `deleteDealMutation` makes. No comment asserts a repair that never happens.

### WR-03: One authenticated request can force a 10,000-row read

**Files modified:** `src/lib/trash/entity-types.ts`, `src/lib/trash/entity-types.test.ts`,
`src/lib/trash/queries.ts`, `src/lib/trash/queries.test.ts`, `src/app/api/v1/trash/route.ts`
**Commit:** `3f1f02d`
**Applied fix:** Split by surface, because the two halves have different constraints.

- **UI (`/trash?page=N`)** — `MAX_TRASH_PAGE` lowered from 200 to 20, the review's explicit
  fallback. Worst case per request drops from 10,001 rows and a 10,000-element array bind to
  ~1,001. The cumulative read itself is kept: replacing it with an offset window would turn
  "Load more" into numbered pagination that drops the rows already on screen, and that idiom is
  locked in 37-UI-SPEC. The constant now documents that it bounds *request size*, not view depth.
- **REST (`GET /api/v1/trash`)** — has no such constraint, so it got the real fix. New
  `listTrashedWindow(tab, limit, offset, viewer)` reads a true `LIMIT`/`OFFSET` window through
  the same scoped, ordered query; the per-tab readers take an `offset`; `pageCovering` and the
  post-hoc `.slice()` are gone. Cost is now constant in `limit` and independent of `offset`.
  Attribution moved into a shared `attribute()` helper so the N+1 `resolveDeletedBy` prevents
  cannot come back through whichever reader a later change touches.
- **IN-04 fell out of this as a direct consequence.** The short-response band existed because
  the offset was clamped once for the page and used raw for the slice — the same quantity derived
  twice. `boundedOffset()` is now applied once and is the value the query uses; there is no
  second derivation left to disagree with it.

Pinned by 5 new tests, including one asserting the UI read is *still* cumulative from offset 0,
so a later "optimisation" cannot silently break "Load more" unnoticed.

### WR-04: `toIds` turns a driver-shape change into a silently disabled retention policy

**Files modified:** `src/lib/trash/prune.ts`
**Commit:** `49d7dfa`
**Applied fix:** `toIds` now distinguishes "no rows" from "unrecognised shape" — the fallback is
`null`, not `[]`, and a `null` logs `[trash-prune] unrecognised expiry-query result shape` with
the shape it got (`typeof` only, never the value, which could carry record content into a log)
before returning `[]`. The degradation is preserved on purpose: an exception inside a background
timer is worse. The comment no longer presents the invisibility as a feature.

### WR-05: Server-action arguments other than `tab` are not runtime-validated

**Files modified:** `src/app/trash/actions.ts`
**Commit:** `fd81a14`
**Applied fix:** `parseRecordId(raw: unknown)` narrows to a non-empty string of at most 64
characters; all three actions (and the new preview action) call it and use the narrowed
`recordId` downstream, including in the log line. Placed AFTER the admin gate in `purgeRecord`,
so the gate's existence-oracle property is preserved — a non-admin still gets exactly one answer
whatever the id names. Deliberately a shape test rather than a UUID pattern: the value's only job
is to be a bindable parameter, and encoding "these are all uuid columns" would be wrong the day
one is not. The module header's rule was stated in the plural and applied to one argument; it now
covers both.

### WR-06: `restoreWithLinked` reports success while silently omitting parents it refused

**Files modified:** `src/app/trash/actions.ts`, `src/app/trash/actions.test.ts`,
`src/app/trash/trash-table.tsx`, `src/messages/{en-US,es-ES,pt-BR}.json`,
`src/messages/locale-parity.test.ts`, `.planning/phases/37-trash-restore/37-UI-SPEC.md`
**Commits:** `d1da59d`, `57394ad` (UI-SPEC copy table)
**Applied fix:** The action returns `unrestoredParents: skipped.length + failed.length`. The
table follows the success toast with `toast.warning(t("linkedNotRestored", { count }))` when it is
non-zero. New `trash.linkedNotRestored` in all three locales, added to the parity gate's contract
list with its group count updated, and to the UI-SPEC copy table with a note on why it was added.
A COUNT and never which parents: naming them would disclose the existence of records the caller
may not see, which is the leak the per-parent re-check exists to prevent. Five existing assertions
were tightened to pin the new field rather than loosened to ignore it.

### WR-07: The linked-in-trash badge discloses parents outside the viewer's owner scope

**Files modified:** `src/lib/trash/queries.ts`, `src/lib/trash/queries.test.ts`
**Commit:** `2eeaee4`
**Applied fix:** New `parentTrashedForViewer(deletedAt, ownerId, viewer)` composes the badge's
boolean from the SAME `trashScope` the rows and counts use — not a second hand-written owner
comparison, which is the drift the module's rule 1 exists to prevent. Applied to
`organizationTrashed` and `personTrashed` on the deals tab, `organizationTrashed` on people, and
`dealTrashed` on activities. Under a `LEFT JOIN` with no matched parent every term is `NULL`,
`IS NOT NULL` is `false` and `false AND NULL` is `false`, so an absent parent, a live parent and
an out-of-scope trashed parent all collapse to the same correct answer.

**It degrades, it does not refuse**, which is what the user asked for: the row still renders, and
both the badge (with the parent's name in its title) and the *Restore with linked records* button
simply do not appear — the button would only have been offered to silently skip that parent
anyway. What is deliberately NOT hidden is the parent's name where it is the row's own SECONDARY
column (a deal's organization, an activity's deal): that column is locked in 37-CONTEXT and the
same name is already on the live list the viewer reads their own deals from, so it discloses
nothing new. The leak was the trashed STATE and the badge pairing it with a name.

Pinned by 3 new tests asserting on the PROJECTION (where the predicate now lives) for every tab
that has a parent join, plus the admin case.

### WR-08: The purge confirmation does not mention that live child records are unlinked

**Files modified:** `src/lib/trash/queries.ts`, `src/lib/trash/queries.test.ts`,
`src/app/trash/actions.ts`, `src/app/trash/actions.test.ts`, `src/app/trash/trash-table.tsx`,
`src/messages/{en-US,es-ES,pt-BR}.json`, `src/messages/locale-parity.test.ts`,
`.planning/phases/37-trash-restore/37-UI-SPEC.md`
**Commit:** `57394ad`
**Applied fix:** Implemented rather than deferred. The string is locked in 37-UI-SPEC but no gate
asserts it, and UAT G1 confirmed the defect in the browser (a live person silently lost its
organization), so the copy was amended and the spec amended to match — leaving the spec stale
would have recreated exactly the CR-01 failure mode.

- `countPurgeImpact(entityType, id)` in `queries.ts` counts what the teardown detaches, statement
  for statement: the same tables, the same foreign keys and the same ABSENCE of a `deleted_at`
  filter. Matching the teardown means the number in the dialog and the `detached` count in the
  purge's audit row are the same number; it is also why the function needs no `deleted_at`
  predicate, which keeps rule 2 of that module (no `isNull`, by construction) intact. An activity
  answers 0 with no query. Returns `null`, never `0`, when the count cannot be taken.
- `previewPurgeImpact(tab, id)` server action, admin-gated in the same order as `purgeRecord` so
  it cannot become the existence oracle that ordering closes.
- The dialog fires the preview when it opens, guarded by a `purgeTargetIdRef` so a slow count for
  row A cannot land as row B's impact after the user reopens on a different row.
- `purgeDialog.description` gained the plural clause; `purgeDialog.descriptionUnknownImpact` is a
  separate string for the not-known case, because `0` is a FACT the dialog asserts ("nothing else
  will change") and "we could not find out" must not be able to render as it. Confirm is
  deliberately not disabled while the count is in flight — an admin who confirms early consented
  to the wording actually shown, which promises no number.
- **IN-01 fell out of this as a direct consequence.** `purgeRecord`'s comment claimed the
  `detached` count "is what the toast can honestly add"; the consent is now obtained before the
  write, so the comment states what the value is actually for (what the write measured, and a
  divergence from the previewed count is a real signal) instead of a use that never existed.

Pinned by 6 tests on `countPurgeImpact` and 7 on `previewPurgeImpact`, including that a non-admin
is refused before any lookup and that the action writes nothing.

### WR-09: A `NOT_IN_TRASH` purge failure leaves the stale row on screen

**Files modified:** `src/app/trash/trash-table.tsx`
**Commit:** `7fd17fd`
**Applied fix:** `confirmPurge`'s switch now handles `NOT_IN_TRASH` exactly as
`reportRestoreFailure` does — `t("error.alreadyPurged")` plus `router.refresh()` — and lists
`NOT_AUTHENTICATED` / `NOT_AUTHORIZED` / `FAILED` explicitly before the default, so the two paths
read the same and a future code cannot fall through unnoticed.

## Skipped Issues

None. All 10 in-scope findings were fixed.

Info findings IN-02, IN-03, IN-05, IN-06, IN-07 and IN-08 were left alone per the fix scope
(IN-01 and IN-04 were corrected only because they were one-line consequences of WR-08 and WR-03).
The known-and-accepted decisions the review itself declined to re-litigate — mutations writing
audit rows directly, purge detaching rather than cascading, `api_key` carrying no name — were not
touched.

---

_Fixed: 2026-08-17T06:30:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
