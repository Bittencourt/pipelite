---
phase: 49-mutation-layer-truth-after-commit
plan: 03
subsystem: api-v1-create-responses
tags: [DATA-02, canonical-read, formula-recalc, api-v1, tdd]
requires:
  - "src/lib/formula-recalc.ts recalculateFormulas (the write that lands between the insert and the read)"
  - "src/lib/api/serialize.ts (all four serializers, derivation-free)"
  - "src/app/api/v1/organizations/[id]/route.ts:121-127 (the one shipped canonical-read analog)"
provides:
  - "POST /api/v1/organizations 201 body as a canonical read"
  - "POST /api/v1/people 201 body as a canonical read"
  - "POST /api/v1/deals 201 body as a canonical read"
  - "POST /api/v1/activities 201 body as a canonical read"
  - "first unit coverage of the organizations collection route"
affects:
  - "plan 49-05 (behavioural four-entity proof, and the ablation this plan could NOT catch)"
  - "plan 49-09 (sign-off; the recorded reds are the evidence)"
tech-stack:
  added: []
  patterns:
    - "canonical read after create: db.query.{table}.findFirst with the GET's three-term predicate, serialized in place of the .returning() row"
    - "logged fallback: `canonical ?? insertedRow` plus log.error with a string-literal scope, so the impossible case is attributable"
key-files:
  created:
    - src/app/api/v1/organizations/__tests__/route.test.ts
  modified:
    - src/app/api/v1/organizations/route.ts
    - src/app/api/v1/people/route.ts
    - src/app/api/v1/deals/route.ts
    - src/app/api/v1/activities/route.ts
    - src/app/api/v1/deals/__tests__/formula-recalc.test.ts
    - src/app/api/v1/people/__tests__/formula-recalc.test.ts
    - src/app/api/v1/activities/__tests__/route.test.ts
decisions:
  - "The re-read goes in the ROUTE, never in a create mutation — people and deals call no create mutation, so mutation placement cannot cover four entities. Set A was therefore AVOIDED, not amended."
  - "The fallback to the inserted row is KEPT and LOGGED, with a string-literal scope per log-scope-format.test.ts."
  - "The predicate is three-term (id, ownerId, isNull(deletedAt)) — the GET's predicate, not the two-term shape 49-RESEARCH.md sketched."
metrics:
  duration: ~35 min
  completed: 2026-08-26
  tasks: 2
  commits: 2
  files_changed: 8
requirements: [DATA-02]
---

# Phase 49 Plan 03: Canonical Create Reads Summary

All four `/api/v1` collection POSTs now serialize a row **re-read from the database** after the
insert — through the same three-term predicate the GET-by-id uses — instead of the row the write
returned; the six suite-breakers were amended in the same plan, split RED-then-GREEN so the red is
observable.

## What Shipped

| Entity | Shape | What replaced what |
|---|---|---|
| organizations | A (create mutation) | `serializeOrganization(result.organization)` → `serializeOrganization(canonical ?? result.organization)` |
| activities | A (create mutation, `ctx` not `context`) | `serializeActivity(result.activity)` → `serializeActivity(canonical ?? result.activity)`, owner term is `activityOwnerId` |
| people | B (inline insert + recalc + emit) | `serializePerson(person)` → `serializePerson(canonical ?? person)` |
| deals | B (inline insert + recalc + emit) | `serializeDeal(deal)` → `serializeDeal(canonical ?? deal)` |

Predicate in all four: `and(eq(t.id, <new id>), eq(t.ownerId, <owner>), isNull(t.deletedAt))`.
Verified mechanically (via `node`, not a piped `grep`): each of the four route files carries exactly
**1** `const canonical = await db.query.`, exactly **1** fallback `log.error`, and **0** occurrences
of the rejected merge tail `customFields: recalculatedCustomFields }))`.

`49-RESEARCH.md`'s reference block sketched a **two**-term predicate (id + owner). The plan's
`<behavior>` specified three, and three is what shipped — the GET's predicate includes
`isNull(deletedAt)`, and "one code path defines truth" is the whole premise.

## The Reds, Verbatim

### Task 1 — RED before any route was touched

`./node_modules/.bin/vitest run` over the four files, against **shipped** route code:

