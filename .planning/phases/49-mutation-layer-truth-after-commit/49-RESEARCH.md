# Phase 49: Mutation-Layer Truth After Commit — Research

**Researched:** 2026-08-26
**Domain:** Post-commit mutation side effects — file-route authorization, blob lifecycle, formula
consistency on merge, create-response canonicality. Next.js 16 route handlers + Drizzle + PostgreSQL,
all inside this repository. No external library research was needed or done.
**Confidence:** HIGH on every fact below marked `[VERIFIED: …]` — each was read out of this tree or
measured against the running container today. The two LOW items are named in
`## Open Questions` and nowhere else.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**DATA-02 — the create-response contract (SC-4)**

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
  named milestone trap.

**SEC-04 — file route authorization (SC-1)**

**Close all three holes, not just the one SEC-04 names.**

- **Authorization:** resolve `entityId` and apply the ownership predicate, answering **404** for a
  foreign or missing record. Phase 48's settled house pattern.
- **`DELETE` gets the same guard as `GET`.** Identical hole today.
- **Path containment:** assert the resolved path stays under `UPLOAD_DIR` **and** that the stored
  name matches the JSONB reference.
- **Identity model: session-only (`auth()`), unchanged.** No `withApiAuth` twin. Do not invent one.
- **Ordering (roadmap-mandated, non-negotiable):** this lands **before** blob deletion.

**SEC-04 — purge and blob deletion (SC-2)**

- **POST-commit, best-effort.** Mirror the existing post-commit block in `dedup.ts`.
- **On storage failure: log an expected-vs-deleted count mismatch and never rethrow.** The mismatch
  must be **injected on purpose and observed**.
- **New helpers live in `src/lib/trash/`, beside `prune.ts`.**
- `src/lib/trash/prune.ts`'s gap comment (~:66-79) **must stop being true**, corrected in the same
  change.

**DATA-01 — merge formula consistency (SC-3)**

- **Placement: extend the existing post-commit block at `dedup.ts:629-650`.**
- **Best-effort, never rethrow** (D-05), matching the existing `try/catch` → `log.error("dedup-merge", …)`.
- **Proof: the stored formula value must equal a FRESH computation from the survivor's post-merge
  values** — not a snapshot comparison.
- Do not reintroduce a survivor-rooted cascade as the mechanism (`cascadeToChildren` short-circuits
  on `if (changed.size === 0) return 0`).

**Test data — measured, and it applies to TWO criteria**

- **SC-3's test must create its own `formula` definition.**
- **SC-2's test must create its own `file` definition.** Every count assertion in both proofs needs a
  named-integer floor so "correct rows" cannot be satisfied by zero rows.

**Plan shape**

- Planner's discretion on waves and granularity.
- Hard: SC-1 before blob deletion; DATA-01 post-commit; the 34-02 fixtures amend inside the DATA-02
  commit.
- **Wave-scheduling constraint:** `scripts/dedup-db-test-setup.sh` drops and rebuilds every schema in
  `pipelite_dedup_test`, so **two plans that each own a `*.db.test.ts` file must never share a wave.**

### Claude's Discretion

- Helper signatures, file layout within `src/lib/trash/`, and how `collectFileFieldRefs` walks the
  JSONB column.
- Whether the canonical-read re-read reuses an existing `get{Entity}` helper or needs a new one per
  entity, and how the extra `SELECT` is shaped.
- Test file naming and whether the three areas share one `*.db.test.ts` or take one each — subject
  to the wave constraint above.
- The exact log shape for the count mismatch, provided it carries both the expected and the deleted
  count.

### Deferred Ideas (OUT OF SCOPE)

- **DEF-48-05 / SEC-48-C** — `fieldMapping` reference columns. Explicitly assigned to Phase 49 by
  Phase 48's records, but **not one of this phase's three requirements. Flag to the user before a
  plan takes it on; do not silently absorb it.**
- **DEF-48-06 / IMP-48-A** — CSV import lookups.
- **DEF-48-08 / SEC-48-F** — workflow engine admin bypass.
- **SEC-48-D (open-relay half)**, **SEC-47-A** (`rejectUnauthorized: false`), **TS-48-A**
  (`noUncheckedIndexedAccess`), **DOC-48-01** (OpenAPI drift), **DEF-48-01** (`test:db` exit code).
- **IN-06** — stale comments at `stages/route.ts:51` and `trash/route.ts:67`. `trash/route.ts` is
  adjacent, so cheap to correct in passing. Documentation only.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description (verbatim, REQUIREMENTS.md:74 / :149 / :155) | Research Support |
|----|-------------|------------------|
| **SEC-04** | "A purged record's uploaded files are unreachable — removed from storage, and not served even while they exist." | § SC-1 (route resolution: exact defect site, the resolution mechanism, the 404 pattern, path containment) and § SC-2 (the four post-commit insertion points with line numbers, the file-value shape, the deletion helper contract, the failure-injection seam) |
| **DATA-01** | "A merge leaves the survivor's formula fields consistent with its post-merge values." | § SC-3 (`recalculateFormulas` contract, the `changedFields` spelling trap, confirmation the survivor is recomputed *nowhere* today, the fresh-computation comparison) |
| **DATA-02** | "A create response carries the same field values a subsequent read would." | § SC-4 (per-entity read mechanism, the measured answer to "does anything diverge today", the exact re-read placement, the four named suite-breakers) |
</phase_requirements>

---

## Summary

All three requirements are **repository-internal behaviour changes with no new dependency**. Nothing
in this phase needs a library that is not already installed; the Standard Stack section below exists
only to record that finding honestly and to name the in-tree modules that play the role a library
would.

The single most consequential research finding is about the **proof**, not the fix. Measured against
the running database today: **0 `formula` custom-field definitions, 0 `file` custom-field
definitions, 0 records of any of the four entity types carrying a file descriptor in `customFields`,
0 audit rows carrying one, and an empty `/app/uploads` volume.** Three of the four success criteria
therefore have **nothing in the live data to act on**, and a test that does not manufacture its own
subject passes on an empty set. CONTEXT.md already flagged this for SC-2 and SC-3; this research adds
that **SC-4 has the same problem for a different reason** — with zero formula definitions there is
*no derivation whatsoever* that makes a 201 body differ from a `GET` today, so a DATA-02 proof that
does not create its own formula definition is green before the fix and green after it.

The second most consequential finding is that the roadmap's named suite-breaker is **not the one that
will actually break**. The two plan 34-02 assertions
(`src/lib/mutations/organizations.test.ts:134` and `:600`) only go red if the change is made *inside*
`createOrganizationMutation`. There are **two other tests that pin the defect by name and go red
under any implementation** (`.../deals/__tests__/formula-recalc.test.ts:367` and
`.../people/__tests__/formula-recalc.test.ts:354`), plus **two more that break for a mechanical
reason** (adding a re-read to the activities POST leaves `serializeActivity(undefined)` in a test
whose `db` is mocked). All six are named with file, line and current expected value in § SC-4.

The third: **there is no storage abstraction module in this repository at all.** Storage is inlined
in exactly two files, both reading `process.env` at module-evaluation time, and one of those reads is
itself gated by a raw-token assertion in
`src/lib/__tests__/compose-uploads-persistence.test.ts:399-404`. That shapes both the deletion helper
and the SC-2 failure-injection seam, and it is a fourth suite-breaker if a plan refactors the env read
out of the route.

**Primary recommendation:** land SC-1 as a self-contained `src/lib/trash/`-adjacent resolution helper
plus the two route guards first (it is the only criterion whose subject exists today — the route
itself); land SC-4's re-read in the four **route** handlers, never in the mutations, because the route
placement avoids two of the six suite-breakers outright; put the SC-2 count mismatch in the **log
only, never in `PurgeResult`**, because widening that return type puts eleven exact `toEqual({ success:
true, detached: N })` assertions in the blast radius; and inject the SC-2 storage failure by making
the blob path a **directory** (`unlink` → `EISDIR`, deterministic on Linux at any uid), which needs no
production seam and no mock.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| File-URL authorization (SC-1) | API route handler (`src/app/api/files/…/route.ts`) | Database (ownership predicate) | The route is the only boundary that holds a caller identity for this URL. `dispatch.ts:20-26` records the standing decision that mutations check existence and nothing more; the guard belongs at the boundary. |
| Entity resolution from `entityId` | New shared lib module | Database | Four-table lookup; must not live in `route.ts` (Next.js rejects non-verb exports from a route file — recorded at `src/lib/api/stage-scope.ts:55-57`). |
| Path containment (SC-1) | API route handler | — | Pure function of the three URL segments plus the resolved record's JSONB. No tier below the route sees the raw segments. |
| Blob enumeration + deletion (SC-2) | Mutation layer, POST-commit (`src/lib/mutations/{4}.ts`) | Filesystem / S3 | The mutation owns the transaction boundary; the deletion must follow the commit. `prune.ts` does **not** own the boundary — see § SC-2. |
| Blob-deletion count mismatch logging | Mutation layer | — | Per record, because the purge is per record. Batch aggregation would have to travel through `PurgeResult`, whose exact shape is asserted eleven times. |
| Survivor formula recalculation (DATA-01) | Mutation layer, POST-commit (`dedup.ts`) | Formula engine (`formula-recalc.ts`) | `recalculateFormulas` uses the module-level `db` and takes no `tx` — verified at `formula-recalc.ts:960-991`. |
| Canonical create read (DATA-02) | API route handler (the four `POST`s) | Database + serializer | The GET path's read is **inlined in each `[id]/route.ts`**; there is no `get{Entity}` helper to reuse. Placing the re-read in the route mirrors what `PUT /api/v1/organizations/[id]:121-127` already does. |

---

## Standard Stack

### Core — everything this phase needs is already installed

No new dependency is required or recommended. `[VERIFIED: read package.json imports of every module
named below; each is already imported somewhere in `src/`]`

| Module (in-tree) | Purpose | Why it is the right one |
|---|---|---|
| `node:fs/promises` (`unlink`, `readFile`, `writeFile`, `mkdir`) | local blob deletion | Already the only filesystem API used by both file routes. `[VERIFIED: src/app/api/upload/route.ts:3, src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts:3]` |
| `node:path` (`resolve`, `relative`) | path containment | `resolve` is already what builds the path; `relative` is the containment test. |
| `@aws-sdk/client-s3` (`DeleteObjectCommand`) | S3 blob deletion | Already lazily imported by both routes; `DeleteObjectCommand` is already used at `files/…/route.ts:114`. |
| `drizzle-orm` (`and`, `eq`, `isNull`, `isNotNull`) | ownership predicates | House pattern across all of Phase 48. |
| `src/lib/api/stage-scope.ts` → `requireScopedPredicate(predicate, termCount, subject)` | make a collapsed `and(...)` throw | Drizzle's `and` silently filters `undefined` and `.where(undefined)` renders as no WHERE clause — measured statement at `stage-scope.ts:96-102`. `[VERIFIED: read stage-scope.ts:135-150]` |
| `src/lib/formula-recalc.ts` → `recalculateFormulas`, `CHANGED_FIELDS_CUSTOM_SENTINEL`, `FORMULA_EVALUATION_BUDGET` | DATA-01 | The only correct entry point; see § SC-3. |
| `src/lib/api/serialize.ts` → `serialize{Organization,Person,Deal,Activity}` | DATA-02 | Pure row→snake_case functions with **no derivation** — verified in full at `serialize.ts:33-103`. |
| `src/app/api/v1/__tests__/api-key-fixture.ts` → `mintApiKey` | SC-4 live-DB proof over real handlers | Real key through real `withApiAuth`. **Does not help SC-1** — the file route uses session auth. |
| `src/lib/audit/present.ts:264-268` → `isFileDescriptor` (module-private) | shape detection for a stored file value | Already the canonical predicate for "this JSONB value is a file descriptor". Not exported today. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| Four-table lookup to resolve `entityId` | Adding `entityType` as a fifth URL segment | Structurally simpler and would eliminate the lookup, and is **safe in this deployment specifically** because **0 records carry a stored `publicUrl`** (measured — nothing would be orphaned). But it changes `src/app/api/upload/route.ts:101`'s generated URL, `file-field.tsx`'s stored value shape, and contradicts CONTEXT.md's locked "resolve `entityId` and apply the ownership predicate". **Rejected — recorded only so the planner knows the measured escape hatch exists if the four-table lookup proves unworkable.** |
| Log-only count mismatch (SC-2) | Widening `PurgeResult` with `blobsExpected` / `blobsDeleted` | Would let `prune.ts` log a per-tick total. **Cost: eleven exact `toEqual({ success: true, detached: N })` assertions** — `activities.test.ts:878,898`; `deals.test.ts:1011,1095,1127`; `organizations.test.ts:968,1010,1063`; `people.test.ts:936,996,1017`. `[VERIFIED: grep]` Not worth it for SC-2, whose criterion is a *log*, not a return value. |
| Extracting `UPLOAD_DIR` into a shared storage module | Keeping `process.env.UPLOAD_DIR` literally in the file route | `src/lib/__tests__/compose-uploads-persistence.test.ts:399-404` asserts the literal string `process.env.UPLOAD_DIR` appears in **both** file route files. Extracting the read turns that gate red. Either keep the read in the route, or amend that gate in the same commit and say so. `[VERIFIED: read compose-uploads-persistence.test.ts:396-404]` |
| `vi.mock` of a new storage module for SC-2 | Making the blob path a **directory** so `unlink` raises `EISDIR` | The directory trick needs no production seam, no mock, and is deterministic on Linux **even as root**. Preferred. `chmod 0500` on the parent also works but silently succeeds if the test process is root. |

