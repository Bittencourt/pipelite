---
phase: 42-observability
verified: 2026-08-23T21:15:00Z
status: passed
score: 3/3 must-haves verified
overrides_applied: 0
# No pending human_verification items. OBS-02's positive delivery-to-dashboard leg required a
# third-party account login and was already performed by the human operator during 42-18's
# execution (git commits 243932b / a4b138c / b19d669, all 2026-08-23) — see the "Human
# Verification" section below for the evidence trail. This verifier did not and must not repeat
# it (task constraint: no third-party accounts, do not set SENTRY_DSN).
---

# Phase 42: Observability Verification Report

**Phase Goal:** A production failure is detectable from an endpoint and a log stream, not from
grepping container stdout months later.
**Verified:** 2026-08-23T21:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (one per success criterion, verified independently)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | No bare `console.*` calls remain in non-test source; logs are structured and level-controlled | ✓ VERIFIED | See Criterion 1 below |
| 2 | With `SENTRY_DSN` unset, nothing leaves the deployment; with it set, an unhandled error reaches the tracker | ✓ VERIFIED | See Criterion 2 below |
| 3 | `/api/health` reports DB connectivity + liveness of all ten workers (six processors + four subscribers), and a dead `register()` is visible | ✓ VERIFIED | See Criterion 3 below |

**Score:** 3/3 truths verified

---

## Criterion 1 — Structured, level-controlled logging; zero bare `console.*` in non-test source

**Verdict: MET**

Evidence I personally reproduced (not quoted from any SUMMARY):

- `npx eslint .` (full project, real `eslint.config.mjs`, no overrides) → **0 errors, 124 warnings**.
  Independently confirmed the "124 vs 122" split is a `.planning` untracked-file artifact, not a defect
  (see "Anti-Patterns / Findings" below).
- Isolated the `no-console` rule's real hit count under the project's actual file-scoped exemptions
  by temporarily changing the rule's severity from `error` to `warn` in `eslint.config.mjs`, running
  `eslint 'src/**/*.{ts,tsx}'`, and reverting: **0 hits**. `git diff eslint.config.mjs` was empty after
  revert.
- Forced `no-console: error` via `--rule` (which bypasses ALL file-scoped exemptions, including test
  globs and `log.ts` itself) to find where every remaining console call physically lives:
  **exactly 29 hits across 15 files** — 25 of them in `*.test.ts` files (legitimately exempt, console
  calls in tests are debugging aids) and **exactly 4 in `src/lib/log.ts`**, nowhere else. This
  independently reproduces the phase's own claim that log.ts's 4 internal delegations are the only
  `src/`-tree console calls anywhere, exempt or not.
- **The gate is genuinely enforceable, proven by injection, not assertion**: appended
  `console.log("scratch-verifier-probe")` to `src/lib/utils.ts`, ran `eslint src/lib/utils.ts` →
  `7:1 error Unexpected console statement no-console`, exit reported 1 problem. Reverted with
  `git checkout -- src/lib/utils.ts`; `git status` confirmed clean. A 274th bare call would fail this
  gate today.
- **`LOG_LEVEL` genuinely filters, not merely passes through.** Wrote a throwaway test
  (`src/lib/__scratch_log_level.test.ts`) asserting `LOG_LEVEL=error` suppresses `log.info` (console.log
  spy: 0 calls) while `log.error` still emits (spy: 1 call) — both passed. Deleted the scratch file
  afterward (`git status` clean). The shipped `src/lib/log.test.ts:152-220` already covers this more
  thoroughly (warn/silent/unrecognised-value/re-read-per-call).
- **Resolved the "273 vs 277" ambiguity myself**: the eslint-config comment's tool-verified figure is
  273 call sites across 96 non-test files, pre-migration (278 raw-grep hits minus 5 non-code hits: 4
  comments + 1 JSX user-facing string). The alternate 277 figure arises only when `log.ts`'s own 4
  internal `console.*` delegations (necessarily present — the logger has to delegate to something) are
  added on top: 273 + 4 = 277. Both numbers are internally consistent once you know which side of the
  migration boundary they're counting; 273 is the correct "migrated call sites" figure.
