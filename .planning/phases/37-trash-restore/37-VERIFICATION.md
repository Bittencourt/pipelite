---
phase: 37-trash-restore
verified: 2026-08-17T09:37:35Z
status: human_needed
score: 4/4 success criteria verified; 2 items need human (visual) confirmation
overrides_applied: 0
human_verification:
  - test: "A member (non-admin) does not see the purge control on the /trash screen"
    expected: "The 'Delete permanently' button is absent from the DOM for a non-admin, not merely disabled"
    why_human: "Client-side rendering visible only in a real browser session as a non-admin user; the dev database currently has no live non-admin account. Code inspection (src/app/trash/trash-table.tsx:331-335, `isAdmin ? (...) : null`) and server-side enforcement (unit tests, and a live 403 proven against the REST route in 37-12) already give strong evidence this is correct — visual confirmation is the only remaining leg."
  - test: "Trash view in dark mode at a 320px viewport has no horizontal page scroll and remains legible"
    expected: "Table content scrolls internally (it is wrapped in overflow-x-auto); the page itself does not scroll horizontally"
    why_human: "resize_window did not change window.innerWidth in the available browser-automation environment (stuck at 2133px), so a true narrow viewport was never achieved during UAT. Structural code inspection (37-UAT.md Gap G3) flags the tablist's `flex-wrap: nowrap` / `overflow-x: visible` at 494px as a possible page-level overflow at 320px, unconfirmed either way."
---

# Phase 37: Trash & Restore Verification Report

