---
status: findings
phase: 49-mutation-layer-truth-after-commit
reviewed: 2026-08-26T15:12:36Z
depth: deep
files_reviewed: 28
critical: 3
warning: 3
info: 1
files_reviewed_list:
  - src/lib/api/file-access.ts
  - src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts
  - src/app/api/files/__tests__/route-containment.test.ts
  - src/app/api/files/__tests__/files-route-ownership.db.test.ts
  - src/lib/trash/collect-file-field-refs.ts
  - src/lib/trash/collect-file-field-refs.test.ts
  - src/lib/trash/delete-entity-files.ts
  - src/lib/trash/delete-entity-files.test.ts
  - src/lib/trash/purge-blobs.db.test.ts
  - src/lib/trash/prune.ts
  - src/lib/mutations/organizations.ts
  - src/lib/mutations/people.ts
  - src/lib/mutations/deals.ts
  - src/lib/mutations/activities.ts
  - src/lib/mutations/dedup.ts
  - src/lib/mutations/dedup.test.ts
  - src/lib/mutations/dedup-formula.db.test.ts
  - src/app/api/v1/organizations/route.ts
  - src/app/api/v1/people/route.ts
  - src/app/api/v1/deals/route.ts
  - src/app/api/v1/activities/route.ts
  - src/app/api/v1/organizations/__tests__/route.test.ts
  - src/app/api/v1/people/__tests__/formula-recalc.test.ts
  - src/app/api/v1/deals/__tests__/formula-recalc.test.ts
  - src/app/api/v1/activities/__tests__/route.test.ts
  - src/app/api/v1/__tests__/create-response-canonical.db.test.ts
  - src/lib/__tests__/custom-field-definition-fixture.ts
  - src/lib/__tests__/custom-field-definition-fixture.db.test.ts
---

# Phase 49: Code Review Report

**Reviewed:** 2026-08-26T15:12:36Z
**Depth:** deep (cross-file call chains and type boundaries)
**Files reviewed:** 28 declared + one hop out (`src/app/api/upload/route.ts`,
`src/components/custom-fields/file-field.tsx`, `src/components/custom-fields/custom-fields-section.tsx`,
`src/app/api/custom-fields/save/route.ts`, `src/lib/custom-fields.ts`, `src/lib/dedup/field-groups.ts`,
`src/lib/dedup/merge-defaults.ts`, `src/app/{deals,people,organizations,activities}/[id]/page.tsx`,
`src/lib/api/stage-scope.ts`, `src/lib/formula-recalc.ts`, `src/lib/execution/actions/types.ts`,
`src/lib/events/bus.ts`, `src/lib/events/subscribers/workflow-trigger.ts`, `vitest.db.config.ts`)
**Status:** issues_found

## Summary

The internals of the new modules hold up under attack. I could not defeat
`resolveContainedPath` (empty / `.` / `..` / absolute / nested / poisoned `entityId` /
poisoned `fieldName` / percent-encoded spellings all refuse; `storedName` minted by
`upload/route.ts:60-62` provably cannot contain a separator, because `path.extname` takes the
basename); `findOwnedRecordById` carries all three terms on every one of the four branches and the
`satisfies` + `LOOKUP_ORDER` pair really does make a fifth entity type a compile error;
`recordReferencesStoredName` compares the right field with the right value shape and cannot be
satisfied from a sibling field or another record; `collectFileFieldRefs` neither throws nor returns
a silent `[]` on any hostile shape I could construct. The test surface is unusually honest —
`route-containment.test.ts`'s predicate-evaluating fake database, `purge-blobs.db.test.ts`'s
EISDIR injection with its "the injection took" pre-assertion and its `mockRestore()`-clears-`calls`
correction, `dedup-formula.db.test.ts`'s three pairwise-distinct numbers, and
`create-response-canonical.db.test.ts`'s honest statement of what it *cannot* discriminate — are
real gates, and I found no ninth vacuous gate among them.

