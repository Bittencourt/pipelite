#!/usr/bin/env node
/**
 * Diff the PASS SETS of the report directory `scripts/suite-repeatability.sh` wrote.
 *
 * WHAT A PASS SET IS, AND WHY IT IS NOT AN EXIT CODE
 *   Two runs can both exit 0 while passing different tests — a file that fails to
 *   collect under one worker layout and is retried into existence under another, a
 *   conditionally skipped test, a `.only` left behind. So the identity compared here is
 *   per test, `<path relative to repo root> :: <fullName>`, unioned across BOTH vitest
 *   projects of one iteration (`run-NN-base.json` + `run-NN-rsc.json`). Every iteration
 *   is diffed against the first, which is the reference.
 *
 *   A file that fails to COLLECT reports `status: "failed"` with ZERO
 *   `assertionResults`. It contributes no test identities at all, so a differ that only
 *   walks assertions loses it completely: the run simply has fewer passes, with nothing
 *   in the output naming the file that vanished. Such a file therefore gets an explicit
 *   `<path> :: <file-level failure> <message prefix>` identity, and is reported
 *   separately as well.
 *
 * WHAT THIS PROGRAM DOES NOT PROVE — READ BEFORE CITING ITS VERDICT
 *   `IDENTICAL` here is a CHEAP REGRESSION GUARD, not evidence that the suite is
 *   trustworthy. Phase 47 research got 16/16 identical pass sets on the UNFIXED tree
 *   (10 idle, 3 at 2x oversubscription, 3 at 3x): 4739 passed / 32 skipped, zero
 *   failures. ROADMAP SC-1 was AMENDED for exactly that reason — the criterion is now
 *   the MARGIN each timing-sensitive assertion leaves against its budget under induced
 *   load. Do not present a green diff as proof that a flake was fixed.
 *
 * ITS OWN ANTI-VACUITY FLOOR — THE POINT OF THIS FILE
 *   Set identity is trivially satisfied by nothing. Two EMPTY pass sets compare equal,
 *   and two TRUNCATED pass sets compare equal, and in both cases a naive differ prints
 *   `IDENTICAL` and exits 0 — which is precisely the shape of the six gates v1.3 shipped
 *   that could not fail. So this program grades itself first:
 *
 *     1. `MIN_ITERATIONS` — a single run diffed against itself is IDENTICAL by
 *        construction and measures nothing.
 *     2. `MIN_REFERENCE_PASS_SET` — the reference must actually be the full suite.
 *     3. The both-empty verdict is SPOKEN, in the repo's existing words
 *        (`scripts/migrate-from-zero.mjs:1072`): `IDENTICAL (both empty — proves
 *        nothing)` — and it exits 1 rather than reporting a clean comparison.
 *
 *   Floors are evaluated AFTER the table is printed, so an operator always sees what was
 *   compared before being told why the comparison does not count.
 *
 * ZERO DEPENDENCIES, BY REQUIREMENT
 *   `node:fs`, `node:path`, `node:url` only. Nothing is installed to run this. The pure
 *   surface — `buildPassSet`, `diffPassSets`, `MIN_REFERENCE_PASS_SET` — is exported so a
 *   future vitest gate can import and exercise it without touching the filesystem, which
 *   is why the entry point is fenced behind `import.meta.main`.
 *
 * USAGE
 *   node scripts/diff-pass-sets.mjs <directory written by suite-repeatability.sh>
 */

import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

// ---------------------------------------------------------------------------
// Anti-vacuity floors. Each number was measured on 2026-08-25 against this tree, and each
// floor sits BELOW its measurement.
//
// A floor set AT the measurement is itself a defect, for the reason
// `scripts/migrate-from-zero.mjs:116-121` states: legitimate SHRINKAGE — deleting a test
// file, skipping a suite — then fatals with a message that misdiagnoses it as a truncated
// report, and the next person under time pressure "fixes" it by lowering the number
// without understanding what it was for. That is the failure mode the floor exists to
// prevent, arriving through the floor.
// ---------------------------------------------------------------------------

/** Passing tests the REFERENCE iteration must contain before its verdict means anything.
 *  Measured 2026-08-25 on this tree: 4747 = 4739 (base project) + 8 (rsc project).
 *  The floor is 4000, well below that, so ordinary churn cannot trip it but a report
 *  truncated to a handful of files does. */
