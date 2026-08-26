---
phase: 49-mutation-layer-truth-after-commit
plan: 02
subsystem: trash
tags: [SEC-04, blob-deletion, path-traversal, tdd, pure-unit]
requires: []
provides:
  - "src/lib/trash/collect-file-field-refs.ts — collectFileFieldRefs, BlobRef"
  - "src/lib/trash/delete-entity-files.ts — deleteEntityFiles"
affects:
  - "plan 49-07 (the four purge mutations that will call both helpers)"
tech-stack:
  added: []
  patterns:
    - "call-time process.env read (deliberately NOT module-level, unlike both existing storage routes)"
    - "path.relative containment against the FIELD directory, checked before any filesystem call"
    - "one try/catch per loop iteration so a single failure cannot abandon the rest"
    - "sibling *.test.ts, matching src/lib/trash/'s own six existing tests (no __tests__/)"
key-files:
  created:
    - src/lib/trash/collect-file-field-refs.ts
    - src/lib/trash/collect-file-field-refs.test.ts
    - src/lib/trash/delete-entity-files.ts
    - src/lib/trash/delete-entity-files.test.ts
  modified: []
decisions:
  - "Containment is checked against the FIELD directory, not the upload root — the plan's own `../../escape.txt` fixture is CONTAINED by a root-level check, so a root-level check would have been a gate that cannot fail"
  - "entityId and fieldName are containment-checked too, not just storedName — all three are untrusted path segments out of a database row"
  - "process.env read at call time, so plan 49-07 needs no vi.hoisted"
  - "An already-absent blob COUNTS as deleted — the mismatch is reserved for a REAL failure"
  - "The S3 client is constructed per call rather than cached at module scope, because a module-level cache would freeze the first call's config and quietly undo the call-time env read"
  - "The empty ${UPLOAD_DIR}/${entityId}/ tree is deliberately not pruned"
metrics:
  duration: ~19 min
  completed: 2026-08-26
  tasks: 2
  tests-added: 43
  commits: 2
---

# Phase 49 Plan 02: collectFileFieldRefs and deleteEntityFiles Summary

SEC-04's blob-deletion primitive now exists as two db-free modules in `src/lib/trash/`, proven by 43
pure/real-filesystem cells with seven recorded red observations — including a traversal ablation that
really unlinked a file outside the record's field directory.

## What was built

| Artifact | Lines | What it provides |
|---|---|---|
| `src/lib/trash/collect-file-field-refs.ts` | 93 | `BlobRef`, `collectFileFieldRefs` — the blind JSONB walk |
| `src/lib/trash/collect-file-field-refs.test.ts` | 277 | 25 cells: 11 malformed shapes + positive anchor + mixed + field-name round-trip |
| `src/lib/trash/delete-entity-files.ts` | 207 | `deleteEntityFiles` — best-effort deletion returning a count that can be short |
| `src/lib/trash/delete-entity-files.test.ts` | 392 | 18 cells: real bytes, real EISDIR failure, five refusal cells, one mock-level S3 cell |

All four are SIBLINGS in `src/lib/trash/`. **No `__tests__/` directory was created** — the module's
six existing tests are siblings and `49-VALIDATION.md`'s `__tests__/` prescription was overridden by
the plan for exactly that reason.

## The seven red observations

Every gate below was broken on purpose and watched go red. **The transcripts are verbatim.**

### RED 1 — Task 1, the test file collected before the module existed

```
 FAIL  src/lib/trash/collect-file-field-refs.test.ts [ src/lib/trash/collect-file-field-refs.test.ts ]
Error: Cannot find module './collect-file-field-refs' imported from /home/pedro/programming/pipelite/.claude/worktrees/agent-a10ddafd97db52a1a/src/lib/trash/collect-file-field-refs.test.ts
 ❯ src/lib/trash/collect-file-field-refs.test.ts:23:1
     23| import { collectFileFieldRefs, type BlobRef } from "./collect-file-fie…

 Test Files  1 failed (1)
      Tests  no tests
```

