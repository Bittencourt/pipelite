# Roadmap: Pipelite

## Milestones

- ✅ **v1.0 MVP** -- Phases 1-16 (shipped 2026-03-14)
- ✅ **v1.1 Reliability & Operations** -- Phases 17-20, 23 (shipped 2026-03-26)
- ✅ **v1.2 Workflows** -- Phases 24-31 (shipped 2026-03-28)
- ✅ **v1.3 Foundation & CRM Depth** -- Phases 32-45 (shipped 2026-08-24)
- 🚧 **v1.4 Debt Paydown** -- Phases 46-54, 19/19 requirements mapped (roadmap created 2026-08-25)

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

### v1.4 Debt Paydown (Phases 46-54) — ACTIVE

- [x] **Phase 46: Migration Chain & Toolchain Floor** - A clone of this repo builds its own database, and the documented commands work from the host (completed 2026-08-25)
- [ ] **Phase 47: Suite Trust & Supply Chain** - A red run means a defect, and the project has a stated position on its own advisories
- [ ] **Phase 48: REST API Authorization** - Every `/api/v1` route that touches a record authorizes the caller against that record
- [ ] **Phase 49: Mutation-Layer Truth After Commit** - A purge removes the bytes, a merge leaves the survivor consistent, a create response matches a read
- [ ] **Phase 50: Export Authorization** - A non-admin cannot walk the customer table out through a filter that narrows nothing
- [ ] **Phase 51: Board & List Volume** - The busiest board opens without loading every deal, and list counts describe the table rather than the page
- [ ] **Phase 52: 320px Reachability & Modal Keyboard Ownership** - Every dialog's primary control is reachable at 320px, and Enter inside a modal stays inside it
- [ ] **Phase 53: Workflow Field Picker & the Suppressed Hooks** - Custom fields are selectable in a condition, and the react-hooks suppressions are gone because the components are tested
- [ ] **Phase 54: Pipedrive Stage Semantics** - An imported stage carries the type the source describes, not a hardcoded default

**Why these groupings.** v1.4 has no new capability to sequence, so the phases are cut by shared blast
radius and shared verification setup rather than by theme — each phase is one container rebuild and
one suite run, against one family of files. That is why SEC-04/DATA-01/DATA-02 sit together (all
three are post-commit behaviour in `src/lib/mutations/*`), why QG-03 rides with SEC-01/SEC-02 (all
three are `src/app/api/v1/{activities,stages}` route files), and why PERF-01 precedes the 320px work
(it is the named amplifier of Playwright flakiness, so the e2e gates in Phase 52 are only
trustworthy after it lands).

## Phase Details

_v1.3's 14 phase definitions are archived in [milestones/v1.3-ROADMAP.md](milestones/v1.3-ROADMAP.md)._

### v1.4 Debt Paydown

**One process requirement applies to every phase below, and it is the reason this milestone exists.**
v1.3 shipped six gates that could not fail. So: every success criterion here must be observed FAILING
before it is trusted — break the thing on purpose, watch the gate go red, then fix it. Prefer
behavioural assertions and call-site / parsed-structure checks over raw-token greps; a comment
explaining a rule trips that rule's own grep gate (that collision fired fifteen times across Phases
37-38). And any new locale key must be added to the matching `REQUIRED_*_KEYS` array in the SAME
commit — those contracts use an exact `toEqual`.

### Phase 46: Migration Chain & Toolchain Floor

**Goal**: A self-hoster who clones this repository can bring up a working database from it, using the
commands the docs actually print, on a container whose Node satisfies the toolchain's own floor
**Depends on**: Nothing — and everything else depends on this. `DEPLOY-01` lands first because until a
fresh database can be built from migrations, no later phase can verify itself against a clean
database. That is exactly the position Phase 39 was in when it had to provision its test database
from a `pg_dump --schema-only`. This mirrors v1.3's own "CI lands first" note, for the same reason.
**Requirements**: DEPLOY-01, DEPLOY-02, DEPLOY-03
**Success Criteria** (what must be TRUE):

  1. `drizzle-kit migrate` against an **empty** database completes, and the schema it produces matches
     the schema a `pg_dump --schema-only` of the working database reports — compared table-by-table and
     column-by-column, not inferred from the absence of an error. (Today the run dies `42P01` at `0006`
     and leaves **0 tables**, because the transaction rolls back.)

  2. The app boots and serves `/api/health` 200 against a database built that way and nothing else —
     no `db:push`, no dump restore.

  3. A repeatable check migrates a throwaway database from scratch and **fails** when a migration
     references a table no migration creates. Observed failing on purpose (delete the new
     `import_sessions` DDL, watch it go red) before it is trusted — this is the only check that can
     catch a recurrence, and the recurrence is how this arrived.

  4. The migrate command exactly as printed in the deployment docs succeeds from the host with no
     inline `DATABASE_URL` override and no port edit. Observed failing by pointing `.env.local` back at
     `5432`.

  5. Every `engines` floor the lockfile declares is satisfied by the container's Node at all three
     build stages, checked by reading the declared floors rather than comparing against a number
     written into the gate — so the check cannot go stale when a dependency raises its floor.

