---
phase: 40-saved-views-shared-filters
plan: 11
subsystem: ui
tags: [saved-views, next-app-router, url-params, redirect, rsc, source-gates]

requires:
  - phase: 40-01
    provides: withViewEscape, VIEW_ESCAPE_KEY, the filter whitelist
  - phase: 40-05
    provides: resolveSavedViewsBarProps, resolveDefaultViewRedirect
  - phase: 40-10
    provides: the SavedViewsBar component and its two dialogs
  - phase: 40-18
    provides: the ?view=<id> carrier that withViewEscape preserves
provides:
  - "the saved-views bar mounted on /organizations and /people, on its own row above each toolbar"
  - "the default-view redirect on both surfaces, guarded on \"no params at all\""
  - "six list-route navigations routed through withViewEscape and seeded with view=<id>"
  - "the M-9 stale-search-box fix (key={search}) on both list inputs"
  - "two source gates: views-page-wiring.test.ts (18 rows) and views-bar-mount.test.ts (20 rows)"
affects: [40-12, 40-13, 40-14, 40-15, 40-16, 40-VERIFICATION]

tech-stack:
  added: []
  patterns:
    - "server page resolves ALL bar props inside its EXISTING Promise.all — no second latency hop"
    - "one viewsBar prop for the eight, spread onto the bar; plus the resolved selectedViewId for the writers"
    - "list-route writers seed URLSearchParams from the RESOLVED view id, never from useSearchParams"

key-files:
  created:
    - src/app/organizations/__tests__/views-page-wiring.test.ts
    - src/app/organizations/__tests__/views-bar-mount.test.ts
  modified:
    - src/app/organizations/page.tsx
    - src/app/organizations/data-table.tsx
    - src/app/people/page.tsx
    - src/app/people/data-table.tsx

key-decisions:
  - "Three direct withViewEscape call sites per table rather than one local push() helper — the plan's <verification> asks for exactly three per data-table and plan 40-14's repo-wide gate is written against that count"
  - "selectedViewId passed as its own prop alongside viewsBar, both from the same resolved object at one call site, so they cannot drift"
  - "key={search} implemented as written (B-6); the controlled-input alternative was NOT taken, and the focus-loss risk it leaves behind is flagged below rather than fixed unilaterally"

patterns-established:
  - "Gate discipline: every new gate row gets a negative proof; two holes were found and one was fixed"
  - "Local if-statement extractor stays module-private until a third gate needs it (40-08's promotion rule)"

requirements-completed: [VIEW-01, VIEW-02]

duration: 34min
completed: 2026-08-21
---

# Phase 40 Plan 11: Mount the bar on /organizations and /people — Summary

**Both list surfaces now land on the user's default view with the filters in the address bar, keep the view named in the URL through a search or a page change, and no longer show a search box contradicting the list it is filtering.**

## Performance

- **Duration:** 34 min
- **Started:** 2026-08-22T01:17:50Z
- **Completed:** 2026-08-22T01:51:17Z
- **Tasks:** 2 of 2 (each RED → GREEN)
- **Files modified:** 4 source files, 2 test files created

## Accomplishments

- **The default-view redirect, on both pages**, taken after the `auth()` gate and before any list query. The guard is `Object.keys(params).length === 0` and nothing else — `view=none` is a param, so the escape URL is never recaptured, and `resolveDefaultViewRedirect` answering `null` for an all-dropped filter set is the other half of the loop guard (T-40-49).
- **The bar props ride the EXISTING `Promise.all`** — fifth entry on `/organizations`, fourth on `/people`. No separate `await`, so neither page pays a second latency hop.
- **The bar on its own row**, as the first child of each table's `space-y-4` stack, above the toolbar and carrying no positioning class of its own (R-40-2c, K-8).
- **`key={search}` on both search inputs**, which is what makes `defaultValue` take effect again after an app-router navigation that re-renders without remounting (B-6, M-9).
- **Six list-route navigations escaped** (three per table), each seeded with `view=<id>` from the resolved id, so a filter change inside a view keeps the view open and a deleted view's id is scrubbed rather than preserved. The empty-search branch no longer pushes a bare path.
- **38 new gate rows**, both files written RED first, and **five negative proofs run** — which found two problems in my own gates, one of them a genuine hole that would have let the plan's core defect back in.

## Task Commits

