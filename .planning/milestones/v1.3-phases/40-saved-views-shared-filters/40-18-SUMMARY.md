---
phase: 40-saved-views-shared-filters
plan: 18
subsystem: ui
tags: [url-params, saved-views, next-app-router, urlsearchparams, uuid, vitest]

# Dependency graph
requires:
  - phase: 40-01
    provides: "the merged url-params.ts URL vocabulary — VIEW_ESCAPE_KEY/VALUE, the two predicate tables, pickFilterParams, filtersToSearchParams, withViewEscape"
  - phase: 40-05
    provides: "resolve.ts's four pure decisions, and the measurement that isModified was structurally unreachable (FINDING 1)"
provides:
  - "A ?view=<id> selection carrier: parseViewSelection, narrowViewSelectionId, VIEW_ID_PATTERN, ViewSelection, withViewSelection"
  - "withViewEscape PRESERVES a parsed selection whenever a saveable filter survives — the one behavioural change"
  - "selectViewForParams resolves the id the URL NAMES; filter equality no longer selects anything"
  - "redirectTargetFor takes an optional third viewId, so a default-view landing arrives with its view named"
  - "A composition sweep proving `selectedViewId !== null && isModified === true` is reachable: 16 URLs x 3 views, 4 such rows"
affects: [40-08, 40-10, 40-14, 40-16, saved-views-bar, save-dialog, manage-dialog]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One grammar per URL control param: parseViewSelection is the single reader, shared by the client writer (withViewEscape) and the server resolver"
    - "Two narrowings for one id, deliberately asymmetric: shape-bounded for a value echoed into the address bar, length-bounded for a POST body that will be looked up"
    - "A composition sweep beside the unit tests, asserting the DISTRIBUTION of paired outputs rather than each part in isolation"

key-files:
  created: []
  modified:
    - src/lib/views/url-params.ts
    - src/lib/views/__tests__/url-params.test.ts
    - src/lib/views/resolve.ts
    - src/lib/views/__tests__/resolve.test.ts

key-decisions:
  - "Selection is what the URL SAYS (?view=<id>), never what its filters imply — equality never identified a view uniquely anyway, which is what the deleted tiebreak was papering over"
  - "A URL carrying a view's exact filters but no ?view=<id> shows All records. Accepted, stated in the file, and asserted by two sweep rows"
  - "?view= is narrowed to a v4-shaped uuid, not length-bounded: every id is crypto.randomUUID() so it refuses nothing real, and the value round-trips the address bar"
  - "Escape and selection are mutually exclusive and no-filters wins; at most one view key is ever emitted"
  - "An unresolvable id (deleted, unshared, another user's private) degrades to no selection with no notice and no throw — three causes, one answer"
  - "The preservation rule lives in withViewEscape, not threaded as a prop: every prospective call site gets it with zero edits"
  - "ACCEPTED WART, written into resolve.ts: a stale ?view=<id> persists across filter changes because the client writer has no view list. Harmless by construction"

patterns-established:
  - "Discriminating negative proofs: a proof must be run AND must fail by name; when a merged test does not discriminate, record that it stayed green as the finding"
  - "Fixture ids match the production id space (uuids), so a narrowing at the boundary is exercised end-to-end rather than bypassed"

requirements-completed: [VIEW-01, VIEW-02]

# Metrics
duration: 74min
completed: 2026-08-21
---

# Phase 40 Plan 18: The `?view=<id>` URL Carrier Summary

**A `?view=<id>` carrier added to the saved-view URL contract, so which view is open is something the URL says rather than something inferred from filter equality — turning `selected && modified` from a structurally impossible state into one a composition sweep measures four times.**

## Performance

- **Duration:** ~74 min
- **Started:** 2026-08-21T11:35Z
- **Completed:** 2026-08-21T12:49Z
- **Tasks:** 3 of 3
- **Files modified:** 4 (2 source, 2 test)

## Accomplishments

- `withViewEscape` now **preserves** a parsed selection when a saveable filter survives. This is the one behavioural change in the plan, and it is the whole fix: every prospective writer already passes the current `useSearchParams()`, so the selection survives by virtue of being in the input.
- `selectViewForParams` resolves the id the URL **names** against the visible views. The equality matching, the `matches.filter` and the three-level tiebreak reduce are gone.
- The composition sweep **measures** what 40-05 measured and got zero from: 16 URLs x 3 views, **8 selections, 4 of them modified**. Reverting selection to equality reproduces 40-05 exactly — 8 selections, **0** modified — while all 7 `computeIsModified` unit tests stay green.
- The uuid narrowing is asserted by the inputs that actually discriminate it, and the plan's prediction that the merged hostile-value test does **not** discriminate was confirmed by running it.
- `next build` compiled successfully in 53s with 0 errors — no `"use server"` export violation.

