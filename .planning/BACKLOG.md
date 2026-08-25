# Backlog — the single register of deferred work

Deferred items with their evidence. Each entry records where it was found and what is already known,
so a later phase does not have to rediscover it.

> **Reconciled 2026-08-24.** Until this date the project kept deferred work in **three registers that
> disagreed with each other**, and the disagreement ran in both directions:
>
> - `ROADMAP.md` held twelve open `999.x` items. **Zero of them appeared in this file.**
> - This file held ~31 items, including `MIG-01` — which the v1.3 milestone audit's carry list
>   **omitted entirely**, despite it defeating that milestone's own "recoverable deployment" goal.
> - `milestones/v1.3-MILESTONE-AUDIT.md` closed with *"Carried into the next milestone — tracked in
>   `BACKLOG.md`, nothing blocking"* and named seven items. **Four of the seven were not in this
>   file** (`CR-01`, `D-45-02`, `D-45-03`, `D-45-04`), it **missed `D-45-01`** which the same phase
>   recorded, and one of the seven — `D-45-03` — **had already been resolved by measurement six days
>   before the audit was written**, so the carry list also carried a phantom.
>
> All three are now merged here. The `999.x` entries were moved from `ROADMAP.md` verbatim, with
> their evidence intact; `ROADMAP.md` keeps only the promotion decision. **This file is the register;
> the ROADMAP is the schedule.**
>
> This is the failure mode this file's own Phase 40 section names: *"a finding that lives only in a
> phase artifact is a finding nobody will read again."* It had claimed three victims.

## Index

Status legend — **v1.4** promoted for scoping · **recorded** real but deliberately not scheduled ·
**accepted** a decision, not work · **closed** fixed or disproven, kept for history.

| ID | Item | Status |
|---|---|---|
| **MIG-01** | `drizzle-kit migrate` cannot build a fresh database | **v1.4** — tier 1 |
| **WR-04** | View export reachable by any authenticated non-admin | **v1.4** — tier 1 |
| **PERF-01** | `/deals` renders every deal on a pipeline, unpaginated | **v1.4** — tier 1 |
| **F-39-08** | Enter inside a modal navigates the list behind it | **v1.4** — tier 2 |
| **F-39-07** | 320px reachability — no height clamp on dialogs or popovers | **v1.4** — tier 2 |
| **CR-01** | Purge leaves file attachments on disk and downloadable | **v1.4** — tier 2 |
| **STATS-01** | `/activities` stats row states counts it cannot know | **v1.4** — tier 2 |
| **FORM-01** | Merge never recalculates the survivor's own formula fields | **v1.4** — tier 2, dormant |
| **999.13-999.23, 999.28** | The twelve former ROADMAP items | **v1.4** — tier 3 |
| **D-45-01** | `toggle.test.ts` intermittent `beforeEach` timeout | **v1.4** — fold into `999.28` |
| **D-45-02** | `ShortcutsHint` bar occludes actionable controls | **recorded** |
| **D-45-04** | Admin drawer has no swipe-to-dismiss | **recorded** — needs `vaul`, and a doc fix |
| — | Hydration mismatch on three list pages swallows clicks | **recorded** |
| — | Scan-guard atomicity (needs migration 0018) | **recorded** |
| — | e2e auth setup flaky; cold login exceeds the 30 s timeout | **recorded** |
| — | Four copies of the CSV download idiom | **recorded** — blocked on a Phase 38 gate |
| — | Three private brace/tag walkers, one with a latent bug | **recorded** |
| — | `ICU_PLURAL_KEYS` has no completeness gate | **recorded** |
| — | Two list surfaces not internationalised at all | **recorded** |
| — | `replay.confirmBody` over-states a dry run's consequences | **recorded** |
| — | `audit.run.action.merged` untranslated but reachable | **recorded** |
| — | Merge loser's timeline row renders an empty name | **recorded** — currently unreachable |
| — | `setViewDefault` returns `forbidden` where siblings return `failed` | **recorded** |
| — | Dead `view=<id>` persists in the URL on two surfaces | **recorded** — cosmetic |
| — | Locale-parity figures wrong in `40-UI-SPEC` / `40-CONTEXT` | **recorded** — doc drift |
| — | `40-UI-SPEC` V-9 names the wrong helper | **recorded** — doc drift |
| — | Soft-deleted users' private views are unreachable | **accepted** |
| — | `/deals` pipeline-only views are saveable but not exportable | **accepted** |
| **D-45-03** | `/deals` pipeline select empty label in dark mode | **closed** — disproven 2026-08-18 |
| — | `/activities` accepted three filters that narrowed nothing | **closed** — by plan 40-13 |
| — | CSV formula injection | **closed** — fixed 2026-08-22 |
| **999.24** | CSV export dropped all custom-field columns | **closed** — Phase 34, plan 34-13 |
| **999.25-27** | Three custom-field UI defects | **closed** — promoted to Phase 44 |

---

# Register

## From Phase 39 (Duplicate Detection & Merge)

### F-39-07 — a 320px user cannot get past the duplicate advisory — **PROMOTE → v1.4, tier 2**

> **Phase 45 did NOT close this, despite doing a 320px pass.** Verified 2026-08-24:
> `src/components/ui/dialog.tsx` has **zero** `max-h` or `overflow` matches, and
> `e2e/viewport-320.spec.ts` asserts only `document.documentElement.scrollWidth <= clientWidth`.
> **The suite Phase 45 built reproduced the exact blind spot this entry warned about** — see the
> last paragraph below, written before that suite existed.

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

