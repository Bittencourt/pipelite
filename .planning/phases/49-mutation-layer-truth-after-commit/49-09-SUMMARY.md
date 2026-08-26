---
phase: 49-mutation-layer-truth-after-commit
plan: 09
subsystem: phase-sign-off
tags: [sign-off, negative-control-register, vacuity-hunt, docker-rebuild, live-database-probe, DATA-02, SEC-04, DATA-01]

# Dependency graph
requires:
  - phase: 49-mutation-layer-truth-after-commit
    provides: "the eight plan SUMMARYs that are the evidence audited here, plus every artifact they shipped"
provides:
  - "a 41-row negative-control register judged against verbatim tool output: 36 DELIVERED, 5 NOT DELIVERED"
  - "three controls re-falsified FRESH at sign-off, with their transcripts"
  - "a four-test vacuity hunt over 13 gate artifacts / 800 assertions, with test 1 RUN rather than read — NO VACUOUS GATE FOUND"
  - "DATA-02 proven end to end over real HTTP against a REBUILT image, with the bound image id asserted CHANGED"
  - "four criterion verdicts, each citing the defect-proving assertion and never a regression guard"
  - "SEC-49-D / DEF-49-06 — the upload route's missing ownership check and missing containment, found one call-chain hop OUTSIDE the phase's declared file surface"
  - "the phase gate re-measured, with both suite deltas reconciled plan by plan and closing exactly"
affects: [50]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Judge a control by POLARITY, never by token presence — 22 'indefinitely' hits in this phase are all refusals"
    - "Look ONE CALL-CHAIN HOP outside the phase's declared file surface before signing off"
    - "Extract a shipped predicate and RUN it on fixtures no test file contains, rather than reading the gate"
    - "A per-FILE floor is not a per-CELL floor: measure how many cells a deny-everything ablation reddens and name the remainder as brittle"

key-files:
  created:
    - .planning/phases/49-mutation-layer-truth-after-commit/49-09-SUMMARY.md
  modified:
    - .planning/phases/49-mutation-layer-truth-after-commit/49-VALIDATION.md
    - .planning/phases/49-mutation-layer-truth-after-commit/deferred-items.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
    - .planning/BACKLOG.md
    - .planning/REQUIREMENTS.md
  ablated-and-restored:
    - src/lib/api/file-access.ts
    - src/lib/mutations/dedup.ts
    - src/lib/mutations/organizations.ts
    - src/lib/trash/purge-blobs.db.test.ts

key-decisions:
  - "nyquist_compliant stays FALSE. Five properties in this phase carry no red, each named by its owning plan and each structurally unreddenable. Setting it true would upgrade five refusals the plans made on purpose."
  - "The HTTP-level SC-1 probe was NOT attempted, and the reason given is stronger than 'it did not work on the first try': without a real blob on the live deployment's disk the foreign 404 comes from existsSync rather than from the guard — the exact gate-that-cannot-fail 49-06 found in its own plan — and planting one is outside the plan's permitted-write envelope."
  - "SEC-49-D is RECORDED, not fixed. An upload WRITE path is outside SEC-04's wording on any reading, and a sign-off plan that grows a fifth requirement's worth of work is a sign-off nobody can audit."
  - "The register reports NOT DELIVERED for five controls plainly. Each is a structural impossibility rather than an unrun experiment, and each is stated as such rather than counted."

requirements-completed: [SEC-04, DATA-01, DATA-02]

# Metrics
duration: 62min
completed: 2026-08-26
---

# Phase 49 Plan 09: Phase Sign-Off Summary

**Forty-one negative controls judged against verbatim tool output — 36 DELIVERED, 5 NOT DELIVERED,
each of the five named with the structural reason its red is impossible. Three re-falsified fresh
rather than quoted. No vacuous gate found across 13 gate artifacts and 800 assertions, with the four
tests applied and test 1 RUN rather than read. DATA-02 proven end to end over real HTTP against an
image whose id was asserted to have CHANGED. And one finding one call-chain hop OUTSIDE the phase's
declared file surface — which is exactly how Phase 48's sign-off came to report 26 DELIVERED, 0 NOT
DELIVERED while missing five criticals.**

## Performance

- **Duration:** ~62 min
- **Tasks:** 3
- **Files modified:** 6 planning documents. **No production source file was permanently changed** —
  four files were ablated and restored, and `git diff --exit-code` is clean over the whole tree.

---

## THE STANDARD THIS SIGN-OFF WAS HELD TO, AND THE ONE THING IT DID DIFFERENTLY

Phase 48's sign-off declared **"26 controls judged, 26 DELIVERED, 0 NOT DELIVERED"** — and a code
review then found **five criticals it had missed, two of them live cross-tenant reads reachable
through `/api/v1`.** It missed them because it audited only the phase's own declared file surface;
both were one call-chain hop away.

So this sign-off did two things 48-10 did not:

1. **It reports NOT DELIVERED where that is the truth** — five of forty-one, stated plainly.
2. **It looked one call-chain hop out**, deliberately, and found something: **SEC-49-D**. Section
   below.

It also judged the three forbidden claims by **polarity rather than by token presence**. A raw grep
for `indefinitely` matches 13 files in this phase directory; reading all 22 occurrences shows every
one of them is a refusal or a correction. Grepping and stopping there would have reported a violation
that does not exist — which is this project's most-repeated failure mode, arriving inside the audit
built to catch it.

---

# TASK 1 — THE REBUILD, THE HTTP PROOF, AND SC-1'S HONEST LIMIT

## The container was REBUILT, not restarted, and the image id was asserted CHANGED

`docker compose restart` runs the OLD image and the processor "Starting" line is a vacuous freshness
check this project has been burned by. So:

```
$ docker inspect pipelite-app-1 --format '{{.Image}}'          # BEFORE
sha256:83003bf6eb2ea72d27698f690e761a631ca028f7c12bb2b1ffff57a6e4acde98

$ docker compose up -d --build
 Image pipelite-app Built
 Container pipelite-app-1 Recreated
 Container pipelite-app-1 Started

$ docker inspect pipelite-app-1 --format '{{.Image}}'          # AFTER
sha256:66efd8556ac1fff55aa69740ed87ae2fef226fcdfc2d105d2c43d8c399a918ac
```

**`83003bf6eb2e…` → `66efd8556ac1…`.** The pre-rebuild image was built during Phase 48's SEC-48-A fix
and therefore predates every Phase 49 commit. A matching id would have invalidated every measurement
in this task and forced a re-run.

Health, with the processor count **computed** rather than eyeballed:

```
health HTTP=200
{"status":"ok","db":{"ok":true,"latencyMs":1},"processors":{...}}

$ node -e '<count alive vs total>'
status: ok | db.ok: true
processors: 10/10
FLOOR OK: 10/10 alive
```

## The deployment under test is the `local` configuration every proof in this phase assumes

```
$ docker compose exec -T app ls -la /app/uploads
total 8
drwxr-xr-x    2 nextjs   nodejs        4096 Aug 26 02:46 .
drwxr-xr-x    1 root     root          4096 Aug 26 14:21 ..

$ docker compose exec -T app printenv FILE_STORAGE
printenv FILE_STORAGE exit=1          <- UNSET, which means 'local'

$ docker compose exec -T app printenv UPLOAD_DIR
/app/uploads
```

`/app/uploads` is **empty** and `FILE_STORAGE` is **unset**. Asserted rather than assumed, because
under `s3` every local `existsSync` assertion in this phase's proofs would pass for the wrong reason.

## The pre-probe live database, and the premise re-measured a fourth time

```
 orgs  | usrs | keys | cfd_all | cfd_live | formula_live | file_live | audit
-------+------+------+---------+----------+--------------+-----------+-------
 46054 |   10 |    8 |     169 |      169 |            0 |         0 |   214
```

```
      tbl      | storedname | publicurl | rows_total
---------------+------------+-----------+------------
 people        |          0 |         0 |      38348
 organizations |          0 |         0 |      46054
 activities    |          0 |         0 |      79022
 deals         |          0 |         0 |      25195
```

**169 live definitions, 0 formula, 0 file, and 0 stored file descriptors on BOTH probes across
188,619 rows — identical to 49-01's measurement.** That is the positive confirmation that **the live
database was not written to by this phase**: had any plan leaked a definition or a descriptor, these
numbers would have moved.

And the retention figure, in this plan's own record:

```
         key          | value
----------------------+-------
 audit.retention_days | 90
 trash.retention_days | 30
```

## DATA-02 over real HTTP — the 201 and the GET, verbatim

Two temporary users and two temporary API keys were minted with the prefix `p49gate-`, transcribing
`mintApiKey`'s recipe (`pk_live_` prefix, `randomBytes(32).toString("base64url")`, sha256 digest in
`key_hash`, `slice(0,12)` in `key_prefix`). **The plaintext keys were written to a mode-0600 file
outside the repository, and only the row ids and display prefixes are recorded anywhere:**

```
MINTED rows: p49gate-key-a p49gate-key-b
display prefixes: pk_live_5ROk pk_live_iIig
hash lengths: 64 64
plaintexts differ: true
```

Then — as late as possible — **one** `type='formula'` definition on `organization`:

```
DEFINITION CREATED at 2026-08-26T14:25:20Z
p49gate-def-formula | organization | formula | {"expression": "{{Name}} + \"-p49derivado\"", "resultType": "text"}
FORMULA_LIVE_DURING_WINDOW=1
```

The expression reads a **native attribute the create writes**, which is what makes it reach scope
through `scopeFormulasToChangedFields`' native-column matching mode.

### The 201, verbatim

```
POST /api/v1/organizations -> 201
{"data":{"id":"7a9b76f0-4911-43e4-805f-9b5a1c343f3c","name":"p49gate-Organizacao Canonica","website":null,"industry":null,"notes":null,"owner_id":"p49gate-user-a","custom_fields":{"p49gate Origem":"p49gate-request-body","p49gate Rotulo Canonico":{"error":null,"value":"p49gate-Organizacao Canonica-p49derivado","formula":true}},"created_at":"2026-08-26T14:25:21.212Z","updated_at":"2026-08-26T14:25:21.212Z"}}
```

### The GET, verbatim

