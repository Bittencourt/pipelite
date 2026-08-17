---
status: partial
phase: 37-trash-restore
source: [37-15-PLAN.md Task 3]
started: 2026-08-16
updated: 2026-08-16
executed_by: assistant (browser automation against the live Docker app)
---

## Current Test

Steps 7 (320px) and 9 (member visibility) remain — see Gaps.

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
result: PARTIAL — dark mode renders correctly at desktop width (dark ground, legible text, destructive red still readable). **320px NOT verified**: `resize_window` reported success but `window.innerWidth` stayed 2133, so no narrow viewport was ever achieved. Structural finding instead: the table is wrapped in `relative w-full overflow-x-auto` (scrolls internally, correct), but the tablist is `flex-wrap: nowrap` with `overflow-x: visible` at 494px — at 320px that would overflow the page rather than scroll internally. Unconfirmed; needs a real narrow viewport.

### 8. Both non-English locales
expected: all trash copy translated, no English fallthrough
result: PASS — pt-BR: `Lixeira`, tabs `Negócios / Pessoas / Empresas / Atividades`, actions `Restaurar` / `Excluir permanentemente`, headers `Empresa / Website / Excluído / Excluído por / Ações`. es-ES: `Papelera`, tabs `Ofertas / Personas / Empresas / Actividades`, actions `Restaurar` / `Eliminar permanentemente`. Locale reset to en-US afterwards.

### 9. A member does not see the purge control
expected: the "Delete permanently" control is hidden (not disabled) for a non-admin, on screen
result: NOT VERIFIED — see Gaps. Server-side enforcement IS covered (unit tests in `src/app/trash/actions.test.ts`, and 37-12 proved the REST purge returns 403 for a member key against a real database). What is unproven is only the client-side hiding.

### 10. /admin/trash retention form (beyond the plan's list)
expected: bounds agree across schema/input/copy, stats read live, shortening is confirmed, cancel changes nothing
result: PASS — help text `Enter a whole number of days between 1 and 365` agrees with the Zod schema and the input min/max. Stats read live (`Records in trash 3`, `Oldest deleted record Aug 15, 2026`). Changing 30→10 and saving raised `Shorten retention window?` with the specified labels `Keep current window` / `Shorten retention window`, body interpolating the NEW value. Cancelling left `app_settings` at `30` with `jsonb_typeof = number`.

## Summary

total: 10
passed: 8
issues: 1
pending: 0
skipped: 0
blocked: 1

## Gaps

### G1 — Purge dialog does not mention that live children are detached
status: resolved (code review WR-08, commit 57394ad)
resolution: `countPurgeImpact` now counts exactly what the teardown detaches, an admin-gated `previewPurgeImpact` reads it before the write, and the dialog states the number of records that will be unlinked. A separate `descriptionUnknownImpact` string exists so a failed count cannot render as "0", which the dialog asserts as fact. 37-UI-SPEC's copy table was amended to match the shipped strings.
severity: low-medium
The dialog reads `<name> and its notes will be permanently deleted. This can't be undone. Its change history is kept.` It says nothing about live child records being unlinked. Observed directly: a live person silently lost its organization with no warning in the dialog that authorised it. 37-04 flagged this as an open question; it is now confirmed behaviour, not a prediction. Fixing it needs a UI-SPEC copy amendment (the string is locked there), so it is deliberately NOT patched here.

### G2 — Member-visibility of the purge control not observed on screen
status: blocked
severity: low
The dev database has exactly one live approved user and they are the admin; all six member rows are soft-deleted. Creating a member means writing a real login credential into the real dev database, which no ROLLBACK undoes. An attempt to observe it by temporarily demoting the admin account was correctly blocked by the runtime safety classifier (mutating a role then browsing is indistinguishable from privilege escalation); the role was restored immediately and no workaround was attempted. Enforcement is covered server-side; only the client-side hide/disable distinction is unproven.

### G3 — Dark mode not verified at 320px
status: blocked
severity: low
`resize_window` did not change `window.innerWidth` in this environment. Structural inspection suggests a possible horizontal page overflow at 320px from the `nowrap` / `overflow-x: visible` tablist (494px). Needs a real narrow viewport or devtools device emulation to confirm or clear.

### G4 — The three /api/v1/trash routes have no checked-in test
status: failed
severity: medium
`grep -rl 'api/v1/trash'` across every test file returns nothing; the post-merge suite count was unchanged by 37-12, confirming zero new tests. The routes were proven once against a live database by a probe that then deleted itself. `src/app/api/v1/audit/__tests__/route.test.ts` is a working precedent for pinning them without a database. Tracked per user decision rather than closed inside Phase 37.
