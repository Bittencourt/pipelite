---
phase: 44-custom-field-ui-repair
verified: 2026-08-15T17:21:07Z
status: passed
score: 7/7 must-haves verified
overrides_applied: 0
---

# Phase 44: Custom Field UI Repair Verification Report

**Phase Goal:** An admin can create a custom field on any entity — Deals included — and a formula's displayed value always agrees with its stored value.
**Verified:** 2026-08-15T17:21:07Z
**Status:** passed
**Re-verification:** No — initial verification

## Method

This verification did not take `44-09-SUMMARY.md` (the orchestrator's own browser checkpoint
report) at face value. Independent evidence was gathered directly against the running container
and the live 155/8/6-definition dataset:

- Read every changed source file in the phase's commit range (`114e2b1~1..19753ca`) directly,
  not through plan/summary prose.
- Forged a read-only admin session cookie (same technique `44-RESEARCH.md` used) and `curl`'d
  the server-rendered HTML of `/admin/fields/{deal,person,organization,activity}` on the live
  container, independent of anything the phase's own test suite asserts.
- Created a temporary `GSD`-prefixed formula field pair and a temporary person, and drove
  `POST /api/custom-fields/save` directly (not through vitest, not mocked) to observe the real
  recalculation contract, then deleted all of it and confirmed the baseline (155/8/6, zero
  `GSD*`) was restored.
- Ran `npx vitest run` (both projects), `npx tsc --noEmit`, and `npx eslint .` myself rather than
  trusting the reported numbers.
