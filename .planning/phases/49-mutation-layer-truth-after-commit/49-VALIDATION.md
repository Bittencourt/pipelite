---
phase: 49
slug: mutation-layer-truth-after-commit
status: executed
nyquist_compliant: false
wave_0_complete: true
created: 2026-08-26
signed_off: 2026-08-26 by 49-09
---

> **`nyquist_compliant` is deliberately `false`, and the reason is a single specific box — not a
> sampling shortfall.** The sampling architecture is fully satisfied: every task carried an
> `<automated>` verify (20 blocks across nine plans), no three consecutive tasks lacked one, all
> seven Wave 0 artifacts exist, 61 `vitest` invocations were scanned and **zero** carry a watch-mode
> flag, and wave-level feedback stayed under 150 s. What is NOT satisfiable as an unqualified
> statement is *"each new or inverted gate observed RED"*: **five properties in this phase carry no
> red observation, each named by the plan that owns it and each unreddenable for a structural
> reason** — see the Sign-Off block. Setting this field `true` would upgrade five refusals the plans
> made on purpose. It is `false` so that the exceptions stay visible.

# Phase 49 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `49-RESEARCH.md` § *Validation Architecture*. Every row below is a claim about the
> repository as measured on 2026-08-26 — **re-measure the three zero-counts at plan time** (see
> *Preconditions* below), because three of the four criteria are proven vacuous if they are not zero.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest, **three** projects |
| **Config — base** (unit; the one CI runs) | `vitest.config.ts` — **excludes** `*.db.test.*` and `*.rsc.test.*` |
| **Config — RSC** | `vitest.rsc.config.ts` |
| **Config — live DB** (opt-in only) | `vitest.db.config.ts` — `include: ['src/**/*.db.test.?(c|m)[jt]s?(x)']`, `fileParallelism: false`, `sequence.concurrent: false`, 60 s timeouts |
| **Quick run command** | `npx vitest run <path>` |
| **Full suite command** | `npm test` (= `vitest run && vitest run --config vitest.rsc.config.ts`) |
| **Live-DB suite** | `npm run test:db` (runs `scripts/dedup-db-test-setup.sh` first) |
| **Estimated runtime** | base ~145 s; RSC ~2 s; a single db file ~5-20 s |

**Two hazards that are not optional reading:**

- **DEF-48-01 — CLOSED 2026-08-26** (commit `37202ce`). It used to exit NON-ZERO on a green suite;
  the root cause was found by plan 49-06 while proving SC-1. `npm run test:db` now exits **0**
  (11 files / 252 tests). Reading the pass counts remains good practice, but the exit code is no
  longer a false red.
- **Lint: gate on ERRORS, never on the warning total.** It differs between the main tree and a
  worktree because of `.planning`'s untracked files (124 vs 120-122 observed across Phase 48).

**Baseline to beat, measured on `195c7c4` at the close of Phase 48:**
`npm test` **5546 passed / 32 skipped** over 180 files (+2 skipped); RSC **8/8**; `tsc --noEmit`
exit 0; eslint **0 errors**; db project **197 passed**.

---

## Sampling Rate

- **After every task commit:** the one or two files the task touched — `npx vitest run <paths>`.
- **After every plan wave:** `npm test` (base + RSC) and `npx tsc --noEmit`; plus
  `npm run test:db` for any wave containing a `*.db.test.ts` change — **read the counts, not the
  exit code**.
- **Before sign-off:** full suite green at ≥ 5546 passed with 0 failures.
- **Max feedback latency:** ~20 s for a task-level run; ~150 s for a wave-level run.

---

## Per-Task Verification Map

Task ids are not yet assigned — the user delegated plan shape to `gsd-planner`, so this map is keyed
by criterion. The planner must carry each row onto a task and preserve the *type* column: the two
`unit` containment rows exist specifically so SC-1 does not depend solely on a live-DB file.

