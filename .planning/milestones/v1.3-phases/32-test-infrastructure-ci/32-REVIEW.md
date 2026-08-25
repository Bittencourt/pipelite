---
phase: 32-test-infrastructure-ci
reviewed: 2026-08-14T14:14:50Z
depth: deep
diff_range: 12ba1438d71bb1f1a451da3c2778b02583f97817..b93675d1141122b97106e3b90c96933a14e0ce5c
files_reviewed: 24
files_reviewed_list:
  - .github/workflows/ci.yml
  - package.json
  - vitest.config.ts
  - src/lib/formula-engine.ts
  - src/lib/mutations/workflows.test.ts
  - src/lib/execution/recursion.test.ts
  - src/lib/execution/toggle.test.ts
  - src/lib/import/pipedrive-api-transformers.ts
  - src/app/api/v1/activities/route.ts
  - src/app/api/v1/activities/[id]/route.ts
  - src/app/api/v1/pipelines/route.ts
  - src/app/api/v1/pipelines/[id]/route.ts
  - src/app/api/v1/stages/route.ts
  - src/app/api/v1/stages/[id]/route.ts
  - src/app/api/v1/workflows/__tests__/runs-routes.test.ts
  - src/app/(auth)/reset-password/page.tsx
  - src/app/(auth)/verify-email/page.tsx
  - src/app/activities/activity-list.tsx
  - src/app/admin/pipelines/[id]/stage-configurator.tsx
  - src/app/deals/deal-card.tsx
  - src/app/import/import-wizard.tsx
  - src/app/settings/profile/profile-settings-form.tsx
  - src/components/custom-fields/formula-editor.tsx
  - src/components/ui/relative-time.tsx
findings:
  critical: 0
  high: 1
  medium: 1
  low: 6
  total: 8
status: fixes_applied
fix_pass:
  applied: 2026-08-14
  fixed: 7
  deferred: 1
  gates: "tsc 0, eslint 0 errors, vitest 41 files / 461 passed / 4 skipped"
---

# Phase 32: Code Review Report

**Reviewed:** 2026-08-14T14:14:50Z
**Depth:** deep (cross-file: type derivation chains, hook consumers, CI/tooling posture)
**Files reviewed:** 24 (source only; `.planning/` excluded)
**Status:** findings_found

## Summary

Phase 32's tooling work (vitest scoping, npm scripts, CI workflow) is solid and I could not
break it: `configDefaults.exclude` genuinely preserves `**/node_modules/**` protection
(verified: vitest 4.0.18 resolves it to `["**/node_modules/**","**/.git/**"]`), the new
`include: ['src/**/…']` drops **zero** currently tracked test files (41 tracked `*.test.*`
files, all under `src/`, and 41 files collected), and the whole suite passes in a scrubbed
environment (`env -i` with no `DATABASE_URL`/`.env.local`), so CI parity holds. `tsc --noEmit`,
`eslint`, and `vitest run` all exit 0 as claimed. No injection, no `github.event.*`
interpolation into `run:`, no secrets, no over-broad `permissions:` in the workflow.

The six v1 API route retypings are also better than "`any` renamed". I verified the derived
`…With` types are actually strict — `const x: ActivityWith = { notARelation: true }` is
rejected by `tsc` (TS2353) — so a mistyped relation key now fails the build. Every
authorization property access I traced is semantically correct against the schema:
`Parameters<typeof serializePipeline>[0]` resolves to `typeof pipelines.$inferSelect`, which
really does carry `ownerId` (notNull) and `deletedAt`, so `stage.pipeline.ownerId !== userId ||
stage.pipeline.deletedAt` at `stages/[id]/route.ts:46,74` still guards what it guarded before.
The `owner?: { id; name: string | null; email: string }` shapes match `users` (`email` notNull,
`name` nullable). No new instance of the known `expand=pipeline` 403 pattern was introduced.
The 8 JSX quote escapes are all in JSX *text children* — `&quot;` renders identically; no
markup was restructured.

The real defect is in `formula-engine.ts`. The fix is directionally right (it repaired a
genuinely dead `usesNullSafeFunction()` call and made `LOGIC.isBlank({{Null}})` work), but the
carve-out is applied to the **whole expression** instead of to the null field's use site, so
any formula that mixes a null-safe function with arithmetic now silently coerces `null` to `0`
where it previously returned blank. I reproduced this against the built module. The deleted
`containsArithmeticOperation` helper was indeed unreachable code, but it was also the only
artifact of the intended narrowing — deleting it removed the guard rail that would have
prevented exactly this regression.

