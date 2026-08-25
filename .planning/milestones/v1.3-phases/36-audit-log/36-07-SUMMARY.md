---
phase: 36-audit-log
plan: 07
subsystem: api
tags: [audit, events, mutations, rest, payload-enrichment, casing]

# Dependency graph
requires:
  - phase: 36-audit-log
    plan: 02
    provides: "CrmEventPayload.previous — the optional before-row this plan fills in, and buildChanges/normaliseEventData which consume it"
  - phase: 26-workflow-events
    provides: "crmBus and the 21 emit sites this plan widens"
provides:
  - "previous populated at all 21 update/delete emit sites — 14 in src/lib/mutations/, 7 in the three inline /api/v1/{entity}/[id] routes"
  - "All 7 delete emit sites carry the full pre-write row, which is the only possible source of tombstone state since data === { id } there"
  - "previous casing matches data casing per site: snake_case at people/[id] PUT, raw camelCase everywhere else"
affects: [36-11-audit-subscriber, 36-17-timeline-source, 36-20-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Payload enrichment, not subscriber logic: the writer forwards a row it already holds; the mutation modules still know nothing about auditing (SC-5)"
    - "Optional 6th parameter on a local buildEventPayload rather than a new payload type — creates simply omit it"

key-files:
  created: []
  modified:
    - src/lib/mutations/deals.ts
    - src/lib/mutations/people.ts
    - src/lib/mutations/organizations.ts
    - src/lib/mutations/activities.ts
    - src/app/api/v1/deals/[id]/route.ts
    - src/app/api/v1/people/[id]/route.ts
    - src/app/api/v1/activities/[id]/route.ts

key-decisions:
  - "Delete sites pass the RAW camelCase row at every one of the seven, including people/[id] whose update emit is snake_case — data is `{ id }` there, which reads identically in both casings, so matching the mutation layer makes a tombstone identical whichever path deleted the row"
  - "deal.stage_changed carries previous too, on all four of its emit sites, so a co-emitted twin is never thinner than the event beside it"
  - "T-36-11 closed as no-change: neither existing subscriber forwards the whole payload"

requirements-completed: [AUDIT-01]

# Metrics
duration: 17min
completed: 2026-08-15
---

# Phase 36 Plan 07: Mutation and REST `previous` Enrichment Summary

**The pre-write row now rides along on every update and delete event — 21 emit sites across four mutation modules and three inline REST routes — at zero extra queries, because every one of those sites already read the row unprojected to check the entity existed.**

## Performance

- **Duration:** ~17 min
- **Started:** 2026-08-16T02:30:37Z
- **Completed:** 2026-08-16T02:47:35Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Four local `buildEventPayload` helpers (`deals`, `people`, `organizations`, `activities`) gained a sixth optional `previous?: Record<string, unknown>` and forward it into the returned payload. A fifth, `buildActivityEventPayload` in `api/v1/activities/[id]/route.ts`, got the same treatment — it was not named in the plan but is the same helper shape and is how that route reaches both of its emits.
- **All 7 delete emit sites in the codebase now carry `previous`** — the count 36-02 predicted, verified by enumerating every `action: "deleted"` emit under `src/lib/mutations/` and `src/app/api/v1/`: `deals.ts:484`, `people.ts:374`, `organizations.ts:335`, `activities.ts:347`, `deals/[id]/route.ts:413`, `people/[id]/route.ts:309`, `activities/[id]/route.ts:286`. This is the case that mattered most: `data` is literally `{ id }` at every one, so a delete emit that forgot `previous` would have produced an audit row with no field detail and failed silently.
- **14 update emits** in the mutation layer (6 in `deals.ts` across `updateDealMutation`, `updateDealStageMutation` and `reorderDealsMutation` — each emitting `deal.updated` plus its co-emitted `deal.stage_changed`; 1 in `people.ts`; 1 in `organizations.ts`; 2 in `activities.ts` counting the completion toggle) and **4 update emits** in the REST routes now carry the before-row.
- **Every pre-read was confirmed unprojected** by reading each site — all are `db.query.X.findFirst({ where: ... })` with no `columns:` option. No `findFirst` needed widening, so the "zero extra queries, zero extra bytes read" claim holds exactly as the plan asserted.
- Casing discipline held per site: `people/[id]` PUT is the one snake_case emit among the seven touched, and its `previous` is `serializePerson(existing)`, not the raw row. No existing `data` expression was changed, so the two binding "do NOT harmonise the casing here (T-34-23)" comments remain true.
- **Zero audit-layer imports** in `src/lib/mutations/` — `grep -rE "@/lib/audit|audit-log|auditLog" src/lib/mutations/` returns nothing. SC-5's honest form (these modules know nothing about auditing) survives, and the 36-20 source gate will find it mechanically true.

## Task Commits

1. **Task 1: Add and forward `previous` in the four mutation modules** — `787573f` (feat)
2. **Task 2: Add `previous` at the three inline `/api/v1/[id]` routes** — `cb8c0c1` (feat)

## Files Created/Modified

- `src/lib/mutations/deals.ts` — 6th param on `buildEventPayload` with a doc comment stating why creates omit it and why deletes must not; `previousDeal` locals in all three emitting functions; 7 forwarded sites.
- `src/lib/mutations/people.ts` — same helper change; `person` forwarded at the update and delete emits.
- `src/lib/mutations/organizations.ts` — same helper change; `organization` forwarded at the update and delete emits.
- `src/lib/mutations/activities.ts` — same helper change; `activity` forwarded at the update, delete and completion-toggle emits. The toggle is what makes `completedAt: null -> <date>` visible in the audit trail at all.
- `src/app/api/v1/deals/[id]/route.ts` — one `previousDeal` local (raw camelCase, matching the existing `eventData` contract) shared by the `deal.stage_changed` and `deal.updated` payloads; `existing` on the delete emit.
- `src/app/api/v1/people/[id]/route.ts` — `serializePerson(existing)` on `person.updated` (snake_case, matching that site's `data`); raw `existing` on `person.deleted`.
- `src/app/api/v1/activities/[id]/route.ts` — 6th param on the local `buildActivityEventPayload`; `existingActivity` forwarded at both emits.

## Decisions Made

- **Delete sites pass the raw camelCase row at all seven, including `people/[id]`.** The plan's rule is that `previous` matches its site's `data` casing, and at a delete `data` is `{ id }` — identical in both casings, so the rule is satisfied either way and the choice was free. Raw was chosen so a person deleted through the REST API produces the same tombstone as one deleted through the UI. `normaliseEventData` maps `serializePerson`'s keys back to column names anyway, so the two would converge on key names regardless; what would NOT have converged is coverage, since `serializePerson` omits `deletedAt` and synthesises `full_name`. Recorded here because it is the one place this plan chose between two defensible shapes.
- **`deal.stage_changed` carries `previous` at all four of its emit sites** (`deals.ts` x3, `deals/[id]/route.ts` x1). The audit subscriber does not listen to that event, but the webhook and workflow-trigger subscribers receive the same object, and a payload that is complete on `deal.updated` and thin on its co-emitted twin is a trap for whoever reads it next.
- **`buildActivityEventPayload` in the REST route was treated as a fifth instance of the same helper**, not as an out-of-scope file. It lives in a file the plan names and is the only way that route reaches its two emits.
- **`previous` is set unconditionally in the helper return** (as `previous,` — `undefined` at create sites). `undefined` disappears on JSON serialisation and `buildChanges` reads `payload.previous ?? {}`, so a create is indistinguishable from a payload that never had the key.

## Threat Model Resolution

**T-36-11 (Information Disclosure — `previous` on the wire to webhook subscribers): resolved as NO disclosure change.** The plan asked execution to confirm whether the webhook subscriber forwards the whole payload or a projection. It forwards a projection:

- `src/lib/events/subscribers/webhook.ts:19-26` calls `triggerWebhook(payload.userId, event, payload.entity, payload.entityId, payload.action, payload.data)` — six named arguments, `payload.data` among them and `payload.previous` not. Webhook bodies are byte-for-byte unchanged by this plan.
- `src/lib/events/subscribers/workflow-trigger.ts` hands the whole payload to `matchAndFireTriggers`, but `src/lib/triggers/matcher.ts:144-151` builds an explicit named envelope (`payload.data` spread through `normalizeFormulaValues`, plus `entity`, `entityId`, `action`, `changedFields`, `userId`, `timestamp`). `previous` is not among them, so it cannot reach a workflow HTTP action either.

So no former field value crosses a network boundary as a result of this plan. It reaches durable storage only, via the audit subscriber that 36-11 will add. If a future change switches either subscriber to forwarding the payload wholesale, that change — not this one — is where the disclosure decision belongs.

**T-36-17 (payload casing mismatch producing a false change map): mitigated per site.** Each of the seven touched emit sites was read individually and its `data` expression classified before `previous` was written. Only `people/[id]:257` is snake_case; it is the only site whose `previous` is serialized. End-to-end confirmation is the 36-20 manual REST check (a one-field `PUT /api/v1/people/:id` must yield a one-key change map).

**T-36-SC:** zero packages added.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] The activities REST route has its own `buildActivityEventPayload`, not inline emits**

- **Found during:** Task 2
- **Issue:** The plan describes the three `/api/v1/[id]` routes as "emitting inline" and instructs adding `previous:` to each emit's object literal. That is true of `deals/[id]` and `people/[id]`, but `activities/[id]/route.ts:48` defines a local `buildActivityEventPayload` — a fifth twin of the mutation-layer helper — and both of its emits go through it. Adding `previous:` at the call sites without widening the helper would not have compiled.
- **Fix:** Gave the helper the same 6th optional parameter and doc comment as the four mutation-module helpers, then forwarded `existingActivity` at both call sites.
- **Files modified:** `src/app/api/v1/activities/[id]/route.ts`
- **Commit:** `cb8c0c1`

### Verified-Rather-Than-Assumed (no change needed)

- **`src/app/api/v1/organizations/[id]/route.ts` does not emit inline** — the plan asked for this to be checked. It imports `updateOrganizationMutation`/`deleteOrganizationMutation` (`:7`, called at `:115` and `:149`) and contains no `crmBus` reference at all, so it inherits `previous` from the mutation-layer change in Task 1. No edit.
- **Every pre-read at every touched site is unprojected.** The plan said to verify rather than assume, and to widen any projected `findFirst`. None were projected; no widening was needed.

**Total deviations:** 1 auto-fixed (missing critical). No architectural changes, no scope creep — the one deviation is inside a file the plan already lists.

## Issues Encountered

- `npm run lint` reports 125 pre-existing warnings across the repo (all `@typescript-eslint/no-unused-vars`), 4 of them in the three files this plan touched: unused `NextResponse` imports in `deals/[id]` and `people/[id]`, an unused `pipelines` import in `deals/[id]`, and an unused `ctx` param in `activities/[id]`. All are on lines this plan did not touch and all predate it. Left alone per the scope boundary; noted here rather than in a shared `deferred-items.md` because parallel worktree agents in this wave would conflict on that file.

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run src/lib/mutations` | 154 passed, 0 failed |
| `npx vitest run src/app/api/v1` | 73 passed, 0 failed |
| `npx vitest run src/lib/mutations src/app/api/v1 src/lib/audit src/lib/events` | 267 passed, 0 failed |
| `npm run typecheck` | exit 0 |
| `npm run lint` | 0 errors (125 pre-existing warnings, none new) |
| `grep -c previous src/lib/mutations/deals.ts` | 13 (criterion: >= 8) |
| `grep -c previous src/app/api/v1/people/[id]/route.ts` | 4 (criterion: >= 2) |
| `grep -c previous src/app/api/v1/deals/[id]/route.ts` | 6 (criterion: >= 2) |
| `grep -c previous src/app/api/v1/activities/[id]/route.ts` | 4 (criterion: >= 2) |
| `grep -c serializePerson src/app/api/v1/people/[id]/route.ts` | 5, was 4 — increased by exactly 1 |
| `grep -rn previous` on the four create routes | no matches (creates untouched) |
| `grep -rE "@/lib/audit\|audit-log\|auditLog" src/lib/mutations/` | no matches (SC-5 holds) |
| Delete emits carrying `previous` | **7 of 7** |
| `buildEventPayload` definitions per mutation module | exactly 1 each, all with `previous` in the parameter list |

## Known Stubs

None. Every emit site named by the plan is wired to a real pre-read row; nothing is hardcoded, mocked or placeholder.

## Next Phase Readiness

- **36-11 (the audit subscriber)** now has a populated `previous` on every event it will subscribe to. `buildChanges` needs no further input.
- **36-20 (verification)** can assert mechanically that `src/lib/mutations/` has no audit imports, and its manual REST check (one-field `PUT`, one-key change map) exercises the one snake_case `previous` site.
- One thing for the phase verifier: the deal-value type mismatch logged in 36-02's Issues section (`serializeDeal` emits `value` as a number, the raw row stores a string) still cannot fire, because the only snake_case deal emits remain creates and `deals/[id]` PUT emits raw camelCase on both sides. This plan did not change that.
- No blockers.

## Self-Check: PASSED

- Files verified present and modified: all 7 listed under key-files, confirmed via `git status` and `git diff --stat` on both commits.
- Commits verified in `git log`: `787573f`, `cb8c0c1`.
- No shared orchestrator artifact touched: `STATE.md` and `ROADMAP.md` are unmodified in this worktree.
- No file deletions in either commit (`git diff --diff-filter=D HEAD~1 HEAD` empty for both).

---
*Phase: 36-audit-log*
*Completed: 2026-08-15*
