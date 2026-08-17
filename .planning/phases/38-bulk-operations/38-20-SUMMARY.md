---
phase: 38
plan: 20
subsystem: verification
tags: [uat, live-db-probe, browser, bulk-operations, evidence]
requires:
  - 38-19 (phase-wide gates green)
  - a running Docker app at HEAD, live Postgres, Mailhog
provides:
  - a second approved non-deleted user in the live database (mark.chen@pipelite.local)
  - live-DB evidence for SC-3, SC-4 and SC-5
  - browser evidence for SC-1 on Organizations and People
  - seven recorded UAT gaps, three of them pre-existing
affects:
  - .planning/phases/38-bulk-operations/38-20-SUMMARY.md
tech-stack:
  added: []
  patterns:
    - "live-DB probe by mirroring a server action's loop body verbatim, because auth() cannot be entered from a test process"
    - "headless Chrome driven over CDP with node's built-in global WebSocket — zero packages installed"
    - "320px verification through a same-origin iframe (Phase 37 method), confirmed to make media queries apply"
key-files:
  created:
    - .planning/phases/38-bulk-operations/38-20-SUMMARY.md
    - .planning/phases/38-bulk-operations/38-20-uat-evidence/ (19 screenshots + the CDP driver and 7 UAT scripts; gitignored, on disk only)
  modified: []
decisions:
  - "Restored mark.chen@pipelite.local by SQL rather than through /admin/users, because the product affordance is browser-only and the sanctioned browser tools were unavailable"
  - "Ran the mandatory live-DB probes by mirroring each bulk action's loop verbatim rather than skipping them, and labelled the auth() bypass explicitly"
  - "Used a self-launched headless Chrome over CDP after the Claude-in-Chrome tools proved unavailable, and confined it to localhost:3001"
  - "Did NOT fix any of the seven findings — this plan declares files_modified: []"
metrics:
  duration: ~45 min
  completed: 2026-08-17
  probes_run: 5 live-DB probes, 7 browser UAT scripts, 19 screenshots
  source_files_modified: 0
---

# Phase 38 Plan 20: Second User, Live-DB Probes and Browser UAT Summary

Restored the blocking second approved user, proved SC-3/SC-4/SC-5 against the live 46,054-organization
database with recorded audit-row and Mailhog counts, proved SC-1 in a real browser on Organizations and
People including the indeterminate minus and the 320px non-overflow, and found seven defects — three of
them new to this phase — while leaving every source file untouched.

---

## Blocking Environment Limitation (read first)

**The Claude-in-Chrome tools were NOT available in this session.** `ToolSearch` is disabled
("ToolSearch is disabled for this session, in subagents as well as here") and
`mcp__claude-in-chrome__tabs_context_mcp` resolves to "No such tool available". A second Chrome was
found listening on `127.0.0.1:9222`, but it does not expose the DevTools HTTP API
(`/json/version` and `/json/list` both return HTTP 404 with an empty body, under `Host: 127.0.0.1`,
`Host: localhost:9222` and `Host: localhost`), so the user's real browser could not be reached and its
session could not be used.

**What was done instead, and what remains genuinely unverified:**

1. **No password was guessed, reset or read from the repo.** No credential was used at any point.
2. A **self-launched headless Chrome** (`google-chrome --headless=new`, isolated `--user-data-dir` in
   the scratchpad, ports 9333/9334) was driven over CDP using **node's built-in global `WebSocket`** —
   **zero packages installed**, consistent with threat row T-38-SC.
3. That browser has **no session**. It could nonetheless drive `/organizations` and `/people` fully,
   because **both routes render live CRM data with no authentication gate at all** — see gap **G5**,
   which is pre-existing and is itself the most serious thing this plan found.
4. `/deals`, `/activities` and `/trash` all correctly `307` to `/login`, so **every Deals-kanban item,
   every Activities item, the Trash deep-link item and the per-record change-history UI item are
   BLOCKED-NOT-RUN.** They are listed individually below. Their server-side halves were instead proven
   by live-DB probe.

Nothing below is inferred. Every PASS carries a measured number or a verbatim string.

---

## Task 1 — Second approved user and baselines

### Baseline probes (verbatim, `docker compose exec -T postgres psql -U pipelite -d pipelite`; no sudo anywhere)

```
select id, email, name, role, status, deleted_at from users order by email
                  id                  |             email              |     name      |  role  |  status  |       deleted_at
--------------------------------------+--------------------------------+---------------+--------+----------+-------------------------
 efe6ba7c-a08a-4fe1-bc5d-02b507d6f534 | emily.davis@pipelite.local     | Emily Davis   | member | approved | 2026-03-23 11:02:00.519
 07572f1b-49e3-4325-b4af-7fc68b736f7f | james.wilson@pipelite.local    | James Wilson  | member | approved | 2026-03-23 11:01:57.877
 d9ed59bc-5b69-4fad-a3fe-3d2454e7c706 | laura.garcia@pipelite.local    | Laura Garcia  | member | approved | 2026-03-23 11:01:54.302
 b1939ede-9fd7-42bc-9d94-1656b99d1c6c | mark.chen@pipelite.local       | Mark Chen     | member | approved | 2026-03-23 11:02:03.813
 164b4196-6cf7-4671-8b4a-9739721fd0d3 | mateus.aristimunho@visagio.com |               | member | approved | 2026-08-09 00:26:14.676
 ef4acac9-e860-4e71-9db5-ddaa2808cb9f | prbitt@gmail.com               |               | admin  | approved |
 fc27b469-0a33-4ce5-9332-c165c213107c | sarah.johnson@pipelite.local   | Sarah Johnson | member | approved | 2026-03-23 08:46:38.733
(7 rows)

select count(*) from users where deleted_at is null and status = 'approved'   ->  1
select count(*) from organizations where deleted_at is null                   ->  46054
select count(*) from deal_assignees                                           ->  0
select count(*) from audit_log                                               ->  73
select count(*) from audit_log where changes ? 'ownerId'                     ->  2
select key, value from app_settings where key = 'trash.retention_days'       ->  trash.retention_days | 30
```

