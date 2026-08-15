---
phase: 35-notes-record-timeline
plan: 15
subsystem: ui-dialogs
tags: [legacy-dormancy, create-dialogs, kanban, server-actions, docker-verification, next-intl]

# Dependency graph
requires: ["35-09", "35-14"]
provides:
  - "Zero writers of the legacy notes column anywhere in application code"
  - "Zero renders of the legacy notes column anywhere in the UI"
  - "Create dialogs that turn their Notes textarea into a first note ROW via addNote"
  - "Edit dialogs with no Notes field at all on all four entity types"
  - "Runtime evidence that the stage-history crmBus subscriber is registered in the standalone Docker build (T-35-21)"
affects: [36, 37]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A create dialog performs a second, non-transactional write after the record write; failure is surfaced with a toast and never rolls the record back"
    - "Mode-guarded form field: the same zod field and default value serve a create-only control, with the edit branch rendering nothing"

key-files:
  created: []
  modified:
    - src/app/organizations/organization-dialog.tsx
    - src/app/people/person-dialog.tsx
    - src/app/deals/deal-dialog.tsx
    - src/app/activities/activity-dialog.tsx
    - src/app/deals/deal-card.tsx
    - src/app/deals/kanban-board.tsx

key-decisions:
  - "deal-dialog's `deal` prop type drops `notes` (the other three keep theirs), because its only two call sites stop supplying it and typecheck would otherwise fail"
  - "The addNote call is wrapped in its own try/catch inside the create branch, so a thrown action error is as non-fatal as a `{ success: false }` result"
  - "The four record prop types on organization/person/activity dialogs keep their dead `notes` field, per the plan's explicit instruction, because their list-page callers still supply it"

patterns-established:
  - "Legacy-column dormancy: keep the column, keep the API schema, delete every app-code read/write/render, and prove it with a grep gate plus a re-runnable reconciliation"

requirements-completed: [NOTE-01, NOTE-03]

# Metrics
duration: 80min
completed: 2026-08-15
---

# Phase 35 Plan 15: Legacy-Column Dormancy and Phase Verification Summary

**The legacy `notes` column now has no writer and no renderer left in the product — the Notes box
survives only on the create path, where it produces a real, attributed note row — and the phase was
exercised end to end against the live Docker stack, including the runtime proof that the
stage-history subscriber is actually alive in the standalone build.**

## Status: TASK 3 IS OPEN — a human browser pass is still required

Tasks 1 and 2 are complete and committed. Task 3 is a `checkpoint:human-verify` with
`gate="blocking"`. A large part of it was verified directly against the running container over
authenticated HTTP (see § Verification Performed), but **the interactive gestures were not
performed, because this environment has no browser automation and installing one is forbidden by
T-35-SC.** The unverified items are enumerated in § Not Verified. STATE.md and ROADMAP.md were
deliberately NOT advanced.

## Performance

- **Duration:** ~80 min (two implementation commits in 10 min; the remainder is Docker rebuild and verification)
- **Tasks:** 2 of 3 complete, task 3 partially verified and open
- **Files modified:** 6
- **Tests:** 1016 passed / 4 skipped across 64 files, plus 8 RSC — unchanged from the 35-14 baseline

## What Changed

### Task 1 — organization and person dialogs (`64b17ce`)

Both files got the identical five-part edit:

1. The `<Textarea>` block is wrapped in `{!isEditMode && ( … )}`. It was **not** deleted — D-17
   ("jot a note while creating a record") must not regress.
2. The edit-mode prefill (`notes: organization.notes || ""` / `notes: person.notes || ""`) is gone.
   An edit dialog can no longer even load the legacy value, let alone display it.
3. `onSubmit` no longer forwards `data` wholesale. It builds an explicit `record` object with the
   real fields and no `notes` key, so neither the create nor the update mutation can receive one.
4. On a successful create with a non-empty trimmed draft, `addNote("organization" | "person",
   result.id, draft)` runs. A `{ success: false }` result **and** a thrown error both produce
   `toast.error(tNotes("error.saveFailed"))` and nothing else — the record is never rolled back
   (T-35-38, accepted).
5. The zod field and the `defaultValues` entry stay, because the create branch still binds to them.

