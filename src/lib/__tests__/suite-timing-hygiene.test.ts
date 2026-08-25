/**
 * THE SUITE TIMING-HYGIENE GATE (QG-01, ROADMAP SC-1b).
 *
 * No test in this repository may `expect()` a clock-derived elapsed DELTA or an elapsed RATIO.
 *
 * `condition-evaluator.test.ts` carried one, and it is the defect QG-01 names. It divided two
 * best-of-5 elapsed windows and compared the quotient to 80. Measured at 3x CPU oversubscription the
 * quotient reached 52.5 — 66% of the threshold consumed by contention alone, with the CODE UNDER
 * TEST unchanged — and it failed twice in Phase 44's parallel waves (once reported as `25.5 < 10`)
 * while passing 70/70 in every serial run. Plan 47-04 replaced it with counted integers.
 *
 * Two more existed, both strictly redundant against the assertion beside them:
 *
 *   - `client-formula-bounds.test.ts` bounded a runaway-expression evaluation at 15 000 ms. Measured
 *     543 ms idle, 561 ms at 2x, 560 ms at 3x — contention-insensitive, because the real bound is
 *     QuickJS's own `timeoutMs`. But 15 000 ms is TIGHTER than the test's own `{ timeout: 30000 }`,
 *     so it was the thing that would fire first under load, and `expect(result).toBeDefined()`
 *     already carried the whole property: without the bound the call never returns at all.
 *   - `formula-engine.test.ts` bounded the same shape at 5 000 ms. Measured 51-59 ms across idle,
 *     2x and 3x — 85-92x headroom, and `expect(result.error).not.toBeNull()` beside it plus
 *     `{ timeout: 10000 }` on the `it` carried the property.
 *
 * Plan 47-05 deleted both. This gate is what stops a third appearing.
 *
 * ── THE DISCRIMINATING RULE, VERBATIM ────────────────────────────────────────────────────────
 *
 * Taint a value if it is a clock call (`Date.now()`, `performance.now()`) or is derived from one,
 * and propagate through variable bindings to a fixpoint. FLAG an `expect(...)` whose argument is:
 *   - a SUBTRACTION whose LEFT operand is tainted (an elapsed delta), or
 *   - a DIVISION of two already-tainted values (an elapsed ratio).
 * Do NOT flag a clock call that is an operand of an ADDITION producing a future timestamp.
 *
 * That single distinction is the whole rule (47-RESEARCH §4:587-590). It was derived by running an
 * over-broad version across the suite and triaging its output by hand. Getting the addition case
 * wrong is not an abstract risk: `src/app/admin/users/actions.test.ts:59` and the audit-policy
 * expiry assertion plan 47-10 ships are BOTH future-timestamp comparisons, and a rule that taints
 * addition would make this gate's first casualty a correct assertion in another gate. Both shapes
 * are held below as KNOWN_NEGATIVE fixtures so the two gates are proven not to fight.
 *
 * ── THE BOUNDARY THIS REPOSITORY NOW STATES, VERBATIM (47-RESEARCH §4:609-611) ────────────────
 *
 * "a test may rely on vitest's ambient or an explicit `{ timeout: N }` as a liveness backstop
 *  against a hang, but must not **assert** an elapsed-time threshold."
 *
 * A timeout is a liveness backstop: it fires only when the subject stops making progress at all, and
 * its failure is "this hung", which is a real defect. An elapsed-time ASSERTION is a different
 * instrument wearing the same clothes: it fires when the MACHINE is busy, and its failure says
 * nothing about the code. Section 5 below asserts every permitted backstop in the repository is
 * still present, so a future sweep that "removes all the timeouts" turns this red rather than green.
 *
 * ── WHY A TAINT PASS AND NOT INLINE MATCHING ─────────────────────────────────────────────────
 *
 * Version 1 of this scanner matched clock calls only where they appeared INLINE inside `expect(...)`.
 * It found three hits and MISSED `condition-evaluator.test.ts:636` — the assertion QG-01 exists to
 * remove — because that assertion's operands were bound to two local names first. A gate that
 * cannot see the defect it was written for is a vacuous gate, and this repository has shipped seven
 * of those.
 *
 * So taint propagates through variable declarations, assignments and function return values, in a
 * LOOP TO A FIXPOINT rather than one pass. That is not decoration, and it is not asserted by
 * inspection: `scanSource` takes a `maxIterations` cap purely so the fixture self-test below can run
 * the matcher with the fixpoint disabled and assert that the bound-variable ratio is MISSED at one
 * pass and FOUND at the fixpoint. Measured: that fixture needs 3 iterations (2 productive, 1 to
 * confirm no change). If the fixpoint is ever reduced to a single pass, that assertion goes red.
 *
 * ── WHY THIS GATE PARSES AND NEVER GREPS ─────────────────────────────────────────────────────
 *
 * Two independent reasons.
 *
 * (1) A raw text scan cannot distinguish an expression from prose about an expression, and it cannot
 *     see through a variable binding at all. The sibling gate records a MEASURED false positive of a
 *     raw scan at `src/lib/observability/sentry.test.ts:185` for the same class of reason.
 *
 * (2) This file's own header necessarily spells the clock calls and the threshold matchers it
 *     forbids, because it has to explain the rule. A grep-shaped gate would report itself forever
 *     (S6 says reword the prose and never weaken the assertion — but here the prose cannot be
 *     reworded, because the tokens ARE the subject). An AST parse sees a comment as trivia, and
 *     section 6 turns that from a claim into a live control: this file's raw text demonstrably
 *     contains the forbidden shapes, and the parse counts ZERO clock calls in it.
 *
 * ── WHAT PARSING DELIBERATELY DOES NOT CATCH ─────────────────────────────────────────────────
 *
 * A COMMENTED-OUT elapsed assertion is not a hit. That is correct for this gate and it is stated
 * rather than discovered; `db-test-isolation.test.ts:374-386` makes the same argument for keeping
 * both the parsed and the raw forms in the tree.
 *
 * The rule is also deliberately narrow in one more way. A delta divided by a CONSTANT —
 * `expect(elapsed / 1000).toBeLessThan(5)` — is neither a subtraction nor a division of two tainted
 * values, so it is not flagged. That is the letter of the rule above, and the rule's letter is what
 * keeps it from colliding with the future-timestamp assertions in two other files. If that shape
 * ever appears, widen the rule DELIBERATELY, add the fixture, and re-run the whole triage — do not
 * widen it speculatively, because every widening here is a chance to break a correct assertion
 * somewhere else.
 *
 * Clock reads reached through an unusual receiver (`globalThis.Date.now()`) are likewise not matched.
 * Zero instances exist; the qualified-name form is what the corpus uses.
 *
 * ── WHERE THE BOUNDARY SITS FOR AN EXACT-EQUALITY DELTA — DECIDED, NOT DISCOVERED ─────────────
 *
 * `src/lib/execution/actions/__tests__/http.test.ts:559` asserts a delta and is CORRECT:
 * `vi.useFakeTimers({ shouldAdvanceTime: false })` freezes the clock earlier in the same test, so
 * the delta is exact by construction and there is no margin to consume. It must stay green.
 *
 * The decision is the CONJUNCTION of the two candidate boundaries, which is narrower than either
 * alone: a delta or ratio is permitted only when the matcher is an exact-equality matcher AND the
 * file installs a fake clock. A threshold matcher (`toBeLessThan`, `toBeGreaterThan`,
 * `toBeLessThanOrEqual`, `toBeGreaterThanOrEqual`, `toBeCloseTo`) is flagged unconditionally,
 * because a threshold over a clock delta IS the margin this gate exists to delete. And an exact
 * equality over a delta in a file with no fake clock is flagged too, because it can only ever be
 * accidentally true. Both halves are pinned by fixtures: the frozen shape is KNOWN_NEGATIVE (a), the
 * same shape without a fake clock is KNOWN_POSITIVE (vi).
 *
 * An unrecognised matcher is FLAGGED, deliberately. A rule whose default is "ignore" grows a hole
 * every time vitest adds a matcher.
 *
 * ── THE CORPUS, AND WHY IT IS WIDER THAN `npm test` ──────────────────────────────────────────
 *
 * The walk enumerates every `*.{test,spec}.*` file under `src/`, which is the base vitest project's
 * own include glob — INCLUDING `*.rsc.test.*` and `*.db.test.*`. That is deliberate and it is stated
 * because a sweep whose corpus silently differs from the project's glob is a gate about a different
 * tree:
 *
 *   - `*.rsc.test.*` runs in the second project, which `npm test` DOES invoke. Excluding it would
 *     leave part of `npm test` unswept.
 *   - `*.db.test.*` runs only under `npm run test:db`, which `npm test` never invokes — but SC-1b's
 *     claim is about the repository's tests, not about one command, and a file excluded from CI
 *     today is one config line away from being included. `src/lib/mutations/dedup.db.test.ts` holds
 *     a `Date.now()` deadline poll loop, which is a clock READ and not an `expect()` over a delta,
 *     so including that project costs nothing and closes a hole rather than opening one.
 *
 * The walk starts at `src/` and therefore cannot reach `.planning/`, where this phase's measurement
 * harnesses live. Section 3 asserts that rather than assuming it.
 *
 * ── THE CLOCK-CALL FLOOR, AND WHY ONLY ONE OF THE TWO CLOCKS IS FLOORED ──────────────────────
 *
 * Phase 46's WR-11 lesson, and the one this gate would otherwise fail: a scan asserting
 * `hits.length === 0` while never asserting its searched token still matches goes green BECAUSE IT
 * BROKE. Precedent: `db-test-isolation.test.ts:579-605`. So section 2 floors the number of
 * `Date.now` CallExpressions the detector finds in the corpus. Without it, "no elapsed assertions"
 * is satisfied perfectly by a clock-call detector that stopped detecting clock calls.
 *
 * `performance.now` is deliberately NOT floored over this corpus, and the reason is a correction to
 * three of this phase's own planning documents. They state that 47-04's deletion removed the
 * repository's only two `performance.now()` call sites. It removed the only two in any TEST file.
 * Two remain in NON-TEST source — `src/app/api/health/route.ts`, the Phase 42 DB-probe latency
 * field — and they were never in scope. A floor over this corpus would therefore sit at zero and
 * fail. Two things stand in for it instead, and together they are stronger than a floor:
 *
 *   - KNOWN_POSITIVE fixture (iv) is a `performance.now` ratio, so that branch of the detector is
 *     proven live by fixture;
 *   - section 3 runs the detector over the health route itself and asserts it still finds both real
 *     call sites there — which proves the branch against REAL source, not only a fixture.
 *
 * That same control is where "reads a clock" and "asserts on a clock delta" are shown to be
 * different things. The health route computes a clock-derived delta on purpose and contains ZERO
 * `expect()` calls, so it is correctly out of this gate's scope. If the two were the same thing this
 * gate would be demanding that a health endpoint stop reporting latency.
 *
 * ── THE SELF-COLLISION MITIGATION — THERE IS EXACTLY ONE, AND THIS IS IT ─────────────────────
 *
 * This file is itself a `*.test.ts` under `src/`, so its own sweep enumerates it, and its
 * KNOWN_POSITIVE fixtures ARE elapsed-delta and elapsed-ratio assertions.
 * `no-standing-suppressions.test.ts:19-25` is the only other place in this repository that has faced
 * this, and it records what happens when it is missed: the gate's own text inflates what the gate
 * counts.
 *
 * THE DECISION: every fixture is held as a source STRING and parsed through `scanSource`, the same
 * `ts.createSourceFile` code path the sweep uses. A string literal is not a `CallExpression`, so the
 * sweep is structurally incapable of seeing a fixture — and the fixtures still go through the real
 * matcher rather than a second, divergent copy of it.
 *
 * THIS FILE IS NOT PATH-EXCLUDED FROM ITS OWN SWEEP. `EXCLUDED_PATHS` is empty, asserted empty, and
 * asserted not to contain this file, so adding an exclusion later goes red rather than quietly
 * working. Section 6 additionally asserts that this file is enumerated, parses to zero clock calls
 * (positive proof that every fixture really is a string and not live code), yields zero hits, and
 * still physically contains the fixture source the parse cannot see.
 *
 * Taking BOTH mitigations was considered and rejected, for the same reason the sibling hook gate
 * rejected it: a gate that path-excludes itself AND stringifies its fixtures has two independent
 * reasons to be green and no way to tell which one is load-bearing. Do not add a path exclusion.
 *
 * ── IF THIS WENT RED ────────────────────────────────────────────────────────────────────────
 *
 * DELETE the elapsed assertion and keep the `{ timeout: N }`. If the elapsed bound is the only thing
 * asserting the property, the property is under-asserted and the fix is to assert the property —
 * freeze the clock and assert exactly, count operations, or assert that the call returns at all.
 * Never widen the rule to admit a new delta, never add a path exclusion, never raise a threshold,
 * and never reach for `retries`, a bigger `testTimeout`/`hookTimeout` or serial-only marking: all
 * four were considered and rejected in 47-CONTEXT, because each makes the symptom rarer while
 * leaving a gate whose failure mode is machine load rather than code behaviour.
 */
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

