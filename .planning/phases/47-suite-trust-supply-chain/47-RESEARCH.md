# Phase 47: Suite Trust & Supply Chain - Research

**Researched:** 2026-08-25
**Domain:** vitest determinism under parallel workers · npm supply-chain policy
**Confidence:** HIGH (almost everything here was measured on this tree today, not recalled)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**QG-01 is ONE item, not two**
- `999.28` (`condition-evaluator.test.ts`, Phase 34 T-34-20) and `D-45-01` (`toggle.test.ts:61`) are the
  **same defect class** — a wall-clock margin that passes alone and fails under vitest's own workers.
  Phase 45 explicitly said to fix them together and warned *"do not chase either one per-phase."*
  Plan them as one item with one shared proof.

**How the timing assertions are replaced**
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

**The property must still be defended, provably**
- The replacement assertion is itself verified by **reintroducing a backtracking implementation on
  purpose and watching it go red**, then reverting. Recorded verbatim in the SUMMARY. An assertion that
  survives load by asserting nothing is the failure mode this phase exists to prevent — a green suite
  is not evidence that the replacement works.

**Repeatability proof (SC-1)**
- **Ten consecutive full-suite runs at the DEFAULT parallel worker count** must produce the same pass
  set. Not ten runs of the two files; not ten serial runs; not a reduced worker count. The point is the
  configuration developers and CI actually use.
- Compare **pass sets**, not just exit codes — a run that passes a different set of tests is not the
  same result. Record per-run pass/fail/skip counts and diff the sets.
- If the out-of-scope `auth.setup.ts` flake perturbs a run, record it explicitly as the known
  out-of-scope source rather than silently re-running until the numbers agree.

**SEC-05 — advisory disposition**
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

**CI audit policy (SC-4)**
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

### Deferred Ideas (OUT OF SCOPE)
- The cold `auth.setup.ts` flake (30.1 s vs 1.9 s on retry) — a separate flake source, explicitly out of
  v1.4 scope.
