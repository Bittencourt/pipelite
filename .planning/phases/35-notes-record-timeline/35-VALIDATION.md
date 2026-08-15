---
phase: 35
slug: notes-record-timeline
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-15
mapped: 2026-08-15
---

# Phase 35 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `35-RESEARCH.md` § Validation Architecture (measured, not assumed).
> Task IDs assigned by the planner on 2026-08-15; every `Automated Command` below is carried
> verbatim into the named plan's `<verify><automated>` block.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.0.18, **two projects** |
| **Config file** | `vitest.config.ts` (node env, `src/**/*.{test,spec}.*`, excludes `*.rsc.test.*`) + `vitest.rsc.config.ts` (`react-server` condition, only `src/**/*.rsc.test.*`) |
| **Quick run command** | `npx vitest run <path>` |
| **Full suite command** | `npm test` (runs both projects) |
| **Estimated runtime** | ~45 seconds (461 passing today across 41 files) |
| **Type gate** | `npm run typecheck` |
| **Lint gate** | `npm run lint` |
| **CI** | `.github/workflows/ci.yml` — typecheck, lint, test; required check on master |

**Critical constraint:** the suite **mocks `@/db` entirely** (`vi.mock("@/db", …)` in every mutation
test). There is no live-database integration harness. The migration, the reconciliation, and the
real SQL plan therefore **cannot** be covered by vitest — they are verified by the checked-in
`scripts/reconcile-notes.sql` plus recorded psql evidence, exactly as Phase 33 did for its indexes.

**Second constraint:** anything reachable from a `*.rsc.test.tsx` file may **not** import
`react-dom/server` — it cannot load under the `react-server` condition. Tests needing
`renderToStaticMarkup` must be named `*.test.tsx`, like the existing `rsc-boundary.test.tsx`.

---

## Sampling Rate

- **After every task commit:** `npx vitest run <the touched test file>` + `npm run typecheck`
- **After every plan wave:** `npm test` (both projects) + `npm run lint`
- **After the migration task specifically (35-03 task 3):** run `scripts/reconcile-notes.sql` and
  paste the BEFORE/AFTER numbers into the plan SUMMARY — vitest cannot cover it