## Task Commits

1. **Task 1: the URL grammar — parseViewSelection, withViewSelection, preservation** — `cf1e0d9` (feat)
2. **Task 2: selection comes from the URL** — `93f9af7` (feat)
3. **Task 3: the composition sweep** — `2a621a5` (test)

## Files Created/Modified

- `src/lib/views/url-params.ts` — added `VIEW_ID_PATTERN`, `ViewSelection`, `narrowViewSelectionId`, `parseViewSelection`, `withViewSelection`; modified `withViewEscape`'s body (one `else if`) and rewrote its header.
- `src/lib/views/__tests__/url-params.test.ts` — +414 lines, four new `describe` blocks and five new `ESCAPE_TABLE` rows. **Zero existing assertions edited.**
- `src/lib/views/resolve.ts` — `selectViewForParams` rewritten to resolve by id; `SelectViewOptions.viewId` added; `redirectTargetFor` gained an optional third `viewId`; private `hasViewEscape` deleted in favour of `parseViewSelection`; `resolveDefaultViewRedirect` now names its view.
- `src/lib/views/__tests__/resolve.test.ts` — selection block rewritten, tiebreak block deleted, 6 `redirectTargetFor` tests added, and the composition sweep added.

## The Sweep's Distribution (green, verbatim from the assertion message)

```
THE SWEEP: 16 URLs x 3 views
  a bare URL                                           selected=null                   modified=false canUpdate=false
  the escape alone                                     selected=null                   modified=false canUpdate=false
  the escape beside a view's exact filters             selected=null                   modified=false canUpdate=false
  a view's EXACT filters with no view key — the 40-05 case selected=null                   modified=false canUpdate=false
  another view's exact filters with no view key        selected=null                   modified=false canUpdate=false
  a view opened cleanly                                selected=…2c3d4e (clean)        modified=false canUpdate=true
  a view opened cleanly, on page 2 — page is not a filter selected=…2c3d4e (clean)        modified=false canUpdate=true
  a view with a CHANGED filter                         selected=…2c3d4e (modified)     modified=true  canUpdate=true
  a view with an ADDED filter                          selected=…2c3d4e (modified)     modified=true  canUpdate=true
  a view with a REMOVED filter                         selected=…2c3d4e (modified)     modified=true  canUpdate=true
  somebody else's shared view, opened cleanly          selected=…2c3b4a (clean)        modified=false canUpdate=false
  somebody else's shared view, modified                selected=…2c3b4a (modified)     modified=true  canUpdate=false
  a well-formed id naming no visible view              selected=null                   modified=false canUpdate=false
  a hostile view value beside a real filter            selected=null                   modified=false canUpdate=false
  a degraded view opened at its surviving keys         selected=…3b4c5d (degraded)     modified=false canUpdate=true
  a selection with no filters at all — U-2 refuses it  selected=null                   modified=false canUpdate=false
  --> selections: 8, selected && modified: 4
```

Both of B-5's previously-unreachable rows are now populated: `selected && modified && canUpdate` (→ `views.saveChanges`) by the three `VIEW_1` modified rows, and `selected && modified && !canUpdate` (→ `views.saveNew`, with `views.save.targetNewOnly`) by the shared-view row.

## Negative Proofs — all five RUN, each failing by the thing it names

### (a) `narrowViewSelectionId`'s uuid test replaced with `trimmed.length <= 64`

**31 failures.** The three discriminating rows went RED by name:

```
RED | withViewEscape PRESERVES a selection :: deletes a hostile view value even when a filter survives: 'search=acme&view=%3Cscript%3E'
RED | withViewEscape PRESERVES a selection :: deletes a hostile view value even when a filter survives: 'pipeline=p1&view=%2F%2Fevil.example'
RED | withViewEscape PRESERVES a selection :: deletes a hostile view value even when a filter survives: 'search=acme&view=a&view=b'
```

**AND THE FINDING, WHICH IS THE POINT OF THIS PROOF:**

```
MERGED T-40-05: passed | normalises a hostile view value rather than carrying it into a navigation (T-40-05)
```

