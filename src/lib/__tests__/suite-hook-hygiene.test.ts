/**
 * THE SUITE HOOK-HYGIENE GATE (QG-01).
 *
 * No lifecycle hook, and no test callback, in the base vitest project may perform a dynamic
 * `import()` — nor reach one through a same-file helper it calls.
 *
 * `src/lib/execution/toggle.test.ts` carried one, and it was the slowest hook in the suite by an
 * order of magnitude. Measured across ten idle full-suite runs, the first test in its scope cost
 * 1211-1669 ms, which is 99.5% of the whole file's cost; at 2x CPU oversubscription 3152-3372 ms;
 * at 3x, 4121-4850 ms — i.e. 43-49% of the 10 000 ms `hookTimeout`, with nothing in the file left
 * to slow down. Phase 45 recorded it timing out in 2 of 5 runs on a machine running several
 * worktree executors at once, which is roughly 7x.
 *
 * The cost was never DB I/O, fake timers, a sleep or a poll interval. It was module import cost,
 * and it was attributed: 778 ms for the first `import("@/app/workflows/actions")`, 0.1 ms for the
 * second (the module is cached, and the file calls no reset), of which 581 ms is
 * `@/db/schema/workflows` and **521 ms — 67% of the total — is `drizzle-orm/pg-core` alone**.
 * `@/db` is mocked; `@/db/schema/workflows` is not, and it imports `drizzle-orm/pg-core` directly.
 *
 * `vi.mock` calls are hoisted above imports by vitest's transform, so a top-level static import
 * sees the mocks and the dynamic form buys nothing. Moving the import to module scope relocates
 * that 880 ms into vitest's collect/import phase, which carries no hook budget: measured on a copy,
 * the first test went from 1258 ms to **3.0 ms** with all five tests still passing.
 *
 * `src/lib/execution/recursion.test.ts` had the identical defect at 879-1314 ms idle and
 * 2453-3263 ms at 3x — the next file to time out — so it was fixed in the same change.
 *
 * ── WHY THE CORPUS IS NOT HOOKS ONLY (47-14, CLOSING D-47-06-A) ───────────────────────────────
 *
 * The first version of this gate covered lifecycle hooks and nothing else. That corpus was
 * NARROWER THAN THE DEFECT CLASS, and 47-06 measured the price of the gap on the fixed tree: at a
 * sampled 2.50x-9.00x oversubscription, **three of six full-suite runs went RED**, and not one of
 * the failing assertions was a hook. They were test BODIES paying module import cost against
 * `testTimeout` **5000 ms** instead of `hookTimeout` 10 000 ms — HALF the budget, so strictly more
 * fragile than the population that had just been fixed:
 *
 *   - `src/app/api/health/__tests__/route.test.ts`               9339 ms = **186.8%** of 5000 ms
 *   - `src/app/workflows/__tests__/replay-carries-dry-run.test.ts` 5934 ms = **118.7%**
 *   - `src/lib/execution/engine.test.ts`                          5782 ms = **115.6%**
 *
 * So the sweep below covers THREE scopes over ONE parse of ONE corpus: lifecycle hooks, test
 * callbacks (`it`, `test`, and their `.each` / `.only` / `.skip` / `.failing` / `.concurrent`
 * variants), and same-file helper functions REACHABLE from either.
 *
 * ── WHY HELPERS ARE FOLLOWED NOW, WHEN THEY DELIBERATELY WERE NOT BEFORE ─────────────────────
 *
 * The first version stated its scope boundary as lexical and held it as a KNOWN_NEGATIVE: a hook
 * that merely CALLS a module-scope helper whose body contains an `import()` was not a hit. It also
 * stated the condition for changing that: *"If a future defect hides behind a helper, widen this
 * gate deliberately and record the measurement — do not assume it is already covered."*
 *
 * That is exactly what happened, and the measurement is recorded above. The **worst** assertion in
 * the whole suite — 186.8% of its budget, the only one observed at nearly 2x over — was
 * `route.test.ts`, whose import sits TWO calls deep: the test body calls `callGet()`, which calls
 * `loadRoute()`, which performs the `import()`. A lexical gate cannot see it, so a lexical gate
 * would have left the single most fragile assertion in the repository ungated. The widening is
 * therefore deliberate, measured, and held by a KNOWN_POSITIVE fixture of that exact two-level
 * shape.
 *
 * The resolution is same-file and name-based: named function declarations and
 * `const name = (…) => …` / `const name = function …` forms, with calls followed transitively from
 * any hook or test callback. Its stated limits, each held as a fixture:
 *
 *   - **An `import()` in a named function nothing reachable calls is NOT a hit.** This is not a
 *     loophole, it is the truth: `src/db/schema/saved-views.test.ts:58` holds
 *     `await import("../index")` inside `_ownerAttributionTypechecks()`, a function whose own
 *     doc-comment says *"Never called — its value is that it must typecheck."* It costs zero at
 *     run time, and hoisting it to a static import would load the REAL `@/db` at collection in a
 *     project with no `DATABASE_URL`. Flagging it would have produced a broken "fix".
 *   - **Only bare-identifier calls are edges.** `obj.method()` and `this.method()` are not
 *     followed. Every instance measured is a bare call. An `import()` inside an object-literal
 *     method, an object-literal property holding a function, or a class method is therefore
 *     reported as an UNREACHABLE helper import even when a test does call it — but it IS reported.
 *     WR-06: it used not to be. `declaredFunctionName` recognised only `function name(…)` and
 *     `const name = …`, so such an import was visited with no enclosing scope and dropped from the
 *     `ScanResult` entirely — neither a hit nor observable, which is not a boundary but a hole, and
 *     a free evasion for anyone who hit a red. Section 1 now holds all three shapes as fixtures
 *     asserting they land in `unreachableHelperImports`.
 *   - **One flat name space per file.** A shadowed name resolves to the last declaration seen.
 *   - **An `import()` directly in a `describe` body is NOT a hit** — it runs during collection,
 *     under no test or hook budget at all.
 *
 * ── WHY THIS GATE PARSES AND NEVER GREPS ─────────────────────────────────────────────────────
 *
 * Two independent reasons, both concrete.
 *
 * (1) A raw regex/paren-balance scan of this exact corpus produced a MEASURED false positive at
 *     `src/lib/observability/sentry.test.ts:185`. That hook contains only `vi.doMock(...)`; the
 *     `await import` lives in the sibling test bodies, several hundred bytes further down. Nothing
 *     line-oriented can tell those apart, and nothing paren-oriented can either once a factory
 *     callback is in the way. It is held below as a KNOWN_NEGATIVE fixture — the hook is clean even
 *     though the file is not, and the two scopes are reported separately.
 *
 *     The same weakness produced a wrong POPULATION when 47-14 was planned from a line scan: it
 *     counted `await import(` in `src/lib/audit/no-mutation-coupling.test.ts` twice, where one
 *     occurrence is prose in a comment and the other is a STRING LITERAL inside that gate's own
 *     fixture table. The file has zero real sites. An AST parse gets that right for free.
 *
 * (2) This file's own header necessarily contains the words `beforeEach` and `await import`,
 *     because it has to explain the defect it forbids. A grep-shaped gate would report itself
 *     forever (S6: reword the prose, never weaken the assertion — here the prose cannot be
 *     reworded, because the mechanism IS the subject). An AST parse sees a comment as trivia.
 *
 * ── WHAT PARSING DELIBERATELY DOES NOT CATCH ─────────────────────────────────────────────────
 *
 * An AST sweep for `CallExpression`s is inherently comment-blind, so a COMMENTED-OUT hook import
 * is not a hit here. That is the correct behaviour for this gate and it is stated rather than
 * discovered: the raw negatives in `db-test-isolation.test.ts:354-372` are what cover the
 * "one edit away from live" case for the files they own, and that file explains at `:374-386` why
 * both forms are kept.
 *
 * ── WHY `beforeAll` IS NOT AN ACCEPTABLE RELOCATION ──────────────────────────────────────────
 *
 * `beforeAll` is a lifecycle hook under the same 10 000 ms `hookTimeout`, so moving the import
 * there converts a per-file cost into a per-file cost inside the same budget. This repository
 * already contains the proof of where that road ends: `export-events-live.test.ts:47` and
 * `formatters-live.test.ts:93` both had to be written as `beforeAll(..., 60000)`. All four hook
 * names are therefore forbidden equally, and all four are covered by a KNOWN_POSITIVE fixture.
 *
 * `retries`, `testTimeout`/`hookTimeout` increases and serial-only marking were all considered and
 * are all REJECTED (47-CONTEXT). Each makes the symptom rarer while leaving a gate whose failure
 * mode is machine load rather than code behaviour.
 *
 * ── THE SELF-COLLISION MITIGATION — THERE IS EXACTLY ONE, AND THIS IS IT ─────────────────────
 *
 * This file is itself a `*.test.ts` under `src/`, so its own sweep enumerates it, and its
 * KNOWN_POSITIVE fixtures ARE the construct it forbids. `no-standing-suppressions.test.ts:19-25`
 * is the only other file in this repository that has faced this, and it records what happens when
 * it is missed: the gate's own text inflates what the gate counts.
 *
 * THE DECISION: every fixture is held as a source STRING and parsed through `scanSource`, the same
 * `ts.createSourceFile` code path the sweep uses. A string literal is not a `CallExpression`, so
 * the sweep is structurally incapable of seeing a fixture — and the fixtures still go through the
 * real matcher rather than a second, divergent one.
 *
 * THIS FILE IS NOT PATH-EXCLUDED FROM ITS OWN SWEEP, and "the gate sweeps itself" below asserts
 * that: it is present in the enumeration, absent from every exclusion list, parses to ZERO
 * lifecycle hooks and to MANY test callbacks — which is the positive proof that the body detector
 * really is looking at this file and every fixture really is a string and not live code — and
 * yields zero hits while its raw text demonstrably still contains the fixture source.
 *
 * Taking BOTH mitigations was considered and rejected. A gate that path-excludes itself AND
 * stringifies its fixtures has two independent reasons to be green and no way to tell which one is
 * load-bearing; when one silently breaks, nothing goes red. Do not add a path exclusion for this
 * file.
 *
 * ── THE FOUR CARVE-OUTS ARE LIVE CONTROLS, NOT COMMENTS ──────────────────────────────────────
 *
 * Every exclusion list below is asserted to STILL exhibit the property it excludes, in the
 * `deployment-docs-accuracy.test.ts:537-556` + `:692-700` + `:593-600` style, and the lists are
 * asserted disjoint except for one deliberate overlap that is itself asserted to be real. That is
 * also this gate's token floor (WR-11): a detector that quietly stopped detecting would satisfy
 * "the sweep found no offenders" perfectly, and the ONLY thing that distinguishes that from a clean
 * tree is a standing assertion that the detector still finds the instances that are known to be
 * there. The carve-out control and the token floor are the same assertion on purpose — an exclusion
 * that is also a floor cannot rot in either direction.
 *
 * 47-03 MEASURED the rot this prevents. `vi.resetModules()` was deleted from a carved-out file on
 * purpose; the sweep stayed GREEN, because the file was still path-excluded. Only the live control
 * went red. A path list without a live control is not an exemption, it is a hole.
 *
 * ── IF THIS WENT RED ────────────────────────────────────────────────────────────────────────
 *
 * Move the import to module scope, beside the `vi.mock` calls, and delete the helper or reduce the
 * hook to a synchronous `vi.clearAllMocks()`. Do NOT move it to `beforeAll`. Do NOT add the file to
 * a carve-out list without both a written reason and a live control asserting it still needs the
 * exemption. Never relax the sweep.
 */
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

