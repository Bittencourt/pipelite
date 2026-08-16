---
phase: 36-audit-log
plan: 09
subsystem: audit-read-path
tags: [audit-log, workflow-runs, aggregation, tdd, batched-reads]
requires:
  - "audit_log table with workflow_run_id and the partial index audit_log_workflow_run_idx (36-03)"
provides:
  - "readRunChangedRecords(runId) → RunChangedRecord[]"
  - "RunChangedRecord — the UI-SPEC § Surface 2 data contract, verbatim"
affects:
  - "36-16 (the run detail 'Records changed' section is the only consumer)"
tech-stack:
  added: []
  patterns:
    - "read-then-fold-in-JS: one indexed read, then a Map/Set fold for the jsonb-key union"
    - "one batched title read per entity type present (<=4 queries), never one per record"
    - "no try/catch in the reader — [] must mean empty, so failures reach the consumer"
    - "thenable drizzle-builder stub routed by .from(table), so query ORDER is not asserted"
key-files:
  created:
    - src/lib/audit/linked-records.ts
    - src/lib/audit/linked-records.test.ts
  modified: []
decisions:
  - "The fold runs in JavaScript, not SQL: unioning jsonb object KEYS across rows is awkward and slow in SQL, the row count per run is bounded by the run's own step count, and a JS fold is the part a mocked driver can actually test."
  - "occurredAt is a MAX over the run's rows, not the last row read. The query orders ascending, but the fold must not silently depend on that — an out-of-order case in the suite pins it."
  - "titleOrNull() trims and maps empty to null for EVERY entity type, not just people, so the consumer's 'Untitled record' branch is reached by missing data rather than by a blank link label."
  - "import_session audit rows are skipped explicitly. They cannot carry a run id in practice, but AuditEntityType permits the value, so the narrowing is written rather than assumed."
metrics:
  duration: ~12 min
  completed: 2026-08-15
---

# Phase 36 Plan 09: Workflow Run → Records Changed Summary

`readRunChangedRecords(runId)` answers the second half of SC-2 from the indexed
`audit_log.workflow_run_id` foreign key rather than from a timestamp guess — one row per distinct
record, `fieldCount` as the union of the fields every step changed, newest first, with dead
records reported unlinked instead of dropped.

## What Was Built

**`src/lib/audit/linked-records.ts`** — four steps, in order:

1. **One indexed read.** `where(eq(auditLog.workflowRunId, runId))` ordered by `createdAt`. This
   is exactly the query `audit_log_workflow_run_idx` (partial, `workflow_run_id is not null`) was
   declared for in 36-03. `runId` is a bind parameter through the drizzle builder; no raw
   fragment composes it, so T-36-06 is closed by construction and no `sources.ts`-style hand-SQL
   discipline is needed here.
2. **The fold**, into a `Map` keyed by `` `${entityType}:${entityId}` ``. Each accumulator holds a
   `Set` of change-map keys (the union), the running max `createdAt`, and the running max action
   under `ACTION_RANK = { updated: 0, created: 1, deleted: 2 }`.
3. **Title resolution**, one batched `inArray` read per entity type *present* — at most four
   queries, typically one. A run touching three deals and one organization issues two title
   queries, not four; the suite asserts the count directly.
4. **Map and sort** to `RunChangedRecord[]`, `occurredAt` descending.

**`src/lib/audit/linked-records.test.ts`** — 16 cases against a mocked `@/db`. The stub is a
thenable builder routed by the table that reached `.from(...)`, so the suite never asserts the
*order* in which queries are issued — only which tables were read, how many times, and what came
back. A `rowsFor` that throws rejects, which is how both error-propagation cases are driven.

## The Three Behaviours That Are Load-Bearing

**Distinctness and the union.** Three audit rows for the same deal changing `{title}`,
`{title, value}` and `{ownerId}` produce ONE entry with `fieldCount === 3`. A sum would say 4.
The count is a union of distinct field names because a field touched by three steps is still one
field changed — and because "3 fields" under a record title is a claim about the record, not
about the log.

**Dead records are reported, never dropped.** The title reads carry **no** `deletedAt` predicate.
A soft-deleted record returns `deleted: true` *and* its title (rendered unlinked, because its
detail page 404s). A hard-deleted record — no row at all — returns `title: null`, `deleted: true`,
and keeps its `fieldCount`. This is the same posture `audit_log.entity_id` takes by carrying no
foreign key: the audit row IS the fact that the run mutated that record, and a referential or
soft-delete guard would erase exactly the evidence the log exists to keep.

