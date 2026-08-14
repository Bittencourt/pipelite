# Phase 32: Test Infrastructure & CI - Research

**Researched:** 2026-08-13
**Domain:** Test runner configuration (Vitest 4) + GitHub Actions CI + merge gating
**Confidence:** HIGH — nearly every claim below was proven by running the command in a throwaway `git worktree` with a fresh `npm ci`, not inferred.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

All implementation choices are at Claude's discretion — pure infrastructure phase. Constraints that follow from the codebase and ROADMAP success criteria:

- **Runner:** vitest — already a devDependency, and all 41 existing test files are vitest-style.
- **CI provider:** GitHub Actions — `origin` is `https://github.com/Bittencourt/pipelite.git`, and SC-4 requires a "red required check" on a pull request, which is GitHub's branch-protection model.
- **Suite scoping:** the stale `.next/standalone/src/lib/formula-engine.test.ts` copy must be excluded via vitest `exclude`, not deleted — `.next/` is build output and will regenerate.
- **Test failures:** fix the source or the test, whichever is actually wrong — determine per test during execution; do not skip or delete a failing test to make the suite green.
- Branch protection itself is a repo setting, not a file — the phase delivers the workflow file and documents the protection rule to enable.

### Claude's Discretion

Everything. See above — CONTEXT.md marks the entire phase as discretionary within those constraints.

### Deferred Ideas (OUT OF SCOPE)

- Coverage reporting / thresholds — not required by any v1.3 requirement
- E2E test infrastructure — no requirement in this milestone
- Writing new feature tests (later phases own their own coverage)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CI-01 | Developer can run the full test suite with `npm test` — no such script exists today, the suite is only reachable via `npx vitest` | Confirmed: `package.json` has no `test` script (verified by reading the file). `vitest run` is the correct non-watch invocation; measured 13.9 s on a clean checkout. `CONTRIBUTING.md:75` and `:111` already *instruct contributors to run `npm test`* — the script is documented but missing. See **Standard Stack** and **Code Examples §1**. |
| CI-02 | Test runs collect only source tests — `vitest.config.ts` excludes `.next/**` and `node_modules/**` | **A `vitest.config.ts` already exists** (contrary to the phase brief) but has no `include`/`exclude`. Vitest 4.0.18 `configDefaults.exclude` is only `["**/node_modules/**","**/.git/**"]` — `.next` is *not* default-excluded, and `**/dist/**` was dropped in v4. Proven: adding the exclude drops collection from 42 → 41 files and 515 → 458 tests. See **Pitfall 1** (setting `exclude` REPLACES the defaults) and **Code Examples §2**. |
| CI-03 | The full suite passes clean — fixes `mutations/workflows.test.ts > deleteWorkflow` and `formula-engine.test.ts > LOGIC.isBlank` | Both root causes diagnosed **and both candidate fixes executed and proven green** in a scratch worktree. See **Diagnosis of the Two Failures**. Result after fixes + exclude: `41 passed (41)`, `454 passed | 4 skipped (458)`, exit 0. |
| CI-04 | Every push and pull request runs `tsc --noEmit`, `eslint`, and the test suite in CI, and a failing check blocks merge | `tsc --noEmit` **already passes** (exit 0, even on a clean checkout with no `.next/` and no `next-env.d.ts`). `eslint` **currently FAILS with 28 errors** (26 after `--fix`) — this is the single largest piece of undiscovered scope in the phase. See **The eslint Gate Is Not Free**. Repo has **no rulesets and no branch protection** on `master` (verified via GitHub API). |
</phase_requirements>

## Summary

