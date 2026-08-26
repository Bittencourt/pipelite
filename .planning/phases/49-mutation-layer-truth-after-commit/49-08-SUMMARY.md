---
phase: 49-mutation-layer-truth-after-commit
plan: 08
subsystem: mutations
tags: [dedup, merge, formula-recalc, post-commit, db-test, postgres, vacuity-control, DATA-01, SC-3]

# Dependency graph
requires:
  - phase: 49-mutation-layer-truth-after-commit
    provides: "49-01's mintFieldDefinition / removeFieldDefinitions fixture and its re-measured premise (0 live type='formula' definitions); 49-07's post-commit block idiom as shipped four times"
provides:
  - "A third post-commit block in mergeRecordsMutation that recalculates THE SURVIVOR's own formulas, best-effort, never rethrowing, before the reparented children"
  - "The recomputed survivor blob handed FORWARD to the children's block, which resolves {{Organization.*}} from a captured row object and not from the database"
  - "src/lib/mutations/dedup-formula.db.test.ts — 15 cells against real PostgreSQL with a manufactured type='formula' definition, plus the survivor-wins VACUITY CONTROL"
  - "7 new unit cells in dedup.test.ts pinning placement, the changedFields spelling, cascade:false, the explicit budget, the ordering AND its observable consequence, and D-05"
  - "SEVEN ablations, each with a verbatim red — including the Object.keys(fieldChanges) spelling trap driven on BOTH its unit and behavioural halves"
  - "Two defects found in this plan's own work: a VACUOUS ordering assertion, and a clock read that made two SQL row-count floors read as elapsed-time thresholds"
