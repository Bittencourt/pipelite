---
phase: 35-notes-record-timeline
reviewed: 2026-08-15T21:40:00Z
re_reviewed: 2026-08-15T22:50:00Z
iteration: 2
depth: standard
files_reviewed: 38
files_reviewed_list:
  - src/lib/timeline/types.ts
  - src/lib/timeline/cursor.ts
  - src/lib/timeline/assemble.ts
  - src/lib/timeline/sources.ts
  - src/lib/timeline/assemble.test.ts
  - src/lib/timeline/cursor.test.ts
  - src/lib/mutations/notes.ts
  - src/lib/mutations/notes.test.ts
  - src/lib/notes/authorize.ts
  - src/lib/notes/errors.ts
  - src/lib/api/notes-collection.ts
  - src/lib/api/__tests__/notes-collection.test.ts
  - src/lib/events/subscribers/stage-history.ts
  - src/app/notes/actions.ts
  - src/app/notes/actions.test.ts
  - src/lib/api/serializers/note.ts
  - src/app/api/v1/notes/[noteId]/route.ts
  - src/app/api/v1/notes/__tests__/route.test.ts
  - src/app/api/v1/deals/[id]/notes/route.ts
  - src/app/api/v1/organizations/[id]/notes/route.ts
  - src/app/api/v1/people/[id]/notes/route.ts
  - src/app/api/v1/activities/[id]/notes/route.ts
  - src/db/schema/notes.ts
  - src/db/schema/deal-stage-history.ts
  - src/db/schema/_relations.ts
  - src/db/schema/index.ts
  - instrumentation.ts
  - src/components/timeline/record-timeline.tsx
  - src/components/timeline/timeline-list.tsx
  - src/components/timeline/timeline-entry.tsx
  - src/components/timeline/note-entry.tsx
  - src/components/timeline/note-composer.tsx
  - src/components/timeline/delete-note-dialog.tsx
  - src/components/timeline/activity-entry.tsx
  - src/components/timeline/stage-change-entry.tsx
  - src/components/timeline/empty-timeline.tsx
  - src/app/deals/deal-dialog.tsx
  - src/app/organizations/organization-dialog.tsx
  - src/app/people/person-dialog.tsx
  - src/app/activities/activity-dialog.tsx
  - src/app/deals/kanban-board.tsx
  - src/app/deals/deal-card.tsx
  - src/app/organizations/data-table.tsx
  - src/app/people/data-table.tsx
  - src/app/activities/activities-client.tsx
  - src/app/deals/[id]/page.tsx
  - src/app/organizations/[id]/page.tsx
  - src/app/people/[id]/page.tsx
  - src/app/activities/[id]/page.tsx
  - drizzle/0013_parched_redwing.sql
  - scripts/reconcile-notes.sql
  - src/messages/en-US.json
  - src/messages/es-ES.json
  - src/messages/pt-BR.json
  - src/messages/locale-parity.test.ts
findings:
  critical: 3
  warning: 11
  info: 7
  total: 21
findings_open:
  critical: 1
  warning: 2
  info: 5
  total: 8
resolved: 13
status: issues_found
---

# Phase 35: Code Review Report

**Reviewed:** 2026-08-15T21:40:00Z (iteration 1) · re-reviewed 2026-08-15T22:50:00Z (iteration 2)
**Depth:** standard
**Files Reviewed:** 38 source files (+ 3 locale files, 2 SQL artifacts)
**Status:** issues_found — 1 Critical and 2 Warnings remain open

---

# Re-Review — iteration 2 (fix verification)

Nine fix commits (`fe21ddc`..`1f6789f`, range `6cd06a8..HEAD`) were verified against the
iteration-1 findings below. Ten of the eleven in-scope findings are genuinely closed and were
checked against the running database rather than accepted from the fixer's report. **CR-02 is
not.**

## Disposition

| ID | Fix commit | Verdict |
|----|-----------|---------|
| CR-01 | `fe21ddc` | **RESOLVED** — verified |
| CR-02 | `1b03c3e` | **NOT RESOLVED** — the draft is still destroyed; see CR-03 |
| WR-01 | `b6600c8` | **RESOLVED** |
| WR-02 | `50314f0` | **RESOLVED** — verified against live Postgres |
| WR-03 | `50314f0` | **RESOLVED** — no JS `Date` remains on the path |
| WR-04 | `79532f8` | **RESOLVED** |
| WR-05 | `f4414ea` | **RESOLVED** |
| WR-06 | `0b16e20` | **RESOLVED** |
| WR-07 | `79532f8` | **RESOLVED** |
| WR-08 | `1f6789f` | **RESOLVED** — authorization and `ENTITY_TYPE` control intact; see WR-10 |
| WR-09 | `42f3126` | **RESOLVED** with a caveat — see WR-10 |
| IN-01 | `fe21ddc` | **RESOLVED** — the fallback is now reachable |
| IN-05 | `0b16e20` | **RESOLVED** — actions return codes |
| IN-04 | — | Accepted decision (35-CONTEXT deferred). Not re-reported. |
| IN-02, IN-03, IN-06, IN-07 | — | Still open, acknowledged out of scope by the fixer |

## Gates re-run independently

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | exit 0 |
| `npx eslint` on every changed file | 0 problems |
| `npx vitest run` on the phase suites | 180 passed, 0 failed |
| `npx next build` | 0 errors; all five notes routes present in `routes-manifest.json` and `app-paths-manifest.json`; the turbopack chunk for `/api/v1/deals/[id]/notes` carries the `"GET",0,v,"POST",0,g` export table, so `export const { GET, POST }` survives the bundler |
| `scripts/reconcile-notes.sql` | all 4 deltas 0, all 4 mismatch counts 0 |
| DB baseline after all probes | 75,235 notes / 75,235 `source='migration'` / 0 soft-deleted / `deal_stage_history` 0 rows — unchanged |

All live probes ran inside `BEGIN … ROLLBACK`; nothing was written.

## Verification of the two self-reported claims