export const MIN_REFERENCE_PASS_SET = 4000

/** Iterations required before a diff exists at all. Run 01 is the reference; with only
 *  run 01 present there is nothing to compare it to and every verdict is vacuous. */
export const MIN_ITERATIONS = 2

/** Appended to every floor failure. The floors are tripwires for a report that yielded
 *  nothing, not assertions about how large the suite ought to be, and the difference
 *  decides whether the next reader fixes the harness or lowers the bar. */
export const FLOOR_ADVICE =
  " This is a tripwire for a report set that yielded nothing, not an assertion about how " +
  "large the suite or the run count should be. If the measurement legitimately moved, " +
  "lower the floor AND record the new measurement in the comment beside it."

/** Longest MISSING/EXTRA sample printed per direction before it is summarised. A truncated
 *  reference produces thousands of EXTRA lines and an unbounded print buries the verdict. */
const SAMPLE_LIMIT = 10

export class Fatal extends Error {}

/**
 * Abort with a diagnosis. ALWAYS throws.
 * @param {string} message
 * @returns {never}
 */
function fatal(message) {
  throw new Fatal(message)
}

function progress(line) {
  console.log(`-> ${line}`)
}

/**
 * The pass-set identities in ONE vitest JSON report.
 *
 * @param {unknown} reportJson parsed `--reporter=json` document
 * @param {string} repoRoot absolute path stripped from `testResults[].name`
 * @returns {{identities: Set<string>, passed: number, assertionsSeen: number,
 *            collectFailures: string[], fileCount: number}}
 */
export function buildPassSet(reportJson, repoRoot) {
  if (reportJson === null || typeof reportJson !== "object") {
    fatal("buildPassSet was handed something that is not a parsed report object")
  }
  if (typeof repoRoot !== "string" || repoRoot.length === 0) {
    fatal("buildPassSet needs an absolute repoRoot to make report paths repo-relative")
  }
  const files = /** @type {{testResults?: unknown}} */ (reportJson).testResults
  if (!Array.isArray(files)) {
    fatal("the report has no testResults array — it is not a vitest JSON report")
  }

  const prefix = repoRoot.endsWith(path.sep) ? repoRoot : repoRoot + path.sep
  const identities = new Set()
  const collectFailures = []
  let passed = 0
  let assertionsSeen = 0

  for (const file of files) {
    const name = typeof file?.name === "string" ? file.name : ""
    const rel = name.startsWith(prefix) ? name.slice(prefix.length) : name || "<unnamed file>"
    const results = Array.isArray(file?.assertionResults) ? file.assertionResults : []

    for (const assertion of results) {
      assertionsSeen++
      if (assertion?.status === "passed") {
        identities.add(`${rel} :: ${assertion.fullName}`)
        passed++
      }
    }

    // The collect failure that would otherwise vanish from the diff entirely.
    if (file?.status === "failed" && results.length === 0) {
      const excerpt = String(file?.message ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 200)
      const identity = `${rel} :: <file-level failure> ${excerpt}`
      identities.add(identity)
      collectFailures.push(identity)
    }
  }

  return { identities, passed, assertionsSeen, collectFailures, fileCount: files.length }
}

/**
 * Compare two identity sets.
 *
 * @param {Set<string>} reference
 * @param {Set<string>} candidate
 * @returns {{missing: string[], extra: string[], identical: boolean, bothEmpty: boolean,
 *            verdict: string}}
 */
export function diffPassSets(reference, candidate) {
  if (!(reference instanceof Set) || !(candidate instanceof Set)) {
    fatal("diffPassSets compares two Sets of identities; it was handed something else")
  }
  const missing = [...reference].filter((id) => !candidate.has(id)).sort()
  const extra = [...candidate].filter((id) => !reference.has(id)).sort()
  const identical = missing.length === 0 && extra.length === 0
  const bothEmpty = reference.size === 0 && candidate.size === 0

  return {
    missing,
    extra,
    identical,
    bothEmpty,
    // A zero-vs-zero comparison is an empty-set identity, not evidence. Saying so is the
    // difference between "these runs agree" and "this differ stopped reading reports".
    verdict: identical
      ? bothEmpty
        ? "IDENTICAL (both empty — proves nothing)"
        : `IDENTICAL (${reference.size} tests)`
      : "DIFFERS",
  }
}