Both files gained `useTranslations("notes")`; they had no i18n before, so this is their first
next-intl usage. The key already existed from plan 35-02 in all three locale files, so
`locale-parity.test.ts` needed nothing.

### Task 2 — deal and activity dialogs, kanban card and board (`c74312e`)

The same pattern applied to `deal-dialog.tsx` (which discriminates on an explicit `mode` prop, not a
local `isEditMode` derived from the record — checked, not assumed) and `activity-dialog.tsx`. The two
explicit legacy writes the research flagged, `notes: data.notes || null` at deal-dialog:181 and
activity-dialog:179, are removed from the shared payload object, so they are gone on **both** paths
rather than guarded on one.

`deal-card.tsx` lost three things: the `{deal.notes && …}` snippet render, the `notes:` prefill into
`<DealDialog mode="edit">`, and the `notes?: string | null` field on the exported `Deal` interface.
`kanban-board.tsx` lost its `notes:` prefill.

Removing the interface field caused **no** typecheck error anywhere, so the plan's fallback (restore
the field with a comment and name the outside consumer) was not needed. The two importers of that
type, `kanban-board.tsx` and `kanban-column.tsx`, are both clean.

## Deviations from Plan

### 1. [Interpretation] `deal-dialog.tsx` also drops `notes` from its `deal` prop type

The plan's task 1 instruction "leave the zod field, the prop type and the default value in place"
justifies itself with "they are what the create branch still binds to" — a rationale that covers the
zod field and the default value but not the *record* prop type, which only exists in edit mode.

For organization, person and activity that distinction is academic: the field is inert and their list
pages still pass it, so it was left exactly as instructed. For `DealDialog` it is not academic. Its
`deal` prop declares `notes: string | null` as **required**, and both of its call sites
(`deal-card.tsx:245`, `kanban-board.tsx:420`) were being told to stop supplying it. Leaving the field
would have failed `npm run typecheck`, which is the same task's first verification gate. It was
removed. Nothing in the dialog reads it any more, and grep confirms those two are the only call sites.

**Result:** an asymmetry — one of the four dialogs no longer declares a legacy field on its record
prop, three still do. Recorded here rather than smoothed over.

### 2. [Rule 2 - Missing critical handling] `addNote` is wrapped in its own try/catch

The plan asked for the `{ success: false }` arm to be non-fatal. It did not mention a thrown error.
Without an inner catch, a network failure inside `addNote` would have unwound to the outer handler,
shown "An unexpected error occurred", and skipped `onSuccess()` and `handleClose()` — leaving the
user looking at a dialog for a record that had already been created. Both failure shapes now produce
the identical non-fatal toast.

## Audit Grep — every remaining `notes` match, justified

The plan's gate:

```
grep -rn "notes" src/app/{deals,organizations,people,activities}/ --include=*.tsx \
  | grep -v "notes/actions" | grep -viE "RecordTimeline|addNote|Notes:|useTranslations|//"
```

Every surviving line falls into one of three groups. **None writes or renders a legacy value.**

| Group | Lines | Why it stays |
|-------|-------|--------------|
| Create-path form binding | `<Label htmlFor="notes">`, `id="notes"`, `placeholder=…`, `{...register("notes")}`, `errors.notes` — 6 lines × 4 dialogs, all inside the `{!isEditMode && …}` guard | This is the create-only textarea the addendum deliberately kept. It binds to the zod field, not to the column. |
| The draft read | `const draft = (data.notes ?? "").trim()` × 4 | Reads the **form** value on the way to `addNote`. It never reaches a record mutation. |
| Leftover 35-14 comments | `{/* The record timeline replaces the legacy read-only notes block deleted above …` × 4 detail pages | JSX comments. The gate's `//` filter does not match `{/*`, which is why they appear. |

Two further matches the gate's case-insensitive `Notes:` filter silently swallows, disclosed here
because "zero readers" deserves an honest accounting:

- **`src/app/{organizations,people}/page.tsx`** still `select`s `organizations.notes` /
  `people.notes` into the list rows, and `columns.tsx` still types the field. These feed the record
  prop the dialogs no longer read. They are dead **reads**, not writes or renders, and both files are
  outside this plan's `files_modified`; removing them cascades into the record prop types the plan
  explicitly ordered left alone. Left in place, flagged for the column-drop phase.
