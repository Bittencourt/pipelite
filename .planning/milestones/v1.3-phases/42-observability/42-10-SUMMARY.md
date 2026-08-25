---
phase: 42-observability
plan: 10
subsystem: public-rest-api
tags: [structured-logging, migration, OBS-01, api-v1, rest]
requires:
  - "src/lib/log.ts (42-01)"
provides:
  - "29 structured log call sites across all fifteen src/app/api/v1 route files — the public REST surface's error paths"
  - "ten distinct scopes: formula-recalc plus nine path-derived scopes that keep their dynamic segments"
  - "the path-derived scope rule proven on bracketed segments (api/v1/deals/[id], api/v1/trash/[type]/[id]/restore)"
affects:
  - "42-18's repo-wide no-console gate — src/app/api/v1 is now entirely at zero (15 more files off the list)"
  - "any operational query on 'GET /api/v1/x failed' against v1 logs: now \"scope\":\"api/v1/x\" + \"msg\":\"GET failed\""
  - "42-11, 42-14, 42-15 — they apply the same scope rule; the two grep-gate blind spots recorded below will bite them too"
tech-stack:
  added: []
  patterns:
    - "42-PATTERNS.md §5 shape (a) — prefixed console.error in a resolve-rather-than-reject catch"
    - "42-PATTERNS.md §5 shape (b) — unprefixed console.error, scope derived from the module path"
    - "the plan's scope refinement: keep every path segment including dynamic ones, so an item route and its collection route stay distinguishable"
key-files:
  created: []
  modified:
    - src/app/api/v1/deals/route.ts
    - src/app/api/v1/deals/[id]/route.ts
    - src/app/api/v1/deals/batch/route.ts
    - src/app/api/v1/people/route.ts
    - src/app/api/v1/people/[id]/route.ts
    - src/app/api/v1/people/batch/route.ts
    - src/app/api/v1/activities/[id]/route.ts
    - src/app/api/v1/notes/[noteId]/route.ts
    - src/app/api/v1/workflows/route.ts
    - src/app/api/v1/workflows/[id]/route.ts
    - src/app/api/v1/trash/route.ts
    - src/app/api/v1/trash/[type]/[id]/route.ts
    - src/app/api/v1/trash/[type]/[id]/restore/route.ts
    - src/app/api/v1/audit/route.ts
    - src/app/api/v1/docs/route.ts
    - src/app/api/v1/deals/__tests__/formula-recalc.test.ts
    - src/app/api/v1/people/__tests__/formula-recalc.test.ts
decisions:
  - "the formula-recalc / path-derived split is 11 / 18, not the plan's stated 9 / 20 — the plan's own enumerated inventory sums to 11 and 18, and the eslint census agrees; the 29 total is correct, only the two subtotal labels were wrong"
  - "docs/route.ts's message is kept verbatim as 'Failed to load OpenAPI spec' — it never named the route path, so the message rule's path-stripping clause does not apply and the plan's 'VERB failed' shape would have invented a verb the original never printed"
  - "notes/[noteId]'s two result sites carry { err: result.error }, the same narrow string the original console.error's second argument was — the result object with its note row never enters the line"
  - "trash/route.ts:266's three object keys (tab, listed, counted) go flat into ctx unnested and unextended; ctx is NOT wrapped under err because the argument was never an Error"
  - "wrapping follows each site's original: the two people sites that were already multi-line stay wrapped at argument boundaries (42-09's style), the rest stay single-line — zero gratuitous style churn in a 29-site diff"
  - "the two owned route test suites (audit, notes) were NOT edited — all four of their console assertions are toHaveBeenCalled / not.toHaveBeenCalled, which are shape-agnostic and survive the one-argument JSON line untouched"
metrics:
  duration: "~18 min"
  completed: 2026-08-23
  tasks: 2
  commits: 2
  files_modified: 17
---

# Phase 42 Plan 10: Public REST v1 Route Log Migration Summary