affects: [49-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A post-commit block that hands its result FORWARD to the next post-commit block, because the next one reads a captured row object rather than the database"
    - "A formula fixture reading TWO inputs, one won by each record, so the correct answer equals NEITHER stored value and a copied key cannot pass the discriminator"
    - "A VACUITY CONTROL cell: the same assertion shape on the vacuous fixture, run under unfixed code and recorded PASSING, kept in the file with a do-not-delete comment"
    - "recalcCalls() — a call-splitting helper that ASSERTS which call is which, so a reorder reddens in the helper instead of shifting every assertion onto the wrong argument object"

key-files:
  created:
    - src/lib/mutations/dedup-formula.db.test.ts
  modified:
    - src/lib/mutations/dedup.ts
    - src/lib/mutations/dedup.test.ts
    - .planning/phases/49-mutation-layer-truth-after-commit/deferred-items.md

key-decisions:
  - "PLACEMENT: a new post-commit block, BEFORE the reparented children's. recalculateFormulas uses the module-level db and takes no tx, so inside the transaction it would read a snapshot without the uncommitted survivor UPDATE and write outside its atomicity."
  - "EXPLICIT SURVIVOR, never a survivor-rooted cascade: cascadeToChildren short-circuits on `if (changed.size === 0) return 0`."
  - "SPELLING: the PRECISE construction — native COLUMN names from nativeValues/survivor, BARE definition names from merged.customFields/survivorBlob. NOT widened to the CHANGED_FIELDS_CUSTOM_SENTINEL; the precise form did not prove fragile."
  - "cascade: false, with the WR-02 residual named — the survivor's PRE-EXISTING children keep Organization.* values a merge made stale, which is not this block's work."
  - "BUDGET: a second, independent FORMULA_EVALUATION_BUDGET written at the call site. The doubling is accepted and bounded (one entity, no cascade)."
  - "PLAN DEFECT FOUND AND FIXED: decision 4's ordering rationale was FALSE as the plan described it. recalcReparentedChildren resolves {{Organization.*}} from `outcome.survivorRow` — a captured object — so ordering the survivor first bought NOTHING until the recomputed blob was handed forward. The hand-off is the fix and it has its own unit cell."
  - "THE FIXTURE'S FORMULA READS TWO INPUTS, not one. With one input the correct post-merge answer (74) would have equalled the LOSER's own stored value, so a merge that copied the loser's formula key would have satisfied the discriminator. This is a strengthening beyond the plan."
  - "The db file does NOT call registerAuditSubscriber(): the tombstone is dedup.db.test.ts's subject, and registering it here would add a fire-and-forget INSERT racing this file's teardown for no gain."
  - ".planning/STATE.md was deliberately NOT modified — the orchestrator owns it. The exact ADDITION is handed off below."

patterns-established:
  - "Break the ordering gate on purpose: a `mock.invocationCallOrder[0] < [1]` assertion is monotonic by construction and can never fail. Resolve the indices from the recorded ARGUMENTS."
  - "When suite-timing-hygiene flags a count as an elapsed threshold, look for a same-file NAME collision — its taint is name-based, not scope-aware — and delete the clock read rather than the gate"

requirements-completed: [DATA-01]

# Metrics
duration: 34min
completed: 2026-08-26
---

# Phase 49 Plan 08: SC-3 — The Survivor's Formula After a Merge Summary

**A merge now leaves the survivor's stored formula value equal to a value computed independently in
the test from its post-merge inputs — `174`, from `37 * 2 + 100`, where the survivor stored `122` and
the loser stored `574`, so the answer is reachable only by recomputation from a MIXTURE of the two
records and not by keeping either one.**

The two things this plan was built around are both on the record as measurements: the
`Object.keys(fieldChanges)` spelling trap was driven and reddened on both its unit and behavioural
halves, and the survivor-wins vacuity control was run under unfixed code and recorded PASSING.

---

## What Changed

### `src/lib/mutations/dedup.ts` — a third post-commit block

Inserted BEFORE the reparented-children block, with the existing blocks renumbered so the file reads
in execution order. Its comment states all five decisions (placement, explicit survivor, spelling,
`cascade: false` with WR-02, the accepted budget doubling).

```ts
const survivorChangedFields = [
  ...Object.keys(nativeValues).filter((key) => !Object.is(survivor[key], nativeValues[key])),
  ...Object.keys(merged.customFields).filter(
    (key) => !Object.is(survivorBlob[key], merged.customFields[key])
  ),
]
```

`fieldChanges` — the audit diff, 300 lines above — is **not referenced**.

### The plan defect: decision 4's rationale was false as written

The plan ordered the survivor first because "the survivor's formulas feed `Organization.*` into its
children, so running it first means block 1's children read fresh parent values". **That is not what
the code did.** `recalcReparentedChildren` hands `outcome.survivorRow` — the object captured from the
survivor `UPDATE`'s `.returning()` — to `buildRelatedEntities`. It never re-reads the row. So
ordering the survivor first changed nothing observable, and the children would still have been fed a
parent formula value derived from an input the survivor no longer held: DATA-01 again, one hop down.

The fix is three lines:

```ts
let survivorRowForChildren = outcome.survivorRow
// … inside block 1, on success:
if (survivorRecalc.customFields) {
  survivorRowForChildren = { ...outcome.survivorRow, customFields: survivorRecalc.customFields }
}
```

`let` and declared outside the block, because block 1 is best-effort and block 2 must still run
against the best row available. It has its own unit cell, and that cell has an anti-vacuity anchor
asserting the key it looks for is **not** on the pre-recalculation row.

### The fixture strengthening: two inputs, not one

The plan specified one input field and "a doubling". That fixture has a hole. With
`SURVIVOR_INPUT = 11`, `LOSER_INPUT = 37` and `{{Input}} * 2`, the correct post-merge value is **74**
— which is exactly the loser's own stored value. A merge that copied the loser's formula key rather
than recomputing would have satisfied both the equality and the does-not-equal-pre-merge
discriminator.

The shipped fixture reads TWO fields, one won by each record:

| | INPUT A | INPUT B | stored formula |
|---|---|---|---|
| survivor, pre-merge | 11 | 100 | **122** = 11·2 + 100 |
| loser, pre-merge | 37 | 500 | **574** = 37·2 + 500 |
| survivor, post-merge (A taken from the loser) | 37 | 100 | **174** = 37·2 + 100 |

`174 ∉ {122, 574}`, and a floor cell asserts the three pairwise distinct **before any claim is made**,
with messages naming which failure mode each exclusion buys.

---

## The Pre-Fix Transcript (Task 1, RED, both values quoted)

`vitest run --config vitest.db.config.ts src/lib/mutations/dedup-formula.db.test.ts` against the
unmodified `dedup.ts`:

```
 ❯ |db| src/lib/mutations/dedup-formula.db.test.ts (15 tests | 3 failed) 688ms
     × recomputes the survivor's formula from its POST-MERGE inputs, with one reparented child
     × recomputes the survivor's formula when there are NO reparented children at all
     × produces the same value a FRESH recalculation of the same row produces, without bumping updated_at

AssertionError: the survivor now holds INPUT A = 37 and INPUT B = 100, so the only value consistent
with the record is 37 * 2 + 100 = 174. A stored 122 means nothing was recomputed; a stored 574 means
the loser's value was copied rather than computed.: expected 122 to be 174 // Object.is equality

- Expected
+ Received
- 174
+ 122

 Test Files  1 failed (1)
      Tests  3 failed | 12 passed (15)
```

**All four pre-flight floors passed, and so did "the survivor now holds the LOSER's INPUT A".** The
merge does what it is asked; only the recomputation was missing. The no-children cell fails
identically — and it is the strongest form of the defect, because `recalcReparentedChildren` returns
on an empty work list, so an organization pair with no shared deals or people recomputed **literally
nothing at all**.

After the fix: **15 passed (15)**.

---

## The Seven Ablations

Every one restored afterwards; `git diff --exit-code -- src/` exit **0** after each. The fix was
committed BEFORE the first ablation (49-03/49-04 both lost uncommitted work to
`git checkout -- <file>`).

### A1 — delete the new `recalculateFormulas` call (the primary control)

Unit: **9 of 32 red.** db: **3 of 15 red**, the same `expected 122 to be 174`.

```
 ❯ src/lib/mutations/dedup.test.ts (32 tests | 9 failed)
     × refreshes every reparented child once, sharing ONE evaluation budget
     × keys the parent's changed refs by the prefix buildRelatedEntities itself used
     × recalculates the SURVIVOR itself, naming the merge's own entity type
     × SPELLING: changedFields carries the BARE custom-field name and the native COLUMN name, …
     × ANCHOR: the recorded changedFields is NON-EMPTY
     × cascade is exactly false, and the budget is written at the call site
     × ORDERING: the survivor's recalculation is invoked BEFORE the first reparented child's
     × ORDERING HAS A CONSEQUENCE: the children are handed the survivor's FRESH formula values
     × D-05: a REJECTED survivor recalculation leaves the merge successful and logs …

AssertionError: expected "vi.fn()" to be called 4 times, but got 3 times
```

### A2 — `changedFields: Object.keys(fieldChanges)` — **THE MOST CONSEQUENTIAL TRANSCRIPT IN THIS PLAN**

This is the exact shape in which DATA-01 would have shipped green over the defect. **Both halves
reddened.**

Unit — and note it is the ONLY red, 31 of 32 stayed green:

```
 ❯ src/lib/mutations/dedup.test.ts (32 tests | 1 failed)
     × SPELLING: changedFields carries the BARE custom-field name and the native COLUMN name, and nothing prefixed

AssertionError: ["customFields.CNPJ / CPF"] carries the AUDIT DIFF's spelling.
`scopeFormulasToChangedFields` matches the bare definition name, a native attribute via its column
name, or the coarse sentinel — never a dotted `customFields.<Name>`. A call built from
`Object.keys(fieldChanges)` therefore selects NO formula, writes NOTHING, and looks exactly like a
fix.: expected [ 'customFields.CNPJ / CPF' ] to deeply equal []

- Expected
+ Received
- []
+ [
+   "customFields.CNPJ / CPF",
+ ]
```

Behavioural — the call happens, the arguments look plausible, and the database is untouched:

```
 ❯ |db| src/lib/mutations/dedup-formula.db.test.ts (15 tests | 3 failed) 497ms
AssertionError: … expected 122 to be 174 // Object.is equality
```

**Without that one unit cell, this plan would have shipped a call that ran on every merge, cost a
definition read, and wrote nothing** — with the behavioural file as the only detector, reporting the
value and never the cause.

### A3 — move the survivor's block AFTER the children's

Unit: **7 red**, with the recorded order printed:

```
AssertionError: the FIRST recalculation must be the SURVIVOR's — the survivor's formulas feed
`Organization.*` into its children, so a child refreshed first reads a parent value derived from an
input the survivor no longer holds. Recorded order: deal:d1 -> deal:d2 -> person:p1 ->
organization:org-survivor: expected 'd1' to be 'org-survivor' // Object.is equality
```

**A3 also found the second defect in this plan's own work — see below.** After fixing the ordering
cell, it reddens on its own terms:

```
AssertionError: recorded order deal:d1 -> person:p1 -> organization:org-survivor — the survivor must
be invoked before the first child: expected 38 to be less than 36
```

**The db file stayed 15/15 GREEN under A3.** Said plainly, per the plan's own instruction: *nothing
behavioural notices the reorder.* The ordering claim rests on those two unit cells and **no
behavioural discrimination is claimed for it.** The reason is structural, not an oversight in the
ablation: the fixture reparents a `deal`, there are no `type='formula'` definitions on `deal`, so
`childReferencesChangedParentField` returns false and no child is recomputed in either order. Logged
as **DEF-49-05** with what closing it would take, and why that is WR-02's second-hop territory rather
than DATA-01's.

### A4 — `cascade: true`

Unit: **1 red**, and precisely the intended one:

```
 ❯ src/lib/mutations/dedup.test.ts (32 tests | 1 failed)
     × cascade is exactly false, and the budget is written at the call site
AssertionError: expected true to be false // Object.is equality
```

db: **15/15 green.** What changes, stated exactly: `cascadeToChildren` filters
`CASCADE_CHILD_RELATIONS` to the two with `parent: "organization"` (`deal`, `person`) and calls
`loadDefinitions` for each, so the cost in this fixture is **two extra `custom_field_definitions`
SELECTs**. The **evaluation count does not move and no child row is queried**, because
`if (!childReferencesChangedParentField(childDefinitions, …)) continue` precedes the child SELECT and
both child definition lists are empty. *That last sentence is read off `formula-recalc.ts:855-864`,
not measured — labelled as reasoning, not as a transcript.* With child formula definitions present it
would be up to a full extra budget, which is the doubling decision (e) already accounts for.

### A5 — withhold the minted `type='formula'` definition (fixture ablation)

The T-49-08-04 mitigation, driven. **4 red**, and the point is *which* one names the cause:

```
 ❯ |db| src/lib/mutations/dedup-formula.db.test.ts (15 tests | 4 failed)
     × FLOOR: at least 1 live type='formula' definition exists on organization
     × recomputes the survivor's formula from its POST-MERGE inputs, with one reparented child
     × recomputes the survivor's formula when there are NO reparented children at all
     × produces the same value a FRESH recalculation of the same row produces, …

AssertionError: with ZERO formula definitions `scopeFormulasToChangedFields` returns an empty scope
before reading a row, `recalculateOneEntity` writes nothing, and EVERY assertion in this file passes
against an un-derived blob — before AND after the fix. The live database held zero of these on
2026-08-26 (49-01), which is why the fixture mints its own. This floor is what makes the rest of the
file a proof.: expected 0 to be greater than or equal to 1
```

Unlike 49-01's R4, the floor is **not** the only cell that reddens here — the three proof cells
redden too. But they redden with `expected 122 to be 174`, which points at the mutation. **The floor
is the only cell that reports the real cause**, which is the `crm-ownership.db.test.ts:348-395`
lesson in a different costume. The teardown floor was temporarily relaxed from 3 to 2 for this run;
left at 3 it would have reddened as well (`definitions removed 2`).

### A6 — make `changedFields` genuinely EMPTY (both halves self-compare)

The specific defect the non-empty anchor exists for. **2 red**, and the diagnostic value is in what
**passed**:

```
 ❯ src/lib/mutations/dedup.test.ts (32 tests | 2 failed)
     × SPELLING: changedFields carries the BARE custom-field name and the native COLUMN name, …
     × ANCHOR: the recorded changedFields is NON-EMPTY

AssertionError: expected [] to include 'CNPJ / CPF'

AssertionError: an empty changedFields makes `inScope` empty, which makes `recalculateOneEntity`
return before it reads a row — a call that happened and did nothing: expected 0 to be greater than
or equal to 2
```

**The `prefixed` predicate PASSED.** An empty array satisfies "nothing begins `customFields.`"
perfectly. That is the vacuity the anchor exists to catch, reproduced rather than described.

### A7 — change the scope literal to a different, well-formed scope

`"dedup-merge"` → `"dedup-recalc"`. **1 red**, and `log-scope-format.test.ts` stayed **GREEN** —
which is the finding: that gate asserts the SHAPE of a scope, so it cannot see a scope that is
well-formed and wrong. The D-05 cell is the only detector for the scope's IDENTITY.

```
AssertionError: no logged line carried the scope literal; captured:
["{\"level\":\"error\",\"scope\":\"dedup-recalc\",\"msg\":\"post-merge survivor formula
recalculation failed\",…}"]: expected false to be true
```

---

## The Vacuity Control, Side by Side (Task 3)

Both halves under the SAME unfixed `dedup.ts` (A1, the deleted call), in the same file, in the same
run:

**The real proof — RED:**

```
 × recomputes the survivor's formula from its POST-MERGE inputs, with one reparented child
 × recomputes the survivor's formula when there are NO reparented children at all
 × produces the same value a FRESH recalculation of the same row produces, without bumping updated_at

AssertionError: … expected 122 to be 174 // Object.is equality
```

**The vacuity control — GREEN, isolated with `-t "VACUITY CONTROL"` so there is no ambiguity:**

```
 ✓ |db| …dedup-formula.db.test.ts > SC-3 / DATA-01 … > VACUITY CONTROL: with the SURVIVOR winning
   INPUT A this same assertion passes with or without the fix — do not delete it 63ms

 Test Files  1 passed (1)
      Tests  1 passed | 14 skipped (15)
```

**The finding.** An SC-3 test whose `choices` map is empty or all-survivor reports SUCCESS against
the unfixed code. It uses the identical assertion shape on the identical fixture and differs in
exactly one string. That is why the criterion's wording — *"merging two records whose formula inputs
disagree"* — is a fixture requirement and not decoration.

And it is worse than merely uninformative under the FIXED code, which is the part not inherited from
research: with an all-survivor choice map **nothing changed**, so the correct implementation computes
`changedFields = []` and deliberately writes nothing. The control is green **for the opposite reason
to the one a reader would assume**. That sentence is in the control cell's own comment, above a
do-not-delete instruction, so the next person to touch the file cannot simplify it away.

---

## The Two Defects This Plan Found In Its Own Work

### D1 — the ORDERING cell was VACUOUS (`773df72`)

The cell written to detect exactly the A3 reorder did not detect it. A3 reddened seven cells; that
one stayed green.

```ts
const order = mockRecalculate.mock.invocationCallOrder
expect(order[0]).toBeLessThan(order[1])          // ← can NEVER fail
```

`invocationCallOrder` is monotonic by construction, so element 0 is below element 1 whichever call
each one is. It passed with the survivor recalculated **last**. Fixed by resolving the indices from
the recorded ARGUMENTS (`findIndex(input => input.entityId === "org-survivor")`), and deliberately
routed around `recalcCalls()` so it is a second independent detector rather than a restatement of
that helper's precondition. Re-driven under A3: `expected 38 to be less than 36`.

**This is the eighteenth-plus gate in this project that could not fail, and it was in the cell whose
entire purpose was the property being ablated.** The ablation is what found it. A green ablation is a
finding about the ablation.

### D2 — a clock read made two SQL row-count floors read as elapsed-time thresholds

`suite-timing-hygiene.test.ts` went red on this file with:

```
Offenders: src/lib/mutations/dedup-formula.db.test.ts:649: [tainted/threshold]
  expect( await liveFormulaDefinitionCount(), "…" ).toBeGreaterThanOrEqual(MIN_FORMULA_DEFINITIONS)
| src/lib/mutations/dedup-formula.db.test.ts:658: [tainted/threshold]
  expect( await liveInputDefinitionCount(), "…" ).toBeGreaterThanOrEqual(MIN_INPUT_DEFINITIONS)
```

Neither is clock-derived. **The gate's taint propagation is by NAME across a whole file and not by
scope**, so the chain was:

`fixtureId()` contains `Date.now()` → tainted function → `const id = fixtureId("deal")` taints the
NAME `id` file-wide → `const row = await readOrganization(id)` is tainted because its ARGUMENT is
named `id` → the name `row` is tainted file-wide → the shared `scalar()` helper returns `row?.value`
→ tainted function → every count derived from it.

Fixed by **deleting the clock read**, which this file never needed: its fixtures are all removed in
`afterEach` and the isolated database is rebuilt per run, so a counter suffices. The gate was not
weakened, no path was excluded, and no threshold was raised — which is what the gate's own message
demands. Worth flagging for 49-09: **any new `*.test.ts` that binds `const id = <anything
clock-derived>` will report unrelated `toBeGreaterThan*` assertions in the same file as elapsed-time
thresholds.**

---

## The Four Vacuity Tests, Applied

**91 assertions across 22 cells** (65 `expect(` in the new db file over 15 cells, 26 in the 7 new
unit cells; counted with `node` over comment-stripped source, never a `grep | wc -l` pipe).

| Test | Result |
|---|---|
| **(1) Can it be made to fail by breaking what it protects?** | **YES for 78 of 91.** Seven ablations cover the survivor call, the spelling, the non-empty floor, `cascade`, the budget, the ordering, the ordering's consequence, D-05, the scope literal, the definition floor and all three proof cells. **NOT PROVEN in this plan for 13:** the 12 assertions in the six isolation-guard cells and the `updated_at`-unchanged assertion. The guard cells each carry their own negative (`.toThrow`), and they are copied from `dedup.db.test.ts`, which has its own record — no red is recorded **here**, and they are named unproven-in-this-plan rather than counted as delivered. |
| **(2) Does it have a FLOOR as well as a ceiling?** | **Yes, and A5/A6 prove two of them fire.** Named-integer floors: `MIN_FORMULA_DEFINITIONS = 1`, `MIN_INPUT_DEFINITIONS = 2`, `MIN_DEFINITIONS_REMOVED = 3`, `EXPECTED_REPARENTED_CHILDREN = 1`, `NO_REPARENTED_CHILDREN = 0`, `EXPECTED_CHANGED_FIELDS.length = 2`. **A6 is the demonstration that matters:** with `changedFields = []` the `customFields.`-prefix predicate PASSED and only the floor reddened. Two further design-time floors assert `174 ∉ {122, 574}` before any claim, and one asserts the two records' inputs differ. |
| **(3) Does it collide with its own explanatory prose?** | **No, and it structurally cannot.** Every assertion in both files is behavioural or over a mocked call's recorded arguments. There is **no `toContain` over `dedup.ts` source** anywhere in this plan (constraint 17), so the fifteen-times-in-this-project failure mode — the comment explaining a rule tripping the rule's own grep — has no surface here. The two source-token searches this plan performs are `CUSTOM_FIELD_PREFIX` and `CHANGED_FIELDS_CUSTOM_SENTINEL`, and both are **imported constants**, not literals. |
| **(4) Would renaming the searched token turn it RED rather than green?** | **Yes, and A7 is the measurement.** Renaming the log scope to a different well-formed value reddens the D-05 cell while `log-scope-format.test.ts` stays green. Renaming the field-definition names would redden the floors and the proof (the expression literal and the expectations are built from the same three constants, so they cannot drift silently). Renaming `CUSTOM_FIELD_PREFIX` is a compile error, not a silent pass. |

**Result: no vacuous assertion remains, four tests applied to 91 assertions — after ONE was found and
fixed (D1) and one gate collision was resolved at its cause (D2).** Thirteen assertions carry no red
recorded in this plan and are named above rather than counted.

---

## Verification

| Check | Result |
|---|---|
| `vitest run --config vitest.db.config.ts …dedup-formula.db.test.ts …dedup.db.test.ts` | **37 passed (37)** over 2 files — `dedup.db.test.ts` unmodified and green, so this file's teardown did not make it report a leak |
| full db project | **288 passed (288)** over **13 files**, **EXIT 0** (baseline 273 / 12 files; +15, +1 file) |
| `vitest run src/lib/mutations/dedup.test.ts` | **32 passed (32)** — 25 pre-existing + 7 new |
| `vitest run src/lib/log-scope-format.test.ts` | green |
| `vitest run` (base) | **5659 passed / 32 skipped** over **184 files** (+2 skipped files) — baseline 5652/32/184, delta **+7**, exactly the seven new unit cells |
| RSC project | **8 passed (8)** |
| `tsc --noEmit` | exit **0** |
| `npm run lint` | **0 errors** (118 warnings — the warning total is not a gate, not reproducible across trees) |
| `git diff --exit-code -- src/` after all seven ablations | exit **0** |
| `suite-timing-hygiene` / `suite-hook-hygiene` / `db-test-isolation` | **204 passed** together with the two above |

The base suite delta being **exactly +7** is the positive confirmation that the new `*.db.test.ts`
did not leak into the base project: the file's own 15 cells are absent from that count, and the file
count moved by 0 there and by 1 in the db project.

**DEF-48-01 is confirmed CLOSED.** The db project exits **0** on a green suite; gated on both the
count and the exit code, as the phase's updated guidance says.

---

## HANDOFF: the exact `.planning/STATE.md` ADDITION

Unlike 49-07's, this is an **addition, not a replacement** — `.planning/STATE.md` carries no bullet
claiming a merge leaves the survivor's formulas stale (verified: no occurrence of "survivor" in the
file outside a Phase 47 note about `pgrep`). Insert immediately AFTER the existing
`- **A purge leaves the children it detaches holding stale formula values, permanently** …` bullet in
§ Blockers/Concerns (`.planning/STATE.md:676`):