The cheapest possible proof that a sibling `*.test.ts` under `src/lib/trash/` is actually collected
by the base vitest project (`include: ['src/**/*.{test,spec}...']`).

### RED 2 — Ablation: `return []` unconditionally. **SIX cells red** (floor was 3)

```
      Tests  6 failed | 19 passed (25)
```

The six, named:
```
     × returns one ref per stored descriptor across every field, in the order encountered
     × carries the entityId it was HANDED, not one read back out of the descriptor
     × returns the one well-formed descriptor out of four in the SAME array
     × keeps walking later fields after an earlier field was skipped entirely
     × round-trips a name with a space and non-ASCII characters unmodified
     × does not special-case a name containing a slash — it is simply carried
```

Verbatim diff of the anchor:
```
 FAIL  … > returns one ref per stored descriptor across every field, in the order encountered
AssertionError: expected [] to have a length of 3 but got +0

- Expected
+ Received

- 3
+ 0

 ❯ src/lib/trash/collect-file-field-refs.test.ts:82:18
     82|     expect(refs).toHaveLength(ANCHOR_REF_COUNT)
```

**Six is well above the required floor of three**, so the eleven "returns []" negatives are not
carrying the file.

### RED 3 — Ablation: delete the `typeof stored !== "string"` guard. Five cells red, the `storedName: 42` cell among them

```
 FAIL  … > skips a non-string storedName rather than emitting a ref that carries a number
AssertionError: expected [ { …(3) } ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "entityId": "11111111-1111-4111-8111-111111111111",
+     "fieldName": "anexos",
+     "storedName": 42,
+   },
+ ]

 ❯ src/lib/trash/collect-file-field-refs.test.ts:175:18
    175|     expect(refs).toEqual([])
```

A ref carrying the number `42` escapes into a path builder, exactly as the plan predicted. The other
four reds were the `no storedName` / `null storedName` / nested-array cells (a ref carrying
`storedName: undefined` or `null`) and the MIXED cell, which went from 1 to 2:

```
 FAIL  … > returns the one well-formed descriptor out of four in the SAME array
AssertionError: expected [ { …(3) }, { …(3) } ] to have a length of 1 but got 2
- 1
+ 2
```
That second red is worth recording: it shows `MIXED_REF_COUNT` pins the count between a whole-field
abort (0) and a guardless walk (>1), which is what its own comment claims.

### RED 4 — Ablation: delete the top-level `Array.isArray` rejection. **Exactly one cell**

```
 FAIL  … > returns [] for an array handed in as the whole column
AssertionError: expected [ { …(3) } ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "entityId": "11111111-1111-4111-8111-111111111111",
+     "fieldName": "0",
+     "storedName": "smuggled.pdf",
+   },
+ ]

 ❯ src/lib/trash/collect-file-field-refs.test.ts:128:77
    128|     expect(collectFileFieldRefs(ENTITY_ID, [[descriptor("smuggled.pdf"…
```

`fieldName: "0"` is the point. **The fixture shape was chosen so this ablation is observable at
all:** a flat `[descriptor(...)]` survives the walk anyway (its entries are objects, not arrays, so
the per-field guard skips them), so a flat fixture would have made the top-level rejection
untestable — a guard nobody tests. The nested `[[descriptor(...)]]` shape is what turns it red. Both
shapes plus `[]` are asserted in the cell.

### RED 5 — Task 2, the test file collected before the module existed

```
 FAIL  src/lib/trash/delete-entity-files.test.ts [ src/lib/trash/delete-entity-files.test.ts ]
Error: Cannot find module '/src/lib/trash/delete-entity-files' imported from /home/pedro/programming/pipelite/.claude/worktrees/agent-a10ddafd97db52a1a/src/lib/trash/delete-entity-files.test.ts
 ❯ src/lib/trash/delete-entity-files.test.ts:34:1
     34| import { deleteEntityFiles } from "./delete-entity-files"

 Test Files  1 failed (1)
      Tests  no tests
```