All 29 `console.*` call sites across the fifteen `src/app/api/v1` route files now emit structured
JSON. `src/app/api/v1` is at zero non-test `console.*` by eslint. The `formula-recalc` scope survives
verbatim on 11 sites; the other 18 carry a path-derived scope with every dynamic segment intact.

## What was built

**Task 1 — the eleven `formula-recalc` sites, seven route files (commit `09de7ec`).**
The bracket becomes the `scope` field; the message keeps its text minus the prefix and the trailing
colon. Three in-source doc comments that named the bracket prefix as the observable contract now name
the scope field. Six assertions in the two formula-recalc route suites now assert the JSON form.

**Task 2 — the eighteen path-derived sites, nine route files (commit `66f029f`).**
`console.error("GET /api/v1/workflows failed:", error)` becomes
`log.error("api/v1/workflows", "GET failed", { err: error })`. The two owned route test suites needed
no edit.

## Two corrections to the plan's numbers

**1. The formula-recalc / path-derived split is 11 / 18, not 9 / 20.** The plan's `<site_inventory>`
header says "9 sites" and "20 sites", but its own enumerated lists sum to 11 and 18:

| Group | Plan's stated subtotal | Plan's own enumeration | eslint census |
|---|---|---|---|
| `formula-recalc` | 9 | deals 2 + deals/[id] 2 + deals/batch 1 + people 2 + people/[id] 2 + people/batch 1 + activities/[id] 1 = **11** | **11** |
| path-derived | 20 | deals/[id] 3 + notes/[noteId] 4 + workflows 2 + workflows/[id] 3 + trash 2 + trash/[type]/[id] 1 + …/restore 1 + audit 1 + docs 1 = **18** | **18** |
| **total** | **29** | **29** | **29** |

Every individual line number in the inventory was correct — all 29 verified against eslint before any
edit. Only the two subtotal labels were wrong, and they cancel. **The task-1 commit subject says
"nine" because it was written against the plan's label; the true count in that commit is eleven.**
Recorded here rather than rewritten, because amending a non-HEAD commit in a worktree that is about
to be merged is a worse trade than an accurate summary.

**2. Only two of the four sites the plan calls "multi-line" actually are.** The plan marks
`deals/route.ts:65`, `deals/[id]/route.ts:52`, `people/route.ts:62` and `people/[id]/route.ts:48` as
multi-line. The two `deals` sites are single-line 104-character calls; only the two `people` sites are
wrapped. Consequence for the wrapping decision below.

## Site census — reconciled with eslint, both sides

Per STATE.md's instruction, censused with eslint (`no-console` as an error), not grep, excluding
`.test.` / `.spec.` / `__tests__`:

| Measure | Before (base `66f17f7`) | After | Delta |
|---|---|---|---|
| non-test `no-console` sites in `src/` | **191** across 82 files | **162** across 67 files | **−29** |
| non-test `no-console` sites under `src/app/api/v1` | **29** | **0** | **−29** |

The before-figure of 191/82 matches STATE.md's merged-master number exactly, so the two rulers agree.
The file count drops by 15 — exactly the fifteen route files leaving the list, no more and no fewer.
`git diff --stat 66f17f7 HEAD` touches 17 files and deletes none.

Per-file, all fifteen route files at zero and 29 `log.*` sites landed:

| File | sites | scope(s) |
|---|---|---|
| `deals/route.ts` | 2 | `formula-recalc` |
| `deals/[id]/route.ts` | 5 | `formula-recalc` ×2, `api/v1/deals/[id]` ×3 |
| `deals/batch/route.ts` | 1 | `formula-recalc` |
| `people/route.ts` | 2 | `formula-recalc` |
| `people/[id]/route.ts` | 2 | `formula-recalc` |
| `people/batch/route.ts` | 1 | `formula-recalc` |
| `activities/[id]/route.ts` | 1 | `formula-recalc` |
| `notes/[noteId]/route.ts` | 4 | `api/v1/notes/[noteId]` |
| `workflows/route.ts` | 2 | `api/v1/workflows` |
| `workflows/[id]/route.ts` | 3 | `api/v1/workflows/[id]` |
| `trash/route.ts` | 2 | `api/v1/trash` |
| `trash/[type]/[id]/route.ts` | 1 | `api/v1/trash/[type]/[id]` |
| `trash/[type]/[id]/restore/route.ts` | 1 | `api/v1/trash/[type]/[id]/restore` |
| `audit/route.ts` | 1 | `api/v1/audit` |
| `docs/route.ts` | 1 | `api/v1/docs` |
| **total** | **29** | **10 distinct** |

