# Phase 41: Workflow Operator Affordances - Context

**Gathered:** 2026-08-22
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — 16 decisions across 4 areas, all accepted as recommended

<domain>
## Phase Boundary

A failed or unproven workflow gets a recovery path that does not require re-triggering by hand.

Four affordances, and nothing else:

1. **Replay** a failed run from its detail page (WFOPS-01)
2. **Dry-run** a workflow from the editor against sample trigger data, with per-node output and no
   CRM mutation (WFOPS-02)
3. **Alert** the operator when a run fails, instead of the failure waiting to be browsed (WFOPS-03)
4. **Document** the webhook-response single-instance constraint, and which engine components are
   already multi-instance safe (WFOPS-04)

**Explicitly OUT of scope**, and not by omission: actually making webhook-response horizontally
scalable. `.planning/REQUIREMENTS.md` § Out of Scope lists "Horizontal scaling of webhook-response
workflows — documented as a constraint (WFOPS-04) rather than engineered away this milestone". A plan
that starts refactoring the in-memory promise map has left the phase.

</domain>

<decisions>
## Implementation Decisions

### Replay (WFOPS-01)

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

### Dry run (WFOPS-02)

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

### Failure alerting (WFOPS-03)

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

### Single-instance constraint (WFOPS-04)

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

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets

- `createWorkflowRun(workflowId, triggerEnvelope, depth)` — `src/lib/triggers/create-run.ts:15`.
  Inserts a pending run; the processor claims it. Replay needs no new execution path.
- `replayDelivery(deliveryId)` — `src/app/admin/webhooks/actions.ts`. The pattern WFOPS-01 mirrors,
  including its admin gate and `revalidatePath`. Note it resets in place; see the replay decision for
  why this phase does not.
- `safeSend` (`src/lib/email/send.ts`) plus ten templates in `src/lib/email/templates/`.
  `workflow-notification.ts` is the closest analog for a new failure template.
- `notification_preferences` (`src/db/schema/notification-preferences.ts`) — three `email_*` booleans,
  all `.default(true).notNull()`. The fourth follows the same shape.
- `digest_log` — precedent for "we already sent this", relevant to alert throttling.
- Run detail UI already built: `run-step-list.tsx`, `step-detail.tsx`, `json-viewer.tsx`,
  `run-changed-records.tsx`, `run-status-badge.tsx` under
  `src/app/workflows/[id]/runs/[runId]/components/`.
- Action handler registry — `src/lib/execution/actions/registry.ts`, with handlers `crm.ts`,
  `email.ts`, `http.ts`, `transform.ts`, `webhook-response.ts`, `notification.ts`. The dry-run flag is
  consumed here.

### Established Patterns

- Server actions return `{ success: true/false, error/id }`.
- Admin gates read `session.user.role !== "admin"` from `auth()`; the app's visibility idiom is
  `owner || role === "admin"`.
- Audit rows are written by a `crmBus` subscriber, never by mutations directly
  (`no-mutation-coupling.test.ts` polices this).
- `audit_log.workflow_run_id` already links audit rows to runs — this is what makes the
  zero-changed-records dry-run proof work.
- TDD is on (`config.json: workflow.tdd_mode`), and this repo's convention is a RED run recorded
  before the fix, with source-scan gates for structural claims.

### Integration Points

- `src/app/workflows/[id]/runs/[runId]/page.tsx` — where the replay control lands.
- `src/app/workflows/[id]/edit/components/toolbar.tsx` — where the dry-run control lands.
- `src/lib/execution/execution-processor.ts` — the failure path the alert hooks into.
- `src/db/schema/workflows.ts` — `workflowRuns` (line 31) and `workflowRunSteps` (line 58).
- `docs/admin/deployment/{docker,vercel}.md` — WFOPS-04's target files.

</code_context>

<specifics>
## Specific Ideas

- The dry run's proof of non-mutation should be the existing changed-records panel reading empty, not
  a new "nothing happened" message. An empty list that is normally populated is evidence; a
  reassuring sentence is not.
- The WFOPS-04 matrix must name the SAFE components too. A reader who learns only that
  webhook-response breaks will reasonably conclude the whole engine is single-instance, which is
  false and would discourage a deployment that would have worked.

</specifics>

<deferred>
## Deferred Ideas

- **Making webhook-response multi-instance safe** (e.g. moving the promise map to postgres LISTEN/NOTIFY
  or Redis). Explicitly out of scope for v1.3 per REQUIREMENTS.md; WFOPS-04 documents the constraint
  instead.
- **A startup guard that warns when a replica-count env var exceeds 1.** Considered for WFOPS-04 and
  declined as beyond the requirement. Worth revisiting if the constraint is ever hit in practice.
- **An in-app notification surface.** WFOPS-03 uses email because no in-app surface exists. Building
  one is its own phase, and would let failure alerts, deal assignment and reminders share it.
- **Editing trigger data before a replay.** Deliberately kept out of the replay control; the dry run
  is where trigger data is authored.

</deferred>
