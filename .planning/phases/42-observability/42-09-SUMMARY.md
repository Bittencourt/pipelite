---
phase: 42-observability
plan: 09
subsystem: crm-mutations
tags: [structured-logging, OBS-01, migration, dedup-merge, formula-recalc, audit]
requires:
  - "src/lib/log.ts (42-01)"
provides:
  - "24 structured log call sites across the organization, activity and dedup-merge mutation paths"
  - "the three [dedup-merge] error scopes and the one [dedup-merge] warn scope preserved verbatim"
  - "organizations.test.ts asserting the JSON line shape rather than the bracket prefix"
affects:
  - "42-18's no-console ESLint gate — three more files at zero"
  - "any runbook grepping '[formula-recalc]' / '[audit]' / '[dedup-merge]' in the CRM write paths"
tech-stack:
  added: []
  patterns:
    - "42-PATTERNS.md §5 shape (a) — prefixed console.error in a swallow-and-log catch"
    - "42-PATTERNS.md §5 shape (b) — unprefixed console.error, scope derived from the module path"
    - "one file mixing both shapes; scope resolved per site, never per file"
key-files:
  created: []
  modified:
    - src/lib/mutations/organizations.ts
    - src/lib/mutations/activities.ts
    - src/lib/mutations/dedup.ts
    - src/lib/mutations/organizations.test.ts
decisions:
  - "the dedup budget-exhausted warn keeps its three interpolated values under the SAME names the template literal used (parent / parentId / childrenTotal) rather than renaming them, so an existing operational grep for `parentId=` becomes a grep for `\"parentId\":` with no semantic gap"
  - "the two multi-line formula-recalc calls in organizations.ts are wrapped at argument boundaries (scope, msg and ctx each on their own line) rather than at ~100 cols mid-argument, matching how the originals were already wrapped"
  - "log.ts is imported alphabetically inside the @/lib group in dedup.ts (which is alphabetised) and positionally among the single-line @/lib imports in organizations.ts and activities.ts (which are not)"
metrics:
  duration: "~14 min"
  completed: 2026-08-23
  tasks: 2
  commits: 2
  files_modified: 4
---

# Phase 42 Plan 09: Organization, Activity and Dedup-Merge Log Migration Summary

All 24 `console.*` call sites in `organizations.ts`, `activities.ts` and `dedup.ts` now emit
structured JSON, with the eight bracketed scopes (`[formula-recalc]`, `[audit]`, `[dedup-merge]`)
harvested verbatim and the sixteen unprefixed sites given a path-derived scope — and not one line
carries a value its original string did not.

## What Was Built

**Task 1 — `organizations.ts` + `activities.ts`, 20 sites (commit `ac1ff85`).**
Twenty `console.error` calls became `log.error`, each with the error moved under `ctx.err` so
`name`/`message`/`stack` and the walked `cause` chain survive serialisation. Both files mix three
scopes, so every site's scope was decided by looking at that site's bracket rather than by applying
a file-level default. The two `toContain("[formula-recalc]")` assertions in `organizations.test.ts`
now assert `'"scope":"formula-recalc"'`.

**Task 2 — `dedup.ts`, 4 sites (commit `391a4b1`).**
Three `console.error` → `log.error("dedup-merge", …)` and the file's single `console.warn` →
`log.warn("dedup-merge", …)`. The warn's template literal was decomposed into three named `ctx`
keys. Nothing else in the merge path moved.

## Site census — before and after, reconciling exactly

| File | `console.*` before | `console.*` after | `log.*` call sites after |
|---|---|---|---|
| `src/lib/mutations/organizations.ts` | 10 | **0** | 10 |
| `src/lib/mutations/activities.ts` | 10 | **0** | 10 |
| `src/lib/mutations/dedup.ts` | 4 | **0** | 4 |
| **total** | **24** | **0** | **24** |

Repo-wide, non-test source, using the plan's exact command
(`grep -rnE '(^|[^a-zA-Z0-9_.])console\.(log|error|warn|info|debug)\(' src/ --include=*.ts --include=*.tsx`
filtered of `.test.`/`.spec.`/`__tests__`):

| Measure | Before | After | Delta |
|---|---|---|---|
| non-test `console.*` call sites in `src/` | 246 | **222** | **−24** |

