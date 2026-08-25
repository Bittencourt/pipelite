# Phase 47: Suite Trust & Supply Chain - Context

**Gathered:** 2026-08-25
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous)
**Amended:** 2026-08-25 — corrected by 47-RESEARCH.md. Three factual corrections plus one criterion
replacement (ROADMAP SC-1). Corrections are on *mechanism and evidence*; the phase goal is unchanged.

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
- **CORRECTED: no backtracking implementation ever existed** — both prior git versions of
  `resolveFieldPath` are `split(".")`. SC-2 therefore means *write* one, not restore one. Research
  supplies two working ones.
- **The gate needs a FLOOR as well as a ceiling.** Measured: a hand-written backtracker reports
  1307 ops/char (fails the ceiling), but a **regex backtracker reports ZERO ops** — catastrophic
  backtracking is invisible to any JS-level counter, so a ceiling-only gate passes the worst case.
  Pair the counter with a TypeScript-AST structural assertion, proven red against a regex rewrite.
  Current parser measures **1.71 ops/char, flat across a 500x input span, one distinct integer over
  20 repeats** — deterministic under load.
- The replacement is verified by writing a backtracking implementation on purpose and watching it go
  red, then reverting. Recorded verbatim in the SUMMARY. An assertion that
  survives load by asserting nothing is the failure mode this phase exists to prevent — a green suite
  is not evidence that the replacement works.

### Repeatability proof (SC-1) — AMENDED, the original could not fail
- **AMENDED 2026-08-25.** The original text locked "ten consecutive full-suite runs produce the same
  pass set". Measured: **16 runs (10 idle, 3 at 2x, 3 at 3x oversubscription) → 16/16 identical pass
  sets, 4739 passed / 32 skipped, zero failures — on the UNFIXED tree.** The proof was already green
  before any work. Shipping it would have been the seventh vacuous gate, inside the phase built to
  delete them. ROADMAP SC-1 has been amended to match.
- **The criterion is now MARGIN under induced load.** At >=3x CPU oversubscription, record what
  fraction of its budget each timing-sensitive assertion consumes. Measured baselines to beat on the
  unfixed tree: linearity ratio **52.5 / 80 threshold (66% consumed by contention alone)**;
  `toggle.test.ts:61` `beforeEach` **4121-4850 ms / 10 000 ms**; `recursion.test.ts:82`
  **2453-3263 ms** — the next to fail. Reaching a real timeout needs ~7x, i.e. the multi-worktree
  executor environment, which is exactly where this bit before.
- **Plus a structural gate (SC-1b):** no test asserts on an elapsed-time delta or ratio, suite-wide.
- The ten-run pass-set check is retained as a cheap regression guard but is **explicitly not the
  evidence**. Do not present it as proof of anything.

### Superseded — original repeatability wording
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

### Resolved open questions (decided so the plan does not stall)
- **The four `vi.resetModules()` files get an explicit, documented carve-out** from the static-import
  gate — with the reason recorded inline, so the exemption is a stated decision rather than a silent
  hole. Converting them is not in scope.
- **`next@16.1.6 → 16.3.2` is its own task with its own gate**, splittable to a follow-up if it needs
  code changes. Do not let a framework bump ride along inside an advisory-triage task.
- **`nodemailer` 7→9 is a breaking major for an advisory that can be accepted with reason** — take the
  accept-with-reason path and record it with an expiry, per the CONTEXT rule against trading a
  documented risk for an undocumented one in a debt-paydown milestone.
- **`npm audit signatures` is included as a separate CI step** despite ~+102 s. Registry signature
  verification is exactly the supply-chain half of SEC-05, and a ~95 s → ~200 s required check is an
  acceptable price. If it proves flaky on network, say so and re-decide with evidence.
- **`npm audit fix` is FORBIDDEN as the remediation instrument** — measured, it adds
  `rolldown`/`tsx`/`esbuild` and moves `vite` 7→8. Remediate per-advisory, deliberately.
- **Audit tooling: an in-repo policy evaluator with ZERO new dependencies.** `audit-ci` depends on
  `event-stream@4.0.1` (the 2018 backdoor package) and was last published 2024-07-03;
  `better-npm-audit` is 23 months stale on deprecated `lodash.get`; `osv-scanner` is not on npm.
  Adding a stale supply-chain tool to fix a supply-chain requirement is self-defeating.
- **Policy document at repo root** (`AUDIT-POLICY.md` or equivalent) — a root `SECURITY.md` is a
  different document and must not be conflated with it.

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
- `src/lib/execution/toggle.test.ts:61` — recorded as `Hook timed out in 10000ms` in **2 of 5** runs
  (Phase 45). **CORRECTED 2026-08-25: 0 of 16 today.** The failure does not reproduce on the current
  tree at up to 3x oversubscription; only the margin moves. **The cause is module import cost, not DB
  I/O, not fake timers, not a sleep, and NOT a poll interval** — 521 ms of 778 ms (67%) is
  `drizzle-orm/pg-core` alone. Hoisting to a static top-level import (`vi.mock` hoists above imports)
  drops the first test **1258 ms → 3.0 ms**, all 5 still passing — applied to a copy and measured.
  **An AST sweep found the same defect in 5 more files**; `recursion.test.ts:82` is next to fail and
  must be fixed in the same change.
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
- Converting **`Dockerfile:24`**'s (corrected from `:7`) `npm install --legacy-peer-deps` to `npm ci` (deferred from Phase 46) —
  note that it weakens any lockfile-derived guarantee, including this phase's audit gate, since the
  image tree is not lockfile-exact.

</deferred>