All 29 were `console.error`, so all 29 became `log.error`. No `warn`/`info`/`debug` appears under
`src/app/api/v1`, before or after — no level was silently upgraded or downgraded.

## Observed scope set — exactly ten

Measured with a multi-line-aware matcher (`/\blog\.(debug|info|warn|error)\(\s*"([^"]+)"/`) over every
non-test `.ts` under `src/app/api/v1`:

```
api/v1/audit                       x1
api/v1/deals/[id]                  x3
api/v1/docs                        x1
api/v1/notes/[noteId]              x4
api/v1/trash                       x2
api/v1/trash/[type]/[id]           x1
api/v1/trash/[type]/[id]/restore   x1
api/v1/workflows                   x2
api/v1/workflows/[id]              x3
formula-recalc                     x11
```

Ten scopes, 29 sites, matching the inventory. Dynamic segments preserved throughout:
`api/v1/deals/[id]` not `api/v1/deals`. The plan's spot-check
`grep -c 'log\.error("api/v1/deals/\[id\]"' src/app/api/v1/deals/[id]/route.ts` → **3**. ✓

## The plan's scope gate is worse than the known defect — TWO blind spots, not one

The executor prompt warned that a `grep -oE 'log\.[a-z]+\("[a-z/-]+"'`-style gate is a same-line match
and misses wrapped calls. That is true here, and there is a **second, independent** blind spot the
earlier plans could not have seen because their scopes were all lowercase.

The plan's literal criterion string is
`grep -roE 'log\.[a-z]+\("[a-z0-9/\[\]-]+"' src/app/api/v1/ --include=*.ts`. Measured three ways:

| Gate as run | scopes seen | sites seen | what it missed |
|---|---|---|---|
| the plan's string verbatim | **5 of 10** | 15 of 29 | the char class `[a-z0-9/\[\]-]` is malformed ERE — `\[\]` inside a bracket expression does not mean the two bracket characters, so every bracketed scope vanishes |
| char class repaired to `[]a-z0-9/[-]` | **9 of 10** | 23 of 29 | (a) `api/v1/notes/[noteId]` entirely — the class has no uppercase range and `noteId` contains `I`; (b) the two wrapped `formula-recalc` calls, reported as 9 instead of 11 |
| multi-line-aware `[^"]+` matcher | **10 of 10** | 29 of 29 | nothing |

So the plan's acceptance criterion, even after repairing its regex, would have reported nine scopes and
called a ten-scope result a failure — while simultaneously being unable to see four sites in a file it
claims to gate. **The sites the same-line grep cannot see:** `people/route.ts:63` and
`people/[id]/route.ts:49` (scope on the following line). **The sites the char class cannot see:** all
four in `notes/[noteId]/route.ts` (uppercase `I` in the dynamic segment). Both verified by reading the
diff instead. **For 42-11, 42-14 and 42-15: any scope containing a camelCase dynamic segment —
`[noteId]`, `[entityType]`, `[runId]` — is invisible to a lowercase-only char class.**

## The three special-shape sites — before and after, verbatim

### 1. `trash/route.ts:266` — an object argument, not an Error

Before:

```typescript
      if (!listed.ok || counts === null) {
        console.error("GET /api/v1/trash failed: trash read degraded", {
          tab,
          listed: listed.ok,
          counted: counts !== null,
        })
        return Problems.internalError()
      }
```

After:

```typescript
      if (!listed.ok || counts === null) {
        log.error("api/v1/trash", "GET failed: trash read degraded", {
          tab,
          listed: listed.ok,
          counted: counts !== null,
        })
        return Problems.internalError()
      }
```

The three keys are carried **as-is, flat, unnested and unextended**. The object is deliberately NOT
wrapped under `err` — it never was an `Error`, and wrapping it would have put diagnostic booleans
behind a key whose serializer branch is for exceptions. `tab` is the `parseTrashTab`-validated enum,
which is what the original printed; no key was added and none removed. None of the three collides with
a reserved base field.

### 2 and 3. `notes/[noteId]/route.ts:109` and `:145` — a result, not a caught error

Before:

```typescript
        if (result.error === NOT_FOUND) {
          return Problems.notFound("Note")
        }
        console.error("PATCH /api/v1/notes/[noteId] failed:", result.error)
        return Problems.internalError()
```

After:

```typescript
        if (result.error === NOT_FOUND) {
          return Problems.notFound("Note")
        }
        log.error("api/v1/notes/[noteId]", "PATCH failed", { err: result.error })
        return Problems.internalError()
```

And identically at `:145` with `DELETE`:

```typescript
        console.error("DELETE /api/v1/notes/[noteId] failed:", result.error)
```
→
```typescript
        log.error("api/v1/notes/[noteId]", "DELETE failed", { err: result.error })
```

The original's second argument was already the narrow `result.error` field, not the whole result — so
"carry the field, not the object" required carrying it unchanged rather than narrowing anything. The
`result` object holds the note row (author id, and on the success path the note `content`); **it does
not enter either line.** `result.error` is a string, so `log.ts`'s `serialize` passes it through
untouched and the line reads `"err":"<the same string console printed>"`.

## The fourth site the plan did not flag: `docs/route.ts:28`

The plan describes all twenty path-derived sites as the uniform `"VERB /api/v1/x failed:"` shape.
Nineteen are. `docs/route.ts:28` is not:

```typescript
    console.error("Failed to load OpenAPI spec:", error)
```
→
```typescript
    log.error("api/v1/docs", "Failed to load OpenAPI spec", { err: error })
```

The original never named the route path and never named an HTTP verb, so the message rule's
path-stripping clause has nothing to strip. Applying the plan's `"GET failed"` template here would have
**invented** a verb the original did not print and **discarded** "OpenAPI spec", the only part of the
line that says which read failed. Only the trailing colon was removed. `docs/route.ts`'s
`Cache-Control: public, max-age=3600` and its three CORS headers are byte-identical in the diff, as are
its `OPTIONS` handler and its 500 body — nothing but the import line and the log line changed in that
file.

## The three doc comments that named the bracket prefix

All three were in-source prose asserting the observable contract, invisible to `no-console`, so nothing
mechanical would have caught them going stale:

| file:line | before | after |
|---|---|---|
| `src/app/api/v1/deals/[id]/route.ts:62` | `failure (D-05), logging with the` **`` `[formula-recalc]` prefix ``** `(T-34-17).` | `failure (D-05), logging under the` **`` `formula-recalc` scope ``** `(T-34-17).` |
| `src/app/api/v1/people/route.ts:77` | `Resolves rather than rejects on failure (D-05), logging with the` **`` `[formula-recalc]` prefix ``** `so the failure stays visible rather than swallowed (T-34-17).` | same sentence with **`` logging under the `formula-recalc` scope ``** |
| `src/app/api/v1/people/[id]/route.ts:61` | `failure (D-05), logging with the` **`` `[formula-recalc]` prefix ``** `(T-34-17).` | `failure (D-05), logging under the` **`` `formula-recalc` scope ``** `(T-34-17).` |

The T-34-17 citation and the D-05 resolve-rather-than-reject explanation are intact in all three; only
the six words describing the log form changed. `grep -n '\[formula-recalc\]'` across
`src/app/api/v1/**` now returns nothing (T-42-28: no surface is left describing a string that no longer
exists).

## Redaction (T-42-04) — checked per route, not in aggregate