This phase is far less about *choosing* tooling than about *repairing* what is already there. Vitest 4.0.18 is installed, a `vitest.config.ts` already exists at the repo root (committed in Phase 23, commit `1eeae14` — the phase brief's claim that it is absent is wrong), and 41 test files already run. What is missing is three lines of config, a `test` script, two small bug fixes, and a workflow file.

The two named test failures were both reproduced and diagnosed. `formula-engine.test.ts > LOGIC.isBlank` is a **source bug**: `evaluateFormula` computes `usesNullSafe = usesNullSafeFunction(expression)` at `formula-engine.ts:164` and then **never uses it** — eslint even flags it as an unused variable. The null-propagation guard at lines 141–158 therefore short-circuits and returns `null` for *any* referenced field that is null, before the null-safe carve-out can apply. `LOGIC.isBlank({{Value}})` with `Value: null` can never reach QuickJS. `workflows.test.ts > deleteWorkflow` is the opposite — a **stale test**: `deleteWorkflow` grew a `db.select().from().where()` cascade lookup at `workflows.ts:201–204`, and the test never stubs `mockDb.select`, so it returns `undefined` and `.from` throws. Both candidate fixes were applied in a throwaway worktree and verified: formula-engine goes 57/57 green, workflows goes 22/22 green, and the whole suite goes 41 files / 458 tests / exit 0.

The real risk in this phase is **CI-04's lint gate**. `npx eslint` today exits 1 with **28 errors and 140 warnings**. `--fix` clears only 2 (both `prefer-const`). The remaining 26 are 12 × `@typescript-eslint/no-explicit-any`, 8 × `react/no-unescaped-entities`, 3 × `react-hooks/set-state-in-effect`, 1 × `react-hooks/immutability`, 1 × `react-hooks/preserve-manual-memoization`, 1 × `@typescript-eslint/no-unsafe-function-type`. The five `react-hooks/*` errors come from React Compiler rules in `eslint-plugin-react-hooks@7.0.1` and are behaviour-adjacent refactors, not cosmetic. Phase 43 (POLISH-01) owns *type* suppressions, not lint errors — so this scope belongs to Phase 32 or must be explicitly ratcheted. This is the one decision in the phase that is not mechanical.

**Primary recommendation:** Add `include`/`exclude` to the existing `vitest.config.ts` (spreading `configDefaults.exclude`, never replacing it); add `"test": "vitest run"` and `"typecheck": "tsc --noEmit"` to `package.json`; hoist `usesNullSafeFunction` above the dependency loop in `formula-engine.ts` and gate the three null early-returns on it; stub `mockDb.select` in the `deleteWorkflow` test and add a second test covering the `runs.length > 0` cascade branch; ship a **single-job** `.github/workflows/ci.yml` on `ubuntu-latest` / Node 24 / `npm ci` / `cache: npm` running typecheck → lint → test with `if: ${{ !cancelled() }}` so all three report; and pay down the 26 lint errors (or make a deliberate, documented ratchet decision) before the workflow can go green.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Test collection scoping (`include`/`exclude`) | Build tooling (`vitest.config.ts`) | — | Only the runner knows what a "test file" is; `.next/` exclusion cannot live in CI because devs run the suite locally too (SC-2 says "a test run", not "a CI run"). |
| One-command entry point (`npm test`) | Package manifest (`package.json` scripts) | — | CI-01 is a developer-experience contract; `CONTRIBUTING.md` already promises it. |
| Null-propagation semantics for formulas | Application source (`src/lib/formula-engine.ts`) | — | The test encodes correct intent; the source is wrong. Fix belongs in the tier that owns the behaviour. |
| DB-call shape assumptions for `deleteWorkflow` | Test double (`src/lib/mutations/workflows.test.ts`) | — | The source's cascade delete is correct behaviour; only the mock is stale. |
| Merge gating | GitHub repo settings (ruleset / branch protection) | GitHub Actions workflow file | The workflow *produces* a check; only the repo setting can *require* it. This is why SC-4 needs a documented manual step, not just a file. |
| Static type gate | `tsc --noEmit` via `tsconfig.json` | CI workflow step | Already green — the workflow only needs to invoke it. |
| Lint gate | `eslint.config.mjs` (rule severity) | CI workflow step + source fixes | The 26 errors are a *source* problem, but the severity policy that makes them errors lives in `eslint.config.mjs` — that is the lever if a ratchet is chosen. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `vitest` | 4.0.18 (installed) | Test runner | Already a devDependency and already used by all 41 test files. `[VERIFIED: node_modules/vitest/package.json]` |
| `vite` | 7.3.1 (transitive) | Config loader / transform pipeline behind vitest | Determines the **Node floor** — `engines: ^20.19.0 \|\| >=22.12.0`. `[VERIFIED: node_modules/vite/package.json]` |
| `typescript` | 5.9.3 (installed) | `tsc --noEmit` gate | Already installed; `noEmit: true` already set in `tsconfig.json`. `[VERIFIED: node_modules/typescript/package.json]` |
| `eslint` | 9.39.3 (installed) | Lint gate | Flat config already at `eslint.config.mjs`; `lint` script already exists. `[VERIFIED: node_modules/eslint/package.json]` |
| `actions/checkout` | `v7` (latest `v7.0.1`, 2026-07-20) | Clone the repo in CI | `[VERIFIED: gh api repos/actions/checkout/releases/latest]` |
| `actions/setup-node` | `v7` (latest `v7.0.0`, 2026-07-14) | Install Node + npm cache | `[VERIFIED: gh api repos/actions/setup-node/releases/latest]` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| — | — | — | **No new packages are needed for this phase.** |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual `resolve.alias` for `@/` | `vite-tsconfig-paths` | Would read `tsconfig.json#paths` automatically. **Not worth it** — the existing 4-line manual alias already resolves `@/db`, `@/auth`, `@/lib/*` correctly across all 41 files (proven by a green suite). Adding a dependency to solve a solved problem is pure risk. |
| `test.exclude` for `.next` | `git rm -r --cached .next` / delete `.next` | CONTEXT.md explicitly forbids this — `.next/` is regenerating build output. `exclude` is the durable fix. |
| One CI job, three steps | Three parallel jobs (typecheck / lint / test) | Parallel jobs pay `npm ci` (33 s) three times and create three required-check names to configure. Measured step times are tsc 22.6 s, eslint 23.5 s, vitest 13.9 s — a single sequential job finishes in ~95 s including install. **One job = one required check name = far simpler branch protection.** Recommended. |
| `npm ci` | `npm install --legacy-peer-deps` (as in the Dockerfile) | **`npm ci` was tested and works** — exit 0, 1003 packages, 33 s, peer conflicts appear only as `npm warn` because they are already resolved in the committed lockfile. Do not copy `--legacy-peer-deps` from the Dockerfile into CI; `npm ci` is the correct, lockfile-exact CI install. |
| Node 24 | Node 20 (matches `Dockerfile: node:20-alpine`) | Node 20 only satisfies vite's `^20.19.0` floor if the tag resolves to ≥ 20.19 — fragile. Node 22 is in Maintenance LTS (EOL 2027-04-30). **Node 24 is the current Active LTS (EOL 2028-04-30)** and matches the developer's local `v24.13.1`. Recommend `node-version: 24`. |

**Installation:**
```bash
# Nothing to install. Every tool this phase needs is already in package.json.
```

**Version verification (all run in this session):**
```
vitest                            4.0.18   engines: ^20.0.0 || ^22.0.0 || >=24.0.0
vite                              7.3.1    engines: ^20.19.0 || >=22.12.0     <-- the real Node floor
next                              16.1.6   engines: >=20.9.0
eslint                            9.39.3   engines: ^18.18.0 || ^20.9.0 || >=21.1.0
eslint-plugin-react-hooks         7.0.1    engines: >=18
@typescript-eslint/eslint-plugin  8.56.0
typescript                        5.9.3
react                             19.2.3
local node                        v24.13.1 / npm 11.10.0
```

## Package Legitimacy Audit

**This phase installs zero external packages.** Every dependency it uses (`vitest`, `typescript`, `eslint`, `eslint-config-next`) is already present in the committed `package-lock.json` and was installed by a previous phase. `slopcheck` was therefore not run — there is no candidate package to check.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| *(none)* | — | — | — | — | n/a | No new installs in this phase |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

The only third-party *code* this phase introduces is two GitHub Actions, `actions/checkout` and `actions/setup-node`. Both are first-party GitHub-published actions; their latest tags were confirmed live via the GitHub REST API in this session, not from training data. `[VERIFIED: gh api repos/actions/{checkout,setup-node}/releases/latest]`

> Note: `gh api repos/Bittencourt/pipelite/actions/permissions` returns `{"enabled":true,"allowed_actions":"all","sha_pinning_required":false}` — the repo does not enforce SHA pinning, so major-version tags (`@v7`) are acceptable. Pinning to a full commit SHA is still the hardened option (see **Security Domain**).

## Diagnosis of the Two Failures

> This is the section CONTEXT.md's "fix the source or the test, whichever is actually wrong" decision depends on. Both diagnoses were reproduced, and both candidate fixes were **executed and verified green** in a disposable `git worktree` (since removed — the working tree is clean).

### Baseline: what the suite actually does today

```
$ npx vitest run          # DATABASE_URL unset in the shell
 Test Files  3 failed | 39 passed (42)
      Tests  3 failed | 508 passed | 4 skipped (515)
   Duration  18.74s
```

42 files, not 41 — the 42nd is `.next/standalone/src/lib/formula-engine.test.ts`, which produces the third failure as a duplicate of the first. With `.next/**` excluded: `2 failed | 39 passed (41)`, `452 passed | 4 skipped (458)`.

### Failure 1 — `formula-engine.test.ts > LOGIC.isBlank` → **the SOURCE is wrong**

Exact output:
```
FAIL  src/lib/formula-engine.test.ts > formula-engine > evaluateFormula > handles LOGIC.isBlank function
AssertionError: expected null to be true // Object.is equality
- Expected: true
+ Received: null
 ❯ src/lib/formula-engine.test.ts:109:28
   107|     it('handles LOGIC.isBlank function', async () => {
   108|       const result = await evaluateFormula('LOGIC.isBlank({{Value}})', { Value: null })
>  109|       expect(result.value).toBe(true)
```

**Root cause.** `src/lib/formula-engine.ts` defines a helper explicitly for this case:

```ts
// formula-engine.ts:90-104
/**
 * Check if expression uses null-safe functions (LOGIC.isBlank, LOGIC.isNumber, LOGIC.if)
 * These functions can handle null arguments and should not trigger null propagation
 */
function usesNullSafeFunction(expression: string): boolean { ... }
```

…and then **never uses its result**. In `evaluateFormula`:

- Lines 128–160: a dependency loop that returns `{ value: null, error: null }` early for *any* referenced field whose value is `null` (three sites: `:141`, `:152`, `:155`).
- Lines 163–164: `const hasArithmetic = ...` / `const usesNullSafe = usesNullSafeFunction(expression)` — computed **after** the loop has already returned, and then never read.

eslint independently confirms the dead code:
```
src/lib/formula-engine.ts
  163:9  warning  'hasArithmetic' is assigned a value but never used
  164:9  warning  'usesNullSafe' is assigned a value but never used
```

So `LOGIC.isBlank({{Value}})` with `Value: null` returns at line 155–157 and never reaches QuickJS. The QuickJS implementation itself is correct — `isBlank: (v) => v === null || v === undefined || v === ''` at line 47. **The test encodes the intended behaviour; the source has a wiring bug.** Fix the source.

**Verified fix** (hoist the check above the loop, gate all three early-returns on it):

```ts
const usesNullSafe = usesNullSafeFunction(expression)   // moved ABOVE the deps loop
const deps = extractDependencies(expression)
for (const dep of deps) {
  ...
  if (entityData[field.trim()] === null && !usesNullSafe) { return { value: null, error: null } }
  ...
  if (fromRelated === null && !usesNullSafe) { return { value: null, error: null } }
  } else if (fields[dep] === null && !usesNullSafe) { return { value: null, error: null } }
}
```

Result: `Test Files 1 passed (1) / Tests 57 passed (57)`.

**Regression guard that must keep passing** (it does): `formula-engine.test.ts:42` `propagates null values` — `evaluateFormula('{{Missing}} + 1', { Missing: null })` must still yield `null`. It does, because `usesNullSafeFunction('{{Missing}} + 1')` is `false` (no `LOGIC.*`/`TEXT.*` call), so the early-return still fires. Likewise `handles missing field as null` (`:47`) is unaffected — it exits on the `Unknown field` branch.

**Cleanup the planner should bundle in the same commit:** `hasArithmetic` (line 163) becomes provably dead and should be deleted (it is an eslint warning today), and `processedExpr` at `formula-engine.ts:210` is an eslint **error** (`prefer-const`) in the same file — `npx eslint --fix` resolves it.

### Failure 2 — `workflows.test.ts > deleteWorkflow` → **the TEST is stale**

Exact output:
```
FAIL  src/lib/mutations/workflows.test.ts > deleteWorkflow > deletes existing workflow
TypeError: Cannot read properties of undefined (reading 'from')
 ❯ Module.deleteWorkflow src/lib/mutations/workflows.ts:202:36
   200|   // Cascade delete: steps -> runs -> workflow
   201|   const runs = await db
>  202|     .select({ id: workflowRuns.id })
   203|     .from(workflowRuns)
   204|     .where(eq(workflowRuns.workflowId, id))
 ❯ src/lib/mutations/workflows.test.ts:450:20
```

**Root cause.** The `vi.mock("@/db", ...)` factory at `workflows.test.ts:4–18` provides `select: vi.fn()` with no return value, and `beforeEach(() => vi.clearAllMocks())` guarantees it stays bare. The `deleteWorkflow` test (`:444`) stubs `mockDb.query.workflows.findFirst` and `mockDb.delete`, but **not** `mockDb.select`. So `db.select({...})` evaluates to `undefined` and `.from(...)` throws. This matches REQUIREMENTS.md's own note ("stale mock; cascade delete grew a `db.select` the mock chain does not supply, `workflows.ts:202`"). The source's cascade (`steps → runs → workflow`) is correct behaviour and must not change. **Fix the test.**

**Verified fix:**

```ts
it("deletes existing workflow", async () => {
  mockDb.query.workflows.findFirst.mockResolvedValue({ id: "wf-1" })
  mockDb.select.mockReturnValue({
    from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
  })
  mockDb.delete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) })

  const result = await deleteWorkflow("wf-1")
  expect(result).toEqual({ success: true })
})
```

Result: `Test Files 1 passed (1) / Tests 22 passed (22)`.

**Important coverage gap the planner must close.** That minimal fix returns `[]` runs, so `if (runs.length > 0)` is never entered — the **cascade path SC-3 explicitly names is still untested**. A second test is required, and it was written and proven to pass:

```ts
it("cascades to run steps and runs before deleting the workflow", async () => {
  mockDb.query.workflows.findFirst.mockResolvedValue({ id: "wf-1" })
  mockDb.select.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([{ id: "run-1" }, { id: "run-2" }]),
    }),
  })
  const deleteWhere = vi.fn().mockResolvedValue(undefined)
  mockDb.delete.mockReturnValue({ where: deleteWhere })

  const result = await deleteWorkflow("wf-1")
  expect(result).toEqual({ success: true })
  expect(mockDb.delete).toHaveBeenCalledTimes(3) // steps -> runs -> workflow
})
```

Result: `Test Files 1 passed (1) / Tests 23 passed (23)`.

### Proven end state

With the exclude config + both fixes, on a **fresh `git worktree` + fresh `npm ci`** (no `.next/`, no `next-env.d.ts`, no `tsconfig.tsbuildinfo`):

```
npm ci        -> exit 0  (1003 packages, 33s)
tsc --noEmit  -> exit 0  (22.6s)
vitest run    -> exit 0  Test Files 41 passed (41) / Tests 454 passed | 4 skipped (458)  (13.9s)
eslint        -> exit 1  28 errors, 140 warnings                                          (23.5s)   <-- ONLY remaining gate
```

## Does CI Need a Postgres Service Container? — **No.**

Verified two ways:

1. **Every DB-touching test mocks `@/db`.** 27 call sites of `vi.mock("@/db", ...)` across `src/lib/mutations/*.test.ts`, `src/lib/triggers/*.test.ts`, `src/lib/execution/**`, and `src/app/api/v1/workflows/__tests__/`. All five `src/lib/mutations/*.test.ts` files (`workflows`, `deals`, `activities`, `people`, `organizations`) mock the module.
2. **The suite is byte-identical with `DATABASE_URL` unset.** `src/db/index.ts` throws at module load if `DATABASE_URL` is missing:
   ```ts
   if (!process.env.DATABASE_URL) { throw new Error("DATABASE_URL environment variable is not set") }
   ```
   Running `env -u DATABASE_URL npx vitest run` produced the *same* `3 failed | 39 passed (42)` / `508 passed | 4 skipped`. If any file imported `@/db` unmocked, that file would have failed collection. None did. Vitest also does not load `.env` into `process.env` by default, so this is the CI condition exactly.

**Conclusion:** the CI job needs **no `services: postgres`, no `DATABASE_URL` env, no migrations step.** Adding one would be pure cost and a false signal.

## The eslint Gate Is Not Free

`npx eslint` today: **28 errors, 140 warnings, exit 1.** `npx eslint --fix` clears exactly 2 (both `prefer-const`), leaving **26 errors**:

| Rule | Count | Where | Difficulty |
|------|-------|-------|-----------|
| `@typescript-eslint/no-explicit-any` | 12 | 8 in `src/app/api/v1/**/route.ts` (Drizzle `with: withOptions` casts), 4 in `toggle.test.ts` / `recursion.test.ts` | Low–Medium |
| `react/no-unescaped-entities` | 8 | `activities/activity-list.tsx:516`, `admin/pipelines/[id]/stage-configurator.tsx:288`, `deals/deal-card.tsx:264`, `custom-fields/formula-editor.tsx:156` (2 each) | Trivial — `"` → `&quot;` |
| `react-hooks/set-state-in-effect` | 3 | `(auth)/reset-password/page.tsx:42`, `settings/profile/profile-settings-form.tsx:38`, `components/ui/relative-time.tsx:17` | **Medium — behaviour-adjacent refactor** |
| `react-hooks/immutability` | 1 | `(auth)/verify-email/page.tsx:20` (`verifyEmail` used before declaration) | Medium — hoist the function above the effect |
| `react-hooks/preserve-manual-memoization` | 1 | `import/import-wizard.tsx:91` (React Compiler: inferred dep `customFieldTypes` ≠ declared `[rawData, mapping, entityType]`) | Medium |
| `@typescript-eslint/no-unsafe-function-type` | 1 | `api/v1/workflows/__tests__/runs-routes.test.ts:14` (`handler: Function`) | Low — type the handler signature |
| `prefer-const` | 2 | `formula-engine.ts:210`, `import/pipedrive-api-transformers.ts:167` | **Auto-fixed by `--fix`** |

Two useful details for whoever plans this:

- **Several `no-explicit-any` sites already have a misplaced disable comment.** `src/app/api/v1/stages/[id]/route.ts:26` carries `// eslint-disable-next-line @typescript-eslint/no-explicit-any` but it sits on the line *before* `const stage = await db.query...`, while the actual `any`s are on lines 30 and 31. Moving/duplicating the comment fixes those without any type work. The rest are all the same Drizzle shape — `}) as any`, `}) as Promise<any[]>`, `}) as any[]` after a dynamic `with: withOptions`.
- **The 5 `react-hooks/*` errors are new-generation React Compiler rules** from `eslint-plugin-react-hooks@7.0.1`. They are not stylistic; `set-state-in-effect` in particular fires on a real cascading-render pattern.

**The 140 warnings are a separate question.** They are all `@typescript-eslint/no-unused-vars` and do **not** fail the build. Do **not** add `--max-warnings 0` in this phase — CI-04 says "eslint … and a failing check blocks merge", which plain `eslint` (exit 1 on errors) already satisfies. Adding `--max-warnings 0` silently multiplies the phase's scope by ~6×.

**Phase-boundary note:** Phase 43 / POLISH-01 owns *`tsc`* cleanliness and `@ts-expect-error` removal (14 suppressions exist today). It does **not** own eslint errors. So these 26 are Phase 32's, unless the planner makes an explicit, documented ratchet decision. Three honest options:

1. **Fix all 26.** Cleanest; ~10 trivial + ~11 mechanical + 5 real refactors.
2. **Fix the 21 mechanical ones; add narrowly-scoped `// eslint-disable-next-line <rule> -- <reason>` for the 5 React Compiler errors**, with a follow-up backlog item.
3. **Downgrade the 5 React Compiler rules to `"warn"` in `eslint.config.mjs`.** Fastest, but silently lowers the bar project-wide.

Option 2 is the recommendation: it keeps the gate real, keeps the phase bounded, and leaves an auditable trail.

## Architecture Patterns

### System Architecture Diagram

```
  developer machine                                    GitHub
  ─────────────────                                    ──────

  git push / open PR ─────────────────────────────────▶ push to master
        │                                               pull_request → master
        │                                                     │
        │                                                     ▼
        │                                         ┌───────────────────────────┐
        │                                         │ workflow: ci.yml          │
        │                                         │ concurrency: cancel stale │
        │                                         │ permissions: contents:read│
        │                                         └───────────┬───────────────┘
        │                                                     ▼
        │                                         ┌───────────────────────────┐
        │                                         │ job: ci  (ubuntu-latest)  │
        │                                         └───────────┬───────────────┘
        │                                                     ▼
        │                                          actions/checkout@v7
        │                                                     ▼
        │                                          actions/setup-node@v7
        │                                          node 24 + cache: npm ──▶ ~/.npm cache
        │                                                     ▼
        │                                          npm ci   (lockfile-exact, 33s)
        │                                                     ▼
        │                                     ┌───────────────┴───────────────┐
        │                                     │  step: npm run typecheck      │  tsc --noEmit      22.6s
        │                                     │  step: npm run lint  (!cancel)│  eslint            23.5s
        │                                     │  step: npm test      (!cancel)│  vitest run        13.9s
        │                                     └───────────────┬───────────────┘
        │                                                     ▼
        │                                          check run "ci" ── red / green
        │                                                     ▼
        │                                         ┌───────────────────────────┐
        │                                         │ repo ruleset on `master`  │  <-- MANUAL, not a file
        │                                         │ require status check "ci" │
        │                                         └───────────┬───────────────┘
        │                                                     ▼
        │                                            merge allowed / blocked
        ▼
  npm test  ──▶ vitest.config.ts
                  include: src/**/*.{test,spec}...
                  exclude: [...configDefaults.exclude, '**/.next/**']
                       │
                       ├──▶ 41 files under src/          ✅ collected
                       └──▶ .next/standalone/src/...     ❌ excluded  (SC-2)
                                │
                                ▼
                         vi.mock("@/db")  ── no Postgres reached, ever
```

Note the two paths converge on the same `vitest.config.ts`: the exclusion must be in the config, not a CI flag, because SC-2 is about "a test run" generally — the developer's local run must also stop double-collecting.

### Recommended Project Structure

```
/
├── package.json              # + "test", + "typecheck"
├── vitest.config.ts          # EXISTS — add include/exclude
├── eslint.config.mjs         # touch only if the ratchet option is chosen
└── .github/
    └── workflows/
        └── ci.yml            # NEW — the entire CI deliverable
```

Do not create `.github/workflows/test.yml` + `lint.yml` + `typecheck.yml`. Three files means three check names to wire into the ruleset and three `npm ci` runs.

### Pattern 1: Extend `configDefaults.exclude`, never replace it

**What:** Vitest's `test.exclude` is an *override*, not an *append*. Writing `exclude: ['**/.next/**']` silently re-enables collection from `node_modules` and `.git`.
**When to use:** Always, when setting `exclude` in any Vitest config.
**Example:**
```ts
// Source: https://vitest.dev/config/ — `configDefaults` export
import { defineConfig, configDefaults } from 'vitest/config'
exclude: [...configDefaults.exclude, '**/.next/**']
```

Verified defaults for the installed 4.0.18 (printed at runtime, not from docs):
```
include: ["**/*.{test,spec}.?(c|m)[jt]s?(x)"]
exclude: ["**/node_modules/**","**/.git/**"]
```

### Pattern 2: Belt-and-braces scoping — `include` anchored at `src/` **and** `exclude`

**What:** `include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)']` is anchored at the project root, so `.next/standalone/src/lib/formula-engine.test.ts` cannot match (its path starts with `.next/`, not `src/`). The `exclude` is then redundant — which is exactly why you want both: CI-02 names `.next/**` and `node_modules/**` explicitly, and a future `scripts/*.test.ts` outside `src/` would otherwise be silently dropped by `include` alone with no diagnostic.
**When to use:** Here. Both are cheap and they fail in different directions.

