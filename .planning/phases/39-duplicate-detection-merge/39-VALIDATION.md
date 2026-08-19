---
phase: 39
slug: duplicate-detection-merge
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-18
---

# Phase 39 — Validation Strategy

> Per-phase validation contract. Derived from `39-RESEARCH.md` § Validation Architecture, whose
> numbers were measured against the live Docker Postgres. Where this file and the research disagree,
> the research is the evidence and this file is the contract.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Unit framework** | vitest 4.0.18, two projects: `vitest.config.ts` (`environment: 'node'`) and `vitest.rsc.config.ts` (`react-server` condition) |
| **Unit include glob** | `src/**/*.{test,spec}.?(c\|m)[jt]s?(x)` — anchored at `src/` |
| **Quick run** | `./node_modules/.bin/vitest run <path>` |
| **Full suite** | `npm run test` (both projects; 2,224 + 8 passing at phase start) |
| **Gates** | `npm run typecheck` (`tsc --noEmit`), `npm run lint` (`eslint`) |
| **E2E** | Playwright ^1.62.1, `playwright.config.ts`, **no `webServer`** — attaches to the Docker app; 23 assertions green at phase start |
| **E2E auth** | `e2e/auth.setup.ts` → `e2e/.auth/admin.json` storageState (gitignored) |
| **DOM testing** | **None. There is no jsdom, and this phase must not add one.** Component contracts use comment-stripped source scans via `readStrippedSource` from `src/components/custom-fields/__tests__/source-scan.ts` |
| **CI** | `.github/workflows/ci.yml`: `npm ci`, typecheck, lint, test. **No Docker, no database.** |

---

## Sampling Rate

- **After every task commit:** `npm run typecheck && npm run lint`, plus the one vitest file the task
  touches.
- **After every wave:** `npm run test` (both projects).
- **Before any Playwright run:** `docker compose up -d --build`, then wait for
  `http://localhost:3001`. The image has no volume mount, so source changes are invisible until
  rebuilt. **Batch UI edits per wave** — Phase 45 budgeted one rebuild and needed four; budget
  accordingly and say so in the plan rather than discovering it.
- **Before any migration verification:** run the migration, then
  `docker compose exec -T postgres psql -U pipelite -d pipelite -f scripts/dedup-checks.sql`.
- **Phase gate:** typecheck + lint + `npm run test` green, `./node_modules/.bin/playwright test`
  green, **and** the EXPLAIN check confirming the trigram index is actually chosen.

---

## Per-Criterion Verification Map

| Criterion | Behaviour | Test type | Automated command | Exists? |
|---|---|---|---|---|
| SC-1 | Normalization: legal suffixes (LTDA/ME/EIRELI/S.A./CIA), accents, punctuation, the `S A` case, empty/short guard | unit | `vitest run src/lib/dedup/normalize.test.ts` | ❌ W0 |
| SC-1 | Tier classification — certain vs likely vs neither, including invalid-email rejection | unit | `vitest run src/lib/dedup/scoring.test.ts` | ❌ W0 |
| SC-1 | **The index is actually used** — EXPLAIN shows a Bitmap Index Scan on the trigram index | script | `psql -f scripts/dedup-checks.sql` | ❌ W0 |
| SC-1 | Warning renders in-dialog; `target="_blank"` present; merge keys appear **zero** times in both create dialogs | source gate | `vitest run src/components/dedup/__tests__/duplicate-warning-wiring.test.ts` | ❌ W0 |
| SC-1 | Org identity key is read from the admin setting, and absence degrades to no certain tier | unit | `vitest run src/lib/dedup/scoring.test.ts` | ❌ W0 |
| SC-2 | Poll shape — `setState` never in the effect body; all status branches present | source gate | `vitest run src/app/duplicates/__tests__/scan-panel-wiring.test.ts` | ❌ W0 |
| SC-2 | `/duplicates` joins the viewport matrix (6×3 → 7×3) | e2e | `playwright test e2e/viewport-320.spec.ts` | ✅ **extend** |
| SC-3 | **Default-selection rule** — survivor wins EXCEPT survivor-empty + loser-populated | unit | `vitest run src/lib/dedup/merge-defaults.test.ts` | ❌ W0 |
| SC-3 | Field partitioning: conflicts / filled-only / identical (both-empty counts as identical) | unit | `vitest run src/lib/dedup/field-groups.test.ts` | ❌ W0 |
| SC-3 | No unprefixed `grid-cols-2` in any merge component; no `sticky`/`fixed` on the submit row | source gate | `vitest run src/app/duplicates/__tests__/merge-form-wiring.test.ts` | ❌ W0 |
| SC-3 | `/duplicates/[pairId]` has no horizontal overflow at 320×640 in all three locales | e2e | `playwright test e2e/merge-screen-320.spec.ts` | ❌ W0 |
| SC-4 | **Merge reassigns every child and orphans nothing** — deals, people, notes; loser soft-deleted; audit rows written | **integration (real DB)** | `vitest run src/lib/mutations/dedup.test.ts` | ❌ W0 |
| SC-4 | **Both records carry a `source='migration'` note and the merge still succeeds** | **integration (real DB)** | same file | ❌ W0 — **the single highest-value test in this phase** |
| SC-4 | Transaction atomicity — an induced mid-merge failure leaves BOTH records exactly as they were | **integration (real DB)** | same file | ❌ W0 |
| SC-4 | Activities are NOT reassigned and still resolve through their deal | **integration (real DB)** | same file | ❌ W0 |
| SC-5 | `merged` audit entry branches, brace-scoped so a negative assertion isn't answered by unrelated code | source gate | `vitest run src/components/timeline/__tests__/merged-entry-wiring.test.ts` | ❌ W0 |
| all | New `dedup.*` keys × 3 locales as an exact set; `REQUIRED_AUDIT_KEYS` extended; ICU plural coverage | unit | `vitest run src/messages/locale-parity.test.ts` | ✅ **extend** |