**Notes for planning**: `import_sessions` is only ever `ALTER`ed (`0006`) and FK-referenced (`0014`)
across all 20 migrations. `.env.local:1` points at `localhost:5432`; Postgres publishes on **5433** —
fixing this also closes the `EAI_AGAIN postgres` papercut that bit the live export test from the host.
`node:20-alpine` is pinned at `Dockerfile:2` (deps), `:10` (builder) and `:74` (runner) — a fix must
change all three. Migration 0018 is already taken; a renumber may be needed (see the recorded
scan-guard item).

**Corrected at plan time by 46-RESEARCH.md** — three of the notes above are superseded:
`webhook_deliveries` is missing too and fails SILENTLY (migrate exits 0, 35 tables vs 36);
`.env.local` is never read by drizzle-kit, so the DEPLOY-02 fix moves to `.env` / `.env.example` /
`docker-compose.yml`; and NO renumber is needed, because the migrator skips by journal timestamp and
never compares the stored hash. Node 20 is EOL (2026-04-30) and the binding floor has moved off vite
onto `@napi-rs/lzma-linux-x64-gnu`.

**Plans**: 6 plans in 4 waves

Plans:
**Wave 1**

- [x] 46-01-PLAN.md — GATE A (static chain integrity, RED first) + repair migration 0006 by prepend + reconcile the dedup script's now-false comment · NC-5
- [x] 46-02-PLAN.md — `.env`/`.env.example` describe the host, compose constructs the container URL, docs reconciled, two gates re-anchored · SC-4, NC-4
- [x] 46-03-PLAN.md — all three Dockerfile pins to `node:24-alpine`, lockfile-derived `engines.node`, GATE C, ci.yml comment reconciled · NC-3

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 46-04-PLAN.md — `scripts/migrate-from-zero.mjs` + `npm run db:check-migrations`: from-zero build with ten-dimension catalog equivalence · NC-1, NC-2

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 46-05-PLAN.md — Route A CI wiring: the check runs on the required `ci` job; `db-test-isolation.test.ts` proxy replaced by direct assertions

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 46-06-PLAN.md — behavioural proof: rebuilt container reports Node 24, `/api/health` 200 against a migration-built database · SC-2, SC-5

### Phase 47: Suite Trust & Supply Chain

**Goal**: A red test run means a defect, and the project has a stated, enforceable position on the
advisories in its own committed lockfile
**Depends on**: Phase 46 — anything that touches the database from the host needs `DEPLOY-02`, and
repeated full-suite runs are only meaningful against a schema that can be rebuilt.
**Requirements**: QG-01, SEC-05
**Success Criteria** (what must be TRUE):

  1. **AMENDED 2026-08-25 — the original criterion could not fail.** It read: *"Ten consecutive
     full-suite runs at the default parallel worker count produce the same pass set."* Phase 47
     research measured **16 full-suite runs (10 idle, 3 at 2x CPU oversubscription, 3 at 3x) — 16/16
     identical pass sets, 4739 passed / 32 skipped, zero failures — on the UNFIXED tree.** The proof
     was already green before any work; it discriminates nothing. Keeping it would have shipped a
     seventh vacuous gate inside the phase built to delete them.

     **What actually moves is the MARGIN**, and that is now the criterion. Under induced load
     (>=3x CPU oversubscription): no timing-sensitive assertion may consume a dangerous share of its
     budget, measured and recorded per assertion. Baseline to beat, measured at 3x on the unfixed
     tree: the linearity assertion's ratio reaches **52.5 against its 80 threshold — 66% of budget
     consumed by contention alone**; `toggle.test.ts:61`'s `beforeEach` consumes **4121-4850 ms of
     10 000 ms**; `recursion.test.ts:82` reaches **2453-3263 ms** and is the next to fail. After the
     fix, every one of these must sit at a small, stated fraction of budget — and the *structural*
     gate (SC-1b) must hold: no test asserts on an elapsed-time delta or ratio anywhere in the suite.
     The ten-run pass-set check is retained as a cheap regression guard, but it is explicitly NOT the
     evidence.

  2. The property those two tests existed to defend is still defended, and provably: reintroduce a
     backtracking `resolveFieldPath` and the replacement assertion goes red on operation count or
     algorithmic shape. A test that passes under load by asserting nothing is the failure mode here.

  3. Every critical and high advisory in the lockfile has a recorded disposition — upgraded, replaced,
     or accepted with a stated reason — re-measured at plan time rather than taken from the 4/22 figure.

  4. CI states an audit policy and that policy can fail: add a knowingly-vulnerable dependency, watch
     the check go red, revert.