### Pattern 3: One job, three steps, `if: ${{ !cancelled() }}`

**What:** By default a failed step aborts the job, so a PR with both a lint error and a test failure reports only the lint error. `if: ${{ !cancelled() }}` on the lint and test steps makes all three run and report, while still failing the job.
**When to use:** Any multi-gate CI job. This is the modern replacement for `if: always()` (which also runs on cancellation).
**Example:** see **Code Examples §3**.

### Pattern 4: Branch protection is a documented manual step, not a file

**What:** GitHub has no in-repo representation of "this check is required." CONTEXT.md already anticipates this. The deliverable is (a) the workflow file and (b) written instructions in the repo — `CONTRIBUTING.md` is the natural home, next to the existing "All tests must pass before merge" line at `:114`.
**Current state (verified via API):** `gh api repos/Bittencourt/pipelite/rulesets` → `[]`; `gh api .../branches/master/protection` → `404 Branch not protected`. Default branch is `master`; repo is **public** (so rulesets and branch protection are available at no cost).

### Anti-Patterns to Avoid

- **Copying `npm install --legacy-peer-deps` from the `Dockerfile` into CI.** The Dockerfile needs it because it resolves fresh; CI installs from the committed lockfile. `npm ci` was tested and exits 0 — the `next-auth`/`nodemailer` peer conflict surfaces only as `npm warn`. Using `npm install` in CI also defeats reproducibility.
- **Adding `--max-warnings 0`.** Turns 26 errors into 166 problems. CI-04 does not ask for it.
- **Adding a `services: postgres` container.** Proven unnecessary; adds ~20 s and a new failure mode for zero signal.
- **Workflow-level `paths:`/`paths-ignore:` filters on a required-check workflow.** A workflow skipped by a path filter never reports its check, and the PR sits at "Expected — Waiting for status to be reported" **forever**. Job-level `if:` conditions are safe (a skipped *job* reports success); workflow-level path filters are not. `[CITED: docs.github.com/…/troubleshooting-required-status-checks]`
- **Deleting `.next/standalone/src/lib/formula-engine.test.ts`.** Explicitly forbidden by CONTEXT.md — `.next/` is gitignored build output and regenerates on every `npm run build`.
- **`"test": "vitest"`.** Watch mode. In a TTY it hangs; the developer-facing contract in CI-01 is a one-shot run with a non-zero exit. Use `vitest run`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Excluding build output from collection | A custom `testNamePattern`, a glob helper, or a pretest `rm -rf .next` | `test.exclude` + anchored `test.include` | `rm -rf .next` destroys the dev server's cache and forces a full rebuild; the config is declarative and applies to local runs too. |
| Knowing vitest's default exclude list | Copying an array from a blog post | `import { configDefaults } from 'vitest/config'` and spread it | The defaults changed in v4 (`**/dist/**` was dropped). A hardcoded copy silently rots. |
| Resolving `@/` in tests | A custom vite plugin, or rewriting imports to relative paths | The existing 4-line `resolve.alias` in `vitest.config.ts` | It already works across all 41 files. |
| npm dependency caching in CI | A hand-rolled `actions/cache` step keyed on `package-lock.json` | `actions/setup-node@v7` with `cache: 'npm'` | The action caches the **global npm cache**, not `node_modules`, so it is reusable across Node versions and cannot produce a corrupt half-installed tree. `[CITED: actions/setup-node docs/advanced-usage.md]` |
| "Require checks only if they ran" | A bot / `wait-for-status-checks` action / a skip-guard job | Don't create the problem — no path filters on the CI workflow | The whole class of workaround exists only to undo path filtering. With no filters, the check always runs. |
| Detecting whether tests need a database | Reading the code and guessing | `env -u DATABASE_URL npx vitest run` | `src/db/index.ts` throws on a missing `DATABASE_URL`, which turns "does anything touch the DB?" into a one-command experiment. |

