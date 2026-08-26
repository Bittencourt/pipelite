---
phase: 48-rest-api-authorization
plan: 09
subsystem: api-documentation
tags: [openapi, documentation-gate, parsed-yaml, anti-vacuity, inverted-polarity, SEC-01, SEC-02, QG-03, DOC-48-01]

# Dependency graph
requires:
  - phase: 48-01
    provides: "the activities/[id] GET/PUT/DELETE 403 paths (:106, :157, :308) and the PUT foreign-owner_id 422 (:185-187) this document declares"
  - phase: 48-02
    provides: "the activities list WHERE-scope (:62) and the POST foreign-owner_id 422 (:165-167) — the first is why /activities GET must NOT declare a 403"
  - phase: 48-03
    provides: "the stages/[id] GET/PUT/DELETE 403 paths (:72, :102, :158)"
  - phase: 48-04
    provides: "ownedStagesPredicate and the stage-scope.ts autopsy that measures the 42601 reachability BACKLOG 999.18 denied"
  - phase: 48-08
    provides: "the measured treatment of the two SEC-48-A routes, ACCEPTED_KNOWN_ROUTES, and the 0 -> 1 answer to SEC-48-B"
provides:
  - "src/app/api/v1/__tests__/openapi-error-coverage.test.ts — the first test in this repository that reads public/openapi.yaml at all"
  - "six 403 and two 422 declarations in the published contract, matching the routes' measured behaviour"
  - "MUST_NOT_DECLARE_403_OPERATIONS — an inverted-polarity control over the three changed operations that have no 403 path"
  - "four corrected documents: formula-fields.md, BACKLOG 999.17, 999.18, SEC-48-A, SEC-48-B, REQUIREMENTS QG-03"
  - "BACKLOG DOC-48-01 — the ungated remainder of the spec, counted: 9 of 59 operations gated, 401 on 22 of 59, 429 on 12 of 59"
affects:
  - "any future phase adding a 403 or 422 to one of the nine gated operations — the spec must move with it"
  - "whoever closes DOC-48-01 — the both-polarity structure is already there to extend from 9 to 59"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Documentation gate that PARSES the artifact with the same call its production consumer makes, not a grep for a status token"
    - "Parse floors AND subject-list length floors: an it.each over an emptied array generates zero tests and reports success"
    - "Inverted-polarity documentation control: assert an operation does NOT declare a response it cannot emit, with the measured reason inline"
    - "Every absence assertion paired with a presence floor over the same document, so deleting the document cannot satisfy it"

key-files:
  created:
    - src/app/api/v1/__tests__/openapi-error-coverage.test.ts
  modified:
    - public/openapi.yaml
    - docs/development/formula-fields.md
    - .planning/BACKLOG.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "SIX 403 subjects, not the plan's nine — /activities GET, /activities POST and /stages GET have no 403 code path, and declaring one would be this plan's own defect pointed the other way"
  - "The three excluded operations became an INVERTED-POLARITY control rather than a silent omission, so the gate still covers exactly nine operations and a future 403 forces the entry to move"
  - "Ascending numeric response ordering (403 before 404), following the Notes precedent at :2864 that the plan cited, over the plan's literal 'after 404' sentence"
  - "$ref the existing ValidationError component for 422 rather than authoring a schema — precedent already set at :2868"
  - "DOC-48-01 corrects the plan's own draft: organizations/{id}, people/{id} and deals/{id} do NOT return 403; writing the plan's claim into the backlog would have repeated 999.18's failure mode"

requirements-touched: [SEC-01, SEC-02, QG-03]

# Metrics
duration: ~50min
completed: 2026-08-26
tasks: 3
tests-added: 37
---

# Phase 48 Plan 09: The Documented Contract — Summary

**The published API contract now declares the six 403s and two 422s Phase 48 created, held by the
first test in this repository that reads `public/openapi.yaml` at all — and the plan's own
verification script turned out to contain a dead needle, which is recorded below rather than
quietly fixed.**

## Performance

- **Duration:** ~50 min
- **Tasks:** 3 of 3
- **Files:** 1 created, 4 modified
- **Base suite:** 177 files / 5339 tests → **178 files passed / 2 skipped · 5376 passed / 32 skipped**

Delta: **+1 file, +37 tests** — exactly what this plan added. `5339 + 37 = 5376`; `177 + 1 = 178`.
No pre-existing test changed state, and the doc edits changed no test count.

---

