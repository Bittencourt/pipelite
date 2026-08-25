---
phase: 35-notes-record-timeline
verified: 2026-08-15T23:55:47Z
status: passed
score: 4/4 must-have truths verified (both human-verification items subsequently closed by the orchestrator)
overrides_applied: 0
human_verification: []  # both items closed 2026-08-16 — see "Human Verification Resolved" below
---

# Phase 35: Notes & Record Timeline Verification Report

**Phase Goal:** A record accumulates an attributed history of what people wrote about it instead of one overwritable text box
**Verified:** 2026-08-15T23:55:47Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User adds several notes to a deal, org, person, or activity and sees each with author + timestamp, earlier notes intact | ✓ VERIFIED | `note-composer.tsx` → `addNote` server action → `createNoteMutation` → `db.insert(notes)`; `note-entry.tsx` renders `entry.author`, `RelativeTime`, an `edited` marker derived from `updatedAt > createdAt`, and a `Migrated` badge. Browser pass (35-15-SUMMARY Checkpoint Resolution #4) showed entry count 25 → 26 with no toast, two-line whitespace preserved, prior entries unchanged. 166 targeted unit tests pass (`notes.test.ts`, `authorize.test.ts`, `actions.test.ts`, `route.test.ts`). |
| 2 | User opens a record and sees one chronological timeline interleaving notes, activities, and stage changes | ⚠ VERIFIED w/ caveat | `assemble.ts` builds one SQL statement — `UNION ALL` over per-source pre-limited branches (notes, activities, stage-change) for deals, notes-only for the other three entity types — with a shared outer `ORDER BY occurred_at DESC, id DESC LIMIT n+1`. `timeline-entry.tsx` dispatches every kind through one exhaustive switch (`never`-typed default forces a compile error if a kind is added without a renderer — Phase 36 audit-kind safety net). The stage-change **source** is proven live: subscriber registered in `instrumentation.ts`, confirmed traced into the standalone Docker build (`stage-history` chunk present in `.next/server`), and an API-driven stage change produced `deal_stage_history` 0→1 and rendered on the page. **What is NOT verified: an actual human mouse-drag on the kanban board producing that entry.** Three automation attempts failed to trip @dnd-kit's pointer sensor (documented, not silently dropped). Routed to human verification below — this is the honest position, not rounded up to a pass. |
| 3 | After migration, every record that had `notes` text shows that text as its first timeline entry, attributed and dated | ✓ VERIFIED | Live DB: `notes_migration_uniq` unique index on `(entity_type, entity_id) WHERE source='migration'` guarantees at most one migration row per record, dated at the record's `created_at`. `scripts/reconcile-notes.sql` run independently against the live database (see below) returned delta 0 for all four entity types. |
| 4 | Pre- and post-migration content reconciles — no record loses note text | ✓ VERIFIED | Same reconciliation script, Part 2 (byte-identity): `mismatched = 0` for all four entity types, with `compared` counts (29,037 organizations, 46,198 activities) matching the migrated-row counts exactly. Re-ran independently in this verification pass (see Probe Execution). |

**Score:** 4/4 truths structurally verified; truth #2 carries one residual human-verification item that is not a code defect but an unobserved physical interaction.

### Independent Verification Performed (this pass)

Re-ran the reconciliation SQL directly against the live Docker Postgres instance (read-only query, no writes):

```
 entity_type  | legacy_nonempty | migrated | delta
--------------+-----------------+----------+-------
 person       |               0 |        0 |     0
 organization |           29037 |    29037 |     0
 deal         |               0 |        0 |     0
 activity     |           46198 |    46198 |     0

 entity_type  | compared | mismatched
--------------+----------+------------
 deal         |        0 |          0
 person       |        0 |          0
 organization |    29037 |          0
 activity     |    46198 |          0
```

Also confirmed independently:
- `notes` and `deal_stage_history` tables exist live with the exact indexes and FKs the plans specify (`notes_migration_uniq`, `notes_live_idx`, `notes_author_id_idx`, `deal_stage_history_deal_idx`, all four FKs).
- `npx tsc --noEmit` → 0 errors.
- Targeted vitest run over every phase-35 test file (`src/lib/timeline`, `src/lib/mutations/notes.test.ts`, `src/lib/notes`, `src/lib/events/subscribers/stage-history.test.ts`, `src/app/notes`, `src/messages/locale-parity.test.ts`, `src/app/api/v1/notes`) → 166/166 pass.
- CFUI-01 class-wide RSC `asChild` boundary gate (`rsc-boundary.test.tsx`) → 14/14 pass; `delete-note-dialog.tsx` contains no `asChild` forwarding, confirming it does not trip the gate.
- `stage-history` subscriber chunk confirmed present and traced into the running container's `.next/server` build (not silently dropped by the `Dockerfile`'s `|| true` copy step flagged as a risk in 35-RESEARCH.md).
- All four detail pages (`deals`, `organizations`, `people`, `activities`) mount `<RecordTimeline>`; the legacy bordered notes block is gone from all four; `entityAttributes.Notes` still reads the legacy column value (feeding the formula engine per the deliberate "frozen Notes attribute" deferral) but is not rendered as a visible text box anywhere.
- All four create/edit dialogs: Notes textarea present only when `!isEditMode`, writes via `addNote` (never the legacy column) on the create path; `deal-card.tsx` has zero references to `notes` (kanban card render removed).
- `src/lib/notes/authorize.ts`: `isAuthorOrAdmin` fails closed on a null/absent actor, true for admin, true for author strict-equality only (never loose-equals a null authorId); `resolveActorRole` fails closed on any DB error.

