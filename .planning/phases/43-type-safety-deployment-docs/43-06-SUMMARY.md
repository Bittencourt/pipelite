---
phase: 43-type-safety-deployment-docs
plan: 06
subsystem: observability
tags: [logging, log-scope, source-gate, vitest, pipedrive, obs-01, d-6]

requires:
  - phase: 42-structured-logging
    provides: "src/lib/log.ts and the 279 migrated call sites whose scopes this gate now polices; the bracket-wins harvest rule that produced the `Pipedrive API` scope in the first place"
provides:
  - "The Pipedrive rate-limit warning logs under the lowercase-kebab scope `pipedrive-api`"
  - "src/lib/log-scope-format.test.ts — a durable shape gate over every log scope in non-test source, with four anti-vacuity defences"
  - "importFromPipedrive pinned as a named, file-pinned exclusion so normalizing it later turns the gate red"
affects: [observability, logging, any future plan that adds a log call site or normalizes importFromPipedrive]

tech-stack:
  added: []
  patterns:
    - "Corpus-wide source gate: walk src/ excluding tests, read through the shared stripComments, assert a SHAPE rather than a list"
    - "Raw-line resolution: report file:line from the RAW file, and assert the resolution, because stripComments collapses block comments and drifts line numbers"

key-files:
  created:
    - src/lib/log-scope-format.test.ts
  modified:
    - src/lib/import/pipedrive-api-client.ts

key-decisions:
  - "The rule is whitespace-and-pinned-case, explicitly NOT lowercase-kebab: ~40 scopes legitimately contain /, [, ] and digits"
  - "DEVIATION (Rule 1): the plan's literal camelCase assertion (`exactly one scope contains /[A-Z]/`) was unimplementable — 10 scopes contain a capital, 8 of them only inside Next.js [dynamicSegment] names. Refined to: outside a [dynamicSegment], a scope uses only [a-z0-9/-]. That refinement makes the plan's own predicted RED (exactly two offenders) come true, so it is the reading the planner intended and mis-measured."
  - "The dynamic-segment carve-out is BOUNDED: every bracket segment must be a bare identifier, and the carve-out is asserted non-empty so it cannot become untested dead code"
  - "importFromPipedrive stays camelCase — out of D-6's scope, pinned rather than absorbed or widened away"

patterns-established:
  - "Prove the stripping with a PROSE-ONLY call that is syntactically valid: src/lib/log.ts's doc-comment example `log.error(\"trash-prune\", …)` would donate a plausible phantom scope if stripping ever broke — a far sharper canary than a malformed one"
  - "Assert the gate's own line-number arithmetic, not just its verdict: a failure message naming the wrong line sends the next reader to the wrong file region"

requirements-completed: [OBS-01]

duration: 41min
completed: 2026-08-24
---

# Phase 43 Plan 06: Normalize the Pipedrive Log Scope Summary

**The one log scope carrying a space (`Pipedrive API`) is now `pipedrive-api`, and a 9-assertion corpus gate over all 279 non-test scopes — proven comment-blind and proven to fail — keeps every scope a single greppable token.**

## Performance

- **Duration:** 41 min
- **Started:** 2026-08-23T23:29Z
- **Completed:** 2026-08-24T00:10Z
- **Tasks:** 2/2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- `src/lib/import/pipedrive-api-client.ts:42` now reads `log.warn("pipedrive-api", "Rate limited, retrying", { delayMs, attempt: attempt + 1, maxAttempts })`. Message and context are byte-identical; only the scope argument moved.
- The comment above it was rewritten. Every clause of the old one became false the moment the scope changed.
- `src/lib/log-scope-format.test.ts` (342 lines) enforces the shape corpus-wide, and was **observed failing on the pre-fix state** before the fix landed.

## Task Commits

1. **Task 1: RED — comment-blind shape gate over every log scope** — `6d188b5` (test)
2. **Task 2: GREEN — normalize the scope and correct the comment** — `ea0e0d5` (feat)

## The RED run, verbatim

`npx vitest run src/lib/log-scope-format.test.ts` at `6d188b5`, before the Task 2 fix:

