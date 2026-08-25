# Roadmap: Pipelite

## Milestones

- ✅ **v1.0 MVP** -- Phases 1-16 (shipped 2026-03-14)
- ✅ **v1.1 Reliability & Operations** -- Phases 17-20, 23 (shipped 2026-03-26)
- ✅ **v1.2 Workflows** -- Phases 24-31 (shipped 2026-03-28)
- ✅ **v1.3 Foundation & CRM Depth** -- Phases 32-45 (shipped 2026-08-24)
- 📋 **v1.4** -- not yet scoped; seed from the Backlog review below (`/gsd:new-milestone`)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-16) -- SHIPPED 2026-03-14</summary>

- [x] Phase 1: Foundation & Authentication (6/6 plans) -- completed 2026-02-22
- [x] Phase 2: Organizations (3/3 plans) -- completed 2026-02-22
- [x] Phase 3: People (3/3 plans) -- completed 2026-02-22
- [x] Phase 4: Pipelines & Stages (4/4 plans) -- completed 2026-02-23
- [x] Phase 5: Deals & Kanban (3/3 plans) -- completed 2026-02-24
- [x] Phase 6: Activities (4/4 plans) -- completed 2026-02-25
- [x] Phase 7: Custom Fields & Formulas (11/11 plans) -- completed 2026-02-28
- [x] Phase 8: Search & Filtering (3/3 plans) -- completed 2026-02-28
- [x] Phase 9: Import/Export (3/3 plans) -- completed 2026-02-28
- [x] Phase 10: REST API (4/4 plans) -- completed 2026-03-01
- [x] Phase 11: Keyboard Control (5/5 plans) -- completed 2026-03-02
- [x] Phase 12: Localization (5/5 plans) -- completed 2026-03-05
- [x] Phase 13: Comprehensive Documentation (4/4 plans) -- completed 2026-03-06
- [x] Phase 14: Dashboard Metrics (3/3 plans) -- completed 2026-03-07
- [x] Phase 15: Multi-user Collaboration (6/6 plans) -- completed 2026-03-07
- [x] Phase 16: Pipedrive API Importer (6/6 plans) -- completed 2026-03-08

Full archive: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>v1.1 Reliability & Operations (Phases 17-20, 23) -- SHIPPED 2026-03-26</summary>

- [x] Phase 17: TypeScript Cleanup (1/1 plan) -- completed 2026-03-14
- [x] Phase 18: DB Infrastructure (1/1 plan) -- completed 2026-03-14
- [x] Phase 19: Webhook Reliability (3/3 plans) -- completed 2026-03-22
- [x] Phase 20: Import State Reliability (2/2 plans) -- completed 2026-03-23
- [x] Phase 23: Resend Email Integration (5/5 plans) -- completed 2026-03-24

Full archive: `.planning/milestones/v1.1-ROADMAP.md`

</details>

<details>
<summary>v1.2 Workflows (Phases 24-31) -- SHIPPED 2026-03-28</summary>

- [x] Phase 24: Schema & Event Infrastructure (4/4 plans) -- completed 2026-03-27
- [x] Phase 25: Trigger System (4/4 plans) -- completed 2026-03-28
- [x] Phase 26: Execution Engine & Flow Control (3/3 plans) -- completed 2026-03-28
- [x] Phase 27: Action Nodes (3/3 plans) -- completed 2026-03-28
- [x] Phase 28: Visual Editor (5/5 plans) -- completed 2026-03-28
- [x] Phase 29: Run History & Observability (3/3 plans) -- completed 2026-03-28
- [x] Phase 30: Templates & Portability (3/3 plans) -- completed 2026-03-28
- [x] Phase 31: Workflow Wiring Fixes (gap closure) -- completed 2026-03-28

Full archive: `.planning/milestones/v1.2-ROADMAP.md`

</details>

### v1.3 Foundation & CRM Depth (Phases 32-45)