**Notes for planning**: `999.28` and `D-45-01` are ONE item. Phase 45 explicitly said to fix the two
together and not to chase either per-phase. The suite has a second, independent flake source recorded
in `BACKLOG.md` (cold `auth.setup.ts` at 30.1 s vs 1.9 s on retry) which is **not** in v1.4 scope —
do not let it be mistaken for QG-01, and do not close QG-01 on `retries: 1`.
**Plans**: 13 plans in 9 waves

Plans:

**Wave 1** *(the runner is pinned before any gate is authored against it)*

- [x] 47-01-PLAN.md — vitest to a `>=4.1.0` floor (CVSS 9.8 GHSA-5xrq-8626-4rwp) + the execution-time advisory baseline · SEC-05, QG-01

**Wave 2** *(alone in its wave — timing margins need an otherwise idle machine)*

- [x] 47-02-PLAN.md — `scripts/suite-repeatability.sh` + `scripts/diff-pass-sets.mjs`, and the BEFORE margin recorded at >=3x oversubscription · QG-01

**Wave 3** *(parallel: no `files_modified` overlap)*

- [ ] 47-03-PLAN.md — the hook-hygiene AST gate + `toggle.test.ts` and `recursion.test.ts` hoisted to static imports · NC-C (hook half) · QG-01
- [ ] 47-04-PLAN.md — `tokenizeFieldPath` exported, the elapsed ratio replaced by counted FLOOR/CEILING/FLATNESS + the AST structural half · NC-A, NC-B · QG-01
- [ ] 47-07-PLAN.md — every in-range advisory fix, `drizzle-orm` 0.45.2 first, plus the residual table by reach · SEC-05

**Wave 4** *(blocked on Wave 3)*

- [ ] 47-05-PLAN.md — the SC-1b elapsed-time taint gate + the last two elapsed assertions deleted · NC-C (timing half, both shapes) · QG-01
- [ ] 47-08-PLAN.md — `next` 16.1.6 -> 16.3.2 with its own gate, the phase's single Docker rebuild, and a human authenticated-render checkpoint · SEC-05

**Wave 5** *(alone in its wave — the AFTER margin must be measured on an idle machine)*

- [ ] 47-06-PLAN.md — the AFTER margin at the same induced load, the before/after table, and the ten-run guard · SC-1 evidence · QG-01

**Wave 6** *(blocked on Wave 4)*

- [ ] 47-09-PLAN.md — `scripts/audit-policy.mjs` (zero new dependencies), `audit-policy.json`, `AUDIT-POLICY.md`, `security:audit`, gate observed green · SEC-05

**Wave 7** *(parallel: no `files_modified` overlap)*

- [ ] 47-10-PLAN.md — the offline policy-shape gate with three PERMANENT negative controls · NC-D · SEC-05
- [ ] 47-11-PLAN.md — both audit steps on the required `ci` job + `MIN_CI_STEPS` raised in the SAME commit · SEC-05

**Wave 8** *(blocked on Waves 5 and 7)*

- [ ] 47-12-PLAN.md — push, close Phase 46's open item, then NC-E: the required GitHub check red with `mergeStateStatus: BLOCKED`, then green · SEC-05

