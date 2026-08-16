---
phase: 36
slug: audit-log
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-16
---

# Phase 36 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `36-RESEARCH.md` § Validation Architecture — measured in the container against the
> live-scale database, not assumed. That section is the authority; this file is the working copy the
> planner maps onto task IDs.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.0.18, two projects |
| **Config** | `vitest.config.ts` (node, `src/**/*.{test,spec}.*`, excludes `*.rsc.test.*`) + `vitest.rsc.config.ts` (`react-server`, only `src/**/*.rsc.test.*`) |
| **Quick run** | `npx vitest run <path>` |
| **Full suite** | `npm test` (both projects) |
| **Type gate** | `npm run typecheck` |
| **Lint gate** | `npm run lint` |
| **CI** | `.github/workflows/ci.yml` — required check on master |
| **Baseline at phase start** | 1128 passed / 4 skipped + 8 RSC |

### Three constraints that shape every choice below

1. **The suite mocks `@/db` entirely.** There is no live-database harness. Every module this phase
   adds that touches the database (`subscribers/audit.ts`, `prune.ts`, `settings.ts`, the audit
   `hydrate`) is testable only against a mocked driver. **This is why `src/lib/audit/diff.ts` must
   be pure and must hold all the logic** — it is the only part that can be tested properly.
2. **`assemble.test.ts` goes red the moment the source array grows.** Eight assertions hard-code
   branch counts, and the one at `:232` ("no `UNION ALL` for organization, person and activity") is
   falsified *in kind* because the audit source applies to all four entity types. Updating them is a
   planned task, not collateral damage.
3. **`timeline-entry.tsx` fails `tsc` the moment `'audit'` joins `TimelineEntryKind`.** That is
   Phase 35's exhaustive `never` gate working exactly as designed. Do not defeat it.

---

## Sampling Rate

- **Per task commit:** `npx vitest run <the touched test file>` + `npm run typecheck`
- **Per wave merge:** `npm test` (both projects) + `npm run lint`
- **After the migration task:** run `scripts/audit-log-checks.sql` in the container and paste the
  index list and both `EXPLAIN` plans into the plan file — vitest cannot cover it
- **Max feedback latency:** ~50 s (full suite); <5 s (single file)

---

## Per-Task Verification Map

Task IDs are assigned by the planner, which MUST carry each `Automated Command` verbatim into that
task's `<verify><automated>` block.

| Task ID | Req | Behavior | Type | Automated Command | Exists |
|---------|-----|----------|------|-------------------|--------|
| TBD | AUDIT-01 | `buildChanges` diffs native columns, yielding `{from,to}` per changed key | unit (pure) | `npx vitest run src/lib/audit/diff.test.ts` | ❌ W0 |
| TBD | AUDIT-01 | A formula-wrapped value on **either** side is excluded | unit (pure) | `npx vitest run src/lib/audit/diff.test.ts -t "formula"` | ❌ W0 |
| TBD | AUDIT-01 | A `multi_select` array is NOT mistaken for a formula wrapper (`!Array.isArray` guard) | unit (pure) | `npx vitest run src/lib/audit/diff.test.ts -t "multi_select"` | ❌ W0 |
| TBD | AUDIT-01 | `normaliseEventData` maps serializer keys back to column names; snake_case `data` vs camelCase `previous` yields a **one-key** diff | unit (pure) | `npx vitest run src/lib/audit/diff.test.ts -t "normalise"` | ❌ W0 |
| TBD | AUDIT-01 | Create records initial state; delete records a tombstone built from `previous` (because `data` is `{id}`) | unit (pure) | `npx vitest run src/lib/audit/diff.test.ts -t "create\|delete"` | ❌ W0 |
| TBD | AUDIT-01 | An update whose diff is empty writes **no** row | unit | `npx vitest run src/lib/events/subscribers/audit.test.ts -t "no-op"` | ❌ W0 |
| TBD | AUDIT-02 | Subscriber registers once; double register is a no-op; `_resetForTesting` clears | unit | `npx vitest run src/lib/events/subscribers/audit.test.ts` | ❌ W0 |
| TBD | AUDIT-02 | Handler is NOT async and the insert carries `.catch` — a rejected insert is not an unhandled rejection | unit | `npx vitest run src/lib/events/subscribers/audit.test.ts -t "fire-and-forget"` | ❌ W0 |
| TBD | AUDIT-02 | The subscriber does NOT listen to `deal.stage_changed` — doing so would double-write | unit | `npx vitest run src/lib/events/subscribers/audit.test.ts -t "stage_changed"` | ❌ W0 |
| TBD | AUDIT-02 | Actor kind resolves from ALS across awaits; absent context ⇒ `system`, **never** `payload.userId` | unit | `npx vitest run src/lib/audit/actor-context.test.ts` | ❌ W0 |
| TBD | AUDIT-02 | Two concurrent `runWithActor` scopes do not cross-contaminate | unit | `npx vitest run src/lib/audit/actor-context.test.ts -t "concurrent"` | ❌ W0 |
| TBD | AUDIT-02 | `withApiAuth` establishes the `api_key` actor around the handler | unit | `npx vitest run src/lib/api/auth.test.ts` | ❌ W0 (no file today) |
| TBD | AUDIT-02 | `executeRun` establishes the `workflow_run` actor with the run id | unit | `npx vitest run src/lib/execution/engine.test.ts -t "actor"` | ✅ add cases |
| TBD | AUDIT-02 | **SC-5 gate:** no `src/lib/mutations/*.ts` imports from `src/lib/audit/` or the audit schema | unit (source gate) | `npx vitest run src/lib/audit/no-mutation-coupling.test.ts` | ❌ W0 |
| TBD | AUDIT-03 | Assembler emits **4** branches for a deal, **2** for the other three types | unit (SQL string) | `npx vitest run src/lib/timeline/assemble.test.ts` | ✅ **8 assertions to update** |
| TBD | AUDIT-03 | The audit branch carries the keyset predicate and no `deleted_at` filter | unit | `npx vitest run src/lib/timeline/assemble.test.ts -t "audit"` | ✅ add case |
| TBD | AUDIT-03 | `TimelineEntryRow` renders an audit entry; the `never` branch still compiles | typecheck | `npm run typecheck` | ✅ gate exists |
| TBD | AUDIT-03 | Run detail page lists the distinct records a run mutated | unit | `npx vitest run src/lib/audit/linked-records.test.ts` | ❌ W0 |
| TBD | AUDIT-04 | Retention read: unset / non-numeric / ≤0 ⇒ `null`; a valid integer ⇒ that integer | unit | `npx vitest run src/lib/audit/settings.test.ts` | ❌ W0 |
| TBD | AUDIT-04 | Pruner deletes nothing when retention is `null` (fails closed) | unit | `npx vitest run src/lib/audit/prune.test.ts -t "fails closed"` | ❌ W0 |
| TBD | AUDIT-04 | Pruner caps at `MAX_BATCHES_PER_TICK`, logs the count, and **always reschedules** even after a throw | unit (fake timers) | `npx vitest run src/lib/audit/prune.test.ts` | ❌ W0 |
| TBD | AUDIT-04 | Delete uses the `ctid IN (… LIMIT n)` form, not `id IN` | unit (SQL string) | `npx vitest run src/lib/audit/prune.test.ts -t "ctid"` | ❌ W0 |
| TBD | cross | All new `audit.*` keys exist in all three locale files | unit | `npx vitest run src/messages/locale-parity.test.ts` | ✅ extend key list |
| TBD | cross | No React element crosses the RSC boundary into a Radix `asChild` slot | unit (repo-wide gate) | `npx vitest run "src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx"` | ✅ must stay green |

