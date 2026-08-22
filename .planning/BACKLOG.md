# Backlog

Deferred items with their evidence. Each entry records where it was found and what is already
known, so a later phase does not have to rediscover it.

## From Phase 39 (Duplicate Detection & Merge)

### F-39-07 — a 320px user cannot get past the duplicate advisory
**Severity: functional dead-end on mobile.** Deferred by the user 2026-08-20 as app-wide rather
than phase-39-specific.

Measured by plan 39-19 in a real browser at 320x640: once the advisory renders, the create dialog
is **940px tall** (`top -150`, `bottom 790`), `position: fixed`, `overflow-y: visible`,
`max-height: none`, with `body overflow: hidden`. The footer is below the fold and there is nothing
to scroll, so **"Create anyway" is unreachable by pointer** — a mobile user who hits a certain
duplicate can never create that record. Escape still dismisses (asserted), so they are not trapped.

This lands squarely on Phase 39's own W-1 rationale: "a second modal over a modal at 320px has
nowhere to go."

The fix is architectural: it touches `DialogContent`, a primitive behind roughly **16 dialogs**. A
real fix needs a 320px reachability regression suite across all of them, not a patch for this one
surface. Note that Phase 39's 320px matrix asserted no horizontal overflow (305/305 in three
locales) and passed — **height and reachability were never covered**, which is why this survived a
green viewport gate. Any future viewport suite should assert the submit control is clickable, not
merely that the page does not scroll sideways.

### Hydration mismatch on three list pages can swallow a click (found during phase-39 verification)
**Pre-existing and app-wide; surfaced as e2e flakiness.** Found by the Phase 39 verifier, which ran
the full Playwright suite three times and got **33/33, then 31/33, then 32/33** — every failure in
`e2e/org-duplicate-warning.spec.ts` with "the create dialog did not open."

Root cause is NOT phase-39 code. A React hydration mismatch (`Minified React error #418`) occurs on
`/people`, `/organizations` and `/activities` — but **not** `/deals`, which is what confirms it
predates Phase 39. A click landing during hydration recovery can be swallowed, including a
dialog-trigger click. Reproduced independently with a standalone script.

Not a DEDUP-01 blocker: it is not specific to the duplicate button and is invisible at human click
timing. But it makes the e2e suite intermittently red, which erodes the value of every gate that
depends on it. Two separate things to fix: the hydration mismatch itself, and the suite's
sensitivity to it.

Related: `e2e/auth.setup.ts` timed out on `waitForURL` in 2 of 8 invocations (recorded below) — the
suite has two independent sources of flake, not one.

### `popover.tsx` never consumes Radix's available-height, so filter popovers already overflow at 320px
**Pre-existing; measured during phase-40 UI research.** `src/components/ui/popover.tsx:33` never
consumes `--radix-popover-content-available-height`. Measured at 320x640: Radix computed the variable
as **347px**, and the `/activities` filter popover rendered **388px tall at `top: -41`** with
`max-height: none` and `overflow-y: visible` — clipped off the top of the viewport with no way to
scroll to it. `/deals` clears the viewport by only 7px.

Same shape as F-39-07 and deferred for the same reason: the fix touches every popover in the app and
needs its own reachability suite. Note `DropdownMenuContent` and `SelectContent` ARE height-safe
(`max-h-(--radix-*-available-height)` + `overflow-y-auto`); `DialogContent` and
`DropdownMenuSubContent` are not — `DialogContent` has no clamp at all, and the org create dialog is
already 586px in a 640px viewport, roughly 54px of headroom before F-39-07 recurs elsewhere.

Phase 40 works around this by putting nothing in a Popover.

### `/activities` date filtering runs in JavaScript after the pagination slice
**Correctness bug, found while verifying phase-40 planning.** `src/app/activities/page.tsx:165-178`
applies `dateFrom`/`dateTo` with `Array.prototype.filter` *after* `allActivities` has already been
sliced to `PAGE_SIZE * pageNum`. So a date range does not narrow the query — it removes rows from an
already-paginated page, meaning a user can see a short page (or an empty one) while matching rows
exist beyond the slice. `status` has a related gap: only `=== "completed"` maps to a predicate, so
`pending` and `overdue` narrow nothing server-side.

