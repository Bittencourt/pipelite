---
phase: 40-saved-views-shared-filters
plan: 15
subsystem: testing
tags: [playwright, e2e, 320px, reachability, docker, negative-probe, saved-views, f-39-07, f-39-08]

# Dependency graph
requires:
  - phase: 40-04
    provides: "VIEWS_FIXTURE_PREFIX, openDb, insertViewFixture, setDefaultFixture, purgeViewFixtures, and the seeded admin storageState"
  - phase: 40-08
    provides: "SaveViewDialog and its max-h-[calc(100dvh-2rem)] overflow-y-auto clamp — the subject of the V-40-2 probe"
  - phase: 40-09
    provides: "ManageViewsDialog, its second max-h-[50vh] clamp, and the delete AlertDialog"
  - phase: 40-10
    provides: "SavedViewsBar — the picker, slot 2 and the DropdownMenuContent measured here"
  - phase: 40-11
    provides: "the bar on /organizations and /people, and the search-box round trip this plan was handed to verify"
  - phase: 40-12
    provides: "the Decision-4 pipeline fallback, whose only proof was deferred to this plan's rebuild"
  - phase: 40-13
    provides: "the bar on /activities"
  - phase: 40-14
    provides: "the static call-site and responsive-class gates whose headers all defer real measurement here"
  - phase: 40-18
    provides: "the ?view=<id> carrier that makes selected+modified+editable representable, and so makes the tallest save dialog reachable at all"
provides:
  - "e2e/saved-views-320.spec.ts — 21 tests: reachability at 320x640 over four surfaces x three locales, the search resync, and the Enter containment"
  - "the phase's only real 320px measurement: 61 overlay bounding boxes, all four checks, all green"
  - "a negative probe that was RUN: removing the clamp turned the gate RED from a reachability assertion, verbatim below"
  - "the phase's Docker rebuild — the container now serves this phase's code"
  - "all three inherited manual proofs, run and recorded, including one honest failure"
  - "D-40-1: F-39-08 is NOT contained — measured, tracked as test.fail(), logged in deferred-items.md"
  - "D-40-2: /activities still uses key={search} and loses focus mid-typing — measured, logged"
affects: [40-16, 40-17, 40-VERIFICATION]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Four checks per overlay, not one: box.y >= 0, box.y+height <= 640, fits-or-scrolls, and click({trial:true}). The probe proved they are not redundant — the unclamped dialog passed fits-or-scrolls and failed box.y"
    - "click({ trial: true }) as the reachability assertion — runs every actionability check including hit-target, fires no event, and is therefore the only safe way to assert on a destructive control"
    - "Retry the OPEN of an overlay, never a measurement: clickUntil() with an early return so a toggle is not double-clicked, and every attempt above one is logged rather than absorbed"
    - "Read a flex container and all its children in ONE evaluate, and count rows from distinct child top offsets — two separate boundingBox round trips straddled a hydration re-layout and produced a self-contradictory record"
    - "test.fail() with the assertion byte-unchanged as a defect RECORD: the suite fails the day the defect is fixed, which a relaxed assertion could never do"
    - "Choose fixture search terms that RETURN ROWS — 'acme' matches 0 of 46,054 organizations, and behind an empty list the F-39-08 probe would have passed for the wrong reason"

key-files:
  created:
    - e2e/saved-views-320.spec.ts
    - .planning/phases/40-saved-views-shared-filters/deferred-items.md
  modified: []

key-decisions:
  - "The V-40-11 containment assertion is kept and marked test.fail() rather than deleted, relaxed, or fixed: the plan puts fixing F-39-08 out of scope, and the obvious one-line stopPropagation would also cut Radix's document-level Escape listener and break the O-3 dismissal this same file proves works"
  - "e2e/viewport-320.spec.ts left byte-unchanged (R-1) — no assertion in this file is expressible as a scrollWidth comparison, which is the whole reason a new file exists"
  - "The bar's wrap state is RECORDED, not asserted: a pixel-width expectation breaks on a copy change with nothing actually unreachable"
  - "The manage and delete overlays are measured on all four surfaces, not only on the crowded one — the dialogs are shared components and their per-locale geometry is the question"
  - "The three inherited manual proofs were run as a TEMPORARY spec and deleted: this plan's files_modified is one file, and one-shot verifications belong in this summary rather than in the permanent suite"

patterns-established:
  - "A negative probe is run against a REBUILT image, not reasoned about: the container has no volume mount, so an unrun probe is an unverified claim"
  - "Record the failure text verbatim including the measured numbers — '687px of content, box at y=-10.5' is the artifact, 'it went red' is not"

requirements-completed: [VIEW-01]

# Metrics
duration: 78min
completed: 2026-08-22
---

