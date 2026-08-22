---
phase: 40-saved-views-shared-filters
plan: 17
subsystem: ui
tags: [dark-mode, accessibility, playwright, backlog, i18n, checkpoint]

requires:
  - phase: 40-saved-views-shared-filters
    provides: "SavedViewsBar, SaveViewDialog, ManageViewsDialog mounted on all four list surfaces (40-10 … 40-14), the 320px reachability suite (40-15), the visibility and degraded-read gates (40-16), the ?view=<id> carrier (40-18)"
provides:
  - "A measured dark-mode record for the phase's four new surfaces — every observation a getComputedStyle value, none an impression"
  - "The F-39-06 non-dependency proof: zero text-primary text across 199 elements examined, with the count reported so the assertion is not vacuous"
  - "Fifteen BACKLOG entries under 'Found in Phase 40', including the locale-parity figure correction and the five items deferred-items.md carried"
affects: [phase-41, phase-43, i18n-copy-pass, kanban-pagination, keyboard-hotkeys]

tech-stack:
  added: []
  patterns:
    - "A dark-mode pass is a temporary capture spec that is deleted afterwards, not a permanent gate — Phase 45's shape, repeated"
    - "A DOM sweep reads el.getAttribute('class'), never el.className — SVGAnimatedString silently hides every icon"
    - "An exclusion clause is asserted to have FIRED at least once, for the same reason an assertion is asserted over a non-empty set"

key-files:
  created: []
  modified:
    - .planning/BACKLOG.md

key-decisions:
  - "The file wins over every document: the locale-parity figures were re-read from src/messages/locale-parity.test.ts by a method validated against the file's own runtime pins, not copied from the plan's table"
  - "The temporary capture spec was deleted rather than kept — it asserts almost nothing and would grow suite runtime without growing cover"
  - "The whole-page /activities sweep is reported BESIDE the bar sweep, so 'the bar carries no text-primary' is a claim about the bar and not about a page where the token happens to be absent everywhere"
  - "The in-flight spinner was captured LIVE by delaying the server action, so the animate-spin carve-out is an exclusion that provably fires rather than one that never has to"

patterns-established:
  - "Anti-vacuity in both directions: assert the examined set is non-empty AND that every carve-out fired"
  - "Report a contrast measurement alongside a zero, so the zero is discriminating"

requirements-completed: []  # VIEW-01/02/03 are not complete until the human checkpoint (Task 3) is approved.

duration: 22min
completed: 2026-08-22
---

# Phase 40 Plan 17: The Dark-Mode Pass, the Backlog Handoff and the Human Checkpoint — Summary

**Phase 40's four new surfaces carry zero `text-primary` text across 199 elements measured in a real dark-mode Chromium, every colour recorded as a `getComputedStyle` value; fifteen findings are written into BACKLOG.md including the locale-parity figures both phase documents got wrong; and the phase's last gate — a human in front of a browser — is open and awaiting a response.**

> **STATUS: PAUSED AT A BLOCKING CHECKPOINT.** Tasks 1 and 2 are complete and committed. Task 3 is a
> `checkpoint:human-verify` with `gate="blocking"` and has NOT been auto-approved. A continuation
> agent must append the user's verbatim response to the *Task 3* section below before this plan is
> complete. **Do not mark VIEW-01 / VIEW-02 / VIEW-03 complete until that happens** — this checkpoint
> exists precisely because plan 39-14's source gates were green while the feature could not fire from
> any surface.

## Performance

- **Duration:** 22 min (to the checkpoint)
- **Started:** 2026-08-22T12:43:00Z
- **Completed (tasks 1–2):** 2026-08-22T13:05:20Z
- **Tasks:** 2 of 3 complete; 1 awaiting a human
- **Files modified:** 1 (`.planning/BACKLOG.md`)

## Accomplishments

- **V-40-10 measured, not judged.** Seven captures against the running container in a Chromium whose
  `documentElement.className` was asserted to contain `dark` *before* anything was read. Every value
  below is a `getComputedStyle` result, transcribed verbatim.
