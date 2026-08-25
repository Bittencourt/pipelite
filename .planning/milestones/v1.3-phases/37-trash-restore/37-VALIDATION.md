---
phase: 37
slug: trash-restore
status: executed
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-16
bound: 2026-08-16
bound_by: 37-15 Task 2
---

# Phase 37 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `37-RESEARCH.md` § Validation Architecture (HIGH confidence, codebase-verified).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.0.18 — **two projects** |
| **Config file** | `vitest.config.ts` (base, `environment: 'node'`, excludes `*.rsc.test.*`) and `vitest.rsc.config.ts` (`include: src/**/*.rsc.test.*`, `ssr.resolve.conditions: ['react-server', …]`) |
| **Quick run command** | `npx vitest run <touched test files>` |
| **Full suite command** | `npm test` → `vitest run && vitest run --config vitest.rsc.config.ts` |
| **Estimated runtime** | ~60 seconds full suite (461 passed / 4 skipped at Phase 33 baseline) |
| **Additional gates** | `npm run typecheck` (`tsc --noEmit`), `npm run lint` (eslint, 0 errors) — both required by the `ci` check on `master` |

**Harness constraints (do not violate):**

- **Every test mocks `@/db` wholesale.** `vi.mock("@/db", () => ({ db: { query: {…}, insert, update, delete, select } }))` is the universal opening of `src/lib/mutations/*.test.ts`. `prune.test.ts` deliberately narrows to a single `execute` so that any query the implementation grows surfaces as a TypeError rather than being absorbed by a permissive mock — copy that posture for the trash pruner.
- **There is no integration-test harness, and this phase must not build one.** Database-level facts (FK behaviour, teardown ordering, dangling rows) belong in a checked-in SQL assertion script following `scripts/audit-log-checks.sql` (Phase 36) and `scripts/reconcile-notes.sql` (Phase 35).
- **Client components are not rendered in tests.** Rendering a `'use client'` component needs jsdom plus a testing library, which this phase must not install (STATE.md, Phase 44). Client wiring is gated by comment-stripped **source reads**; behaviour is unit-tested in the pure helpers.
- **`npx vitest` works on the host. `npx drizzle-kit` does NOT** — `npx` resolves to `npm run` here. Use `./node_modules/.bin/drizzle-kit` on the host, or `npx` inside the container.

---

## Sampling Rate

- **After every task commit:** `npx vitest run <the touched test file(s)>` + `npm run typecheck`
- **After every plan wave:** `npm test` (both projects) + `npm run lint`
- **Before `/gsd:verify-work`:** `npm test` green, `npm run typecheck` clean, `npm run lint` 0 errors, `scripts/trash-checks.sql` all-pass against the container, and `docker compose logs app | grep -F '[trash-prune] Starting'` matching after `docker compose up -d --build`
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Bound to real plans and tasks by **37-15 Task 2** on 2026-08-16. Every command below was re-run at
that point; the counts in the Status column are the numbers actually observed, not estimates.

