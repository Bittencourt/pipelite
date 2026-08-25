---
phase: 41-workflow-operator-affordances
reviewed: 2026-08-22T00:00:00Z
depth: standard
diff_base: dc377c5
files_reviewed: 30
files_reviewed_list:
  - src/lib/execution/engine.ts
  - src/lib/execution/execution-processor.ts
  - src/lib/execution/failure-alert.ts
  - src/lib/execution/types.ts
  - src/lib/execution/actions/crm.ts
  - src/lib/execution/actions/email.ts
  - src/lib/execution/actions/http.ts
  - src/lib/execution/actions/notification.ts
  - src/lib/execution/actions/webhook-response.ts
  - src/lib/triggers/create-run.ts
  - src/app/workflows/actions.ts
  - src/app/settings/notifications/actions.ts
  - src/app/settings/notifications/notification-form.tsx
  - src/lib/workflows/replay.ts
  - src/lib/workflows/runs-filter.ts
  - src/db/schema/workflows.ts
  - src/db/schema/notification-preferences.ts
  - drizzle/0019_concerned_runaways.sql
  - drizzle/meta/0019_snapshot.json
  - drizzle/meta/_journal.json
  - src/app/workflows/[id]/runs/[runId]/page.tsx
  - src/app/workflows/[id]/runs/[runId]/components/replay-run-button.tsx
  - src/app/workflows/[id]/edit/page.tsx
  - src/app/workflows/[id]/edit/workflow-editor.tsx
  - src/app/workflows/[id]/edit/components/toolbar.tsx
  - src/app/workflows/[id]/edit/components/dry-run-dialog.tsx
  - src/app/workflows/[id]/runs/page.tsx
  - src/app/workflows/[id]/runs/components/runs-table.tsx
  - src/app/workflows/[id]/runs/components/status-filter.tsx
  - src/app/workflows/[id]/runs/components/dry-run-badge.tsx
  - src/app/workflows/[id]/components/recent-runs-mini.tsx
  - src/lib/email/templates/index.ts
  - src/lib/email/templates/workflow-failed.ts
  - src/messages/en-US.json
  - src/messages/pt-BR.json
  - src/messages/es-ES.json
  - docs/admin/deployment/docker.md
  - docs/admin/deployment/vercel.md
  - docs/admin/deployment/bare-metal.md
findings:
  critical: 1
  warning: 6
  info: 6
  total: 13
status: findings
fixed_at: 2026-08-22
fix_scope: critical_warning
fixed:
  critical: 1
  warning: 6
  info: 1
  total: 8
fix_status: all_in_scope_fixed
fix_baseline: 4406 passed + RSC 8/8 · typecheck 0 errors · lint 0 errors / 122 warnings
---

## Fix Disposition (2026-08-22)

Scope: **Critical + Warnings.** The six Info findings were out of scope; IN-01 was taken because a
Warning fix already had the file open. Every fix is one commit, each with a RED count recorded in its
message.

| Finding | Disposition | Commit |
|---------|-------------|--------|
| CR-01 | **fixed** — the origin's `dry_run` is selected and carried into `createWorkflowRun` | `681800d` |
| WR-01 | **fixed** — the run transition is a second guarded claim, `continue` on refusal | `85a4ef8` |
| WR-02 | **fixed** — `dry_run` emitted AND hidden from the list by default (`?dry_run=true` opts in) | `81bbf5d` |
| WR-03 | **fixed** — `RunStatsCard` excludes test runs | `7c7064f` |
| WR-04 | **fixed** — deadline checked first, both server-action calls wrapped, replay button too | `e6d6ef0` |
| WR-05 | **fixed** — `buildRunsListHref` carries the whole filter, round-trip asserted | `57589bb` |
| WR-06 | **fixed** — the claim returns the displaced value; a failed send releases the window | `8682532` |
| IN-01 | **fixed** (free) — the unused `sql` import went with WR-05, same file | `57589bb` |
| IN-02 … IN-06 | **not fixed** — out of the requested scope (Critical + Warnings only) | — |

