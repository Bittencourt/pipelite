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

---

## DEF-50-06 — the two-counts justification cites a measurement that does not reproduce

**Found by:** 50-04, which measured rather than inheriting.

`50-RESEARCH.md` states that one combined `count(*) FILTER (WHERE …)` aggregate takes **93.5 ms** against
two separate counts at 46.1 + 13.0 ms, on the reasoning that the FILTER form "loses the scan's
short-circuit". Re-measured, three runs each: filtered **~47 ms**, unfiltered **~12.9 ms**, combined
**~47 ms**. The combined form is therefore **~13 ms FASTER**, not 34 ms slower, and the stated mechanism
describes neither query plan.

**Two counts were KEPT** — constraint 5 locks them and the decision is not reopened here — but 50-04
refused to write the false justification into the source. `export-count.ts` §2 carries the measured
figures and names the error.

**Suggested owner:** whoever next touches the count path. Either re-justify two counts on a true
measurement, or switch to the combined form. Do not repeat the 93.5 ms figure.

---

## DEF-50-07 — there are ZERO soft-deleted rows in the whole database, so every `deleted_at` predicate is behaviourally untestable

**Found by:** 50-04, while trying to drive an ablation that turned out undrivable. **Verified
independently by the orchestrator, 2026-08-27:**

| table | soft-deleted | total |
|---|---|---|
| organizations | **0** | 46,054 |
| people | **0** | 38,348 |
| deals | **0** | 25,195 |
| activities | **0** | 79,022 |

**Consequence, and it generalises far past the export path.** `count(*)` and
`count(*) where deleted_at is null` return the same number on every one of these tables, so **dropping
an `isNull(deletedAt)` term from any predicate leaves a live-data proof fully green.** Any test that
claims to verify soft-delete filtering against this database is vacuous — it passes because the
distinguishing rows do not exist, not because the code is right.

50-04's response is the correct pattern: it added a **structural** detector that can fire, and
relabelled its live cells so they stop reading as coverage they do not provide.

**Suggested owner:** this is a fixture/seed question, not a code defect — either seed soft-deleted rows
into the live development database, or accept that `deleted_at` behaviour is provable only structurally
or in an isolated database that seeds them. **Phases 51-54 will write live tests and must not assume
otherwise.**

---

## DEF-50-08 — two ablations produce identical failure signatures

**Found by:** 50-04.

Ablations 1 and 3 produce the *same* assertion output, so the affected cells detect that the
count-versus-export equality is broken but **cannot diagnose which side moved.** Not a vacuity — the
gate fires correctly — but a diagnosability gap worth knowing before someone debugs it under pressure.

---

## DEF-50-09 — a new refusal code can ship server-only and nothing reddens; the user sees "Failed to export"

**Found by:** 50-05, when the plan's predicted pre-Task-2 red **did not exist** (fully green after
Task 1).

`tsc` does not enforce exhaustiveness on the refusal-code chain, because it ends in an unconditional
fallback, and the wiring gate reads *source* rather than resolving the branch. So adding a refusal code
and shipping only the server half **reddens nothing** — the user silently receives the generic
"Failed to export" instead of the actionable message SC-3 requires. Threat T-50-05-09, realised.

The only thing standing in the way today is the **hand-maintained `EXPORT_KEYS` array**.

**Suggested owner:** a plan that makes the code→string mapping exhaustive by construction — a
`Record<RefusalCode, MessageKey>` the compiler must complete, rather than a chain with a fallback.

---

## DEF-50-10 — four private copies of the id parser, under two different names

**Found by:** 50-05, whose cell went red against correct code until the parser name became a per-site
column rather than a constant.

`parseIdList` in the organizations action; `parseBulkIds` in the other three. Same job, four
implementations, two names. Not a defect today — noted because the next person to change id parsing
will find three of the four.

---

## DEF-50-11 — the admin export's role refusal has exactly one detector, and 50-05 wrote it

**Found by:** 50-05.

Removing the role refusal from `src/app/admin/export/actions.ts` reddened **only** the cell 50-05
added. Before this phase, nothing covered it. Worth knowing because that role gate is now load-bearing
for the whole no-admin-branch decision: the view path is bounded for everyone precisely *because*
admins have that separate gated path. If its guard regresses, the design's escape hatch opens to
everyone.

---

## PROCESS-50-A — `git checkout -- <file>` after an ablation: four recorded losses and counting

**Instances:** three in Phase 49 (plans 49-03, 49-04, and one more), one in Phase 50 (50-05) — the last
despite a bold warning in the execution brief.

The pattern is always the same: an executor ablates a **tracked** file to drive a red, then restores it
with `git checkout -- <file>`, and loses whatever **uncommitted** work was in that file.

**The rule is mechanical, not attitudinal** (50-05's phrasing, and it is right): *never restore a file
whose new content is not already in a commit.* Sequence that works: write → **commit** → ablate →
restore → re-run.

**Warning executors about it has now failed four times.** The durable fix belongs in the plan
templates' verify blocks, not in the orchestrator's prose — a plan that orders an ablation should order
the commit immediately before it.
