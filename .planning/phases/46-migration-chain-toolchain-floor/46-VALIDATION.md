---
phase: 46
slug: migration-chain-toolchain-floor
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-24
---

# Phase 46 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `46-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.0.18 — three projects: base, `vitest.rsc.config.ts`, `vitest.db.config.ts` |
| **Config file** | `vitest.config.ts` (base — where new static gates belong) |
| **Quick run command** | `npx vitest run src/lib/__tests__/` |
| **Full suite command** | `npm test` → `vitest run && vitest run --config vitest.rsc.config.ts` |
| **DB-backed project** | `npm run test:db` — **must remain outside `npm test`**; `db-test-isolation.test.ts` enforces this |
| **Estimated runtime** | quick ~1s (static, DB-free) · full suite ~several min |

---

## Sampling Rate

- **After every task commit:** `npx vitest run src/lib/__tests__/` — the infra gates, sub-second, no DB
- **After every plan wave:** `npm test` + `npm run typecheck` + `npm run lint`
- **Before verify:** full suite green, **plus** `npm run db:check-migrations` green, **plus** both SC-3
  negative controls observed red with their real output pasted into the SUMMARY, **plus** a real
  `docker compose up -d --build` with `docker compose exec app node -v` showing v24.x and
  `/api/health` returning 200
- **Max feedback latency:** ~1s for the static class, ~60s for the behavioural class

---

## Per-Task Verification Map

| Requirement | Behavior | Test Type | Automated Command | File Exists |
|---|---|---|---|---|
| DEPLOY-01 | Every table in the final snapshot is created by some migration | unit (static, DB-free) | `npx vitest run src/lib/__tests__/migration-chain-integrity.test.ts` | ❌ W0 |
| DEPLOY-01 | No `ALTER`/`REFERENCES`/`CREATE INDEX ON` precedes its table's `CREATE TABLE` in chain order | unit (static) | same file | ❌ W0 |
| DEPLOY-01 | `drizzle-kit generate` still reports "No schema changes" after the repair | integration | generate into a copied `out` dir; assert byte-identical | ❌ W0 |
| DEPLOY-01 SC-1 | Throwaway DB migrated from zero matches reference across 10 catalog dimensions | integration (Postgres) | `npm run db:check-migrations` → `node scripts/migrate-from-zero.mjs` | ❌ W0 |
| DEPLOY-01 SC-2 | `/api/health` 200 against a migration-built DB and nothing else | integration (manual, Docker) | container + `curl /api/health`; assert `status:"ok"`, `db.ok:true`, 10 processors | ❌ W0 |
| DEPLOY-02 SC-4 | The command the docs print succeeds from the host, no override, no port edit | integration (manual) | `npm run db:migrate` with `.env.local` **deleted** | ❌ W0 |
| DEPLOY-02 | `.env.example` + host-perspective docs print the host port; container docs print `@postgres:5432` | unit (static) | extend `src/lib/__tests__/deployment-docs-accuracy.test.ts` | ✅ file / ❌ assertions |
| DEPLOY-02 | `docker-compose.yml` constructs the app's `DATABASE_URL` naming `@postgres:5432` | unit (static, yaml-parsed) | amend `compose-uploads-persistence.test.ts` (**line 210 must change**) | ✅ file / ❌ assertions |
| DEPLOY-03 SC-5 | Every declared `engines.node` floor in the lockfile is satisfied by the pinned Node | unit (static) | `npx vitest run src/lib/__tests__/node-engines-floor.test.ts` | ❌ W0 |
| DEPLOY-03 | All three `FROM node:` tags parsed and identical (≥3 found — anti-vacuity) | unit (static) | same file | ❌ W0 |
| DEPLOY-03 | The **running container's** Node satisfies the floor | integration (manual, Docker) | `docker compose up -d --build` then `docker compose exec app node -v` | ❌ W0 |

---

## Negative Controls — MANDATORY, this is the phase's reason for existing

v1.3 shipped **six gates that could not fail**. Every gate below is broken on purpose and observed red
before it is trusted, and the **real output is pasted into the SUMMARY**. A gate with no recorded red
observation is treated as not delivered.

| # | Gate | How it is broken | Expected red |
|---|---|---|---|
| NC-1 | from-zero migration check | delete the new `import_sessions` DDL | `42P01`, exit ≠ 0 |
| NC-2 | from-zero migration check | delete the new `webhook_deliveries` DDL | **table-count mismatch while migrate still exits 0** — this is the control that proves the check is not just reading an exit code |
| NC-3 | `node-engines-floor` | run the checker against `20.20.2` | exactly **1** violation, naming `@napi-rs/lzma-linux-x64-gnu`. Kept permanently in-file as a cheap standing negative control |
| NC-4 | doc/port accuracy | point `.env` back at `5432` | `npm run db:migrate` fails; restore and observe green |
| NC-5 | `migration-chain-integrity` | remove one `CREATE TABLE` from any migration | that table reported as never-created |

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/migration-chain-integrity.test.ts` — DEPLOY-01 static class
- [ ] `src/lib/__tests__/node-engines-floor.test.ts` — DEPLOY-03
- [ ] `scripts/migrate-from-zero.mjs` — DEPLOY-01 SC-1/SC-3 behavioural class
- [ ] npm script `db:check-migrations` wired to the above
- [ ] CI wiring for the behavioural gate — **Route A** (amend `db-test-isolation.test.ts` to assert the
      real invariant; keep the check on the existing required job)
- [ ] devDependency `semver`
- [ ] Amendments to **existing** gates, each in the same commit as the change that breaks it:
      `compose-uploads-persistence.test.ts:210`, `db-test-isolation.test.ts:137-141`,
      `deployment-docs-accuracy.test.ts`
- No framework install needed — vitest is present and already runs in CI.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|---|---|---|---|
| `/api/health` 200 against a migration-built DB | DEPLOY-01 SC-2 | needs a full container boot against a scratch DB | build image, point at the from-zero DB, `curl /api/health`, assert `db.ok:true` and 10/10 processors |
| Container Node satisfies the floor | DEPLOY-03 | needs a real image rebuild (`restart` runs the OLD image) | `docker compose up -d --build`; `docker compose exec app node -v` → v24.x |
| Docs' migrate command from the host | DEPLOY-02 SC-4 | proves the reader's literal path | delete `.env.local`, run the printed command verbatim |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or a Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] **All five negative controls observed red, output recorded in SUMMARY**
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