```
 ❯ src/app/api/v1/organizations/__tests__/route.test.ts (11 tests | 5 failed) 65ms
     × serializes the row the RE-READ resolved, not the row the mutation returned 14ms
     × issues exactly one canonical read per create 5ms
     × reads back by the id the mutation reported, not by anything from the request body 4ms
     × names id, OWNER and the soft-delete guard in the rendered predicate 3ms
     × logs, rather than silently reproducing the defect, when the re-read finds nothing 4ms
 ❯ src/app/api/v1/people/__tests__/formula-recalc.test.ts (19 tests | 1 failed) 143ms
     × returns a 201 body carrying the POST-recalc blob — a canonical read, not the inserted row 16ms
 ❯ src/app/api/v1/deals/__tests__/formula-recalc.test.ts (20 tests | 1 failed) 179ms
     × returns a 201 body carrying the POST-recalc blob — a canonical read, not the inserted row 12ms

 Test Files  3 failed | 1 passed (4)
      Tests  7 failed | 62 passed (69)
```

**7 assertions red, in 3 files:** 1 in `deals/__tests__/formula-recalc.test.ts`, 1 in
`people/__tests__/formula-recalc.test.ts`, 5 in the new
`organizations/__tests__/route.test.ts`. `tsc --noEmit` exited **0** while they were red — the
activities type-alias key was added in the same change as the factory key, which is what kept the
typecheck green.

The B1 (deals) failure:

```
 FAIL  src/app/api/v1/deals/__tests__/formula-recalc.test.ts > POST /api/v1/deals — recalculates before emitting > returns a 201 body carrying the POST-recalc blob — a canonical read, not the inserted row
AssertionError: expected { Origem: [ 'Inbound' ] } to deeply equal { Origem: [ 'Inbound' ], …(1) }

- Expected
+ Received

  {
-   "Margin": {
-     "error": null,
-     "formula": true,
-     "value": 1035,
-   },
    "Origem": [
      "Inbound",
    ],
  }
```

B2 (people) is the same failure with `Seniority: { value: "Ada Lovelace" }` in place of `Margin`.
The re-read-count floor:

```
AssertionError: zero calls means no re-read was issued and the 201 body is still the .returning() row — the DATA-02 defect. More than one means the create pays for a read twice.: expected +0 to be 1 // Object.is equality
- 1
+ 0
```

The two rendered-predicate cells failed as
`TypeError: Cannot read properties of undefined (reading 'toQuery')` — `findFirst` was never called,
so there was no `where` to render. The fallback-log cell failed as
`expected "vi.fn()" to be called 1 times, but got 0 times`.

**Set C (activities) PASSED at this point — 0 failures — and that is recorded rather than
presented as a proof.** Adding `findFirst` to the mock factory and the type alias created a key
nothing yet called. Those two 201 cells are a **mechanical guard**: they stop the re-read from
turning a 201 into a `TypeError`, and they are not evidence that a re-read happens or that its
predicate is right. The test file says so in-comment, at both cells.

### Task 2 — three ablations, each observed

**Ablation 1 — remove the organizations re-read, serialize `result.organization`.** Reddens
correctly, and reproduces Task 1's failure set exactly:

```
 ❯ src/app/api/v1/organizations/__tests__/route.test.ts (11 tests | 5 failed) 67ms
     × serializes the row the RE-READ resolved, not the row the mutation returned 23ms
     × issues exactly one canonical read per create 8ms
     ...
AssertionError: zero calls means no re-read was issued and the 201 body is still the .returning() row ...
- 1
+ 0
```

**Ablation 2 — the REJECTED in-process merge. This is the important one, and it is a NEGATIVE
result.** Replacing the deals re-read with
`serializeDeal({ ...deal, customFields: recalculatedCustomFields })`:

```
 Test Files  1 passed (1)
      Tests  20 passed (20)
```

**The shape the user explicitly rejected passes the unit proof completely — 20/20, including B1.**
So this plan's unit proof does **not** discriminate a canonical read from an in-process merge. It
cannot: the two agree whenever the recalc writes exactly `customFields` and nothing else, which is
true today. That agreement is a coincidence of the current recalc, not a contract, and it breaks for
the next derived field. **Plan 49-05's behavioural, real-PostgreSQL, four-entity proof is therefore
not optional — it is the only thing that can discriminate the two**, and nothing in this plan may be
cited in its place.