```
PASS (6) FAIL (3)

1. the rules > no scope contains whitespace (D-6)
   AssertionError: a scope with whitespace cannot be grepped as one token:
   src/lib/import/pipedrive-api-client.ts:42 "Pipedrive API": expected [ Array(1) ] to deeply equal []

2. the rules > logs the Pipedrive rate-limit warning under pipedrive-api
   AssertionError: no call site logs under `pipedrive-api` — the D-6 scope was renamed to
   something else or the rate-limit warning was removed rather than normalized:
   expected [ 'actions/user-settings', …(278) ] to include 'pipedrive-api'

3. the rules > uses only [a-z0-9/-] outside dynamic segments, with one pinned exclusion
   AssertionError: unexpected characters outside a [dynamicSegment]:
   src/lib/import/pipedrive-api-client.ts:42 "Pipedrive API"
   src/lib/import/pipedrive-api-import-actions.ts:1159 "importFromPipedrive"
   If one of these is the pinned exclusion being normalized, DELETE the pin above; do not
   add a second entry.: expected [ 'Pipedrive API', …(1) ] to deeply equal [ 'importFromPipedrive' ]
```

**Exactly the three the plan predicted, and exactly the split it asked for.** The six that were GREEN in the RED run are the six that must not depend on the fix: the stripping proof, the corpus floor, the raw-line resolution, the call-site/literal equality, the non-empty/trim rule, and the dynamic-segment bounding. A gate red on every line has not found its inputs.

After `ea0e0d5`: **`PASS (9) FAIL (0)`**.

## What makes this gate fail

Seven independent ways, all exercised or measured rather than asserted in prose:

| Assertion | Goes red when |
|---|---|
| whitespace rule | any scope contains `\s`. **Observed red** on `Pipedrive API` at `pipedrive-api-client.ts:42`. |
| `pipedrive-api` membership | the rate-limit warning is deleted or renamed. **Observed red** pre-fix. This is the positive half — without it, the whitespace rule is satisfiable by removing the only observability on Pipedrive throttling. |
| charset outside `[…]` | a scope grows a capital, `_`, `.` or anything else outside a dynamic segment. **Observed red** with two offenders pre-fix. Also goes red if `importFromPipedrive` is normalized, which is the point of pinning it by equality rather than by `filter`. |
| stripping proof | `stripComments` is bypassed or breaks. Asserted against two files whose PROSE contains a `log.<level>(` — see below. |
| corpus floor (≥250 scopes / ≥80 files) | the walk or the matcher stops finding the tree. This is the phase-42 failure mode directly: a matcher that matches nothing passes every negative rule for free. |
| call-site/literal equality | any call site computes its scope dynamically, or the extractor goes blind to an idiom (e.g. a template literal, or a fifth level added to `log.ts`). |
| raw-line resolution | the gate's own line arithmetic drifts, so a failure message would name the wrong line. |

**Proof the stripping runs.** Two files carry a `log.<level>(` inside prose, and both are asserted present in the RAW text and absent from the STRIPPED text:

- `src/lib/views/write-guards.ts` — the doc comment `The obvious \`log.error(error)\` would put…`. Un-stripped this donates a *phantom call site with no literal*, which would break the equality assertion for a reason with nothing to do with logging.
- `src/lib/log.ts` — its own usage example, `log.error("trash-prune", "Tick error", { err: error })`. **This one the plan did not know about, and it is the sharper canary:** it is a syntactically perfect call with a perfectly plausible scope, so un-stripped it donates a phantom *scope* that no shape rule would ever flag. Measured: raw corpus = 281 `log.<level>(` occurrences, stripped = 279, and the two removed are exactly these two files.

`readStrippedSource` was deliberately **not** used even though it strips comments correctly, because both the stripping proof and the raw-line resolution need the raw text alongside the stripped text. `grep -c stripComments src/lib/log-scope-format.test.ts` = 4 (plus one in an assertion message).

## Measured corpus (the anti-vacuity numbers)

| Fact | Value |
|---|---|
| Non-test `.ts`/`.tsx` files walked under `src/` | **523** |
| `log.<level>(` occurrences, RAW | **281** |
| `log.<level>(` occurrences, comment-STRIPPED | **279** |
| Scope literals extracted | **279** — equal to the stripped call-site count |
| Distinct files containing a scope | **97** (floor: 80) |
| Distinct scope strings | **89** |
| Scopes containing whitespace | **1** before, **0** after |
| Scopes empty or untrimmed | **0** |
| Distinct `[dynamicSegment]` names in scopes | **8** — `[entityId] [entityType] [fieldName] [filename] [id] [noteId] [runId] [type]` |

**The call-site-equality assertion HELD: 279 = 279.** No dynamically-computed log scope exists in this codebase, so no exclusion was needed and none was added. Nothing to report as a finding on that axis.

