# Phase 40 — deferred items

Discoveries made while executing a plan, that the plan did not own. Logged rather than fixed, per
the scope boundary: only issues DIRECTLY caused by a task's own changes are auto-fixed.

---

## D-40-1 — F-39-08 is NOT contained: Enter on a focused button inside a modal navigates the list behind it

**Found by:** plan 40-15, V-40-11, against the rebuilt container on 2026-08-22.
**Severity:** user-visible data loss (a draft is discarded), on every list surface that mounts
`useDataTableKeyboard`.

### The measurement, verbatim

```
Error: Enter on the focused submit navigated the list behind the dialog — F-39-08 is NOT contained

expect(received).toBe(expected) // Object.is equality

Expected: "http://localhost:3001/organizations?search=ltda"
Received: "http://localhost:3001/organizations/9b37a635-b601-4e71-886d-83640ff776fe"
```

### What happens

1. Open `/organizations?search=ltda` (13,355 matching rows, so `useDataTableKeyboard`'s
   `selectedIndex = 0` resolves to a real `selectedItem`).
2. Open the saved-views picker → "Save view". The save dialog opens.
3. Tab to (or otherwise focus) the "Save view" submit button and press **Enter**.
4. The browser navigates to `/organizations/<id>` — the detail page of the FIRST row in the list
   behind the dialog. The dialog unmounts and the typed name, the share checkbox and the default
   checkbox are all discarded.

Space still activates the button correctly; only Enter is bound.

### Why

`src/components/keyboard/data-table-keyboard.tsx`:

```ts
useHotkeys(
  "enter",
  () => {
    if (isFormFocused()) return
    if (selectedItem && onOpen) onOpen(selectedItem)
  },
  { enableOnFormTags: false, preventDefault: true }
)
```

- The hotkey is registered with **no ref**, so it listens on the document.
- `isFormFocused()` exempts `INPUT`, `TEXTAREA`, `SELECT` and `contenteditable` — **not `BUTTON`**.
- Radix's modal layer does not stop a keydown reaching that document listener.
- `preventDefault: true` then suppresses the button's own activation, so the hotkey wins outright.

`src/components/views/save-view-dialog.tsx`'s header already names this risk and states the
mitigation hypothesis — "a click handler on the button would instead let the page-level hotkey win…
plan 40-15 asserts that Enter on the focused submit does not navigate the list behind the dialog."
The `<form>` shape does make the NAME INPUT path safe (`INPUT` is exempt, and that half is a
passing test). It does nothing for the button.

### Blast radius

Every surface mounting `useDataTableKeyboard`, and every modal that can be opened over one — not
just this phase's save dialog. The org create dialog, the bulk dialogs and the merge screen all
have focusable buttons over a keyboard-enabled list.

### Why plan 40-15 did not fix it

- The plan says so in as many words: "Fixing F-39-08 is out of scope (app-wide, six surfaces);
  proving the containment is not." `files_modified` is `e2e/saved-views-320.spec.ts` alone.
- The obvious one-liner is wrong. `onKeyDown={(e) => e.stopPropagation()}` on the dialog would also
  cut Radix's **document-level** Escape listener, breaking the O-3 dismissal that the same spec run
  proves works on all four overlays. A correct fix has to discriminate the key, or guard inside the
  hook, and either shape needs its own tests across six surfaces.

### How it is tracked

`e2e/saved-views-320.spec.ts` marks the assertion `test.fail()` with the assertion **byte-unchanged
and still running**. The suite therefore FAILS the day this starts passing, which is the behaviour a
defect record should have. The test's anti-vacuity guard (`[data-selected="true"]` must exist)
proves the hook has a row to navigate to, so the recorded failure cannot come from an empty list.

### Suggested fix, for whoever owns it

Guard the hook rather than each dialog — one place, six surfaces:

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

Needs its own plan: five hotkeys (`j/k/enter/e/d/n`) change behaviour on six surfaces, and every
one of them currently fires over an open dialog.

---

## D-40-2 — `/activities` still uses `key={search}` and loses focus mid-typing