Three criticals are all in the same place: **the post-commit block is unconditional**, and the
system contains two paths that make "the row is gone" false while the unlink runs anyway.

1. **CR-01** — nothing checks that the row `DELETE` actually removed a row before the bytes are
   unlinked. A restore that lands between the pre-fetch and the `DELETE` leaves a **live record
   with its blobs destroyed**, a `{success: true}` return, and an audit row claiming a purge.
2. **CR-02** — a duplicate merge copies the loser's file descriptors onto the survivor verbatim
   while the bytes stay under the *loser's* `entityId` directory and the loser's own blob keeps
   referencing them. The retention pruner then unlinks, unattended, the bytes a **live** record
   references — and `deleted === expected`, so the mismatch log stays silent. This is the
   affirmative answer to review priority #2, one hop out through `dedup.ts`.
3. **CR-03** — the new guard is scoped by `ownerId`, but every detail page and the custom-field
   save API are *not* owner-scoped. A non-owner viewer (or the original uploader after a BULK-03
   reassign) now gets 404 on download, and the unchanged client deletes the descriptor anyway after
   a 404 `DELETE` — producing exactly the permanently-unreferenced blob SC-2 exists to eliminate.

Excluded as instructed and confirmed present: SEC-49-A (S3), SEC-49-B (`requireScopedPredicate`
silent at 3+), SEC-49-C (activities 403), SEC-49-D (`POST /api/upload`), DATA-49-A, TS-48-A.

## Critical Issues

### CR-01: the post-commit unlink is not gated on the row `DELETE` having removed a row — a restore racing a purge destroys a live record's blobs

**Files:**
- `src/lib/mutations/organizations.ts:636-638` (delete) / `:681-694` (unlink)
- `src/lib/mutations/people.ts:642` / `:685-698`
- `src/lib/mutations/deals.ts:738` / `:789-802`
- `src/lib/mutations/activities.ts:493-495` / `:539-552`

**Issue:** All four purges carry `isNotNull(deletedAt)` on the row `DELETE` — which correctly
refuses to destroy a live row — but **nothing reads how many rows that statement affected.** No
`.returning()`, no rowcount, no early exit. The transaction then inserts its `__purge` audit row
and commits, the function returns `{ success: true, detached: N }`, and the post-commit block
unlinks every collected blob unconditionally. `unlink` is irreversible; the row's continued
existence is not checked.

**Concrete failure scenario** (named inputs/state → wrong output):

