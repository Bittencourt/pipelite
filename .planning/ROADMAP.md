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
- [x] **Phase 47: Suite Trust & Supply Chain** - A red run means a defect, and the project has a stated position on its own advisories (all 14 plans executed 2026-08-25; **QG-01 complete, SEC-05 PARTIAL** — SC-4+s runner half is NOT PROVED, see 47-13-SUMMARY and D-47-12-A)
- [x] **Phase 48: REST API Authorization** - Every `/api/v1` route that touches a record authorizes the caller against that record (all 10 plans executed 2026-08-26; **SEC-01, SEC-02 and QG-03 all PROVED**, 26/26 negative controls DELIVERED, the IDOR and the 500 both re-checked over real HTTP against a rebuilt image — see 48-10-SUMMARY)
- [x] **Phase 49: Mutation-Layer Truth After Commit** - A purge removes the bytes, a merge leaves the survivor consistent, a create response matches a read
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
**Plans**: 14 plans in 9 waves (plan 14 added mid-phase to close D-47-06-A)

Plans:

**Wave 1** *(the runner is pinned before any gate is authored against it)*

- [x] 47-01-PLAN.md — vitest to a `>=4.1.0` floor (CVSS 9.8 GHSA-5xrq-8626-4rwp) + the execution-time advisory baseline · SEC-05, QG-01

**Wave 2** *(alone in its wave — timing margins need an otherwise idle machine)*

- [x] 47-02-PLAN.md — `scripts/suite-repeatability.sh` + `scripts/diff-pass-sets.mjs`, and the BEFORE margin recorded at >=3x oversubscription · QG-01

**Wave 3** *(parallel: no `files_modified` overlap)*

- [x] 47-03-PLAN.md — the hook-hygiene AST gate + `toggle.test.ts` and `recursion.test.ts` hoisted to static imports · NC-C (hook half) · QG-01
- [x] 47-04-PLAN.md — `tokenizeFieldPath` exported, the elapsed ratio replaced by counted FLOOR/CEILING/FLATNESS + the AST structural half · NC-A, NC-B · QG-01
- [x] 47-07-PLAN.md — every in-range advisory fix, `drizzle-orm` 0.45.2 first, plus the residual table by reach · SEC-05

**Wave 4** *(blocked on Wave 3)*

- [x] 47-05-PLAN.md — the SC-1b elapsed-time taint gate + the last two elapsed assertions deleted · NC-C (timing half, both shapes) · QG-01
- [x] 47-08-PLAN.md — `next` 16.1.6 -> 16.3.2 with its own gate, the phase's single Docker rebuild, and a human authenticated-render checkpoint · SEC-05

**Wave 5** *(alone in its wave — the AFTER margin must be measured on an idle machine)*

- [x] 47-06-PLAN.md — the AFTER margin at the same induced load, the before/after table, and the ten-run guard · SC-1 evidence · QG-01

**Wave 6** *(blocked on Wave 4)*

- [x] 47-09-PLAN.md — `scripts/audit-policy.mjs` (zero new dependencies), `audit-policy.json`, `AUDIT-POLICY.md`, `security:audit`, gate observed green · SEC-05

**Wave 7** *(parallel: no `files_modified` overlap)*

- [x] 47-10-PLAN.md — the offline policy-shape gate with three PERMANENT negative controls · NC-D · SEC-05
- [x] 47-11-PLAN.md — both audit steps on the required `ci` job + `MIN_CI_STEPS` raised in the SAME commit · SEC-05

**Wave 8** *(blocked on Waves 5 and 7)*

- [x] 47-12-PLAN.md — **PARTIAL — LOCAL HALF ONLY.** NC-E observed on this machine: `npm run security:audit` exit 0 → **1** (one `FATAL` naming GHSA-xvch-5gv4-984h) → 0, attributed against the four other causes of a red, and contained (both manifests byte-identical by sha256). **NOT DELIVERED: the push, Phase 46's open item, the GitHub red, and `mergeStateStatus: BLOCKED`.** `origin/master` is still `a58b9e1` with 111 commits unpushed, so SC-4's runner half is **NOT PROVED** and SEC-05 stays **partial**. Reproduction: `deferred-items.md` § D-47-12-A · SEC-05

**Wave 9** *(blocked on Wave 8)*

- [x] 47-13-PLAN.md — negative-control register (all nine judged for REAL output), criterion verdicts, phase gate · QG-01, SEC-05

