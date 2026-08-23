---
phase: 41-workflow-operator-affordances
plan: 07
subsystem: workflow-execution
tags: [dry-run, side-effects, smtp, ssrf, vitest, tdd, workflows]

# Dependency graph
requires:
  - phase: 41-workflow-operator-affordances
    provides: "ExecutionContext._dryRun?: boolean (plan 41-01) — the field all three gates read"
  - phase: 24-31-workflow-engine
    provides: "the action registry, handleEmail / handleNotification / httpHandler, validateUrl, safeSend"
provides:
  - "src/lib/execution/actions/email.ts — safeSend gated under _dryRun, recipient resolution and the zero-recipients throw preserved"
  - "src/lib/execution/actions/notification.ts — the FIFTH side-effecting handler gated (amendment A1), users SELECT and both throws preserved"
  - "src/lib/execution/actions/http.ts — the retry loop (fetch + exponential sleep) gated, validateUrl and the whole body build preserved"
  - "the simulated output shapes downstream transform/condition nodes read: email/notification { sent:false, simulated:true, recipientCount, recipients }, http { statusCode:200, headers:{}, body:{}, simulated:true }"
  - "a reusable frozen-fake-timer idiom for asserting 'no sleep was awaited' with zero real waiting"
affects: [41-09, 41-12, 41-14]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gate at the side effect, never above the resolution (Pitfall 2): every pre-existing throw still fires under _dryRun, so a dry run of a misconfigured node fails for the real reason"
    - "Computed key-set parity: the dry-run output's key set is asserted equal to the REAL output's key set plus exactly `simulated`, derived from both runs in the same test rather than listed twice"
    - "Anti-vacuity pairing: the dry-run half's zero-call assertion is only meaningful next to a non-zero assertion on the SAME mock from the real half — an unwired mock also reports zero"
    - "Frozen fake timers (`vi.useFakeTimers({ shouldAdvanceTime: false })`) + a `setTimeout` spy prove no backoff sleep was awaited without the test waiting: an awaited sleep simply never resolves"
    - "Source-order gate scan: where a preserved behaviour is not observable in the simulated output (the auto content-type), pin the gate's POSITION in the file instead of asserting nothing"

key-files:
  created: []
  modified:
    - src/lib/execution/actions/email.ts
    - src/lib/execution/actions/notification.ts
    - src/lib/execution/actions/http.ts
    - src/lib/execution/actions/__tests__/email.test.ts
    - src/lib/execution/actions/__tests__/notification.test.ts
    - src/lib/execution/actions/__tests__/http.test.ts

key-decisions:
  - "notification.ts is gated with amendment A1's rationale recorded verbatim in substance in the code comment, including the .env SMTP_PORT=465 real-relay fact — a later reader must not 'simplify' the gate away"
  - "email keeps a single early-return gate below the template build; notification gates the safeSend call INSIDE the row loop so emails.push stays unconditional and recipientCount/recipients stay real"
  - "http gates ABOVE the retry loop, so the exponential sleep is skipped too — a retryCount: 5 node would otherwise burn ~31s of the dry-run dialog's 30s budget (T-41-38)"
  - "validateUrl stays ABOVE the http gate deliberately, and an SSRF-blocked URL is asserted to still throw under _dryRun — dropping it would turn the dry-run path into an SSRF oracle (T-41-36)"
  - "The auto content-type's survival under dry run is pinned STRUCTURALLY (gate below the whole body build) plus behaviourally (interpolateDeep still called), because the mandated simulated output is deliberately `headers: {}` and exposes no request headers"
  - "The 'no sleep' assertion uses frozen fake timers rather than an elapsed-real-time bound: in RED the case failed by TIMING OUT at 5.05s on an awaited sleep, which is direct evidence the assertion detects the thing it claims to detect"

patterns-established:
  - "Pattern: hoist a vi.mock factory's inner fn to a module-level vi.fn so the handle survives the beforeEach vi.resetModules(), when a test must assert what a template builder received"
  - "Pattern: to prove a dry-run gate is not an early return, assert the handler's pre-existing throws with their EXACT messages under _dryRun"

requirements-completed: [WFOPS-02]

# Metrics
duration: 21min
completed: 2026-08-22
---

# Phase 41 Plan 07: Dry-Run Gates for email, notification and http Summary

**The three remaining side-effecting handlers now simulate under `_dryRun` — including `notification`, the fifth handler CONTEXT's enumeration missed, whose ungated `safeSend` was mailing real users from a real SMTP relay during a "test" run — while every resolution, lookup, interpolation and SSRF check above each gate still runs for real and every pre-existing throw still fires.**

## Performance

