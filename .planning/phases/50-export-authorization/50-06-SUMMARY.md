---
phase: 50-export-authorization
plan: 06
subsystem: testing
tags: [export, selectivity, audit-log, live-data, postgres, vitest, papaparse, sec-03]

requires:
  - phase: 50-01
    provides: "decideSelectivity / exportAllowance / MAX_EXPORT_FRACTION — the arithmetic the ladder crosses"
  - phase: 50-02
    provides: "views.export.tooBroad and the numbered refusal string"
  - phase: 50-03
    provides: "vitest.live.config.ts, the -live exclusion from the base project, and the measured swallow in recordExport"
  - phase: 50-04
    provides: "countExportMatches, buildExportConditions, and the count-equality cells this file extends"
  - phase: 50-05
    provides: "the too_broad wiring in exportViewResults — the thing driven end to end here"
provides:
  - "SC-1 proven at live scale: search=a REFUSED at 44,254 / 46,054 for an asserted non-admin member"
  - "SC-1's real worst case proven: deal + owner REFUSED at 25,195 / 25,195 = 100.00%, under the 50,000 cap"
  - "SC-2 proven: search=ltda still completes with 13,355 parsed CSV data rows, plus a second entity and an empty-result case"
  - "SC-4 proven: nine widening dateTo steps, strictly increasing, exactly one flip at asserted index 7, both bracket steps driven end to end"
  - "SC-5 proven as a fresh POSITIVE observation: audit_log 214 -> 215 and entity_type='export' 0 -> 1, contents asserted, deleted by id"
  - "Seven ablation transcripts (six planned + one added) with actual numbers, including the case no structural gate can see"
affects: [50-VERIFICATION, phase-50 sign-off, WR-04 backlog entry, any future change to MAX_EXPORT_FRACTION or recordExport]

tech-stack:
  added: []
  patterns:
    - "The ladder-as-one-cell: an array of measured steps walked in a single `it`, asserted with one `toEqual` over the whole sequence so a failure prints the entire walk"
    - "The flip INDEX as a named constant, not the mere presence of both outcomes"
    - "The positive audit observation: 0 -> 1 read back, contents asserted, deleted by the id read back, absence re-asserted"
    - "Ablation 5b — leaving a call in place and making it fail internally — to separate what a structural gate can see from what only a behavioural read can"

key-files:
  created: []
  modified:
    - "src/lib/export/export-selectivity-live.test.ts"

key-decisions:
  - "Used 50-06-PLAN's NINE-step ladder (last admitted 2023-06-11) rather than 50-MEASUREMENTS §7's EIGHT-step table (last admitted 2023-06-09); both bracket the same 31,530 -> 31,612 crossing, but 06-11 is the LAST admitted date so the bracket is two ADJACENT calendar days"
  - "Added ablation 5b (recordExport left in place but throwing) because ablation 5 as specified is caught by a structural gate and therefore cannot demonstrate what only SC-5 can see"
  - "Ran ablation 6 in two forms: 6b (flip moved by one step, isolating) and 6a (the plan's literal one-day shift, which reddens loudly but never reaches the flip-index assertion)"
  - "Deleted every probe row and every ablation-leaked row by its own id, read back first; never by entity_type"

patterns-established:
  - "Ablation cleanup discipline for a WRITING live suite: after every red run, read the leaked audit rows back WITH their contents, record the contents as the ablation's evidence, then delete by id"
  - "The leaked audit rows ARE the disclosure measurement — ablation 1's rows record exactly how many organizations and activities walked out"

requirements-completed: [SEC-03]

duration: ~95min across two sittings
completed: 2026-08-28
---

# Phase 50 Plan 06: SC-1, SC-2, SC-4 and SC-5 at Live Scale Summary

**The bound was driven end to end against 46,054 real organizations and 79,022 real activities as an asserted non-admin member: the near-whole-table export refused with both numbers in the refusal, the narrow one still producing 13,355 rows of CSV, the threshold approached over nine widening steps and crossed exactly once at an asserted index, and this deployment's first-ever export audit row observed going 0 → 1 and taken back out by its own id — then every one of those four criteria broken on purpose and watched fail.**

## HOW THIS PLAN WAS EXECUTED: TWO SITTINGS, ONE SPEND-LIMIT STOP

This plan was executed by **two different executors**, and the record should say so plainly.

**Task 1 was written by an earlier executor** (worktree `agent-ad2731dbbf19fa01d`), which committed
`01a7ae4 test(50-06): SC-1 and SC-2 driven end to end through exportViewResults at live scale`
— 681 lines added to `src/lib/export/export-selectivity-live.test.ts`. That executor was then
**terminated mid-Task-2 by an organisation spend limit.** That is an INFRASTRUCTURE STOP, not a
failure and not a defect in the work: its last words were *"Now Task 2. Appending the SC-4 walk and
SC-5 observation."*, and everything it had committed was complete and green. The orchestrator
independently re-verified Task 1 (`vitest run --config vitest.live.config.ts
src/lib/export/export-selectivity-live.test.ts` → green, exit 0), confirmed `audit_log` was at
214 / 0 both before and after that run — i.e. Task 1 cleans up after itself — and merged it
(`1d6b530`).

**This executor did Task 2 only**, on top of that merge, and wrote this SUMMARY covering both. Task 1
was NOT redone, and its content is described below from the committed file rather than from the
plan's intent.

## Performance

- **Duration:** ~95 min of executor time across two sittings (Task 1 by the earlier executor; Task 2 ≈ 50 min here)
- **Tasks:** 2 of 2
- **Files modified:** 1 (`src/lib/export/export-selectivity-live.test.ts`)
- **Cells in the file:** 31 after Task 1 → **37** after Task 2
- **Ablations run:** 7 (six planned, one added), every one preceded by its own commit

## Task Commits