- **The F-39-06 absence proved over a counted, non-empty set.** 199 elements across the bar in three
  states, the open picker, the save dialog, the manage dialog under two sessions, and the delete
  `AlertDialog`. Zero `text-primary` class hits, zero elements painting text in the primary colour.
- **Fifteen BACKLOG entries**, each with its evidence, including all five items the phase's
  `deferred-items.md` carried and the locale-parity correction the plan was written to record.
- **A defect in this plan's own instrument, found and fixed before it produced a false green** — see
  Deviations.

## Task Commits

1. **Task 1: V-40-10 — the dark-mode pass** — no source change by design. The capture spec was
   temporary and is deleted; `git status --porcelain` is clean and `e2e/` holds exactly the specs it
   held before. Its output is the measurement record below, committed with this SUMMARY.
2. **Task 2: Write down what this phase measured and declined** — `064c7ec` (docs)
3. **Task 3: Human verification** — **OPEN.** No commit; this task changes nothing.

**Plan metadata:** this SUMMARY (docs)

## Files Created/Modified

- `.planning/BACKLOG.md` — 340 lines added: a `## Found in Phase 40 (Saved Views & Shared Filters)`
  section with fifteen entries.
- `e2e/zz-darkmode-capture.spec.ts` — **created and deleted within Task 1.** Deliberately not kept.

---

## Task 1 — V-40-10, THE DARK-MODE PASS

### The instrument

A temporary Playwright spec, `e2e/zz-darkmode-capture.spec.ts`, run with
`--no-deps --project=chromium` against the already-running container at `http://localhost:3001`,
reusing the existing `e2e/.auth/*.json` storageStates so **no password was handled** (T-40-83).
`test.use({ colorScheme: "dark", viewport: { width: 1280, height: 900 } })`. Four fixture views were
seeded through `e2e/views-fixtures.ts` and purged in `afterAll`, which asserted `0 prefixed rows
remain`.

**Every test asserted `documentElement.className` contained `dark` before measuring anything.** All
seven printed `documentElement.className = "dark"`. Final run: **7 passed (18.0s)**.

**Container state confirmed before measuring** (T-40-84): `docker compose -p pipelite ps` reports
`app running`, and the served `/deals` markup contains `py-4 sm:py-8`, `mb-4 sm:mb-6` and
`space-y-4 sm:space-y-6` — the D-40-4 reclaim — while `/organizations` serves "Saved views",
"Manage views", "All records" and "Filter this list to save it as a view." So the image is current
and the bar is live on the surface the human will be asked to open first.

### The theme tokens, resolved in dark mode

Measured by injecting a probe element with `color: var(--token)` and reading its computed colour:

| Token | Dark-mode value |
|---|---|
| `--primary` | `lab(90.952 0 -0.0000119209)` |
| `--destructive` | `lab(63.7053 60.745 31.3109)` |
| `--muted-foreground` | `lab(66.128 -0.0000298023 0.0000119209)` |
| body `color` | `lab(98.26 0 0)` |
| body `background-color` | `lab(2.75381 0 0)` |

`--primary` at `lab(90.952)` against a `lab(98.26)` body is F-39-06's exact figure, reproduced
independently. It is the reason this phase renders no `text-primary` text.

### Surface 1 — the bar on `/organizations` with a `Modified` badge

Reached by navigating to a saved view's URL with one filter changed
(`/organizations?search=zzzqqqx&view=<id>`, the view storing `search=zzzqqq`).

| Element | Property | Value |
|---|---|---|
| `Modified` badge | `color` | `lab(98.26 0 0)` |
| `Modified` badge | `background-color` | `lab(15.204 0 -0.00000596046)` |
| `Modified` badge | `border-color` | `rgba(0, 0, 0, 0)` |
| picker trigger | `color` | `lab(98.26 0 0)` |
| picker trigger | `background-color` | `oklab(0.999998 -0.00000980496 0.0000234246 / 0.045)` |
| picker trigger | `border-color` | `lab(100 0 0 / 0.15)` |
| `Save changes` button | `color` / `background` / `border` | identical to the trigger (both `variant="outline"`) |