- **Duration:** ~21 min
- **Tasks:** 3 of 3
- **Files modified:** 6 (0 created, 6 modified)
- **Commits:** 6 (one `test` RED + one `feat` GREEN per task)

## TDD gate compliance

| Task | RED (actual counts) | GREEN | RED commit | GREEN commit |
|------|--------------------|-------|-----------|--------------|
| 1 — email | **3 failed / 8 passed** (11 total) | 11 passed / 0 failed | `8d98ba6` | `8d05cd8` |
| 2 — notification | **4 failed / 7 passed** (11 total) | 11 passed / 0 failed | `4d34169` | `ba5f48c` |
| 3 — http | **6 failed / 17 passed** (23 total) | 23 passed / 0 failed | `a264eb2` | `6d81547` |

Every RED run was executed and recorded before its handler edit. No test passed unexpectedly during RED; the cases that already passed in each RED run are the ones that assert *preserved* behaviour (the pre-existing throws, the real-run paths, the SSRF rejections) — they are regression guards, and they were expected to be green from the start.

Notable RED signal in task 3: `makes no request and no backoff sleep` failed by **timing out at 5052ms**, not by an assertion. Under frozen fake timers the ungated handler entered the retry loop, hit `await sleep(1000)`, and never resolved. That is the strongest possible evidence the assertion detects an awaited backoff rather than merely asserting a tautology.

## What shipped

### 1. `email` — `src/lib/execution/actions/email.ts`

Single early-return gate placed **below** `resolveRecipientEmails`, **below** the zero-recipients throw and **below** `getWorkflowEmailTemplate`. `safeSend`, `resolveRecipientEmails` and the throw are untouched.

Simulated output:

```ts
{ sent: false, simulated: true, recipientCount: <real n>, recipients: [<real addresses>] }
```

Real output is `{ sent: true, recipientCount, recipients }` — the dry-run key set is the real key set plus exactly `simulated`, asserted by computing both in one test.

### 2. `notification` — `src/lib/execution/actions/notification.ts` (amendment A1)

The `await safeSend(row.email, template)` **inside** the row loop is gated; `emails.push(row.email)` deliberately stays outside it, so `recipientCount` and `recipients` report who *would* have been notified. Both throws (`"No notification recipients specified"`, `"No valid users found for notification"`) and the `users` SELECT stay unconditional. A second `_dryRun` branch returns the simulated output after the loop.

Simulated output:

```ts
{ sent: false, simulated: true, recipientCount: <real n>, recipients: [<real addresses>] }
```

The code comment records A1's reason in substance and must not be trimmed: CONTEXT's dry-run decision enumerated four side-effecting handlers, this is the fifth, and `.env` sets `SMTP_PORT=465` against a **real relay** rather than mailhog's `localhost:1025` — so before this gate, a dry run of any workflow containing a notification node sent real mail from the production sending domain to real user addresses read from the `users` table. The locked copy `workflows.dryRun.description` promises *"nothing leaves this app"*.

### 3. `http` — `src/lib/execution/actions/http.ts`

Gate placed immediately **before** `for (let attempt = 0; attempt <= retryCount; attempt++)` and **after** the entire body build. Interpolation, `await validateUrl(url)`, the GET/HEAD body guard and the auto `content-type: application/json` all still run.

Simulated output:

```ts
{ statusCode: 200, headers: {}, body: {}, simulated: true }
```

Real output is `{ statusCode, headers, body }` — again the real key set plus exactly `simulated`, computed.

## How `sleep` was asserted not-called without the test waiting

Recorded explicitly for **41-14**, which owns the dry-run dialog's 30-second budget:

```ts
vi.useFakeTimers({ shouldAdvanceTime: false })   // override the suite's auto-advancing timers
const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout")
const before = Date.now()

const result = await executeAction("http_request", { …, retryCount: 3 }, makeContext({ _dryRun: true }), "run-dry")

expect(fetchSpy).not.toHaveBeenCalled()
expect(setTimeoutSpy).not.toHaveBeenCalled()   // sleep() and fetchWithTimeout() are the only setTimeout sites
expect(vi.getTimerCount()).toBe(0)             // nothing was scheduled and left pending
expect(Date.now() - before).toBe(0)            // fake clock never advanced
```

Three independent facts, zero real waiting:

1. **Frozen fake timers make an awaited `sleep` fatal, not slow.** With `shouldAdvanceTime: false` nothing advances the clock, so `await sleep(1000)` never resolves and the case fails by timeout. Resolving at all is the proof.
2. **`setTimeout` call count is zero.** `sleep()` and `fetchWithTimeout()` are the handler's only `setTimeout` call sites, so a zero count means neither ran.
3. **`vi.getTimerCount() === 0`** — no timer was even scheduled.