Phase 40 plan 40-13 makes `status` and the date range real SQL predicates, because the phase's export
guard depends on a filter actually filtering. **The pagination interaction is broader than that fix**
— any surface applying a JS filter after a limit has the same defect shape. Worth a sweep.

### A dead `view=<id>` persists in the URL on `/deals` and `/activities`
**Cosmetic asymmetry, accepted during phase 40 planning.** `withViewEscape` runs client-side with no
view list, so it cannot know a view id is unresolvable. The two data-tables (`/organizations`,
`/people`) scrub a dead id because they seed from the RESOLVED id; the two filter toolbars
(`/deals`, `/activities`) preserve the raw param because they build from `searchParams.toString()`.

Harmless in behaviour — the resolver yields no selection, so no badge, no notice and no throw — but a
shared URL can carry a junk `view=` param, and the asymmetry reads as sloppy. Fixing it properly means
threading `selectedViewId` into two more components. Judged not worth it mid-phase; the reasoning is
recorded in `src/lib/views/resolve.ts`.

Related footgun in the same module, worth watching in review: `withViewSelection` DROPS `page` (a view
lands you on page 1) while `withViewEscape` PRESERVES it (Load More). Both are correct; reaching for
the wrong one for pagination inside a view is an easy mistake.

### F-39-08 — Enter inside a modal navigates the list behind it
Pre-existing, shared by six surfaces. `data-table-keyboard.tsx` registers
`useHotkeys("enter", …, { preventDefault: true })` with **no ref**, so it fires inside a portalled
modal, and `isFormFocused` exempts only INPUT/TEXTAREA/SELECT/contenteditable — **not BUTTON**.
Pressing Enter on a dialog's submit button navigates to the selected list row **with the draft
unsaved**. Observed directly by plan 39-19.

### F-39-04 — the progress bar is not announced to assistive tech
`ProgressBar` has no `role="progressbar"` and no `aria-valuenow`. Inherited from the importer via
UI-SPEC P-2; pre-dates Phase 39. Plan 39-13 lifted the component without changing its semantics,
deliberately (refactor, not redesign).

### F-39-06 — near-invisible link affordance in dark mode
`text-primary` links measure `lab(90.952)` against a `lab(98.26)` body. App-wide, not
phase-39-specific. Found by the Phase 39 dark-mode checkpoint, which is exactly what UI-SPEC V-6
existed to catch.

### Scan-guard atomicity — two concurrent scans of one entity type can both start
`createScanState`'s running-scan guard is **read-then-write, therefore advisory rather than
atomic**. The airtight fix is a partial unique index on
`dedup_scans (entity_type) WHERE status = 'running'` plus a `23505` catch rethrowing
`SCAN_ALREADY_RUNNING`. **Needs migration 0018.** Deliberately not generated inside a wave with
sibling agents. Residual risk is low: a duplicate pass, visibly `running`, reaped at next boot.
Found by plan 39-06.

