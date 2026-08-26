---
phase: 49-mutation-layer-truth-after-commit
plan: 05
subsystem: api-v1-create-responses
tags: [DATA-02, SC-4, db-test, postgres, formula-recalc, canonical-read, ablation, owner-scope]

# Dependency graph
requires:
  - plan: 49-01
    provides: "mintFieldDefinition / removeFieldDefinitions — the type='formula' subject this proof would be vacuous without, plus the re-measured premise (0 live formula definitions) that makes manufacturing it necessary"
  - plan: 49-03
    provides: "the canonical read in all four POST handlers, and the recorded LIMIT of its unit proof (ablation 2) that is this plan's reason to exist"
  - "src/app/api/v1/__tests__/api-key-fixture.ts mintApiKey — real keys through the real unmocked withApiAuth"
  - "scripts/dedup-db-test-setup.sh — the isolated pipelite_dedup_test database, rebuilt empty per run"
provides:
  - "the behavioural four-entity DATA-02 proof: a 201's custom_fields deeply equals a subsequent GET's, for organizations, people, deals AND activities, against real PostgreSQL, with the stored column cross-checked by direct SQL"
  - "four per-entity ablations, each reddening exactly ONE cell — the four-entity claim as four measurements rather than one inference"
  - "the MEASURED answer to whether this proof discriminates a canonical read from the rejected in-process merge: IT DOES NOT, and the control that proves the negative is a measurement rather than an assumption"
  - "cross-route GET-by-id owner scoping for all four entities — closing 49-03's ablation 3, which nothing caught"
  - "DEF-49-01/02/03: the activities 403-vs-404 asymmetry, an inaccurate 49-03 comment, and the structural unobservability of a create's owner term"