import ts from "typescript"
import { describe, expect, it } from "vitest"

const REPO_ROOT = process.cwd()

/** The tree the base vitest project collects from (`vitest.config.ts` include is `src/**`). */
const SRC_ROOT = "src"

/** This file, by path. Named so the self-collision control can assert it is NOT excluded. */
const GATE_PATH = "src/lib/__tests__/suite-timing-hygiene.test.ts"

/**
 * The two files this plan deleted an elapsed assertion from, plus the two whose legitimate clock
 * arithmetic this gate must never flag. Named so a rename cannot slip any of them out of scope.
 */
const SUBJECT_PATHS = [
  "src/components/custom-fields/__tests__/client-formula-bounds.test.ts",
  "src/lib/formula-engine.test.ts",
  "src/lib/execution/actions/__tests__/http.test.ts",
  "src/app/admin/users/actions.test.ts",
] as const

/**
 * Non-test source that READS a clock, deliberately outside this corpus. See the header: this is the
 * concrete case that makes "reads a clock" and "asserts on a clock delta" different claims, and it is
 * where the `performance.now` branch of the detector is proven against real source.
 */
const CLOCK_READING_NON_TEST_SOURCE = "src/app/api/health/route.ts"

/** The qualified clock-call names this gate taints from. */
const CLOCK_CALL_NAMES = new Set(["Date.now", "performance.now"])

/** `expect(x).not/.resolves/.rejects.toBe(...)` — traversed past, never treated as the matcher. */
const MATCHER_MODIFIERS = new Set(["not", "resolves", "rejects"])

/**
 * Threshold matchers. A clock delta or ratio compared against one of these IS the margin this gate
 * exists to delete, so these are flagged unconditionally — no fake-clock escape hatch, because a
 * threshold implies a margin and a frozen clock has none.
 */
const THRESHOLD_MATCHERS = new Set([
  "toBeLessThan",
  "toBeLessThanOrEqual",
  "toBeGreaterThan",
  "toBeGreaterThanOrEqual",
  "toBeCloseTo",
])

/**
 * Exact-equality matchers. A delta compared with one of these is permitted ONLY in a file that
 * installs a fake clock — see the header's boundary decision.
 */
const EXACT_MATCHERS = new Set(["toBe", "toEqual", "toStrictEqual"])

/**
 * Floor on the number of `*.test.ts` / `*.test.tsx` files the walk enumerates under `src/`.
 * Measured on the tree this gate was written against: 177 (174 `.test.ts`, 3 `.test.tsx`),
 * including this file. 150 is a deliberately loose floor set
 * BELOW the measurement, so ordinary consolidation of test files does not fatal with a message that
 * misdiagnoses shrinkage as a broken walk — and so nobody under time pressure "fixes" it by lowering
 * a number whose purpose they cannot re-derive.
 *
 * Without this floor a wrong root constant or a broken recursion yields an empty file list,
 * therefore zero hits, therefore a permanently green gate.
 */
