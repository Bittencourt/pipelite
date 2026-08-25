---
phase: 47
slug: suite-trust-supply-chain
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-25
---

# Phase 47 — Validation Strategy

> Per-phase validation contract. Derived from `47-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|---|---|
| **Framework** | vitest 4.0.18 — **must move to >=4.1.0** (SEC-05, CVSS 9.8), three projects |
| **Config file** | `vitest.config.ts` (base — where every new gate belongs) |
| **Defaults in force** | no `pool`, no `maxWorkers`, no `testTimeout`, no `hookTimeout` → **testTimeout 5000 ms, hookTimeout 10000 ms**, default worker count |
| **Quick run** | `./node_modules/.bin/vitest run src/lib/execution/ src/lib/__tests__/` |
| **Full suite** | `npm test` → `vitest run && vitest run --config vitest.rsc.config.ts` |
| **Measured baseline** | **4739 passed / 32 skipped**, 169 files, 51-65 s per base run |
| **DB project** | `npm run test:db` — stays outside `npm test`; `db-test-isolation.test.ts` enforces it |
| **New test files** | must be `*.test.ts`; `*.db.test.ts` / `*.rsc.test.ts` are excluded from the base project and would never run in CI |
| **Binary invocation** | call `./node_modules/.bin/vitest` directly when interleaving matters — `npm run` reorders a child's stdout/stderr |

---

## Sampling Rate

- **Per task commit:** `./node_modules/.bin/vitest run src/lib/__tests__/ src/lib/execution/` — new gates plus the two fixed files. Sub-second, no DB, no network.
- **Per wave merge:** `npm test` + `npm run typecheck` + `npm run lint` — **gate on ERRORS (0), never on the warning total**; it differs between a worktree and master.
- **Phase gate:** full suite green · `npm run security:audit` green · **all five negative controls (A-E) observed red with verbatim output in the SUMMARY** · the ten-run pass-set diff recorded before **and** after · `docker compose up -d --build` with `/api/health` 200 and 10/10 processors · the GitHub `ci` check observed red then green for control E.

---

## Requirements → Test Map

| Req | Behaviour | Type | Command | Exists? |
|---|---|---|---|---|
| QG-01 SC-2 | `tokenizeFieldPath` reads >=1x and <=Kx input length over the aggregate traversal set | unit (deterministic integers) | `vitest run src/lib/execution/condition-evaluator.test.ts` | ❌ W0 |
| QG-01 SC-2 | ops/char flat across a >=16x input span (`<=1.25x`) | unit | same | ❌ W0 |
| QG-01 SC-2 | the quote-storm path is rejected in <=200 counted ops, independent of n | unit | same | ❌ W0 |
| QG-01 SC-2 | `resolveFieldPath` delegates to `tokenizeFieldPath`; neither uses a regex or bulk scanner | unit (TS AST) + 4 anti-vacuity floors | same | ❌ W0 |
| QG-01 SC-1 | `toggle.test.ts` first test <=50 ms; all 5 still pass | unit (timing via JSON reporter) | `vitest run src/lib/execution/toggle.test.ts --reporter=json` | ✅ tests / ❌ fix |
| QG-01 SC-1 | `recursion.test.ts` same | unit | `vitest run src/lib/execution/recursion.test.ts` | ✅ / ❌ |
| QG-01 | **No `await import()` inside any lifecycle hook** (carve-out: files calling `vi.resetModules()`, and the two skipped `*-live` files) | unit (TS AST, floor >=140 hooks parsed) | `vitest run src/lib/__tests__/suite-timing-hygiene.test.ts` | ❌ W0 |
| QG-01 SC-1b | **No `expect()` over a clock-derived DELTA or RATIO** anywhere in the suite | unit (TS AST + taint, floor >=7000 `expect()` parsed, self-tested vs KNOWN_POSITIVE/NEGATIVE) | same | ❌ W0 |
| QG-01 SC-1 | Ten consecutive full-suite runs at default workers → same pass set | integration, scripted | `bash scripts/suite-repeatability.sh 10 && node scripts/diff-pass-sets.mjs` | ❌ W0 |
| QG-01 SC-1 | The diff script's own floor fires on a truncated reference | unit or manual | truncate a JSON report → script exits 1 | ❌ W0 |
| SEC-05 SC-3 | Every critical/high advisory is fixed or carries an **unexpired reasoned** allowlist entry | integration (network) | `npm run security:audit` | ❌ W0 |
| SEC-05 SC-4 | Policy shape: reason non-empty and not in `FORBIDDEN_REASONS`; `expires` parses and is future; `ghsa` well-formed; **`failOn` == `["critical","high"]`** | unit (static, offline) | `vitest run src/lib/__tests__/audit-policy.test.ts` | ❌ W0 |
| SEC-05 | Registry signatures and attestations verify | integration (network) | `npm audit signatures` | ✅ passes today (1104/1104, 169 attestations) |
| SEC-05 | After version bumps the running container is healthy | integration (manual, Docker) | `docker compose up -d --build` → `exec app node -v` → `curl /api/health` | ❌ W0 |

---

## Negative Controls — MANDATORY. This is the phase's reason for existing.

v1.3 shipped **six gates that could not fail**. Phase 46's own code review found a **seventh inside the
phase built to delete them** — a scan that floored its verb but not its search token, so renaming the
token would have turned it green *because it broke*. And Phase 47's research found this phase's own
**SC-1 could not fail** (16/16 green on the unfixed tree). Assume this phase will produce another
unless every gate below is deliberately falsified and the **verbatim output recorded in the SUMMARY**.

| # | Gate | How it is broken | Expected red |
|---|---|---|---|
| **A** | ops counter + AST | a **regex-backtracking** `tokenizeFieldPath` | **FLOOR** fails (counted = **0** — catastrophic backtracking is invisible to a JS counter) **and** the AST gate fails |
| **B** | ops counter | a **restart-on-failure** `tokenizeFieldPath` | **CEILING** fails (1307 ops/char) |
| **C** | `suite-timing-hygiene` | re-add `beforeEach(async () => { await import(...) })`; re-add `expect(Date.now()-t).toBeLessThan(N)` | gate red on each, separately |
| **D** | `audit-policy` | set one `reason` to `"dev-only"`; back-date one `expires`; empty `failOn` | red on each — keep **all three permanently in-file**, like `node-engines-floor.test.ts`'s NC-3 |
| **E** | the **required GitHub `ci` check** | `npm i -D minimist@1.2.5` | the required check goes **red on GitHub**, then green on revert. Verified against the real runner, not locally |

**A gate with no recorded red observation is treated as not delivered.**

---

## Hazards that must be handled, not discovered

1. **The timing gate sweeps itself.** `suite-timing-hygiene.test.ts` scans `src/**/*.test.ts` and *is*
   one, and its KNOWN_POSITIVE fixtures *are* elapsed-delta assertions. Precedent:
   `src/types/__tests__/no-standing-suppressions.test.ts:19-25`. Pick exactly one mitigation and state it.
2. **Ordering hazard between two files this phase touches.** Deleting `condition-evaluator.test.ts:613-636`
   removes the repo's **only two `performance.now()` call sites** (`:620`, `:622`). A clock-call floor
   would then have zero instances and fail. Sequence these edits deliberately.
3. **The two new gates can fight each other.** The audit gate's expiry assertion is structurally
   identical to `src/app/admin/users/actions.test.ts:59`, a designated taint false-positive. The taint
   rule must be exactly RESEARCH §4:587-590.
4. **`npm audit fix` is FORBIDDEN** — measured, it adds `rolldown`/`tsx`/`esbuild` and moves `vite` 7→8.
5. **Four `db-test-isolation.test.ts` assertions** constrain `ci.yml` (raw scan `:354-363`, anchor
   `:365-372`, exactly-one-service `:388-409`, per-step floor `MIN_CI_STEPS` `:65-75`, `:435-455`).
   The audit step must not trip them.
6. **No AST precedent exists in this repo** — `from "typescript"` returns nothing outside
   `node_modules`. These are the first two. Copy everything *around* the parse from
   `deployment-docs-accuracy.test.ts` (file walk, floors, matcher self-test, `file:line` collector at
   `:239-261`).

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/suite-timing-hygiene.test.ts` — the two suite-wide AST gates
- [ ] `src/lib/__tests__/audit-policy.test.ts` — offline policy-shape gate + three permanent controls
- [ ] the in-repo advisory policy evaluator — **zero new dependencies** (`audit-ci` depends on `event-stream@4.0.1`, the 2018 backdoor package; `better-npm-audit` is 23 months stale)
- [ ] the allowlist file — per-entry **reason AND expiry**
- [ ] `AUDIT-POLICY.md` at repo root — **decided: repo root, not `security/`**; a root `SECURITY.md` is a different document and must not be conflated
- [ ] `scripts/suite-repeatability.sh` + `scripts/diff-pass-sets.mjs`
- [ ] npm script `security:audit` — must not mention `test:db`/`db.config` (`db-test-isolation.test.ts:104-114`)
- [ ] CI: audit step + `npm audit signatures` step on the **required** job
- No framework install needed; vitest is present and runs in CI.

---

## Manual-Only Verifications

| Behaviour | Req | Why manual | Instructions |
|---|---|---|---|
| Control E on the real runner | SEC-05 SC-4 | GitHub's own plumbing cannot be proved locally | push, add `minimist@1.2.5`, observe required check red, revert, observe green |
| Container healthy after version bumps | SEC-05 | needs a real image rebuild (`restart` runs the OLD image) | `docker compose up -d --build`; `exec app node -v`; `curl /api/health` |
| Margin under induced load | QG-01 SC-1 | needs deliberate CPU oversubscription | run at >=3x, record each timing-sensitive assertion's share of budget |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or a Wave 0 dependency
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] **All five negative controls (A-E) observed red, verbatim output in SUMMARY**
- [ ] Margin recorded before and after, at >=3x oversubscription
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
