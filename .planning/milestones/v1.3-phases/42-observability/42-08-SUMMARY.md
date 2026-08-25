---
phase: 42-observability
plan: 08
subsystem: crm-mutations
tags: [structured-logging, migration, OBS-01, deals, people, notes]
requires:
  - "src/lib/log.ts (42-01)"
provides:
  - "26 structured log call sites across the three densest CRM write-path mutation files"
  - "the [formula-recalc] and [audit] scope names preserved as queryable scope fields in deal/person write paths"
  - "the JSON-form assertion idiom for a console-spy test whose subject now emits one string"
affects:
  - "42-18's repo-wide no-console gate — three more files at zero"
  - "any operational query on '[formula-recalc]' or '[audit]' against deal/person logs: now \"scope\":\"formula-recalc\" / \"scope\":\"audit\""
tech-stack:
  added: []
  patterns:
    - "42-PATTERNS.md §5 shape (a) — prefixed console.error in a swallow-and-log catch"
    - "42-PATTERNS.md §5 shape (b) — unprefixed console.error, scope derived from the module path"
    - "one file mixes both shapes; the bracket decides per site, never per file"
key-files:
  created: []
  modified:
    - src/lib/mutations/deals.ts
    - src/lib/mutations/people.ts
    - src/lib/mutations/notes.ts
    - src/lib/mutations/people.test.ts
decisions:
  - "notes.ts:150's message string is kept BYTE-IDENTICAL rather than reworded to the plan's illustrative 'Create note produced no row' — its colon is mid-sentence prose, not a trailing separator before an interpolated value, so the message rule does not apply and rewording would have discarded the 'INSERT ... RETURNING' detail that makes the line diagnosable"
  - "the two multi-line people.ts calls stay wrapped at argument boundaries instead of collapsing to one line — collapsed they would be 114 and 107 characters against a file maximum of 115, i.e. at the ceiling; the plan explicitly permits argument-boundary wrapping"
  - "ctx is { err: error } and nothing else at all 25 error-carrying sites — the redaction rule is enforced by giving every site the same single-key ctx, so widening is visible as a diff anomaly rather than something a reader has to audit per line"
metrics:
  duration: "~14 min"
  completed: 2026-08-23
  tasks: 2
  commits: 2
  files_modified: 4
---

# Phase 42 Plan 08: Deal / Person / Note Mutation Log Migration Summary

All 26 `console.*` call sites in the three densest CRM write-path mutation files now emit structured
JSON, with the three harvested bracket scopes (`formula-recalc` ×5, `audit` ×2) surviving verbatim as
queryable `scope` fields and the 19 unprefixed sites taking a path-derived scope.

## What Was Built

**Task 1 — `deals.ts` + `people.ts`, 21 sites (commit `a52e931`).**
Eleven sites in `deals.ts` and ten in `people.ts`, each file mixing three scopes. The two four-line
`console.error` calls in `people.ts` were collapsed into three-argument `log.error` calls. The two
`toContain("[formula-recalc]")` assertions in `people.test.ts` now assert `'"scope":"formula-recalc"'`.

**Task 2 — `notes.ts`, 5 sites (commit `0474577`).**
One scope, `mutations/notes`. Four standard two-argument-console sites plus the message-only site at
`:150`.

## Site census — before and after, reconciled

The plan's `<site_inventory>` was verified site-by-site with `grep -n` before any edit rather than
trusted. **It was correct on all 26 — every line number, every bracket, every level.** No site
disagreed with the inventory.

| File | Sites | `console.error` | `console.warn/log/info` | Scopes |
|---|---|---|---|---|
| `src/lib/mutations/deals.ts` | 11 | 11 | 0 | 3 |
| `src/lib/mutations/people.ts` | 10 | 10 | 0 | 3 |
| `src/lib/mutations/notes.ts` | 5 | 5 | 0 | 1 |
| **total** | **26** | **26** | **0** | — |

All 26 were `console.error`, so all 26 became `log.error`. No `warn`/`info`/`debug` level appears in
these three files, before or after.

**Repo-wide non-test `console.*` count, by the plan's exact command:**

| | count |
|---|---|
| before (at base `4ea73f4`) | **246** |
| after | **220** |
| delta | **−26** |

Exactly the plan's 26, with no collateral. `git diff --name-only 4ea73f4 HEAD` returns exactly the
four files this plan owns — nothing else in the repo was touched, so the delta cannot have come from
anywhere but these three files.

## Observed scope sets, per file