function sample(ids, label) {
  const shown = ids.slice(0, SAMPLE_LIMIT).map((id) => `     ${label} ${id}`)
  if (ids.length > SAMPLE_LIMIT) {
    shown.push(`     ${label} … and ${ids.length - SAMPLE_LIMIT} more`)
  }
  return shown
}

/**
 * Group `run-NN-{base,rsc}.json` by iteration, refusing a half-written iteration.
 *
 * @param {string} dir
 * @returns {Map<string, {base: string, rsc: string}>}
 */
function collectIterations(dir) {
  let entries
  try {
    if (!statSync(dir).isDirectory()) fatal(`${dir} is not a directory`)
    entries = readdirSync(dir)
  } catch (error) {
    if (error instanceof Fatal) throw error
    fatal(`cannot read ${dir}: ${error?.message ?? error}`)
  }

  const iterations = new Map()
  for (const entry of entries.sort()) {
    const match = /^run-(\d+)-(base|rsc)\.json$/.exec(entry)
    if (!match) continue
    const [, label, project] = match
    if (!iterations.has(label)) iterations.set(label, {})
    iterations.get(label)[project] = path.join(dir, entry)
  }

  if (iterations.size === 0) {
    fatal(
      `no run-NN-{base,rsc}.json reports in ${dir}. This differ reads what ` +
        "scripts/suite-repeatability.sh writes; an empty directory would otherwise " +
        "compare nothing to nothing and report success."
    )
  }

  for (const [label, pair] of iterations) {
    if (!pair.base || !pair.rsc) {
      fatal(
        `iteration ${label} has only the ${pair.base ? "base" : "rsc"} report. ` +
          "`npm test` is two commands and the harness writes both; comparing a " +
          "half-written iteration would silently drop one project's tests from the " +
          "pass set while still printing a verdict."
      )
    }
  }

  return iterations
}

