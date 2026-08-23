---
phase: 42-observability
plan: 07
subsystem: observability
tags: [heartbeat, structured-logging, event-subscribers, OBS-01, OBS-03]
requires:
  - "src/lib/log.ts (42-01)"
  - "src/lib/observability/heartbeat.ts (42-02)"
provides:
  - "all four crmBus subscribers registered in the heartbeat registry with their roster names"
  - "recordTick at handler ENTRY in all four subscribers, above every early return"
  - "3 structured log call sites replacing the three subscriber console.error calls"
  - "behavioural proof of registration + always-alive + tick-advances for three of the four"
affects:
  - "GET /api/health (42-05) — the remaining four of its ten roster entries now have a live writer; all ten are wired"
  - "42-18's container check — the subscriber half of the write side it will verify end-to-end"
tech-stack:
  added: []
  patterns:
    - "42-PATTERNS.md §5 shape (e) — prefix-as-whole-message inside a mandatory .catch"
    - "subscriber alive derives from registration, never from lastTickAt"
    - "recordTick at handler entry (subscribers), unlike processors' tick-tail placement"
key-files:
  created: []
  modified:
    - src/lib/events/subscribers/audit.ts
    - src/lib/events/subscribers/stage-history.ts
    - src/lib/events/subscribers/webhook.ts
    - src/lib/events/subscribers/workflow-trigger.ts
    - src/lib/events/subscribers/audit.test.ts
    - src/lib/events/subscribers/stage-history.test.ts
    - src/lib/events/subscribers/webhook.test.ts
decisions:
  - "registerSubscriber sits INSIDE the `let registered` guard and BEFORE crmBus.on, so a repeat call is a no-op here too and the registry records the attempt even if attaching listeners were to throw"
  - "recordTick sits at handler ENTRY for subscribers — the mirror image of the processors' tick-tail placement in 42-06 — because a handler that returned early still FIRED, and telling quiet-but-attached apart from detached is the entire purpose of the field"
  - "added a tick-advances assertion to stage-history and webhook beyond the plan's two, turning their recordTick wiring from a source gate into a behaviour proof; only workflow-trigger remains gate-only"
  - "the two migrated assertions parse the JSON line and check err.message AND a non-empty err.stack, so they double as a regression detector for log.ts's explicit Error branch"
  - "reworded three of my own comments to avoid the literal string `.catch(log.error)`, because the plan's acceptance grep for that string counts comments too"
metrics:
  duration: "~14 min"
  completed: 2026-08-23
  tasks: 2
  commits: 2
  files_modified: 7
---

# Phase 42 Plan 07: Subscriber Heartbeat Wiring and Log Migration Summary

All four `crmBus` event subscribers now register themselves in the `globalThis` heartbeat registry
under their exact roster names and record a tick at handler entry — including on the audit
subscriber's empty-change-set early return — and their three `console.error` calls emit structured
JSON with the `.catch` handlers still attached and still swallowing.

**With this plan, all ten `EXPECTED_WORKERS` entries have a live writer.** 42-06 wired the six
processors; these are the four subscribers.

## What Was Built

**Task 1 — registration and ticking (commit `9a307a4`), TDD.**
Four `registerSubscriber` calls, four `recordTick` calls, four comments pinning the `let registered`
flags as unreadable from the route, and 10 new behavioural assertions.

**Task 2 — the three log-call migrations (commit `b08fa3b`).**
`audit.ts`, `stage-history.ts` and `workflow-trigger.ts`, plus the two argument-shape assertions the
migration invalidates by design.

## RED → GREEN (Task 1)

New assertions written first, source untouched:

```
Test Files  3 failed (3)
     Tests  10 failed | 24 passed (34)
```

All 10 failures are the new assertions, breaking down as 4 audit + 3 stage-history + 3 webhook. The
failure message is the right one — `expected { alive: false, lastTickAt: null } to deeply equal
{ alive: true, lastTickAt: null }` — i.e. `snapshot()` was correctly reporting the subscriber
present-and-dead, not absent. Post-edit: **34 passed / 0 failed.**

Nothing passed unexpectedly during RED, so there was no fail-fast condition to investigate.

## The four `registerSubscriber` calls, verbatim