`grep -oE 'log\.[a-z]+\("[a-z/-]+"' <file> | sort -u`:

| File | Observed set | Expected |
|---|---|---|
| `deals.ts` | `audit`, `formula-recalc`, `mutations/deals` | exactly those 3 ✓ |
| `people.ts` | `audit`, `formula-recalc`, `mutations/people` | exactly those 3 ✓ |
| `notes.ts` | `mutations/notes` | exactly that 1 ✓ |

**One caveat on that grep, worth knowing for later migration plans:** the regex requires the scope
literal on the same line as `log.<level>(`, so it does **not** see the two multi-line calls in
`people.ts` (`:86` and `:124`, where the scope sits on the following line). Their scope was verified
by reading the call. The set is still exactly the expected three because `people.ts:539` supplies
`formula-recalc` on one line, but on a file whose *only* prefixed sites were multi-line this gate
would report a missing scope and be wrong. It is a same-line gate, not a scope census.

Per-site scope distribution across all 26: `mutations/deals` 8, `mutations/people` 6,
`mutations/notes` 5, `formula-recalc` 5, `audit` 2.

## The `err` key gate

| File | `grep -c '{ err'` | sites | note |
|---|---|---|---|
| `deals.ts` | **11** | 11 | matches |
| `people.ts` | **10** | 10 | matches |
| `notes.ts` | **4** | 5 | 4 by design — `:150` carries no error |

Every one of the 25 error-carrying sites passes the caught error under `ctx.err` and carries **no
other ctx key whatsoever**. `Error` values therefore reach `log.ts`'s explicit `serialize` branch and
keep their `name`/`message`/`stack` and walked `cause` chain, rather than being pre-stringified into
a lossy string.

## The `notes.ts:150` special case — before and after, verbatim

Before:

```typescript
    if (!note) {
      console.error("Failed to create note: INSERT ... RETURNING produced no row")
      return { success: false, error: "Failed to create note" }
    }
```

After:

```typescript
    if (!note) {
      log.error("mutations/notes", "Failed to create note: INSERT ... RETURNING produced no row")
      return { success: false, error: "Failed to create note" }
    }
```

**Two arguments, no `ctx`, and the message string byte-identical.** The plan's action text suggested
`"Create note produced no row"`; I kept the original instead. The colon in this string is mid-sentence
prose introducing an explanation, not the trailing separator that the message rule strips before an
interpolated value — there was never a value after it. Rewording would have dropped
`INSERT ... RETURNING`, which is the only part of the line that tells an operator *which* invariant
broke (the comment immediately above it explains that `.returning()` is typed as a non-empty array but
is not one, and that this branch exists so the failure surfaces as handled rather than as an opaque
500). No error object was invented to fill the third slot.

## Redaction (T-42-04): explicitly checked, nothing widened

These are the CRM's write paths for **people** — the single most PII-dense entity in the schema
(`personSchema` validates `firstName`, `lastName`, `email`, `phone`, free-text `notes`) — plus deals
and note bodies, and arbitrary `customFields` blobs. This is exactly where the phase could have
created a data-leak regression, so I checked it per site rather than in aggregate.

**Result: at all 26 sites the migrated line carries strictly what the original printed.** The
mechanism is structural, not a judgement call: 25 sites have the identical ctx `{ err: error }`, where
`error` is byte-for-byte the same binding that was the original `console.error`'s second argument, and
the 26th has no ctx at all. There was no interpolated value at any of the 26 sites to move into ctx,
so there was no opportunity to widen and no `ctx` key was invented.

Concretely, the PII-bearing sites and what they now log:

- `mutations/people` "Failed to create person" / "Failed to update person" — the `input` object in
  scope holds `firstName`, `lastName`, `email`, `phone`, `notes` and `customFields`. **None of them
  enters the log line.** Message + `err` only. Same for the delete/restore/purge/reassign sites.
- `formula-recalc` "failed to load person field definitions for the formula-key strip" and "person
  recalculation failed; emitting the pre-recalc blob" — the `values` / `row.customFields` blobs are
  both in scope at these catches and both returned by them; **neither is logged**. The second one's
  message names the pre-recalc blob without carrying it, exactly as before.
- `mutations/notes` "Failed to create note" / "Failed to update note" — the validated `content` (up to
  `NOTE_CONTENT_MAX` = 200,000 characters of user free text) is in scope. **Not logged.** Nor is
  `authorId`.
- `audit` "failed to record deal restore" / "failed to record person restore" — the `auditLog.values()`
  object with its actor columns is the statement that just failed. **Not logged**; only `err`.