### RED 6 — Ablation A: one shared `try` around the whole loop. The PER-REF ISOLATION barrier reddens

```
 FAIL  … > deletes the other refs in the SAME call and comes back short by exactly one
AssertionError: expected 1 to be 2 // Object.is equality

- Expected
+ Received

- 2
+ 1

 ❯ src/lib/trash/delete-entity-files.test.ts:240:28
    240|     expect(result.deleted).toBe(SURVIVING_REF_COUNT)
```

```
 FAIL  … > keeps going when the FIRST ref is the undeletable one
AssertionError: expected { deleted: +0 } to deeply equal { deleted: 2 }
-   "deleted": 2,
+   "deleted": 0,
```

`2 → 1` is the third ref being abandoned after the second one raised EISDIR; `2 → 0` is the whole
record's blobs being abandoned because the FIRST ref failed. That second cell is the one that shows
the failure mode is not merely "one blob lost" but "every blob after it lost".

### RED 7 — Ablation B: remove the containment check. **Six refusal cells red, and the escape target was really unlinked**

```
      Tests  6 failed | 12 passed (18)
```
```
     × refuses a storedName that climbs out of the field directory, and the target survives
     × refuses a storedName that climbs out of the upload root entirely
     × refuses an absolute storedName
     × refuses a poisoned fieldName, which is a JSONB key and just as untrusted
     × refuses a poisoned entityId for the same reason
     × refuses a refusal-shaped ref WITHOUT abandoning the legitimate refs beside it
```
```
 FAIL  … > refuses a storedName that climbs out of the field directory, and the target survives
AssertionError: expected { deleted: 1 } to deeply equal { deleted: +0 }
-   "deleted": 0,
+   "deleted": 1,
```

**The count assertion fires first, which would have MASKED the barrier** — so the count assertion was
temporarily relaxed to a bare `await` under the same ablation, to confirm the barrier is not
decorative:

```
 FAIL  … > refuses a storedName that climbs out of the field directory, and the target survives
AssertionError: the escape target must NOT have been unlinked: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/lib/trash/delete-entity-files.test.ts:293:87
    293|     expect(existsSync(escapeTarget), "the escape target must NOT have …
```

`expected false to be true` on `existsSync(escapeTarget)` — **the file outside the record's field
directory was really gone.** The barrier is real, and a note pointing at this transcript now sits
beside the assertion in the test file so a future reader does not have to rediscover the masking.

### Bonus reds (recorded, beyond the seven)

**Ablation C: rethrow on a failed unlink.** The NEVER THROWS cell reddens, with the EISDIR seam
visible in the trace:
```
 FAIL  … > never rejects when a blob is undeletable — a throw would fail a COMMITTED purge
AssertionError: promise rejected "Error: EISDIR: illegal operation on a dir… { …(4) }" instead of resolving
 ❯ src/lib/trash/delete-entity-files.test.ts:260:40

Caused by: Error: EISDIR: illegal operation on a directory, unlink '/tmp/delete-entity-files-T93Otp/uploads/22222222-2222-4222-8222-222222222222/anexos/is-a-directory.pdf'
 ❯ Module.deleteEntityFiles src/lib/trash/delete-entity-files.ts:135:7

Serialized Error: { errno: -21, code: 'EISDIR', syscall: 'unlink', path: '…/anexos/is-a-directory.pdf' }
```

**Ablation D: "absent counts as FAILED" instead of deleted.** Two cells redden, which is what makes
the decision visible as a decision:
```
 FAIL  … > counts a ref whose file does not exist, because the goal state is 'the blob is gone'
AssertionError: expected { deleted: +0 } to deeply equal { deleted: 1 }
-   "deleted": 1,
+   "deleted": 0,
 FAIL  … > counts an absent blob whose entity directory does not exist at all
AssertionError: expected { deleted: +0 } to deeply equal { deleted: 1 }
```

## The injected-failure seam, and its shortfall

