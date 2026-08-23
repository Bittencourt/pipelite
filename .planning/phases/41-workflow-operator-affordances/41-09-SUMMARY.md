---
phase: 41-workflow-operator-affordances
plan: 09
subsystem: ui
tags: [notification-preferences, zod, drizzle-upsert, next-intl, source-scan-gate, checkbox]

# Dependency graph
requires:
  - phase: 41-workflow-operator-affordances
    provides: "41-01's notification_preferences.email_workflow_failed column (NOT NULL DEFAULT true, migration 0019, already applied)"
  - phase: 41-workflow-operator-affordances
    provides: "41-03's settings.notifications.workflowFailed / workflowFailedDescription strings in all three locales"
provides:
  - "emailWorkflowFailed threaded through all five edit points in src/app/settings/notifications/actions.ts"
  - "a user-facing off switch for workflow-failure emails, third of four rows on the notification settings page"
  - "a count-parity source-scan gate that catches the .values/onConflictDoUpdate.set drift class"
affects: [41-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "count-parity source scan: assert a new field appears exactly as many times as a known-good sibling, rather than a hardcoded N"
    - "a code comment beside the upsert set block as the durable form of what the gate asserts"

key-files:
  created: []
  modified:
    - src/app/settings/notifications/actions.ts
    - src/app/settings/notifications/notification-form.tsx
    - src/app/settings/notifications/actions.test.ts

key-decisions:
  - "The mirrored zod schema in actions.test.ts was KEPT as a mirror, not converted to a real import — actions.ts is \"use server\" and pulls @/auth. The drift risk that creates is closed by the source-scan gate added beside it, not by removing the mirror."
  - "Count parity with emailWeeklyDigest (8 occurrences each) is the gate, not a hardcoded 5 — it survives a refactor that changes the number of edit points, and it cannot pass vacuously because the sibling count is asserted non-zero first."
  - "handleToggle call sites are counted with the marker handleToggle(\"  — the declaration is handleToggle(key: …, so the bare handleToggle( marker would have counted 5 for 4 rows."
  - "emailWorkflowFailed is required on the wire (no .optional(), no .default()) so a stale client cannot omit it and have the upsert write a server default over the user's choice."

patterns-established:
  - "Upsert field-pair comment: any actions file whose insert repeats its field list in onConflictDoUpdate.set carries a comment naming the silent-drift trap."
  - "New-row structural identity gate: assert the shared wrapper/label/description class strings each occur exactly N times, so the new row is a copy rather than a variation."

requirements-completed: [WFOPS-03]

# Metrics
duration: 24min
completed: 2026-08-22
---

# Phase 41 Plan 09: Workflow-Failure Email Preference Summary

**`emailWorkflowFailed` threaded through all five edit points of the notification-preferences upsert, plus a fourth peer-level checkbox row positioned third of four, gated by a count-parity source scan that catches the `.values`/`onConflictDoUpdate.set` drift class.**

## Performance

- **Duration:** ~24 min
- **Started:** 2026-08-22
- **Completed:** 2026-08-22
- **Tasks:** 2 (both TDD, 4 commits)
- **Files modified:** 3

## Accomplishments

- All five edit points in `actions.ts` carry `emailWorkflowFailed`: the zod schema, `defaultPreferences`, the `getNotificationPreferences` select map, the insert `.values({…})`, and the `onConflictDoUpdate.set({…})`. Observed occurrence count: **8**, exactly matching `emailWeeklyDigest`'s **8**.
- The notification settings page has a fourth row, byte-identical in structure to the three that exist, positioned between "Activity reminders" and "Weekly digest".
- `defaultPreferences.emailWorkflowFailed === true` is asserted with a failure message naming 41-08's absent-row-means-send contract, so the settings UI and the alert path cannot drift apart silently.
- The upsert's duplicated field list now carries a comment recording the trap, so the next person adding a preference sees it without reading the test.

## Task Commits

1. **Task 1 (RED): five-edit-point gate** — `24a0386` (test)
2. **Task 1 (GREEN): thread emailWorkflowFailed through actions.ts** — `167a473` (feat)
3. **Task 2 (RED): form source-scan gate** — `8bb0f19` (test)
4. **Task 2 (GREEN): the fourth checkbox row** — `0dd58fe` (feat)

No REFACTOR commit — the row is a deliberate byte-for-byte copy of its sibling and there was nothing to clean up.

## RED counts (as required by the plan's output spec)

| Task | RED run | Failing | Passing |
|------|---------|---------|---------|
| 1 | after extending `actions.test.ts`, before editing `actions.ts` | **2** | 12 |
| 2 | after adding the form scan, before editing `notification-form.tsx` | **9** | 19 |

Task 1's RED is 2 rather than 6 because the four mirrored-schema cases exercise the mirror that lives in the test file itself, so they were green the moment they were written. **Only the source-scan cases can go RED against `actions.ts`** — which is precisely the argument for keeping the source scan beside the mirror. Both failures were the drift gate: `emailWorkflowFailed` observed at 0 against a required ≥5, and at 0 against `emailWeeklyDigest`'s 8.

## Files Created/Modified

- `src/app/settings/notifications/actions.ts` — five additions of `emailWorkflowFailed`; a comment on `defaultPreferences` explaining the opt-OUT default, and a comment above `onConflictDoUpdate` naming the duplicated-field-list trap. `revalidatePath`, the auth gate, the return shape and the order of the existing three fields are untouched.
- `src/app/settings/notifications/notification-form.tsx` — one 15-line row inserted between the `activity-reminder` and `weekly-digest` rows. Exactly three things differ from its source row: the `id`/`htmlFor`, the state key and handler argument, and the two translator keys.
- `src/app/settings/notifications/actions.test.ts` — 22 new cases across two describe blocks; `Object.entries` changed to `Object.values` in a pre-existing loop whose `key` binding was unused.

## Decisions Made

See `key-decisions` in the frontmatter. The load-bearing one for a reviewer: **the mirrored schema was kept, and the source-scan drift gate was added beside it rather than replacing it.** A reviewer who reads the source scan as redundant with the mirrored cases has it backwards — the mirror cannot detect a change in `actions.ts` at all, which is why the RED count for task 1 is 2 and not 6.

## Deviations from Plan

None — plan executed exactly as written. No Rule 1/2/3 auto-fixes were needed and no Rule 4 architectural question arose.

One micro-adjustment inside the plan's own instructions, recorded for transparency rather than as a deviation: the plan's behavior block asks for "the number of `handleToggle(` call sites is FOUR". The literal string `handleToggle(` occurs five times in the finished file, because the function declaration is `function handleToggle(key: …)`. The gate therefore counts `handleToggle("`, which matches call sites only. The asserted invariant — four rows, four call sites, no fifth path — is unchanged; only the marker is narrowed, and a comment in the test records why.

## Constraints honoured

- `src/messages/*.json` and `src/messages/locale-parity.test.ts` **not touched** — `git diff --name-only c747ed3 HEAD -- src/messages/` is empty. The two strings 41-03 wrote were consumed as-is; the exact-contract `toEqual` in the parity suite still passes.
- `git diff --name-only c747ed3 HEAD -- src/components/ui/` is empty (UI-SPEC G-7). No `npx shadcn add` — `Checkbox` and `Label` were already present (T-41-SC).
- No migration generated or applied; no Docker restart; no `npm install`.
- `STATE.md` and `ROADMAP.md` untouched — the orchestrator owns those writes.
- The whole diff is three files, all under `src/app/settings/notifications/`.

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run src/app/settings/notifications/ src/messages/locale-parity.test.ts` | **50 passed, 0 failed** |
| `npx vitest run` (full unit suite) | **4033 passed, 0 failed** (baseline 4011 + 22 new cases) |
| `npx vitest run --config vitest.rsc.config.ts` | **8 passed, 0 failed** |
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **0 errors, 124 warnings** (baseline ≤127; one `no-unused-vars` warning retired by the `Object.values` change) |
| `emailWorkflowFailed` vs `emailWeeklyDigest` in `actions.ts` | **8 vs 8** |
| `git diff` scope | 3 files, none in `src/components/ui/` or `src/messages/` |

## Issues Encountered

The worktree branched from the stale base `aa01de2` — the fifth consecutive worktree in this phase to do so. Corrected with the sanctioned `git reset --hard c747ed3` from the branch check before any other action, then verified `HEAD == c747ed3`.

## User Setup Required

None.

## Next Phase Readiness

- **41-08 can rely on this contract:** an absent `notification_preferences` row means workflow-failure email is ENABLED, and the settings page renders that as checked. `defaultPreferences.emailWorkflowFailed === true` is now asserted with that reason in its failure message, so a future change on either side breaks a test that explains the other side.
- The failure-alert read path must consult `emailWorkflowFailed` on the user's row; the column, the write path and the UI are all in place for it.
- No blockers.

## Self-Check: PASSED

- Files verified present on disk: `actions.ts`, `notification-form.tsx`, `actions.test.ts`, `41-09-SUMMARY.md`
- Commits verified in `git log c747ed3..HEAD`: `24a0386`, `167a473`, `8bb0f19`, `0dd58fe` (+ this docs commit)
- `git status --short` clean; no deletions in any commit; no untracked files
- No stubs: both new strings resolve through `useTranslations`, the checkbox is bound to real state, and the value round-trips form → zod → insert → set → select map
- No threat flags: this plan adds a boolean field to an existing, already-authenticated upsert whose `userId` still comes from `session.user.id`. No new endpoint, auth path, file access or trust boundary.

---
*Phase: 41-workflow-operator-affordances*
*Completed: 2026-08-22*