```
src/lib/events/subscribers/webhook.ts:24:          registerSubscriber("webhook-subscriber")
src/lib/events/subscribers/workflow-trigger.ts:30: registerSubscriber("workflow-trigger-subscriber")
src/lib/events/subscribers/stage-history.ts:22:    registerSubscriber("stage-history-subscriber")
src/lib/events/subscribers/audit.ts:57:            registerSubscriber("audit-subscriber")
```

Grepped against `EXPECTED_WORKERS` rather than checked by eye: all four names match a roster entry
exactly. `grep -c 'registerSubscriber('` returns **1** for each of the four files, and
`grep -c 'recordTick('` returns **1** for each.

All four are called from `instrumentation.ts:15-25` (verified, not assumed), so the registry now has
a real writer for every one of the ten roster entries.

## `recordTick` precedes the early return — the two `audit.ts` line numbers

| What | `audit.ts` line |
|---|---|
| `recordTick("audit-subscriber")` | **65** |
| `if (payload.action === "updated" && Object.keys(changes).length === 0) return` | **82** |

65 < 82, and this is pinned by test rather than only by comment: *"advances lastTickAt on a no-op
update that writes no row at all"* asserts both `mockDb.insert` was never called AND
`lastTickAt` is non-null. Move the call below line 82 and that test fails.

**This is the mirror image of 42-06's processor placement, deliberately.** A processor's `recordTick`
sits at the tick TAIL, outside the `try`, because liveness there means "the tick body completed". A
subscriber's sits at handler ENTRY, because liveness there means "the bus reached this handler" — and
an event the handler legitimately declines to act on still proves that. Same registry, opposite ends
of the function, for two different questions.

## `alive` derives from registration, never from `lastTickAt`

This is the contract that mattered most and it is asserted three ways:

- `snapshot()["<name>"]` is `{ alive: false, lastTickAt: null }` before registration and
  `{ alive: true, lastTickAt: null }` immediately after — **alive with a null tick.**
- `snapshot(Date.now() + 365 days)["<name>"]` is still `{ alive: true, lastTickAt: null }`. A CRM
  that emits nothing for a year does not turn its subscribers red. The processors' tick-interval
  staleness model is not applied to subscribers anywhere.
- `lastTickAt` becomes a valid round-trippable ISO string once the handler runs
  (`new Date(x).toISOString() === x`), and is reported as a diagnostic only.

No processor-style staleness math was added, and `heartbeat.ts` was not modified — `snapshot()`
already short-circuits `kind === "subscriber"` to `alive = true` (line 210-211). This plan is the
write side of a contract 42-02 and 42-05 already established.

## The three migrated call sites

```
src/lib/events/subscribers/audit.ts:109:          .catch((err) => log.error("audit", "insert failed", { err }))
src/lib/events/subscribers/stage-history.ts:47:   .catch((err) => log.error("stage-history", "insert failed", { err }))
src/lib/events/subscribers/workflow-trigger.ts:41: log.error("workflow-trigger", "handler failed", { err })
```

`grep -rn '\.catch(log\.error)' src` returns **zero hits** — the bare-reference form that would hand
the `Error` to `log.error`'s `scope` parameter appears nowhere, including in comments.

## `console.*` count, before and after — the drop is exactly 3

| Measure | Before (`4ea73f4`) | After | Delta |
|---|---|---|---|
| `git grep 'console\.'`, non-test files | 254 | 251 | **−3** |
| `git grep 'console\.'`, all files incl. tests | 292 | 289 | **−3** |
| `eslint --rule no-console:error`, non-test violations | 244 | 241 | **−3** |
| `eslint --rule no-console:error`, non-test files with ≥1 violation | 91 | 88 | −3 (all three cleared) |

The all-files delta is also exactly −3 rather than smaller, because the new assertions reuse the two
`vi.spyOn(console, "error")` spies that were already there instead of adding any. All four subscriber
source files are now at **zero** `console.` references (`workflow-trigger.ts` included, and
`webhook.ts` had none to begin with).

## The two argument-shape assertions

`audit.test.ts` and `stage-history.test.ts` each replaced one two-argument assertion with a
five-assertion block that:

1. asserts the spy was called **once**, with **`toHaveLength(1)`** on the argument array — the
   one-argument shape is pinned, not merely implied;
2. substring-matches `'"scope":"audit"'` / `'"scope":"stage-history"'` on the raw line;
3. `JSON.parse`s the line and checks `parsed.scope`;
4. checks `parsed.err.message === boom.message` — the round trip, not object identity;
5. checks `parsed.err.stack` is truthy.

