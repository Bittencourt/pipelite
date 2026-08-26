---
phase: 48-rest-api-authorization
plan: 10
subsystem: phase-sign-off
tags: [security, idor, sign-off, negative-controls, anti-vacuity, docker-rebuild, SEC-01, SEC-02, QG-03, SEC-48-B]

# Dependency graph
requires:
  - phase: 48-rest-api-authorization
    plan: "01-09"
    provides: "the nine plan SUMMARYs whose transcripts this plan audits, and the four route fixes plus three gates whose evidence it judges"
  - phase: 47-suite-trust-supply-chain
    provides: "the sign-off shape 47-13 established — audit the evidence, not the intentions; a control with no recorded red is NOT DELIVERED"
provides:
  - "the negative-control register: 26 controls judged against verbatim tool output, 26 DELIVERED, 0 NOT DELIVERED"
  - "four fresh falsifications at sign-off, one of them new (the rename question, put to the OpenAPI gate for the first time)"
  - "the Q10 matcher EXTRACTED and RUN on five novel fixtures over parse floors, rather than read"
  - "the vacuity-hunt result: no twelfth gate that cannot fail, four tests applied to eight artifacts"
  - "the exploit and the 500 re-checked over real HTTP against a REBUILT image, with the image id compared"
  - "five criterion verdicts plus a SEC-48-B verdict, each naming the assertion that carries it"
  - "the re-measured phase gate and the new suite baseline, 5376 / 32 over 178 files"
affects:
  - "/gsd:verify-phase 48 — this is the evidence it checks"
  - "Phases 49-54 — the new baseline, the db-test wave-scheduling hazard, and four carried-forward items"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Image-id comparison as a freshness gate: `docker compose up -d --build` then assert the bound image id CHANGED, because `restart` runs the old image and a container's 'Starting' line proves nothing"
    - "A log-absence assertion given a FLOOR (the window must contain the traffic) and a positive-fixture self-test (the matcher must fire on a document that does contain the defect)"
    - "A prefixed, counted, foreign-key-ordered live-database probe: pre-probe totals recorded, fixtures deleted, absence asserted, totals re-asserted"
    - "A gate's matcher extracted and RUN on fixtures the gate file does not contain, each over a parse floor, rather than read"

key-files:
  created:
    - .planning/phases/48-rest-api-authorization/48-10-SUMMARY.md
  modified:
    - .planning/phases/48-rest-api-authorization/48-VALIDATION.md
    - .planning/ROADMAP.md
    - .planning/STATE.md

key-decisions:
  - "REQUIREMENTS.md checkboxes were deliberately NOT ticked — 48-09 recorded that /gsd:verify-phase 48 owns the status transitions, and REQUIREMENTS.md is not in this plan's files_modified"
  - "48-09's eleventh vacuous check is ACCEPTED rather than re-counted; this hunt searched for a twelfth and found none"
  - "MIN_EXEMPT_MATCHED = 11 is named as brittle rather than softened — a false-RED risk, not vacuity"
  - "A fourth fresh falsification was added beyond the plan's three, because no prior control had asked the rename question of the OpenAPI gate"
  - "The QG-03 boundary offset was read from the live table at probe time (74, with the fixture stage present), never hard-coded"

requirements: [SEC-01, SEC-02, QG-03]

# Metrics
duration: 35min
completed: 2026-08-26
tasks: 3
---

# Phase 48 Plan 10: Sign-Off Summary

**The IDOR is dead over real HTTP against a rebuilt image, the 500 is gone, twenty-six negative
controls are judged against verbatim output with none found wanting, and the hunt for a twelfth gate
that cannot fail came back empty — with the four tests it applied written down so the result can be
disbelieved.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-08-26T02:46Z
- **Completed:** 2026-08-26T03:12Z
- **Tasks:** 3 of 3
- **Files:** 1 created, 3 modified (all planning artifacts; **no `src/` file was changed** — every
  ablation in this plan was applied and restored, verified with `git diff --exit-code`)

## Task Commits

| Task | Commit | What landed |
|---|---|---|
| 1 | `ccd4a5e` | the exploit and the 500 re-checked over real HTTP against a rebuilt image |
| 2 | `1bb0fdb` | the negative-control register and the vacuity hunt |
| 3 | `5928c66` | criterion verdicts, the phase gate, ROADMAP and STATE |
| — | `91ef1dd` | this SUMMARY |
| — | `bb75be0` | the progress counters, which could only read 10/10 once the SUMMARY existed |
| — | `9bbd8ad` | **`48-VALIDATION.md`'s own stale claims, reconciled** — see the self-check below |

---

## 1. The rebuild, and why the image id is the gate

`docker compose restart` runs the **old** image. A container whose log says `Starting` proves only
that a process started, not that it started this phase's code — which is why the measurement below is
an id comparison and not a log reading.

```
before:  pipelite-app-1  image=sha256:8f07a18eddad0cdb377e6b3b96fa9a9fe531fe42a943d380c9be05b7fa2b6f58
         pipelite-app:latest  8f07a18eddad  16 hours ago     ← predates this phase's merges
$ docker compose up -d --build
         naming to docker.io/library/pipelite-app:latest done
         Container pipelite-app-1 Recreated / Starting / Started
after:   pipelite-app-1  bound_image=sha256:eba9cfa1c4beb51f4a680d9d9f0420f44ca6c3e8b7537a7f589ede8d101a4c8a
         pipelite-app:latest  eba9cfa1c4be  About a minute ago
```

**`8f07a18eddad` → `eba9cfa1c4be`.** The container's bound `.Image` followed the tag, so the running
process is this phase's code. `/api/health` → **200**, `db.ok: true`, `latencyMs: 1`, and **10 of 10**
processors reporting `alive: true`.

Had the ids matched, every measurement in §2 would have been void and the rebuild would have been
re-run. This is the third time in this milestone that a `--build` needed checking rather than trusting
(v1.3 shipped one that hit the layer cache; 47-08 proved its bumps from *inside* the container).

## 2. The exploit, re-run over real HTTP

Two temporary users (`p48gate-user-a`, `p48gate-user-b`, role `member`, status `approved`), two
temporary API keys minted with the recipe transcribed from `src/lib/api-keys.ts` (`pk_live_` +
`randomBytes(32).toString("base64url")`, sha256 digest stored), one activity each created **through
`POST /api/v1/activities` with that user's own key**, and one pipeline plus one stage owned by A. The
plaintext keys were written to `/tmp` only, used, and deleted; **neither appears in any committed
file, nor in any transcript below** — only the row ids and the 12-character prefixes were recorded.

Every row of the table below is a request research made against the *unfixed* container, re-issued
verbatim against the rebuilt one.

