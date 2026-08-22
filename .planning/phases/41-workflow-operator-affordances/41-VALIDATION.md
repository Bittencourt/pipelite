---
phase: 41
slug: workflow-operator-affordances
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-22
---

# Phase 41 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `41-RESEARCH.md` § Validation Architecture, with the four CONTEXT amendments applied.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (3 projects: default `node`, `rsc`, `db`) |
| **Config file** | `vitest.config.ts` (default), `vitest.rsc.config.ts`, `vitest.db.config.ts` |
| **Quick run command** | `npx vitest run src/lib/execution src/lib/triggers src/lib/workflows src/messages` |
| **Full suite command** | `npm test` (= `vitest run` + `vitest run --config vitest.rsc.config.ts`) |
| **Estimated runtime** | ~35s quick · ~120s full |
| **Excluded from `npm test`** | `*.db.test.*` — needs real Postgres; `npm run test:db` only |
| **Companion gates** | `npm run typecheck` (0 errors) · `npm run lint` (0 errors, ≤127 warnings) |
| **Baseline to preserve** | 3860 passed / 32 skipped + RSC 8/8. Research verified 228/228 in the two most-touched dirs this session. |

---

## Sampling Rate

- **After every task commit:** `npx vitest run <touched test file(s)>` + `npm run typecheck`
- **After every plan wave:** `npm test` + `npm run typecheck` + `npm run lint`
- **Before `/gsd:verify-work`:** full suite green, migration applied in Docker, and
  `docker compose logs app | grep -F '[execution-processor] Starting'` present
- **Max feedback latency:** 35 seconds (quick run)

---

## Per-Requirement Verification Map

Task IDs are assigned by the planner; this map is keyed by requirement so the planner can attach each
row to a task and the checker can prove Dimension 8 coverage.

| Req | Behavior | Test Type | Automated Command | File |
|-----|----------|-----------|-------------------|------|
| WFOPS-01 | `createWorkflowRun` passes `replayedFromRunId` and `depth: 0` to the insert | unit | `npx vitest run src/lib/triggers/create-run.test.ts` | ✅ extend |
| WFOPS-01 | recursion short-circuit branch also carries the options | unit | `npx vitest run src/lib/execution/recursion.test.ts` | ✅ extend |
| WFOPS-01 | only `failed` runs are replayable (pure predicate) | unit | `npx vitest run src/lib/workflows/__tests__/replay.test.ts` | ❌ W0 |
| WFOPS-01 | replay control ABSENT (not disabled) on non-failed runs — G-6 reshaped | source-scan | `npx vitest run "src/app/workflows/[id]/runs/[runId]/__tests__/replay-visibility.test.ts"` | ❌ W0 |
| WFOPS-02 | engine sets `_dryRun` from the run COLUMN, and re-derives on resume | unit | `npx vitest run src/lib/execution/engine.test.ts` | ✅ extend |
| WFOPS-02 | `crm` calls no mutation under `_dryRun`, but still interpolates/coerces/resolves target | unit | `npx vitest run src/lib/execution/actions/crm.test.ts` | ✅ extend |
| WFOPS-02 | `email` does not `safeSend`, but still resolves recipients and still throws on zero | unit | `npx vitest run src/lib/execution/actions/email.test.ts` | ✅ extend |
| WFOPS-02 | **`notification` does not `safeSend` — amendment A1** | unit | `npx vitest run src/lib/execution/actions/notification.test.ts` | ✅ extend |
| WFOPS-02 | `http` does not `fetch`, but still runs `validateUrl` | unit | `npx vitest run src/lib/execution/actions/http.test.ts` | ✅ extend |
| WFOPS-02 | `webhook_response` leaves `pendingResponses` untouched | unit | `npx vitest run src/lib/execution/actions/webhook-response.test.ts` | ✅ extend |
| WFOPS-02 | every simulated output carries the same keys as its real counterpart | unit | the five handler test files (one shared key-set assertion) | ✅ extend |
| WFOPS-02 | **a delay node is a no-op under dry run and execution continues — amendment A2** | unit | `npx vitest run src/lib/execution/engine.test.ts` | ✅ extend |
| WFOPS-02 | dry runs hidden by default; `?dryRun=1` reveals; `dryRun=2` is not truthy | unit | `npx vitest run src/lib/workflows/__tests__/runs-filter.test.ts` | ❌ W0 |
| WFOPS-02 | `dry_run` is `notNull` with default `false` (nullable empties the list) | unit | `npx vitest run src/db/schema/__tests__/workflow-runs-columns.test.ts` | ❌ W0 |
| WFOPS-03 | throttle: first call in window sends, second suppressed, boundary respected | unit | `npx vitest run src/lib/execution/__tests__/failure-alert.test.ts` | ❌ W0 |
| WFOPS-03 | absent preference row ⇒ send; `emailWorkflowFailed: false` ⇒ suppress | unit | same file | ❌ W0 |
| WFOPS-03 | a failed **dry** run does not alert | unit | same file | ❌ W0 |
| WFOPS-03 | processor re-reads terminal status and alerts only on `failed` — A4 | unit | `npx vitest run src/lib/execution/execution-processor.test.ts` | ✅ extend |
| WFOPS-03 | **`reclaimStaleRuns`' lease-killed runs also alert — A4** | unit | same file | ✅ extend |
| WFOPS-03 | an alert throw does not abort a processor tick | unit | same file | ✅ extend |
| WFOPS-04 | **`processWaitingRuns` claim is transactional and guarded on `status='waiting'` — amendment A3** | unit | `npx vitest run src/lib/execution/execution-processor.test.ts` | ✅ extend |
| WFOPS-04 | docs state the two-unsafe-component matrix | none — CONTEXT: "No test gate" | — | n/a |
| UI G-1 | 25 new `workflows.*` keys in all 3 locales + exact contract | unit | `npx vitest run src/messages/locale-parity.test.ts` | ✅ extend |
| UI G-2 | `{runId}` survives translation | unit | same file (`placeholderDrift`) | ✅ extend |
| UI G-2b | every new `workflows.*` value differs from en-US in pt-BR and es-ES | unit | same file (`untranslatedInBoth`) | ✅ extend |
| UI G-3 | R-1..R-4 container classes present; `min-w-0` on the toolbar Input | source-scan | `npx vitest run src/app/workflows/__tests__/responsive-containers.test.ts` | ❌ W0 |
| UI G-4 | zero new palette utilities in the six touched files | source-scan | same file | ❌ W0 |
| UI G-5 | no new message key asserts absence of mutation (F-41-1) | source-scan | `src/messages/locale-parity.test.ts` | ❌ W0 |
| UI G-7 | no new shadcn component | command | `git diff --name-only src/components/ui/` is empty | plan check |
| UI G-8 | `dry-run-badge.tsx` carries no `"use client"` | source-scan | existing CFUI-01 gate + add the file | ✅ extend |
| UI G-9 | no literal `{` or `}` in any new message value | source-scan | `src/messages/locale-parity.test.ts` | ✅ extend |