## Task 1 — the RED output, verbatim

```
 ❯ src/app/api/v1/__tests__/openapi-error-coverage.test.ts (37 tests | 16 failed) 434ms
       × 'get' '/activities/{id}' declares a 403 22ms
       × 'put' '/activities/{id}' declares a 403 9ms
       × 'delete' '/activities/{id}' declares a 403 7ms
       × 'get' '/stages/{id}' declares a 403 1ms
       × 'put' '/stages/{id}' declares a 403 1ms
       × 'delete' '/stages/{id}' declares a 403 14ms
       × 'get' '/activities/{id}' resolves its 403 to the Forbidden component 20ms
       × 'put' '/activities/{id}' resolves its 403 to the Forbidden component 9ms
       × 'delete' '/activities/{id}' resolves its 403 to the Forbidden component 1ms
       × 'get' '/stages/{id}' resolves its 403 to the Forbidden component 6ms
       × 'put' '/stages/{id}' resolves its 403 to the Forbidden component 5ms
       × 'delete' '/stages/{id}' resolves its 403 to the Forbidden component 4ms
       × 'post' '/activities' declares a 422 1ms
       × 'put' '/activities/{id}' declares a 422 21ms
       × 'post' '/activities' resolves its 422 to the ValidationError component 1ms
       × 'put' '/activities/{id}' resolves its 422 to the ValidationError component 7ms

⎯⎯⎯⎯⎯⎯ Failed Tests 16 ⎯⎯⎯⎯⎯⎯⎯

AssertionError: GET /activities/{id} returns Problems.forbidden() to a non-owner but the published
spec does not declare '403'. An integrator reading the contract sees an authorization refusal as an
outage and retries it.: expected [ '200', '404' ] to include '403'

AssertionError: PUT /activities/{id} ... : expected [ '200' ] to include '403'
AssertionError: DELETE /activities/{id} ... : expected [ '204' ] to include '403'
AssertionError: GET /stages/{id} ... : expected [ '200', '404' ] to include '403'
AssertionError: PUT /stages/{id} ... : expected [ '200' ] to include '403'
AssertionError: DELETE /stages/{id} ... : expected [ '204' ] to include '403'
AssertionError: POST /activities rejects a foreign owner_id with Problems.validation (422) but the
published spec does not declare '422'.: expected [ '201' ] to include '422'
AssertionError: PUT /activities/{id} ... : expected [ '200' ] to include '422'

 Test Files  1 failed (1)
      Tests  16 failed | 21 passed (37)
```

**The distinction the plan asked to be recorded explicitly:** in the red state the **parse floors
passed, the subject-list floors passed, and all nine subject-reach assertions passed**. 21 of 37
green. So the 16 failures are *missing declarations*, not a failed parse — the gate reached every
subject, read its real `responses` map, and found no `'403'` in it.

`git diff --exit-code -- public/openapi.yaml` exited **0** at this point: the spec was still
unedited. `tsc --noEmit` exited 0.

Measured floors, pinned below the measurement and recorded in their doc-comments:
`MIN_PATH_ITEMS = 20` (measured **27**), `MIN_OPERATIONS = 45` (measured **59**).

---

## The deviation that matters: six 403 subjects, not nine

The plan named nine operations that must declare a `'403'`. **Three of them have no 403 code path**,
verified against the merged source rather than assumed:

| Operation | What it actually does | Status |
|---|---|---|
| `GET /activities` | scopes in the `WHERE` — `activities/route.ts:62`, `eq(activities.ownerId, ctx.userId)`. A foreign row is never read. | **200** over a narrower set |
| `POST /activities` | `activities/route.ts:165-167`, `Problems.validation` on a foreign `owner_id` | **422**, not 403 |
| `GET /stages` | `ownedStagesPredicate` in the join (`stages/route.ts:62`,`:73`); a foreign `pipeline_id` gets `Problems.notFound("Pipeline")` (`:39`) | **404**, not 403 |

`withApiAuth` was checked too — it returns 401 and 429 only, never 403. So a `'403'` on those three
would be **documentation asserting a response the route cannot produce**: precisely the defect class
this plan exists to remove, pointed the other way. The plan's own Task 1 acceptance criterion says
*"at least the six"*, which is the number that survives measurement.

**Resolved by keeping the scope at nine and splitting the polarity**, not by dropping three
subjects:

- `REQUIRE_403_OPERATIONS` — 6 entries
- `REQUIRE_422_OPERATIONS` — 2 entries
- `MUST_NOT_DECLARE_403_OPERATIONS` — 3 entries, each carrying the measured reason as data

Distinct operations under the gate: **9**, asserted (`/activities/{id}` PUT and `/activities` POST
each appear in two lists). This matches 48-10's stated limitation — *"the OpenAPI gate covers only
the nine operations this phase changed"* — exactly, and it is strictly stronger than nine
one-directional assertions: when a later phase gives `GET /activities` a real 403, the gate goes RED
and forces the entry to **move** rather than letting the spec drift again. Same pattern as
`ACCEPTED_KNOWN_ROUTES` in `route-authorization.test.ts`.

---

## Negative controls — verbatim

Every control was applied to a tree verified clean by `git diff --exit-code`, and reverted with the
tree re-verified after.

### Control 1 — over-declare a 403 (the polarity the RED run never exercised)

Added `'403': $ref Forbidden` to `GET /activities`, which scopes in the `WHERE` and cannot emit one:

```
 ❯ src/app/api/v1/__tests__/openapi-error-coverage.test.ts (37 tests | 1 failed) 541ms
       × 'get' '/activities' does NOT declare a 403 145ms

AssertionError: GET /activities declares a '403' it cannot emit — it scopes in the WHERE
(activities/route.ts:62, eq(activities.ownerId, ctx.userId)); a foreign row is never read, so the
answer is a 200 over a narrower set. If this operation genuinely gained a 403 path, MOVE it to
REQUIRE_403_OPERATIONS rather than deleting this assertion.: expected [ '200', '403' ] to not
include '403'

 Test Files  1 failed (1)
      Tests  1 failed | 36 passed (37)
```

Exactly one red, and it names the operation and the measured reason. Reverted; `git diff --stat`
back to `16 insertions(+)`.

### Control 2 — truncate the parse (the vacuity the floors exist to catch)

`paths:` replaced with a single trivial path item — 78 115 bytes → 29 687:

```
 ❯ src/app/api/v1/__tests__/openapi-error-coverage.test.ts (37 tests | 26 failed) 1044ms
       × exposes at least 20 path items (measured 27) 165ms
       × exposes at least 45 operations in total (measured 59) 1ms
       × resolves 'get' '/activities/{id}' to a real operation in the parsed document 107ms
       × resolves 'put' '/activities/{id}' to a real operation in the parsed document 1ms
       × resolves 'delete' '/activities/{id}' to a real operation in the parsed document 1ms
       × resolves 'get' '/stages/{id}' to a real operation in the parsed document 47ms
       × resolves 'put' '/stages/{id}' to a real operation in the parsed document 1ms
       × resolves 'delete' '/stages/{id}' to a real operation in the parsed document 62ms
       × resolves 'post' '/activities' to a real operation in the parsed document 19ms
       × resolves 'get' '/stages' to a real operation in the parsed document 35ms
       ... 16 coverage assertions also red ...

AssertionError: .../public/openapi.yaml parsed to 1 path items. A truncated or empty parse satisfies
every coverage loop below by iterating nothing.: expected 1 to be greater than or equal to 20

      Tests  26 failed | 11 passed (37)
```

**26 red, and critically the SUBJECT-REACH assertions went red too.** That is the control's point: a
truncated parse cannot make the coverage assertions pass by having nothing to iterate — it is caught
twice, at the floor and at the reach. Restored byte-for-byte from a backup; gate back to 37/37 and
`git diff --stat` back to `16 insertions(+)`.

### Control 3 — the Task 3 script against the pre-edit documents, and A DEAD NEEDLE FOUND

The plan supplied a three-file verification script for Task 3. Applied to `HEAD` — the pre-edit
content it was written to catch:

```
=== NEGATIVE CONTROL: the same four checks against HEAD (pre-Task-3) ===
FIRES   formula-fields.md still asserts the IDOR exists   [needle: "performs no ownership check"]
silent  BACKLOG still claims the IN defect is unreachable (variant A)   [needle: "guarded non-empty"]
FIRES   BACKLOG still claims the IN defect is unreachable (variant B)   [needle: "stageList` being non-empty"]
FIRES   REQUIREMENTS still claims QG-03 is unreachable   [needle: "Unreachable today because"]
checks that fire on the pre-edit content: 3 of 4
WARNING: at least one check is vacuous - it cannot fail even on the text it was written to catch
```

**`'guarded non-empty'` matches nothing, and never did.** The actual sentence in `BACKLOG.md` was
*"(guarded by `stageList` being non-empty)"* — the plan's needle collapsed four words into two. It
is a dead needle **inside the verification script written to catch stale claims**, and the only
reason the script was not vacuous is that the author supplied a second disjunct which does match.
Recorded here for 48-10's vacuity hunt rather than silently corrected.

A second, more general defect in the same script:

```
=== VACUITY PROBE: the plan script applied to EMPTY documents ===
  formula-fields.md  needle "performs no ownership check" -> silent (assertion SATISFIED by an empty file)
  BACKLOG.md  needle "guarded non-empty" -> silent (assertion SATISFIED by an empty file)
  BACKLOG.md  needle "stageList` being non-empty" -> silent (assertion SATISFIED by an empty file)
  REQUIREMENTS.md  needle "Unreachable today because" -> silent (assertion SATISFIED by an empty file)