**Phase outcome, from 47-13-SUMMARY.md.** Eight of nine negative controls DELIVERED with verbatim output; control E DELIVERED LOCALLY and **NOT DELIVERED on the real runner**. Three controls re-falsified fresh at sign-off (A, C-hook, D). **No eighth vacuous gate found.** Verdicts: SC-1 **PROVED** (margin 49.6% → 0.7% and 35.3% → 0.4%; 47-06+s 3/6 RED loaded runs → 47-14+s **6/6 GREEN** at a sampled median 3.50x), SC-1b **PROVED** (0 elapsed assertions), SC-2 **PROVED** (the CEILING alone would have passed control A), SC-3 **PROVED** (39/39 dispositions), SC-4 **PARTIALLY PROVED**. Gate: **5164 passed / 32 skipped**, RSC 8/8, typecheck 0, lint **0 errors** / 124 warnings, `security:audit` exit 0, `db:check-migrations` exit 0, `/api/health` 200 with 10/10 processors. `origin/master` is `a58b9e1` with **114 commits unpushed** — Phase 46 GAP 1 and D-47-12-A both remain open, and both close with one operator push.

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
  3. **AMENDED 2026-08-25 — the original was vacuous by construction.** It read: *"the row count it
     returns equals a direct SQL count scoped to that owner, on the live dataset."* Measured:
     `select owner_id, count(*) from activities group by 1` returns **ONE row** — all **79,022**
     activities belong to a single admin user. Scoped count therefore **equals** unscoped count for the
     only user who has data, so the equality is satisfied **today, by the broken route**.

     **The criterion is now:** `GET /api/v1/activities` returns only activities the caller may see,
     proven with a **discriminator** — at least two owners each holding >=1 activity — and asserted
     with a **floor** (the caller's own count is > 0, so an empty result fails), a **ceiling** (no row
     belongs to another owner), and a **cross-check** that the other owner's records exist and are
     absent from this response. **If the fix grants admins a bypass, this criterion becomes permanently
     vacuous** — so admin bypass is rejected for these routes (see CONTEXT).

  4. `GET /api/v1/stages/:id` returns 200 to the stage's legitimate owner **without**
     `?expand=pipeline`, and still 403s a non-owner both with and without the expand.

  5. **AMENDED 2026-08-25 — the original named a guard that does not exist, and understated the
     severity.** It read: *"Proven by removing the `stageList` non-empty guard."* There is no such
     guard: `stages/route.ts:69` is `if (!pipelineId)` — absence of a filter param, not non-emptiness.
     **QG-03 is a LIVE HTTP 500, not latent.** `parsePagination` imposes no ceiling on `offset`, so
     `GET /api/v1/stages?offset=73` (any offset >= the global stage count) generates
     `"pipelines"."id" IN ()` and dies `syntax error at or near ")"` / `42601`.

     **The criterion is now:** no route builds a SQL `IN` list from a JavaScript array, proven
     **behaviourally and without ablation** — `GET /api/v1/stages?offset=73` returns **500 today** and
     must return **200 with `data: []`** after. Explicitly NOT proven by grepping for `sql\``.
     Note `inArray(col, [])` in the installed drizzle-orm 0.45.2 emits a literal `false` rather than
     throwing, so the empty case is safe.

**Notes for planning**: `stages/[id]/route.ts:35` already carries an `ownershipWith` helper that loads
the relation unconditionally for PUT/DELETE — the GET is the one path that does not use it, which is
both the bug and the shape of the fix. `stages/route.ts:73` is the `IN` site. Compare
`pipelines/[id]/route.ts`, which does check `ownerId`, as the reference shape.
**Plans:** 10/10 plans complete

Plans:

**Wave 1** *(five parallel plans, zero `files_modified` overlap)*
- [x] 48-01-PLAN.md — activities/[id] IDOR: GET, PUT and DELETE ownership checks asserted separately, plus the loud `owner_id` reassignment rejection · SEC-01
- [x] 48-02-PLAN.md — activities list scope and create-as-another-user rejection, with a rendered-predicate assertion in CI · SEC-01
- [x] 48-03-PLAN.md — stages/[id] GET calls the file's own `verifyStageOwnership` helper; all four SC-4 cells with the three guards labelled · SEC-02
- [x] 48-04-PLAN.md — stages list rewritten to join, scope, then paginate; the raw `IN` fragment deleted at the root; `ownedStagesPredicate` extracted · QG-03, SEC-02
- [x] 48-05-PLAN.md — the Q10 detector: AST matcher, KNOWN_POSITIVE/KNOWN_NEGATIVE fixtures with parse floors, corpus reach floors and WR-11 token floors · SEC-01, SEC-02

