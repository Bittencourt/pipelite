/**
 * THE MINIMUM SELECTIVITY RULE (SEC-03). REFUSE AN EXPORT THAT NARROWS ALMOST NOTHING.
 *
 * `guardExportInput` (`./view-export-guard.ts:128-139`) treats the PRESENCE of a filter as
 * authorization. `search=a` is a filter, so it passes — and it matches 44,254 of 46,054
 * organizations, 96.09% of the customer table, re-measured against the live database on 2026-08-27
 * (`.planning/phases/50-export-authorization/50-MEASUREMENTS.md` §2). This module is the arithmetic
 * that refuses it, and nothing else: no call site, no query, no session.
 *
 * ── 1. WHY THE ARITHMETIC IS HERE AND THE COUNT IS NOT ───────────────────────────────────────────
 *
 * `view-export-guard.ts:18-19` states the property this split exists to preserve, verbatim:
 *
 *   "NO DATABASE IMPORT, and that is a property worth keeping: everything here is decidable from
 *    the submitted filter map alone, which is what makes the refusal happen BEFORE any query runs."
 *
 * A cardinality rule needs I/O, and making `guardExportInput` async to accommodate it would destroy
 * that property three times over: it would force an `await` onto ~40 existing synchronous assertions
 * in `__tests__/view-filters.test.ts:575-708`, it would lose the guarantee that a crafted
 * `entityType` is refused with zero queries, and it would put a database import behind a function
 * whose own header promises there is none.
 *
 * So the decision splits in two. The ARITHMETIC lives here — pure, synchronous, `(matched, total)`
 * in and a verdict out. The COUNT lives in `export-count.ts` (plan 50-04), which imports the
 * database and is the only half that can be slow or fail. Two files rather than one, on purpose.
 *
 * ── 2. WHY THAT SPLIT IS WHAT MAKES THE FLOOR PROVABLE AT ALL ────────────────────────────────────
 *
 * `MIN_EXPORT_ROWS` guards a branch that NO DATABASE IN THIS REPOSITORY CAN REACH. Every live table
 * is at least 25,195 rows (organizations 46,054 · people 38,348 · deals 25,195 · activities 79,022),
 * and `pipelite_dedup_test` is provisioned `--schema-only` and starts EMPTY — so a selectivity
 * assertion placed in the db project without seeding passes vacuously, and one placed against live
 * data never gets below 2,500 rows where the floor begins to matter.
 *
 * A pure function with injected values is therefore the ONLY instrument that reaches it, and
 * `__tests__/export-selectivity.test.ts` is where the reach happens. That plan's ablation 1 is the
 * evidence rather than the claim: with `MIN_EXPORT_ROWS` deleted, every live-anchored cell in that
 * file stays GREEN and only the small-N cells go red.
 *
 * ── 3. NO ADMIN BRANCH, AND THIS FILE ASSERTS ITS OWN ABSENCE OF ONE ─────────────────────────────
 *
 * `__tests__/view-filters.test.ts:736-747` asserts, over comment-stripped source of
 * `src/lib/views/export-action.ts`, that `/["']admin["']/` and `/\brole\b/` are both ABSENT, with a
 * message ending: "An admin gate added here would silently un-widen a recorded widening, and it
 * would do so invisibly, because this deployment's two admin accounts would still pass every test."
 * That gate stays GREEN and UNMODIFIED.
 *
 * The escape it leaves open is relocation: an admin branch moved INTO this module would satisfy that
 * gate to the letter while destroying the invariant it guards. That is gate-laundering, so
 * `__tests__/export-selectivity.test.ts` asserts the same two negatives of this file. Closed from
 * both sides.
 *
 * Nothing is lost by it. `src/app/admin/export/actions.ts:16` is ALREADY a separate role-gated
 * unbounded export (`!== "admin"` → "Not authorized", then an uncapped `fetchFilteredData`), so
 * admins keep the path they have, and the view path is bounded for every authenticated user.
 *
 * ── 4. AND WHY THE PURE ADMIN GATE WAS NOT THE FIX ───────────────────────────────────────────────
 *
 * SC-2 rules it out: "a legitimately narrow export still completes for the same non-admin, so the
 * fix is a bound and not a removal of the feature." Restoring Phase 38's admin gate REMOVES the
 * feature for non-admins; it cannot satisfy SC-2 no matter how it is spelled. A non-admin row cap
 * cannot either — it is an absolute bound where the requirement is relative. Set it low and
 * legitimate mid-size exports break; set it at 10,000 and 22% of the customer table still walks out.
 * A fraction of the live table is the only one of the three candidates that distinguishes a narrow
 * export from a broad one, which is the distinction the requirement is about.
 */

