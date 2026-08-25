# Phase 48: REST API Authorization - Context

**Gathered:** 2026-08-25
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous)
**Amended:** 2026-08-25 — corrected by 48-RESEARCH.md. Two ROADMAP success criteria were unusable as
written and have been amended; the exploit was reproduced end-to-end; scope decisions below are now
binding.

<domain>
## Phase Boundary

Every `/api/v1` route that reads or writes a record decides, **per record**, whether this caller may —
and no query hands a JavaScript array to a raw SQL fragment.

In scope: `/api/v1/activities/route.ts`, `/api/v1/activities/[id]/route.ts`,
`/api/v1/stages/route.ts`, `/api/v1/stages/[id]/route.ts`, and the tests that ship with them.

Out of scope: a general authorization refactor across every route; changing the auth/session
mechanism; the export authorization hole (SEC-03, Phase 50) — related in spirit, separate phase.

**This is the milestone's first phase about a live security defect rather than about the machinery
that is supposed to catch defects.** A user can read, modify and delete another user's activities
through the public REST API today.

</domain>

<decisions>
## Implementation Decisions

### The four defects, as measured
- **SEC-01 / activities:** GET, PUT and DELETE on `/api/v1/activities/[id]` perform **no ownership
  check at all**, and GET on `/api/v1/activities` is unscoped. The PUT can additionally **reassign
  `owner_id`**, handing a record to another user.
- **SEC-01 / the three verbs fail independently.** SC-1 requires them asserted **separately** for GET,
  PUT and DELETE — one shared helper test would hide two of the three. Do not collapse them.
- **SEC-02 / stages:** the GET builds `withOptions` as `undefined` unless `?expand=pipeline` is passed,
  so the relation the ownership check reads is never loaded and **the legitimate owner gets a 403**.
  The file's own `ownershipWith` helper (`stages/[id]/route.ts:35`) already does this correctly for
  PUT and DELETE — **the GET is the one path that does not use it, which is both the bug and the shape
  of the fix.**
- **QG-03 / stages list:** `stages/route.ts:73` builds ``sql`${pipelines.id} IN ${pipelineIds}` `` from
  a JavaScript array instead of `inArray()`. Unreachable today only because `stageList` is guarded
  non-empty; a future refactor removing that guard turns it from awkward into broken.

### Reference shape
- **`pipelines/[id]/route.ts` is the reference implementation** — it does check `ownerId`. Match its
  shape rather than inventing a new one. Consistency across `/api/v1` is itself a security property:
  four routes that authorize four different ways is how the fifth gets missed.
- Prefer reusing the existing `ownershipWith` helper over writing a parallel mechanism.

### Status codes
- **Non-owner gets 403**, per SC-4, which is the stated contract and matches current behaviour for the
  paths that do check. Do not change it to 404 in this phase.
- **Noted tension, deliberately deferred:** a 403 confirms the record exists, which is an information
  leak a 404 would not have. This repo has precedent for the stricter choice — Phase 25 decided *all*
  webhook error states return 404 for zero information leakage. Whether `/api/v1` should follow is a
  real question, but changing it here would contradict SC-4 and widen the blast radius of a security
  fix. Record it; do not act on it.

### Tests ship with the fix
- **These four route files have ZERO test coverage today.** That is not incidental — it is why the
  defect survived. Tests are part of the deliverable, not a follow-up.
- **SC-3's anti-vacuity is built into the criterion and must be honoured literally:** the row count the
  list endpoint returns must equal a **direct SQL count scoped to that owner, on the live dataset**.
  An assertion that passes because both sides are empty proves nothing — this milestone has caught
  nine such gates already.