**Research option (A) — make the blob path a DIRECTORY — is ALIVE, verified directly rather than
inherited.** `49-01-SUMMARY.md` did not exist when this plan ran (49-01 was live in a parallel
worktree), so the seam was observed first-hand before any test depended on it:

```
SEAM ALIVE: code=EISDIR msg=EISDIR: illegal operation on a directory, unlink '/tmp/seamA-fhx4nD/blob.pdf'
uid=1000
```

Observed at uid 1000. Research's claim is that EISDIR holds regardless of uid, which is why (A) was
chosen over (B) `chmod 0500` — (B) silently succeeds as root and would have produced a failure cell
that cannot fail. **Option (C), a mockable module boundary, was NOT needed for the local proof.**

The shortfall, asserted with named integers rather than "less than":

| Constant | Value | Consumed by |
|---|---|---|
| `HAPPY_REF_COUNT` | 3 | the fixture builder AND the assertion |
| `SABOTAGED_REF_COUNT` | 1 | the shortfall assertion |
| `SURVIVING_REF_COUNT` | `HAPPY_REF_COUNT - SABOTAGED_REF_COUNT` = 2 | the deleted-count assertion |

```ts
expect(result.deleted).toBe(SURVIVING_REF_COUNT)                    // 2
expect(HAPPY_REF_COUNT - result.deleted).toBe(SABOTAGED_REF_COUNT)  // shortfall === 1
expect(result.deleted).toBeLessThan(HAPPY_REF_COUNT)
```

`deleted < refs.length` alone would be satisfied by a helper that deleted nothing, which is why the
shortfall is pinned to a named 1. The cell also asserts the injection TOOK before trusting it
(`await expect(unlink(sabotagedPath)).rejects.toThrow(/EISDIR/)`) — research flagged that for option
(B) and it costs nothing under (A).

**This is what makes plan 49-07's `expected !== deleted` log reachable.** Without a short count, that
log is unreachable code and the mismatch gate could never fire.

## The call-time env read, and why

`process.env.UPLOAD_DIR` and `process.env.FILE_STORAGE` are read **inside** `deleteEntityFiles`, not
at module scope. Both existing storage consumers do the opposite:

```ts
// src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts:9-10
const STORAGE_TYPE = process.env.FILE_STORAGE || 'local'
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/uploads'
```

Module-evaluation reads are precisely what makes those two routes untestable from a host process: a
test that assigns `process.env.UPLOAD_DIR` after importing them has no effect, so a filesystem-level
proof must either pre-set the variable before import or run inside the container. This module takes
the other choice, and **plan 49-07's live-database proof depends on it** — pointing `UPLOAD_DIR` at a
`mkdtemp` directory in a `beforeEach` is what lets that plan verify the blob is really gone without
`vi.hoisted` import gymnastics. This test file's own `beforeEach` is the first consumer of that
property. Cost: one `process.env` read per purge, next to the `unlink` it precedes.

The comment in the module names 49-07's dependency explicitly, so a future refactor that hoists the
read to module scope has to argue with it.

## The S3 cell is a MOCK. It is not evidence for SC-1 or SC-2.

`@aws-sdk/client-s3` is replaced with a `vi.mock` factory. `FILE_STORAGE` is unset in this
environment and no bucket is configured, so the S3 branch **cannot** be proven behaviourally here.
What the cell pins is the CALL SHAPE — one `DeleteObjectCommand` per ref with
`Key === \`${entityId}/${fieldName}/${storedName}\`` (the key `src/app/api/upload/route.ts:79`
mints), the right `Bucket`, and the local filesystem left untouched. Nothing more.

**No S3 claim is made for SC-1 or SC-2.** SEC-49-A owns the real S3 exposure and this plan does not
touch it. The label appears in three places: the `vi.mock` block's own prose, the cell's first
comment, and here.