```
GET /api/v1/organizations/7a9b76f0-4911-43e4-805f-9b5a1c343f3c -> 200
{"data":{"id":"7a9b76f0-4911-43e4-805f-9b5a1c343f3c","name":"p49gate-Organizacao Canonica","website":null,"industry":null,"notes":null,"owner_id":"p49gate-user-a","custom_fields":{"p49gate Origem":"p49gate-request-body","p49gate Rotulo Canonico":{"error":null,"value":"p49gate-Organizacao Canonica-p49derivado","formula":true}},"created_at":"2026-08-26T14:25:21.212Z","updated_at":"2026-08-26T14:25:21.212Z"}}
```

### The stored column, through nothing either handler uses

```
{"p49gate Origem": "p49gate-request-body", "p49gate Rotulo Canonico": {"error": null, "value": "p49gate-Organizacao Canonica-p49derivado", "formula": true}}
```

### And the foreign read

```
FOREIGN GET (key B on A's record) -> 404
{"type":"https://api.pipelite.app/errors/ENTITY_NOT_FOUND","title":"Not Found","status":404,"detail":"Organization not found"}
```

### The comparison, done PROGRAMMATICALLY — nothing here was eyeballed

```
PASS  both bodies carry a custom_fields object
PASS  the 201's custom_fields is NON-EMPTY — keys=2
PASS  both bodies describe the SAME record — id=7a9b76f0-4911-43e4-805f-9b5a1c343f3c
PASS  SC-4: the 201's custom_fields DEEPLY EQUALS the GET's
PASS  the formula key 'p49gate Rotulo Canonico' is present in the 201
PASS  the formula key 'p49gate Rotulo Canonico' is present in the GET
PASS  the 201's derived value equals the expression computed from the SENT name — expected='p49gate-Organizacao Canonica-p49derivado' got='p49gate-Organizacao Canonica-p49derivado'
PASS  the GET's derived value equals the same computation
PASS  the derived value carries no engine error
PASS  DISCRIMINATOR: the 201's custom_fields does NOT equal the object the request sent — sent={"p49gate Origem":"p49gate-request-body"}
PASS  DISCRIMINATOR: the derived key was NOT in the request body
PASS  updated_at === created_at (the recalc bumps no other column)

ALL ASSERTIONS PASSED
EXIT=0
```

**The expected value is computed in the checker from the name the request SENT** (`${SENT_NAME}` +
`"-p49derivado"`), never read out of the engine's output, so no assertion is a tautology.

**The discriminator is what makes the equality mean something.** Without it, a route that echoed the
request body back twice would satisfy "the 201 equals the GET" perfectly. The 201's `custom_fields`
carries a key the request did not send, so a derivation demonstrably happened between the insert and
the response.

### Step 5 — the formula definition removed FIRST, and the window recorded

```
DEFINITION CREATED  2026-08-26T14:25:20Z
DEFINITION DROPPED  2026-08-26T14:25:21Z          <- the probe's own EXIT trap, before any other cleanup

 formula_live | p49_defs | cfd_all | cfd_live
--------------+----------+---------+----------
            0 |        0 |     169 |      169
```

**Exposure window: ~1 second, twice** (the first run's id extraction was wrong — see Deviation 1 —
and the second run is the one quoted above; both windows were ~1 s). `cfd_all` is back at **169, not
170**, which is how a HARD delete is distinguished from a soft one — and a soft delete would have been
inert anyway, since `getActiveFieldDefinitions` filters `deleted_at is null`.

### Step 6 — the rest of the fixture, in foreign-key order, with absence asserted

```
BEGIN
DELETE 2          -- audit_log, by entity_id IN (the probe's orgs) OR actor_user_id
DELETE 2          -- organizations
DELETE 2          -- api_keys
DELETE 2          -- users
DELETE 0          -- custom_field_definitions (already gone in step 5)
COMMIT
```

```
 u_left | k_left | d_left | a_left | o_left | orgs  | usrs | keys | cfd_all | cfd_live | formula_live | file_live | audit
--------+--------+--------+--------+--------+-------+------+------+---------+----------+--------------+-----------+-------
      0 |      0 |      0 |      0 |      0 | 46054 |   10 |    8 |     169 |      169 |            0 |         0 |   214
```

**Zero prefixed rows in all five tables, and every count back at its pre-probe value.** The plaintext
key file was shredded and its absence asserted:

```
$ ls -la /tmp/p49gate-secrets.env /tmp/p49gate-rows.sql
cannot access '/tmp/p49gate-secrets.env': No such file or directory
cannot access '/tmp/p49gate-rows.sql': No such file or directory

$ grep -rl "pk_live_" <every retained probe artifact>
no plaintext key in any retained probe artifact
```

## SC-1's HTTP half is a SMOKE CHECK. It is labelled one, and not dressed up.

```
GET_HTTP=401     {"error":"Unauthorized"}
DELETE_HTTP=401  {"error":"Unauthorized"}
```

**This proves nothing about SC-1: the route answered 401 to an unauthenticated caller before the fix
too.** Recorded as a smoke check.

**The optional session-cookie probe was NOT attempted, and the reason is better than "it failed on
the first try."** Two things stand in the way, and the second is decisive:

1. The route authenticates with `auth()` **by decision** — CONTEXT.md forbids inventing a
   `withApiAuth` twin and there is no `/api/v1` file route — so an HTTP probe needs a browser session
   cookie.
2. **A foreign-file probe without a real blob on the live deployment's disk would be a gate that
   cannot fail.** The route answers 404 for a foreign record whether or not the file exists, so
   without bytes on disk the 404 would come from `existsSync` rather than from the guard. **That is
   precisely the defect 49-06 found in its own plan** (its WRONG FIELD NAME cell answered 404 from
   `existsSync` and would have stayed green with the reference match removed entirely). Planting a
   blob in the live deployment's `/app/uploads` is outside this plan's permitted-write envelope,
   which enumerates two users, two API keys, one definition and the organization the probe creates.

**SC-1's behavioural proof is therefore plan 49-06's**, at handler level against real PostgreSQL and
a real filesystem, whose ablation 1 reproduced the disclosure with the victim's bytes in the response
body. That is stated in SC-1's verdict rather than substituted for.

---

# TASK 2 — THE CONTROL REGISTER

**Rule:** a control whose SUMMARY says it was performed but does not quote the failure is **NOT
DELIVERED**. Judged against verbatim output, never against a claim.

## 49-01 — the fixture and the premise

| # | Control | Expected red | Observed | Verdict |
|---|---|---|---|---|
| 1.1 | the three-count re-measurement | n/a (a measurement, not a gate) | `169 / 0 / 0` and `0 / 0` on both descriptor probes across 188,619 rows, quoted as psql output; **re-measured identically at this sign-off** | **DELIVERED** |
| 1.2 | the EISDIR seam EXECUTED at two uids | the seam fires | `SEAM LIVE: code=EISDIR errno=-21 syscall=unlink … uid=1000` and `… uid=0` | **DELIVERED** |
| 1.3 | negative control: research option (B) as root | the seam does NOT fire, retiring option (B) | `OPTION B DEAD: unlink RESOLVED despite chmod 0500 parent, uid=0` | **DELIVERED** — and it is a control that *proves an option would have been a gate that cannot fail* |
| 1.4 | R1, the insert disabled | hand-off cells red on a LENGTH, not vacuously satisfied | `expected [] to have a length of 1 but got +0`, `6 failed \| 8 passed (14)` | **DELIVERED** |
| 1.5 | R2, the soft-delete teardown | the plan predicted half 2; measured half 1 | `expected 3 to be +0` at `:220`, `3 failed \| 11 passed (14)`, **plus** the cascade `23505` at the next run's `beforeAll` | **DELIVERED**, and the plan's wrong prediction is corrected by measurement rather than the predicate weakened |
| 1.6 | R3, the isolating sabotage (an unprefixed row) | half 1 green, half 2 red | `expected 3 to be +0` at `:226`; **half 1 (line 220) PASSED** | **DELIVERED** — the two teardown halves are measurably non-redundant |
| 1.7 | R4, the absent floor as a MATCHED PAIR | floor removed → green with a planted foreign definition; restored → only the floor reddens | `14 passed (14)` then `expected 1 to be +0`, `1 failed \| 13 passed` | **DELIVERED**, and stronger than the plan asked |

## 49-02 — the two blob helpers

| # | Control | Expected red | Observed | Verdict |
|---|---|---|---|---|
| 2.1 | `return []` ablation, with the reddened-cell COUNT | ≥ 3 cells | **6 failed \| 19 passed (25)**, the six named, anchor diff `expected [] to have a length of 3 but got +0` | **DELIVERED** |
| 2.2 | the missing `typeof stored !== "string"` guard | the `storedName: 42` cell | 5 red; `+ "storedName": 42,` escaping into a ref, and MIXED going 1 → 2 | **DELIVERED** |
| 2.3 | the missing top-level `Array.isArray` rejection | exactly one cell | 1 red, `+ "fieldName": "0"` — **and the fixture shape was chosen so the ablation is observable at all** (a flat array survives the walk anyway) | **DELIVERED** |
| 2.4 | the shared-`try` isolation break | the per-ref barrier | `expected 1 to be 2` (a ref abandoned) **and** `expected { deleted: +0 } to deeply equal { deleted: 2 }` (every blob after the first lost) | **DELIVERED** |
| 2.5 | the removed containment check | the refusal cells, and the escape target really unlinked | 6 refusal cells red; and with the count assertion relaxed to see past it, `AssertionError: the escape target must NOT have been unlinked: expected false to be true` — **the file outside the record's field directory was really gone** | **DELIVERED** |
| 2.6 | rethrow on a failed unlink | the NEVER THROWS cell | `promise rejected "Error: EISDIR…" instead of resolving`, with the seam in the trace | **DELIVERED** |
| 2.7 | "absent counts as FAILED" | the decision becomes visible | 2 cells red, `expected { deleted: +0 } to deeply equal { deleted: 1 }` | **DELIVERED** |

## 49-03 — the four canonical create reads