The delta is exactly 24 and the three files are each exactly 0, so the two measurements close on
each other with nothing unaccounted for. (Before-count 246 rather than 42-06's post-migration 253:
that figure was `grep -rn 'console\.'` over `src` **plus `instrumentation.ts`** and counted bare
references, not the call-shaped regex this plan's criterion specifies. Two different rulers, both
internally consistent; the −24 delta is measured with one ruler on both sides.)

## Observed scope sets — stated, as the acceptance criteria require

`grep -oE 'log\.[a-z]+\("[a-z/-]+"' <file> | sort -u`:

| File | Observed scope set | Expected |
|---|---|---|
| `organizations.ts` | `audit`, `formula-recalc`, `mutations/organizations` | ✅ exactly those three |
| `activities.ts` | `audit`, `formula-recalc`, `mutations/activities` | ✅ exactly those three |
| `dedup.ts` | `dedup-merge` (via `log.error` and `log.warn`) | ✅ exactly one |

**One caveat on that grep, so nobody later reads a false clean bill of health from it:** it only
matches when the scope sits on the same source line as `log.<level>(`. `organizations.ts:82` and
`:127` are wrapped calls whose scope is on the *following* line, so those two sites are invisible to
it. The set still came out correct because `organizations.ts:508` is a single-line `formula-recalc`
site that the grep does see. Verified the two wrapped sites separately by reading the diff — both
are `"formula-recalc"`. A stricter gate would need a multi-line-aware matcher.

Per-file distribution as landed:

- `organizations.ts` — `formula-recalc` ×3 (`:82` wrapped, `:127` wrapped, `:508`), `audit` ×1 (`:525`), `mutations/organizations` ×6 (`:258`, `:347`, `:413`, `:452`, `:530`, `:648`)
- `activities.ts` — `formula-recalc` ×2 (`:102`, `:417`), `audit` ×1 (`:440`), `mutations/activities` ×7 (`:195`, `:319`, `:358`, `:420`, `:503`, `:571`, `:629`)
- `dedup.ts` — `dedup-merge` ×4: `log.error` at `:647`, `:686`, `:699`; `log.warn` at `:777`

`grep -c 'log\.warn(' src/lib/mutations/dedup.ts` → **1**. `grep -c 'log\.error('` → **3**. The one
`console.warn` in the file mapped to `log.warn`, not silently upgraded to `log.error`.

`grep -c '{ err' ` → **10** in `organizations.ts`, **10** in `activities.ts`.
`grep -c '\[formula-recalc\]' src/lib/mutations/organizations.test.ts` → **0**;
`grep -c '"scope":"formula-recalc"'` → **2**.

## `ctx` key collision check (wave 1's flat-key warning)

`ctx` keys land flat at the top level of the log line, so a key named `level`, `scope`, `msg` or `ts`
would silently overwrite a base field. Extracted every key added by this plan from the raw diff
(`git diff 4ea73f4 -- <3 files> | grep '^+' | grep -oE '\b[a-zA-Z][a-zA-Z0-9]*:'`):

| Key | Occurrences |
|---|---|
| `err` | 23 |
| `parent` | 1 |
| `parentId` | 1 |
| `childrenTotal` | 1 |

Four distinct keys, 26 occurrences across 24 sites (23 sites use `err` alone; the warn site uses the
other three). **None of the four reserved names appears anywhere in the diff.**

## Redaction (T-42-04) — checked site by site, and explicitly for the merge path

**The dedup merge path was the stated highest-exposure surface in this file set, and it was
checked deliberately rather than by assumption.** All three `log.error` sites in `dedup.ts` are
`(scope, msg, { err: error })` and nothing else — `outcome.survivorRow`, `loser`, `movedDeals`,
`movedPeople`, `loserName` and the whole `MergeChoiceMap` are all in scope at those catches and
**none of them entered a `ctx`**. The temptation the threat model named was not taken.

The `log.warn` site is the only one that carries non-error data, and every value in it was already
in the string it replaced. Before:

```
`[dedup-merge] formula budget exhausted, refresh truncated: parent=${entityType} ` +
  `parentId=${survivorId} childrenTotal=${children.length}`
```