- Confirmed zero `package.json`/lockfile diff across the phase's commit range.

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | "Add Field" trigger renders on `/admin/fields/deal` (155 defs), admin can create a field there | ✓ VERIFIED | Live `curl` with forged admin cookie against the running container: server HTML for `/admin/fields/deal` contains `<button>…Add Field</button>` with the Plus-icon SVG, at the real 155-definition count. `44-09-SUMMARY.md` additionally reports an interactive create (`GSD Temp Text`) confirmed in Postgres — consistent with the mechanism verified here. |
| 2 | Trigger still renders on person/organization/activity; formula editor field-chips still work on all four | ✓ VERIFIED | Live `curl`: all three other entity pages render exactly one "Add Field" match each. `field-dialog.tsx:277-296` renders the chip list unconditionally from `availableFields`, unchanged in shape by the projection (D-44-02); the click-to-insert logic (`insertFieldReference`) was not touched by any plan. |
| 3 | After editing a formula's source field on a freshly loaded record page, rendered value equals the stored Postgres value, with no reload | ✓ VERIFIED | Live, not mocked: created a temp person + `GSD Base Value`/`GSD Doubled` formula, POSTed `{"GSD Base Value":3}` to `/api/custom-fields/save` on the running container — response was `{"success":true,"values":{"GSD Base Value":3,"GSD Doubled":{"formula":true,"value":6,"error":null}}}`, and `SELECT custom_fields FROM people` showed the byte-identical wrapper. Repeated with base=21 → both API response and DB showed `value:42`. `custom-fields-section.tsx:66-73` replaces (not merges) `localValues` with this same `result.values`, so `formula-field.tsx`'s cached-wrapper branch renders exactly what was just returned — no second round trip, no `router.refresh()`. |
| 4 | A formula whose sources are unset renders blank, not `#ERROR — Unknown field: X`, on a record whose `custom_fields` is `{}` | ✓ VERIFIED | `src/lib/client-field-values.ts` seeds `null` for every active definition name before the stored blob is merged in — mirrors `buildFormulaFieldValues`'s server precedence exactly. `formula-engine.test.ts:428-444` (`absent key vs present-and-null (D-14/CFUI-03)`) pins the engine distinction this depends on with real `evaluateFormula` calls, not stubs. `custom-fields-section.tsx:55-58` wires `allFieldValues` from this helper, gated non-vacuously by `custom-fields-section.test.ts`. |
| 5 | A real Flight round-trip regression gate fails if an element ever again crosses the RSC boundary into an `asChild` slot alongside a growable data prop | ✓ VERIFIED | `field-dialog-boundary.rsc.test.tsx` imports `next/dist/compiled/react-server-dom-webpack/server.edge.js` directly and drives `renderToReadableStream` — the actual shipped serializer, not a mock. Confirmed running: it asserts the broken shape (`withElementChild`) defers at n=21 and the repaired shape (`dataOnly`) never defers at n=155. Runs in a real second vitest project (`vitest.rsc.config.ts`, `resolve.conditions: ['react-server']`), which I ran directly (`npx vitest run --config vitest.rsc.config.ts` → 2 files / 8 passed). |
| 6 | No React element crosses the server→client boundary at the repaired call site; fix is structural and size-independent | ✓ VERIFIED | `grep -c '<FieldDialog' src/app/admin/fields/[entityType]/page.tsx` → 0 (read directly). Both trigger sites (`AddFieldButton`, `RestoreFieldButton`) are built inside `'use client'` `add-field-button.tsx`, which itself renders `<FieldDialog>` client-to-client. `rsc-boundary.test.tsx`'s repo-wide scan (`describe('CFUI-01 class-wide …')`) walks all of `src/**/*.tsx` (excluding tests) for any non-client consumer of an `asChild`-forwarding component and asserts zero offenders — a real, non-vacuous, size-independent gate (confirmed `definers.length > 0` and `componentOf.size > 0` guard against a vacuous pass). |
| 7 | A formula on an activity resolves native activity fields (CFUI-04); the client evaluator applies the server's QuickJS resource bounds (CFUI-05) | ✓ VERIFIED | `src/app/activities/[id]/page.tsx:257-262` passes `entityAttributes={{Title, Notes, DueDate, CompletedAt}}`, matching `ENTITY_NATIVE_ATTRIBUTES.activity` in `formula-recalc.ts:124-129` key-for-key. `formula-engine.ts:101-107` declares `FORMULA_EVAL_MEMORY_LIMIT_BYTES = 8 MiB` / `FORMULA_EVAL_TIMEOUT_MS = 500`; both browser call sites (`formula-field.tsx:69-74`, `formula-editor.tsx:64`) pass `FORMULA_EVAL_OPTIONS` built from those constants. `client-formula-bounds.test.ts` asserts both the values and that every `evaluateFormula` call site in the two browser modules passes the bound (source-scan, not vacuous — asserts call count > 0 first). |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/app/admin/fields/[entityType]/page.tsx` | No `<FieldDialog`, renders `AddFieldButton`/`RestoreFieldButton`, keeps the admin authz gate | ✓ VERIFIED | Read directly. `await auth()` / `session.user.role !== 'admin'` / `notFound()` present at lines 17-20, unchanged in substance from pre-phase. Zero `<FieldDialog` occurrences. |
| `src/app/admin/fields/[entityType]/add-field-button.tsx` | Client wrapper owning both trigger element and `FieldDialog` | ✓ VERIFIED | `'use client'` at line 1; exports `AddFieldButton` and `RestoreFieldButton`; both render `<FieldDialog>` with a real `<Button>` element built inside the client module — never received as a prop. Contains no `auth(`/`session`/`role` token (checked by `rsc-boundary.test.tsx` and independently by me). |
| `src/lib/custom-fields.ts` (`saveFieldValues`) | Returns `{ success, values }` with the post-recalculation blob; D-05 swallow preserved; `stripFormulaKeys` runs before the write | ✓ VERIFIED | Lines 200-271: `stripFormulaKeys(values, definitions)` at line 216 runs before the `db.update`; `recalculateFormulas` result assigned to `recalculated`, falling back to `next` in a `catch` that only logs (D-05, lines 249-268); returns `{ success: true, values: recalculated }`. Live-tested via `POST /api/custom-fields/save` against the running container (see Method) — response matched DB exactly on two consecutive edits. |
| `src/lib/client-field-values.ts` (`buildClientFieldValues`) | Mirrors server's native→null-seed→unwrapped-stored precedence | ✓ VERIFIED | Three-pass implementation matches `buildFormulaFieldValues`'s order exactly; imports only `formula-helpers` (no `@/db`), confirmed by grep and by `client-formula-bounds.test.ts`'s db-import gate applying the same technique to a sibling file. |
| `src/lib/formula-engine.ts` (`FORMULA_EVAL_MEMORY_LIMIT_BYTES`/`FORMULA_EVAL_TIMEOUT_MS`) | Declared here (client-safe), re-exported from `formula-recalc.ts` | ✓ VERIFIED | `formula-engine.ts:101-107`; `formula-recalc.ts:162` re-exports both. `formula-recalc.test.ts:754-755` asserts `8 * 1024 * 1024` / `500` directly against the imported constants — a real drift alarm, not hollowed out. |
| `vitest.rsc.config.ts` + `field-dialog-boundary.rsc.test.tsx` | Real Flight serializer project, wired into `npm test` | ✓ VERIFIED | `package.json`: `"test": "vitest run && vitest run --config vitest.rsc.config.ts"`. Config sets `resolve.conditions: ['react-server']` and the SSR-level conditions needed for `react` itself to resolve. Ran both directly: base 868 passed/4 skipped, rsc 8/8 passed. |
| `src/app/activities/[id]/page.tsx` | Passes `entityAttributes` matching native activity columns | ✓ VERIFIED | Lines 252-263, matches `ENTITY_NATIVE_ATTRIBUTES.activity`. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `page.tsx` (server) | `AddFieldButton`/`RestoreFieldButton` (client) | data props only, no element prop | WIRED | Confirmed by source read and by live HTML fetch showing the button present at n=155/8/6/0. |
| `saveFieldValues` | `recalculateFormulas` | `try { … } catch` with D-05 fallback | WIRED | Live API round-trip: two consecutive edits both returned recomputed wrapper matching Postgres exactly. |
| `custom-fields-section.tsx` (`handleSave`) | `saveCustomFields` → `/api/custom-fields/save` | `fetch`, response consumed and used to replace `localValues` | WIRED | `result.values` replaces `localValues` (not merged), confirmed by source and by the live round-trip (no stale wrapper possible after this replace). |
| `custom-fields-section.tsx` (`allFieldValues`) | `buildClientFieldValues` | direct call in a `useMemo`, natives→null-seed→unwrap order | WIRED | Source read; non-vacuous source-scan test asserts the call site and argument shape. |
| `formula-field.tsx` / `formula-editor.tsx` | `FORMULA_EVAL_OPTIONS` | passed as 4th arg to every `evaluateFormula` call | WIRED | Both call sites confirmed by grep; `client-formula-bounds.test.ts` asserts call-count > 0 and zero unbounded calls. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `AddFieldButton` | `availableFields` (props) | `page.tsx`'s live `getAllFieldDefinitions()` query, filtered/projected | Yes — confirmed against the real 155-row `deal` table via live HTML fetch | ✓ FLOWING |
| `CustomFieldsSection`'s formula display | `localValues[definition.name]` | `saveCustomFields` → `/api/custom-fields/save` → `saveFieldValues` → `recalculateFormulas` → real Postgres row | Yes — live round-trip against the actual DB, not a fixture, produced matching wrapper values on two separate edits | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Add Field button renders on `/admin/fields/deal` at n=155 | Forged-cookie `curl` against the running container | `<button>` containing "Add Field" present, 1 match | ✓ PASS |
| Add Field button renders on person/organization/activity | Same, three more requests | 1 match each | ✓ PASS |
| Save API returns recomputed formula wrapper matching stored value | `POST /api/custom-fields/save` with a temporary `GSD Base Value`/`GSD Doubled` fixture, twice | Response and `SELECT custom_fields` agreed exactly both times (`value:6` then `value:42`) | ✓ PASS |
| Full test suite | `npx vitest run` (base) + `npx vitest run --config vitest.rsc.config.ts` | 868 passed/4 skipped + 8 passed = 876; one file (`condition-evaluator.test.ts`) failed once under contention, passed 70/70 in isolation | ✓ PASS (known pre-existing flake, see below) |
| Type check | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Lint | `npx eslint .` | 0 errors, 128 pre-existing warnings | ✓ PASS |
| No new dependencies | `git diff 114e2b1~1..19753ca -- package.json package-lock.json` | Only `package.json`'s `test` script line changed; zero lockfile diff | ✓ PASS |
| DB test-data cleanup | `psql` counts before and after my own live probes | 155 deal / 8 organization / 6 person, 0 `GSD*` — both before my probes and restored after | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` convention is used by this repository; the phase's equivalent
"probes" are the vitest gates covered above, all executed directly rather than trusted from
SUMMARY prose.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| CFUI-01 | 44-06, 44-08 | Add Field trigger renders on every entity, including Deals, regardless of definition count | ✓ SATISFIED | Live HTML fetch at n=155/8/6/0; structural fix confirmed in source; repo-wide gate confirmed non-vacuous |
| CFUI-02 | 44-02, 44-07 | Displayed formula value matches stored value without a page reload | ✓ SATISFIED | Live API round-trip against the real DB, twice, both matching exactly |
| CFUI-03 | 44-03, 44-07 | Unset formula source renders blank, not `#ERROR` | ✓ SATISFIED | `buildClientFieldValues` null-seeding confirmed in source; D-14 distinction pinned by a real-evaluator test |
| CFUI-04 | 44-04 | Activity formulas resolve native activity fields | ✓ SATISFIED | `activities/[id]/page.tsx` passes matching `entityAttributes` |
| CFUI-05 | 44-04 | Client evaluator applies server's QuickJS resource bounds | ✓ SATISFIED | Both browser call sites pass `FORMULA_EVAL_OPTIONS`; constants shared and drift-gated |

