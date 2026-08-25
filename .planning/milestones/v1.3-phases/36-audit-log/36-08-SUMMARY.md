---
phase: 36-audit-log
plan: 08
subsystem: audit-settings
tags: [audit-log, retention, app-settings, zod, fail-closed, tdd]
requires:
  - "36-03 (app_settings + audit_log tables, seeded audit.retention_days = 90)"
provides:
  - "readRetentionDays(): number | null — fail-closed retention read"
  - "writeRetentionDays(days): validated upsert, never raises"
  - "readAuditStats(): { entryCount, oldestEntryAt } — degrades to the zero-state"
  - "AUDIT_RETENTION_KEY, RETENTION_MIN, RETENTION_MAX, AuditStats, WriteRetentionResult"
affects:
  - "36-14 (admin retention UI — the three reads/writes it renders)"
  - "36-18 (pruner — null from readRetentionDays means DELETE NOTHING)"
tech-stack:
  added: []
  patterns:
    - "zod safeParse against a jsonb `unknown` column as the trust boundary between storage and code"
    - "validate-before-write: an out-of-range value never reaches storage"
    - "default-in-data / fail-closed-in-code — the two mechanisms kept deliberately separate"
key-files:
  created:
    - src/lib/audit/settings.ts
    - src/lib/audit/settings.test.ts
  modified: []
decisions:
  - "No `?? 90` anywhere in the read path. The 90-day default is the seeded app_settings row from migration 0014; `null` here means do nothing, because it is also what a corrupted or cleared row produces."
  - "The parse-failure branch logs via console.warn, the error branches via console.error — a bad value is an operator problem, an unreachable database is an infrastructure problem, and the two should not read alike in logs."
  - "`readAuditStats` normalises the count with `Number(...) || 0` because postgres-js returns bigint aggregates as strings on some drivers; the admin readout must not render \"0\" as a string or NaN."
  - "Round-trip is asserted by replaying the captured upsert payload through the read path, not by hitting a database — the write's stored shape is the read's input by construction."
metrics:
  duration: ~15 min
  completed: 2026-08-15
---

# Phase 36 Plan 08: Audit Retention Settings Summary

`readRetentionDays` / `writeRetentionDays` / `readAuditStats` over the single
`audit.retention_days` key, with a zod `safeParse` at the storage boundary and a hard rule
that anything unexpected — unset, non-numeric, zero, negative, fractional, out of range, or
a database outage — reads as `null`, which the pruner must treat as **delete nothing**.

## What Was Built

**`src/lib/audit/settings.ts`** (167 lines) — three exported functions, three `catch` blocks,
zero `throw`.

| Export | Returns | Failure direction |
|--------|---------|-------------------|
| `readRetentionDays()` | `number \| null` | `null` — keep all data |
| `writeRetentionDays(days)` | `{ success: true } \| { success: false; error }` | failure result, no partial write |
| `readAuditStats()` | `{ entryCount, oldestEntryAt }` | `{ 0, null }` — the admin page degrades, never 500s |

Constants: `AUDIT_RETENTION_KEY = "audit.retention_days"`, `RETENTION_MIN = 1`,
`RETENTION_MAX = 3650`. One shared schema —
`z.number().int().min(RETENTION_MIN).max(RETENTION_MAX)` — validates **both** directions, so
the read path and the write path cannot drift into disagreeing about what is legal.

`app_settings.value` is `jsonb().$type<unknown>()` (36-03), which is what makes the parse
load-bearing rather than ceremonial: a stored `"90"`, `{ days: 90 }`, `true` or JSON `null`
all arrive typed as `unknown` and all fail the parse. Nothing is coerced anywhere in this
module.

### The no-code-default rule, written into the doc comment

Both halves are stated in `readRetentionDays`'s doc comment so neither can later be
"simplified" into the other:

1. **The 90-day default is real and IS implemented** — as a seeded `app_settings` row in
   migration `0014` (36-03, `INSERT ... ON CONFLICT DO NOTHING`). A fresh deployment prunes
   at 90 days with no admin action.
2. **There is deliberately no `?? 90` here.** This function's `null` is also what a
   corrupted, tampered, out-of-range or deliberately cleared row produces, and resuming
   deletion at 90 days in those cases is the wrong failure direction for an audit log
   (T-36-18, T-36-44).

