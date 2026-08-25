---
phase: 42-observability
plan: 12
subsystem: dedup
tags: [structured-logging, OBS-01, migration, A7, liveness-gate, dedup]
requires:
  - "src/lib/log.ts (42-01)"
provides:
  - "28 structured log call sites across the eight src/lib/dedup modules, eight scopes preserved verbatim"
  - "the repaired A7 liveness gate for cleanupStaleDedupScans: grep -F '\"scope\":\"dedup-scan-cleanup\"'"
  - "the tighter startup-line-only form: grep -F '\"scope\":\"dedup-scan-cleanup\",\"msg\":\"Starting\"'"
  - "nine bracket-string test assertions rewritten onto the JSON scope field"
  - "two frozen test clocks that stop the T-39-10 absence detectors flaking on a digit in the new ts field"
affects:
  - "42-17 — owns the third A7 site (instrumentation.ts:40); this plan did NOT touch it"
  - "42-18's no-console gate — eight more files at zero, eight orphan prefix constants gone"
  - "42-18's container check — must use the gate string quoted verbatim below, not the old bracket form"
  - "any runbook or operator note grepping the bracketed dedup prefixes; all eight are gone from the source"
tech-stack:
  added: []
  patterns:
    - "42-PATTERNS.md §5 shape (a) — prefixed console.error in a swallow-and-log catch"
    - "42-PATTERNS.md §5 shape (e) — the concatenated multi-line template becomes three named count keys"
    - "42-PATTERNS.md §5 shape (f) — the A7 log-grep gates, which are prose and invisible to no-console"
key-files:
  created:
    - .planning/phases/42-observability/42-12-SUMMARY.md
  modified:
    - src/lib/dedup/scan-state.ts
    - src/lib/dedup/scan-engine.ts
    - src/lib/dedup/scan-cleanup.ts
    - src/lib/dedup/identity-settings.ts
    - src/lib/dedup/queries.ts
    - src/lib/dedup/matching.ts
    - src/lib/dedup/import-flags.ts
    - src/lib/dedup/identity-inputs.ts
    - src/lib/dedup/scan-cleanup.test.ts
    - src/lib/dedup/scan-engine.test.ts
    - src/lib/dedup/queries.test.ts
    - src/lib/dedup/import-flags.test.ts
    - src/lib/dedup/identity-inputs.test.ts
    - src/lib/dedup/identity-settings.test.ts
decisions:
  - "the primary A7 gate greps the scope field alone, as specified, but both repaired comments also name the contiguous 'scope+msg' form — log.ts fixes key order, so pinning the STARTUP line specifically (which is what the old gate did, and what the try/catch-position test protects) costs nothing"
  - "import-flags.ts keeps its deliberate narrowing to error.message rather than passing the whole Error under ctx.err: log.ts serialises name/message/stack, so passing the Error would have ADDED a stack trace that line never carried, violating 'never add a value that was not already in the string'"
  - "two suites gained a frozen clock (no assertion changed) because the new ts field is the only run-varying digit source in a JSON log line, and a real ISO timestamp contains '1.5' about 1 run in 100 and '111' about 1 in 1000 — the two T-39-10 absence detectors would have become flaky"
  - "the plan's 'exactly one modified line inside the comment block' criterion is deliberately not met: three lines changed, because two of the sentences were already false before this plan started"
metrics:
  duration: "~52 min"
  completed: 2026-08-23
  tasks: 3 planned + 1 deviation task
  commits: 4
  files_modified: 14
---

# Phase 42 Plan 12: The Eight Dedup Modules and the A7 Gate Repair Summary

All 28 `console.*` sites in `src/lib/dedup` now emit structured JSON under their own harvested
scopes, all eight orphaned prefix constants are gone (PATTERNS said one), and the one-shot reaper's
only liveness check — a log grep, because it is deliberately excluded from `/api/health` — names a
string that exists after this phase instead of one this phase deleted.

## Commits