import ts from "typescript"
import { describe, expect, it } from "vitest"

const REPO_ROOT = process.cwd()

/** The tree the base vitest project collects from (`vitest.config.ts` include is `src/**`). */
const SRC_ROOT = "src"

/** This file, by path. Named so the self-collision control can assert it is NOT excluded. */
const GATE_PATH = "src/lib/__tests__/suite-hook-hygiene.test.ts"

/**
 * The files this gate was written to fix, across both of its rounds. Named so a rename cannot
 * slip them out of scope.
 *
 * The first two are 47-03's hook subjects. The rest are 47-14's test-scope subjects — the three
 * files 47-06 observed timing out plus the three other members of the hoisted population.
 */
const SUBJECT_PATHS = [
  "src/lib/execution/toggle.test.ts",
  "src/lib/execution/recursion.test.ts",
  "src/app/api/health/__tests__/route.test.ts",
  "src/app/workflows/__tests__/replay-carries-dry-run.test.ts",
  "src/lib/execution/engine.test.ts",
  "src/lib/execution/execution-processor.test.ts",
  "src/lib/execution/failure-alert.test.ts",
  "src/lib/log.test.ts",
  "src/lib/import/formula-recalc-batch.test.ts",
] as const

/** The four lifecycle hook names vitest exposes. All four are forbidden equally — see the header. */
const LIFECYCLE_HOOKS = new Set(["beforeEach", "beforeAll", "afterEach", "afterAll"])

/**
 * The two identifiers a test callback can hang off. Every modifier chain — `.each`, `.only`,
 * `.skip`, `.todo`, `.fails`, `.failing`, `.concurrent`, `.sequential`, `.skipIf`, `.runIf`, and any
 * combination — is reached by walking the property-access chain down to one of these two roots, so
 * a vitest release that adds another modifier is covered without editing this set.
 *
 * `describe` is deliberately absent: code directly in a `describe` body runs during COLLECTION,
 * under no test or hook budget.
 */
const TEST_ROOTS = new Set(["it", "test"])

/**
 * Floor on the number of `*.test.ts` / `*.test.tsx` files the walk enumerates under `src/`.
 * Measured on the tree 47-14 extended this gate against: **178**. (47-03 measured 175 before its
 * own file existed.) 150 is a deliberately loose floor, set BELOW the measurement so that ordinary
 * consolidation of test files does not fatal with a message that misdiagnoses shrinkage as a broken
 * walk.
 *
 * Without this floor a wrong root constant or a broken recursion yields an empty file list,
 * therefore zero hits, therefore a permanently green gate — the exact shape of the v1.3 gates that
 * could not fail.
 */
const MIN_TEST_FILES = 150

/**
 * Floor on the number of lifecycle-hook `CallExpression`s the parse finds across that corpus.
 * Measured: **151** (unchanged from 47-03's measurement of 151). 140 is set below it for the same
 * reason as above.
 *
 * "The sweep found no offenders" is satisfied perfectly by a hook detector that stopped detecting
 * hooks — by a renamed `SyntaxKind`, by a `typescript` major that changes `CallExpression.expression`
 * for identifiers, or by a typo in `LIFECYCLE_HOOKS`. This assertion is what tells those apart from
 * a clean tree.
 */
const MIN_HOOKS_PARSED = 140

/**
 * Floor on the number of TEST CALLBACKS the parse finds across that corpus — the anti-vacuity
 * counter for 47-14's whole extension. Measured: **3735**. 3000 is set below it, loosely, because
 * this number moves whenever anyone writes or deletes a test.
 *
 * This is the floor that makes the test-scope sweep falsifiable. A `TEST_ROOTS` typo, a change in
 * how vitest chains modifiers, or a regression in the property-access unwrapping would all collapse
 * this to something small while leaving every "no offenders" assertion below perfectly green.
 */
const MIN_TEST_CALLBACKS_PARSED = 3000

/**
 * Floor on hook-scoped `import()` calls inside `RESET_MODULES_CARVE_OUT`. Measured: exactly 4, one
 * per file. Each file is ALSO asserted individually to still have at least one, so this aggregate is
 * a derived cross-check rather than a moving target — which is why it sits at the measurement rather
 * than below it.
 */
const MIN_CARVED_OUT_HOOK_IMPORTS = 4

/**
 * Floor on test-scoped `import()` calls inside `MODULE_INSTANCE_CARVE_OUT`. Measured: exactly
 * **17** — `send.test.ts` 7, `http.test.ts` 5, `crm.test.ts` 4, `sentry.test.ts` 1 (via its
 * `loadSentry()` helper). At the measurement, for the same reason as the hook aggregate above.
 */
const MIN_CARVED_OUT_TEST_IMPORTS = 17

/**
 * Floor on the untyped-compiled-path imports in `UNTYPED_COMPILED_CARVE_OUT`. Measured: exactly
 * **2**, one per file.
 */
const MIN_UNTYPED_COMPILED_IMPORTS = 2

/**
 * DELIBERATELY EXCLUDED, carve-out 1 of 4 — HOOK scope only.
 *
 * This list exists so the next reader finds the reasoning instead of re-deriving it, or "fixing"
 * these four and changing what they test.
 *
 * All four call `vi.resetModules()` in the SAME hook as the dynamic import, which makes them a
 * different sub-case rather than the same defect: the module cache is dropped every test, so the
 * import cost is paid per test rather than once, and a static import would change the semantics the
 * reset exists to produce. Whether that reset is load-bearing for any of them is unknown, and
 * finding out is not in this phase's scope.
 *
 * Measured first-test cost, i.e. the cost this exemption is accepting:
 *   - `.../crm.test.ts:96`           535 ms
 *   - `.../http.test.ts:90`          106 ms
 *   - `.../notification.test.ts:98`   83 ms
 *   - `.../email.test.ts:98`          44 ms
 *
 * None is near its budget. Revisit if one starts approaching it. This is 47-CONTEXT's explicitly
 * documented, decided carve-out — not a silent hole — and every entry is asserted below to STILL
 * carry a hook-scoped `import()` with `vi.resetModules()` beside it in that same hook, so a future
 * sweep that "fixes all the dynamic imports" turns this red instead of leaving an exemption
 * covering a file that no longer needs one.
 */
const RESET_MODULES_CARVE_OUT = [
  "src/lib/execution/actions/__tests__/crm.test.ts",
  "src/lib/execution/actions/__tests__/http.test.ts",
  "src/lib/execution/actions/__tests__/notification.test.ts",
  "src/lib/execution/actions/__tests__/email.test.ts",
] as const