1. **Task 1 RED: the server-page gate** — `75a69f0` (test) — 18 rows, 16 RED / 2 green
2. **Task 1 GREEN: the redirect and the bar props** — `33e553d` (feat)
3. **Task 2 RED: the table gate** — `294807b` (test) — 20 rows, 14 RED / 6 green
4. **Task 2 GREEN: the bar, the input, the writers** — `344e58b` (feat)
5. **Gate hardening from a negative proof** — `496e9cb` (test)

## Files Created/Modified

- `src/app/organizations/page.tsx` — redirect guard at **126–130**; `resolveSavedViewsBarProps` at **190**; `viewsBar={viewsBar}` at **237**; `selectedViewId={viewsBar.selectedViewId}` at **246**
- `src/app/people/page.tsx` — redirect guard at **134–138**; `resolveSavedViewsBarProps` at **181**; `viewsBar={viewsBar}` at **236**; `selectedViewId=` at **245**
- `src/app/organizations/data-table.tsx` — see the line table below
- `src/app/people/data-table.tsx` — see the line table below
- `src/app/organizations/__tests__/views-page-wiring.test.ts` — created, 18 rows over both server pages
- `src/app/organizations/__tests__/views-bar-mount.test.ts` — created, 20 rows over both tables

### Final line numbers of every changed `router.push` (for plan 40-14's gate)

Recorded at commit `496e9cb`. **Four `router.push` per file; three list-route, one detail-route.**

| File | Line | Site | Escaped? |
|------|------|------|----------|
| `organizations/data-table.tsx` | **348** | `handleSearchChange`, non-empty | yes — `withViewEscape("organization", params)`, params seeded at 342 |
| `organizations/data-table.tsx` | **361** | `handleSearchChange`, cleared | yes — `withViewEscape("organization", new URLSearchParams())` |
| `organizations/data-table.tsx` | **370** | `useDataTableKeyboard` `onOpen` → `/organizations/${org.id}` | **NO — named exemption, expression text unchanged** |
| `organizations/data-table.tsx` | **570** | Load More | yes — `withViewEscape("organization", params)`, params seeded at 567 |
| `people/data-table.tsx` | **216** | `handleSearchChange`, non-empty | yes — `withViewEscape("person", params)`, params seeded at 210 |
| `people/data-table.tsx` | **229** | `handleSearchChange`, cleared | yes — `withViewEscape("person", new URLSearchParams())` |
| `people/data-table.tsx` | **311** | `useDataTableKeyboard` `onOpen` → `/people/${person.id}` | **NO — named exemption, expression text unchanged** |
| `people/data-table.tsx` | **511** | Load More | yes — `withViewEscape("person", params)`, params seeded at 508 |

Other final positions: `<SavedViewsBar {...viewsBar} />` at **414** (orgs) and **354** (people); `key={search}` at **448** / **389**; `seededParams` defined at **330** / **198**.

## Decisions Made

**1. Three direct `withViewEscape` call sites per table, not one local `push()` helper.**
The plan's action text sketches a `const push = (params) => router.push(...withViewEscape...)` helper, and its `<verification>` asks for "exactly three `withViewEscape` call sites per data-table". Those two cannot both hold — the helper yields one site. I took the verification, because plan **40-14 gates all 17 call sites repo-wide** and was written against this plan's stated count; a DRY helper here would have made 40-11 the one surface that failed 40-14. The seeding, which is the part with real logic in it, IS factored — into `seededParams()`.

**2. `selectedViewId` passed as its own prop even though `viewsBar` already contains it.**
Per the plan. The redundancy is bounded: both come from the same resolved object at a single call site in each page, so they cannot drift, and the writers get exactly the one value they need without reaching into the bar's props.

**3. `key={search}` implemented as specified; the controlled-input alternative was not taken.** See the flag below — this is the one place where I think the locked decision deserves a second look, and I did not act on that unilaterally.

## Negative Proofs

All five were run against the committed code by mutating a file, running the gate, and restoring with `git checkout -- <file>`. Failure text is verbatim.

**1. Weaken the redirect guard** — `Object.keys(params).length === 0` → `... || !params.search` in `organizations/page.tsx`. RED, 1 row:
```
FAIL … organizations/page.tsx: the guard is exactly "no params at all" (T-40-49)
AssertionError: expected 'Object.keys(params).length === 0 || !…' to be 'Object.keys(params).length === 0' // Object.is equality
Expected: "Object.keys(params).length === 0"
Received: "Object.keys(params).length === 0 || !params.search"
```

