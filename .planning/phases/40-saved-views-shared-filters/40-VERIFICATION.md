---
phase: 40-saved-views-shared-filters
verified: 2026-08-22T15:22:51Z
verified_at_commit: c082340
verdict: achieved_with_qualifications
status: gaps_found
score: 4/4 success criteria met — 3 unqualified, 1 (criterion 4) met with a deliberate narrowing and an open security regression
overrides_applied: 0
re_verification:
  previous_status: none
  note: initial verification
evidence_generated_by_this_verification:
  - "npx vitest run — 3842 passed / 28 skipped (146 files passed, 1 skipped). Matches the orchestrator's figure."
  - "npx tsc --noEmit — exit 0."
  - "npx eslint . — 0 errors, 127 warnings."
  - "npx playwright test e2e/saved-views-visibility-member.spec.ts — 6 passed at HEAD."
  - "npx playwright test e2e/saved-views-visibility-admin.spec.ts — 4 passed at HEAD (1 flaky setup login, retried green)."
  - "npx playwright test e2e/saved-views-320.spec.ts — 24 passed at HEAD (includes the D-40-1 test.fail())."
  - "npx playwright test e2e/saved-views-degraded.spec.ts — 8 passed at HEAD."
  - "npx playwright test e2e/viewport-320.spec.ts — 23 passed at HEAD."
  - "npx playwright test e2e/deals-drag.spec.ts — 2 chromium tests + 2 setup passed at HEAD."
  - "DATABASE_URL=... npx vitest run src/lib/export/formatters-live.test.ts — 23 passed, 1 FAILED. New finding, see G-1."
  - "Read-only psql against the live database — WR-04 re-measured independently, and the activity status partition measured."
  - "docker image inspect pipelite-app — image built 2026-08-22T11:56 and confirmed to contain HEAD's last commit (c082340) by grepping the built chunks."
