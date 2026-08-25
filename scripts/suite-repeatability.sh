#!/usr/bin/env bash
#
# Run the full test suite N times at the DEFAULT worker count and record, per
# iteration, one machine-readable report per vitest project.
#
# WHAT THIS MEASURES
#   Whether N consecutive full-suite runs, under the configuration developers and
#   CI actually use, produce the same result. It writes the raw evidence only:
#   `run-NN-base.json` and `run-NN-rsc.json` per iteration plus a `summary.txt`
#   carrying an exit code, a wall time and the parsed pass/fail/skip counts for
#   every project of every iteration. Comparing those reports is a separate
#   program, `scripts/diff-pass-sets.mjs`, because the harness that produces
#   evidence must not also be the thing that grades it.
#
# WHAT THIS DOES NOT PROVE — READ THIS BEFORE CITING ITS OUTPUT
#   It is a CHEAP REGRESSION GUARD, not evidence that the suite is trustworthy.
#   Phase 47 research ran this shape 16 times on the UNFIXED tree — 10 idle, 3 at
#   2x CPU oversubscription, 3 at 3x — and got 16/16 identical pass sets,
#   4739 passed / 32 skipped, zero failures. A check that was already green
#   before any work began has near-zero discriminating power, which is why
#   ROADMAP success criterion SC-1 was AMENDED away from it. The criterion is now
#   the MARGIN each timing-sensitive assertion leaves against its budget under
#   induced load. A green run here means "no regression appeared", and nothing
#   more. Do not present it as proof that a flake was fixed.
#
# WHY IT INVOKES THE VITEST BINARY DIRECTLY, TWICE PER ITERATION
#   `npm test` is TWO commands — `vitest run` and then
#   `vitest run --config vitest.rsc.config.ts`. A harness that runs only the
#   first silently omits the 8 RSC tests from every pass set it produces, and the
#   omission is invisible in the output. So both run, every iteration.
#
#   The binary is called as `./node_modules/.bin/vitest` rather than through
#   `npm run`, because in this environment `npm run` reorders a child's stdout and
#   stderr, and this script exists to attribute wall time and failure text to a
#   specific iteration.
#
#   Both reporters are passed on purpose. `--reporter=json` ALONE suppresses
#   console output, so a startup error prints nothing and looks like a clean run;
#   `--reporter=json --outputFile=… --reporter=default` keeps the human stream.
#   Nothing here redirects stderr: a stack trace from vitest is the most
#   valuable thing this script can surface.
#
#   It passes NO worker-count, pool, file-parallelism or repeat-on-failure flag.
#   The default worker count IS the measurement. Adding a flag that serialises
#   the suite would remove the contention the whole exercise is about.
#
# WHY IT REFUSES A NON-EMPTY OUTPUT DIRECTORY
#   The reports are the evidence for a phase criterion. Writing them into a
#   directory that already holds reports would let a previous run's `run-07-*`
#   files be read as part of this run's set — a silent mixing of two experiments.
#   It is cheaper to demand a fresh directory than to reason about which files
#   came from where. This script creates its target and writes only
#   `run-NN-{base,rsc}.json` and `summary.txt`; it deletes nothing, ever.
#
# EXIT CODE
#   0 only when every iteration of every project reported `success: true` with a
#   non-empty report. A red run is DATA and is fully recorded, but it never
#   yields a zero exit: this script must not be the reason someone believes a
#   failing suite passed. It never branches on vitest's exit code alone — the
#   parsed `success` and `numPassedTests` from each report decide the verdict.
#
# USAGE
#   bash scripts/suite-repeatability.sh [iterations] [output-directory]
#   iterations       default 10   (10 idle iterations measured at ~9.4 minutes)
#   output-directory default /tmp/suite-repeatability-<UTC timestamp>
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VITEST="$REPO_ROOT/node_modules/.bin/vitest"
RSC_CONFIG="$REPO_ROOT/vitest.rsc.config.ts"

ITERATIONS="${1:-10}"
OUT_DIR="${2:-/tmp/suite-repeatability-$(date -u +%Y%m%dT%H%M%SZ)}"

if ! [[ "$ITERATIONS" =~ ^[0-9]+$ ]] || [[ "$ITERATIONS" -lt 1 ]]; then
  echo "FATAL: iterations must be a positive integer, got '$ITERATIONS'." >&2
  exit 1
fi

if [[ ! -x "$VITEST" ]]; then
  echo "FATAL: $VITEST is missing or not executable. Run 'npm ci' first." >&2
  exit 1
fi

if [[ ! -f "$RSC_CONFIG" ]]; then
  echo "FATAL: $RSC_CONFIG is absent, so the second project cannot run and every" >&2
  echo "       pass set this harness produced would silently omit the RSC tests." >&2
  exit 1
fi