const MIN_TEST_FILES = 150

/**
 * Floor on `expect()` CallExpressions parsed across that corpus. Measured 8183 by this walk
 * (8143 before this file was added to the corpus);
 * 47-RESEARCH's prototype measured 8060 over 175 files, and raw text counts 8231 (the difference is
 * prose and `expect.` member forms, which an AST does not count as `expect()` calls). 7000 is set
 * below all three.
 *
 * This is the floor that says the parse reached real assertions. "No elapsed assertions found" is
 * satisfied perfectly by a parse that found no assertions at all.
 */
const MIN_EXPECT_CALLS = 7000

/**
 * Floor on `Date.now` CallExpressions the detector finds in the corpus — the WR-11 token floor.
 * Measured 38 before this plan's two deletions and 34 after them (each deleted `it` gave up a
 * `const start = Date.now()` and a `Date.now()` inside the assertion). 25 is set below the
 * post-deletion measurement.
 *
 * `performance.now` is NOT floored here, and the reason is in the header: 47-04 removed the only two
 * call sites in any TEST file, so a floor over this corpus would sit at zero and fail. Two remain in
 * non-test source (`src/app/api/health/route.ts`), and section 3 floors THOSE instead — against real
 * source rather than a fixture, which is the stronger of the two forms.
 */
const MIN_DATE_NOW_CALLS = 25

/**
 * Floor on explicit test/hook timeout arguments across the corpus. Measured 24, in six files. 20 is
 * set below it.
 *
 * This is the other half of the boundary statement. Deleting an elapsed assertion is only correct
 * because the timeout beside it remains, so the gate that forbids the assertion must also assert the
 * backstops survive — otherwise a future sweep that removes both leaves this file green over a suite
 * that can hang forever.
 */
const MIN_EXPLICIT_TIMEOUTS = 20

/**
 * Floor on `performance.now` CallExpressions in `CLOCK_READING_NON_TEST_SOURCE`. Measured exactly 2
 * (`probeDb`'s start reading and the latency computation), both introduced in Phase 42, both
 * untouched by this phase. Floored rather than pinned at 2 so adding a third probe is not a failure.
 */
const MIN_NON_TEST_PERFORMANCE_NOW = 2

/**
 * Measured fixpoint iterations for KNOWN_POSITIVE fixture (i): 3. Two productive passes, then one
 * that adds nothing and terminates the loop. Asserted below to be greater than 1, which is the
 * property that matters — a single pass provably MISSES that fixture, and that miss is asserted too.
 */
const MIN_FIXPOINT_ITERATIONS = 2

/**
 * DELIBERATELY EMPTY, and asserted empty below.
 *
 * There is no path-based exclusion in this gate and there must not be one. The over-broad first
 * draft of this rule reported twelve hits of which four were real, and the cheap way to "fix" that
 * is to exclude the files it misjudged — which converts a rule that is wrong into a rule that is
 * wrong and invisible. The four legitimate shapes are pinned by KNOWN_NEGATIVE fixtures instead, so
 * the RULE is what carries the triage.
 *
 * This constant exists so that adding an exclusion is a visible, red-going act rather than an
 * invisible one: it is applied live in the sweep, asserted to be empty, and asserted not to contain
 * this file.
 */
const EXCLUDED_PATHS: readonly string[] = []

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8")
}

/**
 * Every test file the base vitest project's include glob matches, as repo-relative POSIX paths.
 *
 * The only regular expression in this file matches FILE NAMES. Clock detection, taint propagation
 * and `expect()` detection go exclusively through the AST — see the header.
 */
function walkTestFiles(relativeDir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(path.join(REPO_ROOT, relativeDir), { withFileTypes: true })) {
    const rel = `${relativeDir}/${entry.name}`
    if (entry.isDirectory()) out.push(...walkTestFiles(rel))
    else if (/\.(test|spec)\.(c|m)?[jt]sx?$/.test(entry.name)) out.push(rel)
  }
  return out
}

const TEST_FILES = walkTestFiles(SRC_ROOT).sort()

/**
 * How the matcher applied to a delta or ratio is classified. Reported on every hit and asserted by
 * fixture, so `THRESHOLD_MATCHERS` and `EXACT_MATCHERS` are load-bearing values rather than two
 * lists that document a rule the code decides some other way.
 */
export type MatcherClass = "threshold" | "exact" | "unrecognised"

export interface TimingHit {
  file: string
  /** 1-based line of the `expect(` call. */
  line: number
  /** `delta` for a subtraction with a tainted left operand, `ratio` for a tainted division. */
  kind: "delta" | "ratio"
  /** The matcher applied to the `expect()`, past `.not`/`.resolves`/`.rejects`. `null` if none. */
  matcher: string | null
  /** That matcher's class — the half of the boundary decision that is not about taint. */
  matcherClass: MatcherClass
  /** The whole assertion's source text, whitespace-collapsed. */
  text: string
}

export interface ExplicitTimeout {
  file: string
  line: number
  /** `it`, `test`, or a lifecycle hook name. */
  callee: string
  ms: number
}

export interface ScanResult {
  hits: TimingHit[]
  /** Anti-vacuity counter: `expect()` CallExpressions the parse actually saw. */
  expectCalls: number
  /** Anti-vacuity counter, per clock: CallExpressions the detector actually matched. */
  clockCalls: Record<string, number>
  /** Explicit `{ timeout: N }` / trailing-numeric timeout arguments on tests and hooks. */
  timeouts: ExplicitTimeout[]
  /** Whether the file installs a fake clock anywhere. Drives the exact-equality boundary. */
  fakeClock: boolean
  /** Names taint reached, for diagnosis. */
  taintedNames: string[]
  /** Function names whose return value taint reached, for diagnosis. */
  taintedFunctions: string[]
  /** Fixpoint passes performed, including the final no-change pass. */
  taintIterations: number
}

/** `Date.now` / `performance.now` as a qualified callee name, or `null`. */
function clockCallName(node: ts.Node): string | null {
  if (!ts.isCallExpression(node)) return null
  const callee = node.expression
  if (!ts.isPropertyAccessExpression(callee)) return null
  if (!ts.isIdentifier(callee.expression)) return null
  const qualified = `${callee.expression.text}.${callee.name.text}`
  return CLOCK_CALL_NAMES.has(qualified) ? qualified : null
}

/**
 * The boundary decision from the header, as a total function over matcher names.
 *
 * An unrecognised matcher classifies as `unrecognised` and is FLAGGED, deliberately: a rule whose
 * default is "ignore" grows a hole every time vitest adds a matcher.
 */
function classifyMatcher(matcher: string | null): MatcherClass {
  if (matcher === null) return "unrecognised"
  if (THRESHOLD_MATCHERS.has(matcher)) return "threshold"
  if (EXACT_MATCHERS.has(matcher)) return "exact"
  return "unrecognised"
}

function isExpectCall(node: ts.Node): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "expect"
  )
}

function isFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)
}

/** `vi.useFakeTimers(...)` / `vi.setSystemTime(...)` — the file installs a deterministic clock. */
function isFakeClockCall(node: ts.Node): boolean {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "vi" &&
    (node.expression.name.text === "useFakeTimers" ||
      node.expression.name.text === "setSystemTime")
  )
}

function unwrapWrappers(node: ts.Node): ts.Node {
  let current = node
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression
  }
  return current
}

/**
 * Parse `sourceText` and report every `expect()` over a clock-derived delta or ratio.
 *
 * Exported and taking a source STRING rather than only a path, so the fixtures below reach exactly
 * this code path and so the self-collision mitigation described in the header holds: a fixture is a
 * string literal, and a string literal is not a `CallExpression`.
 *
 * `maxIterations` caps the taint fixpoint. It exists ONLY so the fixture self-test can run the
 * matcher with the fixpoint disabled and prove the fixpoint is load-bearing. The sweep never passes
 * it.
 */
