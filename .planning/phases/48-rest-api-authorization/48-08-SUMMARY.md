---
phase: 48-rest-api-authorization
plan: 08
subsystem: api-authorization
tags: [security, ast-gate, anti-vacuity, negative-controls, BOLA, OWASP-API1, WR-11, SEC-48-A, SEC-48-B]
requires:
  - phase: 48-05
    provides: "the detector, its fixture self-tests, the corpus walk and the WR-11 token floors"
  - phase: 48-01
    provides: "the activities/[id] GET/PUT/DELETE ownership guards that control A-prime ablates"
  - phase: 48-02
    provides: "the activities list WHERE-scope and the POST guarded-owner shape that rule R5 recognises"
  - phase: 48-03
    provides: "the third verifyStageOwnership call the AUTHORIZERS reach control counts"
  - phase: 48-04
    provides: "the two ownedStagesPredicate calls that took that entry from 0 to 2"
provides:
  - "a CI-resident gate: expect(GATE_OFFENDERS).toEqual([]) over all 36 /api/v1 route files"
  - "four exemption categories, 11 paths, each with a live control asserting its reason still holds"
  - "rule R5 — the guarded identity-derived binding — resolving the one measured false positive"
  - "SUPPRESSED_BY_EXEMPTION: all 12 hidden handlers named by file and verb, so none can vanish"
  - "ACCEPTED_KNOWN_ROUTES asserting SEC-48-A is STILL broken, inverted polarity"
  - "the answer to SEC-48-B: the ablation that left 5237 tests green now fails exactly 1"
affects:
  - "any future phase adding an /api/v1 route — it must authorize or be exempted with a reason"
  - "whoever closes SEC-48-A — the accepted-known control goes red and forces the list to shrink"
tech-stack:
  added: []
  patterns:
    - "Exclusion list as LIVE CONTROL: written reason + still-present assertion + still-exhibits assertion + pairwise disjointness"
    - "Inverted-polarity carve-out: an accepted hole asserted STILL BROKEN, so fixing it forces the list to shrink"
    - "Handler-scoped AST rule (R5) requiring a three-node co-occurrence bound to one identifier"
    - "Both-polarity floors: an offender floor catches a rule that stopped firing, an authorized floor catches one that fires on everything"
    - "Ablating a verbatim COPY inside the corpus when the real file is owned by a parallel plan"
key-files:
  created: []
  modified:
    - "src/app/api/v1/__tests__/route-authorization.test.ts"
decisions:
  - "R5 EXTENDS THE RULES rather than exempting activities/route.ts POST — a silent exemption would have been the eleventh vacuous gate, built inside the gate that exists to eliminate the other ten"
  - "R5 requires all three of DERIVE/REJECT/STAMP bound to the same identifier; without REJECT an unguarded `const owner = body.owner_id || ctx.userId` stays a create-time BOLA (fixture P7)"
  - "SUPPRESSED_BY_EXEMPTION matches on file+verb, not line number — pinning lines would false-RED on benign edits and get relaxed within a month"
  - "MIN_EXEMPT_MATCHED pinned in BOTH directions (11 exactly), unlike every other number in the file, because each direction is a distinct failure"
  - "Control A-double-prime ablates a verbatim copy in __control_r5__/ rather than activities/route.ts, which plan 48-06 owns this wave"
  - "Exactly one self-collision mitigation preserved: the entry.name === route.ts predicate, with the exemption lists asserted NOT to name GATE_PATH"
metrics:
  duration: "~50 min (interrupted and resumed)"
  completed: 2026-08-25
  tasks: 3
  tests-added: 28
requirements: [SEC-01, SEC-02]
---

# Phase 48 Plan 08: Turning the Detector Into a Gate — Summary

**The ablation that left 5237 tests green now fails exactly one test, and that test names the file, the line and the verb.**

## Performance

- **Duration:** ~50 min wall clock, including an interruption and resume
- **Tasks:** 3 of 3
- **Files modified:** 1 (`src/app/api/v1/__tests__/route-authorization.test.ts`, +792 lines)
- **Tests:** gate 30 → **58**; base suite 5311 → **5339 passed / 32 skipped, 177 files**

