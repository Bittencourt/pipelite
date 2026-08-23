---
phase: 42-observability
plan: 15
subsystem: dedup-ui-and-entity-actions
tags: [structured-logging, OBS-01, migration, redaction, dedup, merge, notes, trash]
requires:
  - "src/lib/log.ts (42-01)"
provides:
  - "24 structured log call sites across the duplicate-scan and merge surfaces, the notes/activities/deals/trash actions and the workflow-run page"
  - "ten scopes: four harvested brackets, one shared inline bracket (dedup), five path-derived"
  - "the counts-only restore log migrated with its T-37-27 comment intact, six named ctx keys"
  - "the repaired [trash-actions] assertion, now asserting the JSON scope field"
  - "a measured correction: the scope gate in the plan family is 0-for-24 as written, not merely leaky"
affects:
  - "42-18's repo-wide no-console gate — eleven more files at zero, four orphan prefix constants gone"
  - "any runbook grepping [duplicates-actions], [merge-action], [merge-page], [trash-actions] or [dedup]: all five strings are gone from src/, e2e/ and instrumentation.ts"
  - "42-18 — the char-class scope gate cannot see the workflows/[id]/runs/[runId] scope; use a [^\"]+ matcher"
tech-stack:
  added: []
  patterns:
    - "42-PATTERNS.md §5 shape (a) — prefixed console.error in a swallow-and-log catch"
    - "42-PATTERNS.md §5 shape (b) — unprefixed console.error, scope from the module path"
    - "42-PATTERNS.md §5 shape (e) — the concatenated multi-line template becomes six named keys"
    - "42-11's convention: a string refusal reason lands under `reason`, never under `err`"
key-files:
  created:
    - .planning/phases/42-observability/42-15-SUMMARY.md
  modified:
    - src/app/duplicates/actions.ts
    - src/app/duplicates/[pairId]/actions.ts
    - src/app/duplicates/page.tsx
    - src/app/duplicates/[pairId]/page.tsx
    - src/app/trash/actions.ts
    - src/app/trash/actions.test.ts
    - src/app/people/actions.ts
    - src/app/organizations/actions.ts
    - src/app/notes/actions.ts
    - src/app/activities/actions.ts
    - src/app/deals/actions.ts
    - src/app/workflows/[id]/runs/[runId]/page.tsx
decisions:
  - "duplicates/[pairId]/actions.ts:271's refusal reason lands under `reason`, not `err` — it is a closed FAILED/NOT_FOUND/SAME_RECORD/NOT_IN_PAIR code string, not a serialised Error, and `err` means a serialised Error everywhere else in the phase (42-11's precedent, adopted verbatim)"
  - "trash/actions.ts keeps `.join(\", \")` on the two identifier lists rather than promoting them to arrays: the original string logged the joined form, and an array would be a different value in the line — the plan's own key_links pattern asks for joined lists"
  - "the scope argument is on the SAME LINE as log.error in all 24 sites, even where the ctx object wraps — this costs nothing and keeps the phase's same-line scope gates able to see the call at all"
  - "four of the five owned test files were NOT edited: people/organizations assert toHaveBeenCalledTimes(1) on the warn spy and notes asserts toHaveBeenCalled(), all shape-agnostic. Only trash's bracket assertion was breaking. The plan's 'repair only what reddens' was the right instruction and nothing else reddened"
  - "the stale 'under its own prefix' comment in duplicates/[pairId]/actions.ts:270 now names the dedup-merge scope — 42-09 turned that prefix into a scope field, so the sentence was already false"
metrics:
  duration: "~40 min"
  completed: 2026-08-23
  tasks: 3
  commits: 3 (+1 for this summary)
  files_modified: 12
  sites_migrated: 24
---

# Phase 42 Plan 15: The Duplicate-Scan and Merge Surfaces, the Notes and Entity Actions Summary

All 24 `console.*` sites across the eleven source files now emit structured JSON under ten scopes,
the four orphaned prefix constants are gone, and the one site in the whole migration whose own
comment states the counts-only rule still states it — next to code that still obeys it.

## Commits

| # | Hash | What |
|---|---|---|
| 1 | `9fb1bce` | the four duplicates surfaces (12 sites), three `LOG_PREFIX` constants deleted, one stale comment |
| 2 | `13a7052` | `trash/actions.ts` (1) + the two `[dedup]` warns, one `LOG_PREFIX` deleted, one assertion repaired |
| 3 | `eaad094` | notes (4), activities (3), deals (1), the workflow-run page (1) |