/**
 * The largest fraction of a table a single view export may return.
 *
 * MEASURED. Thirty filters were measured against the live database and sorted by selectivity
 * (50-RESEARCH §4, re-confirmed 2026-08-27); 0.40 sits inside the widest empty band in that
 * distribution:
 *
 *   the widest STRUCTURED filter it ADMITS   organization `search=ltda`   13,355 / 46,054 = 29.00%
 *   ────────── a 12.66 pp gap, containing no structured filter at all ──────────
 *   the narrowest STRUCTURED filter it REFUSES   deal `stage=FlyWheel`    10,495 / 25,195 = 41.66%
 *
 * A threshold anywhere in that 12.66 pp band admits and refuses exactly the same real filters, so
 * the distribution — not a preference — chose the band. Picking 0.40 rather than 0.35 inside it is a
 * judgement, and a free one.
 *
 * WHY NOT 0.50. It sits 1.02 pp below organization `search=u` (23,495 / 46,054 = 51.02%), the
 * narrowest purely degenerate filter measured. A threshold with a 1 pp margin to the nearest thing
 * it must catch will be crossed by the next dataset, and then a single-character search walks out
 * half the table again.
 *
 * WHAT 0.40 REFUSES THAT A USER MIGHT DEFEND — a deliberate, recorded consequence, not an oversight:
 *
 *   activity `type=Call`      35,821 / 79,022 = 45.33%
 *   activity `type=Task`      33,529 / 79,022 = 42.43%
 *   deal `stage=FlyWheel`     10,495 / 25,195 = 41.66%
 *
 * An export of 35,821 activities IS what SEC-03 is about, whatever names it by. The escape hatch is
 * one click away and already built: `dateFrom` and `dateTo` are exportable keys on both activities
 * and deals, so narrowing "every Call" to "every Call this quarter" needs no new feature.
 */
export const MAX_EXPORT_FRACTION = 0.4

/**
 * The number of rows any export may return regardless of how small the table is.
 *
 * **A POLICY FLOOR, chosen. NOT measured — and this comment exists to say so.**
 *
 * No measurement is possible from this deployment. The smallest live table is 25,195 rows and the
 * smallest exportable set measured anywhere in the distribution is 14 rows (activity
 * `status=pending`), which the fraction admits on its own. There is no observation here that could
 * distinguish 1,000 from 500 or from 5,000, so the number is a judgement about OTHER deployments and
 * is recorded as one.
 *
 * WHAT IT IS FOR. A pure fraction rule is wrong on a small install and wrong in the SC-2 direction:
 * on a self-hosted instance with 800 organizations it refuses an export of 400 of them — half of a
 * table small enough to read in a spreadsheet, and a table with nothing in it worth protecting at
 * this scale. That is a broken product on every deployment that is not this one.
 *
 * THE CONSEQUENCE, IN ARITHMETIC. With F = 1,000 and f = 0.40, the fraction only exceeds the floor
 * above **2,500** rows (`floor(2,500 × 0.40) = 1,000`). So below 2,500 rows every export is
 * admitted, and above it the floor is inert. On today's data the fraction dominates all four tables
 * — 46,054 × 0.40 = 18,421 — and the floor never decides anything.
 *
 * THE COMMENT SHAPE THIS DELIBERATELY AVOIDS. Phase 46's `BATCH_SIZE = 200` admits in its own
 * comment that it "has not been measured" and was "chosen to keep one batch well under a second of
 * database work rather than from a measurement" — and then reads, in every later citation, as though
 * it were a finding. The failure is not the missing measurement; it is that the absence is a
 * footnote instead of the fact. Here the absence IS the fact: no measurement exists, this is a
 * judgement, and the only proof it will ever have is the unit cells in
 * `__tests__/export-selectivity.test.ts` that inject values no database here can produce.
 */
