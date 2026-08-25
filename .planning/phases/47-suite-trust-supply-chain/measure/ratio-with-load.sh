#!/usr/bin/env bash
#
# Run the linearity-ratio probe under induced load and record the multiplier that was
# actually in force.
#
# THE SPINNER COUNT IS NOT THE SAME AS run-under-load.sh's, ON PURPOSE.
#   The probe is SINGLE-THREADED, whereas the suite contributes its own workers. To reach the
#   same TOTAL oversubscription the probe therefore needs MORE spinners: 11 spinners + 1
#   probe = 12 runnable on 4 cores = 3.00x, against 8 spinners + the suite's workers for the
#   same figure. Do not copy the number across; sample the runnable count and read it.
#
# Usage: bash <this file> [reps] [spinner-count]
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPIN="$HERE/spin.mjs"
PROBE="$HERE/ratio-under-load.mjs"

REPS="${1:-10}"
CORES=$(node -e 'process.stdout.write(String(require("node:os").availableParallelism()))')
SPINNERS="${2:-$(((CORES * 3) - 1))}"
LOADLOG="/tmp/loadavg-ratio-probe-$(date -u +%Y%m%dT%H%M%SZ).txt"

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

echo "-> availableParallelism = $CORES ; spinners = $SPINNERS ; probe adds 1 runnable thread"
for ((i = 0; i < SPINNERS; i++)); do
  node "$SPIN" &
  PIDS+=("$!")
done

# The 1-minute load average lags, so give it time to reflect reality before the probe starts.
# The instantaneous runnable count (field 4) is authoritative and is sampled below regardless.
sleep 75
echo "-> /proc/loadavg at probe start: $(cat /proc/loadavg)"

(
  while true; do
    echo "$(date -u +%H:%M:%S) $(cat /proc/loadavg)"
    sleep 5
  done
) >"$LOADLOG" 2>&1 &
SAMPLER_PID=$!
echo "-> load sampler writing $LOADLOG"

node "$PROBE" "$REPS" "UNDER $SPINNERS SPINNERS on $CORES cores"

echo "-> /proc/loadavg at probe end:   $(cat /proc/loadavg)"
echo "-> sampled runnable counts:"
cat "$LOADLOG"
