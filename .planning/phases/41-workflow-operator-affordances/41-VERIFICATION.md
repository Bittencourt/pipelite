---
phase: 41-workflow-operator-affordances
verified: 2026-08-22T23:05:00Z
status: passed
score: 3/4 success criteria met in source; 0/4 met in the running application
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  note: "Initial verification. No prior 41-VERIFICATION.md existed."
gaps:
  - truth: "User dry-runs a workflow from the editor against sample trigger data, sees per-node output, and can confirm no CRM record changed"
    status: failed
    reason: >-
      The running app container contains NONE of Phase 41's code. Its baked image was built
      2026-08-22 12:32 -03; the phase's first commit is 20:21 and the crm dry-run gate landed
      20:52. `docker-compose.yml`'s `app` service is `build: .` with no volumes, so the
      `docker compose restart app` performed by 41-01 restarted the SAME stale image. The
      0019 migration WAS applied (from the host, against port 5433), so the database now has
      `dry_run` while the running code has no notion of it. Demonstrated empirically, not
      inferred: a `dry_run = true` run inserted for `audit36-wf` (one `crm_action` update
      node) was claimed by the live processor and PERFORMED A REAL CRM WRITE —
      `people.updated_at` moved from 2026-08-16 15:22:43.119 to 2026-08-23 01:53:59.939 and
      the step output was `{"success": true}` with NO `simulated` key, i.e. the real mutation
      path, not `simulateUpdate`. Verified directly in the container: `crm.ts` and `engine.ts`
      contain 0 occurrences of `_dryRun` (host has 3 and 5), and
      `src/lib/execution/failure-alert.ts` DOES NOT EXIST there. The phase's own required
      deployment check — `docker compose logs app | grep -F '[execution-processor] Starting'`
      — cannot detect this, because that log line predates the phase and passes on a stale
      build. WFOPS-01, WFOPS-02 and WFOPS-03 are all dead in the running application, and
      WFOPS-02 is worse than dead: a button labelled "Test run" would execute for real.
      Had the probe workflow contained a `notification` or `email` node, this would have sent
      real mail through the `.env` relay at `SMTP_PORT=465` — amendment A1's exact harm.
    artifacts:
      - path: "docker-compose.yml"
        issue: "`app` service is `build: .` with no bind mount, so `restart` never picks up new source; only a rebuild does."
      - path: ".planning/phases/41-workflow-operator-affordances/41-01-SUMMARY.md"
        issue: >-
          Line 149 records `docker compose restart app` and line 162 even records the smoking
          gun ("consistent with the image predating 0019"), but the task was signed off on the
          strength of six boot lines rather than on the presence of the phase's own code. The
          restart also happened in WAVE 1, before waves 2-4 wrote every gate, every UI surface
          and the entire alert path — so even a correct rebuild at that point would have been
          superseded.
    missing:
      - "Rebuild and restart the app image: `docker compose up -d --build app`"
      - >-
        Re-verify with a check that a restart cannot satisfy — e.g. assert
        `grep -c _dryRun /app/src/lib/execution/engine.ts` is non-zero inside the container,
        or assert the container's git SHA / BUILD_ID matches HEAD. Replace the
        `[execution-processor] Starting` grep, which is a pre-existing line and therefore
        vacuous as a deployment gate.
      - >-
        After the rebuild, re-run the dry-run probe and confirm the step output carries
        `simulated: true` and that `people.updated_at` does NOT move.
  - truth: "Deployment docs state the webhook-response single-instance constraint and which engine components are already multi-instance safe"
    status: partial
    reason: >-
      The substance is correct and I verified it independently: both unsafe components are
      named, the safe components are named too (the CONTEXT § Specific Ideas requirement), the
      safe claim is narrowed away from REQUIREMENTS.md's looser wording, and the
      "Safe — repaired in this release" verdict on delay resume is TRUE — `processWaitingRuns`
      really does claim inside `db.transaction` with a `WHERE status = 'waiting'` guard, and I
      proved that guard is gated by breaking it. But every single
      `execution-processor.ts` line citation in the matrix is stale, in BOTH docs. This is
      review finding IN-02, dispositioned "not fixed — out of scope", and unlike
      `replay.confirmBody` it was never recorded in BACKLOG.md. It is worse than merely stale:
      the "waiting resume" row cites `:162-169`, which today is the start of the PENDING claim
      SQL — a reader following the citation lands on different code that looks plausible and
      concludes the row is about something it is not. 41-04's own recorded rationale applies:
      "a doc citing a path that does not exist invites a reader to conclude the whole matrix
      is stale."
    artifacts:
      - path: "docs/admin/deployment/vercel.md"
        issue: "Lines 270-272 cite `execution-processor.ts:115-133`, `:87-95`, `:162-169`. Actual: pending claim 158-211, reclaim 106-149, waiting resume 238-329. Line 87 is a closing brace; 95 is a docstring line; 115 is inside the reclaim's orphaned-steps subquery; 133 is the reclaimedRows read; 162 is the start of the PENDING claim; 169 is inside its NOT EXISTS."
      - path: "docs/admin/deployment/docker.md"
        issue: "Lines 261-263 carry the same three stale citations."
    missing:
      - "Re-derive the four line ranges, or cite function names (`processPendingRuns`, `reclaimStaleRuns`, `processWaitingRuns`) so they cannot rot."
      - "Or: record IN-02 in BACKLOG.md so the deviation is auditable rather than silent."