1. **Task 1: SC-1 and SC-2 end to end** — `01a7ae4` (test) — *by the earlier executor, merged as `1d6b530`*
2. **Task 2: SC-4's crossing, SC-5's first-ever audit row, and the seven ablations** — `e41d489` (test)

## THE GREEN TRANSCRIPT — AND IT PROVES NOTHING ON ITS OWN

Every cell in this file passed on its first execution. It had to: the fix landed in 50-05, so the
file describes working code. **A first-run green is a description, not a proof.** What makes these
cells evidence is the seven ablation transcripts below. This is stated first, before the numbers,
because the numbers read like a proof and are not one by themselves.

```
 RUN  v4.1.11
 Test Files  1 passed (1)
      Tests  37 passed (37)
   Duration  6.19s
```

Per-cell, the six Task 2 additions:

```
 ✓ SC-4 … > PRE-FLIGHT: the actor is still an asserted `member`, and no due_date is null            1ms
 ✓ SC-4 … > THE WALK: nine steps, strictly increasing, a constant denominator, and ONE flip at index 7   160ms
 ✓ SC-4 … > THE CROSSING, ADMIT SIDE, END TO END: dateTo=2023-06-11 COMPLETES with 31,530 rows      1240ms
 ✓ SC-4 … > THE CROSSING, REFUSE SIDE, END TO END: dateTo=2023-06-12 is `too_broad` at 31,612 / 79,022  82ms
 ✓ SC-5 … > THE POSITIVE OBSERVATION: 214 -> 215 total, 0 -> 1 export, contents asserted, deleted by id  706ms
 ✓ SC-5 … > THE NEGATIVE HALF: a REFUSED export writes NO row — the WR-04 limitation, restated      106ms
```

## THE ACTOR

Resolved by SQL rather than hard-coded, and its `role` asserted before any cell used it:

```
                  id                  |            email             |  role  |  status
--------------------------------------+------------------------------+--------+----------
 bc79ecfe-0f9f-4772-bf8f-1ce9a184179f | pedrobittencourt87@gmail.com | member | approved
```

**NOT `emily.davis@pipelite.local`**, which `50-06-PLAN.md`'s interfaces section predicted. Task 1's
executor found and recorded why: `emily.davis@pipelite.local` is soft-deleted, along with five of the
seven `pipelite.local` members, so the plan's own `deleted_at is null` term excludes it. **The plan's
SQL was right; the plan's predicted answer was wrong.** Reading the row instead of hard-coding the
uuid is exactly what made that visible — and this is the second time in this phase that reading beat
predicting.

The deployment has **two admins** among ten users, asserted in a pre-flight cell, so "we ran as a
member" is a CHOICE rather than a tautology.

## WHAT TASK 1 ACTUALLY PROVED (read from the committed file, not from the plan)

Task 1 added 19 cells across a new `describe` and extended the file header with five claims. What it
demonstrably established:

- **The session mock is LIVE, and this is the cell the rest of the file rests on.** An empty filter
  map returns `{ success: false, error: "refused" }` — the pre-existing guard's verdict, reached
  THROUGH an authenticated session. Then it clears the session and the SAME call returns
  `unauthenticated`, a DIFFERENT literal, and restores the session before asserting. Without this
  pair, every refusal in the file could have been the auth guard's, and the file would be proving
  `auth()` rather than SEC-03.
- **SC-1.** `organization` + `search=a` → `toEqual({ success: false, error: "too_broad", matched: 44254, total: 46054 })`,
  with `"data" in result`, `"filename" in result` and `"count" in result` all asserted FALSE — no CSV
  was serialised, so the 44,254 rows were never read.
- **SC-1's real worst case**, and it is not the roadmap's example. `deal` + `owner=ef4acac9-…` →
  refused at **25,195 of 25,195 = 100.00%**, asserted `< EXPORT_ROW_CAP`. A pre-flight cell measures
  `count(distinct owner_id) = 1` first, so the 100% is a premise that was checked rather than a
  coincidence. Before this phase a member could have exported every deal in the business — all of them
  the admin `prbitt@gmail.com`'s — through a whitelisted key, with the cap never firing.
- **The cap's handover.** `activity` + `status=completed` → `too_broad` with 74,857 / 79,022, and
  explicitly `.not.toBe("too_many")`. Plus the cap's exact re-entry threshold asserted from both
  sides: `exportAllowance(125_003) > EXPORT_ROW_CAP` and `exportAllowance(125_002) <= EXPORT_ROW_CAP`.
- **SC-2 on three surfaces.** `search=ltda` → `success: true`, `count` 13,355, `Papa.parse` yielding
  `errors: []` and exactly 13,355 data rows (parsed, not line-counted — notes carry embedded newlines
  in quoted cells); `activity type=Meeting` → 2,993; `search=zzzz` → 0 rows and `data === ""`.
- **The write discipline, and it changed the file's own header.** 50-04's cells were read-only and the
  header said so; Task 1 deleted that claim rather than leaving it stale, because an admitted export
  now writes an `audit_log` row. Each admitted cell takes its row straight back out via
  `takeExportAuditRows`, which reads on `entity_type='export' AND actor_user_id = <this member>` and
  deletes on the IDS THAT READ PRODUCED.
- **DEF-50-01 pinned adjacently:** `exportAllowance(79_022) === 31_608` and
  `ACTIVITY_SMALLEST_REFUSED === ACTIVITY_ALLOWANCE + 1`, with both verdicts asserted, so a later plan
  copying `50-RESEARCH.md:774`'s `Math.round`-derived 31,609 as "the allowance" goes RED against
  correct code.

## TASK 2 — SC-4: THE LADDER, AS OBSERVED

Nine `dateTo` steps on activities. Every integer below was **re-measured by direct SQL at the start of
Task 2**, independently of `countExportMatches`, before a line of the cell was written:

| # | `dateTo` | matched | delta | pct | verdict (allowance 31,608) |
|---|---|---|---|---|---|
| 0 | 2023-01-18 | 22,111 | — | 27.98% | admitted |
| 1 | 2023-02-09 | 23,683 | +1,572 | 29.97% | admitted |
| 2 | 2023-03-10 | 26,200 | +2,517 | 33.16% | admitted |
| 3 | 2023-04-15 | 28,942 | +2,742 | 36.63% | admitted |
| 4 | 2023-05-15 | 30,117 | +1,175 | 38.11% | admitted |
| 5 | 2023-06-08 | 31,479 | +1,362 | 39.84% | admitted |
| 6 | **2023-06-11** | **31,530** | +51 | 39.90% | **LAST ADMITTED** |
| 7 | **2023-06-12** | **31,612** | +82 | 40.00% | **FIRST REFUSED** |
| 8 | 2023-06-13 | 31,679 | +67 | 40.09% | refused |

Asserted, in this order, in one cell so a failure prints the whole walk:

- the whole `{dateTo, matched}` sequence by a single `toEqual`;
- `matched` **strictly increasing**, and the delta array pinned as named integers — `every(d > 0)`
  alone would be satisfied by a ladder whose counts had all drifted;
- `total` **constant at 79,022** across all nine steps (`[...new Set(totals)]` is one element) — the
  denominator does not move while the numerator does, which is what makes the FRACTION the thing
  being crossed;
- the decision flips **exactly once** (`flips === 1`);
- **the flip INDEX is 7** — `verdicts.indexOf(false)`, which is `-1` and therefore red if nothing was
  ever refused;
- 7 admissions and 2 refusals;
- the bracket dates and counts, and the margins: `31,608 − 31,530 = 78` on the admit side,
  `31,612 − 31,608 = 4` on the refuse side. A 0.10 pp window.

**End to end at both bracket steps**, which is what "crossed" means:

- `dateTo=2023-06-11` → `success: true`, `count` **31,530**, `Papa.parse` → `errors: []` and 31,530
  data rows, `filename` matching `/^activities-\d{4}-\d{2}-\d{2}\.csv$/`. Its audit row carried
  `rowCount.to = 31530` and `filters.to = "dateTo=2023-06-11"`, and was removed by id.
- `dateTo=2023-06-12` → `toEqual({ success: false, error: "too_broad", matched: 31612, total: 79022 })`,
  no `data`, and `audit_log` unchanged.

The other seven steps are `countExportMatches` + `decideSelectivity` only, and the file says so in a
comment — nine CSVs of up to 31,679 activities would cost minutes and prove nothing the two bracket
cells do not.

**A pre-flight cell asserts `count(*) from activities where due_date is null` is 0.** Without it,
"widening" would be a claim about a subset: a single null `due_date` sits outside every step and the
ladder would not be a chain of nested supersets.

### The ladder discrepancy, resolved in the plan's favour — and recorded

`50-MEASUREMENTS.md` §7 prescribes an **eight**-step ladder ending `2023-06-09` (31,530) →
`2023-06-12`. `50-06-PLAN.md`'s interfaces table prescribes a **nine**-step ladder using
`2023-06-11` (31,530) in that slot plus a ninth step at `2023-06-13`. Both are strictly increasing
and both bracket the same 31,530 → 31,612 crossing.

**The plan's ladder was used.** 2023-06-09, -06-10 and -06-11 all return exactly 31,530 (re-confirmed
by SQL here — three consecutive daily widenings adding zero rows), and **06-11 is the LAST admitted
date**, so the plan's bracket is two ADJACENT calendar days rather than a three-day skip.
MEASUREMENTS' own instruction — *"do not insert 2023-06-10 or 2023-06-11 BETWEEN the last two"* — is
honoured: nothing is inserted between them, 06-11 REPLACES 06-09, and the flat run still contributes
exactly one step. Both tables are named in the file's header so the next reader does not have to
rediscover which one was followed.

## TASK 2 — SC-5: THE FIRST EXPORT AUDIT ROW THIS DEPLOYMENT HAS EVER HELD

`audit_log` held **214** rows and **zero** with `entity_type='export'` at the start of this plan,
verified by psql before Task 2 began. Plans 50-01 through 50-05 were each told to leave the table
alone precisely so this transition would be observed here.

Observed, in one cell, in this order:

| stage | `audit_log` total | `entity_type='export'` |
|---|---|---|
| floor, before | **214** | **0** |
| after the admitted `search=ltda` export | **215** | **1** |
| after the delete by id | **214** | **0** |

The row, read back and asserted field by field:

| field | value |
|---|---|
| `entity_type` | `export` |
| `action` | `created` |
| `actor_kind` | `user` |
| `actor_user_id` | `bc79ecfe-0f9f-4772-bf8f-1ce9a184179f` (the asserted member) |
| `entity_id` | a fresh uuid (shape-matched) |
| `workflow_run_id` / `import_session_id` | `null` / `null` |
| `changes.exportedEntityType` | `{ from: null, to: "organization" }` |
| `changes.filters` | `{ from: null, to: "search=ltda" }` |
| `changes.rowCount` | `{ from: null, to: 13355 }` |

**The `rowCount` cross-check is three-way and that is the point:** `changes.rowCount.to === result.count`
(the action's own return, same call) `=== Papa.parse(result.data).data.length` (the CSV's own row
count) `=== 13355` (the measured integer). A constant asserted against itself would prove nothing;
these are three independently-produced numbers.

**Deleted by the id read back, never by `entity_type`**, then the absence of THAT id specifically
asserted (`select … where id = <id>` → length 0), not merely the absence of the class. A delete
matched on `entity_type` would also remove a row a person's real export wrote while the suite ran —
destroying evidence AND masking a leak, because the suite would then report a clean table it had
itself emptied.