### The merge loser's own timeline row renders with an empty name
The loser's `merged` audit row renders `{name}` empty. The correct fix needs a **fifth and sixth**
`audit.entry.merged.*` message key, and `src/messages/locale-parity.test.ts` pins Phase 39 to
exactly four (plan 39-04's contract), so closing this means deliberately extending that pin. The
row is **currently unreachable** — `src/app/organizations/[id]/page.tsx:41` filters
`isNull(deletedAt)` before `notFound()` — and HTML collapse degrades it to "merged into this
organization". Found by plan 39-12.

### e2e auth setup is flaky
`e2e/auth.setup.ts` timed out on `waitForURL` in 2 of 8 full-suite invocations, with no rate
limiting involved. Plan 39-19 recommends `retries: 1` on the setup project.

### Two brace matchers should be consolidated
The suite carries two independent brace-matching helpers
(`duplicate-warning-wiring.test.ts` and `deleted-at-wiring.test.ts`). Plan 39-21 deliberately
avoided adding a third by using call-site assertions instead. Real debt, small.

---

## Cross-phase, found in Phase 39 — belongs to Phase 43

### `drizzle-kit migrate` cannot build a fresh database
**This directly blocks Phase 43's stated goal, "a self-hoster can recover their data."** A
self-hoster cannot bootstrap from the migration chain today.

An early migration runs `ALTER TABLE "import_sessions" ADD COLUMN "user_id"` against a table that
**no migration ever creates** — it arrived via `db:push`. A clean `migrate` therefore dies with
`42P01`. Found by plan 39-10, which is why its test database had to be provisioned from a
`pg_dump --schema-only` of the dev database rather than from migrations
(`scripts/dedup-db-test-setup.sh`).

Raise this in Phase 43's discuss step; do not let it be rediscovered.

---

## Process lessons worth keeping (from Phase 39)

- **Raw-token `grep` acceptance criteria are a trap.** Hit five times in one phase (39-08, 39-14,
  39-16, 39-11, 39-15): the comment explaining a rule trips the rule's own grep gate, and deleting
  the comment also passes — the wrong fix. Prefer asserting call sites or parsed structure.
- **A passing source gate is how an unreachable feature ships.** Plan 39-14's gates passed while the
  organization duplicate warning could not fire from any surface. It took a human-verify checkpoint
  driving a real browser to find it. Behavioural proof is not interchangeable with source proof.
- **Negative proofs must be RUN, and must be checked for vacuity.** Plan 39-13's poll gate stayed
  GREEN when its defect was introduced, because unrelated code satisfied the assertion. Plan 39-21
  found an assertion that would have been `false` forever by construction. Both were caught only by
  running the probe and reading the failure.
- **Verify a file contains what an assertion assumes.** A stale assertion naming
  `import-wizard.tsx` (which does not render `ProgressBar`) had propagated into three separate
  documents while proving nothing.
- **Claude Code worktrees branch from a stale commit systematically** — 13 of 13 executors in this
  phase were created ~11 phases behind and had to self-correct.

---

## Found in Phase 40 (Saved Views & Shared Filters)

Written by plan 40-17 from the eighteen plan summaries and `deferred-items.md` of that phase. Every
figure below was re-measured against the tree at `9d823af` rather than copied from a document — see
entry 1 for why that distinction is the entry.

### 1. The locale-parity pinned figures in `40-UI-SPEC.md` M-13 and `40-CONTEXT.md` A5 are WRONG, and the tempting correction breaks the suite

Both documents state key-set sizes they claim to have parsed from `src/messages/locale-parity.test.ts`.
Re-measured from that file by stripping comments and counting the array literals — a method validated
by the fact that it reproduces the file's own runtime `toHaveLength` pins exactly:

| Constant | Documents claim | **Actually in the file** |
|---|---|---|
| `REQUIRED_DEDUP_KEYS` | 83 | **80** |
| `REQUIRED_AUDIT_KEYS` | 88 | **86** |
| `REQUIRED_BULK_KEYS`  | 47 | **46** |
| `REQUIRED_TRASH_KEYS` | 66 | **63** |

**The cause is naive counting, and it is reproducible.** A regex over the raw array literal also
counts the quoted dot-paths that appear inside the explanatory comments *within* the array. Counting
the same four arrays without stripping comments yields 83 / — / — / 66 — i.e. it reproduces two of the
documents' wrong numbers exactly. That is the fingerprint of how they were produced.

**The trap.** `locale-parity.test.ts` carries
`it("the checked-in dedup contract still lists exactly 80 keys")` with `expect(REQUIRED_DEDUP_KEYS).toHaveLength(80)`
plus a duplicate guard, and a second test — *"the four pre-existing pinned key sets are unchanged by
phase 40"* — that soft-asserts 86 / 63 / 46 / 80. A future plan that copies the documents and
"corrects" 80 to 83 by adding keys to the array turns both tests red. **The file wins over every
document.** The file says so itself, in a comment above that test.

Also measured while there, because both figures circulate:

- `REQUIRED_VIEWS_KEYS` is **61** — the namespace Phase 40 added, pinned by its own test.
- `IDENTICAL_TRANSLATION_ALLOWED` is **3**, as documented.
- `ICU_PLURAL_KEYS` is **12**, not the 11 the documents state. The documents were right when written;
  Phase 40 added `views.manage.filterCount`, an ICU plural, as the twelfth. Plan 40-03's verification
  pins it at 12.

**The process lesson to keep beside it — verify a file contains what an assertion assumes.** This is
the same lesson BACKLOG.md already records for the stale `import-wizard.tsx` reference that
propagated into three documents while proving nothing. Two independent instances now, in consecutive
phases, both of the same shape: a number or a filename asserted from a document rather than from the
artifact.

### 2. Related and still open: `ICU_PLURAL_KEYS` has no completeness gate

Found by plan 40-03 while verifying the reused bulk keys. `bulk.exported` is
`{count, plural, one {# record exported.} other {# records exported.}}` in en-US and is correctly
pluralised in both other locales — **so there is no live defect** — but it is absent from
`ICU_PLURAL_KEYS`, so `placeholderDrift` cannot see it and a future translator could flatten it
silently. `deals.kanban.dealsCount` is a second instance, so this is a class rather than a key.

Not fixed in Phase 40 because plan 40-03's own verification pins the list at exactly 12, and adding a
thirteenth entry would have failed the criterion that plan was given. **The right fix closes the
class:** derive the list's completeness — assert that every en-US message containing `plural,` appears
in `ICU_PLURAL_KEYS` — instead of adding two entries by hand.

### 3. Two list surfaces are not internationalised at all

Named in 40-UI-SPEC § Out of scope and deliberately declined by Phase 40, whose edits to both files
are one-expression-scale. Needs a dedicated copy pass with its own locale-parity contract.

**`src/app/deals/deal-filters.tsx` calls no `useTranslations` whatsoever.** Enumerated at `9d823af`:
**18 hardcoded user-visible English literal sites, 15 distinct strings** — "Filters"; the labels
"Stage" / "Owner" / "Assignee" / "Close Date From" / "Close Date To"; "All stages" / "All owners" /
"All assignees" *twice each* (once as a `placeholder`, once as the `SelectItem`); "Clear all"; and the
five chip prefixes `Stage: `, `Owner: `, `Assignee: `, `From: `, `To: `. **A second, separable defect
in the same file:** each of the five filter chips carries an unlabelled `<button>` — no text, no
`aria-label`, only an `<X>` icon — so a screen-reader user is offered five identical anonymous
buttons.

**`src/app/deals/kanban-board.tsx` carries five:** "Pipeline:" (L489), "Select pipeline" (L492),
"Add Deal" (L509), "No results match your filters" (L562), "Clear filters" (L564).

**And three more surfaces carry their search placeholder in English:**
`organizations/data-table.tsx:469` ("Search organizations..."), `people/data-table.tsx:410`
("Search people..."), `activities/activity-filters.tsx:208` ("Search activities...") — plus the
Add-buttons "Add Organization" (`organizations/data-table.tsx:497`) and "Add Person"
(`people/data-table.tsx:438`).

### 4. CLOSED — `/activities` accepted three filter params that narrowed nothing

Recorded as closed, with its cause, so the shape is not reintroduced.

Before plan 40-13, `src/app/activities/page.tsx` applied `status` only as
`params.status === "completed" → filters.completed = true`, and applied `pending`, `overdue`,
`dateFrom` and `dateTo` with `Array.prototype.filter` **after** `allActivities` had already been
sliced to `PAGE_SIZE * pageNum`. So three of the surface's seven filters removed rows from an
already-paginated page instead of narrowing the query, under-counting whenever matching rows lay
beyond the slice — while the toolbar rendered removable chips for all of them.

Closed by 40-13, which made `status` and the date range real SQL predicates. It had to be closed
inside this phase for two reasons: it made ROADMAP criterion 1 false, and it left the phase's export
guard satisfiable by a control that filtered nothing.

**Two things survive the fix and are the reason this entry exists:**

- **The defect SHAPE is broader than the surface.** Any code path applying a JS filter after a limit
  has it. Worth a sweep.
- **A behavioural suite cannot see it.** Measured by plan 40-05 (probe 7): moving a visibility
  predicate out of the `where` clause into `rows.filter(...)` left **all 25** behavioural assertions
  green, because the caller receives the same list either way. Only a `.toSQL()` gate discriminated
  it. A "the filter works" test does not test where the filter runs.

### 5. UI-SPEC's escape-param table undercounts the call sites — the measured census

The `?view=none` escape table in 40-UI-SPEC lists **six** call sites. There are **seven** bare or
can-be-bare ones: the seventh is `activities/activity-filters.tsx:124` (`handleSearchChange`), which
produces `${pathname}?` — a zero-length query Next reads as no-params — when the search box was the
last filter. Found by plan 40-13.

Plan 40-14's gate counts a different and wider quantity: **every list-route navigation present today,
bare or not**. Its census, re-derived from the committed tree and green:

| Quantity | **Measured** |
|---|---|
| Navigations across the six filter surfaces | **17** |
| …escaped | **13** |
| …exempt, each with a quoted reason | **4** |
| Navigations in `components/views/saved-views-bar.tsx` | **2** (19 rows in total) |

The four exemptions are the two detail-row `onOpen` pushes (`/organizations/${id}`, `/people/${id}`)
and the two `kanban-board.tsx` pipeline pushes (`${pathname}?pipeline=…`). Site #11 is labelled in the
test as *"absent from UI-SPEC's table"*, so the discrepancy lives in the artifact rather than only
here. **If a later plan adds a navigation, the correct response is a new row in `SITES` — escaped, or
exempt with a reason — never widening a match.**

### 6. Document drift found alongside it — 40-UI-SPEC V-9 names the wrong helper

V-9 says selecting a view navigates "through `withViewEscape` (U-1)". After plan 40-18 it must go
through **`withViewSelection`**: `withViewEscape` preserves a selection but never creates one, and it
preserves `page`, which V-9's own next sentence forbids ("a view lands you on page 1").
`views.allRecords` still goes through `withViewEscape` to `?view=none`, unchanged.

Related footgun in the same module, already recorded above under the dead-`view=<id>` entry and worth
re-reading before touching pagination: `withViewSelection` DROPS `page`, `withViewEscape` PRESERVES
it. Both are correct; reaching for the wrong one is an easy mistake. Note also that plan 40-18
narrowed `?view=` to a uuid grammar, so a hostile value can no longer *select* anything — but
`withViewEscape` still preserves whatever `view` value is present, so the dead-id asymmetry recorded
in the Phase 39 section survives.

### 7. `popover.tsx` reachability — the existing entry is complete; nothing to add

Checked as part of this write-up. The Phase 39 entry above already carries both Phase 40 figures:
M-5's `/activities` measurement (Radix computed **347px** available; the popover rendered **388px** at
`top: -41`, `max-height: none`, `overflow-y: visible`) and M-6's `/deals` **7px** clearance. Phase 40's
only obligation toward it was not to add to it, discharged by putting nothing inside a `Popover` —
the saved-views affordances are a `DropdownMenu`, which IS height-safe.

