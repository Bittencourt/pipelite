#!/usr/bin/env bash
#
# Induce CPU oversubscription on purpose, run the full suite under it via
# scripts/suite-repeatability.sh, and record the load that was actually present — so the
# resulting margins are attributable to a MEASURED multiplier rather than to "under load".
#
# WHY THE MULTIPLIER IS SAMPLED RATHER THAN ASSUMED
#   `spinners / availableParallelism` understates the real figure, because the suite
#   contributes its own workers. The authoritative number is field 4 of /proc/loadavg —
#   runnable/total kernel schedulable entities — divided by the core count, sampled
#   throughout the run. The 1-minute load average is also recorded, but it LAGS by design
#   and must not be read during the first minute.
#
# WHY THE SPINNERS DIE FROM A TRAP
#   A failure part-way through must not leave the machine loaded for the next measurement.
#   The trap prints the survivor count and FATALs if it is not zero.
#
# Usage: bash <this file> <report-dir> [iterations] [spinner-count]
#   default iterations    3
#   default spinner-count 2 x availableParallelism
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../../.." && pwd)"
SPIN="$HERE/spin.mjs"

OUT="${1:?FATAL: give an output directory}"
ITER="${2:-3}"

CORES=$(node -e 'process.stdout.write(String(require("node:os").availableParallelism()))')
SPINNERS="${3:-$((CORES * 2))}"
LOADLOG="$(dirname "$OUT")/loadavg-$(basename "$OUT").txt"

PIDS=()
SAMPLER_PID=""

cleanup() {
  local rc=$?
  set +e
  if [[ -n "$SAMPLER_PID" ]]; then kill "$SAMPLER_PID" 2>/dev/null; fi
  for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null; done
  sleep 1
  local survivors
  survivors=$(node -e '
    const fs = require("node:fs")
    const target = "node " + process.argv[1]
    let n = 0
    for (const pid of fs.readdirSync("/proc")) {
      if (!/^\d+$/.test(pid)) continue
      try {
        if (fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ").trim() === target) n++
      } catch {}
    }
    process.stdout.write(String(n))
  ' "$SPIN")
  echo "-> trap fired: ${#PIDS[@]} spinners signalled; surviving spinner processes = $survivors"
  if [[ "$survivors" != "0" ]]; then
    echo "FATAL: $survivors spinner(s) survived the trap — the machine is still loaded." >&2
    exit 1
  fi
  exit "$rc"
}
trap cleanup EXIT INT TERM

echo "-> repo                 = $REPO"
echo "-> availableParallelism = $CORES"
echo "-> spinner processes    = $SPINNERS"
echo "-> spinners / cores     = $(node -e "process.stdout.write((${SPINNERS}/${CORES}).toFixed(2))")x"
echo "                          (an UNDERSTATEMENT — the suite adds its own workers; read"
echo "                           the sampled runnable count in $LOADLOG for the real figure)"

for ((i = 0; i < SPINNERS; i++)); do
  node "$SPIN" &
  PIDS+=("$!")
done
echo "-> spinner pids: ${PIDS[*]}"

(
  while true; do
    echo "$(date -u +%H:%M:%S) $(cat /proc/loadavg)"
    sleep 10
  done
) >"$LOADLOG" 2>&1 &
SAMPLER_PID=$!
echo "-> load sampler pid $SAMPLER_PID writing $LOADLOG"

bash "$REPO/scripts/suite-repeatability.sh" "$ITER" "$OUT"