# Phase 40 Plan 15: The 320px Reachability Suite Summary

**Every overlay this phase adds is trial-clickable at 320x640 in three locales on four surfaces — 61
bounding boxes, all green — and the gate is proven non-vacuous by a probe that was RUN and turned
red from the one assertion no `scrollWidth` comparison could have made.**

## Performance

- **Duration:** ~78 min
- **Tasks:** 3 of 3, plus one measurement correction
- **Docker rebuilds spent:** **3** (budget was 2-4)
- **Files created:** 1 spec, 1 deferred-items log

## The Docker Rebuild — what was built and how it was proved

**Built from THIS WORKTREE, not from the main checkout.** The compose file declares `build: .` with
no volume mount, so the image is the only thing the browser can see:

```
docker compose --project-directory <worktree> -f <worktree>/docker-compose.yml -p pipelite up -d --build app
```

`--project-directory` pointed at the worktree so the build context was the tree carrying the probe
edit in rebuild 2. No `sudo` was used anywhere and no password appears in any command.

**How the image was confirmed to contain this phase.** Three independent facts:

1. The worktree was at `1f8defb` with `git status --porcelain` clean at build time (rebuild 1 and 3),
   and the fast-forward from the stale `cbf3229` base was done before anything was built.
2. The phase-40 message strings are in the baked bundle:
   `docker exec pipelite-app-1 grep -rl "Part of this view no longer exists" /app/.next` →
   `/app/.next/server/chunks/src_messages_en-US_json_9752301c._.js`
3. The spec's FIRST test asserts the picker trigger is visible on `/organizations` before any
   geometry is read. It passes. A pre-phase image has no picker.

| # | What it bought |
|---|----------------|
| 1 | The whole phase. Waves 3-5's UI was invisible to Playwright before it. Also unblocked all three inherited manual proofs. |
| 2 | **The V-40-2 negative probe.** Clamp removed → the gate turned RED. Without this rebuild the probe would have been a claim. |
| 3 | Clamp restored → GREEN reconfirmed. Docker returned the *identical cached image id* to rebuild 1, which is itself proof the restore is byte-identical to the pre-probe state. |

**Final container state:** `pipelite-app-1` running image
`sha256:fc94ade5f3b0f499e4f256b607f6275940a0473726ea9f0304c6239aa7f67de4`, HTTP 200 on
`http://localhost:3001/login`, and `100dvh-2rem` present in the served CSS chunk
(`/app/.next/static/chunks/9f4efbfc5688de58.css`). Postgres and Mailhog untouched.

## V-40-2 — THE NEGATIVE PROBE, RUN, WITH ITS FAILURE VERBATIM

`max-h-[calc(100dvh-2rem)] overflow-y-auto` was removed from `save-view-dialog.tsx`'s
`DialogContent`, the image was rebuilt, and the suite was re-run. **No filler content was needed** —
the tallest legal state already exceeds the viewport on its own.

**The measurement, unclamped:**

```
[40-15] SAVE TALLEST /organizations @ es-ES | box 16.0,-10.5 288.0x661.0 | scrollHeight 659 clientHeight 659 overflow-y visible | fits-or-scrolls true
```

**The failure, verbatim:**

```
  1) [chromium] › e2e/saved-views-320.spec.ts:727:7 › the tallest legal save dialog › es-ES, target RadioGroup, both helper lines and an inline name error

    Error: SAVE TALLEST /organizations @ es-ES: the TOP edge is off screen at y=-10.5 — this is the M-5 failure mode (the /activities filter popover renders 388px tall at top:-41) and no scrollWidth comparison can see it

    expect(received).toBeGreaterThanOrEqual(expected)

    Expected: >= 0
    Received:    -10.5

     481 |       `(the /activities filter popover renders 388px tall at top:-41) and no scrollWidth ` +
     482 |       `comparison can see it`
    >483 |   ).toBeGreaterThanOrEqual(0)
         |     ^
    at assertOnScreen (e2e/saved-views-320.spec.ts:483:5)
    at e2e/saved-views-320.spec.ts:778:5

  1 failed
  20 passed (1.5m)
```

**The most important line in this summary is `fits-or-scrolls true`.**

With the clamp gone the dialog grew to fit its own content — `scrollHeight 659 === clientHeight 659`
— so **check 3 passed**. So did the horizontal-overflow assertion that `viewport-320.spec.ts` makes.
The only thing that caught a 661px dialog centred in a 640px viewport was **check 1, `box.y >= 0`**.
That is F-39-07's anatomy exactly, reproduced and caught: a dialog whose top 10.5px and bottom 21px
are both off screen, which no width comparison and no fits-or-scrolls test can see. The four checks
are not four ways of saying one thing.