| # | Hash | What |
|---|---|---|
| 1 | `9e972d3` | `scan-state.ts` (7) + `scan-engine.ts` (6), two `LOG` consts deleted, 1 assertion |
| 2 | `ea2d96f` | `scan-cleanup.ts` (3) + the A7 repair at both owned sites, 3 assertions |
| 3 | `9ead4ca` | the five remaining modules (12), five `LOG_PREFIX` consts deleted, 5 assertions |
| 4 | `c9a6d0a` | deviation: the two stale `Dockerfile:24` citations `deferred-items.md` assigns to this plan |

## The A7 repair — both owned sites, quoted verbatim

**`src/lib/dedup/scan-cleanup.ts`, inside the 19-line rationale comment:**

```
 * `rtk proxy docker compose logs app | grep -F '"scope":"dedup-scan-cleanup"'`, exactly as the
 * trash pruner's own startup line is gated on `"scope":"trash-prune"`. (Phase 42 turned both of
 * those bracketed prefixes into a `scope` field, so the two strings this paragraph used to name no
 * longer exist anywhere. `log.ts` emits `level`, `scope`, `msg`, `ts` in that fixed order, so the
 * startup line alone is the one contiguous
 * `grep -F '"scope":"dedup-scan-cleanup","msg":"Starting"'`.)
```

**`src/lib/dedup/scan-cleanup.test.ts`, header:**

```
 *   docker compose up -d --build app
 *   rtk proxy docker compose logs app --tail 300 | grep -F '"scope":"dedup-scan-cleanup"'
```

**For plan 42-18, the two strings to use, verbatim:**

- liveness of the reaper at all: `grep -F '"scope":"dedup-scan-cleanup"'`
- the startup line specifically (equivalent to the old gate): `grep -F '"scope":"dedup-scan-cleanup","msg":"Starting"'`

The second is contiguous because `log.ts:97` builds `{ level, scope, msg, ts }` in that fixed order
before spreading `ctx`, and `msg` is `"Starting"` with no `ctx` at that site. `rtk proxy` is still
required — plain `docker compose logs` is intercepted by the RTK hook, which digests output and
hides startup lines. That note was kept in both files.

### The already-false cross-reference, fixed as instructed

`scan-cleanup.ts:32` read *"…exactly as `[trash-prune] Starting` is gated."* That was **already
false before this plan touched anything**: plan 42-06 migrated `src/lib/trash/prune.ts` earlier in
this wave, and its startup line is now `log.info("trash-prune", "Starting", {...})` at
`prune.ts:125`. Verified by reading that file, not assumed. The clause now points at
`"scope":"trash-prune"`, i.e. the string that actually exists.

### Three lines changed inside the comment block, not one

The plan's criterion asked for exactly one modified line inside the rationale comment. It is three,
and each extra one was a false statement rather than a tidy-up:

| Line | Was | Why it had to change |
|---|---|---|
| 29 | "a fixed-**prefix** startup line" | there is no prefix any more; the fixed thing is the scope field. Now "fixed-scope" |
| 31 | the bracket grep | A7, the point of the plan |
| 32 | the `[trash-prune] Starting` cross-reference | already false — see above |

Everything else in the block is byte-identical: the argument for unconditional logging, the
2026-08-08 incident, the "startup line is OUTSIDE the try/catch on purpose" paragraph, the "logs
carry counts only, never row contents (T-37-09)" line, and the "do not tidy this back into the
analog's conditional form" instruction. The instruction was respected literally — the logging call
was not restructured, only the grep string it advertises changed.

### The startup line's position, as required

`src/lib/dedup/scan-cleanup.ts` after the change:

- `log.info("dedup-scan-cleanup", "Starting")` — **line 56**
- `try {` — **line 58**

The startup line is still outside and before the `try`, unconditional, with the paragraph explaining
why immediately above it. T-42-37 holds.

## The eight deleted prefix constants — PATTERNS said one, it was eight