Points 4 and 5 are the reason this is worth more than the assertion it replaced. `JSON.stringify(new
Error())` is `"{}"`, so a regression in `log.ts`'s explicit `Error` branch would silently annihilate
every stack trace in the codebase while leaving a scope-only assertion green. These two tests now
fail if that happens.

## The swallow proofs are untouched — verified from the diff, not by eye

`git diff 4ea73f4..HEAD` on the two test files shows exactly **2 removed lines**, and they are the
two named assertions:

```
-      expect(errorSpy).toHaveBeenCalledWith("[audit]", boom)
-      expect(errorSpy).toHaveBeenCalledWith("[stage-history]", boom)
```

Zero diff lines — added or removed — match `not\.toThrow|unhandled`. The
`expect(() => crmBus.emit(...)).not.toThrow()` and `expect(unhandled).toHaveLength(0)` assertions are
byte-identical to the base (T-42-25 satisfied).

The same diff on the four source files shows exactly **3 removed lines**, the three `console.error`
calls, and **zero new `export`s**. Every `let registered` declaration is unchanged apart from an added
comment above it (T-42-10 satisfied) — the flags are not read, not exported and not removed.

## Redaction (T-42-04): nothing was widened

The single highest-risk place in the phase to leak, and the check is short because the original
argument lists were short. Each original carried a bracket prefix and an `Error` and nothing else:

| Site | Original values | Migrated values |
|---|---|---|
| `audit.ts` | `"[audit]"`, `err` | `"audit"`, `"insert failed"`, `{ err }` |
| `stage-history.ts` | `"[stage-history]"`, `err` | `"stage-history"`, `"insert failed"`, `{ err }` |
| `workflow-trigger.ts` | `"[workflow-trigger]"`, `err` | `"workflow-trigger"`, `"handler failed"`, `{ err }` |

The added message strings are fixed literals. **The `crmBus` payload — which carries deal, person,
organization and activity field values — enters no `ctx` at any of the three sites.** No entity id,
no user id, no `payload.data`. The only value crossing into stdout that was not there before is a
constant.

## `ctx` key collision check (wave 1's warning)

`ctx` keys land flat at the top level of the log line, so `level` / `scope` / `msg` / `ts` would
silently overwrite a base field. This plan introduces exactly **one** distinct ctx key: `err`. None
of the four reserved names is used.

## Deviations from Plan

### Additions beyond the plan text

**1. [Rule 2 — missing proof] Added a tick-advances assertion to `stage-history.test.ts` and
`webhook.test.ts`.** The plan specified only registration and always-alive for those two, which would
have left `recordTick` in three of the four files as a source gate. `recordTick` at handler entry is
the load-bearing half of the module-graph diagnostic, and a `registerSubscriber` call proves nothing
about it — the two are independent edits that could each be wrong alone. Both files now emit a real
event and assert `lastTickAt` became a round-trippable ISO string. Cost: 2 assertions. Result: only
`workflow-trigger.ts` is gate-only, instead of three of four.

**2. [Rule 3 — the acceptance gate contradicted my own prose] Reworded three comments to avoid the
literal string `.catch(log.error)`.** The plan's criterion is
`grep -c '\.catch(log\.error)' src/lib/events/subscribers/*.ts` returns 0, and my first draft
explained the trap by quoting the wrong form verbatim — which made the grep return 3. The comments
now say "handing `log.error` to `.catch` as a bare method reference", which carries the same warning
and leaves the gate a usable check rather than one a reader has to interpret. This is the same class
of self-inflicted gate failure 42-06 hit with `[audit-prune]`; it is apparently easy to make.

### Corrections to the plan's own statements

**3. `workflow-trigger.ts:20`'s call is in a `.catch` argument, not "statement position inside the
handler's catch".** The plan's task-2 text describes it as statement position inside a try/catch;
there is no try/catch in that file. The original is
`matchAndFireTriggers(event, payload).catch((err) => console.error("[workflow-trigger]", err))` — the
arrow form was already there, so no arrow needed introducing and there were **three** expression-
position `.catch` sites in this plan rather than the two the plan counted. Outcome unchanged: the
migration is body-only and the `.catch` stays attached and swallowing.