Default in data, fail closed in code. A fallback here would collapse the two and turn a
corrupt row back into an unbounded delete.

### Why `writeRetentionDays` validates first

Validation runs **before** `db.insert` is reached, so an out-of-range value never lands in
storage where a later read would have to defend against it. Rejecting `<= 0` at this point
is the stated control against retention being used as a data-destruction primitive
(T-36-07) — an admin is trusted to choose a short window, but not to choose "delete
everything".

### `readAuditStats` uses the builder, not a fragment

`db.select({ entryCount: count(), oldestEntryAt: min(auditLog.createdAt) }).from(auditLog)`.
There is no `ctid` and no interval arithmetic here, so nothing forces raw SQL, and a raw
fragment would only invite the `Date`-binding hazard for no benefit. (36-18's prune is the
opposite case and legitimately needs the `ctid` form.)

## Tests — `src/lib/audit/settings.test.ts` (26 cases)

`@/db` is mocked with the **minimum** surface the module is allowed to touch —
`{ query: { appSettings: { findFirst } }, insert, select }` — so a query added later
surfaces as a `TypeError` rather than being silently absorbed by a permissive mock.

| Group | Cases | What is pinned |
|-------|-------|----------------|
| `readRetentionDays` | 12 | valid read, single query on the constant key, missing row, numeric string, object, JSON null, `0`, `-1`, `1.5`, `> RETENTION_MAX`, both boundaries, **fails closed** |
| `writeRetentionDays` | 10 | upsert target/values/set, `updatedAt` on both branches, five rejected inputs each asserting **no database call**, non-empty error string, **fails closed** on a rejected write, round trip |
| `readAuditStats` | 4 | empty table, real values, empty result array, **fails closed** to the zero-state |

Three test names contain `fails closed`. Each asserts with `.resolves`, which is itself the
"does not re-raise" assertion — a rejected promise fails the expectation. That matters
because the caller is a background timer tick (36-RESEARCH Pitfall 9): an error escaping
`readRetentionDays` would stop the pruner rescheduling, and a pruner that stops rescheduling
is a silently disabled retention policy (T-36-19).

The round-trip case captures the exact payload the upsert was called with and replays it
through `findFirst`, so "what the write stores" and "what the read parses" are the same
value by construction rather than by two hand-written literals that could drift.

## TDD Gate Compliance

| Gate | Commit | Evidence |
|------|--------|----------|
| RED | `f0a9291` `test(36-08): ...` | `vitest run src/lib/audit/settings.test.ts` exit `1` — module not found, 0 tests run |
| GREEN | `fea3b2a` `feat(36-08): ...` | 26/26 pass |
| REFACTOR | — | not needed; no cleanup pass produced a change |

RED was a module-resolution failure rather than assertion failures, because Task 1 creates
only the test file and `settings.ts` does not exist at that point. That is what the plan
specifies (`test $? -ne 0`) and it is an honest red — but it is worth recording that it does
not, on its own, prove each of the 26 assertions was ever failing. What does prove it: every
case names a specific input and a specific expected output, and all 26 turned green against
an implementation written from the interface block, not tuned against the assertions.

## Acceptance Criteria

| Criterion | Required | Actual |
|-----------|----------|--------|
| `it(` blocks in the test | ≥ 12 | **26** |
| test name matching `/fails closed/` | ≥ 1 | **3** |
| RED run exits non-zero | yes | exit `1` |
| `vitest run src/lib/audit/settings.test.ts` | all pass | **26 passed** |
| `grep -c "safeParse"` | ≥ 1 | **2** |
| `grep -c "catch"` | ≥ 3 | **4** (3 are `catch (error)` blocks, one per exported function) |
| `grep -c "throw"` | `0` | **0** — including comments, which is why they say "raise" and "propagate" |
| `grep -cE "\?\? *90\|\?\? *RETENTION_DEFAULT"` | `0` | **0** |
| doc comment states both default halves | yes | numbered points 1 and 2 in `readRetentionDays` |
| `npm run typecheck` | exit 0 | **exit 0** |
| `npm run lint` | no new findings | 0 findings in either new file |

