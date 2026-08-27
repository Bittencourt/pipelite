# Phase 50: Export Authorization — Research

**Researched:** 2026-08-27
**Domain:** Server-action authorization, SQL cardinality gating, i18n contract, CI test-project topology
**Confidence:** HIGH on the code surface and the live measurements (all re-measured in-session against
`localhost:5433`); MEDIUM on the recommended threshold value (a judgement the measurement narrows but
does not settle); HIGH on the CI mechanism (the decision is smaller than Phase 40 believed).

---

## Summary

The fix has one physical constraint that shapes everything else: **`guardExportInput` has exactly one
production caller**, `src/lib/views/export-action.ts:62`, and that call site is the only place in the
repository where a caller-supplied filter map reaches an uncapped-by-selection read. Every other export
path is structurally bounded already — the four Phase 38 bulk actions are `ids`-only and hard-capped at
`BULK_MAX_IDS = 100` (`src/lib/bulk/limits.ts:32`), and the admin full export is role-gated
(`src/app/admin/export/actions.ts:16`). So this phase touches one call site, and the "second unguarded
caller" hazard the objective warns about is real but bounded and enumerable: six `fetchFilteredData`
call sites, listed below with their guard status.

The selectivity check cannot live inside `guardExportInput`. That function's own header
(`view-export-guard.ts:18-19`) declares "NO DATABASE IMPORT, and that is a property worth keeping:
everything here is decidable from the submitted filter map alone, which is what makes the refusal
happen BEFORE any query runs." A cardinality rule needs I/O, so the recommendation is a **new sibling
module** holding a pure decision function plus an async counter, called from `export-action.ts` between
the existing guard and the fetch. That keeps every shipped structural gate on the guard green while
adding a second, independent control — except one, and it is the most important finding in this
document: **`view-filters.test.ts:736-747` asserts that `export-action.ts` contains neither the token
`"admin"` nor the bare word `role`**. The locked decision "admins are unaffected" collides with that
gate head-on, and satisfying it by moving the admin branch one module away would be gate-laundering.

`total` and `matched` are cheap and already have an in-repo idiom that solves the divergence problem:
`src/app/api/v1/organizations/route.ts:35-38` builds one `whereClause` and hands it to *both* `count()`
and `findMany`. Measured in-session: `COUNT(*)` with the organizations `search` predicate is **46.1 ms**,
the unfiltered live count **13.0 ms**, and a single combined `count(*) FILTER (WHERE …)` aggregate is
**93.5 ms** — *slower* than the two separate counts. So: two counts, per attempt, no cache.

**Primary recommendation:** add `src/lib/export/export-selectivity.ts` (pure `decideSelectivity` +
async `countExportMatches`) and an exported `buildExportConditions` in `formatters.ts` used by both the
fetchers and the counter; call it from `export-action.ts:62-68`; set
`MAX_EXPORT_FRACTION = 0.40` and `MIN_EXPORT_ROWS` (a floor, needed — see §5) with the measured
distribution recorded in the constant's doc comment; walk SC-4's boundary with the activities `dateTo`
ladder in §8, which brackets any candidate threshold within ~0.2 pp against fixed live data; and
absorb **both** never-run live files (28 tests, not 24 — see §7).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**The fix: a MINIMUM SELECTIVITY RULE (user decision, 2026-08-27).** Refuse when the result exceeds a
fraction of the live table.

- **Why this and not the other two candidates.** It is the only one that satisfies SC-1 and SC-2
  *together*, because it is the only one that distinguishes a narrow export from a broad one. A
  non-admin row cap is an absolute bound where the requirement is relative — set it low and legitimate
  mid-size exports break, set it at 10,000 and 22% of the customer table still walks out.
- **SC-2 rules the pure admin gate OUT.** "A legitimately narrow export still completes for the same
  non-admin, so the fix is a bound and not a removal of the feature." Restoring Phase 38's admin gate
  removes the feature for non-admins; it cannot satisfy SC-2. State this in the plan rather than
  leaving a reader to wonder why the third candidate was dropped.
- **`MAX_EXPORT_FRACTION` must be a tunable with a recorded measurement behind it, not a guess.**
  Phase 46's `BATCH_SIZE = 200` is the cautionary analog — its own comment admits it "has not been
  measured" and was "chosen to keep one batch well under a second of database work rather than from a
  measurement." Do not add a second such number. Measure, and record what the measurement was.
- **The refusal must carry the numbers** (`matched`, `total`) so SC-3 is satisfiable with an actionable
  message rather than a generic one. Phase 40 already had to reword this string once — its verifier
  found `views.export.disabledReason` said "Choose at least one filter first. An unfiltered export
  isn't allowed." in the one case the narrowing exists for, and G-2 was closed by rewording. Do not
  regress that.
- **Admins are unaffected**, which is what makes SC-2 provable at all: the same broad export that a
  non-admin is refused must still complete for an admin, or the rule is a feature removal wearing a
  guard's clothes.

**Absorb `formatters-live.test.ts` (user decision, 2026-08-27).** Make its 24 tests runnable in CI as
part of this phase. They guard the exact path this phase changes; the file reports as 24 skipped and CI
never runs it because CI has no `DATABASE_URL`; its own header records that it exists because a
wholly-mocked suite once passed a malformed drizzle fragment in Phase 37. Phase 40 declined it as "an
infrastructure decision, not a drive-by edit on the last day of a milestone" — sound then, not
applicable now.

**The v1.3 override: a knowing, documented acceptance on both sides — NOT an override of a blocking
finding**, and the ROADMAP's own history note was inaccurate. Corrected in place. No re-litigation of
v1.3 is owed.

### Claude's Discretion

- Where the selectivity check lives relative to `guardExportInput` (it is currently a **synchronous
  pure function** and the check needs a count, so something has to give — say what and why).
- How `total` is obtained per entity type, and whether it is cached or read per attempt.
- The shape of the refusal payload and how it reaches the UI string.
- How CI gets a database for `formatters-live.test.ts`, and whether that file stays a separate project
  or joins an existing one.

### Deferred Ideas (OUT OF SCOPE)

- **SEC-49-D** — `POST /api/upload` authorizes on `session?.user` alone, no entity resolution, no path
  containment; `entityId = "../../.."` resolves to `/app`. Its own owner; do not absorb.
- **DEF-49-07** — the owner-model reconciliation (what "may see this record" means).
- **DEF-49-08** — `organizations`/`activities` ship the pre-recalc blob in the canonical-read fallback.
- **DEF-49-09** — the merge no longer moves attachments and the UI does not say so.
- **SEC-49-A** (S3 reads bypass the app), **SEC-49-B** (`requireScopedPredicate` silent at 3+ terms),
  **SEC-49-C** (`activities/[id]` answers 403 where siblings answer 404), **DATA-49-A**.
- **SEC-47-A** — `src/lib/email/client.ts:20` sets `tls: { rejectUnauthorized: false }` unconditionally.
  Still the largest single exposure in the backlog.
- **DEF-48-05 / SEC-48-C**, **DEF-48-06 / IMP-48-A**, **TS-48-A**, **DOC-48-01**, **SEC-48-D**'s relay
  half.
- `delete-entity-files.ts:129-132` counts an already-absent file as *deleted*.

Also out of scope per CONTEXT: everything in Phases 51-54; the `/api/v1` authorization surface
(Phase 48); the mutation layer (Phase 49).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEC-03 | A view export cannot return substantially the whole table to a non-admin. Source: WR-04; `search=a` still matches 44,254 of 46,054 organizations (96.1%) under `EXPORT_ROW_CAP = 50_000`. | §1 (where the check goes, single call site), §2 (`matched`/`total` without divergence), §4 (threshold with the measured distribution), §5 (the small-N floor), §6 (the SC-3 message path) |
</phase_requirements>

---

## Project Constraints (from CLAUDE.md and project memory)

There is **no `./CLAUDE.md` in the repository** — verified, the file does not exist. The binding
directives come from the user's global `CLAUDE.md` and the project memory file
`~/.claude/projects/-home-pedro-programming-pipelite/memory/MEMORY.md`:

| Directive | Consequence for this phase |
|-----------|----------------------------|
| **Docker only.** Never `npm run dev`, `pnpm dev`, `next dev`. App on `http://localhost:3001`, Postgres on `localhost:5433`. | Any HTTP-level proof runs against the container. |
| **`docker` needs NO `sudo`.** Never embed a password anywhere. | `docker compose exec -T postgres psql -U pipelite -d pipelite -c "…"` from the repo root. Verified working in-session. |
| **`docker restart` does not rebuild.** The "Starting" line is a vacuous freshness check. | If the phase makes an HTTP-level claim, use `docker compose up -d --build` and **compare the image sha256** before and after, as Phases 48 and 49 did. |
| **rtk mangles output.** `grep \| wc -l` returned 36 as 19; `grep -n` has returned a restructured summary; redirecting filtered output into a file writes an ELIDED placeholder at exit 0; `git status --porcelain` renders as `ok`. | **Never state a count obtained from a pipe.** Use `rtk proxy <cmd>`, the Read/Grep tools, or `node`. Gate the tree on `git diff --exit-code`. |
| **`npx <tool>` is rewritten to a missing script.** | Use `./node_modules/.bin/vitest` (verified working in-session). `--reporter=basic` is not a valid reporter in vitest 4.1.11 — it errors with `ERR_LOAD_URL`; use the default reporter. |
| **Gate on eslint ERRORS, never a warning total.** 124 on main vs 122 in a worktree. | Phase gate: `0 errors`. |
| **Worktrees branch from a stale base ALWAYS (28/28).** Fix with `merge --ff-only`, never `reset --hard`. Parallel executors need 3 symlinks. | Relevant if the phase runs plans in worktrees (`use_worktrees: true` in config). |
| **`.planning` is gitignored but tracked.** The GSD commit helper fails; force-add individual files only. | Affects committing this document. |
| **`scripts/dedup-db-test-setup.sh` drops and rebuilds every schema in `pipelite_dedup_test`.** Any wave scheduling two `*.db.test.ts` plans in parallel corrupts both. (`.planning/STATE.md:307-309`) | **Load-bearing here**: if this phase adds a `*.db.test.ts` file, it must not be scheduled in parallel with another db-test plan. |

**Project skills:** neither `.claude/skills/` nor `.agents/skills/` exists in this repository —
verified, both paths absent.

**Config:** `.planning/config.json` — `workflow.nyquist_validation: true`, `tdd_mode: true`,
`plan_check: true`, `verifier: true`, `use_worktrees: true`, `granularity: fine`. The Validation
Architecture section below is therefore required.

---

## 0. Re-measured live baseline (2026-08-27, in-session)

`docker compose exec -T postgres psql -U pipelite -d pipelite`