**Wave 2** *(blocked on Wave 1)*
- [x] 48-06-PLAN.md — the first two-user API-key fixture in the repo, and the seeded SC-3 proof with floor, ceiling, discriminator and cross-check; controls D and E · SEC-01
- [x] 48-08-PLAN.md — the Q10 gate: exemptions as live controls, the offender assertion, and controls A, A-prime, B and C — the direct answer to SEC-48-B · SEC-01, SEC-02

**Wave 3** *(blocked on Wave 2)*
- [x] 48-07-PLAN.md — the behavioural SC-5 proof against real PostgreSQL, F3 from both directions, and control F · QG-03, SEC-02
- [x] 48-09-PLAN.md — OpenAPI 403/422 coverage behind a parsing gate, and the three stale prose claims corrected · SEC-01, SEC-02, QG-03

**Wave 4** *(blocked on Wave 3)*
- [x] 48-10-PLAN.md — negative-control register (26 controls, 26 DELIVERED), vacuity hunt (no twelfth found), criterion verdicts, exploit re-checked over real HTTP against a rebuilt image, phase gate · SEC-01, SEC-02, QG-03

**Phase outcome, from 48-10-SUMMARY.md.** **Twenty-six negative controls judged against verbatim
output: 26 DELIVERED, 0 NOT DELIVERED** — the six the phase owed (A-F), the two it grew (A′, A″), and
nine more it produced as it went. **Four re-falsified fresh at sign-off:** control A (the exact
SEC-48-B ablation → `1 failed | 57 passed`, three offenders named by file:line:verb), control B1
(`ctx` removed from `IDENTITY_OBJECTS` → `10 failed | 48 passed`, the WR-11 token floor firing at
`measured 22`), the SC-4a ablation (`3 failed | 10 passed`, **both non-owner cells staying green**),
and a **new** one — the rename question put to the OpenAPI gate for the first time, RED at
`7 failed | 30 passed`. The Q10 matcher was **extracted and RUN** on five fixtures the gate file does
not contain, each over a parse floor; it correctly flags a `where` clause scoped to a caller-supplied
owner. **No twelfth vacuous gate found** — four tests applied to eight artifacts; 48-09's eleventh
(the dead needle `'guarded non-empty'` in its own plan's Task 3 script) is accepted rather than
re-counted, and it lived in a plan artifact, so nothing vacuous shipped. One floor named as brittle
rather than softened: `MIN_EXEMPT_MATCHED = 11`, pinned in both directions.

**The exploit is dead over real HTTP against a REBUILT image** — `docker compose up -d --build`,
image `8f07a18eddad` → **`eba9cfa1c4be`** (a matching id would have invalidated every measurement).
Thirteen research transcripts re-run: GET/PUT/DELETE **200/200/204 → 403/403/403**, both owner
reassignments **200/201 → 422** naming `owner_id`, B's list **100 foreign rows / `total: 79024` → 1 own
row / `total: 1`**, the stage GET **403 → 200** with no `pipeline` key in a bare body, and
`?offset=<live count>` and `?offset=999999` **500/`42601` → 200 with `data: []`**. F3 reversed too:
`?limit=5` returns the owner's stage instead of an empty page. Container log for the window: **zero
`42601`**, floored at 20 authenticated requests and the matcher falsified against a positive fixture.
Live database unchanged at `79022 / 73 / 12 / 10 / 8 / 214`; every probe row deleted, absence asserted.

**Verdicts:** SC-1 **PROVED**, SC-2 **PROVED**, SC-3 **PROVED as amended** (seeded proof; the
live-dataset half is a smoke check, not a proof), SC-4 **PROVED** on `owner + no expand → 200` alone,
the other three cells labelled regression guards and measured green before the fix, SC-5 **PROVED as
amended**, SEC-48-B **CLOSED** — the ablation that left 5237 tests green now fails exactly **1**.
Gate: **5376 passed / 32 skipped** (178 files + 2 skipped), RSC **8/8**, `tsc --noEmit` exit 0, lint
**0 errors** / 122 warnings, `test:db` **98 passed** across 4 files (exit 1 is DEF-48-01's teardown,
not a red suite), `db:check-migrations` exit 0, `security:audit` exit 0, `/api/health` 200 with
**10/10** processors, tree clean. Phase 48's own delta closes **exactly**: 5237 + 12 + 9 + 13 + 10 +
30 + 0 + 28 + 0 + 37 = **5376**. **SEC-48-A stays open by design** and is enforced rather than merely
documented; **DOC-48-01** records 50 of 59 spec operations still ungated.

### Phase 49: Mutation-Layer Truth After Commit

**Goal**: What the four entity mutations leave behind is what they told the user they would — a purge
removes the bytes and the route that served them, a merge leaves the survivor's formulas consistent,
and a create response carries what a read would
**Depends on**: Phase 46 (clean database for mutation-level integration tests). Independent of Phases
47-48, but all three requirements here land in the same four files and share one live-DB test setup,
which is why they are one phase.
**Requirements**: SEC-04, DATA-01, DATA-02
**Success Criteria** (what must be TRUE):

  1. **Under `FILE_STORAGE=local` (see the amendment below):** a request for a file URL whose record
     the caller may not see, or which no longer exists, returns no bytes — the route resolves the
     entity before serving. Both `GET` and `DELETE`. **This lands before blob deletion**: it closes
     the exposure on its own, and the URL is recoverable from the audit tombstone for **90 days**
     (`audit.retention_days = 90` — the original text said "indefinitely", which is false; 90 days is
     still ample for the ordering argument to hold).

  2. After a purge, the blob is gone from storage and its URL serves nothing. A storage failure during
     that deletion leaves the purge **committed** and logs a count mismatch — injected on purpose and
     observed, because the post-commit ordering is the whole point.

  3. Merging two records whose formula inputs disagree leaves the survivor's stored formula value equal
     to a fresh computation from its post-merge values. The test creates its own formula definition,
     since the live count is **0** — a dormant defect proven by a test that would pass either way is
     not proven.

  4. A `POST /api/v1/{organizations,people,deals,activities}` 201 body carries the same custom-field
     values a subsequent `GET` of that record returns, for all four entities.

**Open decision — SETTLED 2026-08-26 in `49-CONTEXT.md`**: `DATA-02` returns a **canonical read**
(re-read the record through the same path `GET` uses and serialize that), not an in-process recompute.
Applied identically to all four entities.

**SC-1 amendment, 2026-08-26 — SC-1 holds for LOCAL STORAGE ONLY.** Under `FILE_STORAGE=s3` the
stored `publicUrl` is `${S3_PUBLIC_URL}/${key}` (`src/app/api/upload/route.ts:89`), so reads never
traverse `/api/files/...` and an ownership guard on that route protects nothing in an S3 deployment.
Measured during Phase 49 research. Do NOT read SC-1 as blanket coverage. The S3 bypass is recorded as
its own backlog item; closing it changes how uploads hand back URLs and touches every consumer of
`publicUrl`, which is more than this phase's requirements ask for.
**Notes for planning**: `recalculateFormulas` uses the module-level `db` and cannot take a `tx`, so
`DATA-01` must run POST-commit — the existing block at `dedup.ts:629-650` is the right place and
already try/catches through `log.error("dedup-merge", …)`. **The ROADMAP previously named "two plan 34-02 fixture
assertions" here; Phase 49 research found SIX suite-breakers in three sets, and the named pair is not
the one that necessarily breaks.** Set A (`src/lib/mutations/organizations.test.ts:134` and `:600`)
breaks only if `createOrganizationMutation`'s RETURN changes — route-level placement avoids it, and
must, because `people` and `deals` POST use no create mutation at all. Set B are the guaranteed
breakers and were unnamed anywhere: `src/app/api/v1/deals/__tests__/formula-recalc.test.ts:367` and
`src/app/api/v1/people/__tests__/formula-recalc.test.ts:354`, both asserting the 201 stays pre-recalc;
inverting them yields SC-4's proof for two entities. Set C is mechanical:
`src/app/api/v1/activities/__tests__/route.test.ts:336` and `:347`. All must be amended in the SAME
commit as `DATA-02`, or the suite goes red on success. See `49-RESEARCH.md` for the full chain. No `deleteEntityFiles` / `collectFileFieldRefs` helper exists yet.
`src/lib/trash/prune.ts:66-73` documents the gap honestly today; that comment must stop being true.
**Plans**: 9 plans in 6 waves. Re-measured at plan time (2026-08-26): `type='formula'` **0**,
`type='file'` **0**, records carrying a stored file descriptor **0** across all four CRM tables — all
three premises hold, so every proof must manufacture its own subject.
**Wave rule (hard):** `scripts/dedup-db-test-setup.sh` drops and rebuilds every schema in
`pipelite_dedup_test`, so no two plans owning a `*.db.test.ts` file share a wave. Five plans own one
(49-01, 49-05, 49-06, 49-07, 49-08) and 49-09 runs the whole db project, which is why there are six
waves.

Plans:
- [x] 49-01-PLAN.md — wave 1: re-measure the three zero-counts, EXECUTE the storage-failure seam, build the shared `custom_field_definitions` fixture three criteria depend on — SEC-04, DATA-01, DATA-02
- [x] 49-02-PLAN.md — wave 1: `collectFileFieldRefs` and `deleteEntityFiles`, pure/unit, with the injected-failure shortfall observed — SEC-04
- [x] 49-03-PLAN.md — wave 1: the four canonical create reads, all six suite-breakers amended in lockstep, and the first test file for `POST /api/v1/organizations` — DATA-02
- [x] 49-04-PLAN.md — wave 2: `findOwnedRecordById`, the JSONB reference match, path containment, wired into the file route's `GET` and `DELETE`; the IDOR reproduced at handler level first — SEC-04
- [x] 49-05-PLAN.md — wave 2: the behavioural four-entity 201-equals-GET proof against real PostgreSQL, with four per-entity ablations — DATA-02
- [x] 49-06-PLAN.md — wave 3: the behavioural SC-1 proof — two owners, real bytes, both verbs, both directions, with the IDOR reproduced against real PostgreSQL — SEC-04
- [x] 49-07-PLAN.md — wave 4: post-commit blob deletion in the four purge mutations, the injected failure leaving the purge committed, and the two comments that documented the gap retired — SEC-04
- [x] 49-08-PLAN.md — wave 5: the post-commit survivor recalculation, the `changedFields` spelling pinned, and the survivor-wins vacuity control measured — DATA-01
- [x] 49-09-PLAN.md — wave 6: sign-off — the control register, three fresh falsifications, the vacuity hunt, four criterion verdicts, the phase gate, and a real-HTTP DATA-02 round trip against a rebuilt image — SEC-04, DATA-01, DATA-02

**PHASE 49 OUTCOME — signed off by 49-09 on 2026-08-26 by auditing the phase's evidence, not its
intentions.**

**Every plan in this phase found a defect in its own plan. Eight for eight**, and that is the
strongest single signal about the phase: 49-02's containment gate **could not have failed** (a
root-level check plus a two-segment climb lands exactly on the root, which the check allows); 49-06's
`must_haves.truths[0]` asked for a zero-byte body, which **fails against correct code** (the refusal
is 29 bytes by design); 49-08's fixture computed **74 — exactly the loser's stored value** — so a
merge that merely COPIED the loser's key would have passed the discriminator; 49-03 found the
`<verify>` blocks `cd`-ed to the MAIN repo, a green transcript proving nothing, fixed across all nine
plans in `34b2233` (20 occurrences, re-measured at 0 of 9 at sign-off); 49-07's ablation A3 could not
fail; and 49-08's own ORDERING cell was vacuous (`invocationCallOrder` is monotonic by construction).