### Restoration

`/admin/users` **does** offer the product affordance (`edit-user-dialog.tsx:170-177` renders a
Reactivate button when `user.deletedAt !== null`, calling the `reactivate` action in
`admin/users/actions.ts:194-220`). It could not be used: the route is admin-gated and the browser
tools were unavailable. Restoration was therefore done by SQL, exactly as the plan's fallback allows:

```sql
update users set deleted_at = null, updated_at = now()
 where email = 'mark.chen@pipelite.local' and status = 'approved' and deleted_at is not null;
-- UPDATE 1
```

`mark.chen@pipelite.local` (`b1939ede-9fd7-42bc-9d94-1656b99d1c6c`) was chosen because its `status`
was **already `approved`** before the restore (verified in the before-image above), so no status was
changed silently, and because its role is **`member`** — a non-admin second principal is what makes
the organizations `notPermitted` path and the deals admin-bypass asymmetry both producible.

| Probe | Before | After |
|---|---|---|
| `count(*) users where deleted_at is null and status='approved'` | **1** | **2** |
| the two live approved users | `prbitt@gmail.com` (admin) | `mark.chen@pipelite.local` (member), `prbitt@gmail.com` (admin) |
| `count(*) organizations where deleted_at is null` | 46054 | **46054 (unchanged)** |

### Environment

```
docker compose ps
  pipelite-app-1       (pipelite-app)      Up 2 minutes   [3001]
  pipelite-mailhog-1   (mailhog:latest)    Up 9 days      [1025, 8025]
  pipelite-postgres-1  (postgres:16-alpine) Up 8 days (healthy) [5433]
```

| Route | HTTP | Note |
|---|---|---|
| `/login` | **200** | |
| `/organizations` | **200** | renders full live data with **no session** — gap **G5** |
| `/people` | **200** | same |
| `/deals` | **307 → /login** | correctly gated (`deals/page.tsx:39-44`) |
| `/activities` | **307 → /login** | correctly gated (`activities/page.tsx:62-67`) |
| `/trash` | **307 → /login** | correctly gated |

**Mailhog baseline: `total = 0`** (`GET http://localhost:8025/api/v2/messages?limit=1`).

**No sudo was used in any command.** `docker` was invoked bare throughout.

---

## Live-DB probes (all four mandatory ones, plus a negative control)

Method, stated plainly so it is not over-read: `auth()` cannot be entered from a test process, so each
probe **mirrors the corresponding server action's loop body verbatim** — same `findFirst` predicate,
same ownership comparison, same `runWithActor` placement, same `deleteRecordByType` /
`updateRecordOwnerByType` dispatch — with the session identity injected. The probe file was created,
run, and **deleted**; `git status --porcelain` is `0`. One necessary addition: the audit subscriber is
registered **only** in `instrumentation.register()`, so a test process has no bus listener. The first
run of probe B recorded an audit delta of **0** purely for that reason; `registerAuditSubscriber()` was
then called explicitly and the probe re-run. The webhook and workflow subscribers were deliberately
**not** registered (there is 1 active live webhook).

### Probe A — `ExportFilters.ids` (SC-4 server half) — PASS

Generated SQL, from `.toSQL()` on the same drizzle call `formatters.ts:275-276` makes:

```sql
select "id" from "organizations"
 where ("organizations"."deleted_at" is null and "organizations"."id" in ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12))
-- 12 bound params, 12 rows returned
```

| Check | Result |
|---|---|
| `fetchFilteredData({ ids: [12 real ids] })` count | **12** |
| CSV lines (header + data) | **13** — exactly 12 data rows, not 46,054 |
| CSV header | `id,name,website,industry,notes,ownerId,ownerName,createdAt,updatedAt,custom_CNPJ / CPF,custom_E-mail de Contato 1,custom_Telefone de Contato 1` |
| `custom_*` columns present | **3** |
| **first exported row carries no custom fields** | **yes** — row 1 is `Supermercado Guanabara` with `custom_fields = '{}'`, and all three `custom_*` columns still appear in the header. The `deriveCsvColumns` union survival check **PASSES against real data**, with the empty row deliberately placed first |
| `[object Object]` anywhere | **false** |
| server-side filename | `organizations-selected-12-2026-08-17.csv` |
| `ids: []` → organization / person / deal / activity | **0 / 0 / 0 / 0** rows |
| `filters: {}` control (no ids) | **46054** — proving the narrowing is real and that empty-ids does not widen |
| person / deal / activity with 5 ids each | **5 / 5 / 5** rows, `[object Object]` false on all three |

### Probe B — bulk delete audit rows (SC-5 delete half) — PASS

12 admin-owned organizations, deleted through the mirrored loop.

| Check | Result |
|---|---|
| succeeded / failed | **12 / 0** |
| `count(*) from audit_log` | **85 → 97, delta = +12** |
| audit rows for exactly those 12 ids | **12** |
| distinct `(action, actorKind, actorUserId)` | `deleted \| user \| ef4acac9-e860-4e71-9db5-ddaa2808cb9f` — **the real actor, not `system`** |
| `changes` keys | `name, notes, ownerId, website, industry, deletedAt, defaultCurrency` |
| rows still present in table / with `deleted_at` set | **12 / 12** — soft delete, nothing hard-deleted |
| restored afterwards | **12**, all 12 live again |

Sample row, verbatim:
`{"entityId":"efe5a9f1-…","action":"deleted","actorKind":"user","actorUserId":"ef4acac9-…","changes":{"name":{"from":"Mega Supermercados"},…,"ownerId":{"from":"ef4acac9-…"},"deletedAt":{"from":null},…}}`

### Probe C — the canonical 9/12 partial failure and the authorization asymmetry (SC-3, T-38-02) — PASS

3 organizations reassigned to `mark.chen`, then those 3 plus 9 still owned by the admin deleted **as
the admin**:

| Surface | Actor | Set | Succeeded | Failed |
|---|---|---|---|---|
| **organizations** | admin | 3 owned by user B + 9 owned by admin | **9** | **3, all `notPermitted`** |
| **organizations** | admin | only the 3 owned by user B | **0** | **3 `notPermitted`** (the total-failure precondition) |
| **deals** | admin | 3 owned by user B + 9 owned by admin | **12** | **0** |

