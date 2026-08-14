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

</deferred>