The merged hostile-value test **stayed GREEN under the permissive parser**, exactly as the plan predicted. So did every idempotence row, including the two new hostile-beside-a-filter ones:

```
passed | is idempotent: 'a hostile view value'
passed | is idempotent: 'a hostile view value beside a survivi…'
passed | is idempotent: 'a repeated view value beside a surviv…'
```

Idempotence does not discriminate either — `search=acme&view=a` is a fixed point of the permissive rule. The narrowing is asserted **only** by the three filter-present equality rows, and by `refuses to mint a JUNK selection` in `withViewSelection`. Restored, green.

### (b) The new `else if` preservation branch deleted

**Exactly 4 failures, all preservation assertions:**

```
RED | keeps the selection when a filter survives
RED | THE isModified PATH: a filter changed while a view was open, the selection survives
RED | keeps page, the filter AND the selection together
RED | still works on a read-only URLSearchParams while preserving
```

And the measurement that says the merged suite could never have caught this: **all 111 expanded assertions of the merged `describe("withViewEscape — U-1")` block (21 `it` declarations) stayed GREEN**, statuses = `{'passed'}`. Restored, green.

### (c) `selectViewForParams` reverted to the equality body, resolve unit tests

**5 failures**, led by the named one:

```
RED  | FILTER EQUALITY ALONE DOES NOT SELECT — the regression 40-05 measured
RED  | returns the id the URL names
RED  | returns null when the URL names no view
RED  | selects a DEGRADED view by id at its surviving keys, and it is not Modified
RED  | never throws on a hostile filter map or a hostile viewId
```

All 7 `computeIsModified` tests green. All 16 `redirectTargetFor` tests green. Restored.

### (d) The same injection against the composition sweep — the pairing that is the whole task 3

```
computeIsModified unit block: 7 -> {'passed'}
RED  | REACHES `selected && modified` — the state 40-05 measured ZERO of
RED  | makes B-5's saveChanges row live — selected, modified AND updatable
RED  | a filters-only row is ALWAYS { null, false } — even when the filters equal a view's exactly
RED  | an unknown id and a junk value are both { null, false }, and neither throws
RED  | 6 of the 16 per-row expectations
```

The sweep's own table under the injected defect **reproduces 40-05's measurement**:

```
  a view with a CHANGED filter                         selected=null                   modified=false canUpdate=false
  a view with an ADDED filter                          selected=null                   modified=false canUpdate=false
  a view with a REMOVED filter                         selected=null                   modified=false canUpdate=false
  a well-formed id naming no visible view              selected=…2c3d4e (unresolved)   modified=false canUpdate=true
  a hostile view value beside a real filter            selected=…2c3d4e (junk)         modified=false canUpdate=true
  --> selections: 8, selected && modified: 0
```

**8 selections, 0 modified**, while every unit test of `computeIsModified` stayed green. That pairing is the proof the sweep covers a surface the unit tests cannot see. It also surfaced something the plan did not predict: under equality, a **hostile** `?view=<script>` value and an **unknown** id both SELECT a view (the equality path ignores the param entirely), so the id-based contract is a security improvement as well as a reachability one. Restored, green.

### (e) The threshold flip used to capture the green table

`toBeGreaterThan(0)` → `toBeGreaterThan(9999)` on the key assertion, to print the passing distribution verbatim rather than paraphrase it. Restored; `grep toBeGreaterThan(9999)` is empty and the suite is green.

## `resolve.test.ts` — every case amended or deleted, as required

**Deleted (4 tests):**

| Test | Why |
|---|---|
| `deterministic tiebreak…` → `prefers the viewer's own view over a shared one` | A URL names one id; there is no tie to break |
| `deterministic tiebreak…` → `then prefers the lower name` | same |
| `deterministic tiebreak…` → `then prefers the lower id, so the result is total` | same |
| `matches regardless of the order the URL keys were written in` | Key order no longer participates in selection. **The property is not unguarded:** `filtersToSearchParams`' canonical order is still asserted in `url-params.test.ts` (`uses SAVEABLE_FILTER_KEYS order`, `serialises the same pairs…`) and in `resolve.test.ts`'s `redirectTargetFor` → `serialises in canonical whitelist order regardless of insertion order`, and it is still load-bearing for `computeIsModified` |

**Rewritten (4 tests):**