| # | Actor | Statement |
|---|-------|-----------|
| 1 | pruner tick (or admin, tab A) | `purgeOrganizationMutation("org-7")` pre-fetches `org-7`, `deletedAt = 2026-07-01`, `customFields = { "Anexos": [{ storedName: "u1.pdf" }] }` → `blobRefs = [{org-7, Anexos, u1.pdf}]` (`organizations.ts:561-573`) |
| 2 | user, tab B | `restoreOrganizationMutation("org-7")` commits → `deleted_at = NULL` |
| 3 | pruner tick | `db.transaction`: `DELETE FROM notes …` (deletes `org-7`'s notes), `UPDATE deals/people SET organization_id = NULL` (detaches its live children!), `DELETE FROM organizations WHERE id='org-7' AND deleted_at IS NOT NULL` → **0 rows**, `INSERT audit_log … {__purge:{to:true}}` → **COMMIT** |
| 4 | pruner tick | `deleteEntityFiles([{org-7,Anexos,u1.pdf}])` → `unlink('/app/uploads/org-7/Anexos/u1.pdf')` → `{ deleted: 1 }`, `1 === 1` so **no mismatch log** |

Result: `org-7` is alive and visible, its notes are gone, its deals and people have been silently
detached, its attachment bytes are gone forever, its timeline claims it was purged, and the caller
was told `{ success: true, detached: 2 }`. The same interleaving is reachable from two browser tabs
(Restore / Purge Forever are side by side in `/trash`) and from the unattended daily pruner, whose
`selectExpiredIds` batch of up to 200 ids is worked through one record at a time
(`prune.ts:200-247`).

A second, cheaper instance of the same missing check: two concurrent purges of the same id both
return `success` and both write a `__purge` audit row, because the loser of the race also commits
a transaction whose `DELETE` matched nothing.

**Fix** (one shape, four call sites — the deletion count must leave the transaction):

```ts
// inside the transaction, replacing step 5
const purged = await tx
  .delete(organizations)
  .where(and(eq(organizations.id, id), isNotNull(organizations.deletedAt)))
  .returning({ id: organizations.id })

if (purged.length === 0) {
  // The record was restored (or already purged) between the pre-fetch and here. Roll the whole
  // teardown back — the notes deletion and the child detach must not survive either — and let the
  // caller report NOT_IN_TRASH rather than a purge that did not happen.
  throw new Error(NOT_IN_TRASH_INSIDE_TRANSACTION)
}
// ... audit row, then `return { detached: …, purged: true }`
```

and then gate the post-commit block on it:

```ts
if (outcome.purged) {
  try { const { deleted } = await deleteEntityFiles(blobRefs); /* mismatch log */ } catch { … }
}
```

Map `NOT_IN_TRASH_INSIDE_TRANSACTION` to the existing `{ success: false, error: "NOT_IN_TRASH" }`
in the outer `catch` (the `GONE_INSIDE_TRANSACTION` sentinel in `dedup.ts:144` is the in-repo
precedent). `PurgeResult` is unchanged, so the eleven `toEqual({ success: true, detached: N })`
assertions stay green; add one db-test cell that flips `deleted_at` to `NULL` between the pre-fetch
and the transaction (a `beforeEach`-injected restore, or a `vi.spyOn` on the pre-fetch) and asserts
the blob **survives**.

---

### CR-02: a duplicate merge re-homes file descriptors without re-homing the bytes — purging the loser deletes a live record's attachments, silently

**Files:**
- `src/lib/dedup/field-groups.ts:218-220` (every `customFields` key, including `file`-typed ones, is a compared merge field — stated outright at `:148-149`)
- `src/lib/dedup/merge-defaults.ts:80` (`filledOnly` defaults to the **loser**) and `:128-130` (the descriptor array is copied by value into the survivor's blob)
- `src/lib/mutations/dedup.ts:467-471` (the survivor takes `merged.customFields` wholesale) and `:486-489` (the loser keeps its own blob and is soft-deleted)
- `src/lib/trash/collect-file-field-refs.ts:59-92` + `src/lib/mutations/organizations.ts:573,681-694` (and the three siblings)

**Issue:** a blob's on-disk location is `${UPLOAD_DIR}/${entityId}/${fieldName}/${storedName}`, where
`entityId` is the record it was uploaded against (`upload/route.ts:92-101`). The merge copies the
descriptor object — `storedName`, `path` and `publicUrl` all naming the **loser's** id — onto the
survivor, and does not touch the bytes, the loser's own blob, or the descriptor's `publicUrl`. Two
records now reference one file, and the phase's new purge collects refs blindly from the row it is
destroying (by design) with no notion that another live record holds the same `storedName`.

**Concrete failure scenario:**

- Definitions: one `type='file'` field `"Anexos"` on `organization`.
- `org-A` (survivor) has no value for `Anexos`; `org-B` (loser) has
  `[{ storedName: "b1.pdf", publicUrl: "/api/files/org-B/Anexos/b1.pdf" }]`, bytes at
  `/app/uploads/org-B/Anexos/b1.pdf`.
- `buildMergeFieldGroups` puts `customFields.Anexos` in **`filledOnly`** (survivor empty, loser
  populated), whose default choice is `"loser"` — so the user does not even have to click anything.
- `mergeRecordsMutation` writes `org-A.customFields.Anexos = [{ storedName: "b1.pdf", publicUrl: "/api/files/org-B/Anexos/b1.pdf" }]` and soft-deletes `org-B` **with its identical `Anexos` value intact**.
- Immediately: `GET /api/files/org-B/Anexos/b1.pdf` as A's owner → `findOwnedRecordById("org-B")`
  refuses (trashed, and possibly foreign-owned — the merge checks no owner) → **404**. The survivor
  displays an attachment that can never be downloaded.
- 30 days later, unattended: `pruneEntityType("organization")` → `purgeOrganizationMutation("org-B")`
  → `collectFileFieldRefs("org-B", …)` → `unlink('/app/uploads/org-B/Anexos/b1.pdf')` →
  `deleted (1) === blobRefs.length (1)` → **no mismatch log**. The live `org-A` now references bytes
  that no longer exist.
- Mirror image, same root cause: if `org-A` is purged first, `collectFileFieldRefs("org-A", …)`
  builds `/app/uploads/org-A/Anexos/b1.pdf`, which never existed; `existsSync` is false, the
  already-absent branch (`delete-entity-files.ts:129-132`) **counts it as deleted**, and the purge
  reports full success while `org-B`'s bytes remain forever.

Currently latent — 49-01 measured zero `type='file'` definitions and zero stored descriptors — but
so was DATA-02, and this one loses data rather than misreporting it. The merge is the *only* way two
CRM rows can come to share a `storedName`, so this is the single hole in the "a blob belongs to
exactly one row" premise the whole SC-2 design rests on.

**Fix** — pick one and record the choice; the first is the smallest:

1. **Refuse file-typed keys in the merge picker.** `describeField` already resolves the definition,
   so `comparedKeys` can skip a key whose definition `type === 'file'`, exactly as
   `MERGE_EXCLUDED_COLUMNS` skips `customFields` itself. Cost: a merge no longer moves attachments
   (state it in the merge UI). No new failure mode.
2. **Re-home the bytes.** On adopting a file value, copy each blob to
   `${UPLOAD_DIR}/${survivorId}/${fieldName}/${storedName}` and rewrite `path`/`publicUrl` before
   the survivor `UPDATE`, leaving the loser's copy for its own purge to collect. Correct, but adds
   filesystem I/O to the merge transaction's critical path — do it post-commit, best-effort, with the
   same never-rethrow discipline the purge block uses.
3. **Make the purge reference-aware.** Before unlinking, drop any ref whose `storedName` still
   appears in a live row's `customFields` (one `jsonb` `LIKE`/`@>` probe per entity type) and log the
   skip. This also covers any future path that copies a descriptor.

Whichever is chosen, add a db-test cell: merge with the loser's file adopted, purge the loser, assert
the survivor's bytes are **still on disk**.

---

### CR-03: the new owner-scoped file guard contradicts the session-side authorization model — downloads break for legitimate viewers, and the unchanged client turns each 404 `DELETE` into a permanent orphan

**Files:**
- `src/lib/api/file-access.ts:158-163` (`eq(source.ownerId, userId)`) and `src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts:58-65`
- `src/app/deals/[id]/page.tsx:57`, `src/app/people/[id]/page.tsx:47`, `src/app/organizations/[id]/page.tsx:41`, `src/app/activities/[id]/page.tsx:56` — **no owner term on any detail page read**
- `src/lib/custom-fields.ts:277-282` — `saveFieldValues` updates `where(eq(table.id, entityId))` with **no owner term and no `deletedAt` term**; `src/app/api/custom-fields/save/route.ts:10-13` checks only that a session exists
- `src/components/custom-fields/file-field.tsx:162-167` — the response of the `DELETE` is **never inspected**

**Issue:** the phase chose `ownerId = session.user.id` as the file-access predicate. Every
session-side surface that *displays and edits* the same file field is not owner-scoped: all four
detail pages render `CustomFieldsSection` for any authenticated caller, with no `disabled` prop
(`deals/[id]/page.tsx:244-258`), and the save API happily writes another user's `customFields`. The
guard is therefore strictly tighter than the UI that reaches it, and the client was not updated.

**Concrete failure scenario (download):** user `B` opens `/deals/<id>` for a deal owned by `A`
(page returns 200 — no owner term), sees `Contrato.pdf` in the file field, clicks it →
`GET /api/files/<dealId>/Contrato/<uuid>.pdf` → `findOwnedRecordById` returns `null` (owner
mismatch) → **404 "File not found"** on a file the page just told them exists. The same break hits
the *uploader* after a BULK-03 owner reassign: `A` uploaded the file, an admin moves the deal to
`B`, `A` can still open the page and can still see the attachment, and can no longer download it.

**Concrete failure scenario (permanent orphan — this is the data half):** same `B`, same page,
clicks the `X` on the file:

1. `file-field.tsx:162` — `await fetch(file.publicUrl, { method: 'DELETE' })` → **404**, return value discarded, no `res.ok` check, no `catch` branch that aborts.
2. `:165-167` — the descriptor is removed from local state and `onSave(newFiles.length > 0 ? newFiles : null)` is called.
3. `custom-fields-section.tsx:19-24` → `POST /api/custom-fields/save` → `saveFieldValues` → `UPDATE deals SET custom_fields = <without the descriptor> WHERE id = <dealId>` — **accepted**, because that path has no owner term.

The bytes are still at `/app/uploads/<dealId>/Contrato/<uuid>.pdf`, and the only record that named
them no longer does. The file route can never serve it (the reference match fails), the DELETE verb
can never remove it (same match), and `collectFileFieldRefs` can never see it at purge time — so it
survives the record's own permanent deletion with `deleted === expected` and no mismatch log. That
is precisely the "the blob outlives both its row and its definition and nothing ever names it again"
failure `collect-file-field-refs.ts:20-29` says the phase exists to close, re-created by the phase's
own guard plus an un-updated caller.

**Fix** (the first is mandatory; the second is the decision this phase implicitly took and should
state):

```ts
// src/components/custom-fields/file-field.tsx — handleDelete
const res = await fetch(file.publicUrl, { method: 'DELETE' })
if (!res.ok) {
  // Never drop the reference on a failed storage delete: the descriptor is the ONLY thing that
  // can name this blob for a later retry or for the purge's ref walk.
  log.error('components/custom-fields/file-field', 'Delete refused', { status: res.status })
  alert(t('files.deleteFailed'))
  return
}
```

And reconcile the two authorization models, explicitly:
- **either** widen the file guard to whatever the product means by "may see this record" (e.g. drop
  the `ownerId` term for `GET` and keep it for `DELETE`, or introduce a shared `canAccessRecord`
  used by the pages, the save API *and* `file-access.ts`),
- **or** keep the guard and tighten what it must agree with: add the owner term to
  `saveFieldValues`' `WHERE` (plus `isNull(deletedAt)`, which is also missing there — a trashed
  record's blob can currently be edited between a purge's pre-fetch and its commit; see WR-03) and
  pass `disabled` to `CustomFieldsSection` for non-owners so the UI stops offering an action that
  will 404.

Do not leave the two as they are: the read path and the write path disagree about who owns a file,
and the client resolves the disagreement by dropping the only reference to the bytes.

## Warnings

### WR-01: the survivor recalculation cannot select a formula whose stored value the merge itself overwrote from the loser

**File:** `src/lib/mutations/dedup.ts:684-703` (with `src/lib/formula-recalc.ts:351-372`)

**Issue:** `survivorChangedFields` is built from the *inputs* that changed
(`Object.keys(nativeValues)` + `Object.keys(merged.customFields)`, both filtered by
`!Object.is(before, after)`), and `scopeFormulasToChangedFields` selects a formula only when one of
its **refs** is in that set (`:352-370`). A formula's own name being in `changedFields` selects
nothing. But the merge writes `customFields` **wholesale** (`dedup.ts:469`), and a `formula`-typed
key is a compared merge field like any other (`field-groups.ts:218-220`) whose `filledOnly` default
is the **loser** (`merge-defaults.ts:80`). So the merge can overwrite the survivor's derived value
with the loser's while none of that formula's inputs changed — and block 1 then correctly decides
there is nothing to recompute.

**Concrete failure scenario:** definitions `Receita` (`number`) and `Score` (`formula`,
`{{Receita}} * 2`), where `Score` was added after `org-A`'s last save so `org-A` has no `Score` key.
`org-A` = `{ Receita: 10 }` (survivor), `org-B` = `{ Receita: 42, Score: {value: 84} }` (loser).
The picker puts `customFields.Receita` in `conflicts` (default **survivor**, 10 kept → not changed)
and `customFields.Score` in `filledOnly` (default **loser**). The user accepts the defaults. After
the merge: `org-A = { Receita: 10, Score: {value: 84} }`. `survivorChangedFields = ["Score"]`;
`Score`'s only ref is `Receita`, which is not in the set → `inScope = []` → the engine writes
nothing. The survivor permanently stores `Score = 84` against `Receita = 10`, i.e. a derived value
the record's own inputs contradict — DATA-01, in the block written to close DATA-01 — and it is also
a formula value the server did not compute (the T-34-04 invariant every other write path enforces
via `stripFormulaKeys`).

**Fix:** treat an overwritten formula key as in-scope. Cheapest correct form — strip formula keys out
of the merged blob before the survivor `UPDATE` and let block 1 recompute them (matching
`saveFieldValues:237-253`, which carries formula values over rather than accepting posted ones):

```ts
const survivorFormulaNames = new Set(
  (await getActiveFieldDefinitions(entityType)).filter(isFormulaDefinition).map(d => d.name)
)
// A formula value is server-derived: never adopt the loser's, and never let a choice map set one.
for (const name of survivorFormulaNames) {
  if (name in survivorBlob) merged.customFields[name] = survivorBlob[name]
  else delete merged.customFields[name]
}
```

plus, in `survivorChangedFields`, add the refs of any formula whose stored value differs from the
survivor's (or the `CHANGED_FIELDS_CUSTOM_SENTINEL`) so a stale-but-present value is refreshed.
`dedup-formula.db.test.ts` can prove it with one more cell: survivor without the formula key, loser
with a value derived from a `Receita` the survivor keeps → assert the stored value equals
`SURVIVOR_INPUT * FACTOR`, not the loser's.

---

### WR-02: the canonical-read fallback ships the pre-recalc row — the "unreachable" claim is falsifiable, and the fallback re-creates DATA-02

**Files:** `src/app/api/v1/people/route.ts:283-295`, `src/app/api/v1/deals/route.ts:374-386`,
`src/app/api/v1/organizations/route.ts:129-143`, `src/app/api/v1/activities/route.ts:261-275`

**Issue:** all four routes comment that the fallback "is unreachable — the insert just committed a
row whose `ownerId` is the value being matched". The canonical read is issued **after** the bus
emit (`people/route.ts:247` then `:283`; the two mutation-shaped routes emit inside the mutation,
`organizations.ts:251`, before `route.ts:129`), and `crmBus.emit` is a synchronous `EventEmitter`
whose workflow subscriber calls `matchAndFireTriggers(...)` fire-and-forget
(`workflow-trigger.ts:76-78`). A `crm_action` with `operation: "delete"`
(`execution/actions/types.ts:16-24`) targeting `{{trigger.entityId}}` therefore races the read.

**Concrete failure scenario:** workflow `W` — trigger `person.created`, action
`crm_action { entity: person, operation: delete, targetId: "{{trigger.entityId}}" }` (a plausible
"junk lead" rule). `POST /api/v1/people {first_name:"Ada", custom_fields:{Origem:["Inbound"]}}` →
insert → recalc writes `Score` → emit → `W` soft-deletes the row → the route's
`findFirst(and(id, ownerId, isNull(deletedAt)))` returns `undefined` → the 201 body is
`serializePerson(person)`, i.e. the **pre-recalc** blob `{Origem:["Inbound"]}` with no `Score`,
while the accompanying log line says only "canonical read after create found no row". The client
receives a 201 describing a state no read will ever confirm — the exact drift DATA-02 removed —
plus an `error`-level line that misattributes the cause.

**Fix:** make the fallback the best available truth rather than the worst, and say what happened:

```ts
if (!canonical) {
  log.error("api/v1/people", "canonical read after create found no row; the record was " +
    "reassigned or trashed between the insert and the read", { id: person.id })
}
return createdResponse(
  serializePerson(canonical ?? { ...person, customFields: recalculatedCustomFields })
)
```

(The in-process merge is rejected as the *primary* path for good reasons; as the fallback it is
strictly better than the raw `.returning()` row.) For `organizations`/`activities`, the merge blob
is not in scope in the route — either return the mutation's own post-recalc value from the mutation,
or move the canonical read **before** the emit so no subscriber can invalidate it.

---

### WR-03: refs are collected before the transaction, so a blob added to a trashed record in that window is orphaned with no mismatch log

**Files:** `src/lib/mutations/organizations.ts:569-573` (and `people.ts:596-600`,
`deals.ts:667-671`, `activities.ts:477-481`), with `src/lib/custom-fields.ts:277-282`

**Issue:** the phase deliberately collects `blobRefs` from the pre-fetch row before the
transaction, because after the commit there is no row to read. The consequence is not recorded: any
descriptor written to that row *after* the pre-fetch is never collected, and because
`saveFieldValues` carries no `deletedAt` guard (and no owner guard — see CR-03), a **trashed**
record's `customFields` can still be written.

**Concrete failure scenario:** `org-9` is in the trash with `Anexos: [a.pdf]`. The pruner's
`purgeOrganizationMutation("org-9")` pre-fetches and collects `[{org-9, Anexos, a.pdf}]`. In the
same window a client `POST /api/custom-fields/save {entityType:"organization", entityId:"org-9",
values:{Anexos:[a.pdf, b.pdf]}}` succeeds (the row still exists; nothing refuses a trashed target).
The transaction then deletes the row. `deleteEntityFiles` unlinks `a.pdf`, `deleted (1) === expected
(1)` → **no mismatch log**, and `b.pdf` is an orphan nothing will ever name again.

**Fix:** re-read `customFields` **inside** the transaction, immediately before the row `DELETE`
(`SELECT custom_fields … FOR UPDATE`), and collect refs from that copy — the row lock also
serialises the concurrent save. Keep the deletion itself post-commit; only the *collection* moves
in. Cheaper partial mitigation: add `isNull(table.deletedAt)` to `saveFieldValues`' predicate so a
trashed record cannot be written at all, and say so in its doc comment.

## Info

### IN-01: unused imports in three of the four touched `/api/v1` routes

**Files:** `src/app/api/v1/organizations/route.ts:1,11` (`NextResponse`, `sql`),
`src/app/api/v1/people/route.ts:1` (`NextResponse`),
`src/app/api/v1/deals/route.ts:1,13` (`NextResponse`, `sql`)

**Issue:** each identifier occurs exactly once in its file — the import line. Pre-existing, and
among the 118 lint warnings, but these are files this phase edited, so the cleanup is free here.

**Fix:** delete the unused specifiers (`import { NextRequest } from "next/server"`, and drop `sql`
from the drizzle import lists).

---

_Reviewed: 2026-08-26T15:12:36Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
