---
phase: 39-duplicate-detection-merge
plan: 19
subsystem: testing
tags: [dedup, create-time-warning, playwright, e2e, gap-closure, observational-proof, uat]
gap_closure: true
closes_gaps: [D-39-01]

# Dependency graph
requires:
  - phase: 39-14
    provides: "the create-time advisory itself — `DuplicateWarning`, the three-member create result, `confirmDuplicate` (W-4), and the relabelled submit button this plan observes"
  - phase: 39-18
    provides: "`#org-identity-{index}` — the collection of the configured identity fields at create time, without which `draftHasIdentityValue` can never pass and this plan's RED is permanent"
  - phase: 39-08
    provides: "`readOrgIdentityFields`, fail-closed to `null` — the unconfigured degradation this plan asserts rather than assumes"
  - phase: 39-11
    provides: "`dedup.organization_identity_fields`, the `app_settings` row this plan captures, sets and restores"
  - phase: 39-21
    provides: "the admin picker's type filter; sequenced first so its UI landed inside the one image this plan rebuilds"
provides:
  - "`e2e/org-duplicate-warning.spec.ts` — the browser-observed proof of SC-1's organization half, four cases"
  - "the measured statement that the create dialog overflows a 320x640 viewport once the advisory renders"
  - "the measured statement that the list pages' document-level `enter` hotkey fires inside a portalled modal"