> - **A merge recomputes the SURVIVOR's own formula fields, post-commit** (DATA-01, closed in Phase 49). `mergeRecordsMutation` writes the survivor's chosen values inside its transaction and then, AFTER the commit, calls `recalculateFormulas` naming the survivor explicitly — before the reparented children's refresh, with `cascade: false`, an explicit `budget: FORMULA_EVALUATION_BUDGET`, and a `changedFields` array of **native COLUMN names and BARE definition names**. The spelling is the load-bearing part: the audit diff built 300 lines above uses `customFields.<Name>`, which matches none of `scopeFormulasToChangedFields`' three modes, so that array would have produced a call that recomputed nothing and looked exactly like a fix (driven as an ablation, reddening one unit cell and three behavioural ones). It cannot run inside the transaction — `recalculateFormulas` uses the module-level `db` and takes no `tx` — and it cannot be left to a survivor-rooted cascade, which short-circuits on `if (changed.size === 0) return 0`. Best-effort and never rethrowing (D-05): a rejected recalculation leaves the merge committed, the loser in Trash, the bus emit fired, and one `log.error("dedup-merge", …)`. The recomputed blob is handed FORWARD to the children's block, which resolves `{{Organization.*}}` from a captured row object rather than from the database — without that hand-off, ordering the survivor first would buy nothing. Proven behaviourally against real PostgreSQL with a manufactured `type='formula'` definition in `src/lib/mutations/dedup-formula.db.test.ts` (plan 49-08), including the no-reparented-children case, which is the case that previously recomputed nothing at all. **Still open, and named rather than implied:** the survivor's **PRE-EXISTING** children keep `Organization.*` values that the merge made stale (WR-02's territory, `cascade: false` by decision); and the survivor-first ORDERING has **no behavioural detector** — two unit cells hold it, the behavioural file is green under a reorder, and the reason is structural (**DEF-49-05**).

Force-add as an INDIVIDUAL file (`git add -f .planning/STATE.md`) — `.planning/` is
gitignored-but-tracked.

---

## Issues Encountered

- **The worktree was stale by 33 commits** — the 33rd consecutive occurrence, every executor. Corrected with `merge --ff-only` (never `reset --hard`) and verified by asserting the two sentinel files exist: `src/lib/trash/purge-blobs.db.test.ts` (49-07) and `src/lib/__tests__/custom-field-definition-fixture.ts` (49-01).
- **The worktree isolation guard refused three commands** — a `for f in …; do …; done` existence loop, a `setup && vitest | tail; echo $PIPESTATUS` compound, and one other pipeline — all with "too complex to verify that it stays inside the worktree". Split into plain commands, as 49-07 recorded.
- **`rtk proxy grep` used for every source search**; **no count in this SUMMARY comes from a `grep | wc -l` pipe.** The 91/65/26 assertion counts and the 985 line count are from `node` over comment-stripped source; the test totals are vitest's own tallies. One `rtk proxy grep -A 25` was truncated by `Broken pipe (os error 32)` and was re-run with `sed -n`.
- **`git status --porcelain` avoided**; cleanliness asserted with `git diff --exit-code`.
- **The two `.db.test.ts` files were run in the same command** as the plan required, and `dedup.db.test.ts` stayed green — its `beforeAll` empty-assertion over the six shared tables is the cross-file leak detector, and the new file's `afterAll` reports `definitions removed 3` plus full row-count parity on all eight of its tables.

## Known Stubs

None. Every cell in the plan's `<behavior>` blocks exists and passes. No `TODO`, no placeholder, no
hardcoded empty value that reaches an assertion. The two properties **not** covered by a red
observation are named rather than stubbed: the survivor-first ordering has no behavioural detector
(DEF-49-05, and A3's green db run is the evidence for that statement), and the six isolation-guard
cells carry no red recorded in this plan.

## Threat Flags

None. No new network endpoint, no new auth path, no schema change, no new file access. The one new
trust-boundary crossing — the audit-diff map versus the recalculation's scope gate — was already in
the plan's own threat register as T-49-08-02 and is the ablation this plan drove hardest.

| Threat ID | Mitigation status |
|---|---|
| T-49-08-01 (survivor keeps a value derived from a field it no longer holds) | post-commit call naming the survivor; **A1 is the red**; value computed in the test and corroborated by a second recomputation path |
| T-49-08-02 (the fix shipping green on the audit-diff spelling) | predicate + exhaustive equality + non-empty floor; **A2 drove BOTH the unit and behavioural reds**, and **A6 proved the predicate alone is satisfied by an empty array** |
| T-49-08-03 (survivor wins, so the answers coincide) | `choices` takes the loser; a floor asserts the inputs differ; **the control is MEASURED green under unfixed code** |
| T-49-08-04 (no formula definitions at all) | minted definition + named floor; **A5 is the red, and it is the only cell that names the cause** |
| T-49-08-05 (an unbounded second budget) | **accept, stated.** `cascade: false` bounds it; the number is at the call site; **A4 reddens the assertion**, and the fan-out cost is stated as read-derived rather than measured |
| T-49-08-06 (a rejected recalculation failing a committed merge) | own try/catch, never rethrows; **the D-05 cell asserts the result, the tombstone, the emit and the children's call all survive**; **A7 reddens the scope half** |
| T-49-08-07 (`updatedAt` bumped by a derived refresh) | asserted equal across a direct `recalculateFormulas` call on the same row, with an anti-vacuity check that the blanking statement did not move it either. **No red recorded** — the engine's omission cannot be ablated from this seam without editing `formula-recalc.ts`, which is out of scope |
| T-49-08-08 (a leaked `dedupfx-` row breaking `dedup.db.test.ts`) | separate file, own prefix, own 8-table `TOUCHED_TABLES`, two-part `afterAll`, `definitions removed 3` floor; both files run in one command and both green |
| T-49-08-09 (teardown against `pipelite`) | module-scope `assertIsolatedConnection`, six guard cells including the refuse-`pipelite`-by-name one |
| T-49-08-10 (a survivor-rooted cascade reported as the fix) | not reintroduced; `cascadeToChildren` is never called from `dedup.ts`; **A4 reddens `cascade` being anything but `false`** |
| T-49-08-11 (two executors racing `dedup-db-test-setup.sh`) | alone in wave 5 among db-test owners; the script was re-run before every db measurement |

## Next Phase Readiness

- **49-09 (sign-off)** — seven ablations with verbatim reds, two self-found defects in this plan's own proof, and the four-vacuity-test audit with its count are all above, so this plan's gates are DELIVERED under the milestone rule. **Three things are deliberately NOT claimed:** behavioural discrimination for the survivor-first ORDERING (DEF-49-05); a red for the `updated_at`-unchanged assertion (T-49-08-07, unablatable from this seam); and a red for the six isolation-guard cells (inherited from `dedup.db.test.ts`).
- **One item for the orchestrator:** the `STATE.md` ADDITION above. The source-side half is committed; the register-side half is not, by instruction.
- **One correction to the plan's own text, for the record:** the plan's constraint 16 says *"DEF-48-01: `npm run test:db` exits NON-ZERO on a GREEN suite. Never gate on its exit code."* That is stale — DEF-48-01 was closed in `37202ce`, and the db project measured **exit 0** here. Constraint 22's baselines were also stale (db 197, base 5546); the measured baselines were 273 and 5652.
- **One correction for whoever next writes a `*.db.test.ts`:** D2 above. A `const id = <clock-derived>` in the same file will make `suite-timing-hygiene` report unrelated count floors as elapsed-time thresholds.

## Self-Check: PASSED

Files claimed, verified on disk:

- `src/lib/mutations/dedup-formula.db.test.ts` — FOUND, 985 lines, 15 cells, carrying `assertIsolatedConnection` and `mintFieldDefinition`
- `src/lib/mutations/dedup.ts` — FOUND, carrying `recalculateFormulas` in a post-commit block that references `nativeValues`/`survivor` and `merged.customFields`/`survivorBlob`, and does NOT reference `fieldChanges` there
- `src/lib/mutations/dedup.test.ts` — FOUND, 32 cells
- `src/lib/mutations/dedup.db.test.ts` — UNMODIFIED (absent from every commit's file list) and green
- `.planning/phases/49-mutation-layer-truth-after-commit/deferred-items.md` — FOUND, carrying DEF-49-05
- `.planning/STATE.md`, `.planning/ROADMAP.md` — UNMODIFIED, by instruction

Commits claimed, verified in `git log --oneline`: `e8a9e74`, `d303edc`, `773df72`.

`git diff --diff-filter=D e8a9e74~1 HEAD` reports **no deleted files**. Working tree clean over
`src/` by `git diff --exit-code` (exit 0); no untracked files outside `.planning/`.

---
*Phase: 49-mutation-layer-truth-after-commit*
*Completed: 2026-08-26*