**Installation:** none. No `npm install` step belongs in any plan for this phase.

---

## Package Legitimacy Audit

**Not applicable — this phase installs no external packages.**

Every module the plans will import is either a Node built-in (`node:fs/promises`, `node:path`,
`node:crypto`) or already present in this repository's `package.json` and already imported by shipped
code (`drizzle-orm`, `@aws-sdk/client-s3`, `vitest`, `zod`). No registry lookup, no slopcheck run and
no `checkpoint:human-verify` install gate is required.

If a plan does propose a new dependency, that is a signal the plan has drifted from this research —
treat it as a finding, not a detail.

---

## Architecture Patterns

### System Architecture Diagram — the four flows this phase changes

```
SC-1  FILE READ / DELETE
  browser / holder of URL
        │  GET|DELETE /api/files/{entityId}/{fieldName}/{filename}
        ▼
  route handler ── auth() ──► no session ──► 401
        │ session
        ▼
  [NEW] resolveOwnedEntity(entityId, session.user.id)
        │   4 owner-scoped lookups: organizations, people, deals, activities
        ├─ none match ──────────────────────────────► 404   (foreign == missing)
        ▼ record
  [NEW] assertReferencedFile(record.customFields[fieldName], filename)
        │   filename must equal a stored `storedName` in that field's array
        ├─ no match ────────────────────────────────► 404
        ▼
  [NEW] assertContained(path.resolve(UPLOAD_DIR, …), UPLOAD_DIR)
        ├─ escapes ─────────────────────────────────► 404
        ▼
  storage branch: local fs.readFile / unlink  ·OR·  S3 Get / Delete
        ▼
  bytes  |  { success: true }


SC-2  PURGE  (per record; the pruner and the trash route both arrive here)
  prune.ts tick (batch of ≤200 ids)   ·OR·   DELETE /api/v1/trash/{type}/{id}
        │                                    ·OR·  src/app/trash/actions.ts:383
        └────────────► purgeRecordByType(entityType, id)   (dispatch.ts:107)
                             ▼
        purge{Entity}Mutation(id)
          1. db.query.{table}.findFirst  ← THE FULL ROW, customFields INCLUDED
          2. [NEW] refs = collectFileFieldRefs(record.customFields)   (pure, pre-tx)
          3. await db.transaction(...)   ── notes, detaches, row, audit row
             ══════════════ COMMIT ══════════════
          4. [NEW] deleteEntityFiles(id, refs)  best-effort, never rethrows
                   expected = refs.length ; deleted = successes
                   expected !== deleted  ──► log.error(scope, "…", { expected, deleted, … })
          5. return { success: true, detached }        ← SHAPE UNCHANGED


SC-3  MERGE  (dedup.ts)
  applyMergeChoices(survivor, loser, groups, choices)   :320
        ▼ nativeValues + merged.customFields
  await db.transaction(...)  ── lock, reparent, survivor UPDATE :466, loser soft-delete, audit
        ══════════════ COMMIT ══════════════   (:625)
  ── AFTER THE COMMIT ──  (:627)
    block 1  recalcReparentedChildren(...)      :641   children only, cascade:false
    [NEW]    recalculateFormulas({ entityType, entityId: survivorId,
                                   changedFields: <BARE names>, cascade: false })
    block 2  crmBus.emit(`${entityType}.deleted`)


SC-4  CREATE
  POST /api/v1/{entity}   ── withApiAuth ── zod ── FK ownership checks
        ▼
  insert  (organizations/activities: via create{Entity}Mutation)
          (people/deals:              inline db.insert in the route)
        ▼
  recalculateFormulas(...)      ← writes customFields; does NOT bump updatedAt
        ▼
  crmBus.emit(`${entity}.created`, <POST-recalc blob>)
        ▼
  TODAY:  createdResponse(serialize{Entity}(<the .returning() row>))   ← PRE-recalc
  [NEW]:  re-read by id  ──►  createdResponse(serialize{Entity}(<fresh row>))
```

### Pattern 1: The 404-for-foreign ownership predicate

**What:** put `eq(table.ownerId, callerId)` inside the query, so a foreign record is
indistinguishable from a missing one and there is no existence oracle.
**When to use:** every record-resolving read in SC-1.
**Example — copied from the shipped `GET /api/v1/organizations/[id]`:**
```ts
// Source: src/app/api/v1/organizations/[id]/route.ts:31-52 [VERIFIED: read in full]
const org = await db.query.organizations.findFirst({
  where: and(
    eq(organizations.id, id),
    eq(organizations.ownerId, context.userId),
    isNull(organizations.deletedAt)
  ),
})
if (!org) {
  return Problems.notFound("Organization")
}
```
Note for SC-1: the file route is **not** under `/api/v1` and therefore has no `Problems` helper in
scope today. `Problems.notFound` returns an RFC-7807 problem document; the file route currently
returns `NextResponse.json({ error: … })`. Pick one and state the choice — do not let the two shapes
land in one handler.

**⚠ `isNull(deletedAt)` is a decision, not a copy-paste.** A soft-deleted (trashed) record's file:
should its URL still serve? A trashed record is restorable and its detail page is reachable from
`/trash`, so refusing its file may break restore review. This is **not settled by CONTEXT.md** — see
`## Open Questions` Q1.

### Pattern 2: The post-commit best-effort block

**What:** work that cannot run inside the transaction, runs after it, in its own `try/catch`, logging
and never rethrowing.
**When to use:** SC-2's blob deletion and SC-3's survivor recalculation, both.
**Example — the shipped template, and the one CONTEXT.md says to mirror:**
```ts
// Source: src/lib/mutations/dedup.ts:627-651 [VERIFIED: read in full]
// ---- AFTER THE COMMIT. Both blocks are best-effort and neither rethrows. -------------
try {
  await recalcReparentedChildren({ /* … */ })
} catch (error) {
  // D-05: formula machinery never blocks a write, and the merge has already committed.
  log.error("dedup-merge", "post-merge formula recalculation failed", { err: error })
}
```

### Pattern 3: The canonical re-read after a mutation

**What:** re-read the row by id and serialize *that*, rather than serializing the value the write
returned.
**When to use:** all four SC-4 POST handlers.
**Example — already shipped, in the PUT twin of one of the four routes:**
```ts
// Source: src/app/api/v1/organizations/[id]/route.ts:121-127 [VERIFIED: read in full]
// Re-fetch updated org for response (mutation doesn't return the entity for updates).
// This read follows the mutation's recalculation write, so it carries the recomputed values.
const updated = await db.query.organizations.findFirst({
  where: eq(organizations.id, id),
})
return singleResponse(serializeOrganization(updated!))
```
This is the **only** one of the four PUTs that does a real re-read. The other three merge the recalc
result in-process instead (`people/[id]/route.ts:258`, and the same shape in `deals/[id]` and
`activities/[id]`). `[VERIFIED: read all four]` The organizations PUT is therefore the pattern to
copy for DATA-02, and the other three PUTs are **not** — they are the very in-process recompute the
user rejected.

**On the `!` non-null assertion:** `updated!` at `:127` is reachable only because the ownership check
at `:88-98` already proved the row exists. In a POST the insert just succeeded, so the same argument
holds — but say so in a comment rather than reproducing a bare `!`. A row that vanished between
insert and re-read is a real (if absurd) case; decide whether it is a 500 or a fall-back to the
inserted row, and state it.

### Anti-Patterns to Avoid

- **Putting the DATA-02 re-read inside `create{Entity}Mutation`.** It breaks
  `organizations.test.ts:134` and `:600` for no benefit, and two of the four routes
  (`people`, `deals`) do not go through a create mutation at all — so the mutation placement cannot
  cover all four anyway. `[VERIFIED: read people/route.ts:210-263 and deals/route.ts:301-354 — both
  inline `db.insert`]`
- **Reintroducing a survivor-rooted `cascadeToChildren`** as DATA-01's mechanism. It short-circuits
  on `if (changed.size === 0) return 0`, so a merge where the survivor won every field recomputes
  nothing. `dedup.ts:635-639` already documents this.
- **Spelling a changed custom field as `customFields.Origem` in `changedFields`.** `dedup.ts:331-334`
  builds exactly that spelling — for the **audit diff**. `scopeFormulasToChangedFields` matches
  `changedFields` against the **bare** definition name. See § SC-3, "the spelling trap".
- **Deleting blobs inside the purge transaction.** Irreversible. `prune.ts:66-73` says so, and SC-2's
  wording requires the purge to stay committed when deletion fails.
- **Trusting `path.resolve` alone for containment.** VERIFIED by direct execution today:
  `path.resolve('/app/uploads','e1','f1','../../../../etc/passwd')` → `/etc/passwd`, and
  `path.resolve('/app/uploads','../../etc','f1','x')` → `/etc/f1/x`. **Both `filename` and
  `entityId` are escape vectors.** `[VERIFIED: node -e, run 2026-08-26]`
- **Raw-token grep gates.** Fifteen collisions in this project. Prefer parsed structure (the
  `route-authorization.test.ts` model) or behaviour.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Collapsed `and(...)` producing an unfiltered query | your own `if (!predicate) throw` | `requireScopedPredicate(and(...terms), terms.length, "<name>")` from `src/lib/api/stage-scope.ts:135` | Already proves both halves (non-undefined AND term count) and its own guard is tested. Phase 48 added the equivalent to `crm.ts`. |
| SQLSTATE → clean 4xx | reading raw `PostgresError.code` | `src/lib/api/db-errors.ts` | New in Phase 48; `.cause` walk bounded at 5, fails safe. |
| Minting an API key for a live-DB proof | hand-rolling a `pk_live_` + sha256 row | `mintApiKey` (`src/app/api/v1/__tests__/api-key-fixture.ts:83`) | Transcribed from `src/lib/api-keys.ts:21-48`; five existing db-tests use it. |
| Detecting "this JSONB value is a file" | a bespoke `typeof` chain | the logic at `src/lib/audit/present.ts:264-268` (`isFileDescriptor`) | Already the canonical predicate. It is module-private today — export it, or duplicate it with a comment naming the original, but do not invent a third spelling. |
| Formula recomputation | reading definitions and calling `evaluateFormula` | `recalculateFormulas` (`formula-recalc.ts:960`) | It is the only site that passes the D-18 resource bounds. `src/lib/import/formula-recalc-batch.ts:17` records that a call site reaching the engine directly reopens threat T-34-02, and a test scans for it. |
| Isolated test database | a prefix convention on `pipelite` | `scripts/dedup-db-test-setup.sh` + `vitest.db.config.ts` | Three independent fences on the database name. |