After: `parent: entityType`, `parentId: survivorId`, `childrenTotal: children.length`. Same three
values, same three names, nothing added. The comment directly above it —
*"Identifiers and counts only, never row contents or field values (T-34-06)"* — still describes the
code accurately, which is why it was left untouched.

For the other 20 sites the check is structural: every one was `console.error("<fixed string>", error)`
with a **fixed** message and exactly one interpolation-free argument, so the migrated form
`log.error(scope, "<fixed string>", { err: error })` carries precisely the same one value. No
organization name, person email, phone number, note body, activity title, custom-field blob, audit
diff or session token entered a log line that did not already contain it. **Zero new `ctx` keys
beyond `err` were introduced outside the one warn site.**

Worth recording for whoever reads `dedup.test.ts:650-668` later: that test proves the pg driver
message (`notes_migration_uniq`, `23505`) stays out of the **returned value** while still reaching
the server log. That property is unchanged — the driver error object now reaches the log through
`ctx.err` instead of as a second `console.error` argument, which is the same exposure by a different
route, and the returned `{ success: false, error: "FAILED" }` sentinel is byte-identical.

## Control flow — nothing moved

- Grepped the raw `dedup.ts` diff for `transaction`, `return `, `revalidatePath`, `crmBus.emit`,
  `.commit` and `tx.` across both sides: **0 hits.** No transaction boundary, no return statement
  and no emit is on either side of the diff.
- The two deliberate post-merge swallows (`dedup.ts:647` formula recalc, `:686` event emit) each
  still hold exactly one statement and still swallow. Their header comments — *"D-05: formula
  machinery never blocks a write, and the merge has already committed"*, and the long block
  explaining why the emit sits outside and after the transaction — were read before editing and left
  verbatim.
- Same for the swallow-and-log catches in the other two files: the `[audit]` catches at
  `organizations.ts:525` / `activities.ts:440` (a lost audit row must not roll back a visible
  restore) and the `[formula-recalc]` catches (D-05) all keep their one-statement bodies.
- Every `{ success, error }` and `{ success: true, … }` shape is unchanged, which the four existing
  `expect(result).toEqual({ success: false, error: "Failed to …" })` assertions in
  `activities.test.ts` and `organizations.test.ts` independently pin.

## Verified the plan's premises instead of trusting them

The orchestrator flagged that 42-06's brief carried a false "no suite asserts on X" premise. This
plan's `<owned_test_files>` claim was therefore grepped rather than assumed:

- Searched every test file in the repo for all 24 migrated message strings and for `dedup-merge` /
  `formula budget exhausted`. **The only log-string assertions in the repo touching these files are
  the two `toContain("[formula-recalc]")` lines the plan named** — `organizations.test.ts:603` and
  `:688`. Premise correct.
- The other 11 `vi.spyOn(console, "error")` sites across `organizations.test.ts` (5),
  `activities.test.ts` (5) and `dedup.test.ts` (3) all assert only `toHaveBeenCalled()`, never an
  argument shape, so all 13 spies keep working untouched — exactly the blast-radius reduction
  wave 1's `console`-delegation choice was made to buy.
- The four hits for strings like `"Failed to restore activity"` in test files are **return-value**
  assertions (`expect(result).toEqual({ success: false, error: … })`), not log assertions. Return
  shapes were not touched, so they are unaffected. One of them lives in
  `src/app/activities/bulk-actions.test.ts` — a file this plan does not own and did not edit.