## Deviations from Plan

### 1. [Rule 1 — Bug] The plan's camelCase assertion was unimplementable as literally written

- **Found during:** Task 1, while measuring the corpus before writing the gate.
- **Issue:** `43-06-PLAN.md`'s measured inventory states *"Scopes containing an uppercase letter — **2** today: the D-6 target, and `importFromPipedrive`"*, and derives the assertion *"Exactly one extracted scope contains `/[A-Z]/`, and it is `importFromPipedrive`"*. **Ten** scopes contain an uppercase letter, not two. The other eight are path-shaped scopes whose only capitals sit inside a Next.js dynamic segment:
  - `admin/fields/[entityType]/trigger-child-guard`
  - `api/files/[entityId]/[fieldName]/[filename]` (×2)
  - `api/v1/notes/[noteId]` (×4)
  - `workflows/[id]/runs/[runId]`

  Written literally, the assertion would have been red on day one with nine offenders — the exact "gate that is red on day one gets deleted rather than fixed" failure the plan's own header warns against. Note the plan itself names `workflows/[id]/runs/[runId]` in its list of *legitimate* scopes, one paragraph above deriving a rule that rejects it.
- **Fix:** the rule applies the charset to the scope with `[…]` segments removed: outside a dynamic segment, a scope uses only `[a-z0-9/-]`. Dynamic segments are camelCase *as directory names on disk*, so a scope harvested from such a route carries their capitals by construction, and lowercasing them would make the scope stop matching the route it names.
- **Why this is a faithful reading, not a weakening:** it is strictly *stronger* than `/[A-Z]/` (it also rejects `_`, `.`, spaces and uppercase alike), and it makes the plan's own predicted RED come true — "Fails today with two, which is correct" is exactly what was observed. The planner intended the bracket carve-out and mis-measured by testing `/[A-Z]/` against the whole scope.
- **The carve-out is bounded, not blanket.** Two extra assertions hold it in place: every bracket segment must match `/^\[[A-Za-z][A-Za-z0-9]*\]$/` (so `[Foo Bar]` or `[A-B]` cannot ride through), and the carve-out must apply to at least one scope (so it cannot silently become untested dead code that nobody deletes).
- **Files modified:** `src/lib/log-scope-format.test.ts`
- **Commit:** `6d188b5`

### 2. [Rule 2 — Missing critical functionality] Line numbers were being reported from the stripped text

- **Found during:** Task 1, verifying the failure message before committing.
- **Issue:** `stripComments` consumes the newlines inside a multi-line block comment, so a line counted in the stripped text drifts below every block comment in the file. The D-6 offender sits at **stripped line 39 but raw line 42**, and `importFromPipedrive` at **stripped 1090 vs raw 1159** — a 69-line error. A gate whose failure message names the wrong line sends the next reader to the wrong place, which is the same class of defect as the stale comment this plan exists to fix.
- **Fix:** each match is resolved back into the raw file by occurrence index, and *that resolution is itself asserted* — every extracted scope's reported line must, within a 3-line window (multi-line call sites put the literal below the paren), actually contain the scope. If the alignment ever drifts, the gate says so instead of lying quietly.
- **Verified:** the RED output names `pipedrive-api-client.ts:42` and `pipedrive-api-import-actions.ts:1159`, both matching the raw line numbers the plan itself cites.
- **Files modified:** `src/lib/log-scope-format.test.ts`
- **Commit:** `6d188b5`

## The diff (Task 2, one file, one call, one comment block)

```diff
-        // Scope harvested verbatim from the existing `[Pipedrive API]` prefix, per the
-        // bracket-wins rule. Note it carries a space and capitals, unlike every other scope in
-        // the phase — flagged in the summary rather than silently normalised.
-        log.warn("Pipedrive API", "Rate limited, retrying", {
+        // Scope normalised to lowercase-kebab by Phase 43 D-6. It was originally harvested
+        // verbatim from this file's pre-existing `[Pipedrive API]` bracket prefix under Phase 42's
+        // bracket-wins rule, which is where the space and the capitals came from; the space was
+        // the harmful part, because it made this the one scope in the log stream that could not be
+        // grepped as a single token. `src/lib/log-scope-format.test.ts` now holds that shape for
+        // every scope in the codebase, and asserts this one is present by name.
+        log.warn("pipedrive-api", "Rate limited, retrying", {
           delayMs,
           attempt: attempt + 1,
           maxAttempts,
         })
```