- **SC-5 is behavioural, not textual:** prove the `IN` fix by **removing the `stageList` non-empty
  guard and observing the query still correct** — explicitly NOT by grepping for ``sql` ``. A grep
  gate here would be the tenth vacuous gate.
- Every test must be able to fail. Write the authorization test, watch it go RED against the unfixed
  route, then fix. A test authored after the fix proves only that the code does what it does.

### Two-user fixtures
- Authorization tests need **two distinct users with real API credentials**, and the negative case must
  be a genuine cross-user request — not a mocked-out authorization result. Mocking the check is how a
  test passes while the route is broken.
- Prefer the live database over fabricated fixtures where SC-3 demands the live dataset, but tests must
  not mutate real records: create and clean up their own, or operate in a transaction that rolls back.

### AMENDED by research — three corrections

**C1 — QG-03 is a LIVE HTTP 500, not latent, and SC-5's proof method does not exist.**
There is no `stageList` non-empty guard; `stages/route.ts:69` is `if (!pipelineId)` — absence of a
filter param, not non-emptiness. `parsePagination` imposes no ceiling on `offset`, so
`GET /api/v1/stages?offset=73` (any offset >= the global stage count) emits `"pipelines"."id" IN ()`
and dies `42601 syntax error at or near ")"`. **Proof is behavioural and needs no ablation: that
request is 500 today and must be 200 with `data: []` after.** `inArray(col, [])` in the installed
drizzle-orm 0.45.2 emits a literal `false` rather than throwing, so the empty case is safe.

**C2 — SC-3 was vacuous by construction.** `select owner_id, count(*) from activities group by 1`
returns **one row**: all **79,022** activities belong to a single admin user. Scoped count equals
unscoped count for the only user with data, so the original equality is satisfied **by the broken
route, today**. The amended criterion requires a **discriminator** (>=2 owners with >=1 activity
each), a **floor** (own count > 0 — an empty response fails), a **ceiling** (no foreign row), and a
**cross-check** that the other owner's records exist and are absent.

**C3 — a vacuity trap inside SC-4.** The `non-owner + no expand -> 403` cell is 403 today for the
*wrong reason* (the relation is never loaded), so it passes identically before and after the fix.
**Only `owner + no expand -> 200` is a defect proof.** Assert all four cells, but do not present the
403-without-expand cell as evidence of anything.

### THE TENTH VACUOUS GATE — already shipped, and it indicts the repo's whole test suite

Research deleted **all three** `eq(organizations.ownerId, context.userId)` predicates — GET, PUT and
DELETE — from `organizations/[id]/route.ts` and ran the full base suite:
**`172 passed | 2 skipped`, `5237 passed | 32 skipped`. Nothing went red.** There is a test named
*"returns 404 ... when the organization is not the caller's"* and it does not detect the check being
removed. **Nothing in this repo catches deleting an authorization check from a REST route.**

That is this phase's real subject. Fixing four routes while leaving that undetectable means the next
one regresses silently. **The route-level authorization regression gate (Q10) is therefore IN SCOPE**,
and its own falsification is the phase's most important negative control: delete an ownership
predicate, watch the gate go red, restore.

### Resolved open questions — decided, do not re-litigate

- **Owner-only, NO admin bypass, on these routes.** The measurement forces it: the only user holding
  activities is an admin, so an admin bypass makes SC-3 permanently vacuous. Admin access to other
  users' records belongs on admin endpoints, not the general `/api/v1` surface.
- **A foreign `owner_id` in a PUT is REJECTED, not silently ignored.** Silently dropping the field
  leaves the caller believing the write succeeded as sent. A security boundary should fail loudly.
- **SC-3 runs against a database with fixtures the test creates and removes** — not against the live
  distribution, which cannot discriminate. Two owners, each with >=1 activity, created and cleaned up.
  Never mutate real records.
- **Scope: IN — `POST /api/v1/activities:164`** (plants an activity on another user). Same file, same
  requirement, same defect class; shipping a route where you can still write another user's data would
  not satisfy SEC-01's own wording.
- **Scope: IN — `stages/route.ts` paginates BEFORE it authorizes.** Measured: `?limit=5` returned
  `data: []` with `meta.total: 1` for the stage's own owner. Same file as QG-03 and a live correctness
  bug for legitimate owners.
- **Scope: OUT — `workflows/[id]/runs` and `runs/[runId]` unscoped reads.** Real, and recorded as a
  backlog item with the measured evidence, but a different subsystem; folding it in would widen a
  security fix past what can be verified in one phase. **Record it; do not silently drop it.**

### Claude's Discretion
- Whether the ownership check lives inline per route, in a shared helper, or in middleware — provided
  it is consistent with `pipelines/[id]/route.ts` and cannot be silently skipped.
- Test file placement and harness (the repo's `vitest.db.config.ts` project exists for DB-backed tests
  and **must stay outside `npm test`** — `db-test-isolation.test.ts` enforces that).
- Whether to add a route-level regression gate asserting every `/api/v1` record route authorizes.

</decisions>

<code_context>
## Existing Code Insights

### Reusable assets
- `src/app/api/v1/stages/[id]/route.ts:35` — the `ownershipWith` helper, already correct for PUT/DELETE.
- `src/app/api/v1/pipelines/[id]/route.ts` — the reference `ownerId` check.
- `ctx.userId` is the authenticated caller identity in these routes.
- `inArray()` from drizzle is the correct replacement for the raw `IN` fragment.

### Established patterns
- Server actions return `{ success: true/false, error/id }`; API routes emit CRM events directly via
  `crmBus` (different auth patterns than server actions — Phase 25/27 decisions).
- Ownership checks live in server actions / API routes; **mutations only check entity existence**
  (Phase 25 decision). So the fix belongs at the route layer, not in the mutation layer.
- Phase 25 decided all webhook error states return 404 for zero information leakage — relevant
  precedent for the status-code tension above.

### Integration points
- `src/db/schema/` for `activities` / `stages` / `pipelines` ownership columns.
- `vitest.db.config.ts` for DB-backed tests; `npm run test:db` runs them and must stay out of `npm test`.
- `.github/workflows/ci.yml` — one required `ci` job, now 9 steps (Phase 47 added two security steps).

</code_context>

<specifics>
## Specific Ideas

- **The standing v1.4 rule applies with extra force here.** Nine gates that could not fail have been
  caught in this milestone — six inherited from v1.3, a seventh inside the phase built to delete them,
  an eighth that was a ROADMAP success criterion already true before any work, and a ninth in Phase
  47's newest gate, found only because a reviewer extracted the shipped matcher and ran it rather than
  reading it. **Assume a tenth. For a security fix, a test that cannot fail is worse than no test —
  it converts an open hole into a hole with a green tick beside it.**
- **Two design rules earned in this milestone, both applicable here:** a counting gate needs a FLOOR as
  well as a ceiling (SC-3's row-count assertion is a counting gate — floor it, or an empty result
  passes); and a scan must floor the token it searches for, not just the hit count.
- **`rtk` hazards, measured repeatedly:** `grep … | wc -l` returns a WRONG count (36 → 19);
  `git log | wc -l` reported 50 vs `git rev-list --count` 100; `grep -n "export"` returned "0 matches"
  on a file with 15 export lines; `git status --porcelain` renders as the token `ok`. **Recompute every
  count with `node -e`; verify cleanliness with `git diff --exit-code`.** A count gate built on
  `wc -l` is vacuous in this environment.
- Live dataset for SC-3: `pipelite` holds ~46,054 organizations / 38,348 people / 25,195 deals, and
  `/api/health` is 200 with 10/10 processors on image `8f07a18eddad` (Node v24.19.0).

</specifics>

<deferred>
## Deferred Ideas

- Changing `/api/v1` unauthorized responses from 403 to 404 to remove the existence leak — contradicts
  SC-4 as written; needs its own decision.
- A general authorization audit of every `/api/v1` route beyond the four named here.
- **SEC-47-B** (from Phase 47): `matches_regex` is unbounded on the execution path. Every quick remedy
  silently changes workflow **routing**; the likely answer is the QuickJS sandbox under its `timeoutMs`.
- **SEC-47-A** (from Phase 47): `src/lib/email/client.ts:20` sets `tls: { rejectUnauthorized: false }`
  unconditionally — a larger exposure than any advisory formally accepted in Phase 47.

</deferred>
