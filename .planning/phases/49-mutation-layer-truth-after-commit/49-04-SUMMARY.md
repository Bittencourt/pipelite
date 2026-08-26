---
phase: 49-mutation-layer-truth-after-commit
plan: 04
subsystem: api-files
tags: [security, idor, path-traversal, authorization, sec-04, sc-1]
requires:
  - "src/lib/api/stage-scope.ts requireScopedPredicate"
  - "src/db/schema (deals, people, organizations, activities)"
  - "src/db/schema/custom-fields EntityType"
provides:
  - "src/lib/api/file-access.ts findOwnedRecordById"
  - "src/lib/api/file-access.ts recordReferencesStoredName"
  - "src/lib/api/file-access.ts resolveContainedPath"
  - "an owner-scoped, reference-matched, path-contained GET and DELETE on /api/files/*"
affects:
  - "src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts"
  - "the /trash restore-review flow, which now gets 404 for a trashed record's attachments"
tech-stack:
  added: []
  patterns:
    - "the predicate-EVALUATING db mock (PgDialect().sqlToQuery over the captured where), so an owner-term ablation cannot pass vacuously"
    - "containment against the FIELD directory, matching src/lib/trash/delete-entity-files.ts"
    - "one shared guard function called by both verbs, so the destructive verb cannot be fixed-and-forgotten"
    - "the filesystem spy asserted BEFORE the status code in every refusal cell, so a red names the dangerous call"
key-files:
  created:
    - src/lib/api/file-access.ts
    - src/app/api/files/__tests__/route-containment.test.ts
  modified:
    - src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts
decisions:
  - "Containment is checked against the FIELD directory, not the upload root — a faithful root-level check was driven as an ablation and ALLOWED /tmp/uploads/org-foreign/Anexos Ação/x.pdf, a DIFFERENT record's directory"
  - "The JSONB reference match is the load-bearing check, and this was measured rather than asserted: removing it reddens 5 cells the containment check cannot cover, including the percent-encoded traversal"
  - "requireScopedPredicate does NOT fire when the owner term is dropped from a 3-term predicate (2 is not < MANDATORY_SCOPE_TERMS=2) — the predicate-evaluating db mock is what caught it, in 8 cells"
  - "isNull(deletedAt) included: a trashed record's file is refused, with the restore-review consequence recorded in code"
  - "The 401 condition tightened to !session?.user?.id; the shipped condition accepted { user: {} }"
  - "Every refusal is a uniform 404 with the pre-existing { error: 'File not found' } body — no 403, no Problems, no RFC-7807"
metrics:
  duration: ~28 min
  completed: 2026-08-26
  tasks: 2
  tests-added: 52
  commits: 2
---

# Phase 49 Plan 04: the SC-1 file-route fix Summary

`GET` and `DELETE` on `/api/files/{entityId}/{fieldName}/{filename}` now resolve the record under an
owner-scoped predicate and require the filename to already be a value the server wrote into that
record's own JSONB before any byte is read or unlinked — proven by 52 cells that were 26-red against
the shipped code, with `readFile` and `unlink` both observed reaching another user's file.

## What was built

| Artifact | Lines | What it provides |
|---|---|---|
| `src/lib/api/file-access.ts` | 294 | `OwnedRecord`, `findOwnedRecordById`, `recordReferencesStoredName`, `resolveContainedPath` |
| `src/app/api/files/__tests__/route-containment.test.ts` | 789 | 52 cells: 8 positive anchors, 8 per-table ownership refusals, 4 reference-match, 8 traversal, 2 trashed, 3 auth, 6 mock self-test, 11 direct containment |
| `src/app/api/files/[…]/route.ts` | 239 (was 139) | both verbs guarded by one shared function above the `try` |

The route was **modified in place**. It was not moved and its module-level
`const UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/uploads'` read is untouched at line 14 — the new
module receives `uploadDir` as an argument and reads no environment variable, which is what keeps
`compose-uploads-persistence.test.ts:399-404` and `:56` green.

---

## THE EXPLOIT, REPRODUCED FROM SHIPPED CODE (Task 1 RED)

`26 failed | 15 passed (41)` against the unmodified route. The 8 positive anchors passed, so the file
was exercising the real handler, not a stub.

### IDOR on `GET` — another user's bytes, served