- **After every new `.tsx` in `src/components/timeline/`:** run the CFUI-01 class-wide gate
- **Before `/gsd:verify-work`:** full suite green + the ten browser checks in plan 35-15 task 3
- **Max feedback latency:** ~45 seconds (full suite); <5 seconds (single file)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 35-04-T1/T2 | 35-04 | 2 | NOTE-01 | — | N/A | unit | `npx vitest run src/lib/mutations/notes.test.ts` | ❌ created by 35-04 T1 | ⬜ pending |
| 35-04-T1/T2 | 35-04 | 2 | NOTE-01 | T-35-07 / V5 | Accepts a 131,505-char note; rejects empty/whitespace-only | unit | `npx vitest run src/lib/mutations/notes.test.ts -t "long note"` | ❌ created by 35-04 T1 | ⬜ pending |
| 35-04-T1/T2 | 35-04 | 2 | NOTE-01 | — | `updateNoteMutation` stamps `updatedAt`, preserves `createdAt` | unit | `npx vitest run src/lib/mutations/notes.test.ts -t "edited"` | ❌ created by 35-04 T1 | ⬜ pending |
| 35-04-T1/T2 | 35-04 | 2 | NOTE-01 | T-35-06 / V4 | Soft delete sets `deletedAt`, never issues `DELETE` | unit | `npx vitest run src/lib/mutations/notes.test.ts -t "soft delete"` | ❌ created by 35-04 T1 | ⬜ pending |
| 35-04-T1/T2 | 35-04 | 2 | NOTE-01 | T-35-04 | Parent record existence + not-soft-deleted checked before insert (no FK on `entityId`) | unit | `npx vitest run src/lib/mutations/notes.test.ts -t "dangling"` | ❌ created by 35-04 T1 | ⬜ pending |
| 35-07-T1/T2 | 35-07 | 2 | NOTE-01 | T-35-03 / V4 | Non-author non-admin rejected; author allowed; admin allowed | unit | `npx vitest run src/lib/notes/authorize.test.ts` | ❌ created by 35-07 T1 | ⬜ pending |
| 35-09-T1/T2 | 35-09 | 4 | NOTE-01 | T-35-10 / V7 | Actions return `{success:true,…}` / `{success:false,error}`, no raw PG error | unit | `npx vitest run src/app/notes/actions.test.ts` | ❌ created by 35-09 T1 | ⬜ pending |
| 35-08-T1/T2 | 35-08 | 3 | NOTE-02 | T-35-26 | Pre-limited `UNION ALL`: 3 branches for `deal`, 1 for other entity types | unit | `npx vitest run src/lib/timeline/assemble.test.ts` | ❌ created by 35-08 T1 | ⬜ pending |
| 35-08-T1/T2 | 35-08 | 3 | NOTE-02 | T-35-26 | Every branch carries `ORDER BY … DESC, id DESC LIMIT n+1` | unit | `npx vitest run src/lib/timeline/assemble.test.ts -t "pre-limit"` | ❌ created by 35-08 T1 | ⬜ pending |
| 35-08-T1/T2 | 35-08 | 3 | NOTE-02 | T-35-01 / T-35-02 | Keyset cursor yields `(created_at, id) < (…,…)` on every branch, bound not interpolated | unit | `npx vitest run src/lib/timeline/assemble.test.ts -t "cursor"` | ❌ created by 35-08 T1 | ⬜ pending |
| 35-08-T1/T2 | 35-08 | 3 | NOTE-02 | T-35-27 | `hasMore` derives from the `n+1`th row and that row is discarded | unit | `npx vitest run src/lib/timeline/assemble.test.ts -t "hasMore"` | ❌ created by 35-08 T1 | ⬜ pending |
| 35-05-T1/T2 | 35-05 | 2 | NOTE-02 | T-35-02 / V5 | Cursor round-trips; malformed cursor rejected before reaching SQL, never throws | unit | `npx vitest run src/lib/timeline/cursor.test.ts` | ❌ created by 35-05 T1 | ⬜ pending |
| 35-06-T1/T2 | 35-06 | 2 | NOTE-02 | T-35-22 / T-35-23 | Stage-history subscriber inserts on `deal.stage_changed`; idempotent on double-register; failures logged | unit | `npx vitest run src/lib/events/subscribers/stage-history.test.ts` | ❌ created by 35-06 T1 | ⬜ pending |
| 35-02-T1/T2 | 35-02 | 1 | i18n | — | All 30 new `notes.*` keys exist in all three locale files | unit | `npx vitest run src/messages/locale-parity.test.ts` | ❌ created by 35-02 T1 | ⬜ pending |
| 35-11/12/13/14 | 35-11, 35-12, 35-13, 35-14 | 5–8 | CFUI-01 | T-35-30 | No server component renders a children-forwarding `asChild` component | unit (existing repo-wide gate) | `npx vitest run "src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx"` | ✅ exists | ⬜ must stay green |
| 35-10-T2 | 35-10 | 3 | NOTE-01 | T-35-03 / T-35-08 | v1 route enforces author-or-admin, wraps every handler in `withApiAuth`, never hard-deletes | unit | `npx vitest run "src/app/api/v1/notes/__tests__/route.test.ts"` | ❌ created by 35-10 T2 | ⬜ pending |
| 35-03-T3 | 35-03 | 2 | NOTE-03 | T-35-11 / T-35-14 | Migration count and byte reconciliation both return zeros | psql (manual) | `docker compose exec -T postgres psql -U pipelite -d pipelite -f - < scripts/reconcile-notes.sql` | ❌ created by 35-03 T2 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Every missing test file is created by the RED task of its owning plan, so Wave 0 is distributed
across waves 1–4 rather than being a separate pre-wave. No task in this phase has a `<verify>`
without an `<automated>` block.