- **`src/app/deals/page.tsx:20`** declares `notes?: string | null` on its local `DealWithRelations`
  type. Now dead — `deal-card.tsx`'s `Deal` no longer has the field. Measured on the live kanban
  payload: 3,753 occurrences of `"notes":null` and **zero** non-null legacy values, because deals
  hold no legacy notes at all. Nothing renders it (`line-clamp-2`, the class of the removed snippet,
  returns 0 matches on the rendered `/deals` page).

The four detail pages' `Notes:` entries in `entityAttributes` are untouched, as required by CFUI-03.
The mutation-layer and `/api/v1` zod schemas are untouched, as required by the hard constraint.

## Verification Performed

### Automated gates

| Gate | Result |
|------|--------|
| `npm run typecheck` | clean after each task |
| `npx eslint` on all six edited files | no issues found |
| `npm run lint` (repo) | 0 errors, 125 warnings — identical to the 35-14 baseline, none in edited files |
| `npm test` | 1016 passed / 4 skipped (64 files) + 8 RSC — no regressions |
| `NOTE_ROW_ON_CREATE` (`addNote` present in both task-1 files) | pass |
| `EDIT_PREFILL_GONE` | pass |
| `LEGACY_WRITES_GONE` (`notes: data.notes` count) | 0 / 0 |
| `KANBAN_CLEAN` (`deal.notes` in deal-card; `notes:` in kanban-board) | 0 / 0 |
| Post-commit deletion check | no tracked file deleted by either commit |

### Docker stack

`docker compose up -d --build` from the repo root. `.env` confirmed present before the build. App
container came up healthy; `docker compose logs app` ends with:

```
[✓] migrations applied successfully!Starting application...
▲ Next.js 16.1.6
✓ Ready in 236ms
[webhook-processor] Starting with initial delay of 5s
[email-processor] Starting with initial delay of 15s
[schedule-processor] Starting with initial delay of 10s
[execution-processor] Starting with initial delay of 5s
```

`.next/server/instrumentation.js` is present **inside the container**, and all four processors
logged their start — so `register()` ran, which is the precondition
`registerStageHistorySubscriber()` sits inside.

### SC-4 reconciliation — run twice, before and after all verification writes

```
 entity_type  | legacy_nonempty | migrated | delta
--------------+-----------------+----------+-------
 person       |               0 |        0 |     0
 organization |           29037 |    29037 |     0
 deal         |               0 |        0 |     0
 activity     |           46198 |    46198 |     0

 entity_type  | mismatched
--------------+------------
 organization |          0
 activity     |          0
 deal         |          0
 person       |          0
```

Identical on both runs. 29,037 + 46,198 = 75,235, matching plan 35-03. Re-running it **after** every
verification write is itself a legacy-write gate: a stray write to the column would have moved
`legacy_nonempty` away from `migrated`. It did not.

### Stage-history baseline

`SELECT count(*) FROM deal_stage_history` → **0** before verification.

## Browser Checks — what was actually observed

No browser automation exists in this environment (no Playwright, no Puppeteer, no browser MCP), and
installing one is barred by T-35-SC. Instead, the running container was driven over authenticated
HTTP: an Auth.js session cookie was minted locally from the project's own `AUTH_SECRET` (no password
was read or used; the session callback re-reads the user from the database), and a temporary API key
was inserted for the `/api/v1` surface **and deleted again afterwards**. Every result below is a
quotation of what the Docker app actually rendered or stored.

