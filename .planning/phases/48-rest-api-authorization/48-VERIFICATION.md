---
phase: 48-rest-api-authorization
verified: 2026-08-26T04:15:00Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
---

# Phase 48: REST API Authorization Verification Report

**Phase Goal:** Every `/api/v1` route that reads or writes a record decides, per record, whether
this caller may — and no query hands a JavaScript array to a raw SQL fragment.
**Verified:** 2026-08-26T04:15:00Z
**Status:** passed
**Re-verification:** No — initial verification (this is the first `48-VERIFICATION.md`)

## Method note

This report does not trust `48-10-SUMMARY.md`'s pre-review sign-off ("26/26 controls DELIVERED"),
`48-REVIEW.md` iteration 3's findings as the final word, or `deferred-items.md`'s superseded text.
It re-derives each must-have from `ROADMAP.md`'s amended SC-1…SC-5 and `REQUIREMENTS.md`'s
SEC-01/SEC-02/QG-03, then checks the CURRENT code and CURRENT test results — including the two
criticals (CR-04, CR-05) that iteration 3 found AFTER 48-10 shipped, and the fix passes that
followed. Every claim below was checked against the file at the cited path/line, not against prose
describing it. `git log --oneline -5` and `git diff --exit-code` confirm the tree is at `195c7c4`,
clean, matching the state this task's harness measured.

## Goal Achievement

### Observable Truths (ROADMAP SC-1…SC-5, amended, plus the two post-signoff criticals)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC-1: activities GET/PUT/DELETE on `/api/v1/activities/[id]` each independently 403 a non-owner | VERIFIED | `src/app/api/v1/activities/[id]/route.ts:122,180,419` — three separate `ownerId !== ctx.userId` checks, one per verb. `activities-scope.db.test.ts` run live: 86 tests passed (with stages/import) |
| 2 | SC-2: `PUT .../activities/[id]` cannot reassign `owner_id` | VERIFIED | `route.ts:209-217` rejects with `422 forbidden` when `owner_id !== ctx.userId`; asserted in the same db test file |
| 3 | SC-3 (amended): `GET /api/v1/activities` list is owner-scoped with floor+ceiling+discriminator+cross-check on a seeded two-owner fixture | VERIFIED | `activities/route.ts:70` (`eq(activities.ownerId, ctx.userId)` scopes both page and count); `activities-scope.db.test.ts:559-598` implements the amended criterion exactly (floor, discriminator, ceiling, cross-check); OBS-48-01's vacuity lesson (non-emptiness floor on BOTH sides) is applied |
| 4 | SC-4 (amended): `GET /api/v1/stages/:id` returns 200 to the legit owner without `?expand=pipeline`, still 403s a non-owner with/without expand | VERIFIED | `stages/[id]/route.ts:44-108` — `verifyStageOwnership` unconditionally loads the `pipeline` relation; response projection is the only thing gated on `?expand=` |
| 5 | SC-5 (amended): no route builds a SQL `IN` list from a JS array; `?offset=` past the stage count is 200/`data:[]`, not 500 | VERIFIED | `stages/route.ts` no longer builds any pipeline-id array — scoped via `innerJoin` + `ownedStagesPredicate` (`src/lib/api/stage-scope.ts`); `MAX_OFFSET = 1_000_000` in `pagination.ts:40` clamps every list route's offset |
| 6 | Post-signoff: CR-04 — `crm_action.fieldMapping.ownerId` cannot move a deal into another owner's account | VERIFIED | `src/lib/execution/actions/crm.ts:287,299-312` `FORBIDDEN_MAPPING_KEYS` refuses `ownerId`/`id`/`deletedAt` above the switch, before all three dry-run gates. `crm-ownership.db.test.ts` run live: 31/31 passed, including the CR-04 describe (`:1020` — create/update/interpolated/dry-run cells, all asserting the DATABASE, not the response) |
| 7 | Post-signoff: CR-05 — the workflow trigger matcher cannot become a standing cross-owner read | VERIFIED | `src/lib/triggers/matcher.ts:232-259` scopes `matchAndFireTriggers` to `eq(workflows.createdBy, ownerId)` where `ownerId` is the EVENT RECORD's owner (not the actor), fails closed via `requireScopedPredicate`. `trigger-owner-scope.db.test.ts` + `runs-owner-scope.db.test.ts` run live: 30/30 passed |
| 8 | QG-03: the route-level authorization regression gate exists and provably fires | VERIFIED | `route-authorization.test.ts` run live: (with `openapi-error-coverage.test.ts`) 137/137 passed. `SEC-48-A: %s is NOT flagged, and is NOT exempt either` (`:1840`) is the named replacement for the deleted inverted-polarity control and asserts both halves |