**1. The `::text::timestamp` bind (WR-02) — the fixer's claim holds, and it is load-bearing.**
Reproduced inside a rolled-back transaction in `pipelite-app-1` against the live database:

```
SELECT $1::text            -> 2026-08-15T21:33:08.478005Z   (intact)
SELECT $1::timestamp::text -> 2026-08-15 21:33:08.478       (driver truncated it)
SELECT $1::text::timestamp -> 2026-08-15 21:33:08.478005    (intact)
```

The mechanism is confirmed in the driver source: postgres.js sends `Parse` with an
unspecified parameter type, reads the server's `ParameterDescription`, and then serializes
the `Bind` value through `options.serializers[type]` (`node_modules/postgres/src/connection.js:948-966`).
For a parameter the server resolved to OID 1114, that serializer is
`types.date.serialize = x => (x instanceof Date ? x : new Date(x)).toISOString()`
(`node_modules/postgres/src/types.js:29-32`) — the driver rebuilds a millisecond `Date` from
the correct string. `::text` pins the parameter to OID 25 (`serialize: x => '' + x`) and moves
the cast server-side.

End-to-end proof of the paging consequence, 25 notes one microsecond apart inside one
millisecond, written and rolled back:

```
::text::timestamp   reachable 25/25
::timestamp (old)   reachable  5/25
```

And the tuple predicate in isolation:

```
older row inside same ms returned with bare ::timestamp    -> false
older row inside same ms returned with ::text::timestamp   -> true
```

The test does pin it rather than merely asserting a string shape:
`assemble.test.ts` asserts `countOf(lower, "::text::timestamp") === 3` **and**
`countOf(lower, "::timestamp") === countOf(lower, "::text::timestamp")`, which is only
satisfiable if no branch binds a bare `::timestamp`. `cursor.test.ts` asserts a six-digit
fractional instant survives encode → decode byte for byte and is `not.toBe` its
millisecond-truncated form — a `new Date()` reintroduced anywhere on that path fails there.
`to_char(..., '…HH24:MI:SS.US"Z"')` was confirmed against Postgres to emit fixed-width,
zero-padded six-digit fractions (`…08.000000Z`, `…05.600000Z`), so the lexicographic-sort
claim holds.

The 117-entry live deal timeline pages to 117 distinct entries with 0 duplicates under the new
bind. (It also does under the old one — the migrated corpus is millisecond-exact, which is why
this never surfaced.)

**2. CR-02's second layer — the mechanism is real but it never runs. See CR-03.**

**3. CR-01 is genuinely closed.** `notesSource.hydrate` (`sources.ts:205`) and
`activitiesSource.hydrate` (`sources.ts:277`) both carry `isNull(...deletedAt)`;
`stageChangeSource.hydrate` correctly does not (no such column). The `assemble.ts:148-153`
comment now says the opposite of what it used to and matches the code: it states the filter is
*not* the control and that removing the hydrate-side predicate re-opens the hole. Every notes
read path in the phase was enumerated (`grep 'from(notes)|db.query.notes'`) —
`sources.ts:199`, `notes-collection.ts:99,106`, `mutations/notes.ts:95` — and all four carry
the predicate. `activitiesSource.hydrate` is the only phase-owned activities read and it carries
it too. Two regression tests assert the rendered predicate on both hydration `where`s.