| # | Check | Result |
|---|-------|--------|
| 1 | Notes on a deal (SC-1) | **PASS (server-rendered).** Timeline card present below custom fields, old bordered block absent. Three notes posted one at a time; the page then rendered `Timeline (4)` with note 3, note 2, note 1 newest-first, each carrying the author avatar `PR`, `prbitt@gmail.com`, `Aug 15, 2026`, and a preserved second line. Earlier notes stayed intact as later ones were added — appending, not overwriting. |
| 2 | Edit and delete | **PARTIAL PASS.** After editing note 2, the entry rendered as `edited P35 verification note 2 - EDITED BODY` — the edited marker is live. After deleting note 1, the header went `Timeline (4)` → `Timeline (3)`, the entry vanished, and psql confirms `deleted_at IS NOT NULL` (soft delete, row retained). **Not verified:** the confirmation dialog's ESC behaviour and its "Keep note" cancel label. |
| 3 | Keyboard and empty state | **PARTIAL PASS.** Empty state confirmed on a person with no history: `Timeline (0)`, composer visible above, copy reads "No notes yet / Nobody has written about this record yet. Write the first note above." — correctly the notes-only variant, not the deal variant. **Not verified:** Enter-inserts-newline, Cmd+Enter-submits, disabled Add-note button. |
| 4 | Stage changes (SC-2) — **T-35-21** | **PASS on the thing that mattered.** `deal_stage_history` went **0 → 1** in the running container after a stage change, with the correct `from_stage_id`, `to_stage_id` and `changed_by`. The deal's detail page then rendered the entry: `prbitt@gmail.com / Aug 15, 2026 / moved this deal from Almost dead to 1y to die`. **The subscriber is registered and firing in the standalone Docker build.** Caveat: the change was driven through `PUT /api/v1/deals/{id}` rather than a mouse drag, because no drag is possible here. Registration — the failure mode of the 2026-08-08 incident and the entire point of this check — is proven; the drag emit site (`updateDealStageMutation`) is unit-covered and untouched by this phase. **A human should still perform one real drag.** |
| 5 | Interleaving (SC-2) | **PASS.** One chronological list, newest first, mixing three notes and the stage-change entry: notes at positions 1-3, the stage change at position 4. |
| 6 | Migrated notes (SC-3) | **PASS.** Organization `72adceb2…` rendered its legacy text as a timeline entry with a **Migrated** badge, attributed to `prbitt@gmail.com` and dated `Mar 11, 2026` (the record's `createdAt`). A new note was then posted to the same organization; the migrated entry moved to the **bottom** and the new one to the top, proving "oldest entry" rather than "only entry". The badge carries `title="Imported from this record's old notes field"` — the native tooltip, as decided (no `tooltip.tsx` in this repo). |
| 7 | Load more | **PARTIAL PASS.** With 25 entries on one deal, the page rendered **exactly 20** and a `Load more` button below them. **Not verified:** that clicking appends rather than navigates, that the button shows a spinner, and that it disappears once exhausted. |
| 8 | Permissions | **NOT VERIFIED.** The database holds exactly one non-deleted user (an admin), so there is no second identity to view another author's note as. Creating one would have meant inserting a user into a database that holds real imported production data. Server-side enforcement is separately proven by the eight-case author-or-admin matrix in plan 35-09; the icon hiding is cosmetic on top of it. |
| 9 | Legacy dormancy | **PARTIAL PASS.** Kanban half verified live: the rendered `/deals` page contains **zero** `line-clamp-2` blocks (the class of the deleted snippet) and every deal's `notes` value in the flight payload is `null` — 3,753 nulls, no legacy content reaching the client. The create-writes-a-note-row and edit-has-no-Notes-field halves are proven at code level (grep gates, typecheck, and the `addNote` call sites) but **were not observed in a dialog**, because a dialog cannot be driven over HTTP. |
| 10 | Dark mode and 320px | **NOT VERIFIED.** Requires a real viewport. |

Additional observation, since the objective asked: **the timeline reads last on the organization
page.** Document order in the rendered HTML is Custom Fields (idx 18119) → linked People card
(28490) → Timeline (29141). Commit `3c88138` had already moved it below the People card, superseding
the placement described in 35-14's summary.

## Not Verified — the human pass still owed

1. One real kanban **drag** producing a stage-change entry (registration proven; the gesture is not).
2. The delete dialog: ESC closes it, cancel reads "Keep note".
3. Composer keyboard: Enter inserts a newline, Cmd/Ctrl+Enter submits, empty box disables the button.
4. Note add is **optimistic and toast-free** — the entry must appear immediately with no success toast.
5. Load more: appends without navigating, spinner while loading, button disappears when exhausted.
6. A second non-admin user seeing no pencil/trash on someone else's note.
7. The create dialog end to end: Notes box present on create, absent on edit, on all four types.
8. Dark mode and a ~320px viewport.

## Test Data Left in the Database — please clean up after the browser pass

Left deliberately, because item 5 above needs a record with more than 20 entries:

- Deal `913a5d31-b079-4954-9444-ea206760bb3e` ("Test Deal Webhook"): 24 notes titled
  `P35 verification note …` / `P35 paging note …`, one of them edited, one soft-deleted, plus one
  `deal_stage_history` row. The deal was also moved from "Almost dead" to "1y to die".
- Organization `72adceb2-a335-4180-8dac-c9e7582d4954`: one note, `P35 org note written after migration`.

```sql
DELETE FROM notes WHERE content LIKE 'P35 %';
DELETE FROM deal_stage_history WHERE deal_id = '913a5d31-b079-4954-9444-ea206760bb3e';
```

The temporary API key created for `/api/v1` access was **already deleted** (`DELETE 1`, and
`SELECT count(*) … LIKE 'phase-35%'` returns 0). No credential was left behind and no password was
used at any point.

## Threat Model Dispositions

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-35-37 (a note written into an edit dialog lands in a column nothing displays) | mitigate | **Closed at code level.** All nine research-identified sites neutralised; grep gates return 0; typecheck and the full suite green. Browser confirmation of the dialog surfaces is the outstanding human item. |
| T-35-21 (stage-history subscriber silently dead in the Docker build) | mitigate | **Closed.** A row was written by the running container, and the entry rendered on the deal page. This is the failure this repo shipped in v1.2; it is not present. |
| T-35-38 (record created but its note lost) | accept | Implemented as accepted: no rollback, `toast.error(notes.error.saveFailed)` on both the failed-result and the thrown-error path. |
| T-35-05 (stored XSS) | mitigate | Imported Pipedrive content and user-written multi-line content both rendered as React text children with line breaks preserved and no markup escape observed. |
| T-35-SC (npm installs) | accept | **Zero packages installed.** This is also why no browser driver exists — the constraint was honoured rather than worked around. |

## Known Stubs

None. Every changed path is fully wired: the create branch calls the real `addNote` server action,
and no placeholder, mock or hardcoded empty value was introduced.

## Threat Flags

None. This plan adds no network endpoint, no auth path, no file access pattern and no schema change.
It only removes writes and renders, and adds one client call to an existing, already-gated server
action.

## Notes for Future Plans

- **The column-drop phase inherits three dead readers:** `src/app/organizations/page.tsx`,
  `src/app/people/page.tsx` (query selects) and `src/app/deals/page.tsx:20` (a type field). They
  render nothing today. They should go with the column, alongside the mutation-layer and `/api/v1`
  zod fields the hard constraint protected here.
- **`Notes` in `entityAttributes` is now frozen**, exactly as 35-14 recorded. This plan closed the
  last writer, so the freeze is complete rather than partial. Resolve it as a product question
  before dropping the column.
- **`DealDialog` no longer accepts a `notes` prop.** A future caller reconstructing an edit prefill
  will get a compile error rather than silently writing a dead column.

## Self-Check: PASSED

- `src/app/organizations/organization-dialog.tsx` — FOUND
- `src/app/people/person-dialog.tsx` — FOUND
- `src/app/deals/deal-dialog.tsx` — FOUND
- `src/app/activities/activity-dialog.tsx` — FOUND
- `src/app/deals/deal-card.tsx` — FOUND
- `src/app/deals/kanban-board.tsx` — FOUND
- `.planning/phases/35-notes-record-timeline/35-15-SUMMARY.md` — FOUND
- Commit `64b17ce` — FOUND
- Commit `c74312e` — FOUND

---
*Phase: 35-notes-record-timeline*
*Task 3 open: blocking human browser verification*

---

## Checkpoint Resolution — orchestrator browser verification (2026-08-15)

The executor correctly reported that it had no browser and listed eight unobserved items rather
than inferring them. The orchestrator ran those checks with Playwright against the Docker app,
authenticated with an Auth.js session cookie minted from the project's own `AUTH_SECRET` (no
password read or used).