export function scanSource(
  fileName: string,
  sourceText: string,
  maxIterations: number = Number.POSITIVE_INFINITY
): ScanResult {
  const src = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )

  const lineOf = (node: ts.Node): number =>
    src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1

  const allNodes: ts.Node[] = []
  const collect = (node: ts.Node): void => {
    allNodes.push(node)
    ts.forEachChild(node, collect)
  }
  ts.forEachChild(src, collect)

  let expectCalls = 0
  let fakeClock = false
  const clockCalls: Record<string, number> = { "Date.now": 0, "performance.now": 0 }
  for (const node of allNodes) {
    const clock = clockCallName(node)
    if (clock !== null) clockCalls[clock] += 1
    if (isExpectCall(node)) expectCalls += 1
    if (isFakeClockCall(node)) fakeClock = true
  }

  // ── the taint pass ─────────────────────────────────────────────────────────────────────────
  const taintedNames = new Set<string>()
  const taintedFunctions = new Set<string>()

  /**
   * A value is tainted if it is a clock reading or still carries one. The PlusToken case is the
   * whole discriminating rule: an addition over a clock reading produces a FUTURE TIMESTAMP, which
   * is not an elapsed measurement, and taint stops there.
   */
  const isTainted = (node: ts.Node | undefined): boolean => {
    if (node === undefined) return false
    if (clockCallName(node) !== null) return true
    if (ts.isIdentifier(node)) return taintedNames.has(node.text)
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      return false
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      taintedFunctions.has(node.expression.text)
    ) {
      return true
    }
    // Only the receiver of a property access can carry taint; the property NAME is an Identifier
    // too, and letting it match `taintedNames` would taint `x.start` because a local `start` was
    // tainted somewhere else entirely.
    if (ts.isPropertyAccessExpression(node)) return isTainted(node.expression)
    let found = false
    ts.forEachChild(node, (child) => {
      if (!found && isTainted(child)) found = true
    })
    return found
  }

  const returnsTainted = (fn: ts.FunctionLikeDeclaration): boolean => {
    if (fn.body === undefined) return false
    if (!ts.isBlock(fn.body)) return isTainted(fn.body)
    let found = false
    const visit = (node: ts.Node): void => {
      if (found) return
      // Do not descend into a nested function: its returns belong to it, not to `fn`.
      if (isFunctionLike(node)) return
      if (ts.isReturnStatement(node) && node.expression && isTainted(node.expression)) {
        found = true
        return
      }
      ts.forEachChild(node, visit)
    }
    ts.forEachChild(fn.body, visit)
    return found
  }

  let taintIterations = 0
  for (;;) {
    taintIterations += 1
    const before = taintedNames.size + taintedFunctions.size
    for (const node of allNodes) {
      if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
        if (isFunctionLike(node.initializer)) {
          if (returnsTainted(node.initializer)) taintedFunctions.add(node.name.text)
        } else if (isTainted(node.initializer)) {
          taintedNames.add(node.name.text)
        }
      }
      if (ts.isFunctionDeclaration(node) && node.name && returnsTainted(node)) {
        taintedFunctions.add(node.name.text)
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left) &&
        isTainted(node.right)
      ) {
        taintedNames.add(node.left.text)
      }
    }
    if (taintedNames.size + taintedFunctions.size === before) break
    if (taintIterations >= maxIterations) break
  }

  /** The matcher applied to an `expect()` call, traversing past `.not` / `.resolves` / `.rejects`. */
  const matcherOf = (expectCall: ts.CallExpression): string | null => {
    let node: ts.Node = expectCall
    let parent: ts.Node | undefined = node.parent
    while (parent !== undefined && ts.isPropertyAccessExpression(parent) && parent.expression === node) {
      const name = parent.name.text
      if (!MATCHER_MODIFIERS.has(name)) return name
      node = parent
      parent = parent.parent
    }
    return null
  }

  const hits: TimingHit[] = []
  for (const node of allNodes) {
    if (!isExpectCall(node)) continue
    const argument = node.arguments[0]
    if (argument === undefined) continue
    const expression = unwrapWrappers(argument)
    if (!ts.isBinaryExpression(expression)) continue

    let kind: TimingHit["kind"] | null = null
    if (expression.operatorToken.kind === ts.SyntaxKind.MinusToken && isTainted(expression.left)) {
      kind = "delta"
    } else if (
      expression.operatorToken.kind === ts.SyntaxKind.SlashToken &&
      isTainted(expression.left) &&
      isTainted(expression.right)
    ) {
      kind = "ratio"
    }
    if (kind === null) continue

    const matcher = matcherOf(node)
    const matcherClass = classifyMatcher(matcher)
    // The only permitted shape: an exact equality over a delta, in a file that installs a fake
    // clock. A threshold is always a margin, and an exact equality over a real clock can only ever
    // be accidentally true.
    if (matcherClass === "exact" && fakeClock) continue

    const whole = node.parent !== undefined && ts.isPropertyAccessExpression(node.parent)
      ? (node.parent.parent ?? node.parent)
      : node
    hits.push({
      file: fileName,
      line: lineOf(node),
      kind,
      matcher,
      matcherClass,
      text: whole.getText(src).replace(/\s+/g, " "),
    })
  }

  // ── explicit timeouts: `it(name, { timeout: N }, fn)` and `it(name, fn, N)` ────────────────
  const timeouts: ExplicitTimeout[] = []
  const TIMEOUT_BEARING_CALLEES = new Set([
    "it",
    "test",
    "beforeAll",
    "beforeEach",
    "afterAll",
    "afterEach",
  ])
  const numeric = (literal: ts.NumericLiteral): number => Number(literal.text.replace(/_/g, ""))
  for (const node of allNodes) {
    if (!ts.isCallExpression(node)) continue
    const callee = node.expression
    const baseName = ts.isIdentifier(callee)
      ? callee.text
      : ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)
        ? callee.expression.text
        : null
    if (baseName === null || !TIMEOUT_BEARING_CALLEES.has(baseName)) continue
    for (const argument of node.arguments) {
      if (ts.isObjectLiteralExpression(argument)) {
        for (const property of argument.properties) {
          if (
            ts.isPropertyAssignment(property) &&
            ts.isIdentifier(property.name) &&
            property.name.text === "timeout" &&
            ts.isNumericLiteral(property.initializer)
          ) {
            timeouts.push({
              file: fileName,
              line: lineOf(argument),
              callee: baseName,
              ms: numeric(property.initializer),
            })
          }
        }
      } else if (ts.isNumericLiteral(argument)) {
        timeouts.push({
          file: fileName,
          line: lineOf(argument),
          callee: baseName,
          ms: numeric(argument),
        })
      }
    }
  }

  return {
    hits,
    expectCalls,
    clockCalls,
    timeouts,
    fakeClock,
    taintedNames: [...taintedNames],
    taintedFunctions: [...taintedFunctions],
    taintIterations,
  }
}

/** `file:line: text`, the house `file:line` collector shape. */
function formatHit(hit: TimingHit): string {
  return `${hit.file}:${hit.line}: [${hit.kind}/${hit.matcherClass}] ${hit.text}`
}