deferred: []
human_verification:
  - test: "After `docker compose up -d --build app`, open a workflow containing a crm_action node in the editor, click Test run, submit trigger data, and land on the run detail page."
    expected: "Per-node output is present and the crm step's output shows `simulated: true`; the Changed Records panel renders its EMPTY state; a Test run badge appears; the CRM record's updated_at does not move."
    why_human: "The criterion is discharged by a rendered ABSENCE in a normally-populated panel. No unit test can witness that the operator sees the empty state rather than a missing section, a spinner or an 'unavailable' degraded render. No human or agent has driven this UI at any point in the phase."
  - test: "Fail a run, open its detail page, click Replay run, confirm the dialog, and inspect the resulting run."
    expected: "A NEW run row appears with its own step history, and a lineage line links back to the original run's first 8 characters."
    why_human: "The path spans a server action, an asynchronous processor claim and two page renders. Unit tests mock the driver; nothing has exercised the real sequence."
  - test: "Replay a failed TEST run (the CR-01 path) and confirm the replay is also a test run."
    expected: "The new run carries the Test run badge, is hidden from the default runs list, sends no mail, and writes no CRM record."
    why_human: "This is the review's only Critical finding. The fix is correct in source and I proved its gate fires, but the two-click path from a Test-run-badged page has never been walked in a browser. Note the KNOWN open item: `replay.confirmBody` still over-states consequence for a test-run replay (already in BACKLOG.md with the fix specified)."
  - test: "Fail a real (non-dry) workflow run in Docker and inspect the app log for the `[email] Email sent to:` line."
    expected: "One line naming the workflow author's address; a second failure inside 60 minutes produces none."
    why_human: "SMTP transport cannot be exercised in CI, and `.env` points SMTP_PORT=465 at a REAL relay, not mailhog. Override SMTP to mailhog (localhost:1025) before exercising delivery. 41-VALIDATION.md declares this manual-only."
  - test: "Measure `scrollWidth === clientWidth` at 320px on /workflows/[id]/runs, /workflows/[id]/runs/[runId] and /workflows/[id]/edit, in all three locales."
    expected: "No horizontal overflow on any of the touched rows."
    why_human: "`e2e/viewport-320.spec.ts` measures 7 routes and none under /workflows. The G-3 source scan proves the classes are declared, not that layout does not overflow. 41-VALIDATION.md declares this manual-only."
---

# Phase 41: Workflow Operator Affordances — Verification Report

**Phase Goal:** A failed or unproven workflow has a recovery path that does not require re-triggering by hand.
**Verified:** 2026-08-22T23:05:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification.

## Headline

The phase's **source code is in excellent shape**. All four affordances are implemented, wired, and
guarded by gates that I proved actually fire. I performed **20 deliberate source breaks** across
every guard the phase depends on, and **19 of 20 were caught** by the phase's own tests.