**Baseline after the fixes:** 4406 passed (4363 + 43 new tests) / RSC 8/8 · typecheck 0 errors ·
lint 0 errors, 122 warnings. The warning count is the clean-tree 123 minus IN-01; the two Phase 38
UAT `.mjs` warnings are absent because untracked files do not exist in the fix worktree.

### Notes where a fix departed from, or went beyond, the review's suggestion

- **CR-01 — the confirm copy was deliberately NOT changed, and this is the one thing left open.**
  `replay.confirmBody` still says "their emails, outgoing requests and record changes happen a second
  time", which is now false for a replay of a test run: it stays a test run, so all of that is
  simulated. Reusing any existing string would be dishonest, and a new key cannot be added silently —
  the locale contract is an exact-contract `toEqual` against `REQUIRED_WORKFLOWS_KEYS`, so an honest
  fix is `workflows.replay.confirmBodyDryRun` (or similar) added to that array, to all three locales,
  and selected by `run.dryRun` at the render site. The mitigation that exists today: the page the
  button sits on is already badged "Test run", and the copy errs toward *over*-stating consequence,
  which is the safe direction. **Recommended as a follow-up, not left as a silent gap.**
- **WR-02 — both halves, not one.** Filtering alone leaves an opted-in consumer unable to tell test
  runs apart; marking alone leaves every existing integration counting them. The default is
  back-compatible because `dry_run` is `NOT NULL DEFAULT false`, so no pre-phase run disappears.
  `replayed_from_run_id` was deliberately left unexposed — a diagnostic link with no API consumer, and
  widening the public contract further is not part of this finding. 41-01's exact-object `toEqual`
  expectation was updated in the same commit: it asserted the omission was correct, and the omission
  is what changed.
- **WR-04 — also fixed in `replay-run-button.tsx`**, which the finding cited as having the same gap.
  41-14's deliberate design is intact: the absolute deadline is still captured at launch and held in
  `WaitState`, `pollRunId`/`pollDeadline` are still derived during render, and every `setState` is
  still inside the poll callback.
- **WR-05 — the href builder lives in `runs-filter.ts`, not in the component.** That module exists
  because two ends must agree on this vocabulary byte for byte; a third end that WRITES it belongs
  beside them, and it makes the fix assertable as a round-trip property
  (`parse(build(filter)) === filter`) rather than as a string match.
- **WR-06 — the claim is still a single atomic guarded UPDATE with no preceding SELECT.** The
  displaced value comes back via a `FROM workflows AS prev` self-join against the pre-update snapshot,
  and the release is guarded on the exact value this caller wrote. Both timestamps cross as TEXT
  (`to_char … 'US'`), because postgres-js truncates postgres's microseconds into a JS `Date` and a
  guard built from that `Date` would match zero rows — a silent no-op that would have looked like a
  working fix. Both statements were verified against the live database on a temp table in a
  rolled-back transaction.
- **Two test-support changes that are corrections, not weakened assertions.** (1)
  `execution-processor.test.ts`'s `makeUpdateChain` had a single positional `.returning()` queue,
  which mis-attributed results as soon as a second claim existed; it now keeps one queue per claim
  kind, discriminated by the `set` payload, and the one assertion that read a bare call count now
  reads `stepClaimCount`. (2) `serialize-run.test.ts`'s exactness is preserved — `dry_run` was added
  to the expectation and `replayed_from_run_id` is still asserted absent. No existing assertion was
  relaxed to make a fix pass.
- **No migration, no `npm install`, no Docker restart.** The only database contact was a read-only
  syntax/semantics check inside `BEGIN … ROLLBACK` on a temp table.

# Phase 41: Code Review Report

**Reviewed:** 2026-08-22
**Depth:** standard (per-file, with cross-file tracing of the dry-run flag, the run-listing queries and the alert call graph)
**Files Reviewed:** 30 non-test source files + 3 docs + 3 locale files
**Status:** issues_found

## Summary

The four affordances are implemented largely as specified, and the three properties the phase most
depended on hold under adversarial reading:

- **The five dry-run gates are complete and correctly placed.** `crm.ts` gates all three switch arms
  (329, 349, 368) after `interpolateDeep`/`resolveTargetId`, the `default:` arm throws, so there is no
  fourth path; `email.ts:87` sits below recipient resolution and above the only `safeSend`; `http.ts:103`
  sits below `validateUrl` (no SSRF bypass) and above the retry loop; `notification.ts:53` gates the
  in-loop `safeSend` and `webhook-response.ts:137` gates `sendWebhookResponse`. `transform.ts` builds
  its sandbox input as `{ trigger, nodes }` explicitly, so `_dryRun` never reaches QuickJS. No
  early-return or alternate path bypasses a gate. `context._dryRun` is derived from the column at the
  single entry to `executeRunGraph` (`engine.ts:179`) and never read from the persisted blob.
- **The throttle claim is genuinely atomic.** `claimFailureAlert` (`failure-alert.ts:56-69`) is a single
  guarded `UPDATE … WHERE id = $1 AND (failure_alert_sent_at IS NULL OR … < NOW() - make_interval(mins => $2)) RETURNING id`
  with no preceding `SELECT`, and the window is a bound parameter, not an interpolated `INTERVAL '…'`
  literal — no injection surface, and two ticks cannot both send. Every alert call site is behind
  `alertOnRunFailure`, which `await`s inside a `try`, so neither a rejection nor a synchronous throw can
  abort a processor tick.
- **The A3 fix is real.** `processWaitingRuns` now claims inside `db.transaction` with a
  `WHERE status = 'waiting'` predicate on the step `UPDATE` and `continue`s (not `break`s) on a lost
  claim. Two replicas cannot resume the same delayed step.
- **The migration is correct and live.** Verified against `information_schema`: `dry_run` is
  `NOT NULL DEFAULT false`, `email_workflow_failed` `NOT NULL DEFAULT true`, both timestamps nullable.
  The snapshot and journal agree.
- **The email body escapes and truncates the run error** and is addressed only to `workflows.createdBy`.
- All 23 new `workflows.*` keys plus the `settings`/`emails` siblings exist in all three locales (968
  leaves each), every one is consumed by source, and no value contains a literal `{`/`}`.

What the review found instead is a **path by which a "test run" becomes a real one**, plus five
correctness/robustness gaps around the edges of the persisted-dry-run decision — three of them in
queries and surfaces that were not updated to know that `dry_run` exists.

None of the eight decisions listed as deliberate in the review brief are reported below.

## Critical Issues

### CR-01: Replaying a failed TEST RUN executes it FOR REAL — real email through the production relay, real CRM writes

**Files:**
- `src/app/workflows/[id]/runs/[runId]/page.tsx:195-197` (render site)
- `src/app/workflows/actions.ts:305-352` (`replayWorkflowRun`)

**Issue:** The replay control is rendered for **any** failed run, `{run.status === "failed" && ( … )}`,
with no reference to `run.dryRun` — and `replayWorkflowRun` selects only
`{ id, workflowId, status, triggerData }` (actions.ts:316-322) and calls

```ts
createWorkflowRun(input.workflowId, input.triggerEnvelope, input.depth, {
  replayedFromRunId: input.replayedFromRunId,
})
```

with **no `dryRun`**. In `create-run.ts:60-63`, `extra.dryRun` is only set when
`options?.dryRun === true`, so the key is omitted and the `NOT NULL DEFAULT false` column applies. The
replay of a dry run is therefore a **production run**.

**Concrete failure scenario (two clicks):**

1. Operator opens the editor, clicks *Test run*, submits trigger data. The workflow contains a
   `notification` node and then an `http_request` node pointed at a URL that 500s.
2. The dry run executes: the notification is simulated (`sent: false, simulated: true`), the http node
   throws, the run ends `failed`. `DryRunDialog`'s poller sees `failed` and navigates the operator to
   `/workflows/{id}/runs/{runId}` (`dry-run-dialog.tsx:235-241`).
3. That page renders `Failed` + the dashed **Test run** badge + a **Replay run** button.
4. The operator clicks Replay and confirms. `replay.confirmBody` tells them the steps run again — it
   does **not** tell them the replay is not a test, and nothing else on the page does either.
5. `createWorkflowRun` inserts a row with `dry_run = false`. The execution processor claims it,
   `engine.ts:179` sets `context._dryRun = false`, and the `notification` node now calls
   `safeSend(row.email, template)` against the real relay (`.env` `SMTP_PORT=465`, not mailhog), any
   `crm_action` node writes and emits `crmBus` events (so audit rows and downstream workflow triggers
   fire), and any `http_request` node calls out.

