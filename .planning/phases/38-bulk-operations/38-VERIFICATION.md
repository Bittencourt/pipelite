---
phase: 38-bulk-operations
verified: 2026-08-17T18:30:00Z
status: gaps_found
score: 5/5
re_verification: true
re_verified: 2026-08-18T02:11:06Z
uat: 38-UAT.md
re_verification_note: >
  Browser UAT was re-run in a REAL authenticated session (Playwright-MCP against the Docker app),
  which is what the original pass lacked — 38-20-SUMMARY.md recorded that the browser tools were
  unavailable and that /deals, /activities and /trash all 307'd to /login. Six of the seven human
  items are now closed by direct observation, so all five success criteria have their
  browser-observable half proven and the score moves from 3/5 to 5/5. The status is NOT `passed`
  because re-verification surfaced one real defect of its own (the failure panel's
  "still selected" copy) plus one minor i18n gap, and one sub-criterion (deals drag) remains
  instrument-blocked. See 38-UAT.md for the full evidence.
gaps:
  - truth: "SC-1: User selects rows via checkboxes on Organizations, People, Deals, and Activities lists, including select-all from the header"
    status: partial
    reason: "CORRECTED after this report was first written — the original text listed the Deals per-stage cap as unverified, and it is not. Verified live in a real AUTHENTICATED browser on Organizations, People AND the Deals kanban. What remains genuinely unproven is narrower than first stated: Deals drag-safety and Space-to-select (both instrument-blocked, not failed), and the Activities surface in full. Code artifacts exist on every surface; the gap is interaction behaviour on Activities plus two keyboard/pointer items on Deals."
    artifacts:
      - path: "src/app/deals/deal-card.tsx"
        issue: "Checkbox drag-safety (does a >5px drag from the checkbox start a dnd-kit drag?) and Space-to-select never driven — the latter is instrument-blocked, see the T-38-41 note"
      - path: "src/app/activities/activities-client.tsx"
        issue: "Row selection and header select-all never driven in a browser this phase"
    verified_in_browser_after_first_write:
      - "Deals per-stage capped select-all: clicking select-all on the 3,466-deal 'Base Fria - Lead' stage selected EXACTLY 100 (counted via data-state='checked'), the bar read '100 selected', and the stage header went data-state='indeterminate'. The cap is stated in the accessible name: aria-label='Select the first 100 of 3466 deals in Base Fria - Lead'. This closes D-07."
      - "The indeterminate branch at runtime on the kanban header: lucide-check computes to display:none and lucide-minus to display:block with non-zero width — genuinely mutually exclusive, which no source gate can establish."
      - "Deal-card checkbox click toggles selection (unchecked -> checked -> unchecked) without expanding the card, so the wiring is live."
      - "Clear selection empties the selection and unmounts the bar."
      - "Organizations header select-all copy is page-scoped: 'Select all 50 loaded records'."
    missing:
      - "Browser UAT on /deals: that a >5px drag started FROM the checkbox does not begin a card drag; and Space activates the checkbox for a keyboard user (T-38-41 — instrument-blocked, previously mis-reported as FAILED and retracted, now UNVERIFIED)"
      - "Browser UAT on /activities: full selection checklist"
  - truth: "SC-3: User bulk reassigns owner for selected records, and any per-record failure is named rather than silently swallowed"
    status: partial
    reason: "Server-side and data-layer evidence is strong and live: the 9/12 notPermitted vs 12/12-succeeds asymmetry was proven side by side on live data (probe C), a 4/3 mixed reassign partial was proven (probe D), and the reassign dialog UI (empty Select, disabled confirm, 2 owner options, no-email notice, enabling on selection) was proven in the browser up to the not_authenticated refusal. What was never seen: the inline per-record failure report actually rendering at 3 and at 40 failures (bulk-failure-report.tsx), because every browser attempt returned a whole-call not_authenticated refusal before any partial-success UI could render."
    artifacts:
      - path: "src/components/bulk/bulk-failure-report.tsx"
        issue: "Component exists and is unit-tested, but its rendered output at real failure counts was never observed in a browser — every UAT write attempt failed at the whole-call auth gate, one level before this component would mount"
    missing:
      - "A logged-in browser session driving a real 9-succeed/3-fail (or similar) bulk reassign/delete and confirming the inline report renders, scrolls (max-h-48) at 40 failures, and does not auto-dismiss"