**Key insight:** every "helper" this phase appears to need already exists somewhere in this tree
except two — `collectFileFieldRefs` and `deleteEntityFiles` — and CONTEXT.md already scoped those to
`src/lib/trash/`. If a plan is writing a third thing, check this table again.

---

## Runtime State Inventory

Included because SC-2 deletes bytes: this is a *state-mutating* phase even though it is not a rename.

| Category | Items Found | Action Required |
|---|---|---|
| **Stored data** | `custom_field_definitions`: 169 live rows, **0 of `type='formula'`, 0 of `type='file'`** (measured 2026-08-26). All four CRM tables: **0 rows whose `custom_fields::text` contains `storedName`**. `audit_log`: **0 rows whose `changes::text` contains `storedName`**. | None to migrate. **But this is exactly why every proof must create its own definition and its own blob.** |
| **Live service config** | None. The purge/file paths touch no external service configured outside git. | None |
| **OS-registered state** | None. The pruner is an in-process `setTimeout` chain started from `instrumentation.ts` (`prune.ts:122-136`), not an OS scheduler. | None |
| **Secrets / env vars** | `UPLOAD_DIR` (compose sets `/app/uploads`, hardcoded on purpose — `docker-compose.yml:64-70`); `FILE_STORAGE` (**unset in the running container → `'local'`**, measured); `S3_*` (unused today). Both file routes read `process.env` at **module-evaluation time**, so a test that mutates `process.env.UPLOAD_DIR` after import has no effect. | No key renames. The env-read *location* is gated — see the compose-uploads gate below. |
| **Build artifacts / installed** | Docker named volume mounted at `/app/uploads`. **Measured empty** (`ls -la` → only `.` and `..`). | None. But SC-2's live proof must write into a directory the test process can reach — the *host* test process cannot see the container volume. See § Validation Architecture. |

**Nothing found in a category:** stated explicitly above rather than left blank.

---

## SC-1 — the file route (SEC-04, first half)

### The defect site, read in full

`src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts` — **139 lines**, two handlers.
`[VERIFIED: read in full 2026-08-26]`

| Line | Fact |
|---|---|
| `:9` | `const STORAGE_TYPE = process.env.FILE_STORAGE \|\| 'local'` — module-level |
| `:10` | `const UPLOAD_DIR = process.env.UPLOAD_DIR \|\| '/tmp/uploads'` — module-level |
| `:38-42` | `GET`: `const session = await auth(); if (!session?.user) return 401` |
| `:44` | `const { entityId, fieldName, filename } = await params` — **and then nothing else.** No record read, no ownership term, no containment. |
| `:54` | S3 read key: `` `${entityId}/${fieldName}/${filename}` `` |
| `:74` | local read path: `path.resolve(UPLOAD_DIR, entityId, fieldName, filename)` |
| `:99-105` | `DELETE`: byte-identical auth block, byte-identical param extraction, **identical hole** |
| `:115` | S3 delete key, same interpolation |
| `:123-127` | local `unlink`, same `path.resolve` |

Confirmed behaviourally against the running container 2026-08-26: `GET /api/files/abc/def/ghi.pdf`
→ **401** unauthenticated, and the encoded-traversal variants
(`..%2f..%2f..%2fetc%2fpasswd`, `%2e%2e%2f…`) also reach the handler and return **401** — i.e. the
route matches them, so the segments survive routing. `[VERIFIED: curl x3]`

### How to resolve `entityId` — there is no existing helper

`entityId` is a bare id with **no type discriminator anywhere in the URL**. The four CRM tables all
have `id`, `ownerId`, `deletedAt` and `customFields`. `[VERIFIED: src/lib/trash/prune.ts:105-114
enumerates exactly this shape as `EXPIRY_SOURCE`]`

Recommended: a new module (NOT in a `route.ts` — Next.js rejects non-verb exports from route files,
recorded at `src/lib/api/stage-scope.ts:55-57`) exporting something shaped like:

```ts
// Recommended signature. `EntityType` is the closed union from @/db/schema/custom-fields.
export async function findOwnedRecordById(
  entityId: string,
  userId: string
): Promise<{ entityType: EntityType; customFields: Record<string, unknown> } | null>
```

Build the four owner-scoped predicates through `requireScopedPredicate` so a collapsed `and(...)`
throws rather than rendering an unfiltered read (`stage-scope.ts:135`). Reuse the
`Readonly<Record<EntityType, …>> satisfies` idiom from `prune.ts:105-114` and
`dispatch.ts:78-90` — a fifth entity type then becomes a compile error in one file rather than a
table this resolver silently never visits.

Four sequential lookups is fine (worst case 4 indexed point reads, and it short-circuits on the
first hit). A `UNION ALL` is a legitimate alternative and cheaper by one round trip; it is
discretionary.

### Path containment — two checks, and the second is the load-bearing one

1. **Prefix containment.** `path.resolve` escapes via *both* `filename` and `entityId` — verified by
   execution above. The honest test is `path.relative(UPLOAD_DIR, resolved)` must not be `''`, must
   not start with `..`, and must not be absolute.
2. **JSONB reference match — this is the real containment.** After resolving the record, read
   `record.customFields[fieldName]`, require it to be an array of file descriptors, and require one
   of them to have `storedName === filename`. That makes traversal *structurally* impossible: the
   filename must already be a value the server wrote. It also makes the ownership check
   non-bypassable via a guessed field name.

Both belong in the fix (defence in depth), but if a plan can only prove one, prove #2.

### The audit tombstone — SC-1's justification, corrected

**It exists and it does record the URL.** `[VERIFIED: read src/lib/audit/diff.ts:137-189 and
src/lib/events/subscribers/audit.ts:21-33]`

- `organization.deleted` / `person.deleted` / `deal.deleted` / `activity.deleted` are all in
  `AUDITED_EVENTS` (`audit.ts:21-33`).
- `buildChanges` sets `isDelete = payload.action === "deleted"` (`diff.ts:137`), and
  `customFieldsReported = isDelete || …` (`diff.ts:171`) — so on a delete **every** custom-field key
  is diffed from `previous`.
- The formula gate at `diff.ts:181` skips only `{formula:true,…}` wrappers. A `file`-type value is an
  array of `FileItem`, not a formula wrapper, so it is **not** skipped: the row records
  `changes["customFields.<FieldName>"] = { from: [ { …, publicUrl: "/api/files/…" } ], to: undefined }`.
- Purge preserves prior `audit_log` rows deliberately — `audit_log` has no FK on `entity_id`
  (`organizations.ts:632-634`).

**But "indefinitely" is wrong, and the planner should know it.** `app_settings` measured 2026-08-26:

| key | value |
|---|---|
| `audit.retention_days` | **90** |
| `trash.retention_days` | 30 |

`src/lib/audit/prune.ts` is "the ONLY deletion path for `audit_log`" (its own header, `:2`) and it
prunes on that window. So the recovery window is **90 days as configured**, not indefinite. This does
not change SC-1's ordering argument — the route fix closes the exposure regardless of whether the URL
is recoverable — but a plan or summary that repeats "indefinitely" is repeating a claim this research
measured as false. **Also measured: 0 audit rows currently contain a file descriptor**, so there is
nothing recoverable today either.

### What SC-1 does NOT get for free

- **`src/app/api/v1/__tests__/route-authorization.test.ts` does not cover this route.** Its corpus
  predicate is `entry.name === "route.ts"` walked from `src/app/api/v1`. The file route lives under
  `src/app/api/files/…`. `[VERIFIED: read the header at :74-81 and the walk]` SEC-04 therefore needs
  its **own** gate; it will not appear in that file's offender list either way.
- **`public/openapi.yaml` does not document `/api/files`** — grep for `api/files` and `/files/`
  returns nothing. `[VERIFIED]` So `openapi-error-coverage.test.ts` is untouched by SC-1, and its
  `EXPECTED_*_SUBJECTS` exact counts (`:458-475`) are unaffected. If a plan *adds* the route to the
  spec, those counts must move in the same commit.
- **`mintApiKey` does not help.** The file route authenticates with `auth()`, not `withApiAuth`.
  The correct harness is the `vi.mock("@/auth")` + real-`db` pattern at
  `src/app/import/import-owner-scope.db.test.ts:75-77`.

---

## SC-2 — blob deletion after purge (SEC-04, second half)

### The stored shape of a `file` custom-field value

`[VERIFIED: src/components/custom-fields/file-field.tsx:14-28, cross-checked against
src/app/api/upload/route.ts:104-115 and src/lib/audit/present.ts:264-268]`

A file custom-field value is an **array** (`FileItem[]`), or `null` when the last file is removed
(`file-field.tsx:167` → `onSave(newFiles.length > 0 ? newFiles : null)`). Each element:

```ts
export interface FileItem {
  id: string          // crypto.randomUUID() — the fileId, NOT the stored name
  filename: string    // the user's original name, e.g. "contrato.pdf"
  storedName: string  // `${fileId}${path.extname(file.name)}`  ← THE ON-DISK NAME
  path: string        // local: absolute fs path. s3: the KEY. NOT interchangeable.
  publicUrl: string   // local: `/api/files/${entityId}/${fieldName}/${storedName}`
                      // s3:    `${S3_PUBLIC_URL}/${key}`   ← NOT an app route
  size: number
  mimeType: string
}
```

`storedName` is minted at `upload/route.ts:60-62`:
`const fileId = crypto.randomUUID(); const ext = path.extname(file.name); const storedName = \`${fileId}${ext}\``.
So it is a UUID plus the original extension — never user-controlled apart from the extension.

**Local and S3 key shapes agree on the path suffix and disagree on the URL.**
- local write dir: `path.resolve(UPLOAD_DIR, entityId, fieldName)`, file `storedName` (`:92-98`)
- S3 key: `` `${entityId}/${fieldName}/${storedName}` `` (`:79`)

So a single `(entityId, fieldName, storedName)` triple drives both backends, and `deleteEntityFiles`
can take exactly that. **But two S3-only facts matter:**

1. Under `FILE_STORAGE=s3`, `publicUrl` is `${S3_PUBLIC_URL}/${key}` (`:89`) — it never touches the
   app. **SC-1's route fix therefore does nothing under S3**, because nothing reads through the
   route. Say this out loud in the plan; do not let a summary claim SC-1 closes the S3 case.
2. `file-field.tsx:162` issues `fetch(file.publicUrl, { method: 'DELETE' })`. Under S3 that targets
   the bucket's public URL, not the app's DELETE handler. That is a **pre-existing latent bug**, out
   of scope, worth recording rather than fixing.

**Measured today:** `FILE_STORAGE` is **unset** in the running container → `'local'`.
`[VERIFIED: docker compose exec app]`

**No existing reader parses this shape** other than the audit presenter's `isFileDescriptor`
(`present.ts:264-268`, module-private) and the component itself. `collectFileFieldRefs` is genuinely
new, as CONTEXT.md states.

**A field-name hazard worth one line in the plan:** live custom-field names in this deployment are
Portuguese with spaces and punctuation (`Código Mãe`, `CNPJ / CPF`, `Previsão de início operação` —
recorded in BACKLOG 999.21). A file field named with a `/` cannot round-trip through a three-segment
route at all. Dormant (0 file definitions) — but the SC-1/SC-2 fixture field name must not contain
`/`.

### Where the purge actually commits — `prune.ts` is NOT the boundary

This is the most important correction in this section. `prune.ts` **does not own a transaction.** It
selects ids and delegates: `purgeRecordByType(entityType, id)` (`prune.ts:207`) →
`dispatch.ts:107` → `purge{Entity}Mutation(id)`. `[VERIFIED: read all three]`