## Run interruption — for the record

This run was **terminated mid-flight by an API connection error during the Control B ablations**, and
resumed by a fresh agent. Two commits had already landed and survived (`dc23a2a`, `bcdd525`).

**A B2 ablation was left stranded and uncommitted** — `IDENTITY_OBJECTS` was sitting at
`new Set(["principalSession", "callerEnvelope"])` in the working tree. The coordinator reverted it with
`git checkout --` before handing back, and confirmed `git diff --exit-code` clean and the gate green at
58/58. That is recorded here because a stranded ablation is exactly the failure mode this plan is about:
had it been committed, the gate would have shipped permanently green-because-broken.

**Every control below was subsequently re-run from a `git diff --exit-code`-verified clean tree**, and
the transcripts quoted are from those reruns, not from the pre-interruption run. Cleanliness was
re-verified before and after each ablation.

## The single number that answers SEC-48-B

SEC-48-B measured: delete all three `eq(organizations.ownerId, context.userId)` predicates from
`organizations/[id]/route.ts`, run the full base suite, get **172 files / 5237 tests passed, nothing
red**. A test literally named *"returns 404 … when the organization is not the caller's"* did not
detect its own subject being removed.

Same ablation, after this plan:

```
     × finds no unauthorized handler outside the documented exemptions 13ms
 Test Files  1 failed | 176 passed | 2 skipped (179)
      Tests  1 failed | 5338 passed | 32 skipped (5371)
```

**0 → 1.** Exactly one failing test, and it is this gate. The other 176 files still pass — including
`organizations/[id]/__tests__/route.test.ts`, which still does not notice. SEC-48-B's finding reproduces
unchanged; the difference is that something now catches it.

---

## The false positive, and why it became a rule instead of an exemption

The wave-1 handoff flagged `activities/route.ts:140` POST as a **correctly-fixed handler the detector
still reported**. Verified against the merged source:

```ts
if (owner_id && owner_id !== ctx.userId) { return Problems.validation([...]) }  // reject
const activityOwnerId = owner_id || ctx.userId                                  // derive
await createActivityMutation({ ..., userId: activityOwnerId })                  // stamp
```

R2 cannot fire — `owner_id` is a bare identifier destructured off the body, not an owner-column property
access. R4 cannot fire — the value reaches the mutation through an **intermediate binding**, and under
the parameter name `userId` rather than as `userId: ctx.userId`.

### Chosen: **(a) extend the rules.** Rejected: (b) exempt it as a live control.

Both were available and (b) was cheaper. It was rejected because the gate would then have stopped
reporting a handler **because it was told to, not because the handler is safe** — the eleventh vacuous
gate, built inside the gate that exists to eliminate the other ten. Extending the rule is strictly
stronger: it recognises the **shape**, so the next route written this way is covered without anyone
remembering to edit a list, and `MIN_EXEMPT_MATCHED` stays at the eleven paths exempt for *structural*
reasons rather than growing to twelve on a judgement call.

**R5 requires all three parts, bound to the same identifier:**

| Part | Shape | Why it is required |
|---|---|---|
| DERIVE | `const NAME = SOURCE \|\| ctx.userId` (or `??`) | the binding to follow |
| **REJECT** | `SOURCE !== ctx.userId` on **that** source | **load-bearing** — without it, `const owner = body.owner_id \|\| ctx.userId` lets a caller create a record owned by anyone. A rule that merely "followed the binding" would have accepted a real create-time BOLA. |
| STAMP | `NAME` reaching an `OWNER_PROPS` property | the value must actually decide ownership |

Four fixtures pin this. **N8** is the real handler and must NOT be flagged. **P7** is N8 with the four
guard lines removed and MUST be flagged — they differ by nothing else, which is the entire content of
the claim that R5 recognises a safe shape rather than excusing a flagged one. **P8** moves the guard to
a different variable; **P9** stamps onto `actorId` instead of an owner column. Both flagged. The
discrimination probe adds seven more sub-cases, each removing exactly one requirement.