The badge resolves from `bg-secondary text-secondary-foreground` — a `lab(15.2)` chip on a
`lab(2.75)` page carrying `lab(98.26)` text. It is a distinct surface, not a light-mode island, and
the state it carries is a **word** rather than a colour.

**A non-measurement was caught and fixed.** The first run reported `badgeColor: ""`. An empty string
is what `getComputedStyle` returns for a **detached** element — React had replaced the node between
the locator resolving and the evaluate landing. The badge is now located inside the trigger and the
page settled first, and the test **asserts the value is not the empty string**, so a silent
non-measurement cannot pass again.

### Surface 1b — the in-flight spinner, the one permitted `text-primary`

Captured live by delaying the export server action four seconds via `page.route`, because the
`animate-spin` carve-out in the sweep is otherwise an exclusion that never fires — the same vacuity
as an assertion over an empty set, in miniature.

```
class: "lucide lucide-loader-circle text-primary size-4 animate-spin"
color: lab(90.952 0 -0.0000119209)          <- === --primary, as intended
first painted background behind it: lab(7.78201 -0.0000149012 0)
the muted sentence beside it: lab(66.128 …)  ("Preparing your file…")
```

**40-08's warning is honoured and now measured.** The spinner's nearest painted background is
`lab(7.78)`, *not* `--primary` — it sits on the page/menu background, not on a `bg-primary` submit
button, so it does not draw primary-on-primary. The test asserts both halves: `color === --primary`
and `background !== --primary`.

### Surface 2 — the open picker, a selected item and both group labels

| Element | Property | Value |
|---|---|---|
| `DropdownMenuContent` | `color` | `lab(98.26 0 0)` |
| `DropdownMenuContent` | `background-color` | `lab(7.78201 -0.0000149012 0)` |
| `DropdownMenuContent` | `border-color` | `lab(100 0 0 / 0.1)` |
| `DropdownMenuLabel` "My views" | `color` | `lab(98.26 0 0)` |
| `DropdownMenuLabel` "Shared with me" | `color` | `lab(98.26 0 0)` |
| selected `menuitemradio` | `color` / `background` | `lab(98.26 0 0)` / `rgba(0, 0, 0, 0)` |
| unselected `menuitemradio` | `color` / `background` | `lab(98.26 0 0)` / `rgba(0, 0, 0, 0)` |
| export item | `color` / `opacity` | `lab(98.26 0 0)` / `1` |

Both group labels were present in the same open container, and exactly one item carried
`aria-checked="true"` (text: `[e2e] View DARK own orgPrivate · by Pipelite E2E Admin`).

**The selected and unselected items are byte-identical in colour, and that is correct here.** V-2/V-3
put the selection in `role="menuitemradio"` + `aria-checked` and draw it as a **shape** (the radio
indicator), never as a colour — so a dark-mode measurement finding no colour difference is the
design being honoured, not a contrast defect. The two labels are ordinary `lab(98.26)` foreground on
the `lab(7.78)` menu surface.

### Surface 3 — the save dialog with an inline `views.save.nameTaken` error

Submitted a duplicate name from a URL carrying **no** `view=` param — with a view selected the dialog
opens in UPDATE mode and the submit overwrites the target rather than colliding with its name, so the
refusal never fires. Worth knowing before anyone tries to reproduce this by hand.

| Element | Property | Value |
|---|---|---|
| `DialogContent` | `color` / `background` / `border` | `lab(98.26 0 0)` / `lab(2.75381 0 0)` / `lab(100 0 0 / 0.1)` |
| name `Input` | `color` / `background` / `border` | `lab(98.26 0 0)` / `oklab(… / 0.045)` / `lab(48.496 0 0)` |
| `#save-view-name-error` | `color` | **`lab(63.7053 60.745 31.3109)`** |
| `#save-view-name-error` | `class` | `text-destructive text-xs` |

**Asserted, not observed:** the error colour is compared for equality against the resolved
`--destructive` token and matches exactly. Text captured verbatim:
`You already have a view called “[e2e] View DARK own org”. Choose another name.`