**The phase goal is nevertheless not achieved in the running application, and the failure is
demonstrated rather than inferred.** The app container holds an image built ~8 hours before the
phase's first commit. It contains none of Phase 41's code, while the database migration IS applied.
I inserted a `dry_run = true` run for a real single-node CRM workflow, the live processor claimed it,
and it **performed a real CRM write**. This is exactly the false-green that 41-CONTEXT named as a
required task, missed because the check it prescribed (`grep '[execution-processor] Starting'`) is a
pre-existing log line that passes on a stale build.

One command closes it: `docker compose up -d --build app`.

---

## What I EXECUTED vs. what I READ

### Executed (evidence I produced)

| Gate | Command | Result |
|---|---|---|
| Full suite | `npm test` | exit 0 — **4406 passed / 32 skipped**, RSC **8/8**. Matches the expected baseline exactly. |
| Types | `npm run typecheck` | exit 0 — **0 errors** |
| Lint | `npm run lint` | exit 0 — **0 errors, 124 warnings**. Tree is fully clean (`git status -uall` empty, no untracked Phase 38 `.mjs`), so 124 is the clean-tree count. Not a finding. |
| Live-DB probes that `npm test` skips | `DATABASE_URL=… vitest run src/lib/export/formatters-live.test.ts src/lib/audit/export-events-live.test.ts` | **28 passed / 2 files**. Did NOT self-skip — real queries ran (e.g. "LIVE activity status counts … total 79022"). |
| Migration applied live | `psql information_schema.columns` | `workflow_runs.dry_run` boolean **NOT NULL DEFAULT false**; `replayed_from_run_id` text nullable no default; `workflows.failure_alert_sent_at` timestamp nullable no default; `notification_preferences.email_workflow_failed` boolean **NOT NULL DEFAULT true**. All four correct. |
| Throttle SQL against real Postgres | claim + guarded release, verbatim from `failure-alert.ts`, inside `BEGIN … ROLLBACK` | Claim returned `claimed_at = 2026-08-23T01:53:08.232969` (microsecond text) and `previous = NULL`. **Second claim in-window returned 0 rows** — the throttle is real. Guarded release with the exact claimed_at text matched 1 row; a mismatched guard matched 0. Rolled back; column verified unchanged. |
| **Live dry-run end-to-end** | inserted `dry_run=true` run for `audit36-wf`, let the live processor execute it | **✗ FAILED — see BLOCKER G-1.** Step output `{"success": true}` (no `simulated` key); `people.updated_at` moved to the probe timestamp. A real mutation ran. |
| Running container's source | `docker exec … grep -c _dryRun` | `crm.ts` → **0** (host: 3). `engine.ts` → **0** (host: 5). `failure-alert.ts` → **does not exist**. Container `src` mtime Aug 22 15:31; the phase spans 20:21–22:45. |
| Probe cleanup | delete probe run + steps, restore `people` row | Verified: 0 probe runs, 0 probe steps, person restored to `touched by AUDIT36 workflow @ 2026-08-16 15:22:43.119`. |
| Working tree after all breaks | `git status --porcelain -uall` | **empty** — every deliberate break restored; HEAD still `dba1ea8`. |

### Read (source review, not execution)

CONTEXT + amendments A1-A5, UI-SPEC hooks, VALIDATION map, REVIEW (1 critical + 6 warnings + 6 info)
and the disposition table, 15 SUMMARYs, both WAVE handoffs, and the implementation files below. No
SUMMARY claim is carried into this report as evidence.

---

## Success Criteria

| # | Criterion | In source | In the running app |
|---|---|---|---|
| 1 | User re-runs a failed run from its detail page and gets a new run with its own step history | ✓ VERIFIED | ✗ absent (no `replayWorkflowRun` in the image) |
| 2 | User dry-runs from the editor, sees per-node output, and can confirm no CRM record changed | ✓ VERIFIED | ✗ **FAILED — executes for real (demonstrated)** |
| 3 | When a run fails, the user is notified rather than browsing run history | ✓ VERIFIED | ✗ absent (`failure-alert.ts` not in the image) |
| 4 | Deployment docs state the constraint and which components are already multi-instance safe | ⚠ substance correct, citations stale | n/a (docs) |

**Score: 3/4 in source (1 qualified); 0/4 in the running application.**

---

### Criterion 1 — Replay (WFOPS-01)