/**
 * DELIBERATELY EXCLUDED, carve-out 2 of 4 — TEST scope (bodies and reachable helpers).
 *
 * A fresh module instance per test IS the point in these four, so the static form would delete the
 * property they exist to assert. Detection is at FILE level rather than per test, deliberately
 * conservative: `vi.resetModules()` and `vi.doMock()` interact with the module registry for the
 * whole file, and a per-test rule would exempt too little.
 *
 * Measured, on the tree this carve-out was written against:
 *   - `src/lib/email/send.test.ts`               7 test-scope imports, `vi.resetModules()` x5
 *   - `src/lib/execution/actions/__tests__/http.test.ts`  5, reset x1 + `vi.doMock()` x1
 *   - `src/lib/execution/actions/__tests__/crm.test.ts`   4, reset x1
 *   - `src/lib/observability/sentry.test.ts`      1 (via `loadSentry()`), reset x3 + doMock x3
 *
 * `sentry.test.ts` is the strongest case in the list: its whole design is layered `vi.doMock`
 * factories, and it is also the file whose hook produced the MEASURED false positive that made this
 * gate parse rather than grep.
 *
 * Every entry is asserted below to still call `vi.resetModules()` or `vi.doMock()` AND to still
 * carry at least one test-scope `import()`. 47-03 measured what happens without that control: the
 * reset was deleted, the sweep stayed green, and only the live control caught it.
 */
const MODULE_INSTANCE_CARVE_OUT = [
  "src/lib/email/send.test.ts",
  "src/lib/execution/actions/__tests__/http.test.ts",
  "src/lib/execution/actions/__tests__/crm.test.ts",
  "src/lib/observability/sentry.test.ts",
] as const

/**
 * DELIBERATELY EXCLUDED, carve-out 3 of 4 — an honest carve-out rather than a broken hoist.
 *
 * Both files serialize a model through the SHIPPED Flight server at
 * `next/dist/compiled/react-server-dom-webpack/server.edge.js`, reached through a `flight()` helper
 * their test bodies call. That deep compiled path ships no type declarations, which is why the
 * dynamic form is cast `as unknown as FlightServer` at the boundary; a static import of it does not
 * typecheck, so "hoist it" is not available here without either a module declaration for a Next
 * internal or a standing compiler-suppression directive — both worse than the import. (That
 * directive is named here by description rather than by spelling on purpose:
 * `src/types/__tests__/no-standing-suppressions.test.ts` counts its occurrences over RAW,
 * un-stripped source, so writing it even inside a comment inflates what that gate counts. This
 * file learned that the hard way — the sentence you are reading replaced two literal spellings
 * that took three of its assertions red.)
 *
 * They are also `*.rsc.test.tsx`, which `vitest.config.ts` EXCLUDES from the base project: they run
 * in the second (rsc) project, 8 tests total, and no run of it has ever been observed near a
 * timeout. The exemption is therefore small, bounded and load-tested by absence of incident.
 *
 * Each entry is asserted below to still carry a test-reachable `import()` whose specifier is still
 * under `next/dist/compiled/` — so if either file is ever rewritten against a typed entry point,
 * this goes red and the exemption gets deleted instead of quietly covering a hoistable import.
 */
const UNTYPED_COMPILED_CARVE_OUT = [
  "src/app/admin/fields/[entityType]/__tests__/available-fields-payload.rsc.test.tsx",
  "src/app/admin/fields/[entityType]/__tests__/field-dialog-boundary.rsc.test.tsx",
] as const

/**
 * DELIBERATELY EXCLUDED, carve-out 4 of 4 — a separate list with a separate reason, kept distinct
 * from the ones above and asserted disjoint from them.
 *
 * Both files are opt-in live-database suites gated on `describe.skipIf(!HAS_DB)`, so with
 * `DATABASE_URL` unset — the state of the base vitest project — the suite is skipped and neither
 * the hooks nor the test bodies run at all. They are also the in-repo proof of why `beforeAll` is
 * not a relocation: both carry an explicit 60 000 ms hook timeout
 * (`export-events-live.test.ts:47`, `formatters-live.test.ts:93`) precisely because a module graph
 * plus real Postgres round-trips does not fit a 10 000 ms budget.
 *
 * The exemption covers BOTH scopes for these two files, because the reason — the code never runs —
 * applies to both. `export-events-live.test.ts` has 5 hook-scope imports and 1 test-scope one.
 *
 * Each entry is asserted below to STILL be `skipIf`-gated AND to still carry an `import()`. If
 * either stops being true the exemption no longer describes the file, and this goes red rather than
 * quietly widening.
 */
const SKIPPED_LIVE_FILES = [
  "src/lib/audit/export-events-live.test.ts",
  "src/lib/export/formatters-live.test.ts",
] as const

/** Files exempt from the HOOK sweep. */
const HOOK_EXCLUDED_PATHS: readonly string[] = [...RESET_MODULES_CARVE_OUT, ...SKIPPED_LIVE_FILES]

/** Files exempt from the TEST-scope sweep (bodies and reachable helpers). */
const TEST_EXCLUDED_PATHS: readonly string[] = [
  ...MODULE_INSTANCE_CARVE_OUT,
  ...UNTYPED_COMPILED_CARVE_OUT,
  ...SKIPPED_LIVE_FILES,
]

/**
 * Every path this gate suppresses anywhere, deduplicated. Used by the self-collision control and by
 * the "excluded but not enumerated" check — never by the sweeps, which use the scope-specific lists
 * above so that an exemption cannot leak from one scope into the other.
 */
const EXCLUDED_PATHS: readonly string[] = [
  ...new Set<string>([...HOOK_EXCLUDED_PATHS, ...TEST_EXCLUDED_PATHS]),
]

/**
 * The ONE deliberate overlap between two carve-out lists: `http.test.ts` and `crm.test.ts` are
 * exempt in both scopes, for the same underlying reason applied twice (a hook-scoped reset, and
 * file-level module-registry manipulation). Asserted below to be REAL — each of these must actually
 * carry both a hook-scope hit and a test-scope hit — rather than left as an unexplained collision
 * between two lists that are otherwise asserted disjoint.
 */
const EXPECTED_SCOPE_OVERLAP = [
  "src/lib/execution/actions/__tests__/crm.test.ts",
  "src/lib/execution/actions/__tests__/http.test.ts",
] as const

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8")
}

/**
 * Every test file the base vitest project would collect, as repo-relative POSIX paths.
 *
 * The only regular expressions in this file match FILE NAMES. Hook detection, test detection and
 * `import()` detection go exclusively through the AST — see the header.
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

/** Which budget an `import()` is billed against. */
export type ImportScope = "hook" | "test" | "helper"

export interface ImportHit {
  file: string
  /** `hook` = inside a lifecycle hook. `test` = inside a test callback. `helper` = inside a
   *  same-file function reachable from one of those. */
  scope: ImportScope
  /** Hook name, test-call expression (`it`, `it.each`, …) or helper function name. */
  container: string
  /** 1-based line the container opens on. */
  containerLine: number
  /** 1-based line of the `import()` call. */
  line: number
  /** The `import()` expression's own source text. */
  text: string
  /** Whether `vi.resetModules()` appears inside that same hook or test callback. Drives carve-out
   *  1's live control. Always `false` for `helper` scope, where there is no enclosing budget. */
  resetModulesInScope: boolean
  /** For `helper` scope: which kinds of scope can reach this helper. Empty otherwise. */
  reachedFrom: readonly ("hook" | "test")[]
}

export interface ScanResult {
  hits: ImportHit[]
  /** Anti-vacuity counter: lifecycle-hook call expressions the parse actually saw. */
  hooksSeen: number
  /** Anti-vacuity counter: test callbacks the parse actually saw. */
  testCallbacksSeen: number
  /** File-level `vi.resetModules()` call count. Drives carve-out 2's live control. */
  resetModulesCalls: number
  /** File-level `vi.doMock()` call count. Drives carve-out 2's live control. */
  doMockCalls: number
  /** `import()`s inside a named function NOTHING reachable calls — the stated boundary, reported so
   *  it can be asserted rather than assumed. Not hits. */
  unreachableHelperImports: ImportHit[]
}

interface ScopeContext {
  kind: ImportScope
  name: string
  line: number
  resetModules: boolean
}

/** `vi.<name>()` — a `CallExpression` on the `vi` namespace, matched structurally. */
function isViCall(node: ts.Node, name: string): boolean {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "vi" &&
    node.expression.name.text === name
  )
}

/** A dynamic `import(...)` — a `CallExpression` whose callee is the `import` keyword itself. */
function isDynamicImportCall(node: ts.Node): boolean {
  return ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
}

/** `beforeEach(...)` / `beforeAll(...)` / `afterEach(...)` / `afterAll(...)`, or `null`. */
function lifecycleHookName(node: ts.Node): string | null {
  if (!ts.isCallExpression(node)) return null
  if (!ts.isIdentifier(node.expression)) return null
  return LIFECYCLE_HOOKS.has(node.expression.text) ? node.expression.text : null
}

/**
 * `it(...)`, `test(...)`, `it.each(table)(...)`, `it.only.each\`…\`(...)`, … as a dotted name, or
 * `null`.
 *
 * Only the OUTERMOST link of a call/tag chain is reported, so `it.each(table)("t", fn)` counts once
 * rather than twice — the inner `it.each(table)` is skipped because its parent call invokes it.
 */
function testCallName(node: ts.Node): string | null {
  let head: ts.Node
  if (ts.isCallExpression(node)) head = node.expression
  else if (ts.isTaggedTemplateExpression(node)) head = node.tag
  else return null

  const parent = node.parent as ts.Node | undefined
  if (
    parent &&
    ((ts.isCallExpression(parent) && parent.expression === node) ||
      (ts.isTaggedTemplateExpression(parent) && parent.tag === node))
  ) {
    return null
  }

  while (ts.isCallExpression(head) || ts.isTaggedTemplateExpression(head)) {
    head = ts.isCallExpression(head) ? head.expression : head.tag
  }

  const suffix: string[] = []
  let cursor: ts.Node = head
  while (ts.isPropertyAccessExpression(cursor)) {
    suffix.unshift(cursor.name.text)
    cursor = cursor.expression
  }
  if (!ts.isIdentifier(cursor) || !TEST_ROOTS.has(cursor.text)) return null
  return [cursor.text, ...suffix].join(".")
}