| Request | Research measured | Measured now | |
|---|---|---|---|
| `GET /activities/{B}` as A | **200**, body carried `owner_id: p48res-userB` | **403** `.../errors/FORBIDDEN` | reversed |
| `PUT /activities/{B}` as A | **200**, `"title":"HIJACKED BY A"` persisted | **403** `FORBIDDEN` | reversed |
| `PUT /activities/{A}` as A, `{owner_id: B}` | **200**, `owner_id` moved B → A | **422**, `errors: [{field:"owner_id", code:"forbidden", message:"owner_id cannot be reassigned through this endpoint"}]` | reversed |
| ↳ follow-up `GET` by A | (owner had moved) | **200**, `owner_id: p48gate-user-a` — **unchanged** | confirmed |
| `DELETE /activities/{B}` as A | **204**, empty body | **403** `FORBIDDEN` | reversed |
| ↳ B reads B's OWN row | **404** `ENTITY_NOT_FOUND` | **200**, `owner_id: p48gate-user-b` — still there | reversed |
| `POST /activities` as A, `{owner_id: B}` | the vector was open — `:154-164` validated only that the target user row existed | **422**, `message: "owner_id cannot be set to another user"` | reversed |
| ↳ B's activity count | — | **1 → 1**, unchanged across the attempt | confirmed |
| `GET /activities?limit=100` as B | **100 rows, none of them B's**, all one third party's, `meta.total` **79 024** | **1 row**, `distinct_owners: ["p48gate-user-b"]`, `meta.total` **1** | reversed |
| `GET /activities?limit=100` as A | (same defect) | **1 row**, own only, `contains_B_activity: false` | correct |
| `GET /stages/{A}` owner, **no** `?expand` | **403** — *this was SEC-02* | **200**, and the body's keys are `[id, pipeline_id, name, description, color, type, position, created_at, updated_at]` — **`has_pipeline_key: false`** | reversed |
| `GET /stages/{A}?expand=pipeline` owner | 200 + expanded pipeline | **200**, `pipeline.owner_id: p48gate-user-a` | guard, unchanged |
| `GET /stages/{A}` non-owner, no expand | 403 (for the wrong reason) | **403** | guard, unchanged |
| `GET /stages/{A}?expand=pipeline` non-owner | 403 | **403** | guard, unchanged |
| `GET /stages?limit=5&offset=74` | **500**, `42601 syntax error at or near ")"` | **200**, `{"data":[],"meta":{"total":1,"offset":74,"limit":5}}` | reversed |
| `GET /stages?limit=5&offset=999999` | **500**, same | **200**, `data: []` | reversed |
| `GET /stages?limit=5` as the stage's owner (F3) | `data: []` beside `meta.total: 1` | **`["p48gate-stage-a"]`**, `data_length: 1`, `meta.total: 1` | reversed |

**The boundary offset was read from the database, not written down.** `select count(*)::int from
stages` returned **74** at probe time (73 live rows plus the fixture stage), so `offset=74` is the
first empty page and therefore the exact class of request that emitted `"pipelines"."id" IN ()`.
Research recorded that threshold moving as a fixture came and went; hard-coding 73 would have been a
test that decays.

**The bare stage GET's body is the SC-4c assertion, observed over HTTP.** The relation is now always
loaded for the ownership check, so the `expand.has("pipeline") &&` projection guard is the only thing
keeping the pipeline object out of a bare response. It is doing its job: nine keys, none of them
`pipeline`.

### The container log for the probe window, and why the absence is not vacuous

```
log lines in probe window : 86
occurrences of 42601      : 0
occurrences of syntax error: 0
occurrences of Failed query: 0
occurrences of IN ()       : 0
error-ish lines            : 0
```

An absence assertion over a log is worth nothing without two things, and both were done:

- **A floor.** The window must actually contain the probe's traffic, or "no `42601`" is satisfied by
  an empty file. It contains **20** `Rate limiting skipped: Redis not configured` lines — `withApiAuth`
  emits one per authenticated `/api/v1` request, so the window demonstrably spans the probe. (Stated
  honestly: the app emits no access-log line, so a *path*-based floor reads 0 for `/api/v1/stages`;
  the rate-limit line is the available floor and is the one used.)
- **A positive-fixture self-test.** The same matcher was pointed at `48-RESEARCH.md`, which does
  contain the defect, and reported **8** hits. A matcher returning 0 on the window and 0 on the
  fixture would have been indistinguishable from a broken matcher.

### The live database is unchanged

| Table | Pre-probe | Post-cleanup |
|---|---|---|
| `activities` | 79 022 | **79 022** |
| `stages` | 73 | **73** |
| `pipelines` | 12 | **12** |
| `users` | 10 | **10** |
| `api_keys` | 8 | **8** |
| `audit_log` | 214 | **214** |

Deleted in foreign-key order: **2** `audit_log`, **2** `activities`, **1** `stages`, **1** `pipelines`,
**2** `api_keys`, **2** `users`. Prefixed leftovers afterwards: `users 0 / api_keys 0 / audit_log 0 /
pipelines 0 / stages 0`, and **0** activities owned by either probe user. No `TRUNCATE`, no `DROP`, no
unfiltered `DELETE`, no `drizzle-kit push`, and no pre-existing row read for mutation. The leftover
matcher was floored too: the same `LIKE` form matched **10** rows when pointed at a pattern that must
match, so `0` is a measurement rather than a broken query.

**A small finding worth keeping.** Research's cleanup removed **5** `audit_log` rows from 6 requests;
this probe removed **2** from about 22. The refusals write nothing — the audit-side shadow of the same
fix, and a reminder that an audit trail of a blocked attack is a thing this API does not currently
keep.

---

## 3. The negative-control register — 26 judged, 26 DELIVERED, 0 NOT DELIVERED

The full register with every citation is in `48-VALIDATION.md` § *The negative-control register*.
Condensed verdict table, one row per control:

| Control | Gate | Observed red | Verdict |
|---|---|---|---|
| **A** | Q10 gate | 1 offender, then 3, named by file:line:verb; base suite `1 failed \| 5338 passed` | **DELIVERED** |
| **A′** | Q10 vs *this phase's own* fix | `activities/[id]/route.ts:76: GET does not constrain…` | **DELIVERED** |
| **A″** | rule R5 | both polarities: `58 passed` guard-intact, `1 failed \| 57 passed` guard-removed | **DELIVERED** |
| **B1** | Q10 token floor | `` `ctx.userId` fell to 0 occurrences … (measured 22)``, `10 failed \| 48 passed` | **DELIVERED** |
| **B2** | Q10 token floor | `context.userId` floor red, offenders 0 → **50**, authorized floor **0**, 19 red | **DELIVERED** |
| **C** | binding-form walker | `__control_c__/route.ts:10: GET …`, and 36→**37** files / 8→**9** binding handlers read live | **DELIVERED** |
| **D1** | `activities/[id]` GET guard | `expected 200 to be 403`, `1 failed \| 11 passed` | **DELIVERED** |
| **D2** | PUT guard | `expected 200 to be 403`, `1 failed \| 11 passed`; SC-2 stayed green | **DELIVERED** |
| **D3** | DELETE guard | `expected 204 to be 403` — the 204 is the soft delete happening | **DELIVERED** |
| **D4** | `owner_id` rejection | `expected 200 to be 422`, comment deliberately left in place | **DELIVERED** |
| **E1** | SC-3, single-owner dataset | `3 failed \| 20 passed`, **and the CEILING PASSED** | **DELIVERED** |
| **E2** | SC-3, empty dataset | `6 failed \| 17 passed`, the FLOOR's named message verbatim; 21/23 green without floors | **DELIVERED** |
| **F** | SC-5, the **shipped** raw `IN` restored | `7 failed \| 18 passed`; `42601`, `position:'70'`, `scan.l`, `scanner_yyerror`, statement text identical to research char-for-char | **DELIVERED** |
| **G1** | `in-clause` gate | `6 failed \| 4 passed`; `pipelines.findMany` called **1** time; one builder, not two | **DELIVERED** |
| **G2** | `in-clause` gate | `2 failed \| 8 passed`, with the verbatim SQL diff | **DELIVERED** |
| **S1** | SC-4 cells | `3 failed \| 10 passed`; **both non-owner cells green** | **DELIVERED** |
| **S2** | leak guard | `1 failed \| 12 passed`, `to not include 'pipeline'` | **DELIVERED** |
| 48-02-a1 | list scope, structural | `3 failed \| 6 passed`; `to contain 'owner_id'`; `expected 1 to be 2` | **DELIVERED** |
| 48-02-a2 | POST guard, structural | `2 failed \| 7 passed`; `expected 201 to be 422` | **DELIVERED** |
| 48-06-D | list scope, **behavioural** | `9 failed \| 14 passed`; ceiling `expected 10 to be 7`; cross-checks returned the **union** of both owners' ids | **DELIVERED** |
| 48-07-RP1 | empty-page assertion | `expected [ …(4) ] to deeply equal []` | **DELIVERED** |
| 48-07-RP2 | the SC-5 FLOOR | `6 failed \| 10 passed`, **while THE PROOF still PASSED** | **DELIVERED** |
| 48-09-C1 | OpenAPI, inverted polarity | `1 failed \| 36 passed` | **DELIVERED** |
| 48-09-C2 | OpenAPI parse floors | `26 failed \| 11 passed`, **subject reach red too** | **DELIVERED** |
| 48-09-C3 | plan 48-09's **own** script | fired on **3 of 4** — found a dead needle | **DELIVERED** |
| 48-09-C4 | no-checkbox-changed | `checkboxes HEAD=19 now=19` | **DELIVERED** |

**Not one row reads NOT DELIVERED, and that is a finding rather than a formality.** Phase 47 shipped a
control marked *DELIVERED LOCALLY and NOT DELIVERED on the real runner* and was stronger for saying so;
the standard was applied here in the same spirit and the evidence simply held. Every DELIVERED row
above cites an assertion diff, an exit code, or a named error message — none rests on a SUMMARY saying
a control was performed.

**Three controls deserve their reasons recorded, because their *passing* halves are the point:**

- **E1** shows the CEILING — the original, unamended SC-3 — **passing on a single-owner dataset**. That
  is the live `pipelite` distribution's shape, demonstrated inside the repo rather than argued from row
  counts.
- **E2** shows the ceiling, both cross-checks, page-and-total and the narrowing filter **all passing on
  an empty database**. Without the floors, that file would be 21 of 23 green against nothing at all.
- **RP2** shows `THE PROOF` **passing** while the FLOOR reddens. On an empty stages table, `offset: 0`
  is already past the end, so the SC-5 proof is vacuously green and only the floor stands between the
  file and a gate that cannot fail.

## 4. Four fresh falsifications at sign-off

The plan asked for three. A fourth was added because the fourth vacuity test — *does a rename of the
token it searches for make it go red?* — had never been asked of the OpenAPI gate.

Each ran on a tree verified clean by `git diff --exit-code`, each ablation script **refused to proceed
unless its target text was found the expected number of times**, and each file was restored the same
way.

### FF-1 — control A, re-run (the exact SEC-48-B ablation)

```
FF-1 ABLATED: all three eq(organizations.ownerId, context.userId) predicates deleted
AssertionError: an /api/v1 handler reads or writes an owned record without constraining it by the
CALLER's identity. That is OWASP API1:2023 BOLA — Broken Object Level Authorization: …
  src/app/api/v1/organizations/[id]/route.ts:129: DELETE does not constrain the record by caller identity
  src/app/api/v1/organizations/[id]/route.ts:25: GET does not constrain the record by caller identity
  src/app/api/v1/organizations/[id]/route.ts:62: PUT does not constrain the record by caller identity: expected [ …(3) ] to deeply equal []
 Test Files  1 failed (1)
      Tests  1 failed | 57 passed (58)
exit code: 1
FF-1 restored; git diff --exit-code = 0
```

### FF-2 — control B1, re-run (`IDENTITY_OBJECTS` narrowed to `["context"]`)

```
      Tests  10 failed | 48 passed (58)
AssertionError: `ctx.userId` fell to 0 occurrences in src/app/api/v1 (measured 22). Both spellings
are in live use; a detector matching only one under-detects by 26% and reports offenders that are
correctly authorized.: expected 0 to be greater than or equal to 15
AssertionError: `verifyStageOwnership` is in AUTHORIZERS but no /api/v1 route calls it with
ctx.userId or context.userId. …: expected 0 to be greater than or equal to 1
AssertionError: `ownedStagesPredicate` is in AUTHORIZERS but no /api/v1 route calls it with … : expected 0 to be greater than or equal to 1
AssertionError: R3 fired 10 times across the corpus, measured 15 (3+2+1+3+4+2). …: expected 10 to be greater than or equal to 12
exit code: 1
FF-2 restored; git diff --exit-code = 0
```

The **same ten** reds 48-08 recorded — four KNOWN_NEGATIVE fixtures, the rule-discrimination probe,
the token floor, three AUTHORIZERS controls and the offender assertion. The WR-11 question is answered
with a RED, not a green-because-it-broke.

### FF-3 — the SC-4a ablation, re-run