Traced end to end. `page.tsx:195` renders `{run.status === "failed" && (<ReplayRunButton …>)}` —
absent, not disabled, in exactly the verbatim shape the reshaped G-6 gate requires.
`replayWorkflowRun` (`actions.ts:304-362`) gates on session, scopes the lookup by BOTH ids, applies
`isRunReplayable(origin.status)` — the same predicate as the render site — and calls
`createWorkflowRun(…, { dryRun: origin.dryRun === true, replayedFromRunId })`.
`create-run.ts:52-56` builds `extra` conditionally so an absent option writes no key, which is
load-bearing against the `NOT NULL DEFAULT false` column, and spreads it into **both** branches
including the recursion short-circuit. A new pending row is inserted; the existing processor claims
it; steps are written per run id, so the new run owns its own history. The lineage line renders from
`run.replayedFromRunId`.

**CR-01 is genuinely fixed.** I removed `dryRun: origin.dryRun === true` → 3 tests failed. I removed
the origin's `dryRun` select → 3 tests failed, including one that exists specifically to stop the
flag being read as `undefined`.

### Criterion 2 — Dry run (WFOPS-02) — probed hardest

**The five gates, adversarially.** Exactly six handlers are registered (`crm_action`, `email`,
`http_request`, `notification`, `javascript_transform`, `webhook_response`). Five are side-effecting
and all five are gated; the sixth (`javascript_transform`) is pure QuickJS and runs for real by
design — I confirmed it builds its sandbox input as `{ trigger, nodes }` explicitly, so `_dryRun`
never crosses into the VM, and it performs no DB or network work.

- `crm.ts` — all three switch arms gated (329, 349, 368), each immediately before the mutation and
  after `interpolateDeep`/`coerceFieldMapping`/`resolveTargetId`. The `default:` arm throws, and
  grep confirms `mutations.create|update|delete` appear at exactly 3 sites, all below a gate. **No
  fourth path.**
- `email.ts:87` — below recipient resolution and the zero-recipient throw, above the only `safeSend`
  (grep: 1 call site).
- `notification.ts:53` — gates the in-loop `safeSend` (amendment A1). The `users` SELECT and both
  throws stay unconditional.
- `http.ts:103` — below `validateUrl` (no SSRF laundering) and above the retry loop.
- `webhook-response.ts:137` — above `sendWebhookResponse`.

`context._dryRun = run.dryRun === true` is set at `engine.ts:179`, at the single entry to
`executeRunGraph` (the only caller is `executeRun`), **below** the context restore and **above** the
resume read — so a resumed run re-derives the flag from the authoritative column and a hand-edited
`context` jsonb cannot promote a dry run. `=== true`, not a coercion.

**Amendment A2** holds: `engine.ts:363` takes the skip path under dry run, and `resolveDelay` is
still called above it, so a malformed config still throws.

**I searched for a sixth bypass and found none** — no early return, no alternate switch arm, no
resume path, and the replay path now inherits the flag.

**The zero-changed-records chain, traced and controlled.** `readRunChangedRecords`
(`linked-records.ts:182-192`) is the only reader of `audit_log.workflow_run_id` and joins on it via
the drizzle builder. `RunChangedRecords` is rendered **unconditionally** at `page.tsx:241` and
distinguishes three states — `failed` (read threw), `records.length === 0` (genuinely empty), and
populated — with `failed` checked FIRST, so a degraded render can never masquerade as an empty one.
Skipping the mutation *call* is what stops the `crmBus` event, hence the audit subscriber, hence the
row.

Crucially, I found a **control** that makes the empty state evidence rather than assertion: a
pre-existing REAL run of the same one-node workflow (`89920e4a…`) produced exactly **1 audit_log row**
for `audit36-test-person`. The panel is normally populated for this workflow. So an empty panel for a
dry run of the *same* workflow is a meaningful absence — which is precisely why the live probe result
matters so much.

### Criterion 3 — Failure alerting (WFOPS-03)

Three call sites, all confirmed in source and all outside their `try/catch` (correct per amendment
A4, since `executeRun` calls `failRun()` internally and returns normally):
`execution-processor.ts:145` (`reclaimStaleRuns`, per-reclaimed-id), `:207` (`processPendingRuns`),
`:326` (`processWaitingRuns`). Each goes through `alertOnRunFailure`, which awaits inside a `try`, so
neither a rejection nor a synchronous throw can abort a tick.

