/**
 * THE SUITE HOOK-HYGIENE GATE (QG-01).
 *
 * No lifecycle hook in the base vitest project may perform a dynamic `import()`.
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
 * ── WHY THIS GATE PARSES AND NEVER GREPS ─────────────────────────────────────────────────────
 *
 * Two independent reasons, both concrete.
 *
 * (1) A raw regex/paren-balance scan of this exact corpus produced a MEASURED false positive at
 *     `src/lib/observability/sentry.test.ts:185`. That hook contains only `vi.doMock(...)`; the
 *     `await import` lives in the sibling test bodies, several hundred bytes further down. Nothing
 *     line-oriented can tell those apart, and nothing paren-oriented can either once a factory
 *     callback is in the way. It is held below as a KNOWN_NEGATIVE fixture.
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
 * The scope boundary is lexical, also deliberately: a hook that merely CALLS a module-scope helper
 * whose body contains an `import()` is NOT a hit. Held below as a KNOWN_NEGATIVE. Following calls
 * would require type resolution across the whole program, and the cost this gate exists to stop is
 * paid by the hook's own first statement in every instance measured. If a future defect hides
 * behind a helper, widen this gate deliberately and record the measurement — do not assume it is
 * already covered.
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
 * that: it is present in the enumeration, absent from both exclusion lists, parses to ZERO
 * lifecycle hooks (which is the positive proof that every fixture really is a string and not live
 * code), and yields zero hits while its raw text demonstrably still contains the fixture source.
 *
 * Taking BOTH mitigations was considered and rejected. A gate that path-excludes itself AND
 * stringifies its fixtures has two independent reasons to be green and no way to tell which one is
 * load-bearing; when one silently breaks, nothing goes red. Do not add a path exclusion for this
 * file.
 *
 * ── THE TWO CARVE-OUTS ARE LIVE CONTROLS, NOT COMMENTS ───────────────────────────────────────
 *
 * Both exclusion lists below are asserted to STILL exhibit the property they exclude, in the
 * `deployment-docs-accuracy.test.ts:537-556` + `:692-700` + `:593-600` style, and the two lists are
 * asserted disjoint. That is also this gate's token floor (WR-11): a hook detector that quietly
 * stopped detecting hooks would satisfy "the sweep found no offenders" perfectly, and the ONLY
 * thing that distinguishes that from a clean tree is a standing assertion that the detector still
 * finds the instances that are known to be there. The carve-out control and the token floor are the
 * same assertion on purpose — an exclusion that is also a floor cannot rot in either direction.
 *
 * ── IF THIS WENT RED ────────────────────────────────────────────────────────────────────────
 *
 * Move the import to module scope, beside the `vi.mock` calls, and reduce the hook to a synchronous
 * `vi.clearAllMocks()`. Do NOT move it to `beforeAll`. Do NOT add the file to a carve-out list
 * without both a written reason and a live control asserting it still needs the exemption. Never
 * relax the sweep.
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

/** The two files this gate was written to fix. Named so a rename cannot slip them out of scope. */
const SUBJECT_PATHS = [
  "src/lib/execution/toggle.test.ts",
  "src/lib/execution/recursion.test.ts",
] as const

/** The four lifecycle hook names vitest exposes. All four are forbidden equally — see the header. */
const LIFECYCLE_HOOKS = new Set(["beforeEach", "beforeAll", "afterEach", "afterAll"])

/**
 * Floor on the number of `*.test.ts` / `*.test.tsx` files the walk enumerates under `src/`.
 * Measured on the tree this gate was written against: 175 (172 `.test.ts`, 3 `.test.tsx`). 150 is a
 * deliberately loose floor, set BELOW the measurement so that ordinary consolidation of test files
 * does not fatal with a message that misdiagnoses shrinkage as a broken walk.
 *
 * Without this floor a wrong root constant or a broken recursion yields an empty file list,
 * therefore zero hits, therefore a permanently green gate — the exact shape of the v1.3 gates that
 * could not fail.
 */
const MIN_TEST_FILES = 150