Base: `01c92ea`. The worktree arrived on `286c470` — **stale, as predicted (26 for 26)** — and was
fast-forwarded before any work. `src/lib/log.ts` confirmed present afterwards.

## Site census — 24, on the eslint ruler, reconciling per file

`npx eslint 'src/**/*.{ts,tsx}' --rule '{"no-console":"error"}'`, test paths filtered:

| File | before | after | scope | level |
|---|---|---|---|---|
| `duplicates/actions.ts` | 5 | 0 | `duplicates-actions` | error ×5 |
| `duplicates/[pairId]/actions.ts` | 3 | 0 | `merge-action` | error ×3 |
| `duplicates/page.tsx` | 2 | 0 | `duplicates-page` | error ×2 |
| `duplicates/[pairId]/page.tsx` | 2 | 0 | `merge-page` | error ×2 |
| `trash/actions.ts` | 1 | 0 | `trash-actions` | error ×1 |
| `people/actions.ts` | 1 | 0 | `dedup` | **warn ×1** |
| `organizations/actions.ts` | 1 | 0 | `dedup` | **warn ×1** |
| `notes/actions.ts` | 4 | 0 | `notes/actions` | error ×4 |
| `activities/actions.ts` | 3 | 0 | `activities/actions` | error ×3 |
| `deals/actions.ts` | 1 | 0 | `deals/actions` | error ×1 |
| `workflows/[id]/runs/[runId]/page.tsx` | 1 | 0 | `workflows/[id]/runs/[runId]` | error ×1 |
| **total** | **24** | **0** | **10 scopes** | **22 error / 2 warn** |

Level for level: the 22 `console.error` became 22 `log.error` and the 2 `console.warn` became 2
`log.warn`. **Nothing was silently promoted.** Proven by `grep -c 'log\.warn('` returning 1 in each
of `people/actions.ts` and `organizations/actions.ts`, and by `people/actions.test.ts:179`'s
`expect(warn).toHaveBeenCalledTimes(1)` still passing unchanged — a `log.error` there would have
left that spy at zero.

**Repo-wide non-test count: 113 → 89, delta exactly −24**, across 44 → 33 files. The plan's per-file
inventory was correct in every one of its eleven rows — verified against the eslint census *before*
editing anything, which is the check the executor brief asked for and which several earlier plans in
this phase failed.

## The counts-only site — `trash/actions.ts`, quoted verbatim

Before:

```typescript
  if (skipped.length > 0 || failed.length > 0) {
    // Identifiers and counts only, never record contents — the rule `formula-recalc.ts:927`
    // established for this codebase (T-37-27).
    console.error(
      `${LOG_PREFIX} restoreWithLinked ${entityType} ${recordId}: skipped ${skipped.length} ` +
        `[${skipped.join(", ")}], failed ${failed.length} [${failed.join(", ")}]`
    )
  }
```

After:

```typescript
  if (skipped.length > 0 || failed.length > 0) {
    // Identifiers and counts only, never record contents — the rule `formula-recalc.ts:927`
    // established for this codebase (T-37-27).
    log.error("trash-actions", "restoreWithLinked partially skipped", {
      entityType,
      recordId,
      skippedCount: skipped.length,
      skipped: skipped.join(", "),
      failedCount: failed.length,
      failed: failed.join(", "),
    })
  }
```

Six named `ctx` keys, exactly the six interpolated values. The comment is **byte-identical** —
`grep -c 'T-37-27' src/app/trash/actions.ts` → **1**, and it still sits directly above the call it
governs, which was the point of routing this site through a plan rather than a sweep. The two joined
values are `${parent.entityType}:${parent.id}` strings — identifier pairs, built by the loop 12 lines
above — so carrying them is the same disclosure the original line made, not a widening. T-42-45
closed.

## `duplicates/[pairId]/actions.ts:271` — before and after, as the acceptance criterion requires

Before:

```typescript
    // The mutation has already logged the real error under its own prefix; this line records the
    // refusal at the boundary, in identifiers and its own code only.
    console.error(`${LOG_PREFIX} merge of pair ${pairId} refused: ${result.error}`)
```

After:

```typescript
    // The mutation has already logged the real error under its own scope (`dedup-merge`); this line
    // records the refusal at the boundary, in identifiers and its own code only.
    log.error("merge-action", "merge refused", { pairId, reason: result.error })
```