**Terminal-state coverage, enumerated independently.** I grepped every `status: "failed"` /
`failRun(` write in non-test source. The paths that alert nowhere are:

1. **Recursion-limit failures** (`create-run.ts:70`) — inserted already `failed`, never `pending`.
2. **Synchronous webhook-response runs** — the inbound route claims and executes inline
   (`route.ts:102,118`); the processor never sees them.
3. `toggleWorkflowActive` marking waiting runs failed — an operator's own deliberate action, so *not*
   alerting is correct, not a gap.

**Confirmed: still exactly the two known gaps, and both ARE documented** — `vercel.md:279-282` names
them under "Known alerting gaps", with `docker.md:268` cross-referencing. The
`internal/webhooks/process` route's `status: "failed"` writes are `webhook_deliveries`, not workflow
runs — irrelevant.

The throttle is a single guarded UPDATE with no preceding SELECT and the window as a bound parameter,
and I verified it **against the real database** (see the executed-gates table). WR-06's compensating
release is present and correctly guarded on the exact value this caller wrote, crossing as TEXT for
microsecond fidelity — I confirmed empirically that Postgres returns `.232969` and that a mismatched
guard matches zero rows, which is exactly the silent no-op the TEXT round-trip exists to avoid.

### Criterion 4 — Docs (WFOPS-04)

Substance verified independently: both unsafe components named; the safe components named too; the
safe claim narrowed away from REQUIREMENTS.md's looser wording; bare-metal cross-references docker.
The `"Safe — repaired in this release"` verdict on delay resume is **TRUE** — `processWaitingRuns`
claims inside `db.transaction`, the step UPDATE carries `WHERE status = 'waiting'`, and it `continue`s
rather than `break`s on a lost claim. WR-01's second guard on the run transition is present too.

**Out of scope respected.** `git diff dc377c5..HEAD -- webhook-response.ts` is `+31 -0`: a pure
insertion of the gate. `pendingResponses`, `waitForWebhookResponse` and `sendWebhookResponse` are
behaviourally untouched.

**But** every `execution-processor.ts` line citation in the matrix is stale in both docs — see gap 2.

---

## Anti-Vacuity: I broke the source and watched the gates

19 of 20 breaks were caught. Working tree restored and verified clean after every one.

| # | Break | Gate | Result |
|---|---|---|---|
| 1 | `run.status === "failed"` → `"completed"` at the render site | `replay-visibility.test.ts` | ✓ 1 failed |
| 2 | crm `create` arm gate → `if (false)` | `crm.test.ts` | ✓ 5 failed |
| 3 | removed notification's `!context._dryRun` | `notification.test.ts` | ✓ 4 failed |
| 4 | dropped `.notNull()` on `dry_run` | `workflow-runs-columns.test.ts` | ✓ 1 failed |
| 5 | `dry_run` default → `true` | same | ✓ 1 failed |
| 6 | removed A3 step-claim `status='waiting'` guard | `execution-processor.test.ts` | ✓ 1 failed |
| 7 | removed WR-01 run-transition guard | same | ✓ 1 failed |
| 8 | removed alert site 3 (reclaim loop) | same | ✓ 3 failed, incl. "invoked from all three terminal-state paths" |
| 9 | removed `dryRun: origin.dryRun === true` | `replay-carries-dry-run.test.ts` | ✓ 3 failed |
| 10 | removed the origin `dryRun` select | same | ✓ 3 failed |
| 11 | dropped `flex-wrap` from the R-2 row | `responsive-containers.test.ts` | ✓ 3 failed |
| 12 | added `text-blue-600` | same | ✓ 2 failed |
| 13 | deleted `workflows.dryRun.badge` from pt-BR | `locale-parity.test.ts` | ✓ 6 failed |
| 14 | removed failure-alert's `if (run.dryRun) return` | `failure-alert.test.ts` | ✓ 1 failed |
| 15 | removed the preference opt-out check | same | ✓ 1 failed |
| 16 | neutralised the throttle predicate → `true` | same | ✓ 2 failed |
| 17 | removed `emailWorkflowFailed` from the zod schema | `settings/notifications/actions.test.ts` | ✓ 1 failed (source-count scan only) |
| 18 | removed its DB write | same | ✓ 1 failed (source-count scan only) |
| 19 | `parseShowDryRuns` → `true` | `runs-filter.test.ts` | ✓ 17 failed |
| 20 | `parseShowDryRuns` → `Boolean(raw)` | same | ✓ 9 failed |
| — | **es-ES value made byte-identical to en-US** | `locale-parity.test.ts` | **✗ NOT caught** — see INFO-1 |

