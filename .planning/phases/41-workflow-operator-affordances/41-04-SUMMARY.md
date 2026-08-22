---
phase: 41-workflow-operator-affordances
plan: 04
subsystem: infra
tags: [documentation, deployment, horizontal-scaling, workflow-engine, webhook-response, postgres-locking]

# Dependency graph
requires:
  - phase: 41-workflow-operator-affordances
    provides: the A3 amendment naming two unsafe components, and the RESEARCH mechanism read for each
provides:
  - the multi-instance safety matrix for the workflow engine's background processors, in vercel.md and docker.md
  - the narrowed SAFE claim (pending claim + schedule claim + stale reclaim only), each verdict cited to file and line
  - the webhook-response constraint documented with its actual observed symptom, not a paraphrase
  - the two WFOPS-03 alerting gaps recorded where an operator will read them
  - a PM2 cluster-mode cross-reference in bare-metal.md
affects: [41-12 (the processWaitingRuns fix this doc says shipped), any future phase that changes a claim path]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "vercel.md is the canonical copy of the scaling matrix; docker.md carries the matrix but points at vercel.md for the alerting-gap prose; bare-metal.md carries only a pointer"

key-files:
  created: []
  modified:
    - docs/admin/deployment/vercel.md
    - docs/admin/deployment/docker.md
    - docs/admin/deployment/bare-metal.md

key-decisions:
  - "The waiting-resume row is written as history-plus-fix ('Safe — repaired in this release'), not as a live warning, because plan 41-12 applies the transaction wrapper plus the WHERE status='waiting' guard in this same phase. Both docs also tell a reader on a pre-release build to treat delay resume as unsafe, so the row stays true in either direction."
  - "No test gate was added for these docs — CONTEXT locks this ('a docs-presence grep mostly obstructs rewording'). The absence is deliberate, not an oversight."
  - "The webhook-response symptom was corrected against source: the multi-replica failure mode is the caller silently receiving the fallback 200 acknowledgement, NOT a 30-second hang. The 30-second cap is documented as the pending promise's ceiling, which is what it actually is."
  - "instrumentation.ts is at the repository root, not src/instrumentation.ts as the plan cited. Both docs use the real path."
  - "The SAFE claim is narrowed to three named components and scoped to the workflow engine's background processors; REQUIREMENTS.md's looser wording ('execution claims are already multi-instance safe') is deliberately not repeated."

patterns-established:
  - "Every verdict in the matrix carries a file:line citation, so a future reader can re-verify rather than trust the doc."

requirements-completed: [WFOPS-04]

# Metrics
duration: 18min
completed: 2026-08-22
---

# Phase 41 Plan 04: Multi-Instance Safety Matrix Summary

**A five-row, source-cited safe/unsafe matrix in `vercel.md` and `docker.md` that names both unsafe components, narrows the SAFE claim to the pending claim, the schedule claim and the idempotent stale reclaim, and gives the operator one rule: scale freely unless the workflow uses a Webhook Response node.**

## Performance

- **Duration:** ~18 min
- **Tasks:** 2
- **Files modified:** 3 (markdown only — zero source files)

## Accomplishments

- `vercel.md` gained `### Horizontal Scaling and the Webhook-Response Constraint`, placed between `### Cold Starts` and `## Updating`, in the file's own `**Problem**:` / `**Solution**:` idiom. It carries the five-row matrix (safe rows first), the operational rule, the `**Known alerting gaps**` sub-list, and the replay consequence.
- `vercel.md`'s top-of-file `### Limitations` list gained exactly one bullet linking to that section — the list is now 5 bullets, was 4.
- `docker.md` gained `### Horizontal Scaling` under `## Production Considerations`, opening with `docker compose up -d --scale app=2` and then the constraint. Same five-row matrix, shorter framing, alerting gaps compressed to one sentence with a pointer to vercel.md so the prose has one canonical home.
- `docker.md` explicitly states that scaling `postgres` is a different question and out of scope for that section.
- `bare-metal.md` gained exactly one sentence in `#### Start with PM2`, naming `pm2 start … -i max` and pointing at `docker.md#horizontal-scaling`. No matrix of its own.
- Every verdict was re-read from source in this worktree before being written, at each of the five cited locations.

## Task Commits

1. **Task 1: The matrix in vercel.md, plus the top-of-file Limitations bullet** — `ef56991` (docs)
2. **Task 2: The matrix in docker.md, and the bare-metal.md cross-reference** — `a76b3b3` (docs)

## Files Created/Modified