**4. WR-08 did not weaken anything.** `noteCollectionHandlers` is a byte-for-byte port of the
old body: same `withApiAuth` wrapper on both verbs, same parent-existence lookup with
`isNull(parentTable.deletedAt)`, same `isNull(notes.deletedAt)`, same `"Record not found"` →
404 remap, same `authorId: context.userId` (never the body's). Each route file still owns a
literal `entityType` passed as an argument; the factory has no access to the request URL and
cannot derive it. The new table-driven suite drives the four **real** route modules and asserts
per entity type that the notes read is scoped to that route's own literal, that a
missing/soft-deleted parent 404s before any note is read, and that a body-supplied `authorId`
is ignored — plus a structural gate that no route file may regrow `isNull(notes.deletedAt)`,
`createNoteMutation` or `withApiAuth`.

---

## Critical Issues (iteration 2)

### CR-03: CR-02 is not fixed — every call site's `onSuccess` closes the dialog, so the typed note is still destroyed

**Files:** `src/app/deals/deal-dialog.tsx:241-250`, `src/app/organizations/organization-dialog.tsx:157-164`,
`src/app/people/person-dialog.tsx:241-248`, `src/app/activities/activity-dialog.tsx:73-80`
**Call sites that defeat it:** `src/app/deals/kanban-board.tsx:265-268`,
`src/app/organizations/data-table.tsx:84-88`, `src/app/people/data-table.tsx:84-88`,
`src/app/activities/activities-client.tsx:75-81`

**Issue:** The fix's whole premise is "the dialog stays open, so the draft survives". It does
not stay open. The failure path is:

```ts
setCreatedPendingNoteId(recordId)
toast.error(tNotes("error.recordCreatedNoteFailed"))
onSuccess()        // <- this closes the dialog
return             // <- handleClose() is skipped, but it no longer matters
```

`onSuccess` is not a refresh callback. Every create-capable call site closes the dialog inside
it:

```ts
// kanban-board.tsx:265
const handleCreateDialogSuccess = () => { setCreateDialogOpen(false); router.refresh() }
// organizations/data-table.tsx:84  (and people/data-table.tsx:84, verbatim)
const handleSuccess = () => { setDialogOpen(false); setEditingOrg(null); refresh?.() }
// activities/activities-client.tsx:75
const handleSuccess = () => { setDialogOpen(false); setEditingActivity(null); startTransition(...) }
```

So `open` goes false. The form is not reset at that moment, but the user cannot see or reach
it, and the reset-on-open effect (`deal-dialog.tsx:147-181` and its three twins) fires the next
time the dialog opens and calls `reset({ …, notes: "" })`. The draft — the arbitrarily long
paste this finding exists to protect — is gone, exactly as before the fix. The only behavioural
change is that the false `notes.error.saveFailed` toast was replaced by an equally false
`notes.error.recordCreatedNoteFailed` toast: *"The record was saved, but your note wasn't. **The
text is still in the box** — try again."* It is not in the box.

Two consequences beyond the unchanged user-visible defect:

1. **`createdPendingNoteId` is dead state.** The same reset effect calls
   `setCreatedPendingNoteId(null)` on every open, and the only way back into `onSubmit` is
   through an open dialog. The remembered id is therefore never read, and the entire
   "retry `update`s instead of creating a second record" layer — the part the fix report
   singles out as going beyond the review — is unreachable code. (It is at least not
   *dangerous* code: because the reset runs on open, there is no path where a create silently
   becomes an update of an unrelated record. That question is moot only because the mechanism
   never fires.)
2. The `35-REVIEW-FIX.md` note asking for a browser pass was the right instinct; a browser pass
   would have caught this in one click. Nothing in the 1069-test suite covers a dialog's
   note-failure path, so the gates could not.

**Fix:** stop conflating "the record landed" with "we are done". Give the dialogs a way to say
*refresh but stay open*:

```ts
// deal-dialog.tsx (and the three others) — prop type
onSuccess: (options?: { keepOpen?: boolean }) => void

// the note-failure branch
setCreatedPendingNoteId(recordId)
toast.error(tNotes("error.recordCreatedNoteFailed"))
onSuccess({ keepOpen: true })   // refresh the list behind the dialog, do NOT close it
return

// kanban-board.tsx
const handleCreateDialogSuccess = (options?: { keepOpen?: boolean }) => {
  if (!options?.keepOpen) setCreateDialogOpen(false)
  router.refresh()
}
// organizations/data-table.tsx, people/data-table.tsx, activities/activities-client.tsx:
// same guard around setDialogOpen(false) / setEditingX(null)
```

Then verify in the browser (Docker, `http://localhost:3001`): create a record with a note,
force `addNote` to fail, confirm the dialog is still open with the text intact, submit again,
and confirm exactly one record exists carrying exactly one note. Only after that does
`createdPendingNoteId` start earning its keep.

Alternatively, if keeping the dialog open is judged too invasive, the honest minimum is to
change the copy in all three locales so it stops promising something that does not happen — but
that abandons the user's text, which is what T-35-31 exists to forbid.

## Warnings (iteration 2)

### WR-10: `reconcile-notes.sql` part 2 can now pass vacuously, and reports no evidence that it compared anything

**File:** `scripts/reconcile-notes.sql:113-135`
**Issue:** The WR-09 fix is correct in substance — part 2 now joins only
`n.updated_at = n.created_at AND n.deleted_at IS NULL`, migration 0013 does write the two equal
(`drizzle/0013_parched_redwing.sql:52-53`), and I confirmed against the live database that the
comparison population is still 46,198 activity rows + 29,037 organization rows, i.e. not
vacuous today.

The problem is the shape of the output. Part 2 emits only
`count(*) FILTER (WHERE n.content IS DISTINCT FROM …) AS mismatched`, and the file instructs
that "Every row must show mismatched = 0". Zero joined rows also produces `mismatched = 0`.
Before the fix that was a remote hazard; the fix deliberately adds two predicates whose whole
purpose is to *shrink* the population over time, so the detector will read as a pass with an
ever-smaller and eventually empty sample and give no signal that it stopped proving anything.
That is a regression detector that degrades silently, which is the failure mode the file's own
header rails against.

**Fix:** make the population visible so a shrinking or empty comparison is legible:

```sql
SELECT 'organization' AS entity_type,
       count(*)                                                    AS compared,
       count(*) FILTER (WHERE n.content IS DISTINCT FROM o.notes)  AS mismatched
  FROM organizations o
  JOIN notes n ON n.entity_type = 'organization' AND n.entity_id = o.id
              AND n.source = 'migration'
              AND n.updated_at = n.created_at AND n.deleted_at IS NULL
```

Apply to all four branches, and change the instruction in the header from "every row must show
mismatched = 0" to "every row must show mismatched = 0 **and** a non-zero `compared` that is
explainable by the number of migrated notes since edited or deleted". Record the baseline
(`organization 29,037`, `activity 46,198`, `deal 0`, `person 0`) in the MEASURED BASELINE block.

---

### WR-11: A zod-valid cursor can still make Postgres throw, so T-35-20's "never a 500" is overstated

**File:** `src/lib/timeline/cursor.ts:39-49`, `src/lib/timeline/sources.ts:109-111`
**Pre-existing — not introduced by `50314f0`.** The iteration-1 review missed it, and the same
hole existed with the old `Date`-based bind. It is filed now because the WR-02 fix rewrote the
comments that assert the guarantee, so it is currently documented as safe.

**Issue:** `cursorPayloadSchema.t` is `z.iso.datetime()`, which accepts any syntactically valid
four-digit year — including year zero. Verified:

```
zod:        '0000-01-01T00:00:00Z'          -> accepted
postgres:   '0000-01-01T00:00:00Z'::text::timestamp
            ERROR: date/time field value out of range
```

So `decodeCursor` returns a cursor, `bindInstant` binds it, and the statement raises. The module
header at `cursor.ts:24-26` says *"a hostile cursor degrades to the first page, never to a
500"*; that is true of `decodeCursor` in isolation but not of the pipeline it introduces.

Impact today is bounded: the only caller that ever passes a cursor is `loadMoreTimeline`, whose
`try/catch` turns it into `{ success: false, error: "failed" }` and a
`notes.error.loadMoreFailed` toast, plus a logged stack per crafted request. It is not a 500 —
but it is an attacker-steerable database error on a documented-as-hardened path, and the v1
surface or Phase 36 adopting the cursor would make it one.

**Fix:** bound the year in the schema, where the rest of the cursor validation already lives:

```ts
t: z.iso
  .datetime()
  // Postgres rejects year 0 outright; nothing this application writes predates 1970.
  // Range-gate here so a hostile-but-well-formed cursor still degrades to page 1 (T-35-20).
  .refine((value) => value >= "1970-01-01T00:00:00.000000Z" && value < "9999-12-31T23:59:59.999999Z"),
```

Lexicographic comparison is sound here for the same reason the cursor sorts that way at all:
the format is fixed-width. Add a `decodeCursor` case asserting `'0000-01-01T00:00:00Z'` returns
`null`.

---

_Re-reviewed: 2026-08-15T22:50:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard · iteration 2_

---

# Iteration 1 findings (verbatim, with dispositions above)


## Summary

The threat model is largely implemented, and I verified it rather than taking the comments at
their word:

- **T-35-01 (SQL injection):** clean. `sources.ts` is the only hand-composed SQL. Every value —
  `entityType`, `entityId`, both cursor components, and the limit — is a drizzle `${}` bind.
  Nothing is concatenated. `assertEntityType` runs a zod enum before any fragment is composed,
  and the four nested v1 routes each own a `const ENTITY_TYPE` literal that is never taken
  from the request. I ran the generated single-branch shape against the live Postgres to confirm
  it parses.
- **T-35-02 (cursor injection):** clean. `decodeCursor` is length-capped, alphabet-gated, JSON-
  parsed inside a `try`, zod-validated, and never throws; the decoded values arrive bound.
- **T-35-03 (IDOR):** clean. Both the server action and the v1 route call the shared
  `isAuthorOrAdmin`; neither re-implements it. The v1 surface correctly re-reads the role from
  storage via `resolveActorRole` and fails closed. The session surface's `session.user.role` is
  re-hydrated from the DB on every request (`src/auth.ts:112-134`), including a `deletedAt` and
  `status !== 'approved'` gate, so trusting it is sound.
- **T-35-04 (cross-record injection):** clean. `parentExists` is on the write path and filters
  `deletedAt IS NULL`.
- **T-35-05 (stored XSS):** clean. Zero `dangerouslySetInnerHTML` / `innerHTML` / `eval` in any
  phase-35 file.
- **T-35-06 (soft-deleted disclosure):** **NOT fully implemented.** Two hydration reads in
  `sources.ts` carry no `deleted_at` predicate, and `assemble.ts` carries a comment asserting a
  behaviour that does not exist. See CR-01.

`tsc --noEmit` is clean, `eslint` on the phase files is clean, and the 149 phase tests pass. That
is not evidence of correctness: no test covers the hydration soft-delete gap, and the suite mocks
`@/db` so it cannot see either of the two timestamp-precision defects below.

The two Critical findings are a missing soft-delete predicate on a read path that the phase's own
threat model designated as a control, and silent destruction of user-typed note text in all four
create dialogs.

## Critical Issues

### CR-01: Hydration reads omit `deleted_at IS NULL`, and the code asserts the opposite

> **[Iteration 2 — RESOLVED in `fe21ddc`.]** Both hydration reads carry `isNull(deletedAt)`; the `assemble.ts` comment now matches the code; every notes read path in the phase was re-enumerated and all carry the predicate.

**File:** `src/lib/timeline/sources.ts:122-138`, `src/lib/timeline/sources.ts:194-208`
**Also:** `src/lib/timeline/assemble.ts:145-149`

**Issue:** T-35-06 states that every read path must carry `deleted_at IS NULL` explicitly because
`notes_live_idx` is partial and does not enforce its own predicate. `notesSource.hydrate` and
`activitiesSource.hydrate` are read paths and carry no such predicate — they filter on
`inArray(notes.id, ids)` / `inArray(activities.id, ids)` and nothing else.

Three consequences, in ascending order of durability:

1. **A live disclosure race.** `assembleTimeline` runs the union (filtered) and the hydration read
   (unfiltered) as two separate statements. A note soft-deleted between them is returned by
   `hydrate` and rendered to the client. The comment at `assemble.ts:147-149` explicitly claims
   this case is handled — *"A row soft-deleted between the union and the hydration read is dropped
   rather than rendered as a hole"* — but the `.filter(entry => entry !== undefined)` on line 149
   only drops rows `hydrate` failed to return, and `hydrate` always returns them. The stated
   mitigation is inverted from the actual behaviour, so a future reader will trust a control that
   is not there.
2. **`public/openapi.yaml:1011` documents the invariant to external consumers** ("soft-deleted
   notes are never returned by any endpoint"). The v1 routes do carry the predicate, so the
   document is currently true of the API — but it is not true of the module the API shares.
3. **`notesSource.hydrate` is an exported member of `TIMELINE_SOURCES`** and is already called
   directly from outside the assembler (`src/app/notes/actions.ts:90`). It is an unscoped
   read-notes-by-id with no soft-delete filter and no entity scoping. Phase 36 adds a fourth source
   against this same interface; the next caller inherits the hole.

No test covers this — `assemble.test.ts` has no assertion about soft-deleted rows in hydration, and
the suite mocks `@/db` entirely.

**Fix:**
```ts
// sources.ts — notesSource.hydrate
import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm"

const rows = await db
  .select({ /* ...unchanged... */ })
  .from(notes)
  .leftJoin(users, eq(notes.authorId, users.id))
  // notes_live_idx encodes this predicate but does not enforce it (T-35-06).
  .where(and(inArray(notes.id, ids), isNull(notes.deletedAt)))

// sources.ts — activitiesSource.hydrate
  .where(and(inArray(activities.id, ids), isNull(activities.deletedAt)))
```
Add a test that stubs the union to return an id whose hydration row is soft-deleted and asserts the
entry is absent from `entries`. Once the predicate is in place the `assemble.ts:147-149` comment
becomes true and the `toTimelineEntry` fallback (see IN-01) becomes reachable rather than dead.

---

### CR-02: All four create dialogs destroy the user's typed note on a failed `addNote`, then claim they did not

> **[Iteration 2 — NOT RESOLVED. `1b03c3e` does not close this.]** The dialog still closes, because the failure path calls `onSuccess()` and every call site closes the dialog inside it. See **CR-03** above.

**File:** `src/app/deals/deal-dialog.tsx:200-216`, `src/app/organizations/organization-dialog.tsx:113-128`,
`src/app/people/person-dialog.tsx:135-152`, `src/app/activities/activity-dialog.tsx:190-206`

**Issue:** The create path calls `addNote` after the record is created. On failure it fires
`toast.error(tNotes("error.saveFailed"))` — whose copy is *"Your note wasn't saved. **The text is
still in the box** — check your connection and try again."* — and then falls straight through to:

```ts
toast.success(isEditMode ? "Deal created!" : ...)
onSuccess()
handleClose()   // closes the dialog and resets the form
```

So the user sees a success toast stacked on top of an error toast, the dialog closes, and the text
is **not** still in the box — it is gone, with no way to recover it. For a record created from an
imported paste this can be an arbitrary amount of content.

This directly violates the invariant the phase declared for itself in
`src/components/timeline/note-composer.tsx:6-11` ("THE TYPED TEXT IS SACRED (T-35-31) — A failed
save must never cost the user what they wrote"). The composer honours it; the four create dialogs
do not, and they reuse the composer's copy string while breaking its promise.

**Fix:** either keep the dialog open on a note failure, or use copy that matches what actually
happens. Minimum viable fix, applied identically to all four dialogs:

```ts
const draft = (data.notes ?? "").trim()
if (draft) {
  let noteSaved = false
  try {
    const noteResult = await addNote("deal", result.id, draft)
    noteSaved = noteResult.success
  } catch {
    noteSaved = false
  }

  if (!noteSaved) {
    // The record exists; the note does not. Keep the dialog open so the text survives
    // and the user can retry, and do NOT claim success.
    toast.error(tNotes("error.saveFailed"))
    onSuccess()          // the record itself did land — refresh the list behind the dialog
    return               // ...but do not handleClose(): the draft is the thing being protected
  }
}
```
Add a `notes.error.recordCreatedNoteFailed` string (in all three locales) if the retained-dialog
state needs different wording from the timeline composer's.

## Warnings

### WR-01: A timeline/DB failure takes down the entire record detail page

> **[Iteration 2 — RESOLVED in `b6600c8`.]** Both reads are wrapped; a throw renders a degraded card with `notes.error.timelineUnavailable` and logs server-side.

**File:** `src/components/timeline/record-timeline.tsx:50-53`
**Issue:** `assembleTimeline` and `countTimeline` are awaited with no `try/catch`. Any throw —
a connection blip, a statement timeout, or `assertEntityType`'s `throw new Error(...)` at
`assemble.ts:38` — propagates out of the RSC render and errors the whole detail page. There is no
`error.tsx` or `global-error.tsx` anywhere in `src/app/`, so the user gets Next.js's default
full-page error rather than a degraded record page.

This contradicts the file's own stated reasoning eight lines above (`record-timeline.tsx:39-41`):
*"It is written as a guard and not as a non-null assertion because an assertion that turned out to
be wrong would throw inside the RSC render and take the entire record page down over one optional
section."* The session check is guarded; the four-to-five database queries next to it are not.
Before this phase the notes block was a column already present in the page's own query and could
not fail independently.

**Fix:**
```ts
let page: TimelinePage = { entries: [], hasMore: false, nextCursor: null, total: 0 }
let total = 0
try {
  ;[page, total] = await Promise.all([
    assembleTimeline({ entityType, entityId, limit: TIMELINE_PAGE_SIZE }),
    countTimeline(entityType, entityId),
  ])
} catch (error) {
  // One optional section must not take the record page down.
  console.error("RecordTimeline read failed:", error)
  return null   // or render the card with an inline "history unavailable" body
}
```

---

### WR-02: The keyset cursor truncates to milliseconds while the columns store microseconds — unfetched entries are silently skipped

> **[Iteration 2 — RESOLVED in `50314f0`.]** Verified against live Postgres: 25/25 reachable with the new bind, 5/25 with the old one.

**File:** `src/lib/timeline/sources.ts:63-65` (`bindInstant`), used at lines 98, 170, 235
**Issue:** `notes.createdAt`, `activities.createdAt` and `dealStageHistory.createdAt` are all
`.defaultNow()`, i.e. Postgres `now()`. I confirmed against the live database that `now()` returns
microsecond precision (`2026-08-15 21:33:08.478940`, sub-millisecond remainder 940). The value is
read into a JS `Date`, which is millisecond-only, so `bindInstant` emits `...T21:33:08.478Z` — the
`.000940` is gone.

The predicate is `(created_at, id) < (<truncated>, <id>)`. Because the truncated bound is strictly
*less* than the cursor row's real instant, the tuple comparison never reaches the `id` tiebreaker:
every row whose `created_at` falls in `[.478000, .478940)` on that record's timeline is excluded,
including entries that were never returned on any page. They are unreachable for the rest of the
record's life — `hasMore` may even be `true` while "Load more" adds nothing.

The module comment at `sources.ts:94-96` and the v1 route comment at
`api/v1/deals/[id]/notes/route.ts:60-61` both assert that "`id` breaks ties when two entries share
a millisecond". That holds only when the two timestamps are *bit-identical*; it does not hold when
they differ inside the same millisecond, which is the common case for `now()`. The migrated corpus
happens to be millisecond-exact (46,198 activity notes and 29,037 organization notes all at
`10:27:39.793`), which is why nothing has surfaced yet — every row written from here on carries
microseconds.

The unit suite cannot see this: it mocks `@/db` and asserts the rendered SQL string.

**Fix (preferred — keep full precision on the wire):** have each branch emit the instant as text and
compare as text, so no JS `Date` is in the loop at all:

```ts
// branch: emit a full-precision, sortable text instant alongside the row
SELECT 'note' AS kind, n.id,
       n.created_at AS occurred_at,
       to_char(n.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') AS occurred_at_key
...
// keyset: compare against the same text form
AND (to_char(n.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US'), n.id) < (${cursor.key}, ${cursor.id})
```
and carry `occurred_at_key` (not the JS `Date`) through `encodeCursor` / `decodeCursor`.

**Fix (cheaper — make the columns match the cursor's precision):** declare the three columns as
`timestamp('created_at', { precision: 3 })` and add a migration to `ALTER COLUMN ... TYPE
timestamp(3)`. Postgres then rounds to milliseconds on write and the truncation disappears. Note
this rounds rather than truncates, so it must land before more microsecond rows accumulate.

---

### WR-03: `bindInstant`'s documented round-trip guarantee is silently dependent on `process.env.TZ`

> **[Iteration 2 — RESOLVED in `50314f0`.]** No JS `Date` remains anywhere on the cursor round trip, so the `TZ` dependency is gone rather than pinned.

**File:** `src/lib/timeline/sources.ts:59-65`
**Issue:** The comment claims *"`toISOString()` renders the same wall clock the driver read, with a
`Z` that `::timestamp` discards, so the value round-trips exactly."* That is only true when the Node
process runs in UTC. postgres.js parses OID 1114 (`timestamp` without time zone) with
`parse: x => new Date(x)` (`node_modules/postgres/src/types.js:29-32`), and `new Date("2026-08-15
12:00:00.123456")` is parsed by V8 as **local** time. I demonstrated the skew in the actual app
image:

```
$ docker exec -e TZ=America/Sao_Paulo pipelite-app-1 node -e '...'
driver Date  -> Sat Aug 15 2026 12:00:00 GMT-0300
bindInstant  -> 2026-08-15T15:00:00.123Z  ::timestamp => 2026-08-15 15:00:00.123
original wall clock: 2026-08-15 12:00:00.123456
```

A three-hour skew on the keyset bound means "Load more" either re-fetches already-shown entries
(negative offsets, e.g. Brazil) or **permanently skips** every entry in the offset-sized window
before the cursor (positive offsets, e.g. Europe). On an audit surface, silently omitting history
is the worst available failure.

In fairness this is not a fresh divergence: `bindInstant` is byte-identical in behaviour to drizzle's
own `PgTimestamp.mapToDriverValue` (`node_modules/drizzle-orm/pg-core/columns/timestamp.cjs:61-63`),
so the whole repo shares the assumption. The container is currently UTC (`TZ` unset,
`Intl...timeZone === 'UTC'`), so nothing is broken today. What is missing is any defence: the comment
asserts an unconditional guarantee, nothing pins `TZ`, and no test would catch a regression. This is
a Brazilian deployment; `TZ=America/Sao_Paulo` is a plausible one-line ops change away.

**Fix:** pin the assumption explicitly rather than relying on it. Either set `TZ=UTC` in
`docker-compose.yml` and the `Dockerfile` and assert it at boot in `instrumentation.ts`:

```ts
if (process.env.TZ && process.env.TZ !== "UTC") {
  throw new Error(
    `TZ must be UTC: timestamp columns are read as local time by postgres.js and the ` +
    `timeline keyset cursor round-trips through toISOString(). Got TZ=${process.env.TZ}.`
  )
}
```
…or adopt the text-cursor fix from WR-02, which removes the JS `Date` from the comparison entirely
and makes the whole class of problem go away.

---

### WR-04: `updateNoteMutation` can return `{ success: true, note: undefined }`, violating its own signature

> **[Iteration 2 — RESOLVED in `79532f8`.]** The UPDATE is guarded on `deleted_at` and an empty `returning()` maps to `"Note not found"`. `createNoteMutation` is guarded too. `noUncheckedIndexedAccess` was deliberately not enabled — accepted as out of scope.

**File:** `src/lib/mutations/notes.ts:172-179`
**Issue:** `const [note] = await db.update(...).returning()` yields `undefined` when the row was
soft-deleted or its id changed between `findNoteById` (line 167) and the UPDATE — the UPDATE carries
no `isNull(notes.deletedAt)` guard and matches on id only. `tsconfig.json` sets `strict: true` but
not `noUncheckedIndexedAccess`, so `note` is typed `Note` and the compiler cannot see it. The
declared return type is `{ success: true; note: Note }`, so both callers trust it:

- `api/v1/notes/[noteId]/route.ts:99` → `serializeNote(undefined)` throws on `note.id` → 500 with a
  logged stack, where a 404 is the correct answer.
- `app/notes/actions.ts:180` → `toTimelineEntry(undefined)` throws on `row.id` → generic
  "Failed to edit note".

The same shape exists in `createNoteMutation:145` (`note.id` on a possibly-empty `returning()`),
though an INSERT realistically always returns a row.

**Fix:**
```ts
const [note] = await db
  .update(notes)
  .set({ content: validated.data.content, updatedAt: new Date() })
  // Never resurrect-edit a row deleted since findNoteById (T-35-06).
  .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)))
  .returning()

if (!note) {
  // Lost the race with a concurrent soft delete — same answer as a missing note.
  return { success: false, error: "Note not found" }
}

return { success: true, note }
```
Consider enabling `noUncheckedIndexedAccess` so the next instance of this is a compile error.

---

### WR-05: The v1 note routes answer a lost race with 500 instead of 404

> **[Iteration 2 — RESOLVED in `f4414ea`.]** Both handlers map `"Note not found"` to `Problems.notFound("Note")` before the generic 500 and no longer log the race.

**File:** `src/app/api/v1/notes/[noteId]/route.ts:94-97` and `:126-129`
**Issue:** After `authorizeNoteMutation` passes, the mutation can still return
`{ success: false, error: "Note not found" }` if the note is soft-deleted concurrently. Both
handlers funnel every `success: false` into `Problems.internalError()` (HTTP 500) and log it as a
route failure. A 500 tells an API client to retry a request that will never succeed, and it pollutes
the error log with a normal concurrent-delete outcome. The sibling collection route already gets
this right (`api/v1/deals/[id]/notes/route.ts:127-129` maps `"Record not found"` to
`Problems.notFound`).

**Fix:**
```ts
if (!result.success) {
  if (result.error === "Note not found") {
    return Problems.notFound("Note")
  }
  console.error("PATCH /api/v1/notes/[noteId] failed:", result.error)
  return Problems.internalError()
}
```
Apply the identical block in `DELETE`.

---

### WR-06: The "only the author or an admin" message is translated, parity-gated, and never shown

> **[Iteration 2 — RESOLVED in `0b16e20`.]** Actions return stable codes from `src/lib/notes/errors.ts`; both UI call sites branch on `not_authorized` and render `error.notPermitted`. No other consumer reads `result.error`.

**File:** `src/messages/en-US.json:278` (+ `es-ES.json:278`, `pt-BR.json:278`),
`src/messages/locale-parity.test.ts:41`
**Issue:** `notes.error.notPermitted` exists in all three locales and the parity test asserts its
presence, but `grep -rn notPermitted src/` finds no component that renders it. The server actions
return the untranslated literal `"Not authorized"` (`app/notes/actions.ts:58`), and both UI call
sites discard `result.error` and show the generic `error.editFailed` / `error.deleteFailed` toast —
*"Your changes weren't saved. Try again."*

So a user who is not the author (e.g. a note authored by a colleague that a stale client still
paints Edit buttons on, or an admin who was demoted mid-session) is told to retry an operation that
will never succeed, forever. The parity test makes the dead string look load-bearing, which is worse
than having no string at all.

**Fix:** surface the distinction. Return a machine-readable code from the actions and map it in the
UI:

```ts
// actions.ts
const NOT_AUTHORIZED = "not_authorized"   // a code, not prose

// note-entry.tsx handleSave / delete-note-dialog.tsx handleDelete
toast.error(
  result.error === "not_authorized" ? t("error.notPermitted") : t("error.editFailed")
)
```

---

### WR-07: Soft delete and edit both UPDATE without a `deleted_at` guard

> **[Iteration 2 — RESOLVED in `79532f8`.]** The soft delete is guarded and idempotent; losing the race still reports success.

**File:** `src/lib/mutations/notes.ts:198-205` and `:172-178`
**Issue:** `softDeleteNoteMutation` matches on `eq(notes.id, noteId)` alone. Two concurrent deletes
(the API surface and the browser, or a double-click through two tabs) both pass their
`findNoteById` check and both write, so the second overwrites the first `deletedAt` with a later
timestamp. The comment at `notes.ts:187-189` grounds the soft-delete design in the migration
reconciliation and the `notes_migration_uniq` invariant staying true forever; a mutable deletion
timestamp undermines the audit value that justifies keeping the row. The same missing guard on the
edit path is covered in WR-04.

**Fix:**
```ts
const result = await db
  .update(notes)
  .set({ deletedAt: now, updatedAt: now })
  // Idempotent: a second delete must not move the original deletion timestamp.
  .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)))
  .returning({ id: notes.id })

// Already deleted is success, not failure — the caller's intent is satisfied either way.
return { success: true }
```

---

### WR-08: The four nested notes routes are ~140 lines of near-identical duplication

> **[Iteration 2 — RESOLVED in `1f6789f`.]** Byte-for-byte port; `withApiAuth`, the parent lookup, the `deleted_at` predicate and the 404 remap are all intact, and each route still owns its `entityType` literal. See **WR-10** for the one caveat that came with it.

**Files:** `src/app/api/v1/{deals,organizations,people,activities}/[id]/notes/route.ts`
**Issue:** I diffed all four: they differ only in the parent table import, `ENTITY_TYPE`,
`ENTITY_LABEL`, and the two `eq(<table>.id, id)` predicates. Everything else — the `parsePagination`
call, the parent-existence lookup, the `where` with `isNull(notes.deletedAt)`, the paired
`Promise.all` read, the JSON parse, the zod mapping, the `"Record not found"` remap — is byte-
identical, four times over.

The phase was careful to gate `serializeNote` to a single definition precisely because per-route
copies drift into per-route leaks (`lib/api/serializers/note.ts:33-39`). The exact same reasoning
applies to the route bodies, which carry the `isNull(notes.deletedAt)` predicate that T-35-06 names
as the control. Any future security change — the deleted_at predicate, a per-record authorization
check, an ownership filter — must now be applied in four places, and nothing gates that it was.

**Fix:** extract the shared handler pair and let each route file be a five-line adapter:

```ts
// src/lib/api/notes-collection.ts
export function noteCollectionHandlers<T extends PgTable>(opts: {
  entityType: EntityType
  entityLabel: string
  parentTable: T
}) {
  return { GET: /* ...the shared body... */, POST: /* ... */ }
}

// src/app/api/v1/deals/[id]/notes/route.ts
export const { GET, POST } = noteCollectionHandlers({
  entityType: "deal",
  entityLabel: "Deal",
  parentTable: deals,
})
```

---

### WR-09: `reconcile-notes.sql` part 2 reports a permanent false failure once anyone edits a migrated note

> **[Iteration 2 — RESOLVED in `42f3126`, with a caveat.]** Part 2 is correctly scoped to as-migrated rows and the live numbers are unchanged; but the query still reports no evidence that it compared anything. See **WR-10**.

**File:** `scripts/reconcile-notes.sql:78-96`
**Issue:** The file describes itself as "A PERMANENT REGRESSION DETECTOR" and instructs that
"Every row must show mismatched = 0". Part 2 compares `n.content` to the legacy column with
`IS DISTINCT FROM`. But the whole point of this phase is that migrated notes are now editable in
the timeline — the moment one user fixes a typo in a migrated note, `mismatched` goes to 1 and
never returns to 0, and the detector reports a data-integrity failure that is actually correct
behaviour.

Part 1 (count reconciliation) is fine: it counts rows regardless of `deleted_at` or content, so
edits and soft deletes do not perturb it.

**Fix:** scope part 2 to rows that are still in their as-migrated state, so an intentional edit
does not read as corruption:

```sql
SELECT 'organization' AS entity_type,
       count(*) FILTER (WHERE n.content IS DISTINCT FROM o.notes) AS mismatched
  FROM organizations o
  JOIN notes n ON n.entity_type = 'organization'
              AND n.entity_id = o.id
              AND n.source = 'migration'
              -- An edited or deleted migrated note is expected to diverge (D-02);
              -- only never-touched rows prove byte-identity of the migration itself.
              AND n.updated_at = n.created_at
              AND n.deleted_at IS NULL
```
Apply to all four branches, and update the "MEASURED BASELINE" comment to note the added predicate.

## Info

### IN-01: `toTimelineEntry`'s soft-delete fallback is unreachable dead code

> **[Iteration 2 — RESOLVED by `fe21ddc`.]** The fallback in `toTimelineEntry` is now reachable.

**File:** `src/app/notes/actions.ts:96-108`
**Issue:** The fallback is documented as handling "The row was soft-deleted between the write and
the read". Because `notesSource.hydrate` has no `deleted_at` filter (CR-01), it always returns the
row and the fallback never executes. Fixing CR-01 makes this branch live; until then it is dead code
whose comment misdescribes the module's behaviour.
**Fix:** land CR-01 first, then keep this block as-is — it becomes correct.

### IN-02: The unknown-author avatar renders an empty circle

> **[Iteration 2 — STILL OPEN.]** Acknowledged out of scope by the fixer.

**File:** `src/components/timeline/note-entry.tsx:90`, `:147`
**Issue:** `initials` is `null` when `entry.author` is null, so `<AvatarFallback>{null}</AvatarFallback>`
paints a blank circle beside the "Unknown" name. Migrated notes on deployments without an owner are
exactly the case the null branch exists for.
**Fix:** `<AvatarFallback>{initials ?? "?"}</AvatarFallback>`, or hide the avatar entirely when
`entry.author === null`.

### IN-03: The client dedupes and keys by `id` alone while the assembler deliberately keys by `kind:id`

> **[Iteration 2 — STILL OPEN.]** Acknowledged out of scope by the fixer.

**File:** `src/components/timeline/timeline-list.tsx:87`, `:116-117`, `:158`; cf.
`src/lib/timeline/assemble.ts:52-55`
**Issue:** `assemble.ts` states "keying the hydration map by kind too makes a collision impossible"
and does so. `timeline-list.tsx` then dedupes with `new Set(previous.map(e => e.id))`, filters
deletions with `e.id !== noteId` across all three kinds, and uses `key={entry.id}`. Harmless with
UUIDs, but the two halves of the same feature disagree about whether an id is globally unique, and
only one of them wrote down its assumption.
**Fix:** use `` `${entry.kind}:${entry.id}` `` for the dedupe set and the React key, and scope
`handleDeleted` to `!(e.kind === "note" && e.id === noteId)`.

### IN-04: The create dialogs still cap notes at 2,000 characters

> **[Iteration 2 — ACCEPTED, not a defect.]** Recorded decision in 35-CONTEXT; deliberately not changed.

**File:** `src/app/deals/deal-dialog.tsx`, `organization-dialog.tsx`, `person-dialog.tsx`,
`activity-dialog.tsx` — all four keep `notes: z.string().max(2000, "Notes must be 2000 characters
or less")`
**Issue:** The mutation layer deliberately sets `NOTE_CONTENT_MAX = 200_000` because a 2,000-char
ceiling would make the live 131,505-character migrated note uneditable
(`lib/mutations/notes.ts:9-19`). The create dialogs, which now write real note rows, still enforce
the old legacy-column limit — a first note pasted from an existing system is rejected client-side
at 2,001 characters with copy that talks about the dead column.
**Fix:** point the dialog rule at the shared constant:
`notes: z.string().max(NOTE_CONTENT_MAX).optional()`.

### IN-05: Server-action error strings are untranslated English and are discarded by every caller

> **[Iteration 2 — RESOLVED by `0b16e20`.]** The actions no longer return English prose.

**File:** `src/app/notes/actions.ts:57-65`, `src/lib/mutations/notes.ts:124,131,148,169,182,208`
**Issue:** `"Not authenticated"`, `"Not authorized"`, `"Note not found"`, `"Record not found"`,
`"Failed to create note"` and the zod messages are returned as English prose. All three UI call
sites ignore `result.error` and render a fixed translated toast, so none of it reaches a user today
— but the shape invites a future caller to render an untranslated string in a fully-localized
surface.
**Fix:** return stable codes (`"not_authenticated"`, `"not_authorized"`, `"not_found"`) and map them
to `notes.error.*` at the UI boundary. Pairs with WR-06.

### IN-06: `buildTimelineQuery` emits syntactically invalid SQL if no source applies

> **[Iteration 2 — STILL OPEN.]** Acknowledged out of scope by the fixer.

**File:** `src/lib/timeline/assemble.ts:75-86`
**Issue:** With `branches.length === 0`, `sql.join([], sql\` UNION ALL \`)` produces an empty
fragment and the statement becomes `SELECT kind, id, occurred_at FROM () AS t ...`, which Postgres
rejects. Unreachable today because `notesSource.appliesTo` returns `true` unconditionally, but the
registry is explicitly designed for Phase 36 to extend, and a source list where every entry is
entity-scoped is one edit away.
**Fix:**
```ts
const branches = applicableSources(target.entityType).map(...)
if (branches.length === 0) {
  // No applicable source: an empty result, not a malformed statement.
  return sql`SELECT NULL::text AS kind, NULL::text AS id, NULL::timestamp AS occurred_at WHERE false`
}
```

### IN-07: Three verbatim copy-paste blocks across the timeline components

> **[Iteration 2 — STILL OPEN.]** Acknowledged out of scope by the fixer.

**File:** `src/components/timeline/note-entry.tsx:45-54` (`getInitials`, 4th copy),
`stage-change-entry.tsx:35-44` (`stageColors`, copied from `app/deals/[id]/page.tsx:80-89`),
`activity-entry.tsx:52-60` (`colorMap` + `FALLBACK_COLOR`, copied from `activity-list.tsx:99-104`)
**Issue:** Each is documented as an intentional verbatim copy, and each comment asks the next
reader to keep the copies in sync by hand. That works until it doesn't: a pipeline stage colour
added in `app/deals/[id]/page.tsx` will render as the slate fallback in the timeline with nothing to
flag it.
**Fix:** promote all three to shared modules — `src/lib/initials.ts`, `src/lib/stage-colors.ts`,
`src/lib/activity-type-styles.ts` — and import them from every current call site. Low risk, and it
removes three standing "remember to update the other one" obligations.

---

_Reviewed: 2026-08-15T21:40:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
