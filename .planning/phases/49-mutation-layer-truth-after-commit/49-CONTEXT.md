# Phase 49: Mutation-Layer Truth After Commit - Context

**Gathered:** 2026-08-26
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — 3 decisions taken by the user, the rest accepted as proposed

<domain>
## Phase Boundary

What the four entity mutations leave behind is what they told the user they would: a purge removes
the bytes *and* the route that served them, a merge leaves the survivor's formulas consistent, and a
create response carries what a read would.

Requirements: **SEC-04, DATA-01, DATA-02**. Three areas that are independent in subject but land in
the same four files and share one live-database test setup, which is why they are one phase.

**Out of scope:** anything about `/api/v1` route-level authorization (that was Phase 48), export
authorization (Phase 50), and the mutation-helper ownership contract inherited from Phase 48 as
DEF-48-05 / SEC-48-C — see `<deferred>`.

</domain>

<decisions>
## Implementation Decisions

### DATA-02 — the create-response contract (SC-4)

**THE OPEN DECISION IS SETTLED: return a canonical read, do not recompute in-process.**
The roadmap explicitly forbade a plan from assuming one; the user chose the canonical read.

- After the insert commits, re-read the record through **the same path `GET` uses** and serialize
  that. One code path defines truth, so the 201 body and a subsequent read cannot drift — including
  for derived fields that do not exist yet. The accepted cost is one extra `SELECT` per create.
- Today `POST /api/v1/organizations` returns `serializeOrganization(result.organization)` — the row
  as inserted by the mutation — so any server-side derivation (formula, default, coercion) makes the
  201 diverge from a read. That is the defect.
- **Apply the same decision to all four entities** (`organizations`, `people`, `deals`,
  `activities`). The requirement is "decide once for all four"; per-entity divergence is not
  acceptable.
- **Match scope: custom-field VALUES**, per SC-4's wording — not whole-body byte equality.
- **The two plan 34-02 fixture assertions compare against the current create-response shape and MUST
  be amended in the SAME commit as the DATA-02 change**, or the suite goes red on success. This is a
  named milestone trap; see `<specifics>`.

### SEC-04 — file route authorization (SC-1)

**Close all three holes, not just the one SEC-04 names.** The user chose the widest of three options
after the scout showed the exposure is broader than the requirement's wording.

- **Authorization:** resolve `entityId` and apply the ownership predicate, answering **404** for a
  foreign or missing record. This is Phase 48's settled house pattern — `organizations/[id]`,
  `people/[id]` and `deals/[id]` all answer a foreign record with 404, and Phase 48's SEC-48-A fix
  chose 404 for exactly this reason: 403-for-real beside 404-for-unknown is an existence oracle.
- **`DELETE` gets the same guard as `GET`.** It has the identical hole today — any signed-in user can
  destroy any file — and it is the same handler and the same fix shape. Closing the read while
  leaving the destructive verb open is not acceptable.
- **Path containment:** assert the resolved path stays under `UPLOAD_DIR` **and** that the stored
  name matches the JSONB reference. `path.resolve(UPLOAD_DIR, entityId, fieldName, filename)`
  currently interpolates three URL segments unvalidated.
- **Identity model: session-only (`auth()`), unchanged.** There is no `/api/v1` file route, so no
  `withApiAuth` twin is needed. Do not invent one.
- **Ordering (roadmap-mandated, non-negotiable):** this lands **before** blob deletion. It closes the
  exposure on its own, and the URL stays recoverable from the audit tombstone indefinitely.

### SEC-04 — purge and blob deletion (SC-2)

- **POST-commit, best-effort.** SC-2 requires the purge stay **committed** even when storage deletion
  fails. Mirror the existing post-commit block in `dedup.ts` — the shape is already established
  there and documents why it cannot run inside the transaction.
- **On storage failure: log an expected-vs-deleted count mismatch and never rethrow.** Consistent
  with `D-05` ("formula machinery never blocks a write"). The mismatch must be **injected on purpose
  and observed** — the post-commit ordering is the whole point of the criterion, so an untested
  failure path does not satisfy it.
- **New helpers live in `src/lib/trash/`, beside `prune.ts`.** Neither `collectFileFieldRefs` nor
  `deleteEntityFiles` exists yet — confirmed absent by grep, as the roadmap states.