**4. I verified the "no test suite" premise rather than trusting it, per the known-correction
brief.** `workflow-trigger.ts` genuinely has no `.test.ts` beside it (`ls
src/lib/events/subscribers/` returns 7 files, and `workflow-trigger.test.ts` is not among them).
`src/lib/triggers/matcher.test.ts` exercises `matchAndFireTriggers` but never calls
`registerWorkflowTriggerSubscriber`, so it is not a wiring proof. **`workflow-trigger.ts`'s
registration and tick are covered by a SOURCE GATE ONLY — there is no behavioural proof for that one
file**, and its header now says so in the file itself.

**5. Baseline numbers in the plan are stale.** The plan asks for "≥ 4406 passed"; the orchestrator's
brief supersedes it with 4514. Ended on 4524 = 4514 + the 10 new assertions.

### Auto-fixed issues

None. No bugs, no missing functionality and no blockers were found in the four files. Every `.catch`
kept its swallow behaviour, no handler's event list or filtering changed, and no control flow moved —
the only structural addition is a `recordTick` call whose contract is that it never throws.

## Verification — exact numbers

| Check | Result |
|---|---|
| `npx vitest run src/lib/events/subscribers` | **34 passed / 0 failed** (19 audit + 9 stage-history + 6 webhook) |
| `npm test` (unit project) | **4524 passed / 32 skipped / 0 failed**, 162 files passed / 2 skipped |
| `npm test` (RSC project) | **8 passed / 0 failed** |
| `npx tsc --noEmit` | **0 errors** |
| `npm run lint` | **0 errors / 122 warnings** |
| `npx eslint src/lib/events/subscribers` | **0 errors / 0 warnings** |

**On the lint warning count: 122 here versus the brief's 124, and this plan is not the cause.**
Checked rather than assumed: `git show 4ea73f4:<file> | npx eslint --stdin --stdin-filename <file>`
reports **zero** warnings for all four source files at the base commit, so there were no warnings in
my files for this plan to remove. 42-06 measured the same 122 from its own worktree against the same
124 baseline, so this is a worktree-vs-main-checkout measurement difference (a worktree receives only
tracked files, so gitignored files present in the main checkout are absent here) and not a drift
introduced by either plan. Worth one glance from whoever runs the next full-repo lint on the main
checkout; not worth blocking on.

## Notes for later plans

- **`/api/health` now has real writers for all ten roster entries.** A container that reports fewer
  than ten `alive: true` after boot is now reporting something real. 42-06's note that "a snapshot
  today reports 6 registered and 4 `alive: false`" is superseded.
- **The `alive: true` + `lastTickAt: null` pair is now the phase's sharpest field.** For a subscriber
  it is *normal* on a quiet system and *diagnostic* after known CRM writes: registered but never
  ticked means the subscriber attached to a different `crmBus` instance than the emitters use, which
  is the 2026-08-16 `actor_kind = system` defect. Whoever writes 42-18's container check should
  perform a CRM write and then re-poll, because a single poll cannot distinguish the two.
- **OBS-03 remains unproven in production** regardless of these 34 passing tests, exactly as wave 1
  warned. Vitest has one module registry and structurally cannot reproduce the four-instance
  Turbopack split; every heartbeat assertion in these three suites is labelled a PROXY in the
  `audit.test.ts` block comment, and the other two point at it. 42-18's container check is the only
  real verification.
- **Nothing in `instrumentation.ts` needed changing** and it was not touched — it already calls all
  four `register*Subscriber` functions at lines 15-25 behind the `NEXT_RUNTIME` guard. Its stale
  `grep -F '[trash-prune] Starting'` comment at line 40 is still outstanding and still belongs to
  42-17.
- **The four `let registered` flags are now commented as unreadable from the route.** If a future
  reader is tempted to simplify `/api/health` to consult one of them, that comment is the stop sign.
  It is prose, not an assertion — nothing enforces it.

## Known Stubs

None. No placeholder values, no unwired data paths, no TODOs introduced.

## Self-Check: PASSED

Files claimed as modified — all 7 exist and are committed:
`src/lib/events/subscribers/audit.ts`, `stage-history.ts`, `webhook.ts`, `workflow-trigger.ts`,
`audit.test.ts`, `stage-history.test.ts`, `webhook.test.ts`.

Commits claimed — both present in `git log`: `9a307a4`, `b08fa3b`.

No file outside the plan's `files_modified` was touched: `git diff --stat 4ea73f4..HEAD` covers
exactly those 7 paths. No `STATE.md` or `ROADMAP.md` write. No file deletions in either commit
(`git diff --diff-filter=D` empty for both).
