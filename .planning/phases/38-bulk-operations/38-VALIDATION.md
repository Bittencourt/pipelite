---
phase: 38
slug: bulk-operations
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-17
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `38-RESEARCH.md` § Validation Architecture — that section is the authority; this file
> is the execution-facing contract.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.0.18, two projects |
| **Config file** | `vitest.config.ts` (base, `environment: 'node'`) and `vitest.rsc.config.ts` (`react-server` condition, `src/**/*.rsc.test.*`) |
| **Quick run command** | `./node_modules/.bin/vitest run <path>` |
| **Full suite command** | `npm test` (= `vitest run && vitest run --config vitest.rsc.config.ts`) |
| **Estimated runtime** | ~90 seconds full suite; <5s per touched file |

**Hard constraints:**
- **No DOM environment exists** — no jsdom, no happy-dom, no `@testing-library/*`, and none may be
  added (Phase 44 precedent). Every interaction behaviour is therefore either a pure-unit assertion,
  a comment-stripped source gate, or a browser UAT item. There is no third option.
- Importing any `src/lib/mutations/*` module without `vi.mock("@/db", …)` throws
  `DATABASE_URL environment variable is not set`.
- Host `npx drizzle-kit` fails (`npx` resolves to `npm run` here) — use
  `./node_modules/.bin/drizzle-kit`, or run inside the container.

---

## Sampling Rate

- **After every task commit:** `./node_modules/.bin/vitest run <the touched test file>` + `npm run typecheck`
- **After every plan wave:** `npm test` + `npm run typecheck` + `npm run lint`
- **Before `/gsd:verify-work`:** full suite green (≥1703 + new), 0 typecheck errors, 0 lint errors,
  zero new `@ts-expect-error`
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