**Wave 9** *(blocked on Wave 8)*

- [ ] 47-13-PLAN.md — negative-control register (all nine judged for REAL output), criterion verdicts, phase gate · QG-01, SEC-05

### Phase 48: REST API Authorization

**Goal**: Every `/api/v1` route that reads or writes a record decides, per record, whether this caller
may — and no query hands a JavaScript array to a raw SQL fragment
**Depends on**: Phase 46 (route tests want a clean database), Phase 47 (a suite whose red means
something). These four route files have **zero** test coverage today, so tests ship with the fix.
**Requirements**: SEC-01, SEC-02, QG-03
**Success Criteria** (what must be TRUE):

  1. An API key belonging to user A cannot read, modify or delete user B's activity — asserted
     separately for GET, PUT and DELETE on `/api/v1/activities/[id]`, because the three verbs fail
     independently today and one shared test would hide two of them.

  2. `PUT /api/v1/activities/[id]` cannot move an activity to another owner by writing `owner_id`.
  3. `GET /api/v1/activities` returns only activities the caller may see — the row count it returns
     equals a direct SQL count scoped to that owner, on the live dataset, so a passing assertion
     cannot come from an empty result.

  4. `GET /api/v1/stages/:id` returns 200 to the stage's legitimate owner **without**
     `?expand=pipeline`, and still 403s a non-owner both with and without the expand.

  5. No route builds a SQL `IN` list from a JavaScript array. Proven by removing the `stageList`
     non-empty guard and observing the query still be correct — not by grepping for `sql\``.

**Notes for planning**: `stages/[id]/route.ts:35` already carries an `ownershipWith` helper that loads
the relation unconditionally for PUT/DELETE — the GET is the one path that does not use it, which is
both the bug and the shape of the fix. `stages/route.ts:73` is the `IN` site. Compare
`pipelines/[id]/route.ts`, which does check `ownerId`, as the reference shape.
**Plans**: TBD

### Phase 49: Mutation-Layer Truth After Commit

**Goal**: What the four entity mutations leave behind is what they told the user they would — a purge
removes the bytes and the route that served them, a merge leaves the survivor's formulas consistent,
and a create response carries what a read would
**Depends on**: Phase 46 (clean database for mutation-level integration tests). Independent of Phases
47-48, but all three requirements here land in the same four files and share one live-DB test setup,
which is why they are one phase.
**Requirements**: SEC-04, DATA-01, DATA-02
**Success Criteria** (what must be TRUE):

  1. A request for a file URL whose record the caller may not see, or which no longer exists, returns
     no bytes — the route resolves the entity before serving. **This lands before blob deletion**: it
     closes the exposure on its own, and the URL is recoverable from the audit tombstone indefinitely.

  2. After a purge, the blob is gone from storage and its URL serves nothing. A storage failure during
     that deletion leaves the purge **committed** and logs a count mismatch — injected on purpose and
     observed, because the post-commit ordering is the whole point.

  3. Merging two records whose formula inputs disagree leaves the survivor's stored formula value equal
     to a fresh computation from its post-merge values. The test creates its own formula definition,
     since the live count is **0** — a dormant defect proven by a test that would pass either way is
     not proven.

  4. A `POST /api/v1/{organizations,people,deals,activities}` 201 body carries the same custom-field
     values a subsequent `GET` of that record returns, for all four entities.

**Open decision**: `DATA-02` is "decide once for all four entities" — recompute before returning, or
return a canonical read. Decide in phase discussion; do not let a plan assume one.
**Notes for planning**: `recalculateFormulas` uses the module-level `db` and cannot take a `tx`, so
`DATA-01` must run POST-commit — the existing block at `dedup.ts:629-650` is the right place and
already try/catches through `log.error("dedup-merge", …)`. **Two plan 34-02 fixture assertions compare
against the current create-response shape and must be amended in the SAME commit as `DATA-02`**, or
the suite goes red on success. No `deleteEntityFiles` / `collectFileFieldRefs` helper exists yet.
`src/lib/trash/prune.ts:66-73` documents the gap honestly today; that comment must stop being true.
**Plans**: TBD

### Phase 50: Export Authorization