The failed organization ids, verbatim: `9b5f9b30-53cf-47d3-86e3-b7ad4f185080` (SUPERMERCADO MINEIRAO),
`2fdc8f32-8ded-4cee-8e9b-8006aead00cc` (SUPERMERCADO AMILTON OLIVEIRA),
`8c683e8f-703c-4641-a0ae-5178f4709ce2` (SUPERMERCADO CRISTAL).

**The asymmetry is proven end to end, side by side:** the identical set shape fails 3 on organizations
(no admin bypass) and fully succeeds on deals (`deals/actions.ts` carries
`&& session.user.role !== "admin"`). A uniformly-wrong implementation could not produce both.

### Probe E — negative control on LIVE records — PASS

Probe C's first member-side control was invalid (the records had already been trashed by the preceding
admin delete in the same run, so the read collapsed them to `notFound`). Re-run against **live**
admin-owned records:

| Surface | Actor | Succeeded | Failed |
|---|---|---|---|
| deals | `mark.chen` (member, non-owner) | **0** | **3 `notPermitted`** — the admin bypass correctly does not extend to a member |
| organizations | `mark.chen` (member, non-owner) | **0** | **3 `notPermitted`** |

### Probe D — reassign audit, same-owner no-op, `deal_assignees` (SC-5 reassign half, D-15, T-38-05) — PASS

| Check | Before | After | Verdict |
|---|---|---|---|
| `count(*) audit_log where changes ? 'ownerId'`, across a 10-record reassign | **14** | **24** | **delta = exactly 10** |
| ownerId audit rows for exactly those 10 ids | — | **10** | |
| distinct `(action, actorKind, actorUserId)` | — | `updated \| user \| ef4acac9-…` | real actor |
| `owner_id` now = user B, of the 10 | — | **10** | |
| **same-owner reassign of 3** (D-15) | 24 | **24** | **delta = 0, reported success — correct by design, not a defect** |
| `count(*) from deal_assignees`, across a 3-deal reassign | **0** | **0** | **T-38-05 regression disproven on live data** |
| reassign partial failure (mixed owners, as admin) | — | **4 succeeded / 3 `notPermitted`** | |

Sample reassign audit row, verbatim:
`{"entityId":"ebdf31de-…","action":"updated","actorKind":"user","actorUserId":"ef4acac9-…","changes":{"ownerId":{"to":"b1939ede-…","from":"ef4acac9-…"}}}`

**Mailhog after every reassign in this plan (~47 real owner changes): `total = 0`, unchanged from the
baseline of 0.** D-13 and T-38-14 proven out of process.

---

## Browser UAT — what was actually run

Headless Chrome, 1440×1000, `http://localhost:3001`. 19 screenshots and all 8 driver/UAT scripts are
archived at `.planning/phases/38-bulk-operations/38-20-uat-evidence/` (gitignored — on disk, not in git).

### Selection, both reachable surfaces (SC-1) — PASS

Identical results on `/organizations` and `/people`.

| Item | Result |
|---|---|
| SSR: select column is the **first** `th`, before `Name` | **PASS** — 51 checkboxes (1 header + 50 rows) |
| SSR: row `aria-label` names the **record** | **PASS** — `Select Hotel Solar do Amanhecer`, `Select Acme`-style, never "Select row" |
| SSR: header `aria-label`, 50 rows | **PASS** — `Select all 50 loaded records` |
| SSR: header `aria-label`, **1** row (`?search=Hotel Solar do Amanhecer`) | **PASS** — `Select the 1 loaded record` (singular ICU branch) |
| SSR: empty result (`?search=zzzznomatchzzz`) | **PASS** — header `aria-label` `Select all 0 loaded records`, `disabled=""`, `data-disabled=""`, computed `opacity: 0.5`; empty-state cell `colspan="7"` counts the select column, text `No organizations found.` |
| **0 selected** — no bar, no spacer | **PASS** — `role="region"` count 0, `h-20` spacer count 0 |
| **1 selected** | **PASS** — bar reads `1 selected` (singular branch), row `data-state="selected"`, spacer height **80px**, bar `position: fixed`, **`z-index: 60`** (the `z-[60]` decision, not `z-30`) |
| bar contents | **PASS** — `1 selected \| Reassign owner \| Export CSV \| Delete \| Clear selection` — exactly 5 controls, every one text-labelled |
| **some selected → header renders a MINUS, not a check** | **PASS, and this is the headline visual.** `aria-checked="mixed"`, `data-state="indeterminate"`, and the two SVGs compute to `lucide-check → display: none` / `lucide-minus → display: block`. Screenshot `shot-indeterminate-organizations.png` shows a dash in the header above two ticked rows |
| all loaded selected → header renders a **check** | **PASS** — `lucide-check → display: block`, `lucide-minus → display: none`, `aria-checked="true"` |
| select-all count == visible row count | **PASS** — `50 selected`, 50 rows, 50 `data-state="selected"`, 50 `aria-checked="true"` |
| **selection persists across Load More** | **PASS** — 3 selected → Load More → **100 rows, still `3 selected`**, header still `mixed` |
| **selection cleared on search change** | **PASS** — 1 selected, typed `Mercado` into `Search organizations...` → bar **unmounted**, count null, url `?search=Mercado&page=1` |
| uncheck one row | **PASS** — `50 selected` → `49 selected`, url unchanged (no navigation), no sort |
| keyboard cursor **and** bulk selection simultaneously legible | **PASS** — same row carries `data-selected="true"` with `box-shadow: … 0px 0px 0px 2px` (the primary ring) **and** `data-state="selected"` with `background-color: lab(96.52 …)` (`bg-muted`). Two independent carriers, both live |
| `j`/`k` still move the cursor | **PASS** — with the table container focused: cursor `0 → 1 → 2 → 3`, then `k` → `2`. (An earlier run showed no movement; that run focused `document.body`. `"j, down"` is a **scoped** `useHotkeys` bound to the container ref at `data-table-keyboard.tsx:72`, unlike the document-level `d`/`e`/`n`. Pre-existing design, not a phase-38 effect.) |
| `d` still opens the **single-record** dialog | **PASS** — `Delete Organization` / `Are you sure you want to delete "clarissa"? You can restore it from Trash.`, and the bar stayed present at `1 selected` |
| `e` still edits | **PASS** — `Edit Organization` |
| `Escape` with the bar visible clears the selection | **PASS** — bar gone, 0 selected, spacer gone |
| bar never covers the last row or `Load More` at 1440px | **PASS** — bar rect `top 831 / bottom 881`; overlap with last row **false**, with `Load More` **false** |
| **over the cap** (2× Load More + select-all = 150) | **PASS** — bar reads `150 selected`, then verbatim `You can act on at most 100 records at once. 150 are selected.`; `Reassign owner` / `Export CSV` / `Delete` all `disabled: true`, **`Clear selection` still enabled** |