### Surface 4 — the manage dialog, one read-only row and one editable row

**Measured under the MEMBER session**, because an admin can edit every row (`canEdit = isOwnedByViewer
|| isAdmin`), so the read-only branch is unreachable under the admin storageState. This is worth
recording: an admin-only dark-mode pass would have certified a branch it never rendered.

| Element | Property | Value |
|---|---|---|
| `views.manage.readOnly` line | `color` | **`lab(66.128 -0.0000298023 0.0000119209)`** (=== `--muted-foreground`) |
| `views.manage.readOnly` line | `font-size` / `class` | `12px` / `text-muted-foreground mt-2 text-xs` |
| read-only row: name line | `color` | `lab(98.26 0 0)` |
| read-only row: state words | `color` | `lab(66.128 …)` |
| read-only row | `border-color` / `border-bottom-width` | `lab(100 0 0 / 0.1)` / `1px` |

Text verbatim: `Only Pipelite E2E Admin or an admin can change this view.` and
`Shared · by Pipelite E2E Admin`. One editable row was present beside it (1 `Delete` button), so the
two branches were rendered in the same paint.

### Surface 5 — the delete `AlertDialog`

| Element | Property | Value |
|---|---|---|
| `AlertDialogAction` | `color` | `rgb(255, 255, 255)` |
| `AlertDialogAction` | `background-color` | `oklab(0.704006 0.176798 0.0722319 / 0.6)` |
| `AlertDialogAction` | `border-color` | `lab(100 0 0 / 0.1)` |
| `AlertDialogCancel` | `color` / `background` / `border` | `lab(98.26 0 0)` / `oklab(… / 0.045)` / `lab(100 0 0 / 0.15)` |

**Its colour comes from `--destructive`, and the arithmetic is checkable.** `--destructive` in dark is
`oklch(0.704 0.191 22.216)`; the button's class list carries `bg-destructive` plus
`dark:bg-destructive/60`, and the painted background is
`oklab(0.704006 0.176798 0.0722319 / 0.6)` — the same colour at 60% alpha, which is the `/60` in the
class. The foreground is `text-white` (an explicit shadcn `buttonVariants` choice, not a raw palette
token), giving white-on-red rather than the near-invisible primary-on-primary 40-08 warned about.

**K-2, asserted over every element in the alert dialog:** zero occurrences of `bg-green-500`,
`bg-amber-500`, `text-red-600`, `text-green-600` or `text-amber-500`. Result: `[]`.

### Surface 6 — the `views.degraded` notice

Reached with a fixture view storing `{status: "completed", type: "<a uuid no activity_types row
carries>"}`, so `validateStoredFilters` drops `type` and `droppedFilterKeys` is non-empty.

| Element | Property | Value |
|---|---|---|
| `views.degraded` `<p>` | `color` | **`lab(66.128 -0.0000298023 0.0000119209)`** (=== `--muted-foreground`) |
| `views.degraded` `<p>` | `background-color` | `rgba(0, 0, 0, 0)` |
| `views.degraded` `<p>` | `font-size` / `class` | `12px` / `text-muted-foreground text-xs` |

**Asserted:** the colour equals the resolved `--muted-foreground`, so it is muted body text and not a
panel, and **`document.querySelectorAll('[data-slot="alert"]').length === 0`** on that page — C-40-4
holds behaviourally, not just in source.

### The F-39-06 non-dependency check — the counted sets

Every element inside each root was enumerated (`[root, ...root.querySelectorAll("*")]`) and checked
two ways: for a literal `text-primary` class token, and for a computed `color` equal to the resolved
`--primary`. Elements also carrying `animate-spin` are excluded and **counted**.