| Criterion | Behaviour that must be TRUE | Test Type | Automated Command | File Exists | Status |
|---|---|---|---|---|---|
| SEC-04 / SC-1 | `GET` a file belonging to a record the caller does not own → **404, zero bytes** | live-DB (`vi.mock("@/auth")` + real `db`) | `npx vitest run --config vitest.db.config.ts src/app/api/files/__tests__/files-route-ownership.db.test.ts` | ✅ created | ✅ green |
| SEC-04 / SC-1 | `DELETE` the same → **404, and the blob is still on disk afterwards** | live-DB, same file | same | ✅ created | ✅ green |
| SEC-04 / SC-1 | `filename = "../../../etc/passwd"` → 404, and `readFile` never called outside `UPLOAD_DIR` | **unit**, handler invoked with a crafted `params` promise | `npx vitest run src/app/api/files/__tests__/route-containment.test.ts` | ✅ created | ✅ green |
| SEC-04 / SC-1 | a `filename` **not present in the record's JSONB** → 404 (this is the load-bearing check, not the prefix test) | unit, same file | same | ✅ created | ✅ green |
| SEC-04 / SC-2 | after a purge: blob absent from disk **and** its URL serves nothing | live-DB | `npx vitest run --config vitest.db.config.ts src/lib/trash/purge-blobs.db.test.ts` | ✅ created | ✅ green |
| SEC-04 / SC-2 | **injected** storage failure → purge still **COMMITTED**, mismatch logged with `{expected, deleted}` | live-DB, same file | same | ✅ created | ✅ green |
| SEC-04 / SC-2 | `collectFileFieldRefs` on: `null`, `{}`, a non-array value, an array of non-objects, a well-formed array | **unit**, pure | `npx vitest run src/lib/trash/collect-file-field-refs.test.ts` | ✅ created | ✅ green |
| DATA-01 / SC-3 | merging two records whose formula inputs disagree, **taking the loser's input**, leaves the survivor's stored value equal to a **fresh computation** | live-DB | `npx vitest run --config vitest.db.config.ts src/lib/mutations/dedup.db.test.ts` (extend) or a sibling `dedup-formula.db.test.ts` | ✅ new sibling `dedup-formula.db.test.ts` | ✅ green |
| DATA-01 / SC-3 | the call is made **post-commit**, with a bare-name `changedFields` and `cascade: false` | **unit**, mocked recalc | `npx vitest run src/lib/mutations/dedup.test.ts` (extend) | ✅ extended (`dedup.test.ts`, 25 → 32 cells) | ✅ green |
| DATA-01 / SC-3 | a **rejected** recalculation does not fail the merge (D-05) | unit, same | same | ✅ extended (`dedup.test.ts`, 25 → 32 cells) | ✅ green |
| DATA-02 / SC-4 | 201 `custom_fields` **==** a subsequent `GET`'s `custom_fields`, **all four entities**, against a purpose-built formula field | live-DB, `mintApiKey` over the real `withApiAuth` | `npx vitest run --config vitest.db.config.ts src/app/api/v1/__tests__/create-response-canonical.db.test.ts` | ✅ created | ✅ green |
| DATA-02 / SC-4 | 201 carries the **post**-recalc blob (deals) | unit — **suite-breaker B1, inverted** | `npx vitest run src/app/api/v1/deals/__tests__/formula-recalc.test.ts` | ✅ inverted (B1) | ✅ green |
| DATA-02 / SC-4 | 201 carries the **post**-recalc blob (people) | unit — **suite-breaker B2, inverted** | `npx vitest run src/app/api/v1/people/__tests__/formula-recalc.test.ts` | ✅ inverted (B2) | ✅ green |
| DATA-02 / SC-4 | organizations `POST` 201 shape | unit | `npx vitest run src/app/api/v1/organizations/__tests__/route.test.ts` | ✅ created (11 cells, the route had none) | ✅ green |
| DATA-02 / SC-4 | activities `POST` still 201 with the re-read in place | unit — **suite-breaker C1** | `npx vitest run src/app/api/v1/activities/__tests__/route.test.ts` | ✅ amended (C1 — **a mechanical guard, green before the fix**) | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Preconditions that must be RE-MEASURED at plan time

Three of the four criteria are provable only if these are still zero. If any is non-zero, the
corresponding proof must be re-designed, not re-run.

- [x] `select count(*) from custom_field_definitions where type='formula' and deleted_at is null` → **expected 0** — **RE-MEASURED 0** (plan 49-01 Task 1, 2026-08-26 08:34 -03)
- [x] `select count(*) from custom_field_definitions where type='file' and deleted_at is null` → **expected 0** — **RE-MEASURED 0** (same run)
- [x] the count of records carrying a stored file descriptor in `customFields` → **expected 0** — **RE-MEASURED 0** on both the `%storedName%` and the `%publicUrl%` probe, across all four CRM tables (188,619 rows)

Query with `docker compose exec -T postgres psql -U pipelite -d pipelite -c "<sql>"`.
Note the column is **`type`**, not `field_type`.

### RE-MEASUREMENT of 2026-08-26, plan 49-01 Task 1 — verbatim

The premise held. **No proof in this phase needs re-designing**; 49-05, 49-07 and 49-08 may proceed
on the measured premise, and each of them must manufacture its own subject.