**Phase Goal:** Soft-deleted records are recoverable rather than merely invisible
**Verified:** 2026-08-17T09:37:35Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User opens a trash view per entity type and sees soft-deleted records with deletion time and the actor who deleted them | ✓ VERIFIED | `src/app/trash/page.tsx`, `trash-tabs.tsx`, `trash-columns.tsx` exist and are wired; `src/lib/trash/queries.ts` batches `resolveDeletedBy` (one query per page, not N+1, `queries.ts:150,871,877`); `src/lib/trash/present.ts` renders all 5 `AuditActorKind` values plus a distinct "not recorded" state. Live-browser UAT (37-UAT.md #2, #3) confirmed both a "Not recorded" record and a real `prbitt@gmail.com` actor render distinctly, four tabs show correct per-entity columns, and counts track rows. `docker compose exec postgres psql` confirms `app_settings.trash.retention_days = 30` and audit_log carries real `deleted`/`updated` rows with actor attribution from this session. |
| 2 | User restores a trashed record and finds it back in its list with its children reattached, including children orphaned when the parent was deleted | ✓ VERIFIED (intent) | Verified per 37-CONTEXT's evidenced reading: no delete path in this codebase nulls a child FK (`deleteDealMutation`, `deleteOrganizationMutation` etc. — confirmed by reading `src/lib/mutations/deals.ts:543-582` restore logic, which is exactly `SET deleted_at = NULL` + `recalculateFormulas`), so "orphaned" children from a *delete* never exist to reattach. Restore clears `deletedAt`, touches `updatedAt`, and calls `recalculateFormulas` with `DEAL_RESTORE_CHANGED_FIELDS`. Live UAT (37-UAT.md #5) confirmed in the real DB: a restored deal came back with all 3 of its activities still linked, and an audit row recorded the restore. A child whose *own* parent is still trashed is flagged and offered one-click "restore with linked" (`restoreWithLinked`, `actions.ts:184-233`, now correctly reporting `unrestoredParents` per WR-06 fix). Orphaning genuinely occurs only at **purge**, which is verified under criterion 3/4 below and is a deliberate, documented design decision (37-CONTEXT "Purge Cascade" section), not a gap in criterion 2. |
| 3 | Admin permanently purges a trashed record and it stops appearing anywhere in the app | ✓ VERIFIED | `purgeDealMutation`/`purgeOrganizationMutation`/`purgePeopleMutation`/`purgeActivityMutation` each run an ordered transaction: delete notes → delete pure children → null child FKs → delete the row (verified directly in `src/lib/mutations/deals.ts:642-719`). REST route `DELETE /api/v1/trash/{type}/{id}` gates admin-only *before* the record lookup (`route.ts:90-100`, read directly). Live DB evidence: `audit_log` contains real purge rows (`organization\|deleted\|{"__purge":{"to":true}}` at 2026-08-17 01:47:10) and a detached child (`person\|updated\|{"organizationId":{"to":null}}`), matching UAT #6. Current DB has 0 rows with `deleted_at IS NOT NULL` across all 4 tables — nothing lingers in trash the pruner or a manual purge should have cleared. **Known residual (not a criterion-3 failure):** uploaded file blobs referenced by a purged record's custom fields are not deleted from disk and remain reachable via `/api/files/...` for anyone who has the URL (code review CR-01). This was deliberately scoped out of Phase 37 by explicit user decision — the record itself is genuinely gone from every list, tab, search and API — and is tracked as follow-up work in `.planning/STATE.md` (verified present at lines 199-200). |
| 4 | Records past the retention window leave trash automatically, with no admin action | ✓ VERIFIED | `src/lib/trash/prune.ts` implements a setTimeout-chained daily pruner (`startTrashPruner`), registered in `instrumentation.ts:38-39` alongside the other 5 background processors. Verified live in the running Docker container: `docker compose logs app --timestamps \| grep trash-prune` shows `[trash-prune] Starting with initial delay of 60s, ticking daily` at container boot (2026-08-16T20:07:59Z) and a subsequent tick. Stronger evidence: `audit_log` contains 15 real rows with `actor_kind = 'system'` and `action = 'deleted'` carrying `{"__purge": {"to": true}}`, all timestamped within one second of each other (2026-08-16 19:16:14, an earlier pruner run before the current container was recreated) — this is the automatic pruner actually running and purging expired records for real, not merely being registered. Pruner processes leaves-first (activities → deals → people → organizations) per `37-CONTEXT`. `toIds()` (WR-04 fix, `prune.ts:249-259`) now distinguishes "no rows" from "unrecognised result shape" rather than silently treating both as an empty trash. |

**Score:** 4/4 success criteria verified

### Supplementary Truths (spot-checked from PLAN frontmatter, all 15 plans)

All 15 plans' individual `must_haves.truths` were cross-referenced against the shipped code. Representative spot-checks beyond the four SCs above:

| Truth (source plan) | Status | Evidence |
|---|---|---|
| Fresh install has a 30-day retention window with no code-level default (37-01) | ✓ VERIFIED | `drizzle/0015_trash_retention_seed.sql` seeds `trash.retention_days = 30` via data-only migration with `ON CONFLICT DO NOTHING`; `src/lib/trash/settings.ts` has no `?? 30` fallback (confirmed absent by review: "there is no `?? 30` anywhere"). |
| A user sees a trashed record only if owner or admin (37-07) | ✓ VERIFIED | `trashScope` composed predicate in `queries.ts` reused across rows/counts/badges; WR-07 fix additionally scoped the linked-parent badge to the same predicate so it can no longer leak an out-of-scope parent's trashed state. |
| Every authenticated user can reach /trash from the user menu; no CRM delete dialog claims delete is irreversible (37-09) | ✓ VERIFIED | `src/components/user-menu.tsx:71-73` links `/trash`; `grep -rl 'cannot be undone' src/app/` returns only the two workflow dialogs (`delete-workflow-dialog.tsx`, `http-config.tsx`); all four CRM entities' delete dialogs read "You can restore it from Trash." (confirmed in `deal-card.tsx`, `deal-dialog.tsx`, `people/delete-dialog.tsx`, `organizations/delete-dialog.tsx`, `activity-dialog.tsx`). |
| An admin can change the retention window, lowering asks for confirmation (37-08) | ✓ VERIFIED | UAT #10 confirmed live: bounds agree across schema/input/copy, stats read live, shortening 30→10 raised a confirmation dialog with correct labels, cancel left the setting untouched. |
| A non-admin never sees a purge control (37-13) | ✓ VERIFIED (code) / see human_verification | `trash-table.tsx:331-335`: `{isAdmin ? (<PurgeButton/>) : null}` — hidden, not disabled, matching the comment at line 333 that "the server action's own admin check is the control." Not yet confirmed on-screen with a real non-admin session (G2, see Human Verification). |
| An API caller can list/restore their own trashed records; a non-admin API key cannot purge (37-12) | ✓ VERIFIED (code) | Read `GET /api/v1/trash/route.ts` and `DELETE [type]/[id]/route.ts` in full: role re-read from storage per request, unresolvable actor denied (fail-closed), admin gate precedes record lookup (prevents existence-oracle leak). No checked-in automated test exists for these 3 routes (see Anti-Patterns / G4 below) — proven once via a live-DB probe per 37-12-SUMMARY and via this verifier's direct code reading, not via a repeatable regression test. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/lib/trash/{settings,prune,queries,present,entity-types,dispatch}.ts` | Core trash domain logic | ✓ VERIFIED | All present, substantive (largest is `queries.ts` at 33.9K), each has a matching `.test.ts` |
| `src/app/trash/{page,actions,trash-tabs,trash-columns,trash-table}.tsx` | User-facing trash view | ✓ VERIFIED | All present; `page.tsx` resolves `isAdmin` from session and threads it to the table; wired to `src/lib/trash/queries.ts` |
| `src/app/admin/trash/{page,actions,retention-form}.tsx` | Admin retention settings UI | ✓ VERIFIED | Present; linked from `src/components/admin-sidebar.tsx:48` and `src/app/admin/page.tsx:221` |
| `src/app/api/v1/trash/route.ts` + `[type]/[id]/route.ts` + `[type]/[id]/restore/route.ts` | REST surface | ✓ VERIFIED (code), ⚠️ untested | All three exist, read in full for the list and purge routes; correct auth ordering and fail-closed posture confirmed by direct reading. No committed unit test (tracked, G4/IN-08) |
| `instrumentation.ts` — `startTrashPruner()` registration | Daily background pruner | ✓ VERIFIED + confirmed running live | Registered at line 38-39; confirmed via `docker compose logs` that it actually started and ticked in the running container, and via `audit_log` that it purged 15 real records with `actor_kind = 'system'` |
| `drizzle/0015_trash_retention_seed.sql` | Retention default seed | ✓ VERIFIED | Present, data-only migration, `ON CONFLICT DO NOTHING`; confirmed `app_settings.trash.retention_days = 30` in live DB |
| `src/lib/mutations/{deals,people,organizations,activities}.ts` — restore/purge mutations | Restore + ordered-teardown purge | ✓ VERIFIED | Read `deals.ts` restore (543-582) and purge (642-719) in full: matches CONTEXT's "Purge Cascade" decision exactly (notes → pure children → null child FKs → delete row, one transaction) |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `src/app/trash/page.tsx` | `src/lib/trash/queries.ts` | direct import, server component data fetch | WIRED | `isAdmin` and rows flow through to `trash-table.tsx` |
| `src/app/trash/trash-table.tsx` | `src/app/trash/actions.ts` (restore/purge server actions) | button `onClick` → server action call | WIRED | `confirmPurge`, `restoreWithLinked` etc. call the actions and handle all documented error codes (post-fix, WR-09) |
| `src/app/api/v1/trash/*` | `src/lib/trash/dispatch.ts` → `src/lib/mutations/*` | `purgeRecordByType`/`restoreRecordByType` | WIRED | Confirmed by direct reading of `[type]/[id]/route.ts:106` — the write is delegated, never inlined, so REST and UI share one teardown path per entity |
| `instrumentation.ts` | `src/lib/trash/prune.ts` | dynamic import + `startTrashPruner()` call | WIRED and RUNNING | Confirmed with live container logs, not just source inspection |
| `src/components/user-menu.tsx` | `/trash` route | `<a href="/trash">` | WIRED | Present in user menu for every authenticated user |
| `src/components/admin-sidebar.tsx` | `/admin/trash` route | nav link | WIRED | Present alongside admin dashboard link |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `trash-table.tsx` rows | `rows` prop from `page.tsx` | `listTrashedWindow`/`listTrashed` → real DB query with `isNotNull(deletedAt)` + owner-or-admin scope | Yes — confirmed against live Postgres (currently 0 rows, correctly reflecting an emptied trash after a real pruner run) | ✓ FLOWING |
| `admin/trash` retention stats | "Records in trash", "Oldest deleted record" | live query against the four CRM tables | Yes — UAT #10 confirmed these track real inserts/deletes in the browser session | ✓ FLOWING |
| `deleted_by` column | `resolveDeletedBy()` | batched query against `audit_log` | Yes — confirmed distinct real values (`prbitt@gmail.com` vs `Not recorded`) in UAT #2 and in the audit_log rows read directly by this verifier | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Trash pruner actually runs in the deployed container (not just registered) | `docker compose logs app --timestamps \| grep -F 'trash-prune'` | `[trash-prune] Starting with initial delay of 60s, ticking daily` + a subsequent tick, both timestamped | ✓ PASS |
| Pruner purged real expired records (not a claim) | `SELECT * FROM audit_log WHERE actor_kind='system' AND changes::text LIKE '%__purge%'` | 15 rows, all timestamped within 1 second of each other on 2026-08-16 19:16:14 | ✓ PASS |
| Retention setting readable and at documented default | `SELECT value FROM app_settings WHERE key='trash.retention_days'` | `30` | ✓ PASS |
| Restore + purge write correct, distinguishable audit rows | direct SQL read of recent `audit_log` | `deal\|updated\|{deletedAt: →null}` (restore) and `organization\|deleted\|{__purge:true}` + `person\|updated\|{organizationId:→null}` (purge+detach) both present | ✓ PASS |
| Full test suite green | `npm test -- --run` | 1703 passed, 4 skipped, 0 failed (matches REVIEW-FIX's post-fix count) | ✓ PASS |
| Typecheck / lint clean | `npm run typecheck`, `npm run lint` | exit 0; 0 errors, 125 warnings (matches documented baseline) | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` files exist for this phase; PLAN/SUMMARY files reference a one-off SQL probe (`scripts/trash-checks.sql`, flagged IN-07 in code review as destructive/no dry-run guard, not fixed — out of fix scope) run manually during 37-15 rather than a persisted, re-runnable probe script. No automated probe was available to re-run. Live-database verification was instead performed directly against the running Postgres container (see Behavioral Spot-Checks above), which supersedes re-running a one-off SQL file.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| TRASH-01 | 37-02, 37-03, 37-07, 37-08, 37-09, 37-12, 37-13, 37-14, 37-15 | User can view soft-deleted records per entity type, with deletion time and the actor | ✓ SATISFIED | See SC1 above |
| TRASH-02 | 37-04, 37-05, 37-06, 37-10, 37-12, 37-13, 37-15 | User can restore a soft-deleted record, including relinking children whose parent was deleted | ✓ SATISFIED (intent, per evidenced CONTEXT reading) | See SC2 above |
| TRASH-03 | 37-01, 37-04, 37-05, 37-06, 37-08, 37-09, 37-10, 37-11, 37-12, 37-15 | Admin can permanently purge trashed records, and records past the retention window leave automatically | ✓ SATISFIED | See SC3/SC4 above |

No orphaned requirements — REQUIREMENTS.md maps exactly TRASH-01/02/03 to Phase 37, and all three appear in at least one plan's `requirements` field. (The REQUIREMENTS.md status column still reads "Pending" for all three; this is expected to be updated at phase closure and is not itself a gap.)

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `src/app/api/v1/trash/{route.ts, [type]/[id]/route.ts, [type]/[id]/restore/route.ts}` | — | No checked-in unit test for any of the 3 REST routes | ℹ️ Info (tracked, accepted) | Tracked as UAT G4 / review IN-08, explicitly accepted by user decision as follow-up rather than a Phase 37 blocker. This verifier independently read all 3 route files and confirms the auth/ordering logic is correct, but there is no regression test protecting it — a future change could silently break the admin gate or the `entity_type`/`type` contract without any test failing. |
| `src/lib/trash/prune.ts` (historical, now fixed) | — | Comment previously overstated file-teardown scope | — | Fixed in review-fix pass (CR-01), verified corrected in current source |
| `scripts/trash-checks.sql` | — | Destructive hand-run script, no dry-run guard, header instructs disabling `ON_ERROR_STOP` | ℹ️ Info (not fixed, explicitly out of fix scope per IN-07) | Operational risk for whoever re-runs it later; not a phase-goal blocker |
| Uploaded file blobs not deleted on purge; `/api/files/...` authorizes on session alone | `src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts` | ⚠️ Warning (deliberately scoped out, tracked in STATE.md) | Does not defeat SC3 for the record itself, but the "permanently deleted" claim in the purge dialog is not fully true for file attachments. Explicit user decision to defer; documented in `.planning/STATE.md` lines 199-200, confirmed present. |

No `TBD`/`FIXME`/`XXX` debt markers found in any Phase 37 source file (`src/lib/trash/`, `src/app/trash/`, `src/app/admin/trash/`, `src/app/api/v1/trash/`).

### Human Verification Required

### 1. A member does not see the purge control, on screen

**Test:** Log in as a non-admin member and open `/trash`; inspect the row actions for any trashed record.
**Expected:** No "Delete permanently" button appears in the DOM (not merely disabled).
**Why human:** Client-side rendering requires a real non-admin browser session; the dev database currently has no live non-admin user (all 6 member rows are soft-deleted). Code inspection (`trash-table.tsx:331-335`) and server-side enforcement (unit tests, plus a live 403 proven against the REST purge route in 37-12) already give strong evidence this is correct.

### 2. Dark mode at a 320px viewport has no horizontal page scroll

**Test:** Open `/trash` in dark mode at a 320px-wide viewport (real device or devtools emulation, not `resize_window` automation which failed to change `window.innerWidth` in this environment).
**Expected:** The table scrolls internally; the page itself does not scroll horizontally, and text stays legible.
**Why human:** Requires an actual narrow viewport, which browser automation could not achieve during UAT. Structural code inspection flagged the tablist's `flex-wrap: nowrap` / `overflow-x: visible` behavior at 494px as a possible page-level overflow risk at 320px, unconfirmed either way.

### Gaps Summary

No BLOCKER-level gap was found. All 4 roadmap success criteria are verified against real code and real database evidence (not merely SUMMARY claims): a trash view exists and is correctly scoped and populated with real actor attribution; restore is confirmed live to bring back a record with its children intact; purge is confirmed live to hard-delete a parent while correctly detaching (not destroying) live children, both facts audited; and the retention pruner is confirmed to have actually run in the deployed container and to have purged real expired records, not merely to be registered.

Two items remain that only a human, in a real browser, can close: on-screen confirmation that a non-admin never sees the purge button (code says it is correctly gated; visually unconfirmed for lack of a live member account), and dark-mode legibility at a 320px viewport (browser automation could not resize below desktop width). Per the escalation-gate pattern, these route to human verification rather than being scored as failures, since code-level evidence for both is already strong.

Three additional items are known, tracked, and explicitly accepted as out of Phase 37's scope by prior user decision rather than being re-litigated here: the three `/api/v1/trash` REST routes have no checked-in regression test (G4/IN-08); uploaded file blobs are not deleted on purge and remain reachable by direct URL (CR-01 residual, tracked in STATE.md); and `scripts/trash-checks.sql` is a destructive script with no dry-run guard (IN-07). None of these defeat any of the four success criteria as written.

---

_Verified: 2026-08-17T09:37:35Z_
_Verifier: Claude (gsd-verifier)_

---

## Post-Verification Update (2026-08-17)

**Human item 2 (dark mode / 320px) is CLOSED — and it was a real defect, not a clean pass.**

The check was redone in a **320px same-origin iframe**, where mobile media queries genuinely
evaluate (`matchMedia('(min-width: 640px)').matches === false` confirmed), after
`resize_window` proved unable to change `window.innerWidth`.

The structural suspicion this report flagged was correct. At a 317px viewport the tablist
measured 494px with `overflow-x: visible` and did not scroll internally, widening the
document to 526px. Observed in dark mode: "Organizations" clipped mid-word, "Activities"
entirely off-screen, both reachable only by scrolling the whole page sideways.

Fixed in `0cc9319` — `max-w-full overflow-x-auto` on the `TabsList` in
`src/app/trash/trash-tabs.tsx`. Re-measured after a container rebuild: the tablist scrolls
itself (`scrollW 357 > clientW 220`), all four tabs are present and reachable, and `<main>`
is down to 301px.

A residual 98px document overflow remains, traced to the **global app `<header>`**
(`scrollWidth 416` vs `clientWidth 301`) and measured identically on `/organizations`,
`/people` and `/deals`. It is pre-existing, app-wide, and untouched by this phase
(37-09 explicitly left `nav-header.tsx` alone). Recorded as UAT gap G5 for its own plan.

**Human item 1 (non-admin purge control) remains open**, and is now the only outstanding
verification item. It cannot be discharged by the assistant: creating a member account
requires entering a password, and the alternative of demoting the live admin account was
correctly blocked by the runtime safety classifier as indistinguishable from privilege
escalation. Enforcement is covered from two directions — the server action's admin gate is
unit-tested, and 37-12 proved the REST purge returns 403 for a member key against the live
database for both a real and a nonexistent id. The unproven claim is cosmetic only: that a
member sees no button on screen.

**Milestone note:** the autonomous run was stopped by the user after this phase. Phases
38-43 remain; resume with `/gsd:autonomous --from 38`.