| Was | Is |
|---|---|
| `returns the id of the view whose validated filters equal the URL` | `returns the id the URL names` — keeps its ANTI-VACUITY comment, and adds the converse: the same filters with the OTHER id named select the other view |
| `returns null when nothing matches` | `returns null when the URL names no view` — plus the unknown-uuid and junk-value causes |
| `compares the VALIDATED set, so a degraded view is still selectable at its surviving keys` | `selects a DEGRADED view by id at its surviving keys, and it is not Modified` — same fixture, now asserting `computeIsModified === false` beside the selection (B-2 reason 2), and `true` when the dead key returns |
| `never throws on a hostile filter map` | `never throws on a hostile filter map or a hostile viewId` — 6 filter maps x 12 hostile ids, plus an explicit `__proto__`-as-id assertion |

**Amended, not rewritten (1 test):** `returns null when the URL carries no filters, even with views available` — the original assertion is intact; three assertions were **added** so it exercises the U-2 refusal (a valid `viewId` with an empty, whitespace-only, and `page`-only filter set). Without them the test would still have passed via the early `viewId === null` return, which is not the branch the plan wanted covered.

**Kept verbatim:** `returns null when ?view=none was present, even alongside a crafted filter` (still uses the `"v1"` fixture id, which is correct — it returns before the narrowing).

**Added (9 tests + the 16-row sweep):** the equality regression test, `the escape BEATS a selection`, and six `redirectTargetFor` cases for the third parameter.

**`computeIsModified`: not one test changed.** Stated here because "the unit tests were all green" is exactly why this defect survived to wave 3. The function was implemented correctly and tested against both outcomes in 40-05; the defect was always the composition.

## Verification

| Check | Result |
|---|---|
| `npx vitest run src/lib/views/` | 817 passed, 0 failed |
| `npx vitest run src/lib/export/` (view-filters) | included in the 680-pass task-1 run, 0 failed |
| `npm test` (full) | **3623 passed, 28 skipped**; rsc config 8 passed. 134 files passed, 1 skipped |
| `npm run typecheck` | clean (`tsc --noEmit`, no output) |
| `npm run lint` | **0 errors**, 125 pre-existing warnings, **0 of them in `src/lib/views`** |
| `npx next build` | `✓ Compiled successfully in 53s`, **0 errors** |
| `git diff ecdc0f8 HEAD -- src/lib/views/types.ts` | empty (the eight props unchanged; V-40-5 needs no update) |
| `git diff ecdc0f8 HEAD -- src/lib/views/write-guards.ts` | empty |
| `git diff ecdc0f8 HEAD -- package-lock.json package.json drizzle/` | empty |
| `drizzle/meta/_journal.json` | still ends at `idx: 18` (`0018_adorable_smasher`); no migration generated |
| `SAVEABLE_FILTER_KEYS` / `EXPORTABLE_FILTER_KEYS` | no diff hunk in `url-params.ts` mentions either identifier; both declarations byte-identical, and 40-01's `difference === {deal: ["pipeline"]}` and `EXPORTABLE ⊆ SAVEABLE` loop are green |
| Dev row counts | **unchanged** — organizations 46,054 · people 38,348 · deals 25,195 · notes 75,236 · activities 79,022 · audit_log 213 · saved_views 0 · saved_view_defaults 0 · users 10 total / 4 live. No write of any kind was issued |

## Decisions Made

1. **`withViewSelection` delegates both refusals to `withViewEscape`** rather than emitting its own no-filter string, so "what a navigation with no filters looks like" has one definition.
2. **`redirectTargetFor`'s selection branch calls `withViewSelection`** rather than concatenating `&view=`, for the same reason. Its no-filters branch is unreachable from there because the empty-set `null` guard runs first — commented as such.
3. **The escape is matched exactly (`=== "none"`, untrimmed)**, which is byte-for-byte what the deleted `hasViewEscape` did. Trimming would have been this parser repairing input, and it changes nothing observable: `?view=%20none%20` is `absent` either way and resolves identically.
4. **`selectViewForParams` re-narrows the id** even though `resolveSavedViewsBarProps` only ever hands it a parsed one. It is exported and unit-tested directly, so one grammar at every entry point. **Consequence: `resolve.test.ts`'s selection fixtures had to become uuids** — a `"v1"` id is no longer selectable. That is a feature, not a cost: the boundary narrowing is now exercised end-to-end instead of bypassed by convenient fixtures.
5. **`narrowViewSelectionId` returns the trimmed value verbatim, not lower-cased.** A hand-typed upper-case uuid resolves to no visible view, which the resolver already renders as an unfiltered list.
6. **`VIEW_ID_PATTERN` is not `g`-flagged**, and that is asserted: a global regex carries `lastIndex` between `.test` calls, which would make the predicate depend on call order.