**2. Restore the bare-path push** — the cleared-search branch back to `router.push("/organizations")`. RED, 3 rows:
```
AssertionError: expected [ '"organization", params', …(1) ] to have a length of 3 but got 2
AssertionError: expected [ …(2) ] to have a length of 3 but got 2
AssertionError: expected 1 to be 2 // Object.is equality
```

**3. Remove `key={search}`** from the people input. RED, 1 row:
```
FAIL … people/data-table.tsx: the search Input carries key={search} beside defaultValue (B-6, M-9)
AssertionError: expected '<Input\n            placeholder="Sear…' to contain 'key={search}'
```

**4. Unseed the search writer** — `seededParams()` → `new URLSearchParams()` in `handleSearchChange`. **GREEN. Nothing failed.** This is a real hole, not a formality: the helper still existed and Load More still called it, so all 20 rows stayed green while the first keystroke inside a view silently dropped the selection — the exact defect plan 40-18 exists to prevent. Fixed in `496e9cb` by counting the CALL SITES (two per table, exactly one of them inside the debounced writer) instead of the helper's presence. Re-run under the same mutation:
```
FAIL … organizations/data-table.tsx: the writers seed view from the RESOLVED id, not from useSearchParams
AssertionError: expected [ '' ] to have a length of 2 but got 1
Tests  1 failed | 19 passed (20)
```