/**
 * `function name(…)`, `const name = (…) => …` / `const name = function(…)`, an object-literal
 * method or property holding a function, or a class method — else `null`.
 *
 * WR-06: the method forms were added because WITHOUT them an `import()` inside one had
 * `ctx === undefined` when it was visited, so the guard at the hit site
 * (`isDynamicImportCall(node) && ctx !== undefined`) dropped it ENTIRELY — it became neither a hit
 * nor an entry in `unreachableHelperImports`. Verified against the shipped scanner:
 *
 *     MISSED  object-literal method a test calls   | hits: 0 | unreachable: 0
 *     MISSED  class method a test calls            | hits: 0 | unreachable: 0
 *     MISSED  helper aliased through a const       | hits: 0 | unreachable: 1   (visible, at least)
 *
 * Not FOLLOWING `obj.method()` calls is a stated limit of this gate and stays one — the call graph
 * is bare-identifier only, so an import in a method is reported as UNREACHABLE even when a test
 * calls it. What was not stated, and what broke a control, is that these imports never appeared in
 * the `ScanResult` at all. Section 5 exists specifically to prove the stated boundary is
 * OBSERVABLE rather than merely absent from the hit list, because otherwise "no hits" cannot be
 * told apart from "the helper pass broke". For this shape it was neither, which made it a free
 * evasion for anyone who hit a red.
 */
function declaredFunctionName(node: ts.Node): string | null {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.initializer &&
    (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
  ) {
    return node.name.text
  }
  // `{ name() {…} }` and `class X { name() {…} }`.
  if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) return node.name.text
  // `{ name: () => …, name: function () {…} }`.
  if (
    ts.isPropertyAssignment(node) &&
    ts.isIdentifier(node.name) &&
    (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
  ) {
    return node.name.text
  }
  return null
}

/** The bare identifier being called, or `null` for `obj.method()` / `this.method()` / computed. */
function bareCalleeName(node: ts.Node): string | null {
  if (!ts.isCallExpression(node)) return null
  return ts.isIdentifier(node.expression) ? node.expression.text : null
}