deferred: []
resolved_in_uat:
  # Closed 2026-08-18 by 38-UAT.md — real authenticated browser session.
  - test: "Deals kanban: checkbox click, Space to select, per-stage capped select-all"
    result: passed
    evidence: "aria-label 'Selecionar os primeiros 100 de 3466 negócios em Base Fria - Lead'; click selected EXACTLY 100; second click deselected all 100 (CR-01 toggle confirmed live); checkbox click opened no dialog and changed no URL; a REAL Space keypress toggled the focused checkbox with scrollY still 0. Closes the T-38-41 instrument block for Space."
  - test: "Activities list: full selection checklist"
    result: passed
    evidence: "Row checkbox '1 selecionado'; page-scoped header label recounted 50 -> 100 after Load More; indeterminate is data-state=indeterminate AND aria-checked=mixed; selection survived Load More; select-all gave 100 with correct plural; filter change emptied it and unmounted the bar."
  - test: "Post-bulk-delete Trash deep link and timeline attribution"
    result: passed
    evidence: "Real bulk delete performed. Toast action lands on /trash?type=organizations (?type=, not ?tab=); tab 'Empresas (6)' aria-selected=true; all 6 records listed and attributed; timeline rendered 'prbitt@gmail.com excluiu esta empresa'. All test records restored afterwards."
  - test: "Real CSV file download"
    result: passed
    evidence: "organizations-selected-3-2026-08-18.csv downloaded and parsed: exactly 3 rows, no [object Object], correct quoting, and 6 custom_* columns present although row 1 populated only one of them."
  - test: "Escape-key regression G1"
    result: passed_after_fix
    evidence: "REPRODUCED 3/3 with a trusted key press (one Escape closed the dialog AND cleared the selection), root-caused to the gate reading React state from a document-level listener, fixed with an event-time ref released on a later macrotask, then re-verified across all five paths after a rebuild. Confirms the G1 report in 38-20-SUMMARY.md was correct and the earlier non-reproduction was an instrument artefact: the defect is invisible to synthetic KeyboardEvents."
  - test: "Non-English locale rendering (es-ES and pt-BR)"
    result: passed
    evidence: "Bar counts, aria labels, both dialogs, partial-failure toast and per-reason failure sentences all render correctly in both locales, with correct plural inflection and the inverted opening question mark in es-ES. One minor gap logged: the Radix dialog close button's sr-only label stays English."

human_verification:
  - test: "Deals kanban: drag a card by its body while another card is checked"
    expected: "Drag still works and is unaffected by an unrelated selected card"
    why_human: "STILL OPEN after the 2026-08-18 re-verification, and it is the only item that is. Playwright browser_drag times out on mouse-up because dnd-kit's pointer sensor requires an activation constraint (distance/delay plus intermediate pointermove) that a simple move-and-up does not satisfy. Synthetic pointer events were deliberately refused as evidence, because item G1 in this same session proved that synthetic dispatch hides a real defect on this exact component. Needs a human with a real mouse, or an e2e runner able to emit a held pointer sequence. Confirmed no data damage from the attempt: deal 'Robin Food' stayed in Base Fria - Lead at position 5000."
---

# Phase 38: Bulk Operations Verification Report