- [x] **v1.3 — Foundation & CRM Depth** — SHIPPED 2026-08-24. 14 phases (32-45), 190 plans, 42/42 requirements. Audit history, notes, trash/restore, duplicate merge, saved views + export, workflow replay/dry-run, observability, and a recoverable deployment. Archive: [v1.3-ROADMAP.md](milestones/v1.3-ROADMAP.md) · [requirements](milestones/v1.3-REQUIREMENTS.md) · [audit](milestones/v1.3-MILESTONE-AUDIT.md) · [integration](milestones/v1.3-INTEGRATION.md)

## Phase Details

_v1.3's 14 phase definitions are archived in [milestones/v1.3-ROADMAP.md](milestones/v1.3-ROADMAP.md)._

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 32. Test Infrastructure & CI | 6/6 | Complete   | 2026-08-14 |
| 33. Database Indexes for the CRM Core | 3/3 | Complete   | 2026-08-14 |
| 34. Formula Reactivity | 13/13 | Complete   | 2026-08-15 |
| 35. Notes & Record Timeline | 15/15 | Complete   | 2026-08-15 |
| 36. Audit Log | 20/20 | Complete   | 2026-08-16 |
| 37. Trash & Restore | 15/15 | Complete   | 2026-08-17 |
| 38. Bulk Operations | 19/20 | In Progress|  |
| 39. Duplicate Detection & Merge | 21/21 | Complete   | 2026-08-21 |
| 40. Saved Views & Shared Filters | 18/18 | Complete   | 2026-08-22 |
| 41. Workflow Operator Affordances | 0/? | Not started | - |
| 42. Observability | 6/18 | In Progress|  |
| 43. Type Safety & Deployment Docs | 0/? | Not started | - |
| 44. Custom Field UI Repair | 9/9 | Complete   | 2026-08-15 |

## Backlog

> **The backlog lives in [`BACKLOG.md`](BACKLOG.md), which is the single register of record.**
> Reconciled 2026-08-24. Until then this project kept deferred work in **three** places that
> disagreed with each other — this ROADMAP's `999.x` list, `BACKLOG.md`, and the "Carried into the
> next milestone" list in `milestones/v1.3-MILESTONE-AUDIT.md`. All three are now merged into
> `BACKLOG.md`; the `999.x` entries and their evidence were moved there verbatim. This section keeps
> only the promotion decision.

### v1.4 seed — 19 items promoted 2026-08-24

Every claim below was re-measured against the tree at `a58b9e1` on the day it was promoted; none was
taken from a document. Full evidence for each lives in `BACKLOG.md` under the matching ID.
`/gsd:new-milestone` should scope v1.4 from this table.

**Tier 1 — the three that decide whether v1.4 is a quality milestone**

| ID | Item | Verified 2026-08-24 |
|---|---|---|
| **MIG-01** | `drizzle-kit migrate` cannot build a fresh database | **Reproduced against an empty DB:** `42P01 relation "import_sessions" does not exist` at migration `0006`. The run is transactional, so a fresh database ends up with **0 tables**. Across all 20 migrations `import_sessions` is only ever `ALTER`ed (0006) and referenced by FK (0014) — **never created**. v1.3 shipped "the deployment became recoverable" on a *dump-restore* runbook, which only helps someone who already has a dump; a new self-hoster cannot install from this repo at all |
| **WR-04** | View export is reachable by any authenticated non-admin | **Unchanged:** `search=a` still matches **44,254 of 46,054** organizations (96.1%), under `EXPORT_ROW_CAP = 50_000`. The guard is 139 lines with no admin branch and no selectivity rule. Phase 38 gated this behind admin; Phase 40 Decision 2 removed the gate. **The Phase 40 verifier wrote that this "should block milestone close"; the milestone audit overrode that with "nothing blocking" and shipped** — confirm that override was intended |
| **PERF-01** | `/deals` renders every deal on a pipeline, unpaginated | **Confirmed:** the Closer pipeline holds **15,415** deals today and `src/app/deals/page.tsx` has no `limit` — it pushes every row into `dealsByStage`. 88.3 s to `h1` as measured by plan 40-16. Also the named amplifier of Playwright flakiness, so it corrupts every future gate |

