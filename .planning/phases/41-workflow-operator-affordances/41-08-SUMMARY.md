---
phase: 41-workflow-operator-affordances
plan: 08
subsystem: infra
tags: [email, i18n, next-intl, use-intl, drizzle, postgres, raw-sql, throttle, html-escaping, tdd, vitest]

# Dependency graph
requires:
  - phase: 41-01
    provides: "workflows.failureAlertSentAt and notificationPreferences.emailWorkflowFailed columns, migration 0019 applied"
  - phase: 41-03
    provides: "the five emails.workflowFailed.* keys in all three locale files, with deliberately NO {errorMessage} placeholder"
provides:
  - "FAILURE_ALERT_WINDOW_MINUTES = 60 — the per-workflow alert window, exported so a change is one line"
  - "claimFailureAlert(workflowId) — an atomic guarded UPDATE ... RETURNING over workflows.failure_alert_sent_at"
  - "maybeAlertOnRunFailure(runId) — detection, preference default, dry-run exclusion, single recipient, fire-and-forget send"
  - "getWorkflowFailedTemplate(workflowName, runUrl, errorMessage, locale) — localised, run error escaped and truncated"
  - "MAX_ERROR_CHARS = 500 — the run-error truncation bound, exported for the test"
affects: [41-12, 41-04, WFOPS-03, WFOPS-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "HTML escaping in an email template (first instance in src/lib/email/templates/)"
    - "Atomic claim as a throttle: a guarded UPDATE ... RETURNING instead of a read-then-write timestamp check"
    - "Untrusted value rendered OUTSIDE the translator, beside a localised label"

key-files:
  created:
    - src/lib/execution/failure-alert.ts
    - src/lib/execution/failure-alert.test.ts
    - src/lib/email/templates/workflow-failed.ts
  modified:
    - src/lib/email/templates/index.ts
    - src/lib/email/templates/__tests__/templates.test.ts

key-decisions:
  - "Throttle storage is workflows.failure_alert_sent_at, never digest_log (CONTEXT A5) — digest_log has no workflow key and its only reader returns 0 on an unexpected row, which would silently kill the weekly digest"
  - "The claim is a single guarded UPDATE ... RETURNING with no preceding SELECT, asserted negatively, so two replicas on the same processor tick cannot both send"
  - "The window is 60 minutes: ~17,000 emails/day unthrottled vs 24 at this window, and it matches the activity reminder's one-hour horizon"
  - "The run error is HTML-escaped, truncated to MAX_ERROR_CHARS = 500, and NEVER passed through the translator — no {errorMessage} placeholder was added to any locale file (T-41-15)"
  - "MAX_ERROR_CHARS is exported (beyond the plan's artifact list) so the truncation assertions read the constant instead of hardcoding 500"
  - "A failed DRY run returns BEFORE claimFailureAlert, so a test run cannot burn the window"
  - "An absent notification_preferences row means SEND, matching getNotificationPreferences' all-true default"
  - "safeSend is fired without await and with a .catch, and the whole body is wrapped, so a broken alert cannot abort a processor drain tick"
  - "The test file is COLOCATED at src/lib/execution/failure-alert.test.ts, not under __tests__/ as 41-VALIDATION.md says"

patterns-established:
  - "escapeHtml is deliberately LOCAL and unexported in workflow-failed.ts — a second consumer is when it gets promoted; no HTML-sanitiser dependency added"
  - "html gets escaped values, subject and text get raw ones, and the code states which value takes which path"
  - "failure-alert.test.ts loads the module under test with await import(...) inside each case, matching execution-processor.test.ts — a static import is hoisted above the mock consts"

requirements-completed: [WFOPS-03]

# Metrics
duration: 34min
completed: 2026-08-23
---

# Phase 41 Plan 08: Workflow Failure Alerting Summary

**A database-backed, atomically-claimed 60-minute per-workflow failure-alert throttle plus a localised alert email whose one untrusted value — the run error — is HTML-escaped, truncated to 500 characters, and rendered outside the translator.**

## Performance

- **Duration:** 34 min
- **Started:** 2026-08-22T23:30:10Z
- **Completed:** 2026-08-23T00:04:03Z
- **Tasks:** 3
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments

- `getWorkflowFailedTemplate` — the tenth template in `src/lib/email/templates/`, and the first one that escapes anything. The run error is escaped over `& < > " '`, truncated with a visible ellipsis, and rendered in its own monospace block beside `t('errorLabel')`.
- `claimFailureAlert` — a single guarded `UPDATE workflows SET failure_alert_sent_at = NOW() ... RETURNING id` with the window passed through `make_interval(mins => $n)`. Two replicas cannot both win it.
- `maybeAlertOnRunFailure` — re-reads the run's terminal status (there is no failure path to hook), excludes dry runs before claiming, treats an absent preference row as enabled, resolves exactly one recipient, and fires the send without awaiting it.
- 37 new tests, all green, with the security properties (escaping, brace survival, truncation, no-SELECT, no-`updated_at`, claim-not-burned, does-not-reject) each paired with an anti-vacuity assertion.

## Task Commits

Each task was committed atomically:

1. **Task 1: The localised failure template, with the run error escaped and truncated** — `b91d961` (feat)
2. **Task 2: claimFailureAlert — the atomic, parameterised-interval throttle** — `96f4ece` (feat)
3. **Task 3: maybeAlertOnRunFailure — detection, preference, dry-run exclusion, fire-and-forget** — `2befaa7` (feat)

_TDD note: each task's RED was measured, then the implementation replaced the measurement stub inside the same task, so each task is one `feat` commit rather than a test/feat pair. The RED counts are recorded below._

## RED counts (measured, not asserted)

Each task was run RED twice: once with the module genuinely absent (the honest pre-existence RED, which is a suite-collection failure and yields no per-case count), and once against a deliberately naive implementation, to prove the security assertions actually bite rather than passing vacuously.

| Task | RED #1 — module absent | RED #2 — naive implementation | GREEN |
|------|------------------------|-------------------------------|-------|
| 1 | 1 test file failed to collect, **0 tests executed** — `Cannot find module '../workflow-failed'` | **5 failed / 12 passed / 17 total.** The naive version interpolated the error and the workflow name raw with no truncation. Failing: html-escaping of the error, `& " ' >` escaping, brace survival, truncation, workflow-name escaping | 17 passed |
| 2 | 1 test file failed to collect, **0 tests executed** — `Cannot find module '/src/lib/execution/failure-alert'` | **3 failed / 6 passed / 9 total.** The naive version used `INTERVAL '60 minutes'` and also set `updated_at`. Failing: `make_interval` presence, parameterised-VALUES (window in `values`, not in `strings`), no-`updated_at` | 9 passed |
| 3 | n/a — module existed from task 2 | **19 failed / 9 passed / 28 total.** All 19 new `maybeAlertOnRunFailure` cases failed (`maybeAlertOnRunFailure is not a function`); the 9 task-2 cases stayed green | 28 passed |

The task-2 naive RED is the informative one: it shows the two negative SQL assertions (`updated_at`, `INTERVAL '`) failing on a version a reviewer would plausibly have written and approved.

## Contract for plan 41-12 (the wiring plan)

Wire these without guessing:

```ts
import { maybeAlertOnRunFailure } from "@/lib/execution/failure-alert"

await maybeAlertOnRunFailure(runId)   // Promise<void>
```

- **Signature:** `maybeAlertOnRunFailure(runId: string): Promise<void>`.
- **Return contract:** always resolves to `undefined`. It **never rejects** — the entire body is wrapped in a try/catch that only logs with the `[failure-alert]` prefix, and the send itself is fire-and-forget with its own `.catch`. Awaiting it is safe inside the processor's `while (true)` drain loop and costs four indexed single-row reads plus (at most) one UPDATE.
- **Idempotent per window:** calling it twice for the same run, or once each from two replicas, sends at most one email per workflow per 60 minutes. Calling it for a run that did not fail, or for a dry run, does nothing and burns nothing.
- **Call sites, per CONTEXT A4:** after `executeRun` returns in `processPendingRuns`, and for each id returned by `reclaimStaleRuns` (a run killed by the 5-minute lease is exactly the "fails silently forever" case, and it never passes through `executeRun`). The third site is the waiting-run resume path.
- **Nothing calls it yet.** Verified: `grep -rn "maybeAlertOnRunFailure" src` matches only `failure-alert.ts` and `failure-alert.test.ts`.
- `claimFailureAlert(workflowId: string): Promise<boolean>` is exported separately and is safe to call directly, but 41-12 should not need it — `maybeAlertOnRunFailure` owns the ordering.

## Files Created/Modified

- `src/lib/email/templates/workflow-failed.ts` (created) — `getWorkflowFailedTemplate` plus a local, unexported `escapeHtml` and the exported `MAX_ERROR_CHARS = 500`.
- `src/lib/execution/failure-alert.ts` (created) — `FAILURE_ALERT_WINDOW_MINUTES`, `claimFailureAlert`, `maybeAlertOnRunFailure`.
- `src/lib/execution/failure-alert.test.ts` (created) — **COLOCATED, not under `__tests__/`.** 19 + 9 = 28 cases.
- `src/lib/email/templates/index.ts` (modified) — one barrel export line, the eleventh.
- `src/lib/email/templates/__tests__/templates.test.ts` (modified) — 9 new `getWorkflowFailedTemplate` cases, in this directory's existing idiom.

**Deliberately NOT modified:** `src/lib/email/send.ts` (a wrapper there would `await safeSend` and re-introduce the rethrow into the processor tick), all three locale JSON files, any schema file, any migration, `src/db/schema/digest-log.ts` and its reader.

## Test path deviation — read this before verifying

**The gate for this plan is at `src/lib/execution/failure-alert.test.ts`, colocated.**

`41-VALIDATION.md` names `src/lib/execution/__tests__/failure-alert.test.ts`. That directory has no `__tests__/` subdirectory and never has: `engine.test.ts`, `execution-processor.test.ts`, `recursion.test.ts`, `condition-evaluator.test.ts`, `delay-resolver.test.ts` and `toggle.test.ts` are all colocated. Per CONTEXT's directory-convention rule ("test file placement follows the local convention of each target directory"), and per the wave-1 handoff which flags this exact file, the colocated path is deliberate. VALIDATION's command finds nothing; use:

```
npx vitest run src/lib/execution/failure-alert.test.ts src/lib/email/templates/
```

## Decisions Made

Beyond the plan's recorded decisions, three judgement calls:

1. **`MAX_ERROR_CHARS` is exported**, though the plan's artifact list names only `getWorkflowFailedTemplate`. The truncation assertions had to read the constant rather than restate 500, per the same reasoning the plan applies to `FAILURE_ALERT_WINDOW_MINUTES`. Additive and non-breaking.
2. **`MAX_ERROR_CHARS = 500`.** The untrusted input is a 200-character HTTP body preview plus its `HTTP <status>: ` prefix (`src/lib/execution/actions/http.ts:109-111`); 500 also holds the longest engine-authored error (the stale-run reclaim message) intact, while bounding the escaped html contribution to ~3 KB worst case.
3. **The workflow name takes two paths through the translator.** The plan's `<action>` said to pass the raw name to `t(...)` and escape only direct interpolations, but its `<behavior>` required `<b>` in the name to be escaped in the html — and `t('body', {workflowName})` output *is* interpolated into markup by this file. Resolution: `t('body', { workflowName: escapeHtml(name) })` for the html, `t('body', { workflowName: name })` and `t('subject', { workflowName: name })` raw for the text and the subject header. This satisfies both halves and avoids the double-escaped subject line the plan warned about. use-intl does not re-parse VALUES, so an escaped value passes through intact. The code states which value takes which path.

## Deviations from Plan

None requiring a deviation rule. No bugs found, nothing missing, nothing blocking. No package was installed (T-41-SC: this plan installs nothing, and no HTML sanitiser was added — the escaper is five replacements).

One structural note that is not a deviation: the plan's TDD tasks are recorded as one `feat` commit each rather than a `test` → `feat` pair, because the RED was *measured* (twice per task) and the measurement stub was replaced inside the same task rather than committed. The RED table above records the actual counts.

## Issues Encountered

**Vitest module-mock hoisting.** The first draft of `failure-alert.test.ts` used a static `import { ... } from "./failure-alert"`, which vitest hoists **above** the `const mockDb = ...` declarations, so the `@/db` mock factory ran first and threw `ReferenceError: Cannot access 'mockDb' before initialization` — a suite-collection failure with 0 tests, easy to misread as the module simply being absent. Fixed by loading the module with `await import("./failure-alert")` inside each case, which is exactly what `execution-processor.test.ts` does at lines 48-181. Worth knowing for any later plan that copies that mock header.

## Threat Flags

None. No new network endpoint, auth path, file access pattern or schema change. The one new trust boundary (`workflow_runs.error` → an HTML email) is already T-41-40/T-41-41 in the plan's register and is mitigated as specified.

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run src/lib/execution/failure-alert.test.ts` | 28 passed / 0 failed |
| `npx vitest run src/lib/email/templates/` | 17 passed / 0 failed |
| `npx vitest run src/messages/locale-parity.test.ts` (T-41-15 gate) | 22 passed / 0 failed |
| `npx vitest run` (full unit suite) | **4048 passed / 0 failed** (baseline 4011 + 37 new) |
| `npx vitest run --config vitest.rsc.config.ts` | **8 passed / 0 failed** |
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **0 errors, 125 warnings** (baseline ≤127) |
| throttle SQL contains `IS NULL`, `make_interval`, `RETURNING` | asserted, green |
| throttle SQL contains no `SELECT`, no `updated_at`, no `INTERVAL '` | asserted, green |
| `digest_log` untouched | `grep -rn digest` in both new modules → no match |
| no locale file, schema file or migration modified | `git diff --name-only c747ed3 HEAD` → 5 files, all listed above |
| `src/lib/email/send.ts` unmodified | confirmed |
| nothing calls `maybeAlertOnRunFailure` | confirmed |

## Self-Check: PASSED

- `src/lib/email/templates/workflow-failed.ts` — FOUND
- `src/lib/execution/failure-alert.ts` — FOUND
- `src/lib/execution/failure-alert.test.ts` — FOUND
- `b91d961` — FOUND
- `96f4ece` — FOUND
- `2befaa7` — FOUND

## Next Phase Readiness

- **Ready for 41-12.** The wiring contract is above; three call sites, one awaited call each, no new imports beyond `maybeAlertOnRunFailure`.
- **Ready for 41-04.** The two accepted coverage gaps (T-41-48: recursion-limit failures inserted already-`failed`, and synchronous webhook-response runs) are unclosed by design and are named in a doc comment on `maybeAlertOnRunFailure`, so the deployment section can cite the source.
- **No blockers.** No migration, no container restart, no environment variable, no external service configuration.
- One thing an operator will need to know eventually, and 41-04 is the place: the alert is silent when `SMTP_HOST` is unset, because `safeSend` skips with a `console.warn` (`send.ts:20-23`). That is pre-existing behaviour for all ten templates, not new here.

## User Setup Required

None — no external service configuration required.

---
*Phase: 41-workflow-operator-affordances*
*Completed: 2026-08-23*