```
 × SC-4a — owner, NO ?expand → 200 [THE DEFECT PROOF, red before the fix] > returns 200 to the stage's legitimate owner without ?expand=pipeline
   → expected 403 to be 200 // Object.is equality
 × SC-4a — … > reads ownership through an UNCONDITIONAL relation load: a bare GET's findFirst carries with.pipeline === true
   → expected undefined to be true // Object.is equality
 × SC-4c — owner, NO ?expand → body has no `pipeline` key [guards the fix's own leak]
   → expected 403 to be 200 // Object.is equality
 ✓ SC-4b — non-owner, NO ?expand → 403 [REGRESSION GUARD — 403 today for the WRONG reason, NOT evidence] …
 ✓ SC-4b' — non-owner, ?expand=pipeline → 403 [REGRESSION GUARD, green before AND after] …
 Test Files  1 failed (1)
      Tests  3 failed | 10 passed (13)
FF-3 restored; git diff --exit-code = 0 ; Tests 13 passed (13)
```

**This is the load-bearing row for SC-4.** The defect proof reddened while **both** non-owner cells
stayed green — measured again, at sign-off, on the merged tree. That is why the SC-4 verdict below
cites `owner + no expand → 200` and nothing else.

### FF-4 — new: the rename question, put to the OpenAPI gate

The `Forbidden` response component was renamed to `AccessRefused` **consistently** — the declaration
and all six `$ref`s moved together, so the document stayed internally valid. A gate that merely
counted `'403'` keys would have stayed green.

```
baseline: 6 $refs to Forbidden, 1 component declaration(s) named Forbidden
  post-ablation $refs to Forbidden: 0
  post-ablation $refs to AccessRefused: 6
      Tests  7 failed | 30 passed (37)
AssertionError: expected [ 'Unauthorized', …(4) ] to include 'Forbidden'
AssertionError: GET /activities/{id}'s '403' must $ref #/components/responses/Forbidden; a dangling
or inline-empty ref is documentation that says nothing: expected '#/components/responses/AccessRefused'
to be '#/components/responses/Forbidden' // Object.is equality
… five more, one per remaining subject
FF-4 restored; git diff --exit-code = 0 ; Tests 37 passed (37)
```

**RED.** The gate pins the *target* of the reference, so a consistent rename cannot slip past it.

---

## 5. The vacuity hunt — no twelfth gate found

**Four tests applied to eight artifacts. Result: no twelfth gate that cannot fail.**

### Reconciling the count with 48-09, explicitly

`48-09-SUMMARY.md` records the **eleventh** vacuous check of this milestone, and it is a real find: the
needle `'guarded non-empty'` in plan 48-09's own Task 3 verification script **matched nothing and never
did** — the sentence in `BACKLOG.md` was ``(guarded by `stageList` being non-empty)``. It was
non-vacuous only through a second disjunct that happened to match, and it sat among three absence
assertions with no presence floor, so deleting all three target documents made the script exit 0.

**That finding is accepted here as the eleventh — not re-counted, not ignored, and not padded into a
different number.** Two qualifications belong with it: it lived in a **plan artifact**, not in
committed code, so nothing vacuous shipped from it; and it was found by 48-09's own control C3, which
is a control that worked. **This hunt therefore searched for a twelfth and reports none found.**

**One arithmetic correction, recorded rather than rounded.** The plan asks for "four tests applied to
seven artifacts" and then enumerates **eight** (`route-authorization.test.ts`,
`openapi-error-coverage.test.ts`, `in-clause.test.ts`, the two `.db.test.ts` files, and the three route
test files). The enumeration is what was audited.

### Test 1 — can it be made to fail by breaking what it protects?

**All eight: yes**, with at least one recorded red apiece — A/A′/A″/B1/B2/C for the Q10 gate (+FF-1,
FF-2 fresh), C1/C2 for the OpenAPI gate (+FF-4 fresh), G1/G2 for `in-clause`, 48-06-D for
`activities-scope.db.test.ts`, F/RP1/RP2 for `stages-scope.db.test.ts`, D1-D4 for `activities/[id]`,
48-02-a1/a2 for `activities/`, and S1/S2 for `stages/[id]` (+FF-3 fresh). **Nothing is unproven.**

### Test 2 — floor as well as ceiling?

Every declared floor was **re-measured against the live tree**, so "below its measurement" is a fact:

| Floor | Declared | Live | Margin |
|---|---|---|---|
| `MIN_ROUTE_FILES` | 30 | **36** | 6 |
| `MIN_HANDLERS_PARSED` | 55 | 62 | 7 |
| `MIN_BINDING_HANDLERS` | 4 | 8 | 4 (at half, deliberately — the failure it guards is a walker reporting **zero**) |
| `MIN_WITH_API_AUTH_CALLS` | 50 | **61** | 11 |
| `MIN_IDENTITY_HITS_CONTEXT` | 40 | **55** | 15 |
| `MIN_IDENTITY_HITS_CTX` | 15 | **29** | 14 |
| `MIN_OWNER_LIKE_ACCESSES` | 90 | 130 | 40 |
| `MIN_AUTHORIZED_HANDLERS` | 30 | ~50 | 20 |
| `MIN_PATH_ITEMS` | 20 | **27** | 7 |
| `MIN_OPERATIONS` | 45 | **59** | 14 |

`in-clause.test.ts` carries 5 negative assertions each preceded by a positive floor on the same
string, plus a `toHaveLength(2)` builder-count floor asserted three times before any render
comparison — and **zero** `readFileSync`, so it is not a source-text gate that could pass on an empty
file. The OpenAPI gate carries two parse floors **and** a `.length` floor on each of its three subject
arrays, because an `it.each` over an emptied array generates zero tests and reports success. The two
db files carry 2 and 7 `toBeGreaterThan(0)` floors; E2 and RP2 are the transcripts where the floor is
the only thing red.

The three route test files carry no corpus floor and **need none**: their anti-vacuity mechanism is the
**owner-positive anchor** paired with every refusal — `activities/[id]` 4×403 against 4×200 + 1×204 +
1×422, `stages/[id]` 3×403 against 3×200. A route that 403s everybody fails all three files.

**One floor is named as brittle rather than quietly softened.** `MIN_EXEMPT_MATCHED = 11` is pinned in
**both** directions — exactly 11, not "at least 11" — unlike every other number in that file. The
justification is sound (a shrinking list means an exemption stopped matching; a growing one means an
exemption swallowed a handler nobody reviewed) but it false-REDs on a legitimate route consolidation.
That is a **false-RED risk, not vacuity** — the same shape as Phase 47's
`MIN_NON_TEST_PERFORMANCE_NOW = 2`, and reported the same way rather than relaxed.

### Test 3 — self-collision, and exactly one named mitigation?