**Negative-control register: 41 controls judged against verbatim output — 36 DELIVERED, 5 NOT
DELIVERED, each of the five named with the structural reason its red is impossible** rather than
softened (the rejected in-process merge, a create's canonical-read owner term, the inner catch's
never-rethrow, the survivor-first ordering behaviourally, and `updated_at` not being bumped).
**Three re-falsified fresh at sign-off:** the ownership term in `file-access.ts` → **5 of 18 red**
with the victim's CONTENTS in the response body and `existsSync` going false on the victim's blob;
`changedFields: Object.keys(fieldChanges)` → **db 3 of 15** (`expected 122 to be 174`) **and unit 1 of
32** naming the cause; the blob deletion moved inside the transaction → with the result assertion
deferred, **`expected 1 to be +0`** — the row is still in the database while its bytes are already
gone, which is why the deletion is post-commit.

**Vacuity hunt: NO VACUOUS GATE FOUND** — four tests applied to **13 gate artifacts** carrying **800
assertions** (comment-stripped, counted with `node`). Test 1 was **run rather than read**: the three
SEC-04 predicates were driven on 20 fixtures whose text appears in no test file, 19 behaved as
specified and one **corrected the sign-off plan's own prediction** (an empty `storedName` is refused,
because it would resolve to the field directory). A fresh deny-everything ablation on
`resolveContainedPath` reddens **9 of 52** cells in `route-containment.test.ts` — so that file's
non-vacuity rests on its 9 positives, **named as brittle rather than glossed**. Test 3 is satisfied
structurally: **zero source-token greps anywhere** — no gate in this phase reads a source file from
disk, so the project's most-repeated failure mode has no surface here. Test 4 was answered fresh:
renaming the mismatch log's `msg` to an equally well-formed value reddens the exhaustive `toEqual`
while `log-scope-format.test.ts` stays **green**.