- `docs/admin/deployment/vercel.md` — the canonical copy of the matrix, the Problem/Solution prose, the alerting gaps, the replay note, and one new Limitations bullet
- `docs/admin/deployment/docker.md` — the matrix framed around `--scale app=2`, with the `postgres` scope exclusion and a pointer to vercel.md
- `docs/admin/deployment/bare-metal.md` — one PM2 cluster-mode cross-reference sentence

## The exact headings used

| File | Heading | Position |
|---|---|---|
| `docs/admin/deployment/vercel.md` | `### Horizontal Scaling and the Webhook-Response Constraint` | under `## Limitations and Workarounds`, after `### Cold Starts`, before `## Updating` |
| `docs/admin/deployment/docker.md` | `### Horizontal Scaling` | under `## Production Considerations`, between `### Resource Limits` and `### Backup Strategy` |
| `docs/admin/deployment/bare-metal.md` | *(no new heading)* | one sentence inside the existing `#### Start with PM2` |

Anchor links used: `vercel.md#horizontal-scaling-and-the-webhook-response-constraint` (from docker.md and from vercel's own Limitations list) and `docker.md#horizontal-scaling` (from bare-metal.md). Renaming either heading breaks the other file's link.

## The matrix as written (both docs)

| Component | Verdict | Cited at |
|---|---|---|
| Schedule processor claim | Safe | `src/lib/triggers/schedule-processor.ts:65-74` |
| Execution processor **pending** claim | Safe | `src/lib/execution/execution-processor.ts:115-133` |
| Stale-run reclaim | Safe | `src/lib/execution/execution-processor.ts:87-95` |
| Execution processor **waiting** resume | Safe — repaired in this release (was unsafe) | `src/lib/execution/execution-processor.ts:162-169` |
| **Webhook Response** node | Unsafe — no fix this release | `src/lib/execution/actions/webhook-response.ts:15`, `src/app/api/webhooks/in/[workflowId]/[secret]/route.ts:98-144` |

## Decisions Made

**The `waiting resume` row is history-plus-fix, and this is load-bearing.** Plan 41-12 (a later wave in this phase) applies the transaction wrapper plus the `WHERE status = 'waiting'` guard to `processWaitingRuns`. Both docs therefore read `**Safe — repaired in this release**`, describe the original defect in the Why column, and add an escape hatch for readers on older builds ("On a build from before this release, treat delay resume as unsafe"). Consequence for a reviewer: **if 41-12 does not merge, both docs become wrong.** The dependency runs this direction on purpose — CONTEXT A3 rejected publishing a live warning that 41-12 would immediately falsify.

**No test gate was added, deliberately.** No docs-presence grep, no heading grep, no addition of these files to any source-scan gate. CONTEXT: *"A docs-presence grep mostly obstructs rewording. This repo gates heavily and deliberately, and this is the case where it should not."* A later reviewer looking for a gate here should stop looking — the absence is the decision. The two `node -e` structural checks in the plan were run as one-off verification during execution and were intentionally not persisted as test files.

**The SAFE claim is narrowed and scoped twice over.** Narrowed to three named components; scoped, in the opening sentence of both sections, to the workflow engine's background processors with an explicit "not a claim about the rest of the application". REQUIREMENTS.md's phrasing was not copied. The email processor's `reminder_sent_at` race (A3's sibling finding) is neither mentioned nor implied safe.

**No fix was proposed for the promise map.** No LISTEN/NOTIFY, no Redis, no runtime guard, no startup warning — verified absent by grep in both new sections. REQUIREMENTS.md § Out of Scope fences this.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The plan's webhook-response failure symptom did not match the source**

- **Found during:** Task 1
- **Issue:** The plan's `<action>` prose said the caller's request "hangs until a 30-second timeout before falling back to a generic acknowledgement". Reading `src/app/api/webhooks/in/[workflowId]/[secret]/route.ts:98-144` against `src/lib/triggers/create-run.ts:65-73`, that is not the multi-replica path. The route calls `claimWorkflowRun(run.id)` and, on success, calls `executeRun` **inline in the same process** — so the pending promise and the node resolution are always co-located when the route wins the claim. The actual multi-replica failure is that another replica's execution processor wins the `pending` claim first: the route then returns `{ ok: true, run_id }` **immediately** (route.ts:105-111), and the other replica's `sendWebhookResponse` misses the map and records `sent: false`. No 30-second hang occurs on that path. Publishing the hang as the symptom would have had an operator watching for latency that never appears while the real failure — a silent wrong response body and status code — went unnoticed. This is precisely the "confidently wrong is worse than absent" failure the plan's own threat model (T-41-18) exists to prevent.
- **Fix:** Both docs describe the real symptom (the caller receives the generic 200 acknowledgement instead of the configured status and body, undetectable from the response) and present the 30-second value as what it actually is: the ceiling on the handler's pending promise, i.e. the longest that request will ever wait.
- **Files modified:** `docs/admin/deployment/vercel.md`, `docs/admin/deployment/docker.md`
- **Verification:** mechanism re-read at `webhook-response.ts:15,26-61`, `route.ts:96-149`, `create-run.ts:65-73`; the plan's own `node -e` check still prints `ok` (the string `30` is still present)
- **Committed in:** `ef56991`, `a76b3b3`