- No `entityId`, no `noteId`, no `userId`, no `ownerId` and no token appears in any of the 26 lines. No
  id was present in the original strings, so none was added.

The one genuine improvement, inherited from 42-01: user-controlled text that reaches a log line via
the error's own `message` is now newline-escaped by `JSON.stringify`, so a newline in a person's name
or a note body can no longer forge a second log record (T-42-05).

## Reserved-key collision check (wave 1's warning)

`ctx` keys land **flat** at the top level, so `level` / `scope` / `msg` / `ts` would silently overwrite
a base field. **This plan introduces exactly one ctx key across all 26 sites: `err`.** None of the four
reserved names is used. Verified mechanically:
`grep -nE '\{ (level|scope|msg|ts):' <the three files>` → no matches.

## Control flow (T-42-27): byte-for-byte equivalent

`git diff 4ea73f4 HEAD` is 37 insertions / 32 deletions across four files, and every hunk is either an
import line or a log call. Reviewed against the constraint:

- **Every swallow still swallows.** No `catch` was added, removed, merged or converted to a rethrow. The
  two nested-catch structures — `deals.ts` restore (inner `formula-recalc` catch inside the outer one,
  plus the deliberately-separate `[audit]` try that sits *outside* it) and the equivalent in
  `people.ts` restore — kept their exact nesting and their explanatory header comments untouched.
- **Every return shape is unchanged.** All eleven `{ success: false, error: "…" }` returns, the two
  `return fallback` / `return values` recoveries, `return (row.customFields ?? {})`, `return null` and
  `return { success: true }` are all present, in place, and identical.
- **No `revalidatePath`, `crmBus.emit`, transaction boundary, `db.insert`/`update`/`delete` call or Zod
  schema was touched.** Several of these sit adjacent to migrated lines; none appears in the diff.
- The header comments above the catches (D-05, T-34-17, T-35-06, T-35-10, the `noUncheckedIndexedAccess`
  note above `notes.ts:150`) are all unmodified — read before editing, changed in none.

The eight `src/lib/mutations` suites (314 tests) are the regression detector for this, and they pass
unchanged apart from the two assertions the plan named.

## Deviations from Plan

**None of substance. Two judgement calls, both recorded as decisions above:**

1. `notes.ts:150` keeps its original message string rather than the plan's illustrative rewording. The
   plan's binding acceptance criterion ("a two-argument call, or a three-argument call whose ctx
   contains only values present in the original string") is satisfied more conservatively this way.