- Broad dependency refresh or major-version upgrades not required by a specific advisory disposition.
- Converting `Dockerfile`'s `npm install --legacy-peer-deps` to `npm ci` (deferred from Phase 46) —
  note that it weakens any lockfile-derived guarantee, including this phase's audit gate, since the
  image tree is not lockfile-exact.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **QG-01** | No test asserts on wall-clock time in a way that fails under parallel workers | §1 (the linearity gate, replacement prototyped and both halves proven), §2 (measured `beforeEach` breakdown + proven fix), §3 (today's measured baseline), §4 (full-suite sweep — the third and fourth assertions found) |
| **SEC-05** | The committed lockfile's advisories are triaged, and CI has a stated audit policy | §5 (re-measured 2026-08-25 counts + per-advisory reachability + in-range fix availability), §6 (tooling comparison + recommendation), §7 (CI attachment + verified negative control), §9 (the honest limitation) |
</phase_requirements>

---

## Summary

Every number below was measured on this tree today. Four things matter for planning.

**First: the flake did not reproduce, and SC-1 as written cannot discriminate.** Sixteen full-suite
runs at the default worker count — ten idle, three at 2x CPU oversubscription, three at 3x — produced
**16/16 identical pass sets, 4739 passed / 32 skipped, zero failures**. `toggle.test.ts`'s `beforeEach`
consumed 1211–1669 ms idle and 4121–4850 ms at 3x, against a 10 000 ms budget; the linearity ratio
reached 52.5 against its 80 threshold at 3x. Both are *margins narrowing*, not failures. So a ten-run
proof on the current tree is already green, and passing it after the fix proves nothing on its own.
The plan needs a *margin* metric that discriminates — and both replacements supply one, because both
turn a continuous, load-sensitive quantity into a **deterministic integer**.

**Second: both defects have a measured cause and a proven fix.** `toggle.test.ts:61`'s cost is not DB
I/O, not fake timers, not a sleep, and **not a poll interval** — it is the one-time load of the module
graph behind `await import("@/app/workflows/actions")`, of which **521 ms of 778 ms (67 %) is
`drizzle-orm/pg-core`** alone. Hoisting it to a static top-level import (`vi.mock` is hoisted above
imports, so the mocks still apply) drops the first test from 1258 ms to **3.0 ms**, moves the ~880 ms
into vitest's untimed import phase, and keeps all five tests passing — measured, not predicted. The
same defect sits in five more files, worst of them `recursion.test.ts:80` at 2453–3263 ms under 3x.
For the linearity gate, a **counting-string facade** replaces elapsed time with counted character
reads: the current parser measures **1.71 ops/char, stable to four significant figures across a 500x
input span, and identical across 20 repeats (one distinct integer)**. A hand-written backtracking
parser measures 1307 ops/char; a regex-backtracking parser measures **zero**, which is why the
assertion needs a **floor as well as a ceiling** — Phase 46's WR-11 lesson applied verbatim.

**Third: the advisory picture is 4 critical / 22 high / 9 moderate / 3 low (38 total), unchanged in
count from 4/22 but now attributed.** Eleven of the 26 critical/high are dev- or build-tool-only.
Fifteen are in the production tree, of which the sharp end is small: `drizzle-orm` (SQL injection via
unescaped identifiers, fixed by a **patch** bump already permitted by `^0.45.1`), the Auth.js trio
(fixed by in-range bumps to `@auth/drizzle-adapter@1.11.3` and `next-auth@5.0.0-beta.32`), and
`vitest` itself (a CVSS 9.8 file-read RCE, fixed by an in-range minor). Ten more transitive advisories
resolve inside their parents' declared ranges. Exactly **two** decisions are genuinely hard: `next`
(16.1.6 → 16.3.2 clears three advisory families at once but needs a manifest edit) and `nodemailer`
(only fix is a 7→9 major, and the six advisories all require an input surface the single call site
does not expose). **Do not run `npm audit fix`** — measured, it would add `rolldown`, `tsx` and
`esbuild`, move `vite` 7→8, and touch 100+ packages. That is the dependency refresh CONTEXT excludes.

**Fourth: there is no good off-the-shelf gate, and the in-repo one costs nothing.** `audit-ci` (the
obvious pick) was last published **2024-07-03**, 25 months ago, and — in a phase about supply-chain
trust — declares `"event-stream": "4.0.1"` as a direct dependency. `better-npm-audit` is 23 months
stale and depends on the deprecated `lodash.get`. `osv-scanner` is a Go binary, not on npm, and is not
installed here. Meanwhile `npm audit --json` already emits everything a policy needs, and the repo has
a landed Phase 46 pattern for exactly this (`scripts/migrate-from-zero.mjs` + a vitest static gate +
an npm script + a `ci.yml` step). Recommend an in-repo policy evaluator with **zero new dependencies**.

**Primary recommendation:** Replace both timing assertions with deterministic integer metrics (counted
character reads for the parser; a parsed-AST "no dynamic import inside a lifecycle hook" gate for the
suite), sweep the two remaining elapsed assertions found in §4, triage the 26 critical/high advisories
against the reachability table in §5, and enforce a repo-local `security/audit-policy.json` allowlist
(reason + expiry per entry) from a dependency-free Node script wired into the required `ci` job —
proven red by adding `minimist@1.2.5`, which is verified below to produce exactly one critical
advisory and exit 1.

---

## Corrections to CONTEXT.md

Three factual corrections. None changes a decision; all three change a file:line a plan would cite.

| CONTEXT says | Measured today | Impact |
|---|---|---|
| `Dockerfile:7` uses `npm install --legacy-peer-deps` | It is **`Dockerfile:24`**. The file gained a 17-line Node-pin header in Phase 46. | A plan citing `:7` would edit a comment. |
| `toggle.test.ts` fails "2 of 5 consecutive `npm run test` runs" | **0 of 16** on the current tree (10 idle + 3 at 2x + 3 at 3x oversubscription), all pass sets identical. | The "before" number cannot be reproduced by running the suite. Use the **margin** (§3), not the failure rate. |
| `resolveFieldPath` "is a dot-notation walker … its complexity property is load-bearing" — implying a backtracking version once existed | Git history has **two** prior versions (`4fa8890`, `a5d2ab1`), both `path.split(".")`. **Both are linear.** There has never been a backtracking implementation in this repo. | SC-2's "reintroduce a backtracking `resolveFieldPath`" means **write one**, not revert one. §1 supplies two, both verified to trip the replacement. |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Field-path complexity guarantee | Library (`src/lib/execution/condition-evaluator.ts`) | Test harness | The property belongs to the parser; the test only observes it |
| Operation counting | Test harness (`*.test.ts`) | Library (one export seam) | Counting must not enter the production hot path — the facade lives entirely in the test |
| Structural / shape assertion | Test harness, via TypeScript AST | — | Reads the source; production code is unaware |
| Test module-graph loading | vitest collect/import phase | — | Moving cost out of `beforeEach` is a *tier* change: the import phase has no `hookTimeout` |
| Advisory data | npm registry (network) | — | No local advisory DB exists; the gate is inherently online |
| Policy evaluation & allowlist | Repo (`scripts/`, `security/`) | — | Owning the policy is the point; a stale third-party tool cannot own it |
| Gate enforcement | CI required job `ci` | — | Phase 46 Route A: a non-blocking check is not a check |
| Runtime dependency surface | Docker image (Next standalone trace) | Builder stage tree | Three distinct trees exist — see §9 |

---

## §1 — `condition-evaluator.test.ts`'s linearity gate

### What it asserts today

`src/lib/execution/condition-evaluator.test.ts:613-637` [VERIFIED: read]:

```ts
it("scales linearly, not quadratically, with path length", () => {
  const ctx = realCtx()
  const time = (n: number) => { /* best-of-5 wall clock over pathologicalPaths(n) */ }
  time(2000)                              // warm-up, discarded
  const small = Math.max(time(8000), 0.05)
  const large = time(128000)              // 16x the input
  expect(large / small).toBeLessThan(80)  // :636
})
```

A 16x input span; linear predicts 16x, quadratic predicts 256x; the threshold sits at 80. A 24-line
comment block (`:590-612`) records that an earlier 4x/10x version failed at 11.9x, 13.34x and 15.6x.

### The property it defends

`tokenizeFieldPath` (`condition-evaluator.ts:40-81`) is a single forward scan: `i` is monotonically
non-decreasing, every `path.indexOf(quote, i)` starts at the current cursor and its result becomes the
new cursor, and there is no regex anywhere. Cost is O(len) on adversarial input. `resolveFieldPath`
(`:96-111`) delegates to it and then walks the segments. **It is genuinely linear** — measured at
**1.71 counted character-reads per input character, flat from n=100 to n=50 000** (§ below).

### What a backtracking implementation looks like here — two concrete shapes

Both are supplied in full in `/tmp/p47/proto-ops.mjs` and were run.

**Shape A — regex.** The realistic ReDoS reintroduction: express the bracket grammar as nested
quantifiers and hand the whole chunk to the engine.

```js
const BACKTRACK_RE = /^([^.[]*)((?:\[(?:"(?:[^"]|"")*"|'(?:[^']|'')*')\])*)$/
function tokenizeFieldPath(path) {
  const out = []
  for (const chunk of String(path).split(".")) {
    const m = BACKTRACK_RE.exec(chunk)   // catastrophic on an unterminated bracket
    if (!m) return null
    out.push(m[1])
  }
  return out
}
```

**Shape B — hand-written restart-on-failure.** No regex; re-scans from `start+1` whenever a segment
fails to close. The classic O(n²) parser.

```js
for (let end = len; end > i; end--) {      // longest-first, re-scanning each time
  let bad = false
  for (let k = i; k < end; k++) { const c = path[k]; if (c === "." || c === "[") { bad = true; break } }
  if (!bad) { j = end; ok = true; break }
}
```

**Shape A is the one that matters, and it is the one an operation counter cannot see.** Catastrophic
backtracking happens *inside a single native `exec` call*; no JS-level counter can observe it. This is
the single most important design constraint in this phase, and it is why the assertion below has two
halves.

### The proposed replacement: a counting string facade with a FLOOR and a CEILING

Wrap the input in a `Proxy` over a boxed `String` whose `get` trap counts every index read, and whose
`indexOf` / `slice` / `split` / `charAt` are re-implemented over the raw string so the characters they
scan are counted too. `valueOf` / `toString` / `Symbol.toPrimitive` return the raw primitive and
increment a separate `coercions` counter — that is the escape hatch a regex takes.

Then assert, over a set of pathological inputs the parser **must** traverse:

- **FLOOR**  `counted >= totalInputLength` — the parser actually looked at every character *through the
  counted seam*. A regex or native `split` implementation coerces once and reads **zero**.
- **CEILING** `counted <= K * totalInputLength` — no re-scanning. Pin `K = 6` (3.4x headroom over the
  measured 1.71).
- **FLATNESS** `opsPerChar(largeN) <= 1.25 * opsPerChar(smallN)` — catches a mildly super-linear
  regression that a generous `K` would let through. Measured ratio today: **0.976** (it *decreases*).

### PROVEN BY MEASUREMENT — both halves

`node /tmp/p47/proto-ops.mjs`, verbatim output:

```
impl                                n  inputChars      counted  ops/char  coerce
CURRENT (forward scan)            200        3664         4793      1.31        0
CURRENT (forward scan)           1600       28864        36993      1.28        0
BACKTRACK-A (regex)               200        3664            0      0.00        4
BACKTRACK-A (regex)              1600       28864            0      0.00        4
BACKTRACK-B (hand, restart)       200        3664       655623    178.94        0
BACKTRACK-B (hand, restart)      1600       28864     37721323   1306.86        0

--- growth of ops/char across an 8x input span (flat = linear) ---
CURRENT (forward scan)         ops/char 1.31 -> 1.28   growth=1.0x
BACKTRACK-B (hand, restart)    ops/char 178.94 -> 1306.86   growth=7.3x

--- THE PROPOSED ASSERTION ---
CURRENT (forward scan)     counted=   36993 len= 28864  FLOOR=PASS  CEILING(<=8*len)=PASS  => GREEN
BACKTRACK-A (regex)        counted=       0 len= 28864  FLOOR=FAIL  CEILING=PASS           => RED
BACKTRACK-B (hand,restart) counted=37721323 len= 28864  FLOOR=PASS  CEILING=FAIL           => RED
```

**Determinism**, `node /tmp/p47/proto-ops2.mjs`:

```
  n=   100  len=    2166  counted=   3806  ops/char=1.7572
  n=  1000  len=   21066  counted=  36206  ops/char=1.7187
  n= 10000  len=  210066  counted= 360206  ops/char=1.7147
  n= 50000  len= 1050066  counted=1800206  ops/char=1.7144

Determinism check: 20 repeats of the n=10000 aggregate must give the SAME integer.
  distinct values across 20 repeats: 1 -> 360206
```

Twenty repeats, one distinct integer. That is the load-independence CONTEXT asks for, demonstrated
rather than asserted.

### Two mechanical constraints the plan MUST honour

1. **The floor is an AGGREGATE, not per-path.** Measured per-path at n=2000:

   | path | len | counted | ops/char | per-path floor |
   |---|---|---|---|---|
   | `trigger.data["a"]`×n | 10012 | 12040 | 1.203 | PASS |
   | unterminated bracket + long tail | 20027 | 20082 | 1.003 | PASS |
   | long dot chain | 4009 | 14028 | 3.499 | PASS |
   | **quote storm (correctly rejected in 43 ops)** | 2016 | **43** | **0.021** | **FAIL** |
   | well-formed long dotted path | 8018 | 26056 | 3.250 | PASS |
   | **AGGREGATE** | 44082 | 72249 | 1.639 | **PASS** |

   The quote-storm path is rejected after ~15 characters — correctly. Applying the floor to it would
   make the gate demand that the parser waste work. Apply the floor to the aggregate of the four
   traversal-requiring paths, and assert the quote-storm case **separately** as an early-rejection
   property (`counted <= 200`, independent of n) — which is itself worth having.

2. **`tokenizeFieldPath` must be exported.** It is module-private today. `resolveFieldPath` guards
   `typeof path !== "string"` (`:100`), which a boxed-String proxy fails — correctly, and that guard
   must not be weakened. Exporting the internal parser is a one-line, behaviour-preserving change.
   *Anti-vacuity consequence:* the counting test then measures `tokenizeFieldPath`, so something must
   prove `resolveFieldPath` still routes through it. That is what §1's structural gate does.

### The structural half (also prototyped, also proven red)

A parsed-AST check over `condition-evaluator.ts` via the `typescript` compiler API — already a direct
devDependency (`typescript: ^5`). `node /tmp/p47/proto-ast.mjs`:

```
ANTI-VACUITY FLOORS
  PASS  found resolveFieldPath          PASS  found tokenizeFieldPath
  PASS  resolveFieldPath body >20 AST nodes (89)
  PASS  tokenizeFieldPath body >50 AST nodes (237)

resolveFieldPath  calls=[".trim","tokenizeFieldPath"]  regexes=[]
tokenizeFieldPath calls=[".slice",".push",".indexOf",".has"]  regexes=[]

STRUCTURAL ASSERTIONS                       NEGATIVE CONTROL (regex rewrite through the SAME checker)
  PASS  resolveFieldPath calls tokenizeFieldPath   FAIL  resolveFieldPath calls tokenizeFieldPath
  PASS  resolveFieldPath contains no regex         PASS  (its resolve half has none)
  PASS  tokenizeFieldPath contains no regex        FAIL  tokenizeFieldPath contains no regex
  PASS  resolveFieldPath uses no bulk scanner      FAIL  resolveFieldPath uses no bulk scanner
  PASS  tokenizeFieldPath uses no bulk scanner     FAIL  tokenizeFieldPath uses no bulk scanner
  => overall RED (checker works)
```

Forbidden bulk scanners: `.match`, `.matchAll`, `.replace`, `.replaceAll`, `.search`, `.split`,
`.test`, `.exec`. Note `.trim` is present in `resolveFieldPath` and is deliberately **not** forbidden —
it runs once on the whole path before tokenising, is O(len), and the facade counts it.

### Recommended shape of the replacement test file

Three `it`s, all deterministic, total measured cost ≈ 40–200 ms (the current file costs 196 ms):

1. keep `condition-evaluator.test.ts:582-588` verbatim — behaviour on pathological input at n=20000;
2. the counted floor/ceiling/flatness assertions;
3. the AST structural assertions with their four anti-vacuity floors.

---

## §2 — `toggle.test.ts:61`: where the time actually goes

### Measured breakdown — it is module import cost, nothing else

`src/lib/execution/toggle.test.ts:61-65`:

```ts
beforeEach(async () => {           // :61
  vi.clearAllMocks()               // :62
  const mod = await import("@/app/workflows/actions")   // :64  <-- the entire cost
  toggleWorkflow = mod.toggleWorkflow
})
```

`vitest --reporter=json` attributes a hook's cost to the first test in its scope. Across ten idle
full-suite runs, `toggleWorkflow > returns error when not authenticated` measured **1211–1669 ms**
while the whole file measured 1265 ms — i.e. **99.5 % of the file's cost is that one first
`beforeEach`**. `vi.resetModules()` appears nowhere in the file [VERIFIED: grep], so the module is
cached and every subsequent `beforeEach` is free.

An out-of-tree probe (`/tmp/p47/probe-import.test.ts`, run against a `/tmp` vitest config pointed at
this repo) times the exact statement:

```
PROBE 1st import @/app/workflows/actions       778.6ms
PROBE 2nd import @/app/workflows/actions (cached)  0.1ms
PROBE cache-ratio 8711x
```

Attributing across the graph (`/tmp/p47/probe-graph.test.ts`, leaves first so each figure is that
subtree's marginal cost):

```
PROBE @/db/schema/workflows                    581.7ms   <-- 75%
PROBE @/lib/mutations/workflows                 92.9ms
PROBE @/app/workflows/actions (remainder)       33.3ms
PROBE @/lib/triggers/schedule-utils             29.6ms
PROBE @/lib/mutations/http-templates            15.9ms
PROBE @/lib/triggers/create-run                 11.1ms
PROBE @/lib/workflows/replay                     5.7ms
```

Splitting that 581.7 ms one level further (`/tmp/p47/probe-schema.test.ts`):

```
PROBE drizzle-orm/pg-core (vendor)             521.0ms   <-- 67% of the whole 778ms
PROBE @/db/schema/workflows (project)           39.6ms
PROBE re-import pg-core (cached)                 0.2ms
```

**Answer:** two thirds of the hook's cost is loading `drizzle-orm/pg-core`. `@/db` is mocked, but
`@/db/schema/workflows` is not — and it imports `drizzle-orm/pg-core` directly
(`src/db/schema/workflows.ts:1`), which the `vi.mock("drizzle-orm", …)` passthrough (which stubs only
`eq`/`and`) does not intercept.

**Explicitly ruled out, by measurement:** not DB I/O (`@/db` is a mock, no connection is opened);
not fake timers (none in the file); not a real sleep (no `setTimeout` in the hook path); **not a poll
interval** — the Phase 26 5 s/30 s processor intervals are **not implicated**; nothing in this import
graph starts a timer, and the second import costs 0.1 ms, which a live interval could not.

### Why it times out at 10 000 ms — the contention curve

The suite was run three ways, at the default worker count, on this 4-core machine
(`/tmp/p47/ten`, `/tmp/p47/contend`, `/tmp/p47/contend8`):

| condition | suite wall | `toggle` first test (= the hook) | `recursion` first test | linearity test |
|---|---|---|---|---|
| idle (n=10) | 51–65 s | **1211–1669 ms** | 879–1314 ms | 145–206 ms |
| +4 spinners, 2x (n=3) | 107–116 s | **3152–3372 ms** | 1791–2177 ms | 356–442 ms |
| +8 spinners, 3x (n=3) | 161–165 s | **4121–4850 ms** | 2453–3263 ms | 521–920 ms |

The 3.75 s figure in `BACKLOG.md` corresponds to roughly **2.5x** oversubscription. Reaching the
10 000 ms `hookTimeout` needs roughly **7x** — which is what a machine running several GSD worktree
executors simultaneously produces, and is exactly the Phase 44/45 condition. At 3x the hook is already
consuming **43–49 % of its budget**.

### The fix — PROVEN, not proposed

`vi.mock` calls are hoisted above imports by vitest's transform, so a top-level static import sees the
mocks. The dynamic import is unnecessary.

```ts
// replaces toggle.test.ts:55-58 (the `let toggleWorkflow: … ` declaration) and :61-65
import { toggleWorkflow } from "@/app/workflows/actions"

describe("toggleWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
```

Applied to a copy at `/tmp/p47/probe-toggle-fixed.test.ts` and run:

```
 ✓ probe-toggle-fixed.test.ts (5 tests) 9ms
 Test Files  1 passed (1)      Tests  5 passed (5)
 Duration  1.21s (transform 195ms, setup 0ms, import 883ms, tests 9ms, environment 0ms)

per-test durations (FIXED)
   3.0ms passed  returns error when not authenticated      <-- was 1258ms
   0.6ms passed  returns error for non-existent workflow
   1.6ms passed  enables workflow and returns cancelledRuns=0
   0.9ms passed  disables workflow and cancels waiting runs
   0.6ms passed  disabling with no waiting runs returns cancelledRuns=0
```

**1258 ms → 3.0 ms in the hook**; the 883 ms relocates to vitest's `import` phase, which carries no
`hookTimeout`. All five tests still pass, unchanged. This is the "make the setup deterministic and
cheap" outcome CONTEXT asks for, not a bigger number.

### It is not one file — an AST sweep finds thirteen, in eight files

`/tmp/p47/scan-hooks.mjs` (TypeScript compiler API; 175 test files parsed, **151 hook call
expressions found** as the anti-vacuity floor):

| file:line | hook | specifier | idle cost | `resetModules()` | note |
|---|---|---|---|---|---|
| `src/lib/execution/toggle.test.ts:64` | beforeEach | `@/app/workflows/actions` | **1211–1669 ms** | no | the reported defect |
| `src/lib/execution/recursion.test.ts:82` | beforeEach | `@/lib/triggers/create-run` | **879–1314 ms** | no | **same defect, one contention step behind — fix in the same change** |
| `src/lib/execution/actions/__tests__/crm.test.ts:96` | beforeEach | `../index` | 535 ms first | **yes** | cost repaid every test |
| `.../http.test.ts:90` | beforeEach | `../index` | 106 ms first | yes | |
| `.../notification.test.ts:98` | beforeEach | `../index` | 83 ms first | yes | |
| `.../email.test.ts:98` | beforeEach | `../index` | 44 ms first | yes | |
| `src/lib/audit/export-events-live.test.ts:48-53` (5) | beforeAll | `@/db`, `@/db/schema`, … | — | no | file is entirely skipped; opt-in live test with a 60 s timeout — **out of scope** |
| `src/lib/export/formatters-live.test.ts:94-95` (2) | beforeAll | `@/db`, `./formatters` | — | no | same — **out of scope** |

The four `resetModules()` files are a *different sub-case*: the cost is small but paid per test rather
than once. Fixing them is optional; leaving them is defensible. **`recursion.test.ts` is not
optional** — at 3.26 s under 3x it is the next file to time out.

> **A raw regex/paren-balance scan of the same corpus reported a false positive at
> `src/lib/observability/sentry.test.ts:185`** (its `beforeEach` contains only `vi.doMock`, and the
> `await import` lives in the test bodies). Parse; do not grep.

---

## §3 — How flaky are these, right now? Today's measured baseline

**Method.** `/tmp/p47/ten-runs.sh` — ten consecutive iterations of `npm test`'s two commands
(`vitest run`, then `vitest run --config vitest.rsc.config.ts`) at the **default** worker count, each
writing `--reporter=json`. Diffed with `/tmp/p47/diff-passsets.mjs`, which compares **pass sets**
(`file :: fullName`) and carries its own anti-vacuity floor.

```
run             success   pass  fail  skip
base-01.json       true   4739     0    32       ... base-10.json  true  4739  0  32

PASS-SET DIFF vs base-01.json
  base-02..base-10: IDENTICAL (4739 tests) x 9

ANTI-VACUITY FLOOR: reference pass set size = 4739
  PASS — reference pass set is the full suite.
VERDICT: all 10 runs produced the SAME pass set
```

Plus three runs at 2x oversubscription and three at 3x: **all exit 0.** Total: **16/16 green, 16/16
identical pass sets, zero failures on the current tree.** Ten idle runs cost **9.4 minutes** (51–65 s
each, min 51, max 65).

### The number that actually moves

Because the failure rate is zero at every load this machine can produce, the honest baseline is the
**margin**, and it is alarming. `/tmp/p47/ratio-under-load.mjs` replicates
`condition-evaluator.test.ts:613-637` exactly and prints the ratio the assertion compares against 80:

```
IDLE:              reps=10  min=8.18   median=19.17  max=20.36  worst-margin=3.93x
UNDER 8 SPINNERS:  reps=10  min=17.98  median=36.16  max=52.51  worst-margin=1.52x
                                                     ^^^^^ 66% of an 80 threshold, from noise alone
```

**At 3x oversubscription the linearity assertion is already at 66 % of its budget with a correct
implementation.** One more contention step is red. That is the "before" figure to record — it
discriminates, and the ten-run does not.

### Planning consequence (important)

**SC-1's ten-run proof is already satisfied on the unfixed tree.** Passing it after the fix is
necessary but not sufficient. Pair it with metrics that *can* discriminate, all of which this research
supplies:

| Metric | Before (measured) | After (measured/expected) |
|---|---|---|
| linearity assertion margin at 3x | 1.52x (52.5 / 80) | **∞** — one distinct integer over 20 repeats |
| `toggle` `beforeEach` at 3x | 4121–4850 ms of a 10 000 ms budget | **3.0 ms** — and outside any hook budget |
| `recursion` `beforeEach` at 3x | 2453–3263 ms | same fix, same shape |
| dynamic imports inside lifecycle hooks | 6 in scope (13 total) | 0, enforced by a parsed-AST gate |
| assertions over an elapsed-time expression | 3 live (§4) | 0 |

**Also record honestly in the SUMMARY:** the out-of-scope `auth.setup.ts` flake belongs to Playwright
(`npm run test:e2e`), which `npm test` never invokes, so it cannot perturb these runs at all.

---

## §4 — Is there a third wall-clock assertion? **Yes — a third and a fourth.**

### Method, and a lesson learned from my own scanner

`/tmp/p47/scan-timing2.mjs`, TypeScript AST with **def-use taint tracking**. Version 1 of this scanner
matched only clock calls appearing *inline inside* `expect(...)`. It found three hits and **missed
`condition-evaluator.test.ts:636` — the very assertion QG-01 names** — because its operands were bound
to `small` and `large` first. A gate that cannot see the defect it was written for is a vacuous gate.
Version 2 propagates taint through variable bindings to a fixpoint and unit-tests itself against
KNOWN_POSITIVE / KNOWN_NEGATIVE fixtures **before** the sweep runs, per
`deployment-docs-accuracy.test.ts:267-304`. Its self-test reports `KNOWN_NEGATIVE: FAIL` — v2 is
deliberately over-broad, and says so — which is why the raw hits below are triaged by hand.

Anti-vacuity floor for the sweep: **8060 `expect()` calls parsed across 175 files**.

### Every hit, with a judgement

| # | file:line | assertion | Verdict |
|---|---|---|---|
| 1 | `src/lib/execution/condition-evaluator.test.ts:636` | `expect(large / small).toBeLessThan(80)` | **LIVE HAZARD.** A ratio of two elapsed measurements. 52.5 observed at 3x against an 80 threshold. This is `999.28`. |
| 2 | `src/components/custom-fields/__tests__/client-formula-bounds.test.ts:129` | `expect(Date.now() - start).toBeLessThan(15000)` | **THIRD ASSERTION — live, low risk.** Bounded by QuickJS's own `timeoutMs`, not by CPU share: measured max 543 ms idle, 561 ms at 2x, **560 ms at 3x** → ≥26.8x headroom, essentially contention-insensitive. But it asserts nothing the surrounding `expect(result).toBeDefined()` and the file's `it({ timeout: 30000 })` (`:105`) do not already prove, and its 15 000 ms bound is *tighter* than that timeout, so it is the thing that would fire first. |
| 3 | `src/lib/formula-engine.test.ts:403` | `expect(Date.now() - start).toBeLessThan(5000)` | **FOURTH ASSERTION — live, low risk.** Measured 51–54 ms idle, 52–55 ms at 2x, **57–59 ms at 3x** → 85–92x headroom. Same redundancy: `it({ timeout: 10000 })` at `:395` plus `expect(result.error).not.toBeNull()` at `:404` carry the whole property. |
| 4 | `src/lib/execution/actions/__tests__/http.test.ts:559` | `expect(Date.now() - before).toBe(0)` | **NOT A HAZARD — and the model to copy.** `vi.useFakeTimers({ shouldAdvanceTime: false })` at `:531` freezes the clock, so `Date.now()` is mocked and `toBe(0)` is exact. Deterministic by construction. |
| 5-7 | `src/app/admin/users/actions.test.ts:37,53,59` | `(now + K) - now === K`; `Date.now()+7d > Date.now()` | **FALSE POSITIVE.** Future-timestamp arithmetic, not elapsed measurement. `:37` is algebraically exact on a single captured value; `:59` has seven days of margin. |
| 8-12 | `src/lib/audit/prune.test.ts:319`, `src/lib/trash/prune.test.ts:447`, `src/lib/events/subscribers/{audit:344,stage-history:196,webhook:118}` | `expect(snapshot(<future ts>)[...]).toBe(true)` | **FALSE POSITIVE.** A future timestamp is passed *into* a pure function; the assertion is on a boolean. |

**Precise specification for the gate the plan builds:** taint on a **delta or ratio** — a clock call
that is the *left* operand of a subtraction, or a division of two already-tainted values — and NOT on
a clock call that is an operand of an addition producing a future timestamp. That single distinction
turns 12 raw hits into 4 real ones. It was derived by running the over-broad version and triaging.

### Other timing-adjacent findings

- **`performance.now()` appears in exactly two places in the suite**, both inside
  `condition-evaluator.test.ts:620,622`. Nowhere else.
- **`setTimeout` in test bodies (13 sites)**: all are `setTimeout(resolve, 0)` or `(resolve, 1)`
  event-loop yields — deterministic flush idioms, not races. The one exception,
  `src/lib/mutations/dedup.db.test.ts:399` (`setTimeout(…, 50)` inside a `Date.now()` deadline poll
  loop), is in the **db project**, which `npm test` never invokes.
- **Explicit timeouts (24 sites)**: 17 are in `formatters-live.test.ts` (60 s–600 s, an opt-in
  all-skipped live suite). The relevant ones — `formula-engine.test.ts:395` `{timeout:10000}`,
  `client-formula-bounds.test.ts:105` `{timeout:30000}`, `transform.test.ts:169` `10_000`,
  `formula-recalc.test.ts:450,470` `5000` and `:1311,1353` `20000` — are **liveness backstops, not
  assertions**, and QG-01 should be read as permitting them.
- **`transform.test.ts:160-169`** runs `while(true){}` in the QuickJS sandbox with
  `_testTimeoutMs: 100` under a 10 s test timeout — a 100x margin, and the assertion is on the thrown
  error, not on elapsed time. Not a hazard.

**Recommended boundary for QG-01, stated in the repo:** *a test may rely on vitest's ambient or an
explicit `{ timeout: N }` as a liveness backstop against a hang, but must not **assert** an
elapsed-time threshold.* Items 1–3 above are the complete set that violates it.

---

## §5 — SEC-05: the advisories, re-measured 2026-08-25

`npm audit --json`, npm 11.10.0, Node v24.13.1, against the committed lockfile:

```json
"vulnerabilities": { "info":0, "low":3, "moderate":9, "high":22, "critical":4, "total":38 },
"dependencies":    { "prod":529, "dev":582, "optional":214, "peer":37, "total":1289 }
```

**4 critical / 22 high — the same counts as 2026-08-24**, now with attribution.
`npm audit --omit=dev` reports **3 critical / 12 high**, i.e. **11 of the 26 critical/high are
dev/build-tool-only**. Moderate (9): `@aws-sdk/xml-builder`, `@esbuild-kit/core-utils`,
`@esbuild-kit/esm-loader`, `drizzle-kit`\*, `esbuild`, `follow-redirects`, `next-intl`\*, `qs`,
`yaml`\*. Low (3): `@babel/core`, `body-parser`, `icu-minify`. (\* = direct dependency.)

### Every critical and high, with reachability and a contained fix path

Reachability column: **RUNTIME** = in the server's request path or the client bundle · **BUILD** = only
during `next build` / bundling · **DEV** = only a developer's or CI's toolchain, never in any image.

| # | Package | Sev | Reached via | Reach | Fix version | In declared range? |
|---|---|---|---|---|---|---|
| 1 | `drizzle-orm` | high | direct `^0.45.1` | **RUNTIME** | **0.45.2** | **YES — patch** |
| 2 | `@auth/drizzle-adapter` | crit | direct `^1.11.1` | **RUNTIME** | **1.11.3** | **YES — patch** |
| 3 | `next-auth` | crit | direct `^5.0.0-beta.30` | **RUNTIME** | **5.0.0-beta.32** | **YES — prerelease, same tuple** |
| 4 | `@auth/core` | crit | `next-auth`, `@auth/drizzle-adapter` | **RUNTIME** | **0.41.3** | YES, via #2 + #3 |
| 5 | `vitest` | **crit (CVSS 9.8)** | direct dev `^4.0.18` | **DEV** | **≥4.1.0** (latest 4.1.11) | **YES — minor** |
| 6 | `vite` | high | `vitest` (`^6 \|\| ^7`) | **DEV** | **7.3.5 / 7.3.6** | **YES — stays on 7.x; no need for vite 8** |
| 7 | `axios` | high | `pipedrive` (`^1.9.0`) | **RUNTIME** (Pipedrive import) | **1.19.0** | **YES** |
| 8 | `form-data` | high | `axios` (`^4.0.5`) | **RUNTIME** | 4.0.6+ | **YES**, follows #7 |
| 9 | `lodash` | high | `recharts`, `react-big-calendar` (`^4.17.21`) | **RUNTIME** (client bundle) | **4.18.1** | **YES** |
| 10 | `lodash-es` | high | `react-big-calendar` (`^4.17.21`) | **RUNTIME** (client bundle) | **4.18.1** | **YES** |
| 11 | `fast-xml-parser` | high | `@aws-sdk/client-s3 > @aws-sdk/xml-builder` — **pins `5.3.6` exactly** | **RUNTIME** iff `FILE_STORAGE=s3` | `@aws-sdk/xml-builder@3.972.40` **drops the dependency entirely** | **YES**, via `@aws-sdk/client-s3` within `^3.998.0` |
| 12 | `nanoid` | high | `postcss` (`^3.3.11`) | **BUILD** | **3.3.18** | **YES** |
| 13 | `next` | high | direct, pinned **exact `16.1.6`** | **RUNTIME** | **16.3.2** | **NO — manifest edit** |
| 14 | `postcss` | high | top-level (tailwind/vite) **and** `next` — which pins `8.4.31` exactly | **BUILD** | top-level → **8.5.26**; nested copy only via #13 | partial |
| 15 | `sharp` | high | `next` (`^0.34.4`) | **RUNTIME** (`next/image`) | 0.35.x, only via #13 | **NO** without #13 |
| 16 | `nodemailer` | high | direct `^7.0.13`; also `@auth/core` peer | **RUNTIME** (`src/lib/email/client.ts:1`) | **9.0.5** | **NO — 7→9 major** |
| 17 | `brace-expansion` | high | `eslint`, `eslint-config-next`, `@sentry/*` bundler plugin, `shadcn` | **DEV** | in-range | YES |
| 18 | `minimatch` | high | same parents as #17 | **DEV** | in-range | YES |
| 19 | `js-yaml` | high | `eslint > @eslint/eslintrc`, `shadcn > cosmiconfig` | **DEV** | in-range | YES |
| 20 | `flatted` | high | `eslint > file-entry-cache > flat-cache` | **DEV** | in-range | YES |
| 21 | `fast-uri` | high | `@sentry/webpack-plugin > webpack > schema-utils > ajv`; `shadcn > …ajv` | **BUILD** / **DEV** | in-range | YES |
| 22 | `hono` | high | `shadcn > @modelcontextprotocol/sdk` | **DEV** | in-range | YES |
| 23 | `@hono/node-server` | high | `shadcn > @modelcontextprotocol/sdk` | **DEV** | in-range | YES |
| 24 | `express-rate-limit` | high | `shadcn > @modelcontextprotocol/sdk` | **DEV** | in-range | YES |
| 25 | `ip-address` | high | `shadcn > … > express-rate-limit` | **DEV** | in-range | YES |
| 26 | `path-to-regexp` | high | `shadcn > … > express > router`; `shadcn > msw` | **DEV** | in-range | YES |

**Sources for reachability** [VERIFIED: `npm ls --all --json`, `npm audit --omit=dev`, and reading each
parent's `package.json` `dependencies`]. Advisory URLs are in `/tmp/p47/ch.json`, one row per package.

### DO NOT run `npm audit fix`

Measured (`npm audit fix --dry-run`, output in `/tmp/p47/auditfix.json`): it would **add**
`@rolldown/pluginutils`, `@rolldown/binding-linux-x64-gnu`, `@oxc-project/types`, `rolldown`, `tsx`,
`@esbuild/linux-x64`, `esbuild`, `lightningcss`; move **`vite` 7.3.1 → 8.2.2** (a transitive major);
and change 100+ packages including the whole `@babel/*` and `@formatjs/*` families. That is the broad
dependency refresh CONTEXT places out of scope. **Do targeted per-package installs instead**, each
re-verified with `npm audit --json`.

### The two genuinely hard decisions

**`next` 16.1.6 → 16.3.2 (#13, and therefore #14-nested and #15).** One in-range-impossible bump
clears three advisory families at once: 28 Next advisories including CVSS 8.6 SSRF via WebSocket
upgrades (GHSA-c4j6-fc7j-m34r) and CVSS 8.1 middleware bypass via dynamic route parameter injection
(GHSA-492v-c6pp-mqqv), plus `next`'s pinned `postcss@8.4.31` and its `sharp@^0.34.4`. It is a **minor**
bump within Next 16, and npm does not flag it `isSemVerMajor`. Costs: `package.json` `next` and
`eslint-config-next` both currently read exactly `16.1.6` and should move together; the container must
be rebuilt (`docker compose up -d --build`, then verify behaviourally — `restart` runs the old image).
*Recommendation: upgrade.* Three middleware-bypass advisories in the server's request path are not a
defensible "accept".

**`nodemailer` 7.0.13 → 9.0.5 (#16).** The only fix is a two-major bump, which CONTEXT tells us not to
take for an accept-with-reason item. Reachability is real — `src/lib/email/client.ts:1` calls
`createTransport` — but the surface is not. The single call site is:

```ts
// src/lib/email/send.ts:29-35
const info = await transporter.sendMail({ from: fromEmail, to, subject: template.subject,
                                          html: template.html, text: template.text })
```

and the transport config (`src/lib/email/client.ts:8-21`) is `{host, port, secure, auth, tls}` from
env. None of `envelope`, transport `name`, `list`, `raw`, `jsonTransport`, or OAuth2 — the six
advisories' entire input surface — is ever supplied. *Recommendation: accept with that stated reason
and an expiry, and re-check when nodemailer 8/9 migration is scheduled separately.*

> **Additional peer-dependency fact the plan should know:** `@auth/core` declares
> `peerOptional nodemailer@"^6.8.0"` while this project installs `^7.0.13` — that mismatch is a
> plausible reason `Dockerfile:24` carries `--legacy-peer-deps`. Bumping nodemailer to 9 **widens**
> it. A further argument for accept-with-reason.
>
> **Out-of-scope observation, recorded not actioned:** `src/lib/email/client.ts:20` sets
> `tls: { rejectUnauthorized: false }`, disabling SMTP certificate verification unconditionally. That
> is a larger risk than any nodemailer advisory listed here and is **not** in this phase's scope. It
> belongs in `BACKLOG.md`.

### `npm audit signatures` — a second, orthogonal check that costs nothing

```
audited 1104 packages in 102s
1104 packages have verified registry signatures
169 packages have verified attestations
```

Zero failures. This detects tarball tampering, which advisory data cannot. It is cheap, it already
passes, and it is a real gate. Recommend adding it to the same CI step. **Caveat for the planner:**
102 s is not free on the required check; run it as a separate `if: ${{ !cancelled() }}` step so it
never masks the advisory gate's result, and be prepared to defend the minute.

---

## §6 — What audit tooling fits?

| Tool | Allowlist w/ reason | **Expiry per entry** | Currency | Cost to add | Verdict |
|---|---|---|---|---|---|
| `npm audit` + `--audit-level` | **none** | **none** | ships with npm 11.10.0 | 0 | Data source, not a policy |
| `audit-ci@7.1.0` | yes (NSPRecord `notes`) | **yes** (`expiry`) | **last published 2024-07-03 — 25 months** | **+30 packages, incl. `"event-stream": "4.0.1"` as a direct dependency** | **Reject** |
| `better-npm-audit@3.11.0` | yes (`.nsprc` `notes`) | **yes** (`expiry`) | last published 2024-09-09 — 23 months; docs claim npm 6/7/8 | +5 packages incl. **deprecated `lodash.get`** | Reject |
| `osv-scanner` | via config `IgnoredVulns` (has `ignoreUntil`) | yes | current, Google-maintained | **Not on npm** (Go binary); **not installed on this host**; no `go`/`trivy`/`snyk` either | Reject for this phase — a new toolchain to install and pin in CI |
| **In-repo evaluator over `npm audit --json`** | **yes, you define it** | **yes** | you own it | **0 new packages** | **Recommend** |

**Why `npm audit` alone is insufficient** [VERIFIED: `npm audit --help` on 11.10.0]: the flag list is
`--audit-level`, `--dry-run`, `--force`, `--json`, `--package-lock-only`, `--no-package-lock`,
`--omit`, `--include`, `--foreground-scripts`, `--ignore-scripts`, workspace flags. **There is no
allowlist flag of any kind.** With 26 critical/high advisories present, `--audit-level=high` exits 1
today and would exit 1 forever, so it cannot be a gate without an allowlist.

**Why `--omit=dev` is not the answer either.** It shifts the numbers (26 → 15 critical/high) but it
does not encode a *decision*: it silently drops `vitest`'s CVSS 9.8 advisory, which is a real risk to
every developer and to CI, and it keeps `postcss`/`nanoid`, which are build-time only. The
runtime/build/dev distinction CONTEXT asks for is a **judgement per advisory** (see the Reach column in
§5), not a flag.

**Why `audit-ci` is disqualified specifically.** `npm view audit-ci dependencies` returns
`{"cross-spawn":"^7.0.3","escape-string-regexp":"^4.0.0","event-stream":"4.0.1","jju":"^1.4.0",
"jsonstream-next":"^3.0.0","readline-transform":"1.0.0","semver":"^7.0.0","tslib":"^2.0.0",
"yargs":"^17.0.0"}`. `event-stream` is the package at the centre of the canonical npm supply-chain
compromise. Version 4.0.1 is post-incident and under different maintenance, and this is not a claim
that it is malicious — but a phase whose whole purpose is a defensible supply-chain position should
not answer it by installing 30 packages, one of them that one, from a tool nobody has published in
two years. State this reasoning in the plan; it is the kind of thing a reviewer will ask about.

### Recommended shape (zero new dependencies)

```
security/audit-policy.md      # the stated policy, in prose. Readable, not a flag in a YAML line.
security/audit-policy.json    # the machine-readable allowlist
scripts/audit-policy.mjs      # ~120 lines: run `npm audit --json`, apply the policy, exit 0/1
package.json                  # "security:audit": "node scripts/audit-policy.mjs"
src/lib/__tests__/audit-policy.test.ts   # a static gate over the policy FILE (see below)
```

`security/audit-policy.json` (GHSA IDs come straight out of each `via[].url`):

```json
{
  "failOn": ["critical", "high"],
  "allowlist": [
    {
      "ghsa": "GHSA-p6gq-j5cr-w38f",
      "package": "nodemailer",
      "reason": "Requires the message-level `raw` option. The single call site (src/lib/email/send.ts:29-35) passes only from/to/subject/html/text; the transport config (src/lib/email/client.ts:8-21) sets no envelope, name, list or OAuth2. Only fix is nodemailer 7 -> 9, a two-major bump excluded by the v1.4 scope.",
      "reach": "runtime",
      "expires": "2026-11-25"
    }
  ]
}
```

**The five assertions the vitest gate must make over that file** — this is where the anti-vacuity
work lives, because the allowlist is precisely where a gate goes quietly green:

1. every entry has a non-empty `reason` of at least N characters that is not one of a
   `FORBIDDEN_REASONS` set (`"dev-only"`, `"n/a"`, `"wontfix"`, `"see above"`) — CONTEXT: *"a bare
   'dev-only' is not a reason"*;
2. every entry has an `expires` that parses and is **in the future** — an expired entry fails the
   suite, which is the mechanism that makes acceptance revisitable;
3. every `ghsa` matches `/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/`;
4. **`failOn` still contains `critical` and `high`** — the anti-vacuity anchor. Without it, emptying
   `failOn` satisfies every negative above and the gate can never fire;
5. **every allowlisted GHSA is still present in a live `npm audit`** — a stale entry means the advisory
   was fixed and the exception is now silently covering nothing. (Run this one in the script, not in
   vitest: it needs network, and `vitest.config.ts`'s base project must stay offline-clean.)

**Two mechanical constraints from existing gates** [VERIFIED: read]:
- `src/lib/mutations/__tests__/db-test-isolation.test.ts:341-351` iterates **every** `package.json`
  script asserting none but `test:db` contains `test:db` or `db.config`. A `security:audit` script is
  fine; do not name it anything containing those tokens.
- `db-test-isolation.test.ts:358-363` asserts the **raw text** of `ci.yml` contains zero occurrences of
  `test:db` and `db.config` — comments included. The new step's comment block must avoid both strings.
- `MIN_CI_STEPS = 6` at `:75`, with the comment *"removing a step is loud while adding one is free"* —
  adding audit steps does not trip it.

---

## §7 — How the audit gate attaches to CI

`.github/workflows/ci.yml` today: one job `ci` (the check-run name in the master ruleset), Node 24 via
`actions/setup-node` pinned to a full SHA, a `postgres:16-alpine` service, `timeout-minutes: 15`, and
seven steps — checkout, setup-node, `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`,
`npm run db:check-migrations`. Steps 4-7 carry `if: ${{ !cancelled() }}` so every gate reports in one
run.

**Where the step goes:** after `Migration chain check`, with `if: ${{ !cancelled() }}`, so a security
finding never hides a type error and vice versa. It must be on **this** job — Phase 46's Route A
reasoning applies unchanged: a new workflow file publishes a check-run name absent from the master
ruleset, which can go red for weeks without blocking a merge.

```yaml
      - name: Security audit policy
        # SEC-05. Runs `npm audit` and applies security/audit-policy.json: every
        # critical/high advisory must be fixed or carry an unexpired, reasoned
        # allowlist entry. Needs network — advisory data lives at the registry and
        # there is no offline database. Proven able to fail: see 47-*-SUMMARY.md.
        if: ${{ !cancelled() }}
        run: npm run security:audit
```

**Network in CI:** yes. GitHub-hosted runners have unrestricted egress, and this job already reaches
the registry for `npm ci`. **There is no offline mode** — `npm audit --package-lock-only` still POSTs
the resolved tree to `registry.npmjs.org/-/npm/v1/security/advisories/bulk`; the flag controls *tree
source*, not *advisory source*. (`osv-scanner --offline-vulnerabilities` with a downloaded DB is the
only genuinely offline option in this space, and it is rejected in §6.)

**A lockfile-only mode is still worth wiring**, for a different reason: `npm audit --package-lock-only`
resolves from `package-lock.json` without `node_modules`, so the policy can be checked before install.
Verified working — the negative control below was built that way.

**Verified negative control for SC-4.** Adding `minimist@1.2.5`:

```
$ npm install --package-lock-only          # in a scratch dir, no node_modules
$ npm audit --json
metadata: {"info":0,"low":0,"moderate":0,"high":0,"critical":1,"total":1}
  minimist critical https://github.com/advisories/GHSA-xvch-5gv4-984h
$ npm audit --audit-level=high; echo $?
1
```

Exactly one critical advisory, exit code 1. `minimist@1.2.5` is the right choice: tiny, zero
dependencies, universally known, and trivially reverted. **The falsification must be run against the
real `ci` check on GitHub, not only locally** — which necessarily exercises the CI path and closes
Phase 46's open item that the 35 phase-46 commits are unpushed and the `Migration chain check` step
has never executed on GitHub. Pushing remains the operator's call; the plan should say so and add a
`checkpoint:human-verify`.

**A trap to design around.** The gate must be green on the *fixed* tree before the negative control is
meaningful. Sequence it: (1) apply the dispositions, (2) write the allowlist for what remains,
(3) observe the gate green, (4) add `minimist@1.2.5`, observe red, record verbatim, (5) revert,
observe green again. Skipping (3) means step (4)'s red proves only that the gate was already red.

---

## §8 — The ten-run proof: cheapest reliable mechanism

**Machine-readable per-test results:** yes. `vitest run --reporter=json --outputFile=<path>` emits a
Jest-compatible document: top-level `numTotalTests` / `numPassedTests` / `numFailedTests` /
`numPendingTests` / `success`, then `testResults[]` with `{name, startTime, endTime, status, message,
assertionResults[]}`, each assertion carrying `{ancestorTitles, fullName, title, status, duration,
failureMessages, meta}`. `fullName` is a stable identity for pass-set diffing, and `duration` gives the
per-test margin data used throughout this document.

> **`--reporter=json` alone suppresses console output.** Pass `--reporter=json --outputFile=… 
> --reporter=default` when you also want to watch it. Verified.

**Cost, measured:** one base run 51–65 s (idle, 4 cores, ~300 % CPU, 169 files / 4739 tests). RSC
project adds <2 s. **Ten iterations of both = 9.4 minutes** (565 s total, min 51 s, max 65 s).

**Verdict: a one-time recorded local proof, not a CI job.** 9.4 minutes is fine to run by hand and
fine to script; adding it to the required `ci` check would take that job from ~95 s to ~11 min for a
property that is already green on the *unfixed* tree (§3) and therefore has near-zero ongoing
discriminating power. The durable regression protection belongs in the two deterministic gates
(§1, §2), which cost milliseconds and run on every commit.

**Recommended artefacts** (both already written and exercised — copy, do not reinvent):

- `/tmp/p47/ten-runs.sh` → `scripts/suite-repeatability.sh` — N iterations, JSON per run, a
  `summary.txt` of `exit=… wall=…s`.
- `/tmp/p47/diff-passsets.mjs` → `scripts/diff-pass-sets.mjs` — builds `file :: fullName` sets, diffs
  each run against the reference, prints `MISSING` / `EXTRA` lines, and **carries its own
  anti-vacuity floor**: it exits 1 if the reference pass set is smaller than the recorded baseline,
  because `IDENTICAL` over two truncated sets proves nothing. This is the Phase 46 lesson
  (`IDENTICAL (both empty — proves nothing)`) applied directly.

Its verbatim output on the current tree is in §3 and should be pasted into the SUMMARY as the "before"
record, alongside the same output after the fix.

---

## §9 — `Dockerfile:24`'s `npm install --legacy-peer-deps` (note: `:24`, not `:7`)

```dockerfile
# Dockerfile:18-24
FROM node:24-alpine AS deps
...
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps
```

**Measured divergence.** `npm install --legacy-peer-deps --dry-run` against the `npm ci` tree:

```
removed 41 packages in 2s        (added 0, changed 0)
@xtuc/long, @xtuc/ieee754, @webassemblyjs/* (16), @tybys/wasm-util, @napi-rs/wasm-runtime,
@jridgewell/source-map, @emnapi/{wasi-threads,core}, webpack-sources, webpack, estraverse,
eslint-scope, es-module-lexer, watchpack, terser, commander, schema-utils, json-schema-traverse,
ajv-keywords, ajv-formats, ajv, neo-async, minimizer-webpack-plugin, jest-worker, supports-color,
events, chrome-trace-event
```

**41 removed, 0 added, 0 changed.** Every package present in both trees is at the same version; the
divergence is a pure set difference, and it is exactly the auto-installed peer set (`@sentry/webpack-plugin`
declares `webpack` as a peer; `--legacy-peer-deps` skips it). **None of the 26 critical/high packages
is in the removal list.**

### Does this undermine a lockfile-derived audit gate? Partly, in a bounded and stateable way.

There are **three distinct trees**, and the gate describes exactly one:

| # | Tree | Produced by | Audited? |
|---|---|---|---|
| 1 | `package-lock.json` | what `npm ci` installs — CI's tree, and every developer's | **yes — this is what the gate reads** |
| 2 | builder stage | `npm install --legacy-peer-deps` (`Dockerfile:24`), dev deps **included** (no `--omit=dev`) | no — today a 41-package subset of #1 at identical versions |
| 3 | runtime image | Next standalone output; only what `instrumentation.js.nft.json` and the Next trace pull in (`Dockerfile:39-60`) | no — a much smaller subset again |

**Honest wording for the plan and for `security/audit-policy.md`:**

> This policy is evaluated against `package-lock.json`, which is the tree `npm ci` installs — CI's tree
> and every contributor's. It is **not** evaluated against the production image. `Dockerfile:24` uses
> `npm install --legacy-peer-deps`, which is not lockfile-exact by contract; measured on 2026-08-25 it
> produced a strict subset of the lockfile tree (41 packages fewer, no version differences, none of
> them carrying a critical or high advisory), and the runtime image narrows that further to Next's
> standalone trace. So the policy is a **conservative over-approximation** of the image's advisory
> surface for the packages it shares — it can report an advisory in a package the image does not ship,
> and it cannot by itself prove which version the image resolved. Converting `Dockerfile:24` to
> `npm ci --legacy-peer-deps` would collapse trees #1 and #2 into one and make that caveat
> unnecessary; it is deferred (BACKLOG, deferred from Phase 46) and is **not** in this phase's scope.

That paragraph is the deliverable here. Do not silently claim the gate covers production, and do not
convert the Dockerfile — the scope decision is already made.

---

## Standard Stack

### Core — everything needed is already installed

| Library | Version | Purpose | Why standard |
|---------|---------|---------|--------------|
| `vitest` | ^4.0.18 → **≥4.1.0 required** (see §5 #5) | All gates | The repo's framework; three projects already wired |
| `typescript` | ^5 (direct dev) | AST gates (§1, §2, §4) | Already a dependency; `ts.createSourceFile` needs no config and no type-checker |
| `npm audit --json` | npm 11.10.0 | Advisory data | Ships with npm; only source of registry advisory data available offline-free here |
| `yaml` | ^2.8.2 (direct) | Parsing `ci.yml` in gates | Already the parser `db-test-isolation.test.ts` uses |
| Node `node:fs`, `node:path` | built-in | Policy script | — |

### Supporting

| Library | Version | Purpose | When to use |
|---------|---------|---------|-------------|
| `semver` | ^7.8.5 (direct dev, added Phase 46) | Comparing advisory ranges to installed versions, if the policy script needs it | Optional — `npm audit` already reports `fixAvailable` |

### Alternatives Considered

| Instead of | Could use | Tradeoff |
|---|---|---|
| in-repo policy script | `audit-ci@7.1.0` | Purpose-built, NSPRecord expiry out of the box — but 25 months stale and depends on `event-stream@4.0.1` (§6) |
| in-repo policy script | `better-npm-audit@3.11.0` | `.nsprc` with `expiry` — but 23 months stale, depends on deprecated `lodash.get`, docs claim npm ≤8 |
| `npm audit` | `osv-scanner` | Broader DB, true offline mode, `ignoreUntil` — but a Go binary, not on npm, not installed here, and a whole new toolchain to pin in CI |
| counting-string facade | injected counter in production code | A per-character `counter++` in the hot path is real cost, and the counter becomes shipped code |
| counting-string facade | `vi.spyOn(String.prototype, 'indexOf')` | Cannot count `path[i]` index reads at all, and cannot see work inside a native regex — fails against Shape A |
| AST gate | `grep -c` over the source | The recorded environment hazard: `grep … \| wc -l` returns a wrong count here (36 matches reported as 19). A count gate built on `wc -l` is a vacuous gate |

**Installation:** none required for the recommended route. The version moves in §5 are `npm install`
of already-declared packages at fixed versions, not new dependencies.

**Version verification** (2026-08-25, `npm view <pkg> version`): `vitest 4.1.11` · `drizzle-orm 0.45.2`
· `next 16.3.2` · `next-auth` `latest=4.24.15`, `beta=5.0.0-beta.32` · `@auth/core 0.41.3` ·
`@auth/drizzle-adapter 1.11.3` · `axios 1.19.0` · `fast-xml-parser 5.11.0` · `lodash 4.18.1` ·
`nodemailer 9.0.5` · `sharp 0.35.3` · `postcss 8.5.26` · `vite` 7.x tail `7.3.0, 7.3.1, 7.3.2, 7.3.3,
7.3.5, 7.3.6`.

---

## Package Legitimacy Audit

**This phase's recommended route installs no new packages.** The audit below covers (a) the tools
evaluated and rejected, and (b) the one package deliberately installed and reverted as the SC-4
negative control.

| Package | Registry | Age | Downloads | Source repo | slopcheck | Disposition |
|---|---|---|---|---|---|---|
| `audit-ci` | npm | last publish **2024-07-03** (25 mo) | — | github.com/IBM/audit-ci | not run (rejected on other grounds) | **REJECTED** — depends on `event-stream@4.0.1`; +30 packages (§6) |
| `better-npm-audit` | npm | last publish **2024-09-09** (23 mo) | — | github.com/jeemok/better-npm-audit | not run | **REJECTED** — depends on deprecated `lodash.get`; docs claim npm ≤8 |
| `osv-scanner` | **not on npm (404)** | — | — | github.com/google/osv-scanner | n/a | **REJECTED** — Go binary; `osv-scanner`, `go`, `trivy`, `snyk` all absent from this host |
| `minimist@1.2.5` | npm | 2020 | very high | github.com/minimistjs/minimist | n/a — deliberately vulnerable | **NEGATIVE CONTROL ONLY** — installed to make the gate go red, then reverted. Verified: exactly 1 critical (GHSA-xvch-5gv4-984h), `npm audit --audit-level=high` exits 1 |

**Existing tree**, `slopcheck scan package.json` (read-only mode), 2026-08-25:

```
scanned 59 packages
1 SUS -- worth a second look       [SUS] vitest (npm)  > Suspiciously close to 'vite'. Could be a typosquat.
58 OK
```

The single `[SUS]` is a **false positive** — `vitest` is the repo's established test framework
(`vitest.config.ts`, `vitest.rsc.config.ts`, `vitest.db.config.ts`, 4771 tests) and its similarity to
`vite` is by design. No action.

**Packages removed due to a `[SLOP]` verdict:** none.
**Packages flagged `[SUS]`:** `vitest` — dismissed as a false positive with the evidence above.

> ⚠ **ENVIRONMENT HAZARD, measured today.** `slopcheck install <pkgs>` **actually installs the
> packages** — it modified `package.json` and `package-lock.json` (`+341/-23` lines) and added 30
> packages to `node_modules`. Restored with `git checkout -- package.json package-lock.json && npm ci`
> (exit 0, tree verified back at `vitest@4.0.18`). **Use `slopcheck scan <file>` for read-only
> checking.** Add this to the executor's hazard list.

---

## Architecture Patterns

### System Architecture Diagram

```
QG-01 ──────────────────────────────────────────────────────────────────────────────

  developer / CI runs `npm test`
        │
        ├─► vitest base project ──► worker pool (default = availableParallelism-1)
        │        │
        │        ├─ COLLECT/IMPORT phase ── no timeout ────┐
        │        │     static top-level imports            │  ← move the ~880ms HERE
        │        │                                         │
        │        ├─ HOOK phase ── hookTimeout 10 000ms ────┤  ← was 1.2-4.9s HERE
        │        │     beforeEach: vi.clearAllMocks() only │
        │        │                                         │
        │        └─ TEST phase ── testTimeout 5 000ms ─────┘
        │              counting facade over tokenizeFieldPath
        │                    │
        │                    ├─ FLOOR   counted >= inputLen   ← catches a REGEX rewrite (counted = 0)
        │                    ├─ CEILING counted <= K*inputLen ← catches a RE-SCANNING rewrite
        │                    └─ FLATNESS ops/char stable      ← catches mildly super-linear
        │
        └─► TypeScript AST gates (no runtime, no DB, sub-second)
                 ├─ resolveFieldPath delegates to tokenizeFieldPath, uses no regex/bulk scanner
                 └─ no dynamic import() inside any lifecycle hook  [floor: >=140 hooks parsed]

SEC-05 ─────────────────────────────────────────────────────────────────────────────

  package-lock.json ──► `npm audit --json` ──► registry advisory endpoint (NETWORK REQUIRED)
                              │
                              ▼
                    scripts/audit-policy.mjs
                              │
             ┌────────────────┼─────────────────────┐
             ▼                ▼                     ▼
   security/audit-policy.json   failOn:[critical,high]   exit 0 / exit 1
   allowlist[{ghsa, reason,          │                        │
              reach, expires}]       │                        ▼
             │                       │              ci.yml step "Security audit policy"
             ▼                       │              on the REQUIRED job `ci`
   src/lib/__tests__/audit-policy.test.ts (static, offline)
      reason non-empty & not FORBIDDEN · expires in the future
      ghsa well-formed · failOn still contains critical+high  ← ANTI-VACUITY ANCHOR

  NOT AUDITED: Dockerfile:24 `npm install --legacy-peer-deps` tree (-41 pkgs today)
               and the Next standalone runtime image (smaller still).  See §9.
```

### Recommended file layout

```
src/lib/execution/
├── condition-evaluator.ts          # + export tokenizeFieldPath (one line, behaviour-preserving)
├── condition-evaluator.test.ts     # :613-637 replaced by the counted assertions
├── toggle.test.ts                  # dynamic import -> static import
└── recursion.test.ts               # same
src/lib/__tests__/
├── suite-timing-hygiene.test.ts    # NEW: the two suite-wide AST gates (§2, §4)
└── audit-policy.test.ts            # NEW: static gate over the policy file
scripts/
├── audit-policy.mjs                # NEW: npm audit --json -> policy -> exit code
├── suite-repeatability.sh          # NEW: N runs, JSON each
└── diff-pass-sets.mjs              # NEW: pass-set diff with an anti-vacuity floor
security/
├── audit-policy.md                 # NEW: the stated policy, prose
└── audit-policy.json               # NEW: the allowlist
```

### Pattern 1 — the counting string facade

```js
// Source: prototyped and measured at /tmp/p47/proto-ops.mjs (this session)
function makeCountingPath(raw) {
  const stats = { chars: 0, calls: 0, coercions: 0 }
  const facade = new Proxy(new String(raw), {          // boxed, so index reads can be trapped
    get(t, key, recv) {
      if (typeof key === "string") {
        if (/^\d+$/.test(key)) { stats.chars++; return raw[Number(key)] }
        if (key === "length") return raw.length
        if (key === "indexOf") return function (needle, from = 0) {
          stats.calls++
          for (let k = Math.max(0, from); k < raw.length; k++) { stats.chars++; if (raw[k] === needle) return k }
          return -1
        }
        if (key === "slice" || key === "substring") return function (a = 0, b = raw.length) {
          stats.calls++; stats.chars += Math.max(0, Math.min(raw.length, b) - Math.max(0, a)); return raw.slice(a, b)
        }
        if (key === "split") return function (sep) { stats.calls++; stats.chars += raw.length; return raw.split(sep) }
        // the escape hatch a regex takes -- counted separately, and the FLOOR is what catches it
        if (key === "valueOf" || key === "toString") return function () { stats.coercions++; return raw }
      }
      if (key === Symbol.toPrimitive) return function () { stats.coercions++; return raw }
      return Reflect.get(t, key, recv)
    },
  })
  return { facade, stats }
}
```

### Pattern 2 — a matcher that unit-tests itself before it sweeps

```js
// Source: the strongest in-repo anti-vacuity form, deployment-docs-accuracy.test.ts:267-304.
// Applied here in /tmp/p47/scan-timing2.mjs -- and it CAUGHT a real over-match in v2.
const pos = scanSource("known-positive.ts", KNOWN_POSITIVE)   // must find >= 2
const neg = scanSource("known-negative.ts", KNOWN_NEGATIVE)   // must find exactly 0
expect(pos.hits.length).toBeGreaterThanOrEqual(2)
expect(neg.hits, "matcher is over-broad; sweep results below prove nothing").toHaveLength(0)
// only THEN run the sweep, and assert its own floor:
expect(totalExpectCallsParsed).toBeGreaterThan(7000)   // measured 8060
```

### Anti-Patterns to Avoid

- **Marking either test serial-only** — explicitly rejected by CONTEXT; keeps a timing assertion alive
  behind a configuration flag that the next parallelisation removes.
- **Raising `hookTimeout`** — the cause is a 780 ms module graph, and it is removable in full.
- **`retries: 1`** — explicitly rejected by the requirement.
- **Counting operations only via `expect` on inline clock calls** — my own v1 scanner did exactly this
  and missed `condition-evaluator.test.ts:636` (§4).
- **A ceiling without a floor** — a regex rewrite reads **zero** counted characters and sails through
  any ceiling. Phase 46 WR-11, verbatim.
- **`npm audit fix`** — measured to add `rolldown`/`tsx`/`esbuild` and move `vite` 7→8 (§5).
- **`--omit=dev` as the policy** — it hides `vitest`'s CVSS 9.8 and keeps build-only `postcss` (§6).
- **`grep … | wc -l` for any count gate** — returns a wrong count in this environment. Use `node -e`.
- **`docker compose restart` after the `next` bump** — runs the old image. `up -d --build`, then
  verify behaviourally.

---

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---|---|---|---|
| Parsing TypeScript to find hooks / calls / regex literals | a regex over source text | `typescript`'s `createSourceFile` + `forEachChild` | Already a direct devDependency; my regex version produced a false positive at `sentry.test.ts:185` that the AST version did not |
| Advisory data | a CVE feed client | `npm audit --json` | Registry-native, already authenticated, already in CI's network path |
| Registry tamper detection | comparing tarball hashes | `npm audit signatures` | Sigstore-backed; measured 1104/1104 signatures + 169 attestations verified in 102 s |
| YAML parsing in a gate | string scanning `ci.yml` | `yaml` (`^2.8.2`, direct) | The parser `db-test-isolation.test.ts` already uses; a parsed check cannot be satisfied by a comment |
| Per-test result extraction | scraping reporter stdout | `--reporter=json --outputFile` | Stable `fullName`/`duration`/`status`; the whole of §2-§4's numbers came from it |
| Deciding whether a bump is in range | eyeballing carets | `semver` (^7.8.5, direct dev) | Present since Phase 46 |

**Key insight:** the only thing worth hand-rolling in this phase is **policy** — the allowlist and its
expiry semantics. Everything mechanical already exists in the tree. Both off-the-shelf policy tools are
~2 years stale and each adds packages, one of them `event-stream`. Writing ~120 lines of policy glue is
cheaper *and* safer than importing 30 packages to avoid writing it.

---

## Runtime State Inventory

Not a rename/refactor/migration phase — but it does mutate installed state, so the equivalent is worth
one table.

| Category | Items found | Action required |
|---|---|---|
| Stored data | **None.** No database rows, ChromaDB collections, Mem0 records or Redis keys are touched. Verified: the phase changes test files, `package.json`/`package-lock.json`, `ci.yml`, and adds `scripts/` + `security/` files. | none |
| Live service config | **None in scope.** The GitHub master ruleset's required check-run name stays `ci` (steps are added to the existing job, not a new workflow) — this is the whole point of Phase 46 Route A. | none |
| OS-registered state | **None.** | none |
| Secrets / env vars | **None.** No new secret or env var. `npm audit` needs only public registry access. | none |
| **Build artifacts / installed packages** | **YES — the material one.** Any version change in §5 rewrites `package-lock.json` and `node_modules`; a `next` bump additionally invalidates `.next/` and the Docker image. | `npm install <pkg>@<ver>` per disposition, then **`docker compose up -d --build`** (never `restart`), then verify behaviourally: `docker compose exec app node -v` and `curl /api/health` for 200 with `db.ok:true` and 10/10 processors. |
| **Uncommitted tooling side-effects** | **YES.** `slopcheck install` rewrote `package.json` + `package-lock.json` during research (restored). | Use `slopcheck scan`; check `git status` after any tool that touches the manifest. |

---

## Common Pitfalls

### Pitfall 1: The ten-run proof passes on the unfixed tree
**What goes wrong:** SC-1 is declared satisfied, the phase ships, and nothing has been shown to improve.
**Why it happens:** Measured — 16/16 runs green, 16/16 identical pass sets, at idle, 2x and 3x
oversubscription. The flake needs roughly 7x, which is the multi-worktree executor environment.
**How to avoid:** Run the ten-run **before and after**, record both, and pair it with a metric that
moves: the linearity ratio's margin (1.52x at 3x → a deterministic integer) and the `beforeEach` cost
(4121–4850 ms at 3x → 3.0 ms).
**Warning sign:** a SUMMARY whose only QG-01 evidence is "ten runs, all green."

### Pitfall 2: The operation counter is blind to the regex it exists to catch
**What goes wrong:** The counted-ops assertion ships with only a ceiling, someone rewrites the parser
with a catastrophic regex, and the gate stays green because the counter reads **zero**.
**Why it happens:** Backtracking happens inside a native `exec` call. No JS-level counter can see it.
Measured: BACKTRACK-A counted 0 chars and 4 coercions at every input size.
**How to avoid:** `counted >= inputLength` as a hard floor, plus the AST gate forbidding regex
construction inside the two functions. Both prototyped and both observed red (§1).

### Pitfall 3: The floor is applied per-path and the gate demands wasted work
**What goes wrong:** The floor is written per-input; the quote-storm path (`'trigger.data["' +
'"'.repeat(n) + '"]'`) reads only **43 characters of 2016** because it is correctly rejected after ~15;
the gate goes red on a correct parser and someone deletes the floor.
**How to avoid:** Aggregate the floor over the four traversal-requiring paths. Assert the quote-storm
case separately as an early-rejection bound (`counted <= 200`, independent of n).

### Pitfall 4: Moving the import to `beforeAll` instead of module scope
**What goes wrong:** The cost moves from `beforeEach` to `beforeAll` — still a hook, still under the
same 10 000 ms `hookTimeout`. Nothing is fixed; it just fires once.
**How to avoid:** A **top-level static import**. `vi.mock` is hoisted above imports, so the mocks
apply. Measured: 3.0 ms first test, all five still pass. And note `export-events-live.test.ts:47` /
`formatters-live.test.ts:93` already carry `beforeAll(..., 60000)` — proof that the `beforeAll`
workaround is the road to a 60-second number.

### Pitfall 5: Fixing `toggle.test.ts` and leaving `recursion.test.ts`
**What goes wrong:** QG-01 is closed on the two named files; `recursion.test.ts:82` is the same
dynamic-import-in-`beforeEach` and measured **2453–3263 ms at 3x** — the next one to time out.
**How to avoid:** Fix both, and add the suite-wide AST gate so a seventh cannot be added silently.
`crm/http/notification/email.test.ts` are the same class with `vi.resetModules()`; treat them
deliberately (fix or document), do not just miss them.

### Pitfall 6: The new AST/scan gate cannot see the defect it was written for
**What goes wrong:** Exactly what happened to my v1 timing scanner — it matched only inline clock calls
and **missed `condition-evaluator.test.ts:636`**, the assertion QG-01 names.
**How to avoid:** KNOWN_POSITIVE / KNOWN_NEGATIVE fixtures unit-tested before the sweep, with
`condition-evaluator.test.ts:636`'s exact shape (`const small = …; const large = …;
expect(large / small).toBeLessThan(80)`) as a KNOWN_POSITIVE. Plus a parse floor
(8060 `expect()` calls; 151 hook calls).
**Warning sign:** the sweep reports zero hits on a tree you know contains three.

### Pitfall 7: The audit gate is red before the negative control runs
**What goes wrong:** `minimist@1.2.5` is added, the check is red, everyone declares SC-4 proven — but
the check was red beforehand because the allowlist was incomplete.
**How to avoid:** Sequence green → red → green, and record all three (§7).

### Pitfall 8: An allowlist entry with a reason that is not a reason
**What goes wrong:** `{"reason": "dev-only"}` lands, and CONTEXT's explicit prohibition is violated by
a string the gate accepts.
**How to avoid:** A `FORBIDDEN_REASONS` set and a minimum length in `audit-policy.test.ts`. Break it on
purpose: set one reason to `"dev-only"` and watch the suite go red.

### Pitfall 9: `failOn` is emptied and every allowlist assertion still passes
**What goes wrong:** The classic v1.3 shape — the gate's *own configuration* becomes the escape hatch.
An empty `failOn` satisfies "no unallowlisted critical/high" perfectly.
**How to avoid:** `expect(policy.failOn).toEqual(["critical","high"])` — an exact assertion, not a
`toContain`. This is the anti-vacuity anchor for the entire policy file.

### Pitfall 10: The new npm script or CI comment collides with a Phase 32/46 gate
**What goes wrong:** `db-test-isolation.test.ts:341-351` iterates every `package.json` script asserting
none but `test:db` contains `test:db`/`db.config`; `:358-363` asserts the **raw text** of `ci.yml`
contains zero occurrences of either, comments included.
**How to avoid:** Name the script `security:audit` (or similar). Do not write the strings `test:db` or
`db.config` in the new workflow comment.

### Pitfall 11: `--reporter=json` silently swallows the console output
**What goes wrong:** The ten-run script produces JSON and nothing else, so a startup error looks like a
clean run until the JSON is parsed. (This bit during research.)
**How to avoid:** `--reporter=json --outputFile=… --reporter=default`, and always check
`success`/`numPassedTests` in the JSON, never just the exit code.

### Pitfall 12: `docker compose restart` after the `next` bump
**What goes wrong:** The container runs the old image. Recorded project lesson; `--build` can also hit
the layer cache.
**How to avoid:** `docker compose up -d --build`, then behavioural verification.

---

## Code Examples

### Extracting a pass set from a vitest JSON report

```js
// Source: measured against /tmp/p47/ten/base-01.json this session
const r = JSON.parse(fs.readFileSync(file, "utf8"))
const pass = new Set()
for (const f of r.testResults) {
  const rel = f.name.replace(REPO + "/", "")
  for (const a of f.assertionResults) if (a.status === "passed") pass.add(rel + " :: " + a.fullName)
  // a file that fails to COLLECT has zero assertionResults -- record it or the diff misses it entirely
  if (f.status === "failed" && f.assertionResults.length === 0) {
    fail.add(rel + " :: <file-level failure> " + (f.message || "").slice(0, 200))
  }
}
```

### Finding a dynamic import inside a lifecycle hook (AST, with its floor)

```js
// Source: /tmp/p47/scan-hooks.mjs -- 175 files, 151 hooks, 13 hits, 0 false positives
const HOOKS = new Set(["beforeEach", "beforeAll", "afterEach", "afterAll"])
const visit = (node, hookCtx) => {
  let ctx = hookCtx
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && HOOKS.has(node.expression.text)) {
    hooksSeen++
    ctx = { name: node.expression.text, line: lineOf(node) }
  }
  if (ctx && ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    hits.push({ file, hook: ctx.name, line: lineOf(node), spec: node.arguments[0]?.getText(src) })
  }
  ts.forEachChild(node, (c) => visit(c, ctx))
}
// FLOOR: a parser that stopped finding hooks satisfies "no hits" perfectly.
expect(hooksSeen, "the hook parser found nothing -- this sweep proves nothing").toBeGreaterThan(140)
```

### Applying the policy to `npm audit --json`

```js
// Source: verified shape from `npm audit --json` on npm 11.10.0, this session
const audit = JSON.parse(execFileSync("npm", ["audit", "--json"], { encoding: "utf8" }))
// NOTE: `npm audit` exits 1 whenever any advisory exists, so do NOT branch on its exit code --
// capture stdout and branch on the parsed content. (Phase 46's lesson about drizzle-kit, same shape.)
const allowed = new Map(policy.allowlist.map((e) => [e.ghsa, e]))
const offenders = []
for (const [name, v] of Object.entries(audit.vulnerabilities)) {
  if (!policy.failOn.includes(v.severity)) continue
  for (const via of v.via) {
    if (typeof via !== "object") continue
    const ghsa = (via.url || "").split("/").pop()          // "https://github.com/advisories/GHSA-xxxx-..."
    const entry = allowed.get(ghsa)
    if (!entry) { offenders.push({ name, ghsa, title: via.title, severity: via.severity }); continue }
    if (new Date(entry.expires) < new Date()) offenders.push({ name, ghsa, reason: "allowlist entry EXPIRED " + entry.expires })
  }
}
process.exit(offenders.length ? 1 : 0)
```

---

## State of the Art

| Old approach | Current approach | When changed | Impact |
|---|---|---|---|
| Timing-ratio assertions to detect ReDoS | Deterministic operation counting + static regex-safety analysis | Ongoing; ReDoS-safety linters (`eslint-plugin-security` `detect-unsafe-regex`, `recheck`, `redos-detector`) matured 2023-2025 | The ratio approach is now recognised as a false-failure generator under any parallel runner. This phase's floor+ceiling is the counting form |
| `npm audit` as a CI gate | `npm audit` as a **data source** under a repo-owned policy | since npm 7 removed nothing but added no allowlist | With 38 advisories in any real tree, an unfiltered `--audit-level` gate is either always red or always disabled |
| Advisory-only supply-chain checks | Advisory checks **plus** signature/attestation verification | `npm audit signatures` GA'd with npm 8.15/9 (Sigstore) | Catches tampering that advisory data cannot. Measured 1104/1104 clean here |
| `beforeEach(async () => await import(...))` as the vitest mocking idiom | Top-level static import — `vi.mock` has been hoisted above imports since vitest 0.x | long-standing; the idiom persists from Jest-era `jest.resetModules()` habits | The dynamic form buys nothing without `vi.resetModules()`, and costs a full module graph inside a 10 s hook budget |

**Deprecated/outdated in this context:**
- `audit-ci` — last publish 2024-07-03; still the top search result, still recommended in blog posts.
- `better-npm-audit` — last publish 2024-09-09; depends on the deprecated `lodash.get`.
- `npm-audit-resolver` — last publish 2023-04-15, still at `3.0.0-RC.0`. Dead.
- The `.nsprc` filename convention itself predates GHSA IDs and originates with the retired
  Node Security Platform. Both surviving tools still accept it.

---

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|---|---|---|
| A1 | vitest applies **no** timeout to the collect/import phase, so relocating the ~880 ms there removes it from any budget | §2 | Low. Directly measured (the fixed file completes with `import 883ms` and no timeout), but not confirmed against vitest's documented config surface. If some `--collect-timeout`-like option exists, the fix is still a 260x reduction in the hook. |
| A2 | GitHub-hosted runners have unrestricted egress to `registry.npmjs.org` for the advisory bulk endpoint | §7 | Low. The `ci` job already runs `npm ci` from that registry. Not tested from GitHub in this session — the phase-46 commits are unpushed. |
| A3 | `next` 16.1.6 → 16.3.2 is behaviour-preserving for this app | §5 | **MEDIUM — the largest open risk in this phase.** npm does not flag it `isSemVerMajor` and it is a minor within Next 16, but Next minors have moved App Router internals before. Must be gated by a full `npm test` + `docker compose up -d --build` + `/api/health` + a manual `/deals` load. |
| A4 | `nodemailer`'s six advisories are all unreachable from this codebase | §5 | Low-MEDIUM. Verified by reading the only call site and the only transport config, and by confirming the Credentials-only provider list at `src/auth.ts:38-39`. Not verified against nodemailer's source for an indirect path (e.g. header construction from `to`). |
| A5 | `@aws-sdk/xml-builder@3.972.40` removes `fast-xml-parser` entirely, so a `@aws-sdk/client-s3` bump within `^3.998.0` clears advisory #11 | §5 | Low. `npm view @aws-sdk/xml-builder@3.972.40 dependencies` returns only `tslib` and `@smithy/types`. Not verified end-to-end by installing. |
| A6 | `K = 6` is the right ceiling constant | §1 | Low. Measured 1.71 aggregate with the backtracking case at 179–1307. Any K in [3, 20] separates them; pin it from a fresh measurement at implementation time and comment the measurement. |
| A7 | `minimist@1.2.5` will still carry exactly one critical advisory when the negative control is run | §7 | Low. Verified today. Advisory data can change; if it does, any other well-known vulnerable pin works — re-verify before use. |
| A8 | The `[SUS]` slopcheck verdict on `vitest` is a false positive | Package Legitimacy Audit | Negligible. `vitest` is the repo's framework across three config files and 4771 tests. |

---

## Open Questions

1. **Should the four `vi.resetModules()` files (`crm`, `http`, `notification`, `email`) be converted?**
   - Known: they pay the import per test, worst case 535 ms first / 740 ms total for 35 tests. They
     call `vi.resetModules()`, so a static import would change semantics.
   - Unclear: whether the module reset is load-bearing for any of them.
   - Recommendation: leave them, and make the suite-wide AST gate allow a hook import **only** where
     `vi.resetModules()` is present in the same file — an explicit, documented carve-out with a
     comment, rather than a silent omission. Revisit if any of them starts approaching its budget.

2. **Does `next@16.3.2` require any code change in this app?** (See A3.)
   - Recommendation: make it its own task with its own verification gate, and be prepared to split it
     out to a follow-up phase if `npm test` goes red. Do not bundle it with the QG-01 work.

3. **Should `npm audit signatures` be on the required check given its 102 s cost?**
   - Known: `ci` currently runs ~95 s total (per `ci.yml`'s own comment) with a 15-minute timeout.
     Adding 102 s roughly doubles it.
   - Recommendation: yes, as a separate `if: ${{ !cancelled() }}` step. Doubling a 95 s check to keep a
     tamper-detection gate is a good trade, and the timeout has ample room. State the cost in the
     step's comment so the next person weighing it has the number.

4. **Where does `security/audit-policy.md` live in the docs tree?**
   - Known: there is no `SECURITY.md` at the repo root or in `.github/`. `docs/` has `admin/`, `api/`,
     `development/`, `user/`.
   - Recommendation: `security/audit-policy.md` at the repo root (next to its JSON), linked from
     `docs/development/contributing.md`. A root `SECURITY.md` is a *disclosure* policy, a different
     document; do not conflate them.

---

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|---|---|---|---|---|
| Node (host) | everything | ✓ | v24.13.1 | — |
| npm | audit, install | ✓ | 11.10.0 | — |
| `npm audit` / `npm audit signatures` | SEC-05 | ✓ | built in; signatures verified 1104/1104 in 102 s | none — this is the data source |
| network → `registry.npmjs.org` | advisory data | ✓ | verified this session | **none.** `--package-lock-only` changes tree source, not advisory source |
| vitest | all gates | ✓ | 4.0.18 (**bump to ≥4.1.0** — §5 #5) | — |
| `typescript` | AST gates | ✓ | direct devDep `^5` | — |
| `yaml` | `ci.yml` parsing | ✓ | direct dep `^2.8.2` | — |
| `semver` | range comparisons | ✓ | direct devDep `^7.8.5` | — |
| `slopcheck` | package legitimacy | ✓ | `~/.local/bin/slopcheck`; `scan` and `install` subcommands | **`scan` only** — `install` mutates the manifest |
| Docker (no sudo) | image rebuild after a version bump | ✓ | app / postgres / mailhog all up | — |
| CPU for the ten-run | SC-1 | ✓ | 4 cores, 16.7 GB; 9.4 min for 10 iterations | — |
| `osv-scanner` | alternative tooling | **✗** | — | rejected in §6; `npm audit` covers it |
| `go` / `trivy` / `snyk` | alternative tooling | **✗** | — | not needed under the recommendation |

**Missing dependencies with no fallback:** none.
**Missing with fallback:** `osv-scanner` / `go` / `trivy` / `snyk` — all only relevant to rejected
alternatives.

---

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json`.

### Test Framework

| Property | Value |
|---|---|
| Framework | vitest 4.0.18 (**must move to ≥4.1.0**, SEC-05 #5), three projects |
| Config file | `vitest.config.ts` (base — where every new gate belongs) |
| Defaults in force | no `pool`, no `maxWorkers`, no `testTimeout`, no `hookTimeout` set → **testTimeout 5000 ms, hookTimeout 10000 ms**, default worker count |
| Quick run command | `./node_modules/.bin/vitest run src/lib/execution/ src/lib/__tests__/` |
| Full suite command | `npm test` → `vitest run && vitest run --config vitest.rsc.config.ts` |
| Measured baseline | **4739 passed / 32 skipped**, 169 files, 51–65 s per base run |
| DB project | `npm run test:db` — must stay outside `npm test`; `db-test-isolation.test.ts` enforces it |
| New test files | must be `*.test.ts`. `*.db.test.ts` / `*.rsc.test.ts` are excluded from the base project and would never run in CI |
| Binary invocation | call `./node_modules/.bin/vitest` directly when interleaving matters — `npm run` reorders a child's stdout/stderr |

### Phase Requirements → Test Map

| Req | Behaviour | Type | Automated command | Exists? |
|---|---|---|---|---|
| QG-01 SC-2 | `tokenizeFieldPath` reads ≥ 1× and ≤ K× the input length, over the aggregate traversal set | unit (deterministic integers) | `vitest run src/lib/execution/condition-evaluator.test.ts` | ❌ Wave 0 |
| QG-01 SC-2 | ops/char is flat across a ≥16x input span (`≤1.25×`) | unit | same | ❌ Wave 0 |
| QG-01 SC-2 | the quote-storm path is rejected in ≤200 counted ops, independent of n | unit | same | ❌ Wave 0 |
| QG-01 SC-2 | `resolveFieldPath` delegates to `tokenizeFieldPath`; neither uses a regex or a bulk scanner | unit (TS AST) + 4 anti-vacuity floors | same | ❌ Wave 0 |
| QG-01 SC-2 | **NEGATIVE CONTROL A:** a regex-backtracking `tokenizeFieldPath` → FLOOR fails (counted = 0) **and** the AST gate fails | manual, output recorded verbatim in the SUMMARY | replace → run → restore → run | ❌ Wave 0 (prototype proven, §1) |
| QG-01 SC-2 | **NEGATIVE CONTROL B:** a restart-on-failure `tokenizeFieldPath` → CEILING fails (1307 ops/char) | manual, recorded | same | ❌ Wave 0 (proven, §1) |
| QG-01 SC-1 | `toggle.test.ts` first test ≤ 50 ms; all 5 tests still pass | unit (existing tests, new timing observed via JSON) | `vitest run src/lib/execution/toggle.test.ts --reporter=json` | ✅ tests exist, fix ❌ |
| QG-01 SC-1 | `recursion.test.ts` same | unit | `vitest run src/lib/execution/recursion.test.ts` | ✅ / ❌ |
| QG-01 | **No `await import()` inside any lifecycle hook** (except files that call `vi.resetModules()`, and the two skipped `*-live` files) | unit (TS AST, floor ≥140 hooks parsed) | `vitest run src/lib/__tests__/suite-timing-hygiene.test.ts` | ❌ Wave 0 |
| QG-01 | **No `expect()` over a clock-derived DELTA or RATIO** anywhere in the suite | unit (TS AST + taint, floor ≥7000 `expect()` parsed, self-tested vs KNOWN_POSITIVE/NEGATIVE) | same file | ❌ Wave 0 |
| QG-01 | **NEGATIVE CONTROL C:** re-add a `beforeEach(async () => { await import(...) })` → gate red; re-add `expect(Date.now()-t).toBeLessThan(N)` → gate red | manual, recorded | add → run → revert → run | ❌ Wave 0 |
| QG-01 SC-1 | Ten consecutive full-suite runs at the default worker count produce the same pass set | integration, scripted | `bash scripts/suite-repeatability.sh 10 && node scripts/diff-pass-sets.mjs` | ❌ Wave 0 |
| QG-01 SC-1 | The diff script's own anti-vacuity floor fires on a truncated reference | unit or manual | truncate a JSON report → script exits 1 | ❌ Wave 0 |
| SEC-05 SC-3 | Every critical/high advisory is fixed or carries an unexpired reasoned allowlist entry | integration (network) | `npm run security:audit` | ❌ Wave 0 |
| SEC-05 SC-4 | Policy file shape: reason non-empty & not in `FORBIDDEN_REASONS`; `expires` parses and is in the future; `ghsa` well-formed; **`failOn` equals `["critical","high"]`** | unit (static, offline) | `vitest run src/lib/__tests__/audit-policy.test.ts` | ❌ Wave 0 |
| SEC-05 SC-4 | **NEGATIVE CONTROL D:** set one `reason` to `"dev-only"` → red; back-date one `expires` → red; empty `failOn` → red | unit — make all three **permanent** in-file negative controls, like `node-engines-floor.test.ts`'s | same file | ❌ Wave 0 |
| SEC-05 SC-4 | **NEGATIVE CONTROL E:** `npm i -D minimist@1.2.5` → the **required GitHub `ci` check** goes red; revert → green | manual, verbatim output in the SUMMARY, run on GitHub | push → observe → revert → observe | ❌ Wave 0 |
| SEC-05 | Registry signatures and attestations verify | integration (network) | `npm audit signatures` | ✅ passes today (1104/1104, 169 attestations) |
| SEC-05 | After version bumps: the running container is healthy on the new tree | integration (manual, Docker) | `docker compose up -d --build` → `docker compose exec app node -v` → `curl -s localhost:3001/api/health` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `./node_modules/.bin/vitest run src/lib/__tests__/ src/lib/execution/` — the new
  gates plus the two fixed files. Sub-second, no DB, no network.
- **Per wave merge:** `npm test` + `npm run typecheck` + `npm run lint` (**0 errors**; gate on errors,
  never on the warning total — it differs between a worktree and master).
- **Phase gate:** full suite green · `npm run security:audit` green · **all five negative controls
  (A–E) observed red with verbatim output pasted into the SUMMARY** · the ten-run pass-set diff
  recorded before **and** after · `docker compose up -d --build` with `/api/health` 200 and 10/10
  processors · the GitHub `ci` check observed red then green for control E.

### Wave 0 Gaps

- [ ] `src/lib/__tests__/suite-timing-hygiene.test.ts` — the two suite-wide AST gates (QG-01)
- [ ] `src/lib/__tests__/audit-policy.test.ts` — static policy-file gate + 3 permanent negative controls (SEC-05)
- [ ] `scripts/audit-policy.mjs` — the policy evaluator
- [ ] `scripts/suite-repeatability.sh` + `scripts/diff-pass-sets.mjs` — the SC-1 harness
- [ ] `security/audit-policy.md` + `security/audit-policy.json` — the stated policy and allowlist
- [ ] npm script `security:audit` (must not contain `test:db` / `db.config`)
- [ ] `ci.yml` step `Security audit policy` (+ optional `npm audit signatures` step); comment must not contain `test:db` / `db.config`
- [ ] Export `tokenizeFieldPath` from `src/lib/execution/condition-evaluator.ts`
- [ ] Replace `condition-evaluator.test.ts:613-637`
- [ ] `toggle.test.ts` and `recursion.test.ts` — dynamic hook import → static top-level import
- [ ] `client-formula-bounds.test.ts:129` and `formula-engine.test.ts:403` — drop the elapsed assertion, keep the explicit `{ timeout }`
- [ ] Version bumps per §5, each verified with `npm audit --json`
- No framework install needed — vitest, typescript, yaml and semver are all present.

---

## Security Domain

`security_enforcement` is not set in `.planning/config.json` → treated as **enabled**.

### Applicable ASVS Categories

| Category | Applies | Standard control |
|---|---|---|
| V2 Authentication | **indirectly — yes** | Three of the four criticals are Auth.js (`@auth/core` / `next-auth` / `@auth/drizzle-adapter`): OAuth state/nonce/PKCE cookies not bound to the issuing provider (GHSA-x445-f3h2-j279), `getToken()` throwing on a malformed Bearer header (GHSA-xmf8-cvqr-rfgj, CVSS 7.5), and existence-based auth checks failing **open** on a configuration error (GHSA-8fpg-xm3f-6cx3). This app uses the Credentials provider with JWT (`src/auth.ts:38-39`), which narrows but does not eliminate exposure. **Fix is in-range: `next-auth@5.0.0-beta.32` + `@auth/drizzle-adapter@1.11.3`.** |
| V3 Session Management | indirectly | same trio |
| V4 Access Control | **yes** | `next`'s middleware/proxy bypass family (GHSA-492v-c6pp-mqqv CVSS 8.1, GHSA-26hh-7cqf-hhc6, GHSA-267c-6grr-h53f) — the substantive argument for the 16.3.2 bump |
| V5 Input Validation | **yes** | `drizzle-orm` GHSA-gpj5-g38j-94v9 — SQL injection via improperly escaped SQL identifiers, in the request path, fixed by a **patch** bump. This is the highest-value single change in the phase |
| V6 Cryptography | no | nothing in scope |
| V7 Error Handling & Logging | **yes** | The negative controls' verbatim output is the deliverable; do not swallow stderr. Note `src/lib/email/client.ts:25-33`'s deliberate four-field allowlist — do not "complete" it |
| V10 Malicious Code | **yes — the core of this phase** | Zero new packages under the recommendation. `npm audit signatures` (1104/1104 verified) as tamper detection. `slopcheck scan` on any addition. `minimist@1.2.5` is introduced *deliberately* and must be reverted with `git checkout` on both `package.json` and `package-lock.json`, then `npm ci` |
| V12 Files & Resources | indirectly | `postcss` GHSA-6g55-p6wh-862q / GHSA-r28c-9q8g-f849 — arbitrary `.map` read via attacker-controlled `sourceMappingURL`. Build-time only here |
| V14 Configuration | **yes** | The policy file *is* configuration; `failOn` must be asserted exactly (`toEqual`, not `toContain`) or the policy can be silently emptied |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard mitigation |
|---|---|---|
| ReDoS via a regex field-path parser | Denial of Service | Keep the single forward scan; the AST gate forbids regex construction in `tokenizeFieldPath`/`resolveFieldPath`; the counted floor catches a regex rewrite the ceiling cannot |
| SQL identifier injection through an ORM | Tampering | `drizzle-orm@0.45.2` |
| Prototype-chain hop via bracket notation | Tampering / Elevation | Already mitigated: `FORBIDDEN_SEGMENTS` at `condition-evaluator.ts:14` rejects `__proto__`/`constructor`/`prototype` during tokenisation. **The replacement must not disturb it** — keep the existing coverage of those cases |
| Middleware / proxy bypass in App Router | Elevation of Privilege | `next@16.3.2` |
| Auth check failing **open** on misconfiguration | Elevation of Privilege | `next-auth@5.0.0-beta.32` |
| Slopsquatted / hallucinated package | Malicious Code | Zero new packages; `slopcheck scan` (read-only) on any addition; `npm audit signatures` |
| A dependency-audit tool that is itself a supply-chain risk | Malicious Code | The `event-stream` finding — reject `audit-ci`, own the ~120 lines |
| SMTP certificate verification disabled | Spoofing / MITM | `src/lib/email/client.ts:20` sets `rejectUnauthorized: false`. **Out of scope; record in `BACKLOG.md`** |
| A gate that cannot fail | *(the project's own recorded threat)* | Five designed negative controls (A–E), each observed red with output recorded; anti-vacuity floors on every matcher; `failOn` asserted with `toEqual` |

---

## Project Constraints

There is **no `./CLAUDE.md`, `./AGENTS.md`, `.claude/skills/` or `.agents/skills/`** in this repository
[VERIFIED]. The constraints below come from `.planning/STATE.md`, `47-CONTEXT.md`, the Phase 46
research, and this session's own measurements, and carry the same authority.

- **Break every gate on purpose and observe it red before trusting it.** v1.3 shipped six gates that
  could not fail; Phase 46's review found a seventh inside the phase built to eliminate them. **This
  research already produced its own eighth** — a timing scanner that could not see
  `condition-evaluator.test.ts:636` (§4). Assume this phase will produce one too.
- **Prefer behavioural assertions and parsed-structure checks to raw-token greps.** Every gate
  recommended here is either a counted integer or a TypeScript AST walk.
- **`grep … | wc -l` returns a WRONG count in this environment** (36 matches reported as 19).
  Recompute with `node -e`. A count gate built on `wc -l` is a vacuous gate.
- **`npm run` reorders a child's stdout/stderr** — invoke `./node_modules/.bin/<tool>` directly when
  interleaving matters. **`npx <tool>` is rewritten into a nonexistent npm script.**
- **`docker` needs no `sudo`.** Never embed a password in a command.
- **Never run `npm run dev` / `next dev`. Never run `drizzle-kit push`.** Docker only; app at
  http://localhost:3001, Postgres host `localhost:5433`, in-network `postgres:5432`.
- **`docker compose restart` does not rebuild** — `up -d --build`, and `--build` can hit the layer
  cache, so verify behaviourally.
- **`.planning` is gitignored but tracked** — the GSD commit helper fails; force-add individual files.
- **Worktrees are in use** (`use_worktrees: true`) and worktrees branch from a stale base — fix with
  `merge --ff-only`, never `reset --hard`.
- **Gate lint on ERRORS, never on the warning total** — it is 124 on master and 122 in a worktree.
- **New test files must be `*.test.ts`.**
- **`slopcheck install` mutates `package.json` and `package-lock.json`.** Use `slopcheck scan`.
- **Leave the repo CLEAN and the compose stack UP.** Verified at the end of this session:
  `git status --porcelain` empty; `pipelite-app-1`, `pipelite-postgres-1` (healthy), `pipelite-mailhog-1`
  all up.

---

## Sources

### Primary (HIGH confidence — measured or read in this session)

- `src/lib/execution/condition-evaluator.ts:1-111` and `.test.ts:574-638` — read in full
- `src/lib/execution/toggle.test.ts`, `recursion.test.ts:70-95` — read in full
- `src/lib/mutations/__tests__/db-test-isolation.test.ts:54-90, 160-230, 300-400` — the gates a new script/step must not trip
- `.github/workflows/ci.yml` — read in full
- `Dockerfile:1-60` — read
- `vitest.config.ts`, `vitest.rsc.config.ts`, `package.json` — read
- `src/lib/email/{client.ts,send.ts:1-60}`, `src/auth.ts:1-40` — nodemailer reachability
- `git show a5d2ab1:src/lib/execution/condition-evaluator.ts` — the pre-T-34-20 implementation (`split(".")`, linear)
- `npm audit --json`, `npm audit --omit=dev --json`, `npm audit fix --dry-run`, `npm audit signatures`, `npm ls --all --json`, `npm view` — 2026-08-25
- `npm install --legacy-peer-deps --dry-run` — the §9 divergence measurement
- Prototypes written and run this session, all under `/tmp/p47/`: `proto-ops.mjs`, `proto-ops2.mjs`, `proto-ast.mjs`, `scan-hooks.mjs`, `scan-timing2.mjs`, `ratio-under-load.mjs`, `diff-passsets.mjs`, `ten-runs.sh`, `contended.sh`, `probe-{import,graph,schema,toggle-fixed}.test.ts`
- Run artefacts: `/tmp/p47/ten/` (10 idle), `/tmp/p47/contend/` (3 @ 2x), `/tmp/p47/contend8/` (3 @ 3x), `/tmp/p47/ch.json` (26 advisories with URLs)
- `.planning/phases/46-migration-chain-toolchain-floor/46-RESEARCH.md` §Common Pitfalls, §Validation Architecture

### Secondary (MEDIUM confidence — official project docs, cross-checked against the registry)

- github.com/IBM/audit-ci — NSPRecord `active`/`notes`/`expiry`, GHSA IDs, JSONC/JSON5 config. Cross-checked with `npm view audit-ci version time repository.url dependencies` (7.1.0, 2024-07-03, `event-stream@4.0.1`)
- github.com/jeemok/better-npm-audit — `.nsprc` `active`/`notes`/`expiry`. Cross-checked with `npm view` (3.11.0, 2024-09-09, `lodash.get`)
- GitHub Advisory Database — every GHSA URL in §5 comes from `npm audit --json`'s own `via[].url`

### Tertiary (LOW confidence — not verified in this session)

- That GitHub-hosted runners reach the npm advisory endpoint (A2) — inferred from the job's existing `npm ci`
- That `next@16.3.2` is behaviour-preserving for this app (A3) — inferred from semver and npm's `isSemVerMajor: false`
- `osv-scanner`'s `--offline-vulnerabilities` / `ignoreUntil` semantics — from general knowledge; the tool is not installed and was not exercised

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|---|---|---|
| §1 linearity replacement | **HIGH** | Prototyped; both failure modes observed red; determinism shown as one distinct integer over 20 repeats |
| §2 `toggle.test.ts` cause & fix | **HIGH** | Cost attributed to 67 % on a single vendor module by direct probe; the fix was applied to a copy and measured at 3.0 ms with all tests passing |
| §3 today's baseline | **HIGH** | 16 full-suite runs across three load levels; the margin curve is measured, not extrapolated |
| §4 suite sweep | **HIGH** | AST with taint tracking, self-tested against fixtures, 8060 `expect()` parsed; the over-match was caught by the fixtures and triaged by hand |
| §5 advisory triage | **HIGH** for counts/reachability/in-range fixes (all measured) · **MEDIUM** for the `next` and `nodemailer` judgements (A3, A4) |
| §6 tooling | **HIGH** | Publish dates and dependency lists read from the registry; `osv-scanner` absence verified |
| §7 CI attachment | **HIGH** for placement and constraints (files read) · **MEDIUM** for GitHub runner network (A2) |
| §8 ten-run mechanism | **HIGH** | Built, run ten times, cost measured at 9.4 min |
| §9 Dockerfile divergence | **HIGH** | `--dry-run` measured: 41 removed / 0 added / 0 changed |

**Research date:** 2026-08-25
**Valid until:** **2026-09-01 for §5** — advisory counts move weekly; **re-run `npm audit --json` at
plan time and again at execution time, and reconcile against the table in §5.** Everything else is
stable for 30 days.
