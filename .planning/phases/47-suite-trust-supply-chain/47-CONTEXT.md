# Phase 47: Suite Trust & Supply Chain - Context

**Gathered:** 2026-08-25
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous)

<domain>
## Phase Boundary

A red test run means a defect, and the project has a stated, enforceable position on the advisories in
its own committed lockfile.

In scope: the two wall-clock assertions that fail under parallel workers (`condition-evaluator.test.ts`'s
linearity gate and `toggle.test.ts:61`'s `beforeEach`), a repeatability proof over the full suite, a
triaged disposition for every critical/high advisory in `package-lock.json`, and a CI audit policy that
can actually fail.

Out of scope: the **cold `auth.setup.ts` flake** (30.1 s vs 1.9 s on retry) recorded in `BACKLOG.md`.
It is a second, independent flake source and is explicitly NOT v1.4 scope. Do not let it be mistaken
for `QG-01`, and do not let its presence justify weakening the repeatability criterion.

</domain>

<decisions>
## Implementation Decisions

### QG-01 is ONE item, not two
- `999.28` (`condition-evaluator.test.ts`, Phase 34 T-34-20) and `D-45-01` (`toggle.test.ts:61`) are the
  **same defect class** — a wall-clock margin that passes alone and fails under vitest's own workers.
  Phase 45 explicitly said to fix them together and warned *"do not chase either one per-phase."*
  Plan them as one item with one shared proof.

### How the timing assertions are replaced
- **Assert operation counts or algorithmic shape — never elapsed time, and never a ratio of elapsed
  times.** SC-2 requires that reintroducing a backtracking `resolveFieldPath` makes the replacement go
  red; only a count/shape assertion can do that deterministically under load.
- **Marking the test serial-only is REJECTED.** It would keep a timing assertion alive, merely hidden
  from contention — the property would then be "defended" by a gate whose failure mode is the machine's
  load rather than the code's behaviour. It also rots: the next person to parallelise the suite
  reintroduces the flake. Fix the assertion, do not quarantine it.
- **Raising `hookTimeout` is REJECTED** for `toggle.test.ts` for the same reason `retries: 1` is
  rejected below: it makes the symptom rarer without touching the cause. Find why the `beforeEach`
  costs ~3.75 s of a 10 s budget and make the setup deterministic and cheap. If the cost is real and
  irreducible, that is a finding to state plainly, not to paper over with a bigger number.
- **`retries: 1` is REJECTED as a way to close QG-01** — the requirement says so explicitly. A retry
  converts a reproducible failure into an invisible one, which is the precise mechanism by which the
  three defects Phase 44 repaired stayed hidden.

### The property must still be defended, provably
- The replacement assertion is itself verified by **reintroducing a backtracking implementation on
  purpose and watching it go red**, then reverting. Recorded verbatim in the SUMMARY. An assertion that
  survives load by asserting nothing is the failure mode this phase exists to prevent — a green suite
  is not evidence that the replacement works.

### Repeatability proof (SC-1)
- **Ten consecutive full-suite runs at the DEFAULT parallel worker count** must produce the same pass
  set. Not ten runs of the two files; not ten serial runs; not a reduced worker count. The point is the
  configuration developers and CI actually use.
- Compare **pass sets**, not just exit codes — a run that passes a different set of tests is not the
  same result. Record per-run pass/fail/skip counts and diff the sets.
- If the out-of-scope `auth.setup.ts` flake perturbs a run, record it explicitly as the known
  out-of-scope source rather than silently re-running until the numbers agree.

### SEC-05 — advisory disposition
- **Re-measure at plan time.** The `4 critical / 22 high` figure is from 2026-08-24 and is context, not
  the requirement. The requirement is that every critical and high advisory has a *recorded decision*.
- Each one gets exactly one disposition: **upgraded**, **replaced**, or **accepted with a stated
  reason**. "Accepted" must name why the advisory does not apply to this project's usage — a bare
  "dev-only" is not a reason unless it is true and shown to be true.
- Distinguish **runtime** from **build/dev-only** dependencies explicitly. A transitive advisory reachable
  only from a build tool is a genuinely different risk from one in the server's request path, and the
  disposition should say which it is.
- Prefer upgrading where the upgrade is contained. Do NOT take a breaking major version bump for an
  advisory that is accepted-with-reason — that trades a documented risk for an undocumented one, and
  this is a debt-paydown milestone, not a dependency-refresh one.

### CI audit policy (SC-4)
- CI **states** a policy and **enforces** it. The policy lives in the repo as readable text, not only as
  a flag buried in a workflow line.
- The gate must be able to fail: **add a knowingly-vulnerable dependency, watch the required check go
  red, revert** — with the real output recorded. A policy whose gate has never been observed failing is
  a stated intention, not a policy.
- Accepted advisories go in an explicit allowlist with a reason per entry. **Every allowlist entry
  carries an expiry date**, so acceptance is a decision that gets revisited rather than a permanent
  silence.
- The gate belongs on the **required** CI job, consistent with Phase 46's Route A reasoning: a
  non-blocking gate is a vacuous gate.

### Claude's Discretion
- The exact operation-counting mechanism (an injected counter, a spy, a complexity probe over growing
  inputs, or an AST/shape assertion) — whichever most directly falsifies backtracking.
- Tooling for the audit gate (`npm audit`, `osv-scanner`, `audit-ci`, or similar) and the allowlist file
  format.
- Whether the ten-run proof is scripted or driven by hand, provided the evidence is reproducible.

</decisions>

<code_context>
## Existing Code Insights

### The two subjects
- `src/lib/execution/condition-evaluator.test.ts` › "resolveFieldPath — parsing is linear, not
  backtracking" — asserts a wall-clock **ratio**. Failed twice in Phase 44's parallel waves, once
  reported as `25.5 < 10`, while passing 70/70 in isolation and in every serial run.
- `src/lib/execution/toggle.test.ts:61` — `Hook timed out in 10000ms` in **2 of 5** consecutive
  `npm run test` runs; passes in 6.57 s in isolation with that one test taking 3.75 s of the 10 s
  default `hookTimeout`.
- `resolveFieldPath` is a dot-notation walker reused by the condition evaluator and the delay resolver
  (Phase 26 decision), so its complexity property is load-bearing in more than one place.

### Established patterns from Phase 46 (just landed — reuse them)
- Anti-vacuity has three in-repo forms; the strongest is a matcher that **unit-tests itself against
  KNOWN_POSITIVE / KNOWN_NEGATIVE fixtures before the scan runs**
  (`deployment-docs-accuracy.test.ts:267-304`).
- A gate must **floor what it counts** — `hits.length > 0` proves the scan found *something*, but a
  separate floor must prove the *token being searched for* still matches, or renaming it turns the gate
  green because it broke (Phase 46 WR-11).
- A check that reports a dimension as verified when both sides are empty must **say so**
  (`IDENTICAL (both empty — proves nothing)`).
- New test files must be `*.test.ts` — `*.db.test.ts` / `*.rsc.test.ts` are excluded from the base
  vitest project and would never run in CI.
- `db-test-isolation.test.ts` iterates **every** package.json script asserting none but `test:db`
  mentions `test:db`/`db.config` — any new script must not trip it.

### Test infrastructure
- vitest ^4.0.18, three projects: base (`vitest.config.ts`), `vitest.rsc.config.ts`, `vitest.db.config.ts`.
- `npm test` → `vitest run && vitest run --config vitest.rsc.config.ts`. Baseline after Phase 46:
  **4739 passed / 32 skipped**, RSC 8/8, typecheck 0, lint 0 errors / 124 warnings.
- CI is `.github/workflows/ci.yml`, one required job named `ci`, Node 24, now with a `postgres:16-alpine`
  service and a `Migration chain check` step (Phase 46).

</code_context>

<specifics>
## Specific Ideas

- **The standing v1.4 rule applies to every gate this phase adds:** break it on purpose, watch it go
  red, record the real output in the SUMMARY. v1.3 shipped six gates that could not fail, and Phase 46's
  own review found a seventh *inside the phase built to eliminate them* — a destructive-statement scan
  that would have gone green if the identifier it searched for were renamed. Assume this phase will
  produce one too unless each gate is deliberately falsified.
- **`rtk` environment hazards, measured in Phase 46:** `grep … | wc -l` returns a WRONG count (a tree
  with 36 matches reported 19) — recompute with `node -e`. `npx <tool>` is rewritten into a nonexistent
  npm script — prefer `npm run …`. `npm run` reorders a child's stdout/stderr — invoke the binary
  directly when interleaving matters. **A count gate built on `wc -l` is a vacuous gate here.**
- Phase 46 left one open item that belongs to this phase's domain: **the phase-46 commits are unpushed,
  so GitHub CI has never executed the new `Migration chain check` step.** SC-4 requires observing a
  required check go red and recover — doing that necessarily exercises the CI path and would close the
  Phase 46 item at the same time. Note it; pushing remains the operator's call.

</specifics>

<deferred>
## Deferred Ideas

- The cold `auth.setup.ts` flake (30.1 s vs 1.9 s on retry) — a separate flake source, explicitly out of
  v1.4 scope.
- Broad dependency refresh or major-version upgrades not required by a specific advisory disposition.
- Converting `Dockerfile:7`'s `npm install --legacy-peer-deps` to `npm ci` (deferred from Phase 46) —
  note that it weakens any lockfile-derived guarantee, including this phase's audit gate, since the
  image tree is not lockfile-exact.

</deferred>