/**
 * Floor on the number of lifecycle-hook `CallExpression`s the parse finds across that corpus.
 * Measured: 151. 140 is set below it for the same reason as above.
 *
 * This is the floor that matters most. "The sweep found no offenders" is satisfied perfectly by a
 * hook detector that stopped detecting hooks — by a renamed `SyntaxKind`, by a `typescript` major
 * that changes `CallExpression.expression` for identifiers, or by a typo in `LIFECYCLE_HOOKS`. This
 * assertion is what tells those apart from a clean tree.
 */
const MIN_HOOKS_PARSED = 140

/**
 * Floor on hook-scoped `import()` calls inside `RESET_MODULES_CARVE_OUT`. Measured: exactly 4, one
 * per file. Each file is ALSO asserted individually to still have at least one, so this aggregate is
 * a derived cross-check rather than a moving target — which is why it sits at the measurement rather
 * than below it.
 */
const MIN_CARVED_OUT_HOOK_IMPORTS = 4

/**
 * DELIBERATELY EXCLUDED, carve-out 1 of 2 — and this list exists so the next reader finds the
 * reasoning instead of re-deriving it, or "fixing" these four and changing what they test.
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
 * DELIBERATELY EXCLUDED, carve-out 2 of 2 — a separate list with a separate reason, kept distinct
 * from the one above and asserted disjoint from it.
 *
 * Both files are opt-in live-database suites gated on `describe.skipIf(!HAS_DB)`, so with
 * `DATABASE_URL` unset — the state of the base vitest project — the suite is skipped and the hook
 * never runs at all. They are also the in-repo proof of why `beforeAll` is not a relocation: both
 * carry an explicit 60 000 ms hook timeout (`export-events-live.test.ts:47`,
 * `formatters-live.test.ts:93`) precisely because a module graph plus real Postgres round-trips does
 * not fit a 10 000 ms budget.
 *
 * Each entry is asserted below to STILL be `skipIf`-gated AND to still carry a hook-scoped
 * `import()`. If either stops being true the exemption no longer describes the file, and this goes
 * red rather than quietly widening.
 */
const SKIPPED_LIVE_FILES = [
  "src/lib/audit/export-events-live.test.ts",
  "src/lib/export/formatters-live.test.ts",
] as const

const EXCLUDED_PATHS: readonly string[] = [...RESET_MODULES_CARVE_OUT, ...SKIPPED_LIVE_FILES]

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8")
}

/**
 * Every test file the base vitest project would collect, as repo-relative POSIX paths.
 *
 * The only regular expressions in this file match FILE NAMES. Hook detection and `import()`
 * detection go exclusively through the AST — see the header.
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

export interface HookImportHit {
  file: string
  /** The hook the `import()` is lexically inside. */
  hook: string
  /** 1-based line of the hook call itself. */
  hookLine: number
  /** 1-based line of the `import()` call. */
  line: number
  /** The `import()` expression's own source text. */
  text: string
  /** Whether `vi.resetModules()` appears inside that same hook. Drives carve-out 1's live control. */
  resetModulesInHook: boolean
}

export interface ScanResult {
  hits: HookImportHit[]
  /** Anti-vacuity counter: lifecycle-hook call expressions the parse actually saw. */
  hooksSeen: number
}

interface HookContext {
  name: string
  line: number
  resetModules: boolean
}