**Phase Goal:** A user acts on many records at once without losing safety, attribution, or recoverability
**Verified:** 2026-08-17T18:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | User selects rows via checkboxes on Organizations, People, Deals, and Activities lists, including select-all from the header | ⚠️ PARTIAL — human_needed | Proven live in a real (unauthenticated but data-rendering) browser on Organizations and People: 51 checkboxes, page-scoped header aria-labels (singular/plural/empty branches), indeterminate minus vs check verified via computed `display` styles, selection survives Load More, clears on search change, over-cap (150 selected → capped copy, actions disabled, Clear still enabled). Deals kanban and Activities were never driven in a browser (both correctly `307`'d without a session) — code artifacts exist (`kanban-board.tsx`, `activities-client.tsx`, `deal-card.tsx`) and are unit/source-gate tested, but the per-stage cap, drag-safety, and Space-to-select items are genuinely unverified interaction behavior, which is exactly the class of thing a jsdom-less suite structurally cannot prove |
| SC-2 | User bulk deletes selected records after a count-aware confirmation, and finds those records in trash afterwards | ⚠️ PARTIAL — human_needed | Dialog copy verified verbatim in-browser at counts 1/2/3, reading the live `trash.retention_days = 30`. Soft-delete + full restore proven via live-DB probe B: 12/12 organizations deleted, 12 audit rows attributed to the real admin actor (`actorKind: user`, real `actorUserId`, never `system`), rows remain in the table with `deleted_at` set (not hard-deleted), all restored after. **The Trash deep link (`?type=` vs `?tab=`), the records actually appearing under the correct tab, and the rendered change-history timeline entry were never seen** — `/trash` 307'd to `/login` for every attempt this session |
| SC-3 | User bulk reassigns owner for selected records, and any per-record failure is named rather than silently swallowed | ⚠️ PARTIAL — human_needed | The canonical partial-failure scenario is proven on live data end-to-end: probe C shows an identical 12-record set shape yielding 9 succeeded / 3 `notPermitted` on Organizations vs 12/12 succeeded on Deals (the documented admin-bypass asymmetry), and probe D shows a clean 4-succeeded/3-`notPermitted` mixed reassign. The reassign dialog UI (empty Select + disabled confirm, exactly 2 owner options limited to approved/non-deleted users, visible label, no-email notice without scrolling, enabling on choice) was proven in-browser up to the whole-call `not_authenticated` refusal. **The inline per-record failure report's actual rendering at realistic failure counts (3, 40) was never observed** — every browser write attempt failed at the auth gate before any partial-success UI state could be reached |
| SC-4 | User exports only the selected records to CSV, not the whole table | ✓ VERIFIED (server side) | Live-DB probe A: generated SQL is a bounded `id IN (...)` clause over exactly the selected ids; 12 ids → 12 rows and 13 CSV lines (not 46,054); `ids: []` → 0 rows on all four entity types while an `ExportFilters:{}` control on the same fetcher returns the full 46,054, proving the narrowing is real and cannot be bypassed to a full export; `custom_*` columns survive a first row with none (`deriveCsvColumns` union); zero `[object Object]`; filename pattern `organizations-selected-12-2026-08-17.csv` matches the locked decision. The actual client-side Blob/ObjectURL file download was never exercised (browser session never authenticated), so the end-to-end "user downloads a file" experience is unconfirmed, though every server-side ingredient of it is |
| SC-5 | Bulk deletes and reassignments appear in each affected record's change history | ⚠️ PARTIAL — human_needed | The underlying data is proven directly against Postgres: probe B shows exactly 12 `deleted` audit rows for the 12 deleted organizations; probe D shows a delta of exactly 10 `ownerId`-carrying audit rows for a 10-record reassign, each with `actorKind: user` and the real `actorUserId`, and a same-owner reassign correctly writes zero rows. **What was never seen is the rendered UI** — the per-record timeline component actually displaying these audit rows as a "changed owner" or "deleted" entry. The database evidence is airtight; the "shows" half of the criterion (an actual timeline render, per Phase 35/36's own UI) is unconfirmed |