> **Plan/Wave columns below are authoritative as of the approved 20-plan breakdown** (plan-checker
> WARNING resolved 2026-08-17). Where an earlier draft of this file guessed a wave or a path, the
> plan files win.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| locale parity | 38-01 | 1 | BULK-01..04 | — | N/A | unit | `./node_modules/.bin/vitest run src/messages/locale-parity.test.ts` | ✅ extend | ⬜ pending |
| owner mutation (org, person) | 38-02 | 1 | BULK-03 | — | Writes `ownerId`; emits full post-write row + pre-read `previous`; `changedFields:["ownerId"]` | unit (tdd) | `./node_modules/.bin/vitest run src/lib/mutations/organizations.test.ts src/lib/mutations/people.test.ts` | ✅ extend | ⬜ pending |
| same-owner no-op | 38-02 | 1 | BULK-03 | — | Short-circuits: no UPDATE, no emit | unit | same | ✅ extend | ⬜ pending |
| **buildChanges gate** | 38-02 | 1 | BULK-03 | Repudiation | `ownerId` appears in `buildChanges` for the new emit shape (proves the audit row lands) | unit (pure) | `./node_modules/.bin/vitest run src/lib/audit/diff.test.ts` | ✅ extend | ⬜ pending |
| owner mutation (deal, activity) | 38-03 | 1 | BULK-03 | — | Same contract as above | unit (tdd) | `./node_modules/.bin/vitest run src/lib/mutations/deals.test.ts src/lib/mutations/activities.test.ts` | ✅ extend | ⬜ pending |
| **dealAssignees gate** | 38-03 | 1 | BULK-03 | Silent data destruction | `updateDealOwnerMutation` never calls `db.delete`; zero `dealAssignees` occurrences in the function slice | unit (regression) | `./node_modules/.bin/vitest run src/lib/mutations/deals.test.ts` | ✅ extend | ⬜ pending |
| export ids narrowing | 38-04 | 1 | BULK-04 | — | `ExportFilters.ids` narrows all four fetchers | unit | `./node_modules/.bin/vitest run src/lib/export/formatters.test.ts` | ✅ extend | ⬜ pending |
| export empty ids | 38-04 | 1 | BULK-04 | Admin-gate bypass | `ids: []` yields zero rows, never a full table | unit + live DB | same + `psql` count | ✅ extend | ⬜ pending |
| checkbox-indeterminate | 38-05 | 1 | BULK-01 | — | Minus branch renders; the 8 existing consumers pass no `indeterminate` | source gate | `./node_modules/.bin/vitest run src/components/ui/checkbox-indeterminate.test.ts` | ❌ new | ⬜ pending |
| bulk scaffolding | 38-06 | 2 | BULK-02, BULK-03 | Unbounded request | `BULK_MAX_IDS`; dispatch map asserts BOTH `satisfies` directions (TS2741 missing / TS2353 extra) | unit | `./node_modules/.bin/vitest run src/lib/bulk` | ❌ new | ⬜ pending |
| select-column | 38-07 | 2 | BULK-01 | — | `id:"select"`, `size:44`, `enableSorting:false`, `enableHiding:false` | unit (pure column def) | `./node_modules/.bin/vitest run src/components/bulk/__tests__/select-column.test.ts` | ❌ new | ⬜ pending |
| delete + reassign dialogs | 38-08 | 2 | BULK-02, BULK-03 | — | Count- and retention-aware copy; picker is vendored `select.tsx`, unfiltered | unit | `./node_modules/.bin/vitest run src/components/bulk` | ❌ new | ⬜ pending |
| failure report | 38-09 | 3 | BULK-02, BULK-03 | Error handling (V7) | Closed reason union rendered via `bulk.reason.*`; never a raw server string | unit | `./node_modules/.bin/vitest run src/components/bulk` | ❌ new | ⬜ pending |
| bar + CSV download + Trash deep link | 38-10 | 3 | BULK-02..04 | — | `z-[60]`; `{entity}-selected-{count}-{YYYY-MM-DD}.csv`; `ENTITY_TO_TRASH_TAB` deep link | unit | `./node_modules/.bin/vitest run src/components/bulk` | ❌ new | ⬜ pending |
| over-cap reject | 38-11..14 | 3 | BULK-02 | Unbounded request (DoS) | Rejected with count; **no mutation called** | unit | `./node_modules/.bin/vitest run src/app/organizations/bulk-actions.test.ts` (×4 entities) | ❌ new | ⬜ pending |
| unauth reject | 38-11..14 | 3 | BULK-02 | Actor spoofing (Repudiation) | `not_authenticated`; **no actor scope opened** | unit | same files | ❌ new | ⬜ pending |
| per-record authz | 38-11..14 | 3 | BULK-02 | Mass unauthorized mutation | `notPermitted`; mutation not called for that id | unit | same files | ❌ new | ⬜ pending |
| authz asymmetry | 38-11,12,14 vs 38-13 | 3 | BULK-02 | Access control (V4) | Deals admin-bypass PRESENT (38-13); org/person/activity admin still gets `notPermitted` (38-11/12/14) | unit (+3 negative proofs) | `src/app/{organizations,people,deals,activities}/bulk-actions.test.ts` | ❌ new | ⬜ pending |
| partial failure | 38-11..14 | 3 | BULK-02, BULK-03 | Error handling (V7) | `{succeeded:[9], failed:[3 + closed reason]}`; loop continues past a failure | unit | same files | ❌ new | ⬜ pending |
| single revalidate | 38-11..14 | 3 | BULK-02 | — | `revalidatePath` called exactly once, after the loop | unit (spy count) | same files | ❌ new | ⬜ pending |
| single runWithActor | 38-11..14 | 3 | BULK-02 | Repudiation | `runWithActor` wraps the loop once, not per record | unit (spy count === 1) | same files | ❌ new | ⬜ pending |
| target-user validation | 38-11..14 | 3 | BULK-03 | Reassign to inactive principal | Validated **once** before the loop, `deleted_at IS NULL AND status='approved'` | unit | same files | ❌ new | ⬜ pending |
| **export signature gate** | 38-04, 38-11..14 | 1, 3 | BULK-04 | Admin-gate bypass (Info Disclosure) | Action accepts **only** `ids` — bans `ExportFilters`/`ExportOptions`/`format`/`role` | source gate (`readStrippedSource`) | same files | ❌ new | ⬜ pending |
| surface wiring ×4 | 38-15..18 | 4 | BULK-01..04 | — | Column prepended not appended; empty-state `colSpan` counts it; bar after Load More, report before table | source gate | `./node_modules/.bin/vitest run src/components/bulk` | ❌ new | ⬜ pending |
| kanban select-all cap | 38-18 | 4 | BULK-01, BULK-02 | Unbounded request | Caps at `BULK_MAX_IDS`, surfaced via `bulk.selectAllInStageCapped` | unit | `./node_modules/.bin/vitest run src/app/deals` | ❌ new | ⬜ pending |
| select-wiring cross-surface gate | 38-19 | 5 | BULK-01..04 | — | Neither `organizations/columns.tsx` nor `people/columns.tsx` is touched; all 6 Deferred Ideas absent | source gate (`readStrippedSource`) | `./node_modules/.bin/vitest run src/components/bulk/__tests__/select-wiring.test.ts` | ❌ new | ⬜ pending |
| phase-wide gates | 38-19 | 5 | BULK-01..04 | — | Full suite ≥1703 + new, 0 typecheck, 0 lint, zero new `@ts-expect-error` | suite | `npm test && npm run typecheck && npm run lint` | ✅ exists | ⬜ pending |
| custom_* survival | — | existing | BULK-04 | — | `deriveCsvColumns` keeps `custom_*` when row 1 has none | unit | already covered | ✅ exists | ⬜ pending |
| RSC boundary | 38-19 | 5 | BULK-01 | — | No React element crosses into a Radix `asChild` slot | unit (existing repo-wide gate) | `./node_modules/.bin/vitest run "src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx"` | ✅ exists | ⬜ pending |
| SC-5 decoupling | 38-02, 38-03 | 1 | BULK-03 | Repudiation | New `update*OwnerMutation`s stay uncoupled from the audit layer | unit (existing gate, auto-covers via `update` prefix) | `./node_modules/.bin/vitest run src/lib/audit/no-mutation-coupling.test.ts` | ✅ exists | ⬜ pending |
| second user + live probes + browser UAT | 38-20 | 6 | BULK-01..04 | All | Every manual-only row in the table below | browser + `psql` | n/a — see Manual-Only Verifications | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/bulk/limits.ts` + `src/lib/bulk/types.ts` — **import-free**, so the client bar can use them
- [ ] `src/lib/bulk/dispatch.ts` + `dispatch.test.ts` — assert **both** directions of the `satisfies`
      (TS2741 missing arm, TS2353 extra arm), per Phase 37's `Readonly<Record<K, fn>>` lesson
- [ ] `src/app/{organizations,people,deals,activities}/bulk-actions.test.ts` — over-cap,
      unauthenticated, per-entity authorization asymmetry, partial failure, single `revalidatePath`,
      single `runWithActor`, export-signature source gate
- [ ] `src/components/bulk/select-column.test.ts` + `select-wiring.test.ts` — pure column def plus a
      comment-stripped source gate on the three tables
- [ ] `src/components/ui/checkbox-indeterminate.test.ts` — the Minus branch plus the 8-consumer
      no-`indeterminate` assertion
- [ ] Extend `src/lib/mutations/{organizations,people,deals,activities}.test.ts`
- [ ] Extend `src/lib/audit/diff.test.ts`, `src/lib/export/formatters.test.ts`
- [ ] Extend `src/messages/locale-parity.test.ts` with `BULK_NAMESPACE`, `bulkKeys`,
      `REQUIRED_BULK_KEYS` — passed **separately**, never concatenated with the note/audit/trash lists
- [ ] Framework install: **none**. jsdom and testing-library must NOT be added.

---

## Manual-Only Verifications

No DOM test environment exists, so every interaction behaviour below is browser-only. Verify through
the Claude-in-Chrome tools against the Docker app at `http://localhost:3001`.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Row checkbox selects; header select-all selects the loaded page; indeterminate renders a **Minus**, not a check | BULK-01 | No jsdom; Radix Checkbox needs a real DOM | Load `/organizations`, click 2 of 50 rows, confirm header checkbox shows a dash not a tick |
| Selection persists across "Load More", clears on search/filter change | BULK-01 | Requires real navigation + RSC refresh | Select 3, Load More, confirm still 3; type in search, confirm cleared |
| Deal-card checkbox does not expand the card, does not start a drag, and Space selects for a keyboard user | BULK-01 | @dnd-kit sensors + `KeyboardSensor`; three separate propagation stops | Click checkbox (no expand), drag from checkbox >5px (no drag), Tab to checkbox and press Space |
| Per-stage select-all on a 10,495-deal stage caps at `BULK_MAX_IDS` and says so | BULK-01, BULK-02 | Live data scale | Select-all on the largest stage; confirm the capped-count copy appears |
| Bulk-deleted records appear in `/trash` under the right tab; change history shows the delete | BULK-02, BULK-05 | Cross-surface + DB | Delete 3 orgs, follow the Trash deep link, open one record's timeline |
| Bulk reassign names each per-record failure rather than swallowing it | BULK-03 | Needs a real 9-succeed/3-fail mix | Requires the **second restored user** (see below); reassign a mixed set |
| No email is sent on bulk reassign | BULK-03 | Mailhog is out-of-process | Note the Mailhog count at `http://localhost:8025`, reassign 10, confirm the count is unchanged |
| Downloaded CSV has exactly N data rows, no `[object Object]`, and keeps `custom_*` columns | BULK-04 | Real Blob download | Select 3, export, open the file |
| The bulk bar does not overflow at 320px | BULK-01 | `resize_window` cannot change `window.innerWidth` here | Use a **320px same-origin iframe** (Phase 37 method). Note the app `<header>` already overflows at 320px on every route — 37-UAT G5, pre-existing, do NOT attribute it to the bulk bar |

**Blocking data prerequisite:** the live DB has exactly **one** approved, non-deleted user owning all
46,054 organizations. SC-3 and SC-5 for reassignment are literally unverifiable in that state —
reassigning to the same owner correctly writes no audit row. Restoring a second approved user is a
plan task, not an optional nicety.

**Where a live-DB probe is mandatory** (Phase 37: a wholly-mocked suite passed a broken `sql`
fragment):
1. `ExportFilters.ids` — the generated SQL and its row count. A mocked `db.query` cannot catch a
   malformed `inArray` any more than it caught the malformed `sql` fragment in Phase 37.
2. The `audit_log` rows for a bulk delete and a bulk reassign — count and `changes` keys, read from
   the container, not from a spy.
3. `deal_assignees` row count before and after a deals bulk reassign (the Pitfall 2 regression).
4. `select count(*) from users where deleted_at is null and status='approved'`.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
