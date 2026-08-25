---
phase: 39-duplicate-detection-merge
verified: 2026-08-21T00:26:18Z
status: passed
score: 5/5 success criteria verified (DEDUP-01, DEDUP-02, DEDUP-03 satisfied)
overrides_applied: 0
overrides: []
deferred:
  - truth: "F-39-07 — at 320x640 the create dialog's 'Create anyway' button is unreachable by pointer once the advisory renders"
    addressed_in: "Backlog (app-wide, DialogContent primitive)"
    evidence: "BACKLOG.md 'F-39-07 — a 320px user cannot get past the duplicate advisory'; deferred by explicit human decision 2026-08-20 as app-wide rather than phase-39-specific"
  - truth: "F-39-08, F-39-04, F-39-06, scan-guard atomicity, loser's empty merged-entry name, drizzle-kit fresh-migrate chain"
    addressed_in: "BACKLOG.md (pre-existing / app-wide / cross-phase items)"
    evidence: "All six confirmed present in BACKLOG.md 'From Phase 39' and 'Cross-phase, found in Phase 39 — belongs to Phase 43' sections, matching the descriptions supplied for this verification"
---

# Phase 39: Duplicate Detection & Merge — Verification Report

**Phase Goal:** Duplicates entering through the importer or manual entry are caught and collapsible
without data loss.
**Requirements:** DEDUP-01, DEDUP-02, DEDUP-03
**Verified:** 2026-08-21T00:26:18Z
**Status:** passed (with recorded qualifications — see below; this is not a claim of a flawless phase)
**Re-verification:** No — initial verification

## Summary Judgment

I independently re-ran the phase's own gates (not just read the SUMMARYs claiming they passed) and
traced the two documented defect classes (the unreachable organization advisory, the vacuous
progress-bar assertion) into the current code. Both are genuinely fixed / genuinely harmless, as
detailed below. I also found and reproduced **one new defect the phase did not document** — a
pre-existing, app-wide React hydration race that can swallow a dialog-trigger click — and I explain
below why it does not block DEDUP-01 despite being real. DEDUP-01, DEDUP-02 and DEDUP-03 are, in my
independent judgment, correctly marked Complete in REQUIREMENTS.md.

## Goal Achievement — Observable Truths (ROADMAP Success Criteria)