### `popover.tsx` never consumes Radix's available-height, so filter popovers already overflow at 320px — **PROMOTE → v1.4 with F-39-07**

> **Re-verified 2026-08-24:** `src/components/ui/popover.tsx` still has zero `max-h`,
> `overflow` or `available-height` matches.

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

### F-39-08 — Enter inside a modal navigates the list behind it — **PROMOTE → v1.4, tier 2**
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

## MIG-01 — the deployment cannot be built from its own migrations

### `drizzle-kit migrate` cannot build a fresh database — **PROMOTE → v1.4, tier 1**

> **Re-verified 2026-08-24 by running it, not by reading it.** Against an empty scratch database:
> `PostgresError: relation "import_sessions" does not exist` / `code: '42P01'` on
> `ALTER TABLE "import_sessions" ADD COLUMN "user_id";` — migration `0006`. Drizzle wraps the run
> in a transaction, so the failure rolls everything back and **the fresh database ends up with 0
> tables**, not a partial schema. Across all 20 migrations `import_sessions` is only ever `ALTER`ed
> (`0006`) and referenced by a foreign key (`0014`) — **no migration creates it**.
>
> **The section heading used to read "belongs to Phase 43". Phase 43 shipped on 2026-08-24 and this
> is still broken.** What Phase 43 delivered was a *dump-restore* runbook, exercised against a real
> 34 MB dump — which works only for someone who already has a dump from a running install. A new
> self-hoster still cannot bootstrap this product from the repository. v1.3's headline claim was
> "the deployment became recoverable"; against the migration chain, it is not.
>
> **It is also absent from the v1.3 milestone audit's carry list entirely** — the one register that
> was supposed to hand v1.3's residue to the next milestone never mentioned it.

**This directly blocks Phase 43's stated goal, "a self-hoster can recover their data."** A
self-hoster cannot bootstrap from the migration chain today.

An early migration runs `ALTER TABLE "import_sessions" ADD COLUMN "user_id"` against a table that
**no migration ever creates** — it arrived via `db:push`. A clean `migrate` therefore dies with
`42P01`. Found by plan 39-10, which is why its test database had to be provisioned from a
`pg_dump --schema-only` of the dev database rather than from migrations
(`scripts/dedup-db-test-setup.sh`).

~~Raise this in Phase 43's discuss step; do not let it be rediscovered.~~ Phase 43 shipped without
addressing it. Promoted to v1.4 as **MIG-01**, tier 1.

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

### 10. PERF-01 — `/deals` renders every deal on the selected pipeline, with no pagination — 88 seconds on the busiest board — **PROMOTE → v1.4, tier 1**

> **Re-verified 2026-08-24:** the Closer pipeline holds **15,415** deals today, and
> `src/app/deals/page.tsx` still has no `limit` — every row is pushed into `dealsByStage`. Figures
> below unchanged.

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

### 12. F-39-08 is NOT contained — Enter on a focused button inside a modal navigates the list behind it, discarding the draft — **PROMOTE → v1.4, tier 2**

> **Re-verified 2026-08-24:** the `test.fail()` marker is still live at
> `e2e/saved-views-320.spec.ts:980`, byte-unchanged. Delete it in the same commit as the fix.

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

### FORM-01 — merge never recalculates the SURVIVOR's own formula fields (phases 39 x 34 seam) — **PROMOTE → v1.4, tier 2**

**Filed 2026-08-24 by the v1.3 cross-phase integration audit.** Priority: medium, but **dormant
today** — see below. This defect could not have been caught by either phase's own verification,
because it lives exactly at their shared seam: phase 34 built formula reactivity, phase 39 built
merge, and each verified its own half.

**The asymmetry.** An ordinary entity edit always recalculates formulas — `src/lib/mutations/
organizations.ts` carries a dedicated "Formula recalculation helpers (D-01 / D-03 / D-17 / T-34-04)"
section and calls `recalculateFormulas` on every save. A **merge** does not. `src/lib/mutations/
dedup.ts:641` calls only `recalcReparentedChildren` — a documented one-hop refresh for the child rows
that MOVED from loser to survivor. Nothing recalculates the **survivor itself**, even though a merge
writes the survivor's field values from the user's merge choices, which is precisely the input a
formula depends on.

So: edit a field by hand and its dependent formulas update. Take that same field's value from the
loser during a merge and they do not.

**Why it is dormant, and exactly when it goes live.** Verified against the live database
2026-08-24:

```
select count(*) from custom_field_definitions where type='formula';  ->  0
```

There are no formula field definitions on any entity, so there is currently nothing to be stale. It
becomes a live data-correctness bug the moment an admin adds a formula field to Organizations or
People **and** someone merges two records whose inputs to that formula disagree. The survivor then
carries a formula value computed from its pre-merge inputs, silently, with no error and nothing in
the audit log to indicate the value is stale.

**Why this was not already tracked.** It is absent from STATE.md's known-limitations list and from
this backlog. Both phases passed their own verification legitimately — neither was wrong about its
own scope.

**Fix shape.** After the merge transaction commits, recalculate the survivor the way an ordinary edit
does, alongside the existing `recalcReparentedChildren` call. Note the constraint the file already
documents at `dedup.ts:631`: `recalculateFormulas` and its cascade use the module-level `db` and
cannot be handed a `tx`, so this must run POST-commit, not inside the transaction. The existing
post-commit block at `dedup.ts:629-650` is the right place, and it already try/catches and logs
through `log.error("dedup-merge", ...)`.