export const MIN_EXPORT_ROWS = 1_000

/**
 * The most rows an export from a `total`-row table may return.
 *
 * WHY THIS IS A MULTIPLICATION AND NEVER A DIVISION. The obvious spelling of a fraction rule is
 * `matched / total > MAX_EXPORT_FRACTION`, and it has two holes at the same place:
 *
 *   - at `total = 0` a division is `NaN`, and `NaN` compares false against every threshold — so an
 *     empty table admits everything, silently, through a comparison that looks correct;
 *   - a pure fraction with no floor gives allowance 0 at `total = 0`, and `0 > 0` is false — so an
 *     empty table admits everything again, by a second route.
 *
 * Expressed as `max(MIN_EXPORT_ROWS, floor(total × MAX_EXPORT_FRACTION))` the empty table needs no
 * special case at all: the allowance is `MIN_EXPORT_ROWS`, there is nothing to divide, and there is
 * no branch to forget. `__tests__/export-selectivity.test.ts` asserts structurally, over the parsed
 * body of this function, that no `/` appears in it.
 *
 * `floor` and not `round`: rounding up would admit one row more than the fraction permits on every
 * total whose 40% has a fractional part at or above 0.5 — `floor(79,022 × 0.40)` is **31,608** where
 * `round` gives 31,609. (50-RESEARCH §8's allowance column used `round`, so it states 31,609. The
 * rule is `floor`, the allowance is 31,608, and 31,609 is the smallest REFUSED count. Corrected in
 * `50-MEASUREMENTS.md` DELTA item D-1.)
 */
export function exportAllowance(total: number): number {
  return Math.max(MIN_EXPORT_ROWS, Math.floor(total * MAX_EXPORT_FRACTION))
}

/**
 * The verdict, with the numbers a refusal has to explain itself.
 *
 * The refusal carries `matched`, `total` and `allowance` rather than a bare boolean because SC-3
 * needs an actionable message and Phase 40 already had to reword this string once: G-2 found
 * `views.export.disabledReason` saying "Choose at least one filter first" in the one case where the
 * user HAD chosen a filter. A payload reduced to `false` makes that regression unavoidable.
 */
export type SelectivityDecision =
  | { ok: true }
  | { ok: false; matched: number; total: number; allowance: number }

/**
 * MAY THIS MANY ROWS LEAVE, OUT OF THIS MANY? Pure, synchronous, no I/O, no viewer, no session.
 *
 * REFUSES IFF `matched > exportAllowance(total)` — strictly greater, never `>=`. The allowance is
 * the largest ADMITTED value, so an export of exactly 31,608 of 79,022 activities completes and one
 * of 31,609 does not. The unit file pins both sides of that, because a single at-the-boundary
 * assertion cannot tell the two operators apart.
 *
 * The allowance comes from `exportAllowance` rather than being recomputed here, so there is exactly
 * one place the rule is written and no way for the verdict and the reported allowance to disagree
 * about what it is.
 */
export function decideSelectivity(input: { matched: number; total: number }): SelectivityDecision {
  const allowance = exportAllowance(input.total)

  if (input.matched > allowance) {
    return { ok: false, matched: input.matched, total: input.total, allowance }
  }

  return { ok: true }
}