**Tier 2 — four more that earn their place**

| ID | Item | Verified 2026-08-24 |
|---|---|---|
| **F-39-08** | Enter inside a modal navigates the list behind it, discarding the draft | Six surfaces. The failing assertion is **already in the suite** as `test.fail()` at `e2e/saved-views-320.spec.ts:980`, so the suite goes red the day it is fixed — delete the marker in the same commit. Fix is fully specified in `BACKLOG.md` |
| **F-39-07** | 320px reachability — `DialogContent` and `popover.tsx` have no height clamp | **Phase 45 did not close this:** `dialog.tsx` and `popover.tsx` both have **zero** `max-h`/`overflow` matches, and `e2e/viewport-320.spec.ts` asserts only `scrollWidth <= clientWidth`. That is exactly the blind spot `BACKLOG.md` predicted — *"assert the submit control is clickable, not merely that the page does not scroll sideways."* The suite was built carrying the same gap |
| **CR-01** | A purge leaves the record's file attachments on disk and downloadable | **Still open.** No `deleteEntityFiles`/`collectFileFieldRefs` helper exists, and `api/files/[entityId]/[fieldName]/[filename]/route.ts` still authorizes on `session?.user` alone with **no record lookup** — anyone who ever held the URL can download a "permanently deleted" record's file, and the URL is recoverable from the audit tombstone indefinitely. Only the *misleading comment* half was fixed: `src/lib/trash/prune.ts:66-73` now documents the gap honestly |
| **STATS-01** | The `/activities` stats row states counts it cannot know | Unfiltered it asserts **`Pending: 0` / `Overdue: 0`** when the truth is **14** and **4,151**; `Completed: 50` is the page cap, not a count. Client-side filter over an already-paginated 50 rows. User-facing false statement, cheap fix |

**Tier 3 — the twelve `999.x` items, unchanged in priority from the 2026-08-24 review**

| ID | Item |
|---|---|
| **999.17** | SECURITY: `/api/v1/activities` has no ownership check (IDOR) — read, edit incl. `owner_id` reassignment, or soft-delete **any** user's activity |
| **999.21 + 999.22** | Workflow conditions cannot address 90% of custom fields (152/169) — engine fixed in 34-12, no UI emits the syntax |
| **999.16** | npm advisories in the committed lockfile — 4 critical / 22 high |
| **999.15** | `GET /api/v1/stages/:id` returns 403 to the legitimate owner |
| **999.20** | `.env.local` points at the wrong DB port, so the documented `db:migrate` fails from the host |
| **999.28** | `condition-evaluator` linearity gate is contention-flaky — **merge with D-45-01**, same class, same fix |
| **999.23** | POST responses echo pre-recalculation formula values |
| **999.13** | Six `react-hooks` suppressions — the register in `32-04-SUMMARY.md` is out of date |
| **999.19** | Pipedrive importer hardcodes stage type `"open"` |
| **999.18** | `stages/route.ts` passes a JS array into a raw `sql` fragment |
| **999.14** | Dockerfile pins `node:20-alpine` at all three build stages |