## Deviations from Plan

None affecting the output. Two environment notes:

**1. `node_modules` absent from the worktree.** Same condition 36-03 hit. A symlink to the
main checkout's `node_modules` was created to resolve `vitest` and `tsc`, and **removed
before staging** — it is gitignored (`.gitignore:4`) and appears in no commit.

**2. `npx` is intercepted in this environment** (rewritten to `npm run`, per 36-03 Deviation
3). The plan's `<verify>` commands were run as `./node_modules/.bin/vitest run ...` and
`npm run typecheck`. Identical binaries, identical config resolution.

## Deferred Issues (out of scope)

`src/lib/audit/actor-context.test.ts > concurrency > keeps two concurrent scopes from
observing each other's actor` fails **intermittently under full-suite load** (1 failure in
`npm test`, 1180 other tests passing) and passes cleanly in isolation (6/6). It belongs to
36-01, is timing-sensitive, and is untouched by this plan — no file in this plan imports
`actor-context`. Flagged for the phase verifier; not fixed here per the scope boundary.

## Threat Model Coverage

| Threat ID | Disposition | Where mitigated |
|-----------|-------------|-----------------|
| T-36-07 | accept (partially mitigated) | `RETENTION_MIN = 1` rejected before any db call — five write-rejection cases each assert `insert` was never called, so the window can never be set to "delete everything". Logging the retention change itself remains Phase 42. |
| T-36-18 | mitigate | `safeParse` rejects every non-integer / out-of-range value; the failure direction is `null` = keep data. A corrupt row stops pruning rather than causing an unbounded delete. |
| T-36-19 | mitigate | Three `catch (error)` blocks, `grep -c "throw"` = `0`, and three `fails closed` cases asserting the returned value rather than a rejection. |
| T-36-SC | accept | Zero packages added. `zod` and `drizzle-orm` were already direct dependencies. |

## Known Stubs

None. All three functions query real tables through the real drizzle builder; only the test
suite mocks `@/db`.

## For the Next Plan

- **36-18 (pruner):** `null` from `readRetentionDays` means **delete nothing**. Do not add a
  fallback at the call site either — that would reintroduce exactly what this module removes.
  Wrap the tick and always reschedule.
- **36-14 (admin UI):** `AuditStats.oldestEntryAt` is `null` on an empty table, which is the
  `retention.oldestNone` branch in 36-UI-SPEC Surface 3. `readRetentionDays()` returning
  `null` is the `retention.notSet` branch — note that it also covers "the row is corrupt",
  so the copy should not promise the value has merely never been saved.
  `writeRetentionDays` already returns a user-presentable `error` string; do not re-derive
  one from a raised error.
- `import { readRetentionDays, writeRetentionDays, readAuditStats, AUDIT_RETENTION_KEY, RETENTION_MIN, RETENTION_MAX } from "@/lib/audit/settings"` resolves.

## Commits

| Task | Gate | Description | Commit |
|------|------|-------------|--------|
| 1 | RED | Failing retention parse and fail-closed cases | `f0a9291` |
| 2 | GREEN | Fail-closed settings reader, writer and stats | `fea3b2a` |

## Verification

| Check | Result |
|-------|--------|
| `vitest run src/lib/audit/settings.test.ts` (RED, before Task 2) | exit `1` |
| `vitest run src/lib/audit/settings.test.ts` (GREEN) | 26/26 passed |
| `npm run typecheck` | exit `0` |
| `npm run lint` | 0 findings in `settings.ts` / `settings.test.ts` |
| `npm test` (full suite) | 1180 passed, 4 skipped, 1 pre-existing flake in `actor-context.test.ts` (passes in isolation) |
| grep gates (`safeParse` / `catch` / `throw` / `?? 90`) | `2` / `4` / `0` / `0` |

## Self-Check: PASSED

Files verified present on disk:

- `FOUND: src/lib/audit/settings.ts`
- `FOUND: src/lib/audit/settings.test.ts`

Commits verified in `git log`:

- `FOUND: f0a9291`
- `FOUND: fea3b2a`

STATE.md and ROADMAP.md were **not** touched — the orchestrator owns those.