```
 FAIL  src/app/api/files/__tests__/route-containment.test.ts > ownership on deal > refuses another user's file with a 404 and never reads it
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      "/tmp/uploads/deal-foreign/Anexos Ação/5a2b7e10-6b21-4f77-a0aa-000000000003.pdf",
    ]


Number of calls: 1
```

### IDOR on `DELETE` — another user's blob, destroyed

```
 FAIL  … > ownership on deal > refuses to DELETE another user's file, so the blob survives
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      "/tmp/uploads/deal-foreign/Anexos Ação/5a2b7e10-6b21-4f77-a0aa-000000000003.pdf",
    ]


Number of calls: 1
```

Both reds repeated for `person-foreign`, `org-foreign` and `activity-foreign` — 8 cells.

### Traversal via `filename` — a read outside the upload root entirely

```
 FAIL  … > traversal via filename > refuses a three-level climb on GET, after consulting the resolver
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      "/tmp/etc/passwd",
    ]
```

### Traversal via `entityId` — the second measured vector

```
 FAIL  … > traversal via entityId > refuses a climbing entityId on GET, with no filesystem call
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      "/etc/Anexos Ação/9f1c0d4e-6b21-4f77-a0aa-000000000001.pdf",
    ]
```

### The two-segment climb — INSIDE the upload root, which is the whole containment question

```
 FAIL  … > traversal via filename > refuses the TWO-level climb, which lands back inside the upload root
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      "/tmp/uploads/escape.txt",
    ]
```

### The tightened 401

```
 FAIL  … > authentication > refuses a session that carries a user with NO id, on GET
AssertionError: expected 200 to be 401 // Object.is equality

- Expected
+ Received

- 401
+ 200
```

The shipped condition `!session?.user` accepted `{ user: {} }` and served the file. This is a real
change, not a cosmetic one.

---

## THE CONTAINMENT QUESTION, DECIDED WITH EVIDENCE

The brief asked for a deliberate decision between (a) demonstrating that the reference-match ordering
makes a root-level prefix check sufficient, or (b) tightening to 49-02's field-directory form.

**Decision: (b), and the root-level form was driven as an ablation to prove it was the wrong answer.
Both halves of (a) were also measured, and one of them turned out to be false.**

### Evidence 1 — the two-segment climb reproduces here exactly as 49-02 predicted

The RED transcript above shows the shipped route reading `/tmp/uploads/escape.txt` for
`filename = "../../escape.txt"`. `entityId` and `fieldName` are precisely two path segments, so the
climb lands ON the upload root. A root-level `path.relative` check allows it. The plan's own test
text specified the root-level form, so this plan was carrying the same latent defect 49-02 found.

### Evidence 2 — ABLATION D: a faithful root-level check, driven

A root-level check cannot carry the `relative.includes(path.sep)` test (a legitimate path is three
segments deep from the root), so the ablation swapped the boundary AND dropped that test — the exact
check the plan text specified. All 8 positive anchors stayed green, so this is a clean measurement.

```
 ❯ src/app/api/files/__tests__/route-containment.test.ts (52 tests | 5 failed) 78ms
     × refuses the TWO-segment climb that lands back on the upload root 7ms
     × refuses a ONE-segment climb into a sibling field of the same record 2ms
     × refuses a climb into a DIFFERENT record's field directory 1ms
     × refuses an empty filename, which would resolve to the field directory itself 1ms
     × refuses a nested filename that stays inside the field directory 1ms
```
```
 FAIL  … > resolveContainedPath > refuses the TWO-segment climb that lands back on the upload root
AssertionError: expected '/tmp/uploads/escape.txt' to be null

- Expected:
null

+ Received:
"/tmp/uploads/escape.txt"
```
```
 FAIL  … > resolveContainedPath > refuses a climb into a DIFFERENT record's field directory
AssertionError: expected '/tmp/uploads/org-foreign/Anexos Ação/…' to be null

- Expected:
null

+ Received:
"/tmp/uploads/org-foreign/Anexos Ação/x.pdf"
```
```
 FAIL  … > resolveContainedPath > refuses a ONE-segment climb into a sibling field of the same record
AssertionError: expected '/tmp/uploads/org-owned/Contrato Assin…' to be null

- Expected:
null

+ Received:
"/tmp/uploads/org-owned/Contrato Assinado/9f1c0d4e-6b21-4f77-a0aa-000000000001.pdf"
```