- `src/lib/trash/prune.ts` carries a long comment (around :66-79) that honestly documents this gap
  today, including "UPLOADED FILE BLOBS ARE NOT REMOVED" and "Do not read the batch size below, or
  anything else in this module, as evidence that blobs are handled." **That comment must stop being
  true**, and must be corrected in the same change rather than left to contradict the code.

### DATA-01 — merge formula consistency (SC-3)

- **Placement: extend the existing post-commit block at `dedup.ts:629-650`.**
  `recalcReparentedChildren` already lives there, and the block's own comment explains why
  `recalculateFormulas` cannot run inside the transaction: it and its whole cascade use the
  module-level `db` and take no `tx`, so calling it inside would read a snapshot without the
  uncommitted reparenting and write outside the transaction's atomicity.
- **Best-effort, never rethrow** (D-05), matching the `try/catch` → `log.error("dedup-merge", …)`
  already there.
- **Proof: the stored formula value must equal a FRESH computation from the survivor's post-merge
  values** — not a snapshot comparison.
- Note the existing hazard the block already documents: `cascadeToChildren` short-circuits on
  `if (changed.size === 0) return 0`, so a merge where the survivor won every field recomputes
  nothing. Do not reintroduce a survivor-rooted cascade as the mechanism.

### Test data — measured, and it applies to TWO criteria

`custom_field_definitions` (169 live, `deleted_at is null`) holds **no `formula` fields and no `file`
fields**:

| type | count |
|---|---|
| text | 62 |
| multi_select | 56 |
| single_select | 28 |
| number | 12 |
| date | 11 |

- **SC-3's test must create its own `formula` definition.** The roadmap already says this: "a dormant
  defect proven by a test that would pass either way is not proven."
- **SC-2's test must create its own `file` definition — the roadmap does NOT say this, and it is the
  same trap.** With zero live file fields, a purge test finds no blobs to delete and passes
  vacuously on an empty set. Every count assertion in both proofs needs a named-integer floor so
  "correct rows" cannot be satisfied by zero rows.

### Plan shape

- **Planner's discretion.** The user chose to let `gsd-planner` derive waves and granularity, as it
  did for Phase 48, rather than fixing one-plan-per-criterion or grouping by file surface.
- The constraints it must honour are hard: SC-1 lands before blob deletion; DATA-01 runs
  post-commit; the 34-02 fixtures amend inside the DATA-02 commit.
- **Wave-scheduling constraint (learned in Phase 48):** `scripts/dedup-db-test-setup.sh` drops and
  rebuilds every schema in `pipelite_dedup_test`, so **two plans that each own a `*.db.test.ts` file
  must never share a wave.** This phase shares "one live-DB test setup" by the roadmap's own
  description, which makes it the likeliest phase in the milestone to trip it.

### Decisions taken AFTER research (2026-08-26)

Research overturned two upstream claims. Both were put to the user and answered.

- **SC-1 holds for LOCAL STORAGE ONLY, and the ROADMAP has been amended to say so.** Under
  `FILE_STORAGE=s3`, `src/app/api/upload/route.ts:89` stores `publicUrl` as
  `${S3_PUBLIC_URL}/${key}`, so reads never traverse `/api/files/...` and the ownership guard this
  phase adds protects nothing in an S3 deployment. **Fix the local path, prove SC-1 there, and do NOT
  attempt the S3 path in this phase** — closing it means deciding the URL contract (proxy vs signed
  URL) and migrating every stored `publicUrl`. Recorded as **SEC-49-A** in `.planning/BACKLOG.md`.
  A plan must not quietly widen SC-1 back to "all storage backends".
- **The audit tombstone retains for 90 days, not "indefinitely"** (`audit.retention_days = 90`).
  SC-1's ordering argument still holds — 90 days is ample — but the ROADMAP text was wrong and is
  corrected. Do not repeat the "indefinitely" claim in a plan or SUMMARY.
- **DEF-48-05 / SEC-48-C stays OUT of Phase 49.** Phase 48's records assign it here, but it is not
  one of this phase's three requirements and it is requirement-shaped work of its own (the
  mutation-helper ownership contract for `fieldMapping` reference columns and the two assignee
  fields). It keeps its backlog owner and evidence. **No plan in this phase may absorb it**, and the
  sign-off must not claim it.