**DATA-02 re-checked over real HTTP against a REBUILT image** — `docker compose up -d --build`, bound
image `sha256:83003bf6eb2e…` → **`sha256:66efd8556ac1…`** (a matching id would have invalidated every
measurement). `POST /api/v1/organizations` **201** then `GET` **200** over a manufactured
`type='formula'` definition: the two `custom_fields` deeply equal, the derived value equals the
expression computed from the name that was SENT, and the discriminator (201 ≠ the object the request
sent) asserted — 12 of 12 assertions pass. Foreign key B → **404**. The temporary formula definition
existed for **~1 second per run** and was hard-deleted first; the live `type='formula'` count is back
at **0** and the table at **169**, not 170. Every `p49gate` row removed in foreign-key order with
absence asserted; `organizations` back at **46054**, `users` 10, `api_keys` 8, `audit_log` 214, and
**0 stored file descriptors on both the `%storedName%` and `%publicUrl%` probes across 188,619
rows** — identical to 49-01's measurement, so the live database was not written to by this phase.

**Verdicts:** SC-1 **PROVED for `FILE_STORAGE=local` only**, SC-2 **PROVED**, SC-3 **PROVED on wider
evidence after being re-opened** (the sign-off's verdict rested on the survivor adopting a loser's
*input*; the post-sign-off review's WR-01 showed the criterion FAILED when the survivor adopts the
loser's *output* — stored 574 against inputs computing 122, reachable through the `filledOnly` default
with no user action. Fixed in `80b5098`, now pinned in both directions by three new db cells), SC-4
**PROVED**. Each cites the defect-proving assertion, never a regression guard — and the three known
guards are named as guards: 49-03's activities cells (C1) were green before the fix, 49-07's
URL-goes-dark half was already true after 49-04, and 49-05's and 49-06's first runs were green because
the fix had already landed.