**A root-level check hands back a path inside a DIFFERENT RECORD'S field directory.** That is not a
theoretical objection about escaping `/tmp` — it is cross-record file access inside the upload tree,
which is precisely the attack 49-02 identified and precisely what a root-level check cannot see. Had
this plan shipped the root-level assertion as written, that cell would have been green against a
handler serving `/tmp/uploads/org-foreign/…`.

### Evidence 3 — the ordering claim in (a) is TRUE at the handler, and still not sufficient

The handler-level cells assert the ordering rather than assuming it: the traversal cells pass
`expect(totalFindFirstCalls()).toBeGreaterThan(0)`, so the refusal is a decision taken after the
record was read, not an early syntactic bail. And ablation C below confirms that with the reference
match removed, the traversal cells for `../../../etc/passwd`, `../../escape.txt`, `/etc/passwd` and
`..%2f..%2f…` **stay green** — the containment check catches them. So the two checks genuinely are
independent and the ordering claim holds.

It is still not sufficient, for two reasons. First, `resolveContainedPath` is an exported function
with its own direct-call cells; a root-level implementation would have made those cells unfailable
regardless of what the handler does. Second, the residual risk the containment check exists for is a
POISONED JSONB VALUE — a `storedName` the server did not mint — and in that scenario the reference
match passes by construction and containment is the only remaining barrier. A root-level check under
that scenario permits cross-record access.

### Evidence 4 — one spelling, not two

`src/lib/trash/delete-entity-files.ts` already checks the same boundary with the same three tests
plus a separate root→field hop. This module copies that spelling verbatim, including its deliberate
parity cost (a field name whose first characters are literally `..` is refused). Two spellings of one
containment rule is how one of them ends up weaker.

---

## THE ABLATIONS

Every ablation was applied, run, recorded, and reverted; `git diff --exit-code` is clean and the
suite is green after all of them.

### ABLATION A — drop `eq(source.ownerId, userId)` from the resolver's terms

**`requireScopedPredicate` did NOT fire, and that is a finding about the guard's threshold, not a
failure of this plan.** `MANDATORY_SCOPE_TERMS` is 2 and this predicate carries 3, so dropping the
owner term leaves 2 terms — and `termCount < MANDATORY_SCOPE_TERMS` is false at 2. The guard is
silent. What caught the regression was the **predicate-evaluating db mock**:

```
 ❯ src/app/api/files/__tests__/route-containment.test.ts (52 tests | 8 failed) 91ms
     × refuses another user's file with a 404 and never reads it 10ms
     × refuses to DELETE another user's file, so the blob survives 6ms
     × refuses another user's file with a 404 and never reads it 2ms
     × refuses to DELETE another user's file, so the blob survives 2ms
     × refuses another user's file with a 404 and never reads it 2ms
     × refuses to DELETE another user's file, so the blob survives 1ms
     × refuses another user's file with a 404 and never reads it 1ms
     × refuses to DELETE another user's file, so the blob survives 1ms
```
```
 FAIL  … > ownership on deal > refuses another user's file with a 404 and never reads it
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      "/tmp/uploads/deal-foreign/Anexos Ação/5a2b7e10-6b21-4f77-a0aa-000000000003.pdf",
    ]
```

Note what this means for anyone reusing `requireScopedPredicate`: **it is a guard against total
collapse, not against losing the owner term specifically.** Any predicate with three or more terms
can lose its owner term and still satisfy it. That is not a defect in `stage-scope.ts` — its own
docstring says `termCount` catches "a predicate that is non-`undefined` and still has lost its owner
term", which is true only when the loss takes the count below 2. The gap is real and the mitigation
here is the evaluating mock, not the guard.

### ABLATION B — drop the owner term from ONE table only (`person`)

This is 49-03's finding driven directly: does removing the ownership term from **any one** of the
four tables redden something? Yes, and it reddens precisely the cells that name that table.

```
 ❯ src/app/api/files/__tests__/route-containment.test.ts (52 tests | 2 failed) 83ms
     × refuses another user's file with a 404 and never reads it 7ms
     × refuses to DELETE another user's file, so the blob survives 2ms
```
```
 FAIL  … > ownership on person > refuses another user's file with a 404 and never reads it
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      "/tmp/uploads/person-foreign/Anexos Ação/5a2b7e10-6b21-4f77-a0aa-000000000003.pdf",
    ]
```

