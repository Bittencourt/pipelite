---
phase: 42-observability
plan: 13
subsystem: observability
tags: [logging, structured-logs, redaction, trash, audit, execution, triggers, views]

# Dependency graph
requires:
  - phase: 42-observability (plan 01)
    provides: "src/lib/log.ts — the zero-import structured logger, its Error serializer, and the flat-ctx contract"
provides:
  - "34 call sites across ten trash / audit / execution / triggers / views modules emitting structured JSON"
  - "The redactDbError boundary carried across the migration unweakened on all five views/actions.ts sites"
  - "Three orphaned LOG_PREFIX constants deleted (trash/queries.ts, views/resolve.ts, views/queries.ts)"
  - "write-guards.ts's redactDbError doc comment now names log.error, the call form that exists"
  - "A definitive verdict on the phase's <acceptance_criteria> scope gate: it is unconditionally vacuous"
affects: [42-14, 42-15, 42-16, 42-17, 42-18]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bracket-harvested scope wins over path derivation even when the plan's inventory says a file has no prefix"
    - "A grep gate that quotes a literal from its own subject file inflates its own count — reword the comment, do not explain the false positive"

key-files:
  created: []
  modified:
    - src/lib/trash/queries.ts
    - src/lib/trash/settings.ts
    - src/lib/audit/settings.ts
    - src/lib/audit/export-events.ts
    - src/lib/execution/failure-alert.ts
    - src/lib/execution/engine.ts
    - src/lib/triggers/matcher.ts
    - src/lib/views/actions.ts
    - src/lib/views/resolve.ts
    - src/lib/views/queries.ts
    - src/lib/views/write-guards.ts
    - src/lib/trash/queries.test.ts
    - src/lib/execution/failure-alert.test.ts

key-decisions:
  - "matcher.ts's two sites use scope `workflow-trigger`, not the plan's `lib/triggers/matcher`: both carry a `[workflow-trigger]` bracket the plan's inventory recorded as absent, and the scope rule says the bracket always wins"
  - "engine.ts:600 gains no stack trace — `failRun`'s `error` parameter is typed `string`, so the plan's T-42-40 'clearest example of what the phase buys' does not apply to this site"
  - "The comment at views/actions.ts:249 was reworded to avoid quoting `redactDbError(error)` and `err: error` verbatim, because doing so pushed the plan's own security gates to 6 and 1"
  - "No clock pinning was needed: neither owned suite has a `not.toContain(<short digits>)` running against log output"

patterns-established:
  - "Pattern: a settings warn carries the setting KEY and the bounds, and deliberately excludes `parsed.error` — the zod issue quotes the received value, so it is a disclosure vector wearing a validation-diagnostic costume"

requirements-completed: [OBS-01]

# Metrics
duration: 42min
completed: 2026-08-23
---

# Phase 42 Plan 13: Trash / Audit / Execution / Triggers / Views Log Migration Summary

**34 console sites across ten modules now emit structured JSON, with the `redactDbError` disclosure boundary carried across intact — and the phase's `<acceptance_criteria>` scope gate proven to match nothing at all, in any plan that has ever used it.**

## Performance

- **Duration:** ~42 min
- **Started:** 2026-08-23T21:20Z (approx — base correction at 21:21)
- **Completed:** 2026-08-23T21:56Z
- **Tasks:** 3 of 3
- **Files modified:** 13 (11 source, 2 test)

## Commits

| Task | Commit | Scope |
|---|---|---|
| 1 | `201992c` | trash/queries.ts (7) + trash/settings.ts (4) + audit/settings.ts (4) + 7 repaired assertions |
| 2 | `20fd9ee` | failure-alert.ts (4) + engine.ts (2) + export-events.ts (1) + matcher.ts (2) + 4 repaired assertions |
| 3 | `6994719` | views/actions.ts (5) + views/resolve.ts (3) + views/queries.ts (2) + write-guards.ts doc comment |

## Base correction — stale again, 27 for 27