function main() {
  const dir = process.argv[2]
  if (!dir) {
    fatal("usage: node scripts/diff-pass-sets.mjs <directory written by suite-repeatability.sh>")
  }

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  const iterations = collectIterations(dir)
  progress(`${iterations.size} iteration(s) in ${dir}, repo root ${repoRoot}`)

  const runs = []
  for (const [label, pair] of iterations) {
    const parts = []
    for (const project of ["base", "rsc"]) {
      let parsed
      try {
        parsed = JSON.parse(readFileSync(pair[project], "utf8"))
      } catch (error) {
        fatal(`${pair[project]} did not parse as JSON: ${error?.message ?? error}`)
      }
      parts.push(buildPassSet(parsed, repoRoot))
    }
    const identities = new Set([...parts[0].identities, ...parts[1].identities])
    runs.push({
      label,
      identities,
      passed: parts[0].passed + parts[1].passed,
      assertionsSeen: parts[0].assertionsSeen + parts[1].assertionsSeen,
      collectFailures: [...parts[0].collectFailures, ...parts[1].collectFailures],
      fileCount: parts[0].fileCount + parts[1].fileCount,
    })
  }

  console.log("")
  console.log("run    files  assertions  passed  collect-failures  identities")
  for (const run of runs) {
    console.log(
      [
        run.label.padEnd(6),
        String(run.fileCount).padStart(5),
        String(run.assertionsSeen).padStart(11),
        String(run.passed).padStart(7),
        String(run.collectFailures.length).padStart(17),
        String(run.identities.size).padStart(11),
      ].join("")
    )
  }

  const reference = runs[0]
  const problems = []

  console.log("")
  console.log(`PASS-SET DIFF vs run ${reference.label} (base + rsc unioned)`)
  for (const run of runs.slice(1)) {
    const result = diffPassSets(reference.identities, run.identities)
    console.log(`  run ${run.label}: ${result.verdict}`)
    for (const line of sample(result.missing, "MISSING")) console.log(line)
    for (const line of sample(result.extra, "EXTRA  ")) console.log(line)
    if (!result.identical) {
      problems.push(
        `run ${run.label} passed a DIFFERENT set of tests than run ${reference.label} — ` +
          `${result.missing.length} missing, ${result.extra.length} extra`
      )
    }
    if (result.bothEmpty) {
      problems.push(
        `run ${run.label} and the reference are BOTH EMPTY. Set identity over nothing is ` +
          "not a result; either the reports are truncated or the harness never ran a test."
      )
    }
  }

  for (const run of runs) {
    if (run.collectFailures.length > 0) {
      problems.push(
        `run ${run.label} has ${run.collectFailures.length} file-level collect ` +
          `failure(s), which contribute no test identities:\n` +
          run.collectFailures.map((id) => `        ${id}`).join("\n")
      )
    }
  }

  console.log("")
  console.log("ANTI-VACUITY FLOORS")
  console.log(
    `  iterations           = ${runs.length} (floor ${MIN_ITERATIONS}) ` +
      `${runs.length >= MIN_ITERATIONS ? "PASS" : "FAIL"}`
  )
  console.log(
    `  reference pass set   = ${reference.passed} (floor ${MIN_REFERENCE_PASS_SET}) ` +
      `${reference.passed >= MIN_REFERENCE_PASS_SET ? "PASS" : "FAIL"}`
  )

  if (runs.length < MIN_ITERATIONS) {
    problems.push(
      `MIN_ITERATIONS floor violated: ${runs.length} iteration(s) found, ` +
        `${MIN_ITERATIONS} required. A run diffed against itself is IDENTICAL by ` +
        `construction.${FLOOR_ADVICE}`
    )
  }
  if (reference.passed < MIN_REFERENCE_PASS_SET) {
    problems.push(
      `MIN_REFERENCE_PASS_SET floor violated: reference run ${reference.label} has only ` +
        `${reference.passed} passing tests, below the floor of ${MIN_REFERENCE_PASS_SET} ` +
        `(measured 4747 = 4739 base + 8 rsc). Every verdict above was computed against a ` +
        `reference that is not the full suite, so IDENTICAL would mean the runs agree ` +
        `about a fragment.${FLOOR_ADVICE}`
    )
  }

  console.log("")
  if (problems.length) {
    for (const problem of problems) console.error(`FATAL: ${problem}`)
    console.error("")
    console.error(
      `FATAL: this pass-set comparison does NOT certify the suite (${problems.length} ` +
        "problem(s) above). Note that vitest's own exit codes are deliberately not what " +
        "this verdict is based on — a truncated report exits 0 and compares equal to " +
        "another truncated report."
    )
    process.exitCode = 1
    return
  }

  console.log(
    `OK: all ${runs.length} iterations produced the SAME pass set ` +
      `(${reference.identities.size} identities, ${reference.passed} passing).`
  )
  console.log(
    "OK: reminder — this is a cheap regression guard, NOT the evidence for SC-1. The " +
      "same check was 16/16 green on the unfixed tree; the evidence is the margin each " +
      "timing-sensitive assertion leaves against its budget under induced load."
  )
}

// ---------------------------------------------------------------------------
// Invocation guard. `import.meta.main` is TRUE only when node was pointed at this file and
// FALSE under vitest's module runner, which is what lets a future gate import
// buildPassSet / diffPassSets without reading a directory. Node has defined it since 24.2
// and package.json's engines floor is >= 24.12, so `undefined` means a runtime this script
// has never been tested under — and a check that silently does nothing is strictly worse
// than a check that fails, so that case is FATAL rather than a quiet return.
// ---------------------------------------------------------------------------
if (import.meta.main === true) {
  try {
    main()
  } catch (error) {
    if (error instanceof Fatal) {
      console.error(`FATAL: ${error.message}`)
    } else {
      console.error(`FATAL: ${error?.stack ?? error}`)
    }
    process.exitCode = 1
  }
} else if (import.meta.main !== false) {
  console.error(
    "FATAL: this runtime does not define import.meta.main, so diff-pass-sets.mjs cannot " +
      "tell whether it was invoked or imported and refuses to guess. package.json requires " +
      `node >= 24.12.0; this is ${process.version}.`
  )
  process.exitCode = 1
}