R5's limitation is R2's, restated: it sees the comparison, not the control flow. A guard whose branch
fell through would satisfy it. That is the presence-gate limitation, still in the file header.

---

## All 13 offenders classified — none vanished

| # | Offender | Classification | Enforced by |
|---|---|---|---|
| 1 | `activities/route.ts:140` POST | **resolved by rule R5** — correctly fixed by 48-02, detector gap closed | fixtures N8/P7/P8/P9 + the 7-case R5 probe |
| 2-4 | `custom-field-definitions/[id]` GET, PUT, DELETE | `NO_OWNER_COLUMN_ROUTES` | `getTableColumns(customFieldDefinitions)` asserted to expose no `OWNER_PROPS` key |
| 5-6 | `custom-field-definitions/route.ts` GET, POST | `NO_OWNER_COLUMN_ROUTES` | same |
| 7 | `docs/route.ts:14` GET | `PUBLIC_ROUTES` | asserted `withApiAuthSeen === false` and `withApiAuthCalls === 0` |
| 8-9 | `workflow-templates/[id]` GET, DELETE | `NO_OWNER_COLUMN_ROUTES` | `getTableColumns(workflowTemplates)` asserted likewise |
| 10-11 | `workflow-templates/route.ts` GET, POST | `NO_OWNER_COLUMN_ROUTES` | same |
| 12 | `workflows/[id]/runs/[runId]:14` GET | **`ACCEPTED_KNOWN_ROUTES` — SEC-48-A** | asserted **STILL FLAGGED** by the detector |
| 13 | `workflows/[id]/runs:23` GET | **`ACCEPTED_KNOWN_ROUTES` — SEC-48-A** | asserted **STILL FLAGGED** by the detector |

Beyond the per-category controls, **`SUPPRESSED_BY_EXEMPTION` writes all 12 suppressed handlers out by
file and verb** and asserts the set exactly. `toEqual([])` is green in two very different worlds — one
where no handler is unauthorized, and one where the exemption lists grew until none was reported. That
assertion is what tells them apart. A route leaving the list means it was fixed; a route joining means
an exemption swallowed a handler nobody reviewed.

SEC-48-A's own text says *"run that gate against these two routes first; it should name them."* It does.
The control asserts the **hole still exists** — inverted polarity on purpose. When a later phase fixes
SEC-48-A this goes red and forces the list to shrink. An accepted hole that quietly stops being a hole
and quietly stays on the list is how a deferral becomes a permanent carve-out nobody can justify.

---

## Negative controls — verbatim

Every ablation was preceded and followed by `git diff --exit-code`.

### Control A — one predicate deleted (`organizations/[id]/route.ts:34`)

```
CONTROL A variant 1: ONE predicate deleted (GET)
Offenders:
  src/app/api/v1/organizations/[id]/route.ts:25: GET does not constrain the record by caller identity: expected [ Array(1) ] to deeply equal []

      Tests  1 failed | 57 passed (58)
```

### Control A — all three deleted (the exact SEC-48-B ablation)

```
CONTROL A variant 2: ALL THREE predicates deleted — the exact SEC-48-B ablation (3 lines)
Offenders:
  src/app/api/v1/organizations/[id]/route.ts:129: DELETE does not constrain the record by caller identity
  src/app/api/v1/organizations/[id]/route.ts:25: GET does not constrain the record by caller identity
  src/app/api/v1/organizations/[id]/route.ts:62: PUT does not constrain the record by caller identity: expected [ …(3) ] to deeply equal []

      Tests  1 failed | 57 passed (58)
```

Full base suite in that same three-deleted state:

```
     × finds no unauthorized handler outside the documented exemptions 13ms
 Test Files  1 failed | 176 passed | 2 skipped (179)
      Tests  1 failed | 5338 passed | 32 skipped (5371)
```

**SEC-48-B baseline: 0 failures. After this plan: 1.**

### Control A′ — the same ablation against this phase's own fix