- `src/lib/mutations/people.test.ts` (plan 08's two equivalent assertions) was **not touched**;
  confirmed absent from the diff.
- `src/lib/dedup/` (the eight modules plan 42-12 owns) and `src/lib/mutations/index.ts` (the shared
  barrel) were **not touched**. `src/lib/mutations/dedup.ts` is a different file from anything in
  `src/lib/dedup/`.

## Deviations from Plan

**None.** Both tasks executed exactly as written. The site inventory was verified per site rather
than trusted and **matched the plan exactly** — all 24 lines, all three scope assignments per file,
the multi-line pair at `organizations.ts:81`/`:125`, and `dedup.ts:779` as the file's only
`console.warn`. No disagreement to report.

No auto-fixes were needed: no bugs, no missing critical functionality and no blockers were found in
the four files. No architectural question arose.

### Two corrections to numbers the plan states

1. **The plan's `npm test` criterion ("at least 4406 passed") is stale.** Wave 1's handoff supersedes
   it with 4455 and 42-06 then took it to 4463. The real figure at this plan's base is **4514**, and
   4514 is also where it ended — this plan changes no test count, only one assertion string in two
   places.
2. **The plan's before/after console criterion is satisfied at 246 → 222**, not against 42-06's 253.
   See the census table above for why the two figures differ; the −24 delta itself is exact.

## Verification — exact numbers

| Check | Result |
|---|---|
| `npx vitest run src/lib/mutations` (after task 1) | **314 passed / 0 failed** |
| `npx vitest run src/lib/mutations src/lib/dedup` (after task 2) | **566 passed / 0 failed** |
| `npm test` — unit project | **4514 passed / 32 skipped / 0 failed**, 162 files passed / 2 skipped |
| `npm test` — RSC project | **8 passed / 0 failed** |
| `npx tsc --noEmit` | **0 errors** |
| `npm run lint` (full repo) | **0 errors / 122 warnings** |
| `npx eslint` on the 4 changed files | **0 errors / 0 warnings** |
| repo-wide non-test `console.*` | 246 → **222** (−24) |

Baseline was 4514 passed / 32 skipped, RSC 8/8, typecheck 0, lint 0 errors. **Every number is
preserved exactly**; nothing regressed and nothing was added.

**On the lint warning count: 122 here versus the brief's 124.** This is the same discrepancy 42-06
reported and investigated, and this plan is not the cause — `npx eslint` on all four changed files
reports **zero** warnings, so there were no warnings in these files to remove. As 42-06 concluded, it
is a worktree-vs-main-checkout measurement difference (a worktree receives only tracked files, so
gitignored files present in the main checkout are absent here). Worth one glance from whoever runs
the next full-repo lint on the main checkout; not worth blocking on. Two independent plans now
measuring 122 in a worktree is itself evidence the difference is environmental.

## Notes for later plans

- **Three more files are at zero `console.*`**, which moves 42-18's `no-console` ESLint gate three
  files closer. `src/lib/mutations/` still holds `deals.ts`, `people.ts`, `notes.ts` (plan 08, in
  flight beside this one) plus `workflows.ts`, `http-templates.ts`, `workflow-templates.ts` and
  `index.ts`.
- **The single-line scope grep in these acceptance criteria under-reports wrapped calls.** Any later
  plan reusing `grep -oE 'log\.[a-z]+\("[a-z/-]+"'` as a gate should know it silently skips calls
  whose scope is on the next line. 42-18's collision check should be multi-line-aware for the same
  reason.
- **`[dedup-merge]` has left the log stream as a bracket string.** Nothing in the repo greps for it
  (verified: zero references outside `dedup.ts` itself), but an external runbook might. The
  replacement query is `'"scope":"dedup-merge"'`.
- **No file in this plan was on A7's list**, and none of the five stale `Dockerfile:24` comments from
  wave 1 live in these four files — so there was no comment for this plan to repair.

## Known Stubs

None. No placeholder values, no hardcoded empties, no unwired data paths, no TODO/FIXME introduced.
Every migrated call is a live, reachable log statement.

## Threat Flags

None. No new network endpoint, no new auth path, no new file access pattern, no schema change. This
plan changed the **format** of 24 existing log lines and the arguments passed to one existing test
assertion; it introduced no new security-relevant surface.

## Self-Check: PASSED

Files claimed as modified — all 4 exist and are committed:

- `src/lib/mutations/organizations.ts` — FOUND
- `src/lib/mutations/activities.ts` — FOUND
- `src/lib/mutations/dedup.ts` — FOUND
- `src/lib/mutations/organizations.test.ts` — FOUND

Commits claimed — both present in `git log`: `ac1ff85`, `391a4b1`.

Files outside the plan's declared four: **none**. `git status --short` is clean, no untracked files,
and `git diff --diff-filter=D HEAD~1 HEAD` reports zero deletions on both commits. `STATE.md`,
`ROADMAP.md` and `REQUIREMENTS.md` were **not** written — the orchestrator owns those after the batch.
