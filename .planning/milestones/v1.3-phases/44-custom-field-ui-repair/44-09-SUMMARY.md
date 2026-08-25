# Plan 44-09 — Phase Verification — SUMMARY

**Executed:** 2026-08-15, by the orchestrator directly (not a subagent).
**Why not an executor agent:** this plan is almost entirely the two blocking
`checkpoint:human-verify` tasks. The orchestrator has browser automation and had already
performed the original E2E pass that found these defects, so it ran the checkpoints itself
rather than blocking. Every result below is a first-hand observation, not a delegated claim.

---

## Container rebuild

`docker compose up -d --build` against current master, then confirmed HTTP 200 and the
definition baseline (155 deal / 8 organization / 6 person) **before** touching anything.

This step is not ceremony. The original E2E pass was invalidated once by a container that
predated the code under test by ~1h45m, which produced a false CSV failure. Verifying a
runtime claim against a stale build is the specific mistake this phase exists downstream of.

---

## Automated gates

| Gate | Result |
|---|---|
| `npm test` (base project) | 56 files, **868 passed**, 4 skipped |
| `npm test` (rsc project) | 2 files, **8 passed** |
| **Total** | **876 passing** vs the 777 baseline — +99, no regressions |
| `npx tsc --noEmit` | exit 0 |
| `npx eslint .` | exit 0, 0 errors, 128 warnings (all pre-existing) |
| Working tree | clean |

---

## Browser verification — all four manual checkpoints

### CFUI-01 — the blocker (SC-1, SC-2, SC-6)

| Check | Result |
|---|---|
| Add Field trigger renders on `/admin/fields/deal` (155 definitions) | ✅ **present** — `headerChildren` is 2, was 1 |
| An admin can actually create a field there | ✅ created `GSD Temp Text` (text) through the dialog |
| Persisted server-side | ✅ confirmed in Postgres: `GSD Temp Text \| text \| deal` |
| Trigger still renders on person / organization / activity | ✅ all three `true` |
| Formula editor field-reference chips still work | ✅ `{{GSD Base Value}}` inserted at the cursor after the projection narrowing |

### The second CFUI-01 instance — archived Restore trigger

Plan 44-08 explicitly could not verify this at runtime ("`deal` has no archived definitions").
Closed here:

1. Archived `GSD Temp Text` via SQL — deliberately **not** through the UI, because
   `fields-list.tsx` uses a native `confirm()` which blocks browser automation.
2. Reloaded `/admin/fields/deal` → **Archived Fields** section and a **Restore** button rendered.
3. Clicked it → the dialog reads **`Restore "GSD Temp Text"` / "Restore this field? It will
   become available again on deal records." / [Restore Field]**.

This is the specific regression 44-08's Rule-1 deviation guarded against: it replaced
restore-vs-edit mode detection (`field?.deletedAt`, a column `AdminFieldRow` drops) with an
explicit `archived` prop. Had that prop been wrong, this dialog would have silently rendered an
**edit form** instead. It renders the restore prompt. ✅

### CFUI-03 — unset sources render blank (SC-4)

Created a new person (`custom_fields` = `{}`), opened it before setting anything:
`GSD Doubled` renders ***Empty***. Previously: `#ERROR — Unknown field: GSD Base Value`. ✅

### CFUI-02 — display agrees with storage, no reload (SC-3)

The failing scenario before this phase was specifically *edit after a fresh page load* — the
first edit in a new session was one save behind, because `formula-field.tsx` took its
stored-wrapper branch and `custom-fields-section.tsx` never refreshed it.

| Step | Displayed | Stored |
|---|---|---|
| Set base `21` on the fresh record | **42** | — |
| **Reloaded the page**, then set base `7` | **14** — immediately, no reload | — |
| Set base `3` | **6** — immediately | `6` |

Final cross-check in Postgres: `GSD Doubled.value = 6`, `GSD Base Value = 3`. Display and
storage agree exactly. ✅

Before this phase, the equivalent third step displayed a stale `14` while Postgres held `6`.

### Cleanup

Deleted the test person and all three `GSD*` definitions. Verified afterwards:
0 `GSD*` definitions, 0 `GSD*` people, **0 rows anywhere carrying the formula keys**, and the
definition baseline back to exactly **155 deal / 8 organization / 6 person**. ✅

---

## Success criteria

| SC | Verdict |
|---|---|
| 1. Add Field renders on deal (155 defs) and a field can be created — in a browser, live dataset | ✅ |
| 2. Trigger still renders on the other three; formula chips work | ✅ |
| 3. Formula display equals stored value after edit on a freshly loaded page, no reload | ✅ |
| 4. Unset sources render blank, not `#ERROR` | ✅ |
| 5. Real Flight round-trip gate, mutation-verified | ✅ 44-01 flipped the fixture to the pre-fix shape and confirmed a genuine failure |
| 6. No React element crosses the boundary; correct at any definition count | ✅ 44-06 — `page.tsx` contains no `<FieldDialog`; class-wide scan over 193 `.tsx` files finds zero offenders |
| 7. Activity formulas resolve native fields; client evaluator bounded | ✅ 44-04 |

---

## Notes carried forward

- **`condition-evaluator.test.ts` › "parsing is linear, not backtracking" (Phase 34 T-34-20) is
  contention-flaky.** It asserts a wall-clock *ratio* and misfired twice under parallel waves
  (once at `25.5 < 10`), while passing 70/70 in isolation and in every serial run here. Not
  introduced by this phase and not fixed by it — see `deferred-items.md`. Worth a backlog item.
- **44-08's payload measurement, through the real serializer at n=155:** full rows 45,028 B →
  projected rows 22,353 B (**−50.4 %**). The intuitive "add a separate slim array" measured
  58,681 B — *heavier* — empirically confirming the planner's correction of D-44-02's premise.
- The inline vitest `projects:` form does not work on vitest 4.0.18; `ssr.resolve.conditions`
  is load-bearing and appears nowhere in RESEARCH.md. History is a comment in
  `vitest.rsc.config.ts`.
