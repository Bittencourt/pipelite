---
phase: 50-export-authorization
plan: 04
subsystem: export
tags: [export, security, selectivity, sec-03, t-40-30, live-proof]
requires:
  - "50-01: exportAllowance / decideSelectivity (the arithmetic half)"
  - "50-03: vitest.live.config.ts (the live project)"
provides:
  - "src/lib/export/formatters.ts: four exported per-entity condition builders + buildExportConditions"
  - "src/lib/export/export-count.ts: countExportMatches -> { matched, total }"
  - "the T-40-30 gate re-anchored onto the builders, plus a no-local-push cell over every fetcher"
  - "src/lib/export/export-selectivity-live.test.ts: the count-equals-fetch proof against live data"
affects:
  - "50-06 (wires countExportMatches + decideSelectivity into the guard)"
  - "50-08 (sign-off; three open items below are its inputs)"
tech-stack:
  added: []
  patterns:
    - "one whereClause, two consumers (count + findMany) — the src/app/api/v1/organizations/route.ts:29-38 idiom, one layer down"
    - "live-project test file with NO describe.skipIf, gated by a pre-flight cell instead"
key-files:
  created:
    - src/lib/export/export-count.ts
    - src/lib/export/export-selectivity-live.test.ts
  modified:
    - src/lib/export/formatters.ts
    - src/lib/export/__tests__/view-filters.test.ts
decisions:
  - "Two counts kept per plan constraint 5, but the plan's PERFORMANCE justification for them is false — measured, the combined FILTER aggregate is ~13 ms FASTER, not 34 ms slower"
  - "The plan's ablation-2 prediction is undrivable on this data (zero soft-deleted rows); a structural detector was added because a behavioural one cannot exist here"
  - "The 'no and( of its own' assertion was reformulated as 'exactly one and(, and it is the spread' — the literal form would be red against correct code"
metrics:
  duration: ~35 min
  completed: 2026-08-27
  tasks: 2
  commits: 3
---

# Phase 50 Plan 04: The Shared Filter-Condition Builder Summary

Pulled the four export predicates out of the fetchers into one builder per entity type that both the
read and the count call, re-anchored the phase's load-bearing T-40-30 gate onto them after observing
all 14 pairs go red, and proved against the live database that `countExportMatches` returns the same
number the export produces — while finding that **two of the plan's own premises do not reproduce**.

## The headline sequence: before-green → extraction-red → re-anchor-green

| state | command | result |
|---|---|---|
| BEFORE, untouched | `vitest run …/view-filters.test.ts` | **49 passed / 1 file, GREEN** |
| AFTER extraction, gate still pointed at the fetchers | same | **16 failed \| 33 passed (49)** |
| AFTER re-anchoring onto the builders | same | **53 passed, GREEN** |
| plus the counter cell (Task 2) | same | **54 passed, GREEN** |

**The 16 reddened assertions, enumerated:** all **14** exportable pairs (`organization/search`,
`person/search`, `deal/stage|owner|assignee|dateFrom|dateTo`,
`activity/type|owner|assignee|status|dateFrom|dateTo|search`), plus the per-function discriminator
cell, plus the E-2 `pipeline` cell. **The plan predicted exactly this set** — 14 + discriminator +
pipeline, with the anti-vacuity `toContain("findMany")` cell staying green because `findMany` remains
in the fetcher. It did stay green.

**The rendered-SQL half stayed GREEN with ZERO edits.** None of the 16 failures was in
`view-filters.test.ts:265-400` or in the CR-01 / T-40-32 describes. That is the byte-level proof the
extraction **moved code without changing one rendered byte** — the extraction is a pure relocation,
and that file is the detector for the claim rather than my assertion of it.

`formatters.test.ts` needed **no edit at all** (`git diff --stat` empty; 33 tests green untouched). It
exercises `fetchFilteredData`'s public behaviour, not the fetchers' internals.

## What the plan got wrong, and what I did instead

Four for four held: there was one in mine. In fact there were three.

### 1. The 93.5 ms figure does not reproduce — the combined aggregate is FASTER, not slower