### Bulk delete dialog (SC-2 copy half) — PASS

Verbatim, read from the DOM, at three counts:

| Count | Title | Description | Cancel | Confirm |
|---|---|---|---|---|
| 1 | `Delete 1 record?` | `1 record moves to Trash. You can restore it for 30 days.` | `Keep records` | `Delete 1 record` |
| 2 | `Delete 2 records?` | `2 records move to Trash. You can restore them for 30 days.` | `Keep records` | `Delete 2 records` |
| 3 | `Delete 3 records?` | `3 records move to Trash. You can restore them for 30 days.` | `Keep records` | `Delete 3 records` |

**The day count is 30, which matches the live `trash.retention_days = 30` recorded in Task 1** — it is
read, not hardcoded, and both singular and plural branches are exercised.

| Item | Result |
|---|---|
| `Keep records` → nothing deleted, **selection intact** | **PASS** — dialog closed, still `3 selected`, `nSel = 3` |
| overlay click → dialog stays open, nothing deleted | **PASS** — Radix `AlertDialog` ignores the overlay, selection intact |
| total failure → error toast, **no** inline report | **PASS** — confirm with no session returned the whole-call refusal; toast `type="error"`, text `No records were deleted. Refresh the page and try again.`; `role="alert"` regions: **0**; selection **intact at 12** |
| the refusal renders a closed-code sentence, never a raw server string | **PASS** — `not_authenticated` surfaced as the sentence above, no server prose, no DB detail (T-38-07) |

### Bulk reassign dialog (SC-3 UI half) — PASS, with one finding

| Item | Result |
|---|---|
| opens with an **empty** Select and a **disabled** confirm | **PASS** — trigger text `Choose a user`, `aria-expanded="false"`, `Reassign 12 records` `disabled: true` |
| title / description | `Reassign owner` / `Choose the new owner of 12 selected records.` |
| visible `<Label>`, not a placeholder-as-label | **PASS** — `New owner`, `for="bulk-owner"` |
| **owner options, verbatim** | **`["Mark Chen", "Unknown"]`** — **exactly 2 options**, matching the 2 approved non-deleted users. **No soft-deleted and no unapproved user is offered.** But the admin renders as `Unknown` — gap **G4** |
| `noEmailNotice` visible **without scrolling** | **PASS** — `The new owner isn't emailed about this change.`, `visibleWithoutScroll: true`, dialog not scrollable, `font-size: 12px` (the Meta role) |
| choosing an owner enables confirm | **PASS** — `Reassign 12 records`, `disabled: false` |
| confirm → whole-call failure path | **PASS** — toast `type="error"`, `No records were reassigned. Refresh the page and try again.`; **selection preserved at 12**; no inline report |
| no format picker, no Pipedrive anywhere | **PASS** — `/pipedrive/i` false, `/format/i` false, no standalone `JSON` option, `0` comboboxes/selects inside the bar |

### 320px, through a same-origin iframe — PASS (bar), with one finding (spacer)

The iframe method was re-validated first: inside the 320px frame `window.innerWidth === 320` **and**
`matchMedia('(max-width: 640px)').matches === true`, so Tailwind breakpoints genuinely apply — the
Phase 37 lesson holds and `resize_window` was not used.

| Measurement | `/organizations` | `/people` |
|---|---|---|
| `window.innerWidth` | 320 | 320 |
| **bar `scrollWidth` / `clientWidth`** | **286 / 286 — EQUAL** | **286 / 286 — EQUAL** |
| bar bounding width | 288 (inside `max-w-[calc(100%-2rem)]`) | 288 |
| bar lines (distinct control `top` values) | **3 — it wraps** | **3** |
| all 5 controls reachable and non-zero size | yes | yes |
| `documentElement` `scrollWidth` / `clientWidth` | **320 / 320** | **320 / 320** |
| **app `<header>` `scrollWidth` / `clientWidth`** | **320 / 320** | **320 / 320** |
| `h-20` spacer height | 80 | 80 |
| last row covered by the bar | **no** | **no** |
| **`Load More` covered by the bar** | **YES — gap G3** | **YES — gap G3** |

**The bar does not overflow horizontally at 320px on either reachable route.** It wraps to three lines
and `scrollWidth === clientWidth`.

**On the pre-existing header overflow (37-UAT G5), stated explicitly so it is not misattributed
either way:** Phase 37 measured the app `<header>` at `scrollWidth 416` vs `clientWidth 301` on every
route. **This plan measured 320 / 320 — no overflow.** That is **not** evidence that G5 was fixed and
it is **not** attributable to this phase's bar: these measurements were taken on an
**unauthenticated** render, where the header shows the reduced logged-out nav (`Pipelite | Login |
Login`) instead of the full signed-in navigation that produced Phase 37's 416px. **37-UAT G5 remains
open and unverified by this plan.** Either way, the header's width is measured **separately** from the
bar's above, and the bar's own `scrollWidth === clientWidth` is the number that belongs to this phase.

### Dark mode — PASS

With `.dark` on `<html>`, all five surfaces legible (`shot-dark-bar.png`, `shot-dark-delete-dialog.png`):

