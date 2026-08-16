---
phase: 36-audit-log
plan: 06
subsystem: api
tags: [audit, actor-context, asynclocalstorage, crm-events, custom-fields, server-actions, behaviour-change]

# Dependency graph
requires:
  - phase: 36-audit-log
    plan: 01
    provides: "runWithActor / AuditActor — the ALS scope every wrap site opens"
  - phase: 36-audit-log
    plan: 02
    provides: "CrmEventPayload.previous — the optional before-row this plan's new emit fills"
provides:
  - "The `user` actor kind, established at all 15 CRM server-action mutation call sites"
  - "The `user` actor kind at POST /api/custom-fields/save — the one browser write path outside /api/v1"
  - "saveFieldValues emits {entity}.updated with previous — custom-field edits become auditable at all"
  - "saveFieldValues(entityType, entityId, values, actorUserId) — the widened 4-arg contract"
affects: [36-11, 36-12, 36-17, 36-19, 36-20, webhook-subscriber, workflow-trigger-subscriber]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "The actor scope opens AFTER the session guard, never before it, so an unauthenticated call establishes no actor at all"
    - "The emit's userId comes from the caller's session as an explicit parameter, never from AsyncLocalStorage — it feeds webhook consumers and trigger templates, so it must not be silently absent"

key-files:
  created: []
  modified:
    - src/app/deals/actions.ts
    - src/app/people/actions.ts
    - src/app/organizations/actions.ts
    - src/app/activities/actions.ts
    - src/lib/custom-fields.ts
    - src/lib/custom-fields.test.ts
    - src/app/api/custom-fields/save/route.ts

key-decisions:
  - "changedFields is passed through as BARE custom-field names, not prefixed to customFields.* — createDealMutation already puts bare names there and the trigger field filter is free text matched by exact membership"
  - "The pre-read uses db.select() rather than db.query[table].findFirst() — this module has never used the relational API and its test harness does not mock it"
  - "The emit is guarded on the pre-read existing — a bogus entityId from the request body must not fabricate an event for a write that touched no row"
  - "updatedAt hoisted into a const so the emitted data carries the value actually persisted"

requirements-completed: [AUDIT-01, AUDIT-02]

# Metrics
duration: 24min
completed: 2026-08-16
---

# Phase 36 Plan 06: The User Actor and the Custom-Field Emit Summary

**Sixteen `runWithActor({ kind: "user", … })` scopes opened after — never before — the session guard that already protects each browser-facing write, plus a first-ever `crmBus` emit in `saveFieldValues` carrying both the before row and the after row, which is what makes the application's busiest edit surface auditable at all.**

## Performance

- **Duration:** ~24 min
- **Started:** 2026-08-16T02:33Z
- **Completed:** 2026-08-16T02:57Z
- **Tasks:** 3
- **Files modified:** 7 (0 created, 7 modified)

## Behaviour Change (deliberate, user-approved — read this section)

**Custom-field-only saves now fire webhooks and workflow triggers for the first time.**

Until this plan, `POST /api/custom-fields/save` emitted no `crmBus` event whatsoever. Editing a custom field on a record detail page was invisible to every bus subscriber: no webhook delivery, no workflow trigger evaluation, no audit capture. `saveFieldValues` now emits one `{entity}.updated` event per successful save.

The consequences, stated plainly rather than buried:

- **Existing workflows may begin reacting to saves they previously never saw.** Any active workflow with a `crm_event` trigger on `deal.updated` / `person.updated` / `organization.updated` / `activity.updated` and no field filter will now fire on every custom-field edit. This dataset carries **169 live custom-field definitions**, and the record-detail custom-field editor is the dominant edit surface on it.
- **Existing webhook endpoints will begin receiving deliveries** for a class of edit that never produced one.
- The event fires even when the diff is empty (a save that changes nothing still bumps `updatedAt`). The audit subscriber in 36-11 will write no row for an empty change map, but a webhook subscriber has no such guard.

This is **planned, not incidental** — the decision is `36-CONTEXT.md` § Post-Research Addendum, first bullet, and is dispositioned `accept` as **T-36-16** in this plan's threat register. It is recorded in the module doc comment on `saveFieldValues` so the next reader does not mistake the emit for a bug and remove it.

**Carried to 36-20 (phase verification):** the operational risk is a live workflow reacting to a save it never saw. Worth an explicit look at the active workflow list before this ships.

## Accomplishments