**(a) The full live type distribution** — `formula` and `file` are visible as an *absence*, not
asserted as a zero. Total **169** live, matching research exactly:

```
     type      | count
---------------+-------
 text          |    62
 multi_select  |    56
 single_select |    28
 number        |    12
 date          |    11
(5 rows)

 total_live | formula_live | file_live
------------+--------------+-----------
        169 |            0 |         0
```

**(b) + (c) The descriptor probes, including the A4 follow-up research named and did not run.**
A4 warned that a descriptor written *without* a `storedName` key would evade probe (b). Both probes
were run side by side; both are zero, so **A4 is resolved as measured, not assumed** — there is no
hidden `publicUrl`-only descriptor shape, and SC-2 still has no live subject:

```
      tbl      | storedname | publicurl | rows_total
---------------+------------+-----------+------------
 people        |          0 |         0 |      38348
 deals         |          0 |         0 |      25195
 activities    |          0 |         0 |      79022
 organizations |          0 |         0 |      46054
(4 rows)
```

**(d) Retention settings, measured in this phase's own record** rather than cited from the ROADMAP
amendment. `audit.retention_days = 90` confirms the corrected figure; the "indefinitely" claim stays
retired:

```
         key          | value
----------------------+-------
 audit.retention_days | 90
 trash.retention_days | 30
(2 rows)
```

**(e) Storage configuration.** `printenv FILE_STORAGE` exits **1** — the variable is unset, which
means `'local'`, so SC-1's local-only scope is the scope that matters here. `UPLOAD_DIR=/app/uploads`,
and that directory is **empty** (`total 8`, only `.` and `..`), so nothing on disk pre-exists to
confuse an SC-2 fixture.

### The storage-failure injection seam — EXECUTED, not reasoned

`49-RESEARCH.md` § Assumptions Log **A1** was flagged MEDIUM: `unlink` on a directory raising
`EISDIR` "regardless of uid" was reasoned from POSIX and **not executed**. It has now been executed.

**Research option (A) is LIVE, and its uid-independence claim holds.** Observed verbatim:

```
SEAM LIVE: code=EISDIR errno=-21 syscall=unlink msg=EISDIR: illegal operation on a directory, unlink '/tmp/seam-Dt6hCu/blob.pdf' uid=1000
SEAM LIVE: code=EISDIR errno=-21 syscall=unlink uid=0
```

uid **1000** is the uid the vitest process actually runs as on the host
(`node -e process.getuid()` → 1000, `vitest/4.1.11 node-v24.13.1`). uid **0** was exercised inside the
container to test the claim at the one uid that breaks the alternative. **`errno=-21` is `EISDIR` and
the prediction is confirmed at both uids** — so no fallback is required and plan **49-07 must use
research option (A)**, not (C). The S3 branch remains unreachable behaviourally (SEC-49-A).

**Negative control: research option (B) is DEAD as root, exactly as its caveat warned.** Executed so
that (A)-over-(B) is a measurement rather than a preference:

```
OPTION B DEAD: unlink RESOLVED despite chmod 0500 parent, uid=0
```

A `chmod 0500` seam would therefore have produced a *successful* deletion inside a test named for a
failure path — a gate that cannot fail. **49-07 must not use option (B).**

**Why this is a validation concern and not trivia:** with zero `formula` definitions, an SC-4 test
written against live definitions is green **before and after** the fix — `recalculateFormulas` only
writes when `inScope.length > 0`. With zero `file` definitions, an SC-2 purge test finds no blobs and
passes on an empty set. This is the SC-3 trap the ROADMAP names, and it applies to SC-2 and SC-4,
which the ROADMAP does not say.

**Consequence for every count assertion in this phase:** carry a **named-integer floor**, so
"the correct rows" cannot be satisfied by zero rows.

---

## Wave 0 Requirements

- [ ] `src/lib/trash/collect-file-field-refs.test.ts` — pure-function coverage, SEC-04/SC-2
- [ ] `src/app/api/files/__tests__/route-containment.test.ts` — unit containment + JSONB match, SEC-04/SC-1
- [ ] `src/app/api/files/__tests__/files-route-ownership.db.test.ts` — SEC-04/SC-1 behavioural
- [ ] `src/lib/trash/purge-blobs.db.test.ts` — SEC-04/SC-2 behavioural + injected failure
- [ ] `src/app/api/v1/__tests__/create-response-canonical.db.test.ts` — DATA-02/SC-4, four entities
- [ ] `src/app/api/v1/organizations/__tests__/route.test.ts` — **the collection route has no test file;
      three of the four POSTs have coverage and that asymmetry is how a four-entity fix half-ships**