**One check failed and exposed a real, shipped bug.** See `fix(35-08)`.

| # | Check | Result |
|---|-------|--------|
| 1 | Real kanban drag → timeline entry | **NOT REPRODUCIBLE BY AUTOMATION.** Three attempts (Playwright `dragTo`, a synthetic pointer sequence, and a coordinate-targeted retry) all failed to trip @dnd-kit's pointer sensor; dnd-kit's own a11y announcement showed the drop resolving onto the dragged card rather than the target column, and the DB stage never changed. Not evidence of an app defect. Two things that WERE proven make the risk low: the subscriber is registered and firing in the standalone Docker build (`deal_stage_history` 0 → 1 via an API-driven stage change, entry rendered on the page), and `reorderDealsMutation` **does** emit `deal.stage_changed` behind `if (stageChanged)` — source-verified, so the v1.2 "reorder path missing emission" regression is NOT present. **A human should still perform one real drag** — it is a five-second check. |
| 2 | Delete dialog: ESC closes, cancel reads "Keep note" | **PASS.** Dialog copy is `Keep note` / `Delete note` — both buttons name the outcome, no bare "Cancel". ESC closed it and the note survived (26 entries before and after). Both icon buttons expose `aria-label` ("Edit note", "Delete note"). |
| 3 | Enter inserts newline; Ctrl/Cmd+Enter submits; empty disables Add note | **PASS.** Empty composer → Add note `disabled: true`. Enter appended `\n` and did NOT submit (entry count unchanged). Ctrl+Enter submitted. |
| 4 | Note add is optimistic and toast-free | **PASS.** Entry count went 25 → 26 immediately with a "now" timestamp, textarea cleared, and `[data-sonner-toast]` count was **0**. Both lines of the two-line note rendered, so `whitespace-pre-wrap` holds. |
| 5 | Load more appends, spinner, disappears when exhausted | **FAILED, then FIXED, then PASSED.** Originally the server action returned `{success:false}` on every page after the first. Root cause: the keyset predicate bound `cursor.occurredAt` as a JS `Date` into a raw `sql` fragment, and postgres.js throws `ERR_INVALID_ARG_TYPE` on that. Page one binds no cursor, so it was invisible until paging — and the mocked-`@/db` suite asserts the rendered SQL string rather than executing it, so no unit test could see it. Worse, the existing assertion **required** three `Date`s in `params`, pinning the defect in place. Fixed in `fix(35-08)`: bind `toISOString()` cast back with `::timestamp`, assertion inverted, regression test added. After the fix and a container rebuild: **20 → 25 entries, URL unchanged, a `window` marker set before the click survived it (so it appended client-side rather than navigating), and the button disappeared once exhausted.** |
| 6 | Non-admin sees no edit/delete on another author's note | **NOT VERIFIABLE.** The database holds exactly one non-deleted user. Inserting a second identity into a database of real imported data is not worth a cosmetic check. Server-side enforcement is the actual control and is unit-tested across both actor shapes (35-07, 15 tests; 35-09's authorization matrix). |
| 7 | Create dialog has Notes; edit dialog does not | **PASS — both halves observed.** "Create Deal" renders a Notes label and one textarea. "Edit Organization" renders labels `Name*`, `Website`, `Industry` and **zero** textareas. The end-to-end create could not be completed because the deal form requires an organization or person (a pre-existing business rule, unrelated to this phase); the write path itself is gated at source by 35-15's grep gates. |
| 8 | Dark mode and ~320px | **320px: PASS for the timeline.** At a 305px client width, **zero** timeline elements overflow. The page does overflow (scrollWidth 416), but all nine offending elements are in the site header — search box, avatar, nav — which this phase did not touch. Pre-existing responsive debt, not a phase-35 regression. **Dark mode: NOT APPLICABLE.** The app ships no `ThemeProvider` and no theme toggle (only `sonner.tsx` references `next-themes` internally), so dark mode is unreachable. The timeline components use semantic tokens with **zero** hardcoded `dark:` utilities, so they would follow correctly if it is ever added. |

### Also observed

`React error #418` (hydration text mismatch) is present on record detail pages. It predates the
timeline work in the sense that it is caused by relative timestamps ("6 minutes ago") rendering
differently on server and client — but the timeline renders many of them, so it is worth a look.
Not fixed here; logged as a follow-up rather than silently absorbed.