> **RESOLVED in `4402cce`, after this file was written.** `activity-filters.tsx` now uses the same
> local-state resync as the two data-tables, and the defect is pinned by a permanent per-surface
> test — `V-40-7b` in `e2e/saved-views-320.spec.ts`, which asserts `document.activeElement` is
> still `INPUT` after the debounced navigation lands and that later characters reach the same node.
>
> The negative proof was RUN: reverting `activity-filters.tsx` to `key={search}` and rebuilding
> turned **only** the `/activities` row red — `Expected: "INPUT", Received: "BODY"` — while
> `/organizations` and `/people` stayed green. That per-surface isolation is deliberate: this
> defect shipped on three surfaces and then survived a fix that reached two of them, so a suite
> that could be satisfied by any one surface would have missed it again.
>
> Kept in this file rather than deleted, because the *shape* of the miss is the reusable lesson:
> `activity-filters.tsx` has no row-selection block, which is what the sibling fix hung its resync
> on, so a search-and-replace over the pattern skipped it.

**Found by:** plan 40-15, running the inherited post-40-14 focus proof.
**Severity:** user-visible; typing into the activities search box silently stops working.

### The measurement, verbatim

```
Error: /activities: characters typed after the pause were lost

expect(received).toBe(expected) // Object.is equality

Expected: "ltda"
Received: "lt"
```

Instrumented output from the same run:

```
[proofs] PROOF-3a /organizations focus after pause: {"tag":"INPUT","placeholder":"Search organizations..."}
[proofs] PROOF-3a /organizations final: value="ltda" activeElement=INPUT
[proofs] PROOF-3a /people        focus after pause: {"tag":"INPUT","placeholder":"Search people..."}
[proofs] PROOF-3a /people        final: value="ltda" activeElement=INPUT
[proofs] PROOF-3a /activities    focus after pause: {"tag":"INPUT","placeholder":"Search activities..."}
[proofs] PROOF-3a /activities    final: value="lt"   activeElement=BODY
```

### What happens

Type two characters into the `/activities` search box, pause longer than the 300ms debounce, then
keep typing without clicking back into the box. The later characters go nowhere: focus has moved to
`<body>`.

### Why

`src/app/activities/activity-filters.tsx:184` still carries the **pre-fix** shape:

```tsx
<Input
  key={search}
  placeholder="Search activities..."
  defaultValue={search}
  …
/>
```

A `key` change unmounts the fiber and mounts a new DOM node, destroying the focused element. This is
exactly the defect that commit `85f7c2a` ("the search box resyncs by local state, not by remounting")
removed from `src/app/organizations/data-table.tsx` and `src/app/people/data-table.tsx` — those two
now use local state resynced during render and both PASS the same probe. `/activities` was not
included in that fix.

### What is NOT broken on `/activities`

The M-9 resync half still works, because `key={search}` is what makes `defaultValue` re-read:

```
[proofs] PROOF-3b /activities after select: url=…/activities?search=acme&view=<id> box="acme"
[proofs] PROOF-3b /activities after Back:   url=…/activities?view=none            box=""
```

So the trade 40-11 flagged is live on exactly one surface: `/activities` has correct resync and
broken focus, while `/organizations` and `/people` now have both.

### Suggested fix

Port `85f7c2a` to `activity-filters.tsx` verbatim — local `searchInput` state, resynced during
render against a `prevSearch`, `value={searchInput}`, `key` removed. It is a mechanical copy of a
shape already reviewed and already proven by two passing probes. Out of 40-15's scope because
`files_modified` is one spec file and the surface belongs to plan 40-13.

---

## D-40-3 — `/deals?pipeline=<the biggest board>` takes 88 seconds to render

**Found by:** plan 40-16, while choosing a fixture pipeline for the DEAD_STAGE case, 2026-08-22.
**Severity:** user-visible. This is the busiest board in the deployment and the one a salesperson
would open first. It is not a saved-views defect — the same URL is reachable from the pipeline
`<Select>` on `/deals` — and Phase 40 neither caused it nor touched the query.

### The measurement, verbatim

Three URLs, admin session, 320x640, against the running container. Time is `page.goto` plus
`getByRole("heading", { level: 1, name: "Deals" }).waitFor()`:

```
http://localhost:3001/deals?view=none                                          -> status=200 heading=ok in   5255ms
http://localhost:3001/deals?pipeline=8e3b92d1-d667-4b4c-affa-3220f5022e3c      -> status=200 heading=ok in  88338ms
http://localhost:3001/deals?pipeline=f40cffbf-a7be-409c-ab76-5877bf01f54b      -> status=200 heading=ok in    328ms
```

| pipeline | deals | stages | time to `h1` |
|---|---|---|---|
| `8e3b92d1…` **Closer** | **15,415** | 10 | **88.3 s** |
| `010edd01…` BDR - Base Fria (the fallback board) | 3,754 | 2 | 5.3 s |
| `f40cffbf…` SaaS kill list | 2 | 6 | 0.3 s |