**Key insight:** Every "custom solution" temptation in this phase is a workaround for a config option that already exists. The phase's entire novel surface is one YAML file.

## Common Pitfalls

### Pitfall 1: Setting `test.exclude` silently re-enables `node_modules`

**What goes wrong:** `exclude: ['**/.next/**']` replaces the default array. Vitest then walks `node_modules`, collecting thousands of vendored `*.test.js` files. The run takes minutes and fails in bizarre ways.
**Why it happens:** Most config keys in the Vite/Vitest world feel additive; `exclude` is not.
**How to avoid:** `exclude: [...configDefaults.exclude, '**/.next/**']`.
**Warning signs:** Suite duration jumps from ~14 s to minutes; file count is in the hundreds; failures name packages you never wrote.

### Pitfall 2: A required check that never reports blocks every PR forever

**What goes wrong:** The workflow is given `on: pull_request: paths: ['src/**']`. A docs-only PR skips the workflow, the required check `ci` never reports, and the PR shows "Expected — Waiting for status to be reported" with no way to merge.
**Why it happens:** GitHub treats "required" as "must report success," and a skipped *workflow* reports nothing. A skipped *job* (via `if:`) does report success — the distinction is easy to miss.
**How to avoid:** No `paths:`/`paths-ignore:` on this workflow. The full run is ~95 s; there is nothing to optimise.
**Warning signs:** PRs stuck at "Expected"; the Checks tab shows no run for the required name.

