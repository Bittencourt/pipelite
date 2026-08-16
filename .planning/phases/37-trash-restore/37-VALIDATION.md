---
phase: 37
slug: trash-restore
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-16
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

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| trash-list | TBD | 1 | TRASH-01 | T-37-AC1 | Owner-or-admin predicate applied **in the query**, never after | unit (SQL compiled via `PgDialect`, as `prune.test.ts:52`) | `npx vitest run src/lib/trash/queries.test.ts` | ❌ W0 | ⬜ pending |
| deleted-by-batch | TBD | 1 | TRASH-01 | — | N+1 avoided: one query per page of ids | unit — assert the db fn called exactly once | `npx vitest run src/lib/trash/queries.test.ts` | ❌ W0 | ⬜ pending |
| actor-presentation | TBD | 1 | TRASH-01 | T-37-REP2 | `notRecorded` (no audit row) and `unknownActor` (deleted user) never collapse | unit (pure presenter) | `npx vitest run src/lib/trash/present.test.ts` | ❌ W0 | ⬜ pending |
| entity-type-validation | TBD | 1 | TRASH-01 | T-37-TAM1 | `?type=` narrowed to the four literals **before** composing any predicate | unit | `npx vitest run src/lib/trash/queries.test.ts` | ❌ W0 | ⬜ pending |
| i18n-keys | TBD | 1 | TRASH-01 | — | 61 keys present, non-empty, translated, placeholders preserved, identical key set in all 3 locales | unit | `npx vitest run src/messages/locale-parity.test.ts` | ✅ extend with `REQUIRED_TRASH_KEYS` | ⬜ pending |
| restore-mutation | TBD | 2 | TRASH-02 | — | `SET deleted_at = NULL` and nothing else; existence check uses `isNotNull` | unit | `npx vitest run src/lib/mutations/deals.test.ts` | ✅ extend | ⬜ pending |
| restore-recalc | TBD | 2 | TRASH-02 | — | `recalculateFormulas` called with `changedFields` containing the sentinel **and** every `ENTITY_NATIVE_ATTRIBUTES` entry (Pitfall 1 — otherwise it silently no-ops) | unit — assert on the argument, not the call | `npx vitest run src/lib/mutations/deals.test.ts` | ✅ extend | ⬜ pending |
| restore-not-in-trash | TBD | 2 | TRASH-02 | — | A record not in trash returns the discriminated `NOT_IN_TRASH` code | unit | `npx vitest run src/lib/mutations/deals.test.ts` | ✅ extend | ⬜ pending |
| restore-with-linked | TBD | 2 | TRASH-02 | T-37-AC1 | Restores the child and every trashed parent, reports the count, re-checks authorization per record | unit | `npx vitest run src/app/trash/actions.test.ts` | ❌ W0 | ⬜ pending |
| purge-teardown-order | TBD | 3 | TRASH-03 | T-37-REP1 | Ordered teardown inside ONE transaction: notes → join/history → **detach child FKs** → row → audit | unit — mocked `db.transaction`, assert call order | `npx vitest run src/lib/mutations/deals.test.ts` | ✅ extend | ⬜ pending |
| purge-detach-audit | TBD | 3 | TRASH-03 | T-37-REP1 | Every detached child is recorded, so an unlinked activity traces back to the purged deal | unit | `npx vitest run src/lib/mutations/deals.test.ts` | ✅ extend | ⬜ pending |
| purge-authz | TBD | 3 | TRASH-03 | T-37-EOP1 | Non-admin purge rejected by the **server action**, not merely hidden in the client | unit | `npx vitest run src/app/trash/actions.test.ts` | ❌ W0 | ⬜ pending |
| prune-fail-closed | TBD | 3 | TRASH-03 | T-37-TAM2 | `null` retention purges nothing — asserted by the **absence** of any db call, with no `?? 30` fallback anywhere | unit (fake timers) | `npx vitest run src/lib/trash/prune.test.ts` | ❌ W0 | ⬜ pending |
| prune-reschedules | TBD | 3 | TRASH-03 | — | Always reschedules, even after a thrown tick (a pruner that stops is a silently disabled policy) | unit (fake timers) | `npx vitest run src/lib/trash/prune.test.ts` | ❌ W0 | ⬜ pending |
| prune-batch-cap | TBD | 3 | TRASH-03 | T-37-DOS1 | Capped at `MAX_BATCHES_PER_TICK`; shortfall logged so starvation is visible | unit | `npx vitest run src/lib/trash/prune.test.ts` | ❌ W0 | ⬜ pending |
| retention-bounds | TBD | 3 | TRASH-03 | T-37-TAM2 | `RETENTION_MIN = 1` validated before write **and** again on read | unit | `npx vitest run src/lib/trash/settings.test.ts` | ❌ W0 | ⬜ pending |
| fk-teardown-real-db | TBD | 3 | TRASH-03 | T-37-REP1 | A purge leaves no dangling `notes`, no orphaned `deal_assignees`/`deal_stage_history`, and every detached FK is null — against real constraints | **SQL assertion script** | `docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f -' < scripts/trash-checks.sql` | ❌ W0 | ⬜ pending |
| pruner-starts-in-docker | TBD | 4 | TRASH-03 | T-37-DEPLOY | The pruner actually runs in the container — `Dockerfile:24` ends in `\|\| true`, and this exact class of failure silently killed all four processors on 2026-08-08 | **behavioural gate** | `docker compose logs app \| grep -F '[trash-prune] Starting'` | ❌ W0 | ⬜ pending |
| rsc-boundary | TBD | 4 | TRASH-01 | — | No server module hands children to a Radix `asChild` component (CFUI-01, Phase 44) | unit (repo-wide scan) | `npx vitest run --config vitest.rsc.config.ts` | ✅ exists — passes if the client split is correct | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs are placeholders until plans are written; the planner must bind each row to a real task ID.*

---

## Wave 0 Requirements

- [ ] `src/lib/trash/queries.test.ts` — TRASH-01 list/count/deleted-by shape, entity-type validation
- [ ] `src/lib/trash/settings.test.ts` — TRASH-03 fail-closed read, validated write (mirror of `src/lib/audit/settings.test.ts`)
- [ ] `src/lib/trash/prune.test.ts` — TRASH-03 fail-closed, capped, always-reschedules (mirror of `src/lib/audit/prune.test.ts`; **the only fake-timer precedent in the repo**)
- [ ] `src/lib/trash/present.test.ts` — TRASH-01 actor presentation, `notRecorded` vs `unknownActor`
- [ ] `src/app/trash/actions.test.ts` — authorization gates on restore / restoreWithLinked / purge
- [ ] `scripts/trash-checks.sql` — FK, teardown-order, detach, and dangling-row assertions against a real database
- [ ] Extend `src/messages/locale-parity.test.ts` with `REQUIRED_TRASH_KEYS` (61 keys) — the UI-SPEC states this is phase work, not a nice-to-have
- [ ] Extend `src/lib/mutations/{deals,people,organizations,activities}.test.ts` with restore + purge blocks

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

## Validation Sign-Off

- [ ] All tasks have an `<automated>` verify or a declared Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all ❌ references in the map above
- [ ] No watch-mode flags (`vitest run`, never bare `vitest`)
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