**Score:** 8/8 truths verified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/app/api/v1/activities/[id]/route.ts` | per-verb ownership check, `owner_id` rejection | VERIFIED | Read in full; matches SC-1/SC-2 exactly, including the CR-01 `deal_id` 422 guard and the read-side ownership guard on `?expand=deal` |
| `src/app/api/v1/activities/route.ts` | scoped list + create-as-another-user rejection | VERIFIED | `:70` (list scope), `:186-190` (POST `owner_id` refusal), `:205-215` (CR-01 `deal_id` 422) |
| `src/app/api/v1/stages/[id]/route.ts` | GET uses the file's own ownership helper unconditionally | VERIFIED | `verifyStageOwnership` (`:44-86`) is called by GET/PUT/DELETE alike |
| `src/app/api/v1/stages/route.ts` | join+scope+paginate, no raw array `IN` | VERIFIED | `:59-83` — `innerJoin` + `ownedStagesPredicate`, pagination applied after scoping |
| `src/lib/api/stage-scope.ts` | `ownedStagesPredicate`, `requireScopedPredicate` | VERIFIED | Both exported and reused from `crm.ts` and `matcher.ts` — genuinely reachable from three modules, not merely present |
| `src/lib/api/pagination.ts` | `MAX_OFFSET` ceiling | VERIFIED | `:40`, applied in `parsePagination`, used by all list routes (`activities`, `stages`, `deals`, etc.) |
| `src/lib/execution/actions/crm.ts` | CR-02/CR-04/WR-11/WR-12 boundary | VERIFIED | `callerScope` now routes through `requireScopedPredicate` (fixes WR-11's false "type error" claim); `mutationMap`/`lookupDefs` are `Map`s (fixes WR-12's prototype-pollution gap); `FORBIDDEN_MAPPING_KEYS` fixes CR-04 |
| `src/lib/triggers/matcher.ts` | CR-05 owner-scoped matcher | VERIFIED | `matchAndFireTriggers` (`:232-259`) resolves the event record's owner and fails closed |
| `src/app/api/v1/workflows/[id]/runs/route.ts`, `.../[runId]/route.ts` | SEC-48-A ownership scope | VERIFIED | Both now call `getWorkflow(id, context.userId)` before reading runs; 404 on foreign, matching sibling routes |
| `src/app/api/v1/__tests__/route-authorization.test.ts` | Q10 regression gate | VERIFIED | 2014: "finds no unauthorized handler outside the documented exemptions"; `:1838-1873` SEC-48-A named replacement cell; run live, 137/137 (combined with openapi test) |
| `src/app/api/v1/__tests__/openapi-error-coverage.test.ts` | parsed-YAML 403/404 gate, scope 12 ops | VERIFIED | `public/openapi.yaml:2993,3048` documents both `workflows/{id}/runs` paths; gate asserts scope is exactly 12 operations |
| `*.db.test.ts` behavioural proofs (6 files named in the task) | red-first, real PostgreSQL | VERIFIED | Ran all six independently: `activities-scope.db.test.ts` + `stages-scope.db.test.ts` + `import-owner-scope.db.test.ts` = 86 passed; `crm-ownership.db.test.ts` = 31 passed; `trigger-owner-scope.db.test.ts` + `runs-owner-scope.db.test.ts` = 30 passed. All green, no skips beyond what the harness measured |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `activities/[id]/route.ts` GET/PUT/DELETE | `ctx.userId` | direct `ownerId !== ctx.userId` comparison, 3 sites | WIRED | Each verb has its own independent check, per the CONTEXT decision "the three verbs fail independently" |
| `stages/[id]/route.ts` GET | `verifyStageOwnership` | unconditional relation load | WIRED | GET no longer conditions the `with` clause on `?expand=` |
| `crm.ts` `handleCrmAction` | `assertNoForbiddenMappingKeys` | called after interpolation/coercion, above the switch | WIRED | Covers create/update/delete and all three dry-run gates |
| `matcher.ts` `matchAndFireTriggers` | `resolveEventRecordOwner` → `workflows.createdBy` | `requireScopedPredicate` | WIRED | Fails closed (returns, logs error) when owner unresolvable |
| `workflows/[id]/runs/route.ts` | `getWorkflow(id, context.userId)` | called before the run query | WIRED | `route-authorization.test.ts`'s SEC-48-A cell confirms neither flagged nor exempt |
| `route-authorization.test.ts` | the actual route files | AST walk over `ROUTE_FILES` | WIRED | Ablation-style design: `SEC-48-B` (BACKLOG) proves this class of gate goes from 0→1 failures when a real predicate is deleted |

### Data-Flow Trace (Level 4)

Not applicable in the UI-rendering sense — this phase is API-only. The equivalent trace (does the
authorization predicate reach the actual query, not just exist as a comment) was performed above at
the artifact and key-link levels: every ownership check was confirmed to be a live SQL predicate
(`eq(...)`, bound parameter) inside the `.where()` clause that produces the response, not a
post-hoc filter or a dead helper.

### Behavioural Spot-Checks / Targeted Test Runs

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| CR-04 fieldMapping.ownerId refusal | `vitest run --config vitest.db.config.ts crm-ownership.db.test.ts` | 31/31 passed | PASS |
| CR-05 matcher owner-scope + SEC-48-A read-scope | `vitest run --config vitest.db.config.ts trigger-owner-scope.db.test.ts runs-owner-scope.db.test.ts` | 30/30 passed | PASS |
| SC-1/SC-2/SC-3/CR-01/WR-08/WR-09/CR-03 behavioural proofs | `vitest run --config vitest.db.config.ts activities-scope.db.test.ts stages-scope.db.test.ts import-owner-scope.db.test.ts` | 86/86 passed | PASS |
| Q10 regression gate + OpenAPI error-coverage gate | `vitest run route-authorization.test.ts openapi-error-coverage.test.ts` | 137/137 passed | PASS |
| Tree state matches measured baseline | `git log --oneline -5`, `git diff --exit-code` | HEAD `195c7c4`, clean | PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` files exist for this phase; none are declared in the PLAN/SUMMARY
files. SKIPPED — no runnable probe entry points for this phase's convention.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| SEC-01 | 48-01, 48-02, 48-05, 48-06, 48-08, 48-09, 48-10 | activities IDOR + list scope | SATISFIED | Truths 1, 2, 3, 8 above |
| SEC-02 | 48-03, 48-04, 48-05, 48-07, 48-08, 48-09, 48-10 | stages GET expand bug | SATISFIED | Truths 4, 8 above |
| QG-03 | 48-04, 48-07, 48-09, 48-10 | raw `IN` array fragment removed | SATISFIED | Truth 5 above |

