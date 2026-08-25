// Extract the three timing-sensitive assertions' durations from every base report in a
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
  {
    key: "condition-evaluator.test.ts linearity assertion",
    file: "src/lib/execution/condition-evaluator.test.ts",
    title: "scales linearly, not quadratically, with path length",
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
