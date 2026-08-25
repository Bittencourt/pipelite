// A single-core busy loop. No allocation, no I/O, no timers: it exists purely to occupy one
// scheduler slot so the suite (or the ratio probe) runs oversubscribed.
//
// Usage: node <this file>
let x = 1
for (;;) {
  x = (x + Math.sqrt(x + 1)) % 1e9
  if (x === -1) break // unreachable; keeps the loop from being optimised away
}
