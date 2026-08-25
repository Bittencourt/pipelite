// Extract the timing-sensitive assertions' durations from every base report in a
// directory written by scripts/suite-repeatability.sh, and report each as a fraction of the
// budget actually in force.
//
// This is the BEFORE/AFTER instrument for ROADMAP SC-1 as amended. 47-02 recorded the
// BEFORE numbers with it; 47-06 must re-run this exact file so the two halves of the pair
// are produced by the same measurement, not by two hand-written probes.
//
// Budgets: vitest.config.ts sets neither testTimeout nor hookTimeout, so vitest's defaults
// apply -> hookTimeout 10000 ms, testTimeout 5000 ms.
//
// The FIRST test of a file carries its beforeEach cost in vitest's attributed duration,
// which is why the two hook subjects are named by their first test rather than by the hook.
// AFTER 47-03/47-04 land, the hoisting fix moves that cost out of the hook entirely and the
// durations collapse (research measured 1258 ms -> 3.0 ms on a patched copy); the probe
// titles stay valid either way because they name tests, not hooks.
//
// FLOOR: a probe that matches nothing is an extraction failure, not a clean measurement.
// Every probe must be found in every report or this exits 1. If 47-04 renames the linearity
// test, update the title here in the SAME commit — a silently unmatched probe is exactly the
// vacuous-gate shape this phase exists to delete.
//
// ---------------------------------------------------------------------------------------
// 47-06: THE LINEARITY PROBE'S SUBJECT WAS DELETED, AND THE FLOOR CAUGHT IT
//
// 47-04 replaced `condition-evaluator.test.ts`'s elapsed-RATIO assertion with counted
// operations, and did NOT update the probe below in the same commit as the FLOOR paragraph
// above required. 47-06 therefore ran this file unchanged against the fixed tree and it
// FATAL'd, exactly as designed, in all six under-load base reports:
//
//   FATAL: run-01-base.json: probe "condition-evaluator.test.ts linearity assertion"
//          matched nothing — the extraction proves nothing
//   FATAL: 3 probe extraction failure(s) — this is not a measurement
//
// That FATAL is the AFTER half of the linearity row, recorded verbatim in 47-06-SUMMARY.md:
// the elapsed-ratio assertion has no margin because it no longer exists. The row is a
// CATEGORY CHANGE (a load-sensitive continuous quantity became a deterministic integer), not
// a smaller ratio, and this file must never be made to print a ratio for it again.
//
// The probe is now repointed at the two most expensive members of the replacement describe,
// so the instrument keeps measuring the assertions that actually defend the property. Their
// budget is testTimeout 5000 ms, and they are COUNTED assertions — their durations are
// reported here as cost, never as the thing being asserted.
//
// 47-06 also discovered, by running this instrument at a measured 2.50x-9.00x, that the same
// module-import-cost defect 47-03 fixed in two HOOKS is still live in ~146 test BODIES, where
// the budget is testTimeout 5000 ms rather than hookTimeout 10 000 ms — half the budget, so
// strictly more fragile. Four assertions in three files timed out. They are probed below so
// the population is measured rather than described. See 47-06-SUMMARY.md and
// deferred-items.md.
// ---------------------------------------------------------------------------------------
//
// Usage: node <this file> <report-dir> "<load label>"

import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

const dir = process.argv[2]
const label = process.argv[3] ?? "unlabelled"
if (!dir) {
  console.error("FATAL: usage: node extract-margins.mjs <report-dir> <label>")
  process.exit(1)
}