One new fragility worth adding, measured by plan 40-15: the `/activities` saved-views menu clears the
top of a 640px viewport **by under one pixel** in one locale. It is on screen only because Radix
clamps to its own available height. The moment a `className` on that `DropdownMenuContent` overrides
the primitive's clamp — which `tailwind-merge` would do silently — that menu goes off screen.
`saved-views-bar.tsx` carries a comment forbidding it; a comment is not a gate.

### 8. A soft-deleted user's private views are permanently unreachable by anyone

40-CONTEXT A6, verification V-6. Visibility is `owner_id = viewer` for private views, with **no admin
branch** — Decision 3, deliberately breaking this codebase's usual `owner || role === "admin"` idiom,
because private that an admin can read is not private. The consequence is that when a user is
soft-deleted, their private views become rows no living actor can list, edit or delete.

**Six soft-deleted users exist in this deployment** (measured by plan 40-05: 10 users total, 4 live and
6 soft-deleted — *not* the 9 total / 3 live that 40-CONTEXT A5 and 40-UI-SPEC both state; the extra
live account is `pipelite-e2e-member@local.test`, and live users with `name = NULL` is therefore 2 of
4, not 2 of 3).

**Accepted, not a defect** — a saved view is a filter set with no record content, and the read side
degrades honestly (`views.ownerUnavailable`, "Owner no longer active", renders wherever attribution is
needed). Recorded so it is not rediscovered as a bug, and so that whoever writes a data-retention or
account-deletion story knows this table outlives every actor who can act on it.