These are the CRM's **public REST** handlers. Every one of the 29 sites sits in a catch that has the
parsed request body, the resolved actor and often the fetched row in scope, and `withApiAuth` has
already resolved an API key. This is the phase's highest-exposure widening opportunity, so I checked
each route individually.

**Result: at all 29 sites the migrated line carries strictly what the original printed.** No request
body, no API key, no bearer token, no session or actor email, and no validation-error payload entered
any line that did not already contain it. The mechanism is structural rather than a per-line judgement
call: **28 of the 29 sites carry `{ err: <the byte-identical binding that was `console.error`'s second
argument> }` and nothing else at all, and the 29th (`trash/route.ts:266`) carries the three object keys
the original already passed.** There was no interpolated value anywhere in the 29 original strings, so
there was no value to move into ctx and no opportunity to widen — a widening would show up as a diff
anomaly rather than something a reader has to audit line by line.

Per route, the sensitive bindings that were in scope at the catch and are **not** logged:

| Route(s) | In scope at the catch, NOT logged |
|---|---|
| `deals`, `deals/[id]`, `deals/batch` | `parsed.data` (title, value, notes, `custom_fields` blob), `values`, `fallback`, `context.userId`, the fetched deal row |
| `people`, `people/[id]`, `people/batch` | `parsed.data` with `first_name`, `last_name`, **`email`**, **`phone`**, `notes`, `custom_fields` — the most PII-dense body in the API. Message + `err` only |
| `activities/[id]` | `updates.custom_fields`, `updatedActivity`, `owner_id` |
| `notes/[noteId]` | `parsed.data.content` (up to 200 000 chars of user free text), `result.note`, `context.userId`, `noteId` |
| `workflows`, `workflows/[id]` | `parsed.data` triggers and nodes arrays (which carry admin-authored conditions), the workflow row |
| `trash`, `trash/[type]/[id]`, `.../restore` | `viewer` (`{ userId, role }` — the storage-resolved actor), `listed.rows` (trashed record contents), `actor` |
| `audit/route.ts` | the broadest read surface in the phase — `rows` holds former values across every CRM record, plus the parsed filter params. Message + `err` only |
| `docs/route.ts` | `specPath` (an absolute filesystem path). Not logged; only `err` |

The one genuine change in what reaches stdout, inherited from 42-01 and accepted as T-42-29: the
`Error` is now serialized with `name`/`message`/`stack` and a walked `cause` chain instead of
`console.error`'s inspect form. That is the same information, structured. And user-controlled text
arriving via an error's own `message` is now newline-escaped by `JSON.stringify`, so a note body or a
person's name containing a newline can no longer forge a second log record (T-42-05).

## Reserved-key collision check (wave 1's warning)

`ctx` keys land **flat** at the top level, so `level` / `scope` / `msg` / `ts` would silently overwrite
a base field. The complete set of ctx keys this plan introduces across all 29 sites is:

**`err`** (28 sites), **`tab`**, **`listed`**, **`counted`** (1 site).

None of the four reserved names appears anywhere in the diff. Verified over the full two-commit diff:
no `+` line contains `level:`, `scope:`, `msg:` or `ts:`.

## Control flow (T-42-30) — byte-for-byte equivalent

`git diff 66f17f7 HEAD` is 59 insertions / 42 deletions across 17 files, and **every hunk is either an
import line, a log call, one of the three doc-comment sentences, or one of the six test assertions.**
Reviewed against the constraint:

- **Not one `Problems.*` call, `NextResponse.json` status, `NextResponse.json` body,
  `paginatedResponse`, `singleResponse`, `createdResponse` or `noContentResponse` appears on a `+` or
  `-` line.** The public REST contract — every status code and every response shape — is untouched.
- **No `catch` was added, removed, merged, re-nested or converted to a rethrow.** All eleven
  `formula-recalc` catches still resolve rather than reject (D-05): they still `return values`,
  `return fallback`, `return { customFields: fallback, evaluations: 0 }`, or fall through leaving
  `recalculatedCustomFields` at its pre-recalc value. A recalculation failure remains a soft
  degradation, never a 500 on a customer's API call.
