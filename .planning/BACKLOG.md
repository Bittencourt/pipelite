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