One React Compiler suppression (import-wizard) papers over a real stale closure, and its
stated reason is factually false. Two more suppression reasons contain false causal claims.

---

## HIGH

### H-01: Null propagation is disabled for the entire expression, so mixed formulas silently turn `null` into `0`

**File:** `src/lib/formula-engine.ts:120` (hoisted `usesNullSafe`), applied at `:135`, `:146`, `:149`

**Issue:** `usesNullSafeFunction()` is a regex scan over the **raw expression string**. If any
`LOGIC.if|and|or|isBlank|isNumber` or `TEXT.*` call appears *anywhere* in the formula, all three
null early-returns are skipped for *every* referenced field — including fields used only in
arithmetic. `null` then reaches the QuickJS sandbox, where JS coerces it to `0`, and the
wrapper at `:216` only returns `null` when the *final* result is nullish. Before this phase the
early return was unconditional, so these formulas returned blank.

Reproduced against the current module (vitest, real QuickJS):

| Expression | `fieldValues` | Before Phase 32 | Now |
| --- | --- | --- | --- |
| `{{Price}} - {{Discount}} + TEXT.len({{Name}})` | `Price: null, Discount: 10, Name: 'ab'` | `null` | **`-8`** |
| `LOGIC.if(LOGIC.isBlank({{Discount}}), {{Price}}, {{Price}} - {{Discount}})` | `Price: null, Discount: 10` | `null` | **`-10`** |
| `TEXT.upper({{Org.Rev}}) + {{Org.Rev2}} * 2` | `Org: { Rev: 'x', Rev2: null }` | `null` | **`'X0'`** |
| `{{A}} + " LOGIC.if("` (literal trips the scan) | `A: null` | `null` | **`'null LOGIC.if('`** |

Failure scenario: a formula custom field such as
`LOGIC.if(LOGIC.isBlank({{Discount}}), {{Value}}, {{Value}} - {{Discount}})` on a deal whose
`Value` has not been filled in now renders and persists `-10` (a plausible-looking money
figure) instead of blank. There is no test covering any mixed expression — the suite only
covers pure arithmetic (`:42`) or pure null-safe calls (`:107`), so nothing catches this.
`{{Value}} * 2` with a null `Value` still correctly returns `null` (confirmed), which makes the
inconsistency harder to notice.

The three **error** returns (`:130` unknown entity, `:133` field-not-found on entity, `:144`
unknown field) are correctly left ungated — confirmed by probe: `LOGIC.isBlank({{Org.Rev}})`
with no `Org` still returns `error: 'Unknown entity: Org'`, and `LOGIC.isBlank({{Nope}})` still
returns `error: 'Unknown field: Nope'`.

**Fix (minimal, restores the intent the deleted helper encoded):** re-introduce the arithmetic
check and require *both* conditions to skip null propagation, then cover it with a test.

```ts
// restore next to usesNullSafeFunction()
function containsArithmeticOperation(expression: string): boolean {
  const withoutStrings = expression.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '')
  return /[+\-*/]/.test(withoutStrings.replace(/[<>=!]=?/g, ''))
}

const usesNullSafe = usesNullSafeFunction(expression)
const hasArithmetic = containsArithmeticOperation(expression)
// null short-circuits unless the expression is purely null-safe
const propagateNull = hasArithmetic || !usesNullSafe
// ... then at :135 / :146 / :149
if (entityData[field.trim()] === null && propagateNull) return { value: null, error: null }
```

Verified this keeps every current test green in principle: `LOGIC.isBlank({{V}})`,
`TEXT.concat({{A}}, {{B}})`, and `LOGIC.if({{Score}} > 100, "High", "Low")` contain no
`+ - * /` after string/comparison stripping, so they still reach the sandbox; the four rows in
the table above regain `null`. Also strip single-quoted literals (the original helper only
stripped double-quoted ones), and add regression tests for at least rows 1 and 2.

**Structural fix (preferred, larger):** drop the pre-pass string heuristic entirely and
propagate null inside the sandbox at the operator level (e.g. rewrite `a + b` through a helper
that returns `null` when either operand is `null`). The current design cannot distinguish
"null used as a `LOGIC.isBlank` argument" from "null used as an arithmetic operand" because it
never looks at *where* the field reference occurs.