**Goal**: A non-admin cannot walk the customer table out of the product through a filter that narrows
nothing
**Depends on**: Phase 46. Independent of the other phases — it is one guard and one decision, but the
decision is the work.
**Requirements**: SEC-03
**Success Criteria** (what must be TRUE):

  1. The export that today returns 44,254 of 46,054 organizations for `search=a` is refused or bounded
     for a non-admin — measured against the live database at that scale, not against a fixture, and
     re-measured at plan time.

  2. A legitimately narrow export still completes for the same non-admin, so the fix is a bound and not
     a removal of the feature.

  3. A user who is refused sees why, in terms they can act on — a blocked broad export is
     distinguishable from a broken one.

  4. The bound can fail: widen a filter step by step until it trips, and observe the refusal at the
     boundary. A guard whose threshold nobody has crossed on purpose is not a guard.

  5. Whatever the decision is, the audit row still records the exports that do complete — the existing
     row makes exports attributable, not bounded, and does not close this on its own.

**Open decision — required before planning, three candidates, all stated in `BACKLOG.md`**: a minimum
selectivity rule (refuse when a result exceeds some fraction of the table), a lower row cap for
non-admins, or restoring Phase 38's admin gate. This is a decision, not a patch. Note the history:
Phase 38 gated this behind admin; Phase 40 Decision 2 replaced the gate with a refuse-empty-filters
rule, which a filter that narrows nothing satisfies; the Phase 40 verifier wrote that this should
block milestone close and the v1.3 audit overrode that. **Confirm the override was deliberate as part
of the decision.**
**Notes for planning**: `src/lib/export/view-export-guard.ts` is 139 lines with no admin branch and no
selectivity rule. `EXPORT_ROW_CAP = 50_000`. The bulk export actions from Phase 38 write no audit row
at all — only the view path is instrumented. `formatters-live.test.ts` (24 tests CI never runs) guards
this same export path and is **recorded, not scoped**; if the phase can absorb making it runnable,
`BACKLOG.md` says it pairs naturally here.
**Plans**: TBD

### Phase 51: Board & List Volume

**Goal**: The busiest board opens without loading every deal on it, and a list surface's counts
describe the table rather than the fifty rows currently on screen
**Depends on**: Phase 46. **Sequenced before Phase 52** — `PERF-01` is the named amplifier of
Playwright flakiness (`/deals` costs 17.7 s even in an isolated run), so the e2e gates Phase 52 lives
on are only trustworthy after this lands.
**Requirements**: PERF-01, UX-03
**Success Criteria** (what must be TRUE):

  1. Opening the Closer pipeline (15,415 deals today) paints its heading in single-digit seconds, and
     the board's query returns a bounded number of rows per stage regardless of how many that stage
     holds — the **row count** is asserted, not only the wall clock, so the win cannot be a faster
     machine. (Baseline: 88.3 s, roughly linear at 5.7 ms/deal.)

  2. Each column states how many deals it holds beyond what it shows, and loading more brings them in.
  3. Dragging a card between stages still lands it where it was dropped, including after a load-more —
     the `@dnd-kit` sortable context has to know every item it can reorder, so this is not a drop-in
     virtualisation and the drag e2e is part of the gate.

  4. `/activities` unfiltered states the true pending and overdue counts (14 and 4,151 as measured;
     re-measure at plan time), computed server-side and asserted against a direct SQL count so the two
     cannot drift.

  5. No displayed count is derived from the rows on the page. Proven by setting the page size to 1 and
     observing every count stay the same — the assertion that would have caught this class the first
     time.

**Notes for planning**: `/activities` is the second instance of a recorded defect shape — "any surface
applying a JS filter after a limit has the same defect shape" — so the sweep is part of the value.
`Completed: 50` and `Overdue: 50` are the page cap, not counts; the three buckets are genuinely
exclusive at the query level (74,857 + 14 + 4,151 = 79,022, verified), so only the stats row lies.
A behavioural suite cannot see a predicate that moved from `where` into `rows.filter(...)` — plan
40-05 measured all 25 assertions staying green — so a `.toSQL()`-shaped gate belongs here.
**Plans**: TBD
**UI hint**: yes

### Phase 52: 320px Reachability & Modal Keyboard Ownership

