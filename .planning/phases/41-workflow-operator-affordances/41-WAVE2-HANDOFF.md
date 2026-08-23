# Phase 41 — Wave 2 handoff to wave 3 and 4

**Written by the orchestrator after wave 2 merged.** This run's context window (200K) does not
auto-load prior SUMMARY.md files into executor prompts, so anything wave 2 learned that wave 3 needs
is here. Read this together with `41-WAVE1-HANDOFF.md`, which is still current.

Merged state at handoff: **4189 passed / 32 skipped + RSC 8/8 · typecheck 0 · lint 0 errors / 125
warnings.** That is your baseline. Note warnings went DOWN from 127 — do not "restore" them.

---

## The one that will waste your afternoon if you miss it (from 41-08)

**`execution-processor.test.ts`'s mock header cannot take a static import of the module under test.**
A static `import` is hoisted above the `const mockDb` declarations and throws
`Cannot access 'mockDb' before initialization`, which surfaces as a **0-test collection failure that
reads exactly like a missing module** — you will go looking for a path bug that does not exist.

Use `await import(...)` inside each test case instead.

**Directly binding on 41-12**, which modifies that file.

---

## The dry-run action contract (from 41-11) — binding on 41-14

Do not guess any of these:

- **`startDryRun(workflowId: string, triggerDataJson: string)` takes the RAW JSON STRING**, not a
  parsed object. The server re-validates; that is the trust boundary.
- Its two failures return `error: "invalidJson"` and `error: "notAnObject"`. These are **inline
  literals, not exported constants**, because a `"use server"` module may export nothing but async
  functions. Map them to `workflows.dryRun.invalidJson` / `workflows.dryRun.notAnObject`.
- **`getWorkflowRunStatus` answers an absent row with `{ success: true, status: null, dryRun: null }`.**
  **The poller MUST terminate on `status === null` as well as on a terminal status** — otherwise the
  dialog polls forever against a run that does not exist.
- A dry run's envelope is `trigger_type: "manual"` + `trigger_id: "dry_run"`, because
  `TriggerEnvelope.trigger_type` is a closed 4-member union in a file outside this phase's scope.
- `createWorkflowRun`'s 4th parameter is `options?: CreateWorkflowRunOptions { dryRun?, replayedFromRunId? }`,
  conditionally spread so an absent option writes **no key** — the `NOT NULL DEFAULT false` must be
  allowed to apply. Both insert branches carry it, including the recursion short-circuit.

## The replay contract — binding on 41-13

- `isRunReplayable` and `buildReplayRunInput` already exist in `src/lib/workflows/replay.ts`. Consume
  them; do not re-derive the predicate.
- **There is deliberately NO exported constant for the `"failed"` literal.** The reshaped UI-SPEC G-6
  gate scans the render site for `{run.status === "failed" && ( … )}`. Introducing a
  `REPLAYABLE_RUN_STATUS` constant makes that scan permanently unsatisfiable. This was a deliberate
  choice by 41-02, restated here because it looks like an oversight.
- `replayWorkflowRun` and `getWorkflowRunStatus` are in `src/app/workflows/actions.ts`, session-gated
  and two-id scoped.

---

## Source-scan helper limits discovered in wave 2

Wave 2 hit the edges of this repo's scan helpers three times. Save yourself the rediscovery:

- **`enclosingConditional` is JSX-shaped.** It throws on a correct `if (!x) foo.push(...)` **statement**.
  41-10 used it in `runs-table.tsx` (JSX) and fell back to line-proximity in `page.tsx` (statement).
  Pick by the shape of the code, not by preference.
- **Neither `elementRegion` (JSX only) nor `callArguments` (argument lists) can bound a TypeScript
  function body.** 41-11 added a module-private `functionRegion` in `replay.test.ts` that also asserts
  the signature shape rather than assuming it. Reuse that pattern if you need a body-scoped negative.
- **A whole-file negative assertion is often unsatisfiable.** 41-11's plan asked that `actions.ts`
  contain no `"admin"`, but `removeHttpTemplate` in the same file legitimately compares a role. Scope
  negatives per function body and pair each with `region.length < source.length` so an empty region
  cannot pass vacuously.

---

## Smaller corrections to plan/doc shorthand

- **`http.ts` registers as `"http_request"`**, not `"http"`.
- **The non-bulk `Checkbox` importer census in `src/components/ui/checkbox-indeterminate.test.ts` is
  now 12** (was 11). It is a deliberate tripwire: an N+1th consumer must hand-check Radix's
  indeterminate state. If you add a `Checkbox`, do the check and bump the constant with a comment —
  do not delete the census.
- **A dry run skips the delay WAIT, not the delay PARSE.** `resolveDelay` is still called and still
  throws on a malformed config. Amendment A2's "no-op" phrasing is looser than the implementation;
  the implementation is correct.
- `MAX_ERROR_CHARS` is exported from the failure-alert module, so truncation assertions read the
  constant rather than restating 500.
- An absent `notification_preferences` row means workflow-failure email is **ENABLED**
  (`defaultPreferences.emailWorkflowFailed === true`).

---

## Standing constraints (unchanged, still binding)

- `node_modules` is a shared symlink. **Never run `npm install` / `npm ci`.**
- **All schema work is finished.** Migration 0019 is applied, the four columns are live and verified,
  and the container has been restarted. No later plan generates or applies a migration, and none
  restarts Docker.
- **Do not edit `src/messages/*.json` or `locale-parity.test.ts`.** Wave 1 wrote every string this
  phase needs, and the contract is TOTAL — an unexpected `workflows.*` key fails the exact-contract
  `toEqual`.
- Bootstrap the three symlinks as your second action, before any test command.
- **Every worktree in this phase has branched from a stale base — eleven for eleven, all from
  `aa01de2`.** Run the base-correction check first, without exception. If your worktree lacks
  `src/lib/execution/failure-alert.ts` or `src/lib/workflows/replay.ts`, your base is wrong.
- `docker` needs no sudo. **Never embed or echo a password anywhere.**