No orphaned requirements — `REQUIREMENTS.md` maps exactly CFUI-01..05 to Phase 44, all five appear in at least one plan's `requirements` field.

### Anti-Patterns Found

None. Checked every file the phase touched (`git diff 114e2b1~1..19753ca --name-only -- src/`, 24 files) for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/empty-implementation patterns — zero matches (the few `placeholder="..."` hits are ordinary JSX input placeholders, not debt markers).

### Known, Accurately-Documented Limitations (not gaps)

- **`condition-evaluator.test.ts` linearity assertion is contention-flaky** (backlog 999.28, `deferred-items.md` D1). Reproduced during this verification: failed once in a full-suite run (`11.4 < 10`), passed 70/70 in isolation immediately after. Pre-existing from Phase 34 (T-34-20), correctly not touched inside this phase, correctly captured as a backlog item rather than silently "fixed" or hidden.
- **`inline-edit.tsx` commits on Enter, not blur.** Read the component directly: there is an `onBlur` handler on the text input (`inline-edit.tsx:169-174`), but its guard (`if (!e.relatedTarget)`) means tabbing to another focusable element (which sets `relatedTarget`) does not trigger a save — matching the documented behavior exactly. Correctly scoped out of this phase.

## Gaps Summary

None. All seven roadmap success criteria and all five CFUI requirements were independently
verified against live source, a live running container with the real 155/8/6-definition
dataset, and a real (non-mocked) API round-trip — not merely against `44-09-SUMMARY.md`'s
self-report, though that report's specific claims (button presence, the 45,028 B → 22,353 B
measurement, the 876-test count, the flaky test's exact failure ratio) all matched independent
re-measurement here. No new packages were introduced. No debt markers were left in any file the
phase touched. The two known limitations already on record (999.28, and the inline-edit
Enter/blur behavior) are accurately described and correctly out of this phase's scope, not
under-reported gaps.

---
_Verified: 2026-08-15T17:21:07Z_
_Verifier: Claude (gsd-verifier)_