---

## Wave 0 Requirements

- [ ] `src/lib/workflows/runs-filter.ts` + `__tests__/runs-filter.test.ts` — WFOPS-02 filter default
- [ ] `src/lib/workflows/__tests__/replay.test.ts` — WFOPS-01 predicate + run-input construction
- [ ] `src/lib/execution/failure-alert.ts` + `__tests__/failure-alert.test.ts` — WFOPS-03 throttle, preference, dry-run exclusion
- [ ] `src/db/schema/__tests__/workflow-runs-columns.test.ts` — `notNull` + `default false`
- [ ] `src/app/workflows/[id]/runs/[runId]/__tests__/replay-visibility.test.ts` — G-6 reshaped
- [ ] `src/app/workflows/__tests__/responsive-containers.test.ts` — G-3 + G-4
- [ ] `REQUIRED_WORKFLOWS_KEYS` (23 dot-paths) + exact-contract assertion in `src/messages/locale-parity.test.ts` — G-1
- [ ] No framework install needed — vitest configured and green

---

## Manual-Only Verifications

| Behavior | Req | Why Manual | Test Instructions |
|----------|-----|------------|-------------------|
| A real failing run produces an email | WFOPS-03 | SMTP transport cannot be exercised in CI, and **`.env` points `SMTP_PORT=465` at a real relay, NOT mailhog** (amendment A1) — so this must not be run casually against production credentials | Fail a workflow in Docker; inspect the `[email] Email sent to:` log line rather than a mailbox. To exercise delivery, override SMTP to mailhog (`localhost:1025`) first. |
| Replay produces a second run with its own step history | WFOPS-01 | The full path spans a server action, the processor claim and two page renders | Fail a run in Docker, click Replay, confirm a NEW run row appears with its own steps and a lineage line pointing at the original |
| A dry run's changed-records panel renders EMPTY | WFOPS-02 | This is the phase's headline proof and it is a rendered absence — the strongest form is a human seeing the normally-populated panel empty | Dry-run a workflow containing a `crm` node; confirm per-node output is present AND the changed-records panel shows its existing empty state |
| 320px: no horizontal overflow on the three touched rows | UI R-1..R-4 | `e2e/viewport-320.spec.ts` measures 7 routes and **none under `/workflows`** | Extend the existing e2e spec with the three `/workflows` routes, or measure `scrollWidth === clientWidth` manually at 320px in all 3 locales |

---

## Validation Sign-Off

- [ ] All requirements have an automated command or a declared manual path
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all ❌ W0 references above
- [ ] No watch-mode flags in any command
- [ ] Feedback latency < 35s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