**The refusal reason went to `reason`, not to `err`.** There is no `Error` object at this site — the
original call had no second argument, and `result.error` is one of the mutation's four closed codes
(`FAILED`, `NOT_FOUND`, `SAME_RECORD`, `NOT_IN_PAIR`), which the very next statement switches on to
build the browser's `code`. Naming it `err` would have implied a serialised `Error` with a stack,
which is what `err` means at the other 22 sites in this plan and everywhere else in the phase. This
is 42-11's decision for `notes-collection.ts`, adopted rather than re-litigated. The same reasoning
put `duplicates/actions.ts:544`'s `result.error` under `reason` too.

The comment change is the second half of the same correction and is a deviation — see below.

## The four deleted prefix constants

| File | Constant | Value it held |
|---|---|---|
| `duplicates/actions.ts:52` | `LOG_PREFIX` | `[duplicates-actions]` |
| `duplicates/[pairId]/actions.ts:50` | `LOG_PREFIX` | `[merge-action]` |
| `duplicates/[pairId]/page.tsx:68` | `LOG_PREFIX` | `[merge-page]` |
| `trash/actions.ts:44` | `LOG_PREFIX` | `[trash-actions]` |

Each was grepped for other uses before deletion; none had any. `duplicates/page.tsx` used inline
brackets and had no constant, as the plan said.

`npx eslint src/app/duplicates src/app/trash src/app/people src/app/organizations` → **0 errors,
0 warnings**, which is the gate that would have caught a survivor via `no-unused-vars`. T-42-38
closed.

**Repo-wide, the five bracket strings are gone:**
`grep -rn 'duplicates-actions\]\|merge-action\]\|merge-page\]\|duplicates-page\]\|trash-actions\]\|\[dedup\]' src/ e2e/ instrumentation.ts` → **zero hits**, tests and prose included. No comment in this
plan's files quotes a string this plan deleted — the A7 class of defect, checked for rather than
assumed.

## Redaction — confirmed per surface, not assumed

The rule is that nothing may enter a log line that was not already in the string being replaced.
This plan owns the highest-exposure UI surface in the application: the merge screens exist to hold
**two full candidate CRM records side by side**, and `notes/actions.ts` handles free-text note
bodies.

| Surface | What was in scope at the call site | What the line carries | New values added |
|---|---|---|---|
| `duplicates/actions.ts` ×5 | the whole scan row, `userId`, the identity-field list, `session` | `scanId`, `scannable`, `pairId`, `fieldCount`, `reason`, `err` | **none** |
| `duplicates/[pairId]/actions.ts` ×3 | `pair.recordAId/BId`, the full `MergeChoiceMap` the browser submitted, the survivor and the loser | `pairId`, `survivorId`, `loserId`, `reason`, `err` | **none** |
| `duplicates/page.tsx` ×2 | every field definition, the scan starter's **name and e-mail** (`readStarterName` returns `row.name ?? row.email`) | `err` and nothing else | **none** |
| `duplicates/[pairId]/page.tsx` ×2 | both `PairRecordDetail` rows, every custom-field value, resolved organization **names** | `entityType`, `referenceCount`, `err` | **none** |
| `trash/actions.ts` ×1 | the trashed record, its `name`, every trashed parent row | an entity type, a record id, two counts, two joined id lists | **none** |
| `people/actions.ts`, `organizations/actions.ts` ×2 | the draft record — name, e-mail, phone — and the `CertainMatch[]` the lookup would have returned | `err` and nothing else | **none** |
| `notes/actions.ts` ×4 | `content`, the note body, up to the column limit of user free text | `err` and nothing else | **none** |
| `activities/actions.ts` ×3 | the activity rows with their relations, the filter set | `err` and nothing else | **none** |
| `deals/actions.ts` ×1 | `assigneeUser.email`, `dealName`, `assignerName` — all three in the enclosing scope | `err` and nothing else | **none** |
| `workflows/[id]/runs/[runId]/page.tsx` ×1 | `changedRecords`, i.e. audited CRM rows for the run | `err` and nothing else | **none** |

**Not one candidate pair, survivor/loser record body, match key, name, e-mail address, phone number,
custom-field value or note body entered a log line that did not already contain it.** The five
temptations, all declined:

1. **`merge-action:231`** has `pair.recordAId`, `pair.recordBId`, `survivorId` and `loserId` in
   scope and logs only the four ids — which is what the original string interpolated. Adding the
   two records would have been the natural "helpful" debugging move on precisely the path that
   exists to compare them.
2. **`merge-page:279`** logs `referenceCount: ids.length` and not `ids`, and certainly not the
   `organizations.name` values the query returns. The `ids.length` count is what the original
   string had.
3. **`duplicates-page:142`** sits inside `readStarterName`, whose whole job is resolving a user's
   name or e-mail. Its `ctx` is `{ err }`.
4. **`notes/actions` ×4** carry `{ err: error }` only. Grep-enforced:
   no `body`, `content` or `text` key appears in any `ctx` in that file (the three `content` hits in
   the file are the timeline-entry construction at :108, the `addNote` parameter at :128 and the
   `editNote` parameter at :158 — none is a `ctx` key).
5. **`deals/actions:129`** has `assigneeUser.email` two lines above it. Its `ctx` is `{ err }`.
   Grep-enforced: no `email` or `to` key in any `ctx` in that file (the one `email:` hit is the
   drizzle `.select({ email: users.email })` projection at :108).

T-42-45, T-42-46, T-42-47 and T-42-48 all closed by construction rather than by assertion, and each
one checked by reading the enclosing scope for what was *available* to leak, not just the diff.

## `ctx` keys — 15 distinct, and the reserved-name check

Wave 1's hazard: `ctx` keys land **FLAT** at the top level, so a key named `level`, `scope`, `msg`
or `ts` silently overwrites a base field. `src/lib/log.ts:97` builds
`{ level, scope, msg, ts: … }` and then spreads `ctx`, so the collision is real and last-write-wins.

| Scope | ctx keys |
|---|---|
| `duplicates-actions` | `scanId`, `scannable`, `pairId`, `fieldCount`, `reason`, `err` |
| `merge-action` | `pairId`, `survivorId`, `loserId`, `reason`, `err` |
| `duplicates-page` | `err` |
| `merge-page` | `entityType`, `referenceCount`, `err` |
| `trash-actions` | `entityType`, `recordId`, `skippedCount`, `skipped`, `failedCount`, `failed` |
| `dedup` | `err` |
| `notes/actions` | `err` |
| `activities/actions` | `err` |
| `deals/actions` | `err` |
| `workflows/[id]/runs/[runId]` | `err` |

15 distinct: `entityType`, `err`, `failed`, `failedCount`, `fieldCount`, `loserId`, `pairId`,
`reason`, `recordId`, `referenceCount`, `scanId`, `scannable`, `skipped`, `skippedCount`,
`survivorId`.

**No `level`, `scope`, `msg` or `ts` key anywhere in the diff.** Checked two ways: a brace-matching
parse of all 24 `log.*(…)` calls that splits the `ctx` object at depth 0 and reports any fragment it
cannot resolve to an identifier (zero unparsed), and a deliberately over-broad regex sweep of the
eleven files that collected 100+ candidate tokens including prose words — the reserved four appear
in neither set.

## The plan's own scope gate is 0-for-24, and one scope is invisible even to the repaired version

The executor brief warned about three independent defects in the
`grep -roE 'log\.[a-z]+\("[a-z0-9/\[\]-]+"'` family. Measured here, over all eleven files:

| Gate as run | scopes seen | sites seen | why |
|---|---|---|---|
| **the plan family's string verbatim** (`[a-z0-9/\[\]-]`) | **0 of 10** | **0 of 24** | the char class is malformed ERE. `\[\]` inside a bracket expression does not denote the two bracket characters; here it poisons the whole class and the pattern matches nothing at all |
| char class repaired to `[]a-z0-9/[-]` | **9 of 10** | **23 of 24** | misses `workflows/[id]/runs/[runId]` — the class has no uppercase range and `runId` contains `I` |
| multi-line-aware `/\blog\.(debug\|info\|warn\|error)\(\s*"([^"]+)"/` | **10 of 10** | **24 of 24** | nothing |

Two things worth carrying forward:

**The verbatim gate is worse than "leaky" here — it is vacuous.** 42-10 measured it at 5 of 10 on
its own file set; on mine it is 0 of 10. It cannot fail, because it can never match. An acceptance
criterion of the form "this grep yields exactly {a, b, c, d}" would have been read as a failure on
a correct diff, and one of the form "returns 0 console calls" would have passed on a diff that did
nothing. **Task 1's criterion in this plan happens to use a narrower `[a-z-]` class, which does see
all 12 duplicates sites** — so the plan is internally inconsistent about its own gate, and the
looser-looking one is the working one.