affects: [49-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Behavioural create-response proof: POST through a real key, GET through the same key, compare only the criterion's field, cross-check the column by direct SQL"
    - "Sweep route-generated records by owner_id as a SECOND leftover predicate, because the four POST handlers generate their own ids and a prefix sweep reports zero"
    - "A measured-asymmetry map (FOREIGN_READ_STATUS) as a two-way drift alarm instead of a widened assertion"
    - "Assert THE criterion FIRST in a cell, so an ablation transcript prints the divergence rather than a symptom"

key-files:
  created:
    - src/app/api/v1/__tests__/create-response-canonical.db.test.ts
    - .planning/phases/49-mutation-layer-truth-after-commit/deferred-items.md
  modified: []
  ablated-and-restored:
    - src/app/api/v1/organizations/route.ts
    - src/app/api/v1/organizations/[id]/route.ts
    - src/app/api/v1/people/route.ts
    - src/app/api/v1/deals/route.ts
    - src/app/api/v1/activities/route.ts

key-decisions:
  - "The proof does NOT discriminate a canonical read from the rejected in-process merge, and that is stated as a measurement (ablations 5 and 5b, both green) rather than hidden. It CANNOT, and the reason is structural, not a weakness of the design."
  - "A second identity WAS added, against the plan's 'one identity is enough' seed spec, because 49-03's SUMMARY assigns cross-route predicate coverage here and that coverage is impossible with one identity. It is scoped to its own describe and is not DATA-02's subject."
  - "The activities 403-vs-404 asymmetry is ASSERTED as measured rather than harmonised or papered over with a widened assertion. Changing a published status code is not this plan's subject."
  - "The four ablation transcripts were RE-RUN against the final committed file after the second identity landed, because the first four described an 18-cell version that is no longer what shipped."

requirements-completed: [DATA-02]

# Metrics
duration: ~85min
completed: 2026-08-26
tasks: 2
commits: 5
files_changed: 2
---

# Phase 49 Plan 05: Behavioural Four-Entity DATA-02 Proof Summary

**One request creates the record, a second reads it back, and the two bodies' `custom_fields` are
compared — for all four entities, against real PostgreSQL through real minted keys, over a
divergence the file manufactures itself. And the one thing it cannot discriminate is measured and
recorded rather than claimed away.**

## Performance

- **Duration:** ~85 min
- **Tasks:** 2
- **Commits:** 5
- **Files created:** 2 (one proof file, one deferred-items log). **No production file was changed** —
  the five route files were ablated and restored, and `git diff --exit-code -- src/` exits **0**.

---

## THE HEADLINE, STATED BEFORE ANYTHING ELSE

Plan 49-03 recorded that its unit proof cannot discriminate a canonical read from the rejected
in-process merge, and named this plan as "the only thing that can discriminate the two". **It
cannot either.** That is the most important sentence in this document and it is not buried.

**Ablation 5** — replacing the deals canonical read with
`serializeDeal({ ...deal, customFields: recalculatedCustomFields })`, the shape the user explicitly
rejected — passes this behavioural, real-PostgreSQL, four-entity proof **23/23, fully green**.

**And that is not a flaw in the design; it is a property of the subject.** The proof was not
weakened to let it through, and it was not strengthened to catch it, because catching it is not
possible from outside the process. Two response bodies are the only thing a behavioural proof can
compare, and the merge produces the same bytes as a re-read for exactly as long as
`recalculateFormulas` writes `customFields` and nothing else — which it does today, deliberately,
including *not* bumping `updatedAt` (`formula-recalc.ts:983-986`).

**Ablation 5b makes the negative a measurement rather than an inference.** With the merge in place,
the canonical read's predicate was additionally rewritten to resolve **nothing**
(`eq(deals.id, "crcanon-ablation-5b-no-such-id")`), so the 201 provably did not consult the database
at all. Still **23/23 green**. So the proof is not "insufficiently sensitive" to the re-read — it is
**blind to whether the re-read happens at all**, and now demonstrably so.

**Control 5c proves 5b was not an inert edit.** With the dead predicate kept and the merge removed
(`serializeDeal(canonical ?? deal)`, so the fallback to the pre-recalc row fires), the deals cell
**reddens**. The dead read was genuinely dead; the green in 5b was a real observation.

**What DATA-02's guarantee therefore is:** the **code path**, not a currently-observable difference.
The contract — "one code path defines truth" — was chosen for the field that does not exist yet.
There is no derived field today beyond `customFields`, so today the rejected shape and the accepted
shape are observationally identical; the moment a second column becomes derived, the merge begins
lying and the canonical read does not. That is the whole argument, and it is an argument about
**future correctness under change**, which no test of present behaviour can express.

**For 49-09:** DATA-02's sign-off must rest on (a) the code path being in place in all four routes,
verified structurally by 49-03, and (b) the four ablations below, which prove each route's 201 really
is sourced from a database read rather than from the write's return value. It must **not** claim that
the rejected merge is caught by anything. Nothing in this phase catches it, and this plan says so
having driven it.

The proof file states this in its own prose too, at a dedicated cell
(`the canonical read is a code-path guarantee, not only an observable difference`) whose assertion —
`updated_at === created_at` after a create — is the **premise** the equivalence rests on. It reddens
on the day a second column becomes derived, which is the day the contract becomes observable.

---

## THE FIRST RUN WAS GREEN, AND THAT WAS NOT EVIDENCE

Recorded as the plan requires. The very first run of the file against shipped code was **18/18
green**, because 49-03 had already landed the fix in wave 1. A green first run says nothing: a file
asserting `expect(true).toBe(true)` four times would also be green. Everything that makes the green
mean something is below — the three pre-flight floors, and the six ablations.

---

## Task Commits

| # | What | Commit |
|---|---|---|
| 1 | Task 1 — the four-entity proof | `343eee4` (test) |
| 2 | Assert THE PROOF first, so an ablation prints both blobs | `5a517f5` (refactor) |
| 3 | Task 2 addition — cross-route owner scoping, closing 49-03's ablation 3 | `c2f12cc` (test) |
| 4 | DEF-49-01/02/03 | `1c000b3` (docs) |
| 5 | The no-mocks claim spelled the token its own gate counts | `49b362b` (fix) |

Task 2 produced **no source commit**, and correctly so: its work was five ablations, every one
restored. `git diff --exit-code -- src/` exits **0**.

---

## THE PRE-FLIGHT FLOORS, WITH THEIR MEASURED VALUES

Asserted before any request is made, because the premise 49-01 confirmed — **zero live
`type='formula'` definitions** — means a DATA-02 test written against live definitions is green
before AND after the fix.

| Floor | Named literal | Measured |
|---|---|---|
| live `type='formula'` definitions in the isolated DB **before** the seed | `FORMULA_DEFINITIONS_BEFORE_SEED = 0` | **0** |
| live `type='formula'` definitions per entity type after the seed | `FORMULA_DEFINITIONS_PER_ENTITY = 1` | **1** each, for all four |
| minted definition ids under `crcanon-%`, and they are the only ones | `FORMULA_DEFINITIONS_TOTAL = 4` | **4** |
| identities seeded, with a stage inside a pipeline each owns | `IDENTITIES_SEEDED = 2` | **2** |

Every literal is additionally asserted **non-zero**, and `FORMULA_DEFINITIONS_TOTAL` is asserted
equal to `FORMULA_DEFINITIONS_PER_ENTITY * ENTITIES_PROVEN`, because an assertion that derives both
of its sides from one source passes on an empty database.

**The manufactured divergence**, one formula per entity type, each over a NATIVE attribute the create
writes so it reaches scope through `scopeFormulasToChangedFields`'s native-column matching mode:

| Entity | Field name | Expression | Input sent | Expected value, COMPUTED IN THE TEST |
|---|---|---|---|---|
| organization | `Rótulo Canônico Organização` | `{{Name}} + "-derivado"` | `crcanon-Organização Canônica` | `crcanon-Organização Canônica-derivado` |
| person | `Rótulo Canônico Pessoa` | `{{FirstName}} + "-derivado"` | `crcanon-Ada` | `crcanon-Ada-derivado` |
| deal | `Valor Dobrado Negócio` | `{{Value}} * 2` | `500` | `1000` |
| activity | `Rótulo Canônico Atividade` | `{{Title}} + "-derivado"` | `crcanon-Atividade Canônica` | `crcanon-Atividade Canônica-derivado` |

No name contains a forward slash. The expected values are computed from the POST's input, never read
from the engine's output — so no assertion is a tautology.

---

## THE FOUR PER-ENTITY ABLATIONS, VERBATIM

Each performed and **restored before the next began**. Each reverts one route's `createdResponse` to
serialize the row the write returned — the shape that shipped before 49-03. All four transcripts
below were **re-run against the FINAL committed 23-cell file**, after the second identity landed; the
originals described an 18-cell version that is not what shipped, and are not quoted here.

### Ablation 1 — organizations (Shape A, create mutation)

`serializeOrganization(canonical ?? result.organization)` → `serializeOrganization(result.organization)`

```
 ❯ |db| src/app/api/v1/__tests__/create-response-canonical.db.test.ts (23 tests | 1 failed) 608ms
     × organizations (Shape A, create mutation) 119ms

 FAIL  ... > DATA-02 — a 201's custom_fields equals a subsequent GET's, per entity > organizations (Shape A, create mutation)
AssertionError: the 201 body's custom_fields does not equal what GET /api/v1/organizations/{id} returns for the same record — the create response and a subsequent read disagree, which is DATA-02.: expected { Object (Origem Canônica) } to deeply equal { …(2) }
- Expected
+ Received
  {
    "Origem Canônica": "crcanon-request-body",
-   "Rótulo Canônico Organização": {
-     "error": null,
-     "formula": true,
-     "value": "crcanon-Organização Canônica-derivado",
-   },
  }

 Test Files  1 failed (1)
      Tests  1 failed | 22 passed (23)
```

**ONE cell red. The other three entity cells stayed GREEN.**

### Ablation 2 — people (Shape B, inline `db.insert`)

`serializePerson(canonical ?? person)` → `serializePerson(person)`

```
 ❯ |db| ... (23 tests | 1 failed) 713ms
     × people (Shape B, inline db.insert) 76ms

AssertionError: the 201 body's custom_fields does not equal what GET /api/v1/people/{id} returns for the same record — ... which is DATA-02.: expected { Object (Origem Canônica) } to deeply equal { …(2) }
- Expected
+ Received
  {
    "Origem Canônica": "crcanon-request-body",
-   "Rótulo Canônico Pessoa": {
-     "error": null,
-     "formula": true,
-     "value": "crcanon-Ada-derivado",
-   },
  }

      Tests  1 failed | 22 passed (23)
```

**ONE cell red. The other three stayed GREEN.**

### Ablation 3 — deals (Shape B, inline `db.insert`)

`serializeDeal(canonical ?? deal)` → `serializeDeal(deal)`

```
 ❯ |db| ... (23 tests | 1 failed) 637ms
     × deals (Shape B, inline db.insert) 61ms

AssertionError: the 201 body's custom_fields does not equal what GET /api/v1/deals/{id} returns for the same record — ... which is DATA-02.: expected { Object (Origem Canônica) } to deeply equal { …(2) }
- Expected
+ Received
  {
    "Origem Canônica": "crcanon-request-body",
-   "Valor Dobrado Negócio": {
-     "error": null,
-     "formula": true,
-     "value": 1000,
-   },
  }

      Tests  1 failed | 22 passed (23)
```

**ONE cell red. The other three stayed GREEN.** Note that the `code-path guarantee` cell also POSTs a
deal and stayed green — correctly, since it asserts `updated_at === created_at` and not the body.

### Ablation 4 — activities (Shape A, create mutation)

`serializeActivity(canonical ?? result.activity)` → `serializeActivity(result.activity)`

```
 ❯ |db| ... (23 tests | 1 failed) 658ms
     × activities (Shape A, create mutation) 44ms

AssertionError: the 201 body's custom_fields does not equal what GET /api/v1/activities/{id} returns for the same record — ... which is DATA-02.: expected { Object (Origem Canônica) } to deeply equal { …(2) }
- Expected
+ Received
  {
    "Origem Canônica": "crcanon-request-body",
-   "Rótulo Canônico Atividade": {
-     "error": null,
-     "formula": true,
-     "value": "crcanon-Atividade Canônica-derivado",
-   },
  }

      Tests  1 failed | 22 passed (23)
```

**ONE cell red. The other three stayed GREEN.**

### The four-entity claim is therefore FOUR MEASUREMENTS

**No run reddened two cells.** The cells are not coupled, and the coverage cell was deliberately
built so it cannot couple them: `CELLS_THAT_RAN.add(...)` is the **first statement** of each cell, so
a FAILING cell still records that it ran. Had it been recorded at the end, every ablation would have
reddened two cells and destroyed exactly the per-entity claim it exists to support. (This is the
Phase-48 hazard "a restore helper that resets what a cell WRITES but not what a cell TRANSFERS", in
its coverage-bookkeeping form.)

---

## ABLATION 5 — THE REJECTED IN-PROCESS MERGE, AND ITS TWO CONTROLS

### 5 — the merge itself

`serializeDeal(canonical ?? deal)` → `serializeDeal({ ...deal, customFields: recalculatedCustomFields })`

```
 Test Files  1 passed (1)
      Tests  23 passed (23)
```

**Fully green.** Diff confirmed in effect before the run:

```
-    return createdResponse(serializeDeal(canonical ?? deal))
+    return createdResponse(serializeDeal({ ...deal, customFields: recalculatedCustomFields }))
```

### 5b — the merge PLUS a canonical read that resolves nothing

Added on top of 5 (**deviation, Rule 2**), because "the merge passes" is compatible with two very
different stories: the proof might be nearly sensitive, or blind. Predicate rewritten to
`eq(deals.id, "crcanon-ablation-5b-no-such-id")`, so the 201 provably consulted no row.

```
 Test Files  1 passed (1)
      Tests  23 passed (23)
```

**Still green.** So the proof is **blind to whether the canonical read happens at all** — not merely
under-sensitive to which row it returns. This is the sharpest available statement of the limit, and
it is a measurement.

### 5c — the control on the control

Dead predicate KEPT, merge REMOVED (`serializeDeal(canonical ?? deal)`, so the fallback to the
pre-recalc row fires):

```
 ❯ |db| ... (23 tests | 1 failed) 625ms
     × deals (Shape B, inline db.insert) 51ms
AssertionError: ... expected { Object (Origem Canônica) } to deeply equal { …(2) }
-   "Valor Dobrado Negócio": { "error": null, "formula": true, "value": 1000 },
      Tests  1 failed | 22 passed (23)
```

**Red.** The dead predicate was genuinely live; 5b's green was not an inert edit. Without 5c, 5b
would have been an unverified claim about a sabotage that might never have taken effect — which is
the failure mode this milestone keeps finding.

### The honest interpretation

The measured outcome is the one research predicted, in the direction it predicted. It is **not**
presented as a failure of the proof and the proof was **not** weakened to catch it. Stated plainly:

- the rejected shape and the accepted shape are **observationally identical today**;
- the contract was chosen for **the field that does not exist yet**;
- the guarantee this phase ships is **the code path**, not a currently-observable difference;
- **no proof in this phase discriminates the two, and 49-09 must not claim one does.**

Had the merge FAILED a cell, that would have been a stronger result than expected and would have
meant a derivation beyond `customFields` already exists in these four paths, contradicting research.
It did not.

---

## ABLATION 6 — CLOSING 49-03's ABLATION 3, AND WHAT IT UNCOVERED

49-03's **ablation 3** dropped the owner term from the activities predicate and measured that
**nothing caught it, 30/30 green**. Its SUMMARY assigns cross-route predicate coverage here. Both
halves were measured before anything was added.

### 6a — owner term dropped from the organizations POST canonical read: NOT CAUGHT, and cannot be

```
 Test Files  1 passed (1)
      Tests  18 passed (18)
```

**Green, and no test can do better.** The insert immediately above wrote `ownerId` as the caller's
id, so the two-term and three-term predicates resolve the same row on every reachable execution. The
owner term in a create's canonical read is **structurally unobservable** — defence-in-depth against a
future refactor, not a behaviour. Logged as **DEF-49-03** so no later plan spends time on a gate that
cannot exist.

### 6b — owner term dropped from the organizations GET-by-id: NOT CAUGHT by the file as it then stood

```
 Test Files  1 passed (1)
      Tests  18 passed (18)
```

Green — the gap, reproduced. **This one IS observable**, and it matters directly to SC-4: the
contract is "the 201 equals what the GET returns", so a GET whose predicate is unscoped does not
merely leak, it makes the contract meaningless — the 201 would be agreeing with a read anybody can
perform.

### The coverage added, and its RED

A second real identity (`USER_B` / `KEY_B`, its own pipeline and stage) and four matched-pair cells:
B creates, **A is refused**, **B is not**. The row's owner is confirmed by direct SQL first, so a
refusal cannot be a missing row. The refusal alone would be satisfied by a route that serves nothing;
the success alone by a row visible to everyone. Only the pair is a proof.

With 6b still in place, the new cells were run:

```
 ❯ |db| ... (23 tests | 1 failed) 1336ms
     × organizations: A is refused B's record, and B is not 109ms

AssertionError: organization: a foreign GET-by-id was not refused with 404. Either the predicate lost its owner term, or the refusal status changed — if the latter, update FOREIGN_READ_STATUS and say so, do not widen this assertion.: expected 200 to be 404
- Expected
+ Received
- 404
+ 200
```

**Exactly one cell red.** Route restored; `git diff --exit-code` on the four route directories exits
**0**; suite back to **23/23**.

### What it uncovered on the way: DEF-49-01

The first run of the four new cells reddened **two**, and the second red was against **unablated
shipped code**:

```
 FAIL  ... > activities: A is refused B's record, and B is not
AssertionError: A read B's activity — the GET-by-id predicate is not owner-scoped. This is the exact term plan 49-03's ablation 3 removed and nothing caught.: expected 403 to be 404
- Expected
+ Received
- 404
+ 403
```

`GET /api/v1/activities/[id]` fetches on `id` and `deleted_at` **only**, then compares
`activity.ownerId` and returns `Problems.forbidden()` — **403**, where its three siblings fold
ownership into the predicate and return **404**. Two consequences, both logged rather than fixed:

- **DEF-49-01** — a 403 where the siblings 404 is an **existence oracle**. Not changed here: a status
  code is a published contract (`public/openapi.yaml`, `openapi-error-coverage.test.ts`) and this
  plan's subject is DATA-02. **Rule 4 territory, deliberately not taken.**
- **DEF-49-02** — `activities/route.ts`'s DATA-02 comment claims its canonical read uses "the same
  three-term predicate `GET /api/v1/activities/[id]` uses". **That GET's predicate has two terms.**
  The read is still correctly scoped — it is strictly narrower than the GET it is described as
  mirroring — so this is an inaccurate sentence, not a defect. 49-03's SUMMARY repeats the claim for
  all four entities; it holds for three.

The proof does not widen its assertion to swallow the difference. `FOREIGN_READ_STATUS` records the
measured status per entity and a dedicated cell asserts the **asymmetry itself** (exactly two
distinct values; activities differs; the other three agree), so the file reddens **in both
directions** — including the day somebody harmonises the four and forgets to say so.

---

## FIXTURE HYGIENE — ASSERTED, NOT ASSUMED

Eleven `TOUCHED_TABLES`: `users`, `api_keys`, `pipelines`, `stages`, `activity_types`,
`organizations`, `people`, `deals`, `activities`, `custom_field_definitions`, `audit_log`.

Two tables cannot use a shared `id like 'crcanon-%'` predicate, and both exceptions are load-bearing:

- **the four CRM tables** hold records whose ids the ROUTE generated (`$defaultFn`
  `crypto.randomUUID`), so an id-prefix check reports zero no matter how many leaked. Every sweep and
  every leftover predicate over those tables also matches `owner_id`, which is the seeded user's
  prefixed id. Without it a red run leaves an orphan referencing a fixture parent and the next run
  dies at teardown with `23503`, reporting the wrong cause.
- **`audit_log.id`** is a generated UUID, so its predicate is `entity_id` / `actor_user_id`.

`custom_field_definitions` is in the list with its own prefix-scoped predicate for a sharper reason
than tidiness: `getActiveFieldDefinitions` is **uncached** (49-01 proved it behaviourally), so one
leaked `type='formula'` definition silently activates the formula path for every later db-test file
in the same run.

`beforeAll` cleans **then** measures (WR-04). `afterAll` is two-part: zero leftovers, and totals
equal to baseline. `afterEach` sweeps the route-created records and their audit rows.

**Verified out-of-band, after all six ablations including the failed runs**, by direct SQL against
the isolated database:

```
 custom_field_definitions: all_defs=0 | formula_defs=0

       t        | n
----------------+---
 users          | 0
 api_keys       | 0
 organizations  | 0
 people         | 0
 deals          | 0
 activities     | 0
 pipelines      | 0
 stages         | 0
 activity_types | 0
 audit_log      | 0
```

**Absence asserted, not inferred from a green teardown.** And the live `pipelite` database is
untouched:

```
pipelite: live_defs=169 | formula_defs=0        <- exactly 49-01's measurement
pipelite: crcanon_rows_in_live=0
```

**No plaintext API key appears anywhere in this document or in any commit.** `mintApiKey` returns the
plaintext for in-process use only; only the key ROW ID (`crcanon-key-a`, `crcanon-key-b`) is named,
and the file asserts `keyA.plaintextKey !== keyB.plaintextKey` without printing either.

---

## Verification

| Gate | Result |
|---|---|
| `create-response-canonical.db.test.ts` alone | **23 passed / 23** |
| Full db project | **234 tests passed, 0 failed** (baseline 211 + 23) |
| Base suite (`vitest run`) | **5600 passed / 32 skipped over 183 files** — exactly the wave-1 baseline, unchanged |
| RSC project | **8 passed / 8** |
| `tsc --noEmit` | exit **0** |
| `eslint .` | **118 problems, 0 errors** (gated on errors; the warning total is not reproducible across trees) |
| `git diff --exit-code -- src/` after all six ablations | **0** |
| mocking-helper occurrences in the proof file | **0** on the real file, **1** on a sabotaged copy — the counter can fail |
| proof file length | **1,183 lines** (plan floor: 320) |
| `assertIsolatedConnection` / `mintApiKey` / `mintFieldDefinition` present | **8 / 3 / 6** occurrences |

The base suite being **identical** to the wave-1 baseline (5600/32 over 183 files, not 5601 or 184)
is the positive confirmation that the `*.db.test.ts` glob exclusion works: the count would have moved
had this file been collected there.

**DEF-48-01 confirmed still live and correctly ignored.** The db project exits non-zero on a green
suite; the only failure is the known pre-existing one, in a teardown hook, in a file this plan does
not touch:

```
 Test Files  1 failed | 9 passed (10)
      Tests  234 passed (234)

 FAIL  |db| src/lib/views/queries.db.test.ts
Error: Failed query: select count(*)::int as n from "saved_view_defaults" where id::text like $1
Caused by: PostgresError: column "id" does not exist   { code: '42703' }
```

**234 tests passed, 0 tests failed.** Counts read, exit code ignored, exactly as the constraint
requires.

---

## Decisions Made

1. **The negative result is the headline, not a footnote.** 49-03 handed this plan the job of
   discriminating the canonical read from the rejected merge. It cannot be done behaviourally, and
   the SUMMARY leads with that rather than burying it under four green ablations.
2. **The proof was neither weakened nor strengthened to change that outcome.** Adding an assertion
   contrived to catch the merge (say, counting queries) would be a structural claim wearing a
   behavioural proof's clothes — and 49-03 already owns the structural claim.
3. **A second identity was added** despite the plan's seed spec saying one is enough. The spec's
   rationale ("confusion with plan 49-06's subject") does not apply: 49-06 is `/api/files/...` under
   session auth, an entirely different surface. 49-03's SUMMARY assigns cross-route predicate
   coverage here, and that coverage is impossible with one identity. Scoped to its own describe.
4. **The 403/404 asymmetry is asserted as measured, not harmonised.** Widening the assertion to
   "either 403 or 404" would have made it unable to detect the very thing it exists for.
   `FOREIGN_READ_STATUS` plus the asymmetry cell is a two-way drift alarm instead.
5. **THE PROOF is asserted first in each cell.** With discriminator 1 first, the first ablation
   transcript read `expected [ 'Origem Canônica' ] to include 'Rótulo Canônico Organização'` — a
   symptom. Reordered so a red prints both blobs, which is what an ablation record has to carry.
6. **Placement `src/app/api/v1/__tests__/`**, stated in the file header: it is where
   `api-key-fixture.ts` already lives, the file spans all four entity directories so co-locating it
   under any one would misfile it, and `runs-owner-scope.db.test.ts` is the in-repo precedent.
7. **The four ablation transcripts were re-run against the final file.** The originals described an
   18-cell version; quoting those would have described code that did not ship.

---

## Deviations from Plan

### 1. [Rule 2 — Missing critical coverage] Ablations 5b and 5c, beyond the plan's fifth

- **Found during:** Task 2, ablation 5.
- **Issue:** the plan asked only that the in-process merge be driven and its outcome recorded. It
  passed, as predicted — but "the merge passes" is compatible with two very different stories: the
  proof is nearly sensitive, or the proof is blind. Recording only ablation 5 would have left the
  strength of the limit unmeasured, and 49-09 has to weigh exactly that.
- **Fix:** 5b (merge + a canonical read resolving nothing → still green, so the proof is BLIND to
  the read, not merely under-sensitive) and 5c (dead read, merge removed → RED, so 5b's sabotage was
  genuinely live). Both quoted above.
- **Files modified:** none permanently. `git diff --exit-code -- src/` exits 0.

### 2. [Rule 2 — Missing critical coverage] A second identity and four cross-route owner-scoping cells

- **Found during:** Task 2, after the four per-entity ablations.
- **Issue:** the plan's seed spec says "one user and one minted API key (one identity is enough)".
  But 49-03's ablation 3 measured that dropping an owner term is caught by nothing, and its SUMMARY
  assigns cross-route predicate coverage to this plan. Measured here first: with one identity,
  dropping the owner term from the organizations GET-by-id left the file **18/18 green** (ablation
  6b). SC-4's contract is "the 201 equals what the GET returns", so an unscoped GET makes the
  criterion meaningless — this is inside the subject, not adjacent to it.
- **Fix:** `USER_B` / `KEY_B` with their own pipeline and stage, and four matched-pair cells in a
  dedicated describe whose header states exactly why identity B exists and that it is not 49-06's
  subject. The plan's stated rationale for one identity does not apply — 49-06 covers
  `/api/files/...` under session auth.
- **Verification:** with ablation 6b in place, exactly **one** cell reddens (transcript above).
- **Committed in:** `c2f12cc`.

### 3. [Rule 1 — Bug in this plan's own output] The no-mocks claim spelled the token its own gate counts

- **Found during:** Task 2, final metric check.
- **Issue:** the header read *"There is no `vi.mock` in this file at all, and this sentence
  deliberately does not spell the helper"* — **while spelling it**. The acceptance criterion is "the
  file contains no `vi.mock` at all"; measured, the counter returned **1**, entirely from that
  sentence. A gate satisfiable only by prose, on a file that otherwise satisfies it perfectly.
- **Fix:** rewritten in the `activities-scope.db.test.ts` house style, which does not spell it. The
  counter now returns **0** on the real file and **1** on a sabotaged copy, so it can fail.
- **Committed in:** `49b362b`.

### 4. [Rule 3 — Blocking] `db.execute` returns `timestamp` as a STRING

- **Found during:** Task 1, first run.
- **Issue:** the `updated_at === created_at` cell used `db.execute(sql\`select updated_at ...\`)` and
  failed with `TypeError: row.updated_at.getTime is not a function` — a raw statement bypasses
  drizzle's column mapping. That reads as a broken cell rather than as the drift the assertion
  watches for.
- **Fix:** switched that one read to `db.select({ updatedAt: deals.updatedAt, ... })`. The
  direct-SQL cross-checks of `custom_fields` and `owner_id` are deliberately left as raw
  `db.execute` — going through nothing either handler uses is the point there, and `jsonb`/`text`
  need no mapping.
- **Committed in:** `343eee4`.

### 5. [Rule 3 — Blocking] The worktree was stale by 30 commits

As it has been for every executor in this project. Corrected with `merge --ff-only` (never
`reset --hard`, since 49-04 is live in a sibling worktree) and verified by asserting that both
`src/lib/__tests__/custom-field-definition-fixture.ts` (49-01) and
`src/app/api/v1/organizations/__tests__/route.test.ts` (49-03) exist. Every command was run from the
worktree root; the vitest banner in each transcript above names that path, which is how they can be
checked.

---

**Total deviations:** 5 — three Rule 2/1 additions of coverage, two Rule 3 blockers. **No Rule 4
situation was taken:** DEF-49-01 (the 403/404 asymmetry) is exactly a Rule 4 case — a change to a
published API contract — and it was logged rather than made.

---

## Issues Encountered

- **`rtk` output mangling**, as recorded in project memory. `grep -c` over vitest output returned 0
  where a match plainly existed, so **no count in this document comes from a pipe**: the file metrics
  come from `node -e`, the row counts from `psql`, and the suite counts are read off the transcripts
  verbatim.
- **The postgres container is `pipelite-postgres-1`**, not `pipelite-postgres`. The setup script
  discovers it by filter; a hand-written `docker exec pipelite-postgres` fails with
  `No such container`. Noted for whoever verifies these numbers by hand.
- The `log.error` fallback line under ablation 5b did not appear in the captured output. Not chased —
  it is not a gate of this plan, and the ablation's effect was confirmed instead by control 5c, which
  is the stronger evidence.

---

## Threat Model Outcomes

| Threat ID | Disposition | Outcome |
|---|---|---|
| T-49-05-01 | mitigate | `assertIsolatedConnection` copied verbatim, invoked at module scope, asserted by 4 cells including the ACCEPT cell. Verified out-of-band: `pipelite` holds 169 live definitions / 0 formula and **0** `crcanon-%` rows. |
| T-49-05-02 | mitigate | four manufactured definitions; three pre-flight floors including "held ZERO before the seed"; discriminator 1 asserts the derived key present BY NAME in both bodies. |
| T-49-05-03 | mitigate | direct-SQL cross-check of the `custom_fields` column in all four cells, routed through nothing either handler uses. |
| T-49-05-04 | mitigate | every expected value computed in the test from the POST's input; expressions are a concatenation and a doubling, legible in the diffs quoted above. |
| T-49-05-05 | mitigate | four ablations, each reddening **exactly one** cell. No run reddened two. The coverage cell records participation at the TOP of each cell so it cannot couple them. |
| T-49-05-06 | mitigate | `custom_field_definitions` in `TOUCHED_TABLES` with its own predicate; two-part `afterAll`; **absence verified by direct SQL after the failed runs** (`all_defs=0, formula_defs=0`). |
| T-49-05-07 | mitigate | each ablation restored before the next began; `git diff --exit-code -- src/` exits 0. |
| T-49-05-08 | **mitigate, and the claim is REFUSED** | ablation 5 drove the comparison; 5b and 5c measured how blind the proof is. The SUMMARY states the guarantee is the code path and instructs 49-09 not to claim discrimination. |
| T-49-05-09 | mitigate | only key ROW IDs recorded; no plaintext key in this document or any commit. |
| T-49-05-10 | mitigate | wave rule honoured — no other db-test-owning plan shared wave 2; 49-04 owns none. `dedup-db-test-setup.sh` was run once, at the start. |

---

## Known Stubs

None. No hardcoded empty value, placeholder string or unwired component was introduced. Every cell
described in the plan's `<behavior>` block exists and passes, and the two cells that go BEYOND it
(cross-route owner scoping, the asymmetry record) are documented as deviations above.

## Threat Flags

None. This plan adds no endpoint, no auth path, no file-access pattern and no schema change. It adds
one test file and one documentation file, and changed no production source (`git diff --exit-code --
src/` exits 0).

One **pre-existing** surface finding is recorded rather than introduced: `GET
/api/v1/activities/[id]`'s 403 is an existence oracle where its siblings return 404 (**DEF-49-01**).
It predates this phase and is unchanged by it.

---

## TDD Gate Compliance

**The RED gate for this plan's own subject was NOT available, and the reason is structural rather
than a shortcut.** Plan 49-03 landed the canonical read for all four entities in wave 1, so a proof
written in wave 2 is green on its first run against shipped code — as recorded above, 18/18.

- **`test(...)` gates present:** `343eee4` (the proof) and `c2f12cc` (the cross-route coverage).
- **`feat(...)` gate absent, deliberately:** there is no implementation for this plan to write. Its
  deliverable is a proof, and the code it proves shipped in 49-03 (`f44d856`). A `feat` commit here
  would be an empty gesture.
- **What supplies the observable RED instead:** the **six ablations**, all quoted verbatim above.
  Ablations 1-4 each redden exactly one cell; 6b reddens the added coverage; 5c reddens the deals
  cell and validates 5b's sabotage. Under the milestone rule "a gate with no recorded red is treated
  as NOT DELIVERED", every gate in this file has one — **except** the two whose red is impossible and
  which are recorded as such: ablation 5 (the rejected merge, green by construction) and ablation 6a
  (the create's owner term, green by construction, logged as DEF-49-03).
- The `c2f12cc` addition DID follow RED-then-GREEN within Task 2: the four new cells were written and
  run while ablation 6b was still in place, reddening exactly one, and only then was the route
  restored.

---

## Self-Check: PASSED

Files claimed, on disk:

- `src/app/api/v1/__tests__/create-response-canonical.db.test.ts` — FOUND, **1,183 lines**, contains
  `assertIsolatedConnection` (8), `mintApiKey` (3), `mintFieldDefinition` (6), mocking helper (**0**)
- `.planning/phases/49-mutation-layer-truth-after-commit/deferred-items.md` — FOUND
- `.planning/phases/49-mutation-layer-truth-after-commit/49-05-SUMMARY.md` — FOUND (this file)

Commits claimed, in `git log`: `343eee4`, `5a517f5`, `c2f12cc`, `1c000b3`, `49b362b` — all FOUND.
`git diff --diff-filter=D --name-only 343eee4~1 HEAD` reports **no deleted files**.

`STATE.md` and `ROADMAP.md` — **NOT modified.** This executor ran in a worktree alongside 49-04; the
orchestrator owns those writes after the wave.

---

## For Plan 49-09

1. **DATA-02 is proven behaviourally for all four entities, none inferred** — four ablations, each
   reddening exactly one cell, transcripts above.
2. **Do NOT claim that anything in this phase discriminates the canonical read from the rejected
   in-process merge.** It does not. 49-03's ablation 2 and this plan's ablations 5 and 5b agree, and
   5b shows the proof is blind to whether the read happens at all. The guarantee is the **code
   path**, chosen for the derived field that does not exist yet.
3. **49-03's ablation 3 is CLOSED for the observable half** — GET-by-id owner scoping is now
   behavioural for all four entities. The **unobservable** half (a create's canonical read owner
   term) is closed by explanation, not by a gate, and is recorded as DEF-49-03 so nobody re-opens it.
4. **Three deferred items are new**: DEF-49-01 (activities 403 vs 404, an existence oracle),
   DEF-49-02 (49-03's comment names a predicate the activities GET does not use), DEF-49-03.
   DEF-49-02 means one sentence in 49-03's SUMMARY holds for three of four entities.
5. **DEF-48-05 / SEC-48-C was NOT absorbed. No `?expand=` was added to any POST. The "recoverable
   indefinitely" claim is not repeated. S3 coverage is not claimed.**

---
*Phase: 49-mutation-layer-truth-after-commit*
*Completed: 2026-08-26*