- **`Error` serialization is real, not a `JSON.stringify(new Error())` == `{}` trap.**
  `src/lib/log.ts:67-79`'s `serialize()` explicitly pulls `name`/`message`/`stack`/`cause` (capped at
  depth 3) before `JSON.stringify` ever sees the object. `src/lib/log.test.ts` and the container's own
  boot log (see Criterion 3) both show `"err":{"name":...,"stack":...}` on real errors, never `"err":{}`.
- Ran the full test suite covering the logger, heartbeat and Sentry modules directly:
  `npx vitest run src/app/api/health/__tests__/route.test.ts src/lib/observability/heartbeat.test.ts
  src/lib/log.test.ts src/lib/observability/sentry.test.ts` → **100/100 passed**.
- Full suite reproduced independently: **4524 passed / 32 skipped** (base project) + **8/8** (RSC
  project) — matches the orchestrator's measurement exactly. `npx tsc --noEmit` → 0 errors.

**Nuance found and independently confirmed (already disclosed honestly by 42-18, not a new false
claim, but worth restating plainly per instructions):** the container's full stdout stream is NOT
100% JSON. Captured live logs from the running container (`docker compose logs app --no-log-prefix`)
and classified every line by emitter: the app's own `log.ts` output is 100% valid single-line JSON
carrying a `scope` field, every time, but `drizzle-kit`'s migration CLI, `npm` notices, and Next.js's
own boot banner (`▲ Next.js 16.1.6`, `✓ Ready in …ms`) print plain text into the *same* stdout stream
before the app's logger ever runs a line. This is disclosed in `42-18-SUMMARY.md` (which additionally
found Next prints ~115 non-JSON lines per unhandled error, via its own uncaught-exception reporter,
not through `src/lib/log.ts`). **Judgment: criterion 1's actual wording — "no bare `console.*` calls
remain in non-test source" — is satisfied in full; the stronger claim in 42-18-PLAN.md's own
`must_haves` ("every line of the container app log is valid JSON") is false as literally written and
was already caught and correctly reclassified by 42-18 itself.** I am restating rather than
discovering this, because the instructions asked me to judge it plainly.

**Exemption scope check (asked to verify minimality):** confirmed only two exemption blocks exist in
`eslint.config.mjs` — `src/lib/log.ts` (4 legitimate delegations) and a second block covering
`**/*.test.{ts,tsx}`, `**/*.spec.{ts,tsx}`, `__tests__/**`, `e2e/**`, `drizzle/**`, `.planning/**`.
Verified none of the widened globs touch `src/`: `find src -path "*e2e*" -o -path "*drizzle*"` →
empty. `.planning`'s console-bearing files are the 10 untracked `.mjs` UAT evidence scripts under
`38-20-uat-evidence/` (`git ls-files --error-unmatch` fails on all 10 — confirmed untracked). No
`src/` path is exempted anywhere except `log.ts`.

---

## Criterion 2 — Opt-in error tracking (Sentry)

**Verdict: MET**

Evidence:

- **Negative half, reproduced live against the running container**, not merely against tests:
  `docker compose exec -T app printenv | grep SENTRY_DSN` → `SENTRY_DSN=` (empty/unset). Captured the
  container's own boot log: `{"level":"info","scope":"sentry","msg":"SENTRY_DSN unset — error tracking
  disabled, SDK not loaded", ...}` — the announce-and-return path actually ran in production, not just
  in a mock.