This is exactly the harm amendment A1 identified as the highest-severity finding of the phase, reached
by a different route. Two secondary consequences: the replayed run is not `dryRun`, so
`maybeAlertOnRunFailure` will email the workflow's author about what the operator considers a test; and
the run appears in the default (dry-runs-hidden) runs list, so the "test runs stay out of the operator's
view of production runs" property is broken by a replay.

**Fix — in the server action, not the render site.** The G-6 source-scan gate asserts the render-site
test verbatim, so `&& !run.dryRun` there would fail the gate; and 41-02's test asserts
`buildReplayRunInput` neither accepts nor returns a `dryRun` flag, so `replay.ts` must not change.
Carry the origin's flag in `actions.ts` instead — a replay of a test run stays a test run:

```ts
  const origins = await db
    .select({
      id: workflowRuns.id,
      workflowId: workflowRuns.workflowId,
      status: workflowRuns.status,
      triggerData: workflowRuns.triggerData,
      dryRun: workflowRuns.dryRun,          // ADD
    })
    …

  const run = await createWorkflowRun(input.workflowId, input.triggerEnvelope, input.depth, {
    // A replay of a TEST run is another TEST run. The recorded decision "a replay is never a dry
    // run" is about replaying a REAL run — it exists so a replay does not skip the CRM writes the
    // operator is trying to re-run. A dry origin has no such writes to skip, and promoting a test
    // into a production run from a page badged "Test run" is the A1 harm by another route.
    dryRun: origin.dryRun === true,          // ADD
    replayedFromRunId: input.replayedFromRunId,
  })
```

Refusing the replay in the action instead (`if (origin.dryRun) return { success: false, … }`) is the
other honest option, but it renders a button that always errors, because the render site cannot be
narrowed without breaking G-6.

## Warnings

### WR-01: `processWaitingRuns` resurrects a run that was cancelled by disabling the workflow

**Files:** `src/lib/execution/execution-processor.ts:277-281`; interacts with
`src/app/workflows/actions.ts:131-147` (`toggleWorkflowActive`)

**Issue:** The step claim is guarded (`status = 'waiting'`), but the run transition immediately after is
not:

```ts
await tx.update(workflowRuns)
  .set({ status: "running" as const, startedAt: new Date() })
  .where(eq(workflowRuns.id, runId))          // no status predicate
```

`toggleWorkflowActive(id, false)` sets every **run** of that workflow with `status = 'waiting'` to
`failed` with `error: "Workflow disabled while waiting"` — but it never touches the `workflow_run_steps`
row, which stays `status = 'waiting'` with its original `resume_at`. Concrete: an operator disables a
workflow that has a run parked on a 24-hour delay; the run is marked failed and the operator believes it
is dead. 24 hours later the step's `resume_at` elapses, `processWaitingRuns` claims the step (it is still
`'waiting'`, so the guard passes), flips the already-failed run back to `running` and calls `executeRun`
— every node after the delay fires on a workflow that is switched off. If the resumed run then fails, it
also produces a failure-alert email for a run the operator cancelled.

The unguarded run `UPDATE` is pre-existing, but this whole block was rewritten in this phase precisely to
make delay resume trustworthy, and the fix is one clause in the same `.where`.

**Fix:**

```ts
const resumedRun = await tx
  .update(workflowRuns)
  .set({ status: "running" as const, startedAt: new Date() })
  .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.status, "waiting")))
  .returning({ id: workflowRuns.id })

// The run was cancelled (toggleWorkflowActive marks waiting runs failed without completing their
// steps) or reclaimed while this step slept. Do not resurrect it.
if (resumedRun.length === 0) continue
```

Completing the orphaned steps in `toggleWorkflowActive` as well would close it from the other side.

### WR-02: the public API leaks dry runs into an integration's view of production runs, unmarked

**Files:** `src/app/api/v1/workflows/[id]/runs/route.ts:32-52`,
`src/app/api/v1/workflows/[id]/runs/[runId]/route.ts`, `src/lib/api/serialize.ts:198-211`