| # | Control | Expected red | Observed | Verdict |
|---|---|---|---|---|
| 3.1 | B1/B2 pre-fix red, with the assertion count | the 201 carries the pre-recalc blob | **7 failed \| 62 passed (69)** across 3 files, with `- "Margin": { … "value": 1035 }` missing from the deals body and the re-read floor at `expected +0 to be 1` | **DELIVERED** |
| 3.2 | the organizations re-read reverted | 5 cells | `11 tests \| 5 failed`, reproducing Task 1's set exactly | **DELIVERED** |
| 3.3 | the REJECTED in-process merge | (the plan asked for the outcome, whatever it was) | **`20 passed (20)` — fully green** | **DELIVERED as a control; its RESULT is a NEGATIVE.** The unit proof does not discriminate, and 49-03 said so and named 49-05 |
| 3.4 | the dropped owner term (activities) | (open question) | **`30/30` green — caught by nothing** | **DELIVERED as a control; the gap is recorded** and assigned to 49-05 |
| 3.5 | Set A avoided rather than amended | n/a | `git diff --exit-code -- src/lib/mutations/organizations.test.ts` exits **0**; the file is absent from `git diff --name-only HEAD~2 HEAD` | **DELIVERED** |
| — | **Set C (activities) cells** | — | **PASSED at Task 1 — 0 failures — before the fix.** 49-03 labels them a mechanical guard, in-comment at both cells | **A GUARD, NOT EVIDENCE.** Named here and excluded from SC-4's verdict |

## 49-04 — the file-route fix

| # | Control | Expected red | Observed | Verdict |
|---|---|---|---|---|
| 4.1 | the pre-fix IDOR on `GET` | `readFile` reaching another user's path | `26 failed \| 15 passed (41)`; `expected "vi.fn()" to not be called at all… 1st call: ["/tmp/uploads/deal-foreign/Anexos Ação/…pdf"]` | **DELIVERED** |
| 4.2 | the pre-fix IDOR on `DELETE` | `unlink` on the same path | the same transcript for `unlink`, repeated for all four tables — 8 cells | **DELIVERED** |
| 4.3 | the dropped ownership term (ablation A) | the ownership cells | **8 red**, and the finding that `requireScopedPredicate` **did not fire** (2 is not `< 2`) — caught by the predicate-EVALUATING mock instead | **DELIVERED**, and it produced SEC-49-B |
| 4.4 | one table only (ablation B) | exactly the cells naming that table | **exactly 2 red, both `person`** | **DELIVERED** |
| 4.5 | the removed reference match (ablation C) | the reference cells | 5 red — **and the fifth was unpredicted:** `%2e%2e%2fetc%2fpasswd` reaching `readFile`, a spelling containment **cannot see at all**. The FOREIGN cells stayed green, so the two checks are measurably independent | **DELIVERED**, and it is the sharpest evidence in the phase for which check is load-bearing |
| 4.6 | the root-level containment form (ablation D) | it must be shown WRONG | 5 red, including `expected '/tmp/uploads/org-foreign/Anexos Ação/…' to be null` — **a root-level check hands back a path inside a DIFFERENT RECORD's field directory** | **DELIVERED** |
| 4.7 | the `satisfies` in both directions (ablation E) | TS errors both ways | `TS2741`/`TS1360` for a missing key, `TS2353` for an extra one, and **`EXIT=0` without the `satisfies`** | **DELIVERED** |

## 49-05 — the behavioural four-entity DATA-02 proof

| # | Control | Expected red | Observed | Verdict |
|---|---|---|---|---|
| 5.1-5.4 | four per-entity ablations | each reddens exactly ONE cell | four transcripts, each `1 failed \| 22 passed (23)`, each printing the missing derived key. **No run reddened two** | **DELIVERED** — the four-entity claim is four measurements |
| 5.5 | ablation 5, the rejected merge | (outcome, whatever it is) | **`23 passed (23)` — fully green** | **DELIVERED as a control; the RESULT is a NEGATIVE** |
| 5.6 | ablation 5b, that merge **plus** a canonical read resolving nothing | (outcome) | **still `23 passed (23)`** — so the proof is **blind to whether the re-read happens at all** | **DELIVERED**, and it is the sharpest statement of the limit |
| 5.7 | control 5c, dead predicate with the merge removed | must redden, or 5b was an inert edit | **1 failed \| 22 passed** | **DELIVERED** — 5b's sabotage was live |
| 5.8 | ablation 6a, a create's owner term | (open question) | `18 passed (18)` — green, **and no test can do better** | **NOT DELIVERED (structurally impossible).** DEF-49-03 |
| 5.9 | ablation 6b, the GET-by-id owner term | must be caught once coverage exists | `expected 200 to be 404`, exactly one cell | **DELIVERED** — 49-03's ablation 3 closed for the observable half |
| 5.10 | the 403/404 asymmetry, unablated | — | `expected 403 to be 404` against **shipped** code | **DELIVERED as a finding** → DEF-49-01 / SEC-49-C |

## 49-06 — the behavioural SC-1 proof

| # | Control | Expected red | Observed | Verdict |
|---|---|---|---|---|
| 6.1 | ablation 1, the ownership term | the victim's BYTES, not a status | **5 failed \| 13 passed (18)**; `the response body CONTAINS the victim's file contents: expected true to be false`; `A's refused DELETE removed B's file anyway: expected false to be true`; both directions; **plus** the existence oracle opening at `expected 200 to be 404` | **DELIVERED** — and this is SC-1's carrying assertion |
| 6.2 | which cells did NOT redden | — | the 13 green ones enumerated with the reason each is refused by something other than ownership | **DELIVERED** — the separation is the point |
| 6.3 | ablation 2, the reference match | the unreferenced and wrong-field cells | 2 red, both with the victim's bytes in the body; **the FOREIGN cells stayed green (16 passed)** | **DELIVERED** — behavioural counterpart of 4.5 |
| 6.4 | ablation 3a, a deny-everything route | measure what the anchors hold | **15 of 18 cells green against a route that serves nothing to anybody** | **DELIVERED** |
| 6.5 | ablation 3b, a 200 with ZERO BYTES | the content assertions only | 3 red, **every status assertion green** | **DELIVERED** |
| 6.6 | ablation 3c, the content assertions weakened under 3b | — | **`18 passed (18)` against a route that serves zero bytes to its rightful owner and never deletes anything** | **DELIVERED** — the record of why the anchors assert CONTENT |

## 49-07 — post-commit blob deletion

| # | Control | Expected red | Observed | Verdict |
|---|---|---|---|---|
| 7.1 | the pre-fix leak, all four entity types | four cells, each naming its own path | `6 failed \| 15 passed (21)`; four `SC-2: the purge committed but …/<path> is still on disk` reds | **DELIVERED** |
| 7.2 | the mismatch log absent, pre-fix | the log cell | `no mismatch line was logged…: expected [] to have a length of 1 but got +0` | **DELIVERED** |
| 7.3 | A1, deletion moved INSIDE the transaction | the criterion | `{success:false}`, and with the result assertion deferred, **`expected 1 to be +0` — the organization is still in the database** | **DELIVERED** — SC-2's carrying assertion |
| 7.4 | A2, the mismatch `log.error` removed | only the log cell | all four blob-gone cells and the URL cell **green**; only the log-content cell red | **DELIVERED** — deletion and evidence are separate properties |
| 7.5 | A3a, "never rethrow" from the `catch` | (the plan predicted a red) | **`21 passed (21)` — nothing reddens.** The `catch` is UNREACHABLE | **NOT DELIVERED (structurally impossible), and 49-07 says so rather than claiming it** |
| 7.6 | A3b, throw from the reachable branch | — | the log cell red; the result shape **passed** (contained by the inner catch) | **DELIVERED** |
| 7.7 | A3c, throw + rethrow so the failure escapes | the result shape, with the row GONE | `{success:false}` while `countById === 0` passed — the precise distinction from A1, tabulated | **DELIVERED** |
| 7.8 | A4, `PurgeResult` widened — the COUNT | a number instead of a citation | **`11 failed \| 210 passed (221)`; 11 of 11**, split 3/3/3/2 at the cited line numbers, cross-validated by an independent `node` line scan; `dispatch.test.ts` and `prune.test.ts` **stayed green** | **DELIVERED** |
| 7.9 | D1, `mockRestore()` clears `mock.calls` | — | a gate that **could only ever be RED**, against a correct implementation that HAD logged | **DELIVERED as a self-found defect**, and the tempting "fix" would have deleted the two-number check |
| 7.10 | D2, `suite-timing-hygiene` on the barrier | — | the gate correctly flagged a threshold matcher over a `Date.now()`-tainted binding; replaced with byte **equality**, the stronger claim | **DELIVERED**, gate not weakened |
| — | **the URL-goes-dark half** | — | **`expect(after.status).toBe(404)` PASSED before the fix** — already true after 49-04 | **A GUARD, NOT THIS PLAN'S EVIDENCE.** 49-07 claims no credit and neither does SC-2's verdict |

## 49-08 — the survivor's formula after a merge

| # | Control | Expected red | Observed | Verdict |
|---|---|---|---|---|
| 8.1 | the pre-fix state | the stored value is the survivor's own | `expected 122 to be 174`, `3 failed \| 12 passed (15)`; **all four pre-flight floors passed** | **DELIVERED** |
| 8.2 | A1, the recalc call deleted | unit and db | unit **9 of 32**, db **3 of 15**; `expected "vi.fn()" to be called 4 times, but got 3 times` | **DELIVERED** |
| 8.3 | A2, `Object.keys(fieldChanges)` — BOTH halves | the spelling | unit **1 of 32** (`expected [ 'customFields.CNPJ / CPF' ] to deeply equal []`) and db **3 of 15** | **DELIVERED — the most consequential transcript in the phase.** Without that one unit cell the fix ships a call that writes nothing |
| 8.4 | A3, the survivor's block moved after the children's | unit and db | unit **7 red**; **db 15/15 GREEN** | **DELIVERED for the unit half; NOT DELIVERED behaviourally.** DEF-49-05, structural |
| 8.5 | A4, `cascade: true` | exactly one cell | 1 red, `expected true to be false`; db 15/15 green, with the fan-out cost **labelled as read-derived rather than measured** | **DELIVERED** |
| 8.6 | A5, the minted definition withheld | the floor must name the cause | 4 red, and the floor is **the only cell that reports the real cause**: `expected 0 to be greater than or equal to 1` | **DELIVERED** |
| 8.7 | A6, `changedFields` genuinely EMPTY | the non-empty anchor | 2 red — **and the `prefixed` predicate PASSED**, because an empty array satisfies "nothing begins `customFields.`" perfectly | **DELIVERED** — the vacuity the anchor exists for, reproduced |
| 8.8 | A7, the scope literal renamed | the D-05 cell | 1 red; **`log-scope-format.test.ts` stayed GREEN** — it asserts a scope's SHAPE and cannot see one that is well-formed and wrong | **DELIVERED** |
| 8.9 | the VACUITY CONTROL, side by side | green under unfixed code | isolated with `-t`: **`1 passed \| 14 skipped`** while the real proof was 3-red in the same run | **DELIVERED**, and it is green *for the opposite reason a reader would assume* |
| 8.10 | D1, the ORDERING cell was VACUOUS | — | `invocationCallOrder` is monotonic by construction; the cell passed with the survivor recalculated **last**. Re-driven after the fix: `expected 38 to be less than 36` | **DELIVERED as a self-found defect** |
| 8.11 | `updated_at` unchanged by a derived refresh | — | asserted, **no red recorded** — unablatable without editing `formula-recalc.ts` | **NOT DELIVERED (structurally impossible), and 49-08 says so** |
| 8.12 | the six isolation-guard cells | — | each carries its own `.toThrow`, inherited from `dedup.db.test.ts`; **no red recorded in this plan** | **NOT DELIVERED in this plan**, named rather than counted |

## Register totals

**41 controls judged. 36 DELIVERED. 5 NOT DELIVERED** — 5.8 (a create's owner term), 7.5 (the inner
catch's never-rethrow), 8.4-behavioural (the ordering), 8.11 (`updated_at`), 8.12 (the isolation
guards). **Every one of the five is a structural impossibility rather than an unrun experiment, and
every one is named by the plan that owns it.** Three regression guards are named as guards and
excluded from every verdict: 49-03's Set C cells, 49-07's URL-goes-dark half, and the green first runs
of 49-05 and 49-06.

---

## THREE CONTROLS RE-FALSIFIED FRESH AT SIGN-OFF

Not quoted from a transcript — re-run now, against the tree as it stands. Baseline first in every
case.

### Fresh falsification 1 — the ownership term in `src/lib/api/file-access.ts`

The phase's headline security claim. `eq(source.ownerId, userId)` deleted from
`findOwnedRecordById`'s `terms`, leaving two.

Baseline: `Test Files 1 passed (1) / Tests 18 passed (18)`.

```
 ❯ |db| src/app/api/files/__tests__/files-route-ownership.db.test.ts (18 tests | 5 failed) 418ms
     × GET: A is refused B's file, and the response carries none of B's bytes 24ms
     × DELETE: A is refused B's file, and B's BLOB IS STILL ON DISK afterwards 19ms
     × SYMMETRY, GET: B is refused A's file too — the guard is not one-directional 12ms
     × SYMMETRY, DELETE: B is refused A's file, and A's blob survives 13ms
     × the missing-record 404 is BYTE-IDENTICAL to the foreign-record 404 23ms

 FAIL … > GET: A is refused B's file, and the response carries none of B's bytes