function containsResetModules(scopeNode: ts.Node): boolean {
  let found = false
  const visit = (node: ts.Node): void => {
    if (found) return
    if (isViCall(node, "resetModules")) {
      found = true
      return
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(scopeNode, visit)
  return found
}

/**
 * Parse `sourceText` and report every dynamic `import()` reachable from a lifecycle hook or a test
 * callback — directly, or through a same-file helper the hook/test calls (transitively).
 *
 * Exported and taking a source STRING rather than only a path, so the fixtures below reach exactly
 * this code path (S1(b)) and so the self-collision mitigation described in the header holds: a
 * fixture is a string literal, and a string literal is not a `CallExpression`.
 */
export function scanSource(fileName: string, sourceText: string): ScanResult {
  const src = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )

  const direct: ImportHit[] = []
  /** helper name -> the `import()`s lexically inside it. */
  const helperImports = new Map<string, ImportHit[]>()
  /** helper name -> the bare identifiers it calls. */
  const helperCalls = new Map<string, Set<string>>()
  /** bare identifiers called directly from a hook / test callback. */
  const rootCalls = { hook: new Set<string>(), test: new Set<string>() }

  let hooksSeen = 0
  let testCallbacksSeen = 0
  let resetModulesCalls = 0
  let doMockCalls = 0

  const lineOf = (node: ts.Node): number =>
    src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1

  const visit = (node: ts.Node, ctx: ScopeContext | undefined): void => {
    let next = ctx

    const hookName = lifecycleHookName(node)
    const testName = hookName === null ? testCallName(node) : null
    const helperName = hookName === null && testName === null ? declaredFunctionName(node) : null

    if (hookName !== null) {
      hooksSeen += 1
      next = {
        kind: "hook",
        name: hookName,
        line: lineOf(node),
        resetModules: containsResetModules(node),
      }
    } else if (testName !== null) {
      testCallbacksSeen += 1
      next = {
        kind: "test",
        name: testName,
        line: lineOf(node),
        resetModules: containsResetModules(node),
      }
    } else if (helperName !== null) {
      next = { kind: "helper", name: helperName, line: lineOf(node), resetModules: false }
    }

    if (isViCall(node, "resetModules")) resetModulesCalls += 1
    if (isViCall(node, "doMock")) doMockCalls += 1

    // Call edges are attributed to the scope the call SITS IN, which is `ctx`, not `next`.
    const callee = bareCalleeName(node)
    if (callee !== null && ctx !== undefined) {
      if (ctx.kind === "helper") {
        const edges = helperCalls.get(ctx.name) ?? new Set<string>()
        edges.add(callee)
        helperCalls.set(ctx.name, edges)
      } else {
        rootCalls[ctx.kind === "hook" ? "hook" : "test"].add(callee)
      }
    }

    if (isDynamicImportCall(node) && ctx !== undefined) {
      const hit: ImportHit = {
        file: fileName,
        scope: ctx.kind,
        container: ctx.name,
        containerLine: ctx.line,
        line: lineOf(node),
        text: node.getText(src).replace(/\s+/g, " "),
        resetModulesInScope: ctx.resetModules,
        reachedFrom: [],
      }
      if (ctx.kind === "helper") {
        const bucket = helperImports.get(ctx.name) ?? []
        bucket.push(hit)
        helperImports.set(ctx.name, bucket)
      } else {
        direct.push(hit)
      }
    }

    ts.forEachChild(node, (child) => visit(child, next))
  }

  visit(src, undefined)

  const reachableFrom = (roots: Set<string>): Set<string> => {
    const seen = new Set<string>()
    const queue = [...roots]
    while (queue.length > 0) {
      const name = queue.shift() as string
      if (seen.has(name)) continue
      seen.add(name)
      for (const edge of helperCalls.get(name) ?? []) if (!seen.has(edge)) queue.push(edge)
    }
    return seen
  }
  const fromHook = reachableFrom(rootCalls.hook)
  const fromTest = reachableFrom(rootCalls.test)

  const hits = [...direct]
  const unreachableHelperImports: ImportHit[] = []
  for (const [helper, bucket] of helperImports) {
    const reached: ("hook" | "test")[] = []
    if (fromHook.has(helper)) reached.push("hook")
    if (fromTest.has(helper)) reached.push("test")
    for (const hit of bucket) {
      if (reached.length === 0) unreachableHelperImports.push(hit)
      else hits.push({ ...hit, reachedFrom: reached })
    }
  }
  hits.sort((left, right) => left.line - right.line)

  return {
    hits,
    hooksSeen,
    testCallbacksSeen,
    resetModulesCalls,
    doMockCalls,
    unreachableHelperImports,
  }
}

/** `file:line: scope container (opened at :N) contains text`, the house `file:line` collector shape. */
function formatHit(hit: ImportHit): string {
  const via =
    hit.scope === "helper" ? ` reachable from ${hit.reachedFrom.join("+") || "nothing"}` : ""
  return (
    `${hit.file}:${hit.line}: ${hit.scope} ${hit.container} (opened at :${hit.containerLine})` +
    `${via} contains ${hit.text}`
  )
}

/** Hits billed against `hookTimeout` — a hook body, or a helper a hook calls. */
function isHookBudget(hit: ImportHit): boolean {
  return hit.scope === "hook" || (hit.scope === "helper" && hit.reachedFrom.includes("hook"))
}

/** Hits billed against `testTimeout` — a test body, or a helper a test calls. */
function isTestBudget(hit: ImportHit): boolean {
  return hit.scope === "test" || (hit.scope === "helper" && hit.reachedFrom.includes("test"))
}

function scanFile(file: string): ScanResult {
  return scanSource(file, readRepoFile(file))
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 1. THE MATCHER PROVES ITSELF AGAINST FIXTURES, BEFORE THE SWEEP IS TRUSTED.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Every fixture below is a SOURCE STRING, parsed through `scanSource`. That is the single
 * self-collision mitigation this file takes; see the header. Do not convert any of these into live
 * code, and do not path-exclude this file to make live fixtures safe.
 *
 * `expected` is `scope container:line`, so the positives assert the EXTRACTED VALUE rather than
 * merely that something was found: a matcher that reported every node would fail here too.
 */
const KNOWN_POSITIVE = [
  {
    label: "beforeEach with a dynamic import — the toggle.test.ts defect",
    source: [
      `describe("subject", () => {`,
      `  beforeEach(async () => {`,
      `    vi.clearAllMocks()`,
      `    const mod = await import("@/app/workflows/actions")`,
      `    toggleWorkflow = mod.toggleWorkflow`,
      `  })`,
      `})`,
    ].join("\n"),
    expected: ["hook beforeEach:4"],
  },
  {
    label: "beforeAll with a dynamic import — beforeAll is not a relocation",
    source: [`beforeAll(async () => {`, `  db = (await import("@/db")).db`, `})`].join("\n"),
    expected: ["hook beforeAll:2"],
  },
  {
    label: "afterEach with a dynamic import",
    source: [`afterEach(async () => {`, `  await import("./teardown")`, `})`].join("\n"),
    expected: ["hook afterEach:2"],
  },
  {
    label: "afterAll with a dynamic import",
    source: [`afterAll(async () => {`, `  await import("./cleanup")`, `})`].join("\n"),
    expected: ["hook afterAll:2"],
  },
  {
    label: "two dynamic imports in one hook are two hits, not one",
    source: [
      `beforeAll(async () => {`,
      `  const a = await import("@/db")`,
      `  const b = await import("@/db/schema")`,
      `})`,
    ].join("\n"),
    expected: ["hook beforeAll:2", "hook beforeAll:3"],
  },
  {
    label: "a hook with an explicit timeout argument is still a hook",
    source: [`beforeAll(async () => {`, `  await import("@/db")`, `}, 60000)`].join("\n"),
    expected: ["hook beforeAll:2"],
  },

  // ── 47-14: the TEST-scope population, against half the budget. ─────────────────────────────
  {
    label: "an it() body with a dynamic import — the replay-carries-dry-run defect",
    source: [
      `it("replays a run", async () => {`,
      `  const { replayRun } = await import("../actions")`,
      `  expect(await replayRun("r1")).toBeTruthy()`,
      `})`,
    ].join("\n"),
    expected: ["test it:2"],
  },
  {
    label: "a test() body with a dynamic import",
    source: [`test("does a thing", async () => {`, `  await import("./subject")`, `})`].join("\n"),
    expected: ["test test:2"],
  },
  {
    label: "two dynamic imports in one test body are two hits — the engine.test.ts shape",
    source: [
      `it("walks a linear graph", async () => {`,
      `  const { executeAction } = await import("./actions")`,
      `  const { executeRun } = await import("./engine")`,
      `  await executeRun("r1")`,
      `})`,
    ].join("\n"),
    expected: ["test it:2", "test it:3"],
  },
  {
    label: "it.each(table)(...) is one test callback, not two, and its body is in scope",
    source: [
      `it.each([1, 2])("case %i", async (n) => {`,
      `  const mod = await import("./subject")`,
      `  expect(mod.f(n)).toBe(n)`,
      `})`,
    ].join("\n"),
    expected: ["test it.each:2"],
  },
  {
    label: "it.only and it.skip bodies are in scope too",
    source: [
      `it.only("focused", async () => {`,
      `  await import("./a")`,
      `})`,
      `it.skip("parked", async () => {`,
      `  await import("./b")`,
      `})`,
    ].join("\n"),
    expected: ["test it.only:2", "test it.skip:5"],
  },
  {
    label: "test.concurrent.each is still a test callback",
    source: [
      `test.concurrent.each([1])("case %i", async () => {`,
      `  await import("./subject")`,
      `})`,
    ].join("\n"),
    expected: ["test test.concurrent.each:2"],
  },
  {
    label:
      "a TWO-LEVEL helper chain a test body calls — the route.test.ts 186.8%-of-budget defect",
    source: [
      `async function loadRoute() {`,
      `  return await import("@/app/api/health/route")`,
      `}`,
      ``,
      `async function callGet() {`,
      `  const { GET } = await loadRoute()`,
      `  return await GET()`,
      `}`,
      ``,
      `it("answers 503 when the registry is empty", async () => {`,
      `  const res = await callGet()`,
      `  expect(res.status).toBe(503)`,
      `})`,
    ].join("\n"),
    expected: ["helper loadRoute:2"],
  },
  {
    label: "an arrow-const helper a test body calls",
    source: [
      `const loadLog = async () => (await import("./log")).log`,
      ``,
      `it("logs once", async () => {`,
      `  const log = await loadLog()`,
      `  expect(log).toBeTypeOf("function")`,
      `})`,
    ].join("\n"),
    expected: ["helper loadLog:1"],
  },
  {
    label: "a helper a HOOK calls — 47-03's stated boundary, deliberately widened by 47-14",
    source: [
      `async function loadSubject() {`,
      `  return await import("./subject")`,
      `}`,
      ``,
      `beforeEach(async () => {`,
      `  subject = await loadSubject()`,
      `})`,
      ``,
      `it("uses it", () => {`,
      `  expect(subject).toBeDefined()`,
      `})`,
    ].join("\n"),
    expected: ["helper loadSubject:2"],
  },
] as const

const KNOWN_NEGATIVE = [
  {
    // The MEASURED false positive of a raw scan — sentry.test.ts:185. The hook holds only a
    // `vi.doMock` factory; the `await import` is in the test bodies. This fixture is the reason
    // this gate parses. NOTE the assertion is now about the SCOPE: the hook is clean, and the gate
    // must say so, even though the test body is a hit under the 47-14 corpus.
    label: "vi.doMock in the hook, await import in the test bodies (sentry.test.ts:185)",
    source: [
      `describe("layer 2", () => {`,
      `  beforeEach(() => {`,
      `    vi.doMock("@sentry/nextjs", () => {`,
      `      throw new Error("must not be imported")`,
      `    })`,
      `  })`,
      ``,
      `  it("resolves false rather than rejecting", async () => {`,
      `    const { initSentry } = await import("./sentry")`,
      `    await expect(initSentry()).resolves.toBe(false)`,
      `  })`,
      `})`,
    ].join("\n"),
    scope: "hook",
  },
  {
    // The exact INVERSE of the fixture above, and the proof that the two sweeps are really
    // independent rather than one sweep reported twice: here the hook is the offender and the test
    // body is clean, so the TEST-scope sweep must stay silent. Without both directions, a bug that
    // merged the two scopes would pass every other assertion in this file.
    label: "await import in the hook, clean test bodies (the inverse of the sentry case)",
    source: [
      `beforeEach(async () => {`,
      `  subject = await import("./subject")`,
      `})`,
      ``,
      `it("uses the module the hook loaded", () => {`,
      `  expect(subject).toBeDefined()`,
      `})`,
    ].join("\n"),
    scope: "test",
  },
  {
    label: "a top-level static import",
    source: [
      `import { toggleWorkflow } from "@/app/workflows/actions"`,
      ``,
      `describe("subject", () => {`,
      `  beforeEach(() => {`,
      `    vi.clearAllMocks()`,
      `  })`,
      ``,
      `  it("toggles", () => {`,
      `    expect(toggleWorkflow).toBeTypeOf("function")`,
      `  })`,
      `})`,
    ].join("\n"),
    scope: "both",
  },
  {
    // The stated boundary of the 47-14 widening — see the header. `saved-views.test.ts:58` is
    // exactly this: a typecheck-only function whose own comment says "Never called". Hoisting it
    // would load the real @/db at collection in a project with no DATABASE_URL.
    label: "an import() inside a named function that NOTHING calls (saved-views.test.ts:58)",
    source: [
      `async function _ownerAttributionTypechecks() {`,
      `  const { db } = await import("../index")`,
      `  return db.query.savedViews.findMany({ with: { owner: true } })`,
      `}`,
      ``,
      `it("declares the columns it claims", () => {`,
      `  expect(1).toBe(1)`,
      `})`,
    ].join("\n"),
    scope: "both",
  },
  {
    // Transitivity must not become reachability-from-anywhere: an uncalled helper's callees stay
    // uncalled.
    label: "a helper reachable only from another helper that nothing calls",
    source: [
      `async function inner() {`,
      `  return await import("./subject")`,
      `}`,
      ``,
      `async function outerNobodyCalls() {`,
      `  return await inner()`,
      `}`,
      ``,
      `it("does not use either", () => {`,
      `  expect(true).toBe(true)`,
      `})`,
    ].join("\n"),
    scope: "both",
  },
  {
    // Collection-time code carries no test or hook budget, so it is out of scope by construction.
    label: "an import() directly in a describe body (collection time, no budget)",
    source: [
      `describe("subject", async () => {`,
      `  const mod = await import("./subject")`,
      ``,
      `  it("exists", () => {`,
      `    expect(mod).toBeDefined()`,
      `  })`,
      `})`,
    ].join("\n"),
    scope: "both",
  },
  {
    label: "a type-only `typeof import(...)` reference in a test body, which is erased at runtime",
    source: [
      `let createWorkflowRun: typeof import("@/lib/triggers/create-run").createWorkflowRun`,
      ``,
      `it("has the type", () => {`,
      `  const local: typeof import("@/db").db = fake`,
      `  expect(local).toBeDefined()`,
      `})`,
    ].join("\n"),
    scope: "both",
  },
  {
    // recursion.test.ts:27's deterministic event-loop yield. Not a race, not this gate's business.
    label: "an event-loop-yield setTimeout inside a hook and a test",
    source: [
      `beforeEach(async () => {`,
      `  await new Promise((r) => setTimeout(r, 1))`,
      `})`,
      ``,
      `it("yields", async () => {`,
      `  await new Promise((r) => setTimeout(r, 1))`,
      `})`,
    ].join("\n"),
    scope: "both",
  },
  {
    label: "a hook and a test that await a plain function call named like an import",
    source: [
      `beforeEach(async () => {`,
      `  await importSeeds()`,
      `})`,
      ``,
      `it("imports seeds", async () => {`,
      `  await importFixtures()`,
      `})`,
    ].join("\n"),
    scope: "both",
  },
  {
    // `describe` is not in TEST_ROOTS on purpose, and this proves the chain walk does not leak into
    // it via a modifier.
    label: "describe.each is not a test callback",
    source: [
      `describe.each([1])("group %i", () => {`,
      `  it("passes", () => {`,
      `    expect(true).toBe(true)`,
      `  })`,
      `})`,
    ].join("\n"),
    scope: "both",
  },
] as const

describe("the hook/test/helper import matcher, unit-tested against fixtures FIRST", () => {
  /**
   * These assertions gate everything below them. A matcher that matches nothing yields an empty hit
   * list, an empty list satisfies `toEqual([])`, and the whole sweep becomes unfalsifiable. If any
   * fixture here is red, treat every pass further down as unproven.
   */
  it.each(KNOWN_POSITIVE)("MUST flag: $label", ({ source, expected }) => {
    const { hits } = scanSource("known-positive.ts", source)
    expect(hits.map((hit) => `${hit.scope} ${hit.container}:${hit.line}`)).toEqual([...expected])
  })

  it.each(KNOWN_NEGATIVE)("MUST NOT flag: $label", ({ source, scope }) => {
    const { hits } = scanSource("known-negative.ts", source)
    const relevant =
      scope === "hook" ? hits.filter(isHookBudget) : scope === "test" ? hits.filter(isTestBudget) : hits
    expect(relevant.map(formatHit)).toEqual([])
  })

  it.each(KNOWN_NEGATIVE)("still parses a scope in the negative fixture: $label", ({ source, label }) => {
    // The negatives' token floor. `toEqual([])` above is satisfied by a parse that failed outright
    // and returned nothing, which would make every negative meaningless — a matcher that matches
    // nothing passes all of them. Every negative fixture declares a hook or a test on purpose; the
    // parse must still have counted one, so the fixture is proving "saw the scope, did not flag the
    // import" rather than "saw nothing at all".
    const { hooksSeen, testCallbacksSeen } = scanSource("known-negative.ts", source)
    expect(hooksSeen + testCallbacksSeen, `the parse saw no hook and no test in: ${label}`).toBeGreaterThan(0)
  })

  it.each([
    {
      shape: "an object-literal method",
      source: [
        `const helpers = {`,
        `  async loadActions() {`,
        `    return await import("@/app/workflows/actions")`,
        `  },`,
        `}`,
        `it("uses it", async () => {`,
        `  await helpers.loadActions()`,
        `})`,
      ].join("\n"),
      container: "loadActions",
    },
    {
      shape: "a class method",
      source: [
        `class Helpers {`,
        `  async loadActions() {`,
        `    return await import("@/app/workflows/actions")`,
        `  }`,
        `}`,
        `it("uses it", async () => {`,
        `  await new Helpers().loadActions()`,
        `})`,
      ].join("\n"),
      container: "loadActions",
    },
    {
      shape: "an object-literal property holding an arrow function",
      source: [
        `const helpers = {`,
        `  loadActions: async () => import("@/app/workflows/actions"),`,
        `}`,
        `it("uses it", async () => {`,
        `  await helpers.loadActions()`,
        `})`,
      ].join("\n"),
      container: "loadActions",
    },
  ])("an import() inside $shape is OBSERVABLE, not dropped", ({ source, container }) => {
    // WR-06. THE OBSERVABILITY CONTROL FOR THE STATED BOUNDARY, at the level of the ScanResult.
    //
    // Not following `obj.method()` CALLS is a stated limit of this gate and stays one — so these
    // are correctly not HITS. What was not stated, and what broke section 5's whole argument, is
    // that these imports did not appear in the ScanResult AT ALL: `declaredFunctionName` recognised
    // only `function name(…)` and `const name = …`, so an import inside a method was visited with
    // `ctx === undefined` and dropped by the guard at the hit site. Verified against the shipped
    // scanner: `hits: 0 | unreachable: 0` for both method shapes.
    //
    // Section 5 exists to prove the boundary is OBSERVABLE rather than merely absent from the hit
    // list, "otherwise 'no hits' cannot be told apart from 'the helper pass broke'". For this shape
    // it was neither, which made it a free evasion of the gate for anyone who hit a red — move the
    // import into a method and the whole thing goes quiet.
    const result = scanSource("method-shaped.test.ts", source)
    expect(result.hits.map(formatHit), "the stated boundary: obj.method() calls are not edges").toEqual([])
    expect(
      result.unreachableHelperImports.map((hit) => hit.container),
      `the import inside ${container} is invisible to the ScanResult: neither a hit nor an ` +
        `unreachable helper import. That is not a boundary, it is a hole — the boundary is "we do ` +
        `not follow obj.method() calls", and it requires the import to still be REPORTED.`
    ).toEqual([container])
  })

  it("counts an it.each chain as exactly one test callback", () => {
    // The de-duplication `testCallName` performs is load-bearing for MIN_TEST_CALLBACKS_PARSED:
    // without it every `.each` inflates the floor it is supposed to defend.
    const { testCallbacksSeen } = scanSource(
      "each.ts",
      [
        `it("plain", () => {})`,
        `it.each([1, 2])("each %i", () => {})`,
        `test.only("only", () => {})`,
      ].join("\n")
    )
    expect(testCallbacksSeen).toBe(3)
  })

  it("reports `vi.resetModules()` in the same hook when it is there, and not when it is not", () => {
    // The discriminator carve-out 1's live control is built on. Asserted in both directions, so a
    // detector stuck on `true` (which would make the carve-out control vacuous) or stuck on `false`
    // (which would make it permanently red) is caught here.
    const withReset = scanSource(
      "with-reset.ts",
      [
        `beforeEach(async () => {`,
        `  vi.resetModules()`,
        `  const mod = await import("../index")`,
        `})`,
      ].join("\n")
    )
    expect(withReset.hits.map((hit) => hit.resetModulesInScope)).toEqual([true])

    const withoutReset = scanSource(
      "without-reset.ts",
      [`beforeEach(async () => {`, `  const mod = await import("../index")`, `})`].join("\n")
    )
    expect(withoutReset.hits.map((hit) => hit.resetModulesInScope)).toEqual([false])
  })

  it("counts file-level vi.resetModules() and vi.doMock() in both directions", () => {
    // The discriminator carve-out 2's live control is built on. Same both-directions argument.
    const manipulates = scanSource(
      "manipulates.ts",
      [
        `it("a", async () => {`,
        `  vi.resetModules()`,
        `  vi.doMock("@sentry/nextjs", () => ({}))`,
        `  await import("./sentry")`,
        `})`,
      ].join("\n")
    )
    expect([manipulates.resetModulesCalls, manipulates.doMockCalls]).toEqual([1, 1])

    const plain = scanSource(
      "plain.ts",
      [`it("a", async () => {`, `  await import("./sentry")`, `})`].join("\n")
    )
    expect([plain.resetModulesCalls, plain.doMockCalls]).toEqual([0, 0])
  })

  it("reports an unreachable helper import separately rather than dropping it silently", () => {
    // The stated boundary must be OBSERVABLE, not merely absent from the hit list — otherwise
    // "no hits" cannot be told apart from "the helper pass broke".
    const { hits, unreachableHelperImports } = scanSource(
      "unreachable.ts",
      [
        `async function _neverCalled() {`,
        `  return await import("../index")`,
        `}`,
        ``,
        `it("passes", () => {`,
        `  expect(true).toBe(true)`,
        `})`,
      ].join("\n")
    )
    expect(hits).toEqual([])
    expect(unreachableHelperImports.map((hit) => `${hit.container}:${hit.line}`)).toEqual([
      "_neverCalled:2",
    ])
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 2. THE WALK AND THE PARSE REACHED REAL FILES (ANTI-VACUITY).
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ONE parse of the corpus, shared by every assertion below.
 *
 * 47-05 measured the cost model this obeys: `typescript` costs ~525 ms on first import per PROCESS
 * and 0.2 ms on every later import in that process, so the import is per-worker rather than
 * per-gate; what scales is the corpus parse, ~850 ms per independent sweep over ~320 000 AST nodes.
 * A fourth gate must therefore SHARE this parse, and 47-14's extension does: it adds scopes to the
 * existing walk rather than a second `from "typescript"` import or a second `CORPUS`.
 */
const CORPUS = TEST_FILES.map((file) => ({ file, ...scanFile(file) }))
const TOTAL_HOOKS_SEEN = CORPUS.reduce((sum, entry) => sum + entry.hooksSeen, 0)
const TOTAL_TEST_CALLBACKS_SEEN = CORPUS.reduce((sum, entry) => sum + entry.testCallbacksSeen, 0)

describe("the sweep reaches the tree it claims to scan", () => {
  it(`enumerates at least ${MIN_TEST_FILES} test files under ${SRC_ROOT}/`, () => {
    expect(
      TEST_FILES.length,
      `the walk found ${TEST_FILES.length} test files. Measured 178 when 47-14 extended this gate; ` +
        `a count this low means the root constant or the recursion is wrong, and every negative ` +
        `assertion below is passing because it has nothing to look at.`
    ).toBeGreaterThanOrEqual(MIN_TEST_FILES)
  })

  it(`parses at least ${MIN_HOOKS_PARSED} lifecycle-hook call expressions`, () => {
    expect(
      TOTAL_HOOKS_SEEN,
      `the parse found ${TOTAL_HOOKS_SEEN} lifecycle hooks. Measured 151. If this collapsed, the ` +
        `hook detector stopped detecting — check LIFECYCLE_HOOKS and ts.isCallExpression against ` +
        `the installed typescript major — and "no offenders" below proves nothing.`
    ).toBeGreaterThanOrEqual(MIN_HOOKS_PARSED)
  })

  it(`parses at least ${MIN_TEST_CALLBACKS_PARSED} test callbacks`, () => {
    expect(
      TOTAL_TEST_CALLBACKS_SEEN,
      `the parse found ${TOTAL_TEST_CALLBACKS_SEEN} test callbacks. Measured 3735 when 47-14 ` +
        `extended this gate. If this collapsed, the TEST detector stopped detecting — check ` +
        `TEST_ROOTS and testCallName's property-access unwrapping — and the test-scope sweep below ` +
        `is green because it has nothing to look at. This is the floor for the entire 47-14 half ` +
        `of this gate.`
    ).toBeGreaterThanOrEqual(MIN_TEST_CALLBACKS_PARSED)
  })

  it("enumerates every file this gate names, by exact path", () => {
    // Fails if a rename moves a subject or a carved-out file out from under this gate, which would
    // otherwise let the sweep pass by simply not looking at the files that carry the defect.
    for (const named of [...SUBJECT_PATHS, ...EXCLUDED_PATHS]) {
      expect(TEST_FILES, `${named} is no longer enumerated`).toContain(named)
    }
  })

  it("parses files without a syntax error swallowing their contents", () => {
    // A `ts.createSourceFile` that fails to parse still returns a SourceFile, silently, with a
    // truncated tree. Every named file is known to contain tests, so a zero here is a parse failure
    // rather than a clean file.
    for (const named of [...SUBJECT_PATHS, ...EXCLUDED_PATHS]) {
      const entry = CORPUS.find((candidate) => candidate.file === named)
      expect(
        (entry?.hooksSeen ?? 0) + (entry?.testCallbacksSeen ?? 0),
        `${named} parsed to zero hooks and zero tests`
      ).toBeGreaterThan(0)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 3. THE SWEEPS — ONE CORPUS, TWO BUDGETS.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("no lifecycle hook performs or reaches a dynamic import()", () => {
  it("finds no hook-budget import() outside the documented carve-outs", () => {
    const offenders = CORPUS.filter((entry) => !HOOK_EXCLUDED_PATHS.includes(entry.file))
      .flatMap((entry) => entry.hits.filter(isHookBudget))
      .map(formatHit)

    expect(
      offenders,
      `a lifecycle hook performs a dynamic import(), or calls a helper that does. Every instance ` +
        `measured cost the whole module graph inside a 10 000 ms hookTimeout — 4121-4850 ms at 3x ` +
        `oversubscription for toggle.test.ts, 67% of it drizzle-orm/pg-core. vi.mock is hoisted ` +
        `above imports by vitest's transform, so move the import to MODULE SCOPE beside the ` +
        `vi.mock calls and reduce the hook to a synchronous vi.clearAllMocks(). Do NOT move it to ` +
        `beforeAll, do NOT raise hookTimeout, do NOT add retries. Offenders: ${offenders.join(" | ")}`
    ).toEqual([])
  })
})

describe("no test body performs or reaches a dynamic import()", () => {
  it("finds no test-budget import() outside the documented carve-outs", () => {
    const offenders = CORPUS.filter((entry) => !TEST_EXCLUDED_PATHS.includes(entry.file))
      .flatMap((entry) => entry.hits.filter(isTestBudget))
      .map(formatHit)

    expect(
      offenders,
      `a test body performs a dynamic import(), or calls a helper that does. This population is ` +
        `billed against testTimeout 5000 ms — HALF the hook budget — and 47-06 measured three of ` +
        `six full-suite runs going RED on it at a sampled 2.50x-9.00x oversubscription: ` +
        `route.test.ts at 9339 ms (186.8% of budget), replay-carries-dry-run at 5934 ms (118.7%), ` +
        `engine.test.ts at 5782 ms (115.6%). vi.mock is hoisted above imports by vitest's ` +
        `transform, so move the import to MODULE SCOPE beside the vi.mock calls and delete the ` +
        `loader helper. Do NOT raise testTimeout, do NOT add retries, do NOT mark the file ` +
        `serial-only — each of those makes the symptom rarer while leaving a gate whose failure ` +
        `mode is machine load rather than code behaviour. If the file genuinely needs a fresh ` +
        `module instance per test, add it to MODULE_INSTANCE_CARVE_OUT with a written reason — the ` +
        `live control there will hold you to it. Offenders: ${offenders.join(" | ")}`
    ).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 4. THE CARVE-OUTS ARE LIVE CONTROLS (S1(d) + S1(f)) — THESE ARE ALSO THE TOKEN FLOORS.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("carve-out 1: the vi.resetModules() hooks still need their exemption", () => {
  it.each(RESET_MODULES_CARVE_OUT)(
    "%s still performs a hook-scoped import() with vi.resetModules() in that same hook",
    (file) => {
      const hits = scanFile(file).hits.filter((hit) => hit.scope === "hook")
      expect(
        hits.length,
        `${file} no longer performs a dynamic import() inside a lifecycle hook. Either the ` +
          `detector broke — in which case the sweep above is green because it stopped working — ` +
          `or the file was fixed, in which case DELETE it from RESET_MODULES_CARVE_OUT rather ` +
          `than leaving an exemption that covers nothing.`
      ).toBeGreaterThan(0)

      const withoutReset = hits.filter((hit) => !hit.resetModulesInScope).map(formatHit)
      expect(
        withoutReset,
        `${file} is exempted because its hook calls vi.resetModules(), which makes the import ` +
          `cost per-test and the static form a semantic change. That reset is gone, so the reason ` +
          `for the exemption is gone: hoist the import to module scope and remove the file from ` +
          `RESET_MODULES_CARVE_OUT. Hooks without a reset: ${withoutReset.join(" | ")}`
      ).toEqual([])
    }
  )

  it(`accounts for at least ${MIN_CARVED_OUT_HOOK_IMPORTS} suppressed hook imports in total`, () => {
    const suppressed = RESET_MODULES_CARVE_OUT.flatMap((file) =>
      scanFile(file).hits.filter((hit) => hit.scope === "hook")
    )
    expect(suppressed.length).toBeGreaterThanOrEqual(MIN_CARVED_OUT_HOOK_IMPORTS)
    expect(suppressed.every((hit) => hit.resetModulesInScope)).toBe(true)
  })
})

describe("carve-out 2: the module-registry files still need their exemption", () => {
  it.each(MODULE_INSTANCE_CARVE_OUT)(
    "%s still manipulates the module registry AND still performs a test-scope import()",
    (file) => {
      const { hits, resetModulesCalls, doMockCalls } = scanFile(file)

      expect(
        resetModulesCalls + doMockCalls,
        `${file} is exempted from the test-body sweep because a fresh module instance per test is ` +
          `the point there — it calls vi.resetModules() and/or vi.doMock(). Neither appears any ` +
          `more, so the reason for the exemption is gone: hoist the imports to module scope and ` +
          `DELETE this file from MODULE_INSTANCE_CARVE_OUT. 47-03 measured this exact rot ` +
          `(deleting the reset left the sweep green because the path was still excluded); this ` +
          `assertion is the only thing that catches it.`
      ).toBeGreaterThan(0)

      const testScoped = hits.filter(isTestBudget)
      expect(
        testScoped.length,
        `${file} no longer performs a dynamic import() reachable from a test body. Either the ` +
          `detector broke — in which case the sweep above is green because it stopped working — ` +
          `or the file was fixed, in which case DELETE it from MODULE_INSTANCE_CARVE_OUT rather ` +
          `than leaving an exemption that covers nothing.`
      ).toBeGreaterThan(0)
    }
  )

  it(`accounts for at least ${MIN_CARVED_OUT_TEST_IMPORTS} suppressed test-scope imports in total`, () => {
    const suppressed = MODULE_INSTANCE_CARVE_OUT.flatMap((file) =>
      scanFile(file).hits.filter(isTestBudget)
    )
    expect(
      suppressed.length,
      `measured 17 (send 7, http 5, crm 4, sentry 1). Found ${suppressed.length}. A drop means ` +
        `either the detector stopped detecting or a file was fixed and its entry should be deleted.`
    ).toBeGreaterThanOrEqual(MIN_CARVED_OUT_TEST_IMPORTS)
  })
})

describe("carve-out 3: the rsc files still import an untyped compiled path", () => {
  it.each(UNTYPED_COMPILED_CARVE_OUT)(
    "%s still reaches a next/dist/compiled/ import from a test body",
    (file) => {
      const hits = scanFile(file).hits.filter(isTestBudget)
      expect(
        hits.length,
        `${file} no longer reaches a dynamic import() from a test body — either the detector ` +
          `broke, or the file changed and the exemption should be deleted.`
      ).toBeGreaterThan(0)

      const untyped = hits.filter((hit) => hit.text.includes("next/dist/compiled/"))
      expect(
        untyped.length,
        `${file} is exempted ONLY because its import target is the shipped Flight server under ` +
          `next/dist/compiled/, a deep path with no type declarations that cannot be statically ` +
          `imported without a module declaration or a standing compiler-suppression directive. ` +
          `Its imports no ` +
          `longer point there, so the reason is gone: hoist them and delete the entry. Hits: ` +
          `${hits.map(formatHit).join(" | ")}`
      ).toBeGreaterThan(0)
    }
  )

  it(`accounts for at least ${MIN_UNTYPED_COMPILED_IMPORTS} suppressed compiled-path imports`, () => {
    const suppressed = UNTYPED_COMPILED_CARVE_OUT.flatMap((file) =>
      scanFile(file).hits.filter((hit) => isTestBudget(hit) && hit.text.includes("next/dist/compiled/"))
    )
    expect(suppressed.length).toBeGreaterThanOrEqual(MIN_UNTYPED_COMPILED_IMPORTS)
  })
})

describe("carve-out 4: the live-database files are still skipped and still opt-in", () => {
  it.each(SKIPPED_LIVE_FILES)("%s still performs a dynamic import()", (file) => {
    const { hits } = scanFile(file)
    expect(
      hits.length,
      `${file} no longer performs a dynamic import() — either the detector broke, or the file ` +
        `changed and the exemption should be deleted.`
    ).toBeGreaterThan(0)
  })

  it.each(SKIPPED_LIVE_FILES)("%s is still gated behind a conditional skip", (file) => {
    // The other half of the reason. These are exempted because the code NEVER RUNS in the base
    // project. Remove the gate and the exemption stops describing the file.
    expect(
      readRepoFile(file),
      `${file} is exempted because its suite is skipped without DATABASE_URL, so neither its ` +
        `hooks nor its test bodies run. That gate is gone: either restore it or fix the imports ` +
        `and delete the entry.`
    ).toContain("describe.skipIf(")
  })
})

describe("the carve-out lists stay disjoint, except where the overlap is asserted real", () => {
  it("names no file in both the reset-hook list and the live-database list", () => {
    // A file in both would be asserted to carry vi.resetModules() and to be skipIf-gated at once,
    // and would be suppressed twice — the kind of contradiction that gets "resolved" by deleting an
    // assertion.
    const overlap = RESET_MODULES_CARVE_OUT.filter((file) =>
      (SKIPPED_LIVE_FILES as readonly string[]).includes(file)
    )
    expect(overlap).toEqual([])
  })

  it("names no file in both the module-registry list and the live-database or rsc lists", () => {
    const overlap = MODULE_INSTANCE_CARVE_OUT.filter(
      (file) =>
        (SKIPPED_LIVE_FILES as readonly string[]).includes(file) ||
        (UNTYPED_COMPILED_CARVE_OUT as readonly string[]).includes(file)
    )
    expect(overlap).toEqual([])
  })

  it("the ONE deliberate cross-scope overlap is exactly the expected set", () => {
    const overlap = RESET_MODULES_CARVE_OUT.filter((file) =>
      (MODULE_INSTANCE_CARVE_OUT as readonly string[]).includes(file)
    ).sort()
    expect(
      overlap,
      `two carve-out lists overlap in a way this gate does not explain. A file exempt in both ` +
        `scopes needs a written reason and the assertion below; add it to EXPECTED_SCOPE_OVERLAP ` +
        `only after checking it really carries both a hook hit and a test hit.`
    ).toEqual([...EXPECTED_SCOPE_OVERLAP].sort())
  })

  it.each(EXPECTED_SCOPE_OVERLAP)("%s really carries BOTH a hook hit and a test hit", (file) => {
    // The overlap is only defensible if it is real. If either half disappears, the file belongs in
    // exactly one list and the other entry is dead text that looks like coverage.
    const { hits } = scanFile(file)
    expect(hits.filter(isHookBudget).length, `${file} has no hook-budget hit`).toBeGreaterThan(0)
    expect(hits.filter(isTestBudget).length, `${file} has no test-budget hit`).toBeGreaterThan(0)
  })

  it("suppresses only files that are actually enumerated", () => {
    // An exclusion for a path the walk never visits is dead text that looks like coverage.
    for (const excluded of EXCLUDED_PATHS) {
      expect(TEST_FILES, `${excluded} is excluded but not enumerated`).toContain(excluded)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 5. THE STATED BOUNDARY IS OBSERVED, NOT ASSUMED.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("the unreachable-helper boundary is a live decision, not an accident", () => {
  it("saved-views.test.ts's typecheck-only import is seen, and deliberately not a hit", () => {
    // The header explains why: `_ownerAttributionTypechecks()` is never called, so the import never
    // executes and costs nothing — and a static import of `../index` would load the REAL @/db at
    // collection in a project with no DATABASE_URL. Flagging it would produce a broken "fix".
    //
    // Asserting the site is still SEEN (as unreachable) rather than merely absent from the hit list
    // is what tells "the boundary held" apart from "the helper pass stopped running".
    const file = "src/db/schema/saved-views.test.ts"
    const entry = CORPUS.find((candidate) => candidate.file === file)
    expect(entry, `${file} is no longer enumerated`).toBeDefined()
    expect(
      entry?.unreachableHelperImports.map((hit) => `${hit.container}:${hit.line}`),
      `${file} no longer holds an unreachable helper import. If the function was deleted or is now ` +
        `called, delete this assertion in the same commit — do not weaken it.`
    ).toEqual(["_ownerAttributionTypechecks:58"])
    expect(entry?.hits ?? []).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 6. THE GATE SWEEPS ITSELF — THE SELF-COLLISION CONTROL.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("the gate sweeps itself, and the fixtures are strings", () => {
  it("is enumerated by its own walk", () => {
    expect(TEST_FILES).toContain(GATE_PATH)
  })

  it("is NOT path-excluded from its own sweep", () => {
    // The load-bearing half of the header's decision. If someone adds this file to a carve-out
    // list, the mitigation stops being one thing and becomes two, and neither is provable.
    expect(
      EXCLUDED_PATHS,
      `${GATE_PATH} must not be excluded from its own sweep. Its fixtures are source STRINGS, ` +
        `which the parse cannot see; that is the single mitigation. Adding a path exclusion gives ` +
        `this gate two independent reasons to be green and no way to tell which one is working.`
    ).not.toContain(GATE_PATH)
    for (const list of [
      RESET_MODULES_CARVE_OUT,
      MODULE_INSTANCE_CARVE_OUT,
      UNTYPED_COMPILED_CARVE_OUT,
      SKIPPED_LIVE_FILES,
    ]) {
      expect(list as readonly string[]).not.toContain(GATE_PATH)
    }
  })

  it("parses to zero lifecycle hooks and MANY test callbacks, which proves the fixtures are strings", () => {
    // Positive proof of the mitigation rather than a restatement of it, and STRONGER after 47-14.
    // This file discusses four hook names and shows dozens of hook and test bodies; if any one of
    // them were live code instead of a string literal, `hooksSeen` would not be 0. And the test
    // callbacks it really does declare are counted, which proves the body detector is looking at
    // this file rather than skipping it.
    const { hooksSeen, testCallbacksSeen, hits, unreachableHelperImports } = scanFile(GATE_PATH)
    expect(hooksSeen, "a hook fixture in this file became live code").toBe(0)
    expect(
      testCallbacksSeen,
      "the body detector sees no test in this file, so its zero hits prove nothing"
    ).toBeGreaterThan(10)
    expect(hits.map(formatHit)).toEqual([])
    expect(unreachableHelperImports.map(formatHit)).toEqual([])
  })

  it("still physically contains the fixture source the parse cannot see", () => {
    // The token floor for this control (WR-11). "Zero hits in the gate file" is also what an empty
    // file, a wrong GATE_PATH or a truncated read produces. This asserts the needle is really there
    // and the parse is really blind to it, rather than the parse having nothing to be blind to.
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

  it("declares exactly one typescript import, one CORPUS constant and one file-system walk", () => {
    // NOT A COST ASSERTION, and it used to claim to be one (WR-11). Its name and doc-comment said
    // "walks the corpus exactly once" and quoted a cost model (~850 ms per gate over ~320 000 AST
    // nodes), while what it actually asserts is that three specific SOURCE LINES each occur once —
    // and the carve-out controls below call `scanFile(...)` a further ~13 times by design, several
    // inside `it.each` blocks. A new gate could add an arbitrary number of those and this would
    // stay green; conversely a prettier change that moved that line, or a rename of `CORPUS`,
    // takes it red for no reason at all. A text-shaped proxy standing in for a structural claim is
    // exactly the substitution this file's own "WHY THIS GATE PARSES AND NEVER GREPS" section
    // rejects at length.
    //
    // So the claim is narrowed to what the text can actually carry: there is ONE shared corpus
    // constant and ONE file-system walk, so a fifth scope EXTENDS them rather than declaring a
    // second pair. The re-parsing of ~13 individual files below is deliberate and cheap, and this
    // says nothing about it. The cost model stays true and stays recorded — `typescript` is
    // ~525 ms on first import per PROCESS and 0.2 ms afterwards; a second full corpus walk is
    // ~850 ms — it is simply not what these three regexes measure.
    const raw = readRepoFile(GATE_PATH)
    const typescriptImports = raw.split("\n").filter((line) => /^import ts from "typescript"$/.test(line))
    expect(typescriptImports.length, "exactly one `import ts from \"typescript\"` is expected").toBe(1)

    const corpusDeclarations = raw
      .split("\n")
      .filter((line) => /^const CORPUS = TEST_FILES\.map\(/.test(line))
    expect(
      corpusDeclarations.length,
      "exactly one CORPUS constant is expected, so a fifth scope extends it rather than declaring " +
        "a second one. This does NOT bound how many individual files the controls below re-parse."
    ).toBe(1)

    const fileWalks = raw.split("\n").filter((line) => /^const TEST_FILES = walkTestFiles\(/.test(line))
    expect(fileWalks.length, "exactly one file-system walk is expected").toBe(1)
  })
})