**Why nothing else in the repository can see this.** `recordExport` **swallows its own failure by
decision** (`export-events.ts:106-115` — failing a completed export because its audit row failed
would report a lie about the user's own data). So a `recordExport` that runs and silently fails is
invisible to `tsc`, to every structural gate, and to the action's own return value. Only an
instrument that READS THE ROW BACK can see it. **Ablation 5b below proves that claim rather than
asserting it.**

**The negative half, recorded as a LIMITATION and not as a win:** a refused export writes no row,
because `export-action.ts` returns `too_broad` before `recordExport`. Refused, capped and
guard-refused attempts therefore all write nothing, so `audit_log` is evidence of exports that
COMPLETED and **not of probing** — an attacker sweeping filters to find the widest admissible one
leaves no trace at all. That is WR-04's residual exposure. It stays OPEN in `BACKLOG.md` and is **not
closed by this phase**.

## THE ABLATIONS — SEVEN, WITH ACTUAL NUMBERS

**Every ablation was preceded by its own commit** (`e41d489` holds the Task 2 content; `1d6b530`
holds Task 1's and all production source). `git checkout -- <file>` was used for every restore, and
`git diff --exit-code -- src/` was clean after each. PROCESS-50-A's four recorded losses did not
become five.

Where an ablation admitted an export it had no business admitting, the leaked `audit_log` rows were
**read back with their contents first** — those contents are the disclosure measurement — and then
deleted **by id**. `audit_log` was verified back at 214 / 0 after every single ablation.

---

### Ablation 1 — delete the `decideSelectivity` call and the `too_broad` return entirely

`src/lib/views/export-action.ts`, the whole count-decide-refuse block removed.

**Live file: 10 failed / 27 passed of 37.**

```
FAIL SC-1: organization + search=a is REFUSED, carrying exactly 44,254 of 46,054
     AssertionError: expected { success: true, …(3) } to deeply equal { success: false, …(3) }
FAIL SC-1, THE WORST CASE: deal + owner is refused at 25,195 of 25,195
     AssertionError: expected { success: true, …(3) } to deeply equal { success: false, …(3) }
FAIL SC-1, THE CAP'S FORMER BRANCH: activity + status=completed is `too_broad`, NOT `too_many`
     AssertionError: expected { success: false, …(2) } to deeply equal { success: false, …(3) }
FAIL SC-4 THE CROSSING, REFUSE SIDE: dateTo=2023-06-12 is `too_broad` at 31,612 / 79,022
     AssertionError: expected { success: true, …(3) } to deeply equal { success: false, …(3) }
FAIL SC-5 THE POSITIVE OBSERVATION … expected 1 to be +0
FAIL SC-5 THE NEGATIVE HALF … expected true to be false
FAIL SC-1: a REFUSED export writes NO audit row … expected 3 to be +0
FAIL SC-2: search=ltda … expected […] to have a length of 1 but got 5
FAIL THIS SUITE WROTE NOTHING … expected 216 to be 214
FAIL PRE-FLIGHT: audit_log is at 214 rows with ZERO entity_type='export' … expected 216 to be 214
```

**WHAT ACTUALLY WALKED OUT.** The plan asked for `result.count`. Better than the diff: the audit rows
the ablated code wrote, read back from Postgres before cleanup, record it exactly —

```
                  id                  |    entity    | row_count |      filters
--------------------------------------+--------------+-----------+-------------------
 88a2e225-12ba-4556-b1dc-9250b18749e5 | activity     | 31612     | dateTo=2023-06-12
 8c14b480-47f7-4822-acbe-239baf31fcde | organization | 44254     | search=a
```

**44,254 organizations and 31,612 activities were serialised into real CSVs and returned to a
non-admin member.** That is the disclosure SEC-03 exists to prevent, reproduced and measured.

**The `status=completed` cell's diff is worth its own line:** it went from a 3-field payload to a
2-field one — `too_many`, with only `max`. **The cap re-emerged** the moment the selectivity rule was
removed, exactly as Task 1's comment predicted, and the user would have been told a limit instead of
"your filter matches 74,857 of 79,022 records".

**THE GREEN-VERSUS-RED CONTRAST — and the plan's prediction was WRONG.** The plan expected that
"everything in `view-filters.test.ts` should not [redden]". It does. The base suite under the same
sabotage:

```
 Test Files  188   Tests 5767   passed 5758   failed 5

src/lib/export/__tests__/export-call-sites.test.ts
  × 3a. site 1, the view export, is bounded by the guard AND by the selectivity refusal
      "src/lib/views/export-action.ts lost its countExportMatches call — SEC-03's bound has no
       numbers to decide on.": expected [] to have a length of 1 but got +0
  × 4. guardExportInput, countExportMatches and decideSelectivity have ONE production caller each
      expected [] to deeply equal [ 'src/lib/views/export-action.ts' ]

src/lib/export/__tests__/view-filters.test.ts
  × authenticates, then guards, then counts, then decides, then queries — in that order   (:1039)
      "never calls countExportMatches": expected -1 to be greater than -1
  × calls countExportMatches exactly once and decideSelectivity exactly once               (:1093)
      expected [] to have a length of 1 but got +0
  × the too_broad refusal returns the DECISION'S matched and total, and no literal 0       (:1125)
      expected [] to have a length of 1 but got +0
```

So **five structural cells across two files DO redden** on a wholesale deletion. The plan's line
reference (`view-filters.test.ts:736-812`) no longer points at the export-action gates at all — that
file has grown and the relevant `describe` now sits at ~1032-1230; lines 736-812 today are date-range
and guard cells, and those did stay green. **The honest contrast is therefore narrower than the plan
claimed:** a wholesale deletion is caught structurally; what the structural gates CANNOT catch is
ablation 4's zeroed payload against a source-shape reading, and — decisively — ablation 5b. Recorded
as a correction to the plan, not glossed.

Also green under ablation 1, and correctly so: `contains NO admin gate — E-9 …` (:1150),
`records the export AFTER the fetch …` (:1205), and **the SC-4 WALK cell itself** — the walk calls
`countExportMatches`/`decideSelectivity` directly, so it cannot see a wiring removal. Only the
end-to-end bracket cell can. Stated so nobody credits the walk with a detection it did not make.

---

### Ablation 2 — `MAX_EXPORT_FRACTION = 0.99`

**Live file: 11 failed / 26 passed.**

```
FAIL search=a composes to a REFUSAL … expected { ok: true } to deeply equal { ok: false, matched: 44254, …(2) }
FAIL the activities allowance is 31,608 … expected 78231 to be 31608
FAIL SC-1: search=a is REFUSED … expected { success: true, …(3) } to deeply equal { success: false, …(3) }
FAIL SC-1, THE WORST CASE … expected 24943 to be 10078      (the deals allowance)
FAIL SC-1, THE CAP'S FORMER BRANCH … expected { success: false, …(2) } to deeply equal { …(3) }
FAIL SC-2: search=ltda … expected […] to have a length of 1 but got 2
FAIL SC-4 THE WALK …
     the decision flipped 0 times across the ladder: [true,true,true,true,true,true,true,true,true].
     … zero would mean the threshold was never crossed and the "walk" observed nothing.
     expected +0 to be 1
FAIL SC-4 THE CROSSING, REFUSE SIDE … expected { success: true, …(3) } to deeply equal { …(3) }
FAIL SC-5 THE POSITIVE OBSERVATION … expected 1 to be +0
FAIL SC-5 THE NEGATIVE HALF … expected true to be false
```

**The walk reported ZERO flips and printed the whole verdict vector** — `[true ×9]`. That is the
assertion earning its place: a ladder that never crosses is a walk that observed nothing.

Leaked and cleaned by id: `44254 / search=a` and `31612 / dateTo=2023-06-12`. Back to 214 / 0.

---

### Ablation 3 — `MAX_EXPORT_FRACTION = 0.01`

**Live file: 10 failed / 27 passed.**

```
FAIL search=ltda composes to an ADMISSION … expected { ok: false, matched: 13355, …(2) } to deeply equal { ok: true }
FAIL the activities allowance is 31,608 … expected 1000 to be 31608      (MIN_EXPORT_ROWS now dominates)
FAIL SC-1, THE WORST CASE … expected 1000 to be 10078
FAIL SC-1, THE CAP'S FORMER BRANCH … expected 1250 to be greater than 50000
FAIL SC-2: search=ltda …
     "the narrow export was refused (too_broad). SC-2: the bound must BOUND the feature, not remove it."
     expected false to be true
FAIL SC-2, A SECOND SURFACE: activity + type=Meeting … expected false to be true
FAIL SC-4 THE CROSSING, ADMIT SIDE …
     "the last ADMITTED step of the ladder was refused (too_broad). 31,530 of 79,022 is 39.90%,
      78 rows UNDER the 31,608 allowance." expected false to be true
FAIL SC-4 THE WALK …
     the decision flipped 0 times across the ladder: [false,false,false,false,false,false,false,false,false]
FAIL SC-5 THE POSITIVE OBSERVATION … expected false to be true
FAIL search=a composes to a REFUSAL … (allowance in the payload changed: 1000, not 18,421)
```

**This is the SC-2-shaped failure, and the numbers show it exactly.** SC-1's end-to-end cells STAYED
GREEN — `search=a` is still refused, still 44,254 / 46,054 — while the feature is gone for every
legitimate user. A refusal-only suite would have reported a clean bill of health on a product that
can no longer export anything. The walk printed `[false ×9]`: **zero admissions**.

`audit_log` untouched at 214 / 0 (nothing was admitted, so nothing was written).

---

### Ablation 4 — the refusal payload zeroed (`matched: 0, total: 0`)

**Live file: 4 failed / 33 passed.** Verbatim:

```
FAIL SC-1: organization + search=a is REFUSED, carrying exactly 44,254 of 46,054
AssertionError: expected { success: false, …(3) } to deeply equal { success: false, …(3) }

- Expected
+ Received

  {
    "error": "too_broad",
-   "matched": 44254,
+   "matched": 0,
    "success": false,
-   "total": 46054,
+   "total": 0,
  }
```

…and the same shape at the worst case, the `status=completed` handover, and SC-4's refuse-side
bracket.

**The half that stayed GREEN is the finding.** `SC-1: a REFUSED export writes NO audit row`,
`SC-5 THE NEGATIVE HALF`, and every "is it refused?" assertion passed — because the export IS still
refused. **A toast-text-only or `success === false`-only reading of SC-3 would have passed on
`0 of 0`,** i.e. on a message reading "This filter matches 0 of 0 records". That is why SC-1 asserts
the payload by `toEqual` rather than by shape.

The structural gate does catch this one: `view-filters.test.ts:1140` reddened —

```
expect(refusal).toMatch(/matched:\s*[A-Za-z_$][A-Za-z0-9_$]*\.matc…/)
+ Received: "success: false, error: \"too_broad\", matched: 0, total: 0,"
```

— but it catches the *source shape*, not the value. A payload wired to some other real variable that
happened to be zero would satisfy the regex and only the live cell would see it.

---

### Ablation 5 — delete the `await recordExport(...)` call

**Live file: 5 failed / 32 passed.**

```
FAIL SC-5 THE POSITIVE OBSERVATION …
     "the admitted export produced no `entity_type='export'` audit row. `recordExport` swallows its
      own errors, so the action still returned `success: true` — this read is the ONLY instrument in
      the repository that can see the difference."
     expected +0 to be 1
FAIL SC-2: search=ltda …           expected [] to have a length of 1 but got +0
FAIL SC-2, A SECOND SURFACE …      expected [] to have a length of 1 but got +0
FAIL SC-2, THE EMPTY CASE …        expected [] to have a length of 1 but got +0
FAIL SC-4 THE CROSSING, ADMIT SIDE … expected [] to have a length of 1 but got +0
```

**The structural gate also reddens**, as the plan expected:

```
FAIL view-filters.test.ts > records the export AFTER the fetch, with the guard's filters and the real row count
     expect(recordAt).toBeGreaterThan(-1)   → expected -1 to be greater than -1      (:1209)
```

So for a DELETED call, ablation 5 does not distinguish the live cell from the structural one. Which
is why it was not left there.

---

### Ablation 5b (ADDED, not in the plan) — `recordExport` left in place but failing internally

A `throw` injected at the top of `recordExport`'s `try` block, so the call site is untouched and the
swallow at `export-events.ts:106-115` catches it. This is the case the plan told me to *state*; it is
recorded here as an *observation* instead.

```
structural gates:  src/lib/export/__tests__/view-filters.test.ts
                   src/lib/export/__tests__/export-call-sites.test.ts
                   Test Files  2 passed (2)      Tests  66 passed (66)          ← FULLY GREEN

live file:         Tests  32 passed | 5 failed (37)
                   × SC-5 THE POSITIVE OBSERVATION: 214 -> 215 total, 0 -> 1 export …
                   × SC-2: search=ltda …  × SC-2, A SECOND SURFACE …  × SC-2, THE EMPTY CASE …
                   × SC-4 THE CROSSING, ADMIT SIDE …
```

**66/66 green structurally, while every export this deployment produces goes unlogged and the action
cheerfully returns `success: true`.** `tsc --noEmit` is also clean under this ablation. **This is
precisely why SC-5 needed a fresh positive observation rather than an assertion about the code's
shape**, and it is now demonstrated rather than argued.

---

### Ablation 6b — move the flip by one step (isolating)

`2022-11-30` (19,013 — measured, admitted) prepended to the ladder, with its delta (+3,098) added so
the strict-increase and delta assertions could not be the thing that fired.

```
FAIL SC-4 THE WALK: nine steps, strictly increasing, a constant denominator, and ONE flip at index 7
AssertionError: the first refusal is at index 8, not 7. WITHOUT THIS ASSERTION any sequence
containing both outcomes anywhere would pass.: expected 8 to be 7

- Expected
+ Received

- 7
+ 8
```

**The sequence still contains both outcomes. It still flips exactly once. It is still strictly
increasing with a constant denominator.** Every other assertion in the cell passed. Only the INDEX
caught it — which is exactly the claim the assertion exists to support, and it is now falsified-then-
restored rather than assumed.

### Ablation 6a — the plan's literal "shift the ladder by one day"

All nine dates shifted back one day, expected `matched` literals left alone.

```
FAIL SC-4 THE WALK …
AssertionError: expected [ … ] to deeply equal [ … ]
    { "dateTo": "2023-04-14", -"matched": 28942, +"matched": 28941 },
    { "dateTo": "2023-05-14", -"matched": 30117, +"matched": 30069 },
    { "dateTo": "2023-06-07", -"matched": 31479, +"matched": 31477 },
    { "dateTo": "2023-06-10",  "matched": 31530 },
    { "dateTo": "2023-06-11", -"matched": 31612, +"matched": 31530 },
    { "dateTo": "2023-06-12", -"matched": 31679, +"matched": 31612 },
```

Red, loudly — and **the flat run reappears in the received column**: 06-10 and 06-11 both at 31,530.
But the cell dies at the whole-sequence `toEqual` and **never reaches the flip-index assertion**, so
the literal form cannot demonstrate what ablation 6 is for. This is DEF-50-08's diagnosability gap in
a new place: the loud ablation and the informative one are not the same ablation. 6b is the one that
carries the criterion; 6a is recorded because the plan asked for it and because the difference is
worth knowing.

---

**Every ablation came back RED. None came back green.** No unfalsifiable form was found in Task 2's
own cells — but the plan's *prediction* about ablation 1 was wrong (see above), and ablation 5 as
specified was not diagnostic, which is why 5b exists.

## Files Created/Modified

- `src/lib/export/export-selectivity-live.test.ts` — +453 lines in Task 2 (on top of Task 1's +681).
  Now 1,437 lines / 37 cells across four `describe`s: 50-04's count-equality suite, Task 1's SC-1 and
  SC-2 end-to-end suite, and Task 2's SC-4 and SC-5 suites, plus a file-level `afterAll` that closes
  the postgres-js pool once for the whole file.

**No production source was modified by this plan.** Every `src/**` change was an ablation, applied and
restored, with `git diff --exit-code -- src/` clean afterwards.

## Decisions Made

1. **The plan's nine-step ladder over MEASUREMENTS' eight-step one.** Both bracket the same crossing;
   the plan's uses the LAST admitted date, making the bracket two adjacent days. Both tables named in
   the file header.
2. **Ablation 5b was added.** Ablation 5 as written is caught by a structural gate, so it cannot
   demonstrate SC-5's necessity. 5b (call present, insert failing, swallow active) does — 66/66 green
   structurally against a silently unlogged export.
3. **Ablation 6 was run in two forms.** The isolating one carries the criterion; the plan's literal
   one is recorded for completeness with its limitation stated.
4. **Leaked ablation rows were read back WITH their contents before deletion.** Those contents are the
   disclosure measurement — the plan asked for `result.count` and the audit rows give it precisely,
   per-request, from the database rather than from a truncated assertion diff.
5. **`@/auth` remains the only mock.** No second mock was needed or added.

## Deviations from Plan

### 1. [Rule 2 — missing critical evidence] Ablation 5 could not demonstrate its own point; 5b added

- **Found during:** Task 2, ablation 5.
- **Issue:** The plan says to *state* the case the structural gate cannot see (a `recordExport` that
  runs and silently fails). But a stated case is exactly the "check that cannot fail" this milestone
  exists to remove, and the plan's own gate discipline requires a recorded red.
- **Fix:** Added ablation 5b — the call left in place, an exception thrown inside it, the module's own
  swallow catching it. Structural gates 66/66 GREEN, `tsc` clean, SC-5 RED.
- **Verification:** Transcripts recorded above; source restored; `git diff --exit-code -- src/` clean.
- **Committed in:** no source change survives — evidence only.

### 2. [Rule 1 — incorrect claim in the plan] Ablation 1's green/red contrast was predicted wrongly

- **Found during:** Task 2, ablation 1.
- **Issue:** The plan states "everything in `view-filters.test.ts:736-812` should not [redden]" under a
  wholesale deletion of the selectivity call. Three cells in that file DO redden, plus two in
  `export-call-sites.test.ts`. The line reference is also stale — that file has grown and the
  export-action `describe` now sits at ~1032-1230.
- **Fix:** Recorded the actual base-suite result (5,758 passed / 5 failed of 5,767) with the five
  reddened cell names and their line numbers, and stated the corrected, narrower contrast.
- **Verification:** Full base suite run under the ablation; per-cell failure list captured.

### 3. [documentation] The ladder tables in PLAN and MEASUREMENTS disagree

- **Found during:** Task 2, before writing the walk.
- **Issue:** `50-MEASUREMENTS.md` §7 prescribes eight steps ending 2023-06-09; `50-06-PLAN.md`
  prescribes nine ending 2023-06-13 with 06-11 in the last-admitted slot.
- **Fix:** Followed the plan (per the standing instruction that the plan wins on facts), documented
  both in the test file's header and here, and confirmed MEASUREMENTS' "do not insert 06-10 or 06-11
  between the last two" is not violated.

**Total deviations:** 3 (1 added evidence, 1 corrected plan claim, 1 documented conflict).
**Impact:** All three strengthen the record. No scope creep, no production source changed.

## Issues Encountered

**The ablations leak `audit_log` rows, and the file's own safety nets cannot recover them.**
`takeExportAuditRows` only records ids it has already READ; a cell that throws before reaching it
leaves its row behind, and the `afterAll` net then re-asserts a count that is wrong. Ablations 1 and 2
each left 2 rows (216 / 2). Handled by reading the rows back with their contents and deleting **by
id**, then re-verifying 214 / 0 by psql. This is a property of ablating a WRITING live suite, not a
defect in the cells — but it means anyone re-running these ablations must clean up manually. Recorded
as a new deferred item below.

**`rtk` filters merge commits out of `git log`.** `git rev-parse HEAD` returned `1d6b530` while
`git log --oneline` showed `01a7ae4` at the top, and `git log -n 1 1d6b530` printed `01a7ae4`'s hash
for `%H`. `rtk proxy git …` gives the true output. This nearly caused a false "wrong base" conclusion
at startup. Recorded below.

**`toEqual` against a `ViewExportResult` dumps the entire CSV on failure.** Ablation 1's default
reporter output was tens of thousands of lines of activity rows. Worked around with
`--reporter=json --outputFile=…` plus a small `node -e` parser — `--outputFile` is vitest writing the
file itself, not a shell redirect, so it is not subject to the ELIDED-placeholder hazard.

## Verification

| gate | result |
|---|---|
| `npm run test:live` | **65 passed / 3 files**, exit 0 — `export-events-live` 4, `export-selectivity-live` **37**, `formatters-live` 24 |
| `audit_log` before AND after, by psql | **214 total / 0 `entity_type='export'`** |
| nine ladder counts vs measured integers | all nine equal; flip index 7 asserted |
| `./node_modules/.bin/vitest run` (base) | **188 files, 5,763 passed / 4 skipped (5,767)** — at baseline |
| `vitest run --config vitest.rsc.config.ts` | **8 passed / 2 files** |
| `npm run test:db` | **299 passed / 13 files**, **exit 0** |
| `./node_modules/.bin/tsc --noEmit` | **exit 0** |
| `npm run lint` | **0 errors** (118 warnings — gate is errors) |
| `git diff --exit-code -- src/` after all seven ablations | **clean** |

### A correction to the orchestrator's baseline figures

The brief stated `test:live` at **85 passed / 3 files (47 + Task 1's 38)**. Measured here, per file:
`export-events-live` **4**, `formatters-live` **24**, `export-selectivity-live` **31 after Task 1** →
**37 after Task 2**. So the true figures are **59 before Task 2 and 65 after**, and Task 1's file was
**31 cells, not 38**. The base-suite, RSC, `test:db`, `tsc` and lint baselines in the brief were all
correct. Flagged because a verifier comparing against 85 would wrongly conclude cells had vanished.

## Known Stubs

None. No stub, placeholder, TODO or hardcoded-empty value was introduced.

## Threat Flags

None. This plan modified one test file and introduced no network endpoint, auth path, file-access
pattern or schema change. `T-50-06-SC` (package legitimacy) remains n/a: **no package was installed**;
`papaparse`, `vitest` and `drizzle-orm` were already present and already used by the sibling live file.

## Threat Register Disposition

| Threat ID | Disposition | Evidence |
|---|---|---|
| T-50-06-01 Information Disclosure | **mitigated, and the disclosure reproduced** | SC-1 refused at 44,254 / 46,054 and the worst case at 25,195 / 25,195, both as an asserted member, both with no `data`; ablation 1's audit rows record 44,254 organizations and 31,612 activities actually leaving |
| T-50-06-02 DoS (bound removes the feature) | **mitigated** | SC-2 at 13,355 parsed rows + a second entity + an empty case; ablation 3 reddens exactly those and leaves SC-1 green |
| T-50-06-03 Spoofing (empty or whole set) | **mitigated** | `owner`/`assignee` excluded with their 100% and 0; `0 < count < total` floors on named integers; a separate zero-match case |
| T-50-06-04 Spoofing (wrong actor) | **mitigated** | role asserted `member` from a real row; the mock-is-live cell distinguishes `refused` from `unauthenticated` in both directions |
| T-50-06-05 Spoofing (a one-assertion "walk") | **mitigated** | nine steps, strictly increasing with pinned deltas, constant denominator, one flip, INDEX asserted; ablation 6b reddens the index alone |
| T-50-06-06 Repudiation (SC-5 on "unchanged") | **mitigated** | positive 214→215 / 0→1 with contents and a three-way `rowCount` cross-check; ablation 5b shows the structural gate 66/66 green on a silently unlogged export |
| T-50-06-07 Tampering (probe destroys evidence) | **mitigated** | delete by the id read back, scoped by `actor_user_id`; absence of that id asserted; psql re-verified 214 / 0 |
| T-50-06-08 Repudiation (`0`/`0` refusal) | **mitigated** | ablation 4 verbatim, with the "is refused" half recorded as staying green |
| T-50-06-09 Repudiation (first-run green as evidence) | **mitigated** | the green transcript is recorded WITH the caveat, and seven ablations carry the verdicts |
| T-50-06-10 DoS (concurrent live run) | **mitigated** | alone in wave 5; the live project runs serially; sole executor confirmed |
| T-50-06-SC Supply chain | **n/a, recorded** | no package installed |

## Deferred Items — proposed additions to `deferred-items.md`

**DEF-50-12 — ablating a WRITING live suite leaks `audit_log` rows that no safety net recovers.**
Found by 50-06. `takeExportAuditRows` and the `afterAll` nets only know ids they have already read; a
cell that throws before reaching them leaves its row behind, and the net then re-asserts a count that
is wrong. Ablations 1 and 2 each left 2 rows (216 / 2), cleaned manually by id. Not a defect in the
cells — a consequence of ablating a suite that writes. Anyone re-running these ablations must clean up
by id afterwards and re-verify 214 / 0.

**DEF-50-13 — `rtk` filters merge commits out of `git log`, so `rev-parse HEAD` and `log` disagree.**
Found by 50-06 at startup. `git rev-parse HEAD` → `1d6b530`; `git log --oneline` showed `01a7ae4`
first; `git log --format='%H' -n 1 1d6b530` printed `01a7ae4`. Only `rtk proxy git …` gives the truth.
A worktree base check that trusts `git log` will conclude the base is wrong when it is right. Add
`rtk proxy` to the worktree-base-check snippet.

**DEF-50-14 — ablation 5's specified form is caught by a structural gate and cannot demonstrate its
own point.** Found by 50-06. Deleting `recordExport` reddens `view-filters.test.ts:1209` as well as
SC-5. The distinguishing ablation is 5b: leave the call, make it throw, let the module's own swallow
catch it — structural gates 66/66 green, `tsc` clean, only SC-5 red. Worth carrying forward as the
canonical shape for ablating any call whose failure is swallowed by design.

**Correction to `50-MEASUREMENTS.md` §7 and `50-06-PLAN.md`:** the two ladder tables differ (eight
steps ending 2023-06-09 vs nine ending 2023-06-13). Both are valid; the plan's was used. Worth
reconciling to one table so a future reader does not have to.

## HANDOFF — text for STATE.md and ROADMAP.md (NOT applied by this executor)

Per instruction, this executor made **no edits to `STATE.md` or `ROADMAP.md`**. The orchestrator
should apply:

**STATE.md — Current Position**
```
Current Phase: 50-export-authorization
Current Plan:  06 of 06 — COMPLETE
Status:        phase 50 implementation complete; ready for verification
Stopped At:    Completed 50-06-PLAN.md (both tasks; Task 1 by a prior executor, Task 2 here)
Resume File:   None
```

**STATE.md — Performance Metrics (append)**
```
| 50 | 06 | ~95min (two sittings) | 2 | 1 |
```

**STATE.md — Decisions (append)**
- "50-06: SC-4's ladder uses 50-06-PLAN's nine steps (last admitted 2023-06-11) rather than 50-MEASUREMENTS §7's eight (2023-06-09); both bracket 31,530 → 31,612, but 06-11 makes the bracket two adjacent days."
- "50-06: SC-5 is a POSITIVE observation (audit_log 214→215, export 0→1, contents asserted, deleted by id), never an 'unchanged count' assertion — which would pass against a deleted recordExport."
- "50-06: ablation 5b established as the canonical shape for ablating a call whose failure is swallowed by design — leave the call, make it throw; structural gates stay 66/66 green while the behavioural cell reddens."

**STATE.md — Blockers/Notes (append)**
- "DEF-50-12/13/14 proposed in 50-06-SUMMARY.md; not yet merged into deferred-items.md."
- "The orchestrator's baseline figure of `test:live` 85 passed was wrong; the measured figure is 65 (4 + 37 + 24). Task 1's file is 31 cells, not 38."

**ROADMAP.md — phase 50 progress row**
```
Plans: 6 / 6 complete   Summaries: 6 / 6   Status: implementation complete, awaiting verification
```

**REQUIREMENTS.md** — `SEC-03` may be marked complete: all five success criteria (SC-1 through SC-5)
are now proven end to end against live data, each with a recorded red.

## Self-Check

- `src/lib/export/export-selectivity-live.test.ts` — FOUND (1,437 lines, 37 cells, green)
- `.planning/phases/50-export-authorization/50-06-SUMMARY.md` — FOUND
- commit `01a7ae4` (Task 1, prior executor) — FOUND
- commit `1d6b530` (orchestrator's merge of Task 1) — FOUND
- commit `e41d489` (Task 2) — FOUND
- `git diff --exit-code -- src/` — CLEAN
- `audit_log` — 214 / 0, verified by psql after everything

## Self-Check: PASSED
