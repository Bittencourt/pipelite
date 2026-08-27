/**
 * THE SELECTIVITY RULE, AND THE ONLY PLACE ITS FLOOR CAN BE PROVEN.
 *
 * `guardExportInput` treats the PRESENCE of a filter as authorization, so `search=a` — a filter —
 * authorizes an export of 44,254 of 46,054 organizations (96.09%, re-measured 2026-08-27, see
 * `.planning/phases/50-export-authorization/50-MEASUREMENTS.md` §2). This file's subject is the
 * arithmetic that refuses it.
 *
 * WHY THESE CELLS CANNOT BE REPLACED BY A DATABASE TEST, WHICH IS THE WHOLE REASON THE MODULE IS
 * PURE. Every live table is at least 25,195 rows and `pipelite_dedup_test` is provisioned
 * `--schema-only` and starts EMPTY, so the small-N branch that `MIN_EXPORT_ROWS` guards is
 * unreachable by any database in this repository — the fraction dominates everywhere above 2,500
 * rows. A pure function with injected `(matched, total)` is the only instrument that reaches it.
 * Ablation 1 in `50-01-SUMMARY.md` is the proof: with `MIN_EXPORT_ROWS` deleted, every live-anchored
 * cell in this file stays GREEN and only the small-N cells go red.
 *
 * EVERY NAMED INTEGER BELOW COMES FROM `50-MEASUREMENTS.md`, MEASURED AT EXECUTION TIME. Note in
 * particular that the activities allowance is **31,608** and not RESEARCH §8's 31,609: that column
 * was computed with `Math.round` where the locked rule uses `Math.floor` (DELTA item D-1). 31,609 is
 * the smallest REFUSED count, which is a different number, and both appear below so the distinction
 * is unmistakable.
 *
 * NO CLOCK. There is no `Date.now()`, no `performance.now()` and no elapsed-time threshold anywhere
 * in this file. `src/lib/__tests__/suite-timing-hygiene.test.ts` propagates clock taint by variable
 * NAME rather than by scope, so a single clock read here would convert the SQL-derived count floors
 * below into reported timing assertions one sweep away.
 */
