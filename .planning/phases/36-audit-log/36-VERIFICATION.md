---
phase: 36-audit-log
verified: 2026-08-16T00:00:00Z
status: gaps_found
score: 5/5 must-haves verified; cross-cutting UI check re-run 2026-08-18 and found real defects
overrides_applied: 0
re_verification: true
re_verified: 2026-08-18T02:11:06Z
uat: 36-HUMAN-UAT.md
human_verification:
  - test: "Workflow run 'Records changed' list: dark mode, 320px viewport, es-ES and pt-BR"
    expected: "Renders correctly in dark mode, at 320px with no overflow/clipping, and in both locales with no missing keys"
    why_human: "STILL OPEN. The 2026-08-18 re-run covered the other two surfaces of the original bundled item but did not locate this one in the workflow UI, so it is carried forward alone rather than being marked verified by association."
resolved_in_uat:
  # The original single item bundled three surfaces behind one checkbox. Split in 36-HUMAN-UAT.md so
  # partial coverage cannot read as full coverage. Two surfaces resolved, one still open above.
  - test: "Audit timeline entry: dark mode, 320px, es-ES and pt-BR"
    result: issue
    evidence: "Locales PASS in both pt-BR and es-ES with no missing keys. 320px FAILS (scrollWidth 416 vs clientWidth 305), caused by the app-wide global header, not Phase 36 markup. Dark mode renders correctly only when .dark is forced. Separate minor i18n defect found: the raw DB column name 'Deleted at' renders as a field label in both locales."
  - test: "/admin/audit retention form: dark mode, 320px, es-ES and pt-BR"
    result: issue
    evidence: "Locales PASS with full es-ES and pt-BR coverage of the retention copy. 320px FAILS worse than anywhere else measured — 508px in pt-BR and 526px in es-ES against a 305px client width, growing with translated string length, which is precisely the failure mode this item was written to catch. Second cause is this surface's own shell: the admin sidebar rail never collapses at mobile. Separate minor i18n defect: the entire admin sidebar is hardcoded English in both locales."
dark_mode_premise_invalidated: >
  Every dark-mode clause in this item assumed dark mode is a reachable user state. It is not: no
  ThemeProvider is mounted and no toggle exists anywhere, so <html> never receives the .dark class.
  Forcing the class shows the tokens are correct, which is a weaker claim than the item intended.
  Tracked app-wide as 37-UAT.md G6.
---

# Phase 36: Audit Log Verification Report