The plan states this twice (objective, constraint 5) and instructs it be written into the module
header as a measurement: *"46.1 ms + 13.0 ms against 93.5 ms for the combined form, which loses the
scan's short-circuit."* I wrote it in, then measured it, three runs each, `EXPLAIN (ANALYZE)` against
live `organizations` (46,054 rows) with the three-column `search=a` predicate:

| form | runs | ~ |
|---|---|---|
| `COUNT(*)` filtered | 44.5 / 46.4 / 50.6 ms | **~47 ms** |
| `COUNT(*)` unfiltered | 12.9 / 12.8 / 13.0 ms | **~12.9 ms** |
| two statements (what this module issues) | — | **~60 ms** |
| ONE `count(*) FILTER (WHERE …), count(*)` | 45.6 / 46.1 / 49.1 ms | **~47 ms** |

The plan's 46.1 and 13.0 reproduce. **Its 93.5 ms is out by roughly 2x.** The combined form costs the
same as the filtered count *alone* — which is what one would expect, since both forms scan all 46,054
rows and evaluate the ILIKE on each, and the filtered count has no index to short-circuit against. The
plan's stated mechanism describes neither plan.

**So the combined aggregate is ~13 ms FASTER — exactly the cost of the second statement it
eliminates.** I kept two counts because constraint 5 locks them and they keep the module composable,
but I refused to write the false justification into the source. `export-count.ts` §2 now states the
measured figures, names the plan's error, and says the choice is a structural preference costing
~13 ms rather than a performance win. Writing a "MEASURED" claim on another document's authority is
precisely how `BATCH_SIZE = 200` became a "finding".

### 2. Ablation 2 is undrivable on this data — zero soft-deleted rows

The plan: *"Swap `total` to count WITHOUT `deleted_at IS NULL`. Expect the base-predicate cells RED,
with both numbers recorded — this is how much soft-deleted data exists."*

Driven. **`npm run test:live` stayed fully GREEN at 47 passed.** Measured cause:

```
       t       | all_rows | soft_deleted
---------------+----------+--------------
 organizations |    46054 |            0
 people        |    38348 |            0
 deals         |    25195 |            0
 activities    |    79022 |            0
```

**Zero soft-deleted rows in all four tables**, so `count(*)` and `count(*) where deleted_at is null`
are the same number and *no behavioural cell on this database can detect the term's presence*. There
are no "two numbers to record".

Rather than leave two cells reading as evidence for something they cannot cover, I did both honest
things: added the **structural** detector (`view-filters.test.ts` asserts all four
`isNull(<table>.deletedAt)` appear in `export-count.ts`) and **relabelled** the live cells to state
what they prove (no EXTRA term — a viewer or `ids` scope still reddens them) and what they do not.
Falsified the new detector by deleting the activities base predicate: **1 failed / 53 passed**, with
its own message.

### 3. "No `and(` construction of its own" would be red against correct code

Task 1 step 4 asks the no-local-push cell to assert each fetcher body contains *"no `conditions.push`
and no `and(` construction of its own"*. But every fetcher legitimately composes with
`where: and(...conditions)` — a literal `and(`-absent assertion fails against correct code.

Reformulated to the falsifiable equivalent: **`and(` appears EXACTLY ONCE per fetcher and that
occurrence is `and(...conditions)`**. Two means a locally composed term; zero means the array stopped
reaching the query. Plus `not.toContain("conditions.push")`, `not.toContain("conditions: SQL[]")` and
`not.toContain("SQL[] = [")`, with an anti-vacuity half requiring the body to name its builder.

### Minor: line numbers, and the id shapes

- The plan cites the fetchers at `formatters.ts:349-380, :382-417, :419-486, :488-568`; they were
  actually at `:351-384, :386-421, :423-482, :484-567`. Off by ~2. Paths and symbols were all correct.
- The plan says to read the activity type id *"rather than hard-coding a uuid"*. `activity_types.id`
  is a **slug** (`meeting`), not a uuid; `stages.id` is a uuid. Reading both by SQL is right for the
  stated reason, but a reader should not expect two uuids. Noted in the live file.

