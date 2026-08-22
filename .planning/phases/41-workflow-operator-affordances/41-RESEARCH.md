# Phase 41: Workflow Operator Affordances - Research

**Researched:** 2026-08-22
**Domain:** Workflow execution engine (dry-run gating, run replay), transactional email alerting, drizzle migrations, deployment documentation
**Confidence:** HIGH — every claim below is a direct read of this repo's source at a cited line. No external library research was needed; this phase adds zero dependencies.

---

## Summary

All four requirements land inside code that already exists and is already tested. There is no new
technology, no new package, and no new architectural layer. The work is: one `ExecutionContext` flag
threaded through five action handlers, one extra column read in a `where` clause, three schema
columns (plus one this research recommends adding), one email template, and two documentation
sections. The risk in this phase is **not** difficulty — it is four specific places where the locked
decisions rest on a premise that the source does not actually support, and where an executor
following CONTEXT literally would ship something broken or misleading.

Those four places, in descending order of consequence:

1. **The execution processor has no failure path to hook.** `executeRun` never throws when a run
   fails — it calls `failRun()` internally and returns `undefined` normally (`engine.ts:551-562`).
   The `catch` in `processPendingRuns` (`execution-processor.ts:144`) only fires for *unexpected*
   exceptions. WFOPS-03's hook must therefore **detect** the failure by re-reading the run's terminal
   status after `executeRun` returns; there is nothing to "hook into" today.