A second S3 cell asserts that selecting `FILE_STORAGE=s3` with no `S3_ENDPOINT` resolves `{deleted:
0}` rather than throwing — the file route answers a 500 there, but a purge has no response to write,
so a short count the caller will log is the only honest outcome.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 1 — Bug] A wrong expectation in my own test fixture**
- **Found during:** Task 2, first green run
- **Issue:** the "FIRST ref is the undeletable one" cell expected `SURVIVING_REF_COUNT + 1` (3) when
  the correct answer is `SURVIVING_REF_COUNT` (2) — one sabotaged out of three leaves two.
- **Fix:** corrected the expectation to `SURVIVING_REF_COUNT` and added
  `expect(survivorPaths).toHaveLength(SURVIVING_REF_COUNT)` so the fixture and the expectation are
  tied to the same constant rather than to arithmetic done by hand.
- **Verbatim red that caught it:** `AssertionError: expected { deleted: 2 } to deeply equal
  { deleted: 3 }`
- **Files:** `src/lib/trash/delete-entity-files.test.ts`
- **Commit:** ed6abef

**2. [Rule 2 — Missing critical validation] Containment against the FIELD directory, and for all three path segments**
- **Found during:** Task 2, writing the containment cell
- **Issue, and it is the substantive finding of this plan:** the plan specifies the traversal fixture
  as `storedName = "../../escape.txt"` and specifies the check as `path.relative(uploadDir, resolved)`
  against the **upload root**. Those two do not meet. `entityId` and `fieldName` are exactly two path
  segments, so `../../` climbs precisely back to the upload root — `path.resolve(uploadRoot,
  entityId, fieldName, "../../escape.txt")` **is** `${uploadRoot}/escape.txt`, which a root-level
  containment check ALLOWS. Written as specified, the CONTAINMENT REFUSAL cell would have gone green
  against a helper that happily unlinked the file, and the ablation that removes the check would not
  have reddened. That is the "gate that cannot fail" shape this phase exists to eliminate, arriving
  inside the plan that was written to eliminate it.
- **Fix:** containment is checked against the **field directory** — the resolved target must be a
  DIRECT child of `path.resolve(uploadRoot, entityId, fieldName)` (non-empty relative, no leading
  `..`, not absolute, no path separator). The upload root is checked separately for the
  root→field hop, because `entityId` and `fieldName` come out of a database row too — `fieldName` is
  a raw JSONB key that `collectFileFieldRefs` carries verbatim, so a key of `"../.."` is a reachable
  value, not a hypothetical.
- **Why the stronger boundary is also the RIGHT one:** the realistic attack was never "delete
  something outside `/tmp`". It is one record's poisoned value deleting a **different record's**
  blob — cross-record deletion inside the upload tree, which a root-level check cannot see.
- **Coverage added beyond the plan:** cells for a poisoned `fieldName`, a poisoned `entityId`, an
  absolute `storedName`, and a refusal sitting beside a legitimate ref (the refusal must not abandon
  the sibling).
- **Threat register:** this strengthens T-49-02-01 rather than departing from it.
- **Files:** `src/lib/trash/delete-entity-files.ts`, `src/lib/trash/delete-entity-files.test.ts`
- **Commit:** ed6abef

### Deliberate departures from the plan text