/** `vi.resetModules()` — a `CallExpression` on the `vi` namespace, matched structurally. */
function isResetModulesCall(node: ts.Node): boolean {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "vi" &&
    node.expression.name.text === "resetModules"
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

function containsResetModules(hookNode: ts.Node): boolean {
  let found = false
  const visit = (node: ts.Node): void => {
    if (found) return
    if (isResetModulesCall(node)) {
      found = true
      return
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(hookNode, visit)
  return found
}

/**
 * Parse `sourceText` and report every dynamic `import()` lexically inside a lifecycle hook.
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

  const hits: HookImportHit[] = []
  let hooksSeen = 0

  const lineOf = (node: ts.Node): number =>
    src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1

  const visit = (node: ts.Node, hookCtx: HookContext | undefined): void => {
    let ctx = hookCtx
    const hookName = lifecycleHookName(node)
    if (hookName !== null) {
      hooksSeen += 1
      ctx = { name: hookName, line: lineOf(node), resetModules: containsResetModules(node) }
    }
    if (ctx && isDynamicImportCall(node)) {
      hits.push({
        file: fileName,
        hook: ctx.name,
        hookLine: ctx.line,
        line: lineOf(node),
        text: node.getText(src).replace(/\s+/g, " "),
        resetModulesInHook: ctx.resetModules,
      })
    }
    ts.forEachChild(node, (child) => visit(child, ctx))
  }

  visit(src, undefined)
  return { hits, hooksSeen }
}

/** `file:line: hook — text`, the house `file:line` collector shape. */
function formatHit(hit: HookImportHit): string {
  return `${hit.file}:${hit.line}: ${hit.hook} (opened at :${hit.hookLine}) contains ${hit.text}`
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
    expected: ["beforeEach:4"],
  },
  {
    label: "beforeAll with a dynamic import — beforeAll is not a relocation",
    source: [`beforeAll(async () => {`, `  db = (await import("@/db")).db`, `})`].join("\n"),
    expected: ["beforeAll:2"],
  },
  {
    label: "afterEach with a dynamic import",
    source: [`afterEach(async () => {`, `  await import("./teardown")`, `})`].join("\n"),
    expected: ["afterEach:2"],
  },
  {
    label: "afterAll with a dynamic import",
    source: [`afterAll(async () => {`, `  await import("./cleanup")`, `})`].join("\n"),
    expected: ["afterAll:2"],
  },
  {
    label: "two dynamic imports in one hook are two hits, not one",
    source: [
      `beforeAll(async () => {`,
      `  const a = await import("@/db")`,
      `  const b = await import("@/db/schema")`,
      `})`,
    ].join("\n"),
    expected: ["beforeAll:2", "beforeAll:3"],
  },
  {
    label: "a hook with an explicit timeout argument is still a hook",
    source: [`beforeAll(async () => {`, `  await import("@/db")`, `}, 60000)`].join("\n"),
    expected: ["beforeAll:2"],
  },
] as const

const KNOWN_NEGATIVE = [
  {
    // The MEASURED false positive of a raw scan — sentry.test.ts:185. The hook holds only a
    // `vi.doMock` factory; the `await import` is in the test bodies. This fixture is the reason
    // this gate parses.
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
      `})`,
    ].join("\n"),
  },
  {
    // The stated lexical boundary — see the header. A hook that CALLS a module-scope helper is not
    // a hit, and this fixture is what makes that a decision rather than an accident.
    label: "an import() inside a module-scope helper the hook merely calls",
    source: [
      `async function loadSubject() {`,
      `  return await import("./subject")`,
      `}`,
      ``,
      `beforeEach(async () => {`,
      `  subject = await loadSubject()`,
      `})`,
    ].join("\n"),
  },
  {
    label: "a type-only `typeof import(...)` reference, which is erased at runtime",
    source: [
      `let createWorkflowRun: typeof import("@/lib/triggers/create-run").createWorkflowRun`,
      ``,
      `beforeEach(() => {`,
      `  vi.clearAllMocks()`,
      `})`,
    ].join("\n"),
  },
  {
    // recursion.test.ts:27's deterministic event-loop yield. Not a race, not this gate's business.
    label: "an event-loop-yield setTimeout inside a hook",
    source: [
      `beforeEach(async () => {`,
      `  await new Promise((r) => setTimeout(r, 1))`,
      `})`,
    ].join("\n"),
  },
  {
    label: "a hook that awaits a plain function call named like an import",
    source: [`beforeEach(async () => {`, `  await importSeeds()`, `})`].join("\n"),
  },
] as const

describe("the hook/import matcher, unit-tested against fixtures FIRST", () => {
  /**
   * These assertions gate everything below them. A matcher that matches nothing yields an empty hit
   * list, an empty list satisfies `toEqual([])`, and the whole sweep becomes unfalsifiable. If any
   * fixture here is red, treat every pass further down as unproven.
   *
   * The positives assert the EXTRACTED VALUE — hook name and line — not merely that something was
   * found, so a matcher that reported every node would fail here too.
   */
  it.each(KNOWN_POSITIVE)("MUST flag: $label", ({ source, expected }) => {
    const { hits } = scanSource("known-positive.ts", source)
    expect(hits.map((hit) => `${hit.hook}:${hit.line}`)).toEqual([...expected])
  })

  it.each(KNOWN_NEGATIVE)("MUST NOT flag: $label", ({ source }) => {
    const { hits } = scanSource("known-negative.ts", source)
    expect(hits.map(formatHit)).toEqual([])
  })

  it.each(KNOWN_NEGATIVE)("still sees the hook in the negative fixture: $label", ({ source, label }) => {
    // The negatives' token floor. `toEqual([])` above is satisfied by a parse that failed outright
    // and returned nothing, which would make every negative meaningless — a matcher that matches
    // nothing passes all six. Every negative fixture declares a hook on purpose; the parse must
    // still have counted it, so the fixture is proving "saw the hook, did not flag the import"
    // rather than "saw nothing at all".
    const { hooksSeen } = scanSource("known-negative.ts", source)
    expect(hooksSeen, `the parse saw no hook in: ${label}`).toBeGreaterThan(0)
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
    expect(withReset.hits.map((hit) => hit.resetModulesInHook)).toEqual([true])

    const withoutReset = scanSource(
      "without-reset.ts",
      [`beforeEach(async () => {`, `  const mod = await import("../index")`, `})`].join("\n")
    )
    expect(withoutReset.hits.map((hit) => hit.resetModulesInHook)).toEqual([false])
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 2. THE WALK AND THE PARSE REACHED REAL FILES (ANTI-VACUITY).
// ─────────────────────────────────────────────────────────────────────────────────────────────

const CORPUS = TEST_FILES.map((file) => ({ file, ...scanFile(file) }))
const TOTAL_HOOKS_SEEN = CORPUS.reduce((sum, entry) => sum + entry.hooksSeen, 0)

describe("the sweep reaches the tree it claims to scan", () => {
  it(`enumerates at least ${MIN_TEST_FILES} test files under ${SRC_ROOT}/`, () => {
    expect(
      TEST_FILES.length,
      `the walk found ${TEST_FILES.length} test files. Measured 175 when this gate was written; ` +
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

  it("enumerates every file this gate names, by exact path", () => {
    // Fails if a rename moves a subject or a carved-out file out from under this gate, which would
    // otherwise let the sweep pass by simply not looking at the files that carry the defect.
    for (const named of [...SUBJECT_PATHS, ...RESET_MODULES_CARVE_OUT, ...SKIPPED_LIVE_FILES]) {
      expect(TEST_FILES, `${named} is no longer enumerated`).toContain(named)
    }
  })

  it("parses files without a syntax error swallowing their contents", () => {
    // A `ts.createSourceFile` that fails to parse still returns a SourceFile, silently, with a
    // truncated tree. The two subjects and all four carved-out files are known to contain hooks, so
    // a zero here is a parse failure rather than a clean file.
    for (const named of [...SUBJECT_PATHS, ...RESET_MODULES_CARVE_OUT]) {
      const entry = CORPUS.find((candidate) => candidate.file === named)
      expect(entry?.hooksSeen ?? 0, `${named} parsed to zero hooks`).toBeGreaterThan(0)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 3. THE SWEEP.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("no lifecycle hook performs a dynamic import()", () => {
  it("finds no hook-scoped import() outside the two documented carve-outs", () => {
    const offenders = CORPUS.filter((entry) => !EXCLUDED_PATHS.includes(entry.file))
      .flatMap((entry) => entry.hits)
      .map(formatHit)

    expect(
      offenders,
      `a lifecycle hook performs a dynamic import(). Every instance measured cost the whole ` +
        `module graph inside a 10 000 ms hookTimeout — 4121-4850 ms at 3x oversubscription for ` +
        `toggle.test.ts, 67% of it drizzle-orm/pg-core. vi.mock is hoisted above imports by ` +
        `vitest's transform, so move the import to MODULE SCOPE beside the vi.mock calls and ` +
        `reduce the hook to a synchronous vi.clearAllMocks(). Do NOT move it to beforeAll, do NOT ` +
        `raise hookTimeout, do NOT add retries. Offenders: ${offenders.join(" | ")}`
    ).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 4. THE CARVE-OUTS ARE LIVE CONTROLS (S1(d) + S1(f)) — THIS IS ALSO THE TOKEN FLOOR.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("carve-out 1: the vi.resetModules() files still need their exemption", () => {
  it.each(RESET_MODULES_CARVE_OUT)(
    "%s still performs a hook-scoped import() with vi.resetModules() in that same hook",
    (file) => {
      const { hits } = scanFile(file)
      expect(
        hits.length,
        `${file} no longer performs a dynamic import() inside a lifecycle hook. Either the ` +
          `detector broke — in which case the sweep above is green because it stopped working — ` +
          `or the file was fixed, in which case DELETE it from RESET_MODULES_CARVE_OUT rather ` +
          `than leaving an exemption that covers nothing.`
      ).toBeGreaterThan(0)

      const withoutReset = hits.filter((hit) => !hit.resetModulesInHook).map(formatHit)
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
    const suppressed = RESET_MODULES_CARVE_OUT.flatMap((file) => scanFile(file).hits)
    expect(suppressed.length).toBeGreaterThanOrEqual(MIN_CARVED_OUT_HOOK_IMPORTS)
    expect(suppressed.every((hit) => hit.resetModulesInHook)).toBe(true)
  })
})

describe("carve-out 2: the live-database files are still skipped and still opt-in", () => {
  it.each(SKIPPED_LIVE_FILES)("%s still performs a hook-scoped import()", (file) => {
    const { hits } = scanFile(file)
    expect(
      hits.length,
      `${file} no longer performs a dynamic import() inside a lifecycle hook — either the ` +
        `detector broke, or the file changed and the exemption should be deleted.`
    ).toBeGreaterThan(0)
  })

  it.each(SKIPPED_LIVE_FILES)("%s is still gated behind a conditional skip", (file) => {
    // The other half of the reason. These are exempted because the hook NEVER RUNS in the base
    // project. Remove the gate and the exemption stops describing the file.
    expect(
      readRepoFile(file),
      `${file} is exempted because its suite is skipped without DATABASE_URL, so the hook never ` +
        `runs. That gate is gone: either restore it or fix the hook import and delete the entry.`
    ).toContain("describe.skipIf(")
  })
})

describe("the two carve-out lists stay disjoint", () => {
  it("names no file in both", () => {
    // A file in both lists would be asserted to carry vi.resetModules() and to be skipIf-gated at
    // once, and would be suppressed twice — the kind of contradiction that gets "resolved" by
    // deleting an assertion.
    const overlap = RESET_MODULES_CARVE_OUT.filter((file) =>
      (SKIPPED_LIVE_FILES as readonly string[]).includes(file)
    )
    expect(overlap).toEqual([])
  })

  it("suppresses only files that are actually enumerated", () => {
    // An exclusion for a path the walk never visits is dead text that looks like coverage.
    for (const excluded of EXCLUDED_PATHS) {
      expect(TEST_FILES, `${excluded} is excluded but not enumerated`).toContain(excluded)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 5. THE GATE SWEEPS ITSELF — THE SELF-COLLISION CONTROL.
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
  })

  it("parses to zero lifecycle hooks, which proves every fixture is a string", () => {
    // Positive proof of the mitigation rather than a restatement of it. This file discusses four
    // hook names and shows a dozen hook bodies; if any one of them were live code instead of a
    // string literal, the parse would count it here.
    const { hooksSeen, hits } = scanFile(GATE_PATH)
    expect(hooksSeen, "a fixture in this file became live code").toBe(0)
    expect(hits.map(formatHit)).toEqual([])
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
})