AssertionError: A requested B's file — the response body CONTAINS the victim's file contents. A
status-code assertion would not have seen this; the bytes are the claim.: expected true to be false

 FAIL … > DELETE: A is refused B's file, and B's BLOB IS STILL ON DISK afterwards
AssertionError: A's refused DELETE removed B's file anyway. The status code alone would not have
shown this.: expected false to be true

 FAIL … > the missing-record 404 is BYTE-IDENTICAL to the foreign-record 404
AssertionError: expected 200 to be 404 // Object.is equality

 Test Files  1 failed (1)
      Tests  5 failed | 13 passed (18)
```

**Restored:** `git diff --exit-code -- src/lib/api/file-access.ts` exit 0, `18 passed (18)`.

### Fresh falsification 2 — the `changedFields` spelling in `src/lib/mutations/dedup.ts`

The shape in which DATA-01 would have shipped green over the defect.
`changedFields: survivorChangedFields` → `changedFields: Object.keys(fieldChanges)`.

**Behavioural half:**

```
 ❯ |db| src/lib/mutations/dedup-formula.db.test.ts (15 tests | 3 failed) 628ms
     × recomputes the survivor's formula from its POST-MERGE inputs, with one reparented child
     × recomputes the survivor's formula when there are NO reparented children at all
     × produces the same value a FRESH recalculation of the same row produces, without bumping updated_at

AssertionError: the survivor now holds INPUT A = 37 and INPUT B = 100, so the only value consistent
with the record is 37 * 2 + 100 = 174. A stored 122 means nothing was recomputed; a stored 574 means
the loser's value was copied rather than computed.: expected 122 to be 174
- 174
+ 122
```

**Unit half — and note it is the ONLY red of 32:**

```
 ❯ src/lib/mutations/dedup.test.ts (32 tests | 1 failed) 84ms
     × SPELLING: changedFields carries the BARE custom-field name and the native COLUMN name, and nothing prefixed

AssertionError: ["customFields.CNPJ / CPF"] carries the AUDIT DIFF's spelling.
`scopeFormulasToChangedFields` matches the bare definition name, a native attribute via its column
name, or the coarse sentinel — never a dotted `customFields.<Name>`. A call built from
`Object.keys(fieldChanges)` therefore selects NO formula, writes NOTHING, and looks exactly like a
fix.: expected [ 'customFields.CNPJ / CPF' ] to deeply equal []
- []
+ [ "customFields.CNPJ / CPF" ]

 Test Files  1 failed (1)
      Tests  1 failed | 31 passed (32)
```

**The unit red names the CAUSE; the behavioural red reports only the value.** That asymmetry is the
argument for keeping both.

**Restored:** `git diff --exit-code -- src/lib/mutations/dedup.ts` exit 0; `15 passed (15)` and
`32 passed (32)`.

### Fresh falsification 3 — the post-commit blob deletion moved inside the transaction

The assertion that carries SC-2. Faithful to 49-07's A1: the ablation is the PLACEMENT, and the throw
is what makes the placement observable at all, because `deleteEntityFiles` never rejects.

First, with the file as shipped — and note what the failure MASKS:

```
 ❯ |db| src/lib/trash/purge-blobs.db.test.ts (21 tests | 3 failed) 844ms
AssertionError: expected { success: false, …(1) } to deeply equal { success: true, detached: 1 }
-   "detached": 1,
-   "success": true,
+   "error": "Failed to purge organization",
+   "success": false,
```

Then with that assertion deferred by a labelled probe, so the ROLLBACK itself reaches the record
assertion:

```
 ❯ |db| src/lib/trash/purge-blobs.db.test.ts (21 tests | 1 failed | 20 skipped) 258ms
     × purging a organization removes its bytes, leaves the neighbour's, and returns an unchanged result shape 65ms

AssertionError: expected 1 to be +0 // Object.is equality
- 0
+ 1
 ❯ src/lib/trash/purge-blobs.db.test.ts:1147:50
    1147|       expect(await countById(table, subject.id)).toBe(0)