`retryCount: 3` is load-bearing: a gate placed *inside* the loop would still fire one `fetch` and still sleep between attempts, failing (1) and (2).

**Budget implication for 41-14:** a dry run of an `http_request` node costs one `validateUrl` DNS resolution and nothing else — no request timeout, no backoff. The old worst case (`retryCount: 5` → ~31s of exponential sleep) cannot occur, so the http node contributes effectively zero to the dialog's 30-second budget.

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run src/lib/execution/actions/` (all 8 files) | **107 passed / 0 failed** |
| `npx vitest run src/lib/execution/` (broader suite) | **232 passed / 0 failed** |
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **0 errors, 125 warnings** (baseline ≤127) |
| `crm.ts` / `webhook-response.ts` untouched (owned by 41-06) | confirmed — `git diff --name-status` lists exactly the 6 planned files |
| STATE.md / ROADMAP.md untouched | confirmed |

Threat register items discharged: **T-41-34** (notification info disclosure, A1), **T-41-35** (email info disclosure), **T-41-36** (SSRF oracle — `validateUrl` preserved and asserted), **T-41-37** (repudiation — every pre-existing throw asserted to still fire), **T-41-38** (backoff DoS — gate above the loop, asserted). **T-41-39** remains `accept` as planned. **T-41-SC**: nothing was installed.

## Assertion inventory (what actually pins each claim)

**email.test.ts** (5 new cases)
- zero `safeSend` calls for a **two**-recipient config (dynamic + user lookup), so a partial gate fails
- `mockFrom` called → the `users` SELECT still ran; `recipients` equals `["john@example.com","bob@team.com"]` → the dynamic recipient was interpolated, not passed through raw
- `getWorkflowEmailTemplate` called with `("Deal: Big Deal", "Hi John, deal is active.")` → subject and body still interpolated
- `"No valid recipients resolved for email action"` still thrown under `_dryRun` (exact message)
- computed key-set parity + anti-vacuity (`safeSend` called exactly 2× across a real run and a dry run of the same config)
- `_dryRun: false` → `toHaveBeenNthCalledWith` per address, `sent: true`, `simulated` undefined

**notification.test.ts** (7 new cases)
- zero `safeSend` calls for a **three**-user config
- both throws still fire under `_dryRun`, exact messages
- `getWorkflowNotificationTemplate` called with `"New deal: Big Deal for John"`
- mixed rows `[email, null, email]` → `recipientCount === 2`, `recipients` excludes the null row
- the anti-vacuity pairing with a custom failure message spelling out *why* it exists: `dryCallCount === 0` and `realCallCount === 2` measured off the **same** mock in one test
- `_dryRun: false` → 2 sends for 3 rows, nth-call arguments unchanged

**http.test.ts** (8 new cases, 1 of them a real-run regression guard)
- zero `fetch` with `retryCount: 3`, no `setTimeout`, `getTimerCount() === 0`, exact simulated output
- `validateUrl` spy called with the **interpolated** URL `https://api.example.com/items/abc123`
- `file:///etc/passwd` still rejected under `_dryRun` by the **real** `validateUrl` (`/Blocked protocol/`), fetch not called
- a private-IP rejection still surfaces under `_dryRun` (spy-injected, mirroring the pre-existing real-run case)
- `interpolate` still receives `"Bearer {{trigger.data.token}}"` and returns `"Bearer secret-token-123"`; `interpolateDeep` still receives the raw object body → the body build ran
- GET with an object body → `interpolateDeep` **not** called → the GET/HEAD guard still applies
- computed key-set parity + anti-vacuity on the fetch mock
- gate-placement source scan: `if (context._dryRun)` sits after `await validateUrl(url)` and after `headers["content-type"] = "application/json"`, and before `for (let attempt = 0`
- new real-run guard: a non-ok 503 attaches `output: { statusCode, headers, body }` and the message is exactly `HTTP 503: ` + a 200-char preview

## Deviations from Plan

### Auto-fixed / adjusted

**1. [Rule 3 - Blocking] The worktree branched from a stale base**
- **Found during:** setup, before task 1
- **Issue:** `git merge-base HEAD c747ed3` returned `aa01de2` — the fifth consecutive worktree to branch from the pre-wave-1 commit, exactly as 41-WAVE1-HANDOFF warned.
- **Fix:** `git reset --hard c747ed30a5dd562bd2e846cf060a292e607f1dcb` per the mandated base-correction check, verified afterwards.
- **Commit:** n/a (pre-work)