Exactly 2 red, both `person`. The four-table resolver has per-table coverage on both verbs.

### ABLATION C — remove the `recordReferencesStoredName` call

```
 ❯ src/app/api/files/__tests__/route-containment.test.ts (52 tests | 5 failed) 134ms
     × refuses a filename that appears nowhere in the record, on GET 9ms
     × refuses a filename that appears nowhere in the record, on DELETE 3ms
     × refuses a real storedName requested under the WRONG field — the match is per field 2ms
     × refuses a field name that is not a key on the record at all 2ms
     × refuses the percent-encoded spelling 2ms
```

**The FOREIGN RECORD cells stayed green — the two checks are independent, measured.** And the fifth
red is the one the plan did not predict:

```
 FAIL  … > traversal via filename > refuses the percent-encoded spelling
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      "/tmp/uploads/org-owned/Anexos Ação/%2e%2e%2fetc%2fpasswd",
    ]
```

`%2e%2e%2fetc%2fpasswd` contains no separator and no `..`, so it resolves to a legitimate DIRECT
CHILD of the field directory. **Containment cannot see it at all.** Only the reference match refuses
it. That resolves research Assumption A3 in the direction A3 predicted: if Next.js does not decode
the segment before the handler, the encoded traversal is closed by the reference match and by nothing
else. It is the sharpest available demonstration that the reference match, and not the prefix test,
is the load-bearing check.

Because the guard is one shared function, this ablation covers both verbs rather than `GET` alone —
a deliberate departure from the plan's "delete the call from `GET`", and a strictly wider ablation.

### ABLATION E — the `satisfies` on the four-table map, verified in BOTH directions

A missing key fails on the annotation:

```
src/lib/api/file-access.ts(100,7): error TS2741: Property 'activity' is missing in type
  'Readonly<{ deal: …; person: …; organization: … }>' but required in type
  'Readonly<Record<EntityType, OwnerScopedSource>>'.
src/lib/api/file-access.ts(120,3): error TS1360: Type '{ deal: …' does not satisfy the expected type
  'Record<EntityType, OwnerScopedSource>'.
```

An extra key fails only because of the `satisfies`:

```
WITH satisfies:
src/lib/api/file-access.ts(126,3): error TS2353: Object literal may only specify known properties,
  and 'note' does not exist in type 'Record<EntityType, OwnerScopedSource>'.

WITHOUT satisfies (same extra key, explicitly typed arrow so no incidental implicit-any):
EXIT=0
```

**Exit 0.** Without the `satisfies`, a `note` entry — an entity type with no trash surface — compiles
cleanly into the resolver's table map. `dispatch.ts:55-90`'s claim reproduces here exactly: the
annotation alone does not catch it, because `Object.freeze`'s argument is no longer a fresh literal
by the time the result is assigned.

---

## Verification