**Errors propagate.** No `try`/`catch` anywhere in the module. A swallow would return `[]`, and
`[]` renders "This run didn't change any records" — a statement the operator cannot tell apart
from the truth. The empty array must mean empty. Two suite cases pin this: one where the audit
read fails, one where only the *title* read fails (a caught title failure would return every
entry with `title: null`, which reads as "every record this run touched has been hard-deleted" —
a worse answer than the degraded panel 36-16 renders on a rejection). Either case going green
under an added try/catch turns them red.

## Test Cases

| # | Case | Pins |
|---|------|------|
| 1 | Empty run returns `[]` **and reads no titles** | 1 query total; nothing is asked when there is nothing to ask about |
| 2 | Single row → full entry | type, id, action, `fieldCount`, `occurredAt` |
| 3 | Three rows, one record → one **distinct** entry | the distinctness rule |
| 4 | `{title}` + `{title,value}` + `{ownerId}` → `3` | union, not sum |
| 5 | `occurredAt` is the latest — asserted twice, once with rows delivered **out of order** | MAX, not last-seen |
| 6 | `deleted` > `created` > `updated`, across three records | precedence regardless of row order |
| 7 | Deleted entry's `fieldCount` is the tombstone's key count | the number is defined, not incidental |
| 8 | `deals.title` / `organizations.name` / `people` concat / `activities.title` | per-type title column |
| 9 | Person with empty names → `title: null` | the untitled case |
| 10 | Soft-deleted → `deleted: true`, title still returned | reported unlinked |
| 11 | Missing row → `title: null`, `deleted: true`, entry survives | hard delete does not erase history |
| 12 | Ordering | `occurredAt` descending |
| 13 | 3 deals + 1 org → 1 deal query + 1 org query, 0 for absent types | batching |
| 14 | `import_session` row excluded | not a CRM record |
| 15 | Audit-read failure rejects | no swallow |
| 16 | Title-read failure rejects | no swallow on the second leg either |

## Decision: the fold is in JavaScript

The plan asked for JS and this confirms why, having written it: the union is over the **keys of a
jsonb object** across rows, which in SQL needs `jsonb_object_keys` in a lateral join feeding a
`count(distinct)` — a shape that is both slower and harder to read than `Set.add` in a loop. The
row count per run is bounded by the run's own step count, so there is no volume argument for
pushing it down. And the fold is the part a mocked driver can see: every one of the 16 cases
above exercises real logic rather than asserting a rendered SQL string.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] No `node_modules` in the worktree**

- **Found during:** Task 1, running red
- **Issue:** `./node_modules/.bin/vitest` → `No such file or directory`. A fresh worktree has no
  `node_modules`; the main checkout does.
- **Fix:** `ln -s /home/pedro/programming/pipelite/node_modules node_modules`, matching the
  36-03 precedent. `/node_modules` is line 4 of `.gitignore`, so the link could not be staged;
  it was removed before the final commit and appears in no commit (verified below).
- **Files modified:** none
- **Commit:** n/a (tooling only)

**2. [Rule 3 - Blocking] `npx vitest` is intercepted in this environment**

- **Found during:** Task 1
- **Issue:** The plan's `<verify>` uses `npx vitest run …`. An environment-level hook rewrites
  `npx` to `npm run`, which fails with `Missing script: "vitest"` — the same interception 36-03
  recorded as its Deviation 3.
- **Fix:** Invoked the local binary directly, `./node_modules/.bin/vitest run …`. Identical
  binary, identical config resolution. `npm run typecheck` and `npx eslint` were unaffected.
- **Files modified:** none
- **Commit:** n/a (tooling only)

### Additions Beyond the Plan's Enumerated Cases

Three cases the plan did not enumerate were added; none changes the contract:

- **`import_session` exclusion.** `AuditEntityType` is `EntityType | "import_session"`, so the
  narrowing to `EntityType` is *required* for the module to typecheck. Rather than let the guard
  be an untested implementation detail, it has a named case. An import summary row carries a
  session id in `entity_id` and has no record page.