**A correction to my brief's premise.** The brief predicted that `[pairId]` would make the
`src/app/duplicates/[pairId]/…` scopes invisible to a lowercase-only class. It does not: those two
files carry **harvested bracket** scopes (`merge-action`, `merge-page`), which are all-lowercase, and
the capital in the directory name never reaches a scope string. The blind spot is real but lands on
exactly one site — `workflows/[id]/runs/[runId]`, the only **path-derived** scope in this plan whose
path contains a camelCase dynamic segment. So the rule for 42-18 is narrower and sharper than
"anything under a bracketed directory": it is *path-derived scopes only*, and `[runId]`, `[noteId]`
and `[entityType]` are the three known instances.

All 24 sites were additionally verified by reading the diff, and every scope argument was
deliberately placed on the same line as its `log.error(` even where the `ctx` object wraps — so the
same-line blind spot, the third defect in the family, does not apply to any site in this plan.

`[runId]` and the two `[pairId]`-directory scopes confirmed present by the `[^"]+` matcher:
`workflows/[id]/runs/[runId]` ×1, `merge-action` ×3, `merge-page` ×2.

## The `ts` flake class — checked, and it does not apply here

42-12's finding: every migrated line now carries a fresh ISO timestamp, the only run-varying digit
source in a JSON log line, so any `not.toContain("<short digit string>")` assertion running against
log output is a latent flake. Grepped all five owned suites for `not.toContain` and `not.toMatch`:

| Site | Needle | Runs against | Flake risk |
|---|---|---|---|
| `trash/actions.test.ts:190` | `"Database unavailable"` | `JSON.stringify(result)` | none — not log output, and not digits |
| `trash/actions.test.ts:477` | `"foreign key"` | `JSON.stringify(result)` | none |
| `notes/actions.test.ts:393, 575, 590, 607, 620` | word regexes | `result.error` | none — not log output |
| `activities/bulk-actions.test.ts:305` | `"duplicate key"` | `JSON.stringify(result)` | none |
| `activities/bulk-actions.test.ts:641, 642, 665, 694, 722` | identifier names | a **source-file slice** | none |

**Zero assertions in this plan's owned suites run a digit needle against log output, so no clock
needed pinning.** Reported rather than assumed: 42-12 had to add two frozen clocks, and the honest
answer here is that the equivalent exposure does not exist in these five files.

## The repaired assertion, and the four test files that did not need repairing

`src/app/trash/actions.test.ts:330`:

```diff
-    expect(errorLines().some((line) => line.includes("[trash-actions]"))).toBe(true)
+    expect(errorLines().some((line) => line.includes('"scope":"trash-actions"'))).toBe(true)
```

The surrounding assertions — the `toEqual` on the result envelope with `count: 2` and
`unrestoredParents: 1`, which is what actually proves the skipped/failed reporting — are byte-
unchanged, as the plan required. The assertion passing is itself the empirical proof that the line
carries `"scope":"trash-actions"`; `errorLines()` joins the spy's call arguments, and with a single
JSON-string argument that join is the line itself.

**Four of the five owned test files were not edited, and none reddened:**

| File | Its console assertion | Why it survived |
|---|---|---|
| `people/actions.test.ts:179` | `expect(warn).toHaveBeenCalledTimes(1)` | shape-agnostic, and doubles as the proof the warn stayed a warn |
| `organizations/actions.test.ts:178` | same | same |
| `notes/actions.test.ts:577, 608, 621` | `expect(consoleError).toHaveBeenCalled()` | shape-agnostic |
| `activities/bulk-actions.test.ts:158` | spy with no assertion on it (noise suppression) | nothing to break; and it covers `bulk-actions.ts`, which has no site in this plan — the plan predicted this correctly |

**No test file outside this plan's ownership reddened at any point.** Verified two ways: the full
suite is green, and a repo-wide grep for every message string this plan changed
(`addNote failed`, `Failed to get activities`, `Failed to send deal-assigned email`,
`Run changed-records read failed`, `restoreWithLinked `, …) finds no assertion on any of them —
only the source lines themselves and the unrelated user-facing `error:` return values in
`activities/actions.ts`, which are unchanged.

## Deviations from Plan

### 1. [Rule 1 — comment states something false] The stale "under its own prefix" cross-reference