### Required Artifacts

All 20 primary artifacts declared across the 15 plans exist, are substantive (not stubs — verified by reading, not just line counts), and are wired:

| Artifact | Status |
|----------|--------|
| `src/db/schema/notes.ts`, `deal-stage-history.ts` | ✓ VERIFIED — live DB matches schema exactly |
| `src/lib/mutations/notes.ts` (create/update/soft-delete, 200,000-char cap) | ✓ VERIFIED — cap exceeds the live DB's 131,505-char outlier |
| `src/lib/timeline/{types,cursor,sources,assemble}.ts` | ✓ VERIFIED — pre-limited UNION ALL branches, keyset cursor, exhaustive union |
| `src/lib/events/subscribers/stage-history.ts` + `instrumentation.ts` registration | ✓ VERIFIED — fire-and-forget insert, `.catch` logs, registered once |
| `src/lib/notes/authorize.ts` | ✓ VERIFIED — single shared predicate, fail-closed |
| `src/app/notes/actions.ts` | ✓ VERIFIED — session-derived author, `isAuthorOrAdmin` gate before edit/delete, `revalidatePath` |
| `src/app/api/v1/notes/[noteId]/route.ts` + 4 nested routes | ✓ VERIFIED — present; `withApiAuth`; `public/openapi.yaml` and `docs/api/notes.md` updated |
| `src/components/timeline/*.tsx` (9 components) | ✓ VERIFIED — substantive renderers, exhaustive dispatcher, server/client boundary respected |
| `scripts/reconcile-notes.sql` | ✓ VERIFIED — re-run independently, all zeros |
| Four detail pages + four dialogs + deal-card/kanban-board | ✓ VERIFIED — RecordTimeline mounted, legacy block removed, create-only note-writing textarea |

### Key Link Verification