### 9. Criterion 4's deliberate `/deals` narrowing is a documented product limitation, not a bug

On `/deals`, a view carrying only `pipeline` is **saveable but not exportable**. The export menu item
is disabled with its reason beside it ("Choose at least one filter first. An unfiltered export isn't
allowed."). Adding a stage, owner, assignee or date makes it available.

This is E-2, and the reason is a number: **25,195 deals live across 11 pipelines**, so a board selector
alone scopes an export to as many as 15,415 rows — the unbounded export `38-CONTEXT.md:110-116`
forbids, and Decision 2 replaced Phase 38's admin gate with this guard. `SAVEABLE_FILTER_KEYS.deal`
therefore includes `pipeline` and `EXPORTABLE_FILTER_KEYS.deal` deliberately does not, with a comment
at the omission.

**Do not "fix" this by widening `hasExportableFilter`.** If the limitation is ever revisited, the
change is a row cap or a background job, not a wider whitelist.

### 10. `/deals` renders every deal on the selected pipeline, with no pagination — 88 seconds on the busiest board

Measured by plan 40-16 against the running container, admin session, 320x640. Time is `page.goto` plus
`h1` visible:

| pipeline | deals | stages | time to `h1` |
|---|---|---|---|
| `8e3b92d1…` **Closer** | **15,415** | 10 | **88.3 s** |
| `010edd01…` BDR - Base Fria | 3,754 | 2 | 5.3 s |
| `f40cffbf…` SaaS kill list | 2 | 6 | 0.3 s |

Roughly linear at ~5.7 ms/deal, so it is row volume and not a constant cost. `src/app/deals/page.tsx`
loads EVERY deal on the pipeline into `dealsByStage` and `KanbanBoard` renders every card: the board is
`O(deals in pipeline)` in both the query and the DOM. This is the busiest board in the deployment and
the one a salesperson opens first. **Not caused by saved views** — the same URL is reachable from the
pipeline `<Select>`.

**It is also the main cause of Playwright flakiness** (see entry 11), which is a second, independent
reason to fix it.

Smallest honest fix: per-column pagination — first N cards per stage plus a count, load more on
scroll. Virtualising the column would cut the DOM cost but not the query. Needs its own plan: the board
is the drag-and-drop surface, and `@dnd-kit` sortable contexts have to know about every item they can
reorder.

### 11. The full Playwright suite is not reliably green on a loaded machine — two named causes

Chasing D-40-4 meant running the whole suite repeatedly, and **a different test failed almost every
time** — `saved-views-degraded.spec.ts` ANTI-VACUITY, then DEAD_PIPELINE, then two
`org-duplicate-warning.spec.ts` rows, then `viewport-320.spec.ts` `/deals @ en-US`. **Every one passes
when its own file is run alone** (`viewport-320` 23/23, `saved-views-320` 24/24, `deals-drag` 4/4,
degraded ANTI-VACUITY 45.2s pass). Machine load during those runs was 6.3–8.5 with other containers
active, so this is not purely the app's fault. Both causes are measurable:

1. **Entry 10 is the amplifier.** `/deals` costs 17.7s to render even in an isolated run, and the
   degraded spec spends most of its 45–53s waiting on boards. Tests that slow sit close enough to their
   budgets that ordinary contention tips them over. Fixing the kanban's unpaginated render buys back
   suite reliability as well as page speed.
2. **The first login after a container restart exceeds the 30s setup timeout.** Measured: cold
   `auth.setup.ts` **30.1s → failed**, immediate retry **1.9s → passed**. `retries: 1` on the setup
   project masks it, but it makes the first run after any rebuild look broken.

Recorded because "the suite is flaky" is exactly the state Phase 39 shipped in and that Phase 40 spent
nine plans refusing to re-enter: **a red run has to mean a defect.** Note that the `retries: 1` on the
`setup` project and `workers: 1` are already in `playwright.config.ts` with their reasons; neither
addresses these two.

### 12. F-39-08 is NOT contained — Enter on a focused button inside a modal navigates the list behind it, discarding the draft

Measured by plan 40-15 against the rebuilt container. Verbatim:

```
Error: Enter on the focused submit navigated the list behind the dialog — F-39-08 is NOT contained
Expected: "http://localhost:3001/organizations?search=ltda"
Received: "http://localhost:3001/organizations/9b37a635-b601-4e71-886d-83640ff776fe"
```

Open a list with rows, open any modal over it, focus a button, press **Enter** — the browser navigates
to the FIRST row's detail page, the dialog unmounts, and everything typed into it is discarded. Space
still activates the button correctly; only Enter is bound.

**Why.** `src/components/keyboard/data-table-keyboard.tsx` registers
`useHotkeys("enter", …, { enableOnFormTags: false, preventDefault: true })` with **no ref**, so it
listens on the document; `isFormFocused()` exempts `INPUT`, `TEXTAREA`, `SELECT` and `contenteditable`
but **not `BUTTON`**; Radix's modal layer does not stop the keydown reaching the document listener; and
`preventDefault: true` then suppresses the button's own activation, so the hotkey wins outright.

**Blast radius is six surfaces, not this phase.** Every surface mounting `useDataTableKeyboard` and
every modal openable over one — the org create dialog, the bulk dialogs and the merge screen included.

**How it is tracked, and why that matters.** `e2e/saved-views-320.spec.ts` marks the assertion
`test.fail()` with the assertion **byte-unchanged and still running**, guarded by an anti-vacuity check
(`[data-selected="true"]` must exist, so the recorded failure cannot come from an empty list). **The
suite therefore goes RED the day this starts passing** — leave the `test.fail()` exactly as it is until
the fix lands, and delete it in the same commit as the fix.

**The obvious one-liner is wrong.** `onKeyDown={(e) => e.stopPropagation()}` on the dialog would also
cut Radix's document-level Escape listener, breaking the dismissal that the same spec run proves works
on all four overlays. Guard the hook instead — one place, six surfaces:

```ts
const isFormFocused = useCallback(() => {
  // …existing tag checks…
  // A modal owns the keyboard while it is open.
  if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) {
    return true
  }
  …
}, [])
```

Needs its own plan: five hotkeys (`j/k/enter/e/d/n`) change behaviour on six surfaces, and every one of
them currently fires over an open dialog.

### 13. Four copies of the CSV download idiom, and consolidating them requires editing a Phase 38 gate

The ~10-line "blob → `URL.createObjectURL` → anchor → click → `URL.revokeObjectURL`" idiom now exists
four times: `src/app/admin/export/export-form.tsx`,
`src/app/workflows/[id]/edit/components/toolbar.tsx`, `src/components/bulk/bulk-action-bar.tsx`, and
`src/components/views/saved-views-bar.tsx` (copied in shape by plan 40-10, with the reason in its own
doc comment).

**The blocker is a test, and it must be handled in the same commit.**
`src/components/bulk/__tests__/bulk-action-bar-wiring.test.ts:373` asserts the literal
`URL.createObjectURL` appears in `bulk-action-bar.tsx` **itself** — in a vocabulary table and in a
dedicated test. Extracting a shared helper and importing it turns that Phase 38 gate red; extracting it
while leaving the original in place produces a fifth downloader wearing a shared name. Any consolidation
must amend that gate to assert the *import* rather than the *token*, in the same change.

### 14. `toolbar-wiring.test.ts` still carries private tag and brace walkers, one with a latent bug

The consolidation item already on this list has grown a third strand and a known defect.

Plan 40-09 promoted `openingTagAt`, `tagIndexes`, `elementRegion` and `callArguments` into
`src/components/custom-fields/__tests__/source-scan.ts`, and 40-14 fixed `elementRegion`'s
self-closing-tag bug there — the walker counted every `<div` as an open and only `</div` as a close, so
a `<div />` incremented depth with nothing to decrement it and the whole region threw
`unterminated <div> region`. Reproduced on `kanban-board.tsx` and on a 46-character synthetic before
being fixed; the fix decides self-closure from the END of the real opening tag via the brace- and
string-aware `openingTagAt`, so a `>` inside `className={n > 2 ? "x" : "y"}` cannot end the tag early.

**`extractToolbarRegion` in `src/app/organizations/__tests__/toolbar-wiring.test.ts:56` counts
`<div` / `</div` identically and has the identical blind spot, latent.** Its target files happen to have
no self-closing div inside the toolbar row, so the suite is green. It joins the two module-private
brace matchers already listed above for consolidation. Fixing it belongs to that consolidation, not to
a drive-by edit — which is why 40-14 reported it rather than patching it.

**One shared-walker convention to preserve while consolidating:** `elementRegion` returns a region
ending at the closing tag's *name* and excluding its final `>` (the walker advances by `"</div".length`,
five characters). Several gates already read regions on that basis. 40-14 pinned the convention with an
assertion rather than widening it, and named the widening as a BACKLOG candidate with its own blast
radius. It is now recorded here.