**2. [Rule 1 - Bug] `src/instrumentation.ts` does not exist; the file is at the repository root**

- **Found during:** Task 1
- **Issue:** The plan cited `src/instrumentation.ts:27-42` as where the processors start. There is no such file at any commit — `git ls-tree` puts `instrumentation.ts` at the repository root. A doc citing a path that does not exist invites a reader to conclude the whole matrix is stale.
- **Fix:** Both docs cite `instrumentation.ts` (lines 27-31 — `startScheduleProcessor` and `startExecutionProcessor`, the two registrations that produce all four background loops; `startExecutionProcessor` runs the reclaim, the pending drain and the waiting resume in one tick, `execution-processor.ts:35-56`).
- **Files modified:** `docs/admin/deployment/vercel.md`, `docs/admin/deployment/docker.md`
- **Verification:** `git ls-tree -r --name-only HEAD | grep instrumentation` → `instrumentation.ts`; contents read and the two registrations confirmed at lines 27-31
- **Committed in:** `ef56991`, `a76b3b3`

**3. [Rule 3 - Blocking] Worktree was based on a stale commit**

- **Found during:** setup, before Task 1
- **Issue:** `git merge-base HEAD dc377c5` returned `aa01de2` — the worktree branched from an ancestor of the required base, so the phase-41 planning documents this plan reads were absent.
- **Fix:** `git reset --hard dc377c5` per the executor's own worktree-base correction step; verified `HEAD == dc377c5` before touching anything.
- **Files modified:** none
- **Verification:** `git rev-parse HEAD` → `dc377c5ba72401f9257213dc030e9325528c765c`
- **Committed in:** n/a (setup)

---

**Total deviations:** 3 auto-fixed (2 accuracy bugs in the plan's own prose, 1 blocking setup issue)
**Impact on plan:** Both accuracy fixes were mandatory rather than optional — this plan's entire stated purpose is that a wrong claim here is worse than no claim, and both corrections were verified against source before being written. No scope creep; the section structure, placement, row set and wording style follow the plan exactly.

## Issues Encountered

The `rtk` grep/find wrapper elides and re-numbers output, which made heading-offset discovery unreliable. Worked around it by reading exact line ranges with `awk 'NR>=x && NR<=y'` and by using the Read tool for the doc slices. No impact on the result — every citation in the matrix was confirmed with an exact-line print.

## Verification

- Task 1 structural check: `ok`. Task 2 structural check: `ok`.
- `### Horizontal Scaling and the Webhook-Response Constraint` sits between `### Cold Starts` and `## Updating` — confirmed by index comparison.
- Both new sections contain exactly 5 matrix body rows — confirmed programmatically.
- `docker.md`'s section sits between `## Production Considerations` and `## Updating` — confirmed by index comparison.
- `bare-metal.md` contains no markdown table anywhere — confirmed.
- No `LISTEN`, `NOTIFY` or `Redis` in either new section — confirmed by regex.
- No `sudo`, password, secret or `DATABASE_URL=` value on any added line — confirmed with `git diff -U0 | grep '^+'`.
- `git diff --name-only dc377c5..HEAD` lists exactly 3 files, all `.md`, **zero code files** — so the baseline (3860 passed / 32 skipped + RSC 8/8, typecheck 0, lint 0 errors) is preserved by construction. No test, typecheck or lint run was needed and none was run.
- No test file added or modified.

## Threat Flags

None. This plan touched only markdown and introduced no network endpoint, auth path, file access or schema change.

## Next Phase Readiness

- WFOPS-04 is delivered. Nothing downstream depends on these files.
- **One live coupling for the orchestrator to watch:** plan 41-12 must land, or the `waiting resume` row's "repaired in this release" claim is false in both docs. If 41-12 is dropped or deferred, both rows must be rewritten as live warnings before release.
- **A second, softer coupling:** whoever writes 41-12 should not restate the constraint in a third place. These two docs are the record.
- STATE.md and ROADMAP.md were **not** touched, per the parallel-executor contract.

---
*Phase: 41-workflow-operator-affordances*
*Completed: 2026-08-22*