function scanFile(file: string): ScanResult {
  return scanSource(file, readRepoFile(file))
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// 1. THE MATCHER PROVES ITSELF AGAINST FIXTURES, BEFORE THE SWEEP IS TRUSTED.
// ───────────────────────────────────────────────────────────────────────────────────────────────

const lines = (...source: string[]): string => source.join("\n")

/**
 * Every fixture below is a SOURCE STRING, parsed through `scanSource`. That is the single
 * self-collision mitigation this file takes; see the header. Do not convert any of these into live
 * code, and do not path-exclude this file to make live fixtures safe.
 *
 * The positives assert the EXTRACTED `line:kind` — not merely that something was found — so a
 * matcher that reported every node would fail here too.
 */
const KNOWN_POSITIVE = [
  {
    label: "(i) a bound-variable elapsed RATIO — the exact shape the inline matcher missed",
    // condition-evaluator.test.ts:633-636 as it stood before 47-04 deleted it. Both operands are
    // bound to local names, and the names are produced by a function whose own local is assigned a
    // delta. Nothing inline appears inside expect() at all, which is why the fixpoint exists.
    source: lines(
      `const time = (n: number) => {`,
      `  let best = Infinity`,
      `  for (let run = 0; run < 5; run++) {`,
      `    const started = Date.now()`,
      `    for (const item of inputs(n)) resolveFieldPath(ctx, item)`,
      `    best = Math.min(best, Date.now() - started)`,
      `  }`,
      `  return best`,
      `}`,
      `const small = Math.max(time(8000), 0.05)`,
      `const large = time(128000)`,
      `expect(large / small).toBeLessThan(80)`
    ),
    expected: ["12:ratio:threshold"],
    /** Fixture (i) is the one a single pass cannot see. Section 1's fixpoint control uses this. */
    needsFixpoint: true,
  },
  {
    label: "(ii) the inline delta client-formula-bounds.test.ts carried",
    source: lines(
      `const start = Date.now()`,
      `const result = await evaluateFormula(expr, {}, undefined, FORMULA_EVAL_OPTIONS)`,
      `expect(result).toBeDefined()`,
      `expect(Date.now() - start).toBeLessThan(15000)`
    ),
    expected: ["4:delta:threshold"],
    needsFixpoint: false,
  },
  {
    label: "(iii) the inline delta formula-engine.test.ts carried",
    source: lines(
      `const start = Date.now()`,
      `const result = await evaluateFormula(expr, {}, undefined, { timeoutMs: 50 })`,
      `expect(Date.now() - start).toBeLessThan(5000)`
    ),
    expected: ["3:delta:threshold"],
    needsFixpoint: false,
  },
  {
    label: "(iv) a performance.now RATIO — the branch this corpus no longer contains",
    // The corpus holds zero `performance.now` call sites in any test file (47-04 removed the last
    // two), so this fixture is what keeps that branch of the detector proven. Section 3 proves it a
    // second way, against the real non-test source that still reads that clock.
    source: lines(
      `function measure(n: number) {`,
      `  const started = performance.now()`,
      `  work(n)`,
      `  return performance.now() - started`,
      `}`,
      `const small = measure(8000)`,
      `const large = measure(128000)`,
      `expect(large / small).toBeLessThan(80)`
    ),
    expected: ["8:ratio:threshold"],
    needsFixpoint: false,
  },
  {
    label: "(v) two bound deltas divided — negative control C's second half",
    source: lines(
      `const a = Date.now() - t0`,
      `const b = Date.now() - t1`,
      `expect(b / a).toBeLessThan(80)`
    ),
    expected: ["3:ratio:threshold"],
    needsFixpoint: false,
  },
  {
    label: "(vi) an exact-equality delta with NO fake clock — the other half of the boundary",
    // The complement of KNOWN_NEGATIVE (a). Without this fixture, "exact equality is permitted"
    // would be a hole rather than a boundary: `toBe(0)` over a real clock delta can only ever be
    // accidentally true.
    source: lines(`const before = Date.now()`, `expect(Date.now() - before).toBe(0)`),
    expected: ["2:delta:exact"],
    needsFixpoint: false,
  },
] as const

/**
 * Six shapes that are real code in this repository (or, for (d), real code plan 47-10 ships) and
 * that MUST stay green. These are what make the rule carry the triage instead of a path exclusion.
 */
const KNOWN_NEGATIVE = [
  {
    label: "(a) a frozen-clock exact delta — http.test.ts:559",
    // A delta, and legitimate: the clock is frozen earlier in the same test, so `toBe(0)` is exact
    // by construction and there is no margin for contention to consume.
    source: lines(
      `vi.useFakeTimers({ shouldAdvanceTime: false })`,
      `const before = Date.now()`,
      `const result = await executeAction("http_request", config, context, "run-dry")`,
      `expect(vi.getTimerCount()).toBe(0)`,
      `expect(Date.now() - before).toBe(0)`
    ),
    expectsClockCalls: true,
  },
  {
    label: "(b) algebraically exact on one captured value — users/actions.test.ts:37",
    // The subtraction's LEFT operand is a future timestamp, not a clock reading, so the taint chain
    // is already broken by the addition that produced it. Seven days of margin, and exact anyway.
    source: lines(
      `const now = Date.now()`,
      `const expiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000)`,
      `const expectedMs = 7 * 24 * 60 * 60 * 1000`,
      `expect(expiresAt.getTime() - now).toBe(expectedMs)`
    ),
    expectsClockCalls: true,
  },
  {
    label: "(c) a future timestamp compared to the clock — users/actions.test.ts:59",
    source: lines(
      `const insertValues = { expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }`,
      `expect(insertValues.expiresAt.getTime()).toBeGreaterThan(Date.now())`
    ),
    expectsClockCalls: true,
  },
  {
    label: "(d) the exact allowlist-expiry assertion plan 47-10 ships",
    // THE CROSS-CHECK THAT THE TWO NEW GATES DO NOT FIGHT. 47-10's audit-policy gate asserts that
    // every allowlist entry's expiry is still in the future, in exactly this shape. If this gate's
    // rule tainted addition, or flagged any comparison against a clock, that correct assertion would
    // become this gate's first casualty — and the cheapest way to resolve two gates in contradiction
    // is to delete one of them.
    source: lines(`expect(new Date(entry.expires).getTime()).toBeGreaterThan(Date.now())`),
    expectsClockCalls: true,
  },
  {
    label: "(e) a future timestamp passed INTO a pure function, assertion on a boolean",
    source: lines(`expect(snapshot(Date.now() + 7 * 864e5)[0]).toBe(true)`),
    expectsClockCalls: true,
  },
  {
    label: "(f) an event-loop-yield timer — recursion.test.ts:27, and no expect() at all",
    // Insurance. The stated rule already excludes it (there is no `expect` over a delta here), but
    // the thirteen event-loop yield idioms in this suite are the most numerous timing-adjacent shape
    // in the tree and the one a careless widening would catch first.
    source: lines(`await new Promise((resolve) => setTimeout(resolve, 1))`),
    expectsClockCalls: false,
  },
] as const

describe("the delta/ratio matcher, unit-tested against fixtures FIRST", () => {
  /**
   * These assertions gate everything below them. A matcher that matches nothing yields an empty hit
   * list, an empty list satisfies `toEqual([])`, and the whole sweep becomes unfalsifiable. If any
   * fixture here is red, treat every pass further down as unproven.
   */
  it.each(KNOWN_POSITIVE)("MUST flag: $label", ({ source, expected }) => {
    // `line:kind:matcherClass` rather than a boolean, so this pins the extracted VALUE: which line,
    // whether the gate understood it as a delta or a ratio, and how it classified the matcher. A
    // matcher that flagged every node, or one that reached the right verdict having misread the
    // shape, fails here. It is also what makes THRESHOLD_MATCHERS and EXACT_MATCHERS load-bearing
    // values instead of two lists that merely document the rule.
    const { hits } = scanSource("known-positive.ts", source)
    expect(hits.map((hit) => `${hit.line}:${hit.kind}:${hit.matcherClass}`)).toEqual([...expected])
  })

  it.each(KNOWN_NEGATIVE)("MUST NOT flag: $label", ({ source }) => {
    const { hits } = scanSource("known-negative.ts", source)
    expect(hits.map(formatHit)).toEqual([])
  })

  it.each(KNOWN_NEGATIVE)(
    "still parses the clock call and the assertion in the negative fixture: $label",
    ({ source, label, expectsClockCalls }) => {
      // The negatives' token floor. `toEqual([])` above is satisfied by a parse that failed outright
      // and returned nothing, which would make every negative meaningless — a matcher that matches
      // nothing passes all six. Every negative except (f) declares a clock call on purpose, and
      // every negative except (f) declares an `expect()`; the parse must still have counted them, so
      // each fixture proves "saw the clock, did not flag the assertion" rather than "saw nothing".
      const result = scanSource("known-negative.ts", source)
      const clocks = result.clockCalls["Date.now"] + result.clockCalls["performance.now"]
      if (expectsClockCalls) {
        expect(clocks, `the parse saw no clock call in: ${label}`).toBeGreaterThan(0)
        expect(result.expectCalls, `the parse saw no expect() in: ${label}`).toBeGreaterThan(0)
      } else {
        expect(clocks, `fixture (f) should contain no clock call: ${label}`).toBe(0)
      }
    }
  )

  it("MISSES the bound-variable ratio at one pass and FINDS it at the fixpoint", () => {
    // THE PROOF THAT THE FIXPOINT IS LOAD-BEARING RATHER THAN DECORATIVE, and it is the reason
    // `scanSource` accepts a `maxIterations` cap at all.
    //
    // Version 1 of this scanner matched clock calls only where they appeared inline inside
    // `expect(...)`, and it therefore missed `condition-evaluator.test.ts:636` — the very assertion
    // QG-01 names. Asserting "the fixpoint exists" by reading the code proves nothing; this runs the
    // matcher with the loop capped at a single pass and asserts the miss, then uncapped and asserts
    // the find. If the loop is ever flattened, this goes red with the reason written on it.
    const fixture = KNOWN_POSITIVE.find((candidate) => candidate.needsFixpoint)
    expect(fixture, "no KNOWN_POSITIVE fixture is marked as needing the fixpoint").toBeDefined()
    if (fixture === undefined) return

    const singlePass = scanSource("known-positive.ts", fixture.source, 1)
    expect(
      singlePass.hits.map(formatHit),
      "a single taint pass already sees the bound-variable ratio, so this control no longer " +
        "distinguishes a fixpoint from an inline matcher. Rebuild the fixture so its taint chain " +
        "needs more than one pass — do not delete the control."
    ).toEqual([])

    const fixpoint = scanSource("known-positive.ts", fixture.source)
    expect(
      fixpoint.hits.map((hit) => `${hit.line}:${hit.kind}:${hit.matcherClass}`),
      "the fixpoint no longer finds the bound-variable ratio. Taint must propagate through " +
        "variable bindings and function returns until nothing new is tainted."
    ).toEqual([...fixture.expected])
    expect(
      fixpoint.taintIterations,
      `the fixpoint converged in ${fixpoint.taintIterations} pass(es); measured 3 when this gate ` +
        `was written (2 productive, 1 to confirm). One pass cannot see this fixture.`
    ).toBeGreaterThan(MIN_FIXPOINT_ITERATIONS - 1)
  })

  it("reports the taint chain it followed, not just a verdict", () => {
    // A hit list is a boolean in disguise. This asserts the intermediate state, so a matcher that
    // reached the right answer by the wrong route (for instance by flagging every division) is
    // visible here rather than only in some future false positive.
    const fixture = KNOWN_POSITIVE[0]
    const result = scanSource("known-positive.ts", fixture.source)
    expect(result.taintedFunctions).toEqual(["time"])
    expect(result.taintedNames.sort()).toEqual(["best", "large", "small", "started"])
  })

  it("flags a delta reached by an UNRECOGNISED matcher, and records it as such", () => {
    // The header states that an unrecognised matcher is flagged deliberately, because a rule whose
    // default is "ignore" grows a hole every time vitest adds a matcher. Without this, that sentence
    // is an intention: `classifyMatcher` could return "exact" for everything it does not recognise
    // and every assertion in this file would still pass while the gate quietly stopped flagging
    // anything in a file with fake timers.
    const { hits } = scanSource(
      "unrecognised-matcher.ts",
      lines(
        `vi.useFakeTimers()`,
        `const started = Date.now()`,
        `expect(Date.now() - started).toSatisfy((ms: number) => ms < 5000)`
      )
    )
    expect(hits.map((hit) => `${hit.kind}:${hit.matcherClass}`)).toEqual(["delta:unrecognised"])
  })

  it("does not taint through an addition, which is the whole discriminating rule", () => {
    // Asserted directly on the taint state rather than only through a hit list, because this is the
    // single distinction that keeps the four designated false positives green. If a future edit
    // taints addition, this goes red BEFORE the KNOWN_NEGATIVEs do, and with the reason attached.
    const future = scanSource(
      "addition.ts",
      lines(`const now = Date.now()`, `const later = now + 7 * 864e5`)
    )
    expect(future.taintedNames).toContain("now")
    expect(
      future.taintedNames,
      "an addition over a clock reading produces a FUTURE TIMESTAMP, not an elapsed measurement. " +
        "Tainting it makes every expiry assertion in this repository a hit, including the one plan " +
        "47-10's audit-policy gate ships."
    ).not.toContain("later")

    const elapsed = scanSource(
      "subtraction.ts",
      lines(`const started = Date.now()`, `const elapsed = Date.now() - started`)
    )
    // The complement. Without it, a taint pass that propagated NOTHING would satisfy the assertion
    // above and every KNOWN_NEGATIVE at once.
    expect(elapsed.taintedNames.sort()).toEqual(["elapsed", "started"])
  })
})

// ───────────────────────────────────────────────────────────────────────────────────────────────
// 2. THE WALK AND THE PARSE REACHED REAL FILES (ANTI-VACUITY).
// ───────────────────────────────────────────────────────────────────────────────────────────────

const CORPUS = TEST_FILES.map((file) => ({ file, ...scanFile(file) }))
const TOTAL_EXPECT_CALLS = CORPUS.reduce((sum, entry) => sum + entry.expectCalls, 0)
const TOTAL_DATE_NOW_CALLS = CORPUS.reduce((sum, entry) => sum + entry.clockCalls["Date.now"], 0)
const TOTAL_PERFORMANCE_NOW_CALLS = CORPUS.reduce(
  (sum, entry) => sum + entry.clockCalls["performance.now"],
  0
)
const ALL_TIMEOUTS = CORPUS.flatMap((entry) => entry.timeouts)

describe("the sweep reaches the tree it claims to scan", () => {
  it(`enumerates at least ${MIN_TEST_FILES} test files under ${SRC_ROOT}/`, () => {
    expect(
      TEST_FILES.length,
      `the walk found ${TEST_FILES.length} test files. Measured 177 when this gate was written; a ` +
        `count this low means the root constant or the recursion is wrong, and every negative ` +
        `assertion below is passing because it has nothing to look at.`
    ).toBeGreaterThanOrEqual(MIN_TEST_FILES)
  })

  it(`parses at least ${MIN_EXPECT_CALLS} expect() call expressions`, () => {
    expect(
      TOTAL_EXPECT_CALLS,
      `the parse found ${TOTAL_EXPECT_CALLS} expect() calls. Measured 8183. If this collapsed, the ` +
        `parse stopped reaching assertions — check ts.createSourceFile against the installed ` +
        `typescript major — and "no elapsed assertions" below proves nothing.`
    ).toBeGreaterThanOrEqual(MIN_EXPECT_CALLS)
  })

  it(`still finds at least ${MIN_DATE_NOW_CALLS} Date.now call sites — the token floor`, () => {
    // WR-11, and the half a delta sweep is most likely to lack. "Zero elapsed assertions" is
    // satisfied perfectly by a clock-call detector that stopped detecting clock calls — by a renamed
    // SyntaxKind, by a typo in CLOCK_CALL_NAMES, by a typescript major that changes how a
    // PropertyAccessExpression callee is shaped. This assertion is what tells that apart from a
    // clean tree. Precedent: db-test-isolation.test.ts:579-605.
    expect(
      TOTAL_DATE_NOW_CALLS,
      `the detector found ${TOTAL_DATE_NOW_CALLS} Date.now call sites across ${TEST_FILES.length} ` +
        `test files. Measured 38 before plan 47-05's two deletions and 34 after — confirmed on the ` +
        `post-deletion tree. A collapse here ` +
        `means the detector broke, and the sweep below is green because it stopped working. ` +
        `Re-anchor clockCallName onto whatever shape the parser now produces — do NOT lower this ` +
        `floor to go green.`
    ).toBeGreaterThanOrEqual(MIN_DATE_NOW_CALLS)
  })

  it("finds zero performance.now call sites in the corpus, and that is why it is not floored", () => {
    // Stated as an assertion rather than left in a comment, because it is the fact the floor above
    // is shaped around, and because it is a correction to three of this phase's own planning
    // documents: 47-04 removed the only two `performance.now()` call sites in any TEST file, not the
    // only two in the repository. If a test file starts reading that clock again, this goes red and
    // the right response is to ADD a floor for it beside MIN_DATE_NOW_CALLS.
    expect(
      TOTAL_PERFORMANCE_NOW_CALLS,
      `a test file reads performance.now again (${TOTAL_PERFORMANCE_NOW_CALLS} call sites). That is ` +
        `not forbidden — reading a clock is not asserting on one — but it means this clock can now ` +
        `carry a token floor of its own, so add one rather than deleting this assertion.`
    ).toBe(0)
  })

  it("enumerates every file this gate names, by exact path", () => {
    // Fails if a rename moves a subject out from under this gate, which would otherwise let the
    // sweep pass by simply not looking at the files that carry the defect — or, for the two
    // legitimate-clock files, by not looking at the files whose correctness the rule is tuned to.
    for (const named of SUBJECT_PATHS) {
      expect(TEST_FILES, `${named} is no longer enumerated`).toContain(named)
    }
  })

  it("parses each named file without a syntax error swallowing its contents", () => {
    // `ts.createSourceFile` never throws: on malformed input it returns a SourceFile with a
    // truncated tree, silently. All four named files are known to contain assertions, so a zero here
    // is a parse failure rather than a clean file.
    for (const named of SUBJECT_PATHS) {
      const entry = CORPUS.find((candidate) => candidate.file === named)
      expect(entry?.expectCalls ?? 0, `${named} parsed to zero expect() calls`).toBeGreaterThan(0)
    }
  })
})

// ───────────────────────────────────────────────────────────────────────────────────────────────
// 3. THE CORPUS SCOPE IS DELIBERATE, AND THE OUT-OF-SCOPE CASE IS A LIVE CONTROL.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("the corpus boundary is stated and asserted, not assumed", () => {
  it("includes the rsc and db projects' files, because the base include glob matches them", () => {
    // See the header. `vitest.config.ts`'s include is `src/**/*.{test,spec}.?(c|m)[jt]s?(x)`, and
    // *.rsc.test.* / *.db.test.* are removed from the BASE project by `test.exclude`, not by the
    // glob. The rsc project is part of `npm test`; the db project is one config line from being. A
    // sweep whose corpus silently differs from the project's own glob is a gate about a different
    // tree, so this asserts the wider choice rather than leaving it to be inferred from a regex.
    expect(
      TEST_FILES.filter((file) => /\.rsc\.test\./.test(file)).length,
      "no *.rsc.test.* file is enumerated, so the second project `npm test` runs is unswept"
    ).toBeGreaterThan(0)
    expect(
      TEST_FILES.filter((file) => /\.db\.test\./.test(file)).length,
      "no *.db.test.* file is enumerated, so the db project is unswept"
    ).toBeGreaterThan(0)
  })

  it("never walks outside src/, and never into .planning/", () => {
    // This phase's own measurement harnesses live under
    // `.planning/phases/47-suite-trust-supply-chain/measure/` and read clocks on purpose. They are
    // not source, they are not tests, and they must never enter this corpus — a gate that swept its
    // own scratch directory would report defects in the instrument rather than in the tree.
    const strays = TEST_FILES.filter((file) => !file.startsWith(`${SRC_ROOT}/`))
    expect(strays, `the walk escaped ${SRC_ROOT}/: ${strays.join(" | ")}`).toEqual([])
    expect(TEST_FILES.filter((file) => file.includes(".planning"))).toEqual([])
  })

  it("excludes non-test source that legitimately reads a clock, and proves the distinction", () => {
    // THE CONCRETE CASE THAT MAKES "reads a clock" AND "asserts on a clock delta" DIFFERENT CLAIMS,
    // and simultaneously the live proof of the detector's performance.now branch against REAL source
    // rather than a fixture.
    //
    // `src/app/api/health/route.ts` reads that clock twice and computes a delta from it — Phase 42's
    // DB-probe latency field. It contains no assertion at all, so it cannot violate SC-1b, and it is
    // deliberately outside this corpus. If this gate's scope were widened to all of `src/**` its
    // floor would be `>= 2` and this file would need an exemption; that is a worse design, because
    // the exemption would be indistinguishable from the exemption a real defect would ask for.
    expect(TEST_FILES).not.toContain(CLOCK_READING_NON_TEST_SOURCE)

    const result = scanSource(
      CLOCK_READING_NON_TEST_SOURCE,
      readRepoFile(CLOCK_READING_NON_TEST_SOURCE)
    )
    expect(
      result.clockCalls["performance.now"],
      `${CLOCK_READING_NON_TEST_SOURCE} no longer reads that clock. Either the latency field was ` +
        `removed — in which case delete this control deliberately — or the detector's ` +
        `performance.now branch broke, in which case KNOWN_POSITIVE fixture (iv) is the only thing ` +
        `still proving it and this file was the second, independent proof.`
    ).toBeGreaterThanOrEqual(MIN_NON_TEST_PERFORMANCE_NOW)
    expect(
      result.expectCalls,
      `${CLOCK_READING_NON_TEST_SOURCE} now contains assertions, so the argument for keeping it out ` +
        `of the corpus no longer holds`
    ).toBe(0)
    expect(result.hits.map(formatHit)).toEqual([])
  })
})