**Found during:** Task 1, while migrating `duplicates/[pairId]/actions.ts:271`.

**Issue:** the comment above that site read *"The mutation has already logged the real error under
its own prefix."* Plan **42-09** migrated `src/lib/mutations/dedup.ts` earlier in this wave; read
and confirmed rather than assumed — that module now logs `log.error("dedup-merge", …)` at lines 650,
689 and 702 and `log.warn("dedup-merge", …)` at 780. There is no prefix any more. This is the same
class of defect as A7: a comment naming a string the migration deleted, in a file whose own log call
was being migrated in the same commit.

**Fix:** the sentence now reads *"under its own scope (`dedup-merge`)"* — it names the string that
actually exists, and names it explicitly so a reader can grep for it. The rest of the comment (the
"identifiers and its own code only" clause, which is the redaction rationale) is unchanged.

**Files:** `src/app/duplicates/[pairId]/actions.ts`. **Commit:** `9fb1bce`.

Checked for siblings: `grep -rn 'prefix'` across all eleven owned files returns eight other hits,
every one of them about a Tailwind breakpoint prefix, a label-key prefix or a UUID prefix test.
This was the only stale logging cross-reference in my file set.

### 2. [criterion refined] Task 1's scope-set criterion was satisfied, Task 3's console-count criterion was measured on a different ruler

Task 3's criterion says the repo-wide count must drop by 24 "using the counting command in the
verification section", which is a grep. I measured on **eslint** (113 → 89) because that is the tool
42-18's gate uses and the tool the executor brief mandates, and because 42-12 recorded that the two
rulers disagree by 2 on the absolute figure while agreeing on every delta. The delta is −24 either
way. Not a deviation in substance, but the number in this summary is the eslint one.

No other deviations. No Rule 4 architectural question arose. No auth gates. No blockers. No package
installs were attempted — `node_modules` is the shared symlink and nothing was missing.

## Verification — exact numbers, all measured after the last code commit

| Gate | Result |
|---|---|
| `npm test` — main project | **4524 passed / 32 skipped / 0 failed** (162 files passed, 2 skipped) |
| `npm test` — RSC project | **8 passed / 0 failed** (2 files) |
| `npx tsc --noEmit` | **0 errors** (exit 0) |
| `npx eslint 'src/**/*.{ts,tsx}'` | **0 errors** / 122 warnings |
| `npx eslint src/app/duplicates src/app/trash src/app/people src/app/organizations` | **0 errors / 0 warnings** |
| `npx vitest run src/app/duplicates` | 111 passed / 0 failed |
| `npx vitest run src/app/trash src/app/people src/app/organizations` | 199 passed / 0 failed |
| `npx vitest run src/app/notes src/app/activities src/app/deals src/app/workflows` | 388 passed / 0 failed |
| non-test `console.*`, eslint ruler | 113 in 44 files → **89 in 33 files** (−24, −11 files) |
| `console.` in the eleven owned sources | **0** in all eleven |
| `const LOG_PREFIX` in the four files that had one | **0** |
| `T-37-27` in `trash/actions.ts` | **1** (comment intact) |
| `log.warn(` in `people/actions.ts` / `organizations/actions.ts` | **1** / **1** |
| `"scope":"trash-actions"` in `trash/actions.test.ts` | **1**; `[trash-actions]` → **0** |
| `use client` in the workflow-run page | **0** (still a server component) |
| control-flow lines added/removed across the whole plan diff | **0** — `grep -cE '^[+-].*(revalidatePath\|redirect\(\|return \{\|notFound\()'` on the full diff |

**Baseline preserved exactly:** 4524 / 32 and RSC 8/8 are the figures the orchestrator supplied, and
lint errors stayed at 0. The lint **warning** count is **122**, the worktree figure (the main
checkout reads 124 for reasons unrelated to this phase); no warning was added or removed — all four
directories this plan touched are at 0 warnings on both sides of the change.