Worktree HEAD was `286c470`; expected base `01c92ea`. `git merge --ff-only` brought in 85 files
including all nine wave-2 batch-A/B/C summaries and the `src/lib/log.ts` + `src/app/api/health/route.ts`
that the sanity check requires. **The systematic-staleness streak is now 27 for 27.** Both sanity
files confirmed present before any work started.

---

## Site census — 34, reconciling on two independent rulers

**Ruler 1 — eslint `no-console`, non-test source.** The ruler STATE.md mandates.

| | Sites | Files |
|---|---|---|
| Before | **113** | 44 |
| After | **79** | 34 |
| Delta | **−34** | −10 |

Exactly the 34 this plan claimed, and all ten of my files left the list. Reconciles with STATE.md's
chain: `244 −3 −26 −24 −29 −21 −28 = 113`, and now `113 − 34 = 79`. The remaining 79 is the 75 sites
still claimed by 42-14/15/16 plus `log.ts`'s own four internal `console` delegations.

**Ruler 2 — a multi-line-aware `log.<level>("<scope>"` matcher over the ten files.** 34 total, and
the per-file counts match the plan's inventory exactly:

| File | Sites | Scope(s) |
|---|---|---|
| `trash/queries.ts` | 7 | `trash-queries` (harvested from `LOG_PREFIX`) |
| `trash/settings.ts` | 4 | `trash-settings` — 3 error, **1 warn** |
| `audit/settings.ts` | 4 | `audit-settings` — 3 error, **1 warn** |
| `audit/export-events.ts` | 1 | `audit-export` |
| `execution/failure-alert.ts` | 4 | `failure-alert` |
| `execution/engine.ts` | 2 | `execution-engine` |
| `triggers/matcher.ts` | 2 | **`workflow-trigger`** — 1 error, **1 info** (see correction below) |
| `views/actions.ts` | 5 | `lib/views/actions` |
| `views/resolve.ts` | 3 | `views/resolve` (harvested) |
| `views/queries.ts` | 2 | `views/queries` (harvested) |

Level map held: 30 `log.error`, 2 `log.warn`, 1 `log.info`, plus 1 more error = 34. **A warn stayed a
warn** in both settings modules, and matcher.ts's `console.log` became `log.info`, not `log.error`.

---

## The plan's scope gate is not merely defective — it is unconditionally vacuous

The prompt warned that three executors found this gate broken in three ways. It is worse than all
three diagnoses. The gate is:

```
grep -roE 'log\.[a-z]+\("[a-z0-9/\[\]-]+"'
```

Run verbatim over all ten of my migrated files, it matches **0 of 34** sites. Not "5 of 10", not
"misses the hyphenated ones" — zero. And the reason is not the lowercase restriction and not the
multi-line problem, because it also matches zero when pointed at a single-line, all-lowercase,
slash-shaped scope:

```
$ printf 'log.error("a"\nlog.error("ab"\nlog.error("a/b"\n' | grep -oE 'log\.[a-z]+\("[a-z0-9/\[\]-]+"'
(no output, exit 1)
```

**It cannot match `log.error("a"`.** The `\[\]-]` sequence terminates the bracket expression early and
leaves `-]+` as literal regex text outside it, so the pattern demands a literal `-]` inside the quoted
string. Nothing in the codebase has that, and nothing ever will.

Proof that this is the cause and not the lowercase or multi-line issue — same file, same `-r -o -E`,
only the character class changed:

| Class | Matches in `trash/queries.ts` |
|---|---|
| `[a-z0-9/\[\]-]` (the plan's, verbatim) | **0** |
| `[a-z0-9/-]` (hyphen moved to last position) | **7** |
| `[^"]+` (the recommended fix) | **7** |

**Consequence for the phase, and for 42-18.** Every plan in this phase whose `<acceptance_criteria>`
contains this gate has been reporting a pass on a command that returns zero rows by construction.
A gate that matches nothing passes nothing — its "0 differences" is indistinguishable from total
failure to migrate. 42-08, 42-09, 42-10 and 42-12 each reported a partial blindness in this gate
(malformed class, lowercase-only, same-line-only); those diagnoses were all downstream symptoms of a
pattern that never matched anything. **42-18 should treat every scope claim gated only by this
command as unverified**, and replace it with `"[^"]+"` plus a multi-line-aware matcher. My own
scope census above used the latter.

---

## Corrections to plan premises — two, both in the documented direction

### 1. matcher.ts's sites DO carry a bracket prefix. The plan's inventory says "none".

The plan's site inventory row reads `triggers/matcher.ts | Prefix source: none | Scope: lib/triggers/matcher`,
and Task 2's action repeats it: *"`matcher.ts` — two sites, no bracket prefix, so scope `lib/triggers/matcher`"*.

Both sites carry `[workflow-trigger]`:

```typescript
console.log(
  `[workflow-trigger] Workflow ${workflow.id} triggered by ${eventName}`
)
// and
console.error(
  `[workflow-trigger] Failed to create run for workflow ${workflow.id}:`,
  err
)
```

The migration contract's scope rule is unambiguous — *"A `[bracket]` prefix in the existing string
… ⇒ use that name verbatim as `scope`"*, and the plan itself restates it as "the bracket always
wins". So the scope is **`workflow-trigger`**, not `lib/triggers/matcher`.

This is not a cosmetic call. `src/lib/events/subscribers/workflow-trigger.ts:41` was migrated by an
earlier plan and already logs under scope `workflow-trigger`. These two files are the same logical
trigger path — the subscriber dispatches, the matcher fires. Following the plan's literal instruction
would have split one operational concern across two scopes and made "why did no workflow fire" a
two-query question for no reason.

Treated as deviation Rule 1 (the plan states something false about the source) and recorded in the
Task 2 commit message.

### 2. `engine.ts:600` gains NO stack trace. The plan calls this its clearest win.

The plan says of this site: *"the error moves to `ctx.err` as an object … This is one of the few sites
where the migration strictly improves what is logged, because plan 01's serializer emits the stack
that `${error}` discarded"*, and the threat register logs it as T-42-40, *"the single clearest example
of what OBS-01 buys"*, with a note that the stack "contains file paths and function names".

**There is no stack, because there is no `Error`.** The enclosing signature is:

```typescript
async function failRun(
  runId: string,
  error: string,          // ← a string
  failedNodeId?: string
): Promise<void>
```

All eight `failRun` call sites (lines 236, 241, 245, 406, 426, 476, 480, 567) pass a constructed
message string — `CYCLE_ERROR`, `TIMEOUT_ERROR`, `` `Node '${node.id}' (${node.label}) failed: ${message}` ``
— which the same function then persists to `workflow_runs.error`. `log.ts`'s `serialize()` branches on
`value instanceof Error`; a string falls through unchanged. So the `name`/`message`/`stack` triple
never materialises here.

Confirmed empirically in the full-suite output, where the migrated line renders as:

```json
{"level":"error","scope":"execution-engine","msg":"Run failed","ts":"2026-08-23T21:34:09.279Z","runId":"run-6","err":"Node 'n2' (Bad Node) failed: DB connection lost"}
```

`err` is a bare string. **T-42-40's "accept, and note it as an improvement" disposition is therefore
moot for this site — there is no new stack trace, and so also no new file paths or function names in
the log.** The disposition is safe in the direction that matters (it accepted an exposure that never
materialised), but the rationale is wrong and should not be cited as precedent.

The migration is still worth doing here: the message becomes fixed and `runId` and the reason become
separately queryable. That is the real gain, and I recorded it in a comment at the site along with an
explicit warning not to "improve" it by wrapping the string in an `Error` — the stack would be
`failRun`'s own frame, not the failure's, which is worse than no stack because it looks like one.

### 3. Subtotal check on the plan's own assertion counts — these were RIGHT

The plan corrected PATTERNS upward and claimed eleven breaking assertions where the source artifacts
named three or four. **Verified: eleven, exactly.** Seven in `trash/queries.test.ts` (lines 303, 340,
506, 559, 614, 886, 956) and four in `failure-alert.test.ts` (525, 570, 606, 629). Every named line
number was correct. Post-repair: `grep -c '[trash-queries]'` → 0 and `grep -c '"scope":"trash-queries"'`
→ **7**; `grep -c '[failure-alert]'` → 0 and `grep -c '"scope":"failure-alert"'` → **4**.

The two-argument `expect(value, message)` form at `failure-alert.test.ts:602-606` kept its message
argument, as required:

```typescript
expect(
  consoleError.mock.calls.flat().join(" "),
  "the compensation must never become the failure: this runs inside a fire-and-forget .catch, " +
    "so an escaping rejection there is an unhandled rejection in the processor."
).toContain('"scope":"failure-alert"')
```

---

## Redaction — T-42-39, T-42-35, T-42-04

### What `redactDbError` receives and emits, and why the logger did not become the leak

Read first, before anything else was touched, per the prompt's instruction.

**Receives:** `unknown` — in practice a `DrizzleQueryError` whose `message` embeds the SQL **and every
bound parameter**, reached through a bounded `causeChain` walk.

**Emits:** `{ code, constraint }` and nothing else — `RedactedDbError`, two nullable strings. The
message text is excluded deliberately, and `write-guards.ts` says why: `DrizzleQueryError.message`
embeds the statement and the parameters, so a view name the user typed lands inside it.

**Why the structured logger did not cross that boundary.** The value handed to `ctx.err` is the
*return value of the redactor*, not the error. `log.ts` serialises `ctx` whole, but what it is given
here is already a two-field plain object; `serialize()` does not branch on it (it is not an
`instanceof Error`), so it is emitted verbatim as `{"code":…,"constraint":…}`. The raw driver error
never enters `ctx` at any of the five sites. Gates:

- `grep -c 'redactDbError(error)' src/lib/views/actions.ts` → **5**
- `grep -c 'err: error' src/lib/views/actions.ts` → **0**

All five migrated lines, verbatim:

```typescript
log.error("lib/views/actions", "createView failed", { err: redactDbError(error) })
log.error("lib/views/actions", "updateView failed", { err: redactDbError(error) })
log.error("lib/views/actions", "setViewShared failed", { err: redactDbError(error) })
log.error("lib/views/actions", "setViewDefault failed", { err: redactDbError(error) })
log.error("lib/views/actions", "deleteView failed", { err: redactDbError(error) })
```

### The gate that was inflated by its own comment — worth carrying forward

My first attempt added a comment above `createView`'s site that quoted the two gate literals in prose
("`redactDbError(error)` — NOT `error`" … "an `err: error` alongside this would put…"). The plan's own
security gates then read `redactDbError(error)` → **6** and `err: error` → **1**, both failing.

Both were pure comment matches. I could have documented them as false positives — 42-11 established
that precedent when three file paths poisoned its credential grep. **I reworded the comment instead.**
The reasoning: this is a *security* gate that a future reader will re-run, and a gate that reports 6
and 1 with a note saying "ignore it, that is prose" is a gate nobody trusts twice. A gate whose subject
file quotes the gate's own needle is self-defeating regardless of who is right. The comment now conveys
the same constraint without containing either literal, and both gates read 5 and 0 cleanly.

**Generalisable rule for 42-14/15/16 and 42-18:** never quote a grep gate's needle inside the file the
gate scans. Describe it instead.

### T-42-35 — the secret-absence detector, quoted, passing, unchanged

`src/lib/trash/settings.test.ts:212-222`, **not one character edited**:

```typescript
it("never names the stored value in the warning it logs", async () => {
  // T-37-09: the log lines carry the key and the bounds only. A tampered value echoed into
  // application logs is an information-disclosure path, and the codebase rule is
  // "identifiers and counts only".
  mockDb.query.appSettings.findFirst.mockResolvedValue({ value: "s3cret-looking-garbage" })

  await readTrashRetentionDays()

  const logged = warnSpy.mock.calls.flat().join(" ")
  expect(logged).not.toContain("s3cret-looking-garbage")
  expect(logged).toContain(TRASH_RETENTION_KEY)
})
```

Run in isolation against the migrated code: **1 passed**. Both halves hold — the absence half because
the stored value never enters the `ctx`, and the presence half because `TRASH_RETENTION_KEY` is now
carried as a `ctx` value and `JSON.stringify` puts the literal `trash.retention_days` into the line.

The two migrated warns, verbatim, as the acceptance criteria require:

```typescript
// trash/settings.ts
log.warn(
  "trash-settings",
  "Retention setting is not an integer in range — trash purging is disabled until it is corrected",
  { key: TRASH_RETENTION_KEY, min: RETENTION_MIN, max: RETENTION_MAX }
)

// audit/settings.ts
log.warn(
  "audit-settings",
  "Retention setting is not an integer in range — retention is disabled until it is corrected",
  { key: AUDIT_RETENTION_KEY, min: RETENTION_MIN, max: RETENTION_MAX }
)
```

**Neither `ctx` contains the stored value.** And the one place this migration could quietly have
widened the line: `parsed` is a zod `SafeParseReturnType` sitting in scope at both warns, and
`parsed.error` is exactly the kind of thing a "make the log more useful" instinct reaches for. A zod
issue **quotes the value it received**. Adding it would have carried `s3cret-looking-garbage` into the
warn output and reddened the detector — which is the detector doing its job. Both sites now carry a
comment naming `parsed.error` and `row.value` as deliberately excluded, so the next reader is warned
before they reach for it.

### T-42-04 — the other 27 sites carry only what their strings already carried

Every interpolated value moved to a named `ctx` key; nothing new was added.

| Scope | `ctx` keys | All previously in the string? |
|---|---|---|
| `trash-queries` | `entityType`, `id`, `idCount`, `viewerUserId`, `tab`, `page`, `limit`, `offset`, `err` | Yes — `idCount` is `entityIds.length`, which the string carried as `(${entityIds.length} id(s))` |
| `trash-settings` / `audit-settings` | `key`, `min`, `max`, `err` | Yes |
| `audit-export` | `err` (from the local `auditError`) | Yes |
| `failure-alert` | `runId`, `err` | Yes — all four sites interpolated `${runId}` |
| `execution-engine` | `runId`, `err` | Yes |
| `workflow-trigger` | `workflowId`, `eventName`, `err` | Yes |
| `views/resolve` / `views/queries` | `entityType`, `err` | Yes |
| `lib/views/actions` | `err` (redacted pair only) | Yes |

No run payload, step output, record body, email address or SQL statement was added anywhere.
`trash/queries.ts`'s module header rule — *"Logs carry identifiers and counts only, never record
contents"* — still holds by inspection of all seven sites.

### Reserved-ctx-key collision check (wave 1's flat-key warning)

`ctx` keys land flat and a key named `level`, `scope`, `msg` or `ts` silently overwrites a base
field. Checked across the whole diff against the base:

```
git diff 01c92ea -- src/lib | grep -E "^\+" | grep -nE "\b(level|scope|msg|ts)\s*:"
→ no matches (exit 1)
```

**Zero collisions.** The 15 distinct `ctx` keys I introduced are: `entityType`, `id`, `idCount`,
`viewerUserId`, `tab`, `page`, `limit`, `offset`, `key`, `min`, `max`, `runId`, `workflowId`,
`eventName`, `err`.

---

## Flake class — checked systematically, nothing to pin

The prompt required a check for `not.toContain(<short digit string>)` assertions now running against a
line carrying a fresh `ts`. I grepped the whole repo rather than only my files:

| Site | Needle | Runs against | Verdict |
|---|---|---|---|
| `execution/failure-alert.test.ts:190` | `String(FAILURE_ALERT_WINDOW_MINUTES)` = `"60"` | `capturedSqlText()` — the rendered SQL | **Safe.** Not log output. This is the interval-literal check; a `ts` cannot reach it. Mine, and unchanged. |
| `views/__tests__/actions.test.ts:1104` | `"23505"` | `actionsSource` — the source TEXT of `actions.ts` | **Safe.** Static file read. Mine, passing. |
| `trash/settings.test.ts:309-310` | `"1"`, `"365"` | `result.error` — the returned string | **Safe.** Return value, not a log line. Mine, unchanged. |
| `people/bulk-actions.test.ts:298`, `mutations/dedup.test.ts:663` | `"23503"`, `"23505"` | `JSON.stringify(result)` | Safe (return value). Not mine. |
| `dedup/import-flags.test.ts:352`, `identity-settings.test.ts:329` | `"111"`, `"1.5"` | log output | Already pinned by 42-12. Not mine. |
| `components/dedup/…:166` | template of a symbol name | source text | Safe. Not mine. |

**No clock pinning was needed in either owned suite**, and no assertion was touched for flake reasons.
42-12's generalisation still stands for 42-14/15/16 — my file set simply happens to have all of its
absence detectors pointed at SQL text and return values rather than at log lines.

**One hidden constraint on scope strings, found while checking this.** `views/__tests__/actions.test.ts:1073-1083`
asserts `actionsSource.split("views.").length - 1 === 0` — zero occurrences of a message-catalog
namespace in `views/actions.ts`. My scope is `"lib/views/actions"`; the separator is `views.` **with a
literal dot**, so a slash-shaped scope is fine. But a scope like `views.actions` — a plausible
dot-separated house style — would have reddened an i18n boundary test for reasons having nothing to do
with i18n. Worth knowing if any later plan touches this file.

---

## The `write-guards.ts` doc comment

The heading and the body sentence both named `console.error`, a call form that no longer exists in the
file's own package. Before → after, with every other word kept (the T-39-03 reference, the "not about
hiding the failure" sentence and the two-fields rationale all intact):

```diff
- * What is safe to `console.error` about a driver failure.
+ * What is safe to `log.error` about a driver failure.
   *
- * The SQLSTATE and the constraint, and nothing else. The obvious `console.error(error)` would put
+ * The SQLSTATE and the constraint, and nothing else. The obvious `log.error(error)` would put
   * the full statement and every bound parameter — including a view name the user typed — into the
   * server log, which is the same class of leak T-39-03 already paid for on the merge path. This is
   * not about hiding the failure: the two fields kept here are the two that identify it.
```

`write-guards.ts` has zero real `console.*` call sites — its only two matches were these — so nothing
else forced the edit. Confirmed after: `grep -rc 'console\.' src/lib/views/*.ts` → **0 for every
file**, `write-guards.ts` included.

Note that the "obvious" form is now *literally* impossible: `log.error(error)` does not compile,
because `log.error` requires both `scope` and `msg` (42-11 proved this with TS2345). The comment reads
slightly more strongly than intended as a result, and that is fine — the leak it warns about is now
reachable only via `ctx`, which is exactly what the five call-site comments in `actions.ts` guard.

---

## Control flow — unchanged, per T-42-41

Verified by reading the full diff of the four Task 2 source files, not just their stat:

- **`failure-alert.ts`** — all four catches still swallow. The `release()` catch, the template-build
  catch (still `await release(); return`), the `safeSend(...).catch(async …)` arrow (still `await release()`
  after the log), and the outer catch. An alert that cannot be built or sent still cannot fail the run
  it is reporting on.
- **`export-events.ts:113`** — still swallowed; the export still succeeds when its audit row does not.
  The 8-line comment explaining that this is the module's known weakness (WR-04, open in BACKLOG.md)
  is untouched.
- **`engine.ts`** — `Run not found` still `return`s; `failRun` still persists `{status:"failed", error}`
  and still sets `currentNodeId`. No run state transition altered.
- **`matcher.ts`** — `createWorkflowRun` still inside the `try`; the catch still swallows so one
  workflow's failed trigger does not stop the loop over the others.

No query, return shape, status code, redirect or retention read/write changed in any of the eleven
source files.

---

## Verification — exact numbers

| Gate | Result |
|---|---|
| `npx vitest run src/lib/trash src/lib/audit` | **430 passed / 4 skipped**, 0 failed |
| `npx vitest run src/lib/execution src/lib/audit src/lib/triggers` | **638 passed / 4 skipped**, 0 failed |
| `npx vitest run src/lib/views` | **860 passed**, 0 failed |
| `npx tsc --noEmit` | **0 errors** (run after each task) |
| `npx eslint src/lib/trash src/lib/audit src/lib/execution src/lib/triggers src/lib/views` | **0 errors** |
| `npm run lint` (repo-wide) | **0 errors**, 122 warnings — the documented worktree value |
| `npm test` | **4524 passed / 32 skipped**, 0 failed + RSC **8/8** |
| eslint `no-console` census, non-test | **113 → 79**, delta **−34** |

Baseline matched exactly: 4524 / 32 / RSC 8 / typecheck 0 / lint 0 errors.

### One unreproduced flake, reported rather than buried

I ran `npm test` **six times**. Five runs: `4524 passed / 32 skipped / 0 failed` + RSC 8/8. **One run
(the second) reported `1 failed | 4523 passed | 32 skipped`** — the same 4524 total, one test flipping.
My output filter that run matched the summary line before the failing test's name, so I did not capture
its identity, and four subsequent runs could not reproduce it.

What I can say: it is **not** in the `ts`-flake class, because the systematic grep above found no
short-numeric absence assertion anywhere in the repo pointed at log output that is not already pinned.
Three sibling executors (42-14/15/16) were each running a 4500-test suite on this 4-CPU box
concurrently, which is the most likely explanation for a single timing-sensitive test tipping over.
**I am flagging it rather than asserting a clean baseline I observed five times out of six.** If the
verifier sees a single-test failure it cannot reproduce, this is a prior sighting, not a new
regression.

### Source gates

| Gate | Expected | Observed |
|---|---|---|
| `grep -c 'console\.'` in all eleven source files | 0 each | **0 each** |
| `grep -c 'const LOG_PREFIX'` in queries.ts / resolve.ts / views-queries.ts | 0 each | **0 each** |
| `grep -c 'log\.warn('` in both settings modules | 1 each | **1 each** |
| `grep -c 'log\.info('` in matcher.ts | 1 | **1** |
| `grep -c '\${error}'` in engine.ts | 0 | **0** |
| `grep -c 'redactDbError(error)'` in views/actions.ts | 5 | **5** |
| `grep -c 'err: error'` in views/actions.ts | 0 | **0** |
| `grep -c '\[trash-queries\]'` / `'"scope":"trash-queries"'` in queries.test.ts | 0 / 7 | **0 / 7** |
| `grep -c '\[failure-alert\]'` / `'"scope":"failure-alert"'` in failure-alert.test.ts | 0 / 4 | **0 / 4** |
| reserved `ctx` keys (`level`/`scope`/`msg`/`ts`) in the diff | 0 | **0** |

### Three deleted constants

`src/lib/trash/queries.ts:32` (`"[trash-queries]"`), `src/lib/views/resolve.ts:75` (`"[views/resolve]"`),
`src/lib/views/queries.ts:68` (`"[views/queries]"`). Each grepped for other uses before deletion — all
three were referenced only by the sites being migrated. eslint's `no-unused-vars` is the gate and
reports 0 errors, so no orphan survived. Running total for the phase: 8 (42-12) + 3 (here) = **11**.

---

## What the log lines actually look like now

Captured from real suite output:

```json
{"level":"warn","scope":"audit-settings","msg":"Retention setting is not an integer in range — retention is disabled until it is corrected","ts":"2026-08-23T21:23:19.684Z","key":"audit.retention_days","min":1,"max":3650}
{"level":"error","scope":"execution-engine","msg":"Run failed","ts":"2026-08-23T21:34:09.667Z","runId":"run-15","err":"Node 'nested-1' (Condition nested-1) failed: Nested condition nodes inside a condition/split branch are not supported"}
```

---

## Deviations from Plan

### 1. [Rule 1 — the plan states something false about the source] matcher.ts's scope

`workflow-trigger`, not `lib/triggers/matcher`. Full argument above. **Files:** `src/lib/triggers/matcher.ts`.
**Commit:** `20fd9ee`.

### 2. [Rule 2 — a gate must be trustworthy] The views/actions.ts comment was reworded

Quoting `redactDbError(error)` and `err: error` in prose broke the plan's own security gates (6 and 1).
Reworded to convey the same constraint without the literals. **Files:** `src/lib/views/actions.ts`.
**Commit:** `6994719`.

### 3. [Rule 2 — a correctness comment the next reader needs] Two comments added, not required by the plan

`engine.ts:600` gained a comment recording that `err` is a string here, that no stack is recovered, and
that wrapping it in an `Error` would be worse than nothing. Both settings warns gained a comment naming
`parsed.error` and `row.value` as deliberately excluded from the `ctx`. Neither changes behaviour; both
close a "helpful improvement" that would reintroduce a disclosure or resurrect a false premise.
**Commits:** `201992c`, `20fd9ee`.

### 4. [nothing to do] No clock pinning, no test edits beyond the eleven assertions

The plan permitted repairing whatever reddened in `trash/settings.test.ts`, `audit/settings.test.ts`
and `audit/__tests__/export-events.test.ts`. **Nothing reddened in any of the three.** All three spy on
`console` and assert on call presence or on non-log values, so delegating through `console.error` /
`console.warn` kept them green untouched. Confirmed by running each.

---

## Deferred / not mine

- **`src/lib/trash/prune.ts:14` and `src/lib/trash/prune.test.ts:132`** — the two genuinely FALSE
  `Dockerfile:24` citations from wave 1's deferred list. They live in my directories but are owned by
  plan 06, and the plan explicitly forbids touching `trash/prune.test.ts`. Still open; still stating
  something false about the Dockerfile. 42-17 or 42-18 should take them.
- **`src/lib/redis.ts` (4), `src/lib/email/send.ts` (3), `src/lib/custom-fields.ts` (1),
  `src/lib/notes/authorize.ts` (1), `src/lib/export/formatters.ts` (1), `src/lib/email/client.ts` (1),
  `src/lib/formula-recalc.ts` (3), `src/lib/import/*` (7)** — remaining `src/lib` console sites. Per
  the prompt, sibling 42-16 owns "the remaining `src/lib` modules". Reported, not touched.
- No test file outside my five owned ones reddened, so there is nothing to report under the plan's
  "record the file, line and failure" clause.

## Known Stubs

None. Every site migrated is a live call on a real code path; nothing was left placeholdered and no
data source was left unwired.

## Threat Flags

None. No file in this set gained a network endpoint, an auth path, a file-access pattern or a schema
change. The only trust-boundary surface touched is the one the plan already registered — driver errors
reaching a log line — and it moved in the safe direction: `views/actions.ts`'s five sites are now
guarded by an explicit comment as well as by the redactor.

## Notes for the next plans

1. **The `<acceptance_criteria>` scope grep matches nothing, ever.** Do not report it as passing. Use
   `"[^"]+"` and a multi-line-aware matcher, and reconcile against the eslint census.
2. **Do not quote a grep gate's needle inside the file the gate scans.** It inflates the gate's own
   count and makes a security check look broken.
3. **Check the parameter TYPE before claiming a stack-trace win.** `engine.ts`'s `error` is a `string`;
   `log.ts`'s `Error` branch never fires. Several remaining plans may carry the same T-42-40-shaped
   claim.
4. **`parsed.error` from a zod `safeParse` quotes the received value.** Anywhere a validation warn is
   migrated, it is a disclosure vector that looks like a diagnostic.
5. **A bracket prefix can exist where a plan's inventory says "none".** Grep the actual line before
   deriving a scope from the path — two of my 34 sites turned on this.

## Self-Check: PASSED

- `.planning/phases/42-observability/42-13-SUMMARY.md` — created
- All eleven source files and two test files modified and committed: verified via `git log` and
  `git status` clean after each task
- Commits `201992c`, `20fd9ee`, `6994719` — all three confirmed present in `git log --oneline`
- No file outside the plan's 16 declared paths was modified (`git diff --name-only 01c92ea` confirms
  13 files, all declared)
