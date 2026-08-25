---
phase: 42-observability
plan: 14
subsystem: infra
tags: [logging, structured-logging, observability, csv-import, server-actions, use-client]

requires:
  - phase: 42-observability
    provides: "src/lib/log.ts — the zero-import structured logger (42-01)"
provides:
  - "The CSV import actions emit structured JSON on all eight of their failure paths"
  - "The pipeline/stage admin actions, the admin user actions and the user-settings actions emit structured JSON"
  - "The first exercised proof that a \"use client\" component can import @/lib/log with no window branch"
  - "A worked [entityType] dynamic-segment scope, and evidence that the phase's own scope gate cannot see it"
affects: [42-18, 42-16, 42-15]

tech-stack:
  added: []
  patterns:
    - "Bracket-prefix-wins scope harvesting ([audit-import] kept verbatim across 4 sites)"
    - "Path-derived scope keeping dynamic segments verbatim, including a capitalised one"
    - "One code path for client and server logging — no typeof window branch"

key-files:
  created: []
  modified:
    - src/app/import/actions.ts
    - src/app/admin/pipelines/actions.ts
    - src/app/admin/users/actions.ts
    - src/app/admin/fields/[entityType]/trigger-child-guard.ts
    - src/app/admin/import/pipedrive-api/pipedrive-api-wizard.tsx
    - src/actions/user-settings.ts

key-decisions:
  - "trigger-child-guard's componentName moved to a ctx field rather than staying interpolated in the message; its doc comment was corrected to match, since this plan owns the file"
  - "The pipedrive wizard's log import was placed after the two type imports with a one-line comment naming the zero-import property that makes it legal in a client bundle"
  - "The owned test file needed ZERO repair — the plan's premise that it would redden is false, and the reason is structural, not luck"

patterns-established:
  - "Multi-line-aware scope matcher: perl -0777 with \"[^\\\"]+\" plus a single-quote alternative — the only matcher in this phase that can see all 22 of these scopes"

requirements-completed: [OBS-01]

duration: 24min
completed: 2026-08-23
---

# Phase 42 Plan 14: CSV Import and Admin Action Logging Summary

**All 22 `console.*` sites across the CSV import actions, the pipeline/stage and user admin actions, the field trigger guard, the Pipedrive client wizard and the user-settings actions now emit single-line structured JSON, with the CSV rows, the invite token, the recipient address and the Pipedrive API key all provably still outside the log line.**

## Performance

- **Duration:** ~24 min
- **Tasks:** 2 of 2
- **Files modified:** 6 (all six are source; the one owned test file needed no change)
- **Commits:** `d316102`, `56485b9`

## Accomplishments

### Task 1 — the CSV import actions (`d316102`)

8 sites in `src/app/import/actions.ts`, two scopes, exactly as inventoried. Diff is 9 added / 8 removed lines: the eight calls plus the `import { log } from "@/lib/log"` line. Every `catch` still returns byte-for-byte what it returned; no transaction boundary, `revalidatePath`, or `countFlaggedImportedRecords` call was touched.

| Scope | Sites | Lines (post-edit) |
|---|---|---|
| `audit-import` | 4 | 316, 461, 697, 846 |
| `import/actions` | 4 | 336, 484, 710, 856 |

All four `[audit-import]` catches still swallow. Their governing comment (`actions.ts:313-315` — *"the rows are already in the database; turning a successful import into a reported failure because its audit row failed would tell the user something untrue about their own data"*) is unchanged and still accurate. The local is `auditError`; it is carried under `err` because `err` is the contract's key name (T-42-41 held).

### Task 2 — admin, guard, wizard, user-settings (`56485b9`)

14 sites across five files. 27 added / 18 removed lines.

| File | Scope | Sites |
|---|---|---|
| `src/app/admin/pipelines/actions.ts` | `admin/pipelines/actions` | 8 |
| `src/app/admin/users/actions.ts` | `admin/users/actions` | 2 |
| `src/app/admin/fields/[entityType]/trigger-child-guard.ts` | `admin/fields/[entityType]/trigger-child-guard` | 1 |
| `src/app/admin/import/pipedrive-api/pipedrive-api-wizard.tsx` | `admin/import/pipedrive-api/pipedrive-api-wizard` | 1 |
| `src/actions/user-settings.ts` | `actions/user-settings` | 2 |