Deleted the 48-01 SEC-01 guard from `activities/[id]/route.ts` GET:

```
deleting lines 104-108 (48-01 SEC-01 GET fix):
    // Verify ownership
    if (activity.ownerId !== ctx.userId) {
      return Problems.forbidden()
    }

Offenders:
  src/app/api/v1/activities/[id]/route.ts:76: GET does not constrain the record by caller identity: expected [ Array(1) ] to deeply equal []

      Tests  1 failed | 57 passed (58)
```

Plan 48-01's control D reddened that route's **own tests** for the same ablation. The two mechanisms are
**independent**: 48-01's requires somebody to have written a test for that route, this one does not.
That is precisely the gap SEC-48-B exposed — `organizations/[id]` *had* such a test and it did not fire.

### Control A″ — R5 proven red by deleting the guard

**Why a copy:** `activities/route.ts` is owned by plan 48-06 in this wave and the orchestrator
explicitly prohibited ablating it. The handler's POST was therefore copied **verbatim** into
`src/app/api/v1/__control_r5__/route.ts`, inside the swept corpus, and ablated there. Both polarities
observed, as `node-engines-floor.test.ts:332-336` requires.

Variant 1 — guard intact:

```
VARIANT 1: verbatim copy of the real POST (line 140 onward), guard INTACT
 Test Files  1 passed (1)
      Tests  58 passed (58)
```

Variant 2 — only the rejection guard removed:

```
VARIANT 2: deleting ONLY the rejection guard:
    if (owner_id && owner_id !== ctx.userId) {
      return Problems.validation([
        { field: "owner_id", code: "forbidden", message: "owner_id cannot be set to another user" },
      ])
    }

Offenders:
  src/app/api/v1/__control_r5__/route.ts:1: POST does not constrain the record by caller identity: expected [ Array(1) ] to deeply equal []

      Tests  1 failed | 57 passed (58)
```

**R5 is a rule, not an exemption.** It clears the handler only while the guard is there.

### Control B1 — `ctx` removed from `IDENTITY_OBJECTS`

The WR-11 failure mode is a scan that goes green **because it broke**. It did not:

```
=== B1 TOKEN FLOOR (the WR-11 assertion) ===
AssertionError: `ctx.userId` fell to 0 occurrences in src/app/api/v1 (measured 22). Both spellings are in live use; a detector matching only one under-detects by 26% and reports offenders that are correctly authorized.: expected 0 to be greater than or equal to 15
```

10 tests red, including 4 KNOWN_NEGATIVE fixtures, the rule-discrimination probe, two AUTHORIZERS reach
entries and the offender assertion (which flooded to **20**):

```
     × MUST NOT flag: 'N1 fetch-then-compare, row.ownerId !=…'
     × MUST NOT flag: 'N3 helper delegation, verifyStageOwne…'
     × MUST NOT flag: 'N5 create handler assigning ownerId: …'
     × MUST NOT flag: 'N8 create handler with a guarded iden…'
     × distinguishes the five rules by which one fires, not just by the verdict
     × finds both identity spellings and the owner-like property accesses
     × verifyStageOwnership is called with the caller identity at least once
     × ownedStagesPredicate is called with the caller identity at least once
     × reaches every authorizer through R3 itself, not through a parallel counter
     × finds no unauthorized handler outside the documented exemptions
      Tests  10 failed | 48 passed (58)
```

### Control B2 — both spellings replaced with names occurring nowhere

```
=== B2 TOKEN FLOOR ===
AssertionError: `context.userId` fell to 0 occurrences in src/app/api/v1 (measured 55). The detector was almost certainly renamed rather than the codebase rewritten — check IDENTITY_OBJECTS and isIdentityExpression.: expected 0 to be greater than or equal to 40

=== B2 OFFENDER COUNT: 50 (was 0) ===

=== B2 AUTHORIZED FLOOR ===
AssertionError: the gate classified 0 declaration-form handlers as authorized, measured 50.
```