The failure came from a reachability assertion, not a selector miss — the dialog was found, opened,
measured, and reported its own numbers before failing.

**Restored and reconfirmed.** `git checkout -- src/components/views/save-view-dialog.tsx`, rebuild 3,
re-run:

```
[40-15] SAVE TALLEST /organizations @ es-ES | box 16.0,16.0 288.0x608.0 | scrollHeight 687 clientHeight 606 overflow-y auto
  21 passed (1.4m)
```

## The tallest legal save dialog — the number the clamp exists for

Reached exactly as 40-18 made possible: `/organizations?search=ltda&view=<sharedId>` where the view
stores `search=acme`, so the three facts are independent — selected (by id), modified (filters
differ), editable (admin owns it). The picker shows the `Modified` badge, slot 2 reads
`views.saveChanges`, the target `RadioGroup` renders, "save as a new view" is chosen, and an existing
view's name is submitted to draw the inline `nameTaken` refusal from the database's own
`saved_views_owner_type_name_uniq` index.

| | clamped (shipped) | unclamped (probe) |
|---|---|---|
| content height | **687px** | 659px |
| box | 288 x **608** at y=16 | 288 x **661** at y=**-10.5** |
| box bottom | 624 of 640 | 650.5 of 640 |
| `overflow-y` | `auto` | `visible` |
| submit trial-clickable | **yes** | unreachable |

**687px of content in a 606px box — 81px past the clamp — with 16px of headroom top and bottom.**
That is the tallest legal save dialog in the phase and the number the clamp is sized for.

## V-40-1 — the reachability suite: 61 boxes, every one green