### 15. F-39-06, measured live in dark mode — the count, so the entry has a number

Plan 40-17's dark-mode pass swept a real Chromium with `documentElement.className` containing `dark`.
Phase 40's own four surfaces carry **zero** `text-primary` text across **199 elements examined**. The
surrounding `/activities` page carries **nine** in the same paint: eight
`<a class="text-sm text-primary hover:underline">` record links and one
`<svg class="lucide lucide-circle-check h-6 w-6 text-primary">`. Measured values in dark mode:
`--primary` resolves to `lab(90.952 0 -0.0000119209)` against a body foreground of `lab(98.26 0 0)` on
a `lab(2.75381 0 0)` background — i.e. the low-contrast link affordance F-39-06 describes, still live,
still app-wide, on a list page a user reads every day.

**A method note for whoever writes the fix's gate.** A DOM sweep must read `el.getAttribute("class")`
and **not** `el.className`: on an SVG element `className` is an `SVGAnimatedString` whose `toString()`
is the literal `"[object SVGAnimatedString]"`, so a `className`-based sweep silently skips every icon
in the tree. Measured — the first draft of 40-17's sweep reported zero spinners with a spinner visibly
on screen, and missed the `circle-check` icon above.

---

## Security findings from Phase 40's code review — untracked until close-out