**Issue:** Every UI surface was taught about `dry_run` (`runs/page.tsx:51`, `recent-runs-mini.tsx`,
`edit/page.tsx`), but the `/api/v1` run endpoints were not: the `where` clause is
`eq(workflowRuns.workflowId, id)` (+ optional status) with no `dryRun` predicate, and `serializeRun`
emits an explicit field list that contains **no `dry_run` key**. So a test run is returned to API
consumers and is *indistinguishable* from a production run — the consumer cannot even filter it out
client-side. Concrete: a monitoring integration polling `/api/v1/workflows/{id}/runs?status=failed`
counts every failed dry run as a production failure and pages someone; a reporting job computing success
rate over `/runs` mixes test runs into the denominator. This is the same defect the phase fixed in
`recent-runs-mini.tsx`, in the one place a machine consumes it.

**Fix:** emit the flag *and* default the list to real runs:

```ts
// serialize.ts
    dry_run: run.dryRun,

// route.ts — dry runs are hidden by default, same posture as the UI list
const showDryRuns = req.nextUrl.searchParams.get("dry_run") === "true"
const conditions = [eq(workflowRuns.workflowId, id)]
if (status) conditions.push(eq(workflowRuns.status, status as WorkflowStatus))
if (!showDryRuns) conditions.push(eq(workflowRuns.dryRun, false))
const where = and(...conditions)
```

Note this changes the exact-object expectations in `src/lib/api/__tests__/serialize-run.test.ts`, which
currently assert `serializeRun` does not emit the new columns.

### WR-03: `RunStatsCard` counts test runs, directly above a list that hides them

**File:** `src/app/workflows/[id]/components/run-stats-card.tsx:37-46` (rendered at
`src/app/workflows/[id]/page.tsx:59`, immediately above `RecentRunsMini` at :60)

**Issue:** The stats query is `.where(eq(workflowRuns.workflowId, workflowId))` with no `dryRun`
predicate, while its neighbour on the same page now filters them out. Concrete: a workflow with one
successful production run and four failed test runs renders **"Total Runs 5 · Success Rate 20% · Last
Run 2m ago"** above a Recent Runs list showing a single row from three days ago. The operator's headline
health metric for the workflow is now driven by their own testing, and the discrepancy between the two
adjacent panels reads as a bug in the page.

**Fix:**

```ts
import { and, eq, count, sql } from "drizzle-orm"
…
  .where(and(eq(workflowRuns.workflowId, workflowId), eq(workflowRuns.dryRun, false)))
```

### WR-04: a rejected server action wedges the dry-run dialog permanently and leaves it polling forever

**File:** `src/app/workflows/[id]/edit/components/dry-run-dialog.tsx:207-249, 274-306`

**Issue:** Neither `await startDryRun(...)` nor `await getWorkflowRunStatus(...)` is wrapped in a
`try/catch`, and a Next.js server action **rejects** (rather than returning `{ success: false }`) on a
transport-level failure — a container restart or DB outage inside the 30-second window, a proxy hiccup,
a deploy. Two distinct consequences:

1. `handleSubmit`: the rejection propagates out of the floating promise the `onClick` created. State
   stays `{ phase: "starting" }` forever, so `running` stays `true` — Confirm and Cancel are both
   `disabled`, the Textarea is `readOnly`, the spinner never stops, and there is no path out but a page
   reload. The operator's typed trigger data is trapped behind a disabled control.
2. `poll`: the rejection escapes the async callback `setInterval` invoked, so `clearInterval(interval)`
   is never reached and the wall-clock deadline is never evaluated — the deadline check at line 243 sits
   *after* the await. The dialog then issues one request per second, forever, from every open editor tab,
   with an unhandled rejection each time.

**Fix:** check the deadline first, and catch:

```ts
    const poll = async () => {
      // FIRST, so a failing request cannot extend the budget past the deadline.
      if (Date.now() >= pollDeadline) {
        clearInterval(interval)
        setWait({ phase: "idle" })
        setOpen(false)
        toast.info(timeoutMessage)
        return
      }

      let result: Awaited<ReturnType<typeof getWorkflowRunStatus>>
      try {
        result = await getWorkflowRunStatus(workflowId, pollRunId)
      } catch {
        // A transport failure says nothing about the run; keep polling until the deadline above.
        return
      }
      …
```