| Table | Live rows (`deleted_at IS NULL`) |
|---|---|
| `organizations` | **46,054** |
| `people` | **38,348** |
| `deals` | **25,195** |
| `activities` | **79,022** |
| `users` | 10 (2 admin, 8 member — all `approved`) |
| `audit_log` | **214**, of which **`entity_type = 'export'`: 0** |

**SC-1, re-measured and unchanged** [VERIFIED: live psql]:

```
select count(*) filter (where (name ilike '%a%' or industry ilike '%a%' or website ilike '%a%'))
         as matched,
       count(*) as total
  from organizations where deleted_at is null;
 matched | total
---------+-------
   44254 | 46054      -- 96.09%
```

People: `search=a` → **36,893 of 38,348 = 96.21%** — also unchanged from what BACKLOG records.

**The plan must re-measure again.** SC-1 says so explicitly and CONTEXT repeats it. Two of these
numbers already exist in three documents each; a third inherited copy is how STATE.md ended up saying
5659 while the tree was at 5696.

### Two findings from the baseline that are not in CONTEXT and change the phase

**(a) `EXPORT_ROW_CAP = 50_000` is vacuous for THREE of four entity types, not all four — and it
fires for the fourth.** CONTEXT says the cap "sits above every entity's whole table, so it cannot fire
for any of them." That is wrong for activities, and `view-filters.test.ts:766-773` says so itself:

```ts
expect(EXPORT_ROW_CAP).toBe(50_000)
expect(EXPORT_ROW_CAP).toBeLessThan(79_022)     // activities exceed it
expect(EXPORT_ROW_CAP).toBeGreaterThan(46_054)  // organizations do not
```

Verified against the live volumes: organizations 46,054 / people 38,348 / deals 25,195 are all **below**
the cap, so it cannot fire for them — three vacuous branches. Activities are 79,022, and the cap
**really does fire from the view path**: `status=completed` matches **74,857** activities (94.73%), so a
non-admin asking for that today gets `too_many`, not a CSV. Name it as *three-quarters vacuous with one
live branch*, not "a guard that cannot fire." Note also the shape of that test: `toBeGreaterThan(46_054)`
is an assertion **that the cap is vacuous for organizations**, pinned in both directions — the same
brittleness shape as `MIN_EXEMPT_MATCHED = 11`. Changing the cap reddens it.

**(b) `search=a` at 96.1% is NOT the worst case. Two keys reach 100%.** Every row in all four tables is
owned by the single user `ef4acac9-e860-4e71-9db5-ddaa2808cb9f` (an admin) — 46,054 / 38,348 / 25,195 /
79,022, one owner each, measured. `owner` is in `EXPORTABLE_FILTER_KEYS.deal` and
`EXPORTABLE_FILTER_KEYS.activity` (`url-params.ts:182-191`), so:

- **`/deals` with `owner=ef4acac9…` → 25,195 of 25,195 = 100.00%, under the 50,000 cap.** The entire
  deals table walks out to any authenticated non-admin. This is a live second instance of WR-04, on a
  different key, worse than the headline.
- `/activities` with `owner=ef4acac9…` → 79,022 (100%) → over the cap → refused today by accident of
  volume, not by design.

This is the same one-owner artefact that made Phase 48's SC-3 "a smoke check, not a proof"
(`STATE.md:275-278`). Two consequences the plan must absorb:

1. Any proof that uses `owner` as a *narrowing* filter is vacuous on this data (it narrows to 100% or
   to 0%). Do not use `owner` for SC-2.
2. `activities.assignee_id` is **NULL for all 79,022 rows** and `deal_assignees` has **0 rows**. So an
   `assignee`-only export returns an **empty CSV** on both entities. A "legitimately narrow export
   still completes" proof built on `assignee` would pass on zero rows — an empty-set pass, exactly what
   the gate discipline forbids. Use `search`, `type`, `status` or `stage` instead.

---

## 1. Where the selectivity check can physically go

### The constraint, read at source

`src/lib/export/view-export-guard.ts:128-139` — `guardExportInput` is sync and pure. Its header states
three reasons that are decisions, not incidentals:

- `:11-16` — it cannot move into `export-action.ts`, because a `"use server"` module may export nothing
  but async functions (Next.js 16 SWC: *"Only async functions are allowed to be exported in a
  `use server` file"*). `guardExportInput` is sync and `EXPORT_ROW_CAP` is a number.
- `:14-15` — the exact sentence the objective quotes: "`guardExportInput` is a SYNCHRONOUS pure function
  and `EXPORT_ROW_CAP` is a number, so neither can live beside the action."
- `:18-19` — "**NO DATABASE IMPORT, and that is a property worth keeping**: everything here is decidable
  from the submitted filter map alone, which is what makes the refusal happen BEFORE any query runs."

### Every caller, named

**`guardExportInput` — 2 importers total** [VERIFIED: `rtk proxy grep -rn "view-export-guard" src`]:

| Site | Kind |
|---|---|
| `src/lib/views/export-action.ts:28` (import), `:62` (call) | **the only production caller** |
| `src/lib/export/__tests__/view-filters.test.ts:79` | test |

No `"use client"` module imports it. `saved-views-bar.tsx` is `"use client"` but imports only the
server action `exportViewResults`. So the bundle argument against giving it a DB import is weak *today*;
the invariant argument (`:18-19`) is the real one.

**`fetchFilteredData` — 6 production call sites** [VERIFIED: grep, and see §3]:

| # | Call site | Bounded by | `maxRows` | Audit row |
|---|---|---|---|---|
| 1 | `src/lib/views/export-action.ts:68` | `guardExportInput` (filter presence only) | `EXPORT_ROW_CAP` | **yes** (`:94`) |
| 2 | `src/app/admin/export/actions.ts:20` | `role !== "admin"` refusal at `:16` | none (deliberate, `types.ts:55-57`) | no |
| 3 | `src/app/organizations/actions.ts:465` | `ids` only, `BULK_MAX_IDS = 100` | none | no |
| 4 | `src/app/people/actions.ts:461` | same | none | no |
| 5 | `src/app/deals/actions.ts:405` | same | none | no |
| 6 | `src/app/activities/actions.ts:427` | same | none | no |

Only site 1 lets a caller-supplied *filter map* reach the read. Sites 3-6 accept `(ids: string[])` and
nothing else — a security boundary asserted by a comment-blind source gate
(`organizations/actions.ts:428-436`).

### Options, with what each costs

| Option | Mechanism | Verdict |
|---|---|---|
| **A. Make `guardExportInput` async + import `@/db`** | one function, one call site changes | **Reject.** Breaks its own declared `:18-19` invariant and the "refusal precedes any query" property (the count *is* a query). Also destroys the property that a crafted `entityType` is refused with zero I/O (`:118-121`). Every one of the ~40 sync `guardExportInput(...)` assertions in `view-filters.test.ts:575-708` must gain an `await`. |
| **B. New sibling module, called from `export-action.ts` between the guard and the fetch** | `src/lib/export/export-selectivity.ts` exporting a **pure sync** `decideSelectivity({matched,total,isAdmin})` and an **async** `countExportMatches(entityType, filters)` | **RECOMMEND.** Keeps `view-export-guard.ts` pure and keeps its cheap sync refusal first, so a `{}` or crafted-`entityType` request still costs zero queries. The pure half is unit-testable at N=0 and N=10, which is the only way the floor in §5 can be proven at all (§5). One new call site to gate. |
| **C. Push it into `fetchFilteredData`** | one choke point, all six callers covered | **Reject, but say why in the plan.** It has 6 callers; the admin full export **must stay unbounded** (`types.ts:55-57` names it explicitly) and the four bulk paths are already `ids`-capped. Covering them needs an opt-in flag on a shared read path — and an opt-in flag someone forgets is precisely the "second unguarded caller" shape this phase exists to prevent. |

### The residual risk of Option B, and how to convert it into a red test

Option B guards *one call site*. If a second view-export path is ever added it will not be guarded, and
the objective is right that this is the shape to prevent. The existing gate at
`view-filters.test.ts:749-753` asserts `calls).toHaveLength(1)` — but **only within
`export-action.ts`'s own source**, so it says nothing about a new file.

Recommend a **repo-wide** enumeration gate: scan all production source for `fetchFilteredData(` call
sites, assert the set equals the six above, and classify each. A seventh call site then fails a named
test instead of shipping. Its anti-vacuity floor is `expect(sites.length).toBe(6)` in both directions,
and it must be **falsified on purpose** by adding a seventh site in a scratch file and watching it go
red before it is trusted.

---

## 2. How `total` and `matched` can be obtained, per entity type

### Does a count helper already exist?

**No shared helper.** But the idiom does, in production, and it already solves the divergence problem:

```ts
// src/app/api/v1/organizations/route.ts:35-38 — ONE whereClause, both consumers
const [{ total }] = await db.select({ total: count() }).from(organizations).where(whereClause)
const results     = await db.query.organizations.findMany({ where: whereClause, offset, limit })
```

`count()` from `drizzle-orm` (0.45.2) is already imported in 8+ modules including
`api/v1/{organizations,people,deals,audit}/route.ts`, `lib/audit/settings.ts`, `lib/dedup/queries.ts`.
No new dependency. The list *pages* do **not** count reliably — that is Phase 51's `UX-03` — so the
`/api/v1` routes are the precedent to copy, not the pages.

### Can `matched` be had without running the export query? Yes — and here is the cost, measured

`EXPLAIN (ANALYZE, BUFFERS)`, in-session, warm cache [VERIFIED: live psql]:

| Query | Plan | Execution |
|---|---|---|
| `count(*)` organizations, `deleted_at IS NULL` **(total)** | Seq Scan | **13.0 ms** |
| `count(*)` organizations + the 3-column `search` ILIKE **(matched)** | Seq Scan, 1920 shared hits, 0 reads | **46.1 ms** |
| `count(*)` activities, `deleted_at IS NULL` | Index Only Scan `activities_deleted_at_idx` | **16.3 ms** |
| `count(*)` activities `due_date < '2023-06-10'` | Index Scan `activities_due_date_idx` | **11.6 ms** |
| `SELECT *` organizations + the same ILIKE (44,254 rows) — the export's SQL half | Seq Scan | **74.8 ms** |
| **One combined** `count(*) FILTER (WHERE …), count(*)` | Seq Scan, ILIKE evaluated on all 46,054 | **93.5 ms** |

**Two separate counts (59.1 ms) beat the single combined aggregate (93.5 ms)**, because the `FILTER`
form evaluates the ILIKE inside the aggregate on every row instead of short-circuiting in the scan
filter. This is the sort of thing that is easy to guess wrong; it is measured. [VERIFIED: live psql]

**Recommendation: two counts, read per attempt, not cached.** Justification, stated so the number is not
a guess: 59 ms of added latency on an admitted export against a 74.8 ms SQL fetch that is itself a small
fraction of the end-to-end cost (44,254 rows are then flattened with custom fields and serialised by
papaparse). A cached `total` is a staleness bug on a security control, and an export is a rare,
user-initiated action — there is nothing to amortise.

### Would the two predicates diverge? Only if you let them

This is the real hazard and it has a structural fix. The four fetchers build their `conditions: SQL[]`
arrays **privately** inside `formatters.ts`: `fetchOrganizations:356-373`, `fetchPeople:391-409`,
`fetchDeals:428-468`, `fetchActivities:489-554`. A count written from a *copy* of those conditions is a
gate that can be bypassed the first time one side is edited.

**Recommended: extract the builders.** Export from `formatters.ts` a
`buildExportConditions(entityType, filters): SQL[]` (or four named builders behind one dispatcher), used
by **both** the fetchers and `countExportMatches`. Divergence then becomes a compile-or-nothing
question rather than a review question. Add a structural gate that each `fetch*` obtains its conditions
from that function and constructs none of its own — and falsify it by reintroducing a local
`conditions.push` in a scratch copy.

**One load-bearing property to prove rather than assume.** `COUNT(*)` on the base table equals
`rows.length` from `findMany` only if the `with:` relations do not multiply rows. All of them are
to-one (`organizations.owner`; `people.organization`, `.owner`; `deals.stage`, `.organization`,
`.person`, `.owner`; `activities.type`, `.deal`, `.owner`), and drizzle's relational builder emits
lateral subqueries rather than row-multiplying joins — so it holds. But it is exactly the class of
claim Phase 37's malformed drizzle fragment belongs to, so the plan should **assert it once against
live data**: for one filter, `countExportMatches(...) === (await fetchFilteredData(...)).count`. That
assertion goes RED if drizzle ever changes the join strategy, which no amount of reading proves.
[VERIFIED: drizzle-orm 0.45.2 in `package.json:44`; the equality itself marked `[ASSUMED]` until the
plan asserts it]

### Per-entity `total` — the base predicate

`total` must use the **same base predicate the fetchers use**: `isNull(<table>.deletedAt)` and nothing
else (`formatters.ts:356, 391, 428, 489`). Not a viewer-scoped count — there is no viewer scoping
anywhere in the export read path, which is the exposure, not a thing to encode into the denominator.

---

## 3. Every export entry point, and its answer to SC-5

| Path | Reachable by | Selectivity today | Max rows today | Audit row | In scope? |
|---|---|---|---|---|---|
| **View export** — `exportViewResults`, `src/lib/views/export-action.ts:48` | any authenticated user (`:54`, no role check — E-9 by decision) | **filter *presence* only** | `EXPORT_ROW_CAP = 50_000`, vacuous for 3 of 4 entities | **YES**, `recordExport` at `:94`, awaited, after the fetch | **YES — this is the phase** |
| **Bulk export ×4** — `exportSelectedOrganizations` / `…People` / `…Deals` / `…Activities` (`organizations/actions.ts:447`, `people/actions.ts`, `deals/actions.ts`, `activities/actions.ts`) | any authenticated user | `ids` only — signature is `(ids: string[])`, no options object, gated comment-blind | **`BULK_MAX_IDS = 100`** (`src/lib/bulk/limits.ts:32`) | **NO** | **Selectivity: NO — structurally impossible to breach SEC-03 at 100 rows. Audit: a decision, see below.** |
| **Admin full export** — `getExportData`, `src/app/admin/export/actions.ts:7` | **admin only** (`:16`, `role !== "admin"` → refused) | none, deliberately | **unbounded**, deliberately (`types.ts:55-57` names this path) | **NO** | **NO** — admin-gated, so outside SEC-03's wording ("to a non-admin") |
| **`/api/v1` export route** | — | — | — | — | **Does not exist.** Verified: no directory matching `*export*` under `src/app/api`. |
| **CSV / XLSX / Pipedrive formatters** — `exportToCSV`, `exportToJSON`, `exportToPipedriveCSV`, `toPipedriveFormat` (`formatters.ts:270,285`; `pipedrive.ts`) | — | serialisers, reached only through the four paths above | — | — | **NO** — no XLSX serialiser exists in this repo |

### SC-5, answered per path

SC-5 reads: *"the audit row still records the exports that **do** complete."* Read literally it is a
**non-regression** obligation on the view path: the row that exists today must still be written after
the change. Two facts make it more than a formality:

1. **`recordExport` has exactly one production caller** — `export-action.ts:94`
   [VERIFIED: grep across `src`]. So "still records" is one call site to preserve, and
   `view-filters.test.ts:791-812` already gates its position (after the fetch), its arguments
   (`actorUserId: session.user.id`, `rowCount: result.count`, `filters: guarded.filters`) and its
   `await`. Those gates survive the change **provided** the new refusal branch returns before
   `recordExport` — which it must, since a refused export produced no file.

2. **`audit_log` contains ZERO rows with `entity_type = 'export'`** — measured in-session against 214
   total rows. **No view export has ever been recorded on this deployment.** So the audit row is not
   merely "attributable but unbounded"; it is *unobserved*. SC-5's honest proof is a fresh positive
   observation — a successful non-admin narrow export causing `audit_log` to go 214 → 215 with
   `entity_type='export'`, `rowCount` equal to the CSV's row count, and the row hard-deleted afterwards
   with its absence asserted (the Phase 48/49 probe discipline). **An assertion that the count is
   unchanged would pass today and prove nothing.**

**The bulk paths' missing audit row: state it, do not silently absorb it.** Recommended scope
statement for the plan: *the four bulk export actions are hard-capped at 100 `ids` and cannot return
substantially the whole table, so they are outside SEC-03. They write no audit row, which is an
attributability gap and not a bounding gap; it is recorded in `BACKLOG.md` § WR-04 and is not closed
here.* That is a defensible line, and it must be written down — CONTEXT explicitly warns against
letting SC-5 read as covering both.

Also worth carrying forward unclosed (all three already in `BACKLOG.md` § WR-04): `recordExport`
swallows its own failure (`export-events.ts:106-115`), a refused or capped attempt writes no row (so
this is not a probe detector — and the new `too_broad` refusals inherit that), and there is no UI or
alert over these rows.

---

## 4. What `MAX_EXPORT_FRACTION` should be, and the measurement behind it

Everything below is measured in-session against the live database. The predicates are the fetchers'
own (`formatters.ts:361-370` for organizations, `:396-405` for people, `:494-540` for activities,
`:433-455` for deals).

### The measured selectivity distribution — every exportable single-key filter I could reach

| # | Entity | Filter | matched | total | fraction | character |
|---|---|---|---|---|---|---|
| 1 | activity | `status=pending` | 14 | 79,022 | **0.02%** | structured |
| 2 | organization | `search=tecnologia` | 154 | 46,054 | **0.33%** | structured |
| 3 | organization | `search=silva` | 343 | 46,054 | **0.74%** | structured |
| 4 | person | `search=joao` | 347 | 38,348 | **0.90%** | structured |
| 5 | person | `search=maria` | 678 | 38,348 | **1.77%** | structured |
| 6 | person | `search=santos` | 864 | 38,348 | **2.25%** | structured |
| 7 | person | `search=silva` | 1,429 | 38,348 | **3.73%** | structured |
| 8 | activity | `type=Meeting` | 2,993 | 79,022 | **3.79%** | structured |
| 9 | activity | `status=overdue` | 4,151 | 79,022 | **5.25%** | structured |
| 10 | organization | `search=comercio` | 2,889 | 46,054 | **6.27%** | structured |
| 11 | activity | `type=Email` | 6,679 | 79,022 | **8.45%** | structured |
| 12 | deal | `stage=Prospecção (Closer)` | 2,628 | 25,195 | **10.43%** | structured |
| 13 | person | `search=z` | 4,621 | 38,348 | **12.05%** | degenerate (1 char) |
| 14 | deal | `stage=Base Fria - Lead` | 3,466 | 25,195 | **13.76%** | structured |
| 15 | organization | `search=sa` | 8,058 | 46,054 | **17.50%** | structured |
| 16 | person | `search=gmail` | 7,963 | 38,348 | **20.77%** | structured |
| 17 | organization | `search=ia` | 13,336 | 46,054 | **28.96%** | degenerate (2 char) |
| 18 | **organization** | **`search=ltda`** | **13,355** | 46,054 | **29.00%** | **structured — the widest admitted** |
| 19 | organization | `search=da` | 17,825 | 46,054 | **38.70%** | degenerate (2 char) |
| 20 | **deal** | **`stage=FlyWheel (Closer)`** | **10,495** | 25,195 | **41.66%** | **structured — the narrowest refused** |
| 21 | activity | `type=Task` | 33,529 | 79,022 | **42.43%** | structured |
| 22 | activity | `type=Call` | 35,821 | 79,022 | **45.33%** | structured |
| 23 | organization | `search=u` | 23,495 | 46,054 | **51.02%** | degenerate (1 char) |
| 24 | organization | `search=s` | 38,189 | 46,054 | **82.92%** | degenerate |
| 25 | organization | `search=i` | 40,834 | 46,054 | **88.67%** | degenerate |
| 26 | organization | `search=o` / `=e` | 41,204 / 41,206 | 46,054 | **89.47%** | degenerate |
| 27 | activity | `status=completed` | 74,857 | 79,022 | **94.73%** | *structured yet degenerate* |
| 28 | **organization** | **`search=a`** | **44,254** | 46,054 | **96.09%** | **SC-1's headline** |
| 29 | person | `search=a` | 36,893 | 38,348 | **96.21%** | degenerate |
| 30 | deal / activity | `owner=ef4acac9…` | 25,195 / 79,022 | — | **100.00%** | see §0(b) |

Zero-match cases measured, which matter as anti-vacuity knowledge: `search=zzzz` and `search=xyzzy` →
0 organizations; `assignee=<any uuid>` → 0 activities and 0 deals (§0(b)).

### Recommendation: `MAX_EXPORT_FRACTION = 0.40`

Three arguments, in order of weight.

**(i) 0.40 sits inside the widest empty interval in the *structured* distribution.** Sorting only the
filters a user could plausibly call a real filter (whole words, categories, stages, statuses, types —
excluding one- and two-character substrings, which are the thing being caught), there is a **12.66 pp
gap between row 18 (`search=ltda`, 29.00%) and row 20 (`stage=FlyWheel`, 41.66%)** and no structured
filter lands in it. 0.40 is inside that gap: 11.00 pp above the widest filter it admits, 1.66 pp below
the narrowest it refuses. That is a threshold derived from the shape of the data, not from being a
round number.

**(ii) The error asymmetry says sit at the low end of any ambiguous band.** A false refusal is
recoverable in one step and the message tells the user the two numbers to act on (§6). A false
admission is irreversible — the file has already left the browser. So where the data is ambiguous, err
toward refusing.

**(iii) 0.50 is not a threshold, it is a coincidence.** It would admit rows 20-22 (FlyWheel, Task,
Call) but sits only **1.02 pp below row 23** (`search=u`, 51.02%) — the narrowest purely degenerate
filter measured. A threshold with a 1 pp margin to the nearest thing it must catch will be crossed by
the next dataset.

**What 0.40 refuses that a user might defend, named rather than glossed:** `activity type=Call`
(35,821 rows, 45.33%), `activity type=Task` (33,529, 42.43%) and `deal stage=FlyWheel` (10,495,
41.66%). This is a deliberate, recorded consequence: an export of 35,821 activities *is* what SEC-03
exists to stop, and the affected user narrows by adding a date range — for which both `dateFrom` and
`dateTo` are already exportable keys on activities and deals (`url-params.ts:182-191`), so the escape
hatch exists and is one click away. The plan must state this in the constant's doc comment.

**Alternatives, for the record:**

| Value | Refuses | Admits | Note |
|---|---|---|---|
| 0.30 | rows 19-30 | rows 1-18 | Also refuses the degenerate `search=da` (38.70%). Tighter, and 1.00 pp above `ltda` — thin margin on the *admit* side, and a false refusal of a real Brazilian company-suffix search is the most likely user-visible complaint. |
| **0.40** | rows 19-30 | rows 1-18 | **Recommended.** Same refusal set as 0.30 with an 11 pp margin on the admit side. |
| 0.50 | rows 23-30 | rows 1-22 | Admits three ~42-45% exports; 1.02 pp margin to `search=u`. Rejected. |

**Do not let the number's non-vacuity go unproven.** A gate `expect(MAX_EXPORT_FRACTION).toBe(0.40)`
proves nothing. The non-vacuity assertions are the two the data supports and that would go RED if the
threshold drifted: `floor(46_054 × MAX_EXPORT_FRACTION) < 44_254` (so SC-1's export is refused) **and**
`floor(46_054 × MAX_EXPORT_FRACTION) > 13_355` (so `search=ltda` still completes). Both are behavioural
consequences pinned to measured live numbers, in both directions.

---

## 5. A small table defeats a pure fraction rule — how to handle it

**This is the phase's most likely correctness hole, and on this deployment it is completely
unobservable.** All four live tables are ≥ 25,195 rows, so a pure fraction rule never encounters small
N here. Any proof of small-N behaviour written against the live database is therefore **vacuous by
construction** — it can only exercise the large-N branch.

### The failure modes, enumerated

| N | Pure fraction at 0.40 | Consequence |
|---|---|---|
| **0** (empty table) | `allowance = floor(0 × 0.40) = 0`; `matched = 0`; `0 > 0` is false → **ADMITTED** | Harmless in effect (nothing to export) — but see the trap below. |
| **0**, if written as a division | `matched / total` = `0/0` = **`NaN`**; `NaN > 0.40` is `false` → admitted by accident | A guard whose decision is `NaN`-driven is not a guard. |
| **10** | `allowance = 4`. Exporting 5 of 10 rows is refused. | A self-hoster with 10 organizations cannot export half of them. The feature is removed at small N — an SC-2 violation on any deployment that is not this one. |
| **2,000** | `allowance = 800`. | Same shape, milder. |

**THE TRAP, and it must be in the plan:** `vitest.db.config.ts` points the `db` project at
`pipelite_dedup_test`, provisioned `--schema-only` by `scripts/dedup-db-test-setup.sh` and therefore
**starting empty every run** (`vitest.db.config.ts:53-64`). On an empty table a pure fraction rule
**admits everything**. So any selectivity assertion placed in a `*.db.test.ts` without seeding rows
first passes vacuously — and that is the same file-topology question §7 is about. Flag it: a
selectivity gate in the db project must seed a floor first and assert the floor.

### Recommended design

```
allowance = max(MIN_EXPORT_ROWS, floor(total × MAX_EXPORT_FRACTION))
refuse iff matched > allowance
```

Two properties worth writing down as reasons rather than style:

- **Express the rule as a multiplication, never a division.** `matched > total × FRACTION` has no
  `total = 0` special case and cannot produce `NaN`. Integer form (`matched × 100 > total × PCT`)
  additionally removes float drift at the boundary, which matters because SC-4's whole content is
  behaviour *at* the boundary. Recommend the integer form and a percentage-integer constant, or an
  explicit `Math.floor` with the rounding direction asserted.
- **The floor makes the rule a no-op below a stated table size.** With `MIN_EXPORT_ROWS = F` and
  fraction `f`, the rule begins to bind only above `F / f` rows. At `F = 1000, f = 0.40` that is
  **2,500 rows** — below which any export is allowed.

### What value for `MIN_EXPORT_ROWS`? `[ASSUMED]` — this one needs the user

The live data cannot answer it: the smallest live table is 25,195 rows and the smallest *exportable
set* measured is 14 (`status=pending`), which the fraction rule admits anyway. So there is no
measurement to lean on, and the honest move is to say so rather than manufacture one.

- **Recommended: `MIN_EXPORT_ROWS = 1000`**, i.e. the rule binds above 2,500 rows. Rationale offered as
  a policy statement, not a measurement: below a few thousand rows "the whole table" is not the
  customer database, and a self-hoster with 800 organizations must be able to export 400 of them.
- **Conservative alternative: 500** (binds above 1,250 rows).
- Whichever is chosen, the constant's doc comment must say *"chosen as a policy floor, not measured —
  the live deployment's smallest table is 25,195 rows so this branch is unreachable here"*. That is the
  opposite of `BATCH_SIZE = 200`'s comment: it names the absence of a measurement as the fact.

**How the floor is proven, since live data cannot:** unit tests on the **pure** `decideSelectivity`
with injected `(matched, total)` — which is the decisive argument for Option B in §1. Cells that must
be present, each red if the floor is deleted:

| matched | total | Expected | Red if… |
|---|---|---|---|
| 5 | 10 | admitted | the floor is removed (pure fraction → `5 > 4` → refused) |
| 999 | 2,000 | admitted | the floor is removed (`999 > 800` → refused) |
| 1,001 | 2,000 | **refused** | the floor is raised past 1,001 — this is the cell that stops the floor from swallowing the rule |
| 0 | 0 | admitted, **no `NaN` anywhere** | the rule is written as a division |
| 44,254 | 46,054 | **refused** | SC-1's defect returns |
| 13,355 | 46,054 | admitted | the threshold drifts down past 29.00% |

---

## 6. The SC-3 message path

### How a refusal reaches a string today

```
exportViewResults          (export-action.ts:43-46)   ViewExportResult discriminated union
  → { success: false, error: "refused" | "too_many" | "failed" | "unauthenticated" }
    → saved-views-bar.tsx runExport()  (:260-289)
       "too_many"  → toast.error(t("export.tooMany", { max: result.max }))     (:266)
       "refused"   → toast.error(t("export.refused"))                          (:271)
       everything else, incl. "unauthenticated" → tBulk("error.exportFailed")   (:277)
```

The union already carries a per-code payload (`too_many` carries `max`), so **carrying `matched` and
`total` on a new code is the existing pattern, not a new one**:

```ts
| { success: false; error: "too_broad"; matched: number; total: number }
```

SC-3's "distinguishable from a broken one" is satisfied structurally: the generic breakage is
`bulk.error.exportFailed` and a new `views.export.tooBroad` is a different key with different copy.

### Note: `disabledReason` has ALREADY been reworded — do not regress it a second time

CONTEXT quotes the pre-G-2 text. The shipped string today
(`src/messages/en-US.json:717`) is:

> `"disabledReason": "Add a filter that narrows the results before exporting."`

with pt-BR `:717` "Adicione um filtro que restrinja os resultados antes de exportar." and es-ES `:717`
"Añade un filtro que acote los resultados antes de exportar." The G-2 reword landed. This phase should
leave `disabledReason` alone (it is the client-side *pre-submit* affordance, computed from `canExport`,
which cannot know `matched`) and add a new key for the *post-submit* refusal.

### Which `REQUIRED_*_KEYS` array — and the four other edits that must land in the same commit

The array is **`REQUIRED_VIEWS_KEYS`, `src/messages/locale-parity.test.ts:618`**. The three existing
export keys are at `:701-703` (`views.export.disabledReason`, `.tooMany`, `.refused`). Adding a fourth
requires **all** of the following in one commit, or the suite goes red:

| # | File / line | Edit |
|---|---|---|
| 1 | `src/messages/locale-parity.test.ts:701-703` | add `"views.export.tooBroad"` to `REQUIRED_VIEWS_KEYS` |
| 2 | `src/messages/locale-parity.test.ts:1239` | `expect(REQUIRED_VIEWS_KEYS).toHaveLength(61)` → **62** |
| 3 | `src/messages/locale-parity.test.ts:1240` | `expect(new Set(REQUIRED_VIEWS_KEYS).size, …).toBe(61)` → **62** |
| 4 | `src/messages/locale-parity.test.ts` — the per-group comment above `:618` | the tally "18+22+13+5+3" must be updated; `:1237-1239` exists precisely to stop that sum drifting silently |
| 5 | `src/messages/{en-US,pt-BR,es-ES}.json`, the `views.export` object at `:716-720` in each | add the string in **all three** locales |
| 6 | `src/components/views/__tests__/saved-views-bar-wiring.test.ts:173` | add `"export.tooBroad"` to `EXPORT_KEYS` — the loop at `:808-816` asserts every listed key is actually referenced as `t("<key>"` in the component |

The `views` contract at `:1326-1329` is a **total `toEqual`** over the sorted shipped `views.*` key set
versus `REQUIRED_VIEWS_KEYS`, so a string added to the JSON without the array entry fails there, and an
array entry without the JSON fails the `missingIn` check at `:1172`. Both directions are covered
already — good news: this contract cannot be half-satisfied.

Two further constraints on the copy itself:

- **`placeholderDrift`** (`:1515`) requires the ICU placeholders to be identical across all three
  locales. So `{matched}` and `{total}` must appear in en-US, pt-BR and es-ES. `:1514` records that
  `views.export.tooMany` takes `{max}` — the same shape.
- **`untranslatedInBoth`** (`:1397`) fails a key whose pt-BR and es-ES values are byte-identical to
  en-US. The three strings must be genuinely translated, not copied.

**Suggested en-US copy** (actionable in the SC-3 sense — it names the two numbers and the remedy):

> `"tooBroad": "This filter matches {matched} of {total} records — too many to export. Narrow it and try again."`

`{matched}`/`{total}` come from the server, not from the client, and — following the `filename`
precedent at `export-action.ts:40-41` — the two numbers must be the ones the count actually produced,
never re-derived client-side.

### `bulk.error.tooMany` must NOT be reused

`saved-views-bar-wiring.test.ts:832-836` asserts `occurrences(source, 'tBulk("error.tooMany"')` is
**0**, because that copy names a *selection of ids*. `REQUIRED_BULK_KEYS` must not move
(`:818-825`, and `locale-parity.test.ts:1255-1256` pins its length). The new key belongs in `views`.

---

## 7. How CI can run the never-run live tests

### First: the count is 28, not 24

Measured in-session with `rtk proxy ./node_modules/.bin/vitest run <file>`:

| File | Skipped tests | Skip mechanism |
|---|---|---|
| `src/lib/export/formatters-live.test.ts` | **24** | `describe.skipIf(!HAS_DB)` at **`:44`**, where `HAS_DB = !!process.env.DATABASE_URL` at **`:32`** |
| `src/lib/audit/export-events-live.test.ts` | **4** | `describe.skipIf(!HAS_DB)` at **`:33`** |
| **total** | **28** | |

Plus 4 `it.skip('… (requires DB)')` stubs at `src/app/settings/notifications/actions.test.ts:158` and
`src/app/admin/users/actions.test.ts:64-66`. **28 + 4 = 32**, which accounts for the suite's entire
skipped count exactly. [VERIFIED: vitest run, in-session]

**Recommendation: absorb both files, not just the 24.** `export-events-live.test.ts` is the *only*
behavioural proof that `recordExport` writes a row to real Postgres — which is precisely SC-5's
subject, and §3 established that `audit_log` has never contained an `export` row on this deployment. A
phase that proves the bound while leaving SC-5's only real proof unrun would be closing the wrong half.

### Second: CI already has a PostgreSQL service. The "infrastructure decision" is already taken.

`.github/workflows/ci.yml:61-78` declares a `postgres:16-alpine` service on the **required `ci` check**,
with a health check, published on `5432`, added in Phase 46 for `db:check-migrations` (`:123-160`, env
`DATABASE_URL: postgresql://postgres:postgres@localhost:5432/postgres`). Phase 40 called giving CI a
database "an infrastructure decision"; that decision landed two phases ago. What remains is much
smaller: *which vitest project runs these files, and where their rows come from.*

### The gates that constrain every route — read them before choosing

`src/lib/mutations/__tests__/db-test-isolation.test.ts` runs in the **base** project (so in CI) and
asserts, over parsed YAML and parsed config arrays:

| Assertion | Line | Consequence |
|---|---|---|
| `ci.yml` contains **zero** raw occurrences of `test:db` and of `db.config` — comments included | `:441-444` | no CI step, and no *comment*, may name the db project or its config |
| every parsed `ci` step's `run` contains neither `test:db` nor `vitest.db.config` | `:528-535` | same, structurally |
| job `ci` declares **exactly one** service, on the image `docker-compose.yml` pins | `:469-490` | you may **reuse** the existing Postgres; you may not add a second service |
| `MIN_CI_STEPS = 8`, floor one below the measured 9 | `:106`, `:522-526` | **adding** a step is free; removing one is loud |
| no npm script other than `test:db` may contain `test:db` or `db.config` | `:422-432` | a new script must not name `vitest.db.config.ts` |
| `scripts.test` contains neither | `:405-407` | `npm test` may not reach it |
| the **db** project's `include` has **length exactly 1** and every pattern contains `db.test` | `:641-647` | you may **not** add a second include glob to `vitest.db.config.ts` |
| the base project's `exclude` still carries a `db.test` and an `rsc.test` entry and spreads `configDefaults.exclude` | `:613-623` | additive edits fine |

And `src/lib/__tests__/suite-hook-hygiene.test.ts` carries a carve-out naming **both files by exact
path**:

```ts
const SKIPPED_LIVE_FILES = [                          // :379-382
  "src/lib/audit/export-events-live.test.ts",
  "src/lib/export/formatters-live.test.ts",
] as const
```

and asserts, per file, that it **still performs a dynamic `import()`** (`:1488-1495`) and **still
contains `describe.skipIf(`** (`:1497-1506`). So:

- **renaming either file** reddens both of its cells until `SKIPPED_LIVE_FILES` is updated in the same
  commit;
- **removing the `skipIf` gate** reddens `:1505` — and the correct repair is the one the failure
  message itself gives: *delete the carve-out entry and hoist the imports*, not re-anchor it. Note the
  circularity that forced the dynamic imports in the first place: `src/db/index.ts` throws
  `"DATABASE_URL environment variable is not set"` at module load, so `@/db` cannot be statically
  imported by a file the base project collects. In a project where `DATABASE_URL` is always set, it
  can be — which is another argument for moving the files out of the base project rather than
  un-skipping them inside it.

### The four routes

| Route | What it is | Cost | Verdict |
|---|---|---|---|
| **A. Rename to `*.db.test.ts`** — they join the existing `db` project | 2 renames + update `SKIPPED_LIVE_FILES` | **Small.** No isolation gate breaks; `include` already matches. | **Runs in `npm run test:db`, which IS part of the standing phase gate (`299 passed / 13 files / EXIT 0`), but NOT in GitHub CI** — `db-test-isolation.test.ts` forbids that by design. **And**: `vitest.db.config.ts:64,89-95` points `DATABASE_URL` at `pipelite_dedup_test`, provisioned `--schema-only` and therefore **EMPTY**. Nearly every assertion in `formatters-live.test.ts` breaks or goes vacuous on an empty database — `:117` (`liveIds.length > 0`) goes RED, `:202-210` (`maxRows: 100` → `too_many`) needs >100 rows, `:262-313` needs the 79,022-activity status partition, `:245-250` needs `search:"a"` strictly between 0 and the baseline. **Route A therefore requires rewriting the file to seed its own fixtures**, which changes what it proves. |
| **B. A 4th project: `vitest.live.config.ts` + `test:live` script + one new CI step reusing the existing Postgres** | new config with `include: ['src/**/*-live.test.?(c\|m)[jt]s?(x)']`, new script, one `ci.yml` step, plus a `*-live.test.*` entry in the base project's `exclude` | Larger, but every isolation gate is satisfiable: the new config's name contains neither `db.config` nor `test:db`; one service is reused; `MIN_CI_STEPS` only floors from below. | **RECOMMENDED for "runnable in CI" as CONTEXT words it.** Requires the CI database to be **migrated and seeded** — the runner's Postgres holds only what `db:check-migrations` builds and drops. Volumes needed are modest (>100 organizations for the cap assertion; ≥1 activity in each of the three status buckets; a `search` term matching strictly between 0 and the total), so a few hundred seeded rows suffice. Consequence to state plainly: the file stops being a *live-deployment* probe and becomes a *real-Postgres* probe. That is a **gain** in reproducibility, and its assertions must be rewritten from `baseline.organizations` to fixture-relative expectations. |
| **C. Add a `test:db` step to CI** | — | — | **Blocked, and not only by the gate.** `test:db` runs `scripts/dedup-db-test-setup.sh`, which `pg_dump --schema-only` from `SOURCE_DB="pipelite"` — the operator's development database, which does not exist on a GitHub runner. Rewriting that provisioning is a bigger change than Route B, and it would require deliberately rewriting `db-test-isolation.test.ts`'s stated invariant. |
| **D. Keep them live-only, add a local script, put them in the phase gate** | one script | Smallest | **Does not satisfy CONTEXT's "runnable in CI."** Worth naming as the fallback if Route B's seeding proves larger than the phase can carry — and if taken, say so as a limitation rather than reporting the tests as "now running." |

**Recommended: B, with A as the fallback and the choice recorded.** If B is taken, Route B also
naturally hosts the SC-4 boundary walk (§8) and — critically — a seeded project can exercise the §5
floor branch that the live database cannot reach.

**One thing Route B must not do:** reuse the existing CI Postgres *database* name without care. That
service is also `db:check-migrations`'s target, and that script creates and drops a scratch database.
`db-test-isolation.test.ts:698-773` scans both operational scripts for destructive verbs aimed at a
database they may only read; a third script doing DDL on the same cluster belongs under that same scan,
and RESEARCH-time note: **that scan's subject list is `DESTRUCTIVE_SCAN_SUBJECTS` at `:306-323` and a
new script must be added to it** (Phase 46 set that precedent for `migrate-from-zero.mjs`).

---

## 8. SC-4's boundary walk — the seam exists, and it is free

SC-4 needs a filter widened **step by step** until the guard trips, with the refusal observed at the
boundary. A single at-the-boundary assertion is explicitly not enough.

### The seam: `activities.dateTo`, against the fixed live database

`dateFrom` and `dateTo` are both in `EXPORTABLE_FILTER_KEYS.activity` (`url-params.ts:183-191`), so
`dateTo` alone authorizes an activities export. `fetchActivities:549-551` applies
`lt(activities.dueDate, endOfDayExclusive(dateTo))`, and `endOfDayExclusive`
(`src/lib/filters/date-range.ts:66-75`) adds one UTC day — so `dateTo=YYYY-MM-DD` selects every
activity whose `due_date` falls on or before that date.

Three properties make this the right knob, all measured:

1. **All 79,022 live activities have a non-null `due_date`** (0 nulls), spanning **2022-01-13 to
   2030-05-07**. So the knob sweeps 0% → ~100% of the table.
2. **It is strictly nested.** Each later `dateTo` is a superset of every earlier one — a genuine
   *widening*, not merely an increasing sequence.
3. **Daily granularity gives ~0.1-0.2 pp steps** near any candidate threshold, so the boundary can be
   *approached* and then crossed, which is what SC-4 asks for.

Measured crossing brackets, one row per candidate fraction (79,022 total):

| fraction | allowance | last `dateTo` ADMITTED | matched | first `dateTo` REFUSED | matched |
|---|---|---|---|---|---|
| 0.10 | 7,902 | 2022-08-01 | 7,805 | 2022-08-02 | 7,981 |
| 0.15 | 11,853 | 2022-09-15 | 11,853 | 2022-09-16 | 12,004 |
| 0.20 | 15,804 | 2022-10-16 | 15,753 | 2022-10-17 | 15,901 |
| 0.25 | 19,756 | 2022-12-10 | 19,687 | 2022-12-12 | 19,775 |
| 0.30 | 23,707 | 2023-02-09 | 23,683 | 2023-02-10 | 23,789 |
| 1/3 | 26,338 | 2023-03-10 | 26,200 | 2023-03-13 | 26,361 |
| **0.40** | **31,609** | **2023-06-09** | **31,530** | **2023-06-12** | **31,612** |
| 0.50 | 39,511 | 2024-06-10 | 39,427 | 2024-06-11 | 39,519 |

At the recommended 0.40 the walk is: last admitted **31,530 (39.90%)**, first refused **31,612
(40.00%)** — a **0.10 pp bracket**, and the approach can be made as fine as the calendar allows.

A fine approach ladder for 0.40, every number measured (`due_date::date ≤ d`):

`2023-01-18` 22,111 (27.98%) → `2023-02-09` 23,683 (29.97%) → `2023-03-10` 26,200 (33.16%) →
`2023-04-…` → `2023-06-09` **31,530 (39.90%) — last ADMITTED** → `2023-06-12` **31,612 (40.00%) —
first REFUSED**.

### Recommendation: live-data walk for SC-4, unit walk for the floor, e2e for SC-3

| Criterion | Cheapest honest proof |
|---|---|
| **SC-4** (boundary walk) | Drive `countExportMatches("activity", { dateTo })` **and** the decision function over the ladder above, against real Postgres. Deterministic (the live data is fixed), free (no seeding), and the numbers are independently pre-measured in this document so a wrong answer is *visible*, not merely different. Assert the decision **flips exactly once** across the ladder and that the flip lands on the measured bracket. |
| **SC-4's floor / small N** | Unit cells on the pure `decideSelectivity` (§5 table). The live database cannot reach this branch at all. |
| **SC-1** | Live: `organization` + `search=a` → refused, with `matched === 44254` and `total === 46054` in the refusal payload. |
| **SC-2** | Live: `organization` + `search=ltda` → **succeeds**, 13,355 rows, for a **non-admin**; and the same `search=a` **succeeds for an admin**. Do NOT use `owner` or `assignee` (§0(b)). |
| **SC-3** | e2e through the UI with the existing non-admin fixture (`e2e/seed-member.ts`, user `pipelite-e2e-member@local.test`, role `member`, `approved`) — the toast text is the only thing that proves a real user sees actionable copy. |
| **SC-5** | Live: `audit_log` **214 → 215** with `entity_type='export'` after an admitted export; row hard-deleted afterwards and its absence asserted by count. |

If Route B (§7) is taken, the SC-4 walk should be re-expressed against the seeded CI dataset **as
well** — but keep the live walk as the authoritative one, since SC-1 mandates live-scale measurement
and the seeded set will not reach 79,022 rows.

---

## Ablations — what must go RED if the defect returns

The milestone's standing rule: a check that cannot fail is worse than no check, and a gate with no
recorded red observation is treated as NOT DELIVERED. For each criterion, the assertion that must
redden:

| # | Sabotage | Must go RED | Would it stay green today? (the trap) |
|---|---|---|---|
| A1 | Delete the `enforceExportSelectivity` call from `export-action.ts` entirely | the SC-1 live cell (`search=a` → refused) **and** the SC-4 walk (no flip anywhere) | **Yes — and this is the danger.** `view-filters.test.ts:736-747`'s "no `admin`/`role` token" gate stays green; so does every existing structural gate. Without a behavioural SC-1 cell, removing the whole fix reddens **nothing**. |
| A2 | Set `MAX_EXPORT_FRACTION = 0.99` | `floor(46_054 × f) < 44_254` | a bare `toBe(0.40)` gate would catch this but proves nothing about behaviour — pair it with the two directional live consequences in §4 |
| A3 | Set `MAX_EXPORT_FRACTION = 0.01` | SC-2's `search=ltda` cell (13,355 admitted) | a refusal-only test suite stays green while the feature is gone — this is the SC-2-shaped failure |
| A4 | Delete `MIN_EXPORT_ROWS` (pure fraction) | the `(5, 10)` and `(999, 2000)` unit cells | **every live cell stays green** — the live tables are all ≥ 25,195 rows |
| A5 | Raise `MIN_EXPORT_ROWS` above the largest table | every refusal cell | trivially caught; listed for completeness |
| A6 | Make `countExportMatches` build its own conditions, then drop one predicate from it | the `count === fetch.count` equality cell (§2) | a suite that only asserts the *decision* cannot see a count computed from a different predicate — this is the "gate that can be bypassed" the objective names |
| A7 | Remove the admin exemption | the "same `search=a` succeeds for an admin" cell | a non-admin-only test suite stays green while SC-2's admin half is gone |
| A8 | Delete the `await recordExport(...)` call | `view-filters.test.ts:791-812` (structural) **and** the fresh `audit_log` 214 → 215 observation | the structural gate alone cannot see a `recordExport` that runs and silently fails — it swallows (`export-events.ts:106-115`) |
| A9 | Return `matched`/`total` as `0`/`0` in the refusal payload | the SC-1 cell asserting the two exact numbers | a toast-text-only assertion passes on `0 of 0` |

### Proofs that would pass vacuously — flagged, do not write these

- **Any selectivity assertion in the `db` project without seeding first.** `pipelite_dedup_test` starts
  empty; `matched = 0` and `total = 0` admit everything. (§5)
- **Any SC-2 proof using `assignee`.** 0 matching rows on both deals and activities — an empty-set pass.
  (§0(b))
- **Any SC-2 proof using `owner`.** 100% on deals and activities, 100% on organizations and people —
  it is not a narrowing filter on this data. (§0(b))
- **`expect(EXPORT_ROW_CAP).toBeGreaterThan(46_054)`** (`view-filters.test.ts:772`) — an assertion *that
  the cap is vacuous for organizations*. If this phase touches the cap, re-anchor it rather than
  relaxing it.
- **A raw-token grep for the new constant name.** The project has been burned fifteen times by "the
  comment explaining a rule trips that rule's own grep gate." Use `readStrippedSource`
  (`@/components/custom-fields/__tests__/source-scan`) and parsed structure, as
  `view-filters.test.ts:713` and `db-test-isolation.test.ts:117-139` do.
- **`expect(audit_log.count).toBe(unchanged)`** as an SC-5 proof — passes today with zero export rows.

---

## The one place the design collides with a shipped gate

`src/lib/export/__tests__/view-filters.test.ts:736-747`, over **comment-stripped** source of
`src/lib/views/export-action.ts`:

```ts
expect(/["']admin["']/.test(actionSource)).toBe(false)
expect(/\brole\b/.test(actionSource)).toBe(false)
```

The locked decision requires admins to be unaffected. Three ways forward, and the plan must pick one
**explicitly**:

1. **Write the admin branch in `export-action.ts` and rewrite this gate.** Honest. The gate's stated
   invariant (E-9: "export is available to every authenticated user, not admin-gated") is *still true
   after the change* — a non-admin's export is **bounded**, not refused — so the gate should be
   re-anchored onto that sharper invariant: assert behaviourally that a non-admin with a narrow filter
   gets `success: true`, and structurally that the action contains no *unconditional* role refusal.
   The re-anchoring must be argued in the plan, not performed silently, and the new gate must be
   falsified (make a non-admin refusal unconditional and watch it redden).

2. **Put the admin branch inside `export-selectivity.ts`** and pass `viewer` through, so the tokens
   never appear in `export-action.ts`. The gate stays green **without measuring anything** — the E-9
   un-widening it guards against could now happen one module away and it would not notice. **This is
   gate-laundering: passing by relocation.** If chosen for other reasons, the gate must be *extended*
   to the new module in the same commit, or it should be deleted rather than left as decoration.

3. Neither — do not exempt admins. **Forbidden by CONTEXT** ("Admins are unaffected, which is what
   makes SC-2 provable at all").

**Recommendation: option 1, with option 2's module boundary for the *counting* logic.** Put the
`isAdmin` decision in `export-action.ts` where the session already is (`:52`), keep the arithmetic in
the pure function, and rewrite `view-filters.test.ts:736-747` deliberately, with its new red observed.

Two neighbouring gates to check while there:

- `view-filters.test.ts:749-764` asserts `calls[0]).toContain("maxRows: EXPORT_ROW_CAP")` at the single
  `fetchFilteredData` call site. **The recommended design keeps `maxRows: EXPORT_ROW_CAP` unchanged**
  (the selectivity check is a separate, earlier control), so this stays green. A design that instead
  threads a computed allowance as `maxRows` reddens it — and would also lose the exact `matched` needed
  for SC-3.
- `view-filters.test.ts:722-734` asserts `authAt < fetchAt` and `guardAt < fetchAt`. The new check goes
  **between** the guard and the fetch, so this stays green; consider extending it to
  `guardAt < selectivityAt < fetchAt`, which is a real ordering invariant (the cheap sync refusal must
  precede the count, or a `{}` request buys two queries).

---

## Runtime State Inventory

Not a rename/refactor/migration phase, but three categories are load-bearing and are answered
explicitly rather than left blank:

| Category | Items found | Action required |
|---|---|---|
| Stored data | `audit_log`: 214 rows, **0** with `entity_type='export'`. `custom_field_definitions`: 169, 0 of `type='formula'` (Phase 49 left it clean). No stored value encodes an export threshold. | none — but any probe row written must be hard-deleted and its absence asserted by count (Phase 48/49 discipline) |
| Live service config | none — no export threshold lives in any external service, UI-managed config, or non-git store. Verified: the only tunables are source constants. | none |
| OS-registered state | none. | none |
| Secrets / env vars | `DATABASE_URL` (container: `postgres:5432`) and `E2E_DATABASE_URL` (`localhost:5433/pipelite`, `.env:24`). `vitest.db.config.ts:89-95` derives the isolated URL by swapping only the path to `pipelite_dedup_test`. Route B (§7) would introduce one new CI-scoped `DATABASE_URL` value. | if Route B: name the new env var in the workflow step only, never a default |
| Build artifacts | none relevant. **But**: the container image must be rebuilt (`docker compose up -d --build`) and its **sha256 compared** before any HTTP-level claim — `restart` runs the old image. Current bound image per STATE: `sha256:66efd8556ac1…`. | rebuild + compare ids if the phase makes an HTTP claim |

---

## Common Pitfalls

### Pitfall 1: the count computed from a different predicate than the export

**What goes wrong:** `matched` is counted with a hand-copied condition list; one side is later edited;
the gate authorizes on a number the export does not honour.
**Why it happens:** the four condition arrays are private locals inside `formatters.ts`.
**How to avoid:** extract `buildExportConditions` and use it in both places (§2). Precedent:
`api/v1/organizations/route.ts:35-42`, one `whereClause`, two consumers.
**Warning sign:** the word `conditions` appearing in two files.

### Pitfall 2: the empty-table admit-everything hole

**What goes wrong:** `total = 0` → allowance 0 → `0 > 0` false → admitted; or `matched/total = NaN`.
**How to avoid:** express the rule as a multiplication with an integer floor; add the `(0, 0)` unit
cell.
**Warning sign:** any `/` in the decision function.

### Pitfall 3: proving the rule against the empty isolated database

**What goes wrong:** a `*.db.test.ts` selectivity assertion runs against `pipelite_dedup_test` (empty)
and passes for the wrong reason. §5.
**How to avoid:** seed a floor first and assert the floor before asserting the rule.

### Pitfall 4: a boundary "walk" that is one assertion

**What goes wrong:** a single at-the-boundary cell is written and reported as SC-4.
**How to avoid:** the ladder in §8, with the flip asserted to occur **exactly once**, and the approach
steps recorded in the transcript.

### Pitfall 5: the locale contract's exact `toEqual` plus two hard counts

**What goes wrong:** the JSON string lands and `REQUIRED_VIEWS_KEYS`' `toHaveLength(61)` at
`locale-parity.test.ts:1239` reddens, or vice versa.
**How to avoid:** all six edits in §6 in one commit.

### Pitfall 6: renaming a live test file without updating its carve-out

**What goes wrong:** `suite-hook-hygiene.test.ts:379-382` names both files by exact path and asserts
each still contains `describe.skipIf(` and a dynamic `import()`. A rename reddens two cells per file.
**How to avoid:** move `SKIPPED_LIVE_FILES` in the same commit — or, if the file leaves the base
project, **delete** the entry and hoist the imports, which is what the failure message instructs.

### Pitfall 7: rtk-mangled measurements

**What goes wrong:** a count from `grep | wc -l` is wrong (36 measured as 19); `git status --porcelain`
renders as `ok`; redirecting filtered output writes an ELIDED placeholder at exit 0.
**How to avoid:** `rtk proxy <cmd>`, Read/Grep tools, `node` for counting; gate the tree on
`git diff --exit-code`. Confirmed in-session: `rtk proxy ./node_modules/.bin/vitest run <file>` reports
faithfully; `--reporter=basic` errors with `ERR_LOAD_URL` on vitest 4.1.11.

---

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework | vitest **4.1.11** (`package.json:87`) |
| Configs | `vitest.config.ts` (base), `vitest.rsc.config.ts` (rsc), `vitest.db.config.ts` (db, opt-in) |
| Quick run command | `rtk proxy ./node_modules/.bin/vitest run <file>` |
| Full suite command | `npm test` (base + rsc), plus `npm run test:db` |
| Baseline (from the task env block) | `npm test` **5696 passed / 32 skipped over 185 files**; RSC **8/8**; `tsc --noEmit` 0; eslint **0 errors** / 117 warnings; `npm run test:db` **299 passed over 13 files, EXIT 0** |

**Baseline discrepancy to resolve at plan time:** `.planning/STATE.md:30` says **5659 / 184** and
`db 288 / 13`; the task's environment block says **5696 / 185** and `db 299 / 13`. This milestone has
already paid three times for an inherited stale count (STATE.md's own note at `:32-34`). **Re-measure;
inherit nothing.**

### Phase Requirements → Test Map

| Req / SC | Behavior | Test type | Automated command | File exists? |
|---|---|---|---|---|
| SEC-03 / SC-1 | `organization` + `search=a` refused for a non-admin, payload carries 44,254 / 46,054 | live-db behavioural | `<live project> src/lib/export/*-live.test.ts` (or `*.db.test.ts`) | ❌ Wave 0 — new cells; and the host file's project is the §7 decision |
| SC-2 | `search=ltda` (13,355) succeeds for the same non-admin; `search=a` succeeds for an admin | live-db behavioural | same | ❌ Wave 0 |
| SC-3 | the refusal toast names `{matched}` / `{total}` and is distinct from `bulk.error.exportFailed` | unit (locale contract) + e2e | `npm test -- src/messages/locale-parity.test.ts`; `npm run test:e2e` | ✅ `locale-parity.test.ts` exists (edit); ❌ e2e cell is new. Non-admin fixture exists: `e2e/seed-member.ts` |
| SC-4 | the decision flips exactly once across the §8 `dateTo` ladder, at the measured bracket | live-db behavioural | same live project | ❌ Wave 0 |
| SC-4 (floor) | the §5 unit cell table, incl. `(0,0)` and `(5,10)` | unit, pure function | `rtk proxy ./node_modules/.bin/vitest run src/lib/export/__tests__/export-selectivity.test.ts` | ❌ Wave 0 |
| SC-5 | `audit_log` 214 → 215 with `entity_type='export'` after an admitted export | live-db behavioural + manual psql | `docker compose exec -T postgres psql …` | ❌ Wave 0. Structural half exists: `view-filters.test.ts:791-812` |
| absorb 28 | both live files run in a project that has a database | project topology | `npm run test:live` (Route B) or `npm run test:db` (Route A) | ❌ Wave 0 |
| non-regression | the six `fetchFilteredData` call sites are exactly six, each classified | unit, repo-wide source scan | `npm test -- src/lib/export/__tests__/` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `rtk proxy ./node_modules/.bin/vitest run <touched test files>` + `npm run typecheck`
- **Per wave merge:** `npm test` (base + rsc) + `npm run lint` (**errors only**) + `npm run test:db`
- **Phase gate:** full suite green, `tsc --noEmit` 0, eslint 0 errors, `test:db` counts **and** EXIT 0
  (DEF-48-01 is closed — commit `37202ce` — so the exit code is usable; note the Phase 49 plans' stale
  constraint text says otherwise), `db:check-migrations` 0, `security:audit` 0, tree clean by
  `git diff --exit-code`, and **the live SC-1 number re-measured**.

### Wave 0 Gaps

- [ ] `src/lib/export/export-selectivity.ts` — the module (pure `decideSelectivity` + async
      `countExportMatches`)
- [ ] `src/lib/export/__tests__/export-selectivity.test.ts` — the §5 unit cells, incl. `(0,0)`
- [ ] the exported `buildExportConditions` in `formatters.ts` + a structural gate that all four
      fetchers use it
- [ ] the §7 project decision, and if Route B: `vitest.live.config.ts`, a `test:live` script, one
      `ci.yml` step, a base-project `exclude` entry, a seeder, and `SKIPPED_LIVE_FILES` updated
- [ ] SC-4's ladder cells against real Postgres
- [ ] the repo-wide `fetchFilteredData` call-site enumeration gate
- [ ] the deliberate rewrite of `view-filters.test.ts:736-747`, with its new red recorded
- [ ] the six locale-contract edits in §6
- [ ] `MIN_EXPORT_ROWS` value confirmed by the user (§5, `[ASSUMED]`)

---

## Security Domain

`security_enforcement` is not set to `false`, so this section is required.

### Applicable ASVS categories

| ASVS category | Applies | Standard control here |
|---|---|---|
| V2 Authentication | yes | `await auth()` at `export-action.ts:52`; `unauthenticated` refusal at `:54-56`. Unchanged by this phase. |
| V3 Session Management | no | Auth.js JWT strategy, out of scope. |
| **V4 Access Control** | **yes — this is the phase** | The project's admin idiom is `row.ownerId === viewer.id \|\| viewer.role === "admin"` (`src/lib/views/write-guards.ts:235`, `src/lib/notes/authorize.ts:53`); `write-guards.ts:242` documents a deliberate departure for view visibility and `src/lib/bulk/dispatch.ts:24` documents the asymmetry across bulk actions. **Read those before choosing a spelling; do not invent a fourth.** Note this phase needs only the `viewer.role === "admin"` half — there is no per-row ownership question in an export that reads every owner's rows. |
| **V5 Input Validation** | yes | Already strong and must not be weakened: `pickFilterParams` (`url-params.ts:350-363`) walks the **whitelist**, not the source, so `ids`, `page`, `__proto__`, `constructor` are ordinary non-members; `narrowFilterValue:272-280` drops non-strings, blanks and values over `MAX_FILTER_VALUE_LENGTH = 256`. Every filter value crosses into SQL as a **bound parameter**, including the two raw `sql` fragments (`formatters.ts:446,453`). The new count must use the same bound-parameter path — never string interpolation into a `sql.raw`. |
| V6 Cryptography | no | none introduced. |
| V7 Error Handling / Logging | yes | SC-5's audit row. `recordExport` swallows its own failure by decision (`export-events.ts:106-115`); refusals write no row (`:77`), so the new `too_broad` code is also not a probe detector — record that, do not fix it here. |

### Known threat patterns for this stack

| Pattern | STRIDE | Standard mitigation | Status here |
|---|---|---|---|
| Mass data exfiltration through an under-narrow filter | **Information disclosure** | cardinality/selectivity bound before the read | **the phase.** Live today at 96.09% (orgs `search=a`) and **100.00%** (deals `owner=…`, §0(b)) |
| Server action treated as a trusted-caller function | Elevation of privilege | re-derive every caller-supplied value server-side; literal-only non-filter fields | mitigated: `guardExportInput` re-derives the map (`view-export-guard.ts:105-111`); `format` and `includeCustomFields` are literals (`export-action.ts:70-71`) and gated (`view-filters.test.ts:755-760`) |
| SQL injection via filter values | Tampering | bound parameters; no raw interpolation | mitigated (T-38-15 / T-40-32) — **preserve in the new count** |
| CSV formula injection | Tampering | `neutraliseCsvInjection` prefixes at-risk cells inside `exportToCSV` (`formatters.ts:251`) | already fixed 2026-08-22; **not covered**: `exportToPipedriveCSV` (`pipedrive.ts`), deliberately |
| Existence / count oracle via a refusal | Information disclosure | — | **NEW, introduced by this phase.** The refusal returns `matched` and `total` — i.e. it *answers a count query* for any authenticated user. It reveals no row contents, and the same numbers are already obtainable from `/api/v1/organizations` `meta.total` (`api/v1/organizations/route.ts:35-38`) and from the list surfaces, so it discloses nothing new. **Record the reasoning rather than leaving it unexamined** — CONTEXT locked "the refusal must carry the numbers", and the trade is real even though it resolves in favour of the numbers. |
| Vacuous guard | — | break it on purpose and watch it go red | the standing rule; §"Ablations" |

---

## Open Questions

1. **`MIN_EXPORT_ROWS`'s value.**
   - Known: a floor is structurally necessary (§5); the live database cannot measure it (smallest table
     25,195 rows); the value determines the table size below which the rule is a no-op (`F / f`).
   - Unclear: what the user considers "too small for the whole table to matter."
   - Recommendation: propose **1000** (binds above 2,500 rows), offer 500 as the conservative
     alternative, and ask for confirmation before locking it. Tag it `[ASSUMED]` in the plan until then.

2. **`MAX_EXPORT_FRACTION` = 0.40 refuses three filters a user might defend** (`activity type=Call`
   45.33%, `type=Task` 42.43%, `deal stage=FlyWheel` 41.66%).
   - Known: the full measured distribution (§4); no clean separation exists between the widest
     plausibly-legitimate filter and the narrowest degenerate one — the gap is 45.33% → 51.02%.
   - Recommendation: ship 0.40 with the three refusals named as a deliberate consequence and the
     `dateFrom`/`dateTo` escape hatch documented. Surface the trade-off to the user; do not present
     0.40 as measurement-determined when it is measurement-*narrowed*.

3. **Route A vs Route B for the 28 tests (§7).**
   - Known: CI already has Postgres; the isolation gates permit Route B and forbid Route C; the
     isolated db is empty so Route A requires rewriting the file's assertions.
   - Unclear: whether "runnable in CI" means GitHub CI (Route B) or "runs in a real-database project
     that the phase gate executes" (Route A).
   - Recommendation: Route B; if its seeder proves larger than the phase can carry, fall back to Route
     A and **state the limitation** rather than reporting the tests as running in CI.

4. **Should the four bulk export paths get an audit row in this phase?**
   - Known: they are `ids`-capped at 100 so they cannot breach SEC-03; they write no row; `BACKLOG.md`
     § WR-04 records it.
   - Recommendation: **no** — out of scope, stated explicitly in the plan (§3) so SC-5 does not read as
     covering them. Cheap to add later if the user disagrees.

5. **Does `COUNT(*)` equal `findMany(...).length` under drizzle's relational `with:`?**
   - Known: all relations are to-one; drizzle emits lateral subqueries; `api/v1/organizations/route.ts`
     already relies on this in production.
   - Recommendation: assert it once against live data rather than trusting the reading (§2). `[ASSUMED]`
     until then.

---

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|---|---|---|---|---|
| Docker + compose | dev env, live measurement | ✓ | `pipelite-app-1` up 19 h; `pipelite-postgres-1` up 2 weeks (healthy) | none needed |
| PostgreSQL (container) | all live measurement | ✓ | `postgres:16-alpine`, host **5433** → container 5432 | none |
| `psql` **on the host** | — | ✗ | — | `docker compose exec -T postgres psql …` — verified working |
| Node | vitest, scripts | ✓ | **v24.13.1** | — |
| npm | scripts | ✓ | **11.10.0** | — |
| vitest | all tests | ✓ | 4.1.11 | invoke as `./node_modules/.bin/vitest` (rtk rewrites `npx`) |
| drizzle-orm | `count()` in the new counter | ✓ | **0.45.2** | none — `count()` already used in 8+ modules |
| papaparse | CSV | ✓ | ^5.5.3 | — |
| `E2E_DATABASE_URL` | `test:db` provisioning | ✓ | `.env:24` → `localhost:5433/pipelite` | — |
| CI PostgreSQL service | Route B | ✓ **already present** | `postgres:16-alpine`, `ci.yml:61-78` | — |
| non-admin e2e user | SC-2 / SC-3 | ✓ | `e2e/seed-member.ts`; `pipelite-e2e-member@local.test`, role `member`, `approved` | — |
| GitHub Actions runner | Route B's CI step | ✗ **unverified in this session** | — | `origin/master` is still `a58b9e1` with Phases 46-49 unpushed (STATE.md:216), so **no new workflow step can be observed executing until the operator pushes**. Route B's CI half must be labelled "not yet observed on the real runner" — the same shape as Phase 47's control E. |

**Missing with no fallback:** none blocking.
**Missing with a fallback:** host `psql` (use the container). **Unobservable this session:** the
GitHub runner — Route B's CI step can be *written* and locally simulated, but cannot be *proved green
on the runner* while `origin/master` is 4 phases behind. That is Phase 46 GAP 1 / D-47-12-A, and it is
one operator push away.

---

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|---|---|---|
| A1 | `MIN_EXPORT_ROWS = 1000` is an appropriate policy floor | §5 | Too high → a mid-size deployment's whole table walks out. Too low → the feature is removed at small N (SC-2 violated off this deployment). **Needs user confirmation.** |
| A2 | `MAX_EXPORT_FRACTION = 0.40` correctly separates legitimate from degenerate | §4 | Refuses three real filters (named). Measurement narrows it to a 12.66 pp band; the point within the band is a judgement. |
| A3 | `COUNT(*)` on the base table equals `findMany(...).length` under the `with:` clauses | §2 | The refusal's `matched` disagrees with the file's row count → the gate authorizes on a wrong number. Cheap to prove: one live equality assertion. |
| A4 | Adding a step to `ci.yml` does not trip a gate beyond those enumerated in §7 | §7 | An unenumerated gate reddens mid-plan. Mitigated by having read `db-test-isolation.test.ts` in full — but the workflow is also read by `compose-uploads-persistence.test.ts` (referenced at `db-test-isolation.test.ts:171`), which I did **not** read. **Check it before editing `ci.yml`.** |
| A5 | A seeded CI dataset of a few hundred rows suffices for the 28 absorbed tests | §7 Route B | Underestimating means Route B costs more than the phase can carry → fall back to Route A. Derived from reading the assertions, not from attempting the seed. |
| A6 | The `views` locale contract's total `toEqual` and the two hard counts are the complete set of parity edits | §6 | A fourth hidden count reddens. Six edits enumerated from a full read of the relevant blocks; the file is 1,584+ lines and I read it selectively. |
| A7 | Disclosing `matched`/`total` in a refusal adds no new information leak | Security Domain | If the list surfaces do **not** in fact expose these totals to a non-admin (Phase 51's `UX-03` says list counts are currently *wrong*, which is not the same as absent), the refusal becomes a new count oracle. Worth one check at plan time. |

---

## Sources

### Primary (HIGH confidence — read at source, in this repository, this session)

- `src/lib/export/view-export-guard.ts` (139 lines, whole file) — the guard, `EXPORT_ROW_CAP`, the
  three declared invariants
- `src/lib/views/export-action.ts` (103 lines, whole file) — the only caller
- `src/lib/export/formatters.ts:300-640` — the four fetchers, `rowLimit`, `fetchFilteredData`, the cap
- `src/lib/export/types.ts` (whole file) — `ExportFilters`, `maxRows`'s contract
- `src/lib/views/url-params.ts` (610 lines, whole file) — `SAVEABLE_FILTER_KEYS`,
  `EXPORTABLE_FILTER_KEYS`, `pickFilterParams`, `hasExportableFilter`
- `src/lib/export/__tests__/view-filters.test.ts:690-813` — the E-9 no-admin gate, the cap gate, the
  `recordExport` gate
- `src/lib/export/formatters-live.test.ts` (whole file) — the 24 tests and their live-data coupling
- `src/lib/audit/export-events.ts:60-116`, `src/lib/audit/export-events-live.test.ts` — `recordExport`
- `src/lib/mutations/__tests__/db-test-isolation.test.ts` (774 lines, whole file) — every CI/project
  isolation gate
- `src/lib/__tests__/suite-hook-hygiene.test.ts:340-392, 1470-1524` — `SKIPPED_LIVE_FILES`
- `.github/workflows/ci.yml` (whole file) — the existing Postgres service, the 9 steps
- `vitest.config.ts`, `vitest.db.config.ts` (whole files); `package.json:12-24`
- `src/messages/locale-parity.test.ts` — `REQUIRED_VIEWS_KEYS:618`, export keys `:701-703`, counts
  `:1237-1240`, total `toEqual` `:1326-1329`, placeholder/untranslated checks
- `src/messages/{en-US,pt-BR,es-ES}.json:716-721`
- `src/components/views/saved-views-bar.tsx:228-357, 465-490`;
  `src/components/views/__tests__/saved-views-bar-wiring.test.ts:160-184, 798-838`
- `src/app/admin/export/actions.ts`; `src/app/organizations/actions.ts:425-479`;
  `src/lib/bulk/limits.ts:32`; `src/app/api/v1/organizations/route.ts:33-44`;
  `src/lib/filters/date-range.ts:56-75`
- `.planning/phases/50-export-authorization/50-CONTEXT.md`; `.planning/ROADMAP.md:530-586`;
  `.planning/REQUIREMENTS.md:67-68`; `.planning/BACKLOG.md:753-806`; `.planning/STATE.md`
- **Live database, `docker compose exec -T postgres psql -U pipelite -d pipelite`, 2026-08-27** — all
  volume, selectivity, `EXPLAIN ANALYZE` and ladder numbers in §0, §2, §4, §8
- **vitest, `rtk proxy ./node_modules/.bin/vitest run <file>`, 2026-08-27** — the 24 / 4 / 28 skip
  counts

### Secondary (MEDIUM)

- `drizzle-orm` 0.45.2 `count()` availability — confirmed by 8 existing production imports rather than
  by fetching drizzle's docs
- Next.js 16's `"use server"` async-only export rule — quoted from `view-export-guard.ts:11-16`, which
  states it was "verifiable in the compiler binary"; not independently re-verified this session

### Not consulted

- No Context7 lookup and no web search were performed. Every question this phase asks is answerable
  from this repository's own source and its own database, and both were read directly. Nothing here
  rests on training-data recall about a library's behaviour, with the single exception of A3 (drizzle's
  relational join strategy), which is flagged and given a cheap in-repo proof.
- `compose-uploads-persistence.test.ts` — referenced by `db-test-isolation.test.ts:171` as a second
  reader of `ci.yml` / `docker-compose.yml`. **Not read.** See assumption A4.

---

## Metadata

**Confidence breakdown:**

- **Code surface (call sites, gates, contracts): HIGH.** Every claim carries a `file:line` read at
  source this session, not recalled.
- **Live measurements: HIGH.** All re-measured in-session with `EXPLAIN ANALYZE` where timing is
  claimed. No number in §0, §2, §4 or §8 is inherited from another document; two (SC-1's 44,254/46,054
  and people's 36,893/38,348) independently reproduce what BACKLOG records, which is itself the useful
  result.
- **`MAX_EXPORT_FRACTION` value: MEDIUM.** The distribution is measured exhaustively; the point chosen
  within the 12.66 pp band is argued, not measured.
- **`MIN_EXPORT_ROWS` value: LOW.** No measurement exists on this deployment and the document says so.
  Flagged `[ASSUMED]`, needs the user.
- **CI topology: HIGH on the constraints (every gate read in full), MEDIUM on Route B's total cost**
  (the seeder was reasoned about, not attempted) and **LOW on Route B's behaviour on the real runner**
  (unobservable while `origin/master` is 4 phases behind).

**Research date:** 2026-08-27
**Valid until:** ~2026-09-26 for the code surface. The **live volumes should be re-measured at plan
time regardless** — SC-1 mandates it, and the deployment is an active development database.
