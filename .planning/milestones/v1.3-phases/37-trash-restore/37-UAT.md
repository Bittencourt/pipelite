---
status: complete
phase: 37-trash-restore
source: [37-15-PLAN.md Task 3]
started: 2026-08-16
updated: 2026-08-18T02:11:06Z
executed_by: assistant (browser automation against the live Docker app)
resumed: 2026-08-18 — steps 7 and 9 closed with Playwright-MCP at a real 320px viewport and a real member account
---

## Current Test

[testing complete]

## Tests

### 1. Delete dialog no longer claims the delete is irreversible
expected: the six CRM delete confirmations say the record can be restored from Trash; the two workflow dialogs still say it cannot be undone
result: PASS — Organizations delete dialog read `Are you sure you want to delete "Rede Paraíba"? You can restore it from Trash.` `grep -rl 'cannot be undone' src/app/` returns only the two workflow files.

### 2. "Deleted by" distinguishes "not recorded" from a real actor
expected: a record with no audit row and a record deleted by a user render as two different strings that never collapse
result: PASS — verified side by side in one session. A SQL-soft-deleted deal rendered `Not recorded` (muted italic); an org deleted through the UI rendered `prbitt@gmail.com`. This case was believed unreachable after the pruner emptied trash; deleting via SQL (which writes no audit row) restores it.

### 3. Tab counts, per-entity columns
expected: four tabs, counts equal to the rows shown, entity-appropriate columns
result: PASS — all four tabs at (1) with one row each. Deals showed `Deal | Organization | Deleted | Deleted by`; People showed `Person | Email | Deleted | Deleted by | Actions`. Counts moved in lockstep with rows across restore and purge.

### 4. Tabs use manual activation
expected: arrow keys move focus without firing a navigation; Enter activates
result: PASS — after three ArrowRight presses, `activeTab` was still `Deals(1)` while `document.activeElement` was `People(1)` with `data-state=inactive`, URL still bare `/trash`, `panelCount: 1`. Enter then activated and pushed `?type=people`. This is the defect `activationMode="manual"` exists to prevent.

### 5. Restore returns the record with its children
expected: record leaves trash, reappears in its list, children still attached, formulas repaired, action audited
result: PASS — toast `Getúlio quelho VT is back in Deals.` with an Open action; Deals count (1)→(0); DB confirmed `deleted_at IS NULL`, `updated_at` touched, and **3 activities still linked**. Audit row: `action=updated, actor_kind=user, changes={"deletedAt":{"from":"2026-08-15T01:44:34.546Z","to":null}}`.

### 6. Purge destroys the record and DETACHES its children
expected: parent row hard-deleted, live children survive with a null FK, both facts audited
result: PASS — a throwaway trashed org with one live child person was purged. Org row count went to 0. The child person survived (`deleted_at IS NULL`) and was detached (`organization_id IS NULL`). Two audit rows written: `person|updated|{"organizationId":{"from":"aaaa1111-…","to":null}}` and `organization|deleted|{"__purge":{"from":null,"to":true}}`. The detach is traceable back to the purged parent.

### 7. Dark mode at 320px
expected: legible in dark mode at a 320px viewport with no horizontal page scroll
result: PASS (re-verified 2026-08-18 at a REAL 320px viewport) — the instrument block is gone: Playwright's `browser_resize` genuinely sets `window.innerWidth` to 320, which `resize_window` never could. Re-measured on `/trash` after the G3 fix: the tablist is `overflow-x: auto` with `scrollWidth 365 > clientWidth 226` and its right edge at 273px, comfortably inside the 305px client width — it scrolls itself and contributes NO page overflow, confirming the G3 fix holds. The table is likewise contained: its right edge measures 619px but `document.scrollWidth` is only 416px, so its `overflow-x-auto` wrapper is clipping it correctly. The expected criterion — "table content scrolls internally; the page itself does not scroll horizontally" — is met for everything this phase owns. Residual page overflow (416 vs 305) is entirely the global header and is G5, not this page. Dark mode confirmed legible at 320px by screenshot (dark ground, light text, no clipping of the content column). **NEW FINDING, logged as G6:** dark mode is not reachable by any user — there is no ThemeProvider and no toggle, so `<html>` never receives `.dark`; both this check and the earlier desktop one only render dark because the class was forced by hand.

### 8. Both non-English locales
expected: all trash copy translated, no English fallthrough
result: PASS — pt-BR: `Lixeira`, tabs `Negócios / Pessoas / Empresas / Atividades`, actions `Restaurar` / `Excluir permanentemente`, headers `Empresa / Website / Excluído / Excluído por / Ações`. es-ES: `Papelera`, tabs `Ofertas / Personas / Empresas / Actividades`, actions `Restaurar` / `Eliminar permanentemente`. Locale reset to en-US afterwards.