- **15 CRM server-action mutation call sites** wrapped: deals (5), organizations (3), people (3), activities (4). Every wrap opens *after* the session check that already exists in the action, so an unauthenticated call establishes no actor and any resulting write cannot borrow a plausible identity (T-36-02).
- **`userId` is `session.user.id` at all 16 sites** and nothing else — never a form field, never a search param, never a request body value (T-36-01).
- **`saveFieldValues` emits.** One `{entity}.updated` event carrying the full pre-write row as `previous` and the post-recalculation row as `data`, in raw camelCase, matching the shape `src/lib/mutations/deals.ts` emits.
- **The custom-field save route establishes its own actor.** It lives under `/api/custom-fields`, not `/api/v1`, so it never passes through `withApiAuth` and inherits nothing from 36-05 — an asymmetry now recorded in a comment at the wrap site.
- **The stale module comment is gone.** The paragraph asserting this path emits nothing "outside this phase's boundary" is replaced with the current decision, its rationale, and its accepted consequence.
- **`recalculateFormulas` untouched.** Its silence is what keeps the depth-1 formula cascade invisible to bus subscribers; `src/lib/formula-recalc.ts` is byte-identical to the base commit.

## Task Commits

1. **Task 1: the user actor at all 15 CRM server-action call sites** — `f10a440` (feat)
2. **Task 2: saveFieldValues gains a real crmBus emit carrying previous** — `f5df0c2` (feat)
3. **Task 3: the user actor at the custom-field save route** — `785f9ac` (feat)

## Files Created/Modified

- `src/app/deals/actions.ts` — 5 wraps (`createDeal`, `updateDeal`, `deleteDeal`, `updateDealStage`, `reorderDeals`).
- `src/app/organizations/actions.ts` — 3 wraps (create / update / delete).
- `src/app/people/actions.ts` — 3 wraps (create / update / delete).
- `src/app/activities/actions.ts` — 4 wraps (create / update / delete / `toggleActivityCompletion`).
- `src/lib/custom-fields.ts` — required 4th parameter `actorUserId`; one unprojected full-row pre-read; hoisted `writtenAt`; the emit; rewritten module doc comment.
- `src/lib/custom-fields.test.ts` — 28 call sites updated to the 4-arg signature via a shared `ACTOR_USER_ID` constant. No assertion changed.
- `src/app/api/custom-fields/save/route.ts` — the `runWithActor` wrap plus the 4th argument.

`src/app/notes/actions.ts` and `src/app/workflows/actions.ts` are deliberately **untouched** (0 occurrences of `runWithActor` in each): notes are not a CRM entity, neither emits a `crmBus` event, and 36-CONTEXT § Out of scope excludes auditing non-CRM entities.

## Decisions Made

- **`changedFields` is passed through unchanged, as bare custom-field names** — NOT prefixed to the `customFields.{name}` form. The plan left this to discretion conditional on what the rest of the codebase does, and the codebase has no such convention for *this* field: `createDealMutation` puts bare custom-field names straight into `changedFields`, `updateDealMutation` uses the single literal `"customFields"`, and the workflow trigger's field filter (`src/lib/triggers/matcher.ts:85-91`) is a free-text comma-separated list matched by exact membership — so a user filtering on a custom field types that field's own name. The `customFields.`-namespacing established in `src/lib/audit/diff.ts` applies to the audit **change map**, a different shape with a different consumer. The reasoning is recorded inline at the emit site.
- **The emit is guarded on the pre-read row existing.** `saveFieldValues` is reachable with an arbitrary `entityId` straight from the request body, and `db.update` against a non-existent row silently affects nothing while still returning `{success: true}`. Emitting there would push a fabricated `entityId` into every workflow trigger and webhook subscriber. The guard is orthogonal to the plan's "emit unconditionally on the success path", which is about not conditioning on recalculation success — that holds: the emit fires on the D-05 swallow path too.
- **`writtenAt` is hoisted** rather than calling `new Date()` twice, so the `updatedAt` in the emitted `data` is the value actually persisted, not one a few milliseconds later.
- **No cast is needed at any wrap site.** `runWithActor` returns `T | Promise<T>`, and `await (T | Promise<T>)` collapses to `T`. The `as` cast the 36-01 summary flagged is only required where the value is *returned* without awaiting, as in `src/lib/execution/engine.ts:108`. All 16 sites here await.
- **`getFieldValues` was kept alongside the new full-row pre-read.** Merging them would save a query on this hot path, but the plan explicitly budgets for both ("a definition query, a value read and a recalculation"). Logged below as a follow-up rather than taken unasked.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The pre-read uses `db.select()`, not `db.query[table].findFirst()`**