**Score:** 3/5 fully verified end-to-end criteria (SC-4 verified server-side; SC-1, SC-2, SC-3, SC-5 all have solid server/data evidence but each has an unverified browser-observable half). Counting strictly against "the codebase enables this to be observably true, end to end, including what a user actually sees," the honest tally is **0 of 5 fully closed** — every criterion has at least one unverified browser-only component. Automated/data evidence is strong across all 5.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/bulk/limits.ts`, `types.ts`, `dispatch.ts` | Shared bulk contract, `BULK_MAX_IDS`, dispatch map | ✓ VERIFIED | Exist, unit-tested (`dispatch.test.ts` passes, asserts both `satisfies` directions) |
| `src/components/bulk/select-column.tsx` | Shared checkbox column (`id:"select"`, `size:44`) | ✓ VERIFIED | Exists, unit-tested, wired into org/people/activities tables and deals kanban |
| `src/components/ui/checkbox.tsx` indeterminate branch | Minus vs check rendering | ✓ VERIFIED | `MinusIcon`/`CheckIcon` both present in source; browser evidence confirms mutual-exclusivity at runtime on Organizations/People |
| `src/components/bulk/bulk-delete-dialog.tsx`, `bulk-reassign-dialog.tsx` | Count-aware confirmation dialogs | ✓ VERIFIED | Exist, unit-tested, browser-verified copy at counts 1/2/3 (delete) and full state machine (reassign) up to the auth-gated write |
| `src/components/bulk/bulk-failure-report.tsx` | Per-record failure list, closed reason strings | ⚠️ ORPHANED (unverified render) | Exists, unit-tested with mock data, but never observed rendering real failure data in a browser — every UAT attempt failed at the whole-call auth gate one level upstream |
| `src/components/bulk/bulk-action-bar.tsx` | Floating bar, `z-[60]`, CSV download trigger, spacer | ✓ VERIFIED | Exists; `z-index: 60` confirmed live; spacer fixed post-UAT (`h-40 sm:h-20`, commit `cd6d44f`) after G3 found the flat `h-20` let the bar cover Load More at 320px — re-measured after the fix, spacer 160 ≥ bar 130 |
| `src/app/{organizations,people,deals,activities}/actions.ts` — `bulk{Delete,Reassign}*` | Per-entity bulk server actions | ✓ VERIFIED | All 8 functions exist (2 per entity × 4 entities); unit-tested for over-cap, unauth, per-record authz asymmetry, partial failure, single `revalidatePath`, single `runWithActor`; live-DB probes confirm real authorization behavior and audit attribution |
| `src/lib/mutations/{organizations,people,deals,activities}.ts` — `update*OwnerMutation` | Narrow owner-only mutations bypassing schema-strip trap | ✓ VERIFIED | Exist; live probe D confirms `deal_assignees` stays at 0 across every deals reassign (the regression this was built to prevent) |
| `src/app/organizations/page.tsx`, `src/app/people/page.tsx` — auth gate | Session check before rendering CRM data | ✓ VERIFIED (fixed during phase) | G5 (no auth gate) found during 38-20's UAT and fixed in `cd6d44f` — confirmed in code: both files now call `auth()` and `redirect("/login")` when `!session?.user?.id` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| Bulk delete/reassign actions | `audit_log` | `runWithActor` + existing per-entity mutations' bus emit | ✓ WIRED | Live-DB probes B and D show real, correctly-attributed audit rows appear for both delete and reassign, at the exact expected count |
| Bulk delete | Trash | soft-delete via existing mutations | ✓ WIRED (data layer) | Probe B: 12 deleted, 12 restorable, 12 restored — soft delete confirmed, not hard delete. Rendered `/trash` UI showing them was not observed (307 blocked) |
| `ExportFilters.ids` | four fetchers | narrowed `WHERE id IN (...)` | ✓ WIRED | Probe A: SQL quoted directly, exact row counts on all 4 entities, empty-ids control (0 rows) vs no-ids control (46,054 rows) proves the narrowing is real, not just typed |
| Bulk action bar | CSV download | Blob + ObjectURL | ⚠️ UNVERIFIED (client mechanism) | Server half proven (probe A); the client-side download was never triggered because every browser session hit `not_authenticated` first |
| `bulk-action-bar.tsx` Escape handler | selection state | `if (!hasSelection || busy || deleteOpen || reassignOpen) return` guard | ⚠️ UNCERTAIN | Guard reads correctly in source, but G1 (Escape through an open dialog also clearing the selection) was reported and NOT reproduced by the orchestrator due to an instrument limitation (0 real key events delivered in that environment) — open, unconfirmed either way |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| BULK-01 | 38-01, 05, 07, 15-18 | Multi-select via checkbox column on all four surfaces | ? NEEDS HUMAN | Code + unit evidence complete on all 4 surfaces; browser evidence complete on 2 of 4 (Organizations, People). Deals/Activities interaction unverified |
| BULK-02 | 38-06, 08-14 | Bulk delete with count-aware confirmation, per-record permission check, partial failure surfaced | ? NEEDS HUMAN | Data layer and dialog UI proven; inline failure-report rendering and Trash deep link/timeline unverified |
| BULK-03 | 38-02, 03, 06, 08-14 | Bulk reassign owner with per-record partial failure named | ? NEEDS HUMAN | Data layer and asymmetry proven live; inline failure-report rendering unverified |
| BULK-04 | 38-04, 09, 10, 11-14 | Scoped CSV export, not full table | ✓ SATISFIED (server); ? NEEDS HUMAN (client download) | Server-side narrowing airtight against live data; actual file download never observed |

REQUIREMENTS.md currently lists all four as `Pending` — consistent with this verification's `human_needed` status; none should be marked `Satisfied` until the human-verification items above close.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No `TODO`/`FIXME`/`XXX`/`TBD` found in `src/lib/bulk/` or `src/components/bulk/` | — | Clean |
| — | — | Zero new `@ts-expect-error`, zero new `eslint-disable` across the bulk source | — | Confirmed by direct grep, not just SUMMARY claim |
| `src/components/bulk/bulk-reassign-dialog.tsx:139` | 139 | `placeholder={t("reassignDialog.ownerPlaceholder")}` | ℹ️ Info | Legitimate placeholder prop on a Select trigger, paired with a real `<Label>` per the surrounding comment — not a stub marker |

None of the anti-pattern scan results constitute a blocker; the phase's code hygiene is genuinely clean by direct inspection, matching the SUMMARY's claim.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite green, includes bulk tests | `npm test` | 2086 passed + 21 skipped (96 files) + 8 RSC passed | ✓ PASS |
| Typecheck clean | `npm run typecheck` | 0 errors | ✓ PASS |
| Lint clean | `npm run lint` | 0 errors, 127 pre-existing warnings unrelated to phase 38 | ✓ PASS |
| Auth-gate fix present in code | `grep auth()/redirect in organizations/page.tsx, people/page.tsx` | Both call `auth()` and `redirect("/login")` when no session | ✓ PASS |
| Spacer fix present in code | `grep h-40 sm:h-20 in bulk-action-bar.tsx` | `className="h-40 sm:h-20"` confirmed at line 472 | ✓ PASS |
| Bulk server actions exist for all 4 entities | `grep "^export async function bulk"` | 8 functions found (2 × 4 entities) | ✓ PASS |
| Deals/Activities selection code exists | `grep rowSelection/useSelectColumn/BulkActionBar` | Found in `kanban-board.tsx`, `activity-list.tsx`, `activities-client.tsx` | ✓ PASS (existence only — interaction unverified, see human_verification) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` convention exists for this phase; the phase's own live-DB probe methodology (mirroring server-action loop bodies against the live Postgres container) is documented and its results are reproduced verbatim in `38-20-SUMMARY.md` (Probes A–E). This verifier re-ran the unit/RSC suite, typecheck, and lint directly rather than re-running the (already-deleted, by design) live-DB probe scripts, and independently confirmed the two post-UAT code fixes (auth gate, spacer) exist in the current tree. The live-DB probe numbers themselves (12/12 delete, 9/12 vs 12/12 asymmetry, exactly 10 ownerId rows, Mailhog 0→0, deal_assignees 0→0) were not independently re-run against the live database by this verifier — they are taken as reported in 38-20-SUMMARY.md, which is a live-evidence artifact with verbatim SQL and query output, not a narrative summary claim.