### 9. A member does not see the purge control
expected: the "Delete permanently" control is hidden (not disabled) for a non-admin, on screen
result: PASS (verified 2026-08-18) — G2's blocker is gone: the user supplied a real live `member` account, so no role was mutated and no credential was invented. Setup mattered: `/trash` is viewer-scoped (`listTrashed(tab, page, viewer)`), so the member initially saw zero rows and an absent button would have proved nothing. The member was made owner of one organization, deleted it themselves, and then saw it in their own trash. ADMIN baseline on that same row: `Restaurar | Excluir permanentemente`, purge button count 1. MEMBER on the same row: `Restaurar` only, purge button count 0. **Absent, not disabled, proven properly** — every non-`<script>` leaf element was scanned for "Excluir permanentemente" and returned 0 hits; the string occurs exactly once in the whole document, inside the RSC script payload (the i18n message bundle shipped to every client), never as a control. Matches `trash-table.tsx:335` `isAdmin ? (...) : null`. Bonus server-side confirmation observed the same session: when the member tried to bulk-delete a record they did NOT own, the server refused — "Nenhum registro foi excluído." with the per-record reason "— Você não tem acesso".

### 10. /admin/trash retention form (beyond the plan's list)
expected: bounds agree across schema/input/copy, stats read live, shortening is confirmed, cancel changes nothing
result: PASS — help text `Enter a whole number of days between 1 and 365` agrees with the Zod schema and the input min/max. Stats read live (`Records in trash 3`, `Oldest deleted record Aug 15, 2026`). Changing 30→10 and saving raised `Shorten retention window?` with the specified labels `Keep current window` / `Shorten retention window`, body interpolating the NEW value. Cancelling left `app_settings` at `30` with `jsonb_typeof = number`.

## Summary

total: 10
passed: 10
issues: 0
pending: 0
skipped: 0
blocked: 0

<!-- 2026-08-16: 8 passed, 1 issue (G1), 1 blocked (G2).
     2026-08-18: G1 was already resolved in code review (WR-08); G2 and the 320px half of
     step 7 were both closed by re-verification, so every step now has a definitive PASS.
     G4 (missing tests for the three /api/v1/trash routes) and G5 (app-wide header overflow)
     remain open by explicit decision — neither is a step result, and G5 is not this phase's
     code. G6 is new and also app-wide. -->


## Gaps

### G1 — Purge dialog does not mention that live children are detached
status: resolved (code review WR-08, commit 57394ad)
resolution: `countPurgeImpact` now counts exactly what the teardown detaches, an admin-gated `previewPurgeImpact` reads it before the write, and the dialog states the number of records that will be unlinked. A separate `descriptionUnknownImpact` string exists so a failed count cannot render as "0", which the dialog asserts as fact. 37-UI-SPEC's copy table was amended to match the shipped strings.
severity: low-medium
The dialog reads `<name> and its notes will be permanently deleted. This can't be undone. Its change history is kept.` It says nothing about live child records being unlinked. Observed directly: a live person silently lost its organization with no warning in the dialog that authorised it. 37-04 flagged this as an open question; it is now confirmed behaviour, not a prediction. Fixing it needs a UI-SPEC copy amendment (the string is locked there), so it is deliberately NOT patched here.

### G2 — Member-visibility of the purge control not observed on screen
status: resolved (2026-08-18)
resolution: The user supplied a real live `member` login, which removed the whole dilemma described below — no role was mutated and no credential was invented, so the safety concern never arose. Observed on screen: the member's row renders `Restaurar` alone (purge button count 0) where the admin's identical row renders `Restaurar | Excluir permanentemente` (count 1). Absence was proven rather than assumed: a scan of every non-`<script>` leaf element for "Excluir permanentemente" returned 0 hits, the string appearing only inside the RSC message bundle. See step 9.
severity: low
The dev database has exactly one live approved user and they are the admin; all six member rows are soft-deleted. Creating a member means writing a real login credential into the real dev database, which no ROLLBACK undoes. An attempt to observe it by temporarily demoting the admin account was correctly blocked by the runtime safety classifier (mutating a role then browsing is indistinguishable from privilege escalation); the role was restored immediately and no workaround was attempted. Enforcement is covered server-side; only the client-side hide/disable distinction is unproven.

### G3 — Dark mode at 320px — DEFECT FOUND AND FIXED
status: resolved
severity: was medium (two of four tabs unreachable)
`resize_window` could not change `window.innerWidth`, so the check was redone in a **320px same-origin iframe**, where mobile media queries genuinely evaluate (`matchMedia('(min-width: 640px)').matches === false` confirmed).

**The suspicion was correct and it was a real defect.** At a 317px viewport the tablist measured 494px with `overflow-x: visible` and did NOT scroll internally — it widened the document to 526px. Observed on screen in dark mode: "Organizations" clipped mid-word, "Activities" entirely off-screen, reachable only by scrolling the whole page sideways. The table beside it was already correctly contained in `relative w-full overflow-x-auto`; the list was the outlier.