Conclusion: 3 absence assertions, 0 positive floors. Deleting all three documents makes
the plan script exit 0.
```

The plan's script was still run as specified and passes (`stale claims reconciled`). It was then
**strengthened** by pairing every absence assertion with presence floors over the same document:

```
OK  docs/development/formula-fields.md  20580 chars, 1 absence + 3 presence assertions
OK  .planning/BACKLOG.md  97798 chars, 3 absence + 5 presence assertions
OK  .planning/REQUIREMENTS.md  23844 chars, 1 absence + 3 presence assertions
stale claims reconciled, with a presence floor on every document
```

### Control 4 — the no-checkbox-changed assertion is not itself vacuous

The plan requires that no `REQUIREMENTS.md` checkbox or traceability row changed. A matcher that
matched nothing would report "identical" and prove nothing, so the count is reported:

```
checkboxes  HEAD=19  now=19  identical=true
trace rows  HEAD=19  now=19  identical=true
no checkbox and no traceability row changed
```

19 of each, matched and byte-identical. A zero count would have failed the probe explicitly.

---

## Task 2 — the spec diff

**16 insertions, 0 deletions.** No reordering, no reindentation, no restructuring.

| Operation | Added |
|---|---|
| `POST /activities` | `'422': $ref ValidationError` |
| `GET /activities/{id}` | `'403': $ref Forbidden` |
| `PUT /activities/{id}` | `'403': $ref Forbidden`, `'422': $ref ValidationError` |
| `DELETE /activities/{id}` | `'403': $ref Forbidden` |
| `GET /stages/{id}` | `'403': $ref Forbidden` |
| `PUT /stages/{id}` | `'403': $ref Forbidden` |
| `DELETE /stages/{id}` | `'403': $ref Forbidden` |

**Ordering:** ascending numeric, so `'403'` sits **before** `'404'` on the two GETs. The plan's prose
said *"after `'404'` where one exists"* while simultaneously naming `openapi.yaml:2864` as the
ordering model — and that model is `'200'`, `'401'`, `'403'`, `'404'`, `'422'`, `'429'`, ascending.
The two instructions conflict; the cited precedent was followed, because "do not restructure the
document" means matching the document's own convention.

**Tamper check (T-48-09-05):** re-parsed after the edit — **27 path items, 59 operations**, both
identical to the Task 1 measurement. An indentation error that swallowed a path item or an operation
into a sibling would move one of those numbers.

---

## Task 3 — every document changed, with the claim it previously made

| Document | Previous claim | Now |
|---|---|---|
| `docs/development/formula-fields.md:330` | *"`PUT /api/v1/activities/[id]` performs no ownership check (pre-existing IDOR, backlog 999.17)."* | struck through and marked **CLOSED by Phase 48**, with the three 403 sites (`:106`, `:157`, `:308`), the 422 site (`:185-187`), and pointers to both the route's own test file and the corpus-wide gate. The two neighbouring bullets — `POST /api/custom-fields/save` and CSV formula injection — were **not touched**; both remain true. |
| `.planning/BACKLOG.md` § 999.17 | *"These six route files have zero test coverage"* | **CLOSED**, with the count corrected to **four** in-scope route files and the note that the fifth, `activities/[id]/notes/route.ts`, was already covered — `src/lib/api/__tests__/notes-collection.test.ts:53` imports it directly. Verified, not assumed. |
| `.planning/BACKLOG.md` § 999.18 | the empty `IN` case is unreachable, guarded by the array's source being non-empty; *"Mechanical fix."* | **CLOSED**, with the measurement against `b51398d` — the branch entered on exactly `if (!pipelineId)` (`:69`), no length check on the array (`:70`), an unscoped global page without `?pipeline_id=` (`:51`, `:60`), and `parsePagination` clamping `offset` at zero with **no ceiling** (`pagination.ts:28`). `GET /api/v1/stages?offset=<global stage count>` rendered `"pipelines"."id" IN ()` → **HTTP 500 / `42601`**. Behavioural proof cited to `48-07-SUMMARY.md`; structural autopsy to `stage-scope.ts` and `48-04-SUMMARY.md`. |
| `.planning/BACKLOG.md` § SEC-48-A | *"Run that gate against these two routes first; it should name them."* — an instruction | the **outcome**: it names both, as offenders 12 and 13 of the 13 the detector reports across all 36 route files, quoted with file and line. They are the only two classified `ACCEPTED_KNOWN_ROUTES`; the control asserts the detector **STILL FLAGS** them, so a fix goes red and forces the list to shrink. `SUPPRESSED_BY_EXEMPTION` named as the second control that stops either route vanishing. Closing procedure written out in order. |
| `.planning/BACKLOG.md` § SEC-48-B | *"BEING FIXED in Phase 48"* | **CLOSED** with the single number: the identical three-predicate ablation went from **0 failures to exactly 1**, `1 failed \| 5338 passed \| 32 skipped`, and the one red test names the file, line and verb. `organizations/[id]`'s own test file still does not notice — the original finding reproduces unchanged. |
| `.planning/BACKLOG.md` § DOC-48-01 | *(new)* | the ungated remainder, counted — see below. |
| `.planning/REQUIREMENTS.md` § QG-03 | *"Unreachable today because `stageList` is guarded non-empty"* | the same measurement as 999.18, as a dated correction on the source note. **No checkbox and no traceability row changed** — 19 of each, byte-identical. |

### DOC-48-01 — what remains unaudited, with numbers

| Status | Declared on | Can be returned by |
|---|---|---|
| `401` | **22 of 59** operations | **all 59** — `withApiAuth` refuses a missing/invalid Bearer token before any handler runs |
| `429` | **12 of 59** | **all 59** — same wrapper |
| `403` | **8 of 59** (6 from this plan + 2 pre-existing on `/notes/{noteId}`) | at least **12** |

The 403 gap by route file: **9 of the 36** `/api/v1` route files call `Problems.forbidden()`. Three
are now documented (`activities/[id]`, `stages/[id]`, `notes/[noteId]`). Of the remaining six,
**`pipelines/{id}` and `webhooks/{id}` are in the spec and undeclared** (6 operations), and
`audit/route.ts` plus three `trash/…` files are **absent from the spec entirely** — a larger defect
than an undeclared status. **36 route files against 27 documented path items** is the headline
number for that.

**A correction to the plan's own draft of this item, recorded rather than silently applied.** The
plan told me to write that `organizations/{id}`, `people/{id}`, `deals/{id}`, `pipelines/{id}` and
`webhooks/{id}` "all return 403 today". Measured: **only the last two do.** None of
`organizations/[id]`, `people/[id]` or `deals/[id]` calls `Problems.forbidden()` — a foreign record
gets a **404** from the `eq(<table>.ownerId, context.userId)` predicate, which is exactly the shape
the SEC-48-B ablation deleted. Copying the plan's sentence would have sent the next author hunting a
defect that is not there — 999.18's failure mode, one level up. The backlog item says so in place.

---

## Deviations from Plan

### 1. [Rule 1 — the plan asserted behaviour the routes do not have] Six 403 subjects, not nine

Full analysis above. The plan's nine-item `REQUIRE_403_OPERATIONS` included three operations with no
403 code path. Implemented as 6 + 3 with inverted polarity, keeping the gate's scope at nine
distinct operations. Commits `139f5f8`, `a38c1a3`.

### 2. [Rule 1 — the plan's two ordering instructions contradicted each other] Ascending numeric

*"Place `'403'` after `'404'` where one exists"* versus *"matching the ordering used at
`openapi.yaml:2864`"*, which is ascending. Followed the cited precedent. Commit `a38c1a3`.

### 3. [Rule 1 — the plan's own gate contained a needle that matches nothing] `'guarded non-empty'`

Recorded, not silently fixed — see Control 3. The plan's script was run as written (it passes) and
then strengthened with presence floors. The dead needle is a finding for 48-10's vacuity hunt: the
eleventh vacuous check in this milestone, and it was inside a verification script whose entire
purpose is catching stale prose.

### 4. [Rule 2 — an absence assertion is satisfied by an empty file] Presence floors added

The plan's Task 3 verification is three absence assertions with no positive floor; deleting all
three documents makes it exit 0. Paired every absence assertion with presence assertions and a
character floor over the same document. Verified output quoted in Control 3.

### 5. [Rule 1 — the plan's draft backlog text named three routes that do not return 403] Corrected

See DOC-48-01 above. Commit `e6e7272`.

---

## What was deliberately NOT done

- **`401` and `429` were not added to the other 37 and 47 operations.** Real, measured, recorded as
  DOC-48-01. A large mechanical diff over a published artifact inside a security phase whose
  reviewable unit is nine operations is how scope stops being auditable (plan constraint 2).
- **`404` was not added to `PUT`/`DELETE` on either `{id}` path**, though both can return it. Same
  reason; folded into DOC-48-01's scope.
- **No `REQUIREMENTS.md` checkbox was ticked.** `/gsd:verify-phase 48` owns the status transitions
  (plan constraint 3). Asserted, with the matcher's own count reported so the assertion is not
  vacuous.
- **The ROADMAP's amended SC-5 wording was neither restored nor quoted** (plan constraint 4,
  Pitfall 8). `ROADMAP.md` was not touched at all; it is an orchestrator-owned file in worktree mode.

## Threat Flags

None. This plan adds no network endpoint, auth path, file access pattern or schema change. It adds
one test file and edits one published document plus three prose documents.

## Known Stubs

None.

## Deferred Issues

**DOC-48-01** — 50 of 59 spec operations remain ungated, with the drift measured and the suggested
owner written out. The both-polarity structure to extend from 9 to 59 is already in the gate.

**The dead needle in the plan's Task 3 script** — reported here for 48-10 rather than fixed, since
the script is a plan artifact and not a committed one.

## Verification

| Check | Result |
|---|---|
| `vitest run src/app/api/v1/__tests__/openapi-error-coverage.test.ts` | **37 passed (37)** |
| Full base suite | **178 files passed / 2 skipped · 5376 passed / 32 skipped** — exactly +1 file / +37 tests over 48-08's 177 / 5339 |
| `tsc --noEmit` | **exit 0** |
| `npm run lint` | **0 errors**, 120 warnings — the same 120 as 48-08, none in the new file |
| Re-parsed spec after the edit | **27 path items, 59 operations** — identical to the pre-edit measurement |
| Task 3 verification script (as written) | `stale claims reconciled` |
| Task 3 verification, strengthened with presence floors | pass, quoted above |
| `git diff -- public/openapi.yaml` after both spec controls | back to `16 insertions(+)` |
| `git diff --exit-code` at hand-off | **exit 0**, no untracked files |

## Commits

| Task | Commit | What |
|---|---|---|
| 1 | `139f5f8` | the parsed-YAML gate: parse floors, subject-list floors, subject reach, 403/422 coverage, ref integrity, inverted-polarity control — RED at 16/37 |
| 2 | `a38c1a3` | six `'403'` and two `'422'` declarations in `public/openapi.yaml`; 16 insertions, 0 deletions |
| 3 | `e6e7272` | `formula-fields.md`, BACKLOG 999.17 / 999.18 / SEC-48-A / SEC-48-B / DOC-48-01, REQUIREMENTS QG-03 |
| — | *(no artifact)* | controls 1-4; the spec ablations were transient and restored, the script probes read-only |

## Self-Check: PASSED

Re-verified against the tree, not asserted from memory:

```
FOUND src/app/api/v1/__tests__/openapi-error-coverage.test.ts: true
lines: 428
commit 139f5f8 present: true
commit a38c1a3 present: true
commit e6e7272 present: true
console.log( calls in the gate: 0
git diff --exit-code: TREE_CLEAN_exit0
untracked: (none)
```

One nuance worth recording rather than glossing: this document quotes the string
`guarded non-empty` when describing the dead needle, which means `.planning/BACKLOG.md` and this
SUMMARY must not be scanned by the same absence assertion. The strengthened Task 3 check is scoped to
the three edited documents by explicit filename for exactly that reason — the same distinction
48-08's `console.log` note makes. `48-09-SUMMARY.md` is not in its file list.