## Task 1 — the five falsifications of the re-anchored gate

Committed first (`d06fa92`), then each ablation applied, recorded, and reverted.

| # | ablation | result | note |
|---|---|---|---|
| 1 | delete `filters?.status` from `activityExportConditions` | **5 failed / 48 passed (53)** | the pair AND four rendered-SQL cells |
| 2 | delete `filters?.pipeline` from `dealExportConditions` | **3 failed / 50 passed (53)** | **the 14 pairs stayed GREEN** |
| 3 | reintroduce a local `conditions.push` in `fetchOrganizations` | **1 failed / 52 passed (53)** | the new cell is the SOLE detector |
| 4 | rename `dealExportConditions`, leave the map | **file fails to collect — `Tests no tests`** | throw-by-name |
| 5a | early `return []` in `organizationExportConditions` | **view-filters GREEN (53)**; tsc EXIT 1, 7 errors; formatters.test.ts 4 failed | see below |
| 5b | body fully replaced with `return []` | **6 failed / 80 passed (86)** | the named floor fires |

**Ablation 1 — the most important one.** `activity/status` red with the gate's own message verbatim:

> `activityExportConditions has no `filters?.status` guard, but hasExportableFilter("activity", { status: … }) returns true — so that key would AUTHORIZE an export while narrowing nothing. That is the unbounded export 38-CONTEXT.md:110-116 forbids. And since countExportMatches counts over this SAME builder, the selectivity guard would not see the missing predicate either: the export would be both unbounded AND reported as narrow. Add the predicate to activityExportConditions; do NOT remove status from EXPORTABLE_FILTER_KEYS.activity to make this green.`

This is the pair whose absence once authorized an export of all 79,022 activities. Four rendered-SQL
cells caught it independently (`expected '"activities"."deleted_at" is null' to contain
'"activities"."completed_at" is not null'`, and `expected 1 to be 3` on the three-distinct-predicates
cell).

**Ablation 2 — the asymmetry, confirmed.** `pipeline` cell red plus both T-40-32 rendered-SQL cells,
and **all 14 pairs GREEN** — `pipeline` narrows without authorizing, exactly as the gate is built to
hold.

**Ablation 3 — the strongest single result.** Only **one** cell fell: the new no-local-push cell. And
the point is sharper than "it works": **under the OLD gate this ablation would have made things
GREENER**, because a reappearing `filters?.search` in `fetchOrganizations` was precisely what the old
anchor demanded. The re-anchored gate detects a defect the old gate would have *rewarded*.

**Ablation 4 — throw by name.** `functionBody` threw and the whole file failed to collect:

> `Error: expected exactly one `function dealExportConditions(` in src/lib/export/formatters.ts, found 0. If a condition builder was renamed, update CONDITION_BUILDER_BY_ENTITY; if a fetcher was renamed, update FETCHER_BY_ENTITY. Do not delete either row.`

`Tests no tests` — loud, not vacuous.

**Ablation 5 — and the plan's prediction was half wrong here too.** The plan expected *"the length
floor and the pairs for that entity"* to redden. With an **early `return []`** (5a) **neither did**:
the source still *contains* every `filters?.<key>` guard, so the regex matches and the character count
is unchanged — the structural gate cannot see reachability. `tsc` caught it (EXIT 1, 7 errors, TS2769
+ TS18048 from the dead code losing narrowing) and `formatters.test.ts` caught it (4 failed). With the
body **fully emptied** (5b) the plan's prediction holds exactly, and the named floor fires with its
measured numbers: `organizationExportConditions body is too short: expected 13 to be greater than 300`.
The rendered-SQL half did **not** notice either variant — it drives only activities and deals.

## Task 2 — the count-equals-fetch proof

`npm run test:live`: **3 files, 47 passed** = 28 pre-existing + **19 new**. Every named integer
reproduced on the first run.

| case | matched | total | equals the export's `count`? |
|---|---|---|---|
| `organization` + `search=ltda` | **13,355** | 46,054 | yes |
| `activity` + `type=meeting` | **2,993** | 79,022 | yes |
| `deal` + `stage=Base Fria - Lead` | **3,466** | 25,195 | yes |
| `organization` + `search=zzzz` | **0** | 46,054 | yes (both 0) |
| all four, no filters | = total | = total | — the exposure, as an assertion |

`0 < matched < total` on every filtered case. **The plan's 2,993 and 3,466 are NOT in
`50-MEASUREMENTS.md`, so I measured them before building on them** — Meeting = 2,993, Base Fria - Lead
= 3,466 (`ad4d9fb5-92c7-4170-8e93-2163153a99d9`). Both correct.

**The composed decision, against real data, before any call site changes:**

```
decideSelectivity(await countExportMatches("organization", { search: "a" }))
  => { ok: false, matched: 44254, total: 46054, allowance: 18421 }
decideSelectivity(await countExportMatches("organization", { search: "ltda" }))
  => { ok: true }                       // 13,355, under the allowance by 5,066
```

**DEF-50-01 honoured, both sides pinned adjacently:** `exportAllowance(79_022) === 31_608`, and
`31_609 === 31_608 + 1` is asserted as the **smallest REFUSED count** —
`decideSelectivity({matched: 31_608, …})` is `{ ok: true }` and `{matched: 31_609, …}` refuses with
`allowance: 31_608`. **31,609 is never called "the allowance" anywhere in this plan's output.**

**The pre-flight drift message, quoted so a later reader knows what a failure there means:**

> `LIVE VOLUME DRIFT on `organizations`: this file asserts 46054 and the database holds N. Every named
> integer in this file, and in 50-MEASUREMENTS.md, is derived from these four volumes — the
> allowances, the matched counts and the admit/refuse verdicts all move with them. DO NOT relax this
> cell. RE-MEASURE against the live database, update 50-MEASUREMENTS.md, then update every named
> integer here. A silent adaptation is how a phase ends up asserting two different numbers in two
> files.`

### Task 2's four ablations

| # | ablation | result |
|---|---|---|
| 1 (A6) | counter builds its own list, `search` dropped | **6 failed / 41 passed (47)** |
| 2 | `total` without `deleted_at IS NULL` | **GREEN, 47 passed** — see finding 2 above |
| 2b | activities base predicate removed (my structural detector) | **1 failed / 53 passed** |
| 3 | `matched` / `total` returned transposed | **6 failed / 41 passed (47)** |
| 4 | one combined `FILTER` aggregate | **GREEN, 47 passed** |

**Ablation 1 (A6) — the reason the shared builder exists.** The divergence the plan predicted, with
the numbers it predicted:

```
organization + search=ltda: expected 46054 to be 13355
  ("the selectivity guard would authorize on a different number than the export produces")
activity + type=Meeting:    expected 79022 to be 2993
deal + stage=…:             expected 25195 to be 3466
THE ZERO-MATCH CASE:        expected 46054 to be +0
search=a REFUSAL:           expected 46054 to be 44254
```

The plan asked which way the `search=a` decision goes. **It still REFUSES** — 46,054 > 18,421 — but on
the **wrong number**, reporting 46,054 where the export produces 44,254. That is the subtler half of
the hazard: the verdict happens to agree while the message the user is shown is wrong by 1,800 rows,
and on a narrower filter the verdict itself would flip.

**Ablation 3 has an identical failure signature to ablation 1** — same six cells, same numbers.
Recorded as a limit of the suite rather than glossed: both defects present as `matched == total`, so
these cells prove the equality is broken but cannot say *which* way. The two `it.each` families do not
notice either ablation, correctly — with no filters `matched == total` regardless.

**Ablation 4, stated explicitly as the plan requires: the cells stay GREEN because the numbers are
identical. NO ASSERTION ANYWHERE DEFENDS THE TWO-COUNT CHOICE.** It is a design decision, now known
to cost ~13 ms rather than save 34 ms, and the green suite must not be mistaken for protection of it.
`export-count.ts` §2 says so in the source.

## audit_log: left exactly as found

| moment | total | `entity_type='export'` |
|---|---|---|
| before any work (independent psql) | **214** | **0** |
| after every live run and all nine ablations | **214** | **0** |

**Nothing was written, so nothing needed deleting by id.** The live file asserts this itself, and the
assertion is labelled honestly: with zero export rows an "unchanged" check is weak evidence, kept
because not checking is how a read-only claim rots. **SC-5's 214 → 215 / 0 → 1 remains 50-06's to
observe.**

## Verification

| gate | baseline | now |
|---|---|---|
| base suite | 5,745 passed / 4 skipped / 187 files | **5,750 passed / 4 skipped / 187 files** (+5) |
| `npm run test:live` | 28 / 2 files | **47 / 3 files** (+19) |
| `npm run test:db` | 299 / 13 / EXIT 0 | **299 / 13 / EXIT 0** (unchanged) |
| `tsc --noEmit` | 0 | **0** |
| `eslint` errors | 0 | **0** (118 warnings — not gated, not reproducible across trees) |
| `git diff --exit-code -- src/` | clean | **clean** after all nine ablations |

The brief's baseline of 5,745 / 4 / 187 reproduced exactly (`50-MEASUREMENTS.md` and `STATE.md` are
both stale against it; the brief was right).

