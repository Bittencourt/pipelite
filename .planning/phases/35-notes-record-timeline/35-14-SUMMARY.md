---
phase: 35-notes-record-timeline
plan: 14
subsystem: detail-pages
tags: [rsc, next-intl, custom-fields, formulas, cfui-01, cfui-03, notes, timeline, legacy-removal]

# Dependency graph
requires: ["35-03", "35-13"]
provides:
  - "The record timeline mounted on all four detail pages (deal, organization, person, activity)"
  - "The legacy read-only notes render block removed from the codebase entirely — zero occurrences remain"
affects: [35-15, 36, 37]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A server detail page mounts a server section component with two plain string props — no session, no prefetch and no field definitions at the call site; the section resolves its own session and its own first page"
    - "Deleting a rendered value while deliberately keeping the same value in `entityAttributes`: the render block and the formula attribute are two independent consumers of one column, and only the former goes"

key-files:
  created: []
  modified:
    - src/app/deals/[id]/page.tsx
    - src/app/organizations/[id]/page.tsx
    - src/app/people/[id]/page.tsx
    - src/app/activities/[id]/page.tsx

key-decisions:
  - "`RecordTimeline` is mounted immediately after `CustomFieldsSection` on every page including the organization page, where a 'People' card follows it — the plan's action text is explicit about the insertion point, and identical structure across four pages was preferred over 'history sits last' on the one page that has a fifth card"
  - "The `Notes:` key in each `entityAttributes` object now carries an inline comment naming CFUI-03, so the next reader who sees a dead-looking attribute beside a deleted render block has the reason in front of them rather than in a plan file"
  - "Three pre-existing unused imports (`Pencil`, and `EntityType` on two pages) were removed rather than left, because both tasks' acceptance criteria demand zero unused-import warnings for the edited files"

patterns-established:
  - "All four detail pages now have the same tail: details Card → CustomFieldsSection → RecordTimeline"

requirements-completed: [NOTE-01, NOTE-02, NOTE-03]

# Metrics
duration: 18min
completed: 2026-08-15
---

# Phase 35 Plan 14: Mount the Timeline on All Four Detail Pages Summary

**The legacy read-only notes box is gone from every detail page in the product and a live, writable timeline stands in its place — while the same `notes` column keeps feeding the live formula engine through `entityAttributes`, which is the one thing that had to survive the deletion.**

## Performance

- **Duration:** ~18 min
- **Tasks:** 2
- **Files modified:** 4
- **Tests:** no new tests; the suite stays at 1016 passed / 4 skipped plus 8 RSC, and the CFUI-01 gate passes 14/14 after each task

## Accomplishments

### Task 1 — the deal page (`828c172`)

The reference edit. Three things happened in one file, and it matters that they are three separate things:

1. **The legacy block was deleted, not hidden.** The whole `{deal.notes && (...)}` conditional went — the `mt-6 pt-6 border-t` wrapper, the `FileText` icon, the `t('notes')` label and the `whitespace-pre-wrap` paragraph. Not just the paragraph. Two competing notes surfaces on one page is the exact failure this phase exists to fix (T-35-36), and a hidden block is still a block.
2. **The `Notes:` entry in `entityAttributes` was left exactly where it was.** `buildClientFieldValues` seeds the client formula evaluation map from those keys; an absent key makes the engine answer "Unknown field" and render an error cell. That is CFUI-03, a regression this repo has already shipped and fixed once. The key now carries an inline comment saying so, because a formula attribute sitting next to a deleted render block looks like leftover debris to the next reader and would be "cleaned up" by someone acting in good faith.
3. **`RecordTimeline` was mounted after `CustomFieldsSection`**, inside the same `container py-8` wrapper, with `entityType="deal"` and `entityId={deal.id}`. Two plain strings. Nothing else — 35-13 built the card to resolve its own session and its own page one during the detail page's render, so there is no prefetch and no prop drilling at the call site.

The deal page is the only one of the four that gets the full timeline (notes + activities + stage changes), but that branching lives entirely inside the assembler's source selection from 35-08. This page passes the same two props as the other three, which is why all four call sites are byte-identical apart from the entity literal.