`route-authorization.test.ts` is the only artifact that sweeps a directory and could include itself.
Exactly **one** mitigation: `entry.name === "route.ts"`, asserted rather than assumed, with the
exemption lists additionally checked not to name `GATE_PATH` — the same mitigation from the other side,
as 48-08 correctly labels it. The OpenAPI gate reads exactly **one** file by name and walks no
directory, so self-collision does not apply and **no mitigation exists, which is the right answer**;
its one adjacent hazard (its own prose quotes `guarded non-empty`) is handled by scoping 48-09's
strengthened check to three documents **by explicit filename**. The remaining six read no source and
walk no directory (`readFileSync`/`readdirSync` measured **0**). **No artifact carries two
mitigations.**

### Test 4 — does a rename go red?

Q10: **yes**, both spellings, both directions (B1, B2, FF-2). OpenAPI: **yes** — FF-4, established for
the first time. `in-clause.test.ts` asserts on **compiled SQL** from `PgDialect().sqlToQuery`, not on
source tokens, so the question resolves into G2's semantic diff. The two db files and the three route
files assert on HTTP statuses, response bodies and direct SQL counts — no searched-for token exists, so
the question is inapplicable by construction, which is the strongest available answer.

### The Q10 matcher, EXTRACTED and RUN — not read

The ninth vacuous gate of this milestone was found by extracting a shipped matcher and running it. A
temporary probe did the same here: it imported `scanSource` from the gate and pointed it at five
fixtures whose text appears **nowhere** in `route-authorization.test.ts` (asserted, with a
40 000-character floor on the gate file so `includes` returning false is not because it is empty).

| Fixture | Shape | Required | Result |
|---|---|---|---|
| V1 | comparison exists but against a **hard-coded string** (`!== "operator-of-record"`) | FLAG | **flagged** |
| V2 | identity compared against a **non-ownership column** (`serialNumber !== ctx.userId`) | FLAG | **flagged** |
| V3 | fetch-then-compare, novel names, `context` spelling | must NOT flag | **not flagged** |
| V4 | `where`-scoped to a **caller-supplied** owner (`searchParams.get("as_owner")`) | FLAG | **flagged** |
| V5 | delegation to a known authorizer, novel handler shape | must NOT flag | **not flagged** |

**Every fixture cleared a parse floor first** (`handlers.length > 0`), so the two "must not flag"
verdicts are not satisfied by a matcher that parsed nothing — which is exactly what 48-05's stub
transcript exhibited when all seven `toEqual([])` negatives passed against a detector that detected
nothing. `Tests 69 passed (69)`. The probe file was deleted; `git diff --exit-code` = 0 and no
untracked file remains.

**V4 is the load-bearing new result.** It is the shape closest to a plausible future regression — a
`where` clause that *looks* scoped but is scoped to whatever the query string says — and the matcher
rejects it.

### Two limitations this phase ships on purpose

1. **The Q10 gate is a presence gate.** It proves a check **exists**; it cannot tell "authorizes
   correctly" from "authorizes". Its own header names the measured counter-example:
   `stages/[id]/route.ts` GET satisfied rule R2 and was reported as authorizing **while it WAS the
   SEC-02 defect** — the comparison was real and the value it compared was decided by the caller. R5
   inherits the limitation: a guard whose branch fell through would satisfy it. Behavioural tests own
   that property. **A green run of this gate must never be read as covering SEC-02.**
2. **The OpenAPI gate covers only the nine operations this phase changed.** 50 of 59 remain ungated,
   with the drift measured in `BACKLOG.md` § DOC-48-01: `401` declared on **22 of 59** against all 59
   that can return it, `429` on **12 of 59**, `403` on **8 of 59** against at least 12 — and **36 route
   files against 27 documented path items**, which is the larger defect.

---

## 6. Criterion verdicts

### SC-1 — an API key belonging to A cannot read, modify or delete B's activity — **PROVED**

**Carried by:** three separate `it`s in three separate top-level `describe` blocks in
`activities/[id]/__tests__/route.test.ts`, each with a genuinely foreign-owned fixture whose `ownerId`
is a user that never authenticates, each paired with an owner-positive anchor, **and no shared
"assert 403 for verb X" helper anywhere in the file** — plus Task 1's HTTP re-check, where all three
verbs answered 403 against the rebuilt image.

**The three were asserted separately, and control D proves that mattered.** D1, D2 and D3 each
reddened **exactly one** test and left eleven green. A single shared helper would have gone red on all
three alike and proved nothing about *which* verb is protected — which is precisely how
`organizations/[id]/__tests__/route.test.ts` survived a three-site ablation of its own subject.

### SC-2 — `PUT` cannot move an activity to another owner — **PROVED**

**Carried by:** the assertion on the **response body** — `errors: [{field: "owner_id", code:
"forbidden", …}]`, not merely the absence of a write — with `db.update` asserted uncalled; the
self-assignment counterpart (`{owner_id: "user-1"}` → 200, `db.update` called once) proving the
rejection is targeted rather than blanket; the persisted-owner check (`Object.keys(updatedValues)`
does not contain `ownerId`); and control D4, which reddens that test **alone** with the explanatory
comment deliberately left in place, so the ablation removes behaviour rather than prose. Task 1
confirmed both vectors over HTTP at **422**, with a follow-up GET showing the owner unchanged and the
victim's count unchanged.

### SC-3 as amended — **PROVED**, and the live-dataset half is a smoke check, not a proof