// ───────────────────────────────────────────────────────────────────────────────────────────────
// 4. THE SWEEP.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("no test asserts on a clock-derived elapsed delta or ratio (SC-1b)", () => {
  it("finds no elapsed-time assertion anywhere in the corpus", () => {
    const offenders = CORPUS.filter((entry) => !EXCLUDED_PATHS.includes(entry.file))
      .flatMap((entry) => entry.hits)
      .map(formatHit)

    expect(
      offenders,
      `a test asserts on a clock-derived elapsed delta or ratio. Measured under 3x CPU ` +
        `oversubscription, the assertion this rule was written for consumed 66% of its threshold ` +
        `from contention alone with the code under test unchanged, and it failed twice in Phase ` +
        `44's parallel waves while passing every serial run. THE FIX IS TO DELETE THE ASSERTION AND ` +
        `KEEP THE { timeout: N }: a timeout is a liveness backstop whose failure means "this hung", ` +
        `an elapsed assertion is a margin whose failure means "the machine was busy". If the ` +
        `elapsed bound is the only thing asserting the property, assert the property instead — ` +
        `freeze the clock and assert exactly, count operations, or assert that the call returns at ` +
        `all. Do NOT raise the threshold, add retries, raise testTimeout/hookTimeout, mark the file ` +
        `serial-only, or exclude it by path. Offenders: ${offenders.join(" | ")}`
    ).toEqual([])
  })

  it("applies an empty exclusion list, and the emptiness is the assertion", () => {
    // The exclusion list is applied live above so it cannot rot into decoration, and it is asserted
    // empty here so adding an entry is a red-going act. The over-broad first draft of this rule
    // misjudged four legitimate assertions, and the cheap fix for that is a path exclusion — which
    // converts a rule that is wrong into a rule that is wrong and invisible. The KNOWN_NEGATIVE
    // fixtures are what carry the triage instead.
    expect(
      EXCLUDED_PATHS,
      "this gate must contain no path-based exclusion of any test file. If a legitimate assertion " +
        "is being flagged, fix the RULE and add a KNOWN_NEGATIVE fixture for the shape."
    ).toEqual([])
  })
})