- [ ] `src/messages/locale-parity.test.ts` — plan **35-02** task 1 (wave 1)
- [ ] `src/lib/mutations/notes.test.ts` — plan **35-04** task 1 (wave 2), mirrors `src/lib/mutations/organizations.test.ts`'s `vi.mock("@/db")` shape
- [ ] `src/lib/timeline/cursor.test.ts` — plan **35-05** task 1 (wave 2)
- [ ] `src/lib/events/subscribers/stage-history.test.ts` — plan **35-06** task 1 (wave 2), mirrors `webhook.test.ts`
- [ ] `src/lib/notes/authorize.test.ts` — plan **35-07** task 1 (wave 2)
- [ ] `scripts/reconcile-notes.sql` — plan **35-03** task 2 (wave 2), checked in and re-runnable
- [ ] `src/lib/timeline/assemble.test.ts` — plan **35-08** task 1 (wave 3)
- [ ] `src/app/api/v1/notes/__tests__/route.test.ts` — plan **35-10** task 2 (wave 3)
- [ ] `src/app/notes/actions.test.ts` — plan **35-09** task 1 (wave 4)
- [ ] Framework install: **none needed** — vitest 4.0.18 and both configs already exist

**Sampling continuity check:** no three consecutive tasks in any plan lack an automated verify.
Every task in every plan carries at least one `<automated>` command; the only `<human-check>` in the
phase (35-15 task 3) sits alongside three automated commands.

---

## Manual-Only Verifications

The `@/db` mock makes these unreachable from vitest. Each produces recorded evidence in the plan
SUMMARY, Phase-33 style.

| Behavior | Requirement | Owning Plan | Why Manual | Test Instructions |
|----------|-------------|-------------|------------|-------------------|
| Migration inserts the correct count per entity type | NOTE-03 | 35-03 T3 | Data migration against live data | `scripts/reconcile-notes.sql` part 1 — delta must be 0 |
| Migrated content is byte-identical to the legacy value | NOTE-03 / SC-4 | 35-03 T3 | Byte comparison across two tables | `scripts/reconcile-notes.sql` part 2 — mismatched must be 0 |
| Re-running the migration inserts 0 rows (idempotency) | NOTE-03 | 35-03 T3 | Requires applying the statements twice | Re-run the `INSERT … SELECT` block, expect `INSERT 0 0` four times |
| The 131,505-character note survives the migration | NOTE-03 | 35-03 T3 | Length assertion against live data | `SELECT max(length(content)) FROM notes WHERE source='migration'` returns 131505 |
| Timeline SQL plan is `Merge Append` over index scans, <5 ms warm | NOTE-02 | 35-08 (recorded in SUMMARY) | DB is mocked in vitest | `EXPLAIN (ANALYZE, BUFFERS)` via `docker compose exec -T postgres psql` on the hostile deal. Phase 33 D-01: a `Bitmap Index Scan` satisfies the criterion; do not demand a literal `Index Scan` node |
| Stage drag → timeline entry, end to end | NOTE-02 / SC-2 | 35-15 T3 check 4 | Crosses bus, subscriber, standalone-build registration, DB and RSC render | Drag a deal between stages in Docker; the timeline must show the entry. A passing unit test proves the handler works, NOT that it is registered — this repo shipped that exact bug on 2026-08-08 |
| A migrated note is the oldest entry and carries the Migrated badge | NOTE-03 / SC-3 | 35-15 T3 check 6 | Visual ordering | Open any organization with legacy notes at `http://localhost:3001` |
| Add / edit / delete a note, and Load more | NOTE-01 / SC-1 | 35-15 T3 checks 1, 2, 3, 7 | Client interactivity | Browser at `http://localhost:3001`, on all four entity types |
| Legacy column dormancy: create keeps the box and writes a note row, edit has no field, kanban shows no snippet | NOTE-01 | 35-15 T3 check 9 | Cross-surface UI behaviour | Browser, all four create and edit dialogs plus the kanban board |
| Dark mode and 320px width | — | 35-15 T3 check 10 | Visual | Browser |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or an explicit Wave 0 dependency named in the owning plan
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references, distributed across waves 1–4
- [x] No watch-mode flags
- [x] Feedback latency < 45s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planner-mapped 2026-08-15 (15 plans, 34 tasks)
