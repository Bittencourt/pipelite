---
phase: 37-trash-restore
reviewed: 2026-08-16T23:20:00Z
depth: standard
files_reviewed: 26
files_reviewed_list:
  - src/lib/trash/settings.ts
  - src/lib/trash/prune.ts
  - src/lib/trash/queries.ts
  - src/lib/trash/present.ts
  - src/lib/trash/entity-types.ts
  - src/lib/trash/dispatch.ts
  - src/app/trash/actions.ts
  - src/app/trash/page.tsx
  - src/app/trash/trash-tabs.tsx
  - src/app/trash/trash-columns.tsx
  - src/app/trash/trash-table.tsx
  - src/app/admin/trash/actions.ts
  - src/app/admin/trash/page.tsx
  - src/app/admin/trash/retention-form.tsx
  - src/app/api/v1/trash/route.ts
  - src/app/api/v1/trash/[type]/[id]/route.ts
  - src/app/api/v1/trash/[type]/[id]/restore/route.ts
  - src/lib/mutations/deals.ts
  - src/lib/mutations/people.ts
  - src/lib/mutations/organizations.ts
  - src/lib/mutations/activities.ts
  - src/lib/audit/no-mutation-coupling.test.ts
  - instrumentation.ts
  - drizzle/0015_trash_retention_seed.sql
  - scripts/trash-checks.sql
  - src/components/user-menu.tsx
findings:
  critical: 1
  warning: 9
  info: 8
  total: 18
status: issues_found
---

# Phase 37: Code Review Report

**Reviewed:** 2026-08-16T23:20:00Z
**Depth:** standard
**Files Reviewed:** 26
**Status:** issues_found

## Summary

The five focus areas held up under attack. Authorization is genuinely re-checked at both
boundaries (`src/app/trash/actions.ts:99-281`, the three `/api/v1/trash` routes); the purge
admin gate really does precede every lookup (`[type]/[id]/route.ts:90-100`,
`actions.ts:251-266`); `restoreWithLinked` really does re-check per parent against the
*parent's* own owner (`actions.ts:190-205`); the teardown is one transaction in the documented
order in all four mutations; there is no `?? 30` anywhere and the pruner issues zero queries when
retention is `null`; the pruner reschedules outside its `try`, caps batches, and breaks on
no-progress; `sql.param(ids)::text[]` renders as a single `$2::text[]` bind (verified by
generating the SQL through `PgDialect`); and every trash read carries `isNotNull(deletedAt)`
explicitly. `tsc --noEmit` is clean and all 1,690 tests pass.

What the review found is on the edges of that core:

- **One critical gap in the promise `purge` makes.** The teardown deletes the row, its notes and
  its join rows, but never the file attachments the record's custom fields point at. Those blobs
  stay on disk/S3 at a stable URL served by an endpoint that does no record lookup, and the URL
  itself survives forever in the delete tombstone. "Permanently deleted" is not true for
  attachments. `src/lib/trash/prune.ts:44-46` even asserts that files *are* torn down, which they
  are not — a comment that will stop the next maintainer from noticing.
- **A self-inconsistent REST contract.** The list endpoint emits `entity_type: "deal"` and
  documents that a client can round-trip it into `/api/v1/trash/{type}/{id}`; both write routes
  accept only `deals`. A client that follows the shipped documentation gets a 400.
- **Purge's detach is fire-and-forget for derived data.** Nulling a child's foreign key changes a
  field that dot-reference formulas read, and no recalculation runs. Restore is the documented
  repair point for stale values, but a purged parent has no restore — those values are wrong
  permanently.
- **Two unbounded-work surfaces** (`/trash?page=200`, `GET /api/v1/trash?offset=10000`) that any
  authenticated caller can trigger.
- **A silent-failure path in the pruner** (`toIds` degrading to `[]`) that makes a broken retention
  policy log the same line as an empty trash.

Known-and-decided items (mutations writing audit rows directly, detach-vs-cascade, `api_key`
having no name, the missing `/api/v1/trash` route tests tracked as UAT G4) are not re-litigated
below.

## Critical Issues

### CR-01: A purge leaves the record's file attachments on disk and downloadable