// ───────────────────────────────────────────────────────────────────────────────────────────────
// 5. THE PERMITTED LIVENESS BACKSTOPS ARE STILL PRESENT.
// ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Every explicit timeout the boundary statement permits, asserted by FILE and by VALUE rather than
 * by line, because a line number is the first thing to rot and the value is what carries the
 * meaning. Measured 24 explicit timeouts across six files when this gate was written.
 *
 * The two entries with an ASSERTION DELETED beside them are this plan's subjects: deleting an
 * elapsed assertion is only correct because the backstop beside it remains, so those two are the
 * ones that must never silently disappear.
 */
const PERMITTED_BACKSTOPS = [
  {
    file: "src/components/custom-fields/__tests__/client-formula-bounds.test.ts",
    ms: 30000,
    why: "the runaway-expression test plan 47-05 deleted an elapsed assertion from; without this the test can wedge a worker",
  },
  {
    file: "src/lib/formula-engine.test.ts",
    ms: 10000,
    why: "the interrupt test plan 47-05 deleted an elapsed assertion from",
  },
  {
    file: "src/lib/execution/actions/__tests__/transform.test.ts",
    ms: 10000,
    why: "runs while(true) in the QuickJS sandbox under a 100 ms internal bound — a 100x margin, and the assertion is on the thrown error",
  },
  {
    file: "src/lib/formula-recalc.test.ts",
    ms: 5000,
    why: "cycle-rejection tests; explicit because plan 34-01 proved a wedged sandbox cannot be interrupted by the ambient timeout at all",
  },
  {
    file: "src/lib/formula-recalc.test.ts",
    ms: 20000,
    why: "the cascade-budget tests: 500+ real QuickJS evaluations, insurance rather than a margin",
  },
  {
    file: "src/lib/export/formatters-live.test.ts",
    ms: 60000,
    why: "an opt-in, entirely skipped live-database suite; a module graph plus real round trips does not fit the ambient budget",
  },
] as const