| Root | Elements examined | Spinners excluded | `text-primary` class hits | Elements painting in `--primary` |
|---|---|---|---|---|
| bar row, `/organizations`, Modified state | 7 | 0 | 0 | 0 |
| bar row, `/organizations`, export in flight | 8 | **1** | 0 | 0 |
| open picker `[role="menu"]` | 28 | 0 | 0 | 0 |
| save dialog `[role="dialog"]` | 29 | 0 | 0 | 0 |
| manage dialog `[role="dialog"]` (admin) | 73 | 0 | 0 | 0 |
| manage dialog `[role="dialog"]` (member, read-only row) | 42 | 0 | 0 | 0 |
| delete `[role="alertdialog"]` | 7 | 0 | 0 | 0 |
| bar row, `/activities`, degraded notice | 5 | 0 | 0 | 0 |
| **Total across the phase's own surfaces** | **199** | **1** | **0** | **0** |

**The contrast that makes the zero discriminating.** A sweep of the same page rooted at `main`
examined **1,875 elements** and found **nine** — eight
`<a class="text-sm text-primary hover:underline">` record links and one
`<svg class="lucide lucide-circle-check h-6 w-6 text-primary">`. So the token is live and visible on
the surrounding page in the same paint, and the bar's and dialogs' zero is a fact about them rather
than about a page where the token is absent everywhere. Those nine are **pre-existing F-39-06**, not
a Phase 40 defect; the count is now recorded in BACKLOG entry 15.

Two anti-vacuity floors are asserted rather than eyeballed: the bar sweep root must resolve to at
least 3 and fewer than 200 elements (so it is the bar row and not the page container), and the
`animate-spin` carve-out must have fired at least once across the pass.

### The temporary spec is gone

`rm e2e/zz-darkmode-capture.spec.ts`, `rm -rf test-results/`, `git status --porcelain` **clean**.
`e2e/` now contains exactly:

```
auth.setup.ts                          saved-views-degraded.spec.ts
deals-drag.spec.ts                     saved-views-visibility-admin.spec.ts
member.setup.ts                        saved-views-visibility-member.spec.ts
merge-screen-320.spec.ts               seed-admin.ts
org-duplicate-warning.spec.ts          seed-member.ts
saved-views-320.spec.ts                theme.spec.ts
views-fixtures.ts                      viewport-320.spec.ts
```

— the four specs Phase 40 created plus the pre-existing set, and nothing else.

---

## Task 2 — THE BACKLOG HANDOFF

`.planning/BACKLOG.md` gained a `## Found in Phase 40 (Saved Views & Shared Filters)` section, 340
lines, fifteen entries in the file's existing shape (what it is, where it was found, what is already
known). Committed as `064c7ec`.

### The locale-parity correction, re-read from the file