affects: [any future edit-time or importer-time organization duplicate check, any change to DialogContent's height behaviour]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "an absence assertion anchored on a positive fact that is EQUIVALENT to it under a stated rule, rather than on `toHaveCount(0)`: under W-2 an advisory keeps the dialog open and creates nothing, so `dialog closed + row committed` cannot be satisfied by a blank page, an error page or a redirect"
    - "a within-test positive control: assert the absence, then flip the single input that should cause it and require the presence, so the absence is shown to be CAUSED rather than merely observed"
    - "a fixture that proves its own precondition — the `app_settings` write is read back and asserted, because a silently-wrong setting would make the RED indistinguishable from the product defect"
    - "every teardown MUTATION before every teardown ASSERTION, so a failing leak check reports a leak instead of causing one"
    - "not-red measured against BOTH poles in the same DOM: equal to the dialog surface's computed colour AND unequal to the `text-destructive` required-field asterisk beside it"
    - "structural position via `compareDocumentPosition` + shared `closest('form')` instead of y-coordinates, immune to reflow"
    - "count parity taken on the population no e2e spec can touch (`name not like '[e2e]%'`) so it cannot be flaked by a sibling spec's in-flight fixture under Playwright's default two workers"

key-files:
  created:
    - e2e/org-duplicate-warning.spec.ts
  modified: []

key-decisions:
  - "W-4 is proven in its own test at a DECLARED 1280x900 context, not at the 320x640 project viewport, because the advisory makes the dialog 940px tall inside 640px with no scroll and the submit button is genuinely unreachable by pointer there — measured, and reported as a defect rather than absorbed"
  - "`Enter` is never this file's actuator: the list page's document-level `useHotkeys(\"enter\")` hijacks it inside the modal and navigates away with the draft unsaved"
  - "in-spec global `count(*)` parity was replaced by parity on non-`[e2e]` organizations plus marker-scoped leak assertions, because the full suite runs files on two workers and a sibling's fixture would be reported as this file's contamination"
  - "the identity label is resolved at RUNTIME from `custom_field_definitions` with `having bool_and(type = 'text')`, mirroring `isCollectableIdentityField`, so the spec configures a label that both exists here and is collectable"
  - "the seed's identity value differs from the typed one in CASE ONLY, so the advisory's distinguishing value is proven to be read off the matched record rather than echoed from the input"

metrics:
  duration: ~2h
  tasks: 2
  files-changed: 1
  rebuilds: 1
  completed: 2026-08-20
---

# Phase 39 Plan 19: Browser Proof of the Organization Create-Time Duplicate Advisory Summary

The organization create-time duplicate advisory is now **observed firing in a real browser**, and
observed NOT firing in the two configurations where it must not — closing gap D-39-01, the defect
that shipped once behind a green source gate.

## D-39-01 IS CLOSED — the observation, verbatim

| What GAP 1 required | Observed |
|---|---|
| the advisory appears | `role="alert"` inside `[data-slot="dialog-content"]`, absent before the submit and present after |
| inside the dialog, above the form | same `<form>` as `#name`; `#name` FOLLOWS it in document order; it is not an ancestor of it |
| not red | `lab(2.75381 0 0)` on `lab(100 0 0)` — identical to the dialog surface, and unequal to the `text-destructive` token measured in the same dialog at `lab(48.4493 77.4328 61.5452)`; no `destructive` class |
| nothing typed is lost | all five inputs retained their values, including the 122-character Notes paste and the identity value |
| each match shows a name | `[e2e] Dup Warning Alpha Distribuidora`, in an `<a href="/organizations/<the seed's full id>" target="_blank" rel="noopener noreferrer">` plus the sr-only "Open in a new tab" |
| + a distinguishing value | `E2E-CNPJ-77.888.999/0001-11` |
| + a reason | `Same name and the same identifying field` |
| exactly one match | one `<li>` — which is also the proof that the fixture name collides with none of the 46,054 real organizations |
| submit relabels | accessible name `Create anyway`, and no longer `Create Organization` |
| W-4 gets the user past it | the relabelled button committed the record; the second organization exists carrying the typed website, industry and identity blob; a fresh dialog session came back unwarned **with two matching rows in the database**, so it is the `dialogSessionKey` doing the work |

Plus two rules the plan did not ask for and the observation made available for free:

- **W-2 at the database.** On the warned submit, `count(*)` for the fixture name was **1** — the
  advisory *replaced* the create, it did not accompany it.
- **W-5.** Escape still dismisses the dialog and creates nothing, which is what establishes that a
  320px user shown an advisory is not trapped even though they cannot reach "Create anyway".

## The RED, and why it means something specific

Run against the still-stale pre-39-18 image (the plan's free RED, spent before the rebuild). All
three cases failed on the same locator and nothing else:

```
1) CONFIGURED + a matching identity value …
   Error: #org-identity-0 never rendered — the configured identity field is not collectable at
   create time, which is gap D-39-01 and makes the organization advisory unreachable
2) CONFIGURED + a different identity value …
   Error: #org-identity-0 never rendered, so this test cannot distinguish a different identity
   value from no identity value at all (D-39-01)
3) UNCONFIGURED …
   Error: the identity input did not appear once the setting was configured, so the absence
   measured above proves nothing about the setting
```

**It was not a selector, fixture or auth failure, and case 3 is the proof.** Case 3 ran the entire
unconfigured path GREEN against the stale image — the dialog opened, every native field rendered,
the identity input was correctly absent, the submit was processed, the record was **created**, the
success toast appeared, and the stored row carried no identity key — and only then failed at its
positive control. Auth, navigation, every selector, the fixture, the submit path and every database
assertion are therefore proven working by the red run itself.

## Anti-vacuity: how each absence is anchored

The objective's warning was that a blank page, an error page, a redirect and a dialog that never
opened all satisfy "the advisory is absent". None of those can satisfy these:

- **Cases 2 and 3** conclude "no advisory" from **the dialog CLOSING and the row being COMMITTED**.
  Under W-2 an advisory keeps the dialog open and creates nothing, so this is not a proxy for the
  absence of a warning — it is *equivalent* to it, and it is unreachable by a page that failed to
  render. Both also assert the submit button carried its un-warned label immediately beforehand.
- **Case 2** additionally requires `#org-identity-0` to be **present and filled** before the submit,
  so it cannot pass in the pre-fix product, which produces no advisory for every input there has
  ever been. Its two rows are then asserted to share the name and differ in identity value: the
  discrimination stated as data.
- **Case 3** ends with a positive control — set the setting, reload, require the input to appear —
  so the absence is shown to be *caused by the setting*.
- **Tests 2 and 3 now pass BESIDE a passing test 1.** That is what makes them discriminating rather
  than vacuous, and it is the thing that was not true before the rebuild.
- The advisory locator itself is checked at **count 0 before the submit and visible after**, in the
  same test, so it tracks the advisory specifically and cannot be satisfied by the success toast —
  which does carry `role="alert"`, measured, and is why the locator is scoped to the dialog.

## Two defects FOUND — reported, not fixed, both outside this gap

### F-39-07 — the create dialog overflows a 320x640 viewport once the advisory renders

Measured and logged by the spec on every green run:

```
[39-19] advisory showing @ 640px viewport: dialog height 940px, top -150px, bottom 790px;
        dialog overflow-y visible, max-height none, body overflow hidden.
```

`DialogContent` is `position: fixed`, centred by `translate-y-[-50%]`, with **no max-height and no
overflow**, while Radix locks `body` at `overflow: hidden`. So at the project viewport the footer is
below the fold and the header's close button is above it, with nothing that can scroll either into
reach. Playwright's own words: `element is visible, enabled and stable / scrolling into view if
needed / done scrolling / element is outside of the viewport`, retried for 30s.

**Consequence:** at 320x640 a user whose draft hits a certain duplicate **cannot press "Create
anyway"** and so can never create that record. Escape and the overlay still dismiss the dialog, so
they are not trapped — asserted, and that is the whole of the escape hatch.

This lands squarely on the phase's own locked rationale: UI-SPEC W-1 chose an inline advisory over a
nested dialog or a toast because "a second modal over a modal at 320px has nowhere to go", and the
inline advisory now produces the same condition by a different route.

**Not fixed, deliberately.** The fix is `max-h-[calc(100dvh-2rem)] overflow-y-auto` on
`DialogContent`, a shared primitive behind roughly sixteen dialogs, which is an architectural change
needing its own 320px regression matrix across all of them. Recommend a gap plan.

### F-39-08 — the list pages' `enter` hotkey fires inside a portalled modal

`src/components/keyboard/data-table-keyboard.tsx` registers
`useHotkeys("enter", …, { preventDefault: true })` **without a ref**, so the listener is on the
`document` and fires regardless of what is focused. Its only guard, `isFormFocused`, exempts
`INPUT`, `TEXTAREA`, `SELECT` and `contenteditable` — a focused **`BUTTON`** is not exempt.

So pressing `Enter` on the create dialog's submit button runs the *list page's* "open the selected
row" action, `preventDefault` suppresses the button's own activation, and the browser navigates to
`/organizations/<first row id>` **with the draft unsaved**. Observed directly: a run that pressed
Enter here landed on the seed record's detail page and created nothing.

For a keyboard user this is a W-2 violation by a different mechanism — the draft is destroyed by the
very key they used to confirm. Pre-existing, in a hook shared by six surfaces (`organizations`,
`people`, `deals`, `activities`, `admin/users`, `admin/pipelines`), and not phase 39 code. It is why
this spec activates the submit button by pointer click.

## Deviations from Plan

**Four, all recorded because the plan's predictions did not survive contact with the product.**

**1. [Prediction mismatch] Cases 2 and 3 were RED against the stale image; the plan predicted they
would PASS.** The plan reasoned they would pass vacuously and said so honestly. They do not pass,
and that is strictly better: each was given a positive anchor the pre-fix product cannot satisfy
(case 2 requires the identity input to exist and be filled; case 3 requires it to appear once
configured). Rather than relax them to match the prediction, the prediction is corrected here. All
three cases failing on `#org-identity-0` is the cleanest possible RED.

**2. [Plan defect] W-4 could not be observed at the 320x640 project viewport.** The plan's task 1
assertion (i) presses the relabelled button at the project viewport; F-39-07 makes that impossible
for a pointer. W-4 is a **behavioural** rule — does the confirmed submit skip the check and commit —
so it is proven in its own test inside a `test.describe` carrying
`test.use({ viewport: { width: 1280, height: 900 } })`, where the submit button is *asserted*
reachable (`submit bottom 805px` vs `900px`) before it is clicked, so a future failure explains
itself in one number. This does not violate the plan's "no viewport declaration and no mid-run
resize" rule in substance: `test.use` sets the viewport when the browser **context is created**, so
no `resize` event is ever dispatched, and the `@dnd-kit/core` drag-cancel hazard that rule exists to
prevent cannot occur. The 320px project viewport still governs the other three cases. A synthetic
`dispatchEvent("click")` at 320px was rejected: it would have proven the handler while asserting
nothing about the button a user presses, and would have hidden F-39-07.

**3. [Rule 3 - blocking] In-spec global `count(*)` parity replaced with concurrency-safe scoping.**
The plan asked `afterAll` to assert `count(*)` parity on `organizations`, `audit_log`,
`duplicate_pairs` and `dedup_scans`. `playwright.config.ts` sets `fullyParallel: false`, which
serializes tests *within* a file and distributes *files* across workers — the full suite really does
run on two, confirmed by the runner (`Running 33 tests using 2 workers`). `merge-screen-320.spec.ts`
inserts two organizations and a `duplicate_pairs` row in its own `beforeAll`, so a global count
captured here and compared there would report a **sibling spec's in-flight fixture** as this file's
contamination. A teardown assertion that fails when the teardown was perfect trains people to re-run
until it passes. Replaced with: parity on `organizations where name not like '[e2e]%'` (the 46,054
real ones — the thing actually worth protecting) and on `dedup_scans` (which nothing under `e2e/`
writes), plus **marker-scoped** leak assertions for everything this file can itself leave behind.
This is the posture `merge-screen-320.spec.ts` already takes. The global counts are reported below,
verified directly against the database outside the suite where no race exists.

**4. [Rule 2 - missing critical functionality] Teardown reordered: every mutation before every
assertion.** Learned here rather than reasoned about. The first version interleaved purge → assert →
restore, and the discrimination probe below made the leak assertion fail *before* the `app_settings`
restore ran — so the check that was verifying the teardown **stranded the identity setting** on the
shared database. A failing teardown assertion must report a leak, never cause one. `afterAll` now
purges and restores first, then measures, then asserts. The stranded row was cleaned by hand and the
reorder is what makes that unrepeatable.

**One addition, within the plan's own rationale:** the plan's purge covered `audit_log` and
organizations. It did not cover **`notes`**, and a create through the dialog writes one whenever the
Notes field is non-empty. Measured: an early run left `notes` at 75,237 against a baseline of 75,236.
`notes.entity_id` is polymorphic with no foreign key, so nothing at the database level catches it.
`purgeFixture` now deletes notes first and `afterAll` asserts zero notes carrying the fixture prefix.

Everything else was executed as written: no migration, no dependency change, no `shadcn add`, no
edit to any source file, one Docker rebuild.

## Discrimination Probe — RUN, not reasoned about

The one assertion added beyond the plan's list was verified against a deliberately reintroduced
defect, per the phase's standing rule that negative proofs must be run.

**Probe: `purgeFixture`'s notes delete pointed at a non-existent `entity_type`.** Result — 1 failure
of 4, by name:

```
✘ UNCONFIGURED: no identity input, no advisory, and the setting is what decides
  Error: notes written by this fixture were left behind — polymorphic entity_id has no
  foreign key to catch it
  expect(received).toBe(expected) // Object.is equality
```

The other three tests still passed, which is the point: the assertion is scoped to this fixture's
own marker and does not fire on a sibling's notes. The probe also exposed deviation 4 above.

The RED run is the second, larger piece of evidence: three of three cases failed, all on
`#org-identity-0`, which is D-39-01 stated as a browser fact.

## Verification

| Gate | Result |
|------|--------|
| `playwright test e2e/org-duplicate-warning.spec.ts` | 4 passed (+ setup) |
| `playwright test` (full suite) | **33 passed** — the 39-17 baseline of 29 plus this file's 4 |
| `playwright test` (four pre-existing specs alone) | 29 passed — baseline confirmed unchanged |
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors, 127 warnings (baseline 127, not above; **zero** from this file — `e2e/` is outside the lint scope, as for the other four specs) |
| `npm run test` | 128 files / 2743 passed, 1 file / 21 skipped; plus RSC project 2 files / 8 passed |
| `npm run test:db` | 1 file / 22 passed |
| `scripts/dedup-checks.sql` | **77 PASS, 0 FAIL** — plus the script's own EXPECTED-ERROR at 10c (`23505` on `notes_migration_uniq`), which the script states the run "is only correct if it appears", inside a `BEGIN/ROLLBACK` |
| `git diff --stat package.json package-lock.json` | empty |
| `git diff --stat .github/workflows/ci.yml` | empty; `grep -ci playwright ci.yml` → 0 |
| last migration / journal | `drizzle/0017_dedup_schema.sql`; journal ends at `idx: 17`; no `0018` |
| `git status --porcelain e2e/.auth/` | empty — no session token committed |
| `e2e/*.spec.ts` | exactly 5; no temporary capture spec left behind |

**Rebuild budget: 1 spent, against a budget of 1 with 2 as headroom.** The rebuild was verified to
have landed *before* the run was trusted — `identityFieldNames` and `collectableIdentityFieldNames`
both present in `/app/.next`, where the pre-rebuild image had neither.

**One flake observed and reported, not mine:** `e2e/auth.setup.ts` timed out on
`page.waitForURL` after 30s on two of eight full-suite invocations, and passed on the third with no
change to anything. It reproduces only when several spec files are distributed across two workers,
never on a single file, and it also failed before the four pre-existing specs on a run where they
subsequently passed 29/29. No rate limiting exists on the login path. Pre-existing harness
flakiness, worth a `retries: 1` on the setup project or a longer navigation budget.

## Database state — created, removed, and reported

Captured before and verified after every gate above, directly against `localhost:5433`:

| Table | Baseline | Final |
|---|---|---|
| `organizations` | 46,054 | **46,054** |
| `people` | 38,348 | **38,348** |
| `deals` | 25,195 | **25,195** |
| `notes` | 75,236 | **75,236** |
| `audit_log` | 213 | **213** |
| `duplicate_pairs` | 543 | **543** |
| `dedup_scans` | 1 | **1** |

**Created:** one seed organization per test (4 tests × reseed), plus the organizations the *product*
created during cases 1b, 2 and 3, plus the `notes` rows those creates wrote — all carrying the
`[e2e] Dup Warning` prefix. **Removed:** all of them. Final checks: zero organizations matching
`'[e2e]%'`, zero notes matching `'[e2e]%'`.

`audit_log` did **not** grow, and that is a measured product fact rather than luck: there is not one
`organization`/`created` row among the 213, so an organization create writes no audit row on this
deployment. The purge issues the delete anyway, so a subscriber that starts auditing creates cannot
silently start leaking past this teardown.

**`app_settings`:** captured as **absent** (zero `dedup%` rows, as 39-21 left it), set to
`["CNPJ / CPF"]` per test, and restored to absent. **Final count of `dedup%` rows: 0.** The restore
handles "the row did not exist" as a first-class case and is asserted, not assumed. This matters
beyond tidiness: 39-17 measured 543 `duplicate_pairs` with the setting configured versus ~405
without, so a stranded setting silently rewrites real feature state on the next scan.

`pipelite` was never `TRUNCATE`d, `DROP`ped, or subjected to an unscoped `DELETE FROM`. Every delete
was scoped to `name like '[e2e] Dup Warning%'`, to ids derived from it, to `content like '[e2e] Dup
Warning%'`, or to the single `app_settings` key this spec wrote itself — never to `'[e2e]%'`, which
would have reached `deals-drag.spec.ts`'s and `merge-screen-320.spec.ts`'s fixtures.

## Threat Register Outcome

| Threat | Outcome |
|---|---|
| `T-39G-07` fixture writes against the live dev database | **mitigated** — `openDb()` refuses any host but `localhost`/`127.0.0.1`; every delete scoped as above; `beforeAll`/`beforeEach` purge before inserting so a killed run is recoverable |
| `T-39G-08` `app_settings` left configured | **mitigated** — capture/set/restore with "absent" as a first-class case, asserted; and after deviation 4, the restore now runs before any assertion can abort it, which is the failure this threat actually manifested as |
| `T-39G-09` a credential in the spec or a token in git | **mitigated** — the session comes from the setup project's gitignored storageState; no credential is inlined; `git status --porcelain e2e/.auth/` asserted empty |
| `T-39G-10` audit rows from fixture creates | **mitigated** — none are written (measured); the delete is issued regardless |
| `T-39G-11` a stranded fixture blocking the next run | **mitigated** — purge-before-insert, and the prefix is unmistakably machinery to a human who finds one |
| `T-39G-SC` package installs | **n/a** — nothing installed; `@playwright/test` and `postgres` were already devDependencies; `package.json` and `package-lock.json` byte-identical |

## Threat Flags

None. This plan adds no network endpoint, no auth path, no file access and no schema change. It adds
one test file and modifies no source.

## Known Stubs

None. Every assertion in the file is wired to a real measurement against a real browser and a real
database. Nothing is skipped at runtime on this deployment: the `test.skip` guard exists only for a
deployment with no text-typed organization custom field, and `CNPJ / CPF` is present here.

## Closing statement

**D-39-01 is closed. SC-1's organization half is observable in the product, and DEDUP-01's
organization half is proven to reach a user.**

The requirement should now be marked satisfied — with F-39-07 recorded against it, because at the
320px viewport the advisory *fires and is readable* but the user cannot act on it by pointer. The
warning working and the warning being actionable at every supported viewport are two claims, and
this plan establishes the first and measures the boundary of the second.

## Self-Check: PASSED

- `e2e/org-duplicate-warning.spec.ts` — FOUND
- commit `ecff5c6` (RED) — FOUND
- commit `f9120ca` (GREEN) — FOUND
- `STATE.md`, `ROADMAP.md`, `REQUIREMENTS.md` — NOT modified, as instructed (orchestrator owns them)