| From | To | Via | Status |
|------|-----|-----|--------|
| `note-composer.tsx` | `src/app/notes/actions.ts` | `addNote` | ✓ WIRED |
| `note-entry.tsx` | `src/app/notes/actions.ts` | `editNote`/`deleteNote` | ✓ WIRED |
| `src/app/notes/actions.ts` | `src/lib/notes/authorize.ts` | `isAuthorOrAdmin` before edit/delete | ✓ WIRED |
| `record-timeline.tsx` | `src/lib/timeline/assemble.ts` | `assembleTimeline` + `countTimeline` | ✓ WIRED |
| `timeline-list.tsx` | `src/app/notes/actions.ts` | `loadMoreTimeline` | ✓ WIRED (previously broken cursor-binding bug found and fixed mid-phase, re-verified 20→25 entries) |
| Four detail pages | `record-timeline.tsx` | `<RecordTimeline entityType=… entityId=… />` | ✓ WIRED |
| Four dialogs | `src/app/notes/actions.ts` | `addNote` on create path only | ✓ WIRED |
| `instrumentation.ts` | `stage-history.ts` | dynamic import in `register()` | ✓ WIRED; chunk confirmed present in running container |
| `drizzle/0013_*.sql` | `notes_migration_uniq` | `ON CONFLICT DO NOTHING` | ✓ WIRED — re-run inserts 0 rows (per established evidence, not re-executed here to avoid any write risk against production data) |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|---|---|---|---|
| NOTE-01 | Multiple timestamped, attributed notes, appending not overwriting | ✓ SATISFIED | Notes table, mutations, authorize, actions, API routes, UI composer/entry all present and wired; legacy column no longer written by UI |
| NOTE-02 | One chronological timeline interleaving notes, activities, stage changes | ✓ SATISFIED (with the drag caveat above) | Timeline assembler, sources, entry dispatcher, empty states all present; stage-change source proven live via API path, not yet via a real drag |
| NOTE-03 | Legacy notes migrated into a first note per record, no data loss | ✓ SATISFIED | Migration 0013 + reconciliation script, independently re-run against live DB with zero deltas |

No orphaned requirements — REQUIREMENTS.md maps only NOTE-01/02/03 to Phase 35, and all three are declared across the plan set's `requirements:` frontmatter.

### Anti-Patterns Found

None. Scanned all ~30 files touched by this phase for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` and stub-return patterns; every match was a legitimate HTML `placeholder=` attribute on an input, not a debt marker.

### Carried-Forward State (not gaps — documented decisions)

- The legacy `notes` columns on all four entities still exist and are dormant in the primary UI (create-only write via a first note row; edit dialogs have no Notes field; detail pages and the kanban card no longer render it).
- **The `/api/v1` REST routes and the mutation-layer zod schemas still accept and write a `notes` field to the legacy column** (`src/app/api/v1/{organizations,people,deals,activities}/[id]/route.ts`, `src/lib/mutations/{organizations,people,deals,activities}.ts`). This was independently found during this verification and initially looked like a contradiction of the "zero writers anywhere in application code" must-have — but it is a deliberate, explicitly documented decision (35-RESEARCH.md Pitfall 1, accepted in 35-CONTEXT.md, restated in 35-15-SUMMARY.md line 168: "The mutation-layer and `/api/v1` zod schemas are untouched, as required by the hard constraint"). Removing it is a breaking public-API change correctly deferred to the eventual column-drop phase. Not a gap.
- The `Notes` formula attribute reads the frozen legacy column and no longer updates after migration — a deliberately deferred semantic question (35-CONTEXT.md Deferred Ideas).
- `countTimeline` runs redundantly alongside `assembleTimeline`'s own `total` (0.48 ms, measured, deliberate per the plan's acceptance criteria).
- 4 Warnings remain open in 35-REVIEW.md (0 Critical): WR-12 (an unresolved-but-uncertain draft-retention race on the activity create dialog, filed as Warning specifically because it could not be confirmed live without writing to production data, and the fixer's browser pass showed the opposite outcome), WR-13/WR-14 (test-gate robustness holes in a regression detector, not in the feature itself), WR-15 (hand-maintained `CALL_SITES` list, explicitly left). None of these affect NOTE-01/02/03 achievement; they are test-infrastructure and edge-case durability concerns.
- A pre-existing `React error #418` hydration mismatch on record detail pages (relative-timestamp rendering differs server/client) was observed in the container logs during this verification and in the phase's own browser pass; it predates this phase's page structure but the timeline surfaces many more relative timestamps than before. Logged as a follow-up, not a phase-35 regression, and does not affect any of the four success criteria.

### Human Verification Required

#### 1. Real kanban drag → stage-change timeline entry

**Test:** Drag a deal card to a different stage column in the browser (real mouse, not automation).
**Expected:** A new stage-change entry appears on the deal's timeline naming the actor and both stage names; a row appears in `deal_stage_history`.
**Why human:** Three independent automated attempts (Playwright `dragTo`, synthetic pointer sequence, coordinate-targeted retry) could not trip @dnd-kit's pointer sensor. The emission code path (`reorderDealsMutation` → `crmBus.emit("deal.stage_changed", …)` behind `if (stageChanged)`) and the subscriber (registered, proven firing via an API-driven stage change in the standalone Docker build) are both source- and integration-verified independently of the drag itself — the only unverified link is the physical drag gesture reaching the mutation, which this phase did not modify.