- **There are SIX suite-breakers, not the two the ROADMAP named**, in three sets — and the named pair
  is not the one that necessarily breaks. See `49-RESEARCH.md` and the amended ROADMAP note. Set B
  (`deals/__tests__/formula-recalc.test.ts:367`, `people/__tests__/formula-recalc.test.ts:354`) are
  the guaranteed breakers and inverting them yields SC-4's proof for two entities.
- **DATA-02 is a purely LATENT defect — nothing diverges today.** The 201 serializes the pre-recalc
  `.returning()` row; the only divergence source is `recalculateFormulas`, which requires at least one
  `type='formula'` definition, of which there are zero. **An SC-4 test written against live
  definitions is green before AND after the fix.** The proof must manufacture the divergence. This is
  the SC-3 trap arriving in SC-4, and the ROADMAP does not warn about it.
- **Re-measure at plan time**, because three proofs depend on them being zero: the `formula` and
  `file` definition counts, and the count of records carrying a stored file descriptor.

### Claude's Discretion

- Helper signatures, file layout within `src/lib/trash/`, and how `collectFileFieldRefs` walks the
  JSONB column.
- Whether the canonical-read re-read reuses an existing `get{Entity}` helper or needs a new one per
  entity, and how the extra `SELECT` is shaped.
- Test file naming and whether the three areas share one `*.db.test.ts` or take one each — subject
  to the wave constraint above.
- The exact log shape for the count mismatch, provided it carries both the expected and the deleted
  count.

</decisions>

<code_context>
## Existing Code Insights

### The defect sites, read directly

- **`src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts`** — the whole file is ~135 lines,
  `GET` and `DELETE`. Both do `const session = await auth(); if (!session?.user) return 401` and then
  **nothing else** — no entity resolution, no ownership predicate. `GET` serves the bytes; `DELETE`
  unlinks them. Local and S3 branches both build their key/path from the raw URL segments.
- **`src/lib/mutations/dedup.ts:626-650`** — the post-commit block, already commented
  `// ---- AFTER THE COMMIT. Both blocks are best-effort and neither rethrows.` Block 1 is
  `recalcReparentedChildren` in a `try/catch` → `log.error("dedup-merge", …)`; block 2 is the bus
  emit for the loser's deletion. This is where DATA-01 belongs.
- **`src/lib/trash/prune.ts`** — the module comment enumerates exactly what a purge removes and
  explicitly excludes blobs. `BATCH_SIZE = 200`, flagged in-comment as an unmeasured tunable.
- **`src/lib/formula-recalc.ts:960`** — `export async function recalculateFormulas(`. Module-level
  `db`, no `tx` parameter. This is the constraint that forces post-commit placement.
- **`src/lib/api/serialize.ts:40,61,83,103`** — `custom_fields: {entity}.customFields` for the four
  entities. The 201 currently serializes the inserted row through these.

### Established patterns to reuse

- **Ownership predicate + 404**, as settled across Phase 48: `eq(<table>.ownerId, context.userId)`
  in the query so a foreign record is indistinguishable from a missing one.
- **`requireScopedPredicate`** in `src/lib/api/stage-scope.ts` — the guard that makes a collapsed
  `and(...)` throw instead of silently rendering an unfiltered query. Phase 48 added the equivalent
  to `crm.ts`. Any new predicate builder here should use it; drizzle's `and` filters `undefined`
  silently and is typed to accept it.
- **`src/lib/api/db-errors.ts`** (new in Phase 48) — SQLSTATE → clean 4xx mapping, with a
  `.cause` walk bounded at 5 that fails safe. Reuse rather than re-handling raw PostgresErrors.
- **The db-test harness:** `mintApiKey` in `src/app/api/v1/__tests__/api-key-fixture.ts`, driving
  real handlers through the real unmocked `withApiAuth` against real PostgreSQL. Four proofs already
  use it (`activities-scope`, `stages-scope`, `crm-ownership`, `trigger-owner-scope`,
  `runs-owner-scope`). Reuse it; do not build a sixth harness.

### Integration points