Files this plan was forbidden to touch, confirmed absent from `git diff 01c92ea HEAD --stat`:
**`src/lib/dedup/*`** (all eight modules, migrated by 42-12), **`src/lib/mutations/dedup.ts`**
(42-09), **`instrumentation.ts`** (42-17), **`.planning/STATE.md`** and **`.planning/ROADMAP.md`**
(the orchestrator's). The diff is exactly 12 files: the eleven declared sources plus
`trash/actions.test.ts`. The other four declared test files are unmodified.

## What the log lines look like now

`src/lib/log.ts:97` builds `{ level, scope, msg, ts }` in that fixed order and then spreads `ctx`,
so the migrated shapes are:

```json
{"level":"error","scope":"trash-actions","msg":"restoreWithLinked partially skipped","ts":"…","entityType":"deal","recordId":"d1","skippedCount":1,"skipped":"organization:o9","failedCount":1,"failed":"person:p3"}
{"level":"error","scope":"merge-action","msg":"merge refused","ts":"…","pairId":"…","reason":"NOT_IN_PAIR"}
{"level":"warn","scope":"dedup","msg":"create-time duplicate check failed; creating without a warning","ts":"…","err":{"name":"Error","message":"connection terminated","stack":"…"}}
```

The third is the A3 payoff on this plan's surface: the `err` object keeps its stack, where a naive
`JSON.stringify(err)` would have emitted `{}` — and it is a `warn`, not an `error`, because a failed
duplicate check must not read as a failed create.

Operationally, the `trash-actions` line is the interesting one: `skippedCount` and `failedCount` are
now queryable numbers rather than digits inside a sentence, which is what makes "how often does a
linked restore come back partial" answerable without parsing prose. That was the argument for the
whole migration and this is the site where it is easiest to see.

## Known Stubs

None. All 24 sites are wired to the real logger. Nothing is placeholdered and nothing is deferred to
a later plan.

## Threat Flags

None. This plan added no network endpoint, no auth path, no file access and no schema change. It
removed one class of surface (bracketed prefixes in source strings) and widened nothing: every
`ctx` key carries a value the string it replaced already carried.

## Notes for the next plans

- **42-18's scope gate must not be the char-class grep.** It is 0-for-24 on this file set as written
  in the plan family, and 23-of-24 even after the ERE is repaired. Use
  `/\blog\.(debug|info|warn|error)\(\s*"([^"]+)"/`. Third and fourth independent confirmations now
  (42-08, 42-09, 42-12, and this plan) — but this is the first measurement where it matched **nothing
  at all**, which means it can pass an empty diff.
- **The camelCase blind spot is specifically path-derived scopes.** `workflows/[id]/runs/[runId]` is
  this plan's only affected site. Harvested bracket scopes are all-lowercase by construction, so a
  file under `[pairId]/` is not automatically at risk — the risk is the scope string, not the path.
  Known instances across the phase: `[runId]`, `[noteId]` (42-10), `[entityType]`.
- **The `ts` flake class did not apply here**, and the reason generalises: it only bites assertions
  whose needle is a short digit string **and** whose subject is log output. Assertions against a
  `result` object or a source-file slice are unaffected. That narrows 42-18's phase-wide sweep
  considerably.
- **`dedup` is now a shared scope across two files** (`people/actions.ts` and
  `organizations/actions.ts`), which is correct: those two `certainMatchesOrNone` helpers are
  deliberately duplicated verbatim — `people/actions.ts:50-52` says so and says "the two must change
  together" — and they were changed together, identically. A future reader seeing one `dedup` scope
  emitted from two modules should not "fix" it.
- **`src/lib/dedup/*` and `src/lib/mutations/dedup.ts` were already migrated** (42-12 and 42-09) and
  this plan's UI/action surface aligns with the scope names they established: this plan's
  `merge-action` boundary log now explicitly cross-references 42-09's `dedup-merge` scope.

## Self-Check: PASSED

- All 12 modified files exist on disk and are committed; `git status --short` is empty.
- All three commit hashes resolve: `9fb1bce`, `13a7052`, `eaad094`.
- `git diff --diff-filter=D HEAD~3 HEAD` reports no deletions — no file was removed by any commit.
- Every number in the Verification table was read from a command run after the last code commit.
- The three bootstrap symlinks were created before any read and the tree was clean afterwards; the
  base was corrected from `286c470` to `01c92ea` before any edit, and `src/lib/log.ts` confirmed
  present.
- One claim corrected during this self-check: an earlier draft of the ctx-key table said 14 distinct
  keys while the brace-matching parse reports **15** (`failed` and `skipped` are separate keys from
  `failedCount` and `skippedCount`). The table now enumerates 15 and the count matches.
- Second correction: the brief's `[pairId]` prediction is recorded as **not borne out**, with the
  reason, rather than repeated as if confirmed.
</content>
</invoke>