**File:** `src/lib/mutations/deals.ts:658-719`, `src/lib/mutations/people.ts:525-570`,
`src/lib/mutations/organizations.ts:492-559`, `src/lib/mutations/activities.ts:474-501`
(claim contradicted at `src/lib/trash/prune.ts:44-46`)

**Issue:**
The ordered teardown handles `notes`, `deal_assignees`, `deal_stage_history`, the FK detachments
and the row itself. It does not touch uploaded files. File custom fields are stored on disk (or
S3) at `${UPLOAD_DIR}/${entityId}/${fieldName}/${storedName}`
(`src/app/api/upload/route.ts:88-99`) and are referenced only from the record's `customFields`
JSONB. Purge deletes the row, so the *reference* disappears while the *blob* does not.

Three consequences, in increasing order of seriousness:

1. Storage grows monotonically with every purge — the retention pruner is now a leak generator.
2. `GET /api/files/[entityId]/[fieldName]/[filename]`
   (`src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts:37-44`) performs **no record
   lookup at all** — it authorizes on `session?.user` alone. Anyone who ever held the URL (the
   record's former owner, a colleague it was shared with) can still download the file after an
   admin has been told "{name} and its notes will be permanently deleted. This can't be undone."
3. The URL is not even something one has to have kept. The soft-delete tombstone diffs the whole
   pre-delete row including `customFields` (`src/lib/audit/diff.ts:140-166`), and purge
   deliberately preserves prior `audit_log` rows. So the path to a "permanently deleted" record's
   attachments is recoverable from the audit log by any admin, indefinitely.

`37-CONTEXT.md` locks "a purge hard-deletes the record and its notes" and is silent on files, so
this is a scope gap rather than a violated decision — but the shipped confirmation copy and the
pruner's own comment both assert the stronger property. This is the one operation in the phase
that cannot be undone or retried later; shipping it half-done means the data is unreachable
through the product and still present on the filesystem.

**Fix:** Extend the teardown with a best-effort blob delete, ordered after the row delete so a
storage failure cannot roll back a committed purge (and vice versa), and audited by count:

```ts
// inside purge*Mutation, after the transaction commits
const fileRefs = collectFileFieldRefs(record.customFields) // [{ fieldName, storedName }]
const removed = await deleteEntityFiles(id, fileRefs)      // new helper in src/lib/files/
if (removed < fileRefs.length) {
  // identifiers and counts only
  console.error(`[trash-purge] ${ENTITY} ${id}: ${fileRefs.length - removed} file(s) not removed`)
}
```

If deleting blobs is deliberately out of scope for this phase, then at minimum:

- correct `src/lib/trash/prune.ts:44-46`, which currently states files are part of the teardown;
- record the gap in `.planning/STATE.md` so the next phase inherits it rather than rediscovering
  it; and
- tighten `src/app/api/files/.../route.ts` to resolve the entity before serving, so a purged
  record's blobs stop being readable even while they exist.

## Warnings

### WR-01: The documented `entity_type` round-trip is broken — GET emits singular, the write routes accept only plural

**File:** `src/app/api/v1/trash/route.ts:154-166` vs `src/app/api/v1/trash/[type]/[id]/route.ts:54-64`
and `src/app/api/v1/trash/[type]/[id]/restore/route.ts:62-72`

**Issue:** `serializeTrashRow` sets `entity_type` to the **singular** `EntityType`, with an
explicit comment: *"so a client can round-trip a row straight into /api/v1/trash/{type}/{id}
without transforming the plural tab name itself."* Both write routes validate the segment with
`z.enum(TRASH_TABS)`, i.e. the **plural** tab names, and map to the singular afterwards. A client
doing exactly what the comment instructs — `DELETE /api/v1/trash/deal/{id}` — receives a 400
`invalid_value`. The two halves of the same REST surface disagree about their own vocabulary, and
the disagreement is documented as a feature.

**Fix:** Pick one and make the comment true. Either accept both spellings in the segment:

```ts
function narrowEntityType(segment: string): EntityType | null {
  if (isTrashEntityType(segment)) return segment            // singular, as GET emits
  const parsed = segmentSchema.safeParse(segment)           // plural, as the UI uses
  return parsed.success ? TRASH_TAB_TO_ENTITY[parsed.data] : null
}
```

...or emit the plural tab in `entity_type` and delete the round-trip claim. Do not leave the
comment as-is.

### WR-02: Purge detaches live children without recalculating their formulas, and nothing can ever repair them

**File:** `src/lib/mutations/deals.ts:672-677`, `src/lib/mutations/people.ts:534-538`,
`src/lib/mutations/organizations.ts:501-512`

**Issue:** `activities.dealId`, `deals.personId` and `deals.organizationId` are exactly the three
foreign keys `CASCADE_CHILD_RELATIONS` (`src/lib/formula-recalc.ts:225-262`) walks to feed
`Organization.*`, `Person.*` and `Deal.*` dot-references into child formulas. The purge nulls
them and calls no recalculation, so every detached child keeps a stored formula value derived
from a record that no longer exists.

The phase's own justification for skipping recalculation on delete is that *restore is the repair
point* (`deals.ts:567-570`, `organizations.ts:419-427`). That argument does not carry to purge:
the parent is gone, there is no restore, and the stale value persists until something unrelated
happens to touch that child. A detached activity can display an organization name for an
organization that was permanently deleted.

**Fix:** Recalculate each detached child after the transaction commits (outside it, so a formula
failure cannot roll back a committed purge), scoped to the FK that changed — the same posture the
restore path uses:

```ts
for (const child of detachedActivities) {
  try {
    await recalculateFormulas({
      entityType: "activity", entityId: child.id, changedFields: ["dealId"],
    })
  } catch (error) {
    console.error("[formula-recalc] purge detach recalculation failed:", child.id, error)
  }
}
```

Note `dealId` / `organizationId` / `personId` are not in `ENTITY_NATIVE_ATTRIBUTES`, so
`scopeFormulasToChangedFields` will select nothing for that literal — the `changedFields` list
must be broadened the same way `DEAL_RESTORE_CHANGED_FIELDS` is, or the call silently no-ops
(RESEARCH Pitfall 1, which this phase already tripped over once).

### WR-03: One authenticated request can force a 10,000-row read, a 10,000-element array bind and a 10,000-row render

**File:** `src/lib/trash/entity-types.ts:117-150`, `src/lib/trash/queries.ts:666-693`,
`src/app/api/v1/trash/route.ts:63-84`

**Issue:** `listTrashed` is cumulative — page *N* fetches `50 × N + 1` rows — and
`parseTrashPage` clamps to 200. So `GET /trash?page=200` fetches 10,001 rows, passes 10,000 ids
into `resolveDeletedBy` as one array parameter, runs a `DISTINCT ON` over 10,000 matched audit
rows with three LEFT JOINs, and server-renders 10,000 `<tr>` into a single HTML document. The
REST route caps `offset` at the same 10,000 and inherits the identical cost per request
(`pageCovering`), and its own comment concedes "serving `offset=9950` fetches 10,000 rows".

The clamps are real controls and stop the unbounded case, but the bounded case is still large
enough that a handful of concurrent requests will pin the Node process and the database. Both
clamps are reachable by editing a URL; no privilege is required.

**Fix:** Make the read non-cumulative — this is the one place the "Load more" idiom costs more
than it saves:

```ts
// queries.ts — offset/limit instead of a growing window
const rows = await listRowsForTab(tab, TRASH_PAGE_SIZE + 1, (page - 1) * TRASH_PAGE_SIZE, viewer)
```

and drop `MAX_TRASH_PAGE` to something a human can reach (10–20 pages) once the per-page cost is
constant. Failing that, lower `MAX_TRASH_PAGE` / `MAX_TRASH_API_PAGE` now — the current value of
200 was chosen as "far past any reachable trash view", which is an argument that it is safe to
lower, not that it is safe to keep.

### WR-04: `toIds` turns a driver-shape change into a silently disabled retention policy

**File:** `src/lib/trash/prune.ts:216-240` (with `prune.ts:173-175`)

**Issue:** `toIds` returns `[]` for any result it does not recognise, with no log line. The batch
loop then sees `ids.length < BATCH_SIZE` and breaks. A tick in which the driver's result shape
changed logs `[trash-prune] purged 0 record(s) older than 30d` — byte-identical to a tick with an
empty trash. The module's header argues at length that the startup log line exists precisely
because a silently non-running pruner already shipped once in this repo; this path reintroduces
the same class of invisibility one level deeper, and the comment at `prune.ts:216-221` presents
it as a feature.

**Fix:** Distinguish "no rows" from "unrecognised shape", and log the second:

```ts
function toIds(result: unknown): string[] {
  const rows = Array.isArray(result) ? result
    : Array.isArray((result as { rows?: unknown })?.rows) ? (result as { rows: unknown[] }).rows
    : null

  if (rows === null) {
    console.error("[trash-prune] unrecognised result shape from the expiry query — purging nothing")
    return []
  }
  ...
}
```

### WR-05: Server-action arguments other than `tab` are not runtime-validated

**File:** `src/app/trash/actions.ts:99-101`, `:157-159`, `:247-249`

**Issue:** The module header states the rule explicitly — *"a type is not a runtime control on a
value that arrived over the wire"* — and then applies it to `tab` only. `id: string` is a
TypeScript annotation on a POST endpoint the browser invokes directly; a caller can send a
number, an object, `null` or an array. It flows straight into `eq(deals.id, id)` inside
`findTrashedRecord`.

Today the blast radius is contained: `findTrashedRecord` wraps its query in try/catch and returns
`null`, so a malformed `id` becomes `NOT_IN_TRASH`. That containment is incidental, not designed
— the same argument reaches `restoreRecordByType` / `purgeRecordByType` the moment someone
reorders the guards.

**Fix:** Narrow at the boundary, the way the file already narrows `tab`:

```ts
function parseRecordId(raw: unknown): string | null {
  return typeof raw === "string" && raw.length > 0 && raw.length <= 64 ? raw : null
}
// ...
const recordId = parseRecordId(id)
if (recordId === null) return { success: false, code: "NOT_IN_TRASH" }
```

### WR-06: `restoreWithLinked` reports success while silently omitting parents it refused or failed to restore

**File:** `src/app/trash/actions.ts:184-233`, consumed at `src/app/trash/trash-table.tsx:163-174`

**Issue:** A parent the caller may not touch is pushed onto `skipped`; a parent whose restore
failed is pushed onto `failed`. Both are logged server-side and then **dropped** — the action
returns `{ success: true, count: restoredParents + 1 }` with no field distinguishing "restored
everything you asked for" from "restored one of three". The toast renders
`t("restoredWithLinked", { count })`, so a user who clicked *Restore with linked records* on a
deal whose organization and person are both trashed and both owned by a colleague sees
`1 record restored.` and no indication that the linked records they explicitly asked for did not
come back. The badge that offered the affordance is still on screen after the refresh, which
reads as a bug rather than as a permission boundary.

**Fix:** Return the shortfall and say so:

```ts
return { success: true, name: record.name, tab: trashTab,
         count: outcome.restoredParents + 1,
         unrestoredParents: skipped.length + failed.length }
```

and in the table, follow the success toast with `toast.warning(t("linkedNotRestored", { count }))`
when `unrestoredParents > 0`.

### WR-07: The linked-in-trash badge discloses the trashed state of records outside the viewer's owner scope

**File:** `src/lib/trash/queries.ts:464-486`, `:514-529`, `:586-604`

**Issue:** `queries.ts:5-18` states the module's invariant: *"the owner predicate is part of the
query ... never by filtering a result set afterwards"*. `trashScope` is applied to the base table
only. The parent `LEFT JOIN`s carry no owner predicate at all, and their `deleted_at` is projected
into `organizationTrashed` / `personTrashed` / `dealTrashed` and then into `linkedParents`
(`collectTrashedParents`, `queries.ts:446-462`), which the badge renders together with the parent's
name (`trash-columns.tsx:113-126`).

So a member who owns deal *D* linked to organization *O* owned by someone else learns that *O* is
in trash — a fact about a record that member cannot see on any trash tab and would be refused if
they tried to restore it (`actions.ts:190-196` correctly refuses). The read side leaks what the
write side is careful to protect.

**Fix:** Scope the parent visibility the same way the rows are scoped, so the badge only mentions
parents the viewer could act on:

```ts
organizationTrashed: sql<boolean>`(${organizations.deletedAt} IS NOT NULL
  AND (${viewer.role === "admin"} OR ${organizations.ownerId} = ${viewer.userId}))`.mapWith(Boolean)
```

If showing the badge for unreachable parents is intentional (so the user understands why the deal
looks incomplete), then at minimum drop the parent's *name* from the `title` for a parent the
viewer does not own, and hide the *Restore with linked records* button for that row rather than
offering an action that will silently skip.

### WR-08: The purge confirmation does not mention that live child records are unlinked

**File:** `src/app/trash/trash-table.tsx:379-382`,
`src/messages/{en-US,es-ES,pt-BR}.json` → `trash.purgeDialog.description`

**Issue:** The dialog reads *"{name} and its notes will be permanently deleted. This can't be
undone. Its change history is kept."* Purging one deal nulls `deal_id` on up to 117 **live**
activities (`37-RESEARCH` measurements); purging an organization detaches every live deal and
person under it. Those are records the admin did not select, mutated by a confirmation that
enumerates what is destroyed and what is preserved but not what is modified. UAT G1 observed this
happening in the browser and recorded it as a confirmed defect rather than a prediction; the
detach choice itself is locked and is not in question here, only that the consent screen omits it.

**Fix:** The string is locked in the UI-SPEC, so this needs a copy amendment rather than a patch
here — but it should not ship unamended. The minimal correct copy is one more sentence, driven by
a count the server already computes:

```
"{name} and its notes will be permanently deleted. {detached, plural,
  =0 {} other {# linked record(s) will be unlinked but kept. }}This can't be undone.
  Its change history is kept."
```

which requires the dialog to know the detach count before the write — a `countPurgeImpact(type,
id)` read alongside `findTrashedRecord`.

### WR-09: A `NOT_IN_TRASH` purge failure leaves the stale row on screen

**File:** `src/app/trash/trash-table.tsx:189-199`

**Issue:** `reportRestoreFailure` handles `NOT_IN_TRASH` correctly — it says "already purged" and
calls `router.refresh()` so the dead row leaves (`trash-table.tsx:111-125`). `confirmPurge` has
its own switch that handles only `NOT_ADMIN` and falls through everything else, including
`NOT_IN_TRASH`, to the generic `t("error.purgeFailed")` with **no refresh**. A record purged in
another tab therefore stays in this table, telling the admin the purge failed and inviting them to
retry a record that no longer exists — the exact failure mode `actions.ts:15-19` says the code
vocabulary exists to prevent, implemented on one of the two paths.

**Fix:**

```ts
switch (result.code) {
  case "NOT_ADMIN":
    toast.error(t("error.purgeNotPermitted")); break
  case "NOT_IN_TRASH":
    toast.error(t("error.alreadyPurged")); router.refresh(); break
  default:
    toast.error(t("error.purgeFailed"))
}
```

## Info

### IN-01: `purgeRecord` returns a `detached` count nothing consumes

**File:** `src/app/trash/actions.ts:278-280`, `src/app/trash/trash-table.tsx:202`

**Issue:** The action's own comment says *"the count is what the toast can honestly add"*. The
toast is `t("purged", { name: result.name })` — `detached` is computed through four mutations,
threaded through `PurgeResult`, returned to the client and dropped. Either wire it into the toast
(which would partially address WR-08 after the fact) or stop claiming it is used.

### IN-02: The purge marker and the actor-column helper are duplicated four ways

**File:** `src/lib/mutations/people.ts:162-188`, `src/lib/mutations/organizations.ts:~172-192`,
`src/lib/mutations/deals.ts:651-656,716`, `src/lib/mutations/activities.ts:495-499`

**Issue:** `auditActorColumns()` and `PURGE_MARKER` exist as named helpers in `people.ts` and
`organizations.ts`, and as inline object literals in `deals.ts` and `activities.ts`. Four copies
of `{ __purge: { from: null, to: true } }` and of the four-field actor spread. A change to the
marker's shape (e.g. adding the detach count) has to land in four places or the audit trail
becomes inconsistent between entity types.

**Fix:** Move both to a shared module the four mutations import (`src/lib/audit/actor-context.ts`
already sits inside the coupling gate's permitted vocabulary, so this needs no gate change).

### IN-03: The coupling gate's function slicer attributes inter-function code to the preceding function

**File:** `src/lib/audit/no-mutation-coupling.test.ts` (`sliceDeclaration`)

**Issue:** The slice runs from a declaration to the next `\nexport `, so any non-exported code
between two exported functions — e.g. `const DEAL_RESTORE_CHANGED_FIELDS` at
`src/lib/mutations/deals.ts:521-524`, which sits between `deleteDealMutation` and
`restoreDealMutation` — is counted as part of the *preceding* function's body. The gate is
therefore slightly over-strict for `create/update/delete` and correspondingly under-strict about
where a coupling actually lives. Harmless today; worth pinning with a brace-matching slice or a
comment so a future failure is not misread.

### IN-04: `pageCovering` clamps the offset but the slice does not

**File:** `src/app/api/v1/trash/route.ts:79-84`, `:235`

**Issue:** `pageCovering` computes its page from `min(offset, 10000)` and additionally caps at 200
pages, while the slice uses the raw `offset`. For `offset` in roughly (9950, 10000] with
`limit=100`, the page cap truncates the fetched window and the response returns fewer rows than
`limit` while `meta.total` still reports the full count. Nothing is disclosed and nothing crashes;
the pagination contract is just wrong in that band.

### IN-05: `startTrashPruner` logs a hard-coded delay that will drift from `INITIAL_DELAY`

**File:** `src/lib/trash/prune.ts:96` (with `:31`)

**Issue:** `"Starting with initial delay of 60s, ticking daily"` restates `INITIAL_DELAY` and
`TICK_INTERVAL` as literals. Both constants are exported and asserted by the test suite; the
string is not. Since this exact line is the documented deployment gate, a drifted message is a
gate that reports a delay the process is not using. Interpolate the constants.

### IN-06: `collectTrashedParents` drops a trashed parent whose name is empty

**File:** `src/lib/trash/queries.ts:446-462`

**Issue:** The guard is `candidate.name !== null && candidate.name !== ""`. A trashed parent whose
display name renders empty (a person with whitespace-only first and last names, an organization
saved with an empty `name`) is not added to `linkedParents`, so the badge disappears **and** the
*Restore with linked records* button disappears with it — the affordance is gated on the same
array. The parent is still trashed and the child still needs it. Prefer keeping the entry with a
fallback label over dropping it.

### IN-07: `scripts/trash-checks.sql` is a destructive hand-run script with no dry-run guard

**File:** `scripts/trash-checks.sql`

**Issue:** 12 `BEGIN` / 12 `ROLLBACK` pairs — balanced, and each destructive probe is wrapped —
but the header instructs the operator to run it with `ON_ERROR_STOP` unset, several Part 2 probes
delete **real production rows** to provoke SQLSTATE 23503, and the file carries no
`SET default_transaction_read_only`, no target-database assertion and no confirmation prompt. One
mis-paired edit, or one paste of a subsection into a `psql` session already inside a transaction,
commits real deletions. Add a Part 0 guard that aborts unless the connected database matches an
expected non-production name.

### IN-08: The three `/api/v1/trash` routes still have no checked-in tests

**File:** `src/app/api/v1/trash/route.ts`, `[type]/[id]/route.ts`, `[type]/[id]/restore/route.ts`

**Issue:** Tracked as UAT G4 and accepted by the user, restated here only because two of this
review's findings live in exactly that untested code (WR-01, IN-04). The list route's slice
arithmetic and both routes' segment vocabulary are the kind of thing a single table-driven test
against `src/app/api/v1/audit/__tests__/route.test.ts`'s pattern would have caught before review.

---

_Reviewed: 2026-08-16T23:20:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