---

## MEDIUM

### M-01: `preserve-manual-memoization` suppression hides a real stale closure, and its stated reason is false

**File:** `src/app/import/import-wizard.tsx:91` (suppression), `:92`–`:159` (`handleMappingNext`), `:99` (stale read), `:159` (deps)

**Issue:** `handleMappingNext` reads `customFieldTypes` (line 99) but its dependency array is
`[rawData, mapping, entityType]` (line 159). `customFieldTypes` is a `useMemo` over
`[customFieldsByEntity, entityType]` (`:83`–`:89`). When `customFieldsByEntity` changes
identity/content while `entityType` stays the same — e.g. a `router.refresh()` or any parent
re-render of the server component that supplies the prop — `useCallback` returns the **old**
closure holding the **old** `customFieldTypes` map. The `multi_select` coercion loop at
`:99`–`:110` then uses stale field types: a newly-added `multi_select` custom field is stored
as the raw comma-separated string instead of `string[]`, which is then written to the DB by the
import. That is exactly the dependency the React Compiler is reporting.

The suppression's justification is factually wrong: "Adding it re-creates this callback whenever
`customFieldsByEntity` changes identity, which re-runs mapping/validation and can push the
wizard back to the preview step mid-edit." Re-creating a `useCallback` identity does not invoke
it. `handleMappingNext` has exactly one consumer — `onNext={handleMappingNext}`
(`import-wizard.tsx:271`) — and `MappingStep` uses it only as `onClick={onNext}`
(`src/app/import/steps/mapping-step.tsx:56`). It is never in any effect's dependency array
(grepped: no other reference in `src/`), so no identity change can trigger a step transition.
The safe fix the reason rules out is the correct one.

**Fix:**

```ts
  }, [rawData, mapping, entityType, customFieldTypes])
```

and delete the `eslint-disable-next-line` at line 91. Note this one is *not* covered by
decision D-02's "suppress, fix later" carve-out in the same way as the four state/immutability
ones: the underlying warning is a genuine correctness bug with a one-line, zero-risk fix.

---

## LOW

### L-01: Two suppression reasons assert causal claims that are false

**Files:** `src/app/(auth)/reset-password/page.tsx:42`, `src/app/(auth)/verify-email/page.tsx:20`

**Issue:** Both reasons are load-bearing documentation (they are the record of why the
suppression is acceptable), and both contain a false statement that would mislead whoever picks
up backlog 999.13:

- reset-password: "the 'invalid reset link' state **cannot be computed during render** without
  breaking the Suspense boundary this page is wrapped in." It can — `token` is already read
  during render at line 27 (`searchParams.get("token")`) and used in render-path code at line
  49. Deriving `status === "error"` from `!token` at render adds no new Suspense interaction.
  The *rest* of the reason (reworking the four-way `status` union with no UI coverage) is valid
  and sufficient on its own.
- verify-email: "**Hoisting it above the effect or wrapping it in `useCallback` changes the
  identity semantics** of a fetch that must fire exactly once per token — a double-fire would
  consume the single-use verification token." Moving the `const verifyEmail = async …`
  declaration (line 25) above the effect does not touch the effect's dependency array
  (`[token]`, line 23), so it cannot change how many times the fetch fires. The honest reason
  is the one that follows: no email-verification test coverage.

**Fix:** trim each reason to the claim that is actually true (missing UI/e2e coverage for the
auth flows), so the deferral rationale survives scrutiny when 999.13 is picked up.

### L-02: CI actions are pinned to mutable major tags while the header comment documents exact versions

**File:** `.github/workflows/ci.yml:4`–`:6`, `:38`, `:40`

**Issue:** The header records "Action versions confirmed live against the GitHub API on
2026-08-13: actions/checkout v7.0.1, actions/setup-node v7.0.0", but the steps use `@v7` — a
mutable tag that the action owner can re-point at any commit. The comment therefore documents a
pin that does not exist, which is worse than no comment: a reviewer reading it will believe the
build is reproducible. Blast radius today is limited (`permissions: contents: read`, no
secrets, `pull_request` not `pull_request_target`), so this is LOW, not HIGH.

Related, same step: `actions/checkout` defaults to `persist-credentials: true`, leaving the
`GITHUB_TOKEN` in `.git/config` while `npm ci` (line 53) executes third-party `postinstall`
lifecycle scripts in the same job.