**3. The S3 client is constructed per call, not cached at module scope.**
The plan says "construct the client with the same lazy-init pattern the file route uses"; that route
caches `let s3Client: S3Client | null = null` at module scope. Caching the client would freeze the
FIRST call's configuration and quietly undo the call-time env read this module exists to provide —
the two instructions are in tension and the call-time read is the load-bearing one (the plan devotes
a paragraph to it and names 49-07's dependency on it). What was kept from the route is the part that
matters: the SDK is `await import`ed **lazily and only inside the S3 branch**, so the local branch —
the only branch any current deployment takes — never pays to load it. One client construction per
purge is free next to the network round trips it precedes. Documented in the module.

**4. Verification commands were run from the WORKTREE, not from `/home/pedro/programming/pipelite`.**
Both `<automated>` blocks begin `cd /home/pedro/programming/pipelite`, which is the MAIN repo — the
new files do not exist there, so the commands as written would have verified the wrong tree (or
silently passed by collecting nothing). Everything was run from
`/home/pedro/programming/pipelite/.claude/worktrees/agent-a10ddafd97db52a1a` via
`./node_modules/.bin/vitest`, and the RED 1 / RED 5 transcripts above carry the worktree path as
proof the correct tree was under test.

## Verification

| Gate | Result |
|---|---|
| `./node_modules/.bin/vitest run src/lib/trash/` | **7 files, 257 tests passed** (6 pre-existing sibling tests unaffected) |
| `./node_modules/.bin/vitest run src/lib/trash/collect-file-field-refs.test.ts` | 25 passed |
| `./node_modules/.bin/vitest run src/lib/trash/delete-entity-files.test.ts` | 18 passed |
| `compose-uploads-persistence.test.ts` + `log-scope-format.test.ts` + `src/lib/trash/` | **10 files, 302 tests passed** |
| `./node_modules/.bin/vitest run` (full unit suite) | **182 passed / 2 skipped (184 files); 5589 passed / 32 skipped (5621)** |
| RSC project (`vitest.rsc.config.ts`) | **8/8 passed** |
| `./node_modules/.bin/tsc --noEmit` | **exit 0** |
| `npm run lint` | **0 errors**, 118 warnings — *neither new file nor either new test produces any lint output at all* |
| `git diff --exit-code` after every ablation restored | **clean; zero tracked files modified** |

**Baseline comparison:** 5546 → 5589 passed is exactly +43, which is 25 + 18 — every added test is
accounted for and nothing pre-existing changed state. Skipped is unchanged at 32. Files 180 → 182.

**The two guarded gates are green because neither route was touched.** The full file list this plan
changed, from `git diff --name-only` against the base commit:

```
src/lib/trash/collect-file-field-refs.test.ts
src/lib/trash/collect-file-field-refs.ts
src/lib/trash/delete-entity-files.test.ts
src/lib/trash/delete-entity-files.ts
```

`src/app/api/upload/route.ts` and
`src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts` do not appear. The
`process.env.UPLOAD_DIR` literal is untouched in both, so
`compose-uploads-persistence.test.ts:399-404` needed no prose rewording and the gate was not
weakened (T-49-02-07).

**Source-level criteria, checked mechanically:**
- `delete-entity-files.ts` code lines containing `log.` — **0**. So `log-scope-format.test.ts` gains
  no call site (constraint 3).
- `delete-entity-files.ts` exports — exactly one: `export async function deleteEntityFiles(...)`.
  `BlobRef` is imported as a type from the sibling and NOT re-exported.
- `collect-file-field-refs.ts` imports — `none at all`. No `db`, no `custom_field_definitions`, no
  `@/` alias.
- Artifact line counts vs `min_lines`: 93/40, 207/70, 277/100, 392/130 — all above floor.

## Threat model dispositions

| Threat ID | Status | Evidence |
|---|---|---|
| T-49-02-01 Tampering (poisoned `storedName` → `unlink` outside `UPLOAD_DIR`) | **mitigated, STRENGTHENED** | containment vs the FIELD directory before any fs call, plus separate root→field check; 6 refusal cells; RED 7 shows the escape target really unlinked without it |
| T-49-02-02 DoS (one undeletable blob aborting the rest) | **mitigated** | one try/catch per ref; barrier asserts the other two deleted in the SAME call; RED 6 shows 2→1 and 2→0 |
| T-49-02-03 Repudiation (a failure with no computable evidence) | **mitigated** | shortfall pinned to `SABOTAGED_REF_COUNT` = 1 under the live EISDIR seam |
| T-49-02-04 Tampering (a throw rolling back / misreporting a committed purge) | **mitigated** | `resolves.toEqual` on every failure cell; ablation C red with the EISDIR trace |
| T-49-02-05 Info disclosure (blob surviving a soft-deleted definition) | **mitigated** | blind JSONB walk, zero imports; header states the `getActiveFieldDefinitions` `deleted_at is null` reason |
| T-49-02-06 Spoofing ("returns []" passing because the walk died) | **mitigated** | anchor at exactly 3; `return []` ablation reddens **6** cells, recorded |
| T-49-02-07 EoP (weakening the uploads gate to fix a self-inflicted red) | **mitigated** | neither route in the diff; gate run and green |
| T-49-02-08 Spoofing (claiming S3 is proven) | **accepted, labelled** | labelled mock-level in the `vi.mock` prose, the cell prose, and this SUMMARY; no SC-1/SC-2 claim |

## What this does NOT deliver

- **No SC-1 or SC-2 proof.** Those need a mutation and a database; this plan is the primitive only.
  Plan 49-07 owns the four purge call sites and the mismatch log.
- **No S3 behavioural coverage** (see above). SEC-49-A.
- **No directory pruning.** `${UPLOAD_DIR}/${entityId}/` survives, on purpose, with the reason in
  the module.
- **No `*.db.test.ts` file**, by wave design — 49-01 is this wave's sole db-test owner because
  `scripts/dedup-db-test-setup.sh` drops and rebuilds every schema in `pipelite_dedup_test`.
- **DEF-48-05 / SEC-48-C not absorbed** (constraint 12).
- **`prune.ts`'s false "BLOBS ARE NOT REMOVED" comment is still there and still false-in-waiting.**
  It is 49-07's to rewrite; this plan created the helpers it will point at, and deliberately did not
  edit prose it cannot yet make true.

## Known Stubs

None. Both modules are complete implementations with no placeholder values, no TODO markers, and no
unwired data paths.

## Notes for plan 49-07

1. `collectFileFieldRefs(id, row.customFields)` then `deleteEntityFiles(refs)`, both after the
   commit, in a `try/catch` that logs and never rethrows.
2. `deleted !== refs.length` is the mismatch condition. It is reachable — proven above.
3. `UPLOAD_DIR` can be pointed at a `mkdtemp` directory in a `beforeEach` with no import
   gymnastics. That is the whole reason the env read is at call time.
4. A refused (traversal) ref does NOT count as deleted, so a poisoned row will surface as a
   mismatch rather than as a silent skip — which is the correct signal.
5. Do not add a `log.` call to either helper. The log belongs to the four purge call sites, and
   `log-scope-format.test.ts` asserts call-site equality.
6. Avoid a `/` in any SC-1/SC-2 fixture field name: it cannot round-trip the three-segment file
   route. `collectFileFieldRefs` carries it, and `deleteEntityFiles` will refuse anything it
   resolves outside the field directory.

## Self-Check: PASSED

All four created files verified present on disk, and both commits verified present in
`git log --oneline --all`.

| Claim | Verified |
|---|---|
| `src/lib/trash/collect-file-field-refs.ts` | FOUND |
| `src/lib/trash/collect-file-field-refs.test.ts` | FOUND |
| `src/lib/trash/delete-entity-files.ts` | FOUND |
| `src/lib/trash/delete-entity-files.test.ts` | FOUND |
| commit `0089f15` (task 1) | FOUND |
| commit `ed6abef` (task 2) | FOUND |

## TDD Gate Compliance

Plan `type: tdd`. Both tasks ran RED → GREEN. The RED gate is recorded as the import-failure
transcripts (RED 1 and RED 5), each captured against a module that did not yet exist, plus seven
ablation reds total across the two tasks.

**Gate-sequence note:** the two commits are `feat(...)`, not a `test(...)` → `feat(...)` pair. The
failing test and its implementation were committed together per task, so git log shows no separate
RED commit. The RED observations are recorded here verbatim instead — every one was executed and
watched fail before the code that satisfies it was written. If 49-09's sign-off requires a
`test(...)` commit as the RED artifact, this is the deviation to note; the evidence is the
transcripts above, not the commit graph.
