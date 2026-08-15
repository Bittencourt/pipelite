---
phase: 35
slug: notes-record-timeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-15
---

# Phase 35 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `35-RESEARCH.md` § Validation Architecture (measured, not assumed).

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
- **After the migration task specifically:** run `scripts/reconcile-notes.sql` and paste the
  BEFORE/AFTER numbers into the plan file — vitest cannot cover it
- **Before `/gsd:verify-work`:** full suite green + browser verification in Docker of
  (a) add/edit/delete a note, (b) Load more, (c) a stage drag producing a timeline entry,
  (d) a migrated note showing its marker and sorting first
- **Max feedback latency:** ~45 seconds (full suite); <5 seconds (single file)

---

## Per-Task Verification Map

Task IDs are assigned by the planner; the planner MUST map each row below onto a task and carry the
`Automated Command` verbatim into that task's `<automated>` verify block.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 0 | NOTE-01 | — | N/A | unit | `npx vitest run src/lib/mutations/notes.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | NOTE-01 | V5 | Accepts a 131,505-char note; rejects empty/whitespace-only | unit | `npx vitest run src/lib/mutations/notes.test.ts -t "long note"` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | NOTE-01 | — | `updateNoteMutation` stamps `updatedAt`, preserves `createdAt` | unit | `npx vitest run src/lib/mutations/notes.test.ts -t "edited"` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | NOTE-01 | V4 | Soft delete sets `deletedAt`, never issues `DELETE` | unit | `npx vitest run src/lib/mutations/notes.test.ts -t "soft delete"` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | NOTE-01 | V4 / IDOR | Non-author non-admin rejected; author allowed; admin allowed | unit | `npx vitest run src/lib/notes/authorize.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | NOTE-01 | V7 | Actions return `{success:true,id}` / `{success:false,error}`, no raw PG error | unit | `npx vitest run src/app/notes/actions.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | NOTE-01 | Tampering | Parent record existence + not-soft-deleted checked before insert (no FK on `entityId`) | unit | `npx vitest run src/lib/mutations/notes.test.ts -t "dangling"` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | NOTE-02 | — | Pre-limited `UNION ALL`: 3 branches for `deal`, 1 for other entity types | unit | `npx vitest run src/lib/timeline/assemble.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | NOTE-02 | — | Every branch carries `ORDER BY … DESC, id DESC LIMIT n+1` | unit | `npx vitest run src/lib/timeline/assemble.test.ts -t "pre-limit"` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | NOTE-02 | Tampering | Keyset cursor yields `(created_at, id) < (…,…)` on every branch, bound not interpolated | unit | `npx vitest run src/lib/timeline/assemble.test.ts -t "cursor"` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | NOTE-02 | V5 | Cursor round-trips; malformed cursor rejected before reaching SQL | unit | `npx vitest run src/lib/timeline/cursor.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | NOTE-02 | — | `hasMore` derives from the `n+1`th row and that row is discarded | unit | `npx vitest run src/lib/timeline/assemble.test.ts -t "hasMore"` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | NOTE-02 | — | Stage-history subscriber inserts on `deal.stage_changed`; idempotent on double-register | unit | `npx vitest run src/lib/events/subscribers/stage-history.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | i18n | — | All new `notes.*` keys exist in all three locale files | unit | `npx vitest run src/messages/locale-parity.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | — | CFUI-01 | — | No server component renders a children-forwarding `asChild` component | unit (existing gate) | `npx vitest run "src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx"` | ✅ exists | ⬜ must stay green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/mutations/notes.test.ts` — NOTE-01 (mirror `src/lib/mutations/organizations.test.ts`'s `vi.mock("@/db")` shape)
- [ ] `src/lib/notes/authorize.test.ts` — NOTE-01 authorization (author-or-admin)
- [ ] `src/lib/timeline/assemble.test.ts` — NOTE-02 SQL shape, pre-limit, cursor, hasMore
- [ ] `src/lib/timeline/cursor.test.ts` — NOTE-02 cursor encode/decode + rejection
- [ ] `src/lib/events/subscribers/stage-history.test.ts` — NOTE-02 (mirror `webhook.test.ts`)
- [ ] `src/app/notes/actions.test.ts` — server action contract
- [ ] `scripts/reconcile-notes.sql` — NOTE-03 / SC-4, checked in and re-runnable
- [ ] `src/messages/locale-parity.test.ts` — no such gate exists today; three JSON files drifting is a live risk
- [ ] Framework install: **none needed** — vitest 4.0.18 and both configs already exist

---

## Manual-Only Verifications

The `@/db` mock makes these unreachable from vitest. Each produces recorded evidence in the plan
SUMMARY, Phase-33 style.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Timeline SQL plan is `Merge Append` over index scans, <5 ms warm | NOTE-02 | DB is mocked in vitest | `docker compose exec -T postgres psql -U pipelite -d pipelite -c "EXPLAIN (ANALYZE, BUFFERS) …"` on the hostile deal |
| Migration inserts the correct count per entity type | NOTE-03 | Data migration against live data | `scripts/reconcile-notes.sql` part 1 — delta must be 0 |
| Migrated content is byte-identical to the legacy value | NOTE-03 / SC-4 | Byte comparison across two tables | `scripts/reconcile-notes.sql` part 2 — mismatched must be 0 |
| Re-running the migration inserts 0 rows (idempotency) | NOTE-03 | Requires applying migration twice | Re-run the `INSERT … SELECT` block, expect `INSERT 0 0` |
| A migrated note is the oldest entry on its record's timeline | NOTE-03 / SC-3 | Visual ordering | Open any organization with legacy notes at `http://localhost:3001` |
| Stage drag → timeline entry, end to end | NOTE-02 / SC-2 | Crosses bus, subscriber, DB, and RSC render | Drag a deal between stages in Docker; the timeline must show the entry |
| Add / edit / delete a note, and Load more | NOTE-01 / SC-1 | Client interactivity | Browser at `http://localhost:3001`, on all four entity types |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