Both were raised in `.planning/phases/40-saved-views-shared-filters/40-REVIEW.md` and neither made
it into this file when the phase's other findings did. The phase's verifier caught the omission
(gap G-3). They are recorded here because a finding that lives only in a phase artifact is a
finding nobody will read again.

### Export authorization is materially weaker than before Phase 38's gate (review WR-04)

**Where:** `src/lib/export/view-export-guard.ts`, `src/lib/views/export-action.ts`
**Status:** OPEN by explicit decision — this is a change to 40-CONTEXT Decision 2, not a bug fix,
so it was deliberately excluded from the review-fix pass.

Phase 38 forbade a filters-taking export action reachable without an admin gate, because an action
handed `{}` returns every row. Phase 40 Decision 2 (E-9) opened export to every authenticated user
and preserved the *intent* by refusing an empty filter set. The guard's own header states it "must
be IMPOSSIBLE to satisfy with no filter" — and it is. But it is trivially satisfiable with a filter
that narrows almost nothing:

    search=a  →  44,254 of 46,054 organizations (96.1%)
                 36,893 of 38,348 people
    — under the 50,000 EXPORT_ROW_CAP, for any authenticated non-admin,
      with notes and all custom fields, `includeCustomFields: true` hardcoded.

Measured twice independently against the live database: once by the reviewer, once by the verifier.