- **Batching assertion** (case 13). The plan's Step 3 says "do not issue one query per record";
  without an assertion that instruction has no gate. This one fails if a future edit moves the
  title read inside the per-record map.
- **Title-read failure** (case 16). The plan asked for one rejection case; the second leg is a
  distinct swallow site with a distinctly bad failure mode, so it gets its own case.

## Threat Model Coverage

| Threat ID | Disposition | Where handled |
|-----------|-------------|---------------|
| T-36-04 | accept | No auth code added. The consumer page's existing session-only check is unchanged; this module takes a run id and reads. |
| T-36-06 | mitigate | `runId` reaches SQL only as a drizzle bind parameter (`eq(auditLog.workflowRunId, runId)`); the module composes no raw `sql` fragment at all, so there is no identifier/value discipline to get wrong. |
| T-36-20 | accept | A soft-deleted record's title IS returned, unlinked. Case 10 pins it. Hiding it would make the list incomplete, and on an audit surface omitting history is the worst failure available. |
| T-36-SC | accept | Zero packages added. |

## Known Stubs

None. Both files are real and fully exercised; nothing returns a placeholder value.

## Threat Flags

None. The module adds no network endpoint, no auth path, no file access and no schema change —
it is a read over a table 36-03 already created, called from a page 36-16 will edit.

## For the Next Plan

- **36-16:** `import { readRunChangedRecords, type RunChangedRecord } from "@/lib/audit/linked-records"`
  resolves. **Wrap the call in try/catch at the call site** and render `audit.run.unavailable` on
  rejection — this module deliberately does not, and there is no `error.tsx` under `src/app/`, so
  an unguarded throw takes the whole run page down.
- `[]` from this function means the run genuinely changed nothing → render the bordered empty
  panel (`audit.run.empty`). It never means "the query failed".
- `deleted === true` → render the title as a plain `<span>`, not a `<Link>`. `title === null` →
  `audit.run.untitledRecord`. Both states are reachable and both are tested.
- `fieldCount` is populated even when `action === "deleted"`; the UI omits it for tombstones per
  UI-SPEC, but the value is a real number, not a sentinel.

## Commits

| Task | Gate | Description | Commit |
|------|------|-------------|--------|
| 1 | RED | 16 failing run→records aggregation cases | `1ac59ea` |
| 2 | GREEN | `readRunChangedRecords` implementation | `39af4b7` |

No REFACTOR commit: the GREEN implementation is the shape the module should keep, so a
no-op refactor commit would be noise.

## TDD Gate Compliance

`type: tdd` plan, gate sequence verified in `git log`:

1. `test(36-09): add failing run→records aggregation cases` — `1ac59ea`
2. `feat(36-09): add workflow-run linked-records reader` — `39af4b7`, after it

RED was a genuine red: `Cannot find module '/src/lib/audit/linked-records'`, exit `1`, before
any implementation existed. Nothing passed unexpectedly.

## Verification

| Check | Result |
|-------|--------|
| `vitest run src/lib/audit/linked-records.test.ts` (RED, task 1) | exit `1` — module absent |
| `vitest run src/lib/audit/linked-records.test.ts` (GREEN, task 2) | **16 passed** |
| `npm run typecheck` | exit `0` (`tsc --noEmit`, 0 errors) |
| `npx eslint` on both new files | `No issues found` |
| `grep -c "workflowRunId" src/lib/audit/linked-records.ts` | `1` (>= 1) |
| `grep -c "try {" src/lib/audit/linked-records.ts` | `0` |
| `grep -cE "isNull\(.*deletedAt\)" src/lib/audit/linked-records.ts` | `0` |
| `grep -c "  it(" src/lib/audit/linked-records.test.ts` | `16` (>= 11) |
| test name matching `/distinct/` | present (case 3) |
| full suite `vitest run` | **69 files / 1171 passed, 4 skipped** — no regressions |

## Self-Check: PASSED

Files verified present on disk:

- `FOUND: src/lib/audit/linked-records.ts`
- `FOUND: src/lib/audit/linked-records.test.ts`

Commits verified in `git log`:

- `FOUND: 1ac59ea`
- `FOUND: 39af4b7`

The `node_modules` symlink created for tooling was removed before staging and appears in no
commit. STATE.md and ROADMAP.md were **not** touched — the orchestrator owns those.