### Pitfall 3: The required check can't be selected until it has run once

**What goes wrong:** Someone tries to configure the ruleset before merging the workflow file. GitHub's check-name picker only surfaces checks it has recently observed, so `ci` isn't in the list.
**Why it happens:** GitHub populates the picker from recent check runs on the repo.
**How to avoid:** Sequence the plan as: (1) merge `ci.yml` to `master` so at least one run exists, (2) *then* create the ruleset requiring `ci`, (3) *then* verify with a throwaway PR. This ordering constraint is real and belongs in the task list, not in a footnote.
**Warning signs:** Empty or missing entry in the "Status checks that are required" search box.

### Pitfall 4: A failing first step hides the other two gates

**What goes wrong:** `typecheck` fails, so `lint` and `test` never run. The contributor fixes the type error, pushes, and *then* discovers the lint error. Three round trips for one PR.
**Why it happens:** GitHub Actions aborts a job at the first failing step by default.
**How to avoid:** `if: ${{ !cancelled() }}` on the lint and test steps. The job still fails; it just reports everything.
**Warning signs:** Contributors complaining about ping-pong CI.

### Pitfall 5: Assuming `tsc --noEmit` needs a Next.js build first

**What goes wrong:** Someone adds `npm run build` before `tsc` in CI "because `tsconfig.json` includes `.next/types/**/*.ts` and `next-env.d.ts` is gitignored." That triples CI time and needs a dummy `DATABASE_URL`.
**Why it happens:** It is a genuinely plausible failure mode — `next-env.d.ts` *is* in `.gitignore`, and the tsconfig `include` *does* reference `.next/types`.
**How to avoid / evidence:** It was tested. A `git worktree` checkout with **no** `.next/`, **no** `next-env.d.ts`, and **no** `tsconfig.tsbuildinfo` runs `npx tsc --noEmit` to **exit 0** in 22.6 s. TypeScript tolerates non-matching `include` globs, and the Next types resolve from `node_modules`. **No build step is needed.**
**Warning signs:** CI job duration > 3 min; a `DATABASE_URL` dummy appearing in the workflow.

### Pitfall 6: Node 20 in CI is below vite's floor

**What goes wrong:** The workflow uses `node-version: 20` to match `Dockerfile: node:20-alpine`. `vite@7.3.1` declares `engines: ^20.19.0 || >=22.12.0`; `node:20-alpine` tags below 20.19 (and any `node-version: 20` resolution that lands below it) break vitest with confusing module errors.
**Why it happens:** The Node floor comes from vite (transitive), not from `next` (`>=20.9.0`) or `vitest` (`^20.0.0 || ...`) — so reading the obvious `engines` fields gives the wrong answer.
**How to avoid:** `node-version: 24` — current Active LTS (EOL 2028-04-30), matches the developer's local `v24.13.1`, comfortably above every floor.
**Note:** `Dockerfile` pinning `node:20-alpine` and `CONTRIBUTING.md:13` saying "Node.js 18+" are both stale relative to vite's floor. Neither is in this phase's scope, but the `CONTRIBUTING.md` line is worth a one-word fix while that file is already being edited for the branch-protection docs.

### Pitfall 7: `vi.clearAllMocks()` does not restore implementations

**What goes wrong:** Someone "fixes" `deleteWorkflow` by stubbing `mockDb.select` in a `beforeEach`, then is surprised when a *later* test in the file inherits it. `vi.clearAllMocks()` calls `mockClear()`, which resets call history but **not** implementations set via `mockReturnValue`.
**Why it happens:** `clearAllMocks` / `resetAllMocks` / `restoreAllMocks` have three different semantics.
**How to avoid:** Stub `mockDb.select` **inside** each `deleteWorkflow` test, as the verified fix above does. Don't hoist it.
**Warning signs:** A test passes in isolation but fails when the file runs in order (or vice versa).

## Code Examples

### 1. `package.json` scripts (satisfies CI-01)

```jsonc
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",   // NEW — CI-04 needs a named script
    "test": "vitest run",          // NEW — CI-01; `run` = one-shot, non-zero exit on failure
    "test:watch": "vitest"         // optional convenience
    // ...db:* unchanged
  }
}
```

### 2. `vitest.config.ts` — modify the existing file (satisfies CI-02)

```ts
// Source: https://vitest.dev/config/  (configDefaults verified at runtime for vitest 4.0.18)
import { defineConfig, configDefaults } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: false,          // unchanged — every test file imports from 'vitest' explicitly
    environment: 'node',     // unchanged — there are ZERO *.test.tsx files; jsdom is not needed
    include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: [...configDefaults.exclude, '**/.next/**'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },   // unchanged — already resolves @/db, @/auth, @/lib/*
  },
})
```

