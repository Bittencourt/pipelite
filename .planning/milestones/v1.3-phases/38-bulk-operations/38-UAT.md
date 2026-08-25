---
status: partial
phase: 38-bulk-operations
source:
  - 38-VERIFICATION.md (human_verification, 7 items)
started: 2026-08-18T01:18:00Z
updated: 2026-08-18T02:11:06Z
method: automated-ui-verification (Playwright-MCP) in a real authenticated session
---

## Current Test

[testing complete]

## Method

Every item below was driven in a REAL authenticated browser session against the Docker app at
`http://localhost:3001`, which is what the original verification could not do — `38-20-SUMMARY.md`
recorded that the browser tools were unavailable and that `/deals`, `/activities` and `/trash` all
307'd to `/login`. Those blockers are gone: a live admin session was used for items 1-7, and a real
`member` account (supplied by the user) for the cross-check noted under item 5.

Two instrument rules were followed, both learned from Phase 38's own notes:

1. **No synthetic `KeyboardEvent` was accepted as evidence.** Item 6 proves why: the regression it
   describes is invisible to synthetic dispatch and only appears under a trusted key event.
2. **Assertions are DOM measurements**, not screenshots — element counts, `data-state`, `aria-label`,
   `document.scrollWidth`, and the parsed contents of a really-downloaded CSV.

## Tests

### 1. Deals kanban: checkbox click, drag with a card checked, Space to select, per-stage cap
expected: Checkbox click ≠ card expand; drag unaffected by an unrelated selected card; Space toggles the checkbox for a keyboard-only user; select-all on an over-cap stage selects exactly BULK_MAX_IDS (100) and states the cap in an accessible name
result: blocked
blocked_by: other
reason: "3 of 4 sub-criteria PASS; the drag sub-criterion is instrument-blocked and needs a human with a real mouse. PASS — per-stage cap: aria-label reads exactly 'Selecionar os primeiros 100 de 3466 negócios em Base Fria - Lead' and clicking it selected EXACTLY 100, bar 'Ações para 100 registros selecionados', stage box data-state=indeterminate. PASS — CR-01 toggle fix confirmed live: a second click deselected all 100 (0 checked, bar unmounted, state=unchecked), so it is a real toggle. PASS — checkbox click did not expand the card (no dialog opened, no URL change) and selected it. PASS — Space on a focused card checkbox, driven as a REAL key press, toggled unchecked→checked with window.scrollY still 0 (default scroll correctly prevented); this closes the T-38-41 instrument block for Space. BLOCKED — drag: Playwright browser_drag times out on mouse-up because dnd-kit's pointer sensor requires an activation constraint (distance/delay plus intermediate pointermove) that the tool's move-and-up does not satisfy. Synthetic pointer events were deliberately NOT substituted, per rule 1 above. No data damage: deal 'Robin Food' remained in Base Fria - Lead at position 5000."

### 2. Activities list: row checkbox, header select-all, indeterminate, Load More persistence, filter clearing
expected: Exact count in the bar, minus-not-check when partially selected, selection survives Load More, clears on filter change
result: pass
reason: "All five sub-criteria confirmed. Row checkbox → '1 selecionado'. Header select-all is page-scoped: aria-label 'Selecionar os 50 registros carregados', which RECOUNTED to 'os 100 registros carregados' after Load More. Indeterminate is minus-not-check: data-state=indeterminate AND aria-checked=mixed. Persistence: the single selection survived Load More (50→100 rows, still 1 checked). Select-all → 100 checked, '100 selecionados' with correct plural. Filter change (search=Inteligência) → 0 checked and the bar unmounted. Bar exposes role=region aria-label 'Ações para 100 registros selecionados'. This closes the whole 'Activities never driven in a browser' gap from 38-VERIFICATION SC-1."

### 3. Post-bulk-delete Trash deep link carries ?type= and the timeline shows the delete
expected: Link is .../trash?type=organizations, the tab pre-selects that entity type, deleted records are listed, and the timeline renders a 'deleted' entry with the actor's name
result: pass
reason: "Performed a real 4-record bulk delete, then a 1-record delete to capture the toast. Toast: '1 registro foi movido para a lixeira.' with an 'Abrir a lixeira' action. NOTE the action is a BUTTON using router.push, not an anchor — there is no href to inspect, so it had to be clicked. It landed on /trash?type=organizations — ?type=, NOT ?tab= (source: bulk-action-bar.tsx:244). Tab 'Empresas (6)' was aria-selected=true / data-state=active. All 6 deleted records were listed, attributed to prbitt@gmail.com. On a restored record the timeline rendered 'prbitt@gmail.com excluiu esta empresa há 1 minuto' with the actor avatar — the rendered timeline, not just the underlying audit_log row. All test records were restored afterwards (0 soft-deleted orgs remain)."

