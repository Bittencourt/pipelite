# Roadmap: Pipelite

## Milestones

- ✅ **v1.0 MVP** -- Phases 1-16 (shipped 2026-03-14)
- ✅ **v1.1 Reliability & Operations** -- Phases 17-20, 23 (shipped 2026-03-26)
- ✅ **v1.2 Workflows** -- Phases 24-31 (shipped 2026-03-28)
- 🚧 **v1.3 Foundation & CRM Depth** -- Phases 32-44 (in progress)

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

### v1.3 Foundation & CRM Depth (Phases 32-44)

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

Unsequenced items awaiting a milestone. Promote with `/gsd:review-backlog` when ready.

**999.13 — Proper fix for the five React Compiler lint findings** (captured 2026-08-14, Phase 32)
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

**999.14 — Dockerfile pins `node:20-alpine`, below vite 7's engines floor** (captured 2026-08-14, Phase 32)
`vite@7.3.1` declares `engines: ^20.19.0 || >=22.12.0`, reached transitively via vitest. The image tag
currently resolves to something >= 20.19 (the container builds today), so this is latent rather than broken.
CI pins Node 24 and does not inherit the Dockerfile's tag. Resolution: raise the base image, or pin the
patch explicitly so a future `node:20-alpine` rebuild cannot drift below the floor.
Source: `32-RESEARCH.md` Open Question 4 / Pitfall 6.

**999.15 — `GET /api/v1/stages/:id` returns 403 to the legitimate owner** (captured 2026-08-14, Phase 32)
The ownership check reads `stage.pipeline`, which is only loaded when `?expand=pipeline` is passed, so a
request without that query parameter fails authorization for the resource owner. Found by plan 32-03 and
deliberately left unchanged there because T-32-10 required that plan's typing work to be behaviour-neutral.
This is a real pre-existing auth bug, not a typing artifact — fixing it changes runtime behaviour and needs
its own test. See `32-03-SUMMARY.md` § Decisions Made.

**999.16 — 39 npm advisories in the committed lockfile** (captured 2026-08-14, Phase 32)
`npm ci` reports 39 vulnerabilities (3 low, 9 moderate, 23 high, 4 critical). CI-04 does not ask for an
audit gate, and adding `npm audit --audit-level=high` to `ci.yml` would make the required check red on day
one, so it was deliberately not bolted on. Resolution: triage the criticals/highs, then decide whether an
audit step or a `.npmrc` audit policy belongs in CI.

**999.17 — SECURITY: `/api/v1/activities` has no ownership check (IDOR)** (captured 2026-08-14, Phase 32)
`src/app/api/v1/activities/[id]/route.ts` GET/PUT/DELETE and `src/app/api/v1/activities/route.ts` GET
perform **no ownership check at all**. Any valid API key can read (`[id]:80-116`), modify
(`[id]:126-216`, **including reassigning `owner_id`**) or soft-delete (`[id]:226-237`) *any* user's
activity by id, and the list endpoint returns every user's activities. Compare `pipelines/[id]`,
which does check `ownerId`. Pre-existing — Phase 32's diff only retyped `withOptions` — but surfaced
by the Phase 32 code review, and **more severe than anything found in the phase itself**. These six
route files have zero test coverage, so add tests with the fix. Prioritise ahead of the cosmetic
backlog items. See `32-REVIEW.md` § "Pre-existing, out of diff scope".

**999.18 — `stages/route.ts` passes a JS array into a raw `sql` fragment** (captured 2026-08-14, Phase 32)
`src/app/api/v1/stages/route.ts:73` uses ``sql`${pipelines.id} IN ${pipelineIds}` `` instead of
`inArray()`. Unreachable with an empty array today (guarded by `stageList` being non-empty) but
fragile — a future refactor removing that guard changes it from awkward to broken. Mechanical fix.

