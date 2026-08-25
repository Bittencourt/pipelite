---
phase: 32-test-infrastructure-ci
plan: 04
subsystem: infra
tags: [eslint, react-compiler, react-hooks, jsx, lint-gate]

# Dependency graph
requires:
  - phase: 32-test-infrastructure-ci
    provides: "The eslint error inventory (28 errors) captured in 32-RESEARCH.md that this plan clears 13 of"
provides:
  - "Zero react/no-unescaped-entities errors — 8 literal quotes escaped as &quot; in JSX text"
  - "Zero react-hooks/* errors — 5 React Compiler findings suppressed with scoped, written justifications"
  - "Five auditable, greppable suppression sites for Plan 32-05 to convert into a single backlog entry"
affects: [32-05-ci-workflow, future UI-focused phase that owns the React Compiler refactors]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scoped lint suppression with mandatory written reason via ESLint description syntax (`-- <reason>`)"

key-files:
  created: []
  modified:
    - src/app/activities/activity-list.tsx
    - src/app/admin/pipelines/[id]/stage-configurator.tsx
    - src/app/deals/deal-card.tsx
    - src/components/custom-fields/formula-editor.tsx
    - src/app/(auth)/reset-password/page.tsx
    - src/app/(auth)/verify-email/page.tsx
    - src/app/settings/profile/profile-settings-form.tsx
    - src/components/ui/relative-time.tsx
    - src/app/import/import-wizard.tsx

key-decisions:
  - "Used &quot; (not &ldquo;/&rdquo;) so rendered copy stays character-identical — no snapshot, translation, or visual expectation shifts"
  - "Each React Compiler suppression is a single-site disable-next-line with a site-specific reason; eslint.config.mjs was not touched and no rule was downgraded (D-02, D-03)"
  - "No effect logic was refactored — every added line in the five React Compiler files is a comment"

patterns-established:
  - "Suppression-with-reason: any react-hooks/* disable must name the rule, sit on the line above the finding, and explain (a) what the code actually does, (b) why the mechanical fix is unsafe here, (c) that a real fix is deferred"

requirements-completed: [CI-04]

# Metrics
duration: 16min
completed: 2026-08-14
---

# Phase 32 Plan 04: React/JSX Lint Errors Summary

**13 of the repo's 28 eslint errors cleared: 8 literal JSX quotes escaped to `&quot;` and 5 React Compiler findings suppressed with per-site written justifications, with no rule downgraded and no effect logic touched.**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-08-14T11:51:00Z
- **Completed:** 2026-08-14T12:07:29Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- All 8 `react/no-unescaped-entities` errors gone — one-character-per-site substitution across 4 lines in 4 files, rendered copy unchanged (`&quot;` renders as `"`).
- All 5 `react-hooks/*` React Compiler errors gone via exactly 5 `// eslint-disable-next-line <rule> -- <reason>` comments, each with a justification specific to what that effect actually does.
- The lint gate stays real: `eslint.config.mjs` untouched, the five React Compiler rules remain at `error` severity project-wide, so the sixth occurrence will still fail CI.
- Verified end state across all 9 files: **0 errors**, 7 pre-existing warnings (`no-unused-vars` class, non-gating), `tsc --noEmit` exit 0.

## Task Commits

1. **Task 1: Escape the eight literal quotes in JSX text (D-01)** — `1ad2ee8` (fix)
2. **Task 2: Suppress the five React Compiler findings with written reasons (D-02)** — `280aec1` (chore)

## Files Created/Modified

### Task 1 — quote escaping (4 files, 1 line each, 8 substitutions total)

- `src/app/activities/activity-list.tsx:516` — delete-confirmation `AlertDialogDescription`, quotes wrapping `{activityToDelete?.title}`
- `src/app/admin/pipelines/[id]/stage-configurator.tsx:288` — empty-state message, quotes wrapping the literal label `Add Stage`
- `src/app/deals/deal-card.tsx:264` — delete-confirmation `AlertDialogDescription`, quotes wrapping `{deal.title}`
- `src/components/custom-fields/formula-editor.tsx:156` — hint line, quotes wrapping the literal label `Test`

### Task 2 — suppression sites (5 files, 1 comment each)

## Suppression Register (for Plan 32-05 to backlog)

All five are deferred to a UI-focused phase with UI coverage, per D-02 and CONTEXT.md § Deferred Ideas.