**Goal**: A user on a 320px phone can reach and activate the primary control of any dialog or popover,
and pressing Enter inside a modal acts on the modal rather than on the list behind it
**Depends on**: Phase 51 (suite reliability — these are e2e-proven criteria and `/deals` is the
amplifier). Both requirements are primitives (`dialog.tsx`, `popover.tsx`,
`data-table-keyboard.tsx`) verified by the same Playwright run and one container rebuild, which is why
they are one phase.
**Requirements**: UX-01, UX-02
**Success Criteria** (what must be TRUE):

  1. At 320x640, the primary control of every dialog and popover surface is reachable and receives a
     **real click** — asserted as clickability, not as `scrollWidth <= clientWidth`.
     **`e2e/viewport-320.spec.ts` gains that assertion and is observed FAILING against today's
     `DialogContent` before the fix.** Its current assertion is exactly why Phase 45's 320px pass
     shipped green over a live defect.

  2. The duplicate-advisory create dialog — 940px tall in a 640px viewport today, with nothing to
     scroll — is both dismissible and completable at 320px: "Create anyway" is clickable.

  3. The `/activities` filter popover (388px tall at `top: -41` today, against Radix's computed 347px
     available height) renders inside the viewport and its contents are reachable.

  4. Pressing Enter on a focused button inside a modal opened over a list activates that button; the
     list behind it does not navigate and the draft survives — on all six surfaces mounting
     `useDataTableKeyboard`.

  5. Escape still dismisses all four overlay types and `j/k/e/d/n` still work on the list when no modal
     is open — the tempting `stopPropagation` one-liner breaks the first of these, which is why it is a
     criterion rather than a note.

**Notes for planning**: **`e2e/saved-views-320.spec.ts:980` carries a `test.fail()` marker on the
already-written failing assertion. Delete it in the SAME commit as the fix, or the suite goes RED the
day the fix lands.** The marker is guarded by an anti-vacuity check, so the recorded failure is real.
`dialog.tsx` and `popover.tsx` both have **zero** `max-h`/`overflow` matches; `DialogContent` sits
behind ~16 dialogs, and the org create dialog is already 586px in a 640px viewport (~54px of headroom).
`DropdownMenuContent` and `SelectContent` are already height-safe and are the reference pattern;
`DropdownMenuSubContent` is not. `isFormFocused` exempts INPUT/TEXTAREA/SELECT/contenteditable but not
BUTTON — guard the hook in one place for all six surfaces.
**Plans**: TBD
**UI hint**: yes

### Phase 53: Workflow Field Picker & the Suppressed Hooks

**Goal**: An operator can pick a custom field for a workflow condition from a list instead of
hand-typing an accented name into brackets, and the six `react-hooks` suppressions are gone because
those components are now tested rather than exempted
**Depends on**: Phase 46. Both requirements are behaviour-adjacent UI work needing component test
coverage that does not exist, verified by one rebuild plus one component-test-and-lint run — and two
of the six suppression sites (`webhook-response-config.tsx`, `entity-combobox.tsx`) sit in the same
directories the picker lands in.
**Requirements**: WF-01, QG-02
**Success Criteria** (what must be TRUE):

  1. In the condition builder, an operator selects a custom field by its real name — `Previsão de
     início operação`, `CNPJ / CPF`, `Código Mãe` — from a picker, and the saved definition evaluates
     correctly against a real record. All **152 of 169** live definitions whose names carry spaces or
     punctuation are selectable; the count is asserted against the live definition table, not a
     fixture.

  2. A field name containing both quote characters is either selectable or refused with a stated
     reason — never silently mis-parsed. (No live definition hits this today, which is exactly why it
     needs an assertion rather than an observation.)

  3. `grep -rn 'eslint-disable-next-line react-hooks/' src/` returns nothing, and lint passes with the
     `react-hooks` rules still at `error`. The set is re-derived from the tree at plan time — the
     Suppression Register in `32-04-SUMMARY.md` is out of date: `import-wizard.tsx:91` is gone and two
     new sites have appeared.

  4. Each formerly-suppressed component has a test that goes red if its behaviour changes — the
     reset-password error path, the single-use token fetch, the profile form, the hydration guard in
     `relative-time.tsx`, the combobox and the webhook-response form — so removing a suppression is
     proven behaviour-neutral rather than assumed. This is why none was fixed inside an infrastructure
     phase.