- **The negative is code-provably strong, not merely "quiet".** `src/lib/observability/sentry.ts`'s
  `initSentry()` only reaches `await import("@sentry/nextjs")` inside the `if (!dsn)` early-return's
  else branch — with no DSN, the import statement is never executed. `sentry.test.ts` asserts this
  three independent ways (a factory that `throw`s if `@sentry/nextjs` is ever imported;
  `init` `.not.toHaveBeenCalled()`; a global `fetch` spy `.not.toHaveBeenCalled()`), plus a CONTROL
  case that proves the harness isn't just mis-resolving the module path (with a DSN set, the throwing
  factory genuinely fires and A9's try/catch degrades it to a warn log rather than aborting
  `register()`). Ran this file directly: 32/32 passed.
- **Edge bundle is genuinely Sentry-free**, checked against the actual container filesystem, not a
  local `.next/` (which had a different, non-matching layout on this host and was not used as
  evidence): `docker compose exec -T app sh -c "grep -rl sentry /app/.next/server/edge/"` → **no
  matches** across all edge chunk files.
- **Both halves of criterion 2 were already human-verified against a real Sentry account**, evidenced
  by `git log`: commits `243932b`, `a4b138c`, `b19d669` (all dated 2026-08-23, same day) document the
  operator setting a real DSN, triggering a genuine unhandled error
  (`Error: The router state header was sent but could not be parsed.`), confirming HTTP 200 + a
  matching event id from the ingest endpoint, and the user directly confirming "i see the error at
  sentry dashboard" in the Issues view — closing the one leg (a third-party login) that no automated
  check or this verifier could perform. The DSN was subsequently removed; I independently confirmed
  it is not set in `.env` (`grep -i SENTRY_DSN .env` → no match) and not present anywhere in the
  repository (`grep -rn "sentry.io/[0-9]"` across tracked files → only synthetic test-fixture DSNs
  with placeholder hex, e.g. `0123456789abcdef...`, never a real one).
- **A9 (init must never abort `register()`)** verified in code: `instrumentation.ts:27-28` awaits
  `initSentry()` as the literal first statement, and `sentry.ts`'s `initSentry()` wraps `Sentry.init()`
  in try/catch, setting `enabled=false` and logging a warn on failure rather than throwing — matches
  the "CONTROL" test case's proof above.
- **PII scrubbing**: `sentry.ts`'s `dataCollection` block sets `cookies: false` (not
  `{deny:["*"]}`, which A6/RESEARCH's own earlier snippet got wrong — a silent no-op via substring
  matching), strips `userInfo`, `httpBodies`, `stackFrameVariables`, `databaseQueryData`, and
  `beforeSend` additionally deletes `event.user`, `request.data`, `request.cookies`,
  `request.headers`, and redacts emails from URLs. 42-18 independently re-verified this against the
  real ingest envelope byte-for-byte (7 canaries, 0 occurrences) rather than re-sending secrets to a
  third party a second time to satisfy this verifier — a reasonable trade I am accepting rather than
  demanding a re-run.

**What remains formally unproven by *me*:** I did not personally set a real `SENTRY_DSN` or view a
sentry.io dashboard — correctly, per this task's explicit constraint against creating third-party
accounts or setting that variable. The positive-delivery leg is evidenced by git history and a human
confirmation already on record, not by my own reproduction. I am treating that prior, dated,
human-confirmed evidence as sufficient rather than demanding a second live repro that the task itself
forbids me from performing.

---

## Criterion 3 — `/api/health` liveness (six processors + four subscribers = ten workers)

**Verdict: MET**

Evidence, reproduced live against the running container (freshly built image, per task framing):

- `curl -s -o /tmp/health.json -w "HTTP_STATUS:%{http_code}\n" localhost:3001/api/health` →
  **`HTTP_STATUS:200`**, body: `status: ok`, `db: {"ok":true,"latencyMs":1}`, **exactly 10 processor
  keys**, every one `alive: true`: `webhook-processor`, `email-processor`, `schedule-processor`,
  `execution-processor`, `audit-prune`, `trash-prune`, `webhook-subscriber`,
  `workflow-trigger-subscriber`, `stage-history-subscriber`, `audit-subscriber`. This matches the
  ten-name roster exactly — not four processors, as the stale roadmap wording would suggest, and not
  fewer than ten as a registry-iterating bug would produce.