- `src/app/api/v1/{organizations,people,deals,activities}/route.ts` — the four `POST` handlers, each
  ending `return createdResponse(serialize{Entity}(result.{entity}))`.
- `src/lib/trash/` — where the purge runs and where the new blob helpers go.
- `public/openapi.yaml` + `src/app/api/v1/__tests__/openapi-error-coverage.test.ts` — the parsed-YAML
  gate, now at **12 operations** with floors re-measured at 29 path items / 61 operations. If this
  phase changes what any of the four `POST`s puts on the wire, that gate's scope may need an entry,
  and the constant's doc-comment records scope changes by contract.
- `src/app/api/v1/__tests__/route-authorization.test.ts` — the Q10 authorization sweep. The file
  route is **not** under `/api/v1`, so check whether it is in scope for that gate before assuming
  coverage.

</code_context>

<specifics>
## Specific Ideas

- **The named milestone trap for this phase:** two plan 34-02 fixture assertions compare against the
  current create-response shape. They must be amended **in the same commit** as DATA-02 or the suite
  goes red on success. This is the same failure mode as `UX-02`'s `test.fail()` marker in Phase 52 —
  a test that must be updated in lockstep with the fix.
- **The standing locale rule:** any new locale key must be added to the matching `REQUIRED_*_KEYS`
  array in the same commit — those contracts use an exact `toEqual`.
- **The milestone's one rule, which this phase inherits with force:** break your own gate on purpose
  and watch it go red before trusting it. v1.3 shipped six gates that could not fail; v1.4 has now
  found twelve more, two of them inside Phase 48's own fix passes. A gate with no recorded red
  observation is treated as NOT DELIVERED at sign-off. Prefer behavioural and parsed-structure
  assertions over raw-token greps — the comment explaining a rule trips that rule's own grep gate,
  which has happened fifteen times in this project.
- **`prune.ts` is the most dangerous code path touched here.** Its own comment says irreversible disk
  deletion inside it "needs its own plan, and doing it wrong is unrecoverable." Treat SC-2's
  deletion step accordingly: the route-resolution fix (SC-1) closes the exposure on its own and
  lands first, so there is no pressure to rush the deletion.

</specifics>

<deferred>
## Deferred Ideas

Carried in from Phase 48, **not** this phase's work, but named here because they are adjacent and a
planner might otherwise absorb them:

- **DEF-48-05 / SEC-48-C** — `fieldMapping` reference columns (`activity.dealId`/`assigneeId`,
  `deal.organizationId`/`personId`/`stageId`, `person.organizationId`) plus `deal.assigneeIds` and
  `activity.assigneeId` are existence-checked only, so a caller can attach their own record to a
  foreign record id. **Explicitly assigned to Phase 49 by Phase 48's records** — but it is a
  mutation-contract question, not one of this phase's three requirements. Flag to the user before a
  plan takes it on; do not silently absorb it.
- **DEF-48-06 / IMP-48-A** — three sibling CSV import lookups feeding fuzzy matching and
  auto-creation. Scoping them invents per-owner duplicates across 46,054 + 38,348 rows.
- **DEF-48-08 / SEC-48-F** — the workflow engine has no admin bypass, deliberately.
- **SEC-48-D (open-relay half)** — a recipient-policy decision, not a predicate.
- **SEC-47-A** — `src/lib/email/client.ts:20` sets `tls: { rejectUnauthorized: false }`
  unconditionally. Still open, still the largest single exposure carried in the backlog.
- **TS-48-A** — `noUncheckedIndexedAccess` repo-wide.
- **DOC-48-01** — OpenAPI drift: 401 declared on 22 of 59 operations, 429 on 12, 403 on 8; 36 route
  files against 27 documented path items. Phase 48's SEC-48-A work moved the counts to 29 path items
  / 61 operations but did not close this.
- **DEF-48-01** — `npm run test:db` exits non-zero on a green suite
  (`views/queries.db.test.ts`'s `afterAll`). Never gate on its exit code.
- **IN-06** — stale present-tense comments at `stages/route.ts:51` and `trash/route.ts:67` that now
  misdescribe the `MAX_OFFSET` ceiling. Documentation only. `trash/route.ts` is adjacent to this
  phase's files, so it may be cheap to correct in passing.

</deferred>