**41-15's gate file is real, not self-satisfying.** `responsive-containers.test.ts` carries 105 tests
and fired on both a removed `flex-wrap` (3 failures, including the "no unexempted flex row without
flex-wrap" sweep AND the negative that asserts the OLD non-wrapping string is gone — the
"added a wrapper and left the old row" defect) and on a single new palette utility (2 failures).

**The schema gate is not a mirror.** `workflow-runs-columns.test.ts` reads real Drizzle table
definitions through `getTableConfig`, never the schema file as text, and both the `notNull` and the
`DEFAULT false` breaks were caught separately.

---

## Requirements Coverage

| Requirement | Description | In source | Deployed |
|---|---|---|---|
| WFOPS-01 | Re-run a failed run from the run detail page | ✓ SATISFIED | ✗ absent |
| WFOPS-02 | Dry-run with per-node output, no CRM mutation | ✓ SATISFIED | ✗ **violated** |
| WFOPS-03 | Notified when a run fails | ✓ SATISFIED (2 documented coverage gaps, confirmed as exactly 2) | ✗ absent |
| WFOPS-04 | Deployment docs state the constraint + safe components | ⚠ PARTIAL (stale citations) | n/a |

No orphaned requirements: REQUIREMENTS.md maps only WFOPS-01..04 to Phase 41, and all four are
claimed by plans. The Out of Scope row "Horizontal scaling of webhook-response workflows" is
respected — verified by diff, not by claim.

---

## Anti-Patterns

| File | Pattern | Severity | Note |
|---|---|---|---|
| — | No unreferenced `TBD` / `FIXME` / `XXX` in any file this phase touched | — | Debt-marker gate passes |
| `docs/admin/deployment/{vercel,docker}.md` | Six stale source line citations | ⚠ Warning | gap 2 |
| `src/messages/locale-parity.test.ts` | `untranslatedInBoth` is AND across locales | ℹ Info | INFO-1, pre-existing |
| `src/app/settings/notifications/actions.test.ts` | Behavioral cases mirror the zod schema | ℹ Info | INFO-2 |

### INFO-1 — the translation gate is weaker than 41-VALIDATION.md describes

`untranslatedInBoth` (`locale-parity.test.ts:998-1005`) returns keys whose es-ES **and** pt-BR values
are both byte-identical to en-US. A key left untranslated in exactly ONE locale passes silently — I
demonstrated this by making `workflows.dryRun.title` in es-ES identical to en-US, and all 22 tests
still passed. 41-VALIDATION.md row G-2b describes it as "every new value differs from en-US in pt-BR
and es-ES", which overstates it; the function's own name and docstring are honest.

**Pre-existing, not a Phase 41 regression** — the helper dates to `fb0136d` (phase 36); Phase 41 only
added call sites. **And the substance is fine:** I independently checked all 25 contract keys
(23 `workflows.*` + 2 `settings.notifications.*`) and every one genuinely differs from en-US in BOTH
pt-BR and es-ES.

### INFO-2 — the notification-settings behavioral tests are a zod mirror