19 tests red — 7 KNOWN_NEGATIVE fixtures, the token floor, all six AUTHORIZERS entries, the delegation
target control, the offender assertion at 50, and the authorized floor at 0. **A token floor fails in
both variants; neither goes green with a shorter list.**

### Control C — a new binding-form handler with no check

Created `src/app/api/v1/__control_c__/route.ts` with `export const { GET } = someUncheckedFactory({...})`,
no ownership check, no `DELEGATED_ROUTES` entry:

```
Offenders:
  src/app/api/v1/__control_c__/route.ts:10: GET does not constrain the record by caller identity: expected [ Array(1) ] to deeply equal []

 Test Files  1 failed (1)
      Tests  1 failed | 57 passed (58)
```

And it was genuinely **enumerated and counted as binding-form**, not merely name-matched — floors raised
to 999 to read the live counts:

```
ROUTE_FILES enumerated: 37
binding-form handlers: 9
```

36 → 37 files, 8 → 9 handlers. **A `FunctionDeclaration`-only walker sees this file as zero handlers,
therefore zero offenders, therefore green.** That is the control's whole point.

### Tree restored after every ablation

```
git diff exit=0
src/app/api/v1/__control_c__ exists: false
src/app/api/v1/__control_r5__ exists: false
untracked: none
```

`git status --short` renders as the token `ok` under `rtk`, so cleanliness was verified with
`git diff --exit-code` and `git ls-files --others --exclude-standard` throughout, and every count in
this document was recomputed with `node -e`.

---

## What 48-05 built and this plan preserved

Nothing from plan 48-05 was weakened. Still present and still asserted:

- **The four reach floors** with measured values in doc-comments — 36 route files, 62 declaration-form +
  8 binding-form handlers, 61 `withApiAuth` calls. Floors deliberately left BELOW the measurements so
  ordinary consolidation does not false-RED.
- **The WR-11 token floors** for both identity spellings and owner-like accesses. Comments updated with
  the re-measured post-merge numbers (`ctx.userId` 22 → **28**, owner-like 123 → **130**, `context.userId`
  unchanged at 55) while the **floors themselves were not raised**.
- **The matcher self-test against KNOWN_POSITIVE / KNOWN_NEGATIVE runs BEFORE the corpus is touched**,
  now 9 positives and 8 negatives, with the negatives' parse floor intact.
- **The per-rule discrimination probe**, extended from four rules to five. `eq(activities.ownerId, ownerId)`
  — the caller-supplied `?owner_id=` **filter** — still asserted NOT to count as authorization.
- **The presence-gate limitation in the header**, naming `stages/[id]` GET (`:54-85`) as the measured
  counter-example: its comparison is real, the relation it compares is decided by the caller, and a
  presence gate is structurally incapable of seeing that. Behavioural tests own it.
- **The self-collision assertion with exactly ONE mitigation** — `entry.name === "route.ts"` — now
  additionally asserting that none of the four exemption lists names `GATE_PATH`. That is the *same*
  single mitigation checked from the other side, not a second one, and the comment says so.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 - Blocking] Schema module paths in the plan do not exist**

- **Found during:** Task 1
- **Issue:** The plan's `read_first` named `src/db/schema/custom-field-definitions.ts` and
  `src/db/schema/workflow-templates.ts`. Neither exists.
- **Fix:** The tables live in `src/db/schema/custom-fields.ts` and `src/db/schema/workflows.ts`. The
  plan's own *action* text specified importing from `@/db/schema`, which is correct regardless of file
  layout, so the control was written that way and no behaviour changed.
- **Commit:** `dc23a2a`

**2. [Rule 3 - Blocking] A temporary measurement script tripped the lint gate**

- **Found during:** Task 1
- **Issue:** `measure-authorizers.mjs`, written to count AUTHORIZERS reach independently, produced the
  only 3 lint **errors** in the repo (`no-console`).
- **Fix:** Deleted. Its logic now lives inside the AUTHORIZERS reach control, going through `matchesR3`
  itself rather than a parallel counter — which is strictly better, since a regression in R3 now makes
  the control red instead of making it agree with a broken rule.