---

## Wave 0 Requirements

- [ ] `src/lib/dedup/` — `normalize`, `scoring`, `merge-defaults`, `field-groups`, each with tests
- [ ] `src/lib/mutations/dedup.test.ts` — **real-database integration tests** (see V-1)
- [ ] `scripts/dedup-checks.sql` — EXPLAIN assertions, index existence, function volatility, and
      confirmation that `notes_migration_uniq` still exists. Follows the `scripts/audit-log-checks.sql`
      precedent already in the repo.
- [ ] Extend `src/messages/locale-parity.test.ts` with an exact-set `REQUIRED_DEDUP_KEYS` and the new
      audit keys
- [ ] `e2e/merge-screen-320.spec.ts` — self-created, self-cleaned fixtures
- [ ] Extend `e2e/viewport-320.spec.ts` to `/duplicates`, with a per-route visible-element anchor
- [ ] Four source gates: warning, scan panel, merge form, merged audit entry

---

## Validation Rules (phase-specific, binding)

- **V-1 — The merge gets REAL-DATABASE integration tests, and this is the point of them.** Every
  existing mutation test in this repo mocks `db`. A mock cannot raise `notes_migration_uniq`, which
  research measured as affecting ~40% of organization merges (and notes that the true rate is likely
  *higher*, since duplicate pairs come from the same import). A mocked merge test would pass while
  the feature failed on nearly half of real records. Scope real-DB testing to `dedup.test.ts`; do
  **not** migrate the existing mocked tests.
- **V-2 — Index-usage must be proven by EXPLAIN, not assumed.** If the index is built on a different
  expression than the query uses, Postgres silently ignores it and the scan degrades from ~20s to
  ~26min without any error. This is the classic failure mode for this feature and it is invisible to
  every other kind of test.
- **V-3 — Anti-vacuity on every e2e assertion.** A blank page, an error page, and a redirect all
  satisfy `scrollWidth <= clientWidth`. Anchor each measurement to content proving the real
  authenticated page rendered. Inherited from Phase 45, non-negotiable.
- **V-4 — E2E fixtures are self-created and self-cleaned.** Follow `e2e/deals-drag.spec.ts`: create
  the records the spec needs, hard-delete them and their children afterwards, and verify zero rows
  left. Never borrow and mutate a real user record.
- **V-5 — Playwright stays out of CI.** No Docker, no database, no app server there.
- **V-6 — Rebuild before measuring.** Any Playwright-verified task needs
  `docker compose up -d --build` first.
- **V-7 — No jsdom.** Component decisions use source-scan gates.
- **V-8 — The merge must never leak a raw Postgres error to the browser.** A 23505 message names the
  index and leaks schema. Return a fixed sentinel, following `purgeOrganizationMutation`'s catch.
- **V-9 — Server-side authorization, tested.** `survivorId` must be validated as a member of the
  pair server-side, and `/duplicates` is admin-only. A crafted request must not be able to merge
  arbitrary records. This needs a test, not just an implementation.

---

## Assumptions Carried Into Planning

From `39-RESEARCH.md` § Assumptions Log — the ones that change task shape:

- **A1 (medium):** Drizzle 0.45.1's support for a STORED generated column. **Verify against the
  installed typings before planning the migration task.** Fallback is a hand-written SQL migration
  plus a plain `text()` column in the Drizzle schema — more code, same result.
- **A3 (medium):** the `changes` JSONB key shape for the `merged` audit row. A bad key renders as an
  unlabelled field row in the timeline. Read `describeField` in `src/lib/audit/present.ts` and pick a
  shape it handles, or extend it deliberately.
- **A4 (medium):** the exact ref-name list for forcing an `Organization.*` formula refresh on
  reparented children. Wrong list → the recalc silently no-ops and children keep stale values.
- **A7 (low):** `REQUIRED_AUDIT_KEYS`' current size is reported inconsistently. **Read the constant;
  do not trust any number in a planning document.**
- **A8 (medium):** the 0.85 similarity threshold is measured on one dataset with no scored ground
  truth. Making it an `app_settings` value hedges this cheaply and is within Claude's discretion.

---

## Manual-Only Verifications

| Behavior | Criterion | Why Manual | Test Instructions |
|---|---|---|---|
| Whether the *likely* tier's pairs are actually plausible duplicates to a human | SC-2 | Precision has no ground truth in this dataset. Research sampled the 0.85–0.92 band by eye and judged it high-precision, but that is a judgement, not a measurement. | After the first real scan, read 20 pairs and judge whether they are duplicates. If precision is poor, raise the threshold — it is an app setting, not a code change. |

*Note the contrast with Phase 45: this table has exactly one row, and it is a judgement call rather
than a capability gap. Everything else in this phase is machine-checkable, and the item most likely
to ship broken (the migration-note collision) is covered by a real-database test rather than a
manual step.*

---

## Validation Sign-Off

- [ ] Every task has an automated verify or an explicit Wave 0 dependency
- [ ] Wave 0 covers every ❌ in the verification map
- [ ] No watch-mode flags
- [ ] The EXPLAIN index-usage check runs before the phase gate
- [ ] `nyquist_compliant: true`

**Approval:** approved 2026-08-18 — derived from measured research; V-1 reflects the user's explicit
decision to add real-DB integration tests for the merge.