**Fix:**

```yaml
      - uses: actions/checkout@<full-40-char-sha>  # v7.0.1
        with:
          persist-credentials: false

      - uses: actions/setup-node@<full-40-char-sha>  # v7.0.0
```

### L-03: The new cascade-delete test asserts only a call count, so it cannot catch the FK-order regression it exists to guard

**File:** `src/lib/mutations/workflows.test.ts:465`–`:481`

**Issue:** `deleteWorkflow` must delete in the order steps → runs → workflow
(`src/lib/mutations/workflows.ts:208`–`:212`) or Postgres rejects the run delete on the
`workflowRunSteps.runId` FK. The test asserts only
`expect(mockDb.delete).toHaveBeenCalledTimes(3)` and the comment `// steps -> runs -> workflow`.
Swapping lines 208 and 209 — the exact regression that would break production — still produces
3 calls and a green test. `const deleteWhere = vi.fn()…` (line 473) is captured and never
asserted (dead variable), and the `inArray(runIds)` cascade (which must cover **both** run ids,
not just the first) is unverified.

**Fix:** assert the table arguments and their order, and the run-id set:

```ts
import { workflowRuns, workflowRunSteps, workflows } from "@/db/schema"
// ...
expect(mockDb.delete.mock.calls.map(c => c[0])).toEqual([
  workflowRunSteps, workflowRuns, workflows,
])
expect(deleteWhere).toHaveBeenCalledTimes(3)
```

### L-04: Relation shapes in the new `…Expanded` types are hand-written instead of derived from the schema

**Files:** `src/app/api/v1/activities/route.ts:34`, `src/app/api/v1/activities/[id]/route.ts:39`, `src/app/api/v1/pipelines/route.ts:24`, `src/app/api/v1/pipelines/[id]/route.ts:27`; also `stages/[id]/route.ts:30`

**Issue:** `owner?: { id: string; name: string | null; email: string } | null` is a literal
restatement of three `users` columns rather than a projection of `typeof users.$inferSelect`.
It happens to be correct today (verified against `src/db/schema/users.ts`: `email` notNull,
`name` nullable), but it is not anchored: rename `users.name` and `tsc` stays green while the
API silently emits `name: undefined` for `?expand=owner`. Unlike `withOptions` — where the
derived `…With` type *does* fail the build on a bad relation key (verified) — nothing links
these payload shapes to the schema. These six files have no test coverage, so `tsc` is the only
safety net and this is precisely the hole in it.

Separately, `stages/[id]/route.ts:30` routes the **authorization-critical** pipeline type
through a *serializer's* signature (`Parameters<typeof serializePipeline>[0]`). It resolves to
`typeof pipelines.$inferSelect` today, so `ownerId`/`deletedAt` are real — but narrowing
`serializePipeline` to a `Pick<>` later would silently reshape the type used by the ownership
check at `:46`/`:74`. Auth-relevant types should not depend on a presentation function.

**Fix:**

```ts
import { users } from "@/db/schema"
type ExpandedOwner = Pick<typeof users.$inferSelect, "id" | "name" | "email">
// stages/[id]/route.ts
type StageExpanded = typeof stages.$inferSelect & {
  pipeline?: typeof pipelines.$inferSelect | null
}
```

### L-05: Casts inside the serialize calls are now no-ops that will absorb future type errors

**Files:** `src/app/api/v1/activities/[id]/route.ts:102`–`:104`, `src/app/api/v1/activities/route.ts:106`–`:108`, `src/app/api/v1/stages/[id]/route.ts:81`, `src/app/api/v1/stages/route.ts:100`

**Issue:** `serializeDeal(activity.deal as Parameters<typeof serializeDeal>[0])` and
`serializePipeline(stage.pipeline as Parameters<typeof serializePipeline>[0])` were needed when
the row was `any`. Now that `ActivityExpanded.deal` / `StageExpanded.pipeline` are declared as
exactly those types, the assertions are redundant — and they will keep compiling (silently) if
the declared relation type and the serializer parameter ever diverge, which defeats the point
of the phase. Phase 32 removed the `no-explicit-any` disables but left the casts that made them
necessary.

**Fix:** drop the `as …` in all four call sites: `serializeDeal(activity.deal)`,
`serializePipeline(stage.pipeline)`.