**Test it can fail:** create a formula field on Organizations, create two orgs whose formula inputs
differ, merge them taking the loser's input value, and assert the survivor's stored formula value
matches a fresh computation. Without the fix that assertion should fail.

### The live export test guards a path nobody runs (phase 40 G-1, residual sub-item)

**Filed 2026-08-24 during the v1.3 milestone audit.** Priority: medium — it is not a defect today, it
is the *absence of a signal*.

`src/lib/export/formatters-live.test.ts` is the only live-database proof of the export path. It is
**skipped in every normal run** (it reports as part of the suite's 24 skipped) and **CI never runs it**,
because CI has no `DATABASE_URL`. So the milestone's headline "4605 passed" says nothing at all about
the code this file exists to guard.

This is not hypothetical. The file's own header records why it exists: a wholly-mocked suite once
passed a malformed drizzle fragment in Phase 37. And it has already gone red silently once — the WR-05
fix (`7f8982e`) narrowed the `pending` predicate, changed the live count from 4,165 to 14, and broke
the two-way-partition assertion. The fix note said the file "was not relied on as a gate", which is
exactly why the breakage went unseen until phase 40's verification found it. Its assertion has since
been corrected to the three-way partition and it passes 24/24 today, but nothing stops the same thing
happening again.

**Verified 2026-08-24:** passes 24/24 against the live database. The invocation matters —
`.env`'s `DATABASE_URL` is `postgresql://…@postgres:5432`, the Docker-internal hostname, which fails
from the host with `getaddrinfo EAI_AGAIN postgres`. From the host, use `@localhost:5433`:

```bash
DATABASE_URL="postgresql://<creds>@localhost:5433/pipelite" \
  npx vitest run src/lib/export/formatters-live.test.ts
```

**Options, cheapest first:**
1. A documented npm script (e.g. `npm run test:live`) so the invocation is discoverable rather than
   folklore. Does not make anyone run it, but removes the "I did not know how" excuse — and would have
   saved this audit the `EAI_AGAIN` detour.
2. A CI job with a Postgres service container and a seeded database. Real infrastructure work: the
   suite asserts against live row counts (79,022 activities), so a seeded CI database would need
   either different assertions or a restored dump.
3. Rewrite the assertions to be shape-based rather than count-based, so they can run against any
   non-empty database. Loses some of the point — the counts are what caught WR-05.

**Deliberately not fixed during phase 43**: giving CI a database is an infrastructure decision, not a
drive-by edit on the last day of a milestone.

### WR-04 — export authorization is materially weaker than before Phase 38's gate — **PROMOTE → v1.4, tier 1**

> **Re-measured 2026-08-24 against the live database: unchanged.** `search=a` matches **44,254 of
> 46,054** organizations (96.1%), under `EXPORT_ROW_CAP = 50_000`. `view-export-guard.ts` is 139
> lines with no admin branch and no selectivity rule.
>
> **The verifier's judgement below was overridden and the milestone shipped.** It reads: this
> "*should* block milestone close and any deployment where non-admins are not trusted with the whole
> customer table." `v1.3-MILESTONE-AUDIT.md` carried it as item 3 of seven under the heading
> **"nothing blocking"** and v1.3 shipped 2026-08-24. That override should be confirmed as
> deliberate rather than inherited.

**Where:** `src/lib/export/view-export-guard.ts`, `src/lib/views/export-action.ts`
**Status:** **STILL OPEN — now DETECTED, not PREVENTED.** 2026-08-22: the user chose visibility over
a bound. `src/lib/audit/export-events.ts` writes one `audit_log` row per completed view export
(who, which entity type, which filters, how many rows), wired into `exportViewResults` after the
fetch, and `"export"` was added to `AuditEntityType` and to the `/api/v1/audit` filter whitelist.

**The exposure below is UNCHANGED.** A non-admin can still export 44,254 of 46,054 organizations
through `search=a`; the export is now attributable rather than impossible. Do not close this entry
on the strength of the audit row — the four candidate fixes at the bottom are all still unbuilt.
Three residual gaps in the detection itself, each stated in the code:

  1. `recordExport` swallows its own failure (the import-summary precedent), so an export whose
     audit write fails is an unlogged export. Loud in the log, not silent — but not prevented.
  2. A REFUSED or CAPPED attempt writes no row, so this is evidence of exports, not of probing.
  3. There is no UI and no alert. `/admin/audit` is the retention settings page and lists no rows;
     these rows are readable only by querying `/api/v1/audit?entity_type=export`. Nobody is
     notified — someone has to go looking.

Also unchanged: the bulk export actions from Phase 38 (`exportSelectedOrganizations` and its three
siblings) write no audit row. Only the view export path — the one Phase 40 widened — is instrumented.

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

### ~~CSV formula injection, pre-existing, but the audience widened (review IN-06)~~ — FIXED 2026-08-22

**FIXED.** `neutraliseCsvInjection` in `src/lib/export/formatters.ts` prefixes an at-risk cell with
an apostrophe, applied to every row inside `exportToCSV` — the one choke point all four entity
exports share, so both the view path and the four bulk paths are covered. Gated by
`src/lib/export/__tests__/csv-injection.test.ts` (10 tests).

The one subtlety worth keeping: a string that parses WHOLLY as a finite number is exempt, because
the naive rule turns every negative number in the file into text in Excel. The parse is `Number()`
and not `parseFloat()` — `parseFloat("-2+3+cmd|'/C calc'!A0")` returns `-2` and would wave the
documented bypass straight through. Both cases are asserted.

Not covered: `exportToPipedriveCSV` in `src/lib/export/pipedrive.ts` is a separate serialiser and
was left alone — it is a format conversion for re-import, not a file handed to a spreadsheet.

**Original finding, for the record:**

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

---

## Phase 41 — one copy inaccuracy left open by the review-fix pass

### `replay.confirmBody` promises side effects a test-run replay no longer has

**Where:** `src/messages/{en-US,pt-BR,es-ES}.json` -> `workflows.replay.confirmBody`, consumed by
`src/app/workflows/[id]/runs/[runId]/components/replay-run-button.tsx`
**Status:** OPEN, low severity, and mitigated in the safe direction.

The confirm copy tells the operator that replaying re-runs from node 1 and therefore re-sends emails
and repeats CRM writes for steps that already succeeded. That was true when 41-13 wrote it. Then the
review-fix pass closed CR-01, so **a replay of a dry run is now itself a dry run** — for that case the
copy over-states consequence.

**Why it was not fixed in the fix pass:** it needs a new locale key, and the `workflows` contract is
TOTAL (`REQUIRED_WORKFLOWS_KEYS` is compared with an exact `toEqual`), so a key cannot be added
without also adding it to that array and to all three locales. The fixer declined to invent one
silently, which was the right call.

**The fix, fully specified:** add `workflows.replay.confirmBodyDryRun` to `REQUIRED_WORKFLOWS_KEYS`
and all three locale files in the same commit, and select between the two bodies on `run.dryRun`. No
literal `{` or `}` in the value — next-intl reads `{` as a placeholder delimiter and throws at render.

**Why it is not urgent:** the run detail page is already badged "Test run", and copy that over-states
consequence makes an operator more cautious than necessary rather than less. The dangerous direction
would have been the reverse, and that is what CR-01 fixed.

---

## Found by browser witnessing, 2026-08-22 (Phase 40 debt cleared during the Phase 41 run)

### STATS-01 — the `/activities` stats row asserts counts it cannot know, and they are wrong — **PROMOTE → v1.4, tier 2**

**Where:** `src/app/activities/activities-client.tsx:270-277`, fed by `src/app/activities/page.tsx`
**Severity: a user-facing false statement**, not merely a cosmetic gap.
**Status:** OPEN. Found by driving a real browser — the check existed *because* nobody had looked at
this screen, and looking found this.

The three stats are computed CLIENT-SIDE by filtering the `activities` array, which `page.tsx` has
already capped at `PAGE_SIZE * pageNum` (50). So they are page statistics rendered as if they were
totals, with no qualifier:

| filter | stats row shows | SQL truth |
|---|---|---|
| none | `Completed:50` `Pending:0` `Overdue:0` | 74,857 / 14 / 4,151 |
| Pending | `Completed:0` `Pending:14` `Overdue:0` | 14 pending — correct, but only because 14 < 50 |
| Overdue | `Completed:0` `Pending:0` `Overdue:50` | 4,151 |

Unfiltered, the row **asserts there are zero pending and zero overdue activities** when there are 14
and 4,151. `Completed: 50` and `Overdue: 50` are the page cap, not counts. No total is displayed
anywhere on the page, so a user has nothing to sanity-check against and the three numbers never sum
to 79,022.

**This is the same defect shape already recorded above** for `/activities` date filtering running in
JavaScript after the pagination slice — that entry predicted "any surface applying a JS filter after a
limit has the same defect shape. Worth a sweep." This is that sweep finding its second instance, in
the same file.

**What is NOT wrong:** Phase 40's WR-05 filter fix is correct and visible. Selecting Pending yields 14
rows rather than the old ~4,165, and the three buckets really are exclusive at the query level
(74,857 + 14 + 4,151 = 79,022, verified). The filter means what it now claims to mean. Only the stats
row lies.

**Fix shape:** three `count(*)` queries (or one grouped aggregate) computed server-side alongside the
page query, passed down as props. Do not compute a total by summing what is on the page.

### `run-changed-records.tsx` can render a `merged` action with no translation

**Where:** `src/app/workflows/[id]/runs/[runId]/components/run-changed-records.tsx`
**Status:** OPEN, currently unreachable, flagged rather than fixed.

`ACTION_BADGE_VARIANT` is an exhaustive `Record<AuditAction, …>` and therefore maps `merged` — but
`audit.run.action` in the message catalogs carries only `created`, `updated` and `deleted`. A `merged`
audit row surfacing on a run page would hit a missing translation key. No workflow action currently
produces a `merged` audit row, so it is not reachable today; the exhaustive map is what makes it a
latent trap rather than a compile error.

Note the interaction with the phase-41 locale contract: adding `audit.run.action.merged` requires
adding it to the relevant `REQUIRED_*_KEYS` array in the same commit, or the exact-contract `toEqual`
fails.

---

## Imported from the v1.3 milestone audit's carry list, 2026-08-24

These lived only in archived phase artifacts. The audit named them and said they were "tracked in
`BACKLOG.md`" — they were not. Each was re-verified against the tree at `a58b9e1` before import.

### CR-01 — a purge leaves the record's file attachments on disk and downloadable — **PROMOTE → v1.4**

**Where:** the four `purge*Mutation` teardowns (`src/lib/mutations/{deals,people,organizations,activities}.ts`)
and `src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts`
**Source:** `37-REVIEW.md` § Critical Issues. **Re-verified 2026-08-24 — still open.**

The ordered teardown handles notes, join rows, FK detachments and the row itself. It does **not**
touch uploaded files. File custom fields store bytes at `${UPLOAD_DIR}/${entityId}/${fieldName}/${storedName}`
and are referenced only from the record's `customFields` JSONB, so a purge deletes the *reference*
while the *blob* survives. Three consequences, worsening:

1. Storage grows monotonically with every purge — the retention pruner is a leak generator.
2. The file route authorizes on `session?.user` **alone, with no record lookup** (verified unchanged
   2026-08-24). Anyone who ever held the URL can still download the file after an admin was told
   "*{name} and its notes will be permanently deleted. This can't be undone.*"
3. The URL does not even have to have been kept: the soft-delete tombstone diffs the whole pre-delete
   row including `customFields`, and purge deliberately preserves prior `audit_log` rows — so the path
   to a "permanently deleted" record's attachments is recoverable from the audit log by any admin,
   indefinitely.

**Half of this was already fixed, which is why it reads as closed and is not.** `src/lib/trash/prune.ts:66-73`
now documents the gap honestly ("NOT COVERED — UPLOADED FILE BLOBS ARE NOT REMOVED"), replacing the
comment that used to assert the opposite. The *documentation* defect is closed; **the leak and the
record-less file route are untouched** — no `deleteEntityFiles` or `collectFileFieldRefs` helper
exists anywhere in `src/`.

**Fix shape**, from the review, unchanged: collect the file refs from `customFields`, delete them
**after** the transaction commits so a storage failure cannot roll back a committed purge, and log a
count mismatch. Independently of that, tighten the file route to resolve the entity before serving —
that alone closes consequences 2 and 3 even while blobs remain on disk.

### D-45-01 — `toggle.test.ts` intermittently times out its `beforeEach` — **PROMOTE → v1.4, folded into 999.28**

`src/lib/execution/toggle.test.ts` fails `Hook timed out in 10000ms` at `:61` under parallel workers —
**2 of 5** consecutive `npm run test` runs — while passing in 6.57 s in isolation, that one test taking
3.75 s of vitest's 10 s default `hookTimeout`.

**Absent from the audit's carry list**, though Phase 45 recorded it in the same document as D-45-02/03/04.
It is the same class as `999.28` (`condition-evaluator.test.ts`, T-34-20): a wall-clock margin that
fails under vitest's own workers and passes alone. Phase 45's own note says to **fix the two together**
and explicitly warns *"do not chase either one per-phase."* Scope them as one item.

### D-45-02 — the fixed `ShortcutsHint` bar occludes actionable controls — recorded

`ShortcutsHint` renders as a fixed bottom bar and nothing reserves vertical space for it, so it sits
on top of page content. Dark `/admin/audit` at 1280x900: it clips the sidebar's **Back to App**
button. `/admin/audit` at 320x640 in **es-ES**: it wraps to two lines and covers **"Guardar período de
retención"** — the save control for the retention setting.

Vertical occlusion, so it fell outside Phase 45's SC-1 (horizontal overflow) and predates it.
**Suggested fix, from the phase:** Phase 38 solved the identical class for the bulk action bar with an
`h-40 sm:h-20` spacer that reserves the bar's height in normal flow. **Validate at 320px in es-ES** —
that is where the bar wraps and the occlusion is worst; an en-US desktop check will not be enough.

Recorded rather than promoted because it hides a control without making anything untrue, and the
remedy is a known one-line pattern that any phase touching the global shell can absorb.

### D-45-04 — the admin drawer cannot be dismissed by swiping — recorded, and it carries a documentation fix

Found on a real phone, 2026-08-18 — the one item from `45-VALIDATION.md`'s manual table that did not
pass. This is an **unimplemented capability, not a regression**: `src/components/ui/sheet.tsx` wraps
Radix `Dialog`, which has no gesture layer, and `vaul` is not a dependency. Nothing removed it; it was
never there. The drawer has four working dismissal paths (overlay tap, close button, navigation, Escape).

**The more useful half of this item is the document defect it names.** `45-VALIDATION.md` instructed a
human tester to verify swipe-dismissal without anyone checking whether the chosen primitive could do
it — so it promised a capability the implementation never had and could not acquire without a new
dependency. **A manual test that asserts an un-implementable behaviour fails forever and teaches the
team to discount manual results.** When `45-VALIDATION.md` is next revised that row should be
corrected, not silently dropped. Fix that whether or not swipe is ever built.

### D-45-03 — `/deals` pipeline select renders an empty label on dark — **CLOSED, disproven 2026-08-18**

Recorded here only because **the v1.3 milestone audit's carry list lists it as open and "UNCONFIRMED,
needs a human look"** — it was already resolved six days before that audit was written, by direct
measurement in a real Chromium at 1280x900 in both themes: one `[data-slot="select-trigger"]`,
`innerText` `"BDR - Base Fria"`, boundingBox 200x36, **identical in light and dark**. The original
observation was a capture-timing artefact — `/deals` populates its pipeline list from a client
component and the screenshot preceded settle. No code change was needed or made.

It also **rules in** 45-11's `min-w-0 max-w-full` addition to that trigger: the class is present in the
measured `class` attribute and the label renders anyway.

Do not re-investigate. If the carry list is ever used as a work source, this row must be struck.


---

## Moved from ROADMAP.md, 2026-08-24 — the former `999.x` register

These twelve entries were the ROADMAP's own capture log and had **zero overlap** with the rest of this
file. They are reproduced verbatim, including the re-verification notes added during the 2026-08-24
review. The trailing history of items 999.1-999.27 is kept with them.

**999.13 — Proper fix for the React Compiler lint findings** (captured 2026-08-14, Phase 32) — **PROMOTE → v1.4**

> **Re-verified 2026-08-24 and the register drifted.** Still six suppressions, but not the five
> captured below: `src/app/import/import-wizard.tsx:91` (`preserve-manual-memoization`) is **gone**,
> and two new `react-hooks/exhaustive-deps` suppressions have appeared at
> `src/components/ui/entity-combobox.tsx:96` and
> `src/app/workflows/[id]/edit/components/config-forms/webhook-response-config.tsx:39`. The other
> four rows in the table below are unchanged and still live. **The Suppression Register in
> `32-04-SUMMARY.md` is therefore out of date** — re-derive the set with the grep at the end of this
> entry rather than trusting either document.

Phase 32 suppressed five `react-hooks/*` errors with scoped `// eslint-disable-next-line <rule> -- <reason>`
comments per D-02. The rules remain at `error` severity project-wide, so a sixth occurrence still fails CI —
but these five need a real refactor in a UI-focused phase that has UI test coverage (per 32-CONTEXT.md
§ Deferred Ideas). Full written justification for each is in `32-04-SUMMARY.md` § Suppression Register:

| # | File:Line | Rule |
|---|-----------|------|
| 1 | `src/app/(auth)/reset-password/page.tsx:42` | `react-hooks/set-state-in-effect` |
| 2 | `src/app/(auth)/verify-email/page.tsx:20` | `react-hooks/immutability` |
| 3 | `src/app/settings/profile/profile-settings-form.tsx:38` | `react-hooks/set-state-in-effect` |
| 4 | `src/components/ui/relative-time.tsx:17` | `react-hooks/set-state-in-effect` |
| 5 | `src/app/import/import-wizard.tsx:91` | `react-hooks/preserve-manual-memoization` |

Each is behaviour-adjacent (auth error UX, single-use token fetch, hydration guard, wizard step
transitions), which is why none was mechanically "fixed" inside an infrastructure phase.
Grep the live set with `grep -rn 'eslint-disable-next-line react-hooks/' src/`.

**999.14 — Dockerfile pins `node:20-alpine`, below vite 7's engines floor** (captured 2026-08-14, Phase 32) — **PROMOTE → v1.4**

> **Re-verified 2026-08-24:** `node:20-alpine` is pinned at **all three** build stages
> (`Dockerfile:2` deps, `:10` builder, `:74` runner) — a fix has to change all three, not one.

`vite@7.3.1` declares `engines: ^20.19.0 || >=22.12.0`, reached transitively via vitest. The image tag
currently resolves to something >= 20.19 (the container builds today), so this is latent rather than broken.
CI pins Node 24 and does not inherit the Dockerfile's tag. Resolution: raise the base image, or pin the
patch explicitly so a future `node:20-alpine` rebuild cannot drift below the floor.
Source: `32-RESEARCH.md` Open Question 4 / Pitfall 6.

**999.15 — `GET /api/v1/stages/:id` returns 403 to the legitimate owner** (captured 2026-08-14, Phase 32) — **PROMOTE → v1.4**

> **Re-verified 2026-08-24 — still open, with the exact mechanism.** `src/app/api/v1/stages/[id]/route.ts:60-62`
> builds `const withOptions: StageWith = expand.has("pipeline") ? { pipeline: true as const } : undefined`,
> so the relation is simply **not loaded** on a bare request. Line 74 then rejects on
> `!stage.pipeline || stage.pipeline.ownerId !== ctx.userId || stage.pipeline.deletedAt` and returns
> `Problems.forbidden()`. Note the file already carries an `ownershipWith` helper (line 35) that loads
> the relation unconditionally for the PUT/DELETE paths — **the GET is the one path that does not use
> it**, which is both the bug and the shape of the fix.

The ownership check reads `stage.pipeline`, which is only loaded when `?expand=pipeline` is passed, so a
request without that query parameter fails authorization for the resource owner. Found by plan 32-03 and
deliberately left unchanged there because T-32-10 required that plan's typing work to be behaviour-neutral.
This is a real pre-existing auth bug, not a typing artifact — fixing it changes runtime behaviour and needs
its own test. See `32-03-SUMMARY.md` § Decisions Made.

**999.16 — npm advisories in the committed lockfile (39 at capture, 38 today)** (captured 2026-08-14, Phase 32) — **PROMOTE → v1.4**

> **Re-measured 2026-08-24: 38, not 39** — 3 low, 9 moderate, **22 high**, **4 critical**
> (`npm audit --json`). One high dropped off since capture; the criticals are unchanged. The count is
> not the point and should be re-measured at plan time rather than trusted from this line — the
> decision the item asks for (triage, then whether an audit gate or an `.npmrc` policy belongs in CI)
> is unaffected by the drift.

`npm ci` reports 39 vulnerabilities (3 low, 9 moderate, 23 high, 4 critical). CI-04 does not ask for an
audit gate, and adding `npm audit --audit-level=high` to `ci.yml` would make the required check red on day
one, so it was deliberately not bolted on. Resolution: triage the criticals/highs, then decide whether an
audit step or a `.npmrc` audit policy belongs in CI.

**999.17 — SECURITY: `/api/v1/activities` has no ownership check (IDOR)** (captured 2026-08-14, Phase 32) — **PROMOTE → v1.4**

> **Re-verified 2026-08-24 — still open, and nothing has been added.** The only `ownerId` references
> in either route file are a **user-supplied `owner_id` query filter** (`route.ts:50,61-62`, optional,
> so an unfiltered list still returns every user's activities) and the **PUT that writes it**
> (`[id]/route.ts:188-190`, confirming the reassignment vector). There is no authorization check on
> any of GET / PUT / DELETE. Compare `pipelines/[id]/route.ts`, which does check `ownerId`.

`src/app/api/v1/activities/[id]/route.ts` GET/PUT/DELETE and `src/app/api/v1/activities/route.ts` GET
perform **no ownership check at all**. Any valid API key can read (`[id]:80-116`), modify
(`[id]:126-216`, **including reassigning `owner_id`**) or soft-delete (`[id]:226-237`) *any* user's
activity by id, and the list endpoint returns every user's activities. Compare `pipelines/[id]`,
which does check `ownerId`. Pre-existing — Phase 32's diff only retyped `withOptions` — but surfaced
by the Phase 32 code review, and **more severe than anything found in the phase itself**. These six
route files have zero test coverage, so add tests with the fix. Prioritise ahead of the cosmetic
backlog items. See `32-REVIEW.md` § "Pre-existing, out of diff scope".

**999.18 — `stages/route.ts` passes a JS array into a raw `sql` fragment** (captured 2026-08-14, Phase 32) — **PROMOTE → v1.4**

> **Re-verified 2026-08-24:** unchanged at `src/app/api/v1/stages/route.ts:73`.

`src/app/api/v1/stages/route.ts:73` uses ``sql`${pipelines.id} IN ${pipelineIds}` `` instead of
`inArray()`. Unreachable with an empty array today (guarded by `stageList` being non-empty) but
fragile — a future refactor removing that guard changes it from awkward to broken. Mechanical fix.

**999.19 — Pipedrive importer hardcodes stage type `"open"`** (captured 2026-08-14, Phase 32) — **PROMOTE → v1.4**

> **Re-verified 2026-08-24:** unchanged at `src/lib/import/pipedrive-api-transformers.ts:167`
> (`const type: "open" | "won" | "lost" = "open"`), with the union declared at `:43`.

`src/lib/import/pipedrive-api-transformers.ts:164-167` reads
`const type: "open" | "won" | "lost" = "open"` under a comment promising "Determine stage type based
on `rotten_flag` and `deal_probability`". The won/lost mapping was never implemented; Phase 32's
`let`→`const` change (L-06) removed the last hint that it is a placeholder. Deliberately deferred
from the Phase 32 fix pass — it is a product decision about Pipedrive stage mapping, not a
regression. Address alongside the import wizard's terminal-stage handling.

**999.20 — `npm run db:migrate` cannot reach the DB from the host** (captured 2026-08-14, Phase 33) — **PROMOTE → v1.4**

> **Re-verified 2026-08-24:** `.env.local:1` still reads
> `DATABASE_URL="postgresql://pipelite:pipelite@localhost:5432/pipelite"` — the wrong port. Postgres
> publishes on **5433**. Every phase since 33 that ran a migration paid this workaround, and
> `.planning/BACKLOG.md` records the same footgun biting the live export test from the host
> (`EAI_AGAIN postgres`), so fixing it closes two papercuts.

`drizzle.config.ts` reads `DATABASE_URL`. `.env` sets it to `postgres:5432` (the Docker-network hostname —
unresolvable from the host, fails `EAI_AGAIN`) and `.env.local` sets it to `localhost:5432` — the **wrong
port**, since Postgres publishes on **5433**. So the documented migrate command fails from the host and has
to be run with an inline `DATABASE_URL` override. Phase 33 worked around it without editing a tracked file.
Fix: point `.env.local` at `localhost:5433`. This will bite every future phase that runs a migration
(34, 35, 36, 37, 39, 40 all add schema). Cheap fix, high recurring cost if left.

**999.28 — `condition-evaluator` linearity gate is contention-flaky** (captured 2026-08-15, Phase 44) — **PROMOTE → v1.4**
`src/lib/execution/condition-evaluator.test.ts` › "resolveFieldPath — parsing is linear, not backtracking"
(Phase 34 **T-34-20**) asserts a **wall-clock ratio**, so it misfires whenever the machine is loaded. It
failed twice during Phase 44's parallel waves — once reported as `25.5 < 10` — while passing 70/70 in
isolation and in every serial run.

Not introduced by Phase 44 and deliberately not fixed there (editing a Phase 34 test from inside another
phase hides the signal). But a timing-ratio assertion is a false-failure generator in any parallel
execution, and a suite that cries wolf is how the three defects this phase repaired stayed invisible in the
first place. Fix: assert on operation **counts** or algorithmic shape rather than elapsed time, or mark it
serial-only.

**999.25, 999.26, 999.27 — PROMOTED to Phase 44 (2026-08-15)** (captured 2026-08-15, E2E verification of v1.3)
Three custom-field UI defects found by the browser end-to-end pass over the completed v1.3 phases:
999.25 (BLOCKER — no UI path to add a custom field to Deals), 999.26 (formula display one save behind),
999.27 (`#ERROR — Unknown field` on unset sources). Promoted together as **Phase 44: Custom Field UI
Repair** → requirements CFUI-01/02/03. Full diagnosis, reproduction steps and the
already-proven-working baseline live in `.planning/phases/44-custom-field-ui-repair/44-CONTEXT.md`.

**999.24 — RESOLVED (Phase 34, plan 34-13) — CSV export silently drops ALL custom-field columns** (captured 2026-08-14, Phase 34)
> Closed by `deriveCsvColumns` (`src/lib/export/csv-columns.ts`), which unions keys across all rows.
> Verified live 2026-08-15 on a 38,345-row People CSV export: 8 `custom_*` columns present,
> `custom_GSD Doubled = 100` carried correctly with row 1 blank for that column (the exact failure mode),
> and zero `[object Object]` in the file. Retained here for history.

`exportToCSV` calls `Papa.unparse(data, { header: true })`, and papaparse derives the header row from the
**first object only**. Any key absent from row 1 is omitted for every row. Measured on the live data: a
46,055-row organization export produced **zero `custom_*` columns**, even though **30,264 rows carry custom
field values**. Users exporting their CRM are silently losing every custom field unless the very first row
happens to populate them.

Pre-existing and affects **all** custom fields, not just formulas — Phase 34 did not cause it. But it means
Phase 34's SC-2 CSV half is **not observable on this dataset**: the unwrapping logic is correct (proven via
the JSON export, which shares `flattenCustomFields`), yet the columns never reach the file. Fix: compute the
header as the union of keys across all rows, or pass an explicit `columns` list to `unparse`. This is
arguably the most user-visible defect found in the milestone so far. See `34-11-SUMMARY.md`.

**999.23 — POST responses echo pre-recalculation formula values** (captured 2026-08-14, Phase 34) — **PROMOTE → v1.4**
The create mutations return the raw `.returning()` row, so a `POST /api/v1/{organizations,people,deals,activities}`
201 body carries the **un-computed** custom-field blob. The stored value, the emitted `crmBus` event and any
subsequent `GET` are all correct — only the create response is stale, and `PUT` has no such gap.

SC-1 is therefore satisfied ("a subsequent GET returns recomputed values"), which is why Phase 34 did not
chase it: folding the recalc into the return value would break two plan 34-02 assertions that compare the
result against a fixture, and weakening existing tests was forbidden. But it leaves an API inconsistency —
a client that trusts the 201 body sees different data than the same client re-reading the record. Decide
once for all four entities. See `34-07-SUMMARY.md`.

**999.22 — Condition builder UI has no field picker for bracket paths** (captured 2026-08-14, Phase 34) — **PROMOTE → v1.4**

> **Re-verified 2026-08-24:** no file under `src/app/workflows/` emits `customFields[` in any form —
> the picker still does not exist, and `condition-config.tsx` is where it would land.

Phase 34 plan 34-12 made `resolveFieldPath` accept bracket-quoted segments, so a workflow condition can now
reach `customFields["Previsão de início operação"]`. But the condition builder UI offers no picker that
emits that syntax — an operator has to hand-type both the bracket form and the exact accented field name,
with no autocomplete and no validation. So the capability exists at the engine level while remaining
effectively undiscoverable in the product. A field picker that emits the correct path is what stands
between the fix and it being usable without documentation. Pairs with 999.21.

Also from 34-12: **escaping is unsupported inside brackets** — a name containing the same quote character
used to delimit it stops the parser at the first match. The other quote style works around it; a name
containing *both* quote characters is unaddressable. None of the 169 live definitions hit this today.

**999.21 — Workflow conditions cannot address 90% of custom fields — ENGINE FIXED in Phase 34 (34-12), UI GAP REMAINS** (captured 2026-08-14, Phase 34) — **PROMOTE → v1.4**
`resolveFieldPath` splits a condition's field path on `.`, so any custom field whose **name contains a
space or punctuation is unreachable from a workflow condition**. Measured against the live DB:
**152 of 169 definitions (90%)** are affected — this dataset's field names are predominantly Portuguese
with spaces and punctuation (`Código Mãe`, `Previsão de início operação`, `CNPJ / CPF`,
`UUID UC (TYR Core)`, `Tem solução de solar?`).

Pre-existing and affects **all** custom fields, not just formula fields — Phase 34 did not introduce it and
explicitly scoped it out. But it materially limits Phase 34's SC-3: the formula value now normalises
correctly into the trigger envelope, yet in practice a workflow condition can only reach a formula field
whose name is a simple identifier. Fix needs a quoting/escaping syntax or an id-based field reference.
Worth prioritising — it silently makes a headline feature inapplicable to most of the real data.
See `34-05-SUMMARY.md`.

---

All 12 original backlog items (999.1-999.12, captured 2026-08-12 and 2026-08-13) were promoted
into v1.3 on 2026-08-13 and now live as Phases 32-43 above:

| Backlog item | Now |
|--------------|-----|
| 999.1 Formula reactivity | Phase 34 |
| 999.2 Bulk operations | Phase 38 |
| 999.3 Test infrastructure & CI | Phase 32 |
| 999.4 Database indexes | Phase 33 |
| 999.5 Notes & activity timeline | Phase 35 |
| 999.6 Audit log | Phase 36 |
| 999.7 Duplicate detection & merge | Phase 39 |
| 999.8 Saved views & shared filters | Phase 40 |
| 999.9 Trash & restore | Phase 37 |
| 999.10 Workflow operator affordances | Phase 41 |
| 999.11 Observability | Phase 42 |
| 999.12 Type-safety & deployment-docs polish | Phase 43 |

The evidence captured with each backlog item is preserved in the v1.3 requirement text
(`.planning/REQUIREMENTS.md`) — each category there names its originating backlog item.