- [ ] a **fixture helper** that creates a `custom_field_definitions` row (`type: 'formula'` with a
      `config.expression`, and `type: 'file'`) under the suite's id/name prefix, plus its teardown —
      **needed by three of the four criteria**. `dedup.db.test.ts`'s parity `afterAll` must be taught
      about that table, or it will report a leak it did not cause.
- [ ] no framework install needed

---

## Wave-scheduling constraint (hard)

`scripts/dedup-db-test-setup.sh` **drops and rebuilds every schema** in `pipelite_dedup_test`, so
**two plans that each own a `*.db.test.ts` file must never share a wave** — one plan's setup wipes the
other's fixtures mid-run. This phase creates **four** new db-test files and extends a fifth, which
makes it the likeliest phase in the milestone to trip this. Learned in Phase 48 (wave 3 escaped it
only because 48-09 touched no db test).

---

## Manual-Only Verifications

| Behaviour | Requirement | Why Manual | Test Instructions | RESULT (49-09, 2026-08-26) |
|---|---|---|---|---|
| Container serves the fixed routes | SEC-04 | `docker compose restart` runs the OLD image; a "Started" line is not proof of freshness | `docker compose up -d --build`, then **assert the image id CHANGED** (`docker inspect pipelite-app-1 --format '{{.Image}}'`), then `/api/health` 200 with `db.ok` true and 10/10 processors | **DONE.** Bound image `sha256:83003bf6eb2e…` → **`sha256:66efd8556ac1…`** (changed). `/api/health` **200**, `db.ok: true`, `latencyMs: 1`, **10/10** processors alive (counted with `node`, not read off the JSON). |
| DATA-02 over real HTTP | DATA-02 | The unit and db proofs drive handlers in-process; only a real request exercises `withApiAuth` + routing + the built image together | `POST /api/v1/organizations` then `GET /api/v1/organizations/{id}` with the same Bearer key, over a manufactured `type='formula'` definition; compare the two `custom_fields` **programmatically** | **DONE.** POST **201**, GET **200**, the two `custom_fields` objects deeply equal, the derived key present by name in both at the value computed in the checker from the name that was SENT, and the discriminator (201 ≠ the object the request sent) asserted. Foreign key B → **404**. 12 of 12 assertions PASS. |
| The S3 read path | SEC-04 / **out of scope** | Nothing reads through the route under `FILE_STORAGE=s3` (`upload/route.ts:89`); recorded as **SEC-49-A** and SC-1 is amended to local-storage only | Not verified in this phase. A plan must not claim it. | **NOT VERIFIED, by design.** `FILE_STORAGE` re-confirmed unset in the rebuilt container (`printenv` exit 1 → `'local'`), `UPLOAD_DIR=/app/uploads`, and that directory is still **empty** (`total 8`, only `.` and `..`). So the deployment under test is the `local` configuration every proof in this phase assumes. No S3 claim is made anywhere. |
| An HTTP-level SC-1 probe | SEC-04 / **not achievable** | The file route authenticates with `auth()` by CONTEXT.md decision and there is no `/api/v1` file route, so an HTTP probe needs a browser session cookie | Not attempted — see the note below | **NOT DONE, and not attempted.** The unauthenticated `GET` and `DELETE` were curled and both answered **401** with `{"error":"Unauthorized"}` — **labelled a SMOKE CHECK, not a proof: it was 401 before the fix too.** A real HTTP SC-1 probe would additionally need a blob on the live deployment's disk, which is outside the plan's permitted-write envelope; without one the foreign 404 would come from `existsSync` rather than from the guard — the exact gate-that-cannot-fail 49-06 found in its own plan. **SC-1's behavioural proof is plan 49-06's**, at handler level against real PostgreSQL and a real filesystem. |

---

## Validation Sign-Off

Filled in from observation by plan 49-09, 2026-08-26. **No box is ticked whose evidence is missing.**

- [x] **All tasks have an `<automated>` verify or a Wave 0 dependency** — 20 `<automated>` blocks
      across the nine plans. One correction is on the record rather than glossed: 49-03 found that
      the `<verify>` blocks `cd`-ed to the MAIN repo, which would have produced a green transcript
      about a tree containing none of the work. Fixed across all nine plans in `34b2233` (20
      occurrences); **re-measured at sign-off, `cd /home/pedro/programming/pipelite` now appears in
      0 of 9 plans.**
- [x] **Sampling continuity: no 3 consecutive tasks without an automated verify** — every task in
      every plan carries one.