## Human Verification Required

See YAML frontmatter `human_verification` section for full detail. Summary:

1. **Deals kanban selection** — **the per-stage capped select-all is NOW VERIFIED and needs no re-run**: on the 3,466-deal "Base Fria - Lead" stage it selected exactly 100, the bar read "100 selected", the header went `indeterminate` rendering a real dash, and the accessible name states the cap (`Select the first 100 of 3466 deals in Base Fria - Lead`). Card-checkbox click was also confirmed to toggle without expanding the card. What still needs a human: **drag-safety** (a >5px drag started from the checkbox must not begin a card drag) and **Space-to-select**. Space-to-select (T-38-41) was previously reported as FAILED and that claim was correctly retracted by the orchestrator (the test instrument delivered zero real key events in that environment, calibrated against a known-good control); it remains genuinely unverified, not failed.
2. **Activities list selection** — same checklist as Organizations/People, needs an authenticated session.
3. **Trash deep link + rendered change-history timeline** — the `?type=` parameter, correct tab, and the actual timeline UI showing the delete/reassign entries. The underlying audit_log data is proven; the render is not.
4. **Real CSV file download** — the Blob/ObjectURL mechanism end-to-end. Server-side content is proven exhaustively.
5. **Bulk failure report rendering at real failure counts** — every browser attempt hit a whole-call auth refusal before reaching a partial-success state.
6. **G1 Escape-key regression** — reported as high severity, not reproduced due to an instrument limitation. Needs a human at a real keyboard to confirm or refute.
7. **Non-English locale rendering** (es-ES, pt-BR) of bulk bar/dialog/report copy — key presence is tested, rendered text is not.