**Carried by:** the four seeded components in `activities-scope.db.test.ts` — **ceiling**
(`meta.total` equals a direct SQL count scoped to A, `A_OWNED = 7`), **floor** (that number `> 0`,
asserted separately with its own message), **discriminator** (7 ≠ the seeded global 10; and B's 3 ≠ 10),
and **cross-check in both directions** (A's response is exactly A's id set and holds none of B's,
*while direct SQL confirms B's rows exist* — and the same with the users exchanged) — driven by two
real API keys through the **unmocked** `withApiAuth` against real PostgreSQL, with the 401 cases
proving the authentication is real rather than permissive.

**Stated explicitly, because the original criterion was vacuous by construction:** `select owner_id,
count(*) from activities group by 1` on the live database returns **one row**. All **79 022**
activities belong to a single admin user, so a correctly scoped query and a completely unscoped query
return the same number, and the original criterion — a live-dataset count equality — **was satisfied
today, by the broken route**. Control **E1** demonstrates exactly that: on a single-owner dataset the
**CEILING PASSES**. Task 1's live HTTP measurement (A sees 1 own row, B sees 1 own row) is therefore a
**smoke check that the fix is deployed**, not evidence that the criterion holds. The proof is the
seeded fixture, and its RED-first evidence is 48-06's ablation (`9 failed | 14 passed`, ceiling
`expected 10 to be 7`, both cross-checks returning the union of both owners' ids).

### SC-4 — **PROVED**, on `owner + no expand → 200` alone

**Carried by:** two assertions and nothing else — the status (`403 → 200` for the legitimate owner
without `?expand`) and the structural one (a bare GET's `findFirst` carries `with.pipeline === true`,
i.e. the authorization read is no longer caller-controlled) — plus Task 1's HTTP re-check at 200.

**The other three cells are regression guards and were measured green *before* the fix.** Research
measured cell (c) at 403 today **for the wrong reason**: the relation is never loaded, so
`!stage.pipeline` short-circuits before `ownerId` is compared. Ablation **S1**, re-run fresh as
**FF-3**, is the measurement that settles it: reinstating the defect reddened the SC-4a pair **while
`SC-4b` and `SC-4b′` both stayed green**. Those two cells are therefore incapable of detecting SEC-02
and are **never presented as evidence** — they are retained solely so that deleting the check later
turns them red. SC-4c (the bare body has no `pipeline` key) guards a risk the **fix itself** created
and has its own ablation, **S2**, which reddens it alone.

### SC-5 as amended — **PROVED**

**Carried by:** the behavioural transition in `stages-scope.db.test.ts` — a request at an offset read
from a live `count(*)` moves from *a rejected promise carrying SQLSTATE `42601`* to *a resolved 200
with an empty page* — plus Task 1's HTTP-level confirmation at `offset=74` and `offset=999999`, both
**200 with `data: []`**, where research measured **500**.

**No ablation of a `stageList` guard was performed, because no such guard exists.** The original
criterion named one; `stages/route.ts:69` was `if (!pipelineId)` — the absence of a *filter parameter*,
not the non-emptiness of a list — and `parsePagination` imposes no ceiling on `offset`, so the defect
was reachable from the public API with one query parameter. The negative control needed no invention:
control **F** restored the code that **actually shipped** (`git checkout c291dc8^ -- route.ts`) and
reproduced the defect field-for-field against research's container log — statement text identical
character for character, `code: '42601'`, `position: '70'`, `file: 'scan.l'`,
`routine: 'scanner_yyerror'`. **48-07 owed the HTTP-level assertion and said so; Task 1 has now paid
it.** The two differences between the layers were predicted in advance: `withApiAuth` has no
try/catch, so a direct invocation rejects while Next.js maps it to a 500 in the container.

### SEC-48-B and QG-03's own wording — **CLOSED**

**Does deleting an authorization predicate now fail a build? Yes.** SEC-48-B measured the ablation
that leaves nothing red: delete all three `eq(organizations.ownerId, context.userId)` predicates, run
the full base suite, get **172 files / 5237 tests passed, nothing red** — with a test literally named
*"returns 404 … when the organization is not the caller's"* failing to notice its own subject being
removed.

**The number from `48-08-SUMMARY.md`: 0 → 1.**

```
     × finds no unauthorized handler outside the documented exemptions 13ms
 Test Files  1 failed | 176 passed | 2 skipped (179)
      Tests  1 failed | 5338 passed | 32 skipped (5371)
```

Exactly one failing test, and it names the file, the line and the verb. Re-falsified fresh at sign-off
as FF-1. `organizations/[id]`'s own test file **still** does not notice — the original finding
reproduces unchanged; what changed is that something else catches it.

---

## 7. The phase gate, re-measured

| Gate | Result |
|---|---|
| Base project — `./node_modules/.bin/vitest run` | **178 passed \| 2 skipped (180) files; 5376 passed \| 32 skipped (5408)**, 62.49 s |
| RSC project — `vitest run --config vitest.rsc.config.ts` | **2 files, 8 passed (8)** |
| `./node_modules/.bin/tsc --noEmit` | **exit 0**, no output |
| `npm run lint` | **0 errors**, 122 warnings — gated on errors only |
| `npm run test:db` | **98 passed (98)** across `1 failed \| 3 passed (4)` files. **Exit 1 is DEF-48-01**, not a red suite |
| `npm run db:check-migrations` | **exit 0** — `OK: the migration chain builds a complete schema from zero` |
| `npm run security:audit` | **exit 0** — 47 advisories across 14 packages, 39 at crit/high, all with an unexpired reasoned disposition; 1285 dependencies audited |
| `/api/health` | **200**, `db.ok: true`, **10/10** processors `alive` |
| Container image | **`eba9cfa1c4be`** (was `8f07a18eddad`) |
| `git diff --exit-code` | **exit 0**; `git ls-files --others --exclude-standard` empty |

**Why `test:db`'s exit code is not the gate.** `queries.db.test.ts`'s `afterAll` issues an `id`-keyed
leftover query against `saved_view_defaults`, which has no `id` column, and throws `42703` *after* all
28 of its own assertions pass. Reproduced verbatim again in this run. That is **DEF-48-01**, proven
pre-existing (last commit `f097b5b`, Phase 40) and out of this phase's scope. The db baseline is
therefore **98 passed across 4 files**: 73 from 48-06's measurement plus 48-07's 25.

### The suite delta, reconciled plan by plan

**Phase 48's own contribution closes exactly.** Against the baseline 48-01 **re-measured** at Phase
48's first commit `ae514ed` — 172 files, **5237 passed / 32 skipped** — and not against the number
STATE.md carried:

| Plan | Base tests | Base files | Running total |
|---|---|---|---|
| baseline at `ae514ed` | — | 172 | 5237 |
| 48-01 | +12 | +1 | 5249 |
| 48-02 | +9 | +1 | 5258 |
| 48-03 | +13 | +1 | 5271 |
| 48-04 | +10 | +1 | 5281 |
| 48-05 | +30 | +1 | 5311 |
| 48-06 | **+0** (its files are `*.db.test.ts` plus a fixture module — not collected by the base project) | +0 | 5311 |
| 48-08 | +28 (modified an existing file, 30 → 58 tests) | +0 | 5339 |
| 48-07 | **+0** (db project; +25 there) | +0 | 5339 |
| 48-09 | +37 | +1 | **5376** |
| **measured now** | | **178** | **5376** |

12 + 9 + 13 + 10 + 30 + 0 + 28 + 0 + 37 = **139**, and 5237 + 139 = **5376**. Files: 172 + 5 = 177,
+1 = **178**. Skipped **32** throughout, unchanged. **The arithmetic closes to the unit.**

### The part that does NOT close, stated rather than rounded

STATE.md carried **5164** (47-13's sign-off number) while the tree was at **5237** — a **+73** gap that
predates Phase 48 entirely. Its provenance is verifiable: between `4fc29d2 docs(47-13): sign phase 47
off` and `ae514ed chore(48): begin phase execution` there are **sixteen** Phase 47 review-fix commits
(`WR-01` … `WR-12`, `CR-01`, `CR-02`, `IN-01` … `IN-03`) plus `97b878c fix(47-14): hoist 106
test-scope dynamic imports`. Counting `it()`/`test()` declarations across the five test files those
commits touched accounts for **+11** of the 73 (`audit-policy.test.ts` +7,
`suite-timing-hygiene.test.ts` +2, `condition-evaluator.test.ts` +1, `log.test.ts` +1); the balance is
generated at runtime by `it.each` over the allowlist and corpus arrays in those same files, which is
consistent but **was not closed to the unit**. It is not Phase 48's delta to attribute, and it is
recorded here rather than absorbed — **which is exactly why 48-01 re-measured instead of inheriting,
and why STATE.md now carries 5376 in bold.**

---

## Deviations from Plan

### 1. [Rule 2 — missing critical] A fourth fresh falsification was added

- **Found during:** Task 2, applying vacuity test 4 to each artifact.
- **Issue:** the plan named three controls to re-falsify (A, B1, SC-4a). Working through test 4 — *does
  a rename make it go red?* — showed that **no control had ever asked it of the OpenAPI gate**. 48-09's
  four controls were over-declaration, truncation, and two read-only script probes. A gate that merely
  counted `'403'` keys would have been indistinguishable from one that pins the reference target.
- **Fix:** FF-4. The `Forbidden` component renamed to `AccessRefused` consistently across the
  declaration and all six `$ref`s. **RED at `7 failed | 30 passed`.**
- **Committed in:** `1bb0fdb`

### 2. [Rule 2 — missing critical] The log-absence assertion was given a floor and a self-test

- **Found during:** Task 1.
- **Issue:** the plan asks for "the container log for the window contains no `42601`". As written that
  is an absence assertion with no floor — satisfied by an empty log, a wrong time window, or a broken
  matcher. That is the exact defect class 48-09 corrected in its own plan's Task 3 script.
- **Fix:** two additions. A **floor** — the window must carry the probe's authenticated traffic, and it
  carries 20 `Rate limiting skipped` lines, one per request. And a **positive-fixture self-test** — the
  same matcher run over `48-RESEARCH.md` reports 8 hits. Both recorded.
- **Committed in:** `ccd4a5e`

### 3. [Rule 2 — missing critical] The leftover-count assertion was floored the same way

- **Found during:** Task 1 cleanup.
- **Issue:** `count(*) where id like 'p48gate-%'` returning 0 is equally consistent with a clean
  database and a mistyped pattern.
- **Fix:** the same `LIKE` form was pointed at a pattern that must match and returned **10**. Recorded
  beside the zeros.
- **Committed in:** `ccd4a5e`

### 4. [Recorded, no fix] `nyquist_compliant` was set in Task 1's commit; the register that justifies it landed in Task 2's

The plan's Task 1 action asks for the field to be set "according to what was actually observed". At
that point the observations supporting it existed (the rebuild, the thirteen transcripts, and the nine
prior SUMMARYs read in full) but the register had not been written. It was set in Task 1's commit as
instructed and the register followed in Task 2 without changing it. Had a fresh falsification failed,
the field would have been flipped back — none did.

### 5. [Recorded, no fix] `REQUIREMENTS.md` checkboxes were deliberately NOT ticked

`REQUIREMENTS.md` is **not** in this plan's `files_modified`, and 48-09 recorded a locked decision that
`/gsd:verify-phase 48` owns the status transitions — measured and asserted, with 19 checkboxes and 19
traceability rows byte-identical. Ticking them here would contradict that and touch a file outside the
plan's declared surface. The `requirements` frontmatter above records SEC-01, SEC-02 and QG-03 for the
orchestrator; the checkbox transitions belong to verification.

### 6. [Recorded, no fix] `roadmap.update-plan-progress` reports 9/10 until this file exists

The SDK verb counts SUMMARY files on disk, so it rewrote the plan line to `9/10 plans executed` while
`48-10-SUMMARY.md` was still unwritten. Re-run after this commit. Noted so the intermediate state in
`5928c66` is not read as a miscount. The SDK also double-prefixed each recorded decision as
`- [Phase ?]: [Phase 48]: …`; the seven affected lines were repaired in place and the count verified
at 0 afterwards.

### 7. [Recorded, no fix] The plan says seven artifacts and lists eight

Reported in §5 rather than rounded. The enumeration was audited.

**Total deviations:** 3 auto-fixed (all Rule 2, all anti-vacuity) + 4 recorded. **No `src/` file was
modified by this plan** — every ablation was applied and restored, with `git diff --exit-code -- src/`
exiting 0 after all four fresh falsifications and the matcher probe.

## Issues Encountered

- **`rtk` mangling, as recorded and as expected.** `grep -n "Phase 48"` rendered as `2 matches in 2F`
  with useless line data; `git status --porcelain` renders as the token `ok`; every count in this
  document was taken with `node -e` and cleanliness with `git diff --exit-code`. Two SUMMARY reads
  through `cat` were elided as "output too large" and had to be re-read with the file reader.
- **DEF-48-01 behaved exactly as documented.** `npm run test:db` exited 1 on `98 passed (98)`. Gated on
  the counts, never the exit code.
- **`scripts/dedup-db-test-setup.sh` drops and rebuilds every schema in `pipelite_dedup_test`.** Safe
  here because this plan ran alone on the main tree. **Recorded in STATE.md as a wave-scheduling hazard
  for Phases 49-54: any future wave scheduling two db-test plans in parallel will corrupt both.**
- **No worktree, and therefore no stale base.** This plan ran on the main tree by design, because it
  writes STATE.md and ROADMAP.md (which worktree mode auto-suppresses) and because a worktree would
  derive a different compose project name and start a **second** stack fighting for ports 3001/5433.

## Threat Model — dispositions delivered

| Threat ID | Mitigation as shipped |
|---|---|
| T-48-10-01 (measurements against a stale image) | `up -d --build` followed by an id comparison: `8f07a18eddad` → `eba9cfa1c4be`, with the container's bound `.Image` confirmed to have followed. A match would have forced a re-run |
| T-48-10-02 (the probe key surviving the phase) | 2 `api_keys` rows deleted in FK order; `api_keys` back at 8; prefixed leftovers 0, with the matcher floored at 10 on a pattern that must match |
| T-48-10-03 (the probe mutating real data) | only prefixed rows created; all six table totals re-asserted identical (`79022 / 73 / 12 / 10 / 8 / 214`); no `TRUNCATE`, no `DROP`, no unfiltered `DELETE`, no `drizzle-kit push` |
| T-48-10-04 (a control claimed but not quoted) | 26 register rows, each citing an assertion diff / exit code / named error; **four re-falsified fresh**, three of them the plan's choices and one new |
| T-48-10-05 (a criterion signed off on a regression guard) | SC-4's verdict cites `owner + no expand → 200` alone and names the other three as guards measured green **before** the fix (FF-3 is the measurement); SC-3's separates the seeded proof from the live smoke check, with E1 showing the ceiling alone passing |
| T-48-10-06 (a credential in a committed transcript) | the plaintext keys existed only in `/tmp`, were deleted, and appear nowhere in `48-VALIDATION.md`, this SUMMARY, or any log excerpt — only row ids and the 12-char prefixes were recorded |
| T-48-10-07 (an eleventh gate that cannot fail, inside the phase built to delete them) | four vacuity tests over eight artifacts; the Q10 matcher **extracted and RUN** on five novel fixtures over parse floors; 48-09's eleventh accepted rather than double-counted; **no twelfth found**, and one floor named brittle rather than softened |

## Threat Flags

None. This plan added no network endpoint, no auth path, no file-access pattern and no schema change.
It created two temporary users and two temporary API keys in the live database for the duration of one
probe and removed them, with their absence asserted by count in six tables.

## Known Stubs

None.

## Deferred Issues

Carried out of the phase, all recorded in STATE.md with owners: **SEC-48-A** (two unscoped
`workflows/[id]/runs` reads — deferred but *enforced*, since `ACCEPTED_KNOWN_ROUTES` asserts the
detector still flags both at inverted polarity, so a fix goes red and forces the list to shrink),
**DEF-48-01**, **DEF-48-02** (a soft-deleted or `rejected` user's API key still authenticates),
**DOC-48-01** (50 of 59 spec operations ungated), the **403-vs-404 existence leak** on `/api/v1`
(accepted, since SC-4 mandates 403), the **`updateActivityOwnerMutation` bypass** on the route's PUT
(now only reachable as a self-assignment, so a mutation-layer consistency item rather than a hole), and
the **db-test wave-scheduling hazard** for Phases 49-54.

Also unchanged from Phase 47: `origin/master` is still `a58b9e1` with the Phase 46, 47 **and 48**
commits unpushed, so `Migration chain check`, `Security audit policy` and
`Registry signature verification` have still never run on GitHub. **Phase 46 GAP 1 and D-47-12-A are
both still open, and one operator push closes both — and SEC-05 with them.**

## Next Phase Readiness

- **`/gsd:verify-phase 48` is next**, and this document plus `48-VALIDATION.md` are the evidence it
  checks. `REQUIREMENTS.md`'s SEC-01 / SEC-02 / QG-03 checkboxes are deliberately untouched and are
  verification's to tick.
- **The new baselines are 5376 / 32 over 178 files (base), 8/8 (RSC) and 98 over 4 files (db).** Do not
  inherit an older number; this milestone has now paid for that twice.
- **Two reusable patterns leave this phase.** The two-owner / two-real-key /
  floor-ceiling-discriminator-crosscheck harness is now a pattern rather than one file
  (`activities-scope.db.test.ts` and `stages-scope.db.test.ts`), and Phase 50's export-authorization
  work can copy either rather than inventing a third. And `mintApiKey` is exported from
  `src/app/api/v1/__tests__/api-key-fixture.ts` precisely so it can be.
- **One habit worth carrying:** the two most useful controls in this phase — 48-09's C3 and 48-07's
  RP2 — were gates broken on purpose that found defects in their **own plans**. Neither was in the
  plan's list of owed controls.

## Self-Check: PASSED

Files, re-verified on disk rather than asserted from memory:

- FOUND `.planning/phases/48-rest-api-authorization/48-10-SUMMARY.md`
- FOUND `.planning/phases/48-rest-api-authorization/48-VALIDATION.md` (`nyquist_compliant: true`,
  `status: signed-off`, all five Sign-Off boxes ticked)
- FOUND `.planning/ROADMAP.md` (Phase 48 ticked, all ten plan files listed, no `TBD`)
- FOUND `.planning/STATE.md` (focus = Phase 48 COMPLETE, new baseline recorded, Phase 47 items carried)
- ABSENT `src/app/api/v1/__tests__/p48gate-matcher-probe.test.ts` — the temporary probe, deleted

Commits, each confirmed present in `git log --all`:

- FOUND `ccd4a5e` — `docs(48-10): the exploit and the 500 re-checked over real HTTP against a rebuilt image`
- FOUND `1bb0fdb` — `docs(48-10): the negative-control register and the vacuity hunt`
- FOUND `5928c66` — `docs(48-10): criterion verdicts, the phase gate, and the new suite baseline`
- FOUND `91ef1dd` — `docs(48-10): SUMMARY — the phase signed off by auditing its own evidence`
- FOUND `bb75be0` — `docs(48-10): finalize Phase 48 progress counters`
- FOUND `9bbd8ad` — `docs(48-10): reconcile VALIDATION's own stale claims`

Content assertions, measured rather than asserted:

```
VALIDATION nyquist_compliant: true       : true
VALIDATION unticked boxes                : 0   (8 Wave 0 boxes ticked, each verified on disk first)
VALIDATION stale "❌ W0" markers          : 0   (was 13)
ROADMAP contains all ten 48-NN-PLAN.md   : true
ROADMAP Phase 48 still says TBD          : false
STATE records the 5376 baseline          : true
SUMMARY lines                            : 780  (min_lines 150)
plaintext probe key present in ANY artifact: false
```

Tree: `git diff --exit-code` exit 0, `git ls-files --others --exclude-standard` empty,
`git diff --exit-code -- src/` exit 0.

### The self-check found something, and it is worth reading

`48-VALIDATION.md` — the phase's own validation document — carried **three claims that had gone
false**, and they would have been read as current by whoever picked this up next:

1. Its Requirements → Test Map still marked all **13** rows `❌ W0` ("does not exist yet"). Every one
   of those artifacts exists. Each box and each marker was corrected only after the file behind it was
   confirmed present on disk — the tick script **refused** to tick a box whose artifact was absent, and
   reported `refused: 0`.
2. Its Baseline row still read `5237 passed / 32 skipped` over 172 files. Sign-off measured **5376 /
   32 over 178**, with a separate db baseline of **98 over 4 files**.
3. Its own Sign-Off block said the register held "fifteen named controls plus five unnamed ones" — a
   sentence written before the register was finished, which judges **26**.

Fixed in `9bbd8ad`, along with marking the three "stale artifacts to reconcile" as reconciled with
what actually changed. **This is the same defect class the phase spent nine plans punishing**, found in
the phase's own bookkeeping, by the self-check the plan requires rather than by a reviewer later. It is
recorded here rather than quietly corrected — a validation document that describes a tree from nine
plans ago is a stale claim with a green tick beside it.

---
*Phase: 48-rest-api-authorization*
*Completed: 2026-08-26*