| # | File:Line | Rule | Written reason (condensed) |
|---|-----------|------|---------------------------|
| 1 | `src/app/(auth)/reset-password/page.tsx:42` | `react-hooks/set-state-in-effect` | The missing-token case derives from `useSearchParams` (client-only), so the "invalid reset link" state can't be computed during render without breaking the page's Suspense boundary; removing the effect-set means deriving `status`/`error` from `token` at render and reworking the four-way status union — changes auth error UX with zero UI coverage. |
| 2 | `src/app/(auth)/verify-email/page.tsx:20` | `react-hooks/immutability` | `verifyEmail` is a `const` arrow declared *below* the effect, so the compiler sees a binding read before initialization. Hoisting it or wrapping it in `useCallback` changes identity semantics for a fetch that must fire exactly once per token — a double-fire consumes the single-use token and shows a spurious "Verification failed". |
| 3 | `src/app/settings/profile/profile-settings-form.tsx:38` | `react-hooks/set-state-in-effect` | The effect re-syncs `locale`/`timezone` when the server-provided `initialSettings` prop arrives/changes while still letting in-between user Select changes win. Replacing it needs either a parent-driven `key` remount or lifting both values up — both alter when in-flight optimistic changes get discarded during a save. |
| 4 | `src/components/ui/relative-time.tsx:17` | `react-hooks/set-state-in-effect` | The `mounted` flag is a deliberate SSR/CSR hydration guard: first paint must render an absolute date so server and client HTML match, and only the post-hydration render may switch to the time-dependent relative string. Removing it means moving to `useSyncExternalStore` and re-verifying hydration on every list that renders timestamps. |
| 5 | `src/app/import/import-wizard.tsx:91` | `react-hooks/preserve-manual-memoization` | The compiler infers a `customFieldTypes` dependency the manual array `[rawData, mapping, entityType]` omits. Adding it re-creates the callback whenever `customFieldsByEntity` changes identity, re-running mapping/validation and potentially pushing the wizard back to preview mid-edit — needs step-transition tests the import wizard doesn't have. |

Grep the live set at any time with:
`grep -rn 'eslint-disable-next-line react-hooks/' src/`

## Decisions Made

- **`&quot;` over typographic quotes.** D-01 only asks for the error to go away; `&ldquo;`/`&rdquo;` would silently change the rendered glyph. `&quot;` renders as the identical `"` character.
- **Suppression comment placement inside the effect body, not above the `useEffect` call.** The React Compiler rules report at the `setState`/call node, so the `disable-next-line` sits directly above the offending statement — this keeps the suppression scoped to one statement rather than the whole hook. Verified: eslint reports no unused-disable-directive for any of the five.
- **No rule-level or file-level disable.** D-02/D-03 reject them; `eslint.config.mjs` is absent from this plan's diff (`git diff --name-only` over both commits lists only the 9 source files).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created a `node_modules` symlink into the worktree**
- **Found during:** Task 1 (verification step)
- **Issue:** The git worktree had no `node_modules`, so `node ./node_modules/eslint/bin/eslint.js` and `node ./node_modules/typescript/bin/tsc` both failed with `Cannot find module` — every acceptance criterion in the plan is expressed as one of those two commands, so no task could be verified.
- **Fix:** `ln -s /home/pedro/programming/pipelite/node_modules <worktree>/node_modules`. No package was installed, downloaded, or resolved — this reuses the already-installed, lockfile-exact tree from the main checkout (the package-legitimacy gate has nothing to audit).
- **Files modified:** none tracked. `node_modules` is gitignored; the symlink never appeared in `git status` and is not in either commit.
- **Verification:** `git status --short` clean apart from the intended source edits; both commits contain only `.tsx` files.
- **Committed in:** not committed (untracked, gitignored artifact of the worktree environment).

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Environmental only — restored the ability to run the plan's own verification commands. Zero effect on the delivered diff.

## Issues Encountered

- The `rtk` shell hook mangles `grep -c` output (prints a match summary instead of a count) and swallowed the first eslint invocation's stderr. Worked around by writing eslint's `--format json` output to a scratch file and counting `severity === 2` messages with `node -e`, which is exact and hook-proof.

## Verification Evidence

```
eslint --format json over all 9 files   -> exit 0, errors=0, warnings=7 (pre-existing no-unused-vars class)
tsc --noEmit                            -> exit 0
added lines across both commits         -> 4 quote lines (4 removed, 4 added) + 5 comment lines
added lines that are NOT comments       -> 0  (no effect logic changed)
eslint-disable-next-line react-hooks/   -> 5 added, 5 with ' -- ' reason
blanket / file-level / block disables   -> 0
eslint.config.mjs in git diff           -> 0
```

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, file access, or schema surface. T-32-17 (`&quot;` escaping) was accepted in the plan and remains accurate: interpolation of `{deal.title}` / `{activityToDelete?.title}` is unchanged, React still escapes those values, and no `dangerouslySetInnerHTML` was introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 13 of the 28 eslint errors are cleared. The remaining 15 belong to Plans 32-02 and 32-03 (`no-explicit-any` ×12, `no-unsafe-function-type` ×1, `prefer-const` ×2); once those land, `npm run lint` should exit 0 and the Plan 32-05 CI workflow can be green on its first run.
- **Action for Plan 32-05:** turn the five rows of the Suppression Register above into one backlog entry ("proper fix for the 5 React Compiler findings — needs UI test coverage").
- No blockers.

## Self-Check: PASSED

- All 9 modified files exist and are present in the commit range `12ba143..HEAD` (verified with `git diff --name-only`).
- All 3 commits exist: `1ad2ee8`, `280aec1`, `49e8463`.
- No file outside this plan's `files_modified` was touched — `vitest.config.ts`, `package.json`, `eslint.config.mjs`, `src/app/api/**`, `STATE.md`, and `ROADMAP.md` are all absent from the diff.
- Working tree clean.

---
*Phase: 32-test-infrastructure-ci*
*Completed: 2026-08-14*