`git diff --stat` for the task: `1 file changed, 7 insertions(+), 4 deletions(-)`. The message `"Rate limited, retrying"` and the `{ delayMs, attempt: attempt + 1, maxAttempts }` object appear as unmodified context lines — byte-identical.

**What the new comment claims, and why each clause is true after the change:** that the scope was normalised to lowercase-kebab by Phase 43 D-6 (it is `pipedrive-api`); that it was *originally* harvested verbatim from the pre-existing `[Pipedrive API]` bracket prefix under Phase 42's bracket-wins rule (real provenance, stated in the past tense, which is what explains the odd shape); that the space was the harmful property because it made this the one scope not greppable as a single token; and that `src/lib/log-scope-format.test.ts` now holds the shape and asserts this scope by name (it does — the membership assertion). The old comment's three claims — "carries a space and capitals", "unlike every other scope", "flagged rather than silently normalised" — were all false the instant the argument changed.

## Log-line safety (Phase 42 hazards, checked)

- **No `ctx` key named `level`, `scope`, `msg` or `ts` was introduced.** The `ctx` object was not touched at all: it is still `{ delayMs, attempt: attempt + 1, maxAttempts }`, byte-identical. Confirmed against the diff, where all three lines are unmodified context.
- **No API key, token, URL or response body entered a log line.** `withRetry` is a generic wrapper that never receives the credential — `apiKey` is a constructor parameter of the client class further down the file (`:126`, `:608`) and is not in lexical scope at the retry block. The only value that changed is the scope string, which is a hardcoded literal. This is threat T-43-45, dispositioned `accept`, and the acceptance holds by construction rather than by inspection.
- **No new `console.*`.** `grep -c 'console\.' src/lib/import/pipedrive-api-client.ts` = **0**. The non-test count is unchanged at **4**, all inside `src/lib/log.ts`.

## Final verification numbers

| Check | Result |
|---|---|
| `npx vitest run src/lib/log-scope-format.test.ts` | **PASS 9 / FAIL 0** (was 6/3 pre-fix) |
| `npm test` | **4533 passed, 32 skipped, 0 failed** (163 files passed, 2 skipped) — baseline 4524 + the 9 new assertions |
| `npm test` RSC project | **8 passed / 8** (2 files) |
| `npx tsc --noEmit` | **0 errors** |
| `npm run lint` | **0 errors**, 122 warnings (worktree baseline; warning totals are environment-dependent and are not gated on) |
| `grep -c 'console\.' src/lib/import/pipedrive-api-client.ts` | **0** |
| `git diff --diff-filter=D HEAD~1 HEAD` | empty — no deletions in either commit |
| `package.json` / `package-lock.json` | **untouched** (`git diff HEAD` empty for both) |

Nothing outside `src/lib/log-scope-format.test.ts` and `src/lib/import/pipedrive-api-client.ts` was modified. `STATE.md` and `ROADMAP.md` were deliberately not touched — the orchestrator owns those.

## Known Stubs

None.

## Threat Flags

None. No network endpoint, auth path, file access pattern or schema changed; the only production-code delta is one string literal argument.

## Notes for the verifier

- The gate lives at `src/lib/log-scope-format.test.ts`, flat beside `src/lib/log.test.ts`, matching that directory's convention rather than a `__tests__/` subdirectory. This matters for the gate's own walk: the walk excludes `__tests__/` directories *and* any basename containing `.test.`/`.spec.`, so the gate does not scan itself (it contains the literal `"Pipedrive API"` in a failure-message comment and would otherwise flag itself).
- To re-observe the RED, `git stash` is unsafe here (`refs/stash` is shared across worktrees). Use `git show 3f2b03e:src/lib/import/pipedrive-api-client.ts` to see the pre-fix state, or check out `6d188b5` and run the gate.
- The exclusion pin is an **equality** on the offender set, deliberately. When a later plan normalizes `importFromPipedrive` (`src/lib/import/pipedrive-api-import-actions.ts:1159`), the gate goes red and the fix is to delete `PINNED_CASE_EXCLUSION` and the assertion naming it in the same commit — not to add a second entry.

## Self-Check: PASSED

- `src/lib/log-scope-format.test.ts` — FOUND
- `src/lib/import/pipedrive-api-client.ts` — FOUND
- `.planning/phases/43-type-safety-deployment-docs/43-06-SUMMARY.md` — FOUND
- Commit `6d188b5` — FOUND
- Commit `ea0e0d5` — FOUND