`REQUIREMENTS.md` traceability table lists exactly these three IDs against Phase 48 (`SEC-01`,
`SEC-02`, `QG-03`, all currently `[ ]` "Pending" boxes — correctly still unchecked, since checking
those boxes is a milestone-level bookkeeping act outside this phase's own artifacts). No orphaned
requirement IDs: every plan's `requirements:` frontmatter field draws only from this set of three,
and all three are accounted for across the ten plans (`grep` of every `48-*-PLAN.md`'s
`requirements:` line, shown in the transcript this verification ran).

### Anti-Patterns Found

`grep -n -E "TBD|FIXME|XXX"` against the thirteen files most central to this phase's claims
(activities/stages routes, `stage-scope.ts`, `pagination.ts`, `crm.ts`, `matcher.ts`,
`import/actions.ts`, both `workflows/.../runs` routes, both test gate files) returned **zero
matches**. No debt-marker gate violation.

Two INFO-level documentation drifts remain, both pre-existing findings from `48-REVIEW.md`
iteration 3 (`IN-06`) that were NOT closed by the fix passes:

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/app/api/v1/stages/route.ts` | 51 | present-tense comment "`parsePagination` puts no ceiling on `offset`" is now false (WR-09 added `MAX_OFFSET`) | INFO | Documentation only, no behaviour rides on it; iteration 3 flagged this and it survived unchanged |
| `src/app/api/v1/trash/route.ts` | 67 | comment "`parsePagination` … deliberately leaves `offset` unbounded" is now false for the same reason | INFO | Same as above — the stated relationship with `MAX_TRASH_API_OFFSET` is inverted but behaviour is unaffected |

These do not affect SEC-01/SEC-02/QG-03 and are not must-haves; noted for completeness because the
task explicitly asked to check for stale claims. They are the one item from iteration 3's finding
list that genuinely was not acted on.

### Human Verification Required

None. This phase is entirely `/api/v1` route + engine-layer behaviour, verifiable by direct HTTP/DB
assertion. No UI, no visual, no real-time, no external-service surface was touched.

### Gaps Summary

No gaps against the three requirements this phase owns. The phase's own process — plan, then a
code-review loop that ran four iterations deep — is unusual for how much it found AFTER the
original 10-plan sign-off (`48-10-SUMMARY.md`'s "26/26 DELIVERED, SC-1…SC-5 PROVED"): two more
criticals (CR-04, CR-05) that directly contradicted a written closure claim in `deferred-items.md`
and `BACKLOG.md` ("the engine can no longer read, write, delete or emit another owner's row"), plus
a third defect (SEC-48-A, the `workflows/.../runs` read scope) that had been deliberately deferred
out of the original phase boundary and was subsequently closed anyway once CR-05 made it urgent.

All three were independently re-verified in this pass, not taken on the record's word:

- **CR-04** (fieldMapping.ownerId can move a deal into a victim's account): fixed at
  `src/lib/execution/actions/crm.ts:287` (`FORBIDDEN_MAPPING_KEYS`), proven by
  `crm-ownership.db.test.ts`'s CR-04 describe, re-run here and green (31/31).
- **CR-05** (every active workflow read every other user's CRM writes): fixed at
  `src/lib/triggers/matcher.ts:254-258` (owner-scoped, not actor-scoped, with a documented reason
  for the distinction), proven by `trigger-owner-scope.db.test.ts`, re-run here and green.
- **SEC-48-A** (the read half of CR-05 — `workflows/{id}/runs` and `.../runs/{runId}` were
  existence-only reads): fixed at both route files, proven by `runs-owner-scope.db.test.ts`,
  re-run here and green, and the regression gate's inverted-polarity control was correctly deleted
  and replaced by a named "neither flagged nor exempt" cell rather than silently dropped.

The records that had asserted the false closure (`deferred-items.md` DEF-48-05, `BACKLOG.md`
SEC-48-C) were corrected IN PLACE with the false sentence struck rather than silently rewritten —
checked directly against the file content, not assumed from the task's framing. This is exactly the
"do not trust a record's word, check the code" standard this verification held every other claim to,
and the phase's own record-keeping passes it.

The two open WARNING-level findings from iteration 3 that were not full fixes (WR-13/DEF-48-08 —
the engine is now stricter than the product for deals, and WR-14) were checked individually:
WR-14 (`ALL_CRM_EVENTS` exhaustiveness) WAS fixed (`ALL_CRM_EVENT_FLAGS: Record<CrmEventName, true>`
now makes a missed event a compile error); WR-13/DEF-48-08 was a considered decision to KEEP the
stricter behaviour and record it rather than add a dangerous admin bypass, and it is genuinely
recorded in `deferred-items.md` and `BACKLOG.md` — not a residual gap for this phase.

Deliberately-deferred items (SEC-48-D's mail-relay half, DEF-48-05's six reference columns,
DEF-48-06/IMP-48-A's three importer lookups, TS-48-A, DOC-48-01's remaining 47 ungated operations,
SEC-47-A/SEC-47-B) are all real, all owned (mostly Phase 49 or explicitly unassigned), and none of
them is a SEC-01/SEC-02/QG-03 claim — they were checked against `deferred-items.md` and `BACKLOG.md`
and found honestly recorded, matching the "keep as deferred, do not fold into this phase" framing
the phase itself used.

**Verdict: passed.** The phase goal — "every `/api/v1` route that reads or writes a record decides,
per record, whether this caller may" — holds in the current code, for activities and stages
directly, and for the two collateral cross-owner paths (the workflow engine's `crm_action` node and
the CRM event trigger stream) that the code review found reaching the same boundary through a
different door. Every behavioural test cited as proof was independently re-run in this verification
and passed. No must-have is unresolved; no record asserts a closure the code does not have as of
`195c7c4`.

---

_Verified: 2026-08-26T04:15:00Z_
_Verifier: Claude (gsd-verifier)_