Each of the four mutations has the **identical** shape — pre-fetch the full unprojected row (which is
where `customFields` comes from, at zero extra cost), then one `db.transaction`, then return:

| Mutation | Function head | Pre-fetch (full row) | Insertion point for post-commit deletion |
|---|---|---|---|
| `purgeOrganizationMutation` | `organizations.ts:553` | `:559-561` → `organization` | **immediately before `organizations.ts:646`** (`return { success: true, detached }`) |
| `purgePersonMutation` | `people.ts:580` | `:586-588` → `person` | **before `people.ts:650`** |
| `purgeDealMutation` | `deals.ts:643` | `:650-652` → `deal` | **before `deals.ts:754`** |
| `purgeActivityMutation` | `activities.ts:461` | `:467-469` → `activity` | **before `activities.ts:504`** (`return { success: true, detached: 0 }`) |

`[VERIFIED: read each]` All four are symmetric. There is no per-entity special case here, unlike SC-4.

**Consequence for count-mismatch scoping: PER RECORD, not per batch.** The purge is invoked once per
record from three call sites (`prune.ts:207`, `src/app/api/v1/trash/[type]/[id]/route.ts:107`,
`src/app/trash/actions.ts:383`). A per-record log line is where the information actually is. Per-batch
aggregation would require plumbing counts back through `PurgeResult`, and § Alternatives Considered
above records the eleven exact assertions that puts at risk. **Recommendation: log-only, per record,
with the entity type and id as identifiers and `{ expected, deleted }` as counts.** `prune.ts`'s
existing per-tick `log.info("trash-prune", "purged expired records", { purged, retentionDays })`
(`:172-175`) stays as-is.

**Log-content rule this module already enforces:** identifiers and counts only, never record content
(T-37-30, stated at `prune.ts:212-213` and `:294-301`). A blob-mismatch line must not carry a
filename. `expected`, `deleted`, `entityType`, `id` — nothing else.

### The `prune.ts` comment that must stop being true

`src/lib/trash/prune.ts:66-73` — the exact block:

> `NOT COVERED — UPLOADED FILE BLOBS ARE NOT REMOVED. A file custom field stores its bytes under`
> `` `${UPLOAD_DIR}/${entityId}/${fieldName}/${storedName}` `` `and is referenced only from that JSONB`
> `column, so purging the row destroys the REFERENCE and leaves the BYTES on disk (or in S3). … Do`
> `not read the batch size below, or anything else in this module, as evidence that blobs are handled.`

**No test asserts on this text.** `[VERIFIED: grep for "NOT COVERED", "BLOBS ARE NOT REMOVED",
"blobs are handled" across `src/` → only the two occurrences inside `prune.ts` itself]` It is safe to
rewrite, and it must be rewritten. `prune.test.ts` reads `BATCH_SIZE` and `MAX_BATCHES_PER_TICK`
symbolically (`:55-56, :227, :344`), never as literals, so touching the surrounding prose is free.

`src/lib/trash/prune.ts` is also **not** the place the new prose most needs to go — the deletion will
live in the four mutations. The `prune.ts` block should shrink to a pointer at the mutation that now
owns it, and the mutations should each carry the real statement. Two places that can disagree is how
this comment became false in the first place.

Also update `.planning/STATE.md:671` (the known-limitation entry that says the same thing) — not
required for the suite, but it is the register of record.

### How to inject a storage failure deterministically

**There is no existing seam.** No storage abstraction module exists anywhere in `src/`; the only two
consumers are the upload route and the file route, and both inline `fs`/S3 with module-level
`process.env` reads. `[VERIFIED: grep UPLOAD_DIR/FILE_STORAGE/S3_BUCKET across src/, scripts/,
docker-compose.yml, .env.example, next.config.ts]`

Three candidate seams, cheapest and most honest first:

**(A) — RECOMMENDED. Make the blob path a directory.** Create
`${UPLOAD_DIR}/${entityId}/${fieldName}/${storedName}` as a **directory** instead of a file.
`fs.promises.unlink` on a directory raises `EISDIR` on Linux **regardless of uid** — so it does not
silently pass when the test process is root, and it needs **zero production seam and zero mock**. The
purge still commits; `expected: 1, deleted: 0` is exactly the mismatch SC-2 wants. The JSONB still
references it, so `collectFileFieldRefs` still returns 1.

**(B) — `chmod 0500` the parent field directory.** `unlink` then fails `EACCES` because the *parent*
lacks write permission. Also real, also no mock. **Caveat: succeeds anyway as root.** If a plan uses
this, it must first assert the injection actually took (attempt a direct `unlink` and expect a
throw), or the "failure path" test passes on a successful deletion — a gate that cannot fail.

**(C) — a mockable module boundary.** If the plan puts blob deletion behind
`src/lib/trash/blob-storage.ts` exporting `deleteBlob(ref): Promise<void>`, a `vi.mock` of that one
module makes it reject. This works even inside a `*.db.test.ts` (it is not `@/db`). It is the only
option that also covers the **S3** branch, which (A) and (B) cannot reach. Cost: a production module
whose sole justification is testability, which this codebase's comments push back on. **Suggested
split: (A) for the local proof, (C)-shaped only if the plan decides the S3 branch needs a proof too —
and if it does, say plainly that the S3 proof is mock-level, not behavioural.**

### What would go RED if the SC-2 defect returned

- Blob deletion removed entirely → the "blob absent after purge" assertion goes red, **provided** the
  test created its own `file` definition and its own bytes. With the live count at 0, a test that
  purges an existing record asserts about an empty set. **Named-integer floor required:** assert
  `expected >= 1` (or `refs.length === 1`) *before* asserting the file is gone.
- Deletion moved inside the transaction → the injected-failure test goes red on the *purge* result:
  the record would still be in the database. Assert **both** halves: the row is gone AND the mismatch
  was logged.
- The mismatch log removed → assert on the captured log line's `expected`/`deleted` fields. The
  existing house pattern for capturing these is `vi.spyOn(console, "error")` plus
  `expect(String(spy.mock.calls[0][0])).toContain('"scope":"…"')` — see
  `organizations.test.ts:604-606`.

---

## SC-3 — merge leaves the survivor consistent (DATA-01)

### Is the survivor recomputed today? NO — confirmed, and by construction

`recalcReparentedChildren` (`dedup.ts:735-802`) builds its work list as
`[...movedDeals, ...movedPeople]` (`:741-744`), returns immediately if that list is empty (`:746`),
and calls `recalculateFormulas` **only** with `entityId: child.id` (`:789-790`) and `cascade: false`
(`:801`). `survivorId` appears in the function **only** inside a `log.warn` diagnostic (`:783`).
`[VERIFIED: read dedup.ts:707-802 in full]`

Nothing else in the merge path calls `recalculateFormulas`. `[VERIFIED: grep — `dedup.ts` has exactly
one call site, at `:789`]`

So the survivor's own formula fields are recomputed **nowhere**: not inside the transaction, not
after it, and not by a cascade. Two independent reasons the defect is total, not partial:

1. The only recalc call names a child id.
2. Even a survivor-rooted cascade would not help — `cascadeToChildren` short-circuits on
   `if (changed.size === 0) return 0`, which `dedup.ts:635-639` already documents.

And a merge with **no** reparented children (very common — an organization pair with no shared deals
or people) recomputes literally nothing at all, because of the `:746` early return.

### `recalculateFormulas` — the contract

`[VERIFIED: src/lib/formula-recalc.ts:557-609 (types), :650-742 (recalculateOneEntity), :960-991
(the exported function)]`

```ts
// formula-recalc.ts:960
export async function recalculateFormulas(
  input: RecalculateFormulasInput
): Promise<RecalculateFormulasResult>

interface RecalculateFormulasInput {
  entityType: EntityType
  entityId: string
  changedFields: string[]                                   // THE SC-4 SCOPE GATE
  row?: Record<string, unknown> | null                      // saves a read
  changedRelatedFields?: Record<string, string[]>
  relatedEntities?: Record<string, Record<string, unknown>>
  definitionsCache?: Map<EntityType, CustomFieldDefinition[]>
  cascade?: boolean                                         // default TRUE
  budget?: number                                           // default FORMULA_EVALUATION_BUDGET
}
interface RecalculateFormulasResult {
  customFields: Record<string, unknown> | null
  evaluations: number
}
```

**What it reads:** `getActiveFieldDefinitions(entityType)` — a live, **uncached**
`select … where entity_type = ? and deleted_at is null order by position`
(`src/lib/custom-fields.ts:22-30`). No module-level cache, so a test that inserts a formula
definition mid-run is picked up on the next call.

**What it writes:** exactly one statement, at `formula-recalc.ts:964-967`:
```ts
await db.update(table).set({ customFields: merged }).where(eq(table.id, entityId))
```
**`updatedAt` is deliberately NOT set** — `:968-970` states why (a derived refresh must stay
distinguishable from a user edit in the audit log). This is load-bearing for **SC-4** too: the
canonical re-read cannot produce a different `updated_at`.

It uses the **module-level `db`** and takes **no `tx`** — confirming the post-commit constraint. It
resolves rather than rejects on any formula failure (D-05), and on a broken formula stores
`{ formula:true, value:null, error:"…" }` unconditionally (D-06, `:727-729`).

**Skip conditions (both are vacuity traps for the proof):**
- `formulaDefs.length === 0` → `{ inScope: [], … }` immediately (`:343-344`). **This is the live
  state: 0 formula definitions.**
- `inScope.length === 0` → "no row read, no evaluation, no write" (`:663-669`).
- `computedNames.length === 0` → no `UPDATE` at all (`:958-961`).

### The spelling trap — the single likeliest way DATA-01 half-ships

`scopeFormulasToChangedFields` (`:338-396`) matches a formula's dependency ref against
`changedFields` three ways (`:351-372`):

1. `changed.has(ref)` — the **bare** name (a custom field name, or a native attribute spelled as
   `changedFields` spells it);
2. `NATIVE_ATTRIBUTE_COLUMNS[ref]` then `changed.has(column)` — a native attribute matched via its
   **column** name;
3. `CHANGED_FIELDS_CUSTOM_SENTINEL` — the literal string **`"customFields"`** (`:171`) — selects any
   formula reading any non-native field.

**`dedup.ts:325-334` builds `fieldChanges` with keys `customFields.${key}`.** That map is the
**audit diff**, and its keys are *wrong* for `changedFields`: `"customFields.Origem"` matches neither
(1) nor (2), and it is not the sentinel. Passing `Object.keys(fieldChanges)` would produce a call
that recomputes **nothing** — a fix that ships green over the defect.

**Two correct constructions:**

```ts
// (a) PRECISE — mirrors what the four create paths already do
//     (e.g. src/app/api/v1/people/route.ts:236-238).
const survivorChangedFields = [
  ...Object.keys(nativeValues).filter(k => !Object.is(survivor[k], nativeValues[k])),  // COLUMN names
  ...Object.keys(merged.customFields).filter(
    k => !Object.is(survivorBlob[k], merged.customFields[k])),                          // BARE names
]

// (b) COARSE — safe, and what the v1 routes push when they have not diffed keys.
const survivorChangedFields = [
  ...Object.keys(nativeValues).filter(/* as above */),
  CHANGED_FIELDS_CUSTOM_SENTINEL,   // "customFields"
]
```
`nativeValues` and `merged` are already in scope at `dedup.ts:320-321`, and `survivor` /
`survivorBlob` at `:329-330`. `(a)` keeps FORMULA-02 tight; `(b)` is a wider net that
`parentChangedRefNames:766-770` explicitly supports. Either is defensible — **state which and why.**