if [[ -e "$OUT_DIR" ]] && [[ -n "$(ls -A "$OUT_DIR" 2>/dev/null)" ]]; then
  echo "FATAL: $OUT_DIR is not empty. Reports from two different runs in one" >&2
  echo "       directory would be read as one experiment. Name a fresh directory." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
SUMMARY="$OUT_DIR/summary.txt"

{
  echo "# scripts/suite-repeatability.sh"
  echo "# started      $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# repo         $REPO_ROOT"
  echo "# vitest       $("$VITEST" --version 2>&1 | head -n 1)"
  echo "# node         $(node --version)"
  echo "# cores        $(node -e 'process.stdout.write(String(require("node:os").availableParallelism()))')"
  echo "# iterations   $ITERATIONS"
  echo "# NOTE: a cheap regression guard, NOT the evidence for SC-1. See this file's header."
} >"$SUMMARY"

FAILED_RUNS=0

run_project() {
  local iteration_label="$1" project="$2" report="$3"
  shift 3

  local start_ns end_ns wall_ms wall rc stats
  echo "-> iteration $iteration_label / $ITERATIONS : project $project"

  start_ns=$(date +%s%N)
  rc=0
  "$VITEST" run "$@" --reporter=json --outputFile="$report" --reporter=default || rc=$?
  end_ns=$(date +%s%N)

  wall_ms=$(((end_ns - start_ns) / 1000000))
  wall=$(printf '%d.%03d' $((wall_ms / 1000)) $((wall_ms % 1000)))

  if [[ ! -s "$report" ]]; then
    echo "FATAL: $report is missing or empty after a run that exited $rc." >&2
    echo "       A run with no report cannot enter a pass set, and a harness that" >&2
    echo "       skipped it would report a smaller set as IDENTICAL. Refusing." >&2
    exit 1
  fi

  # The verdict comes from the PARSED document, never from $rc alone.
  if ! stats=$(node -e '
    const fs = require("node:fs")
    const raw = fs.readFileSync(process.argv[1], "utf8")
    if (!raw.trim()) { console.error("report is whitespace only"); process.exit(3) }
    const r = JSON.parse(raw)
    if (!Array.isArray(r.testResults)) { console.error("testResults is not an array"); process.exit(3) }
    const ok = r.success === true && Number(r.numPassedTests) > 0 && Number(r.numFailedTests) === 0
    console.log([
      `success=${r.success}`, `files=${r.testResults.length}`,
      `total=${r.numTotalTests}`, `passed=${r.numPassedTests}`,
      `failed=${r.numFailedTests}`, `skipped=${r.numPendingTests}`,
      `verdict=${ok ? "GREEN" : "RED"}`,
    ].join(" "))
  ' "$report"); then
    echo "FATAL: $report did not parse as a vitest JSON report (run exited $rc)." >&2
    exit 1
  fi

  echo "run=$iteration_label project=$project exit=$rc wall=${wall}s $stats" >>"$SUMMARY"
  echo "-> run=$iteration_label project=$project exit=$rc wall=${wall}s $stats"

  if [[ "$rc" -ne 0 ]] || [[ "$stats" != *"verdict=GREEN"* ]]; then
    FAILED_RUNS=$((FAILED_RUNS + 1))
  fi
}

for ((i = 1; i <= ITERATIONS; i++)); do
  label=$(printf '%02d' "$i")
  run_project "$label" base "$OUT_DIR/run-$label-base.json"
  run_project "$label" rsc "$OUT_DIR/run-$label-rsc.json" --config "$RSC_CONFIG"
done

echo "# finished     $(date -u +%Y-%m-%dT%H:%M:%SZ)" >>"$SUMMARY"
echo "# red projects $FAILED_RUNS" >>"$SUMMARY"

REPORT_COUNT=$(node -e '
  const fs = require("node:fs")
  const n = fs.readdirSync(process.argv[1]).filter((f) => /^run-\d+-(base|rsc)\.json$/.test(f)).length
  process.stdout.write(String(n))
' "$OUT_DIR")

EXPECTED=$((ITERATIONS * 2))
if [[ "$REPORT_COUNT" -ne "$EXPECTED" ]]; then
  echo "FATAL: expected $EXPECTED reports in $OUT_DIR, found $REPORT_COUNT." >&2
  exit 1
fi

if [[ "$FAILED_RUNS" -ne 0 ]]; then
  echo "FATAL: $FAILED_RUNS of $EXPECTED project runs were RED. The reports are in" >&2
  echo "       $OUT_DIR and are valid evidence — but this script will not exit 0" >&2
  echo "       over a failing suite. Read $SUMMARY." >&2
  exit 1
fi

echo "OK: $ITERATIONS iterations x 2 projects, $REPORT_COUNT reports in $OUT_DIR, all GREEN."
echo "OK: next step -> node scripts/diff-pass-sets.mjs $OUT_DIR"
echo "OK: reminder  -> this is a regression guard, not the evidence for SC-1."