| Element | Computed |
|---|---|
| bar background / text | `lab(7.78 …)` on `lab(98.26 …)` text — near-black card, light text |
| selected row | `lab(15.20 …)` — distinguishable from the bar and from the page |
| `Delete` control | `lab(63.71, a 60.7, b 31.3)` — red text, no fill, as specified |
| checked checkbox | bg `lab(90.95 …)` / fg `lab(7.78 …)` — inverted primary, high contrast |
| delete dialog surface | `lab(2.75 …)` |

### Toast vs bar layering — PASS

`bar z-index: 60`, `[data-sonner-toaster] z-index: 999999999`. A toast always renders above the bar,
structurally, at every viewport. Confirmed by measurement, not assumed.

### Fresh-profile `ShortcutsHint` layering (D-22, T-38-31) — PASS

Brand-new browser profile, `localStorage.pipelite_shortcuts_hint_dismissed === null` **before** load,
selection made within the first second:

| Measurement | Value |
|---|---|
| `ShortcutsHint` present, text | yes — `Press ? to see all keyboard shortcuts` |
| hint `z-index` / rect | **50** / `top 872, bottom 913`, full width |
| bar `z-index` / rect | **60** / `top 831, bottom 881` |
| do they overlap? | **yes** (872 < 881) — so this is a real collision, not a theoretical one |
| `elementFromPoint` at the bar's centre | `BUTTON` "Export CSV", `inBar: true` — **the bar is on top** |
| after 11s | hint auto-dismissed on its own; flag still `null` |

A `z-30` bar would have rendered behind the hint in exactly this window. `z-[60]` is verified in the
only session in which it can be.

### 38-RESEARCH assumption A4 — ANSWERED (finding, not fixed)

With the **bulk delete dialog open** and focus on its `Keep records` button
(`document.activeElement === BUTTON / "Keep records"`):

| Key pressed | Result |
|---|---|
| `d` | **the single-record `Delete Organization` dialog opened underneath** → 2 dialogs stacked |
| `n` | **`Add Organization` opened too** → **3 dialogs stacked simultaneously** |
| `e` | nothing further — focus had moved into an `<input>` inside the Add form, so `isFormFocused()` correctly suppressed it |

**Radix does NOT block the document-level `react-hotkeys-hook` listeners.** A4 is resolved in the
negative. `isFormFocused()` (`data-table-keyboard.tsx:60-70`) checks only
`INPUT`/`TEXTAREA`/`SELECT`/`contenteditable`, and a focused Radix dialog button is none of those.
**This is pre-existing and already true of the existing single-record delete dialog; per the plan it
was verified and recorded, NOT fixed, and it is out of this phase's scope** (T-38-47 disposition
`accept`).

---

## BLOCKED-NOT-RUN — items that need an authenticated session

Every one of these is blocked solely by the missing browser session, and none is asserted anywhere
above. Listed individually so none is silently absorbed.

**Deals kanban (`/deals` → 307):** card checkbox does not expand the card; drag by body with another
card selected; **Tab to the checkbox and press Space** (T-38-41, the accessibility item); press-and-drag
>5px from the checkbox; stage-header checkbox disabled at 0 deals; stage-header minus/check; selection
across two stages; **per-stage select-all capping at 100 on the 10,495-deal stage and its verbatim
accessible name** (D-07); card focused + expanded + bulk-selected simultaneously; `bg-primary/5` in
dark mode; pipeline change clearing the selection.

**Activities (`/activities` → 307):** the whole selection checklist, and the filter-to-5-then-clear
count check.

**Trash + change history (`/trash` → 307):** the post-delete toast's `Open Trash` deep link and
whether it carries **`?type=`** (the 38-CONTEXT correction) rather than `?tab=`; the 12 records
appearing under the right tab; **each record's change-history timeline UI**. The audit rows those
timelines read were proven directly in probes B and D, but the **rendered** history was not seen.

**Successful writes through the UI:** every bulk action confirmed in the browser returned
`not_authenticated`, so the browser never observed a success. Therefore not run: the dialog staying
open with a spinner then closing; rows disappearing; the success toasts; focus landing on the table
wrapper rather than `<body>`; the `ownerName` column updating; **the inline failure report at 3 and at
40 failures**, its `max-h-48` scroll, its non-auto-dismissal over 30s, and its `Dismiss`; the
succeeded-deselected / failed-still-selected split. The **server-side** 9/12 and 4/3 partial outcomes
were proven in probes C and D.

**Real CSV download:** the browser could not produce a file. The four filenames and data-row counts
were proven **server-side** in probe A instead (`organizations-selected-12-2026-08-17.csv`, 12 data
rows; 5/5/5 rows for person/deal/activity). **Not run:** the actual Blob download, and the
**non-English-locale filename check** — locale selection is a per-user preference and needs a session.

**Locales:** es-ES and pt-BR rendering of the bar count, both dialog titles, the partial toast and the
failure reasons. `locale-parity.test.ts` covers key presence (plan 38-01); the rendered output was not
seen.

---

## Findings — 7 gaps, none fixed (this plan declares `files_modified: []`)

### G1 — NEW TO THIS PHASE. `Escape` while a dialog is open closes the dialog **and** clears the bulk selection

**Severity: high.** Violates 38-UI-SPEC § States Checklist: *"`Escape` with the bar visible clears the
selection; `Escape` with a dialog open closes the dialog **only**."*

Reproduction (both paths, one keydown each — instrumented, `escCount === 1`):

| Path | Before Escape | After ONE Escape |
|---|---|---|
| bar's own **bulk delete** dialog open | `Delete 3 records?` open, `3 selected`, `nSel 3` | dialog closed **and** bar gone, `nSel 0` |
| **single-record** dialog open (via `d`) | `Delete Organization` open, `2 selected`, `nSel 2` | dialog closed **and** bar gone, `nSel 0` |

Why it matters: the user cancels a 12-record delete with `Escape` and loses the selection they just
built — destroying exactly the "no re-picking" property the phase designed for.