---

## Wave 0 Requirements

- [ ] `src/lib/audit/diff.test.ts` — the pure diff, formula exclusion, key normalisation (AUDIT-01)
- [ ] `src/lib/audit/actor-context.test.ts` — ALS across awaits, concurrency, absence (AUDIT-02)
- [ ] `src/lib/events/subscribers/audit.test.ts` — mirrors `stage-history.test.ts` (AUDIT-02)
- [ ] `src/lib/audit/no-mutation-coupling.test.ts` — the SC-5 source gate
- [ ] `src/lib/audit/settings.test.ts` — retention parse, fail-closed (AUDIT-04)
- [ ] `src/lib/audit/prune.test.ts` — batching, cap, reschedule-on-throw, `ctid` form (AUDIT-04)
- [ ] `src/lib/audit/linked-records.test.ts` — run → records (AUDIT-03)
- [ ] `src/lib/api/auth.test.ts` — **no test file exists for `withApiAuth` today** and this phase
      edits it. Add the test BEFORE the edit.
- [ ] `scripts/audit-log-checks.sql` — checked-in, re-runnable psql evidence (indexes + prune plan)
- [ ] `src/lib/timeline/assemble.test.ts` — **update 8 existing assertions** (not a new file)
- [ ] `src/messages/locale-parity.test.ts` — extend the required-keys list with the `audit.*` keys
- [ ] Framework install: **none needed**

---

## Manual-Only Verifications

The `@/db` mock puts these out of vitest's reach. Each produces recorded evidence in the SUMMARY,
following the Phase 33/35 precedent.

| Behavior | Req | Why Manual | Instructions |
|----------|-----|-----------|--------------|
| All four indexes present after migrate | AUDIT-04 | catalog assertion | `scripts/audit-log-checks.sql` part 1 |
| Batch delete at scale uses `Bitmap Index Scan on audit_log_created_at_idx`, ~18 ms | AUDIT-04 | needs real rows | `scripts/audit-log-checks.sql` part 3 |
| Merged timeline plan is `Merge Append` over 4 index scans, <1 ms warm | AUDIT-03 | DB is mocked | `EXPLAIN (ANALYZE, BUFFERS)` in the container |
| Edit a deal in the browser → entry shows field, before/after, and the user's name | AUDIT-01/03 | crosses bus, ALS, DB, render | Docker at `http://localhost:3001` — **mandatory** |
| Workflow CRM action → entry attributes the run AND the run page lists the record | AUDIT-03 / SC-2 | crosses the execution engine | Run a workflow with a CRM action |
| `PUT /api/v1/people/:id` with a real API key → actor kind `api_key` and a **one-field** change map | AUDIT-01 | this is the snake_case-payload regression test | Real API key against the running container |
| Retention set to 1 day in `/admin`, count/oldest display correct, `[audit-prune]` log line observed | AUDIT-04 | crosses settings, pruner, UI | `/admin` in Docker |
| Custom-field-only save now fires webhooks and workflow triggers | (addendum) | **deliberate behaviour change** | Confirm and record it — existing workflows may react to saves they never previously saw |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