```ts
    let result: Awaited<ReturnType<typeof startDryRun>>
    try {
      result = await startDryRun(workflowId, triggerJson)
    } catch {
      setWait({ phase: "idle" })      // re-enable the dialog; nothing ran
      toast.error(startFailedMessage)
      return
    }
```

`replay-run-button.tsx:87-101` has the same missing `try/catch` around `replayWorkflowRun`; it recovers
better (the transition ends and re-enables the buttons) but still surfaces no error to the operator, who
is left staring at a dialog that did nothing.

### WR-05: pagination links drop `?dryRun=1` and `?status=`, silently reverting the filter

**File:** `src/app/workflows/[id]/runs/components/runs-table.tsx:113, 127`

**Issue:** Both links are built as `` `/workflows/${workflowId}/runs?page=${page ± 1}` `` — the current
`status` and the new `dryRun` params are discarded. Concrete: an operator ticks *Show test runs* on a
workflow with 25 runs of which 8 are tests, sees "Page 1 of 2", clicks **Next** — and lands on
`?page=2` with dry runs hidden again, where the filtered set has only 17 rows and one page, so the table
renders **empty** with no pagination row at all. Nothing tells them the toggle was dropped. The
`status` case is pre-existing; `dryRun` is introduced by this phase, which is what makes the row worth
fixing now.

**Fix:** preserve the params. `StatusFilter` already imports the vocabulary constants; do the same here,
e.g. accept the parsed filter and rebuild the query string:

```tsx
// page.tsx passes the parsed values through
<RunsTable runs={runs} total={total} page={page} limit={LIMIT} workflowId={id}
           status={status} showDryRuns={showDryRuns} />

// runs-table.tsx
function hrefFor(targetPage: number): string {
  const params = new URLSearchParams()
  if (status) params.set("status", status)
  if (showDryRuns) params.set(SHOW_DRY_RUNS_PARAM, SHOW_DRY_RUNS_VALUE)
  params.set("page", String(targetPage))
  return `/workflows/${workflowId}/runs?${params.toString()}`
}
```

### WR-06: the throttle window is burned before the mail reaches the transport, so one transport error silences an hour of alerts

**File:** `src/lib/execution/failure-alert.ts:144-161`

**Issue:** `claimFailureAlert` is the last gate before the send, which is correct for the opt-out and
dry-run cases — but it also commits `failure_alert_sent_at = NOW()` before
`getWorkflowFailedTemplate` runs and before `safeSend` has done anything. Concrete: the relay refuses
one connection (or `getEmailTranslator` throws on a missing message key). `safeSend`'s rethrow is
swallowed by the `.catch` at :159, the console records it, and `failure_alert_sent_at` now says an alert
was sent. A workflow failing every 5 seconds then produces **no alert at all for the next 60 minutes**,
which is precisely the "fails silently forever" outcome WFOPS-03 exists to prevent — and the operator has
no signal that it happened.

**Fix (keeping the atomic claim, adding a compensating release):** have the claim return the previous
value and restore it when the send never happened, so a lost mail costs one window rather than an hour:

```ts
export async function claimFailureAlert(workflowId: string): Promise<{ claimed: boolean; previous: Date | null }> {
  const rows = await db.execute(sql`
    UPDATE workflows w
    SET failure_alert_sent_at = NOW()
    FROM workflows prev
    WHERE w.id = ${workflowId} AND prev.id = w.id
      AND (w.failure_alert_sent_at IS NULL
           OR w.failure_alert_sent_at < NOW() - make_interval(mins => ${FAILURE_ALERT_WINDOW_MINUTES}))
    RETURNING prev.failure_alert_sent_at AS previous
  `)
  …
}

// then, in maybeAlertOnRunFailure
safeSend(author.email, template).catch(async (error) => {
  console.error(`[failure-alert] Failed to send failure alert for run ${runId}:`, error)
  // Release the window we claimed but never used, WITHOUT clobbering a newer claim.
  await db.execute(sql`
    UPDATE workflows SET failure_alert_sent_at = ${claim.previous}
    WHERE id = ${run.workflowId} AND failure_alert_sent_at = ${claimedAt}
  `)
})
```