## Deviations from Plan

### 1. [Rule 2 — missing critical verification] The sweep also returns `canUpdateSelected`

- **Found during:** Task 3
- **Issue:** The plan specified the sweep return `{selectedViewId, isModified}`. But the surface 40-05 named as unreachable is B-5's `views.saveChanges` row, whose condition is `canSave && selectedViewId && isModified && canUpdateSelected` — a sweep over two of those three cannot demonstrate the row is live, and its `!canUpdateSelected` sibling (the `views.saveNew` + `views.save.targetNewOnly` branch, S-4) is a different row again.
- **Fix:** `composeBarState` returns a third field derived exactly as `resolveSavedViewsBarProps` derives it (`selected?.summary.canEdit ?? false`), one of the three sweep views is somebody else's shared, non-editable view, and one test asserts both rows are populated. Commented as mirroring the wrapper's one-line derivation rather than being one of the four gated functions.
- **Verification:** `makes B-5's saveChanges row live` is green, and goes RED under negative proof (d).
- **Committed in:** `2a621a5`

### 2. [Rule 1 — my own test was wrong] The hostile-id table over-applied to `parseViewSelection`

- **Found during:** Task 1, first GREEN run (1 failure out of 681)
- **Issue:** I reused `HOSTILE_VIEW_IDS` for the `parseViewSelection` "junk → absent" table. One entry is `[VIEW_UUID]` — hostile for `narrowViewSelectionId`, which takes a raw value, but **not** for `parseViewSelection`, whose `firstParam` legitimately unwraps a one-element array. That is Next's repeated-param shape and is asserted as a **selection** two tests earlier.
- **Fix:** excluded arrays (and the escape value) from that one table, with a comment saying why. The implementation was correct; the assertion was not. Per the plan's discipline I did not adjust the code to match the test.
- **Verification:** 680 passed, 0 failed.
- **Committed in:** `cf1e0d9`

### 3. [Plan instruction followed, recorded because it touches a shared fixture] Five rows added to `ESCAPE_TABLE`

The plan asked for the new rows to join the existing `ESCAPE_TABLE`, which the merged idempotence and no-leading-`?` tests iterate. No existing **assertion** was edited, but two existing tests now run over five more inputs. All green, and negative proof (b) confirms the 21 merged declarations are unaffected by the preservation branch.

---

**Total deviations:** 3 (1 missing-critical verification, 1 self-inflicted test bug, 1 recorded fixture growth)
**Impact:** No scope creep. Deviation 1 is the only one that added coverage beyond the plan, and it covers the exact surface the plan exists to unblock.

## Findings for later plans

### FINDING 1 (important) — the "thirteen call sites" do not exist yet

The plan and the file comments both say preservation reaches 13 call sites with no edit. **Measured: `withViewEscape` currently has ZERO importers outside `url-params.ts` itself and its test.** `grep -rln withViewEscape src/` returns only `url-params.ts`, `url-params.test.ts`, and `resolve.ts` (two comment mentions). The client writers — `organizations/data-table.tsx`, `people/data-table.tsx`, `activities/activity-filters.tsx`, `activities-client.tsx`, `deals/deal-filters.tsx`, `components/views/*` — are owned by later plans and 40-14 gates them.

So "zero call-site edits" is a claim about the future, and it is the right architecture, but **the property is currently unasserted at any call site**. Whoever owns 40-14's gate should assert that each writer passes the live `useSearchParams()` through `withViewEscape` (not a reconstructed params object), because a writer that rebuilt its params from scratch would silently drop the `view` key and re-open this exact defect with the helper unchanged and its tests green.

### FINDING 2 — the resolver's wrappers have no callers either

`resolveSavedViewsBarProps`, `resolveDefaultViewRedirect` and `redirectTargetFor` have no importers outside `src/lib/views/`. That is why `redirectTargetFor`'s third parameter needed to be optional for **test** compatibility rather than page compatibility — no page file needed editing. It also means the `?view=<id>` contract has not yet been exercised against a real navigation; V-9's `router.push` (40-10) is where `withViewSelection` gets its first live caller.