```

**`expected 1 to be +0`: the organization is STILL IN THE DATABASE.** And note the cell reached line
1147, which is *after* the blob-gone loop — so under this ablation **the bytes were irreversibly
destroyed AND the row was rolled back.** That is the worst possible outcome and it is the complete
argument for post-commit placement: an undeletable blob makes a record un-purgeable forever, and a
deletable one destroys bytes a rollback cannot bring back.

**Restored:** `git checkout --` both files; `git diff --exit-code -- src/` exit 0.

---

## THE VACUITY HUNT — FOUR TESTS, 13 ARTIFACTS, 800 ASSERTIONS

**Result, stated whether or not it found anything: NO VACUOUS GATE FOUND.**

**The artifact count, and a discrepancy recorded rather than rounded.** The plan's threat register says
"fifteen new or modified gate artifacts"; its `read_first` names ten test files, and the amended
assertions live in three more. Measured: **13 gate FILES** (10 new/extended + 3 amended), carrying
**800 `expect(` calls** over comment-stripped source, counted with `node` and never a pipe. The
plan's "fifteen" is 9 files + 6 assertions counted in different units. Recorded, as 48-10 recorded its
off-by-one.

### Test 1 — can it be made to fail by breaking the thing it claims to protect?

**Answered by RUNNING the shipped predicates on fixtures no test file in the phase contains**, which
is how Phase 47 found its ninth vacuous gate. `collectFileFieldRefs`, `recordReferencesStoredName` and
`resolveContainedPath` were imported and driven on 20 novel cases (`zz9-plural-z-alpha`,
`Dossie Vogonico`, `/srv/hyperspace/uploads` — none of these strings appears in any test file).

```
 Test Files  1 passed (1)
      Tests  20 passed (20)
```

The results that carry information:

- **`%2e%2e%2fetc%2fpasswd` is ADMITTED by containment**, on a novel fixture, independently
  reproducing 49-04's ablation-C finding: it contains no separator and no `..`, so it resolves to a
  legitimate direct child and **only the JSONB reference match refuses it.**
- The reference match is **exact equality, not a substring test**: a prefix of a stored name, a
  superstring of it, and a case variant all refuse, while the exact name accepts.
- **`__proto__` as a field name refuses** rather than resolving the prototype.
- A two-segment climb, a one-segment climb into a sibling field, a climb into a **different record's**
  field directory, an absolute filename, an empty filename, a bare dot, a nested-but-contained
  filename, a poisoned `entityId` and a poisoned `fieldName` all refuse — with the legitimate direct
  child accepting beside them, so the refusals are discriminating rather than blanket.

**One case corrected THIS PLAN's own prediction, and it is recorded rather than quietly fixed.** I
predicted `collectFileFieldRefs` would carry a descriptor whose `storedName` is `""`:

```
 FAIL … > carries a descriptor whose storedName is an empty string — the module does not judge values
AssertionError: expected [] to deeply equal [ { …(3) } ]
- [ { "entityId": "zz9-plural-z-alpha", "fieldName": "Dossie Vogonico", "storedName": "" } ]
+ []
```

**The module is right and I was wrong.** `collect-file-field-refs.ts:85` refuses it explicitly,
because an empty name "would resolve to the FIELD DIRECTORY itself, which a deletion must never be
handed" — and the sibling test covers it at `collect-file-field-refs.test.ts:198`. The case was
rewritten to assert the refusal **with a one-character acceptance beside it**, so it discriminates
rather than rejecting all short names. *Every plan in this phase found a defect in its own plan; the
sign-off found one in its own audit.*

The probe file was temporary and is **deleted** — the base suite count is unchanged by it, which is
what keeps the delta reconciliation below honest.

### Test 2 — does it have a FLOOR as well as a ceiling?

**This phase is especially exposed: three criteria depend on counts measured at zero.** 51
named-integer constants across the 10 new gate files were enumerated mechanically
(`ANCHOR_REF_COUNT=3`, `SEEDED_BLOB_TOTAL=9`, `FORMULA_DEFINITIONS_TOTAL=4`,
`FORMULA_DEFINITIONS_BEFORE_SEED=0`, `MIN_FORMULA_DEFINITIONS=1`, `SABOTAGED_REF_COUNT=1`,
`SURVIVING_REF_COUNT=HAPPY-SABOTAGED`, `ACTIVITY_DETACHED=0`, …). Then a scanner classified every
assertion in every cell as *empty-satisfiable* (`toEqual([])`, `toBe(0)`, `toBeNull()`,
`not.toContain`, …) or *floor* (`toBe(true)`, a non-zero `toBe`, `toContain(`, `.equals(`,
`existsSync(`, …):

```
cells with at least one assertion: 261
cells whose assertions are ALL empty-satisfiable, with no floor beside them: 30
```

**All 30 were inspected by hand, and all 30 carry their floor in a SIBLING CELL of the same file**, in
four groups: `route-containment.test.ts`'s 10 direct-call refusals (paired with the positive
`resolves a legitimate stored name` cell and 8 handler anchors);
`collect-file-field-refs.test.ts`'s 16 `toEqual([])` negatives (paired with the anchor pinned at
exactly 3); `custom-field-definition-fixture.db.test.ts`'s two baseline-zero floors and its
idempotency cell (which ARE the floors — zero *is* the claim); and one pre-existing Phase 48 mock
self-test in `activities/__tests__/route.test.ts` whose polarity partner is the very next cell,
labelled *"⚠ The load-bearing cell"*.

**Three of the four groups' floors were OBSERVED FIRING** in a recorded ablation: 49-02's `return []`
reddened 6 (not the 16 negatives), 49-04's ablation D reddened 5, and 49-01's R4 matched pair plus R2
reddened the baseline floors and the idempotency cell.

**A per-FILE floor is not a per-CELL floor, and that is named as brittleness rather than smoothed
over.** A fresh deny-everything ablation on `resolveContainedPath` (`return null` unconditionally)
measures exactly how much of that file is load-bearing:

```
 ❯ src/app/api/files/__tests__/route-containment.test.ts (52 tests | 9 failed) 71ms
     × serves the caller's OWN referenced file, and reads it exactly once      (× 4 entities)
     × unlinks the caller's OWN referenced file exactly once on DELETE          (× 4 entities)
     × resolves a legitimate stored name to a direct child of the field directory
AssertionError: expected 404 to be 200 // Object.is equality

      Tests  9 failed | 43 passed (52)
```

**9 of 52.** So 43 cells stay green against a containment check that refuses everything, and the
file's non-vacuity rests entirely on its 9 positives. That is the same shape 49-06 measured (15 of 18
green against a deny-everything route) and it is the honest characterisation: **the positives are not
decoration, they are the whole floor.** Delete them and the file becomes unfailable.

### Test 3 — does it collide with its own explanatory prose?

**Satisfied structurally, and this is the strongest of the four results.** Across all 13 gate files:

```
readFileSync of a SOURCE file: 0
```

Every `readFileSync` in the phase (8 in `files-route-ownership.db.test.ts`, 3 in
`purge-blobs.db.test.ts`) reads a **fixture BLOB** and compares it with `.equals(<known bytes>)` — a
behavioural byte comparison. **No gate in this phase reads a source file from disk**, so the project's
most-repeated failure mode — the comment explaining a rule tripping that rule's own grep, fifteen
occurrences across Phases 37-38 — has **no surface here at all.** The 16 source-path string literals
that a naive scan finds are all citations inside comments; none feeds an assertion.

### Test 4 — would a rename of the token it searches for make it go RED rather than green?

**Answered fresh rather than quoted.** The phase's one token-shaped gate is the mismatch log's
payload. Renaming `"Purged record's blobs were not all deleted"` to
`"Blob deletion after purge was incomplete"` — an equally well-formed, equally descriptive value:

```
 ❯ |db| src/lib/trash/purge-blobs.db.test.ts (21 tests | 1 failed) 875ms
AssertionError: expected { level: 'error', …(7) } to deeply equal { level: 'error', …(7) }
-   "msg": "Purged record's blobs were not all deleted",
+   "msg": "Blob deletion after purge was incomplete",

===== log-scope-format =====
      Tests  9 passed (9)
```

**RED on the exhaustive `toEqual`, while `log-scope-format.test.ts` stays GREEN** — reproducing
49-08's A7 finding on a different token: that gate asserts the *shape* of a scope and structurally
cannot see one that is well-formed and wrong. And note the exhaustive `toEqual` is 49-07's Deviation 7,
added beyond its plan precisely so an added `paths` key could not slip past three substring checks;
this rename is the independent demonstration that it earns its place. **Restored**,
`git diff --exit-code -- src/` exit 0.

### The gate-that-cannot-fail search: RESULT RECORDED

**No vacuous gate found.** Four tests applied to **13 artifacts / 800 assertions**; 30 cells flagged
mechanically and all 30 resolved to a sibling-cell floor, three of the four groups' floors observed
firing; test 1 run rather than read on 20 novel fixtures; test 3 satisfied structurally at zero source
greps; test 4 answered with a fresh red. **One floor named as brittle rather than softened:**
`route-containment.test.ts`'s 9 positives out of 52 cells. **One correction to this audit's own
prediction**, recorded above.

---

## THE ONE-HOP-OUT AUDIT — and it found something

**This is the check Phase 48's sign-off did not do.** Every call-chain neighbour of the phase's file
surface was enumerated and inspected.

**SC-2, and a clean result worth stating:** the only hard deletes of a CRM row anywhere in `src/`
outside tests are the four purge mutations (`organizations.ts:637`, `deals.ts:738`,
`people.ts:642`, `activities.ts:494`) — **all four now carry the post-commit blob deletion. There is
no fifth deletion path.** The "one hop away" question is closed for SC-2 by enumeration.

**The two blob helpers** are called by exactly the four purge mutations and their own tests. **The
three file-access guards** are called by exactly the file route and its tests. Nothing else reaches
either.

**DATA-02, one hop out:** the three `[id]` **PUT** handlers still serialize
`{ ...updated, customFields: recalculatedCustomFields }` — the rejected in-process merge
(`deals/[id]:332`, `people/[id]:258`, `activities/[id]:387`). Already recorded by 49-03, so not a
miss; but "decide once for all four entities" was the requirement's own wording, and the decision
holds for creates and not for updates. Attached to DATA-49-A.

### SEC-49-D / DEF-49-06 — `POST /api/upload` has the defect 49-04 closed, on the write side

**Phase 49 closed the READ and DELETE side of the file surface. The WRITE side carries the identical
defect, unrecorded and untested.**

`src/app/api/upload/route.ts`:

```ts
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {                                   // :33-36 — and then NOTHING
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  …
  const entityId  = formData.get('entityId')  as string   // :41  UNVALIDATED
  const fieldName = formData.get('fieldName') as string   // :42  UNVALIDATED
  …
  const uploadDir = path.resolve(UPLOAD_DIR, entityId, fieldName)   // :99  NO containment check
```

Three findings, in order of sharpness. Reproduced by **executing that exact expression** against the
container's measured `UPLOAD_DIR=/app/uploads`:

```
INSIDE   /app/uploads/9f1c…0001/Anexos          <- a legitimate upload
INSIDE   /app/uploads/victim-record-id/Anexos    <- ANOTHER USER's record id; nothing checks
OUTSIDE  /app                                    <- entityId "../../.."  fieldName "app"
OUTSIDE  /etc/cron.d                             <- entityId "/etc"
OUTSIDE  /var/tmp                                <- fieldName "../../../var/tmp"
```

1. **No ownership check.** Byte-for-byte the shape the file route had before plan 49-04.
2. **No path containment.** Any authenticated caller can make the application write into a directory
   of their choosing. The basename is a server-minted UUID plus the caller's extension, so this is an
   arbitrary-**directory** write rather than an arbitrary **overwrite** — which bounds it, and does
   not make it acceptable.
3. **The loose 401.** `!session?.user` accepts `{ user: {} }`. 49-04 tightened the file route to
   `!session?.user?.id` with two recorded reds; this route was outside that plan's surface.

**It does NOT reopen SC-1, and that is stated so the finding is not over-read.** The read guard
requires the requested filename to already be a value the server wrote into *that record's own*
`customFields`, and an attacker cannot write the victim's JSONB without owning the victim's record —
so a planted blob is not retrievable through `/api/files/...`. **SC-1's verdict stands unchanged.**

**No test covers this route.** Nothing under `src/` or `e2e/` drives `POST /api/upload`; the ten files
matching `api/upload` are the route, its client caller, and eight citations in prose or in
`compose-uploads-persistence.test.ts`'s env-literal gate.

**Recorded, not fixed.** SEC-04 is *"a purged record's uploaded files are unreachable — removed from
storage, and not served even while they exist."* An upload WRITE path is not that on any reading, and
a sign-off plan that grows a fifth requirement's worth of work is a sign-off nobody can audit. Filed
as **SEC-49-D** in `BACKLOG.md` and **DEF-49-06** in the phase's `deferred-items.md`, with the
suggestion to reuse this phase's own exported `findOwnedRecordById` and `resolveContainedPath` rather
than inventing a third spelling of the same rule.

---

## THE THREE CLAIMS THIS PHASE MUST NOT MAKE — checked by POLARITY, and reported

### (a) No S3 coverage — CONFIRMED ABSENT

**25 sentences mentioning S3 across the eight plan SUMMARYs. All 25 are refusals or scope limits.
Zero claim coverage.** Two flagged by a naive scan turned out to be sentence fragments cut at a
period — *"The S3 cell is a MOCK. It is not evidence for SC-1 or SC-2."* and *"accept, named.
SEC-49-A. No cell, no claim."* — both refusals. Re-confirmed against the running deployment:
`FILE_STORAGE` unset, `/app/uploads` empty. `deleteEntityFiles`'s S3 branch is mock-covered only; no
bucket exists anywhere reachable. **SEC-49-A remains open with this phase's measurement attached.**

### (b) No "recoverable indefinitely" — CONFIRMED ABSENT, and two documents outside the phase corrected

**22 occurrences of the stem in the phase directory. All 22 are refusals, corrections, or
instructions not to make the claim. ZERO assert it.** A raw grep matches 13 files, so judging by
presence would have reported a violation that does not exist — the exact failure mode this phase warns
about, arriving inside the audit built to catch it. `audit.retention_days = 90`, measured again here.

**Two documents this sign-off touches DID still assert it, and both are corrected:**
`REQUIREMENTS.md`'s SEC-04 source note ("recoverable from the audit tombstone indefinitely") and
`BACKLOG.md`'s CR-01 consequence 3 ("recoverable from the audit log by any admin, indefinitely"). Both
now read 90 days with the correction stated as a correction.

### (c) DEF-48-05 / SEC-48-C is NOT closed — CONFIRMED, and restated as OPEN

**Six references across the eight SUMMARYs. All six are explicit non-absorptions** ("not absorbed",
"was NOT absorbed"). Phase 48's records assign it to Phase 49; the user decided otherwise; **no plan
took it and this sign-off does not claim it.** It keeps its backlog owner and its evidence, and it is
restated as open in `STATE.md`'s carried-forward table with its full description.

**One documentation inaccuracy found while checking this:** 49-07's SUMMARY labels the retired
"recoverable indefinitely" claim as "(DEF-48-05 / SEC-48-C)". Those ids are the mutation-helper
ownership contract, not the retention claim. Harmless mislabel, recorded rather than left to mislead.

---

# TASK 3 — THE FOUR CRITERION VERDICTS

**No verdict cites a regression guard.** The three known guards are named as guards: 49-03's
activities cells (C1) were green before the fix; 49-07's URL-goes-dark half was already true after
49-04; and 49-05's and 49-06's first runs were green because the fix had already landed in an earlier
wave.

## SC-1 — a file URL whose record the caller may not see returns no bytes: **PROVED, for `FILE_STORAGE=local` ONLY**

**The carrying assertion is plan 49-06's ablation 1**, at the byte level against real PostgreSQL and a
real filesystem:

- the foreign `GET` returned **the victim's file contents in the response body** —
  `AssertionError: A requested B's file — the response body CONTAINS the victim's file contents. A
  status-code assertion would not have seen this; the bytes are the claim.: expected true to be false`
- the foreign `DELETE` **unlinked the victim's blob from the real disk** — `existsSync` on the
  victim's path returning `false` after A's request, with the bytes asserted present before it
- **both directions**, so the guard is not one-directional
- and the anti-oracle cell reddened at `expected 200 to be 404`, so under the defect the status code
  alone told a caller which record ids exist

**Re-falsified fresh at sign-off: 5 of 18 red, the same five cells, the same messages.**

The shipped behaviour: `GET` and `DELETE` both answer a uniform **404** with the same 29-byte body for
a foreign, missing or trashed record, because the ownership term lives inside the query. The **JSONB
reference match is the load-bearing check**, and that was measured rather than asserted: removing it
reddens the percent-encoded traversal, which containment cannot see at all (confirmed independently at
this sign-off on a novel fixture). Containment is against the **field directory**, because 49-04 drove
the root-level form and it handed back a path inside a **different record's** field directory.

**Scope limits, in the verdict itself:**

- **`FILE_STORAGE=local` only.** Under `s3` the stored `publicUrl` is `${S3_PUBLIC_URL}/${key}` and
  reads never traverse the guarded route. **SEC-49-A, open.** `FILE_STORAGE` re-confirmed unset in the
  rebuilt container, so `local` is the configuration actually deployed.
- **The purged file's URL stays recoverable from the audit tombstone for 90 days, not indefinitely.**
  `audit.retention_days = 90`, measured. 90 days is ample for the ordering argument to hold.
- **There is NO HTTP-level proof, and the reason is a decision plus a vacuity risk**, not laziness:
  the route is session-authenticated by decision, and a probe without a real blob on the deployment's
  disk would take its 404 from `existsSync` rather than from the guard. The unauthenticated 401 is a
  **smoke check**.
- **The write side is NOT covered** — SEC-49-D, new at this sign-off.
- Only `organizations` is covered behaviourally; the other three entity types are covered per-table at
  the unit level (49-04, ablation B reddening exactly the 2 cells naming `person`) and share one code
  path and one predicate shape.

## SC-2 — after a purge the blob is gone, and a storage failure leaves the purge committed: **PROVED**

**Two carrying assertions, and both halves of the second are named.**

**The bytes are gone.** Four per-entity cells, each with its `collectFileFieldRefs` floor asserted
**before** any blob-gone assertion (`ORG_REF_COUNT = 2`, person/deal/activity `= 1`,
`SEEDED_BLOB_TOTAL = 9`), so the reds are about real files and not an empty set. The leak was
reproduced first, per entity type: `SC-2: the purge committed but …/purgeblob-org/Anexos Ação/…pdf is
still on disk — the blob survived a permanent delete and stays reachable to anyone holding its URL.`

**The injected failure leaves the purge COMMITTED, and BOTH halves are asserted.** (i) The row is gone
from the database, by direct SQL: `countById(table, id) === 0`, asserted **before** the log, because
the row is the criterion and the log is the evidence. (ii) The mismatch is logged with numbers:
`{"scope":"mutations/organizations","msg":"Purged record's blobs were not all deleted","entityType":"organization","id":"purgeblob-org","expected":2,"deleted":1}`
— identifiers and counts only, never a filename, asserted by an exhaustive `toEqual` over the whole
field set so an added `paths` key could not slip past a substring check.

**The defect-proving assertion, re-falsified fresh:** with the deletion moved inside the transaction
and the result assertion deferred, `expected 1 to be +0` — the organization is still in the database,
**while its bytes are already gone**. And A2 proves deletion and evidence are independent properties:
removing the log leaves all four blob-gone cells and the URL cell green, reddening only the log cell.

**Stated limits:**

- **The URL-goes-dark half was ALREADY TRUE after plan 49-04 and is NOT this criterion's new
  evidence.** `expect(after.status).toBe(404)` passed before 49-07 touched anything, because
  `findOwnedRecordById` carries `isNull(deletedAt)`. 49-07 claims no credit for it and neither does
  this verdict. The half 49-07 delivers is `existsSync(target) === false` beside it.
- **The S3 blob case is MOCK-COVERED ONLY.** SEC-49-A. No cell exercises it, no bucket exists.
- **The inner catch's never-rethrow is NOT covered by a red** — unreachable, because
  `deleteEntityFiles` never rejects (A3a: 21/21 green). A3b and A3c cover the reachable forms, and the
  A1-vs-A3c table distinguishes "rolled back" from "committed but reported as failed".
- **The now-empty directory tree is deliberately not pruned.**

## SC-3 — a merge leaves the survivor's formula equal to a fresh computation: **PROVED**

**The carrying assertion:** the survivor's stored value equals **174**, with the
does-not-equal-pre-merge discriminator beside it —

```
AssertionError: the survivor now holds INPUT A = 37 and INPUT B = 100, so the only value consistent
with the record is 37 * 2 + 100 = 174. A stored 122 means nothing was recomputed; a stored 574 means
the loser's value was copied rather than computed.: expected 122 to be 174
```

**Why 174 and not 74 is the whole point.** The plan specified one input and a doubling; measured, that
fixture computes **74 — exactly the loser's own stored value** — so a merge that merely COPIED the
loser's formula key would have satisfied both the equality and the discriminator. The shipped fixture
reads **two** inputs, one won by each record (survivor stores 122, loser stores 574), so **174 is
reachable only by recomputing from a MIXTURE of the two records**, and a floor asserts
`174 ∉ {122, 574}` before any claim is made. Corroborated by an independent recomputation of the same
row through `recalculateFormulas` directly, and by the **no-reparented-children** cell — the strongest
form of the defect, because `recalcReparentedChildren` returns on an empty work list and so recomputed
literally nothing at all. The `no-reparented-children` and `no-reparented-children`-adjacent cells also
assert that nothing was reparented, so the recomputation cannot be attributed to the children's block.

**The VACUITY CONTROL is what makes the fixture requirement necessary rather than stylistic.** The
same assertion shape on a survivor-wins `choices` map was run **under the unfixed code** and recorded
**PASSING** — `1 passed | 14 skipped`, isolated with `-t` so there is no ambiguity — and it is kept in
the file with a do-not-delete comment. Worse, it is green under the FIXED code **for the opposite
reason a reader would assume**: with an all-survivor choice map nothing changed, so the correct
implementation computes `changedFields = []` and deliberately writes nothing.

**The `Object.keys(fieldChanges)` ablation is the recorded proof that the spelling matters**, and it
is the most consequential transcript in the phase: it is the exact shape in which DATA-01 would have
shipped green over the defect — a call that runs on every merge, costs a definition read, writes
nothing, and looks exactly like a fix. **Re-falsified fresh at sign-off on both halves**: unit **1 of
32**, naming the cause; db **3 of 15**, reporting only the value.

**Stated limits:** the survivor-first **ORDERING has no behavioural detector** (**DEF-49-05**) — two
unit cells hold it, the db file is 15/15 green under a reorder, and the reason is structural (the
fixture reparents a `deal`, there are no `type='formula'` definitions on `deal`, so
`childReferencesChangedParentField` returns false either way). `updated_at` unchanged carries no red
either. And the survivor's **PRE-EXISTING** children keep stale `Organization.*` values — WR-02, open,
`cascade: false` by decision.

## SC-4 — a 201 body carries the same custom-field values a GET returns, all four entities: **PROVED**

**The carrying assertions are plan 49-05's four per-entity behavioural cells**, each a real `POST`
through a real minted API key followed by a real `GET` through the same key, with the stored column
**cross-checked by direct SQL** through nothing either handler uses, over a **manufactured** formula
definition per entity type whose expected value is computed in the test from the POST's input.
**Four ablations, each reddening exactly ONE cell; no run reddened two** — so the four-entity claim is
four measurements rather than one inference, and the coverage bookkeeping records participation at the
TOP of each cell so a failing cell still counts as run and cannot couple the four.

Three pre-flight floors make the green mean something:
`FORMULA_DEFINITIONS_BEFORE_SEED = 0`, `FORMULA_DEFINITIONS_PER_ENTITY = 1`,
`FORMULA_DEFINITIONS_TOTAL = 4` — with `TOTAL` asserted equal to `PER_ENTITY × ENTITIES_PROVEN`,
because an assertion deriving both sides from one source passes on an empty database.

**Plus this plan's real-HTTP round trip** against the rebuilt image: 201 then 200, the two
`custom_fields` deeply equal, the derived value equal to the expression computed from the name that
was SENT, and the discriminator asserted that the 201 ≠ the object the request sent. 12 of 12.

**Stated limits, all four:**

- **49-03's activities cells (C1) are a MECHANICAL GUARD and were green before the fix** — 0 failures
  at Task 1. They stop the re-read turning a 201 into a `TypeError`; they are not evidence that a
  re-read happens or that its predicate is right, and the test file says so in-comment at both cells.
  Excluded from this verdict.
- **Set A was AVOIDED by route-level placement, not amended.** `organizations.test.ts` diff exits 0,
  lines 134 and 600 untouched. Mutation-level placement was not merely unnecessary but **impossible as
  a four-entity fix**: `people` and `deals` POST call no create mutation at all.
- **The canonical read and the rejected in-process merge are OBSERVATIONALLY IDENTICAL today, so the
  guarantee is the CODE PATH.** Ablation 5 passes 23/23; **5b — that merge plus a canonical-read
  predicate rewritten to resolve nothing — is still 23/23**, so the proof is blind to whether the
  re-read happens at all; control 5c reddens, proving 5b's sabotage was live. **Nothing in this phase
  discriminates the two and this verdict does not claim otherwise.** DATA-49-A.
- **A create's canonical-read owner term is structurally unobservable** (DEF-49-03), held by 49-03's
  rendered-predicate assertion for organizations only. The **GET-by-id** owner terms, which ARE
  observable, are behavioural for all four (49-05's ablation 6b: `expected 200 to be 404`, exactly one
  cell) — closing 49-03's ablation 3 for its observable half. `activities/[id]` answers 403 where its
  siblings answer 404, asserted as **measured** through `FOREIGN_READ_STATUS` rather than harmonised
  (SEC-49-C / DEF-49-01), with a dedicated cell asserting the asymmetry itself so the file reddens in
  **both** directions.
- The three `[id]` **PUT** handlers still use the rejected merge; SC-4's criterion is the 201 only.

---

## THE PHASE GATE, EVERY NUMBER

| Gate | Result |
|---|---|
| base project (`./node_modules/.bin/vitest run`) | **5659 passed / 32 skipped**, **184 files passed / 2 skipped (186)** |
| RSC project (`--config vitest.rsc.config.ts`) | **8 passed (8)** over 2 files |
| `./node_modules/.bin/tsc --noEmit` | exit **0** |
| `./node_modules/.bin/eslint src` | **0 ERRORS** / 118 warnings — **gated on errors only**; the warning total is not reproducible across trees (124 main vs 118-122 worktree) |
| `npm run test:db` | **288 passed over 13 files**, **EXIT 0** — read by count AND exit code, because DEF-48-01 is closed |
| `npm run db:check-migrations` | exit **0** — `OK: the migration chain builds a complete schema from zero` |
| `npm run security:audit` | exit **0** — 47 advisories across 14 vulnerable packages, 39 at critical/high, **39 of 39** allowlist entries applied, 1285 dependencies |
| `/api/health` | **200**, `db.ok: true`, `latencyMs: 1`, **10/10** processors |
| bound container image | `sha256:83003bf6eb2e…` → **`sha256:66efd8556ac1…`** (CHANGED) |
| `git diff --exit-code -- src/` | exit **0** |
| `git diff --exit-code` (whole tree) | exit **0** |

### The suite delta, reconciled PLAN BY PLAN — and it closes EXACTLY

**Base project**, every intermediate figure quoted from the SUMMARY that measured it:

| Plan | Delta | Quoted from |
|---|---|---|
| baseline at the close of Phase 48 | **5546 / 32 over 180 files** | `49-VALIDATION.md` (measured on `195c7c4`) |
| 49-01 | **+0** | *"`npm test` (base) — **5546 passed / 32 skipped over 180 files** — exactly the baseline, unchanged"* |
| 49-02 | **+43** (25 + 18) | *"**5589 passed / 32 skipped**"*, *"5546 → 5589 passed is exactly +43"*, files 180 → 182 |
| 49-03 | **+11** | *"**5557 passed / 32 skipped over 181 files** (baseline 5546/32 over 180)"*, all 11 in the new organizations file |
| *post-wave-1* | **= 5600 / 183 files** | confirmed by 49-05: *"**5600 passed / 32 skipped over 183 files** — exactly the wave-1 baseline"* |
| 49-04 | **+52** | *"**+52 in 1 new file** — exactly this plan's cells, nothing else moved"* |
| 49-05 | **+0** | *"exactly the wave-1 baseline, unchanged"* (its file is a db test) |
| *post-wave-2* | **= 5652 / 184 files** | confirmed by 49-06 and 49-07, both *"5652 passed / 32 skipped over 184 files"* |
| 49-06 | **+0** | *"baseline-equal, nothing moved"* |
| 49-07 | **+0** | *"exactly the baseline, unchanged"* |
| 49-08 | **+7** | *"**5659 passed / 32 skipped** over **184 files** … delta **+7**, exactly the seven new unit cells"* |
| 49-09 | **+0** | the vacuity probe file was temporary and deleted |

**`5546 + 0 + 43 + 11 + 52 + 0 + 0 + 0 + 7 + 0 = 5659`. MEASURED: 5659. Closes exactly.**
Files: `180 + 2 + 1 + 1 = 184`. **MEASURED: 184 passed. Closes exactly.** Skipped unchanged at 32
throughout.

**db project:**

| Plan | Delta | Quoted from |
|---|---|---|
| baseline at the close of Phase 48 | **197 passed / 8 files** | `49-VALIDATION.md` |
| 49-01 | **+14** | *"**211 passed / 0 failed** (baseline 197 + 14 new)"* |
| 49-05 | **+23** | *"**234 tests passed** (baseline 211 + 23)"* |
| 49-06 | **+18** | *"**+18 in 1 new file** — exactly this plan's cells"* (234 → 252) |
| 49-07 | **+21** | *"**12 files / 273 passed, EXIT 0** (baseline 11 / 252, +1 file +21 tests)"* |
| 49-08 | **+15** | *"**288 passed (288)** over **13 files**, **EXIT 0** (baseline 273 / 12 files; +15, +1 file)"* |

**`197 + 14 + 23 + 18 + 21 + 15 = 288`. MEASURED: 288 over 13 files. Closes exactly.**
Files: `8 + 5 = 13`. **Exact.**

**One stale-baseline note recorded rather than rounded.** Constraint 6 of this plan cites the
phase-entry baselines (base 5546, db 197) as if they were current; by wave 5 the tree was at 5652 and
273. 49-08's SUMMARY already flags this. The phase-entry figures are correct **as phase-entry
figures**, which is exactly what the reconciliation above uses them as.

---

## Deviations from Plan

### 1. [Rule 1 — Bug in this plan's own probe] The 201 body is wrapped in `{"data": …}`, so the first run's id extraction returned empty

- **Found during:** Task 1, the first probe run.
- **Issue:** the probe read `body.id`, but `createdResponse` wraps the payload — the id is at
  `body.data.id`. `NEW_ID` came back empty, so the GET became
  `GET /api/v1/organizations/` → **308** (a redirect to the collection) and the comparison had
  nothing to compare. **The 201 itself was perfect** and already carried the derived value, so the
  failure was purely in my extraction.
- **Fix:** `(b.data && b.data.id) || b.id` with a **hard failure** if neither resolves
  (`FATAL: no id in the 201 body`), so a silent empty id cannot produce a 308 that reads as a result
  again. Re-ran the whole probe; the transcript quoted above is the second run.
- **Cost, stated:** two ~1-second formula-definition windows instead of one, and one extra
  organization created — both swept by the teardown, with the counts asserted back at their pre-probe
  values.
- **Why it is worth recording:** a 308 with a body of `/api/v1/organizations` is exactly the shape
  that would have been mistaken for a pass by a status-only check. The probe asserts on **bodies**.

### 2. [Rule 1 — a prediction of mine that was wrong] The vacuity probe expected `collectFileFieldRefs` to carry an empty `storedName`

- **Found during:** Task 2, running (rather than reading) the extracted predicates.
- **Issue:** I predicted the module "does not judge values" and would emit a ref with
  `storedName: ""`. It refuses it — deliberately, because an empty name resolves to the **field
  directory itself**, which a deletion must never be handed (`collect-file-field-refs.ts:85`), and the
  sibling test covers it at `:198`.
- **Fix:** the case now asserts the refusal **with a one-character acceptance beside it**, so it
  discriminates rather than rejecting all short names. Recorded above rather than quietly corrected —
  every plan in this phase found a defect in its own plan, and the sign-off found one in its own audit.

### 3. [Deliberate departure] `nyquist_compliant` left `false`, and the ROADMAP's `**Plans**: TBD` was already replaced

- The plan asks to set `nyquist_compliant` "accordingly". Seven of the eight Sign-Off boxes tick; the
  eighth — *"each new/inverted gate observed RED"* — is **not tickable as an unqualified statement**,
  because five properties carry no red. Ticking `true` would upgrade five refusals the plans made on
  purpose, so it stays `false` **with a frontmatter note naming the five and stating that the sampling
  architecture itself is fully satisfied.** 47-VALIDATION set it `false` on the same basis.
- The plan also asks to replace `**Plans**: TBD` in the ROADMAP. **It was already replaced** by the
  orchestrator with "9 plans in 6 waves" plus the nine-file checklist; this plan checked the 49-09 box,
  moved the progress row to 9/9 Complete, ticked the phase checkbox, and appended the outcome paragraph.

### 4. [Deliberate departure] The optional session-cookie SC-1 probe was NOT attempted

- Reasoned rather than tried, and the reasoning is recorded in full above: without a real blob on the
  live deployment's disk the foreign 404 comes from `existsSync` and not from the guard — a gate that
  cannot fail — and planting one is outside the plan's own permitted-write envelope (constraint 2
  enumerates two users, two keys, one definition, and the organization the probe creates). Spending
  the one permitted attempt on a probe that could not discriminate would have been worse than not
  spending it.

### 5. [Rule 2 — Missing critical coverage] The one-hop-out audit, and SEC-49-D

- **Found during:** Task 2.
- **Issue:** the plan's register covers the controls each plan owed. Phase 48's sign-off did exactly
  that and missed five criticals one call-chain hop outside its declared surface. Auditing only the
  declared surface reproduces that failure by construction.
- **Fix:** enumerated every caller of the phase's new helpers and every consumer of the upload tree,
  and inspected the neighbours. Result: SC-2's neighbourhood is **clean by enumeration** (the four
  purge mutations are the only hard deletes of a CRM row; there is no fifth path); DATA-02's PUT
  neighbour was already recorded by 49-03; and the upload route yielded **SEC-49-D**, reproduced by
  execution.
- **Files modified:** `deferred-items.md` (DEF-49-06), `BACKLOG.md` (SEC-49-D).

### 6. [Rule 2 — Missing critical functionality] Two documents outside the phase still asserted the retired "indefinitely" claim

- **Found during:** Task 2, the polarity check.
- **Issue:** the plan asks whether the phrase appears "anywhere in this phase's output". It does not.
  But `REQUIREMENTS.md`'s SEC-04 note and `BACKLOG.md`'s CR-01 consequence 3 — **both documents this
  sign-off edits, to mark SEC-04 complete and to close CR-01** — still asserted it. Closing a
  requirement while leaving its own text carrying a claim the phase measured as false would put the
  register and reality in disagreement at the exact moment the register is being signed.
- **Fix:** both corrected to 90 days, with the correction stated as a correction.

---

## Issues Encountered

- **`rtk` output mangling**, as recorded in project memory. **No count in this document comes from a
  pipe:** every count is from `node` over comment-stripped source or from direct SQL, cleanliness is
  from `git diff --exit-code` (never `git status --porcelain`, which renders as the bare token `ok`),
  vitest was invoked as `./node_modules/.bin/vitest`, and every command whose exact output matters
  went through `rtk proxy`. Files were written with Write/Edit, never `sed`/`head` into a file.
- **`gsd-sdk query state.advance-plan` errored** with *"Cannot parse Current Plan or Total Plans in
  Phase from STATE.md"* — that file carries no such fields. `state.update-progress` and
  `roadmap.update-plan-progress` both worked. `state.record-metric` and `state.record-session`
  rejected their arguments / found no session fields, so the metric row and the position block were
  written directly.
- **`roadmap.update-plan-progress` reverted the Phase 49 progress row to "In Progress"** on its first
  run, correctly — it counts SUMMARY files on disk and this one did not exist yet. Re-run after the
  SUMMARY landed.
- **`docker compose exec` must be run from the main repo path** — noted by 49-07 and true here.
- The container rebuild took ~83 s to export and unpack the image; `up -d --build` recreated
  `pipelite-app-1` and left postgres and mailhog running.

---

## Known Stubs

None. This plan ships no code. The one file it created under `src/` was a temporary vacuity probe,
deleted before the gate was measured — which is what keeps the base-suite delta at +0 and the
reconciliation above honest.

## Threat Flags

None. This plan adds no endpoint, no auth path, no file-access pattern and no schema change, and
`git diff --exit-code` is clean over the whole tree.

**One PRE-EXISTING surface finding is recorded rather than introduced: `SEC-49-D`**, the upload
route's missing ownership check and missing path containment. It predates this phase and is unchanged
by it.

| Threat ID | Mitigation status |
|---|---|
| T-49-09-01 (measurements against a stale image) | `up -d --build`; bound image `83003bf6eb2e…` → `66efd8556ac1…`, **compared, not assumed** |
| T-49-09-02 (the temporary formula definition) | created last, hard-deleted FIRST in its own EXIT trap; `type='formula'` asserted back at **0** and the table at **169, not 170**; window **~1 s per run**, recorded |
| T-49-09-03 (the probe key surviving) | prefixed rows deleted in FK order; **0** left in five tables; the plaintext file shredded and its absence asserted |
| T-49-09-04 (mutating real data) | only prefixed fixture rows created; `organizations` 46054 → 46054, `users` 10, `api_keys` 8, `audit_log` 214; **0 descriptors across 188,619 rows**, identical to 49-01 |
| T-49-09-05 (a control claimed without a quoted failure) | 41 rows, each citing a transcript; **5 reported NOT DELIVERED**; three re-falsified fresh |
| T-49-09-06 (a criterion signed on a guard) | three guards named as guards and excluded from every verdict |
| T-49-09-07 (an S3 claim) | 25 S3 sentences read for POLARITY; all 25 refusals; scope limit carried in SC-1's own verdict text |
| T-49-09-08 ("recoverable indefinitely") | 22 occurrences, all 22 refusals; the measured 90 days stated in SC-1's verdict; **two documents outside the phase corrected** |
| T-49-09-09 (closing DEF-48-05 by implication) | six references, all six non-absorptions; restated as OPEN with its owner and full description in `STATE.md`'s carried-forward table |
| T-49-09-10 (a credential in a transcript) | only row ids and display prefixes recorded; grep over every retained artifact returns nothing |
| T-49-09-11 (a vacuous gate shipping) | four tests over 13 artifacts / 800 assertions; test 1 RUN on 20 novel fixtures; a fresh deny-everything ablation measuring 9 of 52; **result recorded: none found**, with one floor named as brittle |
| T-49-09-12 (a concurrent db-test executor) | alone in wave 6; `dedup-db-test-setup.sh` run once before the falsifications and again by `test:db` |

---

## Next Phase Readiness

**Phase 49 is complete and ready for `/gsd:verify-phase 49`.**

- **The new baselines, so the next phase does not inherit a stale number:** base **5659 passed / 32
  skipped over 184 files passed + 2 skipped**; RSC **8/8**; db project **288 passed over 13 files,
  EXIT 0**. `REQUIREMENTS.md` marks SEC-04, DATA-01 and DATA-02 **Complete**.
- **`npm run test:db`'s exit code is usable again** — DEF-48-01 closed in `37202ce`. The plans in this
  phase still carry the stale "never gate on its exit code" constraint; 49-07 and 49-08 both flag it.
- **Four limitations must travel with the verdicts and must not be upgraded:** SC-1 is local-storage
  only (SEC-49-A); the tombstone retains 90 days; nothing discriminates the canonical read from the
  rejected merge (DATA-49-A); DEF-48-05 / SEC-48-C is not closed here.
- **New at sign-off: SEC-49-D**, the upload route. It is on the same surface SC-1 protects, it is live
  under the deployed `local` configuration, and it has no test.
- **Carried forward with owners**, restated in full in `STATE.md`: the unpushed commits and Phase 46's
  GAP 1 + D-47-12-A (one operator push closes both, and SEC-05 with them), the 47-08 split and the
  47-08 human render (now owed against image `66efd8556ac1…`, which has moved twice since that item
  was written), D-47-06-A, **SEC-47-A** (`src/lib/email/client.ts:20`'s unconditional
  `tls: { rejectUnauthorized: false }` — still the largest single exposure in the backlog),
  DEF-48-02, DEF-48-05 / SEC-48-C, DEF-48-06 / IMP-48-A, DEF-48-08 / SEC-48-F, SEC-48-A, SEC-48-D's
  relay half, TS-48-A, DOC-48-01, IN-06, WR-02, SEC-49-A/B/C/D, DATA-49-A and DEF-49-01/02/03/05.

---

## Self-Check: PASSED

Files claimed, verified on disk:

- `.planning/phases/49-mutation-layer-truth-after-commit/49-09-SUMMARY.md` — FOUND, **1,224 lines**
  (plan floor 180)
- `.planning/phases/49-mutation-layer-truth-after-commit/49-VALIDATION.md` — FOUND, 315 lines,
  Sign-Off filled in from observation with two boxes deliberately unticked
- `.planning/phases/49-mutation-layer-truth-after-commit/deferred-items.md` — FOUND, 203 lines,
  carrying DEF-49-06
- `.planning/ROADMAP.md` — FOUND; `49-01-PLAN.md` present, `**Plans**: TBD` absent, the 49-09 box
  checked, the progress row **9/9 Complete**, the phase checkbox ticked, and the outcome paragraph
  appended
- `.planning/STATE.md` — FOUND; new baselines recorded, the Phase 49 block written, the full
  carried-forward table added with **DEF-48-05 / SEC-48-C explicitly still open**
- `.planning/BACKLOG.md` — FOUND, 2,141 lines; CR-01, FORM-01 and 999.23 closed with citations,
  SEC-49-A confirmed open with this phase's measurements, SEC-49-D added
- `.planning/REQUIREMENTS.md` — FOUND; SEC-04, DATA-01 and DATA-02 re-read as `[x]` and their
  traceability rows as **Complete**, and SEC-04's false "indefinitely" note corrected

Commits claimed, verified in `git log --oneline --all`: **`4009739`** (Task 1), **`e48f955`**
(Task 2).

`git diff --exit-code -- src/` exits **0**, after all four ablations and the deny-everything vacuity
ablation were restored and after the temporary vacuity probe file was deleted. `git diff --exit-code`
over the whole tree exited **0** at that same moment and reports exactly the four planning documents
committed by this plan's final commit and nothing else (`git diff --name-only`:
`BACKLOG.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`) — stated precisely rather than as a bare
"tree clean". No untracked file outside `.planning/`.
`git diff --diff-filter=D` reports **no deleted files** across this plan's commits.

**Every planning file was force-added INDIVIDUALLY** (`git add -f <path>`) — `.planning/` is
gitignored-but-tracked and a directory add fails.

---
*Phase: 49-mutation-layer-truth-after-commit*
*Completed: 2026-08-26*