**Recommended call, to be inserted between `dedup.ts:651` and `:653`:**
```ts
try {
  await recalculateFormulas({
    entityType,                       // MergeableEntityType ⊂ EntityType
    entityId: survivorId,
    changedFields: survivorChangedFields,
    row: outcome.survivorRow,         // already the post-merge row — .returning() at :466-470
    cascade: false,                   // block 1 already handles the reparented children
    // budget: shares nothing with block 1 today; decide whether to split FORMULA_EVALUATION_BUDGET
  })
} catch (error) {
  log.error("dedup-merge", "post-merge survivor recalculation failed", { err: error })
}
```
Three notes the planner must decide, not inherit:
- **`cascade: false` vs default `true`.** `true` would re-fan out to the survivor's children, which
  block 1 has *already* refreshed for the reparented subset — but **not** for the survivor's
  pre-existing children, whose `Organization.*` refs are now stale for a different reason. `false` is
  the conservative choice and matches block 1's own reasoning at `dedup.ts:797-800`. Say which.
- **Budget.** Block 1 spends a full `FORMULA_EVALUATION_BUDGET` across the children
  (`dedup.ts:775`). A second independent full budget doubles the worst-case evaluation count for one
  merge. `dedup.ts:726-731` is explicit that one shared budget across the whole post-commit block is
  the property that matters. Either share a decrementing counter across both blocks or state the
  doubling as accepted.
- **Ordering vs block 1.** The survivor's formulas feed `Organization.*` into its children. Running
  the survivor **first** means block 1's children read fresh parent values. Running it second means
  they read stale ones. **Run the survivor first.**

### What "a fresh computation from post-merge values" concretely compares against

The stored value is `record.customFields[<formulaName>] === { formula: true, value: V, error: null }`.
The fresh computation must be produced **independently of the code under test**, or the assertion is
a tautology. Two honest options:

- **Recompute via a second, independent path:** after the merge, `UPDATE` the survivor's
  `customFields` to blank the formula key, then call `recalculateFormulas` directly with the same
  inputs and compare. This proves the merge produced the same answer a plain edit would — which is
  exactly FORM-01's asymmetry ("edit a field by hand and its dependent formulas update; take that
  same field's value from the loser during a merge and they do not").
- **Compute the expected value in the test** from the survivor's post-merge inputs, using a formula
  simple enough to be unambiguous (`{{Value}} * 2`, or a concatenation). Cheapest, and it makes the
  assertion legible in the failure message.

Prefer the second for the primary assertion and the first as a corroborating one.

**What would go RED if the defect returned:** delete the new `recalculateFormulas` call and the
survivor's stored formula value stays at its pre-merge computation. With a formula over a field the
**loser won**, pre- and post-merge values differ, so the assertion discriminates. **The test must
take the loser's value for the formula's input field** — if the survivor wins every field, the
correct answer and the stale answer are the same number and the test passes either way. This is the
same trap as the zero-definitions one, one level down. Say it in the plan.

---

## SC-4 — a 201 body that matches a GET (DATA-02)

### Q: does a `get{Entity}` read helper exist? **No — not for any of the four.**

`[VERIFIED: read all four `[id]/route.ts` GET handlers in full]`

| Entity | Where the GET-by-id read lives | Shape |
|---|---|---|
| organizations | `organizations/[id]/route.ts:31-48` (inline) | `db.query.organizations.findFirst({ where: and(eq(id), eq(ownerId, ctx.userId), isNull(deletedAt)), with: expand.has("owner") ? {…} : undefined })` |
| people | `people/[id]/route.ts:86` (inline) | same shape + `organization` expand; serialized at `:119`, expands merged at `:128` |
| deals | `deals/[id]/route.ts:87` (inline) | same shape + stage/org/person expands; serialized at `:141` |
| activities | `activities/[id]/route.ts:112` (inline) | same shape + `type`/`deal`(+its org/person)/`owner` expands, hand-merged at `:126-158` |

There is **no** `getOrganization` / `getPerson` / `getDeal` / `getActivity` anywhere. The GET path is
`findFirst` + `serialize{Entity}` in every case, and the **only** thing the GET does that the POST
would need is nothing at all: `?expand=` is a query-parameter concern of a read, and a 201 body does
not carry expands today. **The four are symmetric for this purpose.**

The serializers are pure and derivation-free — verified in full at `serialize.ts:33-103`; every one
is `custom_fields: X.customFields` verbatim (`:40, :61, :83, :103`), and the only transforms are
`toIsoString`, `parseFloat` on `value`/`position`, and `full_name` string concatenation.

**Therefore: a plain `db.query.{table}.findFirst({ where: eq(table.id, <newId>) })` +
`serialize{Entity}(row)` in the POST handler is the canonical read.** Exactly the shape
`organizations/[id]/route.ts:123-127` already ships. Because the insert just proved the row exists
and the caller is proved to be the owner (the insert wrote `ownerId: context.userId`), the re-read
does not need the ownership term — but adding `eq(ownerId, context.userId)` costs nothing and makes
the predicate self-evidently correct. **Adding it is recommended;** it also means the re-read pattern
is byte-identical to the GET's.

**Placement constraint:** a shared helper cannot live in a `route.ts` (Next.js validates the export
surface — `src/lib/api/stage-scope.ts:55-57`). If the four re-reads are factored, the factor lives in
`src/lib/api/`.

### Q: does anything diverge TODAY? **No. DATA-02 is a purely latent defect.**

This is the answer that most changes the proof, so here is the evidence chain in full.

1. The divergence source is `recalculateFormulas` writing `customFields` **after** the row the 201
   serializes was captured. `[VERIFIED: organizations.ts:229-256 — `.returning()` at `:237`, recalc
   at `:241-246`, and `return { …, organization }` at `:256` returns the **pre-recalc** row while the
   recalculated blob goes only into the `crmBus.emit` at `:249-254`]` Same shape inline in the
   people and deals routes.
2. `recalculateFormulas` writes **only** when `inScope.length > 0`, which requires at least one
   `type='formula'` definition with a non-empty `config.expression`
   (`formula-recalc.ts:281-283, :343-344, :663-669`).
3. **Measured 2026-08-26 against the running database:** `select type, count(*) from
   custom_field_definitions where deleted_at is null group by type` →
   `text 62, multi_select 56, single_select 28, number 12, date 11`. **169 total, `formula` absent,
   `file` absent.** `[VERIFIED: docker compose exec -T postgres psql]`
4. `stripCallerFormulaKeys` runs **before** the insert (`organizations.ts:225-227`), so the persisted
   blob is already the stripped one — the 201 serializes exactly what was stored.
5. The recalc write **does not touch `updatedAt`** (`formula-recalc.ts:968-970`), so even
   `updated_at` cannot diverge.
6. The serializers add no derivation (item above).

**Conclusion: with 0 formula definitions there is no field, native or custom, on which the 201 body
and a subsequent GET can currently differ.** A DATA-02 test written against live definitions is green
before the fix and green after it — **the exact trap SC-3 names, arriving in SC-4.**

**So the SC-4 proof must manufacture the divergence.** Create a `type='formula'` definition with
`config: { expression: "…" }` over a field the create writes (e.g. `{{Title}}` for a deal,
`{{Name}}` for an organization), then `POST`, then `GET`, and assert the 201's
`custom_fields[<formulaName>]` equals the GET's. **Before the fix that assertion must be red** — and
plan for the executor to observe it red, because the milestone's rule is that a gate with no recorded
red observation is not delivered. A cheap negative control: assert the 201's value is **not**
`undefined` and **not** the pre-recalc blob, so a fix that returns an empty object cannot pass.

**Named-integer floor:** assert the created definition exists (count `>= 1` for
`entity_type = X and type = 'formula'`) before the body assertions, so a fixture that silently failed
to insert cannot leave the proof passing on a vacuous comparison.

### The named suite-breakers — SIX, not two

**Set A — the roadmap's "two plan 34-02 fixture assertions".** Located precisely:

| # | File:line | Current assertion | Breaks when |
|---|---|---|---|
| A1 | `src/lib/mutations/organizations.test.ts:134` | `expect(result).toEqual({ success: true, id: "org1", organization: fakeOrg })` | **only** if `createOrganizationMutation`'s return value changes |
| A2 | `src/lib/mutations/organizations.test.ts:600` | `expect(result).toEqual({ success: true, id: "org1", organization: preRecalcOrg })` (inside `"still succeeds and still emits when recalculation rejects (D-05)"`) | same |

`[VERIFIED: read both, plus the `preRecalcOrg` fixture at `organizations.test.ts:478-490` — its
`customFields` is `{ Origem: ["Outbound Manual"], Score: { formula: true, value: 0, error: null } }`,
and the mocked recalc resolves with a *different* blob]` This matches
`34-07-SUMMARY.md:204` verbatim: "two plan 34-02 assertions that compare the result against the
fixture by identity".

**These two do NOT break under the route-level placement.** That is a strong argument for the route
placement — and it means the roadmap's named trap is avoidable rather than mandatory. **Say so
explicitly in the plan** rather than leaving a reader to conclude the trap was missed.

**Set B — the two tests that pin the defect by name and break under ANY implementation.** These are
the real breakers, and the roadmap does not name them:

| # | File:line | Test title | Current assertion | Must become |
|---|---|---|---|---|
| B1 | `src/app/api/v1/deals/__tests__/formula-recalc.test.ts:360` (assertion at **:367**) | `"leaves the 201 body pre-recalc — backlog 999.23, deferred for all four entities"` | `expect(body.data.custom_fields).toEqual(STORED_CUSTOM_FIELDS)` where `STORED_CUSTOM_FIELDS = { Origem: ["Inbound"] }` (`:115`) | **inverted**: the 201 body must now equal `RECALC_RESULT` (`:121-124` = `{ Origem:["Inbound"], Margin:{formula:true,value:1035,error:null} }`), and must **not** equal `STORED_CUSTOM_FIELDS`. Rename the test and rewrite the comment at `:364-366`, which currently asserts the deferral as intentional. |
| B2 | `src/app/api/v1/people/__tests__/formula-recalc.test.ts:347` (assertion at **:354**) | identical title | `expect(body.data.custom_fields).toEqual(STORED_CUSTOM_FIELDS)` | same inversion |

`[VERIFIED: read both tests and both fixture constants]` Both files also carry a `RECALC_RESULT`
"deliberately NOT equal to `STORED_CUSTOM_FIELDS`, so an implementation that emitted the pre-recalc
blob could not pass by accident" (`deals/…:118-119`, `people/…:115`) — so the inverted assertion is
already discriminating by construction. **This is the best news in this section: B1/B2 become the
SC-4 unit-level proof for two of the four entities for free.**

**Set C — mechanical breakage from the re-read itself.** Both these files mock `@/db` wholesale, so a
new `db.query.{table}.findFirst` call resolves `undefined` and `serialize{Entity}(undefined)` throws.

| # | File:line | Why | Fix |
|---|---|---|---|
| C1 | `src/app/api/v1/activities/__tests__/route.test.ts:336` (`"owns a new activity to the caller when owner_id is omitted"`) and **:347** (`"accepts owner_id when it is the caller's own id"`) — both `expect(response.status).toBe(201)` | `createActivityMutation` is mocked (`mockCreateActivity`); the new `db.query.activities.findFirst` is not stubbed | stub `mockDb.query.activities.findFirst` in that describe's `beforeEach` |
| C2 | the POST describes in `deals/__tests__/formula-recalc.test.ts` and `people/__tests__/formula-recalc.test.ts` | same reason — the files stub `mockDb.query.stages.findFirst` (`deals/…:274`) but not the entity's own `findFirst` | stub `mockDb.query.{deals,people}.findFirst` to return the post-recalc row |

`src/app/api/v1/organizations/route.ts` has **no test file at all** — the collection route is
untested. `[VERIFIED: the only test under `organizations/` is `[id]/__tests__/route.test.ts`]` So
organizations' POST gets no unit-level breakage and no unit-level coverage. That is a gap the plan
should close, not inherit.