**Verified result of exactly this config** (with both test fixes applied, on a fresh `npm ci`):
`Test Files 41 passed (41)` · `Tests 454 passed | 4 skipped (458)` · exit 0 · 13.9 s.

`environment: 'node'` is correct and must not be changed: `find src -name "*.test.tsx"` returns **0** files. (`docs/development/testing.md` shows a `@testing-library/react` example, but that package is not installed and no test uses it — the doc is aspirational.)

### 3. `.github/workflows/ci.yml` (satisfies CI-04)

```yaml
# Source: https://github.com/actions/setup-node (v7.0.0, 2026-07-14)
#         https://github.com/actions/checkout  (v7.0.1, 2026-07-20)
name: CI

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]
  # NOTE: deliberately no `paths:` filter — see Pitfall 2.

# Least privilege: this job only reads code.
permissions:
  contents: read

# Supersede in-flight runs for the same ref; saves minutes on rapid pushes.
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  ci:                      # <-- this job name becomes the required check name
    name: ci
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version: 24        # Active LTS; >= vite's ^20.19.0 || >=22.12.0 floor
          cache: npm              # caches the GLOBAL npm cache, keyed on package-lock.json

      - name: Install dependencies
        run: npm ci               # verified: exit 0, no --legacy-peer-deps needed

      - name: Typecheck
        run: npm run typecheck

      - name: Lint
        if: ${{ !cancelled() }}   # report all three gates in one run — see Pitfall 4
        run: npm run lint

      - name: Test
        if: ${{ !cancelled() }}
        run: npm test
```

No `env: DATABASE_URL`, no `services:` — proven unnecessary (see *Does CI Need a Postgres Service Container?*).

### 4. The manual branch-protection step (satisfies SC-4) — document, don't automate

Must happen **after** `ci.yml` has run at least once on `master` (Pitfall 3).

Repo settings path: **Settings → Rules → Rulesets → New branch ruleset**
- Name: `master protection`
- Enforcement status: **Active**
- Target branches: **Include default branch**
- Rules: ✅ **Require status checks to pass** → add check **`ci`** (source: GitHub Actions)
- Rules: ✅ **Require a pull request before merging** (otherwise a direct push to `master` bypasses the gate entirely)
- Optional: ✅ *Require branches to be up to date before merging* — safer, but forces a rebase+rerun per merge

Equivalent for auditing/verification via CLI:
```bash
gh api repos/Bittencourt/pipelite/rulesets                       # today: []
gh api repos/Bittencourt/pipelite/branches/master/protection     # today: 404 Branch not protected
```

The verification for SC-4 is behavioural, not file-based: open a throwaway PR that introduces a deliberate type error (or a lint error, or a failing assertion), confirm the `ci` check goes red and the merge button is blocked, then close the PR.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `next lint` | Call `eslint` directly | Next.js 16 (removed) | Project already does this — `"lint": "eslint"`. No change needed. |
| `.eslintrc.json` | Flat config `eslint.config.mjs` | ESLint 9 | Already migrated. |
| `vitest` default exclude included `**/dist/**` | v4 default exclude is only `["**/node_modules/**","**/.git/**"]` | Vitest 4 | Anyone extending `configDefaults.exclude` from memory will get it wrong. Verified at runtime. |
| `vitest.workspace.ts` | `test.projects` in a single config | Vitest 4 | Not needed here — single project. |
| `actions/checkout@v4`, `setup-node@v4` | `@v7` / `@v7` | 2026-07 | v5 of setup-node moved to node24 runtime and requires runner ≥ 2.327.1; v7 adds `cache-primary-key`/`cache-matched-key` outputs and ESM migration. GitHub-hosted runners are current, so no constraint. |
| `if: always()` | `if: ${{ !cancelled() }}` | GitHub Actions | `always()` also runs on cancellation, wasting minutes and confusing check state. |
| Classic branch protection | Repository **rulesets** | GitHub, 2023→ | Rulesets are the modern path (layerable, bypass lists, available on public repos). Classic protection still works; either satisfies SC-4. |
| Node 22 Active LTS | **Node 24 Active LTS** (EOL 2028-04-30); Node 22 in Maintenance (EOL 2027-04-30) | Oct 2025 | Pick 24. Also: from Oct 2026 Node moves to one major/year. |

**Deprecated/outdated in this repo:**
- `--reporter=basic` — **removed** in Vitest 3+. Attempting `npx vitest run --reporter=basic` fails with `Failed to load custom Reporter from basic`. Use `default`, `dot`, or `verbose`. (Encountered during this research; worth knowing before anyone adds a reporter flag to CI.)
- `CONTRIBUTING.md:13` "Node.js 18+" — below vite 7's `^20.19.0` floor.
- `Dockerfile` `node:20-alpine` — at/below vite's floor depending on the resolved patch. Out of this phase's scope but a latent build risk.
- `docs/development/testing.md` references `@testing-library/react`, which is not installed and unused.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `ubuntu-latest` GitHub-hosted runners build `argon2`'s native binding (or fetch its prebuild) without extra apt packages | Code Examples §3 | `npm ci` fails in CI. Locally `npm ci` **with** install scripts ran clean on linux-x64 in 32 s, and GitHub's runners are the same arch/OS family — but this was not executed on a runner. Mitigation: the first CI run proves or disproves it in ~1 min. |
| A2 | `quickjs-emscripten` (WASM) loads on the CI runner exactly as locally | Validation Architecture | 57 formula-engine tests fail. Low risk — WASM is arch-independent. |
| A3 | Node 24 is the right CI pin vs. matching the Dockerfile's Node 20 | Standard Stack / Pitfall 6 | If the team wants CI to mirror the production image, Node 24 hides Node-20-specific breakage. Counter-argument: the Docker image is built by `next build`, not by `vitest`, and CI here gates source correctness, not the image. Worth 30 seconds of confirmation. |
| A4 | Fixing all 26 eslint errors is in scope for Phase 32 rather than deferred | The eslint Gate Is Not Free | This is the phase's biggest scope question. CI-04 requires eslint to gate merges; a red-from-day-one gate is not a gate. **The planner should treat this as a decision requiring confirmation, not an assumption.** |
| A5 | Rulesets (not classic branch protection) are the preferred mechanism | Code Examples §4 | None functionally — both satisfy SC-4. Rulesets are GitHub's current direction. |
| A6 | `if: ${{ !cancelled() }}` is supported on steps in current GitHub Actions | Pattern 3 / Code Examples §3 | If unsupported, fall back to `if: always()`. `cancelled()` is a documented status-check function; step-level `if` is standard. Low risk. |
| A7 | The intended semantics of `usesNullSafeFunction` is what the helper's own docstring says | Diagnosis, Failure 1 | If the author actually intended null-propagation to win over null-safe functions, the *test* would be wrong instead. Evidence strongly favours the source-bug reading: the helper exists, is documented for exactly this case, is computed, and is unused. And the verified fix keeps `propagates null values` green. |

## Open Questions (RESOLVED)

All four were resolved before planning locked. Resolutions are recorded inline below.

1. **Does Phase 32 absorb all 26 eslint errors, or ratchet?** — **(RESOLVED — user decision, CONTEXT.md D-01/D-02/D-03)**: fix the 21 mechanical errors properly; scoped `eslint-disable-next-line ... -- reason` for the 5 React Compiler errors; hard-fail lint gate, no ratchet. Implemented by plans 32-03 and 32-04.
   - What we know: exact rule/file/line breakdown above; 21 are mechanical, 5 are React Compiler refactors touching `reset-password`, `verify-email`, `profile-settings-form`, `relative-time`, `import-wizard`.
   - What's unclear: whether touching 5 UI components' effect logic is acceptable inside an infrastructure phase.
   - Recommendation: fix the 21 mechanical errors; add `// eslint-disable-next-line <rule> -- <reason>` for the 5 React Compiler errors with a backlog item for a proper fix. Keeps the gate real and the phase bounded.