- **`notes/[noteId]`'s two `NOT_FOUND` early returns still precede the log call**, so a concurrent soft
  delete still maps to 404 and is still not logged — the `not.toHaveBeenCalled()` assertions in the
  notes suite prove it.
- **`docs/route.ts`'s headers, `OPTIONS` handler and 500 body are unchanged.**
- **`audit/route.ts` still exports only `GET`** (T-36-33); its sibling test asserts the mutating verbs
  are `undefined` and passes.

## Test changes — six assertions, in two files, and nothing else

`src/app/api/v1/deals/__tests__/formula-recalc.test.ts:357,464,545` and
`src/app/api/v1/people/__tests__/formula-recalc.test.ts:344,443,523`:

```diff
-    expect(String(errorSpy.mock.calls[0][0])).toContain("[formula-recalc]")
+    expect(String(errorSpy.mock.calls[0][0])).toContain('"scope":"formula-recalc"')
```

`calls[0][0]` is now the whole single-argument JSON line, so the assertion matches on the scope field
rather than the bracket. `grep -c '"scope":"formula-recalc"'` → **3** in each file;
`grep -c '\[formula-recalc\]'` → **0** in each. The diff on those two files is exactly six lines and
nothing else — **every `invocationCallOrder` comparison (3 per file) and every emitted-payload
assertion is untouched**, which is what T-42-30 relies on as the regression detector.

**The two other owned test files were NOT edited.** `audit/__tests__/route.test.ts:356` and
`notes/__tests__/route.test.ts:369,378,387` hold four console assertions and all four are
`toHaveBeenCalled` / `not.toHaveBeenCalled` — shape-agnostic, satisfied identically by a one-argument
JSON line. They pass unchanged (20/20 and 24/24). Nothing reddened, so nothing was repaired.

**No test file outside this plan's four owned files reddened.** The full suite is at its exact
baseline, so there is nothing to report to a sibling plan.

## A premise I grepped rather than trusted

Per the executor brief, the plan's `<owned_test_files>` claim that "these routes bypass the mutation
layer entirely" was treated as unverified. It holds for the formula-recalc paths — but note that
`notes/[noteId]/route.ts` **does** call the mutation layer (`updateNoteMutation`,
`softDeleteNoteMutation` from `@/lib/mutations/notes`, which plan 08 migrated). That does not create a
collision: plan 08 changed `notes.ts`'s own log lines, this plan changed the route's, and the notes
route suite's assertions are call-count-only so they cannot be perturbed by either. The full suite
confirms it: 4524 passed, identical to the pre-change baseline.

## `src/lib/api/` — inspected, deliberately not touched

Sibling 42-11 owns `src/lib/api/`. Every one of the fifteen routes imports from it
(`auth.ts`, `errors.ts`, `response.ts`, `serialize.ts`, `pagination.ts`, `expand.ts`), and all 29 sites
route their failure through `Problems.internalError()` from `@/lib/api/errors`. **No file under
`src/lib/api/` was read for modification or changed, and nothing in it needs changing on this plan's
account** — the migration is entirely at the call sites. One observation to hand forward rather than
act on: `withApiAuth` in `src/lib/api/auth.ts` wraps all 29 of these catches, so if 42-11 gives it a
scope it should be `api/auth` or similar and not any of this plan's ten, or the two will interleave in
the same request's log stream under one name. No change requested; recorded for 42-11's judgement.

## Deviations from Plan

Three plan-text corrections, no auto-fixes. No bug, no missing critical functionality and no blocker
was found in the seventeen files. No architectural question arose, so no Rule 4 checkpoint.

1. **[inventory label] The formula-recalc / path-derived subtotals are 11 / 18, not 9 / 20.** The
   plan's own enumeration and the eslint census both say 11 / 18; the 29 total is unaffected. The
   task-1 commit subject inherited the wrong label and says "nine".