**Also amend in the same commit — three stale in-code comments that will become false:**
`src/app/api/v1/people/route.ts:260-262` and `src/app/api/v1/deals/route.ts:351-353`
(both read "The 201 body deliberately carries the PRE-recalc row … changing a create response is
backlog 999.23"), plus the test comments at `deals/…:364-366` and `people/…:351-353`.

### Gates that are NOT at risk from SC-4 — checked, so no plan spends time on them

- **`src/app/api/v1/__tests__/route-authorization.test.ts`** — every floor is
  `toBeGreaterThanOrEqual` (`:1601, :1610, :1622, :1630, :1661, :1668, :1675, :2041`), so *adding*
  code cannot trip them. `MIN_EXEMPT_MATCHED` is an exact `toBe(9)` (`:1739`) but counts exempt
  *paths*, and `SUPPRESSED_BY_EXEMPTION`'s `toEqual` (`:2096`) lists suppressed offenders — a re-read
  adds neither. Adding `eq(table.ownerId, context.userId)` to a POST only strengthens rule R1.
  `[VERIFIED: read the header and every floor]`
- **`src/app/api/v1/__tests__/openapi-error-coverage.test.ts`** — DATA-02 changes no status code and
  no path item. `MIN_PATH_ITEMS`/`MIN_OPERATIONS` are floors (`:427, :434`); the exact
  `EXPECTED_*_SUBJECTS` counts (`:458-475`) are measured against lists declared *inside the test
  file*, so only editing those lists moves them. **CONTEXT.md's note that "that gate's scope may need
  an entry" is only true if the plan adds a status code — the canonical read does not.**
- **`src/lib/trash/dispatch.test.ts:180`** — `expect(returned).toEqual({ success: true, detached: 7 })`
  is asserted against a **spy's** resolved literal, so it is immune to a widened `PurgeResult`. The
  eleven at-risk assertions are in the four **mutation** test files, listed under § Alternatives
  Considered.

---

## Common Pitfalls

### Pitfall 1: A proof that passes on an empty set
**What goes wrong:** 0 formula definitions, 0 file definitions, 0 stored file descriptors, 0 blobs on
disk. Any test that reaches for existing data asserts about nothing.
**Why it happens:** the defects are all dormant; the data that would activate them does not exist.
**How to avoid:** every one of SC-2, SC-3, SC-4 creates its own `custom_field_definitions` row and
(for SC-2) its own bytes. Every count assertion carries a named-integer floor asserted **before** the
behavioural assertion.
**Warning signs:** a test that queries live data; an assertion of the form `expect(x).toEqual([])`
with no accompanying "and the input was non-empty" check.

### Pitfall 2: `changedFields: ["customFields.Origem"]`
**What goes wrong:** `recalculateFormulas` scopes to nothing, writes nothing, returns
`evaluations: 0`. DATA-01 ships green over the defect.
**Why it happens:** `dedup.ts:331-334` builds exactly that spelling one screen above the insertion
point, for the audit diff. It reads like the right array.
**How to avoid:** bare custom-field names, column names for natives, or the literal
`CHANGED_FIELDS_CUSTOM_SENTINEL`. See § SC-3.
**Warning signs:** a DATA-01 test that passes without the survivor's formula key changing value;
`evaluations: 0` in the result.

### Pitfall 3: A merge where the survivor wins every field
**What goes wrong:** the correct value and the stale value are identical, so SC-3's assertion cannot
discriminate.
**How to avoid:** the fixture must take the **loser's** value for the field the formula reads.
**Warning signs:** the test's `choices` map is empty or all-survivor.

### Pitfall 4: The re-read placed in the mutation
**What goes wrong:** breaks A1/A2 needlessly, and cannot cover people/deals at all because those two
POSTs do not call a create mutation.
**How to avoid:** route-level, all four.

### Pitfall 5: Refactoring the file route's `process.env.UPLOAD_DIR` read
**What goes wrong:** `src/lib/__tests__/compose-uploads-persistence.test.ts:399-404` asserts the
literal string appears in that file. Red.
**How to avoid:** keep the read in the route, or amend that gate in the same commit and say why.
Its own house rule (quoted at `:390-393`) is "on a collision REWORD THE PROSE, never weaken the
gate" — which here means the *code* must keep the token, not that the gate should be loosened.

### Pitfall 6: A `chmod`-based failure injection that silently succeeds
**What goes wrong:** as root, `unlink` ignores directory permissions; the "failure path" test exercises
the success path and passes.
**How to avoid:** the `EISDIR` seam (option A), or assert the injection took before asserting the
consequence.

### Pitfall 7: Assuming SC-1 closes the S3 case
**What goes wrong:** under `FILE_STORAGE=s3` the stored `publicUrl` is
`${S3_PUBLIC_URL}/${key}` (`upload/route.ts:89`) — the app route is never consulted. The route guard
protects nothing there.
**How to avoid:** state the scope. `FILE_STORAGE` is unset in this deployment, so `'local'` is the
configuration under test, and the S3 exposure is a separate (bucket-policy) problem.

### Pitfall 8: Two `*.db.test.ts` files in one wave
**What goes wrong:** `scripts/dedup-db-test-setup.sh` **drops every non-system schema** in
`pipelite_dedup_test` and reloads from a fresh `pg_dump` on every `npm run test:db`. Two parallel
worktree executors each running it destroy each other's fixtures mid-run.
**Note the nuance:** *within* one run this is safe — `vitest.db.config.ts` sets
`fileParallelism: false` and `sequence: { concurrent: false }` (`:107-112`). The hazard is **two
concurrent executors**, which is what worktree parallelism produces.
**How to avoid:** honour CONTEXT.md's wave rule.

### Pitfall 9: The `dedup.db.test.ts` fixture-parity `afterAll`
**What goes wrong:** that file's `afterAll` asserts zero `dedupdbt-`-prefixed rows remain **and** that
each table's total `count(*)` is unchanged, across six tables (header, `:75-82`). A test that creates
a `custom_field_definitions` row and does not clean it up fails the parity check — and the failure
message will point at the wrong thing.
**How to avoid:** if SC-3's proof extends that file, extend the fixture discipline to a **seventh**
table with the same prefix convention and the same `like(column, 'dedupdbt-%')` delete.

### Pitfall 10: `DEF-48-01` — `npm run test:db` exits non-zero on a green suite
`views/queries.db.test.ts`'s `afterAll`. **Never gate on its exit code.** Read the pass counts.

---

## Code Examples

### Enumerating a record's blob refs (the shape `collectFileFieldRefs` should return)
```ts
// Derived from: src/components/custom-fields/file-field.tsx:14-22 (the writer)
//               src/app/api/upload/route.ts:79,92-101 (the key/path builder)
//               src/lib/audit/present.ts:264-268      (the existing shape predicate)
export interface BlobRef {
  entityId: string
  fieldName: string
  storedName: string
}

/** Every blob a record's customFields references. Pure; no I/O; never throws. */
export function collectFileFieldRefs(
  entityId: string,
  customFields: unknown
): BlobRef[] {
  if (customFields === null || typeof customFields !== "object" || Array.isArray(customFields)) {
    return []
  }
  const refs: BlobRef[] = []
  for (const [fieldName, value] of Object.entries(customFields as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue          // a file field is ALWAYS an array or null
    for (const item of value) {
      if (item === null || typeof item !== "object") continue
      const stored = (item as { storedName?: unknown }).storedName
      if (typeof stored !== "string" || stored === "") continue
      refs.push({ entityId, fieldName, storedName: stored })
    }
  }
  return refs
}
```
**Why it walks blindly rather than reading `custom_field_definitions`:** the definition may already
have been soft-deleted while the values remain in the JSONB, and `getActiveFieldDefinitions` filters
`deleted_at is null`. A definition-driven walk would silently leak those blobs — the exact failure
class this phase is closing. This mirrors `audit/present.ts`'s choice to infer from the value shape
so the module stays db-free.

### The post-commit deletion block (goes immediately before each `return { success: true, … }`)
```ts
// Insertion points, verified: organizations.ts:646, people.ts:650, deals.ts:754, activities.ts:504
// PATTERN SOURCE: src/lib/mutations/dedup.ts:627-651

// ---- AFTER THE COMMIT. Best-effort; never rethrows. SC-2 requires the purge stay committed
//      even when storage deletion fails, so a throw here would be the defect.
try {
  const { deleted } = await deleteEntityFiles(refs)
  if (deleted !== refs.length) {
    // Identifiers and counts only — never a filename (T-37-30, src/lib/trash/prune.ts:212-213).
    log.error("mutations/organizations", "blob deletion incomplete after purge", {
      entityType: ENTITY,
      id,
      expected: refs.length,
      deleted,
    })
  }
} catch (error) {
  log.error("mutations/organizations", "blob deletion failed after purge", { err: error })
}

return { success: true, detached }   // ← SHAPE UNCHANGED. See § Alternatives Considered.
```

### The canonical create read (goes at each POST's `createdResponse`)
```ts
// Source pattern: src/app/api/v1/organizations/[id]/route.ts:121-127 (the shipped PUT re-read)
// Replaces: src/app/api/v1/organizations/route.ts:109
//           src/app/api/v1/people/route.ts:263
//           src/app/api/v1/deals/route.ts:354
//           src/app/api/v1/activities/route.ts:238

// DATA-02: the 201 body is a CANONICAL READ, not the .returning() row. `recalculateFormulas`
// runs between the insert and here and writes `customFields` (src/lib/formula-recalc.ts:964-967),
// so serializing the inserted row would ship a value a subsequent GET contradicts. It writes no
// other column — `updatedAt` is deliberately left alone (formula-recalc.ts:968-970) — so this read
// differs from the inserted row in `custom_fields` and nowhere else.
const canonical = await db.query.organizations.findFirst({
  where: and(
    eq(organizations.id, result.id),
    eq(organizations.ownerId, context.userId),
  ),
})

// The insert just committed and wrote `ownerId: context.userId`, so this cannot be undefined.
// Falling back to the inserted row rather than throwing keeps a create from failing on a read.
return createdResponse(
  serializeOrganization(canonical ?? result.organization)
)
```
**The `?? result.organization` fallback is a decision, not boilerplate.** It makes a 201 always
possible, at the cost of silently reintroducing the pre-recalc body in the impossible case. The
alternative is a 500. Whichever the plan picks, if the fallback stays, it needs its own `log.error`
so the impossible case is not silent — otherwise the fix has a path that reproduces the defect and
says nothing.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| `prune.ts` comment claimed blobs were handled | comment states the gap honestly (`:66-73`) | Phase 37 review (CR-01) | the **documentation** half of CR-01 is closed; the leak and the route are not. This phase closes the other two. |
| `PUT /api/v1/organizations/[id]` did its own second `db.update` after the mutation | routed through the mutation; one write, one place | plan 34-07 (comment at `[id]/route.ts:100-105`) | the T-34-19 client-controlled-overwrite threat; the canonical-read placement in POST must not reintroduce a second write |
| `/api/v1` tests authenticated by mocking `@/lib/api/auth` | `mintApiKey` drives real `withApiAuth` | Phase 48 | five db-tests use it; do **not** build a sixth harness — but it does not apply to the session-auth file route |
| `as SQL` casts on collapsed predicates | `requireScopedPredicate` | Phase 48 (WR-11/CR-05) | any new predicate builder in this phase should use it |
| the migration chain could not build from zero | it can; `db:check-migrations` proves it | Phase 46 | `dedup-db-test-setup.sh` still uses a schema dump, for **faithfulness** not capability — its own header (`:22-43`) says so |

**Deprecated / outdated in this area:**
- Any claim that the file route is covered by `/api/v1` authorization gates. It is not — different
  directory root.
- Any claim that a purged record's file URL is recoverable "indefinitely". `audit.retention_days = 90`,
  measured.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | `fs.promises.unlink` on a **directory** raises `EISDIR` on Linux at any uid, making it a deterministic failure-injection seam. Reasoned from POSIX `unlink(2)`, **not executed in this session.** | SC-2 § injection | If it instead raises `EPERM`, or if Node maps it differently, the SC-2 injection test needs a different seam. **Cheapest check: one `node -e` in the intended test environment before the plan commits to it — 5 seconds.** |
| A2 | A `POST` that adds a `db.query.{table}.findFirst` call cannot introduce an offender in `route-authorization.test.ts`'s R1-R5 classification. Reasoned from reading the header and the floors; the detector's rule bodies were **not** read line by line. | SC-4 § gates not at risk | A false positive turns that gate red. Low risk (the added code is the canonical R1 shape), and the failure is loud and immediate. |
| A3 | Encoded traversal (`%2e%2e%2f`) reaching the handler as a literal `..` in `params.filename` is **unresolved** — the 401 fires first, so it could not be observed. | SC-1 § containment | If Next.js normalises it away, the prefix-containment check is belt-and-braces rather than load-bearing. Either way the **JSONB-reference match** closes it, so the fix is correct under both answers. Cheapest resolution: a unit test that calls the exported `GET` directly with `params: Promise.resolve({ filename: "../../../etc/passwd" })`, bypassing routing — which is the honest test anyway, since a handler must be safe against its own inputs. |
| A4 | No live data anywhere carries a file blob. Measured via `custom_fields::text like '%storedName%'` across all four tables and `audit_log.changes::text`. A file descriptor written *without* a `storedName` key would evade it. | Runtime State Inventory | Would mean the SC-2 proof has real subjects after all (better, not worse). The `path`/`size`/`mimeType` variants named by `present.ts:267` were not separately counted — **cheapest check: repeat the query for `'%publicUrl%'`.** |

Everything else in this document is `[VERIFIED: …]` — read from this tree, measured against the
running container, or executed — as tagged inline.

---

## Open Questions (ALL RESOLVED — carried into plan decisions 2026-08-26)

> **Resolution map, added after planning.** Every question below was answered as an explicit stated
> decision in a plan, not left open:
> Q1 trashed-record file access → **refuse** (`49-04`, constraint 4) ·
> Q2 empty-directory pruning → **out of scope, stated in code** (`49-02`, constraint 5) ·
> Q3 `?expand=` on a 201 → **no** (`49-03`, constraint 6) ·
> Q4 merge entry points → **`mergeRecordsMutation` only** (`49-08`, constraint 12) ·
> Q5 the missing organizations collection test → **create it** (`49-03`).
> Flagged by the plan checker as a Dimension-11 format gap: the recommendations were carried through
> substantively, but no question carried a literal `RESOLVED` marker, so the record read as open work.

1. **Should a file belonging to a SOFT-DELETED (trashed) record still serve?**
   - What we know: the four GET-by-id routes all carry `isNull(deletedAt)`. `/trash` lists trashed
     records and a restore-review flow may want to see attachments. CONTEXT.md locks "resolve
     `entityId` and apply the ownership predicate" and "404 for a foreign or missing record" but does
     not say whether trashed counts as missing.
   - What's unclear: whether refusing a trashed record's file breaks a restore-review path.
   - Recommendation: **include `isNull(deletedAt)` — refuse.** It is the conservative direction, it
     matches every other record read in the product, and SC-1's own wording is "a request … which no
     longer exists returns no bytes". State it as a decision in the plan so it is visible, and record
     the restore-review consequence.

2. **Does `deleteEntityFiles` also prune the now-empty `${UPLOAD_DIR}/${entityId}/` directory tree?**
   - What we know: `upload/route.ts:92-95` creates `${UPLOAD_DIR}/${entityId}/${fieldName}` with
     `mkdir -p`. Nothing ever removes it. A purge that deletes every blob leaves two empty
     directories per field, forever — a smaller version of the same monotonic-growth complaint CR-01
     makes about the bytes.
   - Recommendation: **out of scope, recorded.** `rmdir` racing a concurrent upload into the same
     directory is a real hazard for a marginal gain, and SC-2 says "the blob is gone", not "the
     directory is gone". Name it in the plan as deliberately not done.

3. **Should `POST /api/v1/{entity}` honour `?expand=` in its 201 body?**
   - What we know: the GET-by-id paths merge expands after serializing; the POSTs do not accept the
     parameter today. CONTEXT.md scopes the match to **custom-field VALUES**.
   - Recommendation: **no.** Out of scope, and adding it would move `openapi-error-coverage`'s
     surface.

4. **Does DATA-01 also need to cover `PUT`/bulk merge entry points, or only `mergeRecordsMutation`?**
   - What we know: `mergeRecordsMutation` is the single merge path (`dedup.ts`), reached from
     `src/app/organizations/actions.ts` and the dedup UI. No `/api/v1` merge endpoint was found.
   - Recommendation: `mergeRecordsMutation` only. If a plan finds a second merge writer, that is a
     finding.

5. **Is `src/app/api/v1/organizations/route.ts` gaining a test file part of this phase?**
   - What we know: it has none. The other three POSTs have unit coverage that this phase must amend
     anyway.
   - Recommendation: **yes, add one.** Four entities in the criterion, three with unit coverage, is
     how a fix half-ships. Small file; the `deals/__tests__/formula-recalc.test.ts` structure is the
     template.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Docker + `pipelite` stack | every live proof | ✓ | app on host **3001**, Postgres on host **5433** | none — `docker` needs **no** `sudo` (user in `docker` group) |
| PostgreSQL `pipelite` (dev) | measurement only, read-only | ✓ | reachable via `docker compose exec -T postgres psql -U pipelite -d pipelite` | none |
| PostgreSQL `pipelite_dedup_test` | `npm run test:db` | ✓ (provisioned per run) | rebuilt by `scripts/dedup-db-test-setup.sh` from a schema-only dump | none |
| `E2E_DATABASE_URL` | `vitest.db.config.ts` derives `DATABASE_URL` from it | ✓ (in `.env`, host form since Phase 46) | `@localhost:5433` | none — `@/db` throws a named error if absent |
| Node | host test process | ✓ | container is `node:24-alpine` (Phase 46) | none |
| `/app/uploads` volume | container-side blob storage | ✓ **and empty** | `UPLOAD_DIR=/app/uploads`, hardcoded in compose | — |
| S3 (`S3_ENDPOINT`, `S3_BUCKET`, `S3_PUBLIC_URL`) | the S3 branch of both file routes | ✗ **not configured** | `FILE_STORAGE` unset → `'local'` | **the S3 branch cannot be proven behaviourally in this environment.** Mock-level only, and say so. |
| `curl` to `localhost:3001` | HTTP-level probes | ✓ | verified today | none |

**Missing dependencies with no fallback:** none.

**Missing with a fallback:** S3. The `deleteEntityFiles` S3 branch and SC-1's S3 read/delete guards
**cannot be verified against a real bucket here.** Any plan claiming an S3 proof must say the proof is
a mock. **The host test process also cannot see the container's `/app/uploads` volume** — a
filesystem-level SC-2 proof run from the host must set `UPLOAD_DIR` to a host temp directory
*before* the module under test is imported (both file routes read `process.env` at
module-evaluation time), or run inside the container.

---

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json`. `[VERIFIED]`

### Test Framework

| Property | Value |
|---|---|
| Framework | vitest, **three** projects |
| Config — base (unit; runs in CI) | `vitest.config.ts` — **excludes** `*.db.test.*` and `*.rsc.test.*` |
| Config — RSC | `vitest.rsc.config.ts` |
| Config — live DB (**opt-in only**) | `vitest.db.config.ts` — `include: ['src/**/*.db.test.?(c\|m)[jt]s?(x)']`, `fileParallelism: false`, `sequence.concurrent: false`, timeouts 60 s |
| Quick run (a single file) | `npx vitest run <path>` |
| Full base suite | `npm test` (= `vitest run && vitest run --config vitest.rsc.config.ts`) |
| Live-DB suite | `npm run test:db` (runs `scripts/dedup-db-test-setup.sh` first) — **⚠ DEF-48-01: exits non-zero on a GREEN suite. Never gate on its exit code; read the pass counts.** |
| Baseline to beat (Phase 48 gate) | **5376 passed / 32 skipped**, RSC 8/8, `tsc --noEmit` 0, lint **0 errors** / 122 warnings, `test:db` **98 passed** across 4 files |

**Lint:** gate on **errors**, never on the warning total — it differs between the main tree (124) and
a worktree (122) because of `.planning`'s untracked files.

### Phase Requirements → Test Map

| Req | Behaviour | Type | Automated command | File exists? |
|---|---|---|---|---|
| SEC-04 / SC-1 | `GET` a file of a record the caller does not own → 404, zero bytes | live-DB, `vi.mock("@/auth")` + real `db` | `npx vitest run --config vitest.db.config.ts src/app/api/files/__tests__/files-route-ownership.db.test.ts` | ❌ **Wave 0** |
| SEC-04 / SC-1 | `DELETE` the same → 404, and the blob is still on disk afterwards | same file | same | ❌ Wave 0 |
| SEC-04 / SC-1 | `filename = "../../../etc/passwd"` → 404, and `readFile` was never called outside `UPLOAD_DIR` | **unit**, handler called directly with a crafted `params` promise | `npx vitest run src/app/api/files/__tests__/route-containment.test.ts` | ❌ Wave 0 |
| SEC-04 / SC-1 | a `filename` not present in the record's JSONB → 404 | unit, same file | same | ❌ Wave 0 |
| SEC-04 / SC-2 | after purge: blob absent from disk, and its URL serves nothing | live-DB | `npx vitest run --config vitest.db.config.ts src/lib/trash/__tests__/purge-blobs.db.test.ts` | ❌ Wave 0 |
| SEC-04 / SC-2 | injected storage failure → purge still **committed**, mismatch logged with `{expected, deleted}` | live-DB, same file | same | ❌ Wave 0 |
| SEC-04 / SC-2 | `collectFileFieldRefs` on: null, `{}`, a non-array value, an array of non-objects, a well-formed array | **unit**, pure | `npx vitest run src/lib/trash/__tests__/collect-file-field-refs.test.ts` | ❌ Wave 0 |
| DATA-01 / SC-3 | merging two records whose formula inputs disagree, **taking the loser's input**, leaves the survivor's stored formula value equal to a fresh computation | live-DB | `npx vitest run --config vitest.db.config.ts src/lib/mutations/dedup.db.test.ts` (extend) or a sibling `dedup-formula.db.test.ts` | ⚠ extend / ❌ new |
| DATA-01 / SC-3 | the call is made post-commit with a **bare-name** `changedFields` and `cascade: false` | **unit**, mocked recalc | `npx vitest run src/lib/mutations/dedup.test.ts` (extend) | ⚠ extend |
| DATA-01 / SC-3 | a rejected recalculation does not fail the merge (D-05) | unit, same | same | ⚠ extend |
| DATA-02 / SC-4 | 201 `custom_fields` == subsequent GET `custom_fields`, **all four entities**, with a purpose-built formula field | live-DB, `mintApiKey` over real `withApiAuth` | `npx vitest run --config vitest.db.config.ts src/app/api/v1/__tests__/create-response-canonical.db.test.ts` | ❌ Wave 0 |
| DATA-02 / SC-4 | 201 carries the POST-recalc blob (unit, deals) | unit — **B1 inverted** | `npx vitest run src/app/api/v1/deals/__tests__/formula-recalc.test.ts` | ✅ amend `:360-368` |
| DATA-02 / SC-4 | 201 carries the POST-recalc blob (unit, people) | unit — **B2 inverted** | `npx vitest run src/app/api/v1/people/__tests__/formula-recalc.test.ts` | ✅ amend `:347-355` |
| DATA-02 / SC-4 | organizations POST 201 shape | unit | `npx vitest run src/app/api/v1/organizations/__tests__/route.test.ts` | ❌ **Wave 0 — no test file exists for this route at all** |
| DATA-02 / SC-4 | activities POST still 201 with the re-read (C1 stub) | unit | `npx vitest run src/app/api/v1/activities/__tests__/route.test.ts` | ✅ amend `:336`, `:347` |

### Sampling Rate

- **Per task commit:** the one or two files the task touched — `npx vitest run <paths>`.
- **Per wave merge:** `npm test` (base + RSC) and `npx tsc --noEmit`, plus `npm run test:db` for any
  wave containing a `*.db.test.ts` change (**read the counts, not the exit code**).
- **Phase gate:** `npm test` at ≥ 5376 passed with 0 failures, RSC 8/8, `tsc --noEmit` 0, lint 0
  errors, `npm run test:db` ≥ 98 passed **plus** every new db-test file green, `npm run
  db:check-migrations` 0, `npm run security:audit` 0, and — because
  [`docker restart` does not rebuild] — a **`docker compose build` + `up -d`** followed by
  `/api/health` 200 with 10/10 processors before any behavioural claim about the container.

### Wave 0 Gaps

- [ ] `src/lib/trash/__tests__/collect-file-field-refs.test.ts` — pure-function coverage for SEC-04/SC-2
- [ ] `src/app/api/files/__tests__/route-containment.test.ts` — unit containment + JSONB-match, SEC-04/SC-1
- [ ] `src/app/api/files/__tests__/files-route-ownership.db.test.ts` — SEC-04/SC-1 behavioural
- [ ] `src/lib/trash/__tests__/purge-blobs.db.test.ts` — SEC-04/SC-2 behavioural + injected failure
- [ ] `src/app/api/v1/__tests__/create-response-canonical.db.test.ts` — DATA-02/SC-4, four entities
- [ ] `src/app/api/v1/organizations/__tests__/route.test.ts` — **the collection route has no test file**
- [ ] a fixture helper that creates a `custom_field_definitions` row (`type: 'formula'` with
      `config.expression`, and `type: 'file'`) with the suite's id/name prefix, plus its teardown —
      **needed by three of the four criteria**, and `dedup.db.test.ts`'s parity `afterAll` must learn
      about that table
- [ ] no framework install needed

---

## Security Domain

`security_enforcement` is absent from `.planning/config.json` → treated as **enabled**.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard control, in this tree |
|---|---|---|
| V1 Architecture | yes | the authorization boundary is the route, per `dispatch.ts:20-26`; do not push it into the mutation layer |
| V2 Authentication | **no change** | `auth()` for the file route, `withApiAuth` for `/api/v1`. Both unchanged. CONTEXT.md forbids inventing a `withApiAuth` twin for files. |
| V3 Session Management | no | untouched |
| **V4 Access Control** | **YES — this is the phase** | owner-scoped predicate in the query + **404** for foreign/missing (Phase 48 house pattern), enforced via `requireScopedPredicate` |
| V5 Input Validation | **YES** | the three URL segments are unvalidated today. Containment = `path.relative` prefix check **plus** the JSONB `storedName` match. |
| V6 Cryptography | no | nothing hand-rolled; `mintApiKey` transcribes `api-keys.ts` |
| V7 Error handling / logging | **YES** | the mismatch log must carry identifiers and counts only, never a filename (T-37-30) |
| V8 Data protection | **YES** | SEC-04's whole subject: bytes surviving a "permanent" delete |
| V12 File handling | **YES** | path traversal, storage-name allowlisting |
| V13 API | yes | 404-not-403 to avoid an existence oracle |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard mitigation | Present today? |
|---|---|---|---|
| IDOR on a file URL — any signed-in user downloads any file | Information disclosure | owner-scoped resolution before serving | **NO — the defect.** `files/…/route.ts:38-44` |
| IDOR on a destructive verb — any signed-in user deletes any file | Tampering / DoS | same guard on `DELETE` | **NO — the same hole.** `:99-105` |
| Path traversal via a route segment | Tampering / Disclosure | `path.relative` containment **+** allowlist the name from the record's JSONB | **NO.** `path.resolve` escape verified by execution today, via `filename` **and** `entityId` |
| Existence oracle (403-for-real beside 404-for-unknown) | Disclosure | uniform 404 | settled by Phase 48 SEC-48-A; carry it here |
| Data remanence after "permanent delete" | Disclosure / Repudiation | delete the blob post-commit, best-effort, logged | **NO — the defect.** `prune.ts:66-73` |
| Tombstone leak — the URL recoverable from `audit_log` | Disclosure | the route guard makes a recovered URL useless | tombstone confirmed present (`diff.ts:171-186`); recovery window is **90 days**, not indefinite |
| Client-set server-derived value | Tampering (T-34-04) | `stripFormulaKeys` before the write | **already mitigated** at all four create paths — the DATA-02 re-read must not weaken it |
| Unbounded formula evaluation | DoS (T-34-02) | `FORMULA_EVALUATION_BUDGET`, `CASCADE_DEPTH = 1` | mitigated; DATA-01's new call must not open a second unbounded budget — see § SC-3 |
| Collapsed `and(...)` → unfiltered query | Elevation | `requireScopedPredicate` | available; the new resolver should use it |
| Sensitive data in logs | Disclosure | identifiers and counts only | house rule, `prune.ts:212-213`; the mismatch line must obey it |

---

## Project Constraints (from CLAUDE.md)

There is **no `./CLAUDE.md`** in the repository root. `[VERIFIED: Read → file does not exist]` No
`.claude/skills/` or `.agents/skills/` either — only `.claude/settings.local.json` and
`.claude/worktrees`. `[VERIFIED: find]`

The operative directives therefore come from the user's global instructions and this project's own
memory, and they bind this phase:

- **Docker only.** Never `npm run dev`, `pnpm dev`, or `next dev`. App on **3001**, Postgres on
  **5433**. `docker` needs **no `sudo`** — never embed a password anywhere, in any plan file.
- **`docker restart` does not rebuild.** `restart` runs the OLD image; the processor "Starting" log
  line is a vacuous freshness check. Any behavioural claim about the container needs
  `docker compose build` first.
- **`rtk` mangles shell output.** `grep … | wc -l` returns a wrong count (36 measured as 19);
  redirecting filtered output into a file writes an ELIDED placeholder at exit 0; `npx <tool>` can be
  rewritten to a missing script. **Never state a count obtained through a pipe.** In this session
  every read and search went through `rtk proxy <cmd>`, which bypasses the filter and returns clean
  output — that is the workaround a plan should use for any count gate. Prefer parsed structure over
  greps regardless.
- **`.planning` is gitignored but tracked** — the GSD commit helper fails on it; force-add individual
  files only, never a directory.
- **Worktrees branch from a stale base (28/28 observed)** — fix with `merge --ff-only`, never
  `reset --hard`. Parallel executors need the three bootstrap symlinks or every verification fails.
- **Gate on lint ERRORS, never on the warning total.**
- **DEF-48-01: `npm run test:db` exits non-zero on a green suite.** Never gate on its exit code.

---

## Sources

### Primary (HIGH confidence — read in this session, from this tree)
- `src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts` — full file, 139 lines
- `src/app/api/upload/route.ts` — full file, 124 lines
- `src/components/custom-fields/file-field.tsx` — full file (the `FileItem` shape and both callers)
- `src/lib/trash/prune.ts` — full file (the gap comment, the batching, the delegation)
- `src/lib/trash/dispatch.ts` — full file (`PurgeResult`, the maps, the no-permission-check decision)
- `src/lib/mutations/dedup.ts` — the header, `:300-360`, `:440-500`, `:560-705`, `:707-802`
- `src/lib/mutations/organizations.ts` — `:60-175`, `:205-300`, `:553-651`
- `src/lib/mutations/{people,deals,activities}.ts` — the purge heads and return lines
- `src/lib/formula-recalc.ts` — `:338-396`, `:557-609`, `:650-742`, `:880-991`
- `src/lib/api/serialize.ts` — `:1-130`
- `src/lib/api/stage-scope.ts` — `:44-150`
- `src/lib/audit/diff.ts` — `:137-190`; `src/lib/audit/present.ts` — `:240-300`
- `src/lib/events/subscribers/audit.ts` — `:1-80`
- `src/app/api/v1/{organizations,people,deals,activities}/route.ts` and their `[id]/route.ts`
- `src/app/api/v1/trash/[type]/[id]/route.ts` — `:90-140`
- `src/app/api/v1/__tests__/{route-authorization,openapi-error-coverage}.test.ts` — headers + floors
- `src/app/api/v1/__tests__/api-key-fixture.ts` — `:1-90`
- `src/app/api/v1/{deals,people}/__tests__/formula-recalc.test.ts` — the POST describes and fixtures
- `src/app/api/v1/activities/__tests__/route.test.ts` — `:310-400`
- `src/lib/mutations/organizations.test.ts` — `:95-145`, `:478-625`
- `src/lib/trash/{dispatch,prune}.test.ts` — the assertion shapes
- `src/lib/__tests__/compose-uploads-persistence.test.ts` — `:330-420`
- `src/lib/mutations/__tests__/db-test-isolation.test.ts` — the three controls
- `src/lib/mutations/dedup.db.test.ts` — `:1-120` (fixture discipline)
- `src/app/import/import-owner-scope.db.test.ts` — `:44-83` (the `vi.mock("@/auth")` + real-`db` pattern)
- `vitest.db.config.ts`, `scripts/dedup-db-test-setup.sh` — full files
- `.planning/{ROADMAP,REQUIREMENTS,BACKLOG,STATE}.md` and `49-CONTEXT.md`
- `.planning/milestones/v1.3-phases/34-formula-reactivity/34-07-SUMMARY.md` — `:43`, `:204`

### Primary (HIGH confidence — measured today, 2026-08-26)
- `custom_field_definitions` by `type`, `deleted_at is null` → 169 rows; **0 formula, 0 file**
- `app_settings` → `audit.retention_days = 90`, `trash.retention_days = 30`
- `custom_fields::text like '%storedName%'` across all four CRM tables → **0**; `audit_log.changes` → **0**
- `docker compose exec app`: `UPLOAD_DIR=/app/uploads`, `FILE_STORAGE=` (unset), `/app/uploads` **empty**
- `curl localhost:3001/api/files/…` × 3 (plain + two encoded traversals) → **401** each
- `node -e` on `path.resolve` → escape confirmed via both `filename` and `entityId`

### Secondary (MEDIUM)
- `.planning/BACKLOG.md` CR-01 (`:894-921`), FORM-01 (`:625-670`), 999.23 (`:1184-1193`) — the
  original filings; each re-verified against the code above rather than taken on trust.

### Tertiary (LOW — flagged, not relied on)
- POSIX `unlink(2)` `EISDIR` semantics for the SC-2 injection seam — reasoned, **not executed**. See
  Assumptions Log A1.

---

## Metadata

**Confidence breakdown:**
- **Standard stack — HIGH.** No new dependency; every module named is already imported by shipped
  code in this tree.
- **Architecture / placement — HIGH.** Every insertion point is a line number read today, and all
  four purge mutations were confirmed symmetric by reading each.
- **The four suite-breaker sets — HIGH.** Six tests located by file, line and current expected value;
  the eleven `detached` assertions counted from clean `rtk proxy grep` output, never through a pipe.
- **Live-data measurements — HIGH.** Run against the running container today and reproduced in the
  Sources list.
- **Pitfalls — HIGH** for the ten listed; each traces to a specific line in this tree or a specific
  measurement.
- **SC-2 failure-injection seam — MEDIUM.** Option (A)'s determinism is reasoned, not executed (A1).
  Options (B) and (C) are fallbacks and one of the three will work.
- **Encoded-traversal routing behaviour — LOW.** Unresolved (A3), and deliberately routed around: the
  JSONB-reference match closes it under either answer.

**Research date:** 2026-08-26
**Valid until:** 2026-09-25 (30 days — this is an internal-code domain with no fast-moving external
dependency). **Two facts to re-measure at plan time regardless**, because three proofs depend on
them being zero: the `formula` and `file` definition counts, and the count of records carrying a
stored file descriptor.