The now-unused `FileText` import was removed. `Pencil` was also removed — see Deviations.

### Task 2 — organization, person and activity (`3644ab5`)

The identical edit, three times. Each page lost its `mt-6 pt-6 border-t` conditional and its `FileText` import, kept its `Notes:` attribute (now commented), and gained `<RecordTimeline entityType="organization" | "person" | "activity" entityId={...} />` immediately after `CustomFieldsSection`.

The blocks were located by the `mt-6 pt-6 border-t` class string rather than by the line numbers in the UI-SPEC, as the plan instructs — and the line numbers had in fact already shifted on the deal page by the time task 2 ran, since task 1 shortened the file.

**Placement on the organization page.** It is the one page with a card after `CustomFieldsSection` (linked People), so "immediately after `CustomFieldsSection`" and "history sits last" are not the same position there. The plan's action text is explicit about the insertion point and the acceptance criterion only requires "positioned after `CustomFieldsSection`", so the timeline sits between the custom fields and the People card, keeping the four pages structurally identical. Flagged for 35-15 to settle in the browser if it reads wrong.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `node_modules` absent from the worktree**

- **Found during:** Task 1 setup
- **Issue:** The worktree ships without `node_modules`, so `npm run typecheck`, `npx vitest` and `npm run lint` — every verification gate in this plan — could not run. The same blocker 35-12 and 35-13 hit.
- **Fix:** Symlinked `node_modules` to the main checkout's. No package was installed, added or resolved; the symlink is gitignored and untracked.
- **Files modified:** none (untracked symlink)

**2. [Rule 3 - Blocking] Three pre-existing unused imports failed the acceptance criteria**

- **Found during:** Task 1 (`Pencil`), Task 2 (`EntityType` on the organization and person pages)
- **Issue:** Both tasks' acceptance criteria require zero unused-import warnings for the edited files. `FileText` became unused because of this plan's deletion and was always going to go, but `Pencil` and the two `EntityType` type imports were already unused at the base commit — verified against `git show HEAD:<file>`. Leaving them would have failed the stated criterion on files this plan is responsible for.
- **Fix:** Removed all three. Each is a single identifier in an import list with zero references in its file; `npm run typecheck` and `npx eslint` were re-run after each removal.
- **Files modified:** `src/app/deals/[id]/page.tsx`, `src/app/organizations/[id]/page.tsx`, `src/app/people/[id]/page.tsx`
- **Commits:** `828c172`, `3644ab5`
- **Note:** this is a deliberate, narrow exception to the "do not fix pre-existing warnings" scope boundary, taken because the acceptance criteria name these exact files. The repo-wide warning count went 128 → 125; no unrelated file was touched.

### Intentional Interpretations

- **The timeline sits before the People card on the organization page**, per the plan's explicit insertion point, rather than last on the page per the UI-SPEC's "history sits last" rationale. Both readings satisfy the acceptance criterion; identical structure across four call sites won the tie. 35-15 can move it in one line if the browser check disagrees.
- **Each `Notes:` attribute gained an inline comment naming CFUI-03.** The plan only required the key to survive. The comment exists because the deletion above it removes the only visible reason the key is there, and the failure mode if someone deletes it later is a silently broken formula cell, not a build error.

### Accepted Consequence — record this, it is inherited state

**Formulas referencing `Notes` now freeze at their migration-time value.**

The legacy `notes` column is dormant as of this plan: nothing writes to it any more, because the surface that displayed it is gone and new notes go to the notes table. But the `Notes` formula attribute still reads that column, on all four entity types (`src/lib/formula-recalc.ts`). So a formula like `IF(Notes = "", ...)` keeps evaluating — it just evaluates against whatever the column held at migration time, forever.

This is not a bug to fix here, and it was not fixed here:

- **Dropping the column is deferred** — the migration keeps it as the rollback path.
- **Re-pointing the `Notes` attribute at the notes feed is a semantic change nobody has decided.** Which note? The newest? All of them concatenated? A count? Each answer is a different product decision, and each would silently change the value of every live formula that references `Notes` in every existing record.

Stated out loud so the next phase inherits a known state rather than discovering a surprise.

### Deferred Items