### L-06: `let` → `const` cemented a hardcoded value under a comment that promises logic

**File:** `src/lib/import/pipedrive-api-transformers.ts:164`–`:167`

**Issue:** The comment says "Determine stage type based on `rotten_flag` and
`deal_probability`", but the line is now `const type: "open" | "won" | "lost" = "open"`. The
`let` was the last hint that the branch was unimplemented; making it `const` turns an
in-progress placeholder into what reads like a decision. Every Pipedrive-imported stage becomes
`open`, including the customer's won/lost stages. Not a Phase 32 behaviour change (the value was
already always `"open"`), but the phase removed the marker.

**Fix:** inline the literal and make the gap explicit, e.g.
`type: "open", // TODO(999.x): map Pipedrive won/lost stages; wizard currently handles terminal stages manually`
— and drop the misleading "Determine stage type based on…" comment, or open a backlog item.

---

## Verified clean (adversarial checks that found nothing)

- **`vitest.config.ts`** — `configDefaults.exclude` resolves to
  `["**/node_modules/**","**/.git/**"]` in the installed vitest 4.0.18, so the spread genuinely
  preserves node_modules protection; the added `'**/.next/**'` is redundant given the `src/`
  anchor but harmless. 41 tracked `*.{test,spec}.*` files exist, all under `src/`, and 41 files
  are collected — no test was silently dropped from the gate. (Residual nit, not a finding: a
  future test placed outside `src/` will be ignored with no error.)
- **CI environment parity** — the full suite passes under `env -i` with no `.env.local` and no
  `DATABASE_URL`, so the CI job will not fail for missing env or need a database.
- **CI injection/permission posture** — no `github.event.*` interpolation into any `run:`; the
  only expression is `github.ref` inside `concurrency.group`; `permissions: contents: read` is
  minimal; `pull_request` (not `pull_request_target`); `if: ${{ !cancelled() }}` behaves as the
  comment claims (steps skip on cancellation, all three gates report otherwise).
- **v1 route authorization** — `pipelines/[id]` (`:53`, `:90`, `:157`), `pipelines` list
  (`:35`), `stages` list (`:41`–`:48`, `:69`–`:81`, `:84`–`:93`) and `verifyStageOwnership`
  (`stages/[id]:34`–`:51`) all still check `ownerId`/`deletedAt` against the real schema
  columns. The retyping changed no control flow: `expand.size > 0 ? {…spreads} : undefined`
  produces the same object (including the same `with: {}` for an unrecognised `expand` value) as
  the old imperative `any` build-up. `organization: expand.has("deal")` → `true as const` is
  equivalent because it was already inside the `expand.has("deal")` branch.
- **Known `stages/[id]` 403 bug (backlog 999.15)** — unchanged and not duplicated; no second
  instance of the pattern was introduced.
- **JSX escapes** — all 8 replacements are in JSX text children (`AlertDialogDescription`, plain
  `div` text); `&quot;` renders as `"`. Rendered output is byte-identical.
- **`relative-time.tsx:17` and `profile-settings-form.tsx:38` suppression reasons** — accurate
  descriptions of the hydration guard and the prop-resync pattern respectively.
- **Test-mock typings** (`recursion.test.ts`, `toggle.test.ts`, `runs-routes.test.ts`) — the
  `vi.fn<(table?: unknown) => …>` signatures removed `as any` without weakening any assertion;
  the `import type { ApiAuthContext }` comment is correct (type-only, erased, does not
  un-mock `@/lib/api/auth`).
- **`workflows.test.ts` stub leakage** — the `mockDb.select.mockReturnValue` set inside the two
  `deleteWorkflow` tests does persist past `vi.clearAllMocks()`, as the new comment states, but
  every later test that uses `select` (`listWorkflows`, `:520`, `:537`) installs its own stub,
  so no order-dependent failure exists today.

## Pre-existing, out of diff scope (not Phase 32 findings — recommend backlog)

Recorded because the phase edited these files and future readers may assume they were
reviewed as part of it:

1. **`src/app/api/v1/activities/[id]/route.ts` GET/PUT/DELETE and
   `src/app/api/v1/activities/route.ts` GET perform no ownership check at all** — any valid API
   key can read (`:80`–`:116`), modify (`:126`–`:216`, including reassigning `owner_id`) or soft
   delete (`:226`–`:237`) *any* user's activity by id, and the list endpoint returns every
   user's activities. Compare `pipelines/[id]` which does check `ownerId`. This is an IDOR and
   predates Phase 32 (the diff only retyped `withOptions`), but it is more severe than anything
   found in the phase itself and is not among the recorded/accepted items.