Four surfaces x three locales x five overlays (picker menu, save dialog, manage dialog, the manage
list's inner scroller, the delete `AlertDialog`), plus the tallest dialog. Every box below satisfies
`y >= 0`, `y + height <= 640` and fits-or-scrolls, and every one had its key control
`click({ trial: true })`-ed: the LAST menu item, the submit, the LAST row's delete, the destructive
action. Escape dismissed all four overlays on all twelve combinations (O-3).

### en-US

| Overlay | box (x,y w×h) | scrollHeight / clientHeight | overflow-y |
|---|---|---|---|
| MENU /organizations | 32.0,260.8 285.9x375.2 | 814 / 376 | auto |
| SAVE /organizations | 20.3,109.2 279.5x421.7 | 433 / 433 | auto |
| MANAGE /organizations | 19.1,96.6 281.9x446.8 | 455 / 455 | auto |
| MANAGE list /organizations | 41.4,203.7 237.1x318.8 | **2435** / 320 | auto |
| DELETE /organizations | 20.3,157.7 279.5x324.6 | 333 / 333 | auto |
| MENU /people | 32.0,262.0 288.0x348.0 | 346 / 346 | auto |
| SAVE /people | 18.1,105.9 283.8x428.1 | 433 / 433 | auto |
| MANAGE /people | 20.3,98.5 279.5x443.0 | 455 / 455 | auto |
| MANAGE list /people | 42.2,204.4 235.6x316.8 | 678 / 320 | auto |
| DELETE /people | 17.4,164.3 285.2x311.4 | 313 / 313 | auto |
| MENU /deals | 32.0,243.8 278.6x286.3 | 294 / 294 | auto |
| SAVE /deals | 21.6,111.2 276.8x417.6 | 433 / 433 | auto |
| MANAGE /deals | 20.3,98.5 279.5x443.0 | 455 / 455 | auto |
| MANAGE list /deals | 42.8,205.0 234.5x315.3 | 465 / 320 | auto |
| DELETE /deals | 21.6,168.9 276.8x302.2 | 313 / 313 | auto |
| MENU /activities | 32.0,299.9 284.3x333.6 | 346 / **336** | auto |
| SAVE /activities | 20.3,109.2 279.5x421.7 | 433 / 433 | auto |
| MANAGE /activities | 18.1,95.1 283.8x449.8 | 455 / 455 | auto |
| MANAGE list /activities | 41.4,203.7 237.1x318.8 | 658 / 320 | auto |
| DELETE /activities | 20.3,167.4 279.5x305.2 | 313 / 313 | auto |

### pt-BR

| Overlay | box (x,y w×h) | scrollHeight / clientHeight | overflow-y |
|---|---|---|---|
| MENU /organizations | 32.0,260.8 285.9x375.2 | 814 / 376 | auto |
| SAVE /organizations | 20.3,109.2 279.5x421.7 | 433 / 433 | auto |
| MANAGE /organizations | 20.3,88.8 279.5x462.4 | 475 / 475 | auto |
| MANAGE list /organizations | 42.2,214.3 235.7x316.8 | **2555** / 320 | auto |
| DELETE /organizations | 21.6,159.3 276.8x321.5 | 333 / 333 | auto |
| MENU /people | 32.0,261.4 286.9x346.7 | 346 / 346 | auto |
| SAVE /people | 19.1,107.4 281.9x425.3 | 433 / 433 | auto |
| MANAGE /people | 20.3,88.8 279.5x462.4 | 475 / 475 | auto |
| MANAGE list /people | 42.2,214.3 235.7x316.8 | 718 / 320 | auto |
| DELETE /people | 20.3,167.4 279.5x305.2 | 313 / 313 | auto |
| MENU /deals | 32.0,241.9 275.2x282.9 | 294 / 294 | auto |
| SAVE /deals | 22.7,112.8 274.6x414.3 | 433 / 433 | auto |
| MANAGE /deals | 20.3,88.8 279.5x462.4 | 475 / 475 | auto |
| MANAGE list /deals | 41.8,213.9 236.5x318.0 | 485 / 320 | auto |
| DELETE /deals | 21.6,168.9 276.8x302.3 | 313 / 313 | auto |
| MENU /activities | 32.0,233.4 286.9x346.7 | 346 / 346 | auto |
| SAVE /activities | 21.6,111.2 276.8x417.6 | 433 / 433 | auto |
| MANAGE /activities | 19.1,86.8 281.9x466.4 | 475 / 475 | auto |
| MANAGE list /activities | 41.8,213.9 236.5x318.0 | 698 / 320 | auto |
| DELETE /activities | 20.3,167.4 279.5x305.2 | 313 / 313 | auto |

### es-ES

| Overlay | box (x,y w×h) | scrollHeight / clientHeight | overflow-y |
|---|---|---|---|
| MENU /organizations | 32.0,260.8 285.9x375.2 | 814 / 376 | auto |
| SAVE /organizations | 19.1,101.5 281.9x437.0 | 445 / 445 | auto |
| MANAGE /organizations | 20.3,88.8 279.5x462.4 | 475 / 475 | auto |
| MANAGE list /organizations | 42.2,214.3 235.7x316.8 | **2795** / 320 | auto |
| DELETE /organizations | 19.1,156.3 281.9x327.4 | 333 / 333 | auto |
| MENU /people | 32.0,261.4 286.9x362.6 | 362 / 362 | auto |
| SAVE /people | 18.1,100.0 283.8x439.9 | 445 / 445 | auto |
| MANAGE /people | 18.1,85.3 283.8x469.5 | 475 / 475 | auto |
| MANAGE list /people | 41.0,213.3 238.0x319.9 | 758 / 320 | auto |
| DELETE /people | 20.3,157.7 279.5x324.6 | 333 / 333 | auto |
| MENU /deals | 32.0,243.8 278.6x286.3 | 294 / 294 | auto |
| SAVE /deals | 22.7,107.1 274.6x425.8 | 445 / 445 | auto |
| MANAGE /deals | 20.3,88.8 279.5x462.4 | 475 / 475 | auto |
| MANAGE list /deals | 42.7,214.8 234.5x315.3 | 525 / 320 | auto |
| DELETE /deals | 20.3,167.4 279.5x305.2 | 313 / 313 | auto |
| MENU /activities | 32.0,230.6 281.9x340.6 | 346 / 346 | auto |
| SAVE /activities | 21.6,105.4 276.8x429.1 | 445 / 445 | auto |
| MANAGE /activities | 20.3,88.8 279.5x462.4 | 475 / 475 | auto |
| MANAGE list /activities | 41.8,213.9 236.5x318.0 | 758 / 320 | auto |
| DELETE /activities | 20.3,157.7 279.5x324.6 | 333 / 333 | auto |
| **SAVE TALLEST /organizations** | **16.0,16.0 288.0x608.0** | **687 / 606** | auto |

### The three numbers worth reading twice

- **`MANAGE list /organizations @ es-ES`: 2795px of content in a 320px box.** The `max-h-[50vh]`
  second clamp (O-1b) is not redundant beside the dialog's own clamp — it is carrying 2.5 screens of
  list. Twelve fixture views produced it; a user with twelve saved views will produce the same.
- **`MENU /activities @ en-US` in an earlier run: `box 32.0,0.8 … clientHeight 343` against
  `scrollHeight 346`.** 0.8px of headroom. Radix's
  `max-h-(--radix-dropdown-menu-content-available-height)` clamped the menu to fit and that is the
  only reason it is on screen — the exact primitive behaviour `saved-views-bar.tsx`'s comment says
  must never be overridden by a local `className`. This is the M-5 failure mode missing by less than
  a pixel, on the same route whose filter popover already fails it.
- **`MENU /organizations`: 814px of content, identical in all three locales.** Twelve views. The
  menu scrolls; the LAST item (`views.manageAction`) was `scrollIntoViewIfNeeded()` + trial-clicked
  on every combination.

### Where the bar wrapped — measured, not asserted

Read in ONE layout pass, with the row count taken from the number of distinct child top offsets.

| Surface | bar width | en-US | pt-BR | es-ES |
|---|---|---|---|---|
| /organizations | **191px** | **2 rows** (80px) | 2 rows | 2 rows |
| /people | **191px** | **2 rows** (80px) | 2 rows | 2 rows |
| /deals | 241px | **1 row** (36px) | 2 rows | 2 rows |
| /activities | 241px | **1 row** (36px) | 2 rows | 2 rows |

Trigger widths: 119.2px (en) → 169.6px (pt) → 173.2px (es). Slot 2: 97.5 → 111.3 → 122.4.

**M-10 is refined by this, and one baseline is corrected.** M-10 recorded "the bar wraps to two rows
at 241px in all three locales". Measured: it wraps in pt-BR and es-ES on all four surfaces, and in
en-US it fits one row where it actually has 241px (119.2 + 8 + 97.5 = 224.7). It wraps in en-US on
`/organizations` and `/people` because **those two surfaces give the bar only 191px, not 241px** —
their tables are inside `<Card><CardContent>`, whose `px-6` costs 48px. Nothing is unreachable and no
assertion depends on it, but the 241px figure does not apply to two of the four surfaces and future
width budgeting on them should use 191px.

## V-40-7 — the search box shows what the URL says, both directions, three surfaces

Every selection goes through the **picker**, never `page.goto`: M-9 is that app-router navigation
re-renders without remounting, and a `goto` remounts everything and would pass with the defect
completely present.

```
[40-15] V-40-7 /organizations | view selected -> box reads "acme"
[40-15] V-40-7 /organizations | All records -> box cleared
[40-15] V-40-7 /people        | view selected -> box reads "acme"
[40-15] V-40-7 /people        | All records -> box cleared
[40-15] V-40-7 /activities    | view selected -> box reads "acme"
[40-15] V-40-7 /activities    | All records -> box cleared
```

Both directions, all three surfaces. `/deals` has no `search` in `SAVEABLE_FILTER_KEYS.deal`, so it
has no fixture and no assertion here — the absence is the whitelist's, not an omission.

## V-40-11 — one half passes, one half is RED and stays red

### The safe path: PASSES

Enter typed in the name input submits the form. `isFormFocused` exempts `INPUT`, so the page-level
hotkey stands down and the `<form>`'s implicit submission runs. Verified by the dialog closing AND
by the row existing in `saved_views`, not by inference from the close alone.

```
[40-15] V-40-11 | Enter in the name input: form submitted, row created
```

### The containment: **FAILS. F-39-08 IS NOT CONTAINED.**

```
Error: Enter on the focused submit navigated the list behind the dialog — F-39-08 is NOT contained

expect(received).toBe(expected) // Object.is equality

Expected: "http://localhost:3001/organizations?search=ltda"
Received: "http://localhost:3001/organizations/9b37a635-b601-4e71-886d-83640ff776fe"
```

Tab to the "Save view" submit and press Enter: `useHotkeys("enter", …, { preventDefault: true })` —
registered on the document with no ref, exempting INPUT/TEXTAREA/SELECT/contenteditable but not
BUTTON — wins over the button's own activation, `onOpen(data[0])` fires, and the user lands on an
unrelated organization's detail page with the draft discarded. Space still works; only Enter is
bound.

`save-view-dialog.tsx`'s header states the hypothesis that the `<form>` shape contains this. It
contains the INPUT half. It does not contain the BUTTON half.

**The assertion is byte-unchanged and still runs; only the verdict is inverted with `test.fail()`.**
The suite therefore fails the day this starts passing — a defect record that polices itself, which a
relaxed assertion could not be. It is not vacuous: the test first asserts `[data-selected="true"]`
exists, so a green result cannot come from an empty list with nothing to navigate to.

**Not fixed here, deliberately.** The plan puts it out of scope in as many words, `files_modified` is
one spec file, and the obvious one-liner is wrong: `stopPropagation()` on the dialog would also cut
Radix's **document-level** Escape listener and break the O-3 dismissal this same run proves works on
all four overlays. Full write-up and a suggested hook-level fix in
`.planning/phases/40-saved-views-shared-filters/deferred-items.md` (**D-40-1**).

## The three inherited manual proofs

Run against the rebuilt container as a temporary spec, then deleted. All output verbatim.

### 1. From 40-12 — the dead pipeline. **PASSES.**

```
GET /deals?pipeline=00000000-0000-4000-8000-000000000000  ->  HTTP 200

grep -c 'rounded-lg">Pipeline not found.<'                ->  0
grep -o 'Pipeline not found' | wc -l                      ->  1   (inside the next-intl blob only:
                                                                   \"pipelineNotFound\":\"Pipeline not found.\")
selectedPipelineId                                        ->  "010edd01-e023-427e-b03b-3ed305b8f586"
<p class="text-muted-foreground text-xs">Part of this view no longer exists and was ignored.</p>
aria-label="Saved views"                                  ->  present
```

The dead-end block that WAS the entire page this morning is gone. The board renders
**"BDR - Base Fria"** (`010edd01-…`) — `allPipelines[0]`, exactly as 40-12 predicted, because all 11
live pipelines have `is_default = 0` and the default lookup returns `undefined`. The
`views.degraded` line renders beneath the bar, so `pipelineWasDropped` is being merged into
`droppedFilterKeys` as designed. Re-run against the FINAL image (rebuild 3), same result.

### 2. From 40-11 — the view round trip. **PASSES.**

```
[proofs] PROOF-2 /organizations after select: http://localhost:3001/organizations?search=ltda&view=c26eafec-faf6-4ab9-933d-15d2ca626746
[proofs] PROOF-2 /organizations after typing: http://localhost:3001/organizations?page=1&search=ltdax&view=c26eafec-faf6-4ab9-933d-15d2ca626746
[proofs] PROOF-2 /organizations: view=<id> preserved, Modified badge shown
[proofs] PROOF-2 /people        after select: http://localhost:3001/people?search=ltda&view=10f6b0e3-52f8-4501-8100-cb035dc26d1c
[proofs] PROOF-2 /people        after typing: http://localhost:3001/people?page=1&search=ltdax&view=10f6b0e3-52f8-4501-8100-cb035dc26d1c
[proofs] PROOF-2 /people: view=<id> preserved, Modified badge shown
```

Open a saved view, type one more character, and the address bar still carries `view=<id>` while the
picker shows the `Modified` badge. `withViewEscape` carried the unparsed `view` key through the
debounced writer untouched. (`page=1` is added by the search writer and is not a filter.)

### 3. From the post-40-14 search fix — focus. **PASSES on the two surfaces it was applied to; FAILS on the one it was not.**

**(a) Focus survival** — type two characters, pause 1.2s (well past the 300ms debounce), keep typing
without clicking back into the box:

```
[proofs] PROOF-3a /organizations focus after pause: {"tag":"INPUT","placeholder":"Search organizations..."}
[proofs] PROOF-3a /organizations final: value="ltda" activeElement=INPUT
[proofs] PROOF-3a /people        focus after pause: {"tag":"INPUT","placeholder":"Search people..."}
[proofs] PROOF-3a /people        final: value="ltda" activeElement=INPUT
[proofs] PROOF-3a /activities    focus after pause: {"tag":"INPUT","placeholder":"Search activities..."}
[proofs] PROOF-3a /activities    final: value="lt"   activeElement=BODY
```

```
Error: /activities: characters typed after the pause were lost

expect(received).toBe(expected) // Object.is equality

Expected: "ltda"
Received: "lt"
```

**The fix works.** `/organizations` and `/people` keep focus through the debounced navigation and
every character lands. **`/activities` does not** — it still carries the pre-fix
`<Input key={search} defaultValue={search}>` at `activity-filters.tsx:184`, the remount destroys the
focused node, focus falls to `<body>` and the later characters go nowhere. Commit `85f7c2a` was
applied to the two data-tables and not to this third surface. Logged as **D-40-2**; not fixed here
(different surface, owned by plan 40-13, and outside this plan's one declared file).

**(b) Back must resync, not keep stale text (the M-9 defect the fix replaced): PASSES everywhere.**

```
[proofs] PROOF-3b /organizations after select: url=…/organizations?search=acme&view=9a776269-… box="acme"
[proofs] PROOF-3b /organizations after Back:   url=…/organizations?view=none                   box=""
[proofs] PROOF-3b /people        after select: url=…/people?search=acme&view=1f1e2b51-…        box="acme"
[proofs] PROOF-3b /people        after Back:   url=…/people?view=none                          box=""
[proofs] PROOF-3b /activities    after select: url=…/activities?search=acme&view=4b6213ce-…    box="acme"
[proofs] PROOF-3b /activities    after Back:   url=…/activities?view=none                      box=""
```

**M-9 was not reintroduced.** The local-state resync gives `/organizations` and `/people` both
properties. `/activities` has correct resync and broken focus — it bought the resync with the remount
that costs the focus, which is precisely the trade 40-11's deviation 4 flagged and 85f7c2a removed on
two of three surfaces.

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Rebuild the image, then prove it is the new one before measuring | `e885867` | `e2e/saved-views-320.spec.ts` |
| 2 | V-40-1 — the four-check reachability suite, 12 combinations green | `6df50d5` | `e2e/saved-views-320.spec.ts` |
| 3 | V-40-7 resync, V-40-11 containment, and the tallest legal dialog | `d39d987` | `e2e/saved-views-320.spec.ts` |
| 3b | Read the bar's geometry in one layout pass, count rows from the flex box | `ee1c47d` | `e2e/saved-views-320.spec.ts` |

## Deviations from Plan

### 1. [Rule 1 — Bug, in my own gate] The bar's wrap measurement contradicted itself

- **Found during:** Task 2, comparing two runs.
- **Issue:** `/activities` reported `rows 1 | bar 241.0x80.0`. 80px IS two 36px rows plus the 8px
  gap, so the record disagreed with itself. The trigger's box and slot 2's box were read in two
  separate round trips that straddled a hydration re-layout moving the whole stack 135px, so
  `slot2.y (238) < trigger.y (373)` and the derived row count was garbage.
- **Fix:** one `evaluate` reads the container and every child together, and the row count is the
  number of DISTINCT child top offsets — the flex box's own answer. Rows and bar height now agree on
  all twelve combinations, in both final runs.
- **Commit:** `ee1c47d`.

### 2. [Rule 1 — Bug, in my own gate] `boundingBox()` went null on 6 of 12 combinations

- **Found during:** Task 2, first run.
- **Issue:** `Cannot read properties of null (reading 'y')` immediately after `toBeVisible()` had
  resolved. The hydration mismatch (BACKLOG, React #418) remounts the tree, so the node the assertion
  matched is detached microseconds later.
- **Fix:** `boxOf()` polls with `toPass`, which re-resolves the locator each attempt. It is a settle,
  not an assertion retry: every geometric assertion still runs once, on the box that comes back.
- **Commit:** `6df50d5`.

### 3. [Rule 1 — Bug, in my own gate] Swallowed clicks, and the anti-vacuity hole they exposed

- **Found during:** Tasks 2 and 3.
- **Issue:** two clicks were swallowed across five development runs (one picker trigger on
  `/organizations`, one slot-2 button in the tallest-dialog test). Both are the documented #418
  flake.
- **Fix:** `clickUntil(target, expected)` retries ONLY the open, with an early return so a toggle is
  not double-clicked, and logs any attempt above one. Both final runs logged zero and one
  respectively.
- **Commit:** `6df50d5` / `d39d987`.

### 4. [Rule 2 — Missing critical coverage] The fixture search term made a test vacuous

- **Found during:** Task 3, while writing V-40-11.
- **Issue:** the plan's `?search=acme` renders an EMPTY list — measured, `acme` matches **0** of
  46,054 organizations and **0** of 79,022 activities. `useDataTableKeyboard` reads
  `selectedItem = data[0]`, so behind an empty list the Enter hotkey returns without navigating and
  V-40-11 would have reported "contained" with F-39-08 completely present. That is the Phase 39
  green-with-the-defect shape the whole plan exists to refuse.
- **Fix:** `ltda` (13,355 organizations / 6,684 people) and `contato` (1,729 activities) for the
  reachability and hotkey surfaces, plus an explicit `[data-selected="true"]` precondition in
  V-40-11. `acme` is kept for the V-40-7 fixture, where the assertion is on `inputValue()` and the
  result count is irrelevant.
- **Commit:** `d39d987`.

### 5. [Rule 4 — Reported, NOT acted on] F-39-08 is not contained

The plan's `must_haves.truths` asserts "Enter on the save dialog's focused submit does not navigate
the list behind it". It was measured and it is FALSE. Fixing it means changing keyboard behaviour on
six surfaces through a shared hook, the plan declares it out of scope, and the naive containment
would break the Escape dismissal this same file proves. Recorded as `test.fail()` with the assertion
intact and written up in `deferred-items.md` (**D-40-1**). See the V-40-11 section above.

### 6. [Rule 4 — Reported, NOT acted on] `/activities` still has the focus-loss defect

`activity-filters.tsx` was not included in commit `85f7c2a`. Measured failing, twice, with the same
probe the other two surfaces pass. Different surface, owned by plan 40-13, outside this plan's one
declared file. Written up in `deferred-items.md` (**D-40-2**) with the exact mechanical fix.

### 7. [Scope, recorded] The manage and delete overlays are measured on all four surfaces

The plan scopes step (d) to "the entity type seeded with ≥8 views". Both dialogs are shared
components whose per-locale geometry is the question, so they were measured on all four surfaces —
48 boxes instead of 12. The ≥8 case still bites only on `/organizations`, and it is the 2795px
measurement above.

### 8. [Scope, recorded] The stale worktree base

The worktree was branched from `cbf3229` (phase 34), six phases behind — **eight for eight this
phase**. Corrected with `git merge --ff-only master` to `1f8defb` before anything was built, and all
upstream 40-* artefacts were verified present afterwards. This mattered more here than anywhere else
in the phase: a stale tree would have baked an image missing the entire phase and every measurement
would have described the wrong application. (`view-escape-call-sites.test.ts` is at
`src/lib/views/__tests__/`, not `src/components/views/__tests__/` as the dispatch listed — the file
exists, the path in the checklist was wrong.)

## Verification

| Check | Result |
|-------|--------|
| `npx playwright test e2e/saved-views-320.spec.ts` — run A | **21 passed** (1.3m), exit 0 |
| `npx playwright test e2e/saved-views-320.spec.ts` — run B | **21 passed** (1.3m), exit 0 |
| V-40-2 negative probe | **RUN. Turned RED from `box.y >= 0`.** Verbatim above. Clamp restored, GREEN reconfirmed |
| V-40-7 | green, both directions, all three surfaces, via real picker selection |
| V-40-11 safe half | green |
| V-40-11 containment half | **RED as recorded** (`test.fail()`, assertion byte-unchanged) |
| Fixture rows remaining | `select count(*) from saved_views where name like '[e2e] View%'` → **0** |
| e2e defaults remaining | **0** |
| Production counts | **46054 / 38348 / 25195 / 79022** — unchanged |
| `npx vitest run` | **3791 passed / 28 skipped / 3819 total** — the baseline exactly, zero delta |
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **0 errors, 125 warnings** — the baseline exactly |
| `e2e/viewport-320.spec.ts` | **UNCHANGED** — last touched by `21f7024` (phase 39) |
| `playwright.config.ts` `ignoreDefaultArgs` | present exactly once in the config object (line 34); the second grep hit is the explanatory comment |
| `.github/workflows/ci.yml` occurrences of `playwright` | **0** |
| Files changed across all four commits | **`e2e/saved-views-320.spec.ts` only** |
| Container left running | yes — `pipelite-app-1` up, HTTP 200, serving the clamped build |
| `sudo` / password used | **none, anywhere** |

The 24 skipped `formatters-live` tests self-skip on `!process.env.DATABASE_URL` — expected, not a
regression.

## Known Stubs

None. This plan adds one test file; nothing it touches renders placeholder data.

## Notes for 40-16, 40-17 and the Verifier

- **The four checks are not interchangeable, and the probe proves it.** An unclamped 661px dialog
  passes fits-or-scrolls and passes every horizontal-overflow assertion in the repo. Only
  `box.y >= 0` caught it. Any future viewport gate that keeps one of the four and drops the others is
  F-39-07 again.
- **Two open defects are recorded, not fixed**, both with verbatim measurements and suggested fixes:
  D-40-1 (F-39-08 not contained, tracked as a `test.fail()` that will alarm on fix) and D-40-2
  (`/activities` focus loss). Neither is caused by this plan; both were found by running it.
- **`/organizations` and `/people` give the bar 191px, not 241px.** Any width budgeting on those two
  surfaces should use the smaller number.
- **`MENU /activities` clears the top of the viewport by under a pixel** in one locale. It is on
  screen only because Radix clamps to its own available height. The moment a `className` on that
  `DropdownMenuContent` overrides the primitive's clamp — which `saved-views-bar.tsx`'s comment
  forbids and `tailwind-merge` would do silently — that menu goes off screen.
- **The image is current.** Any later plan measuring the container needs no rebuild unless it changes
  `src/`.

## Self-Check: PASSED

- `e2e/saved-views-320.spec.ts` — exists on disk
- `.planning/phases/40-saved-views-shared-filters/deferred-items.md` — exists on disk
- `e2e/zz-inherited-manual-proofs.spec.ts` — deliberately removed; `git status --porcelain` clean
- Commits `e885867`, `6df50d5`, `d39d987`, `ee1c47d` — all resolve in `git log`
- No write to `STATE.md` or `ROADMAP.md` — the orchestrator owns those

## Threat Flags

None. This plan adds no endpoint, no auth path, no file access and no schema change. The five
dispositions it implements — T-40-69 (mitigate: the four checks on all four overlays), T-40-70
(mitigate: the probe was RUN and turned red), T-40-71 (mitigate: prefix-scoped purge in `beforeAll`
AND `afterAll`, zero rows remaining, four production counts unchanged), T-40-72 (mitigate: the
destructive action asserted with `trial: true` only, never clicked) and T-40-73 (mitigate: the image
rebuilt and the picker asserted visible before any measurement) — are all discharged. T-40-74's
`accept + mitigate` is discharged by `clickUntil`/`boxOf` with logged attempt counts and no project
retries. T-40-SC: nothing was installed.