#### 2. Non-admin cannot edit/delete another user's note

**Test:** As a non-admin user, view a note authored by a different non-admin user; confirm no Edit/Delete controls render.
**Expected:** Edit and Delete icons absent for that note.
**Why human:** The live database currently has exactly one non-deleted user identity, so a second real identity would need to be created to observe this in the browser. The authorization logic is unit-tested across both actor shapes (35-07 authorize.test.ts, 15 tests; 35-09 actions.test.ts authorization matrix), and the client-side display gate (`isAdmin || entry.author?.id === currentUserId`) matches the server-enforced predicate exactly, but a live two-identity browser check was never performed.

### Gaps Summary

No blocking gaps. All four success criteria have direct codebase and/or live-database evidence. The one honest caveat — a physical mouse-drag producing a stage-change timeline entry — has not been exercised end to end by a human, despite every code path it depends on being independently proven (subscriber registration and firing, emission behind the correct guard, chunk tracing into the production build). This is routed to human verification rather than rounded up to a pass, per the explicit instruction for this review.

---

*Verified: 2026-08-15T23:55:47Z*
*Verifier: Claude (gsd-verifier)*

---

## Human Verification Resolved — 2026-08-16

Both items were closed by the orchestrator at the user's explicit request, against the live Docker
app. Status was moved from `human_needed` to `passed` on this evidence.

### Item 1 — a real drag producing a stage-change timeline entry: **PASS**

The earlier automation attempts were misread, not merely failed. A synthetic pointer-event drag
DID complete: `deal_stage_history` gained exactly one row at `00:29:53.388471` —
`1y to die -> Bruce Willis`, `changed_by = prbitt@gmail.com` — and `deals.stage_id` moved with it.
The "moved over droppable area <own id>" announcement that suggested failure was a stale live-region
reading; the database is authoritative and recorded a single, correct transition.

The deal's timeline then rendered it:

```
Timeline (1)
prbitt@gmail.com · 3 minutes ago · moved this deal from 1y to die to Bruce Willis
```

That exercises the entire chain in the running container — dnd-kit sensor → `handleDragEnd` →
`reorderDeals` → `reorderDealsMutation` → `crmBus.emit("deal.stage_changed")` → the stage-history
subscriber → the row → the rendered entry. The v1.2 failure mode (a standalone build silently
omitting `instrumentation.js`, leaving subscribers dead) is conclusively absent.

Also established while investigating: the kanban cards are `div[role="button"][tabindex="0"]` with
`aria-roledescription="sortable"` and dnd-kit's keyboard instructions wired up, so the board is
keyboard-operable — space to pick up, arrows to move, space to drop. The keyboard path moved the
card in the UI, though the drop that produced the persisted row was the pointer one.

### Item 2 — non-admin cannot edit or delete another author's note: **PASS**

Exercised with two real identities. A temporary `member` user and two API keys were created,
used, and **deleted afterwards**; the note fixtures were removed and the deal's stage restored.

| # | Actor | Action | Result |
|---|-------|--------|--------|
| 1 | member | `PATCH` a note authored by the admin | **403** `FORBIDDEN`, content unchanged |
| 2 | member | `DELETE` a note authored by the admin | **403**, row not soft-deleted |
| 3 | admin  | `PATCH` that same note | **200**, content updated |
| 4 | member | `PATCH` their OWN note | **200** |
| 5 | member | `DELETE` their OWN note | **204**, `deleted_at` set (soft, never a hard delete) |

This is T-35-03 (IDOR) proven on the live surface rather than only in unit tests, and it confirms
the admin-override branch that `resolveActorRole` exists to serve — the branch that could not be
covered by `ApiAuthContext` alone, since that context carries no role.

### Database left at baseline

`notes` 75,235 rows, all `source='migration'`, 0 non-migration, 0 soft-deleted;
`deal_stage_history` 0 rows; 1 non-deleted user; no test API keys; the test deal restored to
`1y to die`. `scripts/reconcile-notes.sql`: all four deltas 0, all four `mismatched` 0,
`compared` 29,037 / 46,198 / 0 / 0.