gaps:
  - truth: "The phase's only live-database proof of the export path is green"
    status: failed
    reason: >-
      src/lib/export/formatters-live.test.ts FAILS at HEAD when run with a DATABASE_URL.
      The WR-05 fix (7f8982e) narrowed the `pending` predicate from "incomplete" to
      "incomplete AND not yet due", which changed the live count from 4,165 to 14 and broke
      the two-way-partition assertion plan 40-07 wrote at line 282. The fix note states this
      file "was not relied on as a gate" — which is exactly why the breakage went unseen. The
      file's own header says it exists because a wholly-mocked suite once passed a malformed
      drizzle fragment in Phase 37.
    artifacts:
      - path: "src/lib/export/formatters-live.test.ts"
        issue: >-
          Line 282 `expect(results.completed + results.pending).toBe(baseline.activities)`
          — expected 79022, received 74871 (short by exactly the 4,151 overdue rows). The next
          assertion, `expect(results.overdue).toBeLessThanOrEqual(results.pending)`
          (4151 <= 14), would also fail but is never reached.
    missing:
      - "Update the assertion to the three-way partition the WR-05 fix actually produces: completed + pending + overdue === total (measured live: 74,857 + 14 + 4,151 = 79,022)."
      - "Update the stale comment at :285 which still quotes '4,165 pending / 4,151 overdue'."
      - "Give this file a way to be run that someone actually runs, or it will go red again silently."
  - truth: "A user refused an export is told why, correctly"
    status: partial
    reason: >-
      The `views.export.disabledReason` string is wrong in the one case the whole criterion-4
      narrowing exists for. On /deals with only a pipeline selected the Export item is
      disabled and reads "Choose at least one filter first. An unfiltered export isn't
      allowed." — but the user HAS chosen a filter. The board selector is saveable and simply
      not exportable. This is the same defect class as WR-02, which this phase already fixed
      once: a string promising or explaining something the server does not do.
    artifacts:
      - path: "src/messages/en-US.json (views.export.disabledReason, + pt-BR, es-ES)"
        issue: "One generic reason covers two distinct refusals; it is accurate for one and misleading for the other."
      - path: "src/components/views/saved-views-bar.tsx:485-488"
        issue: "Renders the single reason unconditionally when !canExport, with no discrimination of the pipeline-only case."
    missing:
      - "A second string for the deals/pipeline-only case, e.g. 'A board on its own is too broad to export. Add a stage, owner, assignee or date range.'"
      - "Select between the two in the bar based on whether canSave && !canExport."
  - truth: "The phase's two open security findings are tracked somewhere a later reader will look"
    status: failed
    reason: >-
      WR-04 (the export guard is satisfiable by a one-character search) and IN-06 (CSV formula
      injection, audience widened by this phase) have NO entry in BACKLOG.md and no deferred-items
      entry. D-40-1 and D-40-3 were both given backlog entries (#12 and #10); the two security
      findings were not. Their only record is inside 40-REVIEW.md, which is a phase artifact
      nobody reads after the phase closes.
    artifacts:
      - path: ".planning/BACKLOG.md"
        issue: "grep for WR-04, EXPORT_ROW_CAP, 44,254, 'formula injection', 'Papa.unparse' returns nothing."
    missing:
      - "A BACKLOG entry for WR-04 carrying its measurement (44,254 of 46,054 organizations, re-measured at verification time and identical)."
      - "A BACKLOG entry for IN-06 noting that Phase 40 changed who can trigger it."
human_verification:
  - test: >-
      Criterion 4, end to end in a browser at HEAD. On /organizations, set a narrow search,
      save it as a view, reopen the view, open the picker and choose "Export these results (CSV)".
      Confirm a file downloads, the success toast row count matches the list, and the CSV opens
      with the expected rows and custom-field columns. Then on /deals select only a pipeline
      and confirm the Export item is disabled.
    expected: >-
      A CSV downloads with a server-generated filename and a row count matching the list;
      the /deals pipeline-only case shows the Export item disabled with a reason.
    why_human: >-
      ZERO e2e specs in this repo reference export or download — grep across all of e2e/*.spec.ts
      finds one incidental match. The export path is proven only by unit tests that render SQL
      through PgDialect and by a live read-only probe of the fetchers. Nothing has ever driven
      the menu item, the Blob download, or the toast. The human checkpoint's "approved" was
      given at 10:41, before all seven review-fix commits (11:18-11:59), and 40-17-SUMMARY
      states explicitly that it does not attest which steps were exercised.
  - test: >-
      Open /activities and read the summary stats row and the Status filter. Select "Pending".
    expected: >-
      A coherent story. "Pending" now returns 14 of 79,022 activities (previously 4,165);
      "Overdue" returns 4,151. Confirm the three stats and the three filter options read as
      three exclusive buckets and that this is the intended product meaning.
    why_human: >-
      WR-05 changed what a user-facing filter MEANS, by a factor of 300, and it landed after
      the human approval. The change is defensible and the review argued for it, but no human
      has looked at the resulting screen. Measured live: completed 74,857 / pending 14 /
      overdue 4,151 / total 79,022.
  - test: >-
      Decide WR-04. Any authenticated non-admin can currently export 44,254 of 46,054
      organizations (96.1%), with notes and every custom field, by saving a view whose only
      filter is search=a.
    expected: >-
      Either a bound (a non-admin row cap, or a minimum-selectivity rule), or an explicit,
      recorded acceptance with a backlog entry.
    why_human: >-
      This is a policy change to Decision 2, not a defect the verifier can close. It is
      recorded here because Phase 38 gated exactly this behind an admin check and Phase 40
      removed that gate, so the exposure is a NET REGRESSION introduced by this phase, and it
      is currently untracked outside 40-REVIEW.md.
---

# Phase 40: Saved Views & Shared Filters — Verification Report

**Phase Goal:** The filter combinations users rebuild daily become named, shareable, exportable objects
**Verified:** 2026-08-22T15:22:51Z, at commit `c082340`
**Verdict:** **Goal achieved, with qualifications.** All four success criteria are met. One is met by a deliberate narrowing that I judge correct, and the same criterion carries an open, measured security regression that this phase introduced and that nothing currently tracks.
**Status:** `gaps_found` — three gaps, none of which invalidate a criterion, one of which is a red test at HEAD that no artifact mentions.
**Re-verification:** No — initial verification.

---

## What I did not take on trust

Every number below that is attributed to a summary was re-derived. Specifically:

- I re-ran the three saved-views e2e suites, plus `viewport-320` and `deals-drag`, against the
  container currently serving HEAD. The summaries' e2e evidence was produced at waves 8–9
  (01:00–02:00) against an **older image**; seven review-fix commits landed afterwards, two of them
  (WR-01, WR-06) inside the code those suites exercise. The suites had never been run against the
  fixed code. They pass.
- I confirmed the running image actually contains HEAD by grepping the built chunks for a class
  string introduced by the final commit (`flex flex-wrap gap-x-6 gap-y-2 text-sm`, from `c082340`).
  It is present in `.next/server/chunks/ssr/_aa0dbb77._.js` and in the client chunk. The image was
  built at 11:56 and the commit recorded at 11:59 — build before commit, same content.
- I re-measured WR-04 against the live database rather than quoting the review. Identical figure.
- I ran the one test file the phase declared as its live-database proof and that the fix note said
  was "not relied on as a gate". **It fails.** That is finding G-1, and it appears in no artifact.

---

## Goal Achievement

### Success Criterion 1 — save a filter set as a named view, reopen it later with the filters restored

**Status: MET.**

**Evidence, observed by me at HEAD:**

| What | Where | Result |
|---|---|---|
| Saving through the dialog creates a real row | `e2e/saved-views-320.spec.ts:1044` — fills the name, presses Enter, then queries `select id from saved_views where name = $1` directly | passed; row created |
| Reopening restores the filters into the URL **and** the search box, without a remount | `saved-views-320.spec.ts:832`, per surface | `/organizations`, `/people`, `/activities` all green; box reads `acme` after picker selection, empties after "All records" |
| The resync does not cost the caret (D-40-2) | `saved-views-320.spec.ts:905`, per surface | all three green |
| A fully valid **deals** view restores every stored key with no degradation | `saved-views-degraded.spec.ts:729` ANTI-VACUITY | `valid views on /activities and /deals: notice count 0, every stored key survived` |

**Code:** `src/lib/views/resolve.ts:430` `resolveSavedViewsBarProps` resolves all eight bar props
server-side; `saved-views-bar.tsx:198` navigates via `withViewSelection(entityType, view.filters, view.id)`.
`save-view-dialog.tsx:247` is a real `<form onSubmit={handleSubmit}>` with a `type="submit"` button at
`:390`, calling `createView` / `updateView` from `src/lib/views/actions.ts`. The bar is mounted on all
four surfaces (`organizations/data-table.tsx:433`, `people/data-table.tsx:373`,
`deals/kanban-board.tsx:533`, `activities/activities-client.tsx:395`).

**Caveats, stated rather than buried:**

1. **Thin on two of four surfaces.** A view on `/organizations` or `/people` stores one `search`
   string — `SAVEABLE_FILTER_KEYS.organization` is literally `["search"]`. This is Decision 1,
   accepted openly in 40-CONTEXT and repeated in the deferred list. The criterion as written is met:
   a filter set of one filter is a filter set, and it is saved and restored. The *value* on those two
   pages is small, and calling it "met" should not be read as calling it useful.
2. **The mouse-click save path is proven by inference, not by observation.** The 320 suite only
   *trial*-clicks the submit button (an actionability check that does not fire the handler). The
   handler is proven by the Enter-in-the-name-input test, which is DB-verified. Because the button is
   `type="submit"` inside a real `<form onSubmit>`, the two paths are the same handler and the
   inference is sound — but it is an inference, and it is the path every user takes.
3. **D-40-1 is live and is not contained.** With a modal over a keyboard-enabled list, Tab-to-the-submit
   and Enter navigates to the first row behind the dialog and discards the draft. I re-ran it: the
   `test.fail()` at `saved-views-320.spec.ts:980` still reports `✘` (i.e. still fails, as recorded).
   **Judgement: it does not undermine criterion 1.** The defect is app-wide and pre-existing
   (`F-39-08`, `data-table-keyboard.tsx` registers `enter` on the document with `isFormFocused()`
   exempting `INPUT` but not `BUTTON`), Phase 40 did not cause it, and the two ordinary save paths
   work. What Phase 40 did do is put a *new* dialog into its blast radius, over a list where the
   consequence is losing a typed draft. It is tracked as BACKLOG #12 with a live inverted test, which
   is the right shape for a defect record. It is a genuine keyboard-accessibility data-loss bug and
   should be fixed; it is not a criterion-1 failure.

### Success Criterion 2 — a shared view is seen by a teammate; a private view stays invisible to everyone else

**Status: MET, and this is the strongest-evidenced criterion in the phase.**

**Evidence, observed by me at HEAD, in both directions, live:**

```
[40-16 member] PICKER  | ADMIN_SHARED visible, MEMBER_PRIVATE visible, ADMIN_PRIVATE absent
[40-16 member] MANAGE  | ADMIN_SHARED visible, MEMBER_PRIVATE visible, ADMIN_PRIVATE absent
[40-16 member] session confirmed: pipelite-e2e-member@local.test, role=member, refused at /admin
6 passed
```

and the mirror, `saved-views-visibility-admin.spec.ts` — a member's private view absent from an
**admin's** picker and manage dialog. That is Decision 3's deliberate departure from the app's
`owner || role === "admin"` idiom, and it holds.

The two anti-vacuity companions are what make this a proof rather than a tautology: the same open menu
must show the admin's *shared* view and the member's *own private* view, and the group labels
`views.groupShared` / `views.groupMine` must both render, so "the private one is missing" is a
statement about that one view and not about an empty list.

**Code:** `visibleViewsPredicate` (`src/lib/views/queries.ts:133`) is
`or(eq(ownerId, viewerId), eq(isShared, true))` — one definition, no `role` parameter, applied in the
`WHERE` at `:152` and inside the `INNER JOIN` condition at `:241`, never as a post-fetch `.filter()`.

**WR-01 is genuinely closed.** I read all four write sites. `updateView` (`actions.ts:288`),
`setViewShared` (`:404`) and `deleteView` (`:540`) each now run
`if (!canSeeView(row, viewer)) return { success: false, error: "failed" }` **ahead of**
`canMutateView`, so an admin holding a private view's id can no longer flip it to shared, rename it,
or delete it and read its name back from the return value.

**Caveat — one new observation of mine, not in any artifact.** The WR-01 fix was applied to three
sites and not to the fourth. `setViewDefault` (`actions.ts:485`) answers an unseeable view with
`"forbidden"` while `!row` answers `"failed"`. That asymmetry is exactly the disclosure the WR-01 fix
was written to remove: a caller holding an id can distinguish "someone's private view exists" from "no
such view" through the one action that was not touched. Ids are v4 UUIDs and no path exposes a private
view's id to a non-owner, so this is Info, not a blocker — but the invariant is now enforced in three
places and contradicted in the fourth, which is how WR-01 arose in the first place.

### Success Criterion 3 — set a default view per entity type and land on it when opening that list

**Status: MET.**

**Evidence, observed by me at HEAD:**

```
[40-16 member] G-7 | landed on
  http://localhost:3001/organizations?search=adminshared&view=4a4b5828-...
  with the picker reading "[e2e] View visibility ADMIN_SHARED"
  — a member's default is a colleague's shared view
```

That single test carries the whole criterion *and* the cross-ownership case: the member sets an
**admin's shared** view as their default, then a bare `/organizations` redirects onto the view's stored
filters with `view=<id>` attached. The test asserts on the `views.manage.saved` toast rather than the
optimistic switch, so a refused write cannot pass it.

**Code:** all four pages call `resolveDefaultViewRedirect` and `redirect()` outside any try/catch,
guarded on the URL carrying no params at all (`organizations/page.tsx:127-129`, `people/page.tsx:135-137`,
`deals/page.tsx:79-80`, `activities/page.tsx:90-91`). The `?view=none` escape closes the
mutual-exclusion trap amendment A1 identified; `view-escape-call-sites.test.ts` (29 tests) gates all 17
navigations, and it is green.

**No caveat.** This one is clean.

### Success Criterion 4 — export the records matching a saved view

**Status: MET, with a deliberate narrowing that I judge correct, and an open security regression that I judge serious.**

**The mechanism exists and is wired.** `saved-views-bar.tsx:262` calls `exportViewResults` with
`pickFilterParams(entityType, searchParams)`; `export-action.ts` re-derives the filters through
`guardExportInput`, then calls `fetchFilteredData({ format: "csv", includeCustomFields: true,
maxRows: EXPORT_ROW_CAP })`, and the bar hands the result to the Blob/ObjectURL download idiom at
`:94`. Nothing here is a stub.

**The narrowing works and the invariant behind it is enforced, not asserted.**
`src/lib/export/__tests__/view-filters.test.ts` (48 tests) compiles each fetcher's real `WHERE` through
`PgDialect` and requires every key in `EXPORTABLE_FILTER_KEYS` to appear as an actual SQL predicate. It
parses rather than greps, so an explanatory comment naming a key cannot satisfy its own gate. Against
the live database (read-only), `search` narrows organizations to a strict non-empty subset, `status`
narrows activities, `too_many` fires above the cap, and an empty id list yields zero rows rather than
the whole table.

**On the deliberate narrowing — a `/deals` view scoped only by `pipeline` is REFUSED. Verdict: criterion 4 is still met.**

Reasoning, stated so it can be disagreed with. The criterion says "User exports the records matching a
saved view". Under the narrowing there exists a class of saveable view — deals, board selector only —
whose records cannot be exported. That is a real hole in the literal sentence. It is nevertheless the
right call, for three reasons: the refused class is one filter on one of four surfaces; the alternative
is authorizing a 15,415-row dump of the busiest board, which is precisely the unbounded export Phase 38
locked out; and the refusal is *visible* rather than silent — the menu item is disabled with its reason
rendered as an adjacent muted line, not hidden in a tooltip. `hasSaveableFilter` and
`hasExportableFilter` are two tables and not one filtered by `key !== "pipeline"`, and the header says
why: the rule is "this key provably narrows the query", not "not pipeline". That is the durable
formulation.

**But the explanation shown in exactly that case is wrong** — see gap G-2. The string is
"Choose at least one filter first. An unfiltered export isn't allowed." The user has chosen a filter.
The one situation the narrowing exists for is the one situation the UI misdescribes, and it is the same
defect class as WR-02, which this phase already fixed once.

**WR-04 — the security regression. Independently re-measured, and it should be said plainly.**

I ran this against the live database at verification time rather than quoting the review:

| measurement | value |
|---|---|
| organizations, not deleted | **46,054** |
| matched by `search=a` | **44,254** (96.1%) |

`EXPORTABLE_FILTER_KEYS.organization` is `["search"]`, `hasExportableFilter` asks only whether a
whitelisted key is *present*, and `EXPORT_ROW_CAP` is 50,000 — so 44,254 rows pass both controls.
`export-action.ts` contains no admin check by design (E-9) and hardcodes `includeCustomFields: true`.
Net effect: **any authenticated non-admin can obtain a CSV of 96% of the organizations table, with
notes and every custom field, in one action call.** Before this phase, a filters-taking export required
an admin gate (38-CONTEXT.md:110-116). Phase 40 removed that gate and replaced it with a presence test.
The guard's own header sets the standard — "IMPOSSIBLE to satisfy with no filter" — and meets it; the
*property* Phase 38 was protecting was bounded export, and that is measurably not delivered. IN-06
(CSV formula injection through attacker-controlled `notes`) compounds it: the phase widened who can
trigger a pre-existing hazard.

**Should it block? My answer, both halves:**

- **It should not block progression to Phase 41.** The phase goal is achieved; criterion 4's mechanism
  works; the widening is a recorded, owner-assigned Decision-2 consequence and not a slip; and Phase 41
  is orthogonal.
- **It should block milestone close, and it should block any deployment where non-admin accounts are
  not fully trusted with the whole customer table.** A phase that spent nine plans insisting a green
  gate which cannot fail is worth nothing should not ship a guard whose stated property is measurably
  absent. The cheapest honest fix is already written in the review: a `NON_ADMIN_EXPORT_ROW_CAP`.
- **And regardless of which way it is decided, it must be tracked.** Right now it is not — see gap G-3.
  `grep` over BACKLOG.md for `WR-04`, `EXPORT_ROW_CAP`, `44,254`, `formula injection` and `Papa.unparse`
  returns nothing. D-40-1 and D-40-3 both earned backlog entries; the two security findings did not.
  A finding whose only home is a phase review document is a finding that has been forgotten on a
  schedule.

**Coverage caveat.** Criterion 4 is the least-witnessed of the four. There is **no browser-level proof
at all** — a grep for export/download across every `e2e/*.spec.ts` returns one incidental match.
The proof is unit tests that render SQL, a read-only live probe of the fetchers, and a human "approved"
that 40-17-SUMMARY itself says does not attest which steps were run. See the human-verification section.

---

## Score

**4/4 success criteria met.** Three unqualified; criterion 4 met with a documented narrowing and an
open, untracked security regression.

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/db/schema/saved-views.ts` + `drizzle/0018_*.sql` | Two tables, migration applied | VERIFIED | `\d saved_views` against the live DB: all 8 columns, 4 indexes, the composite unique, both FKs, and the `ON DELETE CASCADE` from `saved_view_defaults` |
| `src/lib/views/url-params.ts` (609 L) | Whitelist, `withViewEscape`, two export predicates | VERIFIED | 637 unit tests green; whitelist walks the table, never the source, so `__proto__` is a non-member |
| `src/lib/views/queries.ts` (275 L) | Visibility scoped in SQL | VERIFIED | `visibleViewsPredicate` at `:133`, applied at `:152` and `:241`; no admin branch, no `role` parameter |
| `src/lib/views/actions.ts` (554 L) | create/update/share/default/delete | VERIFIED | All five exist; `canSeeView` composed ahead of `canMutateView` in three of four (see criterion 2 caveat) |
| `src/lib/views/resolve.ts` (529 L) | Eight bar props + redirect target | VERIFIED | Both wrappers used by all four pages |
| `src/lib/views/validate.ts` (301 L) | Total, non-throwing read validator | VERIFIED | Proven live by the three degradation cases + ANTI-VACUITY |
| `src/lib/views/export-action.ts` | Guarded, capped CSV export | VERIFIED (wired) | See criterion 4 caveats — no browser-level witness |
| `src/lib/export/view-export-guard.ts` | Bounded export | **PARTIAL** | Guard present and correct as specified; the *bound* it claims is not delivered (WR-04) |
| `src/lib/filters/date-range.ts` (75 L) | One boundary rule, both call sites | VERIFIED | Imported by `activities/actions.ts:14` and `formatters.ts:22`; CR-01 closed |
| `src/components/views/saved-views-bar.tsx` (531 L) | Picker, save, export, manage | VERIFIED | Mounted on all four surfaces; every action reachable |
| `src/components/views/save-view-dialog.tsx` (399 L) | Real form, create + update | VERIFIED | `<form onSubmit>` + `type="submit"`; row creation DB-verified |
| `src/components/views/manage-views-dialog.tsx` (453 L) | Share, default, delete | VERIFIED | WR-06 fix present; proven live by the member G-7 test |
| `src/lib/export/formatters-live.test.ts` | Live proof of the export path | **FAILED** | Red at HEAD — see G-1 |

---

## Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| 4 list pages | `resolveSavedViewsBarProps` | server-side await, one call each | WIRED (gated by `views-bar-wiring.test.ts`, 13 tests) |
| 4 list pages | `resolveDefaultViewRedirect` | `redirect()` outside try/catch | WIRED, proven live |
| 4 client components | `<SavedViewsBar {...viewsBar}/>` | one spread prop | WIRED |
| `SavedViewsBar` | `exportViewResults` | server action + Blob download | WIRED in code; **no runtime witness** |
| `SaveViewDialog` | `createView` / `updateView` | form onSubmit | WIRED, row creation DB-verified |
| `ManageViewsDialog` | `setViewShared` / `setViewDefault` / `deleteView` | switches + confirm | WIRED, `setViewDefault` proven live |
| 17 filter-clearing navigations | `withViewEscape` | call-site gate V-40-4 | WIRED (29 tests) |
| `guardExportInput` | `fetchFilteredData` | re-derived filter map | WIRED; predicates verified against real SQL |

---

## Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data? | Status |
|---|---|---|---|---|
| `SavedViewsBar.views` | `SavedViewSummary[]` | `listVisibleViews` → drizzle `findMany` with the visibility predicate in the WHERE | Yes — live e2e shows seeded rows appearing and the private one absent | FLOWING |
| `SavedViewsBar.selectedViewId` / `isModified` | resolver comparison of URL vs stored blob | `selectViewForParams` + `?view=<id>` carrier (40-18) | Yes | FLOWING |
| default redirect target | `readDefaultViewForUser` INNER JOIN | Yes — landed URL carried the stored `search` | FLOWING | |
| export CSV | `fetchFilteredData` | Live probe: `search` and `status` each narrow to strict non-empty subsets | Yes | FLOWING |
| degraded notice | `validateStoredFilters` dropped keys | Proven in all three directions plus anti-vacuity | Yes | FLOWING |

---

## Behavioural Spot-Checks

| Behaviour | Command | Result | Status |
|---|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 | PASS |
| Lint | `npx eslint .` | 0 errors, 127 warnings | PASS |
| Full unit suite | `npx vitest run` | 3842 passed / 28 skipped | PASS |
| Phase-40 unit suites | `npx vitest run src/lib/views src/lib/export …` | 1056 passed / 24 skipped | PASS |
| 320px reachability | `npx playwright test e2e/saved-views-320.spec.ts` | 24 passed | PASS |
| Private visibility, member | `… saved-views-visibility-member.spec.ts` | 6 passed | PASS |
| Private visibility, admin | `… saved-views-visibility-admin.spec.ts` | 4 passed (1 flaky setup, retried) | PASS |
| Degraded reads | `… saved-views-degraded.spec.ts` | 8 passed | PASS |
| Mobile overflow regression | `… viewport-320.spec.ts` | 23 passed | PASS |
| Kanban drag regression (D-40-4) | `… deals-drag.spec.ts` | passed | PASS |
| Live export probe | `DATABASE_URL=… npx vitest run src/lib/export/formatters-live.test.ts` | **23 passed, 1 failed** | **FAIL** |
| Schema applied | `psql \d saved_views` | 8 cols, 4 indexes, 2 FKs, cascade | PASS |
| WR-04 re-measurement | `psql count(*) … name ilike '%a%'` | 44,254 / 46,054 | confirms the finding |
| Container serves HEAD | `docker … grep .next for c082340's class string` | found in both chunks | PASS |

---

## Requirements Coverage

| Requirement | Description | Status | Evidence |
|---|---|---|---|
| VIEW-01 | Save the current filter set on a list page as a named view | SATISFIED | Criterion 1 above |
| VIEW-02 | Mark a view private or shared, and set one as the default for that entity type | SATISFIED | Criteria 2 and 3 above — both proven live at HEAD |
| VIEW-03 | Export the records matching a saved view | SATISFIED with caveats | Criterion 4 above — deliberate `/deals` narrowing, open WR-04, no browser witness |

Note for the orchestrator: `REQUIREMENTS.md:57-59` still shows all three as `- [ ]` and the
traceability table at `:144-146` still reads `Pending`. Not modified by this verification.

---

## Anti-Patterns Found

| Scope | Pattern | Result |
|---|---|---|
| `src/lib/views`, `src/components/views`, `src/lib/export`, `src/lib/filters`, four app surfaces, `e2e/` | `TBD` / `FIXME` / `XXX` | **0** — the debt-marker gate passes |
| same | `TODO` / `HACK` / `PLACEHOLDER` / "not yet implemented" / "coming soon" | **0** |
| same | stub returns, empty handlers, hardcoded empty props | none found; every component reads server-resolved props and every handler calls a real action |

The `test.fail()` at `saved-views-320.spec.ts:980` is deliberately *not* counted as an anti-pattern.
The assertion is byte-unchanged and still executing, with an anti-vacuity guard, so the suite goes red
the day the defect is fixed. That is the correct shape for a tracked defect, and the opposite of a
suppressed one.

---

## Gaps Summary

Three gaps. None of them invalidates a success criterion; all three are the kind that quietly
survive a phase close.

**G-1 — `formatters-live.test.ts` is red at HEAD, and no artifact says so.** This is the finding I
consider most worth the phase's own attention, because of what it is rather than how bad it is. The
file's header explains that it exists precisely because Phase 37 shipped a malformed drizzle fragment
that a wholly-mocked suite passed cleanly. The WR-05 fix then changed the semantics the file asserts,
the fix note recorded that the file "was not relied on as a gate", and nobody ran it. Expected 79,022,
received 74,871 — short by exactly the 4,151 overdue rows. Measured against the live table, the
production semantics are a coherent three-way partition (74,857 completed / 14 pending / 4,151 overdue
= 79,022), so this is a **stale assertion, not a production defect**. But it is the one live-database
proof the export path has, it is currently red, and it went red inside the same commit series that
prides itself on running every RED before every fix.

**G-2 — the export refusal explains itself incorrectly in the only case the narrowing bites.** A
`/deals` view scoped by a board is disabled with "Choose at least one filter first." The user chose a
filter. One extra string in three locales closes it.

**G-3 — WR-04 and IN-06 are untracked.** Two security findings, one of them a net regression from a
locked Phase 38 decision with a 44,254-row measurement behind it, exist only inside `40-REVIEW.md`.
D-40-1 and D-40-3 both got BACKLOG entries. These did not.

**One additional observation, below gap threshold:** `setViewDefault` returns `forbidden` where the
three WR-01-fixed mutators return `failed`, reintroducing in one place the exists-vs-not disclosure
the fix removed from the other three.

**What the human "approved" does and does not cover, restated for the record.** It was given at 10:41
on 2026-08-22. Every review-fix commit landed between 11:18 and 11:59 — including WR-05, which changed
what the "Pending" filter *means* by a factor of roughly 300, and c082340, which reflowed the
activities stats row. 40-17-SUMMARY is admirably explicit that the one-word reply enumerates no steps.
So: the approval attests a satisfied human on the pre-fix build, and nothing about HEAD. I have covered
criteria 1, 2 and 3 at HEAD by re-running the suites myself. Criterion 4's user-facing path is
**unwitnessed by anyone at HEAD**, which is why it heads the human-verification list.

---

## Human Verification Required

### 1. Criterion 4, end to end, in a browser at HEAD

**Test:** On `/organizations`, apply a narrow search, save it as a named view, reopen the view, then
choose "Export these results (CSV)" from the picker. Then on `/deals`, select only a pipeline and check
the Export item.
**Expected:** A CSV downloads with a server-generated filename; the success toast's row count matches
the list; the file contains the expected rows and custom-field columns. On `/deals` with only a board
selected, Export is disabled with a reason line.
**Why human:** No e2e spec in this repository touches export or download. The path is proven only by
SQL-rendering unit tests and a read-only fetcher probe. Nobody has driven the menu item, the Blob
download or the toast at HEAD.

### 2. What "Pending" now means on `/activities`

**Test:** Open `/activities`, read the stats row, select each of Pending / Completed / Overdue.
**Expected:** Three exclusive buckets that a user can reason about. Live counts: 14 pending, 74,857
completed, 4,151 overdue, 79,022 total.
**Why human:** WR-05 changed a user-facing filter's meaning by roughly 300x, after the human approval.
The change is defensible and was argued for, but no person has looked at the resulting screen.

### 3. Decide WR-04

**Test:** Decide whether any authenticated non-admin should be able to export 44,254 of 46,054
organizations — with notes and every custom field — via a view whose only filter is `search=a`.
**Expected:** Either a bound (a non-admin row cap or a minimum-selectivity rule), or an explicit
recorded acceptance **with a BACKLOG entry**.
**Why human:** This is a change to Decision 2, not a defect a verifier can close. Recorded here because
Phase 38 gated this behind an admin check and Phase 40 removed that gate, so the exposure is a net
regression introduced by this phase — and it is currently tracked nowhere.

---

_Verified: 2026-08-22T15:22:51Z at `c082340`_
_Verifier: Claude (gsd-verifier), goal-backward, adversarial stance_
_Every gate cited above was executed by this verification, not quoted from a SUMMARY._