2. **Does `deleteWorkflow`'s cascade path need its own test, or is the minimal mock stub enough?** — **(RESOLVED — user decision, CONTEXT.md D-06)**: add the cascade test. Implemented by plan 32-02.
   - What we know: SC-3 says "including `mutations/workflows.test.ts > deleteWorkflow` (**the cascade-delete path**)". The minimal stub returns `[]` runs, so the cascade branch stays uncovered.
   - Recommendation: add the second test (written and verified above — 23/23 green). It is ~14 lines and is what SC-3 literally asks for.

3. **Should CI also run `npm run build`?** — **(RESOLVED — out of scope)**: no. CI-04 names only tsc + eslint + test. Plans 32-05/32-06 ship exactly those three gates.
   - What we know: CI-04 names only tsc + eslint + test. `next build` needs a dummy `DATABASE_URL` (the Dockerfile does exactly this) and adds minutes.
   - Recommendation: **no**, out of scope. Note as a candidate for a future phase.

4. **`Dockerfile` pins `node:20-alpine`, below vite 7's `^20.19.0` floor.** — **(RESOLVED — out of scope, backlogged)**: captured as backlog item 999.13 by plan 32-05. CI pins Node 24 and does not inherit the Dockerfile's tag.
   - What we know: it currently builds (the running container is 5 days old), so the tag is resolving ≥ 20.19 today. `next build` may not exercise vite at all.
   - Recommendation: out of scope; capture as backlog. Do not let it pull Node 20 into the CI workflow.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | vitest, tsc, eslint | ✓ | v24.13.1 | — |
| npm | `npm ci` in CI | ✓ | 11.10.0 | — |
| `package-lock.json` | `npm ci` + `cache: npm` | ✓ | 623 KB, committed | none needed |
| `pnpm-lock.yaml` / `yarn.lock` | — | ✗ | — | n/a — npm is unambiguously the package manager |
| `.npmrc` (repo / user / global) | — | ✗ | — | none needed; `npm ci` works without one |
| `vitest` | test runner | ✓ | 4.0.18 | — |
| `typescript` | typecheck gate | ✓ | 5.9.3 | — |
| `eslint` + `eslint-config-next` | lint gate | ✓ | 9.39.3 / 16.1.6 | — |
| GitHub repo `Bittencourt/pipelite` | CI-04 | ✓ | public, default branch `master` | — |
| GitHub Actions enabled | CI-04 | ✓ | `{"enabled":true,"allowed_actions":"all","sha_pinning_required":false}` | — |
| Existing rulesets / branch protection | SC-4 | ✗ | `[]` / `404 Branch not protected` | none — the phase creates it (manual step) |
| `gh` CLI (authenticated) | verifying SC-4 | ✓ | logged in as `Bittencourt` | GitHub web UI |
| PostgreSQL | **nothing in this phase** | ✓ (running on :5433) | postgres:16-alpine | **irrelevant — proven that no test touches it** |
| `DATABASE_URL` in test env | **nothing** | ✗ (unset in shell) | — | none needed; suite is identical with it unset |
| `.github/workflows/` | CI-04 | ✗ | — | none — the phase creates it |

**Missing dependencies with no fallback:** none. Every tool this phase requires is installed and working.
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.0.18 (`environment: node`, `globals: false`) |
| Config file | `vitest.config.ts` — **exists** at repo root (commit `1eeae14`), needs `include`/`exclude` added |
| Quick run command | `npx vitest run src/lib/formula-engine.test.ts src/lib/mutations/workflows.test.ts` (~2 s) |
| Full suite command | `npm test` (= `vitest run`) — 13.9 s, 41 files, 458 tests |
| Typecheck command | `npm run typecheck` (= `tsc --noEmit`) — 22.6 s cold |
| Lint command | `npm run lint` (= `eslint`) — 23.5 s |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CI-01 | `npm test` runs the full suite and exits 0 | smoke | `npm test; echo $?` → `0` | ✅ (script is the deliverable) |
| CI-01 | `npm test` exits non-zero on any failure | smoke | Temporarily break one assertion → `npm test; echo $?` → `1`. (Already demonstrated: the pre-fix suite exits 1.) | ✅ |
| CI-02 | Nothing is collected from `.next/**` | smoke | `npm test 2>&1 \| grep -c '\.next/'` → `0`; and `Test Files ... (41)` not `(42)` | ✅ |
| CI-02 | Nothing is collected from `node_modules/**` | smoke | `npm test 2>&1 \| grep -c 'node_modules/'` → `0` | ✅ |
| CI-03 | `formula-engine.test.ts > LOGIC.isBlank` passes | unit | `npx vitest run src/lib/formula-engine.test.ts -t "isBlank"` | ✅ `src/lib/formula-engine.test.ts:107` |
| CI-03 | Null propagation for arithmetic still returns null (regression guard) | unit | `npx vitest run src/lib/formula-engine.test.ts -t "propagates null"` | ✅ `src/lib/formula-engine.test.ts:42` |
| CI-03 | `workflows.test.ts > deleteWorkflow` passes | unit | `npx vitest run src/lib/mutations/workflows.test.ts -t "deletes existing workflow"` | ✅ `src/lib/mutations/workflows.test.ts:444` |
| CI-03 | The cascade branch (`runs.length > 0`) deletes steps, then runs, then the workflow | unit | `npx vitest run src/lib/mutations/workflows.test.ts -t "cascades"` | ❌ **Wave 0** — new test, verified writable (23/23 green) |
| CI-03 | Whole suite green | integration | `npm test` → `41 passed (41)` / `454 passed \| 4 skipped` | ✅ |
| CI-04 | `tsc --noEmit` gate is green | smoke | `npm run typecheck; echo $?` → `0` | ✅ already passes, even on a clean checkout |
| CI-04 | `eslint` gate is green | smoke | `npm run lint; echo $?` → `0` | ❌ **currently 1 — 28 errors.** Blocking; see the eslint section |
| CI-04 | CI runs all three on push and PR | manual | Push a branch; `gh run list --workflow=ci.yml` shows a run | ❌ Wave 0 — `.github/workflows/ci.yml` |
| CI-04 | A failing check blocks merge | manual-only | Open a PR with a deliberate type error; confirm `ci` is red and merge is blocked; `gh api repos/Bittencourt/pipelite/rulesets` is non-empty. **Manual because branch protection is a server-side repo setting with no in-repo representation and no local proxy.** | ❌ Wave 0 — ruleset |

### Sampling Rate

- **Per task commit:** `npx vitest run <the touched test file>` (~2 s) plus `npm run lint <touched files>`
- **Per wave merge:** `npm run typecheck && npm run lint && npm test` (~60 s total)
- **Phase gate:** all three green from a clean checkout (`git clone` or `git worktree add` + `npm ci`) before `/gsd:verify-work`, **plus** the manual PR check for SC-4

### Wave 0 Gaps

- [ ] `package.json` — add `"test": "vitest run"` and `"typecheck": "tsc --noEmit"` (CI-01, CI-04)
- [ ] `vitest.config.ts` — add `include` + `exclude` (CI-02)
- [ ] `src/lib/formula-engine.ts` — hoist + wire `usesNullSafeFunction`; delete dead `hasArithmetic`; `prefer-const` on `processedExpr:210` (CI-03)
- [ ] `src/lib/mutations/workflows.test.ts` — stub `mockDb.select` in `deletes existing workflow`; **add** the `cascades to run steps and runs` test (CI-03)
- [ ] **26 eslint errors across 20 files** — the phase's real workload (CI-04). See the decision in Open Question 1.
- [ ] `.github/workflows/ci.yml` — new (CI-04)
- [ ] `CONTRIBUTING.md` — document the branch-protection rule to enable; optionally correct "Node.js 18+" → "Node.js 20.19+ / 24 LTS"
- [ ] Manual: create the ruleset **after** `ci.yml` has run once on `master` (Pitfall 3)