import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
  MAX_EXPORT_FRACTION,
  MIN_EXPORT_ROWS,
  decideSelectivity,
  exportAllowance,
} from "../export-selectivity"
import { readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"

const MODULE_PATH = "src/lib/export/export-selectivity.ts"

/* ------------------------------------------------------------------------- *
 * THE MEASURED INTEGERS. `50-MEASUREMENTS.md`, 2026-08-27, localhost:5433.
 * ------------------------------------------------------------------------- */

/** `organizations where deleted_at is null` — §1. */
const ORGS_TOTAL = 46_054
/** `search=a` across name/industry/website — §2. 96.09%, SC-1's headline, must be REFUSED. */
const ORGS_SEARCH_A = 44_254
/** `search=ltda` across the same three columns — §3. 29.00%, SC-2's case, must be ADMITTED. */
const ORGS_SEARCH_LTDA = 13_355
/** `max(1000, floor(46054 * 0.40))` — §8. */
const ORGS_ALLOWANCE = 18_421

/** `activities where deleted_at is null` — §1. */
const ACTIVITIES_TOTAL = 79_022
/** `max(1000, floor(79022 * 0.40))` — §8. NOT RESEARCH's 31,609; see DELTA D-1. */
const ACTIVITIES_ALLOWANCE = 31_608
/** `ACTIVITIES_ALLOWANCE + 1` — the smallest count this table refuses. RESEARCH §8 calls this the
 * allowance, and it is not. */
const ACTIVITIES_FIRST_REFUSED = 31_609
/** `dateTo=2023-06-11` (and -06-09, and -06-10) — §7. 39.90%, the last ADMITTED rung. */
const LADDER_LAST_ADMITTED = 31_530
/** `dateTo=2023-06-12` — §7. 40.00%, the first REFUSED rung. 50-06 crosses here. */
const LADDER_FIRST_REFUSED = 31_612

/* ------------------------------------------------------------------------- *
 * THE PARSED-BODY EXTRACTOR.
 * ------------------------------------------------------------------------- */

/**
 * The body of `function <name>(…) { … }`, brace-matched over comment-stripped source.
 *
 * A WHOLE-FILE `expect(source).not.toContain("/")` IS NOT AVAILABLE HERE and that is why this
 * exists: the module's import statements and its own `50-MEASUREMENTS.md` path references contain
 * slashes, so the no-division assertion has to be scoped to the two function bodies or it cannot be
 * written at all.
 *
 * STEPPING OVER THE PARAMETER LIST IS THE LOAD-BEARING PART. `decideSelectivity`'s parameter is an
 * inline object type — `input: { matched: number; total: number }` — so the first `{` after the
 * function's name belongs to the SIGNATURE. A naive `indexOf("{")` would extract that type as "the
 * body", and every negative assertion below would then pass against a string containing no
 * arithmetic at all. The paren walk is what stops that, and the positive assertions in the same
 * cells are what would catch it if it ever stopped working.
 */
function functionBody(source: string, name: string): string {
  const marker = new RegExp(`\\bfunction\\s+${name}\\s*\\(`)
  const found = marker.exec(source)
  if (found === null) throw new Error(`${MODULE_PATH} declares no \`function ${name}(\``)

  let i = found.index + found[0].length
  let depth = 1

  while (i < source.length && depth > 0) {
    const ch = source[i]
    if (ch === "(") depth += 1
    else if (ch === ")") depth -= 1
    i += 1
  }
  if (depth !== 0) throw new Error(`unterminated parameter list for ${name}`)

  const open = source.indexOf("{", i)
  if (open === -1) throw new Error(`${name} has no body block`)

  // The return-type annotation sits between `)` and `{`. If it ever gains a brace of its own, the
  // `indexOf` above would latch onto it and this extractor would silently return the wrong region —
  // so it fails loudly instead of extracting something plausible.
  const annotation = source.slice(i, open)
  if (/[{}]/.test(annotation)) {
    throw new Error(`${name}'s return type contains a brace; the body extraction is not safe here`)
  }

  depth = 1
  let j = open + 1
  let quote: string | null = null

  while (j < source.length && depth > 0) {
    const ch = source[j]

    if (quote) {
      if (ch === "\\") {
        j += 2
        continue
      }
      if (ch === quote) quote = null
      j += 1
      continue
    }

    if (ch === '"' || ch === "'" || ch === "`") quote = ch
    else if (ch === "{") depth += 1
    else if (ch === "}") depth -= 1

    j += 1
  }
  if (depth !== 0) throw new Error(`unterminated body for ${name}`)

  return source.slice(open + 1, j - 1)
}

/* ------------------------------------------------------------------------- *
 * ARITHMETIC — the allowance, against the measured totals.
 * ------------------------------------------------------------------------- */

describe("exportAllowance is max(MIN_EXPORT_ROWS, floor(total * MAX_EXPORT_FRACTION))", () => {
  it("is exactly MIN_EXPORT_ROWS at total = 0, and is not NaN", () => {
    // The empty-table path needs no special case BECAUSE the rule is a multiplication. A division
    // here would be `NaN`, and `NaN` compares false against every threshold — so the hole would be
    // silent rather than loud.
    expect(exportAllowance(0)).toBe(MIN_EXPORT_ROWS)
    expect(exportAllowance(0)).toBe(1_000)
    expect(Number.isNaN(exportAllowance(0))).toBe(false)
    expect(Number.isInteger(exportAllowance(0))).toBe(true)
  })

  it("is 18,421 on the live organizations table (46,054 rows)", () => {
    expect(exportAllowance(ORGS_TOTAL)).toBe(ORGS_ALLOWANCE)
    expect(Number.isInteger(exportAllowance(ORGS_TOTAL))).toBe(true)
  })

  it("is 31,608 on the live activities table (79,022 rows) — NOT RESEARCH §8's 31,609", () => {
    expect(exportAllowance(ACTIVITIES_TOTAL)).toBe(ACTIVITIES_ALLOWANCE)
    // The off-by-one that a copy out of RESEARCH §8 would assert. Named here so the next reader sees
    // both numbers at once and cannot mistake `round` for `floor`.
    expect(exportAllowance(ACTIVITIES_TOTAL)).not.toBe(ACTIVITIES_FIRST_REFUSED)
    expect(ACTIVITIES_FIRST_REFUSED).toBe(ACTIVITIES_ALLOWANCE + 1)
  })

  it("floors rather than rounds, so the allowance is never above the fraction", () => {
    // `floor` and `round` disagree on exactly the totals whose 40% has a fractional part ≥ 0.5, and
    // three of RESEARCH §8's eight rows are such totals. A rule that rounded UP would admit one row
    // more than the fraction permits at every one of them.
    expect(exportAllowance(ACTIVITIES_TOTAL)).toBeLessThanOrEqual(
      ACTIVITIES_TOTAL * MAX_EXPORT_FRACTION
    )
    expect(exportAllowance(ORGS_TOTAL)).toBeLessThanOrEqual(ORGS_TOTAL * MAX_EXPORT_FRACTION)
  })

  it("sits BETWEEN the export SC-1 refuses and the export SC-2 must still permit", () => {
    // The two assertions a bare `expect(MAX_EXPORT_FRACTION).toBe(0.4)` cannot make, and the reason
    // a refusal-only suite is not enough. Both directions, because a threshold is only correct
    // relative to the two things on either side of it.
    //
    //   13,355 (search=ltda, 29.00%)  <  18,421  <  44,254 (search=a, 96.09%)
    //
    // The upper direction reddens at MAX_EXPORT_FRACTION = 0.99; the lower at 0.01. Neither
    // ablation reddens the other, which is why one assertion here would be half a gate.
    expect(exportAllowance(ORGS_TOTAL)).toBeLessThan(ORGS_SEARCH_A)
    expect(exportAllowance(ORGS_TOTAL)).toBeGreaterThan(ORGS_SEARCH_LTDA)
  })

  it("exposes the two constants as the locked values", () => {
    expect(MAX_EXPORT_FRACTION).toBe(0.4)
    expect(MIN_EXPORT_ROWS).toBe(1_000)
  })
})

/* ------------------------------------------------------------------------- *
 * THE FLOOR — the branch no database in this repository can reach.
 * ------------------------------------------------------------------------- */

describe("MIN_EXPORT_ROWS keeps the rule from removing the feature at small N", () => {
  it("ADMITS 5 of 10 — a pure fraction would refuse it (5 > 4)", () => {
    // SC-2 on a fresh install. Without the floor this is `5 > floor(10 * 0.4) = 4` and the product
    // refuses to export half of a ten-row table.
    expect(decideSelectivity({ matched: 5, total: 10 })).toEqual({ ok: true })
  })

  it("ADMITS 999 of 2,000 — a pure fraction would refuse it (999 > 800)", () => {
    // The self-hosted install the floor exists for. 2,500 rows is where the fraction takes over.
    expect(decideSelectivity({ matched: 999, total: 2_000 })).toEqual({ ok: true })
  })

  it("still REFUSES 1,001 of 2,000 — the floor does not swallow the rule", () => {
    // THE CELL THAT STOPS THE TWO ABOVE BEING A LICENCE. Without it, raising MIN_EXPORT_ROWS above
    // the largest live table would satisfy every other cell in this file while disabling the
    // control completely — and the two admitting cells would applaud.
    const decision = decideSelectivity({ matched: 1_001, total: 2_000 })

    expect(decision.ok).toBe(false)
    expect(decision).toEqual({ ok: false, matched: 1_001, total: 2_000, allowance: 1_000 })
  })

  it("ADMITS 0 of 0 — the empty table, with no NaN in the arithmetic", () => {
    // HONEST LABEL: this cell does NOT detect a division. `0 / 0` is `NaN`, `NaN > 0.4` is false,
    // and the division ablation therefore leaves this cell GREEN. What it does catch is the OTHER
    // empty-table spelling — a pure fraction, where the allowance is 0 and `0 > 0` is false too, so
    // the cell is green there as well.
    //
    // In other words: `(0, 0)` alone is the weakest cell in this file. The two assertions that
    // actually see the division are `(1, 0)` below (Infinity > 0.4 REFUSES) and the parsed-body
    // no-`/` cell. Recorded plainly so nobody later mistakes this one for the detector.
    expect(decideSelectivity({ matched: 0, total: 0 })).toEqual({ ok: true })
    expect(Number.isNaN(exportAllowance(0))).toBe(false)
  })

  it("ADMITS 1 of 0 — the cell that DOES see a division, and the floor at zero", () => {
    // A synthetic input: two consistent counts can never give `matched > total`, so this is not a
    // requirement about real traffic. It is a DISCRIMINATOR, and it separates all three candidate
    // spellings of the rule at once:
    //
    //   max(1000, floor(0 * 0.4)) = 1000  ->  1 > 1000 false  ->  ADMITTED   (correct)
    //   floor(0 * 0.4)            = 0     ->  1 > 0    true   ->  refused    (floor deleted)
    //   1 / 0 = Infinity > 0.4            ->            true  ->  refused    (division)
    //
    // It is the only behavioural cell in the file that reddens on the division ablation.
    expect(decideSelectivity({ matched: 1, total: 0 })).toEqual({ ok: true })
  })
})

/* ------------------------------------------------------------------------- *
 * THE BOUNDARY — `>` and not `>=`, pinned from both sides.
 * ------------------------------------------------------------------------- */

describe("the decision flips exactly at the allowance, and the allowance is admitted", () => {
  it("ADMITS exactly the allowance on the activities table (31,608 of 79,022)", () => {
    expect(decideSelectivity({ matched: ACTIVITIES_ALLOWANCE, total: ACTIVITIES_TOTAL })).toEqual({
      ok: true,
    })
  })

  it("REFUSES one row above the allowance (31,609 of 79,022)", () => {
    // Together with the cell above this pins `matched > allowance` rather than `>=`, in both
    // directions. A single at-the-boundary assertion cannot tell the two operators apart.
    const decision = decideSelectivity({
      matched: ACTIVITIES_FIRST_REFUSED,
      total: ACTIVITIES_TOTAL,
    })

    expect(decision).toEqual({
      ok: false,
      matched: ACTIVITIES_FIRST_REFUSED,
      total: ACTIVITIES_TOTAL,
      allowance: ACTIVITIES_ALLOWANCE,
    })
  })

  it("brackets 50-06's live dateTo crossing in arithmetic first (31,530 vs 31,612)", () => {
    // `dateTo=2023-06-11` -> 31,530 (39.90%) ADMITTED; `dateTo=2023-06-12` -> 31,612 (40.00%)
    // REFUSED — measured, §7. Proving the bracket here means a red in 50-06's live ladder is a fact
    // about the query or the wiring, never about the rule.
    expect(
      decideSelectivity({ matched: LADDER_LAST_ADMITTED, total: ACTIVITIES_TOTAL })
    ).toEqual({ ok: true })
    expect(
      decideSelectivity({ matched: LADDER_FIRST_REFUSED, total: ACTIVITIES_TOTAL }).ok
    ).toBe(false)

    // The bracket is 0.10 pp wide and it straddles the allowance. Asserted so a cell that had drifted
    // to two admitted or two refused values could not still read as "a bracket".
    expect(LADDER_LAST_ADMITTED).toBeLessThanOrEqual(ACTIVITIES_ALLOWANCE)
    expect(LADDER_FIRST_REFUSED).toBeGreaterThan(ACTIVITIES_ALLOWANCE)
  })
})

/* ------------------------------------------------------------------------- *
 * THE LIVE-ANCHORED PAIR — SC-1 and SC-2, decided by arithmetic alone.
 * ------------------------------------------------------------------------- */

describe("the live exposure is refused and the live narrow export still completes", () => {
  it("REFUSES SC-1's 44,254 of 46,054, carrying all three numbers the message needs", () => {
    const decision = decideSelectivity({ matched: ORGS_SEARCH_A, total: ORGS_TOTAL })

    // `toEqual` on the whole object, not three `toContain`s: the payload SHAPE is the contract SC-3's
    // message and SC-1's assertion both read, and a payload reduced to a boolean — or to zeros —
    // would leave the refusal true and the message unwritable.
    expect(decision).toEqual({
      ok: false,
      matched: ORGS_SEARCH_A,
      total: ORGS_TOTAL,
      allowance: ORGS_ALLOWANCE,
    })

    // Every numeric field is a real finite integer. This is the anti-NaN sweep with something to
    // sweep: `{ ok: true }` has no numeric fields at all, so the same assertion on an admitted
    // decision would be vacuous.
    if (decision.ok) throw new Error("unreachable: the decision above must be a refusal")
    for (const [field, value] of Object.entries(decision)) {
      if (typeof value !== "number") continue
      expect(Number.isNaN(value), `${field} is NaN`).toBe(false)
      expect(Number.isFinite(value), `${field} is not finite`).toBe(true)
      expect(Number.isInteger(value), `${field} is not an integer`).toBe(true)
    }
  })

  it("ADMITS SC-2's 13,355 of 46,054 — the bound is not a removal of the feature", () => {
    // The SC-2-shaped failure is a suite that only ever asserts refusals: it stays green while the
    // export is gone for everyone. This cell is the half that notices, and MAX_EXPORT_FRACTION =
    // 0.01 is the ablation that proves it notices.
    expect(decideSelectivity({ matched: ORGS_SEARCH_LTDA, total: ORGS_TOTAL })).toEqual({
      ok: true,
    })
  })

  it("REFUSES the REAL worst case: 25,195 of 25,195 deals under the 50,000 cap", () => {
    // §4. Every deal is owned by one admin, `owner` is an exportable key on `deal`, so
    // `/deals?owner=ef4acac9…` walks out 100.00% of the table and the cap never fires. This, not
    // `search=a`, is the worst live instance of WR-04.
    const decision = decideSelectivity({ matched: 25_195, total: 25_195 })

    expect(decision).toEqual({ ok: false, matched: 25_195, total: 25_195, allowance: 10_078 })
  })
})

/* ------------------------------------------------------------------------- *
 * STRUCTURE — over parsed bodies and comment-stripped source, never raw tokens.
 * ------------------------------------------------------------------------- */

describe("the rule is a multiplication, and the module knows nothing about roles", () => {
  const strippedSource = readStrippedSource(MODULE_PATH)
  const allowanceBody = functionBody(strippedSource, "exportAllowance")
  const decisionBody = functionBody(strippedSource, "decideSelectivity")

  it("extracted two real function bodies, not two empty strings", () => {
    // ANTI-VACUITY FOR EVERY NEGATIVE BELOW. An extractor that silently returned "" would satisfy
    // `not.toContain("/")` perfectly, and the no-division gate would become a gate that cannot fail
    // — the exact defect this milestone exists to remove.
    expect(allowanceBody.trim().length).toBeGreaterThan(0)
    expect(decisionBody.trim().length).toBeGreaterThan(0)
    expect(allowanceBody).toContain("MIN_EXPORT_ROWS")
    expect(decisionBody).toContain("exportAllowance")

    // And the extractor throws rather than returning "" when asked for something absent — which is
    // what makes the two assertions above evidence rather than coincidence.
    expect(() => functionBody(strippedSource, "noSuchFunctionExists")).toThrow(
      /declares no .*function noSuchFunctionExists/
    )
  })

  it("computes the allowance by MULTIPLICATION with the floor applied outside it", () => {
    // The exact spelling, because the operand order is the property: `Math.max(MIN_EXPORT_ROWS, …)`
    // applies the floor to the FRACTION's result. `Math.floor(Math.max(…))` would be a different
    // rule that happens to agree on today's four tables.
    expect(allowanceBody).toMatch(/Math\.max\(MIN_EXPORT_ROWS/)
    expect(allowanceBody).toContain("Math.floor")
    expect(allowanceBody).toContain("MAX_EXPORT_FRACTION")
    expect(allowanceBody).toContain("*")
  })

  it("contains NO division operator in either function body", () => {
    // Scoped to the bodies because the file's imports contain slashes. Comments are stripped first,
    // so the prose explaining why the rule is not a division cannot satisfy — or break — this.
    expect(
      allowanceBody.includes("/"),
      `exportAllowance's body divides. \`matched / total\` is NaN at total = 0 and NaN compares ` +
        `false against every threshold, so the empty-table hole would be silent. The rule is ` +
        `max(MIN_EXPORT_ROWS, floor(total * MAX_EXPORT_FRACTION)) — a multiplication — precisely ` +
        `so total = 0 needs no special case.`
    ).toBe(false)
    expect(decisionBody.includes("/")).toBe(false)
  })

  it("refuses on `>` and not on `>=`, so the allowance itself is admitted", () => {
    // The behavioural pair at 31,608 / 31,609 already pins this. Asserting it structurally as well
    // means a future edit to `>=` is caught by its cause and not only by its symptom.
    expect(decisionBody).toContain(">")
    expect(decisionBody.includes(">=")).toBe(false)
  })

  it("imports nothing from @/db — the pure/IO split is what makes the floor provable", () => {
    expect(strippedSource.includes("@/db")).toBe(false)
    expect(strippedSource.includes("drizzle")).toBe(false)
    // Anti-vacuity: this is the module we think it is.
    expect(strippedSource).toContain("decideSelectivity")
    expect(strippedSource).toContain("exportAllowance")
  })

  it("contains NO admin gate and NO role token — the E-9 invariant, asserted one module away", () => {
    // `view-filters.test.ts:736-747` asserts exactly this of `src/lib/views/export-action.ts`, with
    // a message ending: "An admin gate added here would silently un-widen a recorded widening, and
    // it would do so invisibly, because this deployment's two admin accounts would still pass every
    // test."
    //
    // THIS CELL EXISTS BECAUSE THAT GATE CAN BE KEPT GREEN BY MOVING THE BRANCH. Relocating the
    // admin check into this module would satisfy `export-action.ts`'s gate to the letter while
    // destroying the invariant it guards — gate-laundering. `src/app/admin/export/actions.ts:16` is
    // already a separate role-gated unbounded export, so admins keep the path they have and the
    // view path is bounded for every authenticated user. The escape is now closed from both sides.
    expect(
      /["']admin["']/.test(strippedSource),
      `${MODULE_PATH} mentions the admin role. There is NO admin branch in this phase: ` +
        `view-filters.test.ts:736-747 forbids one in export-action.ts, and moving it here to keep ` +
        `that gate green would be gate-laundering. /admin/export is already a separate role-gated ` +
        `unbounded export.`
    ).toBe(false)
    expect(
      /\brole\b/.test(strippedSource),
      `${MODULE_PATH} mentions a role. The rule decides on (matched, total) alone; adding a viewer, ` +
        `a session or an isAdmin parameter to either function reopens what E-9 deliberately widened.`
    ).toBe(false)
    // Anti-vacuity: both negatives above would pass on an empty string.
    expect(strippedSource).toContain("decideSelectivity")
  })
})

/* ------------------------------------------------------------------------- *
 * DOCUMENTATION — over RAW source, and deliberately about prose.
 * ------------------------------------------------------------------------- */

describe("the constants document what is measured and what is not", () => {
  // RAW, UN-STRIPPED SOURCE, WHICH IS THE OPPOSITE OF EVERY CELL ABOVE AND IS INTENTIONAL. The
  // requirement here IS the comment: a threshold with no recorded provenance is a guess wearing a
  // control's clothes (`BATCH_SIZE = 200` is this repository's own precedent), and the only place a
  // provenance can live is prose. So this one cell reads the comments on purpose.
  //
  // IT IS NOT A BEHAVIOUR GATE, and nothing below should be read as one. Deleting these sentences
  // changes no arithmetic; it changes whether the next reader can tell 0.40 from a guess.
  const rawSource = readFileSync(MODULE_PATH, "utf8")

  it("really is reading raw source, comments included", () => {
    // Anti-vacuity, and the proof that this cell differs from the stripped-source cells above: raw
    // must be strictly longer, because the module has comments.
    expect(rawSource.length).toBeGreaterThan(readStrippedSource(MODULE_PATH).length)
    expect(rawSource).toContain("MIN_EXPORT_ROWS")
  })

  it("states plainly that MIN_EXPORT_ROWS is a policy floor and NOT a measurement", () => {
    // `NOT measured` is case-SENSITIVE on purpose: the emphasis is the point, and a lowercase
    // "not measured" buried mid-sentence is the footnote treatment this comment exists to avoid.
    // `policy floor` is case-insensitive because the module states it in capitals; demanding one
    // casing of a phrase whose job is to be read would be a gate about formatting.
    expect(rawSource).toMatch(/NOT measured/)
    expect(rawSource).toMatch(/policy floor/i)
    // The consequence, in arithmetic, so the claim is checkable rather than merely asserted: with
    // F = 1,000 and f = 0.40 the rule begins to bind only above 2,500 rows.
    expect(rawSource).toContain("2,500")
    // And the comment shape being deliberately avoided.
    expect(rawSource).toContain("BATCH_SIZE")
  })

  it("records the measurement behind MAX_EXPORT_FRACTION, both edges of the gap", () => {
    // The widest structured filter 0.40 ADMITS and the narrowest it REFUSES, with the band between
    // them — the difference between a measured threshold and a round number.
    expect(rawSource).toContain("29.00%")
    expect(rawSource).toContain("41.66%")
    expect(rawSource).toContain("12.66")
    // Why 0.50 was rejected: it sits 1.02 pp below `search=u`.
    expect(rawSource).toContain("51.02%")
  })

  it("names the filters 0.40 refuses and the escape hatch for them", () => {
    // A deliberate consequence recorded as one, rather than discovered by a user.
    expect(rawSource).toContain("35,821")
    expect(rawSource).toContain("33,529")
    expect(rawSource).toContain("10,495")
    expect(rawSource).toContain("dateFrom")
    expect(rawSource).toContain("dateTo")
  })
})