2. **[inventory attribute] `deals/route.ts:65` and `deals/[id]/route.ts:52` are single-line**, not
   multi-line as the plan states. Only the two `people` sites are wrapped. Consequence: I preserved
   each site's original wrapping instead of collapsing the two `people` calls as the plan's action text
   directs — collapsed they are 108 characters against a 107-character file maximum, i.e. at the
   ceiling, which is the identical situation 42-08 and 42-09 both resolved by wrapping at argument
   boundaries. Following their style rather than inventing a third.
3. **[message rule] `docs/route.ts:28` does not fit the uniform shape** the plan describes for all
   twenty path-derived sites; its message is kept verbatim minus the colon. Rationale above.

Nothing was auto-fixed under Rules 1-3 because nothing was broken. No `deferred-items.md` entry was
needed — no out-of-scope discovery, and none of the five stale `Dockerfile:24` comments from wave 1
lives in a file this plan owns.

## Known Stubs

None. No hardcoded empty value, placeholder string, TODO or unwired data path was introduced; every
change is a one-for-one call-site replacement.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern or schema change at a trust boundary was
introduced. Fifteen route handlers were modified and not one gained, lost or altered a status code,
response body, header, auth wrapper or catch boundary — `withApiAuth` still wraps every handler it
wrapped before, `audit/route.ts` still exports `GET` alone, and `trash/[type]/[id]` DELETE is still
admin-only.

## Verification — exact numbers

| Check | Result |
|---|---|
| `npx vitest run src/app/api/v1/deals src/app/api/v1/people src/app/api/v1/activities` (after task 1) | **39 passed / 0 failed** (2 files) |
| `npx vitest run src/app/api/v1` (after task 2) | **98 passed / 0 failed** (6 files) |
| `npm test` — unit project | **4524 passed / 32 skipped / 0 failed**, 162 files passed / 2 skipped |
| `npm test` — RSC project | **8 passed / 0 failed** |
| `npx tsc --noEmit` | **0 errors** |
| `npm run lint` (full repo) | **0 errors** / 122 warnings |
| `npx eslint` on the changed v1 directories | **0 errors**, 13 warnings (all pre-existing `no-unused-vars` on imports this plan did not touch) |
| non-test `no-console` in `src/` (eslint) | 191 → **162** (**−29**) |
| non-test `no-console` under `src/app/api/v1` | 29 → **0** |
| distinct scopes under `src/app/api/v1` | **10**, as specified |
| file deletions in either commit | **none** |

Baseline preserved exactly: 4524 / 32 skipped, RSC 8/8, typecheck 0, lint 0 errors. Warning total is
reported as **122**, the in-worktree figure; STATE.md records 124 on the main checkout for reasons
unrelated to this phase, which is why the gate is on errors.

## Commits

| Commit | Subject | Files |
|---|---|---|
| `09de7ec` | `refactor(42-10): migrate the nine v1 formula-recalc log sites to structured JSON` (actual count: eleven) | 7 routes + 2 test files |
| `66f029f` | `refactor(42-10): migrate the eighteen path-derived v1 route log sites` | 9 routes |

Worktree base corrected `286c470` → `66f17f7` via `git merge --ff-only` before any work — stale for the
22nd consecutive time.

## Self-Check: PASSED

- `.planning/phases/42-observability/42-10-SUMMARY.md` — FOUND
- All 17 modified files — FOUND (verified via `git diff --stat 66f17f7 HEAD`, no deletions)
- Commit `09de7ec` — FOUND in `git log --all`
- Commit `66f029f` — FOUND in `git log --all`
- Reserved-key claim verified mechanically: 59 added lines across both commits, **0** matching
  `\b(level|scope|msg|ts)\s*:`, and exactly **28** containing `{ err:` — matching the 28/1 ctx split
  claimed above.
- Nothing under `src/lib/api/` modified; no file outside the plan's declared list touched.
- `STATE.md` and `ROADMAP.md` deliberately NOT modified — the orchestrator owns those writes.
</content>
</invoke>