The single-record path is explicable — the bar has no knowledge of that dialog. **The bulk path is
not:** `bulk-action-bar.tsx:147-156` explicitly guards `if (!hasSelection || busy || deleteOpen ||
reassignOpen) return`, and `deleteOpen` was `true`. **Hypothesis for the owner to confirm** (stated as
a hypothesis, not a conclusion): Radix's `DismissableLayer` handles Escape in the **capture** phase and
React 19 flushes discrete-event state updates **synchronously**, so `deleteOpen` becomes `false` and
the effect re-registers an unguarded listener *while the same keydown is still propagating*, which then
reaches it in the bubble phase.

**Proposed owner:** `src/components/bulk/bulk-action-bar.tsx:147-156`. Candidate fixes: read the guard
from a ref rather than the effect closure, register with `{ capture: true }` and check
`event.defaultPrevented`, or scope the listener to the list container instead of `document`.

### G2 — PRE-EXISTING, APP-WIDE. The bulk delete confirm button is **not red** — `bg-destructive` loses to `bg-primary`

**Severity: high visual; NOT attributable to phase 38.**

Measured on the `Delete N records` confirm button:

| Mode | `--primary` | `--destructive` | **computed button background** | verdict |
|---|---|---|---|---|
| light | `lab(7.78% …)` | `lab(48.45% 77.43 61.55)` (red) | **`lab(7.78 …)`** | renders **primary** |
| dark | `lab(90.95% …)` | `lab(63.71% 60.75 31.31)` (red) | **`lab(90.95 …)`** | renders **primary** |

Its className carries **both**: `bg-primary text-primary-foreground hover:bg-primary/90
bg-destructive text-destructive-foreground hover:bg-destructive/90`. Source order in the generated
stylesheet decides, and `bg-primary` wins.

Control, same page, same run — the existing single-record `Delete Organization` confirm **is** red:
computed `lab(48.4493 77.4328 61.5452)` in light, `oklab(0.704 0.177 0.072 / 0.6)` in dark, from
`bg-destructive text-white hover:bg-destructive/90 dark:bg-destructive/60`.

Root cause is in the **shared primitive**: `AlertDialogAction`
(`src/components/ui/alert-dialog.tsx:147-159`) renders `<Button variant={variant} size={size} asChild>`
around `AlertDialogPrimitive.Action` with `className={cn(className)}`. Radix's `Slot` **concatenates**
the parent's and child's class strings; `twMerge` never sees them together, so the conflict is never
resolved.

**Eight other existing consumers pass the identical class string** to `AlertDialogAction`:
`timeline/delete-note-dialog.tsx:103`, `deals/deal-card.tsx:325`, `deals/deal-dialog.tsx:546`,
`admin/webhooks/delete-dialog.tsx:53`, `admin/pipelines/delete-dialog.tsx:50`,
`admin/pipelines/[id]/delete-stage-dialog.tsx:78`, `activities/activity-dialog.tsx:540`,
`activities/activity-list.tsx:575`. **So every `AlertDialogAction`-based destructive confirm in the app
is affected, and phase 38 reproduced the app's existing idiom exactly as 38-UI-SPEC instructed
("the same class string the six existing delete dialogs already use").** This is a pre-existing
app-wide defect in the same family as 37-UAT G5, **not a phase-38 regression.**

The one-word fix: `AlertDialogAction` already accepts `variant` — pass `variant="destructive"` instead
of the className. Empirically confirmed on the one affected consumer reachable without a session; the
other eight are behind auth, and the mechanism is in the shared primitive.

**Proposed owner:** a follow-up phase, across `src/components/ui/alert-dialog.tsx` + all 9 consumers.

### G3 — NEW TO THIS PHASE. At 320px the `h-20` spacer is too short and the bar covers `Load More`