**The judgement recorded by the verifier, and not overridden:** this should not block Phase 41, but
it *should* block milestone close and any deployment where non-admins are not trusted with the whole
customer table. Phase 38 gated this behind admin; Phase 40 removed the gate. That is a net
regression in posture even though every individual control behaves as specified.

**Candidate fixes**, none free, all needing a decision rather than a patch: a minimum-selectivity
rule (refuse when a result exceeds some fraction of the table), a lower cap for non-admins, an
audit-log entry per export, or restoring the admin gate for unfiltered-in-practice exports.

### CSV formula injection, pre-existing, but the audience widened (review IN-06)

**Where:** `src/lib/export/formatters.ts:219-227`, in `exportToCSV`

`Papa.unparse` quotes and escapes correctly for CSV but does nothing about a cell whose first
character is `=`, `+`, `-`, `@`, tab or CR. Excel and LibreOffice evaluate those as formulas when the
file is opened. An organization `notes` field, or any text custom field, is attacker-controlled by
anyone who can create a record.

This is Phase 38 code and is not scored against Phase 40. It is listed because **Phase 40 changed
who can trigger it**: before, a filters-taking export required an admin; after Decision 2 any
authenticated user can produce one, and WR-04 above shows the resulting file can contain most of the
table. The two compound.

**Fix:** prefix at-risk cells with `'` in `exportToCSV` — the single choke point all four entity
exports already funnel through. Cheap, and independent of the WR-04 decision.

### A third, smaller one from the same review pass

`setViewDefault` returns `forbidden` where the three mutators fixed under WR-01 now return `failed`
(`src/lib/views/actions.ts`). The WR-01 fix closed an exists-vs-not disclosure by making the
mutation paths indistinguishable; this one site was missed, so a caller can still tell "this view id
exists but is not yours" from "no such view". Same class, same fix shape, one call site.