If the fixer judges "never double-send" to be worth an hour of silence after a transport error, that is a
defensible trade — but it must then be *recorded* at the claim site, because the current comment
("Last gate, so nobody above burns the window") reads as though nothing below it can burn it either.

## Info

### IN-01: unused `sql` import

**File:** `src/app/workflows/[id]/runs/page.tsx:5` — `sql` is imported from `drizzle-orm` and never
used (one of the repo's standing lint warnings; recorded as deferred in 41-10's summary because six
worktrees were live). This phase rewrote that import list, so it is the moment to drop it.

### IN-02: every `execution-processor.ts` line citation in the shipped deployment docs is stale

**Files:** `docs/admin/deployment/vercel.md`, `docs/admin/deployment/docker.md` (the safe/unsafe matrix)

The matrix cites `execution-processor.ts:87-95` (stale reclaim), `:115-133` (pending claim) and
`:162-169` (waiting resume). 41-04 shipped in wave 1; 41-12 then added ~120 lines to that file. Actual
positions today: reclaim `106-149`, pending claim `158-211`, waiting resume `238-308` — line 87 is a
closing brace, 115 is inside the orphaned-steps subquery and 162 is the start of the pending `UPDATE`.
41-04's own recorded rationale applies verbatim: "a doc citing a path that does not exist invites a
reader to conclude the whole matrix is stale." `webhook-response.ts:15` and
`schedule-processor.ts:65-74` are still correct. Fix: re-derive the four ranges, or cite function names
instead of line numbers so they cannot rot.

### IN-03: `processWaitingRuns` can execute the same run twice in one tick

**File:** `src/lib/execution/execution-processor.ts:252-305` — `runIds` is built per *step*, so if a run
ever has two ready `waiting` steps (a shape the engine should not produce, but nothing enforces), the run
id is pushed twice and `executeRun` is called twice sequentially, duplicating the remaining steps.
`for (const runId of new Set(claimedRunIds))` closes it for one character of risk.

### IN-04: no explicit bound on `triggerDataJson`

**File:** `src/app/workflows/actions.ts:404-425` — the payload is bounded only by Next.js's implicit
1 MB server-action body limit, and `next.config.*` does not pin `serverActions.bodySizeLimit`, so a
future config change elsewhere silently widens this trust boundary. (The rest of the hostile-payload
surface is genuinely closed: deep nesting throws `RangeError` inside `JSON.parse`, which the bare
`catch` converts to `invalidJson`; `JSON.parse` creates `__proto__` as an own property rather than
polluting `Object.prototype`; `null`, arrays and scalars are refused; and the QuickJS sandbox carries a
5 s timeout and an 8 MB memory limit.) A one-line `if (triggerDataJson.length > MAX_TRIGGER_DATA_CHARS)
return { success: false, error: "invalidJson" }` makes the bound explicit and local.

### IN-05: the raw workflow name is interpolated into a mail header

**File:** `src/lib/email/templates/workflow-failed.ts:77, 105` — `t('subject', { workflowName })` uses
the unescaped, un-stripped name. The HTML path is correctly escaped, and this matches the other nine
templates in the directory, but note that workflows are **not** owner-scoped in this product: any
authenticated user can rename another user's workflow, and that name lands in a `Subject:` header sent to
the author. Nodemailer's header encoding is the only control. Cheap to close:
`workflowName.replace(/[\r\n]+/g, " ")` before both uses.

### IN-06: the dialog can be dismissed mid-flight and will still navigate later

**File:** `src/app/workflows/[id]/edit/components/dry-run-dialog.tsx:310` — `onOpenChange={setOpen}` is
unguarded, so Esc or an outside click closes the dialog while `wait.phase === "polling"`. The effect
lives on `DryRunDialog` rather than inside `DialogContent`, so the poll keeps running and yanks the
operator to the run page some seconds later, from a dialog they deliberately dismissed. Either guard the
close (`onOpenChange={(next) => { if (!running) setOpen(next) }}`) or stop the poll on dismissal.

---

_Reviewed: 2026-08-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