- [x] **Wave 0 covers all MISSING references above** — all seven artifacts exist:
      `collect-file-field-refs.test.ts` (49-02), `route-containment.test.ts` (49-04),
      `files-route-ownership.db.test.ts` (49-06), `purge-blobs.db.test.ts` (49-07),
      `create-response-canonical.db.test.ts` (49-05),
      `organizations/__tests__/route.test.ts` (49-03), and the fixture helper
      `src/lib/__tests__/custom-field-definition-fixture.ts` (49-01). DATA-01 took the sibling
      option — `dedup-formula.db.test.ts` (49-08) — rather than extending `dedup.db.test.ts`, and
      that file was left untouched and green, so the parity `afterAll` never had to be taught about
      `custom_field_definitions`.
- [x] **No watch-mode flags** — 61 `vitest` invocations scanned across the nine plans with `node`;
      **0** carry `--watch` or `-w`.
- [x] **The three zero-counts re-measured, and every count assertion carries a named-integer floor**
      — re-measured twice: by 49-01 (169 live / 0 formula / 0 file; 0 descriptors on both the
      `%storedName%` and `%publicUrl%` probes across 188,619 rows) and **again at sign-off, with
      identical numbers**. Named-integer floors are present in every proof file
      (`ANCHOR_REF_COUNT`, `SEEDED_BLOB_TOTAL = 9`, `FORMULA_DEFINITIONS_TOTAL = 4`,
      `MIN_FORMULA_DEFINITIONS = 1`, `SABOTAGED_REF_COUNT = 1`, …) and two of them were observed
      firing (49-01 R4, 49-08 A5/A6).
- [ ] **Each new/inverted gate observed RED before being trusted, with the red recorded verbatim** —
      **NOT tickable as an unqualified statement, and that is the honest answer.** Every gate that
      *can* be reddened has a verbatim red (37 recorded ablations/controls across eight plans). Five
      properties carry NO red, each named by its owning plan and each unreddenable for a structural
      reason rather than an unrun experiment:
      1. **the rejected in-process merge** (49-05 ablation 5, and 5b with a dead canonical read) —
         green by construction; control 5c proves the sabotage was live. **DATA-49-A.**
      2. **a create's canonical-read owner term** (49-05 ablation 6a) — satisfied by construction on
         every reachable execution. **DEF-49-03.**
      3. **the inner `catch`'s never-rethrow** in the four purge blocks (49-07 A3a) — unreachable,
         because `deleteEntityFiles` never rejects. A3b/A3c cover the reachable forms.
      4. **the survivor-first ORDERING, behaviourally** (49-08 A3) — the db file is green under a
         reorder; two unit cells hold it. **DEF-49-05.**
      5. **`updated_at` not being bumped by a derived refresh** (49-08 T-49-08-07) — unablatable
         without editing `formula-recalc.ts`, which was out of scope. (Plus 49-08's six
         isolation-guard cells, whose red is inherited from `dedup.db.test.ts` and not recorded
         here.)
- [x] **Feedback latency < 150 s at wave level** — a single db file runs in 5-20 s; the base project
      at sign-off in ~145 s.
- [ ] **`nyquist_compliant: true` set in frontmatter** — deliberately left `false`; see the note
      under the frontmatter. The one unticked substantive box above is the reason.

**Approval:** signed off by 49-09 on 2026-08-26, with the two unticked boxes stated rather than
softened. Evidence: `49-09-SUMMARY.md`.

---

## Path convention correction (pattern mapper, 2026-08-26)

The paths above were corrected after the pattern mapper found that **`src/lib/trash/` has no
`__tests__/` directory** — every test in that module is a sibling `*.test.ts` (`prune.test.ts`,
`dispatch.test.ts`, `present.test.ts`, `queries.test.ts`, `settings.test.ts`, `entity-types.test.ts`).
Writing `src/lib/trash/__tests__/…` would have introduced a second convention inside one module.
Placement does not affect collection — `vitest.db.config.ts` globs `src/**` — so this is a style
choice, and the house style is siblings.

`src/app/api/files/` has **no test file and no test directory at all**; it contains only
`[entityId]/`. Either placement is new there, so `__tests__/` is retained for the two file-route
tests to match the `src/app/api/v1/**/__tests__/` convention next door.

**Suite-breaker C1 is worse than recorded above.**
`src/app/api/v1/activities/__tests__/route.test.ts:24-37` mocks `@/db` with
`query.activities: { findMany: vi.fn() }` — there is **no `findFirst` key at all**, so the canonical
re-read raises a `TypeError` rather than yielding `serializeActivity(undefined)`. The `mockDb` type
alias at `:62-71` must gain the key in the same change, or `tsc --noEmit` goes red.