2. **`notification.ts` is a fifth side-effecting handler that CONTEXT does not list.** It calls
   `safeSend` at `notification.ts:38`. A dry run of a workflow with a `notification` node would send
   a real email, contradicting the locked copy string `workflows.dryRun.description` ("*…so nothing
   leaves this app*"). It must be simulated too. This is not a new decision — it is the locked
   decision's own stated invariant applied to a file the decision-maker did not see.
3. **`processWaitingRuns` is NOT multi-instance safe**, so WFOPS-04's matrix as currently framed would
   document something false. Its `SELECT … FOR UPDATE SKIP LOCKED` (`execution-processor.ts:163-169`)
   runs outside a transaction, so the row locks drop at statement end, and the follow-up step
   `UPDATE` carries no `WHERE status = 'waiting'` guard. Two replicas can resume the same delayed run.
   The *pending* claim (`execution-processor.ts:115-133`) genuinely is safe — it is one statement.
4. **UI-SPEC gate G-6 is not implementable.** It calls for a component render test, and this repo has
   **no** `@testing-library/react`, no `jsdom`, no `happy-dom`, and zero React render tests. Every UI
   claim here is gated by *source-scan wiring tests*. G-6 must be reshaped into that idiom.

Everything else is mechanical, and two of the questions in the brief turn out to have "no change
needed" answers that are worth banking: a dry-run row **is** claimed by the existing processor with
no query change, and `webhook-response` **cannot** hang under dry run because the pending-response
map is keyed by `runId` and a dry run's id was never registered — `sendWebhookResponse` returns
`false` and never awaits (`webhook-response.ts:54-55`).

**Primary recommendation:** thread a single `_dryRun` boolean on `ExecutionContext`, set from the
`workflow_runs.dryRun` **column** (never from the persisted context JSON) at `engine.ts:164`, and have
each of the **five** side-effecting handlers do all of its resolution work and skip only its final
side effect, returning an output with the same keys as the real one. Detect run failure in the
processor by re-reading status after `executeRun`, and throttle the alert with a guarded
`UPDATE … RETURNING` on a new `workflows.failureAlertSentAt` column — which is atomically correct
under multiple replicas, the exact property WFOPS-04 is about.

---

<user_constraints>
## User Constraints (from 41-CONTEXT.md)

### Locked Decisions

**Replay (WFOPS-01)**

- **A replay creates a NEW `workflow_runs` row, not a status reset on the failed one.** The obvious
  move is to mirror `replayDelivery` (`src/app/admin/webhooks/actions.ts`), which flips a delivery
  back to `status: "pending"` and lets the processor re-claim it. That is right for a delivery, which
  IS one attempt, and wrong for a run, which owns `workflow_run_steps`. Success criterion 1 says the
  user "gets a new run with its own step history" — a reset would overwrite the evidence of why the
  first attempt failed. So: mirror the *pattern* (write a pending row, let the existing processor
  claim it — no new execution path), not the *implementation*.
- **Only `failed` runs are replayable.** Matches WFOPS-01's wording. Cancelled and completed runs get
  no replay control.
- **The replay carries the original `triggerData` verbatim, with `depth` reset to 0**, via the
  existing `createWorkflowRun(workflowId, triggerEnvelope, depth)` in `src/lib/triggers/create-run.ts`.
  No editing of trigger data before replay — that is the dry-run's job, and conflating the two would
  give the replay button a JSON editor nobody asked for.
- **A `replayedFromRunId` column links a replay to its origin.** Without it a replay is
  indistinguishable from an original run, and a replay-of-a-replay loop is undiagnosable. Note the
  interaction with `depth`: resetting depth to 0 means the recursion guard cannot see a replay chain,
  so this column is the only record that one happened.

**Dry run (WFOPS-02)**

- **"No CRM mutation" is enforced by a dry-run flag on `ExecutionContext`, with the side-effecting
  handlers returning a simulated result.** The four that must simulate: `crm` (writes records),
  `email` (sends), `http` (calls out), `webhook-response` (resolves a real waiting request).
  `transform` and `condition` run FOR REAL — QuickJS is pure and a condition that branched
  differently under dry-run would make the whole exercise a lie.
- **Transaction-rollback was considered and rejected.** It cannot contain the side effects that
  matter: a sent email and an outbound HTTP call do not roll back. A dry run that "safely" rolled
  back the database while emailing a customer would be worse than no dry run.
- **A dry run IS persisted, as a `workflow_runs` row with `dryRun: true`**, filtered out of the runs
  list by default. This is the decision that pays for itself twice: per-node output comes free from
  the existing `workflow_run_steps` + `step-detail.tsx` + `json-viewer.tsx`, and the existing
  changed-records panel (`run-changed-records.tsx`, which reads `audit_log` by run id) becomes the
  AFFIRMATIVE proof for criterion 2 — it shows zero rows, which is exactly "the user can confirm no
  CRM record changed". An ephemeral dry run would need a runId-free engine path and a new UI, and
  would prove the absence of mutation only by assertion.
- **Sample trigger data is prefilled from the workflow's most recent real run**, then editable as
  JSON in the editor. A workflow with no prior runs falls back to an empty object — the user can
  still author one by hand.
- **Presentation reuses `json-viewer.tsx` and `step-detail.tsx` unchanged.** No new per-node view.

**Failure alerting (WFOPS-03)**

- **Email, through the existing `safeSend`** (`src/lib/email/send.ts`) and a new template beside
  `src/lib/email/templates/workflow-notification.ts`. There is no in-app notification surface in this
  codebase to build on, and inventing one is a phase of its own.
- **A new `emailWorkflowFailed` boolean on `notification_preferences`, defaulting to `true`**, with
  the alert going to the workflow's `createdBy`. The table already carries exactly this shape —
  `emailDealAssigned`, `emailActivityReminder`, `emailWeeklyDigest`, all `boolean().default(true).notNull()`
  — so this is the established pattern plus one column, plus one migration.
- **Throttled to at most one alert per workflow per window.** A scheduled workflow that fails every
  tick would otherwise send hundreds of emails and get the sending domain rate-limited — the failure
  mode where the alerting system becomes the outage. `digest_log` is the precedent for
  "remember that we already sent this".
- **The hook lives in the execution processor's failure path, NOT in the engine.**
  `src/lib/execution/engine.ts` also runs synchronously for the webhook-response path, so an alert
  hooked there would fire inside a live HTTP request and put email latency on a webhook response.

**Single-instance constraint (WFOPS-04)**

- **Documented in `docs/admin/deployment/docker.md` and `docs/admin/deployment/vercel.md`** — both
  already exist. Vercel is the one that matters: a serverless platform multiplies instances by
  default, so that is where a reader is most likely to hit this.
- **A safe/unsafe matrix, not prose about one component.** UNSAFE: webhook-response, whose in-memory
  promise map only resolves in the process that created it. SAFE, and worth stating so a reader does
  not over-correct into "nothing scales": the schedule processor's atomic claim and the execution
  processor's `UPDATE ... WHERE status = 'pending'` claim.
- **No runtime guard.** Out of scope per REQUIREMENTS.md; documentation is the deliverable.
- **No test gate.** A docs-presence grep mostly obstructs rewording. This repo gates heavily and
  deliberately, and this is the case where it should not.

### Claude's Discretion

- Migration mechanics for the three schema additions (`replayedFromRunId`, `dryRun`,
  `emailWorkflowFailed`) — whether one migration or three, and their ordering.
- The exact throttle window for failure alerts.
- Where the dry-run trigger-data editor sits inside the editor UI (toolbar vs side panel).
- i18n key names, following existing namespace conventions.

### Deferred Ideas (OUT OF SCOPE)

- **Making webhook-response multi-instance safe** (e.g. moving the promise map to postgres LISTEN/NOTIFY
  or Redis). Explicitly out of scope for v1.3 per REQUIREMENTS.md; WFOPS-04 documents the constraint
  instead.
- **A startup guard that warns when a replica-count env var exceeds 1.** Considered for WFOPS-04 and
  declined as beyond the requirement. Worth revisiting if the constraint is ever hit in practice.
- **An in-app notification surface.** WFOPS-03 uses email because no in-app surface exists. Building
  one is its own phase, and would let failure alerts, deal assignment and reminders share it.
- **Editing trigger data before a replay.** Deliberately kept out of the replay control; the dry run
  is where trigger data is authored.

### Also locked: 41-UI-SPEC.md

`41-UI-SPEC.md` is an APPROVED design contract and is locked in full: 3 UI surfaces (7 rows in its
Surface Inventory), 25 new message keys, container changes R-1..R-5, verification hooks G-1..G-9,
visual hierarchy V-41-1, forbidden copy F-41-1, colour rules C-41-1/C-41-2, i18n rules L-41-1/L-41-2.
Every measured value in it was re-verified against source during this research and **all of them
hold** — with the two exceptions recorded under § Corrections to the Upstream Specs below (G-6 is not
implementable as written; two line numbers drifted).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description (REQUIREMENTS.md § Workflow Operations) | Research Support |
|----|-------------|------------------|
| WFOPS-01 | User can re-run a failed workflow run from the run detail page, mirroring the existing webhook DLQ replay pattern | § Replay: exact `createWorkflowRun` signature extension, the `depth: 0` safety analysis (Q4), the auth-posture correction, `revalidatePath` target |
| WFOPS-02 | User can dry-run a workflow from the editor against sample trigger data, seeing per-node output without mutating CRM records | § Dry Run: the `_dryRun` flag path (Q1), the five-handler simulated-output table, why the existing claim query needs no change (Q2), why webhook-response cannot hang (Q3), the delay-node hazard, the zero-audit-row proof chain |
| WFOPS-03 | User is notified when a workflow run fails — runs can currently fail silently forever | § Failure Alerting: the missing-failure-path finding, `notifyRunFailure` design, the guarded-UPDATE throttle (Q5), the two coverage gaps, the mailhog/SMTP correction |
| WFOPS-04 | The webhook-response single-instance constraint is documented in deployment docs — its in-memory promise map breaks under a second replica, while schedule and execution claims are already multi-instance safe | § Multi-Instance Safety Matrix: the verified four-row matrix, including the `processWaitingRuns` row the requirement's own wording gets wrong, and exact insertion points in both docs |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Replay a failed run | API / Backend (server action) | Database (new `workflow_runs` row) | The replay IS a database insert plus an auth check. The browser contributes only a click and a confirm. |
| Replay control visibility (`status === "failed"`) | Frontend Server (RSC) | — | `page.tsx` already has `run.status` in hand from its own query; gating in the server render means the button never reaches a browser that shouldn't have it. |
| Replay confirm dialog + pending state | Browser / Client | — | Purely interactive; no data it doesn't already hold. |
| Dry-run trigger-data authoring + JSON validation | Browser / Client | API / Backend (re-validate) | Client validates for feedback; the server action must re-validate — a client parse result is not a trust boundary. |
| Dry-run *execution* and non-mutation enforcement | API / Backend (engine + handlers) | Database (`dryRun` column) | **Critical: the enforcement point is the engine, never the client.** The client only sets a flag on a request; the column is the source of truth and the engine re-reads it on every resume. |
| Dry-run wait / poll for terminal status | Browser / Client | API / Backend (status read action) | The run-detail page is a server component with no polling; the dialog owns the wait (locked by UI-SPEC). Needs one new read-only server action. |
| Per-node dry-run output display | Frontend Server (RSC) | — | Existing `step-detail.tsx` / `json-viewer.tsx`, unchanged. |
| Non-mutation proof | Database (absence of `audit_log` rows) | Frontend Server (RSC) | The proof is the absence of rows the bus never wrote. It is a database fact rendered by an existing component, not a UI feature. |
| Runs-list dry-run filtering | Frontend Server (RSC, `where` clause) | Browser (URL param) | Filtering in SQL, not in the client: a client-side filter would still ship dry-run rows to the browser and would break pagination counts. |
| Failure detection | API / Backend (execution processor) | Database (status re-read) | The processor is the only place that knows a run reached a terminal state asynchronously. |
| Failure alert throttle | Database (guarded `UPDATE … RETURNING`) | API / Backend | Deliberately in the database: a process-local throttle is wrong for exactly the multi-replica reason WFOPS-04 documents. |
| Failure alert delivery | API / Backend (`safeSend`) | — | Existing transport. |
| Notification preference | Frontend Server (RSC read) + API (server action write) | Database (column) | Copies the three existing rows verbatim. |
| Single-instance constraint | Documentation | — | No runtime tier. Locked: "No runtime guard." |

---

## Standard Stack

**This phase adds no dependencies.** Every capability it needs is already installed and already used
by the code it touches.

### Core (all pre-existing — versions read from `package.json`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `drizzle-orm` | ^0.45.1 | schema + queries | Already the only DB layer [VERIFIED: package.json:38] |
| `drizzle-kit` | ^0.31.9 | migration generate/apply | Already the migration tool; 19 migrations in `drizzle/` [VERIFIED: drizzle/meta/_journal.json] |
| `postgres` | ^3.4.8 | PG driver (postgres-js) | `src/db/index.ts:1-13` [VERIFIED] |
| `next` | 16.1.6 | server actions, RSC | [VERIFIED: package.json] |
| `next-intl` | ^4.8.3 | the 25 new message keys | [VERIFIED: package.json] |
| `nodemailer` | ^7.0.13 | behind `safeSend` | `src/lib/email/client.ts` via `getEmailTransporter` [VERIFIED] |
| `sonner` | ^2.0.7 | `toast.success` / `toast.error` | Already used in `toolbar.tsx:10` [VERIFIED] |
| `lucide-react` | ^0.575.0 | `RotateCcw`, `FlaskConical`, `Loader2` | All three already vendored (UI-SPEC verified) [VERIFIED] |
| `vitest` | (dev) | 3 projects: default / rsc / db | `vitest.config.ts`, `vitest.rsc.config.ts`, `vitest.db.config.ts` [VERIFIED] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `_dryRun` on `ExecutionContext` | A 4th param on `ActionHandler` | Would change `registry.ts:8-12`, `actions/index.ts:22-33` and all six handler signatures plus their six test files. The context is already the per-run carrier (`_workflowUserId`, `_resume`) and already round-trips through the DB. **Rejected.** |
| Guarded `UPDATE … RETURNING` throttle | In-memory `Map<workflowId, timestamp>` | Process-local, so two replicas each send one alert — the precise defect WFOPS-04 documents. **Rejected.** |
| Guarded `UPDATE` on `workflows` | Reuse `digest_log` | `digest_log` has no workflow key at all (`id, sentAt, userCount, weekStart` — `digest-log.ts:3-8`) and its only reader queries `WHERE weekStart = thisMonday` (`email/process/route.ts:116`). Inserting failure rows there would make the weekly digest think it had already been sent. **Rejected — see Q5.** |
| Component render test for G-6 | Source-scan wiring test | The repo has no DOM test environment at all. **Source-scan is the only option without new infra.** |

### Package Legitimacy Audit

**Not applicable — this phase installs zero external packages.** No `npm install` runs, no
`package.json` change, no `npx shadcn add` (UI-SPEC § Registry Safety: "this phase adds **zero** new
shadcn components"). The Package Legitimacy Gate is therefore vacuous here; there is nothing to
slopcheck. Any plan that introduces a dependency has left the phase and must be sent back.

---

## Corrections to the Upstream Specs

Three items where the locked specs and the source disagree. None of them re-open a decision; each is
the decision's own premise not holding.

### C-1 — UI-SPEC gate G-6 is not implementable as written (HIGH severity)

G-6 says: *"component test: render with `status: "completed"` → no `replay.action` in the tree"*.

Verified: `package.json` contains **no** `@testing-library/react`, no `jsdom`, no `happy-dom`, no
`@vitejs/plugin-react`. `vitest.config.ts` sets `environment: 'node'` globally and **no file in
`src/` carries a `@vitest-environment` pragma**. There are exactly two `.rsc.test.tsx` files and they
test RSC payload boundaries, not rendered trees. This repo has zero React render tests, by
construction.

**Recommended reshaping** (same claim, repo-native idiom). The render site must be written in the
`{test && ( … )}` form, and the gate uses the existing helpers:

```ts
// src/app/workflows/[id]/runs/[runId]/__tests__/replay-visibility.test.ts
import { readStrippedSource, enclosingConditional } from "@/components/custom-fields/__tests__/source-scan"

const PAGE = "src/app/workflows/[id]/runs/[runId]/page.tsx"

it("the replay control is rendered only for failed runs — absent, not disabled", () => {
  const source = readStrippedSource(PAGE)
  const { test } = enclosingConditional(source, "<ReplayRunButton", PAGE)
  expect(test).toContain('run.status === "failed"')
  // anti-vacuity: `disabled` must not be how the non-failed case is handled
  expect(source).not.toMatch(/<ReplayRunButton[^>]*disabled/)
})
```

`enclosingConditional` throws if the marker is not inside a `{… && ( … )}` (`source-scan.ts:290-330`)
and re-verifies containment, so it cannot latch onto an unrelated branch. **Constraint on the
implementation:** the render site must use `&& (` — a ternary or an early-return variable would make
the gate throw.

### C-2 — `notification.ts` is a fifth side-effecting handler (HIGH severity)

CONTEXT enumerates four handlers to simulate. `src/lib/execution/actions/notification.ts:38` calls
`await safeSend(row.email, template)` inside a loop, registered as action type `"notification"`
(`notification.ts:51`). A dry run of a workflow containing a notification node sends real email.

This contradicts the locked copy `workflows.dryRun.description`: *"Record writes, emails and
outgoing requests are simulated, so nothing leaves this app."* Simulating `notification` is what
makes that sentence true, so it is **required by the locked spec**, not an addition to it.

Aggravating context: `.env` sets `SMTP_HOST` to a **production SMTP relay** (Resend), not mailhog.
An unsimulated notification node in a dry run sends real mail from the real sending domain.

### C-3 — Two UI-SPEC line references drifted (LOW severity)

| UI-SPEC says | Actual | File |
|---|---|---|
| R-1 at `runs/[runId]/page.tsx:145` | **line 148** (`<div className="flex items-center gap-3">`) | verified |
| R-2 at `runs/[runId]/page.tsx:152` | **line 154** (`<div className="flex items-center gap-4 text-sm text-muted-foreground">`) | verified |
| R-3 at `edit/components/toolbar.tsx:146` | **line 151** (outer row); inner cluster at **line 168**; name `Input` `max-w-[300px]` at **line 155** | verified |
| R-4 at `runs/page.tsx:78-82` | **lines 80-84** (`<div className="mb-4">`) | verified |

Every *class string* the UI-SPEC quotes is correct. Only the line numbers moved. **The source-scan
gates must key on class strings, never on line numbers.**

---

## Architecture Patterns

### System Architecture Diagram — the dry-run and replay data flows

```
 ┌── REPLAY (WFOPS-01) ───────────────────────────────────────────────────────────┐
 │                                                                               │
 │  browser: click Replay ──► confirm Dialog ──► server action                    │
 │                                              replayWorkflowRun(runId)         │
 │                                                    │                          │
 │                              auth() session check ─┤                          │
 │                              load origin run ──────┤                          │
 │                              origin.status ≠ failed ──► { success:false }     │
 │                                                    │                          │
 │                                                    ▼                          │
 │                              createWorkflowRun(workflowId,                    │
 │                                origin.triggerData verbatim,                   │
 │                                depth = 0,                                     │
 │                                { replayedFromRunId: origin.id })              │
 │                                                    │                          │
 │                                          INSERT status='pending'              │
 │                                                    │                          │
 │                              revalidatePath(/workflows/{id}/runs)             │
 │                                                    │                          │
 │                              return { success:true, runId:new }               │
 │                                                    │                          │
 │  browser: router.push(/workflows/{id}/runs/{new}) ◄┘                          │
 └───────────────────────────────────────────────────────────────────────────────┘
                                                      │
                                        (both paths converge here)
                                                      ▼
 ┌── EXECUTION (unchanged claim path) ───────────────────────────────────────────┐
 │  execution-processor tick (every 5s)                                          │
 │    reclaimStaleRuns()  ── stale 'running' ──► status='failed' ──┐              │
 │    processPendingRuns()                                          │             │
 │      UPDATE workflow_runs SET status='running'                   │             │
 │        WHERE id = (SELECT … WHERE status='pending'               │             │
 │                    AND NOT EXISTS(same workflow running|waiting) │             │
 │                    FOR UPDATE SKIP LOCKED)   ◄── dry runs match  │             │
 │        RETURNING *                                               │             │
 │            │                                                     │             │
 │            ▼                                                     │             │
 │      executeRun(runId)  ── never throws on failure ──────────────┤             │
 │            │                                                     │             │
 │            ▼  ** NEW **                                          │             │
 │      re-SELECT { status, dryRun }                                │             │
 │        status='failed' && !dryRun ──────────────────────────────► maybeAlert   │
 │    processWaitingRuns()  (same new re-read after executeRun)      │            │
 └───────────────────────────────────────────────────────────────────┼───────────┘
                                                                     ▼
 ┌── ALERT (WFOPS-03) ──────────────────────────────────────────────────────────┐
 │  notifyRunFailure(runId)                                                     │
 │    load run + workflow ──► run.dryRun? ──► return (no alert for test runs)   │
 │    read notification_preferences[workflow.createdBy]                          │
 │      no row → default true  |  emailWorkflowFailed=false → return            │
 │    UPDATE workflows SET failure_alert_sent_at = NOW()                        │
 │      WHERE id=$1 AND (failure_alert_sent_at IS NULL                          │
 │                       OR failure_alert_sent_at < NOW() - window) RETURNING id │
 │      zero rows → throttled, return                                            │
 │    getWorkflowFailedTemplate(...) ──► safeSend(...).catch(log)  ── fire&forget │
 └──────────────────────────────────────────────────────────────────────────────┘

 ┌── ENGINE INTERNALS under dry run (WFOPS-02) ─────────────────────────────────┐
 │  executeRun(runId)                                                           │
 │    load run + workflow (one join, engine.ts:92-97)                           │
 │    runWithExecutionDepth(run.depth ?? 0, …)                                  │
 │      runWithActor({ kind:'workflow_run', userId:workflow.createdBy, runId })  │
 │        executeRunGraph:                                                       │
 │          context = persisted context OR fresh from run.triggerData            │
 │          context._workflowUserId = workflow.createdBy   (line 164)            │
 │  ** NEW **  context._dryRun = run.dryRun === true       (line 165)            │
 │                        │                                                      │
 │          walk nodes ───┼──► condition ──► evaluateCondition (PURE, real)     │
 │                        ├──► delay      ──► resolveDelay → status='waiting'   │
 │                        │                    ⚠ see Pitfall 3                   │
 │                        └──► action ──► executeAction(type, config, context)  │
 │                                          │                                    │
 │                             registry lookup by actionType                     │
 │                                          │                                    │
 │            ┌─────────────────────────────┼──────────────────────────┐         │
 │            ▼                             ▼                          ▼         │
 │   javascript_transform          crm_action / email /        webhook_response  │
 │   (QuickJS; sees only           notification / http_request  (skip the map)   │
 │    {trigger,nodes} —            resolve inputs FOR REAL,                      │
 │    CANNOT see _dryRun)          skip ONLY the side effect                     │
 │            │                             │                          │         │
 │            └─────────────┬───────────────┴──────────────────────────┘         │
 │                          ▼                                                    │
 │            context.nodes[id] = { output, status }                             │
 │            workflow_run_steps row  ← the ONLY rows a dry run writes           │
 │            (plus its own workflow_runs row)                                   │
 │                          │                                                    │
 │              no mutation ⇒ no crmBus event ⇒ no audit_log row                 │
 │                          ▼                                                    │
 │            readRunChangedRecords(runId) → []  ⇒ audit.run.empty               │
 │                          = criterion 2's affirmative proof                    │
 └──────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| File | Change | Responsibility |
|------|--------|----------------|
| `src/db/schema/workflows.ts` | +3 columns | `workflowRuns.dryRun`, `workflowRuns.replayedFromRunId`, `workflows.failureAlertSentAt` |
| `src/db/schema/notification-preferences.ts` | +1 column | `emailWorkflowFailed` |
| `drizzle/0019_*.sql` | new | all four columns in ONE migration (see Q6) |
| `src/lib/execution/types.ts` | +1 field | `ExecutionContext._dryRun?: boolean` |
| `src/lib/execution/engine.ts` | +1 line (~165) | set `_dryRun` from the run column, authoritatively |
| `src/lib/execution/actions/crm.ts` | gate | skip mutation, keep interpolation + coercion + target lookup |
| `src/lib/execution/actions/email.ts` | gate | skip `safeSend`, keep recipient resolution |
| `src/lib/execution/actions/notification.ts` | gate **(C-2)** | skip `safeSend`, keep user lookup |
| `src/lib/execution/actions/http.ts` | gate | skip `fetch`, keep interpolation + `validateUrl` |
| `src/lib/execution/actions/webhook-response.ts` | gate | skip `sendWebhookResponse`, keep interpolation |
| `src/lib/triggers/create-run.ts` | +1 optional param | `options?: { dryRun?: boolean; replayedFromRunId?: string }` |
| `src/lib/execution/failure-alert.ts` | **new** | window constant, throttle claim, `notifyRunFailure` |
| `src/lib/execution/execution-processor.ts` | 3 call sites | re-read terminal status → alert |
| `src/lib/email/templates/workflow-failed.ts` | **new** | the failure template |
| `src/lib/email/templates/index.ts` | +1 export | barrel |
| `src/lib/workflows/runs-filter.ts` | **new** | pure `parseRunsSearchParams` (TDD seam) |
| `src/app/workflows/actions.ts` | +3 actions | `replayWorkflowRun`, `startDryRun`, `getWorkflowRunStatus` |
| `src/app/workflows/[id]/runs/page.tsx` | where clause + searchParams type | dry-run filter, default hidden |
| `src/app/workflows/[id]/components/recent-runs-mini.tsx` | where clause | **see Pitfall 6** |
| `src/app/settings/notifications/actions.ts` | 4 spots | zod field, default, select map, upsert |
| 6 UI files | per UI-SPEC | R-1..R-5, 3 new components |
| `src/messages/{en-US,pt-BR,es-ES}.json` | +25 keys ×3 | plus `emails.workflowFailed.*` if C-4 option A |
| `docs/admin/deployment/{docker,vercel}.md` | +1 section each | the matrix |

---

## Answers to the Seven Risky Questions

### Q1 — The dry-run flag's path through the engine

**How `ExecutionContext` reaches a handler.** One path, no branches:

```
engine.ts:253   executeAction(actionType, node.config, context, runId)     [main loop]
engine.ts:505   executeAction(actionType, node.config, context, runId)     [branch walk]
        ▼
actions/index.ts:28-32   getHandler(actionType) → handler(config, context, runId)
        ▼
registry.ts:8-12   type ActionHandler = (config, context, runId) => Promise<{output}>
```

The context object is passed **by reference** and is the same object for the whole run. `_workflowUserId`
already rides on it (`engine.ts:164`), and so does `_resume` (`engine.ts:43`). This is the established
carrier. **No signature changes anywhere.**

**Where the flag is set — and why the column, not the JSON.** Add to `types.ts`:

```ts
export interface ExecutionContext {
  trigger: { type: string; data: Record<string, unknown> }
  nodes: Record<string, { output: Record<string, unknown>; status: "completed" | "failed" | "skipped" }>
  /** User ID of the workflow creator, used by CRM actions for mutation calls */
  _workflowUserId?: string
  /** True when this run is a dry run: side-effecting handlers simulate instead of acting. */
  _dryRun?: boolean
}
```

Set it in `executeRunGraph`, immediately after line 164:

```ts
  // Set workflow creator userId for CRM action mutations
  context._workflowUserId = workflow.createdBy

  // Dry-run gating. Read from the COLUMN, never from the restored context JSON.
  // executeRunGraph restores `context` from run.context on a delay resume (line 152-161),
  // and that JSON is a mutable jsonb blob. If the flag came from there, a hand-edited
  // context row could turn a dry run into a real one mid-execution -- the one thing this
  // flag exists to prevent. The column is written once at insert and never updated.
  context._dryRun = run.dryRun === true
```

Two verified properties this placement buys:

- **A resumed dry run stays dry.** Line 152-161 restores the persisted context, then line 164-165
  overwrite both underscore fields from the authoritative row. A dry run that yields on a delay and
  resumes minutes later re-derives the flag from the column.
- **`transform` cannot see the flag.** `transform.ts` injects only `{ trigger: context.trigger, nodes:
  context.nodes }` into QuickJS (verified at the `inputData` construction). User JS therefore
  **cannot** branch on `_dryRun`, which is what makes "transform runs FOR REAL" honest rather than a
  hope. `evaluateCondition` is likewise pure over the context.

**Simulated outputs — the actual shapes.** The governing principle: **simulate the side effect, never
the resolution.** Every interpolation, every lookup, every validation still runs, so a dry run fails
for the *real* reason (bad recipient, missing target record, SSRF-blocked URL) and only the final
write/send/call is skipped.

| Handler | Real output (verified) | Dry-run output | Work still performed |
|---|---|---|---|
| `crm_action` **create** | `{ success: true, id, deal }` — `deals.ts:264`; `{success,id,<entity>}` per entity | `{ success: true, id: "dryrun-<uuid>", <entity>: { id, ...interpolatedFields }, simulated: true }` | entity/operation validation (`crm.ts:238-245`), `_workflowUserId` check (247-250), `interpolateDeep` + `coerceFieldMapping` (253-256) |
| `crm_action` **update** | deal: `{ success: true, newAssigneeUserIds: string[], dealTitle: string }` — `deals.ts:275`; others `{ success: true }` | `{ success: true, simulated: true }`, **plus** `newAssigneeUserIds: []` and `dealTitle: <from interpolatedFields.title ?? "">` when `entity === "deal"` | all of the above **plus** `resolveTargetId` (`crm.ts:208-225`) — a real `ilike` lookup, so an update aimed at a nonexistent record still fails the dry run |
| `crm_action` **delete** | `{ success: true }` | `{ success: true, simulated: true }` | as update |
| `email` | `{ sent: true, recipientCount, recipients }` — `email.ts:77-83` | `{ sent: false, simulated: true, recipientCount, recipients }` | `resolveRecipientEmails` incl. the `users` SELECT (`email.ts:41-44`), subject/body interpolation, **and the `emails.length === 0` throw** (67-69) |
| `notification` **(C-2)** | `{ sent: true, recipientCount, recipients }` — `notification.ts:42-48` | `{ sent: false, simulated: true, recipientCount, recipients }` | `userIds` presence throw (18-20), the `users` SELECT (23-26), the "No valid users" throw (28-30), message interpolation |
| `http_request` | `{ statusCode, headers, body }` — `http.ts:128-134` | `{ statusCode: 200, headers: {}, body: {}, simulated: true }` | URL/header/body interpolation (58-83) **and `validateUrl` (66)** — an SSRF-blocked URL fails the dry run, which is a feature |
| `webhook_response` | `{ sent, statusCode, body }` — `webhook-response.ts:120-126` | `{ sent: false, statusCode, body: interpolatedBody, simulated: true }` | `normalizeBody` + `interpolateDeep` (112-115); skip `sendWebhookResponse` |

**The honest limitation, stated plainly.** Shape fidelity is achievable; **value** fidelity is not.
A `crm_action` create followed by a `javascript_transform` that reads
`input.nodes.crm1.deal.stageId` gets whatever `interpolatedFields` happened to contain — and
`undefined` if the field was never in the mapping. So a dry run **can** fail at a transform for a
reason that would not occur in a real run. Mitigations, in order:

1. Return the interpolated fields inside the entity object (above) rather than a bare `{ id }`. This
   covers every field the node itself was configured to write, which is the common case for a
   downstream reference.
2. `simulated: true` on every simulated output makes the cause diagnosable from `json-viewer.tsx`
   without any new UI.
3. Document it in a code comment on each gate. **Do not** add user-facing copy about it —
   F-41-1 and the locked `dryRun.description` both forbid new prose here.

**`validateUrl` is kept on purpose.** It performs a DNS resolution (`ssrf.ts:62`), which is
pedantically an outbound packet. Keeping it is right: it is a *validation*, not the "outgoing
request" the locked copy is about, and dropping it would let a dry run pass a URL that a real run
would reject. Note also `ssrf.ts:63-65` treats DNS failure as "hostname is an IP literal" and does
not throw, so an offline environment does not break dry runs.

**Second-order safety, worth stating because it is not obvious:** because the `crm` gate skips the
*mutation call*, no `crmBus` event is emitted, so the workflow-trigger subscriber
(`instrumentation.ts:18-19`) never fires and **a dry run cannot trigger downstream workflows.** That
falls out of skipping the mutation; it is not a separate guard, and it would be lost if anyone
"improved" the gate by calling the mutation inside a rolled-back transaction.

### Q2 — Who claims a dry run, and does the claim query change?

**Answer: the existing execution processor claims it, and the claim query needs NO change. Verified.**

`processPendingRuns` (`execution-processor.ts:115-133`) selects on `wr.status = 'pending'` and nothing
else about the row. A dry-run row is inserted `status: 'pending'` by `createWorkflowRun`
(`create-run.ts:38-46`), so it matches. `executeRun` is then called with its id and the engine reads
`run.dryRun` from the same row. **Nothing in the claim path is status-agnostic in a way that breaks.**

Three knock-ons the planner must know:

1. **Serial enforcement applies to dry runs.** The claim requires
   `NOT EXISTS (… wr2.workflow_id = wr.workflow_id AND wr2.status IN ('running','waiting'))`
   (`execution-processor.ts:122-127`). So a dry run **queues behind** any in-flight or delayed run of
   the same workflow, and while it runs it **blocks** real runs of that workflow. Consequence for the
   UI: if the workflow has a `waiting` run (a delay parked for hours), the dry run will never be
   claimed inside the dialog's 30s budget and the locked `dryRun.timeout` toast fires. That is honest
   behaviour and the UI-SPEC already has a state for it.
2. **Do NOT exempt dry runs from serial enforcement.** It is tempting (a dry run shouldn't block
   production) but the exemption would permit two concurrent runs of one workflow, which is exactly
   what that clause exists to prevent. Leave the query alone.
3. **Poll cadence sets the floor on perceived latency.** `POLL_INTERVAL = 5_000`
   (`execution-processor.ts:8`), so a dry run waits 0-5s before it even starts. The 30s dialog budget
   is ~5s of queue plus execution. Reasonable, but a plan that assumes instant start is wrong.

### Q3 — webhook-response under dry run

**Answer: it cannot hang and cannot throw, today, with zero code changes. But gate it anyway.**

The mechanism, read from source:

- `waitForWebhookResponse(runId)` (`webhook-response.ts:26-38`) is called **only** by the inbound
  webhook route (`route.ts:114`), and only when `hasWebhookResponseNode(workflow.nodes)` is true. It
  is the only writer of `pendingResponses`.
- A dry run is created by a **server action**, never by that route. So no entry for the dry run's
  `runId` is ever registered.
- `sendWebhookResponse(runId, …)` does `pendingResponses.get(runId)`; on miss it **returns `false`
  immediately** (`webhook-response.ts:54-55`). It does not await, does not construct a promise, does
  not throw.
- The handler therefore returns `{ sent: false, statusCode, body }` and the walk continues.
- Cross-talk is impossible: `runId` is `crypto.randomUUID()` (`workflows.ts:36`), so a dry run cannot
  resolve some other request's pending promise.

**Recommendation: still add the explicit gate.** Two reasons. (a) The current safety is *incidental* —
it depends on the map being keyed by `runId` and on a dry run never going through the webhook route.
Both are true and neither is asserted anywhere; a future change to either silently breaks it. (b) A
gate makes the invariant testable: `webhook-response.test.ts` can assert `sendWebhookResponse` is
never reached and that `pendingResponses` is untouched, which is a real regression guard. The gate
costs three lines and converts an accident into a decision.

**Bonus finding, same mechanism, applies to replay:** replaying a failed run of a webhook-response
workflow produces `sent: false` for that node, because the original HTTP caller is long gone. That is
correct and harmless — but it means a webhook-response workflow's replay is *not* equivalent to its
original run. Worth one sentence in the WFOPS-04 doc, since it is the same in-memory-map limitation
seen from a different angle.

### Q4 — The recursion/depth interaction with replay

**Answer: resetting `depth` to 0 is SAFE. There is no unbounded replay loop. The reasoning matters
more than the verdict, because the safety comes from something other than the depth counter.**

What the guard actually is:

- `MAX_RECURSION_DEPTH = 5` (`recursion.ts:3`).
- `executeRun` wraps the whole graph in `runWithExecutionDepth(run.depth ?? 0, …)`
  (`engine.ts:123`).
- `crm.ts:252` reads the ambient depth and calls the mutation inside
  `runWithExecutionDepth(depth + 1, …)` (`crm.ts:260, 272, 284`).
- Any workflow the resulting CRM event triggers calls `createWorkflowRun` with no explicit depth, so
  `effectiveDepth = getCurrentExecutionDepth()` (`create-run.ts:20`) — i.e. `depth + 1`.
- At `effectiveDepth >= 5` the run is inserted **already failed** (`create-run.ts:22-36`).

So `depth` bounds **one automated cascade**: run → CRM write → matcher → run → … , at most 5 levels.
A replay starting at 0 gets a fresh budget of 5, exactly like a manual trigger
(`manual-trigger.ts:58` also passes no depth, and a user-initiated action has ambient depth 0).

**Why there is no replay→replay cycle.** I looked for any automated path that could invoke a replay
and found none:

- Replay is a **server action** invoked from a click. No node type can call a server action.
- `registerAction` is called exactly six times (`actions/index.ts:8-13`); there is no "replay run"
  action type, and none of the six touches `workflow_runs` except through the engine's own
  bookkeeping.
- `createWorkflowRun`'s five non-test call sites (webhook route, schedule processor, CRM matcher,
  manual trigger, and — new — the replay/dry-run actions) are all triggered by an external event or a
  human. None is reachable from inside a running workflow except the matcher, which is the path
  `depth` already bounds.

So the worst case is a human clicking Replay N times, producing N independent runs — indistinguishable
in risk from clicking a manual trigger N times, which the product already permits.

**The residual risk is real but it is not unboundedness — it is amplification, and CONTEXT already
priced it.** Each replay re-runs the workflow *from node 1*, so every step that succeeded before the
failure fires again: emails re-send, HTTP calls repeat, CRM writes duplicate. With `.env` pointing
`SMTP_HOST` at a production relay, those are real emails from the real sending domain. This is
precisely what the locked `workflows.replay.confirmBody` warns about, verbatim, and the UI-SPEC calls
it *"the most important string in this phase."* That assessment is correct and this research confirms
it from source. The confirm dialog is a load-bearing control, not a courtesy.

**One thing `replayedFromRunId` should NOT be asked to do.** CONTEXT observes that the column is "the
only record that [a replay] happened", which is true, but a plan must not turn it into a *guard* — e.g.
"refuse to replay a run whose `replayedFromRunId` chain is longer than N". Walking the chain requires a
recursive query per replay, the chain is human-driven so no bound is principled, and CONTEXT is
explicit that the column is diagnostic (rendered as the lineage line, one direction only). Keep it
diagnostic.

### Q5 — Throttle storage for failure alerts

**Answer: do NOT reuse `digest_log`. Add `workflows.failureAlertSentAt` and claim it with a guarded
`UPDATE … RETURNING`. Window: 60 minutes.**

**Why `digest_log` cannot work** (`digest-log.ts:3-8`): its columns are `id`, `sentAt`, `userCount`,
`weekStart`. **There is no workflow key**, so it cannot express "this workflow, this window" without a
schema change of its own. Worse, its only reader is
`SELECT id FROM digest_log WHERE week_start = $thisMonday LIMIT 1` (`email/process/route.ts:113-121`),
and if that returns a row the weekly digest **silently does not send**. Inserting failure-alert rows
there would suppress the weekly digest for every user. CONTEXT calls `digest_log` a *precedent* for
"remember that we already sent this" — and it is a good one conceptually — but the table itself is the
wrong vessel.

**The better in-repo precedent is `activities.reminderSentAt`** (`activities.ts:15`), read at
`email/process/route.ts:45` and set at 76-79 with this comment: *"Mark as sent BEFORE sending
(prevents duplicates even if send fails)"*. That is a per-entity send marker on the entity's own
table — exactly the shape needed here.

**Recommended implementation** (`src/lib/execution/failure-alert.ts`):

```ts
/**
 * One alert per workflow per hour. 60 minutes is chosen against the two poll intervals that
 * bound the failure rate: the execution processor ticks every 5s (execution-processor.ts:8) and
 * the schedule processor every 30s (schedule-processor.ts:9). A workflow failing on every
 * execution tick would emit ~17,000 emails/day untrhottled and 24 at this window -- below any
 * transactional relay's rate limit, and still frequent enough that a sustained outage keeps
 * reminding the operator rather than going quiet after one message. It also matches the only
 * other time constant in the email layer (the activity reminder's one-hour horizon,
 * api/internal/email/process/route.ts:29).
 */
export const FAILURE_ALERT_WINDOW_MINUTES = 60

/**
 * Atomically claim the right to alert for this workflow, or decline.
 *
 * The guard is IN THE UPDATE, not in a preceding SELECT, and that is the whole point: two
 * replicas both running this processor would each pass a read-then-write check and each send an
 * email. Exactly one UPDATE can match the predicate, so exactly one replica gets a row back.
 * This is the same atomic-claim shape as processPendingRuns (execution-processor.ts:115-133) --
 * which is the property WFOPS-04 is documenting, so the alerting path had better have it.
 *
 * updated_at is deliberately NOT touched: this is runtime state, not a definition change, and
 * the editor's "last modified" reading must not move because a run failed.
 */
export async function claimFailureAlert(workflowId: string): Promise<boolean> {
  const claimed = await db.execute(sql`
    UPDATE workflows
    SET failure_alert_sent_at = NOW()
    WHERE id = ${workflowId}
      AND (
        failure_alert_sent_at IS NULL
        OR failure_alert_sent_at < NOW() - make_interval(mins => ${FAILURE_ALERT_WINDOW_MINUTES})
      )
    RETURNING id
  `)
  return ((claimed as unknown as unknown[])?.length ?? 0) > 0
}
```

`make_interval(mins => …)` is the parameterised-interval form this repo already uses for exactly this
reason (`execution-processor.ts:82, 93`) — do not string-concatenate an interval literal.

**Cost accounting, honestly.** This makes it a **fourth** schema column, where CONTEXT's discretion
item says "the three schema additions". That phrase enumerates the three CONTEXT knew about; the
throttle's *storage* was left open ("`digest_log` is the precedent" is guidance, not a mandate, and the
window itself is explicit discretion). The alternatives are worse:

| Option | Verdict |
|---|---|
| `workflows.failureAlertSentAt` + guarded UPDATE | **Recommended.** 1 column, atomic, matches `reminderSentAt`, multi-replica correct. |
| New `workflow_failure_alerts` table | Correct but strictly more: a table, a schema file, a barrel export, an index — to store one timestamp per workflow. |
| Derive from `workflow_runs` (was there a prior `failed` run in the window?) | Zero schema, but wrong semantics: it throttles on *failure recency*, not *alert recency*, so a workflow failing faster than the window goes permanently silent after the first email. It also cannot use `completedAt` — `failRun` (`engine.ts:559-561`) does **not** set it — so it would key on `createdAt`, conflating queue time with failure time. |
| In-memory `Map` | Rejected in § Alternatives. |
| Reuse `digest_log` | Breaks the weekly digest. |

**Fold it into the same migration** as the other three (see Q6), so this remains one migration and one
`db:migrate`.

### Q6 — Migration mechanics

**Confirmed convention: `generate` then `migrate`. Never `push`.**

- `package.json` scripts: `db:generate` = `drizzle-kit generate`, `db:migrate` = `drizzle-kit migrate`,
  `db:push` = `drizzle-kit push` (present but not the convention).
- `drizzle.config.ts`: `schema: "./src/db/schema/index.ts"`, `out: "./drizzle"`,
  `dialect: "postgresql"`, `dbCredentials.url = process.env.DATABASE_URL`.
- `drizzle/meta/_journal.json` has **19 entries**, last tag `0018_adorable_smasher`. **The next
  migration is `0019_*`.**

**Recommendation: ONE migration, four columns.** All four are `ADD COLUMN` on two tables with no data
dependency and no ordering constraint between them. Three migrations would mean three journal entries,
three `db:migrate` runs, and three chances for a partial apply, in exchange for nothing. One migration
also keeps the "throttle column" (Q5) from looking like a separate decision at apply time.

```sql
-- drizzle/0019_<generated-name>.sql  (drizzle-kit generate produces this shape)
ALTER TABLE "workflow_runs" ADD COLUMN "dry_run" boolean DEFAULT false NOT NULL;
ALTER TABLE "workflow_runs" ADD COLUMN "replayed_from_run_id" text;
ALTER TABLE "workflows" ADD COLUMN "failure_alert_sent_at" timestamp;
ALTER TABLE "notification_preferences" ADD COLUMN "email_workflow_failed" boolean DEFAULT true NOT NULL;
```

**Column decisions, each load-bearing:**

- **`dry_run` MUST be `NOT NULL DEFAULT false`**, not nullable. The runs-list filter is
  `eq(workflowRuns.dryRun, false)`, and in SQL `NULL = false` is `NULL`, not `true` — a nullable column
  would make **every pre-existing run vanish from the runs list**. This is the single highest-impact
  migration detail in the phase. Postgres 16 (`postgres:16-alpine`, verified from `docker compose ps`)
  backfills a non-volatile default as a metadata-only operation (PG 11+), so there is no table rewrite
  and no separate backfill step.
- **`replayed_from_run_id` is `text`, nullable, and should NOT carry a foreign key.** Runs are prunable
  (there is an audit pruner and a trash pruner in `instrumentation.ts`); an FK would either block
  pruning the origin run or cascade-delete the replay. Every other run column is plain `text` anyway.
  Drizzle: `text("replayed_from_run_id")`.
- **`failure_alert_sent_at` nullable `timestamp`** — `NULL` means "never alerted", which the guarded
  UPDATE reads as claimable. Mirrors `activities.reminderSentAt`'s nullability exactly.
- **`email_workflow_failed` is `boolean DEFAULT true NOT NULL`** — CONTEXT-locked, and identical to its
  three siblings (`notification-preferences.ts:6-8`).

**No index is needed.** `dry_run` has terrible selectivity (almost all rows `false`) and the runs query
is already served by `workflow_runs_workflow_id_idx` (`workflows.ts:51`); adding a `dry_run` index
would be write cost for no read benefit. `failure_alert_sent_at` is only ever read by primary key.

**How to actually run it — this is the part that will bite.** `.env` sets
`DATABASE_URL=postgresql://…@postgres:5432/pipelite`, an **in-Docker-network hostname**.
`npx drizzle-kit migrate` from the host cannot resolve `postgres`. Two working forms:

```bash
# Preferred: run inside the app container, which already has the correct DATABASE_URL
docker compose exec app npx drizzle-kit migrate

# From the host, overriding to the mapped port (5433 -> 5432)
DATABASE_URL='postgresql://pipelite:pipelite@localhost:5433/pipelite' npx drizzle-kit migrate
```

`docker` needs **no sudo** here (verified: `docker compose ps` succeeds bare). `drizzle-kit generate`
needs no DB connection at all and runs fine on the host.

**Post-migration:** the Docker app container must be restarted (or the Next dev server in it reloaded)
so the schema module reflects the new columns — the running container holds a compiled bundle.

### Q7 — The runs-list filter

**Wiring, verified:** `runs/page.tsx` is an **async server component** reading
`searchParams: Promise<{ status?: string; page?: string }>` (line 20). The status value is validated
against `VALID_STATUSES` (line 12, 41-43) and folded into `whereClause` at lines 45-47. The client
`StatusFilter` is a `"use client"` component that mutates `URLSearchParams` and calls
`router.push` (`status-filter.tsx:30-41`), deleting `page` on every change (line 38).

**Minimal change — three edits in `page.tsx`:**

```ts
// 1. searchParams type (line 20)
searchParams: Promise<{ status?: string; page?: string; dryRun?: string }>

// 2. replace the two-branch whereClause (lines 45-47) with an accumulator
const showDryRuns = sp.dryRun === "1"
const conditions = [eq(workflowRuns.workflowId, id)]
if (statusFilter) conditions.push(eq(workflowRuns.status, statusFilter))
// Hidden by DEFAULT: the absence of the param means "real runs only". `dry_run` is
// NOT NULL DEFAULT false, so this predicate matches every pre-migration row --
// which it would not if the column were nullable (NULL = false is NULL).
if (!showDryRuns) conditions.push(eq(workflowRuns.dryRun, false))
const whereClause = and(...conditions)

// 3. R-4 container (line 80): <div className="mb-4 flex flex-wrap items-center gap-2">
```

Both the rows query and the `count()` query already share `whereClause` (lines 54, 61), so pagination
totals stay consistent for free.

**Client side** — put the checkbox in `status-filter.tsx`, reusing its own `router.push` mechanism
exactly as UI-SPEC prescribes:

```tsx
const showDryRuns = searchParams.get("dryRun") === "1"

function handleDryRunToggle(checked: boolean) {
  const params = new URLSearchParams(searchParams.toString())
  if (checked) params.set("dryRun", "1")
  else params.delete("dryRun")
  params.delete("page")            // same reset as handleChange, same reason
  const qs = params.toString()
  router.push(`/workflows/${workflowId}/runs${qs ? `?${qs}` : ""}`)
}
```

**Recommended TDD seam.** Extract the parse into `src/lib/workflows/runs-filter.ts`:

```ts
export interface RunsFilter { page: number; status: WorkflowStatus | null; showDryRuns: boolean }
export function parseRunsSearchParams(sp: { status?: string; page?: string; dryRun?: string }): RunsFilter
```

This mirrors `src/lib/views/url-params.ts`, which plan 40-01 extracted from a page for precisely this
reason (its gate asserts zero `@/db` imports in the extracted module). It makes "defaults to hiding
dry runs", "`dryRun=2` is not truthy", and "an invalid status falls back to null" unit-testable with no
database.

---

## Failure Alerting — the detection problem and its fix

### The processor has no failure path (the phase's biggest hidden gap)

`executeRun` **never throws on run failure**. On any node error it catches internally
(`engine.ts:374-390`), marks the step failed, calls `failRun()` (`engine.ts:551-562`) which does
`UPDATE workflow_runs SET status='failed', error=…`, and **returns normally**. The `catch` at
`execution-processor.ts:144-149` therefore fires only for unexpected exceptions (a DB outage, a bug),
not for the ordinary "this run failed" case that WFOPS-03 is about.

There is consequently **nothing to hook**. The alert must *detect*.

### Recommended shape

```ts
// src/lib/execution/failure-alert.ts

/**
 * Alert on a run that reached a terminal FAILED state, subject to preference and throttle.
 *
 * Called from the execution processor AFTER executeRun returns, because executeRun signals
 * failure by writing a row, not by throwing (engine.ts:551-562). Re-reading the status is the
 * only way the processor can know.
 *
 * Never throws: a broken alert must not kill a processor tick, matching every other
 * error-handling site in this file's callers.
 */
export async function maybeAlertOnRunFailure(runId: string): Promise<void> {
  try {
    const [row] = await db
      .select({
        status: workflowRuns.status,
        dryRun: workflowRuns.dryRun,
        error: workflowRuns.error,
        workflowId: workflowRuns.workflowId,
      })
      .from(workflowRuns)
      .where(eq(workflowRuns.id, runId))
      .limit(1)

    if (!row || row.status !== "failed") return

    // A failed DRY RUN is not alerted. The operator is watching the dialog that started it;
    // emailing them about a test they are looking at is noise, and it would let anyone
    // generate mail by clicking Test run in a loop.
    if (row.dryRun) return

    // ... load workflow.createdBy + users.email/locale, check emailWorkflowFailed
    //     (absent row => true, matching getNotificationPreferences' defaults),
    //     claimFailureAlert(workflowId), build template, fire-and-forget safeSend.
  } catch (error) {
    console.error(`[failure-alert] Failed to evaluate alert for run ${runId}:`, error)
  }
}
```

**Three call sites in `execution-processor.ts`:**

| Site | Where | Why |
|---|---|---|
| `processPendingRuns` | after the `try/catch` around `executeRun` (~line 149), inside the drain loop | the ordinary case |
| `processWaitingRuns` | after `executeRun(runId)` (~line 197) | a run that fails *after* a delay is the one most likely to "fail silently forever" — nobody is watching hours later |
| `reclaimStaleRuns` | over the ids the `RETURNING id` already yields (line 94) | a run killed by the 5-minute execution lease is a genuine failure with a genuine error message (line 86); this is exactly WFOPS-03's stated motivation |

Including the reclaim path costs a loop over an already-returned id list and covers a failure class
nothing else can see. **Recommended.**

**Preference default must match the existing reader.** `getNotificationPreferences` returns
`defaultPreferences` (all `true`) when no row exists (`settings/notifications/actions.ts:38-40`). The
alert path must do the same: **no row ⇒ send**. Reading it as "no row ⇒ don't send" would silently
disable the feature for every user who has never opened the settings page — which is most of them,
since the table is only written by that form.

**Fire-and-forget the send.** `safeSend` **rethrows** on transport failure (`send.ts:34-37`). Awaiting
it inside the processor drain loop would let one bad SMTP response abort the tick. Use the repo's own
pattern from `email/process/route.ts:82-89`: call without `await`, attach `.catch(console.error)`.

### Two coverage gaps, both to be documented rather than closed

1. **Recursion-limit failures are never alerted.** `createWorkflowRun` inserts these rows *already*
   `status: 'failed'` (`create-run.ts:22-36`). They are never `pending`, so the processor never claims
   them and never re-reads them. **Do not** add the alert to `create-run.ts`: it is called from
   `crm.ts` inside a live run and from the synchronous webhook route, so alerting there would put
   email latency on a webhook response — the exact reason CONTEXT put the hook in the processor.
2. **Synchronous webhook-response runs are never alerted.** `route.ts:102-118` claims the run itself
   and calls `executeRun` inline; the processor never sees it. A failure there returns `{ ok: true }`
   to the caller (line 138-144) and no alert fires. Adding a fire-and-forget alert at
   `route.ts:138` would close it without latency cost, but it puts WFOPS-03 logic in a second place
   and the path is narrow (webhook-triggered workflows that contain a `webhook_response` node —
   verified as the only condition, `route.ts:97`).

**Recommendation:** implement the processor hook as locked, and record both gaps in the WFOPS-04 doc
section, where the webhook-response one belongs anyway — it is the *same* in-memory-coordination
limitation observed from the alerting side. Do not silently ship a partial WFOPS-03 without saying so.

### C-4 — Localise the failure template, or not?

Two template families exist and the split is not arbitrary:

- **Localised (7):** `verify-email`, `approved`, `password-reset`, `invite-user`, `deal-assigned`,
  `activity-reminder`, `weekly-digest`. Each calls
  `getEmailTranslator(locale, 'emails.<name>')` (`activity-reminder.ts:9`) and each has a matching
  sub-namespace — verified: `emails` contains exactly those 7 keys.
- **Un-localised (2):** `workflow-email.ts`, `workflow-notification.ts`. Both hardcode English.

**Recommendation: Option A — localise it as `emails.workflowFailed.*`.** The distinction between the
two families is *whose words they carry*. The un-localised pair transports **user-authored content** (a
workflow's own subject/body/message), which cannot be translated by the app. Everything the app says
in its own voice to a known user is localised — and the failure alert is the app's own voice. The
recipient is `workflow.createdBy`, a real user row, and `users.locale` exists
(`users.ts:20`, `text('locale').default('en-US').notNull()`), so the locale is in hand.

Cost: ~4-5 keys under `emails.workflowFailed` × 3 locale files. **This does not conflict with UI-SPEC
L-41-2**, whose exact-contract assertion is *total for the `workflows` namespace only*; `emails.*` keys
fall under the whole-file parity assertion (`locale-parity.test.ts`, "all three locales have identical
whole-file key sets"), which they satisfy by being added to all three.

**Option B** (hardcode English, following the file CONTEXT literally names) is defensible and cheaper.
Either way the planner must **record the choice explicitly**, because the UI-SPEC's key manifest says
25 and Option A makes it 25 + `emails.workflowFailed.*`. A silent divergence from an approved manifest
is the thing to avoid, not the extra keys.

---

## Multi-Instance Safety Matrix (WFOPS-04) — verified, and it does not match the requirement text

Every claim below was read from source this session. `instrumentation.ts:27-42` starts **all four
processors in every instance**, so a second replica runs a second copy of each — the question is real.

| Component | Verdict | Mechanism | Evidence |
|---|---|---|---|
| Schedule processor claim | **SAFE** | `UPDATE workflows SET next_run_at = NULL WHERE active AND next_run_at <= now RETURNING *` — one statement; under READ COMMITTED the loser re-evaluates the predicate after the row lock and matches nothing, so `claimed` is empty and it creates no runs | `schedule-processor.ts:64-73` |
| Execution processor **pending** claim | **SAFE** | `UPDATE workflow_runs SET status='running' WHERE id = (SELECT … WHERE status='pending' … FOR UPDATE SKIP LOCKED) RETURNING *` — the subselect's lock is held for the enclosing statement and the `status='pending'` predicate is re-checked, so exactly one instance claims | `execution-processor.ts:115-133` |
| Stale-run reclaim | **SAFE** | idempotent single-statement `UPDATE … WHERE status='running' AND started_at < NOW() - interval`; a double-apply is a no-op | `execution-processor.ts:73-95` |
| Execution processor **waiting resume** | **NOT SAFE — new finding** | `SELECT wrs.id, wrs.run_id … FOR UPDATE SKIP LOCKED` runs via `db.execute` on a postgres-js client **outside any transaction** (`src/db/index.ts:1-13`), so the implicit transaction commits at statement end and the row locks drop. The follow-up `UPDATE workflow_run_steps SET status='completed'` has **no `WHERE status='waiting'` guard**. Two instances can both select the same ready step and both call `executeRun(runId)` — duplicating steps and every side effect after the delay | `execution-processor.ts:162-205`, esp. 163-169 and 182-185 |
| `webhook_response` node | **UNSAFE** (known, CONTEXT-locked) | `pendingResponses` is a module-level `Map` (`webhook-response.ts:15`). `waitForWebhookResponse` registers in the process that received the HTTP request; `sendWebhookResponse` resolves only in the process that runs the node. Different replicas ⇒ the map misses, the handler returns `sent: false`, and the caller's request hangs until the 30s timeout rejects (`webhook-response.ts:31-34`) then falls back to `{ ok: true }` (`route.ts:138-144`) | `webhook-response.ts:15, 26-61`; `route.ts:97-144` |

**The requirement's own wording is imprecise and the doc must not copy it.** REQUIREMENTS.md WFOPS-04
says *"schedule and execution claims are already multi-instance safe"*. The execution *pending* claim
is; the execution *waiting resume* in the same file is not. A deployment doc that says "the execution
processor's claim is multi-instance safe" full stop would tell an operator it is safe to run two
replicas of a deployment that uses delay nodes, and duplicate a delayed workflow's post-delay side
effects. **A doc that is confidently wrong is worse than no doc.**

**Recommendation: document `processWaitingRuns` as a second UNSAFE row.** It matches the phase's
posture exactly — WFOPS-04 documents constraints rather than engineering them away, and REQUIREMENTS.md
§ Out of Scope already covers not fixing this class this milestone. Note for a future phase that the
fix is small (~3 lines): add `AND status = 'waiting'` to the step `UPDATE` and skip the run when the
`UPDATE` affects zero rows, turning the resume into the same atomic claim the pending path uses.

**Recommendation: scope the doc's claim.** Open the section with something like *"this matrix covers
the workflow engine"*. It must not imply an app-wide guarantee — the email processor's activity
reminder sets `reminder_sent_at` with `UPDATE activities SET reminder_sent_at = NOW() WHERE id = $1`
and **no `AND reminder_sent_at IS NULL` guard** (`email/process/route.ts:76-79`), so it has the same
class of race. Assessing that is not this phase's job, but neither is implying it is safe.

### Insertion points, verified

| File | Insertion point | Why there |
|---|---|---|
| `docs/admin/deployment/vercel.md` | new `### Horizontal Scaling and the Webhook-Response Constraint` under the existing `## Limitations and Workarounds` (line 217), after `### Cold Starts` (line 242); plus one bullet in the top-of-file `### Limitations` list (line 15) | **The file that matters.** Vercel multiplies instances by default, so a reader hits this without opting in. The file already has a Limitations section written for exactly this kind of statement. |
| `docs/admin/deployment/docker.md` | new `### Horizontal Scaling` under `## Production Considerations` (line 182), beside `### Resource Limits` (line 227) | `docker compose up --scale app=2` is one flag away, and this is where the file already discusses production topology. |
| `docs/admin/deployment/bare-metal.md` | **optional** — one cross-reference sentence under `#### Start with PM2` (line 211) | Not named by CONTEXT, so this is a discretionary call. But the file documents `pm2 start` (line 214), and PM2 cluster mode (`-i max`) turns a single flag into N replicas. One sentence pointing at the docker/vercel section is cheap. **Recommended; a plan that omits it is still compliant.** |

Both required sections should state the SAFE rows too — CONTEXT § Specific Ideas is explicit: *"A
reader who learns only that webhook-response breaks will reasonably conclude the whole engine is
single-instance, which is false and would discourage a deployment that would have worked."*

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Creating the replay's run row | A bespoke `db.insert(workflowRuns)` in the server action | `createWorkflowRun(workflowId, envelope, 0, { replayedFromRunId })` | It owns the `MAX_RECURSION_DEPTH` short-circuit (`create-run.ts:22-36`). A hand-rolled insert bypasses the recursion guard entirely. |
| Creating the dry-run row | ditto | `createWorkflowRun(workflowId, envelope, 0, { dryRun: true })` | same guard, plus one code path to test |
| Executing a dry run | A "dry-run engine" or a runId-free execution path | The existing processor + engine, gated by `_dryRun` | CONTEXT's whole reason for persisting the run. Two engines diverge; one gated engine cannot. |
| Preventing mutation | A transaction wrapped around the run | The handler gates | Explicitly rejected in CONTEXT: emails and HTTP calls do not roll back. Also, `runWithActor`/`runWithExecutionDepth` are AsyncLocalStorage scopes, not transactions — there is no transaction to widen. |
| Non-mutation proof | A new "nothing changed" panel or message | `run-changed-records.tsx` rendering the existing `audit.run.empty` | F-41-1 forbids new copy. The proof chain is verified: no mutation ⇒ no `crmBus` event ⇒ no `audit_log` row ⇒ `readRunChangedRecords` returns `[]` (`linked-records.ts:191` is the only reader of `audit_log.workflow_run_id`). |
| Alert throttling | An in-memory `Map` or a read-then-write check | Guarded `UPDATE … RETURNING` | Both alternatives break under two replicas — the failure mode this very phase documents. |
| Interval arithmetic in SQL | String-concatenated `INTERVAL '60 minutes'` | `make_interval(mins => ${N})` | The repo's existing parameterised form (`execution-processor.ts:82, 93`). |
| Source-scan gates | A fresh comment-stripper or brace matcher | `readStrippedSource`, `elementRegion`, `enclosingConditional` from `@/components/custom-fields/__tests__/source-scan` | Its header records that a fourth brace matcher is exactly what it exists to prevent. |
| Run status polling | A new API route | A read-only server action (`getHttpTemplates` is the precedent, `workflows/actions.ts:237`) | One less auth surface. |
| Locale keys | Reusing `admin.webhooks.replay` | New `workflows.*` namespace | UI-SPEC: *"reaching across namespaces for a one-word string is how copy drifts out of sync with what it labels."* |
| A DOM test environment | Adding jsdom + testing-library for G-6 | Source-scan wiring test (C-1) | New test infra in a phase with no mandate for it, to gate one boolean. |

**Key insight:** almost every hand-rolled variant in this phase fails the same way — it bypasses a
guard that lives one layer down (the recursion check, the atomic claim, the audit bus, the comment
stripper). The existing seams are load-bearing precisely because they are the only places those guards
exist.

---

## Common Pitfalls

### Pitfall 1 — Nullable `dry_run` erases the entire runs list

**What goes wrong:** `dry_run` is added as nullable `boolean`. All pre-existing rows get `NULL`.
`eq(workflowRuns.dryRun, false)` evaluates to `NULL` for them, which is not `TRUE`, so the `WHERE`
excludes them. The runs page renders "No runs yet" for every workflow in the database.
**Why it happens:** drizzle only emits `NOT NULL DEFAULT false` if the schema says
`.notNull().default(false)`; omit either and you get a nullable column.
**How to avoid:** `boolean("dry_run").notNull().default(false)`. Verify the generated SQL contains
`DEFAULT false NOT NULL` **before** applying, and assert the drizzle column config in a schema test.
**Warning signs:** the runs page empties out after migration; `SELECT count(*) FROM workflow_runs WHERE dry_run IS NULL` returns non-zero.

### Pitfall 2 — Gating too early, so the dry run fails for the wrong reason

**What goes wrong:** a handler returns its simulated output as its *first* statement, skipping
interpolation, recipient resolution, target lookup and SSRF validation. Every dry run then "passes",
including ones whose real counterpart would fail on a bad recipient or a missing target record. The
dry run becomes decorative.
**Why it happens:** an early `if (context._dryRun) return { output: … }` is the shortest diff.
**How to avoid:** place the gate **immediately before the side effect** — before `mutations.create(...)`
/ `safeSend(...)` / `fetchWithTimeout(...)` / `sendWebhookResponse(...)` — and never above the
resolution code. Each handler's test should assert both halves: the side effect was not called **and**
the resolution error still throws under `_dryRun` (e.g. `email` with zero resolvable recipients still
throws "No valid recipients resolved").
**Warning signs:** a handler's dry-run test needs no mocks; a dry run of an obviously-broken workflow
completes green.

### Pitfall 3 — A dry run of a workflow with a delay node times out (and executes the delay for real)

**What goes wrong:** the `delay` node is handled in the engine, not a handler
(`engine.ts:324-364`, `engine.ts:459-494`), and CONTEXT lists only the *action handlers* as
simulating. So a dry run hits `resolveDelay`, persists `status: 'waiting'` with a future `resume_at`,
and returns. The dialog's 30s budget expires, the `dryRun.timeout` toast fires, and the run resumes
hours or days later. Meanwhile the workflow's serial-enforcement clause
(`execution-processor.ts:122-127`) sees a `waiting` run and **blocks every real run of that workflow**
until the dry run's delay elapses. A 3-day delay parks production for 3 days.
**Why it happens:** "delay" is not a side effect, so it is easy to miss when enumerating what to
simulate.
**How to avoid — two options, and this is a genuine judgment call the planner must decide:**

- **(a) Recommended: skip delays under dry run.** In both `delay` branches, treat `_dryRun` as
  `resumeAt === null` (the existing "past time" path, `engine.ts:327-333`), producing
  `{ delayed: false, skipped: true, simulated: true }`. ~6 lines across two sites plus one engine test.
  Rationale: a "test run" whose purpose is *"see per-node output and confirm no CRM record changed"*
  inside a dialog cannot wait 3 days, and the production-blocking side effect is worse than any
  fidelity lost. It is also consistent with the locked copy — `dryRun.description` promises that
  conditions and transforms run for real, and says nothing about delays.
- **(b) Conservative fallback: leave delays real.** Zero engine change beyond the flag. Then the
  timeout path is load-bearing and the production-blocking behaviour must be documented.

**Warning signs:** a dry run stuck at `waiting`; real runs of that workflow queueing behind it;
`SELECT status FROM workflow_runs WHERE dry_run AND status='waiting'` non-empty.

### Pitfall 4 — Awaiting `safeSend` inside the processor drain loop

**What goes wrong:** `safeSend` rethrows on transport failure (`send.ts:34-37`). Awaited inside
`processPendingRuns`' `while (true)` drain loop, one bad SMTP response aborts the tick and leaves
pending runs unclaimed until the next 5s poll — or, if the throw escapes `scheduleTick`'s try, is
merely logged but has already cut the drain short.
**How to avoid:** fire-and-forget with `.catch()`, per `email/process/route.ts:82-89`. Also wrap the
whole alert evaluation in its own try/catch that only logs.
**Warning signs:** `[execution-processor] Tick error:` in logs correlated with email failures; runs
sitting `pending` while the processor is alive.

### Pitfall 5 — Copying `replayDelivery`'s admin gate onto a session-only page

**What goes wrong:** `replayDelivery` gates on `session.user.role !== "admin"`
(`admin/webhooks/actions.ts:91-94`). CONTEXT's code-context note says the pattern is mirrored
"including its admin gate". But the run detail page is **session-only** — it has no role check, and
`run-changed-records.tsx:117-120` documents that omission as deliberate: *"workflows are not
owner-scoped in this product"*. STATE.md § Decisions records *"Workflows not owner-scoped; all
authenticated users can CRUD any workflow"*, and `triggerManualRun` (`manual-trigger.ts:25`) has no
role gate at all. An admin gate on replay makes the button 403 for exactly the non-admin users the
page renders it to.
**Recommendation:** **session-only** auth (`if (!session?.user?.id) return { success: false, error: … }`)
for both `replayWorkflowRun` and `startDryRun`, matching `triggerManualRun` and the page's own
posture. A user who can already edit and manually trigger any workflow gains no new capability from
replay. CONTEXT's phrase describes `replayDelivery`; it is not a security requirement for a different
surface. **Flag this in the plan so the choice is recorded rather than inferred.**
**Warning signs:** a non-admin sees a Replay button that toasts "Unauthorized".

### Pitfall 6 — Dry runs leak into the workflow detail page's recent-runs table

**What goes wrong:** `src/app/workflows/[id]/components/recent-runs-mini.tsx` queries
`SELECT * FROM workflow_runs WHERE workflow_id = $1 ORDER BY created_at DESC LIMIT 5` with **no status
or dryRun filter**. It is **not** in the UI-SPEC's Surface Inventory. A dry run therefore appears
there, unbadged, indistinguishable from a real run, and pushes a real run out of the top 5.
**Why it happens:** the UI-SPEC's inventory is deliberately total for *UI surfaces*, and this is a
query in a file the inventory does not list.
**How to avoid:** add `eq(workflowRuns.dryRun, false)` to that query — a **data filter, not a UI
addition**. It renders no new element, changes no class string, and adds no copy, so it does not
violate the inventory's "an addition is a scope violation" rule; it *implements* CONTEXT's
"filtered out of the runs list by default" in the second place runs are listed.
**Recommendation:** make the change, and have the plan state explicitly that it is a query-only edit
so the UI checker does not read it as an out-of-inventory surface.
**Warning signs:** a test run in the workflow overview's Recent Runs with no dashed badge.

### Pitfall 7 — Writing the replay render site in a form the G-6 gate cannot read

**What goes wrong:** `enclosingConditional` requires the `{test && ( … )}` shape and throws on
anything else (`source-scan.ts:290-303`). A ternary, an extracted `const replayControl = …`, or an
early `return` makes the gate throw rather than fail — which reads as a broken test, not a broken
implementation.
**How to avoid:** write the site as `{run.status === "failed" && (<ReplayRunButton … />)}` and say so
in the task.
**Warning signs:** the gate throws `"… is not inside a {… && ( … )} conditional"`.

### Pitfall 8 — Gating the dry run on `workflow.active`

**What goes wrong:** `triggerManualRun` rejects inactive workflows (`manual-trigger.ts:38-44`) —
correctly, since every other trigger path does. Copying that check into `startDryRun` makes it
impossible to test an unproven, not-yet-activated workflow, which is the primary use case: the phase
goal is literally *"a failed or **unproven** workflow"*.
**How to avoid:** `startDryRun` validates existence and a non-empty `nodes` array, and **must not**
check `active`. (`engine.ts:143-149` completes a zero-node run immediately, so an empty workflow
produces a useless green dry run — worth an explicit guard.)
**Warning signs:** "Workflow is not active" from the Test run dialog on a draft workflow.

### Pitfall 9 — Assuming failure-alert emails land in mailhog

**What goes wrong:** mailhog is running (`pipelite-mailhog-1`, ports 1025/8025) but `.env` sets
`SMTP_HOST` to a **production SMTP relay** (Resend) with a real `EMAIL_FROM` on a real domain. A
verification step that says "trigger a failure and check http://localhost:8025" will find an empty
inbox — while the email goes out over the internet.
**How to avoid:** to verify in mailhog, temporarily point the app at it
(`SMTP_HOST=mailhog`, `SMTP_PORT=1025`, `SMTP_SECURE=false`) and restart the app container; state the
revert step in the same task. Alternatively verify by asserting on the `[email] Email sent to:` log
line (`send.ts:33`) — note `safeSend` also **skips silently** when `SMTP_HOST` is unset
(`send.ts:20-23`), so an unset host produces a passing no-op.
**Warning signs:** an empty mailhog inbox and a `[email] Email sent to:` line naming a real address.

### Anti-Patterns to Avoid

- **Adding a `dryRun` branch to `run-status-badge.tsx`.** Its `Record<Status, …>` map is
  exhaustive-by-type on purpose and `dryRun` is not a status (UI-SPEC C-41-2). Separate component,
  rendered beside it.
- **Making `dry-run-badge.tsx` a client component.** UI-SPEC G-8 + the repo-wide CFUI-01 gate.
- **Adding a `panelMode` to `side-panel.tsx` for the dry run.** UI-SPEC settles this: the panel is
  `w-[400px]` (already a 320px overflow) and is owned by node selection.
- **"Improving" the transform gate so user JS can see `_dryRun`.** `transform.ts` injects only
  `{ trigger, nodes }`, and that is what makes "transform runs for real" true rather than aspirational.
- **Setting `workflows.updatedAt` in the throttle UPDATE.** It is runtime state, not a definition edit.

---

## Code Examples

All patterns below are the repo's own, quoted from the cited file.

### The atomic-claim shape (the throttle must copy this, not a read-then-write)

```ts
// Source: src/lib/execution/execution-processor.ts:115-133 (verbatim shape)
const claimed = await db.execute(sql`
  UPDATE workflow_runs
  SET status = 'running', started_at = NOW()
  WHERE id = (
    SELECT wr.id FROM workflow_runs wr
    WHERE wr.status = 'pending'
      AND NOT EXISTS (
        SELECT 1 FROM workflow_runs wr2
        WHERE wr2.workflow_id = wr.workflow_id
          AND wr2.status IN ('running', 'waiting')
      )
    ORDER BY wr.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *
`)
if (!claimed || (claimed as unknown[]).length === 0) break
```

### Parameterised interval (never concatenate an interval literal)

```ts
// Source: src/lib/execution/execution-processor.ts:93
WHERE status = 'running'
  AND started_at < NOW() - make_interval(mins => ${STALE_RUN_TIMEOUT_MINUTES})
```

### Fire-and-forget email from a background loop

```ts
// Source: src/app/api/internal/email/process/route.ts:82-89
sendActivityReminderEmail(user.email, activity.title, activity.dueDate, user.locale)
  .catch((error) => {
    console.error("[email-process] Failed to send activity reminder:", error)
  })
```

### Preference read with "absent row means enabled"

```ts
// Source: src/app/api/internal/email/process/route.ts:67-73
const [prefs] = await db
  .select({ emailActivityReminder: notificationPreferences.emailActivityReminder })
  .from(notificationPreferences)
  .where(eq(notificationPreferences.userId, targetUserId))
  .limit(1)

if (prefs && !prefs.emailActivityReminder) continue   // no row => send
```

### Localised email template (if C-4 option A)

```ts
// Source: src/lib/email/templates/activity-reminder.ts:1-11 (shape)
import { getEmailTranslator } from '../i18n'

export async function getWorkflowFailedTemplate(
  workflowName: string,
  runUrl: string,
  errorMessage: string,
  locale: string = 'en-US'
) {
  const t = await getEmailTranslator(locale, 'emails.workflowFailed')
  return { subject: t('subject', { workflowName }), html: `…`, text: `…` }
}
```

### `createWorkflowRun` with an options bag (additive — all 5 existing call sites unchanged)

```ts
// Extends src/lib/triggers/create-run.ts:15-19
export async function createWorkflowRun(
  workflowId: string,
  triggerEnvelope: TriggerEnvelope,
  depth?: number,
  options?: { dryRun?: boolean; replayedFromRunId?: string }
): Promise<WorkflowRun>
```

Both `.values({...})` objects (`create-run.ts:25-32` and `38-45`) spread the options. Note the
recursion short-circuit branch must carry them too, so a dry run that trips the limit is still marked
`dryRun` and stays out of the runs list.

### Source-scan gate for a container class (G-3)

```ts
// Idiom: src/components/views/__tests__/save-view-dialog-wiring.test.ts
import { readStrippedSource, elementRegion } from "@/components/custom-fields/__tests__/source-scan"

it("the run-detail metadata row wraps at 320px (R-2)", () => {
  const source = readStrippedSource("src/app/workflows/[id]/runs/[runId]/page.tsx")
  expect(source).toContain('className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground"')
})
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Reset a failed record to `pending` to retry (`replayDelivery`) | Insert a new run row, preserve the failed one's step history | this phase | The failed run's `workflow_run_steps` are the evidence of *why*; overwriting them destroys the diagnosis |
| `drizzle-kit push` | `generate` + `migrate` with a checked-in journal | pre-existing (19 migrations) | `push` diffs live schema and can silently drop; never use it here |
| Bare `INTERVAL '5 minutes'` | `make_interval(mins => ${N})` | pre-existing | Parameterisable, so the constant lives in TS and is importable by tests |
| React component render tests | Source-scan wiring tests | pre-existing, repo-wide | The reason UI-SPEC G-6 must be reshaped (C-1) |
| Process-local dedup | DB-backed markers (`digest_log`, `activities.reminderSentAt`) | pre-existing | Correct under restart *and* under replicas |

**Deprecated / not applicable:** nothing. No library in this phase's path has a pending migration or
deprecation. `npm run dev` is forbidden by project convention — Docker only.

---

## Project Constraints (from CLAUDE.md and project memory)

There is **no `./CLAUDE.md` in the repository root** (verified: file does not exist). The binding
instructions come from the user's global `~/.claude/CLAUDE.md` and the project memory file. Actionable
directives that constrain this phase:

| Directive | Source | Effect on this phase |
|---|---|---|
| **Docker only. Never `npm run dev` / `next dev`.** | project memory § Dev Environment | Any verification that needs the app running uses `docker compose`; app at `http://localhost:3001` |
| **`docker` needs NO sudo** | project memory (verified 2026-08-14; re-verified this session — `docker compose ps` works bare) | No `sudo` in any task command |
| **NEVER pass a sudo password; it leaked to the public repo once** | project memory | No password in any command, ever. If a command truly needs sudo, ask the user to run it |
| Postgres at `localhost:5433` (host) / `postgres:5432` (in-network) | project memory | Determines the two working `drizzle-kit migrate` invocations (Q6) |
| Mailhog at `localhost:8025` | project memory | **But `SMTP_HOST` points at production — see Pitfall 9** |
| Migrations: `npx drizzle-kit migrate` | project memory § Migrations | Confirms generate+migrate, not push |
| Server actions return `{ success: true/false, error/id }` | project memory § Key Architecture | All three new actions must use this shape |
| Audit rows are written by a `crmBus` subscriber, never by mutations directly (`no-mutation-coupling.test.ts` polices it) | 41-CONTEXT § Established Patterns; verified | The dry run's zero-audit-row proof depends on it; do not write audit rows from anywhere new |
| `.planning` is gitignored but tracked — force-add individual files only | project memory | `git add -f .planning/phases/41-*/41-RESEARCH.md`; **never** `git add -f` a directory |
| GSD agents use the model from `.planning/config.json` | project memory | `model_profile: quality` → `zai-coding-plan/glm-5` for planning/execution/verification |
| Worktrees need 3 symlinks or every verification fails; verify the worktree base is not stale | project memory | `use_worktrees: true` and `parallelization: true` in config — the orchestrator must bootstrap each executor worktree |
| rtk hook elides redirected output — use Write/Edit, not `sed`/`head` into a file | project memory | Applies to executors writing files |

---

## Runtime State Inventory

This is **not** a rename/refactor/migration phase in the string-replacement sense, but it does add
columns and change runtime behaviour, so the categories are answered explicitly rather than skipped.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | `workflow_runs` (existing rows get `dry_run = false` via the column default — this is what makes the default-hidden filter safe); `notification_preferences` (existing rows get `email_workflow_failed = true` via default, matching the CONTEXT-locked opt-in-by-default); `workflows` (existing rows get `failure_alert_sent_at = NULL`, read as "claimable", so the first failure after migration alerts immediately — correct) | Code edit + migration. **No data migration script needed** — every default is the desired value for existing rows. |
| **Live service config** | None. No external service holds workflow configuration. Workflow definitions live in `workflows.nodes` (JSONB in this database), not in a third-party UI. Verified: the only external services in `.env` are an SMTP relay and Postgres itself, neither of which stores app config. | None |
| **OS-registered state** | None. All four background processors are started in-process by `instrumentation.ts:27-42` on server boot — there is no cron, no systemd unit, no pm2 saved process list, no Task Scheduler entry in this deployment (verified: `docker compose ps` shows three containers, no host scheduler involved). | None — **but** the app container must be restarted after migration so the compiled schema module picks up the new columns. |
| **Secrets / env vars** | No new env var is introduced. `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` are **read** by the new alert path via the existing `safeSend`; they currently point at a production relay, not mailhog (Pitfall 9). `INTERNAL_SECRET` is unrelated to this phase. | None to change. Verification tasks that need mailhog must temporarily override the three SMTP vars and revert. |
| **Build artifacts** | The Docker app image contains a compiled Next build; a schema change is not picked up without a restart (and a `next build` for a production image). `instrumentation.ts:36-42` carries a standing warning that its own build step ends in `2>/dev/null \|\| true`, so a chunk-layout change can silently kill all four processors — meaning a **behavioural** check is required after any rebuild, not just a passing test suite. | Restart the app container after migration. Gate: `docker compose logs app \| grep -F '[execution-processor] Starting'` must appear, or WFOPS-02 and WFOPS-03 are both dead in the running app while every unit test passes. |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker + compose | running the app, migrations | ✓ | app/postgres/mailhog all up | — (project mandates Docker) |
| PostgreSQL | all three schema changes | ✓ | **16** (`postgres:16-alpine`), host port 5433, healthy | — |
| `drizzle-kit` | generate + migrate | ✓ | ^0.31.9 (devDep, `npx`) | — |
| Node / npm | tests, typecheck, lint | ✓ | in-container and on host | — |
| vitest (3 projects) | the validation gates | ✓ | `vitest.config.ts` + `.rsc` + `.db`; `src/lib/execution` + `src/messages` = **228 tests PASS, 0 FAIL** (run this session) | — |
| Mailhog | WFOPS-03 manual verification | ✓ **running** at :8025 — **but the app is NOT pointed at it** | — | Assert on the `[email] Email sent to:` log line, or temporarily override the SMTP env vars (Pitfall 9) |
| `@testing-library/react` / jsdom | UI-SPEC gate G-6 as written | ✗ **absent** | — | **Source-scan wiring test (C-1).** Do not add a DOM environment for this. |
| Playwright | `e2e/viewport-320.spec.ts` | ✓ (`test:e2e`) | — | Not extended by this phase — UI-SPEC: R-1..R-5 are gated by source scan, not a new Playwright row |

**Missing dependencies with no fallback:** none.

**Missing dependencies with fallback:** `@testing-library/react` / DOM environment → source-scan gate.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (3 projects: default `node`, `rsc`, `db`) |
| Config file | `vitest.config.ts` (default), `vitest.rsc.config.ts`, `vitest.db.config.ts` |
| Quick run command | `npx vitest run src/lib/execution src/lib/triggers src/lib/workflows src/messages` |
| Full suite command | `npm test` (= `vitest run && vitest run --config vitest.rsc.config.ts`) |
| Excluded from `npm test` | `*.db.test.*` — needs a real Postgres; run via `npm run test:db` only |
| Companion gates | `npm run typecheck` (must stay 0 errors), `npm run lint` (must stay 0 errors / ≤127 warnings) |
| Baseline to preserve | ~3860 tests green; verified green this session for the two directories most touched (228/228) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WFOPS-01 | `createWorkflowRun` passes `replayedFromRunId` and `depth: 0` through to the insert | unit | `npx vitest run src/lib/triggers/create-run.test.ts` | ✅ extend |
| WFOPS-01 | recursion short-circuit branch also carries the options | unit | `npx vitest run src/lib/execution/recursion.test.ts` | ✅ extend |
| WFOPS-01 | only `failed` runs are replayable (pure predicate) | unit | `npx vitest run src/lib/workflows/__tests__/replay.test.ts` | ❌ Wave 0 |
| WFOPS-01 | replay control absent (not disabled) on non-failed runs — **G-6 reshaped per C-1** | source-scan | `npx vitest run "src/app/workflows/[id]/runs/[runId]/__tests__/replay-visibility.test.ts"` | ❌ Wave 0 |
| WFOPS-02 | engine sets `_dryRun` from the run **column**, and re-derives it on resume | unit | `npx vitest run src/lib/execution/engine.test.ts` | ✅ extend |
| WFOPS-02 | `crm` does not call any mutation under `_dryRun`, but still interpolates, coerces and resolves the target | unit | `npx vitest run src/lib/execution/actions/crm.test.ts` | ✅ extend |
| WFOPS-02 | `email` does not call `safeSend` under `_dryRun`, but still resolves recipients and still throws on zero | unit | `npx vitest run src/lib/execution/actions/email.test.ts` | ✅ extend |
| WFOPS-02 | `notification` does not call `safeSend` under `_dryRun` **(C-2)** | unit | `npx vitest run src/lib/execution/actions/notification.test.ts` | ✅ extend |
| WFOPS-02 | `http` does not `fetch` under `_dryRun`, but still runs `validateUrl` | unit | `npx vitest run src/lib/execution/actions/http.test.ts` | ✅ extend |
| WFOPS-02 | `webhook_response` leaves `pendingResponses` untouched under `_dryRun` | unit | `npx vitest run src/lib/execution/actions/webhook-response.test.ts` | ✅ extend |
| WFOPS-02 | every simulated output carries the same keys as its real counterpart | unit | same five handler test files (one shared key-set assertion) | ✅ extend |
| WFOPS-02 | dry runs hidden by default; `?dryRun=1` reveals; `dryRun=2` is not truthy | unit | `npx vitest run src/lib/workflows/__tests__/runs-filter.test.ts` | ❌ Wave 0 |
| WFOPS-02 | `dry_run` column is `notNull` with default `false` (Pitfall 1) | unit | `npx vitest run src/db/schema/__tests__/workflow-runs-columns.test.ts` | ❌ Wave 0 |
| WFOPS-02 | delay handling under dry run (whichever Pitfall-3 option is chosen) | unit | `npx vitest run src/lib/execution/engine.test.ts` | ✅ extend |
| WFOPS-03 | throttle claim: first call within the window sends, second is suppressed; window boundary respected | unit | `npx vitest run src/lib/execution/__tests__/failure-alert.test.ts` | ❌ Wave 0 |
| WFOPS-03 | absent preference row ⇒ send; `emailWorkflowFailed: false` ⇒ suppress | unit | same file | ❌ Wave 0 |
| WFOPS-03 | a failed **dry** run does not alert | unit | same file | ❌ Wave 0 |
| WFOPS-03 | processor re-reads terminal status and alerts only on `failed` | unit | `npx vitest run src/lib/execution/execution-processor.test.ts` | ✅ extend |
| WFOPS-03 | an alert throw does not abort a processor tick | unit | same file | ✅ extend |
| WFOPS-03 | end-to-end: a real failing run produces an email | manual-only | fail a workflow in Docker, inspect the `[email] Email sent to:` log line (see Pitfall 9) | manual — SMTP transport cannot be exercised in CI |
| WFOPS-04 | docs state the matrix | **none — CONTEXT: "No test gate."** | — | n/a |
| UI (G-1) | 25 new `workflows.*` keys in all 3 locales + exact contract | unit | `npx vitest run src/messages/locale-parity.test.ts` | ✅ extend (add `REQUIRED_WORKFLOWS_KEYS`) |
| UI (G-2) | `{runId}` survives translation | unit | same file (`placeholderDrift`) | ✅ extend |
| UI (G-2b) | every new `workflows.*` value differs from en-US in both pt-BR and es-ES | unit | same file (`untranslatedInBoth`) | ✅ extend |
| UI (G-3) | R-1..R-4 container classes present; `min-w-0` on the toolbar Input | source-scan | `npx vitest run src/app/workflows/__tests__/responsive-containers.test.ts` | ❌ Wave 0 |
| UI (G-4) | zero new palette utilities in the six touched files | source-scan | same file | ❌ Wave 0 |
| UI (G-5) | no new message key asserts absence of mutation | source-scan | `src/messages/locale-parity.test.ts` or the scan file | ❌ Wave 0 |
| UI (G-7) | no new shadcn component | command | `git diff --name-only src/components/ui/` is empty | n/a (plan check) |
| UI (G-8) | `dry-run-badge.tsx` has no `"use client"` | source-scan | the existing CFUI-01 gate covers the class; add the file | ✅ extend |
| UI (G-9) | no literal `{` / `}` in any new message value | source-scan | `src/messages/locale-parity.test.ts` | ✅ extend |

### Sampling Rate

- **Per task commit:** `npx vitest run <the touched test file(s)>` + `npm run typecheck`
- **Per wave merge:** `npm test` + `npm run typecheck` + `npm run lint`
- **Phase gate:** `npm test` fully green, typecheck 0 errors, lint 0 errors / ≤127 warnings, migration
  applied in Docker, `docker compose logs app | grep -F '[execution-processor] Starting'` present,
  then `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/lib/workflows/runs-filter.ts` + `src/lib/workflows/__tests__/runs-filter.test.ts` — WFOPS-02 filter default
- [ ] `src/lib/workflows/__tests__/replay.test.ts` — WFOPS-01 replayability predicate + run-input construction
- [ ] `src/lib/execution/failure-alert.ts` + `src/lib/execution/__tests__/failure-alert.test.ts` — WFOPS-03 throttle + preference + dry-run exclusion
- [ ] `src/db/schema/__tests__/workflow-runs-columns.test.ts` — Pitfall 1 (`notNull` + `default false`)
- [ ] `src/app/workflows/[id]/runs/[runId]/__tests__/replay-visibility.test.ts` — G-6 reshaped (C-1)
- [ ] `src/app/workflows/__tests__/responsive-containers.test.ts` — G-3 + G-4
- [ ] `REQUIRED_WORKFLOWS_KEYS` (23 dot-paths) + exact-contract assertion in `src/messages/locale-parity.test.ts` — G-1 (UI-SPEC L-41-2)
- [ ] No framework install needed — vitest is configured and green

### TDD applicability (config: `workflow.tdd_mode: true`)

The repo convention is a **recorded RED run before each fix** plus **source-scan gates for structural
claims** — verified from `40-01-PLAN.md`, which uses `<task type="auto" tdd="true">` with
*"Test file written and failing BEFORE the implementation (record the RED count in the summary)"*.

**Genuinely TDD-able — write the failing test first (`tdd="true"`):**

| Unit | Why it is a real TDD target |
|---|---|
| Dry-run gating in all five handlers | The assertion *is* the requirement: "the side effect was not invoked". Every handler test file already mocks `@/db`, `safeSend` and `fetch`, so RED is one added `it` block. |
| Engine `_dryRun` derivation (incl. resume) | `engine.test.ts` already mocks the DB; asserting the flag comes from the column and survives a resume is a clean RED. |
| Throttle logic | Extracted as a small module over one guarded UPDATE — RED-able with a mocked `db.execute` and zero DB. |
| Preference default (absent row ⇒ send) | A one-line branch with a real regression history in this repo. |
| Dry-run exclusion from alerts | One boolean; trivially RED. |
| Replay run-input construction + "failed only" predicate | Pure functions once extracted. |
| `createWorkflowRun` options passthrough | `create-run.test.ts` already mocks the insert. |
| `parseRunsSearchParams` | Pure; the whole reason to extract it. |
| `REQUIRED_WORKFLOWS_KEYS` | The archetypal TDD gate — write the 23 dot-paths, watch it go RED because the keys don't exist, then add them to three files. |
| Source-scan gates (G-3, G-4, G-6-reshaped, G-8, G-9) | RED by construction: the scan fails before `flex-wrap` / the conditional / the badge exists. |
| Processor status re-read + tick resilience | `execution-processor.test.ts` already mocks `executeRun` and `db.execute`. |

**NOT genuinely TDD-able — glue; verify with wiring/source-scan gates or manually (`tdd="false"`):**

| Unit | Why not |
|---|---|
| `dry-run-dialog.tsx` (JSON editor, poll loop, timeout) | Async client interaction with no DOM test environment. Use a `*-wiring.test.ts` source scan for the wiring facts (min-h/max-h classes, `readOnly` not `disabled`, both hint strings, `role="alert"`). |
| `replay-run-button.tsx` internals | Same. The one testable claim (visibility gating) is G-6-reshaped and lives in the page. |
| `notification-form.tsx` fourth row | Pure JSX copied verbatim from three siblings. Source-scan for the `id="workflow-failed"` ↔ `htmlFor` pairing and position-3 ordering. |
| The migration SQL | Verified by applying it; the *schema shape* claim (Pitfall 1) is the testable part and it is in Wave 0. |
| The email template's HTML | Existing `templates.test.ts` idiom: assert subject/text substitution, not markup. |
| `docs/admin/deployment/*.md` | CONTEXT: **"No test gate."** Do not add a docs-presence grep. |
| Actual email delivery | Manual, in Docker, with the SMTP caveat of Pitfall 9. |

---

## Security Domain

`security_enforcement` is not set to `false` in `.planning/config.json`, so this section is required.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `auth()` from `@/auth` in all three new server actions; no new credential path |
| V3 Session Management | no | No session handling changes; NextAuth JWT strategy untouched |
| V4 Access Control | **yes — decision required** | Session-only posture recommended (Pitfall 5), matching `triggerManualRun` and the run-detail page. **The dry-run flag is NOT an access-control boundary** — it must be re-derived server-side from the column on every engine entry, never trusted from a client payload or from the persisted context JSON |
| V5 Input Validation | **yes** | The dry-run trigger data is user-supplied JSON. The server action must `JSON.parse` and re-assert "plain object, not array/null/scalar" **server-side** — the client's parse is UX, not a trust boundary. Zod is already the repo's validator (`settings/notifications/actions.ts:10-14`); use it for the `emailWorkflowFailed` field. `runId` params go through drizzle parameterisation |
| V6 Cryptography | no | No crypto introduced. Run ids use `crypto.randomUUID()` (`workflows.ts:36`); the webhook secret path is untouched |
| V7 Error Handling & Logging | yes | The alert email contains `workflow_runs.error`, which can embed an HTTP response body (`http.ts:109-111` slices 200 chars into the message). Treat it as untrusted: HTML-escape it in the template, and consider truncating |
| V12 Files & Resources | no | No file handling |
| V13 API / SSRF | **yes** | `validateUrl` (`ssrf.ts:48-74`) must **still run** under dry run. Removing it would let a dry run "prove" a URL is fine that a real run rejects, and would turn the dry-run path into an SSRF oracle via DNS resolution timing |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client-asserted dry-run flag reaching the engine | Tampering | Flag is derived from `workflow_runs.dryRun` at `engine.ts:165`; the action decides once at insert. Never read from the request or from `run.context` |
| Hand-edited `workflow_runs.context` jsonb flipping a dry run to real on resume | Tampering | Same: the column is authoritative on every resume. This is the specific reason not to read the flag from the restored context |
| Replay amplification (each replay re-fires every already-succeeded email/HTTP/CRM write) | Repudiation / Denial of Service | Locked confirm dialog (`replay.confirmBody`), `failed`-only visibility, `replayedFromRunId` audit trail, and `depth` re-bounding the downstream cascade at 5 |
| Dry run as a free email/HTTP generator | Denial of Service | The five handler gates. Note the *residual*: an authenticated user can still enqueue unlimited dry runs; serial enforcement caps concurrency at 1 per workflow, and no rate limit exists. Out of scope, worth recording |
| Failure alert as a mail-amplification vector | Denial of Service | The 60-minute per-workflow throttle, claimed atomically. Without it, a workflow failing every 5s emits ~17,000 emails/day and gets the sending domain blocked |
| Alert email leaking CRM data to the workflow author | Information Disclosure | Recipient is `workflow.createdBy` only — the person who authored the automation. Do **not** widen to all admins. Keep `run.error` in the body minimal/escaped rather than dumping node output |
| Injection via trigger data into SQL | Tampering | Drizzle parameterisation throughout; no raw interpolation of user data into `sql` templates in this phase |
| Stored XSS via `run.error` rendered in HTML email | Tampering | Escape it in the template (the existing templates interpolate translator output, not raw user data — this one interpolates a run error, which is new) |
| Enumeration of other users' runs via the replay action | Information Disclosure | The action must scope by `workflowId` **and** `runId`, exactly as `runs/[runId]/page.tsx:32` does with `and(eq(id, runId), eq(workflowId, id))` |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 60 minutes is the right throttle window | Q5 | Too long ⇒ a sustained outage goes quiet after one email. Too short ⇒ relay rate limiting. The constant is exported and one-line changeable; low risk. **Discretion item, so this is a recommendation not a finding.** |
| A2 | A failed **dry** run should not send an alert | Failure Alerting | If the user wants alerts for test runs, one condition inverts. My reasoning: the operator is watching the dialog. Low risk, easily reversed. |
| A3 | Skipping delays under dry run (Pitfall 3 option a) is preferable to letting them park | Pitfall 3 | If a plan needs delay fidelity in a dry run, option (b) is available at the cost of the timeout path and the production-blocking `waiting` row. **This is the biggest open judgment call in the phase — the planner must decide explicitly.** |
| A4 | Session-only auth (not admin) for replay and dry run | Pitfall 5 | If the intent really was admin-only, the button 403s for the non-admins who see it. Evidence strongly favours session-only (STATE.md, `triggerManualRun`, the run-page's documented posture) but CONTEXT's wording says "including its admin gate". **Planner must record the choice.** |
| A5 | Localising the failure template (C-4 option A) is right | C-4 | Adds `emails.workflowFailed.*` keys the UI-SPEC's 25-key manifest did not enumerate. Option B is a valid alternative. **Planner must record the choice.** |
| A6 | Adding a 4th column (`failureAlertSentAt`) is acceptable despite CONTEXT saying "three schema additions" | Q5 | If the planner insists on exactly three, the derive-from-`workflow_runs` fallback exists with the documented semantic cost. |
| A7 | Filtering `recent-runs-mini.tsx` is a query change, not an out-of-inventory UI surface | Pitfall 6 | If the UI checker reads it as a scope violation, the plan needs to say so up front. Recommended: state it explicitly in the task. |
| A8 | `bare-metal.md` gets an optional one-line cross-reference | WFOPS-04 insertion points | Purely additive; omitting it is still CONTEXT-compliant. |
| A9 | The simulated `crm` create output including `interpolatedFields` covers most downstream reads | Q1 | Some transforms will still read a field the node never wrote and get `undefined`. Documented as a known limitation; no complete fix exists short of a real write. |

**Everything not in this table was read from source this session and is `[VERIFIED]`.**

---

## Open Questions

1. **Delay nodes under dry run (A3).**
   - What we know: delays are engine-level, not handler-level; a dry run with a delay parks as
     `waiting` and blocks every real run of that workflow via serial enforcement.
   - What's unclear: whether the phase wants delay fidelity in a test run.
   - Recommendation: **skip delays under dry run** (Pitfall 3 option a). ~6 lines, one test. If the
     planner declines, the plan must document the production-blocking consequence and lean on the
     locked `dryRun.timeout` toast.

2. **Auth posture for the two new actions (A4).**
   - What we know: the run-detail page and `triggerManualRun` are session-only; `replayDelivery` is
     admin-only; workflows are not owner-scoped (STATE.md).
   - What's unclear: whether CONTEXT's "including its admin gate" was prescriptive.
   - Recommendation: **session-only**, and say so in the plan so it is a recorded decision.

3. **Failure-template localisation (A5).**
   - Recommendation: **localise** as `emails.workflowFailed.*`, on the grounds that the two
     un-localised templates carry *user-authored* content and this one carries the app's own voice.
     Record whichever way it goes, because it changes the key count the UI-SPEC published.

4. **Whether to close the two WFOPS-03 coverage gaps.**
   - What we know: recursion-limit failures and synchronous webhook-response failures never reach the
     processor, so neither alerts.
   - Recommendation: **document both, close neither.** Closing them means putting alert logic in
     `create-run.ts` (inside live runs and inside the webhook request) or in the webhook route — both
     against the letter and the spirit of the locked hook placement.

5. **Whether to fix `processWaitingRuns`' claim while documenting it.**
   - What we know: the fix is ~3 lines (`AND status = 'waiting'` on the step UPDATE + a zero-row skip).
   - Recommendation: **document as UNSAFE, do not fix.** It matches the phase's posture and
     REQUIREMENTS.md's out-of-scope framing. Record it as a deferred idea with the fix sketched, so the
     next phase does not have to rediscover it.

---

## Sources

### Primary (HIGH confidence — direct source reads, this session)

- `src/lib/execution/engine.ts` (all 562 lines) — context construction (152-165), action dispatch (253, 505), delay handling (324-364, 459-494), `failRun` (551-562)
- `src/lib/execution/execution-processor.ts` (all 208 lines) — pending claim (115-133), waiting resume (162-205), stale reclaim (70-102)
- `src/lib/execution/types.ts`, `recursion.ts`, `actions/registry.ts`, `actions/index.ts`
- `src/lib/execution/actions/{crm,email,http,notification,webhook-response,transform,interpolate,ssrf}.ts`
- `src/lib/triggers/{create-run,manual-trigger,schedule-processor}.ts`
- `src/db/schema/{workflows,notification-preferences,digest-log,users,activities}.ts`
- `src/db/index.ts` — postgres-js, no transaction wrapper (basis of the `processWaitingRuns` finding)
- `src/app/api/webhooks/in/[workflowId]/[secret]/route.ts` — the synchronous path (97-144)
- `src/app/api/internal/email/process/route.ts` — `reminderSentAt` and `digest_log` precedents
- `src/app/workflows/actions.ts`, `src/app/admin/webhooks/actions.ts` (`replayDelivery`, 90-108)
- `src/app/workflows/[id]/runs/page.tsx`, `runs/components/{status-filter,runs-table}.tsx`
- `src/app/workflows/[id]/runs/[runId]/page.tsx`, `src/app/workflows/[id]/components/recent-runs-mini.tsx`
- `src/app/workflows/[id]/edit/components/toolbar.tsx`
- `src/app/settings/notifications/{page.tsx,actions.ts,notification-form.tsx}`
- `src/lib/email/{send.ts,templates/*}`, `src/lib/audit/{actor-context,linked-records}.ts`
- `src/components/custom-fields/__tests__/source-scan.ts` — `elementRegion` (247), `enclosingConditional` (290)
- `src/messages/locale-parity.test.ts` — contract idiom (1015-1060, 1265-1300); `src/messages/en-US.json`
- `package.json`, `vitest.config.ts`, `drizzle.config.ts`, `drizzle/meta/_journal.json`, `src/instrumentation.ts`
- `.planning/{STATE,ROADMAP,REQUIREMENTS,config.json}`, `41-CONTEXT.md`, `41-UI-SPEC.md`
- `.planning/phases/40-saved-views-shared-filters/40-01-PLAN.md` — the `tdd="true"` / RED-count convention
- Live environment: `docker compose ps` (postgres **16**-alpine healthy, app up, mailhog up); `.env` variable names (values not reproduced); `npx vitest run src/lib/execution src/messages` → **228 PASS / 0 FAIL**

### Secondary (MEDIUM confidence)

- PostgreSQL READ COMMITTED `UPDATE`-lock re-evaluation semantics and PG 11+ non-volatile-default
  `ADD COLUMN` behaviour — standard documented behaviour, applied to code read here. Cross-checked
  against the repo's own comments, which state the same properties for the same queries
  (`execution-processor.ts:107-109`, `create-run.ts:56-60`).

### Tertiary (LOW confidence)

- None. **No external library research was performed and none was needed** — this phase adds no
  dependency. Nothing in this document rests on training-data recall about a third-party API.

---

## Metadata

**Confidence breakdown:**

- **Standard stack: HIGH** — zero new packages; every version read from `package.json`.
- **Architecture / the seven questions: HIGH** — every answer traced to a cited line, and the two
  "no change needed" answers (Q2, Q3) verified by reading the mechanism rather than inferring it.
- **Pitfalls: HIGH** — 8 of 9 derive from a specific line of this repo. Pitfall 3's *recommendation* is
  a judgment call (A3); the *hazard* is verified.
- **The four corrections (C-1..C-4) and the `processWaitingRuns` finding: HIGH** — each is a negative
  claim verified by exhaustive search, not by absence of evidence: no DOM test dep in `package.json`
  and no `@vitest-environment` pragma anywhere in `src/`; `safeSend` grepped across all handlers;
  `db.execute` traced to a transaction-free postgres-js client.
- **Migration mechanics: HIGH** — journal, config, scripts and the live PG version all read directly.
- **Throttle-window value (60 min): MEDIUM** — a reasoned recommendation on an explicit discretion
  item, not a discovered fact.

**Research date:** 2026-08-22
**Valid until:** 2026-09-21 (30 days). Findings are anchored to this repo at commit `739fc1d`; the only
thing that invalidates them is someone editing the cited files. There is no external dependency whose
churn could stale this document.