**Gate:** base **5659 passed / 32 skipped** (184 files passed + 2 skipped), RSC **8/8**,
`tsc --noEmit` exit 0, eslint **0 errors** / 118 warnings (gated on errors), `npm run test:db` **288
passed over 13 files, EXIT 0**, `db:check-migrations` exit 0, `security:audit` exit 0 (47 advisories,
14 packages, 39 of 39 allowlist entries applied, 1285 dependencies), `/api/health` 200 with `db.ok`
true and **10/10** processors, tree clean by `git diff --exit-code`. **Both deltas close EXACTLY,
plan by plan, every intermediate figure quoted from a SUMMARY:** base
`5546 + 0 + 43 + 11 + 52 + 0 + 0 + 0 + 7 + 0 = 5659`; db `197 + 14 + 23 + 18 + 21 + 15 = 288`.

**DEF-48-01 CLOSED, and it is this phase's incidental win.** `npm run test:db` exited non-zero on a
green suite from Phase 40 until 2026-08-26; root cause found by 49-06 (DEF-49-04) and fixed in
`37202ce` — the `afterAll` guard wrapped the `expect` but not the QUERY, and `saved_view_defaults` has
no `id` column → `42703`. Every phase from 48 onward had carried "never gate on its exit code" as a
standing caveat; that caveat is retired.