### FINDING 3 — V-9's wording now names the wrong helper

UI-SPEC V-9 says selecting a view navigates "through `withViewEscape` (U-1)". After this plan, selecting a view must go through **`withViewSelection`** — `withViewEscape` preserves a selection but never creates one, and it also preserves `page`, which V-9's own next sentence forbids ("a view lands you on page 1"). `withViewSelection` drops `page` and both halves are asserted side by side in `url-params.test.ts`. `views.allRecords` still navigates through `withViewEscape` to `?view=none`, unchanged. **40-10 should read V-9 as `withViewSelection` for the view items and `withViewEscape` for All records.**

### FINDING 4 — under the old equality rule, a hostile `?view=` value SELECTED a view

Surfaced by negative proof (d) and not predicted by the plan: because equality ignored the `view` param entirely, `?pipeline=p1&stage=s1&view=<script>` and `?…&view=<unknown-uuid>` both resolved to a selected view. The id-based contract refuses both. So this plan is a small security improvement as well as a reachability fix — worth stating because the phase's threat register frames T-40-85 as a *new* surface introduced by the carrier, when the carrier in fact narrows an existing one.

### FINDING 5 — idempotence does not discriminate the narrowing either

The plan predicted the merged T-40-05 test would not discriminate a permissive parser, and it was right. Measured additionally: **the whole idempotence family does not discriminate it either**, including the two new hostile-beside-a-filter rows, because `search=acme&view=a` is a fixed point of the permissive rule. Anyone tempted to drop the three explicit equality rows in favour of "it's covered by idempotence" would be removing the only assertion that holds the narrowing.

## Threat Flags

None. Every threat in the plan's register was mitigated as written and is asserted: T-40-85 (three filter-present rows + `refuses to mint a JUNK selection` + `emits NO view key rather than a junk one`), T-40-86/87 (`returns null when the URL names no view`, three causes one answer), T-40-88 (`still returns null for an empty validated set even when a view is named`), T-40-89 (`emits AT MOST ONE view key on every branch` + the extended `ESCAPE_TABLE` idempotence), T-40-90 (`refuses to mint a selection with no saveable filter`), T-40-91 (both tables byte-identical), T-40-92 (`next build` clean), T-40-SC (nothing installed, `package-lock.json` diff empty).

No new security-relevant surface was introduced beyond the register: no endpoint, no auth path, no file access, no schema change.

## Known Stubs

None. Every function added is fully implemented and asserted from both directions.

## Issues Encountered

- **Stale worktree base, as forecast.** HEAD was `cbf3229`, an ancestor of the expected `ecdc0f8`; `git reset --hard ecdc0f8` corrected it. Eighteen for eighteen executors in this phase now.
- **`vitest`'s output is summarised by the `rtk` wrapper**, which truncates the failure list to five entries. Every proof above was therefore captured via `--reporter=json --outputFile` and parsed, which is also why the counts and statuses quoted are exact rather than eyeballed.
- **The green distribution table is not printable from a passing test**, so it was captured by temporarily raising the assertion's threshold (proof (e)) rather than by a parallel script that would have duplicated the composition logic.

## Next Phase Readiness

- Wave 3's blocker is cleared: `selected && modified` is reachable, measured four ways, and pinned by a sweep that reddens if anyone reintroduces equality selection.
- **40-08** (save dialog) can build the target `RadioGroup`: both S-3 (`targetUpdate`, `canUpdateSelected` true) and S-4 (`targetNewOnly`, false) are reachable states in the sweep.
- **40-10** (the bar) can build slot 2's `views.saveChanges` — and should read FINDING 3 before wiring V-9.
- **40-14** (call-site gate) owns FINDING 1, which is the one place this fix could still be silently undone.
- **40-16** already amended itself to parse the default redirect rather than string-match it; that redirect now carries `view=<id>`, so the amendment is required, not optional.

## Self-Check: PASSED

All four modified files present on disk. All three task commits present in `git log`
(`cf1e0d9`, `93f9af7`, `2a621a5`), each on `worktree-agent-a4045951270cc93b0` and none of them
deleting a tracked file (`git diff --diff-filter=D HEAD~1 HEAD` empty after each). No untracked
files left behind. `STATE.md`, `ROADMAP.md` and `REQUIREMENTS.md` deliberately untouched — the
orchestrator owns those writes.

---
*Phase: 40-saved-views-shared-filters*
*Plan: 18*
*Completed: 2026-08-21*
