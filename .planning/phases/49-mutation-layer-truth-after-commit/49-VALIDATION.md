---
phase: 49
slug: mutation-layer-truth-after-commit
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-26
---

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

- **DEF-48-01 — `npm run test:db` exits NON-ZERO on a GREEN suite** (`views/queries.db.test.ts`'s
  `afterAll`). **Never gate on its exit code. Read the pass counts.**
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
| SEC-04 / SC-1 | `GET` a file belonging to a record the caller does not own → **404, zero bytes** | live-DB (`vi.mock("@/auth")` + real `db`) | `npx vitest run --config vitest.db.config.ts src/app/api/files/__tests__/files-route-ownership.db.test.ts` | ❌ W0 | ⬜ pending |
| SEC-04 / SC-1 | `DELETE` the same → **404, and the blob is still on disk afterwards** | live-DB, same file | same | ❌ W0 | ⬜ pending |
| SEC-04 / SC-1 | `filename = "../../../etc/passwd"` → 404, and `readFile` never called outside `UPLOAD_DIR` | **unit**, handler invoked with a crafted `params` promise | `npx vitest run src/app/api/files/__tests__/route-containment.test.ts` | ❌ W0 | ⬜ pending |
| SEC-04 / SC-1 | a `filename` **not present in the record's JSONB** → 404 (this is the load-bearing check, not the prefix test) | unit, same file | same | ❌ W0 | ⬜ pending |
| SEC-04 / SC-2 | after a purge: blob absent from disk **and** its URL serves nothing | live-DB | `npx vitest run --config vitest.db.config.ts src/lib/trash/__tests__/purge-blobs.db.test.ts` | ❌ W0 | ⬜ pending |
| SEC-04 / SC-2 | **injected** storage failure → purge still **COMMITTED**, mismatch logged with `{expected, deleted}` | live-DB, same file | same | ❌ W0 | ⬜ pending |
| SEC-04 / SC-2 | `collectFileFieldRefs` on: `null`, `{}`, a non-array value, an array of non-objects, a well-formed array | **unit**, pure | `npx vitest run src/lib/trash/__tests__/collect-file-field-refs.test.ts` | ❌ W0 | ⬜ pending |
| DATA-01 / SC-3 | merging two records whose formula inputs disagree, **taking the loser's input**, leaves the survivor's stored value equal to a **fresh computation** | live-DB | `npx vitest run --config vitest.db.config.ts src/lib/mutations/dedup.db.test.ts` (extend) or a sibling `dedup-formula.db.test.ts` | ⚠ extend / ❌ new | ⬜ pending |
| DATA-01 / SC-3 | the call is made **post-commit**, with a bare-name `changedFields` and `cascade: false` | **unit**, mocked recalc | `npx vitest run src/lib/mutations/dedup.test.ts` (extend) | ⚠ extend | ⬜ pending |
| DATA-01 / SC-3 | a **rejected** recalculation does not fail the merge (D-05) | unit, same | same | ⚠ extend | ⬜ pending |
| DATA-02 / SC-4 | 201 `custom_fields` **==** a subsequent `GET`'s `custom_fields`, **all four entities**, against a purpose-built formula field | live-DB, `mintApiKey` over the real `withApiAuth` | `npx vitest run --config vitest.db.config.ts src/app/api/v1/__tests__/create-response-canonical.db.test.ts` | ❌ W0 | ⬜ pending |
| DATA-02 / SC-4 | 201 carries the **post**-recalc blob (deals) | unit — **suite-breaker B1, inverted** | `npx vitest run src/app/api/v1/deals/__tests__/formula-recalc.test.ts` | ✅ amend `:360-368` | ⬜ pending |
| DATA-02 / SC-4 | 201 carries the **post**-recalc blob (people) | unit — **suite-breaker B2, inverted** | `npx vitest run src/app/api/v1/people/__tests__/formula-recalc.test.ts` | ✅ amend `:347-355` | ⬜ pending |
| DATA-02 / SC-4 | organizations `POST` 201 shape | unit | `npx vitest run src/app/api/v1/organizations/__tests__/route.test.ts` | ❌ **W0 — the collection route has NO test file at all** | ⬜ pending |
| DATA-02 / SC-4 | activities `POST` still 201 with the re-read in place | unit — **suite-breaker C1** | `npx vitest run src/app/api/v1/activities/__tests__/route.test.ts` | ✅ amend `:336`, `:347` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Preconditions that must be RE-MEASURED at plan time

Three of the four criteria are provable only if these are still zero. If any is non-zero, the
corresponding proof must be re-designed, not re-run.

- [ ] `select count(*) from custom_field_definitions where type='formula' and deleted_at is null` → **expected 0** (measured 0)
- [ ] `select count(*) from custom_field_definitions where type='file' and deleted_at is null` → **expected 0** (measured 0)
- [ ] the count of records carrying a stored file descriptor in `customFields` → **expected 0**

Query with `docker compose exec -T postgres psql -U pipelite -d pipelite -c "<sql>"`.
Note the column is **`type`**, not `field_type`.

**Why this is a validation concern and not trivia:** with zero `formula` definitions, an SC-4 test
written against live definitions is green **before and after** the fix — `recalculateFormulas` only
writes when `inScope.length > 0`. With zero `file` definitions, an SC-2 purge test finds no blobs and
passes on an empty set. This is the SC-3 trap the ROADMAP names, and it applies to SC-2 and SC-4,
which the ROADMAP does not say.

**Consequence for every count assertion in this phase:** carry a **named-integer floor**, so
"the correct rows" cannot be satisfied by zero rows.

---

## Wave 0 Requirements

- [ ] `src/lib/trash/__tests__/collect-file-field-refs.test.ts` — pure-function coverage, SEC-04/SC-2
- [ ] `src/app/api/files/__tests__/route-containment.test.ts` — unit containment + JSONB match, SEC-04/SC-1
- [ ] `src/app/api/files/__tests__/files-route-ownership.db.test.ts` — SEC-04/SC-1 behavioural
- [ ] `src/lib/trash/__tests__/purge-blobs.db.test.ts` — SEC-04/SC-2 behavioural + injected failure
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

| Behaviour | Requirement | Why Manual | Test Instructions |
|---|---|---|---|
| Container serves the fixed routes | SEC-04 | `docker compose restart` runs the OLD image; a "Started" line is not proof of freshness | `docker compose up -d --build`, then **assert the image id CHANGED** (`docker inspect pipelite-app-1 --format '{{.Image}}'`), then `/api/health` 200 with `db.ok` true and 10/10 processors |
| The S3 read path | SEC-04 / **out of scope** | Nothing reads through the route under `FILE_STORAGE=s3` (`upload/route.ts:89`); recorded as **SEC-49-A** and SC-1 is amended to local-storage only | Not verified in this phase. A plan must not claim it. |

---

## Validation Sign-Off

- [ ] All tasks have an `<automated>` verify or a Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without an automated verify
- [ ] Wave 0 covers all MISSING references above
- [ ] No watch-mode flags
- [ ] The three zero-counts re-measured, and every count assertion carries a named-integer floor
- [ ] Each new/inverted gate observed RED before being trusted, with the red recorded verbatim
- [ ] Feedback latency < 150 s at wave level
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