## Redaction audit — per site, what was in scope and stayed out

This is the phase's worst redaction surface, so the audit is enumerated rather than asserted.

### The eight import sites (T-42-42, T-42-05)

| Site | In scope at the catch | Entered `ctx`? |
|---|---|---|
| `audit-import` ×4 (316/461/697/846) | `rows` (the full parsed CSV array), `warnings`, `inserted` (with returned row ids), `autoCreatedOrgs` / `autoCreatedPeople` maps holding org and person names, `actorUserId`, `importRunId` | **No.** `{ err: auditError }` only. |
| `import/actions` ×4 (336/484/710/856) | the same `rows` array, plus every per-row local from the loop body still live in the enclosing scope | **No.** `{ err: error }` only. |

Zero row contents, zero filenames, zero column names, zero header mappings, zero parsed cells, zero record counts. Confirmed three ways: `{ err` appears exactly 8 times in the file; a `log.error(` + 2-line-following grep for `row|filename|csv|column|value|email|phone|name` returns 0; and the diff above is 8 single-line replacements with no new identifiers other than `err`.

Nothing was *added* to any of the eight lines. Each carries strictly less than before, in fact — the `[audit-import]` bracket and the trailing `:` left the message text.

### `admin/users/actions.ts` ×2 (T-42-43) — quoted verbatim as required

```typescript
    log.error("admin/users/actions", "Failed to send approval email", { err: error })
```

```typescript
      log.error("admin/users/actions", "Failed to send invite email", { err: error })
```

In scope and deliberately excluded: `user.email` (site 1, the `sendApprovalEmail(user.email)` argument); `normalizedEmail`, `token` (`crypto.randomUUID()`, the live invite credential), `session.user.name` and `session.user.id` (site 2, all four are arguments to the very call whose rejection is being logged). Neither line contains the substring `email`, `to`, `token` or `invite` outside the fixed message text — and the message text is the original string minus its colon. `err` is the only `ctx` key on both.

### The client component (T-42-44) — quoted verbatim as required

```typescript
      log.error("admin/import/pipedrive-api/pipedrive-api-wizard", "Failed to fetch counts", { err: result.error })
```

- `grep -c 'typeof window'` on the file returns **0**. Same call shape as every server site.
- `result.error` is typed `string` (`fetchPipedriveCounts` returns `{ success: false; error: string }` at `pipedrive-api-import-actions.ts:215`), and its two possible values are `"Not authenticated"` or an `error.message`. Carried verbatim, not wrapped in a synthetic `Error`, and the whole `result` was not passed. `log.ts`'s `serialize` passes a non-`Error` through unchanged, so the emitted `err` is the same string the browser console showed before.
- **`apiKey` is in scope at that call site** (`fetchPipedriveCounts(apiKey)` two lines above) and stays out of the line. Worth naming because a Pipedrive API token in a browser console is a third-party credential and the threat model did not enumerate it.

### `trigger-child-guard.ts` ×1

`componentName` was already interpolated into the message today, so moving it to a `ctx` key widens nothing. `children` — the offending value, which may be a record object — is still never serialised; the suite's T-44-18 test proves it (see below).

### `admin/pipelines/actions.ts` ×8 and `actions/user-settings.ts` ×2 (T-42-04)

Pipeline names, stage names, colours, `stageId`, `pipelineId`, `locale` and `timezone` are all in scope at these catches. None entered a `ctx`. Every one of the ten is a pure mechanical `console.error("Failed to X:", error)` → `log.error(scope, "Failed to X", { err: error })`, applied by regex over an exactly-matching set, so widening was not reachable.

## Forbidden ctx-key check

Zero `level`, `scope`, `msg` or `ts` `ctx` keys in the plan's entire diff (checked against the merge base with a regex covering both `{ key` and `, key:` positions). The only two `ctx` keys this plan introduces are **`err`** (21 sites) and **`componentName`** (1 site).

## The `[entityType]` scope gate — the plan's own gate is blind to it, three ways at once

The plan's acceptance criterion is

```
grep -oE 'log\.[a-z]+\("[a-z0-9/\[\]-]+"' <file> | sort -u
```

Run verbatim against `src/app/admin/fields/[entityType]/trigger-child-guard.ts` it returns **nothing at all** — the single migrated site is invisible. Three independent causes stack on this one call:

1. **Capital letter.** `entityType` has a capital `T`; the class is `[a-z0-9/\[\]-]`. (The failure mode 42-10 hit on `api/v1/notes/[noteId]`.)
2. **Quote style.** The file uses single quotes throughout, so a `"`-anchored pattern cannot match regardless.
3. **Multi-line call.** The scope argument sits on its own line (`trigger-child-guard.ts:26`), and `grep -oE` is line-based — even a corrected char class and a single-quote alternative both return nothing, which I verified explicitly rather than assumed.

So this site would have passed the gate vacuously in either direction: a *missing* migration and a *correct* migration produce the same empty output. Fixed by using a multi-line-aware matcher for all verification in this plan:

```bash
perl -0777 -ne 'while(/log\.(debug|info|warn|error)\(\s*(?:"([^"]+)"|\x27([^\x27]+)\x27)/gs){print(($2//$3),"\n")}' <files> | sort | uniq -c
```

which returns all 22, and every scope was additionally confirmed by reading the diff. **For 42-18: the collision/scope gate must use a matcher of this shape, or it will silently under-count.** The wizard's scope is same-line, double-quoted and all-lowercase, so the plan's gate *can* see that one — the blindness is specific to the guard file.

## Corrections to plan premises

**1. The owned test file needed no repair. The plan budgeted for one; the reason it did not redden is structural and worth recording.**

`src/app/admin/fields/[entityType]/__tests__/trigger-child-guard.test.ts` passes 16/16 unmodified. Three of its assertions looked like they should break and do not:

- `expect(errorSpy.mock.calls[0]).toHaveLength(1)` (line 77) survives because `log.ts:131` calls `console.error(line)` with exactly one argument. This is a *consequence* of A3's delegate-to-console decision, not a coincidence.
- `expect(message()).toContain("FieldDialog")` (lines 49, 66) survives because `componentName` lands **flat** in the JSON as `"componentName":"FieldDialog"`, and `message()` reads the whole emitted line. The same flat-spread property that makes `level`/`scope`/`msg`/`ts` dangerous is what keeps this assertion green.
- `toContain("asChild")` / `("RSC boundary")` / `("server component")` survive because the message text is unchanged apart from losing its `[${componentName}] ` prefix, and `JSON.stringify` does not escape backticks.

`vi.stubEnv` at line 84 is untouched, as instructed.

**2. Every line number in the plan's site inventory was correct** — all 22, verified before editing. That is a change from 42-10's arithmetic drift; no correction needed here.

**3. Two test files that the plan did not mention read source text of files I own, and neither reddened.** `src/app/import/actions.test.ts:346-351` asserts `not.toContain("evaluateFormula")` / `not.toContain("recalculateFormulas(")` against the raw text of `src/app/import/actions.ts`. My edit introduces neither string. `src/app/admin/users/actions.test.ts` has no console spy and no source assertion. Neither file was edited. Flagging them because a future plan editing `import/actions.ts` will trip over the source-text assertions if it adds a formula call.

**4. No test file outside this plan's ownership reddened.** Full suite is at the exact baseline.

## `not.toContain(<digits>)` flake class — checked, does not apply

Every `not.toContain` in `src/app/import`, `src/app/admin` and `src/actions` was enumerated (10 sites). Two of them assert against a live log line — `trigger-child-guard.test.ts:78-79`, with arguments `"s3cr3t-record-data"` and `"Annual Revenue"`. Neither is a short digit string, so no ISO-8601 `ts` value can ever contain either. The other eight assert against file *source text*, where a timestamp can never appear. **No clock pinning needed, and none was added** — adding `vi.useFakeTimers` here would have been unearned.

## Verification — exact numbers

| Gate | Result |
|---|---|
| `npm test` | **4524 passed / 32 skipped** (162 files passed, 2 skipped) — baseline exactly |
| RSC project | **8 passed / 8** — baseline exactly |
| `npx tsc --noEmit` | **0 errors** |
| `npx next lint` | **0 errors / 0 warnings** |
| `npx eslint src` | **0 errors** / 122 warnings (the worktree number STATE.md predicts; 124 on the main checkout, cause unrelated to this phase) |
| `npx vitest run src/app/import` | 11 passed / 0 failed |
| `npx vitest run src/app/admin src/actions` | 36 passed / 0 failed |
| `trigger-child-guard.test.ts` alone | 16 passed / 0 failed, **unmodified** |