| # | Truth (ROADMAP SC) | Status | Evidence |
|---|---|---|---|
| 1 | Creating an org/person whose details match an existing record warns the user before the record is saved | ✓ VERIFIED, with a qualification (F-39-07) | **Person half:** browser-observed in 39-17's dark-mode UAT (real dialog, real `+55` phone, warning inside dialog, not red, nothing typed lost, name+distinguishing-value+reason, submit relabelled, matched-record link opens a second tab, re-submit commits without re-warning). **Organization half:** was genuinely broken through 39-14 (source gate green, but `organization-dialog.tsx` sent no `customFields`, so `draftHasIdentityValue` could never pass — confirmed by reading the gap trace in `39-GAPS.md` and reproducing it against git history). I traced the *current* code and re-ran the fix's own proof: `organization-dialog.tsx:324-336` now builds and conditionally spreads a `customFields` blob from `identityFieldNames` (sourced from `collectableIdentityFieldNames` in `src/lib/dedup/identity-inputs.ts`, wired through `src/app/organizations/page.tsx:126`); I ran `npx playwright test e2e/org-duplicate-warning.spec.ts` myself — **5/5 passed** (1 setup + 4 cases), independently of the SUMMARY's claim. **Qualification:** at 320×640, once the advisory renders the dialog is 940px tall with no scroll and "Create anyway" is unreachable by pointer (F-39-07, measured by 39-19, reproduced in principle from the `DialogContent` primitive — accepted and deferred by explicit human decision 2026-08-20). The warning **fires and is readable** at 320px; only the forward path is blocked there, and Escape still dismisses. |
| 2 | User scans an entity type on demand and gets a list of likely duplicate pairs | ✓ VERIFIED | Live database: one completed organization scan (`dedup_scans`, status=`completed`, progress `46,058/46,058`) produced 543 stored `duplicate_pairs` rows (queried directly against `localhost:5433`, read-only). Scan engine measured on live data by 39-07: 20.6s/405 pairs (organizations, fuzzy tier) and 32.0s/3,995 pairs (people) — wall clock ≈21s / ≈33s for a full scan. Runs as a background job with a polled progress bar (`scan-panel.tsx`), not inside the request. **My own view on the SC-2 timing divergence** (measured 20.6s/32.0s vs. research's "roughly 20 seconds" expectation): I agree with the executor that SC-2 survives. The scan is an async background job with a persisted, resumable progress UI specifically so it is not bound by a request timeout — a 33-second wait with a visible determinate bar and "you can leave this page and come back" copy is not a functional failure at any timing 39-RESEARCH considered plausible, and 46,054/38,348-row scale was the acknowledged design constraint from the start. |
| 3 | User merges two records, choosing the winning value field by field for every conflict | ✓ VERIFIED | `src/app/duplicates/[pairId]/merge-form.tsx` (610 lines, no TODO/FIXME/placeholder) implements the radio-group field picker; `src/lib/dedup/merge-defaults.ts` / `field-groups.ts` implement the pure default-selection rule (survivor wins except survivor-empty+loser-populated), unit-tested. Full workflow browser-observed by 39-17: survivor selector first, options stacked at 320px / two-up at 1280px (correct per UI-SPEC M-1 — the plan's own checklist wording, not the code, was wrong here, recorded as D-39-02 and correctly NOT fixed), selected-state has both a border color and a filled radio dot + `aria-checked`, empty side reads the word "empty," child-reassignment summary ("2 deals, 2 notes, 1 person… Activities stay attached… Uploaded files stay where they are"), no sticky/floating submit row, confirmation `AlertDialog` names both records and the destructive-red action button is legible in dark mode. |
| 4 | After a merge, every deal, activity, note, file, and custom field value from the losing record is attached to the survivor — nothing is orphaned | ✓ VERIFIED | I re-ran `npm run test:db` myself: **22/22 passed**, including the induced-failure atomicity test (a real Postgres `RAISE` mid-transaction) with before/after row-count parity at zero and all "surviving" counts at zero — proving a failed merge leaves nothing changed. Read the merge transaction (`src/lib/mutations/dedup.ts:339-490`): row locks (`for("update")`) on both records, exhaustive 3-FK reassignment (`deals.organizationId`/`personId`, `people.organizationId`), explicit two-statement `notes` handling (demote-then-move, scoped by `EXISTS` on the survivor, so the `notes_migration_uniq` partial unique index — verified still present via `dedup-checks.sql` — is never hit), activities correctly NOT reassigned because they have no organization/person column and follow their deal transitively (documented and true against the schema), and `customFields` written wholesale from `applyMergeChoices`'s complete blob. File custom fields: `isEmptyMergeValue` (`field-groups.ts:129-134`) explicitly handles arrays for "multi-select and file custom fields," and the file-download route (`src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts`) already resolves from a stored `publicUrl`/path rather than the record currently being viewed, so a merged file value keeps working from wherever it physically lives (pre-existing design, correctly not disturbed). 39-17's UAT confirms this end to end on real fixture rows: "3 deals / 3 notes / 1 person all on the survivor and 0 left on the loser." |
| 5 | The merge is visible in the surviving record's change history | ✓ VERIFIED, with an accepted qualification (F-39-05) | `merged` audit entries written inside the same transaction (`tx.insert(auditLog)`, never the fire-and-forget bus client — verified in code and by comment/grep-gate), rendered by `src/components/timeline/audit-entry.tsx` (14 action branches now include `merged`). Browser-observed by 39-17: survivor's entry reads "merged [name] into this organization," states "5 linked records moved to this one," field diff present. **Qualification:** the entry sits behind Phase 36's "Show field changes" OFF-by-default toggle (F-39-05, accepted — a Phase 36 decision, not new). |

**Score:** 5/5 truths verified (2 carry an explicitly accepted qualification, both already recorded in BACKLOG.md by human decision).

## Requirements Coverage

| Requirement | Description | Status | Evidence |
|---|---|---|---|
| DEDUP-01 | User is warned of likely duplicates when creating an organization or person, and can scan an entity type for existing duplicates on demand | ✓ SATISFIED | Truths 1 and 2 above. Both halves (person, organization) independently browser-proven; the organization half's real defect (D-39-01) is fixed and re-proven, not merely re-asserted. |
| DEDUP-02 | User can merge two records, choosing the winning value per conflicting field | ✓ SATISFIED | Truth 3 above. |
| DEDUP-03 | Merging reassigns all child records (deals, activities, notes, files, custom field values) to the surviving record rather than orphaning them | ✓ SATISFIED | Truth 4 above, including the real-database atomicity proof. |

**I confirm, rather than merely accept, the REQUIREMENTS.md marking of all three as Complete.** The
commit that made that change (`833e2ac`) touched only `REQUIREMENTS.md`; it did not update
`ROADMAP.md`'s `39-19-PLAN.md` checkbox (still `[ ]`) or the phase Progress table row (still
`20/21 | In Progress`), and `STATE.md` still reads "Executing Phase 39." **This is a bookkeeping
inconsistency for the orchestrator to reconcile, not a functional gap** — I did not modify any of
those three files per my constraints, and the substantive evidence above supports the Complete
marking regardless of which tracking file has caught up.

## Two Documented Near-Miss Gates — Verified Fixed, Not Just Claimed Fixed

The brief for this verification named two gates that were "nearly blind to the defect they existed
to prevent." I checked both against the current code rather than trusting the SUMMARY narrative:

- **39-13's poll-termination gate.** The first version of the assertion ("the poll callback contains
  a `clearInterval`") stayed green when the terminal-status `clearInterval` was deleted, because the
  poll's other early exits also call `clearInterval`. I read the current gate
  (`src/app/duplicates/__tests__/scan-panel-wiring.test.ts:222-236`) and confirmed it now extracts the
  `if (isTerminal(...))` branch specifically by brace-matching before asserting — the weaker
  assertion is gone. I also confirmed `scan-panel.tsx:333-334` still contains the guarded
  `clearInterval` inside that exact branch.
- **39-21's picker/dialog equivalence test.** Probe (a) showed the shared-predicate equivalence test
  was 4-of-5 blind (only the `FIELD_E`, carried-by-nothing candidate discriminated a broken shared
  rule; the other four candidates stayed green because the two callers iterate different domains).
  This was run, not reasoned about, and the finding is recorded honestly in the test file's own
  header rather than the originally-written (and falsified) claim. I consider this exemplary process
  rather than a defect: the plan's insistence on including a "carried by nothing" candidate is what
  surfaced the limit, and it is now documented rather than hidden.

Neither is a live gap. Both are evidence the phase's rigor claims hold up under my own re-reading.

## The Stale "Two Call Sites" Assertion (V-5 / P-2) — Verified Harmless, Documentation Drift Confirmed

I independently confirmed the brief's claim: `src/app/import/import-wizard.tsx` contains **zero**
occurrences of `ProgressBar` (`grep -c ProgressBar` = 0) — it never was a call site. The real second
call site is `src/app/import/steps/confirm-step.tsx:195`. This mis-citation appears in
`39-13-PLAN.md` (twice), in `39-UI-SPEC.md`'s own "V-5" row, and is *referenced* (but not repeated) as
"39-VALIDATION V-5" in the plan — I checked the actual `39-VALIDATION.md` and its real V-5 is
"Playwright stays out of CI," an unrelated rule, so that citation is itself a stale cross-reference,
not a second instance of the defect.

**Functionally harmless, verified rather than assumed:** `git log -- src/app/import/steps/confirm-step.tsx`
shows exactly two commits — the original 2025 wizard and 39-16's unrelated flagged-rows-notice
addition — neither is the 39-13 progress-bar lift (`1fc0fa3`), whose diff touches only the two
`progress-bar.tsx` files. So the real call site (`confirm-step.tsx`) genuinely was unaffected by the
refactor; the plan's stated verification just named the wrong file to prove it. `39-13-SUMMARY.md`
itself discloses this ("V-5's stated call sites are not the real ones… the real call site was
asserted alongside it"), so this is a documentation-accuracy defect the executor already flagged
honestly, not a gap I am the first to find.

## A New Finding: A Pre-Existing, App-Wide Hydration Race Can Swallow a Dialog-Trigger Click

Not claimed by any SUMMARY, found independently while investigating full-suite Playwright flakiness.

**What I observed.** Running `npx playwright test` (the full suite) three times produced 33/33, then
31/33 (2 failures in `e2e/org-duplicate-warning.spec.ts`, both "the create dialog did not open"), then
32/33 (1 failure, same file, same symptom) — on different test cases each time. Running
`e2e/org-duplicate-warning.spec.ts` **alone**, twice, produced 5/5 both times. This is a real flake
under concurrent-worker load that is **not** the one flake already disclosed in `39-19-SUMMARY.md`
(that one was `auth.setup.ts` timing out on `waitForURL`) and is not yet in `BACKLOG.md`'s "e2e auth
setup is flaky" entry.

**Root cause, reproduced independently with a standalone script (no repo files modified).** Loading
`/people`, `/organizations` or `/activities` (but not `/deals`) throws a page-level
`Minified React error #418` (a hydration mismatch). Clicking "Add Person" / "Add Organization"
**immediately** after page load can have the click swallowed while React discards and re-renders the
mismatched tree — reproduced 3/3 times at both 320×640 and 1280×900. Waiting ~2 seconds before
clicking made it succeed every time I tried. This is exactly the shape of race that would show up as
an intermittent "dialog did not open" failure under the CPU pressure of a parallel test run and would
not show up in an isolated run or in ordinary human use (where a person does not click a button in the
same tick the page finishes loading).

**Why this does not change the phase's status.** `/activities` has the identical hydration error and
carries no Phase 39 code at all, while `/deals` (also untouched by Phase 39) has none — this is a
pre-existing, app-wide React hydration issue, not something Phase 39 introduced, and not specific to
the duplicate-detection button (any button on the affected pages is equally exposed). I am reporting
it because it is real and because it is the mechanism behind a flake this phase did not disclose, but
per the same reasoning the phase already applied to F-39-08 (a different pre-existing, cross-surface
keyboard defect it found and correctly declined to fix), it belongs in `BACKLOG.md` as a new
app-wide item, not as a Phase 39 gap. **Recommend:** add an entry alongside the existing "e2e auth
setup is flaky" one, naming the React #418 hydration mismatch on `/people`, `/organizations`,
`/activities` as its likely cause.

## Independently Re-Run Gates (not taken on the SUMMARYs' word)

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | 0 errors |
| Lint | `npm run lint` | 0 errors, 127 warnings (matches claimed baseline) |
| Unit + component | `npm run test` | 128 files / 2743 passed, 1 file / 21 skipped, + RSC 2 files / 8 passed |
| Real-database integration | `npm run test:db` | 22/22 passed, including the induced-`RAISE` atomicity proof with zero row-count drift |
| SQL invariants | `docker exec … psql -f scripts/dedup-checks.sql` | 77 PASS, 0 FAIL |
| E2E, isolated | `npx playwright test e2e/org-duplicate-warning.spec.ts` | 5/5 passed (both times run) |
| E2E, full suite | `npx playwright test` | 33/33, then 31/33, then 32/33 across three independent runs — see the hydration-race finding above |
| Live DB state | direct read-only `SELECT` at `localhost:5433` | `app_settings` dedup rows: 0 (unconfigured, as documented); `duplicate_pairs`: 543, all `organization`; `dedup_scans`: 1, `completed`; `organizations`: 46,054; `people`: 38,348 — matches the evidence packet exactly |

No `sudo`, no `TRUNCATE`/`DROP`/unscoped `DELETE`, no Docker rebuild or restart, no migration
generated, no product file written — only temporary read-only scratch scripts under the session
scratchpad, deleted before finishing.

## Anti-Patterns Scan

Scanned every file touched across the phase's commit history under `src/**/dedup*`,
`src/app/duplicates/**`, `src/components/dedup/**`, `src/lib/dedup/**`, `src/lib/mutations/dedup*`
(53 files): zero `TBD`/`FIXME`/`XXX`, zero `TODO`/`HACK`/`PLACEHOLDER` outside test/comment prose
describing what such markers would mean. No debt-marker blocker found.

## Accepted Qualifications (confirmed accurately recorded in BACKLOG.md, not treated as new gaps)

| Item | BACKLOG.md section | Confirmed accurate? |
|---|---|---|
| F-39-07 — 320px "Create anyway" unreachable by pointer once advisory renders | From Phase 39 | Yes — measured height/position figures match exactly |
| F-39-08 — Enter hijacks the modal via the list page's document-level hotkey | From Phase 39 | Yes |
| F-39-04 — `ProgressBar` has no `role="progressbar"`/`aria-valuenow` | From Phase 39 | Yes |
| F-39-06 — `text-primary` near-invisible in dark mode | From Phase 39 | Yes |
| Scan-guard atomicity (read-then-write `createScanState` guard) | From Phase 39 | Yes |
| Loser's own `merged` timeline row renders `{name}` empty (unreachable today) | From Phase 39 | Yes |
| `drizzle-kit migrate` cannot build a fresh database (`import_sessions` predates its own migration) | Cross-phase, belongs to Phase 43 | Yes |

I did not find any of these worse than described. None of them, individually or together, falsify
any of the five success criteria above — every one was deliberately deferred by an explicit human
decision recorded on 2026-08-20, and the objective for this verification explicitly instructs me not
to manufacture gaps out of already-accepted items.

## What This Phase Does NOT Deliver, Despite Passing

Stated plainly, per the deliverable's instruction:

1. **A mobile (320px) user who hits a certain duplicate while creating an organization or person
   cannot press "Create anyway."** They see the warning (it fires and is legible), and they are not
   trapped (Escape and the overlay still dismiss), but they cannot complete that create by pointer at
   that viewport. This is F-39-07, deferred app-wide because the fix is an architectural change to the
   `DialogContent` primitive behind ~16 dialogs, not something scoped to Phase 39.
2. **The organization exact-match ("certain") tier is inert on this deployment** because
   `dedup.organization_identity_fields` is unconfigured (`app_settings` holds zero `dedup%` rows).
   This is the locked, fail-closed design — not a defect — but it means the 543 stored pairs are
   currently all fuzzy-tier ("likely"), and an admin must configure an identity field before the
   organization advisory or the certain-tier scan results can fire at all.
3. **The merge's own audit entry is not visible by default** on the survivor's timeline — it is
   behind Phase 36's "Show field changes" toggle, off by default.
4. **The loser's own copy of the merge event renders with a blank name** in the one place it would
   currently be reachable (it currently is not reachable, because the detail page 404s a soft-deleted
   record before rendering its timeline).
5. **A fresh `drizzle-kit migrate` cannot build this database from scratch** (an unrelated, pre-Phase-39
   migration ordering defect that this phase's own real-database test setup had to work around).
6. **The exact "two call sites" named by the progress-bar lift's own verification (V-5 / P-2) is
   wrong in one of its two entries** — it names `import-wizard.tsx` instead of `confirm-step.tsx`.
   The refactor itself is correct and the real call site is provably untouched; only the stated
   proof's wording is stale, in three documents.
7. **A pre-existing, app-wide React hydration mismatch** on `/people`, `/organizations` and
   `/activities` (not `/deals`) can occasionally swallow a dialog-trigger click if it lands in the
   same tick as the page's hydration recovery — a newly-found, not-yet-backlogged flake source,
   unrelated to duplicate-detection logic specifically.

None of the above blocks DEDUP-01, DEDUP-02 or DEDUP-03 as stated. Items 1-6 are already known and
accepted by explicit human decision; item 7 is a new finding I recommend adding to BACKLOG.md but
which — being pre-existing, app-wide, and unrelated to the dedup feature's own logic — does not
itself falsify the phase goal.

## Human Verification Required

None. The phase's own `checkpoint:human-verify` (plan 39-17) already drove a real, dark-mode browser
pass across all five success criteria with self-created fixtures, and plan 39-19 closed the one gap
that checkpoint found with a second independent browser proof. I re-ran the phase's automated gates
myself rather than trusting their reported output, and found nothing that requires a further human
pass beyond what BACKLOG.md already tracks. The one new finding (item 7 above) is fully characterized
by my own reproduction, not left uncertain — there is nothing further for a human to observe that I
have not already reported.

---

_Verified: 2026-08-21T00:26:18Z_
_Verifier: Claude (gsd-verifier)_