**Notes for planning**: The engine half was fixed in 34-12 — bracket-quoted paths parse — but no file
under `src/app/workflows/` emits `customFields[` in any form, so the capability is unreachable from the
product. `condition-config.tsx` is where the picker lands. Note the repo's constraint on the fix
pattern: `react-hooks/set-state-in-effect` is an ERROR here, so the adjust-state-on-prop-change pattern
is the sanctioned shape, and the resulting files may contain **zero** `useEffect` calls — a gate must
assert the contract, never the presence of an effect.
**Plans**: TBD
**UI hint**: yes

### Phase 54: Pipedrive Stage Semantics

**Goal**: An imported Pipedrive pipeline arrives with stage types that describe the source, so a
migrated board is not silently all-open
**Depends on**: Phase 46. Last because it is the only item with no live user harmed today and no
shared blast radius with anything else — one transformer file.
**Requirements**: DATA-03
**Success Criteria** (what must be TRUE):

  1. Importing a Pipedrive pipeline whose stages include terminal stages produces stages of the
     corresponding type — asserted from the transformer's output for each mapping input, table-driven,
     not from the absence of a crash.

  2. A stage the mapping cannot classify lands as `open` **deliberately**, and the import summary says
     so where a user can see it — a fallback stated is not a fallback hidden behind a hardcoded literal.

  3. The comment at `pipedrive-api-transformers.ts:164-167` either describes what the code does or is
     gone. It currently promises a `rotten_flag` / `deal_probability` mapping that was never written,
     and Phase 32's `let`→`const` change removed the last hint that the value was a placeholder.

**Open decision**: which Pipedrive signal determines won/lost — `rotten_flag`, `deal_probability`, both,
or terminal position in the stage order. This is a product decision about stage semantics, not a
mechanical fix. Address alongside the import wizard's terminal-stage handling.
**Plans**: TBD

## Progress

### v1.4 Debt Paydown (active)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 46. Migration Chain & Toolchain Floor | 6/6 | Complete   | 2026-08-25 |
| 47. Suite Trust & Supply Chain | 2/13 | In Progress|  |
| 48. REST API Authorization | 0/? | Not started | - |
| 49. Mutation-Layer Truth After Commit | 0/? | Not started | - |
| 50. Export Authorization | 0/? | Not started | - |
| 51. Board & List Volume | 0/? | Not started | - |
| 52. 320px Reachability & Modal Keyboard Ownership | 0/? | Not started | - |
| 53. Workflow Field Picker & the Suppressed Hooks | 0/? | Not started | - |
| 54. Pipedrive Stage Semantics | 0/? | Not started | - |

### v1.3 Foundation & CRM Depth (as recorded during the milestone)

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
**All 19 are now scoped as v1.4 requirements and mapped to Phases 46-54** — see
`.planning/REQUIREMENTS.md` for the REQ-ID per item and the traceability table.

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
*Roadmap updated: 2026-08-25 -- v1.4 Debt Paydown roadmapped: 9 phases (46-54), all 19 seeded requirements mapped, DEPLOY-01 forced into Phase 46 because no later phase can verify against a clean database until it holds. Phases cut by shared blast radius and shared verification setup rather than by theme, since a pure-remediation milestone has no capability to sequence*
*Roadmap updated: 2026-08-24 -- registers reconciled: the 999.x entries moved to BACKLOG.md (now the single register of record), the v1.3 audit's four untracked carry-items imported, and seven BACKLOG.md items promoted alongside the twelve 999.x ones. This section is now the promotion decision only*
*Roadmap updated: 2026-08-24 -- backlog reviewed against `a58b9e1`: all 12 open items verified live and tagged PROMOTE -> v1.4; 999.13/15/16 corrected in place; no milestone active, so nothing was renumbered*
*Roadmap updated: 2026-08-18 -- Phase 45 planned (11 plans, 4 waves); UI edits batched so the Docker rebuild is paid once, in the final wave*
*Roadmap updated: 2026-08-18 -- Phase 45 added (Cross-Cutting UI Repair and UAT Closure), collecting the five app-wide defects found when the outstanding Phase 36-38 human UAT was re-run in a real authenticated browser; depends on nothing and can run in parallel with Phases 39-43*
*Roadmap updated: 2026-08-17 -- Phase 38 planned (20 plans, 6 waves); the anticipated Phase 43 collision on `organizations/columns.tsx` and `people/columns.tsx` was designed out*