| Check | Result |
|---|---|
| `vitest run src/app/api/files/__tests__/route-containment.test.ts` | **52 passed (52)** |
| `vitest run` (base project) | **5652 passed / 32 skipped** over 184 files (+2 skipped files) |
| base-suite delta vs the post-wave-1 baseline of 5600/32 over 183 | **+52 in 1 new file** — exactly this plan's cells, nothing else moved |
| `vitest run --config vitest.rsc.config.ts` | **8 passed (8)** |
| `tsc --noEmit` | exit 0 |
| `eslint src` | **0 errors**, 118 warnings (all pre-existing, all `no-unused-vars` in unrelated files) |
| `compose-uploads-persistence.test.ts` | green — route not moved, `process.env.UPLOAD_DIR` intact at `route.ts:14` |
| `log-scope-format.test.ts` | green |
| `src/app/api/v1/__tests__/route-authorization.test.ts` | green (run to confirm nothing moved; this route is outside that gate's corpus and no coverage is claimed from it) |
| `git diff --exit-code -- src/app/api/upload/route.ts` | clean — the upload route was not touched |
| `git diff --exit-code` after all ablations | clean |

Files changed in this plan, in full: three.

```
M	src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts
A	src/app/api/files/__tests__/route-containment.test.ts
A	src/lib/api/file-access.ts
```

---

## SCOPE: `FILE_STORAGE=local` ONLY

**SC-1 is proven here for local storage and for nothing else.** Under `FILE_STORAGE=s3` the stored
`publicUrl` is `${S3_PUBLIC_URL}/${key}` (`src/app/api/upload/route.ts:89`), so a read never traverses
this route and the guard has no traffic to protect there. **SEC-49-A owns that gap.** The guard is
placed before the storage branch and therefore applies to both arms, but that is a structural
statement about where the code sits, not a coverage claim: no cell in this plan exercises the S3 read
path, no S3 client was constructed, and nothing in this plan's output may be cited as evidence about
S3. `FILE_STORAGE` is unset in this deployment, which is why `'local'` is the configuration under
test.

## Deviations from Plan

**1. [Rule 2 — Missing critical validation] Containment against the FIELD directory, not the upload
root — the substantive finding of this plan**
- **Found during:** Task 2, writing the direct-call containment cells
- **Issue:** the plan's Task 1 behaviour specifies asserting containment "with `path.relative` from
  `UPLOAD_DIR`" — the root-level form. Ablation D measured that a faithful root-level check returns
  `/tmp/uploads/org-foreign/Anexos Ação/x.pdf` for a climb out of the caller's own field directory
  into a different record's. Shipped as written, the containment cells would have been green against
  a handler doing cross-record file access.
- **Fix:** the field-directory boundary (direct child: non-empty relative, no leading `..`, not
  absolute, no separator) plus a separate root→field hop check, identical in spelling to
  `src/lib/trash/delete-entity-files.ts`.
- **Coverage added beyond the plan:** cells for the sibling-field climb, the different-record climb,
  the empty filename, the nested filename, a climbing `fieldName`, and an absolute `entityId`.
- **Threat register:** strengthens T-49-04-03 and T-49-04-04 rather than departing from them.
- **Commit:** 90c88ad

**2. [Rule 2 — Missing critical functionality] The db mock EVALUATES the predicate**
- **Found during:** Task 1, designing the foreign-record cells
- **Issue:** the plan says "All four `findFirst` resolve `undefined`" for the foreign-record cells.
  That encodes the conclusion as the premise: those cells would pass identically against a resolver
  with no owner term at all, which is exactly the 30/30-green failure 49-03 recorded.
- **Fix:** `evaluateFindFirst` compiles the captured `where` with a real `PgDialect` and answers from
  an in-memory row table, modelling a collapsed predicate as an UNFILTERED read. Both polarities are
  asserted in a 6-cell self-test describe, and the ownership cells are parameterised over all four
  tables. Ablation B confirms per-table precision.
- **Commit:** 3859fea

**3. [Rule 1 — Assertion ordering that would mask a barrier] The filesystem spy is asserted BEFORE
the status code in every refusal cell**
- **Found during:** Task 1, reading the first red transcript
- **Issue:** with `expect(status).toBe(404)` first, the red read "expected 200 to be 404" and never
  revealed whether the handler had actually read or unlinked the file. 49-02's RED 7 records the same
  masking and had to relax an assertion to see past it.
- **Fix:** an `expectNoFilesystemTouch()` helper called first in every refusal cell. Every red in this
  SUMMARY names the dangerous call and its resolved path as a direct consequence.
- **Commit:** 3859fea

### Deliberate departures from the plan text

**4. The `resolveContainedPath` direct-call cells were written in Task 2, not Task 1.** A static
import of a not-yet-existing module turns the RED into a single collection error and destroys the
per-cell transcript that is the entire point of Task 1; a dynamic import would have made
`tsc --noEmit` fail with TS2307 for a reason unrelated to the contract. Task 1 therefore holds every
handler-level cell (where the exploit lives) and Task 2 added the 11 pure-function cells. The
containment check still has a recorded RED — ablation D — and it is a considerably stronger one than
"the module does not exist yet".

**5. One shared guard function instead of two inlined copies.** The plan says "insert the guard chain
into both handlers, identically". The two preambles were byte-identical before this change and the
defect was identical in both, which is the argument for sharing rather than duplicating: it makes it
structurally impossible to fix the read and forget `DELETE`. The consequence is that ablation C
covers both verbs rather than `GET` alone — a wider ablation, recorded as such.

**6. Verification commands were run from the WORKTREE.** No `<automated>` block in this plan carried
an absolute path to the main repo, so nothing had to be stripped, but every command in the table above
was run from the worktree root against the worktree's own `node_modules` symlink.

**7. `npm run lint` was not used.** `next lint` in this version rejects `--max-warnings`; the gate was
run as `./node_modules/.bin/eslint src` and read for the ERROR count (0), never the warning total,
which is not reproducible across trees.

## Threat Register Disposition

| Threat | Status | Evidence |
|---|---|---|
| T-49-04-01 Info disclosure (IDOR on `GET`) | **mitigated** | 4 per-table cells; RED shows `readFile` at `/tmp/uploads/deal-foreign/…`; ablations A and B redden it |
| T-49-04-02 Tampering (IDOR on `DELETE`) | **mitigated** | 4 per-table cells; RED shows `unlink` on the same path; positive anchors assert `unlink` IS called once for the owner |
| T-49-04-03 Traversal via `filename` | **mitigated, STRENGTHENED** | reference match plus FIELD-directory containment; ablation D shows the root-level form allowed a different record's path |
| T-49-04-04 Traversal via `entityId` | **mitigated** | RED shows `/etc/Anexos Ação/…`; resolver refuses, plus a direct containment cell |
| T-49-04-05 Existence oracle (403 beside 404) | **mitigated** | every refusal is `{ error: 'File not found' }` / 404, asserted by `toEqual` in 8 cells |
| T-49-04-06 EoP (collapsed `and(...)`) | **partially mitigated, gap NAMED** | all four predicates route through `requireScopedPredicate` with a declared `SQL[]` and `terms.length`, but ablation A proves it does NOT fire at 2 terms; the evaluating mock is the real barrier |
| T-49-04-07 EoP (a fifth entity type silently never visited) | **mitigated** | ablation E, both directions: TS2741/TS1360 for a missing key, TS2353 for an extra key, EXIT=0 without the `satisfies` |
| T-49-04-08 Spoofing (session with no user id) | **mitigated** | 2 cells, both red against the shipped condition; `totalFindFirstCalls()` asserted 0 |
| T-49-04-09 Info disclosure (a trashed record's file) | **mitigated** | 2 cells; `isNull(deletedAt)` by decision, restore-review consequence in the module header |
| T-49-04-10 Info disclosure (the S3 read path) | **accepted, named, out of scope** | SEC-49-A; no S3 claim in code, test, or this SUMMARY |
| T-49-04-11 Repudiation (a guard proven by its own comment) | **mitigated** | zero `toContain`/`not.toContain` over any file read from disk anywhere in the test file; every proof is a handler invocation plus a spy |

## What this does NOT deliver

- **No behavioural SC-1 proof.** Every cell here is a UNIT proof with `@/db` mocked. A
  rendered-predicate assertion is a compiled-structure claim — "the resolver asked the database for
  this SQL" — not a demonstration that PostgreSQL returns only the caller's rows. **Plan 49-06 owns
  SC-1's behavioural proof** and this plan creates no `*.db.test.ts` (49-05 is this wave's sole
  db-test owner, because `scripts/dedup-db-test-setup.sh` drops every schema in
  `pipelite_dedup_test`).
- **No S3 coverage.** SEC-49-A.
- **No blob deletion.** Plan 49-07 owns that, and it lands after this one by roadmap mandate: this
  fix closes the exposure on its own, and rolling back an irreversible disk deletion would be worse
  than the defect.
- **DEF-48-05 / SEC-48-C not absorbed** (constraint 14).
- **No claim that the audit tombstone retains indefinitely.** `audit.retention_days = 90`.

## Follow-ups worth a backlog line

1. **`requireScopedPredicate` does not catch a lost owner term in a 3+-term predicate.** Ablation A
   measured this. A `subject`-aware minimum, or a required-column assertion rather than a bare count,
   would close it. Every current call site with three or more terms shares the gap.
2. **The trashed-record 404 will reach `/trash`.** A restore-review flow that wants to show a trashed
   record's attachments now gets a 404 per file. Recorded in the module header; if it matters it is a
   separate narrower read path, not a widening of this guard.

## Known Stubs

None. All three functions are complete implementations with no placeholder values, no TODO markers
and no unwired data paths.

## Self-Check: PASSED