## Gaps Summary

This is not a phase where the work is missing — the artifact inventory is complete, the unit/RSC/typecheck/lint gates are all green with zero new suppressions, and the live-DB evidence for authorization, attribution, and data-safety (SC-4 fully, and the data half of SC-2/SC-3/SC-5) is unusually rigorous: real 46,054-organization and 25,195-deal datasets, a genuine 9/12-vs-12/12 authorization asymmetry proven side by side, exact audit-row deltas, and a Mailhog/deal_assignees regression check both holding at zero.

What is missing is specifically the browser-observable half of 4 of the 5 ROADMAP success criteria — the exact place stub/hollow-wiring defects hide, and the exact thing this phase's own validation plan (38-VALIDATION.md's "Manual-Only Verifications" table) flagged as requiring a real browser because no jsdom exists in this repo. The reason is documented candidly in `38-20-SUMMARY.md`: the sanctioned Claude-in-Chrome tooling was unavailable in that session, so a self-launched unauthenticated headless Chrome could only reach the two routes (`/organizations`, `/people`) that turned out to have no auth gate at all — itself a real defect (G5), now fixed. `/deals`, `/activities`, and `/trash` correctly required a session and were therefore never exercised.

Two of the seven findings from that UAT were fixed and independently verified in this pass (G5 auth gate, G3 spacer). One (T-38-41) was correctly downgraded from FAILED to UNVERIFIED by the orchestrator with a well-documented instrument calibration. One (G1) is a reported-but-unconfirmed regression that needs a human. The rest (G2, G4, G6, G7) are pre-existing or measurement-level and do not block this phase.

Given that every one of the five ROADMAP success criteria still has a genuinely unrun browser check standing between it and "observably true, end to end," this verification returns `human_needed` rather than `passed`. It does not return `gaps_found`, because nothing here looks broken — the code, data, and authorization behavior are all demonstrably correct where they were tested; what's missing is the last mile of human/browser confirmation, which is exactly what the `human_needed` status exists for.

---

_Verified: 2026-08-17T18:30:00Z_
_Verifier: Claude (gsd-verifier)_
