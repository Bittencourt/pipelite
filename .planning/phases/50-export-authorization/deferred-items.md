# Phase 50 — Deferred Items

> **Numbering note.** Plans 50-01 and 50-02 completed in the same wave and both minted the id
> `DEF-50-01` independently. Disambiguated here by the orchestrator on merge: 50-01's measurement
> delta keeps **DEF-50-01**, 50-02's unenforced tally becomes **DEF-50-02**. Both SUMMARYs are
> annotated in place rather than rewritten.

---

## DEF-50-01 — `50-RESEARCH.md:774` states the 0.40 activities allowance as 31,609; it is 31,608

**Found by:** 50-01 Task 1, at the third re-measurement.

That column was computed with `Math.round`. The locked rule is
`max(MIN_EXPORT_ROWS, floor(total * MAX_EXPORT_FRACTION))` — **`floor`** — so on 79,022 activities the
allowance is **31,608**, and **31,609 is the smallest REFUSED count**, not the allowance.

**Why it matters rather than being a rounding nit:** a later plan copying 31,609 as "the allowance"
would have gone **red against correct code**. 50-04 and 50-06 both consume this number. Both integers
are now asserted adjacently so the boundary is unambiguous. Recorded in `50-MEASUREMENTS.md` as
DELTA D-1.

**Status:** the number is corrected in the measurements file and flagged to the two consuming plans.
`50-RESEARCH.md:774` itself is left as written — the research is a historical document and the
correction lives where the consumers read.

---

## DEF-50-02 — the `REQUIRED_VIEWS_KEYS` per-group tally is unenforced, and its comment says otherwise

**Found by:** 50-02 Task 2 (originally minted as `DEF-50-01`; renumbered on merge).

`locale-parity.test.ts:1246`'s comment claims the per-group tally "stops that sum drifting silently."
**It does not.** Reverting the tally to `Export — 3` / `18+22+13+5+3` left **all 22 parity tests plus
191 tests across every parity-referencing file green.** There is no detector.

The tally was left **correct**; what is recorded is the **overstatement in the comment**. A comment
asserting a protection that does not exist is the same class of defect this milestone has been
removing all along — nineteen instances found in v1.4 — and it is worse than no comment, because a
future reader will trust it.

**Suggested owner:** a plan that either adds the missing detector (parse the group headings, sum the
declared counts, compare against the array length) or corrects the comment to say the tally is
maintained by hand. Do not simply delete the tally.

---

## DEF-50-03 — `{matched}` is NOT locale-formatted, and three upstream documents said it was

**Found by:** 50-02, which measured it both ways rather than accepting the premise.

`50-RESEARCH.md` §6, `50-02-PLAN.md`, and the orchestrator's own execution brief all asserted that
`use-intl` locale-formats the interpolated numbers, so `toContain("44254")` would fail against correct
code. **It is exactly backwards.** `{matched}` is a *simple* ICU argument — stringified, not formatted.
`Intl.NumberFormat` applies only to the typed form `{matched, number}`. Measured en-US output:

```
This filter matches 44254 of 46054 records — too many to export. Narrow it and try again.
```

So the assertion that fails against correct code is the **locale-formatted** one, and 50-02 drove that
as its red instead.

**A consequence worth keeping, because the obvious "fix" is a trap:** switching the copy to
`{matched, number}` to get formatting would make the placeholder **invisible** to `placeholderDrift`'s
`/\{[a-zA-Z0-9_]+\}/g`, silently dropping the only two-placeholder `views` key from a shipped gate.
50-02 kept the simple form and pinned the choice with a tripwire cell.

**Status:** recorded as an open **copy** question — whether the numbers *should* be locale-formatted is
a product call, and taking it would require the placeholder gate to learn the typed form first.
Later plans and 50-08 must not repeat the inverted claim.

---

## DEF-50-04 — `use-intl`'s missing-value behaviour is build-dependent

**Found by:** 50-02.

A dev build returns the **key path** (`views.export.tooBroad`) for a missing value — Phase 45's finding
— while a prod build returns the **template** with `{matched}` intact. Different cells catch each, and
the brace cell passes **vacuously** under dev. 50-02 kept both cells for that reason.

Worth knowing for any future locale assertion in this repo: a single cell cannot cover both builds.

---

## DEF-50-05 — the `(0, 0)` allowance cell cannot detect a division, and neither could its NaN sweep

**Found by:** 50-01, in its own plan's specification.

The plan named `(0, 0)` as the no-division detector. It cannot be one: `0/0` is `NaN`, and
`NaN > 0.4` is **false**, so a division **admits** and the cell stays green. Ablation 2's transcript
shows `(0,0)` green while four other cells fell. The companion NaN sweep was vacuous for a second
reason — `{ ok: true }` has no numeric fields, so it iterated an **empty set**.

**Fixed in-plan, not deferred:** a `(1, 0)` cell is now the real discriminator (correct → admitted;
floor deleted → refused; division → `Infinity > 0.4` → refused), the NaN sweep moved onto a refused
payload with three real numeric fields, and `(0,0)` is labelled honestly in the file rather than left
reading as evidence. Listed here so the reasoning survives.

---

## Carried forward, not this phase's work

**`EXPORT_ROW_CAP` must NOT be removed.** 50-01 measured that the 0.40 rule makes it unreachable below
**125,003** rows, including its one live branch (activities `status=completed`, 74,857). It is defence
in depth and fires again as tables grow. 50-08 should check whether `view-filters.test.ts:766-773` now
pins a property with no live consequence — that is its stated one-hop-outside candidate — but the
constant stays.

**`STATE.md:30`'s suite baseline is stale.** Both plans measured it independently: the true figures at
wave 1's dispatch were 5,696 base over 185 files and 299 db at EXIT 0, against STATE's older numbers.
The orchestrator owns STATE.md and updates it per wave.