Roughly linear in deal count at ~5.7 ms/deal, so it is the row volume and not a constant cost.

### Why it surfaced here

`e2e/saved-views-degraded.spec.ts`'s DEAD_STAGE fixture originally picked the LARGEST live pipeline,
on the reasoning that a populated board is a better subject than an empty one. That one page load
consumed the whole 180s test budget:

```
Test timeout of 180000ms exceeded.

Error: expect(locator).toBeVisible() failed
Locator:  getByRole('heading', { name: 'Deals', level: 1 })
Expected: visible
Received: undefined
```

### What is happening

`src/app/deals/page.tsx` loads EVERY deal on the selected pipeline and groups them into
`dealsByStage`, and `KanbanBoard` renders every card. There is no pagination, no virtualisation and
no per-column cap — the board is `O(deals in pipeline)` in both the query and the DOM. 25,195 deals
live across 11 pipelines, so 15,415 of them are on one board.

### Not fixed here

Out of scope by the plan's own boundary: 40-16's `files_modified` is three spec files, the fix is a
pagination or virtualisation change to the kanban (a data-loading redesign, deviation Rule 4), and
nothing about it is caused by saved views. The gate worked around it by rendering the SMALLEST
non-empty board instead — the assertions are about which pipeline the board names, not about how
many cards it draws, so a 2-deal board proves the same thing 270x faster. That choice and its
measurement are recorded in the spec beside the query.

### Suggested fix, for whoever owns it

Per-column pagination is the smallest honest change: fetch the first N cards per stage plus a count,
and load more on scroll. Virtualising the column would cut the DOM cost but not the query. Either
way it needs a plan of its own — the board is also the drag-and-drop surface, and `@dnd-kit`
sortable contexts have to know about every item they can reorder.

---

## D-40-4 — `e2e/deals-drag.spec.ts` SC-5 fails, and it is PRE-EXISTING

**Found by:** plan 40-16, running the full Playwright suite for the first time this phase,
2026-08-22.
**Severity:** a red suite. Either the kanban cross-stage drag is broken or its harness is; both
readings need the owner of Phase 45's drag work, not this plan.

### The measurement, verbatim

```
  1) [chromium] › e2e/deals-drag.spec.ts:362:5 › dragging an unselected card to another stage moves
     it and leaves the other card's selection intact

    Error: expect(locator).toBeVisible() failed

    Locator: getByRole('checkbox', { name: /Bruce Willis/ })
             .locator('xpath=ancestor::div[contains(@class,"min-w-[280px]")][1]')
             .getByRole('checkbox', { name: 'Select [e2e] Drag Subject' })
    Expected: visible
    Timeout: 5000ms
    Error: element(s) not found

    at e2e/deals-drag.spec.ts:399:5
```

Full-suite result: **68 passed, 1 failed** — this one. The other three tests in the same file pass,
including the two that assert the drag DID move a card, so the file's `dndDrag` helper works in
general.

### It is not caused by plan 40-16, and that was checked rather than assumed

The only non-spec file 40-16 touched is `playwright.config.ts` (`workers: 1` and the `chromium`
project's `testIgnore`). The base config was restored with
`git checkout c28ac6e -- playwright.config.ts` and the spec re-run in isolation:

```
  1 failed
    [chromium] › e2e/deals-drag.spec.ts:362:5 › dragging an unselected card to another stage moves it
    and leaves the other card's selection intact
  3 passed (23.1s)
```

Byte-identical failure on the pre-40-16 config. The committed config was then restored. The failure
also reproduces with the file run ALONE, so it is not an interaction with any other spec, and
`deals-drag.spec.ts` is alphabetically first in `testDir` — it runs before every Phase 40 spec, so
nothing this phase seeds can have reached it.

### Where the assertion sits

`e2e/deals-drag.spec.ts:399`. The preconditions before it all pass — the anchor is checked, the bulk
bar reads 1, and the subject card starts in the source column with the right `data-kanban-col`. The
drag's own in-flight signal (`handleDragOver` optimistically reparenting the card) is awaited inside
`dndDrag`. What fails is the POST-drop assertion that the subject card is a descendant of the target
stage's column, so the drop either did not commit or the card returned to its source column.

### Not investigated further here

Out of scope by the plan's boundary: 40-16's `files_modified` is three spec files, none of them this
one, and Phase 45 owns the kanban drag. Recorded with its verbatim text and its
not-caused-by-us proof so the next plan starts from a measurement rather than from a rediscovery.