*Framework install: none required — vitest 4.0.18 is already a devDependency.*

## Security Domain

This phase ships no application code paths, no user input handling, and no data storage. The relevant security surface is **supply chain and CI privilege**.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth code touched |
| V3 Session Management | no | No session code touched |
| V4 Access Control | **yes (meta)** | Branch protection / ruleset *is* the access control this phase delivers — it governs who can land code on `master`. Also enable "Require a pull request before merging", otherwise a direct push bypasses the gate entirely. |
| V5 Input Validation | no | No new input surface |
| V6 Cryptography | no | None introduced |
| V14 Configuration | **yes** | Workflow `permissions:`, action version pinning, cache scope, secret exposure |

### Known Threat Patterns for GitHub Actions + npm

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Over-privileged `GITHUB_TOKEN` (default is often write) | Elevation of Privilege | `permissions: contents: read` at workflow level — included in the recommended workflow |
| `pull_request_target` running fork code with secrets | Elevation of Privilege | Use `pull_request` (not `_target`). Fork PRs then run with a read-only token and no secrets. The recommended workflow uses `pull_request`. |
| Malicious/compromised third-party action | Tampering | Only two actions, both first-party GitHub (`actions/checkout`, `actions/setup-node`). Repo does not enforce SHA pinning (`sha_pinning_required: false`), so `@v7` is acceptable; full-SHA pinning is the hardened option. |
| npm cache poisoning via post-install scripts | Tampering | `actions/setup-node` docs recommend disabling automatic caching **when publishing packages** (token exposure risk). This workflow does not publish and holds no npm token, so `cache: npm` is safe here. For read-only hardening, `actions/cache/restore@v5` is the alternative. `[CITED: actions/setup-node docs/advanced-usage.md]` |
| Lockfile drift / dependency confusion | Tampering | `npm ci` (lockfile-exact, fails on lockfile/manifest mismatch) rather than `npm install`. Verified working. |
| Secret leakage into logs | Information Disclosure | The job needs **no secrets** — no `DATABASE_URL`, no service containers. Keep it that way. |
| Merge gate bypass by direct push | Elevation of Privilege | Ruleset must include "Require a pull request before merging" in addition to the required status check. |

> Informational, not this phase's scope: `npm ci` reports **39 vulnerabilities (3 low, 9 moderate, 23 high, 4 critical)** in the current lockfile. CI-04 does not ask for `npm audit`, and adding an `npm audit --audit-level=high` step would fail the build on day one. Worth a backlog item; do **not** silently add it to this workflow.

## Project Constraints (from CLAUDE.md / project memory)

There is no `./CLAUDE.md` at the repo root. The following binding directives come from the user's project memory and apply to any execution work in this phase:

- **Docker is the dev environment. Never run `npm run dev`, `pnpm dev`, `next dev`, or any local dev server.** Nothing in this phase requires one — `vitest`, `tsc`, and `eslint` are all standalone processes.
- App runs at `http://localhost:3001`; Postgres at `localhost:5433`; all `docker` commands need `sudo`. **Not needed by this phase** — the suite is fully mocked and does not touch Postgres.
- Server-action return shape is `{ success: true/false, error/id }` — relevant only in that `deleteWorkflow` returns `{ success: true }` / `{ success: false, error }`, which the fixed tests must continue to assert.
- Migrations run via `npx drizzle-kit migrate`. **No migration in this phase.**

Also binding from the repo itself:
- `CONTRIBUTING.md:111` — "Run existing tests before submitting PR: `npm test`". This phase makes that instruction true for the first time.
- `.gitignore` contains `/.next/`, `next-env.d.ts`, `*.tsbuildinfo` — all three were confirmed absent from a clean checkout, and `tsc` still passes.

## Sources

### Primary (HIGH confidence — executed in this session)
- `npx vitest run` on the repo, and on a clean `git worktree` + fresh `npm ci` — baseline failures, failure output, exclude behaviour, post-fix green run
- `env -u DATABASE_URL npx vitest run` — proof that no test needs a live Postgres
- `node -e "import { configDefaults } from 'vitest/config'"` — actual `include`/`exclude` defaults for vitest 4.0.18
- `npx tsc --noEmit` in a clean worktree with no `.next/`, no `next-env.d.ts`, no `tsbuildinfo` — exit 0, 22.6 s
- `npx eslint` and `npx eslint --fix --quiet` — 28 → 26 errors, full rule/file/line breakdown
- `npm ci` (with and without `--ignore-scripts`) in a clean worktree — exit 0, no `--legacy-peer-deps` needed
- Direct reads: `package.json`, `tsconfig.json`, `eslint.config.mjs`, `.gitignore`, `docker-compose.yml`, `Dockerfile`, `CONTRIBUTING.md`, `src/db/index.ts`, `src/lib/formula-engine.ts`, `src/lib/formula-engine.test.ts`, `src/lib/mutations/workflows.ts`, `src/lib/mutations/workflows.test.ts`
- `node -e` on installed `package.json` `engines` fields — the Node floor
- `gh api repos/actions/checkout/releases/latest`, `gh api repos/actions/setup-node/releases/latest` — v7.0.1 / v7.0.0
- `gh api repos/Bittencourt/pipelite` + `/rulesets` + `/branches/master/protection` + `/actions/permissions` — public repo, `master` default, no rulesets, no protection, Actions enabled
- Candidate fixes **applied and run** in a disposable `git worktree` (since removed; working tree verified clean)

### Secondary (MEDIUM confidence — official docs, read this session)
- `actions/setup-node` `docs/advanced-usage.md` — `cache: npm` caches the global npm cache; cache-poisoning guidance; `package-manager-cache` input
- `actions/setup-node` v7.0.0 and `actions/checkout` v7.0.1 release notes (GitHub API)
- GitHub Docs — *Available rules for rulesets* (require status checks, strict/loose up-to-date)
- GitHub Docs — *Troubleshooting required status checks* (skipped workflows leave checks pending forever)
- vitest.dev/config — confirms `configDefaults` is the supported way to read defaults (it does not publish the values, hence the runtime check)

### Tertiary (LOW confidence — search results, cross-checked)
- Node.js release-schedule summaries (Node 24 Active LTS to 2028-04-30; Node 22 Maintenance to 2027-04-30; one-major-per-year from Oct 2026) — corroborated across multiple sources, and the practical decision only depends on the vite `engines` floor, which was verified directly
- Community discussions on path-filtered required checks — corroborated by the official troubleshooting doc above

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — nothing new is installed; every version read from `node_modules`, every action tag from the GitHub API
- Vitest config: **HIGH** — defaults printed at runtime; the exact proposed config was executed and produced 41/41 green
- Failure diagnosis: **HIGH** — both failures reproduced with full stack traces, both root causes traced to specific lines, both candidate fixes executed and verified green including the regression guard
- No-database conclusion: **HIGH** — proven two independent ways
- CI workflow shape: **MEDIUM-HIGH** — every command in it was run locally on a clean checkout; the workflow file itself has not executed on a GitHub runner (see A1)
- eslint scope: **HIGH** on the numbers (measured), **LOW** on the policy decision (needs a human call — see A4 / Open Question 1)
- Pitfalls: **HIGH** for 1, 5, 6, 7 (measured); **MEDIUM** for 2, 3, 4 (official docs + community corroboration)

**Research date:** 2026-08-13
**Valid until:** 2026-09-12 (30 days). The empirical findings about *this repo* do not decay; the GitHub Actions versions and Node LTS status are the parts worth re-checking. Re-verify immediately if anyone runs `npm update` or lands work touching `formula-engine.ts` or `mutations/workflows.ts`.