**Severity: medium.** Violates 38-UI-SPEC § States Checklist (*"The last table row and the `Load More`
button are never covered"*) and this plan's own item C-5.

Measured `loadMoreOverlap: true` on **both** `/organizations` and `/people` inside the 320px iframe,
and visible in `shot-320-organizations.png`. Cause: the bar wraps to **3 lines** at 320px (~120px tall,
control tops at 747 / 787 / 827) while the spacer is fixed at `h-20` = **80px**. At 1440px the bar is
one line (50px) and 80px suffices — which is why the wide-viewport check passed.

**Proposed owner:** `src/components/bulk/bulk-action-bar.tsx` — the spacer needs to track the bar's
rendered height, or be raised to clear the three-line case.

### G4 — PRE-EXISTING (live data). The owner picker offers "Unknown", and owner display is inconsistent

The owner picker's verbatim option list is **`["Mark Chen", "Unknown"]`**. The second entry is the
acting admin, `prbitt@gmail.com`, whose `users.name` is `NULL`. Two of the seven users have a NULL
name. Three different fallbacks are in play for the same user:

| Surface | Renders the admin as |
|---|---|
| reassign owner picker | **`Unknown`** |
| the `Owner` table column | **`-`** (visible in every screenshot) |
| the exported CSV `ownerName` | **`prbitt@gmail.com`** |

Not caused by this phase — a NULL `name` is a pre-existing data condition and the column fallback
predates it — but it makes SC-3's picker present the user's own account as "Unknown", which only live
data reveals.

**Proposed owner:** a follow-up; the coherent fallback is the email, as the CSV already does.

### G5 — PRE-EXISTING, SECURITY. `/organizations` and `/people` have **no authentication gate**

**Severity: high. Out of this phase's scope, but it must not go unrecorded.**

`GET http://localhost:3001/organizations` with **no cookie** returns **HTTP 200** and a 330,775-byte
document containing 50 real organization rows with names, dates and 51 rendered checkboxes. `/people`
behaves identically. There is **no `middleware.ts` anywhere in the repo** (`find . -maxdepth 3 -name
"middleware.*"` → nothing) and neither `organizations/page.tsx` nor `people/page.tsx` contains `auth`,
`session` or `redirect` — while `deals/page.tsx:39-44` and `activities/page.tsx:62-67` both do, and
both correctly `307`.

Pre-existing: `git log` on `organizations/page.tsx` shows the phase-38 commit (`3560f25`) only added
the `retentionDays` / `bulkOwners` props; the file has never had an auth check.

Phase 38 does **not** create this hole, but it does **widen what an unauthenticated visitor can see**:
the select column, the bar and both dialogs now render for them too. The bulk **writes** are all
correctly refused with `not_authenticated` (proven three times above), and `exportSelectedOrganizations`
also refuses, so **no data leaves through the new actions** — but the list itself was already readable.

**Proposed owner:** a dedicated security fix adding the same `auth()` guard the other two list pages
have, or a `middleware.ts`. Not fixable inside a bulk-operations plan.

### G6 — Methodological. `changes ? 'ownerId'` is not a clean proxy for "a reassign happened"

The plan's `key_links` pattern is `changes \? 'ownerId'`. A **delete** audit row snapshots every field's
`from` value, **including `ownerId`**, so it satisfies that predicate too. Final-state counts:

```
audit_total = 197 | changes ? 'ownerId' = 81 | changes->'ownerId' ? 'to' = 47 | action='deleted' = 51
```

81 − 47 = 34 of the `? 'ownerId'` matches are deletes, not reassigns. The delta-of-exactly-10
assertion above is still sound because it was measured across a window containing **no deletes**, but a
future gate should use **`changes->'ownerId' ? 'to'`**, which only an actual owner change satisfies.

### G7 — Observation, not a defect. Empty-result column widths

Measured `thead th` widths, `/organizations`:

```
non-empty: [55, 578, 94, 98, 83, 140, 116]
empty    : [123, 170, 210, 219, 185, 208, 49]
```

**All seven columns change, not just the select column.** The empty body is a single `colspan="7"`
cell, so CSS auto table-layout redistributes every column. The UI-SPEC's actual requirement —
*"disabled, not hidden … a header cell that appears and disappears makes the column widths jump"* — is
**met**: the select header is present and `disabled` with `opacity: 0.5`. The residual redistribution is
generic table behaviour affecting all columns equally and predates this phase. Recorded rather than
raised.

### Additional note (probe methodology, not a product finding)

The audit subscriber registers **only** in `instrumentation.register()`, so a bare test process writes
no audit rows — the cause of probe B's first `delta = 0`. Separately,
`restoreOrganizationMutation` writes its audit row **directly** rather than via the bus (documented
divergence at `mutations/organizations.ts:447-458`, since no `organization.restored` event exists),
which is why 12 restore rows appeared in the un-registered run while 0 delete rows did. Both are
correct by design; both are traps for any future live probe.

---

## Data touched, and its final state

Every delete in this plan was a **soft** delete and every one was **restored**. Every reassignment was
**reverted to the admin**. The only lasting change is the intended user restoration.

| Probe | Records touched | Left as |
|---|---|---|
| B | 12 organizations soft-deleted | **all 12 restored, live** |
| C | 12 organizations (9 deleted + 3 refused), 3 reassigned to user B; 12 deals deleted, 3 reassigned | **all restored; all owners reverted to admin** |
| D | 10 + 3 + 4 organizations reassigned; 3 deals reassigned | **every one reverted to admin** |
| E | 6 records attempted as a member | **0 succeeded — nothing changed** |
| browser | 3 bulk actions attempted with no session | **0 succeeded — `not_authenticated`** |

Specific ids are recorded verbatim in the probe transcripts above (probe B's 12 organizations, probe C's
3 refused organizations, probe D's 10 organizations and 3 deals).

### Baseline vs final

| Probe | Baseline | Final | Delta and its cause |
|---|---|---|---|
| `users` total | 7 | **7** | 0 |
| approved & non-deleted users | **1** | **2** | **+1 — the intended `mark.chen` restoration (Task 1)** |
| organizations, `deleted_at IS NULL` | 46054 | **46054** | **0** — every probe-B/C delete restored |
| organizations, `deleted_at IS NOT NULL` | 0 | **0** | 0 — **nothing left in trash** |
| deals, `deleted_at IS NULL` | 25195 | **25195** | 0 |
| deals, `deleted_at IS NOT NULL` | 0 | **0** | 0 |
| **`deal_assignees`** | **0** | **0** | **0 — T-38-05 clean across every deals reassign** |
| `audit_log` total | 73 | **197** | **+124** — 51 `deleted` rows (probes B, C) + restore rows + 47 real reassign rows (probes C, D). Audit rows are immutable evidence and were deliberately left |
| `audit_log where changes ? 'ownerId'` | 2 | 81 | +79 — 47 real reassigns + 34 delete snapshots (see G6) |
| `audit_log where changes->'ownerId' ? 'to'` | — | **47** | the real owner changes |
| `trash.retention_days` | 30 | **30** | **untouched, as instructed** |
| **Mailhog messages** | **0** | **0** | **0 — no email on ~47 reassigns (D-13, T-38-14)** |

**Nothing was purged. Nothing was hard-deleted. The retention setting was not touched. No source file
was modified** (`git status --porcelain` → `0`).

---

## Success criteria — verdict

| Criterion | Verdict | Basis |
|---|---|---|
| **SC-1** selection + header select-all on all four surfaces | **PARTIAL** | **PASS on Organizations and People in a real browser**, including the indeterminate **minus**, the exact count, Load More persistence and search clearing. **Deals kanban and Activities BLOCKED** (auth). The 100-deal cap and the Space-to-select accessibility item are **not verified** |
| **SC-2** count-aware bulk delete, records in trash | **PARTIAL** | Dialog copy verbatim at counts 1/2/3 with the **live** 30-day window; soft delete + trash presence + full restore proven by probe B (12/12). **The Trash deep link and its `?type=` parameter are BLOCKED** |
| **SC-3** partial failure named, not swallowed | **PARTIAL** | **The canonical 9/12 `notPermitted` split and the deals-fully-succeeds asymmetry are both proven on live data** (probes C, E), plus a 4/3 reassign partial. The reassign dialog, its 2-option picker and the total-failure toast are proven in the browser. **The inline report's rendering at 3 and 40 failures is BLOCKED** |
| **SC-4** export only the selection | **PASS (server side)** | Generated SQL quoted; 12 ids → **12** rows and 13 CSV lines, not 46,054; `ids: []` → 0 on all four entities while `filters: {}` → 46,054; `custom_*` survives a first row with none; no `[object Object]`; filename `organizations-selected-12-2026-08-17.csv`. **The Blob download and the locale-invariance of the filename are BLOCKED** |
| **SC-5** deletes and reassigns in change history | **PASS (data layer)** | 12 `deleted` audit rows and **exactly 10** `ownerId` rows, both `actorKind: user` with the real actor id, `{ownerId:{from,to}}` verbatim; same-owner no-op correctly writes none. **The rendered timeline UI is BLOCKED** |
| no email on reassign; `deal_assignees` still 0; nothing hard-deleted | **PASS** | Mailhog 0 → 0 across ~47 reassigns; `deal_assignees` 0 → 0; trashed counts 0, live counts identical to baseline |
| the bar does not overflow at 320px | **PASS** | bar `scrollWidth === clientWidth === 286` on both reachable routes, wrapping to 3 lines, inside a genuinely 320px iframe. Header measured **separately** (320/320) with 37-UAT G5 explicitly left open |
| pre-existing defects recorded, not fixed | **PASS** | A4 answered in the negative (3 dialogs stacked); G2, G4, G5, G7 all attributed to pre-existing causes with the mechanism named; **zero source files modified** |

**Honest bottom line:** the phase's **data and authorization behaviour is proven** against 46,054 live
organizations and 25,195 live deals. Its **interaction behaviour is proven on two of four surfaces**.
The Deals kanban — including the two items the threat register singles out, the 100-deal cap (D-07) and
Space-to-select (T-38-41) — **has not been exercised at all**, and re-running this plan's Task 2/3
browser sections with a working session remains necessary before the phase can be called verified.

---

## Threat register outcomes

| Threat ID | Verdict | Evidence |
|---|---|---|
| T-38-46 unverifiable success criteria | **mitigated** | 1 → 2 approved users, recorded before/after; both SC-3 and SC-5 then produced real evidence |
| T-38-02 authorization asymmetry | **mitigated** | 9/12 on organizations vs 12/12 on deals, same set shape, same actor; plus a member negative control on live records (3 `notPermitted` on each surface) |
| T-38-05 `deal_assignees` destruction | **mitigated** | 0 → 0 across every deals reassign in probes C and D |
| T-38-14 unwanted notification | **mitigated** | Mailhog 0 → 0 across ~47 reassigns |
| T-38-01 export info disclosure | **mitigated** | 12 ids → 12 rows; `ids: []` → 0; `filters:{}` control → 46,054 |
| T-38-04 audit attribution | **mitigated** | polled with settle; exactly 10 `ownerId` rows, real `actorUserId`, never `system` |
| T-38-31 `z-[60]` vs `ShortcutsHint` | **mitigated** | fresh profile, real overlap, `elementFromPoint` returns a bar button |
| T-38-41 keyboard user cannot select a deal card | **NOT VERIFIED** | `/deals` requires a session — BLOCKED |
| T-38-47 pre-existing defect misattributed | **honoured** | A4, G2, G4, G5 and G7 each attributed to their pre-existing cause; 37-UAT G5 explicitly left open rather than claimed fixed |
| T-38-48 UAT mutating data irrecoverably | **mitigated** | all soft deletes restored, all reassignments reverted, trashed counts 0, live counts equal to baseline |
| T-38-SC package installs | **honoured** | **zero packages installed**; the CDP client uses node's built-in `WebSocket` |

---

## Deviations from Plan

**1. [Environment] The browser tooling named by the plan was unavailable.**
- Found during: Task 1 step 6.
- Issue: `ToolSearch` is disabled and no `mcp__claude-in-chrome__*` tool exists in this session; the
  Chrome on `127.0.0.1:9222` does not expose the DevTools HTTP API.
- Action: no credential was guessed, reset or read. A self-launched headless Chrome driven over CDP
  with node's built-in `WebSocket` was used instead (zero packages), confined to `localhost:3001`. All
  session-dependent items are listed as BLOCKED-NOT-RUN above rather than assumed.
- Files modified: none.

**2. [Method] The live-DB probes mirror each bulk action's loop rather than calling the action.**
- Reason: `auth()` cannot be entered from a test process. Each probe copies the action's `findFirst`
  predicate, ownership comparison, `runWithActor` placement and dispatch call verbatim, with the
  session identity injected, and additionally calls `registerAuditSubscriber()` because that
  registration lives only in `instrumentation.register()`.
- Limitation, stated so it is not over-read: the probes do **not** exercise `auth()`, `parseIdList`,
  the `BULK_MAX_IDS` pre-flight or `revalidatePath`. Those are covered by the plan 38-11..14 unit
  suites, and the `not_authenticated` refusal was separately observed three times in the browser.
- Files modified: none. The probe file was created under `src/lib/bulk/`, run, and deleted;
  `git status --porcelain` is `0`.

**3. [Task 1 step 2] SQL rather than the `/admin/users` affordance.**
- Reason: the admin route is auth-gated and unreachable without a session. The affordance was located
  and read (`edit-user-dialog.tsx:170`, `admin/users/actions.ts:194-220`) and is recorded as the
  preferred path for a future run.

**4. [Scope] Seven findings were recorded and none was fixed.**
- Reason: this plan declares `files_modified: []`. G1 and G3 are new to this phase and need an owner;
  G2, G4, G5 and G7 are pre-existing; A4 was explicitly to be recorded and not fixed.

**No source file was modified. No package was installed. No email was sent. Nothing was purged.**

---

## Self-Check: PASSED

- `.planning/phases/38-bulk-operations/38-20-SUMMARY.md` — FOUND
- `.planning/phases/38-bulk-operations/38-20-uat-evidence/` — FOUND (19 PNG screenshots + 8 scripts)
- `git status --porcelain` → `0` (no source file modified; the temporary probe was removed)
- `select count(*) from users where deleted_at is null and status='approved'` → **2**
- `select count(*) from deal_assignees` → **0**
- `select count(*) from organizations where deleted_at is not null` → **0**
- Mailhog `total` → **0**