## Deviations from plan

1. **[Rule 3] The `export-count.ts` counter cell moved from Task 1 to Task 2.** Task 1 step 4 asks for
   a cell asserting `export-count.ts`'s source, but that file is Task 2's artefact and does not exist
   during Task 1 — the cell would have been red for a reason unrelated to the invariant. Added
   alongside the file it reads. The no-local-push cell stayed in Task 1 as written.
2. **[Rule 1] The `and(` assertion reformulated** — see finding 3. The literal form is red against
   correct code.
3. **[Rule 2] Structural soft-delete detector added** — see finding 2. Not in the plan; required
   because the plan's behavioural detector cannot exist on this data.
4. **[Rule 1] The plan's 93.5 ms claim not written into the source** — see finding 1. The measured
   figures and a plain statement of the plan's error are written instead.
5. **Ablation 5 driven in two variants** (early return vs. emptied body) because the first did not
   redden what the plan predicted and the second did. Both recorded.
6. **`MIN_BUILDER_BODY_CHARS` comment corrected mid-flight.** My first draft claimed measured lengths
   of 505 and 1,142. Measured: **521 / 534 / 924 / 1401**. Both guesses wrong; the comment now records
   that it was guessed first and why it was then measured. (For scale, the predicate-free
   `fetchOrganizations` body is 343 chars — the old floor of 100 was loose by >3x on the bodies it
   guarded, so re-anchoring **tightened** this cell.)

No Rule 4 items. No packages installed — `count()` comes from `drizzle-orm` 0.45.2, already imported
by eight-plus production modules, so the Package Legitimacy Gate did not apply.

## Constraints honoured

`view-export-guard.ts` untouched (sync, database-free). `EXPORT_ROW_CAP` and
`view-filters.test.ts:766-773` untouched. `total` is `isNull(deletedAt)` only. No `Date.now()`, no
`performance.now()`, no elapsed-time assertion anywhere in the new files. The live file has no
`describe.skipIf`, uses static imports, and is **not** in `SKIPPED_LIVE_FILES` (which asserts its
entries contain `describe.skipIf(` — adding it would have reddened `suite-hook-hygiene.test.ts`).
Every filter value still crosses as a bound parameter, proven by the rendered-SQL half being green
with zero edits.

## Known stubs

None. `countExportMatches` is complete and proven; it is deliberately **not wired to any call site**
— that is 50-06's task, and the plan says so ("composed but not yet wired anywhere").

## Threat flags

None. No new network endpoint, auth path, file access pattern or schema change. `export-count.ts`
issues two read-only `count(*)` statements over predicates that already existed.

---

## HANDOFF — for STATE.md / ROADMAP.md (orchestrator owns these files; I edited neither)

**Suite figures after this plan (measured at commit `4d64a83`, from the worktree root):**