| File | Constant | Value it held |
|---|---|---|
| `scan-state.ts` | `LOG` | `[dedup-scan-state]` |
| `scan-engine.ts` | `LOG` | `[dedup-scan]` |
| `scan-cleanup.ts` | `LOG` | `[dedup-scan-cleanup]` |
| `identity-settings.ts` | `LOG_PREFIX` | `[dedup-settings]` |
| `queries.ts` | `LOG_PREFIX` | `[dedup-queries]` |
| `matching.ts` | `LOG_PREFIX` | `[dedup-matching]` |
| `import-flags.ts` | `LOG_PREFIX` | `[dedup-import-flags]` |
| `identity-inputs.ts` | `LOG_PREFIX` | `[dedup-identity-inputs]` |

`grep -rn 'const LOG_PREFIX\|const LOG ' src/lib/dedup/ --include=*.ts` → **0**. No constant had any
use besides its own log calls (grepped each before deleting). `npx eslint src/lib/dedup` → 0 errors,
0 warnings, which is what would have caught a survivor via `no-unused-vars` (T-42-38 closed).

`grep -rn '\[dedup-' src/lib/dedup/ --include=*.ts` → **0**, tests included. Two extra hits turned up
there that the plan did not list: `import-flags.ts:57` and `matching.ts:40`, both module-header
prose claiming "a rejection logs `[dedup-import-flags]` / `[dedup-matching]`". Both are the same
class of defect as A7 — a comment naming a string the migration deletes — so both now say "logs
under scope `…`". This is also the trap 42-06 hit: an acceptance grep that returns 0 only if your
own prose stops quoting the literal.

## Site census — 28, reconciling on two independent rulers

Per-file, from the eslint `no-console` census (not grep — see below):

| File | before | after | `log.*` sites after |
|---|---|---|---|
| `scan-state.ts` | 7 | 0 | 7 |
| `scan-engine.ts` | 6 | 0 | 6 |
| `identity-settings.ts` | 5 | 0 | 5 |
| `scan-cleanup.ts` | 3 | 0 | 3 |
| `queries.ts` | 3 | 0 | 3 |
| `matching.ts` | 2 | 0 | 2 |
| `import-flags.ts` | 1 | 0 | 1 |
| `identity-inputs.ts` | 1 | 0 | 1 |
| **total** | **28** | **0** | **28** |

Repo-wide, non-test:

| Ruler | Before | After | Delta |
|---|---|---|---|
| `eslint --rule '{"no-console":"error"}'` over `src/**/*.{ts,tsx}`, test paths filtered | **191** in 82 files | **163** in 74 files | **−28**, −8 files |
| the plan's `grep -rnE '(^\|[^a-zA-Z0-9_.])console\.(log\|error\|warn\|info\|debug)\('` | 193 | 165 | **−28** |

Both rulers agree on the delta; they disagree by 2 on the absolute (grep counts the four
`console.*` delegations inside `log.ts` differently than eslint reports them). The eslint figure is
the one to carry forward — 191 → **163** — because that is the tool 42-18's gate uses.

`src/lib/dedup/` now contributes **zero** sites; confirmed by name in the after-census.

## Level map — a warn stayed a warn

`grep -c 'log\.warn(' src/lib/dedup/identity-settings.ts` → **2**. Both `console.warn` calls
(the invalid identity-fields row, the out-of-bounds threshold) are `log.warn`, neither silently
promoted to `error`. Across the eight modules: **18 `log.error`, 8 `log.info`, 2 `log.warn`** —
matching the 18 `console.error`, 8 `console.log` and 2 `console.warn` that were there before, level
for level (`log.error` per file: 5 / 2 / 1 / 3 / 3 / 2 / 1 / 1; `log.info`: `scan-state.ts` 2,
`scan-engine.ts` 4, `scan-cleanup.ts` 2).

## `ctx` keys introduced, per file — and the reserved-name check

Wave 1's warning: `ctx` keys land FLAT at the top level, so a key named `level`, `scope`, `msg` or
`ts` silently overwrites a base field.

| File | ctx keys introduced | count |
|---|---|---|
| `scan-state.ts` | `scanId`, `entityType`, `err` | 3 |
| `scan-engine.ts` | `entityType`, `scanId`, `rowCount`, `groupCount`, `outcome`, `pairCount`, `err` | 7 |
| `scan-cleanup.ts` | `strandedMarkedError`, `idleDeleted`, `expiredDeleted`, `err` | 4 |
| `identity-settings.ts` | `key`, `maxEntries`, `min`, `max`, `fallback`, `err` | 6 |
| `queries.ts` | `entityType`, `page`, `dismissed`, `pairId`, `err` | 5 |
| `matching.ts` | `err` | 1 |
| `import-flags.ts` | `entityType`, `err` | 2 |
| `identity-inputs.ts` | `err` | 1 |

18 distinct keys across the plan: `dismissed`, `entityType`, `err`, `expiredDeleted`, `fallback`,
`groupCount`, `idleDeleted`, `key`, `max`, `maxEntries`, `min`, `outcome`, `page`, `pairCount`,
`pairId`, `rowCount`, `scanId`, `strandedMarkedError`.

**No `level`, `scope`, `msg` or `ts` key anywhere in the diff.** Checked twice: by a brace-matching
parse of every `log.*(...)` call in the eight files, and by
`grep -rn 'level:\|scope:\|msg:\| ts:' src/lib/dedup/*.ts` (one hit, the word "level" in a
`scoring.ts` sentence, not a key).

## Redaction (T-42-04, T-42-35) — confirmed per module, not assumed

The rule is that nothing may enter a log line that was not already in the string being replaced.
This directory is the phase's highest-exposure surface: `matching.ts` and `identity-inputs.ts`
exist to compare names, e-mails and phone numbers, and `queries.ts` holds two full candidate rows.

| Module | What was in scope at the call site | What the line carries | New values added |
|---|---|---|---|
| `scan-state.ts` | the whole `dedupScans` row, `progress` JSONB, `userId` | `scanId`, `entityType`, `err` | none |
| `scan-engine.ts` | row counts, group stats, both tier statements | `entityType`, `scanId`, counts, `outcome`, `err` | none |
| `scan-cleanup.ts` | three arrays of returned row ids | three **counts** only (`.length`) | none — ids never logged |
| `identity-settings.ts` | `row.value`, the admin-supplied stored setting | the KEY, the product's own bounds, the default | none |
| `queries.ts` | `recordA` / `recordB` full rows, names, notes | `entityType`, `page`, `dismissed`, `pairId`, `err` | none |
| `matching.ts` | candidate PAIRS, `distinguishingValue`, normalized names, e-mails | `err` and nothing else | none |
| `import-flags.ts` | `customFields` blobs, `normName`, batch rows | `entityType` + the driver's message | none |
| `identity-inputs.ts` | configured labels, field definitions | `err` only | none |

**Not one candidate record, match key, name, e-mail, phone number, custom-field value or row id
entered a log line that did not already contain it.** The two obvious temptations — logging the
candidate pair in `matching.ts` and the match key in `identity-inputs.ts` — were not taken; both
sites carry `{ err: error }` and nothing else.

`scan-cleanup.ts`'s "Done" line is the sharpest case: `staleRunning`, `staleIdle` and `old` are
arrays of returned **ids**, and only `.length` of each is logged, exactly as the original string did.

### The one place the migration could silently have widened a line, and did not

`import-flags.ts:367` passed `error instanceof Error ? error.message : error` on purpose — its own
comment says *"`error` is the driver's own message and carries no row contents."* Passing the whole
`Error` under `ctx.err` would have been the idiomatic migration and would have **added a stack
trace** to a line that deliberately carried only a message. The narrowing is preserved, and the
comment now says so in as many words so a later reader does not "fix" it.

### The T-42-35 secret-absence assertions, quoted, still passing, and proven to have teeth

`src/lib/dedup/identity-settings.test.ts`:

```javascript
    expect(lines[0]).not.toContain(FIELD_A)      // :188  — FIELD_A = "Tax ID", the stored value
    expect(lines[0]).not.toContain("1.5")        // :329  — the out-of-range stored threshold
```

`src/lib/dedup/import-flags.test.ts` (Test 5c, not named in the plan but the same detector):

```javascript
    expect(logged).not.toContain("acme")         // :351  — a record's normalized name
    expect(logged).not.toContain("111")          // :352  — a custom-field value
```

All four are **byte-unchanged** and all four pass. Their positive counterparts also pass unchanged:
`expect(lines[0]).toContain(ORG_IDENTITY_FIELDS_KEY)` at `:185` and `:207` (the key reaches the line
via `ctx.key`), and `toContain(String(SIMILARITY_MIN))` / `toContain(String(SIMILARITY_MAX))` at
`:327`/`:328` (the bounds reach it via `ctx.min` / `ctx.max` as `"min":0.1,"max":1`).

One caveat worth recording rather than silently inheriting: `toContain(String(SIMILARITY_MAX))` is
`toContain("1")`, which a JSON line satisfies trivially via the timestamp. It was near-vacuous
before this plan too (the old string contained `[0.1, 1]`, and `"1"` is inside `"0.1"`), so this is
not a regression — but it is not a real check either, and `:327` on `"0.1"` is the one carrying the
weight.

**Proven non-vacuous by mutation.** I temporarily added `storedValue: row.value` to the threshold
warn's `ctx` and re-ran the suite:

```
1. readSimilarityThreshold falls back and warns above SIMILARITY_MAX
   AssertionError: expected '{"level":"warn","scope":"dedup-settin…' not to contain '1.5'
```

The detector caught the injected leak on the first run. The mutation was reverted and the file
re-verified at 0 occurrences of `storedValue`. This is the T-42-35 mitigation demonstrated rather
than asserted.

## Deviations from Plan

### 1. [Rule 2 — missing correctness guard] Two suites gained a frozen clock so the absence detectors cannot flake

**Found during:** Task 3, while reasoning about what the four `not.toContain` assertions above now
run against.

**Issue:** every migrated line now carries a `ts` field, and an ISO timestamp is the **only
run-varying digit source in a JSON log line**. `…:51.512Z` contains the substring `"1.5"`; that
happens whenever the seconds end in 1 and the milliseconds start with 5, i.e. about **1 run in 100**.
`…:07.111Z` contains `"111"` about **1 run in 1000**. So `not.toContain("1.5")` and
`not.toContain("111")` were about to become flaky — and a security regression detector that flakes
is a detector somebody eventually deletes.

**Fix:** `vi.useFakeTimers()` + `vi.setSystemTime(new Date("2026-08-19T12:00:00.000Z"))` in the
`beforeEach` of `identity-settings.test.ts` and `import-flags.test.ts`, with `vi.useRealTimers()` in
`afterEach` and a comment in each explaining what it is protecting. **No assertion was touched** —
the plan and the threat register both require those four to stay byte-identical, and they did. The
pinned instant contains neither `"1.5"` nor `"111"`.

**Files:** `src/lib/dedup/identity-settings.test.ts`, `src/lib/dedup/import-flags.test.ts`.
**Commit:** `9ead4ca`.

**This generalises past this plan, and 42-18 should treat it as a phase-wide check:** any assertion
anywhere in the repo of the form "this value must NOT appear in the log output" is now running
against a line that contains a fresh timestamp. Every such assertion whose needle is a short digit
string is a latent flake. A grep for `not.toContain(` near a `console` spy would find the rest.

### 2. [Rule 1 — comment states something false] The two stale `Dockerfile:24` citations in my files

**Found during:** the post-task sweep, cross-checking `deferred-items.md`, which names this plan
explicitly: *"Who should fix: … the A7 repair plan for the `scan-cleanup`/`prune` pair."*

**Issue:** `scan-cleanup.ts:25` and `scan-cleanup.test.ts:9` both said the standalone copy is a step
"ending in `2>/dev/null || true`, so a build whose chunk layout changes fails silently".
`deferred-items.md` classes these as "stale line number only", but the `|| true` sentence is
**substantively false** too: plan 42-03 replaced the suppression with a postcondition that exits 1,
now at `Dockerfile:35-38` (read and confirmed).

**Fix:** both now cite `Dockerfile:35-38`, describe the suppression in the past tense, and state the
consequence — a build-time assertion shows the file exists, it does **not** show that `register()`
executed it, and this reaper is excluded from `/api/health` by design, so the log line is still its
only runtime evidence. The A7 argument is therefore corrected without being weakened, which is what
the deferred item asked for.

**Files:** `src/lib/dedup/scan-cleanup.ts`, `src/lib/dedup/scan-cleanup.test.ts`.
**Commit:** `c9a6d0a`.

**Still deferred, deliberately:** `src/lib/trash/prune.ts:14` and `src/lib/trash/prune.test.ts:132`
— the two genuinely FALSE ones from the same table. They are outside this plan's file ownership and
a parallel worktree editing them would collide. `instrumentation.ts:36` likewise belongs to 42-17.

### 3. [scope correction] Two module headers quoted a bracketed prefix the plan did not list

`import-flags.ts:57` and `matching.ts:40`. Covered above; folded into commit `9ead4ca` because the
plan's own acceptance grep (`'\[dedup-'` → 0 across the directory) cannot pass while they exist.

### 4. [criterion not met, on purpose] "exactly one modified line inside that comment block"

Three, for the reasons tabulated above. Two of the three were false statements before I started.

No other deviations. No Rule 4 architectural question arose. No auth gates. No blockers.

## The known-defect check the orchestrator asked for: which sites the scope grep cannot see

`grep -oE 'log\.[a-z]+\("[a-z-]+"' <file>` is a **same-line** matcher, so it is blind to any call
whose scope sits on the following line. Measured per file:

| File | `log.*` call sites | seen by the grep | invisible |
|---|---|---|---|
| `scan-state.ts` | 7 | 7 | — |
| `scan-engine.ts` | 6 | 5 | **1** — the "no identity field configured" `log.info` |
| `scan-cleanup.ts` | 3 | 3 | — |
| `identity-settings.ts` | 5 | 3 | **2** — both `log.warn` calls, at `:120` and `:231` |
| `queries.ts` | 3 | 3 | — |
| `matching.ts` | 2 | 2 | — |
| `import-flags.ts` | 1 | 1 | — |
| `identity-inputs.ts` | 1 | 1 | — |

**Three of 28 sites are invisible to that gate** — and the two invisible ones in
`identity-settings.ts` are precisely the file's two `log.warn` calls, i.e. the T-42-35 sites. Had I
relied on the grep alone the scope set for that file would have looked like a clean
`{dedup-settings}` while proving nothing about the two lines that matter most. All three were
verified by reading the diff: `"dedup-scan"`, `"dedup-settings"`, `"dedup-settings"`. A gate that
actually holds needs a multi-line matcher; the honest same-line result is above.

Also verified rather than trusted, per the 42-06 warning about false premises: the plan claimed six
owned test files hold the only breaking assertions.
`grep -rn 'dedup-scan\|dedup-queries\|dedup-matching\|dedup-import-flags\|dedup-identity-inputs\|dedup-settings'`
across all of `src/`, `instrumentation.ts` and `e2e/` returns **no assertion outside
`src/lib/dedup/`** (the three other hits are `dedup-scans` schema imports). The premise held. No
unowned test file reddened at any point.

## Verification — exact numbers

| Gate | Result |
|---|---|
| `npm test` | **4524 passed / 32 skipped / 0 failed** (162 files passed, 2 skipped) |
| `npm test` — RSC project | **8 passed / 0 failed** (2 files) |
| `npx tsc --noEmit` | **0 errors** (exit 0) |
| `npx eslint 'src/**/*.{ts,tsx}' instrumentation.ts` | **0 errors** / 122 warnings |
| `npx eslint src/lib/dedup` | **0 errors / 0 warnings** |
| `npx vitest run src/lib/dedup` | **252 passed / 0 failed** (252 before the plan too) |
| non-test `console.*`, eslint ruler | 191 → **163** (−28) |
| `console.` in dedup non-test sources | **0** in all 15 files |
| `[dedup-` anywhere under `src/lib/dedup`, tests included | **0** |
| `const LOG` / `const LOG_PREFIX` under `src/lib/dedup` | **0** |
| `log.warn(` in `identity-settings.ts` | **2** |

Baseline preserved exactly: 4524 / 32 and RSC 8/8 are the numbers the orchestrator supplied, and
lint errors stayed at 0. The lint **warning** count here is 122, which is the worktree figure (the
main checkout reads 124 for reasons unrelated to this phase); no warning was added or removed by
this plan — `src/lib/dedup` is at 0 warnings on both sides of the change.

Files this plan was forbidden to touch, confirmed absent from `git diff 66f17f7 HEAD --stat`:
**`src/lib/mutations/dedup.ts`** (migrated by 42-09) and **`instrumentation.ts`** (A7 site 1, owned
by 42-17).

## What the log lines actually look like now

Captured from real `npm test` stdout, which also confirms the one live string the orchestrator
flagged (`[dedup-import-flags] flagged-import count failed for entityType=…`) is now structured:

```json
{"level":"error","scope":"dedup-import-flags","msg":"flagged-import count failed; reporting 0","ts":"2026-08-23T20:54:11.380Z","entityType":"person","err":"__vite_ssr_import_1__.db.select is not a function"}
{"level":"error","scope":"dedup-scan-state","msg":"failed to read the latest scan","ts":"2026-08-23T20:54:48.650Z","entityType":"organization","err":{"name":"Error","message":"connection terminated","stack":"Error: connection terminated\n    at …"}}
```

The second line is the A3 payoff visible in practice: the stack survived, where a naive
`JSON.stringify(err)` would have emitted `{}`. The first shows the deliberate `.message` narrowing
in `import-flags.ts` — a string, not an object, and therefore no stack.

## Known Stubs

None. Every migrated site is wired to the real logger; nothing is placeholdered or awaiting a later
plan.

## Threat Flags

None. This plan added no network endpoint, no auth path, no file access and no schema change. It
removed one class of surface (bracketed prefixes in prose) and narrowed nothing else.

## Notes for the next plans

- **42-17** owns the third A7 site, `instrumentation.ts:40`. Untouched here. Per PATTERNS §5 shape
  (f) it should point at `/api/health` rather than at a log grep, because the six processors now
  have a real detector — but the two one-shot cleanups still do not, so if that comment mentions
  them it needs the scope-field grep above, not `/api/health`.
- **42-18** should use `grep -F '"scope":"dedup-scan-cleanup","msg":"Starting"'` for the container
  check. The scope-only form also works and is what both comments advertise as the primary gate.
- **42-18**, second item: the `ts`-collision flake class described in deviation 1 is phase-wide, not
  local to these two files.
- The `grep -oE 'log\.[a-z]+\("…"'` scope gate is now confirmed vacuous-capable by a third
  independent executor (42-08, 42-09, and this plan). It missed 3 of 28 sites here, including both
  T-42-35 warns. It should not be the only scope gate in 42-18.

## Self-Check: PASSED

- All 14 modified files exist on disk and are committed; `git status` is clean.
- All four commit hashes resolve: `9e972d3`, `ea2d96f`, `9ead4ca`, `c9a6d0a`.
- `.planning/phases/42-observability/42-12-SUMMARY.md` exists (25 KB).
- Every number in the Verification table was read from a command run after the last code commit,
  not carried forward from an earlier run.
- One error caught by this self-check and corrected in place: the level-map paragraph first claimed
  "22 `log.error` / 4 `log.info`". The measured split is **18 / 8 / 2**, which is what the file now
  says. The 28 total and the per-file census were unaffected.
- Second correction: the `ctx` key list said "16 distinct keys" while enumerating 18. Now 18.
</content>
</invoke>