- **Found during:** Task 2
- **Issue:** The plan specifies `db.query[table].findFirst({ where: eq(id) })`. Two things block it. First, `src/lib/custom-fields.ts` has never used the Drizzle relational API — its `entityTables` map holds *table objects*, whereas `db.query` is keyed by the plural relation names, so a second parallel entityType→relation map would have to be introduced purely to satisfy the idiom. Second, `src/lib/custom-fields.test.ts` mocks `@/db` as `{select, update, insert}` with no `query` key at all, so a `db.query` call would throw `TypeError` in all 28 existing tests.
- **Fix:** `db.select().from(table).where(eq(table.id, entityId)).limit(1)` — unprojected, so it is a genuine full-row read on the entity's own table, which is the property the plan actually depends on. It matches the idiom this module already uses in `getFieldValues`, `getActiveFieldDefinitions` and `validateFieldValues`.
- **Files modified:** `src/lib/custom-fields.ts`
- **Verification:** `npx vitest run src/lib` — 859 passed, 0 failed, no harness change required.
- **Committed in:** `f5df0c2`

**2. [Rule 2 - Missing Critical] The emit is guarded against a non-existent entity**

- **Found during:** Task 2
- **Issue:** `entityId` arrives unvalidated from the request body and is never checked for existence. An authenticated user can POST a bogus id today and receive `{success: true}` for a write that matched no row. With the new emit unguarded, that would inject a fabricated `entityId` — and a `previous` of `undefined` — into every workflow trigger and webhook subscriber.
- **Fix:** `if (previousRow) { … crmBus.emit(…) }`. No row means no write landed, so there is nothing to audit. The existing return contract is untouched (still `{success: true}`), so no behaviour visible to the caller changed.
- **Files modified:** `src/lib/custom-fields.ts`
- **Verification:** full suite green; the test harness always returns a row, so every existing case still exercises the emit path.
- **Committed in:** `f5df0c2`

**3. [Rule 3 - Blocking] The route caller's 4th argument landed in Task 2, not Task 3**

- **Found during:** Task 2
- **Issue:** Task 2's acceptance criteria require `npm run typecheck` to exit `0`, but widening `saveFieldValues` to 4 required parameters leaves `src/app/api/custom-fields/save/route.ts` a type error until its call is updated. Task 2's own action text also says to grep every caller and update them.
- **Fix:** the route's `session.user.id` argument is part of `f5df0c2`; Task 3's commit `785f9ac` adds only the `runWithActor` wrap and its explanatory comment.
- **Files modified:** `src/app/api/custom-fields/save/route.ts`
- **Verification:** `npm run typecheck` exits 0 at both `f5df0c2` and `785f9ac`.
- **Committed in:** `f5df0c2` (argument) and `785f9ac` (wrap)

### Plan Gate Corrections (no code impact)

These two acceptance criteria are unsatisfiable as literally written. Both are counting artifacts, not defects — recorded so the 36-20 verifier does not read them as failures.

**A. `grep -c "runWithActor" {file}` is off by exactly one per file.**
The criteria expect `5 / 3 / 3 / 4`. `grep -c` counts matching *lines*, and the `import { runWithActor } from "@/lib/audit/actor-context"` statement is itself a matching line, so the literal command returns `6 / 4 / 4 / 5`. The wrap-site count is asserted instead with `grep -o "runWithActor(" | wc -l` (the import has no attached paren), which returns exactly **5 / 3 / 3 / 4 = 15**, plus **1** in the save route. `kind: "user"` sums to **15** across the four action files as specified, and **1** in the route.

**B. `grep -rc "crmBus" src/lib/formula-recalc.ts returns 0 — unchanged` is wrong about the baseline.**
That file contained one `crmBus` occurrence *before* this plan started: a doc comment at line 5 describing the ordering contract ("…strictly BEFORE `crmBus.emit(...)`, so the webhook body…"). Verified with `git show 1e4f2ed:src/lib/formula-recalc.ts | grep -c "crmBus"` → `1`. The operative half of the criterion is "unchanged", and it holds absolutely: `git diff HEAD -- src/lib/formula-recalc.ts` is empty. The file contains no `crmBus` *call*, only prose about one. Per the plan's explicit instruction, `formula-recalc.ts` was not touched.

---

**Total deviations:** 3 auto-fixed (1 missing-critical, 2 blocking) + 2 plan gate corrections.
**Impact on plan:** No scope creep — every change is inside the seven files the plan names. Deviation 2 is the only one that alters emitted behaviour, and it narrows the emit rather than widening it.

## Issues Encountered