**Ablation 3 — drop the owner term from the activities predicate.** Both the activities file and
the new organizations file stayed **fully green, 30/30**. Caught by nothing. The rendered-predicate
assertion lives in the organizations test and covers the **organizations route only**; there is no
equivalent for people, deals or activities. Cross-route predicate coverage is plan 49-05's.

## Set A Was Avoided, Not Amended

The ROADMAP named `src/lib/mutations/organizations.test.ts:134` and `:600` as a **mandatory** trap.
It is not mandatory — it was avoidable by placement, and this plan avoided it.

Both assertions are exact equalities on `createOrganizationMutation`'s return
(`expect(result).toEqual({ success: true, id: "org1", organization: fakeOrg })`), so they break only
if that return changes. Putting the re-read in the route leaves the mutation untouched. Placement in
the mutation was not merely unnecessary but **impossible as a four-entity fix**: `people` and `deals`
POST call no create mutation at all, so a mutation-level change covers two of four entities.

Evidence: `git diff --exit-code -- src/lib/mutations/organizations.test.ts` exits **0**, the file is
absent from `git diff --name-only HEAD~2 HEAD`, and `organizations.test.ts` is green in the
verification run. Lines 134 and 600 were never edited.

## Comments Retired

The three-line `// The 201 body deliberately carries the PRE-recalc row: ... backlog 999.23`
comment — which documented the defect as intentional and became false the moment the fix landed —
is gone from **both** Shape B routes (`people/route.ts:260-262`, `deals/route.ts:351-353`).
`grep -rn "999.23"` over the four route files exits **1** (no match). The replacement prose, present
in all four routes, names `formula-recalc.ts:960-991` as the write that lands between the insert and
the read, and names the deliberate absence of an `updatedAt` bump as the reason the re-read differs
in `custom_fields` and nowhere else.

The two Set B **test** comments that asserted the deferral were rewritten to state Phase 49's
decision. The `999.23` string survives in four test-file locations that are not this plan's to
change: two cell titles in the PUT describes (`"a PUT has no 999.23 gap"`), which remain accurate.

## Why the Proof Manufactures Its Own Divergence

DATA-02 is **purely latent** — nothing diverges in production today. Divergence needs at least one
`type='formula'` custom-field definition and there are zero, so `recalculateFormulas` never writes
(`inScope.length === 0`). A test written against live definitions would be **green before and after
the fix**. Every cell here therefore manufactures the divergence: `RECALC_RESULT` in the two Set B
files was already deliberately unequal to `STORED_CUSTOM_FIELDS`, and the new organizations file
adds `preRecalcOrg` / `canonicalOrg` fixtures unequal in the same way, with a **self-test describe**
asserting the inequality holds and that the two rows differ in `customFields` and nowhere else —
including `updatedAt`. If those fixtures ever become equal, the self-test reddens rather than every
body assertion silently going vacuous.

Also deliberate: both D-05 cells keep their emit assertions **unchanged** and now carry an explicit
`findFirst` stub resolving the **PRE**-recalc row, with a comment saying why — the recalc threw
before its `db.update`, so the database still holds the stored blob. Leaving the describe-level
post-recalc stub in place would have had those cells assert a value the failed recalc never
persisted.

## Verification

| Gate | Result |
|---|---|
| 4 amended/new test files + Set A + log-scope + route-authorization + openapi-error-coverage | **8 files, 269/269 passed** |
| Full base suite | **5557 passed / 32 skipped over 181 files** (baseline 5546/32 over 180) |
| `tsc --noEmit` | **0** |
| `npm run lint` | **118 problems, 0 errors** (gated on errors; the warning total is not reproducible across trees) |
| `git diff --exit-code -- src/lib/mutations/organizations.test.ts` | **0 — untouched** |
| `public/openapi.yaml` in diff | **absent** |
| `?expand=` on any POST | **not added** |

**Base-suite delta attributed:** +11 tests, +1 file, both entirely
`src/app/api/v1/organizations/__tests__/route.test.ts` (11 cells: 9 in the POST describe, 2 in the
fixtures self-test). No other file's test count changed — the two Set B inversions replaced one cell
with one cell.

## Deviations from Plan

**1. [Rule 3 - Blocking] The plan's `<verify>` commands hard-code `cd /home/pedro/programming/pipelite`.**
- **Found during:** Task 1 verification.
- **Issue:** This executor runs in a git worktree. Running the verify command as written would have
  typechecked and tested the **main** repo, which does not contain any of this plan's changes —
  producing a green transcript that proved nothing about the work.