**Four limitations this phase ships ON PURPOSE, and none may be quietly upgraded.** (1) **SC-1 is
`FILE_STORAGE=local` only** — under `s3` the stored `publicUrl` is `${S3_PUBLIC_URL}/${key}`
(`upload/route.ts:89`) and reads never traverse the guarded route: **SEC-49-A**, open. 25 S3 sentences
across the eight SUMMARYs were read for polarity and **all 25 are refusals or scope limits; zero claim
coverage.** (2) **The tombstone retains 90 days, not "indefinitely"** — 22 occurrences of the stem in
the phase directory, **all 22 refusing or correcting the claim, zero asserting it**; the two documents
that still asserted it (`REQUIREMENTS.md` SEC-04, `BACKLOG.md` CR-01) are corrected in this sign-off.
(3) **Nothing in this phase discriminates the canonical read from the rejected in-process merge** —
ablation 5 passes 23/23, and 5b (that merge PLUS a canonical read resolving nothing) is **still
23/23**, so the proof is blind to whether the re-read happens; control 5c reddens, proving 5b's
sabotage was live. **DATA-49-A**; the guarantee is the code path. (4) **DEF-48-05 / SEC-48-C is NOT
closed here** by the user's decision, keeps its owner and evidence, and is restated as open — 6
references across the SUMMARYs, all six explicit non-absorptions.

**One finding one call-chain hop OUTSIDE the phase's declared file surface — which is exactly how
Phase 48's sign-off missed five criticals.** **SEC-49-D:** `POST /api/upload` authorizes on
`session?.user` **alone** with no entity resolution, and builds `path.resolve(UPLOAD_DIR, entityId,
fieldName)` from two **unvalidated form fields** with no containment check — so the defect 49-04 closed
on the read side is live on the write side, and no test drives that route at all. Executed against the
container's measured `UPLOAD_DIR`: `entityId = "../../.."` resolves to `/app`, `"/etc"` to
`/etc/cron.d`. **It does NOT reopen SC-1** — the read guard requires the name to already be in that
record's own JSONB, which an attacker cannot write. Recorded, not fixed: an upload write path is
outside SEC-04's wording. Also carried out: SEC-49-B, SEC-49-C, DEF-49-01/02/03/05.

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
non-admins, or restoring Phase 38's admin gate. **DECIDED 2026-08-27 (user): a MINIMUM SELECTIVITY RULE.** Refuse when the result
exceeds a fraction of the live table. It is the only one of the three candidates that satisfies SC-1
and SC-2 together, because it is the only one that distinguishes a narrow export from a broad one —
and **SC-2 rules the pure admin gate out**, since that removes the feature for non-admins rather than
bounding it. `MAX_EXPORT_FRACTION` must be a tunable with a recorded measurement behind it, not a guess.

**The history note above was itself inaccurate, and the correction is recorded rather than the claim
repeated.** The roadmap said "the Phase 40 verifier wrote that this should block milestone close and
the v1.3 audit overrode that." Read at source, that is not what happened:

- **Phase 40's verifier did NOT call the export exposure blocking.** Its G-3 reads: "G-3 asked for
  them to be *tracked somewhere a later reader will look*, not fixed — that is satisfied. WR-04
  remains a real open exposure." (`.planning/milestones/v1.3-phases/40-saved-views-shared-filters/40-VERIFICATION.md`)
- The blocking-flavoured language belonged to a **different** item — the unrun
  `formatters-live.test.ts` — and even there the verifier explicitly declined to block: "NOT fixed
  here: giving CI a database is an infrastructure decision, not a drive-by edit on the last day of a
  milestone."
- **The v1.3 audit enumerated both at ship time, with the measurement**, as known gaps 2 and 3:
  "WR-04 export authorization — a non-admin can still export 44,254 of 46,054 organizations (96.1%)
  under the 50,000 cap. Open, tracked, unchanged." (`.planning/milestones/v1.3-MILESTONE-AUDIT.md:67-68`)

So the v1.3 close was a **knowing, documented acceptance on both sides — not an override of a
blocking finding.** No re-litigation of v1.3 is owed. What IS owed is this phase, and the note that a
roadmap can misdescribe its own history in the direction of drama.
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
| 47. Suite Trust & Supply Chain | 14/14 | Complete   | 2026-08-25 |
| 48. REST API Authorization | 10/10 | Complete    | 2026-08-26 |
| 49. Mutation-Layer Truth After Commit | 9/9 | Complete    | 2026-08-26 |
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