### 4. Real CSV file download
expected: File contains exactly N data rows (not the whole table), no [object Object], custom_* columns present even if row 1 has none, filename {entity}-selected-{count}-{date}.csv
result: pass
reason: "Downloaded and parsed the real file: organizations-selected-3-2026-08-18.csv — filename matches the contract. Exactly 3 data rows, not the 50-row page or the full table. No [object Object]. Values containing commas are correctly quoted. The load-bearing criterion is PROVEN: row 1 had ONLY custom_'CNPJ / CPF' populated, yet the header carried 6 custom_* columns (CNPJ / CPF, E-mail de Contato 1, E-mail de Contato 2, Segmento Organização, Telefone de Contato 1, Telefone de Contato 2) filled from rows 2-3 — so columns are not derived from row 1 alone. OBSERVATION (not a failure): columns come from the UNION OF POPULATED VALUES across the selected rows, not from the 8 active definitions — an earlier export of 3 rows that all had custom_fields={} produced zero custom_* columns, and 'Tier' never appears because no selected row had a value for it."

### 5. Bulk failure report rendering at realistic failure counts
expected: The inline list names each failed record with a closed-reason sentence (never a raw server string), scrolls at max-h-48 for large failure counts, does not auto-dismiss over 30 seconds
result: issue
reported: "The report itself renders correctly, but its copy contradicts the actual state: it says the failed records are still selected when the selection has in fact been emptied."
severity: major
reason: "Forced a genuine mixed outcome (selected 3 orgs, soft-deleted 2 out-of-band, then confirmed the bulk delete) → toast '1 de 3 se completaron. 2 fallaron.' PASS — the inline role=alert panel names each failed record with a CLOSED-REASON sentence, never a raw server string: 'Supermercado Guanabara — Ya no existe / Mega Supermercados — Ya no existe'. A second reason code was confirmed independently in pt-BR when a member tried to delete a record they did not own: 'teste clari aut — Você não tem acesso'. PASS — the scroll container exists with exactly the specified classes 'mt-2 max-h-48 space-y-1 overflow-y-auto text-sm'. PASS — it does NOT auto-dismiss: still mounted after 31 seconds, with a 'Descartar' button. ISSUE — see Gaps. NOT COVERED: behaviour at ~40 failures; only 2 were produced, so the max-h-48 scroll never actually engaged (scrollHeight 44 == clientHeight 44)."

### 6. Escape-key regression G1
expected: One Escape closes only the open dialog; the bulk selection count is unchanged and the bar remains mounted
result: pass
reason: "FAILED on first run and was FIXED and re-verified within this session. Original failure, reproduced 3/3 with a real trusted key press: one Escape closed the dialog AND cleared the entire selection (bar unmounted, 0 checked). Three discriminators isolated it — the Cancel button preserved the selection, Escape with no dialog open cleared it (intended), and a SYNTHETIC KeyboardEvent preserved it, which is exactly why the existing unit gate at bulk-action-bar-wiring.test.ts:288 passed throughout. Root cause: the gate read `deleteOpen`/`reassignOpen` (React state) from a document-level listener, and React can flush Radix's onOpenChange(false) — re-running the effect and re-registering the listener with a fresh closure — between two listeners of one keydown dispatch, because the HTML spec drains microtasks after each callback. Fix: an event-time ref claimed synchronously when a dialog opens and released only on a later macrotask, so the claim holds for the whole dispatch regardless of listener order or flush timing. Re-verified live after rebuild, all five paths: delete dialog + one Escape → dialog closes, 2 still checked, bar mounted; second Escape → clears (intended path intact); reassign dialog + one Escape → same correct behaviour; Cancel-button close → selection intact; Escape after a Cancel-button close → clears, proving the ref is released and not stuck."