- **The empty-registry ⇒ 503 proof (amendment A1, the phase's central assertion) is a real test, and
  it passes.** Read `src/app/api/health/route.ts:141` — `snapshot()` (not a live-registry iteration)
  is the only worker-layer call in the route, and it iterates the hard-coded `EXPECTED_WORKERS`
  constant (`src/lib/observability/heartbeat.ts:100-111`), reporting any unregistered name as
  `{alive:false, lastTickAt:null}` rather than omitting it. Ran the specific test asserting this:
  `npx vitest run src/app/api/health/__tests__/route.test.ts` → 19/19 passed, including "empty
  registry returns 503 with all ten workers present and dead" (asserts the exact 10-key count, not
  merely "some worker is dead" — the assertion the roadmap amendment calls load-bearing).
- **Verb surface is genuinely closed, checked live, not just by test:**
  `curl -X POST localhost:3001/api/health` → `405`; `curl -X PUT` → `405`. Confirms `GET` is the only
  handler.
- **Unauthenticated by construction, verified in source:** `src/middleware.ts:8`'s matcher is
  `["/((?!api|_next/static|_next/image|favicon.ico).*)"]`, which excludes `/api/*` entirely.
- **`register()` genuinely runs in this container, not merely claimed:** captured the container's own
  boot log and found the exact sequence — `sentry` init line, then each of the six processors'
  `"msg":"Starting"` lines with real `initialDelayMs`, then real tick output
  (`audit-prune`/`trash-prune` "deleted expired rows"/"purged expired records" with real counts). The
  four subscribers carry no boot log by design (documented in `heartbeat.ts`'s header — registration
  alone is their liveness proof, not a tick), and the health endpoint independently confirms all four
  `alive:true`.
- **Dockerfile postcondition** (`Dockerfile:63-71`): a `test -f … || cp …; test -f … || { echo
  FATAL…; exit 1; }` brace group that fails the build if the copy did not land the file. I did not
  rebuild the image (out of scope per task instructions), so I did not personally trigger the fault
  injection; I instead confirmed by direct filesystem check that the ACTUAL running container has
  `instrumentation.js` present at `/app/.next/server/instrumentation.js` (found via
  `docker compose exec app find /app -iname instrumentation.js`), consistent with this postcondition
  having passed on the build that produced this image. `42-18-SUMMARY.md` records the executor
  independently triggering this exact fault (a deleted source file) and observing the build abort
  with `FATAL: instrumentation.js missing…` + exit 1 — I did not re-run that injection myself, so this
  half rests on the phase's own evidence rather than mine; I judge it credible given the postcondition's
  shell logic is unambiguous (`exit 1` inside a brace group, not a subshell, terminates the `RUN`
  step).
- **Module-graph split risk (A2):** the design correctly uses a namespaced `globalThis` singleton
  (`__pipeliteHeartbeats`) for the mutable registry while keeping `EXPECTED_WORKERS` a plain immutable
  constant (duplication across graphs is harmless for immutable data). Vitest cannot exercise the
  actual four-instance module-graph split (single module registry) — this is honestly documented in
  both `heartbeat.test.ts`'s own header and `42-VALIDATION.md`, which correctly labels those unit
  tests a PROXY. The only real proof is the live container check above, which I performed myself and
  which shows all ten workers alive and reporting real, distinct tick timestamps — the fingerprint of
  a working, non-split registry (a split registry would show subscribers `alive:true` with
  `lastTickAt` permanently null even after known writes; here the four subscribers correctly show
  `lastTickAt: null` because a quiet CRM produces no events yet, which is the documented, expected
  diagnostic-only behavior, not a defect).

---

## Requirements Coverage

