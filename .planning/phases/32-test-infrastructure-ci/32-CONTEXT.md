# Phase 32: Test Infrastructure & CI - Context

**Gathered:** 2026-08-13
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — no user-facing grey areas)

<domain>
## Phase Boundary

A regression cannot reach master unnoticed — one command runs the whole suite, the suite is green, and CI blocks merges that break it.

In scope:
- A `test` script in `package.json` that runs the full suite once and exits non-zero on failure
- A vitest config that scopes collection to source tests only (excludes `.next/**`, `node_modules/**`)
- Repairing the two known-failing tests: `mutations/workflows.test.ts > deleteWorkflow` (cascade-delete path) and `formula-engine.test.ts > LOGIC.isBlank`
- A CI pipeline that runs typecheck + lint + test on pull requests as a required check

Out of scope:
- Writing new feature tests (later phases own their own coverage)
- E2E/browser testing infrastructure
- Coverage thresholds or reporting dashboards

</domain>

<decisions>
## Implementation Decisions

### Lint Gate Scope
- **D-01**: Phase 32 fixes the 21 mechanical eslint errors properly — `no-explicit-any` (12), `no-unescaped-entities` (8), `no-unsafe-function-type` (1). No blanket suppressions for these.
- **D-02**: The 5 React Compiler errors (3 × `react-hooks/set-state-in-effect`, 1 × `preserve-manual-memoization`, 1 × immutability) get scoped `// eslint-disable-next-line <rule> -- <reason>` comments with a written reason, not a rule-level disable. They touch effect logic in 5 UI components; a real fix is backlogged, not attempted here.
- **D-03**: The lint gate is a hard failure in CI (`eslint` must exit 0). No warn-only ratchet, no baseline file — SC-4 means a PR with a lint error genuinely cannot merge.

### Test Repairs
- **D-04**: `formula-engine.ts > LOGIC.isBlank` is a SOURCE bug, not a test bug — the `usesNullSafe` result at `formula-engine.ts:164` is computed and discarded, so the null-propagation guard short-circuits before QuickJS sees the expression. Fix the source; keep the existing `propagates null values` regression guard passing.
- **D-05**: `mutations/workflows.test.ts > deleteWorkflow` is a STALE TEST — `db.select()` is never stubbed. Fix by stubbing `mockDb.select`.
- **D-06**: Additionally add a new test covering the cascade-delete branch (asserting 3 delete calls). SC-3 names that path explicitly; repairing the mock alone leaves it uncovered.

### Merge Gate Enforcement
- **D-07**: The `master` branch ruleset uses **option B** — require a pull request (0 approvals required) AND require the `ci` status check, WITH a single repository-admin bypass actor (`bypass_mode: always`). Chosen so the GSD loop can keep committing directly to `master` for the remaining v1.3 phases while the gate stays real for any future contributor or fork. The residual risk (an admin can land untested code on `master`) is knowingly accepted and must be stated plainly in `CONTRIBUTING.md`.

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Constraints that follow from the codebase and ROADMAP success criteria:

- **Runner:** vitest — already a devDependency, and all 41 existing test files are vitest-style.
- **CI provider:** GitHub Actions — `origin` is `https://github.com/Bittencourt/pipelite.git`, and SC-4 requires a "red required check" on a pull request, which is GitHub's branch-protection model.
- **Suite scoping:** the stale `.next/standalone/src/lib/formula-engine.test.ts` copy must be excluded via vitest `exclude`, not deleted — `.next/` is build output and will regenerate.
- **Test failures:** fix the source or the test, whichever is actually wrong — determine per test during execution; do not skip or delete a failing test to make the suite green.
- Branch protection itself is a repo setting, not a file — the phase delivers the workflow file and documents the protection rule to enable.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `vitest` already in devDependencies — no runner selection needed
- 41 existing `*.test.ts(x)` files under `src/`, concentrated in `src/lib/execution/`, `src/lib/triggers/`, `src/lib/mutations/`
- `lint` script already exists (`eslint`, with `eslint-config-next`)

### Established Patterns
- Tests colocated next to source (`foo.test.ts` beside `foo.ts`) and in `__tests__/` directories — the config must collect both
- Mutation-layer tests (`src/lib/mutations/*.test.ts`) exercise DB operations; check whether they mock Drizzle or need a live Postgres before deciding whether CI needs a service container
- Docker is the dev environment (Postgres on `localhost:5433`); CI must not assume a running local stack

### Integration Points
- `package.json` scripts — add `test` (and likely `typecheck`)
- New `vitest.config.ts` at repo root
- New `.github/workflows/*.yml`
- No CI configuration exists today (`.github/workflows/` absent)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. The four ROADMAP success criteria are the spec.

</specifics>

<deferred>
## Deferred Ideas

- Coverage reporting / thresholds — not required by any v1.3 requirement
- E2E test infrastructure — no requirement in this milestone
- Proper fix for the 5 React Compiler lint errors (suppressed with reasons in this phase per D-02) — belongs in a UI-focused phase with UI coverage
- The 140 eslint *warnings* — only errors gate CI in this phase

</deferred>