### 7. Non-English locale rendering (es-ES and pt-BR)
expected: All bulk.* strings render correctly in both locales at the counts and states already proven in en-US
result: pass
reason: "pt-BR: bar '1 selecionado' / '100 selecionados', aria 'Ações para N registros selecionados', dialog 'Excluir 2 registros?' / '2 registros vão para a lixeira. Você pode restaurá-los por 30 dias.' / 'Manter os registros', toast '1 registro foi movido para a lixeira.' / 'Abrir a lixeira', restore toast 'está de volta em Empresas'. es-ES: bar '1 seleccionado' / '3 seleccionados', aria 'Acciones para N registros seleccionados', buttons 'Reasignar propietario / Exportar CSV / Eliminar / Borrar la selección', delete dialog '¿Eliminar 3 registros?' with the correct inverted ¿, '3 registros van a la papelera. Puedes restaurarlos durante 30 días.', 'Conservar los registros'; reassign dialog fully translated including 'Al nuevo propietario no se le envía ningún correo sobre este cambio.'; partial-failure toast '1 de 3 se completaron. 2 fallaron.'; per-reason sentence '— Ya no existe'. Plurals inflect correctly in both. NIT (logged as a separate minor gap): the Radix dialog close button's sr-only label renders as English 'Close' in both locales."

## Summary

total: 7
passed: 5
issues: 1
pending: 0
skipped: 0
blocked: 1

## Gaps

```yaml
- truth: "The bulk failure report tells the user the truth about what is still selected"
  status: failed
  reason: "The inline failure panel renders 'Estos registros siguen seleccionados. Corrige el problema e inténtalo de nuevo.' (pt-BR: 'Estes registros continuam selecionados. Corrija o problema e tente novamente.') while the selection has actually been emptied — 0 checked rows and the bulk bar unmounted. The user is instructed to fix and retry, but nothing is selected to retry. Mechanism: the bar prunes its selection to rendered ids, and records that failed with 'no longer exists' are by definition gone from the refreshed table. This is not an artefact of the forced test: the same thing happens in the real case where another user deleted the records concurrently."
  severity: major
  test: 5
  artifacts:
    - path: "src/components/bulk/bulk-failure-report.tsx"
      issue: "Renders a 'these records are still selected' sentence unconditionally, with no signal about whether the failed ids actually survived the prune"
    - path: "src/components/bulk/bulk-action-bar.tsx"
      issue: "Prunes selection to rendered ids, which silently invalidates the failure panel's central claim for the not-found reason code"
  missing:
    - "Either keep failed ids selected even when their rows have left the table, or make the panel's copy conditional on whether any failed id actually survived the prune"

- truth: "Every user-visible control is translated in es-ES and pt-BR"
  status: failed
  reason: "The Radix dialog close button's sr-only accessible name renders as the hardcoded English 'Close' in both pt-BR and es-ES. Observed on the bulk reassign dialog and on the admin invite dialog, so it is the shared ui/dialog primitive rather than a bulk-specific string."
  severity: minor
  test: 7
  artifacts:
    - path: "src/components/ui/alert-dialog.tsx"
      issue: "sr-only close label not routed through next-intl"
    - path: "src/components/ui/dialog.tsx"
      issue: "same"
  missing:
    - "Translate the dialog close button's accessible name in all three locales"
```

## Blocked

```yaml
- test: 1
  blocked_by: other
  item: "Drag a deal card by its body while another card is checked"
  reason: "dnd-kit's pointer sensor needs an activation constraint that Playwright's browser_drag does not satisfy; it times out on mouse-up. Synthetic pointer events were rejected as evidence because item 6 proved synthetic dispatch hides real defects on this exact component."
  needs: "A human with a real mouse, or an e2e runner able to emit a held pointer sequence with intermediate moves."
```

## Notes carried to other phases

- The app-wide 320px horizontal overflow (already known as 37-UAT G5, and referenced in a comment in
  `bulk-action-bar.tsx`) was re-measured precisely during this session and is NOT caused by the bulk
  bar: the bar measures 269px against a 301px client width and contributes no overflow. The cause is
  the global header's `w-64` (256px fixed) search input plus a 40px avatar and a 16px gap = 312px in a
  305px viewport. It reproduces on /organizations, /trash and /admin/audit. Recorded against Phases
  36 and 37, which own the affected surfaces.
- Dark mode is unreachable app-wide: no ThemeProvider is mounted and no toggle exists, so `<html>`
  never receives `.dark`. The CSS itself is correct when the class is forced. This invalidates the
  premise of the dark-mode clauses in the Phase 36 and 37 human items.