- base suite: **5,750 passed / 4 skipped (5,754) over 187 files**
- `npm run test:live`: **47 passed / 3 files**
- `npm run test:db`: **299 passed / 13 files / EXIT 0**
- rsc: not re-run this plan (untouched; 8/8 at base)
- `tsc --noEmit` **0**; `eslint` **0 errors** / 118 warnings

`STATE.md:30` is still stale (it claims 5,659 / 288); 50-01 and 50-02 both flagged this and the
brief's 5,745 / 4 / 187 was confirmed correct at my base.

**Plans complete: 4 of 8. Current Plan should advance to 05.**

**Decisions to record:**

1. The export predicates live in four exported builders plus one total dispatcher; the read and the
   count share them by construction, so divergence is a compile question rather than a review one.
2. Two counts per attempt, uncached — kept as a structural preference, **not** a performance win. The
   plan's 93.5 ms figure for the combined aggregate does not reproduce; measured, the combined form is
   ~13 ms **faster**. No assertion defends either choice.

**New deferred items to add to `deferred-items.md`** (I have not edited that file — three items):

- **DEF-50-06 — `50-04-PLAN.md`'s 93.5 ms combined-aggregate figure is wrong by ~2x, and its stated
  mechanism is wrong too.** Measured three runs each: filtered ~47 ms, unfiltered ~12.9 ms, combined
  ~47 ms. The combined `count(*) FILTER` form is **~13 ms faster** than two statements, not 34 ms
  slower. Both forms scan all 46,054 rows and evaluate the ILIKE; the filtered count has no index to
  short-circuit against, so the plan's "loses the scan's short-circuit" describes neither plan. Two
  counts were kept per constraint 5, with the true figures and the correction in `export-count.ts` §2.
  **Owner: 50-08** — decide whether to switch to the combined form (a ~13 ms win on a security-control
  path) or keep two counts and let §2 stand as the record. **Do not cite 93.5 ms anywhere again.**
- **DEF-50-07 — no behavioural cell in this repository can detect a missing `deleted_at IS NULL`
  term.** All four live tables hold **zero** soft-deleted rows, so `count(*)` and
  `count(*) where deleted_at is null` are identical and 50-04's ablation 2 left `npm run test:live`
  fully green. A structural detector was added (`view-filters.test.ts` asserts all four
  `isNull(<table>.deletedAt)` in `export-count.ts`) and the live cells were relabelled. **This
  generalises beyond the export path** — any soft-delete assertion in the repo proved only against
  live data is green-by-data. **Owner: whoever next asserts a soft-delete predicate**; seeding one
  soft-deleted row in `pipelite_dedup_test` would close it properly.
- **DEF-50-08 — the equality cells cannot distinguish *which way* the count broke.** Ablations 1 and 3
  (own-list-dropping-`search` vs. transposed `matched`/`total`) produce **identical** failure
  signatures: 6 failed / 41 passed, the same cells, the same numbers, because both present as
  `matched == total`. Adequate for detection, insufficient for diagnosis. **Owner: 50-08**, as a
  candidate one-hop-outside improvement — a cell asserting `matched <= total` structurally, or a
  direction-carrying message, would separate them. Not a defect; recorded so nobody reads the shared
  signature as two independent proofs.

**Also worth carrying to 50-08:** the plan's `formatters.ts` line numbers were off by ~2 (the file has
moved since planning), `activity_types.id` is a slug rather than a uuid, and the T-40-30 gate's old
100-char length floor was loose by >3x on the bodies it guarded — the re-anchored floor is 300 against
a measured minimum of 521.

## Self-Check: PASSED

Files claimed created — verified present:
- `src/lib/export/export-count.ts` FOUND
- `src/lib/export/export-selectivity-live.test.ts` FOUND
- `.planning/phases/50-export-authorization/50-04-SUMMARY.md` FOUND

Commits claimed — verified in `git log`:
- `d06fa92` refactor(50-04): extract four condition builders and re-anchor the T-40-30 gate FOUND
- `324486f` feat(50-04): count with the shared predicate, proven equal to the export FOUND
- `4d64a83` test(50-04): add the structural soft-delete detector ablation 2 proved was missing FOUND