- The worktree started at `cbf3229`, behind the assigned base `1e4f2ed`. Reset forward per the branch-check protocol; the working tree was clean, so nothing was lost. (Same drift 36-01 hit — it appears to be systematic for this phase's worktrees.)
- The worktree had no `node_modules`; symlinked from the main checkout to run vitest, tsc and eslint. The symlink is gitignored and does not appear in `git status`.
- `src/lib/custom-fields.ts` carries one pre-existing ESLint warning — `FieldConfig` is imported on line 2 and never used. It predates this plan (it is inside the repo's stable 125-warning baseline) and is out of scope under the scope-boundary rule, so it was left alone.

## Verification Results

| Gate | Result |
|------|--------|
| `npm test` (full suite) | **68 files, 1155 passed, 4 skipped, 0 failed** |
| `npm test` (rsc project) | 2 files, 8 passed, 0 failed |
| `npm run typecheck` | exit 0 |
| `npm run lint` | **0 errors**, 125 warnings — identical to the phase baseline recorded in 36-01 |
| `npx vitest run src/app` | 258 passed, 0 failed |
| `npx vitest run src/lib` | 859 passed, 0 failed |
| `npx eslint` on all 7 touched files | 0 errors (1 pre-existing warning) |
| `runWithActor(` call sites — deals / orgs / people / activities | 5 / 3 / 3 / 4 = **15** |
| `runWithActor(` in `api/custom-fields/save/route.ts` | **1** |
| `kind: "user"` across the four action files | 5 + 3 + 3 + 4 = **15** |
| `kind: "user"` in the save route | **1** |
| `runWithActor` in `notes/actions.ts`, `workflows/actions.ts` | **0** in both |
| `crmBus\.emit` in `src/lib/custom-fields.ts` | **1** |
| `previous:` in the emitted payload | present (`previous: previousRow`) |
| `deliberately emits NO` in `src/lib/custom-fields.ts` | **0** |
| `git diff HEAD -- src/lib/formula-recalc.ts` | empty — unchanged |

## Known Stubs

None. Every wrap site is a real ALS scope over a real mutation, and the emit is a real `crmBus.emit` with a fully-populated payload. Nothing is placeholdered for a later plan.

## Threat Flags

None new. This plan opens no network, file or database surface that did not already exist — it adds one `SELECT` on a table the same function already writes, and one event on an existing bus.

The three threats the plan registers are all handled as designed:

- **T-36-01 (spoofing)** — `mitigate`. All 16 actor constructions read `session.user.id` exclusively; no wrap reads a body, form field or search param. Grep-asserted at 15 + 1.
- **T-36-02 (repudiation)** — `mitigate`. Every wrap is placed after the pre-existing session guard, so an unauthenticated request establishes no actor at all and `getCurrentActor()` returns `undefined` rather than a plausible identity.
- **T-36-16 (repudiation / fan-out)** — `accept`. See the Behaviour Change section above; carried to 36-20.

## Next Phase Readiness

- **36-11 (the audit subscriber)** now receives a `user`-kind actor on every browser-originated CRM write, including custom-field saves. The `undefined → "system"` mapping stays its single asserted line.
- **Contract note for 36-11:** the custom-field emit's `data` is a **full row spread with the recalculated `customFields`**, so `buildChanges` sees every native key present on both sides. The 36-02 rule that skips native keys absent from `data` on updates therefore never engages on this path, and the resulting change map contains only `customFields.*` entries — which is the correct outcome for a custom-field-only save.
- **36-05** covers `/api/v1` via `withApiAuth`; this plan covers the server actions and the one session-authenticated route outside `/api/v1`. Between them the browser-facing boundary is complete.
- **Follow-up (not a blocker):** `saveFieldValues` now issues both `getFieldValues` (projected `customFields`) and the new unprojected full-row read. The former is derivable from the latter, so one query could be removed from the application's busiest write path. Deliberately not done here — the plan budgeted for both reads, and collapsing them is a change to the CFUI-02 return path that deserves its own gate.
- No blockers.

## Self-Check: PASSED

Files verified present:

- `src/app/deals/actions.ts` — FOUND
- `src/app/people/actions.ts` — FOUND
- `src/app/organizations/actions.ts` — FOUND
- `src/app/activities/actions.ts` — FOUND
- `src/lib/custom-fields.ts` — FOUND
- `src/lib/custom-fields.test.ts` — FOUND
- `src/app/api/custom-fields/save/route.ts` — FOUND
- `.planning/phases/36-audit-log/36-06-SUMMARY.md` — FOUND

Commits verified in `git log`:

- `f10a440` — FOUND
- `f5df0c2` — FOUND
- `785f9ac` — FOUND

No shared orchestrator artifact touched: `STATE.md` and `ROADMAP.md` are unmodified in this worktree.

---
*Phase: 36-audit-log*
*Completed: 2026-08-16*
