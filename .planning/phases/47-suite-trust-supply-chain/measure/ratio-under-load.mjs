// Replicates src/lib/execution/condition-evaluator.test.ts:613-636 EXACTLY and prints the
// ratio the assertion compares against 80, over N repetitions.
//
// Everything below is copied from the test as it stood after 47-01, not re-derived:
//   - pathologicalPaths(n)             :575-580
//   - realCtx() / REAL_CUSTOM_FIELDS   :363-377 + makeCtx :9-12
//   - time(n): best-of-5, performance.now()  :615-626
//   - warm-up time(2000) discarded, small = max(time(8000), 0.05), large = time(128000)
//   - the assertion is expect(large / small).toBeLessThan(80)
//
// It imports the REAL module: node 24 strips the type-only import in
// condition-evaluator.ts, so no bundler and no vitest is involved. That matters — this probe
// must not inherit vitest's own worker scheduling, because the point is to attribute the
// ratio's movement to CPU contention alone.
//
// NOTE FOR 47-04/47-06: this file measures the ASSERTION THAT 47-04 DELETES. Once the
// elapsed-time ratio is replaced by an operation count, this probe stops describing a live
// gate and becomes a historical record of what the deleted assertion would have read under
// the same load. Keep running it in 47-06 anyway — the AFTER half of the pair is "the ratio
// no longer decides anything", and showing the ratio still drifting while the new counter
// does not is the strongest form of that claim.
//
// Usage: node <this file> [reps] [label]

import path from "node:path"
import { fileURLToPath } from "node:url"

// <repo>/.planning/phases/47-suite-trust-supply-chain/measure/ -> <repo>
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
const { resolveFieldPath } = await import(
  path.join(REPO_ROOT, "src/lib/execution/condition-evaluator.ts")
)

const REPS = Number(process.argv[2] ?? 10)
const LABEL = process.argv[3] ?? "unlabelled"
const THRESHOLD = 80

const REAL_CUSTOM_FIELDS = {
  "Código Mãe": "TYR-4471",
  "CNPJ / CPF": "12.345.678/0001-90",
  "UUID UC (TYR Core)": "9f3a1c22-4e0b-4f2a-9a1d-7c53b0e1d004",
  "Tem solução de solar?": "Sim",
  "Previsão de início operação": "2026-09-01",
  "E-mail de Contato 1": "contato@tyrenergia.com.br",
  "Consumo Médio em MWh": 1035,
  "Índice T.U.S.D.": 0.42,
  "Dados Extras": { id: "extra-1", ativo: true },
}

const makeCtx = (data = {}) => ({ trigger: { type: "crm_event", data }, nodes: {} })
const realCtx = () => makeCtx({ customFields: { ...REAL_CUSTOM_FIELDS } })

const pathologicalPaths = (n) => [
  "trigger.data" + '["a"]'.repeat(n),
  'trigger.data.customFields["' + "a".repeat(n * 10), // unterminated
  "trigger." + "a.".repeat(n) + "b",
  'trigger.data["' + '"'.repeat(n) + '"]',
]

function oneRepetition() {
  const ctx = realCtx()
  const time = (n) => {
    const paths = pathologicalPaths(n)
    let best = Infinity
    for (let run = 0; run < 5; run++) {
      const start = performance.now()
      for (const p of paths) resolveFieldPath(ctx, p)
      best = Math.min(best, performance.now() - start)
    }
    return best
  }
  time(2000) // warm-up, discarded
  const small = Math.max(time(8000), 0.05)
  const large = time(128000) // 16x the input
  return { small, large, ratio: large / small }
}

const ratios = []
for (let i = 0; i < REPS; i++) {
  const r = oneRepetition()
  ratios.push(r.ratio)
  console.log(
    `rep ${String(i + 1).padStart(2)}  small=${r.small.toFixed(3)}ms  ` +
      `large=${r.large.toFixed(3)}ms  ratio=${r.ratio.toFixed(2)}  ` +
      `${r.ratio < THRESHOLD ? "PASS" : "FAIL"} (< ${THRESHOLD})`
  )
}

const sorted = [...ratios].sort((a, b) => a - b)
const median =
  sorted.length % 2
    ? sorted[(sorted.length - 1) / 2]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
const min = sorted[0]
const max = sorted[sorted.length - 1]

console.log("")
console.log(
  `${LABEL}: reps=${REPS}  min=${min.toFixed(2)}  median=${median.toFixed(2)}  ` +
    `max=${max.toFixed(2)}  worst-margin=${(THRESHOLD / max).toFixed(2)}x  ` +
    `budget-consumed=${((max / THRESHOLD) * 100).toFixed(1)}%  ` +
    `failures=${ratios.filter((r) => r >= THRESHOLD).length}/${REPS}`
)