2. **`src/app/api/v1/stages/route.ts:73`** — `sql\`${pipelines.id} IN ${pipelineIds}\`` passes a
   JS array into a raw `sql` fragment instead of using `inArray()`; unreachable with an empty
   array today (guarded by `stageList` being non-empty) but fragile.

---

## Fix pass (2026-08-14)

7 of 8 findings fixed, one deferred. All three gates green after every commit:
`tsc --noEmit` exit 0, `eslint` 0 errors (warnings 130 -> 128), `vitest run` 41 files /
461 passed / 4 skipped (was 455 passed; +6 formula-engine regression tests).

| Finding | Disposition | Commit |
| --- | --- | --- |
| H-01 | Fixed — narrowed **per field reference**, not per expression | `ec4e974` |
| M-01 | Fixed — dep added, suppression removed | `9ba04e6` |
| L-01 | Fixed — both false claims rewritten | `052af66` |
| L-03 | Fixed — asserts table order + run-id set | `5b1aaee` |
| L-05 | Fixed — all 8 redundant casts dropped | `011fc2c` |
| L-04 | Fixed — `Pick<typeof users.$inferSelect, …>`; stage pipeline decoupled from serializer | `b51398d` |
| L-02 | Fixed — SHA pins + `persist-credentials: false` | `bca6da0` |
| L-06 | **Deferred** — hardcoded `"open"` is a product decision (Pipedrive won/lost stage mapping), not a Phase 32 regression. Belongs in a backlog item alongside the import wizard's terminal-stage handling. | — |

### H-01: departure from the suggested fix

The review proposed `propagateNull = hasArithmetic || !usesNullSafe` — a whole-expression
arithmetic scan. Implemented a narrower rule instead: **each `{{Field}}` reference** is
classified by looking at the nearest non-whitespace character on either side of every
occurrence of that reference (string literals stripped first). A null value short-circuits to
blank unless every use of that specific reference is null-safe.

Why: the whole-expression version still lets arithmetic on *field A* disable the null-safe
carve-out for *field B*. `LOGIC.if(LOGIC.isBlank({{Value}}), "blank", {{Count}} * 2)` with a
null `Value` would return blank under the suggested fix, when `LOGIC.isBlank` is explicitly
designed to receive the null (that is the CI-03 behaviour this phase added). Per-reference
gets both this case and all four reproduction rows right. Adjacency deliberately does not
look past a `)`, so `TEXT.len({{A}}) + 1` counts as a null-safe use of `{{A}}` while
`{{A}} - {{B}}` does not.

Where the reference is used in *both* a null-safe and an arithmetic position (row 2 of the
reproduction table), null still wins. That is the safe failure mode: blank rather than a
fabricated number. The review's "structural fix" (operator-level propagation inside the
sandbox) remains the only way to resolve that case exactly, and is still the right larger
change.

Regression tests added in `formula-engine.test.ts` cover all four reproduction rows (each
verified to fail with `-8` / `-10` / `'X0'` / `'null LOGIC.if('` against the pre-fix source),
plus guards that `LOGIC.isBlank({{Null}})` still returns `true`, that per-reference narrowing
holds when arithmetic touches a different field, and that unknown-entity/unknown-field errors
still take precedence over null propagation.

### Notes on the other fixes

- **L-03** verified adversarially: swapping the two deletes in `deleteWorkflow` now fails the
  test (it did not before).
- **L-04/L-05** verified adversarially: renaming `users.name` now breaks the build in all four
  routes, and narrowing `StageExpanded.pipeline` to a `Pick<>` now raises TS2345 at the
  serialize call. Neither cascaded — `tsc` stayed at 0 errors.
- **L-02** SHAs were resolved from the GitHub API and match what `v7` pointed at on
  2026-08-14, so the pin is behaviour-preserving.
- The two **pre-existing, out-of-scope** items (v1 activities IDOR, `sql` fragment in
  `stages/route.ts:73`) were deliberately not touched — they are being tracked as backlog.

---

_Reviewed: 2026-08-14T14:14:50Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
_Fix pass: 2026-08-14 (7 fixed, 1 deferred)_