**FORM-01** (merge never recalculates the survivor's own formula fields) is promoted alongside these
as a Tier 2 item; it is dormant today at **0 formula field definitions** and becomes live data
corruption the day an admin adds one.

Everything not in this table stays in `BACKLOG.md` as **recorded context** — accepted design
decisions, document drift in archived artifacts, and low-value test debt. It is there for a planner
to read, not to be scoped.

---

### Phase 45: Cross-Cutting UI Repair and UAT Closure

**Goal**: The app is usable on a phone, its shipped dark theme can actually be turned on, its admin shell speaks the user's language, and no bulk message tells the user something untrue
**Depends on**: Nothing. Every item is app-wide or already-shipped code; none of it belongs to Phases 39-43, and none of them touch these files. Sequence it whenever convenient — it is deliberately schedulable in parallel with the remaining feature phases.
**Requirements**: Derived from browser UAT rather than the requirements register — see 36-HUMAN-UAT.md, 37-UAT.md (G5, G6) and 38-UAT.md
**Success Criteria** (what must be TRUE):

  1. No route has a horizontal page scrollbar at a 320px viewport — measured as `document.scrollWidth <= document.clientWidth` on /organizations, /people, /deals, /activities, /trash and /admin/audit, in all three locales
  2. A user can switch to dark mode from the UI and the choice survives a reload
  3. The admin shell renders in the active locale — no hardcoded English strings in the sidebar or in the dialog close controls
  4. No bulk message asserts a selection state that is not true
  5. The deals-kanban drag-with-selection check is either verified or converted into an automated test that can actually drive it

**Origin**: Every item was found by re-running the outstanding Phase 36-38 human UAT in a real authenticated browser on 2026-08-18. That session closed 9 of 10 debt items; these five are what it found still broken, plus the one item it could not drive. None was introduced by Phases 36-38 — items 1-3 predate them and are app-wide, which is exactly why they are collected here instead of being retro-fitted into a shipped phase.

**Scope** (five items, each independently shippable):

  1. **Header overflow at 320px** — `src/components/nav-header.tsx`. The search input carries `min-w-0 w-xs w-64`; `w-64` wins and pins it to a computed 256px, and its wrapper is a bare `div.relative` with no shrink allowance, so 256 + 16 (`gap-4`) + 40 (avatar) = 312px of non-shrinkable content inside a 305px client width. Measured `document.scrollWidth` 416 vs 305 on every route. Candidate fix: `w-full max-w-64 min-w-0` on the input with `min-w-0 flex-1` on the wrapper, or collapse the search to an icon below `sm`. Tracked as 37-UAT G5. Note 37-UAT already fixed the *other* half of this (the trash tablist, G3) — the header is the untouched remainder.
  2. **Admin layout does not collapse at mobile** — `src/app/admin/layout.tsx`. The sidebar rail stays full width, pushing `<main>` to start at x≈206px. `/admin/audit` measures `scrollWidth` 508 in pt-BR and **526 in es-ES** — it degrades further with longer translations, which is the specific failure mode the Phase 36 UAT item was written to catch. Needs a drawer or collapse below `sm`.
  3. **Dark mode is unreachable** — `src/app/layout.tsx` renders a bare `<html lang={locale}>`, mounts no `ThemeProvider`, and no toggle or `setTheme` call exists anywhere in the codebase. The theme itself is complete and correct: `globals.css` defines `@custom-variant dark` plus a full `.dark` token block, 69 `dark:` utilities are in use, and forcing the class at runtime flips `body` from `lab(100 0 0)` to `lab(2.75381 0 0)` correctly. The only `next-themes` import in the repo is inside `sonner.tsx`, whose `useTheme()` therefore always reads the default. Mount a provider, add a toggle, persist the choice. Tracked as 37-UAT G6. **This one is load-bearing for verification**: while it is broken, every "check it in dark mode" UAT item in the project is unverifiable as a real user state.
  4. **Untranslated shell strings** — two separate leaks, both visible in pt-BR and es-ES. The whole admin sidebar is hardcoded English ("Admin Panel, Dashboard, User Management, Pipelines, Custom Fields, Webhooks, Audit Log, Trash, Export Data, Pipedrive Import, Back to App"), and the Radix dialog close button's sr-only label renders as "Close" in every locale (`ui/dialog.tsx`, `ui/alert-dialog.tsx`). A third, smaller one: the record timeline prints the raw DB column name "Deleted at" as a field label next to a raw ISO timestamp, where the delete entry beside it gets a proper sentence.
  5. **Bulk failure panel states something false** — `src/components/bulk/bulk-failure-report.tsx`. It renders "these records are still selected — fix the problem and try again" unconditionally, but the bar prunes its selection to rendered ids, so for the `no longer exists` reason code the failed rows have left the table and the selection is empty. Observed live: 0 checked, bar unmounted, panel still instructing a retry. This is not an artefact of the forced test — it is exactly what happens when another user deletes the records concurrently. Either keep failed ids selected when their rows are gone, or make the copy conditional on what survived the prune. Tracked as a 38-UAT gap (major).

**Carried-over verification** (not a fix — the one item the 2026-08-18 sweep could not close):

  - Deals kanban: drag a card by its body while another card is checked. Playwright's `browser_drag` times out on mouse-up because dnd-kit's pointer sensor needs an activation constraint (distance/delay plus intermediate `pointermove`) that a simple move-and-up does not satisfy. Synthetic pointer events were deliberately refused as evidence, because regression G1 in that same session proved synthetic dispatch hides a real defect on this exact component. Close it with a human at a real mouse, or by adding an e2e runner that can emit a held pointer sequence — the latter would also give the repo somewhere to pin G1's behaviour, which no current test can defend.

**Plans:** 11/11 plans complete

Plans:
- [x] 45-01-PLAN.md — 22 message keys x 3 locales + the locale-parity contract lists that gate them
- [x] 45-02-PLAN.md — Playwright harness: devDependency, config, e2e admin seed, authenticated storageState, ignore-file entries
- [x] 45-03-PLAN.md — ThemeProvider mounted, three-way light/dark/system toggle in UserMenu, C-1 destructive-token repair
- [x] 45-04-PLAN.md — dialog.tsx close labels from common.close (both sites) + the new sheet.tsx, translated at creation
- [x] 45-05-PLAN.md — bulk failure panel: three truth-conditional branches + all four callers passing the surviving count
- [x] 45-06-PLAN.md — timeline deletedAt becomes a translated direction sentence; NATIVE_ORDER order guard
- [x] 45-07-PLAN.md — CommandDialog forwards shouldFilter/loop; the search results tree lifted into SearchResults
- [x] 45-08-PLAN.md — the three e2e specs (viewport-320 proven RED, deals-drag, theme)
- [x] 45-09-PLAN.md — admin shell: translated sidebar, one shared item renderer, Sheet drawer below md, min-w-0 content column
- [x] 45-10-PLAN.md — header collapse below md, mobile search dialog, min-w-0 on both clusters, t("workflows")
- [x] 45-11-PLAN.md — the single Docker rebuild, the full e2e run, and the human dark-palette walk

---
*Roadmap updated: 2026-08-24 -- registers reconciled: the 999.x entries moved to BACKLOG.md (now the single register of record), the v1.3 audit's four untracked carry-items imported, and seven BACKLOG.md items promoted alongside the twelve 999.x ones. This section is now the promotion decision only*
*Roadmap updated: 2026-08-24 -- backlog reviewed against `a58b9e1`: all 12 open items verified live and tagged PROMOTE -> v1.4; 999.13/15/16 corrected in place; no milestone active, so nothing was renumbered*
*Roadmap updated: 2026-08-18 -- Phase 45 planned (11 plans, 4 waves); UI edits batched so the Docker rebuild is paid once, in the final wave*
*Roadmap updated: 2026-08-18 -- Phase 45 added (Cross-Cutting UI Repair and UAT Closure), collecting the five app-wide defects found when the outstanding Phase 36-38 human UAT was re-run in a real authenticated browser; depends on nothing and can run in parallel with Phases 39-43*
*Roadmap updated: 2026-08-17 -- Phase 38 planned (20 plans, 6 waves); the anticipated Phase 43 collision on `organizations/columns.tsx` and `people/columns.tsx` was designed out*
