---
phase: 50
slug: export-authorization
status: created
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-27
---

# Phase 50 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> **Extracted verbatim from `50-RESEARCH.md` § Validation Architecture** at the plan checker's
> instruction: the content existed but had no standalone tracked contract, so waves 1-6 would have run
> against an implicit one. Phase 49 created its VALIDATION.md at planning time and had the sign-off
> only *finalize* it; this file restores that ordering.

---

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework | vitest **4.1.11** (`package.json:87`) |
| Configs | `vitest.config.ts` (base), `vitest.rsc.config.ts` (rsc), `vitest.db.config.ts` (db, opt-in) |
| Quick run command | `rtk proxy ./node_modules/.bin/vitest run <file>` |
| Full suite command | `npm test` (base + rsc), plus `npm run test:db` |
| Baseline (from the task env block) | `npm test` **5696 passed / 32 skipped over 185 files**; RSC **8/8**; `tsc --noEmit` 0; eslint **0 errors** / 117 warnings; `npm run test:db` **299 passed over 13 files, EXIT 0** |

**Baseline discrepancy to resolve at plan time:** `.planning/STATE.md:30` says **5659 / 184** and
`db 288 / 13`; the task's environment block says **5696 / 185** and `db 299 / 13`. This milestone has
already paid three times for an inherited stale count (STATE.md's own note at `:32-34`). **Re-measure;
inherit nothing.**

### Phase Requirements → Test Map

| Req / SC | Behavior | Test type | Automated command | File exists? |
|---|---|---|---|---|
| SEC-03 / SC-1 | `organization` + `search=a` refused for a non-admin, payload carries 44,254 / 46,054 | live-db behavioural | `<live project> src/lib/export/*-live.test.ts` (or `*.db.test.ts`) | ❌ Wave 0 — new cells; and the host file's project is the §7 decision |
| SC-2 | `search=ltda` (13,355) succeeds for the same non-admin; `search=a` succeeds for an admin | live-db behavioural | same | ❌ Wave 0 |
| SC-3 | the refusal toast names `{matched}` / `{total}` and is distinct from `bulk.error.exportFailed` | unit (locale contract) + e2e | `npm test -- src/messages/locale-parity.test.ts`; `npm run test:e2e` | ✅ `locale-parity.test.ts` exists (edit); ❌ e2e cell is new. Non-admin fixture exists: `e2e/seed-member.ts` |
| SC-4 | the decision flips exactly once across the §8 `dateTo` ladder, at the measured bracket | live-db behavioural | same live project | ❌ Wave 0 |
| SC-4 (floor) | the §5 unit cell table, incl. `(0,0)` and `(5,10)` | unit, pure function | `rtk proxy ./node_modules/.bin/vitest run src/lib/export/__tests__/export-selectivity.test.ts` | ❌ Wave 0 |
| SC-5 | `audit_log` 214 → 215 with `entity_type='export'` after an admitted export | live-db behavioural + manual psql | `docker compose exec -T postgres psql …` | ❌ Wave 0. Structural half exists: `view-filters.test.ts:791-812` |
| absorb 28 | both live files run in a project that has a database | project topology | `npm run test:live` (Route B) or `npm run test:db` (Route A) | ❌ Wave 0 |
| non-regression | the six `fetchFilteredData` call sites are exactly six, each classified | unit, repo-wide source scan | `npm test -- src/lib/export/__tests__/` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `rtk proxy ./node_modules/.bin/vitest run <touched test files>` + `npm run typecheck`
- **Per wave merge:** `npm test` (base + rsc) + `npm run lint` (**errors only**) + `npm run test:db`
- **Phase gate:** full suite green, `tsc --noEmit` 0, eslint 0 errors, `test:db` counts **and** EXIT 0
  (DEF-48-01 is closed — commit `37202ce` — so the exit code is usable; note the Phase 49 plans' stale
  constraint text says otherwise), `db:check-migrations` 0, `security:audit` 0, tree clean by
  `git diff --exit-code`, and **the live SC-1 number re-measured**.

### Wave 0 Gaps

- [ ] `src/lib/export/export-selectivity.ts` — the module (pure `decideSelectivity` + async
      `countExportMatches`)
- [ ] `src/lib/export/__tests__/export-selectivity.test.ts` — the §5 unit cells, incl. `(0,0)`
- [ ] the exported `buildExportConditions` in `formatters.ts` + a structural gate that all four
      fetchers use it
- [ ] the §7 project decision, and if Route B: `vitest.live.config.ts`, a `test:live` script, one
      `ci.yml` step, a base-project `exclude` entry, a seeder, and `SKIPPED_LIVE_FILES` updated
- [ ] SC-4's ladder cells against real Postgres
- [ ] the repo-wide `fetchFilteredData` call-site enumeration gate
- [ ] the deliberate rewrite of `view-filters.test.ts:736-747`, with its new red recorded
- [ ] the six locale-contract edits in §6
- [ ] `MIN_EXPORT_ROWS` value confirmed by the user (§5, `[ASSUMED]`)

---

---

## Preconditions to RE-MEASURE at execution time

SC-1 says the scale must be **re-measured at plan time**, and 50-01 Task 1 re-measures a third time
(research → plan → execution). These are the figures every proof depends on; if any has moved, the
affected proof must be re-designed rather than re-run.

| measure | expected | why it matters |
|---|---|---|
| `organizations` live | 46,054 | SC-1's denominator; allowance `floor(46054 x 0.40)` = **18,421** |
| `search=a` on organizations | 44,254 (96.09%) | SC-1's roadmap example — **refused** |
| `search=ltda` | 13,355 (29.00%) | SC-2's admitted case — must stay under 18,421 |
| `activities` live | 79,022 | SC-4's ladder denominator; allowance **31,608** |
| the `dateTo` bracket | 06-11 → **31,530** admitted, 06-12 → **31,612** refused | SC-4's crossing. 06-09/-10/-11 all return 31,530, so only strictly-increasing dates support the claim |
| `deals` + `owner=<the one owning admin>` | 25,195 of 25,195 = **100.00%** | the REAL worst case, understated by the roadmap |
| `audit_log` total / `entity_type='export'` | 214 / **0** | SC-5 needs 214 → 215 and 0 → 1; an "unchanged" assertion passes today |

**Three vacuity traps this live data contains, each of which must be avoided rather than discovered:**

- **`assignee` matches ZERO rows** (deals and activities) — an SC-2 proof on it passes on an empty set.
- **`owner` matches EVERY row** — an SC-2 proof on it passes on a whole set.
- **`pipelite_dedup_test` starts EMPTY** — a selectivity assertion placed in the db project without
  seeding passes vacuously.

**`MIN_EXPORT_ROWS = 1,000` guards a branch NO live database here can reach** (smallest table 25,195
rows), so it is provable **only** by unit cells on the pure function. The plans must not imply live
coverage for it.

---

## Wave-scheduling constraints (both hard)

1. **`scripts/dedup-db-test-setup.sh` drops and rebuilds every schema in `pipelite_dedup_test`** — two
   plans that each own a `*.db.test.ts` must never share a wave. (Learned in Phase 48; Phase 49 made
   five of six waves single-plan for it.)
2. **NEW, discovered while planning this phase: `npm run test:live` writes `audit_log` in the REAL
   database** — so **no two `live_test_owner` plans may share a wave** either. This is why six of Phase
   50's seven waves are single-plan, and it also keeps 50-01's `audit_log` measurement clear of the file
   that writes to it.

---

## Validation Sign-Off

- [ ] Every task has an `<automated>` verify or a Wave 0 dependency
- [ ] The three re-measured preconditions confirmed, and every count assertion carries a named-integer floor
- [ ] Each new or re-anchored gate observed RED before being trusted, with the red recorded verbatim
- [ ] 50-04's fourteen extraction reds recorded with a count BEFORE re-anchoring
- [ ] `nyquist_compliant` set only if every criterion's evidence is direct; SC-3's is admittedly indirect

**Approval:** pending