**Phase Goal:** Any change to a CRM record can be traced to who or what made it, and the table does not eat the disk
**Verified:** 2026-08-16
**Status:** gaps_found (re-verified 2026-08-18 — see 36-HUMAN-UAT.md)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | After a user edits a deal, that record's history shows the changed fields with before/after values and the user's name | ✓ VERIFIED | `src/lib/audit/diff.ts` (pure diff, formula exclusion), `src/lib/events/subscribers/audit.ts` (writes row), `src/lib/audit/present.ts` (labelled/truncated render), `src/components/timeline/timeline-entry.tsx:61` (`case "audit"`). Browser walkthrough (36-20-SUMMARY.md, step 1) confirms end-to-end AFTER the `46b3413` actor-storage fix and the `3b393c7`/`9e62b0b` custom-field-blob fixes — both verified present in current `HEAD` (see Anti-Patterns/Fix Verification below). Without those three fixes this truth was FALSE in the running container despite 1,335 passing unit tests — a genuine, now-closed gap. |
| 2 | After a workflow CRM action edits a record, the record's history attributes the change to a workflow run, and the run detail page links to every record that run mutated | ✓ VERIFIED | `src/lib/execution/engine.ts` establishes `runWithActor({kind:"workflow_run", workflowRunId})` around run execution; `src/lib/audit/linked-records.ts` (`RunChangedRecord`, dedup by union of fields, deleted>created>updated precedence); `src/app/workflows/[id]/runs/[runId]/components/run-changed-records.tsx` renders the list with links (non-deleted) / plain text (deleted, to avoid a 404). Browser walkthrough step 6: PASS — run recorded with `actor_kind=workflow_run`, run page shows "Records changed (1)". |
| 3 | Changes made via API key and via the Pipedrive importer are distinguishable by actor kind from user-made changes | ✓ VERIFIED (at documented granularity) | `AuditActorKind = "user" \| "workflow_run" \| "api_key" \| "import" \| "system"` (`src/db/schema/audit-log.ts`). `src/lib/api/auth.ts` wraps `withApiAuth` in `runWithActor({kind:"api_key"...})`. Importers (`src/app/import/actions.ts`, `src/lib/import/pipedrive-api-import-actions.ts`) write one `actor_kind=import` summary row directly. Browser walkthrough steps 7-8: PASS — API PUT produced `actor_kind=api_key` with exactly one changed field; CSV import produced exactly one `actor_kind=import` row. **Documented limitation, not a gap:** SC-3 holds at import-SESSION granularity only — auto-created records during import (CSV org/person auto-create, Pipedrive stubs) bypass the mutation layer and get no per-record audit row. This is stated plainly in 36-20-SUMMARY.md phase-level statement 2 and is a locked design decision, not a silent omission. `apiKeyName` is permanently null (schema has no per-key id column) — UI shows a generic "API key" label; also documented, not concealed. |
| 4 | Admin sets an audit retention window and entries older than it disappear without manual intervention | ✓ VERIFIED | `src/app/admin/audit/retention-form.tsx` + `actions.ts` (save with range/confirm-on-shorten), `src/lib/audit/settings.ts` (fail-closed parse), `src/lib/audit/prune.ts` (self-scheduling daily pruner, `ctid`-batch delete, always reschedules even after throw), migration `0014_sloppy_slapstick.sql` seeds `audit.retention_days=90`. Docker evidence (36-20-SUMMARY.md Task 2): pruner alive in rebuilt image (`[audit-prune] Starting...`), all 4 indexes present, prune EXPLAIN plan uses `Tid Scan`/`Bitmap`/index paths (13.87ms per 5,000-row batch at 200k synthetic rows, rolled back). Browser walkthrough step 9: PASS — retention shown as 90 on first load (seed, no admin action), lowering triggers confirm dialog, `[audit-prune] deleted 0 row(s) older than 1d` observed after setting to 1 day. |
| 5 | Audit capture required no edit to any mutation function — it subscribes to the existing `crmBus` | ✓ VERIFIED | `src/lib/audit/no-mutation-coupling.test.ts` (262 lines, 24 tests) mechanically scans all nine non-test modules in `src/lib/mutations/`, with comment-stripping so prose mentions don't count, and anti-vacuity assertions (file-count anchor, positive `crmBus.emit` marker, both-directions pinning) proving the gate cannot pass vacuously. Two deliberate red runs recorded in 36-20-SUMMARY.md: (a) injecting a real audit import into `deals.ts` fails the gate correctly; (b) pointing the scan at a non-existent renamed directory shows the negative assertion would have passed VACUOUSLY without the anti-vacuity assertions — which is exactly why they exist and are load-bearing. Confirmed current: `grep -n "audit"` against `src/lib/mutations/deals.ts` shows only `crmBus.emit`, no audit import. Test re-run below confirms current pass. **Explicitly excluded from this claim (documented, not hidden):** the two importers, which write their one summary row directly via `db.insert(...)`, bypassing the subscriber by design (rejected per-record events to avoid a 25,206-webhook fan-out on one import). |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/schema/audit-log.ts` | `audit_log` table, `AuditEntityType`/`AuditActorKind`/`AuditChanges` types | ✓ VERIFIED | Present, no updated_at/deleted_at (append-only), FKs to users/workflow_runs/import_sessions |
| `drizzle/0014_sloppy_slapstick.sql` | Migration creating audit_log + app_settings, 4 indexes, retention seed | ✓ VERIFIED | Confirmed via `docker exec psql` (36-20 evidence): 5 indexes incl. pkey, seed row `audit.retention_days=90` present |
| `src/lib/audit/diff.ts` | Pure diff builder, formula exclusion, key normalisation | ✓ VERIFIED | 309 targeted tests pass (`vitest run src/lib/audit/`) |
| `src/lib/audit/actor-context.ts` | ALS-based actor scope, `getCurrentActor`/`runWithActor` | ✓ VERIFIED / FIXED | Originally used a plain module-level const — broken in production (two module graphs). Fixed in `46b3413` to a `globalThis` singleton, mirroring `crmBus`'s existing pattern. Fix is present in current HEAD. |
| `src/lib/events/subscribers/audit.ts` | crmBus subscriber writing audit rows, fire-and-forget, no `stage_changed` listener | ✓ VERIFIED | Confirmed absent `stage_changed` registration; insert uses `.catch`, not awaited |
| `src/lib/audit/settings.ts` | Fail-closed retention read | ✓ VERIFIED | No `?? 90` fallback in code (design deliberately keeps default only in seeded data) |
| `src/lib/audit/prune.ts` | Self-scheduling daily pruner, `ctid` batch delete, cap, always-reschedule | ✓ VERIFIED | Code inspected directly; matches SUMMARY claims exactly |
| `src/lib/audit/linked-records.ts` | Run → distinct mutated records | ✓ VERIFIED | Dedup/precedence logic present and tested |
| `src/app/admin/audit/{page,actions,retention-form}.tsx` | Admin retention UI | ✓ VERIFIED | Full component read; confirm-on-shorten dialog, fail-safe error handling, no optimistic readout |
| `src/app/api/v1/audit/route.ts` | Read-only admin-gated audit REST endpoint | ✓ VERIFIED | GET-only by design (test asserts other verbs undefined); route probe confirmed `401` for missing key |
| `src/components/timeline/timeline-entry.tsx` | Renders `"audit"` as 4th timeline entry kind | ✓ VERIFIED | `case "audit":` present at line 61; typecheck clean (exhaustive-never gate intact) |
| `src/lib/custom-fields.ts` | `saveFieldValues` layering fix | ✓ VERIFIED / FIXED | Line 316 (`{ ...next, ...result.customFields }`) confirms the layering fix from `3b393c7` is present |
| `src/lib/formula-recalc.ts` | `recalculateFormulas` null-on-SC4-no-row | ✓ VERIFIED / FIXED | Confirmed `input.row ? (...) : null` at the SC-4 fast path; all callers updated with `?? fallback` |
| `src/lib/audit/no-mutation-coupling.test.ts` | SC-5 mechanical gate | ✓ VERIFIED | 24 tests, anti-vacuity triad present and load-bearing (verified via SUMMARY's recorded red runs) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/lib/mutations/*.ts` (9 files) | `crmBus` | `crmBus.emit(...)` | WIRED | No mutation module imports the audit layer (mechanically gated, re-confirmed) |
| `src/lib/events/subscribers/audit.ts` | `audit_log` table | `db.insert(auditLog)` (fire-and-forget) | WIRED | Confirmed in source |
| `instrumentation.ts` | `registerAuditSubscriber`, `startAuditPruner` | dynamic import at boot | WIRED | Both present in `instrumentation.ts`; confirmed alive in rebuilt Docker image (`[audit-prune] Starting...` log line observed) |
| `src/lib/api/auth.ts` (`withApiAuth`) | `runWithActor({kind:"api_key"})` | wraps handler | WIRED | Confirmed via grep + browser walkthrough step 7 |
| `src/lib/execution/engine.ts` | `runWithActor({kind:"workflow_run"})` | wraps run execution | WIRED | Confirmed via browser walkthrough step 6 |
| `src/lib/timeline/assemble.ts` | `audit_log` (4th branch) | `includeAudit` param, keyset predicate | WIRED | EXPLAIN plan confirms `Merge Append` over 4 index-driven branches, sub-ms warm |
| `src/app/admin/audit/actions.ts` | `settings.ts` (`writeRetentionDays`) | server action | WIRED | Browser walkthrough step 9 confirms save + confirm dialog + persisted value |
| `run-changed-records.tsx` | `linked-records.ts` | `RunChangedRecord[]` prop | WIRED | Confirmed via file read; failure isolated by `failed` boolean prop, not silently swallowed to `[]` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `RunChangedRecords` | `records` prop | `readRunChangedRecords()` → `db` query via `linked-records.ts`, joined against real `audit_log`/`workflow_runs` rows | Yes (confirmed via browser walkthrough step 6, real workflow run) | ✓ FLOWING |
| `RetentionForm` | `retentionDays` prop | `readRetentionDays()` from `app_settings`, seeded 90 | Yes (confirmed via browser walkthrough step 9: 90 on first load, live save round-trip) | ✓ FLOWING |
| `timeline-entry.tsx` audit case | audit source branch of merged timeline | `buildTimelineQuery` 4th branch → `audit_log` via `audit_log_entity_idx` | Yes (EXPLAIN confirms index scan on real predicate; browser walkthrough step 1 confirms visible entries) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full unit suite (both vitest projects) | `npx vitest run` + `npx vitest run --config vitest.rsc.config.ts` | 1338 passed (node) / 8 passed (RSC), 0 failed | ✓ PASS |
| Typecheck | `npm run typecheck` | clean, no output | ✓ PASS |
| Targeted audit-module tests | `npx vitest run src/lib/audit/ src/lib/timeline/assemble.test.ts src/lib/custom-fields.test.ts src/lib/formula-recalc.test.ts src/lib/events/subscribers/audit.test.ts` | 309 passed | ✓ PASS |
| Fix `46b3413` present (globalThis actor storage) | direct file read | `globalForActor.auditActorStorage` pattern confirmed present | ✓ PASS |
| Fix `3b393c7` present (custom-fields layering) | `grep -n "result.customFields" src/lib/custom-fields.ts` | `recalculated = { ...next, ...result.customFields }` at line 316 | ✓ PASS |
| Fix `9e62b0b` present (null vs `{}` on SC-4 no-row path) | direct file read `src/lib/formula-recalc.ts:663-666` | Confirmed: returns `null` when `input.row` absent, `existing` blob otherwise | ✓ PASS |
| CFUI-02 test rewrite is a justified fix, not a masked regression | `git show 3b393c7 -- src/lib/custom-fields.test.ts` | Old assertion (`toBe(recomputed)` identity) DID drop the posted `Origem` field in its own mock — genuinely encoded the bug. New assertion checks the merge including `Origem`. Justified. | ✓ PASS |
| Pre-existing "no row read" contract test unmodified by `9e62b0b` | `git show 9e62b0b -- src/lib/formula-recalc.test.ts` | Diff shows +37/-0 — only additions, the pre-existing test at line 678 (`"does not read the row at all when nothing is in scope"`) is untouched | ✓ PASS |
| SC-5 gate is not vacuous | Read 36-20-SUMMARY.md Red Run 2 | Confirmed: pointing scan at a renamed directory shows the negative passes vacuously WITHOUT anti-vacuity assertions; those assertions correctly fail | ✓ PASS |

### Probe Execution

No dedicated `scripts/*/tests/probe-*.sh` files for this phase. `scripts/audit-log-checks.sql` is the phase's evidence script (not an executable probe); its full output is embedded verbatim in 36-20-SUMMARY.md Task 2 and was cross-read here. Not independently re-run against the live container in this verification pass (requires Docker + the human walkthrough's test data state, which the orchestrator's Task 3 already exercised and is the authoritative record). This is a WARNING-level gap in verification thoroughness, not a phase gap: the SQL evidence in the SUMMARY is specific, dated, and internally consistent (index names match the migration, row counts match the described empty-then-52-row lifecycle), and Docker route probes (`/admin/audit` → 302, `/api/v1/audit` → 401) corroborate the routes exist and are gated.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|--------------|-------------|--------------|--------|----------|
| AUDIT-01 | 02, 06, 07, 10, 11, 12, 13, 20 | Every CRM write records who changed what — entity, field-level before/after, actor | ✓ SATISFIED | diff.ts, subscriber, present.ts, timeline render, browser walkthrough step 1 (after fixes) |
| AUDIT-02 | 01, 05, 06, 11, 20 | Audit capture is driven by the existing `crmBus` subscriber, so no mutation code changes | ✓ SATISFIED | actor-context.ts (ALS), no-mutation-coupling.test.ts (mechanical gate), fire-and-forget insert |
| AUDIT-03 | 04, 09, 10, 12, 13, 15, 16, 17, 19, 20 | User can view a record's change history, trace workflow run → records | ✓ SATISFIED | timeline 4th branch, linked-records.ts, run-changed-records.tsx, API read endpoint, browser walkthrough steps 2-4, 6-8 |
| AUDIT-04 | 03, 04, 08, 14, 18, 20 | Admin can configure audit retention, entries pruned automatically | ✓ SATISFIED | settings.ts, prune.ts, retention-form.tsx, migration seed, browser walkthrough step 9 |

No orphaned requirements found — all four IDs (AUDIT-01..04) are claimed across the 20 plans and REQUIREMENTS.md maps them all to Phase 36 with no additional unclaimed IDs.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` debt markers found in any phase source file | — | None — clean |
| (process finding, not a file) | — | Three production defects (`46b3413`, `3b393c7`, `9e62b0b`) shipped past a 1,335-test suite and were only caught by a mandatory browser walkthrough | ℹ️ INFO | Not a current gap — all three are fixed and confirmed present in HEAD. Recorded here because it is exactly the kind of thing that "SUMMARY says passing tests" would have hidden, and is the reason this phase's process (mandatory Docker walkthrough with rebuilt image) deserves to be called out rather than rubber-stamped. |

### Human Verification Required

### 1. Cross-cutting UI check (dark mode / 320px / es-ES / pt-BR)

**Test:** Open the audit timeline entry, the run-changed-records list, and the `/admin/audit` retention form in dark mode, at a 320px viewport, and switched to es-ES and pt-BR locales.
**Expected:** No layout breakage (overflow, clipping, illegible truncation), all strings render translated (locale-parity test only proves the keys exist in each locale file, not that the rendered layout survives longer translated strings), dark mode contrast is legible.
**Why human:** Walkthrough step 11 (36-20-SUMMARY.md) was attempted in the mandatory Docker browser session but the browser tool's `resize_window` call reported success without the viewport actually changing size, so the 320px check could not be honestly performed, and dark mode / es-ES / pt-BR were consequently not exercised either. This is explicitly flagged as outstanding in the SUMMARY rather than silently skipped.

### Gaps Summary

No BLOCKER gaps. All five phase-goal truths are VERIFIED against the actual codebase — not merely claimed in SUMMARYs. Three real production defects were found and closed during a mandatory browser walkthrough (documented and independently re-confirmed present in HEAD by this verification: `46b3413`, `3b393c7`, `9e62b0b`), and the test-suite changes that accompanied them (`custom-fields.test.ts` CFUI-02 rewrite, `formula-recalc.test.ts` additions) were checked against their diffs and are legitimate — the rewrite corrects an assertion that had encoded the bug, and the pre-existing zero-read contract test was left untouched. The SC-5 no-coupling gate's anti-vacuity assertions were confirmed load-bearing via the two red-run rehearsals recorded in the SUMMARY.

The one open item is human UAT (cross-cutting dark-mode/viewport/locale check), which the phase's own SUMMARY already flags honestly as not performed rather than fabricated — hence `status: human_needed` rather than `gaps_found`. Several documented design limitations (import auto-created records get no per-record audit row, `apiKeyName` permanently null, importers excluded from the SC-5 subscriber claim) are locked design decisions stated plainly in the SUMMARY and REQUIREMENTS traceability, not concealed gaps, and do not block the phase goal as stated.

---

_Verified: 2026-08-16_
_Verifier: Claude (gsd-verifier)_