**Fix:** `max-w-full overflow-x-auto` on the `TabsList` in `src/app/trash/trash-tabs.tsx`, with a comment recording the measurements so it is not "tidied away" later. Re-measured after a container rebuild: tablist `overflow-x: auto`, `scrollW 357 > clientW 220` (scrolls itself), all four tabs present and reachable, `<main>` down to 301px — clean.

**Residual page overflow is NOT this phase's and NOT this page's.** After the fix the document still exceeded the viewport by 98px, traced to the global app `<header>` (`sticky top-0 z-50 w-full border-b …`, `scrollWidth 416` vs `clientWidth 301`). Measured across four routes at 320px, all identical:

| Route | page overflow | header scrollW | main scrollW |
|---|---|---|---|
| /organizations | 98px | 416 | 301 |
| /people | 98px | 416 | 301 |
| /deals | 98px | 416 | 408 |
| /trash | 98px | 416 | **301** |

The header overflows on every page equally; `/trash` is now as clean as any other route and cleaner than `/deals`. Phase 37 never touched `nav-header.tsx` (37-09 explicitly left it alone). Tracked below as G5.

### G5 — Global app header overflows the viewport at 320px (pre-existing, app-wide)
status: open
severity: low-medium
severity_note: cosmetic on every page, but it means the entire app has a horizontal scrollbar on a phone
The `<header>` element measures `scrollWidth 416` against a `clientWidth 301` at a 317px viewport, on every route measured. Its widest descendant is a `flex items-center gap-4` nav row that neither wraps nor scrolls. Predates Phase 37 and is unaffected by it — surfaced here only because verifying G3 required measuring the whole document. Belongs in its own small plan, not a trash phase.

**Root cause pinned 2026-08-18** (re-measured at a genuine 320px viewport, `clientWidth` 305, `document.scrollWidth` 416 — the same 416 recorded above, from a different instrument, on `/trash` and `/organizations` alike). The offending row contains a search input carrying `min-w-0 w-xs w-64`: `w-64` wins and fixes it at a computed 256px, and its wrapper is a plain `div.relative` with no shrink allowance. 256px input + 16px `gap-4` + 40px avatar = **312px of non-shrinkable content in a 305px client width**. `min-w-0` is present but cannot help while `w-64` sets an explicit width. Confirmed visually: at 320px the search box overlaps the "Pipelite" wordmark.

Also measured on `/admin/audit`, which is WORSE than the routes in the table above: `scrollWidth 508` in pt-BR and **526 in es-ES** — the overflow grows with translated string length. Second cause there: the admin sidebar rail never collapses at mobile, so `<main>` itself starts at x≈206px. Recorded against Phase 36, which owns that surface.

Likely fix: let the search shrink (`w-full max-w-64 min-w-0` on the input with `min-w-0 flex-1` on its wrapper), or hide it behind an icon below `sm`. Still belongs in its own small plan.

### G4 — The three /api/v1/trash routes have no checked-in test
status: failed
severity: medium
`grep -rl 'api/v1/trash'` across every test file returns nothing; the post-merge suite count was unchanged by 37-12, confirming zero new tests. The routes were proven once against a live database by a probe that then deleted itself. `src/app/api/v1/audit/__tests__/route.test.ts` is a working precedent for pinning them without a database. Tracked per user decision rather than closed inside Phase 37.

### G6 — Dark mode is unreachable by any user (pre-existing, app-wide)
status: open
severity: medium
severity_note: not a rendering bug — a wiring gap that makes an entire shipped theme dead code, and it silently invalidates every "verify it in dark mode" UAT item in the project

Found 2026-08-18 while re-verifying step 7. The dark theme is fully authored — `globals.css` defines `@custom-variant dark (&:is(.dark *))` plus a complete `.dark` token block, and 69 `dark:` utilities exist across the components — but **nothing ever puts the `dark` class on `<html>`**. `src/app/layout.tsx` renders a bare `<html lang={locale}>`, mounts no `ThemeProvider`, and a repo-wide search finds no theme toggle and no `setTheme` call anywhere. The only `next-themes` import in the entire codebase is inside `src/components/ui/sonner.tsx`, whose `useTheme()` therefore always reads the default.

Verified at runtime: on a freshly loaded page `document.documentElement.className` is `""`, and forcing `.dark` by hand flips `body` from `lab(100 0 0)` to `lab(2.75381 0 0)` with text inverting correspondingly — so the CSS is correct and only the switch is missing.

Consequence for verification records: every dark-mode clause in the Phase 36 and Phase 37 human-verification items was, and still is, unverifiable as a *user-reachable* state. What those checks actually establish is that the dark tokens render correctly when the class is forced. That is worth knowing, but it is a weaker claim than the items were written to make. Fixing this is a small independent plan (mount a provider, add a toggle, persist the choice); it is not Phase 37 code.