**5. Merge the bar into the toolbar row** on `people/data-table.tsx`. RED, 2 rows:
```
AssertionError: expected '<div className="flex flex-wrap items-…' to be '' // Object.is equality
AssertionError: expected '<div className="flex flex-wrap items-…' not to contain 'SavedViewsBar'
Tests  2 failed | 18 passed (20)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A vacuous gate row in my own RED file**
- **Found during:** Task 1, on the first RED run
- **Issue:** `expect(source.indexOf(GUARD_TEST)).toBeLessThan(source.indexOf("Promise.all("))` was one of only two green rows with nothing implemented — `indexOf` returns `-1` when the guard is absent, and `-1` is less than every real offset. The row could never have failed for the reason it existed.
- **Fix:** both offsets asserted `> -1` before the ordering comparison, with the measurement written into the comment.
- **Committed in:** `75a69f0` (before the RED commit, so the recorded RED count is honest: 16/18)

**2. [Rule 1 - Bug] The seeding gate did not gate the seeding**
- **Found during:** Task 2 verification, by negative proof 4 above
- **Issue:** the three seeding rows asserted the helper EXISTED and was called somewhere. Removing `seededParams()` from the search writer — the single most consequential of the two call sites — failed nothing.
- **Fix:** count `seededParams()` call sites (2 per table) and require exactly one of them inside the extracted `setTimeout` body.
- **Verification:** the mutation now fails, transcribed above.
- **Committed in:** `496e9cb`

**3. [Rule 3 - Blocking] The first-child assertion could not survive a JSX comment**
- **Found during:** Task 2 GREEN
- **Issue:** the row asserts nothing sits between the stack's opening tag and the bar. `stripComments` removes `/* … */` but leaves the `{` and `}` that wrapped a JSX comment, so the mandated explanatory comment above the mount reduced to a bare `{}` and the assertion could never pass.
- **Fix:** strip EMPTY JSX containers only (`/\{\s*\}/g`) before comparing — a real `{cond && …}` in front of the bar still fails the row.
- **Committed in:** `344e58b`

**4. [Design, NOT auto-applied — Rule 4, reported instead of acted on] `key={search}` remounts the input mid-typing**
- **Found during:** Task 2, while writing the mount
- **What the plan mandates:** `key={search}` beside `defaultValue={search}`, with "**The fix is `key`, NOT conversion to a controlled input**" written in capitals, and `key={search}` named as a `must_haves` artifact. I implemented exactly that.
- **The concern:** a `key` change unmounts the fiber and mounts a new DOM node, so the focused element is destroyed and focus moves to `<body>`. The writer is 300ms-debounced, so the sequence is: type → pause 300ms → navigate → `search` prop changes → **key changes → remount → focus lost**. A user who resumes typing after that pause types into nothing until they click the box again. This trades the M-9 stale-box defect for a focus-loss defect on the far more common path.
- **Why I did not "fix" it:** it is a locked phase decision (B-6) and a named plan artifact, and the alternative is a structural change to the input — Rule 4 territory, and this executor is one of three running in parallel on a shared spec.
- **The alternative, for whoever rules on it:** a controlled input fed from LOCAL state, re-synced from the URL with the adjust-state-during-render pattern these two files ALREADY use for `prevSearch`/`rowSelection` — `const [box, setBox] = useState(search); if (search !== prevProp) { setPrevProp(search); setBox(search) }`, `value={box}`. This keeps the same DOM node (no focus loss), does not fight the debounce (the box renders local state, the URL write stays debounced), and still re-syncs on every URL change, which is the whole of B-6's requirement. The plan's stated objection — "a controlled value fed from the URL fights its own debounce" — applies to `value={search}`, not to this shape.
- **NOT MEASURED.** There is no DOM-rendering test infrastructure in this repo (no `@testing-library/react`; every gate is a source read) and the container serves pre-40-11 code, so this is reasoned from React's remount semantics, not observed. **It needs 30 seconds of manual typing at 40-15/UAT to confirm or dismiss.**

---

**Total deviations:** 3 auto-fixed (2 × Rule 1, 1 × Rule 3), 1 reported and deliberately not acted on (Rule 4).
**Impact on plan:** none on scope. All three auto-fixes are to my own gates, and all three make a gate able to fail for the reason it exists.

## Issues Encountered

**The worktree was branched from `cbf3229` (phase 34), six phases stale** — as predicted in the dispatch, and now four for four this phase. Corrected with `git merge --ff-only master` to `c59575c` before touching anything; all six upstream `40-*` artefacts verified present afterwards.

**The plan's task-2 `<done>` asks for a manual proof against the running container** — open a view, type in the search box, confirm the address bar still carries `view=<id>` and the picker shows `Modified`. **NOT RUN, and it could not be.** The Docker container serves the pre-40-11 build, plan 40-15 owns this phase's only rebuild, and two sibling executors (40-12, 40-13) are live against the same container and database. Restarting it would have broken them. The static half of that claim is gated (`withViewEscape` receives seeded params carrying `view`, asserted per call site); the round-trip half is deferred to 40-15/UAT and is listed below.

## Verification

| Check | Result |
|-------|--------|
| `npm run typecheck` | 0 errors |
| `npx eslint src/app/organizations src/app/people` | 0 issues |
| `npm run lint` (full) | 0 errors, 125 warnings — baseline exactly |
| `npx vitest run` | **3699 passed, 0 failed** (baseline 3661 + 38 new rows) |
| `npx vitest run --config vitest.rsc.config.ts` | 8 passed, 0 failed |
| `src/app/organizations/__tests__/` | 52 passed (14 pre-existing toolbar + 18 + 20) |
| `toolbar-wiring.test.ts` still green | yes — the bar is a SIBLING of that row, not a child |
| `git diff` on `placeholder=` literals | no lines changed, either file |
| Files touched outside the four declared + 2 gates + this SUMMARY | none |

## Deferred to 40-15 / UAT

1. **The `key={search}` focus-loss question above.** Type into the search box on `/organizations`, pause a second, keep typing. If the later characters do not appear, deviation 4 is confirmed and the local-state shape is the fix.
2. **The `view=<id>` round trip.** Open a saved view, type in the search box, confirm the address bar still carries `view=<id>` and the picker still names the view with a `Modified` badge.
3. **The default-view landing.** Visit `/organizations` bare with a default view set; confirm the URL ends up carrying the view's filters plus `view=<id>`, and that clearing the search box from there lands on `?view=none` and STAYS there.

## Known Stubs

None. Every prop the bar renders from is resolved server-side by `resolveSavedViewsBarProps`; nothing on either surface is wired to a placeholder or an empty literal.

## Next Phase Readiness

`/organizations` and `/people` are done. Plans 40-12 (`/deals`) and 40-13 (`/activities`) mount the same bar on the two remaining surfaces and were running in parallel with this one. **Plan 40-14's call-site gate can be written against the line table above** — note the two named detail-route exemptions at `organizations/data-table.tsx:370` and `people/data-table.tsx:311`, whose expression text is unchanged.

---
*Phase: 40-saved-views-shared-filters*
*Completed: 2026-08-21*

## Self-Check: PASSED

All 7 claimed files exist on disk; all 5 claimed commit hashes resolve in `git log`.