| Task ID | Plan / Task | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|-------------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| trash-list | **37-07 T2** | 2 | TRASH-01 | T-37-AC1 | Owner-or-admin predicate applied **in the query**, never after | unit (SQL compiled via `PgDialect`, as `prune.test.ts:52`) | `npx vitest run src/lib/trash/queries.test.ts` | ✅ created by 37-07 T1 | ✅ green — 49 passed |
| deleted-by-batch | **37-07 T1** | 2 | TRASH-01 | — | N+1 avoided: one query per page of ids | unit — assert the db fn called exactly once | `npx vitest run src/lib/trash/queries.test.ts` | ✅ | ✅ green — 49 passed |
| actor-presentation | **37-02 T2** | 1 | TRASH-01 | T-37-REP2 | `notRecorded` (no audit row) and `unknownActor` (deleted user) never collapse | unit (pure presenter) | `npx vitest run src/lib/trash/present.test.ts` | ✅ | ✅ green — 23 passed |
| entity-type-validation | **37-02 T1** | 1 | TRASH-01 | T-37-TAM1 | `?type=` narrowed to the four literals **before** composing any predicate | unit | `npx vitest run src/lib/trash/entity-types.test.ts` **(rebound — see note 1)** | ✅ | ✅ green — 77 passed |
| i18n-keys | **37-03 T2** | 1 | TRASH-01 | — | 61 keys present, non-empty, translated, placeholders preserved, identical key set in all 3 locales | unit | `npx vitest run src/messages/locale-parity.test.ts` | ✅ extended with `REQUIRED_TRASH_KEYS` | ✅ green — 6 passed |
| restore-mutation | **37-04 T1** (deal, activity) + **37-05 T1** (person, org) | 1 | TRASH-02 | — | `SET deleted_at = NULL` and nothing else; existence check uses `isNotNull` | unit | `npx vitest run src/lib/mutations/{deals,activities,people,organizations}.test.ts` | ✅ extended | ✅ green — 48/43/43/46 passed |
| restore-recalc | **37-04 T1** + **37-05 T1** | 1 | TRASH-02 | — | `recalculateFormulas` called with `changedFields` containing the sentinel **and** every `ENTITY_NATIVE_ATTRIBUTES` entry (Pitfall 1 — otherwise it silently no-ops) | unit — assert on the argument, not the call | `npx vitest run src/lib/mutations/deals.test.ts` | ✅ extended | ✅ green — 48 passed |
| restore-not-in-trash | **37-04 T1** + **37-05 T1** | 1 | TRASH-02 | — | A record not in trash returns the discriminated `NOT_IN_TRASH` code | unit | `npx vitest run src/lib/mutations/deals.test.ts` | ✅ extended | ✅ green — 48 passed |
| restore-with-linked | **37-10 T2** (on **37-10 T1**'s `findTrashedParents`) | 3 | TRASH-02 | T-37-AC1 | Restores the child and every trashed parent, reports the count, re-checks authorization per record | unit | `npx vitest run src/app/trash/actions.test.ts` | ✅ created by 37-10 | ✅ green — 28 passed |
| purge-teardown-order | **37-04 T2** (deal, activity) + **37-05 T2** (person, org) | 1 | TRASH-03 | T-37-REP1 | Ordered teardown inside ONE transaction: notes → join/history → **detach child FKs** → row → audit | unit — mocked `db.transaction`, assert call order | `npx vitest run src/lib/mutations/{deals,activities,people,organizations}.test.ts` | ✅ extended | ✅ green — 180 passed across the four |
| purge-detach-audit | **37-04 T2** + **37-05 T2** | 1 | TRASH-03 | T-37-REP1 | Every detached child is recorded, so an unlinked activity traces back to the purged deal | unit | `npx vitest run src/lib/mutations/deals.test.ts` | ✅ extended | ✅ green — 48 passed |
| purge-authz | **37-10 T2** | 3 | TRASH-03 | T-37-EOP1 | Non-admin purge rejected by the **server action**, not merely hidden in the client | unit | `npx vitest run src/app/trash/actions.test.ts` | ✅ | ✅ green — 28 passed |
| prune-fail-closed | **37-11 T1** | 3 | TRASH-03 | T-37-TAM2 | `null` retention purges nothing — asserted by the **absence** of any db call, with no `?? 30` fallback anywhere | unit (fake timers) | `npx vitest run src/lib/trash/prune.test.ts` | ✅ | ✅ green — 21 passed; also observed live in the container with the setting forced to `0` (37-11) |
| prune-reschedules | **37-11 T1** | 3 | TRASH-03 | — | Always reschedules, even after a thrown tick (a pruner that stops is a silently disabled policy) | unit (fake timers) | `npx vitest run src/lib/trash/prune.test.ts` | ✅ | ✅ green — 21 passed |
| prune-batch-cap | **37-11 T1** | 3 | TRASH-03 | T-37-DOS1 | Capped at `MAX_BATCHES_PER_TICK`; shortfall logged so starvation is visible | unit | `npx vitest run src/lib/trash/prune.test.ts` | ✅ | ✅ green — 21 passed (incl. the added no-progress break) |
| retention-bounds | **37-01 T1** | 1 | TRASH-03 | T-37-TAM2 | `RETENTION_MIN = 1` validated before write **and** again on read | unit | `npx vitest run src/lib/trash/settings.test.ts` | ✅ | ✅ green — 28 passed |
| fk-teardown-real-db | **37-15 T1** | 6 | TRASH-03 | T-37-REP1, T-37-16, T-37-36 | A purge leaves no dangling `notes`, no orphaned `deal_assignees`/`deal_stage_history`, and every detached FK is null — against real constraints | **SQL assertion script** | `docker exec -i pipelite-postgres-1 psql -U pipelite -d pipelite -f - < scripts/trash-checks.sql` | ✅ created by 37-15 T1 | ✅ green — 20 PASS / 0 FAIL, run three times, row-count delta 0 |
| pruner-starts-in-docker | **37-11 T3** | 3 | TRASH-03 | T-37-DEPLOY, T-37-11 | The pruner actually runs in the container — `Dockerfile:24` ends in `\|\| true`, and this exact class of failure silently killed all four processors on 2026-08-08 | **behavioural gate** | `docker compose logs app \| grep -F '[trash-prune] Starting'` | ✅ | ✅ green — matched again in 37-15 T2 against the post-merge image, with all five pre-existing processors present |
| rsc-boundary | **none — pre-existing** | — | TRASH-01 | — | No server module hands children to a Radix `asChild` component (CFUI-01, Phase 44) | unit (repo-wide scan) | `npx vitest run src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx` **(base project — see note 2)** | ✅ pre-existing | ✅ green — 14 passed |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Rebinding notes

1. **`entity-type-validation` moved from `queries.test.ts` to `entity-types.test.ts`.** The map
   assumed the `?type=` narrowing would live beside the query layer. 37-02 put it in
   `src/lib/trash/entity-types.ts` instead — a database-free module — so that client components,
   the server page, the REST routes and `instrumentation.ts` can all import the same allow-list
   without dragging `@/db` into their graphs. The row is satisfied by
   `src/lib/trash/entity-types.test.ts` (77 tests), not by `queries.test.ts`.

2. **`rsc-boundary` needed no new file, and its command in the original map was wrong.** The
   repo-wide scan is `src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx`, whose
   filename has no `.rsc.` infix — so it belongs to the **base** vitest project and is NOT picked up
   by `--config vitest.rsc.config.ts` (that project's `include` is `src/**/*.rsc.test.*`, and it
   holds two different files, 8 tests). The row passes automatically when the client split is
   correct, which it is; the command above is the corrected one. `npm test` runs both projects and
   so covers it either way.

### Coverage gaps — recorded, not papered over

These are real verification obligations that this phase did **not** discharge. They are listed here
so the next reader meets them instead of inferring coverage from the all-green table above.

| Gap | Requirement | Why it is open | What would close it |
|-----|-------------|----------------|---------------------|
| **The three `/api/v1/trash` routes have no checked-in test** | TRASH-01, TRASH-02, TRASH-03 | 37-12 proved all three live in 20 request/response checks against the real database, but the probe that ran them was a throwaway and was deleted before its commits. Nothing re-runs those assertions today, so a regression in the admin-gate ordering or the owner scope would ship silently. 37-12's own summary records this. | **Feasible without a database, and the precedent already exists**: `src/app/api/v1/audit/__tests__/route.test.ts` mocks `@/db`, bypasses `withApiAuth` and stubs `resolveActorRole`. The two orderings that are security properties — the admin gate ahead of `findTrashedRecord`, and the scope reaching the query rather than a post-filter — can both be pinned that way. Out of scope for 37-15, whose `files_modified` is `scripts/trash-checks.sql` alone. |
| **No non-admin viewer has been exercised in a browser** | TRASH-03 | The dev database holds exactly ONE live user and they are the admin; the other six `member` rows are all soft-deleted. The member half of UAT step 6 — Trash present in the user menu, only owned records listed, and **no purge control rendered on any row** — therefore cannot be observed without first creating a member login. | Create an approved, non-soft-deleted `member` user with a working credential, sign in as them, and record step 6. The server-side half of the same gate IS covered (`purge-authz`, 37-10 T2, and 37-12's live member-key 403s); what is unproven is that the control is *hidden* in the client rather than merely refused by the server. |
| **The nine-step cross-surface UAT (37-15 Task 3)** | TRASH-01, TRASH-02, TRASH-03 | Requires a human at a browser. Client components are not rendered in this repo's test harness (no jsdom, no testing library — Phase 44). | Walk `37-15-PLAN.md` Task 3's nine numbered steps against http://localhost:3001 and record each outcome. |

---

## Wave 0 Requirements

- [x] `src/lib/trash/queries.test.ts` — TRASH-01 list/count/deleted-by shape *(37-07; 49 tests. The entity-type validation half landed in `entity-types.test.ts` instead — rebinding note 1)*
- [x] `src/lib/trash/settings.test.ts` — TRASH-03 fail-closed read, validated write *(37-01; 28 tests)*
- [x] `src/lib/trash/prune.test.ts` — TRASH-03 fail-closed, capped, always-reschedules *(37-11; 21 tests)*
- [x] `src/lib/trash/present.test.ts` — TRASH-01 actor presentation, `notRecorded` vs `unknownActor` *(37-02; 23 tests)*
- [x] `src/app/trash/actions.test.ts` — authorization gates on restore / restoreWithLinked / purge *(37-10; 28 tests)*
- [x] `scripts/trash-checks.sql` — FK, teardown-order, detach, and dangling-row assertions against a real database *(37-15 T1; 20 PASS / 0 FAIL)*
- [x] Extend `src/messages/locale-parity.test.ts` with `REQUIRED_TRASH_KEYS` (61 keys) *(37-03; 58 `trash.` keys pinned, 6 tests)*
- [x] Extend `src/lib/mutations/{deals,people,organizations,activities}.test.ts` with restore + purge blocks *(37-04, 37-05; 48/43/43/46 tests)*

Two files were added beyond the Wave 0 list and are counted in the totals above:
`src/lib/trash/entity-types.test.ts` (37-02, 77 tests) and `src/lib/trash/dispatch.test.ts`
(37-06, 16 tests), plus `src/app/trash/__tests__/trash-client-wiring.test.ts` (37-13, 19 tests) for
the comment-stripped client source reads.

**Framework install: none needed** — vitest is configured and green across both projects.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Trash tabs render, switch via `?type=`, and show per-entity empty states | TRASH-01 | Client components are not rendered in tests (no jsdom/testing-library, and this phase must not install them). Behaviour is unit-tested in the pure helpers; only the assembled page is manual | `docker compose up -d`, open http://localhost:3001/trash, switch all four tabs, confirm counts match the rows shown and each empty state names its entity |
| Restore returns the record to its live list with children intact | TRASH-02 | End-to-end across a soft delete, a restore, and four separate list surfaces | Delete a deal that has activities → confirm it leaves the deals list and appears in `/trash` → restore → confirm it is back in the list, its activities still linked, and any formula field shows a recalculated (not stale) value |
| Purge removes the record everywhere and detaches, not destroys, its children | TRASH-03 | Requires observing several surfaces plus the child rows after the fact | As admin, purge a trashed deal that had activities → confirm it is gone from `/trash`, lists, search, and export → confirm its activities still exist with `deal_id` null → confirm the purge and each detach appear in the audit log |
| A non-admin cannot see or reach the purge control | TRASH-03 | The server-side gate is unit-tested; this confirms the control is *hidden*, not merely disabled | Sign in as a `member`, open `/trash`, confirm no purge control renders on any row |
| Retention shortening is confirmed before it destroys anything | TRASH-03 | AlertDialog interaction | Open the retention form as admin, lower the window, confirm the dialog appears with "Keep current window" / "Shorten retention window" and that cancelling changes nothing |

---

**Status of the five manual-only rows, as of 37-15 Task 2:** all five remain **⬜ pending**. They are
the subject of 37-15 Task 3, a blocking `checkpoint:human-verify` that had not been walked when this
document was bound. The fourth row (a non-admin cannot see or reach the purge control) additionally
requires a member login to be created first — see Coverage Gaps.

---

## Validation Sign-Off

- [x] All tasks have an `<automated>` verify or a declared Wave 0 dependency
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all ❌ references in the map above — every one is now ✅
- [x] No watch-mode flags (`vitest run`, never bare `vitest`)
- [x] Feedback latency < 60s — full base project 38.2s, rsc project 0.7s
- [x] `nyquist_compliant: true` set in frontmatter

**These six items are about the SHAPE of this document, not about total coverage.** They are all met,
and the three entries under Coverage Gaps are still open. Read both.

**Approval:** automated rows signed off by 37-15 Task 2 (2026-08-16). Manual rows pending 37-15 Task 3.

---

## Phase Gate Run — 37-15 Task 2, 2026-08-16

| Gate | Required | Observed |
|------|----------|----------|
| `npx vitest run` (base project) | > 461 total, ≤ 4 skipped | **1686 total: 1682 passed / 4 skipped** on a clean run; a second run showed 1681 passed / 1 failed / 4 skipped — the documented `condition-evaluator.test.ts` T-34-20 wall-clock flake, 70/70 in isolation. Not a Phase 37 file |
| `npx vitest run --config vitest.rsc.config.ts` | green | **8 passed** (2 files) |
| `npm run typecheck` | exit 0 | **exit 0** |
| `npm run lint` | 0 errors | **0 errors, 125 warnings** — baseline unchanged |
| `docker compose logs app \| grep -F '[trash-prune] Starting'` | must match | **matched**, plus all five pre-existing processor start lines |
| `scripts/trash-checks.sql` | all-pass | **20 PASS / 0 FAIL**, three consecutive runs, CRM row-count delta 0 |