### `console.*` census — eslint `no-console`, non-test source

| | Sites | Files |
|---|---|---|
| Before (merge base `01c92ea`) | **113** | 44 |
| After | **91** | 38 |
| Delta | **−22** | −6 |

113 is the exact number STATE.md records for merged master, so the census method reconciles with the phase's running total before the change as well as after. The file-count delta of 6 equals the six files this plan owns, i.e. every one of them went to zero rather than partially migrating. Running total for the phase: `244 −3 −26 −24 −29 −21 −28 −22 = 91`.

Census used eslint, not grep, per STATE.md. `grep -c` on each of the six files also returns 0, but grep is not the authority for the absolute.

## Deviations from Plan

### Auto-fixed / adjusted

**1. [Rule 2 - correctness of documentation] Corrected the stale doc comment in `trigger-child-guard.ts`**
- **Found during:** Task 2
- **Issue:** Lines 14-15 said *"the message names the component and the boundary only"*. After the migration the component name is a `componentName` **field**, not part of the message, so the comment described something that was no longer true — the same class of stale-comment defect the wave-1 handoff flags around the `Dockerfile:24` citations.
- **Fix:** Reworded to *"the line carries the component name (as the `componentName` field) and the boundary explanation only"*. The T-44-18 reference and the guarantee itself are unchanged, and the test that enforces the guarantee still passes untouched.
- **Files modified:** `src/app/admin/fields/[entityType]/trigger-child-guard.ts`
- **Commit:** `56485b9`
- **Justification:** I own this file, and the wave-1 handoff instructs exactly this ("if you own one of those files, fix its comment as part of your plan and say so in your SUMMARY").

**2. [Cosmetic] Moved the wizard's `log` import one line down and annotated it**
- **Found during:** Task 2
- **Issue:** The insertion point split two adjacent `import type` lines.
- **Fix:** Placed it after both, with a one-line comment: `// Valid in a "use client" file only because \`@/lib/log\` imports nothing at all.` That comment is the plan's own `key_links.via` rationale, recorded where a future reader who is tempted to add a dependency to `log.ts` will see it.
- **Commit:** `56485b9`

### Not deviations, recorded for the orchestrator

- **Base was stale, as predicted.** Worktree HEAD was `286c470`; fast-forwarded to `01c92ea`. That makes it **26 for 26**.
- **No files outside the plan's declared set were touched.** The declared list names a test file (`trigger-child-guard.test.ts`) that turned out not to need editing, so the actual footprint is 6 files, not 7.
- **No `git stash`, no `git clean`, no `npm install`** at any point.

## Threat Flags

None. This plan introduced no new network endpoint, auth path, file-access pattern or schema change. Every migrated line carries strictly a subset of what its predecessor carried, plus the logger's four base fields.

## Interfaces for downstream plans

Scopes now live in the log stream from this plan (7 distinct):

```
audit-import
import/actions
admin/pipelines/actions
admin/users/actions
admin/fields/[entityType]/trigger-child-guard
admin/import/pipedrive-api/pipedrive-api-wizard
actions/user-settings
```

For **42-18**: `admin/fields/[entityType]/trigger-child-guard` is the phase's hardest scope to match — single-quoted, multi-line, and containing both a capital letter and square brackets. It is the best single test case for whatever scope gate 42-18 writes.

Also for **42-18**: `admin/import/pipedrive-api/pipedrive-api-wizard` is a **browser-only** scope. Its line lands in the administrator's devtools console and will never appear in `docker compose logs app`, so a container-log gate must not expect it. It fires in every environment (unlike the trigger guard, which is `NODE_ENV !== 'production'`-gated).

## Self-Check: PASSED

- `src/app/import/actions.ts` — FOUND, 0 console, 8 `{ err`
- `src/app/admin/pipelines/actions.ts` — FOUND, 0 console
- `src/app/admin/users/actions.ts` — FOUND, 0 console
- `src/app/admin/fields/[entityType]/trigger-child-guard.ts` — FOUND, 0 console
- `src/app/admin/import/pipedrive-api/pipedrive-api-wizard.tsx` — FOUND, 0 console, 0 `typeof window`
- `src/actions/user-settings.ts` — FOUND, 0 console
- Commit `d316102` — FOUND in `git log`
- Commit `56485b9` — FOUND in `git log`
- Working tree clean, no deletions in either commit