describe("the permitted liveness backstops are still in the repository", () => {
  it.each(PERMITTED_BACKSTOPS)("$file still declares a $ms ms backstop", ({ file, ms, why }) => {
    // A LIVE CONTROL ON THE BOUNDARY STATEMENT, in the deployment-docs-accuracy.test.ts:692-700
    // style. This gate deletes elapsed ASSERTIONS; if it were read as deleting timeouts too, the
    // suite would lose its only defence against a genuine hang and this file would stay green while
    // doing it. So a future sweep that "removes all the timeouts" turns this red.
    const declared = ALL_TIMEOUTS.filter((timeout) => timeout.file === file).map(
      (timeout) => timeout.ms
    )
    expect(
      declared,
      `${file} no longer declares a ${ms} ms timeout (${why}). A timeout is a liveness backstop, ` +
        `not an elapsed-time assertion, and this gate permits it explicitly. Declared: ` +
        `${declared.join(", ") || "none"}`
    ).toContain(ms)
  })

  it(`still parses at least ${MIN_EXPLICIT_TIMEOUTS} explicit timeouts in total`, () => {
    // The token floor for the control above (WR-11 again): `toContain(ms)` is satisfied by a parser
    // that finds the timeouts, and nothing else here proves it still does across the whole corpus.
    expect(
      ALL_TIMEOUTS.length,
      `the parse found ${ALL_TIMEOUTS.length} explicit timeouts. Measured 24 across six files.`
    ).toBeGreaterThanOrEqual(MIN_EXPLICIT_TIMEOUTS)
  })

  it("finds no explicit timeout that the boundary statement would call an assertion", () => {
    // The complement, and the reason section 5 is not simply a list of things that exist: an
    // explicit timeout is permitted BECAUSE it is a backstop, and a backstop that is tighter than
    // the elapsed cost it guards is a margin wearing a timeout's clothes. That is precisely what the
    // deleted 15 000 ms assertion was — tighter than the 30 000 ms timeout on its own test. Every
    // permitted value here is at or above 5 000 ms; anything under a second would be a threshold.
    const suspicious = ALL_TIMEOUTS.filter((timeout) => timeout.ms < 1000).map(
      (timeout) => `${timeout.file}:${timeout.line}: ${timeout.callee} at ${timeout.ms} ms`
    )
    expect(
      suspicious,
      `a test or hook declares a sub-second timeout. That is not a liveness backstop, it is an ` +
        `elapsed-time threshold expressed as configuration, and it will fail on a busy machine for ` +
        `reasons that say nothing about the code. Offenders: ${suspicious.join(" | ")}`
    ).toEqual([])
  })
})

// ───────────────────────────────────────────────────────────────────────────────────────────────
// 6. THE GATE SWEEPS ITSELF — THE SELF-COLLISION CONTROL.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("the gate sweeps itself, and the fixtures are strings", () => {
  it("is enumerated by its own walk", () => {
    expect(TEST_FILES).toContain(GATE_PATH)
  })

  it("is NOT path-excluded from its own sweep", () => {
    // The load-bearing half of the header's decision. If someone adds this file to the exclusion
    // list, the mitigation stops being one thing and becomes two, and neither is provable.
    expect(
      EXCLUDED_PATHS,
      `${GATE_PATH} must not be excluded from its own sweep. Its fixtures are source STRINGS, which ` +
        `the parse cannot see; that is the single mitigation. Adding a path exclusion gives this ` +
        `gate two independent reasons to be green and no way to tell which one is working.`
    ).not.toContain(GATE_PATH)
  })

  it("parses to zero clock calls and zero hits, which proves every fixture is a string", () => {
    // Positive proof of the mitigation rather than a restatement of it. This file spells both clock
    // calls dozens of times and shows a dozen elapsed assertions; if any one of them were live code
    // instead of a string literal, the parse would count it here.
    const result = scanFile(GATE_PATH)
    expect(result.clockCalls["Date.now"], "a fixture in this file became live code").toBe(0)
    expect(result.clockCalls["performance.now"], "a fixture in this file became live code").toBe(0)
    expect(result.hits.map(formatHit)).toEqual([])
  })

  it("still physically contains the fixture source the parse cannot see", () => {
    // The token floor for this control. "Zero hits in the gate file" is also what an empty file, a
    // wrong GATE_PATH or a truncated read produces. This asserts the needle is really there and the
    // parse is really blind to it, rather than the parse having nothing to be blind to.
    //
    // Checked line by line rather than whole-fixture, because each fixture is stored as an array of
    // lines joined at run time — which is itself part of the mitigation, since it means no single
    // contiguous run of forbidden source text exists anywhere in this file.
    const raw = readRepoFile(GATE_PATH)
    for (const fixture of KNOWN_POSITIVE) {
      for (const line of fixture.source.split("\n")) {
        if (line.trim() === "") continue
        expect(
          raw,
          `KNOWN_POSITIVE fixture "${fixture.label}" is not present in this file's own source, so ` +
            `"zero hits in the gate file" proves nothing. Missing line: ${line.trim()}`
        ).toContain(line)
      }
    }
  })

  it("states the boundary this repository now enforces, in the file, as prose", () => {
    // S6 in its inverted form. The boundary statement is the thing a future reader needs and the
    // thing a future editor is most likely to trim as redundant with the assertions. It is quoted
    // verbatim from 47-RESEARCH §4:609-611, and this asserts it is still here.
    const raw = readRepoFile(GATE_PATH)
    expect(
      raw,
      "the boundary statement is gone from this file's header. Without it the gate is a rule with " +
        "no stated principle, and the first person to hit it will widen it rather than fix the test."
    ).toContain("as a liveness backstop")
    expect(raw).toContain("must not **assert** an elapsed-time threshold")
  })
})
