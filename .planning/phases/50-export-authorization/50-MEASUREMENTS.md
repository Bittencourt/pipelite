# Phase 50 — The re-measured live baseline

**Measured:** 2026-08-27, at plan-EXECUTION time (plan 50-01, Task 1).
**Against:** the REAL `pipelite` database on `localhost:5433` (container `pipelite-postgres-1`,
`postgres:16-alpine`, up 2 weeks, healthy). **Not** `pipelite_dedup_test`, and not a fixture.

This is the **third** measurement of these figures: RESEARCH measured at research time, the planner
re-measured at planning time, and this file re-measures at execution time. SC-1 requires exactly that
(*"measured against the live database at that scale, not against a fixture, and re-measured at plan
time"*), and `.planning/STATE.md` is the standing proof of why: it says the suite is at 5,659 tests
while the tree is at 5,696, because a count was inherited instead of read.

**Every later plan in this phase takes its named integers from THIS file, not from RESEARCH.** One
RESEARCH figure is wrong — see the DELTA section, item **D-1**.

---

## The command form

Every SQL figure below was produced with this exact form, from the worktree, wrapped in `rtk proxy` so
the output is the psql table rather than a summary of it:

```
rtk proxy docker compose \
  --project-directory /home/pedro/programming/pipelite \
  -f /home/pedro/programming/pipelite/docker-compose.yml \
  exec -T postgres psql -U pipelite -d pipelite -c "<sql>"
```

`--project-directory` + an absolute `-f` is required because a git worktree has **no**
`docker-compose.yml`; run bare from inside one, `docker compose` reports the postgres service as not
running. `docker` needs no `sudo` here. Compose's `LOG_LEVEL`/`SENTRY_DSN` "variable is not set"
warnings are filtered out of the transcripts below and are not otherwise touched.

Derived integers come from `node -e`, never from mental arithmetic — the whole point of the exercise.

---

## 1. Volumes, and the audit trail

```
       tbl        | count
------------------+-------
 audit_log_total  |   214
 audit_log_export |     0
 deals            | 25195
 people           | 38348
 activities       | 79022
 organizations    | 46054
(6 rows)
```

(`count(*) where deleted_at is null` for the four entity tables; `audit_log` unfiltered and filtered
to `entity_type='export'`. The row order is postgres's, not the `UNION ALL`'s, and is reproduced as
returned.)

**`audit_log` holds 214 rows and ZERO with `entity_type='export'`.** SC-5's audit row has never fired.
An "unchanged count" assertion therefore passes today and proves nothing; SC-5 needs a fresh POSITIVE
observation, **214 → 215** and **0 → 1**.

### Users — 50-06 needs a real non-admin

```
                  id                  |             email              |  role  |  status
--------------------------------------+--------------------------------+--------+----------
 06365957-e44b-4cc6-a6db-211b467138a5 | pipelite-e2e@local.test        | admin  | approved
 ef4acac9-e860-4e71-9db5-ddaa2808cb9f | prbitt@gmail.com               | admin  | approved
 efe6ba7c-a08a-4fe1-bc5d-02b507d6f534 | emily.davis@pipelite.local     | member | approved
 07572f1b-49e3-4325-b4af-7fc68b736f7f | james.wilson@pipelite.local    | member | approved
 d9ed59bc-5b69-4fad-a3fe-3d2454e7c706 | laura.garcia@pipelite.local    | member | approved
 b1939ede-9fd7-42bc-9d94-1656b99d1c6c | mark.chen@pipelite.local       | member | approved
 164b4196-6cf7-4671-8b4a-9739721fd0d3 | mateus.aristimunho@visagio.com | member | approved
 bc79ecfe-0f9f-4772-bf8f-1ce9a184179f | pedrobittencourt87@gmail.com   | member | approved
 f40b7e37-52cb-4a9b-972a-19a410fc6f25 | pipelite-e2e-member@local.test | member | approved
 fc27b469-0a33-4ce5-9332-c165c213107c | sarah.johnson@pipelite.local   | member | approved
(10 rows)
```

Two admins, eight members, all `approved`. `pipelite-e2e-member@local.test`
(`f40b7e37-52cb-4a9b-972a-19a410fc6f25`) is the e2e member fixture (`e2e/seed-member.ts`) and is the
natural non-admin for 50-06 / the SC-1 and SC-2 proofs. `prbitt@gmail.com`
(`ef4acac9-e860-4e71-9db5-ddaa2808cb9f`) is the admin that owns every row in all four tables — see §4.

---

## 2. SC-1's headline: `organization` + `search=a`

The predicate is the export fetcher's, not an approximation of it:
`fetchOrganizations` (`src/lib/export/formatters.ts:361-370`) ORs `ilike` across **three** columns —
`name`, `industry`, `website` — in that order.

```
 matched_a | total |  pct
-----------+-------+-------
     44254 | 46054 | 96.09
(1 row)
```

**44,254 of 46,054 = 96.09%.** Allowance at 0.40 is **18,421** (§8), so this is **REFUSED** — by a
margin of 25,833 rows.

---

## 3. SC-2's subject, the zero-match anchor, and the reason 0.50 was rejected

Same three-column predicate, three terms in one query:

```
 term | matched | total |  pct
------+---------+-------+-------
 ltda |   13355 | 46054 | 29.00
 zzzz |       0 | 46054 |  0.00
 u    |   23495 | 46054 | 51.02
(3 rows)
```

- **`search=ltda` → 13,355 (29.00%)** — SC-2's admitted case. Under the 18,421 allowance by 5,066 rows.
- **`search=zzzz` → 0** — the zero-match anchor. It proves the predicate **can** return nothing, so a
  "matched < total" assertion elsewhere is not passing merely because the predicate always matches
  everything.
- **`search=u` → 23,495 (51.02%)** — the narrowest purely degenerate filter measured. `0.50` was
  rejected because it sits **1.02 pp below** this. A threshold with a 1 pp margin to the nearest thing
  it must catch will be crossed by the next dataset.

---

## 4. The worst case — and it is NOT SC-1's headline

```
               owner_id               | count
--------------------------------------+-------
 ef4acac9-e860-4e71-9db5-ddaa2808cb9f | 25195
(1 row)
```

**One row. One owner. The whole table.**

`owner` is an exportable key on `deal`
(`VIEW_KEY_TO_EXPORT_KEY.owner`, `view-export-guard.ts:69`), so:

> **`/deals` with `owner=ef4acac9-e860-4e71-9db5-ddaa2808cb9f` returns 25,195 of 25,195 = 100.00% of
> the deals table, and it is UNDER the 50,000 cap, so nothing refuses it today.**

**This, not `search=a`, is the worst live instance of WR-04.** `search=a` walks out 96.09% of one
table; this walks out **100.00%**, and it does so through a filter the toolbar puts one click away.
The roadmap's `search=a` example understates the exposure. **SC-1 should name this case.**

`/activities` with the same owner is 79,022 (100%) and is refused today only **by accident** — it
happens to exceed `EXPORT_ROW_CAP`. Remove 29,023 activities and that refusal disappears. A control
that fires by coincidence of table size is not a control.

---

## 5. The two keys that CANNOT carry an SC-2 proof

```
              m               | count
------------------------------+-------
 deal_assignees_total         |     0
 activities_assignee_not_null |     0
 activities_completed         | 74857
(3 rows)
```

- **`deal_assignees` is EMPTY (0 rows)** and **`activities.assignee_id` is NULL for all 79,022 rows.**
  An SC-2 proof built on `assignee` would assert "this narrow export completes" against an **empty
  result set** — vacuously true, and true even with the whole selectivity rule deleted.
- **`owner` matches EVERY row** (§4). An SC-2 proof built on `owner` would assert "this narrow export
  completes" against the **whole table** — which the rule must refuse, so the cell would be asserting
  the opposite of SC-2.

**Build SC-2 on `search=ltda` (13,355 — §3), which is neither empty nor whole.** Recorded here so 50-06
avoids the trap rather than discovers it.

---

## 6. The cap's one live branch

`activities where deleted_at is null and completed_at is not null` → **74,857** (94.73% of 79,022).
That is `status=completed`'s predicate (`formatters.ts:530-531`) and it is the **one** request
`EXPORT_ROW_CAP = 50_000` really refuses on this data. See §9 for what the selectivity rule does to it.

---

## 7. SC-4's ladder — and the three days that add nothing

`dateTo` is half-open: `endOfDayExclusive` (`src/lib/filters/date-range.ts:66-75`) adds one UTC day,
which is why the query is `due_date < (d + interval '1 day')`.

```
   dateto   | matched |  pct
------------+---------+-------
 2023-01-18 |   22111 | 27.98
 2023-02-09 |   23683 | 29.97
 2023-03-10 |   26200 | 33.16
 2023-04-15 |   28942 | 36.63
 2023-05-15 |   30117 | 38.11
 2023-06-08 |   31479 | 39.84
 2023-06-09 |   31530 | 39.90
 2023-06-10 |   31530 | 39.90
 2023-06-11 |   31530 | 39.90
 2023-06-12 |   31612 | 40.00
 2023-06-13 |   31679 | 40.09
(11 rows)
```

```
 due_date_null |       min_due       |       max_due       | total
---------------+---------------------+---------------------+-------
             0 | 2022-01-13 00:00:00 | 2030-05-07 00:00:00 | 79022
(1 row)
```

**Zero null `due_date`s across all 79,022 rows**, spanning 2022-01-13 → 2030-05-07. The ladder is
therefore total and strictly nested: every widening of `dateTo` is a superset of the previous one, and
no row escapes the knob.

### The flat sequence is CONFIRMED

**2023-06-09, 2023-06-10 and 2023-06-11 all return exactly 31,530.** Three consecutive daily
widenings that add **zero** rows.

This matters because SC-4 asks for the boundary to be *approached* — *"widen a filter step by step
until it trips"*. A "step" that changes no count is not a step, and a ladder containing one is not
evidence of an approach; it would pass identically against a rule that ignored `dateTo` entirely
between those dates.

- **Last ADMITTED date:** `2023-06-11` (31,530 ≤ 31,608). This is the true date boundary.
- **First REFUSED date:** `2023-06-12` (31,612 > 31,608).
- **Last ADMITTED count-distinct step:** `2023-06-09` (31,530). RESEARCH §8's fine ladder names this
  date as "last ADMITTED", which is **true but is not the date boundary** — 06-10 and 06-11 are also
  admitted and also return 31,530.

### The strictly-increasing ladder 50-06 must use

Every step below adds rows. **50-06's ladder must be these dates and no others**; do not insert
2023-06-10 or 2023-06-11 between the last two, because they add nothing and would make the "step by
step" claim unfalsifiable at exactly the point it matters.

| step | `dateTo` | matched | pct | delta vs previous | verdict at allowance 31,608 |
|---|---|---|---|---|---|
| 1 | `2023-01-18` | 22,111 | 27.98% | — | ADMITTED |
| 2 | `2023-02-09` | 23,683 | 29.97% | +1,572 | ADMITTED |
| 3 | `2023-03-10` | 26,200 | 33.16% | +2,517 | ADMITTED |
| 4 | `2023-04-15` | 28,942 | 36.63% | +2,742 | ADMITTED |
| 5 | `2023-05-15` | 30,117 | 38.11% | +1,175 | ADMITTED |
| 6 | `2023-06-08` | 31,479 | 39.84% | +1,362 | ADMITTED |
| 7 | `2023-06-09` | 31,530 | 39.90% | +51 | **ADMITTED — last** |
| 8 | `2023-06-12` | 31,612 | 40.00% | +82 | **REFUSED — first** |

The crossing bracket is **31,530 admitted → 31,612 refused**, a **0.10 pp** window, and the decision
flips **exactly once** across the eight steps.

---

## 8. Derived allowances

Computed, not asserted by hand:

```
$ node -e 'const t={organizations:46054,people:38348,deals:25195,activities:79022};
           for(const k of Object.keys(t)){const total=t[k];
           console.log(k, total, "allowance=", Math.max(1000, Math.floor(total*0.4)))}'
organizations 46054 allowance= 18421
people 38348 allowance= 15339
deals 25195 allowance= 10078
activities 79022 allowance= 31608
```

| table | total | allowance = `max(1000, floor(total × 0.40))` |
|---|---|---|
| organizations | 46,054 | **18,421** |
| people | 38,348 | **15,339** |
| deals | 25,195 | **10,078** |
| activities | 79,022 | **31,608** |

**`MIN_EXPORT_ROWS = 1,000` is dominated by the fraction on every one of the four tables.** The floor
binds only below **2,500** rows (`floor(2500 × 0.40) = 1000`), and the smallest live table is 25,195.
**No database in this repository can reach the branch the floor guards** — not the live one, and not
`pipelite_dedup_test`, which is provisioned `--schema-only` and starts empty. It is provable **only**
by unit cells on the pure function, and no plan in this phase may imply live coverage for it.

---

## 9. CONSEQUENCE to carry to sign-off: the selectivity rule makes `EXPORT_ROW_CAP` unreachable

```
$ node -e '...'
50001 of 79022 = 63.27% allowance(79022)= 31608 -> selectivity refuses first: true
completed 74857 of 79022 = 94.73% refused by selectivity: true
smallest total where a >cap set can still be within allowance: 125003 allowance= 50001
```

A set that exceeds 50,000 rows on a 79,022-row table is **63.27%** of it, which the 0.40 rule refuses
first. So once this phase lands:

- The cap's **one live branch** — `activities status=completed`, 74,857 rows (94.73%) — is refused by
  **selectivity**, not by the cap. The cap stops firing on this data entirely.
- The cap becomes reachable again only once a table passes **125,003 rows**, the smallest total at
  which `floor(total × 0.40) ≥ 50,001` and a >50,000-row set can still be inside the allowance.

**The cap is NOT to be removed.** It is defence in depth, it costs nothing, and it fires again as the
tables grow past 125,003 rows. Two independent controls is the point of having both — as
`view-export-guard.ts:39-40` already says of the cap and the filter guard.
**`view-filters.test.ts:766-773` is NOT to be touched**: it asserts the cap's value and its live
meaningfulness in both directions, and it is still true.

Recorded so 50-08's sign-off can state this deliberately rather than discover a "vacuous cap" and
delete a control.

---

## 10. Suite baseline — the 5,696-vs-5,659 disagreement, resolved by observation

All five commands run from the worktree root
(`/home/pedro/programming/pipelite/.claude/worktrees/agent-abb2099eb9f44799f`), at base commit
`9f8cfb4`, **before** any of this plan's source changes.

```
$ ./node_modules/.bin/vitest run
 RUN  v4.1.11 /home/pedro/programming/pipelite/.claude/worktrees/agent-abb2099eb9f44799f

 Test Files  185 passed | 2 skipped (187)
      Tests  5696 passed | 32 skipped (5728)
   Start at  10:39:14
   Duration  73.50s
```

```
$ ./node_modules/.bin/vitest run --config vitest.rsc.config.ts
 Test Files  2 passed (2)
      Tests  8 passed (8)
```

```
$ ./node_modules/.bin/tsc --noEmit
TSC_EXIT=0
```

```
$ ./node_modules/.bin/eslint
✖ 118 problems (0 errors, 118 warnings)
```

```
$ npm run test:db
-> tables: 36 / generated: 4 / notes_migration_uniq: 1 / organizations: 0
OK: pipelite_dedup_test is ready and empty.
 Test Files  13 passed (13)
      Tests  299 passed (299)

$ npm run test:db > /tmp/testdb-exit-check.log 2>&1; echo $?
TESTDB_EXIT=0
```

| measure | STATE.md:30 claims | task env block claims | **MEASURED 2026-08-27** | verdict |
|---|---|---|---|---|
| base suite tests | 5,659 / 32 skipped | 5,696 / 32 skipped | **5,696 passed / 32 skipped (5,728)** | **the env block is RIGHT; STATE.md is STALE by 37 tests** |
| base suite files | 184 (+2) | 185 | **185 passed / 2 skipped (187)** | **env block RIGHT; STATE.md stale** |
| rsc | 8/8 | 8/8 | **2 files / 8 passed** | both right |
| `tsc --noEmit` | 0 | 0 | **exit 0, no output** | both right |
| eslint errors | — | 0 | **0 errors** | right |
| eslint warnings | — | 117 | **118 warnings** | **DIFFERS by 1 — and this is exactly why the phase gate is on ERRORS only.** Not reproducible across trees (124 on main vs 122 in a Phase 49 worktree vs 118 here). Never gate on it. |
| `test:db` | 288 / 13 | 299 / 13, EXIT 0 | **299 passed / 13 files, EXIT 0** | **env block RIGHT; STATE.md stale by 11 tests** |

**`npm run test:db`'s exit code IS usable** — 0 on a green suite. DEF-48-01 was closed in `37202ce`;
the Phase 49 plans' constraint text saying otherwise is **stale**. Gate on counts **and** exit code.

**The gate for this plan is therefore: 5,696 + N passed / 32 skipped, 8/8 rsc, tsc 0, eslint 0 errors,
test:db 299 / EXIT 0.**

---

## DELTA — every figure judged against RESEARCH §0 / §4 / §8

| figure | RESEARCH | measured 2026-08-27 | verdict |
|---|---|---|---|
| `organizations` | 46,054 (§0, `:162`) | 46,054 | MATCHES |
| `people` | 38,348 (§0, `:163`) | 38,348 | MATCHES |
| `deals` | 25,195 (§0, `:164`) | 25,195 | MATCHES |
| `activities` | 79,022 (§0, `:165`) | 79,022 | MATCHES |
| `audit_log` total | 214 (§0, `:167`) | 214 | MATCHES |
| `audit_log` `entity_type='export'` | 0 (§0, `:167`) | 0 | MATCHES |
| org `search=a` | 44,254 / 96.09% (§4 row 28) | 44,254 / 96.09% | MATCHES |
| org `search=ltda` | 13,355 / 29.00% (§4 row 18) | 13,355 / 29.00% | MATCHES |
| org `search=u` | 23,495 / 51.02% (§4 row 23) | 23,495 / 51.02% | MATCHES |
| org `search=zzzz` | (not in §4) | 0 / 0.00% | NEW — the zero-match anchor |
| deal `stage=FlyWheel` | 10,495 / 41.66% (§4 row 20) | 10,495 / 41.66% | MATCHES (stage name reads `FlyWheel`; §4's "(Closer)" suffix is a pipeline qualifier, not part of the name) |
| activity `type=Call` | 35,821 / 45.33% (§4 row 22) | 35,821 / 45.33% | MATCHES |
| activity `type=Task` | 33,529 / 42.43% (§4 row 21) | 33,529 / 42.43% | MATCHES |
| activity `status=completed` | 74,857 / 94.73% (§4 row 27) | 74,857 / 94.73% | MATCHES |
| `deal_assignees` | 0 (§0(b), `:223`) | 0 | MATCHES |
| `activities.assignee_id` non-null | 0 (§0(b), `:223`) | 0 | MATCHES |
| deals owner concentration | 25,195 / 25,195 = 100.00%, owner `ef4acac9…` (§0(b), `:212`) | 25,195 / 25,195 = 100.00%, owner `ef4acac9…` | MATCHES |
| `due_date` nulls | 0 (§8, `:757`) | 0 | MATCHES |
| `due_date` range | 2022-01-13 → 2030 (§8, `:757`) | 2022-01-13 00:00:00 → 2030-05-07 00:00:00 | MATCHES |
| ladder, all 11 dates | 22,111 / 23,683 / 26,200 / … / 31,530 / 31,612 (§8, `:782-784`) | identical, every one | MATCHES |
| ladder flat days 06-09/-10/-11 | not stated in §8 | all three = 31,530 | **NEW / CONFIRMED — see D-2** |
| **allowance at 0.40** | **31,609** (§8, `:774`) | **31,608** | **DIFFERS — see D-1** |
| base suite | 5,696 / 185 (env), 5,659 / 184 (STATE) | 5,696 / 185 | env block right, STATE stale |
| `test:db` | 299 / 13 (env), 288 / 13 (STATE) | 299 / 13, EXIT 0 | env block right, STATE stale |

### D-1 — **RESEARCH §8's `allowance` column is computed with `Math.round`, not `Math.floor`.**

**This is the one substantive DIFFERS, and it must not be quietly absorbed.**

`.planning/phases/50-export-authorization/50-RESEARCH.md:774` lists the allowance at fraction 0.40 as
**31,609**. The rule 50-CONTEXT locks is `max(MIN_EXPORT_ROWS, floor(total × MAX_EXPORT_FRACTION))`,
and `floor(79022 × 0.40)` is **31,608**. 31,609 is `round(31608.8)`.

Reproduced across the whole §8 table:

```
$ node -e 'const t=79022; for (const f of [0.10,0.15,0.20,0.25,0.30,1/3,0.40,0.50])
           console.log(f.toFixed(4), "floor=", Math.floor(t*f), "round=", Math.round(t*f))'
0.1000 floor= 7902  round= 7902
0.1500 floor= 11853 round= 11853
0.2000 floor= 15804 round= 15804
0.2500 floor= 19755 round= 19756   <- §8 says 19,756
0.3000 floor= 23706 round= 23707   <- §8 says 23,707
0.3333 floor= 26340 round= 26341   <- §8 says 26,338 (neither; that row is wrong by a third amount)
0.4000 floor= 31608 round= 31609   <- §8 says 31,609
0.5000 floor= 39511 round= 39511
```

Three of the eight §8 rows match `round` and not `floor`. The 1/3 row matches neither.

**What it does NOT change:** the crossing bracket is unaffected. 31,530 ≤ 31,608 is still ADMITTED and
31,612 > 31,608 is still REFUSED, so SC-4's ladder, the last-admitted date and the first-refused date
all stand exactly as §8 describes them.

**What it DOES change — the named integer:**

- **The activities allowance is 31,608. Not 31,609.**
- **`31,609` is the smallest REFUSED count** (`allowance + 1`), which is a useful number but is a
  different one, and calling it "the allowance" inverts a boundary.
- **Affected plans: 50-04 and 50-06.** Any cell that asserts `exportAllowance(79022)` must expect
  **31,608**. Any cell that asserts "the first refused count" must expect **31,609**. A plan that
  copied 31,609 out of §8 as the allowance would assert `exportAllowance(79022) === 31_609` and go RED
  against **correct** code — the failure mode this milestone has now hit nineteen times, in its
  inverted form.
- This plan's own boundary cells are written on the corrected value and pin the direction from both
  sides: `(31_608, 79_022)` ADMITTED and `(31_609, 79_022)` REFUSED. That pair is what makes the
  distinction unmistakable to the next reader.

### D-2 — the flat ladder days, confirmed at execution time

RESEARCH §8's fine ladder names `2023-06-09` as "last ADMITTED". Measured today, **2023-06-09, -06-10
and -06-11 all return 31,530**, so the last admitted DATE is `2023-06-11` and RESEARCH's statement is
true-but-not-the-boundary. 50-06's ladder must use the strictly-increasing dates in §7's table.
**No figure moved here** — this is a precision correction, not a measurement change.

---

## Summary

**Nothing measured has MOVED.** Every live figure this phase rests on reproduced exactly, at the third
independent measurement. The proofs designed around these numbers can be executed as designed; none
needs re-designing.

The two corrections are both about arithmetic performed *on* the measurements rather than about the
measurements themselves: **D-1** (RESEARCH's allowance column used `round` where the locked rule uses
`floor`, so the activities allowance is 31,608) and **D-2** (three ladder days add zero rows, so the
"step by step" ladder must skip them). Both are recorded here with the affected plans named, and
neither is quietly adopted anywhere.

The suite baseline disagreement is resolved **in favour of the task environment block**: 5,696 / 32
over 185 files, `test:db` 299 / 13 / EXIT 0. `.planning/STATE.md:30` is stale by 37 base tests and 11
db tests. **`.planning/STATE.md` is the orchestrator's file — this plan does not edit it. The
correction is handed off in `50-01-SUMMARY.md`.**

**No timing figure appears in any assertion anywhere as a result of this document.** The durations
above are transcript prose; `src/lib/__tests__/suite-timing-hygiene.test.ts` propagates clock taint by
variable NAME rather than by scope, so an elapsed-time number that entered an assertion would convert
a count floor into a timing threshold one file over.