const PROBES = [
  {
    key: "toggle.test.ts first test (beforeEach cost)",
    file: "src/lib/execution/toggle.test.ts",
    title: "returns error when not authenticated",
    budget: 10000,
    budgetName: "hookTimeout 10000ms",
  },
  {
    key: "recursion.test.ts depth-enforcement first test (beforeEach cost)",
    file: "src/lib/execution/recursion.test.ts",
    title: "creates a run with depth < 5 successfully",
    budget: 10000,
    budgetName: "hookTimeout 10000ms",
  },
  // The replacement for the deleted elapsed-ratio assertion. DETERMINISM is the one that
  // carries the load-independence claim (20 repeats -> ONE integer); FLATNESS is the most
  // expensive of the six. Both are counted assertions: their DURATION is cost, not the
  // property. A duration that moves says nothing about whether the gate holds — which is
  // precisely the improvement over what they replaced.
  {
    key: "condition-evaluator.test.ts DETERMINISM (replaces the deleted elapsed ratio)",
    file: "src/lib/execution/condition-evaluator.test.ts",
    title: "DETERMINISM: 20 repeats give exactly ONE integer",
    budget: 5000,
    budgetName: "testTimeout 5000ms",
  },
  {
    key: "condition-evaluator.test.ts FLATNESS (the most expensive counted assertion)",
    file: "src/lib/execution/condition-evaluator.test.ts",
    title: "FLATNESS: ops per character does not grow across a 16x input span",
    budget: 5000,
    budgetName: "testTimeout 5000ms",
  },

  // 47-06's discovery: the same import-cost defect, in test BODIES rather than hooks, against
  // HALF the budget. All three of these timed out at a measured >= 3x on the fixed tree. They
  // are the suite's real worst-case timing margin now, and they are NOT what 47-03 fixed.
  {
    key: "replay-carries-dry-run.test.ts first test (test-BODY import cost) [47-06 finding]",
    file: "src/app/workflows/__tests__/replay-carries-dry-run.test.ts",
    title: "replaying a run whose dryRun is true produces a new run with dryRun also true",
    budget: 5000,
    budgetName: "testTimeout 5000ms",
  },
  {
    key: "health route.test.ts first importing test (test-BODY import cost) [47-06 finding]",
    file: "src/app/api/health/__tests__/route.test.ts",
    title:
      "empty registry returns 503 with all ten workers present and dead — a dead register() must never read as healthy",
    budget: 5000,
    budgetName: "testTimeout 5000ms",
  },
  {
    key: "engine.test.ts first test (test-BODY import cost) [47-06 finding]",
    file: "src/lib/execution/engine.test.ts",
    title: "walks a linear 3-node graph and completes the run",
    budget: 5000,
    budgetName: "testTimeout 5000ms",
  },
]

const reports = readdirSync(dir)
  .filter((f) => /^run-\d+-base\.json$/.test(f))
  .sort()
if (reports.length < 3) {
  console.error(`FATAL: expected >= 3 base reports in ${dir}, found ${reports.length}`)
  process.exit(1)
}

const observed = new Map(PROBES.map((p) => [p.key, []]))
let problems = 0

for (const report of reports) {
  const parsed = JSON.parse(readFileSync(path.join(dir, report), "utf8"))
  for (const probe of PROBES) {
    let hit = null
    for (const file of parsed.testResults) {
      if (!file.name.endsWith(probe.file)) continue
      for (const assertion of file.assertionResults) {
        if (assertion.title === probe.title) hit = assertion
      }
    }
    if (!hit) {
      console.error(
        `FATAL: ${report}: probe "${probe.key}" matched nothing — the extraction proves nothing`
      )
      problems++
      continue
    }
    if (typeof hit.duration !== "number") {
      console.error(`FATAL: ${report}: probe "${probe.key}" has no numeric duration`)
      problems++
      continue
    }
    if (hit.status !== "passed") {
      console.error(`NOTE:  ${report}: probe "${probe.key}" status=${hit.status}`)
    }
    observed.get(probe.key).push(hit.duration)
  }
}

const stat = (values) => {
  const s = [...values].sort((a, b) => a - b)
  const median =
    s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
  return { min: s[0], median, max: s[s.length - 1] }
}

console.log("")
console.log(`LOAD CONDITION: ${label}   reports: ${reports.length} base runs in ${dir}`)
console.log("")
for (const probe of PROBES) {
  const values = observed.get(probe.key)
  if (values.length === 0) continue
  const { min, median, max } = stat(values)
  console.log(`${probe.key}`)
  console.log(`  budget   ${probe.budgetName}`)
  console.log(`  observed min=${min}ms  median=${median}ms  max=${max}ms   (n=${values.length})`)
  console.log(
    `  budget consumed  min=${((min / probe.budget) * 100).toFixed(1)}%  ` +
      `median=${((median / probe.budget) * 100).toFixed(1)}%  ` +
      `max=${((max / probe.budget) * 100).toFixed(1)}%   ` +
      `worst-case margin=${(probe.budget / max).toFixed(2)}x`
  )
  console.log(`  raw      ${values.join(", ")}`)
  console.log("")
}

if (problems) {
  console.error(`FATAL: ${problems} probe extraction failure(s) — this is not a measurement`)
  process.exitCode = 1
} else {
  console.log(`OK: all ${PROBES.length} probes located in all ${reports.length} reports`)
}