- **Commit:** `dc23a2a`

### Deliberate departures

**3. Control A″ ablates a verbatim copy, not `activities/route.ts`**

Hard rule 3 required proving R5 by deleting the guard and watching the gate go red. The guard lives in
`activities/route.ts`, which the orchestrator assigned to plan 48-06 this wave with an explicit
instruction not to ablate it. Resolved by copying the POST handler **verbatim** into the swept corpus at
`src/app/api/v1/__control_r5__/route.ts` and ablating there. This is arguably the stronger form: it
exercises the full directory-walk and enumeration path as well as the rule, and both polarities were
observed. No file owned by 48-06 was touched.

**4. `SUPPRESSED_BY_EXEMPTION` added beyond the plan's letter**

The plan asked for the offender assertion and an authorized-handler floor. Hard rule 4 additionally
required that no offender may simply vanish. An offender assertion plus four exemption lists does not
by itself satisfy that — `toEqual([])` is equally green if the lists grew. The suppressed-set assertion
closes it by naming all 12 hidden handlers.

## Threat Flags

None. This plan adds no network endpoint, auth path, file access pattern or schema change. It modifies
one test file.

## Known Stubs

None.

## Deferred Issues

**SEC-48-A** remains open by design — `workflows/[id]/runs` and `runs/[runId]` are still unscoped reads.
This plan does not fix them; it **names them, counts them as exactly 2, links them to BACKLOG.md and
asserts they are still broken**, so the deferral is enforced rather than merely documented. Whoever
closes SEC-48-A will find this control red and be forced to shrink the list.

## Verification

| Check | Result |
|---|---|
| `vitest run src/app/api/v1/__tests__/route-authorization.test.ts` | **58 passed** |
| Full base suite | **177 files passed / 2 skipped · 5339 passed / 32 skipped** |
| `tsc --noEmit` | **exit 0** |
| `npm run lint` | **0 errors**, 120 warnings (all pre-existing, unrelated files) |
| `git diff --exit-code` after all controls | **exit 0** |
| Control-C / control-R5 directories | **do not exist** |

Base suite delta: 5311 → 5339 = **+28**, exactly the tests this plan added (58 − 30). No pre-existing
test changed state.

## Commits

| Task | Commit | What |
|---|---|---|
| 1 | `dc23a2a` | four exemption lists as live controls, AUTHORIZERS reach control, self-collision extension, 48-05's temporary `it` deleted |
| 2 | `bcdd525` | rule R5, fixtures N8/P7/P8/P9, the offender composition, `expect(GATE_OFFENDERS).toEqual([])`, authorized floor, `SUPPRESSED_BY_EXEMPTION` |
| 3 | *(no artifact)* | controls A, A′, A″, B1, B2, C — all ablations transient, all restored; transcripts are this document |

## Self-Check: PASSED

Claims in this document re-verified against the tree, not asserted from memory:

```
FOUND:   .planning/phases/48-rest-api-authorization/48-08-SUMMARY.md
FOUND:   src/app/api/v1/__tests__/route-authorization.test.ts
bcdd525 test(48-08): turn the /api/v1 detector into a gate - expect(offenders).toEqual([])
dc23a2a test(48-08): make every /api/v1 authorization exemption a live control

 1 file changed, 792 insertions(+), 51 deletions(-)
live console.log( calls: 0
toEqual([]) on GATE_OFFENDERS: true
message contains BOLA: true
message contains pipelines/[id]/route.ts: true
ACCEPTED_KNOWN_ROUTES present: true
KNOWN_POSITIVE fixtures: 9, KNOWN_NEGATIVE fixtures: 8
```

One nuance worth recording rather than glossing: the file still contains the **string** `console.log`
twice, at `:67` and `:1466`. Both are prose inside comments stating that plan 48-05's log line was
deleted. `console.log(` — an actual call — occurs **zero** times. The acceptance criterion is met; the
raw token count is not the measurement, which is the same distinction fixtures P4 and P5 exist to make.