- **The `Notes` formula attribute is now decoupled from what users see.** Whoever resolves the frozen-value consequence above should decide it as a product question first, then implement — see the paragraph above for the three candidate semantics.
- **Migrated-note rendering (SC-3) is asserted structurally here, not observed.** The `Migrated` badge is 35-11's, the migration is 35-03's, and this plan only mounts the card that shows them. Browser confirmation that a record with legacy notes displays that text as the oldest entry with the badge belongs to 35-15.

### Notes for Downstream Plans

- **All four pages now end with the same three-element tail:** details `Card` → `CustomFieldsSection` → `RecordTimeline`. A future section goes after the timeline or it breaks that symmetry.
- **`grep -c "mt-6 pt-6 border-t"` returns 0 across the whole repo.** If it ever returns nonzero on a detail page again, a legacy notes block has been reintroduced.
- **Do not remove `Notes:` from any `entityAttributes` object** until the frozen-value consequence above is resolved. The inline comment on each of the four is the guard.

## Known Stubs

None. All four pages are fully wired: `RecordTimeline` reads real data through the 35-08 assembler and renders the real 35-13 card. No placeholder, no mock data, no hardcoded empty value was introduced.

## Threat Flags

None. No new network endpoint, auth path, file access pattern or schema change. These four pages gained one import and one element each; the element is a server component that reads the existing session and the existing assembler.

## Threat Model Coverage

| Threat ID | Disposition | How it is met here |
|-----------|-------------|--------------------|
| T-35-35 | mitigate | Only the rendered block was deleted. `Notes:` survives in `entityAttributes` on all four pages, grep-verified per file and commented inline against future removal |
| T-35-30 | mitigate | `RecordTimeline` receives two plain string props from each server page; zero React elements and zero functions cross the boundary. The class-wide `asChild` gate was re-run after both tasks, 14/14 each time |
| T-35-36 | mitigate | The legacy block is deleted, not hidden — `mt-6 pt-6 border-t` returns zero matches on all four files, so there is no dormant surface a user could write into |
| T-35-SC | accept | Zero packages installed; `node_modules` was symlinked, not resolved |

## Verification

| Gate | Result |
|------|--------|
| `npm run typecheck` | clean after each task |
| `npx eslint` on each edited file | no issues found, all four |
| `npm run lint` (repo) | 0 errors, 125 warnings — down from the 128 pre-existing that 35-11/12/13 recorded, because this plan removed 3 unused imports; none in the edited files |
| CFUI-01 `rsc-boundary.test.tsx` | 14 passed / 0 failed, after each task |
| `npm test` (both vitest projects) | 1016 passed / 4 skipped, plus 8 RSC — no regressions |
| `DEAL_PAGE_WIRED` (`RecordTimeline` + `Notes:` both present) | true |
| `LEGACY_BLOCK_GONE` (`mt-6 pt-6 border-t` count) | 0 on all four files |
| `ALL_THREE_PAGES_WIRED` | true |
| `ALL_FOUR_PAGES` (files referencing `RecordTimeline` across the four route dirs) | exactly 4 |
| `entityType` literals | `deal`, `organization`, `person`, `activity` — one each |
| Conditional render of the record's `notes` value | 0 on all four files; `notes` now appears only inside `entityAttributes` |
| Post-commit deletion check | no tracked file deleted by either commit |

## UI-SPEC Compliance

| Requirement | Status |
|-------------|--------|
| Placement: details Card → `CustomFieldsSection` → Timeline Card | met on all four; on the organization page the People card follows the timeline (see Intentional Interpretations) |
| `mt-6` (24px) gap before the timeline card | inherited from `RecordTimeline`'s own `Card className="mt-6"` (35-13) |
| Legacy removal mandatory at all four sites | met — zero occurrences of the class string remain |
| `notes` stays in `entityAttributes` | met on all four |

## Self-Check: PASSED

- `src/app/deals/[id]/page.tsx` — FOUND
- `src/app/organizations/[id]/page.tsx` — FOUND
- `src/app/people/[id]/page.tsx` — FOUND
- `src/app/activities/[id]/page.tsx` — FOUND
- Commit `828c172` — FOUND
- Commit `3644ab5` — FOUND