**2. [Rule 3 - Blocking] The template mocks were unreachable from the test body**
- **Found during:** Tasks 1 and 2
- **Issue:** `getWorkflowEmailTemplate` / `getWorkflowNotificationTemplate` were `vi.fn()`s created *inside* the `vi.mock` factory. The `beforeEach` calls `vi.resetModules()`, which re-runs the factory, so `await import(...)` from the test body cannot get a stable handle — yet the plan requires asserting what the template builder received under `_dryRun`.
- **Fix:** hoisted each to a module-level `vi.fn` that the factory delegates to, mirroring the existing `mockSafeSend` idiom in the same files. Behaviour and return shapes are identical, so the pre-existing cases that read `mockSafeSend.mock.calls[0][1]` still pass unchanged.
- **Files modified:** `__tests__/email.test.ts`, `__tests__/notification.test.ts`
- **Commits:** `8d98ba6`, `4d34169`

**3. [Judgement call, documented] The auto content-type is not observable in the simulated output**
- **Found during:** Task 3
- **Issue:** the plan's acceptance criteria asks that the auto `content-type: application/json` be "asserted still applied under `_dryRun`", but it also mandates the simulated output be exactly `{ statusCode: 200, headers: {}, body: {}, simulated: true }`. The request headers are a handler local that a dry run never exposes, so no purely behavioural assertion on the returned value can see it. Writing one anyway would have meant either widening the mandated output shape or asserting something vacuous.
- **Fix:** pinned it two ways instead. Behaviourally, `interpolateDeep` is asserted still called with the raw object body, which is the same straight-line block the content-type line lives in. Structurally, a source-order test asserts `if (context._dryRun)` appears *after* `headers["content-type"] = "application/json"` and *before* `for (let attempt = 0` — which also directly pins T-41-38's "gate above the loop" claim and T-41-36's "validateUrl above the gate" claim against future edits.
- **Files modified:** `__tests__/http.test.ts`
- **Commit:** `a264eb2`

**4. [Scope note] `http.ts` registers as `"http_request"`, not `"http"`**
- The plan refers to the handler as `http`. The registry key is `http_request` (`registerAction("http_request", httpHandler)`), which is what the tests call. No code change; recorded so a later reader is not confused by the plan's shorthand.

### Not deviations, but worth stating

- **`crm.ts` and `webhook-response.ts` were not opened or edited.** They belong to plan 41-06, running in parallel. `git diff --name-status` against the base lists exactly the six files this plan owns.
- **Nothing was installed**, no migration was generated or applied, and Docker was not restarted (T-41-SC and the shared-resource rules).
- Lint reports **125** warnings, two fewer than the 127 baseline, with 0 errors. Nothing was suppressed; no `eslint-disable` was added anywhere in this plan.

## Known Stubs

None. Both `_dryRun` branches return fully-populated outputs; the http simulated body/headers are empty **by specification** (a simulated response has no upstream to report), not because a data source is unwired.

## Threat Flags

None. No new endpoint, auth path, file access pattern or schema change was introduced — this plan only *removes* outbound capability from the dry-run path.

## For the next plans

- **41-09 / 41-12 (engine + dialog wiring):** all five handlers are now gated. `email` and `notification` return `{ sent: false, simulated: true, recipientCount, recipients }`; `http` returns `{ statusCode: 200, headers: {}, body: {}, simulated: true }`. Every simulated output is the real output's key set **plus** `simulated`, so a downstream `transform` or `condition` node reading `nodes.<id>.output.*` sees the same fields it would in a real run.
- **41-14 (30-second dialog budget):** see the `sleep` section above. Under dry run an `http_request` node performs exactly one DNS resolution (`validateUrl`) and no request, no timeout and no backoff — so `retryCount` no longer contributes to dialog latency at all.
- **A dry run still fails for real reasons.** Zero resolvable recipients, a missing notification user, and an SSRF-blocked URL all still throw under `_dryRun`, with their original messages. Any plan that renders dry-run failures should expect and surface them rather than treating a failed dry run as a bug in the gate.

## Self-Check: PASSED

- `src/lib/execution/actions/email.ts` — FOUND, contains `_dryRun`
- `src/lib/execution/actions/notification.ts` — FOUND, contains `_dryRun` and the A1 real-relay comment
- `src/lib/execution/actions/http.ts` — FOUND, contains `_dryRun`
- `src/lib/execution/actions/__tests__/{email,notification,http}.test.ts` — FOUND, all three extended
- Commits `8d98ba6`, `8d05cd8`, `4d34169`, `ba5f48c`, `a264eb2`, `6d81547` — all present in `git log`
- `git status` clean before this SUMMARY was written; STATE.md and ROADMAP.md unmodified