The plan's own table was **not** copied. The four arrays were counted from
`src/messages/locale-parity.test.ts` after stripping comments — a method validated by the fact that
it reproduces the file's own runtime `toHaveLength` pins exactly, and by `npx vitest run
src/messages/locale-parity.test.ts` passing **11/11**:

| Constant | Documents claim | Measured | Naive count (comments not stripped) |
|---|---|---|---|
| `REQUIRED_DEDUP_KEYS` | 83 | **80** | 83 |
| `REQUIRED_AUDIT_KEYS` | 88 | **86** | — |
| `REQUIRED_BULK_KEYS` | 47 | **46** | — |
| `REQUIRED_TRASH_KEYS` | 66 | **63** | 66 |

**The naive count reproduces two of the documents' wrong numbers exactly**, which is the fingerprint
of how they were produced: a regex over the array literal also counts the quoted dot-paths inside the
explanatory comments *within* the array. The file itself says so, in a comment above the pinning test.

Two corrections to the plan's own interfaces block, which the plan explicitly invited by saying
"record what you find rather than what this table says":

- **`ICU_PLURAL_KEYS` is 12, not 11.** The documents were right when written; **this phase** added
  `views.manage.filterCount` as the twelfth. Plan 40-03's verification pins it at 12.
- `IDENTICAL_TRANSLATION_ALLOWED` is **3**, as documented. `REQUIRED_VIEWS_KEYS` is **61**.

### The fifteen entries

1. The locale-parity figures, with the naive-count cause and the `toHaveLength(80)` trap named.
2. `ICU_PLURAL_KEYS` has no completeness gate — `bulk.exported` and `deals.kanban.dealsCount` are
   ungated plurals; close the class, not the two keys.
3. Two list surfaces are not internationalised: `deal-filters.tsx` calls **no** `useTranslations` and
   carries **18 hardcoded literal sites / 15 distinct strings** (enumerated), plus five **unlabelled**
   chip-dismiss buttons; `kanban-board.tsx` carries five (with line numbers); three search
   placeholders and two Add-buttons elsewhere.
4. **CLOSED** — `/activities` accepted three filter params that narrowed nothing, with its cause, plus
   the two things that survive the fix: the defect shape is broader than the surface, and a
   behavioural suite cannot see it (40-05 probe 7: all 25 assertions stayed green).
5. The measured escape-param census: 7 bare-or-can-be-bare sites vs UI-SPEC's 6, and 17 list-route
   navigations (13 escaped, 4 exempt) plus 2 in the bar = 19 gated rows.
6. Document drift: UI-SPEC V-9 names `withViewEscape` where it must now be `withViewSelection`.
7. `popover.tsx` — the existing entry already carries M-5 (347px available / 388px at `top: -41`) and
   M-6 (7px clearance); **nothing missing**. Added: the `/activities` menu clears the viewport top by
   under one pixel in one locale and survives only on Radix's own clamp.
8. A soft-deleted user's private views are permanently unreachable — accepted, with the corrected
   population (10 users, 4 live, 6 soft-deleted — not the 9/3 both phase documents state).
9. Criterion 4's deliberate `/deals` narrowing, with the number behind it, and an explicit
   do-not-widen-`hasExportableFilter` warning.
10. **D-40-3** — `/deals` renders every deal, 88.3s on the 15,415-deal board, with the three-row
    measurement table and the suggested per-column pagination.
11. **Suite reliability, two named causes** — D-40-3 as the amplifier, and the cold-login 30.1s→1.9s
    measurement.
12. **D-40-1 / F-39-08 is NOT contained**, with the verbatim failure, the mechanism, the six-surface
    blast radius, the suggested hook-level guard, and — importantly — the instruction to leave the
    `test.fail()` in `saved-views-320.spec.ts` byte-unchanged until the fix, and delete it in the same
    commit.
13. **Four copies of the CSV download idiom**, with the blocker stated as an instruction: any
    consolidation must amend `bulk-action-bar-wiring.test.ts:373` in the same commit.
14. **`toolbar-wiring.test.ts`'s private walkers**, with `extractToolbarRegion`'s latent self-closing
    blind spot and the `elementRegion` off-by-one-`>` convention that must be preserved or changed
    deliberately.
15. F-39-06 measured live in dark mode, with the count and the `getAttribute("class")` method note.

**All five items the dispatch note required are present:** D-40-1 (12), D-40-3 (10), suite reliability
(11), the CSV idiom (13), the toolbar walkers (14). D-40-2 is deliberately **absent** — it was
RESOLVED in `4402cce` and is pinned by a permanent per-surface test, so carrying it forward would be
noise. D-40-4 is likewise absent as a defect: it was fixed at the user's direction before this plan
ran, and only its surviving side finding (suite reliability) is carried, as entry 11.

Three figures were re-measured against the dev database rather than inherited:
`{"users":{"total":10,"live":4},"deals":25195,"pipelines":11}`.

---

## Task 3 — HUMAN VERIFICATION (OPEN)

**Type:** `checkpoint:human-verify`, `gate="blocking"`. Auto-mode is off; this was NOT auto-approved.

The verification script was presented to the user with the container confirmed running the rebuilt
image and the bar confirmed visible on `/organizations`. The second account needed for criterion 2 is
the seeded `pipelite-e2e-member@local.test`; its password lives in `E2E_MEMBER_PASSWORD` in `.env`
and **is not written here, in the commit, or on any command line** (T-40-83 — this repo has leaked one
to a public remote once).

### The user's response

> _(to be filled in verbatim by the continuation agent — do not paraphrase, and do not record
> "approved" unless that is what was typed)_

### Findings

> _(each finding becomes either a fix in this phase or a recorded gap — never a silent pass)_

---

## Deviations from Plan

### 1. [Rule 1 — Bug in this plan's own instrument] The sweep could not see SVG elements at all

- **Found during:** Task 1, while capturing the in-flight spinner.
- **Issue:** The sweep read `el.className?.toString?.()`. On an **SVG** element `className` is an
  `SVGAnimatedString` whose `toString()` is the literal `"[object SVGAnimatedString]"` — so the class
  token check silently skipped every icon in every tree it walked. Measured: the sweep reported
  `spinnersExcluded: 0` with the `Loader2` visibly on screen and its own class report printing
  `"[object SVGAnimatedString]"`. **A `text-primary` on any icon in the bar or either dialog would
  have been invisible to the check, and the pass would have gone green.** This is the F-39-06 assertion
  failing in the same way the Phase 39 one did — quietly, by construction.
- **Fix:** `el.getAttribute("class")` throughout the sweep and the K-2 banned-class check; the
  computed-colour arm extended to treat an `<svg>` as painting (icons draw in `currentColor`, and have
  no text node to trip the original heuristic); and the K-2 check widened to include the root element,
  not only its descendants.
- **Verification:** the re-run reported `spinnersExcluded: 1` on the in-flight capture, and the
  whole-page contrast sweep gained the `lucide-circle-check` icon it had been missing — 8 hits became
  9. Both are the fix demonstrating itself.
- **Committed in:** no commit — the file was temporary and is deleted. The method note is recorded in
  BACKLOG entry 15 so the next sweep does not repeat it.

### 2. [Rule 2 — missing critical verification] The `animate-spin` carve-out was an exclusion that never fired

- **Found during:** Task 1, reviewing the first complete run.
- **Issue:** Every capture reported `spinnersExcluded: 0`, because no spinner is on screen in any
  static state. An exclusion clause that never fires is exactly the vacuity the plan's threat T-40-79
  is about, one level down: the sweep would have reported a clean pass whether or not the carve-out
  was correct, and the one permitted `text-primary` in the phase would have gone unmeasured.
- **Fix:** added surface **1b** — the export server action is delayed four seconds via `page.route`,
  the in-flight row is captured live, and the test asserts (a) the spinner's colour IS `--primary`,
  (b) the nearest painted background behind it is NOT `--primary` (40-08's primary-on-primary), and
  (c) `spinnersExcluded > 0`.
- **Verification:** all three assertions green; values transcribed under Surface 1b above.
- **Committed in:** no commit (temporary spec).

### 3. [Rule 2 — missing critical verification] Surface 4 is unreachable under the admin session

- **Found during:** Task 1, planning the manage-dialog capture.
- **Issue:** The plan asks for "one read-only row and one editable row". `canEdit` is
  `isOwnedByViewer || isAdmin`, so under the admin storageState **every** row is editable and the
  read-only branch never renders. Capturing it as an admin would have certified a branch that was not
  on screen.
- **Fix:** the surface-4 capture runs in a `test.describe` with
  `test.use({ storageState: "e2e/.auth/member.json" })`, seeded with an admin-owned SHARED view (the
  read-only row) beside a member-owned one (the editable row), and asserts both are present in the
  same open dialog.
- **Verification:** the read-only sentence rendered and was measured; 1 editable `Delete` button
  present beside it.
- **Committed in:** no commit (temporary spec).

### 4. [Recorded, not a deviation] The bar sweep root is derived from `aria-label`, and its size is bounded

The first `sweepBar` implementation used `trigger.closest("div").parentElement`, which on `/activities`
climbed to the page container and swept **1,883** elements — reporting the surrounding page's
pre-existing `text-primary` links as if they were the bar's. Corrected to `trigger.parentElement` (the
trigger is a direct child of the bar's flex row via `DropdownMenuTrigger asChild`) and bounded by an
assertion: at least 3 elements, fewer than 200. Recorded because the over-reaching version produced a
*scarier* result than the truth, and a future reader comparing runs would otherwise see the counts
change with no explanation.

**Total deviations:** 4 (1 bug in the instrument, 2 missing-critical verifications, 1 recorded
scoping correction). **No deviation touched application source.** `files_modified` was
`.planning/BACKLOG.md` and that is the only tracked file this plan changed.

## Authentication Gates

None. Both storageStates were valid (admin session expires 2026-08-29T12:42:40Z), and
`--no-deps` skipped the setup project, so no login was performed and no password was handled.

## Issues Encountered

- **Stale worktree base, as forecast — 10 of 10 now.** HEAD was at `cbf3229` (phase 34), roughly six
  phases behind the expected `9d823af`. Corrected with the sanctioned `git merge --ff-only master`,
  never `git reset --hard`. All five upstream artifacts and the D-40-4 marker were verified present
  afterwards.
- **The image's build timestamp reads as older than the commit it contains** (image
  `2026-08-22T09:08:51-03:00`, `9d823af` committed `09:46:16-03:00`) — the fix was built into the
  image from a working tree and committed later. Resolved by checking the *served markup* for the
  three reclaim classes rather than trusting the timestamp. Worth knowing: **the image timestamp is
  not evidence about what the container is running.**
- **The `rtk` hook reshapes `grep` and swallows `vitest`/Playwright `console.log`.** Worked around
  with `/usr/bin/grep` and `rtk proxy <cmd>`, the documented escape hatch. Same note plan 40-03 made.

## Verification

- Dark asserted before every measurement: **7 of 7** captures printed
  `documentElement.className = "dark"`.
- Colour values recorded for all six required surfaces plus the in-flight spinner: **done**, every one
  a `getComputedStyle` value.
- Three equalities asserted rather than eyeballed: the save error === `--destructive`, the degraded
  notice === `--muted-foreground`, the read-only sentence === `--muted-foreground`.
- K-2 over the delete `AlertDialog`: `[]`.
- C-40-4: `[data-slot="alert"]` count on the degraded page = **0**.
- `text-primary` absence asserted over **199** elements across eight roots, with the count reported
  and a 1,875-element / 9-hit contrast measurement beside it.
- Temporary spec deleted; `git status --porcelain` clean; `e2e/` back to exactly the phase's specs.
- `npx vitest run src/messages/locale-parity.test.ts` → **11 passed**, which is what validates the
  counting method behind the BACKLOG correction.
- **No application source was modified**, so the phase baseline (typecheck 0 · lint 0 ·
  vitest 3791 passed / 28 skipped · `saved-views-320` 24 · `viewport-320` 23 · `deals-drag` 4) is
  unchanged by construction. The container was not rebuilt, and is left running and current.
- `STATE.md` and `ROADMAP.md` were **not** touched — the orchestrator owns those writes.

## Known Stubs

None. This plan adds no product code and no component. The one file it changed is documentation.

## Threat Flags

None. No new network endpoint, auth path, file access pattern or schema change. The two fixture
writes go through `e2e/views-fixtures.ts`, whose loopback allow-list refuses any non-`localhost`
target, and both were purged with the purge asserting `0 prefixed rows remain`. No package was
installed (T-40-SC); `package-lock.json` is untouched. No password appears in this file, in any
commit message, or in any command line issued by this plan (T-40-83).

## Self-Check

- `.planning/BACKLOG.md` — FOUND, contains `Found in Phase 40` and `REQUIRED_DEDUP_KEYS`
- `.planning/phases/40-saved-views-shared-filters/40-17-SUMMARY.md` — FOUND
- `e2e/zz-darkmode-capture.spec.ts` — deliberately ABSENT; `git status --porcelain` clean
- commit `064c7ec` — FOUND in `git log`

## Next Steps

**This plan is not complete.** A continuation agent must:

1. Record the user's response to Task 3 **verbatim** in the section above.
2. Turn every finding into either a fix in this phase or a recorded gap in BACKLOG.md — never a
   silent pass.
3. Only then mark VIEW-01 / VIEW-02 / VIEW-03 complete.