**999.19 — Pipedrive importer hardcodes stage type `"open"`** (captured 2026-08-14, Phase 32)
`src/lib/import/pipedrive-api-transformers.ts:164-167` reads
`const type: "open" | "won" | "lost" = "open"` under a comment promising "Determine stage type based
on `rotten_flag` and `deal_probability`". The won/lost mapping was never implemented; Phase 32's
`let`→`const` change (L-06) removed the last hint that it is a placeholder. Deliberately deferred
from the Phase 32 fix pass — it is a product decision about Pipedrive stage mapping, not a
regression. Address alongside the import wizard's terminal-stage handling.

**999.20 — `npm run db:migrate` cannot reach the DB from the host** (captured 2026-08-14, Phase 33)
`drizzle.config.ts` reads `DATABASE_URL`. `.env` sets it to `postgres:5432` (the Docker-network hostname —
unresolvable from the host, fails `EAI_AGAIN`) and `.env.local` sets it to `localhost:5432` — the **wrong
port**, since Postgres publishes on **5433**. So the documented migrate command fails from the host and has
to be run with an inline `DATABASE_URL` override. Phase 33 worked around it without editing a tracked file.
Fix: point `.env.local` at `localhost:5433`. This will bite every future phase that runs a migration
(34, 35, 36, 37, 39, 40 all add schema). Cheap fix, high recurring cost if left.

**999.28 — `condition-evaluator` linearity gate is contention-flaky** (captured 2026-08-15, Phase 44)
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

**999.23 — POST responses echo pre-recalculation formula values** (captured 2026-08-14, Phase 34)
The create mutations return the raw `.returning()` row, so a `POST /api/v1/{organizations,people,deals,activities}`
201 body carries the **un-computed** custom-field blob. The stored value, the emitted `crmBus` event and any
subsequent `GET` are all correct — only the create response is stale, and `PUT` has no such gap.

SC-1 is therefore satisfied ("a subsequent GET returns recomputed values"), which is why Phase 34 did not
chase it: folding the recalc into the return value would break two plan 34-02 assertions that compare the
result against a fixture, and weakening existing tests was forbidden. But it leaves an API inconsistency —
a client that trusts the 201 body sees different data than the same client re-reading the record. Decide
once for all four entities. See `34-07-SUMMARY.md`.

**999.22 — Condition builder UI has no field picker for bracket paths** (captured 2026-08-14, Phase 34)
Phase 34 plan 34-12 made `resolveFieldPath` accept bracket-quoted segments, so a workflow condition can now
reach `customFields["Previsão de início operação"]`. But the condition builder UI offers no picker that
emits that syntax — an operator has to hand-type both the bracket form and the exact accented field name,
with no autocomplete and no validation. So the capability exists at the engine level while remaining
effectively undiscoverable in the product. A field picker that emits the correct path is what stands
between the fix and it being usable without documentation. Pairs with 999.21.

Also from 34-12: **escaping is unsupported inside brackets** — a name containing the same quote character
used to delimit it stops the parser at the first match. The other quote style works around it; a name
containing *both* quote characters is unaddressable. None of the 169 live definitions hit this today.

**999.21 — Workflow conditions cannot address 90% of custom fields — ENGINE FIXED in Phase 34 (34-12), UI GAP REMAINS** (captured 2026-08-14, Phase 34)
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
*Roadmap updated: 2026-08-18 -- Phase 45 planned (11 plans, 4 waves); UI edits batched so the Docker rebuild is paid once, in the final wave*
*Roadmap updated: 2026-08-18 -- Phase 45 added (Cross-Cutting UI Repair and UAT Closure), collecting the five app-wide defects found when the outstanding Phase 36-38 human UAT was re-run in a real authenticated browser; depends on nothing and can run in parallel with Phases 39-43*
*Roadmap updated: 2026-08-17 -- Phase 38 planned (20 plans, 6 waves); the anticipated Phase 43 collision on `organizations/columns.tsx` and `people/columns.tsx` was designed out*