2. The two multi-line `people.ts` calls stay wrapped rather than collapsing to a single line. The plan
   explicitly authorises this ("if the result exceeds the file's line length convention, wrap at the
   argument boundaries rather than mid-string"); collapsed they would be 114 and 107 characters against
   a file maximum of 115. There is no `max-len` ESLint rule and no Prettier config in this repo —
   checked, not assumed — so "convention" here means the observed distribution.

**No auto-fixes were needed.** No bug, no missing critical functionality and no blocker was found in
the four files. No architectural question arose.

## Premise verification (per the orchestrator's `<known_correction>`)

42-06 found the claim "no owned suite calls a `start*` function" to be false, so I grepped rather than
trusted this plan's equivalent claims:

- **"`people.test.ts` holds two `toContain("[formula-recalc]")` assertions at 607 and 677"** —
  verified, exactly two, exactly those lines. Both are in `it("still succeeds and still emits when
  recalculation rejects (D-05)")` blocks (one for create, one for update) whose real subject is *"the
  mutation still succeeds and still emits"*; the string assertion is a secondary check that the
  failure was reported at all. Changing it to the JSON form preserves that intent and actually
  tightens it, because `"scope":"formula-recalc"` can only appear if the logger ran, whereas
  `[formula-recalc]` was a prefix any adjacent line could have carried.
- **No other test in the repo asserts on any of the 26 strings.** Grepped all `*.test.ts(x)` for
  `Failed to create note|read note|update note|delete note|RETURNING produced no row`: two hits, both
  in `src/app/api/v1/notes/__tests__/route.test.ts` (348, 382), and both assert on the mutation's
  **returned `error` field**, not on a log line. Return shapes are unchanged, so both still pass.
- **The three other console spies that touch these code paths are argument-shape agnostic** —
  `src/lib/mutations/notes.test.ts:105`, `src/app/api/v1/notes/__tests__/route.test.ts:111` and
  `src/app/notes/actions.test.ts:133` are all silencing spies, and `actions.test.ts` asserts only
  `expect(consoleError).toHaveBeenCalled()` at 577/608/621. This is precisely the fallout reduction
  A3's "delegate to the matching `console` method" decision was chosen for: a `process.stdout.write`
  logger would have broken all four of these.

**No test file outside `src/lib/mutations/people.test.ts` was edited, and none reddened.** Nothing to
report to a sibling plan on that front.

## Verification — exact numbers

| Check | Result | Baseline |
|---|---|---|
| `npx vitest run src/lib/mutations` | **314 passed / 0 failed** (8 files) | — |
| `npm test` (unit project) | **4514 passed / 32 skipped / 0 failed**, 162 files passed / 2 skipped | 4514 / 32 ✓ |
| `npm test` (rsc project) | **8 passed / 0 failed** | 8/8 ✓ |
| `npx tsc --noEmit` | **0 errors** | 0 ✓ |
| `npm run lint` | **0 errors / 122 warnings** | 0 errors / 124 warnings |
| `npx eslint` on the 4 changed files | **0 errors / 0 warnings** | — |
| non-test `console.*`, repo-wide | 246 → **220** (−26) | −26 expected ✓ |
| `grep -c 'console\.'` in the three source files | **0 / 0 / 0** | — |

Suite and typecheck land exactly on the handoff baseline of 4514 / 32 + RSC 8/8 + 0 — this plan adds no
test and removes none, so an exact match is the correct outcome and any drift would have been a signal.

**On lint warnings: 122 here versus the brief's 124, and this plan is not the cause.** 42-06 hit the
same 122 and diagnosed it: `npx eslint` on all four of my changed files reports **zero** warnings, so
there were none in these files for this plan to remove, and the four files I touched are the only files
that differ from the base. The remaining 122 are all `no-unused-vars` in files I never opened. 42-06's
explanation — a worktree receives only tracked files, so gitignored files that the main checkout lints
are absent here — still fits and is still worth one glance from whoever runs the next full-repo lint on
the main checkout. Not worth blocking on, and now observed twice from two independent worktrees, which
makes "measurement environment" substantially more likely than "two plans each silently removed two
warnings."

## Notes for later plans

- **Any runbook, comment or dashboard query naming `[formula-recalc]` or `[audit]` in a *deal* or
  *person* context is now stale**, in the same way 42-06 invalidated `instrumentation.ts:40`. The new
  strings are `"scope":"formula-recalc"` and `"scope":"audit"`. Both names also appear in files this
  plan does not own — sibling 42-09's `organizations.ts` / `activities.ts` carry the same two scopes,
  and `organizations.test.ts` holds two assertions equivalent to the ones I updated. I did not touch
  any of them.
- **`grep -oE 'log\.[a-z]+\("[a-z/-]+"'` is a same-line gate, not a scope census.** It silently misses
  multi-line calls. 42-18 should derive its scope inventory from something that spans lines, or a file
  whose only prefixed site is multi-line will read as having lost its scope.
- **`{ err: error }` and nothing else is now the established shape for a swallow-and-log catch in
  `src/lib/mutations`.** 33 sites from 42-06 and 26 here agree on it. A later plan adding a second ctx
  key to a catch in this directory should say why.
- The `mutations/<entity>` path-derived scopes (`mutations/deals`, `mutations/people`,
  `mutations/notes`) now exist alongside whatever 42-09 lands for organizations, activities and dedup.
  Together they make "all CRM write-path failures" a `scope` prefix query.

## Known Stubs

None. No placeholder value, no unwired data path, no TODO and no hardcoded empty was introduced.

## Threat Flags

None. No new network endpoint, no auth path, no file access pattern and no schema change. The diff is
26 log calls and three import lines.

## Self-Check: PASSED

Files claimed as modified — all 4 exist and are committed:

- `src/lib/mutations/deals.ts` — FOUND
- `src/lib/mutations/people.ts` — FOUND
- `src/lib/mutations/notes.ts` — FOUND
- `src/lib/mutations/people.test.ts` — FOUND

Commits claimed — both present in `git log`: `a52e931`, `0474577`.

`git diff --name-only 4ea73f4 HEAD` returns exactly those four paths — no write to `STATE.md`,
`ROADMAP.md`, `REQUIREMENTS.md`, any sibling plan's file (`organizations.ts`, `activities.ts`,
`dedup.ts`), or any barrel/index file in `src/lib/mutations/`. Neither commit deletes a tracked file
(`git diff --diff-filter=D` empty for both). `git status --short` is clean.