| Requirement | Description | Status | Evidence |
|---|---|---|---|
| **OBS-01** | Structured, level-controlled logging; no bare console.* in non-test source | ✓ SATISFIED | Criterion 1 above |
| **OBS-02** | Opt-in error tracking, no-phone-home default | ✓ SATISFIED | Criterion 2 above |
| **OBS-03** | `/api/health` liveness for all background workers | ✓ SATISFIED | Criterion 3 above |

No orphaned requirements: all three plan-declared `requirements:` sets across the 18 plans cover
exactly OBS-01/02/03, matching `REQUIREMENTS.md`'s Phase 42 mapping.

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/lib/log.ts` | Structured JSON logger, level-gated, Error-serializing | ✓ VERIFIED | 155 lines; substantive, wired into ~277 call sites across the codebase (281 `log.*(` call sites measured directly in current non-test source, which includes new calls added in sentry.ts/heartbeat consumers beyond the original migration) |
| `src/lib/observability/heartbeat.ts` | globalThis worker registry + `EXPECTED_WORKERS` roster | ✓ VERIFIED | 234 lines; roster-based `snapshot()`, confirmed wired into route and all six processors + four subscribers via `instrumentation.ts` |
| `src/lib/observability/sentry.ts` | Opt-in Sentry init + request-error reporter | ✓ VERIFIED | 255 lines; guarded dynamic import, try/catch around init (A9), PII scrubbing |
| `src/app/api/health/route.ts` | GET-only health endpoint | ✓ VERIFIED | 151 lines; live-curled, 200/ten-workers-alive reproduced |
| `eslint.config.mjs` | `no-console: error` + 2 minimal exemptions | ✓ VERIFIED | Gate proven enforceable by injected violation |
| `Dockerfile` | Postcondition guarding instrumentation.js | ✓ VERIFIED (by inference + inherited fault-injection evidence) | Shell logic unambiguous; file present in running container |
| `instrumentation.ts` | Repo-root register(), no stale citations | ✓ VERIFIED | Read directly; Dockerfile citation and gate comment both current |
| `docker-compose.yml` | `LOG_LEVEL`/`SENTRY_DSN` passthrough | ✓ VERIFIED | Both present at lines 23-24; confirmed reaching the container via `printenv` |

---

## Anti-Patterns / Findings

None are blockers. Listed because the task explicitly asked for gaps found in the planning documents
themselves, and finding zero would be suspicious — these were mostly already caught by the phase's own
executors, and I am confirming rather than discovering most of them:

1. **(Info, doc-hygiene only) `deferred-items.md`'s reconciliation table still literally reads "OPEN
   — assigned to 42-17"** for the `instrumentation.ts` Dockerfile-citation row, even though I directly
   confirmed the code fix landed (current `instrumentation.ts` cites `Dockerfile:35-38`, past tense,
   correctly) and `STATE.md`'s WAVE 2 CARRY-FORWARD section says 42-17 closed it. The file itself was
   never edited to flip that row from OPEN to CLOSED after 42-17 ran. Functionally harmless — the code
   is correct — but the task's framing ("it should now have ZERO open entries") is not literally true
   of the file's own table text. Worth a one-line edit in a future pass, not worth blocking on.

2. **(Info) Three items opened by 42-18 explicitly carry to Phase 43** (documented at the bottom of
   `deferred-items.md`, dated 2026-08-23): the `[Pipedrive API]` scope's space/capitalization
   (cosmetic, 1 line, no criterion requires it), a recommendation to pin `log.error`'s two-required-arg
   typing with an explicit test (the type safety already holds; this just wants a regression guard),
   and Next.js's own non-JSON error output living in the same stdout stream (not fixable by this phase,
   already disclosed honestly). None of these block any of the three success criteria — they're
   legitimately scoped out, not swept under the rug.

3. **(Info, confirmed not a live gap) `42-18-PLAN.md`'s own `must_haves.truths` contains a claim that
   is false as literally written**: "every line of the container app log is valid JSON carrying a
   scope field." I independently reproduced this being false in the strict sense (Next's banner and
   drizzle-kit's migration CLI both print non-JSON to the same stream) and confirmed 42-18 already
   caught and correctly reclassified this in its own SUMMARY rather than silently claiming a false
   pass. See Criterion 1 above for the substantive judgment.

4. **(Info) The historical "273 vs 277" ambiguity is resolved** in Criterion 1 above: 273 is the
   pre-migration count of real console.* call sites needing migration; 277 = 273 + log.ts's own 4
   necessary console delegations. Both figures are correct depending on what's being counted; no
   contradiction, just two different totals conflated across documents.

5. **(Info) `42-RESEARCH.md`'s Pattern 3 (`Promise.race` DB-probe snippet) and Pattern 5
   (`cookies: {deny:["*"]}`) were both independently proven wrong during execution** — a timer leak
   and a silent no-op respectively — and both were correctly NOT followed in the shipped code
   (`route.ts`'s `probeDb()` clears its timer in `finally`; `sentry.ts` uses `cookies: false`). This is
   the phase correctly treating its own RESEARCH document as unverified, per its own stated lesson.
   Confirmed by reading the shipped code, not by trusting the claim.

No blocker-class debt markers (`TBD`/`FIXME`/`XXX`) found in the phase's key files
(`log.ts`, `heartbeat.ts`, `sentry.ts`, `route.ts`, `instrumentation.ts`, `eslint.config.mjs`,
`Dockerfile`) — checked directly.

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Health endpoint reports 10/10 alive | `curl -s localhost:3001/api/health` | HTTP 200, 10 keys, all `alive:true` | ✓ PASS |
| Health endpoint rejects non-GET verbs | `curl -X POST/PUT localhost:3001/api/health` | 405/405 | ✓ PASS |
| SENTRY_DSN genuinely unset in the deployed container | `docker compose exec app printenv \| grep SENTRY_DSN` | `SENTRY_DSN=` (empty) | ✓ PASS |
| `no-console` lint gate actually fails on a new violation | injected `console.log` in `utils.ts`, ran eslint, reverted | 1 error, reverted cleanly | ✓ PASS |
| `LOG_LEVEL` genuinely filters output (not pass-through only) | scratch vitest spy test, deleted after | info suppressed at `LOG_LEVEL=error`, error still emitted | ✓ PASS |
| Edge bundle contains zero Sentry bytes | `docker compose exec app grep -rl sentry /app/.next/server/edge/` | no matches | ✓ PASS |
| Full test suite reproduces claimed baseline | `npx vitest run` + `--config vitest.rsc.config.ts` | 4524 passed/32 skipped + 8/8 | ✓ PASS |
| Typecheck reproduces claimed baseline | `npx tsc --noEmit` | 0 errors | ✓ PASS |
| Lint reproduces claimed baseline | `npx eslint .` | 0 errors, 124 warnings | ✓ PASS |

## Human Verification

One item is listed in frontmatter for completeness, but it does NOT block a `passed` status: OBS-02's
positive delivery-to-dashboard leg was already performed by the human operator on 2026-08-23 (git
commits `243932b`/`a4b138c`/`b19d669`), before this verification ran, and cannot be independently
re-checked by an automated verifier without violating this task's own constraint against creating
third-party accounts or setting `SENTRY_DSN`. I am accepting the dated, already-recorded human
confirmation as sufficient rather than treating this as an open gap.

## Gaps Summary

None. All three success criteria are met with evidence I personally reproduced against the live
running container, the actual source tree, and the shipped test suite — not against SUMMARY.md
claims alone. The only items not fully self-reproduced (the Dockerfile fault-injection rebuild, and
the Sentry dashboard visual confirmation) are both explicitly out of scope for this verification run
per the task's own constraints ("you should not need to rebuild," "do not create third-party
accounts"), and both have credible, dated, independently-recorded evidence from the phase's own
execution that I reviewed and judged sound rather than merely quoted.

---

_Verified: 2026-08-23T21:15:00Z_
_Verifier: Claude (gsd-verifier)_