Removing `emailWorkflowFailed` from the zod schema, and separately removing its DB write, each broke
exactly ONE test: a source-count-parity scan ("mentions emailWorkflowFailed exactly as often as
emailWeeklyDigest"). The other 27 tests passed both times. The break WAS caught, so this is not a
gap — but the only real gate there is a proxy that detects removal, not inversion.

---

## Known deliberate decisions — confirmed present, NOT reported as gaps

Session-only auth on replay/dry-run (D-A4); `buildReplayRunInput` returning the envelope by
reference; no exported constant for the `"failed"` literal; `executeRun` outside the claim
transaction; a dry run skipping the delay WAIT while still calling `resolveDelay`; no test gate on
the WFOPS-04 docs; the two colocated test files (`workflow-runs-columns.test.ts`,
`failure-alert.test.ts`) diverging from 41-VALIDATION.md's `__tests__/` paths.

`replay.confirmBody` over-stating consequence for a test-run replay is **known and already in
BACKLOG.md** with the fix specified (`workflows.replay.confirmBodyDryRun`). Reported as known, not as
a new finding.

---

## Gaps Summary

**One blocker and one warning.**

The blocker is not a code defect — it is that **nothing this phase built is running.** The image
predates the phase by ~8 hours, `docker-compose.yml` gives the `app` service no bind mount, and
41-01's `docker compose restart app` therefore restarted the same stale bytes. The migration went in
from the host, so the schema advanced while the code did not, and the resulting skew is the dangerous
direction: the database advertises `dry_run` to code that has never heard of it. I did not infer
this — I ran a dry run against the live app and watched it write to the CRM. Had that workflow
carried a `notification` node, the probe would have sent real mail through a production relay, which
is amendment A1's stated worst case reached through a deployment gap instead of a code gap.

The phase's own deployment check could not have caught it. `[execution-processor] Starting` is a
pre-existing log line; it announces that *a* build booted, never *which* build. The replacement needs
to assert something only the new code can satisfy.

The warning is documentation accuracy on criterion 4. The safety verdicts are right and I verified the
one that mattered most — delay resume really is repaired — but a matrix whose every source citation
points at unrelated code undermines the reader's trust in the verdicts, and one citation actively
lands on the wrong function. It was dispositioned out of scope without being recorded, so unlike
`replay.confirmBody` it is currently a silent deviation.

**Finally, and stated plainly: not one of this phase's UI surfaces has been driven by a human or an
agent.** The replay button, the confirm dialog, the dry-run dialog's JSON editor, the bounded poll,
the navigation to the run page, the Test run badge, the lineage line, the changed-records empty state
and the 320px wrapping are all verified only as source and as source-scan gates. Those gates are
genuinely strong — I proved each one fires — but a source scan asserting `flex-wrap` is declared is
not a measurement that the row does not overflow, and a test asserting `records.length === 0` renders
an empty state is not a witness that an operator saw it. Five items are listed under
`human_verification`, and the first three cannot even be attempted until the rebuild lands.

---

_Verified: 2026-08-22T23:05:00Z_
_Verifier: Claude (gsd-verifier)_

---

## Orchestrator addendum — 2026-08-22, after verification

Both gaps this verification raised were closed by the orchestrator, and the BLOCKER was closed by
rebuilding and then re-proving behaviour against the running app rather than against source.

### Gap 1 (BLOCKER) — CLOSED

`docker compose up -d --build app` rebuilt the image (previous image was 10 hours old, predating every
commit in this phase). Freshness re-checked with assertions **only the new code can satisfy**, not the
pre-existing `[execution-processor] Starting` line that made the original check vacuous:

| Check, inside the container | Before rebuild | After rebuild |
|---|---|---|
| `failure-alert.ts` present | NO | **YES** |
| `_dryRun` occurrences in `crm.ts` | 0 | **3** (matches host) |
| `_dryRun` occurrences in `engine.ts` | 0 | **5** (matches host) |
| `_dryRun` occurrences in `notification.ts` | 0 | **2** |
| `replay.ts` present | — | **YES** |

All processors announced from the new build (`webhook`, `email`, `schedule`, `execution`,
`dedup-scan-cleanup`, `audit-prune`), migrations applied at boot, `curl /` → 200.

**Then the verifier's own harm probe was re-run on the rebuilt image and inverted.** Same workflow
(`audit36-wf`, one `crm_action` update node targeting `audit36-test-person`), same method — insert a
`dry_run = true` run, let the LIVE processor claim it:

| | Stale build (this verification) | Rebuilt build |
|---|---|---|
| Step output | `{"success": true}` — real mutation path | `{"success": true, "simulated": true}` |
| `people.updated_at` | moved to probe time | **unchanged** (`2026-08-16 15:22:43.119`) |
| `audit_log` rows for the run | (real write) | **0** |

The zero-audit-row result is **criterion 2's proof chain, end to end in the running application**:
dry run → processor claim → handler simulates → no `crmBus` event → no `audit_log` row → the existing
`run-changed-records.tsx` renders its empty state. That is the criterion met in behaviour, not asserted
from source.

Probe cleaned up: 0 residual runs, 0 residual steps, person row verified intact.

**Durable fix, so this cannot recur silently:** recorded in project memory that
`docker compose restart app` runs the OLD image (the service is `build: .` with no volumes), and that
`[execution-processor] Starting` is a pre-existing line which passes on any build and therefore proves
nothing. A freshness check must assert a symbol the current commit introduced.

### Gap 2 (WARNING) — CLOSED

All six `execution-processor.ts` citations in `vercel.md` and `docker.md` replaced with **function
names** rather than refreshed line numbers, because line numbers rot and had already rotted into being
misleading — the "waiting resume" row cited `:162-169`, which now falls inside `processPendingRuns`
(starts at 158), while `processWaitingRuns` is at 238. The safety verdicts themselves were correct and
were not changed.

### Still open, and unchanged by this addendum

**No human or agent has driven this phase's UI.** The three browser-dependent human-verification items
below are now *attemptable* (the rebuild unblocked them) but remain **unwitnessed**. The behavioural
probe above proves the dry-run engine path; it proves nothing about the dialog, the replay button, the
lineage line, or the 320px rows.

`replay.confirmBody` over-stating consequence for a test-run replay remains open in BACKLOG.md with its
fix specified.

---

## UI witnessed in a real browser — 2026-08-22, status advanced to `passed`

An agent drove real Chromium against the rebuilt image, reusing the stored admin `storageState` so no
password was handled. This closes the "no human or agent has driven this phase's UI" gap that stood
above. **All six Phase 41 checks PASS.**

| Check | Verdict | Observed |
|---|---|---|
| C2 — dry run from the editor | **PASS** | prefill from the last NON-dry run; polled then landed on a FINISHED run (no manual reload); per-node output `{"success": true, "simulated": true}` with `_dryRun: true` visible in the recorded step input; changed-records panel rendered `"This run didn't change any records."`, `recordRowCount=0` |
| C1 — replay a failed run | **PASS** | new run with its OWN step history + lineage line `"Replay of run e9cc99e1"`; confirm dialog plain not destructive (`bgDestructiveElements=0`, `alertTriangleIcons=0`) |
| **CR-01 regression** | **PASS** | origin `dry_run=t` → new run `dry_run=t`, `replayed_from_run_id` set, step output `simulated: true`, **zero** audit rows, **no** CRM write |
| Replay ABSENT on non-failed | **PASS** | `replayButtonCount=0`, and no disabled button on the page |
| Trigger disabled when dirty | **PASS** | `enabled=false`, with title + `aria-describedby` + a visible hint |
| `?dryRun=` exact match | **PASS** | `/runs` 4 rows/0 badges · `?dryRun=1` 8/4 · `?dryRun=2` 4/0 — a loose truthiness check would have shown 8 |
| 320px × 3 routes × 3 locales | **PASS** | **all 12** measurements `scrollWidth 305 === clientWidth 305`, measured on the worst-case header |

**Criterion 2's proof is a contrast, not an absence.** The same one-node workflow, replayed NON-dry,
rendered `"Records changed (1)"` with `"Audit Tester · Updated · 1 field"`. Same panel, same page,
populated. So the dry run's empty state is evidence that the gates fired, not an inconclusive blank —
which is exactly what UI-SPEC F-41-1 and CONTEXT's "the proof is the existing panel reading empty"
required, and what a reassuring sentence could never have established.

**Cleanup verified against the pre-run baseline:** 4 runs, 2 fixture runs, 4 run-steps, 3 audit rows
and 1 saved view created and removed; post-cleanup counts identical (`workflow_runs 2`,
`workflow_run_steps 2`, `audit_log 214`, `audit_log(export) 0`, `saved_views 0`).
`people.audit36-test-person` restored. `e2e/` back to exactly its 14 files, `git status --porcelain`
empty, no application source modified.

**One gap this witnessing leaves open, deliberately:** the three `/workflows` routes measured above have
**no permanent 320px coverage** — the spec was temporary by instruction, so `e2e/viewport-320.spec.ts`
still covers only its original 7 routes. The measurements are recorded here and nowhere else. Adding
those three routes to that spec is the durable follow-up.