- **Fix:** ran every command from the worktree root
  (`/home/pedro/programming/pipelite/.claude/worktrees/agent-ac47ba93a0bf77e85`). The vitest banner
  in each transcript names that path, which is how the transcripts can be checked.
- **Files modified:** none.

**2. [Rule 3 - Blocking] `git checkout -- <file>` destroyed an uncommitted fix during ablation 1.**
- **Found during:** Task 2, restoring after the first ablation.
- **Issue:** the fix had not yet been committed, so restoring the ablated file reverted it to Task
  1's commit — silently removing the organizations re-read.
- **Fix:** re-applied the edit, re-verified green (269/269, `tsc` 0), **committed Task 2 first**, and
  only then ran ablations 2 and 3 so a restore could not lose work. Detected because
  `grep -c findFirst` on the restored file returned 0.
- **Files modified:** `src/app/api/v1/organizations/route.ts` (restored to intended state).

**3. Three-term predicate rather than the research block's two.** `49-RESEARCH.md`'s reference code
omits `isNull(deletedAt)`; the plan's `<behavior>` requires it. Followed the plan. Noted so a later
reader does not treat the research block as the spec.

## Threat Model Outcomes

| Threat ID | Disposition | Outcome |
|---|---|---|
| T-49-03-01 | mitigate | `stripCallerFormulaKeys` still runs before the insert in both Shape B routes; the strip cells in both formula-recalc files are green. |
| T-49-03-02 | mitigate | three-term predicate in all four routes; rendered-`where` assertion pins id, `owner_id` and `deleted_at is null` — **for organizations only** (ablation 3). |
| T-49-03-03 | mitigate | fallback kept AND logged, string-literal scope, record id in the context object; asserted by a dedicated cell. |
| T-49-03-04 | **mitigate, limit RECORDED** | ablation 2 drove it: the rejected merge passes 20/20. Recorded above, not hidden. |
| T-49-03-05 | accept | no `catch` added around the read. |
| T-49-03-06 | mitigate | RED and GREEN are two commits inside ONE plan; neither is pushed alone, and the plan closed green. |
| T-49-03-07 | mitigate by exclusion | no POST accepts `?expand=`; `openapi-error-coverage.test.ts` green. |
| T-49-03-08 | mitigate | route-level placement only; `organizations.test.ts` diff exits 0. |

## Known Stubs

None. No hardcoded empty value, placeholder string or unwired component was introduced.

## Threat Flags

None. The change adds no endpoint, no auth path and no schema change; it adds one `SELECT` per
create, narrowed by the same predicate the corresponding GET already uses.

## Follow-ups for Later Plans

- **49-05 owns the discrimination this plan cannot deliver** (ablation 2) and the cross-route
  predicate coverage (ablation 3). Both are recorded above with the transcript that shows the gap.
- The three PUT handlers in `people/[id]`, `deals/[id]` and `activities/[id]` still use the rejected
  in-process merge. Out of scope here (this plan is creates only), and left untouched.

## Self-Check: PASSED

- `src/app/api/v1/organizations/__tests__/route.test.ts` — FOUND (created)
- `src/app/api/v1/organizations/route.ts` — FOUND, 1 canonical read, 1 fallback log, 0 `999.23`
- `src/app/api/v1/people/route.ts` — FOUND, 1 canonical read, 1 fallback log, 0 `999.23`
- `src/app/api/v1/deals/route.ts` — FOUND, 1 canonical read, 1 fallback log, 0 `999.23`
- `src/app/api/v1/activities/route.ts` — FOUND, 1 canonical read, 1 fallback log, 0 `999.23`
- commit `284800a` (RED, test) — FOUND
- commit `f44d856` (GREEN, feat) — FOUND
- `STATE.md` / `ROADMAP.md` — NOT modified (worktree mode; the orchestrator owns those writes)

## TDD Gate Compliance

Gate sequence present and in order: `284800a` `test(49-03): ...` (RED, 7 assertions failing) →
`f44d856` `feat(49-03): ...` (GREEN, 269/269). No REFACTOR commit was needed. The RED gate was
observed against shipped code before any route source was edited — Task 1's diff contains test files
only.
